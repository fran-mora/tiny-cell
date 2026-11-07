// Microbe mode — the action roguelike run: simulation, rendering, HUD, overlays.
import { el, icon, fmt } from '../ui.js';
import { audio, haptic } from '../audio.js';
import { RNG, clamp, lerp } from '../rng.js';
import * as D from './data.js';
import * as C from './campaign.js';
import { drawSpecies, drawPlayer, drawPilotFish, drawKin, glowSprite, makeCausticTile, makeShaft, portrait, mixRGB, rgbStr, WHITE, CREATURE_ART, BOSS_ART } from './art.js';
// boss portraits for the codex and journey: which body each boss is drawn with
Object.assign(BOSS_ART, { giantamoeba: { base: 'colossus', col: null }, virus: { base: 'queen', col: null }, abyssal: { base: 'angler', col: null }, progenitor: { base: 'siphboss', col: null }, grouper: { base: 'grouper', col: null }, squidpack: { base: 'humboldt', col: null }, thresher: { base: 'thresher', col: null }, swordfish: { base: 'swordfish', col: null }, lionsmane: { base: 'lionsmane', col: null }, sealions: { base: 'sealion', col: null }, tigershark: { base: 'tigershark', col: null }, giantsquid: { base: 'giantsquid', col: null }, spermwhale: { base: 'spermwhale', col: null }, orcas: { base: 'orca', col: null } });
import { injectStyle, releaseStyle } from './style.js';
import { Cinematics } from './cinematics.js';
import { Threats, THREAT_INFO } from './threats.js';
import { Bosses, BOSS_KIT } from './bosses.js';
import { Abilities, ABILITIES, ABILITY_BY_ID } from './abilities.js';
import { SP, tierScale } from './ecology.js';

const TAU = Math.PI * 2;
const { sin, cos, atan2, hypot, min, max, abs, sqrt, exp, floor, random, PI } = Math;
const MAX_ENT = 250, MAX_MOTES = 200;
// how the water looks at each scale of life
const LOOK = {
  1: { caustic: 1, snow: 0, silhouettes: 0 },
  2: { caustic: 0.85, snow: 0.2, silhouettes: 0 },
  3: { caustic: 0.5, snow: 0.7, silhouettes: 0 },
  4: { caustic: 0.3, snow: 0.8, silhouettes: 0.7 },
  5: { caustic: 0.15, snow: 1, silhouettes: 1 },
};
const HOSTILE = Object.fromEntries(Object.keys(SP).filter((k) => SP[k].hostile && k !== 'mine').map((k) => [k, 1]));
const isLatcher = (e) => !!(SP[e.kind] && SP[e.kind].latch);
const isTiny = (e) => e.kind === 'phage' || e.kind === 'chytrid'; // viruses and spores: shredded on contact
const PUFF_GROW = 0.55; // an inflated pufferfish is this much wider (art and collisions agree)
const shelled = (e) => e.kind === 'diatom' || !!(SP[e.kind] && SP[e.kind].shell); // diatoms, sea urchins
const KIND_XP = Object.fromEntries(Object.entries(SP).map(([k, v]) => [k, v.xp]));
const TURNED = new Set(); // old predators you have met as prey this session
const angDiff = (a, b) => { const d = b - a; if (!Number.isFinite(d)) return 0; return ((d + PI) % TAU + TAU) % TAU - PI; };

// Repeatable rewards offered once every mutation is maxed (or to fill a short hand).
const mutDef = (id) => D.MUT_BY_ID[id] || C.NEW_MUT_BY_ID[id];
const BOONS = [
  { id: 'renew', boon: true, icon: 'mito', name: 'Renewal', rarity: 'common', desc: 'Your body rebuilds itself. Fully heals you and makes you tougher.', eff: 'Full heal, +10 max HP' },
  { id: 'cache', boon: true, icon: 'vacuole', name: 'Genetic Cache', rarity: 'rare', desc: 'Bank your surplus genes for later.', eff: '+4 DNA this run' },
  { id: 'vigor', boon: true, icon: 'flagellum', name: 'Vigor', rarity: 'common', desc: 'A surge of metabolism.', eff: '+6% speed and biomass' },
];
const CAMP_BOONS = [BOONS[0], { id: 'insight', boon: true, icon: 'biolum', name: 'Insight', rarity: 'rare', desc: 'A flash of genetic insight.', eff: 'Half an evolution bar, now' }, BOONS[2]];

export function startGame(opts) {
  const g = new MicrobeGame(opts);
  return g;
}

class MicrobeGame {
  constructor(opts) {
    this.o = opts;
    this.host = opts.host;
    this.camp = opts.campaign || null;
    this.introKind = opts.intro || 'dive';
    this.L = this.camp ? C.levelConfig(this.camp.level) : null;
    this.era = this.camp ? 3 : clamp(opts.era | 0 || 1, 1, 6);
    this.genome = opts.genome || {};
    if (this.camp) { const st = this.camp.stage | 0 || 1; this.genome = { splice: st >= 2 ? 1 + (st >= 4 ? 1 : 0) : 0, wide: st >= 3 ? 1 : 0 }; }
    this.codex = opts.codex || { microbes: {}, mutations: {} };
    this.settings = opts.settings || {};
    this.firstRun = !!opts.firstRun;
    this.dnaMult = max(1, opts.dnaMult || 1);
    this.onExit = typeof opts.onExit === 'function' ? opts.onExit : () => {};
    this.onSettings = typeof opts.onSettings === 'function' ? opts.onSettings : () => {};
    this.battery = !!this.settings.battery;
    this.rng = new RNG((Date.now() ^ 0x5bd1e995) >>> 0);
    this.listeners = []; this.timeouts = [];
    this.exited = false; this.destroyed = false; this.raf = 0;
    this.T = 0; this.time = 0; this.paused = false; this.modal = null;
    this.depth = 1; this.depthTime = 0; this.depthsCleared = 0;
    this.ents = []; this.motes = []; this.parts = []; this.shards = []; this.texts = []; this.hazards = []; this.clouds = [];
    this.boss = null; this.bossSpawned = false; this.bossDefeated = false;
    this.stats = { kills: 0, miniKills: 0, finalKills: 0, biomass: 0, eaten: 0 };
    this.disc = { microbes: [], mutations: [] }; this.seen = {};
    this.mutOrder = [];
    this.shake = 0; this.flash = 0; this.slowmo = 1;
    this.combo = 0; this.comboT = 0;
    this.boons = {}; this.boonHp = 0; this.bonusDNA = 0; this.boonMult = 1;
    this.pendingLevels = 0; this.rerolls = this.genome.splice | 0;
    this.reviveLeft = (this.genome.cystmem | 0) > 0 ? 1 : 0;
    this.trans = null; this.dead = false; this.victory = false; this.abandoned = false;
    this.hints = { moved: 0, shown: {} };
    this.invuln = false;
    this.input = { jx: 0, jy: 0, mag: 0, active: false, ox: 0, oy: 0, cx: 0, cy: 0, id: null };
    this.keys = {};
    this.pal = D.PALETTES[0].bg.slice();
    this.palT = this.makePal(0);
    this.palCur = this.makePal(0);

    const g = this.genome;
    this.p = {
      x: 0, y: 0, vx: 0, vy: 0, r: D.playerRadius(1), ang: -PI / 2, seed: 0.42,
      level: 1, xp: 0, hp: 100, maxHp: 100, muts: {}, iframes: 0, flashT: 0, dent: 0, dentA: 0, stretch: 0,
      cyst: 0, cystUsed: false, dashT: 0, dashCd: 0, novaCd: 0, photoCd: 0, shoalCd: 0, suckCd: 0, suckT: 0, puffCd: 0, puffT: 0, puffK: 0, slashCd: 0, slashT: 0, slashK: 0, slashDir: 1, sailK: 0, stripeK: 0, stripeT: 0, breachCd: 0, breachT: 0, breachK: 0, senseCd: 0, senseT: 0, senseK: 0, filterCd: 0, filterT: 0, filterK: 0, frozenT: 0, flipK: 0, toxinT: 3, latched: 0, wiggle: 0, lastVA: 0, speedN: 0, wob: 0,
    };
    this.gained = [];
    if (this.camp) {
      this.p.muts = { ...(this.camp.muts || {}) };
      this.p.stage = this.camp.stage | 0 || 1;
      this.mutOrder = (this.camp.mutOrder || Object.keys(this.p.muts)).filter((id) => this.p.muts[id]);
      this.evo = { level: this.camp.evo?.level | 0 || 1, xp: this.camp.evo?.xp || 0 };
      this.firstRun = this.camp.level === 1 && !(this.camp.attempts | 0) && !this.mutOrder.length;
      if (this.camp.newPower) this.later(2600, () => this.hint('ab_new', `New power: ${C.POWER_NAMES[this.camp.newPower] || 'ability'}! Tap its new button`, 'bolt', 4500));
    }
    this.recalc(); this.p.hp = this.p.maxHp;

    injectStyle();
    this.buildDOM();
    this.buildArt();
    this.resize();
    // camera zoom must exist before the first spawns (ringPos uses it)
    this.zoomV = clamp(min(this.W, this.H) * 0.06 / this.p.r, 0.32, 1.45);
    this.on(window, 'resize', () => this.resize());
    this.on(window, 'keydown', (e) => this.onKey(e, true));
    this.on(window, 'keyup', (e) => this.onKey(e, false));
    this.on(window, 'blur', () => { this.keys = {}; this.releaseStick(); });
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.pause(true); });
    const cv = this.canvas;
    this.on(cv, 'pointerdown', (e) => this.onDown(e));
    this.on(window, 'pointermove', (e) => this.onMove(e));
    this.on(window, 'pointerup', (e) => this.onUp(e));
    this.on(window, 'pointercancel', (e) => this.onUp(e));
    this.on(cv, 'contextmenu', (e) => e.preventDefault());
    this.on(this.root, 'touchmove', (e) => { if (!e.target.closest('.mb-results, .mb-scroll')) e.preventDefault(); }, { passive: false });
    this.on(this.root, 'gesturestart', (e) => e.preventDefault());

    if (this.settings.music !== false) audio.music('microbe');
    this.enterDepth(this.camp ? this.L.j : 1, true);
    if (this.camp) { this.buildAbilities(); this.cineStart(this.introKind); }
    this.last = performance.now();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    if (!this.camp && (g.headstart | 0) > 0) { this.headstartLeft = g.headstart | 0; this.later(400, () => this.offerHeadstart()); }
    if (this.firstRun) this.later(700, () => this.hint('move', 'Drag anywhere to swim', 'hand', 6000, true));
  }

  // ---------- utils ----------
  on(t, ev, fn, o) { t.addEventListener(ev, fn, o); this.listeners.push([t, ev, fn, o]); }
  later(ms, fn) { const id = setTimeout(() => { this.timeouts = this.timeouts.filter((x) => x !== id); if (!this.destroyed) fn(); }, ms); this.timeouts.push(id); return id; }
  sfx(n, o) { if (this.settings.sfx !== false) audio.sfx(n, o); }
  buzz(p) { if (this.settings.haptics !== false) haptic(p); }
  makePal(i) {
    const P = this.camp ? this.L.pal : D.PALETTES[i]; const o = {}; for (const k in P) o[k] = P[k].slice();
    if (this.camp) { for (const k of ['bg', 'edge']) for (let j = 0; j < 3; j++) o[k][j] = o[k][j] * 0.92; } else this.eraTint(o);
    return o;
  }
  eraTint(o) {
    const e = this.era - 1;
    const green = [20, 110, 70];
    mixRGB(o.bg, green, min(0.3, e * 0.06), o.bg);
    const dark = e === 0 ? 0.78 : 0.9 + e * 0.04;
    for (const k of ['bg', 'edge']) for (let j = 0; j < 3; j++) o[k][j] = min(255, o[k][j] * dark);
    mixRGB(o.plankton, [150, 255, 170], min(0.4, e * 0.08), o.plankton);
  }
  get engulf() {
    const m = this.p.muts;
    return this.camp ? min(C.TUNE.engulfCap, 0.85 + 0.04 * (m.pseudopod | 0) + 0.02 * (m.jaws | 0)) : 0.85 + 0.07 * (m.pseudopod | 0) + 0.06 * (m.jaws | 0);
  }
  canEat(e) { return !e.boss && !e.ally && e.kind !== 'colossus' && e.kind !== 'queen' && e.kind !== 'siphonophore' && !(SP[e.kind] && SP[e.kind].inedible) && !(e.armor > 0 && shelled(e)) && e.r < this.p.r * this.engulf && ((this.p.stage | 0) < 10 || (SP[e.kind] && SP[e.kind].filter) || e.r < this.p.r * 0.38); } // a whale shark only swallows what fits its filter

  recalc() {
    const p = this.p, m = p.muts, g = this.genome;
    const oldMax = p.maxHp;
    const stageHp = 1 + 0.15 * ((p.stage | 0 || 1) - 1);
    p.maxHp = Math.round(100 * stageHp * (1 + 0.15 * (g.hp | 0)) + 25 * (m.membrane | 0) + 40 * (m.shell | 0) + 30 * (m.gelskin | 0) + 40 * (m.deepdive | 0) + (this.boonHp | 0));
    if (p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
    p.hp = min(p.hp, p.maxHp);
    p.r0 = D.playerRadius(p.level); p.r = p.r0 * (1 + ((p.stage | 0) === 6 ? PUFF_GROW : 0) * (p.puffK || 0)); // r0: your size; r: grows while inflated (pufferfish only)
    let sm = (1 + 0.06 * (g.motor | 0)) * (1 + 0.12 * (m.flagellum | 0)) * (1 + 0.1 * (m.muscle | 0)) * (1 + 0.12 * (m.fins | 0)) * (1 + 0.08 * (m.sail | 0)) * (1 + 0.07 * (m.warmblood | 0));
    if (this.camp && sm > C.TUNE.speedSoft) sm = C.TUNE.speedSoft + (sm - C.TUNE.speedSoft) * C.TUNE.speedK; // stacked speed has diminishing returns
    this.speedMult = sm * Math.min(1.5, this.boonMult || 1);
    this.accel = 5.5 * (1 + 0.25 * (m.cilia | 0)) * (1 + 0.2 * (m.muscle | 0)) * (1 + 0.12 * (m.fins | 0)) * (1 + 0.2 * (m.hover | 0)) * (1 + 0.1 * (m.sail | 0)) * (1 + 0.1 * (m.warmblood | 0));
    this.reach = (1 + 0.15 * (m.cilia | 0)) * (1 + 0.1 * (m.nerve | 0));
    let mg = (1 + 0.4 * (m.biolum | 0)) * (1 + 0.2 * (g.sensory | 0)) * (1 + 0.25 * (m.signal | 0)) * (1 + 0.3 * (m.eyes | 0)) * (1 + 0.3 * (m.tentacles | 0)) * (1 + 0.15 * (m.sail | 0)) * (1 + 0.25 * (m.warmeyes | 0)) * this.reach;
    if (this.camp && mg > 2.2) mg = 2.2 + Math.log(mg / 2.2) * 0.55; // stacked lures have diminishing returns (x34 becomes about x3.7)
    this.magnet = (55 + p.r * 2.2) * mg;
    this.xpMult = (1 + 0.1 * (g.digest | 0)) * (1 + 0.15 * (m.vacuole | 0)) * (1 + 0.12 * (m.polyps | 0)) * (1 + 0.08 * (m.countershade | 0)) * (1 + 0.15 * (m.remoras | 0)) * (this.boonMult || 1);
    this.regen = 0.5 * (m.mito | 0) + 0.8 * (m.gills | 0) + 0.6 * (m.cleaners | 0) + 0.4 * (m.remoras | 0);
    this.stingMult = max(0.1, 1 - 0.3 * (m.stingproof | 0)); // a jelly-eater's mouth
    this.hazMult = 1 - 0.25 * (m.osmo | 0);
    this.sight = max(0.25, (1 - 0.22 * (m.mimicry | 0)) * (1 - 0.12 * (m.signal | 0)) * (1 - 0.12 * (m.countershade | 0)) * (1 - 0.08 * (m.deepdive | 0)));
    this.armor = min(this.camp ? C.TUNE.armorCap : 0.6, 0.08 * (m.guard | 0) + 0.05 * (m.shell | 0) + 0.1 * (m.hide | 0) + 0.06 * (m.gelskin | 0) + 0.06 * (m.deepdive | 0));
    this.biteMult = (1 + 0.3 * (m.jaws | 0)) * (1 + 0.15 * (m.eyes | 0)) * (1 + 0.15 * (m.serrated | 0));
    this.auraDps = ((m.cnido | 0) ? 6 + 6 * m.cnido : 0) + 8 * (m.tentacles | 0);
    this.iframeBonus = 0.15 * (m.nerve | 0);
  }

  // ---------- DOM ----------
  buildDOM() {
    const root = this.root = el('div.mb-root');
    if (this.camp) root.classList.add('mb-intro'); // HUD starts hidden and slides in after the arrival
    this.canvas = el('canvas.mb-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    root.appendChild(this.canvas);
    const hud = this.hud = el('div.mb-hud');
    this.hpBar = el('i'); this.hpNum = el('span.num', {}, '100');
    this.hpStat = el('div.mb-stat.mb-hp', {}, [icon('heart'), el('div.bar.hp', {}, this.hpBar), this.hpNum]);
    this.xpBar = el('i'); this.lvEl = el('span.mb-lv', {}, 'Lv 1');
    const xpStat = el('div.mb-stat', {}, [this.lvEl, el('div.bar.xp', {}, this.xpBar)]);
    this.dnaNum = el('span', {}, '0');
    this.dnaChip = el('div.chip.mb-dna', {}, [icon('dna'), this.dnaNum]);
    const pauseBtn = el('button.icon-btn.mb-pause.mb-tap', { 'aria-label': 'Pause', onpointerdown: (e) => e.stopPropagation(), onclick: () => { this.sfx('click'); this.pause(true); } }, icon('pause'));
    this.depthLabel = el('div.mb-depth-label', {}, '');
    this.depthBar = el('i'); this.pips = el('div.mb-pips');
    this.depthBox = el('div.mb-depth', {}, [this.depthLabel, el('div.bar', {}, this.depthBar), this.pips]);
    this.hurtEl = el('div.mb-hurtwhy');
    hud.appendChild(el('div.mb-top', {}, [el('div.mb-row', {}, [this.hpStat, xpStat, this.dnaChip, pauseBtn]), this.hurtEl, this.depthBox]));
    this.abBox = el('div.mb-abilities'); hud.appendChild(this.abBox);
    this.toasts = el('div.mb-toasts'); hud.appendChild(this.toasts);
    this.flashEl = el('div.mb-flash'); this.fadeEl = el('div.mb-fade');
    root.appendChild(hud); root.appendChild(this.flashEl); root.appendChild(this.fadeEl);
    this.host.appendChild(root);
    this.abBtns = {};
    this.hudCache = {};
  }

  buildArt() {
    this.caustic = makeCausticTile(256, 11);
    this.shaft = makeShaft();
    this.tinted = {};
    this.plankton = [];
    const n = this.battery ? 45 : 90;
    for (let i = 0; i < n; i++) this.plankton.push({ x: random(), y: random(), z: 0.15 + random() * 0.75, s: 0.5 + random() * 1.6, ph: random() * TAU });
  }
  tint(img, c) {
    const k = c.join(',') + (img === this.caustic ? 'c' : 's');
    if (this.tinted[k]) return this.tinted[k];
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = rgbStr(c); g.fillRect(0, 0, cv.width, cv.height);
    const keys = Object.keys(this.tinted); if (keys.length > 12) delete this.tinted[keys[0]];
    return (this.tinted[k] = cv);
  }

  resize() {
    const r = this.root.getBoundingClientRect();
    this.W = max(1, r.width); this.H = max(1, r.height);
    this.dpr = this.battery ? 1 : min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.W * this.dpr); this.canvas.height = Math.round(this.H * this.dpr);
    this.bgGrad = null; this.vig = null; this.redVig = null; this.dmgVig = null; this.frozenFrames = 0;
  }

  // ---------- input ----------
  onKey(e, down) {
    if (this.destroyed) return;
    const k = e.key.toLowerCase();
    if (down && (k === 'p' || k === 'escape')) { e.preventDefault(); if (this.modal === 'pause') this.resume(); else if (!this.modal) this.pause(true); return; }
    // only the powers you brought into this level have keys (Space = your first button)
    if (down && k === ' ') { e.preventDefault(); if (!this.modal) { const id = Object.keys(this.abBtns)[0]; if (id) this[ABILITY_BY_ID[id].use](); } return; }
    if (down && k === 'shift') { if (!this.modal && this.abBtns.nova) this.useNova(); return; }
    const A = down && ABILITIES.find((a) => a.key === k && a.key !== ' ');
    if (A) { if (!this.modal && this.abBtns[A.id]) this[A.use](); return; }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { e.preventDefault(); this.keys[k] = down; }
  }
  onDown(e) {
    if (this.modal || this.input.id != null) return;
    e.preventDefault();
    const r = this.root.getBoundingClientRect();
    const I = this.input; I.id = e.pointerId; I.active = true;
    I.ox = I.cx = e.clientX - r.left; I.oy = I.cy = e.clientY - r.top; I.mag = 0; I.jx = 0; I.jy = 0;
  }
  onMove(e) {
    const I = this.input; if (e.pointerId !== I.id) return;
    const r = this.root.getBoundingClientRect();
    I.cx = e.clientX - r.left; I.cy = e.clientY - r.top;
    let dx = I.cx - I.ox, dy = I.cy - I.oy; const d = hypot(dx, dy); const R = 62;
    if (d > R * 1.6) { I.ox = I.cx - dx / d * R * 1.6; I.oy = I.cy - dy / d * R * 1.6; dx = I.cx - I.ox; dy = I.cy - I.oy; }
    const dd = hypot(dx, dy);
    I.mag = dd < 5 ? 0 : min(1, (dd - 5) / (R - 5));
    if (dd > 0.01) { I.jx = dx / dd; I.jy = dy / dd; }
  }
  onUp(e) { if (e.pointerId === this.input.id) this.releaseStick(); }
  releaseStick() { const I = this.input; I.id = null; I.active = false; I.mag = 0; }
  moveDir() {
    const k = this.keys; let x = 0, y = 0;
    if (k.a || k.arrowleft) x -= 1; if (k.d || k.arrowright) x += 1; if (k.w || k.arrowup) y -= 1; if (k.s || k.arrowdown) y += 1;
    if (x || y) { const d = hypot(x, y); return [x / d, y / d, 1]; }
    const I = this.input; if (I.active && I.mag > 0) return [I.jx, I.jy, I.mag];
    return [0, 0, 0];
  }

  // ---------- flow ----------
  enterDepth(n, first = false) {
    this.depth = n; this.depthTime = 0;
    this.D = this.camp ? { name: this.L.name, dur: this.L.dur, sun: this.L.sun, pop: this.L.pop, hazards: this.L.hazards, phageEvery: this.L.phageEvery, boss: this.L.boss } : D.DEPTHS[n - 1];
    this.palT = this.makePal(n - 1);
    if (first) this.palCur = this.makePal(n - 1);
    this.ents.length = 0; this.motes.length = 0; this.shards.length = 0; this.hazards.length = 0; this.clouds.length = 0;
    this.boss = null; this.bossSpawned = false; this.bossDefeated = false;
    this.p.cystUsed = false; this.p.latched = 0;
    this.phageT = this.D.phageEvery ? this.D.phageEvery * 0.7 : 0;
    // fill initial world
    for (let i = 0; i < (70 + this.era * 8) * (this.L ? this.L.food : 1); i++) this.spawnMote(this.p.x + (random() - 0.5) * 1400, this.p.y + (random() - 0.5) * 1800, 1);
    this.populate(true);
    this.renderPips();
    if (this.camp) this.levelBanner();
    else this.banner(`Depth ${n}`, this.D.name, n === 5 ? 'danger' : '');
    // re-spawn clones near player
    for (let i = 0; i < (this.p.muts.fission | 0); i++) this.spawnClone(i);
  }
  renderPips() {
    this.pips.innerHTML = '';
    if (this.camp) {
      for (let i = 1; i <= C.LEVELS_PER_HABITAT; i++) {
        const boss = i === C.LEVELS_PER_HABITAT;
        this.pips.appendChild(el(boss ? 'i.boss' : 'i', { class: (i < this.L.j || (boss && this.bossDefeated) ? 'on' : '') + (i === this.L.j && !boss ? ' cur' : '') }));
      }
      return;
    }
    for (let i = 1; i <= 5; i++) {
      this.pips.appendChild(el('i', { class: (i < this.depth ? 'on' : '') + (i === this.depth ? ' cur' : '') }));
      if (D.DEPTHS[i - 1].boss) this.pips.appendChild(el('i.boss', { class: i < this.depth || (i === this.depth && this.bossDefeated) ? 'on' : '' }));
    }
  }
  descend() {
    if (this.trans || this.dead || this.victory) return;
    if (this.descendedFrom === this.depth) return; // never descend twice from the same depth
    this.descendedFrom = this.depth;
    this.depthsCleared = max(this.depthsCleared, this.depth);
    if (this.camp) { this.levelComplete(); return; }
    if (this.depth >= 5) { this.win(); return; }
    this.sfx('descend'); this.buzz([20, 40, 20]);
    this.trans = { t: 0, dur: 2.4, swapped: false };
    this.p.iframes = 3;
  }
  win() {
    if (this.dead || this.victory) return;
    this.victory = true; this.sfx('victory'); this.buzz([30, 50, 30, 50, 80]);
    this.banner('Victory', 'You reached the Vent of Origins', 'gold');
    this.later(2600, () => this.showResults());
  }
  die() {
    if (this.dead || this.victory) return;
    const p = this.p;
    if (p.muts.cyst && !p.cystUsed) {
      p.cystUsed = true; p.hp = p.maxHp * (0.25 + 0.15 * (p.muts.cyst - 1)); p.cyst = 1.6; p.iframes = 1.8;
      this.sfx('evolve'); this.buzz(60); this.toast('Cyst', 'Survived a lethal hit!', 'cyst', 'mutation');
      this.burst(p.x, p.y, [255, 220, 150], 24, 200); return;
    }
    if (this.reviveLeft > 0) {
      this.reviveLeft--; p.hp = p.maxHp * [0, 0.3, 0.6][min(2, this.genome.cystmem | 0)]; p.iframes = 2.5; p.cyst = 2;
      this.sfx('evolve'); this.buzz([40, 40, 80]); this.toast('Cyst Memory', 'Revived from a dormant cyst', 'cystmem', 'genome');
      this.shockwave(p.x, p.y, p.r * 9, 30, true); return;
    }
    this.dead = true; p.hp = 0;
    this.sfx('death');
    this.startDeathFx(); // shows the results when the animation ends
  }

  // ---------- spawning ----------
  spawnMote(x, y, v = 1, fade = 0) {
    if (this.motes.length >= MAX_MOTES) return null;
    const m = { x, y, vx: (random() - 0.5) * 10, vy: (random() - 0.5) * 10, v, ph: random() * TAU, s: 0.8 + random() * 0.5 * min(3, v), a: fade ? 0 : 1, life: 0 };
    this.motes.push(m); return m;
  }
  expR() { return this.L ? this.L.expectedR : D.expectedRadius(this.depth); }
  Es() { return 0.5 * this.expR() + 0.5 * this.p.r; }
  spawn(kind, x, y, o = {}) {
    if (this.ents.length >= MAX_ENT && !o.force) return null;
    const S = SP[kind] || {};
    // creatures from the scale below yours are small now; two scales down they are too small to see
    const ts = this.camp && !o.r ? tierScale(kind, this.p.stage) : 1;
    if (ts <= 0) return null;
    const track = this.camp && HOSTILE[kind] && !S.latch && kind !== 'siphonophore';
    const E = o.E || (track ? (1 - C.TUNE.track) * this.expR() + C.TUNE.track * this.p.r : this.Es()), R = this.rng, dp = this.depth;
    let sz = S.size || [1, 1];
    if (track && kind === 'hunter') { const c1 = this.L.c - 1; sz = [0.7 + min(0.12, C.TUNE.huntMin * c1), 1.5 + C.TUNE.huntMax * c1]; } // a few hunters are small enough to eat, fewer later on
    const r = o.r || E * R.float(sz[0], sz[1]) * ts;
    const szK = track && !o.r && this.camp && ts === 1 ? r / E : 0;
    const spd = kind === 'hunter' ? 92 + 7 * dp : (S.spd ?? 40);
    const chaser = this.camp && (S.ai === 'hunter' || S.ai === 'rotifer' || S.ai === 'lurker' || S.ai === 'tough' || S.ai === 'sprinter' || S.ai === 'inker');
    const e = {
      kind, x, y, vx: 0, vy: 0, r, ang: R.float(0, TAU), seed: R.float(0, 10), t: 0, alive: true,
      spd: spd * Math.pow(r / 15, S.latch ? 0 : chaser ? 0.45 : 0.25), hp: 0, maxHp: 0, flash: 0, dent: 0, dentA: 0, stretch: 0,
      wander: R.float(0, TAU), timer: R.float(0, 2), chasing: false, hitCd: 0, latched: false, la: 0, armor: 0, armorMax: 0, kids: 5, edibleCache: false, spawnFade: 0,
    };
    e.hp = e.maxHp = (6 + r * r * 0.08 * (1 + 0.25 * (dp - 1))) * (this.L ? this.L.hpMult * this.stageThreat(C.TUNE.stageHp) : 1);
    if (this.L) e.spd *= this.L.spdMult;
    if (kind === 'diatom') { e.armor = e.armorMax = 2 + (dp >= 3 ? 1 : 0); }
    else if (SP[kind] && SP[kind].shell) e.armor = e.armorMax = SP[kind].shell;
    if (kind === 'siphonophore') { e.segs = []; for (let i = 0; i < 4; i++) e.segs.push({ x: x - i * r * 1.8, y }); e.hp = e.maxHp = 40 + 25 * dp; }
    if (kind === 'phage' || kind === 'chytrid') { e.hp = e.maxHp = 3; }
    if (S.ai === 'anchored' || S.ai === 'den') { e.home = { x, y }; e.homeAng = R.float(0, TAU); }
    if (S.ai === 'den') e.withDen = true; // the moray art draws its own rocky den around the hole
    if (S.ai === 'jelly') e.pulse = R.float(0, TAU);
    if (kind === 'mine') { e.hp = e.maxHp = 12 * (this.L ? this.L.hpMult : 1); }
    if (kind === 'volvox') { e.hp = e.maxHp = 9999; e.kids = 5 + R.int(0, 2); }
    if (szK) e.szK = szK;
    if (ts < 1) e.shrunk = true;
    Object.assign(e, o.props || {});
    this.ents.push(e);
    return e;
  }
  spawnClone(i = (this.kinList || []).length) {
    const p = this.p, a = p.ang + PI + (i - 0.5) * 1.2, R = p.r * 2.2 + 10; // each one starts in its own spot behind you
    const c = this.spawn('clone', p.x + cos(a) * R, p.y + sin(a) * R, { r: p.r * 0.55, force: true });
    if (c) { c.spd = 150; c.ally = true; c.hp = c.maxHp = 9999; }
  }
  viewR() { return hypot(this.W, this.H) / 2 / (this.zoomV || 1); }
  ringPos(minF = 1.1, maxF = 1.5) {
    const vr = this.viewR(), a = random() * TAU, d = vr * (minF + random() * (maxF - minF));
    return [this.p.x + cos(a) * d, this.p.y + sin(a) * d];
  }
  intensity() {
    let k = 0.55 + 0.45 * min(1, this.depthTime / (this.D.dur * 0.8));
    return k;
  }
  populate(initial = false) {
    const counts = {};
    for (const e of this.ents) counts[e.kind] = (counts[e.kind] || 0) + 1;
    const pop = this.D.pop, k = this.intensity();
    const eraBoost = 1 + 0.1 * (this.era - 1);
    for (const kind in pop) {
      const sp = D.SPECIES_BY_ID[kind];
      if (sp && sp.firstEra > this.era && !this.camp) continue;
      let target = pop[kind] * (HOSTILE[kind] ? k : eraBoost);
      if (this.firstRun && this.depth === 1 && (kind === 'hunter') && this.depthTime < 28) target = 0;
      if (this.depth === 1 && kind === 'hunter') target *= min(1, this.depthTime / 25 + 0.3);
      if (this.boss && HOSTILE[kind]) target *= this.camp ? 0.2 : 0.4; // let boss fights be about the boss
      target = Math.round(target);
      let have = counts[kind] || 0;
      let guard = 0;
      while (have < target && guard++ < (initial ? 40 : 2)) {
        const [x, y] = initial && !HOSTILE[kind] ? [this.p.x + (random() - 0.5) * 1600, this.p.y + (random() - 0.5) * 1600] : this.ringPos();
        if (initial && hypot(x - this.p.x, y - this.p.y) < 220) continue;
        if (!this.spawn(kind, x, y)) break;
        have++;
      }
    }
    // hazards
    const hz = this.D.hazards || {};
    const hc = {};
    for (const h of this.hazards) hc[h.type] = (hc[h.type] || 0) + 1;
    for (const type in hz) {
      let hg = 0;
      while ((hc[type] || 0) < hz[type] && hg++ < 40) {
        const [x, y] = initial ? [this.p.x + (random() - 0.5) * 2400, this.p.y + (random() - 0.5) * 2400] : this.ringPos(1.3, 2.0);
        if (initial && hypot(x - this.p.x, y - this.p.y) < 350) continue;
        const E = this.expR();
        const h = { type, x, y, r: type === 'uv' ? 90 + random() * 60 : type === 'vent' ? E * 5 : type === 'toxic' ? E * 6 + random() * 60 : type === 'mucus' ? E * 5 + 60 + random() * 70 : type === 'vortex' ? 230 + random() * 70 : 260, t: random() * 10, a: random() * TAU, moteT: 0 };
        if (type === 'current') { h.dx = cos(h.a); h.dy = sin(h.a); }
        this.hazards.push(h); hc[type] = (hc[type] || 0) + 1;
      }
    }
  }

  // ---------- main loop ----------
  loop(now) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now;
    if (!(dt > 0)) dt = 0; dt = min(dt, 1 / 20);
    const t0 = performance.now();
    const frozen = this.paused || !!this.modal;
    if (!frozen) {
      this.cineTick(dt);
      if (this.destroyed) return; // the outro may have handed over to the next level
      if (this.hitStop > 0) this.hitStop -= dt; else this.update(dt * this.slowmo);
      this.frozenFrames = 0;
    }
    if (!frozen || (this.frozenFrames = (this.frozenFrames || 0) + 1) <= 3) this.render(dt);
    this.frameMs = performance.now() - t0;
  }

  update(dt) {
    this.T += dt;
    if (this.dmgPulse) this.dmgPulse = max(0, this.dmgPulse - dt * 2.4);
    const p = this.p;
    if (!this.dead && !this.victory && !this.trans) { this.time += dt; this.depthTime += dt; }
    if (this.dead && !this.deathFx) this.slowmo = min(1, this.slowmo + dt * 0.3);
    // transition
    if (this.trans) {
      const tr = this.trans; tr.t += dt / this.slowmo;
      const k = tr.t / tr.dur;
      this.fadeEl.style.opacity = String(k < 0.5 ? k * 2 : max(0, 2 - k * 2));
      if (k >= 0.5 && !tr.swapped) { tr.swapped = true; this.enterDepth(this.depth + 1); }
      if (k >= 1) { this.trans = null; this.fadeEl.style.opacity = '0'; }
    }
    // palette lerp
    const pc = this.palCur, pt = this.palT, pk = 1 - exp(-dt * 1.5);
    for (const k in pc) mixRGB(pc[k], pt[k], pk, pc[k]);

    this.updatePlayer(dt);
    this.updateMotes(dt);
    this.updateEnts(dt);
    this.updateActives(dt);
    this.updateHazards(dt);
    this.updateShards(dt);
    this.updateParts(dt);
    if (this.boss) this.updateBoss(dt);

    // depth progression
    if (!this.dead && !this.victory && !this.trans) {
      if (this.depthTime >= this.D.dur) {
        if (this.D.boss) { if (!this.bossSpawned) this.spawnBoss(); } // boss death schedules the descent / victory
        else this.descend();
      }
      // phage swarms
      if (this.D.phageEvery) { this.phageT -= dt; if (this.phageT <= 0) { this.phageT = this.D.phageEvery * (0.8 + random() * 0.5); this.phageSwarm(4 + this.depth); } }
      this.popT = (this.popT || 0) - dt; if (this.popT <= 0) { this.popT = 0.25; this.populate(); }
    }
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;
    this.shake = max(0, this.shake - dt * 30);
    this.flash = max(0, this.flash - dt * 3);
    this.updateHints(dt);
    if (this.alarmT > 0) this.alarmT -= dt;
    if (this.inks) { for (const k of this.inks) { k.life -= dt; k.r = min(k.r + k.grow * dt * 0.6, k.grow); } this.inks = this.inks.filter((k) => k.life > 0); }
    if (this.glows) { for (const g of this.glows) g.life -= dt; this.glows = this.glows.filter((g) => g.life > 0); }
    if (this.pendingLevels > 0 && !this.modal && !this.dead && !this.trans) this.offerLevel();
  }

  updatePlayer(dt) {
    const p = this.p, m = p.muts;
    p.iframes = max(0, p.iframes - dt); p.flashT = max(0, p.flashT - dt); p.cyst = max(0, p.cyst - dt); if (p.slowT > 0) p.slowT -= dt * (1 + 0.4 * (p.muts.warmblood | 0)); if (p.frozenT > 0) p.frozenT -= dt;
    p.dashCd = max(0, p.dashCd - dt); p.novaCd = max(0, p.novaCd - dt);
    p.photoCd = max(0, p.photoCd - dt); p.shoalCd = max(0, p.shoalCd - dt); p.suckCd = max(0, p.suckCd - dt); p.puffCd = max(0, p.puffCd - dt); p.slashCd = max(0, p.slashCd - dt); p.breachCd = max(0, p.breachCd - dt); p.senseCd = max(0, p.senseCd - dt); p.filterCd = max(0, p.filterCd - dt);
    p.dent *= exp(-dt * 6);
    if (this.dead) { p.vx *= 0.9; p.vy *= 0.9; return; }
    if (this.cineLock()) { this.cineMove(dt); return; }
    const [dx, dy, mag0] = this.moveDir(), mag = p.frozenT > 0 ? 0 : mag0; // frozen: rolled over and helpless
    if (mag > 0) this.hints.moved += dt;
    const latchSlow = 1 - min(0.45, p.latched * 0.07);
    const mucus = p.inMucus || p.inTrap ? min(0.85, 0.42 + 0.12 * (p.muts.osmo | 0)) : 1; // sticky slime and spines slow you right down
    const top = D.baseSpeed(p.r0 || p.r) * this.speedMult * latchSlow * mucus * (1 - 0.55 * (p.puffK || 0)) * (p.breachT > 0 ? 0.6 : 1) * (p.slowT > 0 ? 0.6 : 1); // puffed up you can barely swim; in the air you glide
    if (p.dashT > 0) {
      p.dashT -= dt;
    } else if (mag > 0) {
      const fk = p.filterT > 0 ? 0.75 : 1, tx = dx * top * mag * fk, ty = dy * top * mag * fk; // mouth wide open: slower
      const a = 1 - exp(-dt * this.accel);
      p.vx += (tx - p.vx) * a; p.vy += (ty - p.vy) * a;
    } else {
      const d = exp(-dt * (1.6 + 1.4 * (m.hover | 0))); p.vx *= d; p.vy *= d; // hover fins stop you dead
    }
    // currents
    for (const h of this.hazards) if (h.type === 'current') {
      const ddx = p.x - h.x, ddy = p.y - h.y, d2 = ddx * ddx + ddy * ddy;
      if (d2 < h.r * h.r) { const f = (1 - sqrt(d2) / h.r) * 95 * this.hazMult; p.vx += h.dx * f * dt; p.vy += h.dy * f * dt; }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const sp = hypot(p.vx, p.vy);
    p.speedN = min(1.5, sp / max(1, top));
    if (sp > 8) { const ta = atan2(p.vy, p.vx); const da = angDiff(p.ang, ta); p.ang = ta - da + da * min(1, dt * 8); p.wiggle += abs(da) * min(1, sp / top) * 1.2; }
    p.wiggle *= exp(-dt * 1.2);
    p.stretch = lerp(p.stretch, min(0.16, p.speedN * 0.1) + (p.dashT > 0 ? 0.12 : 0), 1 - exp(-dt * 6));
    p.wob = lerp(p.wob, p.flashT > 0 ? 0.08 : 0, 1 - exp(-dt * 8));
    // regen & sustain
    if (this.regen) this.heal(this.regen * dt);
    if (m.chloro) this.heal(m.chloro * 0.6 * this.D.sun * dt);
    // toxin gland
    if (m.toxin) {
      p.toxinT -= dt;
      if (p.toxinT <= 0) { p.toxinT = 5 - 0.7 * (m.toxin - 1); this.clouds.push({ x: p.x, y: p.y, r: p.r * 3.6, life: 2.6, max: 2.6, dps: 8 + 6 * m.toxin }); this.sfx('toxin', { vol: 0.6 }); }
    }
    if (m.cleaners && p.latched > 0) { p.cleanT = (p.cleanT || 0) + dt; if (p.cleanT > 5 - m.cleaners) { p.cleanT = 0; this.detachPhages(1); } }
    // phage shake-off by wiggle
    if (p.latched > 0 && p.wiggle > 5) { p.wiggle -= 2.5; this.detachPhages(1); }
    this.updateAbilitiesUI();
  }
  // Tetrodotoxin: whatever bit you is poisoned, stunned and backs off
  poisonBiter(e) {
    const lv = this.p.muts.tetrodo | 0;
    this.damage(e, e.maxHp * (0.1 + 0.08 * lv) / this.stageHit(), this.p, true);
    e.stun = max(e.stun || 0, 0.7 + 0.2 * lv); e.scared = 2.5;
    const a = atan2(e.y - this.p.y, e.x - this.p.x); e.vx += cos(a) * 260; e.vy += sin(a) * 260;
    this.sparkle(e.x, e.y, [210, 255, 120], 6);
    if (!this.hints.shown.tetrodo) this.hint('tetrodo', 'Your poison bit back! Biters are poisoned and back off', 'shield', 3000);
  }
  stageThreat(k) { return 1 + k * max(0, (this.p.stage | 0 || 1) - 2); }
  heal(n) { const p = this.p; if (p.hp < p.maxHp) p.hp = min(p.maxHp, p.hp + n); }
  hurt(n, src = null, opts = {}) {
    const p = this.p;
    if (this.dead || this.victory || this.invuln || this.trans) return false;
    if (p.breachT > 0) return false; // in the air above the waves
    if (!opts.dot && (p.iframes > 0 || p.cyst > 0)) return false;
    if (opts.dot && p.cyst > 0) return false;
    n *= (this.L ? (opts.env ? this.L.envMult : this.L.dmgMult * this.stageThreat(C.TUNE.stageDmg)) : 1) * (1 - (this.armor || 0));
    if (p.puffK > 0.5) n *= 0.5; // puffed up: spines and a body full of water
    p.hp -= n;
    if (!opts.dot && src && src.kind && !src.boss && !src.ally && src.alive && src.hp !== undefined && (p.muts.tetrodo | 0)) this.poisonBiter(src);
    // make every source of damage readable: red screen edge, HP pulse, and what hurt you
    this.hurtWhy = opts.why || this.hurtWhy || 'Taking damage';
    this.hurtT = this.T;
    if (opts.dot) { this.dmgPulse = max(this.dmgPulse || 0, 0.5); this.drainAcc = (this.drainAcc || 0) + n; if (this.drainAcc >= 3) { this.texts.push({ x: p.x + (random() - 0.5) * p.r, y: p.y - p.r, s: '-' + Math.round(this.drainAcc), life: 0.8, c: '#ff8a9a' }); this.drainAcc = 0; } }
    else { this.dmgPulse = 1; this.texts.push({ x: p.x, y: p.y - p.r * 1.2, s: '-' + Math.round(n), life: 1, c: '#ff6b7d' }); this.hpStat.classList.remove('hit'); void this.hpStat.offsetWidth; this.hpStat.classList.add('hit'); }
    if (!opts.dot) {
      p.iframes = (opts.iframes ?? 0.55) + (this.iframeBonus || 0); p.flashT = 0.25; this.shake = min(14, this.shake + 6 + n * 0.3); this.flash = 0.25;
      this.sfx('hurt'); this.buzz(25);
      if (src) { const a = atan2(p.y - src.y, p.x - src.x); p.vx += cos(a) * 260; p.vy += sin(a) * 260; p.dentA = a + PI - p.ang; p.dent = 0.25; }
      this.burst(p.x, p.y, [255, 120, 140], 8, 140);
      if (p.muts.spikes && src && src.hp !== undefined && !src.ally) this.damage(src, 12 * p.muts.spikes, p);
    }
    if (p.hp <= 0) this.die();
    return true;
  }

  updateMotes(dt) {
    const p = this.p, mr = this.magnet, mr2 = mr * mr, eatR = p.r * this.reach;
    const vr = this.viewR() * 2.3, vr2 = vr * vr;
    const ms = this.motes;
    let w = 0;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      m.life += dt; if (m.a < 1) m.a = min(1, m.a + dt * 2);
      const dx = p.x - m.x, dy = p.y - m.y, d2 = dx * dx + dy * dy;
      if (d2 > vr2) continue; // despawn
      if (!this.dead && d2 < mr2) {
        const d = sqrt(d2) + 0.001, f = (1 - d / mr) * 900 + 120;
        m.vx += dx / d * f * dt; m.vy += dy / d * f * dt;
        m.vx *= exp(-dt * 3); m.vy *= exp(-dt * 3);
      } else { m.vx *= exp(-dt * 0.8); m.vy *= exp(-dt * 0.8); m.vx += sin(this.T * 0.7 + m.ph) * 4 * dt; m.vy += cos(this.T * 0.6 + m.ph * 1.3) * 4 * dt; }
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (!this.dead && d2 < eatR * eatR && m.life > 0.15) { this.eatMote(m); continue; }
      ms[w++] = m;
    }
    ms.length = w;
    // spawn
    const target = (52 + 12 * (this.era - 1)) * (1 + (this.depth - 1) * 0.06);
    let guard = 0;
    while (ms.length < target && guard++ < 4) { const [x, y] = this.ringPos(0.95, 1.6); this.spawnMote(x, y, 1, 1); }
    if (random() < dt * 1.2 && ms.length < MAX_MOTES - 10) {
      // occasional in-view mote cluster
      const a = random() * TAU, d = this.viewR() * (0.4 + random() * 0.5);
      for (let i = 0; i < 3; i++) this.spawnMote(p.x + cos(a) * d + (random() - 0.5) * 40, p.y + sin(a) * d + (random() - 0.5) * 40, 1, 1);
    }
  }
  df() { return 1 + 0.38 * (this.depth - 1); }
  eatMote(m) {
    const v = m.v * this.df() * (1 + 0.05 * (this.era - 1));
    this.gainXP(v, false);
    this.combo++; this.comboT = 0.9;
    this.sfx('eat', { pitch: min(10, this.combo - 1), vol: 0.7 });
    this.sparkle(m.x, m.y, this.palCur.mote, 3);
  }
  gainXP(v, meal) {
    const p = this.p;
    const bonus = 1 + min(0.5, this.combo * 0.04);
    const x = v * this.xpMult * bonus;
    if (!(x > 0) || !Number.isFinite(x)) return;
    p.xp += x; this.stats.biomass += x;
    if (meal && p.muts.lysosome) this.heal(p.maxHp * 0.01 * p.muts.lysosome);
    if (meal && p.muts.polyps) this.heal(p.maxHp * 0.005 * p.muts.polyps);
    let need = D.xpToNext(p.level), guard = 0, grew = false;
    const growth = x / need; // fraction of a body-size level this meal is worth
    while (p.xp >= need && guard++ < 60) {
      p.xp -= need; p.level++; grew = true;
      if (!this.camp) this.pendingLevels++;
      need = D.xpToNext(p.level);
    }
    if (p.xp >= need) p.xp = need * 0.99; // absurd grants: carry no more than one level
    if (this.camp) { this.evo.xp += min(growth, 3) * 10; this.checkEvo(); }
    this.pendingLevels = min(this.pendingLevels, 30);
    if (grew || this.pendingLevels) this.recalc();
  }
  checkEvo() {
    let need = C.evoNeed(this.evo.level), guard = 0;
    while (this.evo.xp >= need && guard++ < 30) { this.evo.xp -= need; this.evo.level++; this.pendingLevels++; need = C.evoNeed(this.evo.level); }
    if (this.evo.xp >= need) this.evo.xp = need * 0.99;
  }

  phageSwarm(n) {
    const [x, y] = this.ringPos(1.05, 1.2);
    this.sfx('bubble');
    const kind = this.L ? this.L.swarm || 'phage' : 'phage';
    if (this.camp && tierScale(kind, this.p.stage) <= 0) return;
    if (kind === 'cookiecutter') n = 2 + (this.depth >> 1);
    for (let i = 0; i < n; i++) this.spawn(kind, x + (random() - 0.5) * 60, y + (random() - 0.5) * 60, { force: true });
    if (this.firstRun && !this.hints.shown.phage) this.later(1200, () => this.hint('phage', 'Phages latch on! Wiggle fast or dash to shake them off', 'microbe', 4500));
  }
  detachPhages(n) {
    const p = this.p;
    for (const e of this.ents) {
      if (n <= 0) break;
      if (e.latched) {
        e.latched = false; p.latched--; n--;
        const a = e.la + p.ang; e.vx = cos(a) * 320; e.vy = sin(a) * 320; e.stun = 1.2; e.hp -= 1;
        this.sparkle(e.x, e.y, [200, 150, 255], 4);
        if (e.hp <= 0) this.kill(e, false);
      }
    }
    p.latched = max(0, p.latched);
    this.sfx('pop');
  }

  updateEnts(dt) {
    const p = this.p, ents = this.ents, T = this.T;
    const vr = this.viewR(), far2 = (vr * 2.6) ** 2;
    const sightBase = 300 * this.sight * (this.alarmT > 0 ? 1.8 : 1);
    p.inTrap = false;
    this.computeFlocks();
    let wi = 0;
    const halfW = this.W / 2 / this.zoomV, halfH = this.H / 2 / this.zoomV;
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive) continue;
      e.t += dt; e.flash = max(0, e.flash - dt * 4); e.dent *= exp(-dt * 5); e.hitCd = max(0, e.hitCd - dt); e.timer -= dt;
      if (e.stun) e.stun = max(0, e.stun - dt);
      if (e.hpShowT) e.hpShowT = max(0, e.hpShowT - dt);
      let dx = p.x - e.x, dy = p.y - e.y, d = sqrt(dx * dx + dy * dy) + 0.0001;
      const d2 = dx * dx + dy * dy;
      if (d2 > far2 && !e.boss && !e.ally) { e.alive = false; if (e.latched) p.latched--; continue; }
      // discovery
      if (!this.seen[e.kind] && abs(dx) < halfW + e.r && abs(dy) < halfH + e.r && D.SPECIES_BY_ID[e.kind]) this.discover(e.kind);
      if (e.boss) { ents[wi++] = e; continue; }
      if (e.shrunk && HOSTILE[e.kind] && e.edibleCache && !TURNED.has(e.kind) && abs(dx) < halfW && abs(dy) < halfH) {
        TURNED.add(e.kind);
        this.toast('The tables have turned', `Old predator, new prey: <b>${SP[e.kind].name}</b>`, e.kind, 'microbe', 'gold');
        this.sfx('event', { vol: 0.5 });
      }
      // predators feed too: they slowly grow to keep pace with you instead of becoming prey
      if (e.szK) { const want = ((1 - C.TUNE.track) * this.expR() + C.TUNE.track * p.r) * min(e.szK, 1.05); if (e.r < want) e.r = min(want, e.r * (1 + C.TUNE.huntGrow * dt)); }
      const edible = this.canEat(e); e.edibleCache = edible;
      const bigger = !edible && (e.r > p.r * 0.95 || !!(SP[e.kind] && SP[e.kind].pack)); // pack hunters (orcas) take on bigger prey
      let tx = 0, ty = 0, sp = e.spd, steer = 2.2;
      const wander = () => { e.wander += (random() - 0.5) * dt * 2.4; tx = cos(e.wander); ty = sin(e.wander); };
      const flee = (k = 1) => { tx = -dx / d; ty = -dy / d; sp *= k; };
      const chase = (k = 1) => { tx = dx / d; ty = dy / d; sp *= k; };
      // a predator may go for one of your decoy fish instead of you (Shoal Call)
      const pdx = dx, pdy = dy, pd = d;
      let lure = null;
      if (this.decoys && !e.ally && HOSTILE[e.kind] && !isLatcher(e) && !(e.blind > 0)) { lure = this.lureFor(e, d); if (lure) { dx = lure.x - e.x; dy = lure.y - e.y; d = hypot(dx, dy) + 0.0001; } }
      if (e.blind > 0) { e.blind -= dt; wander(); sp *= 0.3; steer = 1.2; } // dazzled by a flash: it has lost track of you
      else if (e.scared > 0 && !e.ctl) { e.scared -= dt; flee(0.9); steer = 3; } // poisoned by you: it backs off
      else if (e.ctl) { tx = e.ctl.tx; ty = e.ctl.ty; sp = e.ctl.sp; steer = e.ctl.steer ?? 2.2; } // steered by a boss fight or an ability
      else switch ((SP[e.kind] && SP[e.kind].ai) || e.kind) {
        case 'drifter': if (d < 150 + p.r * 2 && !this.dead) flee(2.0); else { wander(); sp *= 0.5; } break;
        case 'ciliate': if (d < 200 + p.r * 2 && edible) flee(2.0); else { wander(); if (e.timer < 0) { e.timer = 1 + random() * 2; e.wander += (random() - 0.5) * 2; } } break;
        case 'grazer': {
          if (bigger && e.r > p.r * 1.12 && d < sightBase * 0.8) { chase(0.8); e.chasing = true; }
          else if (edible && d < 170) { flee(1.45); e.chasing = false; }
          else {
            e.chasing = false;
            if (!e.tm || e.timer < 0 || !this.motes.includes(e.tm)) { e.timer = 1.5 + random() * 2; e.tm = this.nearestMote(e.x, e.y, 260); }
            if (e.tm) { const mx = e.tm.x - e.x, my = e.tm.y - e.y, md = hypot(mx, my) + 0.01; tx = mx / md; ty = my / md; sp *= 0.8; if (md < e.r) { this.removeMote(e.tm); e.tm = null; e.biteK = 1; } }
            else { wander(); sp *= 0.5; }
          }
          if (e.biteK) e.biteK = max(0, e.biteK - dt * 3);
          break;
        }
        case 'diatom': wander(); sp *= 0.6; break;
        case 'hunter': {
          const sight = sightBase * (1 + 0.1 * this.depth);
          if (!this.dead && !this.victory && bigger && d < (e.chasing ? sight * 1.5 : sight)) { chase(1); e.chasing = true; steer = 2.6; }
          else if (edible && d < 220) { flee(1.15); e.chasing = false; }
          else { e.chasing = false; wander(); sp *= 0.45; }
          e.biteK = e.chasing && d < e.r + p.r + 40 ? min(1, (e.biteK || 0) + dt * 6) : max(0, (e.biteK || 0) - dt * 3);
          if (this.firstRun && e.chasing && !this.hints.shown.hunter) this.hint('hunter', 'Red spiky cells hunt you — stay away until you’re bigger', 'shield', 5000, false, 'warn');
          break;
        }
        case 'amoeba': if (!this.dead && !this.victory && bigger && d < sightBase * 1.1) chase(1); else { wander(); sp *= 0.6; } steer = 0.8; break;
        case 'rotifer': {
          if (!this.dead && !this.victory && bigger && d < sightBase) { chase(1); e.chasing = true; }
          else if (edible && d < 200) { flee(1.3); e.chasing = false; } else { wander(); sp *= 0.5; e.chasing = false; }
          // crown vortex sucks motes
          const ca = e.ang, cx = e.x + cos(ca) * e.r, cy = e.y + sin(ca) * e.r;
          for (const m of this.motes) { const mx = cx - m.x, my = cy - m.y, md2 = mx * mx + my * my; if (md2 < 14400) { const md = sqrt(md2) + 0.01; m.vx += mx / md * 260 * dt; m.vy += my / md * 260 * dt; if (md < e.r * 0.6) m.life = -99; } }
          break;
        }
        case 'siphonophore': if (!this.dead && !this.victory && d < sightBase * 0.9) chase(0.9); else { wander(); sp *= 0.7; } steer = 0.6; break;
        case 'volvox': wander(); sp *= 0.6; break;
        case 'lurker': {
          // camouflaged ambusher: creeps up nearly invisible, then flashes and lunges in a straight line
          e.lcd = (e.lcd ?? 1.5) - dt;
          const calm = this.dead || this.victory;
          let vis = 0.14;
          if (edible) { if (d < 200 && !calm) flee(1.1); else { wander(); sp *= 0.4; } vis = d < 200 ? 0.6 : 0.16; }
          else if (e.lunge > 0) { e.lunge -= dt; tx = cos(e.la); ty = sin(e.la); sp *= 4.6; steer = 12; vis = 1; }
          else if (e.tele > 0) {
            e.tele -= dt; if (e.tele > 0.25) e.la = atan2(dy, dx); // aim locks shortly before the lunge
            tx = cos(e.la) * 0.01; ty = sin(e.la) * 0.01; sp *= 0.05; steer = 6; vis = 1;
            if (e.tele <= 0) { e.lunge = 0.42; e.lcd = 2.6 + random() * 1.2; this.sfx('dash', { vol: 0.35 }); }
          } else if (!calm && bigger && d < 300 && e.lcd <= 0) { e.tele = 0.7; e.la = atan2(dy, dx); vis = 1; this.sfx('tick'); }
          else if (!calm && bigger && d < sightBase * 1.3) { chase(0.4); steer = 1.4; vis = d < 160 ? 0.55 : 0.16; }
          else { wander(); sp *= 0.3; }
          e.vis = (e.vis ?? vis) + (vis - (e.vis ?? vis)) * min(1, dt * 6);
          break;
        }
        case 'spitter': {
          // keeps its distance and fires aimed shard volleys; it glows just before it shoots
          if (edible) { if (d < 220 && !this.dead) flee(1.1); else { wander(); sp *= 0.5; } e.aim = 0; break; }
          if (!this.dead && !this.victory && d < 620) {
            const want = 280;
            if (d < want - 40) flee(0.9); else if (d > want + 80) chase(0.7); else { tx = -dy / d; ty = dx / d; sp *= 0.35; }
            e.shot = (e.shot ?? 1.2 + random() * 2) - dt;
            e.aim = e.shot < 0.7 ? 1 - e.shot / 0.7 : 0; e.cockK = e.aim; e.snapK = max(0, (e.snapK || 0) - dt * 4);
            if (e.shot <= 0) { this.spitterFire(e, dx, dy, d); e.shot = 3 + random() * 1.2; }
          } else { wander(); sp *= 0.4; e.aim = 0; }
          break;
        }
        case 'mine': {
          // drifts; swells and bursts when anything big comes close
          wander(); sp *= 0.3; steer = 0.4;
          if (e.arm > 0) { e.arm -= dt; sp = 0; e.armK = min(1, 1 - e.arm / 0.75); if (e.arm <= 0) this.mineBurst(e); }
          else if (!this.dead && !this.victory && d < e.r + p.r + 75) { e.arm = 0.75; this.sfx('tick'); }
          break;
        }
        case 'phage': {
          if (e.latched) {
            const a = e.la + p.ang, rr = p.r * 0.95 + e.r * 0.6;
            e.x = p.x + cos(a) * rr; e.y = p.y + sin(a) * rr; e.ang = a + PI;
            const LT = SP[e.kind].latch;
            this.hurt(LT.drain * dt, null, { dot: true, env: !LT.bite, why: e.kind === 'phage' ? 'Phages latched on' : SP[e.kind].name + ' latched on' });
            if (!e.fx || e.fx < T) { e.fx = T + 0.5; this.sparkle(e.x, e.y, [255, 120, 160], 1); }
            ents[wi++] = e; continue;
          }
          if (e.stun > 0) { tx = 0; ty = 0; sp = 0; }
          else if (edible && !isTiny(e)) { if (d < 200) flee(1.2); else { wander(); sp *= 0.5; } }
          else if (!this.dead && !this.victory && d < 520) { chase(1); steer = 3.5; }
          else { wander(); sp *= 0.6; }
          break;
        }
        case 'jumper': {
          // copepods and nauplii: drift, then escape in lightning jumps when something big comes close
          e.jcd = (e.jcd || 0) - dt;
          if (e.jt > 0) { e.jt -= dt; tx = cos(e.ja); ty = sin(e.ja); sp *= SP[e.kind].jump ? 5.5 : 3.2; steer = 14; e.jumpK = 1; break; }
          e.jumpK = max(0, (e.jumpK || 0) - dt * 4);
          if (!this.dead && e.jcd <= 0 && d < 140 + p.r * 2.2 && (edible || d < e.r + p.r + 40)) { e.jt = 0.26; e.jcd = 0.8 + random() * 0.9; e.ja = atan2(-dy, -dx) + (random() - 0.5) * 1.3; }
          else { wander(); sp *= 0.3; if (e.timer < 0) { e.timer = 0.7 + random() * 1.1; e.jt = 0.12; e.ja = e.wander; } }
          break;
        }
        case 'anchored': {
          // hydra and anemones: glued in place, tentacles reach for whatever comes close
          tx = 0; ty = 0; sp = 0; steer = 8;
          if (e.home) { e.x += (e.home.x - e.x) * min(1, dt * 4); e.y += (e.home.y - e.y) * min(1, dt * 4); }
          e.closedK = max(0, (e.closedK || 0) - dt * 0.5);
          const near = !this.dead && !this.victory && !edible && d < e.r * 3.4 + p.r + 70;
          e.reach = clamp((e.reach || 0) + (near && e.closedK < 0.3 ? dt * 1.6 : -dt * 1.1), 0, 1);
          if (near) e.ang += angDiff(e.ang, atan2(dy, dx)) * min(1, dt * 3);
          e.strikeK = max(0, (e.strikeK || 0) - dt * 3);
          if (!this.dead && !this.victory && !edible && e.closedK < 0.3 && d < e.r * (1.2 + 1.8 * e.reach) + p.r * 0.6) {
            const [b, k] = SP[e.kind].sting; e.strikeK = 1;
            this.hurt((b + k * this.depth) * dt * this.biteScale(e) * (this.stingMult || 1), null, { dot: true, why: SP[e.kind].name + ' sting' });
            if (!e.fx || e.fx < T) { e.fx = T + 0.3; p.flashT = 0.15; this.sparkle(p.x, p.y, this.colorOf(e), 3); }
          }
          break;
        }
        case 'tough': {
          // tardigrade: slow, armoured and relentless once it has seen you
          if (!this.dead && !this.victory && bigger && d < sightBase * 1.2) { chase(1); e.chasing = true; steer = 1.6; }
          else if (edible && d < 180) { flee(1.2); e.chasing = false; } else { wander(); sp *= 0.5; e.chasing = false; }
          e.biteK = d < e.r + p.r + 24 && !edible ? 1 : max(0, (e.biteK || 0) - dt * 2);
          break;
        }
        case 'trap': {
          // sun-animalcule: drifts; its sticky spines snag anything that touches them
          wander(); sp *= 0.3; steer = 0.5;
          e.snag = max(0, (e.snag || 0) - dt);
          if (!this.dead && !this.victory && !edible && d < e.r * 1.75 + p.r * 0.7) {
            p.inTrap = true; e.snag = 1; e.ang = atan2(dy, dx); tx = 0; ty = 0; e.vx *= 0.5; e.vy *= 0.5; // the snag is drawn on its +x side
            const [b, k] = SP[e.kind].trap;
            this.hurt((b + k * this.depth) * dt, null, { dot: true, env: true, why: 'Stuck on a sun-animalcule' });
          }
          break;
        }
        case 'glowbomb': {
          // seed shrimp: skittish prey; its glow trick happens when it dies (see kill)
          if (d < 160 + p.r * 2 && !this.dead && edible) flee(1.6); else { wander(); sp *= 0.5; }
          break;
        }
        case 'swarm': case 'school': {
          // krill swarms and fish schools: stick together, turn as one, scatter from danger
          const G = this.flock && this.flock[e.kind];
          wander();
          let fx = tx * 0.4, fy = ty * 0.4;
          if (G && G.n > 1) {
            const gx = G.x - e.x, gy = G.y - e.y, gd = hypot(gx, gy) + 0.01;
            if (gd > e.r * 3) { fx += gx / gd * 0.9; fy += gy / gd * 0.9; }
            const gv = hypot(G.vx, G.vy) + 0.01; fx += G.vx / gv * 0.9; fy += G.vy / gv * 0.9;
          }
          if (!this.dead && edible && d < 200 + p.r * 2.2) { fx -= dx / d * 3; fy -= dy / d * 3; sp *= 1.7; }
          else sp *= 0.6;
          const fm = hypot(fx, fy) + 0.01; tx = fx / fm; ty = fy / fm; steer = 3;
          break;
        }
        case 'jelly': {
          // medusa: slow pulsing drift; the tentacles trailing behind the bell sting
          e.pulse = (e.pulse || 0) + dt * 2.2;
          const thrust = max(0, sin(e.pulse));
          if (!this.dead && !this.victory && bigger && d < sightBase * 0.7) chase(1); else wander();
          sp *= 0.25 + 0.75 * thrust; steer = 1.2;
          e.stingK = max(0, (e.stingK || 0) - dt * 3);
          if (!this.dead && !this.victory && !edible) {
            const bx = -cos(e.ang), by = -sin(e.ang), Lt = e.r * 3.2, rx = p.x - e.x, ry = p.y - e.y;
            const tp = clamp(rx * bx + ry * by, 0, Lt), qx = e.x + bx * tp - p.x, qy = e.y + by * tp - p.y;
            if (tp > e.r * 0.4 && qx * qx + qy * qy < (e.r * 0.75 + p.r * 0.8) ** 2) {
              e.stingK = 1; const [b, k] = SP[e.kind].sting;
              this.hurt((b + k * this.depth) * dt * this.biteScale(e) * (this.stingMult || 1), null, { dot: true, why: SP[e.kind].name + ' sting' });
              if (!e.fx || e.fx < T) { e.fx = T + 0.3; p.flashT = 0.15; this.sparkle(p.x, p.y, this.colorOf(e), 3); }
            }
          }
          break;
        }
        case 'inker': {
          // squid: small ones vanish behind a cloud of ink; big ones hunt and shoot out their tentacles
          e.icd = (e.icd || 0) - dt; e.gcd = (e.gcd || 0) - dt;
          e.inkK = max(0, (e.inkK || 0) - dt * 0.7); e.grabK = max(0, (e.grabK || 0) - dt * 2.5);
          if (e.kind === 'humboldt') { e.flashK = lerp(e.flashK || 0, e.chasing ? 1 : 0.25, 1 - exp(-dt * 3)); e.redK = e.grabT > 0 || e.grabK > 0.4 ? 1 : max(0, (e.redK || 0) - dt * 1.5); }
          if (e.jet > 0) { e.jet -= dt; tx = cos(e.ja); ty = sin(e.ja); sp *= 3.4; steer = 9; break; }
          if (!bigger) {
            if (!this.dead && e.icd <= 0 && d < 150 + p.r * 2) { this.inkCloud(e); e.icd = 5 + random() * 3; e.jet = 0.55; e.inkK = 1; e.ja = atan2(-dy, -dx) + (random() - 0.5) * 0.6; }
            else if (edible && d < 230) flee(1.2); else { wander(); sp *= 0.5; }
          } else if (!this.dead && !this.victory && d < sightBase * 1.2) {
            chase(0.9); steer = 2.2; e.chasing = true;
            if (e.grabT > 0) { e.grabT -= dt; if (e.grabT <= 0) { e.grabK = 1; if (d < e.r * 2.9 + p.r) { const [b, k] = SP[e.kind].bite; this.hurt((b + k * this.depth) * 0.8 * this.biteScale(e), e, { why: 'Squid tentacles' }); } } }
            else if (d < e.r * 2.7 + p.r && e.gcd <= 0) { e.grabT = 0.35; e.gcd = 2.4; }
          } else { wander(); sp *= 0.5; e.chasing = false; }
          break;
        }
        case 'sprinter': {
          // barracuda: cruises, then explodes into a straight sprint
          e.scd = (e.scd ?? 1) - dt;
          if (e.sprint > 0) { e.sprint -= dt; tx = cos(e.sa); ty = sin(e.sa); sp *= 3.2; steer = 6; e.sprintK = 1; break; }
          e.sprintK = max(0, (e.sprintK || 0) - dt * 3);
          e.biteK = !edible && d < e.r + p.r + 40 ? min(1, (e.biteK || 0) + dt * 6) : max(0, (e.biteK || 0) - dt * 3);
          if (!this.dead && !this.victory && bigger && d < sightBase * 1.3) {
            chase(0.55); steer = 1.8; e.chasing = true;
            if (d < 330 && e.scd <= 0) { e.sprint = 0.55; e.sa = atan2(dy, dx); e.scd = 2.6 + random(); this.sfx('dash', { vol: 0.25 }); }
          } else if (edible && d < 220) { flee(1.2); e.chasing = false; } else { wander(); sp *= 0.4; e.chasing = false; }
          break;
        }
        case 'den': {
          // moray: waits in its den and lunges out at anything that swims close, then backs in
          if (!e.home) e.home = { x: e.x, y: e.y };
          const hx = e.home.x - e.x, hy = e.home.y - e.y, hd = hypot(hx, hy) + 0.01;
          const pdx = p.x - e.home.x, pdy = p.y - e.home.y, pd = hypot(pdx, pdy) + 0.01;
          e.mcd = (e.mcd || 0) - dt;
          if (e.out > 0) { e.out -= dt; tx = cos(e.la); ty = sin(e.la); sp *= 4; steer = 9; e.emergeK = min(1, (e.emergeK || 0) + dt * 5); e.biteK = 1; break; }
          e.biteK = max(0, (e.biteK || 0) - dt * 2);
          if (e.tele > 0) {
            e.tele -= dt; tx = 0; ty = 0; sp = 0; e.biteK = 1 - e.tele / 0.45;
            if (e.tele > 0.15) e.la = atan2(pdy, pdx);
            if (e.tele <= 0) { e.out = 0.36; e.mcd = 3.2; this.sfx('dash', { vol: 0.3 }); }
          } else if (!this.dead && !this.victory && !edible && pd < e.r * 4 + p.r && e.mcd <= 0) { e.tele = 0.45; e.la = atan2(pdy, pdx); this.sfx('tick'); }
          else {
            tx = hx / hd; ty = hy / hd; sp *= hd > 4 ? 1.3 : 0; steer = 4;
            e.emergeK = max(0, (e.emergeK || 0) - dt * 1.2);
            if (hd < 8) { e.ang += angDiff(e.ang, atan2(pdy, pdx)) * min(1, dt * 2); e.vx *= 0.8; e.vy *= 0.8; }
          }
          break;
        }
        case 'angler': {
          // anglerfish: hangs almost still in the dark, wiggling its lure; get close to the light and the jaws snap
          wander(); sp *= 0.15; steer = 0.6;
          e.lureK = 0.6 + 0.4 * sin(T * 3 + e.seed);
          e.mouthK = max(0, (e.mouthK || 0) - dt * 2);
          e.acd = (e.acd || 0) - dt;
          if (!this.dead && !this.victory && !edible) {
            e.ang += angDiff(e.ang, atan2(dy, dx)) * min(1, dt * 0.8);
            const mx = e.x + cos(e.ang) * e.r * 1.1, my = e.y + sin(e.ang) * e.r * 1.1, md = hypot(p.x - mx, p.y - my);
            if (e.snapT > 0) {
              e.snapT -= dt; e.mouthK = 1;
              if (e.snapT <= 0) {
                e.acd = 1.7; this.sfx('gulp'); this.shake = min(10, this.shake + 4);
                if (md < e.r * 1.2 + p.r) { const [b, k] = SP[e.kind].bite; this.hurt((b + k * this.depth) * this.biteScale(e), e, { why: 'Anglerfish jaws' }); }
              }
            } else if (md < e.r * 1.7 + p.r && e.acd <= 0) e.snapT = 0.32;
          } else if (edible && d < 200) flee(0.8);
          break;
        }
        case 'clone': {
          // allied: gather motes and small prey near player
          const pd = d;
          if (pd > 260) { tx = dx / d; ty = dy / d; sp = 220; }
          else {
            if (!e.tm || e.timer < 0 || !this.motes.includes(e.tm)) { e.timer = 0.8; e.tm = this.freeMote(e, 240); }
            if (e.tm) { const mx = e.tm.x - e.x, my = e.tm.y - e.y, md = hypot(mx, my) + 0.01; tx = mx / md; ty = my / md; if (md < e.r * 1.2) { this.removeMote(e.tm); e.tm = null; this.gainXP(0.6 * this.df(), false); this.sparkle(e.x, e.y, this.palCur.mote, 2); } }
            else {
              // nothing to gather: each young swims to its own spot behind you, so they don't bunch up
              const n = e.nkin || 1, a = p.ang + PI + ((e.slot || 0) - (n - 1) / 2) * 1.2, hr = p.r * 2.2 + e.r;
              const hx = p.x + cos(a) * hr - e.x, hy = p.y + sin(a) * hr - e.y, hd = hypot(hx, hy) + 0.01;
              tx = hx / hd; ty = hy / hd; sp = min(150, hd * 3);
            }
          }
          e.r = p.r * 0.55;
          break;
        }
      }
      if (e.stun > 0 && !isLatcher(e)) { sp *= 0.2; }
      // steering
      const a = 1 - exp(-dt * steer);
      e.vx += (tx * sp - e.vx) * a; e.vy += (ty * sp - e.vy) * a;
      e.x += e.vx * dt; e.y += e.vy * dt;
      const s = hypot(e.vx, e.vy);
      if (s > 3) e.ang += angDiff(e.ang, atan2(e.vy, e.vx)) * min(1, dt * 5);
      e.stretch = min(0.15, s / 600);
      if (e.segs) this.updateSegs(e);
      if (lure) {
        if (hypot(lure.x - e.x, lure.y - e.y) < e.r + lure.r * 0.8) { lure.alive = false; this.burst(lure.x, lure.y, [255, 220, 160], 10, 140); e.blind = 0.8; }
        dx = pdx; dy = pdy; d = pd;
      }
      // interaction with player
      if (!this.dead && !e.ally) this.interact(e, d, dx, dy, dt, edible);
      // ally clone eating small prey
      if (e.kind === 'clone') this.cloneEat(e);
      if (e.alive) ents[wi++] = e;
    }
    ents.length = wi;
    this.separate();
    this.kinSpacing();
    // offensive auras: clouds, symbionts
    this.updateAuras(dt);
  }
  // Cells push each other apart instead of piling up on top of one another.
  separate() {
    const p = this.p, vr = this.viewR() * 1.5, vr2 = vr * vr;
    const L = this.sepList || (this.sepList = []);
    L.length = 0;
    for (const e of this.ents) {
      if (!e.alive || e.latched || e.ally || e.segs) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < vr2) L.push(e);
    }
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const rr = (a.r + b.r) * 0.9, dx = b.x - a.x, dy = b.y - a.y;
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = sqrt(d2) || 0.01, ov = rr - d, nx = dx / d, ny = dy / d;
        const ma = a.boss ? 1e6 : a.r * a.r, mb = b.boss ? 1e6 : b.r * b.r, t = ma + mb;
        const ka = mb / t, kb = ma / t;
        a.x -= nx * ov * ka * 0.6; a.y -= ny * ov * ka * 0.6;
        b.x += nx * ov * kb * 0.6; b.y += ny * ov * kb * 0.6;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // closing speed
        if (rv < 0) { const imp = rv * 0.6; a.vx += nx * imp * ka; a.vy += ny * imp * ka; b.vx -= nx * imp * kb; b.vy -= ny * imp * kb; }
      }
    }
  }
  nearestMote(x, y, R) {
    let best = null, bd = R * R;
    for (const m of this.motes) { const dx = m.x - x, dy = m.y - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = m; } }
    return best;
  }
  // nearest mote that another of your young isn't already heading for
  freeMote(c, R) {
    let best = null, bd = R * R;
    for (const m of this.motes) {
      const dx = m.x - c.x, dy = m.y - c.y, d2 = dx * dx + dy * dy;
      if (d2 >= bd) continue;
      let taken = false;
      for (const o of this.ents) if (o !== c && o.kind === 'clone' && o.alive && o.tm && hypot(o.tm.x - m.x, o.tm.y - m.y) < c.r * 2.5) { taken = true; break; }
      if (!taken) { bd = d2; best = m; }
    }
    return best;
  }
  // your young (Binary Fission / Offspring) keep a little space from each other and from you, so they never
  // draw on top of one another
  kinSpacing() {
    const p = this.p, K = this.kinList || (this.kinList = []);
    K.length = 0;
    for (const e of this.ents) if (e.alive && e.kind === 'clone') K.push(e);
    for (let i = 0; i < K.length; i++) {
      const a = K[i]; a.slot = i; a.nkin = K.length;
      for (let j = i + 1; j < K.length; j++) {
        const b = K[j], dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * 1.3, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const d = sqrt(d2), nx = d > 0.01 ? dx / d : cos(i + j), ny = d > 0.01 ? dy / d : sin(i + j), ov = (rr - d) * 0.5;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // closing speed
        if (rv < 0) { a.vx += nx * rv * 0.5; a.vy += ny * rv * 0.5; b.vx -= nx * rv * 0.5; b.vy -= ny * rv * 0.5; }
      }
      const dx = a.x - p.x, dy = a.y - p.y, rr = p.r * 1.15 + a.r, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) { const d = sqrt(d2), nx = d > 0.01 ? dx / d : cos(p.ang + PI), ny = d > 0.01 ? dy / d : sin(p.ang + PI); a.x = p.x + nx * rr; a.y = p.y + ny * rr; }
    }
  }
  removeMote(m) { const i = this.motes.indexOf(m); if (i >= 0) { this.motes[i] = this.motes[this.motes.length - 1]; this.motes.pop(); } }
  updateSegs(e) {
    let px = e.x, py = e.y; const sp = e.r * 1.7;
    for (const s of e.segs) {
      const dx = s.x - px, dy = s.y - py, d = hypot(dx, dy) + 0.001;
      s.x = px + dx / d * sp; s.y = py + dy / d * sp; px = s.x; py = s.y;
    }
  }
  cloneEat(c) {
    for (const e of this.ents) {
      if (e === c || !e.alive || e.ally || e.boss) continue;
      if (e.r < c.r * 0.8 && !isTiny(e) && this.canEat(e)) {
        const dx = e.x - c.x, dy = e.y - c.y;
        if (dx * dx + dy * dy < (c.r + e.r * 0.3) ** 2) { this.eat(e, 0.5); }
      }
    }
  }

  interact(e, d, dx, dy, dt, edible) {
    const p = this.p, S = SP[e.kind] || {};
    if (p.breachT > 0) return; // leaping: nothing touches you
    const puffed = p.puffK > 0.5;
    if (S.latch && !(edible && !isTiny(e))) {
      if (d < p.r + e.r * 0.8) {
        if (puffed) { this.spikeOff(e, -dx / d, -dy / d); return; } // nothing can latch onto a spiny ball
        if (isTiny(e) && (p.muts.spikes || p.dashT > 0)) { this.kill(e, false); this.sparkle(e.x, e.y, [220, 180, 255], 5); this.sfx('hit'); return; }
        if (p.dashT > 0) { this.damage(e, 25 + 10 * (p.muts.dash | 0), p); return; }
        if (p.iframes > 0 && p.cyst > 0) return;
        e.latched = true; e.la = atan2(e.y - p.y, e.x - p.x) - p.ang; p.latched++;
        if (S.latch.bite) this.hurt(S.latch.bite[0] + S.latch.bite[1] * this.depth, e, { why: S.name + ' bite' });
        this.sfx('hit'); this.buzz(8);
      }
      return;
    }
    if (e.kind === 'siphonophore') { this.siphHit(e, dt); return; }
    if (e.kind === 'mine') return; // mines go off by proximity, not by touch
    const touch = p.r + e.r;
    if (d > touch) return;
    if (edible) {
      if (p.puffK > 0.3) { if (d < touch) { const k = (touch - d) / d; e.x -= dx * k; e.y -= dy * k; } return; } // a mouth full of water can't eat
      if (d < p.r + e.r * 0.25 || (d < touch && e.r < p.r * 0.5)) this.eat(e, 1);
      return;
    }
    // non-edible contact: push apart
    const nx = -dx / d, ny = -dy / d, overlap = touch - d;
    const massP = p.r * p.r, massE = e.r * e.r, tot = massP + massE;
    const relV = (p.vx - e.vx) * nx + (p.vy - e.vy) * ny;
    if (e.kind !== 'amoeba') {
      p.x -= nx * overlap * (massE / tot); p.y -= ny * overlap * (massE / tot);
      e.x += nx * overlap * (massP / tot); e.y += ny * overlap * (massP / tot);
    }
    if (shelled(e)) {
      // a crushing beak cracks a shell at a touch; otherwise ram it
      const beak = p.muts.beak | 0;
      if (S.spiny && e.armor > 0 && !beak && p.puffK < 0.5 && e.hitCd <= 0) this.hurt((S.spiny[0] + S.spiny[1] * this.depth) * this.biteScale(e), e, { why: S.name + ' spines', iframes: 0.4 });
      if ((relV > 70 || p.dashT > 0 || beak) && e.hitCd <= 0 && e.armor > 0) {
        e.hitCd = 0.35; e.armor -= beak ? e.armor : p.dashT > 0 ? 2 : 1; e.flash = 1; e.dent = 0.3; e.dentA = atan2(-ny, -nx) - e.ang;
        this.sfx('hit', { pitch: 2 }); this.buzz(12); this.shake = min(10, this.shake + 3);
        this.burst(e.x - nx * e.r, e.y - ny * e.r, [255, 245, 215], 8, 160);
        if (e.armor <= 0) { e.armor = 0; this.sfx('pop'); this.texts.push({ x: e.x, y: e.y - e.r, s: 'Cracked!', life: 1, c: '#ffe7a8' }); }
        if (this.firstRun && !this.hints.shown.diatom) this.hint('diatom', 'Keep ramming the glass shell to crack it open', 'target', 3500);
        if (S.spiny && !beak && !this.hints.shown.urchin) this.hint('urchin', 'Ram the urchin to snap its spines off, then eat it. A beak cracks it in one bite', 'target', 4000);
      }
      p.vx -= nx * 160; p.vy -= ny * 160; e.vx += nx * 80; e.vy += ny * 80;
      return;
    }
    if (e.kind === 'volvox') {
      if (relV > 30 || p.dashT > 0) this.splitVolvox(e, nx, ny);
      p.vx -= nx * 90; p.vy -= ny * 90;
      return;
    }
    if (e.kind === 'grazer' && !(e.r > p.r * 1.12)) { p.vx -= nx * 60; p.vy -= ny * 60; return; }
    if (S.ai === 'anchored' || S.ai === 'trap' || S.ai === 'jelly') return; // they hurt with tentacles and spines, not by bumping
    if (!S.hostile && !S.bite) { p.vx -= nx * 60; p.vy -= ny * 60; return; } // a bigger harmless animal just bumps you aside
    // hostile contact
    if (puffed) { this.spikeOff(e, nx, ny); return; } // biters get a mouthful of spines
    if (p.dashT > 0) { this.damage(e, 25 + 10 * (p.muts.dash | 0), p); e.vx += nx * 300; e.vy += ny * 300; e.stun = 0.8; return; }
    if (p.muts.spikes) this.damage(e, 10 * p.muts.spikes * dt * 2, p, true);
    if (S.engulf) {
      this.hurt((S.engulf[0] + S.engulf[1] * this.depth) * dt * this.hazMult, null, { dot: true, why: S.name + ' engulfing you' });
      if (!e.fx || e.fx < this.T) { e.fx = this.T + 0.25; p.flashT = 0.2; this.shake = min(6, this.shake + 1.5); this.sfx('hurt', { vol: 0.5 }); this.sparkle(p.x, p.y, [255, 150, 90], 3); }
      p.vx *= exp(-dt * 3); p.vy *= exp(-dt * 3);
      return;
    }
    let dmg = S.bite ? S.bite[0] + S.bite[1] * this.depth : 5 + 2 * this.depth;
    if (this.camp) dmg *= this.biteScale(e);
    if (this.hurt(dmg, e, { why: e.kind === 'grazer' ? 'Bumped a bigger cell' : S.name || 'Hit' })) { e.vx += nx * 140; e.vy += ny * 140; e.stun = 0.4; }
  }
  // an attacker hits an inflated pufferfish: spined, stunned and bounced off
  spikeOff(e, nx, ny) {
    const p = this.p, lv = p.muts.puff | 0 || 1;
    if (e.hitCd > 0) return;
    e.hitCd = 0.5;
    this.damage(e, e.maxHp * (0.1 + 0.04 * lv) / this.stageHit(), p, true);
    e.vx += nx * 420; e.vy += ny * 420; e.stun = max(e.stun || 0, 0.7);
    if (e.latched) { e.latched = false; p.latched = max(0, p.latched - 1); }
    this.sparkle(e.x - nx * e.r, e.y - ny * e.r, [255, 235, 170], 5); this.sfx('hit', { pitch: 1.6 }); this.buzz(10);
  }
  // a small animal nips, one your size hurts, a big one bites hard
  biteScale(e) { const k = e.r / this.p.r; if (k < 1 && SP[e.kind] && SP[e.kind].pack) return max(0.35, k * k); return k < 1 ? Math.pow(k, 2.5) : min(C.TUNE.biteCap, k); } // a pack hunter's bite still hurts a bigger animal
  // krill swarms and fish schools steer by the centre and heading of their group
  computeFlocks() {
    const F = this.flock || (this.flock = {});
    for (const k in F) { F[k].n = 0; F[k].x = 0; F[k].y = 0; F[k].vx = 0; F[k].vy = 0; }
    for (const e of this.ents) {
      if (!e.alive) continue;
      const ai = SP[e.kind] && SP[e.kind].ai; if (ai !== 'swarm' && ai !== 'school') continue;
      const g = F[e.kind] || (F[e.kind] = { n: 0, x: 0, y: 0, vx: 0, vy: 0 });
      g.n++; g.x += e.x; g.y += e.y; g.vx += e.vx; g.vy += e.vy;
    }
    for (const k in F) { const g = F[k]; if (g.n) { g.x /= g.n; g.y /= g.n; g.vx /= g.n; g.vy /= g.n; } }
  }
  inkCloud(e) {
    this.inks = this.inks || [];
    this.inks.push({ x: e.x - cos(e.ang) * e.r, y: e.y - sin(e.ang) * e.r, r: e.r * 1.6, grow: e.r * 3.2, life: 4.5, max: 4.5, seed: random() * 10 });
    this.sfx('bubble');
  }
  glowAlarm(e) {
    // ostracods burst into blue light when attacked: the glow draws bigger predators to whoever ate them
    this.glows = this.glows || [];
    this.glows.push({ x: e.x, y: e.y, r: e.r * 5, life: 3, max: 3 });
    this.alarmT = 4;
    this.sfx('event', { vol: 0.5 });
  }
  siphHit(e, dt) {
    const p = this.p;
    // bells
    const pts = [e, ...e.segs];
    let hit = false;
    for (let i = 0; i < pts.length && !hit; i++) {
      const s = pts[i];
      if (hypot(p.x - s.x, p.y - s.y) < p.r + e.r * 0.9) hit = true;
      // tentacle samples
      for (let k = 1; k <= 3 && !hit; k++) {
        const ta = e.ang + PI + sin(this.T * 1.5 + i + k) * 0.5;
        const tx = s.x + cos(ta) * e.r * 1.5 * k + cos(ta + PI / 2) * sin(this.T * 2 + k + i) * e.r * 0.5;
        const ty = s.y + sin(ta) * e.r * 1.5 * k + sin(ta + PI / 2) * sin(this.T * 2 + k + i) * e.r * 0.5;
        if (hypot(p.x - tx, p.y - ty) < p.r + 5) hit = true;
      }
    }
    if (hit) {
      if (p.muts.spikes) this.damage(e, 10 * p.muts.spikes * dt * 2, p, true);
      if (p.dashT > 0) { this.damage(e, 30, p); return; }
      this.hurt((14 + 2 * this.depth) * dt * 2.2 * this.hazMult, null, { dot: true, why: 'Siphonophore sting' });
      if (!e.fx || e.fx < this.T) { e.fx = this.T + 0.3; p.flashT = 0.2; this.sfx('toxin', { vol: 0.35 }); this.sparkle(p.x, p.y, [255, 120, 220], 3); this.shake = min(6, this.shake + 1.5); }
    }
  }
  splitVolvox(e, nx, ny) {
    if (!e.alive || e.boss) return;
    e.alive = false;
    this.sfx('gulp', { vol: 0.7 }); this.buzz(15); this.burst(e.x, e.y, [140, 255, 150], 18, 200);
    const n = e.kids, kr = min(e.r * 0.36, this.p.r * 0.6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + random() * 0.4;
      const k = this.spawn('volvox', e.x + cos(a) * e.r * 0.5, e.y + sin(a) * e.r * 0.5, { r: kr, force: true, props: { kids: 2, hp: 20, maxHp: 20 } });
      if (k) { k.vx = cos(a) * 160 + nx * 60; k.vy = sin(a) * 160 + ny * 60; k.isKid = true; }
    }
  }
  eat(e, mult = 1) {
    if (!e.alive) return;
    if (this.boss) this.kitEat(e);
    if (SP[e.kind] && SP[e.kind].ai === 'glowbomb') this.glowAlarm(e);
    e.alive = false; if (e.latched) { this.p.latched--; }
    const v = (KIND_XP[e.kind] || 2) * (e.r / 6) * this.df() * (shelled(e) ? 1.3 : 1) * mult * (this.p.muts.stingproof && SP[e.kind] && SP[e.kind].ai === 'jelly' ? 1 + 0.5 * this.p.muts.stingproof : 1) * (this.p.muts.gillrakers && SP[e.kind] && SP[e.kind].filter ? 1 + 0.4 * this.p.muts.gillrakers : 1);
    this.gainXP(v, true);
    this.stats.eaten++; this.stats.kills++;
    this.combo++; this.comboT = 1.0;
    this.sfx('gulp', { vol: 0.8 }); this.sfx('eat', { pitch: min(10, this.combo + 1) });
    this.buzz(10);
    const col = (this.colorOf(e));
    this.burst(e.x, e.y, col, 10, 120);
    if (v >= 4) this.texts.push({ x: e.x, y: e.y - e.r, s: '+' + Math.round(v * this.xpMult), life: 1, c: '#bff4ff' });
    this.p.dent = 0.12; this.p.dentA = atan2(e.y - this.p.y, e.x - this.p.x) - this.p.ang;
    if (this.firstRun && !this.hints.shown.eat2 && this.stats.eaten === 1) this.hint('eat2', 'Smaller cells are food too — engulf them!', 'microbe', 3000);
  }
  colorOf(e) { return (SP[e.kind] && SP[e.kind].pcol) || [200, 255, 240]; }
  stageHit() { return this.camp ? 1 + 0.3 * ((this.p.stage | 0 || 1) - 1) : 1; } // bigger bodies hit harder
  damage(e, n, src, quiet = false) {
    if (!e.boss) n *= this.stageHit();
    if (!e.alive || e.ally) return;
    if (e.boss) { this.bossDamage(n, quiet); return; } // before the volvox check: the Volvox Titan must never split
    if (SP[e.kind] && SP[e.kind].armor) n *= 1 - SP[e.kind].armor;
    if (SP[e.kind] && SP[e.kind].ai === 'anchored') e.closedK = 1; // polyps snap shut when hurt
    if (e.kind === 'volvox' && !e.isKid) { this.splitVolvox(e, 0, 0); return; }
    e.hp -= n; e.flash = max(e.flash, quiet ? 0.45 : 1); e.hpShowT = 2.5;
    if (!quiet) { this.sfx('hit'); e.dent = 0.25; if (src) e.dentA = atan2(src.y - e.y, src.x - e.x) - e.ang; if (n >= 3) this.texts.push({ x: e.x, y: e.y - e.r, s: '-' + Math.round(n), life: 0.9, c: '#ffe28a' }); }
    else { e.qAcc = (e.qAcc || 0) + n; if (e.qAcc >= 6) { this.texts.push({ x: e.x + (random() - 0.5) * e.r, y: e.y - e.r, s: '-' + Math.round(e.qAcc), life: 0.7, c: '#ffd27a' }); e.qAcc = 0; } }
    if (e.hp <= 0) this.kill(e, true);
  }
  kill(e, drops) {
    if (!e.alive) return;
    if (e.kind === 'mine') { this.mineBurst(e); return; }
    if (SP[e.kind] && SP[e.kind].ai === 'glowbomb') this.glowAlarm(e);
    e.alive = false; if (e.latched) this.p.latched--;
    this.stats.kills++;
    this.burst(e.x, e.y, this.colorOf(e), 12, 160);
    if (drops) {
      const v = (KIND_XP[e.kind] || 2) * (e.r / 6) * 0.8;
      const n = clamp(Math.round(v / 1.5), 1, 8);
      for (let i = 0; i < n; i++) { const m = this.spawnMote(e.x + (random() - 0.5) * e.r, e.y + (random() - 0.5) * e.r, v / n); if (m) { const a = random() * TAU; m.vx = cos(a) * 90; m.vy = sin(a) * 90; } }
      this.sfx('pop', { pitch: 3 });
    }
  }
  updateAuras(dt) {
    const p = this.p, m = p.muts;
    // clouds
    for (const c of this.clouds) {
      c.life -= dt;
      for (const e of this.ents) {
        if (!e.alive || e.ally) continue;
        const dx = e.x - c.x, dy = e.y - c.y;
        if (dx * dx + dy * dy < (c.r + e.r) ** 2) { if (isTiny(e)) this.kill(e, false); else this.damage(e, c.dps * dt, null, true); }
      }
      if (this.boss && hypot(this.boss.x - c.x, this.boss.y - c.y) < c.r + this.boss.r) this.bossDamage(c.dps * dt * 0.6, true);
    }
    this.clouds = this.clouds.filter((c) => c.life > 0);
    if (this.auraDps && !this.dead) {
      const reachR = p.r * 1.35;
      for (const e of this.ents) {
        if (!e.alive || e.ally || e.boss) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        if (dx * dx + dy * dy < (reachR + e.r) ** 2 && !this.canEat(e)) { if (isTiny(e) || e.latched) { if (e.latched) { e.latched = false; p.latched--; } if (!isTiny(e)) { this.damage(e, 20, p); continue; } this.kill(e, false); } else this.damage(e, this.auraDps * dt, p, true); }
      }
      const b = this.boss;
      if (b && b.alive && hypot(b.x - p.x, b.y - p.y) < reachR + b.r) this.bossDamage(this.auraDps * dt * 0.7, true);
    }
    // symbionts
    const ns = m.symbionts | 0;
    if (ns) {
      this.symb = this.symb || [];
      const R = p.r * 2.1, sr = (p.stage | 0) >= 4 ? max(7, p.r * 0.22) : 7; // pilot fish (on a fish) are a little bigger than bacteria
      for (let i = 0; i < ns; i++) {
        const a = this.T * 2.2 + (i / ns) * TAU;
        const sx = p.x + cos(a) * R, sy = p.y + sin(a) * R;
        this.symb[i] = [sx, sy];
        for (const e of this.ents) {
          if (!e.alive || e.ally) continue;
          const dx = e.x - sx, dy = e.y - sy;
          if (dx * dx + dy * dy < (e.r + sr) ** 2) { if (isTiny(e) || e.latched) { if (e.latched) { e.latched = false; p.latched--; } if (!isTiny(e)) { this.damage(e, 20, p); continue; } this.kill(e, false); } else this.damage(e, 22 * dt, null, true); }
        }
        if (this.boss) { const b = this.boss; if (hypot(b.x - sx, b.y - sy) < b.r + sr) this.bossDamage(12 * dt, true); }
        for (const s of this.shards) if (s.life > 0 && hypot(s.x - sx, s.y - sy) < sr + 5) { s.life = 0; this.sparkle(s.x, s.y, [200, 220, 255], 4); }
      }
    }
  }

  updateHazards(dt) {
    const p = this.p, vr = this.viewR() * 3;
    let w = 0;
    p.inMucus = false;
    for (const h of this.hazards) {
      h.t += dt;
      if (hypot(h.x - p.x, h.y - p.y) > vr + h.r) continue;
      const dx = p.x - h.x, dy = p.y - h.y, d = hypot(dx, dy);
      if (!this.dead) {
        if (h.type === 'uv') {
          const sx = h.x + (p.y - h.y) * 0.25; // slanted shaft
          if (abs(p.x - sx) < h.r * 0.5) {
            if (p.muts.chloro) { this.heal(3 * p.muts.chloro * dt); if (random() < dt * 6) this.sparkle(p.x + (random() - 0.5) * p.r * 2, p.y + (random() - 0.5) * p.r * 2, [140, 255, 150], 1); }
            else {
              this.hurt(5 * this.hazMult * dt, null, { dot: true, env: true, why: 'UV light burns' }); p.uvT = (p.uvT || 0) + dt;
              if (this.firstRun && !this.hints.shown.uv && p.uvT > 0.6) this.hint('uv', 'UV light burns! Chloroplasts would turn it into food', 'sun', 3500, false, 'warn');
            }
          }
        } else if (h.type === 'toxic') {
          if (d < h.r * 0.8) { this.hurt(7 * this.hazMult * dt, null, { dot: true, env: true, why: 'Toxic cloud' }); if (random() < dt * 4) this.sparkle(p.x, p.y, [160, 230, 90], 1); }
        } else if (h.type === 'mucus') {
          if (d < h.r * 0.86 + p.r * 0.3) p.inMucus = true;
          if (d < this.viewR() + h.r) this.noticeHazard('mucus');
        } else if (h.type === 'vortex') {
          if (d < this.viewR() + h.r * 0.5) this.noticeHazard('vortex');
          if (d < h.r) {
            const k = 1 - d / h.r, f = 330 * k * (1 - 0.22 * (p.muts.osmo | 0));
            p.vx -= dx / d * f * dt; p.vy -= dy / d * f * dt;          // drawn in
            p.vx += -dy / d * f * 0.6 * dt; p.vy += dx / d * f * 0.6 * dt; // and spun around
            if (d < h.r * 0.2 + p.r * 0.5) this.hurt(20 * this.hazMult * dt, null, { dot: true, env: true, why: 'Whirlpool' });
          }
        } else if (h.type === 'vent') {
          if (d < h.r * 0.42 + p.r) { this.hurt(26 * this.hazMult * dt, null, { dot: true, env: true, why: 'Vent heat' }); if (random() < dt * 8) { this.sparkle(p.x, p.y, [255, 120, 70], 1); p.flashT = 0.1; } }
        }
      }
      if (h.type === 'vent') {
        h.moteT -= dt;
        if (h.moteT <= 0) { h.moteT = 0.35; const a = random() * TAU, rr = h.r * (0.6 + random() * 0.5); this.spawnMote(h.x + cos(a) * rr, h.y + sin(a) * rr, 2.2, 1); }
      }
      this.hazards[w++] = h;
    }
    this.hazards.length = w;
  }

  // ---------- abilities ----------
  useDash() {
    const p = this.p; if (!p.muts.dash || p.dashCd > 0 || this.dead || this.modal) return;
    const [dx, dy, mag] = this.moveDir();
    const a = mag > 0 ? atan2(dy, dx) : p.ang;
    const v = D.baseSpeed(p.r) * this.speedMult * 3.4;
    p.vx = cos(a) * v; p.vy = sin(a) * v; p.ang = a;
    p.dashT = 0.28; p.iframes = max(p.iframes, 0.45); p.dashCd = 6 - 0.8 * (p.muts.dash - 1);
    this.detachPhages(99);
    // hunting stripes: prey nearby freeze when a sailfish lights up and charges
    if (p.muts.stripes) { p.stripeT = 0.8; for (const e of this.ents) if (e.alive && !e.ally && !e.boss && !HOSTILE[e.kind] && hypot(e.x - p.x, e.y - p.y) < p.r * 6 + 120) e.stun = max(e.stun || 0, 0.6 * p.muts.stripes); }
    this.sfx('dash'); this.buzz(20);
    for (let i = 0; i < 14; i++) this.part(p.x, p.y, -cos(a) * 200 + (random() - 0.5) * 120, -sin(a) * 200 + (random() - 0.5) * 120, 0.5, [190, 255, 240], 2 + random() * 3);
    this.abFlash('dash');
  }
  useNova() {
    const p = this.p; if (!p.muts.nova || p.novaCd > 0 || this.dead || this.modal) return;
    p.novaCd = 15 - 2 * (p.muts.nova - 1);
    this.shockwave(p.x, p.y, p.r * 7.5, 35 + 20 * p.muts.nova, false);
    if ((p.stage | 0) >= 4) { const r = this.rings[this.rings.length - 1]; r.c = [185, 175, 255]; r.bolt = this.T; } // a fish's electric organ discharging
    this.sfx('toxin'); this.sfx('boss', { vol: 0.35 }); this.buzz([20, 30, 40]);
    this.abFlash('nova');
  }
  shockwave(x, y, R, dmg, knockOnly) {
    this.rings = this.rings || [];
    this.rings.push({ x, y, r: 0, R, life: 0.6, c: knockOnly ? [255, 230, 160] : [200, 130, 255] });
    this.shake = min(16, this.shake + 10); this.flash = 0.35;
    for (const e of this.ents) {
      if (!e.alive || e.ally) continue;
      const dx = e.x - x, dy = e.y - y, d = hypot(dx, dy) + 0.01;
      if (d < R + e.r) {
        if (e.latched) { e.latched = false; this.p.latched--; }
        e.vx += dx / d * 420; e.vy += dy / d * 420; e.stun = 1;
        if (!knockOnly) { if (isTiny(e)) this.kill(e, false); else this.damage(e, dmg, { x, y }); }
      }
    }
    this.p.latched = max(0, this.p.latched);
    for (const s of this.shards) if (hypot(s.x - x, s.y - y) < R) s.life = 0;
    if (!knockOnly && this.boss && hypot(this.boss.x - x, this.boss.y - y) < R + this.boss.r) this.bossDamage(dmg * 0.8);
  }
  buildAbilities() {
    // one button per active ability you brought (at most four), in a fixed order: the first is big, the rest small
    const owned = ABILITIES.filter((a) => this.p.muts[a.id]).map((a) => a.id);
    const pick = this.camp ? C.loadoutFor(owned, this.camp.loadout, this.p.stage | 0) : owned;
    const want = owned.filter((id) => pick.includes(id));
    if (want.join() === Object.keys(this.abBtns).join()) return;
    this.abBox.innerHTML = ''; this.abBtns = {};
    want.forEach((id, i) => {
      const A = ABILITY_BY_ID[id], ring = el('div.mb-ring');
      const b = el('button.mb-ab.mb-tap', { class: (i ? (want.length >= 4 ? 'small tiny ' : 'small ') : '') + 'ab-' + id, 'aria-label': this.mutName(id) }, [ring, portrait('mutation', id, 56, this.p.stage)]);
      b.style.setProperty('--ring-c', A.col);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this[A.use](); });
      this.abBox.appendChild(b);
      this.abBtns[id] = { b, ring, last: -1 };
    });
    if (this.firstRun && !this.hints.shown.ability) this.later(300, () => this.hint('ability', 'Tap the new button (or Space) to use your ability', 'bolt', 3500));
  }
  abFlash(id) { const a = this.abBtns[id]; if (!a) return; a.b.classList.remove('flash'); void a.b.offsetWidth; a.b.classList.add('flash'); }
  updateAbilitiesUI() {
    const p = this.p;
    for (const id in this.abBtns) {
      const a = this.abBtns[id];
      const A = ABILITY_BY_ID[id], cd = p[A.cdKey] || 0, max_ = A.cd(p.muts[id] | 0 || 1);
      const k = cd <= 0 ? 1 : 1 - cd / max_;
      const q = Math.round(k * 50) / 50;
      if (q !== a.last) { a.last = q; a.ring.style.setProperty('--p', q); a.b.classList.toggle('ready', k >= 1); a.b.classList.toggle('cool', k < 1); }
    }
  }

  // ---------- bosses ----------
  spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;
    const p = this.p;
    const B = this.camp ? C.BOSSES[this.D.boss] : { id: this.D.boss, art: this.D.boss, logic: this.D.boss, hp: this.D.boss === 'queen' ? 1300 + 60 * this.era : 520 + 30 * this.era, speed: this.D.boss === 'queen' ? 55 : 42, name: this.D.boss === 'queen' ? 'Phage Queen' : 'Colossal Amoeba', tagline: this.D.boss === 'queen' ? 'The crystal virus awakens' : 'Something enormous stirs', swarm: 'phage', minions: ['grazer', 'grazer', 'hunter'], attacks: ['burst', 'charge', 'swarm'], phases: this.D.boss === 'queen' ? 2 : 1 };
    const kind = B.art;
    const a = random() * TAU, dist = this.viewR() * 0.95;
    const isQ = B.logic === 'queen';
    const kit = this.camp ? BOSS_KIT[B.id] : null; // every campaign boss has its own fight (bosses.js)
    const b = this.spawn(kind, p.x + cos(a) * dist, p.y + sin(a) * dist, { force: true, r: kit ? kit.r(p) : isQ ? 120 + p.r * 1.2 : 120 + p.r * 1.5 });
    b.boss = true; b.B = B; b.logic = B.logic; b.bossId = B.id; if (B.col) b.col = B.col;
    b.hp = b.maxHp = B.hp * (this.camp ? 1 + C.TUNE.bossHpPer * (this.L.c - 1) : 1); b.spd = B.speed;
    b.armor = kind === 'diatom' ? 3 : 0; b.armorMax = b.armor; b.kids = 6; b.pullT = 6; b.burstT = 5;
    b.spots = []; const ns = isQ ? 3 : 4;
    for (let i = 0; i < ns; i++) b.spots.push({ a: (i / ns) * TAU + (isQ ? PI / 6 : 0.3), cd: 0, pulse: random() * TAU });
    b.atk = 2.5; b.state = 'idle'; b.st = 0; b.phase = 1; b.minT = 5; b.rot = 0; b.tele = 0;
    this.boss = b;
    if (kit) { b.kit = kit; b.spots = []; b.ang = atan2(p.y - b.y, p.x - b.x); this.kitSpawn(b); }
    // clear some hostiles for fairness
    for (const e of this.ents) if (e !== b && HOSTILE[e.kind] && e.kind !== 'phage' && hypot(e.x - p.x, e.y - p.y) < 600) e.alive = false;
    this.ents = this.ents.filter((e) => e.alive);
    this.sfx('boss'); this.buzz([80, 60, 120]);
    this.banner(B.name, B.tagline, 'danger');
    if (this.camp && D.SPECIES_BY_ID[B.id] && !this.seen[B.id]) this.discover(B.id);
    this.shake = 12;
    this.depthBox.classList.add('boss');
    if (!kit && (this.firstRun || !this.hints.shown.boss)) this.later(1800, () => this.hint('boss', 'Bite the glowing weak spots — avoid the body!', 'target', 4500));
  }
  updateBoss(dt) {
    const b = this.boss, p = this.p;
    if (!b.alive) return;
    if (b.kit) { this.kitTick(b, dt); return; }
    const isQ = b.logic === 'queen', B = b.B;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    b.rot += dt * (isQ ? 0.5 : 0.25) * (b.phase >= 2 ? 1.6 : 1);
    b.tele = max(0, b.tele - dt * 2);
    for (const s of b.spots) { s.cd = max(0, s.cd - dt); s.pulse += dt * 4; }
    b.vx *= exp(-dt * 1.5); b.vy *= exp(-dt * 1.5);
    if (!isQ) {
      // slow hunt
      const sp = b.spd * (b.hp < b.maxHp * 0.5 ? 1.25 : 1);
      if (!this.dead) { b.vx += (dx / d * sp - b.vx) * min(1, dt * 0.8); b.vy += (dy / d * sp - b.vy) * min(1, dt * 0.8); }
      b.minT -= dt;
      if (b.minT <= 0) {
        b.minT = 7; b.tele = 1;
        this.sfx('gulp', { vol: 0.6 });
        const mins = (B && B.minions) || ['grazer', 'grazer', 'hunter'];
        for (let i = 0; i < mins.length; i++) {
          const a = random() * TAU, x = b.x + cos(a) * b.r, y = b.y + sin(a) * b.r;
          const kind = mins[i];
          const big = kind === 'hunter' || kind === 'rotifer' || kind === 'amoeba';
          const m = this.spawn(kind, x, y, { force: true, r: kind === 'amoeba' ? p.r * 1.6 : big ? p.r * 1.05 : p.r * 0.7 });
          if (m) { m.vx = cos(a) * 160; m.vy = sin(a) * 160; }
        }
      }
      // crown suction: drags the player in for a moment (telegraphed)
      if (B && B.pull) {
        b.pullT -= dt;
        if (b.pullT <= 1.2 && b.pullT > 0) b.tele = 1;
        if (b.pullT <= 0) {
          if (d < 900 && !this.dead) { const f = 210 * (1 - d / 900) + 60; p.vx -= dx / d * f * dt * 4; p.vy -= dy / d * f * dt * 4; }
          if (b.pullT < -2.2) b.pullT = 7;
        }
      }
      // radial shard bursts
      if (B && B.burst) {
        b.burstT -= dt;
        if (b.burstT <= 0.9) b.tele = 1;
        if (b.burstT <= 0) {
          b.burstT = b.hp < b.maxHp * 0.5 ? 4.2 : 6;
          const n = 12, off = random() * TAU;
          for (let i = 0; i < n; i++) { const a = off + (i / n) * TAU; this.shards.push({ x: b.x + cos(a) * b.r, y: b.y + sin(a) * b.r, vx: cos(a) * 190, vy: sin(a) * 190, life: 4, a }); }
          this.sfx('toxin'); this.shake = min(12, this.shake + 5);
        }
      }
    } else {
      b.st -= dt;
      const ph2 = b.phase >= 2; // the final form keeps every phase-2 attack
      if (b.state === 'idle') {
        const want = 280;
        const k = d > want ? 1 : -0.6;
        if (!this.dead) { b.vx += (dx / d * b.spd * k - b.vx) * min(1, dt); b.vy += (dy / d * b.spd * k - b.vy) * min(1, dt); }
        b.atk -= dt;
        if (b.atk <= 0 && !this.dead) {
          const r = random();
          if (B && B.attacks) { const pick = B.attacks[Math.floor(r * B.attacks.length)]; b.state = pick === 'burst' ? 'burstT' : pick === 'charge' ? 'chargeT' : 'swarm'; }
          else b.state = r < 0.4 ? 'burstT' : r < 0.72 ? 'chargeT' : 'swarm';
          b.st = b.state === 'burstT' ? 0.9 : b.state === 'chargeT' ? 1.0 : 0.6;
          b.ca = atan2(dy, dx);
          if (b.state === 'swarm') this.sfx('bubble');
        }
      } else if (b.state === 'burstT') {
        b.tele = 1; b.vx *= 0.9; b.vy *= 0.9;
        if (b.st <= 0) {
          const n = ph2 ? 18 : 12, off = random() * TAU;
          for (let ring = 0; ring < (ph2 ? 2 : 1); ring++)
            for (let i = 0; i < n; i++) { const a = off + (i / n) * TAU + ring * PI / n; const s = 210 - ring * 50; this.shards.push({ x: b.x + cos(a) * b.r, y: b.y + sin(a) * b.r, vx: cos(a) * s, vy: sin(a) * s, life: 4, a }); }
          this.sfx('toxin'); this.shake = min(12, this.shake + 6);
          b.state = 'idle'; b.atk = ph2 ? 2.2 : 3.2;
        }
      } else if (b.state === 'chargeT') {
        b.tele = 1; b.ca = b.ca + angDiff(b.ca, atan2(dy, dx)) * min(1, dt * 3);
        b.vx *= 0.85; b.vy *= 0.85;
        if (b.st <= 0) { b.state = 'charge'; b.st = 0.85; const s = ph2 ? 620 : 520; b.vx = cos(b.ca) * s; b.vy = sin(b.ca) * s; this.sfx('dash'); this.sfx('boss', { vol: 0.3 }); }
      } else if (b.state === 'charge') {
        if (random() < 0.5) this.part(b.x, b.y, -b.vx * 0.2 + (random() - 0.5) * 80, -b.vy * 0.2 + (random() - 0.5) * 80, 0.6, ph2 ? [255, 110, 170] : [150, 180, 255], 4);
        if (b.st <= 0) { b.state = 'idle'; b.atk = ph2 ? 2 : 3; }
        b.vx /= exp(-dt * 1.5); b.vy /= exp(-dt * 1.5); // keep speed
      } else if (b.state === 'swarm') {
        if (b.st <= 0) {
          const sk = (B && B.swarm) || 'phage';
          const tiny = sk === 'phage' || sk === 'chytrid', prey = SP[sk] && !SP[sk].hostile;
          const n = tiny ? (ph2 ? 9 : 6) : prey ? (ph2 ? 6 : 4) : (ph2 ? 4 : 3);
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const e = this.spawn(sk, b.x + cos(a) * b.r, b.y + sin(a) * b.r, { force: true, r: tiny ? undefined : p.r * (prey ? 0.6 : sk === 'cookiecutter' ? 0.5 : 1.0) }); if (e) { e.vx = cos(a) * 220; e.vy = sin(a) * 220; } }
          b.state = 'idle'; b.atk = ph2 ? 2.4 : 3.4;
        }
      }
      const phases = (B && B.phases) || 1;
      if (phases >= 3 && b.phase === 2 && b.hp < b.maxHp * 0.33) {
        b.phase = 3; b.state = 'idle'; b.atk = 1; b.spd *= 1.25;
        this.banner('Final form', `${B.name} unleashes everything`, 'danger');
        this.sfx('boss'); this.shake = 18; this.flash = 0.6; this.buzz([60, 40, 60, 40, 60]);
        this.burst(b.x, b.y, [255, 210, 120], 50, 360);
      }
      // only from phase 1: in phase 3 this used to flip back to phase 2 every frame, each time making the boss 25% faster
      if (b.phase === 1 && phases >= 2 && b.hp < b.maxHp * (phases >= 3 ? 0.66 : 0.5)) {
        b.phase = 2; b.state = 'idle'; b.atk = 1.2;
        this.banner('Phase 2', `${B ? B.name : 'The Queen'} shatters into a fury`, 'danger');
        this.sfx('boss'); this.shake = 16; this.flash = 0.5; this.buzz([60, 40, 60]);
        this.burst(b.x, b.y, [255, 110, 170], 40, 320);
      }
    }
    // safety net: a boss can never outrun the arena or vanish
    const bv = hypot(b.vx, b.vy), vmax = 900;
    if (bv > vmax) { b.vx *= vmax / bv; b.vy *= vmax / bv; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || hypot(b.x - p.x, b.y - p.y) > 2200) {
      const a = Number.isFinite(b.x) ? atan2(b.y - p.y, b.x - p.x) : random() * TAU, rr = this.viewR() * 0.95;
      b.x = p.x + cos(a) * rr; b.y = p.y + sin(a) * rr; b.vx = 0; b.vy = 0; b.state = 'idle'; b.atk = 1.5;
    }
    if (!isQ) b.ang = atan2(b.vy, b.vx); else b.ang = b.state === 'chargeT' || b.state === 'charge' ? b.ca : atan2(dy, dx);
    // player interaction
    if (this.dead) return;
    let bit = false;
    for (const s of b.spots) {
      const a = s.a + b.rot, wx = b.x + cos(a) * b.r * 0.97, wy = b.y + sin(a) * b.r * 0.97, wr = 12 + b.r * 0.08;
      s.wx = wx; s.wy = wy; s.wr = wr;
      if (s.cd <= 0 && hypot(p.x - wx, p.y - wy) < p.r + wr) {
        s.cd = isQ ? 2.0 : 2.6; bit = true;
        const dmg = (28 + p.r * 1.3) * (1 + 0.3 * (p.muts.lysosome | 0)) * (this.biteMult || 1) * (p.dashT > 0 ? 1.5 : 1) * (p.senseT > 0 ? 1.3 : 1);
        this.bossDamage(dmg);
        this.burst(wx, wy, [255, 240, 140], 16, 220);
        this.sfx('gulp'); this.sfx('hit'); this.buzz(30); this.shake = min(14, this.shake + 7);
        const na = atan2(p.y - b.y, p.x - b.x);
        p.vx = cos(na) * 380; p.vy = sin(na) * 380; p.iframes = max(p.iframes, 0.5);
        b.vx -= cos(na) * 120; b.vy -= sin(na) * 120; b.tele = 1; b.dent = 0.25; b.dentA = na - b.ang;
        this.texts.push({ x: wx, y: wy - 10, s: '-' + Math.round(dmg), life: 1, c: '#ffe28a' });
      }
    }
    const bodyR = isQ ? b.r * 0.92 : b.r * 0.95;
    if (!bit && d < bodyR + p.r * 0.85) {
      const na = atan2(p.y - b.y, p.x - b.x);
      const pen = bodyR + p.r * 0.85 - d;
      p.x += cos(na) * pen; p.y += sin(na) * pen;
      if (p.dashT > 0) this.bossDamage(15);
      if (p.muts.spikes) this.bossDamage(6 * p.muts.spikes * dt, true);
      if (this.hurt((isQ ? 16 : 14) + 2 * (this.camp ? 3 : this.depth), b, { iframes: 0.8, why: b.B ? b.B.name : 'Boss' })) { p.vx = cos(na) * 420; p.vy = sin(na) * 420; }
    }
  }
  bossDamage(n, quiet = false) {
    const b = this.boss; if (!b || !b.alive) return;
    if (b.kit) { n *= b.kit.chip ?? 0.15; if (!(n > 0)) return; } // traits only chip at bespoke bosses: the fight is the mechanic
    b.hp -= n; b.flash = quiet ? max(b.flash, 0.3) : 1;
    if (b.hp <= 0) this.bossDie();
  }
  // the end of the journey: something even bigger than you glides past
  finaleWhale() {
    if (this.dead) return;
    const p = this.p, a = p.ang + PI * 0.75, R = this.viewR() * 0.85;
    const e = this.spawn('bluewhale', p.x + cos(a) * R, p.y + sin(a) * R, { force: true, r: (p.r0 || p.r) * 1.1 }); // about twice your length
    if (!e) return;
    const ux = p.x - e.x, uy = p.y - e.y, ud = hypot(ux, uy) + 0.01, side = 0.35;
    e.ctl = { tx: ux / ud * cos(side) - uy / ud * sin(side), ty: ux / ud * sin(side) + uy / ud * cos(side), sp: 120 + (p.r0 || p.r) * 2, steer: 1.5 };
    e.ang = atan2(e.ctl.ty, e.ctl.tx); e.breathK = 0;
    this.later(1200, () => this.hint('finale_whale', 'A blue whale: the biggest animal that has ever lived', 'star', 4500));
  }
  bossDie() {
    const b = this.boss; if (!b || !b.alive) return;
    b.alive = false; b.hp = 0; b.noDraw = false;
    this.kitDie(b);
    const isQ = b.logic === 'queen';
    if (isQ) this.stats.finalKills++; else this.stats.miniKills++;
    this.stats.kills++;
    this.bossDefeated = true; this.depthBox.classList.remove('boss');
    this.sfx('evolve'); this.sfx('victory'); this.buzz([50, 50, 100]);
    this.shake = 20; this.flash = 0.8; this.slowmo = 0.3;
    this.later(900, () => { if (!this.dead) this.slowmo = 1; });
    for (let i = 0; i < 4; i++) this.burst(b.x + (random() - 0.5) * b.r, b.y + (random() - 0.5) * b.r, isQ ? [160, 190, 255] : [255, 150, 90], 30, 340);
    for (let i = 0; i < 40; i++) { const a = random() * TAU, rr = random() * b.r; const m = this.spawnMote(b.x + cos(a) * rr, b.y + sin(a) * rr, 3, 0); if (m) { m.vx = cos(a) * 200; m.vy = sin(a) * 200; } }
    for (const e of this.ents) if (isLatcher(e)) this.kill(e, false);
    this.shards.length = 0;
    this.boss = null;
    this.renderPips();
    if (this.camp) {
      this.banner('Defeated', b.B.name, 'gold');
      const finale = !this.L.ocean && this.camp.level === C.TOTAL_LEVELS && C.LIVE_HABITATS === C.HABITATS.length - 1;
      if (finale) this.later(700, () => this.finaleWhale());
      if (this.L.ocean) this.later(1400, () => { if (!this.dead) this.rematchReward(); });
      this.later(finale ? 7500 : 3200, () => { if (!this.dead) this.levelComplete(); }); // (the finale lets the blue whale pass first)
      return;
    }
    if (isQ) { this.depthsCleared = 5; this.later(1500, () => this.win()); }
    else { this.banner('Colossus Defeated', '+15 DNA · the way down opens', 'gold'); this.later(3500, () => { if (!this.dead) this.descend(); }); }
  }
  updateShards(dt) {
    const p = this.p;
    let w = 0;
    for (const s of this.shards) {
      s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.life <= 0) continue;
      if (!this.dead && hypot(p.x - s.x, p.y - s.y) < p.r + 6) {
        if (p.muts.spikes && random() < 0.25 * p.muts.spikes) { this.sparkle(s.x, s.y, [220, 255, 250], 4); continue; }
        if (this.hurt(9 + 2 * this.depth, s, { why: s.why || 'Shards' })) { this.sparkle(s.x, s.y, [200, 220, 255], 6); continue; }
      }
      this.shards[w++] = s;
    }
    this.shards.length = w;
  }

  // ---------- particles ----------
  part(x, y, vx, vy, life, c, s) {
    const max_ = this.battery ? 160 : 400;
    if (this.parts.length >= max_) return;
    this.parts.push({ x, y, vx, vy, life, max: life, c, s });
  }
  burst(x, y, c, n, sp) { n = this.battery ? n >> 1 : n; for (let i = 0; i < n; i++) { const a = random() * TAU, v = sp * (0.3 + random() * 0.7); this.part(x, y, cos(a) * v, sin(a) * v, 0.4 + random() * 0.5, c, 2 + random() * 4); } }
  sparkle(x, y, c, n) { for (let i = 0; i < n; i++) { const a = random() * TAU, v = 30 + random() * 60; this.part(x, y, cos(a) * v, sin(a) * v, 0.3 + random() * 0.3, c, 1.5 + random() * 2.5); } }
  updateParts(dt) {
    let w = 0; const ps = this.parts, dk = exp(-dt * 3);
    for (const q of ps) { q.life -= dt; if (q.life <= 0) continue; q.vx *= dk; q.vy *= dk; q.x += q.vx * dt; q.y += q.vy * dt; ps[w++] = q; }
    ps.length = w;
    let wt = 0; for (const t of this.texts) { t.life -= dt * 0.9; t.y -= dt * 30; if (t.life > 0) this.texts[wt++] = t; } this.texts.length = wt;
    if (this.rings) { for (const r of this.rings) { r.life -= dt; r.r = max(0, r.R * (1 - r.life / (r.max || 0.6))); } this.rings = this.rings.filter((r) => r.life > 0); }
  }

  // ---------- discovery & toasts ----------
  discover(kind) {
    if (this.dead || this.victory || this.modal === 'results') return;
    this.seen[kind] = true;
    if (this.codex.microbes && this.codex.microbes[kind]) return;
    if (this.disc.microbes.includes(kind)) return;
    this.disc.microbes.push(kind);
    const sp = D.SPECIES_BY_ID[kind];
    if (THREAT_INFO[kind]) { this.threatIntro(kind); return; }
    this.toast('New species discovered!', this.camp ? sp.name : `${sp.name} <span class="dna-c">+2 DNA</span>`, kind, 'microbe', 'dna');
    this.sfx('coin');
  }
  toast(kicker, text, pid, pkind, cls = '') {
    const t = el('div.toast', { class: cls }, [pid ? portrait(pkind, pid, 40, this.p && this.p.stage) : null, el('div.mb-tt', {}, [el('small', {}, kicker), el('span', { html: text })])]);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    this.later(2600, () => { t.classList.add('out'); this.later(320, () => t.remove()); });
  }
  banner(title, sub, cls = '') {
    if (this.bannerEl) this.bannerEl.remove();
    const b = this.bannerEl = el('div.mb-banner', { class: cls }, [el('div.mb-kicker', {}, sub ? title : ''), el('h1', {}, sub || title)]);
    if (sub) { b.firstChild.textContent = title; b.lastChild.textContent = sub; }
    this.hud.appendChild(b);
    this.later(2900, () => b.remove());
  }
  hint(id, text, ic, ms = 4000, hand = false, cls = '') {
    if (!this.firstRun && !/^(boss|ab_)/.test(id)) return;
    if (this.hints.shown[id]) return;
    this.hints.shown[id] = true;
    if (this.hintEl) this.hintEl.remove();
    if (this.handEl) { this.handEl.remove(); this.handEl = null; }
    const h = this.hintEl = el('div.mb-hint', { class: cls }, [icon(ic), el('span', {}, text)]);
    this.hud.appendChild(h);
    if (hand) { this.handEl = el('div.mb-hand', {}, icon('hand')); this.hud.appendChild(this.handEl); }
    const hid = this.hintEl;
    this.later(ms, () => { if (this.hintEl === hid) this.clearHint(); });
  }
  clearHint() {
    const h = this.hintEl; this.hintEl = null;
    if (h) { h.classList.add('out'); this.later(300, () => h.remove()); }
    if (this.handEl) { this.handEl.remove(); this.handEl = null; }
  }
  updateHints() {
    if (!this.firstRun) return;
    if (this.hints.shown.move && !this.hints.shown.eat && this.hints.moved > 1.2) { this.clearHint(); this.hint('eat', 'Eat glowing motes to grow', 'star', 4500); }
  }

  // ---------- overlays ----------
  // no body limit: every trait you pick stays, so the goal is to collect them all
  traitCount() { return this.mutOrder.filter((id) => this.p.muts[id] > 0).length; }
  // a trait's name as it looks on a body of this stage (polyps become pyloric caeca on a fish, etc.)
  mutName(id, stage = this.p.stage) { const d = C.traitForm(mutDef(id), stage); return d ? d.name : id; }
  // the defeat headline, in words that fit your body
  lostLine() { const st = this.p.stage | 0; return st <= 1 ? 'Your cell dissolved' : st === 2 ? 'Your colony fell apart' : 'You didn\u2019t make it'; }
  traitTotal() { return D.MUTATIONS.length + C.NEW_MUTATIONS.length; }
  pickOffers(n) {
    const p = this.p, R = this.rng;
    const all = this.camp ? [...D.MUTATIONS, ...C.NEW_MUTATIONS.filter((m) => m.stage <= (p.stage | 0 || 1))] : D.MUTATIONS;
    // the journey introduces traits gradually, and favours the ones that suit this habitat
    // active powers come with your bodies (C.STAGE_POWER); a pick can only level up one you already have
    const pool = all.filter((m) => (p.muts[m.id] | 0) < m.maxLevel && (!this.camp || (m.active ? p.muts[m.id] : (C.TRAIT_FROM[m.id] || 1) <= this.L.c || p.muts[m.id])));
    const fit = (x) => (this.camp ? C.traitFit(x.id, this.L)[0] : 1);
    const out = [];
    while (out.length < n && pool.length) {
      const m = R.weighted(pool, (x) => D.RARITY[x.rarity].weight * (p.muts[x.id] ? 1.25 : 1) * fit(x) * (x.active && this.depth === 1 && p.level < 3 ? 0.5 : 1));
      out.push(m); pool.splice(pool.indexOf(m), 1);
    }
    // until you have tried every trait on offer, each pick includes at least one you have never had
    if (this.camp && out.length && !out.some((m) => !p.muts[m.id])) {
      const fresh = pool.filter((m) => !p.muts[m.id]);
      if (fresh.length) out[out.length - 1] = R.weighted(fresh, (x) => D.RARITY[x.rarity].weight * fit(x));
    }
    // when the genome is (nearly) complete, fill the remaining slots with repeatable boons so a
    // level-up can never come up empty
    for (const b of (this.camp ? CAMP_BOONS : BOONS)) { if (out.length >= n) break; out.push(b); }
    return out;
  }
  offerLevel(headstart = false) {
    const p = this.p;
    if (!headstart) { this.pendingLevels--; }
    this.modal = 'level'; this.releaseStick(); this.keys = {};
    if (!headstart) { this.sfx('levelup'); this.buzz([15, 30, 15]); this.flash = 0.3; this.burst(p.x, p.y, [140, 255, 220], 20, 200); }
    const n = this.genome.wide ? 4 : 3;
    const ov = el('div.mb-overlay');
    const firstExplain = this.firstRun && !this.hints.shown.lvl && !headstart;
    if (firstExplain) this.hints.shown.lvl = true;
    const head = el('div.mb-lvl-head', {}, [
      el('div.mb-kicker', {}, headstart ? 'Head Start' : this.camp ? `Evolution ${this.evo.level - this.pendingLevels}` : `Level ${p.level}`),
      el('h1', {}, headstart ? 'Choose a gene' : 'Evolve!'),
      firstExplain ? el('p.dim.small', {}, this.camp ? 'Your evolution bar is full. Pick a trait: it stays with you for the whole journey, and stacks if you pick it again.' : 'You grew big enough to mutate. Pick one — it changes how your cell looks and plays, and stacks if you pick it again.') : null,
    ]);
    const cardsBox = el('div.mb-cards.mb-scroll');
    const foot = el('div.mb-lvl-foot');
    const render = () => {
      cardsBox.innerHTML = '';
      const offers = this.pickOffers(n);
      offers.forEach((m0, i) => {
        const boon = !!m0.boon, m = boon ? m0 : C.traitForm(m0, p.stage);
        const lv = boon ? (this.boons[m.id] | 0) : (p.muts[m.id] | 0);
        const rc = D.RARITY[m.rarity];
        const pips = boon ? (lv ? el('div.mb-ceff', { style: { opacity: 0.7 } }, `Taken ${lv}\u00d7`) : null) : el('div.mb-clv', {}, Array.from({ length: m.maxLevel }, (_, k) => el('i', { class: k < lv ? 'on' : k === lv ? 'new' : '' })));
        const isNew = !boon && !(this.codex.mutations && this.codex.mutations[m.id]) && !this.disc.mutations.includes(m.id);
        const [fw, why] = !boon && this.camp ? C.traitFit(m.id, this.L) : [1];
        const card = el('button.mb-card', { style: { '--rc': rc.color, animationDelay: i * 0.07 + 's' } }, [
          isNew ? el('span.mb-new', {}, 'NEW') : null,
          el('div.mb-port', {}, portrait('mutation', m.icon || m.id, 72, p.stage)),
          el('div.mb-cbody', {}, [
            el('div.mb-cname', {}, [m.name, el('span.tag', { style: { color: rc.color, background: rc.color + '22' } }, rc.label)]),
            el('div.mb-cdesc', {}, m.desc),
            el('div.mb-ceff', {}, boon ? m.eff : lv ? `${m.lv(lv)} → ${m.lv(lv + 1)}` : m.lv(1)),
            fw >= 1.4 && why ? el('div.mb-fit', {}, ['Useful here: ', why]) : null,
            pips,
          ]),
        ]);
        card.style.setProperty('--rc', rc.color);
        card.addEventListener('click', () => {
          if (ov.dataset.done) return;
          ov.dataset.done = '1';
          this.sfx('evolve'); this.buzz(20);
          [...cardsBox.children].forEach((c) => c.classList.add(c === card ? 'chosen' : 'gone'));
          if (boon) this.applyBoon(m.id); else this.applyMutation(m.id);
          this.later(260, () => { ov.classList.add('closing'); this.later(200, () => { ov.remove(); this.modal = null; this.levelOv = null; this.root.classList.remove('mb-picking'); if (this.pausedFromLevel) { this.pausedFromLevel = false; this.paused = false; this.pause(true); } else if (headstart && --this.headstartLeft > 0) this.offerHeadstart(); }); });
        });
        cardsBox.appendChild(card);
      });
      foot.innerHTML = '';
      if (this.rerolls > 0) foot.appendChild(el('button.btn.btn-ghost', { onclick: () => { if (ov.dataset.done) return; this.rerolls--; this.sfx('click'); render(); } }, [icon('refresh'), `Reroll (${this.rerolls})`]));
    };
    render();
    if (!cardsBox.children.length) { this.modal = null; this.levelOv = null; return; }
    ov.append(head, cardsBox, foot);
    this.root.appendChild(ov);
    this.levelOv = ov;
    this.root.classList.add('mb-picking');
  }
  removeMutation(id) {
    const p = this.p;
    delete p.muts[id];
    this.mutOrder = this.mutOrder.filter((x) => x !== id);
    if (id === 'fission') for (const e of this.ents) if (e.kind === 'clone') e.alive = false;
    if (ABILITY_BY_ID[id]) this.buildAbilities();
    this.recalc();
  }
  applyBoon(id) {
    const p = this.p;
    this.boons[id] = (this.boons[id] | 0) + 1;
    if (id === 'renew') { this.boonHp = (this.boonHp | 0) + 10; this.recalc(); p.hp = p.maxHp; }
    else if (id === 'cache') { this.bonusDNA = (this.bonusDNA | 0) + 4; }
    else if (id === 'vigor') { this.boonMult = (this.boonMult || 1) * 1.06; this.recalc(); }
    else if (id === 'insight' && this.evo) { this.evo.xp += C.evoNeed(this.evo.level) * 0.5; this.checkEvo(); }
    this.burst(p.x, p.y, [255, 230, 150], 16, 160);
  }
  offerHeadstart() { if (this.destroyed || this.dead) return; if (this.modal) { this.later(500, () => this.offerHeadstart()); return; } this.offerLevel(true); }
  // Open Ocean rematches always teach you something: a trait you have never had, else a level of one you have
  rematchReward() {
    const p = this.p, all = [...D.MUTATIONS, ...C.NEW_MUTATIONS.filter((m) => m.stage <= (p.stage | 0 || 1))];
    let pool = all.filter((m) => !p.muts[m.id] && !m.active);
    if (!pool.length) pool = all.filter((m) => (p.muts[m.id] | 0) < m.maxLevel);
    if (!pool.length) return;
    const m = this.rng.weighted(pool, (x) => 1 / D.RARITY[x.rarity].weight); // rarer traits are likelier here
    this.applyMutation(m.id);
    this.sfx('evolve'); this.flash = 0.4;
    this.toast('Rematch reward', `${p.muts[m.id] > 1 ? 'Stronger' : 'New trait'}: <b>${this.mutName(m.id)}</b>`, m.id, 'mutation', 'gold');
  }
  applyMutation(id) {
    const p = this.p;
    p.muts[id] = (p.muts[id] | 0) + 1;
    this.gained.push(id);
    if (!this.mutOrder.includes(id)) this.mutOrder.push(id);
    if (!(this.codex.mutations && this.codex.mutations[id]) && !this.disc.mutations.includes(id)) this.disc.mutations.push(id);
    this.recalc();
    if (id === 'membrane') this.heal(25);
    if (id === 'fission') this.spawnClone();
    if (ABILITY_BY_ID[id]) this.buildAbilities();
    this.burst(p.x, p.y, [140, 255, 220], 16, 160);
  }

  pause(show = true) {
    if (this.destroyed || this.dead || this.victory || this.modal === 'results') return;
    if (this.modal === 'pause') return;
    if (this.modal === 'level') { this.paused = true; this.pausedFromLevel = true; return; }
    this.paused = true; this.modal = 'pause'; this.releaseStick(); this.keys = {};
    if (!show) return;
    const ov = this.pauseOv = el('div.mb-overlay');
    const p = this.p;
    const muts = el('div.mb-mutlist', {}, this.mutOrder.map((id) => el('span.mb-mut', {}, [portrait('mutation', id, 26, p.stage), this.mutName(id), el('sup', {}, '' + p.muts[id])])));
    const body = el('div.mb-pause-body');
    const main = () => {
      body.innerHTML = '';
      body.append(
        el('h2', {}, 'Paused'),
        el('p.dim.small.center', { style: { margin: '4px 0 0' } }, this.camp ? `Level ${this.L.c} · ${this.L.title}` : `Depth ${this.depth} · ${this.D.name}`),
        el('div.mb-statgrid', {}, [
          el('div', {}, [el('b', {}, (this.camp ? '' : 'Lv ') + p.level), el('span', {}, this.camp ? 'Size' : 'Level')]),
          el('div', {}, [el('b', {}, fmt(this.stats.biomass)), el('span', {}, 'Biomass')]),
          el('div', {}, [el('b', {}, this.fmtTime(this.time)), el('span', {}, 'Time')]),
        ]),
        ...(this.camp && this.mutOrder.length ? [el('div.mb-sec', { style: { margin: '2px 0 6px' } }, `Traits · ${this.traitCount()} of ${this.traitTotal()}`)] : []),
        // the trait list scrolls on its own so Resume always stays on screen
        this.mutOrder.length ? el('div.mb-scroll.mb-pause-traits', {}, muts) : el('p.faint.small.center', {}, 'No mutations yet'),
        this.settingsRow(),
        el('div.stack-8.mb-pause-btns', {}, [
          el('button.btn.btn-primary.btn-lg.btn-block', { onclick: () => { this.sfx('click'); this.resume(); } }, [icon('play'), 'Resume']),
          el('button.btn.btn-ghost.btn-block', { onclick: () => { this.sfx('click'); confirmView(); } }, this.camp ? 'Leave level' : 'Abandon run'),
        ]),
      );
    };
    const confirmView = () => {
      body.innerHTML = '';
      body.append(
        el('h2', {}, this.camp ? 'Leave this level?' : 'Abandon run?'),
        el('p.dim.center', { style: { margin: '8px 0 16px' }, html: this.camp ? 'You keep every mutation and all evolution progress. You can try the level again any time.' : `You keep the <b class="dna-c">${this.calcDNA().total} DNA</b> earned so far.` }),
        el('div.stack-8', {}, [
          el('button.btn.btn-danger.btn-block', { onclick: () => { this.sfx('click'); this.abandon(); } }, this.camp ? 'Leave' : 'Abandon'),
          el('button.btn.btn-ghost.btn-block', { onclick: () => { this.sfx('click'); main(); } }, 'Keep swimming'),
        ]),
      );
    };
    main();
    ov.appendChild(el('div.dialog.mb-pause-panel', {}, body));
    this.root.appendChild(ov);
  }
  // sound, music and vibration toggles, right in the pause screen
  settingsRow() {
    const s = this.settings;
    const mk = (key, ic, label, apply) => {
      const b = el('button.mb-set', { class: s[key] !== false ? 'on' : '', 'aria-pressed': String(s[key] !== false), onclick: () => {
        s[key] = s[key] === false; b.classList.toggle('on', s[key]); b.setAttribute('aria-pressed', String(s[key]));
        apply(s[key]); if (s[key]) this.sfx('tick'); this.onSettings({ [key]: s[key] });
      } }, [icon(ic), el('span', {}, label)]);
      return b;
    };
    return el('div.mb-setrow', {}, [
      mk('sfx', 'sound', 'Sounds', (v) => audio.setSfx(v)),
      mk('music', 'music', 'Music', (v) => { audio.setMusic(v); if (v) audio.music('microbe'); }),
      mk('haptics', 'hand', 'Vibration', (v) => { window.__tw_haptics = v; if (v) this.buzz(20); }),
    ]);
  }
  resume() {
    if (this.destroyed) return;
    if (this.modal === 'pause') { this.modal = null; if (this.pauseOv) { const o = this.pauseOv; o.classList.add('closing'); this.later(200, () => o.remove()); this.pauseOv = null; } }
    if (this.modal === 'results') return;
    this.paused = false; this.pausedFromLevel = false;
    this.last = performance.now();
  }
  abandon() {
    this.abandoned = true;
    if (this.pauseOv) { this.pauseOv.remove(); this.pauseOv = null; }
    this.modal = null; this.paused = false;
    if (this.camp) { this.showCampaignResults(false); return; }
    this.showResults();
  }
  fmtTime(s) { s = floor(s); return floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  calcDNA() {
    const dn = D.computeDNA({
      biomass: this.stats.biomass, depthsCleared: this.victory ? 5 : this.depthsCleared, miniKills: this.stats.miniKills, finalKills: this.stats.finalKills,
      discMicrobes: this.disc.microbes.length, discMutations: this.disc.mutations.length, victory: this.victory, dnaMult: this.dnaMult, harvest: this.genome.harvest | 0,
    });
    if (this.bonusDNA) dn.total += this.bonusDNA;
    return dn;
  }
  result() {
    const dn = this.calcDNA();
    return {
      dna: dn.total, biomass: Math.round(this.stats.biomass), depth: this.depth, level: this.p.level, victory: this.victory,
      bossKills: this.stats.miniKills + this.stats.finalKills, kills: this.stats.kills, timeSec: Math.round(this.time),
      mutations: this.mutOrder.slice(), discovered: { microbes: this.disc.microbes.slice(), mutations: this.disc.mutations.slice() }, abandoned: this.abandoned,
      breakdown: dn,
    };
  }
  showResults() {
    if (this.modal === 'results' || this.destroyed) return;
    if (this.levelOv) { this.levelOv.remove(); this.levelOv = null; }
    if (this.pauseOv) { this.pauseOv.remove(); this.pauseOv = null; }
    this.modal = 'results'; this.clearHint();
    this.root.classList.add('mb-ended');
    const res = this.resultData = this.result();
    const dn = res.breakdown, p = this.p;
    const win = res.victory;
    const ov = el('div.mb-overlay.mb-res-ov');
    const rows = [
      ['Biomass', dn.biomass, `${fmt(res.biomass)} biomass`],
      ['Depth bonus', dn.depth, `${win ? 5 : this.depthsCleared} depth${this.depthsCleared === 1 ? '' : 's'} cleared`],
      ['Bosses', dn.bosses, `${res.bossKills} defeated`],
      ['Discoveries', dn.discoveries, `${res.discovered.microbes.length} species, ${res.discovered.mutations.length} genes`],
    ];
    if (dn.victory) rows.push(['Victory', dn.victory, 'Vent of Origins']);
    const rowEls = rows.map(([k, v, sub]) => el('div.mb-dnarow', {}, [el('span', {}, [k, el('span.faint.tiny', { style: { marginLeft: '6px' } }, sub)]), el('b', {}, '+' + v)]));
    if (dn.mult > 1.001) rowEls.push(el('div.mb-dnarow', {}, [el('span', {}, 'Multiplier'), el('b', {}, '×' + dn.mult.toFixed(2))]));
    const big = el('div.mb-big', {}, [icon('dna'), el('span', {}, '0')]);
    const btn = el('button.btn.btn-primary.btn-lg.btn-block', { onclick: () => { this.sfx('click'); this.exit(); } }, [icon('check'), this.o.returnLabel || 'Continue']);
    const discEls = res.discovered.microbes.length ? [el('div.mb-sec', {}, 'New species'), el('div.mb-disc', {}, res.discovered.microbes.map((id) => el('div', {}, [portrait('microbe', id, 52), D.SPECIES_BY_ID[id].name])))] : [];
    const panel = el('div.mb-results', {}, [
      el('div.mb-res-head', { class: win ? 'win' : 'lose' }, [
        el('div.mb-kicker', {}, win ? 'Victory' : res.abandoned ? 'Run abandoned' : this.lostLine()),
        el('h1', {}, win ? 'Vent of Origins' : res.abandoned ? 'Back to the surface' : `Depth ${res.depth}`),
        el('p.dim.small', {}, win ? 'You reached the source of all life.' : `Reached ${D.DEPTHS[res.depth - 1].name}`),
      ]),
      el('div.mb-statgrid', {}, [
        el('div', {}, [el('b', {}, this.fmtTime(res.timeSec)), el('span', {}, 'Time')]),
        el('div', {}, [el('b', {}, res.depth + '/5'), el('span', {}, 'Depth')]),
        el('div', {}, [el('b', {}, '' + res.level), el('span', {}, 'Level')]),
        el('div', {}, [el('b', {}, fmt(res.biomass)), el('span', {}, 'Biomass')]),
        el('div', {}, [el('b', {}, '' + res.kills), el('span', {}, 'Kills')]),
        el('div', {}, [el('b', {}, '' + res.bossKills), el('span', {}, 'Bosses')]),
      ]),
      el('div.panel.mb-dnabox', {}, [...rowEls, el('div.mb-dnatotal', {}, [el('span.dim', { style: { fontWeight: 800 } }, 'DNA earned'), big])]),
      this.mutOrder.length ? el('div.mb-sec', {}, 'Mutations') : null,
      this.mutOrder.length ? el('div.mb-mutlist', {}, this.mutOrder.map((id) => el('span.mb-mut', {}, [portrait('mutation', id, 26, p.stage), this.mutName(id), el('sup', {}, '' + p.muts[id])]))) : null,
      ...discEls,
      el('div.mb-res-foot', {}, btn),
    ]);
    ov.appendChild(panel);
    this.root.appendChild(ov);
    // count-up
    let i = 0; const total = dn.total, num = big.lastChild;
    const step = () => {
      if (this.destroyed) return;
      if (i < rowEls.length) { rowEls[i].classList.add('on'); this.sfx('coin', { vol: 0.6 }); i++; this.later(260, step); return; }
      const t0 = performance.now(), dur = 900;
      const tick = () => {
        if (this.destroyed) return;
        const k = min(1, (performance.now() - t0) / dur);
        num.textContent = String(Math.round(total * (1 - Math.pow(1 - k, 3))));
        if (k < 1) this.later(30, tick); else { big.classList.add('pop'); this.sfx(win ? 'victory' : 'coin'); }
      };
      tick();
    };
    this.later(350, step);
  }
  exit(choice = 'home', extra = {}) {
    if (this.exited) return;
    this.exited = true;
    const r = this.camp ? this.campaignResult() : (this.resultData || this.result());
    const out = { ...r, choice, evolveShown: !!this.evolvedTo, ...extra }; delete out.breakdown;
    try { this.onExit(out); } catch (e) { console.error(e); }
  }
  levelComplete() {
    if (this.dead || this.victory) return;
    this.victory = true; this.cleared = true;
    this.p.iframes = 99;
    this.sfx('victory'); this.buzz([30, 50, 30, 50, 80]);
    if (!this.L.isBoss) this.banner('Level complete', this.L.title, 'gold');
    const to = this.L.isBoss ? C.EVOLVE_AFTER[this.L.h] | 0 : 0;
    if (to > (this.p.stage | 0 || 1) && this.L.c < C.TOTAL_LEVELS) this.evolvedTo = to;
    this.startClearFx(); // golden spiral, then the metamorphosis if you evolve, then the results
  }
  campaignResult() {
    return {
      campaign: true, level: this.L.c, cleared: !!this.cleared, abandoned: this.abandoned,
      muts: { ...this.p.muts }, mutOrder: this.mutOrder.filter((id) => this.p.muts[id] > 0), evo: { ...this.evo }, gained: this.gained.slice(),
      biomass: Math.round(this.stats.biomass), kills: this.stats.kills, bossKills: this.stats.miniKills + this.stats.finalKills, timeSec: Math.round(this.time),
      discovered: { microbes: this.disc.microbes.slice(), mutations: this.disc.mutations.slice() }, boss: this.L.isBoss ? this.L.boss : null,
    };
  }
  showCampaignResults(cleared) {
    if (this.modal === 'results' || this.destroyed) return;
    if (this.levelOv) { this.levelOv.remove(); this.levelOv = null; }
    if (this.pauseOv) { this.pauseOv.remove(); this.pauseOv = null; }
    this.modal = 'results'; this.clearHint();
    this.root.classList.add('mb-ended');
    const L = this.L, p = this.p;
    const last = L.c === C.TOTAL_LEVELS;
    const evolveTo = cleared ? this.evolvedTo | 0 : 0;
    const ov = el('div.mb-overlay.mb-res-ov');
    const gained = [...new Set(this.gained)];
    const kicker = cleared ? (last ? 'Journey complete' : L.isBoss ? 'Boss defeated' : 'Level complete') : this.abandoned ? 'Left the level' : this.lostLine();
    const finale = last && C.LIVE_HABITATS === C.HABITATS.length - 1;
    const title = cleared && last ? (finale ? 'The biggest fish in the sea' : `You are a ${C.STAGES[C.LIVE_STAGE].name.toLowerCase()} now`) : L.title;
    const nextL = !last ? C.levelConfig(L.c + 1) : null;
    const sub = cleared ? (last ? (finale ? 'From a single cell to the biggest fish alive. And the ocean still has something bigger: a blue whale. Now the Open Ocean awaits.' : 'From a single cell to a creature of the open sea. Now the Open Ocean awaits.') : nextL.ocean ? (nextL.isBoss ? `Next: a rematch with the ${C.BOSSES[nextL.boss].name}` : `On to expedition ${nextL.ocean}`) : nextL.j === 1 ? `Next: ${nextL.name}` : `On to level ${L.c + 1}`) : 'You keep every mutation you earned. Try again!';
    const evoK = Math.round(100 * this.evo.xp / C.evoNeed(this.evo.level));
    const mainBtn = cleared
      ? (last ? null : el('button.btn.btn-primary.btn-lg.btn-block', { onclick: () => { this.sfx('click'); this.goNext(); } }, [icon('play'), nextL && nextL.ocean ? `Expedition ${nextL.ocean}` : `Level ${L.c + 1}`]))
      : el('button.btn.btn-primary.btn-lg.btn-block', { onclick: () => { this.sfx('click'); this.goRetry(); } }, [icon('refresh'), 'Try again']);
    const homeBtn = el('button.btn.btn-ghost.btn-block', { onclick: () => { this.sfx('click'); this.exit('home'); } }, [icon('globe'), 'Home']);
    const panel = el('div.mb-results', {}, [
      el('div.mb-res-head', { class: cleared ? 'win' : 'lose' }, [
        el('div.mb-kicker', {}, kicker),
        el('h1', {}, title),
        el('p.dim.small', {}, sub),
        !cleared && !this.abandoned && this.deathWhy ? el('div.mb-why', { html: icon('heart') + '<span></span>' }) : null,
      ]),
      evolveTo ? this.evolveBox(evolveTo) : null,
      el('div.mb-statgrid', {}, [
        el('div', {}, [el('b', {}, this.fmtTime(this.time)), el('span', {}, 'Time')]),
        el('div', {}, [el('b', {}, fmt(this.stats.biomass)), el('span', {}, 'Biomass')]),
        el('div', {}, [el('b', {}, '' + this.stats.kills), el('span', {}, 'Eaten')]),
      ]),
      el('div.panel.mb-dnabox', {}, [
        el('div.mb-dnarow.on', {}, [el('span', {}, ['Evolution ', el('b', {}, 'Lv ' + this.evo.level)]), el('span.dim.small', {}, `${this.traitCount()} of ${this.traitTotal()} traits`)]),
        el('div.bar.xp', { style: { marginTop: '8px' } }, el('i', { style: { width: evoK + '%' } })),
      ]),
      gained.length ? el('div.mb-sec', {}, 'New this attempt') : null,
      gained.length ? el('div.mb-mutlist', {}, gained.filter((id) => p.muts[id]).map((id) => el('span.mb-mut', {}, [portrait('mutation', id, 26, p.stage), this.mutName(id), el('sup', {}, '' + p.muts[id])]))) : null,
      el('div.mb-res-foot.stack-8', {}, [mainBtn, homeBtn]),
    ]);
    const why = panel.querySelector('.mb-why span'); if (why) why.textContent = this.deathWhy;
    ov.appendChild(panel);
    this.root.appendChild(ov);
  }

  // ---------- HUD ----------
  updateHUD() {
    const p = this.p, c = this.hudCache;
    const hurting = this.hurtT !== undefined && this.T - this.hurtT < 0.35 && !this.dead;
    if (c.hurting !== hurting || (hurting && c.why !== this.hurtWhy)) {
      c.hurting = hurting; c.why = this.hurtWhy;
      this.hpStat.classList.toggle('drain', hurting);
      if (hurting) { this.hurtEl.innerHTML = icon('heart') + '<span>' + this.hurtWhy + '</span>'; }
      this.hurtEl.classList.toggle('on', hurting);
    }
    const hp = max(0, Math.ceil(p.hp));
    if (c.hp !== hp || c.mhp !== p.maxHp) { c.hp = hp; c.mhp = p.maxHp; this.hpBar.style.width = (100 * hp / p.maxHp) + '%'; this.hpNum.textContent = hp; this.hpStat.classList.toggle('low', hp < p.maxHp * 0.3); }
    const lvN = this.camp ? this.evo.level : p.level;
    const xpk = this.camp ? Math.round(100 * this.evo.xp / C.evoNeed(this.evo.level)) : Math.round(100 * p.xp / D.xpToNext(p.level));
    if (c.xp !== xpk) { c.xp = xpk; this.xpBar.style.width = xpk + '%'; }
    if (c.lv !== lvN) { c.lv = lvN; this.lvEl.textContent = (this.camp ? 'Evo ' : 'Lv ') + lvN; }
    if (this.camp) {
      const key = this.traitCount() + '/' + this.traitTotal();
      if (c.dna !== key) { if (c.dna !== undefined) { this.dnaChip.classList.remove('pulse'); void this.dnaChip.offsetWidth; this.dnaChip.classList.add('pulse'); } c.dna = key; this.dnaNum.textContent = key; }
    } else {
      const dna = this.calcDNA().total;
      if (c.dna !== dna) { if (c.dna !== undefined) { this.dnaChip.classList.remove('pulse'); void this.dnaChip.offsetWidth; this.dnaChip.classList.add('pulse'); } c.dna = dna; this.dnaNum.textContent = dna; }
    }
    let label, k;
    if (this.boss && this.boss.alive) { label = `<b>${this.boss.B ? this.boss.B.name : 'Boss'}</b>${this.boss.phase > 1 ? ' · phase ' + this.boss.phase : ''}`; k = this.boss.hp / this.boss.maxHp; }
    else if (this.camp) { label = this.L.ocean ? `Ocean <b>${this.L.ocean}</b> · ${this.L.isBoss ? 'rematch' : this.L.name.replace('Open Ocean · ', '')}` : `Level <b>${this.L.c}</b> · ${this.L.isBoss ? this.L.name + ' · boss' : this.L.title}`; k = min(1, this.depthTime / this.D.dur); }
    else { label = `Depth <b>${this.depth}</b> · ${this.D.name}`; k = min(1, this.depthTime / this.D.dur); }
    if (c.label !== label) { c.label = label; this.depthLabel.innerHTML = label; }
    const kk = Math.round(k * 200) / 2;
    if (c.k !== kk) { c.k = kk; this.depthBar.style.width = kk + '%'; }
  }

  // ---------- render ----------
  render(dt) {
    const ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr, p = this.p, T = this.T;
    // camera
    const tz = clamp(min(W, H) * 0.06 / (p.r0 || p.r), 0.32, 1.45) * (this.boss ? 0.8 : 1);
    this.zoomV = this.zoomV ? lerp(this.zoomV, tz, 1 - exp(-dt * 1.5)) : tz;
    const z = this.zoomV * this.cineZoom(); // cinematic push-ins sit on top of the gameplay zoom
    this.camX = this.camX === undefined ? p.x : lerp(this.camX, p.x + p.vx * 0.15, 1 - exp(-dt * 5));
    this.camY = this.camY === undefined ? p.y : lerp(this.camY, p.y + p.vy * 0.15, 1 - exp(-dt * 5));
    let cx = this.camX, cy = this.camY;
    if (this.shake > 0) { cx += (random() - 0.5) * this.shake / z; cy += (random() - 0.5) * this.shake / z; }
    const pal = this.palCur;
    // background
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const bk = pal.bg.join(',');
    if (!this.bgGrad || this.bgKey !== bk) {
      this.bgKey = bk;
      const g = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.5, hypot(W, H) * 0.65);
      g.addColorStop(0, rgbStr(pal.bg)); g.addColorStop(1, rgbStr(pal.edge));
      this.bgGrad = g;
    }
    ctx.fillStyle = this.bgGrad; ctx.fillRect(0, 0, W, H);
    // caustics (two parallax layers)
    ctx.globalCompositeOperation = 'lighter';
    const sun = this.D.sun;
    const tier = this.camp ? this.L.tier || 1 : 1, look = LOOK[tier] || LOOK[1];
    const cAlpha = (0.05 + 0.1 * sun) * look.caustic;
    const tile = this.tint(this.caustic, pal.caustic.map((v) => Math.round(v / 16) * 16));
    for (let L = 0; L < 2; L++) {
      const sc = (L ? 1.7 : 1.15) * (0.7 + 0.3 * z), ts = 256 * sc;
      const ox = (-(cx * z) * (L ? 0.35 : 0.2) + T * (L ? 9 : -6)) % ts, oy = (-(cy * z) * (L ? 0.35 : 0.2) + T * (L ? 5 : 7)) % ts;
      ctx.globalAlpha = cAlpha * (L ? 0.7 : 1);
      for (let x = (ox > 0 ? ox - ts : ox); x < W; x += ts) for (let y = (oy > 0 ? oy - ts : oy); y < H; y += ts) ctx.drawImage(tile, x, y, ts, ts);
    }
    // light shafts
    if (sun > 0.05) {
      const sh = this.tint(this.shaft, pal.shaft.map((v) => Math.round(v / 16) * 16));
      for (let i = 0; i < 4; i++) {
        const x = ((i * 0.31 + 0.1) * W + sin(T * 0.13 + i * 2) * 40 - cx * z * 0.08) % (W * 1.3);
        ctx.globalAlpha = sun * (0.07 + 0.04 * sin(T * 0.4 + i));
        ctx.save(); ctx.translate(x < -W * 0.15 ? x + W * 1.3 : x, -20); ctx.rotate(0.22); ctx.drawImage(sh, -60 - i * 15, 0, 120 + i * 30, H * 1.2); ctx.restore();
      }
    }
    // distant silhouettes of big animals (reef and open sea scales)
    if (look.silhouettes) this.drawSilhouettes(ctx, W, H, cx, cy, z, look.silhouettes, pal);
    // plankton, or marine snow drifting down at bigger scales (screen space parallax)
    const pg = glowSprite(look.snow > 0.5 ? [235, 240, 245] : pal.plankton);
    const fall = look.snow * 14;
    for (const q of this.plankton) {
      const px = ((q.x * (W + 80) - cx * z * q.z + T * 4 * q.z) % (W + 80) + (W + 80)) % (W + 80) - 40;
      const py = ((q.y * (H + 80) - cy * z * q.z + sin(T * 0.5 + q.ph) * 6 + T * fall * q.z) % (H + 80) + (H + 80)) % (H + 80) - 40;
      const s = q.s * (2 + 6 * q.z) * (look.snow > 0.5 ? 0.6 : 1);
      ctx.globalAlpha = (0.18 + 0.3 * q.z) * (look.snow > 0.5 ? 0.7 : 1);
      ctx.drawImage(pg, px - s, py - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    // world transform
    const wx = (x) => (x - cx) * z + W / 2, wy = (y) => (y - cy) * z + H / 2;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cx * z), dpr * (H / 2 - cy * z));
    const vx0 = cx - W / 2 / z - 60, vx1 = cx + W / 2 / z + 60, vy0 = cy - H / 2 / z - 60, vy1 = cy + H / 2 / z + 60;
    const inView = (x, y, r) => x + r > vx0 && x - r < vx1 && y + r > vy0 && y - r < vy1;
    this.drawHazards(ctx, inView, z);
    this.kitDraw('under', ctx, z, inView);
    // toxin clouds & rings
    ctx.globalCompositeOperation = 'lighter';
    const tg = glowSprite([150, 230, 90]);
    for (const c of this.clouds) { const k = c.life / c.max; ctx.globalAlpha = 0.45 * min(1, k * 2); const rr = c.r * (1.2 + (1 - k) * 0.4); ctx.drawImage(tg, c.x - rr, c.y - rr, rr * 2, rr * 2); ctx.globalAlpha *= 0.6; ctx.drawImage(tg, c.x - rr * 0.6 + sin(T * 3) * 6, c.y - rr * 0.6, rr * 1.2, rr * 1.2); }
    // motes
    const mg = glowSprite(pal.mote, 1);
    for (const m of this.motes) {
      if (!inView(m.x, m.y, 20)) continue;
      const s = (5 + 2.2 * sin(T * 3 + m.ph)) * m.s;
      ctx.globalAlpha = m.a * 0.9;
      ctx.drawImage(mg, m.x - s, m.y - s, s * 2, s * 2);
    }
    // entity glows
    ctx.globalAlpha = 1;
    for (const e of this.ents) {
      if (e.noDraw || !inView(e.x, e.y, e.r * 2)) continue;
      const col = e.edibleCache ? [120, 255, 200] : (HOSTILE[e.kind] || e.boss) ? [255, 90, 100] : this.colorOf(e);
      const gs = e.r * (e.boss ? 2.2 : 2.6);
      ctx.globalAlpha = e.boss ? 0.35 : isTiny(e) ? 0 : SP[e.kind] && SP[e.kind].camo ? (e.vis ?? 0.14) * 0.3 : 0.2 + 0.25 * e.flash;
      if (ctx.globalAlpha > 0) ctx.drawImage(glowSprite(col), e.x - gs, e.y - gs, gs * 2, gs * 2);
    }
    ctx.globalAlpha = 0.4 + 0.3 * (p.muts.biolum ? 1 : 0);
    const pgs = p.r * (3 + (p.muts.biolum | 0) * 0.5);
    ctx.drawImage(glowSprite([110, 255, 225]), p.x - pgs, p.y - pgs, pgs * 2, pgs * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // entities
    const sc = dpr * z;
    for (const e of this.ents) {
      if (e.noDraw || !inView(e.x, e.y, e.r * (e.segs ? 9 : 2.5))) continue;
      if (e.kind === 'siphonophore') { this.drawSiph(ctx, e, sc); continue; }
      ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.boss && (e.kind === 'colossus' || e.kind === 'volvox') ? 0 : e.ang);
      ctx.scale(e.r, e.r);
      if (e.spawnFade < 1) { e.spawnFade = min(1, e.spawnFade + dt * 3); ctx.globalAlpha = e.spawnFade; }
      if (SP[e.kind] && SP[e.kind].camo && !(CREATURE_ART[e.kind] && CREATURE_ART[e.kind].ownVis)) ctx.globalAlpha *= e.vis ?? 0.14; // camouflage (some art fades itself)
      if (e.kind === 'clone' && (p.stage | 0) >= 3) drawKin(ctx, e, p.stage | 0, p.muts, T, e.r * sc); // your young, not a cell
      else drawSpecies(ctx, e, T, e.r * sc, { queenPhase: false });
      if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = e.flash * 0.6; ctx.drawImage(glowSprite(WHITE), -1.2, -1.2, 2.4, 2.4); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore();
      ctx.globalAlpha = 1;
      // health bar for anything you have hurt recently
      if (e.hpShowT > 0 && !e.boss && e.maxHp > 0 && e.maxHp < 9000) {
        const k = max(0, e.hp / e.maxHp), bw = max(26 / z, e.r * 1.5), bh = 5 / z, bx = e.x - bw / 2, by = e.y - e.r - 10 / z;
        ctx.globalAlpha = min(1, e.hpShowT * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(bx - 1 / z, by - 1 / z, bw + 2 / z, bh + 2 / z);
        ctx.fillStyle = k > 0.5 ? '#7cf0a3' : k > 0.25 ? '#ffc65c' : '#ff6b7d'; ctx.fillRect(bx, by, bw * k, bh);
        ctx.globalAlpha = 1;
      }
      if (e.edibleCache && e.r > p.r * 0.45 && hypot(e.x - p.x, e.y - p.y) < 260) {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 4 / z + sin(T * 5) * 1.5 / z, 0, TAU);
        ctx.strokeStyle = 'rgba(140,255,200,0.4)'; ctx.lineWidth = 1.5 / z; ctx.stroke();
      }
    }
    this.drawThreatFx(ctx, z, inView);
    this.drawClouds(ctx, z, inView);
    if (this.boss && this.boss.alive) { if (this.boss.kit) this.kitDraw('over', ctx, z, inView); else this.drawBossSpots(ctx, z); }
    // shards
    for (const s of this.shards) {
      if (!inView(s.x, s.y, 10)) continue;
      if (s.bubble) {
        const br = 7 + 3 * sin(T * 30 + s.a);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6;
        ctx.drawImage(glowSprite([200, 240, 255]), s.x - br * 2.2, s.y - br * 2.2, br * 4.4, br * 4.4);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(s.x, s.y, br, 0, TAU); ctx.strokeStyle = 'rgba(235,250,255,0.9)'; ctx.lineWidth = 2 / z; ctx.stroke();
        continue;
      }
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a + T * 6);
      ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, 5); ctx.lineTo(-5, -5); ctx.closePath();
      ctx.fillStyle = s.c ? rgbStr(s.c, 0.95) : this.boss && this.boss.phase >= 2 ? 'rgba(255,170,210,0.95)' : 'rgba(200,215,255,0.95)'; ctx.fill();
      ctx.restore();
    }
    this.drawActives(ctx, z);
    // player
    this.cineBack(ctx);
    const pv = this.cinePlayer();
    if (pv && !(this.hidePlayer && this.boss && this.boss.alive)) {
      const pr = (p.r0 || p.r) * (1 + 0.45 * (p.breachK || 0)); // the art draws the inflated balloon itself (p.puffK); a breach lifts you up
      if (p.breachK > 0) { ctx.save(); ctx.translate(p.x + p.breachK * pr * 0.5, p.y + p.breachK * pr * 0.9); ctx.rotate(p.ang); ctx.scale(pr * 1.2, pr * 0.8); ctx.globalAlpha = 0.35 * p.breachK; ctx.drawImage(glowSprite([0, 10, 25]), -1.3, -1.3, 2.6, 2.6); ctx.restore(); ctx.globalAlpha = 1; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(pr * pv.s, pr * pv.s);
      if (p.iframes > 0 && p.cyst <= 0 && !this.trans && !this.intro && !this.victory && floor(T * 20) % 2 === 0) ctx.globalAlpha = 0.55;
      if (p.muts.mimicry) ctx.globalAlpha *= 1 - 0.12 * p.muts.mimicry;
      ctx.globalAlpha *= pv.a;
      drawPlayer(ctx, p, T, pr * sc * pv.s);
      if (p.flashT > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = p.flashT * 2.5; ctx.drawImage(glowSprite([255, 80, 100]), -1.3, -1.3, 2.6, 2.6); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // symbionts
    if (p.muts.symbionts && this.symb) {
      for (let i = 0; i < p.muts.symbionts; i++) {
        const s = this.symb[i]; if (!s) continue;
        const fishy = (p.stage | 0) >= 4, hl = fishy ? max(5.5, p.r * 0.26) : 6, gr = fishy ? hl * 1.6 : 14;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fishy ? 0.3 : 0.6;
        ctx.drawImage(glowSprite([255, 230, 140]), s[0] - gr, s[1] - gr, gr * 2, gr * 2);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(T * 2.2 + (i / p.muts.symbionts) * TAU + PI / 2); ctx.scale(hl, hl);
        // on a fish the symbionts are pilot fish escorting you; before that, friendly bacteria
        if (fishy) drawPilotFish(ctx, T, hl * sc, i); else drawSpecies(ctx, { kind: 'drifter', seed: i, t: 0, ang: 0 }, T, 6 * sc);
        ctx.restore();
      }
    }
    this.cineFront(ctx, z);
    // particles
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.parts) {
      if (!inView(q.x, q.y, 10)) continue;
      const k = q.life / q.max, s = q.s * (0.5 + k * 0.7);
      ctx.globalAlpha = k;
      ctx.drawImage(glowSprite(q.c, 1), q.x - s, q.y - s, s * 2, s * 2);
    }
    if (this.rings) for (const r of this.rings) {
      ctx.globalAlpha = min(1, r.life / (r.max || 0.6)); ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.strokeStyle = rgbStr(r.c); ctx.lineWidth = 6 / z + r.life * 20; ctx.stroke();
      if (r.bolt != null) {
        // electric shock: jagged bolts crackling out to the ring, redrawn a few times a second
        const fl = floor(T * 24); ctx.beginPath();
        for (let b = 0; b < 9; b++) {
          let a = b * 0.698 + r.bolt * 3, d = r.r * 0.12; ctx.moveTo(r.x + cos(a) * d, r.y + sin(a) * d);
          for (let j = 1; j <= 5; j++) { const h = sin(fl * 12.9898 + b * 78.233 + j * 37.719) * 43758.5453; a += ((h - floor(h)) - 0.5) * 0.5; d = r.r * (0.12 + 0.176 * j); ctx.lineTo(r.x + cos(a) * d, r.y + sin(a) * d); }
        }
        ctx.strokeStyle = 'rgba(235,230,255,0.9)'; ctx.lineWidth = 2.5 / z; ctx.lineJoin = 'round'; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // screen space overlays
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // floating text
    if (!this.fontFam) this.fontFam = getComputedStyle(this.root).fontFamily || 'system-ui, sans-serif';
    ctx.font = '800 14px ' + this.fontFam;
    ctx.textAlign = 'center';
    for (const t of this.texts) {
      ctx.globalAlpha = min(1, t.life * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillText(t.s, wx(t.x) + 1, wy(t.y) + 1);
      ctx.fillStyle = t.c; ctx.fillText(t.s, wx(t.x), wy(t.y));
    }
    if (this.combo >= 4 && !this.dead) {
      ctx.globalAlpha = min(1, this.comboT * 2);
      ctx.font = '900 ' + (13 + min(10, this.combo) * 0.8) + 'px ' + this.fontFam;
      ctx.fillStyle = '#ffe7a8'; ctx.fillText('×' + this.combo, wx(p.x), wy(p.y - p.r) - 14);
    }
    ctx.globalAlpha = 1;
    this.drawIndicators(ctx, wx, wy, z);
    // vignette
    if (!this.vig) {
      const g = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.35, W / 2, H / 2, hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,4,10,0.6)');
      this.vig = g;
    }
    ctx.fillStyle = this.vig; ctx.fillRect(0, 0, W, H);
    // damage flash: the screen edge pulses red whenever anything hurts you
    if (this.dmgPulse > 0.01 && !this.dead) {
      if (!this.dmgVig) { const g = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.32, W / 2, H / 2, hypot(W, H) * 0.58); g.addColorStop(0, 'rgba(255,20,50,0)'); g.addColorStop(0.7, 'rgba(255,30,60,0.35)'); g.addColorStop(1, 'rgba(255,40,70,0.85)'); this.dmgVig = g; }
      ctx.globalAlpha = min(1, this.dmgPulse) * 0.85;
      ctx.fillStyle = this.dmgVig; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    // low hp red vignette
    const hpk = p.hp / p.maxHp;
    if (hpk < 0.35 && !this.dead) {
      ctx.globalAlpha = (0.35 - hpk) * 2 * (0.6 + 0.4 * sin(T * 6));
      if (!this.redVig) { const g = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.3, W / 2, H / 2, hypot(W, H) * 0.6); g.addColorStop(0, 'rgba(255,0,40,0)'); g.addColorStop(1, 'rgba(255,30,60,0.55)'); this.redVig = g; }
      ctx.fillStyle = this.redVig; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    if (this.L && this.L.dark) this.drawDark(ctx, W, H, wx, wy, z);
    this.drawSense(ctx, W, H, wx, wy, z);
    this.kitScreen(ctx, W, H);
    this.cineScreen(ctx, W, H);
    // joystick
    const I = this.input;
    if (I.active && !this.modal && !this.cineLock() && !this.dead) {
      ctx.beginPath(); ctx.arc(I.ox, I.oy, 62, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
      const kx = I.ox + I.jx * I.mag * 57, ky = I.oy + I.jy * I.mag * 57;
      ctx.beginPath(); ctx.arc(kx, ky, 22, 0, TAU); ctx.fillStyle = 'rgba(220,255,250,0.22)'; ctx.fill();
      ctx.strokeStyle = 'rgba(220,255,250,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    this.flashEl.style.opacity = String(this.flash * 0.35);
    this.updateHUD();
  }
  drawHazards(ctx, inView, z) {
    const T = this.T;
    for (const h of this.hazards) {
      if (h.type === 'uv') {
        if (!inView(h.x, h.y, 1400)) continue;
        ctx.globalCompositeOperation = 'lighter';
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(-0.245);
        const sh = this.tint(this.shaft, [200, 170, 255]);
        ctx.globalAlpha = 0.28 + 0.06 * sin(T * 2 + h.t);
        ctx.drawImage(sh, -h.r * 0.75, -1400, h.r * 1.5, 2800);
        ctx.globalAlpha = 0.18; ctx.drawImage(sh, -h.r * 0.35, -1400, h.r * 0.7, 2800);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      } else if (h.type === 'toxic') {
        if (!inView(h.x, h.y, h.r * 1.3)) continue;
        ctx.globalCompositeOperation = 'lighter';
        const g = glowSprite([130, 210, 70]);
        for (let i = 0; i < 5; i++) {
          const a = i * 1.26 + h.t * 0.15, d = h.r * 0.35 * (i ? 1 : 0), rr = h.r * (i ? 0.75 : 1.15);
          ctx.globalAlpha = 0.16 + 0.04 * sin(T + i);
          ctx.drawImage(g, h.x + cos(a) * d - rr, h.y + sin(a) * d - rr, rr * 2, rr * 2);
        }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        // bubbles of toxin
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = i * 0.8 + h.t * 0.3, d = h.r * (0.2 + 0.5 * ((i * 0.37) % 1)); const x = h.x + cos(a) * d, y = h.y + sin(a) * d - ((h.t * 12 + i * 20) % 40); ctx.moveTo(x + 3, y); ctx.arc(x, y, 3, 0, TAU); }
        ctx.strokeStyle = 'rgba(190,255,120,0.35)'; ctx.lineWidth = 1.2 / z; ctx.stroke();
      } else if (h.type === 'vent') {
        if (!inView(h.x, h.y, h.r * 1.5)) continue;
        const core = h.r * 0.42;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5 + 0.15 * sin(T * 3 + h.t);
        ctx.drawImage(glowSprite([255, 90, 50]), h.x - h.r * 1.4, h.y - h.r * 1.4, h.r * 2.8, h.r * 2.8);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        // rocky chimney
        ctx.beginPath();
        for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU; const r = core * (0.85 + 0.15 * sin(i * 2.7 + h.x)); i ? ctx.lineTo(h.x + cos(a) * r, h.y + sin(a) * r) : ctx.moveTo(h.x + cos(a) * r, h.y + sin(a) * r); }
        ctx.fillStyle = 'rgba(30,10,14,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,120,80,0.6)'; ctx.lineWidth = 3 / z; ctx.stroke();
        ctx.beginPath(); ctx.arc(h.x, h.y, core * 0.45, 0, TAU);
        ctx.fillStyle = `rgba(255,${120 + 40 * sin(T * 4) | 0},60,0.9)`; ctx.fill();
        // rising heat bubbles
        ctx.globalCompositeOperation = 'lighter';
        const bg = glowSprite([255, 140, 80], 1);
        for (let i = 0; i < 8; i++) { const ph = ((T * 0.5 + i / 8) % 1); const x = h.x + sin(i * 3.1 + T) * core * 0.5, y = h.y - ph * h.r * 1.2; ctx.globalAlpha = 1 - ph; const s = 6 + i % 3 * 3; ctx.drawImage(bg, x - s, y - s, s * 2, s * 2); }
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      } else if (h.type === 'current') {
        if (!inView(h.x, h.y, h.r)) continue;
        ctx.beginPath();
        for (let i = 0; i < 14; i++) {
          const u = ((T * 0.35 + i * 0.137) % 1), off = ((i * 0.618) % 1 - 0.5) * h.r * 1.4;
          const px = -h.dy, py = h.dx;
          const along = (u - 0.5) * h.r * 1.6;
          const x = h.x + h.dx * along + px * off, y = h.y + h.dy * along + py * off;
          ctx.moveTo(x, y); ctx.lineTo(x + h.dx * 40, y + h.dy * 40);
        }
        ctx.strokeStyle = rgbStr(this.palCur.accent, 0.22); ctx.lineWidth = 2 / z; ctx.lineCap = 'round'; ctx.stroke();
      } else this.drawNewHazard(ctx, h, z, inView);
    }
  }
  drawSilhouettes(ctx, W, H, cx, cy, z, k, pal) {
    // a few large, dark shapes cruising far away: schools at reef scale, big fish and whales out at sea
    const T = this.T, big = this.L && this.L.tier >= 5;
    const col = pal.edge.map((v) => v * 0.6);
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgbStr(col, 0.32 * k);
    for (let i = 0; i < (big ? 3 : 4); i++) {
      const sp = 0.6 + i * 0.25, dir = i % 2 ? 1 : -1;
      const x = ((((i * 0.37 + 0.1) * (W + 600) + dir * T * 14 * sp - cx * z * 0.05) % (W + 600)) + (W + 600)) % (W + 600) - 300;
      const y = (0.15 + ((i * 0.29) % 0.7)) * H + sin(T * 0.2 + i) * 20 - cy * z * 0.04 % H;
      const L = (big ? 160 + i * 60 : 50 + i * 12) * (0.8 + 0.4 * sp);
      if (big || i % 2) {
        // one big fish shape
        ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
        ctx.beginPath(); ctx.ellipse(0, 0, L * 0.5, L * 0.16, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-L * 0.45, 0); ctx.lineTo(-L * 0.68, -L * 0.14 + sin(T * 3 + i) * L * 0.03); ctx.lineTo(-L * 0.64, 0); ctx.lineTo(-L * 0.68, L * 0.14 + sin(T * 3 + i) * L * 0.03); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else {
        // a school of little fish
        for (let j = 0; j < 9; j++) {
          const fx = x + ((j * 37) % 80) - 40 + sin(T * 1.3 + j) * 6, fy = y + ((j * 23) % 50) - 25;
          ctx.save(); ctx.translate(fx, fy); ctx.scale(dir, 1);
          ctx.beginPath(); ctx.ellipse(0, 0, 9, 3, 0, 0, TAU); ctx.moveTo(-8, 0); ctx.lineTo(-13, -3); ctx.lineTo(-13, 3); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }
  drawClouds(ctx, z, inView) {
    // squid ink (darkens) and seed-shrimp alarm glows (light)
    if (this.inks) for (const k of this.inks) {
      if (!inView(k.x, k.y, k.r * 1.5)) continue;
      const a = min(1, k.life / 1.2) * 0.75;
      ctx.fillStyle = `rgba(10,6,22,${a})`;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const ang = i * 1.05 + k.seed, d = k.r * 0.45, rr = k.r * (0.55 + 0.15 * sin(this.T * 0.7 + i + k.seed)); ctx.moveTo(k.x + cos(ang) * d + rr, k.y + sin(ang) * d); ctx.arc(k.x + cos(ang) * d, k.y + sin(ang) * d, rr, 0, TAU); }
      ctx.fill();
    }
    if (this.glows) {
      ctx.globalCompositeOperation = 'lighter';
      for (const g of this.glows) {
        if (!inView(g.x, g.y, g.r)) continue;
        ctx.globalAlpha = min(1, g.life / g.max * 1.4) * 0.8;
        const r = g.r * (1.2 - 0.2 * g.life / g.max);
        ctx.drawImage(glowSprite([90, 170, 255]), g.x - r, g.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }
  drawDark(ctx, W, H, wx, wy, z) {
    // the deep is pitch dark: you only see around your own glow, and around living lights
    const p = this.p, T = this.T;
    const light = (110 + 45 * (p.muts.biolum | 0) + 40 * (p.muts.warmeyes | 0)) + (p.r0 || p.r) * z * 2.2; // warm eyes see further
    const px = wx(p.x), py = wy(p.y);
    const g = ctx.createRadialGradient(px, py, light * 0.35, px, py, light * 1.6);
    g.addColorStop(0, 'rgba(0,2,8,0)'); g.addColorStop(0.55, 'rgba(0,2,8,0.7)'); g.addColorStop(1, 'rgba(0,2,8,0.93)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // living lights shine through the dark
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.ents) {
      if (!e.alive) continue;
      const k = e.kind; let lx = e.x, ly = e.y, rad = 0, col = null, a = 0.5;
      if (k === 'angler' && e.lureDark) { rad = e.r * 2.2; col = [110, 170, 255]; a = 0.45; }
      else if (k === 'angler') {
        const lp = CREATURE_ART.angler && CREATURE_ART.angler.lurePos ? CREATURE_ART.angler.lurePos(e, T) : { x: 1.3, y: -1.1 };
        const ca = cos(e.ang), sa = sin(e.ang);
        lx = e.x + (lp.x * ca - lp.y * sa) * e.r; ly = e.y + (lp.x * sa + lp.y * ca) * e.r; rad = e.r * 1.3; col = [150, 230, 255]; a = 0.55 + 0.4 * (e.lureK || 0.6);
      } else if (k === 'krill' || k === 'cookiecutter') { rad = e.r * 2.2; col = [110, 200, 255]; a = 0.35; }
      else if (k === 'jellyfish' || k === 'combjelly' || k === 'siphonophore' || k === 'manowar' || k === 'nomura') { rad = e.r * 2.4; col = [200, 140, 255]; a = 0.25; }
      else if (k === 'pyrosome' || k === 'krillcloud') { rad = e.r * 2.2; col = [120, 220, 255]; a = 0.4; }
      else if (e.boss && !(e.kit && e.kit.lights)) { rad = e.r * 1.4; col = [140, 200, 255]; a = 0.25; }
      if (!rad) continue;
      const sx = wx(lx), sy = wy(ly), sr = rad * z;
      if (sx < -sr || sy < -sr || sx > W + sr || sy > H + sr) continue;
      ctx.globalAlpha = a; ctx.drawImage(glowSprite(col), sx - sr, sy - sr, sr * 2, sr * 2);
    }
    // a boss may carry its own lights (a swordfish's warm eyes and glowing wake)
    const B = this.boss;
    if (B && B.alive && B.kit && B.kit.lights) for (const l of B.kit.lights(this, B, B.k)) {
      const sx = wx(l.x), sy = wy(l.y), sr = l.r * z;
      if (sx < -sr || sy < -sr || sx > W + sr || sy > H + sr) continue;
      ctx.globalAlpha = l.a; ctx.drawImage(glowSprite(l.col), sx - sr, sy - sr, sr * 2, sr * 2);
    }
    // seed-shrimp alarms and your own photophore flash light up the dark
    if (this.glows) for (const g of this.glows) {
      const k = g.life / g.max, sr = g.r * (g.flash ? 1.6 : 1.1) * z, sx = wx(g.x), sy = wy(g.y);
      ctx.globalAlpha = min(1, k * 1.5) * (g.flash ? 0.9 : 0.6); ctx.drawImage(glowSprite([140, 200, 255]), sx - sr, sy - sr, sr * 2, sr * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  drawSiph(ctx, e, sc) {
    const T = this.T, pts = [e, ...e.segs];
    ctx.lineCap = 'round';
    // tentacles
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const s = pts[i];
      const ta = e.ang + PI;
      ctx.moveTo(s.x, s.y);
      for (let k = 1; k <= 6; k++) {
        const u = k / 2;
        const x = s.x + cos(ta + sin(T * 1.5 + i + u) * 0.5 / u) * e.r * 1.5 * u + cos(ta + PI / 2) * sin(T * 2 + u + i) * e.r * 0.5;
        const y = s.y + sin(ta + sin(T * 1.5 + i + u) * 0.5 / u) * e.r * 1.5 * u + sin(ta + PI / 2) * sin(T * 2 + u + i) * e.r * 0.5;
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = 'rgba(255,150,230,0.45)'; ctx.lineWidth = 1.6 / this.zoomV; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < pts.length; i++) { const s = pts[i]; ctx.globalAlpha = 0.25; ctx.drawImage(glowSprite([255, 110, 220]), s.x - e.r * 2, s.y - e.r * 2, e.r * 4, e.r * 4); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (let i = pts.length - 1; i >= 0; i--) {
      const s = pts[i]; const nx = i ? pts[i - 1].x - s.x : cos(e.ang), ny = i ? pts[i - 1].y - s.y : sin(e.ang);
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(atan2(ny, nx)); const pulse = 1 + 0.08 * sin(T * 4 - i); ctx.scale(e.r * pulse, e.r);
      drawSpecies(ctx, { kind: 'siphonbell', seed: i, ang: 0 }, T, e.r * sc);
      if (e.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = e.flash * 0.6; ctx.drawImage(glowSprite(WHITE), -1.2, -1.2, 2.4, 2.4); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      ctx.restore();
    }
  }
  drawBossSpots(ctx, z) {
    const b = this.boss, T = this.T;
    ctx.globalCompositeOperation = 'lighter';
    for (const s of b.spots) {
      if (s.wx === undefined) continue;
      const ready = s.cd <= 0;
      const pulse = 0.75 + 0.25 * sin(s.pulse);
      const rr = s.wr * (ready ? 1.9 * pulse : 1.1);
      ctx.globalAlpha = ready ? 0.95 : 0.3;
      ctx.drawImage(glowSprite([255, 236, 120], 1), s.wx - rr, s.wy - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    for (const s of b.spots) {
      if (s.wx === undefined || s.cd > 0) continue;
      ctx.beginPath(); ctx.arc(s.wx, s.wy, s.wr * (1 + 0.15 * sin(s.pulse)), 0, TAU);
      ctx.strokeStyle = 'rgba(255,250,210,0.9)'; ctx.lineWidth = 2 / z; ctx.stroke();
    }
    // telegraphs
    if (b.logic === 'queen' && b.state === 'chargeT') {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + cos(b.ca) * 900, b.y + sin(b.ca) * 900);
      ctx.strokeStyle = `rgba(255,90,110,${0.25 + 0.25 * sin(T * 20)})`; ctx.lineWidth = b.r * 0.9; ctx.lineCap = 'round'; ctx.stroke();
    }
    if (b.logic === 'queen' && b.state === 'burstT') {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.2 + (0.9 - b.st) * 0.5), 0, TAU);
      ctx.strokeStyle = `rgba(255,200,220,${0.5 + 0.3 * sin(T * 25)})`; ctx.lineWidth = 4 / z; ctx.stroke();
    }
  }
  drawIndicators(ctx, wx, wy, z) {
    const W = this.W, H = this.H, p = this.p, top = 96, pad = 22;
    let n = 0;
    for (const e of this.ents) {
      if (n > 6) break;
      const S = SP[e.kind];
      const threat = e.boss || (HOSTILE[e.kind] && S && !S.latch && S.ai !== 'anchored' && S.ai !== 'den' && !S.camo && !e.edibleCache && e.r > p.r * 0.95);
      if (!threat) continue;
      const sx = wx(e.x), sy = wy(e.y), rr = e.r * z;
      if (sx > -rr && sx < W + rr && sy > -rr && sy < H + rr) continue;
      const d = hypot(e.x - p.x, e.y - p.y);
      if (d > (e.boss ? 3000 : 900)) continue;
      const a = atan2(sy - H / 2, sx - W / 2);
      const ix = clamp(W / 2 + cos(a) * W, pad, W - pad), iy = clamp(H / 2 + sin(a) * H, top, H - pad - 10);
      const al = e.boss ? 1 : clamp(1.2 - d / 900, 0.25, 0.9);
      ctx.save(); ctx.translate(ix, iy); ctx.rotate(a); ctx.globalAlpha = al;
      const s = e.boss ? 13 : 9;
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, s * 0.75); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.6, -s * 0.75); ctx.closePath();
      ctx.fillStyle = e.boss ? '#ffb36b' : '#ff6b7d'; ctx.fill();
      ctx.restore(); n++;
    }
    ctx.globalAlpha = 1;
  }

  // ---------- public / debug ----------
  pauseExternal() { this.pause(true); }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf); this.raf = 0;
    for (const [t, ev, fn, o] of this.listeners) t.removeEventListener(ev, fn, o);
    this.listeners = [];
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts = [];
    this.root.remove();
    releaseStyle();
  }
  debug() {
    const g = this;
    return {
      game: g,
      get state() { return { depth: g.depth, depthTime: g.depthTime, level: g.p.level, hp: g.p.hp, maxHp: g.p.maxHp, xp: g.p.xp, ents: g.ents.length, motes: g.motes.length, parts: g.parts.length, modal: g.modal, paused: g.paused, boss: g.boss ? { kind: g.boss.kind, hp: g.boss.hp, maxHp: g.boss.maxHp, phase: g.boss.phase } : null, dead: g.dead, victory: g.victory, frameMs: g.frameMs, muts: { ...g.p.muts }, dna: g.calcDNA().total, listeners: g.listeners.length, timeouts: g.timeouts.length }; },
      grantXP(n) { g.gainXP(Number(n) / (g.xpMult || 1), false); },
      levelUp(n = 1) { for (let i = 0; i < n; i++) { g.p.level++; g.pendingLevels++; } g.recalc(); },
      setLevel(L) { g.p.level = L; g.recalc(); },
      mutate(id, lv = 1) { for (let i = 0; i < lv; i++) g.applyMutation(id); },
      pickCard(i = 0) { const c = g.root.querySelectorAll('.mb-card')[i]; if (c) c.click(); return !!c; },
      jumpDepth(d) { g.trans = null; g.fadeEl.style.opacity = '0'; g.depthsCleared = d - 1; g.enterDepth(d); },
      endDepth() { g.depthTime = g.D.dur; },
      spawnBoss() { g.depthTime = g.D.dur; g.spawnBoss(); },
      hurtBoss(n) { g.bossDamage(n); },
      setInvuln(b = true) { g.invuln = b; },
      kill() { g.invuln = false; g.reviveLeft = 0; g.p.cystUsed = true; g.p.iframes = 0; g.p.cyst = 0; g.p.hp = 0.0001; g.hurt(1, null, { dot: true }); },
      spawnMany(n, kind = 'grazer') { for (let i = 0; i < n; i++) { const a = random() * TAU, d = 100 + random() * 500; g.spawn(kind, g.p.x + cos(a) * d, g.p.y + sin(a) * d, { force: true }); } },
      spawn(kind, dx = 120, dy = 0, r) { return g.spawn(kind, g.p.x + dx, g.p.y + dy, { force: true, r }); },
      showResults() { g.showResults(); },
      clearLevel() { g.levelComplete(); },
      evo() { return g.evo ? { ...g.evo } : null; },
      exit() { g.exit(); },
    };
  }
}
Object.assign(MicrobeGame.prototype, Cinematics, Threats, Bosses, Abilities);
