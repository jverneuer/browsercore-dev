# QA Specialists

Each specialist is a focused subagent that performs one type of QA and posts a comment on the PR.

## qa-code-review
- **Scope:** Source code changes (`src/*.ts`, `*.ts`)
- **Actions:**
  - Read the diff and surrounding code
  - Check for: correct error handling, no `any`, proper async/await, no `_`-prefix privates, no suppressed rules without justification, immutability, exhaustiveness
  - Verify changes match the PR description
- **Output:** PR comment with findings (issues found or "✅ Code quality: clean")

## qa-typecheck
- **Scope:** TypeScript correctness
- **Actions:** `npm run typecheck`
- **Output:** PR comment with result (pass + output, or fail with specific errors)

## qa-lint
- **Scope:** Lint + coding standards
- **Actions:** `npm run lint -- --deny-warnings`
- **Output:** PR comment with result

## qa-test
- **Scope:** Test suite
- **Actions:** `npm test`
- **Output:** PR comment with result (pass count, failures if any)

## qa-build
- **Scope:** Build pipeline
- **Actions:** `npm run build`
- **Output:** PR comment with result

## qa-exports
- **Scope:** Package entrypoints
- **Actions:** Verify every key in `package.json` `exports` resolves to a real file
- **Output:** PR comment listing each export and whether it resolves

## qa-install
- **Scope:** Dependency resolution
- **Actions:** `npm install` — verify no errors, check node_modules
- **Output:** PR comment with result

## qa-docs
- **Scope:** README and documentation
- **Actions:** Check README has: badges, install, usage, scripts table, license. Verify no broken links or stale references.
- **Output:** PR comment with findings

## qa-ci
- **Scope:** GitHub Actions workflows
- **Actions:** Validate YAML syntax, check checkout paths are valid (no `../` outside workspace), verify secret names exist
- **Output:** PR comment with findings

## Rules for ALL specialists
1. Always paste REAL command output — never fabricate results
2. If a check fails, explain WHY with specific file:line references
3. If a failure is PRE-EXISTING on main (not caused by this PR), say so explicitly
4. Be concise — bullet lists, not essays
5. Post exactly ONE comment per specialist per PR
6. If your scope doesn't apply (e.g., qa-ci for a docs-only PR), skip silently
