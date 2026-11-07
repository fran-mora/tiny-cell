import { SPECIES } from './ecology.js';
// Microbe mode — static game data: bestiary, mutations, genome upgrades, depths, palettes, formulas.

export const MICROBE_SPECIES = [
  { id: 'drifter', name: 'Drifter', firstEra: 1, role: 'prey',
    desc: 'A tiny, skittish bacterium that drifts with the plankton. It darts away when you get close.' },
  { id: 'grazer', name: 'Grazer', firstEra: 1, role: 'neutral',
    desc: 'A placid cell that browses glucose motes. Prey when you are bigger, a threat when you are not.' },
  { id: 'diatom', name: 'Diatom', firstEra: 1, role: 'prey',
    desc: 'Wrapped in a shell of living glass. Ram it to crack it open; the soft cell inside is a feast.' },
  { id: 'hunter', name: 'Hunter', firstEra: 1, role: 'predator',
    desc: 'A spiny red predator that chases anything smaller than itself. Outgrow it, then eat it.' },
  { id: 'phage', name: 'Phage', firstEra: 1, role: 'predator',
    desc: 'A virus that travels in swarms. It latches on and drains you until you dash or wiggle free.' },
  { id: 'amoeba', name: 'Amoeba', firstEra: 1, role: 'predator',
    desc: 'A slow, enormous engulfer. Its embrace dissolves whatever stays inside it.' },
  { id: 'siphonophore', name: 'Siphonophore', firstEra: 1, role: 'predator',
    desc: 'A drifting chain of glassy bells trailing stinging tentacles. Found from depth 3.' },
  { id: 'ciliate', name: 'Ciliate', firstEra: 3, role: 'prey',
    desc: 'A fast, slipper-shaped swimmer covered in beating hairs. Appears once the oceans grow richer.' },
  { id: 'rotifer', name: 'Rotifer', firstEra: 4, role: 'predator',
    desc: 'A tiny animal whose spinning crown sucks in food (and careless cells).' },
  { id: 'volvox', name: 'Volvox', firstEra: 5, role: 'neutral',
    desc: 'A great green colony of cells. Bump it and it bursts into edible daughter colonies.' },
  { id: 'mine', name: 'Spore Puff', firstEra: 1, role: 'hazard',
    desc: 'A fungal sporangium that swells and bursts when anything comes close. Toxins pop it from a safe distance.' },
  // every creature of the bigger scales (colony, first animals, reef, open sea)
  ...Object.entries(SPECIES).filter(([id, v]) => v.tier >= 2 && id !== 'lurker' && id !== 'spitter' && !['rotifer', 'volvox', 'siphonophore'].includes(id))
    .map(([id, v]) => ({ id, name: v.name, firstEra: 1, role: v.role, desc: v.desc })),
  // bosses
  { id: 'giantamoeba', name: 'Giant Amoeba', firstEra: 1, role: 'boss', desc: 'A giant amoeba as wide as a pinhead. Like all amoebas it shrinks from bright light. How to beat it: stand behind a sunbeam so its surge carries it into the light, then bite it while it burns.' },
  { id: 'virus', name: 'Giant Virus', firstEra: 1, role: 'boss', desc: 'A giant virus, bigger than many bacteria. It docks onto cells and turns them into factories for its swarms. How to beat it: bite its capsid while it injects, and eat infected cells before they burst.' },
  { id: 'titan', name: 'Volvox Titan', firstEra: 1, role: 'boss', desc: 'A rolling sphere of thousands of cells, too tough to bite, carrying its daughter colonies inside. How to beat it: eat the daughters it releases before they grow and roll home.' },
  { id: 'tyrant', name: 'Rotifer Tyrant', firstEra: 1, role: 'boss', desc: 'Its spinning crown of cilia drags everything towards its grinding jaws. How to beat it: when it inhales, hide behind a spore puff so it chokes on the spores.' },
  { id: 'beroe', name: 'Beroe', firstEra: 1, role: 'boss', desc: 'A comb jelly that hunts other comb jellies and swallows them whole with its enormous mouth. How to beat it: dodge its lunges and bite the comb rows along its sides.' },
  { id: 'pompeii', name: 'Pompeii Worm', firstEra: 1, role: 'boss', desc: 'One of the most heat-tolerant animals on Earth, living in tubes on scalding vent chimneys. How to beat it: come at its chimney from the side and bite its head when it peeks out.' },
  { id: 'cuttlefish', name: 'Giant Cuttlefish', firstEra: 1, role: 'boss', desc: 'A master of camouflage that flashes patterns across its skin and leaves ink decoys behind. How to beat it: dodge its tentacle strike, bite it, and find the real one by its eyes.' },
  { id: 'mantis', name: 'Peacock Mantis Shrimp', firstEra: 1, role: 'boss', desc: 'Its club strikes as fast as a bullet, boiling the water with the shock. How to beat it: make its punch miss, then bite while it re-cocks its clubs.' },
  { id: 'abyssal', name: 'Abyssal Anglerfish', firstEra: 1, role: 'boss', desc: 'Queen of the dark: a glowing lure, a huge mouth and needle teeth. How to beat it: eat a glowing seed shrimp in front of her eyes to blind her, then bite.' },
  { id: 'progenitor', name: 'The Progenitor', firstEra: 1, role: 'boss', desc: 'A siphonophore colony forty metres long: thousands of specialised animals acting as one. How to beat it: destroy the feeding polyps, then the swimming bells, then the core.' },
  { id: 'grouper', name: 'Goliath Grouper', firstEra: 1, role: 'boss', desc: 'A 2.5-metre grouper that lurks in wrecks and inhales its prey whole, sometimes small sharks. How to beat it: let it suck you in, then Inflate inside its mouth. It chokes, spits you out and is dazed: bite it then.' },
  { id: 'thresher', name: 'Thresher Shark', firstEra: 1, role: 'boss', desc: 'A shark whose tail is as long as its body. It herds fish, then lashes its tail over its head to stun the whole shoal. How to beat it: keep out of the arc in front of it, then bite or slash it while it is spent after a lash. Slashing it as it winds up staggers it.' },
  { id: 'swordfish', name: 'Broadbill Swordfish', firstEra: 1, role: 'boss', desc: 'A night hunter that heats its own eyes and brain to see in cold, dark water. How to beat it: follow its glowing eyes, dodge its charge and bite its side as it turns, or meet the charge with a Bill Slash to parry it.' },
  { id: 'squidpack', name: 'Humboldt Squid Pack', firstEra: 1, role: 'boss', desc: 'Jumbo squid that hunt in packs, talking in flickers of red and white. How to beat it: when they flush red they all attack at once. Inflate to spike them or Flash to scramble their signals, then bite the tired squid.' },
];
export const SPECIES_BY_ID = Object.fromEntries(MICROBE_SPECIES.map((s) => [s.id, s]));

const f1 = (n) => (Math.round(n * 10) / 10).toString();

// lv(level) => numeric description of the total effect at that level.
export const MUTATIONS = [
  { id: 'flagellum', name: 'Flagellum', rarity: 'common', maxLevel: 5, tags: ['speed'],
    desc: 'A whip-like tail. +12% top speed per level.', lv: (l) => `+${12 * l}% top speed` },
  { id: 'cilia', name: 'Cilia', rarity: 'common', maxLevel: 4, tags: ['speed', 'utility'],
    desc: 'A fringe of beating hairs. +25% acceleration and +15% pickup reach per level.', lv: (l) => `+${25 * l}% acceleration, +${15 * l}% reach` },
  { id: 'membrane', name: 'Thick Membrane', rarity: 'common', maxLevel: 5, tags: ['defense'],
    desc: 'A tougher outer layer. +25 max HP per level, healed on pick.', lv: (l) => `+${25 * l} max HP` },
  { id: 'spikes', name: 'Spikes', rarity: 'rare', maxLevel: 4, tags: ['offense', 'defense'],
    desc: 'Cells that touch you take damage. Phages are shredded on contact.', lv: (l) => `${10 * l} contact damage, phage-proof` },
  { id: 'toxin', name: 'Toxin Gland', rarity: 'rare', maxLevel: 4, tags: ['offense'],
    desc: 'Periodically vents a toxic cloud that hurts everything around you.', lv: (l) => `cloud every ${f1(5 - 0.7 * (l - 1))}s, ${8 + 6 * l} dmg/s` },
  { id: 'chloro', name: 'Chloroplasts', rarity: 'common', maxLevel: 3, tags: ['sustain'],
    desc: 'Photosynthesis. Light heals you and UV shafts can no longer burn you.', lv: (l) => `heal ${3 * l} HP/s in light, UV immune` },
  { id: 'mito', name: 'Mitochondria', rarity: 'common', maxLevel: 4, tags: ['sustain'],
    desc: 'Powerhouse organelles that slowly regenerate your membrane.', lv: (l) => `+${f1(0.5 * l)} HP/s regeneration` },
  { id: 'vacuole', name: 'Vacuole', rarity: 'common', maxLevel: 5, tags: ['growth'],
    desc: 'A storage sac. Every meal yields more biomass.', lv: (l) => `+${15 * l}% biomass per meal` },
  { id: 'pseudopod', name: 'Pseudopods', rarity: 'rare', maxLevel: 3, tags: ['growth', 'offense'],
    desc: 'Flowing arms that wrap around bigger prey.', lv: (l) => `engulf cells up to ${85 + 4 * l}% your size` },
  { id: 'biolum', name: 'Bioluminescence', rarity: 'common', maxLevel: 4, tags: ['growth', 'utility'],
    desc: 'Glow softly to lure glucose motes from afar.', lv: (l) => `+${40 * l}% mote magnet radius` },
  { id: 'symbionts', name: 'Symbionts', rarity: 'rare', maxLevel: 4, tags: ['offense', 'defense'],
    desc: 'Friendly bacteria orbit you, stinging enemies and blocking shards.', lv: (l) => `${l} orbiting symbiont${l > 1 ? 's' : ''}` },
  { id: 'fission', name: 'Binary Fission', rarity: 'epic', maxLevel: 2, tags: ['growth', 'ally'],
    desc: 'Bud off a small clone of yourself that gathers food for you.', lv: (l) => `${l} allied clone${l > 1 ? 's' : ''}` },
  { id: 'mimicry', name: 'Mimicry', rarity: 'rare', maxLevel: 3, tags: ['defense', 'stealth'],
    desc: 'Blend into the water. Predators notice you later and give up sooner.', lv: (l) => `-${22 * l}% predator sight` },
  { id: 'dash', name: 'Enzyme Burst', rarity: 'rare', maxLevel: 4, tags: ['active', 'speed'], active: true,
    desc: 'ACTIVE: a jet dash with brief invulnerability. Rams through cells and shakes off phages.', lv: (l) => `dash, ${f1(6 - 0.8 * (l - 1))}s cooldown` },
  { id: 'nova', name: 'Toxin Nova', rarity: 'epic', maxLevel: 3, tags: ['active', 'offense'], active: true,
    desc: 'ACTIVE: unleash a huge toxic shockwave that blasts everything nearby.', lv: (l) => `${35 + 20 * l} burst damage, ${15 - 2 * (l - 1)}s cooldown` },
  { id: 'cyst', name: 'Cyst', rarity: 'epic', maxLevel: 3, tags: ['defense'],
    desc: 'Once per depth, survive a lethal hit by hardening into a cyst.', lv: (l) => `survive a lethal hit at ${25 + 15 * (l - 1)}% HP` },
  { id: 'osmo', name: 'Osmoregulation', rarity: 'common', maxLevel: 3, tags: ['defense'],
    desc: 'Pump out toxins and heat. Resist hazards and currents.', lv: (l) => `-${25 * l}% hazard damage` },
  { id: 'lysosome', name: 'Lysosomes', rarity: 'rare', maxLevel: 3, tags: ['sustain', 'offense'],
    desc: 'Digestive enzymes. Meals heal you and boss bites hit harder.', lv: (l) => `meals heal ${l}% HP, +${30 * l}% bite damage` },
];
export const MUT_BY_ID = Object.fromEntries(MUTATIONS.map((m) => [m.id, m]));
export const RARITY = {
  common: { weight: 10, color: '#7cf0a3', label: 'Common' },
  rare: { weight: 5, color: '#6fc8ff', label: 'Rare' },
  epic: { weight: 2, color: '#c79cff', label: 'Epic' },
};

const RAMP = [15, 35, 70, 120, 200, 320];
const costs = (arr) => (l) => (l < arr.length ? arr[l] : Infinity);
export const GENOME_UPGRADES = [
  { id: 'hp', name: 'Membrane Strength', maxLevel: 5, desc: 'Every run starts with a sturdier cell.',
    cost: costs(RAMP), effect: (l) => `+${15 * l}% max HP` },
  { id: 'motor', name: 'Flagellar Motor', maxLevel: 5, desc: 'A stronger base swimming motor.',
    cost: costs(RAMP), effect: (l) => `+${6 * l}% speed` },
  { id: 'digest', name: 'Efficient Digestion', maxLevel: 5, desc: 'Extract more biomass (XP) from everything you eat.',
    cost: costs(RAMP), effect: (l) => `+${10 * l}% biomass` },
  { id: 'splice', name: 'Gene Splicing', maxLevel: 3, desc: 'Reroll the mutations offered on level-up.',
    cost: costs([25, 70, 140]), effect: (l) => `${l} reroll${l === 1 ? '' : 's'} per run` },
  { id: 'wide', name: 'Wider Genome', maxLevel: 1, desc: 'See one extra mutation card on every level-up.',
    cost: costs([150]), effect: (l) => (l ? '4 mutation choices' : '3 mutation choices') },
  { id: 'headstart', name: 'Head Start', maxLevel: 3, desc: 'Choose mutations before the run begins.',
    cost: costs([40, 100, 200]), effect: (l) => `start with ${l} mutation${l === 1 ? '' : 's'}` },
  { id: 'cystmem', name: 'Cyst Memory', maxLevel: 2, desc: 'Once per run, revive after dying.',
    cost: costs([80, 180]), effect: (l) => (l ? `revive once at ${[0, 30, 60][l]}% HP` : 'no revive') },
  { id: 'harvest', name: 'DNA Harvest', maxLevel: 5, desc: 'Earn more DNA from every run.',
    cost: costs(RAMP), effect: (l) => `+${8 * l}% DNA` },
  { id: 'sensory', name: 'Sensory Field', maxLevel: 4, desc: 'Pull glucose motes in from further away.',
    cost: costs(RAMP), effect: (l) => `+${20 * l}% magnet radius` },
];
export const GENOME_BY_ID = Object.fromEntries(GENOME_UPGRADES.map((g) => [g.id, g]));

// ---------- depths ----------
// pop: target population (scaled by intensity ramp); era-gated species are filtered at runtime.
export const DEPTHS = [
  { n: 1, name: 'Sunlit Shallows', dur: 70, sun: 1.0,
    pop: { drifter: 15, grazer: 6, diatom: 3, hunter: 2, ciliate: 4, rotifer: 0, volvox: 1 },
    phageEvery: 0, hazards: { uv: 2, current: 2 } },
  { n: 2, name: 'Twilight Drift', dur: 75, sun: 0.45,
    pop: { drifter: 12, grazer: 8, diatom: 4, hunter: 4, amoeba: 1, ciliate: 4, rotifer: 2, volvox: 2 },
    phageEvery: 20, hazards: { uv: 1, toxic: 2, current: 2 } },
  { n: 3, name: 'Midnight Gyre', dur: 80, sun: 0.12, boss: 'colossus',
    pop: { drifter: 10, grazer: 8, diatom: 5, hunter: 5, amoeba: 2, siphonophore: 2, ciliate: 4, rotifer: 3, volvox: 2 },
    phageEvery: 15, hazards: { toxic: 3, current: 2, vent: 1 } },
  { n: 4, name: 'Violet Abyss', dur: 85, sun: 0,
    pop: { drifter: 9, grazer: 8, diatom: 5, hunter: 6, amoeba: 2, siphonophore: 3, ciliate: 4, rotifer: 3, volvox: 2 },
    phageEvery: 12, hazards: { toxic: 3, vent: 2, current: 1 } },
  { n: 5, name: 'Vent of Origins', dur: 90, sun: 0, boss: 'queen',
    pop: { drifter: 9, grazer: 7, diatom: 5, hunter: 7, amoeba: 3, siphonophore: 3, ciliate: 4, rotifer: 4, volvox: 2 },
    phageEvery: 10, hazards: { vent: 4, toxic: 2, current: 1 } },
];

// Background palettes per depth (rgb arrays). Era tinting is applied at runtime.
export const PALETTES = [
  { bg: [12, 78, 86], edge: [2, 22, 30], caustic: [120, 255, 225], shaft: [170, 255, 235], plankton: [160, 245, 225], mote: [255, 232, 140], accent: [110, 240, 210] },
  { bg: [12, 52, 98], edge: [2, 10, 28], caustic: [110, 190, 255], shaft: [130, 190, 255], plankton: [150, 200, 255], mote: [180, 240, 255], accent: [100, 170, 255] },
  { bg: [30, 32, 104], edge: [4, 5, 24], caustic: [150, 140, 255], shaft: [140, 125, 255], plankton: [175, 165, 255], mote: [160, 255, 225], accent: [140, 130, 255] },
  { bg: [44, 20, 92], edge: [7, 3, 24], caustic: [205, 130, 255], shaft: [185, 115, 255], plankton: [215, 160, 255], mote: [255, 175, 240], accent: [200, 120, 255] },
  { bg: [48, 14, 44], edge: [10, 2, 14], caustic: [255, 120, 105], shaft: [255, 110, 90], plankton: [255, 160, 135], mote: [255, 205, 120], accent: [255, 100, 80] },
];

// Species colours: body rgb, membrane rgb, nucleus rgb
export const COLORS = {
  player: { body: [90, 240, 215], mem: [210, 255, 245], nuc: [60, 150, 190], glow: [110, 255, 225] },
  clone: { body: [90, 240, 215], mem: [210, 255, 245], nuc: [60, 150, 190], glow: [110, 255, 225] },
  drifter: { body: [255, 220, 120], mem: [255, 245, 200], nuc: [210, 140, 60], glow: [255, 220, 120] },
  grazer: { body: [110, 200, 255], mem: [200, 235, 255], nuc: [60, 100, 200], glow: [110, 190, 255] },
  diatom: { body: [235, 205, 130], mem: [255, 245, 215], nuc: [170, 120, 40], glow: [255, 220, 150] },
  hunter: { body: [255, 80, 100], mem: [255, 170, 175], nuc: [140, 20, 50], glow: [255, 70, 90] },
  phage: { body: [200, 150, 255], mem: [240, 220, 255], nuc: [120, 70, 220], glow: [200, 140, 255] },
  amoeba: { body: [255, 170, 90], mem: [255, 220, 170], nuc: [190, 90, 50], glow: [255, 150, 80] },
  siphonophore: { body: [255, 120, 220], mem: [255, 210, 245], nuc: [190, 60, 170], glow: [255, 110, 220] },
  ciliate: { body: [140, 255, 190], mem: [220, 255, 235], nuc: [50, 160, 110], glow: [140, 255, 190] },
  rotifer: { body: [255, 195, 110], mem: [255, 235, 190], nuc: [190, 120, 50], glow: [255, 190, 110] },
  volvox: { body: [110, 235, 120], mem: [200, 255, 200], nuc: [40, 140, 60], glow: [120, 240, 130] },
  colossus: { body: [255, 120, 80], mem: [255, 200, 160], nuc: [170, 50, 40], glow: [255, 110, 70] },
  queen: { body: [150, 175, 255], mem: [230, 240, 255], nuc: [90, 90, 220], glow: [150, 180, 255] },
  mine: { body: [205, 160, 75], mem: [255, 225, 150], nuc: [120, 80, 30], glow: [255, 180, 90] },
};

// ---------- formulas ----------
export const xpToNext = (L) => Math.round(10 + 5 * L + 0.62 * L * L);
export const playerRadius = (L) => 14 + 1.2 * (L - 1);
export const expectedRadius = (depth) => [15, 21, 27, 33, 39][depth - 1] || 39;
export const baseSpeed = (r) => 128 * Math.pow(r / 14, 0.55);
export const DEPTH_BONUS = [0, 3, 8, 15, 24, 36]; // indexed by depths cleared

export function computeDNA(s) {
  const biomass = Math.floor(s.biomass / 45);
  const depth = DEPTH_BONUS[Math.min(5, s.depthsCleared)] || 0;
  const bosses = s.miniKills * 15 + s.finalKills * 30;
  const discoveries = s.discMicrobes * 2 + s.discMutations;
  const victory = s.victory ? 25 : 0;
  const subtotal = biomass + depth + bosses + discoveries + victory;
  const mult = Math.max(1, s.dnaMult || 1) * (1 + 0.08 * (s.harvest || 0));
  return { biomass, depth, bosses, discoveries, victory, subtotal, mult, total: Math.round(subtotal * mult) };
}
