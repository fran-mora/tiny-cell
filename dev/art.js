// Dev gallery for js/game/art.js — evolution stages, campaign traits, portraits and boss art.
// ?view=main|grid|boss|states|diff  ?t=<seconds> freezes time (for screenshots)
import { drawPlayer, drawSpecies, portrait, stagePortrait, BOSS_ART, glowSprite } from '../js/game/art.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'main';
const fixedT = q.has('t') ? parseFloat(q.get('t')) : null;
const root = document.getElementById('root');
const status = document.getElementById('status');
const DPR = Math.min(2, window.devicePixelRatio || 1);

const NEW = ['guard', 'polyps', 'signal', 'muscle', 'jaws', 'nerve', 'cnido', 'fins', 'eyes', 'shell', 'tentacles', 'hide', 'gills'];
const OLD = ['flagellum', 'cilia', 'membrane', 'spikes', 'toxin', 'chloro', 'mito', 'vacuole', 'pseudopod', 'biolum', 'symbionts', 'fission', 'mimicry', 'dash', 'nova', 'cyst', 'osmo', 'lysosome'];
const STAGE_NAMES = ['', 'Single cell', 'Colony', 'Multicellular', 'Swimmer', 'Sea creature'];

function rng(seed) { let s = seed % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function heavyMix(stage) {
  const r = rng(stage * 977 + 13), m = {};
  for (const id of OLD) if (r() < 0.55) m[id] = 1 + ((r() * 4) | 0);
  for (const id of NEW) m[id] = 1 + ((r() * 3) | 0);
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
const mkP = (stage, muts = {}, extra = {}) => ({ r: 1, ang: -0.35, seed: 0.37, muts, stage, speedN: 0.3, stretch: 0.03, wob: 0, dent: 0, dentA: 0, ...extra });

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
  const cols = 5, cw = 900 / cols;
  const big = [], small = [];
  for (let s = 1; s <= 5; s++) {
    big.push(playerTile(cw * (s - 0.5) + 14, 108, 34, mkP(s), STAGE_NAMES[s], { ly: 205 }));
    small.push(playerTile(cw * (s - 0.5) + 6, 262, 17, mkP(s), 'phone size', { ly: 316 }));
  }
  section('Evolution stages · no mutations (animated)', 900, 330, [...big, ...small]);
  const mixB = [], mixS = [];
  for (let s = 1; s <= 5; s++) {
    mixB.push(playerTile(cw * (s - 0.5) + 14, 120, 30, mkP(s, heavyMix(s)), STAGE_NAMES[s] + ' + mix', { ly: 228 }));
    mixS.push(playerTile(cw * (s - 0.5) + 6, 290, 17, mkP(s, heavyMix(s)), 'phone size', { ly: 345 }));
  }
  section('Each stage with a heavy random mix (all 13 new traits + random old ones)', 900, 360, [...mixB, ...mixS]);
  portraitGrid('New trait portraits · mutationPortrait()', NEW.map((id) => ['mutation', id]));
  portraitGrid('Stage portraits · portrait("stage", n)', [1, 2, 3, 4, 5].map((n) => ['stage', n, `${n} · ${STAGE_NAMES[n]}`]));
  portraitGrid('Boss portraits · portrait("microbe", id)', Object.keys(BOSS_ART).map((id) => ['microbe', id, `${id} (${BOSS_ART[id].base})`]));
  portraitGrid('Existing trait portraits (unchanged)', OLD.map((id) => ['mutation', id]), 64);
  portraitGrid('Species portraits (unchanged)', ['drifter', 'grazer', 'diatom', 'hunter', 'phage', 'amoeba', 'siphonophore', 'ciliate', 'rotifer', 'volvox'].map((id) => ['microbe', id]), 64);
  // stagePortrait export check
  const sp = stagePortrait(3, 40); if (!(sp instanceof HTMLCanvasElement)) throw new Error('stagePortrait did not return a canvas');
}

if (view === 'grid') {
  const cw = 900 / 6, rh = 108;
  const tiles = [];
  NEW.forEach((id, r) => {
    for (let s = 1; s <= 5; s++) tiles.push(playerTile(cw * (s + 0.5), rh * (r + 0.5) + 4, 22, mkP(s, { [id]: 3 }), null));
  });
  const lab = { draw(ctx) { NEW.forEach((id, r) => { ctx.font = '600 13px ui-rounded, system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#cfe2ff'; ctx.fillText(id, 14, rh * (r + 0.5) + 8); }); for (let s = 1; s <= 5; s++) label(ctx, cw * (s + 0.5), 12, STAGE_NAMES[s]); } };
  section('Each new trait (level 3) on each stage', 900, rh * NEW.length + 10, [...tiles, lab]);
}

if (view === 'zoom') {
  // big renders: plain stage (left) and a tier-typical build (right)
  const TIER = [null, { flagellum: 3, chloro: 2, mito: 2, vacuole: 2 }, { guard: 2, polyps: 2, signal: 1, cilia: 2 }, { muscle: 2, jaws: 2, nerve: 2, cnido: 2 },
    { fins: 2, eyes: 2, shell: 2, flagellum: 2 }, { tentacles: 2, hide: 2, gills: 2, fins: 2, eyes: 2 }];
  const tiles = [];
  for (let s = 1; s <= 5; s++) {
    const y = 160 + (s - 1) * 320, ox = s === 4 ? 70 : s === 5 ? 30 : 0;
    tiles.push(playerTile(225 + ox, y, 78, mkP(s, {}, { ang: 0 }), STAGE_NAMES[s], { ly: y + 150 }));
    tiles.push(playerTile(675 + ox, y, 78, mkP(s, TIER[s], { ang: 0 }), STAGE_NAMES[s] + ' · ' + Object.keys(TIER[s]).join(', '), { ly: y + 150 }));
  }
  section('Stages up close (heading +x)', 900, 1620, tiles);
}

if (view === 'states') {
  const cw = 900 / 5, tiles = [];
  for (let s = 1; s <= 5; s++) {
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
  for (let s = 1; s <= 5; s++) {
    for (const [label, muts] of [['plain', {}], ['heavy', heavyMix(s)]]) {
      const p = mkP(s, muts);
      bench(`stage ${s} ${label}`, (T) => { g.setTransform(1, 0, 0, 1, 200, 200); g.clearRect(-200, -200, 400, 400); g.scale(40, 40); drawPlayer(g, p, T, 80); });
    }
  }
  if (q.has('traits')) for (const s of [4, 5]) for (const id of [...NEW, ...OLD]) {
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
