// Ocean Ages: the long-term progression of Tiny Cell. Each age makes the water richer,
// brings new species, toughens the bosses and pays more DNA.
export const AGES = [
  null,
  { n: 1, name: 'Barren Sea', color: '#8fd8ff', blurb: 'A dark young ocean with little to eat.', goal: 'Reach depth 2', check: (t) => t.bestDepth >= 2 },
  { n: 2, name: 'First Bloom', color: '#7cf0c8', blurb: 'Food drifts in thicker clouds.', goal: 'Reach depth 3', check: (t) => t.bestDepth >= 3 },
  { n: 3, name: 'Teeming Waters', color: '#9be36d', blurb: 'Fast, hairy Ciliates have appeared.', goal: 'Defeat the Colossal Amoeba', check: (t) => t.bossKills >= 1 },
  { n: 4, name: 'Living Reef', color: '#ffd36e', blurb: 'Rotifers spin their crowns in the deep.', goal: 'Reach depth 5', check: (t) => t.bestDepth >= 5 },
  { n: 5, name: 'Green Sea', color: '#7fe08a', blurb: 'Great Volvox colonies roll through the water.', goal: 'Defeat the Phage Queen', check: (t) => t.wins >= 1 },
  { n: 6, name: 'Ancient Ocean', color: '#c79cff', blurb: 'The richest, most dangerous waters of all.', goal: null, check: () => false },
];

export const roman = (n) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] || String(n);
export const dnaMultFor = (age) => 1 + 0.1 * (age - 1);

// returns the new age if progress unlocked one or more ages
export function advanceAge(st) {
  let changed = false;
  while (st.age < 6 && AGES[st.age].check(st.totals)) { st.age++; changed = true; }
  return changed;
}
