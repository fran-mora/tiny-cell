// The living world, by scale. Each evolution is roughly a x10 jump in size: creatures of your own
// scale fill the predator and prey roles, the previous scale shrinks into easy prey, and anything
// two scales down is too small to see (it is simply not spawned).
//
// tier: 1 microbial (single cell) · 2 colony (0.1–1 mm) · 3 first animals (mm) · 4 reef (cm) · 5 sea (10 cm+)
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
  jellyfish: { tier: 4, maxTier: 5, ai: 'jelly', size: [1.1, 1.6], spd: 26, xp: 2.5, hostile: true, sting: [10, 2.5], pcol: [255, 170, 230], name: 'Jellyfish', role: 'predator',
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
