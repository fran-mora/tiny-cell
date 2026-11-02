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
// Five evolution stages share one drawing pipeline: a per-frame body geometry `G` describes the main body
// (an ellipse, or the fish outline at stage 5) and every mutation overlay positions itself through it.
//   1 single cell · 2 colony · 3 multicellular · 4 swimmer (segmented larva) · 5 sea creature (larval fish)
// =====================================================================================================
const S3X = 1.18, S3Y = 0.69;                                      // stage 3: elongated tissue body
const HX = 0.1, HRX = 0.84, HRY = 0.78;                             // stage 4: head
const SEG_L = [0.5, 0.45, 0.4, 0.34], SEG_W = [0.52, 0.44, 0.36, 0.28]; // stage 4: trailing segments
const F_XF = 1.08, F_XR = -0.98, F_XM = 0.32, F_W = 0.55, F_WT = 0.11, FC = 0.1; // stage 5: fish outline

const SIG_C = [185, 170, 255], NERVE_C = [150, 215, 255], GILL_C = [255, 140, 190], EYE_GLOW = [150, 255, 235];
const SHELL_C = [246, 214, 158], HIDE_C = [60, 110, 140], HIDE_EDGE = [205, 240, 255];
const MUSCLE_C = [255, 100, 118], TENT_C = [236, 196, 255], POLYP_C = [255, 186, 212];
const NOMUT = {};

const G = { st: 1, cx: 0, ax: 1, ay: 1, ox: 0, kx: 1, ky: 1, tx: -0.92, ty: 0, ta: 0, ph: 0, amp: 0, hlx: 0, hls: 1 };
const SEGS = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, a: 0, hl: 0.3, hw: 0.3 }));
const SATS = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, a: 0, r: 0.4 }));
const RIM = [0, 0, 0, 0], TMPA = [0, 0], TMPB = [0, 0];

function clampStage(s) { s = s | 0; return s < 1 ? 1 : s > 5 ? 5 : s; }

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

// ----- stage 5 fish outline -----
function fishW(x) {
  if (x >= F_XM) { const u = (x - F_XM) / (F_XF - F_XM); return u >= 1 ? 0 : F_W * sqrt(1 - u * u); }
  const u = min(1, (F_XM - x) / (F_XM - F_XR));
  return F_WT + (F_W - F_WT) * (1 - u ** 1.6);
}
// lateral undulation of the centre line (travels head → tail)
function fishYC(x) {
  if (x >= 0.5) return 0;
  const w = min(1.15, (0.5 - x) / (0.5 - F_XR));
  return G.amp * w * sqrt(w) * sin(G.ph + 2.6 * x);
}
function tailBeat() { return 0.42 * sin(G.ph + 2.6 * F_XR - 0.9); }
let FISH_R = null;
function fishTable() {
  if (FISH_R) return FISH_R;
  const N = 64; FISH_R = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU, c = cos(a), s = sin(a);
    let lo = 0, hi = 1.6;
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2, x = FC + c * mid, y = s * mid;
      if (x <= F_XF && x >= F_XR && abs(y) <= fishW(x)) lo = mid; else hi = mid;
    }
    FISH_R[i] = lo;
  }
  return FISH_R;
}
function fishRimRaw(th, out) {
  const R = fishTable(); let u = th / TAU; u -= Math.floor(u);
  const f = u * 64, i = f | 0, fr = f - i, r = R[i] + (R[i + 1] - R[i]) * fr;
  const x = FC + cos(th) * r;
  out[0] = x; out[1] = sin(th) * r + fishYC(x);
  return out;
}

// point + outward normal on the main body's outline at polar angle th → RIM [x, y, nx, ny]
function rim(th, out = RIM) {
  if (G.st === 5) {
    fishRimRaw(th - 0.035, TMPA); fishRimRaw(th + 0.035, TMPB); fishRimRaw(th, out);
    const tx = TMPB[0] - TMPA[0], ty = TMPB[1] - TMPA[1], l = Math.hypot(tx, ty) || 1;
    out[2] = ty / l; out[3] = -tx / l;
    return out;
  }
  const c = cos(th), s = sin(th);
  out[0] = G.cx + G.ax * c; out[1] = G.ay * s;
  const nx = c / G.ax, ny = s / G.ay, l = Math.hypot(nx, ny) || 1;
  out[2] = nx / l; out[3] = ny / l;
  return out;
}
// half-width of the main body at x, and its centre line
function hwAt(x) {
  if (G.st === 5) return fishW(x);
  const u = (x - G.cx) / G.ax;
  return u <= -1 || u >= 1 ? 0 : G.ay * sqrt(1 - u * u);
}
function ycAt(x) { return G.st === 5 ? fishYC(x) : 0; }
function insideBody(x, y, mg) {
  if (G.st === 5) { if (x < F_XR + mg * 0.5 || x > F_XF - mg) return false; return abs(y - fishYC(x)) < fishW(x) - mg; }
  const a = G.ax - mg, b = G.ay - mg; if (a <= 0 || b <= 0) return false;
  const dx = (x - G.cx) / a, dy = y / b; return dx * dx + dy * dy < 1;
}
// angle of feature i of n around the rim (stages 4/5 leave the rear free for the tail)
function ringTh(i, n, off) {
  if (G.st === 4) return -2.25 + ((i + 0.5) / n) * 4.5;
  if (G.st === 5) return -2.8 + ((i + 0.5) / n) * 5.6;
  return (i / n) * TAU + off;
}

const SAT_A = [PI - 0.62, PI + 0.62, PI - 1.6, PI + 1.6], SAT_R = [0.45, 0.45, 0.37, 0.37];
function setupGeom(p, stage, st, t, ph) {
  G.st = stage; G.ph = ph;
  const sx = 1 + st, sy = 1 - st * 0.55, spd = min(1, p.speedN || 0);
  G.cx = 0; G.ox = 0; G.kx = 1; G.ky = 1; G.hlx = 0; G.hls = 1;
  G.tx = -0.92 - st * 0.5; G.ty = 0; G.ta = 0;
  if (stage <= 2) {
    G.ax = sx; G.ay = sy;
    if (stage === 2) {
      for (let i = 0; i < 4; i++) {
        const q = SATS[i], sg = i & 1 ? -1 : 1;
        q.r = SAT_R[i] * (1 + 0.07 * sin(t * 2.1 + i * 1.7));
        q.a = SAT_A[i] + 0.1 * sin(t * 0.45 + i * 2.3) + sg * st * 1.1;
        const d = 1 + q.r * 0.88 + 0.025 * sin(t * 1.3 + i);
        q.x = cos(q.a) * d * sx; q.y = sin(q.a) * d * sy;
      }
    }
  } else if (stage === 3) {
    G.ax = S3X * sx; G.ay = S3Y * sy; G.kx = 1.06; G.ky = 0.6; G.tx = -G.ax + 0.06; G.hlx = 0.08; G.hls = 0.85;
  } else if (stage === 4) {
    G.cx = HX; G.ax = HRX * sx; G.ay = HRY * sy; G.ox = HX; G.kx = 0.8; G.ky = 0.76; G.hlx = HX; G.hls = 0.82;
    G.amp = 0.3 + 0.18 * spd;
    const k = 1 + st * 0.5, wph = ph * 0.62;
    let x = G.cx - G.ax * 0.74, y = 0, th = 0;
    for (let i = 0; i < 4; i++) {
      const q = SEGS[i];
      th = G.amp * (0.3 + 0.7 * (i + 1) / 4) * sin(wph - i * 1.05);
      const L = SEG_L[i] * k, nx = x - L * cos(th), ny = y - L * sin(th);
      q.x = (x + nx) * 0.5; q.y = (y + ny) * 0.5; q.a = th; q.hl = L * 0.7; q.hw = SEG_W[i] * (1 - st * 0.3);
      x = nx; y = ny;
    }
    G.tx = x; G.ty = y; G.ta = th;
  } else {
    G.cx = FC; G.ax = F_XF - FC; G.ay = F_W; G.ox = 0.14; G.kx = 0.6; G.ky = 0.36; G.hlx = 0.42; G.hls = 0.62;
    G.amp = 0.06 + 0.06 * spd;
    const b = tailBeat();
    G.tx = F_XR + cos(PI + b) * 0.66; G.ty = fishYC(F_XR) + sin(PI + b) * 0.66; G.ta = b;
  }
}

// ----- fins -----
// translucent ray fin with root at (x,y) pointing along angle a; side mirrors it so the leading edge faces forward
function finShape(ctx, x, y, a, side, len, wid, fill, edge, rayC, lw, rays = 4) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -wid * 0.4);
  ctx.bezierCurveTo(len * 0.3, -wid * 1.1, len * 0.85, -wid * 0.95, len, -wid * 0.1);
  ctx.bezierCurveTo(len * 0.95, wid * 0.5, len * 0.45, wid * 0.8, 0, wid * 0.4);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.beginPath();
  for (let k = 1; k <= rays; k++) {
    const u = k / (rays + 1);
    ctx.moveTo(0, (u - 0.5) * wid * 0.6);
    ctx.lineTo(len * (0.62 + 0.3 * sin(u * PI)), (u - 0.62) * wid * 1.5);
  }
  ctx.strokeStyle = rayC; ctx.lineWidth = lw(0.8); ctx.stroke();
  ctx.restore();
}
function caudalFin(ctx, x, y, a, L, W, flex, body, mem, lw) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const f = flex;
  ctx.beginPath(); ctx.moveTo(0, -0.09);
  ctx.quadraticCurveTo(L * 0.42, -W * 0.5, L, -W * 0.64 + f);
  ctx.quadraticCurveTo(L * 0.74, -W * 0.14 + f * 0.6, L * 0.64, f * 0.5);
  ctx.quadraticCurveTo(L * 0.74, W * 0.14 + f * 0.6, L, W * 0.64 + f);
  ctx.quadraticCurveTo(L * 0.42, W * 0.5, 0, 0.09);
  ctx.closePath();
  ctx.fillStyle = rgbStr(body, 0.34); ctx.fill();
  ctx.strokeStyle = rgbStr(mem, 0.8); ctx.lineWidth = lw(1.3); ctx.stroke();
  ctx.beginPath();
  for (let k = -2; k <= 2; k++) {
    const v = k / 2, ex = L * (0.66 + 0.3 * abs(v)), ey = v * W * 0.58 + f * (0.5 + 0.5 * abs(v));
    ctx.moveTo(0.03, v * 0.06); ctx.quadraticCurveTo(ex * 0.5, v * W * 0.32 + f * 0.2, ex, ey);
  }
  ctx.strokeStyle = rgbStr(mem, 0.38); ctx.lineWidth = lw(0.9); ctx.stroke();
  ctx.restore();
}

// ----- colony (stage 2) -----
function drawColony(ctx, p, m, t, lw, body, mem, nucC) {
  const sx = G.ax, sy = G.ay;
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

// ----- tissue (stage 3): Voronoi cells, built once into Path2Ds -----
let TISSUE = null;
function clipHalf(poly, mx, my, dx, dy) {
  const out = [], n = poly.length;
  for (let k = 0; k < n; k++) {
    const a = poly[k], b = poly[(k + 1) % n];
    const da = (a[0] - mx) * dx + (a[1] - my) * dy, db = (b[0] - mx) * dx + (b[1] - my) * dy;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) { const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
  }
  return out;
}
function tissue() {
  if (TISSUE) return TISSUE;
  let sd = 4321; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const seeds = [];
  const dx = 0.3, dy = 0.26;
  for (let j = -3; j <= 3; j++) for (let i = -5; i <= 5; i++) {
    const x = (i + (j & 1) * 0.5) * dx + (rnd() - 0.5) * 0.1, y = j * dy + (rnd() - 0.5) * 0.08;
    if ((x / (S3X * 0.97)) ** 2 + (y / (S3Y * 0.95)) ** 2 < 1) seeds.push([x, y]);
  }
  const bound = [];
  for (let k = 0; k < 48; k++) { const a = (k / 48) * TAU; bound.push([cos(a) * S3X * 1.04, sin(a) * S3Y * 1.04]); }
  const cells = new Path2D(), nuc = new Path2D(), spk = new Path2D();
  for (let i = 0; i < seeds.length; i++) {
    const [sx, sy] = seeds[i];
    let poly = bound;
    for (let j = 0; j < seeds.length && poly.length > 2; j++) {
      if (j === i) continue;
      const ddx = seeds[j][0] - sx, ddy = seeds[j][1] - sy;
      if (ddx * ddx + ddy * ddy > 0.5) continue;
      poly = clipHalf(poly, sx + ddx / 2, sy + ddy / 2, ddx, ddy);
    }
    if (poly.length < 3) continue;
    // area centroid
    let A = 0, cx = 0, cy = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], cr = a[0] * b[1] - b[0] * a[1];
      A += cr; cx += (a[0] + b[0]) * cr; cy += (a[1] + b[1]) * cr;
    }
    A *= 0.5; if (abs(A) < 1e-5) continue; cx /= 6 * A; cy /= 6 * A;
    const f = 0.84, n = poly.length;
    const P = poly.map((v) => [cx + (v[0] - cx) * f, cy + (v[1] - cy) * f]);
    cells.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
    for (let k = 0; k < n; k++) { const a = P[k], b = P[(k + 1) % n]; cells.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    cells.closePath();
    const nr = 0.038 + rnd() * 0.02, ox = (rnd() - 0.5) * 0.05, oy = (rnd() - 0.5) * 0.04;
    nuc.moveTo(cx + ox + nr, cy + oy); nuc.arc(cx + ox, cy + oy, nr, 0, TAU);
    if (rnd() < 0.6) { const a = rnd() * TAU, d = 0.06, r = 0.016; spk.moveTo(cx + cos(a) * d + r, cy + sin(a) * d); spk.arc(cx + cos(a) * d, cy + sin(a) * d, r, 0, TAU); }
  }
  TISSUE = { cells, nuc, spk };
  return TISSUE;
}
function drawTissue(ctx, t, lw, body, mem, nucC, st) {
  const T3 = tissue();
  ctx.save(); ctx.clip();
  if (st) ctx.scale(1 + st, 1 - st * 0.55);
  ctx.fillStyle = rgbStr(mixRGB(body, WHITE, 0.45), 0.13); ctx.fill(T3.cells);
  ctx.strokeStyle = rgbStr(mem, 0.48); ctx.lineWidth = lw(1); ctx.stroke(T3.cells);
  ctx.translate(0.012 * sin(t * 1.1), 0.01 * cos(t * 1.4));
  ctx.fillStyle = rgbStr(nucC, 0.8); ctx.fill(T3.nuc);
  ctx.fillStyle = rgbStr(mem, 0.6); ctx.fill(T3.spk);
  ctx.restore();
}

// ----- swimmer (stage 4): tail fin + trailing segments, with their per-segment mutation details -----
function drawSegments(ctx, p, m, t, lw, body, mem, nucC, A0) {
  const flick = 0.3 * sin(G.ph * 0.62 - 4.4);
  caudalFin(ctx, G.tx + cos(G.ta) * 0.05, G.ty + sin(G.ta) * 0.05, PI + G.ta + flick, 0.4 + (m.fins ? 0.05 * m.fins : 0), 0.6, 0.06 * sin(G.ph * 0.62 - 5), body, mem, lw);
  for (let i = 3; i >= 0; i--) {
    const q = SEGS[i], hl = q.hl, hw = q.hw;
    ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.a);
    // behind the segment
    if (m.cilia) ciliaFringe(ctx, 12 + 2 * m.cilia, t + i * 0.6, 0.08 + 0.02 * m.cilia, lw(1.1), rgbStr(mem, 0.7), hl, hw, 14);
    if (m.fins) {
      const fl = 0.2 + 0.035 * m.fins, flap = 0.3 * sin(G.ph * 0.7 - i * 0.9);
      for (const sd of [-1, 1]) finShape(ctx, -0.05 * hl, sd * hw * 0.9, sd * (PI / 2 + 0.55 + flap * sd), sd, fl, fl * 0.42, rgbStr(body, 0.3), rgbStr(mem, 0.75), rgbStr(mem, 0.35), lw, 2);
    }
    if (m.spikes) {
      const sl = 0.12 + 0.045 * m.spikes;
      ctx.beginPath();
      for (const th of [1.25, 1.95, -1.25, -1.95]) {
        const c = cos(th), s = sin(th), b = 0.22;
        ctx.moveTo(cos(th - b) * hl * 0.95, sin(th - b) * hw * 0.95);
        ctx.lineTo(c * (hl + sl * 0.5) - sl * 0.35, s * (hw + sl));
        ctx.lineTo(cos(th + b) * hl * 0.95, sin(th + b) * hw * 0.95);
      }
      ctx.fillStyle = rgbStr([230, 255, 250], 0.92); ctx.fill();
    }
    // the segment
    ctx.save(); ctx.scale(hl, hw);
    blobPath(ctx, { n: 16, t: t * 1.1, seed: p.seed + i * 2.1, amp: 0.05 });
    ctx.fillStyle = bodyGrad(ctx, body); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgbStr(mem, 0.92); ctx.lineWidth = lw(1.5 + (m.membrane || 0) * 0.5); ctx.stroke();
    // inside
    dots(ctx, 2, p.seed + i * 3, t, 0.3, 0.55, 0.055, 0.3, 0, hl, hw); ctx.fillStyle = rgbStr(mem, 0.5); ctx.fill();
    nucleus(ctx, nucC, 0.08 * hl, 0, 0.26 * hw, t, p.seed + i);
    if (m.muscle) {
      const bw = 0.05 + 0.012 * m.muscle;
      ctx.beginPath();
      for (const sd of [-1, 1]) for (let k = 0; k <= 6; k++) { const u = -0.72 + (k / 6) * 1.44, x = u * hl, y = sd * 0.5 * hw * sqrt(1 - u * u); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.strokeStyle = rgbStr(MUSCLE_C, 0.26 + 0.06 * m.muscle); ctx.lineWidth = bw * (1 + 0.12 * sin(t * 3.3 - i)); ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath();
      for (const sd of [-1, 1]) for (let k = 0; k <= 7; k++) { const u = -0.65 + (k / 7) * 1.3, x = u * hl, y = sd * 0.5 * hw * sqrt(1 - u * u); ctx.moveTo(x, y - bw * 0.45); ctx.lineTo(x, y + bw * 0.45); }
      ctx.strokeStyle = rgbStr([255, 205, 210], 0.45 + 0.07 * m.muscle); ctx.lineWidth = lw(0.9); ctx.stroke();
    }
    if (m.hide) {
      const sr = 0.12 + 0.01 * m.hide;
      ctx.beginPath();
      let r = 0;
      for (let x = hl * 0.7; x > -hl; x -= sr * 1.15, r++) {
        for (let y = -hw + (r & 1) * sr * 0.72; y <= hw; y += sr * 1.45) {
          const u = x / (hl - sr * 0.4), v = y / (hw - sr * 0.5);
          if (u * u + v * v < 1) { ctx.moveTo(x, y + sr); ctx.arc(x, y, sr, PI / 2, PI * 1.5); }
        }
      }
      hideStyle(ctx, m.hide, lw);
    }
    if (m.shell) {
      const pf = 0.8 * hl, pb = -0.7 * hl, hf = hw * 0.58, hb = hw * 0.66, bu = hl * 0.16;
      shellPlate(ctx, pf, pb, hf, hb, bu, m.shell, lw, hw, hw * 0.9);
      if (m.shell >= 3) {
        ctx.beginPath(); ctx.moveTo(-0.15 * hl, 0); ctx.lineTo(pf * 0.8, 0);
        ctx.strokeStyle = 'rgba(255,248,225,0.6)'; ctx.lineWidth = lw(1); ctx.stroke();
      }
    }
    if (m.biolum) {
      ctx.globalCompositeOperation = 'lighter';
      const g = glowSprite([150, 255, 230], 1);
      const pulse = 0.5 + 0.5 * sin(t * 3 - i * 1.1), sz = 0.16 + 0.07 * pulse;
      ctx.globalAlpha = A0 * (0.45 + 0.4 * pulse);
      for (const sd of (m.biolum >= 3 ? [-1, 1] : [0])) ctx.drawImage(g, -sz, sd * hw * 0.5 - sz, sz * 2, sz * 2);
      ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
}

// ----- sea creature (stage 5) -----
const FX = new Float32Array(40), FY = new Float32Array(40);
function fishPath(ctx, p, t) {
  const N = 12, sd = p.seed || 0, wob = 0.014 + (p.wob || 0), dent = p.dent || 0, da = p.dentA || 0;
  let n = 0;
  FX[n] = F_XF; FY[n] = 0; n++;
  for (let i = 1; i <= N; i++) { const u = i / N, x = F_XF - (F_XF - F_XR) * (1 - cos((u * PI) / 2)); FX[n] = x; FY[n] = -fishW(x); n++; }
  for (let i = N; i >= 1; i--) { const u = i / N, x = F_XF - (F_XF - F_XR) * (1 - cos((u * PI) / 2)); FX[n] = x; FY[n] = fishW(x); n++; }
  for (let i = 0; i < n; i++) {
    const dx = FX[i] - FC, dy = FY[i], th = Math.atan2(dy, dx);
    let f = 1 + wob * (0.55 * sin(3 * th + t * 1.7 + sd) + 0.45 * sin(5 * th - t * 2.3 + sd * 1.7));
    if (dent) { let d = th - da; d = Math.atan2(sin(d), cos(d)); f -= dent * 0.8 * exp(-d * d * 5); }
    FX[i] = FC + dx * f; FY[i] = dy * f + fishYC(FX[i]);
  }
  ctx.beginPath();
  ctx.moveTo((FX[n - 1] + FX[0]) / 2, (FY[n - 1] + FY[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(FX[i], FY[i], (FX[i] + FX[j]) / 2, (FY[i] + FY[j]) / 2); }
  ctx.closePath();
  return n;
}
function drawFishBack(ctx, m, t, lw, body, mem) {
  const b = tailBeat();
  caudalFin(ctx, F_XR + 0.05, fishYC(F_XR), PI + b, 0.7 + (m.fins ? 0.05 * m.fins : 0), 0.62, 0.1 * sin(G.ph - 4.3), body, mem, lw);
  // pectoral fins
  const fk = 1 + 0.12 * (m.fins || 0), px = 0.2, pw = fishW(px);
  for (const sd of [-1, 1]) {
    const flap = 0.3 * sin(t * 4.2 + sd * 1.3);
    finShape(ctx, px, sd * (pw - 0.06), sd * (PI / 2 + 0.72 + flap), sd, 0.5 * fk, 0.2 * fk, rgbStr(body, 0.32), rgbStr(mem, 0.8), rgbStr(mem, 0.38), lw, 4);
  }
}
function drawFishOrgans(ctx, m, t, lw, mem) {
  // myomeres: the chevron muscle blocks of a see-through larval fish
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const x = 0.3 - i * 0.125, w = fishW(x) * 0.84, yc = fishYC(x);
    ctx.moveTo(x - 0.075, yc - w); ctx.lineTo(x + 0.05, yc); ctx.lineTo(x - 0.075, yc + w);
  }
  ctx.strokeStyle = m.muscle ? rgbStr(MUSCLE_C, 0.4 + 0.08 * m.muscle) : rgbStr(mem, 0.24); ctx.lineWidth = lw(m.muscle ? 1.4 : 1); ctx.stroke();
  // notochord
  ctx.beginPath();
  for (let k = 0; k <= 12; k++) { const x = 0.58 - (k / 12) * (0.58 - F_XR - 0.02); k ? ctx.lineTo(x, fishYC(x)) : ctx.moveTo(x, fishYC(x)); }
  ctx.strokeStyle = 'rgba(235,255,250,0.32)'; ctx.lineWidth = lw(2.4); ctx.stroke();
  // gut
  const g0 = fishYC(-0.38), g1 = fishYC(-0.1);
  ctx.beginPath(); ctx.moveTo(0.46, 0.13); ctx.bezierCurveTo(0.22, 0.27, -0.1, 0.22 + g1, -0.38, 0.12 + g0);
  ctx.strokeStyle = 'rgba(255,190,120,0.26)'; ctx.lineWidth = 0.065; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,225,170,0.32)'; ctx.lineWidth = lw(1); ctx.stroke();
  // swim bladder
  const by = -0.07 + fishYC(0.02);
  ctx.beginPath(); ctx.ellipse(0.02, by, 0.2, 0.1, 0, 0, TAU);
  ctx.fillStyle = 'rgba(225,248,255,0.28)'; ctx.fill();
  ctx.strokeStyle = 'rgba(240,255,255,0.7)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-0.03, by - 0.035, 0.08, 0.03, 0, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
  // heart, beating
  const beat = 0.5 + 0.5 * sin(t * 7);
  ctx.beginPath(); ctx.arc(0.5, 0.2, 0.045 * (1 + 0.2 * beat), 0, TAU);
  ctx.fillStyle = `rgba(255,110,135,${0.4 + 0.25 * beat})`; ctx.fill();
  // brain between the eyes
  ctx.beginPath(); ctx.ellipse(0.79, -0.07, 0.09, 0.065, 0.2, 0, TAU); ctx.ellipse(0.79, 0.07, 0.09, 0.065, -0.2, 0, TAU);
  ctx.fillStyle = 'rgba(210,240,255,0.16)'; ctx.fill();
}

// ----- mutation overlays -----
function drawSignal(ctx, lv, t, lw, A0) {
  const n = 2 + (lv >= 2) + (lv >= 4), reach = 0.85 + 0.12 * lv;
  const cx = G.st === 5 ? 0.18 : G.cx, ax = G.st === 5 ? 0.95 : G.ax, ay = G.ay;
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

const TBX = new Float32Array(5 * 15), TBY = new Float32Array(5 * 15);
function drawTentacles(ctx, lv, t, lw) {
  const n = min(5, 2 + lv), N = 14, len = (0.95 + 0.14 * lv) * (G.st === 5 ? 1.2 : 1), step = len / N;
  for (let i = 0; i < n; i++) {
    const c = i - (n - 1) / 2, o = i * 15;
    let x, y, a;
    // a is the heading of the tentacle root: backward, splayed away from the midline
    if (G.st === 5) { x = 0.08 - abs(c) * 0.1; y = c * 0.2 + fishYC(x); a = PI - c * 0.36; }
    else if (G.st === 4) { const sd = i & 1 ? 1 : -1, k = i >> 1; rim(sd * (1.85 + k * 0.3)); x = RIM[0] - RIM[2] * 0.06; y = RIM[1] - RIM[3] * 0.06; a = PI - sd * (0.45 + k * 0.12); }
    else { rim(PI + c * 0.34); x = RIM[0] - RIM[2] * 0.08; y = RIM[1] - RIM[3] * 0.08; a = PI + c * 0.3; }
    const curl = (i & 1 ? 1 : -1) * (0.5 + 0.3 * sin(t * 0.6 + i * 2.1));
    TBX[o] = x; TBY[o] = y;
    for (let k = 1; k <= N; k++) {
      const u = k / N;
      a += 0.2 * sin(t * 1.5 + i * 1.9 - u * 4.5) * (0.5 + u) * step * 4 + curl * u * u * step * 3.2;
      x += cos(a) * step; y += sin(a) * step;
      TBX[o + k] = x; TBY[o + k] = y;
    }
    ctx.beginPath(); ctx.moveTo(TBX[o], TBY[o]);
    for (let k = 1; k <= 8; k++) ctx.lineTo(TBX[o + k], TBY[o + k]);
    ctx.strokeStyle = rgbStr(TENT_C, 0.26); ctx.lineWidth = lw(4.6); ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(TBX[o], TBY[o]);
    for (let k = 1; k <= N; k++) ctx.lineTo(TBX[o + k], TBY[o + k]);
    ctx.strokeStyle = rgbStr(TENT_C, 0.9); ctx.lineWidth = lw(G.st >= 4 ? 1.8 : 1.5); ctx.stroke();
  }
  // stinging bead batteries
  ctx.beginPath();
  for (let i = 0; i < n; i++) for (let k = 3; k <= 13; k += 2) { const x = TBX[i * 15 + k], y = TBY[i * 15 + k], r = 0.03 * (1 - k / 20); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  ctx.fillStyle = 'rgba(255,200,235,0.9)'; ctx.fill();
}

function drawSideFins(ctx, lv, t, lw, body, mem) {
  const fill = rgbStr(body, 0.3), edge = rgbStr(mem, 0.8), ray = rgbStr(mem, 0.38);
  const flap = 0.22 * sin(t * 4 + 0.5);
  if (G.st === 5) {
    // pelvic fins (the pectorals are part of the body plan and grow with this trait)
    const x = -0.36, w = fishW(x);
    for (const sd of [-1, 1]) finShape(ctx, x, sd * (w - 0.04) + fishYC(x), sd * (PI / 2 + 0.85 + flap * sd), sd, 0.3 + 0.04 * lv, 0.12 + 0.015 * lv, fill, edge, ray, lw, 3);
    return;
  }
  // (the colony wears them further forward, clear of its side cells)
  const x = G.cx + (G.st === 4 ? -0.05 : G.st === 2 ? 0.42 : 0.12) * G.ax, w = hwAt(x), L = 0.42 + 0.07 * lv, W = 0.16 + 0.025 * lv;
  for (const sd of [-1, 1]) finShape(ctx, x, sd * w * 0.94, sd * (PI / 2 + 0.6 + flap * sd), sd, L, W, fill, edge, ray, lw, 4);
  if (lv >= 3 && G.st <= 3) {
    const x2 = G.cx - 0.55 * G.ax, w2 = hwAt(x2);
    for (const sd of [-1, 1]) finShape(ctx, x2, sd * w2 * 0.92, sd * (PI / 2 + 0.9 - flap * sd), sd, L * 0.6, W * 0.7, fill, edge, ray, lw, 2);
  }
}
// dorsal crest along the midline (seen from above it leans to one side as the animal swims)
function drawDorsalFin(ctx, lv, t, lw, body, mem) {
  const h0 = 0.12 + 0.035 * lv, lean = 0.65 + 0.35 * sin(t * 2.2);
  const N = 9;
  ctx.beginPath();
  if (G.st === 4) {
    // along the segment chain (point 0 = back of the head, then the segment centres)
    ctx.moveTo(G.cx - G.ax * 0.2, 0);
    for (let k = 0; k < 4; k++) ctx.lineTo(SEGS[k].x, SEGS[k].y);
    for (let k = 4; k >= 0; k--) {
      const x = k ? SEGS[k - 1].x : G.cx - G.ax * 0.2, y = k ? SEGS[k - 1].y : 0, a = k ? SEGS[k - 1].a : 0;
      const h = h0 * (k === 0 ? 0.3 : sin((k / 5) * PI) + 0.25) * lean;
      ctx.lineTo(x + sin(a) * h - 0.06, y - cos(a) * h);
    }
  } else {
    const x0 = G.st === 5 ? 0.45 : G.cx + 0.42 * G.ax, x1 = G.st === 5 ? -0.85 : G.cx - 0.9 * G.ax;
    for (let k = 0; k <= N; k++) { const x = x0 + (x1 - x0) * (k / N); k ? ctx.lineTo(x, ycAt(x)) : ctx.moveTo(x, ycAt(x)); }
    for (let k = N; k >= 0; k--) {
      const u = k / N, x = x0 + (x1 - x0) * u, h = h0 * (sin(u * PI) ** 0.7) * (1 + 0.35 * u) * lean;
      ctx.lineTo(x - 0.08 * u, ycAt(x) - h);
    }
  }
  ctx.closePath();
  ctx.fillStyle = rgbStr(body, 0.32); ctx.fill();
  ctx.strokeStyle = rgbStr(mem, 0.8); ctx.lineWidth = lw(1.1); ctx.stroke();
  if (G.st !== 4) {
    const x0 = G.st === 5 ? 0.45 : G.cx + 0.42 * G.ax, x1 = G.st === 5 ? -0.85 : G.cx - 0.9 * G.ax;
    ctx.beginPath();
    for (let k = 1; k < N; k++) { const u = k / N, x = x0 + (x1 - x0) * u, h = h0 * (sin(u * PI) ** 0.7) * (1 + 0.35 * u) * lean; ctx.moveTo(x, ycAt(x)); ctx.lineTo(x - 0.08 * u - 0.04, ycAt(x) - h * 0.92); }
    ctx.strokeStyle = rgbStr(mem, 0.4); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
}

function drawGills(ctx, lv, t, lw, A0) {
  const gx = G.st === 5 ? 0.42 : G.st === 4 ? G.cx - 0.12 * G.ax : G.cx + (G.st === 2 ? 0.45 : 0.1) * G.ax;
  const L = 0.32 + 0.05 * lv, breathe = 0.5 + 0.5 * sin(t * 1.8), w = hwAt(gx), yc = ycAt(gx);
  // soft glow around the tufts
  ctx.globalCompositeOperation = 'lighter';
  const g = glowSprite(GILL_C);
  ctx.globalAlpha = A0 * (0.32 + 0.2 * breathe + 0.04 * lv);
  for (const sd of [-1, 1]) { const sz = L * 1.25 + 0.08 * breathe; ctx.drawImage(g, gx - L * 0.3 - sz, yc + sd * (w + L * 0.4) - sz, sz * 2, sz * 2); }
  ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
  // stalks (rachis), then the feathery filaments
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      const bx = gx - k * 0.09, by = yc + sd * (hwAt(bx) * 0.9);
      const a = sd * (PI / 2 + 0.5 + (k - 1) * 0.42) + 0.13 * sin(t * 2.3 + k * 1.3 + sd), len = L * (1 - 0.12 * abs(k - 1));
      const ca = cos(a), sa = sin(a), bend = 0.14 * sin(t * 1.7 + k + sd);
      if (pass === 0) {
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + ca * len * 0.5 - sa * bend * len, by + sa * len * 0.5 + ca * bend * len, bx + ca * len, by + sa * len);
      } else {
        const nf = 6, fl = 0.07 + 0.012 * lv;
        for (let j = 1; j <= nf; j++) {
          const u = 0.2 + (j / nf) * 0.78, b2 = 4 * u * (1 - u) * bend * 0.5;
          const x = bx + ca * len * u - sa * b2 * len, y = by + sa * len * u + ca * b2 * len, l = fl * (1.1 - 0.5 * u);
          for (const s2 of [-1, 1]) { ctx.moveTo(x, y); ctx.lineTo(x + cos(a + s2 * 1.05) * l, y + sin(a + s2 * 1.05) * l); }
        }
      }
    }
    if (pass === 0) { ctx.strokeStyle = 'rgba(255,165,200,0.95)'; ctx.lineWidth = lw(1.9); ctx.lineCap = 'round'; }
    else { ctx.strokeStyle = 'rgba(255,205,228,0.85)'; ctx.lineWidth = lw(1); }
    ctx.stroke();
  }
}

const POLYP_BUF = new Float32Array(6 * 12), SAT_ORDER = [2, 3, 0, 1];
function drawPolyps(ctx, lv, t, lw, mem) {
  const n = min(10, 2 + lv), Ls = 0.2 + 0.035 * lv, br = 0.06 + 0.008 * lv, tl = 0.1 + 0.012 * lv;
  const aMax = G.st === 4 ? 2.15 : G.st === 5 ? 2.5 : 2.75;
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
      rim(ringTh(i, n, 0.2));
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
  rim(ringTh(Math.floor(f * n), n, 0.2));
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = A0 * sin(f * n * PI % PI) * 0.9;
  const gs = sz * 0.9;
  ctx.drawImage(glowSprite([220, 250, 255], 1), RIM[0] - gs, RIM[1] - gs, gs * 2, gs * 2);
  ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
}

function drawCnido(ctx, lv, t, lw) {
  const n = 10 + 3 * lv, L0 = 0.12 + 0.025 * lv, bl = 0.045 + 0.006 * lv;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      rim(ringTh(i, n, 0.11));
      const x = RIM[0], y = RIM[1], nx = RIM[2], ny = RIM[3], tx = -ny, ty = nx;
      if (pass === 1) { const cx = x - nx * 0.03, cy = y - ny * 0.03; ctx.moveTo(cx + 0.032, cy); ctx.arc(cx, cy, 0.032, 0, TAU); continue; }
      let f = sin(t * 1.4 + i * 2.7); f = f > 0 ? f ** 6 : 0;
      const L = L0 * (0.7 + 0.7 * f), w = 0.03 * sin(t * 5 + i * 1.3);
      const ex = x + nx * L, ey = y + ny * L;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x + nx * L * 0.5 + tx * w, y + ny * L * 0.5 + ty * w, ex, ey);
      ctx.moveTo(ex - nx * bl + tx * bl * 0.6, ey - ny * bl + ty * bl * 0.6); ctx.lineTo(ex, ey); ctx.lineTo(ex - nx * bl - tx * bl * 0.6, ey - ny * bl - ty * bl * 0.6);
    }
    if (pass === 0) { ctx.strokeStyle = 'rgba(255,244,205,0.92)'; ctx.lineWidth = lw(1.1); ctx.lineCap = 'round'; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(232,150,255,0.88)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,225,255,0.7)'; ctx.lineWidth = lw(0.7); ctx.stroke(); }
  }
}

function drawMuscle(ctx, lv, t, lw) {
  const f5 = G.st === 5; // the fish also tints its myomeres (see drawFishOrgans)
  const x0 = f5 ? -0.82 : G.cx - G.ax * 0.78, x1 = f5 ? 0.5 : G.cx + G.ax * 0.7, N = 12;
  const bw = (0.075 + 0.016 * lv) * min(1, G.ay * 1.25) * (f5 ? 0.8 : 1), pulse = 1 + 0.1 * sin(t * 3.3);
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let k = 0; k <= N; k++) { const x = x1 + (x0 - x1) * (k / N), y = ycAt(x) + sd * 0.5 * hwAt(x); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  if (lv >= 3 && G.st === 3) for (let k = 0; k <= N; k++) { const x = x1 + (x0 - x1) * (k / N); k ? ctx.lineTo(x, 0) : ctx.moveTo(x, 0); }
  ctx.strokeStyle = rgbStr(MUSCLE_C, 0.26 + 0.06 * lv); ctx.lineWidth = bw * pulse; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let x = x1 - 0.04; x > x0 + 0.04; x -= 0.07) { const y = ycAt(x) + sd * 0.5 * hwAt(x); ctx.moveTo(x, y - bw * 0.45); ctx.lineTo(x, y + bw * 0.45); }
  ctx.strokeStyle = rgbStr([255, 205, 210], 0.45 + 0.07 * lv); ctx.lineWidth = lw(0.9); ctx.stroke();
}

function drawJaws(ctx, lv, t, lw) {
  const L = 0.36 + 0.06 * lv, W = 0.1 + 0.014 * lv;
  // rest slightly open, gape wide, then snap shut
  const s = sin(t * 3.1), open = 0.34 + 0.66 * (s > 0 ? s * s : 0) - 0.34 * (s < 0 ? s * s * s * s : 0);
  const th0 = G.st === 5 ? 0.62 : G.st === 3 ? 0.42 : 0.5;
  // dark mouth between the mandibles
  rim(0);
  ctx.beginPath(); ctx.ellipse(RIM[0] - 0.05, 0, 0.07, 0.11 + 0.06 * open, 0, 0, TAU);
  ctx.fillStyle = 'rgba(20,40,50,0.55)'; ctx.fill();
  for (const sd of [-1, 1]) {
    rim(sd * th0);
    const bx = RIM[0] - RIM[2] * 0.07, by = RIM[1] - RIM[3] * 0.07;
    ctx.save(); ctx.translate(bx, by); ctx.rotate(sd * (-0.4 + 0.8 * open)); ctx.scale(1, sd);
    // local frame: +x forward, +y outward; a sickle pointing forward whose tip hooks in toward the mouth
    const tx = L, ty = -L * 0.34;
    ctx.beginPath(); ctx.moveTo(-0.02, W);
    ctx.bezierCurveTo(L * 0.5, W * 1.05, L * 0.92, W * 0.15, tx, ty);
    ctx.bezierCurveTo(L * 0.7, -W * 0.15, L * 0.35, -W * 0.3, -0.02, -W * 0.75);
    ctx.closePath();
    ctx.fillStyle = 'rgba(232,162,84,0.97)'; ctx.fill();
    ctx.strokeStyle = 'rgba(80,38,20,0.85)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    // glossy ridge along the outer edge
    ctx.beginPath(); ctx.moveTo(0.02, W * 0.5); ctx.bezierCurveTo(L * 0.45, W * 0.75, L * 0.82, W * 0.05, tx * 0.96, ty * 0.8);
    ctx.strokeStyle = 'rgba(255,236,196,0.85)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    // teeth on the inner edge
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const x = L * (0.32 + k * 0.24), y = -W * (0.28 + k * 0.1);
      ctx.moveTo(x - 0.035, y + 0.01); ctx.lineTo(x, y - 0.055); ctx.lineTo(x + 0.03, y);
    }
    ctx.fillStyle = 'rgba(255,240,215,0.95)'; ctx.fill();
    ctx.restore();
  }
}

let NERVE = null;
function nerveNet() {
  if (NERVE) return NERVE;
  const n = 16, x = new Float32Array(n), y = new Float32Array(n), e = [];
  for (let i = 0; i < n; i++) { const r = sqrt((i + 0.5) / n) * 0.86, a = i * 2.39996 + 0.4; x[i] = cos(a) * r; y[i] = sin(a) * r; }
  for (let i = 0; i < n; i++) {
    const near = [];
    for (let j = 0; j < n; j++) if (j !== i) near.push([(x[j] - x[i]) ** 2 + (y[j] - y[i]) ** 2, j]);
    near.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < 3; k++) { const j = near[k][1]; if (!e.some((p) => (p[0] === i && p[1] === j) || (p[0] === j && p[1] === i))) e.push([i, j]); }
  }
  NERVE = { n, x, y, e };
  return NERVE;
}
const NX = new Float32Array(32), NY = new Float32Array(32);
function drawNerve(ctx, lv, t, lw, A0) {
  const N = nerveNet(), cnt = min(N.n, 8 + 3 * lv);
  for (let k = 0; k < N.n; k++) {
    if (G.st === 5) { const x = 0.16 + N.x[k] * 0.74; NX[k] = x; NY[k] = fishYC(x) + N.y[k] * fishW(x) * 0.95; }
    else { NX[k] = G.cx + N.x[k] * G.ax * 0.9; NY[k] = N.y[k] * G.ay * 0.9; }
  }
  const lc = rgbStr(NERVE_C, 0.24 + 0.08 * lv);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  for (const [i, j] of N.e) {
    if (i >= cnt || j >= cnt) continue;
    const mx = (NX[i] + NX[j]) / 2 + (NY[j] - NY[i]) * 0.18, my = (NY[i] + NY[j]) / 2 - (NX[j] - NX[i]) * 0.18;
    ctx.moveTo(NX[i], NY[i]); ctx.quadraticCurveTo(mx, my, NX[j], NY[j]);
  }
  // cords: through the colony members, along the segments, or the spinal cord
  if (G.st === 2) for (const q of SATS) {
    let best = 0, bd = -9; for (let k = 0; k < cnt; k++) { const d = NX[k] * cos(q.a) + NY[k] * sin(q.a); if (d > bd) { bd = d; best = k; } }
    ctx.moveTo(NX[best], NY[best]); ctx.lineTo(q.x, q.y);
  }
  if (G.st === 4) { ctx.moveTo(G.cx, 0); for (const q of SEGS) ctx.lineTo(q.x, q.y); ctx.lineTo(G.tx, G.ty); }
  if (G.st === 5) { ctx.moveTo(0.82, 0); for (let k = 1; k <= 10; k++) { const x = 0.82 - (k / 10) * (0.82 - F_XR); ctx.lineTo(x, fishYC(x) - 0.03); } }
  ctx.strokeStyle = lc; ctx.lineWidth = lw(1.1); ctx.stroke();
  // neurons firing in a travelling wave
  const g = glowSprite(NERVE_C, 1);
  const node = (x, y, b) => { const sz = 0.05 + 0.06 * b + 0.01 * lv; ctx.globalAlpha = A0 * (0.35 + 0.55 * b); ctx.drawImage(g, x - sz, y - sz, sz * 2, sz * 2); };
  for (let k = 0; k < cnt; k++) node(NX[k], NY[k], max(0, sin(t * 3.5 - N.x[k] * 4 - k * 0.3)));
  if (G.st === 2) for (let i = 0; i < 4; i++) node(SATS[i].x, SATS[i].y, max(0, sin(t * 3.5 + 3 + i)));
  if (G.st === 4) for (let i = 0; i < 4; i++) node(SEGS[i].x, SEGS[i].y, max(0, sin(t * 3.5 + 2.5 + i * 0.9)));
  if (G.st === 5) node(0.8, 0, 0.6 + 0.4 * sin(t * 2));
  ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
}

function eyeAt(ctx, x, y, r, glowA, A0, lw) {
  if (glowA > 0) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = A0 * glowA;
    const gs = r * 3.4; ctx.drawImage(glowSprite(EYE_GLOW), x - gs, y - gs, gs * 2, gs * 2);
    ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = glowA > 0 ? 'rgba(185,255,238,0.97)' : 'rgba(170,222,232,0.95)'; ctx.fill();
  ctx.strokeStyle = 'rgba(15,45,55,0.65)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * 0.16, y, r * 0.66, 0, TAU); ctx.fillStyle = '#06161f'; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.06, y - r * 0.3, r * 0.25, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.42, y + r * 0.28, r * 0.1, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
}
function drawEyes(ctx, lv, t, lw, A0) {
  let ex, ey, r;
  if (G.st === 5) { ex = 0.66; ey = 0.33; r = 0.135 * (1 + 0.14 * lv); }
  else { ex = G.cx + 0.5 * G.ax; ey = 0.42 * G.ay; r = 0.12 + 0.025 * lv; }
  const glowA = lv ? 0.2 + 0.1 * lv + 0.08 * sin(t * 2.5) : 0;
  for (const sd of [-1, 1]) eyeAt(ctx, ex, sd * ey, r, glowA, A0, lw);
}

// an arched plate between front edge xf and back edge xb; hf/hb = half-widths at the edges, hm = at the middle
function shellPlate(ctx, xf, xb, hf, hb, bu, lv, lw, hmax, hm = (hf + hb) / 2) {
  const cy = 2 * hm - (hf + hb) / 2, cx = (xf + xb) / 2 - bu;
  ctx.beginPath(); ctx.moveTo(xf - bu, -hf);
  ctx.quadraticCurveTo(xf + bu, 0, xf - bu, hf);
  ctx.quadraticCurveTo(cx, cy, xb - bu, hb);
  ctx.quadraticCurveTo(xb + bu, 0, xb - bu, -hb);
  ctx.quadraticCurveTo(cx, -cy, xf - bu, -hf);
  ctx.closePath();
  ctx.save(); ctx.scale(1, max(0.05, hmax)); ctx.fillStyle = bandGrad(ctx, SHELL_C); ctx.globalAlpha *= min(1, 0.5 + 0.1 * lv); ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(140,95,50,0.6)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xf - bu * 1.1, -hf * 0.92); ctx.quadraticCurveTo(xf + bu * 0.9, 0, xf - bu * 1.1, hf * 0.92);
  ctx.strokeStyle = 'rgba(255,250,232,0.9)'; ctx.lineWidth = lw(1.3); ctx.stroke();
}
function drawShell(ctx, lv, t, lw) {
  if (G.st === 4) {
    // head shield over the back of the head (segments carry their own plates)
    const xf = G.cx + 0.12 * G.ax, xb = G.cx - 0.8 * G.ax;
    shellPlate(ctx, xf, xb, hwAt(xf + 0.1) * 0.8, hwAt(xb - 0.05) * 0.85, 0.12, lv, lw, G.ay * 0.8, hwAt((xf + xb) / 2) * 0.86);
    return;
  }
  if (G.st === 5) {
    // dorsal scutes along the back
    const n = 4 + lv, x0 = 0.5, x1 = -0.82, pitch = (x0 - x1) / n;
    for (let i = 0; i < n; i++) {
      const xb = x1 + i * pitch, xf = xb + pitch * 1.5, ycF = fishYC(xf), ycB = fishYC(xb);
      ctx.save(); ctx.translate(0, (ycF + ycB) / 2);
      shellPlate(ctx, xf, xb, fishW(xf) * 0.5, fishW(xb) * 0.55, pitch * 0.35, lv, lw, fishW(xb) * 0.55, fishW((xf + xb) / 2) * 0.6);
      ctx.restore();
    }
    return;
  }
  const n = min(5, 1 + lv), xf0 = G.cx + G.ax * (-0.05 + 0.14 * min(lv, 4)), xr = G.cx - G.ax * 0.9;
  const pitch = (xf0 - xr) / n;
  for (let i = 0; i < n; i++) {
    const xb = xr + i * pitch, xf = xb + pitch * 1.45;
    shellPlate(ctx, xf, xb, hwAt(xf - pitch * 0.2) * 0.86, hwAt(xb) * 0.86, pitch * 0.32, lv, lw, G.ay * 0.86, hwAt((xf + xb) / 2 - pitch * 0.2) * 0.88);
  }
}

function hideStyle(ctx, lv, lw) {
  ctx.fillStyle = rgbStr(HIDE_C, 0.24 + 0.06 * lv); ctx.fill();
  ctx.strokeStyle = rgbStr(HIDE_EDGE, 0.55 + 0.1 * lv); ctx.lineWidth = lw(1.1); ctx.stroke();
}
function drawHide(ctx, lv, t, lw) {
  const sr = 0.15 + 0.012 * lv, dx = sr * 1.1, dy = sr * 1.5;
  const xF = G.st === 5 ? min(0.9, 0.0 + 0.3 * lv) : G.cx + G.ax * min(0.92, -0.12 + 0.34 * lv);
  const xR = G.st === 5 ? F_XR : G.cx - G.ax;
  const wmax = G.ay;
  ctx.beginPath();
  let r = 0;
  for (let x = xF; x > xR; x -= dx, r++) {
    const yc = ycAt(x);
    for (let y = -wmax + (r & 1) * dy * 0.5; y <= wmax; y += dy) {
      const yy = y + yc;
      if (insideBody(x, yy, sr * 0.5)) { ctx.moveTo(x, yy + sr); ctx.arc(x, yy, sr, PI / 2, PI * 1.5); }
    }
  }
  hideStyle(ctx, lv, lw);
}

function rimSpikes(ctx, n, len, t, c) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    rim(ringTh(i, n, 0));
    const x = RIM[0], y = RIM[1], nx = RIM[2], ny = RIM[3], tx = -ny, ty = nx, b = 0.085;
    const l = len * (0.85 + 0.15 * sin(t * 3 + i * 1.7));
    ctx.moveTo(x + tx * b - nx * 0.04, y + ty * b - ny * 0.04);
    ctx.lineTo(x + nx * l - 0.1 * l, y + ny * l);
    ctx.lineTo(x - tx * b - nx * 0.04, y - ty * b - ny * 0.04);
  }
  ctx.fillStyle = c; ctx.fill();
}
function rimCilia(ctx, n, t, len, lwpx, c) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const th = ringTh(i, n, 0);
    rim(th);
    const w = sin(th * 6 - t * 14) * 0.35, a = Math.atan2(RIM[3], RIM[2]) + w * 0.6;
    ctx.moveTo(RIM[0] - RIM[2] * 0.02, RIM[1] - RIM[3] * 0.02); ctx.lineTo(RIM[0] + cos(a) * len, RIM[1] + sin(a) * len);
  }
  ctx.strokeStyle = c; ctx.lineWidth = lwpx; ctx.lineCap = 'round'; ctx.stroke();
}

// p: { r, ang, seed, stage (1-5), muts:{id:lv}, flash, stretch, dent, dentA, cyst, wob, speedN, bodyCol?, memCol? }
// ctx is pre-translated to the player, rotated so heading is +x and scaled so 1 unit = player radius.
export function drawPlayer(ctx, p, T, s) {
  const t = T;
  const m = p.muts || NOMUT;
  const col = COLORS.player;
  const lw = (px) => px / s;
  const body = p.bodyCol || col.body;
  const mem = p.memCol || col.mem;
  ctx.lineJoin = 'round';
  const st = p.stretch || 0;
  const stage = clampStage(p.stage || 1);
  const A0 = ctx.globalAlpha;
  const ph = swimPhase(p, T);
  setupGeom(p, stage, st, t, ph);
  const squash = stage === 5 && st;
  if (squash) { ctx.save(); ctx.scale(1 + st * 0.45, 1 - st * 0.3); }

  // ---- far back: things the body sits on top of
  if (m.signal) drawSignal(ctx, m.signal, t, lw, A0);
  if (m.tentacles) drawTentacles(ctx, m.tentacles, t, lw);
  if (stage === 4) drawSegments(ctx, p, m, t, lw, body, mem, col.nuc, A0);
  else if (stage === 5) drawFishBack(ctx, m, t, lw, body, mem);
  if (stage !== 2) { // (the colony draws these over its satellite cells, below)
    if (m.fins) drawSideFins(ctx, m.fins, t, lw, body, mem);
    if (m.gills) drawGills(ctx, m.gills, t, lw, A0);
  }
  // flagellum(s)
  if (m.flagellum) {
    const L = 1.1 + 0.28 * m.flagellum;
    const fr = 9 + (p.speedN || 0) * 9, fp = ph * 1.5; // fp == T·fr for stateless callers
    if (stage <= 3) {
      // stage 3 pivots the whips at the rear of the long body instead of the centre
      const s3 = stage === 3;
      if (s3) { ctx.save(); ctx.translate(G.tx + 0.04, 0); }
      const sx0 = s3 ? 0 : -0.92 - st * 0.5, sx1 = s3 ? 0 : -0.92;
      flagellum(ctx, fp, L, lw(4.5), rgbStr(mem, 0.35), 0, 1, sx0);
      flagellum(ctx, fp, L, lw(2), rgbStr(mem, 0.95), 0, 1, sx0);
      if (m.flagellum >= 3) {
        ctx.save(); ctx.rotate(0.35); flagellum(ctx, fp + 0.4 * fr, L * 0.75, lw(1.6), rgbStr(mem, 0.8), 1.5, 1, sx1); ctx.restore();
        ctx.save(); ctx.rotate(-0.35); flagellum(ctx, fp + 0.8 * fr, L * 0.75, lw(1.6), rgbStr(mem, 0.8), 3, 1, sx1); ctx.restore();
      }
      if (s3) ctx.restore();
    } else {
      // a long whip streaming from the tail tip
      const ex = stage === 4 ? G.tx - cos(G.ta) * 0.3 : G.tx, ey = stage === 4 ? G.ty - sin(G.ta) * 0.3 : G.ty;
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(G.ta);
      flagellum(ctx, fp, L * 0.5, lw(3.5), rgbStr(mem, 0.3), 0, 1, 0);
      flagellum(ctx, fp, L * 0.5, lw(1.5), rgbStr(mem, 0.9), 0, 1, 0);
      ctx.restore();
    }
  }
  if (m.spikes) {
    const sc = rgbStr([230, 255, 250], 0.92);
    if (stage <= 3) spikeRing(ctx, (8 + m.spikes * 2) * (stage === 3 ? 1.25 : 1) | 0, 0.22 + 0.07 * m.spikes, 0.12, t, sc, t * 0.1, G.ax, G.ay);
    else rimSpikes(ctx, (stage === 4 ? 7 : 10) + m.spikes * 2, 0.2 + 0.065 * m.spikes, t, sc);
  }
  if (m.cilia) {
    if (stage <= 4) {
      if (G.cx) { ctx.save(); ctx.translate(G.cx, 0); }
      ciliaFringe(ctx, (24 + 6 * m.cilia) * (stage === 3 ? 1.25 : 1) | 0, t, 0.12 + 0.03 * m.cilia, lw(1.3), rgbStr(mem, 0.75), G.ax, G.ay, 14);
      if (G.cx) ctx.restore();
    } else rimCilia(ctx, 30 + 6 * m.cilia, t, 0.1 + 0.025 * m.cilia, lw(1.2), rgbStr(mem, 0.75));
  }
  if (m.polyps) drawPolyps(ctx, m.polyps, t, lw, mem);
  if (stage === 2) {
    drawColony(ctx, p, m, t, lw, body, mem, col.nuc);
    if (m.fins) drawSideFins(ctx, m.fins, t, lw, body, mem);
    if (m.gills) drawGills(ctx, m.gills, t, lw, A0);
  }

  // ---- main body
  const lobes = m.pseudopod ? 3 : 0, lobeAmp = m.pseudopod ? 0.07 + 0.05 * m.pseudopod : 0;
  let n;
  if (stage <= 2) {
    n = blobPath(ctx, { n: 30, t, seed: p.seed, amp: 0.045 + (p.wob || 0), stretch: st, lobes, lobeAmp, dentA: p.dentA, dent: p.dent });
    ctx.fillStyle = bodyGrad(ctx, body); ctx.fill();
  } else if (stage === 3) {
    ctx.save(); ctx.scale(S3X, S3Y);
    n = blobPath(ctx, { n: 34, t, seed: p.seed, amp: 0.04 + (p.wob || 0), stretch: st, lobes, lobeAmp: lobeAmp * 0.8, dentA: p.dentA, dent: p.dent, notch: 0.11 });
    ctx.fillStyle = bodyGrad(ctx, body); ctx.fill();
    ctx.restore();
    drawTissue(ctx, t, lw, body, mem, col.nuc, st);
  } else if (stage === 4) {
    ctx.save(); ctx.translate(HX, 0); ctx.scale(HRX, HRY);
    n = blobPath(ctx, { n: 28, t, seed: p.seed, amp: 0.045 + (p.wob || 0), stretch: st, lobes, lobeAmp, dentA: p.dentA, dent: p.dent });
    ctx.fillStyle = bodyGrad(ctx, body); ctx.fill();
    ctx.restore();
  } else {
    n = fishPath(ctx, p, t);
    ctx.save(); ctx.translate(0.12, 0); ctx.scale(1.12, 0.62); ctx.fillStyle = bodyGrad(ctx, body); ctx.fill(); ctx.restore();
  }
  const memW = 1.8 + (m.membrane || 0) * 0.8;
  ctx.strokeStyle = cstr(mem); ctx.lineWidth = lw(memW); ctx.stroke();
  if (m.membrane) { ctx.save(); ctx.scale(0.88, 0.88); ctx.strokeStyle = rgbStr(mem, 0.3); ctx.lineWidth = lw(1.2 + m.membrane * 0.4); ctx.stroke(); ctx.restore(); }
  if (stage === 3) {
    // mouth
    ctx.beginPath(); ctx.ellipse(G.ax - 0.17, 0, 0.09, 0.055, 0, 0, TAU);
    ctx.fillStyle = rgbStr(col.nuc, 0.45); ctx.fill();
  }

  // ---- inside
  if (stage === 5) drawFishOrgans(ctx, m, t, lw, mem);
  if (m.muscle) drawMuscle(ctx, m.muscle, t, lw);
  const OX = G.ox, KX = G.kx, KY = G.ky;
  // vacuole
  if (m.vacuole) {
    const vr = 0.2 + 0.035 * m.vacuole + 0.02 * sin(t * 1.5);
    ctx.beginPath(); ctx.arc(OX + 0.3 * KX, 0.28 * KY, vr * (stage >= 4 ? 0.8 : 1), 0, TAU);
    ctx.fillStyle = 'rgba(220,250,255,0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(230,255,255,0.55)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  // chloroplasts
  if (m.chloro) {
    const k = 3 + m.chloro * 2;
    for (let i = 0; i < k; i++) {
      const a = i * 2.399 + t * 0.25, d = 0.5 + 0.12 * sin(i * 1.7);
      ctx.save(); ctx.translate(OX + cos(a) * d * KX, sin(a) * d * KY); ctx.rotate(a + 1.2);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.13, 0.07, 0, 0, TAU);
      ctx.fillStyle = 'rgba(90,230,110,0.9)'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(-0.08, 0); ctx.lineTo(0.08, 0); ctx.strokeStyle = 'rgba(200,255,190,0.7)'; ctx.lineWidth = lw(0.8); ctx.stroke();
      ctx.restore();
    }
  }
  // mitochondria
  if (m.mito) {
    for (let i = 0; i < 1 + m.mito; i++) {
      const a = 1 + i * 2.1 - t * 0.2, d = 0.55;
      ctx.save(); ctx.translate(OX + cos(a) * d * KX, sin(a) * d * KY); ctx.rotate(a);
      ctx.beginPath(); ctx.ellipse(0, 0, 0.15, 0.075, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,150,90,0.9)'; ctx.fill();
      ctx.beginPath(); for (let j = -1; j <= 1; j++) { ctx.moveTo(j * 0.06, -0.05); ctx.lineTo(j * 0.06 + 0.02, 0.05); }
      ctx.strokeStyle = 'rgba(255,230,190,0.8)'; ctx.lineWidth = lw(0.8); ctx.stroke();
      ctx.restore();
    }
  }
  // toxin vesicles
  if (m.toxin || m.nova) {
    const k = 2 + (m.toxin || 0) + (m.nova || 0);
    dots(ctx, k, p.seed + 5, t, 0.3, 0.68, 0.075, 0.5, OX, KX, KY);
    ctx.fillStyle = 'rgba(200,120,255,0.95)'; ctx.fill();
  }
  if (m.lysosome) { dots(ctx, 2 + m.lysosome * 2, p.seed + 9, t, 0.25, 0.6, 0.05, -0.4, OX, KX, KY); ctx.fillStyle = 'rgba(255,110,120,0.9)'; ctx.fill(); }
  // generic organelles + nucleus (the tissue and the fish have their own)
  if (stage !== 5) { dots(ctx, 4, p.seed, t, 0.4, 0.66, 0.055, 0.25, OX, KX, KY); ctx.fillStyle = rgbStr(mem, 0.55); ctx.fill(); }
  if (stage <= 2) nucleus(ctx, col.nuc, -0.15, -0.05, 0.3, t, p.seed);
  else if (stage === 4) nucleus(ctx, col.nuc, OX - 0.15 * KX, -0.05 * KY, 0.25, t, p.seed);
  if (m.nerve) drawNerve(ctx, m.nerve, t, lw, A0);
  // bioluminescent spots (photophores along the flank at stage 5)
  if (m.biolum) {
    ctx.globalCompositeOperation = 'lighter';
    const g = glowSprite([150, 255, 230], 1);
    if (stage === 5) {
      const k = 3 + m.biolum;
      for (const sd of [-1, 1]) for (let i = 0; i < k; i++) {
        const x = 0.42 - (i / (k - 1)) * 1.2, pulse = 0.5 + 0.5 * sin(t * 3 + i * 1.3 + sd);
        const sz = 0.13 + 0.06 * pulse;
        ctx.globalAlpha = A0 * (0.5 + 0.4 * pulse);
        ctx.drawImage(g, x - sz, fishYC(x) + sd * fishW(x) * 0.6 - sz, sz * 2, sz * 2);
      }
    } else {
      for (let i = 0; i < 3 + m.biolum; i++) {
        const a = i * 1.9 + p.seed, d = 0.72;
        const pulse = 0.5 + 0.5 * sin(t * 3 + i * 1.3);
        const sz = 0.22 + 0.1 * pulse;
        ctx.globalAlpha = A0 * (0.5 + 0.4 * pulse);
        ctx.drawImage(g, OX + cos(a) * d * KX - sz, sin(a) * d * KY - sz, sz * 2, sz * 2);
      }
    }
    ctx.globalAlpha = A0;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- surface
  if (m.hide) drawHide(ctx, m.hide, t, lw);
  if (m.shell) drawShell(ctx, m.shell, t, lw);
  if (m.guard) drawGuard(ctx, m.guard, t, lw, A0);
  if (m.cnido) drawCnido(ctx, m.cnido, t, lw);
  if (m.fins) drawDorsalFin(ctx, m.fins, t, lw, body, mem);
  if (stage === 5 || m.eyes) drawEyes(ctx, m.eyes || 0, t, lw, A0);
  if (m.jaws) drawJaws(ctx, m.jaws, t, lw);
  if (stage === 1) highlight(ctx, p.ang || 0);
  else { ctx.save(); ctx.translate(G.hlx, 0); ctx.scale(G.hls, G.hls); highlight(ctx, p.ang || 0); ctx.restore(); }
  // cyst shell
  if (p.cyst > 0) {
    let cx = 0, rx = 1.18, ry = 1.18;
    if (stage === 2) { rx = ry = 1.78; }
    else if (stage === 3) { rx = S3X * 1.15; ry = S3Y * 1.32; }
    else if (stage === 4) { cx = -0.45; rx = 1.6; ry = 1.0; }
    else if (stage === 5) { cx = 0.02; rx = 1.3; ry = 0.86; }
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * TAU + t; i ? ctx.lineTo(cx + cos(a) * rx, sin(a) * ry) : ctx.moveTo(cx + cos(a) * rx, sin(a) * ry); }
    ctx.fillStyle = 'rgba(255,220,150,0.25)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,170,0.95)'; ctx.lineWidth = lw(3); ctx.stroke();
  }
  if (squash) ctx.restore();
  return n;
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
  const col = (art && art.col) || COLORS[kind] || COLORS.grazer;
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
const STAGE_FRAME = [null, [0.27, 0, -0.4], [0.235, 0.3, -0.4], [0.25, 0, -0.42], [0.205, 0.72, -0.5], [0.255, 0.32, -0.42]];
// the evolution stage each campaign mutation belongs to (its portrait shows that body)
const MUT_STAGE = { guard: 2, polyps: 2, signal: 2, muscle: 3, jaws: 3, nerve: 3, cnido: 3, fins: 4, eyes: 4, shell: 4, tentacles: 5, hide: 5, gills: 5 };
// per-trait framing tweaks (zoom toward the feature)
const MUT_FRAME = { jaws: [0.27, -0.35, -0.3], eyes: [0.25, 0.25, -0.45], polyps: [0.215, 0.3, -0.4], signal: [0.2, 0.3, -0.4], tentacles: [0.235, 0.45, -0.5] };
const MUT_GLOW = {
  toxin: [190, 110, 255], nova: [200, 120, 255], chloro: [120, 255, 140], mito: [255, 160, 90], spikes: [220, 255, 250], lysosome: [255, 110, 130], biolum: [130, 255, 230], cyst: [255, 220, 150], mimicry: [140, 200, 255],
  guard: [190, 240, 255], polyps: [255, 170, 210], signal: [180, 160, 255], muscle: [255, 120, 130], jaws: [255, 220, 160], nerve: [140, 200, 255], cnido: [230, 160, 255],
  fins: [140, 230, 255], eyes: [150, 255, 235], shell: [255, 210, 140], tentacles: [230, 180, 255], hide: [140, 190, 230], gills: [255, 140, 190],
};

const MUT_T = { jaws: 1.0 }; // portrait time per trait (jaws at rest: mandibles apart)
function framedBody(g, size, stage, muts, frame, glowC, T = FAKE_T) {
  g.translate(size / 2, size / 2);
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
  g.drawImage(glowSprite(glowC), -size * 0.5, -size * 0.5, size, size);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  const [rf, ox, rot] = frame;
  const R = size * rf;
  g.rotate(rot); g.scale(R, R); g.translate(ox, 0);
  drawPlayer(g, { r: 1, ang: rot, seed: 0.5, muts, stage, speedN: 0.35 }, T, R * 2);
}

// a stage's body, no mutations: centred, glowing, transparent background
export function stagePortrait(stage, size = 96) {
  const st = clampStage(stage);
  const [c, g] = portraitCanvas(size);
  framedBody(g, size, st, {}, STAGE_FRAME[st], COLORS.player.glow);
  return c;
}

// draws a "mini player" with a single mutation emphasised
export function mutationPortrait(id, size) {
  if (MUT_STAGE[id]) {
    const [c, g] = portraitCanvas(size);
    const stage = MUT_STAGE[id];
    framedBody(g, size, stage, { [id]: 3 }, MUT_FRAME[id] || STAGE_FRAME[stage], MUT_GLOW[id], MUT_T[id]);
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

// kind: 'microbe' (species + boss ids) | 'mutation' | 'genome' | 'stage' (id = 1..5)
export function portrait(kind, id, size = 96) {
  try {
    if (kind === 'microbe') return microbePortrait(id, size);
    if (kind === 'mutation') return mutationPortrait(id, size);
    if (kind === 'genome') return genomePortrait(id, size);
    if (kind === 'stage') return stagePortrait(id, size);
  } catch (e) { console.warn('portrait failed', kind, id, e); }
  const [c] = portraitCanvas(size);
  return c;
}
