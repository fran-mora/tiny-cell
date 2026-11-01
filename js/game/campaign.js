// The evolution campaign: 8 habitats x 6 levels, bosses, body stages and the new trait tiers.

// ---------- body stages ----------
export const STAGES = [
  null,
  { n: 1, name: 'Single Cell', slots: 5, blurb: 'A lone cell, drifting and hungry.' },
  { n: 2, name: 'Colony', slots: 7, blurb: 'You and your daughter cells stick together. New traits: guard cells, feeding polyps, signalling. Rerolls unlocked.' },
  { n: 3, name: 'Multicellular', slots: 9, blurb: 'Your cells specialise into tissues. New traits: muscle, jaws, nerve net, stinging cells. Four choices per evolution.' },
  { n: 4, name: 'Swimmer', slots: 11, blurb: 'A segmented little swimmer. New traits: fins, eyes, shell.' },
  { n: 5, name: 'Sea Creature', slots: 13, blurb: 'A true little sea animal. New traits: tentacles, plated hide, gills.' },
];
// which boss (by habitat index 1..8) evolves you to which stage
export const EVOLVE_AFTER = { 2: 2, 4: 3, 6: 4, 7: 5 };
export const stageForCleared = (habitatsCleared) => {
  let s = 1;
  for (const [h, st] of Object.entries(EVOLVE_AFTER)) if (habitatsCleared >= +h) s = Math.max(s, st);
  return s;
};

// ---------- new trait tiers (stage = minimum body stage to be offered) ----------
const f1 = (n) => (Math.round(n * 10) / 10).toString();
export const NEW_MUTATIONS = [
  { id: 'guard', stage: 2, name: 'Guard Cells', rarity: 'common', maxLevel: 3, tags: ['defense'],
    desc: 'Hardened cells on your outer edge absorb part of every hit.', lv: (l) => `-${8 * l}% damage taken` },
  { id: 'polyps', stage: 2, name: 'Feeding Polyps', rarity: 'common', maxLevel: 3, tags: ['growth', 'sustain'],
    desc: 'Little feeding mouths around your edge. More biomass and meals heal you.', lv: (l) => `+${12 * l}% biomass, meals heal ${l}% HP` },
  { id: 'signal', stage: 2, name: 'Signalling', rarity: 'rare', maxLevel: 3, tags: ['utility'],
    desc: 'Chemical signals guide food towards you and confuse predators.', lv: (l) => `+${25 * l}% magnet, -${12 * l}% predator sight` },
  { id: 'muscle', stage: 3, name: 'Muscle Fibres', rarity: 'common', maxLevel: 4, tags: ['speed'],
    desc: 'Contractile tissue. Faster top speed and much quicker acceleration.', lv: (l) => `+${10 * l}% speed, +${20 * l}% acceleration` },
  { id: 'jaws', stage: 3, name: 'Jaws', rarity: 'rare', maxLevel: 3, tags: ['offense'],
    desc: 'A pair of mandibles. Bite bosses harder and swallow bigger prey.', lv: (l) => `+${30 * l}% bite damage, engulf +${6 * l}%` },
  { id: 'nerve', stage: 3, name: 'Nerve Net', rarity: 'rare', maxLevel: 3, tags: ['utility', 'defense'],
    desc: 'A web of neurons. React faster: longer invulnerability after a hit and wider reach.', lv: (l) => `+${f1(0.15 * l)}s safety after hits, +${10 * l}% reach` },
  { id: 'cnido', stage: 3, name: 'Stinging Cells', rarity: 'epic', maxLevel: 3, tags: ['offense'],
    desc: 'Nematocysts that fire into anything that comes close, including bosses.', lv: (l) => `${6 + 6 * l} dmg/s to everything touching you` },
  { id: 'fins', stage: 4, name: 'Fins', rarity: 'common', maxLevel: 4, tags: ['speed'],
    desc: 'Stabilising fins for fast, controlled swimming.', lv: (l) => `+${12 * l}% speed, sharper turns` },
  { id: 'eyes', stage: 4, name: 'Eyes', rarity: 'rare', maxLevel: 3, tags: ['utility', 'offense'],
    desc: 'Real eyes. Spot food from far away and aim bites at weak spots.', lv: (l) => `+${30 * l}% magnet, +${15 * l}% bite damage` },
  { id: 'shell', stage: 4, name: 'Shell', rarity: 'rare', maxLevel: 3, tags: ['defense'],
    desc: 'Protective plates over your back.', lv: (l) => `+${40 * l} max HP, -${5 * l}% damage taken` },
  { id: 'tentacles', stage: 5, name: 'Tentacles', rarity: 'epic', maxLevel: 3, tags: ['offense', 'growth'],
    desc: 'Trailing tentacles sting enemies and drag food in.', lv: (l) => `${8 * l} dmg/s sting, +${30 * l}% magnet` },
  { id: 'hide', stage: 5, name: 'Plated Hide', rarity: 'rare', maxLevel: 3, tags: ['defense'],
    desc: 'Overlapping armour scales.', lv: (l) => `-${10 * l}% damage taken` },
  { id: 'gills', stage: 5, name: 'Gills', rarity: 'common', maxLevel: 3, tags: ['sustain'],
    desc: 'Feathery gills pull energy from the water.', lv: (l) => `+${f1(1.5 * l)} HP/s regeneration` },
];
export const NEW_MUT_BY_ID = Object.fromEntries(NEW_MUTATIONS.map((m) => [m.id, m]));

// ---------- bosses ----------
// logic: 'colossus' (slow hunter that spawns minions) or 'queen' (ranged bursts, charges, swarms)
export const BOSSES = {
  colossus: { id: 'colossus', name: 'Colossal Amoeba', art: 'colossus', logic: 'colossus', hp: 520, speed: 42, minions: ['grazer', 'grazer', 'hunter'], tagline: 'Something enormous stirs' },
  greatciliate: { id: 'greatciliate', name: 'Great Ciliate', art: 'ciliate', logic: 'queen', hp: 700, speed: 70, minions: ['ciliate'], swarm: 'ciliate', tagline: 'A blur of beating hairs', col: { body: [235, 220, 110], mem: [255, 250, 200], nuc: [170, 140, 40], glow: [240, 220, 120] }, attacks: ['charge', 'charge', 'swarm'] },
  queen: { id: 'queen', name: 'Phage Queen', art: 'queen', logic: 'queen', hp: 1100, speed: 55, swarm: 'phage', tagline: 'The crystal virus awakens', attacks: ['burst', 'charge', 'swarm'], phases: 2 },
  tyrant: { id: 'tyrant', name: 'Rotifer Tyrant', art: 'rotifer', logic: 'colossus', hp: 1300, speed: 60, minions: ['rotifer', 'hunter', 'hunter'], tagline: 'Its crown spins hungrily', col: { body: [255, 140, 90], mem: [255, 215, 180], nuc: [180, 70, 40], glow: [255, 140, 90] }, pull: true },
  titan: { id: 'titan', name: 'Volvox Titan', art: 'volvox', logic: 'colossus', hp: 1800, speed: 34, minions: ['volvox', 'hunter', 'grazer'], tagline: 'A rolling world of cells', col: { body: [90, 220, 150], mem: [200, 255, 220], nuc: [30, 130, 80], glow: [100, 240, 160] }, burst: true },
  prime: { id: 'prime', name: 'Colossus Prime', art: 'colossus', logic: 'colossus', hp: 2400, speed: 62, minions: ['hunter', 'hunter', 'amoeba'], tagline: 'Born in the fire of the vents', col: { body: [255, 80, 70], mem: [255, 190, 150], nuc: [150, 30, 30], glow: [255, 90, 60] }, burst: true },
  leviathan: { id: 'leviathan', name: 'Diatom Leviathan', art: 'diatom', logic: 'queen', hp: 3000, speed: 48, swarm: 'phage', tagline: 'Living glass the size of a reef', col: { body: [160, 230, 255], mem: [235, 250, 255], nuc: [60, 140, 200], glow: [150, 220, 255] }, attacks: ['burst', 'burst', 'charge', 'swarm'], phases: 2 },
  progenitor: { id: 'progenitor', name: 'The Progenitor', art: 'queen', logic: 'queen', hp: 4200, speed: 62, swarm: 'phage', tagline: 'The ancestor of all life', col: { body: [255, 205, 110], mem: [255, 245, 210], nuc: [200, 140, 40], glow: [255, 210, 120] }, attacks: ['burst', 'charge', 'swarm', 'burst'], phases: 3 },
};

// ---------- habitats ----------
// pal: background palette; pop: base populations (scaled by level within the habitat)
export const HABITATS = [
  null,
  { n: 1, name: 'Sunlit Shallows', tag: 'Warm, bright water where life begins', boss: 'colossus', sun: 1.0,
    pal: { bg: [12, 78, 86], edge: [2, 22, 30], caustic: [120, 255, 225], shaft: [170, 255, 235], plankton: [160, 245, 225], mote: [255, 232, 140], accent: [110, 240, 210] },
    pop: { drifter: 15, grazer: 6, diatom: 3, hunter: 2 }, hazards: { uv: 2, current: 2 }, phage: 0, food: 1.0 },
  { n: 2, name: 'Kelp Twilight', tag: 'Green shade beneath the kelp forest', boss: 'greatciliate', sun: 0.6,
    pal: { bg: [16, 70, 60], edge: [2, 18, 16], caustic: [150, 255, 170], shaft: [170, 255, 190], plankton: [170, 255, 190], mote: [255, 225, 130], accent: [130, 240, 160] },
    pop: { drifter: 12, grazer: 8, diatom: 3, hunter: 3, ciliate: 5, amoeba: 1 }, hazards: { current: 3, toxic: 1 }, phage: 0, food: 1.1 },
  { n: 3, name: 'Midnight Gyre', tag: 'No sunlight reaches this slow, dark spiral', boss: 'queen', sun: 0.15,
    pal: { bg: [30, 32, 104], edge: [4, 5, 24], caustic: [150, 140, 255], shaft: [140, 125, 255], plankton: [175, 165, 255], mote: [160, 255, 225], accent: [140, 130, 255] },
    pop: { drifter: 10, grazer: 8, diatom: 4, hunter: 4, amoeba: 2, siphonophore: 1, ciliate: 3 }, hazards: { toxic: 3, current: 2 }, phage: 18, food: 1.0 },
  { n: 4, name: 'Violet Abyss', tag: 'Cold, crushing and full of hunters', boss: 'tyrant', sun: 0,
    pal: { bg: [44, 20, 92], edge: [7, 3, 24], caustic: [205, 130, 255], shaft: [185, 115, 255], plankton: [215, 160, 255], mote: [255, 175, 240], accent: [200, 120, 255] },
    pop: { drifter: 10, grazer: 8, diatom: 4, hunter: 5, amoeba: 2, siphonophore: 2, rotifer: 3 }, hazards: { toxic: 2, vent: 1, current: 1 }, phage: 15, food: 1.0 },
  { n: 5, name: 'Green Sea', tag: 'An algal bloom, thick with life', boss: 'titan', sun: 0.8,
    pal: { bg: [20, 92, 58], edge: [3, 26, 14], caustic: [150, 255, 140], shaft: [190, 255, 160], plankton: [170, 255, 160], mote: [255, 240, 150], accent: [140, 255, 150] },
    pop: { drifter: 12, grazer: 9, diatom: 4, hunter: 5, ciliate: 4, rotifer: 2, volvox: 3, amoeba: 1 }, hazards: { uv: 3, current: 2 }, phage: 16, food: 1.15 },
  { n: 6, name: 'Ember Vents', tag: 'Scalding vents feed strange chemistry', boss: 'prime', sun: 0,
    pal: { bg: [48, 14, 44], edge: [10, 2, 14], caustic: [255, 120, 105], shaft: [255, 110, 90], plankton: [255, 160, 135], mote: [255, 205, 120], accent: [255, 100, 80] },
    pop: { drifter: 9, grazer: 8, diatom: 4, hunter: 7, amoeba: 3, rotifer: 3, siphonophore: 2 }, hazards: { vent: 4, toxic: 2 }, phage: 12, food: 1.05 },
  { n: 7, name: 'Glass Reef', tag: 'A reef of living glass', boss: 'leviathan', sun: 0.35,
    pal: { bg: [14, 60, 92], edge: [2, 12, 26], caustic: [170, 230, 255], shaft: [190, 235, 255], plankton: [190, 230, 255], mote: [255, 245, 200], accent: [150, 220, 255] },
    pop: { drifter: 10, grazer: 8, diatom: 9, hunter: 6, siphonophore: 3, ciliate: 3, rotifer: 2 }, hazards: { current: 3, uv: 1, toxic: 1 }, phage: 11, food: 1.05 },
  { n: 8, name: 'Origin Trench', tag: 'The deepest water. Where it all began', boss: 'progenitor', sun: 0,
    pal: { bg: [36, 26, 16], edge: [6, 4, 2], caustic: [255, 210, 130], shaft: [255, 200, 120], plankton: [255, 220, 160], mote: [200, 255, 230], accent: [255, 200, 110] },
    pop: { drifter: 9, grazer: 8, diatom: 5, hunter: 8, amoeba: 3, siphonophore: 3, ciliate: 3, rotifer: 3, volvox: 2 }, hazards: { vent: 3, toxic: 2, current: 2 }, phage: 9, food: 1.0 },
];

export const LEVELS_PER_HABITAT = 6;
export const TOTAL_LEVELS = (HABITATS.length - 1) * LEVELS_PER_HABITAT; // 48

// Build the configuration for campaign level c (1..48).
export function levelConfig(c) {
  c = Math.max(1, Math.min(TOTAL_LEVELS, c | 0));
  const h = Math.ceil(c / LEVELS_PER_HABITAT), j = (c - 1) % LEVELS_PER_HABITAT + 1;
  const H = HABITATS[h];
  const isBoss = j === LEVELS_PER_HABITAT;
  const ramp = 0.75 + 0.1 * j;                 // hostile density ramps through a habitat
  const pop = {};
  for (const [k, v] of Object.entries(H.pop)) pop[k] = Math.max(0, Math.round(v * (HOSTILE_KINDS[k] ? ramp : 1)));
  return {
    c, h, j, isBoss,
    name: H.name,
    title: isBoss ? BOSSES[H.boss].name : `${H.name} ${j}`,
    dur: isBoss ? 22 : 52 + 4 * j,
    boss: isBoss ? H.boss : null,
    sun: H.sun, pal: H.pal, pop, hazards: H.hazards, food: H.food,
    phageEvery: H.phage ? Math.max(8, H.phage - j) : (h === 1 && j >= 4 ? 30 : 0),
    diff: c,                                    // global difficulty
    hpMult: 1 + 0.045 * (c - 1),
    dmgMult: 1 + 0.035 * (c - 1),
    spdMult: 1 + 0.012 * (c - 1),
    expectedR: 15 + 2.6 * (j - 1),              // enemy size reference within the habitat
    xpScale: 1 + 0.09 * (c - 1),                // biomass value grows with the journey
  };
}
const HOSTILE_KINDS = { hunter: 1, amoeba: 1, rotifer: 1, siphonophore: 1, phage: 1 };

// evolution XP needed for the next mutation pick at evolution level L
export const evoNeed = (L) => Math.round(70 + 7 * L);
