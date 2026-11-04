// The evolution campaign: 10 habitats x 5 levels, a body stage every 10 levels, bosses, and the trait tiers.
import { SPECIES } from './ecology.js';

// ---------- body stages ----------
export const STAGES = [
  null,
  { n: 1, name: 'Single Cell', size: '0.05 mm', blurb: 'A lone cell, drifting and hungry.' },
  { n: 2, name: 'Colony', size: '0.5 mm', blurb: 'You and your daughter cells stick together and the world shrinks around you. New power: Enzyme Burst, a dash. New traits: guard cells, feeding polyps, signalling. Rerolls unlocked.' },
  { n: 3, name: 'Flatworm', size: '5 mm', blurb: 'Your first animal body: a head, eyespots, muscles and a gut. Single cells are specks now. New power: Toxin Nova. New traits: muscle, jaws, nerve cords, stinging cells. Four choices per evolution.' },
  { n: 4, name: 'Primordial Fish', size: '5 cm', blurb: 'A backbone, a fin fold and gill pores: one of the first fish. New power: Photophore Flash. New traits: fins, eyes, a bony head shield.' },
  { n: 5, name: 'Jawed Fish', size: '50 cm', blurb: 'Jaws, paired fins and a real tail: a sea predator. New power: Suction Feeding. New traits: barbels, bony scales, gills.' },
];
// which boss (by habitat index 1..8) evolves you to which stage
export const EVOLVE_AFTER = { 2: 2, 4: 3, 6: 4, 8: 5 };
// every new body brings one active power (a button), and finishing the journey brings the last one.
// They are never offered as picks; once you have one, picks can level it up.
export const STAGE_POWER = { 2: 'dash', 3: 'nova', 4: 'photo', 5: 'suction' };
export const FINAL_POWER = 'shoal';
export const POWER_NAMES = { dash: 'Enzyme Burst', nova: 'Toxin Nova', photo: 'Photophore Flash', suction: 'Suction Feeding', shoal: 'Shoal Call' };
// the powers a save should have: one per body reached, plus the last one once the journey is done
export const powersFor = (stage, complete) => [...Object.entries(STAGE_POWER).filter(([s]) => stage >= +s).map(([, id]) => id), ...(complete ? [FINAL_POWER] : [])];
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
    desc: 'Nerve cords along your body. React faster: longer invulnerability after a hit and wider reach.', lv: (l) => `+${f1(0.15 * l)}s safety after hits, +${10 * l}% reach` },
  { id: 'cnido', stage: 3, name: 'Stinging Cells', rarity: 'epic', maxLevel: 3, tags: ['offense'],
    desc: 'Nematocysts that fire into anything that comes close, including bosses.', lv: (l) => `${6 + 6 * l} dmg/s to everything touching you` },
  { id: 'fins', stage: 4, name: 'Fins', rarity: 'common', maxLevel: 4, tags: ['speed'],
    desc: 'Stabilising fins for fast, controlled swimming.', lv: (l) => `+${12 * l}% speed, sharper turns` },
  { id: 'eyes', stage: 4, name: 'Eyes', rarity: 'rare', maxLevel: 3, tags: ['utility', 'offense'],
    desc: 'Real eyes. Spot food from far away and aim bites at weak spots.', lv: (l) => `+${30 * l}% magnet, +${15 * l}% bite damage` },
  { id: 'shell', stage: 4, name: 'Head Shield', rarity: 'rare', maxLevel: 3, tags: ['defense'],
    desc: 'A bony shield over your head, like the first armoured fish.', lv: (l) => `+${40 * l} max HP, -${5 * l}% damage taken` },
  { id: 'photo', stage: 4, name: 'Photophore Flash', rarity: 'rare', maxLevel: 3, tags: ['active', 'defense'], active: true,
    desc: 'ACTIVE: your light organs fire a blinding flash. Nearby animals are dazzled and lose track of you, hidden hunters show up, and deep-sea eyes are blinded.', lv: (l) => `${f1(2 + 0.5 * l)}s dazzle, ${14 - 2 * (l - 1)}s cooldown` },
  { id: 'shoal', stage: 4, name: 'Shoal Call', rarity: 'epic', maxLevel: 3, tags: ['active', 'defense'], active: true,
    desc: 'ACTIVE: a burst of scent gathers a little school of fish around you. Predators chase them instead of you.', lv: (l) => `${3 + 2 * l} decoy fish for ${4 + l}s, ${18 - 2 * (l - 1)}s cooldown` },
  { id: 'suction', stage: 5, name: 'Suction Feeding', rarity: 'rare', maxLevel: 3, tags: ['active', 'growth'], active: true,
    desc: 'ACTIVE: open your mouth so fast it vacuums in all the small food in front of you.', lv: (l) => `a wider, longer gulp (${f1(10 - 1.5 * (l - 1))}s cooldown)` },
  { id: 'tentacles', stage: 5, name: 'Barbels', rarity: 'epic', maxLevel: 3, tags: ['offense', 'growth'],
    desc: 'Whisker-like feelers that taste food from afar and lash anything that touches you.', lv: (l) => `${8 * l} dmg/s sting, +${30 * l}% magnet` },
  { id: 'hide', stage: 5, name: 'Bony Scales', rarity: 'rare', maxLevel: 3, tags: ['defense'],
    desc: 'Overlapping bony scales armour your whole body.', lv: (l) => `-${10 * l}% damage taken` },
  { id: 'gills', stage: 5, name: 'Gills', rarity: 'common', maxLevel: 3, tags: ['sustain'],
    desc: 'Feathery gills pull energy from the water.', lv: (l) => `+${f1(0.8 * l)} HP/s regeneration` },
];
export const NEW_MUT_BY_ID = Object.fromEntries(NEW_MUTATIONS.map((m) => [m.id, m]));

// ---------- when traits appear, and where they shine ----------
// First level each trait can be offered (body-stage gates still apply on top). Basics first;
// answers to new threats arrive just before those threats do.
export const TRAIT_FROM = {
  flagellum: 1, membrane: 1, biolum: 1, vacuole: 1, chloro: 1, cilia: 2, mito: 2,
  spikes: 3, pseudopod: 3, dash: 4, toxin: 4, lysosome: 4, mimicry: 5, cyst: 6,
  osmo: 6, symbionts: 7, nova: 8, fission: 9,
  guard: 11, polyps: 11, signal: 13,
  muscle: 21, jaws: 22, nerve: 22, cnido: 24,
  fins: 31, shell: 31, eyes: 32, photo: 32, shoal: 34,
  tentacles: 41, hide: 41, gills: 42, suction: 41,
};
// How well a trait suits a level: [offer weight, reason shown on the card].
export function traitFit(id, L) {
  const H = HABITATS[L.h], hz = H.hazards || {}, pop = L.pop || {};
  let hunters = 0; for (const k in pop) if (SPECIES[k] && SPECIES[k].hostile && k !== 'mine') hunters += pop[k];
  const bossNear = L.isBoss || L.j >= 4, phages = !!L.phageEvery;
  switch (id) {
    case 'chloro': return hz.uv ? [2.4, 'UV light'] : H.sun >= 0.5 ? [1.2] : H.sun === 0 ? [0.25] : [0.7];
    case 'osmo': return hz.vortex ? [2.2, 'whirlpools'] : (hz.mucus | 0) >= 3 ? [2.2, 'sticky mucus'] : hz.vent ? [2.2, 'scalding vents'] : hz.toxic ? [2, 'toxic clouds'] : hz.uv ? [1.1] : [0.5];
    case 'symbionts': return pop.pistolshrimp ? [1.6, 'pistol shrimp (they block shots)'] : [1];
    case 'spikes': return phages ? [1.6, 'phage swarms'] : [1];
    case 'dash': return pop.arrowworm >= 2 ? [1.6, 'lunging arrow worms'] : pop.moray ? [1.5, 'moray ambushes'] : phages ? [1.5, 'latching swarms'] : (pop.diatom | 0) >= 6 ? [1.5, 'armoured diatoms'] : [1];
    case 'lysosome': case 'jaws': case 'eyes': return bossNear ? [1.9, 'a boss ahead'] : [1];
    case 'mimicry': case 'cyst': case 'membrane': case 'guard': case 'shell': case 'hide': return hunters >= 9 ? [1.4, 'packs of predators'] : [1];
    case 'toxin': case 'nova': return (pop.mine | 0) >= 3 ? [1.6, 'spore puffs to pop'] : hunters >= 9 ? [1.4, 'crowds of predators'] : [1];
    case 'cnido': case 'tentacles': return hunters >= 9 ? [1.4, 'crowds of predators'] : [1];
    case 'biolum': return L.dark ? [2.2, 'total darkness'] : [1];
    case 'photo': return L.boss === 'abyssal' || (L.h === 9 && L.j >= 3) ? [2.4, 'it blinds the Anglerfish'] : L.dark ? [2, 'total darkness'] : pop.arrowworm || L.boss === 'cuttlefish' ? [1.5, 'hidden hunters'] : [1];
    case 'shoal': return hunters >= 9 ? [1.5, 'packs of predators'] : [1];
    case 'suction': return (pop.krill | 0) + (pop.sardine | 0) + (pop.larvalfish | 0) >= 14 ? [1.5, 'shoals of prey'] : [1];
    case 'flagellum': case 'cilia': case 'fins': case 'muscle': return (hz.current | 0) >= 3 ? [1.4, 'strong currents'] : [1];
    case 'pseudopod': return (pop.diatom | 0) + (pop.ciliate | 0) + (pop.copepod | 0) >= 8 ? [1.4, 'plenty of prey'] : [1];
    default: return [1];
  }
}

// ---------- bosses ----------
// logic: 'colossus' (slow hunter that spawns minions) or 'queen' (ranged bursts, charges, swarms)
export const BOSSES = {
  giantamoeba: { id: 'giantamoeba', name: 'Giant Amoeba', art: 'colossus', logic: 'colossus', hp: 520, speed: 42, minions: ['grazer', 'grazer', 'hunter'], tagline: 'It shrinks from the light' },
  virus: { id: 'virus', name: 'Giant Virus', art: 'queen', logic: 'queen', hp: 700, speed: 58, swarm: 'phage', tagline: 'It turns cells into virus factories', attacks: ['burst', 'charge', 'swarm'], phases: 2 },
  titan: { id: 'titan', name: 'Volvox Titan', art: 'volvox', logic: 'colossus', hp: 1100, speed: 34, minions: ['volvox', 'nauplius', 'rotifer'], tagline: 'A rolling world of cells', col: { body: [90, 220, 150], mem: [200, 255, 220], nuc: [30, 130, 80], glow: [100, 240, 160] }, burst: true },
  tyrant: { id: 'tyrant', name: 'Rotifer Tyrant', art: 'rotifer', logic: 'colossus', hp: 1300, speed: 58, minions: ['rotifer', 'tardigrade', 'nauplius'], tagline: 'Its crown spins hungrily', col: { body: [255, 140, 90], mem: [255, 215, 180], nuc: [180, 70, 40], glow: [255, 140, 90] }, pull: true },
  beroe: { id: 'beroe', name: 'Beroe', art: 'beroe', logic: 'queen', hp: 1700, speed: 52, swarm: 'copepod', minions: ['combjelly'], tagline: 'The comb jelly that swallows comb jellies', attacks: ['charge', 'charge', 'swarm'], phases: 2 },
  pompeii: { id: 'pompeii', name: 'Pompeii Worm', art: 'pompeii', logic: 'colossus', hp: 2000, speed: 48, minions: ['arrowworm', 'copepod', 'copepod'], tagline: 'It thrives where the water boils', burst: true },
  cuttlefish: { id: 'cuttlefish', name: 'Giant Cuttlefish', art: 'cuttlefish', logic: 'queen', hp: 2400, speed: 60, swarm: 'larvalfish', minions: ['pistolshrimp'], tagline: 'Now you see it…', attacks: ['charge', 'swarm', 'charge', 'burst'], phases: 2 },
  mantis: { id: 'mantis', name: 'Peacock Mantis Shrimp', art: 'mantis', logic: 'colossus', hp: 2700, speed: 62, minions: ['pistolshrimp', 'krill', 'krill'], tagline: 'Its punch boils the water', burst: true },
  abyssal: { id: 'abyssal', name: 'Abyssal Anglerfish', art: 'angler', logic: 'queen', hp: 3000, speed: 50, swarm: 'cookiecutter', tagline: 'A light in the dark, and then teeth', attacks: ['charge', 'burst', 'swarm'], phases: 2 },
  progenitor: { id: 'progenitor', name: 'The Progenitor', art: 'siphboss', logic: 'queen', hp: 2600, speed: 56, swarm: 'jellyfish', tagline: 'A colony forty metres long', attacks: ['burst', 'charge', 'swarm', 'burst'], phases: 3 },
};

// ---------- habitats ----------
// pal: background palette; pop: base populations (scaled by level within the habitat)
// tier = the scale of life here (matches the body stage you have when you arrive)
export const HABITATS = [
  null,
  { n: 1, tier: 1, name: 'Sunlit Shallows', tag: 'Warm, bright water where life begins', boss: 'giantamoeba', sun: 1.0,
    pal: { bg: [12, 78, 86], edge: [2, 22, 30], caustic: [120, 255, 225], shaft: [170, 255, 235], plankton: [160, 245, 225], mote: [255, 232, 140], accent: [110, 240, 210] },
    pop: { drifter: 15, grazer: 6, diatom: 3, hunter: 2 }, hazards: { uv: 2, current: 2 }, phage: 0, food: 1.0 },
  { n: 2, tier: 1, name: 'Kelp Twilight', tag: 'Green shade beneath the kelp forest', boss: 'virus', sun: 0.6,
    pal: { bg: [16, 70, 60], edge: [2, 18, 16], caustic: [150, 255, 170], shaft: [170, 255, 190], plankton: [170, 255, 190], mote: [255, 225, 130], accent: [130, 240, 160] },
    pop: { drifter: 12, grazer: 8, diatom: 3, hunter: 4, ciliate: 5, amoeba: 1, mine: 3 }, hazards: { current: 3, toxic: 1, mucus: 2 }, phage: 22, swarm: 'phage', food: 1.1 },
  { n: 3, tier: 2, threat: 1.6, name: 'Green Sea', tag: 'An algal bloom, thick with tiny animals', boss: 'titan', sun: 0.8,
    pal: { bg: [20, 92, 58], edge: [3, 26, 14], caustic: [150, 255, 140], shaft: [190, 255, 160], plankton: [170, 255, 160], mote: [255, 240, 150], accent: [140, 255, 150] },
    pop: { drifter: 8, grazer: 6, hunter: 4, diatom: 3, volvox: 4, nauplius: 7, rotifer: 6, tardigrade: 2, hydra: 3, heliozoan: 2 }, hazards: { uv: 3, mucus: 3, current: 1 }, phage: 24, swarm: 'chytrid', food: 1.15 },
  { n: 4, tier: 2, threat: 1.45, name: 'Midnight Gyre', tag: 'No sunlight reaches this slow, dark spiral', boss: 'tyrant', sun: 0.15,
    pal: { bg: [30, 32, 104], edge: [4, 5, 24], caustic: [150, 140, 255], shaft: [140, 125, 255], plankton: [175, 165, 255], mote: [160, 255, 225], accent: [140, 130, 255] },
    pop: { hunter: 4, amoeba: 2, grazer: 4, ciliate: 3, nauplius: 6, rotifer: 8, tardigrade: 3, hydra: 2, heliozoan: 3, volvox: 2, mine: 2 }, hazards: { toxic: 3, current: 2 }, phage: 18, swarm: 'chytrid', food: 1.0 },
  { n: 5, tier: 3, name: 'Violet Abyss', tag: 'Cold, dark water lit by living light', boss: 'beroe', sun: 0,
    pal: { bg: [44, 20, 92], edge: [7, 3, 24], caustic: [205, 130, 255], shaft: [185, 115, 255], plankton: [215, 160, 255], mote: [255, 175, 240], accent: [200, 120, 255] },
    pop: { rotifer: 4, nauplius: 5, tardigrade: 2, volvox: 2, copepod: 10, ostracod: 6, arrowworm: 4, combjelly: 3, hydra: 2 }, hazards: { toxic: 2, current: 1, vent: 1 }, phage: 0, food: 1.0 },
  { n: 6, tier: 3, name: 'Ember Vents', tag: 'Scalding vents feed strange chemistry', boss: 'pompeii', sun: 0,
    pal: { bg: [48, 14, 44], edge: [10, 2, 14], caustic: [255, 120, 105], shaft: [255, 110, 90], plankton: [255, 160, 135], mote: [255, 205, 120], accent: [255, 100, 80] },
    pop: { rotifer: 4, tardigrade: 3, hydra: 3, copepod: 8, ostracod: 4, arrowworm: 4, combjelly: 3 }, hazards: { vent: 4, toxic: 2 }, phage: 0, food: 1.05 },
  { n: 7, tier: 4, threat: 1.15, name: 'Glass Reef', tag: 'A reef of living glass sponges', boss: 'cuttlefish', sun: 0.35,
    pal: { bg: [14, 60, 92], edge: [2, 12, 26], caustic: [170, 230, 255], shaft: [190, 235, 255], plankton: [190, 230, 255], mote: [255, 245, 200], accent: [150, 220, 255] },
    pop: { copepod: 8, ostracod: 4, arrowworm: 3, combjelly: 2, krill: 14, larvalfish: 10, jellyfish: 4, pistolshrimp: 5, anemone: 3, siphonophore: 1, squid: 5 }, hazards: { current: 3 }, phage: 0, food: 1.05 },
  { n: 8, tier: 4, threat: 1.25, name: 'Coral Shelf', tag: 'A crowded, colourful reef in shallow light', boss: 'mantis', sun: 0.7,
    pal: { bg: [18, 84, 104], edge: [3, 20, 34], caustic: [140, 240, 255], shaft: [210, 250, 255], plankton: [200, 245, 255], mote: [255, 230, 160], accent: [255, 150, 120] },
    pop: { copepod: 8, arrowworm: 2, krill: 12, larvalfish: 12, jellyfish: 5, pistolshrimp: 6, anemone: 5, siphonophore: 2, squid: 5 }, hazards: { current: 2 }, phage: 0, food: 1.05 },
  { n: 9, tier: 5, threat: 1.15, name: 'Lantern Deep', tag: 'Pitch dark. Every light is a lure', boss: 'abyssal', sun: 0, dark: true,
    pal: { bg: [10, 14, 40], edge: [1, 2, 8], caustic: [90, 140, 255], shaft: [80, 120, 255], plankton: [140, 200, 255], mote: [150, 230, 255], accent: [120, 200, 255] },
    pop: { krill: 10, larvalfish: 6, jellyfish: 3, pistolshrimp: 3, anemone: 2, sardine: 10, squid: 3, barracuda: 2, cookiecutter: 3, angler: 3 }, hazards: { vent: 1 }, phage: 16, swarm: 'cookiecutter', food: 1.0 },
  { n: 10, tier: 5, name: 'Origin Trench', tag: 'The deepest water. Where it all began', boss: 'progenitor', sun: 0,
    pal: { bg: [36, 26, 16], edge: [6, 4, 2], caustic: [255, 210, 130], shaft: [255, 200, 120], plankton: [255, 220, 160], mote: [200, 255, 230], accent: [255, 200, 110] },
    pop: { krill: 10, larvalfish: 6, pistolshrimp: 4, anemone: 2, jellyfish: 2, sardine: 12, squid: 3, barracuda: 4, moray: 2, cookiecutter: 2, angler: 2, siphonophore: 2 }, hazards: { vortex: 2, vent: 2, toxic: 1 }, phage: 0, food: 1.0 },
];

export const LEVELS_PER_HABITAT = 5;
export const TOTAL_LEVELS = (HABITATS.length - 1) * LEVELS_PER_HABITAT; // 50
export const LAYOUT = 50; // saves from the 48-level journey are mapped onto this one

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
  bossRamp: 2,               // boss levels are populated like this level of the habitat until the boss arrives
  speedSoft: 1.35, speedK: 0.3, // speed traits: full effect up to x1.45, then diminishing
  armorCap: 0.5,             // most damage traits can ever block
  huntGrow: 0.03,            // how fast smaller predators grow to keep pace with you (per second)
  biteCap: 1.5,              // most extra damage a much bigger biter does
  engulfCap: 0.98,           // the biggest cell you can swallow, relative to your size
  huntMin: 0.003, huntMax: 0.002, // how hunters' size range grows over the journey
  stageDmg: 0.15, stageHp: 0.3, // from Multicellular on, the world toughens with every body stage you reach
  oceanPer: 0.7,             // each Open Ocean expedition is this many journey levels harder than the last
};

// ---------- the Open Ocean: endless expeditions once the journey is complete ----------
// Levels past 50 are expeditions through the big-animal habitats, five at a time (the fifth is a boss
// rematch that always teaches you a new trait). They keep getting harder, a little more gently than the journey.
export const OCEAN_HABS = [7, 8, 9, 10];
export const isOcean = (c) => c > TOTAL_LEVELS;
export const oceanIndex = (c) => c - TOTAL_LEVELS;

const scalePop = (out, src, k, ramp, threat) => {
  for (const [kind, v] of Object.entries(src)) {
    const S = SPECIES[kind];
    out[kind] = (out[kind] || 0) + Math.max(0, Math.round(v * k * (S && S.hostile ? ramp * TUNE.hostile * threat : 1)));
    if (S && S.cap) out[kind] = Math.min(out[kind], S.cap);
  }
  return out;
};

// Build the configuration for campaign level c (1..50, then the Open Ocean from 51).
export function levelConfig(c) {
  c = Math.max(1, c | 0);
  const ocean = isOcean(c), e = oceanIndex(c);
  const leg = ocean ? Math.ceil(e / LEVELS_PER_HABITAT) : 0;
  const h = ocean ? OCEAN_HABS[(leg - 1) % OCEAN_HABS.length] : Math.ceil(c / LEVELS_PER_HABITAT);
  const j = ((ocean ? e : c) - 1) % LEVELS_PER_HABITAT + 1;
  const H = HABITATS[h];
  const isBoss = j === LEVELS_PER_HABITAT;
  const d = ocean ? TOTAL_LEVELS + TUNE.oceanPer * e : c; // difficulty level
  const dd = ocean ? TOTAL_LEVELS - 12 + 0.3 * e : c; // crowds grow slowly out in the ocean: damage does the ramping
  const ramp = (0.75 + 0.12 * (isBoss ? TUNE.bossRamp : j)) * (1 + TUNE.hostilePer * (dd - 1)); // hostile density ramps through a habitat and the journey
  const pop = scalePop({}, H.pop, 1, ramp, H.threat || 1);
  if (ocean) scalePop(pop, HABITATS[OCEAN_HABS[leg % OCEAN_HABS.length]].pop, 0.5, ramp, 1); // the next region's animals mix in
  c = ocean ? c : Math.min(TOTAL_LEVELS, c);
  return {
    c, h, j, isBoss, ocean: ocean ? e : 0, leg,
    name: ocean ? `Open Ocean · ${H.name}` : H.name,
    title: isBoss ? (ocean ? `${BOSSES[H.boss].name} returns` : BOSSES[H.boss].name) : ocean ? `Expedition ${e}` : `${H.name} ${j}`,
    dur: isBoss ? 22 : 52 + 5 * j,
    boss: isBoss ? H.boss : null,
    tier: H.tier, dark: !!H.dark, swarm: H.swarm || 'phage',
    sun: H.sun, pal: H.pal, pop, hazards: H.hazards, food: H.food,
    phageEvery: H.phage ? Math.max(8, H.phage - j) : (h === 1 && j >= 3 ? 30 : 0),
    diff: d,                                    // global difficulty
    hpMult: 1 + TUNE.hpPer * (d - 1) + TUNE.hpSq * (d - 1) ** 2,
    dmgMult: 1 + TUNE.dmgPer * (d - 1) + TUNE.dmgSq * (d - 1) ** 2,
    envMult: 1 + TUNE.envPer * (d - 1),
    spdMult: 1 + TUNE.spdPer * Math.min(d - 1, 70) + 0.01 * Math.max(0, d - 71), // speed growth slows down deep in the ocean
    expectedR: 15 + 3.2 * (j - 1),              // enemy size reference within the habitat
    xpScale: 1 + 0.09 * (d - 1),                // biomass value grows with the journey
  };
}

// evolution XP needed for the next mutation pick at evolution level L
export const evoNeed = (L) => Math.round(TUNE.evoA + TUNE.evoB * L);
