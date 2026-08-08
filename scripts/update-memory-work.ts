import { getMemoryDb, ensureSchema, createFact, type Scope } from "./memory-db.ts";

async function main() {
    const db = await getMemoryDb();
    await ensureSchema(db);

    const updates = [
        {
            id: "contracts/transport-interface",
            scope: "contracts" as Scope,
            statement: "Transport interface extends EventProvider (NOT EventEmitter): { id, state, read(), write(), close(), on(), once(), off(), removeListener(), emit(), listenerCount(), removeAllListeners() }. EventProvider is injected via TransportOptions.events — no fallback in the package.",
            base_confidence: 1.0,
            coupling: "@browsercore/transport, @browsercore/contracts",
            detail: "TcpTransport composes an injected EventProvider. browsersmith is the only package that provides the Node EventEmitter-backed provider. No in-package fallback.",
            agents_must_know: "- Transport never imports node:events\n- events is injected, not created locally\n- browsersmith owns the runtime EventProvider choice",
        },
        {
            id: "contracts/event-provider",
            scope: "contracts" as Scope,
            statement: "EventProvider is the platform-agnostic emitter interface: on/once/off/removeListener/emit/listenerCount/removeAllListeners. Backed by EventTarget in browsersmith. Decouples all packages from node:events.",
            base_confidence: 1.0,
            coupling: "@browsercore/contracts/src/events.ts",
            detail: "Replaces the old TypedEventEmitter<T> node:events coupling. AbortSignal composes natively (extends EventTarget). Cross-runtime (Node/Bun/Deno/Workers).",
            agents_must_know: "- Never import node:events in a protocol package\n- EventProvider is the ONLY event surface\n- browsersmith injects the implementation",
        },
        {
            id: "architecture/extracted-backends",
            scope: "architecture" as Scope,
            statement: "Crypto (NodeCryptoProvider, AEAD, X25519 node-backend) and compression (NodeZlibCompressionProvider) implementations moved from their origin packages to browsersmith/src/platform/{crypto,compression}/node/. Origin packages now have ZERO node:* imports.",
            base_confidence: 1.0,
            coupling: "browsercore-crypto, browsercore-compression, browsersmith",
            detail: "crypto/src retains pure types/errors/utils. compression/src retains pure types/errors/utils. Tests moved with implementations to browsersmith.",
            agents_must_know: "- crypto/compression packages are pure (no node:*)\n- browsersmith owns all runtime backends\n- Adding a Bun backend = implement under browsersmith/src/platform/{service}/bun/",
        },
    ];

    for (const fact of updates) {
        try {
            await createFact(db, fact);
            console.log(`✓ ${fact.id}`);
        } catch (e) {
            console.log(`✗ ${fact.id}: ${e}`);
        }
    }
    await db.close();
}
main();
