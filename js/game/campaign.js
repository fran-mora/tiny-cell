// The evolution campaign: 8 habitats x 6 levels, bosses, body stages and the new trait tiers.

// ---------- body stages ----------
export const STAGES = [
  null,
  { n: 1, name: 'Single Cell', blurb: 'A lone cell, drifting and hungry.' },
  { n: 2, name: 'Colony', blurb: 'You and your daughter cells stick together. New traits: guard cells, feeding polyps, signalling. Rerolls unlocked.' },
  { n: 3, name: 'Multicellular', blurb: 'Your cells specialise into tissues. New traits: muscle, jaws, nerve net, stinging cells. Four choices per evolution.' },
  { n: 4, name: 'Swimmer', blurb: 'A segmented little swimmer. New traits: fins, eyes, shell.' },
  { n: 5, name: 'Sea Creature', blurb: 'A true little sea animal. New traits: tentacles, plated hide, gills.' },
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
    desc: 'Little feeding mouths around your edge. More biomass and meals heal you.', lv: (l) => `+${12 * l}% biomass, meals heal ${f1(0.5 * l)}% HP` },
  { id: 'signal', stage: 2, name: 'Signalling', rarity: 'rare', maxLevel: 3, tags: ['utility'],
    desc: 'Chemical signals guide food towards you and confuse predators.', lv: (l) => `+${25 * l}% magnet, -${12 * l}% predator sight` },
  { id: 'muscle', stage: 3, name: 'Muscle Fibres', rarity: 'common', maxLevel: 4, tags: ['speed'],
    desc: 'Contractile tissue. Faster top speed and much quicker acceleration.', lv: (l) => `+${10 * l}% speed, +${20 * l}% acceleration` },
  { id: 'jaws', stage: 3, name: 'Jaws', rarity: 'rare', maxLevel: 3, tags: ['offense'],
    desc: 'A pair of mandibles. Bite bosses harder and swallow bigger prey.', lv: (l) => `+${30 * l}% bite damage, engulf +${2 * l}%` },
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
    desc: 'Feathery gills pull energy from the water.', lv: (l) => `+${f1(0.8 * l)} HP/s regeneration` },
];
export const NEW_MUT_BY_ID = Object.fromEntries(NEW_MUTATIONS.map((m) => [m.id, m]));

// ---------- when traits appear, and where they shine ----------
// First level each trait can be offered (body-stage gates still apply on top). Basics first;
// answers to new threats arrive just before those threats do.
export const TRAIT_FROM = {
  flagellum: 1, membrane: 1, biolum: 1, vacuole: 1, chloro: 1, cilia: 2, mito: 2,
  spikes: 3, pseudopod: 3, dash: 4, toxin: 4, mimicry: 5, lysosome: 5, cyst: 6,
  osmo: 7, symbionts: 8, nova: 10, fission: 11,
  guard: 13, polyps: 13, signal: 15,
  muscle: 25, jaws: 26, nerve: 26, cnido: 28,
  fins: 37, shell: 37, eyes: 39,
  tentacles: 43, hide: 43, gills: 44,
};
// How well a trait suits a level: [offer weight, reason shown on the card].
export function traitFit(id, L) {
  const H = HABITATS[L.h], hz = H.hazards || {}, pop = L.pop || {};
  const hunters = (pop.hunter | 0) + (pop.rotifer | 0) + (pop.amoeba | 0);
  const bossNear = L.isBoss || L.j >= 5, phages = !!L.phageEvery;
  switch (id) {
    case 'chloro': return hz.uv ? [2.4, 'UV light'] : H.sun >= 0.5 ? [1.2] : H.sun === 0 ? [0.25] : [0.7];
    case 'osmo': return hz.vortex ? [2.2, 'whirlpools'] : (hz.mucus | 0) >= 3 ? [2.2, 'sticky mucus'] : hz.vent ? [2.2, 'scalding vents'] : hz.toxic ? [2, 'toxic clouds'] : hz.uv ? [1.1] : [0.5];
    case 'symbionts': return pop.spitter ? [1.7, 'spitters (they block shards)'] : [1];
    case 'spikes': return phages ? [1.6, 'phage swarms'] : [1];
    case 'dash': return pop.lurker >= 2 ? [1.6, 'lunging lurkers'] : phages ? [1.5, 'phages to shake off'] : (pop.diatom | 0) >= 6 ? [1.5, 'armoured diatoms'] : [1];
    case 'lysosome': case 'jaws': case 'eyes': return bossNear ? [1.9, 'a boss ahead'] : [1];
    case 'mimicry': case 'cyst': case 'membrane': case 'guard': case 'shell': case 'hide': return hunters >= 7 ? [1.4, 'packs of hunters'] : [1];
    case 'toxin': case 'nova': return (pop.mine | 0) >= 3 ? [1.6, 'spore mines to pop'] : hunters >= 7 ? [1.4, 'crowds of predators'] : [1];
    case 'cnido': case 'tentacles': return hunters >= 7 ? [1.4, 'crowds of predators'] : [1];
    case 'flagellum': case 'cilia': case 'fins': case 'muscle': return (hz.current | 0) >= 3 ? [1.4, 'strong currents'] : [1];
    case 'pseudopod': return (pop.diatom | 0) + (pop.ciliate | 0) >= 7 ? [1.4, 'plenty of prey'] : [1];
    default: return [1];
  }
}

// ---------- bosses ----------
// logic: 'colossus' (slow hunter that spawns minions) or 'queen' (ranged bursts, charges, swarms)
export const BOSSES = {
  colossus: { id: 'colossus', name: 'Colossal Amoeba', art: 'colossus', logic: 'colossus', hp: 520, speed: 42, minions: ['grazer', 'grazer', 'hunter'], tagline: 'Something enormous stirs' },
  greatciliate: { id: 'greatciliate', name: 'Great Ciliate', art: 'ciliate', logic: 'queen', hp: 700, speed: 70, minions: ['ciliate'], swarm: 'ciliate', tagline: 'A blur of beating hairs', col: { body: [235, 220, 110], mem: [255, 250, 200], nuc: [170, 140, 40], glow: [240, 220, 120] }, attacks: ['charge', 'charge', 'swarm'] },
  queen: { id: 'queen', name: 'Phage Queen', art: 'queen', logic: 'queen', hp: 950, speed: 55, swarm: 'phage', tagline: 'The crystal virus awakens', attacks: ['burst', 'charge', 'swarm'], phases: 2 },
  tyrant: { id: 'tyrant', name: 'Rotifer Tyrant', art: 'rotifer', logic: 'colossus', hp: 1300, speed: 60, minions: ['rotifer', 'hunter', 'hunter'], tagline: 'Its crown spins hungrily', col: { body: [255, 140, 90], mem: [255, 215, 180], nuc: [180, 70, 40], glow: [255, 140, 90] }, pull: true },
  titan: { id: 'titan', name: 'Volvox Titan', art: 'volvox', logic: 'colossus', hp: 1800, speed: 34, minions: ['volvox', 'hunter', 'grazer'], tagline: 'A rolling world of cells', col: { body: [90, 220, 150], mem: [200, 255, 220], nuc: [30, 130, 80], glow: [100, 240, 160] }, burst: true },
  prime: { id: 'prime', name: 'Colossus Prime', art: 'colossus', logic: 'colossus', hp: 2400, speed: 62, minions: ['hunter', 'hunter', 'amoeba'], tagline: 'Born in the fire of the vents', col: { body: [255, 80, 70], mem: [255, 190, 150], nuc: [150, 30, 30], glow: [255, 90, 60] }, burst: true },
  leviathan: { id: 'leviathan', name: 'Diatom Leviathan', art: 'diatom', logic: 'queen', hp: 3000, speed: 48, swarm: 'phage', tagline: 'Living glass the size of a reef', col: { body: [160, 230, 255], mem: [235, 250, 255], nuc: [60, 140, 200], glow: [150, 220, 255] }, attacks: ['burst', 'burst', 'charge', 'swarm'], phases: 2 },
  progenitor: { id: 'progenitor', name: 'The Progenitor', art: 'queen', logic: 'queen', hp: 2400, speed: 62, swarm: 'phage', tagline: 'The ancestor of all life', col: { body: [255, 205, 110], mem: [255, 245, 210], nuc: [200, 140, 40], glow: [255, 210, 120] }, attacks: ['burst', 'charge', 'swarm', 'burst'], phases: 3 },
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
    pop: { drifter: 12, grazer: 8, diatom: 3, hunter: 4, ciliate: 5, amoeba: 1 }, hazards: { current: 3, toxic: 1 }, phage: 0, food: 1.1 },
  { n: 3, name: 'Midnight Gyre', tag: 'No sunlight reaches this slow, dark spiral', boss: 'queen', sun: 0.15,
    pal: { bg: [30, 32, 104], edge: [4, 5, 24], caustic: [150, 140, 255], shaft: [140, 125, 255], plankton: [175, 165, 255], mote: [160, 255, 225], accent: [140, 130, 255] },
    pop: { drifter: 10, grazer: 8, diatom: 4, hunter: 4, amoeba: 2, siphonophore: 1, ciliate: 3 }, hazards: { toxic: 3, current: 2 }, phage: 18, food: 1.0 },
  { n: 4, name: 'Violet Abyss', tag: 'Cold, crushing and full of hunters', boss: 'tyrant', sun: 0,
    pal: { bg: [44, 20, 92], edge: [7, 3, 24], caustic: [205, 130, 255], shaft: [185, 115, 255], plankton: [215, 160, 255], mote: [255, 175, 240], accent: [200, 120, 255] },
    pop: { drifter: 10, grazer: 8, diatom: 4, hunter: 4, amoeba: 2, siphonophore: 1, rotifer: 2, lurker: 2 }, hazards: { toxic: 2, vent: 1, current: 1 }, phage: 15, food: 1.0 },
  { n: 5, name: 'Green Sea', tag: 'An algal bloom, thick with life', boss: 'titan', sun: 0.8,
    pal: { bg: [20, 92, 58], edge: [3, 26, 14], caustic: [150, 255, 140], shaft: [190, 255, 160], plankton: [170, 255, 160], mote: [255, 240, 150], accent: [140, 255, 150] },
    pop: { drifter: 12, grazer: 9, diatom: 4, hunter: 7, ciliate: 4, rotifer: 4, volvox: 3, amoeba: 2, siphonophore: 1, lurker: 1 }, hazards: { uv: 3, current: 2, mucus: 4 }, phage: 16, food: 1.15 },
  { n: 6, name: 'Ember Vents', tag: 'Scalding vents feed strange chemistry', boss: 'prime', sun: 0,
    pal: { bg: [48, 14, 44], edge: [10, 2, 14], caustic: [255, 120, 105], shaft: [255, 110, 90], plankton: [255, 160, 135], mote: [255, 205, 120], accent: [255, 100, 80] },
    pop: { drifter: 9, grazer: 8, diatom: 4, hunter: 7, amoeba: 3, rotifer: 4, siphonophore: 2, lurker: 1, mine: 6 }, hazards: { vent: 4, toxic: 2, mucus: 1 }, phage: 12, food: 1.05 },
  { n: 7, name: 'Glass Reef', tag: 'A reef of living glass', boss: 'leviathan', sun: 0.35,
    pal: { bg: [14, 60, 92], edge: [2, 12, 26], caustic: [170, 230, 255], shaft: [190, 235, 255], plankton: [190, 230, 255], mote: [255, 245, 200], accent: [150, 220, 255] },
    pop: { drifter: 10, grazer: 8, diatom: 9, hunter: 6, siphonophore: 2, ciliate: 3, rotifer: 3, amoeba: 2, spitter: 3, lurker: 2, mine: 3 }, hazards: { current: 3, uv: 1, toxic: 1, mucus: 1 }, phage: 11, food: 1.05 },
  { n: 8, name: 'Origin Trench', tag: 'The deepest water. Where it all began', boss: 'progenitor', sun: 0,
    pal: { bg: [36, 26, 16], edge: [6, 4, 2], caustic: [255, 210, 130], shaft: [255, 200, 120], plankton: [255, 220, 160], mote: [200, 255, 230], accent: [255, 200, 110] },
    pop: { drifter: 9, grazer: 8, diatom: 5, hunter: 7, amoeba: 3, siphonophore: 2, ciliate: 3, rotifer: 3, volvox: 2, lurker: 2, spitter: 2, mine: 3 }, hazards: { vent: 2, toxic: 2, current: 1, vortex: 2, mucus: 2 }, phage: 9, food: 1.0 },
];

export const LEVELS_PER_HABITAT = 6;
export const TOTAL_LEVELS = (HABITATS.length - 1) * LEVELS_PER_HABITAT; // 48

// Balance knobs in one place (the automated playtester sweeps these).
export const TUNE = {
  evoA: 25, evoB: 2.6,       // evolution cost: evoA + evoB * level, in tenths of a body-size level grown
  track: 0.8,                // how closely hostile cells keep pace with your size (0 = habitat size only, 1 = your size)
  dmgPer: 0.025, dmgSq: 0.0005, // creature damage growth per level (+ a late-game curve); bites also scale with the biter's size
  envPer: 0.02,              // hazard damage (UV, toxins, vents, phages) grows gently
  spdPer: 0.024,             // enemy speed growth per level
  hpPer: 0.04, hpSq: 0.001,  // enemy toughness growth per level (+ a late-game curve)
  bossHpPer: 0.03,           // boss toughness growth per level
  hostile: 1.0, hostilePer: 0.032, // hostile population multiplier, and its growth per level
  bossRamp: 3,               // boss levels are populated like this level of the habitat until the boss arrives
  speedSoft: 1.35, speedK: 0.3, // speed traits: full effect up to x1.45, then diminishing
  armorCap: 0.5,             // most damage traits can ever block
  huntGrow: 0.03,            // how fast smaller predators grow to keep pace with you (per second)
  biteCap: 1.5,              // most extra damage a much bigger biter does
  engulfCap: 0.98,           // the biggest cell you can swallow, relative to your size
  huntMin: 0.003, huntMax: 0.002, // how hunters' size range grows over the journey
  stageDmg: 0.15, stageHp: 0.3, // from Multicellular on, the world toughens with every body stage you reach
};

// Build the configuration for campaign level c (1..48).
export function levelConfig(c) {
  c = Math.max(1, Math.min(TOTAL_LEVELS, c | 0));
  const h = Math.ceil(c / LEVELS_PER_HABITAT), j = (c - 1) % LEVELS_PER_HABITAT + 1;
  const H = HABITATS[h];
  const isBoss = j === LEVELS_PER_HABITAT;
  const ramp = (0.75 + 0.1 * (isBoss ? TUNE.bossRamp : j)) * (1 + TUNE.hostilePer * (c - 1)); // hostile density ramps through a habitat and the journey
  const pop = {};
  for (const [k, v] of Object.entries(H.pop)) pop[k] = Math.max(0, Math.round(v * (HOSTILE_KINDS[k] ? ramp * TUNE.hostile : 1)));
  return {
    c, h, j, isBoss,
    name: H.name,
    title: isBoss ? BOSSES[H.boss].name : `${H.name} ${j}`,
    dur: isBoss ? 22 : 52 + 4 * j,
    boss: isBoss ? H.boss : null,
    sun: H.sun, pal: H.pal, pop, hazards: H.hazards, food: H.food,
    phageEvery: H.phage ? Math.max(8, H.phage - j) : (h === 1 && j >= 4 ? 30 : 0),
    diff: c,                                    // global difficulty
    hpMult: 1 + TUNE.hpPer * (c - 1) + TUNE.hpSq * (c - 1) ** 2,
    dmgMult: 1 + TUNE.dmgPer * (c - 1) + TUNE.dmgSq * (c - 1) ** 2,
    envMult: 1 + TUNE.envPer * (c - 1),
    spdMult: 1 + TUNE.spdPer * (c - 1),
    expectedR: 15 + 2.6 * (j - 1),              // enemy size reference within the habitat
    xpScale: 1 + 0.09 * (c - 1),                // biomass value grows with the journey
  };
}
const HOSTILE_KINDS = { hunter: 1, amoeba: 1, rotifer: 1, siphonophore: 1, phage: 1, lurker: 1, spitter: 1, mine: 1 };

// evolution XP needed for the next mutation pick at evolution level L
export const evoNeed = (L) => Math.round(TUNE.evoA + TUNE.evoB * L);
