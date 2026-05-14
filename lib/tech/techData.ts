import { Tech } from './types';
import { registry } from './engine';
import { espionageTree } from './trees/espionage';
import { militaryTree } from './trees/military';
import { economyTree } from './trees/economy';
import { diplomacyTree } from './trees/diplomacy';
import { infrastructureTree } from './trees/infrastructure';

/**
 * lib/tech/techData.ts
 * Master file that registers all technology trees into the engine.
 */

const techs: Tech[] = [
    ...espionageTree,
    ...militaryTree,
    ...economyTree,
    ...diplomacyTree,
    ...infrastructureTree
];

// Register all technologies in the registry
techs.forEach(tech => registry.register(tech));

export default techs;
