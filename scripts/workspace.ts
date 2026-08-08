#!/usr/bin/env npx tsx
/**
 * workspace.ts — Workspace manager for the @browsercore polyrepo.
 *
 * Commands:
 *   npx tsx scripts/workspace.ts sync     — clone/pull all repos, npm install
 *   npx tsx scripts/workspace.ts status   — git status across all repos
 *   npx tsx scripts/workspace.ts graph    — print the dependency DAG
 *   npx tsx scripts/workspace.ts link     — symlink local @browsercore/* for cross-repo dev
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, symlinkSync, unlinkSync, lstatSync, mkdirSync } from "node:fs";
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
        console.error("Graph not found. Run: npx tsx scripts/resolve-graph.ts");
        process.exit(1);
    }
    return JSON.parse(readFileSync(GRAPH_PATH, "utf8")) as DependencyGraph;
}

// ═══════════════════════════════════════════════════════════════════════════
// SYNC — git pull + npm install for all repos
// ═══════════════════════════════════════════════════════════════════════════

function syncRepo(dir: string): { ok: boolean; detail: string } {
    const repoPath = join(BASEMENT, dir);
    if (!existsSync(repoPath)) {
        return { ok: false, detail: "directory not found" };
    }

    try {
        const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath, encoding: "utf8" }).trim();
        const pullResult = spawnSync("git", ["pull", "--ff-only"], { cwd: repoPath, encoding: "utf8" });
        const pullOk = pullResult.status === 0;

        if (!existsSync(join(repoPath, "node_modules"))) {
            spawnSync("npm", ["install"], { cwd: repoPath, encoding: "utf8", stdio: "pipe" });
        }

        return {
            ok: pullOk,
            detail: `${branch} ${pullOk ? "(up to date)" : "(pull failed)"}`,
        };
    } catch (e) {
        return { ok: false, detail: (e as Error).message };
    }
}

function cmdSync(): void {
    const graph = loadGraph();
    console.log("Syncing all repos...\n");

    let ok = 0;
    let fail = 0;
    for (const node of Object.values(graph.nodes)) {
        const result = syncRepo(node.dir);
        const status = result.ok ? "✓" : "✗";
        console.log(`  ${status} ${node.name.padEnd(35)} ${result.detail}`);
        if (result.ok) { ok++; } else { fail++; }
    }

    console.log(`\n${ok} ok, ${fail} failed`);
}

// ═══════════════════════════════════════════════════════════════════════════
// STATUS — git status across all repos
// ═══════════════════════════════════════════════════════════════════════════

function cmdStatus(): void {
    const graph = loadGraph();
    console.log("Repo status:\n");

    for (const node of Object.values(graph.nodes)) {
        const repoPath = join(BASEMENT, node.dir);
        if (!existsSync(repoPath)) {
            console.log(`  ✗ ${node.name.padEnd(35)} NOT FOUND`);
            continue;
        }

        try {
            const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath, encoding: "utf8" }).trim();
            const dirty = execSync("git status --porcelain", { cwd: repoPath, encoding: "utf8" }).trim();
            const ahead = execSync("git rev-list --count @{upstream}..HEAD 2>/dev/null || echo 0", { cwd: repoPath, encoding: "utf8" }).trim();
            const behind = execSync("git rev-list --count HEAD..@{upstream} 2>/dev/null || echo 0", { cwd: repoPath, encoding: "utf8" }).trim();

            const parts: string[] = [branch];
            if (dirty) { parts.push("dirty"); }
            if (parseInt(ahead) > 0) { parts.push(`↑${ahead}`); }
            if (parseInt(behind) > 0) { parts.push(`↓${behind}`); }
            if (!dirty && ahead === "0" && behind === "0") { parts.push("clean"); }

            const marker = dirty ? "●" : " ";
            console.log(`  ${marker} ${node.name.padEnd(35)} ${parts.join(" ")}`);
        } catch {
            console.log(`  ? ${node.name.padEnd(35)} git error`);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH — print the dependency DAG
// ═══════════════════════════════════════════════════════════════════════════

function cmdGraph(): void {
    const graph = loadGraph();
    console.log("\n@browsercore dependency graph:\n");

    for (let i = 0; i < graph.layers.length; i++) {
        const layerNames = graph.layers[i]!;
        console.log(`Layer ${i}:`);
        for (const name of layerNames) {
            const node = graph.nodes[name]!;
            const deps = node.deps.length > 0 ? `  deps: ${node.deps.join(", ")}` : "";
            console.log(`  ${name}@${node.version}${deps}`);
        }
        console.log();
    }

    console.log(`Entry point: ${graph.entryPoint}`);
    console.log(`Total: ${Object.keys(graph.nodes).length} packages across ${graph.layers.length} layers`);
}

// ═══════════════════════════════════════════════════════════════════════════
// LINK — symlink local @browsercore/* packages for cross-repo dev
// ═══════════════════════════════════════════════════════════════════════════

function cmdLink(): void {
    const graph = loadGraph();
    console.log("Linking local @browsercore/* packages...\n");

    for (const node of Object.values(graph.nodes)) {
        const repoPath = join(BASEMENT, node.dir);
        if (!existsSync(repoPath)) { continue; }

        // For each dep, symlink node_modules/@browsercore/<dep> → ../../<dep-dir>
        for (const dep of node.deps) {
            const depNode = graph.nodes[dep];
            if (!depNode) { continue; }

            const depDir = join(BASEMENT, depNode.dir);
            const linkPath = join(repoPath, "node_modules", dep);

            if (!existsSync(join(repoPath, "node_modules"))) {
                console.log(`  ! ${node.name}: run npm install first`);
                continue;
            }

            // Remove existing (symlink or real package)
            try {
                if (lstatSync(linkPath).isSymbolicLink() || existsSync(linkPath)) {
                    unlinkSync(linkPath);
                }
            } catch {
                // doesn't exist — fine
            }

            // Create parent dir if needed
            const parentDir = join(linkPath, "..");
            if (!existsSync(parentDir)) {
                mkdirSync(parentDir, { recursive: true });
            }

            try {
                symlinkSync(depDir, linkPath, "dir");
                console.log(`  ✓ ${node.name} → ${dep} (linked to ${depNode.dir})`);
            } catch (e) {
                console.log(`  ✗ ${node.name} → ${dep}: ${(e as Error).message}`);
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI DISPATCH
// ═══════════════════════════════════════════════════════════════════════════

const cmd = process.argv[2] ?? "status";
switch (cmd) {
    case "sync": cmdSync(); break;
    case "status": cmdStatus(); break;
    case "graph": cmdGraph(); break;
    case "link": cmdLink(); break;
    default:
        console.error(`Unknown command: ${cmd}`);
        console.error("Usage: npx tsx scripts/workspace.ts [sync|status|graph|link]");
        process.exit(1);
}
