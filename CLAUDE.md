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

## CI

Every repo uses the same reusable CI workflow (`.github/workflows/reusable-ci.yml`).
It runs: `npm install → typecheck → lint → test --coverage → build → publish`.
CI auto-publishes on merge to main (NPM_TOKEN in GitHub secrets).
