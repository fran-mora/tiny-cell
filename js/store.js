// Tiny Cell save data (localStorage), with a one-time import from Tiny World on the same site.
const KEY = 'tinycell.save.v1';
const BAK = 'tinycell.save.v1.bak';
const TW_KEY = 'tinyworld.save.v1';

export function defaultState() {
  return {
    version: 1,
    createdAt: Date.now(),
    dna: 0,
    genome: {},
    codex: { microbes: {}, mutations: {} },
    totals: { runs: 0, wins: 0, bestDepth: 0, bestLevel: 0, bossKills: 0, kills: 0, dnaEarned: 0, playTimeSec: 0, bestTime: 0 },
    history: [],
    lastMuts: {},
    settings: { sfx: true, music: true, haptics: true, battery: false },
    flags: {},
    age: 1,
  };
}

export const store = {
  state: null,
  imported: null,
  load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try { this.state = migrate(JSON.parse(raw)); return; } catch (e) {
        try { const b = localStorage.getItem(BAK); if (b) { this.state = migrate(JSON.parse(b)); return; } } catch (e2) {}
      }
    }
    this.state = defaultState();
    this.imported = importTinyWorld(this.state);
    this.save();
  },
  save() {
    if (!this.state) return;
    try {
      const prev = localStorage.getItem(KEY);
      if (prev) localStorage.setItem(BAK, prev);
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch (e) { console.warn('save failed', e); }
  },
  wipe() {
    try { localStorage.removeItem(KEY); localStorage.removeItem(BAK); } catch (e) {}
  },
  export() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); },
  import(str) { this.state = migrate(JSON.parse(decodeURIComponent(escape(atob(str.trim()))))); this.save(); },
};

function migrate(s) {
  const d = defaultState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  for (const k of Object.keys(d.totals)) if (s.totals[k] === undefined) s.totals[k] = d.totals[k];
  for (const k of Object.keys(d.settings)) if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
  if (!s.codex.microbes) s.codex.microbes = {};
  if (!s.codex.mutations) s.codex.mutations = {};
  return s;
}

// Carry over the microbe progress made inside Tiny World (same origin => same localStorage).
function importTinyWorld(st) {
  try { if (localStorage.getItem('tinycell.noimport')) return null; } catch (e) {}
  let tw = null;
  try { const raw = localStorage.getItem(TW_KEY); if (raw) tw = JSON.parse(raw); } catch (e) { return null; }
  if (!tw) return null;
  const genome = tw.genome || {};
  const nGenes = Object.values(genome).reduce((a, b) => a + (b | 0), 0);
  const runs = tw.totals?.runs | 0;
  if (!nGenes && !runs) return null;
  st.genome = { ...genome };
  st.codex.microbes = { ...(tw.codex?.microbes || {}) };
  st.codex.mutations = { ...(tw.codex?.mutations || {}) };
  st.totals.runs = runs;
  st.totals.wins = tw.totals?.runWins | 0;
  st.totals.bestDepth = tw.totals?.bestDepth | 0;
  st.totals.bestLevel = tw.totals?.bestLevel | 0;
  st.totals.bossKills = tw.totals?.bossKills | 0;
  st.dna = Math.max(0, Math.round(tw.dna || 0));
  return { genes: nGenes, runs, dna: st.dna };
}
