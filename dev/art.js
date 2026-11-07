// Dev gallery for js/game/art.js — evolution stages, campaign traits, portraits and boss art.
// ?view=main|grid|levels|sheet|zoom|one|puff|sail|boss|states|perf|diff  ?t=<seconds> freezes time (for screenshots)
import { drawPlayer, drawSpecies, portrait, stagePortrait, BOSS_ART, glowSprite } from '../js/game/art.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'main';
const fixedT = q.has('t') ? parseFloat(q.get('t')) : null;
const root = document.getElementById('root');
const status = document.getElementById('status');
const DPR = Math.min(2, window.devicePixelRatio || 1);

const NEW = ['guard', 'polyps', 'signal', 'muscle', 'jaws', 'nerve', 'cnido', 'fins', 'eyes', 'shell', 'tentacles', 'hide', 'gills', 'beak', 'tetrodo', 'hover', 'sail', 'warmeyes', 'stripes'];
const OLD = ['flagellum', 'cilia', 'membrane', 'spikes', 'toxin', 'chloro', 'mito', 'vacuole', 'pseudopod', 'biolum', 'symbionts', 'fission', 'mimicry', 'dash', 'nova', 'cyst', 'osmo', 'lysosome'];
const STAGE_NAMES = ['', 'Single cell', 'Colony', 'Flatworm', 'Jawless fish', 'Jawed fish', 'Pufferfish', 'Sailfish'];
const NS = STAGE_NAMES.length - 1; // number of stages

function rng(seed) { let s = seed % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
// the body stage each campaign trait unlocks at (it can be owned from then on)
const NEW_STAGE = { guard: 2, polyps: 2, signal: 2, muscle: 3, jaws: 3, nerve: 3, cnido: 3, fins: 4, eyes: 4, shell: 4, tentacles: 5, hide: 5, gills: 5, beak: 6, tetrodo: 6, hover: 6, sail: 7, warmeyes: 7, stripes: 7 };
const MAXLV = { flagellum: 5, cilia: 4, membrane: 5, spikes: 4, toxin: 4, chloro: 3, mito: 4, vacuole: 5, pseudopod: 3, biolum: 4, symbionts: 4, fission: 2, mimicry: 3, dash: 4, nova: 3, cyst: 3, osmo: 3, lysosome: 3,
  guard: 3, polyps: 3, signal: 3, muscle: 4, jaws: 3, nerve: 3, cnido: 3, fins: 4, eyes: 3, shell: 3, tentacles: 3, hide: 3, gills: 3, beak: 3, tetrodo: 3, hover: 3, sail: 3, warmeyes: 3, stripes: 3 };
function heavyMix(stage) {
  const r = rng(stage * 977 + 13), m = {};
  for (const id of OLD) if (r() < 0.55) m[id] = 1 + ((r() * 4) | 0);
  for (const id of NEW) if (NEW_STAGE[id] <= stage) m[id] = 1 + ((r() * 3) | 0);
  return m;
}
const el = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };

// ---- animated canvas sections: a list of tiles, each with its own draw(ctx, T)
const sections = [];
function section(title, w, h, tiles) {
  root.append(el('h2', { textContent: title }));
  const c = el('canvas', { className: 'stage' });
  c.width = w * DPR; c.height = h * DPR; c.style.height = h + 'px';
  root.append(c);
  sections.push({ c, ctx: c.getContext('2d'), w, h, tiles });
}
function label(ctx, x, y, text) {
  ctx.font = '600 11px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(159,179,207,0.95)'; ctx.fillText(text, x, y);
}
function playerTile(x, y, R, p, text, opts = {}) {
  return {
    draw(ctx, T) {
      // in-game style glow behind the player
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4;
      const gs = R * 3; ctx.drawImage(glowSprite([110, 255, 225]), x - gs, y - gs, gs * 2, gs * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.ang); ctx.scale(R, R);
      if (opts.alpha) ctx.globalAlpha = opts.alpha;
      drawPlayer(ctx, p, T + (opts.dt || 0), R * DPR);
      ctx.restore(); ctx.globalAlpha = 1;
      if (text) label(ctx, x, opts.ly ?? y + R * 2.9, text);
    },
  };
}
const mkP = (stage, muts = {}, extra = {}) => ({ r: 1, ang: -0.35, seed: 0.37, muts, stage, speedN: 0.3, stretch: 0.03, wob: 0, dent: 0, dentA: 0, dashT: 0, dashCd: 0, ...extra });

function frame(now) {
  const T = fixedT ?? now / 1000;
  for (const s of sections) {
    const { ctx, w, h } = s;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const t of s.tiles) t.draw(ctx, T);
  }
  if (fixedT == null) requestAnimationFrame(frame);
}

function portraitGrid(title, items, size = 88) {
  root.append(el('h2', { textContent: title }));
  const g = el('div', { className: 'grid' });
  for (const [kind, id, name] of items) g.append(el('figure', {}, [portrait(kind, id, size), el('figcaption', { textContent: name || String(id) })]));
  root.append(g);
}

// ---------------------------------------------------------------------------------------------
if (view === 'main') {
  const cols = NS, cw = 900 / cols;
  const big = [], small = [];
  for (let s = 1; s <= NS; s++) {
    big.push(playerTile(cw * (s - 0.5) + (s === 7 ? -2 : 10), 108, s === 7 ? 25 : 30, mkP(s), STAGE_NAMES[s], { ly: 205 }));
    small.push(playerTile(cw * (s - 0.5) + (s === 7 ? -4 : 4), 262, 17, mkP(s), 'phone size', { ly: 316 }));
  }
  section('Evolution stages · no mutations (animated)', 900, 330, [...big, ...small]);
  const mixB = [], mixS = [];
  for (let s = 1; s <= NS; s++) {
    mixB.push(playerTile(cw * (s - 0.5) + (s === 7 ? -2 : 10), 120, s === 7 ? 23 : 27, mkP(s, heavyMix(s)), STAGE_NAMES[s] + ' + mix', { ly: 228 }));
    mixS.push(playerTile(cw * (s - 0.5) + (s === 7 ? -4 : 4), 290, 17, mkP(s, heavyMix(s)), 'phone size', { ly: 345 }));
  }
  section('Each stage with a heavy random mix (every trait its stage allows + random old ones)', 900, 360, [...mixB, ...mixS]);
  portraitGrid('New trait portraits · mutationPortrait()', NEW.map((id) => ['mutation', id]));
  portraitGrid('Active powers · mutationPortrait()', ['photo', 'shoal', 'suction', 'puff', 'slash'].map((id) => ['mutation', id]));
  portraitGrid('Stage portraits · portrait("stage", n)', [1, 2, 3, 4, 5, 6, 7].map((n) => ['stage', n, `${n} · ${STAGE_NAMES[n]}`]));
  // every trait as it is shown once you are a pufferfish (portrait('mutation', id, size, 6))
  root.append(el('h2', { textContent: 'Trait portraits on the pufferfish · portrait("mutation", id, 88, 6)' }));
  { const g = el('div', { className: 'grid' }); for (const id of [...NEW.filter((id) => NEW_STAGE[id] <= 6), ...OLD]) g.append(el('figure', {}, [portrait('mutation', id, 88, 6), el('figcaption', { textContent: id })])); root.append(g); }
  // and once you are a sailfish (portrait('mutation', id, size, 7))
  root.append(el('h2', { textContent: 'Trait portraits on the sailfish · portrait("mutation", id, 88, 7)' }));
  { const g = el('div', { className: 'grid' }); for (const id of [...NEW, ...OLD, 'slash']) g.append(el('figure', {}, [portrait('mutation', id, 88, 7), el('figcaption', { textContent: id })])); root.append(g); }
  portraitGrid('Boss portraits · portrait("microbe", id)', Object.keys(BOSS_ART).map((id) => ['microbe', id, `${id} (${BOSS_ART[id].base})`]));
  portraitGrid('Existing trait portraits (unchanged)', OLD.map((id) => ['mutation', id]), 64);
  portraitGrid('Species portraits (unchanged)', ['drifter', 'grazer', 'diatom', 'hunter', 'phage', 'amoeba', 'siphonophore', 'ciliate', 'rotifer', 'volvox'].map((id) => ['microbe', id]), 64);
  // stagePortrait export check
  const sp = stagePortrait(3, 40); if (!(sp instanceof HTMLCanvasElement)) throw new Error('stagePortrait did not return a canvas');
}

if (view === 'grid') {
  const cw = 900 / (NS + 1), rh = 108;
  const tiles = [];
  NEW.forEach((id, r) => {
    for (let s = NEW_STAGE[id]; s <= NS; s++) tiles.push(playerTile(cw * (s + 0.5) - (s === 7 ? 4 : 0), rh * (r + 0.5) + 4, s === 7 ? 20 : 24, mkP(s, { [id]: 3 }), null));
  });
  const lab = { draw(ctx) { NEW.forEach((id, r) => { ctx.font = '600 13px ui-rounded, system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfe2ff'; ctx.fillText(id, 14, rh * (r + 0.5) + 8); }); for (let s = 1; s <= NS; s++) label(ctx, cw * (s + 0.5), 12, STAGE_NAMES[s]); } };
  section('Each campaign trait (level 3) on every stage that can own it', 900, rh * NEW.length + 10, [...tiles, lab]);
  // the single-cell traits can be owned at any stage: show them on the animals
  const OLDA = OLD.filter((id) => id !== 'symbionts' && id !== 'fission');
  const cw2 = 900 / (NS - 1), rh2 = 104, t2 = [];
  OLDA.forEach((id, r) => { for (let s = 3; s <= NS; s++) t2.push(playerTile(cw2 * (s - 2 + 0.5), rh2 * (r + 0.5) + 6, s === 7 ? 22 : 28, mkP(s, { [id]: 3 }, id === 'dash' ? { dashT: (r & 1) ? 0.2 : 0 } : id === 'cyst' ? { cyst: 1 } : {}), null)); });
  const lab2 = { draw(ctx) { OLDA.forEach((id, r) => { ctx.font = '600 13px ui-rounded, system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfe2ff'; ctx.fillText(id, 14, rh2 * (r + 0.5) + 10); }); for (let s = 3; s <= NS; s++) label(ctx, cw2 * (s - 2 + 0.5), 12, STAGE_NAMES[s]); } };
  section('Single-cell traits (level 3) on the animal stages', 900, rh2 * OLDA.length + 10, [...t2, lab2]);
}

if (view === 'levels') {
  // every trait at levels 1…max on one stage (?stage=n, default 5); traits the stage cannot own are skipped
  const stg = +(q.get('stage') || 5), ids = [...NEW, ...OLD].filter((id) => (NEW_STAGE[id] || 1) <= stg && id !== 'symbionts' && id !== 'fission');
  const pk = +(q.get('puff') || 0); // ?puff=0…1 inflates the pufferfish
  const cw = 900 / 6, rh = 100, tiles = [];
  ids.forEach((id, r) => { for (let lv = 1; lv <= MAXLV[id]; lv++) tiles.push(playerTile(cw * (lv + 0.5), rh * (r + 0.5) + 6, pk ? 20 : stg === 7 ? 19 : 26, mkP(stg, { [id]: lv }, { puffK: pk }), null)); });
  const lab = { draw(ctx) { ids.forEach((id, r) => { ctx.font = '600 13px ui-rounded, system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfe2ff'; ctx.fillText(id, 14, rh * (r + 0.5) + 10); }); for (let l = 1; l <= 5; l++) label(ctx, cw * (l + 0.5), 12, 'level ' + l); } };
  section(`Trait levels on ${STAGE_NAMES[stg]}`, 900, rh * ids.length + 10, [...tiles, lab]);
}

if (view === 'sheet') {
  // ?view=sheet&stage=n&lv=3&R=56 — every trait the stage can own, one big labelled tile each
  const stg = +(q.get('stage') || 5), lv = +(q.get('lv') || 3), R = +(q.get('R') || (stg === 7 ? 40 : 56)), cols = 3;
  const ids = [...NEW, ...OLD].filter((id) => (NEW_STAGE[id] || 1) <= stg && id !== 'symbionts' && id !== 'fission');
  const cw = 900 / cols, rh = R * 3.3, tiles = [];
  ids.forEach((id, i) => {
    const x = cw * ((i % cols) + 0.5), y = rh * (Math.floor(i / cols) + 0.5);
    tiles.push(playerTile(x, y - 8, R, mkP(stg, { [id]: Math.min(lv, MAXLV[id]) }, { ang: -0.25, dashT: id === 'dash' ? 0.2 : 0, cyst: id === 'cyst' ? 1 : 0, puffK: +(q.get('puff') || 0) }), `${id} ${Math.min(lv, MAXLV[id])}`, { ly: y + rh * 0.44 }));
  });
  section(`${STAGE_NAMES[stg]} · each trait at level ${lv}`, 900, rh * Math.ceil(ids.length / cols), tiles);
}

if (view === 'one') {
  // ?view=one&stage=5&muts=jaws:3,fins:2&R=200&ang=0 — one big render
  const stg = +(q.get('stage') || 5), R = +(q.get('R') || 190), muts = {};
  for (const kv of (q.get('muts') || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); muts[k] = +(v || 3); }
  const extra = { ang: +(q.get('ang') || 0) }; if (q.has('dashT')) extra.dashT = +q.get('dashT'); if (q.has('speed')) extra.speedN = +q.get('speed'); if (q.has('puff')) extra.puffK = +q.get('puff');
  for (const [k, n] of [['sail', 'sailK'], ['slash', 'slashK'], ['slashDir', 'slashDir'], ['stripe', 'stripeK'], ['sailSide', 'sailSide']]) if (q.has(k)) extra[n] = +q.get(k);
  section(`${STAGE_NAMES[stg]} · ${Object.keys(muts).join(', ') || 'no traits'}`, 900, R * 3.3, [playerTile(450, R * 1.6, R, mkP(stg, muts, extra), null)]);
}

if (view === 'zoom') {
  // big renders: plain stage (left) and a tier-typical build (right)
  const TIER = [null, { flagellum: 3, chloro: 2, mito: 2, vacuole: 2 }, { guard: 2, polyps: 2, signal: 1, cilia: 2 }, { muscle: 2, jaws: 2, nerve: 2, cnido: 2 },
    { fins: 2, eyes: 2, shell: 2, jaws: 2 }, { tentacles: 2, hide: 2, gills: 2, fins: 2, eyes: 2, jaws: 2 }, { beak: 2, tetrodo: 2, hover: 2, eyes: 2, tentacles: 2 },
    { sail: 2, warmeyes: 2, stripes: 2, jaws: 2, eyes: 2, tentacles: 2 }];
  const tiles = [];
  for (let s = 1; s <= NS; s++) {
    const y = 160 + (s - 1) * 320, ox = s === 7 ? -15 : s >= 3 ? 20 : 0, R = s === 7 ? 70 : 78;
    tiles.push(playerTile(225 + ox, y, R, mkP(s, {}, { ang: 0 }), STAGE_NAMES[s], { ly: y + 150 }));
    tiles.push(playerTile(675 + ox, y, R, mkP(s, TIER[s], { ang: 0 }), STAGE_NAMES[s] + ' · ' + Object.keys(TIER[s]).join(', '), { ly: y + 150 }));
  }
  section('Stages up close (heading +x)', 900, 320 * NS + 20, tiles);
}

if (view === 'puff') {
  // the pufferfish inflating: puffK 0 → 1 (big and phone size), then a heavy mix and the new traits inflated
  const ks = [0, 0.25, 0.5, 0.75, 1], cw = 900 / ks.length, tiles = [];
  ks.forEach((k, i) => {
    tiles.push(playerTile(cw * (i + 0.5), 105, 40, mkP(6, {}, { puffK: k, ang: -0.3 }), `puffK ${k}`, { ly: 205 }));
    tiles.push(playerTile(cw * (i + 0.5), 265, 17, mkP(6, {}, { puffK: k, ang: -0.3 }), 'phone size', { ly: 320 }));
    tiles.push(playerTile(cw * (i + 0.5), 420, 34, mkP(6, heavyMix(6), { puffK: k, ang: -0.3 }), 'heavy mix', { ly: 510 }));
    tiles.push(playerTile(cw * (i + 0.5), 610, 34, mkP(6, { beak: 3, tetrodo: 3, hover: 3, hide: 2 }, { puffK: k, ang: -0.3 }), 'beak · tetrodo · hover · hide', { ly: 700 }));
  });
  section('Pufferfish inflation · p.puffK', 900, 720, tiles);
}

if (view === 'sail') {
  // the sailfish's hooks: p.sailK (sail raised), p.slashK + p.slashDir (Bill Slash), p.stripeK (hunting colours),
  // big and phone size; then the new traits by level and a heavy mix in action
  const ks = [0, 0.25, 0.5, 0.75, 1], cw = 900 / ks.length, tiles = [];
  const rows = [['sailK', (k) => ({ sailK: k })], ['slashK (dir +1)', (k) => ({ slashK: k, slashDir: 1 })], ['slashK (dir -1, sail up)', (k) => ({ slashK: k, slashDir: -1, sailK: 1 })], ['stripeK', (k) => ({ stripeK: k })]];
  rows.forEach(([name, f], r) => ks.forEach((k, i) => {
    const y = 80 + r * 230;
    tiles.push(playerTile(cw * (i + 0.5) - 6, y, 30, mkP(7, {}, { ang: -0.3, ...f(k) }), `${name} ${k}`, { ly: y + 105 }));
    tiles.push(playerTile(cw * (i + 0.5) - 4, y + 150, 17, mkP(7, {}, { ang: -0.3, ...f(k) }), null));
  }));
  const y0 = 80 + rows.length * 230 + 20;
  ['sail', 'warmeyes', 'stripes'].forEach((id, r) => { for (let lv = 1; lv <= 3; lv++) tiles.push(playerTile(cw * (lv + 0.5) - 6, y0 + r * 150, 28, mkP(7, { [id]: lv }, { ang: -0.3 }), `${id} ${lv}`, { ly: y0 + r * 150 + 70 })); });
  const y1 = y0 + 3 * 150 + 20;
  [[{}, 'heavy mix'], [{ sailK: 1, stripeK: 1 }, 'mix · sail up · hunting'], [{ slashK: 0.9, slashDir: 1, sailK: 1, stripeK: 0.6 }, 'mix · slashing']].forEach(([ex, name], i) => tiles.push(playerTile(150 + i * 300, y1 + 60, 34, mkP(7, heavyMix(7), { ang: -0.3, ...ex }), name, { ly: y1 + 160 })));
  section('Sailfish hooks · p.sailK, p.slashK / p.slashDir, p.stripeK (big and phone size), the new traits, mixes', 900, y1 + 180, tiles);
}

if (view === 'states') {
  const cw = 900 / NS, tiles = [];
  for (let s = 1; s <= NS; s++) {
    tiles.push(playerTile(cw * (s - 0.5) + 12, 90, 26, mkP(s, {}, { stretch: 0.26, speedN: 1.2 }), 'fast (stretch)', { ly: 160 }));
    tiles.push(playerTile(cw * (s - 0.5) + 12, 250, 26, mkP(s, {}, { dent: 0.35, dentA: 0.6, wob: 0.06 }), 'hit (dent+wob)', { ly: 320 }));
    tiles.push(playerTile(cw * (s - 0.5) + 12, 410, 26, mkP(s, { flagellum: 4, spikes: 3, cilia: 3 }, { cyst: 1 }), 'cyst + basics', { ly: 480 }));
    tiles.push(playerTile(cw * (s - 0.5) + 12, 570, 26, mkP(s, { flagellum: 5, chloro: 3, mito: 4, toxin: 3, vacuole: 4, biolum: 4, pseudopod: 3, membrane: 5, lysosome: 3 }), 'old traits', { ly: 640 }));
    tiles.push(playerTile(cw * (s - 0.5) + 12, 730, 26, mkP(s, { guard: 1, muscle: 1, fins: 1, hide: 1, eyes: 1 }), 'new traits lv1', { ly: 800, alpha: 1 }));
    tiles.push(playerTile(cw * (s - 0.5) + 12, 890, 26, mkP(s, { guard: 3, polyps: 3, signal: 3, biolum: 2 }), 'iframe alpha 0.55', { ly: 960, alpha: 0.55 }));
  }
  section('Body states: stretch, dents, cyst, old traits, alpha', 900, 980, tiles);
}

if (view === 'boss') {
  const tiles = [];
  const ids = Object.keys(BOSS_ART);
  ids.forEach((id, i) => {
    const { base, col } = BOSS_ART[id];
    const cx = i % 2 ? 675 : 225, cy = 215 + Math.floor(i / 2) * 420, R = base === 'queen' ? 85 : base === 'rotifer' ? 105 : 140;
    const e = { kind: base, seed: 0.37 + i, ang: -0.35, armor: 3, armorMax: 3, kids: 6, phase: id === 'progenitor' ? 2 : 1, boss: true, dent: 0, dentA: 0 };
    if (col) e.col = col;
    tiles.push({
      draw(ctx, T) {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35;
        const gs = R * 2.2, gc = (col || { glow: [255, 90, 100] }).glow; ctx.drawImage(glowSprite(gc), cx - gs, cy - gs, gs * 2, gs * 2);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(base === 'colossus' ? 0 : e.ang); ctx.scale(R, R);
        drawSpecies(ctx, e, T, R * DPR, {});
        ctx.restore();
        label(ctx, cx, cy + 200, `${id} — drawSpecies('${base}') at ${R}px radius`);
        // the normal-size species next to it
        if (col) {
          const sx = cx + 170, sy = cy - 150, r = 18;
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(-0.35); ctx.scale(r, r);
          drawSpecies(ctx, { kind: base, seed: 0.2, ang: -0.35, armor: 2, armorMax: 2, kids: 5 }, T, r * DPR, {});
          ctx.restore();
        }
      },
    });
  });
  section('Bosses drawn at boss scale (s ≈ 170–280 device px/unit)', 900, 1700, tiles);
  // cracked + exposed leviathan
  const lev = BOSS_ART.leviathan;
  const t2 = [];
  [[3, 3], [1, 3], [0, 3]].forEach(([armor, armorMax], i) => {
    const cx = 150 + i * 300, cy = 160, R = 110;
    t2.push({ draw(ctx, T) { ctx.save(); ctx.translate(cx, cy); ctx.scale(R, R); drawSpecies(ctx, { kind: 'diatom', seed: 1.3, ang: 0, armor, armorMax, col: lev.col, dent: 0 }, T, R * DPR); ctx.restore(); label(ctx, cx, cy + 148, `leviathan armour ${armor}/${armorMax}`); } });
  });
  section('Diatom Leviathan armour states', 900, 330, t2);
}

if (view === 'perf') {
  // time drawPlayer per stage (plain / heavy mix) and boss-scale drawSpecies on a 400x400 canvas
  const c = el('canvas'); c.width = c.height = 400; const g = c.getContext('2d');
  const rows = [];
  const bench = (name, fn, n = 400) => {
    for (let i = 0; i < 30; i++) fn(i * 0.016);
    let ms = 1e9;
    for (let r = 0; r < 3; r++) { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(i * 0.016); ms = Math.min(ms, (performance.now() - t0) / n); }
    rows.push(`${name}: ${ms.toFixed(3)} ms`);
  };
  for (let s = 1; s <= NS; s++) {
    for (const [label, muts] of [['plain', {}], ['heavy', heavyMix(s)]]) {
      const p = mkP(s, muts);
      bench(`stage ${s} ${label}`, (T) => { g.setTransform(1, 0, 0, 1, 200, 200); g.clearRect(-200, -200, 400, 400); g.scale(40, 40); drawPlayer(g, p, T, 80); });
    }
  }
  for (const [label, muts] of [['plain', {}], ['heavy', heavyMix(6)]]) {
    const p = mkP(6, muts, { puffK: 1 });
    bench(`stage 6 inflated ${label}`, (T) => { g.setTransform(1, 0, 0, 1, 200, 200); g.clearRect(-200, -200, 400, 400); g.scale(40, 40); drawPlayer(g, p, T, 80); });
  }
  for (const [label, ex] of [['sail up + hunting', { sailK: 1, stripeK: 1 }], ['slashing', { slashK: 0.8, slashDir: 1, sailK: 1 }]]) {
    const p = mkP(7, heavyMix(7), ex);
    bench(`stage 7 heavy ${label}`, (T) => { g.setTransform(1, 0, 0, 1, 200, 200); g.clearRect(-200, -200, 400, 400); g.scale(40, 40); drawPlayer(g, p, T, 80); });
  }
  if (q.has('traits')) for (const s of [4, 5, 6, 7]) for (const id of [...NEW, ...OLD]) {
    const p = mkP(s, { [id]: 3 });
    bench(`  s${s} ${id}`, (T) => { g.setTransform(1, 0, 0, 1, 200, 200); g.clearRect(-200, -200, 400, 400); g.scale(40, 40); drawPlayer(g, p, T, 80); }, 200);
  }
  for (const id of ['greatciliate', 'tyrant', 'titan', 'leviathan']) {
    const { base, col } = BOSS_ART[id], e = { kind: base, seed: 0.3, ang: 0, armor: 3, armorMax: 3, kids: 6, col, dent: 0 };
    bench(`boss ${id}`, (T) => { g.setTransform(1, 0, 0, 1, 200, 200); g.clearRect(-200, -200, 400, 400); g.scale(150, 150); drawSpecies(g, e, T, 300); }, 200);
  }
  root.append(el('pre', { textContent: rows.join('\n') }));
  document.body.dataset.perf = rows.join(' | ');
}

if (view === 'diff') {
  // stage 1 must be pixel-identical to the original art (orig_art.js is a copy of the pre-change module)
  const orig = await import('./orig_art.js').catch(() => null);
  if (!orig) { root.append(el('p', { textContent: 'dev/orig_art.js not present — regression view unavailable.' })); }
  else {
    const T = fixedT ?? 1.7;
    const cases = [{}, { flagellum: 4, spikes: 3, cilia: 3 }, { membrane: 5, vacuole: 4, chloro: 3, mito: 4 }, { toxin: 3, nova: 2, lysosome: 3, biolum: 4, pseudopod: 3 }, { flagellum: 2, mimicry: 2, symbionts: 2 }];
    let worst = 0;
    const out = el('div', { className: 'grid' });
    cases.forEach((muts, i) => {
      const S = 160, R = 40;
      const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
      const a = mk(), b = mk();
      for (const [cv, fn] of [[a, orig.drawPlayer], [b, drawPlayer]]) {
        const g = cv.getContext('2d'); g.translate(S / 2, S / 2); g.rotate(-0.4); g.scale(R, R);
        fn(g, { r: 1, ang: -0.4, seed: 0.37, muts, speedN: 0.4, stretch: 0.08, wob: 0.02, dent: 0.2, dentA: 1.1, cyst: i === 4 ? 1 : 0 }, T, R);
      }
      const da = a.getContext('2d').getImageData(0, 0, S, S).data, db = b.getContext('2d').getImageData(0, 0, S, S).data;
      let diff = 0; for (let k = 0; k < da.length; k++) diff = Math.max(diff, Math.abs(da[k] - db[k]));
      worst = Math.max(worst, diff);
      out.append(el('figure', {}, [a, el('figcaption', { textContent: 'original' })]), el('figure', {}, [b, el('figcaption', { textContent: `new · max Δ ${diff}` })]));
    });
    root.append(el('h2', { textContent: `Stage 1 vs original drawPlayer — worst channel difference: ${worst}` }), out);
    document.body.dataset.diff = String(worst);
  }
}

requestAnimationFrame(frame);
status.textContent = fixedT == null ? 'animating' : `frozen at t=${fixedT}`;
document.body.dataset.ready = '1';
