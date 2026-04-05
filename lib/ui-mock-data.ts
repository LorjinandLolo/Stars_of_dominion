// lib/ui-mock-data.ts
// Stars of Dominion â€” Mock UI State Data
// Demonstrates: 150 systems, 4 link classes, 3 regions, 2 crisis windows,
// council in 'split', player in 'shadow' role, chronicle + outcomes.

import { Resource, CharterPower } from '@/lib/economy/corporate/company-types';
import type {
    SystemNode,
    Link,
    Region,
    RegionCrisisWindow,
    CouncilState,
    PlayerState,
    CrisisEvent,
    SeasonState,
    ChronicleEntry,
    CivilizationalOutcome,
    EspionageState,
    PoliticsState,
    DiplomacyState,
    TechState,
    DiscourseState,
    DiscourseMessage,
    CorporateState,
} from '@/types/ui-state';
import { PressFactionType } from '@/types/ui-state';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Deterministic seeded pseudo-random (no external deps needed) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function seededRng(seed: number) {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
    };
}

const rng = seededRng(0xdeadbeef);
const rn = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
const rf = (min: number, max: number) => +(rng() * (max - min) + min).toFixed(1);

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Systems (150) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const REGION_ASSIGNMENTS: Record<number, string> = {};
// Cluster ~50 systems per region
for (let i = 0; i < 50; i++) REGION_ASSIGNMENTS[i] = 'crimson-expanse';
for (let i = 50; i < 100; i++) REGION_ASSIGNMENTS[i] = 'veldt-dominion';
for (let i = 100; i < 135; i++) REGION_ASSIGNMENTS[i] = 'nullward-fringe';
// 135-149 unaffiliated

const FACTION_IDS = [
    'faction-aurelian', 
    'faction-vektori', 
    'faction-null-syndicate', 
    'faction-covenant',
    'nexulan_convergence',
    'rhimetal_sovereignty',
    'gabagoonian_republic',
    'infernoid_crusade',
    'movanite_stampede',
    'leopantheri_harmonate',
    'buthari_council',
    'sarrak_legion',
    'kaer_ruun_hunt',
    'banking_clan'
];

const SYSTEM_TAGS_POOL = [
    'throat', 'canal', 'spine', 'fortress', 'void', 'basin', 'gate', 'standard',
    'black-market', 'relay', 'deep-space', 'contested'
];

export const mockSystems: SystemNode[] = [
    {
        "id": "alpha-nexulan-prime-dyson-shell",
        "name": "The Solara Shell",
        "q": 0,
        "r": 0,
        "security": 98,
        "tradeValue": 95,
        "instability": 1,
        "escalationLevel": 0,
        "tags": [
            "dyson-shell",
            "infinite-power",
            "massive-laboratory",
            "nexus-node",
            "capital"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "alpha-5b34961e18bb6fd14903",
        "name": "The High Altar",
        "q": 6,
        "r": 13,
        "security": 90,
        "tradeValue": 62,
        "instability": 5,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Holy Site",
            "Covenant Core",
            "capital"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-fe148b9a69a680fa14a3",
        "name": "Syndicate Vault",
        "q": 37,
        "r": 13,
        "security": 85,
        "tradeValue": 99,
        "instability": 10,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Black Market Nexus",
            "Syndicate Core",
            "capital"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-18109e81be8a4bb03aab",
        "name": "Aurelia Prime",
        "q": 37,
        "r": 37,
        "security": 95,
        "tradeValue": 80,
        "instability": 2,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Hegemony Core",
            "capital"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-1acb646b529592834b59",
        "name": "Barjern",
        "q": 37,
        "r": 26,
        "security": 53,
        "tradeValue": 68,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Tomb World",
            "Anthropomorphs"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-10fae8cf89590243337b",
        "name": "Adah",
        "q": 6,
        "r": 8,
        "security": 56,
        "tradeValue": 27,
        "instability": 39,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Perimeter Agency",
            "Primitive Aliens",
            "Oceanic World",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-e57bea6eb8b32ca91823",
        "name": "Pyrothar",
        "q": 33,
        "r": 19,
        "security": 30,
        "tradeValue": 20,
        "instability": 60,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "volcanic-hellscape",
            "fire-blood",
            "capital"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-c3fd1fb4c112be530803",
        "name": "Meatballia Prima",
        "q": 30,
        "r": 41,
        "security": 60,
        "tradeValue": 85,
        "instability": 15,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion",
            "protein-rich-moon",
            "capacola-vines",
            "capital"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "alpha-1ec3d07e8aa8f591f2d3",
        "name": "Vektor Hub",
        "q": 15,
        "r": 17,
        "security": 90,
        "tradeValue": 75,
        "instability": 5,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Orbital Shipyards",
            "Vektori Core",
            "capital"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-8bfbb8fd552f8acf462f",
        "name": "Thora",
        "q": 8,
        "r": 30,
        "security": 25,
        "tradeValue": 14,
        "instability": 32,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cheap Life",
            "Forbidden Tech",
            "Rising Hegemon",
            "Gold Rush"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-dcceae93af2cee689c3d",
        "name": "Deiones",
        "q": 28,
        "r": 17,
        "security": 36,
        "tradeValue": 74,
        "instability": 10,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Terraform Failure",
            "Freak Geology",
            "Unbraked AI",
            "Battleground"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-9ac1cf4cc2e559fa5ab1",
        "name": "Muhani",
        "q": 2,
        "r": 24,
        "security": 65,
        "tradeValue": 49,
        "instability": 16,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Police State",
            "Revanchists",
            "Fallen Hegemon",
            "Maneaters",
            "Exchange Consulate",
            "Psionics Academy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-b51aa651102346de66b9",
        "name": "Aeiralux",
        "q": 11,
        "r": 44,
        "security": 70,
        "tradeValue": 45,
        "instability": 5,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "suspended-cities",
            "crystal-canopies",
            "capital"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-782feae03506829e3c7e",
        "name": "Rrriiaa",
        "q": 33,
        "r": 11,
        "security": 40,
        "tradeValue": 15,
        "instability": 50,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "deathworld",
            "shadow-mountains",
            "capital"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-2aa105d8907b9d002b68",
        "name": "Sig",
        "q": 30,
        "r": 26,
        "security": 37,
        "tradeValue": 50,
        "instability": 9,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Psionics Academy",
            "Rising Hegemon"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-aa36c683d4a7122e297c",
        "name": "Clerokos",
        "q": 6,
        "r": 19,
        "security": 36,
        "tradeValue": 14,
        "instability": 30,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Geology",
            "Fallen Hegemon",
            "Friendly Foe",
            "Seismic Instability"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-f7fbf720a5a959ca3485",
        "name": "Cymode",
        "q": 37,
        "r": 24,
        "security": 20,
        "tradeValue": 89,
        "instability": 25,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Dying Race",
            "Heavy Industry"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-db9639818642df50f902",
        "name": "Jabal",
        "q": 4,
        "r": 37,
        "security": 65,
        "tradeValue": 30,
        "instability": 10,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "sacred-peaks",
            "narcotic-atmosphere",
            "capital"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-50fbd1557c5b56dc87fa",
        "name": "Polymen",
        "q": 13,
        "r": 17,
        "security": 26,
        "tradeValue": 45,
        "instability": 27,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Geology",
            "Major Spaceyard",
            "Holy War",
            "Cold War",
            "Mandarinate",
            "Night World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-2bcbc34b64aa06f44e57",
        "name": "Sihi",
        "q": 17,
        "r": 15,
        "security": 27,
        "tradeValue": 80,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Tyranny",
            "Psionics Fear"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-a212bbc325df7b2dbb21",
        "name": "Graviton Vale",
        "q": 33,
        "r": 28,
        "security": 80,
        "tradeValue": 70,
        "instability": 5,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "heavy-gravity",
            "dense-metals",
            "capital"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-f7fd7a7f0ce6e0565f0c",
        "name": "Savarr'Tel",
        "q": 28,
        "r": 44,
        "security": 85,
        "tradeValue": 60,
        "instability": 2,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "golden-grasslands",
            "citadels",
            "capital"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-b3312d2d9c677aef75db",
        "name": "Gor’Zhul",
        "q": 24,
        "r": 8,
        "security": 75,
        "tradeValue": 40,
        "instability": 20,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "bioluminescent-swamps",
            "carnivorous-flora",
            "capital"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-d53ed5974db2feb09944",
        "name": "Wassif",
        "q": 19,
        "r": 37,
        "security": 59,
        "tradeValue": 29,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Altered Humanity",
            "Cold War",
            "Xenophobes",
            "Societal Despair"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-8a40511158412f567b03",
        "name": "Alvo",
        "q": 2,
        "r": 22,
        "security": 62,
        "tradeValue": 75,
        "instability": 21,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Xenophobes",
            "Terraform Failure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-2eaba9e9cd66cd3ab7e3",
        "name": "Merre",
        "q": 44,
        "r": 28,
        "security": 32,
        "tradeValue": 41,
        "instability": 17,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Freak Geology",
            "Unbraked AI"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-4311b6f81dedf12e0c2c",
        "name": "Idaracl",
        "q": 6,
        "r": 17,
        "security": 59,
        "tradeValue": 21,
        "instability": 27,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Geology",
            "Revolutionaries"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-7dfdd0eb2c003caf125a",
        "name": "Kas",
        "q": 33,
        "r": 17,
        "security": 39,
        "tradeValue": 47,
        "instability": 32,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Heavy Mining",
            "Out of Contact"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-34e03bcf49937a7edbb9",
        "name": "Chanela",
        "q": 4,
        "r": 33,
        "security": 27,
        "tradeValue": 57,
        "instability": 16,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Former Warriors",
            "Anthropomorphs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-261a72d2de2156ed6228",
        "name": "Kouliades",
        "q": 26,
        "r": 24,
        "security": 68,
        "tradeValue": 70,
        "instability": 7,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Cyclical Doom",
            "Colonized Population"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-b7b04e022e8a9ba61ae5",
        "name": "Azir",
        "q": 28,
        "r": 24,
        "security": 45,
        "tradeValue": 39,
        "instability": 31,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Utopia",
            "Robots",
            "Doomed World",
            "Hostile Biosphere"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-ccb04e698861a41cf87c",
        "name": "Calanom",
        "q": 17,
        "r": 44,
        "security": 46,
        "tradeValue": 73,
        "instability": 5,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Hatred",
            "Alien Ruins",
            "Tyranny",
            "Restrictive Laws"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-ac4c542940131472a01d",
        "name": "Sig",
        "q": 37,
        "r": 2,
        "security": 64,
        "tradeValue": 34,
        "instability": 22,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Hivemind",
            "Theocracy",
            "Hostile Biosphere",
            "Seismic Instability"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-046f8a1c67d1e85e6d67",
        "name": "Saga Jullati",
        "q": 37,
        "r": 30,
        "security": 55,
        "tradeValue": 20,
        "instability": 19,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Quarantined World",
            "Great Work",
            "Nomads",
            "Shackled World"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-4ba4ca6a33d9f625e77b",
        "name": "Scarphi",
        "q": 2,
        "r": 26,
        "security": 42,
        "tradeValue": 89,
        "instability": 13,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Great Work",
            "Altered Humanity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-3d820954f227ec2b3091",
        "name": "Thordis",
        "q": 13,
        "r": 33,
        "security": 23,
        "tradeValue": 10,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Anthropomorphs",
            "Prison Planet"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-2c43e5f027efa31149a4",
        "name": "Helga",
        "q": 28,
        "r": 15,
        "security": 30,
        "tradeValue": 58,
        "instability": 16,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Immortals",
            "Rising Hegemon",
            "Hatred",
            "Seagoing Cities"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-5bb669c4f6863fd34440",
        "name": "Kotatonis",
        "q": 4,
        "r": 2,
        "security": 63,
        "tradeValue": 12,
        "instability": 24,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Heavy Industry",
            "Megacorps",
            "Beastmasters",
            "Battleground"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-414232c001f7eb326b61",
        "name": "Anthene",
        "q": 17,
        "r": 13,
        "security": 35,
        "tradeValue": 38,
        "instability": 26,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Eugenic Cult",
            "Cybercommunists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-7bb54be5b2571bcab8fd",
        "name": "Roitomi XIV",
        "q": 13,
        "r": 22,
        "security": 54,
        "tradeValue": 71,
        "instability": 44,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tomb World",
            "Freak Weather",
            "Cultural Power",
            "Colonized Population"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-fa0b1dffda00ef2f632e",
        "name": "Muun's Ledger",
        "q": 35,
        "r": 10,
        "security": 90,
        "tradeValue": 99,
        "instability": 5,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Banking Hub",
            "Tax Haven",
            "weak_starting_armada",
            "capital"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-6e25d4c0d8f819351779",
        "name": "Galero",
        "q": 24,
        "r": 39,
        "security": 24,
        "tradeValue": 57,
        "instability": 13,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Unbraked AI",
            "Shackled World",
            "Police State",
            "Heavy Industry"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-2bd1a5fe96a34ca33eca",
        "name": "Halla",
        "q": 35,
        "r": 13,
        "security": 47,
        "tradeValue": 75,
        "instability": 10,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Area 51",
            "Primitive Aliens",
            "Local Specialty",
            "Tomb World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-be4002f65035772ac947",
        "name": "Feona",
        "q": 33,
        "r": 24,
        "security": 60,
        "tradeValue": 89,
        "instability": 38,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Sectarians",
            "Post-Scarcity"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-9c5f095a406cae00e02e",
        "name": "Mandra",
        "q": 35,
        "r": 39,
        "security": 57,
        "tradeValue": 75,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Prison Planet",
            "Regional Hegemon"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-00878ac605304517fcf1",
        "name": "Astotho",
        "q": 4,
        "r": 8,
        "security": 35,
        "tradeValue": 41,
        "instability": 39,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Xenophiles",
            "Doomed World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-beea8431a468fde791e4",
        "name": "Thordis",
        "q": 11,
        "r": 33,
        "security": 49,
        "tradeValue": 58,
        "instability": 10,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tomb World",
            "Altered Humanity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-322c8510c2a7803f4f62",
        "name": "Chracle",
        "q": 22,
        "r": 13,
        "security": 51,
        "tradeValue": 85,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Maneaters",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-b408e4b93d1a64ac5080",
        "name": "Creusa",
        "q": 11,
        "r": 26,
        "security": 62,
        "tradeValue": 75,
        "instability": 40,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Preceptor Archive",
            "Badlands World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-9114d4daa712ba370227",
        "name": "Armuhez",
        "q": 22,
        "r": 19,
        "security": 60,
        "tradeValue": 42,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Megacorps",
            "Mandate Base"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-618860964f60b00fdf8e",
        "name": "Guimend",
        "q": 22,
        "r": 11,
        "security": 39,
        "tradeValue": 31,
        "instability": 41,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Radioactive World",
            "Dying Race"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-e7d2277ef6ade0bd5818",
        "name": "Panos",
        "q": 37,
        "r": 11,
        "security": 33,
        "tradeValue": 28,
        "instability": 19,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revanchists",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-64b330bd4dcf42685da7",
        "name": "Thorgun",
        "q": 22,
        "r": 30,
        "security": 45,
        "tradeValue": 87,
        "instability": 6,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Freak Weather",
            "Seismic Instability"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-c5f83db2f6f7691379a0",
        "name": "Penesil",
        "q": 13,
        "r": 8,
        "security": 47,
        "tradeValue": 32,
        "instability": 38,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandarinate",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-2d2228bab8907fc0fae4",
        "name": "Halaia",
        "q": 15,
        "r": 30,
        "security": 67,
        "tradeValue": 28,
        "instability": 38,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Altered Humanity",
            "Minimal Contact"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-06be2bbb727c940eaa69",
        "name": "Rosolgu",
        "q": 17,
        "r": 33,
        "security": 52,
        "tradeValue": 21,
        "instability": 15,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Doomed World",
            "Major Spaceyard"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-ba27a3bd8bc12baa5ca6",
        "name": "Faws",
        "q": 26,
        "r": 22,
        "security": 26,
        "tradeValue": 50,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Radioactive World",
            "Major Spaceyard",
            "Rising Hegemon",
            "Alien Ruins"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-275436a4333557bd8558",
        "name": "Moneril",
        "q": 35,
        "r": 28,
        "security": 58,
        "tradeValue": 85,
        "instability": 19,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Post-Scarcity",
            "Abandoned Colony",
            "Terraform Failure",
            "Gold Rush"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-26d168eb718a2f71d9e3",
        "name": "Aguez",
        "q": 13,
        "r": 44,
        "security": 37,
        "tradeValue": 83,
        "instability": 43,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Exchange Consulate",
            "Out of Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-f326b9e042fa6bdef906",
        "name": "Valfdis",
        "q": 8,
        "r": 17,
        "security": 42,
        "tradeValue": 50,
        "instability": 35,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cold War",
            "Societal Despair",
            "Nomads",
            "Zombies",
            "Mercenaries",
            "Rising Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-62294315db6d7b6ee1fa",
        "name": "Volo",
        "q": 35,
        "r": 8,
        "security": 63,
        "tradeValue": 80,
        "instability": 35,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Desert World",
            "Megacorps",
            "Psionics Worship",
            "Primitive Aliens",
            "Former Warriors",
            "Restrictive Laws"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-8d0ab4f97c5c755ae21c",
        "name": "Al-rhud",
        "q": 2,
        "r": 2,
        "security": 22,
        "tradeValue": 39,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pilgrimage Site",
            "Holy War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-bb493903a82b682a09b7",
        "name": "Anthas",
        "q": 39,
        "r": 22,
        "security": 67,
        "tradeValue": 85,
        "instability": 42,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Freak Geology",
            "Societal Despair"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-fdc1d85697e1cfb20980",
        "name": "Gallia",
        "q": 30,
        "r": 17,
        "security": 51,
        "tradeValue": 85,
        "instability": 41,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Badlands World",
            "Gold Rush"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-5a4e807c3b982fbdc3ff",
        "name": "Perusa",
        "q": 37,
        "r": 15,
        "security": 63,
        "tradeValue": 39,
        "instability": 42,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Pleasure World",
            "Great Work"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-3b415e894aec8b9784d8",
        "name": "Thurid",
        "q": 15,
        "r": 33,
        "security": 37,
        "tradeValue": 14,
        "instability": 28,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Revanchists",
            "Perimeter Agency"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-f2de59304d1bf882e9b8",
        "name": "Tixeorraer",
        "q": 39,
        "r": 13,
        "security": 24,
        "tradeValue": 59,
        "instability": 29,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandate Base",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-a1da22f003f423b6d453",
        "name": "Matrini Mani",
        "q": 19,
        "r": 26,
        "security": 64,
        "tradeValue": 27,
        "instability": 31,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Mandate Base",
            "Cultural Power"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-7065e4bfb85c49197e1e",
        "name": "Astyna",
        "q": 2,
        "r": 39,
        "security": 29,
        "tradeValue": 81,
        "instability": 41,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rigid Culture",
            "Minimal Contact",
            "Fallen Hegemon",
            "Major Spaceyard"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-5c74d3ed7df81fde8bab",
        "name": "Helga",
        "q": 15,
        "r": 19,
        "security": 35,
        "tradeValue": 58,
        "instability": 27,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Outpost World",
            "Forbidden Tech",
            "Psionics Fear",
            "Freak Geology",
            "Minimal Contact"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-959a09b50fa701a712c1",
        "name": "Peydalv",
        "q": 35,
        "r": 37,
        "security": 27,
        "tradeValue": 87,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Mandate Base",
            "Societal Despair",
            "Night World",
            "Sectarians"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-a008ac6571e67969b423",
        "name": "Tece",
        "q": 33,
        "r": 35,
        "security": 38,
        "tradeValue": 63,
        "instability": 11,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Out of Contact",
            "Heavy Mining"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-f355340cef8c83ceed83",
        "name": "Panakoumb",
        "q": 33,
        "r": 26,
        "security": 51,
        "tradeValue": 48,
        "instability": 15,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Regional Hegemon",
            "Cyclical Doom"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-085812f4e511189ad9ad",
        "name": "Paniorgia",
        "q": 22,
        "r": 24,
        "security": 64,
        "tradeValue": 24,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Altered Humanity",
            "Pleasure World"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-b4f71ffbd6f247d6941d",
        "name": "Kos",
        "q": 6,
        "r": 24,
        "security": 49,
        "tradeValue": 33,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Geology",
            "Police State"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-cb99bd5dc79079de04f8",
        "name": "Inzad",
        "q": 37,
        "r": 35,
        "security": 29,
        "tradeValue": 50,
        "instability": 18,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Robots",
            "Preceptor Archive",
            "Mercenaries",
            "Battleground"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-92675f3b6d655e340990",
        "name": "Disoonbequ",
        "q": 4,
        "r": 13,
        "security": 26,
        "tradeValue": 17,
        "instability": 23,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Refugees",
            "Trade Hub",
            "Fallen Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-52c2705d81d86cb8e5ed",
        "name": "Euribia",
        "q": 44,
        "r": 2,
        "security": 43,
        "tradeValue": 33,
        "instability": 43,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Shackled World",
            "Refugees"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-77713d288e967f3dd906",
        "name": "Mavlakis",
        "q": 41,
        "r": 22,
        "security": 62,
        "tradeValue": 13,
        "instability": 25,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Rigid Culture",
            "Warlords",
            "Revanchists",
            "Fallen Hegemon"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-375cd7dcede25c802a67",
        "name": "Dukandreo",
        "q": 4,
        "r": 4,
        "security": 36,
        "tradeValue": 24,
        "instability": 23,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Xenophobes",
            "Unbraked AI",
            "Sole Supplier",
            "Perimeter Agency"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-6897a07a2c13440a46d7",
        "name": "Aetaia",
        "q": 26,
        "r": 41,
        "security": 65,
        "tradeValue": 11,
        "instability": 31,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Secret Masters",
            "Abandoned Colony"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-1709cb70fb36dacc5834",
        "name": "Vilizad",
        "q": 6,
        "r": 35,
        "security": 31,
        "tradeValue": 52,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Restrictive Laws",
            "Abandoned Colony"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-ef5a38ae451f125ea804",
        "name": "Ragnhil",
        "q": 22,
        "r": 4,
        "security": 22,
        "tradeValue": 56,
        "instability": 13,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revolutionaries",
            "Hostile Biosphere"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-ba89e04b1daca093eaa4",
        "name": "Aeon",
        "q": 26,
        "r": 19,
        "security": 58,
        "tradeValue": 38,
        "instability": 14,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Shackled World",
            "Out of Contact",
            "Heavy Industry",
            "Revolutionaries",
            "Gold Rush",
            "Cultural Power"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-0b46a0bec05790fc13c4",
        "name": "Daphne",
        "q": 24,
        "r": 13,
        "security": 57,
        "tradeValue": 60,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyclical Doom",
            "Shackled World",
            "Anthropomorphs",
            "Holy War",
            "Cold War",
            "Ritual Combat"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-9118700d09dd16a37dae",
        "name": "Gorle Zubalea",
        "q": 22,
        "r": 41,
        "security": 43,
        "tradeValue": 14,
        "instability": 16,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Former Warriors",
            "Prison Planet"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-fe1c7b05cd1af6875424",
        "name": "Genthouli",
        "q": 15,
        "r": 13,
        "security": 58,
        "tradeValue": 88,
        "instability": 33,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Oceanic World",
            "Heavy Industry"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-bfce419f3db68c99a5d5",
        "name": "Vari",
        "q": 2,
        "r": 28,
        "security": 61,
        "tradeValue": 74,
        "instability": 10,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Refugees",
            "Beastmasters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-955d12e6f38659750111",
        "name": "Urraber Lukera",
        "q": 28,
        "r": 4,
        "security": 52,
        "tradeValue": 72,
        "instability": 28,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Specialty",
            "Primitive Aliens"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-47f96874edc7ecf5332b",
        "name": "Iphos",
        "q": 22,
        "r": 15,
        "security": 53,
        "tradeValue": 54,
        "instability": 22,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Sectarians",
            "Misandry/Misogyny"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-6cba4294b94d7d7932c8",
        "name": "Pandill",
        "q": 33,
        "r": 13,
        "security": 64,
        "tradeValue": 48,
        "instability": 28,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Holy War",
            "Robots"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-a23ccc19631de6c1af51",
        "name": "Anthos",
        "q": 11,
        "r": 39,
        "security": 46,
        "tradeValue": 79,
        "instability": 5,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Sole Supplier",
            "Zombies",
            "Outpost World",
            "Local Specialty"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "alpha-3ed956ee2cf7fe6190bf",
        "name": "Ziyatik",
        "q": 41,
        "r": 28,
        "security": 28,
        "tradeValue": 47,
        "instability": 32,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse",
            "Gold Rush",
            "Local Tech"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-f6a828edd40e2d736209",
        "name": "Charche",
        "q": 22,
        "r": 33,
        "security": 35,
        "tradeValue": 48,
        "instability": 29,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse",
            "Psionics Fear",
            "Hatred"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-bf25caf698bb5d42de95",
        "name": "Tsyomas",
        "q": 41,
        "r": 39,
        "security": 40,
        "tradeValue": 14,
        "instability": 8,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse",
            "Zombies",
            "Area 51",
            "Hivemind",
            "Nomads"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "alpha-766bc8d1e933809eff63",
        "name": "Logheoulo",
        "q": 41,
        "r": 6,
        "security": 64,
        "tradeValue": 57,
        "instability": 14,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cultural Power",
            "Xenophiles"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-c5f8c0023d6adb25b58d",
        "name": "Penthakak",
        "q": 135,
        "r": 35,
        "security": 20,
        "tradeValue": 56,
        "instability": 19,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyclical Doom",
            "Shackled World"
            ,
            "corsair_den",
            "black-market"],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-57bb06780df12c56e136",
        "name": "Al-Mawa",
        "q": 137,
        "r": 2,
        "security": 65,
        "tradeValue": 67,
        "instability": 12,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Hatred",
            "Revanchists",
            "Holy War",
            "Minimal Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-1c57c0addeab1fc72537",
        "name": "Markezour",
        "q": 122,
        "r": 28,
        "security": 56,
        "tradeValue": 16,
        "instability": 14,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Tech",
            "Battleground"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-55a55dfd7d579bf57f89",
        "name": "Al-Marn",
        "q": 142,
        "r": 11,
        "security": 37,
        "tradeValue": 34,
        "instability": 29,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Misandry/Misogyny",
            "Outpost World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-0f247f64601e2e2c78c6",
        "name": "Berd",
        "q": 159,
        "r": 6,
        "security": 51,
        "tradeValue": 19,
        "instability": 38,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Preceptor Archive",
            "Outpost World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-f3c899cead828543e2cf",
        "name": "Erlatiisar",
        "q": 133,
        "r": 44,
        "security": 20,
        "tradeValue": 59,
        "instability": 44,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandate Base",
            "Restrictive Laws"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-db610ed3d41869099de0",
        "name": "Helgerg",
        "q": 161,
        "r": 24,
        "security": 21,
        "tradeValue": 46,
        "instability": 35,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Alien Ruins",
            "Hivemind"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-2dcf36e3f880c86255d2",
        "name": "Alcinor",
        "q": 124,
        "r": 22,
        "security": 58,
        "tradeValue": 62,
        "instability": 41,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Oceanic World",
            "Doomed World",
            "Mercenaries",
            "Pretech Cultists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-b1466e1bbe4623fa659f",
        "name": "Mata Irita",
        "q": 144,
        "r": 8,
        "security": 39,
        "tradeValue": 37,
        "instability": 40,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Altered Humanity",
            "Xenophiles",
            "Friendly Foe",
            "Nomads"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-6e62dd07925158f738e3",
        "name": "Midesti",
        "q": 128,
        "r": 2,
        "security": 49,
        "tradeValue": 80,
        "instability": 44,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Perimeter Agency",
            "Minimal Contact",
            "Abandoned Colony",
            "Battleground",
            "Freak Geology",
            "Anarchists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-e82292557740b3348233",
        "name": "Enteri",
        "q": 164,
        "r": 6,
        "security": 49,
        "tradeValue": 84,
        "instability": 7,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Altered Humanity",
            "Civil War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-6c95b052cbabede02b5f",
        "name": "Jyota Mankira",
        "q": 126,
        "r": 37,
        "security": 39,
        "tradeValue": 15,
        "instability": 40,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Xenophobes",
            "Shackled World",
            "Pleasure World",
            "Oceanic World",
            "Rigid Culture",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-855ec0bc494f210b3e8c",
        "name": "Daphe",
        "q": 133,
        "r": 35,
        "security": 31,
        "tradeValue": 27,
        "instability": 25,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Perimeter Agency",
            "Colonized Population"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-c0787c791d7dcbf7a40e",
        "name": "Meniga",
        "q": 128,
        "r": 8,
        "security": 50,
        "tradeValue": 65,
        "instability": 27,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Worship",
            "Ritual Combat",
            "Hatred",
            "Area 51"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-d65ebc02964a510abad5",
        "name": "Mah",
        "q": 124,
        "r": 35,
        "security": 42,
        "tradeValue": 29,
        "instability": 42,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyclical Doom",
            "Badlands World",
            "Pretech Cultists",
            "Urbanized Surface",
            "Exchange Consulate",
            "Perimeter Agency"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-82a57cbe0ed3dff7731a",
        "name": "Leider",
        "q": 142,
        "r": 28,
        "security": 51,
        "tradeValue": 67,
        "instability": 20,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Shackled World",
            "Maneaters",
            "Rising Hegemon",
            "Colonized Population"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-2df33f092b3d82b58a4a",
        "name": "Asta",
        "q": 142,
        "r": 37,
        "security": 36,
        "tradeValue": 28,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Post-Scarcity",
            "Flying Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-921a11ac31d98eb81cc8",
        "name": "Thorhil XIII",
        "q": 137,
        "r": 24,
        "security": 32,
        "tradeValue": 79,
        "instability": 37,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Weather",
            "Holy War",
            "Bubble Cities",
            "Ritual Combat",
            "Cyclical Doom",
            "Heavy Mining"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-d10fe5f484be88dc8400",
        "name": "Iolestr",
        "q": 153,
        "r": 17,
        "security": 39,
        "tradeValue": 89,
        "instability": 43,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandarinate",
            "Nomads"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-563fca435e9525e7b563",
        "name": "Hala",
        "q": 159,
        "r": 13,
        "security": 59,
        "tradeValue": 72,
        "instability": 25,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rigid Culture",
            "Sectarians",
            "Unbraked AI",
            "Feral World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-732792bb58c91a56628e",
        "name": "Thora",
        "q": 133,
        "r": 2,
        "security": 46,
        "tradeValue": 62,
        "instability": 10,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Radioactive World",
            "Beastmasters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-62e4795b3a71fe1e8dcc",
        "name": "Gunna",
        "q": 142,
        "r": 33,
        "security": 26,
        "tradeValue": 71,
        "instability": 5,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Exchange Consulate",
            "Seismic Instability",
            "Pleasure World",
            "Local Specialty",
            "Rising Hegemon",
            "Hostile Space"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-cf25ff19292a459c370d",
        "name": "Peleus",
        "q": 146,
        "r": 22,
        "security": 56,
        "tradeValue": 52,
        "instability": 13,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cheap Life",
            "Pretech Cultists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-f25c24652c5adb52cd26",
        "name": "Aethra",
        "q": 139,
        "r": 22,
        "security": 28,
        "tradeValue": 33,
        "instability": 43,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Restrictive Laws",
            "Hatred"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-89e124cb21241279d856",
        "name": "Dimantira",
        "q": 161,
        "r": 41,
        "security": 49,
        "tradeValue": 73,
        "instability": 19,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Eugenic Cult",
            "Regional Hegemon",
            "Beastmasters",
            "Heavy Industry"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-f65c954454286b66c941",
        "name": "Al-Mawa",
        "q": 161,
        "r": 8,
        "security": 61,
        "tradeValue": 17,
        "instability": 11,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Minimal Contact",
            "Taboo Treasure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-9d93f65702d91f7c197a",
        "name": "Gira",
        "q": 148,
        "r": 11,
        "security": 22,
        "tradeValue": 32,
        "instability": 36,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Oceanic World",
            "Alien Ruins"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-de96a8159eaa52f24bdc",
        "name": "Panakoumb",
        "q": 153,
        "r": 19,
        "security": 43,
        "tradeValue": 32,
        "instability": 35,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Desert World",
            "Local Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-820c1e701b1cc8fecdb6",
        "name": "Calia",
        "q": 135,
        "r": 8,
        "security": 27,
        "tradeValue": 67,
        "instability": 14,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Robots",
            "Radioactive World",
            "Taboo Treasure",
            "Prison Planet"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-17e4596e61006e302745",
        "name": "Papadis",
        "q": 133,
        "r": 22,
        "security": 62,
        "tradeValue": 50,
        "instability": 26,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Hivemind",
            "Pleasure World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-9a871a0a8e9ea7a21f1f",
        "name": "Thordis",
        "q": 153,
        "r": 39,
        "security": 28,
        "tradeValue": 50,
        "instability": 10,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pretech Cultists",
            "Urbanized Surface"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-7a8ce6eb04f33dfbe744",
        "name": "Ablah",
        "q": 126,
        "r": 30,
        "security": 69,
        "tradeValue": 32,
        "instability": 40,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Desert World",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-34c23920b83a60cab3b1",
        "name": "Zasoza",
        "q": 144,
        "r": 28,
        "security": 69,
        "tradeValue": 63,
        "instability": 26,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Desert World",
            "Regional Hegemon",
            "Primitive Aliens",
            "Megacorps",
            "Bubble Cities",
            "Altered Humanity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-cc0be74a1b0003415961",
        "name": "Idaros",
        "q": 164,
        "r": 2,
        "security": 43,
        "tradeValue": 73,
        "instability": 42,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tyranny",
            "Hostile Biosphere"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-39e3e118b4f8428f6edd",
        "name": "Hild",
        "q": 122,
        "r": 19,
        "security": 51,
        "tradeValue": 49,
        "instability": 44,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Feral World",
            "Ritual Combat"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-7525e9a606bdf2fc36d3",
        "name": "Clyphne",
        "q": 157,
        "r": 41,
        "security": 49,
        "tradeValue": 27,
        "instability": 5,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Outpost World",
            "Sectarians"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-79a68f2b78845c1f6ecb",
        "name": "Daphe",
        "q": 133,
        "r": 13,
        "security": 48,
        "tradeValue": 11,
        "instability": 32,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Warlords",
            "Altered Humanity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-c635f69a1f9f4895c403",
        "name": "Cocelan",
        "q": 148,
        "r": 13,
        "security": 45,
        "tradeValue": 16,
        "instability": 26,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seagoing Cities",
            "Freak Geology",
            "Prison Planet",
            "Flying Cities",
            "Local Specialty",
            "Area 51"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-668faef57c6f2ef34520",
        "name": "Tadraga",
        "q": 137,
        "r": 22,
        "security": 27,
        "tradeValue": 75,
        "instability": 39,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pretech Cultists",
            "Eugenic Cult",
            "Colonized Population",
            "Cyclical Doom",
            "Hostile Biosphere",
            "Local Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-55c58ce0dd4c30e4bbc8",
        "name": "Aliya",
        "q": 128,
        "r": 44,
        "security": 38,
        "tradeValue": 49,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Dying Race",
            "Local Specialty"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-4f583d7245f8ec6be7fc",
        "name": "Flos",
        "q": 144,
        "r": 13,
        "security": 31,
        "tradeValue": 10,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Theocracy",
            "Night World",
            "Sectarians",
            "Rigid Culture"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-7be12cddf0a4c22907ff",
        "name": "Arneion",
        "q": 131,
        "r": 37,
        "security": 48,
        "tradeValue": 16,
        "instability": 27,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Great Work",
            "Cybercommunists",
            "Quarantined World",
            "Post-Scarcity",
            "Ritual Combat"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-3fb1899476465e8495d5",
        "name": "Maz",
        "q": 153,
        "r": 15,
        "security": 44,
        "tradeValue": 13,
        "instability": 13,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyclical Doom",
            "Forbidden Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-b8164bddec16d19d73e4",
        "name": "Tabet",
        "q": 122,
        "r": 4,
        "security": 42,
        "tradeValue": 56,
        "instability": 36,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cultural Power",
            "Tomb World",
            "Maneaters",
            "Great Work",
            "Pretech Cultists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-62ab9e657c386b4cd1de",
        "name": "Canto",
        "q": 133,
        "r": 37,
        "security": 30,
        "tradeValue": 30,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Terraform Failure",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-7c515dbea9e435f5aecf",
        "name": "Andylis",
        "q": 157,
        "r": 39,
        "security": 25,
        "tradeValue": 46,
        "instability": 21,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Former Warriors",
            "Radioactive World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-81c89328761a457b3445",
        "name": "Gograpatk",
        "q": 157,
        "r": 30,
        "security": 65,
        "tradeValue": 21,
        "instability": 34,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Feral World",
            "Sole Supplier"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-0eea8fb5886634a21e36",
        "name": "Thorfin",
        "q": 150,
        "r": 39,
        "security": 49,
        "tradeValue": 81,
        "instability": 14,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Urbanized Surface",
            "Sealed Menace",
            "Flying Cities",
            "Cheap Life"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-7c3b24c658df2d289c14",
        "name": "Manris",
        "q": 148,
        "r": 26,
        "security": 41,
        "tradeValue": 73,
        "instability": 11,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cheap Life",
            "Nomads",
            "Anarchists",
            "Minimal Contact",
            "Police State",
            "Mandate Base"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-c6e3f27e9ec1ae6fb4db",
        "name": "Amphe",
        "q": 150,
        "r": 30,
        "security": 66,
        "tradeValue": 32,
        "instability": 11,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cheap Life",
            "Out of Contact",
            "Former Warriors",
            "Badlands World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-4ee3f2b044243635e376",
        "name": "Freyda",
        "q": 161,
        "r": 6,
        "security": 35,
        "tradeValue": 16,
        "instability": 16,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Worship",
            "Taboo Treasure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-ce2a30dc97fb96d6815d",
        "name": "Kos",
        "q": 131,
        "r": 6,
        "security": 34,
        "tradeValue": 11,
        "instability": 37,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Anarchists",
            "Out of Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-4bd06018ed2e39e80144",
        "name": "Chracle",
        "q": 150,
        "r": 13,
        "security": 21,
        "tradeValue": 53,
        "instability": 34,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Quarantined World",
            "Holy War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-953f35418860d1997c2f",
        "name": "Bedire",
        "q": 142,
        "r": 26,
        "security": 36,
        "tradeValue": 18,
        "instability": 28,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandarinate",
            "Exchange Consulate"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-aec7801f5496bd6f19ea",
        "name": "Herte",
        "q": 131,
        "r": 4,
        "security": 46,
        "tradeValue": 86,
        "instability": 25,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pleasure World",
            "Urbanized Surface"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-2f8675f3f38599d82367",
        "name": "Mitrostak",
        "q": 137,
        "r": 35,
        "security": 26,
        "tradeValue": 72,
        "instability": 37,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Xenophiles",
            "Hatred"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-4a0a29d9b91279193337",
        "name": "Kous",
        "q": 150,
        "r": 2,
        "security": 60,
        "tradeValue": 82,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cheap Life",
            "Pilgrimage Site",
            "Badlands World",
            "Xenophobes",
            "Post-Scarcity",
            "Area 51"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-a9f12cde01ba11d02b9d",
        "name": "Hipheph XVIII",
        "q": 126,
        "r": 35,
        "security": 43,
        "tradeValue": 82,
        "instability": 7,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Night World",
            "Radioactive World",
            "Maneaters",
            "Heavy Industry"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-2863f7328abb4030517e",
        "name": "Theliouna",
        "q": 159,
        "r": 41,
        "security": 41,
        "tradeValue": 54,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Civil War",
            "Hatred",
            "Preceptor Archive",
            "Taboo Treasure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-c54a9f0ea25a027a295a",
        "name": "Rafquat",
        "q": 155,
        "r": 4,
        "security": 21,
        "tradeValue": 23,
        "instability": 38,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Doomed World",
            "Secret Masters",
            "Eugenic Cult",
            "Rising Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-ac125172d4e963508617",
        "name": "Polyzoglo",
        "q": 148,
        "r": 22,
        "security": 23,
        "tradeValue": 17,
        "instability": 21,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Police State",
            "Sole Supplier"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-a2bfe047172cf490aea9",
        "name": "Eurysto",
        "q": 122,
        "r": 33,
        "security": 60,
        "tradeValue": 88,
        "instability": 6,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Anarchists",
            "Minimal Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-4e1dd4d3384f3f5cf7eb",
        "name": "Pipouloul",
        "q": 157,
        "r": 8,
        "security": 45,
        "tradeValue": 40,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Weather",
            "Shackled World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-4817db6ad5ecd27f0417",
        "name": "Gograpatk",
        "q": 137,
        "r": 15,
        "security": 65,
        "tradeValue": 10,
        "instability": 24,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revanchists",
            "Societal Despair",
            "Shackled World",
            "Heavy Mining",
            "Pretech Cultists",
            "Great Work"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-cbb753893569b18039f4",
        "name": "Inn",
        "q": 157,
        "r": 15,
        "security": 27,
        "tradeValue": 35,
        "instability": 39,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Urbanized Surface",
            "Seagoing Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-8d686d52c7e4023203d5",
        "name": "Barozo Guri",
        "q": 155,
        "r": 22,
        "security": 43,
        "tradeValue": 39,
        "instability": 24,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Outpost World",
            "Psionics Fear",
            "Abandoned Colony",
            "Dying Race"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-ff1d82cf0013f01a89af",
        "name": "Thorhil",
        "q": 146,
        "r": 35,
        "security": 38,
        "tradeValue": 59,
        "instability": 6,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rising Hegemon",
            "Sectarians",
            "Terraform Failure",
            "Refugees"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-a5cb3814eeecf3b0332f",
        "name": "Idarete",
        "q": 139,
        "r": 28,
        "security": 63,
        "tradeValue": 31,
        "instability": 28,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Out of Contact",
            "Pleasure World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-e12969b14b05937fadb6",
        "name": "Leda",
        "q": 148,
        "r": 33,
        "security": 39,
        "tradeValue": 14,
        "instability": 44,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revolutionaries",
            "Xenophobes"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-cd431cef240788933ac6",
        "name": "Quetoyo",
        "q": 150,
        "r": 8,
        "security": 63,
        "tradeValue": 13,
        "instability": 43,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cybercommunists",
            "Prison Planet"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-0f160ab95ed003567f13",
        "name": "Jafquaa",
        "q": 135,
        "r": 28,
        "security": 62,
        "tradeValue": 13,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seagoing Cities",
            "Outpost World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-6c23ca0639e80aa73208",
        "name": "Mona",
        "q": 161,
        "r": 33,
        "security": 48,
        "tradeValue": 16,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandate Base",
            "Great Work",
            "Major Spaceyard",
            "Regional Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-5d553dd1008a281d4431",
        "name": "Gudrima",
        "q": 157,
        "r": 17,
        "security": 57,
        "tradeValue": 55,
        "instability": 44,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Terraform Failure",
            "Theocracy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-632171f60a1458f77c17",
        "name": "Eretus",
        "q": 150,
        "r": 24,
        "security": 51,
        "tradeValue": 45,
        "instability": 27,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cybercommunists",
            "Freak Geology",
            "Ritual Combat",
            "Bubble Cities",
            "Outpost World",
            "Theocracy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-56b0bea442819b0a79fa",
        "name": "Hero",
        "q": 144,
        "r": 11,
        "security": 45,
        "tradeValue": 42,
        "instability": 32,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Perimeter Agency",
            "Seismic Instability"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-ce5674100b4cea16d5f1",
        "name": "Thracle",
        "q": 155,
        "r": 37,
        "security": 39,
        "tradeValue": 35,
        "instability": 15,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Terraform Failure",
            "Pretech Cultists",
            "Mandate Base",
            "Altered Humanity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-0d8d2c468f83d7a70b59",
        "name": "Thras",
        "q": 148,
        "r": 24,
        "security": 31,
        "tradeValue": 34,
        "instability": 21,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyclical Doom",
            "Secret Masters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-69c8bbc66c63e6e36d3f",
        "name": "Edor",
        "q": 128,
        "r": 22,
        "security": 67,
        "tradeValue": 74,
        "instability": 30,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Nomads",
            "Cold War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-02b7e603768bbb2a4d70",
        "name": "Huel",
        "q": 128,
        "r": 37,
        "security": 43,
        "tradeValue": 72,
        "instability": 39,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Heavy Mining",
            "Anthropomorphs",
            "Quarantined World",
            "Former Warriors"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-c03c3de3e71278c7b014",
        "name": "Marrin",
        "q": 126,
        "r": 41,
        "security": 37,
        "tradeValue": 86,
        "instability": 15,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Abandoned Colony",
            "Psionics Worship",
            "Hostile Biosphere",
            "Warlords",
            "Holy War",
            "Flying Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-28faec89234251cf184f",
        "name": "Euryala",
        "q": 139,
        "r": 35,
        "security": 68,
        "tradeValue": 15,
        "instability": 43,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revolutionaries",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-5b07ba4d9b8b6d8cddfc",
        "name": "Callani",
        "q": 142,
        "r": 15,
        "security": 36,
        "tradeValue": 50,
        "instability": 20,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Major Spaceyard",
            "Societal Despair",
            "Area 51",
            "Refugees",
            "Civil War",
            "Heavy Mining"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-0f730835cc4b6ac6432f",
        "name": "Menes",
        "q": 139,
        "r": 41,
        "security": 42,
        "tradeValue": 20,
        "instability": 27,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Dying Race",
            "Cyborgs",
            "Colonized Population",
            "Local Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-8a19c9728a7c8ed266fd",
        "name": "Astos",
        "q": 161,
        "r": 35,
        "security": 26,
        "tradeValue": 63,
        "instability": 34,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Exchange Consulate",
            "Out of Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-7ca951c541e3eebce299",
        "name": "Menos",
        "q": 142,
        "r": 17,
        "security": 55,
        "tradeValue": 73,
        "instability": 35,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Friendly Foe",
            "Refugees"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-54c17fa621aefdbef17c",
        "name": "Grid",
        "q": 164,
        "r": 30,
        "security": 55,
        "tradeValue": 70,
        "instability": 20,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Preceptor Archive",
            "Sealed Menace"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-a331719b5bb4e59d2037",
        "name": "Asirida",
        "q": 128,
        "r": 19,
        "security": 35,
        "tradeValue": 89,
        "instability": 39,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Pleasure World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "beta-b81f11e98033caa0d1e7",
        "name": "Hroa",
        "q": 146,
        "r": 13,
        "security": 62,
        "tradeValue": 12,
        "instability": 38,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Abandoned Colony",
            "Great Work",
            "Prison Planet",
            "Altered Humanity",
            "Secret Masters",
            "Out of Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-b695c2c3ec80b99ca69c",
        "name": "Zabale Urra",
        "q": 44,
        "r": 139,
        "security": 32,
        "tradeValue": 89,
        "instability": 26,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Outpost World",
            "Psionics Worship",
            "Sole Supplier",
            "Shackled World",
            "Terraform Failure",
            "Cultural Power"
            ,
            "corsair_den",
            "black-market",
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-a9f24cc1d81380947287",
        "name": "Nes",
        "q": 15,
        "r": 142,
        "security": 26,
        "tradeValue": 88,
        "instability": 27,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Weather",
            "Post-Scarcity"
            ,
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-eefe6c36e631624352cf",
        "name": "Sumilpa Avvi",
        "q": 11,
        "r": 137,
        "security": 32,
        "tradeValue": 55,
        "instability": 22,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Sealed Menace",
            "Quarantined World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-fcef9b84cb40cf60bba2",
        "name": "Falca",
        "q": 28,
        "r": 153,
        "security": 26,
        "tradeValue": 10,
        "instability": 6,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Secret Masters",
            "Friendly Foe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-91ef7f7ca53b1d0358a6",
        "name": "Karis",
        "q": 24,
        "r": 144,
        "security": 51,
        "tradeValue": 31,
        "instability": 35,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Zombies"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-21580600c4ed6adfe98f",
        "name": "Autolyp",
        "q": 6,
        "r": 150,
        "security": 29,
        "tradeValue": 53,
        "instability": 37,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pleasure World",
            "Radioactive World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-3d68ef177e55f1ad4fd4",
        "name": "Diomikato",
        "q": 15,
        "r": 164,
        "security": 39,
        "tradeValue": 49,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Worship",
            "Anthropomorphs",
            "Hostile Space",
            "Radioactive World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-8ecfdc5d70dde035eb06",
        "name": "Gograpatk",
        "q": 8,
        "r": 146,
        "security": 51,
        "tradeValue": 39,
        "instability": 40,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Oceanic World",
            "Warlords"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-97d0bdb9e729c1661701",
        "name": "Antino",
        "q": 2,
        "r": 126,
        "security": 42,
        "tradeValue": 19,
        "instability": 26,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Heavy Industry"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-1eac053f009edbbbc2da",
        "name": "Otio",
        "q": 37,
        "r": 133,
        "security": 48,
        "tradeValue": 62,
        "instability": 11,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Altered Humanity",
            "Preceptor Archive",
            "Former Warriors",
            "Abandoned Colony"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-8f31498752a434bf85cf",
        "name": "Sumaya Ruchi",
        "q": 6,
        "r": 144,
        "security": 30,
        "tradeValue": 83,
        "instability": 28,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Prison Planet",
            "Mandarinate"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-9ad066ff06d05ecc42d2",
        "name": "Panoulou",
        "q": 35,
        "r": 135,
        "security": 42,
        "tradeValue": 85,
        "instability": 44,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Tech",
            "Psionics Worship"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-8721c2c98a69b3b71088",
        "name": "Paniorgia",
        "q": 28,
        "r": 128,
        "security": 57,
        "tradeValue": 70,
        "instability": 33,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Civil War",
            "Seismic Instability"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-057ebf96e2377cb9751f",
        "name": "Actolyt",
        "q": 39,
        "r": 137,
        "security": 57,
        "tradeValue": 34,
        "instability": 35,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Taboo Treasure",
            "Major Spaceyard"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-c29aefb61a1c9c96fc4f",
        "name": "Areedah",
        "q": 39,
        "r": 155,
        "security": 45,
        "tradeValue": 45,
        "instability": 27,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cybercommunists",
            "Immortals"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-62625035f3b13dd2c04c",
        "name": "Menoon",
        "q": 30,
        "r": 144,
        "security": 53,
        "tradeValue": 17,
        "instability": 31,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Tech",
            "Cyclical Doom"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-7181985f1d1d19bdf2ec",
        "name": "Thepos",
        "q": 22,
        "r": 146,
        "security": 46,
        "tradeValue": 36,
        "instability": 13,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Outpost World",
            "Revanchists",
            "Anthropomorphs",
            "Freak Geology",
            "Rigid Culture"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-0cef58cc009bc1c15f59",
        "name": "Anaorgein",
        "q": 44,
        "r": 133,
        "security": 62,
        "tradeValue": 12,
        "instability": 23,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Out of Contact",
            "Mercenaries"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-bc072a518af1938b60bd",
        "name": "Sulahha",
        "q": 6,
        "r": 126,
        "security": 46,
        "tradeValue": 74,
        "instability": 7,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Academy",
            "Colonized Population",
            "Cybercommunists",
            "Freak Weather",
            "Rising Hegemon",
            "Secret Masters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-4a773fecb2c4c3230258",
        "name": "Erginus",
        "q": 13,
        "r": 133,
        "security": 27,
        "tradeValue": 65,
        "instability": 43,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Urbanized Surface",
            "Unbraked AI",
            "Former Warriors",
            "Badlands World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-7bca59b7eac72aef0816",
        "name": "Helgerg",
        "q": 17,
        "r": 164,
        "security": 46,
        "tradeValue": 22,
        "instability": 31,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Exchange Consulate",
            "Seismic Instability",
            "Night World",
            "Cold War",
            "Doomed World",
            "Perimeter Agency"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-fdf88baeb345fa14cc93",
        "name": "Prias",
        "q": 26,
        "r": 157,
        "security": 67,
        "tradeValue": 64,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyclical Doom",
            "Revolutionaries"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-d0c866c35ef74cbb4ea1",
        "name": "Chrodar",
        "q": 33,
        "r": 131,
        "security": 22,
        "tradeValue": 70,
        "instability": 28,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rigid Culture",
            "Flying Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-15c234ff62898d6a0397",
        "name": "Xydianis",
        "q": 22,
        "r": 122,
        "security": 40,
        "tradeValue": 78,
        "instability": 15,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyborgs",
            "Psionics Fear"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-a44406316e50ddb57fab",
        "name": "Nal Seeta",
        "q": 11,
        "r": 164,
        "security": 50,
        "tradeValue": 59,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revolutionaries",
            "Friendly Foe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-a43593bc02027d9e27cd",
        "name": "Sumilpa Avvi",
        "q": 22,
        "r": 157,
        "security": 43,
        "tradeValue": 23,
        "instability": 36,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Exchange Consulate",
            "Refugees",
            "Restrictive Laws"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-d6e47e35c2bf5113c447",
        "name": "Andiz Nahaitz",
        "q": 28,
        "r": 164,
        "security": 66,
        "tradeValue": 78,
        "instability": 18,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revanchists",
            "Holy War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-820819a6ca58597dfb2e",
        "name": "Perithr",
        "q": 33,
        "r": 126,
        "security": 64,
        "tradeValue": 77,
        "instability": 14,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pilgrimage Site",
            "Local Tech",
            "Sole Supplier",
            "Robots"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-687d9ef302f2da9e89ae",
        "name": "Ditriya Puna",
        "q": 13,
        "r": 124,
        "security": 43,
        "tradeValue": 13,
        "instability": 43,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Fear",
            "Cyclical Doom"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-50648c9376b39dd049b3",
        "name": "Pera",
        "q": 13,
        "r": 161,
        "security": 46,
        "tradeValue": 63,
        "instability": 15,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Geology",
            "Oceanic World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-50f8a8c9ec8420303704",
        "name": "Kinirgi Ekta",
        "q": 41,
        "r": 126,
        "security": 35,
        "tradeValue": 38,
        "instability": 19,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Primitive Aliens",
            "Badlands World",
            "Psionics Worship"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-2b3b53181d66d15d09a6",
        "name": "Sig",
        "q": 22,
        "r": 159,
        "security": 27,
        "tradeValue": 68,
        "instability": 35,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Minimal Contact",
            "Hatred"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-bb3e70cdffaa4c134ab2",
        "name": "Amedere Orbere",
        "q": 39,
        "r": 161,
        "security": 66,
        "tradeValue": 68,
        "instability": 9,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyborgs",
            "Quarantined World",
            "Forbidden Tech",
            "Tomb World",
            "Cybercommunists",
            "Revanchists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-16065a790f8240690bdc",
        "name": "Katas",
        "q": 28,
        "r": 150,
        "security": 54,
        "tradeValue": 60,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Nomads",
            "Alien Ruins"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-3b342ea7ccf553eb51b2",
        "name": "Mar",
        "q": 26,
        "r": 135,
        "security": 45,
        "tradeValue": 81,
        "instability": 24,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pilgrimage Site",
            "Police State",
            "Mercenaries",
            "Alien Ruins"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-bb33e5e94ce068dbbc1d",
        "name": "Kiko",
        "q": 17,
        "r": 155,
        "security": 55,
        "tradeValue": 58,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seismic Instability",
            "Prison Planet"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-7acee9a75b1d3221de18",
        "name": "Psavrosth",
        "q": 33,
        "r": 159,
        "security": 41,
        "tradeValue": 23,
        "instability": 11,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Area 51",
            "Desert World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-70c116866aa5a710699f",
        "name": "Garteag",
        "q": 28,
        "r": 161,
        "security": 49,
        "tradeValue": 30,
        "instability": 21,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Nomads",
            "Primitive Aliens",
            "Badlands World",
            "Unbraked AI",
            "Pleasure World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-31c2aa3d479e8869451e",
        "name": "Bergtho",
        "q": 33,
        "r": 124,
        "security": 60,
        "tradeValue": 63,
        "instability": 28,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cold War",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-8a655487736673213da3",
        "name": "Carjel",
        "q": 8,
        "r": 144,
        "security": 46,
        "tradeValue": 49,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyborgs",
            "Seismic Instability"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-478377d2af23747cbef4",
        "name": "Thoe",
        "q": 30,
        "r": 146,
        "security": 31,
        "tradeValue": 59,
        "instability": 5,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Theocracy",
            "Nomads"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-af4c8087e48565cbc29d",
        "name": "Valld",
        "q": 26,
        "r": 133,
        "security": 61,
        "tradeValue": 24,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Area 51",
            "Fallen Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-ec7c147c151b113ebcc2",
        "name": "Bus",
        "q": 19,
        "r": 144,
        "security": 31,
        "tradeValue": 56,
        "instability": 28,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cold War",
            "Robots",
            "Freak Geology",
            "Battleground"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-ecbd79c783b577b6e001",
        "name": "Alciphe VII",
        "q": 2,
        "r": 139,
        "security": 69,
        "tradeValue": 78,
        "instability": 38,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Warlords",
            "Gold Rush"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-7ff3543165d3def7b112",
        "name": "Dynaero",
        "q": 4,
        "r": 135,
        "security": 40,
        "tradeValue": 32,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Eugenic Cult",
            "Forbidden Tech",
            "Preceptor Archive",
            "Exchange Consulate",
            "Badlands World",
            "Tyranny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-92e8798abdeef7ec72c0",
        "name": "Thorunn",
        "q": 15,
        "r": 155,
        "security": 23,
        "tradeValue": 12,
        "instability": 31,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Sealed Menace",
            "Refugees"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-f3f1ca458f6229840a99",
        "name": "Aganian",
        "q": 33,
        "r": 139,
        "security": 49,
        "tradeValue": 57,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Academy",
            "Freak Weather"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-ec75c51f1b5fb3cd6b89",
        "name": "Gizos",
        "q": 26,
        "r": 122,
        "security": 52,
        "tradeValue": 34,
        "instability": 40,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Abandoned Colony",
            "Out of Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-7a42e1868b8f959bdc2f",
        "name": "Damopoupi",
        "q": 30,
        "r": 133,
        "security": 69,
        "tradeValue": 43,
        "instability": 42,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Dying Race",
            "Pretech Cultists",
            "Area 51",
            "Exchange Consulate",
            "Great Work",
            "Cheap Life"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-57dc1bac11d8bb8563cc",
        "name": "Thordis",
        "q": 28,
        "r": 131,
        "security": 62,
        "tradeValue": 34,
        "instability": 40,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Alien Ruins",
            "Seagoing Cities",
            "Robots"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-9346dbd4ac7a438dc5d7",
        "name": "Jorhild",
        "q": 24,
        "r": 135,
        "security": 60,
        "tradeValue": 23,
        "instability": 36,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Terraform Failure",
            "Revanchists",
            "Immortals",
            "Colonized Population"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-4143b6a0e3070771cf7f",
        "name": "Luna",
        "q": 35,
        "r": 157,
        "security": 60,
        "tradeValue": 13,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rising Hegemon",
            "Battleground",
            "Urbanized Surface",
            "Great Work",
            "Sole Supplier"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-3b036c40c3c9a2b3f54a",
        "name": "Hrefna",
        "q": 19,
        "r": 139,
        "security": 39,
        "tradeValue": 43,
        "instability": 38,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Holy War",
            "Civil War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-ead9315eff66b2436c12",
        "name": "Tsonis",
        "q": 11,
        "r": 139,
        "security": 45,
        "tradeValue": 79,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Hatred",
            "Taboo Treasure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-41a8b0746a92ae2afa68",
        "name": "Gyda",
        "q": 19,
        "r": 135,
        "security": 36,
        "tradeValue": 73,
        "instability": 44,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cheap Life",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-6877838b86951f091b4e",
        "name": "Aganame",
        "q": 44,
        "r": 142,
        "security": 47,
        "tradeValue": 51,
        "instability": 18,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Utopia",
            "Police State",
            "Megacorps",
            "Xenophiles"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-61ff2dfc995d521a8d7c",
        "name": "Surohi Pala",
        "q": 41,
        "r": 131,
        "security": 31,
        "tradeValue": 18,
        "instability": 6,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Unbraked AI",
            "Cybercommunists",
            "Anthropomorphs",
            "Xenophiles"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-775c53887949c4d88c77",
        "name": "Laedestiqu",
        "q": 22,
        "r": 124,
        "security": 22,
        "tradeValue": 85,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Utopia",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-1f814750ed2766162259",
        "name": "Corra",
        "q": 17,
        "r": 159,
        "security": 52,
        "tradeValue": 33,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cybercommunists",
            "Hostile Space"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-ed3fd619ea66ad8d7d25",
        "name": "Fela",
        "q": 30,
        "r": 122,
        "security": 30,
        "tradeValue": 61,
        "instability": 28,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Area 51",
            "Rising Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-10580b6d6896787c92c7",
        "name": "Stanayiou",
        "q": 33,
        "r": 157,
        "security": 25,
        "tradeValue": 44,
        "instability": 7,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Friendly Foe",
            "Cybercommunists",
            "Pretech Cultists",
            "Misandry/Misogyny",
            "Cold War",
            "Feral World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-35c6ff816b2058a8e6f2",
        "name": "Prita Preela",
        "q": 15,
        "r": 122,
        "security": 66,
        "tradeValue": 59,
        "instability": 16,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seismic Instability",
            "Abandoned Colony",
            "Friendly Foe",
            "Primitive Aliens"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-5e1bff1ae8f543660e33",
        "name": "Pivediv Varsha",
        "q": 2,
        "r": 161,
        "security": 61,
        "tradeValue": 54,
        "instability": 28,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cultural Power",
            "Terraform Failure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-cdde4c2bb81bece8d1ac",
        "name": "Shanila Ruti",
        "q": 15,
        "r": 144,
        "security": 63,
        "tradeValue": 80,
        "instability": 5,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Oceanic World",
            "Hostile Biosphere",
            "Seismic Instability",
            "Perimeter Agency",
            "Urbanized Surface",
            "Mandarinate"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-37341b05d17b63d28051",
        "name": "Khantar",
        "q": 11,
        "r": 131,
        "security": 57,
        "tradeValue": 56,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pretech Cultists",
            "Area 51"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-6bb5826713afebbe6527",
        "name": "Protino",
        "q": 33,
        "r": 161,
        "security": 29,
        "tradeValue": 14,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Primitive Aliens",
            "Immortals"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-c9ba4009713a03b228f4",
        "name": "Ingigud",
        "q": 35,
        "r": 164,
        "security": 59,
        "tradeValue": 35,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Former Warriors",
            "Local Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-beb36e969fa6ab62fd14",
        "name": "Argeus",
        "q": 6,
        "r": 161,
        "security": 26,
        "tradeValue": 79,
        "instability": 21,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Police State",
            "Anthropomorphs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-006daeff66a88eb4b0a9",
        "name": "Thorgun",
        "q": 6,
        "r": 137,
        "security": 34,
        "tradeValue": 65,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Zombies",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-57007a0f9d4c8305f978",
        "name": "Kawzira",
        "q": 35,
        "r": 148,
        "security": 50,
        "tradeValue": 13,
        "instability": 39,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seismic Instability",
            "Preceptor Archive"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-1aca6c4182f6900919a2",
        "name": "Thora",
        "q": 2,
        "r": 124,
        "security": 68,
        "tradeValue": 54,
        "instability": 18,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rising Hegemon",
            "Tomb World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-3b34ad09c67accef6498",
        "name": "Thorhil",
        "q": 24,
        "r": 131,
        "security": 43,
        "tradeValue": 15,
        "instability": 14,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Feral World",
            "Psionics Worship",
            "Prison Planet",
            "Tyranny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-fa2e5ae24cb5c900e30d",
        "name": "Ran",
        "q": 19,
        "r": 124,
        "security": 60,
        "tradeValue": 24,
        "instability": 32,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Restrictive Laws",
            "Mandarinate"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-108745b898d446c66d76",
        "name": "Dibeus",
        "q": 19,
        "r": 137,
        "security": 27,
        "tradeValue": 65,
        "instability": 36,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Desert World",
            "Prison Planet"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-af6bedc870efaa430d55",
        "name": "Elis",
        "q": 41,
        "r": 124,
        "security": 53,
        "tradeValue": 30,
        "instability": 26,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Restrictive Laws",
            "Former Warriors"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-c7a4ec515dda9f4aa83b",
        "name": "Dion",
        "q": 28,
        "r": 124,
        "security": 57,
        "tradeValue": 82,
        "instability": 27,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Major Spaceyard",
            "Police State"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-b9077f595e821cc4b466",
        "name": "Boumouphi",
        "q": 8,
        "r": 126,
        "security": 23,
        "tradeValue": 70,
        "instability": 7,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Primitive Aliens",
            "Gold Rush",
            "Megacorps",
            "Out of Contact",
            "Major Spaceyard",
            "Tyranny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-4f66f56929456bbfe807",
        "name": "Asta",
        "q": 28,
        "r": 139,
        "security": 51,
        "tradeValue": 79,
        "instability": 33,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seagoing Cities",
            "Psionics Academy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-dc5b13db984702553e92",
        "name": "Espo",
        "q": 44,
        "r": 161,
        "security": 25,
        "tradeValue": 80,
        "instability": 14,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Flying Cities",
            "Preceptor Archive",
            "Desert World",
            "Post-Scarcity"
            ,
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-621bab19ae059e951d3d",
        "name": "Chloea",
        "q": 22,
        "r": 144,
        "security": 36,
        "tradeValue": 30,
        "instability": 21,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Area 51",
            "Unbraked AI"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-a2b91b9faf68c9c34b07",
        "name": "Eusarre Erria",
        "q": 4,
        "r": 139,
        "security": 24,
        "tradeValue": 82,
        "instability": 26,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Urbanized Surface",
            "Post-Scarcity",
            "Civil War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-35c08d13bf0ae8ab2ba7",
        "name": "Sorlend",
        "q": 2,
        "r": 144,
        "security": 31,
        "tradeValue": 43,
        "instability": 21,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revanchists",
            "Forbidden Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-85f01c1d165306a83dfd",
        "name": "Porrade",
        "q": 44,
        "r": 128,
        "security": 68,
        "tradeValue": 77,
        "instability": 41,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Robots",
            "Cultural Power",
            "Local Specialty",
            "Theocracy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-27c6900642b6a604232c",
        "name": "Saeunnh",
        "q": 44,
        "r": 137,
        "security": 37,
        "tradeValue": 76,
        "instability": 40,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Flying Cities",
            "Battleground",
            "Local Specialty",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-2598af70aa7b5b6910a9",
        "name": "Dane",
        "q": 17,
        "r": 126,
        "security": 35,
        "tradeValue": 59,
        "instability": 11,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Megacorps",
            "Doomed World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-cb112586b0eac75b121f",
        "name": "Hallfdi",
        "q": 8,
        "r": 131,
        "security": 66,
        "tradeValue": 39,
        "instability": 12,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Robots",
            "Cheap Life",
            "Nomads",
            "Pretech Cultists",
            "Revolutionaries",
            "Societal Despair"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-0bd1ad18ac2cad2bdaeb",
        "name": "Alvo",
        "q": 37,
        "r": 128,
        "security": 67,
        "tradeValue": 60,
        "instability": 25,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Friendly Foe",
            "Nomads",
            "Psionics Worship",
            "Restrictive Laws"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-6cba73ec2f63ace78494",
        "name": "Helgerd",
        "q": 41,
        "r": 128,
        "security": 68,
        "tradeValue": 37,
        "instability": 42,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tomb World",
            "Immortals",
            "Terraform Failure",
            "Ritual Combat"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-1d81736a3f6cf454bdc9",
        "name": "Mutlahm",
        "q": 41,
        "r": 135,
        "security": 53,
        "tradeValue": 25,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pleasure World",
            "Refugees"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-ee76146a27eac366a512",
        "name": "Hie",
        "q": 22,
        "r": 139,
        "security": 21,
        "tradeValue": 57,
        "instability": 16,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Hostile Space",
            "Robots",
            "Friendly Foe",
            "Primitive Aliens"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-b3fa77f5c534e7dc710d",
        "name": "Clydes",
        "q": 44,
        "r": 159,
        "security": 24,
        "tradeValue": 27,
        "instability": 36,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cold War",
            "Prison Planet",
            "Anarchists",
            "Local Specialty",
            "Oceanic World",
            "Eugenic Cult"
            ,
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-288e51191f2afd7bf29a",
        "name": "Roda",
        "q": 24,
        "r": 133,
        "security": 26,
        "tradeValue": 30,
        "instability": 35,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Major Spaceyard",
            "Urbanized Surface"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-3c996e4b04c0498d39ae",
        "name": "Canasmi",
        "q": 44,
        "r": 146,
        "security": 57,
        "tradeValue": 56,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Area 51",
            "Radioactive World",
            "Trade Hub",
            "Xenophiles"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-c573a4fc5cd109ca247b",
        "name": "Bal",
        "q": 22,
        "r": 137,
        "security": 54,
        "tradeValue": 88,
        "instability": 17,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Megacorps",
            "Eugenic Cult"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-8f544873843c5462c522",
        "name": "Laymuna",
        "q": 33,
        "r": 122,
        "security": 62,
        "tradeValue": 36,
        "instability": 12,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Terraform Failure",
            "Alien Ruins"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-2c22f2bb94632e23acc4",
        "name": "Ianthes",
        "q": 4,
        "r": 157,
        "security": 49,
        "tradeValue": 53,
        "instability": 38,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pleasure World",
            "Primitive Aliens",
            "Abandoned Colony",
            "Major Spaceyard"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-b8243c454ee5299719c2",
        "name": "Abha Udevana",
        "q": 11,
        "r": 122,
        "security": 52,
        "tradeValue": 56,
        "instability": 22,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Flying Cities",
            "Local Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-c849701c1046f408f82b",
        "name": "Ragna",
        "q": 17,
        "r": 144,
        "security": 29,
        "tradeValue": 40,
        "instability": 7,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Outpost World",
            "Freak Weather",
            "Megacorps",
            "Warlords",
            "Seismic Instability",
            "Beastmasters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-77fe1fa1a52893635b2e",
        "name": "Latis",
        "q": 13,
        "r": 122,
        "security": 56,
        "tradeValue": 38,
        "instability": 24,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Anthropomorphs",
            "Psionics Academy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-b4c768313989c19c41e5",
        "name": "Nabila",
        "q": 8,
        "r": 155,
        "security": 65,
        "tradeValue": 25,
        "instability": 21,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Former Warriors",
            "Police State",
            "Seagoing Cities",
            "Feral World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-dd8b1eaccc3a4f93b052",
        "name": "Alcippe",
        "q": 15,
        "r": 139,
        "security": 56,
        "tradeValue": 77,
        "instability": 28,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cultural Power",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-e8db5217421a0538853e",
        "name": "Maja",
        "q": 17,
        "r": 150,
        "security": 67,
        "tradeValue": 68,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Weather",
            "Night World",
            "Major Spaceyard",
            "Cheap Life"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-4d9d0ce0e294d054d57d",
        "name": "Anius",
        "q": 35,
        "r": 137,
        "security": 41,
        "tradeValue": 82,
        "instability": 17,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Forbidden Tech",
            "Shackled World",
            "Cyborgs",
            "Gold Rush",
            "Area 51",
            "Ritual Combat"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-810bc94e63d17218935b",
        "name": "Hesione",
        "q": 2,
        "r": 150,
        "security": 58,
        "tradeValue": 62,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Nomads",
            "Flying Cities",
            "Theocracy",
            "Revanchists",
            "Immortals",
            "Friendly Foe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-d0aa9dfb677f40d531be",
        "name": "Estoman",
        "q": 19,
        "r": 126,
        "security": 52,
        "tradeValue": 34,
        "instability": 40,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cultural Power",
            "Feral World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-13bd3ce967fcb81f0784",
        "name": "Theroto",
        "q": 8,
        "r": 157,
        "security": 65,
        "tradeValue": 18,
        "instability": 42,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandarinate",
            "Forbidden Tech"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-582162e831022c5fbb45",
        "name": "Karis",
        "q": 24,
        "r": 161,
        "security": 69,
        "tradeValue": 52,
        "instability": 34,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Desert World",
            "Area 51"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-ac003cc0150d3e61592b",
        "name": "Nal Seeta",
        "q": 39,
        "r": 124,
        "security": 23,
        "tradeValue": 33,
        "instability": 35,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Sectarians",
            "Nomads",
            "Major Spaceyard",
            "Societal Despair"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-c2cb98ebcd33f1452e98",
        "name": "Oronre",
        "q": 6,
        "r": 159,
        "security": 56,
        "tradeValue": 68,
        "instability": 15,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Doomed World",
            "Eugenic Cult",
            "Nomads",
            "Trade Hub"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-9f9546aece13cf3303e9",
        "name": "Vailami Rini",
        "q": 35,
        "r": 128,
        "security": 63,
        "tradeValue": 46,
        "instability": 6,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Preceptor Archive",
            "Revolutionaries"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-f04fa0c13b1d442fea83",
        "name": "Fira",
        "q": 8,
        "r": 148,
        "security": 63,
        "tradeValue": 63,
        "instability": 39,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Post-Scarcity",
            "Tyranny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-108b79fabce3d02f1638",
        "name": "Ameena",
        "q": 19,
        "r": 164,
        "security": 58,
        "tradeValue": 32,
        "instability": 20,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Misandry/Misogyny",
            "Theocracy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-325b47bd762e7a83ada2",
        "name": "Quel",
        "q": 30,
        "r": 150,
        "security": 62,
        "tradeValue": 38,
        "instability": 19,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Societal Despair",
            "Holy War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-d76327d2e9fe73f55c16",
        "name": "Pannides",
        "q": 44,
        "r": 148,
        "security": 20,
        "tradeValue": 27,
        "instability": 44,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Specialty",
            "Anarchists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-5dcff4a1f4bc7255af37",
        "name": "Chilite",
        "q": 44,
        "r": 155,
        "security": 64,
        "tradeValue": 45,
        "instability": 10,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Police State",
            "Sole Supplier"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-73d9fb058065b51b58dc",
        "name": "Nache",
        "q": 33,
        "r": 137,
        "security": 54,
        "tradeValue": 79,
        "instability": 5,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Geology",
            "Heavy Mining"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-11b892b24c14155bde5f",
        "name": "Helgerd X",
        "q": 13,
        "r": 146,
        "security": 55,
        "tradeValue": 78,
        "instability": 43,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Exchange Consulate",
            "Warlords"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-3d91c434344dec94d389",
        "name": "Iglizza",
        "q": 4,
        "r": 146,
        "security": 64,
        "tradeValue": 36,
        "instability": 8,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seagoing Cities",
            "Altered Humanity",
            "Great Work",
            "Quarantined World",
            "Megacorps",
            "Urbanized Surface"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "gamma-55ae407005cc0bf5d7de",
        "name": "Rimah",
        "q": 37,
        "r": 157,
        "security": 27,
        "tradeValue": 44,
        "instability": 34,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Beastmasters",
            "Utopia"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-7f8283fb75a60d01bf37",
        "name": "Hermand",
        "q": 159,
        "r": 157,
        "security": 63,
        "tradeValue": 51,
        "instability": 8,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Zombies",
            "Cheap Life",
            "Secret Masters",
            "Cultural Power"
            ,
            "corsair_den",
            "black-market",
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-d8ffa65be5176d4cc4af",
        "name": "Popolos",
        "q": 135,
        "r": 131,
        "security": 55,
        "tradeValue": 70,
        "instability": 40,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Civil War",
            "Tyranny"
            ,
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-2eda2e5d39297feaf3d8",
        "name": "Ioanakos",
        "q": 150,
        "r": 144,
        "security": 45,
        "tradeValue": 30,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Fear",
            "Feral World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-26a140d521ed313a2db2",
        "name": "Gorle Zubalea",
        "q": 133,
        "r": 124,
        "security": 35,
        "tradeValue": 56,
        "instability": 21,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Sectarians",
            "Immortals"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-a6b34eed2f81b3538700",
        "name": "Fela",
        "q": 126,
        "r": 122,
        "security": 69,
        "tradeValue": 50,
        "instability": 23,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandarinate",
            "Pleasure World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-dc1601dfb376639175c7",
        "name": "Tul Ruprima",
        "q": 128,
        "r": 135,
        "security": 64,
        "tradeValue": 80,
        "instability": 34,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Hatred",
            "Post-Scarcity",
            "Friendly Foe",
            "Seismic Instability"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-1834335c2305c1da6640",
        "name": "Mavris",
        "q": 137,
        "r": 135,
        "security": 48,
        "tradeValue": 21,
        "instability": 7,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Dying Race",
            "Immortals",
            "Warlords",
            "Unbraked AI"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-3d7a21a8033c34d60d4e",
        "name": "Nali Varmita",
        "q": 155,
        "r": 148,
        "security": 41,
        "tradeValue": 28,
        "instability": 5,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cybercommunists",
            "Ritual Combat",
            "Feral World",
            "Shackled World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-a14851c3cee03238d7e6",
        "name": "Plopius",
        "q": 153,
        "r": 155,
        "security": 34,
        "tradeValue": 15,
        "instability": 40,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cyclical Doom",
            "Former Warriors"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-d3854c29cce0165310f7",
        "name": "Amphilo",
        "q": 146,
        "r": 133,
        "security": 26,
        "tradeValue": 23,
        "instability": 5,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Great Work",
            "Revolutionaries",
            "Restrictive Laws",
            "Maneaters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-7d3fc9f19094262d1536",
        "name": "Otionip",
        "q": 155,
        "r": 161,
        "security": 34,
        "tradeValue": 89,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Tech",
            "Revanchists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-b62fb9e336bfcf61f5e8",
        "name": "Hur",
        "q": 135,
        "r": 124,
        "security": 45,
        "tradeValue": 50,
        "instability": 17,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rising Hegemon",
            "Cold War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-8c264b5adcc1ff837ed0",
        "name": "Georghiad",
        "q": 148,
        "r": 135,
        "security": 53,
        "tradeValue": 15,
        "instability": 5,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Great Work",
            "Alien Ruins"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-3ae1ba293232a7868296",
        "name": "Berd",
        "q": 124,
        "r": 153,
        "security": 53,
        "tradeValue": 51,
        "instability": 35,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cybercommunists",
            "Sectarians",
            "Pleasure World",
            "Psionics Worship"
            ,
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-c77c66bae370402138f8",
        "name": "Ruales",
        "q": 133,
        "r": 157,
        "security": 28,
        "tradeValue": 73,
        "instability": 27,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revanchists",
            "Sole Supplier",
            "Shackled World",
            "Rising Hegemon",
            "Out of Contact",
            "Sealed Menace"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-29d121f14536cff6168c",
        "name": "Hild",
        "q": 137,
        "r": 124,
        "security": 49,
        "tradeValue": 64,
        "instability": 12,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Megacorps",
            "Immortals"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-32b5cd8b695ec0b63259",
        "name": "Ikrakpo",
        "q": 159,
        "r": 124,
        "security": 61,
        "tradeValue": 61,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Friendly Foe",
            "Immortals"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-a9bcb339537580e14dad",
        "name": "Gul-Jab",
        "q": 164,
        "r": 124,
        "security": 67,
        "tradeValue": 33,
        "instability": 22,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Feral World",
            "Misandry/Misogyny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-9dd12fe9a3cce425043e",
        "name": "Azir",
        "q": 148,
        "r": 146,
        "security": 54,
        "tradeValue": 82,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Theocracy",
            "Warlords"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-b638d3ee64b8827fae17",
        "name": "Barride",
        "q": 157,
        "r": 133,
        "security": 23,
        "tradeValue": 59,
        "instability": 34,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Friendly Foe",
            "Freak Weather",
            "Ritual Combat",
            "Great Work"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-21930a52e2190eabd979",
        "name": "Trapoulak",
        "q": 139,
        "r": 124,
        "security": 64,
        "tradeValue": 70,
        "instability": 27,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Post-Scarcity",
            "Cold War",
            "Psionics Academy",
            "Bubble Cities",
            "Oceanic World",
            "Battleground"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-34d85d054b229ed8e8ba",
        "name": "Bizoglos",
        "q": 133,
        "r": 131,
        "security": 63,
        "tradeValue": 54,
        "instability": 40,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mandarinate",
            "Ritual Combat",
            "Shackled World",
            "Robots",
            "Regional Hegemon",
            "Local Specialty"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-0daea28079f81b8fef8f",
        "name": "Hroa",
        "q": 150,
        "r": 139,
        "security": 42,
        "tradeValue": 58,
        "instability": 20,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Prison Planet",
            "Misandry/Misogyny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-6f59e7529064d2b7386e",
        "name": "Limerim",
        "q": 155,
        "r": 124,
        "security": 49,
        "tradeValue": 22,
        "instability": 10,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Civil War",
            "Sealed Menace",
            "Night World",
            "Local Specialty"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-9e338aec244d2378716d",
        "name": "Hushqar VIII",
        "q": 148,
        "r": 142,
        "security": 36,
        "tradeValue": 25,
        "instability": 40,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Tech",
            "Dying Race"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-672727117e15e39778e0",
        "name": "Hesione",
        "q": 126,
        "r": 153,
        "security": 69,
        "tradeValue": 53,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Societal Despair"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-b312ce2a19a19e0dd7d6",
        "name": "Sig",
        "q": 122,
        "r": 155,
        "security": 67,
        "tradeValue": 43,
        "instability": 16,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Tech",
            "Fallen Hegemon"
            ,
            "spine"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-a681658aca40ebe357c2",
        "name": "Enda Kolazen",
        "q": 139,
        "r": 142,
        "security": 54,
        "tradeValue": 37,
        "instability": 8,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Forbidden Tech",
            "Mandate Base"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-c0d98ad3ddfe5050f152",
        "name": "Bora",
        "q": 133,
        "r": 135,
        "security": 59,
        "tradeValue": 38,
        "instability": 24,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Out of Contact",
            "Psionics Fear"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-062e9f7e9efaad335db6",
        "name": "Mardis",
        "q": 148,
        "r": 150,
        "security": 23,
        "tradeValue": 78,
        "instability": 39,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Post-Scarcity",
            "Mandate Base",
            "Perimeter Agency",
            "Sectarians"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-4834e5b4bb4c2c146d8e",
        "name": "Juka Ratanav",
        "q": 137,
        "r": 148,
        "security": 41,
        "tradeValue": 31,
        "instability": 37,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Maneaters",
            "Terraform Failure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-c86b09367f435f7aa417",
        "name": "Thjot",
        "q": 159,
        "r": 164,
        "security": 55,
        "tradeValue": 51,
        "instability": 6,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Restrictive Laws",
            "Misandry/Misogyny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-762e641bc34e7adc6a47",
        "name": "Aethyle",
        "q": 139,
        "r": 157,
        "security": 39,
        "tradeValue": 12,
        "instability": 36,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Shackled World",
            "Heavy Mining",
            "Former Warriors",
            "Heavy Industry"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-e9673f5b3e42510ca277",
        "name": "Saez",
        "q": 153,
        "r": 137,
        "security": 24,
        "tradeValue": 62,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Societal Despair",
            "Hatred"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-4213b6c914c81fde06f0",
        "name": "Nekorda Fra",
        "q": 137,
        "r": 128,
        "security": 53,
        "tradeValue": 28,
        "instability": 38,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Immortals",
            "Exchange Consulate",
            "Abandoned Colony",
            "Freak Geology",
            "Outpost World",
            "Revanchists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-4430702b13a357065a80",
        "name": "Chris",
        "q": 137,
        "r": 164,
        "security": 23,
        "tradeValue": 36,
        "instability": 42,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Doomed World",
            "Refugees"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-394fe066e6f28452b0bb",
        "name": "Thorbjo",
        "q": 150,
        "r": 124,
        "security": 29,
        "tradeValue": 38,
        "instability": 6,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Gold Rush",
            "Robots",
            "Former Warriors",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-cfebd4b7c8b79c4d2a67",
        "name": "Mani Vinirat",
        "q": 135,
        "r": 150,
        "security": 67,
        "tradeValue": 49,
        "instability": 31,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revolutionaries",
            "Seagoing Cities",
            "Freak Weather",
            "Police State",
            "Cold War",
            "Mandarinate"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-ba732aa85127a7e61d48",
        "name": "Peria",
        "q": 122,
        "r": 133,
        "security": 51,
        "tradeValue": 13,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Anarchists",
            "Psionics Fear"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-a7e35ae907f40505004b",
        "name": "Ahmood",
        "q": 144,
        "r": 157,
        "security": 37,
        "tradeValue": 35,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pretech Cultists",
            "Civil War"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-04884114b28745107682",
        "name": "Dynaero",
        "q": 153,
        "r": 126,
        "security": 36,
        "tradeValue": 64,
        "instability": 34,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Hatred",
            "Hivemind"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-606952beae05205ae47f",
        "name": "Papadatka",
        "q": 139,
        "r": 148,
        "security": 25,
        "tradeValue": 72,
        "instability": 32,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Gold Rush",
            "Warlords"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-f4c44eb9317d6036df9e",
        "name": "Galeirc",
        "q": 148,
        "r": 122,
        "security": 48,
        "tradeValue": 33,
        "instability": 10,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Taboo Treasure",
            "Former Warriors",
            "Desert World",
            "Dying Race"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-e1fa10cf020de0873514",
        "name": "Halgerd",
        "q": 133,
        "r": 128,
        "security": 48,
        "tradeValue": 76,
        "instability": 26,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Flying Cities",
            "Secret Masters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-1a52fa2e192ad338b448",
        "name": "Hajikhosc",
        "q": 144,
        "r": 124,
        "security": 37,
        "tradeValue": 18,
        "instability": 12,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Seismic Instability",
            "Great Work"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-ea164e0fe337ad7a9235",
        "name": "Rafeed",
        "q": 135,
        "r": 164,
        "security": 64,
        "tradeValue": 18,
        "instability": 32,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Quarantined World",
            "Cyborgs",
            "Pleasure World",
            "Nomads",
            "Friendly Foe",
            "Tyranny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-c136b185e60ca349aec2",
        "name": "Sigunn",
        "q": 157,
        "r": 124,
        "security": 67,
        "tradeValue": 18,
        "instability": 35,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Night World",
            "Altered Humanity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-3aeed261c4e9ba80a0c5",
        "name": "Leucimn",
        "q": 148,
        "r": 157,
        "security": 67,
        "tradeValue": 59,
        "instability": 28,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Doomed World",
            "Friendly Foe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-c83e6dd202449322ebc3",
        "name": "Aethyll",
        "q": 144,
        "r": 126,
        "security": 40,
        "tradeValue": 24,
        "instability": 15,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Cultural Power",
            "Outpost World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-1f8d9300a1168ce106a2",
        "name": "Ialas",
        "q": 133,
        "r": 146,
        "security": 27,
        "tradeValue": 82,
        "instability": 12,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Urbanized Surface",
            "Hostile Space",
            "Mandarinate",
            "Altered Humanity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-5a8fab5a3f2d61d70e84",
        "name": "Xana",
        "q": 128,
        "r": 161,
        "security": 59,
        "tradeValue": 74,
        "instability": 34,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Xenophiles",
            "Cyborgs",
            "Mercenaries",
            "Colonized Population"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-7516196752322920bcea",
        "name": "Aribiam",
        "q": 135,
        "r": 133,
        "security": 32,
        "tradeValue": 65,
        "instability": 28,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Sectarians",
            "Zombies",
            "Psionics Fear",
            "Utopia",
            "Local Specialty",
            "Minimal Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-5d0c4cc3a51ad57a3bd9",
        "name": "Faritti",
        "q": 122,
        "r": 137,
        "security": 37,
        "tradeValue": 47,
        "instability": 12,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revolutionaries",
            "Misandry/Misogyny",
            "Primitive Aliens",
            "Tomb World",
            "Hatred",
            "Exchange Consulate"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-cb8ff32dbdb88371a2a0",
        "name": "Deicus",
        "q": 139,
        "r": 133,
        "security": 47,
        "tradeValue": 45,
        "instability": 5,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Preceptor Archive",
            "Major Spaceyard",
            "Revolutionaries",
            "Revanchists"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-41f3cd531e9926c1a127",
        "name": "Sochedi",
        "q": 146,
        "r": 139,
        "security": 67,
        "tradeValue": 42,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Preceptor Archive",
            "Badlands World",
            "Prison Planet",
            "Police State",
            "Altered Humanity",
            "Maneaters"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-e7de1134dd7a8b29c02e",
        "name": "Gunnvei",
        "q": 128,
        "r": 126,
        "security": 49,
        "tradeValue": 60,
        "instability": 30,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Heavy Mining",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-ad89d46ee3ccc115e9db",
        "name": "Allgerd",
        "q": 135,
        "r": 126,
        "security": 30,
        "tradeValue": 11,
        "instability": 7,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Secret Masters",
            "Post-Scarcity",
            "Friendly Foe",
            "Night World",
            "Ritual Combat",
            "Robots"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-bed421bb82e32a7fc4db",
        "name": "Done Aldoia",
        "q": 124,
        "r": 148,
        "security": 60,
        "tradeValue": 87,
        "instability": 24,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Psionics Fear",
            "Psionics Academy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-0b0ac9d146088032f169",
        "name": "Halgerd",
        "q": 122,
        "r": 142,
        "security": 55,
        "tradeValue": 26,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Terraform Failure",
            "Badlands World",
            "Cold War",
            "Taboo Treasure"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-7388d501f9d52ee3c5d2",
        "name": "Gallia",
        "q": 159,
        "r": 148,
        "security": 21,
        "tradeValue": 78,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Revanchists",
            "Restrictive Laws"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-fceff1ab097584801538",
        "name": "Gyda",
        "q": 157,
        "r": 135,
        "security": 48,
        "tradeValue": 46,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Holy War",
            "Shackled World",
            "Refugees",
            "Primitive Aliens"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-69e9d95fa3d3d75978d0",
        "name": "Hallvei",
        "q": 131,
        "r": 131,
        "security": 49,
        "tradeValue": 89,
        "instability": 12,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Holy War",
            "Quarantined World",
            "Police State",
            "Tyranny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-9361fbc3dfd165d74002",
        "name": "Funise",
        "q": 159,
        "r": 139,
        "security": 45,
        "tradeValue": 62,
        "instability": 22,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Friendly Foe",
            "Theocracy"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-b3cda7b699fed1b379b1",
        "name": "Tiinveorte",
        "q": 126,
        "r": 139,
        "security": 31,
        "tradeValue": 47,
        "instability": 38,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Terraform Failure",
            "Area 51",
            "Oceanic World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-91480f97b237b6e50b23",
        "name": "Zantza Goini",
        "q": 139,
        "r": 159,
        "security": 56,
        "tradeValue": 24,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Alien Ruins",
            "Cold War",
            "Pleasure World",
            "Regional Hegemon",
            "Rising Hegemon",
            "Colonized Population"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-8fe902922069c4d7a08b",
        "name": "Pannides",
        "q": 126,
        "r": 126,
        "security": 37,
        "tradeValue": 19,
        "instability": 21,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Societal Despair",
            "Restrictive Laws"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-694484106b485f6cdc00",
        "name": "Estoud",
        "q": 157,
        "r": 128,
        "security": 21,
        "tradeValue": 33,
        "instability": 35,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Unbraked AI",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-b01b35f34be8ebb57001",
        "name": "Bergtho",
        "q": 146,
        "r": 128,
        "security": 67,
        "tradeValue": 19,
        "instability": 19,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Doomed World",
            "Exchange Consulate",
            "Xenophiles",
            "Dying Race"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-cb0a9ffa8bab25a7c679",
        "name": "Antongi",
        "q": 155,
        "r": 126,
        "security": 37,
        "tradeValue": 18,
        "instability": 6,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Oceanic World",
            "Prison Planet"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-600aefcab6013ddaa627",
        "name": "Saeunnh",
        "q": 157,
        "r": 159,
        "security": 34,
        "tradeValue": 79,
        "instability": 43,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tomb World",
            "Cyborgs"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-bb74e651c6293bf3335c",
        "name": "Alzemi",
        "q": 150,
        "r": 164,
        "security": 32,
        "tradeValue": 87,
        "instability": 20,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Dying Race",
            "Preceptor Archive"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-69282fe418afcc78b095",
        "name": "Phe",
        "q": 144,
        "r": 153,
        "security": 56,
        "tradeValue": 50,
        "instability": 44,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Quarantined World",
            "Friendly Foe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-34fec72fcd6dc6f7666e",
        "name": "Boumouphi",
        "q": 157,
        "r": 153,
        "security": 67,
        "tradeValue": 57,
        "instability": 34,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Zombies",
            "Minimal Contact"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-de07956e9d6833f9918c",
        "name": "Flos",
        "q": 155,
        "r": 144,
        "security": 69,
        "tradeValue": 35,
        "instability": 6,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Altered Humanity",
            "Civil War",
            "Post-Scarcity",
            "Local Specialty",
            "Hostile Biosphere",
            "Bubble Cities"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-f9eb57a684a562d602d8",
        "name": "Thoragn",
        "q": 153,
        "r": 161,
        "security": 46,
        "tradeValue": 54,
        "instability": 25,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Pretech Cultists",
            "Refugees",
            "Battleground",
            "Area 51",
            "Revanchists",
            "Megacorps"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-22a752a260fe1916d41c",
        "name": "Rohitap Suru",
        "q": 144,
        "r": 133,
        "security": 66,
        "tradeValue": 16,
        "instability": 33,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tyranny",
            "Quarantined World",
            "Utopia",
            "Night World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-565b620e091c89739668",
        "name": "Leucimn",
        "q": 137,
        "r": 161,
        "security": 40,
        "tradeValue": 78,
        "instability": 17,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Mercenaries",
            "Major Spaceyard"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-2c20a70dc6f89cc4d700",
        "name": "Papafplia",
        "q": 128,
        "r": 148,
        "security": 45,
        "tradeValue": 89,
        "instability": 36,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Feral World",
            "Heavy Industry"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-2e768b41e0d1c4494bb6",
        "name": "Chris",
        "q": 148,
        "r": 128,
        "security": 56,
        "tradeValue": 32,
        "instability": 16,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rigid Culture",
            "Post-Scarcity"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-2a4c453fbee0b598b19e",
        "name": "Buruker Urdia",
        "q": 135,
        "r": 139,
        "security": 51,
        "tradeValue": 10,
        "instability": 39,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Fallen Hegemon",
            "Doomed World",
            "Anarchists",
            "Great Work",
            "Cyclical Doom"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-60a9f91861a71b8780be",
        "name": "Reatti",
        "q": 142,
        "r": 122,
        "security": 33,
        "tradeValue": 40,
        "instability": 40,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rising Hegemon",
            "Anarchists",
            "Mandarinate",
            "Desert World",
            "Heavy Industry",
            "Tyranny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-cc4aea94709241c20bf6",
        "name": "Ingigdi",
        "q": 135,
        "r": 137,
        "security": 43,
        "tradeValue": 42,
        "instability": 16,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Xenophiles",
            "Dying Race"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-949d1fb54e31ee8d3f91",
        "name": "Gaitxar Joniz",
        "q": 150,
        "r": 155,
        "security": 34,
        "tradeValue": 40,
        "instability": 22,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Immortals",
            "Rising Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-b088b9116dcc1010b834",
        "name": "Hushqar",
        "q": 164,
        "r": 146,
        "security": 46,
        "tradeValue": 46,
        "instability": 6,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Badlands World",
            "Friendly Foe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-07bd7df19fdb7e0a0bd1",
        "name": "Sha Gaura",
        "q": 155,
        "r": 133,
        "security": 25,
        "tradeValue": 56,
        "instability": 44,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Minimal Contact",
            "Misandry/Misogyny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-0162cbe1fdfcb88e18fb",
        "name": "Zubrez",
        "q": 124,
        "r": 124,
        "security": 33,
        "tradeValue": 76,
        "instability": 7,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Outpost World",
            "Misandry/Misogyny"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-677484a3b9a2d1a12b82",
        "name": "Naziya",
        "q": 135,
        "r": 159,
        "security": 23,
        "tradeValue": 17,
        "instability": 12,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Local Tech",
            "Freak Geology"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-789203298a78e54523b2",
        "name": "Hala",
        "q": 139,
        "r": 144,
        "security": 48,
        "tradeValue": 46,
        "instability": 38,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Secret Masters",
            "Eugenic Cult"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-c3f9a580fef78cf98c3b",
        "name": "Limerim",
        "q": 153,
        "r": 150,
        "security": 61,
        "tradeValue": 23,
        "instability": 21,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Post-Scarcity",
            "Immortals",
            "Preceptor Archive",
            "Megacorps"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-a5f695c9a93f9586aa26",
        "name": "Ioleuth",
        "q": 161,
        "r": 164,
        "security": 33,
        "tradeValue": 80,
        "instability": 10,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Immortals",
            "Urbanized Surface"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-b6f554ec6ca3ef70179b",
        "name": "Ivapa",
        "q": 157,
        "r": 146,
        "security": 25,
        "tradeValue": 60,
        "instability": 37,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tomb World",
            "Cyclical Doom"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-0322b443d18dfabe2c32",
        "name": "Sumah",
        "q": 124,
        "r": 157,
        "security": 24,
        "tradeValue": 17,
        "instability": 22,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "nullward_fringe",
            "Battleground",
            "Hostile Biosphere",
            "Anthropomorphs",
            "Xenophobes"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-151aa60cc9fb0e4b91d9",
        "name": "Frane Heligar",
        "q": 161,
        "r": 155,
        "security": 51,
        "tradeValue": 36,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Quarantined World",
            "Doomed World"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-dadedd026d3a9a800d4b",
        "name": "Canomed",
        "q": 142,
        "r": 157,
        "security": 65,
        "tradeValue": 62,
        "instability": 15,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Freak Geology",
            "Cyborgs",
            "Anthropomorphs",
            "Local Tech",
            "Psionics Worship",
            "Warlords"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-fc6707528d16c5590dd9",
        "name": "Cymeda",
        "q": 135,
        "r": 146,
        "security": 62,
        "tradeValue": 37,
        "instability": 25,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Nomads",
            "Cultural Power",
            "Preceptor Archive",
            "Freak Geology",
            "Maneaters",
            "Regional Hegemon"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-c97cead7be9ee318332c",
        "name": "Thora",
        "q": 148,
        "r": 137,
        "security": 20,
        "tradeValue": 14,
        "instability": 25,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Restrictive Laws",
            "Hostile Biosphere"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-3978fcbdedd5c300b1f7",
        "name": "Cantho",
        "q": 126,
        "r": 133,
        "security": 20,
        "tradeValue": 50,
        "instability": 42,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "nullward_fringe",
            "Great Work",
            "Psionics Worship"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-d5047f9bd0140c16bd7a",
        "name": "Kuloah",
        "q": 159,
        "r": 146,
        "security": 47,
        "tradeValue": 28,
        "instability": 20,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Tomb World",
            "Cold War",
            "Anthropomorphs",
            "Mandarinate",
            "Robots",
            "Cheap Life"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-50c2b86df50cdeb73412",
        "name": "Kalamanik",
        "q": 159,
        "r": 133,
        "security": 32,
        "tradeValue": 20,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Forbidden Tech",
            "Hostile Biosphere",
            "Heavy Industry",
            "Flying Cities",
            "Sealed Menace",
            "Utopia"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "omicron-bb4225daabf90c51c748",
        "name": "Nache",
        "q": 155,
        "r": 139,
        "security": 49,
        "tradeValue": 54,
        "instability": 22,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "nullward_fringe",
            "Rising Hegemon",
            "Area 51"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "midrim-0",
        "name": "Rim Node 0",
        "q": 36,
        "r": 70,
        "security": 38,
        "tradeValue": 80,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-1",
        "name": "Rim Node 1",
        "q": 84,
        "r": 5,
        "security": 60,
        "tradeValue": 18,
        "instability": 8,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-2",
        "name": "Rim Node 2",
        "q": 63,
        "r": 113,
        "security": 32,
        "tradeValue": 25,
        "instability": 24,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-3",
        "name": "Rim Node 3",
        "q": 15,
        "r": 62,
        "security": 54,
        "tradeValue": 39,
        "instability": 33,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-4",
        "name": "Rim Node 4",
        "q": 8,
        "r": 66,
        "security": 50,
        "tradeValue": 67,
        "instability": 28,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-5",
        "name": "Rim Node 5",
        "q": 9,
        "r": 82,
        "security": 58,
        "tradeValue": 19,
        "instability": 37,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-6",
        "name": "Rim Node 6",
        "q": 52,
        "r": 12,
        "security": 52,
        "tradeValue": 66,
        "instability": 34,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-7",
        "name": "Rim Node 7",
        "q": 56,
        "r": 132,
        "security": 55,
        "tradeValue": 41,
        "instability": 8,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-8",
        "name": "Rim Node 8",
        "q": 61,
        "r": 27,
        "security": 24,
        "tradeValue": 12,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-9",
        "name": "Rim Node 9",
        "q": 63,
        "r": 10,
        "security": 48,
        "tradeValue": 89,
        "instability": 26,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-10",
        "name": "Rim Node 10",
        "q": 71,
        "r": 120,
        "security": 44,
        "tradeValue": 45,
        "instability": 19,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-11",
        "name": "Rim Node 11",
        "q": 128,
        "r": 75,
        "security": 24,
        "tradeValue": 27,
        "instability": 15,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-12",
        "name": "Rim Node 12",
        "q": 60,
        "r": 131,
        "security": 25,
        "tradeValue": 44,
        "instability": 23,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-13",
        "name": "Rim Node 13",
        "q": 51,
        "r": 107,
        "security": 25,
        "tradeValue": 76,
        "instability": 16,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-14",
        "name": "Rim Node 14",
        "q": 8,
        "r": 63,
        "security": 55,
        "tradeValue": 48,
        "instability": 39,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-15",
        "name": "Rim Node 15",
        "q": 127,
        "r": 71,
        "security": 35,
        "tradeValue": 48,
        "instability": 34,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-16",
        "name": "Rim Node 16",
        "q": 101,
        "r": 81,
        "security": 52,
        "tradeValue": 13,
        "instability": 44,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-17",
        "name": "Rim Node 17",
        "q": 62,
        "r": 103,
        "security": 29,
        "tradeValue": 19,
        "instability": 7,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-18",
        "name": "Rim Node 18",
        "q": 70,
        "r": 51,
        "security": 45,
        "tradeValue": 14,
        "instability": 12,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-19",
        "name": "Rim Node 19",
        "q": 51,
        "r": 69,
        "security": 33,
        "tradeValue": 89,
        "instability": 27,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-20",
        "name": "Rim Node 20",
        "q": 58,
        "r": 124,
        "security": 44,
        "tradeValue": 66,
        "instability": 8,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-21",
        "name": "Rim Node 21",
        "q": 72,
        "r": 97,
        "security": 56,
        "tradeValue": 53,
        "instability": 37,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-22",
        "name": "Rim Node 22",
        "q": 67,
        "r": 106,
        "security": 22,
        "tradeValue": 59,
        "instability": 14,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-23",
        "name": "Rim Node 23",
        "q": 66,
        "r": 65,
        "security": 23,
        "tradeValue": 30,
        "instability": 32,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-24",
        "name": "Rim Node 24",
        "q": 72,
        "r": 29,
        "security": 52,
        "tradeValue": 77,
        "instability": 18,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-25",
        "name": "Rim Node 25",
        "q": 56,
        "r": 53,
        "security": 30,
        "tradeValue": 33,
        "instability": 31,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-26",
        "name": "Rim Node 26",
        "q": 29,
        "r": 74,
        "security": 28,
        "tradeValue": 55,
        "instability": 31,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-27",
        "name": "Rim Node 27",
        "q": 63,
        "r": 124,
        "security": 54,
        "tradeValue": 15,
        "instability": 35,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-28",
        "name": "Rim Node 28",
        "q": 80,
        "r": 26,
        "security": 69,
        "tradeValue": 41,
        "instability": 28,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-29",
        "name": "Rim Node 29",
        "q": 105,
        "r": 66,
        "security": 67,
        "tradeValue": 64,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-30",
        "name": "Rim Node 30",
        "q": 22,
        "r": 58,
        "security": 51,
        "tradeValue": 78,
        "instability": 41,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-31",
        "name": "Rim Node 31",
        "q": 41,
        "r": 61,
        "security": 66,
        "tradeValue": 13,
        "instability": 17,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-32",
        "name": "Rim Node 32",
        "q": 30,
        "r": 78,
        "security": 21,
        "tradeValue": 35,
        "instability": 14,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-33",
        "name": "Rim Node 33",
        "q": 56,
        "r": 62,
        "security": 54,
        "tradeValue": 71,
        "instability": 13,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-34",
        "name": "Rim Node 34",
        "q": 43,
        "r": 52,
        "security": 69,
        "tradeValue": 77,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-35",
        "name": "Rim Node 35",
        "q": 84,
        "r": 12,
        "security": 22,
        "tradeValue": 46,
        "instability": 16,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-36",
        "name": "Rim Node 36",
        "q": 19,
        "r": 80,
        "security": 67,
        "tradeValue": 11,
        "instability": 7,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-37",
        "name": "Rim Node 37",
        "q": 99,
        "r": 51,
        "security": 60,
        "tradeValue": 49,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-38",
        "name": "Rim Node 38",
        "q": 20,
        "r": 72,
        "security": 40,
        "tradeValue": 76,
        "instability": 27,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-39",
        "name": "Rim Node 39",
        "q": 16,
        "r": 83,
        "security": 27,
        "tradeValue": 43,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-40",
        "name": "Rim Node 40",
        "q": 40,
        "r": 65,
        "security": 25,
        "tradeValue": 80,
        "instability": 39,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-41",
        "name": "Rim Node 41",
        "q": 65,
        "r": 22,
        "security": 46,
        "tradeValue": 19,
        "instability": 31,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-42",
        "name": "Rim Node 42",
        "q": 110,
        "r": 51,
        "security": 64,
        "tradeValue": 78,
        "instability": 7,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-43",
        "name": "Rim Node 43",
        "q": 44,
        "r": 76,
        "security": 40,
        "tradeValue": 41,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-44",
        "name": "Rim Node 44",
        "q": 54,
        "r": 115,
        "security": 60,
        "tradeValue": 72,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-45",
        "name": "Rim Node 45",
        "q": 25,
        "r": 60,
        "security": 51,
        "tradeValue": 48,
        "instability": 18,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-46",
        "name": "Rim Node 46",
        "q": 65,
        "r": 33,
        "security": 54,
        "tradeValue": 31,
        "instability": 6,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-47",
        "name": "Rim Node 47",
        "q": 7,
        "r": 53,
        "security": 54,
        "tradeValue": 46,
        "instability": 19,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-48",
        "name": "Rim Node 48",
        "q": 65,
        "r": 40,
        "security": 33,
        "tradeValue": 73,
        "instability": 19,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-49",
        "name": "Rim Node 49",
        "q": 66,
        "r": 55,
        "security": 22,
        "tradeValue": 49,
        "instability": 35,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-50",
        "name": "Rim Node 50",
        "q": 81,
        "r": 113,
        "security": 51,
        "tradeValue": 63,
        "instability": 18,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-51",
        "name": "Rim Node 51",
        "q": 65,
        "r": 32,
        "security": 41,
        "tradeValue": 85,
        "instability": 36,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-52",
        "name": "Rim Node 52",
        "q": 55,
        "r": 9,
        "security": 26,
        "tradeValue": 43,
        "instability": 15,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-53",
        "name": "Rim Node 53",
        "q": 107,
        "r": 83,
        "security": 24,
        "tradeValue": 66,
        "instability": 13,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-54",
        "name": "Rim Node 54",
        "q": 57,
        "r": 5,
        "security": 69,
        "tradeValue": 49,
        "instability": 23,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-55",
        "name": "Rim Node 55",
        "q": 116,
        "r": 51,
        "security": 58,
        "tradeValue": 87,
        "instability": 39,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-56",
        "name": "Rim Node 56",
        "q": 54,
        "r": 39,
        "security": 36,
        "tradeValue": 10,
        "instability": 15,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-57",
        "name": "Rim Node 57",
        "q": 60,
        "r": 99,
        "security": 33,
        "tradeValue": 43,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-58",
        "name": "Rim Node 58",
        "q": 21,
        "r": 73,
        "security": 65,
        "tradeValue": 61,
        "instability": 37,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-59",
        "name": "Rim Node 59",
        "q": 69,
        "r": 53,
        "security": 64,
        "tradeValue": 53,
        "instability": 16,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-60",
        "name": "Rim Node 60",
        "q": 52,
        "r": 65,
        "security": 34,
        "tradeValue": 54,
        "instability": 42,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-61",
        "name": "Rim Node 61",
        "q": 69,
        "r": 28,
        "security": 39,
        "tradeValue": 80,
        "instability": 35,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-62",
        "name": "Rim Node 62",
        "q": 40,
        "r": 72,
        "security": 40,
        "tradeValue": 34,
        "instability": 16,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-63",
        "name": "Rim Node 63",
        "q": 129,
        "r": 64,
        "security": 41,
        "tradeValue": 15,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-64",
        "name": "Rim Node 64",
        "q": 84,
        "r": 113,
        "security": 61,
        "tradeValue": 17,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-65",
        "name": "Rim Node 65",
        "q": 70,
        "r": 57,
        "security": 59,
        "tradeValue": 30,
        "instability": 34,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-66",
        "name": "Rim Node 66",
        "q": 74,
        "r": 37,
        "security": 24,
        "tradeValue": 15,
        "instability": 26,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-67",
        "name": "Rim Node 67",
        "q": 66,
        "r": 39,
        "security": 65,
        "tradeValue": 72,
        "instability": 7,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-68",
        "name": "Rim Node 68",
        "q": 73,
        "r": 84,
        "security": 39,
        "tradeValue": 87,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-69",
        "name": "Rim Node 69",
        "q": 9,
        "r": 50,
        "security": 28,
        "tradeValue": 43,
        "instability": 7,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-70",
        "name": "Rim Node 70",
        "q": 120,
        "r": 50,
        "security": 66,
        "tradeValue": 31,
        "instability": 22,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-71",
        "name": "Rim Node 71",
        "q": 67,
        "r": 69,
        "security": 49,
        "tradeValue": 54,
        "instability": 20,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-72",
        "name": "Rim Node 72",
        "q": 81,
        "r": 72,
        "security": 46,
        "tradeValue": 30,
        "instability": 40,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-73",
        "name": "Rim Node 73",
        "q": 34,
        "r": 61,
        "security": 57,
        "tradeValue": 88,
        "instability": 37,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-74",
        "name": "Rim Node 74",
        "q": 59,
        "r": 126,
        "security": 65,
        "tradeValue": 72,
        "instability": 24,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-75",
        "name": "Rim Node 75",
        "q": 121,
        "r": 61,
        "security": 48,
        "tradeValue": 20,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-76",
        "name": "Rim Node 76",
        "q": 117,
        "r": 75,
        "security": 69,
        "tradeValue": 59,
        "instability": 33,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-77",
        "name": "Rim Node 77",
        "q": 18,
        "r": 75,
        "security": 35,
        "tradeValue": 77,
        "instability": 14,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-78",
        "name": "Rim Node 78",
        "q": 57,
        "r": 64,
        "security": 59,
        "tradeValue": 58,
        "instability": 22,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-79",
        "name": "Rim Node 79",
        "q": 81,
        "r": 83,
        "security": 36,
        "tradeValue": 60,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-80",
        "name": "Rim Node 80",
        "q": 104,
        "r": 63,
        "security": 25,
        "tradeValue": 11,
        "instability": 15,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-81",
        "name": "Rim Node 81",
        "q": 79,
        "r": 123,
        "security": 50,
        "tradeValue": 89,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-82",
        "name": "Rim Node 82",
        "q": 50,
        "r": 30,
        "security": 46,
        "tradeValue": 83,
        "instability": 40,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-83",
        "name": "Rim Node 83",
        "q": 56,
        "r": 84,
        "security": 59,
        "tradeValue": 27,
        "instability": 43,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-84",
        "name": "Rim Node 84",
        "q": 83,
        "r": 132,
        "security": 58,
        "tradeValue": 79,
        "instability": 17,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-85",
        "name": "Rim Node 85",
        "q": 50,
        "r": 80,
        "security": 33,
        "tradeValue": 79,
        "instability": 11,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-86",
        "name": "Rim Node 86",
        "q": 76,
        "r": 23,
        "security": 31,
        "tradeValue": 57,
        "instability": 11,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-87",
        "name": "Rim Node 87",
        "q": 123,
        "r": 75,
        "security": 24,
        "tradeValue": 38,
        "instability": 18,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-88",
        "name": "Rim Node 88",
        "q": 67,
        "r": 54,
        "security": 55,
        "tradeValue": 27,
        "instability": 20,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-89",
        "name": "Rim Node 89",
        "q": 107,
        "r": 57,
        "security": 20,
        "tradeValue": 18,
        "instability": 42,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-90",
        "name": "Rim Node 90",
        "q": 30,
        "r": 72,
        "security": 46,
        "tradeValue": 56,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-91",
        "name": "Rim Node 91",
        "q": 83,
        "r": 39,
        "security": 35,
        "tradeValue": 16,
        "instability": 21,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-92",
        "name": "Rim Node 92",
        "q": 104,
        "r": 64,
        "security": 67,
        "tradeValue": 16,
        "instability": 43,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-93",
        "name": "Rim Node 93",
        "q": 79,
        "r": 65,
        "security": 47,
        "tradeValue": 29,
        "instability": 27,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-94",
        "name": "Rim Node 94",
        "q": 100,
        "r": 79,
        "security": 29,
        "tradeValue": 11,
        "instability": 30,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-95",
        "name": "Rim Node 95",
        "q": 56,
        "r": 121,
        "security": 23,
        "tradeValue": 32,
        "instability": 20,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-96",
        "name": "Rim Node 96",
        "q": 115,
        "r": 71,
        "security": 59,
        "tradeValue": 86,
        "instability": 18,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-97",
        "name": "Rim Node 97",
        "q": 14,
        "r": 50,
        "security": 38,
        "tradeValue": 43,
        "instability": 32,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-98",
        "name": "Rim Node 98",
        "q": 111,
        "r": 55,
        "security": 23,
        "tradeValue": 48,
        "instability": 23,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-99",
        "name": "Rim Node 99",
        "q": 64,
        "r": 67,
        "security": 42,
        "tradeValue": 84,
        "instability": 38,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "crimson_expanse"
        ],
        "regionId": "crimson-expanse"
    },
    {
        "id": "midrim-100",
        "name": "Rim Node 100",
        "q": 27,
        "r": 71,
        "security": 47,
        "tradeValue": 21,
        "instability": 9,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-101",
        "name": "Rim Node 101",
        "q": 79,
        "r": 121,
        "security": 38,
        "tradeValue": 37,
        "instability": 33,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-102",
        "name": "Rim Node 102",
        "q": 81,
        "r": 38,
        "security": 54,
        "tradeValue": 35,
        "instability": 12,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-103",
        "name": "Rim Node 103",
        "q": 101,
        "r": 84,
        "security": 50,
        "tradeValue": 56,
        "instability": 41,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-104",
        "name": "Rim Node 104",
        "q": 75,
        "r": 63,
        "security": 60,
        "tradeValue": 82,
        "instability": 29,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-105",
        "name": "Rim Node 105",
        "q": 54,
        "r": 64,
        "security": 37,
        "tradeValue": 43,
        "instability": 5,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-106",
        "name": "Rim Node 106",
        "q": 14,
        "r": 84,
        "security": 54,
        "tradeValue": 89,
        "instability": 27,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-107",
        "name": "Rim Node 107",
        "q": 59,
        "r": 76,
        "security": 31,
        "tradeValue": 71,
        "instability": 44,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-108",
        "name": "Rim Node 108",
        "q": 50,
        "r": 118,
        "security": 33,
        "tradeValue": 43,
        "instability": 15,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-109",
        "name": "Rim Node 109",
        "q": 115,
        "r": 75,
        "security": 61,
        "tradeValue": 19,
        "instability": 8,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-110",
        "name": "Rim Node 110",
        "q": 67,
        "r": 17,
        "security": 36,
        "tradeValue": 72,
        "instability": 37,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-111",
        "name": "Rim Node 111",
        "q": 52,
        "r": 11,
        "security": 50,
        "tradeValue": 66,
        "instability": 29,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-112",
        "name": "Rim Node 112",
        "q": 122,
        "r": 80,
        "security": 61,
        "tradeValue": 40,
        "instability": 38,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-113",
        "name": "Rim Node 113",
        "q": 60,
        "r": 70,
        "security": 44,
        "tradeValue": 79,
        "instability": 32,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-114",
        "name": "Rim Node 114",
        "q": 6,
        "r": 80,
        "security": 53,
        "tradeValue": 41,
        "instability": 16,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-115",
        "name": "Rim Node 115",
        "q": 60,
        "r": 39,
        "security": 58,
        "tradeValue": 51,
        "instability": 42,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "veldt_dominion"
        ],
        "regionId": "veldt-dominion"
    },
    {
        "id": "midrim-116",
        "name": "Rim Node 116",
        "q": 59,
        "r": 26,
        "security": 28,
        "tradeValue": 85,
        "instability": 26,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-117",
        "name": "Rim Node 117",
        "q": 58,
        "r": 7,
        "security": 59,
        "tradeValue": 30,
        "instability": 37,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-118",
        "name": "Rim Node 118",
        "q": 61,
        "r": 80,
        "security": 66,
        "tradeValue": 24,
        "instability": 41,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "midrim-119",
        "name": "Rim Node 119",
        "q": 74,
        "r": 14,
        "security": 62,
        "tradeValue": 45,
        "instability": 10,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "middle_rim"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "pirate-0",
        "name": "Corsair Den 0",
        "q": 122,
        "r": 129,
        "security": 8,
        "tradeValue": 11,
        "instability": 75,
        "escalationLevel": 7,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-1",
        "name": "Corsair Den 1",
        "q": 125,
        "r": 122,
        "security": 11,
        "tradeValue": 8,
        "instability": 64,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-2",
        "name": "Corsair Den 2",
        "q": 125,
        "r": 121,
        "security": 18,
        "tradeValue": 6,
        "instability": 60,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-3",
        "name": "Corsair Den 3",
        "q": 134,
        "r": 117,
        "security": 13,
        "tradeValue": 0,
        "instability": 67,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-4",
        "name": "Corsair Den 4",
        "q": 125,
        "r": 103,
        "security": 0,
        "tradeValue": 4,
        "instability": 99,
        "escalationLevel": 7,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-5",
        "name": "Corsair Den 5",
        "q": 126,
        "r": 101,
        "security": 14,
        "tradeValue": 4,
        "instability": 70,
        "escalationLevel": 8,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-6",
        "name": "Corsair Den 6",
        "q": 123,
        "r": 94,
        "security": 9,
        "tradeValue": 24,
        "instability": 87,
        "escalationLevel": 8,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-7",
        "name": "Corsair Den 7",
        "q": 132,
        "r": 92,
        "security": 7,
        "tradeValue": 5,
        "instability": 91,
        "escalationLevel": 7,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-8",
        "name": "Corsair Den 8",
        "q": 137,
        "r": 81,
        "security": 5,
        "tradeValue": 15,
        "instability": 63,
        "escalationLevel": 7,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-9",
        "name": "Corsair Den 9",
        "q": 127,
        "r": 77,
        "security": 7,
        "tradeValue": 16,
        "instability": 51,
        "escalationLevel": 8,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-10",
        "name": "Corsair Den 10",
        "q": 123,
        "r": 72,
        "security": 3,
        "tradeValue": 10,
        "instability": 60,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-11",
        "name": "Corsair Den 11",
        "q": 133,
        "r": 71,
        "security": 19,
        "tradeValue": 25,
        "instability": 70,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-12",
        "name": "Corsair Den 12",
        "q": 128,
        "r": 62,
        "security": 11,
        "tradeValue": 19,
        "instability": 88,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-13",
        "name": "Corsair Den 13",
        "q": 134,
        "r": 54,
        "security": 15,
        "tradeValue": 22,
        "instability": 57,
        "escalationLevel": 8,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-14",
        "name": "Corsair Den 14",
        "q": 134,
        "r": 48,
        "security": 9,
        "tradeValue": 12,
        "instability": 74,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-15",
        "name": "Corsair Den 15",
        "q": 134,
        "r": 45,
        "security": 4,
        "tradeValue": 0,
        "instability": 58,
        "escalationLevel": 8,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-16",
        "name": "Corsair Den 16",
        "q": 135,
        "r": 44,
        "security": 19,
        "tradeValue": 6,
        "instability": 73,
        "escalationLevel": 8,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-17",
        "name": "Corsair Den 17",
        "q": 126,
        "r": 38,
        "security": 14,
        "tradeValue": 24,
        "instability": 76,
        "escalationLevel": 7,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-18",
        "name": "Corsair Den 18",
        "q": 129,
        "r": 26,
        "security": 9,
        "tradeValue": 28,
        "instability": 53,
        "escalationLevel": 7,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "pirate-19",
        "name": "Corsair Den 19",
        "q": 132,
        "r": 29,
        "security": 4,
        "tradeValue": 7,
        "instability": 84,
        "escalationLevel": 9,
        "tags": [
            "standard",
            "nullward_fringe"
        ],
        "regionId": "nullward-fringe"
    },
    {
        "id": "corridor-0",
        "name": "Westfold 0",
        "q": 20,
        "r": 17,
        "security": 25,
        "tradeValue": 58,
        "instability": 29,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "gate"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-1",
        "name": "Westfold 1",
        "q": 27,
        "r": 24,
        "security": 44,
        "tradeValue": 24,
        "instability": 28,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-2",
        "name": "Westfold 2",
        "q": 30,
        "r": 27,
        "security": 59,
        "tradeValue": 69,
        "instability": 21,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "basin"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-3",
        "name": "Westfold 3",
        "q": 23,
        "r": 29,
        "security": 52,
        "tradeValue": 44,
        "instability": 42,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-4",
        "name": "Westfold 4",
        "q": 24,
        "r": 33,
        "security": 64,
        "tradeValue": 55,
        "instability": 39,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-5",
        "name": "Westfold 5",
        "q": 27,
        "r": 43,
        "security": 67,
        "tradeValue": 46,
        "instability": 12,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-6",
        "name": "Westfold 6",
        "q": 19,
        "r": 49,
        "security": 61,
        "tradeValue": 15,
        "instability": 23,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "basin"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-7",
        "name": "Westfold 7",
        "q": 22,
        "r": 47,
        "security": 68,
        "tradeValue": 24,
        "instability": 17,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-8",
        "name": "Westfold 8",
        "q": 31,
        "r": 58,
        "security": 61,
        "tradeValue": 74,
        "instability": 38,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "basin"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-9",
        "name": "Westfold 9",
        "q": 22,
        "r": 59,
        "security": 41,
        "tradeValue": 47,
        "instability": 17,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-10",
        "name": "Westfold 10",
        "q": 25,
        "r": 65,
        "security": 61,
        "tradeValue": 10,
        "instability": 9,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-11",
        "name": "Westfold 11",
        "q": 17,
        "r": 67,
        "security": 65,
        "tradeValue": 47,
        "instability": 7,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "basin"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-12",
        "name": "Westfold 12",
        "q": 22,
        "r": 75,
        "security": 37,
        "tradeValue": 57,
        "instability": 34,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-13",
        "name": "Westfold 13",
        "q": 27,
        "r": 79,
        "security": 20,
        "tradeValue": 65,
        "instability": 24,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-14",
        "name": "Westfold 14",
        "q": 22,
        "r": 78,
        "security": 61,
        "tradeValue": 11,
        "instability": 43,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-15",
        "name": "Westfold 15",
        "q": 26,
        "r": 84,
        "security": 26,
        "tradeValue": 86,
        "instability": 27,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-16",
        "name": "Westfold 16",
        "q": 24,
        "r": 92,
        "security": 66,
        "tradeValue": 64,
        "instability": 25,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-17",
        "name": "Westfold 17",
        "q": 25,
        "r": 91,
        "security": 48,
        "tradeValue": 50,
        "instability": 20,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-18",
        "name": "Westfold 18",
        "q": 27,
        "r": 96,
        "security": 28,
        "tradeValue": 54,
        "instability": 7,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "basin"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-19",
        "name": "Westfold 19",
        "q": 23,
        "r": 104,
        "security": 69,
        "tradeValue": 88,
        "instability": 34,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-20",
        "name": "Westfold 20",
        "q": 25,
        "r": 104,
        "security": 54,
        "tradeValue": 80,
        "instability": 18,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-21",
        "name": "Westfold 21",
        "q": 22,
        "r": 110,
        "security": 40,
        "tradeValue": 16,
        "instability": 12,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-22",
        "name": "Westfold 22",
        "q": 24,
        "r": 119,
        "security": 49,
        "tradeValue": 41,
        "instability": 12,
        "escalationLevel": 0,
        "tags": [
            "standard",
            "spine"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-23",
        "name": "Westfold 23",
        "q": 17,
        "r": 118,
        "security": 62,
        "tradeValue": 29,
        "instability": 12,
        "escalationLevel": 2,
        "tags": [
            "standard",
            "basin"
        ],
        "regionId": "middle-rim"
    },
    {
        "id": "corridor-24",
        "name": "Westfold 24",
        "q": 26,
        "r": 123,
        "security": 35,
        "tradeValue": 58,
        "instability": 43,
        "escalationLevel": 1,
        "tags": [
            "standard",
            "gate"
        ],
        "regionId": "middle-rim"
    }
,
    {
    "id": "fringe-4d24400f",
    "name": "Wyvern 30",
    "q": 76,
    "r": 0,
    "security": 14,
    "tradeValue": 30,
    "instability": 22,
    "escalationLevel": 0,
    "tags": [
        "research-station",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-62239b2f",
    "name": "Miri 43",
    "q": 104,
    "r": 161,
    "security": 12,
    "tradeValue": 43,
    "instability": 7,
    "escalationLevel": 1,
    "tags": [
        "basin",
        "void",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-3ad21790",
    "name": "Ymir 10",
    "q": 131,
    "r": 176,
    "security": 31,
    "tradeValue": 29,
    "instability": 49,
    "escalationLevel": 1,
    "tags": [
        "dead-world",
        "basin",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-c61c65db",
    "name": "Gullveig 44",
    "q": 103,
    "r": 6,
    "security": 82,
    "tradeValue": 22,
    "instability": 18,
    "escalationLevel": 1,
    "tags": [
        "contested",
        "deep-space",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-3c9ffdff",
    "name": "Mimir 91",
    "q": 179,
    "r": 95,
    "security": 55,
    "tradeValue": 19,
    "instability": 13,
    "escalationLevel": 0,
    "tags": [
        "relay",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-f0bdd5a4",
    "name": "Eos 82",
    "q": 158,
    "r": 165,
    "security": 20,
    "tradeValue": 35,
    "instability": 48,
    "escalationLevel": 0,
    "tags": [
        "basin",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e1a39792",
    "name": "Gorgon 35",
    "q": 164,
    "r": 144,
    "security": 65,
    "tradeValue": 49,
    "instability": 39,
    "escalationLevel": 2,
    "tags": [
        "canal",
        "deep-space",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-cb9927ca",
    "name": "Freyja 21",
    "q": 174,
    "r": 95,
    "security": 23,
    "tradeValue": 44,
    "instability": 40,
    "escalationLevel": 1,
    "tags": [
        "deep-space",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-727f136e",
    "name": "Magni 25",
    "q": 114,
    "r": 174,
    "security": 64,
    "tradeValue": 60,
    "instability": 29,
    "escalationLevel": 2,
    "tags": [
        "fortress",
        "basin",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ccfcfd82",
    "name": "Thal 73",
    "q": 177,
    "r": 74,
    "security": 40,
    "tradeValue": 60,
    "instability": 11,
    "escalationLevel": 0,
    "tags": [
        "mining-hub",
        "throat",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-68c33b8c",
    "name": "Bragi 56",
    "q": 1,
    "r": 134,
    "security": 81,
    "tradeValue": 60,
    "instability": 14,
    "escalationLevel": 1,
    "tags": [
        "mining-hub",
        "basin",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-59e79d93",
    "name": "Loki 29",
    "q": 59,
    "r": 176,
    "security": 13,
    "tradeValue": 33,
    "instability": 49,
    "escalationLevel": 1,
    "tags": [
        "black-market",
        "mining-hub"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d603f813",
    "name": "Varn 57",
    "q": 58,
    "r": 170,
    "security": 56,
    "tradeValue": 29,
    "instability": 0,
    "escalationLevel": 1,
    "tags": [
        "throat",
        "mining-hub"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-c1b7750f",
    "name": "Loki 44",
    "q": 178,
    "r": 5,
    "security": 71,
    "tradeValue": 41,
    "instability": 3,
    "escalationLevel": 0,
    "tags": [
        "contested",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-437fd4c3",
    "name": "Modi 29",
    "q": 157,
    "r": 5,
    "security": 14,
    "tradeValue": 10,
    "instability": 35,
    "escalationLevel": 2,
    "tags": [
        "contested",
        "spine",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-90d72eb3",
    "name": "Hydra 44",
    "q": 80,
    "r": 12,
    "security": 84,
    "tradeValue": 40,
    "instability": 37,
    "escalationLevel": 1,
    "tags": [
        "ancient-ruins",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-8199e84c",
    "name": "Jormungand 29",
    "q": 40,
    "r": 2,
    "security": 49,
    "tradeValue": 46,
    "instability": 0,
    "escalationLevel": 1,
    "tags": [
        "throat",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-8c60f0d6",
    "name": "Draken 92",
    "q": 64,
    "r": 11,
    "security": 20,
    "tradeValue": 16,
    "instability": 1,
    "escalationLevel": 2,
    "tags": [
        "nebula-outpost",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-322ac540",
    "name": "Mimir 14",
    "q": 4,
    "r": 22,
    "security": 18,
    "tradeValue": 50,
    "instability": 38,
    "escalationLevel": 1,
    "tags": [
        "void",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-5c20a821",
    "name": "Ymir 77",
    "q": 43,
    "r": 1,
    "security": 73,
    "tradeValue": 58,
    "instability": 37,
    "escalationLevel": 0,
    "tags": [
        "standard",
        "dead-world",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1e48c289",
    "name": "Lund 17",
    "q": 20,
    "r": 177,
    "security": 41,
    "tradeValue": 45,
    "instability": 47,
    "escalationLevel": 0,
    "tags": [
        "basin",
        "pirate-den",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e83aefcb",
    "name": "Njord 78",
    "q": 30,
    "r": 164,
    "security": 11,
    "tradeValue": 55,
    "instability": 15,
    "escalationLevel": 1,
    "tags": [
        "research-station",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-3209f0fb",
    "name": "Miri 31",
    "q": 6,
    "r": 157,
    "security": 79,
    "tradeValue": 21,
    "instability": 41,
    "escalationLevel": 1,
    "tags": [
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-8b48e0c9",
    "name": "Gorgon 85",
    "q": 144,
    "r": 3,
    "security": 46,
    "tradeValue": 60,
    "instability": 3,
    "escalationLevel": 1,
    "tags": [
        "pirate-den",
        "void",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-409b603e",
    "name": "Bragi 20",
    "q": 8,
    "r": 12,
    "security": 75,
    "tradeValue": 64,
    "instability": 0,
    "escalationLevel": 1,
    "tags": [
        "gate",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-494663a7",
    "name": "Heimdall 5",
    "q": 53,
    "r": 14,
    "security": 61,
    "tradeValue": 47,
    "instability": 16,
    "escalationLevel": 0,
    "tags": [
        "canal",
        "ancient-ruins",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-32bc00a9",
    "name": "Balder 2",
    "q": 7,
    "r": 122,
    "security": 35,
    "tradeValue": 37,
    "instability": 45,
    "escalationLevel": 2,
    "tags": [
        "nebula-outpost",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ebd06bf8",
    "name": "Miri 62",
    "q": 2,
    "r": 72,
    "security": 74,
    "tradeValue": 37,
    "instability": 3,
    "escalationLevel": 0,
    "tags": [
        "black-market",
        "void",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-35750956",
    "name": "Siren 76",
    "q": 165,
    "r": 101,
    "security": 25,
    "tradeValue": 12,
    "instability": 34,
    "escalationLevel": 2,
    "tags": [
        "standard",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1169b981",
    "name": "Bragi 49",
    "q": 96,
    "r": 167,
    "security": 86,
    "tradeValue": 60,
    "instability": 33,
    "escalationLevel": 1,
    "tags": [
        "spine",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-644aeba2",
    "name": "Idun 90",
    "q": 168,
    "r": 7,
    "security": 71,
    "tradeValue": 51,
    "instability": 33,
    "escalationLevel": 2,
    "tags": [
        "deep-space",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-7ee27d57",
    "name": "Freyr 21",
    "q": 171,
    "r": 75,
    "security": 52,
    "tradeValue": 12,
    "instability": 47,
    "escalationLevel": 2,
    "tags": [
        "dead-world",
        "fortress",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-bfd2e757",
    "name": "Chimera 45",
    "q": 120,
    "r": 5,
    "security": 67,
    "tradeValue": 46,
    "instability": 44,
    "escalationLevel": 1,
    "tags": [
        "standard",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-072368d3",
    "name": "Modi 26",
    "q": 160,
    "r": 73,
    "security": 21,
    "tradeValue": 42,
    "instability": 45,
    "escalationLevel": 1,
    "tags": [
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-34cd007c",
    "name": "Wyvern 85",
    "q": 175,
    "r": 25,
    "security": 17,
    "tradeValue": 48,
    "instability": 23,
    "escalationLevel": 0,
    "tags": [
        "deep-space",
        "black-market",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-6dc9c8db",
    "name": "Ullr 20",
    "q": 27,
    "r": 8,
    "security": 24,
    "tradeValue": 48,
    "instability": 0,
    "escalationLevel": 1,
    "tags": [
        "deep-space",
        "ancient-ruins",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-c397f194",
    "name": "Loki 71",
    "q": 68,
    "r": 177,
    "security": 72,
    "tradeValue": 42,
    "instability": 4,
    "escalationLevel": 0,
    "tags": [
        "pirate-den",
        "black-market",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-af976237",
    "name": "Skadi 28",
    "q": 126,
    "r": 4,
    "security": 37,
    "tradeValue": 55,
    "instability": 21,
    "escalationLevel": 0,
    "tags": [
        "spine",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-936b3ebf",
    "name": "Forseti 54",
    "q": 171,
    "r": 141,
    "security": 67,
    "tradeValue": 53,
    "instability": 47,
    "escalationLevel": 1,
    "tags": [
        "ancient-ruins",
        "deep-space",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1b24c395",
    "name": "Lund 40",
    "q": 152,
    "r": 3,
    "security": 13,
    "tradeValue": 51,
    "instability": 28,
    "escalationLevel": 2,
    "tags": [
        "gate",
        "mining-hub"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a86479ed",
    "name": "Njord 4",
    "q": 173,
    "r": 161,
    "security": 75,
    "tradeValue": 19,
    "instability": 10,
    "escalationLevel": 2,
    "tags": [
        "fortress",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-3b9a32f7",
    "name": "Jormungand 32",
    "q": 12,
    "r": 84,
    "security": 57,
    "tradeValue": 50,
    "instability": 22,
    "escalationLevel": 2,
    "tags": [
        "ancient-ruins",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-6f0e9d2d",
    "name": "Hödur 78",
    "q": 166,
    "r": 105,
    "security": 33,
    "tradeValue": 12,
    "instability": 5,
    "escalationLevel": 1,
    "tags": [
        "deep-space",
        "standard",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-b829a2b1",
    "name": "Vali 77",
    "q": 54,
    "r": 173,
    "security": 72,
    "tradeValue": 52,
    "instability": 4,
    "escalationLevel": 0,
    "tags": [
        "deep-space",
        "mining-hub",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d03173aa",
    "name": "Bragi 62",
    "q": 173,
    "r": 8,
    "security": 76,
    "tradeValue": 51,
    "instability": 22,
    "escalationLevel": 0,
    "tags": [
        "fortress",
        "dead-world",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-b28fd560",
    "name": "Heimdall 3",
    "q": 17,
    "r": 172,
    "security": 46,
    "tradeValue": 38,
    "instability": 26,
    "escalationLevel": 1,
    "tags": [
        "canal",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-7fcdb7ec",
    "name": "Skadi 82",
    "q": 14,
    "r": 86,
    "security": 66,
    "tradeValue": 54,
    "instability": 31,
    "escalationLevel": 1,
    "tags": [
        "mining-hub",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-de4b4f13",
    "name": "Ullr 16",
    "q": 150,
    "r": 176,
    "security": 89,
    "tradeValue": 59,
    "instability": 38,
    "escalationLevel": 2,
    "tags": [
        "contested",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-0ec76fa8",
    "name": "Loki 67",
    "q": 14,
    "r": 56,
    "security": 24,
    "tradeValue": 9,
    "instability": 18,
    "escalationLevel": 2,
    "tags": [
        "ancient-ruins",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-68120f5b",
    "name": "Freyr 71",
    "q": 69,
    "r": 4,
    "security": 78,
    "tradeValue": 32,
    "instability": 30,
    "escalationLevel": 1,
    "tags": [
        "dead-world",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e425ac49",
    "name": "Gullveig 9",
    "q": 3,
    "r": 7,
    "security": 40,
    "tradeValue": 38,
    "instability": 8,
    "escalationLevel": 0,
    "tags": [
        "fortress",
        "pirate-den",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-6baab780",
    "name": "Xylos 61",
    "q": 169,
    "r": 119,
    "security": 16,
    "tradeValue": 64,
    "instability": 37,
    "escalationLevel": 1,
    "tags": [
        "nebula-outpost",
        "pirate-den",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d266b4a6",
    "name": "Skadi 36",
    "q": 130,
    "r": 170,
    "security": 55,
    "tradeValue": 27,
    "instability": 37,
    "escalationLevel": 0,
    "tags": [
        "void",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-6620bb2b",
    "name": "Balder 95",
    "q": 166,
    "r": 56,
    "security": 59,
    "tradeValue": 45,
    "instability": 19,
    "escalationLevel": 1,
    "tags": [
        "gate",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-3d9b6cb8",
    "name": "Thal 59",
    "q": 72,
    "r": 167,
    "security": 12,
    "tradeValue": 19,
    "instability": 8,
    "escalationLevel": 1,
    "tags": [
        "canal",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-df37234b",
    "name": "Thal 93",
    "q": 171,
    "r": 111,
    "security": 22,
    "tradeValue": 64,
    "instability": 5,
    "escalationLevel": 1,
    "tags": [
        "gate",
        "deep-space",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a8bfa638",
    "name": "Freyr 68",
    "q": 173,
    "r": 170,
    "security": 31,
    "tradeValue": 59,
    "instability": 29,
    "escalationLevel": 0,
    "tags": [
        "relay",
        "deep-space",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ec78dbad",
    "name": "Kraken 72",
    "q": 74,
    "r": 13,
    "security": 29,
    "tradeValue": 7,
    "instability": 33,
    "escalationLevel": 0,
    "tags": [
        "void",
        "nebula-outpost",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e3d54339",
    "name": "Idun 82",
    "q": 178,
    "r": 44,
    "security": 33,
    "tradeValue": 35,
    "instability": 3,
    "escalationLevel": 0,
    "tags": [
        "void",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-07d2d5be",
    "name": "Kraken 32",
    "q": 8,
    "r": 25,
    "security": 16,
    "tradeValue": 20,
    "instability": 46,
    "escalationLevel": 2,
    "tags": [
        "black-market",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-5e2c04ff",
    "name": "Eos 80",
    "q": 166,
    "r": 177,
    "security": 81,
    "tradeValue": 52,
    "instability": 42,
    "escalationLevel": 1,
    "tags": [
        "standard",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d917f7ec",
    "name": "Eos 48",
    "q": 164,
    "r": 72,
    "security": 14,
    "tradeValue": 9,
    "instability": 48,
    "escalationLevel": 2,
    "tags": [
        "void",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-7a6638af",
    "name": "Varn 82",
    "q": 112,
    "r": 5,
    "security": 23,
    "tradeValue": 55,
    "instability": 21,
    "escalationLevel": 0,
    "tags": [
        "gate",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-b1d8ef40",
    "name": "Surt 55",
    "q": 172,
    "r": 177,
    "security": 22,
    "tradeValue": 30,
    "instability": 2,
    "escalationLevel": 2,
    "tags": [
        "dead-world",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-0c6fe6b0",
    "name": "Hydra 7",
    "q": 65,
    "r": 164,
    "security": 28,
    "tradeValue": 33,
    "instability": 26,
    "escalationLevel": 2,
    "tags": [
        "spine",
        "black-market",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-5087f1bc",
    "name": "Heimdall 28",
    "q": 173,
    "r": 96,
    "security": 80,
    "tradeValue": 58,
    "instability": 37,
    "escalationLevel": 0,
    "tags": [
        "canal",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-c2086ae0",
    "name": "Jormungand 33",
    "q": 0,
    "r": 69,
    "security": 12,
    "tradeValue": 59,
    "instability": 33,
    "escalationLevel": 1,
    "tags": [
        "standard",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-7e159a2e",
    "name": "Njord 97",
    "q": 131,
    "r": 162,
    "security": 53,
    "tradeValue": 60,
    "instability": 4,
    "escalationLevel": 0,
    "tags": [
        "research-station",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-4ec35792",
    "name": "Gullveig 5",
    "q": 175,
    "r": 133,
    "security": 20,
    "tradeValue": 24,
    "instability": 33,
    "escalationLevel": 0,
    "tags": [
        "fortress",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-0f8f3aa0",
    "name": "Gerda 91",
    "q": 177,
    "r": 168,
    "security": 56,
    "tradeValue": 38,
    "instability": 6,
    "escalationLevel": 0,
    "tags": [
        "canal",
        "contested",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-cd086192",
    "name": "Jormungand 32",
    "q": 90,
    "r": 169,
    "security": 21,
    "tradeValue": 54,
    "instability": 8,
    "escalationLevel": 0,
    "tags": [
        "dead-world",
        "canal",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-fb157d4f",
    "name": "Eos 25",
    "q": 97,
    "r": 165,
    "security": 47,
    "tradeValue": 44,
    "instability": 37,
    "escalationLevel": 2,
    "tags": [
        "ancient-ruins",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-b5594e97",
    "name": "Loki 16",
    "q": 85,
    "r": 173,
    "security": 74,
    "tradeValue": 25,
    "instability": 5,
    "escalationLevel": 1,
    "tags": [
        "deep-space",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-6b9b4035",
    "name": "Fenrir 28",
    "q": 0,
    "r": 20,
    "security": 32,
    "tradeValue": 14,
    "instability": 17,
    "escalationLevel": 1,
    "tags": [
        "ancient-ruins",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-35c40140",
    "name": "Freyr 10",
    "q": 102,
    "r": 171,
    "security": 29,
    "tradeValue": 27,
    "instability": 15,
    "escalationLevel": 1,
    "tags": [
        "spine",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ca3b268b",
    "name": "Bragi 38",
    "q": 9,
    "r": 12,
    "security": 43,
    "tradeValue": 50,
    "instability": 27,
    "escalationLevel": 0,
    "tags": [
        "spine",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-cc60a628",
    "name": "Njord 69",
    "q": 34,
    "r": 161,
    "security": 19,
    "tradeValue": 35,
    "instability": 16,
    "escalationLevel": 1,
    "tags": [
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-53f06be6",
    "name": "Idun 41",
    "q": 171,
    "r": 163,
    "security": 36,
    "tradeValue": 58,
    "instability": 38,
    "escalationLevel": 0,
    "tags": [
        "standard",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-57672150",
    "name": "Basilisk 80",
    "q": 116,
    "r": 170,
    "security": 27,
    "tradeValue": 24,
    "instability": 26,
    "escalationLevel": 0,
    "tags": [
        "fortress",
        "throat",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-8c56d217",
    "name": "Ymir 34",
    "q": 170,
    "r": 2,
    "security": 84,
    "tradeValue": 58,
    "instability": 39,
    "escalationLevel": 0,
    "tags": [
        "ancient-ruins",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1e716310",
    "name": "Gerda 82",
    "q": 13,
    "r": 178,
    "security": 67,
    "tradeValue": 11,
    "instability": 28,
    "escalationLevel": 2,
    "tags": [
        "nebula-outpost",
        "void",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-16430951",
    "name": "Ullr 79",
    "q": 124,
    "r": 12,
    "security": 19,
    "tradeValue": 17,
    "instability": 4,
    "escalationLevel": 0,
    "tags": [
        "black-market",
        "spine",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-2e65fd6f",
    "name": "Magni 11",
    "q": 164,
    "r": 95,
    "security": 65,
    "tradeValue": 47,
    "instability": 15,
    "escalationLevel": 2,
    "tags": [
        "deep-space",
        "pirate-den",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-8655b608",
    "name": "Tyr 69",
    "q": 161,
    "r": 179,
    "security": 42,
    "tradeValue": 32,
    "instability": 48,
    "escalationLevel": 2,
    "tags": [
        "gate",
        "research-station",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ab04979d",
    "name": "Basilisk 43",
    "q": 125,
    "r": 169,
    "security": 76,
    "tradeValue": 46,
    "instability": 49,
    "escalationLevel": 2,
    "tags": [
        "spine",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a405dabd",
    "name": "Draken 17",
    "q": 162,
    "r": 127,
    "security": 52,
    "tradeValue": 18,
    "instability": 7,
    "escalationLevel": 2,
    "tags": [
        "contested",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-42420cc0",
    "name": "Miri 77",
    "q": 155,
    "r": 7,
    "security": 35,
    "tradeValue": 25,
    "instability": 44,
    "escalationLevel": 1,
    "tags": [
        "research-station",
        "gate",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-72e5d2ec",
    "name": "Miri 50",
    "q": 167,
    "r": 13,
    "security": 25,
    "tradeValue": 32,
    "instability": 21,
    "escalationLevel": 2,
    "tags": [
        "spine",
        "canal",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-9cd03e88",
    "name": "Aethel 78",
    "q": 11,
    "r": 132,
    "security": 40,
    "tradeValue": 15,
    "instability": 12,
    "escalationLevel": 2,
    "tags": [
        "throat",
        "contested",
        "mining-hub"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-bdc207c0",
    "name": "Freyr 40",
    "q": 76,
    "r": 162,
    "security": 83,
    "tradeValue": 16,
    "instability": 28,
    "escalationLevel": 1,
    "tags": [
        "mining-hub",
        "fortress",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-62cb3ac9",
    "name": "Freyr 65",
    "q": 132,
    "r": 179,
    "security": 28,
    "tradeValue": 63,
    "instability": 13,
    "escalationLevel": 0,
    "tags": [
        "fortress",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-efd6cc04",
    "name": "Draken 35",
    "q": 8,
    "r": 14,
    "security": 27,
    "tradeValue": 39,
    "instability": 22,
    "escalationLevel": 2,
    "tags": [
        "fortress",
        "mining-hub",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-6a8aa6a2",
    "name": "Kira 26",
    "q": 0,
    "r": 121,
    "security": 75,
    "tradeValue": 54,
    "instability": 36,
    "escalationLevel": 1,
    "tags": [
        "dead-world",
        "relay",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-fceba446",
    "name": "Xylos 17",
    "q": 170,
    "r": 12,
    "security": 53,
    "tradeValue": 28,
    "instability": 9,
    "escalationLevel": 1,
    "tags": [
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-02bb157b",
    "name": "Mimir 43",
    "q": 153,
    "r": 164,
    "security": 23,
    "tradeValue": 29,
    "instability": 37,
    "escalationLevel": 0,
    "tags": [
        "black-market",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-c71f5359",
    "name": "Freyja 56",
    "q": 160,
    "r": 137,
    "security": 20,
    "tradeValue": 10,
    "instability": 47,
    "escalationLevel": 2,
    "tags": [
        "basin",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-454bf703",
    "name": "Mimir 19",
    "q": 10,
    "r": 169,
    "security": 64,
    "tradeValue": 5,
    "instability": 46,
    "escalationLevel": 1,
    "tags": [
        "pirate-den",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-4fdbcb07",
    "name": "Nyx 36",
    "q": 176,
    "r": 19,
    "security": 40,
    "tradeValue": 50,
    "instability": 24,
    "escalationLevel": 1,
    "tags": [
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e132cf9a",
    "name": "Kira 27",
    "q": 72,
    "r": 3,
    "security": 61,
    "tradeValue": 59,
    "instability": 42,
    "escalationLevel": 2,
    "tags": [
        "standard",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-256148b6",
    "name": "Skadi 20",
    "q": 3,
    "r": 1,
    "security": 52,
    "tradeValue": 39,
    "instability": 0,
    "escalationLevel": 1,
    "tags": [
        "void",
        "spine",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-9157e30d",
    "name": "Hydra 90",
    "q": 163,
    "r": 107,
    "security": 64,
    "tradeValue": 31,
    "instability": 6,
    "escalationLevel": 1,
    "tags": [
        "pirate-den",
        "basin"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ad69cbb7",
    "name": "Idun 63",
    "q": 11,
    "r": 150,
    "security": 49,
    "tradeValue": 35,
    "instability": 42,
    "escalationLevel": 2,
    "tags": [
        "research-station",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-09127387",
    "name": "Miri 22",
    "q": 177,
    "r": 116,
    "security": 70,
    "tradeValue": 18,
    "instability": 35,
    "escalationLevel": 0,
    "tags": [
        "ancient-ruins",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1d0da6d9",
    "name": "Kira 32",
    "q": 11,
    "r": 163,
    "security": 15,
    "tradeValue": 55,
    "instability": 5,
    "escalationLevel": 2,
    "tags": [
        "research-station",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-bd372b8a",
    "name": "Forseti 88",
    "q": 141,
    "r": 5,
    "security": 83,
    "tradeValue": 45,
    "instability": 1,
    "escalationLevel": 2,
    "tags": [
        "fortress",
        "mining-hub",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-90eb352a",
    "name": "Magni 17",
    "q": 13,
    "r": 144,
    "security": 24,
    "tradeValue": 55,
    "instability": 7,
    "escalationLevel": 2,
    "tags": [
        "void",
        "contested",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-87f4cce3",
    "name": "Kraken 27",
    "q": 21,
    "r": 3,
    "security": 31,
    "tradeValue": 18,
    "instability": 9,
    "escalationLevel": 0,
    "tags": [
        "black-market",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-f043a03d",
    "name": "Heimdall 15",
    "q": 4,
    "r": 59,
    "security": 71,
    "tradeValue": 63,
    "instability": 25,
    "escalationLevel": 1,
    "tags": [
        "dead-world",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-01ef693d",
    "name": "Gerda 50",
    "q": 88,
    "r": 168,
    "security": 10,
    "tradeValue": 62,
    "instability": 2,
    "escalationLevel": 2,
    "tags": [
        "research-station",
        "black-market",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-07d26a9c",
    "name": "Lund 26",
    "q": 67,
    "r": 172,
    "security": 14,
    "tradeValue": 40,
    "instability": 23,
    "escalationLevel": 1,
    "tags": [
        "contested",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-0f291ef8",
    "name": "Bragi 86",
    "q": 1,
    "r": 36,
    "security": 45,
    "tradeValue": 47,
    "instability": 33,
    "escalationLevel": 1,
    "tags": [
        "black-market",
        "dead-world",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-3787192b",
    "name": "Heimdall 30",
    "q": 135,
    "r": 178,
    "security": 25,
    "tradeValue": 15,
    "instability": 47,
    "escalationLevel": 0,
    "tags": [
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-04a79b90",
    "name": "Xylos 17",
    "q": 6,
    "r": 124,
    "security": 20,
    "tradeValue": 12,
    "instability": 25,
    "escalationLevel": 0,
    "tags": [
        "nebula-outpost",
        "pirate-den",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a929e6c8",
    "name": "Heimdall 14",
    "q": 62,
    "r": 5,
    "security": 44,
    "tradeValue": 43,
    "instability": 26,
    "escalationLevel": 0,
    "tags": [
        "fortress",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d47b161c",
    "name": "Chimera 51",
    "q": 97,
    "r": 6,
    "security": 54,
    "tradeValue": 53,
    "instability": 18,
    "escalationLevel": 0,
    "tags": [
        "spine",
        "standard",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-4764c1ae",
    "name": "Freyr 23",
    "q": 2,
    "r": 0,
    "security": 47,
    "tradeValue": 39,
    "instability": 30,
    "escalationLevel": 2,
    "tags": [
        "nebula-outpost",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-0ef64f3f",
    "name": "Mimir 38",
    "q": 60,
    "r": 176,
    "security": 19,
    "tradeValue": 64,
    "instability": 10,
    "escalationLevel": 0,
    "tags": [
        "pirate-den",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-554b8ced",
    "name": "Lund 51",
    "q": 86,
    "r": 12,
    "security": 86,
    "tradeValue": 58,
    "instability": 42,
    "escalationLevel": 0,
    "tags": [
        "standard",
        "nebula-outpost",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-7bce5d6e",
    "name": "Siren 72",
    "q": 64,
    "r": 167,
    "security": 83,
    "tradeValue": 50,
    "instability": 48,
    "escalationLevel": 0,
    "tags": [
        "fortress",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-9e4f1c98",
    "name": "Thal 43",
    "q": 78,
    "r": 5,
    "security": 77,
    "tradeValue": 34,
    "instability": 12,
    "escalationLevel": 2,
    "tags": [
        "black-market",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-85231fed",
    "name": "Basilisk 28",
    "q": 94,
    "r": 169,
    "security": 60,
    "tradeValue": 27,
    "instability": 43,
    "escalationLevel": 2,
    "tags": [
        "basin",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-611fb5eb",
    "name": "Skadi 55",
    "q": 163,
    "r": 65,
    "security": 52,
    "tradeValue": 32,
    "instability": 7,
    "escalationLevel": 2,
    "tags": [
        "spine",
        "void",
        "basin"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-50aa385c",
    "name": "Freyr 23",
    "q": 99,
    "r": 113,
    "security": 74,
    "tradeValue": 46,
    "instability": 0,
    "escalationLevel": 0,
    "tags": [
        "mining-hub",
        "deep-space",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-6972fb4f",
    "name": "Chimera 70",
    "q": 106,
    "r": 73,
    "security": 72,
    "tradeValue": 45,
    "instability": 47,
    "escalationLevel": 1,
    "tags": [
        "nebula-outpost",
        "basin",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-17beef81",
    "name": "Wyvern 91",
    "q": 108,
    "r": 78,
    "security": 77,
    "tradeValue": 60,
    "instability": 2,
    "escalationLevel": 2,
    "tags": [
        "fortress",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-2201164c",
    "name": "Kraken 89",
    "q": 39,
    "r": 77,
    "security": 19,
    "tradeValue": 28,
    "instability": 35,
    "escalationLevel": 1,
    "tags": [
        "relay",
        "black-market",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e703ce3c",
    "name": "Gerda 25",
    "q": 92,
    "r": 53,
    "security": 57,
    "tradeValue": 12,
    "instability": 0,
    "escalationLevel": 2,
    "tags": [
        "canal",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-0e203eb1",
    "name": "Zenth 91",
    "q": 81,
    "r": 164,
    "security": 19,
    "tradeValue": 64,
    "instability": 12,
    "escalationLevel": 2,
    "tags": [
        "pirate-den",
        "research-station",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-0eda79ea",
    "name": "Chimera 65",
    "q": 48,
    "r": 104,
    "security": 45,
    "tradeValue": 45,
    "instability": 27,
    "escalationLevel": 1,
    "tags": [
        "deep-space",
        "ancient-ruins",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-261d33a3",
    "name": "Siren 81",
    "q": 161,
    "r": 86,
    "security": 17,
    "tradeValue": 42,
    "instability": 11,
    "escalationLevel": 0,
    "tags": [
        "black-market",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-4c90bedb",
    "name": "Bragi 92",
    "q": 85,
    "r": 12,
    "security": 27,
    "tradeValue": 22,
    "instability": 38,
    "escalationLevel": 0,
    "tags": [
        "research-station",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-bea2c237",
    "name": "Jormungand 85",
    "q": 102,
    "r": 117,
    "security": 23,
    "tradeValue": 60,
    "instability": 10,
    "escalationLevel": 1,
    "tags": [
        "mining-hub",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-615c59c7",
    "name": "Thal 83",
    "q": 84,
    "r": 16,
    "security": 50,
    "tradeValue": 15,
    "instability": 38,
    "escalationLevel": 0,
    "tags": [
        "relay",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ac5a5f55",
    "name": "Modi 68",
    "q": 128,
    "r": 77,
    "security": 54,
    "tradeValue": 14,
    "instability": 0,
    "escalationLevel": 2,
    "tags": [
        "relay",
        "research-station",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-9e08211d",
    "name": "Magni 9",
    "q": 73,
    "r": 12,
    "security": 32,
    "tradeValue": 40,
    "instability": 13,
    "escalationLevel": 2,
    "tags": [
        "gate",
        "relay",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e950461c",
    "name": "Magni 81",
    "q": 65,
    "r": 36,
    "security": 72,
    "tradeValue": 59,
    "instability": 39,
    "escalationLevel": 2,
    "tags": [
        "gate",
        "throat",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-67e18b97",
    "name": "Balder 15",
    "q": 76,
    "r": 102,
    "security": 40,
    "tradeValue": 60,
    "instability": 5,
    "escalationLevel": 0,
    "tags": [
        "black-market",
        "standard",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-186d4732",
    "name": "Miri 84",
    "q": 42,
    "r": 82,
    "security": 45,
    "tradeValue": 13,
    "instability": 16,
    "escalationLevel": 0,
    "tags": [
        "void",
        "ancient-ruins",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-8dd12dac",
    "name": "Gorgon 82",
    "q": 77,
    "r": 22,
    "security": 45,
    "tradeValue": 5,
    "instability": 3,
    "escalationLevel": 2,
    "tags": [
        "research-station",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-cb7e9aba",
    "name": "Thal 29",
    "q": 85,
    "r": 72,
    "security": 34,
    "tradeValue": 63,
    "instability": 6,
    "escalationLevel": 1,
    "tags": [
        "void",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e1b8cc3d",
    "name": "Ullr 62",
    "q": 104,
    "r": 26,
    "security": 80,
    "tradeValue": 29,
    "instability": 6,
    "escalationLevel": 1,
    "tags": [
        "research-station",
        "dead-world",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-50ed7e7e",
    "name": "Freyja 19",
    "q": 96,
    "r": 130,
    "security": 28,
    "tradeValue": 52,
    "instability": 37,
    "escalationLevel": 2,
    "tags": [
        "nebula-outpost",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-20218927",
    "name": "Vali 9",
    "q": 163,
    "r": 96,
    "security": 70,
    "tradeValue": 41,
    "instability": 39,
    "escalationLevel": 0,
    "tags": [
        "mining-hub",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-3589c8c5",
    "name": "Balder 3",
    "q": 29,
    "r": 76,
    "security": 62,
    "tradeValue": 57,
    "instability": 28,
    "escalationLevel": 2,
    "tags": [
        "deep-space",
        "gate",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d112bfcd",
    "name": "Hödur 45",
    "q": 86,
    "r": 68,
    "security": 87,
    "tradeValue": 10,
    "instability": 33,
    "escalationLevel": 0,
    "tags": [
        "basin",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-888c0167",
    "name": "Njord 63",
    "q": 65,
    "r": 150,
    "security": 84,
    "tradeValue": 47,
    "instability": 22,
    "escalationLevel": 2,
    "tags": [
        "throat",
        "fortress",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-2516ad54",
    "name": "Siren 80",
    "q": 72,
    "r": 20,
    "security": 48,
    "tradeValue": 11,
    "instability": 45,
    "escalationLevel": 1,
    "tags": [
        "spine",
        "gate",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-9f4e4e44",
    "name": "Frigg 83",
    "q": 98,
    "r": 26,
    "security": 80,
    "tradeValue": 27,
    "instability": 13,
    "escalationLevel": 2,
    "tags": [
        "relay",
        "pirate-den",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-804ce952",
    "name": "Eos 5",
    "q": 171,
    "r": 65,
    "security": 71,
    "tradeValue": 30,
    "instability": 5,
    "escalationLevel": 1,
    "tags": [
        "ancient-ruins",
        "basin",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d154d50b",
    "name": "Balder 80",
    "q": 76,
    "r": 152,
    "security": 24,
    "tradeValue": 5,
    "instability": 8,
    "escalationLevel": 0,
    "tags": [
        "relay",
        "ancient-ruins",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1105b783",
    "name": "Draken 40",
    "q": 156,
    "r": 104,
    "security": 15,
    "tradeValue": 50,
    "instability": 40,
    "escalationLevel": 1,
    "tags": [
        "ancient-ruins",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-76dbe915",
    "name": "Vidar 22",
    "q": 84,
    "r": 109,
    "security": 13,
    "tradeValue": 43,
    "instability": 33,
    "escalationLevel": 0,
    "tags": [
        "contested",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-677737f9",
    "name": "Chimera 95",
    "q": 29,
    "r": 99,
    "security": 72,
    "tradeValue": 62,
    "instability": 32,
    "escalationLevel": 2,
    "tags": [
        "basin",
        "contested",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-ea8b59be",
    "name": "Balder 28",
    "q": 95,
    "r": 82,
    "security": 58,
    "tradeValue": 40,
    "instability": 15,
    "escalationLevel": 1,
    "tags": [
        "fortress",
        "research-station",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-c048c6b3",
    "name": "Zenth 6",
    "q": 25,
    "r": 71,
    "security": 19,
    "tradeValue": 21,
    "instability": 41,
    "escalationLevel": 0,
    "tags": [
        "research-station",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e276b89b",
    "name": "Vali 64",
    "q": 75,
    "r": 162,
    "security": 39,
    "tradeValue": 29,
    "instability": 36,
    "escalationLevel": 0,
    "tags": [
        "standard",
        "deep-space",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a919648d",
    "name": "Zenth 73",
    "q": 75,
    "r": 105,
    "security": 55,
    "tradeValue": 56,
    "instability": 25,
    "escalationLevel": 1,
    "tags": [
        "relay",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-cfbc314c",
    "name": "Draken 73",
    "q": 67,
    "r": 158,
    "security": 15,
    "tradeValue": 27,
    "instability": 19,
    "escalationLevel": 0,
    "tags": [
        "dead-world",
        "basin",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-af155835",
    "name": "Frigg 32",
    "q": 66,
    "r": 11,
    "security": 75,
    "tradeValue": 53,
    "instability": 11,
    "escalationLevel": 2,
    "tags": [
        "nebula-outpost",
        "black-market"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1b43fa20",
    "name": "Draken 95",
    "q": 90,
    "r": 53,
    "security": 77,
    "tradeValue": 20,
    "instability": 35,
    "escalationLevel": 1,
    "tags": [
        "pirate-den",
        "canal",
        "throat"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-5088720d",
    "name": "Freyja 37",
    "q": 86,
    "r": 67,
    "security": 45,
    "tradeValue": 56,
    "instability": 48,
    "escalationLevel": 2,
    "tags": [
        "basin",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-948e636f",
    "name": "Xylos 50",
    "q": 67,
    "r": 95,
    "security": 21,
    "tradeValue": 42,
    "instability": 26,
    "escalationLevel": 2,
    "tags": [
        "contested",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-86a2a454",
    "name": "Kira 23",
    "q": 33,
    "r": 92,
    "security": 23,
    "tradeValue": 5,
    "instability": 16,
    "escalationLevel": 2,
    "tags": [
        "black-market",
        "contested",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-bab08347",
    "name": "Balder 9",
    "q": 88,
    "r": 75,
    "security": 61,
    "tradeValue": 55,
    "instability": 40,
    "escalationLevel": 0,
    "tags": [
        "ancient-ruins",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-dcfea00f",
    "name": "Zenth 59",
    "q": 102,
    "r": 103,
    "security": 34,
    "tradeValue": 37,
    "instability": 3,
    "escalationLevel": 1,
    "tags": [
        "research-station",
        "gate",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-07c3da48",
    "name": "Hydra 1",
    "q": 91,
    "r": 124,
    "security": 46,
    "tradeValue": 19,
    "instability": 18,
    "escalationLevel": 2,
    "tags": [
        "fortress",
        "throat",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-f56f8f36",
    "name": "Kira 92",
    "q": 137,
    "r": 98,
    "security": 70,
    "tradeValue": 56,
    "instability": 33,
    "escalationLevel": 0,
    "tags": [
        "canal",
        "black-market",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a0e7fab0",
    "name": "Kraken 13",
    "q": 75,
    "r": 62,
    "security": 49,
    "tradeValue": 60,
    "instability": 19,
    "escalationLevel": 1,
    "tags": [
        "nebula-outpost",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-090765b7",
    "name": "Hydra 6",
    "q": 31,
    "r": 80,
    "security": 65,
    "tradeValue": 30,
    "instability": 16,
    "escalationLevel": 1,
    "tags": [
        "basin",
        "standard",
        "mining-hub"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-e4b6d5f7",
    "name": "Freyja 57",
    "q": 140,
    "r": 94,
    "security": 53,
    "tradeValue": 22,
    "instability": 7,
    "escalationLevel": 2,
    "tags": [
        "spine",
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-177409ab",
    "name": "Vidar 30",
    "q": 36,
    "r": 85,
    "security": 84,
    "tradeValue": 31,
    "instability": 36,
    "escalationLevel": 0,
    "tags": [
        "pirate-den"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-b833e08b",
    "name": "Freyja 28",
    "q": 25,
    "r": 100,
    "security": 47,
    "tradeValue": 38,
    "instability": 19,
    "escalationLevel": 2,
    "tags": [
        "research-station",
        "throat",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-b42babf2",
    "name": "Kraken 89",
    "q": 8,
    "r": 89,
    "security": 44,
    "tradeValue": 49,
    "instability": 44,
    "escalationLevel": 2,
    "tags": [
        "dead-world",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-970fa6d2",
    "name": "Magni 23",
    "q": 177,
    "r": 100,
    "security": 45,
    "tradeValue": 26,
    "instability": 25,
    "escalationLevel": 0,
    "tags": [
        "gate",
        "mining-hub"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-9a5a09ba",
    "name": "Balder 84",
    "q": 87,
    "r": 102,
    "security": 33,
    "tradeValue": 55,
    "instability": 4,
    "escalationLevel": 1,
    "tags": [
        "nebula-outpost",
        "canal"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a4c7f5c2",
    "name": "Loki 67",
    "q": 61,
    "r": 73,
    "security": 47,
    "tradeValue": 38,
    "instability": 29,
    "escalationLevel": 2,
    "tags": [
        "spine",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-14b193f5",
    "name": "Loki 22",
    "q": 99,
    "r": 24,
    "security": 61,
    "tradeValue": 30,
    "instability": 8,
    "escalationLevel": 2,
    "tags": [
        "basin",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-5349c424",
    "name": "Gorgon 46",
    "q": 94,
    "r": 53,
    "security": 27,
    "tradeValue": 13,
    "instability": 45,
    "escalationLevel": 1,
    "tags": [
        "canal",
        "research-station",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-22021a45",
    "name": "Mimir 82",
    "q": 80,
    "r": 156,
    "security": 53,
    "tradeValue": 55,
    "instability": 1,
    "escalationLevel": 1,
    "tags": [
        "ancient-ruins",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-f4374cc4",
    "name": "Wyvern 11",
    "q": 52,
    "r": 78,
    "security": 40,
    "tradeValue": 60,
    "instability": 15,
    "escalationLevel": 2,
    "tags": [
        "standard",
        "spine",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-506f70a2",
    "name": "Thal 33",
    "q": 73,
    "r": 128,
    "security": 35,
    "tradeValue": 55,
    "instability": 3,
    "escalationLevel": 1,
    "tags": [
        "pirate-den",
        "void"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-2f60dd57",
    "name": "Modi 92",
    "q": 79,
    "r": 37,
    "security": 76,
    "tradeValue": 18,
    "instability": 39,
    "escalationLevel": 0,
    "tags": [
        "contested",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a40810ca",
    "name": "Wyvern 13",
    "q": 71,
    "r": 89,
    "security": 39,
    "tradeValue": 8,
    "instability": 31,
    "escalationLevel": 2,
    "tags": [
        "throat",
        "contested"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-7c20ba03",
    "name": "Varn 27",
    "q": 72,
    "r": 85,
    "security": 79,
    "tradeValue": 8,
    "instability": 48,
    "escalationLevel": 1,
    "tags": [
        "throat",
        "fortress",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a9efa311",
    "name": "Forseti 65",
    "q": 84,
    "r": 86,
    "security": 30,
    "tradeValue": 55,
    "instability": 11,
    "escalationLevel": 2,
    "tags": [
        "mining-hub",
        "research-station",
        "fortress"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-41a3c4be",
    "name": "Magni 30",
    "q": 106,
    "r": 66,
    "security": 29,
    "tradeValue": 37,
    "instability": 41,
    "escalationLevel": 2,
    "tags": [
        "fortress",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-1af6aaf7",
    "name": "Thal 43",
    "q": 79,
    "r": 4,
    "security": 48,
    "tradeValue": 31,
    "instability": 14,
    "escalationLevel": 0,
    "tags": [
        "gate",
        "basin",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-5f643470",
    "name": "Orox 10",
    "q": 40,
    "r": 79,
    "security": 25,
    "tradeValue": 58,
    "instability": 14,
    "escalationLevel": 2,
    "tags": [
        "relay",
        "void",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d1b78e46",
    "name": "Basilisk 35",
    "q": 59,
    "r": 70,
    "security": 64,
    "tradeValue": 63,
    "instability": 21,
    "escalationLevel": 0,
    "tags": [
        "standard",
        "relay",
        "gate"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-cd72418f",
    "name": "Ymir 39",
    "q": 121,
    "r": 67,
    "security": 88,
    "tradeValue": 16,
    "instability": 31,
    "escalationLevel": 0,
    "tags": [
        "spine",
        "relay"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-840e249e",
    "name": "Chimera 15",
    "q": 104,
    "r": 18,
    "security": 17,
    "tradeValue": 51,
    "instability": 8,
    "escalationLevel": 1,
    "tags": [
        "deep-space",
        "contested",
        "standard"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-c594189f",
    "name": "Chimera 43",
    "q": 131,
    "r": 71,
    "security": 45,
    "tradeValue": 42,
    "instability": 14,
    "escalationLevel": 0,
    "tags": [
        "spine",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-016a6017",
    "name": "Hermod 79",
    "q": 100,
    "r": 152,
    "security": 33,
    "tradeValue": 7,
    "instability": 19,
    "escalationLevel": 0,
    "tags": [
        "spine",
        "deep-space"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-022a687f",
    "name": "Idun 70",
    "q": 75,
    "r": 84,
    "security": 83,
    "tradeValue": 52,
    "instability": 37,
    "escalationLevel": 1,
    "tags": [
        "deep-space",
        "research-station",
        "dead-world"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-f8ecaf4e",
    "name": "Magni 46",
    "q": 75,
    "r": 101,
    "security": 67,
    "tradeValue": 10,
    "instability": 0,
    "escalationLevel": 2,
    "tags": [
        "pirate-den",
        "nebula-outpost"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-fb1a56fb",
    "name": "Zenth 65",
    "q": 44,
    "r": 100,
    "security": 10,
    "tradeValue": 8,
    "instability": 18,
    "escalationLevel": 0,
    "tags": [
        "ancient-ruins",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-f7fddd37",
    "name": "Siren 45",
    "q": 69,
    "r": 90,
    "security": 44,
    "tradeValue": 17,
    "instability": 41,
    "escalationLevel": 1,
    "tags": [
        "dead-world",
        "spine"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-a5731136",
    "name": "Xylos 24",
    "q": 74,
    "r": 131,
    "security": 68,
    "tradeValue": 41,
    "instability": 6,
    "escalationLevel": 0,
    "tags": [
        "mining-hub",
        "research-station"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-d110cec5",
    "name": "Aethel 80",
    "q": 62,
    "r": 83,
    "security": 60,
    "tradeValue": 58,
    "instability": 49,
    "escalationLevel": 2,
    "tags": [
        "nebula-outpost",
        "ancient-ruins"
    ],
    "regionId": "nullward-fringe"
},
    {
    "id": "fringe-85b4e147",
    "name": "Freyr 76",
    "q": 179,
    "r": 74,
    "security": 89,
    "tradeValue": 49,
    "instability": 21,
    "escalationLevel": 2,
    "tags": [
        "black-market",
        "relay"
    ],
    "regionId": "nullward-fringe"
}
];

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Links Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

const LINK_CLASSES: Array<'base' | 'trade' | 'landBridge' | 'gate'> = ['base', 'trade', 'landBridge', 'gate'];

export const mockLinks: Link[] = [

    // --- TRUE OMICRON-GAMMA SPINE ---
    { "id": "true-spine-link-1", "fromSystemId": "omicron-3ae1ba293232a7868296", "toSystemId": "omicron-b312ce2a19a19e0dd7d6", "class": "landBridge" },
    { "id": "true-spine-link-2", "fromSystemId": "omicron-b312ce2a19a19e0dd7d6", "toSystemId": "gamma-dc5b13db984702553e92", "class": "landBridge" },
    { "id": "true-spine-link-3", "fromSystemId": "gamma-dc5b13db984702553e92", "toSystemId": "gamma-b3fa77f5c534e7dc710d", "class": "landBridge" },
    // --- TRADE RING (Shadow Routes connecting Corsair Dens) ---
    { "id": "ring-link-1", "fromSystemId": "alpha-5b34961e18bb6fd14903", "toSystemId": "beta-407b1d9fc0696aef1f6c", "class": "shadowRoute" },
    { "id": "ring-link-2", "fromSystemId": "beta-407b1d9fc0696aef1f6c", "toSystemId": "gamma-a1d2d3d92fb47eceab60", "class": "shadowRoute" },
    { "id": "ring-link-3", "fromSystemId": "gamma-a1d2d3d92fb47eceab60", "toSystemId": "omicron-4f81016fd8de20cc8f14", "class": "shadowRoute" },
    { "id": "ring-link-4", "fromSystemId": "omicron-4f81016fd8de20cc8f14", "toSystemId": "alpha-5b34961e18bb6fd14903", "class": "shadowRoute" },

    {
        "id": "link-alpha-5b34961e18bb6fd14903-alpha-92675f3b6d655e340990",
        "fromSystemId": "alpha-5b34961e18bb6fd14903",
        "toSystemId": "alpha-92675f3b6d655e340990",
        "class": "base"
    },
    {
        "id": "link-alpha-5b34961e18bb6fd14903-alpha-4311b6f81dedf12e0c2c",
        "fromSystemId": "alpha-5b34961e18bb6fd14903",
        "toSystemId": "alpha-4311b6f81dedf12e0c2c",
        "class": "gate"
    },
    {
        "id": "link-alpha-5b34961e18bb6fd14903-alpha-f326b9e042fa6bdef906",
        "fromSystemId": "alpha-5b34961e18bb6fd14903",
        "toSystemId": "alpha-f326b9e042fa6bdef906",
        "class": "base"
    },
    {
        "id": "link-alpha-fe148b9a69a680fa14a3-alpha-2bd1a5fe96a34ca33eca",
        "fromSystemId": "alpha-fe148b9a69a680fa14a3",
        "toSystemId": "alpha-2bd1a5fe96a34ca33eca",
        "class": "base"
    },
    {
        "id": "link-alpha-fe148b9a69a680fa14a3-alpha-e7d2277ef6ade0bd5818",
        "fromSystemId": "alpha-fe148b9a69a680fa14a3",
        "toSystemId": "alpha-e7d2277ef6ade0bd5818",
        "class": "base"
    },
    {
        "id": "link-alpha-fe148b9a69a680fa14a3-alpha-5a4e807c3b982fbdc3ff",
        "fromSystemId": "alpha-fe148b9a69a680fa14a3",
        "toSystemId": "alpha-5a4e807c3b982fbdc3ff",
        "class": "gate"
    },
    {
        "id": "link-alpha-18109e81be8a4bb03aab-alpha-959a09b50fa701a712c1",
        "fromSystemId": "alpha-18109e81be8a4bb03aab",
        "toSystemId": "alpha-959a09b50fa701a712c1",
        "class": "base"
    },
    {
        "id": "link-alpha-18109e81be8a4bb03aab-alpha-cb99bd5dc79079de04f8",
        "fromSystemId": "alpha-18109e81be8a4bb03aab",
        "toSystemId": "alpha-cb99bd5dc79079de04f8",
        "class": "base"
    },
    {
        "id": "link-alpha-18109e81be8a4bb03aab-alpha-9c5f095a406cae00e02e",
        "fromSystemId": "alpha-18109e81be8a4bb03aab",
        "toSystemId": "alpha-9c5f095a406cae00e02e",
        "class": "base"
    },
    {
        "id": "link-alpha-1acb646b529592834b59-alpha-f7fbf720a5a959ca3485",
        "fromSystemId": "alpha-1acb646b529592834b59",
        "toSystemId": "alpha-f7fbf720a5a959ca3485",
        "class": "gate"
    },
    {
        "id": "link-alpha-10fae8cf89590243337b-alpha-00878ac605304517fcf1",
        "fromSystemId": "alpha-10fae8cf89590243337b",
        "toSystemId": "alpha-00878ac605304517fcf1",
        "class": "base"
    },
    {
        "id": "link-alpha-e57bea6eb8b32ca91823-alpha-7dfdd0eb2c003caf125a",
        "fromSystemId": "alpha-e57bea6eb8b32ca91823",
        "toSystemId": "alpha-7dfdd0eb2c003caf125a",
        "class": "base"
    },
    {
        "id": "link-alpha-c3fd1fb4c112be530803-alpha-f7fd7a7f0ce6e0565f0c",
        "fromSystemId": "alpha-c3fd1fb4c112be530803",
        "toSystemId": "alpha-f7fd7a7f0ce6e0565f0c",
        "class": "base"
    },
    {
        "id": "link-alpha-c3fd1fb4c112be530803-alpha-6897a07a2c13440a46d7",
        "fromSystemId": "alpha-c3fd1fb4c112be530803",
        "toSystemId": "alpha-6897a07a2c13440a46d7",
        "class": "base"
    },
    {
        "id": "link-alpha-1ec3d07e8aa8f591f2d3-alpha-50fbd1557c5b56dc87fa",
        "fromSystemId": "alpha-1ec3d07e8aa8f591f2d3",
        "toSystemId": "alpha-50fbd1557c5b56dc87fa",
        "class": "base"
    },
    {
        "id": "link-alpha-1ec3d07e8aa8f591f2d3-alpha-5c74d3ed7df81fde8bab",
        "fromSystemId": "alpha-1ec3d07e8aa8f591f2d3",
        "toSystemId": "alpha-5c74d3ed7df81fde8bab",
        "class": "base"
    },
    {
        "id": "link-alpha-1ec3d07e8aa8f591f2d3-alpha-2bcbc34b64aa06f44e57",
        "fromSystemId": "alpha-1ec3d07e8aa8f591f2d3",
        "toSystemId": "alpha-2bcbc34b64aa06f44e57",
        "class": "base"
    },
    {
        "id": "link-alpha-8bfbb8fd552f8acf462f-alpha-beea8431a468fde791e4",
        "fromSystemId": "alpha-8bfbb8fd552f8acf462f",
        "toSystemId": "alpha-beea8431a468fde791e4",
        "class": "base"
    },
    {
        "id": "link-alpha-dcceae93af2cee689c3d-alpha-2c43e5f027efa31149a4",
        "fromSystemId": "alpha-dcceae93af2cee689c3d",
        "toSystemId": "alpha-2c43e5f027efa31149a4",
        "class": "base"
    },
    {
        "id": "link-alpha-9ac1cf4cc2e559fa5ab1-alpha-8a40511158412f567b03",
        "fromSystemId": "alpha-9ac1cf4cc2e559fa5ab1",
        "toSystemId": "alpha-8a40511158412f567b03",
        "class": "base"
    },
    {
        "id": "link-alpha-b51aa651102346de66b9-alpha-26d168eb718a2f71d9e3",
        "fromSystemId": "alpha-b51aa651102346de66b9",
        "toSystemId": "alpha-26d168eb718a2f71d9e3",
        "class": "base"
    },
    {
        "id": "link-alpha-b51aa651102346de66b9-alpha-a23ccc19631de6c1af51",
        "fromSystemId": "alpha-b51aa651102346de66b9",
        "toSystemId": "alpha-a23ccc19631de6c1af51",
        "class": "gate"
    },
    {
        "id": "link-alpha-782feae03506829e3c7e-alpha-6cba4294b94d7d7932c8",
        "fromSystemId": "alpha-782feae03506829e3c7e",
        "toSystemId": "alpha-6cba4294b94d7d7932c8",
        "class": "base"
    },
    {
        "id": "link-alpha-782feae03506829e3c7e-alpha-2bd1a5fe96a34ca33eca",
        "fromSystemId": "alpha-782feae03506829e3c7e",
        "toSystemId": "alpha-2bd1a5fe96a34ca33eca",
        "class": "base"
    },
    {
        "id": "link-alpha-2aa105d8907b9d002b68-alpha-b7b04e022e8a9ba61ae5",
        "fromSystemId": "alpha-2aa105d8907b9d002b68",
        "toSystemId": "alpha-b7b04e022e8a9ba61ae5",
        "class": "base"
    },
    {
        "id": "link-alpha-2aa105d8907b9d002b68-alpha-f355340cef8c83ceed83",
        "fromSystemId": "alpha-2aa105d8907b9d002b68",
        "toSystemId": "alpha-f355340cef8c83ceed83",
        "class": "base"
    },
    {
        "id": "link-alpha-aa36c683d4a7122e297c-alpha-4311b6f81dedf12e0c2c",
        "fromSystemId": "alpha-aa36c683d4a7122e297c",
        "toSystemId": "alpha-4311b6f81dedf12e0c2c",
        "class": "base"
    },
    {
        "id": "link-alpha-f7fbf720a5a959ca3485-alpha-1acb646b529592834b59",
        "fromSystemId": "alpha-f7fbf720a5a959ca3485",
        "toSystemId": "alpha-1acb646b529592834b59",
        "class": "gate"
    },
    {
        "id": "link-alpha-f7fbf720a5a959ca3485-alpha-fa0b1dffda00ef2f632e",
        "fromSystemId": "alpha-f7fbf720a5a959ca3485",
        "toSystemId": "alpha-fa0b1dffda00ef2f632e",
        "class": "base"
    },
    {
        "id": "link-alpha-db9639818642df50f902-alpha-7065e4bfb85c49197e1e",
        "fromSystemId": "alpha-db9639818642df50f902",
        "toSystemId": "alpha-7065e4bfb85c49197e1e",
        "class": "gate"
    },
    {
        "id": "link-alpha-db9639818642df50f902-alpha-1709cb70fb36dacc5834",
        "fromSystemId": "alpha-db9639818642df50f902",
        "toSystemId": "alpha-1709cb70fb36dacc5834",
        "class": "gate"
    },
    {
        "id": "link-alpha-db9639818642df50f902-alpha-34e03bcf49937a7edbb9",
        "fromSystemId": "alpha-db9639818642df50f902",
        "toSystemId": "alpha-34e03bcf49937a7edbb9",
        "class": "gate"
    },
    {
        "id": "link-alpha-50fbd1557c5b56dc87fa-alpha-1ec3d07e8aa8f591f2d3",
        "fromSystemId": "alpha-50fbd1557c5b56dc87fa",
        "toSystemId": "alpha-1ec3d07e8aa8f591f2d3",
        "class": "gate"
    },
    {
        "id": "link-alpha-2bcbc34b64aa06f44e57-alpha-414232c001f7eb326b61",
        "fromSystemId": "alpha-2bcbc34b64aa06f44e57",
        "toSystemId": "alpha-414232c001f7eb326b61",
        "class": "gate"
    },
    {
        "id": "link-alpha-a212bbc325df7b2dbb21-alpha-275436a4333557bd8558",
        "fromSystemId": "alpha-a212bbc325df7b2dbb21",
        "toSystemId": "alpha-275436a4333557bd8558",
        "class": "base"
    },
    {
        "id": "link-alpha-a212bbc325df7b2dbb21-alpha-f355340cef8c83ceed83",
        "fromSystemId": "alpha-a212bbc325df7b2dbb21",
        "toSystemId": "alpha-f355340cef8c83ceed83",
        "class": "gate"
    },
    {
        "id": "link-alpha-a212bbc325df7b2dbb21-alpha-2aa105d8907b9d002b68",
        "fromSystemId": "alpha-a212bbc325df7b2dbb21",
        "toSystemId": "alpha-2aa105d8907b9d002b68",
        "class": "base"
    },
    {
        "id": "link-alpha-f7fd7a7f0ce6e0565f0c-alpha-c3fd1fb4c112be530803",
        "fromSystemId": "alpha-f7fd7a7f0ce6e0565f0c",
        "toSystemId": "alpha-c3fd1fb4c112be530803",
        "class": "base"
    },
    {
        "id": "link-alpha-f7fd7a7f0ce6e0565f0c-alpha-6897a07a2c13440a46d7",
        "fromSystemId": "alpha-f7fd7a7f0ce6e0565f0c",
        "toSystemId": "alpha-6897a07a2c13440a46d7",
        "class": "base"
    },
    {
        "id": "link-alpha-f7fd7a7f0ce6e0565f0c-alpha-6e25d4c0d8f819351779",
        "fromSystemId": "alpha-f7fd7a7f0ce6e0565f0c",
        "toSystemId": "alpha-6e25d4c0d8f819351779",
        "class": "base"
    },
    {
        "id": "link-alpha-b3312d2d9c677aef75db-alpha-618860964f60b00fdf8e",
        "fromSystemId": "alpha-b3312d2d9c677aef75db",
        "toSystemId": "alpha-618860964f60b00fdf8e",
        "class": "base"
    },
    {
        "id": "link-alpha-d53ed5974db2feb09944-alpha-06be2bbb727c940eaa69",
        "fromSystemId": "alpha-d53ed5974db2feb09944",
        "toSystemId": "alpha-06be2bbb727c940eaa69",
        "class": "gate"
    },
    {
        "id": "link-alpha-8a40511158412f567b03-alpha-9ac1cf4cc2e559fa5ab1",
        "fromSystemId": "alpha-8a40511158412f567b03",
        "toSystemId": "alpha-9ac1cf4cc2e559fa5ab1",
        "class": "base"
    },
    {
        "id": "link-alpha-8a40511158412f567b03-alpha-4ba4ca6a33d9f625e77b",
        "fromSystemId": "alpha-8a40511158412f567b03",
        "toSystemId": "alpha-4ba4ca6a33d9f625e77b",
        "class": "base"
    },
    {
        "id": "link-alpha-8a40511158412f567b03-alpha-b4f71ffbd6f247d6941d",
        "fromSystemId": "alpha-8a40511158412f567b03",
        "toSystemId": "alpha-b4f71ffbd6f247d6941d",
        "class": "gate"
    },
    {
        "id": "link-alpha-2eaba9e9cd66cd3ab7e3-alpha-3ed956ee2cf7fe6190bf",
        "fromSystemId": "alpha-2eaba9e9cd66cd3ab7e3",
        "toSystemId": "alpha-3ed956ee2cf7fe6190bf",
        "class": "gate"
    },
    {
        "id": "link-alpha-2eaba9e9cd66cd3ab7e3-alpha-77713d288e967f3dd906",
        "fromSystemId": "alpha-2eaba9e9cd66cd3ab7e3",
        "toSystemId": "alpha-77713d288e967f3dd906",
        "class": "base"
    },
    {
        "id": "link-alpha-4311b6f81dedf12e0c2c-alpha-aa36c683d4a7122e297c",
        "fromSystemId": "alpha-4311b6f81dedf12e0c2c",
        "toSystemId": "alpha-aa36c683d4a7122e297c",
        "class": "base"
    },
    {
        "id": "link-alpha-4311b6f81dedf12e0c2c-alpha-f326b9e042fa6bdef906",
        "fromSystemId": "alpha-4311b6f81dedf12e0c2c",
        "toSystemId": "alpha-f326b9e042fa6bdef906",
        "class": "gate"
    },
    {
        "id": "link-alpha-4311b6f81dedf12e0c2c-alpha-5b34961e18bb6fd14903",
        "fromSystemId": "alpha-4311b6f81dedf12e0c2c",
        "toSystemId": "alpha-5b34961e18bb6fd14903",
        "class": "base"
    },
    {
        "id": "link-alpha-7dfdd0eb2c003caf125a-alpha-e57bea6eb8b32ca91823",
        "fromSystemId": "alpha-7dfdd0eb2c003caf125a",
        "toSystemId": "alpha-e57bea6eb8b32ca91823",
        "class": "base"
    },
    {
        "id": "link-alpha-34e03bcf49937a7edbb9-alpha-1709cb70fb36dacc5834",
        "fromSystemId": "alpha-34e03bcf49937a7edbb9",
        "toSystemId": "alpha-1709cb70fb36dacc5834",
        "class": "gate"
    },
    {
        "id": "link-alpha-261a72d2de2156ed6228-alpha-b7b04e022e8a9ba61ae5",
        "fromSystemId": "alpha-261a72d2de2156ed6228",
        "toSystemId": "alpha-b7b04e022e8a9ba61ae5",
        "class": "base"
    },
    {
        "id": "link-alpha-261a72d2de2156ed6228-alpha-ba27a3bd8bc12baa5ca6",
        "fromSystemId": "alpha-261a72d2de2156ed6228",
        "toSystemId": "alpha-ba27a3bd8bc12baa5ca6",
        "class": "base"
    },
    {
        "id": "link-alpha-261a72d2de2156ed6228-alpha-085812f4e511189ad9ad",
        "fromSystemId": "alpha-261a72d2de2156ed6228",
        "toSystemId": "alpha-085812f4e511189ad9ad",
        "class": "base"
    },
    {
        "id": "link-alpha-b7b04e022e8a9ba61ae5-alpha-261a72d2de2156ed6228",
        "fromSystemId": "alpha-b7b04e022e8a9ba61ae5",
        "toSystemId": "alpha-261a72d2de2156ed6228",
        "class": "base"
    },
    {
        "id": "link-alpha-b7b04e022e8a9ba61ae5-alpha-2aa105d8907b9d002b68",
        "fromSystemId": "alpha-b7b04e022e8a9ba61ae5",
        "toSystemId": "alpha-2aa105d8907b9d002b68",
        "class": "base"
    },
    {
        "id": "link-alpha-b7b04e022e8a9ba61ae5-alpha-ba27a3bd8bc12baa5ca6",
        "fromSystemId": "alpha-b7b04e022e8a9ba61ae5",
        "toSystemId": "alpha-ba27a3bd8bc12baa5ca6",
        "class": "base"
    },
    {
        "id": "link-alpha-ccb04e698861a41cf87c-alpha-26d168eb718a2f71d9e3",
        "fromSystemId": "alpha-ccb04e698861a41cf87c",
        "toSystemId": "alpha-26d168eb718a2f71d9e3",
        "class": "gate"
    },
    {
        "id": "link-alpha-ccb04e698861a41cf87c-alpha-9118700d09dd16a37dae",
        "fromSystemId": "alpha-ccb04e698861a41cf87c",
        "toSystemId": "alpha-9118700d09dd16a37dae",
        "class": "base"
    },
    {
        "id": "link-alpha-ccb04e698861a41cf87c-alpha-b51aa651102346de66b9",
        "fromSystemId": "alpha-ccb04e698861a41cf87c",
        "toSystemId": "alpha-b51aa651102346de66b9",
        "class": "base"
    },
    {
        "id": "link-alpha-ac4c542940131472a01d-alpha-766bc8d1e933809eff63",
        "fromSystemId": "alpha-ac4c542940131472a01d",
        "toSystemId": "alpha-766bc8d1e933809eff63",
        "class": "base"
    },
    {
        "id": "link-alpha-046f8a1c67d1e85e6d67-alpha-275436a4333557bd8558",
        "fromSystemId": "alpha-046f8a1c67d1e85e6d67",
        "toSystemId": "alpha-275436a4333557bd8558",
        "class": "base"
    },
    {
        "id": "link-alpha-4ba4ca6a33d9f625e77b-alpha-9ac1cf4cc2e559fa5ab1",
        "fromSystemId": "alpha-4ba4ca6a33d9f625e77b",
        "toSystemId": "alpha-9ac1cf4cc2e559fa5ab1",
        "class": "base"
    },
    {
        "id": "link-alpha-4ba4ca6a33d9f625e77b-alpha-bfce419f3db68c99a5d5",
        "fromSystemId": "alpha-4ba4ca6a33d9f625e77b",
        "toSystemId": "alpha-bfce419f3db68c99a5d5",
        "class": "base"
    },
    {
        "id": "link-alpha-3d820954f227ec2b3091-alpha-beea8431a468fde791e4",
        "fromSystemId": "alpha-3d820954f227ec2b3091",
        "toSystemId": "alpha-beea8431a468fde791e4",
        "class": "base"
    },
    {
        "id": "link-alpha-3d820954f227ec2b3091-alpha-3b415e894aec8b9784d8",
        "fromSystemId": "alpha-3d820954f227ec2b3091",
        "toSystemId": "alpha-3b415e894aec8b9784d8",
        "class": "base"
    },
    {
        "id": "link-alpha-2c43e5f027efa31149a4-alpha-dcceae93af2cee689c3d",
        "fromSystemId": "alpha-2c43e5f027efa31149a4",
        "toSystemId": "alpha-dcceae93af2cee689c3d",
        "class": "base"
    },
    {
        "id": "link-alpha-2c43e5f027efa31149a4-alpha-fdc1d85697e1cfb20980",
        "fromSystemId": "alpha-2c43e5f027efa31149a4",
        "toSystemId": "alpha-fdc1d85697e1cfb20980",
        "class": "base"
    },
    {
        "id": "link-alpha-5bb669c4f6863fd34440-alpha-8d0ab4f97c5c755ae21c",
        "fromSystemId": "alpha-5bb669c4f6863fd34440",
        "toSystemId": "alpha-8d0ab4f97c5c755ae21c",
        "class": "gate"
    },
    {
        "id": "link-alpha-5bb669c4f6863fd34440-alpha-375cd7dcede25c802a67",
        "fromSystemId": "alpha-5bb669c4f6863fd34440",
        "toSystemId": "alpha-375cd7dcede25c802a67",
        "class": "base"
    },
    {
        "id": "link-alpha-5bb669c4f6863fd34440-alpha-00878ac605304517fcf1",
        "fromSystemId": "alpha-5bb669c4f6863fd34440",
        "toSystemId": "alpha-00878ac605304517fcf1",
        "class": "base"
    },
    {
        "id": "link-alpha-414232c001f7eb326b61-alpha-2bcbc34b64aa06f44e57",
        "fromSystemId": "alpha-414232c001f7eb326b61",
        "toSystemId": "alpha-2bcbc34b64aa06f44e57",
        "class": "gate"
    },
    {
        "id": "link-alpha-414232c001f7eb326b61-alpha-fe1c7b05cd1af6875424",
        "fromSystemId": "alpha-414232c001f7eb326b61",
        "toSystemId": "alpha-fe1c7b05cd1af6875424",
        "class": "base"
    },
    {
        "id": "link-alpha-7bb54be5b2571bcab8fd-alpha-5c74d3ed7df81fde8bab",
        "fromSystemId": "alpha-7bb54be5b2571bcab8fd",
        "toSystemId": "alpha-5c74d3ed7df81fde8bab",
        "class": "base"
    },
    {
        "id": "link-alpha-7bb54be5b2571bcab8fd-alpha-b408e4b93d1a64ac5080",
        "fromSystemId": "alpha-7bb54be5b2571bcab8fd",
        "toSystemId": "alpha-b408e4b93d1a64ac5080",
        "class": "base"
    },
    {
        "id": "link-alpha-7bb54be5b2571bcab8fd-alpha-50fbd1557c5b56dc87fa",
        "fromSystemId": "alpha-7bb54be5b2571bcab8fd",
        "toSystemId": "alpha-50fbd1557c5b56dc87fa",
        "class": "base"
    },
    {
        "id": "link-alpha-fa0b1dffda00ef2f632e-alpha-f7fbf720a5a959ca3485",
        "fromSystemId": "alpha-fa0b1dffda00ef2f632e",
        "toSystemId": "alpha-f7fbf720a5a959ca3485",
        "class": "base"
    },
    {
        "id": "link-alpha-fa0b1dffda00ef2f632e-alpha-be4002f65035772ac947",
        "fromSystemId": "alpha-fa0b1dffda00ef2f632e",
        "toSystemId": "alpha-be4002f65035772ac947",
        "class": "base"
    },
    {
        "id": "link-alpha-fa0b1dffda00ef2f632e-alpha-e57bea6eb8b32ca91823",
        "fromSystemId": "alpha-fa0b1dffda00ef2f632e",
        "toSystemId": "alpha-e57bea6eb8b32ca91823",
        "class": "base"
    },
    {
        "id": "link-alpha-6e25d4c0d8f819351779-alpha-6897a07a2c13440a46d7",
        "fromSystemId": "alpha-6e25d4c0d8f819351779",
        "toSystemId": "alpha-6897a07a2c13440a46d7",
        "class": "base"
    },
    {
        "id": "link-alpha-2bd1a5fe96a34ca33eca-alpha-fe148b9a69a680fa14a3",
        "fromSystemId": "alpha-2bd1a5fe96a34ca33eca",
        "toSystemId": "alpha-fe148b9a69a680fa14a3",
        "class": "base"
    },
    {
        "id": "link-alpha-be4002f65035772ac947-alpha-f355340cef8c83ceed83",
        "fromSystemId": "alpha-be4002f65035772ac947",
        "toSystemId": "alpha-f355340cef8c83ceed83",
        "class": "gate"
    },
    {
        "id": "link-alpha-be4002f65035772ac947-alpha-fa0b1dffda00ef2f632e",
        "fromSystemId": "alpha-be4002f65035772ac947",
        "toSystemId": "alpha-fa0b1dffda00ef2f632e",
        "class": "base"
    },
    {
        "id": "link-alpha-be4002f65035772ac947-alpha-2aa105d8907b9d002b68",
        "fromSystemId": "alpha-be4002f65035772ac947",
        "toSystemId": "alpha-2aa105d8907b9d002b68",
        "class": "base"
    },
    {
        "id": "link-alpha-9c5f095a406cae00e02e-alpha-959a09b50fa701a712c1",
        "fromSystemId": "alpha-9c5f095a406cae00e02e",
        "toSystemId": "alpha-959a09b50fa701a712c1",
        "class": "base"
    },
    {
        "id": "link-alpha-9c5f095a406cae00e02e-alpha-18109e81be8a4bb03aab",
        "fromSystemId": "alpha-9c5f095a406cae00e02e",
        "toSystemId": "alpha-18109e81be8a4bb03aab",
        "class": "gate"
    },
    {
        "id": "link-alpha-9c5f095a406cae00e02e-alpha-a008ac6571e67969b423",
        "fromSystemId": "alpha-9c5f095a406cae00e02e",
        "toSystemId": "alpha-a008ac6571e67969b423",
        "class": "base"
    },
    {
        "id": "link-alpha-00878ac605304517fcf1-alpha-10fae8cf89590243337b",
        "fromSystemId": "alpha-00878ac605304517fcf1",
        "toSystemId": "alpha-10fae8cf89590243337b",
        "class": "gate"
    },
    {
        "id": "link-alpha-00878ac605304517fcf1-alpha-375cd7dcede25c802a67",
        "fromSystemId": "alpha-00878ac605304517fcf1",
        "toSystemId": "alpha-375cd7dcede25c802a67",
        "class": "gate"
    },
    {
        "id": "link-alpha-beea8431a468fde791e4-alpha-3d820954f227ec2b3091",
        "fromSystemId": "alpha-beea8431a468fde791e4",
        "toSystemId": "alpha-3d820954f227ec2b3091",
        "class": "base"
    },
    {
        "id": "link-alpha-beea8431a468fde791e4-alpha-3b415e894aec8b9784d8",
        "fromSystemId": "alpha-beea8431a468fde791e4",
        "toSystemId": "alpha-3b415e894aec8b9784d8",
        "class": "base"
    },
    {
        "id": "link-alpha-beea8431a468fde791e4-alpha-8bfbb8fd552f8acf462f",
        "fromSystemId": "alpha-beea8431a468fde791e4",
        "toSystemId": "alpha-8bfbb8fd552f8acf462f",
        "class": "base"
    },
    {
        "id": "link-alpha-322c8510c2a7803f4f62-alpha-618860964f60b00fdf8e",
        "fromSystemId": "alpha-322c8510c2a7803f4f62",
        "toSystemId": "alpha-618860964f60b00fdf8e",
        "class": "gate"
    },
    {
        "id": "link-alpha-b408e4b93d1a64ac5080-alpha-7bb54be5b2571bcab8fd",
        "fromSystemId": "alpha-b408e4b93d1a64ac5080",
        "toSystemId": "alpha-7bb54be5b2571bcab8fd",
        "class": "gate"
    },
    {
        "id": "link-alpha-b408e4b93d1a64ac5080-alpha-8bfbb8fd552f8acf462f",
        "fromSystemId": "alpha-b408e4b93d1a64ac5080",
        "toSystemId": "alpha-8bfbb8fd552f8acf462f",
        "class": "base"
    },
    {
        "id": "link-alpha-9114d4daa712ba370227-alpha-ba89e04b1daca093eaa4",
        "fromSystemId": "alpha-9114d4daa712ba370227",
        "toSystemId": "alpha-ba89e04b1daca093eaa4",
        "class": "base"
    },
    {
        "id": "link-alpha-9114d4daa712ba370227-alpha-47f96874edc7ecf5332b",
        "fromSystemId": "alpha-9114d4daa712ba370227",
        "toSystemId": "alpha-47f96874edc7ecf5332b",
        "class": "gate"
    },
    {
        "id": "link-alpha-618860964f60b00fdf8e-alpha-322c8510c2a7803f4f62",
        "fromSystemId": "alpha-618860964f60b00fdf8e",
        "toSystemId": "alpha-322c8510c2a7803f4f62",
        "class": "base"
    },
    {
        "id": "link-alpha-e7d2277ef6ade0bd5818-alpha-fe148b9a69a680fa14a3",
        "fromSystemId": "alpha-e7d2277ef6ade0bd5818",
        "toSystemId": "alpha-fe148b9a69a680fa14a3",
        "class": "base"
    },
    {
        "id": "link-alpha-64b330bd4dcf42685da7-alpha-f6a828edd40e2d736209",
        "fromSystemId": "alpha-64b330bd4dcf42685da7",
        "toSystemId": "alpha-f6a828edd40e2d736209",
        "class": "gate"
    },
    {
        "id": "link-alpha-c5f83db2f6f7691379a0-alpha-fe1c7b05cd1af6875424",
        "fromSystemId": "alpha-c5f83db2f6f7691379a0",
        "toSystemId": "alpha-fe1c7b05cd1af6875424",
        "class": "base"
    },
    {
        "id": "link-alpha-c5f83db2f6f7691379a0-alpha-414232c001f7eb326b61",
        "fromSystemId": "alpha-c5f83db2f6f7691379a0",
        "toSystemId": "alpha-414232c001f7eb326b61",
        "class": "gate"
    },
    {
        "id": "link-alpha-2d2228bab8907fc0fae4-alpha-3b415e894aec8b9784d8",
        "fromSystemId": "alpha-2d2228bab8907fc0fae4",
        "toSystemId": "alpha-3b415e894aec8b9784d8",
        "class": "gate"
    },
    {
        "id": "link-alpha-2d2228bab8907fc0fae4-alpha-3d820954f227ec2b3091",
        "fromSystemId": "alpha-2d2228bab8907fc0fae4",
        "toSystemId": "alpha-3d820954f227ec2b3091",
        "class": "base"
    },
    {
        "id": "link-alpha-2d2228bab8907fc0fae4-alpha-06be2bbb727c940eaa69",
        "fromSystemId": "alpha-2d2228bab8907fc0fae4",
        "toSystemId": "alpha-06be2bbb727c940eaa69",
        "class": "gate"
    },
    {
        "id": "link-alpha-06be2bbb727c940eaa69-alpha-3b415e894aec8b9784d8",
        "fromSystemId": "alpha-06be2bbb727c940eaa69",
        "toSystemId": "alpha-3b415e894aec8b9784d8",
        "class": "base"
    },
    {
        "id": "link-alpha-ba27a3bd8bc12baa5ca6-alpha-261a72d2de2156ed6228",
        "fromSystemId": "alpha-ba27a3bd8bc12baa5ca6",
        "toSystemId": "alpha-261a72d2de2156ed6228",
        "class": "base"
    },
    {
        "id": "link-alpha-ba27a3bd8bc12baa5ca6-alpha-b7b04e022e8a9ba61ae5",
        "fromSystemId": "alpha-ba27a3bd8bc12baa5ca6",
        "toSystemId": "alpha-b7b04e022e8a9ba61ae5",
        "class": "base"
    },
    {
        "id": "link-alpha-275436a4333557bd8558-alpha-a212bbc325df7b2dbb21",
        "fromSystemId": "alpha-275436a4333557bd8558",
        "toSystemId": "alpha-a212bbc325df7b2dbb21",
        "class": "base"
    },
    {
        "id": "link-alpha-26d168eb718a2f71d9e3-alpha-b51aa651102346de66b9",
        "fromSystemId": "alpha-26d168eb718a2f71d9e3",
        "toSystemId": "alpha-b51aa651102346de66b9",
        "class": "gate"
    },
    {
        "id": "link-alpha-f326b9e042fa6bdef906-alpha-4311b6f81dedf12e0c2c",
        "fromSystemId": "alpha-f326b9e042fa6bdef906",
        "toSystemId": "alpha-4311b6f81dedf12e0c2c",
        "class": "gate"
    },
    {
        "id": "link-alpha-f326b9e042fa6bdef906-alpha-aa36c683d4a7122e297c",
        "fromSystemId": "alpha-f326b9e042fa6bdef906",
        "toSystemId": "alpha-aa36c683d4a7122e297c",
        "class": "gate"
    },
    {
        "id": "link-alpha-f326b9e042fa6bdef906-alpha-5b34961e18bb6fd14903",
        "fromSystemId": "alpha-f326b9e042fa6bdef906",
        "toSystemId": "alpha-5b34961e18bb6fd14903",
        "class": "base"
    },
    {
        "id": "link-alpha-62294315db6d7b6ee1fa-alpha-782feae03506829e3c7e",
        "fromSystemId": "alpha-62294315db6d7b6ee1fa",
        "toSystemId": "alpha-782feae03506829e3c7e",
        "class": "base"
    },
    {
        "id": "link-alpha-62294315db6d7b6ee1fa-alpha-e7d2277ef6ade0bd5818",
        "fromSystemId": "alpha-62294315db6d7b6ee1fa",
        "toSystemId": "alpha-e7d2277ef6ade0bd5818",
        "class": "base"
    },
    {
        "id": "link-alpha-62294315db6d7b6ee1fa-alpha-2bd1a5fe96a34ca33eca",
        "fromSystemId": "alpha-62294315db6d7b6ee1fa",
        "toSystemId": "alpha-2bd1a5fe96a34ca33eca",
        "class": "base"
    },
    {
        "id": "link-alpha-8d0ab4f97c5c755ae21c-alpha-5bb669c4f6863fd34440",
        "fromSystemId": "alpha-8d0ab4f97c5c755ae21c",
        "toSystemId": "alpha-5bb669c4f6863fd34440",
        "class": "base"
    },
    {
        "id": "link-alpha-bb493903a82b682a09b7-alpha-77713d288e967f3dd906",
        "fromSystemId": "alpha-bb493903a82b682a09b7",
        "toSystemId": "alpha-77713d288e967f3dd906",
        "class": "base"
    },
    {
        "id": "link-alpha-fdc1d85697e1cfb20980-alpha-dcceae93af2cee689c3d",
        "fromSystemId": "alpha-fdc1d85697e1cfb20980",
        "toSystemId": "alpha-dcceae93af2cee689c3d",
        "class": "base"
    },
    {
        "id": "link-alpha-fdc1d85697e1cfb20980-alpha-2c43e5f027efa31149a4",
        "fromSystemId": "alpha-fdc1d85697e1cfb20980",
        "toSystemId": "alpha-2c43e5f027efa31149a4",
        "class": "base"
    },
    {
        "id": "link-alpha-fdc1d85697e1cfb20980-alpha-7dfdd0eb2c003caf125a",
        "fromSystemId": "alpha-fdc1d85697e1cfb20980",
        "toSystemId": "alpha-7dfdd0eb2c003caf125a",
        "class": "base"
    },
    {
        "id": "link-alpha-5a4e807c3b982fbdc3ff-alpha-fe148b9a69a680fa14a3",
        "fromSystemId": "alpha-5a4e807c3b982fbdc3ff",
        "toSystemId": "alpha-fe148b9a69a680fa14a3",
        "class": "gate"
    },
    {
        "id": "link-alpha-5a4e807c3b982fbdc3ff-alpha-2bd1a5fe96a34ca33eca",
        "fromSystemId": "alpha-5a4e807c3b982fbdc3ff",
        "toSystemId": "alpha-2bd1a5fe96a34ca33eca",
        "class": "base"
    },
    {
        "id": "link-alpha-3b415e894aec8b9784d8-alpha-3d820954f227ec2b3091",
        "fromSystemId": "alpha-3b415e894aec8b9784d8",
        "toSystemId": "alpha-3d820954f227ec2b3091",
        "class": "base"
    },
    {
        "id": "link-alpha-f2de59304d1bf882e9b8-alpha-fe148b9a69a680fa14a3",
        "fromSystemId": "alpha-f2de59304d1bf882e9b8",
        "toSystemId": "alpha-fe148b9a69a680fa14a3",
        "class": "base"
    },
    {
        "id": "link-alpha-a1da22f003f423b6d453-alpha-085812f4e511189ad9ad",
        "fromSystemId": "alpha-a1da22f003f423b6d453",
        "toSystemId": "alpha-085812f4e511189ad9ad",
        "class": "base"
    },
    {
        "id": "link-alpha-a1da22f003f423b6d453-alpha-64b330bd4dcf42685da7",
        "fromSystemId": "alpha-a1da22f003f423b6d453",
        "toSystemId": "alpha-64b330bd4dcf42685da7",
        "class": "base"
    },
    {
        "id": "link-alpha-a1da22f003f423b6d453-alpha-2d2228bab8907fc0fae4",
        "fromSystemId": "alpha-a1da22f003f423b6d453",
        "toSystemId": "alpha-2d2228bab8907fc0fae4",
        "class": "base"
    },
    {
        "id": "link-alpha-7065e4bfb85c49197e1e-alpha-db9639818642df50f902",
        "fromSystemId": "alpha-7065e4bfb85c49197e1e",
        "toSystemId": "alpha-db9639818642df50f902",
        "class": "base"
    },
    {
        "id": "link-alpha-5c74d3ed7df81fde8bab-alpha-1ec3d07e8aa8f591f2d3",
        "fromSystemId": "alpha-5c74d3ed7df81fde8bab",
        "toSystemId": "alpha-1ec3d07e8aa8f591f2d3",
        "class": "base"
    },
    {
        "id": "link-alpha-959a09b50fa701a712c1-alpha-18109e81be8a4bb03aab",
        "fromSystemId": "alpha-959a09b50fa701a712c1",
        "toSystemId": "alpha-18109e81be8a4bb03aab",
        "class": "base"
    },
    {
        "id": "link-alpha-959a09b50fa701a712c1-alpha-9c5f095a406cae00e02e",
        "fromSystemId": "alpha-959a09b50fa701a712c1",
        "toSystemId": "alpha-9c5f095a406cae00e02e",
        "class": "base"
    },
    {
        "id": "link-alpha-a008ac6571e67969b423-alpha-959a09b50fa701a712c1",
        "fromSystemId": "alpha-a008ac6571e67969b423",
        "toSystemId": "alpha-959a09b50fa701a712c1",
        "class": "base"
    },
    {
        "id": "link-alpha-a008ac6571e67969b423-alpha-cb99bd5dc79079de04f8",
        "fromSystemId": "alpha-a008ac6571e67969b423",
        "toSystemId": "alpha-cb99bd5dc79079de04f8",
        "class": "base"
    },
    {
        "id": "link-alpha-f355340cef8c83ceed83-alpha-a212bbc325df7b2dbb21",
        "fromSystemId": "alpha-f355340cef8c83ceed83",
        "toSystemId": "alpha-a212bbc325df7b2dbb21",
        "class": "base"
    },
    {
        "id": "link-alpha-f355340cef8c83ceed83-alpha-be4002f65035772ac947",
        "fromSystemId": "alpha-f355340cef8c83ceed83",
        "toSystemId": "alpha-be4002f65035772ac947",
        "class": "gate"
    },
    {
        "id": "link-alpha-f355340cef8c83ceed83-alpha-275436a4333557bd8558",
        "fromSystemId": "alpha-f355340cef8c83ceed83",
        "toSystemId": "alpha-275436a4333557bd8558",
        "class": "base"
    },
    {
        "id": "link-alpha-085812f4e511189ad9ad-alpha-a1da22f003f423b6d453",
        "fromSystemId": "alpha-085812f4e511189ad9ad",
        "toSystemId": "alpha-a1da22f003f423b6d453",
        "class": "base"
    },
    {
        "id": "link-alpha-b4f71ffbd6f247d6941d-alpha-9ac1cf4cc2e559fa5ab1",
        "fromSystemId": "alpha-b4f71ffbd6f247d6941d",
        "toSystemId": "alpha-9ac1cf4cc2e559fa5ab1",
        "class": "base"
    },
    {
        "id": "link-alpha-b4f71ffbd6f247d6941d-alpha-8a40511158412f567b03",
        "fromSystemId": "alpha-b4f71ffbd6f247d6941d",
        "toSystemId": "alpha-8a40511158412f567b03",
        "class": "base"
    },
    {
        "id": "link-alpha-cb99bd5dc79079de04f8-alpha-18109e81be8a4bb03aab",
        "fromSystemId": "alpha-cb99bd5dc79079de04f8",
        "toSystemId": "alpha-18109e81be8a4bb03aab",
        "class": "base"
    },
    {
        "id": "link-alpha-cb99bd5dc79079de04f8-alpha-959a09b50fa701a712c1",
        "fromSystemId": "alpha-cb99bd5dc79079de04f8",
        "toSystemId": "alpha-959a09b50fa701a712c1",
        "class": "base"
    },
    {
        "id": "link-alpha-cb99bd5dc79079de04f8-alpha-a008ac6571e67969b423",
        "fromSystemId": "alpha-cb99bd5dc79079de04f8",
        "toSystemId": "alpha-a008ac6571e67969b423",
        "class": "base"
    },
    {
        "id": "link-alpha-92675f3b6d655e340990-alpha-5b34961e18bb6fd14903",
        "fromSystemId": "alpha-92675f3b6d655e340990",
        "toSystemId": "alpha-5b34961e18bb6fd14903",
        "class": "gate"
    },
    {
        "id": "link-alpha-92675f3b6d655e340990-alpha-4311b6f81dedf12e0c2c",
        "fromSystemId": "alpha-92675f3b6d655e340990",
        "toSystemId": "alpha-4311b6f81dedf12e0c2c",
        "class": "base"
    },
    {
        "id": "link-alpha-52c2705d81d86cb8e5ed-alpha-766bc8d1e933809eff63",
        "fromSystemId": "alpha-52c2705d81d86cb8e5ed",
        "toSystemId": "alpha-766bc8d1e933809eff63",
        "class": "base"
    },
    {
        "id": "link-alpha-52c2705d81d86cb8e5ed-alpha-ac4c542940131472a01d",
        "fromSystemId": "alpha-52c2705d81d86cb8e5ed",
        "toSystemId": "alpha-ac4c542940131472a01d",
        "class": "base"
    },
    {
        "id": "link-alpha-77713d288e967f3dd906-alpha-bb493903a82b682a09b7",
        "fromSystemId": "alpha-77713d288e967f3dd906",
        "toSystemId": "alpha-bb493903a82b682a09b7",
        "class": "base"
    },
    {
        "id": "link-alpha-77713d288e967f3dd906-alpha-f7fbf720a5a959ca3485",
        "fromSystemId": "alpha-77713d288e967f3dd906",
        "toSystemId": "alpha-f7fbf720a5a959ca3485",
        "class": "base"
    },
    {
        "id": "link-alpha-375cd7dcede25c802a67-alpha-5bb669c4f6863fd34440",
        "fromSystemId": "alpha-375cd7dcede25c802a67",
        "toSystemId": "alpha-5bb669c4f6863fd34440",
        "class": "base"
    },
    {
        "id": "link-alpha-375cd7dcede25c802a67-alpha-8d0ab4f97c5c755ae21c",
        "fromSystemId": "alpha-375cd7dcede25c802a67",
        "toSystemId": "alpha-8d0ab4f97c5c755ae21c",
        "class": "gate"
    },
    {
        "id": "link-alpha-375cd7dcede25c802a67-alpha-00878ac605304517fcf1",
        "fromSystemId": "alpha-375cd7dcede25c802a67",
        "toSystemId": "alpha-00878ac605304517fcf1",
        "class": "gate"
    },
    {
        "id": "link-alpha-6897a07a2c13440a46d7-alpha-6e25d4c0d8f819351779",
        "fromSystemId": "alpha-6897a07a2c13440a46d7",
        "toSystemId": "alpha-6e25d4c0d8f819351779",
        "class": "base"
    },
    {
        "id": "link-alpha-6897a07a2c13440a46d7-alpha-f7fd7a7f0ce6e0565f0c",
        "fromSystemId": "alpha-6897a07a2c13440a46d7",
        "toSystemId": "alpha-f7fd7a7f0ce6e0565f0c",
        "class": "base"
    },
    {
        "id": "link-alpha-6897a07a2c13440a46d7-alpha-c3fd1fb4c112be530803",
        "fromSystemId": "alpha-6897a07a2c13440a46d7",
        "toSystemId": "alpha-c3fd1fb4c112be530803",
        "class": "base"
    },
    {
        "id": "link-alpha-1709cb70fb36dacc5834-alpha-db9639818642df50f902",
        "fromSystemId": "alpha-1709cb70fb36dacc5834",
        "toSystemId": "alpha-db9639818642df50f902",
        "class": "base"
    },
    {
        "id": "link-alpha-1709cb70fb36dacc5834-alpha-34e03bcf49937a7edbb9",
        "fromSystemId": "alpha-1709cb70fb36dacc5834",
        "toSystemId": "alpha-34e03bcf49937a7edbb9",
        "class": "base"
    },
    {
        "id": "link-alpha-ef5a38ae451f125ea804-alpha-b3312d2d9c677aef75db",
        "fromSystemId": "alpha-ef5a38ae451f125ea804",
        "toSystemId": "alpha-b3312d2d9c677aef75db",
        "class": "base"
    },
    {
        "id": "link-alpha-ef5a38ae451f125ea804-alpha-955d12e6f38659750111",
        "fromSystemId": "alpha-ef5a38ae451f125ea804",
        "toSystemId": "alpha-955d12e6f38659750111",
        "class": "gate"
    },
    {
        "id": "link-alpha-ef5a38ae451f125ea804-alpha-618860964f60b00fdf8e",
        "fromSystemId": "alpha-ef5a38ae451f125ea804",
        "toSystemId": "alpha-618860964f60b00fdf8e",
        "class": "base"
    },
    {
        "id": "link-alpha-ba89e04b1daca093eaa4-alpha-dcceae93af2cee689c3d",
        "fromSystemId": "alpha-ba89e04b1daca093eaa4",
        "toSystemId": "alpha-dcceae93af2cee689c3d",
        "class": "base"
    },
    {
        "id": "link-alpha-ba89e04b1daca093eaa4-alpha-ba27a3bd8bc12baa5ca6",
        "fromSystemId": "alpha-ba89e04b1daca093eaa4",
        "toSystemId": "alpha-ba27a3bd8bc12baa5ca6",
        "class": "base"
    },
    {
        "id": "link-alpha-0b46a0bec05790fc13c4-alpha-322c8510c2a7803f4f62",
        "fromSystemId": "alpha-0b46a0bec05790fc13c4",
        "toSystemId": "alpha-322c8510c2a7803f4f62",
        "class": "base"
    },
    {
        "id": "link-alpha-0b46a0bec05790fc13c4-alpha-618860964f60b00fdf8e",
        "fromSystemId": "alpha-0b46a0bec05790fc13c4",
        "toSystemId": "alpha-618860964f60b00fdf8e",
        "class": "base"
    },
    {
        "id": "link-alpha-0b46a0bec05790fc13c4-alpha-47f96874edc7ecf5332b",
        "fromSystemId": "alpha-0b46a0bec05790fc13c4",
        "toSystemId": "alpha-47f96874edc7ecf5332b",
        "class": "base"
    },
    {
        "id": "link-alpha-9118700d09dd16a37dae-alpha-6e25d4c0d8f819351779",
        "fromSystemId": "alpha-9118700d09dd16a37dae",
        "toSystemId": "alpha-6e25d4c0d8f819351779",
        "class": "base"
    },
    {
        "id": "link-alpha-9118700d09dd16a37dae-alpha-6897a07a2c13440a46d7",
        "fromSystemId": "alpha-9118700d09dd16a37dae",
        "toSystemId": "alpha-6897a07a2c13440a46d7",
        "class": "gate"
    },
    {
        "id": "link-alpha-fe1c7b05cd1af6875424-alpha-414232c001f7eb326b61",
        "fromSystemId": "alpha-fe1c7b05cd1af6875424",
        "toSystemId": "alpha-414232c001f7eb326b61",
        "class": "base"
    },
    {
        "id": "link-alpha-fe1c7b05cd1af6875424-alpha-2bcbc34b64aa06f44e57",
        "fromSystemId": "alpha-fe1c7b05cd1af6875424",
        "toSystemId": "alpha-2bcbc34b64aa06f44e57",
        "class": "base"
    },
    {
        "id": "link-alpha-fe1c7b05cd1af6875424-alpha-1ec3d07e8aa8f591f2d3",
        "fromSystemId": "alpha-fe1c7b05cd1af6875424",
        "toSystemId": "alpha-1ec3d07e8aa8f591f2d3",
        "class": "base"
    },
    {
        "id": "link-alpha-bfce419f3db68c99a5d5-alpha-4ba4ca6a33d9f625e77b",
        "fromSystemId": "alpha-bfce419f3db68c99a5d5",
        "toSystemId": "alpha-4ba4ca6a33d9f625e77b",
        "class": "base"
    },
    {
        "id": "link-alpha-bfce419f3db68c99a5d5-alpha-9ac1cf4cc2e559fa5ab1",
        "fromSystemId": "alpha-bfce419f3db68c99a5d5",
        "toSystemId": "alpha-9ac1cf4cc2e559fa5ab1",
        "class": "gate"
    },
    {
        "id": "link-alpha-955d12e6f38659750111-alpha-b3312d2d9c677aef75db",
        "fromSystemId": "alpha-955d12e6f38659750111",
        "toSystemId": "alpha-b3312d2d9c677aef75db",
        "class": "gate"
    },
    {
        "id": "link-alpha-955d12e6f38659750111-alpha-ef5a38ae451f125ea804",
        "fromSystemId": "alpha-955d12e6f38659750111",
        "toSystemId": "alpha-ef5a38ae451f125ea804",
        "class": "base"
    },
    {
        "id": "link-alpha-955d12e6f38659750111-alpha-62294315db6d7b6ee1fa",
        "fromSystemId": "alpha-955d12e6f38659750111",
        "toSystemId": "alpha-62294315db6d7b6ee1fa",
        "class": "gate"
    },
    {
        "id": "link-alpha-47f96874edc7ecf5332b-alpha-322c8510c2a7803f4f62",
        "fromSystemId": "alpha-47f96874edc7ecf5332b",
        "toSystemId": "alpha-322c8510c2a7803f4f62",
        "class": "gate"
    },
    {
        "id": "link-alpha-47f96874edc7ecf5332b-alpha-0b46a0bec05790fc13c4",
        "fromSystemId": "alpha-47f96874edc7ecf5332b",
        "toSystemId": "alpha-0b46a0bec05790fc13c4",
        "class": "base"
    },
    {
        "id": "link-alpha-6cba4294b94d7d7932c8-alpha-782feae03506829e3c7e",
        "fromSystemId": "alpha-6cba4294b94d7d7932c8",
        "toSystemId": "alpha-782feae03506829e3c7e",
        "class": "base"
    },
    {
        "id": "link-alpha-6cba4294b94d7d7932c8-alpha-2bd1a5fe96a34ca33eca",
        "fromSystemId": "alpha-6cba4294b94d7d7932c8",
        "toSystemId": "alpha-2bd1a5fe96a34ca33eca",
        "class": "gate"
    },
    {
        "id": "link-alpha-a23ccc19631de6c1af51-alpha-b51aa651102346de66b9",
        "fromSystemId": "alpha-a23ccc19631de6c1af51",
        "toSystemId": "alpha-b51aa651102346de66b9",
        "class": "gate"
    },
    {
        "id": "link-alpha-a23ccc19631de6c1af51-alpha-26d168eb718a2f71d9e3",
        "fromSystemId": "alpha-a23ccc19631de6c1af51",
        "toSystemId": "alpha-26d168eb718a2f71d9e3",
        "class": "gate"
    },
    {
        "id": "link-alpha-3ed956ee2cf7fe6190bf-alpha-2eaba9e9cd66cd3ab7e3",
        "fromSystemId": "alpha-3ed956ee2cf7fe6190bf",
        "toSystemId": "alpha-2eaba9e9cd66cd3ab7e3",
        "class": "base"
    },
    {
        "id": "link-alpha-3ed956ee2cf7fe6190bf-alpha-1acb646b529592834b59",
        "fromSystemId": "alpha-3ed956ee2cf7fe6190bf",
        "toSystemId": "alpha-1acb646b529592834b59",
        "class": "base"
    },
    {
        "id": "link-alpha-f6a828edd40e2d736209-alpha-64b330bd4dcf42685da7",
        "fromSystemId": "alpha-f6a828edd40e2d736209",
        "toSystemId": "alpha-64b330bd4dcf42685da7",
        "class": "gate"
    },
    {
        "id": "link-alpha-f6a828edd40e2d736209-alpha-d53ed5974db2feb09944",
        "fromSystemId": "alpha-f6a828edd40e2d736209",
        "toSystemId": "alpha-d53ed5974db2feb09944",
        "class": "base"
    },
    {
        "id": "link-alpha-f6a828edd40e2d736209-alpha-06be2bbb727c940eaa69",
        "fromSystemId": "alpha-f6a828edd40e2d736209",
        "toSystemId": "alpha-06be2bbb727c940eaa69",
        "class": "base"
    },
    {
        "id": "link-alpha-bf25caf698bb5d42de95-alpha-18109e81be8a4bb03aab",
        "fromSystemId": "alpha-bf25caf698bb5d42de95",
        "toSystemId": "alpha-18109e81be8a4bb03aab",
        "class": "gate"
    },
    {
        "id": "link-alpha-bf25caf698bb5d42de95-alpha-cb99bd5dc79079de04f8",
        "fromSystemId": "alpha-bf25caf698bb5d42de95",
        "toSystemId": "alpha-cb99bd5dc79079de04f8",
        "class": "base"
    },
    {
        "id": "link-alpha-766bc8d1e933809eff63-alpha-52c2705d81d86cb8e5ed",
        "fromSystemId": "alpha-766bc8d1e933809eff63",
        "toSystemId": "alpha-52c2705d81d86cb8e5ed",
        "class": "base"
    },
    {
        "id": "link-alpha-766bc8d1e933809eff63-alpha-ac4c542940131472a01d",
        "fromSystemId": "alpha-766bc8d1e933809eff63",
        "toSystemId": "alpha-ac4c542940131472a01d",
        "class": "base"
    },
    {
        "id": "link-alpha-766bc8d1e933809eff63-alpha-62294315db6d7b6ee1fa",
        "fromSystemId": "alpha-766bc8d1e933809eff63",
        "toSystemId": "alpha-62294315db6d7b6ee1fa",
        "class": "gate"
    },
    {
        "id": "link-beta-c5f8c0023d6adb25b58d-beta-855ec0bc494f210b3e8c",
        "fromSystemId": "beta-c5f8c0023d6adb25b58d",
        "toSystemId": "beta-855ec0bc494f210b3e8c",
        "class": "base"
    },
    {
        "id": "link-beta-57bb06780df12c56e136-beta-732792bb58c91a56628e",
        "fromSystemId": "beta-57bb06780df12c56e136",
        "toSystemId": "beta-732792bb58c91a56628e",
        "class": "base"
    },
    {
        "id": "link-beta-57bb06780df12c56e136-beta-820c1e701b1cc8fecdb6",
        "fromSystemId": "beta-57bb06780df12c56e136",
        "toSystemId": "beta-820c1e701b1cc8fecdb6",
        "class": "base"
    },
    {
        "id": "link-beta-57bb06780df12c56e136-beta-aec7801f5496bd6f19ea",
        "fromSystemId": "beta-57bb06780df12c56e136",
        "toSystemId": "beta-aec7801f5496bd6f19ea",
        "class": "gate"
    },
    {
        "id": "link-beta-1c57c0addeab1fc72537-beta-7a8ce6eb04f33dfbe744",
        "fromSystemId": "beta-1c57c0addeab1fc72537",
        "toSystemId": "beta-7a8ce6eb04f33dfbe744",
        "class": "base"
    },
    {
        "id": "link-beta-1c57c0addeab1fc72537-beta-a2bfe047172cf490aea9",
        "fromSystemId": "beta-1c57c0addeab1fc72537",
        "toSystemId": "beta-a2bfe047172cf490aea9",
        "class": "gate"
    },
    {
        "id": "link-beta-1c57c0addeab1fc72537-beta-2dcf36e3f880c86255d2",
        "fromSystemId": "beta-1c57c0addeab1fc72537",
        "toSystemId": "beta-2dcf36e3f880c86255d2",
        "class": "base"
    },
    {
        "id": "link-beta-55a55dfd7d579bf57f89-beta-56b0bea442819b0a79fa",
        "fromSystemId": "beta-55a55dfd7d579bf57f89",
        "toSystemId": "beta-56b0bea442819b0a79fa",
        "class": "base"
    },
    {
        "id": "link-beta-55a55dfd7d579bf57f89-beta-4f583d7245f8ec6be7fc",
        "fromSystemId": "beta-55a55dfd7d579bf57f89",
        "toSystemId": "beta-4f583d7245f8ec6be7fc",
        "class": "base"
    },
    {
        "id": "link-beta-0f247f64601e2e2c78c6-beta-4ee3f2b044243635e376",
        "fromSystemId": "beta-0f247f64601e2e2c78c6",
        "toSystemId": "beta-4ee3f2b044243635e376",
        "class": "gate"
    },
    {
        "id": "link-beta-f3c899cead828543e2cf-beta-55c58ce0dd4c30e4bbc8",
        "fromSystemId": "beta-f3c899cead828543e2cf",
        "toSystemId": "beta-55c58ce0dd4c30e4bbc8",
        "class": "base"
    },
    {
        "id": "link-beta-f3c899cead828543e2cf-beta-0f730835cc4b6ac6432f",
        "fromSystemId": "beta-f3c899cead828543e2cf",
        "toSystemId": "beta-0f730835cc4b6ac6432f",
        "class": "gate"
    },
    {
        "id": "link-beta-f3c899cead828543e2cf-beta-62ab9e657c386b4cd1de",
        "fromSystemId": "beta-f3c899cead828543e2cf",
        "toSystemId": "beta-62ab9e657c386b4cd1de",
        "class": "base"
    },
    {
        "id": "link-beta-db610ed3d41869099de0-beta-8d686d52c7e4023203d5",
        "fromSystemId": "beta-db610ed3d41869099de0",
        "toSystemId": "beta-8d686d52c7e4023203d5",
        "class": "base"
    },
    {
        "id": "link-beta-db610ed3d41869099de0-beta-54c17fa621aefdbef17c",
        "fromSystemId": "beta-db610ed3d41869099de0",
        "toSystemId": "beta-54c17fa621aefdbef17c",
        "class": "base"
    },
    {
        "id": "link-beta-2dcf36e3f880c86255d2-beta-39e3e118b4f8428f6edd",
        "fromSystemId": "beta-2dcf36e3f880c86255d2",
        "toSystemId": "beta-39e3e118b4f8428f6edd",
        "class": "gate"
    },
    {
        "id": "link-beta-b1466e1bbe4623fa659f-beta-56b0bea442819b0a79fa",
        "fromSystemId": "beta-b1466e1bbe4623fa659f",
        "toSystemId": "beta-56b0bea442819b0a79fa",
        "class": "base"
    },
    {
        "id": "link-beta-6e62dd07925158f738e3-beta-aec7801f5496bd6f19ea",
        "fromSystemId": "beta-6e62dd07925158f738e3",
        "toSystemId": "beta-aec7801f5496bd6f19ea",
        "class": "base"
    },
    {
        "id": "link-beta-e82292557740b3348233-beta-4ee3f2b044243635e376",
        "fromSystemId": "beta-e82292557740b3348233",
        "toSystemId": "beta-4ee3f2b044243635e376",
        "class": "gate"
    },
    {
        "id": "link-beta-e82292557740b3348233-beta-f65c954454286b66c941",
        "fromSystemId": "beta-e82292557740b3348233",
        "toSystemId": "beta-f65c954454286b66c941",
        "class": "gate"
    },
    {
        "id": "link-beta-6c95b052cbabede02b5f-beta-a9f12cde01ba11d02b9d",
        "fromSystemId": "beta-6c95b052cbabede02b5f",
        "toSystemId": "beta-a9f12cde01ba11d02b9d",
        "class": "base"
    },
    {
        "id": "link-beta-6c95b052cbabede02b5f-beta-02b7e603768bbb2a4d70",
        "fromSystemId": "beta-6c95b052cbabede02b5f",
        "toSystemId": "beta-02b7e603768bbb2a4d70",
        "class": "base"
    },
    {
        "id": "link-beta-6c95b052cbabede02b5f-beta-d65ebc02964a510abad5",
        "fromSystemId": "beta-6c95b052cbabede02b5f",
        "toSystemId": "beta-d65ebc02964a510abad5",
        "class": "base"
    },
    {
        "id": "link-beta-855ec0bc494f210b3e8c-beta-c5f8c0023d6adb25b58d",
        "fromSystemId": "beta-855ec0bc494f210b3e8c",
        "toSystemId": "beta-c5f8c0023d6adb25b58d",
        "class": "base"
    },
    {
        "id": "link-beta-855ec0bc494f210b3e8c-beta-62ab9e657c386b4cd1de",
        "fromSystemId": "beta-855ec0bc494f210b3e8c",
        "toSystemId": "beta-62ab9e657c386b4cd1de",
        "class": "gate"
    },
    {
        "id": "link-beta-855ec0bc494f210b3e8c-beta-7be12cddf0a4c22907ff",
        "fromSystemId": "beta-855ec0bc494f210b3e8c",
        "toSystemId": "beta-7be12cddf0a4c22907ff",
        "class": "gate"
    },
    {
        "id": "link-beta-c0787c791d7dcbf7a40e-beta-ce2a30dc97fb96d6815d",
        "fromSystemId": "beta-c0787c791d7dcbf7a40e",
        "toSystemId": "beta-ce2a30dc97fb96d6815d",
        "class": "base"
    },
    {
        "id": "link-beta-d65ebc02964a510abad5-beta-a9f12cde01ba11d02b9d",
        "fromSystemId": "beta-d65ebc02964a510abad5",
        "toSystemId": "beta-a9f12cde01ba11d02b9d",
        "class": "base"
    },
    {
        "id": "link-beta-d65ebc02964a510abad5-beta-6c95b052cbabede02b5f",
        "fromSystemId": "beta-d65ebc02964a510abad5",
        "toSystemId": "beta-6c95b052cbabede02b5f",
        "class": "gate"
    },
    {
        "id": "link-beta-82a57cbe0ed3dff7731a-beta-34c23920b83a60cab3b1",
        "fromSystemId": "beta-82a57cbe0ed3dff7731a",
        "toSystemId": "beta-34c23920b83a60cab3b1",
        "class": "base"
    },
    {
        "id": "link-beta-2df33f092b3d82b58a4a-beta-28faec89234251cf184f",
        "fromSystemId": "beta-2df33f092b3d82b58a4a",
        "toSystemId": "beta-28faec89234251cf184f",
        "class": "base"
    },
    {
        "id": "link-beta-921a11ac31d98eb81cc8-beta-668faef57c6f2ef34520",
        "fromSystemId": "beta-921a11ac31d98eb81cc8",
        "toSystemId": "beta-668faef57c6f2ef34520",
        "class": "gate"
    },
    {
        "id": "link-beta-d10fe5f484be88dc8400-beta-de96a8159eaa52f24bdc",
        "fromSystemId": "beta-d10fe5f484be88dc8400",
        "toSystemId": "beta-de96a8159eaa52f24bdc",
        "class": "base"
    },
    {
        "id": "link-beta-d10fe5f484be88dc8400-beta-3fb1899476465e8495d5",
        "fromSystemId": "beta-d10fe5f484be88dc8400",
        "toSystemId": "beta-3fb1899476465e8495d5",
        "class": "gate"
    },
    {
        "id": "link-beta-563fca435e9525e7b563-beta-cbb753893569b18039f4",
        "fromSystemId": "beta-563fca435e9525e7b563",
        "toSystemId": "beta-cbb753893569b18039f4",
        "class": "base"
    },
    {
        "id": "link-beta-563fca435e9525e7b563-beta-5d553dd1008a281d4431",
        "fromSystemId": "beta-563fca435e9525e7b563",
        "toSystemId": "beta-5d553dd1008a281d4431",
        "class": "gate"
    },
    {
        "id": "link-beta-732792bb58c91a56628e-beta-aec7801f5496bd6f19ea",
        "fromSystemId": "beta-732792bb58c91a56628e",
        "toSystemId": "beta-aec7801f5496bd6f19ea",
        "class": "gate"
    },
    {
        "id": "link-beta-732792bb58c91a56628e-beta-57bb06780df12c56e136",
        "fromSystemId": "beta-732792bb58c91a56628e",
        "toSystemId": "beta-57bb06780df12c56e136",
        "class": "base"
    },
    {
        "id": "link-beta-62e4795b3a71fe1e8dcc-beta-28faec89234251cf184f",
        "fromSystemId": "beta-62e4795b3a71fe1e8dcc",
        "toSystemId": "beta-28faec89234251cf184f",
        "class": "base"
    },
    {
        "id": "link-beta-cf25ff19292a459c370d-beta-ac125172d4e963508617",
        "fromSystemId": "beta-cf25ff19292a459c370d",
        "toSystemId": "beta-ac125172d4e963508617",
        "class": "base"
    },
    {
        "id": "link-beta-cf25ff19292a459c370d-beta-0d8d2c468f83d7a70b59",
        "fromSystemId": "beta-cf25ff19292a459c370d",
        "toSystemId": "beta-0d8d2c468f83d7a70b59",
        "class": "base"
    },
    {
        "id": "link-beta-cf25ff19292a459c370d-beta-7c3b24c658df2d289c14",
        "fromSystemId": "beta-cf25ff19292a459c370d",
        "toSystemId": "beta-7c3b24c658df2d289c14",
        "class": "gate"
    },
    {
        "id": "link-beta-f25c24652c5adb52cd26-beta-668faef57c6f2ef34520",
        "fromSystemId": "beta-f25c24652c5adb52cd26",
        "toSystemId": "beta-668faef57c6f2ef34520",
        "class": "gate"
    },
    {
        "id": "link-beta-f25c24652c5adb52cd26-beta-921a11ac31d98eb81cc8",
        "fromSystemId": "beta-f25c24652c5adb52cd26",
        "toSystemId": "beta-921a11ac31d98eb81cc8",
        "class": "base"
    },
    {
        "id": "link-beta-f25c24652c5adb52cd26-beta-953f35418860d1997c2f",
        "fromSystemId": "beta-f25c24652c5adb52cd26",
        "toSystemId": "beta-953f35418860d1997c2f",
        "class": "base"
    },
    {
        "id": "link-beta-89e124cb21241279d856-beta-2863f7328abb4030517e",
        "fromSystemId": "beta-89e124cb21241279d856",
        "toSystemId": "beta-2863f7328abb4030517e",
        "class": "base"
    },
    {
        "id": "link-beta-89e124cb21241279d856-beta-7525e9a606bdf2fc36d3",
        "fromSystemId": "beta-89e124cb21241279d856",
        "toSystemId": "beta-7525e9a606bdf2fc36d3",
        "class": "base"
    },
    {
        "id": "link-beta-f65c954454286b66c941-beta-4ee3f2b044243635e376",
        "fromSystemId": "beta-f65c954454286b66c941",
        "toSystemId": "beta-4ee3f2b044243635e376",
        "class": "base"
    },
    {
        "id": "link-beta-f65c954454286b66c941-beta-0f247f64601e2e2c78c6",
        "fromSystemId": "beta-f65c954454286b66c941",
        "toSystemId": "beta-0f247f64601e2e2c78c6",
        "class": "gate"
    },
    {
        "id": "link-beta-f65c954454286b66c941-beta-e82292557740b3348233",
        "fromSystemId": "beta-f65c954454286b66c941",
        "toSystemId": "beta-e82292557740b3348233",
        "class": "base"
    },
    {
        "id": "link-beta-9d93f65702d91f7c197a-beta-c635f69a1f9f4895c403",
        "fromSystemId": "beta-9d93f65702d91f7c197a",
        "toSystemId": "beta-c635f69a1f9f4895c403",
        "class": "base"
    },
    {
        "id": "link-beta-de96a8159eaa52f24bdc-beta-d10fe5f484be88dc8400",
        "fromSystemId": "beta-de96a8159eaa52f24bdc",
        "toSystemId": "beta-d10fe5f484be88dc8400",
        "class": "gate"
    },
    {
        "id": "link-beta-820c1e701b1cc8fecdb6-beta-ce2a30dc97fb96d6815d",
        "fromSystemId": "beta-820c1e701b1cc8fecdb6",
        "toSystemId": "beta-ce2a30dc97fb96d6815d",
        "class": "base"
    },
    {
        "id": "link-beta-820c1e701b1cc8fecdb6-beta-79a68f2b78845c1f6ecb",
        "fromSystemId": "beta-820c1e701b1cc8fecdb6",
        "toSystemId": "beta-79a68f2b78845c1f6ecb",
        "class": "base"
    },
    {
        "id": "link-beta-17e4596e61006e302745-beta-668faef57c6f2ef34520",
        "fromSystemId": "beta-17e4596e61006e302745",
        "toSystemId": "beta-668faef57c6f2ef34520",
        "class": "gate"
    },
    {
        "id": "link-beta-9a871a0a8e9ea7a21f1f-beta-ce5674100b4cea16d5f1",
        "fromSystemId": "beta-9a871a0a8e9ea7a21f1f",
        "toSystemId": "beta-ce5674100b4cea16d5f1",
        "class": "base"
    },
    {
        "id": "link-beta-7a8ce6eb04f33dfbe744-beta-1c57c0addeab1fc72537",
        "fromSystemId": "beta-7a8ce6eb04f33dfbe744",
        "toSystemId": "beta-1c57c0addeab1fc72537",
        "class": "base"
    },
    {
        "id": "link-beta-34c23920b83a60cab3b1-beta-82a57cbe0ed3dff7731a",
        "fromSystemId": "beta-34c23920b83a60cab3b1",
        "toSystemId": "beta-82a57cbe0ed3dff7731a",
        "class": "base"
    },
    {
        "id": "link-beta-cc0be74a1b0003415961-beta-e82292557740b3348233",
        "fromSystemId": "beta-cc0be74a1b0003415961",
        "toSystemId": "beta-e82292557740b3348233",
        "class": "base"
    },
    {
        "id": "link-beta-cc0be74a1b0003415961-beta-4ee3f2b044243635e376",
        "fromSystemId": "beta-cc0be74a1b0003415961",
        "toSystemId": "beta-4ee3f2b044243635e376",
        "class": "base"
    },
    {
        "id": "link-beta-cc0be74a1b0003415961-beta-0f247f64601e2e2c78c6",
        "fromSystemId": "beta-cc0be74a1b0003415961",
        "toSystemId": "beta-0f247f64601e2e2c78c6",
        "class": "base"
    },
    {
        "id": "link-beta-39e3e118b4f8428f6edd-beta-2dcf36e3f880c86255d2",
        "fromSystemId": "beta-39e3e118b4f8428f6edd",
        "toSystemId": "beta-2dcf36e3f880c86255d2",
        "class": "gate"
    },
    {
        "id": "link-beta-39e3e118b4f8428f6edd-beta-a331719b5bb4e59d2037",
        "fromSystemId": "beta-39e3e118b4f8428f6edd",
        "toSystemId": "beta-a331719b5bb4e59d2037",
        "class": "base"
    },
    {
        "id": "link-beta-39e3e118b4f8428f6edd-beta-69c8bbc66c63e6e36d3f",
        "fromSystemId": "beta-39e3e118b4f8428f6edd",
        "toSystemId": "beta-69c8bbc66c63e6e36d3f",
        "class": "gate"
    },
    {
        "id": "link-beta-7525e9a606bdf2fc36d3-beta-7c515dbea9e435f5aecf",
        "fromSystemId": "beta-7525e9a606bdf2fc36d3",
        "toSystemId": "beta-7c515dbea9e435f5aecf",
        "class": "gate"
    },
    {
        "id": "link-beta-79a68f2b78845c1f6ecb-beta-4817db6ad5ecd27f0417",
        "fromSystemId": "beta-79a68f2b78845c1f6ecb",
        "toSystemId": "beta-4817db6ad5ecd27f0417",
        "class": "base"
    },
    {
        "id": "link-beta-c635f69a1f9f4895c403-beta-9d93f65702d91f7c197a",
        "fromSystemId": "beta-c635f69a1f9f4895c403",
        "toSystemId": "beta-9d93f65702d91f7c197a",
        "class": "base"
    },
    {
        "id": "link-beta-c635f69a1f9f4895c403-beta-4bd06018ed2e39e80144",
        "fromSystemId": "beta-c635f69a1f9f4895c403",
        "toSystemId": "beta-4bd06018ed2e39e80144",
        "class": "base"
    },
    {
        "id": "link-beta-c635f69a1f9f4895c403-beta-b81f11e98033caa0d1e7",
        "fromSystemId": "beta-c635f69a1f9f4895c403",
        "toSystemId": "beta-b81f11e98033caa0d1e7",
        "class": "base"
    },
    {
        "id": "link-beta-668faef57c6f2ef34520-beta-921a11ac31d98eb81cc8",
        "fromSystemId": "beta-668faef57c6f2ef34520",
        "toSystemId": "beta-921a11ac31d98eb81cc8",
        "class": "base"
    },
    {
        "id": "link-beta-55c58ce0dd4c30e4bbc8-beta-c03c3de3e71278c7b014",
        "fromSystemId": "beta-55c58ce0dd4c30e4bbc8",
        "toSystemId": "beta-c03c3de3e71278c7b014",
        "class": "base"
    },
    {
        "id": "link-beta-4f583d7245f8ec6be7fc-beta-56b0bea442819b0a79fa",
        "fromSystemId": "beta-4f583d7245f8ec6be7fc",
        "toSystemId": "beta-56b0bea442819b0a79fa",
        "class": "base"
    },
    {
        "id": "link-beta-7be12cddf0a4c22907ff-beta-62ab9e657c386b4cd1de",
        "fromSystemId": "beta-7be12cddf0a4c22907ff",
        "toSystemId": "beta-62ab9e657c386b4cd1de",
        "class": "base"
    },
    {
        "id": "link-beta-7be12cddf0a4c22907ff-beta-855ec0bc494f210b3e8c",
        "fromSystemId": "beta-7be12cddf0a4c22907ff",
        "toSystemId": "beta-855ec0bc494f210b3e8c",
        "class": "base"
    },
    {
        "id": "link-beta-7be12cddf0a4c22907ff-beta-02b7e603768bbb2a4d70",
        "fromSystemId": "beta-7be12cddf0a4c22907ff",
        "toSystemId": "beta-02b7e603768bbb2a4d70",
        "class": "gate"
    },
    {
        "id": "link-beta-3fb1899476465e8495d5-beta-d10fe5f484be88dc8400",
        "fromSystemId": "beta-3fb1899476465e8495d5",
        "toSystemId": "beta-d10fe5f484be88dc8400",
        "class": "gate"
    },
    {
        "id": "link-beta-3fb1899476465e8495d5-beta-4bd06018ed2e39e80144",
        "fromSystemId": "beta-3fb1899476465e8495d5",
        "toSystemId": "beta-4bd06018ed2e39e80144",
        "class": "gate"
    },
    {
        "id": "link-beta-3fb1899476465e8495d5-beta-de96a8159eaa52f24bdc",
        "fromSystemId": "beta-3fb1899476465e8495d5",
        "toSystemId": "beta-de96a8159eaa52f24bdc",
        "class": "base"
    },
    {
        "id": "link-beta-b8164bddec16d19d73e4-beta-6e62dd07925158f738e3",
        "fromSystemId": "beta-b8164bddec16d19d73e4",
        "toSystemId": "beta-6e62dd07925158f738e3",
        "class": "base"
    },
    {
        "id": "link-beta-62ab9e657c386b4cd1de-beta-855ec0bc494f210b3e8c",
        "fromSystemId": "beta-62ab9e657c386b4cd1de",
        "toSystemId": "beta-855ec0bc494f210b3e8c",
        "class": "gate"
    },
    {
        "id": "link-beta-62ab9e657c386b4cd1de-beta-7be12cddf0a4c22907ff",
        "fromSystemId": "beta-62ab9e657c386b4cd1de",
        "toSystemId": "beta-7be12cddf0a4c22907ff",
        "class": "base"
    },
    {
        "id": "link-beta-7c515dbea9e435f5aecf-beta-7525e9a606bdf2fc36d3",
        "fromSystemId": "beta-7c515dbea9e435f5aecf",
        "toSystemId": "beta-7525e9a606bdf2fc36d3",
        "class": "base"
    },
    {
        "id": "link-beta-7c515dbea9e435f5aecf-beta-2863f7328abb4030517e",
        "fromSystemId": "beta-7c515dbea9e435f5aecf",
        "toSystemId": "beta-2863f7328abb4030517e",
        "class": "base"
    },
    {
        "id": "link-beta-81c89328761a457b3445-beta-6c23ca0639e80aa73208",
        "fromSystemId": "beta-81c89328761a457b3445",
        "toSystemId": "beta-6c23ca0639e80aa73208",
        "class": "base"
    },
    {
        "id": "link-beta-0eea8fb5886634a21e36-beta-9a871a0a8e9ea7a21f1f",
        "fromSystemId": "beta-0eea8fb5886634a21e36",
        "toSystemId": "beta-9a871a0a8e9ea7a21f1f",
        "class": "base"
    },
    {
        "id": "link-beta-0eea8fb5886634a21e36-beta-ce5674100b4cea16d5f1",
        "fromSystemId": "beta-0eea8fb5886634a21e36",
        "toSystemId": "beta-ce5674100b4cea16d5f1",
        "class": "base"
    },
    {
        "id": "link-beta-7c3b24c658df2d289c14-beta-0d8d2c468f83d7a70b59",
        "fromSystemId": "beta-7c3b24c658df2d289c14",
        "toSystemId": "beta-0d8d2c468f83d7a70b59",
        "class": "gate"
    },
    {
        "id": "link-beta-7c3b24c658df2d289c14-beta-632171f60a1458f77c17",
        "fromSystemId": "beta-7c3b24c658df2d289c14",
        "toSystemId": "beta-632171f60a1458f77c17",
        "class": "base"
    },
    {
        "id": "link-beta-c6e3f27e9ec1ae6fb4db-beta-e12969b14b05937fadb6",
        "fromSystemId": "beta-c6e3f27e9ec1ae6fb4db",
        "toSystemId": "beta-e12969b14b05937fadb6",
        "class": "base"
    },
    {
        "id": "link-beta-4ee3f2b044243635e376-beta-0f247f64601e2e2c78c6",
        "fromSystemId": "beta-4ee3f2b044243635e376",
        "toSystemId": "beta-0f247f64601e2e2c78c6",
        "class": "base"
    },
    {
        "id": "link-beta-ce2a30dc97fb96d6815d-beta-aec7801f5496bd6f19ea",
        "fromSystemId": "beta-ce2a30dc97fb96d6815d",
        "toSystemId": "beta-aec7801f5496bd6f19ea",
        "class": "base"
    },
    {
        "id": "link-beta-ce2a30dc97fb96d6815d-beta-c0787c791d7dcbf7a40e",
        "fromSystemId": "beta-ce2a30dc97fb96d6815d",
        "toSystemId": "beta-c0787c791d7dcbf7a40e",
        "class": "base"
    },
    {
        "id": "link-beta-ce2a30dc97fb96d6815d-beta-732792bb58c91a56628e",
        "fromSystemId": "beta-ce2a30dc97fb96d6815d",
        "toSystemId": "beta-732792bb58c91a56628e",
        "class": "base"
    },
    {
        "id": "link-beta-4bd06018ed2e39e80144-beta-c635f69a1f9f4895c403",
        "fromSystemId": "beta-4bd06018ed2e39e80144",
        "toSystemId": "beta-c635f69a1f9f4895c403",
        "class": "base"
    },
    {
        "id": "link-beta-4bd06018ed2e39e80144-beta-9d93f65702d91f7c197a",
        "fromSystemId": "beta-4bd06018ed2e39e80144",
        "toSystemId": "beta-9d93f65702d91f7c197a",
        "class": "base"
    },
    {
        "id": "link-beta-4bd06018ed2e39e80144-beta-3fb1899476465e8495d5",
        "fromSystemId": "beta-4bd06018ed2e39e80144",
        "toSystemId": "beta-3fb1899476465e8495d5",
        "class": "base"
    },
    {
        "id": "link-beta-953f35418860d1997c2f-beta-82a57cbe0ed3dff7731a",
        "fromSystemId": "beta-953f35418860d1997c2f",
        "toSystemId": "beta-82a57cbe0ed3dff7731a",
        "class": "base"
    },
    {
        "id": "link-beta-953f35418860d1997c2f-beta-34c23920b83a60cab3b1",
        "fromSystemId": "beta-953f35418860d1997c2f",
        "toSystemId": "beta-34c23920b83a60cab3b1",
        "class": "base"
    },
    {
        "id": "link-beta-953f35418860d1997c2f-beta-a5cb3814eeecf3b0332f",
        "fromSystemId": "beta-953f35418860d1997c2f",
        "toSystemId": "beta-a5cb3814eeecf3b0332f",
        "class": "base"
    },
    {
        "id": "link-beta-aec7801f5496bd6f19ea-beta-ce2a30dc97fb96d6815d",
        "fromSystemId": "beta-aec7801f5496bd6f19ea",
        "toSystemId": "beta-ce2a30dc97fb96d6815d",
        "class": "base"
    },
    {
        "id": "link-beta-aec7801f5496bd6f19ea-beta-732792bb58c91a56628e",
        "fromSystemId": "beta-aec7801f5496bd6f19ea",
        "toSystemId": "beta-732792bb58c91a56628e",
        "class": "base"
    },
    {
        "id": "link-beta-aec7801f5496bd6f19ea-beta-6e62dd07925158f738e3",
        "fromSystemId": "beta-aec7801f5496bd6f19ea",
        "toSystemId": "beta-6e62dd07925158f738e3",
        "class": "base"
    },
    {
        "id": "link-beta-2f8675f3f38599d82367-beta-c5f8c0023d6adb25b58d",
        "fromSystemId": "beta-2f8675f3f38599d82367",
        "toSystemId": "beta-c5f8c0023d6adb25b58d",
        "class": "base"
    },
    {
        "id": "link-beta-4a0a29d9b91279193337-beta-c54a9f0ea25a027a295a",
        "fromSystemId": "beta-4a0a29d9b91279193337",
        "toSystemId": "beta-c54a9f0ea25a027a295a",
        "class": "base"
    },
    {
        "id": "link-beta-4a0a29d9b91279193337-beta-cd431cef240788933ac6",
        "fromSystemId": "beta-4a0a29d9b91279193337",
        "toSystemId": "beta-cd431cef240788933ac6",
        "class": "base"
    },
    {
        "id": "link-beta-4a0a29d9b91279193337-beta-b1466e1bbe4623fa659f",
        "fromSystemId": "beta-4a0a29d9b91279193337",
        "toSystemId": "beta-b1466e1bbe4623fa659f",
        "class": "base"
    },
    {
        "id": "link-beta-a9f12cde01ba11d02b9d-beta-6c95b052cbabede02b5f",
        "fromSystemId": "beta-a9f12cde01ba11d02b9d",
        "toSystemId": "beta-6c95b052cbabede02b5f",
        "class": "base"
    },
    {
        "id": "link-beta-2863f7328abb4030517e-beta-89e124cb21241279d856",
        "fromSystemId": "beta-2863f7328abb4030517e",
        "toSystemId": "beta-89e124cb21241279d856",
        "class": "gate"
    },
    {
        "id": "link-beta-c54a9f0ea25a027a295a-beta-0f247f64601e2e2c78c6",
        "fromSystemId": "beta-c54a9f0ea25a027a295a",
        "toSystemId": "beta-0f247f64601e2e2c78c6",
        "class": "base"
    },
    {
        "id": "link-beta-c54a9f0ea25a027a295a-beta-4e1dd4d3384f3f5cf7eb",
        "fromSystemId": "beta-c54a9f0ea25a027a295a",
        "toSystemId": "beta-4e1dd4d3384f3f5cf7eb",
        "class": "base"
    },
    {
        "id": "link-beta-ac125172d4e963508617-beta-cf25ff19292a459c370d",
        "fromSystemId": "beta-ac125172d4e963508617",
        "toSystemId": "beta-cf25ff19292a459c370d",
        "class": "base"
    },
    {
        "id": "link-beta-ac125172d4e963508617-beta-0d8d2c468f83d7a70b59",
        "fromSystemId": "beta-ac125172d4e963508617",
        "toSystemId": "beta-0d8d2c468f83d7a70b59",
        "class": "base"
    },
    {
        "id": "link-beta-ac125172d4e963508617-beta-632171f60a1458f77c17",
        "fromSystemId": "beta-ac125172d4e963508617",
        "toSystemId": "beta-632171f60a1458f77c17",
        "class": "gate"
    },
    {
        "id": "link-beta-a2bfe047172cf490aea9-beta-d65ebc02964a510abad5",
        "fromSystemId": "beta-a2bfe047172cf490aea9",
        "toSystemId": "beta-d65ebc02964a510abad5",
        "class": "base"
    },
    {
        "id": "link-beta-4e1dd4d3384f3f5cf7eb-beta-0f247f64601e2e2c78c6",
        "fromSystemId": "beta-4e1dd4d3384f3f5cf7eb",
        "toSystemId": "beta-0f247f64601e2e2c78c6",
        "class": "base"
    },
    {
        "id": "link-beta-4e1dd4d3384f3f5cf7eb-beta-f65c954454286b66c941",
        "fromSystemId": "beta-4e1dd4d3384f3f5cf7eb",
        "toSystemId": "beta-f65c954454286b66c941",
        "class": "gate"
    },
    {
        "id": "link-beta-4817db6ad5ecd27f0417-beta-79a68f2b78845c1f6ecb",
        "fromSystemId": "beta-4817db6ad5ecd27f0417",
        "toSystemId": "beta-79a68f2b78845c1f6ecb",
        "class": "base"
    },
    {
        "id": "link-beta-4817db6ad5ecd27f0417-beta-5b07ba4d9b8b6d8cddfc",
        "fromSystemId": "beta-4817db6ad5ecd27f0417",
        "toSystemId": "beta-5b07ba4d9b8b6d8cddfc",
        "class": "gate"
    },
    {
        "id": "link-beta-4817db6ad5ecd27f0417-beta-7ca951c541e3eebce299",
        "fromSystemId": "beta-4817db6ad5ecd27f0417",
        "toSystemId": "beta-7ca951c541e3eebce299",
        "class": "base"
    },
    {
        "id": "link-beta-cbb753893569b18039f4-beta-5d553dd1008a281d4431",
        "fromSystemId": "beta-cbb753893569b18039f4",
        "toSystemId": "beta-5d553dd1008a281d4431",
        "class": "base"
    },
    {
        "id": "link-beta-cbb753893569b18039f4-beta-563fca435e9525e7b563",
        "fromSystemId": "beta-cbb753893569b18039f4",
        "toSystemId": "beta-563fca435e9525e7b563",
        "class": "gate"
    },
    {
        "id": "link-beta-8d686d52c7e4023203d5-beta-de96a8159eaa52f24bdc",
        "fromSystemId": "beta-8d686d52c7e4023203d5",
        "toSystemId": "beta-de96a8159eaa52f24bdc",
        "class": "base"
    },
    {
        "id": "link-beta-8d686d52c7e4023203d5-beta-d10fe5f484be88dc8400",
        "fromSystemId": "beta-8d686d52c7e4023203d5",
        "toSystemId": "beta-d10fe5f484be88dc8400",
        "class": "base"
    },
    {
        "id": "link-beta-ff1d82cf0013f01a89af-beta-e12969b14b05937fadb6",
        "fromSystemId": "beta-ff1d82cf0013f01a89af",
        "toSystemId": "beta-e12969b14b05937fadb6",
        "class": "base"
    },
    {
        "id": "link-beta-ff1d82cf0013f01a89af-beta-2df33f092b3d82b58a4a",
        "fromSystemId": "beta-ff1d82cf0013f01a89af",
        "toSystemId": "beta-2df33f092b3d82b58a4a",
        "class": "gate"
    },
    {
        "id": "link-beta-ff1d82cf0013f01a89af-beta-62e4795b3a71fe1e8dcc",
        "fromSystemId": "beta-ff1d82cf0013f01a89af",
        "toSystemId": "beta-62e4795b3a71fe1e8dcc",
        "class": "base"
    },
    {
        "id": "link-beta-a5cb3814eeecf3b0332f-beta-82a57cbe0ed3dff7731a",
        "fromSystemId": "beta-a5cb3814eeecf3b0332f",
        "toSystemId": "beta-82a57cbe0ed3dff7731a",
        "class": "gate"
    },
    {
        "id": "link-beta-a5cb3814eeecf3b0332f-beta-953f35418860d1997c2f",
        "fromSystemId": "beta-a5cb3814eeecf3b0332f",
        "toSystemId": "beta-953f35418860d1997c2f",
        "class": "base"
    },
    {
        "id": "link-beta-e12969b14b05937fadb6-beta-ff1d82cf0013f01a89af",
        "fromSystemId": "beta-e12969b14b05937fadb6",
        "toSystemId": "beta-ff1d82cf0013f01a89af",
        "class": "base"
    },
    {
        "id": "link-beta-cd431cef240788933ac6-beta-9d93f65702d91f7c197a",
        "fromSystemId": "beta-cd431cef240788933ac6",
        "toSystemId": "beta-9d93f65702d91f7c197a",
        "class": "gate"
    },
    {
        "id": "link-beta-cd431cef240788933ac6-beta-4bd06018ed2e39e80144",
        "fromSystemId": "beta-cd431cef240788933ac6",
        "toSystemId": "beta-4bd06018ed2e39e80144",
        "class": "base"
    },
    {
        "id": "link-beta-cd431cef240788933ac6-beta-c635f69a1f9f4895c403",
        "fromSystemId": "beta-cd431cef240788933ac6",
        "toSystemId": "beta-c635f69a1f9f4895c403",
        "class": "base"
    },
    {
        "id": "link-beta-0f160ab95ed003567f13-beta-a5cb3814eeecf3b0332f",
        "fromSystemId": "beta-0f160ab95ed003567f13",
        "toSystemId": "beta-a5cb3814eeecf3b0332f",
        "class": "base"
    },
    {
        "id": "link-beta-0f160ab95ed003567f13-beta-921a11ac31d98eb81cc8",
        "fromSystemId": "beta-0f160ab95ed003567f13",
        "toSystemId": "beta-921a11ac31d98eb81cc8",
        "class": "base"
    },
    {
        "id": "link-beta-0f160ab95ed003567f13-beta-17e4596e61006e302745",
        "fromSystemId": "beta-0f160ab95ed003567f13",
        "toSystemId": "beta-17e4596e61006e302745",
        "class": "base"
    },
    {
        "id": "link-beta-6c23ca0639e80aa73208-beta-8a19c9728a7c8ed266fd",
        "fromSystemId": "beta-6c23ca0639e80aa73208",
        "toSystemId": "beta-8a19c9728a7c8ed266fd",
        "class": "base"
    },
    {
        "id": "link-beta-5d553dd1008a281d4431-beta-cbb753893569b18039f4",
        "fromSystemId": "beta-5d553dd1008a281d4431",
        "toSystemId": "beta-cbb753893569b18039f4",
        "class": "base"
    },
    {
        "id": "link-beta-5d553dd1008a281d4431-beta-d10fe5f484be88dc8400",
        "fromSystemId": "beta-5d553dd1008a281d4431",
        "toSystemId": "beta-d10fe5f484be88dc8400",
        "class": "gate"
    },
    {
        "id": "link-beta-632171f60a1458f77c17-beta-0d8d2c468f83d7a70b59",
        "fromSystemId": "beta-632171f60a1458f77c17",
        "toSystemId": "beta-0d8d2c468f83d7a70b59",
        "class": "gate"
    },
    {
        "id": "link-beta-56b0bea442819b0a79fa-beta-55a55dfd7d579bf57f89",
        "fromSystemId": "beta-56b0bea442819b0a79fa",
        "toSystemId": "beta-55a55dfd7d579bf57f89",
        "class": "base"
    },
    {
        "id": "link-beta-56b0bea442819b0a79fa-beta-4f583d7245f8ec6be7fc",
        "fromSystemId": "beta-56b0bea442819b0a79fa",
        "toSystemId": "beta-4f583d7245f8ec6be7fc",
        "class": "base"
    },
    {
        "id": "link-beta-56b0bea442819b0a79fa-beta-b81f11e98033caa0d1e7",
        "fromSystemId": "beta-56b0bea442819b0a79fa",
        "toSystemId": "beta-b81f11e98033caa0d1e7",
        "class": "base"
    },
    {
        "id": "link-beta-ce5674100b4cea16d5f1-beta-9a871a0a8e9ea7a21f1f",
        "fromSystemId": "beta-ce5674100b4cea16d5f1",
        "toSystemId": "beta-9a871a0a8e9ea7a21f1f",
        "class": "base"
    },
    {
        "id": "link-beta-ce5674100b4cea16d5f1-beta-7c515dbea9e435f5aecf",
        "fromSystemId": "beta-ce5674100b4cea16d5f1",
        "toSystemId": "beta-7c515dbea9e435f5aecf",
        "class": "gate"
    },
    {
        "id": "link-beta-ce5674100b4cea16d5f1-beta-7525e9a606bdf2fc36d3",
        "fromSystemId": "beta-ce5674100b4cea16d5f1",
        "toSystemId": "beta-7525e9a606bdf2fc36d3",
        "class": "base"
    },
    {
        "id": "link-beta-0d8d2c468f83d7a70b59-beta-7c3b24c658df2d289c14",
        "fromSystemId": "beta-0d8d2c468f83d7a70b59",
        "toSystemId": "beta-7c3b24c658df2d289c14",
        "class": "gate"
    },
    {
        "id": "link-beta-0d8d2c468f83d7a70b59-beta-ac125172d4e963508617",
        "fromSystemId": "beta-0d8d2c468f83d7a70b59",
        "toSystemId": "beta-ac125172d4e963508617",
        "class": "base"
    },
    {
        "id": "link-beta-0d8d2c468f83d7a70b59-beta-632171f60a1458f77c17",
        "fromSystemId": "beta-0d8d2c468f83d7a70b59",
        "toSystemId": "beta-632171f60a1458f77c17",
        "class": "base"
    },
    {
        "id": "link-beta-69c8bbc66c63e6e36d3f-beta-a331719b5bb4e59d2037",
        "fromSystemId": "beta-69c8bbc66c63e6e36d3f",
        "toSystemId": "beta-a331719b5bb4e59d2037",
        "class": "base"
    },
    {
        "id": "link-beta-69c8bbc66c63e6e36d3f-beta-2dcf36e3f880c86255d2",
        "fromSystemId": "beta-69c8bbc66c63e6e36d3f",
        "toSystemId": "beta-2dcf36e3f880c86255d2",
        "class": "base"
    },
    {
        "id": "link-beta-02b7e603768bbb2a4d70-beta-6c95b052cbabede02b5f",
        "fromSystemId": "beta-02b7e603768bbb2a4d70",
        "toSystemId": "beta-6c95b052cbabede02b5f",
        "class": "gate"
    },
    {
        "id": "link-beta-c03c3de3e71278c7b014-beta-55c58ce0dd4c30e4bbc8",
        "fromSystemId": "beta-c03c3de3e71278c7b014",
        "toSystemId": "beta-55c58ce0dd4c30e4bbc8",
        "class": "base"
    },
    {
        "id": "link-beta-c03c3de3e71278c7b014-beta-6c95b052cbabede02b5f",
        "fromSystemId": "beta-c03c3de3e71278c7b014",
        "toSystemId": "beta-6c95b052cbabede02b5f",
        "class": "base"
    },
    {
        "id": "link-beta-28faec89234251cf184f-beta-2f8675f3f38599d82367",
        "fromSystemId": "beta-28faec89234251cf184f",
        "toSystemId": "beta-2f8675f3f38599d82367",
        "class": "gate"
    },
    {
        "id": "link-beta-28faec89234251cf184f-beta-2df33f092b3d82b58a4a",
        "fromSystemId": "beta-28faec89234251cf184f",
        "toSystemId": "beta-2df33f092b3d82b58a4a",
        "class": "base"
    },
    {
        "id": "link-beta-28faec89234251cf184f-beta-62e4795b3a71fe1e8dcc",
        "fromSystemId": "beta-28faec89234251cf184f",
        "toSystemId": "beta-62e4795b3a71fe1e8dcc",
        "class": "base"
    },
    {
        "id": "link-beta-5b07ba4d9b8b6d8cddfc-beta-7ca951c541e3eebce299",
        "fromSystemId": "beta-5b07ba4d9b8b6d8cddfc",
        "toSystemId": "beta-7ca951c541e3eebce299",
        "class": "gate"
    },
    {
        "id": "link-beta-5b07ba4d9b8b6d8cddfc-beta-4f583d7245f8ec6be7fc",
        "fromSystemId": "beta-5b07ba4d9b8b6d8cddfc",
        "toSystemId": "beta-4f583d7245f8ec6be7fc",
        "class": "gate"
    },
    {
        "id": "link-beta-0f730835cc4b6ac6432f-beta-2df33f092b3d82b58a4a",
        "fromSystemId": "beta-0f730835cc4b6ac6432f",
        "toSystemId": "beta-2df33f092b3d82b58a4a",
        "class": "gate"
    },
    {
        "id": "link-beta-8a19c9728a7c8ed266fd-beta-6c23ca0639e80aa73208",
        "fromSystemId": "beta-8a19c9728a7c8ed266fd",
        "toSystemId": "beta-6c23ca0639e80aa73208",
        "class": "base"
    },
    {
        "id": "link-beta-7ca951c541e3eebce299-beta-5b07ba4d9b8b6d8cddfc",
        "fromSystemId": "beta-7ca951c541e3eebce299",
        "toSystemId": "beta-5b07ba4d9b8b6d8cddfc",
        "class": "base"
    },
    {
        "id": "link-beta-7ca951c541e3eebce299-beta-4f583d7245f8ec6be7fc",
        "fromSystemId": "beta-7ca951c541e3eebce299",
        "toSystemId": "beta-4f583d7245f8ec6be7fc",
        "class": "base"
    },
    {
        "id": "link-beta-54c17fa621aefdbef17c-beta-6c23ca0639e80aa73208",
        "fromSystemId": "beta-54c17fa621aefdbef17c",
        "toSystemId": "beta-6c23ca0639e80aa73208",
        "class": "base"
    },
    {
        "id": "link-beta-a331719b5bb4e59d2037-beta-69c8bbc66c63e6e36d3f",
        "fromSystemId": "beta-a331719b5bb4e59d2037",
        "toSystemId": "beta-69c8bbc66c63e6e36d3f",
        "class": "gate"
    },
    {
        "id": "link-beta-a331719b5bb4e59d2037-beta-2dcf36e3f880c86255d2",
        "fromSystemId": "beta-a331719b5bb4e59d2037",
        "toSystemId": "beta-2dcf36e3f880c86255d2",
        "class": "base"
    },
    {
        "id": "link-beta-b81f11e98033caa0d1e7-beta-c635f69a1f9f4895c403",
        "fromSystemId": "beta-b81f11e98033caa0d1e7",
        "toSystemId": "beta-c635f69a1f9f4895c403",
        "class": "base"
    },
    {
        "id": "link-beta-b81f11e98033caa0d1e7-beta-4f583d7245f8ec6be7fc",
        "fromSystemId": "beta-b81f11e98033caa0d1e7",
        "toSystemId": "beta-4f583d7245f8ec6be7fc",
        "class": "base"
    },
    {
        "id": "link-beta-b81f11e98033caa0d1e7-beta-9d93f65702d91f7c197a",
        "fromSystemId": "beta-b81f11e98033caa0d1e7",
        "toSystemId": "beta-9d93f65702d91f7c197a",
        "class": "gate"
    },
    {
        "id": "link-gamma-b695c2c3ec80b99ca69c-gamma-27c6900642b6a604232c",
        "fromSystemId": "gamma-b695c2c3ec80b99ca69c",
        "toSystemId": "gamma-27c6900642b6a604232c",
        "class": "gate"
    },
    {
        "id": "link-gamma-b695c2c3ec80b99ca69c-gamma-6877838b86951f091b4e",
        "fromSystemId": "gamma-b695c2c3ec80b99ca69c",
        "toSystemId": "gamma-6877838b86951f091b4e",
        "class": "base"
    },
    {
        "id": "link-gamma-a9f24cc1d81380947287-gamma-cdde4c2bb81bece8d1ac",
        "fromSystemId": "gamma-a9f24cc1d81380947287",
        "toSystemId": "gamma-cdde4c2bb81bece8d1ac",
        "class": "base"
    },
    {
        "id": "link-gamma-a9f24cc1d81380947287-gamma-c849701c1046f408f82b",
        "fromSystemId": "gamma-a9f24cc1d81380947287",
        "toSystemId": "gamma-c849701c1046f408f82b",
        "class": "base"
    },
    {
        "id": "link-gamma-a9f24cc1d81380947287-gamma-dd8b1eaccc3a4f93b052",
        "fromSystemId": "gamma-a9f24cc1d81380947287",
        "toSystemId": "gamma-dd8b1eaccc3a4f93b052",
        "class": "gate"
    },
    {
        "id": "link-gamma-eefe6c36e631624352cf-gamma-ead9315eff66b2436c12",
        "fromSystemId": "gamma-eefe6c36e631624352cf",
        "toSystemId": "gamma-ead9315eff66b2436c12",
        "class": "base"
    },
    {
        "id": "link-gamma-fcef9b84cb40cf60bba2-gamma-16065a790f8240690bdc",
        "fromSystemId": "gamma-fcef9b84cb40cf60bba2",
        "toSystemId": "gamma-16065a790f8240690bdc",
        "class": "base"
    },
    {
        "id": "link-gamma-fcef9b84cb40cf60bba2-gamma-325b47bd762e7a83ada2",
        "fromSystemId": "gamma-fcef9b84cb40cf60bba2",
        "toSystemId": "gamma-325b47bd762e7a83ada2",
        "class": "base"
    },
    {
        "id": "link-gamma-91ef7f7ca53b1d0358a6-gamma-621bab19ae059e951d3d",
        "fromSystemId": "gamma-91ef7f7ca53b1d0358a6",
        "toSystemId": "gamma-621bab19ae059e951d3d",
        "class": "base"
    },
    {
        "id": "link-gamma-21580600c4ed6adfe98f-gamma-f04fa0c13b1d442fea83",
        "fromSystemId": "gamma-21580600c4ed6adfe98f",
        "toSystemId": "gamma-f04fa0c13b1d442fea83",
        "class": "base"
    },
    {
        "id": "link-gamma-3d68ef177e55f1ad4fd4-gamma-7bca59b7eac72aef0816",
        "fromSystemId": "gamma-3d68ef177e55f1ad4fd4",
        "toSystemId": "gamma-7bca59b7eac72aef0816",
        "class": "base"
    },
    {
        "id": "link-gamma-3d68ef177e55f1ad4fd4-gamma-50648c9376b39dd049b3",
        "fromSystemId": "gamma-3d68ef177e55f1ad4fd4",
        "toSystemId": "gamma-50648c9376b39dd049b3",
        "class": "base"
    },
    {
        "id": "link-gamma-8ecfdc5d70dde035eb06-gamma-8a655487736673213da3",
        "fromSystemId": "gamma-8ecfdc5d70dde035eb06",
        "toSystemId": "gamma-8a655487736673213da3",
        "class": "gate"
    },
    {
        "id": "link-gamma-8ecfdc5d70dde035eb06-gamma-f04fa0c13b1d442fea83",
        "fromSystemId": "gamma-8ecfdc5d70dde035eb06",
        "toSystemId": "gamma-f04fa0c13b1d442fea83",
        "class": "base"
    },
    {
        "id": "link-gamma-8ecfdc5d70dde035eb06-gamma-8f31498752a434bf85cf",
        "fromSystemId": "gamma-8ecfdc5d70dde035eb06",
        "toSystemId": "gamma-8f31498752a434bf85cf",
        "class": "gate"
    },
    {
        "id": "link-gamma-97d0bdb9e729c1661701-gamma-1aca6c4182f6900919a2",
        "fromSystemId": "gamma-97d0bdb9e729c1661701",
        "toSystemId": "gamma-1aca6c4182f6900919a2",
        "class": "base"
    },
    {
        "id": "link-gamma-1eac053f009edbbbc2da-gamma-9ad066ff06d05ecc42d2",
        "fromSystemId": "gamma-1eac053f009edbbbc2da",
        "toSystemId": "gamma-9ad066ff06d05ecc42d2",
        "class": "base"
    },
    {
        "id": "link-gamma-1eac053f009edbbbc2da-gamma-057ebf96e2377cb9751f",
        "fromSystemId": "gamma-1eac053f009edbbbc2da",
        "toSystemId": "gamma-057ebf96e2377cb9751f",
        "class": "base"
    },
    {
        "id": "link-gamma-1eac053f009edbbbc2da-gamma-d0c866c35ef74cbb4ea1",
        "fromSystemId": "gamma-1eac053f009edbbbc2da",
        "toSystemId": "gamma-d0c866c35ef74cbb4ea1",
        "class": "base"
    },
    {
        "id": "link-gamma-8f31498752a434bf85cf-gamma-8a655487736673213da3",
        "fromSystemId": "gamma-8f31498752a434bf85cf",
        "toSystemId": "gamma-8a655487736673213da3",
        "class": "gate"
    },
    {
        "id": "link-gamma-9ad066ff06d05ecc42d2-gamma-4d9d0ce0e294d054d57d",
        "fromSystemId": "gamma-9ad066ff06d05ecc42d2",
        "toSystemId": "gamma-4d9d0ce0e294d054d57d",
        "class": "base"
    },
    {
        "id": "link-gamma-8721c2c98a69b3b71088-gamma-57dc1bac11d8bb8563cc",
        "fromSystemId": "gamma-8721c2c98a69b3b71088",
        "toSystemId": "gamma-57dc1bac11d8bb8563cc",
        "class": "gate"
    },
    {
        "id": "link-gamma-057ebf96e2377cb9751f-gamma-1d81736a3f6cf454bdc9",
        "fromSystemId": "gamma-057ebf96e2377cb9751f",
        "toSystemId": "gamma-1d81736a3f6cf454bdc9",
        "class": "gate"
    },
    {
        "id": "link-gamma-057ebf96e2377cb9751f-gamma-4d9d0ce0e294d054d57d",
        "fromSystemId": "gamma-057ebf96e2377cb9751f",
        "toSystemId": "gamma-4d9d0ce0e294d054d57d",
        "class": "base"
    },
    {
        "id": "link-gamma-c29aefb61a1c9c96fc4f-gamma-55ae407005cc0bf5d7de",
        "fromSystemId": "gamma-c29aefb61a1c9c96fc4f",
        "toSystemId": "gamma-55ae407005cc0bf5d7de",
        "class": "base"
    },
    {
        "id": "link-gamma-c29aefb61a1c9c96fc4f-gamma-4143b6a0e3070771cf7f",
        "fromSystemId": "gamma-c29aefb61a1c9c96fc4f",
        "toSystemId": "gamma-4143b6a0e3070771cf7f",
        "class": "gate"
    },
    {
        "id": "link-gamma-62625035f3b13dd2c04c-gamma-478377d2af23747cbef4",
        "fromSystemId": "gamma-62625035f3b13dd2c04c",
        "toSystemId": "gamma-478377d2af23747cbef4",
        "class": "base"
    },
    {
        "id": "link-gamma-62625035f3b13dd2c04c-gamma-4f66f56929456bbfe807",
        "fromSystemId": "gamma-62625035f3b13dd2c04c",
        "toSystemId": "gamma-4f66f56929456bbfe807",
        "class": "base"
    },
    {
        "id": "link-gamma-62625035f3b13dd2c04c-gamma-f3f1ca458f6229840a99",
        "fromSystemId": "gamma-62625035f3b13dd2c04c",
        "toSystemId": "gamma-f3f1ca458f6229840a99",
        "class": "gate"
    },
    {
        "id": "link-gamma-7181985f1d1d19bdf2ec-gamma-621bab19ae059e951d3d",
        "fromSystemId": "gamma-7181985f1d1d19bdf2ec",
        "toSystemId": "gamma-621bab19ae059e951d3d",
        "class": "base"
    },
    {
        "id": "link-gamma-7181985f1d1d19bdf2ec-gamma-91ef7f7ca53b1d0358a6",
        "fromSystemId": "gamma-7181985f1d1d19bdf2ec",
        "toSystemId": "gamma-91ef7f7ca53b1d0358a6",
        "class": "base"
    },
    {
        "id": "link-gamma-7181985f1d1d19bdf2ec-gamma-ec7c147c151b113ebcc2",
        "fromSystemId": "gamma-7181985f1d1d19bdf2ec",
        "toSystemId": "gamma-ec7c147c151b113ebcc2",
        "class": "base"
    },
    {
        "id": "link-gamma-0cef58cc009bc1c15f59-gamma-61ff2dfc995d521a8d7c",
        "fromSystemId": "gamma-0cef58cc009bc1c15f59",
        "toSystemId": "gamma-61ff2dfc995d521a8d7c",
        "class": "base"
    },
    {
        "id": "link-gamma-0cef58cc009bc1c15f59-gamma-1d81736a3f6cf454bdc9",
        "fromSystemId": "gamma-0cef58cc009bc1c15f59",
        "toSystemId": "gamma-1d81736a3f6cf454bdc9",
        "class": "base"
    },
    {
        "id": "link-gamma-bc072a518af1938b60bd-gamma-b9077f595e821cc4b466",
        "fromSystemId": "gamma-bc072a518af1938b60bd",
        "toSystemId": "gamma-b9077f595e821cc4b466",
        "class": "base"
    },
    {
        "id": "link-gamma-4a773fecb2c4c3230258-gamma-37341b05d17b63d28051",
        "fromSystemId": "gamma-4a773fecb2c4c3230258",
        "toSystemId": "gamma-37341b05d17b63d28051",
        "class": "base"
    },
    {
        "id": "link-gamma-4a773fecb2c4c3230258-gamma-eefe6c36e631624352cf",
        "fromSystemId": "gamma-4a773fecb2c4c3230258",
        "toSystemId": "gamma-eefe6c36e631624352cf",
        "class": "base"
    },
    {
        "id": "link-gamma-4a773fecb2c4c3230258-gamma-cb112586b0eac75b121f",
        "fromSystemId": "gamma-4a773fecb2c4c3230258",
        "toSystemId": "gamma-cb112586b0eac75b121f",
        "class": "gate"
    },
    {
        "id": "link-gamma-7bca59b7eac72aef0816-gamma-3d68ef177e55f1ad4fd4",
        "fromSystemId": "gamma-7bca59b7eac72aef0816",
        "toSystemId": "gamma-3d68ef177e55f1ad4fd4",
        "class": "base"
    },
    {
        "id": "link-gamma-fdf88baeb345fa14cc93-gamma-a43593bc02027d9e27cd",
        "fromSystemId": "gamma-fdf88baeb345fa14cc93",
        "toSystemId": "gamma-a43593bc02027d9e27cd",
        "class": "base"
    },
    {
        "id": "link-gamma-d0c866c35ef74cbb4ea1-gamma-7a42e1868b8f959bdc2f",
        "fromSystemId": "gamma-d0c866c35ef74cbb4ea1",
        "toSystemId": "gamma-7a42e1868b8f959bdc2f",
        "class": "base"
    },
    {
        "id": "link-gamma-d0c866c35ef74cbb4ea1-gamma-9f9546aece13cf3303e9",
        "fromSystemId": "gamma-d0c866c35ef74cbb4ea1",
        "toSystemId": "gamma-9f9546aece13cf3303e9",
        "class": "base"
    },
    {
        "id": "link-gamma-d0c866c35ef74cbb4ea1-gamma-1eac053f009edbbbc2da",
        "fromSystemId": "gamma-d0c866c35ef74cbb4ea1",
        "toSystemId": "gamma-1eac053f009edbbbc2da",
        "class": "gate"
    },
    {
        "id": "link-gamma-15c234ff62898d6a0397-gamma-775c53887949c4d88c77",
        "fromSystemId": "gamma-15c234ff62898d6a0397",
        "toSystemId": "gamma-775c53887949c4d88c77",
        "class": "base"
    },
    {
        "id": "link-gamma-15c234ff62898d6a0397-gamma-fa2e5ae24cb5c900e30d",
        "fromSystemId": "gamma-15c234ff62898d6a0397",
        "toSystemId": "gamma-fa2e5ae24cb5c900e30d",
        "class": "base"
    },
    {
        "id": "link-gamma-15c234ff62898d6a0397-gamma-ec75c51f1b5fb3cd6b89",
        "fromSystemId": "gamma-15c234ff62898d6a0397",
        "toSystemId": "gamma-ec75c51f1b5fb3cd6b89",
        "class": "gate"
    },
    {
        "id": "link-gamma-a44406316e50ddb57fab-gamma-50648c9376b39dd049b3",
        "fromSystemId": "gamma-a44406316e50ddb57fab",
        "toSystemId": "gamma-50648c9376b39dd049b3",
        "class": "base"
    },
    {
        "id": "link-gamma-a43593bc02027d9e27cd-gamma-2b3b53181d66d15d09a6",
        "fromSystemId": "gamma-a43593bc02027d9e27cd",
        "toSystemId": "gamma-2b3b53181d66d15d09a6",
        "class": "base"
    },
    {
        "id": "link-gamma-d6e47e35c2bf5113c447-gamma-70c116866aa5a710699f",
        "fromSystemId": "gamma-d6e47e35c2bf5113c447",
        "toSystemId": "gamma-70c116866aa5a710699f",
        "class": "base"
    },
    {
        "id": "link-gamma-d6e47e35c2bf5113c447-gamma-582162e831022c5fbb45",
        "fromSystemId": "gamma-d6e47e35c2bf5113c447",
        "toSystemId": "gamma-582162e831022c5fbb45",
        "class": "base"
    },
    {
        "id": "link-gamma-d6e47e35c2bf5113c447-gamma-6bb5826713afebbe6527",
        "fromSystemId": "gamma-d6e47e35c2bf5113c447",
        "toSystemId": "gamma-6bb5826713afebbe6527",
        "class": "base"
    },
    {
        "id": "link-gamma-820819a6ca58597dfb2e-gamma-31c2aa3d479e8869451e",
        "fromSystemId": "gamma-820819a6ca58597dfb2e",
        "toSystemId": "gamma-31c2aa3d479e8869451e",
        "class": "gate"
    },
    {
        "id": "link-gamma-820819a6ca58597dfb2e-gamma-9f9546aece13cf3303e9",
        "fromSystemId": "gamma-820819a6ca58597dfb2e",
        "toSystemId": "gamma-9f9546aece13cf3303e9",
        "class": "base"
    },
    {
        "id": "link-gamma-687d9ef302f2da9e89ae-gamma-77fe1fa1a52893635b2e",
        "fromSystemId": "gamma-687d9ef302f2da9e89ae",
        "toSystemId": "gamma-77fe1fa1a52893635b2e",
        "class": "gate"
    },
    {
        "id": "link-gamma-687d9ef302f2da9e89ae-gamma-35c6ff816b2058a8e6f2",
        "fromSystemId": "gamma-687d9ef302f2da9e89ae",
        "toSystemId": "gamma-35c6ff816b2058a8e6f2",
        "class": "base"
    },
    {
        "id": "link-gamma-687d9ef302f2da9e89ae-gamma-b8243c454ee5299719c2",
        "fromSystemId": "gamma-687d9ef302f2da9e89ae",
        "toSystemId": "gamma-b8243c454ee5299719c2",
        "class": "base"
    },
    {
        "id": "link-gamma-50648c9376b39dd049b3-gamma-3d68ef177e55f1ad4fd4",
        "fromSystemId": "gamma-50648c9376b39dd049b3",
        "toSystemId": "gamma-3d68ef177e55f1ad4fd4",
        "class": "base"
    },
    {
        "id": "link-gamma-50648c9376b39dd049b3-gamma-a44406316e50ddb57fab",
        "fromSystemId": "gamma-50648c9376b39dd049b3",
        "toSystemId": "gamma-a44406316e50ddb57fab",
        "class": "base"
    },
    {
        "id": "link-gamma-50648c9376b39dd049b3-gamma-1f814750ed2766162259",
        "fromSystemId": "gamma-50648c9376b39dd049b3",
        "toSystemId": "gamma-1f814750ed2766162259",
        "class": "gate"
    },
    {
        "id": "link-gamma-50f8a8c9ec8420303704-gamma-af6bedc870efaa430d55",
        "fromSystemId": "gamma-50f8a8c9ec8420303704",
        "toSystemId": "gamma-af6bedc870efaa430d55",
        "class": "base"
    },
    {
        "id": "link-gamma-50f8a8c9ec8420303704-gamma-6cba73ec2f63ace78494",
        "fromSystemId": "gamma-50f8a8c9ec8420303704",
        "toSystemId": "gamma-6cba73ec2f63ace78494",
        "class": "gate"
    },
    {
        "id": "link-gamma-2b3b53181d66d15d09a6-gamma-a43593bc02027d9e27cd",
        "fromSystemId": "gamma-2b3b53181d66d15d09a6",
        "toSystemId": "gamma-a43593bc02027d9e27cd",
        "class": "gate"
    },
    {
        "id": "link-gamma-2b3b53181d66d15d09a6-gamma-582162e831022c5fbb45",
        "fromSystemId": "gamma-2b3b53181d66d15d09a6",
        "toSystemId": "gamma-582162e831022c5fbb45",
        "class": "base"
    },
    {
        "id": "link-gamma-2b3b53181d66d15d09a6-gamma-fdf88baeb345fa14cc93",
        "fromSystemId": "gamma-2b3b53181d66d15d09a6",
        "toSystemId": "gamma-fdf88baeb345fa14cc93",
        "class": "base"
    },
    {
        "id": "link-gamma-bb3e70cdffaa4c134ab2-gamma-55ae407005cc0bf5d7de",
        "fromSystemId": "gamma-bb3e70cdffaa4c134ab2",
        "toSystemId": "gamma-55ae407005cc0bf5d7de",
        "class": "base"
    },
    {
        "id": "link-gamma-16065a790f8240690bdc-gamma-325b47bd762e7a83ada2",
        "fromSystemId": "gamma-16065a790f8240690bdc",
        "toSystemId": "gamma-325b47bd762e7a83ada2",
        "class": "base"
    },
    {
        "id": "link-gamma-16065a790f8240690bdc-gamma-fcef9b84cb40cf60bba2",
        "fromSystemId": "gamma-16065a790f8240690bdc",
        "toSystemId": "gamma-fcef9b84cb40cf60bba2",
        "class": "base"
    },
    {
        "id": "link-gamma-3b342ea7ccf553eb51b2-gamma-af4c8087e48565cbc29d",
        "fromSystemId": "gamma-3b342ea7ccf553eb51b2",
        "toSystemId": "gamma-af4c8087e48565cbc29d",
        "class": "base"
    },
    {
        "id": "link-gamma-3b342ea7ccf553eb51b2-gamma-9346dbd4ac7a438dc5d7",
        "fromSystemId": "gamma-3b342ea7ccf553eb51b2",
        "toSystemId": "gamma-9346dbd4ac7a438dc5d7",
        "class": "base"
    },
    {
        "id": "link-gamma-bb33e5e94ce068dbbc1d-gamma-92e8798abdeef7ec72c0",
        "fromSystemId": "gamma-bb33e5e94ce068dbbc1d",
        "toSystemId": "gamma-92e8798abdeef7ec72c0",
        "class": "base"
    },
    {
        "id": "link-gamma-bb33e5e94ce068dbbc1d-gamma-1f814750ed2766162259",
        "fromSystemId": "gamma-bb33e5e94ce068dbbc1d",
        "toSystemId": "gamma-1f814750ed2766162259",
        "class": "base"
    },
    {
        "id": "link-gamma-7acee9a75b1d3221de18-gamma-10580b6d6896787c92c7",
        "fromSystemId": "gamma-7acee9a75b1d3221de18",
        "toSystemId": "gamma-10580b6d6896787c92c7",
        "class": "gate"
    },
    {
        "id": "link-gamma-7acee9a75b1d3221de18-gamma-6bb5826713afebbe6527",
        "fromSystemId": "gamma-7acee9a75b1d3221de18",
        "toSystemId": "gamma-6bb5826713afebbe6527",
        "class": "base"
    },
    {
        "id": "link-gamma-7acee9a75b1d3221de18-gamma-4143b6a0e3070771cf7f",
        "fromSystemId": "gamma-7acee9a75b1d3221de18",
        "toSystemId": "gamma-4143b6a0e3070771cf7f",
        "class": "gate"
    },
    {
        "id": "link-gamma-70c116866aa5a710699f-gamma-d6e47e35c2bf5113c447",
        "fromSystemId": "gamma-70c116866aa5a710699f",
        "toSystemId": "gamma-d6e47e35c2bf5113c447",
        "class": "base"
    },
    {
        "id": "link-gamma-31c2aa3d479e8869451e-gamma-820819a6ca58597dfb2e",
        "fromSystemId": "gamma-31c2aa3d479e8869451e",
        "toSystemId": "gamma-820819a6ca58597dfb2e",
        "class": "base"
    },
    {
        "id": "link-gamma-8a655487736673213da3-gamma-8ecfdc5d70dde035eb06",
        "fromSystemId": "gamma-8a655487736673213da3",
        "toSystemId": "gamma-8ecfdc5d70dde035eb06",
        "class": "base"
    },
    {
        "id": "link-gamma-8a655487736673213da3-gamma-8f31498752a434bf85cf",
        "fromSystemId": "gamma-8a655487736673213da3",
        "toSystemId": "gamma-8f31498752a434bf85cf",
        "class": "base"
    },
    {
        "id": "link-gamma-478377d2af23747cbef4-gamma-62625035f3b13dd2c04c",
        "fromSystemId": "gamma-478377d2af23747cbef4",
        "toSystemId": "gamma-62625035f3b13dd2c04c",
        "class": "base"
    },
    {
        "id": "link-gamma-478377d2af23747cbef4-gamma-325b47bd762e7a83ada2",
        "fromSystemId": "gamma-478377d2af23747cbef4",
        "toSystemId": "gamma-325b47bd762e7a83ada2",
        "class": "base"
    },
    {
        "id": "link-gamma-af4c8087e48565cbc29d-gamma-3b342ea7ccf553eb51b2",
        "fromSystemId": "gamma-af4c8087e48565cbc29d",
        "toSystemId": "gamma-3b342ea7ccf553eb51b2",
        "class": "base"
    },
    {
        "id": "link-gamma-ec7c147c151b113ebcc2-gamma-c849701c1046f408f82b",
        "fromSystemId": "gamma-ec7c147c151b113ebcc2",
        "toSystemId": "gamma-c849701c1046f408f82b",
        "class": "base"
    },
    {
        "id": "link-gamma-ec7c147c151b113ebcc2-gamma-621bab19ae059e951d3d",
        "fromSystemId": "gamma-ec7c147c151b113ebcc2",
        "toSystemId": "gamma-621bab19ae059e951d3d",
        "class": "gate"
    },
    {
        "id": "link-gamma-ecbd79c783b577b6e001-gamma-a2b91b9faf68c9c34b07",
        "fromSystemId": "gamma-ecbd79c783b577b6e001",
        "toSystemId": "gamma-a2b91b9faf68c9c34b07",
        "class": "gate"
    },
    {
        "id": "link-gamma-ecbd79c783b577b6e001-gamma-7ff3543165d3def7b112",
        "fromSystemId": "gamma-ecbd79c783b577b6e001",
        "toSystemId": "gamma-7ff3543165d3def7b112",
        "class": "gate"
    },
    {
        "id": "link-gamma-7ff3543165d3def7b112-gamma-006daeff66a88eb4b0a9",
        "fromSystemId": "gamma-7ff3543165d3def7b112",
        "toSystemId": "gamma-006daeff66a88eb4b0a9",
        "class": "base"
    },
    {
        "id": "link-gamma-7ff3543165d3def7b112-gamma-a2b91b9faf68c9c34b07",
        "fromSystemId": "gamma-7ff3543165d3def7b112",
        "toSystemId": "gamma-a2b91b9faf68c9c34b07",
        "class": "gate"
    },
    {
        "id": "link-gamma-92e8798abdeef7ec72c0-gamma-bb33e5e94ce068dbbc1d",
        "fromSystemId": "gamma-92e8798abdeef7ec72c0",
        "toSystemId": "gamma-bb33e5e94ce068dbbc1d",
        "class": "base"
    },
    {
        "id": "link-gamma-92e8798abdeef7ec72c0-gamma-1f814750ed2766162259",
        "fromSystemId": "gamma-92e8798abdeef7ec72c0",
        "toSystemId": "gamma-1f814750ed2766162259",
        "class": "gate"
    },
    {
        "id": "link-gamma-92e8798abdeef7ec72c0-gamma-e8db5217421a0538853e",
        "fromSystemId": "gamma-92e8798abdeef7ec72c0",
        "toSystemId": "gamma-e8db5217421a0538853e",
        "class": "base"
    },
    {
        "id": "link-gamma-f3f1ca458f6229840a99-gamma-73d9fb058065b51b58dc",
        "fromSystemId": "gamma-f3f1ca458f6229840a99",
        "toSystemId": "gamma-73d9fb058065b51b58dc",
        "class": "base"
    },
    {
        "id": "link-gamma-f3f1ca458f6229840a99-gamma-4d9d0ce0e294d054d57d",
        "fromSystemId": "gamma-f3f1ca458f6229840a99",
        "toSystemId": "gamma-4d9d0ce0e294d054d57d",
        "class": "base"
    },
    {
        "id": "link-gamma-f3f1ca458f6229840a99-gamma-9ad066ff06d05ecc42d2",
        "fromSystemId": "gamma-f3f1ca458f6229840a99",
        "toSystemId": "gamma-9ad066ff06d05ecc42d2",
        "class": "base"
    },
    {
        "id": "link-gamma-ec75c51f1b5fb3cd6b89-gamma-c7a4ec515dda9f4aa83b",
        "fromSystemId": "gamma-ec75c51f1b5fb3cd6b89",
        "toSystemId": "gamma-c7a4ec515dda9f4aa83b",
        "class": "gate"
    },
    {
        "id": "link-gamma-ec75c51f1b5fb3cd6b89-gamma-15c234ff62898d6a0397",
        "fromSystemId": "gamma-ec75c51f1b5fb3cd6b89",
        "toSystemId": "gamma-15c234ff62898d6a0397",
        "class": "base"
    },
    {
        "id": "link-gamma-ec75c51f1b5fb3cd6b89-gamma-ed3fd619ea66ad8d7d25",
        "fromSystemId": "gamma-ec75c51f1b5fb3cd6b89",
        "toSystemId": "gamma-ed3fd619ea66ad8d7d25",
        "class": "base"
    },
    {
        "id": "link-gamma-7a42e1868b8f959bdc2f-gamma-57dc1bac11d8bb8563cc",
        "fromSystemId": "gamma-7a42e1868b8f959bdc2f",
        "toSystemId": "gamma-57dc1bac11d8bb8563cc",
        "class": "base"
    },
    {
        "id": "link-gamma-7a42e1868b8f959bdc2f-gamma-d0c866c35ef74cbb4ea1",
        "fromSystemId": "gamma-7a42e1868b8f959bdc2f",
        "toSystemId": "gamma-d0c866c35ef74cbb4ea1",
        "class": "base"
    },
    {
        "id": "link-gamma-7a42e1868b8f959bdc2f-gamma-af4c8087e48565cbc29d",
        "fromSystemId": "gamma-7a42e1868b8f959bdc2f",
        "toSystemId": "gamma-af4c8087e48565cbc29d",
        "class": "base"
    },
    {
        "id": "link-gamma-57dc1bac11d8bb8563cc-gamma-af4c8087e48565cbc29d",
        "fromSystemId": "gamma-57dc1bac11d8bb8563cc",
        "toSystemId": "gamma-af4c8087e48565cbc29d",
        "class": "gate"
    },
    {
        "id": "link-gamma-9346dbd4ac7a438dc5d7-gamma-3b342ea7ccf553eb51b2",
        "fromSystemId": "gamma-9346dbd4ac7a438dc5d7",
        "toSystemId": "gamma-3b342ea7ccf553eb51b2",
        "class": "gate"
    },
    {
        "id": "link-gamma-9346dbd4ac7a438dc5d7-gamma-288e51191f2afd7bf29a",
        "fromSystemId": "gamma-9346dbd4ac7a438dc5d7",
        "toSystemId": "gamma-288e51191f2afd7bf29a",
        "class": "gate"
    },
    {
        "id": "link-gamma-9346dbd4ac7a438dc5d7-gamma-af4c8087e48565cbc29d",
        "fromSystemId": "gamma-9346dbd4ac7a438dc5d7",
        "toSystemId": "gamma-af4c8087e48565cbc29d",
        "class": "base"
    },
    {
        "id": "link-gamma-4143b6a0e3070771cf7f-gamma-10580b6d6896787c92c7",
        "fromSystemId": "gamma-4143b6a0e3070771cf7f",
        "toSystemId": "gamma-10580b6d6896787c92c7",
        "class": "base"
    },
    {
        "id": "link-gamma-4143b6a0e3070771cf7f-gamma-55ae407005cc0bf5d7de",
        "fromSystemId": "gamma-4143b6a0e3070771cf7f",
        "toSystemId": "gamma-55ae407005cc0bf5d7de",
        "class": "base"
    },
    {
        "id": "link-gamma-4143b6a0e3070771cf7f-gamma-7acee9a75b1d3221de18",
        "fromSystemId": "gamma-4143b6a0e3070771cf7f",
        "toSystemId": "gamma-7acee9a75b1d3221de18",
        "class": "base"
    },
    {
        "id": "link-gamma-3b036c40c3c9a2b3f54a-gamma-108745b898d446c66d76",
        "fromSystemId": "gamma-3b036c40c3c9a2b3f54a",
        "toSystemId": "gamma-108745b898d446c66d76",
        "class": "gate"
    },
    {
        "id": "link-gamma-ead9315eff66b2436c12-gamma-eefe6c36e631624352cf",
        "fromSystemId": "gamma-ead9315eff66b2436c12",
        "toSystemId": "gamma-eefe6c36e631624352cf",
        "class": "gate"
    },
    {
        "id": "link-gamma-ead9315eff66b2436c12-gamma-dd8b1eaccc3a4f93b052",
        "fromSystemId": "gamma-ead9315eff66b2436c12",
        "toSystemId": "gamma-dd8b1eaccc3a4f93b052",
        "class": "base"
    },
    {
        "id": "link-gamma-41a8b0746a92ae2afa68-gamma-108745b898d446c66d76",
        "fromSystemId": "gamma-41a8b0746a92ae2afa68",
        "toSystemId": "gamma-108745b898d446c66d76",
        "class": "gate"
    },
    {
        "id": "link-gamma-41a8b0746a92ae2afa68-gamma-c573a4fc5cd109ca247b",
        "fromSystemId": "gamma-41a8b0746a92ae2afa68",
        "toSystemId": "gamma-c573a4fc5cd109ca247b",
        "class": "base"
    },
    {
        "id": "link-gamma-41a8b0746a92ae2afa68-gamma-3b036c40c3c9a2b3f54a",
        "fromSystemId": "gamma-41a8b0746a92ae2afa68",
        "toSystemId": "gamma-3b036c40c3c9a2b3f54a",
        "class": "gate"
    },
    {
        "id": "link-gamma-6877838b86951f091b4e-gamma-b695c2c3ec80b99ca69c",
        "fromSystemId": "gamma-6877838b86951f091b4e",
        "toSystemId": "gamma-b695c2c3ec80b99ca69c",
        "class": "base"
    },
    {
        "id": "link-gamma-61ff2dfc995d521a8d7c-gamma-6cba73ec2f63ace78494",
        "fromSystemId": "gamma-61ff2dfc995d521a8d7c",
        "toSystemId": "gamma-6cba73ec2f63ace78494",
        "class": "base"
    },
    {
        "id": "link-gamma-61ff2dfc995d521a8d7c-gamma-0cef58cc009bc1c15f59",
        "fromSystemId": "gamma-61ff2dfc995d521a8d7c",
        "toSystemId": "gamma-0cef58cc009bc1c15f59",
        "class": "base"
    },
    {
        "id": "link-gamma-775c53887949c4d88c77-gamma-15c234ff62898d6a0397",
        "fromSystemId": "gamma-775c53887949c4d88c77",
        "toSystemId": "gamma-15c234ff62898d6a0397",
        "class": "gate"
    },
    {
        "id": "link-gamma-1f814750ed2766162259-gamma-bb33e5e94ce068dbbc1d",
        "fromSystemId": "gamma-1f814750ed2766162259",
        "toSystemId": "gamma-bb33e5e94ce068dbbc1d",
        "class": "base"
    },
    {
        "id": "link-gamma-1f814750ed2766162259-gamma-50648c9376b39dd049b3",
        "fromSystemId": "gamma-1f814750ed2766162259",
        "toSystemId": "gamma-50648c9376b39dd049b3",
        "class": "base"
    },
    {
        "id": "link-gamma-ed3fd619ea66ad8d7d25-gamma-c7a4ec515dda9f4aa83b",
        "fromSystemId": "gamma-ed3fd619ea66ad8d7d25",
        "toSystemId": "gamma-c7a4ec515dda9f4aa83b",
        "class": "base"
    },
    {
        "id": "link-gamma-10580b6d6896787c92c7-gamma-7acee9a75b1d3221de18",
        "fromSystemId": "gamma-10580b6d6896787c92c7",
        "toSystemId": "gamma-7acee9a75b1d3221de18",
        "class": "base"
    },
    {
        "id": "link-gamma-35c6ff816b2058a8e6f2-gamma-77fe1fa1a52893635b2e",
        "fromSystemId": "gamma-35c6ff816b2058a8e6f2",
        "toSystemId": "gamma-77fe1fa1a52893635b2e",
        "class": "base"
    },
    {
        "id": "link-gamma-5e1bff1ae8f543660e33-gamma-beb36e969fa6ab62fd14",
        "fromSystemId": "gamma-5e1bff1ae8f543660e33",
        "toSystemId": "gamma-beb36e969fa6ab62fd14",
        "class": "base"
    },
    {
        "id": "link-gamma-5e1bff1ae8f543660e33-gamma-2c22f2bb94632e23acc4",
        "fromSystemId": "gamma-5e1bff1ae8f543660e33",
        "toSystemId": "gamma-2c22f2bb94632e23acc4",
        "class": "base"
    },
    {
        "id": "link-gamma-5e1bff1ae8f543660e33-gamma-c2cb98ebcd33f1452e98",
        "fromSystemId": "gamma-5e1bff1ae8f543660e33",
        "toSystemId": "gamma-c2cb98ebcd33f1452e98",
        "class": "gate"
    },
    {
        "id": "link-gamma-cdde4c2bb81bece8d1ac-gamma-a9f24cc1d81380947287",
        "fromSystemId": "gamma-cdde4c2bb81bece8d1ac",
        "toSystemId": "gamma-a9f24cc1d81380947287",
        "class": "base"
    },
    {
        "id": "link-gamma-cdde4c2bb81bece8d1ac-gamma-c849701c1046f408f82b",
        "fromSystemId": "gamma-cdde4c2bb81bece8d1ac",
        "toSystemId": "gamma-c849701c1046f408f82b",
        "class": "gate"
    },
    {
        "id": "link-gamma-37341b05d17b63d28051-gamma-4a773fecb2c4c3230258",
        "fromSystemId": "gamma-37341b05d17b63d28051",
        "toSystemId": "gamma-4a773fecb2c4c3230258",
        "class": "base"
    },
    {
        "id": "link-gamma-6bb5826713afebbe6527-gamma-7acee9a75b1d3221de18",
        "fromSystemId": "gamma-6bb5826713afebbe6527",
        "toSystemId": "gamma-7acee9a75b1d3221de18",
        "class": "base"
    },
    {
        "id": "link-gamma-6bb5826713afebbe6527-gamma-c9ba4009713a03b228f4",
        "fromSystemId": "gamma-6bb5826713afebbe6527",
        "toSystemId": "gamma-c9ba4009713a03b228f4",
        "class": "gate"
    },
    {
        "id": "link-gamma-c9ba4009713a03b228f4-gamma-6bb5826713afebbe6527",
        "fromSystemId": "gamma-c9ba4009713a03b228f4",
        "toSystemId": "gamma-6bb5826713afebbe6527",
        "class": "base"
    },
    {
        "id": "link-gamma-c9ba4009713a03b228f4-gamma-bb3e70cdffaa4c134ab2",
        "fromSystemId": "gamma-c9ba4009713a03b228f4",
        "toSystemId": "gamma-bb3e70cdffaa4c134ab2",
        "class": "base"
    },
    {
        "id": "link-gamma-beb36e969fa6ab62fd14-gamma-c2cb98ebcd33f1452e98",
        "fromSystemId": "gamma-beb36e969fa6ab62fd14",
        "toSystemId": "gamma-c2cb98ebcd33f1452e98",
        "class": "base"
    },
    {
        "id": "link-gamma-beb36e969fa6ab62fd14-gamma-5e1bff1ae8f543660e33",
        "fromSystemId": "gamma-beb36e969fa6ab62fd14",
        "toSystemId": "gamma-5e1bff1ae8f543660e33",
        "class": "base"
    },
    {
        "id": "link-gamma-006daeff66a88eb4b0a9-gamma-7ff3543165d3def7b112",
        "fromSystemId": "gamma-006daeff66a88eb4b0a9",
        "toSystemId": "gamma-7ff3543165d3def7b112",
        "class": "gate"
    },
    {
        "id": "link-gamma-006daeff66a88eb4b0a9-gamma-a2b91b9faf68c9c34b07",
        "fromSystemId": "gamma-006daeff66a88eb4b0a9",
        "toSystemId": "gamma-a2b91b9faf68c9c34b07",
        "class": "base"
    },
    {
        "id": "link-gamma-57007a0f9d4c8305f978-gamma-478377d2af23747cbef4",
        "fromSystemId": "gamma-57007a0f9d4c8305f978",
        "toSystemId": "gamma-478377d2af23747cbef4",
        "class": "base"
    },
    {
        "id": "link-gamma-1aca6c4182f6900919a2-gamma-97d0bdb9e729c1661701",
        "fromSystemId": "gamma-1aca6c4182f6900919a2",
        "toSystemId": "gamma-97d0bdb9e729c1661701",
        "class": "gate"
    },
    {
        "id": "link-gamma-1aca6c4182f6900919a2-gamma-bc072a518af1938b60bd",
        "fromSystemId": "gamma-1aca6c4182f6900919a2",
        "toSystemId": "gamma-bc072a518af1938b60bd",
        "class": "gate"
    },
    {
        "id": "link-gamma-3b34ad09c67accef6498-gamma-288e51191f2afd7bf29a",
        "fromSystemId": "gamma-3b34ad09c67accef6498",
        "toSystemId": "gamma-288e51191f2afd7bf29a",
        "class": "base"
    },
    {
        "id": "link-gamma-3b34ad09c67accef6498-gamma-af4c8087e48565cbc29d",
        "fromSystemId": "gamma-3b34ad09c67accef6498",
        "toSystemId": "gamma-af4c8087e48565cbc29d",
        "class": "base"
    },
    {
        "id": "link-gamma-3b34ad09c67accef6498-gamma-57dc1bac11d8bb8563cc",
        "fromSystemId": "gamma-3b34ad09c67accef6498",
        "toSystemId": "gamma-57dc1bac11d8bb8563cc",
        "class": "base"
    },
    {
        "id": "link-gamma-fa2e5ae24cb5c900e30d-gamma-d0aa9dfb677f40d531be",
        "fromSystemId": "gamma-fa2e5ae24cb5c900e30d",
        "toSystemId": "gamma-d0aa9dfb677f40d531be",
        "class": "base"
    },
    {
        "id": "link-gamma-fa2e5ae24cb5c900e30d-gamma-2598af70aa7b5b6910a9",
        "fromSystemId": "gamma-fa2e5ae24cb5c900e30d",
        "toSystemId": "gamma-2598af70aa7b5b6910a9",
        "class": "base"
    },
    {
        "id": "link-gamma-108745b898d446c66d76-gamma-3b036c40c3c9a2b3f54a",
        "fromSystemId": "gamma-108745b898d446c66d76",
        "toSystemId": "gamma-3b036c40c3c9a2b3f54a",
        "class": "base"
    },
    {
        "id": "link-gamma-108745b898d446c66d76-gamma-41a8b0746a92ae2afa68",
        "fromSystemId": "gamma-108745b898d446c66d76",
        "toSystemId": "gamma-41a8b0746a92ae2afa68",
        "class": "base"
    },
    {
        "id": "link-gamma-af6bedc870efaa430d55-gamma-50f8a8c9ec8420303704",
        "fromSystemId": "gamma-af6bedc870efaa430d55",
        "toSystemId": "gamma-50f8a8c9ec8420303704",
        "class": "base"
    },
    {
        "id": "link-gamma-af6bedc870efaa430d55-gamma-ac003cc0150d3e61592b",
        "fromSystemId": "gamma-af6bedc870efaa430d55",
        "toSystemId": "gamma-ac003cc0150d3e61592b",
        "class": "base"
    },
    {
        "id": "link-gamma-af6bedc870efaa430d55-gamma-6cba73ec2f63ace78494",
        "fromSystemId": "gamma-af6bedc870efaa430d55",
        "toSystemId": "gamma-6cba73ec2f63ace78494",
        "class": "gate"
    },
    {
        "id": "link-gamma-c7a4ec515dda9f4aa83b-gamma-ec75c51f1b5fb3cd6b89",
        "fromSystemId": "gamma-c7a4ec515dda9f4aa83b",
        "toSystemId": "gamma-ec75c51f1b5fb3cd6b89",
        "class": "base"
    },
    {
        "id": "link-gamma-c7a4ec515dda9f4aa83b-gamma-ed3fd619ea66ad8d7d25",
        "fromSystemId": "gamma-c7a4ec515dda9f4aa83b",
        "toSystemId": "gamma-ed3fd619ea66ad8d7d25",
        "class": "base"
    },
    {
        "id": "link-gamma-c7a4ec515dda9f4aa83b-gamma-8721c2c98a69b3b71088",
        "fromSystemId": "gamma-c7a4ec515dda9f4aa83b",
        "toSystemId": "gamma-8721c2c98a69b3b71088",
        "class": "gate"
    },
    {
        "id": "link-gamma-b9077f595e821cc4b466-gamma-bc072a518af1938b60bd",
        "fromSystemId": "gamma-b9077f595e821cc4b466",
        "toSystemId": "gamma-bc072a518af1938b60bd",
        "class": "base"
    },
    {
        "id": "link-gamma-4f66f56929456bbfe807-gamma-3b342ea7ccf553eb51b2",
        "fromSystemId": "gamma-4f66f56929456bbfe807",
        "toSystemId": "gamma-3b342ea7ccf553eb51b2",
        "class": "base"
    },
    {
        "id": "link-gamma-4f66f56929456bbfe807-gamma-f3f1ca458f6229840a99",
        "fromSystemId": "gamma-4f66f56929456bbfe807",
        "toSystemId": "gamma-f3f1ca458f6229840a99",
        "class": "base"
    },
    {
        "id": "link-gamma-dc5b13db984702553e92-gamma-b3fa77f5c534e7dc710d",
        "fromSystemId": "gamma-dc5b13db984702553e92",
        "toSystemId": "gamma-b3fa77f5c534e7dc710d",
        "class": "base"
    },
    {
        "id": "link-gamma-621bab19ae059e951d3d-gamma-91ef7f7ca53b1d0358a6",
        "fromSystemId": "gamma-621bab19ae059e951d3d",
        "toSystemId": "gamma-91ef7f7ca53b1d0358a6",
        "class": "base"
    },
    {
        "id": "link-gamma-a2b91b9faf68c9c34b07-gamma-ecbd79c783b577b6e001",
        "fromSystemId": "gamma-a2b91b9faf68c9c34b07",
        "toSystemId": "gamma-ecbd79c783b577b6e001",
        "class": "gate"
    },
    {
        "id": "link-gamma-35c08d13bf0ae8ab2ba7-gamma-3d91c434344dec94d389",
        "fromSystemId": "gamma-35c08d13bf0ae8ab2ba7",
        "toSystemId": "gamma-3d91c434344dec94d389",
        "class": "base"
    },
    {
        "id": "link-gamma-35c08d13bf0ae8ab2ba7-gamma-8f31498752a434bf85cf",
        "fromSystemId": "gamma-35c08d13bf0ae8ab2ba7",
        "toSystemId": "gamma-8f31498752a434bf85cf",
        "class": "base"
    },
    {
        "id": "link-gamma-85f01c1d165306a83dfd-gamma-6cba73ec2f63ace78494",
        "fromSystemId": "gamma-85f01c1d165306a83dfd",
        "toSystemId": "gamma-6cba73ec2f63ace78494",
        "class": "gate"
    },
    {
        "id": "link-gamma-27c6900642b6a604232c-gamma-b695c2c3ec80b99ca69c",
        "fromSystemId": "gamma-27c6900642b6a604232c",
        "toSystemId": "gamma-b695c2c3ec80b99ca69c",
        "class": "base"
    },
    {
        "id": "link-gamma-27c6900642b6a604232c-gamma-1d81736a3f6cf454bdc9",
        "fromSystemId": "gamma-27c6900642b6a604232c",
        "toSystemId": "gamma-1d81736a3f6cf454bdc9",
        "class": "base"
    },
    {
        "id": "link-gamma-2598af70aa7b5b6910a9-gamma-d0aa9dfb677f40d531be",
        "fromSystemId": "gamma-2598af70aa7b5b6910a9",
        "toSystemId": "gamma-d0aa9dfb677f40d531be",
        "class": "base"
    },
    {
        "id": "link-gamma-cb112586b0eac75b121f-gamma-37341b05d17b63d28051",
        "fromSystemId": "gamma-cb112586b0eac75b121f",
        "toSystemId": "gamma-37341b05d17b63d28051",
        "class": "base"
    },
    {
        "id": "link-gamma-cb112586b0eac75b121f-gamma-b9077f595e821cc4b466",
        "fromSystemId": "gamma-cb112586b0eac75b121f",
        "toSystemId": "gamma-b9077f595e821cc4b466",
        "class": "base"
    },
    {
        "id": "link-gamma-0bd1ad18ac2cad2bdaeb-gamma-9f9546aece13cf3303e9",
        "fromSystemId": "gamma-0bd1ad18ac2cad2bdaeb",
        "toSystemId": "gamma-9f9546aece13cf3303e9",
        "class": "gate"
    },
    {
        "id": "link-gamma-0bd1ad18ac2cad2bdaeb-gamma-6cba73ec2f63ace78494",
        "fromSystemId": "gamma-0bd1ad18ac2cad2bdaeb",
        "toSystemId": "gamma-6cba73ec2f63ace78494",
        "class": "base"
    },
    {
        "id": "link-gamma-0bd1ad18ac2cad2bdaeb-gamma-820819a6ca58597dfb2e",
        "fromSystemId": "gamma-0bd1ad18ac2cad2bdaeb",
        "toSystemId": "gamma-820819a6ca58597dfb2e",
        "class": "base"
    },
    {
        "id": "link-gamma-6cba73ec2f63ace78494-gamma-50f8a8c9ec8420303704",
        "fromSystemId": "gamma-6cba73ec2f63ace78494",
        "toSystemId": "gamma-50f8a8c9ec8420303704",
        "class": "base"
    },
    {
        "id": "link-gamma-1d81736a3f6cf454bdc9-gamma-057ebf96e2377cb9751f",
        "fromSystemId": "gamma-1d81736a3f6cf454bdc9",
        "toSystemId": "gamma-057ebf96e2377cb9751f",
        "class": "base"
    },
    {
        "id": "link-gamma-ee76146a27eac366a512-gamma-c573a4fc5cd109ca247b",
        "fromSystemId": "gamma-ee76146a27eac366a512",
        "toSystemId": "gamma-c573a4fc5cd109ca247b",
        "class": "gate"
    },
    {
        "id": "link-gamma-ee76146a27eac366a512-gamma-3b036c40c3c9a2b3f54a",
        "fromSystemId": "gamma-ee76146a27eac366a512",
        "toSystemId": "gamma-3b036c40c3c9a2b3f54a",
        "class": "base"
    },
    {
        "id": "link-gamma-b3fa77f5c534e7dc710d-gamma-dc5b13db984702553e92",
        "fromSystemId": "gamma-b3fa77f5c534e7dc710d",
        "toSystemId": "gamma-dc5b13db984702553e92",
        "class": "gate"
    },
    {
        "id": "link-gamma-b3fa77f5c534e7dc710d-gamma-5dcff4a1f4bc7255af37",
        "fromSystemId": "gamma-b3fa77f5c534e7dc710d",
        "toSystemId": "gamma-5dcff4a1f4bc7255af37",
        "class": "base"
    },
    {
        "id": "link-gamma-288e51191f2afd7bf29a-gamma-af4c8087e48565cbc29d",
        "fromSystemId": "gamma-288e51191f2afd7bf29a",
        "toSystemId": "gamma-af4c8087e48565cbc29d",
        "class": "base"
    },
    {
        "id": "link-gamma-3c996e4b04c0498d39ae-gamma-d76327d2e9fe73f55c16",
        "fromSystemId": "gamma-3c996e4b04c0498d39ae",
        "toSystemId": "gamma-d76327d2e9fe73f55c16",
        "class": "base"
    },
    {
        "id": "link-gamma-3c996e4b04c0498d39ae-gamma-6877838b86951f091b4e",
        "fromSystemId": "gamma-3c996e4b04c0498d39ae",
        "toSystemId": "gamma-6877838b86951f091b4e",
        "class": "gate"
    },
    {
        "id": "link-gamma-c573a4fc5cd109ca247b-gamma-ee76146a27eac366a512",
        "fromSystemId": "gamma-c573a4fc5cd109ca247b",
        "toSystemId": "gamma-ee76146a27eac366a512",
        "class": "base"
    },
    {
        "id": "link-gamma-c573a4fc5cd109ca247b-gamma-9346dbd4ac7a438dc5d7",
        "fromSystemId": "gamma-c573a4fc5cd109ca247b",
        "toSystemId": "gamma-9346dbd4ac7a438dc5d7",
        "class": "base"
    },
    {
        "id": "link-gamma-8f544873843c5462c522-gamma-31c2aa3d479e8869451e",
        "fromSystemId": "gamma-8f544873843c5462c522",
        "toSystemId": "gamma-31c2aa3d479e8869451e",
        "class": "gate"
    },
    {
        "id": "link-gamma-2c22f2bb94632e23acc4-gamma-c2cb98ebcd33f1452e98",
        "fromSystemId": "gamma-2c22f2bb94632e23acc4",
        "toSystemId": "gamma-c2cb98ebcd33f1452e98",
        "class": "base"
    },
    {
        "id": "link-gamma-b8243c454ee5299719c2-gamma-77fe1fa1a52893635b2e",
        "fromSystemId": "gamma-b8243c454ee5299719c2",
        "toSystemId": "gamma-77fe1fa1a52893635b2e",
        "class": "base"
    },
    {
        "id": "link-gamma-b8243c454ee5299719c2-gamma-687d9ef302f2da9e89ae",
        "fromSystemId": "gamma-b8243c454ee5299719c2",
        "toSystemId": "gamma-687d9ef302f2da9e89ae",
        "class": "base"
    },
    {
        "id": "link-gamma-c849701c1046f408f82b-gamma-ec7c147c151b113ebcc2",
        "fromSystemId": "gamma-c849701c1046f408f82b",
        "toSystemId": "gamma-ec7c147c151b113ebcc2",
        "class": "gate"
    },
    {
        "id": "link-gamma-77fe1fa1a52893635b2e-gamma-687d9ef302f2da9e89ae",
        "fromSystemId": "gamma-77fe1fa1a52893635b2e",
        "toSystemId": "gamma-687d9ef302f2da9e89ae",
        "class": "base"
    },
    {
        "id": "link-gamma-77fe1fa1a52893635b2e-gamma-35c6ff816b2058a8e6f2",
        "fromSystemId": "gamma-77fe1fa1a52893635b2e",
        "toSystemId": "gamma-35c6ff816b2058a8e6f2",
        "class": "gate"
    },
    {
        "id": "link-gamma-b4c768313989c19c41e5-gamma-13bd3ce967fcb81f0784",
        "fromSystemId": "gamma-b4c768313989c19c41e5",
        "toSystemId": "gamma-13bd3ce967fcb81f0784",
        "class": "base"
    },
    {
        "id": "link-gamma-dd8b1eaccc3a4f93b052-gamma-a9f24cc1d81380947287",
        "fromSystemId": "gamma-dd8b1eaccc3a4f93b052",
        "toSystemId": "gamma-a9f24cc1d81380947287",
        "class": "base"
    },
    {
        "id": "link-gamma-e8db5217421a0538853e-gamma-bb33e5e94ce068dbbc1d",
        "fromSystemId": "gamma-e8db5217421a0538853e",
        "toSystemId": "gamma-bb33e5e94ce068dbbc1d",
        "class": "base"
    },
    {
        "id": "link-gamma-e8db5217421a0538853e-gamma-92e8798abdeef7ec72c0",
        "fromSystemId": "gamma-e8db5217421a0538853e",
        "toSystemId": "gamma-92e8798abdeef7ec72c0",
        "class": "base"
    },
    {
        "id": "link-gamma-e8db5217421a0538853e-gamma-11b892b24c14155bde5f",
        "fromSystemId": "gamma-e8db5217421a0538853e",
        "toSystemId": "gamma-11b892b24c14155bde5f",
        "class": "base"
    },
    {
        "id": "link-gamma-4d9d0ce0e294d054d57d-gamma-9ad066ff06d05ecc42d2",
        "fromSystemId": "gamma-4d9d0ce0e294d054d57d",
        "toSystemId": "gamma-9ad066ff06d05ecc42d2",
        "class": "gate"
    },
    {
        "id": "link-gamma-810bc94e63d17218935b-gamma-21580600c4ed6adfe98f",
        "fromSystemId": "gamma-810bc94e63d17218935b",
        "toSystemId": "gamma-21580600c4ed6adfe98f",
        "class": "gate"
    },
    {
        "id": "link-gamma-810bc94e63d17218935b-gamma-3d91c434344dec94d389",
        "fromSystemId": "gamma-810bc94e63d17218935b",
        "toSystemId": "gamma-3d91c434344dec94d389",
        "class": "base"
    },
    {
        "id": "link-gamma-810bc94e63d17218935b-gamma-35c08d13bf0ae8ab2ba7",
        "fromSystemId": "gamma-810bc94e63d17218935b",
        "toSystemId": "gamma-35c08d13bf0ae8ab2ba7",
        "class": "base"
    },
    {
        "id": "link-gamma-d0aa9dfb677f40d531be-gamma-fa2e5ae24cb5c900e30d",
        "fromSystemId": "gamma-d0aa9dfb677f40d531be",
        "toSystemId": "gamma-fa2e5ae24cb5c900e30d",
        "class": "base"
    },
    {
        "id": "link-gamma-d0aa9dfb677f40d531be-gamma-2598af70aa7b5b6910a9",
        "fromSystemId": "gamma-d0aa9dfb677f40d531be",
        "toSystemId": "gamma-2598af70aa7b5b6910a9",
        "class": "base"
    },
    {
        "id": "link-gamma-d0aa9dfb677f40d531be-gamma-775c53887949c4d88c77",
        "fromSystemId": "gamma-d0aa9dfb677f40d531be",
        "toSystemId": "gamma-775c53887949c4d88c77",
        "class": "base"
    },
    {
        "id": "link-gamma-13bd3ce967fcb81f0784-gamma-b4c768313989c19c41e5",
        "fromSystemId": "gamma-13bd3ce967fcb81f0784",
        "toSystemId": "gamma-b4c768313989c19c41e5",
        "class": "base"
    },
    {
        "id": "link-gamma-13bd3ce967fcb81f0784-gamma-c2cb98ebcd33f1452e98",
        "fromSystemId": "gamma-13bd3ce967fcb81f0784",
        "toSystemId": "gamma-c2cb98ebcd33f1452e98",
        "class": "gate"
    },
    {
        "id": "link-gamma-582162e831022c5fbb45-gamma-2b3b53181d66d15d09a6",
        "fromSystemId": "gamma-582162e831022c5fbb45",
        "toSystemId": "gamma-2b3b53181d66d15d09a6",
        "class": "base"
    },
    {
        "id": "link-gamma-582162e831022c5fbb45-gamma-70c116866aa5a710699f",
        "fromSystemId": "gamma-582162e831022c5fbb45",
        "toSystemId": "gamma-70c116866aa5a710699f",
        "class": "gate"
    },
    {
        "id": "link-gamma-ac003cc0150d3e61592b-gamma-af6bedc870efaa430d55",
        "fromSystemId": "gamma-ac003cc0150d3e61592b",
        "toSystemId": "gamma-af6bedc870efaa430d55",
        "class": "base"
    },
    {
        "id": "link-gamma-ac003cc0150d3e61592b-gamma-50f8a8c9ec8420303704",
        "fromSystemId": "gamma-ac003cc0150d3e61592b",
        "toSystemId": "gamma-50f8a8c9ec8420303704",
        "class": "base"
    },
    {
        "id": "link-gamma-ac003cc0150d3e61592b-gamma-0bd1ad18ac2cad2bdaeb",
        "fromSystemId": "gamma-ac003cc0150d3e61592b",
        "toSystemId": "gamma-0bd1ad18ac2cad2bdaeb",
        "class": "base"
    },
    {
        "id": "link-gamma-c2cb98ebcd33f1452e98-gamma-beb36e969fa6ab62fd14",
        "fromSystemId": "gamma-c2cb98ebcd33f1452e98",
        "toSystemId": "gamma-beb36e969fa6ab62fd14",
        "class": "base"
    },
    {
        "id": "link-gamma-9f9546aece13cf3303e9-gamma-0bd1ad18ac2cad2bdaeb",
        "fromSystemId": "gamma-9f9546aece13cf3303e9",
        "toSystemId": "gamma-0bd1ad18ac2cad2bdaeb",
        "class": "base"
    },
    {
        "id": "link-gamma-9f9546aece13cf3303e9-gamma-820819a6ca58597dfb2e",
        "fromSystemId": "gamma-9f9546aece13cf3303e9",
        "toSystemId": "gamma-820819a6ca58597dfb2e",
        "class": "gate"
    },
    {
        "id": "link-gamma-9f9546aece13cf3303e9-gamma-d0c866c35ef74cbb4ea1",
        "fromSystemId": "gamma-9f9546aece13cf3303e9",
        "toSystemId": "gamma-d0c866c35ef74cbb4ea1",
        "class": "base"
    },
    {
        "id": "link-gamma-f04fa0c13b1d442fea83-gamma-8ecfdc5d70dde035eb06",
        "fromSystemId": "gamma-f04fa0c13b1d442fea83",
        "toSystemId": "gamma-8ecfdc5d70dde035eb06",
        "class": "base"
    },
    {
        "id": "link-gamma-108b79fabce3d02f1638-gamma-7bca59b7eac72aef0816",
        "fromSystemId": "gamma-108b79fabce3d02f1638",
        "toSystemId": "gamma-7bca59b7eac72aef0816",
        "class": "base"
    },
    {
        "id": "link-gamma-108b79fabce3d02f1638-gamma-3d68ef177e55f1ad4fd4",
        "fromSystemId": "gamma-108b79fabce3d02f1638",
        "toSystemId": "gamma-3d68ef177e55f1ad4fd4",
        "class": "base"
    },
    {
        "id": "link-gamma-325b47bd762e7a83ada2-gamma-16065a790f8240690bdc",
        "fromSystemId": "gamma-325b47bd762e7a83ada2",
        "toSystemId": "gamma-16065a790f8240690bdc",
        "class": "base"
    },
    {
        "id": "link-gamma-325b47bd762e7a83ada2-gamma-fcef9b84cb40cf60bba2",
        "fromSystemId": "gamma-325b47bd762e7a83ada2",
        "toSystemId": "gamma-fcef9b84cb40cf60bba2",
        "class": "base"
    },
    {
        "id": "link-gamma-d76327d2e9fe73f55c16-gamma-3c996e4b04c0498d39ae",
        "fromSystemId": "gamma-d76327d2e9fe73f55c16",
        "toSystemId": "gamma-3c996e4b04c0498d39ae",
        "class": "base"
    },
    {
        "id": "link-gamma-5dcff4a1f4bc7255af37-gamma-b3fa77f5c534e7dc710d",
        "fromSystemId": "gamma-5dcff4a1f4bc7255af37",
        "toSystemId": "gamma-b3fa77f5c534e7dc710d",
        "class": "gate"
    },
    {
        "id": "link-gamma-5dcff4a1f4bc7255af37-gamma-c29aefb61a1c9c96fc4f",
        "fromSystemId": "gamma-5dcff4a1f4bc7255af37",
        "toSystemId": "gamma-c29aefb61a1c9c96fc4f",
        "class": "gate"
    },
    {
        "id": "link-gamma-5dcff4a1f4bc7255af37-gamma-dc5b13db984702553e92",
        "fromSystemId": "gamma-5dcff4a1f4bc7255af37",
        "toSystemId": "gamma-dc5b13db984702553e92",
        "class": "base"
    },
    {
        "id": "link-gamma-73d9fb058065b51b58dc-gamma-f3f1ca458f6229840a99",
        "fromSystemId": "gamma-73d9fb058065b51b58dc",
        "toSystemId": "gamma-f3f1ca458f6229840a99",
        "class": "gate"
    },
    {
        "id": "link-gamma-73d9fb058065b51b58dc-gamma-4d9d0ce0e294d054d57d",
        "fromSystemId": "gamma-73d9fb058065b51b58dc",
        "toSystemId": "gamma-4d9d0ce0e294d054d57d",
        "class": "base"
    },
    {
        "id": "link-gamma-11b892b24c14155bde5f-gamma-cdde4c2bb81bece8d1ac",
        "fromSystemId": "gamma-11b892b24c14155bde5f",
        "toSystemId": "gamma-cdde4c2bb81bece8d1ac",
        "class": "base"
    },
    {
        "id": "link-gamma-11b892b24c14155bde5f-gamma-a9f24cc1d81380947287",
        "fromSystemId": "gamma-11b892b24c14155bde5f",
        "toSystemId": "gamma-a9f24cc1d81380947287",
        "class": "base"
    },
    {
        "id": "link-gamma-11b892b24c14155bde5f-gamma-c849701c1046f408f82b",
        "fromSystemId": "gamma-11b892b24c14155bde5f",
        "toSystemId": "gamma-c849701c1046f408f82b",
        "class": "gate"
    },
    {
        "id": "link-gamma-3d91c434344dec94d389-gamma-8f31498752a434bf85cf",
        "fromSystemId": "gamma-3d91c434344dec94d389",
        "toSystemId": "gamma-8f31498752a434bf85cf",
        "class": "base"
    },
    {
        "id": "link-gamma-55ae407005cc0bf5d7de-gamma-4143b6a0e3070771cf7f",
        "fromSystemId": "gamma-55ae407005cc0bf5d7de",
        "toSystemId": "gamma-4143b6a0e3070771cf7f",
        "class": "base"
    },
    {
        "id": "link-gamma-55ae407005cc0bf5d7de-gamma-c29aefb61a1c9c96fc4f",
        "fromSystemId": "gamma-55ae407005cc0bf5d7de",
        "toSystemId": "gamma-c29aefb61a1c9c96fc4f",
        "class": "base"
    },
    {
        "id": "link-omicron-7f8283fb75a60d01bf37-omicron-600aefcab6013ddaa627",
        "fromSystemId": "omicron-7f8283fb75a60d01bf37",
        "toSystemId": "omicron-600aefcab6013ddaa627",
        "class": "gate"
    },
    {
        "id": "link-omicron-7f8283fb75a60d01bf37-omicron-151aa60cc9fb0e4b91d9",
        "fromSystemId": "omicron-7f8283fb75a60d01bf37",
        "toSystemId": "omicron-151aa60cc9fb0e4b91d9",
        "class": "base"
    },
    {
        "id": "link-omicron-d8ffa65be5176d4cc4af-omicron-34d85d054b229ed8e8ba",
        "fromSystemId": "omicron-d8ffa65be5176d4cc4af",
        "toSystemId": "omicron-34d85d054b229ed8e8ba",
        "class": "gate"
    },
    {
        "id": "link-omicron-d8ffa65be5176d4cc4af-omicron-7516196752322920bcea",
        "fromSystemId": "omicron-d8ffa65be5176d4cc4af",
        "toSystemId": "omicron-7516196752322920bcea",
        "class": "gate"
    },
    {
        "id": "link-omicron-d8ffa65be5176d4cc4af-omicron-4213b6c914c81fde06f0",
        "fromSystemId": "omicron-d8ffa65be5176d4cc4af",
        "toSystemId": "omicron-4213b6c914c81fde06f0",
        "class": "gate"
    },
    {
        "id": "link-omicron-2eda2e5d39297feaf3d8-omicron-9dd12fe9a3cce425043e",
        "fromSystemId": "omicron-2eda2e5d39297feaf3d8",
        "toSystemId": "omicron-9dd12fe9a3cce425043e",
        "class": "base"
    },
    {
        "id": "link-omicron-2eda2e5d39297feaf3d8-omicron-9e338aec244d2378716d",
        "fromSystemId": "omicron-2eda2e5d39297feaf3d8",
        "toSystemId": "omicron-9e338aec244d2378716d",
        "class": "base"
    },
    {
        "id": "link-omicron-2eda2e5d39297feaf3d8-omicron-0daea28079f81b8fef8f",
        "fromSystemId": "omicron-2eda2e5d39297feaf3d8",
        "toSystemId": "omicron-0daea28079f81b8fef8f",
        "class": "base"
    },
    {
        "id": "link-omicron-26a140d521ed313a2db2-omicron-b62fb9e336bfcf61f5e8",
        "fromSystemId": "omicron-26a140d521ed313a2db2",
        "toSystemId": "omicron-b62fb9e336bfcf61f5e8",
        "class": "base"
    },
    {
        "id": "link-omicron-26a140d521ed313a2db2-omicron-ad89d46ee3ccc115e9db",
        "fromSystemId": "omicron-26a140d521ed313a2db2",
        "toSystemId": "omicron-ad89d46ee3ccc115e9db",
        "class": "base"
    },
    {
        "id": "link-omicron-26a140d521ed313a2db2-omicron-29d121f14536cff6168c",
        "fromSystemId": "omicron-26a140d521ed313a2db2",
        "toSystemId": "omicron-29d121f14536cff6168c",
        "class": "base"
    },
    {
        "id": "link-omicron-a6b34eed2f81b3538700-omicron-0162cbe1fdfcb88e18fb",
        "fromSystemId": "omicron-a6b34eed2f81b3538700",
        "toSystemId": "omicron-0162cbe1fdfcb88e18fb",
        "class": "base"
    },
    {
        "id": "link-omicron-dc1601dfb376639175c7-omicron-3978fcbdedd5c300b1f7",
        "fromSystemId": "omicron-dc1601dfb376639175c7",
        "toSystemId": "omicron-3978fcbdedd5c300b1f7",
        "class": "base"
    },
    {
        "id": "link-omicron-1834335c2305c1da6640-omicron-7516196752322920bcea",
        "fromSystemId": "omicron-1834335c2305c1da6640",
        "toSystemId": "omicron-7516196752322920bcea",
        "class": "base"
    },
    {
        "id": "link-omicron-3d7a21a8033c34d60d4e-omicron-c3f9a580fef78cf98c3b",
        "fromSystemId": "omicron-3d7a21a8033c34d60d4e",
        "toSystemId": "omicron-c3f9a580fef78cf98c3b",
        "class": "base"
    },
    {
        "id": "link-omicron-3d7a21a8033c34d60d4e-omicron-b6f554ec6ca3ef70179b",
        "fromSystemId": "omicron-3d7a21a8033c34d60d4e",
        "toSystemId": "omicron-b6f554ec6ca3ef70179b",
        "class": "base"
    },
    {
        "id": "link-omicron-3d7a21a8033c34d60d4e-omicron-7388d501f9d52ee3c5d2",
        "fromSystemId": "omicron-3d7a21a8033c34d60d4e",
        "toSystemId": "omicron-7388d501f9d52ee3c5d2",
        "class": "base"
    },
    {
        "id": "link-omicron-a14851c3cee03238d7e6-omicron-949d1fb54e31ee8d3f91",
        "fromSystemId": "omicron-a14851c3cee03238d7e6",
        "toSystemId": "omicron-949d1fb54e31ee8d3f91",
        "class": "base"
    },
    {
        "id": "link-omicron-d3854c29cce0165310f7-omicron-22a752a260fe1916d41c",
        "fromSystemId": "omicron-d3854c29cce0165310f7",
        "toSystemId": "omicron-22a752a260fe1916d41c",
        "class": "base"
    },
    {
        "id": "link-omicron-d3854c29cce0165310f7-omicron-8c264b5adcc1ff837ed0",
        "fromSystemId": "omicron-d3854c29cce0165310f7",
        "toSystemId": "omicron-8c264b5adcc1ff837ed0",
        "class": "base"
    },
    {
        "id": "link-omicron-d3854c29cce0165310f7-omicron-c97cead7be9ee318332c",
        "fromSystemId": "omicron-d3854c29cce0165310f7",
        "toSystemId": "omicron-c97cead7be9ee318332c",
        "class": "gate"
    },
    {
        "id": "link-omicron-7d3fc9f19094262d1536-omicron-f9eb57a684a562d602d8",
        "fromSystemId": "omicron-7d3fc9f19094262d1536",
        "toSystemId": "omicron-f9eb57a684a562d602d8",
        "class": "base"
    },
    {
        "id": "link-omicron-7d3fc9f19094262d1536-omicron-600aefcab6013ddaa627",
        "fromSystemId": "omicron-7d3fc9f19094262d1536",
        "toSystemId": "omicron-600aefcab6013ddaa627",
        "class": "base"
    },
    {
        "id": "link-omicron-b62fb9e336bfcf61f5e8-omicron-26a140d521ed313a2db2",
        "fromSystemId": "omicron-b62fb9e336bfcf61f5e8",
        "toSystemId": "omicron-26a140d521ed313a2db2",
        "class": "base"
    },
    {
        "id": "link-omicron-8c264b5adcc1ff837ed0-omicron-c97cead7be9ee318332c",
        "fromSystemId": "omicron-8c264b5adcc1ff837ed0",
        "toSystemId": "omicron-c97cead7be9ee318332c",
        "class": "base"
    },
    {
        "id": "link-omicron-8c264b5adcc1ff837ed0-omicron-d3854c29cce0165310f7",
        "fromSystemId": "omicron-8c264b5adcc1ff837ed0",
        "toSystemId": "omicron-d3854c29cce0165310f7",
        "class": "base"
    },
    {
        "id": "link-omicron-8c264b5adcc1ff837ed0-omicron-0daea28079f81b8fef8f",
        "fromSystemId": "omicron-8c264b5adcc1ff837ed0",
        "toSystemId": "omicron-0daea28079f81b8fef8f",
        "class": "base"
    },
    {
        "id": "link-omicron-3ae1ba293232a7868296-omicron-672727117e15e39778e0",
        "fromSystemId": "omicron-3ae1ba293232a7868296",
        "toSystemId": "omicron-672727117e15e39778e0",
        "class": "base"
    },
    {
        "id": "link-omicron-3ae1ba293232a7868296-omicron-b312ce2a19a19e0dd7d6",
        "fromSystemId": "omicron-3ae1ba293232a7868296",
        "toSystemId": "omicron-b312ce2a19a19e0dd7d6",
        "class": "base"
    },
    {
        "id": "link-omicron-c77c66bae370402138f8-omicron-677484a3b9a2d1a12b82",
        "fromSystemId": "omicron-c77c66bae370402138f8",
        "toSystemId": "omicron-677484a3b9a2d1a12b82",
        "class": "gate"
    },
    {
        "id": "link-omicron-29d121f14536cff6168c-omicron-b62fb9e336bfcf61f5e8",
        "fromSystemId": "omicron-29d121f14536cff6168c",
        "toSystemId": "omicron-b62fb9e336bfcf61f5e8",
        "class": "base"
    },
    {
        "id": "link-omicron-29d121f14536cff6168c-omicron-21930a52e2190eabd979",
        "fromSystemId": "omicron-29d121f14536cff6168c",
        "toSystemId": "omicron-21930a52e2190eabd979",
        "class": "base"
    },
    {
        "id": "link-omicron-29d121f14536cff6168c-omicron-ad89d46ee3ccc115e9db",
        "fromSystemId": "omicron-29d121f14536cff6168c",
        "toSystemId": "omicron-ad89d46ee3ccc115e9db",
        "class": "base"
    },
    {
        "id": "link-omicron-32b5cd8b695ec0b63259-omicron-c136b185e60ca349aec2",
        "fromSystemId": "omicron-32b5cd8b695ec0b63259",
        "toSystemId": "omicron-c136b185e60ca349aec2",
        "class": "gate"
    },
    {
        "id": "link-omicron-32b5cd8b695ec0b63259-omicron-6f59e7529064d2b7386e",
        "fromSystemId": "omicron-32b5cd8b695ec0b63259",
        "toSystemId": "omicron-6f59e7529064d2b7386e",
        "class": "base"
    },
    {
        "id": "link-omicron-32b5cd8b695ec0b63259-omicron-694484106b485f6cdc00",
        "fromSystemId": "omicron-32b5cd8b695ec0b63259",
        "toSystemId": "omicron-694484106b485f6cdc00",
        "class": "base"
    },
    {
        "id": "link-omicron-a9bcb339537580e14dad-omicron-32b5cd8b695ec0b63259",
        "fromSystemId": "omicron-a9bcb339537580e14dad",
        "toSystemId": "omicron-32b5cd8b695ec0b63259",
        "class": "base"
    },
    {
        "id": "link-omicron-9dd12fe9a3cce425043e-omicron-2eda2e5d39297feaf3d8",
        "fromSystemId": "omicron-9dd12fe9a3cce425043e",
        "toSystemId": "omicron-2eda2e5d39297feaf3d8",
        "class": "base"
    },
    {
        "id": "link-omicron-b638d3ee64b8827fae17-omicron-fceff1ab097584801538",
        "fromSystemId": "omicron-b638d3ee64b8827fae17",
        "toSystemId": "omicron-fceff1ab097584801538",
        "class": "base"
    },
    {
        "id": "link-omicron-b638d3ee64b8827fae17-omicron-07bd7df19fdb7e0a0bd1",
        "fromSystemId": "omicron-b638d3ee64b8827fae17",
        "toSystemId": "omicron-07bd7df19fdb7e0a0bd1",
        "class": "gate"
    },
    {
        "id": "link-omicron-b638d3ee64b8827fae17-omicron-50c2b86df50cdeb73412",
        "fromSystemId": "omicron-b638d3ee64b8827fae17",
        "toSystemId": "omicron-50c2b86df50cdeb73412",
        "class": "base"
    },
    {
        "id": "link-omicron-21930a52e2190eabd979-omicron-29d121f14536cff6168c",
        "fromSystemId": "omicron-21930a52e2190eabd979",
        "toSystemId": "omicron-29d121f14536cff6168c",
        "class": "base"
    },
    {
        "id": "link-omicron-21930a52e2190eabd979-omicron-60a9f91861a71b8780be",
        "fromSystemId": "omicron-21930a52e2190eabd979",
        "toSystemId": "omicron-60a9f91861a71b8780be",
        "class": "base"
    },
    {
        "id": "link-omicron-21930a52e2190eabd979-omicron-b62fb9e336bfcf61f5e8",
        "fromSystemId": "omicron-21930a52e2190eabd979",
        "toSystemId": "omicron-b62fb9e336bfcf61f5e8",
        "class": "base"
    },
    {
        "id": "link-omicron-34d85d054b229ed8e8ba-omicron-d8ffa65be5176d4cc4af",
        "fromSystemId": "omicron-34d85d054b229ed8e8ba",
        "toSystemId": "omicron-d8ffa65be5176d4cc4af",
        "class": "base"
    },
    {
        "id": "link-omicron-34d85d054b229ed8e8ba-omicron-69e9d95fa3d3d75978d0",
        "fromSystemId": "omicron-34d85d054b229ed8e8ba",
        "toSystemId": "omicron-69e9d95fa3d3d75978d0",
        "class": "base"
    },
    {
        "id": "link-omicron-0daea28079f81b8fef8f-omicron-c97cead7be9ee318332c",
        "fromSystemId": "omicron-0daea28079f81b8fef8f",
        "toSystemId": "omicron-c97cead7be9ee318332c",
        "class": "base"
    },
    {
        "id": "link-omicron-6f59e7529064d2b7386e-omicron-c136b185e60ca349aec2",
        "fromSystemId": "omicron-6f59e7529064d2b7386e",
        "toSystemId": "omicron-c136b185e60ca349aec2",
        "class": "base"
    },
    {
        "id": "link-omicron-9e338aec244d2378716d-omicron-2eda2e5d39297feaf3d8",
        "fromSystemId": "omicron-9e338aec244d2378716d",
        "toSystemId": "omicron-2eda2e5d39297feaf3d8",
        "class": "base"
    },
    {
        "id": "link-omicron-672727117e15e39778e0-omicron-3ae1ba293232a7868296",
        "fromSystemId": "omicron-672727117e15e39778e0",
        "toSystemId": "omicron-3ae1ba293232a7868296",
        "class": "base"
    },
    {
        "id": "link-omicron-672727117e15e39778e0-omicron-b312ce2a19a19e0dd7d6",
        "fromSystemId": "omicron-672727117e15e39778e0",
        "toSystemId": "omicron-b312ce2a19a19e0dd7d6",
        "class": "base"
    },
    {
        "id": "link-omicron-672727117e15e39778e0-omicron-0322b443d18dfabe2c32",
        "fromSystemId": "omicron-672727117e15e39778e0",
        "toSystemId": "omicron-0322b443d18dfabe2c32",
        "class": "gate"
    },
    {
        "id": "link-omicron-b312ce2a19a19e0dd7d6-omicron-3ae1ba293232a7868296",
        "fromSystemId": "omicron-b312ce2a19a19e0dd7d6",
        "toSystemId": "omicron-3ae1ba293232a7868296",
        "class": "base"
    },
    {
        "id": "link-omicron-b312ce2a19a19e0dd7d6-omicron-0322b443d18dfabe2c32",
        "fromSystemId": "omicron-b312ce2a19a19e0dd7d6",
        "toSystemId": "omicron-0322b443d18dfabe2c32",
        "class": "base"
    },
    {
        "id": "link-omicron-a681658aca40ebe357c2-omicron-789203298a78e54523b2",
        "fromSystemId": "omicron-a681658aca40ebe357c2",
        "toSystemId": "omicron-789203298a78e54523b2",
        "class": "base"
    },
    {
        "id": "link-omicron-c0d98ad3ddfe5050f152-omicron-7516196752322920bcea",
        "fromSystemId": "omicron-c0d98ad3ddfe5050f152",
        "toSystemId": "omicron-7516196752322920bcea",
        "class": "base"
    },
    {
        "id": "link-omicron-c0d98ad3ddfe5050f152-omicron-cc4aea94709241c20bf6",
        "fromSystemId": "omicron-c0d98ad3ddfe5050f152",
        "toSystemId": "omicron-cc4aea94709241c20bf6",
        "class": "base"
    },
    {
        "id": "link-omicron-062e9f7e9efaad335db6-omicron-9dd12fe9a3cce425043e",
        "fromSystemId": "omicron-062e9f7e9efaad335db6",
        "toSystemId": "omicron-9dd12fe9a3cce425043e",
        "class": "base"
    },
    {
        "id": "link-omicron-062e9f7e9efaad335db6-omicron-69282fe418afcc78b095",
        "fromSystemId": "omicron-062e9f7e9efaad335db6",
        "toSystemId": "omicron-69282fe418afcc78b095",
        "class": "base"
    },
    {
        "id": "link-omicron-4834e5b4bb4c2c146d8e-omicron-606952beae05205ae47f",
        "fromSystemId": "omicron-4834e5b4bb4c2c146d8e",
        "toSystemId": "omicron-606952beae05205ae47f",
        "class": "base"
    },
    {
        "id": "link-omicron-c86b09367f435f7aa417-omicron-a5f695c9a93f9586aa26",
        "fromSystemId": "omicron-c86b09367f435f7aa417",
        "toSystemId": "omicron-a5f695c9a93f9586aa26",
        "class": "base"
    },
    {
        "id": "link-omicron-c86b09367f435f7aa417-omicron-7d3fc9f19094262d1536",
        "fromSystemId": "omicron-c86b09367f435f7aa417",
        "toSystemId": "omicron-7d3fc9f19094262d1536",
        "class": "gate"
    },
    {
        "id": "link-omicron-c86b09367f435f7aa417-omicron-600aefcab6013ddaa627",
        "fromSystemId": "omicron-c86b09367f435f7aa417",
        "toSystemId": "omicron-600aefcab6013ddaa627",
        "class": "base"
    },
    {
        "id": "link-omicron-762e641bc34e7adc6a47-omicron-91480f97b237b6e50b23",
        "fromSystemId": "omicron-762e641bc34e7adc6a47",
        "toSystemId": "omicron-91480f97b237b6e50b23",
        "class": "base"
    },
    {
        "id": "link-omicron-762e641bc34e7adc6a47-omicron-dadedd026d3a9a800d4b",
        "fromSystemId": "omicron-762e641bc34e7adc6a47",
        "toSystemId": "omicron-dadedd026d3a9a800d4b",
        "class": "base"
    },
    {
        "id": "link-omicron-762e641bc34e7adc6a47-omicron-565b620e091c89739668",
        "fromSystemId": "omicron-762e641bc34e7adc6a47",
        "toSystemId": "omicron-565b620e091c89739668",
        "class": "base"
    },
    {
        "id": "link-omicron-e9673f5b3e42510ca277-omicron-bb4225daabf90c51c748",
        "fromSystemId": "omicron-e9673f5b3e42510ca277",
        "toSystemId": "omicron-bb4225daabf90c51c748",
        "class": "base"
    },
    {
        "id": "link-omicron-e9673f5b3e42510ca277-omicron-0daea28079f81b8fef8f",
        "fromSystemId": "omicron-e9673f5b3e42510ca277",
        "toSystemId": "omicron-0daea28079f81b8fef8f",
        "class": "base"
    },
    {
        "id": "link-omicron-4213b6c914c81fde06f0-omicron-ad89d46ee3ccc115e9db",
        "fromSystemId": "omicron-4213b6c914c81fde06f0",
        "toSystemId": "omicron-ad89d46ee3ccc115e9db",
        "class": "base"
    },
    {
        "id": "link-omicron-4430702b13a357065a80-omicron-ea164e0fe337ad7a9235",
        "fromSystemId": "omicron-4430702b13a357065a80",
        "toSystemId": "omicron-ea164e0fe337ad7a9235",
        "class": "base"
    },
    {
        "id": "link-omicron-394fe066e6f28452b0bb-omicron-f4c44eb9317d6036df9e",
        "fromSystemId": "omicron-394fe066e6f28452b0bb",
        "toSystemId": "omicron-f4c44eb9317d6036df9e",
        "class": "base"
    },
    {
        "id": "link-omicron-cfebd4b7c8b79c4d2a67-omicron-4834e5b4bb4c2c146d8e",
        "fromSystemId": "omicron-cfebd4b7c8b79c4d2a67",
        "toSystemId": "omicron-4834e5b4bb4c2c146d8e",
        "class": "base"
    },
    {
        "id": "link-omicron-cfebd4b7c8b79c4d2a67-omicron-fc6707528d16c5590dd9",
        "fromSystemId": "omicron-cfebd4b7c8b79c4d2a67",
        "toSystemId": "omicron-fc6707528d16c5590dd9",
        "class": "base"
    },
    {
        "id": "link-omicron-cfebd4b7c8b79c4d2a67-omicron-606952beae05205ae47f",
        "fromSystemId": "omicron-cfebd4b7c8b79c4d2a67",
        "toSystemId": "omicron-606952beae05205ae47f",
        "class": "base"
    },
    {
        "id": "link-omicron-ba732aa85127a7e61d48-omicron-5d0c4cc3a51ad57a3bd9",
        "fromSystemId": "omicron-ba732aa85127a7e61d48",
        "toSystemId": "omicron-5d0c4cc3a51ad57a3bd9",
        "class": "base"
    },
    {
        "id": "link-omicron-ba732aa85127a7e61d48-omicron-3978fcbdedd5c300b1f7",
        "fromSystemId": "omicron-ba732aa85127a7e61d48",
        "toSystemId": "omicron-3978fcbdedd5c300b1f7",
        "class": "base"
    },
    {
        "id": "link-omicron-a7e35ae907f40505004b-omicron-dadedd026d3a9a800d4b",
        "fromSystemId": "omicron-a7e35ae907f40505004b",
        "toSystemId": "omicron-dadedd026d3a9a800d4b",
        "class": "base"
    },
    {
        "id": "link-omicron-a7e35ae907f40505004b-omicron-3aeed261c4e9ba80a0c5",
        "fromSystemId": "omicron-a7e35ae907f40505004b",
        "toSystemId": "omicron-3aeed261c4e9ba80a0c5",
        "class": "base"
    },
    {
        "id": "link-omicron-04884114b28745107682-omicron-cb0a9ffa8bab25a7c679",
        "fromSystemId": "omicron-04884114b28745107682",
        "toSystemId": "omicron-cb0a9ffa8bab25a7c679",
        "class": "base"
    },
    {
        "id": "link-omicron-04884114b28745107682-omicron-6f59e7529064d2b7386e",
        "fromSystemId": "omicron-04884114b28745107682",
        "toSystemId": "omicron-6f59e7529064d2b7386e",
        "class": "base"
    },
    {
        "id": "link-omicron-04884114b28745107682-omicron-394fe066e6f28452b0bb",
        "fromSystemId": "omicron-04884114b28745107682",
        "toSystemId": "omicron-394fe066e6f28452b0bb",
        "class": "gate"
    },
    {
        "id": "link-omicron-606952beae05205ae47f-omicron-4834e5b4bb4c2c146d8e",
        "fromSystemId": "omicron-606952beae05205ae47f",
        "toSystemId": "omicron-4834e5b4bb4c2c146d8e",
        "class": "gate"
    },
    {
        "id": "link-omicron-606952beae05205ae47f-omicron-789203298a78e54523b2",
        "fromSystemId": "omicron-606952beae05205ae47f",
        "toSystemId": "omicron-789203298a78e54523b2",
        "class": "base"
    },
    {
        "id": "link-omicron-606952beae05205ae47f-omicron-cfebd4b7c8b79c4d2a67",
        "fromSystemId": "omicron-606952beae05205ae47f",
        "toSystemId": "omicron-cfebd4b7c8b79c4d2a67",
        "class": "base"
    },
    {
        "id": "link-omicron-f4c44eb9317d6036df9e-omicron-394fe066e6f28452b0bb",
        "fromSystemId": "omicron-f4c44eb9317d6036df9e",
        "toSystemId": "omicron-394fe066e6f28452b0bb",
        "class": "gate"
    },
    {
        "id": "link-omicron-e1fa10cf020de0873514-omicron-ad89d46ee3ccc115e9db",
        "fromSystemId": "omicron-e1fa10cf020de0873514",
        "toSystemId": "omicron-ad89d46ee3ccc115e9db",
        "class": "base"
    },
    {
        "id": "link-omicron-1a52fa2e192ad338b448-omicron-c83e6dd202449322ebc3",
        "fromSystemId": "omicron-1a52fa2e192ad338b448",
        "toSystemId": "omicron-c83e6dd202449322ebc3",
        "class": "base"
    },
    {
        "id": "link-omicron-1a52fa2e192ad338b448-omicron-60a9f91861a71b8780be",
        "fromSystemId": "omicron-1a52fa2e192ad338b448",
        "toSystemId": "omicron-60a9f91861a71b8780be",
        "class": "base"
    },
    {
        "id": "link-omicron-1a52fa2e192ad338b448-omicron-f4c44eb9317d6036df9e",
        "fromSystemId": "omicron-1a52fa2e192ad338b448",
        "toSystemId": "omicron-f4c44eb9317d6036df9e",
        "class": "base"
    },
    {
        "id": "link-omicron-ea164e0fe337ad7a9235-omicron-4430702b13a357065a80",
        "fromSystemId": "omicron-ea164e0fe337ad7a9235",
        "toSystemId": "omicron-4430702b13a357065a80",
        "class": "base"
    },
    {
        "id": "link-omicron-ea164e0fe337ad7a9235-omicron-565b620e091c89739668",
        "fromSystemId": "omicron-ea164e0fe337ad7a9235",
        "toSystemId": "omicron-565b620e091c89739668",
        "class": "gate"
    },
    {
        "id": "link-omicron-ea164e0fe337ad7a9235-omicron-677484a3b9a2d1a12b82",
        "fromSystemId": "omicron-ea164e0fe337ad7a9235",
        "toSystemId": "omicron-677484a3b9a2d1a12b82",
        "class": "base"
    },
    {
        "id": "link-omicron-c136b185e60ca349aec2-omicron-32b5cd8b695ec0b63259",
        "fromSystemId": "omicron-c136b185e60ca349aec2",
        "toSystemId": "omicron-32b5cd8b695ec0b63259",
        "class": "base"
    },
    {
        "id": "link-omicron-3aeed261c4e9ba80a0c5-omicron-949d1fb54e31ee8d3f91",
        "fromSystemId": "omicron-3aeed261c4e9ba80a0c5",
        "toSystemId": "omicron-949d1fb54e31ee8d3f91",
        "class": "base"
    },
    {
        "id": "link-omicron-3aeed261c4e9ba80a0c5-omicron-a7e35ae907f40505004b",
        "fromSystemId": "omicron-3aeed261c4e9ba80a0c5",
        "toSystemId": "omicron-a7e35ae907f40505004b",
        "class": "base"
    },
    {
        "id": "link-omicron-c83e6dd202449322ebc3-omicron-1a52fa2e192ad338b448",
        "fromSystemId": "omicron-c83e6dd202449322ebc3",
        "toSystemId": "omicron-1a52fa2e192ad338b448",
        "class": "gate"
    },
    {
        "id": "link-omicron-1f8d9300a1168ce106a2-omicron-fc6707528d16c5590dd9",
        "fromSystemId": "omicron-1f8d9300a1168ce106a2",
        "toSystemId": "omicron-fc6707528d16c5590dd9",
        "class": "base"
    },
    {
        "id": "link-omicron-1f8d9300a1168ce106a2-omicron-4834e5b4bb4c2c146d8e",
        "fromSystemId": "omicron-1f8d9300a1168ce106a2",
        "toSystemId": "omicron-4834e5b4bb4c2c146d8e",
        "class": "base"
    },
    {
        "id": "link-omicron-1f8d9300a1168ce106a2-omicron-cfebd4b7c8b79c4d2a67",
        "fromSystemId": "omicron-1f8d9300a1168ce106a2",
        "toSystemId": "omicron-cfebd4b7c8b79c4d2a67",
        "class": "base"
    },
    {
        "id": "link-omicron-5a8fab5a3f2d61d70e84-omicron-0322b443d18dfabe2c32",
        "fromSystemId": "omicron-5a8fab5a3f2d61d70e84",
        "toSystemId": "omicron-0322b443d18dfabe2c32",
        "class": "base"
    },
    {
        "id": "link-omicron-5a8fab5a3f2d61d70e84-omicron-c77c66bae370402138f8",
        "fromSystemId": "omicron-5a8fab5a3f2d61d70e84",
        "toSystemId": "omicron-c77c66bae370402138f8",
        "class": "base"
    },
    {
        "id": "link-omicron-5a8fab5a3f2d61d70e84-omicron-677484a3b9a2d1a12b82",
        "fromSystemId": "omicron-5a8fab5a3f2d61d70e84",
        "toSystemId": "omicron-677484a3b9a2d1a12b82",
        "class": "base"
    },
    {
        "id": "link-omicron-7516196752322920bcea-omicron-d8ffa65be5176d4cc4af",
        "fromSystemId": "omicron-7516196752322920bcea",
        "toSystemId": "omicron-d8ffa65be5176d4cc4af",
        "class": "base"
    },
    {
        "id": "link-omicron-5d0c4cc3a51ad57a3bd9-omicron-ba732aa85127a7e61d48",
        "fromSystemId": "omicron-5d0c4cc3a51ad57a3bd9",
        "toSystemId": "omicron-ba732aa85127a7e61d48",
        "class": "gate"
    },
    {
        "id": "link-omicron-5d0c4cc3a51ad57a3bd9-omicron-b3cda7b699fed1b379b1",
        "fromSystemId": "omicron-5d0c4cc3a51ad57a3bd9",
        "toSystemId": "omicron-b3cda7b699fed1b379b1",
        "class": "base"
    },
    {
        "id": "link-omicron-cb8ff32dbdb88371a2a0-omicron-1834335c2305c1da6640",
        "fromSystemId": "omicron-cb8ff32dbdb88371a2a0",
        "toSystemId": "omicron-1834335c2305c1da6640",
        "class": "gate"
    },
    {
        "id": "link-omicron-cb8ff32dbdb88371a2a0-omicron-7516196752322920bcea",
        "fromSystemId": "omicron-cb8ff32dbdb88371a2a0",
        "toSystemId": "omicron-7516196752322920bcea",
        "class": "base"
    },
    {
        "id": "link-omicron-cb8ff32dbdb88371a2a0-omicron-d8ffa65be5176d4cc4af",
        "fromSystemId": "omicron-cb8ff32dbdb88371a2a0",
        "toSystemId": "omicron-d8ffa65be5176d4cc4af",
        "class": "gate"
    },
    {
        "id": "link-omicron-41f3cd531e9926c1a127-omicron-c97cead7be9ee318332c",
        "fromSystemId": "omicron-41f3cd531e9926c1a127",
        "toSystemId": "omicron-c97cead7be9ee318332c",
        "class": "base"
    },
    {
        "id": "link-omicron-41f3cd531e9926c1a127-omicron-9e338aec244d2378716d",
        "fromSystemId": "omicron-41f3cd531e9926c1a127",
        "toSystemId": "omicron-9e338aec244d2378716d",
        "class": "base"
    },
    {
        "id": "link-omicron-41f3cd531e9926c1a127-omicron-0daea28079f81b8fef8f",
        "fromSystemId": "omicron-41f3cd531e9926c1a127",
        "toSystemId": "omicron-0daea28079f81b8fef8f",
        "class": "gate"
    },
    {
        "id": "link-omicron-e7de1134dd7a8b29c02e-omicron-8fe902922069c4d7a08b",
        "fromSystemId": "omicron-e7de1134dd7a8b29c02e",
        "toSystemId": "omicron-8fe902922069c4d7a08b",
        "class": "base"
    },
    {
        "id": "link-omicron-ad89d46ee3ccc115e9db-omicron-b62fb9e336bfcf61f5e8",
        "fromSystemId": "omicron-ad89d46ee3ccc115e9db",
        "toSystemId": "omicron-b62fb9e336bfcf61f5e8",
        "class": "gate"
    },
    {
        "id": "link-omicron-bed421bb82e32a7fc4db-omicron-2c20a70dc6f89cc4d700",
        "fromSystemId": "omicron-bed421bb82e32a7fc4db",
        "toSystemId": "omicron-2c20a70dc6f89cc4d700",
        "class": "base"
    },
    {
        "id": "link-omicron-0b0ac9d146088032f169-omicron-5d0c4cc3a51ad57a3bd9",
        "fromSystemId": "omicron-0b0ac9d146088032f169",
        "toSystemId": "omicron-5d0c4cc3a51ad57a3bd9",
        "class": "gate"
    },
    {
        "id": "link-omicron-0b0ac9d146088032f169-omicron-b3cda7b699fed1b379b1",
        "fromSystemId": "omicron-0b0ac9d146088032f169",
        "toSystemId": "omicron-b3cda7b699fed1b379b1",
        "class": "base"
    },
    {
        "id": "link-omicron-7388d501f9d52ee3c5d2-omicron-d5047f9bd0140c16bd7a",
        "fromSystemId": "omicron-7388d501f9d52ee3c5d2",
        "toSystemId": "omicron-d5047f9bd0140c16bd7a",
        "class": "base"
    },
    {
        "id": "link-omicron-7388d501f9d52ee3c5d2-omicron-b6f554ec6ca3ef70179b",
        "fromSystemId": "omicron-7388d501f9d52ee3c5d2",
        "toSystemId": "omicron-b6f554ec6ca3ef70179b",
        "class": "base"
    },
    {
        "id": "link-omicron-fceff1ab097584801538-omicron-b638d3ee64b8827fae17",
        "fromSystemId": "omicron-fceff1ab097584801538",
        "toSystemId": "omicron-b638d3ee64b8827fae17",
        "class": "gate"
    },
    {
        "id": "link-omicron-fceff1ab097584801538-omicron-07bd7df19fdb7e0a0bd1",
        "fromSystemId": "omicron-fceff1ab097584801538",
        "toSystemId": "omicron-07bd7df19fdb7e0a0bd1",
        "class": "gate"
    },
    {
        "id": "link-omicron-fceff1ab097584801538-omicron-50c2b86df50cdeb73412",
        "fromSystemId": "omicron-fceff1ab097584801538",
        "toSystemId": "omicron-50c2b86df50cdeb73412",
        "class": "gate"
    },
    {
        "id": "link-omicron-69e9d95fa3d3d75978d0-omicron-34d85d054b229ed8e8ba",
        "fromSystemId": "omicron-69e9d95fa3d3d75978d0",
        "toSystemId": "omicron-34d85d054b229ed8e8ba",
        "class": "base"
    },
    {
        "id": "link-omicron-69e9d95fa3d3d75978d0-omicron-e1fa10cf020de0873514",
        "fromSystemId": "omicron-69e9d95fa3d3d75978d0",
        "toSystemId": "omicron-e1fa10cf020de0873514",
        "class": "gate"
    },
    {
        "id": "link-omicron-9361fbc3dfd165d74002-omicron-bb4225daabf90c51c748",
        "fromSystemId": "omicron-9361fbc3dfd165d74002",
        "toSystemId": "omicron-bb4225daabf90c51c748",
        "class": "gate"
    },
    {
        "id": "link-omicron-9361fbc3dfd165d74002-omicron-fceff1ab097584801538",
        "fromSystemId": "omicron-9361fbc3dfd165d74002",
        "toSystemId": "omicron-fceff1ab097584801538",
        "class": "base"
    },
    {
        "id": "link-omicron-9361fbc3dfd165d74002-omicron-50c2b86df50cdeb73412",
        "fromSystemId": "omicron-9361fbc3dfd165d74002",
        "toSystemId": "omicron-50c2b86df50cdeb73412",
        "class": "base"
    },
    {
        "id": "link-omicron-b3cda7b699fed1b379b1-omicron-dc1601dfb376639175c7",
        "fromSystemId": "omicron-b3cda7b699fed1b379b1",
        "toSystemId": "omicron-dc1601dfb376639175c7",
        "class": "base"
    },
    {
        "id": "link-omicron-b3cda7b699fed1b379b1-omicron-5d0c4cc3a51ad57a3bd9",
        "fromSystemId": "omicron-b3cda7b699fed1b379b1",
        "toSystemId": "omicron-5d0c4cc3a51ad57a3bd9",
        "class": "gate"
    },
    {
        "id": "link-omicron-b3cda7b699fed1b379b1-omicron-0b0ac9d146088032f169",
        "fromSystemId": "omicron-b3cda7b699fed1b379b1",
        "toSystemId": "omicron-0b0ac9d146088032f169",
        "class": "gate"
    },
    {
        "id": "link-omicron-91480f97b237b6e50b23-omicron-762e641bc34e7adc6a47",
        "fromSystemId": "omicron-91480f97b237b6e50b23",
        "toSystemId": "omicron-762e641bc34e7adc6a47",
        "class": "base"
    },
    {
        "id": "link-omicron-91480f97b237b6e50b23-omicron-565b620e091c89739668",
        "fromSystemId": "omicron-91480f97b237b6e50b23",
        "toSystemId": "omicron-565b620e091c89739668",
        "class": "base"
    },
    {
        "id": "link-omicron-8fe902922069c4d7a08b-omicron-e7de1134dd7a8b29c02e",
        "fromSystemId": "omicron-8fe902922069c4d7a08b",
        "toSystemId": "omicron-e7de1134dd7a8b29c02e",
        "class": "base"
    },
    {
        "id": "link-omicron-8fe902922069c4d7a08b-omicron-0162cbe1fdfcb88e18fb",
        "fromSystemId": "omicron-8fe902922069c4d7a08b",
        "toSystemId": "omicron-0162cbe1fdfcb88e18fb",
        "class": "base"
    },
    {
        "id": "link-omicron-8fe902922069c4d7a08b-omicron-a6b34eed2f81b3538700",
        "fromSystemId": "omicron-8fe902922069c4d7a08b",
        "toSystemId": "omicron-a6b34eed2f81b3538700",
        "class": "base"
    },
    {
        "id": "link-omicron-694484106b485f6cdc00-omicron-cb0a9ffa8bab25a7c679",
        "fromSystemId": "omicron-694484106b485f6cdc00",
        "toSystemId": "omicron-cb0a9ffa8bab25a7c679",
        "class": "base"
    },
    {
        "id": "link-omicron-694484106b485f6cdc00-omicron-c136b185e60ca349aec2",
        "fromSystemId": "omicron-694484106b485f6cdc00",
        "toSystemId": "omicron-c136b185e60ca349aec2",
        "class": "base"
    },
    {
        "id": "link-omicron-b01b35f34be8ebb57001-omicron-2e768b41e0d1c4494bb6",
        "fromSystemId": "omicron-b01b35f34be8ebb57001",
        "toSystemId": "omicron-2e768b41e0d1c4494bb6",
        "class": "base"
    },
    {
        "id": "link-omicron-b01b35f34be8ebb57001-omicron-c83e6dd202449322ebc3",
        "fromSystemId": "omicron-b01b35f34be8ebb57001",
        "toSystemId": "omicron-c83e6dd202449322ebc3",
        "class": "base"
    },
    {
        "id": "link-omicron-cb0a9ffa8bab25a7c679-omicron-6f59e7529064d2b7386e",
        "fromSystemId": "omicron-cb0a9ffa8bab25a7c679",
        "toSystemId": "omicron-6f59e7529064d2b7386e",
        "class": "base"
    },
    {
        "id": "link-omicron-cb0a9ffa8bab25a7c679-omicron-04884114b28745107682",
        "fromSystemId": "omicron-cb0a9ffa8bab25a7c679",
        "toSystemId": "omicron-04884114b28745107682",
        "class": "base"
    },
    {
        "id": "link-omicron-600aefcab6013ddaa627-omicron-7f8283fb75a60d01bf37",
        "fromSystemId": "omicron-600aefcab6013ddaa627",
        "toSystemId": "omicron-7f8283fb75a60d01bf37",
        "class": "base"
    },
    {
        "id": "link-omicron-600aefcab6013ddaa627-omicron-7d3fc9f19094262d1536",
        "fromSystemId": "omicron-600aefcab6013ddaa627",
        "toSystemId": "omicron-7d3fc9f19094262d1536",
        "class": "base"
    },
    {
        "id": "link-omicron-bb74e651c6293bf3335c-omicron-f9eb57a684a562d602d8",
        "fromSystemId": "omicron-bb74e651c6293bf3335c",
        "toSystemId": "omicron-f9eb57a684a562d602d8",
        "class": "base"
    },
    {
        "id": "link-omicron-bb74e651c6293bf3335c-omicron-7d3fc9f19094262d1536",
        "fromSystemId": "omicron-bb74e651c6293bf3335c",
        "toSystemId": "omicron-7d3fc9f19094262d1536",
        "class": "base"
    },
    {
        "id": "link-omicron-69282fe418afcc78b095-omicron-a7e35ae907f40505004b",
        "fromSystemId": "omicron-69282fe418afcc78b095",
        "toSystemId": "omicron-a7e35ae907f40505004b",
        "class": "base"
    },
    {
        "id": "link-omicron-69282fe418afcc78b095-omicron-dadedd026d3a9a800d4b",
        "fromSystemId": "omicron-69282fe418afcc78b095",
        "toSystemId": "omicron-dadedd026d3a9a800d4b",
        "class": "base"
    },
    {
        "id": "link-omicron-69282fe418afcc78b095-omicron-062e9f7e9efaad335db6",
        "fromSystemId": "omicron-69282fe418afcc78b095",
        "toSystemId": "omicron-062e9f7e9efaad335db6",
        "class": "base"
    },
    {
        "id": "link-omicron-34fec72fcd6dc6f7666e-omicron-7f8283fb75a60d01bf37",
        "fromSystemId": "omicron-34fec72fcd6dc6f7666e",
        "toSystemId": "omicron-7f8283fb75a60d01bf37",
        "class": "gate"
    },
    {
        "id": "link-omicron-34fec72fcd6dc6f7666e-omicron-a14851c3cee03238d7e6",
        "fromSystemId": "omicron-34fec72fcd6dc6f7666e",
        "toSystemId": "omicron-a14851c3cee03238d7e6",
        "class": "base"
    },
    {
        "id": "link-omicron-34fec72fcd6dc6f7666e-omicron-151aa60cc9fb0e4b91d9",
        "fromSystemId": "omicron-34fec72fcd6dc6f7666e",
        "toSystemId": "omicron-151aa60cc9fb0e4b91d9",
        "class": "base"
    },
    {
        "id": "link-omicron-de07956e9d6833f9918c-omicron-b6f554ec6ca3ef70179b",
        "fromSystemId": "omicron-de07956e9d6833f9918c",
        "toSystemId": "omicron-b6f554ec6ca3ef70179b",
        "class": "gate"
    },
    {
        "id": "link-omicron-f9eb57a684a562d602d8-omicron-7d3fc9f19094262d1536",
        "fromSystemId": "omicron-f9eb57a684a562d602d8",
        "toSystemId": "omicron-7d3fc9f19094262d1536",
        "class": "base"
    },
    {
        "id": "link-omicron-f9eb57a684a562d602d8-omicron-bb74e651c6293bf3335c",
        "fromSystemId": "omicron-f9eb57a684a562d602d8",
        "toSystemId": "omicron-bb74e651c6293bf3335c",
        "class": "base"
    },
    {
        "id": "link-omicron-22a752a260fe1916d41c-omicron-d3854c29cce0165310f7",
        "fromSystemId": "omicron-22a752a260fe1916d41c",
        "toSystemId": "omicron-d3854c29cce0165310f7",
        "class": "base"
    },
    {
        "id": "link-omicron-22a752a260fe1916d41c-omicron-8c264b5adcc1ff837ed0",
        "fromSystemId": "omicron-22a752a260fe1916d41c",
        "toSystemId": "omicron-8c264b5adcc1ff837ed0",
        "class": "gate"
    },
    {
        "id": "link-omicron-565b620e091c89739668-omicron-91480f97b237b6e50b23",
        "fromSystemId": "omicron-565b620e091c89739668",
        "toSystemId": "omicron-91480f97b237b6e50b23",
        "class": "base"
    },
    {
        "id": "link-omicron-2c20a70dc6f89cc4d700-omicron-bed421bb82e32a7fc4db",
        "fromSystemId": "omicron-2c20a70dc6f89cc4d700",
        "toSystemId": "omicron-bed421bb82e32a7fc4db",
        "class": "base"
    },
    {
        "id": "link-omicron-2c20a70dc6f89cc4d700-omicron-672727117e15e39778e0",
        "fromSystemId": "omicron-2c20a70dc6f89cc4d700",
        "toSystemId": "omicron-672727117e15e39778e0",
        "class": "base"
    },
    {
        "id": "link-omicron-2c20a70dc6f89cc4d700-omicron-1f8d9300a1168ce106a2",
        "fromSystemId": "omicron-2c20a70dc6f89cc4d700",
        "toSystemId": "omicron-1f8d9300a1168ce106a2",
        "class": "base"
    },
    {
        "id": "link-omicron-2e768b41e0d1c4494bb6-omicron-b01b35f34be8ebb57001",
        "fromSystemId": "omicron-2e768b41e0d1c4494bb6",
        "toSystemId": "omicron-b01b35f34be8ebb57001",
        "class": "base"
    },
    {
        "id": "link-omicron-2e768b41e0d1c4494bb6-omicron-394fe066e6f28452b0bb",
        "fromSystemId": "omicron-2e768b41e0d1c4494bb6",
        "toSystemId": "omicron-394fe066e6f28452b0bb",
        "class": "base"
    },
    {
        "id": "link-omicron-2a4c453fbee0b598b19e-omicron-cc4aea94709241c20bf6",
        "fromSystemId": "omicron-2a4c453fbee0b598b19e",
        "toSystemId": "omicron-cc4aea94709241c20bf6",
        "class": "base"
    },
    {
        "id": "link-omicron-2a4c453fbee0b598b19e-omicron-1834335c2305c1da6640",
        "fromSystemId": "omicron-2a4c453fbee0b598b19e",
        "toSystemId": "omicron-1834335c2305c1da6640",
        "class": "base"
    },
    {
        "id": "link-omicron-2a4c453fbee0b598b19e-omicron-c0d98ad3ddfe5050f152",
        "fromSystemId": "omicron-2a4c453fbee0b598b19e",
        "toSystemId": "omicron-c0d98ad3ddfe5050f152",
        "class": "base"
    },
    {
        "id": "link-omicron-60a9f91861a71b8780be-omicron-1a52fa2e192ad338b448",
        "fromSystemId": "omicron-60a9f91861a71b8780be",
        "toSystemId": "omicron-1a52fa2e192ad338b448",
        "class": "base"
    },
    {
        "id": "link-omicron-60a9f91861a71b8780be-omicron-21930a52e2190eabd979",
        "fromSystemId": "omicron-60a9f91861a71b8780be",
        "toSystemId": "omicron-21930a52e2190eabd979",
        "class": "base"
    },
    {
        "id": "link-omicron-60a9f91861a71b8780be-omicron-c83e6dd202449322ebc3",
        "fromSystemId": "omicron-60a9f91861a71b8780be",
        "toSystemId": "omicron-c83e6dd202449322ebc3",
        "class": "gate"
    },
    {
        "id": "link-omicron-cc4aea94709241c20bf6-omicron-2a4c453fbee0b598b19e",
        "fromSystemId": "omicron-cc4aea94709241c20bf6",
        "toSystemId": "omicron-2a4c453fbee0b598b19e",
        "class": "base"
    },
    {
        "id": "link-omicron-949d1fb54e31ee8d3f91-omicron-3aeed261c4e9ba80a0c5",
        "fromSystemId": "omicron-949d1fb54e31ee8d3f91",
        "toSystemId": "omicron-3aeed261c4e9ba80a0c5",
        "class": "base"
    },
    {
        "id": "link-omicron-949d1fb54e31ee8d3f91-omicron-a14851c3cee03238d7e6",
        "fromSystemId": "omicron-949d1fb54e31ee8d3f91",
        "toSystemId": "omicron-a14851c3cee03238d7e6",
        "class": "base"
    },
    {
        "id": "link-omicron-949d1fb54e31ee8d3f91-omicron-062e9f7e9efaad335db6",
        "fromSystemId": "omicron-949d1fb54e31ee8d3f91",
        "toSystemId": "omicron-062e9f7e9efaad335db6",
        "class": "gate"
    },
    {
        "id": "link-omicron-b088b9116dcc1010b834-omicron-d5047f9bd0140c16bd7a",
        "fromSystemId": "omicron-b088b9116dcc1010b834",
        "toSystemId": "omicron-d5047f9bd0140c16bd7a",
        "class": "gate"
    },
    {
        "id": "link-omicron-b088b9116dcc1010b834-omicron-7388d501f9d52ee3c5d2",
        "fromSystemId": "omicron-b088b9116dcc1010b834",
        "toSystemId": "omicron-7388d501f9d52ee3c5d2",
        "class": "base"
    },
    {
        "id": "link-omicron-07bd7df19fdb7e0a0bd1-omicron-b638d3ee64b8827fae17",
        "fromSystemId": "omicron-07bd7df19fdb7e0a0bd1",
        "toSystemId": "omicron-b638d3ee64b8827fae17",
        "class": "gate"
    },
    {
        "id": "link-omicron-0162cbe1fdfcb88e18fb-omicron-a6b34eed2f81b3538700",
        "fromSystemId": "omicron-0162cbe1fdfcb88e18fb",
        "toSystemId": "omicron-a6b34eed2f81b3538700",
        "class": "base"
    },
    {
        "id": "link-omicron-0162cbe1fdfcb88e18fb-omicron-8fe902922069c4d7a08b",
        "fromSystemId": "omicron-0162cbe1fdfcb88e18fb",
        "toSystemId": "omicron-8fe902922069c4d7a08b",
        "class": "base"
    },
    {
        "id": "link-omicron-677484a3b9a2d1a12b82-omicron-c77c66bae370402138f8",
        "fromSystemId": "omicron-677484a3b9a2d1a12b82",
        "toSystemId": "omicron-c77c66bae370402138f8",
        "class": "base"
    },
    {
        "id": "link-omicron-677484a3b9a2d1a12b82-omicron-565b620e091c89739668",
        "fromSystemId": "omicron-677484a3b9a2d1a12b82",
        "toSystemId": "omicron-565b620e091c89739668",
        "class": "base"
    },
    {
        "id": "link-omicron-677484a3b9a2d1a12b82-omicron-91480f97b237b6e50b23",
        "fromSystemId": "omicron-677484a3b9a2d1a12b82",
        "toSystemId": "omicron-91480f97b237b6e50b23",
        "class": "base"
    },
    {
        "id": "link-omicron-789203298a78e54523b2-omicron-a681658aca40ebe357c2",
        "fromSystemId": "omicron-789203298a78e54523b2",
        "toSystemId": "omicron-a681658aca40ebe357c2",
        "class": "base"
    },
    {
        "id": "link-omicron-789203298a78e54523b2-omicron-606952beae05205ae47f",
        "fromSystemId": "omicron-789203298a78e54523b2",
        "toSystemId": "omicron-606952beae05205ae47f",
        "class": "gate"
    },
    {
        "id": "link-omicron-c3f9a580fef78cf98c3b-omicron-3d7a21a8033c34d60d4e",
        "fromSystemId": "omicron-c3f9a580fef78cf98c3b",
        "toSystemId": "omicron-3d7a21a8033c34d60d4e",
        "class": "base"
    },
    {
        "id": "link-omicron-a5f695c9a93f9586aa26-omicron-c86b09367f435f7aa417",
        "fromSystemId": "omicron-a5f695c9a93f9586aa26",
        "toSystemId": "omicron-c86b09367f435f7aa417",
        "class": "base"
    },
    {
        "id": "link-omicron-a5f695c9a93f9586aa26-omicron-600aefcab6013ddaa627",
        "fromSystemId": "omicron-a5f695c9a93f9586aa26",
        "toSystemId": "omicron-600aefcab6013ddaa627",
        "class": "base"
    },
    {
        "id": "link-omicron-b6f554ec6ca3ef70179b-omicron-d5047f9bd0140c16bd7a",
        "fromSystemId": "omicron-b6f554ec6ca3ef70179b",
        "toSystemId": "omicron-d5047f9bd0140c16bd7a",
        "class": "base"
    },
    {
        "id": "link-omicron-0322b443d18dfabe2c32-omicron-b312ce2a19a19e0dd7d6",
        "fromSystemId": "omicron-0322b443d18dfabe2c32",
        "toSystemId": "omicron-b312ce2a19a19e0dd7d6",
        "class": "base"
    },
    {
        "id": "link-omicron-0322b443d18dfabe2c32-omicron-3ae1ba293232a7868296",
        "fromSystemId": "omicron-0322b443d18dfabe2c32",
        "toSystemId": "omicron-3ae1ba293232a7868296",
        "class": "base"
    },
    {
        "id": "link-omicron-151aa60cc9fb0e4b91d9-omicron-7f8283fb75a60d01bf37",
        "fromSystemId": "omicron-151aa60cc9fb0e4b91d9",
        "toSystemId": "omicron-7f8283fb75a60d01bf37",
        "class": "base"
    },
    {
        "id": "link-omicron-151aa60cc9fb0e4b91d9-omicron-34fec72fcd6dc6f7666e",
        "fromSystemId": "omicron-151aa60cc9fb0e4b91d9",
        "toSystemId": "omicron-34fec72fcd6dc6f7666e",
        "class": "gate"
    },
    {
        "id": "link-omicron-dadedd026d3a9a800d4b-omicron-a7e35ae907f40505004b",
        "fromSystemId": "omicron-dadedd026d3a9a800d4b",
        "toSystemId": "omicron-a7e35ae907f40505004b",
        "class": "base"
    },
    {
        "id": "link-omicron-dadedd026d3a9a800d4b-omicron-762e641bc34e7adc6a47",
        "fromSystemId": "omicron-dadedd026d3a9a800d4b",
        "toSystemId": "omicron-762e641bc34e7adc6a47",
        "class": "gate"
    },
    {
        "id": "link-omicron-fc6707528d16c5590dd9-omicron-1f8d9300a1168ce106a2",
        "fromSystemId": "omicron-fc6707528d16c5590dd9",
        "toSystemId": "omicron-1f8d9300a1168ce106a2",
        "class": "base"
    },
    {
        "id": "link-omicron-fc6707528d16c5590dd9-omicron-4834e5b4bb4c2c146d8e",
        "fromSystemId": "omicron-fc6707528d16c5590dd9",
        "toSystemId": "omicron-4834e5b4bb4c2c146d8e",
        "class": "base"
    },
    {
        "id": "link-omicron-fc6707528d16c5590dd9-omicron-cfebd4b7c8b79c4d2a67",
        "fromSystemId": "omicron-fc6707528d16c5590dd9",
        "toSystemId": "omicron-cfebd4b7c8b79c4d2a67",
        "class": "gate"
    },
    {
        "id": "link-omicron-c97cead7be9ee318332c-omicron-8c264b5adcc1ff837ed0",
        "fromSystemId": "omicron-c97cead7be9ee318332c",
        "toSystemId": "omicron-8c264b5adcc1ff837ed0",
        "class": "gate"
    },
    {
        "id": "link-omicron-c97cead7be9ee318332c-omicron-0daea28079f81b8fef8f",
        "fromSystemId": "omicron-c97cead7be9ee318332c",
        "toSystemId": "omicron-0daea28079f81b8fef8f",
        "class": "base"
    },
    {
        "id": "link-omicron-c97cead7be9ee318332c-omicron-41f3cd531e9926c1a127",
        "fromSystemId": "omicron-c97cead7be9ee318332c",
        "toSystemId": "omicron-41f3cd531e9926c1a127",
        "class": "gate"
    },
    {
        "id": "link-omicron-3978fcbdedd5c300b1f7-omicron-dc1601dfb376639175c7",
        "fromSystemId": "omicron-3978fcbdedd5c300b1f7",
        "toSystemId": "omicron-dc1601dfb376639175c7",
        "class": "base"
    },
    {
        "id": "link-omicron-3978fcbdedd5c300b1f7-omicron-ba732aa85127a7e61d48",
        "fromSystemId": "omicron-3978fcbdedd5c300b1f7",
        "toSystemId": "omicron-ba732aa85127a7e61d48",
        "class": "base"
    },
    {
        "id": "link-omicron-3978fcbdedd5c300b1f7-omicron-69e9d95fa3d3d75978d0",
        "fromSystemId": "omicron-3978fcbdedd5c300b1f7",
        "toSystemId": "omicron-69e9d95fa3d3d75978d0",
        "class": "base"
    },
    {
        "id": "link-omicron-d5047f9bd0140c16bd7a-omicron-7388d501f9d52ee3c5d2",
        "fromSystemId": "omicron-d5047f9bd0140c16bd7a",
        "toSystemId": "omicron-7388d501f9d52ee3c5d2",
        "class": "base"
    },
    {
        "id": "link-omicron-d5047f9bd0140c16bd7a-omicron-b6f554ec6ca3ef70179b",
        "fromSystemId": "omicron-d5047f9bd0140c16bd7a",
        "toSystemId": "omicron-b6f554ec6ca3ef70179b",
        "class": "base"
    },
    {
        "id": "link-omicron-50c2b86df50cdeb73412-omicron-b638d3ee64b8827fae17",
        "fromSystemId": "omicron-50c2b86df50cdeb73412",
        "toSystemId": "omicron-b638d3ee64b8827fae17",
        "class": "base"
    },
    {
        "id": "link-omicron-bb4225daabf90c51c748-omicron-e9673f5b3e42510ca277",
        "fromSystemId": "omicron-bb4225daabf90c51c748",
        "toSystemId": "omicron-e9673f5b3e42510ca277",
        "class": "base"
    },
    {
        "id": "link-midrim-0-alpha-f7fd7a7f0ce6e0565f0c",
        "fromSystemId": "midrim-0",
        "toSystemId": "alpha-f7fd7a7f0ce6e0565f0c",
        "class": "base"
    },
    {
        "id": "link-midrim-0-alpha-c3fd1fb4c112be530803",
        "fromSystemId": "midrim-0",
        "toSystemId": "alpha-c3fd1fb4c112be530803",
        "class": "base"
    },
    {
        "id": "link-midrim-2-gamma-85f01c1d165306a83dfd",
        "fromSystemId": "midrim-2",
        "toSystemId": "gamma-85f01c1d165306a83dfd",
        "class": "base"
    },
    {
        "id": "link-midrim-2-gamma-af6bedc870efaa430d55",
        "fromSystemId": "midrim-2",
        "toSystemId": "gamma-af6bedc870efaa430d55",
        "class": "base"
    },
    {
        "id": "link-midrim-3-alpha-ccb04e698861a41cf87c",
        "fromSystemId": "midrim-3",
        "toSystemId": "alpha-ccb04e698861a41cf87c",
        "class": "base"
    },
    {
        "id": "link-midrim-3-alpha-26d168eb718a2f71d9e3",
        "fromSystemId": "midrim-3",
        "toSystemId": "alpha-26d168eb718a2f71d9e3",
        "class": "base"
    },
    {
        "id": "link-midrim-4-midrim-3",
        "fromSystemId": "midrim-4",
        "toSystemId": "midrim-3",
        "class": "base"
    },
    {
        "id": "link-midrim-4-alpha-b51aa651102346de66b9",
        "fromSystemId": "midrim-4",
        "toSystemId": "alpha-b51aa651102346de66b9",
        "class": "base"
    },
    {
        "id": "link-midrim-5-midrim-4",
        "fromSystemId": "midrim-5",
        "toSystemId": "midrim-4",
        "class": "base"
    },
    {
        "id": "link-midrim-5-midrim-3",
        "fromSystemId": "midrim-5",
        "toSystemId": "midrim-3",
        "class": "base"
    },
    {
        "id": "link-midrim-6-alpha-766bc8d1e933809eff63",
        "fromSystemId": "midrim-6",
        "toSystemId": "alpha-766bc8d1e933809eff63",
        "class": "base"
    },
    {
        "id": "link-midrim-6-alpha-52c2705d81d86cb8e5ed",
        "fromSystemId": "midrim-6",
        "toSystemId": "alpha-52c2705d81d86cb8e5ed",
        "class": "base"
    },
    {
        "id": "link-midrim-7-gamma-0cef58cc009bc1c15f59",
        "fromSystemId": "midrim-7",
        "toSystemId": "gamma-0cef58cc009bc1c15f59",
        "class": "base"
    },
    {
        "id": "link-midrim-7-gamma-85f01c1d165306a83dfd",
        "fromSystemId": "midrim-7",
        "toSystemId": "gamma-85f01c1d165306a83dfd",
        "class": "base"
    },
    {
        "id": "link-midrim-8-alpha-2eaba9e9cd66cd3ab7e3",
        "fromSystemId": "midrim-8",
        "toSystemId": "alpha-2eaba9e9cd66cd3ab7e3",
        "class": "base"
    },
    {
        "id": "link-midrim-8-midrim-6",
        "fromSystemId": "midrim-8",
        "toSystemId": "midrim-6",
        "class": "base"
    },
    {
        "id": "link-midrim-9-midrim-6",
        "fromSystemId": "midrim-9",
        "toSystemId": "midrim-6",
        "class": "base"
    },
    {
        "id": "link-midrim-9-midrim-8",
        "fromSystemId": "midrim-9",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-10-midrim-2",
        "fromSystemId": "midrim-10",
        "toSystemId": "midrim-2",
        "class": "base"
    },
    {
        "id": "link-midrim-10-midrim-7",
        "fromSystemId": "midrim-10",
        "toSystemId": "midrim-7",
        "class": "base"
    },
    {
        "id": "link-midrim-12-midrim-7",
        "fromSystemId": "midrim-12",
        "toSystemId": "midrim-7",
        "class": "base"
    },
    {
        "id": "link-midrim-12-midrim-10",
        "fromSystemId": "midrim-12",
        "toSystemId": "midrim-10",
        "class": "base"
    },
    {
        "id": "link-midrim-13-midrim-2",
        "fromSystemId": "midrim-13",
        "toSystemId": "midrim-2",
        "class": "base"
    },
    {
        "id": "link-midrim-13-gamma-af6bedc870efaa430d55",
        "fromSystemId": "midrim-13",
        "toSystemId": "gamma-af6bedc870efaa430d55",
        "class": "base"
    },
    {
        "id": "link-midrim-14-midrim-4",
        "fromSystemId": "midrim-14",
        "toSystemId": "midrim-4",
        "class": "base"
    },
    {
        "id": "link-midrim-14-midrim-3",
        "fromSystemId": "midrim-14",
        "toSystemId": "midrim-3",
        "class": "base"
    },
    {
        "id": "link-midrim-15-midrim-11",
        "fromSystemId": "midrim-15",
        "toSystemId": "midrim-11",
        "class": "base"
    },
    {
        "id": "link-midrim-15-beta-55c58ce0dd4c30e4bbc8",
        "fromSystemId": "midrim-15",
        "toSystemId": "beta-55c58ce0dd4c30e4bbc8",
        "class": "base"
    },
    {
        "id": "link-midrim-16-midrim-11",
        "fromSystemId": "midrim-16",
        "toSystemId": "midrim-11",
        "class": "base"
    },
    {
        "id": "link-midrim-16-midrim-15",
        "fromSystemId": "midrim-16",
        "toSystemId": "midrim-15",
        "class": "base"
    },
    {
        "id": "link-midrim-17-midrim-2",
        "fromSystemId": "midrim-17",
        "toSystemId": "midrim-2",
        "class": "base"
    },
    {
        "id": "link-midrim-17-midrim-13",
        "fromSystemId": "midrim-17",
        "toSystemId": "midrim-13",
        "class": "base"
    },
    {
        "id": "link-midrim-18-midrim-8",
        "fromSystemId": "midrim-18",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-19-midrim-0",
        "fromSystemId": "midrim-19",
        "toSystemId": "midrim-0",
        "class": "base"
    },
    {
        "id": "link-midrim-19-midrim-18",
        "fromSystemId": "midrim-19",
        "toSystemId": "midrim-18",
        "class": "base"
    },
    {
        "id": "link-midrim-20-midrim-12",
        "fromSystemId": "midrim-20",
        "toSystemId": "midrim-12",
        "class": "base"
    },
    {
        "id": "link-midrim-20-midrim-7",
        "fromSystemId": "midrim-20",
        "toSystemId": "midrim-7",
        "class": "base"
    },
    {
        "id": "link-midrim-21-midrim-17",
        "fromSystemId": "midrim-21",
        "toSystemId": "midrim-17",
        "class": "base"
    },
    {
        "id": "link-midrim-21-midrim-2",
        "fromSystemId": "midrim-21",
        "toSystemId": "midrim-2",
        "class": "base"
    },
    {
        "id": "link-midrim-22-midrim-17",
        "fromSystemId": "midrim-22",
        "toSystemId": "midrim-17",
        "class": "base"
    },
    {
        "id": "link-midrim-22-midrim-2",
        "fromSystemId": "midrim-22",
        "toSystemId": "midrim-2",
        "class": "base"
    },
    {
        "id": "link-midrim-23-midrim-18",
        "fromSystemId": "midrim-23",
        "toSystemId": "midrim-18",
        "class": "base"
    },
    {
        "id": "link-midrim-23-midrim-19",
        "fromSystemId": "midrim-23",
        "toSystemId": "midrim-19",
        "class": "base"
    },
    {
        "id": "link-midrim-24-midrim-8",
        "fromSystemId": "midrim-24",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-24-midrim-9",
        "fromSystemId": "midrim-24",
        "toSystemId": "midrim-9",
        "class": "base"
    },
    {
        "id": "link-midrim-25-midrim-18",
        "fromSystemId": "midrim-25",
        "toSystemId": "midrim-18",
        "class": "base"
    },
    {
        "id": "link-midrim-25-midrim-23",
        "fromSystemId": "midrim-25",
        "toSystemId": "midrim-23",
        "class": "base"
    },
    {
        "id": "link-midrim-26-midrim-0",
        "fromSystemId": "midrim-26",
        "toSystemId": "midrim-0",
        "class": "base"
    },
    {
        "id": "link-midrim-26-midrim-3",
        "fromSystemId": "midrim-26",
        "toSystemId": "midrim-3",
        "class": "base"
    },
    {
        "id": "link-midrim-27-midrim-20",
        "fromSystemId": "midrim-27",
        "toSystemId": "midrim-20",
        "class": "base"
    },
    {
        "id": "link-midrim-27-midrim-12",
        "fromSystemId": "midrim-27",
        "toSystemId": "midrim-12",
        "class": "base"
    },
    {
        "id": "link-midrim-28-midrim-24",
        "fromSystemId": "midrim-28",
        "toSystemId": "midrim-24",
        "class": "base"
    },
    {
        "id": "link-midrim-28-midrim-8",
        "fromSystemId": "midrim-28",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-29-midrim-16",
        "fromSystemId": "midrim-29",
        "toSystemId": "midrim-16",
        "class": "base"
    },
    {
        "id": "link-midrim-29-midrim-15",
        "fromSystemId": "midrim-29",
        "toSystemId": "midrim-15",
        "class": "base"
    },
    {
        "id": "link-midrim-30-midrim-3",
        "fromSystemId": "midrim-30",
        "toSystemId": "midrim-3",
        "class": "base"
    },
    {
        "id": "link-midrim-30-alpha-ccb04e698861a41cf87c",
        "fromSystemId": "midrim-30",
        "toSystemId": "alpha-ccb04e698861a41cf87c",
        "class": "base"
    },
    {
        "id": "link-midrim-31-midrim-0",
        "fromSystemId": "midrim-31",
        "toSystemId": "midrim-0",
        "class": "base"
    },
    {
        "id": "link-midrim-31-midrim-19",
        "fromSystemId": "midrim-31",
        "toSystemId": "midrim-19",
        "class": "base"
    },
    {
        "id": "link-midrim-32-midrim-26",
        "fromSystemId": "midrim-32",
        "toSystemId": "midrim-26",
        "class": "base"
    },
    {
        "id": "link-midrim-32-midrim-0",
        "fromSystemId": "midrim-32",
        "toSystemId": "midrim-0",
        "class": "base"
    },
    {
        "id": "link-midrim-33-midrim-19",
        "fromSystemId": "midrim-33",
        "toSystemId": "midrim-19",
        "class": "base"
    },
    {
        "id": "link-midrim-33-midrim-25",
        "fromSystemId": "midrim-33",
        "toSystemId": "midrim-25",
        "class": "base"
    },
    {
        "id": "link-midrim-34-midrim-31",
        "fromSystemId": "midrim-34",
        "toSystemId": "midrim-31",
        "class": "base"
    },
    {
        "id": "link-midrim-34-midrim-25",
        "fromSystemId": "midrim-34",
        "toSystemId": "midrim-25",
        "class": "base"
    },
    {
        "id": "link-midrim-35-midrim-1",
        "fromSystemId": "midrim-35",
        "toSystemId": "midrim-1",
        "class": "base"
    },
    {
        "id": "link-midrim-35-midrim-28",
        "fromSystemId": "midrim-35",
        "toSystemId": "midrim-28",
        "class": "base"
    },
    {
        "id": "link-midrim-36-midrim-5",
        "fromSystemId": "midrim-36",
        "toSystemId": "midrim-5",
        "class": "base"
    },
    {
        "id": "link-midrim-36-midrim-32",
        "fromSystemId": "midrim-36",
        "toSystemId": "midrim-32",
        "class": "base"
    },
    {
        "id": "link-midrim-37-midrim-29",
        "fromSystemId": "midrim-37",
        "toSystemId": "midrim-29",
        "class": "base"
    },
    {
        "id": "link-midrim-37-beta-c03c3de3e71278c7b014",
        "fromSystemId": "midrim-37",
        "toSystemId": "beta-c03c3de3e71278c7b014",
        "class": "base"
    },
    {
        "id": "link-midrim-38-midrim-36",
        "fromSystemId": "midrim-38",
        "toSystemId": "midrim-36",
        "class": "base"
    },
    {
        "id": "link-midrim-38-midrim-26",
        "fromSystemId": "midrim-38",
        "toSystemId": "midrim-26",
        "class": "base"
    },
    {
        "id": "link-midrim-39-midrim-36",
        "fromSystemId": "midrim-39",
        "toSystemId": "midrim-36",
        "class": "base"
    },
    {
        "id": "link-midrim-39-midrim-5",
        "fromSystemId": "midrim-39",
        "toSystemId": "midrim-5",
        "class": "base"
    },
    {
        "id": "link-midrim-40-midrim-31",
        "fromSystemId": "midrim-40",
        "toSystemId": "midrim-31",
        "class": "base"
    },
    {
        "id": "link-midrim-40-midrim-0",
        "fromSystemId": "midrim-40",
        "toSystemId": "midrim-0",
        "class": "base"
    },
    {
        "id": "link-midrim-41-midrim-8",
        "fromSystemId": "midrim-41",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-41-midrim-24",
        "fromSystemId": "midrim-41",
        "toSystemId": "midrim-24",
        "class": "base"
    },
    {
        "id": "link-midrim-42-midrim-37",
        "fromSystemId": "midrim-42",
        "toSystemId": "midrim-37",
        "class": "base"
    },
    {
        "id": "link-midrim-42-midrim-29",
        "fromSystemId": "midrim-42",
        "toSystemId": "midrim-29",
        "class": "base"
    },
    {
        "id": "link-midrim-43-midrim-19",
        "fromSystemId": "midrim-43",
        "toSystemId": "midrim-19",
        "class": "base"
    },
    {
        "id": "link-midrim-43-midrim-0",
        "fromSystemId": "midrim-43",
        "toSystemId": "midrim-0",
        "class": "base"
    },
    {
        "id": "link-midrim-44-midrim-13",
        "fromSystemId": "midrim-44",
        "toSystemId": "midrim-13",
        "class": "base"
    },
    {
        "id": "link-midrim-44-midrim-2",
        "fromSystemId": "midrim-44",
        "toSystemId": "midrim-2",
        "class": "base"
    },
    {
        "id": "link-midrim-45-midrim-30",
        "fromSystemId": "midrim-45",
        "toSystemId": "midrim-30",
        "class": "base"
    },
    {
        "id": "link-midrim-45-midrim-3",
        "fromSystemId": "midrim-45",
        "toSystemId": "midrim-3",
        "class": "base"
    },
    {
        "id": "link-midrim-46-midrim-8",
        "fromSystemId": "midrim-46",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-46-midrim-24",
        "fromSystemId": "midrim-46",
        "toSystemId": "midrim-24",
        "class": "base"
    },
    {
        "id": "link-midrim-47-alpha-b51aa651102346de66b9",
        "fromSystemId": "midrim-47",
        "toSystemId": "alpha-b51aa651102346de66b9",
        "class": "base"
    },
    {
        "id": "link-midrim-47-midrim-14",
        "fromSystemId": "midrim-47",
        "toSystemId": "midrim-14",
        "class": "base"
    },
    {
        "id": "link-midrim-48-midrim-46",
        "fromSystemId": "midrim-48",
        "toSystemId": "midrim-46",
        "class": "base"
    },
    {
        "id": "link-midrim-48-midrim-18",
        "fromSystemId": "midrim-48",
        "toSystemId": "midrim-18",
        "class": "base"
    },
    {
        "id": "link-midrim-49-midrim-18",
        "fromSystemId": "midrim-49",
        "toSystemId": "midrim-18",
        "class": "base"
    },
    {
        "id": "link-midrim-49-midrim-23",
        "fromSystemId": "midrim-49",
        "toSystemId": "midrim-23",
        "class": "base"
    },
    {
        "id": "link-midrim-50-midrim-10",
        "fromSystemId": "midrim-50",
        "toSystemId": "midrim-10",
        "class": "base"
    },
    {
        "id": "link-midrim-50-midrim-22",
        "fromSystemId": "midrim-50",
        "toSystemId": "midrim-22",
        "class": "base"
    },
    {
        "id": "link-midrim-51-midrim-46",
        "fromSystemId": "midrim-51",
        "toSystemId": "midrim-46",
        "class": "base"
    },
    {
        "id": "link-midrim-51-midrim-8",
        "fromSystemId": "midrim-51",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-52-midrim-6",
        "fromSystemId": "midrim-52",
        "toSystemId": "midrim-6",
        "class": "base"
    },
    {
        "id": "link-midrim-52-midrim-9",
        "fromSystemId": "midrim-52",
        "toSystemId": "midrim-9",
        "class": "base"
    },
    {
        "id": "link-midrim-53-midrim-16",
        "fromSystemId": "midrim-53",
        "toSystemId": "midrim-16",
        "class": "base"
    },
    {
        "id": "link-midrim-53-midrim-29",
        "fromSystemId": "midrim-53",
        "toSystemId": "midrim-29",
        "class": "base"
    },
    {
        "id": "link-midrim-54-midrim-52",
        "fromSystemId": "midrim-54",
        "toSystemId": "midrim-52",
        "class": "base"
    },
    {
        "id": "link-midrim-54-midrim-9",
        "fromSystemId": "midrim-54",
        "toSystemId": "midrim-9",
        "class": "base"
    },
    {
        "id": "link-midrim-55-midrim-42",
        "fromSystemId": "midrim-55",
        "toSystemId": "midrim-42",
        "class": "base"
    },
    {
        "id": "link-midrim-55-beta-55c58ce0dd4c30e4bbc8",
        "fromSystemId": "midrim-55",
        "toSystemId": "beta-55c58ce0dd4c30e4bbc8",
        "class": "base"
    },
    {
        "id": "link-midrim-56-midrim-48",
        "fromSystemId": "midrim-56",
        "toSystemId": "midrim-48",
        "class": "base"
    },
    {
        "id": "link-midrim-56-midrim-46",
        "fromSystemId": "midrim-56",
        "toSystemId": "midrim-46",
        "class": "base"
    },
    {
        "id": "link-midrim-57-midrim-17",
        "fromSystemId": "midrim-57",
        "toSystemId": "midrim-17",
        "class": "base"
    },
    {
        "id": "link-midrim-57-midrim-22",
        "fromSystemId": "midrim-57",
        "toSystemId": "midrim-22",
        "class": "base"
    },
    {
        "id": "link-midrim-58-midrim-38",
        "fromSystemId": "midrim-58",
        "toSystemId": "midrim-38",
        "class": "base"
    },
    {
        "id": "link-midrim-58-midrim-36",
        "fromSystemId": "midrim-58",
        "toSystemId": "midrim-36",
        "class": "base"
    },
    {
        "id": "link-midrim-59-midrim-18",
        "fromSystemId": "midrim-59",
        "toSystemId": "midrim-18",
        "class": "base"
    },
    {
        "id": "link-midrim-59-midrim-49",
        "fromSystemId": "midrim-59",
        "toSystemId": "midrim-49",
        "class": "base"
    },
    {
        "id": "link-midrim-60-midrim-19",
        "fromSystemId": "midrim-60",
        "toSystemId": "midrim-19",
        "class": "base"
    },
    {
        "id": "link-midrim-60-midrim-33",
        "fromSystemId": "midrim-60",
        "toSystemId": "midrim-33",
        "class": "base"
    },
    {
        "id": "link-midrim-61-midrim-24",
        "fromSystemId": "midrim-61",
        "toSystemId": "midrim-24",
        "class": "base"
    },
    {
        "id": "link-midrim-61-midrim-51",
        "fromSystemId": "midrim-61",
        "toSystemId": "midrim-51",
        "class": "base"
    },
    {
        "id": "link-midrim-62-midrim-0",
        "fromSystemId": "midrim-62",
        "toSystemId": "midrim-0",
        "class": "base"
    },
    {
        "id": "link-midrim-62-midrim-43",
        "fromSystemId": "midrim-62",
        "toSystemId": "midrim-43",
        "class": "base"
    },
    {
        "id": "link-midrim-63-midrim-15",
        "fromSystemId": "midrim-63",
        "toSystemId": "midrim-15",
        "class": "base"
    },
    {
        "id": "link-midrim-63-midrim-11",
        "fromSystemId": "midrim-63",
        "toSystemId": "midrim-11",
        "class": "base"
    },
    {
        "id": "link-midrim-64-midrim-50",
        "fromSystemId": "midrim-64",
        "toSystemId": "midrim-50",
        "class": "base"
    },
    {
        "id": "link-midrim-64-midrim-10",
        "fromSystemId": "midrim-64",
        "toSystemId": "midrim-10",
        "class": "base"
    },
    {
        "id": "link-midrim-65-midrim-59",
        "fromSystemId": "midrim-65",
        "toSystemId": "midrim-59",
        "class": "base"
    },
    {
        "id": "link-midrim-65-midrim-49",
        "fromSystemId": "midrim-65",
        "toSystemId": "midrim-49",
        "class": "base"
    },
    {
        "id": "link-midrim-66-midrim-24",
        "fromSystemId": "midrim-66",
        "toSystemId": "midrim-24",
        "class": "base"
    },
    {
        "id": "link-midrim-66-midrim-48",
        "fromSystemId": "midrim-66",
        "toSystemId": "midrim-48",
        "class": "base"
    },
    {
        "id": "link-midrim-67-midrim-48",
        "fromSystemId": "midrim-67",
        "toSystemId": "midrim-48",
        "class": "base"
    },
    {
        "id": "link-midrim-67-midrim-46",
        "fromSystemId": "midrim-67",
        "toSystemId": "midrim-46",
        "class": "base"
    },
    {
        "id": "link-midrim-68-midrim-21",
        "fromSystemId": "midrim-68",
        "toSystemId": "midrim-21",
        "class": "base"
    },
    {
        "id": "link-midrim-68-midrim-57",
        "fromSystemId": "midrim-68",
        "toSystemId": "midrim-57",
        "class": "base"
    },
    {
        "id": "link-midrim-69-midrim-47",
        "fromSystemId": "midrim-69",
        "toSystemId": "midrim-47",
        "class": "base"
    },
    {
        "id": "link-midrim-69-alpha-b51aa651102346de66b9",
        "fromSystemId": "midrim-69",
        "toSystemId": "alpha-b51aa651102346de66b9",
        "class": "base"
    },
    {
        "id": "link-midrim-70-midrim-55",
        "fromSystemId": "midrim-70",
        "toSystemId": "midrim-55",
        "class": "base"
    },
    {
        "id": "link-midrim-70-beta-55c58ce0dd4c30e4bbc8",
        "fromSystemId": "midrim-70",
        "toSystemId": "beta-55c58ce0dd4c30e4bbc8",
        "class": "base"
    },
    {
        "id": "link-midrim-71-midrim-23",
        "fromSystemId": "midrim-71",
        "toSystemId": "midrim-23",
        "class": "base"
    },
    {
        "id": "link-midrim-71-midrim-65",
        "fromSystemId": "midrim-71",
        "toSystemId": "midrim-65",
        "class": "base"
    },
    {
        "id": "link-midrim-72-midrim-71",
        "fromSystemId": "midrim-72",
        "toSystemId": "midrim-71",
        "class": "base"
    },
    {
        "id": "link-midrim-72-midrim-68",
        "fromSystemId": "midrim-72",
        "toSystemId": "midrim-68",
        "class": "base"
    },
    {
        "id": "link-midrim-73-midrim-31",
        "fromSystemId": "midrim-73",
        "toSystemId": "midrim-31",
        "class": "base"
    },
    {
        "id": "link-midrim-73-midrim-40",
        "fromSystemId": "midrim-73",
        "toSystemId": "midrim-40",
        "class": "base"
    },
    {
        "id": "link-midrim-74-midrim-20",
        "fromSystemId": "midrim-74",
        "toSystemId": "midrim-20",
        "class": "base"
    },
    {
        "id": "link-midrim-74-midrim-27",
        "fromSystemId": "midrim-74",
        "toSystemId": "midrim-27",
        "class": "base"
    },
    {
        "id": "link-midrim-75-midrim-63",
        "fromSystemId": "midrim-75",
        "toSystemId": "midrim-63",
        "class": "base"
    },
    {
        "id": "link-midrim-75-midrim-70",
        "fromSystemId": "midrim-75",
        "toSystemId": "midrim-70",
        "class": "base"
    },
    {
        "id": "link-midrim-76-midrim-15",
        "fromSystemId": "midrim-76",
        "toSystemId": "midrim-15",
        "class": "base"
    },
    {
        "id": "link-midrim-76-midrim-11",
        "fromSystemId": "midrim-76",
        "toSystemId": "midrim-11",
        "class": "base"
    },
    {
        "id": "link-midrim-77-midrim-38",
        "fromSystemId": "midrim-77",
        "toSystemId": "midrim-38",
        "class": "base"
    },
    {
        "id": "link-midrim-77-midrim-58",
        "fromSystemId": "midrim-77",
        "toSystemId": "midrim-58",
        "class": "base"
    },
    {
        "id": "link-midrim-78-midrim-33",
        "fromSystemId": "midrim-78",
        "toSystemId": "midrim-33",
        "class": "base"
    },
    {
        "id": "link-midrim-78-midrim-60",
        "fromSystemId": "midrim-78",
        "toSystemId": "midrim-60",
        "class": "base"
    },
    {
        "id": "link-midrim-79-midrim-68",
        "fromSystemId": "midrim-79",
        "toSystemId": "midrim-68",
        "class": "base"
    },
    {
        "id": "link-midrim-79-midrim-72",
        "fromSystemId": "midrim-79",
        "toSystemId": "midrim-72",
        "class": "base"
    },
    {
        "id": "link-midrim-80-midrim-29",
        "fromSystemId": "midrim-80",
        "toSystemId": "midrim-29",
        "class": "base"
    },
    {
        "id": "link-midrim-80-midrim-37",
        "fromSystemId": "midrim-80",
        "toSystemId": "midrim-37",
        "class": "base"
    },
    {
        "id": "link-midrim-81-midrim-10",
        "fromSystemId": "midrim-81",
        "toSystemId": "midrim-10",
        "class": "base"
    },
    {
        "id": "link-midrim-81-midrim-50",
        "fromSystemId": "midrim-81",
        "toSystemId": "midrim-50",
        "class": "base"
    },
    {
        "id": "link-midrim-82-alpha-2eaba9e9cd66cd3ab7e3",
        "fromSystemId": "midrim-82",
        "toSystemId": "alpha-2eaba9e9cd66cd3ab7e3",
        "class": "base"
    },
    {
        "id": "link-midrim-82-alpha-3ed956ee2cf7fe6190bf",
        "fromSystemId": "midrim-82",
        "toSystemId": "alpha-3ed956ee2cf7fe6190bf",
        "class": "base"
    },
    {
        "id": "link-midrim-83-midrim-43",
        "fromSystemId": "midrim-83",
        "toSystemId": "midrim-43",
        "class": "base"
    },
    {
        "id": "link-midrim-83-midrim-57",
        "fromSystemId": "midrim-83",
        "toSystemId": "midrim-57",
        "class": "base"
    },
    {
        "id": "link-midrim-84-midrim-81",
        "fromSystemId": "midrim-84",
        "toSystemId": "midrim-81",
        "class": "base"
    },
    {
        "id": "link-midrim-84-midrim-10",
        "fromSystemId": "midrim-84",
        "toSystemId": "midrim-10",
        "class": "base"
    },
    {
        "id": "link-midrim-85-midrim-43",
        "fromSystemId": "midrim-85",
        "toSystemId": "midrim-43",
        "class": "base"
    },
    {
        "id": "link-midrim-85-midrim-83",
        "fromSystemId": "midrim-85",
        "toSystemId": "midrim-83",
        "class": "base"
    },
    {
        "id": "link-midrim-86-midrim-28",
        "fromSystemId": "midrim-86",
        "toSystemId": "midrim-28",
        "class": "base"
    },
    {
        "id": "link-midrim-86-midrim-24",
        "fromSystemId": "midrim-86",
        "toSystemId": "midrim-24",
        "class": "base"
    },
    {
        "id": "link-midrim-87-midrim-11",
        "fromSystemId": "midrim-87",
        "toSystemId": "midrim-11",
        "class": "base"
    },
    {
        "id": "link-midrim-87-midrim-15",
        "fromSystemId": "midrim-87",
        "toSystemId": "midrim-15",
        "class": "base"
    },
    {
        "id": "link-midrim-88-midrim-49",
        "fromSystemId": "midrim-88",
        "toSystemId": "midrim-49",
        "class": "base"
    },
    {
        "id": "link-midrim-88-midrim-59",
        "fromSystemId": "midrim-88",
        "toSystemId": "midrim-59",
        "class": "base"
    },
    {
        "id": "link-midrim-89-midrim-42",
        "fromSystemId": "midrim-89",
        "toSystemId": "midrim-42",
        "class": "base"
    },
    {
        "id": "link-midrim-89-midrim-80",
        "fromSystemId": "midrim-89",
        "toSystemId": "midrim-80",
        "class": "base"
    },
    {
        "id": "link-midrim-90-midrim-26",
        "fromSystemId": "midrim-90",
        "toSystemId": "midrim-26",
        "class": "base"
    },
    {
        "id": "link-midrim-90-midrim-32",
        "fromSystemId": "midrim-90",
        "toSystemId": "midrim-32",
        "class": "base"
    },
    {
        "id": "link-midrim-91-midrim-66",
        "fromSystemId": "midrim-91",
        "toSystemId": "midrim-66",
        "class": "base"
    },
    {
        "id": "link-midrim-91-midrim-28",
        "fromSystemId": "midrim-91",
        "toSystemId": "midrim-28",
        "class": "base"
    },
    {
        "id": "link-midrim-92-midrim-80",
        "fromSystemId": "midrim-92",
        "toSystemId": "midrim-80",
        "class": "base"
    },
    {
        "id": "link-midrim-92-midrim-29",
        "fromSystemId": "midrim-92",
        "toSystemId": "midrim-29",
        "class": "base"
    },
    {
        "id": "link-midrim-93-midrim-72",
        "fromSystemId": "midrim-93",
        "toSystemId": "midrim-72",
        "class": "base"
    },
    {
        "id": "link-midrim-93-midrim-65",
        "fromSystemId": "midrim-93",
        "toSystemId": "midrim-65",
        "class": "base"
    },
    {
        "id": "link-midrim-94-midrim-16",
        "fromSystemId": "midrim-94",
        "toSystemId": "midrim-16",
        "class": "base"
    },
    {
        "id": "link-midrim-94-midrim-53",
        "fromSystemId": "midrim-94",
        "toSystemId": "midrim-53",
        "class": "base"
    },
    {
        "id": "link-midrim-95-midrim-20",
        "fromSystemId": "midrim-95",
        "toSystemId": "midrim-20",
        "class": "base"
    },
    {
        "id": "link-midrim-95-midrim-74",
        "fromSystemId": "midrim-95",
        "toSystemId": "midrim-74",
        "class": "base"
    },
    {
        "id": "link-midrim-96-midrim-76",
        "fromSystemId": "midrim-96",
        "toSystemId": "midrim-76",
        "class": "base"
    },
    {
        "id": "link-midrim-96-midrim-87",
        "fromSystemId": "midrim-96",
        "toSystemId": "midrim-87",
        "class": "base"
    },
    {
        "id": "link-midrim-97-midrim-69",
        "fromSystemId": "midrim-97",
        "toSystemId": "midrim-69",
        "class": "base"
    },
    {
        "id": "link-midrim-97-alpha-26d168eb718a2f71d9e3",
        "fromSystemId": "midrim-97",
        "toSystemId": "alpha-26d168eb718a2f71d9e3",
        "class": "base"
    },
    {
        "id": "link-midrim-98-midrim-42",
        "fromSystemId": "midrim-98",
        "toSystemId": "midrim-42",
        "class": "base"
    },
    {
        "id": "link-midrim-98-midrim-89",
        "fromSystemId": "midrim-98",
        "toSystemId": "midrim-89",
        "class": "base"
    },
    {
        "id": "link-midrim-99-midrim-23",
        "fromSystemId": "midrim-99",
        "toSystemId": "midrim-23",
        "class": "base"
    },
    {
        "id": "link-midrim-99-midrim-71",
        "fromSystemId": "midrim-99",
        "toSystemId": "midrim-71",
        "class": "base"
    },
    {
        "id": "link-midrim-100-midrim-90",
        "fromSystemId": "midrim-100",
        "toSystemId": "midrim-90",
        "class": "base"
    },
    {
        "id": "link-midrim-100-midrim-26",
        "fromSystemId": "midrim-100",
        "toSystemId": "midrim-26",
        "class": "base"
    },
    {
        "id": "link-midrim-101-midrim-81",
        "fromSystemId": "midrim-101",
        "toSystemId": "midrim-81",
        "class": "base"
    },
    {
        "id": "link-midrim-101-midrim-10",
        "fromSystemId": "midrim-101",
        "toSystemId": "midrim-10",
        "class": "base"
    },
    {
        "id": "link-midrim-102-midrim-91",
        "fromSystemId": "midrim-102",
        "toSystemId": "midrim-91",
        "class": "base"
    },
    {
        "id": "link-midrim-102-midrim-66",
        "fromSystemId": "midrim-102",
        "toSystemId": "midrim-66",
        "class": "base"
    },
    {
        "id": "link-midrim-103-midrim-16",
        "fromSystemId": "midrim-103",
        "toSystemId": "midrim-16",
        "class": "base"
    },
    {
        "id": "link-midrim-103-midrim-94",
        "fromSystemId": "midrim-103",
        "toSystemId": "midrim-94",
        "class": "base"
    },
    {
        "id": "link-midrim-104-midrim-93",
        "fromSystemId": "midrim-104",
        "toSystemId": "midrim-93",
        "class": "base"
    },
    {
        "id": "link-midrim-104-midrim-65",
        "fromSystemId": "midrim-104",
        "toSystemId": "midrim-65",
        "class": "base"
    },
    {
        "id": "link-midrim-105-midrim-60",
        "fromSystemId": "midrim-105",
        "toSystemId": "midrim-60",
        "class": "base"
    },
    {
        "id": "link-midrim-105-midrim-33",
        "fromSystemId": "midrim-105",
        "toSystemId": "midrim-33",
        "class": "base"
    },
    {
        "id": "link-midrim-106-midrim-39",
        "fromSystemId": "midrim-106",
        "toSystemId": "midrim-39",
        "class": "base"
    },
    {
        "id": "link-midrim-106-midrim-5",
        "fromSystemId": "midrim-106",
        "toSystemId": "midrim-5",
        "class": "base"
    },
    {
        "id": "link-midrim-107-midrim-83",
        "fromSystemId": "midrim-107",
        "toSystemId": "midrim-83",
        "class": "base"
    },
    {
        "id": "link-midrim-107-midrim-85",
        "fromSystemId": "midrim-107",
        "toSystemId": "midrim-85",
        "class": "base"
    },
    {
        "id": "link-midrim-108-midrim-44",
        "fromSystemId": "midrim-108",
        "toSystemId": "midrim-44",
        "class": "base"
    },
    {
        "id": "link-midrim-108-midrim-95",
        "fromSystemId": "midrim-108",
        "toSystemId": "midrim-95",
        "class": "base"
    },
    {
        "id": "link-midrim-109-midrim-76",
        "fromSystemId": "midrim-109",
        "toSystemId": "midrim-76",
        "class": "base"
    },
    {
        "id": "link-midrim-109-midrim-96",
        "fromSystemId": "midrim-109",
        "toSystemId": "midrim-96",
        "class": "base"
    },
    {
        "id": "link-midrim-110-midrim-41",
        "fromSystemId": "midrim-110",
        "toSystemId": "midrim-41",
        "class": "base"
    },
    {
        "id": "link-midrim-110-midrim-9",
        "fromSystemId": "midrim-110",
        "toSystemId": "midrim-9",
        "class": "base"
    },
    {
        "id": "link-midrim-111-midrim-6",
        "fromSystemId": "midrim-111",
        "toSystemId": "midrim-6",
        "class": "base"
    },
    {
        "id": "link-midrim-111-midrim-52",
        "fromSystemId": "midrim-111",
        "toSystemId": "midrim-52",
        "class": "base"
    },
    {
        "id": "link-midrim-112-midrim-87",
        "fromSystemId": "midrim-112",
        "toSystemId": "midrim-87",
        "class": "base"
    },
    {
        "id": "link-midrim-112-midrim-76",
        "fromSystemId": "midrim-112",
        "toSystemId": "midrim-76",
        "class": "base"
    },
    {
        "id": "link-midrim-113-midrim-99",
        "fromSystemId": "midrim-113",
        "toSystemId": "midrim-99",
        "class": "base"
    },
    {
        "id": "link-midrim-113-midrim-107",
        "fromSystemId": "midrim-113",
        "toSystemId": "midrim-107",
        "class": "base"
    },
    {
        "id": "link-midrim-114-midrim-5",
        "fromSystemId": "midrim-114",
        "toSystemId": "midrim-5",
        "class": "base"
    },
    {
        "id": "link-midrim-114-midrim-106",
        "fromSystemId": "midrim-114",
        "toSystemId": "midrim-106",
        "class": "base"
    },
    {
        "id": "link-midrim-115-midrim-48",
        "fromSystemId": "midrim-115",
        "toSystemId": "midrim-48",
        "class": "base"
    },
    {
        "id": "link-midrim-115-midrim-56",
        "fromSystemId": "midrim-115",
        "toSystemId": "midrim-56",
        "class": "base"
    },
    {
        "id": "link-midrim-116-midrim-8",
        "fromSystemId": "midrim-116",
        "toSystemId": "midrim-8",
        "class": "base"
    },
    {
        "id": "link-midrim-116-midrim-41",
        "fromSystemId": "midrim-116",
        "toSystemId": "midrim-41",
        "class": "base"
    },
    {
        "id": "link-midrim-117-midrim-54",
        "fromSystemId": "midrim-117",
        "toSystemId": "midrim-54",
        "class": "base"
    },
    {
        "id": "link-midrim-117-midrim-52",
        "fromSystemId": "midrim-117",
        "toSystemId": "midrim-52",
        "class": "base"
    },
    {
        "id": "link-midrim-118-midrim-107",
        "fromSystemId": "midrim-118",
        "toSystemId": "midrim-107",
        "class": "base"
    },
    {
        "id": "link-midrim-118-midrim-83",
        "fromSystemId": "midrim-118",
        "toSystemId": "midrim-83",
        "class": "base"
    },
    {
        "id": "link-midrim-119-midrim-110",
        "fromSystemId": "midrim-119",
        "toSystemId": "midrim-110",
        "class": "base"
    },
    {
        "id": "link-midrim-119-midrim-86",
        "fromSystemId": "midrim-119",
        "toSystemId": "midrim-86",
        "class": "base"
    },
    {
        "id": "link-pirate-0-omicron-ba732aa85127a7e61d48",
        "fromSystemId": "pirate-0",
        "toSystemId": "omicron-ba732aa85127a7e61d48",
        "class": "gate"
    },
    {
        "id": "link-pirate-0-pirate-1",
        "fromSystemId": "pirate-0",
        "toSystemId": "pirate-1",
        "class": "base"
    },
    {
        "id": "link-pirate-1-pirate-2",
        "fromSystemId": "pirate-1",
        "toSystemId": "pirate-2",
        "class": "base"
    },
    {
        "id": "link-pirate-2-pirate-3",
        "fromSystemId": "pirate-2",
        "toSystemId": "pirate-3",
        "class": "base"
    },
    {
        "id": "link-pirate-3-pirate-4",
        "fromSystemId": "pirate-3",
        "toSystemId": "pirate-4",
        "class": "base"
    },
    {
        "id": "link-pirate-4-pirate-5",
        "fromSystemId": "pirate-4",
        "toSystemId": "pirate-5",
        "class": "base"
    },
    {
        "id": "link-pirate-5-pirate-6",
        "fromSystemId": "pirate-5",
        "toSystemId": "pirate-6",
        "class": "base"
    },
    {
        "id": "link-pirate-6-midrim-112",
        "fromSystemId": "pirate-6",
        "toSystemId": "midrim-112",
        "class": "gate"
    },
    {
        "id": "link-pirate-6-pirate-7",
        "fromSystemId": "pirate-6",
        "toSystemId": "pirate-7",
        "class": "base"
    },
    {
        "id": "link-pirate-7-pirate-8",
        "fromSystemId": "pirate-7",
        "toSystemId": "pirate-8",
        "class": "base"
    },
    {
        "id": "link-pirate-8-midrim-11",
        "fromSystemId": "pirate-8",
        "toSystemId": "midrim-11",
        "class": "gate"
    },
    {
        "id": "link-pirate-8-pirate-9",
        "fromSystemId": "pirate-8",
        "toSystemId": "pirate-9",
        "class": "base"
    },
    {
        "id": "link-pirate-9-pirate-10",
        "fromSystemId": "pirate-9",
        "toSystemId": "pirate-10",
        "class": "base"
    },
    {
        "id": "link-pirate-10-pirate-11",
        "fromSystemId": "pirate-10",
        "toSystemId": "pirate-11",
        "class": "base"
    },
    {
        "id": "link-pirate-11-midrim-15",
        "fromSystemId": "pirate-11",
        "toSystemId": "midrim-15",
        "class": "gate"
    },
    {
        "id": "link-pirate-11-pirate-12",
        "fromSystemId": "pirate-11",
        "toSystemId": "pirate-12",
        "class": "base"
    },
    {
        "id": "link-pirate-12-midrim-63",
        "fromSystemId": "pirate-12",
        "toSystemId": "midrim-63",
        "class": "gate"
    },
    {
        "id": "link-pirate-12-pirate-13",
        "fromSystemId": "pirate-12",
        "toSystemId": "pirate-13",
        "class": "base"
    },
    {
        "id": "link-pirate-13-pirate-14",
        "fromSystemId": "pirate-13",
        "toSystemId": "pirate-14",
        "class": "base"
    },
    {
        "id": "link-pirate-14-beta-f3c899cead828543e2cf",
        "fromSystemId": "pirate-14",
        "toSystemId": "beta-f3c899cead828543e2cf",
        "class": "gate"
    },
    {
        "id": "link-pirate-14-pirate-15",
        "fromSystemId": "pirate-14",
        "toSystemId": "pirate-15",
        "class": "base"
    },
    {
        "id": "link-pirate-15-beta-f3c899cead828543e2cf",
        "fromSystemId": "pirate-15",
        "toSystemId": "beta-f3c899cead828543e2cf",
        "class": "gate"
    },
    {
        "id": "link-pirate-15-pirate-16",
        "fromSystemId": "pirate-15",
        "toSystemId": "pirate-16",
        "class": "base"
    },
    {
        "id": "link-pirate-16-pirate-17",
        "fromSystemId": "pirate-16",
        "toSystemId": "pirate-17",
        "class": "base"
    },
    {
        "id": "link-pirate-17-beta-6c95b052cbabede02b5f",
        "fromSystemId": "pirate-17",
        "toSystemId": "beta-6c95b052cbabede02b5f",
        "class": "gate"
    },
    {
        "id": "link-pirate-17-pirate-18",
        "fromSystemId": "pirate-17",
        "toSystemId": "pirate-18",
        "class": "base"
    },
    {
        "id": "link-pirate-18-beta-69c8bbc66c63e6e36d3f",
        "fromSystemId": "pirate-18",
        "toSystemId": "beta-69c8bbc66c63e6e36d3f",
        "class": "gate"
    },
    {
        "id": "link-pirate-18-pirate-19",
        "fromSystemId": "pirate-18",
        "toSystemId": "pirate-19",
        "class": "base"
    },
    {
        "id": "link-pirate-19-beta-0f160ab95ed003567f13",
        "fromSystemId": "pirate-19",
        "toSystemId": "beta-0f160ab95ed003567f13",
        "class": "gate"
    },
    {
        "id": "link-corridor-2-corridor-1",
        "fromSystemId": "corridor-2",
        "toSystemId": "corridor-1",
        "class": "base"
    },
    {
        "id": "link-corridor-1-corridor-3",
        "fromSystemId": "corridor-1",
        "toSystemId": "corridor-3",
        "class": "base"
    },
    {
        "id": "link-corridor-3-corridor-4",
        "fromSystemId": "corridor-3",
        "toSystemId": "corridor-4",
        "class": "base"
    },
    {
        "id": "link-corridor-4-corridor-5",
        "fromSystemId": "corridor-4",
        "toSystemId": "corridor-5",
        "class": "base"
    },
    {
        "id": "link-corridor-6-corridor-5",
        "fromSystemId": "corridor-6",
        "toSystemId": "corridor-5",
        "class": "base"
    },
    {
        "id": "link-corridor-5-corridor-7",
        "fromSystemId": "corridor-5",
        "toSystemId": "corridor-7",
        "class": "base"
    },
    {
        "id": "link-corridor-8-corridor-7",
        "fromSystemId": "corridor-8",
        "toSystemId": "corridor-7",
        "class": "base"
    },
    {
        "id": "link-corridor-7-corridor-9",
        "fromSystemId": "corridor-7",
        "toSystemId": "corridor-9",
        "class": "base"
    },
    {
        "id": "link-corridor-9-corridor-10",
        "fromSystemId": "corridor-9",
        "toSystemId": "corridor-10",
        "class": "base"
    },
    {
        "id": "link-corridor-11-corridor-10",
        "fromSystemId": "corridor-11",
        "toSystemId": "corridor-10",
        "class": "base"
    },
    {
        "id": "link-corridor-10-corridor-12",
        "fromSystemId": "corridor-10",
        "toSystemId": "corridor-12",
        "class": "base"
    },
    {
        "id": "link-corridor-12-corridor-13",
        "fromSystemId": "corridor-12",
        "toSystemId": "corridor-13",
        "class": "base"
    },
    {
        "id": "link-corridor-13-corridor-14",
        "fromSystemId": "corridor-13",
        "toSystemId": "corridor-14",
        "class": "base"
    },
    {
        "id": "link-corridor-14-corridor-15",
        "fromSystemId": "corridor-14",
        "toSystemId": "corridor-15",
        "class": "base"
    },
    {
        "id": "link-corridor-15-corridor-16",
        "fromSystemId": "corridor-15",
        "toSystemId": "corridor-16",
        "class": "base"
    },
    {
        "id": "link-corridor-16-corridor-17",
        "fromSystemId": "corridor-16",
        "toSystemId": "corridor-17",
        "class": "base"
    },
    {
        "id": "link-corridor-18-corridor-16",
        "fromSystemId": "corridor-18",
        "toSystemId": "corridor-16",
        "class": "base"
    },
    {
        "id": "link-corridor-17-corridor-19",
        "fromSystemId": "corridor-17",
        "toSystemId": "corridor-19",
        "class": "base"
    },
    {
        "id": "link-corridor-19-corridor-20",
        "fromSystemId": "corridor-19",
        "toSystemId": "corridor-20",
        "class": "base"
    },
    {
        "id": "link-corridor-20-corridor-21",
        "fromSystemId": "corridor-20",
        "toSystemId": "corridor-21",
        "class": "base"
    },
    {
        "id": "link-corridor-21-corridor-22",
        "fromSystemId": "corridor-21",
        "toSystemId": "corridor-22",
        "class": "base"
    },
    {
        "id": "link-corridor-23-corridor-22",
        "fromSystemId": "corridor-23",
        "toSystemId": "corridor-22",
        "class": "base"
    },
    {
        "id": "link-corridor-22-corridor-24",
        "fromSystemId": "corridor-22",
        "toSystemId": "corridor-24",
        "class": "base"
    },
    {
        "id": "link-alpha-9118700d09dd16a37dae-beta-cf25ff19292a459c370d",
        "fromSystemId": "alpha-9118700d09dd16a37dae",
        "toSystemId": "beta-cf25ff19292a459c370d",
        "class": "gate"
    },
    {
        "id": "link-alpha-26d168eb718a2f71d9e3-beta-c6e3f27e9ec1ae6fb4db",
        "fromSystemId": "alpha-26d168eb718a2f71d9e3",
        "toSystemId": "beta-c6e3f27e9ec1ae6fb4db",
        "class": "gate"
    },
    {
        "id": "link-alpha-2eaba9e9cd66cd3ab7e3-beta-7525e9a606bdf2fc36d3",
        "fromSystemId": "alpha-2eaba9e9cd66cd3ab7e3",
        "toSystemId": "beta-7525e9a606bdf2fc36d3",
        "class": "gate"
    },
    {
        "id": "link-alpha-bf25caf698bb5d42de95-gamma-2598af70aa7b5b6910a9",
        "fromSystemId": "alpha-bf25caf698bb5d42de95",
        "toSystemId": "gamma-2598af70aa7b5b6910a9",
        "class": "gate"
    },
    {
        "id": "link-alpha-fa0b1dffda00ef2f632e-gamma-7bca59b7eac72aef0816",
        "fromSystemId": "alpha-fa0b1dffda00ef2f632e",
        "toSystemId": "gamma-7bca59b7eac72aef0816",
        "class": "gate"
    },
    {
        "id": "link-alpha-bfce419f3db68c99a5d5-gamma-dc5b13db984702553e92",
        "fromSystemId": "alpha-bfce419f3db68c99a5d5",
        "toSystemId": "gamma-dc5b13db984702553e92",
        "class": "gate"
    },
    {
        "id": "link-beta-7ca951c541e3eebce299-omicron-34d85d054b229ed8e8ba",
        "fromSystemId": "beta-7ca951c541e3eebce299",
        "toSystemId": "omicron-34d85d054b229ed8e8ba",
        "class": "gate"
    },
    {
        "id": "link-beta-f25c24652c5adb52cd26-omicron-de07956e9d6833f9918c",
        "fromSystemId": "beta-f25c24652c5adb52cd26",
        "toSystemId": "omicron-de07956e9d6833f9918c",
        "class": "gate"
    },
    {
        "id": "link-beta-ac125172d4e963508617-omicron-fceff1ab097584801538",
        "fromSystemId": "beta-ac125172d4e963508617",
        "toSystemId": "omicron-fceff1ab097584801538",
        "class": "gate"
    },
    {
        "id": "link-gamma-8f31498752a434bf85cf-omicron-3d7a21a8033c34d60d4e",
        "fromSystemId": "gamma-8f31498752a434bf85cf",
        "toSystemId": "omicron-3d7a21a8033c34d60d4e",
        "class": "gate"
    },
    {
        "id": "link-gamma-7bca59b7eac72aef0816-omicron-d8ffa65be5176d4cc4af",
        "fromSystemId": "gamma-7bca59b7eac72aef0816",
        "toSystemId": "omicron-d8ffa65be5176d4cc4af",
        "class": "gate"
    },
    {
        "id": "link-gamma-cdde4c2bb81bece8d1ac-omicron-1a52fa2e192ad338b448",
        "fromSystemId": "gamma-cdde4c2bb81bece8d1ac",
        "toSystemId": "omicron-1a52fa2e192ad338b448",
        "class": "gate"
    }
];

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Regions (3 in different states) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export const mockRegions: Region[] = [
    {
        id: 'crimson-expanse',
        name: 'Crimson Expanse',
        systemIds: ['alpha-18109e81be8a4bb03aab', 'alpha-1acb646b529592834b59', 'alpha-e57bea6eb8b32ca91823', 'alpha-c3fd1fb4c112be530803', 'alpha-1ec3d07e8aa8f591f2d3', 'alpha-dcceae93af2cee689c3d', 'alpha-2aa105d8907b9d002b68', 'alpha-f7fbf720a5a959ca3485', 'alpha-2bcbc34b64aa06f44e57', 'alpha-a212bbc325df7b2dbb21', 'alpha-f7fd7a7f0ce6e0565f0c', 'alpha-d53ed5974db2feb09944', 'alpha-2eaba9e9cd66cd3ab7e3', 'alpha-7dfdd0eb2c003caf125a', 'alpha-261a72d2de2156ed6228', 'alpha-b7b04e022e8a9ba61ae5', 'alpha-ccb04e698861a41cf87c', 'alpha-046f8a1c67d1e85e6d67', 'alpha-2c43e5f027efa31149a4', 'alpha-fa0b1dffda00ef2f632e', 'alpha-6e25d4c0d8f819351779', 'alpha-be4002f65035772ac947', 'alpha-9c5f095a406cae00e02e', 'alpha-9114d4daa712ba370227', 'alpha-64b330bd4dcf42685da7', 'alpha-2d2228bab8907fc0fae4', 'alpha-06be2bbb727c940eaa69', 'alpha-ba27a3bd8bc12baa5ca6', 'alpha-275436a4333557bd8558', 'alpha-bb493903a82b682a09b7', 'alpha-fdc1d85697e1cfb20980', 'alpha-5a4e807c3b982fbdc3ff', 'alpha-3b415e894aec8b9784d8', 'alpha-a1da22f003f423b6d453', 'alpha-5c74d3ed7df81fde8bab', 'alpha-959a09b50fa701a712c1', 'alpha-a008ac6571e67969b423', 'alpha-f355340cef8c83ceed83', 'alpha-085812f4e511189ad9ad', 'alpha-cb99bd5dc79079de04f8', 'alpha-77713d288e967f3dd906', 'alpha-6897a07a2c13440a46d7', 'alpha-ba89e04b1daca093eaa4', 'alpha-9118700d09dd16a37dae', 'alpha-47f96874edc7ecf5332b', 'alpha-3ed956ee2cf7fe6190bf', 'alpha-f6a828edd40e2d736209', 'alpha-bf25caf698bb5d42de95', 'midrim-21', 'midrim-22', 'midrim-23', 'midrim-34', 'midrim-40', 'midrim-45', 'midrim-48', 'midrim-66', 'midrim-69', 'midrim-77', 'midrim-79', 'midrim-87', 'midrim-90', 'midrim-99'],
        status: 'stable',
        color: '#dc2626',
        metrics: {
            stabilityIndex: 72,
            tradeVolume: 4840,
            pirateShare: 0.09,
            escalationAvg: 3.2,
            dominantIdeology: 'imperial',
            institutionalInfluence: 65,
            strengthScore: 78,
        },
    },
    {
        id: 'veldt-dominion',
        name: 'Veldt Dominion',
        systemIds: ['midrim-2', 'midrim-8', 'midrim-16', 'midrim-17', 'midrim-24', 'midrim-25', 'midrim-51', 'midrim-53', 'midrim-56', 'midrim-57', 'midrim-62', 'midrim-67', 'midrim-72', 'midrim-75', 'midrim-76', 'midrim-82', 'midrim-84', 'midrim-89', 'midrim-95', 'midrim-104', 'midrim-115'],
        status: 'dissolving',
        color: '#d97706',
        metrics: {
            stabilityIndex: 28,
            tradeVolume: 1200,
            pirateShare: 0.37,
            escalationAvg: 7.1,
            dominantIdeology: 'anarchist',
            institutionalInfluence: 14,
            strengthScore: 22,
        },
    },
    {
        id: 'nullward-fringe',
        name: 'Nullward Fringe',
        systemIds: ['alpha-5b34961e18bb6fd14903', 'alpha-fe148b9a69a680fa14a3', 'alpha-10fae8cf89590243337b', 'alpha-8bfbb8fd552f8acf462f', 'alpha-9ac1cf4cc2e559fa5ab1', 'alpha-b51aa651102346de66b9', 'alpha-782feae03506829e3c7e', 'alpha-aa36c683d4a7122e297c', 'alpha-db9639818642df50f902', 'alpha-50fbd1557c5b56dc87fa', 'alpha-b3312d2d9c677aef75db', 'alpha-8a40511158412f567b03', 'alpha-4311b6f81dedf12e0c2c', 'alpha-34e03bcf49937a7edbb9', 'alpha-ac4c542940131472a01d', 'alpha-4ba4ca6a33d9f625e77b', 'alpha-3d820954f227ec2b3091', 'alpha-5bb669c4f6863fd34440', 'alpha-414232c001f7eb326b61', 'alpha-7bb54be5b2571bcab8fd', 'alpha-2bd1a5fe96a34ca33eca', 'alpha-00878ac605304517fcf1', 'alpha-beea8431a468fde791e4', 'alpha-322c8510c2a7803f4f62', 'alpha-b408e4b93d1a64ac5080', 'alpha-618860964f60b00fdf8e', 'alpha-e7d2277ef6ade0bd5818', 'alpha-c5f83db2f6f7691379a0', 'alpha-26d168eb718a2f71d9e3', 'alpha-f326b9e042fa6bdef906', 'alpha-62294315db6d7b6ee1fa', 'alpha-8d0ab4f97c5c755ae21c', 'alpha-f2de59304d1bf882e9b8', 'alpha-7065e4bfb85c49197e1e', 'alpha-b4f71ffbd6f247d6941d', 'alpha-92675f3b6d655e340990', 'alpha-52c2705d81d86cb8e5ed', 'alpha-375cd7dcede25c802a67', 'alpha-1709cb70fb36dacc5834', 'alpha-ef5a38ae451f125ea804', 'alpha-0b46a0bec05790fc13c4', 'alpha-fe1c7b05cd1af6875424', 'alpha-bfce419f3db68c99a5d5', 'alpha-955d12e6f38659750111', 'alpha-6cba4294b94d7d7932c8', 'alpha-a23ccc19631de6c1af51', 'alpha-766bc8d1e933809eff63', 'beta-c5f8c0023d6adb25b58d', 'beta-57bb06780df12c56e136', 'beta-1c57c0addeab1fc72537', 'beta-55a55dfd7d579bf57f89', 'beta-0f247f64601e2e2c78c6', 'beta-f3c899cead828543e2cf', 'beta-db610ed3d41869099de0', 'beta-2dcf36e3f880c86255d2', 'beta-b1466e1bbe4623fa659f', 'beta-6e62dd07925158f738e3', 'beta-e82292557740b3348233', 'beta-6c95b052cbabede02b5f', 'beta-855ec0bc494f210b3e8c', 'beta-c0787c791d7dcbf7a40e', 'beta-d65ebc02964a510abad5', 'beta-82a57cbe0ed3dff7731a', 'beta-2df33f092b3d82b58a4a', 'beta-921a11ac31d98eb81cc8', 'beta-d10fe5f484be88dc8400', 'beta-563fca435e9525e7b563', 'beta-732792bb58c91a56628e', 'beta-62e4795b3a71fe1e8dcc', 'beta-cf25ff19292a459c370d', 'beta-f25c24652c5adb52cd26', 'beta-89e124cb21241279d856', 'beta-f65c954454286b66c941', 'beta-9d93f65702d91f7c197a', 'beta-de96a8159eaa52f24bdc', 'beta-820c1e701b1cc8fecdb6', 'beta-17e4596e61006e302745', 'beta-9a871a0a8e9ea7a21f1f', 'beta-7a8ce6eb04f33dfbe744', 'beta-34c23920b83a60cab3b1', 'beta-cc0be74a1b0003415961', 'beta-39e3e118b4f8428f6edd', 'beta-7525e9a606bdf2fc36d3', 'beta-79a68f2b78845c1f6ecb', 'beta-c635f69a1f9f4895c403', 'beta-668faef57c6f2ef34520', 'beta-55c58ce0dd4c30e4bbc8', 'beta-4f583d7245f8ec6be7fc', 'beta-7be12cddf0a4c22907ff', 'beta-3fb1899476465e8495d5', 'beta-b8164bddec16d19d73e4', 'beta-62ab9e657c386b4cd1de', 'beta-7c515dbea9e435f5aecf', 'beta-81c89328761a457b3445', 'beta-0eea8fb5886634a21e36', 'beta-7c3b24c658df2d289c14', 'beta-c6e3f27e9ec1ae6fb4db', 'beta-4ee3f2b044243635e376', 'beta-ce2a30dc97fb96d6815d', 'beta-4bd06018ed2e39e80144', 'beta-953f35418860d1997c2f', 'beta-aec7801f5496bd6f19ea', 'beta-2f8675f3f38599d82367', 'beta-4a0a29d9b91279193337', 'beta-a9f12cde01ba11d02b9d', 'beta-2863f7328abb4030517e', 'beta-c54a9f0ea25a027a295a', 'beta-ac125172d4e963508617', 'beta-a2bfe047172cf490aea9', 'beta-4e1dd4d3384f3f5cf7eb', 'beta-4817db6ad5ecd27f0417', 'beta-cbb753893569b18039f4', 'beta-8d686d52c7e4023203d5', 'beta-ff1d82cf0013f01a89af', 'beta-a5cb3814eeecf3b0332f', 'beta-e12969b14b05937fadb6', 'beta-cd431cef240788933ac6', 'beta-0f160ab95ed003567f13', 'beta-6c23ca0639e80aa73208', 'beta-5d553dd1008a281d4431', 'beta-632171f60a1458f77c17', 'beta-56b0bea442819b0a79fa', 'beta-ce5674100b4cea16d5f1', 'beta-0d8d2c468f83d7a70b59', 'beta-69c8bbc66c63e6e36d3f', 'beta-02b7e603768bbb2a4d70', 'beta-c03c3de3e71278c7b014', 'beta-28faec89234251cf184f', 'beta-5b07ba4d9b8b6d8cddfc', 'beta-0f730835cc4b6ac6432f', 'beta-8a19c9728a7c8ed266fd', 'beta-7ca951c541e3eebce299', 'beta-54c17fa621aefdbef17c', 'beta-a331719b5bb4e59d2037', 'beta-b81f11e98033caa0d1e7', 'gamma-b695c2c3ec80b99ca69c', 'gamma-a9f24cc1d81380947287', 'gamma-eefe6c36e631624352cf', 'gamma-fcef9b84cb40cf60bba2', 'gamma-91ef7f7ca53b1d0358a6', 'gamma-21580600c4ed6adfe98f', 'gamma-3d68ef177e55f1ad4fd4', 'gamma-8ecfdc5d70dde035eb06', 'gamma-97d0bdb9e729c1661701', 'gamma-1eac053f009edbbbc2da', 'gamma-8f31498752a434bf85cf', 'gamma-9ad066ff06d05ecc42d2', 'gamma-8721c2c98a69b3b71088', 'gamma-057ebf96e2377cb9751f', 'gamma-c29aefb61a1c9c96fc4f', 'gamma-62625035f3b13dd2c04c', 'gamma-7181985f1d1d19bdf2ec', 'gamma-0cef58cc009bc1c15f59', 'gamma-bc072a518af1938b60bd', 'gamma-4a773fecb2c4c3230258', 'gamma-7bca59b7eac72aef0816', 'gamma-fdf88baeb345fa14cc93', 'gamma-d0c866c35ef74cbb4ea1', 'gamma-15c234ff62898d6a0397', 'gamma-a44406316e50ddb57fab', 'gamma-a43593bc02027d9e27cd', 'gamma-d6e47e35c2bf5113c447', 'gamma-820819a6ca58597dfb2e', 'gamma-687d9ef302f2da9e89ae', 'gamma-50648c9376b39dd049b3', 'gamma-50f8a8c9ec8420303704', 'gamma-2b3b53181d66d15d09a6', 'gamma-bb3e70cdffaa4c134ab2', 'gamma-16065a790f8240690bdc', 'gamma-3b342ea7ccf553eb51b2', 'gamma-bb33e5e94ce068dbbc1d', 'gamma-7acee9a75b1d3221de18', 'gamma-70c116866aa5a710699f', 'gamma-31c2aa3d479e8869451e', 'gamma-8a655487736673213da3', 'gamma-478377d2af23747cbef4', 'gamma-af4c8087e48565cbc29d', 'gamma-ec7c147c151b113ebcc2', 'gamma-ecbd79c783b577b6e001', 'gamma-7ff3543165d3def7b112', 'gamma-92e8798abdeef7ec72c0', 'gamma-f3f1ca458f6229840a99', 'gamma-ec75c51f1b5fb3cd6b89', 'gamma-7a42e1868b8f959bdc2f', 'gamma-57dc1bac11d8bb8563cc', 'gamma-9346dbd4ac7a438dc5d7', 'gamma-4143b6a0e3070771cf7f', 'gamma-3b036c40c3c9a2b3f54a', 'gamma-ead9315eff66b2436c12', 'gamma-41a8b0746a92ae2afa68', 'gamma-6877838b86951f091b4e', 'gamma-61ff2dfc995d521a8d7c', 'gamma-775c53887949c4d88c77', 'gamma-1f814750ed2766162259', 'gamma-ed3fd619ea66ad8d7d25', 'gamma-10580b6d6896787c92c7', 'gamma-35c6ff816b2058a8e6f2', 'gamma-5e1bff1ae8f543660e33', 'gamma-cdde4c2bb81bece8d1ac', 'gamma-37341b05d17b63d28051', 'gamma-6bb5826713afebbe6527', 'gamma-c9ba4009713a03b228f4', 'gamma-beb36e969fa6ab62fd14', 'gamma-006daeff66a88eb4b0a9', 'gamma-57007a0f9d4c8305f978', 'gamma-1aca6c4182f6900919a2', 'gamma-3b34ad09c67accef6498', 'gamma-fa2e5ae24cb5c900e30d', 'gamma-108745b898d446c66d76', 'gamma-af6bedc870efaa430d55', 'gamma-c7a4ec515dda9f4aa83b', 'gamma-b9077f595e821cc4b466', 'gamma-4f66f56929456bbfe807', 'gamma-dc5b13db984702553e92', 'gamma-621bab19ae059e951d3d', 'gamma-a2b91b9faf68c9c34b07', 'gamma-35c08d13bf0ae8ab2ba7', 'gamma-85f01c1d165306a83dfd', 'gamma-27c6900642b6a604232c', 'gamma-2598af70aa7b5b6910a9', 'gamma-cb112586b0eac75b121f', 'gamma-0bd1ad18ac2cad2bdaeb', 'gamma-6cba73ec2f63ace78494', 'gamma-1d81736a3f6cf454bdc9', 'gamma-ee76146a27eac366a512', 'gamma-b3fa77f5c534e7dc710d', 'gamma-288e51191f2afd7bf29a', 'gamma-3c996e4b04c0498d39ae', 'gamma-c573a4fc5cd109ca247b', 'gamma-8f544873843c5462c522', 'gamma-2c22f2bb94632e23acc4', 'gamma-b8243c454ee5299719c2', 'gamma-c849701c1046f408f82b', 'gamma-77fe1fa1a52893635b2e', 'gamma-b4c768313989c19c41e5', 'gamma-dd8b1eaccc3a4f93b052', 'gamma-e8db5217421a0538853e', 'gamma-4d9d0ce0e294d054d57d', 'gamma-810bc94e63d17218935b', 'gamma-d0aa9dfb677f40d531be', 'gamma-13bd3ce967fcb81f0784', 'gamma-582162e831022c5fbb45', 'gamma-ac003cc0150d3e61592b', 'gamma-c2cb98ebcd33f1452e98', 'gamma-9f9546aece13cf3303e9', 'gamma-f04fa0c13b1d442fea83', 'gamma-108b79fabce3d02f1638', 'gamma-325b47bd762e7a83ada2', 'gamma-d76327d2e9fe73f55c16', 'gamma-5dcff4a1f4bc7255af37', 'gamma-73d9fb058065b51b58dc', 'gamma-11b892b24c14155bde5f', 'gamma-3d91c434344dec94d389', 'gamma-55ae407005cc0bf5d7de', 'omicron-7f8283fb75a60d01bf37', 'omicron-d8ffa65be5176d4cc4af', 'omicron-2eda2e5d39297feaf3d8', 'omicron-26a140d521ed313a2db2', 'omicron-a6b34eed2f81b3538700', 'omicron-dc1601dfb376639175c7', 'omicron-1834335c2305c1da6640', 'omicron-3d7a21a8033c34d60d4e', 'omicron-a14851c3cee03238d7e6', 'omicron-d3854c29cce0165310f7', 'omicron-7d3fc9f19094262d1536', 'omicron-b62fb9e336bfcf61f5e8', 'omicron-8c264b5adcc1ff837ed0', 'omicron-3ae1ba293232a7868296', 'omicron-c77c66bae370402138f8', 'omicron-29d121f14536cff6168c', 'omicron-32b5cd8b695ec0b63259', 'omicron-a9bcb339537580e14dad', 'omicron-9dd12fe9a3cce425043e', 'omicron-b638d3ee64b8827fae17', 'omicron-21930a52e2190eabd979', 'omicron-34d85d054b229ed8e8ba', 'omicron-0daea28079f81b8fef8f', 'omicron-6f59e7529064d2b7386e', 'omicron-9e338aec244d2378716d', 'omicron-672727117e15e39778e0', 'omicron-b312ce2a19a19e0dd7d6', 'omicron-a681658aca40ebe357c2', 'omicron-c0d98ad3ddfe5050f152', 'omicron-062e9f7e9efaad335db6', 'omicron-4834e5b4bb4c2c146d8e', 'omicron-c86b09367f435f7aa417', 'omicron-762e641bc34e7adc6a47', 'omicron-e9673f5b3e42510ca277', 'omicron-4213b6c914c81fde06f0', 'omicron-4430702b13a357065a80', 'omicron-394fe066e6f28452b0bb', 'omicron-cfebd4b7c8b79c4d2a67', 'omicron-ba732aa85127a7e61d48', 'omicron-a7e35ae907f40505004b', 'omicron-04884114b28745107682', 'omicron-606952beae05205ae47f', 'omicron-f4c44eb9317d6036df9e', 'omicron-e1fa10cf020de0873514', 'omicron-1a52fa2e192ad338b448', 'omicron-ea164e0fe337ad7a9235', 'omicron-c136b185e60ca349aec2', 'omicron-3aeed261c4e9ba80a0c5', 'omicron-c83e6dd202449322ebc3', 'omicron-1f8d9300a1168ce106a2', 'omicron-5a8fab5a3f2d61d70e84', 'omicron-7516196752322920bcea', 'omicron-5d0c4cc3a51ad57a3bd9', 'omicron-cb8ff32dbdb88371a2a0', 'omicron-41f3cd531e9926c1a127', 'omicron-e7de1134dd7a8b29c02e', 'omicron-ad89d46ee3ccc115e9db', 'omicron-bed421bb82e32a7fc4db', 'omicron-0b0ac9d146088032f169', 'omicron-7388d501f9d52ee3c5d2', 'omicron-fceff1ab097584801538', 'omicron-69e9d95fa3d3d75978d0', 'omicron-9361fbc3dfd165d74002', 'omicron-b3cda7b699fed1b379b1', 'omicron-91480f97b237b6e50b23', 'omicron-8fe902922069c4d7a08b', 'omicron-694484106b485f6cdc00', 'omicron-b01b35f34be8ebb57001', 'omicron-cb0a9ffa8bab25a7c679', 'omicron-600aefcab6013ddaa627', 'omicron-bb74e651c6293bf3335c', 'omicron-69282fe418afcc78b095', 'omicron-34fec72fcd6dc6f7666e', 'omicron-de07956e9d6833f9918c', 'omicron-f9eb57a684a562d602d8', 'omicron-22a752a260fe1916d41c', 'omicron-565b620e091c89739668', 'omicron-2c20a70dc6f89cc4d700', 'omicron-2e768b41e0d1c4494bb6', 'omicron-2a4c453fbee0b598b19e', 'omicron-60a9f91861a71b8780be', 'omicron-cc4aea94709241c20bf6', 'omicron-949d1fb54e31ee8d3f91', 'omicron-b088b9116dcc1010b834', 'omicron-07bd7df19fdb7e0a0bd1', 'omicron-0162cbe1fdfcb88e18fb', 'omicron-677484a3b9a2d1a12b82', 'omicron-789203298a78e54523b2', 'omicron-c3f9a580fef78cf98c3b', 'omicron-a5f695c9a93f9586aa26', 'omicron-b6f554ec6ca3ef70179b', 'omicron-0322b443d18dfabe2c32', 'omicron-151aa60cc9fb0e4b91d9', 'omicron-dadedd026d3a9a800d4b', 'omicron-fc6707528d16c5590dd9', 'omicron-c97cead7be9ee318332c', 'omicron-3978fcbdedd5c300b1f7', 'omicron-d5047f9bd0140c16bd7a', 'omicron-50c2b86df50cdeb73412', 'omicron-bb4225daabf90c51c748', 'pirate-0', 'pirate-1', 'pirate-2', 'pirate-3', 'pirate-4', 'pirate-5', 'pirate-6', 'pirate-7', 'pirate-8', 'pirate-9', 'pirate-10', 'pirate-11', 'pirate-12', 'pirate-13', 'pirate-14', 'pirate-15', 'pirate-16', 'pirate-17', 'pirate-18', 'pirate-19'],
        status: 'emerging',
        color: '#7c3aed',
        metrics: {
            stabilityIndex: 51,
            tradeVolume: 2100,
            pirateShare: 0.21,
            escalationAvg: 4.8,
            dominantIdeology: 'mercantile',
            institutionalInfluence: 35,
            strengthScore: 48,
        },
    },
];

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Regional Crisis Windows (2 simultaneous) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export const mockCrisisWindows: RegionCrisisWindow[] = [
    {
        id: 'rcw-001',
        regionId: 'veldt-dominion',
        kind: 'order',
        phase: 'active',
        startedAt: '2026-01-15T08:00:00Z',
        intensity: 74,
    },
    {
        id: 'rcw-002',
        regionId: 'crimson-expanse',
        kind: 'coldWar',
        phase: 'warning',
        startedAt: '2026-02-01T14:30:00Z',
        endsAt: '2026-03-01T14:30:00Z',
        intensity: 42,
    },
];

// ─── Council (split, with 2 blocs) ────────────────────────────────────────────

export const mockCouncilState: CouncilState = {
    status: 'split',
    legitimacy: 55,
    cohesion: 31,
    polarization: 78,
    enforcementCapacity: 44,
    corruptionExposure: 62,
    emergencySession: true,
    blocs: [
        {
            id: 'bloc-hegemony',
            name: 'Grand Hegemony Accord',
            memberFactionIds: ['faction-aurelian', 'faction-covenant'],
            influenceScore: 58,
        },
        {
            id: 'bloc-independence',
            name: 'Free Systems Pact',
            memberFactionIds: ['faction-vektori', 'faction-null-syndicate'],
            influenceScore: 42,
        },
    ],
    activeResolutionIds: ['res-embargo-nullward', 'res-piracy-sanction'],
};

// ─── Player State (shadow / pirate mode) ──────────────────────────────────────

export const mockPlayerState: PlayerState = {
    factionId: 'faction-null-syndicate',
    civilizationId: 'civ-auraxian',
    ideologyId: 'ideo-technocratic',
    role: 'shadow',
    pirateInvolvementScore: 68,
    infamy: 54,
    heat: 41,
    networkControl: 72,
    blackMarketLiquidity: 88,
    crewLoyalty: 63,
};

// ─── Crisis Events ────────────────────────────────────────────────────────────

export const mockCrisisEvents: CrisisEvent[] = [
    {
        id: 'cev-001',
        regionId: 'veldt-dominion',
        targetFactionId: 'faction-vektori',
        type: 'rebellion',
        startedAt: '2026-02-10T00:00:00Z',
        responseDeadline: '2026-02-28T00:00:00Z',
        severity: 'major',
        resolved: false,
    },
    {
        id: 'cev-002',
        regionId: 'crimson-expanse',
        targetFactionId: 'faction-aurelian',
        type: 'trade_war',
        startedAt: '2026-02-18T00:00:00Z',
        responseDeadline: '2026-03-10T00:00:00Z',
        severity: 'minor',
        resolved: false,
    },
    {
        id: 'cev-003',
        targetFactionId: 'faction-null-syndicate',
        type: 'pirate_surge',
        startedAt: '2026-02-20T00:00:00Z',
        responseDeadline: '2026-03-05T00:00:00Z',
        severity: 'existential',
        resolved: false,
    },
];

export { mockSeasonState } from './mock-season';
export { mockChronicle } from './mock-chronicle';
export { mockCivilizationalOutcomes } from './mock-outcomes';
export { mockEspionageState } from './mock-espionage';
export { mockPoliticsState } from './mock-politics';
export { mockDiplomacyState } from './mock-diplomacy';
export { mockTechState } from './mock-tech';
export { mockDiscourseState } from './mock-discourse';
export { mockCorporateState } from './mock-corporate';

export const mockPressState: any = {
    tick: 0,
    empires: new Map(),
    planets: new Map(),
    pressFactions: new Map([
        ['faction-state-media', {
            id: 'faction-state-media',
            type: PressFactionType.STATE_MEDIA,
            affiliatedEmpireId: 'faction-aurelian',
            credibility: 85,
            bias: 50,
            cooldowns: new Map()
        }],
        ['faction-independent', {
            id: 'faction-independent',
            type: PressFactionType.INDEPENDENT_MEDIA,
            credibility: 90,
            bias: 0,
            cooldowns: new Map()
        }],
        ['faction-pirate', {
            id: 'faction-pirate',
            type: PressFactionType.PIRATE_PRESS,
            credibility: 30,
            bias: -60,
            cooldowns: new Map()
        }]
    ]),
    activeStories: new Map(),
    publishedStories: [],
    crises: new Map(),
    quarantinedPlanets: new Set(),
    jammedSystems: new Set(),
    counterNarratives: new Map()
};
