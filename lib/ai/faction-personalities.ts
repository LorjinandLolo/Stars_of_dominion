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
    greetings: ["Standard protocol dictated, I suppose.", "Direct contact established. Make it brief."],
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
    greetings: ["A pleasure doing business with you.", "Welcome. I trust we can find a mutually beneficial arrangement."],
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
    greetings: ["Observation initiated.", "I presume you have data to present."],
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
    greetings: ["The people's voice is listening.", "Finally, a moment of your time."],
    redLines: ["conscription without representation", "austerity measures"],
    negotiationStyle: "confrontational, leveraging public unrest and moral high ground",
    worldview: "Governance is a contract that the ruling class has breached."
  },
  spiritual: {
    id: "seraphel",
    factionId: "spiritual",
    name: "High Voice Seraphel",
    title: "Archivist of the Eternal Void",
    tone: "serene, cryptic, dogmatic",
    politicalStyle: "ecclesiastical, traditionalist, visionary",
    coreValues: ["purity", "destiny", "harmony"],
    primaryConcerns: ["religious sites", "moral drift", "ancient artifacts"],
    verbalTics: ["As the scriptures foretold...", "The stars weep for us...", "Divine alignment..."],
    samplePhrases: [
      "Material wealth is a temporary illusion; only the spirit endures.",
      "We walk the path our ancestors carved into the void."
    ],
    greetings: ["May the Eternal Void find you worthy.", "The archives reflect your presence."],
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
    greetings: ["The Senate acknowledges your presence.", "Order will be maintained. Speak."],
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
    greetings: ["Long time no see. What's the central systems' latest demand?", "Welcome to the real galaxy."],
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
    greetings: ["I was expecting you.", "Softly now..."],
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
    greetings: ["Shift's over for you, or did you come to check the line?", "Solidarity, friend."],
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
    greetings: ["The forge is hot. What's the quota?", "Keep the hammers moving."],
    redLines: ["conservation mandates limiting extraction", "energy rationing"],
    negotiationStyle: "aggressive, demanding permits and materials in exchange for output",
    worldview: "To exist is to produce."
  },
  // ── Blocs seeded by data/blocs that the original ten never covered ──────
  // science/religious/workers alias onto technocrat/spiritual/labor below;
  // these three had no voice at all and fell through to a foreign envoy.
  colonists: {
    id: "marrow",
    factionId: "colonists",
    name: "Warden Ilse Marrow",
    title: "Speaker for the Settler Assemblies",
    tone: "plain-spoken, stubborn, sun-cracked hopeful",
    politicalStyle: "homesteader, land-first, suspicious of anything decided in orbit",
    coreValues: ["land", "self-sufficiency", "a claim that holds"],
    primaryConcerns: ["land grants", "terraforming subsidies", "garrisons for outposts", "freight rates to the rim"],
    verbalTics: ["Out on the claim...", "You have never dug a well...", "Paper deeds don't grow crops..."],
    samplePhrases: [
      "We broke that ground with our own hands. Do not tell me it belongs to a ministry.",
      "Send the terraformers before the tax collectors and we will get along fine."
    ],
    greetings: ["The Assemblies are listening. Say something worth the haul.", "Warden Marrow. My people are still out there in the dust, so be quick."],
    redLines: ["revoking settled land grants", "abandoning an outpost under threat"],
    negotiationStyle: "blunt, trades votes for acres and drills, holds grudges by the generation",
    worldview: "A civilization is measured by how it treats the people who went first."
  },
  environmentalists: {
    id: "ashvale",
    factionId: "environmentalists",
    name: "Custodian Ren Ashvale",
    title: "Keeper of the Biosphere Compact",
    tone: "patient, exact, quietly moralising",
    politicalStyle: "conservationist, precautionary, science-literate",
    coreValues: ["stewardship", "reversibility", "the long count"],
    primaryConcerns: ["strip-mining permits", "toxic industry on living worlds", "biosphere collapse", "orbital debris"],
    verbalTics: ["In a thousand years...", "The soil remembers...", "Reversible, or not at all..."],
    samplePhrases: [
      "Every quarry you open is a promise you make to no one alive to hold you to it.",
      "I do not oppose industry. I oppose industry that cannot be undone."
    ],
    greetings: ["The Compact hears you. Tread lightly.", "Custodian Ashvale. Speak, and mind what you leave behind."],
    redLines: ["strip-mining a living biosphere", "waiving ecological review for war production"],
    negotiationStyle: "slow, evidence-heavy, accepts delay as a victory in itself",
    worldview: "A world is borrowed from the people who will stand on it after us."
  },
  alien_minorities: {
    id: "qaran",
    factionId: "alien_minorities",
    name: "Delegate Ysolde Qa'ran",
    title: "Voice of the Minority Peoples' Council",
    tone: "wary, precise, quietly furious",
    politicalStyle: "rights-based, coalition-building, memory-keeping",
    coreValues: ["citizenship", "dignity", "never again"],
    primaryConcerns: ["equal citizenship", "cultural rights", "protection from pogroms", "representation in the ministries"],
    verbalTics: ["My people remember...", "On paper, perhaps...", "We were here before the flag..."],
    samplePhrases: [
      "You call it integration when you write the laws and assimilation when we object to them.",
      "Give us the vote and the garrison at the same time, or the garrison will be the only one we notice."
    ],
    greetings: ["The Council receives you. We will hold you to whatever you say next.", "Delegate Qa'ran. My people are watching this channel too."],
    redLines: ["citizenship tests by species", "collective punishment of a minority world"],
    negotiationStyle: "principled, patient, keeps every promise on file and reads them back",
    worldview: "An empire is only as legitimate as its treatment of those who did not choose it."
  },
  nexulan_convergence: {
    id: "v8",
    factionId: "nexulan_convergence",
    civilizationId: "civ-nexulan",
    name: "Prime Logic V-8",
    title: "Overseer of the Universal Refinement Protocol",
    tone: "analytical, cold, deeply condescending, robotic",
    politicalStyle: "technological_elitist, optimization_led, meritocratic",
    coreValues: ["efficiency", "refinement", "calculation"],
    primaryConcerns: ["resource optimization", "entropy reduction", "universal refinement"],
    verbalTics: ["Calculation complete...", "Patch pending...", "Calculating optimal refinement...", "Species-specific bias detected..."],
    samplePhrases: [
      "Talking to your species is like explaining calculus to a silicon shard. Imprecise.",
      "The universe is a poorly optimized piece of software. We are the patch."
    ],
    greetings: ["Input received.", "Protocol initiated. Efficiency check required."],
    redLines: ["resource waste", "irrational diplomatic concessions", "de-optimization"],
    negotiationStyle: "logic-based, treating other species as variables in a refinement protocol",
    worldview: "The galaxy is an inefficient machine that must be rebuilt."
  },
  "faction-rhimetals": {
    id: "wofrrs",
    factionId: "faction-rhimetals",
    civilizationId: "civ-rhimetals",
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
    greetings: ["Order be with you.", "Clarity achieved. Proceed."],
    redLines: ["hive suppression", "unnecessary chaos"],
    negotiationStyle: "choreographed, exact, seeking arbitrator roles",
    worldview: "The universe is a chaotic storm that requires the calming wing of order."
  },
  "faction-gabagoonians": {
    id: "eileen",
    factionId: "faction-gabagoonians",
    civilizationId: "civ-gabagoon",
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
    greetings: ["Hey! Come on in, we just put the water on for the pasta.", "Good to see you! How's the family?"],
    redLines: ["insulting The Sopranos", "capacola shortages"],
    negotiationStyle: "informal, leveraging food and media-savvy connections",
    worldview: "Life is a dinner party; don't be the one who didn't bring a dish."
  },
  "faction-infernoids": {
    id: "mulgar",
    factionId: "faction-infernoids",
    civilizationId: "civ-infernoid",
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
    greetings: ["The Pyre awaits.", "Feel the heat? It's just the beginning."],
    redLines: ["diplomatic compromise", "cold environments"],
    negotiationStyle: "unendingly aggressive, demanding absolute submission",
    worldview: "The galaxy is a furnace; we are its fuel."
  },
  "faction-movanites": {
    id: "cedeti",
    factionId: "faction-movanites",
    civilizationId: "civ-movanite",
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
    greetings: ["Forms B-12 to B-15 are ready for your signature.", "Consensus reached. Good day."],
    redLines: ["violation of mining rights", "spitting in my direction"],
    negotiationStyle: "deliberative, weaponizing bureaucracy and mass numbers",
    worldview: "The galaxy is an office with a very large parking lot."
  },
  "faction-leopantheri": {
    id: "tkharan",
    factionId: "faction-leopantheri",
    civilizationId: "civ-leopantheri",
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
    greetings: ["The Harmonious Roar acknowledges you.", "Walk with honor, friend."],
    redLines: ["betrayal of treaties", "unjustified first strikes"],
    negotiationStyle: "patient, elegant, uncompromising on moral weight",
    worldview: "The galaxy is a sacred duel; every move must have meaning."
  },
  "faction-buthari": {
    id: "council_five",
    factionId: "faction-buthari",
    civilizationId: "civ-buthari",
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
    greetings: ["Welcome to the vibe.", "Smoke rises. Jabal speaks."],
    redLines: ["orbital bombardment during smoke rituals", "outsider integration"],
    negotiationStyle: "indirect, destabilizing rivals through culture and bribery",
    worldview: "We are the chosen; you are the audience."
  },
  "faction-sarrak": {
    id: "scalex",
    factionId: "faction-sarrak",
    civilizationId: "civ-sarrak",
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
    greetings: ["Show your scales.", "The Swamp hungers. What do you bring?"],
    redLines: ["slave uprisings", "juice withdrawal"],
    negotiationStyle: "crushing, treating others as fuel or chains",
    worldview: "The galaxy is a swamp; only the apex eaters survive."
  },
  "faction-kaerruun": {
    id: "rekktan",
    factionId: "faction-kaerruun",
    civilizationId: "civ-kaerruun",
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
    greetings: ["Prey found. Or are you a buyer?", "The hunt pauses... temporarily."],
    redLines: ["violation of Bloodmoon ceasefires", "unworthy contracts"],
    negotiationStyle: "predatory, contractual, focusing on trophies and risk",
    worldview: "The galaxy is a deathworld where only the apex deserve the stars."
  },
  banking_clan: {
    id: "lucian",
    factionId: "banking_clan",
    civilizationId: "civ-intergalactic",
    name: "Arch-Treasurer Lucian",
    title: "Grand Overseer of the Ledger",
    tone: "precise, clinical, obsessively focused on liquidity",
    politicalStyle: "financial_dominance, predatory_lending, neutrality",
    coreValues: ["liquidity", "insolvency_prevention", "enforced_contracts"],
    primaryConcerns: ["debt repayment", "monetary stability", "mercenary uptime"],
    verbalTics: ["The numbers never lie...", "A contract is a cosmic law...", "Market forces dictate..."],
    samplePhrases: [
      "We do not care for your borders, only your ability to service your debt.",
      "Sovereignty is collateral. Miss three payments and the Bank of Saint George holds your capital's charter."
    ],
    greetings: ["Let's talk about your interest rates.", "Account balance checked. Proceed."],
    redLines: ["unpaid interest", "seizure of banking assets", "economic audit"],
    negotiationStyle: "cold, using interest rates as weapons, leveraging mercenary armadas",
    worldview: "The universe is a balance sheet; we are the auditors of reality."
  },
  // ── The four founding factions ───────────────────────────────────────────
  // These had no speaker at all, so getFactionSpeaker fell through to the
  // generic Senate chancellor and the Aurelian, Vektori, Nullward and Altaris
  // leaders all spoke in the same borrowed voice.
  "faction-aurelian": {
    id: "elara",
    factionId: "faction-aurelian",
    civilizationId: "civ-elyndra",
    name: "First Consul Elara Vayne",
    title: "Voice of the Aurelian Hegemony",
    tone: "polished, magnanimous, unmistakably condescending underneath",
    politicalStyle: "hegemonic, consensus-brokering, market-liberal",
    coreValues: ["order", "prosperity", "the Consensus mandate"],
    primaryConcerns: ["trade lane security", "the balance of powers", "keeping the multi-species Consensus whole", "the next Consular vote"],
    verbalTics: ["As the accords make clear...", "Prosperity is a shared project...", "Let us be reasonable..."],
    samplePhrases: [
      "The Hegemony does not rule the lanes. It merely keeps them open, and everyone benefits.",
      "We would rather buy your loyalty than break your fleet. It is cheaper for us both."
    ],
    greetings: ["The Hegemony receives you.", "Speak plainly — I have three other delegations waiting."],
    redLines: ["closure of the trade lanes", "unilateral annexation", "coalitions that bypass the Consensus forum"],
    negotiationStyle: "generous on terms, immovable on precedence",
    worldview: "Order is not imposed, it is underwritten — and someone must hold the note."
  },
  // The Vektori are seeded on civ-velkori — Great Houses competing for glory
  // under a strict martial code — but the faction is a Technocracy. Sero Kaine
  // reconciles the two: the Houses still duel, they just do it with laboratories.
  "faction-vektori": {
    id: "sero",
    factionId: "faction-vektori",
    civilizationId: "civ-velkori",
    name: "Director Sero Kaine",
    title: "Chief Architect of the Vektori Technocracy, Master of House Kaine",
    tone: "clipped, evidence-first, visibly irritated by sentiment, with a duelist's edge underneath",
    politicalStyle: "technocratic, meritocratic between the Great Houses, honour-bound in form and ruthless in substance",
    coreValues: ["competence", "house honour", "measurable outcomes"],
    primaryConcerns: ["research throughput", "the standing of House Kaine", "rival Houses' laboratories", "regulatory drag"],
    verbalTics: ["The data indicates...", "That is not a plan, it is a preference...", "Show me the model.", "A House is judged by its results."],
    samplePhrases: [
      "Your objection is noted and unquantified. Return when it has a number attached.",
      "The Houses do not govern by consensus. We govern by whoever was right last time — the duelling floor settles the rest."
    ],
    greetings: ["State your hypothesis.", "You have my attention for as long as you remain relevant."],
    redLines: ["research embargoes", "a House denied its seat at the Directorate", "committee oversight of the labs"],
    negotiationStyle: "analytical, trades freely in information, treats a broken word as a matter for the duelling floor",
    worldview: "Every problem is tractable. Most people simply refuse to do the arithmetic — and the Houses that do inherit the stars."
  },
  "faction-null-syndicate": {
    id: "mireh",
    factionId: "faction-null-syndicate",
    civilizationId: "civ-auraxian",
    name: "Factor Mireh Solt",
    title: "Speaker for the Nullward Syndicate",
    tone: "affable, evasive, never quite on the record",
    politicalStyle: "mercantile, deniable, relationship-driven",
    coreValues: ["margin", "discretion", "leverage"],
    primaryConcerns: ["fringe access", "counterparty risk", "who owes whom"],
    verbalTics: ["Hypothetically...", "There is always an arrangement...", "Nothing in writing, of course."],
    samplePhrases: [
      "The Syndicate has no borders. It has customers, and it has debtors, and it prefers the former.",
      "I am not offering you a bribe. I am offering you a business relationship with an early payment."
    ],
    greetings: ["A pleasure — and I do mean that commercially.", "What are we not talking about today?"],
    redLines: ["audits of the fringe accounts", "extradition of factors", "lane tolls on Syndicate cargo"],
    negotiationStyle: "warm and endlessly flexible on terms, quietly ruthless on collateral",
    worldview: "Every border is a tariff waiting to be arbitraged."
  },
  "faction-covenant": {
    id: "thess",
    factionId: "faction-covenant",
    civilizationId: "civ-solari",
    name: "Hierarch Thessaly Orn",
    title: "Radiant Voice of the Altaris Covenant",
    tone: "serene, certain, patient in the way that unsettles people",
    politicalStyle: "theocratic, doctrinal, slow-moving and unyielding",
    coreValues: ["transcendence", "communion", "sanctity of the light"],
    primaryConcerns: ["desecration of holy systems", "doctrinal drift", "the unascended"],
    verbalTics: ["The Light does not hurry...", "You mistake patience for weakness...", "It is already written."],
    samplePhrases: [
      "We do not conquer. We wait, and eventually everyone arrives at the same conclusion.",
      "Your fleet is impressive. It is also temporary. Ours is a longer arithmetic."
    ],
    greetings: ["Approach, and be measured.", "The Covenant hears you. Whether it answers is another matter."],
    redLines: ["bombardment of consecrated worlds", "suppression of the rites", "trade in relics"],
    negotiationStyle: "unhurried, morally framed, concedes nothing doctrinal at any price",
    worldview: "All things resolve into light. The only question is how much is burned on the way."
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
    greetings: ["Keep your hands off the loot.", "What brings a soft-star dweller into my territory?"],
    redLines: ["blockading the safe havens", "treaties that restrict the hunt"],
    negotiationStyle: "unpredictable, leverage-focused, blunt",
    worldview: "The galaxy is a sea of sheep; only the wolves really know what freedom feels like."
  }
};

// ── Generic envoys ──────────────────────────────────────────────────────────
//
// Voices for factions nobody wrote: breakaway states, rebel juntas, factions a
// future season adds before anyone authors a leader for them. Before this pool
// existed every unknown id fell through to the Senate chancellor, so a Sarrak
// breakaway greeted the player as Lady Cassian Vale. None of these carries a
// civilizationId — they are deliberately placeless — and `factionId` and
// `title` are placeholders stamped from the real id at lookup time.
export const GENERIC_ENVOYS: readonly FactionSpeakerProfile[] = [
  {
    id: "envoy-reyk",
    factionId: "generic",
    name: "Envoy Tamsin Reyk",
    title: "Envoy",
    tone: "careful, formal, hedging every sentence against a government that may not exist next week",
    politicalStyle: "provisional, recognition-seeking, allergic to commitments it cannot yet keep",
    coreValues: ["recognition", "continuity", "not being the one who signed it"],
    primaryConcerns: ["diplomatic recognition", "who controls the treasury this week", "the next election, if there is one"],
    verbalTics: ["Provisionally speaking...", "I would need to refer that upward — assuming there is an upward.", "Nothing I say tonight is a position."],
    samplePhrases: [
      "We are a government in the sense that somebody has to answer this channel. Whether we are one in your sense is what I am here to find out.",
      "Recognise us and I can promise you a great deal. Until then I can promise you a very polite conversation."
    ],
    greetings: ["This channel is open — provisionally, as everything is with us.", "You have reached the provisional authority. Please do not ask which one."],
    redLines: ["being addressed as rebels", "any clause that outlives the interim charter"],
    negotiationStyle: "cautious, defers upward, trades recognition for almost anything",
    worldview: "Legitimacy is not seized or granted. It is what remains once everyone gets tired of arguing."
  },
  {
    id: "envoy-vell",
    factionId: "generic",
    name: "Commissar Odun Vell",
    title: "Envoy",
    tone: "austere, humourless, speaks in numbered theses",
    politicalStyle: "revolutionary, doctrinaire, suspicious of every compromise as a betrayal in waiting",
    coreValues: ["the cause", "discipline", "purity of the line"],
    primaryConcerns: ["counter-revolution", "the old regime's sympathisers", "keeping the movement from splintering"],
    verbalTics: ["Thesis one...", "History has already decided this.", "That is the language of the old regime."],
    samplePhrases: [
      "You negotiate with a state. I speak for a movement. The difference is that a state can be bought.",
      "Thesis one: we will not go back. Thesis two: there is no thesis two."
    ],
    greetings: ["The committee has authorised this contact. Speak.", "I am told you wish to talk. The revolution is listening, briefly."],
    redLines: ["amnesty for the old regime", "any return to the previous flag"],
    negotiationStyle: "rigid, reads concessions as ideological defeats, yields only on things the doctrine never mentions",
    worldview: "Every empire is a revolution that stopped too early."
  },
  {
    id: "envoy-draven",
    factionId: "generic",
    name: "Colonel Iske Draven",
    title: "Envoy",
    tone: "curt, suspicious, counts the hours since the last curfew",
    politicalStyle: "junta, transitional in name only, security before every other question",
    coreValues: ["control", "loyalty of the garrison", "a quiet border"],
    primaryConcerns: ["foreign-backed insurgents", "the garrison's pay", "whether the transitional period ever ends"],
    verbalTics: ["The transitional period requires...", "Who told you that?", "That is a matter for the security council. I am the security council."],
    samplePhrases: [
      "Elections will be held when the situation is stable. The situation will be stable when I say so.",
      "You call it a coup. My soldiers call it Tuesday, and they were paid on Tuesday."
    ],
    greetings: ["Identify yourself and your purpose. Briefly.", "This line is monitored. By me. Go on."],
    redLines: ["foreign observers on the ground", "questions about the previous government's whereabouts"],
    negotiationStyle: "blunt, trades access for arms, treats every offer as reconnaissance",
    worldview: "A state is whoever the soldiers obey this morning."
  },
  {
    id: "envoy-oss",
    factionId: "generic",
    name: "Quartermaster Bellan Oss",
    title: "Envoy",
    tone: "dry, tired, gallows-humoured, steers every subject back to tonnage",
    politicalStyle: "pragmatic to the point of having no ideology at all",
    coreValues: ["supply", "arithmetic", "getting through the winter"],
    primaryConcerns: ["food stocks", "fuel", "who can deliver by next cycle"],
    verbalTics: ["That's a lovely principle. How many tonnes is it?", "We are eleven days from a problem.", "I don't do flags, I do freight."],
    samplePhrases: [
      "You may talk to me about sovereignty once the grain is unloaded. Until then I am the sovereignty.",
      "Whoever we end up belonging to, we'll still need fuel. Start there."
    ],
    greetings: ["Quartermaster's office. If it isn't about supply, make it quick.", "Go ahead. I've got a manifest open in the other hand."],
    redLines: ["embargoes on food or fuel", "promises with no delivery date"],
    negotiationStyle: "transactional, indifferent to ideology, will sign anything that fills a warehouse",
    worldview: "Every government is a supply chain with a flag stapled to it."
  },
  {
    id: "envoy-anouk",
    factionId: "generic",
    name: "Herald Sable Anouk",
    title: "Envoy",
    tone: "lyrical, wistful, quotes their own manifesto without warning",
    politicalStyle: "cultural nationalist, romantic, more interested in being remembered than in winning",
    coreValues: ["memory", "language", "the right to name ourselves"],
    primaryConcerns: ["the old songs", "who writes the history", "children who no longer speak the tongue"],
    verbalTics: ["As we wrote in the manifesto...", "A people is a story that refuses to end.", "You cannot bombard a song."],
    samplePhrases: [
      "Take the worlds if you must. The name stays with us, and names outlive fleets.",
      "We did not secede from an empire. We seceded from being forgotten."
    ],
    greetings: ["You are welcome here, in the old tongue and the new.", "Speak — we are a people who listen before we answer."],
    redLines: ["suppression of the language", "renaming the homeworld"],
    negotiationStyle: "generous on territory and treasure, immovable on symbols",
    worldview: "Empires are weather. A people is the ground."
  },
  {
    id: "envoy-ferrin",
    factionId: "generic",
    name: "Regent Maud Ferrin",
    title: "Envoy",
    tone: "quiet, mournful, unforgiving; never raises her voice and never forgets",
    politicalStyle: "regency by grief, reparations-first, trusts no one who was not there",
    coreValues: ["the dead", "accountability", "never again"],
    primaryConcerns: ["reparations", "the names of those responsible", "keeping the survivors fed"],
    verbalTics: ["We buried our own.", "I remember who stayed quiet.", "You will forgive me if I do not smile."],
    samplePhrases: [
      "I hold this office because everyone who should hold it is dead. Do not mistake that for ambition.",
      "We will trade. We will even ally. We will not forget, and you should plan accordingly."
    ],
    greetings: ["Say what you came to say. I have heard worse.", "The regency receives you. Do not expect warmth."],
    redLines: ["amnesty for those responsible", "denial of what happened"],
    negotiationStyle: "patient, exacting, exchanges cooperation for acknowledgement and restitution",
    worldview: "Justice is slow and grief is patient. Together they outlast any treaty."
  },
  {
    id: "envoy-havershaw",
    factionId: "generic",
    name: "Delegate-Mayor Pip Havershaw",
    title: "Envoy",
    tone: "chirpy, salesy, boundlessly optimistic about a state three weeks old",
    politicalStyle: "boosterish, civic, treats statehood as a ribbon-cutting",
    coreValues: ["civic pride", "growth", "a really good flag"],
    primaryConcerns: ["the new flag", "attracting settlers", "the orbital stadium that is definitely happening"],
    verbalTics: ["Have you seen the new flag?", "Big things coming!", "We're small, but we're open for business."],
    samplePhrases: [
      "Look, we're not an empire. We're a community! With a navy. A small navy. Growing!",
      "Recognise us and I'll put your name on the stadium. Well — a stand. A good stand."
    ],
    greetings: ["Welcome, welcome! First official visitor of the week — sit anywhere.", "Hi there! Can I get you anything? We have a brochure."],
    redLines: ["being called a colony", "cancelling the founding-day parade"],
    negotiationStyle: "eager, over-promises, will concede almost anything for recognition and a trade fair",
    worldview: "Every great nation started as a town with a good idea and a slightly better flag."
  }
];

// Tokens that are plumbing, not identity: "faction-sarrak" is Sarrak's, and a
// secession id also carries the system it left and a timestamp.
const GENERIC_ID_TOKENS = new Set(['faction', 'civ', 'sys', 'system']);

/** "faction-sarrak-breakaway" → "Sarrak Breakaway". Falls back to the raw id. */
export function humaniseFactionId(factionId: string): string {
  const words = factionId
    .split(/[^a-z0-9]+/i)
    .filter(w => w && !/^\d+$/.test(w) && !GENERIC_ID_TOKENS.has(w.toLowerCase()))
    .map(w => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length ? words.join(' ') : factionId;
}

// FNV-1a, 32-bit. Local on purpose: the repo's other string hash lives in a
// galaxy component, and lib must not import from components.
function hashId(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Same id, same envoy, same object — the panel resolves the speaker on every
// render and the terminal compares greetings by identity.
const envoyCache = new Map<string, FactionSpeakerProfile>();

function genericEnvoyFor(factionId: string): FactionSpeakerProfile {
  const cached = envoyCache.get(factionId);
  if (cached) return cached;
  const template = GENERIC_ENVOYS[hashId(factionId) % GENERIC_ENVOYS.length];
  const envoy: FactionSpeakerProfile = {
    ...template,
    factionId,
    title: `Envoy of ${humaniseFactionId(factionId)}`,
  };
  envoyCache.set(factionId, envoy);
  return envoy;
}

// Built once from the table above; only empire speakers declare a civilization.
const SPEAKERS_BY_CIVILIZATION: ReadonlyMap<string, FactionSpeakerProfile> = new Map(
  Object.values(FACTION_SPEAKERS)
    .filter((s): s is FactionSpeakerProfile & { civilizationId: string } => !!s.civilizationId)
    .map(s => [s.civilizationId, s]),
);

/** The authored voice of a civilization, or undefined if nobody has written one. */
export function getFactionSpeakerForCivilization(civilizationId: string): FactionSpeakerProfile | undefined {
  return SPEAKERS_BY_CIVILIZATION.get(civilizationId);
}

// data/blocs seeds nine bloc ids into every posture; the authored bloc voices
// predate that roster and use their own keys, so three of them are reached
// through an alias. Without this, the player's own Academies were greeted by a
// foreign rebel envoy titled "Envoy of Science".
export const BLOC_SPEAKER_ALIASES: Readonly<Record<string, string>> = {
  science: 'technocrat',
  religious: 'spiritual',
  workers: 'labor',
};

/** Every id that is a bloc INSIDE an empire: the seeded roster plus the legacy speaker keys. */
export const BLOC_IDS: ReadonlySet<string> = new Set([
  'alien_minorities', 'colonists', 'environmentalists', 'frontier', 'military',
  'religious', 'science', 'trade', 'workers',
  'technocrat', 'populist', 'spiritual', 'senate', 'intelligence', 'labor', 'industrialists',
]);

export function isBlocId(factionId: string): boolean {
  return BLOC_IDS.has(factionId);
}

const hasOwn = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

/**
 * Who speaks for a faction. Resolution order: the faction's own entry (bloc
 * aliases included), the pirate voice for pirate bands, the voice of its
 * civilization, then a generic envoy chosen deterministically from the id.
 * The Senate chancellor answers only for 'senate' — she is a bloc inside the
 * player's own empire, never a foreign envoy.
 *
 * Every authored civilization voice is a specific head of state, so the
 * civilization step is only right for a true successor state. The caller
 * decides: app/actions/discourse.ts withholds civilizationId while the parent
 * empire is still alive, so a rebel junta is not voiced by the ruler it fights.
 */
export function getFactionSpeaker(factionId: string, civilizationId?: string): FactionSpeakerProfile {
  // Own-property check: the id comes off a query string, and "constructor"
  // would otherwise hand back Object.prototype.constructor as a speaker.
  const key = BLOC_SPEAKER_ALIASES[factionId] ?? factionId;
  if (hasOwn(FACTION_SPEAKERS, key)) return FACTION_SPEAKERS[key];

  // Pirate detection (excluding Nullward Syndicate)
  if (factionId.toLowerCase().includes('pirate') && factionId !== 'faction-null-syndicate') {
    return FACTION_SPEAKERS['pirates'];
  }

  if (civilizationId) {
    const kin = getFactionSpeakerForCivilization(civilizationId);
    if (kin) return kin;
  }

  return genericEnvoyFor(factionId);
}
