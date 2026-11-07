// Microbe mode — rendering primitives: cached glow sprites, soft-body cells, species art, portraits.
import { COLORS } from './data.js';

const TAU = Math.PI * 2;
const { sin, cos, max, min, abs, exp, sqrt, PI } = Math;

export const rgbStr = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
const strCache = new Map();
export function cstr(c) {
  const k = (c[0] << 16) | (c[1] << 8) | c[2];
  let s = strCache.get(k);
  if (!s) { s = rgbStr(c); strCache.set(k, s); }
  return s;
}
export const mixRGB = (a, b, t, out = [0, 0, 0]) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; return out; };

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---------- glow sprites ----------
const glowCache = new Map();
// soft radial glow, colour c; sprite is 64px, the glow reaches the sprite edge.
export function glowSprite(c, hard = 0) {
  const key = c[0] + ',' + c[1] + ',' + c[2] + ',' + hard;
  let s = glowCache.get(key);
  if (s) return s;
  const S = 64; s = mkCanvas(S, S); const g = s.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  if (hard) {
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, rgbStr(c, 0.95));
    gr.addColorStop(0.45, rgbStr(c, 0.35));
    gr.addColorStop(1, rgbStr(c, 0));
  } else {
    gr.addColorStop(0, rgbStr(c, 0.9));
    gr.addColorStop(0.25, rgbStr(c, 0.45));
    gr.addColorStop(0.6, rgbStr(c, 0.12));
    gr.addColorStop(1, rgbStr(c, 0));
  }
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  glowCache.set(key, s);
  return s;
}
export const WHITE = [255, 255, 255];

// ---------- gradients (unit space, cached per context) ----------
const gradCache = new WeakMap();
function grads(ctx) { let m = gradCache.get(ctx); if (!m) { m = new Map(); gradCache.set(ctx, m); } return m; }
export function bodyGrad(ctx, c, alpha = 1) {
  const m = grads(ctx); const key = 'b' + c.join(',') + alpha;
  let g = m.get(key);
  if (!g) {
    g = ctx.createRadialGradient(-0.25, -0.2, 0.05, 0, 0, 1.02);
    g.addColorStop(0, rgbStr(c, 0.22 * alpha));
    g.addColorStop(0.55, rgbStr(c, 0.36 * alpha));
    g.addColorStop(0.86, rgbStr(c, 0.62 * alpha));
    g.addColorStop(1, rgbStr(c, 0.9 * alpha));
    m.set(key, g);
  }
  return g;
}
function nucGrad(ctx, c) {
  const m = grads(ctx); const key = 'n' + c.join(',');
  let g = m.get(key);
  if (!g) {
    g = ctx.createRadialGradient(-0.08, -0.08, 0, 0, 0, 1);
    g.addColorStop(0, rgbStr([min(255, c[0] + 90), min(255, c[1] + 90), min(255, c[2] + 90)], 0.95));
    g.addColorStop(0.7, rgbStr(c, 0.85));
    g.addColorStop(1, rgbStr([c[0] * 0.6, c[1] * 0.6, c[2] * 0.6], 0.9));
    m.set(key, g);
  }
  return g;
}
function glassGrad(ctx, c) {
  const m = grads(ctx); const key = 'g' + c.join(',');
  let g = m.get(key);
  if (!g) {
    g = ctx.createLinearGradient(-1, -1, 1, 1);
    g.addColorStop(0, rgbStr([255, 255, 245], 0.55));
    g.addColorStop(0.35, rgbStr(c, 0.4));
    g.addColorStop(0.7, rgbStr(c, 0.62));
    g.addColorStop(1, rgbStr([c[0] * 0.7, c[1] * 0.7, c[2] * 0.7], 0.8));
    m.set(key, g);
  }
  return g;
}
// vertical band gradient across y in [-1, 1] (shell plates), light in the middle
function bandGrad(ctx, c) {
  const m = grads(ctx); const key = 'v' + c.join(',');
  let g = m.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, -1, 0, 1);
    g.addColorStop(0, rgbStr([c[0] * 0.62, c[1] * 0.55, c[2] * 0.5], 0.8));
    g.addColorStop(0.32, rgbStr(c, 0.72));
    g.addColorStop(0.5, rgbStr([min(255, c[0] + 20), min(255, c[1] + 25), min(255, c[2] + 35)], 0.6));
    g.addColorStop(0.68, rgbStr(c, 0.72));
    g.addColorStop(1, rgbStr([c[0] * 0.62, c[1] * 0.55, c[2] * 0.5], 0.8));
    m.set(key, g);
  }
  return g;
}

// ---------- soft-body outline ----------
const PX = new Float32Array(72), PY = new Float32Array(72), PR = new Float32Array(72);
// Builds the blob path in unit space. Returns nothing; PX/PY/PR hold the outline points.
// o: { n, t, seed, amp, stretch, lobes, lobeAmp, dentA, dent, notch }
export function blobPath(ctx, o) {
  const n = o.n || 22, t = o.t, sd = o.seed || 0, amp = o.amp ?? 0.05;
  const st = o.stretch || 0, lobes = o.lobes || 0, la = o.lobeAmp || 0, dent = o.dent || 0, da = o.dentA || 0, nt = o.notch || 0;
  const sx = 1 + st, sy = 1 - st * 0.55;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    let r = 1 + amp * (0.55 * sin(3 * th + t * 1.7 + sd) + 0.32 * sin(5 * th - t * 2.3 + sd * 1.7) + 0.18 * sin(8 * th + t * 3.3 + sd * 2.9));
    if (la) { const s = sin(lobes * th + t * 0.7 + sd * 3.1); r += la * (s > 0 ? s * s : s * 0.15); }
    if (dent) { let d = th - da; d = Math.atan2(sin(d), cos(d)); r -= dent * exp(-d * d * 5); }
    if (nt) { const d = Math.atan2(sin(th), cos(th)); r -= nt * exp(-d * d * 26); }
    PR[i] = r; PX[i] = cos(th) * r * sx; PY[i] = sin(th) * r * sy;
  }
  ctx.beginPath();
  let mx = (PX[n - 1] + PX[0]) / 2, my = (PY[n - 1] + PY[0]) / 2;
  ctx.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(PX[i], PY[i], (PX[i] + PX[j]) / 2, (PY[i] + PY[j]) / 2);
  }
  ctx.closePath();
  return n;
}
// outline point at angle (approx, from last blob build)
export function blobPoint(n, th, out) {
  let i = ((th / TAU) * n) % n; if (i < 0) i += n;
  const i0 = i | 0, i1 = (i0 + 1) % n, f = i - i0;
  out[0] = PX[i0] + (PX[i1] - PX[i0]) * f; out[1] = PY[i0] + (PY[i1] - PY[i0]) * f;
  return out;
}

// ox/kx/ky map the dot ring into an elliptical body (defaults = unit circle)
function dots(ctx, count, seed, t, rMin, rMax, size, spin = 0.25, ox = 0, kx = 1, ky = 1) {
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = seed * 2.39 + i * 2.399 + t * spin * (i % 2 ? 1 : -0.7);
    const d = rMin + (rMax - rMin) * (((i * 0.618 + seed) % 1 + 1) % 1);
    const s = size * (0.7 + 0.5 * (((i * 0.37 + seed * 0.5) % 1 + 1) % 1));
    const x = ox + cos(a) * d * kx, y = sin(a) * d * ky;
    ctx.moveTo(x + s, y); ctx.arc(x, y, s, 0, TAU);
  }
}

function nucleus(ctx, c, x, y, r, t, seed) {
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r * 0.92);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
  ctx.fillStyle = nucGrad(ctx, c); ctx.fill();
  ctx.beginPath(); ctx.arc(0.22 + 0.06 * sin(t + seed), -0.1, 0.32, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fill();
  ctx.restore();
}

function highlight(ctx, ang) {
  // world-fixed specular highlight (upper-left), drawn in rotated unit space
  const lx = -0.38, ly = -0.42;
  const ca = cos(-ang), sa = sin(-ang);
  const x = lx * ca - ly * sa, y = lx * sa + ly * ca;
  ctx.globalAlpha *= 0.55;
  ctx.drawImage(glowSprite(WHITE), x - 0.45, y - 0.45, 0.9, 0.9);
  ctx.globalAlpha /= 0.55;
}

// ---------- cell feature helpers ----------
function flagellum(ctx, t, len, width, c, phase = 0, freq = 9, startX = -0.95) {
  ctx.beginPath(); ctx.moveTo(startX, 0);
  const segs = 14;
  for (let i = 1; i <= segs; i++) {
    const u = i / segs;
    const x = startX - u * len;
    const y = sin(u * 5.2 - t * freq + phase) * 0.22 * len * u;
    ctx.lineTo(x, y);
  }
  ctx.strokeStyle = c; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
}
function ciliaFringe(ctx, n, t, len, lw, c, sx = 1, sy = 1, speed = 10) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU;
    const w = sin(th * 6 - t * speed) * 0.35;
    const cx = cos(th) * sx, cy = sin(th) * sy;
    const nx = cos(th + w * 0.6), ny = sin(th + w * 0.6);
    ctx.moveTo(cx * 0.98, cy * 0.98); ctx.lineTo(cx + nx * len, cy + ny * len);
  }
  ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.stroke();
}
function spikeRing(ctx, n, len, base, t, c, rot = 0, sx = 1, sy = 1) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU + rot;
    const l = len * (0.85 + 0.15 * sin(t * 3 + i * 1.7));
    const x0 = cos(th - base) * sx * 0.95, y0 = sin(th - base) * sy * 0.95;
    const x1 = cos(th + base) * sx * 0.95, y1 = sin(th + base) * sy * 0.95;
    const xt = cos(th) * (sx + l), yt = sin(th) * (sy + l);
    ctx.moveTo(x0, y0); ctx.lineTo(xt, yt); ctx.lineTo(x1, y1);
  }
  ctx.fillStyle = c; ctx.fill();
}

// ---------- species art ----------
// All drawn in unit space (cell radius = 1), facing +x. `s` = device px per unit (for LOD / line widths).
// e: entity-like { kind, seed, t (age), ang, flash, stretch, dentA, dent, col?, ... }
// opts: { queenPhase, hd } — hd forces the high-detail (boss-scale) look; it is automatic when s > 150.
// creatures beyond the microbial scale live in their own modules (one per size tier)
import T2 from './creatures/t2.js';
import T3 from './creatures/t3.js';
import T4 from './creatures/t4.js';
import T5 from './creatures/t5.js';
import T6 from './creatures/t6.js';
export const CREATURE_ART = { ...T2, ...T3, ...T4, ...T5, ...T6 };
// the helper bag creature modules draw with, for their extra drawers (tubes, dens, colony parts) at s px per unit
export function artH(s, col) {
  const lod = s < 9, kw = s > 60 ? min(2.6, sqrt(s / 60)) : 1;
  return { lw: (px) => px / s, lwb: (px) => (px * kw) / s, lod, hd: !lod && s > 150, col: col || COLORS.grazer, bodyGrad, nucGrad, glassGrad, bandGrad, cstr, rgbStr, glowSprite, blobPath, flagellum, ciliaFringe, spikeRing, dots, nucleus, highlight, mixRGB };
}

// late-journey threats reuse existing anatomy in new colours
export const ALIAS_ART = {
  lurker: { base: 'hunter', col: { body: [125, 70, 205], mem: [200, 160, 255], nuc: [50, 20, 110], glow: [160, 100, 255] } },
  spitter: { base: 'rotifer', col: { body: [150, 225, 255], mem: [235, 250, 255], nuc: [60, 140, 210], glow: [140, 220, 255] } },
};
export function drawSpecies(ctx, e, T, s, opts = {}) {
  const al = ALIAS_ART[e.kind];
  if (al) e = { ...e, kind: al.base, col: e.col || al.col };
  const kind = e.kind;
  const col = e.col || COLORS[kind] || COLORS.grazer;
  const t = T + e.seed * 10;
  const lw = (px) => px / s;
  const lod = s < 9;
  // big cells (bosses fill a third of the screen): heavier lines and extra anatomy so they never look like
  // an upscaled thumbnail
  const hd = !lod && (opts.hd || s > 150);
  const kw = s > 60 ? min(2.6, sqrt(s / 60)) : 1;
  const lwb = (px) => (px * kw) / s;
  const cc = e.col; // explicit colour override (boss variants) — tints details that are otherwise fixed
  ctx.lineJoin = 'round';
  const cr = CREATURE_ART[kind];
  if (cr) {
    const ccol = e.col || cr.col || COLORS[kind] || COLORS.grazer;
    cr.draw(ctx, e, t, s, { lw, lwb, lod, hd, col: ccol, bodyGrad, nucGrad, glassGrad, bandGrad, cstr, rgbStr, glowSprite, blobPath, flagellum, ciliaFringe, spikeRing, dots, nucleus, highlight, mixRGB }, opts);
    return;
  }
  switch (kind) {
    case 'drifter': {
      const bend = sin(t * 3) * 0.08;
      flagellum(ctx, t, 1.4, lw(1.4), cstr(col.mem), 0, 12, -1.1);
      ctx.beginPath();
      ctx.moveTo(-0.75, -0.55 + bend);
      ctx.lineTo(0.75, -0.55 - bend);
      ctx.arc(0.75, -bend, 0.55, -PI / 2, PI / 2);
      ctx.lineTo(-0.75, 0.55 + bend);
      ctx.arc(-0.75, bend, 0.55, PI / 2, PI * 1.5);
      ctx.closePath();
      ctx.save(); ctx.scale(1, 1); ctx.fillStyle = bodyGrad(ctx, col.body); ctx.fill(); ctx.restore();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lw(1.5); ctx.stroke();
      if (!lod) { ctx.beginPath(); ctx.arc(-0.2, 0, 0.18, 0, TAU); ctx.arc(0.35, 0.05, 0.12, 0, TAU); ctx.fillStyle = cstr(col.nuc); ctx.fill(); }
      break;
    }
    case 'grazer': case 'clone': {
      blobPath(ctx, { n: lod ? 12 : 20, t, seed: e.seed, amp: 0.06, stretch: e.stretch || 0, dentA: e.dentA, dent: e.dent });
      ctx.fillStyle = bodyGrad(ctx, col.body); ctx.fill();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lw(1.6); ctx.stroke();
      if (!lod) {
        dots(ctx, 5, e.seed, t, 0.35, 0.68, 0.08); ctx.fillStyle = rgbStr(col.mem, 0.55); ctx.fill();
        nucleus(ctx, col.nuc, -0.12, 0.05, 0.33, t, e.seed);
      }
      break;
    }
    case 'diatom': {
      const armor = e.armor ?? 2;
      if (armor <= 0) {
        // soft cell exposed + shell fragments
        blobPath(ctx, { n: hd ? 30 : 18, t, seed: e.seed, amp: 0.09, dentA: e.dentA, dent: e.dent });
        ctx.fillStyle = bodyGrad(ctx, cc ? mixRGB(col.body, col.nuc, 0.45) : [230, 170, 90]); ctx.fill();
        ctx.strokeStyle = cc ? rgbStr(col.mem, 0.9) : 'rgba(255,230,180,0.9)'; ctx.lineWidth = lwb(1.5); ctx.stroke();
        dots(ctx, hd ? 14 : 6, e.seed, t, 0.25, 0.65, hd ? 0.07 : 0.1, 0.4); ctx.fillStyle = cc ? rgbStr(col.nuc, 0.7) : 'rgba(160,110,40,0.7)'; ctx.fill();
        if (hd) nucleus(ctx, col.nuc, -0.08, 0.04, 0.24, t, e.seed);
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = e.seed * 3 + i * 2.1 + t * 0.3;
          ctx.moveTo(cos(a) * 1.25, sin(a) * 1.25); ctx.arc(0, 0, 1.25, a, a + 0.55);
        }
        ctx.strokeStyle = cc ? rgbStr(col.mem, 0.55) : 'rgba(255,245,220,0.55)'; ctx.lineWidth = lwb(2); ctx.stroke();
        break;
      }
      const sides = 10, rot = t * 0.15;
      ctx.save(); ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i <= sides; i++) { const a = (i / sides) * TAU; const r = 1 - (e.dent || 0) * 0.4 * exp(-((a - (e.dentA || 0)) ** 2)); i ? ctx.lineTo(cos(a) * r, sin(a) * r) : ctx.moveTo(cos(a) * r, sin(a) * r); }
      ctx.closePath();
      ctx.fillStyle = glassGrad(ctx, col.body); ctx.fill();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lwb(2); ctx.stroke();
      if (!lod) {
        const ribs = hd ? 40 : 20;
        const lineC = cc ? rgbStr(col.mem, 0.38) : 'rgba(255,250,230,0.38)';
        ctx.beginPath();
        for (let i = 0; i < ribs; i++) { const a = (i / ribs) * TAU; ctx.moveTo(cos(a) * 0.38, sin(a) * 0.38); ctx.lineTo(cos(a) * 0.88, sin(a) * 0.88); }
        ctx.moveTo(0.38, 0); ctx.arc(0, 0, 0.38, 0, TAU);
        ctx.moveTo(0.64, 0); ctx.arc(0, 0, 0.64, 0, TAU);
        if (hd) { ctx.moveTo(0.2, 0); ctx.arc(0, 0, 0.2, 0, TAU); }
        ctx.strokeStyle = lineC; ctx.lineWidth = lwb(1); ctx.stroke();
        if (hd) {
          // girdle band + areolae (pore rows) between the ribs
          ctx.beginPath();
          for (let i = 0; i <= sides; i++) { const a = (i / sides) * TAU; const r = 0.92; i ? ctx.lineTo(cos(a) * r, sin(a) * r) : ctx.moveTo(cos(a) * r, sin(a) * r); }
          ctx.strokeStyle = cc ? rgbStr(col.mem, 0.5) : 'rgba(255,250,235,0.5)'; ctx.lineWidth = lwb(1.2); ctx.stroke();
          ctx.beginPath();
          for (let k = 0; k < 3; k++) {
            const r = [0.47, 0.56, 0.76][k], ps = [0.016, 0.018, 0.022][k];
            for (let i = 0; i < ribs; i++) { const a = ((i + 0.5) / ribs) * TAU; const x = cos(a) * r, y = sin(a) * r; ctx.moveTo(x + ps, y); ctx.arc(x, y, ps, 0, TAU); }
          }
          ctx.fillStyle = cc ? rgbStr(col.mem, 0.45) : 'rgba(255,250,235,0.45)'; ctx.fill();
          // golden-brown plastids glimpsed through the glass
          ctx.globalAlpha *= 0.55;
          ctx.beginPath(); ctx.ellipse(0.1, -0.2, 0.2, 0.09, 0.6, 0, TAU); ctx.ellipse(-0.14, 0.16, 0.18, 0.08, -0.5, 0, TAU);
          ctx.fillStyle = cc ? rgbStr(col.nuc, 0.8) : 'rgba(200,150,60,0.8)'; ctx.fill();
          ctx.globalAlpha /= 0.55;
        }
        ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, TAU); ctx.fillStyle = cc ? rgbStr(col.nuc, 0.75) : 'rgba(190,140,50,0.75)'; ctx.fill();
        if (hd) { ctx.beginPath(); ctx.arc(-0.05, -0.06, 0.08, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill(); }
        // cracks
        if (armor < (e.armorMax || 2)) {
          ctx.beginPath();
          const cracks = (e.armorMax || 2) - armor;
          for (let k = 0; k < cracks * 2; k++) {
            let a = e.seed * 7 + k * 2.6, r = 0.15;
            ctx.moveTo(cos(a) * r, sin(a) * r);
            for (let j = 0; j < 4; j++) { r += 0.22; a += (j % 2 ? 0.35 : -0.3); ctx.lineTo(cos(a) * r, sin(a) * r); }
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = lwb(1.6); ctx.stroke();
        }
      }
      ctx.restore();
      break;
    }
    case 'hunter': {
      const chase = e.chasing ? 1 : 0;
      const st = 0.18 + (e.stretch || 0);
      spikeRing(ctx, 11, 0.42 + chase * 0.08, 0.13, t, rgbStr([255, 120, 130], 0.95), t * 0.2, 1 + st, 1 - st * 0.55);
      blobPath(ctx, { n: lod ? 12 : 20, t, seed: e.seed, amp: 0.05, stretch: st, dentA: e.dentA, dent: e.dent });
      ctx.fillStyle = bodyGrad(ctx, col.body); ctx.fill();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lw(1.8); ctx.stroke();
      if (!lod) {
        dots(ctx, 6, e.seed, t, 0.3, 0.7, 0.07); ctx.fillStyle = 'rgba(255,200,200,0.5)'; ctx.fill();
        nucleus(ctx, col.nuc, -0.25, 0, 0.3, t, e.seed);
        // eyespot
        ctx.beginPath(); ctx.arc(0.55, 0, 0.16, 0, TAU); ctx.fillStyle = chase ? '#ffe28a' : '#ff9a6a'; ctx.fill();
        ctx.beginPath(); ctx.arc(0.6, 0, 0.07, 0, TAU); ctx.fillStyle = '#3a0010'; ctx.fill();
      }
      break;
    }
    case 'mine': {
      // spore puffball: knobbly spikes around a speckled sac that swells when it is about to burst
      const arm = e.armK || 0, k = 1 + 0.05 * sin(t * 3) + arm * 0.28;
      ctx.save(); ctx.scale(k, k); ctx.rotate(t * 0.15);
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.moveTo(cos(a) * 0.78, sin(a) * 0.78); ctx.lineTo(cos(a) * 1.22, sin(a) * 1.22); }
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lw(2.2); ctx.lineCap = 'round'; ctx.stroke();
      if (!lod) { ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.moveTo(cos(a) * 1.22 + 0.1, sin(a) * 1.22); ctx.arc(cos(a) * 1.22, sin(a) * 1.22, 0.1, 0, TAU); } ctx.fillStyle = arm > 0 ? `rgb(255,${140 - 80 * arm | 0},70)` : cstr(col.glow); ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, 0.84, 0, TAU);
      ctx.fillStyle = bodyGrad(ctx, arm > 0 ? [255, 170 - 90 * arm | 0, 80] : col.body); ctx.fill();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lw(1.6); ctx.stroke();
      if (!lod) { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * 2.39 + (e.seed || 0), r = 0.12 + 0.5 * ((i * 0.37) % 1); ctx.moveTo(cos(a) * r + 0.1, sin(a) * r); ctx.arc(cos(a) * r, sin(a) * r, 0.1, 0, TAU); } ctx.fillStyle = cstr(col.nuc); ctx.fill(); }
      ctx.restore();
      break;
    }
    case 'phage': {
      ctx.drawImage(phageSprite(opts.queenPhase ? 1 : 0), -2.6, -2.6, 5.2, 5.2);
      break;
    }
    case 'amoeba': case 'colossus': {
      const boss = kind === 'colossus';
      const tele = e.tele || 0;
      blobPath(ctx, { n: boss ? 40 : (lod ? 14 : 26), t: t * (boss ? 0.8 : 1), seed: e.seed, amp: 0.06 + tele * 0.05, stretch: (e.stretch || 0), lobes: boss ? 5 : 3, lobeAmp: boss ? 0.16 + tele * 0.12 : 0.24, dentA: e.dentA, dent: e.dent });
      ctx.fillStyle = bodyGrad(ctx, col.body); ctx.fill();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lw(boss ? 3 : 2); ctx.stroke();
      if (boss) { ctx.save(); ctx.scale(0.9, 0.9); ctx.strokeStyle = rgbStr(col.mem, 0.25); ctx.lineWidth = lw(6); ctx.stroke(); ctx.restore(); }
      if (!lod) {
        dots(ctx, boss ? 26 : 12, e.seed, t, 0.25, 0.78, boss ? 0.035 : 0.055, 0.15); ctx.fillStyle = rgbStr(col.mem, 0.5); ctx.fill();
        dots(ctx, boss ? 8 : 3, e.seed + 3, t, 0.3, 0.7, boss ? 0.07 : 0.1, 0.1); ctx.fillStyle = 'rgba(255,240,220,0.18)'; ctx.fill();
        const pv = 0.13 + 0.05 * sin(t * 2.2);
        ctx.beginPath(); ctx.arc(0.35, -0.3, pv, 0, TAU); ctx.fillStyle = 'rgba(255,250,235,0.25)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,250,235,0.5)'; ctx.lineWidth = lw(1); ctx.stroke();
        nucleus(ctx, col.nuc, -0.1, 0.1, boss ? 0.22 : 0.26, t, e.seed);
      }
      break;
    }
    case 'ciliate': {
      const sx = 1.25, sy = 0.62;
      const tint = cc ? col.mem : [220, 255, 235];
      if (!lod) ciliaFringe(ctx, hd ? 110 : 34, t, hd ? 0.12 : 0.16, lwb(1), rgbStr(col.mem, 0.7), sx, sy, 16);
      ctx.save(); ctx.scale(sx, sy);
      blobPath(ctx, { n: hd ? 30 : 18, t, seed: e.seed, amp: 0.035, dentA: e.dentA, dent: (e.dent || 0) + 0.12, });
      ctx.restore();
      ctx.fillStyle = bodyGrad(ctx, col.body); ctx.fill();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lwb(1.5); ctx.stroke();
      if (hd) {
        // kineties: the rows of cilia bases running the length of the cell
        ctx.beginPath();
        for (let k = -3; k <= 3; k++) {
          const c = k / 3.6;
          for (let i = 0; i <= 16; i++) {
            const u = -0.96 + (i / 16) * 1.92, y = c * sy * sqrt(max(0, 1 - u * u)) * 0.92 + 0.03 * sin(u * 3 + k);
            i ? ctx.lineTo(u * sx * 0.97, y) : ctx.moveTo(u * sx * 0.97, y);
          }
        }
        ctx.strokeStyle = rgbStr(tint, 0.16); ctx.lineWidth = lwb(0.8); ctx.stroke();
        // food vacuoles cycling around the cell (cyclosis)
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = i * 0.7 - t * 0.35, x = cos(a) * 0.72 * sx * 0.8, y = sin(a) * 0.5 * sy * 0.8, r = 0.05 + 0.025 * ((i * 0.37) % 1);
          ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
        }
        ctx.fillStyle = rgbStr(mixRGB(col.body, [255, 210, 140], 0.6), 0.45); ctx.fill();
        ctx.strokeStyle = rgbStr(tint, 0.4); ctx.lineWidth = lwb(0.7); ctx.stroke();
        // contractile vacuoles: star-shaped pumps that swell and empty
        for (const [vx, ph] of [[0.72, 0], [-0.78, 2.2]]) {
          const pulse = 0.5 + 0.5 * sin(t * 2.4 + ph), r = 0.07 + 0.05 * pulse;
          ctx.beginPath();
          for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; ctx.moveTo(vx + cos(a) * r, -0.12 + sin(a) * r * 0.8); ctx.lineTo(vx + cos(a) * (r + 0.12), -0.12 + sin(a) * (r + 0.12) * 0.8); }
          ctx.strokeStyle = rgbStr(tint, 0.35 + 0.25 * (1 - pulse)); ctx.lineWidth = lwb(1); ctx.stroke();
          ctx.beginPath(); ctx.arc(vx, -0.12, r, 0, TAU); ctx.fillStyle = rgbStr([235, 250, 255], 0.22 + 0.2 * pulse); ctx.fill();
          ctx.strokeStyle = rgbStr(tint, 0.55); ctx.lineWidth = lwb(0.8); ctx.stroke();
        }
      }
      if (!lod) {
        ctx.beginPath(); ctx.moveTo(0.9, -0.15); ctx.quadraticCurveTo(0.2, 0.05, -0.1, 0.35);
        ctx.strokeStyle = rgbStr(tint, 0.6); ctx.lineWidth = lwb(1.4); ctx.stroke();
        if (hd) {
          // membranelles beating along the oral groove
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const u = i / 12, x = (1 - u) * (1 - u) * 0.9 + 2 * (1 - u) * u * 0.2 + u * u * -0.1, y = (1 - u) * (1 - u) * -0.15 + 2 * (1 - u) * u * 0.05 + u * u * 0.35;
            const w = 0.06 * sin(t * 14 - i * 0.9);
            ctx.moveTo(x, y); ctx.lineTo(x + 0.05 + w, y + 0.07);
          }
          ctx.strokeStyle = rgbStr(tint, 0.5); ctx.lineWidth = lwb(0.8); ctx.stroke();
        }
        dots(ctx, 6, e.seed, t, 0.15, 0.4, 0.06, 0.6); ctx.fillStyle = rgbStr(tint, 0.5); ctx.fill();
        ctx.save(); ctx.scale(1.6, 1); nucleus(ctx, col.nuc, -0.12, 0, 0.18, t, e.seed); ctx.restore();
        if (hd) nucleus(ctx, col.nuc, 0.18, -0.16, 0.06, t, e.seed + 1); // micronucleus
      }
      break;
    }
    case 'rotifer': {
      const spin = t * 9;
      const crown = cc ? col.mem : [255, 240, 200];
      // foot
      if (hd) {
        // telescoping, tapered foot ending in two toes
        const sw = 0.06 * sin(t * 2);
        ctx.beginPath(); ctx.moveTo(-1.08, -0.17);
        ctx.quadraticCurveTo(-1.35, -0.12 + sw, -1.56, -0.055 + sw * 1.4); ctx.lineTo(-1.56, 0.055 + sw * 1.4);
        ctx.quadraticCurveTo(-1.35, 0.12 + sw, -1.08, 0.17); ctx.closePath();
        ctx.save(); ctx.translate(-1.3, 0); ctx.scale(0.3, 0.3); ctx.fillStyle = bodyGrad(ctx, col.body, 1.3); ctx.fill(); ctx.restore();
        ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lwb(1.3); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 3; i++) { const x = -1.25 - i * 0.1, y = sw * (0.6 + i * 0.3), h = 0.12 - i * 0.02; ctx.moveTo(x + 0.02, y - h); ctx.quadraticCurveTo(x - 0.03, y, x + 0.02, y + h); }
        ctx.strokeStyle = rgbStr(col.mem, 0.55); ctx.lineWidth = lwb(1); ctx.stroke();
        ctx.beginPath();
        for (const sg of [-1, 1]) { ctx.moveTo(-1.54, sg * 0.035 + sw * 1.4); ctx.quadraticCurveTo(-1.66, sg * 0.09 + sw * 1.5, -1.76, sg * 0.18 + sw * 1.2); }
        ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lwb(2.2); ctx.lineCap = 'round'; ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(-0.85, 0); ctx.quadraticCurveTo(-1.35, 0.08 * sin(t * 2), -1.65, -0.18); ctx.moveTo(-1.35, 0.03); ctx.lineTo(-1.65, 0.2);
        ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lwb(2.2); ctx.lineCap = 'round'; ctx.stroke();
      }
      ctx.save(); ctx.scale(1.05, 0.72);
      blobPath(ctx, { n: hd ? 30 : 18, t, seed: e.seed, amp: 0.04, stretch: 0.15, dentA: e.dentA, dent: e.dent });
      ctx.restore();
      ctx.fillStyle = bodyGrad(ctx, col.body); ctx.fill();
      ctx.strokeStyle = cstr(col.mem); ctx.lineWidth = lwb(1.6); ctx.stroke();
      if (hd) {
        // lorica folds
        ctx.beginPath();
        for (let i = 0; i < 4; i++) { const x = -0.55 + i * 0.32; ctx.moveTo(x - 0.05, -0.6); ctx.quadraticCurveTo(x + 0.08, 0, x - 0.05, 0.6); }
        ctx.strokeStyle = rgbStr(col.mem, 0.2); ctx.lineWidth = lwb(1); ctx.stroke();
        // stomach with food granules, and the gut to the rear
        ctx.beginPath(); ctx.ellipse(-0.18, 0.02, 0.34, 0.26, 0, 0, TAU);
        ctx.fillStyle = rgbStr(mixRGB(col.body, col.nuc, 0.5), 0.35); ctx.fill();
        ctx.strokeStyle = rgbStr(col.mem, 0.35); ctx.lineWidth = lwb(1); ctx.stroke();
        dots(ctx, 9, e.seed + 2, t, 0.05, 0.22, 0.035, 0.3, -0.18, 1.3, 1); ctx.fillStyle = rgbStr(col.nuc, 0.6); ctx.fill();
      }
      // corona wheels
      for (const sgn of [-1, 1]) {
        const cx = 0.95, cy = sgn * 0.36;
        ctx.beginPath(); ctx.arc(cx, cy, 0.34, 0, TAU);
        if (hd) { ctx.save(); ctx.translate(cx, cy); ctx.scale(0.34, 0.34); ctx.fillStyle = bodyGrad(ctx, mixRGB(col.body, crown, 0.45), 1.5); ctx.fill(); ctx.restore(); }
        else { ctx.fillStyle = cc ? rgbStr(col.mem, 0.28) : 'rgba(255,235,190,0.28)'; ctx.fill(); }
        ctx.strokeStyle = rgbStr(crown, 0.8); ctx.lineWidth = lwb(1.2); ctx.stroke();
        if (!lod) {
          const nc = hd ? 30 : 12;
          ctx.beginPath();
          for (let i = 0; i < nc; i++) { const a = (i / nc) * TAU + spin * sgn; ctx.moveTo(cx + cos(a) * 0.34, cy + sin(a) * 0.34); ctx.lineTo(cx + cos(a + 0.4) * 0.5, cy + sin(a + 0.4) * 0.5); }
          ctx.strokeStyle = cc ? rgbStr(mixRGB(col.mem, WHITE, 0.3), 0.85) : 'rgba(255,245,210,0.85)'; ctx.lineWidth = lwb(1.2); ctx.stroke();
          if (hd) {
            ctx.beginPath();
            for (let i = 0; i < nc; i++) { const a = (i / nc) * TAU - spin * sgn * 0.6; ctx.moveTo(cx + cos(a) * 0.2, cy + sin(a) * 0.2); ctx.lineTo(cx + cos(a) * 0.3, cy + sin(a) * 0.3); }
            ctx.strokeStyle = rgbStr(crown, 0.4); ctx.lineWidth = lwb(0.8); ctx.stroke();
          }
        }
      }
      if (!lod) {
        if (hd) {
          // mastax: the grinding jaw, chewing
          const ch = 0.5 + 0.5 * sin(t * 6);
          ctx.beginPath(); ctx.ellipse(0.3, 0, 0.2, 0.17, 0, 0, TAU);
          ctx.fillStyle = cc ? rgbStr(col.nuc, 0.6) : 'rgba(150,80,30,0.6)'; ctx.fill();
          ctx.beginPath();
          for (const sg of [-1, 1]) { ctx.moveTo(0.18, sg * 0.1); ctx.quadraticCurveTo(0.34, sg * (0.03 + 0.06 * ch), 0.44, sg * 0.01 * ch); }
          ctx.strokeStyle = rgbStr(crown, 0.85); ctx.lineWidth = lwb(1.4); ctx.stroke();
          // eyespot
          ctx.beginPath(); ctx.arc(0.66, 0, 0.05, 0, TAU); ctx.fillStyle = 'rgba(200,40,40,0.9)'; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(0.3, 0, 0.17, 0, TAU); ctx.fillStyle = cc ? rgbStr(col.nuc, 0.7) : 'rgba(150,80,30,0.7)'; ctx.fill();
        }
        dots(ctx, 5, e.seed, t, 0.2, 0.55, 0.07); ctx.fillStyle = cc ? rgbStr(col.mem, 0.45) : 'rgba(255,230,180,0.45)'; ctx.fill();
      }
      break;
    }
    case 'volvox': {
      ctx.save(); ctx.rotate(t * 0.12);
      ctx.beginPath(); ctx.arc(0, 0, 1 - (e.dent || 0) * 0.1, 0, TAU);
      ctx.fillStyle = bodyGrad(ctx, col.body, 0.85); ctx.fill();
      ctx.strokeStyle = rgbStr(col.mem, 0.55); ctx.lineWidth = lwb(1.2); ctx.stroke();
      if (!lod) {
        const rimC = cc ? rgbStr(col.mem, 0.85) : 'rgba(200,255,190,0.85)';
        const kidC = cc ? col.nuc : [40, 150, 60];
        if (hd) {
          // somatic cells on the far side of the sphere, faint
          dots(ctx, 46, e.seed + 1, 0, 0.1, 0.84, 0.022, 0); ctx.fillStyle = rgbStr(col.mem, 0.22); ctx.fill();
          // each rim cell beats a pair of flagella
          const n = 84;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const a = (i / n) * TAU, w = 0.25 * sin(t * 8 + i * 0.9);
            const x = cos(a) * 0.97, y = sin(a) * 0.97;
            ctx.moveTo(x, y); ctx.lineTo(cos(a + w * 0.15) * 1.06, sin(a + w * 0.15) * 1.06);
          }
          ctx.strokeStyle = rgbStr(col.mem, 0.45); ctx.lineWidth = lwb(0.8); ctx.stroke();
          ctx.beginPath();
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const x = cos(a) * 0.93, y = sin(a) * 0.93; ctx.moveTo(x + 0.022, y); ctx.arc(x, y, 0.022, 0, TAU); }
          ctx.fillStyle = rimC; ctx.fill();
        } else {
          const n = 36; ctx.beginPath();
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; const x = cos(a) * 0.93, y = sin(a) * 0.93; ctx.moveTo(x + 0.035, y); ctx.arc(x, y, 0.035, 0, TAU); }
          ctx.fillStyle = rimC; ctx.fill();
        }
        const kids = e.kids || 5;
        for (let i = 0; i < kids; i++) {
          const a = i * 2.4 + e.seed, d = 0.48 + 0.12 * sin(i * 1.3);
          const x = cos(a) * d, y = sin(a) * d, r = 0.2 + 0.04 * (i % 3);
          ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
          ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
          ctx.fillStyle = nucGrad(ctx, kidC); ctx.fill();
          if (hd) {
            // daughter colonies are little volvoxes themselves
            ctx.beginPath();
            for (let k = 0; k < 14; k++) { const b = (k / 14) * TAU + i; const px = cos(b) * 0.8, py = sin(b) * 0.8; ctx.moveTo(px + 0.09, py); ctx.arc(px, py, 0.09, 0, TAU); }
            ctx.fillStyle = rgbStr(col.mem, 0.55); ctx.fill();
            ctx.beginPath(); ctx.arc(-0.25, -0.3, 0.28, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.restore();
      break;
    }
    case 'queen': {
      drawQueen(ctx, e, t, s, lw);
      break;
    }
    case 'siphonbell': {
      // a single bell (used by portraits and segments)
      ctx.beginPath();
      ctx.moveTo(-0.9, -0.75); ctx.quadraticCurveTo(0.2, -1.2, 1.0, -0.2); ctx.quadraticCurveTo(1.15, 0, 1.0, 0.2);
      ctx.quadraticCurveTo(0.2, 1.2, -0.9, 0.75); ctx.quadraticCurveTo(-0.55, 0, -0.9, -0.75);
      ctx.fillStyle = bodyGrad(ctx, COLORS.siphonophore.body, 0.9); ctx.fill();
      ctx.strokeStyle = cstr(COLORS.siphonophore.mem); ctx.lineWidth = lw(1.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.5, -0.4); ctx.quadraticCurveTo(0.3, -0.5, 0.65, 0); ctx.quadraticCurveTo(0.3, 0.5, -0.5, 0.4);
      ctx.strokeStyle = 'rgba(255,220,250,0.45)'; ctx.lineWidth = lw(1); ctx.stroke();
      break;
    }
  }
  if (!lod && kind !== 'phage' && kind !== 'queen') highlight(ctx, e.ang || 0);
}

function drawQueen(ctx, e, t, s, lw) {
  const phase = e.phase | 0;
  const ph2 = phase >= 2;
  const cc = e.col;
  // colour override (e.g. the Progenitor): tint, dark facet base, edge light and core glow all follow it
  let tint, dark, edge, core;
  if (cc) {
    const heat = ph2 ? 0.2 + 0.12 * (phase - 2) : 0;
    tint = heat ? mixRGB(cc.body, [255, 110, 90], heat) : cc.body;
    dark = [cc.nuc[0] * 0.35, cc.nuc[1] * 0.32, cc.nuc[2] * 0.4];
    edge = cc.mem;
    core = heat ? mixRGB(cc.glow, [255, 120, 90], heat) : cc.glow;
  } else {
    tint = ph2 ? [255, 110, 170] : [150, 185, 255];
    dark = [40, 50, 120];
    edge = [230, 240, 255];
    core = ph2 ? [255, 90, 150] : [140, 170, 255];
  }
  const tele = e.tele || 0;
  // tail sheath + legs (behind, opposite of facing)
  ctx.save();
  ctx.beginPath(); ctx.rect(-2.2, -0.16, 1.4, 0.32);
  ctx.fillStyle = rgbStr(tint, 0.35); ctx.fill(); ctx.strokeStyle = rgbStr(edge, 0.6); ctx.lineWidth = lw(2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const x = -2.05 + i * 0.22; ctx.moveTo(x, -0.16); ctx.lineTo(x, 0.16); }
  ctx.strokeStyle = rgbStr(edge, 0.35); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); ctx.rect(-2.45, -0.42, 0.25, 0.84); ctx.fillStyle = rgbStr(tint, 0.5); ctx.fill(); ctx.strokeStyle = rgbStr(edge, 0.6); ctx.lineWidth = lw(2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const sg = i < 3 ? -1 : 1, k = i % 3;
    const sw = sin(t * 2.5 + i) * 0.12;
    ctx.moveTo(-2.33, sg * 0.4); ctx.lineTo(-2.0 + k * 0.25, sg * (1.0 + sw)); ctx.lineTo(-2.7 + k * 0.15, sg * (1.35 + sw));
  }
  ctx.strokeStyle = cc ? rgbStr(edge, 0.75) : rgbStr([220, 230, 255], 0.75); ctx.lineWidth = lw(2.4); ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
  // crystalline head: hexagon with triangular facets
  const rot = t * 0.25;
  const scale = 1 + tele * 0.08 + 0.02 * sin(t * 3);
  ctx.save(); ctx.scale(scale, scale);
  for (let i = 0; i < 6; i++) {
    const a0 = rot + (i / 6) * TAU, a1 = rot + ((i + 1) / 6) * TAU;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cos(a0), sin(a0)); ctx.lineTo(cos(a1), sin(a1)); ctx.closePath();
    const lit = 0.5 + 0.5 * cos(a0 + 0.5 - (-2.3));
    const c = mixRGB(dark, tint, 0.35 + lit * 0.55);
    if (ph2 && !cc) mixRGB(c, [255, 60, 120], 0.25, c);
    ctx.fillStyle = rgbStr(c, 0.82); ctx.fill();
  }
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = rot + (i / 6) * TAU; ctx.moveTo(0, 0); ctx.lineTo(cos(a), sin(a)); }
  for (let i = 0; i <= 6; i++) { const a = rot + (i / 6) * TAU; i ? ctx.lineTo(cos(a), sin(a)) : ctx.moveTo(cos(a), sin(a)); }
  ctx.strokeStyle = cc ? rgbStr(mixRGB(edge, WHITE, 0.4), 0.85) : 'rgba(235,245,255,0.85)'; ctx.lineWidth = lw(2.4); ctx.stroke();
  // inner hexagon
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) { const a = -rot * 1.6 + (i / 6) * TAU + 0.52; const r = 0.5; i ? ctx.lineTo(cos(a) * r, sin(a) * r) : ctx.moveTo(cos(a) * r, sin(a) * r); }
  ctx.strokeStyle = rgbStr([255, 255, 255], 0.35); ctx.lineWidth = lw(1.5); ctx.stroke();
  // core (DNA coil)
  ctx.globalCompositeOperation = 'lighter';
  const g = glowSprite(core);
  const cs = 1.2 + tele * 0.6 + 0.08 * sin(t * 4);
  ctx.drawImage(g, -cs, -cs, cs * 2, cs * 2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) { const u = i / 20 * TAU * 1.5; const r = 0.08 + i * 0.012; i ? ctx.lineTo(cos(u + t) * r, sin(u + t) * r) : ctx.moveTo(cos(u + t) * r, sin(u + t) * r); }
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = lw(1.6); ctx.stroke();
  ctx.restore();
}

// phage sprite (pre-rendered)
const phageSprites = [];
function phageSprite(v) {
  if (phageSprites[v]) return phageSprites[v];
  const S = 96, c = mkCanvas(S, S), g = c.getContext('2d');
  const col = v ? [255, 120, 180] : COLORS.phage.body;
  g.translate(S / 2, S / 2); const u = S / 5.2; // 1 unit
  g.lineCap = 'round'; g.lineJoin = 'round';
  // glow
  g.drawImage(glowSprite(col), -u * 2.2, -u * 2.2, u * 4.4, u * 4.4);
  // tail & legs (pointing -x)
  g.strokeStyle = rgbStr([240, 225, 255], 0.9); g.lineWidth = u * 0.22;
  g.beginPath(); g.moveTo(-u * 0.7, 0); g.lineTo(-u * 1.7, 0); g.stroke();
  g.lineWidth = u * 0.13;
  g.beginPath();
  for (const sg of [-1, 1]) { g.moveTo(-u * 1.7, 0); g.lineTo(-u * 2.0, sg * u * 0.7); g.lineTo(-u * 2.45, sg * u * 0.95); g.moveTo(-u * 1.7, 0); g.lineTo(-u * 2.25, sg * u * 0.3); }
  g.stroke();
  // head: hexagon
  g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = (i / 6) * TAU + PI / 6; const x = cos(a) * u, y = sin(a) * u; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  const gr = g.createLinearGradient(-u, -u, u, u);
  gr.addColorStop(0, rgbStr([255, 245, 255], 0.95)); gr.addColorStop(0.5, rgbStr(col, 0.9)); gr.addColorStop(1, rgbStr([col[0] * 0.5, col[1] * 0.4, col[2] * 0.6], 0.95));
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,240,255,0.95)'; g.lineWidth = u * 0.12; g.stroke();
  g.beginPath(); g.moveTo(0, 0);
  for (let i = 0; i < 6; i += 2) { const a = (i / 6) * TAU + PI / 6; g.moveTo(0, 0); g.lineTo(cos(a) * u, sin(a) * u); }
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = u * 0.07; g.stroke();
  phageSprites[v] = c;
  return c;
}

// =====================================================================================================
// ---------- the player ----------
// Six evolution stages, roughly one per ten levels:
//   1 single cell · 2 colony (a choanoflagellate rosette) · 3 flatworm · 4 jawless fish · 5 jawed fish · 6 pufferfish
// Stages 1–2 are cells drawn around an ellipse geometry `G`. Stages 3–5 are animals seen from above,
// drawn around a bending spine (`AN`, below): organs and traits are placed in the animal's rest frame
// (+x = head, y = across the body, in player radii) and skinned onto the swimming body by skin(x, y).
// =====================================================================================================
const SIG_C = [185, 170, 255], NERVE_C = [150, 215, 255], GILL_C = [255, 105, 135], EYE_GLOW = [150, 255, 235];
const SHELL_C = [246, 214, 158], HIDE_C = [60, 110, 140], HIDE_EDGE = [205, 240, 255];
const MUSCLE_C = [255, 100, 118], POLYP_C = [255, 186, 212];
const GUT_C = [255, 168, 112], TOX_C = [150, 238, 90], NOVA_C = [205, 135, 255], MITO_C = [255, 150, 80];
const ALGA_C = [95, 225, 110], OSMO_C = [140, 210, 255], CYST_C = [255, 208, 128], LYSO_C = [255, 100, 135];
const LUM_C = [150, 255, 230], DASH_C = [255, 230, 150], BONE_C = [240, 234, 210];
const NOMUT = {};

const G = { st: 1, cx: 0, ax: 1, ay: 1 };
const SATS = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, a: 0, r: 0.4 }));
const RIM = [0, 0, 0, 0];

function clampStage(s) { s = s | 0; return s < 1 ? 1 : s > 6 ? 6 : s; }

// Swim phase, integrated over time so a changing speed never makes the tail jump. Rate = 6 + 6·speedN rad/s.
// Stateless callers (portraits, fresh objects) get exactly T·rate.
function swimPhase(p, T) {
  const f = 6 + 6 * (p.speedN || 0);
  if (!Object.isExtensible(p)) return T * f;
  const dt = T - p._swT;
  if (dt >= 0 && dt < 0.25) p._swPh += dt * f; else p._swPh = T * f;
  p._swT = T;
  return p._swPh;
}

// ----- cells (stages 1–2) -----
// point + outward normal on the cell's outline at polar angle th → RIM [x, y, nx, ny]
function rim(th, out = RIM) {
  const c = cos(th), s = sin(th);
  out[0] = G.cx + G.ax * c; out[1] = G.ay * s;
  const nx = c / G.ax, ny = s / G.ay, l = Math.hypot(nx, ny) || 1;
  out[2] = nx / l; out[3] = ny / l;
  return out;
}
const SAT_A = [PI - 0.62, PI + 0.62, PI - 1.6, PI + 1.6], SAT_R = [0.45, 0.45, 0.37, 0.37];
function setupCell(stage, st, t) {
  G.st = stage;
  const sx = 1 + st, sy = 1 - st * 0.55;
  G.cx = 0; G.ax = sx; G.ay = sy;
  if (stage === 2) {
    for (let i = 0; i < 4; i++) {
      const q = SATS[i], sg = i & 1 ? -1 : 1;
      q.r = SAT_R[i] * (1 + 0.07 * sin(t * 2.1 + i * 1.7));
      q.a = SAT_A[i] + 0.1 * sin(t * 0.45 + i * 2.3) + sg * st * 1.1;
      const d = 1 + q.r * 0.88 + 0.025 * sin(t * 1.3 + i);
      q.x = cos(q.a) * d * sx; q.y = sin(q.a) * d * sy;
    }
  }
}

// ----- colony (stage 2): a rosette of collared flagellate cells -----
function drawColony(ctx, p, m, t, lw, body, mem, nucC, s) {
  const sx = G.ax, sy = G.ay;
  // each member cell beats its own flagellum out of a collar of microvilli (a choanoflagellate rosette)
  if (s > 14) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const q = SATS[i], ux = cos(q.a), uy = sin(q.a), vx = -uy, vy = ux, r = q.r;
      const bx = q.x + ux * r * 0.92, by = q.y + uy * r * 0.92, L = 0.55 + 0.1 * (i >> 1);
      ctx.moveTo(bx, by);
      for (let k = 1; k <= 8; k++) {
        const u = k / 8, w = sin(u * 5 - t * 9 + i * 1.7) * 0.13 * L * u;
        ctx.lineTo(bx + ux * u * L + vx * w, by + uy * u * L + vy * w);
      }
    }
    ctx.strokeStyle = rgbStr(mem, 0.55); ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke();
    if (s > 30) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const q = SATS[i], ux = cos(q.a), uy = sin(q.a), vx = -uy, vy = ux, r = q.r;
        const bx = q.x + ux * r * 0.86, by = q.y + uy * r * 0.86;
        for (let k = -3; k <= 3; k++) {
          const sp = k * 0.075 * r / 0.4, h = 0.2 * r / 0.4 * (1 - 0.08 * abs(k));
          ctx.moveTo(bx + vx * sp * 0.6, by + vy * sp * 0.6); ctx.lineTo(bx + ux * h + vx * sp * 1.25, by + uy * h + vy * sp * 1.25);
        }
      }
      ctx.strokeStyle = rgbStr(mem, 0.42); ctx.lineWidth = lw(0.8); ctx.stroke();
    }
  }
  // soft membrane bridges: concave webbing between the main cell and each satellite. The fill follows both
  // cell outlines (arcs) so it never shows through the translucent cells; only the two fillets are stroked.
  const d1 = 0.38, d2 = 0.95;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const q = SATS[i];
      const ux = cos(q.a), uy = sin(q.a), vx = -uy, vy = ux, rr = q.r * 0.96;
      const p1x = cos(q.a + d1) * 0.97 * sx, p1y = sin(q.a + d1) * 0.97 * sy;
      const p2x = cos(q.a - d1) * 0.97 * sx, p2y = sin(q.a - d1) * 0.97 * sy;
      const a1 = q.a + PI - d2, a2 = q.a + PI + d2;
      const q1x = q.x + rr * cos(a1), q1y = q.y + rr * sin(a1), q2x = q.x + rr * cos(a2), q2y = q.y + rr * sin(a2);
      const dm = Math.hypot(q.x, q.y), mid = (1 + dm - q.r) / 2, wm = q.r * (0.42 + 0.05 * sin(t * 1.7 + i));
      const c1x = ux * mid + vx * wm, c1y = uy * mid + vy * wm, c2x = ux * mid - vx * wm, c2y = uy * mid - vy * wm;
      if (pass === 0) {
        ctx.moveTo(p1x, p1y); ctx.quadraticCurveTo(c1x, c1y, q1x, q1y);
        ctx.arc(q.x, q.y, rr, a1, a2);
        ctx.quadraticCurveTo(c2x, c2y, p2x, p2y);
        ctx.ellipse(0, 0, 0.97 * sx, 0.97 * sy, 0, q.a - d1, q.a + d1);
        ctx.closePath();
      } else {
        ctx.moveTo(p1x, p1y); ctx.quadraticCurveTo(c1x, c1y, q1x, q1y);
        ctx.moveTo(q2x, q2y); ctx.quadraticCurveTo(c2x, c2y, p2x, p2y);
      }
    }
    if (pass === 0) { ctx.fillStyle = rgbStr(body, 0.5); ctx.fill(); }
    else { ctx.strokeStyle = rgbStr(mem, 0.8); ctx.lineWidth = lw(1.3); ctx.stroke(); }
  }
  // satellite cells
  for (let i = 0; i < 4; i++) {
    const q = SATS[i];
    ctx.save(); ctx.translate(q.x, q.y);
    if (m.cilia) ciliaFringe(ctx, 14 + 2 * m.cilia, t + i * 0.7, 0.08 + 0.02 * m.cilia, lw(1.1), rgbStr(mem, 0.7), q.r, q.r, 14);
    ctx.save(); ctx.scale(q.r, q.r);
    blobPath(ctx, { n: 16, t: t * 1.2, seed: p.seed + i * 1.9, amp: 0.07 });
    ctx.fillStyle = bodyGrad(ctx, body); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgbStr(mem, 0.92); ctx.lineWidth = lw(1.4 + (m.membrane || 0) * 0.4); ctx.stroke();
    ctx.scale(q.r, q.r);
    dots(ctx, 3, p.seed + i, t, 0.42, 0.62, 0.08); ctx.fillStyle = rgbStr(mem, 0.5); ctx.fill();
    nucleus(ctx, nucC, cos(q.a) * 0.14, sin(q.a) * 0.14, 0.36, t, p.seed + i);
    ctx.restore();
  }
}

// ----- colony traits (also reused by the animals) -----
function drawSignal(ctx, lv, t, lw, A0, cx, ax, ay) {
  const n = 2 + (lv >= 2) + (lv >= 4), reach = 0.85 + 0.12 * lv;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    let f = t * 0.38 + i / n; f -= Math.floor(f);
    const d = 0.1 + f * reach, a = (1 - f) * (1 - f) * min(1, f * 5) * (0.32 + 0.08 * lv);
    ctx.beginPath(); ctx.ellipse(cx, 0, ax + d, ay + d, 0, 0, TAU);
    ctx.strokeStyle = rgbStr(SIG_C, a); ctx.lineWidth = lw(1 + 3 * (1 - f)); ctx.stroke();
  }
  // drifting chemical motes
  const g = glowSprite(SIG_C, 1);
  for (let i = 0; i < 3 + lv; i++) {
    let f = t * 0.27 + i * 0.381; f -= Math.floor(f);
    const a = i * 2.4 + 0.3 * sin(t * 0.5 + i), d = 0.15 + f * reach;
    const x = cx + cos(a) * (ax + d), y = sin(a) * (ay + d), sz = 0.09 + 0.02 * lv;
    ctx.globalAlpha = A0 * (1 - f) * min(1, f * 4) * 0.8;
    ctx.drawImage(g, x - sz, y - sz, sz * 2, sz * 2);
  }
  ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
}

// polyp roots: [x, y, nx, ny, heading, index] × n in POLYP_BUF, then renderPolyps draws them
const POLYP_BUF = new Float32Array(6 * 12), SAT_ORDER = [2, 3, 0, 1];
function drawPolyps(ctx, lv, t, lw, mem) {
  const n = min(10, 2 + lv), aMax = 2.75;
  const P = POLYP_BUF;
  for (let i = 0; i < n; i++) {
    const sway = 0.38 * sin(t * 2.1 + i * 1.9), o = i * 6;
    if (G.st === 2 && i >= 2) {
      // the colony grows extra polyps on its satellite cells (outer side)
      const q = SATS[SAT_ORDER[(i - 2) & 3]], nx = cos(q.a), ny = sin(q.a);
      P[o] = q.x + nx * q.r * 0.92; P[o + 1] = q.y + ny * q.r * 0.92; P[o + 2] = nx; P[o + 3] = ny; P[o + 4] = q.a + sway; P[o + 5] = i;
      continue;
    }
    const sd = i & 1 ? 1 : -1, k = i >> 1, ns = G.st === 2 ? 1 : sd > 0 ? n >> 1 : (n + 1) >> 1;
    const th = G.st === 2 ? sd * 0.95 : sd * (0.85 + (ns > 1 ? (k / (ns - 1)) * (aMax - 0.85) : (aMax - 0.85) * 0.5));
    rim(th);
    P[o] = RIM[0]; P[o + 1] = RIM[1]; P[o + 2] = RIM[2]; P[o + 3] = RIM[3]; P[o + 4] = Math.atan2(RIM[3], RIM[2]) + sway; P[o + 5] = i;
  }
  renderPolyps(ctx, n, lv, t, lw, mem);
}
function renderPolyps(ctx, n, lv, t, lw, mem) {
  const Ls = 0.2 + 0.035 * lv, br = 0.06 + 0.008 * lv, tl = 0.1 + 0.012 * lv, P = POLYP_BUF;
  for (let pass = 0; pass < 3; pass++) {
    ctx.beginPath();
    for (let j = 0; j < n * 6; j += 6) {
      const x = P[j], y = P[j + 1], nx = P[j + 2], ny = P[j + 3], na = P[j + 4], i = P[j + 5];
      const tx = x + cos(na) * Ls, ty = y + sin(na) * Ls;
      if (pass === 0) { ctx.moveTo(x - nx * 0.05, y - ny * 0.05); ctx.quadraticCurveTo(x + nx * Ls * 0.55, y + ny * Ls * 0.55, tx, ty); }
      else if (pass === 1) {
        for (let k = 0; k < 5; k++) {
          const a = na + (k - 2) * 0.52, wv = 0.35 * sin(t * 3.2 + i + k * 1.3);
          const sx = tx + cos(a) * br * 0.7, sy = ty + sin(a) * br * 0.7;
          const mx = sx + cos(a + wv) * tl * 0.55, my = sy + sin(a + wv) * tl * 0.55;
          ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, mx + cos(a + wv * 2) * tl * 0.5, my + sin(a + wv * 2) * tl * 0.5);
        }
      } else { ctx.moveTo(tx + br, ty); ctx.arc(tx, ty, br, 0, TAU); }
    }
    if (pass === 0) { ctx.strokeStyle = rgbStr(mem, 0.85); ctx.lineWidth = lw(2.4); ctx.lineCap = 'round'; ctx.stroke(); }
    else if (pass === 1) { ctx.strokeStyle = 'rgba(255,222,238,0.92)'; ctx.lineWidth = lw(1.1); ctx.stroke(); }
    else { ctx.fillStyle = rgbStr(POLYP_C, 0.92); ctx.fill(); ctx.strokeStyle = 'rgba(255,235,245,0.8)'; ctx.lineWidth = lw(0.8); ctx.stroke(); }
  }
}

function guardPlate(ctx, x, y, nx, ny, sz) {
  const tx = -ny, ty = nx, h = sz * 0.62;
  for (let k = 0; k < 6; k++) {
    const a = (k * PI) / 3, u = cos(a) * sz, v = sin(a) * h;
    const px = x + tx * u + nx * v, py = y + ty * u + ny * v;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function drawGuard(ctx, lv, t, lw, A0) {
  const n = 5 + 2 * lv, sz = 0.13 + 0.025 * lv;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      rim((i / n) * TAU + 0.2);
      const x = RIM[0] + RIM[2] * 0.015, y = RIM[1] + RIM[3] * 0.015, nx = RIM[2], ny = RIM[3];
      if (pass === 0) guardPlate(ctx, x, y, nx, ny, sz);
      else { const h = sz * 0.62 * 0.42; ctx.moveTo(x - ny * sz * 0.45 + nx * h, y + nx * sz * 0.45 + ny * h); ctx.lineTo(x + ny * sz * 0.2 + nx * h, y - nx * sz * 0.2 + ny * h); }
    }
    if (G.st === 2) for (const q of SATS) for (const k of [-0.85, 0, 0.85]) {
      const a = q.a + k, nx = cos(a), ny = sin(a), x = q.x + nx * q.r, y = q.y + ny * q.r, s2 = sz * 0.72;
      if (pass === 0) guardPlate(ctx, x, y, nx, ny, s2);
      else { const h = s2 * 0.26; ctx.moveTo(x - ny * s2 * 0.45 + nx * h, y + nx * s2 * 0.45 + ny * h); ctx.lineTo(x + ny * s2 * 0.2 + nx * h, y - nx * s2 * 0.2 + ny * h); }
    }
    if (pass === 0) {
      ctx.fillStyle = rgbStr([200, 245, 255], 0.24 + 0.05 * lv); ctx.fill();
      ctx.strokeStyle = 'rgba(235,255,255,0.9)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    } else { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke(); }
  }
  // a glint travelling around the armour
  let f = t * 0.6; f -= Math.floor(f);
  rim((Math.floor(f * n) / n) * TAU + 0.2);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = A0 * sin(f * n * PI % PI) * 0.9;
  const gs = sz * 0.9;
  ctx.drawImage(glowSprite([220, 250, 255], 1), RIM[0] - gs, RIM[1] - gs, gs * 2, gs * 2);
  ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
}

// ===================================== animals (stages 3–6) =====================================
// Rest-frame body plans (player radii): head tip xf, tail end xr, half-width profile w(x).
const F3 = { xf: 1.12, xr: -1.2 }, F4 = { xf: 1.16, xr: -1.3 }, F5 = { xf: 1.24, xr: -1.05 }, F6 = { xf: 1.1, xr: -0.84 };
// pufferfish: a blunt, round head (widest at F6M), tapering like a tadpole to a short caudal peduncle.
// Inflated (p.puffK → 1) it becomes a ball of radius PUFF_R, centred on the collision circle (see skin()).
const F6M = 0.26, PUFF_R = 1.55;
function w6(x) {
  if (x >= F6M) {
    const q = (x - F6M) / (F6.xf - F6M); if (q >= 1) return 0;
    const w = 0.75 * Math.pow(1 - Math.pow(q, 2.6), 0.385);
    if (!AN.chk) return w;
    const d = (x - 0.93) / 0.1; return w + AN.chk * exp(-d * d); // Jaw Muscles: cheeks bulging behind the beak
  }
  const q = min(1, (F6M - x) / (F6M - F6.xr));
  return 0.085 + 0.665 * Math.pow(1 - Math.pow(q, 1.9), 1.25);
}
// flatworm: broad leaf, a neck, then a spade-shaped head with two ear-like auricles
function w3(x) {
  const u = (x - F3.xr) / (F3.xf - F3.xr);
  if (u <= 0 || u >= 1) return 0;
  const w = u < 0.45 ? 0.5 * Math.pow(sin((PI / 2) * (u / 0.45)), 0.7) : 0.5 * Math.pow(cos((PI / 2) * ((u - 0.45) / 0.55)), 0.5);
  const dn = (u - 0.79) / 0.055, da = (u - 0.872) / 0.042;
  return w * (1 - 0.25 * exp(-dn * dn)) + AN.aur * exp(-da * da);
}
function aurB(x) { const da = ((x - F3.xr) / (F3.xf - F3.xr) - 0.872) / 0.042; return AN.aur * exp(-da * da); }
// jawless fish: a round head with a gill basket, then a long eel body tapering to the tail
function w4(x) {
  const u = (x - F4.xr) / (F4.xf - F4.xr);
  if (u <= 0 || u >= 1) return 0;
  if (u > 0.8) { const q = (u - 0.8) / 0.2; return 0.33 * Math.pow(1 - q * q, 0.55); }
  const g = (u - 0.71) / 0.07;
  return (0.3 + 0.03 * min(1, max(0, (u - 0.55) / 0.25))) * sqrt(1 - Math.pow(1 - u / 0.8, 2.4)) + 0.014 * exp(-g * g);
}
// jawed fish: streamlined, pointed snout, narrow caudal peduncle
function w5(x) {
  if (x >= 0.24) { const q = (x - 0.24) / 1.0; return q >= 1 ? 0 : 0.48 * Math.pow(1 - q * q, 0.8); }
  const q = min(1, (0.24 - x) / 1.29);
  return 0.085 + 0.395 * (1 - Math.pow(q, 1.6));
}

const NSP = 28;
const SPX = new Float32Array(NSP), SPY = new Float32Array(NSP), SPA = new Float32Array(NSP), SPW = new Float32Array(NSP);
const SK = [0, 0, 0], EP = [0, 0, 0, 0]; // skin() → [x, y, heading]; edge() → [x, y, nx, ny]
const AN = {
  st: 3, W: w3, x0: 1.2, dx: 0.1, xf: 1, xr: -1, tip: -1, cx: 0, hl: 1, hw: 0.5, os: null,
  aur: 0.13, rip: 0.03, ripK: 15, t: 0, ph: 0, sp: 0, s: 1, lw: null, fine: false, lo: false, A0: 1,
  p: null, m: NOMUT, body: null, mem: null, dark: [0, 0, 0], pale: [0, 0, 0], ang: 0,
  pk: 0, pxf: 1, pxr: -1, chk: 0, // pufferfish: inflation 0…1, the current (inflated) nose / tail ends, cheek bulge
};
// the pufferfish's current half-width at skinned x (the rest profile blended toward the balloon)
function w6cur(x) {
  const u = (x - AN.pxr) / (AN.pxf - AN.pxr);
  if (u <= 0 || u >= 1) return 0;
  return (1 - AN.pk) * w6(F6.xr + u * (F6.xf - F6.xr)) + AN.pk * PUFF_R * 2 * sqrt(u * (1 - u));
}
// stage 3: the margin ruffles in a wave that runs head → tail as the worm glides
function ripF(x) {
  if (AN.st !== 3 || x > 0.64 || x < -1.1) return 1;
  return 1 + AN.rip * sin(PI * (x + 1.1) / 1.74) * sin(AN.ripK * x + AN.t * 5.5);
}
const wEff = (x) => AN.W(x) * ripF(x);

function setupAnimal(p, m, stage, t, ph) {
  AN.st = stage; AN.t = t; AN.ph = ph; AN.p = p; AN.m = m; AN.pk = 0; AN.chk = 0;
  const sp = AN.sp = min(1.5, p.speedN || 0);
  let f, x1;
  if (stage === 6) {
    f = F6; AN.W = w6; AN.hw = 0.75;
    const pk = AN.pk = min(1, max(0, p.puffK || 0));
    AN.chk = m.jaws ? (0.05 + 0.026 * min(3, m.jaws)) * (1 - 0.6 * pk) : 0;
    AN.pxf = f.xf + (PUFF_R - f.xf) * pk; AN.pxr = f.xr - (PUFF_R + f.xr) * pk;
    AN.tip = f.xr - 0.03; x1 = AN.pxr - 0.55;
  } else if (stage === 3) {
    f = F3; AN.W = w3; x1 = f.xr - 0.32; AN.hw = 0.5; AN.tip = f.xr;
    AN.aur = 0.11 + 0.05 * (m.pseudopod || 0);
    AN.rip = 0.042 + 0.03 * (m.pseudopod || 0) + 0.012 * (m.cilia || 0); AN.ripK = m.pseudopod ? 10 : 15;
  } else if (stage === 4) { f = F4; AN.W = w4; x1 = f.xr - 0.78; AN.hw = 0.33; AN.tip = f.xr; }
  else { f = F5; AN.W = w5; x1 = f.xr - 0.08; AN.hw = 0.48; AN.tip = f.xr - 0.03; }
  AN.xf = f.xf; AN.xr = f.xr; AN.cx = (f.xf + f.xr) / 2; AN.hl = (f.xf - f.xr) / 2;
  // (the pufferfish's spine runs along its current, possibly inflated, length and on past the beak)
  const x0 = AN.x0 = stage === 6 ? AN.pxf + 0.3 : f.xf + 0.04, n = NSP, dx = AN.dx = (x0 - x1) / (n - 1);
  // heading along the body: a wave travelling head → tail, growing towards the tail
  let ws = 0, wt = 0;
  for (let i = 0; i < n; i++) {
    const x = x0 - i * dx;
    let th;
    if (stage === 3) {
      // gliding on cilia: a lazy body wave, and the head scanning side to side
      const hd = min(1, max(0, (x - 0.15) / 0.9));
      th = (0.07 + 0.04 * sp) * sin(ph * 0.42 + 1.8 * x) + 0.22 * (1 - 0.5 * min(1, sp)) * sin(t * 0.8 + 0.6) * hd * hd;
    } else if (stage === 4) {
      // anguilliform: the whole body undulates
      const q = min(1.3, (x0 - x) / (x0 - f.xr));
      th = (0.4 + 0.16 * sp) * (0.16 + 0.84 * Math.pow(q, 1.4)) * sin(ph + 3.4 * x);
    } else if (stage === 6) {
      // a pufferfish rows with its fins: the body barely bends, only the tail sways a little (none when inflated)
      const q = max(0, (0.15 - x) / 1.0);
      th = (0.06 + 0.05 * sp) * (1 - 0.9 * AN.pk) * (0.08 + Math.pow(q, 1.8)) * sin(ph * 0.75 + 2.2 * x);
    } else {
      // carangiform: a stiff front, the tail sweeps
      const q = max(0, (0.45 - x) / 1.45);
      th = (0.3 + 0.14 * sp) * (0.05 + Math.pow(q, 1.6)) * sin(ph + 2.5 * x);
    }
    const w = (stage === 6 ? w6cur(x) : AN.W(x)) + 0.03;
    SPA[i] = th; SPW[i] = w; ws += w; wt += w * th;
  }
  // keep the body's mean heading on +x and its centre of mass on the collision circle's centre
  const mt = wt / ws;
  SPX[0] = x0; SPY[0] = 0; SPA[0] -= mt;
  for (let i = 1; i < n; i++) {
    SPA[i] -= mt;
    const am = (SPA[i - 1] + SPA[i]) / 2;
    SPX[i] = SPX[i - 1] - dx * cos(am); SPY[i] = SPY[i - 1] - dx * sin(am);
  }
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += SPW[i] * (SPX[i] - (x0 - i * dx)); my += SPW[i] * SPY[i]; }
  mx /= ws; my /= ws;
  for (let i = 0; i < n; i++) { SPX[i] -= mx; SPY[i] -= my; }
}
// rest frame (x along the body, v across it) → swimming body. Writes SK = [x, y, local heading].
function skin(x, v) {
  if (AN.pk) {
    // an inflating pufferfish: the rest body maps onto the balloon. Inside the outline a point keeps its fraction
    // of the length and of the half-width; outside it keeps its offset from the outline (fins, prickles, beak).
    if (x >= F6.xf) x = AN.pxf + (x - F6.xf);
    else if (x <= F6.xr) x = AN.pxr + (x - F6.xr);
    else {
      const u = (x - F6.xr) / (F6.xf - F6.xr), k = AN.pk, w0 = w6(x), wc = PUFF_R * 2 * sqrt(u * (1 - u)), av = v < 0 ? -v : v;
      if (av <= w0) { if (w0 > 1e-6) v *= 1 - k + (k * wc) / w0; } else v += (v < 0 ? -k : k) * (wc - w0);
      x = AN.pxr + u * (AN.pxf - AN.pxr);
    }
  }
  const f = (AN.x0 - x) / AN.dx;
  let i = f | 0; if (f < 0) i = 0; else if (i > NSP - 2) i = NSP - 2;
  const fr = f - i, a = SPA[i] + (SPA[i + 1] - SPA[i]) * fr, sa = sin(a), ca = cos(a);
  SK[0] = SPX[i] + (SPX[i + 1] - SPX[i]) * fr - sa * v;
  SK[1] = SPY[i] + (SPY[i + 1] - SPY[i]) * fr + ca * v;
  SK[2] = a;
  return SK;
}
// point on the outline at rest x on one side (±1), with its outward normal → EP
function edge(x, side, k = 1) {
  if (AN.st === 6) {
    // the pufferfish's outline can be inflated: take the normal from the skinned outline itself
    const e = 0.015;
    skin(x - e, side * w6(x - e) * k); const ax = SK[0], ay = SK[1];
    skin(x + e, side * w6(x + e) * k); const tx = SK[0] - ax, ty = SK[1] - ay, l = Math.hypot(tx, ty) || 1;
    skin(x, side * w6(x) * k);
    EP[0] = SK[0]; EP[1] = SK[1]; EP[2] = (-side * ty) / l; EP[3] = (side * tx) / l;
    return EP;
  }
  const e = 0.012, w = wEff(x) * k, dw = ((wEff(x + e) - wEff(x - e)) * k) / (2 * e);
  const l = Math.hypot(dw, 1), nx = -dw / l, ny = side / l;
  skin(AN.st === 3 ? x - 0.7 * aurB(x) * k : x, side * w);
  const ca = cos(SK[2]), sa = sin(SK[2]);
  EP[0] = SK[0]; EP[1] = SK[1]; EP[2] = nx * ca - ny * sa; EP[3] = nx * sa + ny * ca;
  return EP;
}
const sm = (ctx, x, v) => { skin(x, v); ctx.moveTo(SK[0], SK[1]); };
const sl = (ctx, x, v) => { skin(x, v); ctx.lineTo(SK[0], SK[1]); };
// enter a local frame at rest point (x, v): +x along the body, +y towards v > 0 (side -1 mirrors it)
function at(ctx, x, v, side = 1) { skin(x, v); ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2]); if (side < 0) ctx.scale(1, -1); }
// smooth polyline through rest points [x0, v0, x1, v1, …] (v mirrored by side)
const SLX = new Float32Array(24), SLY = new Float32Array(24);
function smoothLine(ctx, pts, side = 1, k = 1) {
  const n = pts.length >> 1;
  for (let i = 0; i < n; i++) { skin(pts[i * 2], pts[i * 2 + 1] * side * k); SLX[i] = SK[0]; SLY[i] = SK[1]; }
  ctx.moveTo(SLX[0], SLY[0]);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(SLX[i], SLY[i], (SLX[i] + SLX[i + 1]) / 2, (SLY[i] + SLY[i + 1]) / 2);
  ctx.lineTo(SLX[n - 1], SLY[n - 1]);
}

// ----- outline -----
const OSX = [];
function outlineXs(st, lite) {
  const key = st * 2 + (lite ? 1 : 0);
  if (OSX[key]) return OSX[key];
  const a = [];
  if (st === 3) {
    const n1 = lite ? 12 : 26, n2 = lite ? 14 : 30;
    for (let i = 1; i <= n1; i++) a.push(F3.xf - (i / n1) * (F3.xf - 0.55));
    for (let i = 1; i < n2; i++) a.push(0.55 - (i / n2) * (0.55 - F3.xr));
  } else {
    const f = st === 4 ? F4 : st === 6 ? F6 : F5, n = lite ? 16 : 34;
    for (let i = 1; i < n; i++) a.push(f.xf - ((f.xf - f.xr) * (1 - cos((PI * i) / n))) / 2);
    if (st >= 5) a.push(f.xr);
  }
  return (OSX[key] = Float32Array.from(a));
}
const BX = new Float32Array(200), BY = new Float32Array(200), TX = new Float32Array(200), TY = new Float32Array(200), BWS = new Float32Array(100);
// outline points (rest → skinned) into ox/oy, with the width scaled by wk; dyn adds hit dents and wobble
function bodyPts(wk, dyn, ox = BX, oy = BY) {
  const xs = AN.os, ns = xs.length, p = AN.p, t = AN.t;
  for (let j = 0; j < ns; j++) BWS[j] = wEff(xs[j]) * wk;
  let n = 0;
  ox[n] = AN.xf; oy[n] = 0; n++;
  for (let j = 0; j < ns; j++) { ox[n] = xs[j]; oy[n] = -BWS[j]; n++; }
  ox[n] = AN.tip; oy[n] = 0; n++;
  for (let j = ns - 1; j >= 0; j--) { ox[n] = xs[j]; oy[n] = BWS[j]; n++; }
  const dent = dyn ? p.dent || 0 : 0, wob = dyn ? p.wob || 0 : 0, da = p.dentA || 0, sd = p.seed || 0;
  const s3 = AN.st === 3;
  for (let i = 0; i < n; i++) {
    let x = ox[i], v = oy[i];
    if (s3 && v) x -= 0.7 * aurB(x) * wk; // the auricles sweep back
    if (dent || wob) {
      const th = Math.atan2(v / AN.hw, (x - AN.cx) / AN.hl);
      let f = 1 + wob * (0.55 * sin(3 * th + t * 1.7 + sd) + 0.45 * sin(5 * th - t * 2.3 + sd * 1.7));
      if (dent) { let d = Math.atan2(v, x) - da; d = Math.atan2(sin(d), cos(d)); f -= dent * 0.8 * exp(-d * d * 5); }
      x = AN.cx + (x - AN.cx) * f; v *= f;
    }
    skin(x, v); ox[i] = SK[0]; oy[i] = SK[1];
  }
  return n;
}
function emitPath(ctx, n, ox = BX, oy = BY) {
  ctx.beginPath();
  ctx.moveTo((ox[n - 1] + ox[0]) / 2, (oy[n - 1] + oy[0]) / 2);
  for (let i = 0; i < n; i++) { const j = i + 1 === n ? 0 : i + 1; ctx.quadraticCurveTo(ox[i], oy[i], (ox[i] + ox[j]) / 2, (oy[i] + oy[j]) / 2); }
  ctx.closePath();
}
function insetFill(ctx, wk, fill) { const n = bodyPts(wk, true, TX, TY); emitPath(ctx, n, TX, TY); ctx.fillStyle = fill; ctx.fill(); }

// deterministic scatter inside the body: [u (0 head … 1 tail), v fraction of the half-width, size]
const SCAT = [];
{ let sd = 9157; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647); for (let i = 0; i < 96; i++) SCAT.push(r(), r() * 2 - 1, r()); }
function scatter(ctx, n, off, u0, u1, vk, r0, r1) {
  const L = AN.xf - AN.xr;
  for (let i = 0; i < n; i++) {
    const o = ((i + off) % 96) * 3, x = AN.xf - L * (u0 + (u1 - u0) * SCAT[o]), v = SCAT[o + 1] * vk * AN.W(x), r = r0 + (r1 - r0) * SCAT[o + 2];
    skin(x, v); ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU);
  }
}
function glowAt(ctx, c, x, v, sz, a, hard = 0) {
  skin(x, v); ctx.globalAlpha = AN.A0 * a;
  ctx.drawImage(glowSprite(c, hard), SK[0] - sz, SK[1] - sz, sz * 2, sz * 2);
}

const TMPC = [0, 0, 0], TMPD = [0, 0, 0];
const SIDES = [-1, 1];

// ----- fins (fish stages) -----
// fin in its own frame: root chord on the y axis (leading edge at y < 0), span along +x.
// falc: 0 = rounded paddle … 1 = swept, pointed (shark-like)
function finPath(ctx, L, C, falc) {
  const ty = -C * (0.15 + 0.45 * falc);
  ctx.beginPath(); ctx.moveTo(0, -C * 0.5);
  ctx.bezierCurveTo(L * 0.3, -C * (0.75 - 0.15 * falc), L * (0.78 + 0.1 * falc), ty - C * (0.3 - 0.25 * falc), L, ty);
  ctx.bezierCurveTo(L * (1 - 0.25 * falc), ty + C * (0.55 - 0.25 * falc), L * (0.5 - 0.15 * falc), C * (0.55 - 0.35 * falc), 0, C * 0.5);
  ctx.closePath();
}
function finRays(ctx, L, C, falc, n) {
  const ty = -C * (0.15 + 0.45 * falc);
  ctx.beginPath();
  for (let k = 1; k <= n; k++) {
    const u = k / (n + 1), y0 = (u - 0.5) * C * 0.8;
    const ex = L * (0.95 - 0.55 * u * u * (1 - 0.4 * falc) - 0.1 * falc * u), ey = ty + (C * 0.5 - ty) * u * (1.05 - 0.35 * falc);
    ctx.moveTo(0.01, y0); ctx.quadraticCurveTo(ex * 0.5, (y0 + ey) / 2 - 0.02, ex, ey);
  }
}
// a paired fin rooted on the body edge at rest x; sweep = angle back from straight out
function pairedFin(ctx, x, side, L, C, falc, sweep, rays, inset = 0.04) {
  const body = AN.body, mem = AN.mem, lw = AN.lw;
  skin(x, side * (AN.W(x) - inset));
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2] + side * (PI / 2 + sweep)); ctx.scale(1, side);
  finPath(ctx, L, C, falc);
  ctx.fillStyle = rgbStr(body, 0.36); ctx.fill();
  ctx.strokeStyle = rgbStr(mem, 0.78); ctx.lineWidth = lw(1.2); ctx.stroke();
  if (rays && !AN.lo) { finRays(ctx, L, C, falc, rays); ctx.strokeStyle = rgbStr(mem, 0.3); ctx.lineWidth = lw(0.8); ctx.stroke(); }
  ctx.restore();
}
// a lobe fin (lobe-finned fish): a fleshy, scaled stalk fringed with rays
function lobeFin(ctx, x, side, L, sweep) {
  const body = AN.body, mem = AN.mem, lw = AN.lw, t = AN.t;
  skin(x, side * (AN.W(x) - 0.05));
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2] + side * (PI / 2 + sweep + 0.12 * sin(t * 2.6 + side))); ctx.scale(1, side);
  // the fin-ray fringe around the outer half of the lobe
  ctx.beginPath(); ctx.moveTo(L * 0.25, -L * 0.13);
  ctx.bezierCurveTo(L * 0.55, -L * 0.42, L * 1.2, -L * 0.34, L * 1.16, 0.0);
  ctx.bezierCurveTo(L * 1.12, L * 0.3, L * 0.6, L * 0.36, L * 0.25, L * 0.13);
  ctx.closePath();
  ctx.fillStyle = rgbStr(body, 0.34); ctx.fill(); ctx.strokeStyle = rgbStr(mem, 0.75); ctx.lineWidth = lw(1.1); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let k = 0; k < 9; k++) { const u = k / 8, a = -1.35 + u * 2.7, bx = L * (0.35 + 0.5 * (1 - abs(u - 0.5) * 1.6)); ctx.moveTo(bx, 0); ctx.lineTo(bx + cos(a) * L * (0.32 + 0.1 * (1 - abs(a))), sin(a) * L * 0.33); }
    ctx.strokeStyle = rgbStr(mem, 0.34); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // the fleshy, scaled stalk
  ctx.beginPath(); ctx.moveTo(-0.02, -L * 0.2);
  ctx.bezierCurveTo(L * 0.4, -L * 0.24, L * 0.82, -L * 0.1, L * 0.92, 0);
  ctx.bezierCurveTo(L * 0.82, L * 0.1, L * 0.4, L * 0.24, -0.02, L * 0.2);
  ctx.closePath();
  ctx.fillStyle = rgbStr(mixRGB(body, AN.dark, 0.32, TMPC), 0.97); ctx.fill();
  ctx.strokeStyle = rgbStr(mem, 0.85); ctx.lineWidth = lw(1.2); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let k = 1; k <= 4; k++) { const xx = L * (0.08 + k * 0.17), h = L * 0.17 * (1 - k * 0.17); ctx.moveTo(xx, -h); ctx.quadraticCurveTo(xx - L * 0.07, 0, xx, h); }
    ctx.strokeStyle = rgbStr(AN.pale, 0.4); ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  ctx.restore();
}
// forked tail fin in its own frame (+x backward)
function caudalPath(ctx, L, S, f, streamer) {
  const lx = L * (1 + streamer);
  ctx.beginPath(); ctx.moveTo(0, -0.07);
  ctx.quadraticCurveTo(L * 0.42, -S * 0.5, lx, -S + f);
  ctx.quadraticCurveTo(L * 0.7, -S * 0.22 + f * 0.6, L * 0.56, f * 0.5);
  ctx.quadraticCurveTo(L * 0.7, S * 0.22 + f * 0.6, lx, S + f);
  ctx.quadraticCurveTo(L * 0.42, S * 0.5, 0, 0.07);
  ctx.closePath();
}

// ----- shared trait bits -----
function dashGlands(ctx, lv) {
  // paired enzyme glands by the vent: bright when the burst is ready
  const p = AN.p, ready = (p.dashCd || 0) <= 0, x = AN.st === 3 ? -0.78 : AN.st === 4 ? -0.62 : -0.66, t = AN.t;
  const v = AN.W(x) * 0.42, pulse = 0.5 + 0.5 * sin(t * 5);
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) glowAt(ctx, DASH_C, x, sd * v, 0.1 + 0.025 * lv, ready ? 0.55 + 0.3 * pulse : 0.2, 1);
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  for (const sd of SIDES) { skin(x, sd * v); ctx.moveTo(SK[0] + 0.035, SK[1]); ctx.ellipse(SK[0], SK[1], 0.035 + 0.006 * lv, 0.026 + 0.004 * lv, SK[2], 0, TAU); }
  ctx.fillStyle = ready ? 'rgba(255,240,190,0.95)' : 'rgba(220,200,150,0.6)'; ctx.fill();
}
function dashJet(ctx, lv) {
  // the enzyme jet streaming out of the tail during a burst
  const p = AN.p, k = min(1, p.dashT / 0.28), t = AN.t, x = AN.st === 5 ? AN.xr - 0.1 : AN.xr + 0.05;
  skin(x, 0);
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2] + PI);
  ctx.globalCompositeOperation = 'lighter';
  const g = glowSprite(DASH_C, 1);
  for (let i = 0; i < 6; i++) {
    const u = i / 5, d = 0.15 + u * (0.9 + 0.15 * lv), sz = (0.32 - 0.18 * u) * (0.7 + 0.3 * k);
    ctx.globalAlpha = AN.A0 * k * (0.75 - 0.5 * u);
    ctx.drawImage(g, d - sz, 0.05 * sin(t * 30 + i) - sz, sz * 2, sz * 2);
  }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) { const y = i * 0.07, l = (0.7 + 0.25 * ((i + 5) % 3)) * k; ctx.moveTo(0.1, y * 0.5); ctx.lineTo(0.1 + l, y); }
  ctx.strokeStyle = `rgba(255,245,210,${0.6 * k})`; ctx.lineWidth = AN.lw(1.5); ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}
function animalPolyps(ctx, lv) {
  const n = min(8, 2 + lv), t = AN.t, P = POLYP_BUF;
  const x0 = AN.st === 3 ? 0.42 : AN.st === 4 ? 0.3 : 0.2, x1 = AN.st === 3 ? -0.85 : AN.st === 4 ? -0.95 : -0.75;
  for (let i = 0; i < n; i++) {
    const side = i & 1 ? 1 : -1, k = i >> 1, nk = (n + 1) >> 1, x = x0 - ((k + 0.25 + 0.5 * (i & 1)) / nk) * (x0 - x1);
    edge(x, side, 0.96);
    const o = i * 6;
    P[o] = EP[0]; P[o + 1] = EP[1]; P[o + 2] = EP[2]; P[o + 3] = EP[3]; P[o + 4] = Math.atan2(EP[3], EP[2]) - side * 0.35 + 0.38 * sin(t * 2.1 + i * 1.9); P[o + 5] = i;
  }
  renderPolyps(ctx, n, lv, t, AN.lw, AN.mem);
}
function animalCnido(ctx, lv) {
  // nematocysts in the skin (stolen from prey, like Microstomum's): capsules that fire barbed threads
  const n = 12 + 4 * lv, L0 = 0.12 + 0.025 * lv, bl = 0.04 + 0.006 * lv, t = AN.t;
  const x0 = AN.xf - 0.1, x1 = AN.st === 5 ? AN.xr + 0.08 : AN.xr + 0.18;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const side = i & 1 ? 1 : -1, x = x0 - ((i + 0.5) / n) * (x0 - x1);
      edge(x, side);
      const ex0 = EP[0], ey0 = EP[1], nx = EP[2], ny = EP[3], tx = -ny, ty = nx;
      if (pass === 1) { const cx = ex0 - nx * 0.04, cy = ey0 - ny * 0.04; ctx.moveTo(cx + 0.03, cy); ctx.arc(cx, cy, 0.03, 0, TAU); continue; }
      let f = sin(t * 1.4 + i * 2.7); f = f > 0 ? f ** 6 : 0;
      const L = L0 * (0.6 + 0.8 * f), w = 0.03 * sin(t * 5 + i * 1.3), ex = ex0 + nx * L, ey = ey0 + ny * L;
      ctx.moveTo(ex0, ey0); ctx.quadraticCurveTo(ex0 + nx * L * 0.5 + tx * w, ey0 + ny * L * 0.5 + ty * w, ex, ey);
      ctx.moveTo(ex - nx * bl + tx * bl * 0.6, ey - ny * bl + ty * bl * 0.6); ctx.lineTo(ex, ey); ctx.lineTo(ex - nx * bl - tx * bl * 0.6, ey - ny * bl - ty * bl * 0.6);
    }
    if (pass === 0) { ctx.strokeStyle = 'rgba(255,244,205,0.92)'; ctx.lineWidth = AN.lw(1.1); ctx.lineCap = 'round'; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(232,150,255,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,225,255,0.7)'; ctx.lineWidth = AN.lw(0.7); ctx.stroke(); }
  }
}
// ----- early traits in their fish form (stages 4–5): a fish has no polyps, cilia or chloroplasts -----
function caeca(ctx, lv) {
  // pyloric caeca (Feeding Polyps on a fish): finger-like blind pouches off the end of the stomach that soak up
  // more from every meal, seen through the body wall
  const st = AN.st, t = AN.t, x0 = st === 4 ? 0.42 : st === 6 ? 0.34 : 0.4, n = 4 + 2 * lv, nk = n >> 1, L0 = (st === 4 ? 0.18 : 0.22) + 0.03 * lv;
  skin(x0 + 0.03, 0); ctx.beginPath(); ctx.ellipse(SK[0], SK[1], st === 4 ? 0.08 : 0.11, st === 4 ? 0.05 : 0.075, SK[2], 0, TAU);
  ctx.fillStyle = rgbStr(POLYP_C, 0.38); ctx.fill();
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const sd = i & 1 ? 1 : -1, k = i >> 1;
      const a = 0.12 + (nk > 1 ? k / (nk - 1) : 0.5) * 0.62 + 0.05 * sin(t * 1.8 + i * 1.7); // a bunch trailing back along the gut
      const L = L0 * (1.15 - 0.3 * (nk > 1 ? k / (nk - 1) : 0.5)) * (0.9 + 0.1 * ((i * 5) % 3));
      const rv = sd * 0.025, tx = x0 - cos(a) * L;
      let tv = rv + sd * sin(a) * L; const lim = AN.W(tx) * 0.72; if (Math.abs(tv) > lim) tv = sd * lim;
      sm(ctx, x0, rv);
      skin((x0 + tx) / 2 - 0.025, (rv + tv) / 2 + sd * 0.012 * sin(t * 2.4 + i)); const qx = SK[0], qy = SK[1];
      skin(tx, tv); ctx.quadraticCurveTo(qx, qy, SK[0], SK[1]);
    }
    ctx.lineCap = 'round';
    if (pass === 0) { ctx.strokeStyle = rgbStr([205, 110, 145], 0.42 + 0.06 * lv); ctx.lineWidth = st === 4 ? 0.05 : 0.064; }
    else { ctx.strokeStyle = rgbStr(POLYP_C, 0.7); ctx.lineWidth = st === 4 ? 0.028 : 0.04; }
    ctx.stroke();
  }
}
const SLIME_C = [232, 160, 255];
function stingSlime(ctx, lv) {
  // Stinging Slime (Stinging Cells on a fish, like a soapfish's toxic mucus): a glossy film over the skin that
  // beads along the edges and trails off in strands as you swim
  const t = AN.t, lw = AN.lw;
  const n = bodyPts(1.035, true, TX, TY); emitPath(ctx, n, TX, TY);
  ctx.strokeStyle = rgbStr(SLIME_C, 0.2 + 0.06 * lv); ctx.lineWidth = lw(3 + 1.5 * lv); ctx.stroke();
  ctx.strokeStyle = 'rgba(250,228,255,0.5)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  // strands pulled off the flanks by the water, a bead at each tip
  const ns = 2 + lv, x0 = AN.xf - 0.45, x1 = AN.st === 5 ? AN.xr + 0.3 : AN.st === 6 ? AN.xr + 0.22 : AN.xr + 0.4, B = [];
  ctx.beginPath();
  for (let i = 0; i < ns * 2; i++) {
    const sd = i & 1 ? 1 : -1, k = i >> 1;
    let f = t * 0.5 + k * 0.618 + (sd > 0 ? 0.31 : 0); f -= Math.floor(f);
    const x = x0 - ((k + 0.5) / ns) * (x0 - x1);
    edge(x, sd, 1.02);
    const ex = EP[0], ey = EP[1], nx = EP[2], ny = EP[3];
    skin(x, 0);
    const bx = -cos(SK[2]), by = -sin(SK[2]), ox = nx * 0.4 + bx, oy = ny * 0.4 + by, L = (0.14 + 0.05 * lv) * f, w = 0.03 * sin(t * 4 + i);
    const tx = ex + ox * L, ty = ey + oy * L;
    ctx.moveTo(ex, ey); ctx.quadraticCurveTo(ex + ox * L * 0.5 - by * w, ey + oy * L * 0.5 + bx * w, tx, ty);
    B.push(tx, ty, (0.016 + 0.005 * lv) * (0.7 + 0.6 * f), min(1, (1 - f) * 3));
  }
  ctx.strokeStyle = rgbStr(SLIME_C, 0.5); ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke();
  // beads of slime glistening along the edges
  const nb = 8 + 3 * lv;
  for (let i = 0; i < nb; i++) {
    const sd = i & 1 ? 1 : -1, x = AN.xf - 0.2 - ((i + 0.5) / nb) * (AN.xf - x1 - 0.2);
    edge(x, sd, 1.0 + 0.01 * sin(t * 3 + i)); B.push(EP[0], EP[1], 0.018 + 0.004 * lv * (0.5 + 0.5 * sin(t * 2 + i * 2.3)), 1);
  }
  for (let j = 0; j < B.length; j += 4) {
    const x = B[j], y = B[j + 1], r = B[j + 2];
    ctx.globalAlpha = AN.A0 * B[j + 3];
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = 'rgba(238,196,255,0.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.35, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  ctx.globalAlpha = AN.A0;
}
function sunBask(ctx, lv) {
  // Sun Basking (Chloroplasts on a fish): a warm golden sheen down the back that catches the light, like an
  // ocean sunfish warming itself at the surface
  const t = AN.t;
  insetFill(ctx, 0.62, rgbStr([255, 214, 120], 0.08 + 0.035 * lv));
  insetFill(ctx, 0.3, rgbStr([255, 236, 170], 0.07 + 0.03 * lv));
  let f = t * 0.35; f -= Math.floor(f);
  ctx.globalCompositeOperation = 'lighter';
  glowAt(ctx, [255, 225, 140], AN.xf - 0.2 - f * (AN.xf - AN.xr - 0.3), 0, 0.3 + 0.04 * lv, 0.06 + 0.22 * sin(f * PI), 1);
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  if (!AN.lo) { ctx.beginPath(); scatter(ctx, 8 + 4 * lv, 33, 0.1, 0.85, 0.45, 0.012, 0.022); ctx.fillStyle = 'rgba(255,238,170,0.75)'; ctx.fill(); }
}
function dashMuscle(ctx, lv) {
  // Fast Start (Enzyme Burst on a fish): white, fast-twitch muscle at the tail base that fires the escape snap;
  // it glows while the burst is ready
  const p = AN.p, ready = (p.dashCd || 0) <= 0, t = AN.t, pulse = 0.5 + 0.5 * sin(t * 5);
  const xa = AN.st === 4 ? -0.5 : AN.st === 6 ? -0.28 : -0.38, xb = AN.st === 4 ? -1.0 : AN.st === 6 ? -0.72 : -0.8;
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < 3; i++) { const x = xa + ((xb - xa) * (i + 0.5)) / 3; glowAt(ctx, DASH_C, x, sd * AN.W(x) * 0.45, AN.W(x) * 0.55 + 0.015 * lv, ready ? 0.14 + 0.12 * pulse : 0.05, 1); }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  // the muscle blocks: forward-pointing chevrons
  ctx.beginPath();
  for (let k = 0; k < 3 + lv; k++) { const x = xa - ((xa - xb) * k) / (2 + lv); sm(ctx, x - 0.06, -AN.W(x) * 0.72); sl(ctx, x, 0); sl(ctx, x - 0.06, AN.W(x) * 0.72); }
  ctx.strokeStyle = ready ? `rgba(255,245,215,${0.5 + 0.3 * pulse})` : 'rgba(230,220,190,0.28)'; ctx.lineWidth = AN.lw(1.6 + 0.3 * lv); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function dashWake(ctx, lv) {
  // the fast-start wake: a burst of bubbles and two spinning vortices shed by the tail
  const p = AN.p, k = min(1, p.dashT / 0.28), lw = AN.lw;
  skin(AN.st === 5 ? AN.xr - 0.15 : AN.st === 6 ? AN.xr - 0.12 : AN.xr, 0);
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2] + PI);
  ctx.globalCompositeOperation = 'lighter';
  const g = glowSprite([200, 240, 255], 1);
  for (let i = 0; i < 4; i++) { const u = i / 3, d = 0.2 + u * 0.8, sz = (0.3 - 0.15 * u) * (0.6 + 0.4 * k); ctx.globalAlpha = AN.A0 * k * (0.45 - 0.3 * u); ctx.drawImage(g, d - sz, -sz, sz * 2, sz * 2); }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  for (const sd of SIDES) {
    const cx = 0.5 + 0.35 * (1 - k), cy = sd * (0.2 + 0.12 * (1 - k)), r = 0.12 + 0.02 * lv;
    for (const rr of [r, r * 0.55]) { const a0 = sd > 0 ? -2.2 : 2.2; ctx.moveTo(cx + cos(a0) * rr, cy + sin(a0) * rr); ctx.arc(cx, cy, rr, a0, a0 + sd * 4.2, sd < 0); }
  }
  ctx.strokeStyle = `rgba(220,248,255,${0.6 * k})`; ctx.lineWidth = lw(1.6); ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath();
  for (let i = 0, nb = 9 + 2 * lv; i < nb; i++) {
    const u = (i * 0.618) % 1, d = 0.15 + u * (1.0 + 0.15 * lv) * (0.7 + 0.3 * (1 - k)), y = (((i * 0.383) % 1) - 0.5) * (0.25 + 0.5 * u), r = 0.022 + 0.022 * ((i * 0.73) % 1);
    ctx.moveTo(d + r, y); ctx.arc(d, y, r, 0, TAU);
  }
  ctx.strokeStyle = `rgba(235,252,255,${0.8 * k})`; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.restore();
}

function algae(ctx, lv) {
  // symbiotic algae living in the tissue (the "mint-sauce worm" trick)
  const n = AN.st === 3 ? 12 + 12 * lv : 10 + 9 * lv;
  insetFill(ctx, 0.9, rgbStr(ALGA_C, 0.06 + 0.05 * lv)); // the whole animal greens up
  ctx.beginPath(); scatter(ctx, n, 7, 0.05, 0.95, 0.82, 0.026, 0.046);
  ctx.fillStyle = 'rgba(70,215,85,0.9)'; ctx.fill();
  ctx.strokeStyle = 'rgba(20,90,40,0.45)'; ctx.lineWidth = AN.lw(0.8); ctx.stroke();
  if (!AN.lo) { ctx.beginPath(); scatter(ctx, n >> 1, 61, 0.08, 0.92, 0.7, 0.01, 0.016); ctx.fillStyle = 'rgba(215,255,190,0.8)'; ctx.fill(); }
}
function mottle(ctx, lv) {
  // disruptive camouflage: dark blotches and pale flecks that bend with the body
  ctx.beginPath(); scatter(ctx, 9 + 3 * lv, 20, 0.03, 0.97, 0.95, 0.08 + 0.008 * lv, 0.16);
  ctx.fillStyle = rgbStr(mixRGB(AN.dark, [20, 30, 25], 0.4, TMPD), 0.26 + 0.1 * lv); ctx.fill();
  ctx.beginPath(); scatter(ctx, 7 + 2 * lv, 77, 0.06, 0.94, 0.8, 0.04, 0.08);
  ctx.fillStyle = rgbStr([150, 140, 90], 0.14 + 0.06 * lv); ctx.fill();
  ctx.beginPath(); scatter(ctx, 8 + 3 * lv, 55, 0.03, 0.97, 0.9, 0.025, 0.055);
  ctx.fillStyle = rgbStr(AN.pale, 0.3 + 0.08 * lv); ctx.fill();
}
function mitoGlow(ctx, lv) {
  // mitochondria-packed muscle running warm along the flanks
  const st = AN.st, t = AN.t, n = 2 + lv, x0 = st === 3 ? 0.42 : st === 4 ? 0.5 : st === 6 ? 0.45 : 0.42, x1 = st === 3 ? -0.85 : st === 4 ? -1.05 : st === 6 ? -0.68 : -0.85;
  if (st >= 4) {
    ctx.beginPath();
    for (const sd of SIDES) for (let k = 0; k <= 10; k++) { const x = x0 + (x1 - x0) * (k / 10); k ? sl(ctx, x, sd * AN.W(x) * 0.5) : sm(ctx, x, sd * AN.W(x) * 0.5); }
    ctx.strokeStyle = rgbStr(MITO_C, 0.22 + 0.06 * lv); ctx.lineWidth = 0.05 + 0.012 * lv; ctx.lineCap = 'round'; ctx.stroke();
  } else { ctx.beginPath(); scatter(ctx, 6 + 4 * lv, 40, 0.15, 0.9, 0.85, 0.02, 0.032); ctx.fillStyle = 'rgba(255,150,90,0.8)'; ctx.fill(); }
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.5) / n), pulse = 0.5 + 0.5 * sin(t * 2.6 - i * 0.9 + sd);
    glowAt(ctx, MITO_C, x, sd * AN.W(x) * 0.52, AN.W(x) * (0.7 + 0.06 * lv), 0.12 + 0.035 * lv + 0.08 * pulse);
  }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
}
function novaOrgan(ctx, lv) {
  // electric organ: stacks of electrocytes along the rear flanks, flickering as they charge
  const st = AN.st, t = AN.t, x0 = st === 3 ? -0.3 : st === 4 ? -0.3 : st === 6 ? -0.02 : -0.2, x1 = st === 3 ? -1.0 : st === 4 ? -1.15 : st === 6 ? -0.74 : -0.9;
  const v0 = 0.22, v1 = 0.82;
  ctx.beginPath();
  for (const sd of SIDES) {
    for (let k = 0; k <= 8; k++) { const x = x0 + (x1 - x0) * (k / 8); k ? sl(ctx, x, sd * AN.W(x) * v1) : sm(ctx, x, sd * AN.W(x) * v1); }
    for (let k = 8; k >= 0; k--) { const x = x0 + (x1 - x0) * (k / 8); sl(ctx, x, sd * AN.W(x) * v0); }
    ctx.closePath();
  }
  const fl = 0.5 + 0.5 * sin(t * 7.3) * sin(t * 3.1 + 1);
  ctx.fillStyle = rgbStr(NOVA_C, 0.16 + 0.05 * lv + 0.1 * fl); ctx.fill();
  if (!AN.lo) {
    ctx.beginPath();
    const step = AN.fine ? 0.045 : 0.08;
    for (const sd of SIDES) for (let x = x0 - step * 0.5; x > x1; x -= step) { sm(ctx, x, sd * AN.W(x) * v0); sl(ctx, x - 0.02, sd * AN.W(x) * v1); }
    ctx.strokeStyle = rgbStr([235, 200, 255], 0.3 + 0.08 * lv); ctx.lineWidth = AN.lw(0.9); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < 3; i++) {
    const x = x0 + (x1 - x0) * ((i + 0.5) / 3);
    let f = sin(t * 6 + i * 2.1 + sd * 1.3); f = f > 0 ? f * f : 0;
    glowAt(ctx, NOVA_C, x, sd * AN.W(x) * 0.52, AN.W(x) * 1.1 + 0.04 * lv, 0.15 + 0.1 * lv * f, 1);
  }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
}
function biolumSpots(ctx, lv) {
  const st = AN.st, t = AN.t, n = st === 3 ? 3 + lv : 4 + 2 * lv;
  const x0 = st === 3 ? 0.45 : st === 4 ? 0.55 : st === 6 ? 0.5 : 0.5, x1 = st === 3 ? -0.95 : st === 4 ? -1.1 : st === 6 ? -0.66 : -0.88, vk = st === 3 ? 0.72 : st === 6 ? 0.78 : 0.8;
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (i / (n - 1)), pulse = 0.5 + 0.5 * sin(t * 3 - i * 0.8 + sd);
    glowAt(ctx, LUM_C, x, sd * AN.W(x) * vk, 0.08 + 0.03 * pulse + (st === 3 ? 0.06 : 0), 0.45 + 0.4 * pulse, 1);
  }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  if (st >= 4 && !AN.lo) {
    ctx.beginPath();
    for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * (i / (n - 1)); skin(x, sd * AN.W(x) * vk); ctx.moveTo(SK[0] + 0.022, SK[1]); ctx.arc(SK[0], SK[1], 0.022, 0, TAU); }
    ctx.fillStyle = 'rgba(235,255,250,0.95)'; ctx.fill();
  }
}
function nerveSys(ctx, lv) {
  const st = AN.st, t = AN.t, lw = AN.lw;
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  if (st === 3) {
    // a ladder: two nerve cords joined by rungs, and a two-lobed brain between the eyes
    for (const sd of SIDES) smoothLine(ctx, NC3, sd);
    for (let x = 0.5; x > -0.95; x -= 0.15) { const v = cordV(x); sm(ctx, x, -v); sl(ctx, x, v); }
    for (const sd of SIDES) { sm(ctx, 0.72, sd * 0.05); sl(ctx, 0.8, sd * 0.115); sm(ctx, 0.73, sd * 0.1); sl(ctx, 0.83, sd * 0.32); }
  } else {
    // spinal cord down the back with a nerve to every muscle block
    const x0 = st === 4 ? 0.8 : st === 6 ? 0.56 : 0.66, x1 = st === 4 ? -1.35 : st === 6 ? -0.8 : -0.98, step = st === 4 ? 0.105 : 0.12;
    sm(ctx, x0, 0); for (let k = 1; k <= 12; k++) sl(ctx, x0 + (x1 - x0) * (k / 12), 0);
    if (lv >= 2 || st === 4) for (let x = x0 - 0.1; x > x1 + 0.05; x -= step) for (const sd of SIDES) { sm(ctx, x, 0); sl(ctx, x - 0.05, sd * AN.W(x) * 0.6); }
  }
  ctx.strokeStyle = rgbStr(NERVE_C, 0.22 + 0.08 * lv); ctx.lineWidth = lw(1.1 + 0.25 * lv); ctx.lineCap = 'round'; ctx.stroke();
  brain(ctx, 0.3 + 0.1 * lv, true);
  // impulses racing back along the cords
  const g = glowSprite(NERVE_C, 1);
  for (let i = 0; i < 2 + lv; i++) {
    let f = t * 0.7 + i / (2 + lv); f -= Math.floor(f);
    const x = st === 3 ? 0.7 - f * 1.75 : (st === 4 ? 0.8 : st === 6 ? 0.56 : 0.66) - f * (st === 4 ? 2.1 : st === 6 ? 1.36 : 1.6), sz = 0.07 + 0.015 * lv;
    for (const sd of st === 3 ? SIDES : [0]) { skin(x, sd * (st === 3 ? cordV(x) : 0)); ctx.globalAlpha = AN.A0 * (0.5 + 0.3 * sin(f * PI)); ctx.drawImage(g, SK[0] - sz, SK[1] - sz, sz * 2, sz * 2); }
  }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
}
const NC3 = [0.72, 0.07, 0.45, 0.19, 0.05, 0.24, -0.45, 0.22, -0.85, 0.13, -1.08, 0.04];
function cordV(x) { for (let i = 2; i < NC3.length; i += 2) if (x >= NC3[i]) { const u = (x - NC3[i]) / (NC3[i - 2] - NC3[i]); return NC3[i + 1] + (NC3[i - 1] - NC3[i + 1]) * u; } return 0.04; }
// brain lobes; glowing when lit by the nerve trait, a faint shape otherwise
function brain(ctx, a, lit) {
  const st = AN.st;
  ctx.beginPath();
  if (st === 3) { for (const sd of SIDES) { skin(0.72, sd * 0.055); ctx.moveTo(SK[0] + 0.09, SK[1]); ctx.ellipse(SK[0], SK[1], 0.085, 0.06, SK[2], 0, TAU); } }
  else {
    const bx = st === 4 ? 0.82 : st === 6 ? 0.6 : 0.7, k = st === 4 ? 1 : st === 6 ? 1.45 : 1.25;
    for (const sd of SIDES) {
      skin(bx + 0.13 * k, sd * 0.03 * k); ctx.moveTo(SK[0] + 0.035 * k, SK[1]); ctx.ellipse(SK[0], SK[1], 0.035 * k, 0.026 * k, SK[2], 0, TAU);
      skin(bx + 0.05 * k, sd * 0.045 * k); ctx.moveTo(SK[0] + 0.05 * k, SK[1]); ctx.ellipse(SK[0], SK[1], 0.05 * k, 0.038 * k, SK[2], 0, TAU);
    }
    skin(bx - 0.04 * k, 0); ctx.moveTo(SK[0] + 0.05 * k, SK[1]); ctx.ellipse(SK[0], SK[1], 0.05 * k, 0.03 * k, SK[2], 0, TAU);
  }
  ctx.fillStyle = lit ? rgbStr(NERVE_C, a) : `rgba(215,240,255,${a})`; ctx.fill();
}
function cystCoat(ctx, lv, n) {
  // a hardened amber cuticle (a lungfish-style mucus cocoon on the fish) ready to seal the body
  emitPath(ctx, n);
  ctx.strokeStyle = rgbStr(CYST_C, 0.3 + 0.08 * lv); ctx.lineWidth = AN.lw(3.5 + 1.6 * lv); ctx.stroke();
}
function cystShell(ctx, t, lw) {
  let cx = AN.st === 5 ? -0.22 : AN.st === 4 ? -0.18 : -0.05, rx = AN.st === 5 ? 1.72 : AN.st === 4 ? 1.62 : 1.45, ry = AN.st === 3 ? 0.78 : AN.st === 4 ? 0.66 : 0.86;
  if (AN.st === 6) { const k = AN.pk; cx = 0.08 * (1 - k); rx = 1.52 + 0.58 * k; ry = 1.08 + 1.02 * k; } // round, and rounder still inflated
  if (AN.st >= 4) {
    // a fish seals itself in a glossy mucus cocoon (like a lungfish's, or a sleeping parrotfish's bubble)
    const k = 1 + 0.02 * sin(t * 2.2);
    ctx.beginPath(); ctx.ellipse(cx, 0, rx * k, ry / k, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,226,170,0.1)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,232,182,0.9)'; ctx.lineWidth = lw(2.6); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, 0, rx * k * 0.88, ry / k * 0.8, 0, PI * 1.08, PI * 1.42);
    ctx.strokeStyle = 'rgba(255,252,240,0.75)'; ctx.lineWidth = lw(2.2); ctx.lineCap = 'round'; ctx.stroke();
    return;
  }
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * TAU + t; i ? ctx.lineTo(cx + cos(a) * rx, sin(a) * ry) : ctx.moveTo(cx + cos(a) * rx, sin(a) * ry); }
  ctx.fillStyle = 'rgba(255,220,150,0.25)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,170,0.95)'; ctx.lineWidth = lw(3); ctx.stroke();
}
function hiliteAt(ctx, x, k) {
  skin(x, 0); ctx.save(); ctx.translate(SK[0], SK[1]); ctx.scale(k, k);
  highlight(ctx, AN.ang + SK[2]);
  ctx.restore();
}
function membraneIn(ctx, lv) {
  const n = bodyPts(0.86, true, TX, TY); emitPath(ctx, n, TX, TY);
  ctx.strokeStyle = rgbStr(AN.mem, 0.3); ctx.lineWidth = AN.lw(1.2 + lv * 0.4); ctx.stroke();
}

// ============================ stage 3: flatworm ============================
const GUT_A = [0.04, 0, 0.3, 0, 0.52, 0, 0.72, 0];
const GUT_P = [0.04, 0, -0.07, 0.15, -0.32, 0.2, -0.6, 0.18, -0.86, 0.12, -1.02, 0.05];
// diverticula: [root x, reach (fraction of the half-width), bend]
const GUT_D = [0.69, 0.6, 0.02, 0.58, 0.74, -0.02, 0.47, 0.66, 0.03, 0.36, 0.78, -0.03, 0.25, 0.7, 0.02, 0.14, 0.6, 0,
  -0.12, 0.72, 0.02, -0.24, 0.82, -0.02, -0.37, 0.7, 0.03, -0.49, 0.84, -0.02, -0.61, 0.72, 0.02, -0.73, 0.8, -0.03, -0.85, 0.7, 0.02, -0.95, 0.58, 0];
const GUT_END = new Float32Array(160);
function gutV(x) { for (let i = 2; i < GUT_P.length; i += 2) if (x >= GUT_P[i]) { const u = (x - GUT_P[i]) / (GUT_P[i - 2] - GUT_P[i]); return GUT_P[i + 1] + (GUT_P[i - 1] - GUT_P[i + 1]) * u; } return 0.05; }
function wormBack(ctx, m) {
  const t = AN.t, lw = AN.lw, mem = AN.mem;
  // ciliated tail tip (flagellum): a tuft of long cilia streaming from the tail
  if (m.flagellum) {
    const lv = min(5, m.flagellum), n = 2 + lv, L = 0.32 + 0.1 * lv, fp = AN.ph * 1.5;
    at(ctx, F3.xr + 0.05, 0);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const c = k - (n - 1) / 2, a = PI + c * 0.2, len = L * (1 - 0.25 * abs(c) / n), ca = cos(a), sa = sin(a);
        ctx.moveTo(0, 0);
        for (let j = 1; j <= 10; j++) { const u = j / 10, w = sin(u * 5.2 - fp - k * 1.1) * 0.2 * len * u; ctx.lineTo(ca * u * len - sa * w, sa * u * len + ca * w); }
      }
      ctx.strokeStyle = pass ? rgbStr(mem, 0.9) : rgbStr(mem, 0.25); ctx.lineWidth = lw(pass ? 1.3 : 4); ctx.lineCap = 'round'; ctx.stroke();
    }
    ctx.restore();
  }
  // ciliated margin: always a fine fringe; the cilia trait makes it a thick, rippling carpet
  const cl = m.cilia || 0;
  if (cl || AN.fine) {
    const n = cl ? 34 + 10 * cl : 30, len = cl ? 0.05 + 0.022 * cl : 0.04, span = F3.xf - F3.xr - 0.1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const side = i & 1 ? 1 : -1, x = F3.xf - 0.04 - ((i + 0.5) / n) * span;
      edge(x, side);
      const w = side * 0.55 * sin(x * 17 + t * 13), c = cos(w), s = sin(w), nx = EP[2] * c - EP[3] * s, ny = EP[2] * s + EP[3] * c;
      ctx.moveTo(EP[0] - EP[2] * 0.015, EP[1] - EP[3] * 0.015); ctx.lineTo(EP[0] + nx * len, EP[1] + ny * len);
    }
    ctx.strokeStyle = rgbStr(mem, cl ? 0.72 : 0.3); ctx.lineWidth = lw(cl ? 1.2 : 0.9); ctx.lineCap = 'round'; ctx.stroke();
  }
  // marginal spines
  if (m.spikes) {
    const lv = min(4, m.spikes), nk = 4 + 2 * lv, L = 0.1 + 0.045 * lv, b = 0.035 + 0.006 * lv;
    ctx.beginPath();
    for (const side of SIDES) for (let k = 0; k < nk; k++) {
      const x = 0.5 - (k / (nk - 1)) * 1.5; edge(x, side);
      const ex = EP[0], ey = EP[1], nx = EP[2], ny = EP[3], fx = side * ny, fy = -side * nx;
      ctx.moveTo(ex + fx * b - nx * 0.02, ey + fy * b - ny * 0.02);
      ctx.lineTo(ex + nx * L * 0.85 - fx * L * 0.5, ey + ny * L * 0.85 - fy * L * 0.5);
      ctx.lineTo(ex - fx * b - nx * 0.02, ey - fy * b - ny * 0.02);
    }
    ctx.fillStyle = 'rgba(230,255,250,0.92)'; ctx.fill(); ctx.strokeStyle = 'rgba(40,95,95,0.45)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  }
}
function wormGut(ctx, m) {
  const lw = AN.lw, vac = m.vacuole || 0, lys = m.lysosome || 0, k = 1 + 0.16 * vac;
  const c = lys ? mixRGB(GUT_C, LYSO_C, 0.3 + 0.12 * lys, TMPC) : GUT_C;
  // trunk branches: one forward to the head, two back past the pharynx
  ctx.beginPath(); smoothLine(ctx, GUT_A); smoothLine(ctx, GUT_P, 1); smoothLine(ctx, GUT_P, -1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = rgbStr(c, 0.36 + 0.07 * vac + 0.05 * lys); ctx.lineWidth = 0.07 * k; ctx.stroke();
  // side pockets (diverticula) branching out towards the margin, ending in blind sacs
  ctx.beginPath();
  const ends = GUT_END; let ne = 0;
  for (const sd of SIDES) {
    for (let i = 0; i < GUT_D.length; i += 3) {
      const x = GUT_D[i], lk = GUT_D[i + 1] * (1 + 0.07 * sd * sin(i * 2.1)), bend = GUT_D[i + 2] * sd, ant = x > 0.05;
      const v0 = ant ? 0 : gutV(x), xe = x + (ant ? 0.05 : -0.06), we = AN.W(xe) * lk;
      sm(ctx, x, sd * v0); skin((x + xe) / 2 + bend, sd * (v0 + we) * 0.5); const cx = SK[0], cy = SK[1]; skin(xe, sd * we); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
      ends[ne++] = SK[0]; ends[ne++] = SK[1];
      if (!AN.lo && (i / 3 + (sd > 0)) % 2) {
        // a side twig
        const xm = x + (xe - x) * 0.6, vm = v0 + (we - v0) * 0.6, xt = xm + (ant ? 0.07 : -0.08), vt = vm + (we - v0) * 0.25;
        sm(ctx, xm, sd * vm); sl(ctx, xt, sd * vt); skin(xt, sd * vt); ends[ne++] = SK[0]; ends[ne++] = SK[1];
      }
      if (x < -0.55) { sm(ctx, x, sd * v0); sl(ctx, x - 0.05, sd * 0.05); }
    }
  }
  ctx.strokeStyle = rgbStr(c, 0.3 + 0.07 * vac + 0.05 * lys); ctx.lineWidth = 0.04 * k; ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < ne; i += 2) { const r = 0.026 * k; ctx.moveTo(ends[i] + r, ends[i + 1]); ctx.arc(ends[i], ends[i + 1], r, 0, TAU); }
  ctx.fillStyle = rgbStr(c, 0.3 + 0.07 * vac + 0.05 * lys); ctx.fill();
  if (!AN.lo) {
    ctx.beginPath(); smoothLine(ctx, GUT_A); smoothLine(ctx, GUT_P, 1); smoothLine(ctx, GUT_P, -1);
    ctx.strokeStyle = 'rgba(255,230,200,0.35)'; ctx.lineWidth = lw(1); ctx.stroke();
  }
  // stored food (vacuole) and digestive granules (lysosomes)
  if (vac) {
    ctx.beginPath();
    for (let i = 0; i < 3 + 2 * vac; i++) { const x = 0.62 - i * 0.27, v = x > 0.04 ? 0 : gutV(x) * (i & 1 ? 1 : -1), r = 0.03 + 0.006 * vac; skin(x, v); ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU); }
    ctx.fillStyle = 'rgba(255,232,150,0.8)'; ctx.fill();
  }
  if (lys) {
    ctx.beginPath();
    for (let i = 0; i < 6 + 3 * lys; i++) { const x = 0.68 - i * (1.65 / (6 + 3 * lys)), v = x > 0.04 ? 0.02 * sin(i * 2.3) : gutV(x) * (i & 1 ? 1 : -1), r = 0.017; skin(x, v); ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU); }
    ctx.fillStyle = rgbStr(LYSO_C, 0.9); ctx.fill();
  }
}
function pharynx(ctx) {
  // the muscular feeding tube, rooted mid-body and pointing back, in its pouch (the mouth is at its tip)
  const lw = AN.lw, x0 = 0.0, x1 = -0.5;
  const tube = (k) => {
    ctx.beginPath(); sm(ctx, x0, -0.055 * k);
    skin(-0.22, -0.09 * k); let cx = SK[0], cy = SK[1]; skin(x1 + 0.08, -0.065 * k); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    skin(x1 - 0.035 * k, -0.02); cx = SK[0]; cy = SK[1]; skin(x1 - 0.035 * k, 0.02 * k); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    skin(x1 + 0.08, 0.065 * k); ctx.lineTo(SK[0], SK[1]);
    skin(-0.22, 0.09 * k); cx = SK[0]; cy = SK[1]; skin(x0, 0.055 * k); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    skin(x0 + 0.04 * k, 0); cx = SK[0]; cy = SK[1]; skin(x0, -0.055 * k); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    ctx.closePath();
  };
  tube(1.35); ctx.fillStyle = rgbStr(AN.dark, 0.18); ctx.fill();
  tube(1); ctx.fillStyle = 'rgba(255,214,222,0.42)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,232,238,0.65)'; ctx.lineWidth = lw(1); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let i = 1; i <= 5; i++) { const x = x0 - 0.07 * i - 0.02, w = 0.075 - 0.002 * i; sm(ctx, x, -w); skin(x - 0.022, 0); const cx = SK[0], cy = SK[1]; skin(x, w); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]); }
    ctx.strokeStyle = 'rgba(255,225,232,0.32)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  skin(x1 - 0.01, 0); ctx.beginPath(); ctx.ellipse(SK[0], SK[1], 0.022, 0.034, SK[2], 0, TAU); ctx.fillStyle = 'rgba(70,24,36,0.6)'; ctx.fill();
}
function wormMuscle(ctx, lv) {
  // body-wall muscle: longitudinal bands, and at higher levels the circular layer crossing them
  const t = AN.t, bw = 0.038 + 0.012 * lv;
  if (lv >= 2 && !AN.lo) {
    ctx.beginPath();
    for (let x = 0.55; x > -1.0; x -= 0.085 - 0.008 * lv) { const w = AN.W(x) * 0.88; sm(ctx, x, -w); skin(x - 0.03, 0); const cx = SK[0], cy = SK[1]; skin(x, w); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]); }
    ctx.strokeStyle = rgbStr([255, 160, 172], 0.2 + 0.06 * lv); ctx.lineWidth = AN.lw(1.5); ctx.stroke();
  }
  // longitudinal bands, contracting in a wave down the body
  for (const f of [0.3, 0.64]) {
    ctx.beginPath();
    for (const sd of SIDES) for (let k = 0; k <= 14; k++) { const x = 0.62 - (k / 14) * 1.66, v = sd * f * AN.W(x) * (1 + 0.06 * sin(t * 4 + x * 5)); k ? sl(ctx, x, v) : sm(ctx, x, v); }
    ctx.strokeStyle = rgbStr(MUSCLE_C, 0.34 + 0.08 * lv); ctx.lineWidth = bw * (f > 0.5 ? 0.8 : 1) * (1 + 0.12 * sin(t * 3.3)); ctx.lineCap = 'round'; ctx.stroke();
  }
  if (!AN.lo) {
    ctx.beginPath();
    for (const sd of SIDES) for (const f of [0.3, 0.64]) for (let k = 0; k <= 14; k++) { const x = 0.62 - (k / 14) * 1.66, v = sd * f * AN.W(x); k ? sl(ctx, x, v) : sm(ctx, x, v); }
    ctx.strokeStyle = 'rgba(255,215,220,0.45)'; ctx.lineWidth = AN.lw(0.8); ctx.stroke();
  }
}
function protoneph(ctx, lv) {
  // osmoregulation: protonephridia, fine canals along the sides lit by flickering flame cells
  const t = AN.t, lw = AN.lw, n = 3 + 2 * lv;
  ctx.beginPath();
  for (const sd of SIDES) for (let k = 0; k <= 16; k++) { const x = 0.72 - (k / 16) * 1.75, v = sd * AN.W(x) * (0.48 + 0.04 * sin(k * 1.9)); k ? sl(ctx, x, v) : sm(ctx, x, v); }
  for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = 0.55 - (i / (n - 1)) * 1.45, v = AN.W(x) * 0.5; sm(ctx, x, sd * v); sl(ctx, x - 0.04, sd * (v + 0.08)); }
  ctx.strokeStyle = rgbStr(OSMO_C, 0.4 + 0.1 * lv); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < n; i++) {
    const x = 0.55 - (i / (n - 1)) * 1.45, fl = 0.5 + 0.5 * sin(t * 11 + i * 2.3 + sd);
    glowAt(ctx, OSMO_C, x - 0.04, sd * (AN.W(x) * 0.5 + 0.08), 0.05 + 0.02 * fl, 0.5 + 0.4 * fl, 1);
  }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
}
function toxGlands(ctx, lv) {
  // venom glands in pairs along the body, ducts opening at the margin
  const t = AN.t, n = 2 + lv, r = 0.045 + 0.01 * lv;
  ctx.beginPath();
  for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = 0.38 - (i / (n - 1)) * 1.2; sm(ctx, x, sd * AN.W(x) * 0.58); sl(ctx, x - 0.05, sd * AN.W(x) * 0.92); }
  ctx.strokeStyle = rgbStr(TOX_C, 0.5); ctx.lineWidth = AN.lw(1); ctx.stroke();
  ctx.beginPath();
  for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = 0.38 - (i / (n - 1)) * 1.2, k = 1 + 0.12 * sin(t * 2.4 + i); skin(x, sd * AN.W(x) * 0.58); ctx.moveTo(SK[0] + r * k, SK[1]); ctx.ellipse(SK[0], SK[1], r * k * 1.25, r * k, SK[2], 0, TAU); }
  ctx.fillStyle = rgbStr(TOX_C, 0.8); ctx.fill(); ctx.strokeStyle = 'rgba(230,255,200,0.7)'; ctx.lineWidth = AN.lw(0.8); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = 0.38 - (i / (n - 1)) * 1.2; glowAt(ctx, TOX_C, x, sd * AN.W(x) * 0.58, r * 3, 0.35 + 0.15 * sin(t * 2.4 + i)); }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
}
function cupEyes(ctx) {
  for (const sd of SIDES) {
    at(ctx, 0.8, sd * 0.115, sd);
    ctx.beginPath(); ctx.ellipse(0.006, 0.004, 0.074, 0.056, 0, 0, TAU); ctx.fillStyle = 'rgba(240,255,250,0.95)'; ctx.fill();
    // the pigment cup sits on the inner side and opens forward and out: the flatworm's cross-eyed stare
    ctx.beginPath(); ctx.ellipse(-0.012, -0.016, 0.05, 0.04, 0.5, 0, TAU); ctx.fillStyle = '#04131a'; ctx.fill();
    ctx.restore();
  }
}
function wormJaws(ctx, lv) {
  // a muscular proboscis shot out of the head, armed with a pair of hooked jaws
  const t = AN.t, lw = AN.lw, s = sin(t * 2.6), strike = s > 0 ? s * s : 0;
  const e = (0.06 + 0.035 * lv) * (0.35 + 0.65 * strike), R = 0.06 + 0.012 * lv;
  at(ctx, F3.xf - 0.07, 0);
  ctx.beginPath(); ctx.ellipse(e * 0.5 + 0.03, 0, e * 0.5 + R * 1.1, R, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,175,185,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(120,40,55,0.7)'; ctx.lineWidth = lw(1); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let k = 1; k <= 3; k++) { const x = 0.03 + (e + R) * (k / 4) - R * 0.4; ctx.moveTo(x, -R * 0.85); ctx.quadraticCurveTo(x + 0.02, 0, x, R * 0.85); }
    ctx.strokeStyle = 'rgba(255,225,230,0.5)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  const open = 0.25 + 0.75 * (1 - strike), L = 0.13 + 0.035 * lv, W = 0.04 + 0.008 * lv, bx = e + R * 1.05 + 0.02;
  for (const sd of SIDES) {
    ctx.save(); ctx.translate(bx, sd * R * 0.45); ctx.rotate(sd * (-0.2 + 0.7 * open)); ctx.scale(1, sd);
    ctx.beginPath(); ctx.moveTo(-0.02, W);
    ctx.bezierCurveTo(L * 0.5, W * 1.05, L * 0.92, W * 0.15, L, -L * 0.4);
    ctx.bezierCurveTo(L * 0.7, -W * 0.2, L * 0.35, -W * 0.3, -0.02, -W * 0.7);
    ctx.closePath();
    ctx.fillStyle = 'rgba(232,162,84,0.97)'; ctx.fill(); ctx.strokeStyle = 'rgba(80,38,20,0.85)'; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function wormGuard(ctx, lv) {
  // hardened plates studding the margin
  const nk = 4 + 2 * lv, sz = 0.085 + 0.018 * lv;
  ctx.beginPath();
  for (const sd of SIDES) for (let k = 0; k < nk; k++) { const x = 0.52 - (k / (nk - 1)) * 1.55; edge(x, sd); guardPlate(ctx, EP[0] - EP[2] * 0.02, EP[1] - EP[3] * 0.02, EP[2], EP[3], sz); }
  ctx.fillStyle = rgbStr([200, 245, 255], 0.3 + 0.06 * lv); ctx.fill(); ctx.strokeStyle = 'rgba(235,255,255,0.9)'; ctx.lineWidth = AN.lw(1.1); ctx.stroke();
}
function wormBody(ctx, m, n) {
  const body = AN.body, dark = AN.dark;
  ctx.fillStyle = rgbStr(body, 0.5); ctx.fill();
  // pigmented back, paler translucent margin
  insetFill(ctx, 0.82, rgbStr(dark, 0.26));
  insetFill(ctx, 0.5, rgbStr(dark, 0.22));
  emitPath(ctx, n);
}
function wormInside(ctx, m) {
  if (m.mimicry) mottle(ctx, m.mimicry);
  if (m.chloro) algae(ctx, m.chloro);
  if (m.muscle) wormMuscle(ctx, m.muscle);
  wormGut(ctx, m);
  pharynx(ctx);
  if (m.osmo) protoneph(ctx, m.osmo);
  if (m.mito) mitoGlow(ctx, m.mito);
  if (m.toxin) toxGlands(ctx, m.toxin);
  if (m.nova) novaOrgan(ctx, m.nova);
  if (!AN.lo) {
    ctx.beginPath(); scatter(ctx, 16, 0, 0.1, 0.92, 0.75, 0.011, 0.02); ctx.fillStyle = rgbStr(AN.mem, 0.4); ctx.fill();
    brain(ctx, 0.12, false);
  }
  if (m.nerve) nerveSys(ctx, m.nerve);
}
function wormFront(ctx, m) {
  const lw = AN.lw;
  if (m.guard) wormGuard(ctx, m.guard);
  if (m.biolum) biolumSpots(ctx, m.biolum);
  if (m.dash) dashGlands(ctx, m.dash);
  if (m.cnido) animalCnido(ctx, m.cnido);
  // sensory auricles: pale chemoreceptor tips
  if (!AN.lo) {
    ctx.beginPath();
    const xa = F3.xr + 0.875 * (F3.xf - F3.xr), r = 0.03 + 0.1 * AN.aur;
    for (const sd of SIDES) { skin(xa - 0.75 * aurB(xa), sd * (AN.W(xa) - r * 1.3)); ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU); }
    ctx.fillStyle = rgbStr(AN.pale, 0.4); ctx.fill();
  }
  cupEyes(ctx);
  if (m.jaws) wormJaws(ctx, m.jaws);
}

// ============================ fish (stages 4–5): shared parts ============================
function fishEye(ctx, x, v, r, lv, iris) {
  const lw = AN.lw, t = AN.t;
  skin(x, v); const ex = SK[0], ey = SK[1], a = SK[2];
  if (lv) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = AN.A0 * (0.18 + 0.1 * lv + 0.06 * sin(t * 2.5));
    const gs = r * 3.2; ctx.drawImage(glowSprite(EYE_GLOW), ex - gs, ey - gs, gs * 2, gs * 2);
    ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath(); ctx.ellipse(ex, ey, r, r * 0.86, a, 0, TAU);
  ctx.fillStyle = iris; ctx.fill(); ctx.strokeStyle = 'rgba(8,30,40,0.8)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(ex + cos(a) * r * 0.08, ey + sin(a) * r * 0.08, r * 0.64, r * 0.58, a, 0, TAU); ctx.fillStyle = '#03121a'; ctx.fill();
  if (lv >= 2 && AN.s * r > 5) { ctx.beginPath(); ctx.ellipse(ex + cos(a) * r * 0.08, ey + sin(a) * r * 0.08, r * 0.64, r * 0.58, a, 0, TAU); ctx.strokeStyle = rgbStr(EYE_GLOW, 0.5); ctx.lineWidth = lw(1); ctx.stroke(); }
  // catchlights, fixed to the world's light (upper left)
  const ca = cos(-AN.ang), sa = sin(-AN.ang), lx = -0.38 * ca + 0.42 * sa, ly = -0.38 * sa - 0.42 * ca;
  ctx.beginPath(); ctx.arc(ex + lx * r * 0.7, ey + ly * r * 0.7, r * 0.26, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  if (lv) { ctx.beginPath(); ctx.arc(ex - lx * r * 0.45, ey - ly * r * 0.45, r * 0.1, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill(); }
}
function fishEyes(ctx, m) {
  const lv = m.eyes || 0;
  if (AN.st === 4) {
    // tiny lateral eyes; an armoured head puts them on top, close together, like an ostracoderm's
    const r = 0.054 + 0.032 * lv, sh = !!m.shell, x = sh ? 0.86 : 0.9, v = sh ? AN.W(0.86) * 0.38 : AN.W(0.9) - r * 0.5;
    const iris = lv ? rgbStr(mixRGB([180, 210, 220], EYE_GLOW, 0.3, TMPC), 0.97) : 'rgba(170,200,210,0.95)';
    for (const sd of SIDES) fishEye(ctx, x, sd * v, r, lv, iris);
  } else {
    const r = 0.07 + 0.028 * lv, x = 0.84, v = AN.W(x) - r * 0.4;
    const iris = lv ? rgbStr(mixRGB([228, 196, 100], EYE_GLOW, 0.25 + 0.1 * lv, TMPC), 0.97) : 'rgba(226,192,100,0.97)';
    for (const sd of SIDES) fishEye(ctx, x, sd * v, r, lv, iris);
  }
}
function myomeres(ctx, m, x0, x1, n, vk, base) {
  // the chevron muscle blocks of a fish, pointing forward
  const mu = m.muscle || 0, mi = m.mito || 0, t = AN.t, step = (x0 - x1) / n;
  if (mu) {
    ctx.beginPath();
    for (let i = 0; i < n; i += 2) {
      const xa = x0 - i * step, xb = xa - step, wa = AN.W(xa) * vk, wb = AN.W(xb) * vk;
      sm(ctx, xa - 0.07, -wa); sl(ctx, xa + 0.05, 0); sl(ctx, xa - 0.07, wa); sl(ctx, xb - 0.07, wb); sl(ctx, xb + 0.05, 0); sl(ctx, xb - 0.07, -wb); ctx.closePath();
    }
    ctx.fillStyle = rgbStr(MUSCLE_C, (0.1 + 0.05 * mu) * (1 + 0.2 * sin(t * 3.3))); ctx.fill();
  }
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const x = x0 - i * step, w = AN.W(x) * vk; sm(ctx, x - 0.07, -w); sl(ctx, x + 0.05, 0); sl(ctx, x - 0.07, w); }
  const c = mu ? MUSCLE_C : mi ? MITO_C : AN.mem;
  ctx.strokeStyle = rgbStr(c, mu ? 0.4 + 0.1 * mu : mi ? 0.35 : base); ctx.lineWidth = AN.lw(mu ? 1.2 + 0.3 * mu : 1); ctx.stroke();
}
function swimBladder(ctx, lv) {
  // a silvery, gas-filled float seen through the body
  const s5 = AN.st === 5, lw = AN.lw;
  for (let k = 0; k < (s5 ? 2 : 1); k++) {
    const s6 = AN.st === 6; // (a pufferfish's bladder is one round chamber)
    const x = s5 ? (k ? 0.22 : -0.04) : s6 ? 0.0 : 0.02, rx = (s5 ? (k ? 0.12 : 0.19) : s6 ? 0.22 : 0.2) + 0.02 * lv, ry = (s5 ? (k ? 0.085 : 0.11) : s6 ? 0.15 : 0.07) + (s6 ? 0.014 : 0.008) * lv;
    at(ctx, x, 0);
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.save(); ctx.scale(rx, ry); ctx.fillStyle = glassGrad(ctx, [205, 228, 240]); ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(240,255,255,0.8)'; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-rx * 0.15, -ry * 0.35, rx * 0.45, ry * 0.22, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    ctx.restore();
  }
}
function lateralLine(ctx, lv) {
  // the lateral line: a canal of pressure-sensing neuromasts along each flank (and around the eyes)
  const st = AN.st, t = AN.t, lw = AN.lw, x0 = st === 4 ? 0.64 : st === 6 ? 0.5 : 0.62, x1 = st === 4 ? -1.15 : st === 6 ? -0.76 : -0.95, vk = st === 4 ? 0.42 : st === 6 ? 0.62 : 0.5;
  ctx.beginPath();
  for (const sd of SIDES) for (let k = 0; k <= 12; k++) { const x = x0 + (x1 - x0) * (k / 12); k ? sl(ctx, x, sd * AN.W(x) * vk) : sm(ctx, x, sd * AN.W(x) * vk); }
  if (lv >= 2) for (const sd of SIDES) { const ex = st === 4 ? 0.9 : st === 6 ? 0.62 : 0.8; smoothLine(ctx, [x0, AN.W(x0) * vk, ex - 0.02, AN.W(ex) * 0.62, ex + 0.16, AN.W(ex + 0.16) * 0.45, ex + 0.3, 0.06], sd); }
  ctx.strokeStyle = rgbStr(AN.mem, 0.3 + 0.06 * lv); ctx.lineWidth = lw(1); ctx.stroke();
  // the neuromasts: pale rims round dark pores
  const n = 6 + 3 * lv, r = 0.02 + 0.003 * lv;
  ctx.beginPath();
  for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * ((i + 0.5) / n); skin(x, sd * AN.W(x) * vk); ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU); }
  ctx.fillStyle = 'rgba(225,255,250,0.9)'; ctx.fill();
  if (!AN.lo) {
    ctx.beginPath();
    for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * ((i + 0.5) / n), f = 0.5 + 0.5 * sin(t * 4 - i * 0.7); skin(x, sd * AN.W(x) * vk); const rr = r * (0.38 + 0.15 * f); ctx.moveTo(SK[0] + rr, SK[1]); ctx.arc(SK[0], SK[1], rr, 0, TAU); }
    ctx.fillStyle = 'rgba(10,40,50,0.8)'; ctx.fill();
  }
}
function scutes(ctx, lv) {
  // bony scutes in rows along the flanks (and down the back at higher levels), like a sturgeon's
  const st = AN.st, n = 4 + 2 * lv, x0 = 0.4, x1 = st === 4 ? -1.0 : st === 6 ? -0.68 : -0.85, sz = 0.058 + 0.012 * lv, t = AN.t;
  ctx.beginPath();
  for (let row = 0; row < (lv >= 2 ? 3 : 2); row++) {
    const vk = row === 2 ? 0 : row ? 0.62 : -0.62, nn = row === 2 ? n - 1 : n;
    for (let i = 0; i < nn; i++) {
      const x = x0 + (x1 - x0) * ((i + (row === 2 ? 0.5 : 0)) / (n - 1)), w = AN.W(x), v = w * vk, h = min(sz * 0.7, w * 0.32);
      sm(ctx, x + sz, v); sl(ctx, x, v + h); sl(ctx, x - sz * 1.1, v); sl(ctx, x, v - h); ctx.closePath();
    }
  }
  ctx.fillStyle = rgbStr([200, 245, 255], 0.3 + 0.07 * lv); ctx.fill(); ctx.strokeStyle = 'rgba(235,255,255,0.85)'; ctx.lineWidth = AN.lw(1.1); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let row = 0; row < (lv >= 2 ? 3 : 2); row++) {
      const vk = row === 2 ? 0 : row ? 0.62 : -0.62, nn = row === 2 ? n - 1 : n;
      for (let i = 0; i < nn; i++) { const x = x0 + (x1 - x0) * ((i + (row === 2 ? 0.5 : 0)) / (n - 1)), v = AN.W(x) * vk; sm(ctx, x + sz * 0.6, v); sl(ctx, x - sz * 0.9, v); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = AN.lw(1); ctx.stroke();
    let f = t * 0.6; f -= Math.floor(f);
    const x = x0 + (x1 - x0) * f;
    ctx.globalCompositeOperation = 'lighter'; glowAt(ctx, [220, 250, 255], x, AN.W(x) * 0.62, sz * 1.4, 0.8 * sin(f * PI), 1);
    ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  }
}
// spines: the spikes trait (and the venom spines of the toxin trait), with venom glands at their bases
const SPN = new Float32Array(4 * 24);
function fishSpines(ctx, m) {
  const st = AN.st, sp = m.spikes || 0, tx = m.toxin || 0, t = AN.t, lw = AN.lw;
  const L = 0.17 + 0.05 * max(sp, tx ? 1 : 0);
  // dorsal spines lean over the same way as the dorsal fin (see dorsalFin)
  const lean = st === 4 ? 0.07 + 0.02 * sin(t * 1.7) : 0.32 * (1 + 0.16 * (m.fins || 0)) * (0.5 + 0.1 * sin(t * 1.9));
  let n = 0;
  const add = (x, v, a, l) => { SPN[n * 4] = x; SPN[n * 4 + 1] = v; SPN[n * 4 + 2] = a; SPN[n * 4 + 3] = l; n++; };
  if (st === 4) {
    // a thorny jawless fish: spines down the back and paired thorns along the flanks
    if (sp) for (let i = 0, k = 2 + sp; i < k; i++) add(0.4 - (i / (k - 1)) * 1.0, 0, 0, L * (1 - 0.25 * i / k));
    if (sp || tx) for (const sd of SIDES) add(0.38, sd, 1.1, L * 1.2);
    for (let j = 1; j < sp; j++) for (const sd of SIDES) add(0.38 - j * 0.34, sd, 1.15, L * (1 - 0.1 * j));
  } else {
    // spiny-shark style: a stout spine leading each dorsal fin, spines along the belly
    add(0.24, 0, 0, L * 1.45);
    if ((m.fins || 0) >= 2) add(-0.46, 0, 0, L * 0.85);
    if (sp >= 2) for (const sd of SIDES) for (let j = 0; j < sp - 1; j++) add(0.08 - j * 0.22, sd, 1.2, L * (0.9 - 0.1 * j));
    if (tx || sp) for (const sd of SIDES) add(0.5, sd, 0.95, 0); // pectoral spines are drawn with the fins; glands only
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = SPN[i * 4], sd = SPN[i * 4 + 1], a = SPN[i * 4 + 2], l = SPN[i * 4 + 3];
    if (!l) continue;
    if (!sd) { const lv = st === 4 ? lean : lean * 1.1; sm(ctx, x + 0.035, -0.04); sl(ctx, x - l * (st === 4 ? 1 : 0.75), lv); sl(ctx, x - 0.03, 0.045); ctx.closePath(); continue; }
    edge(x, sd); const ex = EP[0], ey = EP[1], nx = EP[2], ny = EP[3], fx = sd * ny, fy = -sd * nx, b = 0.042;
    const dx = nx * cos(a) - fx * sin(a), dy = ny * cos(a) - fy * sin(a);
    ctx.moveTo(ex + fx * b - nx * 0.03, ey + fy * b - ny * 0.03); ctx.lineTo(ex + dx * l, ey + dy * l); ctx.lineTo(ex - fx * b - nx * 0.03, ey - fy * b - ny * 0.03); ctx.closePath();
  }
  ctx.fillStyle = 'rgba(240,255,250,0.97)'; ctx.fill(); ctx.strokeStyle = 'rgba(20,60,65,0.75)'; ctx.lineWidth = lw(1); ctx.stroke();
  if (tx) {
    const r = 0.04 + 0.009 * tx, pulse = 1 + 0.12 * sin(t * 2.6);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) { const x = SPN[i * 4], sd = SPN[i * 4 + 1]; glowAt(ctx, TOX_C, x, sd ? sd * AN.W(x) * 0.78 : 0, r * 3.2, 0.35 + 0.1 * tx); }
    ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const x = SPN[i * 4], sd = SPN[i * 4 + 1]; skin(x + 0.01, sd ? sd * AN.W(x) * 0.78 : 0); ctx.moveTo(SK[0] + r * pulse, SK[1]); ctx.ellipse(SK[0], SK[1], r * pulse * 1.2, r * pulse, SK[2], 0, TAU); }
    ctx.fillStyle = rgbStr(TOX_C, 0.88); ctx.fill(); ctx.strokeStyle = 'rgba(225,255,190,0.8)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  }
}

// ============================ stage 4: jawless fish ============================
function foldW(x, xe, fw) {
  const q = (x - xe) / (-0.3 - xe);
  if (q <= 0) return 0;
  if (q >= 1) return w4(x);
  return w4(x) + fw * Math.pow(sin(PI * Math.pow(q, 0.8)), 1.1);
}
function larvaBack(ctx, m) {
  const lw = AN.lw, t = AN.t, body = AN.body, mem = AN.mem, fl = min(5, m.flagellum || 0), fins = m.fins || 0;
  // the median fin fold skirting the tail (longer and broader with the flagellum)
  const xe = F4.xr - 0.2 - 0.1 * fl, fw = 0.085 + 0.045 * fl + 0.012 * fins, xs = -0.3, N = AN.lo ? 10 : 18;
  let n = 0;
  for (let i = 0; i <= N; i++) { const x = xs - (i / N) * (xs - xe); skin(x, -foldW(x, xe, fw)); TX[n] = SK[0]; TY[n] = SK[1]; n++; }
  for (let i = N - 1; i >= 1; i--) { const x = xs - (i / N) * (xs - xe); skin(x, foldW(x, xe, fw)); TX[n] = SK[0]; TY[n] = SK[1]; n++; }
  skin(xs, w4(xs)); TX[n] = SK[0]; TY[n] = SK[1]; n++;
  skin(xs + 0.2, 0); TX[n] = SK[0]; TY[n] = SK[1]; n++;
  emitPath(ctx, n, TX, TY);
  ctx.fillStyle = rgbStr(body, 0.25 + 0.03 * fl); ctx.fill();
  ctx.strokeStyle = rgbStr(mem, 0.6 + 0.06 * fl); ctx.lineWidth = lw(1.1 + 0.15 * fl); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let x = xs - 0.06; x > xe + 0.04; x -= AN.fine ? 0.05 : 0.09) for (const sd of SIDES) { sm(ctx, x, sd * w4(x) * 0.85); sl(ctx, x - 0.06, sd * foldW(x - 0.06, xe, fw) * 0.95); }
    ctx.strokeStyle = rgbStr(mem, 0.2 + 0.04 * fl); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // paired fins: first as small flaps behind the gills, then pelvic flaps (fins); or fleshy lobes (pseudopod)
  const flap = 0.15 * sin(t * 3.4);
  if (m.pseudopod) for (const sd of SIDES) lobeFin(ctx, 0.36, sd, 0.28 + 0.08 * m.pseudopod, 0.75 + sd * flap);
  else if (fins) for (const sd of SIDES) pairedFin(ctx, 0.38, sd, 0.17 + 0.075 * fins, 0.12 + 0.025 * fins, 0.2, 0.75 + sd * flap + 0.2 * min(1, AN.sp), 3);
  if (fins >= 3) for (const sd of SIDES) pairedFin(ctx, -0.48, sd, 0.08 + 0.045 * fins, 0.07 + 0.015 * fins, 0.3, 1.0 - sd * flap, 2);
}
function larvaBody(ctx, n) {
  ctx.fillStyle = rgbStr(AN.body, 0.38); ctx.fill();
  insetFill(ctx, 0.62, rgbStr(AN.body, 0.2));
  emitPath(ctx, n);
}
function larvaInside(ctx, m) {
  const lw = AN.lw, t = AN.t, lys = m.lysosome || 0;
  if (m.mimicry) mottle(ctx, m.mimicry);
  // gut along the belly, liver behind the gills
  ctx.beginPath(); sm(ctx, 0.44, 0); for (let k = 1; k <= 8; k++) sl(ctx, 0.44 - k * 0.105, 0.012 * sin(k * 1.7));
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgbStr(lys ? mixRGB(GUT_C, LYSO_C, 0.35 + 0.1 * lys, TMPC) : GUT_C, 0.26 + 0.08 * lys); ctx.lineWidth = 0.085 + 0.012 * lys; ctx.stroke();
  skin(0.46, 0.03); ctx.beginPath(); ctx.ellipse(SK[0], SK[1], 0.1, 0.075, SK[2], 0, TAU); ctx.fillStyle = 'rgba(150,95,60,0.22)'; ctx.fill();
  if (lys) { ctx.beginPath(); for (let i = 0; i < 5 + 3 * lys; i++) { skin(0.4 - i * (0.78 / (5 + 3 * lys)), 0.025 * sin(i * 2.1)); ctx.moveTo(SK[0] + 0.018, SK[1]); ctx.arc(SK[0], SK[1], 0.018, 0, TAU); } ctx.fillStyle = rgbStr(LYSO_C, 0.9); ctx.fill(); }
  if (m.polyps) caeca(ctx, m.polyps);
  if (m.vacuole) swimBladder(ctx, m.vacuole);
  if (m.chloro) sunBask(ctx, m.chloro);
  myomeres(ctx, m, 0.52, -1.22, 17, 0.92, 0.38);
  if (m.mito) mitoGlow(ctx, m.mito);
  if (m.nova) novaOrgan(ctx, m.nova);
  // the notochord: a stiff glassy rod down the body, a stack of coin-like cells
  ctx.beginPath(); sm(ctx, 0.74, 0); for (let k = 1; k <= 16; k++) sl(ctx, 0.74 - k * 0.135, 0);
  ctx.strokeStyle = 'rgba(225,255,248,0.2)'; ctx.lineWidth = 0.065; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = 'rgba(235,255,250,0.62)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  if (AN.fine) { ctx.beginPath(); for (let x = 0.7; x > -1.4; x -= 0.045) { sm(ctx, x, -0.028); sl(ctx, x, 0.028); } ctx.strokeStyle = 'rgba(235,255,250,0.2)'; ctx.lineWidth = lw(0.8); ctx.stroke(); }
  // star-shaped pigment cells in rows along the back
  if (!AN.lo) {
    ctx.beginPath();
    for (let x = 0.6, i = 0; x > -1.2; x -= 0.17, i++) for (const sd of SIDES) {
      skin(x - (sd > 0 ? 0.08 : 0), sd * (0.06 + 0.01 * sin(i * 2.3))); const r = 0.011 + 0.004 * sin(i * 1.7 + sd);
      ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU);
      if (AN.fine) for (let k = 0; k < 4; k++) { const a = k * 1.6 + i; ctx.moveTo(SK[0], SK[1]); ctx.lineTo(SK[0] + cos(a) * r * 2.4, SK[1] + sin(a) * r * 2.4); }
    }
    ctx.fillStyle = 'rgba(12,32,42,0.5)'; ctx.fill(); ctx.strokeStyle = 'rgba(12,32,42,0.35)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // heart, beating
  const beat = 0.5 + 0.5 * sin(t * 7);
  skin(0.56, 0); ctx.beginPath(); ctx.arc(SK[0], SK[1], 0.04 * (1 + 0.22 * beat), 0, TAU); ctx.fillStyle = `rgba(255,105,130,${0.38 + 0.3 * beat})`; ctx.fill();
  // gill pores: a row of seven round openings behind each eye
  const os = m.osmo || 0;
  ctx.beginPath();
  for (const sd of SIDES) for (let i = 0; i < 7; i++) { const x = 0.75 - i * 0.052, r = 0.026 - i * 0.0012; skin(x, sd * AN.W(x) * 0.66); ctx.moveTo(SK[0] + r, SK[1]); ctx.ellipse(SK[0], SK[1], r, r * 1.15, SK[2], 0, TAU); }
  ctx.fillStyle = 'rgba(8,34,46,0.62)'; ctx.fill(); ctx.strokeStyle = rgbStr(os ? OSMO_C : AN.pale, os ? 0.9 : 0.6); ctx.lineWidth = lw(os ? 1.3 : 0.9); ctx.stroke();
  if (os) gillGlow(ctx, os, 0.75, 0.052, 7, 0.66);
  if (!AN.lo) brain(ctx, 0.14, false);
  if (m.nerve) nerveSys(ctx, m.nerve);
}
function gillGlow(ctx, lv, x0, step, n, vk) {
  // osmoregulation: salt-pumping cells light up the gills
  const t = AN.t;
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < n; i += 2) { const x = x0 - i * step, f = 0.5 + 0.5 * sin(t * 3 - i * 0.8 + sd); glowAt(ctx, OSMO_C, x, sd * AN.W(x) * vk, 0.07 + 0.015 * lv, 0.3 + 0.12 * lv * f, 1); }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
}
function dorsalFold(ctx, m) {
  // the dorsal fin fold along the back (seen from above it leans to one side); fins raise it into a real fin
  const fins = m.fins || 0, t = AN.t, lw = AN.lw, x0 = 0.32, x1 = -1.28, N = 14, lean = 0.75 + 0.25 * sin(t * 1.7);
  const h = (u) => (0.05 + 0.012 * fins + (0.03 + 0.03 * fins) * Math.pow(sin(PI * min(1, u * 1.3)), 2)) * lean;
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { const x = x0 + (x1 - x0) * (i / N); i ? sl(ctx, x, 0) : sm(ctx, x, 0); }
  for (let i = N; i >= 0; i--) { const u = i / N, x = x0 + (x1 - x0) * u; sl(ctx, x - 0.04 * u, h(u) * (u < 0.08 ? u / 0.08 : 1)); }
  ctx.closePath();
  ctx.fillStyle = rgbStr(AN.body, 0.32); ctx.fill(); ctx.strokeStyle = rgbStr(AN.mem, 0.55); ctx.lineWidth = lw(1); ctx.stroke();
  if (AN.fine) {
    ctx.beginPath();
    for (let i = 1; i < N; i++) { const u = i / N, x = x0 + (x1 - x0) * u; sm(ctx, x, 0); sl(ctx, x - 0.05 - 0.04 * u, h(u) * 0.92); }
    ctx.strokeStyle = rgbStr(AN.mem, 0.25); ctx.lineWidth = lw(0.7); ctx.stroke();
  }
}
function larvaShield(ctx, lv) {
  // a bony head shield like Cephalaspis: horn-like cornua at the back corners, eyes peering up through it
  const lw = AN.lw, xb = 0.46 - 0.06 * lv, k = 1.08 + 0.03 * lv, N = 9, horn = lv >= 2 ? 0.1 + 0.06 * lv : 0;
  ctx.beginPath();
  sm(ctx, F4.xf + 0.03, 0);
  for (let i = 1; i <= N; i++) { const x = F4.xf - (i / N) * (F4.xf - xb); sl(ctx, x, -AN.W(x) * k - 0.012); }
  if (horn) { sl(ctx, xb - horn, -(AN.W(xb) * k + 0.05 + 0.02 * lv)); sl(ctx, xb + 0.02, -AN.W(xb) * 0.8); }
  skin(xb + 0.1, 0); const cx = SK[0], cy = SK[1];
  skin(xb + 0.02, AN.W(xb) * (horn ? 0.8 : k)); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
  if (horn) sl(ctx, xb - horn, AN.W(xb) * k + 0.05 + 0.02 * lv);
  for (let i = N; i >= 1; i--) { const x = F4.xf - (i / N) * (F4.xf - xb); sl(ctx, x, AN.W(x) * k + 0.012); }
  ctx.closePath();
  skin((F4.xf + xb) / 2, 0);
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2]); ctx.scale(1, 0.36 + 0.03 * lv); ctx.fillStyle = bandGrad(ctx, SHELL_C); ctx.globalAlpha *= 0.85; ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(255,248,225,0.9)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  // sensory fields along the rim, the pineal opening, and bony tubercles
  ctx.beginPath();
  for (const sd of SIDES) { sm(ctx, 1.02, sd * AN.W(1.02) * 0.78); for (let i = 1; i <= 5; i++) { const x = 1.02 - (i / 5) * (1.02 - xb - 0.06); sl(ctx, x, sd * AN.W(x) * 0.84); } }
  ctx.strokeStyle = 'rgba(150,100,55,0.55)'; ctx.lineWidth = lw(1); ctx.setLineDash([0.035, 0.03]); ctx.stroke(); ctx.setLineDash([]);
  if (AN.fine) { ctx.beginPath(); scatter(ctx, 20, 12, 0.05, (F4.xf - xb - 0.04) / (F4.xf - F4.xr), 0.72, 0.01, 0.015); ctx.fillStyle = 'rgba(255,250,232,0.6)'; ctx.fill(); }
  skin(0.98, 0); ctx.beginPath(); ctx.arc(SK[0], SK[1], 0.018, 0, TAU); ctx.fillStyle = 'rgba(90,60,30,0.7)'; ctx.fill();
  // orbits
  ctx.beginPath(); for (const sd of SIDES) { skin(0.86, sd * AN.W(0.86) * 0.38); const r = 0.06 + 0.032 * (AN.m.eyes || 0); ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU); }
  ctx.fillStyle = 'rgba(120,80,40,0.5)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,245,215,0.8)'; ctx.lineWidth = lw(1); ctx.stroke();
  if (lv >= 3) {
    // a dorsal spine at the back of the shield, and rows of bony trunk scales behind it
    ctx.beginPath(); sm(ctx, xb + 0.08, -0.03); sl(ctx, xb - 0.32, 0.02); sl(ctx, xb + 0.08, 0.03); ctx.closePath();
    ctx.fillStyle = 'rgba(250,232,190,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(130,85,40,0.6)'; ctx.lineWidth = lw(0.9); ctx.stroke();
    ctx.beginPath();
    for (let x = xb - 0.04; x > -0.35; x -= 0.07) { const w = AN.W(x) * 0.95; sm(ctx, x, -w); skin(x - 0.035, 0); const qx = SK[0], qy = SK[1]; skin(x, w); ctx.quadraticCurveTo(qx, qy, SK[0], SK[1]); }
    ctx.strokeStyle = rgbStr(SHELL_C, 0.6); ctx.lineWidth = lw(1.3); ctx.stroke();
  }
}
function lampreyDisc(ctx, lv) {
  // jawless "jaws": a round sucker ringed with rows of horny teeth (a lamprey's oral disc)
  const t = AN.t, lw = AN.lw, R = 0.12 + 0.035 * lv, pul = 1 + 0.07 * sin(t * 4.5);
  at(ctx, F4.xf - 0.03 + R * 0.32, 0);
  ctx.scale(0.62 * pul, pul);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fillStyle = 'rgba(255,190,195,0.94)'; ctx.fill(); ctx.strokeStyle = 'rgba(110,40,55,0.75)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU, w = 0.15 * sin(t * 6 + i); ctx.moveTo(cos(a) * R, sin(a) * R); ctx.lineTo(cos(a + w) * R * 1.16, sin(a + w) * R * 1.16); }
    ctx.strokeStyle = 'rgba(255,215,220,0.7)'; ctx.lineWidth = lw(1); ctx.stroke();
  }
  ctx.beginPath();
  for (let row = 0; row < (lv >= 2 ? 3 : 2); row++) {
    const rr = R * [0.82, 0.62, 0.44][row], nt = [12, 10, 8][row] + 2 * lv, tl = R * (0.13 - row * 0.02), tw = (PI / nt) * 0.55;
    for (let i = 0; i < nt; i++) { const a = ((i + row * 0.5) / nt) * TAU; ctx.moveTo(cos(a - tw) * rr, sin(a - tw) * rr); ctx.lineTo(cos(a) * (rr - tl), sin(a) * (rr - tl)); ctx.lineTo(cos(a + tw) * rr, sin(a + tw) * rr); }
  }
  ctx.fillStyle = 'rgba(255,224,140,0.97)'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.26, 0, TAU); ctx.fillStyle = '#2a0812'; ctx.fill();
  ctx.restore();
}
function larvaMouth(ctx) {
  // an oral hood: a round, jawless mouth fringed with little cirri
  const lw = AN.lw;
  at(ctx, F4.xf - 0.05, 0);
  ctx.beginPath(); ctx.ellipse(0, 0, 0.04, 0.075, 0, 0, TAU); ctx.fillStyle = 'rgba(20,10,20,0.6)'; ctx.fill(); ctx.strokeStyle = rgbStr(AN.pale, 0.8); ctx.lineWidth = lw(1.1); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let i = 0; i < 7; i++) { const a = -1.2 + (i / 6) * 2.4; ctx.moveTo(cos(a) * 0.045, sin(a) * 0.08); ctx.lineTo(cos(a) * 0.085, sin(a) * 0.11); }
    ctx.strokeStyle = rgbStr(AN.pale, 0.6); ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  ctx.restore();
}
function larvaFront(ctx, m) {
  dorsalFold(ctx, m);
  if (m.guard) scutes(ctx, m.guard);
  if (m.cilia) lateralLine(ctx, m.cilia);
  if (m.spikes || m.toxin) fishSpines(ctx, m);
  if (m.biolum) biolumSpots(ctx, m.biolum);
  if (m.dash) dashMuscle(ctx, m.dash);
  if (m.shell) larvaShield(ctx, m.shell);
  else if (!AN.lo) {
    // single nostril on top of the head, and the pale pineal spot behind it
    ctx.beginPath(); skin(1.0, 0); ctx.arc(SK[0], SK[1], 0.022, 0, TAU); ctx.fillStyle = 'rgba(8,30,40,0.6)'; ctx.fill();
    ctx.beginPath(); skin(0.9, 0); ctx.arc(SK[0], SK[1], 0.018, 0, TAU); ctx.fillStyle = 'rgba(235,255,250,0.55)'; ctx.fill();
  }
  if (m.cnido) stingSlime(ctx, m.cnido);
  fishEyes(ctx, m);
  if (m.jaws) lampreyDisc(ctx, m.jaws); else larvaMouth(ctx);
}

// ============================ stage 5: jawed fish ============================
function fishBack(ctx, m) {
  const t = AN.t, lw = AN.lw, body = AN.body, mem = AN.mem, fins = m.fins || 0, fl = min(5, m.flagellum || 0), sp = AN.sp, pp = m.pseudopod || 0;
  // forked tail fin, longer and stronger with the flagellum
  const L = 0.6 * (1 + 0.16 * fl + 0.06 * fins), S = 0.5 * (1 + 0.12 * fl + 0.06 * fins), streamer = fl >= 2 ? 0.12 * (fl - 1) : 0;
  const lag = (0.3 + 0.14 * sp) * 0.55 * sin(AN.ph + 2.5 * F5.xr - 1.2), flex = 0.1 * sin(AN.ph + 2.5 * F5.xr - 2.2);
  skin(F5.xr + 0.03, 0);
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2] + PI + lag);
  caudalPath(ctx, L, S, flex, streamer);
  ctx.fillStyle = rgbStr(body, 0.38 + 0.04 * fl); ctx.fill();
  ctx.strokeStyle = rgbStr(mem, 0.8); ctx.lineWidth = lw(1.3 + 0.15 * fl); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) { const v = k / 3, ex = L * (0.62 + 0.36 * abs(v) * (1 + streamer)), ey = v * S * 0.9 + flex * (0.5 + 0.5 * abs(v)); ctx.moveTo(0.03, v * 0.05); ctx.quadraticCurveTo(ex * 0.5, v * S * 0.42 + flex * 0.2, ex, ey); }
    ctx.strokeStyle = rgbStr(mem, 0.3 + 0.04 * fl); ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  ctx.restore();
  // pelvic fins
  const flap = 0.13 * sin(t * 3.2);
  for (const sd of SIDES) {
    if (pp >= 2) lobeFin(ctx, -0.4, sd, 0.26 + 0.05 * pp, 1.0);
    else pairedFin(ctx, -0.42, sd, 0.26 * (1 + 0.16 * fins), 0.13 * (1 + 0.1 * fins), 0.45, 1.0 - sd * flap, 3);
  }
  if (m.gills) gillFilaments(ctx, m.gills);
  // pectoral fins: shark-like, swept back when swimming fast; fleshy lobes with pseudopods
  for (const sd of SIDES) {
    const sw = 0.62 + sd * flap + 0.3 * min(1, sp);
    if (pp) lobeFin(ctx, 0.36, sd, 0.44 + 0.08 * pp, sw + 0.05);
    else {
      const Lp = 0.5 * (1 + 0.15 * fins), Cp = 0.22 * (1 + 0.1 * fins);
      pairedFin(ctx, 0.4, sd, Lp, Cp, 0.85, sw, 5);
      if (m.spikes || m.toxin) {
        // a stout spine along the leading edge
        skin(0.4, sd * (AN.W(0.4) - 0.04));
        ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2] + sd * (PI / 2 + sw)); ctx.scale(1, sd);
        const Ls = Lp * (0.95 + 0.08 * max(m.spikes || 0, 1));
        ctx.beginPath(); ctx.moveTo(0, -Cp * 0.55); ctx.quadraticCurveTo(Ls * 0.5, -Cp * 0.72, Ls, -Cp * 0.6); ctx.lineTo(0, -Cp * 0.3); ctx.closePath();
        ctx.fillStyle = 'rgba(236,255,250,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,80,85,0.55)'; ctx.lineWidth = lw(0.9); ctx.stroke();
        ctx.restore();
      }
    }
  }
}
function gillFilaments(ctx, lv) {
  // crimson gill filaments fanning out from under the gill cover with every breath
  // (a pufferfish's gill opening is a small slit just in front of the pectoral fin)
  const t = AN.t, lw = AN.lw, br = 0.5 + 0.5 * sin(t * 2.2), L = (0.1 + 0.05 * lv) * (0.7 + 0.3 * br), gx = AN.st === 6 ? 0.4 : 0.47;
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) glowAt(ctx, GILL_C, gx, sd * (AN.W(gx) + L * 0.3), L * 2.2, 0.25 + 0.08 * lv + 0.15 * br);
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (const sd of SIDES) for (let k = 0; k < 4; k++) {
      const x = gx + 0.06 - k * (AN.st === 6 ? 0.03 : 0.04); edge(x, sd);
      const a = Math.atan2(EP[3], EP[2]) - sd * (0.5 + k * 0.18) + 0.1 * sin(t * 2.3 + k), len = L * (1 - 0.1 * k), ca = cos(a), sa = sin(a);
      const bx = EP[0] - EP[2] * 0.04, by = EP[1] - EP[3] * 0.04;
      if (!pass) { ctx.moveTo(bx, by); ctx.lineTo(bx + ca * len, by + sa * len); }
      else for (let j = 1; j <= 5; j++) { const u = j / 6, x2 = bx + ca * len * u, y2 = by + sa * len * u, l = 0.035 * (1.1 - 0.5 * u); for (const s2 of SIDES) { ctx.moveTo(x2, y2); ctx.lineTo(x2 + cos(a + s2 * 1.1) * l, y2 + sin(a + s2 * 1.1) * l); } }
    }
    ctx.strokeStyle = pass ? 'rgba(255,170,190,0.85)' : 'rgba(255,90,120,0.95)'; ctx.lineWidth = lw(pass ? 1 : 2.2); ctx.lineCap = 'round'; ctx.stroke();
  }
}
function fishBody(ctx, n) {
  ctx.fillStyle = rgbStr(AN.body, 0.88); ctx.fill();
  // countershading: a dark back fading to pale flanks, sprinkled with small spots
  insetFill(ctx, 0.8, rgbStr(AN.dark, 0.16));
  insetFill(ctx, 0.58, rgbStr(AN.dark, 0.18));
  insetFill(ctx, 0.32, rgbStr(AN.dark, 0.2));
  if (!AN.lo) { ctx.beginPath(); scatter(ctx, 22, 30, 0.12, 0.88, 0.62, 0.012, 0.024); ctx.fillStyle = rgbStr(AN.dark, 0.38); ctx.fill(); }
  emitPath(ctx, n);
}
function fishGut(ctx, lv) {
  // the gut shows through: a spiral-valve intestine flecked with digestive granules
  const lw = AN.lw;
  ctx.beginPath(); sm(ctx, 0.42, 0.05); for (let k = 1; k <= 8; k++) sl(ctx, 0.42 - k * 0.12, 0.05 + 0.02 * sin(k * 1.4));
  ctx.lineCap = 'round'; ctx.strokeStyle = rgbStr(mixRGB(GUT_C, LYSO_C, 0.4, TMPC), 0.45 + 0.08 * lv); ctx.lineWidth = 0.1 + 0.012 * lv; ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath(); for (let x = 0.3; x > -0.5; x -= 0.05) { sm(ctx, x + 0.025, 0.0); sl(ctx, x - 0.025, 0.1); }
    ctx.strokeStyle = 'rgba(255,215,215,0.4)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  ctx.beginPath();
  for (let i = 0; i < 5 + 3 * lv; i++) { skin(0.38 - i * (0.9 / (5 + 3 * lv)), 0.05 + 0.03 * sin(i * 2.3)); ctx.moveTo(SK[0] + 0.02, SK[1]); ctx.arc(SK[0], SK[1], 0.02, 0, TAU); }
  ctx.fillStyle = rgbStr(LYSO_C, 0.92); ctx.fill();
}
function scales(ctx, lv) {
  // overlapping bony scales, spreading forward over the body with each level
  const xF = min(0.5, -0.1 + 0.28 * lv), r = 0.066 + 0.006 * lv, dx = r * 1.2, dy = r * 1.3;
  if (!AN.lo) {
    ctx.beginPath();
    let row = 0;
    for (let x = xF; x > AN.xr - 0.04; x -= dx, row++) {
      const w = AN.W(x) + r * 0.3;
      for (let v = -w + (row & 1 ? dy * 0.5 : 0); v <= w; v += dy) {
        const f = v / w; if (x > xF - 0.16 * f * f) continue; // the scaled field ends in a curve behind the head
        skin(x, v); const a = SK[2]; ctx.moveTo(SK[0] + cos(a + PI / 2) * r, SK[1] + sin(a + PI / 2) * r); ctx.arc(SK[0], SK[1], r, a + PI / 2, a + PI * 1.5); }
    }
    ctx.fillStyle = rgbStr(HIDE_C, 0.16 + 0.05 * lv); ctx.fill();
    ctx.strokeStyle = rgbStr(HIDE_EDGE, 0.42 + 0.1 * lv); ctx.lineWidth = AN.lw(1); ctx.stroke();
  } else { insetFill(ctx, 1, rgbStr(HIDE_C, 0.25)); }
}
function gillSlits(ctx, m) {
  const lw = AN.lw, os = m.osmo || 0;
  ctx.beginPath();
  for (const sd of SIDES) for (let i = 0; i < 5; i++) { const x = 0.66 - i * 0.055, w = AN.W(x); sm(ctx, x + 0.012, sd * w * 0.52); skin(x - 0.022, sd * w * 0.78); const cx = SK[0], cy = SK[1]; skin(x + 0.004, sd * w * 1.05); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]); }
  ctx.strokeStyle = 'rgba(6,34,46,0.6)'; ctx.lineWidth = lw(1.7); ctx.lineCap = 'round'; ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (const sd of SIDES) for (let i = 0; i < 5; i++) { const x = 0.66 - i * 0.055 - 0.018, w = AN.W(x); sm(ctx, x + 0.012, sd * w * 0.56); skin(x - 0.022, sd * w * 0.8); const cx = SK[0], cy = SK[1]; skin(x + 0.004, sd * w * 1.05); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]); }
    ctx.strokeStyle = rgbStr(os ? OSMO_C : AN.pale, os ? 0.7 : 0.35); ctx.lineWidth = lw(1); ctx.stroke();
  }
  if (os) gillGlow(ctx, os, 0.66, 0.055, 5, 0.8);
}
function operculum(ctx, lv) {
  // a bony gill cover whose free rear edge lifts with every breath
  const t = AN.t, lw = AN.lw, br = 0.5 + 0.5 * sin(t * 2.2), lift = (0.015 + 0.012 * lv) * br;
  ctx.beginPath();
  for (const sd of SIDES) {
    sm(ctx, 0.74, sd * AN.W(0.74) * 0.45);
    skin(0.62, sd * AN.W(0.62) * 0.3); let cx = SK[0], cy = SK[1];
    skin(0.44, sd * AN.W(0.44) * 0.62); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    skin(0.4, sd * (AN.W(0.4) * 0.92 + lift)); cx = SK[0]; cy = SK[1];
    skin(0.47, sd * (AN.W(0.47) + lift * 1.6)); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    for (let k = 1; k <= 4; k++) { const x = 0.47 + k * 0.065; sl(ctx, x, sd * AN.W(x) * (1 - 0.1 * k)); }
    ctx.closePath();
  }
  ctx.fillStyle = rgbStr(mixRGB(AN.body, BONE_C, 0.35, TMPC), 0.55); ctx.fill();
  ctx.strokeStyle = rgbStr(BONE_C, 0.85); ctx.lineWidth = lw(1.3); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (const sd of SIDES) for (let k = 1; k <= 2; k++) { const f = 1 - k * 0.25; sm(ctx, 0.7, sd * AN.W(0.7) * 0.5); skin(0.6, sd * AN.W(0.6) * (0.45 + 0.1 * k)); const cx = SK[0], cy = SK[1]; skin(0.47 + 0.05 * k, sd * AN.W(0.47) * (0.65 + 0.3 * f)); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]); }
    ctx.strokeStyle = rgbStr(BONE_C, 0.3); ctx.lineWidth = lw(0.9); ctx.stroke();
  }
}
function placoderm(ctx, lv) {
  // placoderm armour: a bony head shield, then (with levels) a thoracic shield hinged behind it
  const lw = AN.lw, xe = lv >= 3 ? -0.08 : lv >= 2 ? 0.14 : 0.46, k = 1.05, N = 10;
  const plate = (xa, xb, front) => {
    ctx.beginPath();
    if (front) sm(ctx, F5.xf + 0.02, 0); else sm(ctx, xa, -AN.W(xa) * k);
    for (let i = front ? 1 : 0; i <= N; i++) { const x = xa - (i / N) * (xa - xb); sl(ctx, x, -AN.W(x) * k - 0.01); }
    skin(xb + 0.05, 0); const cx = SK[0], cy = SK[1]; skin(xb, AN.W(xb) * k + 0.01); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    for (let i = N; i >= (front ? 1 : 0); i--) { const x = xa - (i / N) * (xa - xb); sl(ctx, x, AN.W(x) * k + 0.01); }
    if (!front) { skin(xa + 0.05, 0); const qx = SK[0], qy = SK[1]; skin(xa, -AN.W(xa) * k - 0.01); ctx.quadraticCurveTo(qx, qy, SK[0], SK[1]); }
    ctx.closePath();
    skin((xa + xb) / 2, 0);
    ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2]); ctx.scale(1, AN.W((xa + xb) / 2) * 1.1); ctx.fillStyle = bandGrad(ctx, SHELL_C); ctx.globalAlpha *= 0.62 + 0.08 * lv; ctx.fill(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,246,220,0.9)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  };
  plate(F5.xf, 0.5, true);
  if (lv >= 2) plate(0.47, xe, false);
  // sutures between the plates, and bony tubercles
  ctx.beginPath();
  sm(ctx, 1.02, 0); sl(ctx, 0.56, 0);
  for (const sd of SIDES) { sm(ctx, 0.9, 0); sl(ctx, 0.74, sd * AN.W(0.74) * 0.55); sl(ctx, 0.52, sd * AN.W(0.52) * 0.6); }
  if (lv >= 2) { sm(ctx, 0.44, 0); sl(ctx, xe + 0.04, 0); for (const sd of SIDES) { sm(ctx, 0.36, sd * AN.W(0.36) * 0.35); sl(ctx, xe + 0.06, sd * AN.W(xe) * 0.5); } }
  ctx.strokeStyle = 'rgba(140,92,48,0.6)'; ctx.lineWidth = lw(1); ctx.stroke();
  if (AN.fine) { ctx.beginPath(); scatter(ctx, 16 + 8 * lv, 12, 0.08, (F5.xf - xe - 0.04) / (F5.xf - F5.xr), 0.82, 0.01, 0.016); ctx.fillStyle = 'rgba(255,250,232,0.55)'; ctx.fill(); }
  if (lv >= 3) {
    // spinal plates: bony spines jutting back from the armour's sides
    ctx.beginPath();
    for (const sd of SIDES) { edge(0.3, sd); const ex = EP[0], ey = EP[1], nx = EP[2], ny = EP[3], fx = sd * ny, fy = -sd * nx; ctx.moveTo(ex + fx * 0.06, ey + fy * 0.06); ctx.lineTo(ex + nx * 0.16 - fx * 0.32, ey + ny * 0.16 - fy * 0.32); ctx.lineTo(ex - fx * 0.08 - nx * 0.02, ey - fy * 0.08 - ny * 0.02); ctx.closePath(); }
    ctx.fillStyle = 'rgba(248,226,180,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(130,85,40,0.6)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
}
function dorsalFin(ctx, xa, xb, H) {
  // the dorsal fin rises from the midline; seen from above it leans over to one side as the fish rolls,
  // its tip trailing back (with a soft shadow on the back beneath it)
  const t = AN.t, lw = AN.lw, lean = H * (0.5 + 0.1 * sin(t * 1.9)), tipX = xb - H * 0.5;
  const path = (dv) => {
    ctx.beginPath(); sm(ctx, xa, dv * 0.3);
    skin(xa - H * 0.15, lean * 0.95 + dv); let cx = SK[0], cy = SK[1];
    skin(tipX, lean + dv); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    skin(xb - H * 0.12, lean * 0.4 + dv); cx = SK[0]; cy = SK[1];
    skin(xb, dv * 0.3); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    ctx.closePath();
  };
  path(0.035); ctx.fillStyle = rgbStr(AN.dark, 0.3); ctx.fill();
  path(0);
  ctx.fillStyle = rgbStr(mixRGB(AN.body, AN.dark, 0.3, TMPD), 0.82); ctx.fill();
  ctx.strokeStyle = rgbStr(AN.mem, 0.8); ctx.lineWidth = lw(1.1); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let k = 1; k <= 4; k++) { const u = k / 5, x = xa + (xb - xa) * u; sm(ctx, x, 0); sl(ctx, tipX + (xb - tipX) * u * 0.55, lean * (1 - 0.6 * u)); }
    ctx.strokeStyle = rgbStr(AN.mem, 0.35); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
}
function barbels(ctx, lv) {
  // whisker barbels round the mouth (catfish-style), feeling the water as they wave
  const t = AN.t, lw = AN.lw, L0 = 0.42 + 0.13 * min(lv, 5), N = 12;
  const pairs = min(3, lv);
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let q = 0; q < pairs; q++) {
      const x = [1.02, 1.13, 0.94][q], vk = [0.82, 0.38, 0.32][q], a0 = [0.95, 0.5, 1.35][q], L = L0 * [1.1, 0.55, 0.62][q], step = L / N;
      for (const sd of SIDES) {
        skin(x, sd * AN.W(x) * vk);
        let px = SK[0], py = SK[1], a = SK[2] + sd * a0;
        ctx.moveTo(px, py);
        const kk = pass ? N : N >> 1;
        for (let k = 1; k <= kk; k++) {
          const u = k / N;
          // bend back progressively towards the tip, with a slow wave running along
          a += sd * (0.03 + 0.17 * u * (1 + 0.2 * sin(t * 1.3 + q))) + 0.13 * sin(t * 2.2 + q * 1.7 + sd - u * 4.5) * u;
          px += cos(a) * step; py += sin(a) * step; ctx.lineTo(px, py);
        }
      }
    }
    ctx.strokeStyle = pass ? rgbStr(mixRGB(AN.body, WHITE, 0.55, TMPC), 0.95) : rgbStr(AN.body, 0.5);
    ctx.lineWidth = lw(pass ? 1.8 : 4.6); ctx.lineCap = 'round'; ctx.stroke();
  }
}
function fishMouth(ctx) {
  ctx.beginPath(); sm(ctx, 1.1, -0.08); skin(1.185, 0); const cx = SK[0], cy = SK[1]; skin(1.1, 0.08); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
  ctx.strokeStyle = 'rgba(6,30,40,0.55)'; ctx.lineWidth = AN.lw(1.3); ctx.lineCap = 'round'; ctx.stroke();
}
function fishJaws(ctx, lv) {
  // real jaws: a toothed lower jaw that drops open in front of the snout, then snaps shut
  const t = AN.t, lw = AN.lw, s = sin(t * 3.1), gape = 0.42 + 0.58 * (s > 0 ? s * s : 0) - 0.42 * (s < 0 ? s * s * s * s : 0);
  const ry = 0.2 + 0.035 * lv, rxu = 0.2, rxl = rxu + 0.04 + gape * (0.11 + 0.035 * lv), A = 1.25;
  at(ctx, F5.xf - 0.25, 0);
  ctx.beginPath(); ctx.ellipse(0, 0, rxl, ry * 1.03, 0, -A, A); ctx.ellipse(0, 0, rxu, ry, 0, A, -A, true); ctx.closePath();
  ctx.fillStyle = 'rgba(45,6,20,0.94)'; ctx.fill();
  const nt = 6 + 2 * lv, tl = 0.045 + 0.012 * lv, tw = (A / nt) * 0.8;
  ctx.beginPath();
  for (let i = 0; i < nt; i++) {
    const a = -A * 0.95 + ((i + 0.5) / nt) * A * 1.9, c = cos(a), sn = sin(a);
    ctx.moveTo(rxu * cos(a - tw), ry * sin(a - tw)); ctx.lineTo(rxu * c + c * tl, ry * sn + sn * tl * 0.6); ctx.lineTo(rxu * cos(a + tw), ry * sin(a + tw));
    ctx.moveTo(rxl * cos(a - tw), ry * 1.03 * sin(a - tw)); ctx.lineTo(rxl * c - c * tl, ry * 1.03 * sn - sn * tl * 0.6); ctx.lineTo(rxl * cos(a + tw), ry * 1.03 * sin(a + tw));
  }
  ctx.fillStyle = '#fffaf0'; ctx.fill(); ctx.strokeStyle = 'rgba(90,40,40,0.45)'; ctx.lineWidth = lw(0.6); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, rxl, ry * 1.03, 0, -A - 0.12, A + 0.12);
  ctx.strokeStyle = rgbStr(BONE_C, 0.95); ctx.lineWidth = lw(2.4 + 0.5 * lv); ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, rxu, ry, 0, -A, A); ctx.strokeStyle = rgbStr(AN.pale, 0.8); ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.restore();
}
function fishInside(ctx, m) {
  if (m.mimicry) mottle(ctx, m.mimicry);
  if (m.chloro) sunBask(ctx, m.chloro);
  if (m.vacuole) swimBladder(ctx, m.vacuole);
  if (m.lysosome) fishGut(ctx, m.lysosome);
  if (m.polyps) caeca(ctx, m.polyps);
  if (m.muscle || m.mito) myomeres(ctx, m, 0.5, -0.95, 12, 0.92, 0.1);
  if (m.mito) mitoGlow(ctx, m.mito);
  if (m.hide) scales(ctx, m.hide);
  if (m.nova) novaOrgan(ctx, m.nova);
  if (m.nerve) nerveSys(ctx, m.nerve);
  gillSlits(ctx, m);
}
function fishFront(ctx, m) {
  if (m.gills) operculum(ctx, m.gills);
  if (m.shell) placoderm(ctx, m.shell);
  if (m.guard) scutes(ctx, m.guard);
  if (m.cilia) lateralLine(ctx, m.cilia);
  if (m.biolum) biolumSpots(ctx, m.biolum);
  const fins = m.fins || 0;
  dorsalFin(ctx, 0.16, -0.22, 0.32 * (1 + 0.16 * fins));
  if (fins >= 2) dorsalFin(ctx, -0.52, -0.7, 0.15 * (1 + 0.12 * fins));
  if (m.spikes || m.toxin) fishSpines(ctx, m);
  if (m.dash) dashMuscle(ctx, m.dash);
  if (m.cnido) stingSlime(ctx, m.cnido);
  fishEyes(ctx, m);
  if (m.jaws) fishJaws(ctx, m.jaws); else fishMouth(ctx);
}

// ============================ stage 6: pufferfish ============================
// Drawn in the same rest frame as the other animals (F6, w6). Inflation (AN.pk) is handled by skin(), which maps
// the rest body onto a ball of radius PUFF_R, so every trait placed with skin()/edge()/at() follows the balloon.
const TET_Y = [255, 214, 64], TET_D = [42, 34, 32], PRICKLE_C = [0, 0, 0];
const smooth01 = (k) => k * k * (3 - 2 * k);
// how far the prickles stand up (0 folded flat … 1 straight out): inflation raises them; porcupinefish spines
// (spikes), Prickles (hide) and venom spines (toxin) keep them a little raised even at rest
function prickleUp(m) { return max(smooth01(AN.pk), 0.13 * (m.spikes || 0) + 0.075 * (m.hide || 0) + 0.06 * (m.toxin || 0)); }
// the prickles round the outline, drawn behind the body: lying back along the skin, then standing straight out
function prickleRim(ctx, m) {
  const up = prickleUp(m);
  if (up < 0.02) return;
  const hd = m.hide || 0, sp = m.spikes || 0, lw = AN.lw;
  const n = (AN.lo ? 9 : 14) + (hd ? 2 + 2 * hd : 0) + (sp ? 2 : 0);
  const Lf = 0.06 + 0.02 * hd + 0.05 * sp, Ls = 0.35 * (1 + 0.1 * hd + 0.14 * sp), b = 0.034 + 0.005 * hd + 0.006 * sp;
  const L = Lf + (Ls - Lf) * up, a = (up * PI) / 2, ca = cos(a), sa = sin(a);
  ctx.beginPath();
  for (const sd of SIDES) for (let i = 0; i < n; i++) {
    // spaced evenly round the inflated ball (cosine spacing along the body), clear of the beak
    const u = 0.5 - 0.5 * cos((PI * (i + 0.5 + 0.25 * sd)) / n), x = F6.xr + 0.03 + u * (F6.xf - 0.1 - F6.xr - 0.03);
    edge(x, sd, 0.97);
    const ex = EP[0], ey = EP[1], nx = EP[2], ny = EP[3], bx = -sd * ny, by = sd * nx; // (bx, by): back along the skin
    const dx = bx * ca + nx * sa, dy = by * ca + ny * sa, l = L * (0.82 + 0.09 * ((i * 7) % 3)), fx = -dy * b, fy = dx * b;
    ctx.moveTo(ex + fx, ey + fy); ctx.lineTo(ex + dx * l, ey + dy * l); ctx.lineTo(ex - fx, ey - fy); ctx.closePath();
  }
  ctx.globalAlpha = AN.A0 * min(1, up * 4);
  ctx.fillStyle = rgbStr(mixRGB(AN.mem, WHITE, 0.45, PRICKLE_C), 0.96); ctx.fill();
  ctx.strokeStyle = 'rgba(16,52,62,0.62)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  ctx.globalAlpha = AN.A0;
}
// the prickles over the back (inside the body clip): little folded strokes at rest; inflated they stand up out of
// the skin and, seen from above, lean out from the middle of the ball
function prickleField(ctx, m) {
  const pk = AN.pk, hd = m.hide || 0, sp = m.spikes || 0, lw = AN.lw, up = prickleUp(m);
  if (AN.lo && up < 0.25) return;
  const n = (AN.lo ? 14 : AN.fine ? 34 : 24) + 9 * hd + 4 * sp;
  const Lf = 0.045 + 0.012 * hd + 0.03 * sp, Ls = 0.15 + 0.025 * hd + 0.05 * sp, Rb = 0.75 + 0.8 * pk;
  skin((F6.xf + F6.xr) / 2, 0); const cx = SK[0], cy = SK[1];
  const B = TX; // base points, reused below for the dots
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const o = ((i * 5 + 11) % 96) * 3, u = 0.05 + 0.88 * SCAT[o], x = F6.xf - u * (F6.xf - F6.xr), v = SCAT[o + 1] * 0.88 * w6(x);
    skin(x - Lf, v * 0.97); const fx = SK[0], fy = SK[1];
    skin(x, v); const px = SK[0], py = SK[1], k = Ls / Rb;
    const tx = fx + (px + (px - cx) * k - fx) * up, ty = fy + (py + (py - cy) * k - fy) * up;
    ctx.moveTo(px, py); ctx.lineTo(tx, ty);
    B[i * 2] = px; B[i * 2 + 1] = py;
  }
  ctx.strokeStyle = rgbStr(mixRGB(AN.mem, WHITE, 0.35, PRICKLE_C), min(0.9, 0.2 + 0.12 * hd + 0.55 * up)); ctx.lineWidth = lw(0.9 + 0.5 * up + 0.25 * hd); ctx.lineCap = 'round'; ctx.stroke();
  if (!AN.lo) {
    const r = 0.012 + 0.003 * hd;
    ctx.beginPath(); for (let i = 0; i < n; i++) { ctx.moveTo(B[i * 2] + r, B[i * 2 + 1]); ctx.arc(B[i * 2], B[i * 2 + 1], r, 0, TAU); }
    ctx.fillStyle = rgbStr(AN.dark, 0.3 + 0.1 * up); ctx.fill();
  }
}
// a fin on the midline (dorsal above the body, anal below it). Pufferfish row with them: seen from above the fin
// swings from side to side across the back (sw = -1…1), edge-on as it passes the middle
function pufferMedianFin(ctx, xa, xb, H, sw, alpha) {
  const lw = AN.lw, hb = (xa - xb) / 2, lean = H * sw, hv = AN.m.hover || 0;
  at(ctx, (xa + xb) / 2, 0);
  ctx.globalAlpha = AN.A0 * alpha;
  ctx.beginPath(); ctx.moveTo(hb, 0);
  ctx.bezierCurveTo(hb * 0.9, lean * 0.95, -hb * 0.2 - H * 0.12, lean * 1.15, -hb * 0.6 - H * 0.3, lean * 0.95);
  ctx.quadraticCurveTo(-hb - H * 0.26, lean * 0.55, -hb, 0);
  ctx.closePath();
  ctx.fillStyle = rgbStr(mixRGB(AN.body, AN.dark, 0.4, TMPD), hv ? 0.55 : 0.72); ctx.fill();
  ctx.strokeStyle = rgbStr(hv ? mixRGB(AN.mem, WHITE, 0.4, TMPC) : AN.mem, 0.7 + 0.08 * hv); ctx.lineWidth = lw(1 + 0.2 * hv); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let k = 1; k <= 4 + hv; k++) { const u = k / (5 + hv); ctx.moveTo(hb - 2 * hb * u, 0); ctx.lineTo(hb * 0.45 - (1.45 * hb + 0.32 * H) * u, lean * (1.02 - 0.42 * u * u)); }
    ctx.strokeStyle = rgbStr(AN.mem, 0.32 + 0.1 * hv); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  ctx.globalAlpha = AN.A0;
  ctx.restore();
}
// the rowing stroke shared by the dorsal and anal fins (they beat together), and their height
function pufferRow(m) { return 0.45 + 0.55 * sin(AN.ph * (1.15 + 0.2 * (m.hover || 0)) + 0.4); }
function pufferFinH(m) { return 0.25 * (1 + 0.14 * (m.fins || 0) + 0.3 * (m.hover || 0)) * (1 - 0.6 * AN.pk); }
function pufferTail(ctx, m) {
  // a short, rounded tail fin that sways gently; inflated, the pufferfish curls it in against its side
  const lw = AN.lw, pk = AN.pk, fl = min(5, m.flagellum || 0), fins = m.fins || 0;
  const L = 0.37 * (1 + 0.15 * fl + 0.07 * fins) * (1 - 0.42 * pk), S = 0.28 * (1 + 0.1 * fl + 0.06 * fins) * (1 - 0.35 * pk);
  const lag = (0.24 + 0.1 * AN.sp) * (1 - 0.85 * pk) * sin(AN.ph * 0.75 + 2.2 * F6.xr - 1.1) + 1.45 * pk, flex = 0.05 * sin(AN.ph * 0.75 - 1.9);
  at(ctx, F6.xr + 0.04, 0); ctx.rotate(PI + lag);
  ctx.beginPath(); ctx.moveTo(0, -0.07);
  ctx.quadraticCurveTo(L * 0.35, -S * 0.78, L * 0.9, -S + flex);
  ctx.quadraticCurveTo(L * 1.2, flex, L * 0.9, S + flex);
  ctx.quadraticCurveTo(L * 0.35, S * 0.78, 0, 0.07);
  ctx.closePath();
  ctx.fillStyle = rgbStr(mixRGB(AN.body, AN.dark, 0.3, TMPC), 0.7 + 0.04 * fl); ctx.fill();
  ctx.strokeStyle = rgbStr(AN.mem, 0.82); ctx.lineWidth = lw(1.2 + 0.15 * fl); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) { const v = k / 3; ctx.moveTo(0.03, v * 0.05); ctx.quadraticCurveTo(L * 0.5, v * S * 0.5 + flex * 0.3, L * (1.02 - 0.14 * v * v), v * S * 0.86 + flex); }
    ctx.strokeStyle = rgbStr(AN.mem, 0.3 + 0.04 * fl); ctx.lineWidth = lw(0.85); ctx.stroke();
    // the dark-edged trailing margin many puffers have
    ctx.beginPath(); ctx.moveTo(L * 0.88, -S * 0.86 + flex); ctx.quadraticCurveTo(L * 1.14, flex, L * 0.88, S * 0.86 + flex);
    ctx.strokeStyle = rgbStr(AN.dark, 0.45); ctx.lineWidth = lw(1.6); ctx.stroke();
  }
  ctx.restore();
}
function pufferPecs(ctx, m) {
  // small, rounded pectoral fins fluttering fast: a pufferfish sculls itself along with them (Hover Fins: bigger,
  // faster, a blur of motion; inflated: tiny)
  const t = AN.t, fins = m.fins || 0, hv = m.hover || 0, pp = m.pseudopod || 0, pk = AN.pk, lw = AN.lw;
  const kf = (1 + 0.14 * fins + 0.28 * hv) * (1 - 0.5 * pk), fr = 11 + 4 * AN.sp + 2.5 * hv, x = 0.32;
  for (const sd of SIDES) {
    const ph = t * fr + sd * 0.7, sw = (k) => 0.48 + 0.4 * sin(ph - k) + 0.2 * min(1, AN.sp);
    if (pp) { lobeFin(ctx, x, sd, (0.3 + 0.06 * pp) * (1 - 0.4 * pk), sw(0) + 0.1); continue; }
    const L = 0.31 * kf, C = 0.28 * kf * (0.82 + 0.18 * cos(ph));
    // hover fins beat so fast they leave ghost images behind
    for (let g = hv >= 2 ? 2 : hv ? 1 : 0; g >= 1; g--) { ctx.globalAlpha = AN.A0 * (0.22 - 0.07 * g); pairedFin(ctx, x, sd, L, C, 0.05, sw(0.55 * g), 0, 0.05); }
    ctx.globalAlpha = AN.A0;
    pairedFin(ctx, x, sd, L, C, 0.05, sw(0), AN.fine ? 6 : 4, 0.05);
    if (hv && !AN.lo) {
      // an iridescent shimmer along the fin's edge
      skin(x, sd * (w6(x) - 0.05));
      ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2] + sd * (PI / 2 + sw(0))); ctx.scale(1, sd);
      finPath(ctx, L, C, 0.05);
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgbStr([170, 235, 255], 0.22 + 0.1 * hv); ctx.lineWidth = lw(1.6 + 0.4 * hv); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
  }
}
function pufferBack(ctx, m) {
  pufferTail(ctx, m);
  // the anal fin, under the body, rows in step with the dorsal fin: it peeks out beside the narrow tail
  pufferMedianFin(ctx, -0.5, -0.74, pufferFinH(m) * 0.95, pufferRow(m), 0.9);
  if (m.gills) gillFilaments(ctx, m.gills);
  pufferPecs(ctx, m);
  prickleRim(ctx, m);
}
function pufferBody(ctx, n) {
  // a pale belly showing round the edge, the back darker and spotted; inflated, the pale belly stretches round
  const pk = AN.pk, belly = mixRGB(AN.body, WHITE, 0.6, TMPC);
  ctx.fillStyle = rgbStr(AN.body, 0.95); ctx.fill();
  // countershading: the back darkest down the middle (a cached gradient across the body, which barely bends)
  skin(0.15, 0);
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2]); ctx.scale(1, AN.hw + (PUFF_R - AN.hw) * pk);
  ctx.globalAlpha *= 1 - 0.35 * pk; ctx.fillStyle = backGrad(ctx, AN.dark); ctx.fill();
  ctx.restore();
  // the pale belly showing all round the edge: soft bands inside the outline, wider as the belly stretches
  ctx.save(); emitPath(ctx, n); ctx.clip();
  const bw = 1 + 1.3 * pk;
  for (let i = 0; i < 4; i++) { ctx.strokeStyle = rgbStr(belly, 0.16 + 0.05 * i); ctx.lineWidth = (0.38 - 0.09 * i) * bw; ctx.stroke(); }
  // the spotted back
  ctx.beginPath(); scatter(ctx, AN.lo ? 9 : 14, 30, 0.1, 0.84, 0.6, 0.036, 0.06); ctx.fillStyle = rgbStr(AN.dark, 0.48); ctx.fill();
  if (AN.fine) { ctx.beginPath(); scatter(ctx, 16, 57, 0.08, 0.88, 0.72, 0.014, 0.024); ctx.fillStyle = rgbStr(AN.dark, 0.4); ctx.fill(); }
  ctx.restore();
  emitPath(ctx, n);
}
function backGrad(ctx, c) {
  const m = grads(ctx), key = 'p' + c.join(',');
  let g = m.get(key);
  if (!g) {
    g = ctx.createLinearGradient(0, -1, 0, 1);
    g.addColorStop(0, rgbStr(c, 0)); g.addColorStop(0.22, rgbStr(c, 0.1)); g.addColorStop(0.5, rgbStr(c, 0.34));
    g.addColorStop(0.78, rgbStr(c, 0.1)); g.addColorStop(1, rgbStr(c, 0));
    m.set(key, g);
  }
  return g;
}
// Tetrodotoxin: the most poisonous puffers advertise it, with bold dark saddles and yellow spots on the back
const TET_X = [0.38, -0.12, -0.52, 0.72], SAD = new Float32Array(24);
function tetroWarn(ctx, lv) {
  const lw = AN.lw;
  insetFill(ctx, 0.8, rgbStr(TET_Y, 0.1 + 0.07 * lv));
  ctx.beginPath();
  for (let i = 0; i < min(4, 1 + lv); i++) {
    // a saddle: broad over the back, narrowing to a rounded point down each flank
    const xc = TET_X[i], h = 0.06 + 0.014 * lv, W = w6(xc) * (0.6 + 0.07 * lv);
    SAD[0] = xc + h * 0.5; SAD[1] = -W; SAD[2] = xc + h * 0.95; SAD[3] = -W * 0.5; SAD[4] = xc + h; SAD[5] = 0; SAD[6] = xc + h * 0.95; SAD[7] = W * 0.5; SAD[8] = xc + h * 0.5; SAD[9] = W; SAD[10] = xc; SAD[11] = W * 1.1;
    SAD[12] = xc - h * 0.5; SAD[13] = W; SAD[14] = xc - h * 0.95; SAD[15] = W * 0.5; SAD[16] = xc - h; SAD[17] = 0; SAD[18] = xc - h * 0.95; SAD[19] = -W * 0.5; SAD[20] = xc - h * 0.5; SAD[21] = -W; SAD[22] = xc; SAD[23] = -W * 1.1;
    smoothLine(ctx, SAD); ctx.closePath();
  }
  ctx.fillStyle = rgbStr(TET_D, 0.4 + 0.12 * lv); ctx.fill();
  ctx.beginPath(); scatter(ctx, (AN.lo ? 4 : 7) + 5 * lv, 50, 0.06, 0.9, 0.8, 0.028 + 0.004 * lv, 0.05 + 0.006 * lv);
  ctx.fillStyle = rgbStr(TET_Y, 0.82 + 0.06 * lv); ctx.fill();
  if (!AN.lo) { ctx.strokeStyle = rgbStr(TET_D, 0.5); ctx.lineWidth = lw(0.8); ctx.stroke(); }
  if (lv >= 2) { const n = bodyPts(0.92, true, TX, TY); emitPath(ctx, n, TX, TY); ctx.strokeStyle = rgbStr(TET_Y, 0.25 + 0.1 * lv); ctx.lineWidth = lw(1.2 + 0.5 * lv); ctx.stroke(); }
}
function pufferGills(ctx, m) {
  // the gill opening: a small slit on each side just in front of the pectoral fin (larger with Gills)
  const os = m.osmo || 0, gl = m.gills || 0, lw = AN.lw, x = 0.42, w = w6(x), br = gl ? 0.5 + 0.5 * sin(AN.t * 2.2) : 0; // (x: just in front of the pectoral fin)
  ctx.beginPath();
  for (const sd of SIDES) { sm(ctx, x + 0.015, sd * w * (0.8 - 0.05 * gl)); skin(x - 0.025 - 0.012 * gl - 0.01 * br, sd * w * 0.9); const cx = SK[0], cy = SK[1]; skin(x + 0.01, sd * w * 1.01); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]); }
  ctx.strokeStyle = 'rgba(6,34,46,0.5)'; ctx.lineWidth = lw(1.4 + 0.5 * gl); ctx.lineCap = 'round'; ctx.stroke();
  if ((gl || os) && !AN.lo) {
    ctx.beginPath();
    for (const sd of SIDES) { sm(ctx, x + 0.035, sd * w * 0.72); skin(x - 0.025, sd * w * 0.86); const cx = SK[0], cy = SK[1]; skin(x + 0.022, sd * w * 1.02); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]); }
    ctx.strokeStyle = rgbStr(os ? OSMO_C : gl ? GILL_C : AN.pale, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
  }
  if (os) gillGlow(ctx, os, 0.45, 0.03, 3, 0.86);
}
function pufferInside(ctx, m) {
  if (m.mimicry) mottle(ctx, m.mimicry);
  if (m.tetrodo) tetroWarn(ctx, m.tetrodo);
  if (m.chloro) sunBask(ctx, m.chloro);
  if (m.vacuole) swimBladder(ctx, m.vacuole);
  if (m.lysosome) fishGut(ctx, m.lysosome);
  if (m.polyps) caeca(ctx, m.polyps);
  if (m.muscle || m.mito) myomeres(ctx, m, 0.42, -0.8, 11, 0.9, 0.1);
  if (m.mito) mitoGlow(ctx, m.mito);
  if (m.nova) novaOrgan(ctx, m.nova);
  if (m.nerve) nerveSys(ctx, m.nerve);
  prickleField(ctx, m);
  pufferGills(ctx, m);
}
function pufferShield(ctx, lv) {
  // Head Shield on a pufferfish: a boxfish's carapace of fused hexagonal plates, reaching further back with each
  // level; at level 3 a cowfish's horns
  const lw = AN.lw, xb = lv >= 3 ? -0.4 : lv >= 2 ? -0.04 : 0.36, k = 1.03, N = 12, xf = F6.xf;
  const outline = () => {
    ctx.beginPath(); sm(ctx, xf + 0.012, 0);
    for (let i = 1; i <= N; i++) { const x = xf - (i / N) * (xf - xb); sl(ctx, x, -w6(x) * k - 0.008); }
    skin(xb - 0.08, 0); const cx = SK[0], cy = SK[1]; skin(xb, w6(xb) * k + 0.008); ctx.quadraticCurveTo(cx, cy, SK[0], SK[1]);
    for (let i = N - 1; i >= 1; i--) { const x = xf - (i / N) * (xf - xb); sl(ctx, x, w6(x) * k + 0.008); }
    ctx.closePath();
  };
  outline();
  skin((xf + xb) / 2, 0);
  ctx.save(); ctx.translate(SK[0], SK[1]); ctx.rotate(SK[2]); ctx.scale(1, AN.hw * (1.1 + 1.1 * AN.pk)); ctx.fillStyle = bandGrad(ctx, SHELL_C); ctx.globalAlpha *= 0.66 + 0.06 * lv; ctx.fill(); ctx.restore();
  if (!AN.lo) {
    // the honeycomb of plates, each with a bony knob in the middle
    ctx.save(); ctx.clip();
    const hr = AN.fine ? 0.09 : 0.13, hx = hr * 1.5, hy = hr * 1.73;
    ctx.beginPath();
    let row = 0;
    for (let x = xf - hr * 0.5; x > xb - hr; x -= hx, row++) {
      const wl = w6(min(xf, max(xb, x))) * 1.05 + hr;
      for (let v = (row & 1 ? hy * 0.5 : 0) - Math.ceil(wl / hy) * hy; v <= wl; v += hy) {
        for (let j = 0; j <= 6; j++) { const a = (j * PI) / 3; j ? sl(ctx, x + cos(a) * hr, v + sin(a) * hr) : sm(ctx, x + hr, v); }
      }
    }
    ctx.strokeStyle = 'rgba(140,92,48,0.5)'; ctx.lineWidth = lw(1); ctx.stroke();
    if (AN.fine) { ctx.beginPath(); scatter(ctx, 14 + 8 * lv, 12, 0.03, (xf - xb) / (xf - F6.xr), 0.8, 0.012, 0.018); ctx.fillStyle = 'rgba(255,250,232,0.55)'; ctx.fill(); }
    ctx.restore();
  }
  outline(); ctx.strokeStyle = 'rgba(255,246,220,0.9)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  // orbits: the eyes look out through holes in the shield
  ctx.beginPath(); for (const sd of SIDES) { skin(0.66, sd * (w6(0.66) - 0.13)); const r = (0.17 + 0.034 * (AN.m.eyes || 0)) * (1 + 0.3 * AN.pk); ctx.moveTo(SK[0] + r, SK[1]); ctx.arc(SK[0], SK[1], r, 0, TAU); }
  ctx.fillStyle = 'rgba(120,80,40,0.45)'; ctx.fill();
  if (lv >= 3) {
    // cowfish horns over the eyes, pointing forward, and a pair of spines at the back corners of the box
    ctx.beginPath();
    for (const sd of SIDES) {
      at(ctx, 0.76, sd * (w6(0.76) * 0.62), sd);
      ctx.moveTo(0.06, -0.045); ctx.quadraticCurveTo(0.24, -0.03, 0.4, 0.035); ctx.quadraticCurveTo(0.22, 0.03, 0.0, 0.05); ctx.closePath();
      ctx.restore();
      edge(xb + 0.06, sd); const ex = EP[0], ey = EP[1], nx = EP[2], ny = EP[3], bx = -sd * ny, by = sd * nx;
      ctx.moveTo(ex - bx * 0.07, ey - by * 0.07); ctx.lineTo(ex + bx * 0.24 + nx * 0.08, ey + by * 0.24 + ny * 0.08); ctx.lineTo(ex + bx * 0.03 - nx * 0.04, ey + by * 0.03 - ny * 0.04); ctx.closePath();
    }
    ctx.fillStyle = 'rgba(250,232,190,0.96)'; ctx.fill(); ctx.strokeStyle = 'rgba(130,85,40,0.65)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
}
function pufferVenom(ctx, lv) {
  // venom spines on a pufferfish: glowing glands at the bases of the prickles along the flanks
  const t = AN.t, n = 3 + lv, r = 0.03 + 0.007 * lv, pulse = 1 + 0.12 * sin(t * 2.6);
  ctx.globalCompositeOperation = 'lighter';
  for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = 0.55 - (i / (n - 1)) * 1.1; glowAt(ctx, TOX_C, x, sd * w6(x) * 0.84, r * 3.4, 0.32 + 0.1 * lv); }
  ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath();
  for (const sd of SIDES) for (let i = 0; i < n; i++) { const x = 0.55 - (i / (n - 1)) * 1.1; skin(x, sd * w6(x) * 0.84); ctx.moveTo(SK[0] + r * pulse, SK[1]); ctx.ellipse(SK[0], SK[1], r * pulse * 1.2, r * pulse, SK[2], 0, TAU); }
  ctx.fillStyle = rgbStr(TOX_C, 0.88); ctx.fill(); ctx.strokeStyle = 'rgba(225,255,190,0.8)'; ctx.lineWidth = AN.lw(0.8); ctx.stroke();
}
function cheeks(ctx, lv) {
  // Jaw Muscles: the bite muscles bulge out of the cheeks behind the beak, swelling with every crunch
  // (the bulge itself is in the outline, w6 / AN.chk: here the muscle shows through, fibres fanning to the jaw)
  const s = sin(AN.t * 3.1), bite = s > 0 ? s * s : 0, lw = AN.lw, x = 0.93, r = 0.055 + 0.015 * lv;
  ctx.beginPath();
  for (const sd of SIDES) { skin(x, sd * (w6(x) - r * 1.25)); ctx.moveTo(SK[0] + r * 1.3, SK[1]); ctx.ellipse(SK[0], SK[1], r * 1.3, r, SK[2], 0, TAU); }
  ctx.fillStyle = rgbStr(MUSCLE_C, 0.16 + 0.05 * lv + 0.12 * bite); ctx.fill();
  if (!AN.lo) {
    ctx.beginPath();
    for (const sd of SIDES) {
      skin(x, sd * (w6(x) - r * 1.25)); const cx = SK[0], cy = SK[1], a = SK[2], ca = cos(a), sa = sin(a), qx = cx - ca * r * 0.9, qy = cy - sa * r * 0.9;
      for (let k = -2; k <= 2; k++) { const b = a + sd * (PI / 2 + k * 0.42); ctx.moveTo(qx, qy); ctx.quadraticCurveTo(cx + cos(b) * r * 0.35, cy + sin(b) * r * 0.35, cx + cos(b) * r * 0.75 + ca * r * 0.55, cy + sin(b) * r * 0.75 + sa * r * 0.55); }
    }
    ctx.strokeStyle = rgbStr(mixRGB(MUSCLE_C, [120, 20, 40], 0.3, TMPC), 0.55 + 0.25 * bite); ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke();
  }
}
function pufferEyes(ctx, m) {
  // big round eyes set high on the sides of the head; inflated, they bulge, the pupils shrink and it looks worried
  const lv = m.eyes || 0, pk = AN.pk, t = AN.t, lw = AN.lw;
  const r = (0.135 + 0.028 * lv) * (1 + 0.3 * pk), x = 0.66, v = w6(x) - 0.13;
  const iris = rgbStr(lv ? mixRGB([160, 226, 100], EYE_GLOW, 0.2 + 0.1 * lv, TMPC) : [160, 226, 100], 0.98);
  const ca = cos(-AN.ang), sa = sin(-AN.ang), lx = -0.38 * ca + 0.42 * sa, ly = -0.38 * sa - 0.42 * ca;
  for (const sd of SIDES) {
    skin(x, sd * v); const ex = SK[0], ey = SK[1], a = SK[2], fx = cos(a), fy = sin(a), mx = sd * fy, my = -sd * fx; // (mx, my): towards the midline
    if (lv) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = AN.A0 * (0.18 + 0.1 * lv + 0.06 * sin(t * 2.5));
      const gs = r * 3.2; ctx.drawImage(glowSprite(EYE_GLOW), ex - gs, ey - gs, gs * 2, gs * 2);
      ctx.globalAlpha = AN.A0; ctx.globalCompositeOperation = 'source-over';
    }
    // the raised socket round the eye
    ctx.beginPath(); ctx.arc(ex, ey, r * 1.2, 0, TAU); ctx.fillStyle = rgbStr(mixRGB(AN.body, AN.pale, 0.3, TMPD), 0.96); ctx.fill();
    ctx.strokeStyle = rgbStr(AN.mem, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
    // the eyeball: its white shows round the iris when it bulges
    if (pk > 0.02) { ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fillStyle = `rgba(250,252,244,${min(1, pk * 2.5)})`; ctx.fill(); ctx.strokeStyle = 'rgba(8,30,40,0.6)'; ctx.lineWidth = lw(0.9); ctx.stroke(); }
    const ri = r * (1 - 0.28 * pk), ix = ex + (fx * 0.1 + mx * 0.14 * pk) * r, iy = ey + (fy * 0.1 + my * 0.14 * pk) * r;
    ctx.beginPath(); ctx.arc(ix, iy, ri, 0, TAU); ctx.fillStyle = iris; ctx.fill(); ctx.strokeStyle = 'rgba(8,30,40,0.8)'; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.arc(ix + fx * ri * 0.06, iy + fy * ri * 0.06, ri * (0.66 - 0.16 * pk), 0, TAU); ctx.fillStyle = '#03121a'; ctx.fill();
    if (lv >= 2 && AN.s * r > 5) { ctx.strokeStyle = rgbStr(EYE_GLOW, 0.5); ctx.lineWidth = lw(1); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(ix + lx * ri * 0.62, iy + ly * ri * 0.62, ri * 0.28, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    if (AN.s * r > 4) { ctx.beginPath(); ctx.arc(ix - lx * ri * 0.42, iy - ly * ri * 0.42, ri * 0.12, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fill(); }
    if (pk > 0.35) {
      // worried brows over the eyes (towards the beak), their inner ends raised
      const k = min(1, (pk - 0.35) * 2.5), q = r * (1.55 + 0.25 * k);
      ctx.beginPath();
      ctx.moveTo(ex + (fx * 0.72 - mx * 0.75) * r * 1.32, ey + (fy * 0.72 - my * 0.75) * r * 1.32);
      ctx.quadraticCurveTo(ex + fx * r * 1.5, ey + fy * r * 1.5, ex + (fx * 0.7 + mx * 0.62) * q, ey + (fy * 0.7 + my * 0.62) * q);
      ctx.strokeStyle = `rgba(8,34,44,${0.85 * k})`; ctx.lineWidth = lw(2.6); ctx.lineCap = 'round'; ctx.stroke();
    }
  }
}
function nasalTentacles(ctx, lv) {
  // Nasal Tentacles: a pufferfish smells through little paired tentacles just in front of its eyes
  const t = AN.t, lw = AN.lw, per = lv >= 2 ? 2 : 1, L = 0.09 + 0.05 * lv;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (const sd of SIDES) for (let j = 0; j < per; j++) {
      const x = 0.92 + 0.05 * j, v = sd * (w6(0.92) * (0.74 - 0.14 * j));
      skin(x, v); let px = SK[0], py = SK[1], a = SK[2] + sd * (0.75 - 0.45 * j);
      ctx.moveTo(px, py);
      const N = 5, l = L * (1 - 0.15 * j);
      for (let k = 1; k <= N; k++) { const u = k / N; a += sd * 0.12 + 0.18 * sin(t * 2.4 + j * 1.9 + sd - u * 3) * u; px += cos(a) * (l / N); py += sin(a) * (l / N); ctx.lineTo(px, py); }
      if (pass) { ctx.moveTo(px + 0.022 + 0.005 * lv, py); ctx.arc(px, py, 0.022 + 0.005 * lv, 0, TAU); }
    }
    if (!pass) { ctx.strokeStyle = rgbStr(AN.dark, 0.55); ctx.lineWidth = lw(3.6 + 0.8 * lv); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
    else { ctx.strokeStyle = rgbStr(mixRGB(AN.body, WHITE, 0.45, TMPC), 0.95); ctx.lineWidth = lw(1.8 + 0.5 * lv); ctx.stroke(); ctx.fillStyle = rgbStr(mixRGB(AN.body, WHITE, 0.6, TMPC), 0.95); ctx.fill(); }
  }
}
function pufferBeak(ctx, m) {
  // the beak: four fused teeth (two ivory plates above, two below) at the tip of the snout, for cracking shells.
  // Beak and Jaw Muscles make it bigger and stronger (with a sharp cutting edge); inflated, the mouth gapes in an "o"
  const t = AN.t, lw = AN.lw, pk = AN.pk, bk = m.beak || 0, jw = m.jaws || 0;
  const s = sin(t * 3.1), chomp = jw || bk >= 2 ? (s > 0 ? s * s : 0) : 0.5 + 0.5 * sin(t * 1.7);
  const open = max(0.12 + (jw || bk >= 2 ? 0.55 : 0.18) * chomp, 0.75 * pk);
  const sz = 1 + 0.2 * bk + 0.13 * jw, R = 0.18 * sz, rx = 0.085 * sz + 0.02 * bk, th = 0.05 + 0.024 * bk + 0.012 * jw, A = 1.3 + 0.05 * bk;
  at(ctx, F6.xf - 0.07 + 0.02 * bk + 0.01 * jw, 0);
  // fleshy lips round the plates
  ctx.beginPath(); ctx.ellipse(-0.01, 0, rx + 0.035, R + 0.04, 0, -PI / 2 - 0.15, PI / 2 + 0.15); ctx.closePath();
  ctx.fillStyle = rgbStr(mixRGB(AN.body, AN.pale, 0.45, TMPC), 0.96); ctx.fill();
  const plate = (ox, k) => {
    ctx.beginPath(); ctx.ellipse(ox, 0, rx * k, R * k, 0, -A, A); ctx.ellipse(ox, 0, max(0.005, rx * k - th), R * k - th * 0.75, 0, A, -A, true); ctx.closePath();
  };
  // the lower plates, pushed forward as the mouth opens, with the dark mouth between
  const d = open * 0.06 * sz;
  if (open > 0.15) { ctx.beginPath(); ctx.ellipse(0, 0, rx + d * 0.9, R * (0.92 + 0.1 * pk), 0, -A, A); ctx.closePath(); ctx.fillStyle = 'rgba(40,8,22,0.92)'; ctx.fill(); }
  plate(d, 0.94); ctx.fillStyle = '#e9dcbf'; ctx.fill(); ctx.strokeStyle = 'rgba(95,65,45,0.65)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  // the upper plates: a rounded ivory rim, split down the middle where the two teeth meet
  plate(0, 1); ctx.fillStyle = '#fdf7e6'; ctx.fill(); ctx.strokeStyle = 'rgba(95,65,45,0.75)'; ctx.lineWidth = lw(1 + 0.15 * bk); ctx.stroke();
  if (!AN.lo) {
    ctx.beginPath(); ctx.moveTo(rx - th * 1.1, 0); ctx.lineTo(rx + 0.004, 0);
    if (bk) for (let k = 1; k <= bk; k++) { const f = 1 - (k * th) / (bk + 1) / max(rx, 0.03); ctx.moveTo(rx * f * cos(-A * 0.8), R * f * sin(-A * 0.8)); ctx.ellipse(0, 0, rx * f, R * f - (k * th * 0.75) / (bk + 1), 0, -A * 0.8, A * 0.8); }
    ctx.strokeStyle = 'rgba(150,115,75,0.55)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  if (bk) {
    // the cutting edge: a hard white rim, notched where it shears
    ctx.beginPath(); ctx.ellipse(0, 0, rx, R, 0, -A * 0.92, A * 0.92);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = lw(1.1 + 0.45 * bk); ctx.lineCap = 'round'; ctx.stroke();
    if (!AN.lo) { ctx.beginPath(); for (let i = 1; i < 4 + 2 * bk; i++) { const a = -A * 0.85 + (i / (4 + 2 * bk)) * A * 1.7; ctx.moveTo(rx * cos(a), R * sin(a)); ctx.lineTo((rx - th * 0.45) * cos(a), (R - th * 0.4) * sin(a)); } ctx.strokeStyle = 'rgba(120,90,60,0.5)'; ctx.lineWidth = lw(0.7); ctx.stroke(); }
  }
  ctx.restore();
}
function pufferFront(ctx, m) {
  if (m.shell) pufferShield(ctx, m.shell);
  if (m.guard) scutes(ctx, m.guard);
  if (m.cilia) lateralLine(ctx, m.cilia);
  if (m.biolum) biolumSpots(ctx, m.biolum);
  if (m.toxin) pufferVenom(ctx, m.toxin);
  pufferMedianFin(ctx, -0.36, -0.6, pufferFinH(m), pufferRow(m), 1);
  if (m.dash) dashMuscle(ctx, m.dash);
  if (m.cnido) stingSlime(ctx, m.cnido);
  if (m.jaws) cheeks(ctx, m.jaws);
  pufferEyes(ctx, m);
  if (m.tentacles) nasalTentacles(ctx, m.tentacles);
  pufferBeak(ctx, m);
}

// ============================ the animal pipeline ============================
function drawAnimal(ctx, p, m, t, s, ph, stage, body, mem, A0) {
  const lw = (px) => px / s;
  setupAnimal(p, m, stage, t, ph);
  AN.lw = lw; AN.s = s; AN.fine = s > 44; AN.lo = s < 20; AN.A0 = A0; AN.body = body; AN.mem = mem; AN.ang = p.ang || 0;
  AN.os = outlineXs(stage, AN.lo);
  mixRGB(body, [6, 40, 60], 0.52, AN.dark); mixRGB(body, WHITE, 0.5, AN.pale);
  // (the flatworm and the larva are drawn a little larger so each stage keeps the colony's visual weight)
  const s6 = stage === 6, st = (p.stretch || 0) * (1 - AN.pk), k = stage === 3 ? 1.1 : stage === 4 ? 1.05 : 1;
  ctx.save();
  ctx.scale(k * (1 + st * 0.4), k * (1 - st * 0.28));
  ctx.lineJoin = 'round';
  // ---- behind the body
  if (m.signal) {
    if (s6) drawSignal(ctx, m.signal, t, lw, A0, (AN.pxf + AN.pxr) / 2, ((AN.pxf - AN.pxr) / 2) * 0.95, AN.hw + (PUFF_R - AN.hw) * AN.pk + 0.15);
    else drawSignal(ctx, m.signal, t, lw, A0, AN.cx, AN.hl * 0.95, AN.hw + 0.15);
  }
  if (m.dash && p.dashT > 0) (stage >= 4 ? dashWake : dashJet)(ctx, m.dash);
  if (stage === 5 && m.tentacles) barbels(ctx, m.tentacles); // (a pufferfish's tentacles are its nostrils: pufferFront)
  if (stage === 3) wormBack(ctx, m); else if (stage === 4) larvaBack(ctx, m); else if (s6) pufferBack(ctx, m); else fishBack(ctx, m);
  if (m.polyps && stage === 3) animalPolyps(ctx, m.polyps); // a fish digests with pyloric caeca instead (inside)
  // ---- the body
  const n = bodyPts(1, true);
  if (m.cyst) cystCoat(ctx, m.cyst, n);
  emitPath(ctx, n);
  if (stage === 3) wormBody(ctx, m, n); else if (stage === 4) larvaBody(ctx, n); else if (s6) pufferBody(ctx, n); else fishBody(ctx, n);
  ctx.save(); ctx.clip();
  if (stage === 3) wormInside(ctx, m); else if (stage === 4) larvaInside(ctx, m); else if (s6) pufferInside(ctx, m); else fishInside(ctx, m);
  ctx.restore();
  emitPath(ctx, n);
  ctx.strokeStyle = cstr(mem); ctx.lineWidth = lw(1.5 + (m.membrane || 0) * 0.8); ctx.stroke();
  if (m.membrane) membraneIn(ctx, m.membrane);
  // ---- on the skin
  if (stage === 3) wormFront(ctx, m); else if (stage === 4) larvaFront(ctx, m); else if (s6) pufferFront(ctx, m); else fishFront(ctx, m);
  if (s6) hiliteAt(ctx, 0.3, 0.8 + 0.75 * AN.pk);
  else hiliteAt(ctx, stage === 3 ? 0.3 : stage === 4 ? 0.62 : 0.4, stage === 4 ? 0.5 : 0.72);
  if (p.cyst > 0) cystShell(ctx, t, lw);
  ctx.restore();
  AN.pk = 0; // (skin() is only ever the pufferfish's balloon while it is being drawn)
  return n;
}

// p: { r, ang, seed, stage (1-6), muts:{id:lv}, flash, stretch, dent, dentA, cyst, wob, speedN, dashT, dashCd, puffK?, bodyCol?, memCol? }
// puffK (0…1, stage 6): how inflated the pufferfish is; at 1 it is a spiny ball of radius PUFF_R (1.55) units
// ctx is pre-translated to the player, rotated so heading is +x and scaled so 1 unit = player radius.
export function drawPlayer(ctx, p, T, s) {
  const t = T;
  const m0 = p.muts || NOMUT;
  // the Photophore Flash trait brings light organs with it: draw them like bioluminescence
  const m = m0.photo && (m0.biolum | 0) < m0.photo ? { ...m0, biolum: m0.photo } : m0;
  const col = COLORS.player;
  const body = p.bodyCol || col.body;
  const mem = p.memCol || col.mem;
  ctx.lineJoin = 'round';
  const stage = clampStage(p.stage || 1);
  const A0 = ctx.globalAlpha;
  const ph = swimPhase(p, T);
  if (stage >= 3) return drawAnimal(ctx, p, m, t, s, ph, stage, body, mem, A0);

  // ---- cells (stages 1–2)
  const lw = (px) => px / s;
  const st = p.stretch || 0;
  setupCell(stage, st, t);
  if (m.signal) drawSignal(ctx, m.signal, t, lw, A0, G.cx, G.ax, G.ay);
  if (m.flagellum) {
    const L = 1.1 + 0.28 * m.flagellum;
    const fr = 9 + (p.speedN || 0) * 9, fp = ph * 1.5; // fp == T·fr for stateless callers
    const sx0 = -0.92 - st * 0.5, sx1 = -0.92;
    flagellum(ctx, fp, L, lw(4.5), rgbStr(mem, 0.35), 0, 1, sx0);
    flagellum(ctx, fp, L, lw(2), rgbStr(mem, 0.95), 0, 1, sx0);
    if (m.flagellum >= 3) {
      ctx.save(); ctx.rotate(0.35); flagellum(ctx, fp + 0.4 * fr, L * 0.75, lw(1.6), rgbStr(mem, 0.8), 1.5, 1, sx1); ctx.restore();
      ctx.save(); ctx.rotate(-0.35); flagellum(ctx, fp + 0.8 * fr, L * 0.75, lw(1.6), rgbStr(mem, 0.8), 3, 1, sx1); ctx.restore();
    }
  }
  if (m.spikes) spikeRing(ctx, (8 + m.spikes * 2) | 0, 0.22 + 0.07 * m.spikes, 0.12, t, rgbStr([230, 255, 250], 0.92), t * 0.1, G.ax, G.ay);
  if (m.cilia) ciliaFringe(ctx, (24 + 6 * m.cilia) | 0, t, 0.12 + 0.03 * m.cilia, lw(1.3), rgbStr(mem, 0.75), G.ax, G.ay, 14);
  if (m.polyps) drawPolyps(ctx, m.polyps, t, lw, mem);
  if (stage === 2) drawColony(ctx, p, m, t, lw, body, mem, col.nuc, s);

  // main body
  const lobes = m.pseudopod ? 3 : 0, lobeAmp = m.pseudopod ? 0.07 + 0.05 * m.pseudopod : 0;
  const n = blobPath(ctx, { n: 30, t, seed: p.seed, amp: 0.045 + (p.wob || 0), stretch: st, lobes, lobeAmp, dentA: p.dentA, dent: p.dent });
  ctx.fillStyle = bodyGrad(ctx, body); ctx.fill();
  const memW = 1.8 + (m.membrane || 0) * 0.8;
  ctx.strokeStyle = cstr(mem); ctx.lineWidth = lw(memW); ctx.stroke();
  if (m.membrane) { ctx.save(); ctx.scale(0.88, 0.88); ctx.strokeStyle = rgbStr(mem, 0.3); ctx.lineWidth = lw(1.2 + m.membrane * 0.4); ctx.stroke(); ctx.restore(); }

  // inside
  if (m.vacuole) {
    const vr = 0.2 + 0.035 * m.vacuole + 0.02 * sin(t * 1.5);
    ctx.beginPath(); ctx.arc(0.3, 0.28, vr, 0, TAU);
    ctx.fillStyle = 'rgba(220,250,255,0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(230,255,255,0.55)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  if (m.chloro) {
    const k = 3 + m.chloro * 2;
    for (let i = 0; i < k; i++) {
      const a = i * 2.399 + t * 0.25, d = 0.5 + 0.12 * sin(i * 1.7);
      ctx.save(); ctx.translate(cos(a) * d, sin(a) * d); ctx.rotate(a + 1.2);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.13, 0.07, 0, 0, TAU);
      ctx.fillStyle = 'rgba(90,230,110,0.9)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.08, 0); ctx.lineTo(0.08, 0); ctx.strokeStyle = 'rgba(200,255,190,0.7)'; ctx.lineWidth = lw(0.8); ctx.stroke();
      ctx.restore();
    }
  }
  if (m.mito) {
    for (let i = 0; i < 1 + m.mito; i++) {
      const a = 1 + i * 2.1 - t * 0.2, d = 0.55;
      ctx.save(); ctx.translate(cos(a) * d, sin(a) * d); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.15, 0.075, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,150,90,0.9)'; ctx.fill();
      ctx.beginPath(); for (let j = -1; j <= 1; j++) { ctx.moveTo(j * 0.06, -0.05); ctx.lineTo(j * 0.06 + 0.02, 0.05); }
      ctx.strokeStyle = 'rgba(255,230,190,0.8)'; ctx.lineWidth = lw(0.8); ctx.stroke();
      ctx.restore();
    }
  }
  if (m.toxin || m.nova) {
    dots(ctx, 2 + (m.toxin || 0) + (m.nova || 0), p.seed + 5, t, 0.3, 0.68, 0.075, 0.5);
    ctx.fillStyle = 'rgba(200,120,255,0.95)'; ctx.fill();
  }
  if (m.lysosome) { dots(ctx, 2 + m.lysosome * 2, p.seed + 9, t, 0.25, 0.6, 0.05, -0.4); ctx.fillStyle = 'rgba(255,110,120,0.9)'; ctx.fill(); }
  dots(ctx, 4, p.seed, t, 0.4, 0.66, 0.055, 0.25); ctx.fillStyle = rgbStr(mem, 0.55); ctx.fill();
  nucleus(ctx, col.nuc, -0.15, -0.05, 0.3, t, p.seed);
  if (m.biolum) {
    ctx.globalCompositeOperation = 'lighter';
    const g = glowSprite([150, 255, 230], 1);
    for (let i = 0; i < 3 + m.biolum; i++) {
      const a = i * 1.9 + p.seed, d = 0.72;
      const pulse = 0.5 + 0.5 * sin(t * 3 + i * 1.3);
      const sz = 0.22 + 0.1 * pulse;
      ctx.globalAlpha = A0 * (0.5 + 0.4 * pulse);
      ctx.drawImage(g, cos(a) * d - sz, sin(a) * d - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = A0;
    ctx.globalCompositeOperation = 'source-over';
  }
  // surface
  if (m.guard) drawGuard(ctx, m.guard, t, lw, A0);
  highlight(ctx, p.ang || 0);
  // cyst shell
  if (p.cyst > 0) {
    const r = stage === 2 ? 1.78 : 1.18;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU + t; i ? ctx.lineTo(cos(a) * r, sin(a) * r) : ctx.moveTo(cos(a) * r, sin(a) * r); }
    ctx.fillStyle = 'rgba(255,220,150,0.25)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,170,0.95)'; ctx.lineWidth = lw(3); ctx.stroke();
  }
  return n;
}

// Symbionts on a fish: a pilot fish, the little banded jack that escorts sharks. Seen from above, 2 units long,
// facing +x; s = device px per unit.
export function drawPilotFish(ctx, t, s, seed = 0) {
  const lw = (px) => px / s, w = 0.16 * sin(t * 13 + seed * 5);
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-0.6, 0); ctx.lineTo(-1.05, -0.34 + w); ctx.quadraticCurveTo(-0.86, w * 0.6, -1.05, 0.34 + w); ctx.closePath();
  ctx.fillStyle = 'rgba(176,204,228,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(235,245,255,0.8)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  const body = () => { ctx.beginPath(); ctx.moveTo(0.98, 0); ctx.quadraticCurveTo(0.62, -0.34, -0.08, -0.3); ctx.quadraticCurveTo(-0.52, -0.2, -0.66, w * 0.3); ctx.quadraticCurveTo(-0.52, 0.2, -0.08, 0.3); ctx.quadraticCurveTo(0.62, 0.34, 0.98, 0); ctx.closePath(); };
  body(); ctx.fillStyle = '#cfe0ee'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(34,54,86,0.78)';
  for (const x of [0.46, 0.16, -0.14, -0.42]) ctx.fillRect(x - 0.075, -0.5, 0.15, 1);
  ctx.fillStyle = 'rgba(20,40,70,0.25)'; ctx.fillRect(-1, -0.06, 2, 0.12); // darker line down the back
  ctx.restore();
  body(); ctx.strokeStyle = 'rgba(240,248,255,0.9)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(0.7, sd * 0.2); ctx.arc(0.66, sd * 0.2, 0.065, 0, TAU); }
  ctx.fillStyle = '#0d1a2a'; ctx.fill();
}

// Binary Fission on an animal body: your young, a smaller and paler copy of you (planarians really do split in
// two; fish raise fry). e is the clone entity; its look is kept on e.kin so the swim phase stays smooth.
const KIN_BODY = mixRGB(COLORS.player.body, WHITE, 0.28, [0, 0, 0]), KIN_MEM = mixRGB(COLORS.player.mem, WHITE, 0.3, [0, 0, 0]);
export function drawKin(ctx, e, stage, muts, T, s) {
  const k = e.kin || (e.kin = { seed: (e.seed || 0.3) + 1.7, r: 1, muts: {}, bodyCol: KIN_BODY, memCol: KIN_MEM });
  k.stage = stage; k.ang = e.ang || 0; k.speedN = min(1.2, Math.hypot(e.vx || 0, e.vy || 0) / 170); k.stretch = 0;
  k.muts.fins = muts.fins | 0; k.muts.flagellum = min(2, muts.flagellum | 0); k.muts.eyes = muts.eyes | 0;
  drawPlayer(ctx, k, T, s);
}

// ---------- background textures ----------
// Tileable Voronoi-edge caustic texture.
export function makeCausticTile(size = 256, seed = 7) {
  const c = mkCanvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size), d = img.data;
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const N = 14, pts = [];
  for (let i = 0; i < N; i++) pts.push([r() * size, r() * size]);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let d1 = 1e9, d2 = 1e9;
    for (const p of pts) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const dx = x - (p[0] + ox * size), dy = y - (p[1] + oy * size);
      const dd = dx * dx + dy * dy;
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
    }
    const e = sqrt(d2) - sqrt(d1);
    const v = max(0, 1 - e / 9);
    const a = v * v * v;
    const i = (y * size + x) * 4;
    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// Soft light shaft (vertical strip).
export function makeShaft() {
  const W = 64, H = 256, c = mkCanvas(W, H), g = c.getContext('2d');
  const gx = g.createLinearGradient(0, 0, W, 0);
  gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gx; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, H);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.3, 'rgba(0,0,0,1)'); gy.addColorStop(0.75, 'rgba(0,0,0,0.6)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, W, H);
  return c;
}

// ---------- portraits ----------
function portraitCanvas(size) {
  const k = 2, c = mkCanvas(size * k, size * k);
  c.style.width = size + 'px'; c.style.height = size + 'px';
  const g = c.getContext('2d'); g.scale(k, k);
  return [c, g];
}

const FAKE_T = 1.3;

// Boss art: which species body each boss uses and its colour override (null = the species' own colours).
// The game can spawn `base` and set e.col = col.
export const BOSS_ART = {
  colossus: { base: 'colossus', col: null },
  greatciliate: { base: 'ciliate', col: { body: [235, 220, 110], mem: [255, 250, 200], nuc: [170, 140, 40], glow: [240, 220, 120] } },
  queen: { base: 'queen', col: null },
  tyrant: { base: 'rotifer', col: { body: [255, 140, 90], mem: [255, 215, 180], nuc: [180, 70, 40], glow: [255, 140, 90] } },
  titan: { base: 'volvox', col: { body: [90, 220, 150], mem: [200, 255, 220], nuc: [30, 130, 80], glow: [100, 240, 160] } },
  prime: { base: 'colossus', col: { body: [255, 80, 70], mem: [255, 190, 150], nuc: [150, 30, 30], glow: [255, 90, 60] } },
  leviathan: { base: 'diatom', col: { body: [160, 230, 255], mem: [235, 250, 255], nuc: [60, 140, 200], glow: [150, 220, 255] } },
  progenitor: { base: 'queen', col: { body: [255, 205, 110], mem: [255, 245, 210], nuc: [200, 140, 40], glow: [255, 210, 120] } },
};

export function microbePortrait(id, size) {
  const [c, g] = portraitCanvas(size);
  const art = BOSS_ART[id] || ALIAS_ART[id];
  const kind = art ? art.base : id;
  const variant = !!(art && art.col);
  const col = (art && art.col) || (CREATURE_ART[kind] && CREATURE_ART[kind].col) || COLORS[kind] || COLORS.grazer;
  g.translate(size / 2, size / 2);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = variant ? 0.7 : 0.55;
  g.drawImage(glowSprite(col.glow), -size * 0.5, -size * 0.5, size, size);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const e = { kind, seed: 0.37, ang: -0.5, armor: 2, armorMax: 2, kids: 5, phase: 1 };
  if (variant) { e.col = art.col; e.kids = 6; e.armor = 3; e.armorMax = 3; }
  let R = size * 0.3, rot = -0.5;
  if (kind === 'drifter') { R = size * 0.2; rot = -0.6; }
  if (kind === 'phage') { R = size * 0.17; rot = -0.8; }
  if (kind === 'ciliate') { R = size * 0.27; }
  if (kind === 'rotifer') { R = size * 0.22; g.translate(size * 0.06, 0); }
  if (kind === 'queen') { R = size * 0.21; rot = 0.6; g.translate(size * 0.12, -size * 0.06); }
  if (kind === 'colossus' || kind === 'volvox') R = size * 0.34;
  if (kind === 'siphonophore') { drawSiphPortrait(g, size); return c; }
  if (CREATURE_ART[kind]) { R = size * (CREATURE_ART[kind].portraitR || 0.3); rot = CREATURE_ART[kind].portraitRot ?? -0.4; }
  if (variant && kind !== 'queen') R *= kind === 'colossus' || kind === 'volvox' ? 1.04 : 1.1;
  g.rotate(rot); g.scale(R, R);
  e.ang = rot;
  const sd = R * 2;
  drawSpecies(g, e, FAKE_T, sd, { hd: variant && size >= 72 });
  if (kind === 'colossus') {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; const sp = glowSprite([255, 240, 140], 1); g.drawImage(sp, cos(a) * 0.98 - 0.2, sin(a) * 0.98 - 0.2, 0.4, 0.4); }
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}
function drawSiphPortrait(g, size) {
  const R = size * 0.12;
  for (let i = 3; i >= 0; i--) {
    const x = -size * 0.27 + i * size * 0.18, y = -size * 0.2 + i * size * 0.06 + sin(i) * 3;
    // tentacle
    g.beginPath(); g.moveTo(x - R * 0.6, y + R * 0.3);
    for (let k = 1; k <= 10; k++) g.lineTo(x - R * 0.6 - k * 1.4 + sin(k * 0.9 + i) * 3, y + R * 0.3 + k * size * 0.05);
    g.strokeStyle = 'rgba(255,170,230,0.6)'; g.lineWidth = 1.2; g.stroke();
    g.save(); g.translate(x, y); g.rotate(0.3); g.scale(R, R);
    drawSpecies(g, { kind: 'siphonbell', seed: i, ang: 0 }, 1, R * 2);
    g.restore();
  }
}

// evolution stage framing for portraits: [radius as a fraction of size, x offset (units), rotation]
const STAGE_FRAME = [null, [0.27, 0, -0.4], [0.235, 0.3, -0.4], [0.32, 0.04, -0.42], [0.32, 0.2, -0.45], [0.3, 0.2, -0.42], [0.31, 0.04, -0.42]];
// the evolution stage each campaign mutation belongs to (its portrait shows that body)
const MUT_STAGE = { guard: 2, polyps: 2, signal: 2, muscle: 3, jaws: 3, nerve: 3, cnido: 3, fins: 4, eyes: 4, shell: 4, tentacles: 5, hide: 5, gills: 5, beak: 6, tetrodo: 6, hover: 6 };
// per-trait framing tweaks (zoom toward the feature)
const MUT_FRAME = { jaws: [0.38, -0.45, -0.3], eyes: [0.36, -0.35, -0.45], polyps: [0.215, 0.3, -0.4], signal: [0.2, 0.3, -0.4], tentacles: [0.3, -0.25, -0.5],
  fins: [0.34, 0.05, -0.42], shell: [0.4, -0.3, -0.45], hide: [0.31, 0.15, -0.42], gills: [0.36, -0.3, -0.45] };
const MUT_GLOW = {
  toxin: [190, 110, 255], nova: [200, 120, 255], chloro: [120, 255, 140], mito: [255, 160, 90], spikes: [220, 255, 250], lysosome: [255, 110, 130], biolum: [130, 255, 230], cyst: [255, 220, 150], mimicry: [140, 200, 255],
  guard: [190, 240, 255], polyps: [255, 170, 210], signal: [180, 160, 255], muscle: [255, 120, 130], jaws: [255, 220, 160], nerve: [140, 200, 255], cnido: [230, 160, 255],
  fins: [140, 230, 255], eyes: [150, 255, 235], shell: [255, 210, 140], tentacles: [230, 180, 255], hide: [140, 190, 230], gills: [255, 140, 190],
  beak: [255, 236, 190], tetrodo: [255, 214, 80], hover: [150, 235, 255], puff: [255, 226, 150],
};

const MUT_T = { jaws: 1.0 }; // portrait time per trait (jaws at rest: mandibles apart)
function framedBody(g, size, stage, muts, frame, glowC, T = FAKE_T, props = null) {
  g.translate(size / 2, size / 2);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
  g.drawImage(glowSprite(glowC), -size * 0.5, -size * 0.5, size, size);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const [rf, ox, rot] = frame;
  const R = size * rf;
  g.rotate(rot); g.scale(R, R); g.translate(ox, 0);
  drawPlayer(g, { r: 1, ang: rot, seed: 0.5, muts, stage, speedN: 0.35, ...props }, T, R * 2);
}

// every trait shown on the pufferfish (stage 6): framing per trait, and the body state that shows it best
const PUFF_FRAME = { beak: [0.4, -0.4, -0.3], jaws: [0.38, -0.36, -0.3], eyes: [0.36, -0.3, -0.42], tentacles: [0.38, -0.36, -0.42], gills: [0.36, -0.2, -0.42],
  osmo: [0.36, -0.22, -0.42], shell: [0.32, -0.02, -0.42], hide: [0.25, 0.03, -0.42], spikes: [0.27, 0.06, -0.42], fins: [0.28, 0.06, -0.42], hover: [0.27, 0.06, -0.42],
  flagellum: [0.3, 0.38, -0.42], pseudopod: [0.28, 0.02, -0.42], mito: [0.3, 0.12, -0.42], nova: [0.2, 0.06, -0.42], muscle: [0.3, 0.12, -0.42], tetrodo: [0.31, 0.06, -0.42] };
const PUFF_PROPS = { hide: { puffK: 0.45 } };
// an early trait in its fish form (on a fish body): pyloric caeca for polyps, pilot fish for symbionts, …
const FISH_FRAME = { cilia: [0.31, 0.12, -0.42], spikes: [0.3, 0.15, -0.42], toxin: [0.31, 0.05, -0.42], polyps: [0.34, -0.1, -0.42], lysosome: [0.34, 0, -0.42],
  vacuole: [0.33, 0.05, -0.42], osmo: [0.36, -0.3, -0.45], nerve: [0.31, 0.1, -0.42], biolum: [0.3, 0.15, -0.42], pseudopod: [0.27, 0.1, -0.42],
  flagellum: [0.25, 0.45, -0.42], mito: [0.28, 0.25, -0.42], mimicry: [0.27, 0.25, -0.42], muscle: [0.28, 0.25, -0.42] };
function fishFormPortrait(id, size, st) {
  const [c, g] = portraitCanvas(size);
  const muts = { [id]: 3 }, props = {}, s6 = st === 6;
  let frame = (s6 ? PUFF_FRAME[id] : FISH_FRAME[id]) || STAGE_FRAME[st];
  if (id === 'mito') muts.mito = 4;
  if (id === 'membrane') muts.membrane = 5;
  if (id === 'dash') { props.dashT = 0.2; frame = s6 ? [0.23, 0.55, -0.42] : [0.22, 0.75, -0.42]; }
  if (id === 'cyst') { props.cyst = 1; frame = s6 ? [0.22, 0.04, -0.42] : [0.23, 0.22, -0.42]; }
  if (id === 'jaws') frame = st === 4 ? [0.4, -0.55, -0.42] : s6 ? PUFF_FRAME.jaws : [0.38, -0.45, -0.3];
  if (id === 'symbionts' || id === 'fission' || id === 'signal' || id === 'nova') frame = s6 ? [0.21, 0.04, -0.42] : [0.2, 0.12, -0.42];
  framedBody(g, size, st, muts, frame, MUT_GLOW[id] || [110, 255, 225], FAKE_T, props);
  const R = size * frame[0];
  if (id === 'symbionts') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.6;
      g.save(); g.translate(cos(a) * 1.8, sin(a) * 1.8); g.rotate(a + PI / 2); g.scale(0.55, 0.55); drawPilotFish(g, FAKE_T + i, R * 1.1, i); g.restore();
    }
  } else if (id === 'fission') {
    g.save(); g.translate(-0.35, 1.3); g.scale(0.55, 0.55);
    drawPlayer(g, { r: 1, ang: frame[2], seed: 1.7, muts: {}, stage: st, speedN: 0.3, bodyCol: KIN_BODY, memCol: KIN_MEM }, FAKE_T + 0.7, R * 1.1);
    g.restore();
  } else if (id === 'nova') {
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 2; i++) { g.beginPath(); g.ellipse(0.05, 0, 1.6 + i * 0.4, 1.0 + i * 0.4, 0, 0, TAU); g.strokeStyle = `rgba(200,170,255,${0.65 - i * 0.25})`; g.lineWidth = 0.09 - i * 0.03; g.stroke(); }
    g.beginPath();
    for (let b = 0; b < 6; b++) { const a = b * 1.05 + 0.3; let r = 0.95; g.moveTo(cos(a) * r * 1.3, sin(a) * r * 0.85); for (let j = 0; j < 4; j++) { r += 0.22; const aj = a + (j % 2 ? 0.12 : -0.12); g.lineTo(cos(aj) * r * 1.3, sin(aj) * r * 0.85); } }
    g.strokeStyle = 'rgba(235,225,255,0.9)'; g.lineWidth = 0.05; g.stroke();
    g.globalCompositeOperation = 'source-over';
  } else if (id === 'dash') {
    g.beginPath();
    for (let i = 0; i < 4; i++) { const y = (i - 1.5) * 0.4; g.moveTo(-1.75, y); g.lineTo(-1.75 - 0.5 - (i % 2) * 0.35, y); }
    g.strokeStyle = 'rgba(200,255,245,0.75)'; g.lineWidth = 0.07; g.lineCap = 'round'; g.stroke();
  }
  return c;
}

// a stage's body, no mutations: centred, glowing, transparent background
export function stagePortrait(stage, size = 96) {
  const st = clampStage(stage);
  const [c, g] = portraitCanvas(size);
  framedBody(g, size, st, {}, STAGE_FRAME[st], COLORS.player.glow);
  return c;
}

// the fish bodies' active abilities: the body plus what the ability does
function abilityPortrait(id, size) {
  const [c, g] = portraitCanvas(size);
  if (id === 'puff') {
    // Inflate: the pufferfish blown up into a spiky ball, water rushing out round it
    framedBody(g, size, 6, {}, [0.19, 0, -0.42], MUT_GLOW.puff, FAKE_T, { puffK: 1 });
    g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + 0.2, r0 = 2.08 + 0.12 * (i % 2); g.moveTo(cos(a) * r0, sin(a) * r0); g.lineTo(cos(a) * (r0 + 0.3), sin(a) * (r0 + 0.3)); }
    g.strokeStyle = 'rgba(220,248,255,0.8)'; g.lineWidth = 0.08; g.stroke();
    return c;
  }
  const st = id === 'suction' ? 5 : 4;
  const glowC = id === 'photo' ? [140, 210, 255] : id === 'shoal' ? [255, 215, 150] : [160, 255, 215];
  if (id === 'shoal') {
    framedBody(g, size, st, {}, [0.2, 0.1, -0.42], glowC);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.4, d = 2.15;
      g.save(); g.translate(cos(a) * d, sin(a) * d); g.rotate(a + PI / 2); g.scale(0.55, 0.55);
      drawSpecies(g, { kind: 'larvalfish', seed: i * 1.7, t: 0, ang: a + PI / 2, stretch: 0.05 }, FAKE_T, size * 0.11);
      g.restore();
    }
    return c;
  }
  framedBody(g, size, st, id === 'photo' ? { biolum: 3 } : { jaws: 2 }, STAGE_FRAME[st], glowC);
  g.lineCap = 'round';
  if (id === 'photo') {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.8; g.drawImage(glowSprite([170, 225, 255], 1), -1.2, -1.2, 2.4, 2.4);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, 1.05 + i * 0.22, 0, TAU); g.strokeStyle = `rgba(190,230,255,${0.8 - i * 0.22})`; g.lineWidth = 0.07 - i * 0.015; g.stroke(); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  } else {
    // water rushing into the open mouth, with food in it
    g.beginPath();
    for (let i = 0; i < 7; i++) { const a = (i - 3) * 0.16, r0 = 2.3 - (i % 2) * 0.3; g.moveTo(1.25 + cos(a) * r0, sin(a) * r0); g.lineTo(1.25 + cos(a) * (r0 - 0.55), sin(a) * (r0 - 0.55)); }
    g.strokeStyle = 'rgba(210,255,240,0.85)'; g.lineWidth = 0.07; g.stroke();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.25, r0 = 1.6 + (i % 2) * 0.35; g.drawImage(glowSprite([255, 232, 140], 1), 1.25 + cos(a) * r0 - 0.15, sin(a) * r0 - 0.15, 0.3, 0.3); }
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}

// draws a "mini player" with a single mutation emphasised
// stage: the body the trait is shown on; fish bodies show early traits in their fish form
export function mutationPortrait(id, size, stage) {
  if (id === 'photo' || id === 'shoal' || id === 'suction' || id === 'puff') return abilityPortrait(id, size);
  const fst = clampStage(stage || 1);
  if (fst >= 4 && (MUT_STAGE[id] || 1) < 4) return fishFormPortrait(id, size, fst);
  if (MUT_STAGE[id]) {
    const [c, g] = portraitCanvas(size);
    // fins, eyes and the head shield shown on the jawed fish once you are one; every fish trait (and the
    // pufferfish's own) on the pufferfish once you are one
    const ms = MUT_STAGE[id], stage = ms === 6 || (ms >= 4 && fst === 6) ? 6 : ms === 4 && fst === 5 ? 5 : ms;
    if (stage === 6) framedBody(g, size, 6, { [id]: 3 }, PUFF_FRAME[id] || STAGE_FRAME[6], MUT_GLOW[id], MUT_T[id], PUFF_PROPS[id]);
    else framedBody(g, size, stage, { [id]: 3 }, MUT_FRAME[id] || STAGE_FRAME[stage], MUT_GLOW[id], MUT_T[id]);
    return c;
  }
  const [c, g] = portraitCanvas(size);
  g.translate(size / 2, size / 2);
  const R = size * 0.27;
  const glowC = MUT_GLOW[id] || [110, 255, 225];
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
  g.drawImage(glowSprite(glowC), -size * 0.5, -size * 0.5, size, size);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const muts = {}; muts[id] = 3;
  const p = { r: 1, ang: -0.4, seed: 0.5, muts, cyst: id === 'cyst' ? 1 : 0 };
  const lw = 1 / R;
  g.save();
  if (id === 'flagellum') g.translate(size * 0.12, 0);
  if (id === 'mito') { muts.mito = 4; }
  if (id === 'membrane') muts.membrane = 5;
  if (id === 'mimicry') g.globalAlpha = 0.55;
  if (id === 'fission') {
    g.save(); g.translate(size * 0.15, size * 0.12); g.rotate(-0.4); g.scale(R * 0.62, R * 0.62); drawPlayer(g, { ...p, muts: {}, seed: 1.7 }, FAKE_T + 1, R); g.restore();
    g.translate(-size * 0.08, -size * 0.06);
  }
  if (id === 'dash') {
    g.beginPath();
    for (let i = 0; i < 4; i++) { const y = (i - 1.5) * R * 0.45; g.moveTo(-R * 1.2, y); g.lineTo(-R * (2.0 + (i % 2) * 0.4), y); }
    g.strokeStyle = 'rgba(200,255,245,0.75)'; g.lineWidth = 2.5; g.lineCap = 'round'; g.stroke();
    g.translate(size * 0.08, 0);
  }
  if (id === 'nova' || id === 'toxin') {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < (id === 'nova' ? 3 : 0); i++) {
      g.beginPath(); g.arc(0, 0, R * (1.3 + i * 0.32), 0, TAU); g.strokeStyle = `rgba(210,140,255,${0.7 - i * 0.2})`; g.lineWidth = 3 - i * 0.7; g.stroke();
    }
    if (id === 'toxin') for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.5; const d = R * 1.2; g.drawImage(glowSprite([150, 230, 90]), cos(a) * d - R * 0.6, sin(a) * d - R * 0.6, R * 1.2, R * 1.2); }
    g.globalCompositeOperation = 'source-over';
  }
  if (id === 'osmo') {
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + 0.3; g.moveTo(cos(a) * R * 1.25, sin(a) * R * 1.25); g.lineTo(cos(a) * R * 1.6, sin(a) * R * 1.6); g.moveTo(cos(a + 0.12) * R * 1.48, sin(a + 0.12) * R * 1.48); g.lineTo(cos(a) * R * 1.6, sin(a) * R * 1.6); g.lineTo(cos(a - 0.12) * R * 1.48, sin(a - 0.12) * R * 1.48); }
    g.strokeStyle = 'rgba(140,220,255,0.9)'; g.lineWidth = 2; g.lineCap = 'round'; g.stroke();
  }
  if (id === 'biolum') {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { const a = i * 1.05; const d = R * (1.45 + (i % 2) * 0.25); const sp = glowSprite([255, 230, 140], 1); g.drawImage(sp, cos(a) * d - 5, sin(a) * d - 5, 10, 10); }
    g.globalCompositeOperation = 'source-over';
  }
  g.rotate(-0.4); g.scale(R, R);
  drawPlayer(g, p, FAKE_T, R * 2);
  if (id === 'symbionts') {
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + 0.4;
      g.save(); g.translate(cos(a) * 1.55, sin(a) * 1.55); g.scale(0.22, 0.22);
      drawSpecies(g, { kind: 'drifter', seed: i, ang: 0 }, FAKE_T, R * 0.4);
      g.restore();
    }
  }
  if (id === 'pseudopod') {
    g.beginPath(); g.arc(1.25, 0.05, 0.28, 0, TAU); g.fillStyle = 'rgba(255,220,120,0.9)'; g.fill();
  }
  if (id === 'mimicry') {
    g.setLineDash([0.18, 0.14]); g.beginPath(); g.arc(0, 0, 1.25, 0, TAU); g.strokeStyle = 'rgba(200,230,255,0.9)'; g.lineWidth = lw * 2; g.stroke(); g.setLineDash([]);
  }
  g.restore();
  if (id === 'chloro') {
    g.save(); g.translate(-size * 0.3, -size * 0.3);
    g.globalCompositeOperation = 'lighter'; g.drawImage(glowSprite([255, 240, 160], 1), -10, -10, 20, 20); g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  return c;
}

// genome upgrade icons: DNA helix motif + symbol
export function genomePortrait(id, size) {
  const [c, g] = portraitCanvas(size);
  g.translate(size / 2, size / 2);
  const R = size * 0.38;
  const dnaC = [199, 156, 255];
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
  g.drawImage(glowSprite(dnaC), -size * 0.5, -size * 0.5, size, size);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // background helix ring
  g.save(); g.rotate(-0.6);
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let i = 0; i <= 40; i++) { const u = i / 40; const x = (u - 0.5) * R * 2.1; const y = sin(u * TAU * 1.5 + k * PI) * R * 0.35; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = k ? 'rgba(125,79,224,0.55)' : 'rgba(199,156,255,0.55)'; g.lineWidth = size * 0.035; g.lineCap = 'round'; g.stroke();
  }
  g.beginPath();
  for (let i = 1; i < 12; i++) { const u = i / 12; const x = (u - 0.5) * R * 2.1; const y = sin(u * TAU * 1.5) * R * 0.35; g.moveTo(x, y); g.lineTo(x, -y); }
  g.strokeStyle = 'rgba(220,200,255,0.3)'; g.lineWidth = size * 0.018; g.stroke();
  g.restore();
  // symbol in front
  const r = size * 0.22;
  const sym = (fn) => { g.save(); fn(); g.restore(); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  const cell = (rr, col = [110, 255, 225], muts = {}) => { g.save(); g.scale(rr, rr); drawPlayer(g, { r: 1, ang: 0, seed: 0.3, muts }, FAKE_T, rr * 2); g.restore(); };
  switch (id) {
    case 'hp': sym(() => { cell(r, undefined, { membrane: 4 }); g.fillStyle = '#ff7d90'; heart(g, r * 0.55, r * 0.5, r * 0.5); }); break;
    case 'motor': sym(() => { g.translate(r * 0.4, 0); cell(r * 0.9, undefined, { flagellum: 4 }); }); break;
    case 'digest': sym(() => { cell(r, undefined, { vacuole: 5 }); }); break;
    case 'splice': sym(() => {
      g.strokeStyle = '#fff'; g.lineWidth = size * 0.05;
      g.beginPath(); g.arc(-r * 0.45, r * 0.55, r * 0.28, 0, TAU); g.arc(r * 0.45, r * 0.55, r * 0.28, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-r * 0.3, r * 0.3); g.lineTo(r * 0.55, -r * 0.9); g.moveTo(r * 0.3, r * 0.3); g.lineTo(-r * 0.55, -r * 0.9); g.stroke();
    }); break;
    case 'wide': sym(() => {
      for (let i = 0; i < 4; i++) {
        g.save(); g.rotate((i - 1.5) * 0.28); g.translate(0, -r * 0.2);
        g.beginPath(); g.roundRect(-r * 0.32, -r * 0.95, r * 0.64, r * 0.95, r * 0.12);
        g.fillStyle = ['#7cf0a3', '#6fc8ff', '#c79cff', '#ffcf6e'][i]; g.globalAlpha = 0.9; g.fill();
        g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5; g.stroke();
        g.restore();
      }
    }); break;
    case 'headstart': sym(() => {
      cell(r * 0.8, undefined, { cilia: 2 });
      g.beginPath(); g.moveTo(r * 0.9, -r * 0.5); g.lineTo(r * 1.5, 0); g.lineTo(r * 0.9, r * 0.5);
      g.strokeStyle = '#ffcf6e'; g.lineWidth = size * 0.06; g.stroke();
    }); break;
    case 'cystmem': sym(() => {
      g.save(); g.scale(r, r); drawPlayer(g, { r: 1, ang: 0, seed: 0.3, muts: {}, cyst: 1 }, FAKE_T, r * 2); g.restore();
      g.beginPath(); g.arc(0, 0, r * 1.45, -2.4, 1.6); g.strokeStyle = '#ffcf6e'; g.lineWidth = size * 0.04; g.stroke();
      g.beginPath(); g.moveTo(cos(1.6) * r * 1.45 + 5, sin(1.6) * r * 1.45 - 3); g.lineTo(cos(1.6) * r * 1.45, sin(1.6) * r * 1.45); g.lineTo(cos(1.6) * r * 1.45 + 6, sin(1.6) * r * 1.45 + 4); g.stroke();
    }); break;
    case 'harvest': sym(() => {
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) { const a = i * 0.9; const d = r * (0.3 + i * 0.13); g.drawImage(glowSprite(dnaC, 1), cos(a) * d - 7, sin(a) * d - 7, 14, 14); }
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#fff'; g.lineWidth = size * 0.05;
      g.beginPath(); g.moveTo(-r * 0.5, -r * 0.9); g.bezierCurveTo(r * 0.9, -r * 0.3, -r * 0.9, r * 0.3, r * 0.5, r * 0.9); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.beginPath(); g.moveTo(r * 0.5, -r * 0.9); g.bezierCurveTo(-r * 0.9, -r * 0.3, r * 0.9, r * 0.3, -r * 0.5, r * 0.9); g.stroke();
    }); break;
    case 'sensory': sym(() => {
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, r * (0.75 + i * 0.35), -0.9, 0.9); g.strokeStyle = `rgba(150,255,230,${0.9 - i * 0.25})`; g.lineWidth = size * 0.035; g.stroke(); }
      cell(r * 0.55, undefined, { biolum: 2 });
    }); break;
  }
  return c;
}
function heart(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s / 24, s / 24); g.translate(-12, -12);
  g.beginPath(); g.moveTo(12, 20); g.bezierCurveTo(12, 20, 4.5, 15.5, 4.5, 10); g.bezierCurveTo(4.5, 5, 10.5, 4.5, 12, 7.2); g.bezierCurveTo(13.5, 4.5, 19.5, 5, 19.5, 10); g.bezierCurveTo(19.5, 15.5, 12, 20, 12, 20);
  g.fill(); g.restore();
}

// kind: 'microbe' (species + boss ids) | 'mutation' | 'genome' | 'stage' (id = 1..6)
export function portrait(kind, id, size = 96, stage) {
  try {
    if (kind === 'microbe') return microbePortrait(id, size);
    if (kind === 'mutation') return mutationPortrait(id, size, stage);
    if (kind === 'genome') return genomePortrait(id, size);
    if (kind === 'stage') return stagePortrait(id, size);
  } catch (e) { console.warn('portrait failed', kind, id, e); }
  const [c] = portraitCanvas(size);
  return c;
}
