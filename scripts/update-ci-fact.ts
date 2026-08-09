import { getMemoryDb, ensureSchema, createFact, type Scope } from "./memory-db.ts";

async function main(): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);

    await db.prepare("DELETE FROM facts WHERE id = ?").run("bugs/ci-heredoc-bash-syntax");
    await createFact(db, {
        id: "bugs/ci-heredoc-bash-syntax",
        scope: "bugs" as Scope,
        statement: "The reusable CI workflow had a bash heredoc indented inside a YAML run block. The ENDSCRIPT delimiter was indented with spaces but bash heredocs require the closing delimiter at column 0. Bash never closed the heredoc, tried to parse JS as bash — syntax error near unexpected token. The publish step failed with exit code 2.",
        base_confidence: 1.0,
        coupling: "browsercore-dev/.github/workflows/reusable-ci.yml",
        detail: "Affected ALL repos using the reusable CI. The publish job showed conclusion: failure but npm publish itself succeeded (version was pushed before the release notes step ran). Fix: replaced heredoc with node -e inline script.",
        agents_must_know: "- NEVER use indented heredocs in GitHub Actions YAML\n- Use node -e with careful escaping instead\n- The publish job failing does NOT mean npm publish failed — check npm directly\n- ALWAYS verify actual CI failure with gh run view --log-failed, not just job conclusions",
    });

    console.log("Memory stored: bugs/ci-heredoc-bash-syntax");
}

main().catch(console.error);
