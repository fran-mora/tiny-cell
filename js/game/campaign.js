// The evolution campaign: habitats of 5 levels each, a body stage every 10 levels, bosses, and the trait tiers.
import { SPECIES } from './ecology.js';

// ---------- body stages ----------
export const STAGES = [
  null,
  { n: 1, name: 'Single Cell', size: '0.05 mm', blurb: 'A lone cell, drifting and hungry.' },
  { n: 2, name: 'Colony', size: '0.5 mm', blurb: 'You and your daughter cells stick together and the world shrinks around you. New power: Enzyme Burst, a dash. New traits: guard cells, feeding polyps, signalling. Rerolls unlocked.' },
  { n: 3, name: 'Flatworm', size: '5 mm', blurb: 'Your first animal body: a head, eyespots, muscles and a gut. Single cells are specks now. New power: Toxin Nova. New traits: muscle, jaws, nerve cords, stinging cells. Four choices per evolution.' },
  { n: 4, name: 'Primordial Fish', size: '5 cm', blurb: 'A backbone, a fin fold and gill pores: one of the first fish. New power: Photophore Flash. New traits: fins, eyes, a bony head shield.' },
  { n: 5, name: 'Jawed Fish', size: '50 cm', blurb: 'Jaws, paired fins and a real tail: a sea predator. New power: Suction Feeding. New traits: barbels, bony scales, gills.' },
  { n: 6, name: 'Pufferfish', size: '1 m', blurb: 'A round, beaked fish that nothing wants to swallow. Sardines and barracudas are small fry now. New power: Inflate, and Shoal Call for beating the Progenitor. New traits: a crushing beak, tetrodotoxin, hover fins.' },
  { n: 7, name: 'Sailfish', size: '3 m', blurb: 'The fastest fish in the sea, with a spear for a nose and a sail on its back. Reef sharks and pufferfish are small fry now. New power: Bill Slash. New traits: a sail, warm eyes, hunting stripes.' },
  { n: 8, name: 'Ocean Sunfish', size: '3 m tall', blurb: 'The heaviest bony fish: two tonnes of fish shaped like a giant swimming head. Jellyfish are finally food. New power: Breach. New traits: gelatinous skin, a jelly-eater\u2019s mouth, cleaner fish.' },
  { n: 9, name: 'Great White Shark', size: '6 m', blurb: 'The biggest predatory fish, warm-blooded and built to ambush seals from below. New power: Electrosense. New traits: serrated teeth, warm muscles, countershading.' },
  { n: 10, name: 'Whale Shark', size: '15 m', blurb: 'The biggest fish alive: a gentle giant that sieves clouds of tiny animals from the water. New power: Filter Feeding. New traits: remoras, gill rakers, deep diving.' },
];
// which boss (by habitat index 1..8) evolves you to which stage
export const EVOLVE_AFTER = { 2: 2, 4: 3, 6: 4, 8: 5, 10: 6, 12: 7, 14: 8, 16: 9, 18: 10 };
// every new body brings one active power (a button); beating the Progenitor (reaching the pufferfish) also
// brings Shoal Call. They are never offered as picks; once you have one, picks can level it up.
export const STAGE_POWER = { 2: 'dash', 3: 'nova', 4: 'photo', 5: 'suction', 6: 'puff', 7: 'slash', 8: 'breach', 9: 'sense', 10: 'filter' };
export const FINAL_POWER = 'shoal';
export const SHOAL_STAGE = 6;
export const POWER_NAMES = { dash: 'Enzyme Burst', nova: 'Toxin Nova', photo: 'Photophore Flash', suction: 'Suction Feeding', shoal: 'Shoal Call', puff: 'Inflate', slash: 'Bill Slash', breach: 'Breach', sense: 'Electrosense', filter: 'Filter Feeding' };
// the powers a save should have: one per body reached, plus Shoal Call from the pufferfish on
export const powersFor = (stage, complete) => [...Object.entries(STAGE_POWER).filter(([s]) => stage >= +s).map(([, id]) => id), ...(complete || stage >= SHOAL_STAGE ? [FINAL_POWER] : [])];
// You can take at most this many powers into a level. Your newest power always comes; the rest are your pick.
export const LOADOUT_SIZE = 4;
const POWER_PRIORITY = ['dash', 'nova', 'photo', 'suction', 'shoal', 'puff', 'slash', 'breach', 'sense', 'filter']; // default fill order after the newest
export const newestPower = (stage) => { let id = null; for (const [s, p] of Object.entries(STAGE_POWER)) if (stage >= +s) id = p; return id; };
// the powers to take into a level: owned = ids you have, chosen = your saved picks (may be stale)
export function loadoutFor(owned, chosen, stage) {
  if (owned.length <= LOADOUT_SIZE) return owned.slice();
  const nw = newestPower(stage), out = [];
  if (nw && owned.includes(nw)) out.push(nw);
  for (const id of chosen || []) if (owned.includes(id) && !out.includes(id) && out.length < LOADOUT_SIZE) out.push(id);
  for (const id of POWER_PRIORITY) if (owned.includes(id) && !out.includes(id) && out.length < LOADOUT_SIZE) out.push(id);
  return out;
}
export const stageForCleared = (habitatsCleared) => {
  let s = 1;
  // the journey's last live boss doesn't evolve you until the next body is built (saves are moved on then)
  for (const [h, st] of Object.entries(EVOLVE_AFTER)) if (habitatsCleared >= +h && +h < LIVE_HABITATS) s = Math.max(s, st);
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
  { id: 'puff', stage: 6, name: 'Inflate', rarity: 'rare', maxLevel: 3, tags: ['active', 'defense'], active: true,
    desc: 'ACTIVE: gulp water and swell into a spiny ball. Nothing can swallow or grab you, biters are spiked and bounce off, and other damage is halved, but you are slow and cannot eat.', lv: (l) => `${f1(2.5 + 0.5 * l)}s puffed, ${f1(13 - 1.5 * (l - 1))}s cooldown` },
  { id: 'beak', stage: 6, name: 'Crushing Beak', rarity: 'rare', maxLevel: 3, tags: ['offense'],
    desc: 'Teeth fused into a beak strong enough to crack shells. Sea urchins and other armoured prey break open at a bite, and boss bites hit harder.', lv: (l) => `+${12 * l}% boss bites, cracks shells` },
  { id: 'tetrodo', stage: 6, name: 'Tetrodotoxin', rarity: 'epic', maxLevel: 3, tags: ['defense', 'offense'],
    desc: 'You carry one of the deadliest poisons in nature. Anything that bites you is poisoned and backs off.', lv: (l) => `biters lose ${10 + 8 * l}% of their health and are stunned` },
  { id: 'hover', stage: 6, name: 'Hover Fins', rarity: 'common', maxLevel: 3, tags: ['speed'],
    desc: 'Pufferfish row with small fluttering fins: slow, but they can stop dead, turn on the spot and reverse.', lv: (l) => `+${20 * l}% acceleration, sharper stops and turns` },
  { id: 'slash', stage: 7, name: 'Bill Slash', rarity: 'rare', maxLevel: 3, tags: ['active', 'offense'], active: true,
    desc: 'ACTIVE: whip your spear-like bill sideways through everything in front of you, as sailfish do to stun sardines. It stuns and hurts all it hits.', lv: (l) => `${30 + 10 * l}% of their health, ${f1(7 - 0.8 * (l - 1))}s cooldown` },
  { id: 'sail', stage: 7, name: 'Sail', rarity: 'common', maxLevel: 3, tags: ['speed', 'utility'],
    desc: 'A huge fin you can raise or fold. Fold it to race, raise it to turn sharply and herd food towards you.', lv: (l) => `+${8 * l}% speed, +${15 * l}% magnet` },
  { id: 'warmeyes', stage: 7, name: 'Warm Eyes', rarity: 'rare', maxLevel: 3, tags: ['utility'],
    desc: 'A heater organ next to your eyes keeps them warm in cold, deep water, so you see sharper and further, even in the dark.', lv: (l) => `+${25 * l}% magnet, see further in the dark` },
  { id: 'stripes', stage: 7, name: 'Hunting Stripes', rarity: 'rare', maxLevel: 3, tags: ['offense'],
    desc: 'Excited sailfish flash bright blue bars. Prey freeze when you charge them, and your Bill Slash stuns longer.', lv: (l) => `prey freeze ${f1(0.6 * l)}s when you dash, slashes stun +${f1(0.4 * l)}s` },
  { id: 'breach', stage: 8, name: 'Breach', rarity: 'rare', maxLevel: 3, tags: ['active', 'offense', 'defense'], active: true,
    desc: 'ACTIVE: leap clear of the water and crash back down, as sunfish really do. Nothing can touch you in the air, and the landing stuns and hurts everything around.', lv: (l) => `${25 + 8 * l}% of their health, ${f1(12 - 1.5 * (l - 1))}s cooldown` },
  { id: 'gelskin', stage: 8, name: 'Gelatinous Skin', rarity: 'common', maxLevel: 3, tags: ['defense'],
    desc: 'A thick layer of tough jelly under your skin, as sunfish have, cushions every blow.', lv: (l) => `+${30 * l} max HP, -${6 * l}% damage taken` },
  { id: 'stingproof', stage: 8, name: 'Jelly-eater\u2019s Mouth', rarity: 'rare', maxLevel: 3, tags: ['defense', 'growth'],
    desc: 'A mouth and throat lined to take stings. Jellyfish and their tentacles barely hurt you, and jellies are extra filling.', lv: (l) => `-${30 * l}% sting damage, +${50 * l}% biomass from jellies` },
  { id: 'cleaners', stage: 8, name: 'Cleaner Fish', rarity: 'rare', maxLevel: 3, tags: ['sustain'],
    desc: 'Little cleaner wrasses pick parasites off your skin. You heal over time and anything latched on is picked off.', lv: (l) => `+${f1(0.6 * l)} HP/s, latchers picked off every ${5 - l}s` },
  { id: 'sense', stage: 9, name: 'Electrosense', rarity: 'rare', maxLevel: 3, tags: ['active', 'utility', 'offense'], active: true,
    desc: 'ACTIVE: jelly-filled pores on your snout feel the tiny electric field of every beating heart. For a few seconds you sense everything around you, hidden animals show up, and your bites find the weak spots.', lv: (l) => `${4 + l}s of sensing, bites +30%, ${15 - 2 * (l - 1)}s cooldown` },
  { id: 'serrated', stage: 9, name: 'Serrated Teeth', rarity: 'common', maxLevel: 3, tags: ['offense'],
    desc: 'Triangular teeth with saw edges, made for slicing. Your bites hit harder, bosses included.', lv: (l) => `+${15 * l}% bite damage, boss bites +${10 * l}%` },
  { id: 'warmblood', stage: 9, name: 'Warm Muscles', rarity: 'rare', maxLevel: 3, tags: ['mobility'],
    desc: 'Like a great white, you keep your swimming muscles warmer than the sea. You swim faster and shake off being slowed.', lv: (l) => `+${7 * l}% speed, slowdowns wear off ${40 * l}% faster` },
  { id: 'countershade', stage: 9, name: 'Countershading', rarity: 'common', maxLevel: 3, tags: ['defense', 'growth'],
    desc: 'A dark back and a white belly hide you from above and below. Animals notice you later, so you catch more.', lv: (l) => `noticed ${12 * l}% later, +${8 * l}% biomass` },
  { id: 'filter', stage: 10, name: 'Filter Feeding', rarity: 'rare', maxLevel: 3, tags: ['active', 'growth'], active: true,
    desc: 'ACTIVE: open your huge mouth wide and swim. Everything small in a wide cone in front of you is sucked in and swallowed, clouds of krill and eggs included.', lv: (l) => `${f1(2.5 + 0.5 * l)}s, ${12 - 1.5 * (l - 1)}s cooldown` },
  { id: 'remoras', stage: 10, name: 'Remoras', rarity: 'common', maxLevel: 3, tags: ['sustain', 'growth'],
    desc: 'Remora fish ride along on your skin, keep it clean and tidy up the scraps of your meals.', lv: (l) => `+${15 * l}% biomass, +${f1(0.4 * l)} HP/s` },
  { id: 'gillrakers', stage: 10, name: 'Gill Rakers', rarity: 'rare', maxLevel: 3, tags: ['growth'],
    desc: 'Spongy filter pads across your gills sieve even the tiniest animals from the water. Clouds of food are far more filling, and Filter Feeding reaches further.', lv: (l) => `+${40 * l}% biomass from food clouds, filter cone +${15 * l}%` },
  { id: 'deepdive', stage: 10, name: 'Deep Diver', rarity: 'common', maxLevel: 3, tags: ['defense'],
    desc: 'Whale sharks dive nearly 2 km down. Your huge, tough body shrugs off blows, and hunters lose you in the deep.', lv: (l) => `+${40 * l} max HP, -${6 * l}% damage taken, hunters give up sooner` },
];
export const NEW_MUT_BY_ID = Object.fromEntries(NEW_MUTATIONS.map((m) => [m.id, m]));

// ---------- traits take the form your body uses ----------
// A trait keeps its effect for the whole journey, but a fish has no polyps, cilia or chloroplasts. From the
// Primordial Fish on, each early trait shows up as what real fish use for the same job (with art to match).
// id → [[from stage, name, description, level text?], …] (the last entry your stage has reached wins)
export const TRAIT_FORMS = {
  flagellum: [[4, 'Tail Fin', 'A bigger, stronger tail fin. +12% top speed per level.']],
  cilia: [[4, 'Lateral Line', 'A row of pressure sensors down each side feels food and danger before you see them. +25% acceleration and +15% pickup reach per level.']],
  membrane: [[4, 'Tough Skin', 'Thicker, tougher skin. +25 max HP per level, healed on pick.']],
  spikes: [[4, 'Fin Spines', 'Sharp spines on your back and fins. Anything that touches you gets hurt, and phages are shredded.']],
  toxin: [[4, 'Boxfish Toxin', 'Like a boxfish, you leak poison into the water: every few seconds a toxic cloud hurts everything around you.']],
  chloro: [[4, 'Sun Basking', 'Like an ocean sunfish, you soak up the sun’s warmth. Light heals you and UV shafts can no longer burn you.']],
  mito: [[4, 'Red Muscle', 'Dark, oxygen-rich muscle along your flanks that never tires and slowly heals you.']],
  vacuole: [[4, 'Swim Bladder', 'A gas-filled float holds you up for free, so every meal goes further.']],
  pseudopod: [[4, 'Lobe Fins', 'Fleshy, muscular fins that pin prey down. Swallow animals nearly your own size.', (l) => `swallow prey up to ${85 + 4 * l}% your size`]],
  biolum: [[4, 'Photophores', 'Light organs along your sides glow to lure food from afar.']],
  symbionts: [[4, 'Pilot Fish', 'Little striped pilot fish swim around you, biting enemies and blocking shards.', (l) => `${l} pilot fish`]],
  fission: [[4, 'Offspring', 'A young fish of yours swims along and gathers food for you.', (l) => `${l} young fish`]],
  mimicry: [[4, 'Camouflage', 'Blotchy colours break up your outline. Predators notice you later and give up sooner.']],
  dash: [[4, 'Fast Start', 'ACTIVE: the escape reflex of fish. A giant nerve fires, your body snaps into a C and you shoot off, briefly invulnerable. Rams through cells and shakes off phages.']],
  nova: [[4, 'Electric Shock', 'ACTIVE: the electric organ in your tail discharges, like an electric ray’s, and blasts everything nearby.']],
  cyst: [[4, 'Mucus Cocoon', 'Once per depth, survive a lethal hit by sealing yourself in a hard mucus cocoon, like a lungfish in a drought.']],
  osmo: [[4, 'Salt Pumps', 'Special cells in your gills pump out salt and poisons. Resist hazards and currents.']],
  lysosome: [[4, 'Stomach Acid', 'A strong, acid stomach. Meals heal you and boss bites hit harder.']],
  guard: [[4, 'Bony Scutes', 'Rows of bony plates along your flanks absorb part of every hit.']],
  polyps: [[4, 'Pyloric Caeca', 'Finger-like pouches off your stomach soak up more from every meal, and meals heal you.']],
  signal: [[4, 'Scent Signals', 'Fish talk in smells: your scent draws food towards you and confuses predators.']],
  nerve: [[4, 'Spinal Cord', 'A spinal cord and a bigger brain. React faster: longer invulnerability after a hit and wider reach.']],
  cnido: [[4, 'Stinging Slime', 'Your skin oozes a stinging slime, like a soapfish’s. Everything touching you gets hurt, bosses included.']],
  jaws: [[4, 'Sucker Mouth', 'A round sucker ringed with horny teeth, like a lamprey’s. Bite bosses harder and swallow bigger prey.'],
    [5, 'Jaws', 'Real hinged jaws lined with teeth. Bite bosses harder and swallow bigger prey.'],
    [6, 'Jaw Muscles', 'Bulging muscles behind your beak. Bite bosses harder and swallow bigger prey.'],
    [7, 'Jaws', 'Strong jaws under your bill. Bite bosses harder and swallow bigger prey.'],
    [8, 'Jaw Muscles', 'Strong muscles behind your little beak. Bite bosses harder and swallow bigger prey.'],
    [9, 'Shark Jaws', 'Jaws that thrust forward as you bite, with rows of replacement teeth behind. Bite bosses harder and swallow bigger prey.'],
    [10, 'Wide Mouth', 'A mouth one and a half metres wide. Bite bosses harder and swallow bigger mouthfuls.']],
  // the pufferfish has no scales or barbels: its scales are prickles, and it smells through little tentacles
  hide: [[6, 'Prickles', 'Your scales have become tiny prickles all over your skin. They stand straight up when you inflate.'],
    [7, 'Bony Scales', 'Small, bony scales set deep in your skin armour your whole body.'],
    [8, 'Rough Skin', 'Sunfish skin is thick and rough as sandpaper, covered in tiny tooth-like scales.'],
    [9, 'Dermal Denticles', 'Shark skin is covered in tiny tooth-like scales: armour that also cuts drag.'],
    [10, 'Thick Hide', 'Whale shark skin is up to 10 cm thick, the thickest of any animal.']],
  tentacles: [[6, 'Nasal Tentacles', 'Pufferfish smell through tiny tentacles instead of nostrils. They find food from afar, and anything that touches you gets lashed.'],
    [7, 'Sensory Bill', 'Your bill is dotted with sensors that find food from afar, and anything that touches you gets lashed by it.'],
    [8, 'Sensory Pores', 'Pores all over your head sense food from afar, and your rough skin scrapes anything that touches you.'],
    [9, 'Keen Nose', 'Sharks can smell a drop of blood in a huge volume of water. You find food from afar, and your rough skin scrapes anything that touches you.']],
  // the pufferfish's own traits, on later bodies
  beak: [[7, 'Crushing Jaws', 'Jaws strong enough to crack shells. Armoured prey breaks open at a bite, and boss bites hit harder.'],
    [8, 'Crushing Beak', 'Teeth fused into a beak, like your pufferfish cousins. Armoured prey cracks at a bite, and boss bites hit harder.'],
    [9, 'Crushing Bite', 'One of the strongest bites of any fish. Armoured prey cracks at a bite, and boss bites hit harder.']],
  tetrodo: [[7, 'Repellent Mucus', 'Like the Moses sole, your skin oozes a poison that makes biters let go and back off.']],
  hover: [[7, 'Precise Fins', 'Small fins that let you stop dead, turn on the spot and reverse.'],
    [8, 'Fluttering Fins', 'Sunfish swim by flapping their tall fins: you can stop dead, turn on the spot and reverse.'],
    [9, 'Pectoral Fins', 'Big, stiff pectoral fins steer like wings: stop fast and turn on the spot.']],
  sail: [[8, 'Tall Fins', 'Your tall dorsal and anal fins flap like wings: more speed and a wider reach for food.'],
    [9, 'Tall Dorsal Fin', 'A tall, stiff dorsal fin keeps you steady at speed: more speed and a wider reach for food.']],
  stripes: [[8, 'Colour Flash', 'Sunfish flash pale and dark when excited. Prey freeze when you charge them, and your slashes stun longer.'],
    [9, 'Ambush Rush', 'Great whites strike from below at full speed. Prey freeze when you charge them, and your slashes stun longer.'],
    [10, 'Star Spots', 'Your pale spots dazzle in the sunlight. Prey freeze when you charge them, and your sweeps stun longer.']],
  gelskin: [[9, 'Thick Skin', 'Tough, thick skin over a layer of fat cushions every blow.']],
  stingproof: [[9, 'Tough Gullet', 'A tough mouth and gullet that take stings and spines. Jellyfish barely hurt you, and jellies are extra filling.']],
  // powers carried over to bodies that can't do them the same way
  puff: [[7, 'Spread Fins', 'ACTIVE: spread every fin and spine to look huge and spiky. Nothing can swallow or grab you, biters are spiked and other damage is halved, but you swim slowly and cannot eat.'],
    [9, 'Threat Display', 'ACTIVE: hunch your back, drop your fins and swim stiffly, as sharks do before they fight. Nothing can grab you, biters get hurt and other damage is halved, but you swim slowly and cannot eat.']],
  slash: [[8, 'Fin Slap', 'ACTIVE: a mighty swipe of your tall fins through everything in front of you. It stuns and hurts all it hits.'],
    [9, 'Head Shake', 'ACTIVE: a savage shake of your head and jaws through everything in front of you. It stuns and hurts all it hits.'],
    [10, 'Tail Sweep', 'ACTIVE: a sweep of your giant tail through everything in front of you. It stuns and hurts all it hits.']],
  photo: [[8, 'Silver Flash', 'ACTIVE: your skin flashes like a mirror in the light. Nearby animals are dazzled and lose track of you, hidden hunters show up, and deep-sea eyes are blinded.'],
    [9, 'Belly Flash', 'ACTIVE: roll and flash your bright white belly. Nearby animals are dazzled and lose track of you, hidden hunters show up, and deep-sea eyes are blinded.']],
  breach: [[10, 'Surface Rush', 'ACTIVE: surge up to the surface and crash back down. Nothing can touch you on the way, and the splash stuns and hurts everything around.']],
};
// def (a mutation definition) as it appears on a body of this stage: { ...def, name, desc, lv, was }
export function traitForm(def, stage) {
  const forms = def && TRAIT_FORMS[def.id];
  if (!forms) return def;
  let f = null;
  for (const e of forms) if ((stage | 0) >= e[0]) f = e;
  if (!f) return def;
  return { ...def, name: f[1], desc: f[2], lv: f[3] || def.lv, was: def.name };
}

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
  puff: 51, beak: 51, hover: 51, tetrodo: 52,
  slash: 61, sail: 61, warmeyes: 62, stripes: 62,
  breach: 71, gelskin: 71, stingproof: 72, cleaners: 72,
  sense: 81, serrated: 81, warmblood: 82, countershade: 82,
  filter: 91, remoras: 91, gillrakers: 92, deepdive: 92,
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
    case 'beak': return (pop.seaurchin | 0) >= 3 ? [1.7, 'sea urchins to crack'] : bossNear ? [1.5, 'a boss ahead'] : [1];
    case 'tetrodo': return hunters >= 9 ? [1.5, 'packs of predators'] : [1];
    case 'hover': case 'sail': return (hz.current | 0) >= 3 ? [1.4, 'strong currents'] : [1];
    case 'warmeyes': return L.dark ? [2.2, 'total darkness'] : [1];
    case 'stingproof': return (pop.jellyfish | 0) + (pop.nomura | 0) + (pop.manowar | 0) >= 6 || L.boss === 'lionsmane' ? [1.9, 'stinging jellies'] : [1];
    case 'gelskin': return hunters >= 9 ? [1.4, 'packs of predators'] : [1];
    case 'cleaners': return [1.1];
    case 'sense': return L.dark ? [2, 'total darkness'] : L.boss === 'giantsquid' ? [2, 'a hidden giant'] : [1];
    case 'serrated': return L.isBoss ? [1.6, 'a boss ahead'] : [1];
    case 'warmblood': return L.boss === 'sealions' || L.boss === 'orcas' ? [1.5, 'fast hunters'] : [1];
    case 'countershade': return hunters >= 9 ? [1.4, 'packs of predators'] : [1];
    case 'gillrakers': return (pop.krillcloud | 0) + (pop.eggcloud | 0) + (pop.baitball | 0) >= 6 ? [1.8, 'clouds of food'] : [1];
    case 'deepdive': return L.isBoss ? [1.5, 'a boss ahead'] : [1];
    case 'remoras': return [1.1];
    case 'stripes': return (pop.tuna | 0) + (pop.flyingfish | 0) >= 10 ? [1.5, 'schools of fish'] : [1];
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
  grouper: { id: 'grouper', name: 'Goliath Grouper', art: 'grouper', logic: 'colossus', hp: 3200, speed: 52, minions: ['triggerfish', 'parrotfish'], tagline: 'It swallows its prey whole' },
  squidpack: { id: 'squidpack', name: 'Humboldt Squid Pack', art: 'humboldt', logic: 'queen', hp: 3400, speed: 92, tagline: 'They hunt as one, talking in flashes', phases: 2 },
  thresher: { id: 'thresher', name: 'Thresher Shark', art: 'thresher', logic: 'colossus', hp: 3600, speed: 80, tagline: 'Its tail is as long as its body' },
  swordfish: { id: 'swordfish', name: 'Broadbill Swordfish', art: 'swordfish', logic: 'queen', hp: 3800, speed: 110, tagline: 'It hunts in the dark with heated eyes' },
  lionsmane: { id: 'lionsmane', name: 'Lion\u2019s Mane Jellyfish', art: 'lionsmane', logic: 'colossus', hp: 4600, speed: 40, tagline: 'Its tentacles are longer than a blue whale' },
  sealions: { id: 'sealions', name: 'Sea Lion Gang', art: 'sealion', logic: 'queen', hp: 4000, speed: 110, tagline: 'They want your fins', phases: 2 },
  tigershark: { id: 'tigershark', name: 'Tiger Shark', art: 'tigershark', logic: 'queen', hp: 4800, speed: 100, tagline: 'It eats anything. Anything.' },
  giantsquid: { id: 'giantsquid', name: 'Giant Squid', art: 'giantsquid', logic: 'queen', hp: 5000, speed: 90, tagline: 'The biggest eyes in the animal kingdom' },
  spermwhale: { id: 'spermwhale', name: 'Sperm Whale', art: 'spermwhale', logic: 'queen', hp: 5400, speed: 80, tagline: 'The loudest animal on Earth' },
  orcas: { id: 'orcas', name: 'Orca Pod', art: 'orca', logic: 'queen', hp: 5600, speed: 120, tagline: 'The top predator of the sea', phases: 2 },
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
  // ---- the pufferfish (levels 51–60) ----
  { n: 11, tier: 6, threat: 1.1, name: 'The Wreck', tag: 'A sunken ship, now a reef full of big fish', boss: 'grouper', sun: 0.5,
    pal: { bg: [18, 74, 82], edge: [3, 17, 22], caustic: [160, 235, 225], shaft: [200, 240, 225], plankton: [195, 235, 220], mote: [255, 220, 150], accent: [255, 170, 110] },
    pop: { parrotfish: 6, seaurchin: 5, triggerfish: 3, lionfish: 3, octopus: 2, reefshark: 2, seasnake: 2, seaturtle: 2, sardine: 10, barracuda: 3, moray: 2, squid: 3 }, hazards: { current: 2 }, phage: 0, food: 1.0 },
  { n: 12, tier: 6, threat: 1.15, name: 'Humboldt Current', tag: 'Cold, green water rising from the deep, thick with anchovies', boss: 'squidpack', sun: 0.4,
    pal: { bg: [14, 64, 72], edge: [2, 14, 20], caustic: [150, 235, 205], shaft: [175, 240, 215], plankton: [185, 245, 210], mote: [230, 255, 185], accent: [255, 120, 110] },
    pop: { humboldt: 5, jellyfish: 3, octopus: 2, seaturtle: 2, seaurchin: 4, triggerfish: 1, reefshark: 1, sardine: 16, squid: 4, barracuda: 2 }, hazards: { current: 3 }, phage: 0, food: 1.05 },
  // ---- the sailfish (levels 61–70) ----
  { n: 13, tier: 7, threat: 1.1, name: 'Sardine Run', tag: 'Deep-blue open sea, alive with shoals and hunters', boss: 'thresher', sun: 0.85,
    pal: { bg: [12, 70, 118], edge: [2, 16, 36], caustic: [150, 215, 255], shaft: [190, 230, 255], plankton: [185, 225, 255], mote: [255, 235, 170], accent: [120, 200, 255] },
    pop: { tuna: 8, flyingfish: 10, mahimahi: 4, dolphin: 3, hammerhead: 2, marlin: 1, manowar: 2, parrotfish: 3, humboldt: 3, reefshark: 2, triggerfish: 2 }, hazards: { current: 2 }, phage: 0, food: 1.0 },
  { n: 14, tier: 7, threat: 1.15, name: 'Night Blue', tag: 'The open ocean at night. Hunters see you long before you see them', boss: 'swordfish', sun: 0, dark: true,
    pal: { bg: [8, 22, 54], edge: [1, 3, 12], caustic: [110, 150, 255], shaft: [100, 130, 255], plankton: [150, 200, 255], mote: [170, 235, 255], accent: [140, 180, 255] },
    pop: { flyingfish: 7, tuna: 6, mahimahi: 3, manowar: 2, hammerhead: 2, marlin: 1, dolphin: 2, jellyfish: 2, humboldt: 4, octopus: 2 }, hazards: { current: 1 }, phage: 0, food: 1.0 },
  // ---- the ocean sunfish (levels 71–80) ----
  { n: 15, tier: 8, threat: 1.1, name: 'Jelly Bloom', tag: 'Warm water thick with drifting jellies', boss: 'lionsmane', sun: 0.7,
    pal: { bg: [40, 70, 112], edge: [8, 14, 34], caustic: [210, 190, 255], shaft: [230, 210, 255], plankton: [225, 205, 255], mote: [255, 220, 200], accent: [255, 160, 200] },
    pop: { jellyfish: 10, nomura: 3, salp: 6, pyrosome: 4, leatherback: 2, blueshark: 4, sealion: 3, manowar: 3, tuna: 5, flyingfish: 5, dolphin: 2 }, hazards: { current: 2 }, phage: 0, food: 1.0 },
  { n: 16, tier: 8, threat: 1.15, name: 'Cleaning Station', tag: 'A kelp-fringed reef where big fish come to be cleaned', boss: 'sealions', sun: 0.65,
    pal: { bg: [16, 78, 80], edge: [3, 18, 20], caustic: [170, 245, 215], shaft: [200, 250, 225], plankton: [195, 245, 220], mote: [255, 235, 170], accent: [255, 190, 120] },
    pop: { sealion: 5, blueshark: 4, leatherback: 1, salp: 4, pyrosome: 3, nomura: 2, jellyfish: 5, hammerhead: 2, marlin: 1, mahimahi: 3 }, hazards: { current: 2 }, phage: 0, food: 1.05 },
  // ---- the great white shark (levels 81–90) ----
  { n: 17, tier: 9, threat: 1.15, name: 'Seal Island', tag: 'Cold green water around a rock crowded with fur seals', boss: 'tigershark', sun: 0.6,
    pal: { bg: [28, 78, 92], edge: [5, 16, 22], caustic: [190, 240, 230], shaft: [210, 245, 235], plankton: [200, 240, 225], mote: [235, 230, 190], accent: [255, 200, 140] },
    pop: { furseal: 10, elephantseal: 2, mako: 2, bronzewhaler: 2, sixgill: 1, manta: 1, sealion: 4, blueshark: 2, leatherback: 1, salp: 3 }, hazards: { current: 2 }, phage: 0, food: 1.0 },
  { n: 18, tier: 9, threat: 1.1, name: 'White Shark Caf\u00e9', tag: 'A dark, empty patch of mid-ocean where great whites gather', boss: 'giantsquid', dark: true, sun: 0.1,
    pal: { bg: [8, 18, 44], edge: [1, 3, 10], caustic: [90, 130, 210], shaft: [80, 120, 200], plankton: [120, 190, 255], mote: [150, 210, 255], accent: [120, 200, 255] },
    pop: { mako: 2, bronzewhaler: 2, sixgill: 1, manta: 2, furseal: 6, elephantseal: 2, pyrosome: 5, salp: 4, nomura: 2, blueshark: 2 }, hazards: { current: 1 }, phage: 0, food: 1.0 },
  // ---- the whale shark (levels 91–100) ----
  { n: 19, tier: 10, threat: 1.2, name: 'Ningaloo Reef', tag: 'Warm, clear water where the coral spawns and whale sharks gather to feed', boss: 'spermwhale', sun: 0.85,
    pal: { bg: [30, 118, 140], edge: [6, 30, 44], caustic: [200, 255, 245], shaft: [225, 255, 245], plankton: [210, 255, 240], mote: [255, 225, 200], accent: [255, 170, 190] },
    pop: { krillcloud: 6, eggcloud: 5, baitball: 4, manta: 3, whitetip: 3, orca: 1, bluewhale: 1, furseal: 3, mako: 2, elephantseal: 2 }, hazards: { current: 2 }, phage: 0, food: 1.05 },
  { n: 20, tier: 10, threat: 1.25, name: 'The Big Blue', tag: 'The open ocean, kilometres deep, home of the biggest animals that ever lived', boss: 'orcas', sun: 0.75,
    pal: { bg: [16, 62, 132], edge: [3, 12, 34], caustic: [180, 220, 255], shaft: [200, 230, 255], plankton: [190, 225, 255], mote: [230, 240, 255], accent: [160, 220, 255] },
    pop: { krillcloud: 7, baitball: 5, eggcloud: 2, whitetip: 3, orca: 2, bluewhale: 2, manta: 2, mako: 2, bronzewhaler: 2, furseal: 3 }, hazards: { current: 3 }, phage: 0, food: 1.05 },
];

export const LEVELS_PER_HABITAT = 5;
// Habitats playable in this build. Later ones (and their bodies, traits and bosses) may already be defined here
// while their art is being made; they stay out of the game until this number reaches them.
export const LIVE_HABITATS = Math.min(HABITATS.length - 1, (globalThis.__TC_LIVE | 0) || 20); // __TC_LIVE: local testing only
export const TOTAL_LEVELS = LIVE_HABITATS * LEVELS_PER_HABITAT;
export const LIVE_STAGE = HABITATS[LIVE_HABITATS].tier; // the last body you can reach in this build
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
// Levels past the journey are expeditions through the habitats of your last body, five at a time (the fifth is a
// boss rematch that always teaches you a new trait). They keep getting harder, a little more gently than the journey.
export const OCEAN_HABS = [LIVE_HABITATS - 1, LIVE_HABITATS]; // your last body's two habitats
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

// Build the configuration for campaign level c (1..TOTAL_LEVELS, then the Open Ocean after it).
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
