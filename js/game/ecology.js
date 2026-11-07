// The living world, by scale. Each evolution is roughly a x10 jump in size: creatures of your own
// scale fill the predator and prey roles, the previous scale shrinks into easy prey, and anything
// two scales down is too small to see (it is simply not spawned).
//
// tier: 1 microbial (single cell) · 2 colony (0.1–1 mm) · 3 first animals (mm) · 4 reef (cm) · 5 sea (10 cm+)
//       · 6 pufferfish (0.5–3 m) · 7 sailfish (1–4 m) · 8 ocean sunfish (2–5 m) · 9 great white (4–8 m)
//       · 10 whale shark (10–20 m): a filter feeder, it can only swallow small things (filter: plankton clouds)
// ai:   behaviour used in game.js (updateEnts)
// size: radius range as a multiple of the level's reference size
// spd:  base speed · xp: biomass per unit radius · bite: [base, per habitat level] contact damage
// hostile: counts as a predator (hunts you, scales with the level) · inedible: can never be swallowed
// cap: most of this kind a level will ever hold (ambushers get unfair in crowds)
export const TIER_SHRINK = 0.32;

export const SPECIES = {
  // ---------------- T1: microbial ----------------
  drifter: { tier: 1, ai: 'drifter', size: [0.3, 0.42], spd: 55, xp: 2.5, pcol: [255, 220, 120], name: 'Drifter', role: 'prey',
    desc: 'A tiny, skittish bacterium that drifts with the plankton. It darts away when you get close.' },
  grazer: { tier: 1, ai: 'grazer', size: [0.62, 1.3], spd: 42, xp: 2.2, pcol: [110, 190, 255], name: 'Grazer', role: 'neutral',
    desc: 'A placid cell that browses glucose motes. Prey when you are bigger, a threat when you are not.' },
  diatom: { tier: 1, ai: 'diatom', size: [0.6, 1.0], spd: 14, xp: 4.5, pcol: [255, 220, 150], name: 'Diatom', role: 'prey',
    desc: 'Wrapped in a shell of living glass. Ram it to crack it open; the soft cell inside is a feast.' },
  ciliate: { tier: 1, ai: 'ciliate', size: [0.45, 0.62], spd: 85, xp: 2.6, pcol: [140, 255, 190], name: 'Ciliate', role: 'prey',
    desc: 'A fast, slipper-shaped swimmer covered in beating hairs, like Paramecium.' },
  hunter: { tier: 1, ai: 'hunter', size: [0.85, 1.6], spd: 92, xp: 3, hostile: true, bite: [9, 3.5], pcol: [255, 80, 100], name: 'Hunter', role: 'predator',
    desc: 'A spiny predatory ciliate, like Didinium, which harpoons its prey with toxic darts. Outgrow it, then eat it.' },
  amoeba: { tier: 1, ai: 'amoeba', size: [2.0, 2.8], spd: 30, xp: 2.6, hostile: true, engulf: [16, 3], pcol: [255, 160, 90], name: 'Amoeba', role: 'predator',
    desc: 'A slow, enormous engulfer. Its pseudopods flow around prey and dissolve it.' },
  phage: { tier: 1, ai: 'phage', size: [0.22, 0.28], spd: 155, xp: 0.6, hostile: true, latch: { drain: 2.4 }, pcol: [200, 150, 255], name: 'Phage', role: 'predator',
    desc: 'A virus that travels in swarms. It latches on and drains you until you dash or wiggle free.' },
  mine: { tier: 1, maxTier: 2, ai: 'mine', size: [0.5, 0.65], spd: 8, xp: 0.5, hostile: true, inedible: true, pcol: [255, 180, 90], name: 'Spore Puff', role: 'hazard',
    desc: 'A fungal sporangium that swells and bursts when anything comes close. Toxins pop it from a safe distance.' },

  // ---------------- T2: colony scale ----------------
  rotifer: { tier: 2, ai: 'rotifer', size: [0.9, 1.35], spd: 88, xp: 3, hostile: true, bite: [9, 3], pcol: [255, 190, 110], name: 'Rotifer', role: 'predator',
    desc: 'One of the smallest animals: its spinning crown of cilia makes a whirlpool that sucks in food (and careless cells).' },
  volvox: { tier: 2, ai: 'volvox', size: [1.5, 1.9], spd: 12, xp: 1.4, pcol: [120, 240, 130], name: 'Volvox', role: 'neutral',
    desc: 'A great green colony of cells. Bump it and it bursts into edible daughter colonies.' },
  nauplius: { tier: 2, ai: 'jumper', size: [0.45, 0.7], spd: 60, xp: 3, pcol: [255, 200, 140], name: 'Nauplius', role: 'prey',
    desc: 'A copepod larva with one red eye. It swims in jerky strokes of its three pairs of legs.' },
  hydra: { tier: 2, maxTier: 3, ai: 'anchored', size: [0.9, 1.3], spd: 0, xp: 3.2, hostile: true, sting: [7, 2], pcol: [190, 240, 200], name: 'Hydra', role: 'predator',
    desc: 'An anchored polyp whose tentacles are loaded with stinging cells. It cannot chase you, but do not swim within reach.' },
  tardigrade: { tier: 2, ai: 'tough', size: [0.9, 1.3], spd: 42, xp: 4, hostile: true, armor: 0.45, bite: [10, 3], pcol: [230, 200, 160], name: 'Tardigrade', role: 'predator',
    desc: 'A water bear: slow, almost indestructible, and it bites with sharp mouth stylets.' },
  heliozoan: { tier: 2, ai: 'trap', size: [0.8, 1.15], spd: 10, xp: 2.8, trap: [4, 1], pcol: [255, 235, 160], name: 'Sun-animalcule', role: 'hazard',
    desc: 'A heliozoan: a cell with a sun of sticky spines. Anything that touches them gets stuck and slowly digested.' },
  chytrid: { tier: 2, ai: 'phage', size: [0.2, 0.26], spd: 150, xp: 0.6, hostile: true, latch: { drain: 3 }, pcol: [210, 230, 160], name: 'Chytrid Spore', role: 'predator',
    desc: 'A swimming fungal spore. Swarms of them latch on and feed until you wiggle or dash free.' },

  // ---------------- T3: first animals ----------------
  copepod: { tier: 3, ai: 'jumper', size: [0.55, 0.85], spd: 70, xp: 3.2, jump: 1, pcol: [255, 170, 120], name: 'Copepod', role: 'prey',
    desc: 'The most numerous animal in the sea. Its long antennae feel you coming and it escapes in lightning jumps.' },
  arrowworm: { tier: 3, ai: 'lurker', cap: 6, size: [0.95, 1.5], spd: 60, xp: 3.5, hostile: true, camo: true, bite: [12, 3.5], pcol: [200, 230, 255], name: 'Arrow Worm', role: 'predator',
    desc: 'A glassy ambush predator. It hangs nearly invisible, then darts with its grasping spines open. Dodge sideways.' },
  combjelly: { tier: 3, ai: 'amoeba', size: [1.4, 2.0], spd: 36, xp: 3, hostile: true, engulf: [14, 3], pcol: [200, 230, 255], name: 'Comb Jelly', role: 'predator',
    desc: 'A ctenophore: eight rows of shimmering combs carry it gently forward while its sticky tentacles fish for prey.' },
  ostracod: { tier: 3, ai: 'glowbomb', size: [0.5, 0.75], spd: 50, xp: 4, pcol: [120, 190, 255], name: 'Seed Shrimp', role: 'prey',
    desc: 'An ostracod. When attacked it bursts into a blue glow that attracts bigger predators to whoever is eating it.' },

  // ---------------- T4: reef scale ----------------
  krill: { tier: 4, ai: 'swarm', size: [0.32, 0.45], spd: 70, xp: 2.8, pcol: [255, 170, 150], name: 'Krill', role: 'prey',
    desc: 'Tiny shrimp that swarm by the thousand, glowing blue. Food for almost everything in the sea.' },
  larvalfish: { tier: 4, ai: 'school', size: [0.55, 0.8], spd: 85, xp: 3.2, pcol: [210, 230, 255], name: 'Larval Fish', role: 'prey',
    desc: 'Glassy baby fish with huge eyes. They school together and scatter when you charge.' },
  jellyfish: { tier: 4, maxTier: 7, ai: 'jelly', size: [1.1, 1.6], spd: 26, xp: 2.5, hostile: true, sting: [10, 2.5], pcol: [255, 170, 230], name: 'Jellyfish', role: 'predator',
    desc: 'A pulsing medusa. Its bell is harmless; its long trailing tentacles are not.' },
  pistolshrimp: { tier: 4, ai: 'spitter', size: [0.8, 1.1], spd: 40, xp: 3.5, hostile: true, bite: [6, 2], pcol: [255, 140, 110], name: 'Pistol Shrimp', role: 'predator',
    desc: 'It snaps its giant claw so fast it fires a bubble shock wave, one of the loudest sounds in the sea.' },
  anemone: { tier: 4, ai: 'anchored', size: [1.0, 1.5], spd: 0, xp: 3, hostile: true, sting: [9, 2.5], pcol: [255, 130, 160], name: 'Sea Anemone', role: 'predator',
    desc: 'A flower-like animal glued to the reef. Its waving tentacles sting anything that brushes past.' },
  siphonophore: { tier: 4, maxTier: 5, ai: 'siphonophore', size: [0.6, 0.75], spd: 26, xp: 3, hostile: true, pcol: [255, 120, 220], name: 'Siphonophore', role: 'predator',
    desc: 'A drifting chain of glassy bells, each a different specialised animal, trailing stinging tentacles.' },

  // ---------------- T5: sea scale ----------------
  sardine: { tier: 5, ai: 'school', size: [0.55, 0.8], spd: 100, xp: 3.2, pcol: [200, 225, 240], name: 'Sardine', role: 'prey',
    desc: 'Silver schooling fish. A school turns as one to confuse predators.' },
  squid: { tier: 4, maxTier: 5, ai: 'inker', size: [0.9, 1.4], spd: 80, xp: 3.6, hostile: true, bite: [10, 3], pcol: [255, 170, 150], name: 'Squid', role: 'predator',
    desc: 'Fast and clever. Smaller squid vanish behind a cloud of ink; bigger ones grab with two long tentacles.' },
  barracuda: { tier: 5, ai: 'sprinter', size: [1.0, 1.5], spd: 95, xp: 3.6, hostile: true, bite: [12, 4], pcol: [210, 225, 235], name: 'Barracuda', role: 'predator',
    desc: 'A long silver hunter that cruises slowly, then sprints with fang-filled jaws.' },
  moray: { tier: 5, ai: 'den', cap: 4, size: [0.95, 1.3], spd: 70, xp: 4, hostile: true, bite: [11, 3], pcol: [200, 190, 110], name: 'Moray Eel', role: 'predator',
    desc: 'It waits in a rocky den and lunges out at anything that swims too close.' },
  cookiecutter: { tier: 5, ai: 'phage', size: [0.42, 0.55], spd: 130, xp: 2, hostile: true, latch: { drain: 6, bite: [8, 2] }, pcol: [120, 230, 200], name: 'Cookie-cutter Shark', role: 'predator',
    desc: 'A small glowing shark that latches on with sucker lips and spins to cut out a round bite.' },
  angler: { tier: 5, ai: 'angler', cap: 5, size: [1.2, 1.7], spd: 22, xp: 4.5, hostile: true, bite: [18, 4], pcol: [140, 220, 255], name: 'Anglerfish', role: 'predator',
    desc: 'In the dark, her glowing lure looks like a meal. Get close to the light and the jaws snap shut.' },

  // ---------------- T6: pufferfish scale (0.5–3 m) ----------------
  parrotfish: { tier: 6, ai: 'grazer', size: [0.9, 1.3], spd: 62, xp: 3, pcol: [110, 220, 200], name: 'Parrotfish', role: 'neutral',
    desc: 'It bites chunks off the coral with a parrot-like beak and grinds them into sand. Much of the white sand on tropical beaches came out of a parrotfish.' },
  seaurchin: { tier: 6, ai: 'diatom', shell: 3, spiny: [9, 2], size: [0.6, 0.85], spd: 10, xp: 4.5, pcol: [170, 110, 220], name: 'Sea Urchin', role: 'prey',
    desc: 'A ball of needle-sharp spines. Ram it to snap them off, or crack it straight open with a beak, as pufferfish and triggerfish do.' },
  triggerfish: { tier: 6, ai: 'hunter', size: [0.9, 1.35], spd: 86, xp: 3.5, hostile: true, bite: [12, 3.5], pcol: [170, 180, 120], name: 'Titan Triggerfish', role: 'predator',
    desc: 'A grumpy reef fish with shell-cracking teeth. It guards its patch of sand fiercely; divers fear its bite.' },
  lionfish: { tier: 6, ai: 'tough', size: [0.85, 1.25], spd: 48, xp: 3.6, hostile: true, armor: 0.25, bite: [11, 3], pcol: [255, 140, 120], name: 'Lionfish', role: 'predator',
    desc: 'Striped red and white, with fan-like fins and venomous spines. It corners prey with its fins spread wide, then gulps.' },
  octopus: { tier: 6, ai: 'inker', size: [0.9, 1.35], spd: 78, xp: 3.8, hostile: true, bite: [11, 3], pcol: [230, 140, 110], name: 'Day Octopus', role: 'predator',
    desc: 'Eight arms, three hearts and skin that changes colour in a blink. It grabs with its suckers and escapes in a cloud of ink.' },
  reefshark: { tier: 6, ai: 'sprinter', size: [1.05, 1.5], spd: 96, xp: 3.8, hostile: true, bite: [14, 4], pcol: [170, 190, 205], name: 'Blacktip Reef Shark', role: 'predator',
    desc: 'A small shark with black-tipped fins that patrols the reef edge, then rushes in.' },
  seasnake: { tier: 6, ai: 'hunter', size: [0.8, 1.15], spd: 92, xp: 3.4, hostile: true, bite: [13, 3], pcol: [200, 215, 235], name: 'Banded Sea Krait', role: 'predator',
    desc: 'A venomous sea snake with a paddle-shaped tail. It hunts eels in the reef, and has to surface to breathe.' },
  seaturtle: { tier: 6, ai: 'volvox', size: [1.7, 2.2], spd: 30, xp: 2.5, inedible: true, pcol: [150, 200, 140], name: 'Green Sea Turtle', role: 'neutral',
    desc: 'A gentle grazer that can live for 80 years. Far too big and armoured to eat; it just shoulders you aside.' },
  humboldt: { tier: 6, ai: 'inker', size: [0.9, 1.3], spd: 98, xp: 3.6, hostile: true, bite: [12, 3.5], pcol: [255, 110, 100], name: 'Humboldt Squid', role: 'predator',
    desc: 'The jumbo squid of the cold Pacific. Packs hunt together, talking in flickers of red and white across their skin.' },

  // ---------------- T7: sailfish scale (1–4 m), the open blue ----------------
  flyingfish: { tier: 7, ai: 'school', size: [0.5, 0.7], spd: 120, xp: 3, pcol: [150, 200, 255], name: 'Flying Fish', role: 'prey',
    desc: 'It escapes hunters by bursting out of the water and gliding on wing-like fins, sometimes for over 100 metres.' },
  tuna: { tier: 7, ai: 'school', size: [0.8, 1.1], spd: 116, xp: 3.4, pcol: [200, 215, 235], name: 'Yellowfin Tuna', role: 'prey',
    desc: 'A torpedo of muscle with yellow finlets. Tuna never stop swimming: they breathe by ramming water through their gills.' },
  mahimahi: { tier: 7, ai: 'ciliate', size: [0.8, 1.1], spd: 112, xp: 3.4, pcol: [120, 230, 140], name: 'Mahi-mahi', role: 'prey',
    desc: 'A blunt-headed fish of dazzling green and gold that fades to grey the moment it dies.' },
  dolphin: { tier: 7, ai: 'sprinter', size: [1.0, 1.4], spd: 106, xp: 3.6, hostile: true, bite: [13, 4], pcol: [170, 185, 205], name: 'Common Dolphin', role: 'predator',
    desc: 'Pods of dolphins herd fish into tight balls and take turns charging through them. Not a fish: it breathes air.' },
  manowar: { tier: 7, ai: 'jelly', size: [0.7, 1.0], spd: 18, xp: 2.4, hostile: true, sting: [12, 3], pcol: [170, 140, 255], name: 'Portuguese Man o\' War', role: 'hazard',
    desc: 'Not one animal but a colony, sailing on a gas-filled float. Its tentacles trail for tens of metres and sting horribly.' },
  hammerhead: { tier: 7, ai: 'hunter', size: [1.0, 1.45], spd: 90, xp: 3.8, hostile: true, bite: [14, 4], pcol: [165, 180, 190], name: 'Scalloped Hammerhead', role: 'predator',
    desc: 'Its wide hammer-shaped head spreads its eyes and electric sensors apart, so it can sweep the water like a metal detector.' },
  marlin: { tier: 7, ai: 'sprinter', size: [1.1, 1.5], spd: 110, xp: 3.8, hostile: true, bite: [15, 4.5], pcol: [70, 120, 220], name: 'Blue Marlin', role: 'predator',
    desc: 'A huge billfish, cousin of the sailfish, with a spear-like bill and a tall crescent tail. It lights up with blue stripes when it hunts.' },

  // ---------------- T8: ocean sunfish scale (2–5 m) ----------------
  salp: { tier: 8, ai: 'volvox', size: [0.7, 1.0], spd: 22, xp: 3, pcol: [190, 235, 255], name: 'Salp Chain', role: 'prey',
    desc: 'Glassy barrel-shaped animals linked into chains metres long. They pump water through their bodies to swim and feed.' },
  pyrosome: { tier: 8, ai: 'volvox', size: [0.6, 0.9], spd: 16, xp: 3.2, pcol: [150, 230, 255], name: 'Pyrosome', role: 'prey',
    desc: 'A hollow tube made of thousands of tiny animals. Touch it and it glows: its name means fire-body.' },
  nomura: { tier: 8, ai: 'jelly', size: [1.0, 1.4], spd: 20, xp: 3.4, hostile: true, sting: [14, 3.5], pcol: [255, 200, 170], name: 'Nomura\'s Jellyfish', role: 'predator',
    desc: 'One of the biggest jellyfish in the world, two metres across and heavier than a person. Sunfish eat jellies like this.' },
  leatherback: { tier: 8, ai: 'volvox', size: [1.6, 2.0], spd: 30, xp: 2.5, inedible: true, pcol: [120, 140, 150], name: 'Leatherback Turtle', role: 'neutral',
    desc: 'The biggest turtle alive, with a leathery shell instead of a hard one. It crosses whole oceans eating jellyfish.' },
  blueshark: { tier: 8, ai: 'hunter', size: [1.0, 1.4], spd: 92, xp: 3.6, hostile: true, bite: [14, 4], pcol: [80, 130, 220], name: 'Blue Shark', role: 'predator',
    desc: 'A slender, deep-blue shark with long pectoral fins that roams entire oceans.' },
  sealion: { tier: 8, ai: 'sprinter', size: [0.9, 1.25], spd: 108, xp: 3.6, hostile: true, bite: [13, 4], pcol: [170, 130, 90], name: 'California Sea Lion', role: 'predator',
    desc: 'Fast, clever and playful. Young sea lions bite the fins off sunfish and toss them about like frisbees.' },

  // ---------------- T9: great white scale (4–8 m) ----------------
  furseal: { tier: 9, ai: 'ciliate', size: [0.6, 0.85], spd: 115, xp: 3.6, pcol: [150, 120, 90], name: 'Cape Fur Seal', role: 'prey',
    desc: 'Quick and twisty. Seals cross the danger zone around their island in groups, zigzagging to dodge sharks from below.' },
  elephantseal: { tier: 9, ai: 'volvox', size: [1.0, 1.35], spd: 34, xp: 3.4, pcol: [140, 120, 100], name: 'Elephant Seal', role: 'neutral',
    desc: 'A four-tonne seal with a floppy trunk of a nose. It dives deeper than a kilometre to hunt.' },
  mako: { tier: 9, ai: 'sprinter', size: [0.95, 1.3], spd: 120, xp: 3.8, hostile: true, bite: [15, 4.5], pcol: [80, 110, 200], name: 'Shortfin Mako', role: 'predator',
    desc: 'The fastest shark, with bursts near 70 km/h, and it can leap clear out of the water.' },
  bronzewhaler: { tier: 9, ai: 'hunter', size: [1.0, 1.4], spd: 92, xp: 3.8, hostile: true, bite: [15, 4], pcol: [170, 150, 110], name: 'Bronze Whaler', role: 'predator',
    desc: 'A coppery shark that hunts in loose packs around sardine shoals.' },
  sixgill: { tier: 9, ai: 'lurker', cap: 4, size: [1.1, 1.5], spd: 70, xp: 4, hostile: true, camo: true, bite: [16, 4.5], pcol: [110, 120, 110], name: 'Bluntnose Sixgill', role: 'predator',
    desc: 'An ancient deep-water shark with six gill slits and glowing green eyes. It lurks in the dark and lunges.' },
  manta: { tier: 9, maxTier: 10, ai: 'volvox', size: [1.6, 2.1], spd: 34, xp: 2.5, inedible: true, pcol: [60, 70, 90], name: 'Giant Manta Ray', role: 'neutral',
    desc: 'Seven metres from wingtip to wingtip, with the biggest brain of any fish. It flies through the water eating plankton.' },

  // ---------------- T10: whale shark scale (10–20 m) ----------------
  krillcloud: { tier: 10, ai: 'volvox', filter: true, size: [0.8, 1.3], spd: 12, xp: 3.4, pcol: [255, 180, 150], name: 'Krill Swarm', role: 'prey',
    desc: 'Billions of krill in one glowing cloud. To a whale shark, a swarm is a mouthful.' },
  baitball: { tier: 10, ai: 'ciliate', filter: true, size: [0.6, 0.9], spd: 60, xp: 3.6, pcol: [200, 225, 240], name: 'Bait Ball', role: 'prey',
    desc: 'A shoal of sardines packed into a swirling ball, the fish fighting to get to the middle.' },
  eggcloud: { tier: 10, ai: 'volvox', filter: true, size: [0.7, 1.1], spd: 10, xp: 3.8, pcol: [255, 170, 190], name: 'Coral Spawn', role: 'prey',
    desc: 'Once a year the corals of Ningaloo all spawn on the same night, filling the sea with pink egg bundles. Whale sharks come to feast.' },
  orca: { tier: 10, ai: 'sprinter', pack: true, size: [0.55, 0.75], spd: 115, xp: 3, hostile: true, inedible: true, bite: [18, 5], pcol: [30, 30, 40], name: 'Orca', role: 'predator',
    desc: 'The top predator of the sea. Pods of orcas hunt sharks, seals and whales together, and are smaller than a whale shark but far more dangerous.' },
  whitetip: { tier: 10, ai: 'hunter', size: [0.45, 0.6], spd: 95, xp: 3, hostile: true, inedible: true, bite: [14, 4], pcol: [150, 140, 120], name: 'Oceanic Whitetip', role: 'predator',
    desc: 'A bold, white-tipped shark of the open ocean that follows whale sharks and ships looking for scraps.' },
  bluewhale: { tier: 10, ai: 'volvox', size: [3.0, 3.6], spd: 30, xp: 1, inedible: true, pcol: [110, 140, 170], name: 'Blue Whale', role: 'neutral',
    desc: 'The biggest animal that has ever lived: thirty metres long, with a heart the size of a small car. Even a whale shark looks small beside it.' },
};

// legacy kinds from earlier builds (still understood if an old level spawns them)
SPECIES.lurker = { ...SPECIES.arrowworm, tier: 3, name: 'Lurker' };
SPECIES.spitter = { ...SPECIES.pistolshrimp, tier: 4, name: 'Spitter' };

export const SP = SPECIES;
export const isHostile = (kind) => !!(SPECIES[kind] && SPECIES[kind].hostile);

// size factor for a creature of `kind` seen by a player at body stage `stage`: 1 at its own scale,
// TIER_SHRINK one scale down, 0 (not spawned) two scales down or anything bigger than you yet.
export function tierScale(kind, stage) {
  const S = SPECIES[kind]; if (!S) return 1;
  const st = stage | 0 || 1;
  if (S.tier > st) return 0;
  const top = Math.max(S.tier, S.maxTier || S.tier);
  if (st <= top) return 1;
  return st - top === 1 ? TIER_SHRINK : 0;
}
