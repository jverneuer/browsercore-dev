#!/usr/bin/env npx tsx
/**
 * memory-session.ts — Session startup brief generator for @browsercore.
 *
 * Queries the memory DB for leftover context from previous sessions and
 * produces a structured brief for the startup agent.
 *
 * Usage:
 *   npx tsx scripts/memory-session.ts brief    # full session brief
 *   npx tsx scripts/memory-session.ts resume   # check for resumable tasks
 *   npx tsx scripts/memory-session.ts recent   # show recent activity (24h)
 */

import { getMemoryDb, ensureSchema, getActiveTasks, getOpenQuestions, getRecentEvidence, now } from "./memory-db.ts";

const DAY_SECONDS = 86400;

async function brief(): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);

    const tasks = await getActiveTasks(db);
    const questions = await getOpenQuestions(db);
    const evidence = await getRecentEvidence(db, DAY_SECONDS);

    console.log("═══════════════════════════════════════════════════════════");
    console.log("  @browsercore — Session Brief");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Active tasks
    if (tasks.length > 0) {
        console.log(`Active Tasks (${tasks.length}):`);
        for (const t of tasks) {
            const age = t.started_at ? Math.round((now() - t.started_at) / 3600) : 0;
            console.log(`  • [${t.id}] ${t.title} (${t.repo || "no repo"}, ${age}h ago)`);
            if (t.description) {
                console.log(`    ${t.description.slice(0, 100)}`);
            }
            if (t.facts_touched > 0) {
                console.log(`    Facts touched: ${t.facts_touched}`);
            }
        }
        console.log();
    } else {
        console.log("No active tasks — ready for new work.\n");
    }

    // Open questions
    if (questions.length > 0) {
        console.log(`Open Questions (${questions.length}):`);
        for (const q of questions) {
            console.log(`  • [${q.id}] ${q.title}`);
            if (q.impact_if_wrong) {
                console.log(`    Impact: ${q.impact_if_wrong.slice(0, 100)}`);
            }
        }
        console.log();
    } else {
        console.log("No open questions.\n");
    }

    // Recent evidence
    if (evidence.length > 0) {
        console.log(`Recent Activity (${evidence.length} observations in last 24h):`);
        for (const e of evidence) {
            const ageH = Math.round((now() - e.observed_at) / 3600);
            const obs = e.observation.slice(0, 80);
            console.log(`  • [${e.fact_id}] ${obs} (${ageH}h ago)`);
        }
        console.log();
    } else {
        console.log("No recent activity.\n");
    }

    console.log("═══════════════════════════════════════════════════════════");
}

async function resume(): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);
    const tasks = await getActiveTasks(db);

    if (tasks.length === 0) {
        console.log("No resumable tasks.");
        return;
    }

    console.log("Resumable tasks:");
    for (const t of tasks) {
        console.log(`  ${t.id}: ${t.title} [${t.repo}]`);
    }
}

async function recent(): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);
    const evidence = await getRecentEvidence(db, DAY_SECONDS);

    if (evidence.length === 0) {
        console.log("No recent activity (last 24h).");
        return;
    }

    console.log("Recent activity (last 24h):");
    for (const e of evidence) {
        const ageH = Math.round((now() - e.observed_at) / 3600);
        console.log(`  [${e.fact_id}] ${e.observation} (${ageH}h ago)`);
    }
}

// CLI dispatch
const cmd = process.argv[2] ?? "brief";
switch (cmd) {
    case "brief": await brief(); break;
    case "resume": await resume(); break;
    case "recent": await recent(); break;
    default:
        console.error(`Unknown command: ${cmd}`);
        console.error("Usage: npx tsx scripts/memory-session.ts [brief|resume|recent]");
        process.exit(1);
}
