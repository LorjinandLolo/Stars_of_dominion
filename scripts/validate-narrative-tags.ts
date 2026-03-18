import fs from 'fs';

interface NarrativeTag {
    name?: string;
    description?: string;
    enemies?: string[];
    friends?: string[];
    complications?: string[];
    [key: string]: any;
}

interface Entity {
    id: string; // Assuming ID or Name for identification
    name?: string;
    parentEntity?: string;
    attributes?: {
        tags?: NarrativeTag[];
        [key: string]: any;
    };
    [key: string]: any;
}

// Recursive function to flatten all entities from the JSON structure
function getAllEntities(data: any): Entity[] {
    let entities: Entity[] = [];

    if (Array.isArray(data)) {
        data.forEach(item => {
            entities = entities.concat(getAllEntities(item));
        });
    } else if (typeof data === 'object' && data !== null) {
        // Check if this object is an entity (has parentEntity or id)
        // Or just traverse its properties
        if (data.parentEntity || data.attributes) {
            entities.push(data as Entity);
        }

        // Traverse children
        Object.values(data).forEach(value => {
            if (typeof value === 'object') {
                entities = entities.concat(getAllEntities(value));
            }
        });
    }

    return entities;
}

function validateTags(filePath: string) {
    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(rawData);

        const entities = getAllEntities(data);
        const missingTags: string[] = [];
        const malformedTags: string[] = [];
        let validCount = 0;

        entities.forEach(entity => {
            const isRequired = entity.parentEntity === 'system' || entity.parentEntity === 'planet';
            const tags = entity.attributes?.tags;

            if (isRequired && (!tags || tags.length === 0)) {
                missingTags.push(`${entity.name || entity.id || 'Unknown Entity'} (${entity.parentEntity})`);
                return; // Missing required tags
            }

            if (tags && tags.length > 0) {
                let allTagsValid = true;
                tags.forEach((tag, index) => {
                    const hasName = !!tag.name;
                    const hasDesc = !!tag.description;
                    const hasRelations = (tag.enemies && tag.enemies.length > 0) ||
                        (tag.friends && tag.friends.length > 0) ||
                        (tag.complications && tag.complications.length > 0);

                    if (!hasName || !hasDesc || !hasRelations) {
                        malformedTags.push(`${entity.name || entity.id} - Tag[${index}] "${tag.name || 'Unnamed'}" missing: ${!hasName ? 'name ' : ''}${!hasDesc ? 'desc ' : ''}${!hasRelations ? 'relations' : ''}`);
                        allTagsValid = false;
                    }
                });

                if (allTagsValid) validCount++;
            }
        });

        console.log('--- Validation Results ---');
        console.log(`Entities with Valid Tags: ${validCount}`);

        if (missingTags.length > 0) {
            console.log('\n[MISSING REQUIRED TAGS]');
            missingTags.forEach(e => console.log(`- ${e}`));
        } else {
            console.log('\n[MISSING REQUIRED TAGS]: None');
        }

        if (malformedTags.length > 0) {
            console.log('\n[MALFORMED TAGS]');
            malformedTags.forEach(e => console.log(`- ${e}`));
        } else {
            console.log('\n[MALFORMED TAGS]: None');
        }

    } catch (error) {
        console.error('Error reading or parsing file:', error);
    }
}

const args = process.argv.slice(2);
if (args.length !== 1) {
    console.log('Usage: npx tsx scripts/validate-narrative-tags.ts <path-to-json>');
} else {
    validateTags(args[0]);
}
