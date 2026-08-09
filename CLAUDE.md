# @browsercore/dev — Swarm Control Plane

This repo is the **orchestration hub** for the @browsercore polyrepo (16 independent
git repos). It is NOT a monorepo — each repo publishes independently to npm.

## Session Start Protocol (MANDATORY)

Run this as your VERY FIRST action in every new session — before any investigation, code changes, or exploration:

```bash
npx tsx scripts/memory-session.ts brief
```

**If the command fails** with "failed to open file" or "entity not found", the memory DB is missing (`.memory/browsercore.db` was deleted or not yet created). Rebuild it immediately:

```bash
mkdir -p .memory
npx tsx scripts/seed-memory.ts
npx tsx scripts/memory-session.ts brief
```

Present the output as a summary:
- If active tasks exist → list them, offer to resume
- If open questions exist → surface them
- If nothing pending → "No leftovers — ready for new work"

Then WAIT for the user's choice.

**Skipping the session brief is forbidden.** The memory DB holds cross-session architecture decisions, bug fixes, and operational context. Every session starts with it — no exceptions, no "I'll check later."

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

**The `.memory/` directory is tracked by git.** It was previously gitignored, which caused permanent data loss when repos were re-cloned. If `.memory/` appears in `.gitignore` again, remove it immediately — the DB is the cross-session knowledge base and must be committed.

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

**Rebuild the DB from seed** (if DB is missing or corrupted):
```bash
mkdir -p .memory
npx tsx scripts/seed-memory.ts
```

Conventions: `.claude/memory-conventions.md`

### Memory Usage Rules

The memory system is the **cross-session knowledge base**. Use it proactively:

- **SEARCH before starting work** — run `memory-query.ts search "<topic>"` to surface prior decisions, patterns, and architectural constraints before writing code
- **STORE after completing work** — when you make an architectural decision, fix a non-obvious bug, or learn a project pattern, record it as a fact. Use the helper scripts in `scripts/update-*.ts` (they call `createFact` from `memory-db.ts`) or write a new one following the same pattern.
- **UPDATE stale facts** — if a fact references outdated architecture (e.g. singletons instead of Platform injection), update it rather than duplicating
- **Scope facts correctly**: `architecture` (design decisions), `contracts` (interface shapes), `patterns` (recurring solutions), `operational` (tooling/CI), `bugs` (known issues + fixes)
- **Link related facts** — reference other fact keys when recording a decision that depends on or contradicts prior knowledge

Memory is how the system learns. Unrecorded knowledge is lost at session end.

## Agent System

Agent definitions: `agents/{type}/AGENT.md`. Every agent **must** read `.claude/code-standards.md` before writing any code — it is the binding standard for all repos.

### Agent Orchestration Rules

- **Parallelize aggressively** — whenever a task has 3+ independent work items (repos, phases, file groups), dispatch one agent per item in parallel. Serial agent dispatch is a last resort, not a default.
- **Consistency verification** — if more than 5 agents have touched the same folder or repo, dispatch a dedicated review agent to verify consistency: same patterns, same style, same conventions applied everywhere. Inconsistencies become a cleanup task.
- **One agent per repo per phase** — don't send two agents into the same repo at the same time; they'll conflict on branches and files. Sequence them or merge their scope into one agent.
- **Respect agent lifetime** — verify an agent is truly unresponsive (not just slow on mechanical changes) before killing it.
- **PR gatekeeper is mandatory** — NO agent may run `gh pr create` directly. All PR creation goes through the pr-gatekeeper agent, which runs `scripts/validate-pr.ts` first. If validation fails, the PR is not opened. Period.
- **The gatekeeper does NOT fix code** — it is a pure validation gate. If typecheck, lint, or tests fail, it rejects and reports the exact failure. Fixing is owned by the requesting agent or a dedicated fix agent.
- **Always run validate-pr before requesting a PR** — run `npx tsx scripts/validate-pr.ts --repo <path> --branch <branch>` locally before dispatching the gatekeeper. Fix any failures yourself first.

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
| pr-gatekeeper | gatekeeper | The ONLY agent that opens PRs; runs validate-pr first |

### Task-to-Agent Routing (MANDATORY)

**NEVER default to general-purpose.** Every task MUST be routed to the specialist that owns the repo/scope. Use this table to decide:

| If the task involves... | Use this agent | Why |
|------------------------|----------------|-----|
| **quic**, **http3**, **http2**, **tls** repo fixes or tests | `protocol-engineer` | Owns TLS, HTTP/2, HTTP/3, QUIC byte-level work |
| **crypto**, **compression**, **transport**, **contracts** repo fixes | `platform-engineer` | Owns Platform adapters, crypto, compression, transport |
| **fetch**, **cookies**, **http1** repo fixes | `fetch-engineer` | Owns Fetch client, dispatch, connection pool, cookies |
| **profiles** repo fixes, JA3/JA4 work | `fingerprint-engineer` | Owns profiles, fingerprint engineering |
| **testing** repo fixes, coverage, E2E gates | `test-engineer` | Owns traffic-server, golden captures, coverage enforcement |
| **browsersmith** repo fixes, crawl API, Platform wiring | `integration-engineer` | Owns the composition root where all packages meet |
| **Creating or merging ANY PR** | `pr-gatekeeper` | The ONLY agent allowed to create/merge PRs |
| **Multi-repo DAG dispatch** (3+ repos) | `top-orchestrator` | Owns DAG resolution and cross-repo parallel dispatch |
| **Continuity from prior session** | `session-startup` | Owns memory summarization and task resumption |

#### How to invoke a specialist

1. Read the agent's AGENT.md: `agents/{type}/AGENT.md`
2. Bake its rules, repos, and expertise into the subagent prompt
3. Use `model: sonnet` (as specified in agent frontmatter) unless otherwise noted
4. Dispatch one agent per repo per phase (parallel across repos, serial within a repo)

#### Anti-patterns (process violations)

- ❌ Using `general-purpose` for repo work when a specialist exists
- ❌ Running `gh pr create` from a non-gatekeeper agent
- ❌ Using `gatekeeper` to fix code (it only validates + merges)
- ❌ Dispatching two agents into the same repo simultaneously

### Agent Safety Rules

- **NEVER delete a repo directory** — no `rm -rf`, `rm -r`, or equivalent on `../browsercore-*` or `../browsersmith`. A rogue E2E agent deleted 10 repos on 2026-08-09, causing permanent memory DB loss. If a repo needs a clean checkout, `git clean -fdx` inside the repo — never remove the repo itself.
- **NEVER gitignore `.memory/`** — the SQLite DB at `.memory/browsercore.db` is the cross-session knowledge base. It must be tracked by git.
- **NEVER use `npm link` across repos** — it creates fragile symlinks that break on relocation. Use `file:` references in `package.json` for local development.

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

See `.claude/code-standards.md` for the full standard. Every agent **must** read it before writing code — it is the single source of truth for TypeScript strictness, oxlint rules, and design principles. Violations fail CI with no exceptions.

## CI

Every repo uses the same reusable CI workflow (`.github/workflows/reusable-ci.yml`).
It runs: `npm install → typecheck → lint → test --coverage → build → publish`.
CI auto-publishes on merge to main (NPM_TOKEN in GitHub secrets).
