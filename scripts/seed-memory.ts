import { getMemoryDb, ensureSchema, createFact, type Scope } from "./memory-db.ts";

async function main(): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);
    console.log("Memory DB initialized. Seeding facts...\n");

    const facts: Parameters<typeof createFact>[1][] = [
        // ── Architecture ──────────────────────────────────────────────
        {
            id: "architecture/platform-composition-root",
            scope: "architecture" as Scope,
            statement: "Browsersmith is the ONLY package that imports node:* modules. It builds a Platform object with { network: { tcp, dns, udp }, crypto, compression, events, telemetry, time } and threads it down through options. Protocol packages never import node:* directly.",
            base_confidence: 1.0,
            coupling: "browsersmith/wiring.ts, all @browsercore/* packages",
            detail: "The Platform composition root replaces the old setConnectorDeps global singleton. Platform flows through FetchClientOptions.platform → client.ts → dispatch.ts → openTcpTransport().",
            agents_must_know: "- NEVER import node:* from a protocol package\n- Thread Platform through options, not globals\n- The old requireDeps/setConnectorDeps system is deleted",
        },
        {
            id: "architecture/no-hard-wires-invariant",
            scope: "architecture" as Scope,
            statement: "Protocol packages (tls, http1, http2, http3, quic, fetch) must never import each other directly. All inter-package communication flows through Platform interfaces defined in @browsercore/contracts.",
            base_confidence: 1.0,
            coupling: "all @browsercore/* packages",
            detail: "This invariant was established when the user explicitly rejected a requireDeps fallback as 'a big steel chain from the bottom of the sea all the way up to the Ship.'",
            agents_must_know: "- Never create a direct dependency between protocol packages\n- Never reintroduce requireDeps or any global connector system\n- If a package needs net/dns, it must accept them through Platform in its options",
        },
        {
            id: "architecture/polyrepo-layer-boundaries",
            scope: "architecture" as Scope,
            statement: "The polyrepo has 6 topological layers: Layer 0 (contracts, compression, crypto, cookies, profiles, dev) → Layer 1 (transport) → Layer 2 (tls, http1, http2) → Layer 3 (fetch, quic) → Layer 4 (testing, http3, devtools) → Layer 5 (browsersmith).",
            base_confidence: 1.0,
            coupling: "all repos",
            detail: "Work flows bottom-up: fix a lower-layer package → bump deps in each upstream layer. Each layer must publish to npm before the next layer can bump.",
        },

        // ── Contracts ─────────────────────────────────────────────────
        {
            id: "contracts/platform-interface",
            scope: "contracts" as Scope,
            statement: "Platform interface: { network: Network { tcp: Net, dns: DnsResolver, udp: DatagramTransport }, crypto: Crypto { provider: CryptoProvider }, compression: Compression (= CompressionProvider), events: EventProvider, telemetry: Telemetry, time: Time }. Defined in @browsercore/contracts/src/platform.ts. Browsersmith is the ONLY package that builds a Platform — protocol packages receive it through options.",
            base_confidence: 1.0,
            coupling: "@browsercore/contracts/src/platform.ts, browsersmith/wiring.ts",
            agents_must_know: "- Platform.events is EventProvider, NOT EventEmitter\n- Compression is now an alias for CompressionProvider (the async encode/decode shape was dropped)\n- Crypto wraps CryptoProvider in a bundle: Platform.crypto.provider",
        },
        {
            id: "contracts/transport-interface",
            scope: "contracts" as Scope,
            statement: "Transport interface: { id: string, state: TransportState, write(data: Uint8Array): Promise<void>, read(): Promise<Uint8Array>, close(reason?): Promise<void> }. Has typed on/once for exactly 3 events (data, close, error) with void returns. Does NOT extend EventEmitter — it is a typed stream, not a generic bus. The @browsercore/transport package receives its event backend via Platform.events internally.",
            base_confidence: 1.0,
            coupling: "@browsercore/contracts/src/contracts.ts, @browsercore/transport",
            agents_must_know: "- Transport does NOT extend node:events.EventEmitter\n- on/once return void, not this (no chaining)\n- Only 3 events: 'data', 'close', 'error' — no addListener, prependListener, setMaxListeners, etc.\n- Any code adding EventEmitter methods to a Transport implementation is a regression",
        },
        {
            id: "contracts/event-provider",
            scope: "contracts" as Scope,
            statement: "EventProvider interface: { on(event, listener): void, once, off, removeListener, emit(event, ...args): boolean, listenerCount(event): number, removeAllListeners(event?): void }. Defined in @browsercore/contracts/src/events.ts. This REPLACES node:events.EventEmitter — no protocol package inherits from EventEmitter. The adapter in browsersmith implements EventProvider backed by node:events and injects it via Platform.events.",
            base_confidence: 1.0,
            coupling: "@browsercore/contracts/src/events.ts, browsersmith/src/platform/events/node/event-provider.ts",
            agents_must_know: "- EventProvider is the contract; node:events is only one implementation\n- TypedEventEmitter<T> is the typed counterpart for compile-time safety\n- All on/off/once return void — no chainable this",
        },

        // ── Patterns ──────────────────────────────────────────────────
        {
            id: "patterns/platform-threading",
            scope: "patterns" as Scope,
            statement: "Platform is threaded through options, not globals: FetchClientOptions.platform → client.ts resolves net/dns from platform → dispatch.ts openTcpTransport(url, net, dns) → connectTransport({host, port, net, dns}).",
            base_confidence: 1.0,
            coupling: "browsercore-fetch/client.ts, dispatch.ts",
            detail: "openTcpTransport throws FetchError if net/dns are undefined — no silent fallback to requireDeps.",
        },
        {
            id: "patterns/polyrepo-dep-resolution",
            scope: "patterns" as Scope,
            statement: "The orchestrator reads browsersmith's package.json, resolves each @browsercore/* dep to its git repo via repository.url, and builds a topological DAG. Work bubbles up layer by layer.",
            base_confidence: 1.0,
            coupling: "browsercore-dev/scripts/resolve-graph.ts",
        },

        // ── Operational ───────────────────────────────────────────────
        {
            id: "operational/npm-publish-flow",
            scope: "operational" as Scope,
            statement: "CI auto-publishes on merge to main. The reusable CI workflow (browsercore-dev/.github/workflows/reusable-ci.yml) runs: npm install → typecheck → lint --deny-warnings → test --coverage → build → publish. NPM_TOKEN is in GitHub secrets.",
            base_confidence: 1.0,
            coupling: "all repos, .github/workflows/",
            agents_must_know: "- Merging to main triggers auto-publish\n- Coverage threshold is >=93% (statements/branches/functions/lines)\n- Lint runs with --deny-warnings (zero tolerance)",
        },
        {
            id: "operational/ci-reusable-workflow",
            scope: "operational" as Scope,
            statement: "Every repo uses the same reusable CI from browsercore-dev: jverneuer/browsercore-dev/.github/workflows/reusable-ci.yml@main. Node 26, deploy-pages enabled.",
            base_confidence: 1.0,
            coupling: "all repos",
        },
        {
            id: "operational/current-versions",
            scope: "operational" as Scope,
            statement: "As of 2026-08-08: tls 0.4.1, transport 0.2.4, fetch 0.2.4, crypto 0.2.1, contracts 0.2.1 (local 0.2.0), quic 0.2.2 (local 0.2.1), browsersmith 0.0.4, testing 0.2.0.",
            base_confidence: 0.9,
            coupling: "all repos",
            stability: "evolving",
        },

        // ── Bugs ──────────────────────────────────────────────────────
        {
            id: "bugs/bug6-key-schedule",
            scope: "bugs" as Scope,
            statement: "Bug 6 (FIXED in tls 0.4.1): Derive-Secret(., \"derived\", \"\") in RFC 8446 §7.1 uses Transcript-Hash(\"\") = Hash(empty_bytes) as context — NOT empty bytes. The code passed new Uint8Array(0) (0 bytes) instead of Hash(new Uint8Array(0)) (32 bytes), producing wrong HKDF-Extract salt and corrupting all downstream traffic keys.",
            base_confidence: 1.0,
            coupling: "browsercore-tls/src/crypto/keySchedule.ts",
            detail: "Fix: compute emptyHash = hash === 'SHA-384' ? provider.sha384(new Uint8Array(0)) : provider.sha256(new Uint8Array(0)), then pass emptyHash as context to both 'derived' HKDF-Expand-Label calls.",
            agents_must_know: "- This was the critical blocker preventing any real HTTPS request\n- The fix is in deriveHandshakeTrafficSecrets()\n- Verified end-to-end: full TLS 1.3 handshake succeeds, app data decrypts correctly",
        },
        {
            id: "bugs/bug2-adapter-fallback",
            scope: "bugs" as Scope,
            statement: "Bug 2 (FIXED): fetch imported requireDeps from transport as a global fallback when net/dns were not provided. This created a hard dependency chain. Fixed by threading Platform through options and throwing FetchError if net/dns missing.",
            base_confidence: 1.0,
            coupling: "browsercore-fetch/src/dispatch.ts",
            detail: "The fix removed requireDeps entirely from transport. openTcpTransport now throws if net/dns undefined.",
        },

        // ── Operational: Session recovery ────────────────────────────
        {
            id: "operational/repo-recovery-2026-08-09",
            scope: "operational" as Scope,
            statement: "On 2026-08-09, a rogue E2E testing agent deleted 10 of 15 repos from disk (contracts, crypto, compression, transport, tls, http1, http2, fetch, cookies, profiles). All were recovered via git clone from GitHub. No commit history was lost — all feature branches are intact on remote and local. The .memory/browsercore.db SQLite database was PERMANENTLY LOST because .memory/ was gitignored. DB was rebuilt from seed-memory.ts.",
            base_confidence: 1.0,
            coupling: "all repos, browsercore-dev/.gitignore, browsercore-dev/.memory/",
            agents_must_know: "- NEVER gitignore .memory/ — it holds the cross-session knowledge base\n- The DB was rebuilt on 2026-08-09 with updated seed facts reflecting the Platform refactor\n- If seed facts are stale, update them in scripts/seed-memory.ts BEFORE re-seeding\n- Two repos had uncommitted local-only changes at recovery time: quic (EventEmitter regression — discard) and browsersmith (README docs — legitimate)",
            stability: "stable",
        },
        {
            id: "operational/platform-refactor-status",
            scope: "operational" as Scope,
            statement: "As of 2026-08-09: A massive multi-repo Platform refactor is in flight. 13 of 15 repos are on feature branches. Green PRs: compression #38, crypto #56, transport #51, http3 #52. Red PRs: contracts #7 (real bug — duplicated imports in platform.ts), tls #65 (cascade — EventProvider not in published contracts), http1 #39 (cascade — ETARGET contracts@0.2.2), http2 #48 (cascade — ETARGET transport@0.2.5), fetch #56 (real bugs — Compression/Transport type mismatches), quic #56 (cascade — ETARGET contracts@0.2.2), browsersmith #55 (unknown failure). cookies & profiles are on main, no changes.",
            base_confidence: 0.95,
            coupling: "all repos",
            detail: "Publish order: contracts (must fix lint first) → crypto + compression → transport → tls + http1 + http2 → quic + fetch → browsersmith. Each layer must publish before downstream can bump deps.",
            agents_must_know: "- Real bugs to fix: contracts PR#7 (duplicated ./contracts.js imports in platform.ts), fetch PR#56 (Compression vs CompressionProvider, Transport.on return type)\n- quic has an uncommitted EventEmitter regression that should be discarded (git checkout -- src/handshake/quic-transport-adapter.ts)\n- Cascade failures are expected polyrepo mechanics — resolve at publish time, not per-PR",
            stability: "evolving",
        },
    ];

    let count = 0;
    for (const fact of facts) {
        try {
            await createFact(db, fact);
            count++;
            console.log(`  ✓ ${fact.id}`);
        } catch (e) {
            console.log(`  ✗ ${fact.id}: ${(e as Error).message}`);
        }
    }

    console.log(`\nSeeded ${count} facts.`);
    await db.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
