/**
 * memory-db.ts — Turso embedded DB client for the @browsercore agentic memory system.
 *
 * Connection: local .memory/browsercore.db file.
 * Schema: scripts/memory-schema.sql
 * Vector: all-MiniLM-L6-v2, 384d, stored as JSON text.
 *
 * Adapted from hospitality-ops/apps/api/src/lib/memory-db.ts
 */

import { connect, type Connection } from "@tursodatabase/database";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

let _db: Connection | null = null;

export async function getMemoryDb(path = ".memory/browsercore.db"): Promise<Connection> {
    if (_db) { return _db; }
    _db = await connect(path);
    return _db;
}

export async function closeMemoryDb(): Promise<void> {
    if (_db) {
        await _db.close();
        _db = null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export async function initSchema(db: Connection): Promise<void> {
    const schemaPath = join(__dirname, "memory-schema.sql");
    const sql = readFileSync(schemaPath, "utf8");
    // Execute each statement separately
    const statements = sql.split(";").filter((s) => s.trim().length > 0);
    for (const stmt of statements) {
        await db.exec(stmt + ";");
    }
}

export async function ensureSchema(db: Connection): Promise<void> {
    const result = (await db.prepare(
        "SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name='facts'",
    ).get()) as { c: number };
    if (result.c === 0) {
        await initSchema(db);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type Scope = "architecture" | "contracts" | "patterns" | "operational" | "bugs";
export type Stability = "stable" | "evolving" | "experimental";
export type TaskStatus = "pending" | "in_progress" | "done" | "failed" | "cancelled";

export interface FactRow {
    id: string;
    scope: Scope;
    statement: string;
    stability: Stability;
    base_confidence: number;
    weight: number;
    coupling: string | null;
    detail: string | null;
    agents_must_know: string | null;
    superseded_by: string | null;
    created_at: number;
    updated_at: number;
    last_verified_at: number | null;
    verification_count: number;
}

export interface TaskRow {
    id: string;
    title: string;
    description: string | null;
    repo: string;
    status: TaskStatus;
    started_at: number | null;
    finished_at: number | null;
    facts_touched: number;
}

export interface QuestionRow {
    id: string;
    title: string;
    context: string;
    the_question: string;
    impact_if_wrong: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// EMBEDDING
// ═══════════════════════════════════════════════════════════════════════════

type EmbedFn = (text: string) => Promise<Float32Array>;
let _embedder: EmbedFn | null = null;

export async function getEmbedder(): Promise<EmbedFn> {
    if (!_embedder) {
        const { pipeline } = await import("@xenova/transformers");
        const pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", {
            quantized: true,
        });
        _embedder = async (text: string): Promise<Float32Array> => {
            const result = await pipe(text, { pooling: "mean", normalize: true });
            return result.data as Float32Array;
        };
    }
    return _embedder;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD — FACTS
// ═══════════════════════════════════════════════════════════════════════════

export async function createFact(
    db: Connection,
    params: {
        id: string;
        scope: Scope;
        statement: string;
        stability?: Stability;
        base_confidence: number;
        coupling?: string;
        detail?: string;
        agents_must_know?: string;
    },
): Promise<void> {
    const stability = params.stability ?? "stable";
    const now = Math.floor(Date.now() / 1000);

    let embeddingJson: string | null = null;
    try {
        const embed = await getEmbedder();
        const embedding = await embed(params.statement);
        embeddingJson = JSON.stringify(Array.from(embedding));
    } catch {
        // Embedding optional
    }

    await db.prepare(`
        INSERT INTO facts (id, scope, statement, stability, base_confidence, weight,
                          coupling, detail, agents_must_know, created_at, updated_at,
                          verification_count, embedding, embedding_model)
        VALUES (?, ?, ?, ?, ?, 1.0, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(
        params.id, params.scope, params.statement, stability, params.base_confidence,
        params.coupling ?? null, params.detail ?? null, params.agents_must_know ?? null,
        now, now, embeddingJson,
        embeddingJson ? "all-MiniLM-L6-v2" : null,
    );

    // Sync FTS mirror
    await db.prepare(
        "INSERT INTO facts_fts (fact_id, statement, detail) VALUES (?, ?, ?)",
    ).run(params.id, params.statement, params.detail ?? "");
}

export async function getFact(db: Connection, id: string): Promise<FactRow | null> {
    const result = await db.prepare("SELECT * FROM facts WHERE id = ?").get(id);
    return (result as FactRow) ?? null;
}

export async function listFacts(
    db: Connection,
    options: { scope?: Scope; minWeight?: number; limit?: number } = {},
): Promise<FactRow[]> {
    const conditions: string[] = ["superseded_by IS NULL"];
    const binds: unknown[] = [];

    if (options.scope) {
        conditions.push("scope = ?");
        binds.push(options.scope);
    }
    if (options.minWeight !== undefined) {
        conditions.push("weight >= ?");
        binds.push(options.minWeight);
    }

    binds.push(options.limit ?? 100);

    const sql = `
        SELECT * FROM facts
        WHERE ${conditions.join(" AND ")}
        ORDER BY weight DESC
        LIMIT ?
    `;

    return (await db.prepare(sql).all(...binds)) as FactRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CRUD — TASKS
// ═══════════════════════════════════════════════════════════════════════════

export async function createTask(
    db: Connection,
    params: { id: string; title: string; description?: string; repo?: string },
): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare(`
        INSERT INTO tasks (id, title, description, repo, status, started_at, created_at)
        VALUES (?, ?, ?, ?, 'in_progress', ?, ?)
    `).run(params.id, params.title, params.description ?? null, params.repo ?? "", now, now);
}

export async function getActiveTasks(db: Connection): Promise<TaskRow[]> {
    const rows = (await db.prepare(`
        SELECT t.id, t.title, t.description, t.repo, t.status,
               t.started_at, t.finished_at,
               COUNT(tf.fact_id) as facts_touched
        FROM tasks t
        LEFT JOIN task_facts tf ON tf.task_id = t.id
        WHERE t.status = 'in_progress'
        GROUP BY t.id
        ORDER BY t.started_at DESC
    `).all()) as TaskRow[];
    return rows;
}

export async function finishTask(
    db: Connection,
    id: string,
    status: "done" | "failed" | "cancelled",
): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.prepare("UPDATE tasks SET status = ?, finished_at = ? WHERE id = ?").run(status, now, id);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function getOpenQuestions(db: Connection): Promise<QuestionRow[]> {
    return (await db.prepare(`
        SELECT id, title, context, the_question, impact_if_wrong
        FROM questions
        WHERE status = 'open'
        ORDER BY created_at DESC
    `).all()) as QuestionRow[];
}

// ═══════════════════════════════════════════════════════════════════════════
// RECENT EVIDENCE
// ═══════════════════════════════════════════════════════════════════════════

export async function getRecentEvidence(
    db: Connection,
    sinceSeconds: number,
): Promise<{ id: string; fact_id: string; observation: string; observed_at: number; observed_by: string | null }[]> {
    const cutoff = Math.floor(Date.now() / 1000) - sinceSeconds;
    return (await db.prepare(`
        SELECT id, fact_id, observation, observed_at, observed_by
        FROM evidence
        WHERE observed_at >= ?
        ORDER BY observed_at DESC
        LIMIT 10
    `).all(cutoff)) as { id: string; fact_id: string; observation: string; observed_at: number; observed_by: string | null }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HYBRID SEARCH (vector + keyword + RRF)
// ═══════════════════════════════════════════════════════════════════════════

const RRF_K = 60;

export interface SearchResult {
    id: string;
    scope: string;
    statement: string;
    weight: number;
    verification_count: number;
    score: number;
}

export async function hybridSearch(
    db: Connection,
    query: string,
    k = 7,
): Promise<SearchResult[]> {
    // Generate query embedding
    let queryEmbedding: number[] | null = null;
    try {
        const embed = await getEmbedder();
        const embedding = await embed(query);
        queryEmbedding = Array.from(embedding);
    } catch {
        // No transformers — keyword-only search
    }

    // 1. Vector search (cosine similarity in JS)
    const scores = new Map<string, number>();
    if (queryEmbedding) {
        const allFacts = (await db.prepare(`
            SELECT id, scope, statement, weight, verification_count, embedding
            FROM facts
            WHERE embedding IS NOT NULL AND superseded_by IS NULL
        `).all()) as { id: string; scope: string; statement: string; weight: number; verification_count: number; embedding: string }[];

        const scored = allFacts.map((f) => {
            const factVec = JSON.parse(f.embedding) as number[];
            return { id: f.id, scope: f.scope, statement: f.statement, weight: f.weight, verification_count: f.verification_count, distance: cosineDistance(queryEmbedding!, factVec) };
        });
        scored.sort((a, b) => a.distance - b.distance);

        for (let i = 0; i < Math.min(scored.length, k * 3); i++) {
            const s = scored[i]!;
            scores.set(s.id, 1 / (RRF_K + i + 1));
        }
    }

    // 2. Keyword search (LIKE)
    const keywords = query.split(/\s+/).filter(Boolean);
    if (keywords.length > 0) {
        const likeConditions = keywords.map(() => "(statement LIKE ? OR detail LIKE ?)").join(" OR ");
        const likeBinds: string[] = [];
        for (const w of keywords) {
            likeBinds.push(`%${w}%`, `%${w}%`);
        }

        const ftsRows = (await db.prepare(`
            SELECT id, scope, statement, weight, verification_count
            FROM facts
            WHERE superseded_by IS NULL AND (${likeConditions})
            LIMIT ?
        `).all(...likeBinds, k * 3)) as { id: string; scope: string; statement: string; weight: number; verification_count: number }[];

        for (let i = 0; i < ftsRows.length; i++) {
            const r = ftsRows[i]!;
            const existing = scores.get(r.id) ?? 0;
            scores.set(r.id, existing + 1 / (RRF_K + i + 1));
        }
    }

    // 3. Weight boost + collect results
    const idMap = new Map<string, { scope: string; statement: string; weight: number; verification_count: number }>();
    // Re-fetch the facts we need
    for (const id of scores.keys()) {
        if (!idMap.has(id)) {
            const fact = await getFact(db, id);
            if (fact) {
                idMap.set(id, { scope: fact.scope, statement: fact.statement, weight: fact.weight, verification_count: fact.verification_count });
            }
        }
    }

    const results: SearchResult[] = [];
    for (const [id, rrfScore] of scores) {
        const info = idMap.get(id);
        if (!info) { continue; }
        results.push({
            id,
            scope: info.scope,
            statement: info.statement,
            weight: info.weight,
            verification_count: info.verification_count,
            score: rrfScore * info.weight,
        });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function now(): number {
    return Math.floor(Date.now() / 1000);
}

function cosineDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) { return 1.0; }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        const av = a[i]!;
        const bv = b[i]!;
        dot += av * bv;
        normA += av * av;
        normB += bv * bv;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) { return 1.0; }
    return 1.0 - dot / denom;
}
