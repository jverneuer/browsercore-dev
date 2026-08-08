import { getMemoryDb } from "./memory-db.ts";

async function main() {
    const db = await getMemoryDb();
    await db.prepare(`UPDATE facts SET statement = ?, detail = ?, agents_must_know = ?, updated_at = ? WHERE id = 'architecture/platform-composition-root'`).run(
        'Browsersmith is the ONLY package that imports node:* modules. It builds a Platform object with { network: { tcp, dns, udp }, crypto: { provider }, compression, events: EventProvider, telemetry, time: { clock, scheduler } } and threads it down through options. Protocol packages never import node:* directly.',
        'The Platform composition root replaces the old setConnectorDeps global singleton. Platform flows through FetchClientOptions.platform → client.ts → dispatch.ts → openTcpTransport(). EventProvider (not EventEmitter) is the event surface.',
        '- NEVER import node:* from a protocol package\n- Thread Platform through options, not globals\n- EventProvider is injected (no fallback in protocol packages)\n- The old requireDeps/setConnectorDeps system is deleted',
        Math.floor(Date.now() / 1000)
    );
    console.log('updated architecture/platform-composition-root');
    await db.close();
}
main();
