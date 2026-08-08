import { getMemoryDb } from "./memory-db.ts";

async function main() {
    const db = await getMemoryDb();
    await db.prepare(`UPDATE facts SET statement = ?, detail = ?, agents_must_know = ?, updated_at = ? WHERE id = 'contracts/transport-interface'`).run(
        'Transport interface extends EventProvider (NOT EventEmitter): { id, state, read(), write(), close(), on(), once(), off(), removeListener(), emit(), listenerCount(), removeAllListeners() }. EventProvider is injected via TransportOptions.events — no fallback in the package.',
        'TcpTransport composes an injected EventProvider. browsersmith is the only package that provides the Node EventEmitter-backed provider. No in-package fallback.',
        '- Transport never imports node:events\n- events is injected, not created locally\n- browsersmith owns the runtime EventProvider choice',
        Math.floor(Date.now() / 1000)
    );
    console.log('updated contracts/transport-interface');
    await db.close();
}
main();
