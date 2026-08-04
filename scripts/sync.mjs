#!/usr/bin/env node
//
// sync.mjs — distribute the @browsercore/dev shared governance files into the
// sibling consumer repos, and check them for drift.
//
// Usage (run from this package's root, i.e. .../browsercore/dev):
//   node scripts/sync.mjs crypto           # copy templates into ../crypto
//   node scripts/sync.mjs --all            # copy into every consumer
//   node scripts/sync.mjs --check crypto   # exit 1 if ../crypto diverges
//   node scripts/sync.mjs --check --all    # drift gate across all consumers
//   node scripts/sync.mjs --pr tls         # copy, then open a PR in ../tls
//
// Only the files GitHub reads from a repo's own tree are synced this way
// (.github/* + CODING_STANDARDS.md). The code-level config (tsconfig / vitest /
// oxlint) is consumed live via npm — see the package README.
//
import { readFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const devRoot = resolve(here, ".."); // .../browsercore/dev
const workspaceRoot = resolve(devRoot, ".."); // .../browsercore

const CONSUMERS = [
    "crypto",
    "tls",
    "fetch",
    "http1",
    "http2",
    "http3",
    "quic",
    "transport",
    "cookies",
    "profiles",
    "compression",
    "testing",
    "devtools",
    "browsercore",
];

// [templatePath relative to devRoot, targetPath relative to consumer root]
const SHARED = [
    ["templates/.github/workflows/ci.yml", ".github/workflows/ci.yml"],
    ["templates/.github/ruleset.json", ".github/ruleset.json"],
    ["templates/.github/bootstrap-ruleset.sh", ".github/bootstrap-ruleset.sh"],
    ["CODING_STANDARDS.md", "CODING_STANDARDS.md"],
];

const args = process.argv.slice(2);
const check = args.includes("--check");
const pr = args.includes("--pr");
const all = args.includes("--all");
const targets = args.filter((a) => !a.startsWith("--"));

if (all && targets.length > 0) {
    console.error("error: pass either --all or a consumer name, not both");
    process.exit(2);
}
if (pr && check) {
    console.error("error: --pr and --check are mutually exclusive");
    process.exit(2);
}
if (!all && targets.length === 0) {
    console.error("usage: node scripts/sync.mjs [--check|--pr] <consumer|--all>");
    process.exit(2);
}

const list = all ? CONSUMERS : targets;
let drifted = 0;

for (const name of list) {
    const consumer = join(workspaceRoot, name);
    if (!existsSync(join(consumer, "package.json"))) {
        console.error(`skip: ${name} (no package.json at ${consumer})`);
        continue;
    }
    console.log(`${check ? "checking" : "syncing"} ${name} …`);

    for (const [tplRel, tgtRel] of SHARED) {
        const tpl = join(devRoot, tplRel);
        const tgt = join(consumer, tgtRel);
        if (!existsSync(tpl)) {
            console.error(`  ! template missing: ${tplRel}`);
            drifted++;
            continue;
        }
        if (check) {
            if (!existsSync(tgt)) {
                console.error(`  - missing in consumer: ${tgtRel}`);
                drifted++;
                continue;
            }
            if (readFileSync(tpl, "utf8") !== readFileSync(tgt, "utf8")) {
                console.error(`  ~ drifted: ${tgtRel}`);
                drifted++;
            }
        } else {
            mkdirSync(dirname(tgt), { recursive: true });
            copyFileSync(tpl, tgt);
            console.log(`  + ${tgtRel}`);
        }
    }

    if (pr) {
        openPr(consumer);
    }
}

if (check && drifted > 0) {
    console.error(`\n${drifted} file(s) drifted — run without --check to resync.`);
    process.exit(1);
}
console.log(check ? "\ndrift check passed." : "\nsync complete.");

/**
 * Files are already copied into the consumer tree; commit them on a
 * chore/adopt-dev branch and open a PR. No-op if there's nothing staged.
 */
function openPr(consumer) {
    const branch = "chore/adopt-dev";
    const run = (cmd) => execSync(cmd, { cwd: consumer, stdio: "inherit" });
    run(`git checkout -b ${branch} 2>/dev/null || git checkout ${branch}`);
    run(
        "git add .github/workflows/ci.yml .github/ruleset.json .github/bootstrap-ruleset.sh CODING_STANDARDS.md",
    );
    try {
        run('git commit -m "chore: sync shared rules from @browsercore/dev"');
    } catch {
        console.log("  (nothing to commit — already in sync)");
        return;
    }
    run(`git push -u origin ${branch}`);
    execSync(
        'gh pr create --title "chore: adopt @browsercore/dev shared rules" ' +
            '--body "Synced .github/* + CODING_STANDARDS.md from @browsercore/dev via scripts/sync.mjs."',
        { cwd: consumer, stdio: "inherit" },
    );
}
