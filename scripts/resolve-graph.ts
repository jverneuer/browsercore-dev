#!/usr/bin/env npx tsx
/**
 * resolve-graph.ts — Dependency graph resolver for the @browsercore polyrepo.
 *
 * Reads each repo's package.json, maps @browsercore/* deps to GitHub repos
 * via repository.url, builds a DAG, and topologically sorts them.
 *
 * Output: workspace/graph.json (consumed by the orchestrator)
 *
 * Usage:
 *   npx tsx scripts/resolve-graph.ts           # build graph, print tree
 *   npx tsx scripts/resolve-graph.ts --json    # output JSON only
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASEMENT = join(__dirname, "..", "..");

interface PackageJson {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    repository?: { type: string; url: string };
}

interface GraphNode {
    name: string;           // package name (e.g. "@browsercore/tls")
    version: string;
    repo: string;           // github short name (e.g. "jverneuer/browsercore-tls")
    dir: string;            // local directory name
    deps: string[];         // @browsercore/* dependency names
    layer: number;          // topological layer (0 = leaf)
}

interface DependencyGraph {
    nodes: Record<string, GraphNode>;
    layers: string[][];     // node names grouped by layer
    entryPoint: string;     // "browsersmith"
}

function readPackage(dir: string): PackageJson | null {
    const pkgPath = join(BASEMENT, dir, "package.json");
    if (!existsSync(pkgPath)) { return null; }
    return JSON.parse(readFileSync(pkgPath, "utf8")) as PackageJson;
}

function extractRepoShort(pkg: PackageJson): string {
    const url = pkg.repository?.url ?? "";
    // git+https://github.com/jverneuer/browsercore-tls.git → jverneuer/browsercore-tls
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    return match?.[1] ?? "unknown";
}

function extractBrowsercoreDeps(pkg: PackageJson): string[] {
    const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
    };
    return Object.keys(allDeps).filter((d) => d.startsWith("@browsercore/"));
}

// All repos in the basement directory
const REPO_DIRS = [
    "browsercore-compression",
    "browsercore-contracts",
    "browsercore-cookies",
    "browsercore-crypto",
    "browsercore-dev",
    "browsercore-devtools",
    "browsercore-fetch",
    "browsercore-http1",
    "browsercore-http2",
    "browsercore-http3",
    "browsercore-profiles",
    "browsercore-quic",
    "browsercore-testing",
    "browsercore-tls",
    "browsercore-transport",
    "browsersmith",
];

function buildGraph(): DependencyGraph {
    const nodes: Record<string, GraphNode> = {};

    // Pass 1: read all packages
    for (const dir of REPO_DIRS) {
        const pkg = readPackage(dir);
        if (!pkg) { continue; }

        const name = pkg.name;
        const deps = extractBrowsercoreDeps(pkg);

        nodes[name] = {
            name,
            version: pkg.version,
            repo: extractRepoShort(pkg),
            dir,
            deps,
            layer: -1,  // unassigned
        };
    }

    // Pass 2: topological sort (Kahn's algorithm by layers)
    // Layer 0 = no @browsercore deps
    // Layer N = max(layer of deps) + 1
    const visited = new Set<string>();
    function assignLayer(name: string): number {
        if (visited.has(name)) { return nodes[name]?.layer ?? 0; }
        visited.add(name);

        const node = nodes[name];
        if (!node) { return 0; }

        if (node.deps.length === 0) {
            node.layer = 0;
            return 0;
        }

        let maxDepLayer = 0;
        for (const dep of node.deps) {
            if (nodes[dep]) {
                const depLayer = assignLayer(dep);
                maxDepLayer = Math.max(maxDepLayer, depLayer);
            }
        }
        node.layer = maxDepLayer + 1;
        return node.layer;
    }

    for (const name of Object.keys(nodes)) {
        assignLayer(name);
    }

    // Group by layer
    const maxLayer = Math.max(...Object.values(nodes).map((n) => n.layer));
    const layers: string[][] = [];
    for (let i = 0; i <= maxLayer; i++) {
        layers.push(
            Object.values(nodes)
                .filter((n) => n.layer === i)
                .map((n) => n.name)
                .sort(),
        );
    }

    return { nodes, layers, entryPoint: "browsersmith" };
}

function printTree(graph: DependencyGraph): void {
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

// Main
const graph = buildGraph();

// Write to workspace/graph.json
const workspaceDir = join(__dirname, "..", "workspace");
writeFileSync(
    join(workspaceDir, "graph.json"),
    JSON.stringify(graph, null, 2),
);

const jsonOnly = process.argv.includes("--json");
if (jsonOnly) {
    console.log(JSON.stringify(graph, null, 2));
} else {
    printTree(graph);
    console.log(`\nGraph written to workspace/graph.json`);
}
