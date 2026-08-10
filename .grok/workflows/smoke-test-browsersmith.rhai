let meta = #{
    name: "smoke-test-browsersmith",
    description: "Install browsersmith from npm in a clean temp directory, write a small fetch application, verify it works end-to-end, then clean up.",
    phases: [
        #{ title: "Setup", detail: "create temp dir, install browsersmith from npm" },
        #{ title: "Build", detail: "write a small application that fetches pages" },
        #{ title: "Verify", detail: "run the app, assert it gets real responses" },
        #{ title: "Cleanup", detail: "remove temp dir" },
    ],
};

// ── Guards ──────────────────────────────────────────────────────────────────
let version = if args == () { () } else {
    let t = type_of(args);
    if t == "string" { () } else { args.version }
};

// Optional dependency overrides — e.g. #{ "tls": "0.4.2" }
// These are force-installed AFTER browsersmith to override nested stale deps
let dep_overrides = if args == () { () } else {
    let t = type_of(args);
    if t == "string" { () } else { args.deps }
};

// Default to latest published version
let pkg_version = "latest";
if version != () {
    pkg_version = version;
    log("Using browsersmith@" + pkg_version);
}

// Build override install command
let override_cmd = "";
if dep_overrides != () {
    log("Applying dependency overrides");
    let keys = keys_of(dep_overrides);
    for k in keys {
        let v = dep_overrides[k];
        override_cmd += "npm install @browsercore/" + k + "@" + v + " --save\n";
        log("  Override: @browsercore/" + k + "@" + v);
    }
}

let tmp_dir = "/tmp/browsersmith-smoke-" + pkg_version;

// ── Phase 1: Setup ──────────────────────────────────────────────────────────
phase("Setup");

let setup_prompt = "Create a clean test directory and install browsersmith from npm.\n"
    + "Run these commands:\n"
    + "1. rm -rf " + tmp_dir + "\n"
    + "2. mkdir -p " + tmp_dir + "\n"
    + "3. cd " + tmp_dir + "\n"
    + "4. npm init -y\n"
    + "5. npm install browsersmith@" + pkg_version + "\n";

if override_cmd != "" {
    setup_prompt += "6. Apply dependency overrides (force latest versions):\n"
        + override_cmd;
    setup_prompt += "7. npm install tsx --save-dev\n"
        + "8. Report: installed browsersmith version, all @browsercore/* versions in node_modules, any errors\n";
} else {
    setup_prompt += "6. npm install tsx --save-dev\n"
        + "7. Report: installed browsersmith version, total install size, any errors\n";
}

setup_prompt += "\nIf the install fails, report the exact error.\n"
    + "IMPORTANT: After all installs, run this to verify no stale nested deps:\n"
    + "  find node_modules/@browsercore -name package.json -exec grep version {} \\; 2>/dev/null | sort | uniq -c | sort -rn\n"
    + "Report any package with multiple versions (dedup issues).";

let setup_result = agent(
    setup_prompt,
    #{
        label: "setup",
        capability_mode: "all",
    }
);
log("Setup: " + setup_result.output);

if !setup_result.success {
    complete(#{
        summary: "Smoke test FAILED at setup",
        phase: "setup",
        error: setup_result.output,
    });
}

// ── Phase 2: Build ──────────────────────────────────────────────────────────
phase("Build");

let build_result = agent(
    "Write a small application to " + tmp_dir + "/test-fetch.mjs that uses browsersmith to fetch pages.\n\n"
    + "The application should:\n"
    + "1. Import { fetch, PROFILES, platform } from 'browsersmith'\n"
    + "2. Fetch https://example.com with a Chrome profile\n"
    + "3. Fetch https://httpbin.org/get to verify JSON parsing\n"
    + "4. Fetch https://httpbin.org/redirect/2 to verify redirect handling\n"
    + "5. Fetch https://httpbin.org/cookies/set?test=value to verify cookie handling\n"
    + "6. Print a structured report for each fetch: URL, status code, response size, timing\n"
    + "7. Handle errors gracefully (try/catch, print FetchError details)\n"
    + "8. Exit 0 on success, exit 1 on any failure\n\n"
    + "Write the file using write or search_replace. Do NOT install additional deps —\n"
    + "browsersmith bundles everything needed. Use .mjs extension for ESM.\n\n"
    + "Also write a package.json with { \"type\": \"module\", \"scripts\": { \"test\": \"node test-fetch.mjs\" } }",
    #{
        label: "build-test-app",
        capability_mode: "all",
    }
);
log("Build: " + build_result.output);

if !build_result.success {
    complete(#{
        summary: "Smoke test FAILED at build",
        phase: "build",
        error: build_result.output,
    });
}

// ── Phase 3: Verify ─────────────────────────────────────────────────────────
phase("Verify");

let verify_result = agent(
    "Run the smoke test application and verify results.\n\n"
    + "Run these commands:\n"
    + "1. cd " + tmp_dir + "\n"
    + "2. node test-fetch.mjs\n"
    + "3. Capture the full output\n\n"
    + "If the test passes (exit 0), report the structured results for each fetch.\n"
    + "If the test fails (exit non-zero), capture stderr and report:\n"
    + "- Which fetch failed\n"
    + "- The error type and message\n"
    + "- Whether it's a network issue (timeout, DNS, connection refused) or a code bug\n\n"
    + "Also verify:\n"
    + "- The example.com response contains '<html>' (real HTML)\n"
    + "- The httpbin.org/get response has valid JSON with headers\n"
    + "- Redirect handling produces a 200 final response\n"
    + "- Cookie set returns successfully",
    #{
        label: "verify",
        capability_mode: "all",
    }
);
log("Verify: " + verify_result.output);

// ── Phase 4: Cleanup ────────────────────────────────────────────────────────
phase("Cleanup");

let cleanup_result = agent(
    "Clean up the smoke test directory.\n"
    + "Run: rm -rf " + tmp_dir + "\n"
    + "Report whether cleanup succeeded.",
    #{
        label: "cleanup",
        capability_mode: "execute",
    }
);
log("Cleanup: " + cleanup_result.output);

// ── Summary ─────────────────────────────────────────────────────────────────
// Check actual test results, not just agent success
let verify_text = verify_result.output;
let has_fail = contains_str(verify_text, "FAILED");
let has_pass = contains_str(verify_text, "PASSED");
let tests_passed = has_pass && !has_fail;

complete(#{
    summary: if tests_passed { "Smoke test PASSED — browsersmith fetches real pages" } else { "Smoke test FAILED — see verify_output" },
    version: pkg_version,
    passed: tests_passed,
    verify_output: verify_result.output,
    cleanup: cleanup_result.output,
});

fn contains_str(haystack, needle) {
    // Rhai string contains check
    haystack.contains(needle)
}
