let meta = #{
    name: "review-pr",
    description: "Multi-dimensional code review of a PR: fetch diff, fan out one reviewer per dimension (layer discipline, platform invariant, coverage, contracts, documentation), then deduplicate and prioritize findings.",
    phases: [
        #{ title: "Fetch", detail: "retrieve the PR diff via gh pr diff" },
        #{ title: "Review", detail: "one reviewer per dimension, fanned out in parallel" },
        #{ title: "Synthesize", detail: "deduplicate and prioritize Critical > Major > Minor" },
    ],
};

// ── Schemas ─────────────────────────────────────────────────────────────────
let findings_schema = #{
    "type": "object",
    "required": ["findings"],
    "properties": #{
        "findings": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["file", "severity", "issue"],
                "properties": #{
                    "file": #{ "type": "string" },
                    "severity": #{ "type": "string", "enum": ["Critical", "Major", "Minor"] },
                    "issue": #{ "type": "string" },
                    "suggestion": #{ "type": "string" },
                },
            },
        },
    },
};

// ── Guards ──────────────────────────────────────────────────────────────────
// Property access on unit throws, so guard `args` itself before touching fields.
if args == () {
    pause("verification", "Pass args.pr_number and args.repo (e.g. args = #{ pr_number: 42, repo: 'quic' }).");
}
let args_type = type_of(args);
if args_type == "string" {
    pause("verification", "Pass args as an object: #{ pr_number: 42, repo: 'quic' }.");
}

let pr = args.pr_number;
let repo_name = args.repo;
if pr == () { pause("verification", "args.pr_number is required (the PR number to review)."); }
if repo_name == () { pause("verification", "args.repo is required (e.g. 'quic', 'tls', 'browsersmith')."); }

// ── Helpers ─────────────────────────────────────────────────────────────────
fn repo_path_for(name) {
    if name == "browsersmith" {
        return "/Users/matte/projects/jail/ruflo/basement/browsersmith";
    }
    return "/Users/matte/projects/jail/ruflo/basement/browsercore-" + name;
}

fn layer_for(name) {
    if name == "contracts" || name == "compression" || name == "crypto" || name == "cookies" || name == "profiles" || name == "dev" { return 0; }
    if name == "transport" { return 1; }
    if name == "tls" || name == "http1" || name == "http2" { return 2; }
    if name == "fetch" || name == "quic" { return 3; }
    if name == "testing" || name == "http3" || name == "devtools" { return 4; }
    if name == "browsersmith" { return 5; }
    return -1;
}

fn sev_rank(s) {
    if s == "Critical" { return 3; }
    if s == "Major" { return 2; }
    return 1;
}

fn join_dims(dims) {
    let s = "";
    let i = 0;
    while i < dims.len() {
        if i > 0 { s += ", "; }
        s += dims[i];
        i += 1;
    }
    return s;
}

// Dimension-specific checks. layer/repo parametrize the layer-discipline text.
fn checks_for(name, layer, repo) {
    if name == "layer-discipline" {
        let s = "";
        s += "- The repo is at layer " + layer.to_string() + ". No file may import from a HIGHER-layer @browsercore/* package.\n";
        s += "  Layer order: 0 contracts/compression/crypto/cookies/profiles/dev; 1 transport; 2 tls/http1/http2; 3 fetch/quic; 4 testing/http3/devtools; 5 browsersmith.\n";
        s += "- No cross-protocol dependencies: e.g. http1 must not import from http2/http3, tls must not import from quic, fetch must not import from quic internals.\n";
        s += "- Use grep on import statements across src/ for '@browsercore/' references and flag any that violate layering or cross into another protocol's package.\n";
        return s;
    }
    if name == "platform-invariant" {
        let s = "";
        s += "- Protocol/leaf packages must NOT import node:* builtins (node:crypto, node:fs, node:net, node:buffer, ...) directly in src/. Use grep for 'node:'.\n";
        s += "- Runtime dependencies must be threaded through a Platform object via options/constructor injection, NOT imported as globals or singletons.\n";
        s += "- Events must use the injected EventProvider, not Node's EventEmitter directly.\n";
        s += "- Flag any node:* import or ad-hoc global/singleton usage that bypasses Platform injection.\n";
        return s;
    }
    if name == "coverage-impact" {
        let s = "";
        s += "- Identify test files (*.test.ts, *.spec.ts, __tests__/) added, removed, or modified in the diff.\n";
        s += "- Identify new non-test source that lacks accompanying tests; estimate coverage impact (untested branches/functions).\n";
        s += "- Flag removed tests that reduce coverage and new public API/functions with no test coverage.\n";
        s += "- Use grep to find the test files and read_file to confirm what they actually cover.\n";
        return s;
    }
    if name == "contracts-adherence" {
        let s = "";
        s += "- Shared types/interfaces must be imported from '@browsercore/contracts', not from sibling packages.\n";
        s += "- Use grep for imports from '@browsercore/<sibling>' where the symbol is a shared type that belongs in contracts.\n";
        s += "- Flag any type re-exported or duplicated across siblings that should live in contracts.\n";
        return s;
    }
    // documentation
    let s = "";
    s += "- README and inline comments must reflect the CURRENT architecture.\n";
    s += "- References should say EventProvider (not EventEmitter), Platform composition/injection (not global singletons), and @browsercore/contracts types (not implementation paths).\n";
    s += "- Flag stale comments, outdated README sections, leaked local setup notes (npm link, workspace paths), or doc that contradicts the code.\n";
    s += "- Use read_file on README.md and the changed source files to verify comments match reality.\n";
    return s;
}

// Deduplicate by file + issue (across dimensions), merging dimension lists and
// escalating severity (Critical > Major > Minor). Rhai binds maps by value, so
// we mutate a local copy and write it back via index assignment.
fn dedup_findings(findings) {
    let keys = [];
    let out = [];
    let dim_sets = [];
    for f in findings {
        let key = f.file + "|" + f.issue;
        let k = -1;
        let j = 0;
        while j < keys.len() {
            if keys[j] == key { k = j; }
            j += 1;
        }
        if k == -1 {
            keys.push(key);
            dim_sets.push([f.dimension]);
            out.push(f);
        } else {
            let curlist = dim_sets[k];
            let newlist = [];
            let has = false;
            for d in curlist {
                newlist.push(d);
                if d == f.dimension { has = true; }
            }
            if !has { newlist.push(f.dimension); }
            dim_sets[k] = newlist;
            if sev_rank(f.severity) > sev_rank(out[k].severity) {
                let rec = out[k];
                rec.severity = f.severity;
                out[k] = rec;
            }
        }
    }
    let i = 0;
    while i < out.len() {
        let rec = out[i];
        rec.dimensions = dim_sets[i];
        out[i] = rec;
        i += 1;
    }
    return out;
}

fn render_bucket(label, bucket) {
    let s = "### " + label + " (" + bucket.len().to_string() + ")\n\n";
    if bucket.len() == 0 {
        s += "_None._\n\n";
        return s;
    }
    let n = 1;
    for f in bucket {
        s += n.to_string() + ". [" + join_dims(f.dimensions) + "] `" + f.file + "`\n";
        s += "   - " + f.issue + "\n";
        if f.suggestion != () && f.suggestion != "" {
            s += "   - Suggestion: " + f.suggestion + "\n";
        }
        s += "\n";
        n += 1;
    }
    return s;
}

// ── Resolve repo context ────────────────────────────────────────────────────
let rpath = repo_path_for(repo_name);
let layer = layer_for(repo_name);

// ── Phase 1: Fetch ──────────────────────────────────────────────────────────
phase("Fetch");

let fetch_prompt = "";
fetch_prompt += "Get the full diff for PR #" + pr.to_string() + " in the repo at " + rpath + ".\n";
fetch_prompt += "Run: cd " + rpath + " && gh pr diff " + pr.to_string() + "\n";
fetch_prompt += "Return ONLY the raw diff text. Do not summarize, explain, or truncate. If the command fails, return the empty string.";

let fetch_result = agent(fetch_prompt, #{ label: "fetch-diff", capability_mode: "execute" });

let diff = "";
if fetch_result != () && fetch_result.success {
    diff = fetch_result.output;
}

if diff == "" {
    log("Failed to fetch diff for PR #" + pr.to_string() + " in " + repo_name);
    complete(#{
        summary: "Could not retrieve diff for PR #" + pr.to_string() + " in " + repo_name,
        repo: repo_name,
        pr_number: pr,
        findings: [],
        error: "diff fetch failed",
    });
}

log("Fetched diff for PR #" + pr.to_string() + " (" + diff.len().to_string() + " chars)");

// ── Phase 2: Review (parallel fan-out, one agent per dimension) ─────────────
phase("Review");

let diff_enc = json_encode(diff);
let ctx = "Repo: @browsercore/" + repo_name + " (layer " + layer.to_string() + ") at " + rpath + " | PR #" + pr.to_string();

let dimensions = [
    #{ name: "layer-discipline", focus: "layer discipline and import hygiene" },
    #{ name: "platform-invariant", focus: "platform invariant (no node:* in protocol code; Platform via options)" },
    #{ name: "coverage-impact", focus: "test coverage impact" },
    #{ name: "contracts-adherence", focus: "contracts adherence" },
    #{ name: "documentation", focus: "documentation accuracy" },
];

let review_jobs = [];
for d in dimensions {
    let checks = checks_for(d.name, layer, repo_name);
    let p = "";
    p += "You are reviewing PR #" + pr.to_string() + " in @browsercore/" + repo_name + " (layer " + layer.to_string() + ") for " + d.focus + ".\n\n";
    p += "Context: " + ctx + "\n\n";
    p += "DIFF (JSON-encoded, authoritative for what changed):\n" + diff_enc + "\n\n";
    p += "Checks to perform:\n" + checks + "\n";
    p += "Method: use grep and read_file to inspect the ACTUAL source in " + rpath + " — do not answer from the diff alone. ";
    p += "Read .claude/code-standards.md and the repo's README if helpful. Report only findings you verified against the code.\n\n";
    p += "Report at most 12 findings as objects {file, severity, issue, suggestion}. ";
    p += "severity MUST be one of: Critical, Major, Minor. ";
    p += "An empty findings array is valid ONLY after you have inspected the code and found nothing. ";
    p += "Do not invent issues; if this dimension is clean, return [].";
    review_jobs.push(#{
        prompt: p,
        label: "review:" + d.name,
        capability_mode: "read-only",
        output_schema: findings_schema,
    });
}

log("Fanning out " + review_jobs.len().to_string() + " review dimensions");
let review_results = parallel(review_jobs);

// ── Phase 3: Synthesize ────────────────────────────────────────────────────
phase("Synthesize");

// Collect findings, tagging each with its dimension. parallel() preserves order.
let all_findings = [];
let di = 0;
for r in review_results {
    if r != () && r.success && r.output.findings != () {
        for f in r.output.findings {
            all_findings.push(#{
                dimension: dimensions[di].name,
                file: f.file,
                severity: f.severity,
                issue: f.issue,
                suggestion: f.suggestion,
            });
        }
    }
    di += 1;
}

let deduped = dedup_findings(all_findings);

// Prioritize: bucket by severity, Critical > Major > Minor.
let critical = [];
let major = [];
let minor = [];
for f in deduped {
    if f.severity == "Critical" {
        critical.push(f);
    } else if f.severity == "Major" {
        major.push(f);
    } else {
        minor.push(f);
    }
}

// Per-dimension raw counts (for the report breakdown).
let dim_counts = #{ "layer-discipline": 0, "platform-invariant": 0, "coverage-impact": 0, "contracts-adherence": 0, "documentation": 0 };
for f in all_findings {
    dim_counts[f.dimension] = dim_counts[f.dimension] + 1;
}

let report = "";
report += "# PR Review: #" + pr.to_string() + " @browsercore/" + repo_name + "\n\n";
report += "- Repo: " + repo_name + " (layer " + layer.to_string() + ")\n";
report += "- Path: " + rpath + "\n";
report += "- Diff size: " + diff.len().to_string() + " chars\n\n";
report += "## Summary\n\n";
report += "- Raw findings: " + all_findings.len().to_string() + "\n";
report += "- After dedup: " + deduped.len().to_string() + "\n";
report += "- **Critical: " + critical.len().to_string() + "** | Major: " + major.len().to_string() + " | Minor: " + minor.len().to_string() + "\n\n";
report += "Findings by dimension: layer-discipline " + dim_counts["layer-discipline"].to_string()
    + ", platform-invariant " + dim_counts["platform-invariant"].to_string()
    + ", coverage-impact " + dim_counts["coverage-impact"].to_string()
    + ", contracts-adherence " + dim_counts["contracts-adherence"].to_string()
    + ", documentation " + dim_counts["documentation"].to_string() + "\n\n";
report += "## Findings (Critical > Major > Minor)\n\n";
report += render_bucket("Critical", critical);
report += render_bucket("Major", major);
report += render_bucket("Minor", minor);

let report_path = write_scratch_file("pr-review-report.md", report);

log("Synthesized " + deduped.len().to_string() + " findings: " + critical.len().to_string() + " critical, " + major.len().to_string() + " major, " + minor.len().to_string() + " minor");

complete(#{
    summary: "PR #" + pr.to_string() + " " + repo_name + ": " + critical.len().to_string() + " critical, " + major.len().to_string() + " major, " + minor.len().to_string() + " minor (of " + deduped.len().to_string() + " deduped)",
    repo: repo_name,
    layer: layer,
    pr_number: pr,
    diff_chars: diff.len(),
    raw_findings: all_findings.len(),
    deduped_findings: deduped.len(),
    findings: deduped,
    critical_count: critical.len(),
    major_count: major.len(),
    minor_count: minor.len(),
    report: report_path,
});
