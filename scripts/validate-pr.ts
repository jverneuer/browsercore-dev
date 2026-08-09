#!/usr/bin/env npx tsx
/**
 * validate-pr.ts — Pre-PR validation gate for the @browsercore polyrepo.
 *
 * Every agent MUST run this before opening a PR. It verifies the target repo is
 * in a publish-safe state so CI never publishes a stale version and never fails
 * on a missing @browsercore/* dependency. The pr-gatekeeper agent refuses to
 * open any PR until every check here passes.
 *
 * Checks:
 *   1. Version bumped above the version currently on npm
 *   2. Every @browsercore/* dependency resolves on the npm registry
 *   3. Working tree is clean (no uncommitted changes)
 *   4. Branch name matches the conventional prefix pattern
 *   5. No stray local branches (warning, not a failure)
 *
 * Usage:
 *   npx tsx scripts/validate-pr.ts --repo ../browsercore-crypto --branch feat/my-branch
 *
 * Exit codes: 0 = safe to open PR, 1 = validation failed.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const NPM_TIMEOUT_MS = 30_000;

// ═══════════════════════════════════════════════════════════════════════════
// Branded primitives — make invalid version data unrepresentable (standard §13)
// ═══════════════════════════════════════════════════════════════════════════

/** A string validated to match the numeric X.Y.Z semver core. */
type SemverVersion = string & { readonly __brand: "SemverVersion" };

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/u;

function semver(raw: string): SemverVersion | null {
    return SEMVER_RE.test(raw) ? (raw as SemverVersion) : null;
}

function semverParts(v: SemverVersion): readonly [number, number, number] {
    const parts = v.split(".").map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0] as const;
}

/**
 * Negative => a < b, 0 => equal, positive => a > b.
 * Returns null if either side is not a clean numeric semver.
 */
function compareSemver(a: string, b: string): number | null {
    const sa = semver(a);
    const sb = semver(b);
    if (!sa || !sb) { return null; }
    const [aMaj, aMin, aPat] = semverParts(sa);
    const [bMaj, bMin, bPat] = semverParts(sb);
    if (aMaj !== bMaj) { return aMaj - bMaj; }
    if (aMin !== bMin) { return aMin - bMin; }
    return aPat - bPat;
}

// ═══════════════════════════════════════════════════════════════════════════
// Result model — discriminated union, one status per check (standard §6)
// ═══════════════════════════════════════════════════════════════════════════

type CheckKind = "version" | "dependency" | "worktree" | "branch-name" | "stray-branches";

interface CheckResult {
    readonly kind: CheckKind;
    readonly status: "pass" | "warn" | "fail";
    readonly message: string;
}

const pass = (kind: CheckKind, message: string): CheckResult => ({ kind, status: "pass", message });
const warn = (kind: CheckKind, message: string): CheckResult => ({ kind, status: "warn", message });
const fail = (kind: CheckKind, message: string): CheckResult => ({ kind, status: "fail", message });

// ═══════════════════════════════════════════════════════════════════════════
// package.json boundary — validate external data immediately (standard §12)
// ═══════════════════════════════════════════════════════════════════════════

interface PackageJson {
    readonly name: string;
    readonly version: string;
    readonly dependencies: Readonly<Record<string, string>>;
    readonly devDependencies: Readonly<Record<string, string>>;
}

type PackageResult = { readonly ok: true; readonly pkg: PackageJson } | { readonly ok: false; readonly reason: string };

function readPackageJson(repoPath: string): PackageResult {
    let raw: string;
    try {
        raw = readFileSync(resolve(repoPath, "package.json"), "utf8");
    } catch {
        return { ok: false, reason: `No readable package.json in ${repoPath}` };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { ok: false, reason: `package.json in ${repoPath} is not valid JSON` };
    }

    if (typeof parsed !== "object" || parsed === null) {
        return { ok: false, reason: `package.json in ${repoPath} is not an object` };
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj["name"] !== "string" || typeof obj["version"] !== "string") {
        return { ok: false, reason: `package.json in ${repoPath} is missing string name/version` };
    }

    const deps = obj["dependencies"];
    const devDeps = obj["devDependencies"];
    const pkg: PackageJson = {
        name: obj["name"],
        version: obj["version"],
        dependencies: isStringRecord(deps) ? deps : {},
        devDependencies: isStringRecord(devDeps) ? devDeps : {},
    };
    return { ok: true, pkg };
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (typeof value !== "object" || value === null) { return false; }
    return Object.values(value).every((v) => typeof v === "string");
}

// ═══════════════════════════════════════════════════════════════════════════
// npm + git subprocess helpers
// ═══════════════════════════════════════════════════════════════════════════

interface Lookup {
    readonly ok: boolean;
    /** Resolved version string when ok, otherwise null. */
    readonly version: string | null;
}

/** Query the npm registry for the highest version of `name` matching `range`. */
async function npmView(name: string, range: string): Promise<Lookup> {
    try {
        const { stdout } = await execFileAsync("npm", ["view", `${name}@${range}`, "version"], {
            encoding: "utf8",
            timeout: NPM_TIMEOUT_MS,
        });
        const lines = stdout.trim().split("\n");
        const version = lines.at(-1) ?? "";
        const found = version.length > 0;
        return { ok: found, version: found ? version : null };
    } catch {
        return { ok: false, version: null };
    }
}

interface GitResult {
    readonly ok: boolean;
    readonly stdout: string;
}

async function runGit(repoPath: string, args: readonly string[]): Promise<GitResult> {
    try {
        const { stdout } = await execFileAsync("git", args, { cwd: repoPath, encoding: "utf8" });
        return { ok: true, stdout };
    } catch {
        return { ok: false, stdout: "" };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 1 — version bumped above npm
// ═══════════════════════════════════════════════════════════════════════════

async function checkVersionBump(pkg: PackageJson): Promise<CheckResult> {
    const published = await npmView(pkg.name, "latest");
    // Package never published — nothing to bump above, local version is fine.
    if (!published.ok || published.version === null) {
        return pass("version", `${pkg.name} is not yet on npm; version ${pkg.version} is publishable`);
    }

    const ordering = compareSemver(pkg.version, published.version);
    if (ordering === null) {
        return warn("version", `Cannot compare local ${pkg.version} with npm ${published.version} (non-semver); verify manually`);
    }
    if (ordering <= 0) {
        return fail(
            "version",
            `Version ${pkg.version} is not bumped above npm version ${published.version}. Bump with: npm version patch --no-git-tag-version`,
        );
    }
    return pass("version", `${pkg.name}@${pkg.version} is bumped above npm ${published.version}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 2 — every @browsercore/* dependency resolves on npm
// ═══════════════════════════════════════════════════════════════════════════

const BROWSERCORE_PREFIX = "@browsercore/";
const LOCAL_REF_RE = /^(file|link|workspace):/u;

type DepSpec = { readonly kind: "semver"; readonly range: string } | { readonly kind: "local-ref"; readonly spec: string };

function classifySpec(spec: string): DepSpec {
    return LOCAL_REF_RE.test(spec) ? { kind: "local-ref", spec } : { kind: "semver", range: spec };
}

function browsercoreDeps(pkg: PackageJson): readonly { readonly name: string; readonly spec: string }[] {
    const merged: Record<string, string> = { ...pkg.devDependencies, ...pkg.dependencies };
    return Object.entries(merged)
        .filter(([name]) => name.startsWith(BROWSERCORE_PREFIX))
        .map(([name, spec]) => ({ name, spec }));
}

async function checkSingleDependency(name: string, spec: string): Promise<CheckResult> {
    const dep = classifySpec(spec);

    // A file:/link:/workspace: ref to an internal package breaks downstream installs
    // and npm publish — the published package.json would point at a local path.
    if (dep.kind === "local-ref") {
        return fail(
            "dependency",
            `Dependency ${name}@${dep.spec} is a local reference. Published packages must pin real npm versions. Set it to a published semver range before opening a PR.`,
        );
    }

    const match = await npmView(name, dep.range);
    if (match.ok && match.version) {
        return pass("dependency", `${name}@${spec} resolves to ${match.version} on npm`);
    }

    // Range did not resolve — disambiguate "missing version" from "registry unreachable".
    const latest = await npmView(name, "latest");
    if (latest.ok && latest.version) {
        return fail(
            "dependency",
            `Dependency ${name}@${spec} does not exist on npm. Latest published is ${latest.version}. Either publish it first or use a version that exists.`,
        );
    }
    return warn("dependency", `Could not verify ${name}@${spec} on npm (registry unreachable); verify manually`);
}

function checkDependencies(pkg: PackageJson): Promise<CheckResult[]> {
    const deps = browsercoreDeps(pkg);
    if (deps.length === 0) {
        return Promise.resolve([pass("dependency", "No @browsercore/* dependencies to verify")]);
    }
    return Promise.all(deps.map((d) => checkSingleDependency(d.name, d.spec)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 3 — working tree clean
// ═══════════════════════════════════════════════════════════════════════════

async function checkWorktreeClean(repoPath: string): Promise<CheckResult> {
    const status = await runGit(repoPath, ["status", "--porcelain"]);
    if (!status.ok) {
        return warn("worktree", "Could not run `git status` in the repo; verify the working tree is clean manually");
    }
    const dirty = status.stdout.trim();
    if (dirty === "") {
        return pass("worktree", "Working tree is clean");
    }
    const files = dirty.split("\n").map((l) => l.trim()).filter(Boolean).join(", ");
    return fail("worktree", `Working tree is not clean. Uncommitted files: [${files}]`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 4 — branch name matches the conventional prefix pattern
// ═══════════════════════════════════════════════════════════════════════════

const BRANCH_RE = /^(feat|fix|refactor|docs|test|ci|chore|perf)\/[a-z0-9-]+$/u;

function checkBranchName(branch: string): CheckResult {
    if (BRANCH_RE.test(branch)) {
        return pass("branch-name", `Branch '${branch}' matches the naming convention`);
    }
    return fail(
        "branch-name",
        `Branch '${branch}' does not match ^(feat|fix|refactor|docs|test|ci|chore|perf)/[a-z0-9-]+$. Rename with: git branch -m ${branch} feat/<short-description>`,
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// Check 5 — stray local branches (warning only)
// ═══════════════════════════════════════════════════════════════════════════

async function checkStrayBranches(repoPath: string, currentBranch: string): Promise<CheckResult> {
    const head = await runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const headBranch = head.ok ? head.stdout.trim() : currentBranch;

    const list = await runGit(repoPath, ["branch", "--list", "--format=%(refname:short)"]);
    if (!list.ok) {
        return warn("stray-branches", "Could not list local branches; verify manually");
    }

    const keep = new Set(["main", "master", currentBranch, headBranch]);
    const extra = list.stdout.trim().split("\n").map((b) => b.trim()).filter((b) => b !== "" && !keep.has(b));
    if (extra.length === 0) {
        return pass("stray-branches", "No stray local branches");
    }
    return warn("stray-branches", `Extra branches detected: [${extra.join(", ")}]. Consider cleaning up.`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Orchestration — run all checks in parallel (npm calls are the slow path)
// ═══════════════════════════════════════════════════════════════════════════

async function runAllChecks(repoPath: string, branch: string, pkg: PackageJson): Promise<readonly CheckResult[]> {
    const [version, deps, worktree, branchName, stray] = await Promise.all([
        checkVersionBump(pkg),
        checkDependencies(pkg),
        checkWorktreeClean(repoPath),
        checkBranchName(branch),
        checkStrayBranches(repoPath, branch),
    ]);
    return [version, ...deps, worktree, branchName, stray];
}

function report(results: readonly CheckResult[]): number {
    const failures = results.filter((r) => r.status === "fail");
    const warnings = results.filter((r) => r.status === "warn");

    if (failures.length === 0) {
        console.log("✅ ALL CHECKS PASSED — safe to open PR");
        for (const w of warnings) {
            console.log(`   ⚠  [${w.kind}] ${w.message}`);
        }
        return 0;
    }

    console.log("❌ VALIDATION FAILED\n");
    for (const f of failures) {
        console.log(`   ✗ [${f.kind}] ${f.message}`);
    }
    for (const w of warnings) {
        console.log(`   ⚠  [${w.kind}] ${w.message}`);
    }
    console.log(`\n${failures.length} check(s) failed. Fix the above before requesting a PR.`);
    return 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI entry
// ═══════════════════════════════════════════════════════════════════════════

type ParsedArgs = { readonly repo: string; readonly branch: string } | { readonly error: string };

function flagValue(argv: readonly string[], flag: string): string | undefined {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
    const repo = flagValue(argv, "--repo");
    const branch = flagValue(argv, "--branch");
    if (repo === undefined) { return { error: "Missing --repo <path> argument" }; }
    if (branch === undefined) { return { error: "Missing --branch <name> argument" }; }
    return { repo, branch };
}

async function main(): Promise<void> {
    const parsed = parseArgs(process.argv.slice(2));
    if ("error" in parsed) {
        console.error(`Usage: npx tsx scripts/validate-pr.ts --repo <path> --branch <branch>\n  ${parsed.error}`);
        process.exit(1);
    }

    const repoPath = resolve(parsed.repo);
    const pkgResult = readPackageJson(repoPath);
    if (!pkgResult.ok) {
        console.error(`❌ VALIDATION FAILED\n   ✗ ${pkgResult.reason}`);
        process.exit(1);
    }

    const results = await runAllChecks(repoPath, parsed.branch, pkgResult.pkg);
    process.exit(report(results));
}

await main();
