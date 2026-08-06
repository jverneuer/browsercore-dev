#!/usr/bin/env node
/**
 * Convert vitest's coverage-summary.json into a markdown coverage table.
 *
 * Run AFTER `vitest run --coverage` (with the json-summary reporter) so
 * coverage-summary.json exists. Writes COVERAGE.md and coverage/badge.json to
 * the current working directory (the consumer package root).
 *
 * Distributed as the `coverage-md` bin of @browsercore/dev, replacing the
 * per-repo scripts/coverage-md.mjs copies.
 *
 * The bin is a thin I/O wrapper: all rendering logic and the boundary
 * validation schema live in the compiled output (`dist/coverage-md.js`);
 * this file reads JSON, validates it, renders, and writes results.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
    renderCoverageMarkdown,
    renderBadge,
    CoverageSummarySchema,
} from "../dist/coverage-md.js";

const pkgRoot = process.cwd();
const summaryPath = join(pkgRoot, "coverage", "coverage-summary.json");
const outPath = join(pkgRoot, "COVERAGE.md");
const badgePath = join(pkgRoot, ".github", "coverage-badge.json");

/** @type {unknown} */
let raw;
try {
    raw = readFileSync(summaryPath, "utf-8");
} catch {
    console.error(
        `[coverage-md] Could not read ${summaryPath}. ` +
            `Run vitest with the json-summary reporter first.`,
    );
    process.exit(1);
}

const parsed = CoverageSummarySchema.parse(JSON.parse(raw));

const fileEntries = Object.entries(parsed)
    .filter(([key]) => key !== "total")
    .map(([file, m]) => {
        // coverage-summary.json keys are absolute paths; show repo-relative.
        const rel = relative(pkgRoot, file).split("\\").join("/");
        return { file: rel, m };
    })
    .sort((a, b) => a.file.localeCompare(b.file));

const md = renderCoverageMarkdown(parsed, fileEntries);
writeFileSync(outPath, md);
console.log(`[coverage-md] wrote ${relative(process.cwd(), outPath)}`);

const badge = renderBadge(parsed.total.statements.pct);
writeFileSync(badgePath, JSON.stringify(badge));
console.log(`[coverage-md] wrote ${relative(process.cwd(), badgePath)}`);
