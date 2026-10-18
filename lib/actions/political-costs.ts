// lib/actions/political-costs.ts
// Acts of state that spend the government's political capital on top of any
// resource cost. Charged by the worker's executeOrder (scripts/game-loop.ts);
// lives here so the AI (lib/ai/offence-ai.ts) can see the price before it
// queues an order, as a player sees it on the button.

/**
 * Policies are NOT here — the policy service charges their own per-policy
 * cost so the price can vary by reform.
 */
export const POLITICAL_CAPITAL_COSTS: Record<string, number> = {
    DIP_DECLARE_WAR: 30,
    DIP_BREAK_TREATY: 20,
    DIP_IMPOSE_SANCTIONS: 15,
    INTERNAL_PURGE_FACTION: 25,
    // Until 2026-10-15 these listed an "influence" cost in lib/actions/registry,
    // and influence is not a reserve, so chargeOrderCost let them through free:
    // diplomacy, economic policy, company deals and discourse cost nothing.
    // Influence IS political capital in this game, so they cost that now,
    // scaled to a currency that refills around 75 a real day at par.
    DIP_SEND_ENVOY: 2,
    DIP_PROPOSE_TREATY: 5,
    DIP_TRADE_PACT: 3,
    DIP_DEMAND_TRIBUTE: 8,
    DIP_OFFER_CONTRACT: 2,
    DIP_LAUNCH_GAMBIT: 5,
    DIP_LIFT_SANCTIONS: 3,
    DIP_MAKE_PROMISE: 2,
    DIP_INTERVENE: 5,
    DIP_PLANT_RUMOR: 4,
    ECON_SET_FOCUS: 5,
    ECON_UPDATE_POLICY: 10,
    ECON_ESTABLISH_COMPANY: 20,
    ECON_LIQUIDATE_COMPANY: 10,
    ECON_GRANT_MONOPOLY: 20,
    CORP_HOSTILE_TAKEOVER: 10,
    CORP_MERGE: 15,
    CORP_SET_HOST_POLICY: 5,
    DISCOURSE_POST_OPINION: 2,
    DISCOURSE_VOTE_OPINION: 1,
    DISCOURSE_CENSOR_OPINION: 10,
    // Peace is deliberately free: nobody should be priced out of ending a war.
};
