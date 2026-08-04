# @browsercore/dev

Shared build, lint, test, and governance config for the `@browsercore/*` package
family (14 sibling git repos cloned side-by-side). One published package is the
single source of truth; consumers eat the extendable parts live via npm, and the
non-extendable GitHub files arrive via a sync script.

## What's distributed, and how

| Artifact | Mechanism |
| --- | --- |
| `tsconfig` strict flags | `tsconfig.json` `"extends": "@browsercore/dev/tsconfig.base.json"` |
| `vitest` config | factory import: `definePackageConfig({ name })` from `@browsercore/dev/vitest` |
| `.oxlintrc.json` → `oxlint.config.ts` | import the base object from `@browsercore/dev/oxlint` |
| `coverage-md` (coverage report generator) | npm `bin` |
| `CODING_STANDARDS.md`, `.github/{ci.yml,ruleset.json,bootstrap-ruleset.sh}` | `scripts/sync.mjs` (GitHub reads only each repo's own `.github/`) |

Why a TS import for oxlint rather than `.oxlintrc.json` `extends`: oxlint's JSON
`extends` resolves only relative file paths, not `node_modules`
(see oxc-project/oxc#15538). The `oxlint.config.ts` form imports the config object
directly, which resolves through `node_modules`.

## Consumer adoption (per repo)

```sh
# 1. depend on it (use the npm version once published; locally: file:../dev)
npm install -D @browsercore/dev

# 2. tsconfig.json — replace with:
#    { "extends": "@browsercore/dev/tsconfig.base.json",
#      "compilerOptions": { "rootDir": "src", "outDir": "dist" },
#      "include": ["src/**/*.ts"], "exclude": ["node_modules","dist","tests","scripts"] }

# 3. vitest.config.ts — replace with:
#    import { definePackageConfig } from "@browsercore/dev/vitest";
#    export default definePackageConfig({ name: "<pkg>" });

# 4. oxlint — delete .oxlintrc.json, create oxlint.config.ts:
#    import { defineConfig } from "oxlint";
#    import base from "@browsercore/dev/oxlint";
#    export default defineConfig({ extends: [base] });

# 5. drop scripts/coverage-md.mjs; CI uses the `coverage-md` bin.

# 6. refresh governance files (run from THIS repo):
node scripts/sync.mjs <pkg>          # copy templates in
node scripts/sync.mjs --check <pkg>  # drift gate (exit 1 on mismatch)
```

Type-aware oxlint (`--type-aware`) requires the `oxlint-tsgolint` package in the
consumer's devDependencies.

## Repo layout

```
src/vitest.ts            definePackageConfig() factory
src/oxlint.ts            base OxlintConfig object (default export)
src/index.ts             re-exports
bin/coverage-md.mjs      coverage-md bin
scripts/sync.mjs         distribute + drift-check governance files
tsconfig.base.json       universal compilerOptions (consumers extend this)
tsconfig.build.base.json emit flags layered on the base
templates/.github/*      ci.yml, ruleset.json, bootstrap-ruleset.sh (synced, not published)
CODING_STANDARDS.md      synced to every consumer
```

## Develop

```sh
npm install
npm run typecheck
npm run build
npm run lint -- --deny-warnings
```

Node >= 26. ESM only.
