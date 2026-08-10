# Technology Web — Master Index

Every tech in the web: the eight domain catalogs, the six bridge techs from [web-map.md](web-map.md) (marked **BRIDGE**), and the fifteen conduct-triggered entries from [systems.md](systems.md) (marked **EMERGENT**, with their triggers in the prerequisites column).

**Total: 142 techs** — 124 across the eight domain catalogs, 6 bridge, 12 standalone emergent. Three further emergent entries are *catalog reveals*: conduct triggers that unlock an existing catalog tech early rather than adding a new one, so they are listed but not counted.

| Source file | Techs |
|---|---|
| [physics-energy-spaceflight.md](physics-energy-spaceflight.md) | 16 |
| [planetary-megastructures.md](planetary-megastructures.md) | 16 |
| [infrastructure-materials.md](infrastructure-materials.md) | 16 |
| [computing-communications.md](computing-communications.md) | 17 |
| [biology-medicine.md](biology-medicine.md) | 14 |
| [society-governance.md](society-governance.md) | 14 |
| [economics-markets.md](economics-markets.md) | 14 |
| [military-espionage.md](military-espionage.md) | 17 |
| [web-map.md](web-map.md) — bridge techs | 6 |
| [systems.md](systems.md) — emergent techs | 12 (+3 catalog reveals) |

Grouped by domain, tier-ordered. Bridge techs are listed under the domain that owns them. Mutex fork members note their group in the mechanic column.

---

## Physics, Energy & Spaceflight (16)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `phys_fusion_power` | Commercial Fusion Power | physics | 1 | — (root) | Fusion fuel cycle: `fusion_fuel` resource, planetary energy budgets, blackout events |
| `phys_grid_storage` | Grid-Scale Energy Banking | physics | 1 | phys_fusion_power, infra_planetary_grid | Per-planet energy reserve dischargeable into one of four surge channels (shield/beam/industry/bridging) |
| `space_orbital_logistics` | Standardized Orbital Logistics | spaceflight | 1 | mat_advanced_composites | Lift capacity as an allocatable logistics channel; army embarkation and mass evacuation |
| `space_cycler_network` | Cycler Transit Networks | spaceflight | 1 | space_orbital_logistics, econ_interstellar_banking | Scheduled in-system freight and migration lines with ownership (state vs chartered) and migration policy |
| `phys_directed_energy` | Directed-Energy Systems | physics | 2 | phys_fusion_power, mat_advanced_composites | Dual-mode beam arrays (weapon vs power relay) plus DEW ship refits |
| `space_advanced_drives` | Torch Drives | spaceflight | 2 | phys_fusion_power, space_orbital_logistics | Hard-burn order: far faster arrival at multiplied fuel draw and detectability |
| `phys_gigascale_power` | Gigascale Concentration | physics | 2 | phys_fusion_power, infra_planetary_grid | Multi-district fusion campus with export surplus; one point of failure (mutex: power doctrine) |
| `phys_microreactor_swarm` | Distributed Microreactor Swarms | physics | 2 | phys_fusion_power, mat_advanced_composites | District self-power immune to grid failure and siege; no export surplus (mutex: power doctrine) |
| `phys_orbital_power_relay` | Beamed Sky Power | physics | 2 | phys_fusion_power, phys_directed_energy, space_orbital_logistics | Orbital constellations power planets; inter-planet energy trade; total orbit dependence (mutex: power doctrine) |
| `phys_antimatter` | Antimatter Production & Containment | physics | 3 | phys_directed_energy, mat_orbital_industry | `antimatter` resource in orbital containment rings; fuels warheads, range extension, every Tier 4 megaproject |
| `space_deep_navigation` | Deep-Space Navigation | spaceflight | 3 | space_advanced_drives, comm_deep_space_network | Off-hyperlane movement between any two systems; chartable, stealable secret routes |
| `space_expeditionary_logistics` | Expeditionary Fleet Trains | spaceflight | 3 | space_advanced_drives, infra_automated_ports, mil_command_networks | Persistent forward bases, fleet-to-fleet resupply, hidden deep-space caches |
| `phys_relativistic_kinetics` | Relativistic Kinetics | physics | 3 | phys_directed_energy, space_advanced_drives, mil_orbital_strike | Establishes the deterrence layer: counted, unrecallable RKV batteries as a standing commitment trap |
| `phys_starlifting` | Stellar Husbandry | physics | 4 | phys_antimatter, mega_dyson_swarm | Mine the home star on an extraction slider coupled to system climate (mutex: stellar destiny) |
| `space_lane_forging` | Metric Lane Engineering | spaceflight | 4 | space_deep_navigation, phys_antimatter | Forge or sever hyperlanes — edit the strategic map for every faction at once (mutex: stellar destiny) |
| `phys_singularity_engine` | Singularity Engines | physics | 4 | phys_antimatter, mat_molecular_manufacturing | Penrose plants on the galaxy's few fixed black-hole systems; the game's energy ceiling |

## Planetary Engineering & Megastructures (16)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `plan_closed_ecologies` | Closed Ecologies | planetary | 1 | — (root) | Sealed structures ignore habitability; life-support insolvency kills population, not just happiness |
| `plan_subterranean_engineering` | Subterranean Engineering | planetary | 1 | mat_advanced_composites | Undercity layer: hidden, bombard-mitigated building slots beneath qualifying sectors |
| `plan_benthic_settlement` | Benthic Settlement | planetary | 1 | plan_closed_ecologies, mat_advanced_composites | Ocean sectors become buildable (pressure habitats plus OTEC power) |
| `plan_climate_control` | Climate Control | planetary | 2 | plan_closed_ecologies, comp_distributed_compute | Maintained per-planet climate target converts marginal terrain; drifts back if regulators fail |
| `mega_orbital_habitats` | Orbital Habitats | megastructures | 2 | plan_closed_ecologies, space_orbital_logistics | Civilian population housed in orbit; growth decouples from planet count |
| `plan_open_sky_compact` | Open Sky Compact | planetary | 2 | plan_climate_control | Compounding habitability, wilderness preserves, loyalty from reclaimed sky (mutex: settlement doctrine) |
| `plan_hermetic_doctrine` | Hermetic Doctrine | planetary | 2 | plan_closed_ecologies, infra_planetary_grid | Prefab settlement stamping from stockpile plus sealable cities; arcology spines; any archetype colonizable (mutex: settlement doctrine) |
| `plan_voidborn_mandate` | Voidborn Mandate | megastructures | 2 | mega_orbital_habitats, space_orbital_logistics | Habitat-primary society with a parliament caucus; extraction-colony planet stance (mutex: settlement doctrine) |
| `plan_terraforming` | Terraforming | planetary | 3 | plan_climate_control, phys_fusion_power, bio_enviro_adaptation | Staged megaprojects migrating planet archetypes and rewriting sector terrain |
| `plan_artificial_magnetosphere` | Artificial Magnetosphere | planetary | 3 | phys_directed_energy, infra_planetary_grid | L1 dipole lets stripped worlds hold atmospheres; one structure holds up the sky |
| `plan_tectonic_engineering` | Tectonic Engineering | planetary | 3 | plan_climate_control, comp_predictive_systems, phys_fusion_power | Regrade sectors, create or delete chokepoints, mantle-tap energy on volcanic terrain |
| `mega_nomad_flotillas` | Nomad Flotillas | megastructures | 3 | mega_orbital_habitats, space_advanced_drives | Mobile habitat cities on the hyperlane graph; a flotilla can serve as seat of government |
| `mega_orbital_ring` | Orbital Ring | megastructures | 4 | infra_orbital_elevator, mat_molecular_manufacturing, mega_orbital_habitats | Ring layer fuses planet and orbit into one economy; deorbit-debris catastrophe risk |
| `mega_dyson_swarm` | Dyson Swarm | megastructures | 4 | mat_molecular_manufacturing, comp_machine_intelligence, space_deep_navigation | System-scale energy tranches; permanent energy-price collapse; a visibly dimming star |
| `plan_gaia_transformation` | Gaia Transformation | planetary | 4 | plan_terraforming, bio_synthetic_biology | Final terraform stage: self-maintaining habitability-100 gaia worlds, industry restricted, empire-wide legitimacy aura (mutex: worlds' purpose) |
| `mega_planetary_disassembly` | Planetary Disassembly | megastructures | 4 | phys_antimatter, mat_molecular_manufacturing, mega_orbital_habitats | Convert planets to mass streams; inhabited worlds require total evacuation first (mutex: worlds' purpose) |

## Infrastructure & Materials (16)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `infra_planetary_grid` | Unified Planetary Grid | infrastructure | 1 | phys_fusion_power | Planetary energy pooling with curtailment-triage directives; power_grid track cap 3→5 |
| `mat_advanced_composites` | Advanced Composites | materials | 1 | — (root) | Composites production chain: the stored intermediate good all orbital construction prices in |
| `infra_logistics_network` | Integrated Distribution Networks | infrastructure | 1 | infra_planetary_grid | Per-planet distribution priority splits plus standing supply routes on real trade fleets |
| `infra_mass_driver` | Mass Driver Arrays | infrastructure | 1 | infra_planetary_grid, mat_advanced_composites | Near-free bulk lift; dual-use anti-blockade fire and crude cross-planet bombardment |
| `infra_automated_ports` | Automated Ports | infrastructure | 2 | infra_logistics_network, comp_distributed_compute | Strike-proof automated freight; opens the per-planet displaced-labor ledger |
| `mat_orbital_industry` | Orbital Industry | materials | 2 | mat_advanced_composites, space_orbital_logistics | Orbit-exclusive microgravity fabrications gate capital ships and high-tier structures |
| `mat_swarm_fabrication` | Distributed Microfabrication | materials | 2 | mat_advanced_composites, comp_distributed_compute | Dispersed production with a per-strike damage floor; heavy industry permanently capped (mutex: industrial organization) |
| `mat_industrial_arcologies` | Arcology Manufactories | materials | 2 | mat_advanced_composites, plan_closed_ecologies | Multi-sector megabuildings: siege-proof output, huge density, organized-labor politics (mutex: industrial organization) |
| `mat_charter_manufacturing` | Chartered Industry | materials | 2 | mat_advanced_composites, econ_interstellar_banking | Corp-leased industrial districts auto-build for royalties and accumulate influence (mutex: industrial organization) |
| `infra_orbital_elevator` | Orbital Elevator | infrastructure | 3 | mat_orbital_industry, infra_automated_ports | Staged megaproject removing the lift ceiling; owns `EVAC_POPULATION`; ribbon-fall is the worst sabotage outcome in the game |
| `mat_metamaterials` | Programmable Metamaterials | materials | 3 | mat_advanced_composites, phys_directed_energy | Fleet signature masking (stealth vs coordination) and energy-hungry hardened cladding |
| `mat_molecular_manufacturing` | Molecular Manufacturing | materials | 3 | mat_orbital_industry, comp_machine_intelligence | Nanoforge matter compilation between resource types; extraction worlds obsolesce |
| `infra_autonomous_factories` | Lights-Out Manufacturing | infrastructure | 3 | infra_automated_ports, comp_machine_intelligence | Per-building automation: zero manpower, strike/siege immunity, mass displacement, hijack surface |
| `infra_self_assembling_infrastructure` | Self-Assembling Infrastructure | infrastructure | 4 | mat_molecular_manufacturing, comp_autonomous_administration | Queue-free seeded construction and auto-repair; gray-bloom replication crises |
| `mat_fabrication_commons` | The Common Forge | materials | 4 | mat_molecular_manufacturing, soc_digital_governance | Per-planet post-scarcity: displacement abolished, tax base collapses, corps turn hostile (mutex: fabrication endstate) |
| `mat_sealed_foundries` | Licensed Matter | materials | 4 | mat_molecular_manufacturing, comm_quantum_secure | Sealed fabrication monopoly: royalties, licensed exports with a revocation lever, black markets (mutex: fabrication endstate) |

## Computing & Communications (17)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `comp_distributed_compute` | Distributed Compute Fabric | computing | 1 | infra_planetary_grid | Compute as a stockpiled resource allocated across research/logistics/intel channels |
| `comm_deep_space_network` | Deep Space Relay Network | communications | 1 | space_orbital_logistics | Relay-connected vs dark systems: order delay, stale sync, propagation along relay edges |
| `comm_mass_media` | Mass Broadcast Networks | communications | 1 | soc_digital_governance | State broadcaster with a standing editorial line and a persistent credibility stat |
| `comp_machine_intelligence` | General Machine Intelligence | computing | 2 | comp_distributed_compute, mat_advanced_composites | Commissioned task models: competence grows with tenure, alignment drift with scope |
| `comp_predictive_systems` | Societal Forecasting Engines | computing | 2 | comp_distributed_compute, esp_sigint | Probabilistic forecasts of unrest/collapse/policy cost, plus the publish-or-act dilemma |
| `comm_quantum_secure` | Quantum-Secured Channels | communications | 2 | comm_deep_space_network, phys_directed_energy | Tiered secrecy on limited capacity; tampering attempts become counterintel leads |
| `comm_open_network` | Open Grid Doctrine | communications | 2 | comm_deep_space_network, econ_interstellar_banking | Data exports, research exchange, migration and cultural gravity — shields down both ways (mutex: network order) |
| `comm_sovereign_intranet` | Sovereign Mesh | communications | 2 | comm_deep_space_network, soc_surveillance_state | Information border control: cheap jamming, infiltration malus, data-smuggling black market (mutex: network order) |
| `comp_autonomous_administration` | Autonomous Administration | computing | 3 | comp_machine_intelligence, soc_digital_governance | Delegation as a mode on existing ministries and governorships; standing machine-rule grievance |
| `comm_infowar_suite` | Integrated Information Warfare | communications | 3 | comp_predictive_systems, comm_mass_media, mil_command_networks | Synchronized press/espionage/military taskings with combat-initiative debuffs |
| `comp_synthetic_minds` | Synthetic Minds | computing | 3 | comp_machine_intelligence, bio_gene_engineering | Defines the synthetic office-holder object; parliament must answer the personhood question |
| `comm_hyperwave_backbone` | Hyperwave Backbone | communications | 3 | comm_deep_space_network, comm_quantum_secure, space_advanced_drives | Zero-latency trunk conduits per hyperlane edge; a cuttable imperial nervous system |
| `comm_memetic_engineering` | Memetic Engineering | communications | 3 | comp_machine_intelligence, comm_mass_media, esp_predictive_intel | Evidence-grade fabrication with verification depth; epistemic pollution poisons everyone |
| `comp_machine_polity` | The Enfranchisement | computing | 4 | comp_synthetic_minds, comp_autonomous_administration, soc_federal_autonomy | Synthetic citizenship: a permanent machine parliament bloc whose electorate you build (mutex: machine sovereignty) |
| `comp_oracle_state` | The Oracle State | computing | 4 | comp_autonomous_administration, comp_predictive_systems, soc_surveillance_state | Governance by weighted objective vector; the player audits value drift (mutex: machine sovereignty) |
| `comp_bounded_intelligence` | The Covenant | computing | 4 | comp_synthetic_minds, comm_quantum_secure | Provably bounded AI: subversion immunity, attestation exports, containment coalitions (mutex: machine sovereignty) |
| `comp_substrate_migration` | Substrate Emigration | computing | 4 | comp_synthetic_minds, bio_longevity, mega_orbital_habitats | Digital population stratum with inverted needs; worlds can be abandoned without demographic loss |

## Biology & Medicine (14 + 1 bridge)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `bio_genomic_medicine` | Population Genomics | biology | 1 | comp_distributed_compute | Genome Archive plus the outbreak/quarantine layer; the archive is a stealable strategic asset |
| `bio_industrial_biofab` | Industrial Biofabrication | biology | 1 | infra_planetary_grid | Energy + chemicals → food chain decoupled from agricultural terrain |
| `bio_ecoforming` | Ecological Succession Engineering | biology | 1 | plan_closed_ecologies | Seeded sectors gain habitability over ticks and spread along adjacency, invited or not |
| `bio_gene_engineering` | Applied Gene Engineering | biology | 2 | bio_genomic_medicine, bio_industrial_biofab | Per-planet gene-mod projects (climate crops, health programs); monoculture correlated risk |
| `bio_enviro_adaptation` | Environmental Adaptation | biology | 2 | bio_gene_engineering, bio_ecoforming | Adaptation packages open hostile sectors; genetic divergence and Adapted social groups begin |
| `bio_germline_charter` | The Germline Charter | biology | 2 | bio_gene_engineering, soc_digital_governance | Universal compulsory heritable enhancement as public infrastructure (mutex: enhancement path) |
| `bio_somatic_market` | The Somatic Market | biology | 2 | bio_gene_engineering, econ_interstellar_banking | Corporate enhancement clinics: income and productivity bought with class stratification (mutex: enhancement path) |
| `bio_synthetic_biology` | Synthetic Biology | biology | 3 | bio_gene_engineering, mat_advanced_composites | Grown construction and living refineries; infrastructure that self-repairs — and can get sick |
| `bio_longevity` | Radical Longevity | biology | 3 | bio_gene_engineering, bio_genomic_medicine, econ_dev_finance | Per-planet allocation dilemma (universal/elite/withheld); leader mortality ends, gerontocracy begins |
| `bio_pantropy` | Pantropy | biology | 3 | bio_enviro_adaptation, space_advanced_drives | Full colonization of toxic/volcanic/deep-ocean worlds by a demographically sealed second people |
| `bio_tailored_pathogens` | Tailored Pathogens | biology | 3 | bio_synthetic_biology, esp_synthetic_identities | Ecological-warfare op family (crop, industrial, population) with persistent attribution trails |
| `bio_radiant_speciation` | Radiant Speciation | biology | 4 | bio_pantropy, bio_longevity, soc_federal_autonomy | Clade system: engineered species per archetype, multi-clade parliament (mutex: species destiny) |
| `bio_the_common_genome` | The Common Genome | biology | 4 | bio_longevity, comp_autonomous_administration | World-by-world reconvergence campaign; divergence system retired at coercive cost (mutex: species destiny) |
| `bio_gaian_synthesis` | Gaian Synthesis | biology | 4 | bio_synthetic_biology, bio_ecoforming, plan_gaia_transformation | Biosphere agent on gaia worlds — flourishing/stressed/wounded — steered by a reserve/managed/pressed stewardship directive |
| `bio_living_hulls` **(BRIDGE)** | Voidwright Shipcraft | biology | 4 | bio_synthetic_biology, mat_orbital_industry, space_advanced_drives | Grown regenerating ship hulls, biomass-costed; uniquely vulnerable to anti-hull pathogens |

## Society & Governance (14 + 2 bridge)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `soc_digital_governance` | Digital Governance | society | 1 | comp_distributed_compute | Civic platform: full cohesion telemetry per planet plus advisory policy referenda |
| `soc_provincial_charters` | Provincial Charters | society | 1 | comm_deep_space_network | Provinces with governors; cohesion distance measured to the nearest provincial capital |
| `soc_actuarial_state` | The Actuarial State | society | 1 | soc_digital_governance, econ_interstellar_banking | Funded insurance reserve auto-converts credits into cohesion floors on shocked worlds |
| `soc_surveillance_state` | The Surveillance State | society | 2 | soc_digital_governance, esp_sigint | Panopticon grid: coverage-scaled detection floor and preventive detention, paid in trust (mutex: statecraft) |
| `soc_federal_autonomy` | Federal Autonomy | society | 2 | soc_provincial_charters, soc_digital_governance | Tiered autonomy compacts with cohesion floors and lawful exit referenda (mutex: statecraft) |
| `soc_participatory_mandate` | The Participatory Mandate | society | 2 | soc_digital_governance, soc_actuarial_state | Binding plebiscites cheapen policy; citizens gain legislative initiative (mutex: statecraft) |
| `soc_constitutional_engineering` | Constitutional Engineering | society | 2 | soc_digital_governance | Conventions transition government profiles through a deliberately vulnerable window |
| `soc_vital_register` **(BRIDGE)** | The Vital Register | society | 2 | bio_genomic_medicine, soc_actuarial_state | Risk-priced coverage terms (universal/risk-scored/voluntary) plus ranked outbreak triage |
| `soc_predictive_governance` | Predictive Governance | society | 3 | comp_predictive_systems, soc_actuarial_state | Pre-emption layer: intervene on a forecast crisis cheaply, at "pre-crime" legitimacy risk |
| `soc_continuity_protocols` | Continuity of Government | society | 3 | comm_quantum_secure, soc_constitutional_engineering | Fallback capitals: coups and capital loss become recognition contests, not checkmates |
| `soc_civic_integration` | Civic Integration Doctrine | society | 3 | soc_actuarial_state, econ_dev_finance | `conquered` cohesion driver plus Assimilation vs Charter Pluralism naturalization tracks |
| `soc_habitat_charters` | Chartered Habitats | society | 3 | mega_orbital_habitats, soc_provincial_charters | Designed orbital micro-polities: freeport, penal station, refuge, corporate concession |
| `soc_algorithmic_sovereignty` | The Custodial Executive | society | 4 | comp_autonomous_administration, soc_predictive_governance | Machine head of state governing through the order queue; performance-only legitimacy (mutex: sovereignty) |
| `soc_perpetual_plebiscite` | The Perpetual Plebiscite | society | 4 | soc_participatory_mandate, soc_predictive_governance, soc_constitutional_engineering | Parliament dissolved into live referenda over opinion currents; Mandate replaces political capital (mutex: sovereignty) |
| `soc_covenant_of_worlds` | The Covenant of Worlds | society | 4 | soc_federal_autonomy, soc_civic_integration | Covenant Standing replaces cohesion; rival empires' unravelling worlds can be invited in (mutex: sovereignty) |
| `soc_wandering_throne` **(BRIDGE)** | The Wandering Throne | society | 4 | soc_continuity_protocols, mega_nomad_flotillas | Flotilla as permanent capital: `distanceFromCapital` recomputes as the throne moves |

## Economics & Markets (14 + 1 bridge)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `econ_interstellar_banking` | Interstellar Banking | economy | 1 | comm_deep_space_network | Sovereign bonds and cross-faction loans; coupon rates float on borrower confidence |
| `econ_commodity_exchanges` | Open Commodity Exchanges | economy | 1 | econ_interstellar_banking, space_orbital_logistics | Hosted spot markets: fee income, public price feeds, the venue as a military target |
| `econ_public_charters` | Joint-Stock Charters | economy | 1 | econ_interstellar_banking | Public listing of charter corps; foreign factions can quietly buy your companies |
| `econ_automated_markets` | Algorithmic Markets | economy | 2 | econ_commodity_exchanges, comp_distributed_compute | Standing per-resource trading bands executed by the tick worker; flash crashes |
| `econ_futures_markets` | Futures Markets | economy | 2 | econ_commodity_exchanges, comp_predictive_systems | Forwards and route underwriting: move cost through time, inherit counterparty risk |
| `econ_dev_finance` | Planetary Development Finance | economy | 2 | econ_interstellar_banking, soc_digital_governance | Planet-backed bonds foreigners can buy — investment, intelligence feed, and leash at once |
| `econ_state_capital` | Directed Capital | economy | 2 | econ_public_charters, econ_dev_finance | Command the corporate sector: certainty, suppressed autonomy, invisible misallocation (mutex: capital doctrine) |
| `econ_free_port_compact` | Free Port Compact | economy | 2 | econ_public_charters, econ_commodity_exchanges | Open registry: fee income from everyone's trade, tariffs capped near zero (mutex: capital doctrine) |
| `econ_energy_arbitrage` **(BRIDGE)** | The Power Bourse | economy | 2 | phys_grid_storage, econ_commodity_exchanges | Banked energy listed as a spot commodity: arbitrage, embargoes, exported hostages |
| `econ_galactic_clearing` | Reserve Currency Clearing | economy | 3 | econ_interstellar_banking, econ_automated_markets, comm_quantum_secure | Voluntary clearing network with a financial-sanction weapon that depletes itself with use |
| `econ_debt_leverage` | Sovereign Leverage | economy | 3 | econ_dev_finance, esp_predictive_intel | Loan calls with concession menus: collateral seizure, charter rights, imposed austerity |
| `econ_market_warfare` | Coordinated Market Warfare | economy | 3 | econ_futures_markets, econ_automated_markets, comm_infowar_suite | Deniable market raids injecting collapse pressure into a rival's economic regions |
| `econ_stellar_securities` | Stellar Securitization | economy | 4 | econ_galactic_clearing, econ_futures_markets, mega_orbital_habitats | Perpetual output shares finance megastructures; you sell pieces of your own star |
| `econ_futarchy` | The Futarchic Mandate | economy | 4 | econ_futures_markets, econ_automated_markets, comp_autonomous_administration | Decision markets govern ceded policy domains at zero political capital (mutex: market endstate) |
| `econ_commons_transition` | The Great Decommodification | economy | 4 | econ_dev_finance, mat_molecular_manufacturing, phys_fusion_power | Staged, irreversible decommodification of essentials; the economic weapons suite retired both ways (mutex: market endstate) |

## Military & Espionage (17 + 2 bridge)

| Id | Name | Domain | Tier | Prerequisites | Mechanic |
|---|---|---|---|---|---|
| `mil_command_networks` | Integrated Command Networks | military | 1 | comm_deep_space_network | Theater command with shared standing directives; the nexus is a decapitation target |
| `mil_expeditionary_logistics` | Expeditionary Logistics | military | 1 | space_orbital_logistics, mil_command_networks | Forward depots projecting supply radii; supply lines as visible, raidable objects |
| `esp_sigint` | Signals Intelligence Apparatus | espionage | 1 | comm_deep_space_network | Listening arrays: passive intel income, raised fleet IntelLevel, traffic-analysis warnings |
| `mil_orbital_strike` | Precision Orbital Strike Doctrine | military | 2 | mil_command_networks, space_orbital_logistics | District-targeted bombardment with probabilistic collateral and its political price |
| `mil_mass_mobilization` | Mass Mobilization Doctrine | military | 2 | mil_command_networks, soc_digital_governance | Conscription dial: numerous brittle formations, absorbed unemployment, demobilization crises (mutex: force identity) |
| `mil_elite_precision` | Elite Precision Forces | military | 2 | mil_command_networks, esp_sigint | Raised stance-prediction payoff and persistent veterancy; loss-intolerant by design (mutex: force identity) |
| `esp_predictive_intel` | Predictive Intelligence Fusion | espionage | 2 | esp_sigint, comp_predictive_systems | Probabilistic warnings of categories of queued rival orders before they execute |
| `esp_resident_networks` | Resident Networks | espionage | 2 | esp_sigint, econ_interstellar_banking | Maturing residencies carry op risk instead of the ops; burning one unwinds everything |
| `mil_fortress_doctrine` **(BRIDGE)** | Deep Redoubt Doctrine | military | 2 | plan_subterranean_engineering, mil_command_networks | Redoubt complexes keep a world governing and fighting after losing its sky (introduces the siege order lockout) |
| `mil_autonomous_warfare` | Autonomous Warfare Systems | military | 3 | comp_machine_intelligence, mil_command_networks | Per-fleet engagement authority (gated/bounded/weapons-free) with escalation incidents you own |
| `mil_spectral_warfare` | Spectral Warfare | military | 3 | phys_directed_energy, esp_sigint | EW suites degrade enemy IntelLevel, project ghost fleets; grid-fed defense cannon |
| `mil_adaptive_screens` | Adaptive Screen Systems | military | 3 | mat_advanced_composites, mat_orbital_industry | Pre-battle defensive profiles that consume intelligence — and punish poisoned intel |
| `esp_synthetic_identities` | Synthetic Identities | espionage | 3 | esp_resident_networks, comp_machine_intelligence | Fabricated legal persons decouple op failure from attribution; impersonation op class |
| `esp_counterintel_lattice` | Counterintelligence Lattice | espionage | 3 | esp_predictive_intel, comm_quantum_secure | Standing detection plus the double-cross: turn discovered assets and script their reporting |
| `mil_kinetic_interdiction` **(BRIDGE)** | Orbit Denial Batteries | military | 3 | infra_mass_driver, mil_orbital_strike | Standing interdiction envelope: orbit over a defended world must be won against the surface |
| `mil_sovereign_warmachine` | Sovereign War Machine | military | 4 | mil_autonomous_warfare, comp_autonomous_administration | Objectives in, campaigns out; ending a war requires machine concurrence (mutex: command sovereignty) |
| `mil_covenant_of_command` | Covenant of Command | military | 4 | mil_autonomous_warfare, soc_federal_autonomy | Attested human veto gates; the Autonomous Weapons Convention as a diplomatic weapon (mutex: command sovereignty) |
| `esp_consensus_engineering` | Consensus Engineering | espionage | 4 | esp_synthetic_identities, comm_infowar_suite | Reality campaigns shift a population's belief state independently of ground truth |
| `mil_antimatter_deterrence` | Antimatter Deterrence Architecture | military | 4 | phys_antimatter, mil_orbital_strike, space_deep_navigation | Survivable postures (ambiguous/assured/extended) on the shared deterrence layer, plus release delegation |

## Emergent Technologies — systems.md (12 techs + 3 catalog reveals)

Conduct-triggered: hidden until the History Ledger trigger fires, then revealed as a crash program at 50% cost. Standalone `emg_` techs auto-complete at zero cost once the trigger metric reaches twice its threshold; catalog reveals instead deepen to a 75% discount, never auto-grant, and never bypass mutex locks.

| Id | Name | Domain | Tier | Prerequisites / Trigger | Mechanic |
|---|---|---|---|---|---|
| `emg_tribute_doctrine` **(EMERGENT)** | Hegemonic Extraction Doctrine | economy | 2 | econ_interstellar_banking — trigger: 2+ vassals AND 40-tick tribute streak | Administered tribute: raised yields, in-kind demands (ships, manpower, intelligence) |
| `emg_distributed_defense` **(EMERGENT)** | Distributed Planetary Defense Doctrine | military | 2 | mil_command_networks — trigger: 3+ wars declared on you AND 5+ defensive battles won | Civil-defense grids auto-raise militia on invasion (mutex `mil_legitimacy_path` with Scorched Sky) |
| `emg_salvage_doctrine` **(EMERGENT)** | Battlefield Salvage Doctrine | military | 2 | mil_command_networks, econ_commodity_exchanges — trigger: 8+ home battles AND 500+ enemy power destroyed | Doubled wreckage-fragment fidelity plus capture refits of surrendered hulls |
| `emg_blockade_running` **(EMERGENT)** | Blockade-Running Logistics | infrastructure | 2 | infra_logistics_network — trigger: 30-tick sanctioned streak with ≥50% trade maintained | Sanctioned routes auto-reroute via deep space; grey harbors and a smuggler market |
| `emg_coup_proofing` **(EMERGENT)** | Coup-Proofing Statecraft | espionage | 2 | esp_sigint, soc_digital_governance — trigger: 1 coup survived OR 3 officer-loyalty crises | Internal Security Directorate: coup floor drops, command coordination pays for it |
| `emg_grey_concordat` **(EMERGENT)** | Grey Market Concordat | espionage | 2 | esp_sigint, econ_commodity_exchanges — trigger: 10+ raids suffered AND pirate den adjacent AND shadow-economy node active | Pirate accords redirect raids, open a black market, and feed corridor intelligence |
| `emg_financial_clearing` **(EMERGENT, catalog reveal)** | Interstellar Financial Clearing | economy | 3 | trigger: 10+ active routes AND 500k lifetime volume AND 3+ partners | Reveals `econ_galactic_clearing` at crash pricing, `econ_automated_markets` prerequisite waived |
| `emg_divergent_species` **(EMERGENT, catalog reveal)** | Divergent Species Adaptation | infrastructure | 3 | trigger: 5+ adapted colonies AND 3+ adapted biomes | Reveals `bio_pantropy` at crash pricing (drives prerequisite eased); retained adapted-yield modifier |
| `emg_imperial_federalism` **(EMERGENT)** | Reconstruction Federalism | diplomacy | 3 | soc_federal_autonomy — trigger: 3+ secession crises OR 1 civil war survived, AND ≥8 systems | Amnesty compacts: extend autonomy compacts to defeated rebels and fresh conquests |
| `emg_narrative_engineering` **(EMERGENT)** | Narrative Engineering | espionage | 3 | esp_resident_networks, comm_mass_media — trigger: 12+ press manipulation ops AND 2+ press crises won | Cultivated-audience assets on target worlds: compounding campaign discounts, burnable by rivals |
| `emg_exodus_shipcraft` **(EMERGENT)** | Exodus Shipcraft | infrastructure | 3 | infra_automated_ports, mil_expeditionary_logistics — trigger: 3+ planets lost to conquest AND 100k+ evacuated | Arkship throughput on `EVAC_POPULATION` without an elevator; evacuations preserve tech as blueprints |
| `emg_scorched_sky` **(EMERGENT)** | Scorched Sky Protocols | military | 3 | mil_orbital_strike — trigger: 5+ bombardments AND civilian-damage threshold | Terror bombardment forcing early surrender checks, signed per strike (mutex `mil_legitimacy_path`) |
| `emg_corporate_statecraft` **(EMERGENT)** | Corporate Statecraft | economy | 3 | econ_interstellar_banking, econ_public_charters — trigger: 3+ charters AND corporate revenue share ≥25% sustained 20 ticks | Corps hold territory, sign pacts, and receive war powers — deniable force projection |
| `emg_panopticon_state` **(EMERGENT)** | The Counterintelligence State | espionage | 3 | esp_predictive_intel — trigger: 10+ ops detected against you AND 3+ counterintel wins | Empire-wide foreign-agent flagging and exposure bonuses — never turned on citizens |
| `emg_machine_polity` **(EMERGENT, catalog reveal)** | Machine Political Agency | diplomacy | 4 | trigger: automation index ≥0.6 AND 4+ automated-majority colonies | Reveals `comp_synthetic_minds` (or `comp_machine_polity` if held) at crash pricing, no prerequisites waived; suppressed under the Covenant into a bounded-minds petition crisis |
