# Coding Standards — @browsercore polyrepo

All repos share the same toolchain. Violations fail CI — there are no exceptions.

## TypeScript

- **Strict mode** enabled everywhere (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- **verbatimModuleSyntax** — use `import type` for type-only imports; never import a type as a value
- **No `any`** — `typescript/no-explicit-any` is an error
- **No non-null assertions** — `typescript/no-non-null-assertion` is an error; use proper narrowing
- **Consistent type imports** — `typescript/consistent-type-imports` is an error; always qualify type-only imports
- **No `ban-ts-comment`** — never use `@ts-ignore` / `@ts-expect-error`; fix the root cause
- Target `ES2022`, module `Node16`, module resolution `Node16`

## Lint (oxlint)

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

## Design

- **Interface-first** — define contracts in `@browsercore/contracts`, implement elsewhere
- **Branded types / discriminated unions** — make invalid states unrepresentable
- **Composition over inheritance** — inject `EventProvider` rather than extending `EventEmitter`
- **No global singletons** — everything flows through the Platform object
