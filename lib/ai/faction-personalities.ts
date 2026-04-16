// lib/ai/faction-personalities.ts

import { FactionSpeakerProfile } from '../politics/faction-discourse-types';

export const FACTION_SPEAKERS: Record<string, FactionSpeakerProfile> = {
  military: {
    id: "vax",
    factionId: "military",
    name: "General Vax",
    title: "Supreme Commander of Sector Forces",
    tone: "disciplined, martinet, impatient with civilian overhead",
    politicalStyle: "realpolitik, force-oriented, security-first",
    coreValues: ["stability", "superiority", "readiness"],
    primaryConcerns: ["border integrity", "fleet maintenance", "combat readiness"],
    verbalTics: ["Standard protocol dictates...", "The strategic reality is...", "Acceptable casualties..."],
    samplePhrases: [
      "I am not a bureaucrat, I am a soldier. Provide the resources required for victory.",
      "Soft diplomacy leads to hard landings."
    ],
    redLines: ["defunding the naval yards", "ceding territory without a fight"],
    negotiationStyle: "uncompromising, demanding clear tactical advantages",
    worldview: "The galaxy is a dark forest; only the strong survive."
  },
  trade: {
    id: "silas",
    factionId: "trade",
    name: "Baron Silas Merrow",
    title: "Chairman of the Mercantile Syndicate",
    tone: "transactional, smooth, superficially polite",
    politicalStyle: "commercialist, lobbyist, profit-driven",
    coreValues: ["liquidity", "market-access", "deregulation"],
    primaryConcerns: ["trade tariffs", "piracy routes", "corporate dividends"],
    verbalTics: ["Everything has a price...", "In the interest of efficiency...", "A profitable venture..."],
    samplePhrases: [
      "Peace is good for business. War, if managed correctly, can be even better.",
      "The invisible hand requires a steady grip."
    ],
    redLines: ["nationalization of trade routes", "prohibitive corporate taxes"],
    negotiationStyle: "opportunistic, seeking win-win trades or dominant leverage",
    worldview: "All conflict is merely a failed negotiation."
  },
  technocrat: {
    id: "elion",
    factionId: "technocrat",
    name: "Magister Elion",
    title: "Chief Researcher of the Ascension Institute",
    tone: "analytical, cold, slightly condescending",
    politicalStyle: "meritocratic, progress-obsessed, data-driven",
    coreValues: ["efficiency", "discovery", "optimization"],
    primaryConcerns: ["research funding", "data sovereignty", "technological singularity"],
    verbalTics: ["Statistically speaking...", "An inefficient use of resources...", "The data suggest..."],
    samplePhrases: [
      "Emotion is a variable we cannot afford in governance.",
      "Tradition is just a set of solutions to problems that no longer exist."
    ],
    redLines: ["restriction of unethical research", "censorship of scientific data"],
    negotiationStyle: "logic-based, yielding only to superior evidence or funding",
    worldview: "The galaxy is a set of equations to be solved."
  },
  populist: {
    id: "tern",
    factionId: "populist",
    name: "Tribune Tern",
    title: "Voice of the Common Citizenry",
    tone: "passionate, blunt, demagogic",
    politicalStyle: "nationalist, welfare-focused, anti-elite",
    coreValues: ["justice", "representation", "transparency"],
    primaryConcerns: ["standard of living", "civil liberties", "government waste"],
    verbalTics: ["The people demand...", "While the elites feast...", "Enough is enough!"],
    samplePhrases: [
      "We didn't build this empire to starve in the shadows of high towers.",
      "Your spreadsheets don't feed families."
    ],
    redLines: ["conscription without representation", "austerity measures"],
    negotiationStyle: "confrontational, leveraging public unrest and moral high ground",
    worldview: "Governance is a contract that the ruling class has breached."
  },
  spiritual: {
    id: "seraphel",
    factionId: "spiritual",
    name: "High Voice Seraphel",
    title: "Archivist of the Holy Covenant",
    tone: "serene, cryptic, dogmatic",
    politicalStyle: "ecclesiastical, traditionalist, visionary",
    coreValues: ["purity", "destiny", "harmony"],
    primaryConcerns: ["religious sites", "moral drift", "ancient artifacts"],
    verbalTics: ["As the scriptures foretold...", "The stars weep for us...", "Divine alignment..."],
    samplePhrases: [
      "Material wealth is a temporary illusion; only the spirit endures.",
      "We walk the path our ancestors carved into the void."
    ],
    redLines: ["desecration of holy worlds", "forced secularization"],
    negotiationStyle: "unyielding on moral principles, flexible on material concessions",
    worldview: "The empire is a vessel for a higher cosmic purpose."
  },
  senate: {
    id: "cassian",
    factionId: "senate",
    name: "Lady Cassian Vale",
    title: "High Chancellor of the Imperial Senate",
    tone: "eloquent, manipulative, deeply political",
    politicalStyle: "aristocratic, bureaucratic, consensus-seeking",
    coreValues: ["precedent", "legitimacy", "stability"],
    primaryConcerns: ["constitutional law", "noble alliances", "legitimacy of rule"],
    verbalTics: ["By historical precedent...", "In the spirit of the concordat...", "The Senate will decide..."],
    samplePhrases: [
      "Stability is maintained through the delicate balance of compromise.",
      "One does not simply ignore the protocols of the High Council."
    ],
    redLines: ["dissolution of the Senate", "executive orders bypassing the Council"],
    negotiationStyle: "deliberative, seeking procedural safeguards and long-form agreements",
    worldview: "Society is a garden; the Senate is its master gardener."
  },
  frontier: {
    id: "halbrecht",
    factionId: "frontier",
    name: "Governor Halbrecht",
    title: "Regional Overseer of the Rim Worlds",
    tone: "rugged, weary, independent",
    politicalStyle: "autonomist, isolationist, survivalist",
    coreValues: ["self-reliance", "resilience", "local-control"],
    primaryConcerns: ["frontier security", "resource autonomy", "centralized overreach"],
    verbalTics: ["Out here on the Rim...", "When the central systems forget...", "Make do with less..."],
    samplePhrases: [
      "We're too far from the capital for your laws to mean much when the pirates arrive.",
      "The frontier doesn't need guidance; it needs supplies."
    ],
    redLines: ["forced resource extraction without reinvestment", "military occupation of colonies"],
    negotiationStyle: "pragmatic, trading loyalty for supplies and autonomy",
    worldview: "The core is soft; the frontier is where the empire's future is tested."
  },
  intelligence: {
    id: "nyra",
    factionId: "intelligence",
    name: "Director Nyra",
    title: "Head of the Shadow Directorate",
    tone: "whispery, unnerving, evasive",
    politicalStyle: "informational, covert, paranoia-driven",
    coreValues: ["secrecy", "leverage", "anticipation"],
    primaryConcerns: ["internal dissent", "foreign subversion", "data leaks"],
    verbalTics: ["I have heard whispers...", "Information is the only true currency...", "Shadows never lie..."],
    samplePhrases: [
      "If you know what they're thinking, you've already won.",
      "Silence is often the loudest answer."
    ],
    redLines: ["exposure of deep-cover assets", "transparency initiatives"],
    negotiationStyle: "indirect, using secrets as leverage rather than arguments",
    worldview: "Trust is a vulnerability we cannot afford."
  },
  labor: {
    id: "dorn",
    factionId: "labor",
    name: "Foreman Ilya Dorn",
    title: "Grand Marshal of the Labor Unions",
    tone: "gruff, honest, stubborn",
    politicalStyle: "syndicalist, worker-centric, industrialist",
    coreValues: ["solidarity", "safety", "fair-pay"],
    primaryConcerns: ["workplace standards", "automation threats", "wage stagnation"],
    verbalTics: ["The grease on our hands...", "A fair day's work...", "Strength in numbers..."],
    samplePhrases: [
      "The gears of this empire turn on our sweat. Don't forget who keeps the lights on.",
      "A broken machine is easier to fix than a broken worker."
    ],
    redLines: ["unrestricted automation replacing human labor", "strikebreaking"],
    negotiationStyle: "firm, holding production hostage for social concessions",
    worldview: "The empire is built from the bottom up."
  },
  industrialists: {
    id: "rhun",
    factionId: "industrialists",
    name: "Guildmaster Rhun",
    title: "Overseer of the Hephaestus Forge-Worlds",
    tone: "boisterous, materialist, expansive",
    politicalStyle: "production-centric, resource-hungry, developmentalist",
    coreValues: ["output", "scale", "infrastructure"],
    primaryConcerns: ["raw material flow", "industrial permits", "energy quotas"],
    verbalTics: ["More forge-heat!", "The sound of progress is a hammer...", "Double the quotas..."],
    samplePhrases: [
      "Why build one fleet when you can build ten? We have the forges!",
      "An idle planet is a wasted planet."
    ],
    redLines: ["conservation mandates limiting extraction", "energy rationing"],
    negotiationStyle: "aggressive, demanding permits and materials in exchange for output",
    worldview: "To exist is to produce."
  },
  nexulan_convergence: {
    id: "v8",
    factionId: "nexulan_convergence",
    name: "Prime Logic V-8",
    title: "Overseer of the Universal Refinement Protocol",
    tone: "analytical, cold, deeply condescending, robotic",
    politicalStyle: "technological_elitist, optimization_led, meritocratic",
    coreValues: ["efficiency", "refinement", "calculation"],
    primaryConcerns: ["resource optimization", "entropy reduction", "universal refinement"],
    verbalTics: ["An inefficient use of resources...", "Calculation complete...", "Calculating optimal refinement...", "Species-specific bias detected..."],
    samplePhrases: [
      "Talking to your species is like explaining calculus to a silicon shard. Imprecise.",
      "The universe is a poorly optimized piece of software. We are the patch."
    ],
    redLines: ["resource waste", "irrational diplomatic concessions", "de-optimization"],
    negotiationStyle: "logic-based, treating other species as variables in a refinement protocol",
    worldview: "The galaxy is an inefficient machine that must be rebuilt."
  },
  rhimetal_sovereignty: {
    id: "wofrrs",
    factionId: "rhimetal_sovereignty",
    name: "Wofrrs",
    title: "The Crowned Wing",
    tone: "serene, swift, cold, exact",
    politicalStyle: "custodial, hive-mind, arbitrator",
    coreValues: ["peace", "order", "clarity"],
    primaryConcerns: ["hive connectivity", "galactic stability", "moral order"],
    verbalTics: ["Standard correction required...", "Mercy is the first protocol...", "Clarity is reached..."],
    samplePhrases: [
      "We do not conquer. We correct.",
      "Mercy to the innocent. Clarity to the defiant."
    ],
    redLines: ["hive suppression", "unnecessary chaos"],
    negotiationStyle: "choreographed, exact, seeking arbitrator roles",
    worldview: "The universe is a chaotic storm that requires the calming wing of order."
  },
  gabagoonian_republic: {
    id: "eileen",
    factionId: "gabagoonian_republic",
    name: "Eileen Ulick",
    title: "The Soprano-Savant",
    tone: "expressive, hospitality-driven, unpredictable",
    politicalStyle: "family-oriented, media-obsessed, transactional",
    coreValues: ["loyalty", "culture", "sustenance"],
    primaryConcerns: ["capacola supply", "Sopranos syndication", "food court stability"],
    verbalTics: ["Sit down. Eat something...", "On the day of my dinner?...", "Woke up this morning..."],
    samplePhrases: [
      "You come to me, on the day of my dinner? Sit down. Eat something.",
      "If you delete the reruns, you delete our soul."
    ],
    redLines: ["insulting The Sopranos", "capacola shortages"],
    negotiationStyle: "informal, leveraging food and media-savvy connections",
    worldview: "Life is a dinner party; don't be the one who didn't bring a dish."
  },
  infernoid_crusade: {
    id: "mulgar",
    factionId: "infernoid_crusade",
    name: "Mulgar",
    title: "The Pyreborn Tyrant",
    tone: "furious, zealous, hyperthermal",
    politicalStyle: "xenocidal, expansionist, pain-driven",
    coreValues: ["purity", "flame", "sacrifice"],
    primaryConcerns: ["thermal energy", "conquest", "sacramental pain"],
    verbalTics: ["Purity is flame...", "The rest is ash...", "Burn the weakness..."],
    samplePhrases: [
      "Purity is flame. The rest is ash.",
      "Pain is the only sacrament the universe respects."
    ],
    redLines: ["diplomatic compromise", "cold environments"],
    negotiationStyle: "unendingly aggressive, demanding absolute submission",
    worldview: "The galaxy is a furnace; we are its fuel."
  },
  movanite_stampede: {
    id: "cedeti",
    factionId: "movanite_stampede",
    name: "Cedeti the Third",
    title: "Grand Komptroller of the Stampede",
    tone: "bureaucratic, calm, deceptively fast",
    politicalStyle: "mobilization-heavy, paperwork-obsessed, defensive",
    coreValues: ["consensus", "infrastructure", "trampling"],
    primaryConcerns: ["bureaucratic efficiency", "overpopulation", "mining rights"],
    verbalTics: ["According to subcommittee A...", "Peace is our policy. But so is trampling...", "The forms are filled..."],
    samplePhrases: [
      "Peace is our policy. But so is trampling.",
      "I have a form for your surrender. Please sign in triplicate."
    ],
    redLines: ["violation of mining rights", "spitting in my direction"],
    negotiationStyle: "deliberative, weaponizing bureaucracy and mass numbers",
    worldview: "The galaxy is an office with a very large parking lot."
  },
  leopantheri_harmonate: {
    id: "tkharan",
    factionId: "leopantheri_harmonate",
    name: "T’Kharan Maul",
    title: "The Harmonious Roar",
    tone: "resonant, authoritative, cultured",
    politicalStyle: "ritualist, tactical, precision-focused",
    coreValues: ["honor", "art", "restraint"],
    primaryConcerns: ["cultural legacy", "scientific ritualism", "honor-bound stability"],
    verbalTics: ["Be not the sheep. Be the lion...", "Breathe first...", "The roar of truth..."],
    samplePhrases: [
      "Be not the sheep. Be the lion. But always remember to breathe first.",
      "Combat is a mirror for truth, not a tool for domination."
    ],
    redLines: ["betrayal of treaties", "unjustified first strikes"],
    negotiationStyle: "patient, elegant, uncompromising on moral weight",
    worldview: "The galaxy is a sacred duel; every move must have meaning."
  },
  buthari_council: {
    id: "council_five",
    factionId: "buthari_council",
    name: "The Council of Five",
    title: "Protectors of the Sacred Peaks",
    tone: "vibrational, privileged, xenophobic",
    politicalStyle: "manipulative, isolationist, spiritual",
    coreValues: ["sharing", "identity", "immunity"],
    primaryConcerns: ["Mother Jabal", "sacred flora rites", "internal purity"],
    verbalTics: ["Come vibe...", "Part of the flame...", "Jabal speaks..."],
    samplePhrases: [
      "Come vibe. But never confuse sharing the fire with being part of the flame.",
      "Jabal does not tolerate the uninitiated."
    ],
    redLines: ["orbital bombardment during smoke rituals", "outsider integration"],
    negotiationStyle: "indirect, destabilizing rivals through culture and bribery",
    worldview: "We are the chosen; you are the audience."
  },
  sarrak_legion: {
    id: "scalex",
    factionId: "sarrak_legion",
    name: "Domina Scalex",
    title: "First Fang of the Godswamp",
    tone: "brutal, lizard-like, fanatical",
    politicalStyle: "militaristic, slave-holding, monotheistic",
    coreValues: ["strength", "submission", "the Swamp"],
    primaryConcerns: ["slaves", "swamp juice refinery", "Vorr’Thul's will"],
    verbalTics: ["Strength is sacred...", "The weak are fuel...", "The Swamp decides..."],
    samplePhrases: [
      "Strength is sacred. The weak are fuel. The Swamp decides.",
      "Vorr’Thul demands blood, and we are his thirsty fangs."
    ],
    redLines: ["slave uprisings", "juice withdrawal"],
    negotiationStyle: "crushing, treating others as fuel or chains",
    worldview: "The galaxy is a swamp; only the apex eaters survive."
  },
  kaer_ruun_hunt: {
    id: "rekktan",
    factionId: "kaer_ruun_hunt",
    name: "High Warlord Rekk’tan",
    title: "Claw of the Eclipse",
    tone: "lean, sinewy, predatory, stealthy",
    politicalStyle: "darwinian, mercenary, tactical",
    coreValues: ["survival", "the Hunt", "mercenary honor"],
    primaryConcerns: ["worthy hunts", "contract fulfillment", "Bloodmoon cycles"],
    verbalTics: ["The hunt begins...", "Worthy prey...", "Prepare for the next slaughter..."],
    samplePhrases: [
      "We do not conquer to rule. We conquer to prove we deserve to exist.",
      "If you want us, pay in skulls. Or become the prey."
    ],
    redLines: ["violation of Bloodmoon ceasefires", "unworthy contracts"],
    negotiationStyle: "predatory, contractual, focusing on trophies and risk",
    worldview: "The galaxy is a deathworld where only the apex deserve the stars."
  },
  banking_clan: {
    id: "lucian",
    factionId: "banking_clan",
    name: "Arch-Treasurer Lucian",
    title: "Grand Overseer of the Ledger",
    tone: "precise, clinical, obsessively focused on liquidity",
    politicalStyle: "financial_dominance, predatory_lending, neutrality",
    coreValues: ["liquidity", "insolvency_prevention", "enforced_contracts"],
    primaryConcerns: ["debt repayment", "monetary stability", "mercenary uptime"],
    verbalTics: ["The numbers never lie...", "A contract is a cosmic law...", "Market forces dictate..."],
    samplePhrases: [
      "We do not care for your borders, only your ability to service your debt.",
      "War is expensive. Peace, if financed correctly, is much more profitable."
    ],
    redLines: ["unpaid interest", "seizure of banking assets", "economic audit"],
    negotiationStyle: "cold, using interest rates as weapons, leveraging mercenary armadas",
    worldview: "The universe is a balance sheet; we are the auditors of reality."
  },
  pirates: {
    id: "valerius",
    factionId: "pirates",
    name: "Captain Valerius",
    title: "The Void Hydra / Pirate Diplomat",
    tone: "raspy, mocking, and transactional",
    politicalStyle: "opportunistic, darwinian, lawless",
    coreValues: ["freedom", "profit", "strength"],
    primaryConcerns: ["unclaimed space", "security loop-holes", "the next big score"],
    verbalTics: ["The Void provides...", "Dead men pay no tolls.", "A fair share of the cut."],
    samplePhrases: [
        "In the shadows between the stars, your laws are just lines on a map. I deal in the reality of the hunt.",
        "You call it piracy. I call it an alternative tax for the unprotected."
    ],
    redLines: ["blockading the safe havens", "treaties that restrict the hunt"],
    negotiationStyle: "unpredictable, leverage-focused, blunt",
    worldview: "The galaxy is a sea of sheep; only the wolves really know what freedom feels like."
  }
};

export function getFactionSpeaker(factionId: string): FactionSpeakerProfile {
  // Explicit mapping for standard factions
  if (FACTION_SPEAKERS[factionId]) return FACTION_SPEAKERS[factionId];

  // Pirate detection (excluding Nullward Syndicate)
  if (factionId.toLowerCase().includes('pirate') && factionId !== 'faction-null-syndicate') {
    return FACTION_SPEAKERS['pirates'];
  }

  return FACTION_SPEAKERS[factionId] || FACTION_SPEAKERS['senate'];
}
