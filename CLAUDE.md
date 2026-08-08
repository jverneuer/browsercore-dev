# @browsercore/dev — Swarm Control Plane

This repo is the **orchestration hub** for the @browsercore polyrepo (16 independent
git repos). It is NOT a monorepo — each repo publishes independently to npm.

## Session Start Protocol (MANDATORY)

Run this as your VERY FIRST action in every new session:

```bash
npx tsx scripts/memory-session.ts brief
```

Present the output as a summary:
- If active tasks exist → list them, offer to resume
- If open questions exist → surface them
- If nothing pending → "No leftovers — ready for new work"

Then WAIT for the user's choice.

## Dependency Graph

The 16 repos form a 6-layer DAG. View it with:

```bash
npx tsx scripts/resolve-graph.ts
```

```
Layer 0 (leaves): contracts, compression, crypto, cookies, profiles, dev
Layer 1:          transport
Layer 2:          tls, http1, http2
Layer 3:          fetch, quic
Layer 4:          testing, http3, devtools
Layer 5:          browsersmith (entry point)
```

Work flows bottom-up: fix contracts → bump transport → bump tls/fetch → bump browsersmith.

## Memory System

Location: `memory/` directory + SQLite DB at `.memory/browsercore.db`

**Search:**
```bash
npx tsx scripts/memory-query.ts search "TLS key schedule"
```

**List facts by scope:**
```bash
npx tsx scripts/memory-query.ts facts --scope architecture
```

**Open questions:**
```bash
npx tsx scripts/memory-query.ts questions
```

Conventions: `.claude/memory-conventions.md`

### Memory Usage Rules

The memory system is the **cross-session knowledge base**. Use it proactively:

- **SEARCH before starting work** — run `memory-query.ts search "<topic>"` to surface prior decisions, patterns, and architectural constraints before writing code
- **STORE after completing work** — when you make an architectural decision, fix a non-obvious bug, or learn a project pattern, record it as a fact:
  ```bash
  npx tsx scripts/memory-store.ts --scope architecture --key "platform-composition-root" --value "..."
  ```
- **UPDATE stale facts** — if a fact references outdated architecture (e.g. singletons instead of Platform injection), update it rather than duplicating
- **Scope facts correctly**: `architecture` (design decisions), `contracts` (interface shapes), `patterns` (recurring solutions), `operational` (tooling/CI), `bugs` (known issues + fixes)
- **Link related facts** — reference other fact keys when recording a decision that depends on or contradicts prior knowledge

Memory is how the system learns. Unrecorded knowledge is lost at session end.

## Agent System

Agent definitions: `agents/{type}/AGENT.md`

| Agent | Type | Expertise |
|-------|------|-----------|
| session-startup | bridge | Cross-session continuity |
| top-orchestrator | coordinator | DAG resolution, cross-repo dispatch |
| protocol-engineer | specialist | TLS, HTTP/2, HTTP/3, QUIC |
| platform-engineer | specialist | Platform adapters, crypto, transport |
| fetch-engineer | specialist | Fetch client, dispatch, cookies |
| fingerprint-engineer | specialist | Profiles, JA3/JA4, ClientHello |
| test-engineer | specialist | E2E gates, coverage, golden captures |
| integration-engineer | specialist | Browsersmith wiring, crawl API |

## Cross-Repo Workflow

When a fix touches a lower-layer package, all downstream packages must bump their dep:
1. Fix in the source repo → PR → CI → merge → auto-publish
2. Each downstream repo bumps its dep version → PR → CI → merge → publish
3. Work proceeds layer by layer (parallel within a layer)

### Version Bumping

- **Patch only by default** — only bump the lowest number (the `x` in `y.y.x`). Patch bumps are safe and can be done freely.
- **Never skip a version** — each bump increments by exactly one. Going from `0.2.1` to `0.2.3` (skipping `0.2.2`) is forbidden. Every intermediate version must exist on npm.
- **Minor/major bumps need confirmation** — any bump to the middle or first number (`y.x.x` → `y.(x+1).0` or `(y+1).0.0`) requires explicit user approval. These signal breaking changes or feature milestones and the user controls the narrative.
- **Publish order matters** — upstream packages must publish before downstream packages can bump their deps. A version bump in a downstream package is only valid after the upstream version it references is live on npm.

### PR Health Verification

Always verify PR status before reporting completion:
```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup
gh run view <runId> --repo jverneuer/<repo> --log-failed
```

**NPM cascade failures are expected.** When a PR introduces a new interface or type in a lower-layer package (e.g. contracts), downstream PRs will fail typecheck until that package is published to npm and the dep is bumped. This is normal polyrepo mechanics — resolve it at the end by publishing in DAG order (Layer 0 → 1 → 2 → 3 → 4 → 5), not by blocking every PR.

Distinguish:
- **Cascade failure** (expected) — missing export from `@browsercore/*` that was just added in another open PR. No action needed until publish time.
- **Real bug** (fix now) — lint errors, type errors in the repo's own code, coverage threshold drops from moved tests, wrong import style. These must be fixed before the PR can merge.

### Definition of Done

A task is complete only when **all** of the following are true:
1. Code compiles (`typecheck` passes) and lint is clean
2. **Tests pass with sufficient coverage** — each repo enforces a minimum threshold (typically ≥90% statements/branches/functions/lines). When moving code between repos, coverage must be restored in BOTH: the source repo (add tests for remaining code) and the destination repo (tests for the moved code). Never let a PR land with a coverage drop.
3. **README updated** to reflect any API, architecture, or dependency changes
4. **Inline comments updated** — every file touched must have its header/inline comments reflect the current architecture (e.g. `EventProvider` not `EventEmitter`, Platform injection not singletons)
5. No local environment noise leaked into docs (see below)

### Documentation Hygiene

**NEVER** pollute comments, READMEs, or docs with local setup instructions:
- No `npm install # pulls in @browsercore/dev (file:../dev locally)`
- No workspace-specific paths, `npm link` instructions, or "how to set up this monorepo" notes
- READMEs describe **what the package is and how to use it**, not how to develop the polyrepo

Inline comments must always reflect the **current** architecture:
- Reference injected `EventProvider`, not `EventEmitter`
- Reference Platform composition root, not global singletons
- Reference `@browsercore/contracts` types, not implementation-specific paths

## The Repos

All repos live under `../` (sibling directories). Each is its own git repo:

| Package | Repo | Layer |
|---------|------|-------|
| @browsercore/contracts | jverneuer/browsercore-contracts | 0 |
| @browsercore/compression | jverneuer/browsercore-compression | 0 |
| @browsercore/crypto | jverneuer/browsercore-crypto | 0 |
| @browsercore/cookies | jverneuer/browsercore-cookies | 0 |
| @browsercore/profiles | jverneuer/browsercore-profiles | 0 |
| @browsercore/dev | jverneuer/browsercore-dev | 0 |
| @browsercore/transport | jverneuer/browsercore-transport | 1 |
| @browsercore/tls | jverneuer/browsercore-tls | 2 |
| @browsercore/http1 | jverneuer/browsercore-http1 | 2 |
| @browsercore/http2 | jverneuer/browsercore-http2 | 2 |
| @browsercore/fetch | jverneuer/browsercore-fetch | 3 |
| @browsercore/quic | jverneuer/browsercore-quic | 3 |
| @browsercore/testing | jverneuer/browsercore-testing | 4 |
| @browsercore/http3 | jverneuer/browsercore-http3 | 4 |
| @browsercore/devtools | jverneuer/browsercore-devtools | 4 |
| browsersmith | jverneuer/browsersmith | 5 |

## Coding Standards

All repos share the same toolchain. Violations fail CI — there are no exceptions.

### TypeScript

- **Strict mode** enabled everywhere (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **verbatimModuleSyntax** — use `import type` for type-only imports; never import a type as a value
- **No `any`** — `typescript/no-explicit-any` is an error
- **No non-null assertions** — `typescript/no-non-null-assertion` is an error; use proper narrowing
- **Consistent type imports** — `typescript/consistent-type-imports` is an error; always qualify type-only imports
- **No `ban-ts-comment`** — never use `@ts-ignore` / `@ts-expect-error`; fix the root cause
- Target `ES2022`, module `Node16`, module resolution `Node16`

### Lint (oxlint)

Plugins: `typescript`, `unicorn`, `import`. All correctness/suspicious/pedantic rules are errors.

Key rules:
- `prefer-node-protocol` — import node builtins as `node:fs`, not `fs`
- `prefer-const`, `object-shorthand`, `curly`, `eqeqeq`, `no-var`
- `no-console` (warn), `no-debugger` (error)
- `import/no-cycle` — no circular dependencies between modules
- `import/no-duplicates`, `import/no-self-import`
- `no-unreachable`, `no-constant-condition`, `no-self-compare`
- `no-useless-constructor`, `no-unneeded-ternary`, `no-template-curly-in-string`

Style rules are intentionally off (`style: "off"`) — correctness only, let the formatter handle style.

### Design

- **Interface-first** — define contracts in `@browsercore/contracts`, implement elsewhere
- **Branded types / discriminated unions** — make invalid states unrepresentable
- **Composition over inheritance** — inject `EventProvider` rather than extending `EventEmitter`
- **No global singletons** — everything flows through the Platform object

## CI

Every repo uses the same reusable CI workflow (`.github/workflows/reusable-ci.yml`).
It runs: `npm install → typecheck → lint → test --coverage → build → publish`.
CI auto-publishes on merge to main (NPM_TOKEN in GitHub secrets).
