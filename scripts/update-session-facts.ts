import { getMemoryDb, ensureSchema, createFact, type Scope } from "./memory-db.ts";

async function main(): Promise<void> {
    const db = await getMemoryDb();
    await ensureSchema(db);

    const facts: Parameters<typeof createFact>[1][] = [
        {
            id: "operational/current-versions",
            scope: "operational" as Scope,
            statement: "As of 2026-08-09: contracts 0.2.2, compression 0.2.1, crypto 0.2.2, cookies 0.2.0, profiles 0.2.0, dev 0.2.0, transport 0.2.5, tls 0.4.2, http1 0.2.1, http2 0.2.3, fetch 0.2.5, quic 0.2.3, testing 0.2.0, http3 0.1.7, devtools 0.2.0, browsersmith 0.0.5. Layer 0-3 published; Layer 4-5 in progress.",
            base_confidence: 1.0,
            coupling: "all repos",
            detail: "Published through Layer 3 (fetch 0.2.5, quic 0.2.3). Remaining: testing, http3, devtools (Layer 4), browsersmith (Layer 5).",
            agents_must_know: "- Always check npm before bumping\n- Never skip a version\n- Published = version on npm, not just merged",
        },
        {
            id: "patterns/crypto-singleton-elimination",
            scope: "patterns" as Scope,
            statement: "The named `crypto` export was eliminated from @browsercore/crypto in 0.2.2. Repos importing `{ crypto }` must inject CryptoProvider via Platform. Test files may use node:crypto directly to build a mock provider.",
            base_confidence: 1.0,
            coupling: "@browsercore/crypto, browsercore-quic, browsercore-http1, browsercore-http2, browsercore-tls, browsercore-fetch",
            detail: "Hit in: http1 (createTestDecompressionProvider), http2 (createMockCryptoProvider), tls (129 tests), fetch (test-compression.ts), quic (4 files). Pattern: replace singleton import with injected CryptoProvider.",
            agents_must_know: "- NEVER re-add the crypto singleton\n- Tests: use node:crypto for mock providers (acceptable)\n- Src: inject CryptoProvider through constructor/options",
        },
        {
            id: "contracts/transport-extends-eventemitter",
            scope: "contracts" as Scope,
            statement: "Published @browsercore/transport@0.2.5 has Transport extends EventEmitter (not just EventProvider). Implementors must provide the full EventEmitter surface with `this` return types on chainable methods (on/once/off/removeListener/removeAllListeners).",
            base_confidence: 1.0,
            coupling: "@browsercore/transport, browsercore-quic",
            detail: "QuicTransportAdapter failed CI because it only implemented EventProvider subset with void returns. The LOCAL source says extends EventProvider, but PUBLISHED 0.2.5 says extends EventEmitter.",
            agents_must_know: "- Check node_modules for the EXACT resolved interface\n- Chainable methods must return `this`\n- void returns cause TS2416 errors against published types",
        },
        {
            id: "operational/pr-gatekeeper-mandate",
            scope: "operational" as Scope,
            statement: "The pr-gatekeeper is the ONLY agent that creates/merges PRs. It runs validate-pr.ts first and NEVER fixes code. Pipeline: specialist fixes → commits → pushes → gatekeeper validates → merges.",
            base_confidence: 1.0,
            coupling: "agents/pr-gatekeeper/AGENT.md, scripts/validate-pr.ts",
            detail: "Established 2026-08-09 after general-purpose agents incorrectly created PRs directly.",
            agents_must_know: "- NO agent except pr-gatekeeper may run gh pr create/merge\n- Gatekeeper rejects dirty trees, missing version bumps, bad branch names",
        },
        {
            id: "operational/agent-routing",
            scope: "operational" as Scope,
            statement: "Route tasks to specialists by repo: protocol-engineer (quic/http3/http2/tls), platform-engineer (crypto/compression/transport/contracts), fetch-engineer (fetch/cookies/http1), test-engineer (testing), integration-engineer (browsersmith), fingerprint-engineer (profiles). NEVER default to general-purpose.",
            base_confidence: 1.0,
            coupling: "Claude.md task-to-agent routing table, agents/*/AGENT.md",
            detail: "Added to Claude.md 2026-08-09 after all tasks went to general-purpose agents.",
            agents_must_know: "- Read Claude.md routing table before dispatching\n- Read the agents AGENT.md, bake rules into prompt\n- Use model: sonnet for specialists",
        },
    ];

    for (const fact of facts) {
        await db.prepare("DELETE FROM facts WHERE id = ?").run(fact.id);
        await createFact(db, fact);
    }

    console.log(`Memory updated: ${facts.length} facts written (1 refreshed, 4 new).`);
}

main().catch(console.error);
