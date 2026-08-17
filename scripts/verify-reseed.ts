// scripts/verify-reseed.ts
// Post-reseed audit against the LIVE database: snapshot + shards, the same
// reconstruction the worker performs. Deletable once read.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    const { prisma } = await import('../lib/db');
    const { deserializeWorld, injectFactionShard } = await import('../lib/persistence/save-service');

    const doc = await prisma.multiplayerSession.findUnique({ where: { id: 'default-session' } });
    const world: any = deserializeWorld(doc!.snapshot);
    const shards = await prisma.gameFactionShard.findMany({ orderBy: { id: 'asc' } });
    for (const s of shards) injectFactionShard(world, s.data);

    let ok = 0;
    const bad: string[] = [];
    for (const f of world.economy.factions.values()) {
        if (world.movement.systems.has(f.capitalSystemId)) ok++;
        else bad.push(`${f.id}->${f.capitalSystemId}`);
    }
    console.log(`capitals: ${ok}/${ok + bad.length} resolve${bad.length ? '  BAD: ' + bad.join(', ') : ''}`);

    const systems = [...world.movement.systems.values()];
    const names = ['Pyrothar', 'Zhul', 'Jabal', 'Meatballia', 'Solara', 'Aurea Ripa', 'Aeiralux', 'Graviton', 'Savarr', 'Rrriiaa'];
    console.log('homeworlds: ' + names.map(n =>
        `${n}:${systems.some((s: any) => (s.name ?? '').includes(n)) ? 'yes' : 'NO'}`).join('  '));

    console.log('factionTraits entries: ' + (world.factionTraits?.size ?? 0));
    console.log(`shard rows: ${shards.length} [${shards.map(s => s.factionId).join(', ')}]`);
    await prisma.$disconnect();
}
main();
