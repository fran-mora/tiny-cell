// Tiny Cell save data (localStorage).
const KEY = 'tinycell.save.v1';
const BAK = 'tinycell.save.v1.bak';

export function freshCampaign() {
  return { level: 1, best: 0, stage: 1, evo: { level: 1, xp: 0 }, muts: {}, mutOrder: [], attempts: {}, bosses: {}, complete: false, layout: 50, ocean: { level: 1, best: 0 } };
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
  if (c.layout !== 50) {
    // the journey grew from 48 levels in 8 habitats to 50 levels in 10, with a new body stage every 10 levels
    const map = (lv) => Math.max(1, Math.min(50, Math.round(((lv | 0) - 1) * 49 / 47) + 1));
    if (c.complete) { c.level = 50; c.best = 50; c.stage = 5; }
    else { c.best = c.best ? map(c.best) : 0; c.level = Math.max(1, map(c.level)); const hc = Math.floor(c.best / 5); c.stage = hc >= 8 ? 5 : hc >= 6 ? 4 : hc >= 4 ? 3 : hc >= 2 ? 2 : 1; }
    c.layout = 50; c.bosses = {};
  }
  if (!c.ocean || typeof c.ocean !== 'object') c.ocean = { level: 1, best: 0 };
  // powers come with bodies now (Build 18): saves that already have the bodies get their powers
  const POWERS = { 2: 'dash', 3: 'nova', 4: 'photo', 5: 'suction' };
  for (const [st, id] of Object.entries(POWERS)) if ((c.stage | 0) >= +st && !c.muts[id]) { c.muts[id] = 1; if (!c.mutOrder.includes(id)) c.mutOrder.push(id); }
  if (c.complete && !c.muts.shoal) { c.muts.shoal = 1; if (!c.mutOrder.includes('shoal')) c.mutOrder.push('shoal'); }
  if (!s.codex.microbes) s.codex.microbes = {};
  if (!s.codex.mutations) s.codex.mutations = {};
  return s;
}
