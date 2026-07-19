import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { prisma } from '../lib/db';
import { getGameWorldState } from '../lib/game-world-state-singleton';
import { serializeWorld } from '../lib/persistence/save-service';

async function pushInitialState() {
    console.log('[Init] Pushing Initial Game State to PostgreSQL...');

    // 1. Generate the initial world state using the game's singleton logic
    const world = getGameWorldState();
    const snapshot = serializeWorld(world);

    console.log(`[Init] Serialized world state size: ${(snapshot.length / 1024).toFixed(2)} KB`);

    // 2. Create or overwrite the session document
    await prisma.multiplayerSession.upsert({
        where: { id: 'default-session' },
        update: { snapshot, lastTickAt: new Date().toISOString() },
        create: { id: 'default-session', snapshot, lastTickAt: new Date().toISOString() },
    });

    console.log('✅ Successfully pushed initial state to "default-session"');
}

pushInitialState()
    .catch(err => { console.error('❌ Failed to push initial state:', err.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
