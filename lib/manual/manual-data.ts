// lib/manual/manual-data.ts
// Stars of Dominion — the player's guidebook (GUIDE on the command dock).
//
// Rewritten 2026-10-15 against the code: every rule below was checked in the
// source it describes, and the chapters run in the order a player meets
// things. The previous edition described systems that never existed (an
// "Economic Hegemony" victory, an administrative burden per planet) and an
// old ground war. When a rule changes, change it here too; the panel tips
// (lib/tutorial/panel-tips.ts) link into these chapters by id.

import type { ManualSection } from './types';

export const MANUAL_DATA: ManualSection[] = [
    {
        id: 'start',
        title: 'Getting Started',
        icon: 'Rocket',
        introduction: 'You lead one empire in a galaxy that keeps running whether you are logged in or not. You start with a single world. Everything else you win, build, or talk your way into.',
        subsections: [
            {
                id: 'first-day',
                title: 'Your first day',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'A short tour shows the map, the command dock along the bottom, and the daily brief. The ? button in the top bar replays it.',
                            'The goal card (bottom left of the map) gives you one thing to do at a time: commission warships, choose your first research, survey three systems, settle a second world, raise a Spaceyard in orbit, and reach out to a neighbour. Each goal says how long it takes and has a button that opens the right screen. While its work is under way the card counts it down and suggests what to do meanwhile.',
                            'After the first week come the next steps: set a policy, raise ground troops, found an outpost, and hold three star systems.',
                            'Finishing goals unlocks more of the command dock. Until a system is unlocked your advisors run it for you. "Show everything now" on the lock button unlocks it all at once.',
                            'The first time you open a big screen, a short tip explains what it is for.',
                        ],
                    },
                ],
            },
            {
                id: 'time',
                title: 'Time and cycles',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'The galaxy runs on a clock fifteen times faster than real time: one real day is fifteen days in the galaxy. Every timer in the game is shown in real time.',
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Every 24 real minutes the galaxy resolves a cycle: taxes are collected, research advances, governments, ministers and governors take their turn, and the AI empires act.',
                            'Orders you give (build, move, recruit, appoint) are picked up within seconds.',
                            'Builds take real time: basic buildings tens of minutes, tier 4 buildings several hours. Ships take longer the bigger the hull: about 10 minutes for a corvette and three hours for a battleship.',
                            'A ground battle moves in cycles of 5 real minutes, so a hard-fought world takes hours.',
                        ],
                    },
                ],
            },
            {
                id: 'brief',
                title: 'The daily brief and notifications',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'BRIEF in the top bar opens what happened while you were away, what is waiting on your answer, and one suggested next move. Anything that needs you stays open for at least a full day. The bell holds notifications; an order the server refused says why there, and on the order\'s own chip.',
                    },
                ],
            },
            {
                id: 'advisors',
                title: 'Advisors',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Nine systems can be left to advisors: the Cabinet (debates, defiance, a corrupt minister), the Board liaison (charter company demands), the Press office, Patrol command (pirates), the Survey office (idle fleets keep charting nearby systems), the Research council (starts the next project when one finishes), the Admiralty (fights your battles defensively), the Foreign Office (accepts a peace the court would take) and the Works (fills an empty build queue). Advisors act cautiously, never ambitiously: a war, a peace, a battle group is only ever proposed, in the daily brief, with Approve, Decline and Always. Take a system back under Empire → Government → Advisors and every decision there is yours again.',
                    },
                    {
                        type: 'strategy_tip',
                        title: 'The research council never closes a door',
                        content: 'The council never starts a fork option (see Research), and any project you choose replaces the one it started.',
                    },
                ],
            },
        ],
    },
    {
        id: 'economy',
        title: 'Economy',
        icon: 'Coins',
        introduction: 'Your worlds produce; the state takes a share. The treasury pays for buildings, ships, colonies and armies.',
        subsections: [
            {
                id: 'income',
                title: 'Where money comes from',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Each cycle the state skims a small share of what your worlds extract. Half of it arrives as goods (metals, chemicals, food, energy, rares) in your reserves; the other half is sold at galactic prices and arrives as credits.',
                            'A small share of factory output becomes war goods: Ammo and Materiel.',
                            'The Economy panel shows last cycle\'s income and which worlds paid it. The small numbers under each resource in the top bar are last cycle\'s income too.',
                            'Production focus (Economy panel, 5 political capital to change) makes every world produce 25% more of one resource and 10% less of everything else.',
                            'The market (Economy → Buy & sell) trades against your treasury at galactic prices.',
                        ],
                    },
                ],
            },
            {
                id: 'resources',
                title: 'Resources',
                blocks: [
                    {
                        type: 'table',
                        content: [
                            { resource: 'Credits', use: 'Almost everything: buildings, ships, colonies (20,000 each), market buys.' },
                            { resource: 'Metals', use: 'Buildings, hulls and orbital structures.' },
                            { resource: 'Chemicals', use: 'Buildings and advanced structures.' },
                            { resource: 'Food', use: 'Feeds your people; colonies cost 1,000.' },
                            { resource: 'Energy', use: 'Powers worlds. A world short of power or food loses happiness.' },
                            { resource: 'Rares', use: 'High-end buildings and components.' },
                            { resource: 'Ammo', use: 'Spent by every attack, bombardment and invasion.' },
                            { resource: 'Materiel', use: 'Every ship and army costs some: a tenth of its metals.' },
                        ],
                    },
                ],
            },
            {
                id: 'world-economy',
                title: 'A world\'s economy',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Storage: every world has warehouse space. Goods made past capacity are wasted; the Economy panel warns when a world\'s storage is full.',
                            'Haulage: population, buildings and the build queue need haulage. A world short of it is bottlenecked and its output suffers (Logistics tab of the world).',
                            'Blockade: hostile fleets holding a world\'s approaches cut it off; its stores run down.',
                            'Happiness: one number per world. Steady goods lift it, shortages of food or power drag it down, and governors and stability move it too. Unhappy worlds drift away from you (see Government).',
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: 'worlds',
        title: 'Worlds and Building',
        icon: 'Globe',
        introduction: 'Every world is a board of 64 districts with its own terrain, and everything you build stands on one of them.',
        subsections: [
            {
                id: 'surface',
                title: 'The surface',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'SURFACE on a world shows its districts. Terrain follows a climate: seas in the lowlands, mountain chains along the ridges, ice at the poles, jungle where it is hot and wet, desert where it is hot and dry. A world\'s type (continental, arid, oceanic, frozen, volcanic, toxic, garden, mountain, swamp, jungle, city-world) decides how much of each terrain it has. Terrain matters for building and for ground war: mountains are passes and walls, open ground is where armies move.',
                    },
                ],
            },
            {
                id: 'building',
                title: 'Building',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Open a world you own (BUILD on its card) for Planetary Construction.',
                            'A world works two building sites at a time; each Builder Outpost adds one, up to five more. Orders beyond that wait in the queue.',
                            'Buildings come in tiers. Higher tiers take much longer: from tens of minutes for tier 1 to several hours for tier 4. Upgrades replace the building they grow from.',
                            'A card names what you are short of instead of just greying out.',
                            'Infrastructure (its own tab) is five networks under the buildings: transit, power grid, communications, water and freight. They raise what the world can support.',
                            'Orbital (its own tab) holds what you build in orbit. A Space Station comes first; everything else docks to it. A Spaceyard is the first orbital shipyard.',
                        ],
                    },
                ],
            },
            {
                id: 'specialization',
                title: 'Specialization',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'A world that qualifies can take a role: Mining, Forge, Agricultural, Research, Trade, Fortress, Shipyard or Capital world. Each role needs the right buildings and pays off in its field. The Logistics & Role tab shows which roles a world qualifies for and what it still needs.',
                    },
                ],
            },
        ],
    },
    {
        id: 'expansion',
        title: 'Exploring and Settling',
        icon: 'Telescope',
        introduction: 'The galaxy starts dark. You chart it system by system, and only charted worlds can be settled.',
        subsections: [
            {
                id: 'outposts',
                title: 'Outposts',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'A builder ship spent on an empty surveyed world plants an outpost: three colonists, a landing hub and a 5×5 patch of ground. You run it from its own screen (OUTPOST on the world\'s card) until it is big enough to become a colony. Dead worlds can take one.',
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Every 5 minutes is a shift. Colonists breathe (life support), eat (hydroponics, supply drops) and need power for every module. Short of air or food, people die; miserable, they leave.',
                            'Squares have ground: flat, ore, ice, vents, rock (clear it first), and sometimes ruins. Extractors dig what the ground holds into a warehouse, which ships to your reserves every cycle.',
                            'Things go wrong: storms, meteors, breaches, fever, strikes, riots, raiders. Each crisis gives you two shifts to choose. Say nothing and the crew picks the passive answer; a governor on the world picks the sensible one.',
                            'The charter is the outpost\'s job: settlement, mining, penal colony, proving ground, listening post or fleet depot. Its function runs half again as well.',
                            'Prisoners can be moved to cell blocks (needs a landing dock) and stay ransomable. A test lab pushes your current research; using prisoners as subjects doubles it, and their homeland hears of it.',
                            'Grow: 10 colonists, morale 50, a habitat, life support and hydroponics make a settlement (3,000 Cr) and open the whole grid. 30 colonists, morale 60, a dock and a warehouse make a colony (10,000 Cr): the world gets its full surface for districts and the old modules keep working.',
                            'Or make a settlement a military base (15 colonists, morale 50, a bunker and a dock; 8,000 Cr). It stays an outpost and unlocks barracks (a garrison drilled every shift), drydocks (warships built there), defence batteries and a command post.',
                            'The outpost screen has a How to play walkthrough and an advisor that always names the next thing to do.',
                        ],
                    },
                ],
            },
            {
                id: 'charting',
                title: 'Ping, scan, survey',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Ping: charts an unknown star. A relay ping needs no fleet: it costs 250 credits plus 150 for every jump from your nearest shipyard (or your capital if you have none).',
                            'Scan and survey: need a fleet in the system or one hyperlane away, and cost 500 credits each. A survey reveals the system\'s worlds; the first survey of a system can turn up an anomaly.',
                            'If your scout is destroyed before it finishes, the cost is refunded.',
                            'Your Survey office (an advisor) keeps idle fleets charting nearby systems unless you take it back.',
                        ],
                    },
                ],
            },
            {
                id: 'settling',
                title: 'Settling a world',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'A new colony costs 20,000 credits, 1,000 metals and 1,000 food. The world must be unowned, habitable and in a system you have surveyed (or where your fleet is parked). Use Settle on the world\'s card in the system panel. A colony starts small and grows. A world someone else owns can only be taken by invasion.',
                    },
                ],
            },
            {
                id: 'natives',
                title: 'Native peoples',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'A rare few living worlds are already home to a people who never left them: tree-dwellers, forest giants, river folk, tunnel-dwellers. Their card in the system panel shows who they are and how they feel about you.',
                            'Observe: a ship in the system studies them unseen and earns research, until anyone makes contact.',
                            'Contact: send envoys. Their attitude starts from their temper; gifts raise it. At 50+ they trade with you, at 40+ they let you settle beside them (their patience with a colony wears down: keep giving, or they raid it), at 70+ you can uplift them over about eight hours and they join your empire as a member people with their gift.',
                            'Land troops without their welcome (under 60) and they fight a guerrilla war on their world\'s map: strong in forest and jungle, always fed, no prisoners either way. Beat them and their fate is yours: integrate them (subjects, unrest at first), drive them into reserves (infamy), or, for the harshest civilizations only, put them to forced labour (production, constant unrest and revolts, great infamy).',
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: 'research',
        title: 'Research',
        icon: 'Atom',
        introduction: 'Five technology trees: espionage, military, economy, diplomacy and infrastructure, about forty technologies each, in four tiers.',
        subsections: [
            {
                id: 'slots',
                title: 'Projects and speed',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'You research one project at a time. The Research Hub Integration technology (Infrastructure) opens a second slot.',
                            'A tier I project takes a few hours. The Science minister\'s skill and research charter companies speed it up.',
                            'Research cannot be cancelled once started.',
                            'Some technologies are hidden until your empire\'s own history reveals them.',
                        ],
                    },
                ],
            },
            {
                id: 'forks',
                title: 'Forks of no return',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Every tree splits twice, at tier II and at tier IV, into two or three options. You can only ever have one. The moment you START an option, the others close for the season, and so does every technology that needs them. Fork options carry an amber Fork badge and hang from a dashed amber rail; the panel tells you exactly what a choice closes before you commit.',
                    },
                    {
                        type: 'strategy_tip',
                        title: 'Your advisors never decide a fork',
                        content: 'The research council only ever picks ordinary technologies. Every fork is your call.',
                    },
                ],
            },
        ],
    },
    {
        id: 'government',
        title: 'Government',
        icon: 'Landmark',
        introduction: 'Your people judge you through four numbers: approval, legitimacy, cohesion and the mood of the interest groups. Political capital is what governing costs.',
        subsections: [
            {
                id: 'standing',
                title: 'Approval, legitimacy and interest groups',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Approval is how your people feel about the government right now. It follows the interest groups, public trust (moved by the press) and your policies.',
                            'Legitimacy is your right to rule. Elections and some constitutional policies raise it; decrees and violent successions cost it.',
                            'Nine interest groups (Military Command, Merchant Guilds, Labour Unions, Temple Orders, Academies, Border Worlds and others) each want things. A group held far below what it wants pulls approval down and can turn on you.',
                        ],
                    },
                ],
            },
            {
                id: 'administration',
                title: 'Administration and upkeep',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Your government runs six star systems cleanly, plus three for every Administrative Center you build (one per world; it upgrades a Habitat Block). Government → Empire Cohesion shows where you stand.',
                            'Past that you are overextended: every world loses cohesion, a little for a few systems too many and up to 15 for a sprawling empire. Far worlds below 20 cohesion start demanding to leave.',
                            'Every colony outside your home system costs credits each cycle: more the further it is from the capital, up to three times more while overextended. If the treasury cannot pay, every colony loses stability.',
                            'Outposts still growing count for neither; they pay their own way.',
                        ],
                    },
                ],
            },
            {
                id: 'capital',
                title: 'Political capital',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Political capital (PC) refills every day. It refills faster with high approval, high legitimacy and a skilled head of state, and stops at a ceiling set by how strong the executive is (100 plus half its power). It never converts to or from credits.',
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Policies: each costs PC to enact, and you hold at most three at a time (a bill waiting in the chamber takes a slot too).',
                            'Acts of state: declaring war 30, breaking a treaty 20, sanctions 15, purging a faction 25.',
                            'Diplomacy: an envoy 2, a treaty or trade pact proposal 5 and 3, a tribute demand 8, a gambit 5, lifting sanctions 3. Offering peace is free.',
                            'Economy: changing production focus 5. A refused order gives its capital back.',
                            'People: appointing a minister or governor 5, dismissing a minister 10.',
                            'Answering defiance and secession demands costs PC, sometimes credits as well.',
                        ],
                    },
                ],
            },
            {
                id: 'policies',
                title: 'Policies and the chamber',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Thirteen policies, from Universal Provision to Permanent Martial Law, each pleasing some groups and angering others. Where the chamber is strong (senate power 40 or more), enacting a policy tables a bill instead: parties vote, you can lobby them, and only a passed bill takes effect. A decree bypasses the chamber for one and a half times the capital, at a cost in legitimacy and with the officers watching. Elected governments face an election every 20 galaxy days (about 32 real hours).',
                    },
                ],
            },
            {
                id: 'coups',
                title: 'Coups',
                blocks: [
                    {
                        type: 'warning',
                        title: 'Watch the officer corps',
                        content: 'Coup pressure rises with an unhappy military, low legitimacy, corruption, unrest and a disloyal Defence Minister. The Government page shows it and warns you as it climbs. A coup replaces you.',
                    },
                ],
            },
        ],
    },
    {
        id: 'people',
        title: 'Leaders',
        icon: 'Users',
        introduction: 'Empire → Leadership shows everyone who runs your empire: the head of state, six ministers, a governor on each world, and the bench of candidates.',
        subsections: [
            {
                id: 'characters',
                title: 'Who they are',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Skill tiers: Novice, Capable (35), Seasoned (55), Expert (70), Legendary (85). A head of state is ranked on political skill.',
                            'Career: a fleet veteran, a merchant house, an academic, a career diplomat and so on. A minister whose career fits the seat (a diplomat at Foreign Affairs) counts 10 points of skill higher there.',
                            'Temperament, read from loyalty, ambition and corruption: a Schemer wants your chair, a Loyalist stands by you, a Venal one skims.',
                            'Growth: ministers and governors get better while they hold a post, about one tier a real week, up to a potential each has. Some are at their peak; a few can become Legendary.',
                        ],
                    },
                ],
            },
            {
                id: 'posts',
                title: 'Ministers and governors',
                blocks: [
                    {
                        type: 'table',
                        content: [
                            { seat: 'Defence', drives: 'Military upkeep (and coup risk when disloyal)' },
                            { seat: 'Economy', drives: 'Production and tax income' },
                            { seat: 'Science', drives: 'Research speed' },
                            { seat: 'Intelligence', drives: 'Your spy service, and keeping the other ministers honest' },
                            { seat: 'Interior', drives: 'Approval' },
                            { seat: 'Foreign Affairs', drives: 'Legitimacy' },
                        ],
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Loyalty follows how well your government is doing; the ambitious sour fastest. A minister whose loyalty runs out may resign, costing legitimacy.',
                            'Corruption creeps up unless a capable Intelligence minister is watching.',
                            'A governor steadies their world when competent and honest, and wears it down when not. A disloyal, ambitious governor lets unrest grow and can openly defy you.',
                            'Replace anyone from the bench (5 PC); dismissing a minister costs 10 PC and their loyalty.',
                        ],
                    },
                    {
                        type: 'paragraph',
                        content: 'The head of state ages, wears down and eventually dies, retires or is overthrown. Succession costs legitimacy, more when it is violent, and halves your political capital.',
                    },
                ],
            },
        ],
    },
    {
        id: 'fleets',
        title: 'Fleets and Space War',
        icon: 'Rocket',
        introduction: 'Military → Forces lists every fleet and army you have, where it is and what it is doing. Locate takes the camera there with it selected.',
        subsections: [
            {
                id: 'shipyards',
                title: 'Building ships',
                blocks: [
                    {
                        type: 'table',
                        content: [
                            { hull: 'Corvette', yard: 'Any shipyard', time: 'about 10 minutes' },
                            { hull: 'Destroyer', yard: 'Any shipyard', time: 'about 25 minutes' },
                            { hull: 'Cruiser', yard: 'Fleet Drydock (ground) or Advanced Spaceyard (orbit)', time: 'about 1 hour' },
                            { hull: 'Battleship', yard: 'Capital Spaceyard (orbit)', time: 'about 3 hours' },
                        ],
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Every capital starts with an Orbital Shipyard on the ground. Ships cost credits, metals and materiel.',
                            'Commission ships from a world with a shipyard: its Shipyard tab in Planetary Construction, or UNITS on the world\'s card.',
                            'The Ship Designer (Military) builds your own patterns: a hull plus weapons, utility modules and a reactor core. Modules add power and draw energy; a design may overdraw its reactor by up to 25%, losing combat power for every percent over. Better modules come from research.',
                            'A design that ships are using cannot be changed (it can be renamed). To upgrade ships already built, save a new design and refit them at a yard: you pay only for what is added, and they fight with the old fit until the refit is done.',
                        ],
                    },
                ],
            },
            {
                id: 'civilian-ships',
                title: 'Civilian ships',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Four unarmed ships, laid down at any shipyard from the Shipyard tab. Each one flies in a fleet of its own: civilian ships never join a battle and cannot be merged with warships. An enemy at war that finds one in a system without your warships destroys it.',
                    },
                    {
                        type: 'table',
                        content: [
                            { ship: 'Exploration Ship', cost: '300 Cr, 100 Met', time: '2 minutes', use: 'Scans and surveys in half the time, from up to two jumps away. Fast.' },
                            { ship: 'Freighter', cost: '1,500 Cr, 600 Met', time: '6 minutes', use: 'Parked at your world: +5% of its taxes (three count). On a trade route between two of your worlds: carries goods each cycle, 0.5 Cr per unit delivered. Parked at a trade-pact partner\'s world: 250 Cr a cycle for you, 125 for them.' },
                            { ship: 'Spy Ship', cost: '2,500 Cr, 400 Met', time: '10 minutes', use: 'Shows every fleet in its system and one jump around. Your spy network there grows 50% faster and operations there are harder to trace. In another empire\'s space it may be caught (about 4% a cycle).' },
                            { ship: 'Builder Ship', cost: '2,000 Cr, 1,200 Met', time: '8 minutes', use: 'Parked at your world: one more building site (two count) and orbital work 25% faster. Or spend it on an empty surveyed world for an outpost (2,000 Cr), even a dead rock no colony could take: see Exploring and Settling → Outposts.' },
                        ],
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Set a trade route from the freighter\'s card in Military → Forces.',
                            'Plant an outpost from the system panel: with a builder ship parked in a surveyed system, each empty world shows an Outpost button.',
                        ],
                    },
                ],
            },
            {
                id: 'moving',
                title: 'Moving fleets',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Select a fleet (Forces → Locate, or the Fleet Command list on the map), then click a system: JUMP TO SYSTEM, or JUMP & ORBIT on a world to take orbit on arrival.',
                            'Fleets travel along hyperlanes; the slowest hull aboard sets the pace. Thrusters and Afterburners modules make a design faster.',
                            'A fleet under way can be turned back. Two fleets parked in the same system can be merged (drag one onto the other in Fleet Command); a parked fleet can be split.',
                            'In a system with an asteroid belt, a parked fleet can lurk in the belt: hidden from anyone who has not surveyed the system and kept a fleet there, and it ambushes enemies passing through.',
                        ],
                    },
                ],
            },
            {
                id: 'battle',
                title: 'Space battles',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Fleets of two empires at war in the same system fight. The later arrival attacks; a side with armed worlds or stations in the system defends, and those fight with it. A battle runs six rounds; power, veterancy, stance and luck decide it, and it ends early if one side is destroyed or routed. The War Room shows every battle while it lasts.',
                    },
                    {
                        type: 'table',
                        content: [
                            { stance: 'Blitz', note: 'Beats Shock and Feint; loses to Entrench and Withdraw.' },
                            { stance: 'Shock', note: 'Beats Entrench and Sabotage; loses to Blitz and Feint. The attacker\'s default.' },
                            { stance: 'Entrench', note: 'Beats Blitz and Feint; loses to Shock and Sabotage. The defender\'s default.' },
                            { stance: 'Feint', note: 'Beats Shock and Sabotage; loses to Blitz and Entrench.' },
                            { stance: 'Sabotage', note: 'Beats Entrench and Blitz; loses to Shock and Withdraw.' },
                            { stance: 'Withdraw', note: 'Your fleets break off and head home.' },
                        ],
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Predict the enemy\'s stance correctly for a further bonus.',
                            'After the battle: Consolidate (supply and morale), Orderly retreat (organisation), Pillage (supply, attacker only), Pursue (fleeing enemies lose strength), Exploit (a winner spends supply to press the advantage and learns twice as much from the victory).',
                            'Veterancy: every battle survived adds experience, more for a win, up to +25% combat power. Ranks run Green, Regular, Seasoned, Veteran, Elite.',
                            'Attacking a fleet directly costs 10 ammo; bombarding a world costs 50 and an invasion 100. Bombardment hits a world\'s orbital defences first; once they are down it hurts stability and infrastructure below.',
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: 'ground',
        title: 'Ground War',
        icon: 'Swords',
        introduction: 'A world is taken on the ground, district by district, and only while your fleet holds the sky above it. A well-held world lasts hours, long enough for help to arrive.',
        subsections: [
            {
                id: 'empty-worlds',
                title: 'Empty worlds: battlefields and staging grounds',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Troops can land on any empty world you have surveyed (LAND TROOPS on the world, with your transport in orbit). Nobody owns it, so nobody besieges it: they just stand there.',
                            'An army on ground it does not own digs in a little every cycle, and lives off its supply. A fleet of yours parked overhead keeps it supplied; without one the supply runs down, and an army with none left wastes away.',
                            'Use it as a forward base: re-embark and strike the next system from there.',
                            'If an enemy you are at war with lands on the same world, the ground is contested: a field battle on its surface. Whoever was there first defends, as dug in as they have had time to get.',
                            'There is no clock. Every five minutes each side pays to keep its men supplied (credits and materiel, more for more men). A side that pays, and whose enemy does not hold the sky, is fed; one that cannot pay, or is blockaded, goes hungry, bleeds, and in the end surrenders. Two empires that keep paying can grind on for days.',
                            'It ends when one side is gone, starved into surrender, or the attacker pulls out.',
                            'Blockade runners: a small fleet of yours (three hulls or fewer) in the system or one jump out may slip supplies past a blockade, a freighter more often. It slows the hunger; it does not end it. This works for besieged cities and cut-off beachheads too.',
                            'Winning takes the field, not the world: it stays empty, and your survivors stand on it. Nobody can settle it or plant an outpost while foreign troops are on it.',
                        ],
                    },
                ],
            },
            {
                id: 'landing',
                title: 'Landing',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Raise troops on a world you own: select it, press UNITS and recruit (infantry, armour, anti-armour, artillery, special operations). Troops cost credits and materiel.',
                            'Load armies onto a fleet, fly it to the target and take orbit over the world. INVASION lands the troops.',
                            'Landing needs the orbit. Whoever holds the orbit decides who can land, who is supplied and who can be bombarded.',
                        ],
                    },
                ],
            },
            {
                id: 'cycles',
                title: 'The battle',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'The battle moves in cycles of 5 real minutes. Both sides\' troops stand on the world\'s districts as formations; each cycle they fight where they touch and the front moves.',
                            'Each side picks a stance: Assault hits hard and takes losses, Hold takes the least damage, Ambush is even. Assault beats Hold, Hold beats Ambush, Ambush beats Assault, each by 15%.',
                            'Battle plans: put formations on a front to hold, or draw an offensive at objectives. Formations on a plan dig in and build up a preparation bonus until you execute it.',
                            'A formation whose organisation breaks retreats to friendly ground, or surrenders if it is cut off. Prisoners are taken.',
                            'A defender who gives no orders defends on a sensible default doctrine. Your first order takes over.',
                            'Both sides are told when anything important happens: a landing, a strongpoint falling, the orbit changing hands.',
                        ],
                    },
                ],
            },
            {
                id: 'strongpoints',
                title: 'Strongpoints',
                blocks: [
                    {
                        type: 'table',
                        content: [
                            { strongpoint: 'Capital', effect: 'The world falls when the attacker holds it for 2 cycles, or when no defender is left.' },
                            { strongpoint: 'Shield generator', effect: 'Blocks orbital fire and lets the defender land reinforcements. Falls to sappers after 2 cycles held, or wears down under heavy bombardment.' },
                            { strongpoint: 'Barracks / Fortress', effect: 'Raise a militia every cycle while they stand, and are where new recruits muster. A Fortress makes troops dig in deepest there and around it.' },
                            { strongpoint: 'Chokepoints', effect: 'Passes in the terrain. Holding them raises how deep your troops can dig in.' },
                        ],
                    },
                ],
            },
            {
                id: 'blockade',
                title: 'Blockade and relief',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'An invader who loses the orbit is cut off: after 3 cycles their beachhead starts to starve, and after 6 their formations surrender.',
                            'A relief fleet that drives the invader\'s fleet away wins the orbit back; transports waiting nearby can then land fresh troops, who muster at the barracks.',
                            'Troops can never enter some terrain (infantry and armour cannot cross mountains), so a strongpoint in the mountains can only be worn down from orbit, surrounded, or taken by air.',
                            'The capital district is always a city (or an outpost\'s dome), so every world can be taken on foot.',
                            'Surround it: a capital or strongpoint whose every neighbouring district you have held for 3 cycles is cut off. Nothing reaches it, and its garrison starves like any cut-off formation.',
                            'Air drop: Airborne and Special Ops aboard a fleet over your siege can drop onto any district behind the line (DROP buttons in the war bar): the shield generator, the gun platform, the barracks, the capital. They fight the moment they land; hold a shield or fortress for 2 cycles and the sappers bring it down. Flak from the guns below takes its share, and nothing drops while the enemy holds the sky.',
                            'A contested sky (warships of both sides overhead) is not a blockade. Both sides can land troops, and both lose a tenth of them to the other\'s ships on the way down. Both sides get half their supply: men settle at half supply but do not starve.',
                        ],
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Surface guns: an Orbital Defense Platform (and an outpost\'s batteries) shoots at what is overhead while it stands and its district is yours.',
                            'Space battles: the guns fight alongside your fleet. They shoot down fighters and bombers first, then fire on the ships you chose on the world\'s card (GUNS: capital ships, escorts, troop transports, or whatever is closest). Ships cannot shoot back at them; bombardment, sabotage and commando raids are how a gun is silenced.',
                            'Bombardment: the guns fire back. Less reaches the ground (a platform stops 40%) and the bombarding ships take hits. During a siege they fire on the invader\'s ships overhead every cycle; they wear a fleet down but never finish it.',
                            'Landings: flak. An invasion coming down under a platform loses 15% of its men before it lands, reinforcements too.',
                            'Air strikes on the world, or on a fleet over it, lose craft to the guns before they strike.',
                        ],
                    },
                    {
                        type: 'strategy_tip',
                        title: 'Rules of thumb',
                        content: 'Equal forces with the invader holding the orbit: the invasion usually breaks within two hours. An attacker needs about half again the defender\'s strength, or the defender cut off from the sky.',
                    },
                ],
            },
        ],
    },
    {
        id: 'collapse',
        title: 'When Empires Come Apart',
        icon: 'AlertTriangle',
        introduction: 'Worlds do not rebel overnight. Each one drifts slowly toward how it feels about you, so a falling number is your early warning.',
        subsections: [
            {
                id: 'cohesion',
                title: 'Cohesion',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Every world has a cohesion between 0 and 100 that drifts toward a target built from named causes: happiness, distance from the capital, the governor, war, oppression and more. The Government page lists your weakest worlds and why.',
                    },
                    {
                        type: 'table',
                        content: [
                            { stage: 'Integrated (60+)', meaning: 'Loyal.' },
                            { stage: 'Strained (40–59)', meaning: 'Grumbling.' },
                            { stage: 'Defiant (20–39)', meaning: 'Its governor may refuse orders; you are asked to answer.' },
                            { stage: 'Separatist (under 20)', meaning: 'Wants out.' },
                        ],
                    },
                ],
            },
            {
                id: 'secession',
                title: 'Secession and civil war',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Two or more separatist worlds near each other form a secession crisis. You have at least a real day to answer: grant concessions (lower taxes, resource rights, no conscription, a local parliament, autonomy, each permanent), bribe, threaten, replace the governor, or send the military.',
                            'Ignore it and the region breaks away as a new empire a few hours later, taking its worlds, a share of the treasury and any fleets that defect. A new player can take over a breakaway state.',
                            'Rivals can make it worse: funding separatists, smuggling weapons and bribing governors are espionage operations.',
                        ],
                    },
                ],
            },
            {
                id: 'fallen',
                title: 'If you are conquered',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Losing every world to conquest is not the end. You can go into hiding on one of your lost worlds, with the people who would still follow you, and play on as a resistance: pick jobs against the conqueror (a payroll ship, a detention block, a broadcast, bigger planned heists), choose who goes and how, and live with what happens. Odds are shown as words, not numbers. Your people can be wounded, captured or killed for good, and the conqueror hunts you. Other exiles can join your crew, and an empire that still stands can give you sanctuary. A world forgets its old rulers after about eight real days, and with nothing remembered there is nowhere to hide.',
                    },
                ],
            },
        ],
    },
    {
        id: 'espionage',
        title: 'Espionage',
        icon: 'Eye',
        introduction: 'Agents, networks and operations abroad; counter-intelligence, case files and rebel cells at home.',
        subsections: [
            {
                id: 'sabotage-defences',
                title: 'Softening a world before an attack',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Three sabotage operations put a world\'s defences out of action for two days (they need a deep network there): Disable Orbital Defences (its defence stations go offline, so the orbit falls fast and they add nothing to a space battle), Blind the Shield (shield generators and shield arrays go dark: bombardment gets through, and the defenders lose the shield) and Spike the Guns (surface defence platforms and outpost batteries).',
                            'Time it: the operation itself takes hours, and the defences come back by themselves after two days, so the fleet has to strike in between.',
                            'Defending: when your defences are sabotaged you are told. Counter-intel → Restore Defences brings everything sabotaged in that system back at once (a few hours, 20 Intel).',
                            'Commando raid, the loud way: a fleet parked over an enemy world you are at war with, carrying Special Ops or Airborne troops, can RAID SHIELD, RAID GUNS or RAID UPLINK (orbital defences) from the world\'s card. Up to 300 raiders go down; Special Ops count double Airborne, a big or dug-in garrison lowers the odds (10% to 85%). Success knocks the target out for four days and costs some raiders. Failure costs most of them and the rest are taken prisoner. The same force needs six hours before raiding again. Restore Defences undoes a raid too.',
                        ],
                    },
                ],
            },
            {
                id: 'agents',
                title: 'Agents and Networks',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Everything covert lives on one page: Intelligence > Espionage. Recruit agents there with credits, then send each one to a system another empire holds.'
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'A deployed agent builds a network in that system. As it grows it reveals more: first a rumor of fleets, then their count and owner, then their full composition and orders.',
                            'A staffed network on foreign soil also raises your infiltration of the system\'s owner. Infiltration climbs through four stages: Recon Cell, Embedded Network, Deep Assets, Shadow Government.',
                            'Recall an agent and their network starts to fade. Agents rest briefly between assignments.',
                            'A free agent can also run an operation. Their traits shift the odds (Veterans help everything, Brutal agents help sabotage, Seducers political work, Economists economic warfare) and change how easily it is traced back to you (Ghosts are quiet, Brutal agents are not). Each operation costs them cover, more when they are caught, and an agent with no cover left is burned.'
                        ]
                    }
                ]
            },
            {
                id: 'ops',
                title: 'Operations, the Board and Reports',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Operations: pick an empire, one of its systems, then an operation. Each costs Intel and credits and takes up one of your operation slots until it resolves.',
                            'Your infiltration of the target decides what you can run. Intelligence gathering is open from the start; disinformation and economic warfare open at Embedded Network, sabotage and black operations at Deep Assets, political warfare (coups, assassinations, election interference) at Shadow Government.',
                            'The odds shown are your side only. The target\'s counter-intelligence and internal security are subtracted when the operation resolves.',
                            'Economic warfare also needs the Black Market Operations technology.',
                            'The Board posts time-limited opportunities and threats. Seize them before they expire.',
                            'Reports carry a confidence estimate. A report can be outdated, incomplete, or planted by the other side.',
                            'When an operation resolves you are told how it went and whether you were caught, and an after-action entry stays in Reports for about two days. When your service catches a foreign operation against you, you hear about it too: a caught operation names its sponsor, a suspected one names who your service blames, with no proof.'
                        ]
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Counter-intelligence (its own tab) is paid every hour in Intel. The service budget raises your counter-intelligence strength, which cuts every foreign operation\'s odds against you and makes their reports on you likelier to be planted. System coverage, on up to ten of your systems, makes operations there likelier to be traced. If you cannot pay the upkeep, none of it works.',
                            'Cases: when a foreign operation hits you and your service does not catch who sent it, a case opens on the Cases tab. Clues come in over time (faster with more counter-intelligence): what it took, who could afford it, whose ships were there, who has motive, what the press and your sources say, what prisoners say. Pin each clue to the empire you think it points at, then accuse one publicly, leak the story, or wait. Suspicion can be wrong, and a false flag is built to make it so. Accuse wrongly and you insult an innocent empire; the real culprit gets away.',
                            'False flags: a False Flag Raid can be dressed up as a third empire\'s work. The victim\'s file fills with planted evidence pointing at them, and the victim\'s anger goes their way. Frames work best on an empire that could plausibly have done it. AI services frame, hire foreign faces, open their own files, chase leads, and accuse, sometimes rightly, sometimes because they were fooled.',
                            'You work at most twelve files at once; beyond that the oldest file about mere snooping is shelved. Quiet spying that nobody noticed opens no file at all.',
                            'Lines of inquiry: on an open file you can pursue a lead for Intel (follow the money, pull the sensor logs, check the method, ask your sources inside an empire, press a prisoner, trace the operative). One at a time; it reports back after some hours with a finding, nothing, or a lie. Counter-intelligence makes leads cheaper and faster.',
                            'The grid beside each person of interest shows what your pins establish: motive (MO), means (ME) and opportunity (OP). When you accuse, you can also name a theory of why. Name the right reason as well as the right culprit and the case lands harder; name the wrong reason and the press mocks you, even if the culprit was right.',
                            'Every suspect has a dossier: their species and creed, how things stand between you and what has happened lately, how deep your own sources go inside them, and what your service has found out about them (their reach inside you, their tradecraft, prisoners who claim to work for them). The assessment line reads only the clues you pinned to them.',
                            'Agents have a species. Most recruits are your own people; about one in four is a foreigner, dearer to hire. A witness who sees your operative describes their species, so a foreign hire points the victim at the foreigner\'s homeworld instead of at you. A victim with good files may know the operative as a freelancer, and a captured hireling will say who paid them.',
                            'A compromised agent in your own service is a mole: it feeds your open case files to the very empire you are investigating. Counter-intelligence strength is how you find it.',
                            'Rebel cells: on a world where unrest, an unhappy interest group and a reputation for oppression add up to real grievance, the unhappiest people organise into a cell. It grows while the grievance lasts and fades if the world is made content. You only see the cells your service has found (Internal security, on the Counter-intel tab). A crackdown hits every cell on a world and finds some, for political capital; it also raises your reputation for oppression and that world\'s unrest, which is how the next cell recruits. Abroad, cells your networks or deep infiltration can see appear under Movements abroad on the Operations tab: pay them (arm them, or pay through a cutout so a captured member cannot name you) and they strike more often, with heists that pay you a cut; but every cycle and every strike leaves evidence, and an exposed sponsor answers for it. When a cell strikes your world, you get a case file on it, and one possible answer is that no foreign hand was behind it at all. On a cell\'s file you can turn an informant: they name members of that one cell, and where its money comes from (a cutout keeps the sponsor\'s name from them), and your next crackdown on that world knows where to look. Strong, armed cells break their sponsors\' agents out of prison and kill governors. A cell that lasts about a month of game time and grows strong comes into the open as a secession crisis on its world, answered on the Government page like any other; if it is not settled or suppressed it becomes a breakaway state, which a new player can take. AI governments crack down on cells at home as hard as their temperament runs. If you join late, you can lead a movement underground instead of a state: the game gives you a cell inside someone else\'s empire, and you play it from hiding (strike, lie low, send a sponsor\'s money back, and declare when it is old and strong enough). Nobody, not even the government hunting you, learns that a person leads it. If the movement wins, the state it becomes is yours. And if your own empire falls to a conqueror, you can go into hiding: with the people who would still follow you, on one of your lost worlds out on the edge, while the worlds still remember you (a conquered world forgets its old rulers after a while, and becomes simply part of the empire that holds it). In hiding, your people take jobs: a payroll ship, a detention block, a broadcast. You choose who goes and what they do at each turn; the odds are shown only as words, and what happens is real. Bigger jobs are planned: pick a real target nearby (one of the conqueror\'s worlds, or a warship resting in reach), send someone to watch it, buy gear with the movement\'s own money (cheaper at a black market), give each person a part and choose an approach. A stolen warship waits in a hidden dock until your movement has a state to sail for. Every job leaves something behind for the conqueror\'s investigators. Your people can be wounded, taken or killed on a job, and the dead do not come back; a choice that may cost someone says so, and names them, before you make it. Those who are taken may talk under questioning, and a prison break can bring them home. Loyalty that runs out can turn someone in secret. The right job can settle a companion\'s own unfinished business. If your conqueror is not a person, a named officer hunts you: every strike makes them look harder, their searches are real, and you will read about their work as it happens. You can go after them; someone will take their place. Others who fell may join forces with you: your people and theirs become one crew, each of you keeps your own movement, and a job together starts only when everyone has committed. A friend whose empire still stands can give you sanctuary, openly or quietly; your people are safe there, but your conqueror may demand they hand you over.',
                            'A Counter-Intel Sweep audits one of your own systems: foreign networks found there are broken up and named, and every rival\'s infiltration of you drops. The owners of a broken network find out.'
                        ]
                    },
                    {
                        type: 'strategy_tip',
                        title: 'Being caught',
                        content: 'An operation resolves undetected, suspected, or exposed. Exposure costs you with the victim and opens a debate in their chamber. Running many operations in the same region makes each one easier to spot.'
                    }
                ]
            }
        ]
    },
    {
        id: 'diplomacy',
        title: 'Diplomacy',
        icon: 'Handshake',
        introduction: 'Every pair of empires has a rivalry between 0 and 100. Low rivalry opens deals; high rivalry ends in war.',
        subsections: [
            {
                id: 'rivalry',
                title: 'Rivalry',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Envoys (100 credits and 2 political capital) lower rivalry with an empire by 15. Treaties, trade pacts and peace lower it further; rejected offers, broken treaties, sanctions and gambits raise it.',
                            'Rivalry climbs through escalation levels; at the top the two empires are at war.',
                            'The AI answers your offers after a few hours, mostly on rivalry: a non-aggression pact is accepted below 60, a mutual defence treaty only below 30, a trade pact below 50.',
                        ],
                    },
                ],
            },
            {
                id: 'deals',
                title: 'Deals',
                blocks: [
                    {
                        type: 'table',
                        content: [
                            { deal: 'Non-aggression pact', effect: 'Lowers rivalry. Attacking a partner breaks it and brands you an oathbreaker in the press.' },
                            { deal: 'Mutual defence', effect: 'If anyone attacks your partner, you join the war, and the other way round. Buthari and Infernoids sign none.' },
                            { deal: 'Research sharing, intelligence cooperation, open borders', effect: 'Lower rivalry; no further effect yet.' },
                            { deal: 'Trade pact', effect: 'A standing trade in one resource at market price, free of tariffs. Lowers rivalry.' },
                            { deal: 'Tribute', effect: 'Demand a payment every cycle. The AI pays only an empire much stronger than itself, and only a little.' },
                            { deal: 'Peace', effect: 'Ends a war if accepted. The AI accepts when war-weary, losing, or outgunned.' },
                        ],
                    },
                    {
                        type: 'paragraph',
                        content: 'An offer stands for a real day. You can withdraw it; after it is answered the same proposal waits a while before it can be made again. While two empires are at war, only peace and tribute can be offered.',
                    },
                ],
            },
            {
                id: 'pressure',
                title: 'Pressure short of war',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Sanctions (15 PC) end all trade between you and drain the target\'s treasury every cycle, more when several empires sanction together. They cost you a little too, and last until lifted or until war.',
                            'Gambits: an ultimatum demanding credits, a public espionage accusation, or a show of force. The target answers within a day. Predict the answer correctly for more leverage. A false accusation costs you.',
                            'Breaking a treaty (20 PC) raises rivalry sharply, costs you in reputation and makes the press.',
                        ],
                    },
                ],
            },
            {
                id: 'war',
                title: 'War',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Declaring war costs 30 political capital. Rivalry goes to 100, every treaty, trade pact and tribute between you ends, and the victim\'s allies under mutual defence join in.',
                            'Fighting without declaring counts as the same act of war.',
                            'Peace has to be offered and accepted.',
                        ],
                    },
                    {
                        type: 'paragraph',
                        content: 'Your record is kept: aggression, reliability, deception, trade influence, oppression and honour, earned by what you do in diplomacy and slowly fading back to normal.',
                    },
                ],
            },
        ],
    },
    {
        id: 'companies',
        title: 'Companies and the Press',
        icon: 'Building2',
        introduction: 'Two powers inside your empire that you do not fully control: the charter companies you create, and the press that reports on you.',
        subsections: [
            {
                id: 'charters',
                title: 'Charter companies',
                blocks: [
                    {
                        type: 'bullet_list',
                        content: [
                            'Economy → Corporate. Charter a company once you have researched Trade Route Initialization and your legitimacy is 25 or more.',
                            'You choose its mission (mining, colonization, trade, banking, logistics, shipbuilding, research or extraction), its territory, its rights, who owns it, and the state\'s share of profit (up to 60%). Founding capital is at least 20,000 credits; the treasury pays the state\'s stake. Political capital pays for the territory and rights: the wider the charter, the dearer.',
                            'A charter runs 3, 5 or 8 galaxy days and then comes up for renewal. A short leash makes a company less loyal.',
                            'It pays the state its profit share every cycle. A trade company also pays 100 credits and a little political capital for each working trade station.',
                        ],
                    },
                    {
                        type: 'warning',
                        title: 'Companies go rogue',
                        content: 'Companies make demands (lower taxes, monopoly protection, a seat in the senate and more), which you accept, reject or negotiate. One whose autonomy reaches 80 goes rogue: you have one real day to nationalise it or bring it back to heel. Otherwise it breaks away, taking the worlds it governs, its fleet, or a slice of the treasury with it. Revoking a charter early in that countdown stops the break; past halfway it only hastens it.',
                    },
                ],
            },
            {
                id: 'press',
                title: 'The press',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Comms → Press. Outlets (state, neutral, rebel, sensational) cover what your empire does, and public trust in your government feeds approval. Journalists investigate; when one digs into you, you can cooperate, obstruct, sacrifice an official or publish first. Your Press office (an advisor) answers on your behalf unless you take it back. The Gazette shows the galaxy\'s papers to anyone.',
                    },
                ],
            },
        ],
    },
    {
        id: 'victory',
        title: 'Victory',
        icon: 'Trophy',
        introduction: 'A season ends when one empire wins. There are two ways. Empire → Saga shows how close you are to each.',
        subsections: [
            {
                id: 'conquest',
                title: 'Conquest',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Hold at least 60% of all the systems in the galaxy while no other empire holds any at all. Unclaimed systems may remain. A conqueror then faces mounting pressure to hold what was taken.',
                    },
                ],
            },
            {
                id: 'enlightenment',
                title: 'Enlightenment',
                blocks: [
                    {
                        type: 'paragraph',
                        content: 'Govern so well that nobody wants to leave. All of these at once:',
                    },
                    {
                        type: 'bullet_list',
                        content: [
                            'Approval 65 or more, legitimacy 75 or more, cohesion 75 or more.',
                            'No interest group above 40% of influence, and the least content group at 45 or more.',
                            'Colonies in at least three star systems (any number of worlds in one system counts once).',
                            'A Great Archive standing: one per empire, about three real days to build.',
                        ],
                    },
                    {
                        type: 'paragraph',
                        content: 'Hold them for about two and a half real days to qualify, then one more real day of Transcendence. Slipping while you qualify drains your progress twice as fast as it built; a slip during Transcendence gets a short grace, and a broken attempt keeps half its progress.',
                    },
                    {
                        type: 'warning',
                        title: 'Everyone will see it coming',
                        content: 'Rivals work against an empire racing for Enlightenment: their spies target you first and can burn the Archive, resentful courts embargo you, and some may declare war. Guard your counter-intelligence.',
                    },
                ],
            },
        ],
    },
];
