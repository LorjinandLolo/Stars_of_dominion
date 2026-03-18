// types/index.ts
export type ResourceId = 'metals' | 'chemicals' | 'food' | 'happiness' | 'credits';

export interface EconomyState {
  resources: Record<ResourceId, number>;
  income_rates: Record<ResourceId, number>;
  capacities: Record<string, number>; // e.g., 'ammo', 'manpower', 'construction'
  last_updated: string; // ISO date
  // New Economic Health Metrics
  expenses: Record<ResourceId, number>; // Total upkeep costs per hour
  economic_health: {
    stability: number; // 0-100
    deficit_counter: number; // Number of ticks in debt
    status: 'solvent' | 'struggling' | 'bankrupt' | 'collapsed';
  };
}

export interface Upkeep {
  resource: ResourceId;
  amount: number;
}

export interface TradeRoute {
  id: string;
  origin_planet_id: string;
  target_planet_id: string;
  resource: ResourceId;
  amount: number; // hourly rate
  status: 'active' | 'blockaded' | 'pending';
}

export type CrisisType = 'embargo' | 'blockade' | 'sabotage' | 'cyber_attack';

export interface Crisis {
  id: string;
  type: CrisisType;
  target_faction_id: string;
  initiator_faction_id?: string;
  severity: 'minor' | 'major' | 'existential';
  deadline: string; // ISO date
  consequences: { resource: ResourceId, amount: number }[]; // Penalty if ignored
  resolution_cost: { resource: ResourceId, amount: number }[]; // Cost to resolve
  description: string;
}

export interface Resource { id: ResourceId; name: string; min: number; max: number; start: number; }
export interface Faction { id: string; name: string; desc: string; alignment: 'dominant' | 'rebel' | 'neutral'; }
export interface Sector {
  id: string; name: string; type: 'core' | 'rim' | 'frontier' | 'hub';
  neighbors: string[]; owner?: string; tags?: string[]; x?: number; y?: number; resources?: Record<string, number>;
  rows: number;
  columns: number;
}

export interface Tile {
  x: number;
  y: number;
  sectorId: string;
  entityIds: string[]; // Zero or more 'things'
}

export interface Entity {
  id: string;
  type: 'ship' | 'station' | 'anomaly' | 'resource' | 'army' | 'system' | 'bridge';
  ownerId?: string; // Faction ID
  sectorId: string;
  x: number;
  y: number;
  tags?: string[];
  properties?: Record<string, any>; // Flexible data for specific entity types
}

export type TheatreId = 'alpha' | 'beta' | 'gamma' | 'omicron' | 'bridge';

export type ArchetypeTag = 'throat' | 'canal' | 'spine' | 'fortress' | 'void' | 'basin' | 'bridge' | 'standard' | 'gate' | 'crimson_expanse' | 'veldt_dominion' | 'nullward_fringe' | 'middle_rim' | 'corsair_den' | 'strait';

export interface System extends Entity {
  type: 'system';
  name: string;
  theatreId: TheatreId; // Keeping for backward compat, acts as region_id
  region_id?: string; // More specific region ID (e.g., 'central_basin', 'sigma_cluster')
  archetype_tag?: ArchetypeTag;
  defense_modifier?: number;
  hazard_level?: number;
  trade_weight?: number;
  isBridge?: boolean;
  attributes?: Record<string, any>;
  hyperlaneTo?: { systemId: string; x: number; y: number }[]; // Connections
}

export interface EventChoiceEffect {
  type: 'resource_delta' | 'faction_relation' | 'sector_tag_add' | 'flag' | 'log';
  resource?: string; value?: number; a?: string; b?: string; delta?: number; sector?: string; tag?: string; key?: string; message?: string;
}

export interface GameEvent {
  id: string; title: string; body: string;
  triggers: any[];
  choices: { id: string; text: string; effects: EventChoiceEffect[] }[];
  effects?: EventChoiceEffect[];
  cooldown_days?: number; repeatable?: boolean; tags?: string[];
  newspaper?: { headline: string; lede: string; image?: string; tone?: 'neutral' | 'state' | 'rebel' | 'sensational' };
}

export interface GazetteArticle {
  $id?: string;
  day: number; headline: string; lede: string; tone?: 'neutral' | 'state' | 'rebel' | 'sensational'; image?: string;
}

export type FactionRole = 'Leader' | 'Minister of Defense' | 'Economic Advisor' | 'Head of Intelligence' | 'Citizen';

export interface UserProfile {
  $id: string;
  userId: string; // Link to Appwrite Auth User
  factionId: string;
  role: FactionRole;
  permissions: string[];
}

export interface Faction {
  id: string;
  name: string;
  desc: string;
  alignment: 'dominant' | 'rebel' | 'neutral';
  inviteCode?: string;
  governmentType?: string;
}
