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
            statement: "Platform interface: { network: { tcp: Net, dns: DnsResolver, udp: UdpTransport }, crypto: CryptoProvider, compression: CompressionProvider, events: EventEmitter, telemetry, time }. Defined in @browsercore/contracts.",
            base_confidence: 1.0,
            coupling: "@browsercore/contracts, browsersmith/wiring.ts",
        },
        {
            id: "contracts/transport-interface",
            scope: "contracts" as Scope,
            statement: "Transport interface: { id, state, read(): Promise<Uint8Array>, write(data): Promise<void>, close(): Promise<void> }. Extends EventEmitter. States: connecting, open, closed.",
            base_confidence: 1.0,
            coupling: "@browsercore/transport, @browsercore/contracts",
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
