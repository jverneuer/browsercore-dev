# TypeScript Coding Standards — @browsercore polyrepo

These rules are the standard for this codebase and **every** sub-package. Every PR,
every AI-generated snippet, and every hand-written file follows them. They exist so
the intended behavior lives in the types — never in tribal knowledge or hidden assumptions.

> Design for AI modification: before committing, ask *"Could another developer or an
> LLM understand the intended behavior without asking me?"* If not — add types, split
> functions, clarify states, rename.

---

## 1. Strict compiler — never relax it

Every `tsconfig.json` inherits `tsconfig.base.json`, which carries:

- `strict: true`
- `noUncheckedIndexedAccess` → `arr[i]` is `T | undefined`.
- `exactOptionalPropertyTypes` → `?` means absent-or-present, not present-and-undefined.
- `verbatimModuleSyntax` — use `import type` for type-only imports; never import a type as a value.
- Target `ES2024`, module `Node16`, module resolution `Node16`.

## 2. Every important data structure has a type

If data crosses a module boundary, it has an explicit type. No anonymous object
literals escaping a function.

```ts
// Bad
const frame = { type: 0x1, streamId: 3, data: buf };

// Good
interface HeadersFrame {
    readonly type: FrameType.HEADERS;
    readonly streamId: StreamId;
    readonly data: Uint8Array;
}
```

## 3. Never `any`

Unknown external data is `unknown`, then validated. `any` is a build failure.

## 4. Interfaces for domain objects, type aliases for states/constraints

- Interfaces for real entities (`TlsConnection`, `Http2Stream`, `Cookie`).
- Type aliases for states/constraints (`RunStatus`, `CipherSuite`).
- If values come from a known set, encode the set — never bare `string`.

## 5. Model states explicitly — make invalid states unrepresentable

No "state via nullable-field combos." Use discriminated unions.

## 6. Discriminated unions for every workflow/state

## 7. Functions declare input AND output types

## 8. One function = one decision

No `processHandshake()` that validates + persists + schedules + notifies. Split:
`validate…`, `decodeStep`, `actuate`, `recordStep`.

## 9. No hidden behavior

A function named `updateSettings` does not also flush a log. Every side effect is its
own named call.

## 10. Name things explicitly

`cipherSuite`, `observedRank`, `clientHello` — never `data`, `result`, `obj`.
The name is the documentation.

## 11. Prefer immutable data + `readonly`

```ts
const next = { ...prev, cipherSuite } as const;
interface Connection { readonly id: ConnectionId; }
```

No in-place mutation of shared state. `const` over `let`.

## 12. Validate external data immediately

Everything from outside the boundary is `unknown`: sockets, files, captures, configs.
Use **Zod** at every boundary.

## 13. Types are contracts, not documentation

```ts
// Bad   // user id
//        id: string;
// Good
type UserId = string & { __brand: "UserId" };
```

## 14. Branded/opaque ID types — load-bearing

Don't use bare `number`/`string` for IDs. This kills the "pass an X where a Y belongs"
class of bug. The project uses these brands (defined per-package, see `types.ts`):

```ts
type ConnectionId = string & { __brand: "ConnectionId" };
type StreamId     = number & { __brand: "StreamId" };
type SessionId    = string & { __brand: "SessionId" };
```

## 15. Exhaustive switches

Every `switch` over a union hits `default: assertNever(x)`. Adding a state forces every
handler to compile-error until handled.

## 16. Explicit, typed errors

Errors are part of the API. Define them in each package's `errors.ts`.

## 17. No magic strings

## 18. Clear dependency boundaries

Domain (pure protocol logic) knows nothing of AWS / HTTP / DDB / sockets. Infrastructure
adapts. The protocol state machines stay I/O-free so they're unit-testable.

**Within this repo**, the dependency graph flows upward only — never sideways or downward:

```
@browsercore/fetch
  └─ @browsercore/http2  @browsercore/http1  @browsercore/cookies  @browsercore/profiles
        └─ @browsercore/tls
              └─ @browsercore/crypto  @browsercore/transport
                    └─ node:net / node:crypto
```

A package may only import from packages *below* it in this graph.

## 19. Documentation: why, not what

Comments explain *why* ("crawl past our position so the competitor snapshot covers the
neighborhood"), never *what* the code obviously does. Priority: Types > Names > Structure >
Comments.

## 20. API contracts in one place

Domain types live in each package's `types.ts`; wire schemas in `schemas.ts`. One source
of truth, never duplicated shapes.

## 21. Runtime independence & dependency injection

Protocol layers never import `node:*` built-ins directly. When a package requires
functionality provided by a specific runtime — `node:crypto`, `node:net`, `node:zlib`,
`node:events`, etc. — that dependency must be isolated behind an internal provider
interface **before** it becomes part of the package's implementation. This is an
architectural rule, not an optimization. It keeps protocol state machines I/O-free and
unit-testable against synthetic byte streams.

**Runtime independence** — the concrete backend is hidden behind an interface:

```ts
// Bad — protocol layer reaches into the runtime
import { createHash } from "node:crypto";
const digest = createHash("sha256").update(data).digest();

// Good — protocol layer depends only on the provider interface
interface CryptoProvider {
    hash(algorithm: HashAlgorithm, data: Uint8Array): Uint8Array;
}
const digest = crypto.hash("sha256", data);
```

**Dependency injection** — injected dependencies must never be tightly coupled. A
constructor or function parameter is typed as an interface (`CryptoProvider`,
`CompressionProvider`, `Transport`) — never a concrete class. This is what makes the
provider swappable: tests inject fakes, production injects the Node-backed singleton, and
neither side knows about the other.

```ts
// Bad — depends on the concrete implementation
class TlsConnection {
    constructor(private readonly crypto: NodeCryptoProvider) {}
}

// Good — depends on the interface
class TlsConnection {
    constructor(private readonly crypto: CryptoProvider) {}
}
```

All provider interfaces use `Uint8Array` exclusively — never Node `Buffer`. Backend-specific
error codes are wrapped at the provider boundary into typed errors and never leak upward.

---

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
- `typescript/no-explicit-any` (error)
- `typescript/no-non-null-assertion` (error)
- `typescript/no-namespace` (error)
- `typescript/consistent-type-imports` (error)
- `typescript/ban-ts-comment` (error)
- `unicorn/prefer-node-protocol` (error)
- `unicorn/no-process-exit` (error)

Style rules are intentionally off (`style: "off"`) — correctness only, let the formatter handle style.

---

## The Golden Rule

Every piece of important information exists as one of: **a type, a function signature,
an explicit state model, a schema validation, or clear naming.** Never rely on tribal
knowledge or hidden assumptions.

If a file is opened where any rule is not applied, it becomes the **obligation of the
opening agent** to make the file compliant.
