/**
 * lib/intelligence/types.ts
 * Core data models for the Intelligence Operations System.
 */

export type IntelligenceCategory =
  | "intel_gathering"
  | "sabotage"
  | "political"
  | "disinformation"
  | "economic"
  | "military_blackops"
  | "counter_intelligence";

export type OperationRisk = "low" | "medium" | "high" | "extreme";

export type OperationPhase = 
  | "planning" 
  | "infiltration" 
  | "execution" 
  | "resolution" 
  | "exposure_check" 
  | "aftermath";

export type OperationOutcome = 
  | "critical_success" 
  | "success" 
  | "partial_success" 
  | "failure" 
  | "exposed_failure" 
  | "backfire";

export type TargetType =
  | "empire"
  | "system"
  | "planet"
  | "fleet"
  | "leader"
  | "faction"
  | "trade_route"
  | "building"
  | "research_project"
  | "alliance";

export interface OperationEffect {
  type: string;
  value: number;
  targetProperty?: string;
  durationSeconds?: number;
}

export interface CrisisTrigger {
  type: string;
  severity: number;
  title: string;
  description: string;
}

export interface OperationCondition {
  type: string;
  threshold: number;
  comparison: "min" | "max" | "equal";
}

export interface IntelligenceOperationDefinition {
  id: string;
  name: string;
  category: IntelligenceCategory;
  description: string;
  targetTypes: TargetType[];
  intelCost: number;
  creditsCost: number;
  durationHoursMin: number;
  durationHoursMax: number;
  baseSuccessChance: number;
  baseExposureChance: number;
  risk: OperationRisk;
  requiredTech?: string[];
  requiredAssets?: string[];
  requiredConditions?: OperationCondition[];
  effects: OperationEffect[];
  counterplayTags: string[];
  crisisTriggers?: CrisisTrigger[];
}

export interface OperationModifierBreakdown {
  source: string;
  value: number;
  type: "success" | "exposure" | "duration" | "cost";
}

export interface ActiveOperation {
  id: string;
  definitionId: string;
  attackerEmpireId: string;
  targetEmpireId: string;
  targetId: string;
  phase: OperationPhase;
  startedAt: number; // Unix seconds
  resolvesAt: number; // Unix seconds
  successChanceFinal: number;
  exposureChanceFinal: number;
  modifiers: OperationModifierBreakdown[];
  plantedAssets?: string[];
  status: "active" | "resolved" | "cancelled";
}

export interface IntelligenceNetwork {
  empireId: string;
  intelPoints: number;
  agentCapacity: number;
  usedAgentCapacity: number;
  counterIntelStrength: number;
  surveillanceStrength: number;
  propagandaResistance: number;
  internalSecurity: number;
  /** Infiltration score (0-100) keyed by targetEmpireId. */
  infiltrationLevels: Record<string, number>;
}

export interface SleeperCell {
  id: string;
  ownerEmpireId: string;
  targetEmpireId: string;
  locationType: TargetType;
  locationId: string;
  strength: number; // 0-1
  stealth: number; // 0-1
  loyalty: number; // 0-1
  establishedAt: number; // Unix seconds
  tags: string[];
}

export interface IntelligenceWorldState {
    operations: Map<string, ActiveOperation>;
    networks: Map<string, IntelligenceNetwork>; // empireId -> network
    sleeperCells: Map<string, SleeperCell>;
    // Reference definitions for resolution
    definitions: Map<string, IntelligenceOperationDefinition>;
}

export interface IntelEvent {
  id: string;
  title: string;
  summaryPublic: string;
  summaryClassified?: string;
  targetEmpireId: string;
  attackerEmpireId?: string;
  suspectedEmpireId?: string;
  confirmedEmpireId?: string;
  tags: string[];
  effects: OperationEffect[];
  createdAt: number;
}
