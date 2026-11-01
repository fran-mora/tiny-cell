// Tiny Cell save data (localStorage).
const KEY = 'tinycell.save.v1';
const BAK = 'tinycell.save.v1.bak';

export function freshCampaign() {
  return { level: 1, best: 0, stage: 1, evo: { level: 1, xp: 0 }, muts: {}, mutOrder: [], attempts: {}, bosses: {}, complete: false };
}

export function defaultState() {
  return {
    version: 2,
    createdAt: Date.now(),
    campaign: freshCampaign(),
    codex: { microbes: {}, mutations: {} },
    totals: { attempts: 0, cleared: 0, deaths: 0, bossKills: 0, kills: 0, playTimeSec: 0, biomass: 0 },
    history: [],
    settings: { sfx: true, music: true, haptics: true, battery: false },
    flags: {},
  };
}

export const store = {
  state: null,
  migratedFromV1: false,
  load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) {
      try { this.state = migrate(JSON.parse(raw)); return; } catch (e) {
        try { const b = localStorage.getItem(BAK); if (b) { this.state = migrate(JSON.parse(b)); return; } } catch (e2) {}
      }
    }
    this.state = defaultState();
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
  wipe() { try { localStorage.removeItem(KEY); localStorage.removeItem(BAK); } catch (e) {} },
  // Start over. Replaces the in-memory state too: the app saves on pagehide, so wiping storage
  // alone would let the old progress be written straight back during the reload.
  reset() {
    const settings = this.state && this.state.settings;
    this.state = defaultState();
    if (settings) this.state.settings = { ...this.state.settings, ...settings }; // keep sound/vibration choices
    try { localStorage.removeItem(BAK); localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) {}
  },
  export() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.state)))); },
  import(str) { this.state = migrate(JSON.parse(decodeURIComponent(escape(atob(str.trim()))))); this.save(); },
};

function migrate(s) {
  const d = defaultState();
  if ((s.version | 0) < 2) {
    // v1 (roguelike with DNA shop) -> v2 (evolution journey): keep codex, settings and lifetime stats
    store.migratedFromV1 = true;
    const old = s;
    s = d;
    s.codex.microbes = { ...(old.codex?.microbes || {}) };
    s.codex.mutations = { ...(old.codex?.mutations || {}) };
    s.settings = { ...d.settings, ...(old.settings || {}) };
    s.totals.attempts = old.totals?.runs | 0;
    s.totals.bossKills = old.totals?.bossKills | 0;
    s.totals.kills = old.totals?.kills | 0;
    s.totals.playTimeSec = old.totals?.playTimeSec | 0;
    return s;
  }
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  for (const k of Object.keys(d.totals)) if (s.totals[k] === undefined) s.totals[k] = d.totals[k];
  for (const k of Object.keys(d.settings)) if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
  const c = s.campaign, dc = freshCampaign();
  for (const k of Object.keys(dc)) if (c[k] === undefined) c[k] = dc[k];
  if (!s.codex.microbes) s.codex.microbes = {};
  if (!s.codex.mutations) s.codex.mutations = {};
  return s;
}
