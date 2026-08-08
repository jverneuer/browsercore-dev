import { getMemoryDb } from "./memory-db.ts";

async function main() {
    const db = await getMemoryDb();
    await db.prepare(`UPDATE facts SET statement = ?, detail = ?, agents_must_know = ?, updated_at = ? WHERE id = 'contracts/platform-interface'`).run(
        'Platform interface: { network: { tcp: Net, dns: DnsResolver, udp: DatagramTransport }, crypto: { provider: CryptoProvider }, compression: CompressionProvider, events: EventProvider, telemetry: Telemetry, time: Time }. Defined in @browsercore/contracts.',
        'EventProvider (not EventEmitter) is the event surface. Clock + Scheduler are separate pillars. Organized per-service, then per-runtime.',
        '- events: EventProvider (not EventEmitter)\n- time: Time { clock, scheduler }\n- crypto: Crypto { provider } (single randomness source)\n- Adding Bun = implement services under browsersmith/src/platform/{service}/bun/',
        Math.floor(Date.now() / 1000)
    );
    console.log('updated contracts/platform-interface');
    await db.close();
}
main();
