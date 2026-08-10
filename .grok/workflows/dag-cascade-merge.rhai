let meta = #{
    name: "dag-cascade-merge",
    description: "Orchestrate a DAG layer merge cascade: scan PRs, fix failing ones, merge green ones via gatekeeper, verify npm publish.",
    phases: [
        #{ title: "Scan", detail: "discover open PRs and CI status" },
        #{ title: "Fix", detail: "dispatch specialists to fix failing PRs" },
        #{ title: "Merge", detail: "gatekeeper validates and merges" },
        #{ title: "Verify", detail: "check npm publish" },
    ],
};

// ── Guards ──────────────────────────────────────────────────────────────────
let layer = ();
if args != () {
    let t = type_of(args);
    if t != "string" { layer = args.layer; }
}
if layer == () { pause("verification", "Pass args.layer (0-5 or 'all')."); }

// ── Resolve repos for the requested layer(s) ────────────────────────────────
let all_repos = [];

if layer == 0 || layer == "all" {
    all_repos.push("contracts"); all_repos.push("compression"); all_repos.push("crypto");
    all_repos.push("cookies"); all_repos.push("profiles"); all_repos.push("dev");
}
if layer == 1 || layer == "all" { all_repos.push("transport"); }
if layer == 2 || layer == "all" { all_repos.push("tls"); all_repos.push("http1"); all_repos.push("http2"); }
if layer == 3 || layer == "all" { all_repos.push("fetch"); all_repos.push("quic"); }
if layer == 4 || layer == "all" { all_repos.push("testing"); all_repos.push("http3"); all_repos.push("devtools"); }
if layer == 5 || layer == "all" { all_repos.push("browsersmith"); }

// ── Phase 1: Scan ───────────────────────────────────────────────────────────
phase("Scan");

let scan_jobs = [];
for repo in all_repos {
    let r = repo;
    let prompt = "Check @browsercore/" + r + " repo state.\n"
        + "cd /Users/matte/projects/jail/ruflo/basement/browsercore-" + r + " && "
        + "echo 'BRANCH:' && git branch --show-current && "
        + "echo 'PRS:' && gh pr list --state open --json number,title,headRefName 2>/dev/null && "
        + "echo 'NPM:' && npm view @browsercore/" + r + " version 2>/dev/null && "
        + "echo 'LOCAL:' && grep version package.json | head -1";
    scan_jobs.push(#{
        prompt: prompt,
        label: "scan:" + r,
        capability_mode: "execute",
    });
}

let scan_results = parallel(scan_jobs);

let green_repos = [];
let red_repos = [];
let nop_rrepos = [];
let i = 0;
for r in scan_results {
    let repo_name = all_repos[i];
    if r != () && r.success {
        log("scan:" + repo_name + " done");
    }
    i += 1;
}

// ── Phase 2: Deep-check CI + fix failing ────────────────────────────────────
phase("Fix");

let fix_jobs = [];
for repo in all_repos {
    let r = repo;
    let at = get_agent_for_repo(r);
    let prompt = "Check and fix CI for @browsercore/" + r + ".\n"
        + "cd /Users/matte/projects/jail/ruflo/basement/browsercore-" + r + "\n"
        + "1. gh pr list --state open --json number,statusCheckRollup\n"
        + "2. If there's a PR with failing CI, read the failure logs:\n"
        + "   gh run view --log-failed --repo jverneuer/browsercore-" + r + "\n"
        + "3. Fix all typecheck, lint, and test errors\n"
        + "4. Run: npx tsc -p tsconfig.json --noEmit && npx oxlint src/ && npx vitest run\n"
        + "5. Commit and push on the current branch\n"
        + "6. DO NOT merge — gatekeeper handles that\n"
        + "7. If no PR exists or CI is already green, report 'NO_ACTION_NEEDED'\n"
        + "Read .claude/code-standards.md first.";
    fix_jobs.push(#{
        prompt: prompt,
        label: "fix:" + r,
        agent_type: at,
        capability_mode: "all",
    });
}

if fix_jobs.len() > 0 {
    let fix_results = parallel(fix_jobs);
    for r in fix_results {
        if r != () && r.success { log("fix: " + r.output); }
    }
}

// ── Phase 3: Merge via gatekeeper ───────────────────────────────────────────
phase("Merge");

let merge_jobs = [];
for repo in all_repos {
    let r = repo;
    let prompt = "Validate and merge the open PR for @browsercore/" + r + ".\n"
        + "1. cd /Users/matte/projects/jail/ruflo/basement/browsercore-" + r + "\n"
        + "2. Get PR number: gh pr list --state open --json number\n"
        + "3. Run validate-pr: npx tsx /Users/matte/projects/jail/ruflo/basement/browsercore-dev/scripts/validate-pr.ts"
        + " --repo /Users/matte/projects/jail/ruflo/basement/browsercore-" + r
        + " --branch $(git branch --show-current)\n"
        + "4. If validation passes and CI is green, merge:\n"
        + "   gh pr merge --squash --delete-branch --repo jverneuer/browsercore-" + r + "\n"
        + "5. If no PR exists, report 'NO_PR'. If CI fails, report 'CI_RED'.\n"
        + "NEVER fix code — you are a GATE.";
    merge_jobs.push(#{
        prompt: prompt,
        label: "merge:" + r,
        agent_type: "pr-gatekeeper",
        capability_mode: "all",
    });
}

if merge_jobs.len() > 0 {
    let merge_results = parallel(merge_jobs);
    for r in merge_results {
        if r != () && r.success { log("merge: " + r.output); }
    }
}

// ── Phase 4: Verify npm publish ─────────────────────────────────────────────
phase("Verify");

let verify_jobs = [];
for repo in all_repos {
    let r = repo;
    let prompt = "Verify @browsercore/" + r + " npm publish status.\n"
        + "Run: npm view @browsercore/" + r + " version\n"
        + "Compare with local package.json version.\n"
        + "Report: PUBLISHED (version X) or NOT_YET";
    verify_jobs.push(#{
        prompt: prompt,
        label: "verify:" + r,
        capability_mode: "execute",
    });
}

if verify_jobs.len() > 0 {
    let verify_results = parallel(verify_jobs);
    for r in verify_results {
        if r != () && r.success { log("verify: " + r.output); }
    }
}

// ── Summary ─────────────────────────────────────────────────────────────────
complete(#{
    summary: "DAG cascade complete for layer " + layer,
    repos_scanned: all_repos,
});

// ── Helpers ─────────────────────────────────────────────────────────────────
fn get_agent_for_repo(repo) {
    if repo == "tls" || repo == "http2" || repo == "http3" || repo == "quic" { return "protocol-engineer"; }
    if repo == "crypto" || repo == "compression" || repo == "transport" || repo == "contracts" { return "platform-engineer"; }
    if repo == "fetch" || repo == "cookies" || repo == "http1" { return "fetch-engineer"; }
    if repo == "testing" { return "test-engineer"; }
    if repo == "browsersmith" { return "integration-engineer"; }
    if repo == "profiles" { return "fingerprint-engineer"; }
    return "general-purpose";
}
