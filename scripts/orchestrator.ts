#!/usr/bin/env npx tsx
/**
 * orchestrator.ts — Top-level dispatch loop for cross-repo work.
 *
 * Reads the dependency DAG, determines impact radius, and coordinates
 * work across repos in topological layer order.
 *
 * Usage:
 *   npx tsx scripts/orchestrator.ts impact <package-name>
 *     — Show which repos are affected by a change in <package-name>
 *
 *   npx tsx scripts/orchestrator.ts layers <package-name>
 *     — Show the publish order layers for a change in <package-name>
 *
 *   npx tsx scripts/orchestrator.ts versions
 *     — Show current npm versions for all packages
 *
 *   npx tsx scripts/orchestrator.ts ci <github-short-name>
 *     — Check CI status for a repo's latest run
 *
 *   npx tsx scripts/orchestrator.ts verify <package-name> <version>
 *     — Verify a specific version is published on npm
 *
 *   npx tsx scripts/orchestrator.ts bump-plan <package-name>
 *     — Generate the full bump plan (which repos need dep bumps, in what order)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASEMENT = join(__dirname, "..", "..");
const GRAPH_PATH = join(__dirname, "..", "workspace", "graph.json");

interface GraphNode {
    name: string;
    version: string;
    repo: string;
    dir: string;
    deps: string[];
    layer: number;
}

interface DependencyGraph {
    nodes: Record<string, GraphNode>;
    layers: string[][];
    entryPoint: string;
}

function loadGraph(): DependencyGraph {
    if (!existsSync(GRAPH_PATH)) {
        console.error("Graph not found. Run: npx tsx scripts/resolve-graph.ts first.");
        process.exit(1);
    }
    return JSON.parse(readFileSync(GRAPH_PATH, "utf8")) as DependencyGraph;
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPACT ANALYSIS — which repos transitively depend on a package
// ═══════════════════════════════════════════════════════════════════════════

function getDownstream(graph: DependencyGraph, packageName: string): Set<string> {
    const downstream = new Set<string>();
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of Object.values(graph.nodes)) {
            if (downstream.has(node.name)) { continue; }
            if (node.name === packageName) { continue; }
            if (node.deps.includes(packageName)) {
                downstream.add(node.name);
                changed = true;
            }
            // Also check if any dep is already in downstream
            for (const dep of node.deps) {
                if (downstream.has(dep) && !downstream.has(node.name)) {
                    downstream.add(node.name);
                    changed = true;
                }
            }
        }
    }
    return downstream;
}

function cmdImpact(pkg: string): void {
    const graph = loadGraph();
    const node = graph.nodes[pkg];

    if (!node) {
        console.error(`Unknown package: ${pkg}`);
        console.error(`Available: ${Object.keys(graph.nodes).join(", ")}`);
        process.exit(1);
    }

    const downstream = getDownstream(graph, pkg);
    console.log(`\nImpact analysis for ${pkg} (layer ${node.layer}):\n`);
    console.log(`  Direct: ${pkg}@${node.version}`);
    console.log(`  Downstream (${downstream.size}):`);
    for (const d of [...downstream].sort()) {
        const dn = graph.nodes[d]!;
        console.log(`    ${d}@${dn.version} (layer ${dn.layer})`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYERS — the publish order for a change
// ═══════════════════════════════════════════════════════════════════════════

function cmdLayers(pkg: string): void {
    const graph = loadGraph();
    const node = graph.nodes[pkg];

    if (!node) {
        console.error(`Unknown package: ${pkg}`);
        process.exit(1);
    }

    const downstream = getDownstream(graph, pkg);
    const allAffected = new Set<string>([pkg, ...downstream]);

    // Group affected packages by their layer
    const byLayer = new Map<number, string[]>();
    for (const name of allAffected) {
        const n = graph.nodes[name]!;
        const layer = n.layer;
        if (!byLayer.has(layer)) { byLayer.set(layer, []); }
        byLayer.get(layer)!.push(name);
    }

    const maxLayer = Math.max(...byLayer.keys());
    console.log(`\nPublish order for ${pkg} change:\n`);
    for (let i = node.layer; i <= maxLayer; i++) {
        const pkgs = byLayer.get(i);
        if (!pkgs || pkgs.length === 0) { continue; }
        const parallel = pkgs.length > 1 ? " (parallel)" : "";
        console.log(`  Layer ${i}${parallel}:`);
        for (const p of pkgs.sort()) {
            const n = graph.nodes[p]!;
            console.log(`    ${p}@${n.version}`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERSIONS — current npm versions for all packages
// ═══════════════════════════════════════════════════════════════════════════

function cmdVersions(): void {
    const graph = loadGraph();
    console.log("\nCurrent npm versions:\n");

    for (const node of Object.values(graph.nodes)) {
        try {
            const npmVersion = execSync(`npm view ${node.name} version 2>/dev/null`, { encoding: "utf8" }).trim();
            const localVersion = node.version;
            const match = npmVersion === localVersion;
            const marker = match ? "✓" : "!";
            console.log(`  ${marker} ${node.name.padEnd(35)} local: ${localVersion.padEnd(10)} npm: ${npmVersion}`);
        } catch {
            console.log(`  ? ${node.name.padEnd(35)} local: ${node.version.padEnd(10)} npm: NOT PUBLISHED`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CI — check CI status for a repo
// ═══════════════════════════════════════════════════════════════════════════

function cmdCi(githubShort: string): void {
    try {
        const runs = execSync(
            `gh run list --repo ${githubShort} --limit 5 --json status,conclusion,displayTitle,createdAt 2>/dev/null`,
            { encoding: "utf8" },
        ).trim();
        const parsed = JSON.parse(runs) as { status: string; conclusion: string | null; displayTitle: string; createdAt: string }[];

        console.log(`\nCI runs for ${githubShort}:\n`);
        for (const run of parsed) {
            const conclusion = run.conclusion ?? run.status;
            const marker = conclusion === "success" ? "✓" : conclusion === "failure" ? "✗" : "…";
            console.log(`  ${marker} ${run.displayTitle.slice(0, 60)} (${conclusion})`);
        }
    } catch (e) {
        console.error(`Failed to query CI for ${githubShort}: ${(e as Error).message}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERIFY — check a specific version is on npm
// ═══════════════════════════════════════════════════════════════════════════

function cmdVerify(pkg: string, version: string): void {
    try {
        const npmVersion = execSync(`npm view ${pkg}@${version} version 2>/dev/null`, { encoding: "utf8" }).trim();
        if (npmVersion === version) {
            console.log(`✓ ${pkg}@${version} is published`);
        } else {
            console.log(`✗ ${pkg}@${version} NOT found (npm has ${npmVersion})`);
        }
    } catch {
        console.log(`✗ ${pkg}@${version} NOT published`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUMP PLAN — full plan for a dependency chain bump
// ═══════════════════════════════════════════════════════════════════════════

function cmdBumpPlan(pkg: string): void {
    const graph = loadGraph();
    const node = graph.nodes[pkg];

    if (!node) {
        console.error(`Unknown package: ${pkg}`);
        process.exit(1);
    }

    console.log(`\nBump plan for ${pkg}:\n`);
    console.log("=".repeat(60));

    const downstream = getDownstream(graph, pkg);
    const allAffected = new Set<string>([pkg, ...downstream]);

    // Group by layer
    const byLayer = new Map<number, string[]>();
    for (const name of allAffected) {
        const n = graph.nodes[name]!;
        if (!byLayer.has(n.layer)) { byLayer.set(n.layer, []); }
        byLayer.get(n.layer)!.push(name);
    }

    const maxLayer = Math.max(...byLayer.keys());
    let step = 1;

    for (let i = node.layer; i <= maxLayer; i++) {
        const pkgs = byLayer.get(i);
        if (!pkgs || pkgs.length === 0) { continue; }
        const isDirect = i === node.layer;
        const parallel = pkgs.length > 1 ? " (PARALLEL)" : "";

        console.log(`\nStep ${step} — Layer ${i}${parallel} ${isDirect ? "[DIRECT FIX]" : "[DEP BUMP]"}`);
        console.log("-".repeat(60));

        for (const p of pkgs.sort()) {
            const n = graph.nodes[p]!;
            const repoDir = join(BASEMENT, n.dir);

            if (isDirect) {
                console.log(`  ${n.name}@${n.version} (${n.repo})`);
                console.log(`    dir: ${n.dir}`);
                console.log(`    action: fix the bug, bump version, PR, CI, merge, publish`);
            } else {
                // Which deps need bumping?
                const depsToBump = n.deps.filter((d) => allAffected.has(d));
                console.log(`  ${n.name}@${n.version} (${n.repo})`);
                console.log(`    dir: ${n.dir}`);
                console.log(`    bump: ${depsToBump.map((d) => `${d} → latest`).join(", ")}`);
                console.log(`    action: bump dep versions in package.json, npm install, test, PR, CI, merge, publish`);
            }
        }
        step++;
    }

    console.log("\n" + "=".repeat(60));
    console.log(`\nTotal: ${allAffected.size} repos across ${maxLayer - node.layer + 1} layers`);
    console.log("\nEach layer must fully publish to npm before the next layer starts.");
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI DISPATCH
// ═══════════════════════════════════════════════════════════════════════════

const cmd = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];

switch (cmd) {
    case "impact": cmdImpact(arg1!); break;
    case "layers": cmdLayers(arg1!); break;
    case "versions": cmdVersions(); break;
    case "ci": cmdCi(arg1!); break;
    case "verify": cmdVerify(arg1!, arg2!); break;
    case "bump-plan": cmdBumpPlan(arg1!); break;
    default:
        console.error("Usage: npx tsx scripts/orchestrator.ts <command> [args]");
        console.error("Commands: impact, layers, versions, ci, verify, bump-plan");
        process.exit(1);
}
