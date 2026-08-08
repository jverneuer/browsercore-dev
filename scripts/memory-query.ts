#!/usr/bin/env npx tsx
/**
 * memory-query.ts — CLI for agents to search and read the @browsercore memory DB.
 *
 * Usage:
 *   npx tsx scripts/memory-query.ts search "TLS key schedule bug"
 *   npx tsx scripts/memory-query.ts get architecture/platform-composition-root
 *   npx tsx scripts/memory-query.ts facts --scope architecture --min-weight 0.8
 *   npx tsx scripts/memory-query.ts questions
 *   npx tsx scripts/memory-query.ts evidence bugs/bug6-key-schedule
 */

import {
    getMemoryDb, ensureSchema, hybridSearch, getFact, listFacts,
    getOpenQuestions, type Scope,
} from "./memory-db.ts";

const RRF_K = 60;

// ═══════════════════════════════════════════════════════════════════════════
// SEARCH COMMAND
// ═══════════════════════════════════════════════════════════════════════════

async function searchCommand(query: string): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);

    const results = await hybridSearch(db, query, 7);

    if (results.length === 0) {
        console.log("No results.");
        return;
    }

    console.log(`\nSearch: "${query}" — ${results.length} results\n`);
    for (let i = 0; i < results.length; i++) {
        const r = results[i]!;
        console.log(`${i + 1}. [${r.id}] (score=${r.score.toFixed(4)}, w=${r.weight.toFixed(2)}, v=${r.verification_count})`);
        console.log(`   ${r.statement.slice(0, 120)}${r.statement.length > 120 ? "..." : ""}`);
        console.log();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GET COMMAND
// ═══════════════════════════════════════════════════════════════════════════

async function getCommand(id: string): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);

    const fact = await getFact(db, id);

    if (!fact) {
        console.error(`Fact not found: ${id}`);
        process.exit(1);
    }

    console.log(`#${fact.id}`);
    console.log(`  scope:       ${fact.scope}`);
    console.log(`  stability:   ${fact.stability}`);
    console.log(`  confidence:  ${fact.base_confidence}`);
    console.log(`  weight:      ${fact.weight}`);
    console.log(`  coupling:    ${fact.coupling ?? "none"}`);
    console.log(`  verified:    ${fact.verification_count}x${fact.last_verified_at ? ` (last: ${new Date(fact.last_verified_at * 1000).toISOString()})` : ""}`);
    console.log();
    console.log(`Statement: ${fact.statement}`);
    if (fact.detail) {
        console.log(`\nDetail: ${fact.detail}`);
    }
    if (fact.agents_must_know) {
        console.log(`\nAgents must know: ${fact.agents_must_know}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTS COMMAND
// ═══════════════════════════════════════════════════════════════════════════

async function factsCommand(args: string[]): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);

    const scopeIdx = args.indexOf("--scope");
    const minWeightIdx = args.indexOf("--min-weight");
    const limitIdx = args.indexOf("--limit");

    const options: { scope?: Scope; minWeight?: number; limit?: number } = {};
    if (scopeIdx !== -1 && args[scopeIdx + 1]) {
        options.scope = args[scopeIdx + 1] as Scope;
    }
    if (minWeightIdx !== -1 && args[minWeightIdx + 1]) {
        options.minWeight = parseFloat(args[minWeightIdx + 1]!);
    }
    if (limitIdx !== -1 && args[limitIdx + 1]) {
        options.limit = parseInt(args[limitIdx + 1]!, 10);
    }

    const facts = await listFacts(db, options);

    if (facts.length === 0) {
        console.log("No facts match.");
        return;
    }

    console.log(`\n${facts.length} facts${options.scope ? ` in scope '${options.scope}'` : ""}:\n`);
    for (const f of facts) {
        console.log(`  [${f.id}] w=${f.weight.toFixed(2)} conf=${f.base_confidence} — ${f.statement.slice(0, 80)}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// QUESTIONS COMMAND
// ═══════════════════════════════════════════════════════════════════════════

async function questionsCommand(): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);

    const questions = await getOpenQuestions(db);

    if (questions.length === 0) {
        console.log("No open questions.");
        return;
    }

    console.log(`\n${questions.length} open questions:\n`);
    for (const q of questions) {
        console.log(`  [${q.id}] ${q.title}`);
        console.log(`    ${q.the_question.slice(0, 100)}`);
        if (q.impact_if_wrong) {
            console.log(`    Impact: ${q.impact_if_wrong.slice(0, 80)}`);
        }
        console.log();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI DISPATCH
// ═══════════════════════════════════════════════════════════════════════════

const cmd = process.argv[2];
const arg = process.argv[3];

if (!cmd) {
    console.error("Usage: npx tsx scripts/memory-query.ts <search|get|facts|questions> [args]");
    process.exit(1);
}

switch (cmd) {
    case "search": await searchCommand(arg ?? ""); break;
    case "get": await getCommand(arg ?? ""); break;
    case "facts": await factsCommand(process.argv.slice(3)); break;
    case "questions": await questionsCommand(); break;
    default:
        console.error(`Unknown command: ${cmd}`);
        process.exit(1);
}
