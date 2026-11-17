# @browsercore/dev

[![npm version](https://img.shields.io/npm/v/@browsercore/dev)](https://www.npmjs.com/package/@browsercore/dev)
[![coverage](https://img.shields.io/endpoint?url=https://jverneuer.github.io/browsercore-dev/badge.json)](https://jverneuer.github.io/browsercore-dev/COVERAGE.md)
[![CI](https://img.shields.io/github/actions/workflow/status/jverneuer/browsercore-dev/build.yml?label=ci)](https://github.com/jverneuer/browsercore-dev/actions/workflows/build.yml)
[![license](https://img.shields.io/npm/l/@browsercore/dev.svg)](LICENSE)

Shared build, lint, test, and coverage tooling for every `@browsercore/*` package. One published package is the single source of truth; consumers extend it live via npm.

## Install

```sh
npm install -D @browsercore/dev
```

## Usage

### tsconfig

```json
{
  "extends": "@browsercore/dev/tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

For builds that emit declarations, extend `@browsercore/dev/tsconfig.build.base.json` instead (layers `declaration`, `declarationMap`, `sourceMap` on top of the base).

To genuinely typecheck tests (vitest only transpiles them), add a `tsconfig.test.json` extending `@browsercore/dev/tsconfig.test.base.json` and wire it as the second half of `npm run typecheck`:

```json
{ "extends": "@browsercore/dev/tsconfig.test.base.json" }
```

```json
"typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit"
```

The base includes `src/**/*.ts` + `tests/**/*.ts` under `noEmit` and **overrides `exclude`** — the repo tsconfig's `exclude: [..., "tests"]` (correct for builds) would otherwise nullify the test `include`, and the gate would silently typecheck zero test files.

### vitest

```ts
import { definePackageConfig } from "@browsercore/dev/vitest";

export default definePackageConfig({ name: "<pkg>" });
```

`definePackageConfig` wires in the shared reporters (`text`, `html`, `json-summary`), v8 coverage over `src/**/*.ts`, and 30s test/hook timeouts. The `html` + `json-summary` artifacts are what the coverage report reads. Pass `{ include, coverage }` to override test globs or append coverage excludes.

### oxlint

oxlint's JSON `extends` only resolves relative file paths (not `node_modules`), so the base is consumed via a TS import:

```ts
import { defineConfig } from "oxlint";
import base from "@browsercore/dev/oxlint";

export default defineConfig({ extends: [base] });
```

Type-aware linting (`--type-aware`) requires `oxlint-tsgolint` in the consumer's devDependencies.

### coverage-md

After running vitest with coverage, generate a `COVERAGE.md` report + shields.io badge:

```sh
npx vitest run --coverage
npx coverage-md
```

The bin reads `coverage/coverage-summary.json` (written by the `json-summary` reporter) and writes `COVERAGE.md` and `coverage/badge.json` to the package root.

## Scripts

| Command | Runs |
| --- | --- |
| `npm run typecheck` | `tsc -p tsconfig.json --noEmit && tsc -p tsconfig.test.json --noEmit` |
| `npm run lint` | `oxlint --type-aware src/` |
| `npm test` | `vitest run` |
| `npm run build` | `tsc -p tsconfig.build.json` |

## Coverage report

To produce a coverage report:

```sh
npx vitest run --coverage
node scripts/coverage-md.mjs    # writes COVERAGE.md + coverage/badge.json
```

Provider is `@vitest/coverage-v8`. The report is generated from `coverage/coverage-summary.json`.


## Contributing

Contributions are welcome — bug reports, reproductions, docs and code alike. Start with [CONTRIBUTING.md](CONTRIBUTING.md); the full guide lives in the [browsersmith repo](https://github.com/jverneuer/browsersmith/blob/main/CONTRIBUTING.md). First timer? Check the [`good first issue`](https://github.com/jverneuer/browsercore-dev/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) label. Security issues: [SECURITY.md](SECURITY.md), never a public issue.

## License

MIT
