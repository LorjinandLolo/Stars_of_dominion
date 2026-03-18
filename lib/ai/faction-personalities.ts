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
  }
};

export function getFactionSpeaker(factionId: string): FactionSpeakerProfile {
  return FACTION_SPEAKERS[factionId] || FACTION_SPEAKERS['senate'];
}
