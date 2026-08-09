# memory/index.md — Master Index

Auto-maintained. Last updated: 2026-08-09 (DB rebuilt after .gitignore fix).

## Open Questions (0)

No open questions.

## Facts by Scope

### architecture (3)
platform-composition-root · no-hard-wires-invariant · polyrepo-layer-boundaries

### contracts (3)
platform-interface · transport-interface · event-provider

### patterns (2)
platform-threading-pattern · polyrepo-dep-resolution

### operational (5)
npm-publish-flow · ci-reusable-workflow · current-version-landscape · repo-recovery-2026-08-09 · platform-refactor-status

### bugs (2)
bug6-key-schedule · bug2-adapter-fallback

## Confidence Distribution

| Range | Count | Notes |
|---|---|---|
| 0.9–1.0 (verbatim) | 14 | Code-verified, ADRs, contract fields |
| 0.7–0.9 (strong) | 1 | Multi-file inference |
| 0.5–0.7 (weak) | 0 | — |

## Incident Log

- **2026-08-09**: `.memory/browsercore.db` was permanently lost because `.memory/` was in `.gitignore` (line 7). A rogue E2E agent deleted 10 of 15 repos from disk; re-cloning wiped the gitignored DB. Rebuilt from `scripts/seed-memory.ts`. Removed `.memory/` from `.gitignore`. The DB is now tracked by git.
