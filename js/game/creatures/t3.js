// Creature art for the T3 tier (first animals, 1–10 mm): glassy plankton — crustaceans, comb jellies, worms.
// Each entry: { name, col, portraitR, portraitRot, states, draw(ctx, e, t, s, H, opts) } (+ boss, drawTube).
// Unit space: 1 = collision radius, facing +x. See js/game/creatures/README.md for the conventions.

const TAU = Math.PI * 2;
const { sin, cos, min, max, abs, sqrt, floor, pow, atan2, hypot, PI } = Math;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const fract = (v) => v - floor(v);
const hash = (n) => fract(sin(n * 127.1 + 311.7) * 43758.5453);
const SIDES = [-1, 1];

// ---------- shared helpers ----------
// gradients we need beyond H's (cached per context, built once)
const GC = new WeakMap();
function cachedGrad(ctx, key, make) {
  let m = GC.get(ctx);
  if (!m) { m = new Map(); GC.set(ctx, m); }
  let g = m.get(key);
  if (!g) { g = make(ctx); m.set(key, g); }
  return g;
}
// additive soft glow (respects the caller's globalAlpha)
function glow(ctx, H, c, x, y, r, a, hard = 0) {
  if (a <= 0.004) return;
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * min(1, a);
  ctx.drawImage(H.glowSprite(c, hard), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
// fill the current path with a unit-space gradient mapped onto an ellipse (cx, cy, sx, sy, rot)
function fillIn(ctx, style, cx, cy, sx, sy, rot = 0) {
  ctx.save(); ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.scale(sx, sy);
  ctx.fillStyle = style; ctx.fill(); ctx.restore();
}
// H.highlight (world-fixed specular glint) re-centred on a body that is not the unit circle
function hl(ctx, H, e, x, y, k) { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); H.highlight(ctx, e.ang || 0); ctx.restore(); }
// add a closed ellipse as its own sub-path (no stray joining line)
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.moveTo(x + cos(rot) * rx, y + sin(rot) * rx); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
// closed smooth path through BX/BY[0..n) (quadratic through midpoints)
const BX = new Float32Array(256), BY = new Float32Array(256);
function smoothPath(ctx, n) {
  ctx.beginPath();
  ctx.moveTo((BX[n - 1] + BX[0]) / 2, (BY[n - 1] + BY[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[j]) / 2, (BY[i] + BY[j]) / 2); }
  ctx.closePath();
}
// open polyline through PX/PY[0..n)
function polyline(ctx, xs, ys, n, i0 = 0) { ctx.moveTo(xs[i0], ys[i0]); for (let i = i0 + 1; i < n; i++) ctx.lineTo(xs[i], ys[i]); }

// ---------- ctenophore comb plates: travelling rainbow iridescence ----------
// Ctene buffers: centre, half-vector across the row, bucket (0..NH-1 = rainbow hue, PLAIN = unlit, BACK = far side, TORN)
const NH = 10, PLAIN = 250, BACK = 251, TORN = 252;
const RAINBOW = Array.from({ length: NH }, (_, i) => `hsl(${((i / NH) * 360) | 0},100%,64%)`);
const CX = new Float32Array(512), CY = new Float32Array(512), CU = new Float32Array(512), CV = new Float32Array(512), CB = new Uint8Array(512);
function strokeCtenes(ctx, n, bucket, style, width) {
  ctx.beginPath();
  let any = false;
  for (let i = 0; i < n; i++) {
    if (CB[i] !== bucket) continue;
    any = true; ctx.moveTo(CX[i] - CU[i], CY[i] - CV[i]); ctx.lineTo(CX[i] + CU[i], CY[i] + CV[i]);
  }
  if (!any) return;
  ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke();
}
function rainbowCtenes(ctx, n, width, alpha, bloom = 0) {
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  if (bloom > 0) { ctx.globalAlpha = ga * alpha * 0.28; for (let b = 0; b < NH; b++) strokeCtenes(ctx, n, b, RAINBOW[b], width * bloom); }
  ctx.globalAlpha = ga * alpha;
  for (let b = 0; b < NH; b++) strokeCtenes(ctx, n, b, RAINBOW[b], width);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
// classify one ctene: hue bucket from a wave travelling along the row, lit by the metachronal beat
function cteneBucket(i, k, t, speed, litBias) {
  const lit = 0.5 + 0.5 * sin(i * 0.8 - t * 7 * speed + k * 1.1);
  if (lit < 0.3 - litBias) return PLAIN;
  return floor(fract(i * 0.075 + k * 0.125 - t * 0.65 * speed) * NH) % NH;
}

// =====================================================================================================
// Copepod — teardrop prosome, slim urosome with caudal setae, one red naupliar eye, very long antennules
// =====================================================================================================
const AX = new Float32Array(20), AY = new Float32Array(20);
function antennule(sg, t, jk, n) {
  const a0 = lerp(1.42, 2.72, jk), bend = lerp(0.62, 0.34, jk), L = lerp(1.0, 1.3, jk);
  const sway = (1 - jk) * 0.06 * sin(t * 1.25 + sg * 0.8);
  let x = 0.8, y = sg * 0.15;
  AX[0] = x; AY[0] = y;
  const dl = L / (n - 1);
  for (let i = 1; i < n; i++) {
    const u = i / (n - 1), a = a0 + bend * u * u + sway * u;
    x += cos(a) * dl; y += sg * sin(a) * dl;
    AX[i] = x; AY[i] = y;
  }
}
const prosomeW = (x) => { const d = x > 0.42 ? (x - 0.42) / 0.55 : (0.42 - x) / 0.85; return 0.36 * sqrt(max(0, 1 - d * d)); };
function prosomePath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.34, -0.14);
  ctx.bezierCurveTo(-0.24, -0.3, 0.1, -0.365, 0.42, -0.365);
  ctx.bezierCurveTo(0.76, -0.365, 0.97, -0.21, 0.97, 0);
  ctx.bezierCurveTo(0.97, 0.21, 0.76, 0.365, 0.42, 0.365);
  ctx.bezierCurveTo(0.1, 0.365, -0.24, 0.3, -0.34, 0.14);
  ctx.quadraticCurveTo(-0.39, 0, -0.34, -0.14);
  ctx.closePath();
}
// egg positions inside a sac (sac-local: ellipse centred at (-0.27, 0), rx 0.27, ry 0.13)
const EGG_P = [];
for (let row = -1; row <= 1; row++) for (let i = 0; i < 8; i++) {
  const x = -0.5 + i * 0.074 + (row & 1) * 0.037, y = row * 0.064;
  if (((x + 0.25) / 0.235) ** 2 + (y / 0.1) ** 2 < 1) EGG_P.push(x, y);
}
const EGG_C = [120, 200, 220], EGG_D = [70, 140, 185];

const copepod = {
  name: 'Copepod',
  col: { body: [255, 170, 135], mem: [255, 230, 210], nuc: [240, 100, 55], glow: [255, 165, 125] },
  portraitR: 0.26,
  portraitRot: -0.45,
  states: [
    { label: 'idle' },
    { label: 'jumpK 0.5', jumpK: 0.5 },
    { label: 'escape jump (jumpK 1)', jumpK: 1 },
    { label: 'eggs', eggs: 1 },
  ],
  draw(ctx, e, t, s, H) {
    const c = H.col, lw = H.lw, lod = H.lod, hd = H.hd;
    const jk = smooth(e.jumpK || 0), eg = smooth(e.eggs || 0);
    const st = (e.stretch || 0) + 0.05 * jk;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (st) ctx.scale(1 + st, 1 - st * 0.5);
    if (lod) {
      ctx.beginPath(); ctx.ellipse(0.3, 0, 0.66, 0.36, 0, 0, TAU); ctx.rect(-0.88, -0.09, 0.62, 0.18);
      ctx.fillStyle = H.rgbStr(c.body, 0.9); ctx.fill();
      ctx.beginPath();
      for (const sg of SIDES) { antennule(sg, t, jk, 4); polyline(ctx, AX, AY, 4); }
      ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lw(1.2); ctx.stroke();
      ctx.restore();
      return;
    }
    const memA = (a) => H.rgbStr(c.mem, a);
    // --- tail: urosome, caudal rami + setae, egg sacs (bends at the prosome joint)
    const bend = 0.07 * sin(t * 1.7) + jk * 0.1 * sin(t * 13);
    ctx.save(); ctx.translate(-0.3, 0); ctx.rotate(bend); ctx.translate(0.3, 0);
    ctx.beginPath();
    for (const sg of SIDES) {
      const sw = 0.05 * sin(t * 2.3 + sg) + jk * 0.08;
      ctx.moveTo(-0.92, sg * 0.05); ctx.quadraticCurveTo(-1.2, sg * (0.1 + sw * 0.5), -1.5, sg * (0.3 + sw));
      ctx.moveTo(-0.92, sg * 0.03); ctx.quadraticCurveTo(-1.14, sg * 0.05, -1.34, sg * (0.13 + sw * 0.5));
      ctx.moveTo(-0.9, sg * 0.065); ctx.lineTo(-1.04, sg * 0.17);
    }
    ctx.strokeStyle = memA(0.75); ctx.lineWidth = lw(hd ? 1.4 : 1.1); ctx.stroke();
    if (hd) {
      // plumose setae: fine side hairs
      ctx.beginPath();
      for (const sg of SIDES) {
        const sw = 0.05 * sin(t * 2.3 + sg) + jk * 0.08;
        for (let i = 2; i < 10; i++) {
          const u = i / 10, iu = 1 - u;
          const x = iu * iu * -0.92 + 2 * iu * u * -1.2 + u * u * -1.5, y = sg * (iu * iu * 0.05 + 2 * iu * u * (0.1 + sw * 0.5) + u * u * (0.3 + sw));
          ctx.moveTo(x, y); ctx.lineTo(x - 0.035, y - sg * 0.035); ctx.moveTo(x, y); ctx.lineTo(x - 0.01, y + sg * 0.045);
        }
      }
      ctx.strokeStyle = memA(0.35); ctx.lineWidth = lw(0.8); ctx.stroke();
    }
    ctx.beginPath();
    ctx.roundRect(-0.48, -0.135, 0.21, 0.27, 0.09); ctx.roundRect(-0.61, -0.11, 0.16, 0.22, 0.06);
    ctx.roundRect(-0.72, -0.1, 0.14, 0.2, 0.05); ctx.roundRect(-0.83, -0.09, 0.14, 0.18, 0.05);
    ctx.roundRect(-0.94, -0.075, 0.15, 0.05, 0.02); ctx.roundRect(-0.94, 0.025, 0.15, 0.05, 0.02);
    fillIn(ctx, H.bodyGrad(ctx, c.body, 1.2), -0.6, 0, 0.36, 0.14);
    ctx.strokeStyle = memA(0.9); ctx.lineWidth = lw(1.2); ctx.stroke();
    // hind gut through the urosome
    ctx.beginPath(); ctx.moveTo(-0.3, 0); ctx.lineTo(-0.8, 0);
    ctx.strokeStyle = H.rgbStr([150, 140, 60], 0.35); ctx.lineWidth = 0.035; ctx.stroke();
    if (eg > 0.01) {
      for (const sg of SIDES) {
        ctx.save(); ctx.translate(-0.37, sg * 0.1); ctx.rotate(-sg * 0.24); ctx.scale(eg, eg);
        ctx.beginPath(); ctx.ellipse(-0.25, 0, 0.26, 0.125, 0, 0, TAU);
        ctx.fillStyle = H.rgbStr(EGG_C, 0.18); ctx.fill();
        ctx.strokeStyle = H.rgbStr(EGG_C, 0.55); ctx.lineWidth = lw(1); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < EGG_P.length; i += 2) { const x = EGG_P[i], y = EGG_P[i + 1]; ctx.moveTo(x + 0.038, y); ctx.arc(x, y, 0.038, 0, TAU); }
        ctx.fillStyle = H.rgbStr(EGG_D, 0.85); ctx.fill();
        ctx.strokeStyle = H.rgbStr([200, 240, 255], 0.75); ctx.lineWidth = lw(hd ? 1 : 0.8); ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < EGG_P.length; i += 2) { const x = EGG_P[i] - 0.012, y = EGG_P[i + 1] - 0.013; ctx.moveTo(x + 0.012, y); ctx.arc(x, y, 0.012, 0, TAU); }
        ctx.fillStyle = 'rgba(240,252,255,0.6)'; ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
    // --- swimming legs + second antennae / mouthparts (under the prosome; their tips poke out)
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const bx = 0.34 - i * 0.13, L = 0.42 - i * 0.03, k = smooth(jk * 1.5 - i * 0.15);
      for (const sg of SIDES) {
        const a = lerp(1.3 + 0.13 * sin(t * 2.8 - i * 0.9), 2.35, k);
        const tx = bx + cos(a) * L, ty = sg * (0.08 + sin(a) * L);
        ctx.moveTo(bx + cos(a) * L * 0.45, sg * (0.08 + sin(a) * L * 0.45)); ctx.lineTo(tx, ty);
        for (let f = -1; f <= 1; f++) { const fa = a + f * 0.38 + 0.2; ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(fa) * 0.1, ty + sg * sin(fa) * 0.1); }
      }
    }
    for (const sg of SIDES) {
      const a = lerp(0.95 + 0.3 * sin(t * 11 + sg), 2.2, jk), bx = 0.66, by = sg * 0.16;
      ctx.moveTo(bx, by); ctx.lineTo(bx + cos(a) * 0.38, by + sg * sin(a) * 0.38);
      ctx.moveTo(bx - 0.05, by); ctx.lineTo(bx - 0.05 + cos(a + 0.45) * 0.3, by + sg * sin(a + 0.45) * 0.3);
      if (hd) for (let f = 0; f < 3; f++) { const tx = bx + cos(a) * 0.38, ty = by + sg * sin(a) * 0.38, fa = a - 0.4 + f * 0.4; ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(fa) * 0.09, ty + sg * sin(fa) * 0.09); }
    }
    ctx.strokeStyle = memA(0.62); ctx.lineWidth = lw(hd ? 1.4 : 1.2); ctx.stroke();
    // --- antennules: long, held out like wings, with fine setae (under the head)
    const NA = hd ? 18 : 12;
    ctx.beginPath();
    for (const sg of SIDES) { antennule(sg, t, jk, NA); polyline(ctx, AX, AY, NA); }
    ctx.strokeStyle = memA(0.92); ctx.lineWidth = lw(hd ? 2 : 1.6); ctx.stroke();
    ctx.beginPath();
    const hairs = hd ? 1 : 2;
    for (const sg of SIDES) {
      antennule(sg, t, jk, NA);
      polyline(ctx, AX, AY, (NA * 0.45) | 0);
    }
    ctx.lineWidth = lw(hd ? 3.4 : 2.6); ctx.stroke();
    ctx.beginPath();
    for (const sg of SIDES) {
      antennule(sg, t, jk, NA);
      for (let i = 2; i < NA - 1; i += hairs) {
        let tx = AX[i + 1] - AX[i - 1], ty = AY[i + 1] - AY[i - 1];
        const tl = hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = sg > 0 ? -ty : ty, ny = sg > 0 ? tx : -tx;
        const L = 0.05 + 0.04 * hash(i * 3.1 + sg);
        ctx.moveTo(AX[i], AY[i]); ctx.lineTo(AX[i] + (nx + tx * 0.6) * L, AY[i] + (ny + ty * 0.6) * L);
        if (hd && i % 3 === 0) { ctx.moveTo(AX[i], AY[i]); ctx.lineTo(AX[i] - (nx - tx) * 0.035, AY[i] - (ny - ty) * 0.035); }
      }
      // long aesthetasc setae at the tip
      const n1 = NA - 1;
      let tx = AX[n1] - AX[n1 - 1], ty = AY[n1] - AY[n1 - 1];
      const ta = atan2(ty, tx);
      for (let f = -1; f <= 1; f++) { const a = ta + f * 0.32 * sg - 0.15 * sg; ctx.moveTo(AX[n1], AY[n1]); ctx.lineTo(AX[n1] + cos(a) * (0.2 - abs(f) * 0.05), AY[n1] + sin(a) * (0.2 - abs(f) * 0.05)); }
    }
    ctx.strokeStyle = memA(0.55); ctx.lineWidth = lw(hd ? 1 : 0.9); ctx.stroke();
    if (hd) {
      // antennule segment joints
      ctx.beginPath();
      for (const sg of SIDES) {
        antennule(sg, t, jk, NA);
        for (let i = 1; i < NA - 1; i++) {
          let tx = AX[i + 1] - AX[i - 1], ty = AY[i + 1] - AY[i - 1];
          const tl = hypot(tx, ty) || 1, w = 0.02 * (1 - i / NA * 0.6);
          ctx.moveTo(AX[i] - ty / tl * w, AY[i] + tx / tl * w); ctx.lineTo(AX[i] + ty / tl * w, AY[i] - tx / tl * w);
        }
      }
      ctx.strokeStyle = H.rgbStr(c.body, 0.8); ctx.lineWidth = lw(1); ctx.stroke();
    }
    // --- prosome (cephalosome + thoracic segments)
    prosomePath(ctx);
    fillIn(ctx, H.bodyGrad(ctx, c.body), 0.31, 0, 0.68, 0.4);
    ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lw(hd ? 1.8 : 1.5); ctx.stroke();
    // gut (green with eaten diatoms)
    ctx.beginPath(); ctx.ellipse(0.13, 0, 0.47, 0.055, 0, 0, TAU);
    ctx.fillStyle = H.rgbStr([150, 150, 60], 0.38); ctx.fill();
    // segment boundaries
    ctx.beginPath();
    for (const x of [0.13, -0.02, -0.15, -0.25]) { const w = prosomeW(x) * 0.96; ctx.moveTo(x, -w); ctx.quadraticCurveTo(x + 0.07, 0, x, w); }
    ctx.strokeStyle = memA(0.5); ctx.lineWidth = lw(hd ? 1.2 : 1); ctx.stroke();
    if (hd) {
      // longitudinal muscle bands + speckled pigment
      ctx.beginPath();
      for (const sg of SIDES) { ctx.moveTo(0.62, sg * 0.14); ctx.quadraticCurveTo(0.2, sg * 0.24, -0.28, sg * 0.1); }
      ctx.strokeStyle = memA(0.2); ctx.lineWidth = lw(2.2); ctx.stroke();
      H.dots(ctx, 10, 0.37, 0, 0.15, 0.32, 0.018, 0, 0.32, 1.5, 1); ctx.fillStyle = H.rgbStr(c.nuc, 0.45); ctx.fill();
    }
    // red-orange oil sac
    ctx.beginPath(); ctx.ellipse(0.04, 0, 0.21, 0.1, 0, 0, TAU);
    fillIn(ctx, H.nucGrad(ctx, c.nuc), 0.04, 0, 0.21, 0.1);
    if (hd) { ctx.beginPath(); ctx.ellipse(0.27, 0.01, 0.07, 0.045, 0, 0, TAU); fillIn(ctx, H.nucGrad(ctx, c.nuc), 0.27, 0.01, 0.07, 0.045); }
    // the single red naupliar eye
    glow(ctx, H, [255, 50, 40], 0.83, 0, 0.22, 0.55);
    ctx.beginPath(); ctx.arc(0.83, 0, 0.062, 0, TAU); ctx.fillStyle = '#e3202a'; ctx.fill();
    ctx.beginPath(); ctx.arc(0.845, 0, 0.03, 0, TAU); ctx.fillStyle = '#5a0010'; ctx.fill();
    ctx.beginPath(); ctx.arc(0.815, -0.022, 0.017, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    hl(ctx, H, e, 0.34, 0, 0.62);
    ctx.restore();
  },
};

// =====================================================================================================
// Arrow worm (chaetognath) — glassy torpedo, two pairs of lateral fins, spade tail fin, grasping spines
// =====================================================================================================
const AWX = [-1.0, -0.96, -0.85, -0.6, -0.3, 0.1, 0.5, 0.72, 0.79, 0.87, 0.95, 1.01, 1.05];
const AWW = [0.0, 0.04, 0.068, 0.098, 0.124, 0.134, 0.122, 0.104, 0.104, 0.138, 0.146, 0.114, 0.0];
const AWS = []; // outline sample x positions (table points + 2 in between)
for (let i = 0; i < AWX.length - 1; i++) for (let k = 0; k < 3; k++) AWS.push(lerp(AWX[i], AWX[i + 1], k / 3));
AWS.push(AWX[AWX.length - 1]);
const AWS_LO = AWS.filter((_, i) => i % 2 === 0 || i === AWS.length - 1);
let AW_AMP = 0, AW_PH = 0;
const awY = (x) => AW_AMP * sin(2.3 * x - AW_PH) * (0.3 + 0.35 * (1 - x));
function awW(x) {
  if (x <= AWX[0] || x >= AWX[AWX.length - 1]) return 0;
  let i = 0; while (x > AWX[i + 1]) i++;
  const k = (x - AWX[i]) / (AWX[i + 1] - AWX[i]);
  return AWW[i] + (AWW[i + 1] - AWW[i]) * k * k * (3 - 2 * k);
}
function arrowOutline(ctx, xs) {
  let n = 0;
  for (let i = 0; i < xs.length; i++) { const x = xs[i]; BX[n] = x; BY[n++] = awY(x) - awW(x); }
  for (let i = xs.length - 2; i > 0; i--) { const x = xs[i]; BX[n] = x; BY[n++] = awY(x) + awW(x); }
  smoothPath(ctx, n);
}
const AW_FINS = [[0.04, -0.36, 0.11], [-0.46, -0.8, 0.14]];
function rodGrad(ctx, c) {
  return cachedGrad(ctx, 'rod' + c.join(','), (g0) => {
    const g = g0.createLinearGradient(0, -1, 0, 1);
    const d = [c[0] * 0.75, c[1] * 0.75, c[2] * 0.8], l = [min(255, c[0] + 60), min(255, c[1] + 50), min(255, c[2] + 40)];
    const rs = (q, a) => `rgba(${q[0] | 0},${q[1] | 0},${q[2] | 0},${a})`;
    g.addColorStop(0, rs(c, 0.85)); g.addColorStop(0.16, rs(c, 0.4)); g.addColorStop(0.36, rs(l, 0.2));
    g.addColorStop(0.6, rs(c, 0.14)); g.addColorStop(0.84, rs(c, 0.32)); g.addColorStop(1, rs(d, 0.85));
    return g;
  });
}

const arrowworm = {
  name: 'Arrow worm',
  col: { body: [175, 220, 255], mem: [230, 248, 255], nuc: [255, 205, 120], glow: [150, 215, 255] },
  portraitR: 0.33,
  portraitRot: -0.5,
  states: [
    { label: 'idle' },
    { label: 'tele 1 (tensing)', tele: 1 },
    { label: 'lunge 1', lunge: 1 },
  ],
  draw(ctx, e, t, s, H) {
    const c = H.col, lw = H.lw, lod = H.lod, hd = H.hd;
    const tele = smooth(e.tele || 0), lunge = smooth(e.lunge || 0), tense = max(tele, lunge);
    AW_AMP = 0.075 * (1 - tense) + 0.01 * tele * (1 - lunge) * sin(t * 37);
    AW_PH = t * 1.25;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.scale(1 + (e.stretch || 0) + 0.08 * lunge - 0.05 * tele * (1 - lunge), 1 - 0.08 * lunge);
    if (lod) {
      arrowOutline(ctx, AWX);
      ctx.moveTo(-0.8, 0); ctx.lineTo(-1.2, -0.12); ctx.lineTo(-1.2, 0.12); ctx.closePath();
      ctx.fillStyle = H.rgbStr(c.body, 0.8); ctx.fill();
      ctx.restore();
      return;
    }
    const memA = (a) => H.rgbStr(c.mem, a);
    // lunge: speed streaks behind
    if (lunge > 0.01) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) { const y = (i < 2 ? -1 : 1) * (0.26 + (i % 2) * 0.12), x0 = 0.35 - (i % 2) * 0.3; ctx.moveTo(x0, y); ctx.lineTo(x0 - 0.75 - 0.2 * hash(i), y); }
      ctx.strokeStyle = memA(0.35 * lunge); ctx.lineWidth = lw(1.4); ctx.stroke();
    }
    // tele: faint glow around the head
    glow(ctx, H, c.glow, 0.95, 0, 0.75, 0.45 * tele + 0.25 * lunge);
    // --- fins (under the body): two pairs of lateral fins + spade tail fin
    const ta = atan2(awY(-0.78) - awY(-0.84), 0.06);
    ctx.beginPath();
    for (const [x0, x1, fw] of AW_FINS) for (const sg of SIDES) {
      for (let k = 0; k <= 10; k++) {
        const u = k / 10, x = lerp(x0, x1, u), f = fw * pow(sin(PI * pow(u, 1.35)), 0.75);
        const y = awY(x) + sg * (awW(x) + f);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let k = 10; k >= 0; k--) { const x = lerp(x0, x1, k / 10); ctx.lineTo(x, awY(x) + sg * awW(x) * 0.7); }
      ctx.closePath();
    }
    ctx.save(); ctx.translate(-0.8, awY(-0.8)); ctx.rotate(ta);
    ctx.moveTo(-0.03, -0.045); ctx.bezierCurveTo(-0.1, -0.08, -0.2, -0.19, -0.33, -0.135);
    ctx.quadraticCurveTo(-0.43, -0.07, -0.445, 0); ctx.quadraticCurveTo(-0.43, 0.07, -0.33, 0.135);
    ctx.bezierCurveTo(-0.2, 0.19, -0.1, 0.08, -0.03, 0.045); ctx.quadraticCurveTo(-0.05, 0, -0.03, -0.045); ctx.closePath();
    ctx.restore();
    ctx.fillStyle = H.rgbStr(c.body, 0.22); ctx.fill();
    ctx.beginPath();
    for (const [x0, x1, fw] of AW_FINS) for (const sg of SIDES) {
      for (let k = 0; k <= 10; k++) {
        const u = k / 10, x = lerp(x0, x1, u), f = fw * pow(sin(PI * pow(u, 1.35)), 0.75);
        const y = awY(x) + sg * (awW(x) + f);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
    }
    ctx.save(); ctx.translate(-0.8, awY(-0.8)); ctx.rotate(ta);
    ctx.moveTo(-0.02, -0.06); ctx.bezierCurveTo(-0.1, -0.08, -0.2, -0.19, -0.33, -0.135);
    ctx.quadraticCurveTo(-0.43, -0.07, -0.445, 0); ctx.quadraticCurveTo(-0.43, 0.07, -0.33, 0.135);
    ctx.bezierCurveTo(-0.2, 0.19, -0.1, 0.08, -0.02, 0.06);
    ctx.restore();
    ctx.strokeStyle = memA(0.6); ctx.lineWidth = lw(1); ctx.stroke();
    // fin rays
    ctx.beginPath();
    const rays = hd ? 9 : 5;
    for (const [x0, x1, fw] of AW_FINS) for (const sg of SIDES) for (let k = 1; k < rays; k++) {
      const u = k / rays, x = lerp(x0, x1, u), f = fw * pow(sin(PI * pow(u, 1.35)), 0.75) * 0.92, y = awY(x);
      ctx.moveTo(x, y + sg * awW(x)); ctx.lineTo(x - f * 0.35, y + sg * (awW(x) + f));
    }
    ctx.save(); ctx.translate(-0.8, awY(-0.8)); ctx.rotate(ta);
    for (let k = 0; k <= rays; k++) { const a = PI + (k / rays - 0.5) * 2.1; ctx.moveTo(-0.06, 0); ctx.lineTo(-0.06 + cos(a) * 0.34, sin(a) * 0.15); }
    ctx.restore();
    ctx.strokeStyle = memA(0.22); ctx.lineWidth = lw(0.8); ctx.stroke();
    // --- body
    arrowOutline(ctx, hd ? AWS : AWS_LO);
    fillIn(ctx, rodGrad(ctx, c.body), 0, 0, 1, 0.14);
    ctx.strokeStyle = memA(0.85); ctx.lineWidth = lw(hd ? 1.5 : 1.3); ctx.stroke();
    // seminal vesicles (knobs in front of the tail fin)
    ctx.beginPath();
    for (const sg of SIDES) { const x = -0.83, y = awY(x) + sg * (awW(x) + 0.008); ctx.moveTo(x + 0.025, y); ctx.arc(x, y, 0.025, 0, TAU); }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill();
    // gut (head to anus at the trunk–tail septum) + septa
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) { const x = lerp(0.84, -0.5, i / 14); i ? ctx.lineTo(x, awY(x)) : ctx.moveTo(x, awY(x)); }
    ctx.strokeStyle = H.rgbStr(mixWarm(c.nuc), 0.4); ctx.lineWidth = 0.042; ctx.stroke();
    ctx.beginPath();
    for (const x of [-0.5, 0.77]) { const y = awY(x), w = awW(x) * 0.95; ctx.moveTo(x, y - w); ctx.quadraticCurveTo(x + 0.02, y, x, y + w); }
    ctx.strokeStyle = memA(0.4); ctx.lineWidth = lw(1); ctx.stroke();
    // ovaries with eggs (rear of the trunk)
    ctx.beginPath();
    for (const sg of SIDES) for (let i = 0; i <= 8; i++) { const x = lerp(-0.08, -0.47, i / 8), y = awY(x) + sg * 0.066; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.35); ctx.lineWidth = 0.036; ctx.stroke();
    if (hd) {
      ctx.beginPath();
      for (const sg of SIDES) for (let i = 0; i < 9; i++) { const x = lerp(-0.1, -0.45, i / 8), y = awY(x) + sg * (0.064 + 0.012 * sin(i * 2.1)); ctx.moveTo(x + 0.016, y); ctx.arc(x, y, 0.016, 0, TAU); }
      ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill();
      // ventral ganglion, corona ciliata
      ctx.beginPath(); ctx.ellipse(0.3, awY(0.3), 0.06, 0.035, 0, 0, TAU);
      ctx.fillStyle = memA(0.18); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.8, awY(0.8), 0.05, 0.03, 0, 0, TAU);
      ctx.strokeStyle = memA(0.4); ctx.lineWidth = lw(0.9); ctx.stroke();
      // tactile hair fans along the sides
      ctx.beginPath();
      for (const x of [-0.72, -0.42, -0.16, 0.1, 0.36, 0.6]) for (const sg of SIDES) {
        const y = awY(x) + sg * awW(x);
        for (let f = -1; f <= 1; f++) { ctx.moveTo(x, y); ctx.lineTo(x + f * 0.025 - 0.01, y + sg * 0.055); }
      }
      ctx.strokeStyle = memA(0.4); ctx.lineWidth = lw(0.8); ctx.stroke();
    }
    // --- head: eyes, grasping spines (hooks), hood
    const hy = awY(0.94);
    ctx.beginPath();
    for (const sg of SIDES) { ctx.moveTo(0.91 + 0.028, hy + sg * 0.06); ctx.arc(0.91, hy + sg * 0.06, 0.028, 0, TAU); }
    ctx.fillStyle = 'rgba(25,20,45,0.9)'; ctx.fill();
    ctx.beginPath();
    for (const sg of SIDES) { ctx.moveTo(0.918 + 0.01, hy + sg * 0.052); ctx.arc(0.918, hy + sg * 0.052, 0.01, 0, TAU); }
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    const open = max(0.04, 0.45 * tele, lunge);
    const ns = hd ? 9 : 7;
    ctx.beginPath();
    for (const sg of SIDES) for (let j = 0; j < ns; j++) {
      const f = j / (ns - 1), phi = sg * (0.7 + f * 0.65);
      const bx = 0.95 + cos(phi) * 0.08, by = hy + sin(phi) * 0.13;
      const a = sg * lerp(0.4 + f * 0.14, 0.42 + f * 1.3, open) + 0.04 * sin(t * 2 + j) * (1 - open);
      const curl = -sg * lerp(1.55, 0.95, open), L = 0.2 + f * 0.04;
      const p1x = bx + cos(a) * L * 0.6, p1y = by + sin(a) * L * 0.6;
      const p2x = p1x + cos(a + curl) * L * 0.5, p2y = p1y + sin(a + curl) * L * 0.5;
      const nx = -sin(a) * 0.014, ny = cos(a) * 0.014;
      ctx.moveTo(bx + nx, by + ny); ctx.quadraticCurveTo(p1x + nx * 0.4, p1y + ny * 0.4, p2x, p2y);
      ctx.quadraticCurveTo(p1x - nx * 0.4, p1y - ny * 0.4, bx - nx, by - ny); ctx.closePath();
    }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.95); ctx.fill();
    ctx.strokeStyle = H.rgbStr([150, 100, 40], 0.6); ctx.lineWidth = lw(0.7); ctx.stroke();
    // hood: a glassy fold that covers the spines at rest
    const hood = 1 - smooth(open * 2.2);
    if (hood > 0.02) {
      ctx.beginPath(); ctx.ellipse(1.02, hy, 0.14, 0.18, 0, -PI / 2, PI / 2); ctx.closePath();
      ctx.fillStyle = memA(0.2 * hood); ctx.fill();
      ctx.strokeStyle = memA(0.45 * hood); ctx.lineWidth = lw(1); ctx.stroke();
    }
    // glassy specular streak along the upper flank
    const up = cos(e.ang || 0) >= 0 ? -1 : 1;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const x = lerp(-0.62, 0.7, i / 12); ctx[i ? 'lineTo' : 'moveTo'](x, awY(x) + up * awW(x) * 0.5); }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = lw(hd ? 2.2 : 1.6); ctx.stroke();
    hl(ctx, H, e, 0.93, hy, 0.25);
    ctx.restore();
  },
};
function mixWarm(c) { return [c[0] * 0.6 + 255 * 0.4, c[1] * 0.6 + 235 * 0.4, c[2] * 0.6 + 170 * 0.4]; }

// =====================================================================================================
// Comb jelly (Pleurobrachia) — glassy egg, 8 shimmering comb rows, two trailing tentacles with side branches
// =====================================================================================================
const TX = new Float32Array(40), TY = new Float32Array(40);
const combjelly = {
  name: 'Comb jelly',
  col: { body: [185, 210, 255], mem: [230, 240, 255], nuc: [255, 165, 200], glow: [160, 210, 255] },
  portraitR: 0.27,
  portraitRot: -0.35,
  states: [
    { label: 'idle' },
    { label: 'pulse 0.5', pulse: 0.5 },
    { label: 'pulse 1', pulse: 1 },
  ],
  draw(ctx, e, t, s, H) {
    const c = H.col, lw = H.lw, lod = H.lod, hd = H.hd;
    const pulse = smooth(e.pulse || 0);
    const br = 1 + 0.02 * sin(t * 1.4) + 0.06 * pulse;
    const rx = 0.86 * br * (1 + (e.stretch || 0)), ry = 0.74 * (br - 0.035 * pulse);
    const ew = (u) => (u >= 1 || u <= -1 ? 0 : ry * sqrt(1 - u * u) * (1 - 0.08 * u));
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // --- tentacles (behind): exit near the aboral end, trail to -x, side branches (tentilla)
    const L = 2.05 * (1 - 0.45 * pulse), NT = lod ? 6 : hd ? 30 : 18;
    const tentC = H.rgbStr(H.mixRGB(c.nuc, [255, 255, 255], 0.45), lod ? 0.6 : 0.8);
    ctx.beginPath();
    for (const sg of SIDES) {
      const x0 = -0.55 * rx, y0 = sg * 0.55 * ry / 0.74;
      for (let i = 0; i <= NT; i++) {
        const d = (i / NT) * L;
        TX[i] = x0 - d * 0.97;
        TY[i] = y0 + sg * (0.2 * d - 0.035 * d * d) + 0.14 * sin(d * 2.4 - t * 1.6 + sg) * min(1, d);
      }
      polyline(ctx, TX, TY, NT + 1);
    }
    ctx.strokeStyle = tentC; ctx.lineWidth = lw(lod ? 1 : 1.4); ctx.stroke();
    if (!lod) {
      ctx.beginPath();
      for (const sg of SIDES) {
        const x0 = -0.55 * rx, y0 = sg * 0.55 * ry / 0.74;
        for (let i = 1; i < NT; i++) {
          const d = (i / NT) * L, x = x0 - d * 0.97;
          const y = y0 + sg * (0.2 * d - 0.035 * d * d) + 0.14 * sin(d * 2.4 - t * 1.6 + sg) * min(1, d);
          const k = (1 - 0.45 * i / NT) * (1 - 0.3 * pulse), w = 0.03 * sin(t * 2 + i * 1.3);
          ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 0.02, y + sg * 0.09 * k, x - 0.1 * k + w, y + sg * (0.17 + w) * k);
        }
      }
      ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, [255, 255, 255], 0.5), 0.5); ctx.lineWidth = lw(0.9); ctx.stroke();
    }
    // --- body
    const NB = lod ? 16 : 36;
    for (let i = 0; i < NB; i++) { const th = (i / NB) * TAU; BX[i] = rx * cos(th); BY[i] = ry * sin(th) * (1 - 0.08 * cos(th)); }
    smoothPath(ctx, NB);
    if (lod) { ctx.fillStyle = H.rgbStr(c.body, 0.7); ctx.fill(); ctx.restore(); return; }
    fillIn(ctx, H.bodyGrad(ctx, c.body, 0.8), 0, 0, rx, ry);
    // comb row geometry
    const spin = t * 0.3, NC = hd ? 16 : 10, speed = 1 + 0.9 * pulse;
    let n = 0;
    for (let k = 0; k < 8; k++) {
      const ph = (k / 8) * TAU + spin, sn = sin(ph), z = cos(ph);
      for (let i = 0; i < NC; i++) {
        const u = -0.8 + 1.6 * (i + 0.5) / NC, x = u * rx, y = ew(u) * sn * 0.97;
        const dy = (ew(u + 0.01) - ew(u - 0.01)) * sn * 0.97 / (0.02 * rx);
        const hl = 0.044 * (0.45 + 0.55 * abs(z)) / sqrt(1 + dy * dy);
        CX[n] = x; CY[n] = y; CU[n] = -dy * hl; CV[n] = hl;
        CB[n++] = z < 0 ? BACK : cteneBucket(i, k, t, speed, 0.3 * pulse);
      }
    }
    // tracks of the comb rows
    const track = (front) => {
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const ph = (k / 8) * TAU + spin;
        if ((cos(ph) >= 0) !== front) continue;
        for (let i = 0; i <= 12; i++) { const u = -0.82 + 1.64 * i / 12, x = u * rx, y = ew(u) * sin(ph) * 0.97; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      }
    };
    track(false); ctx.strokeStyle = H.rgbStr(c.mem, 0.14); ctx.lineWidth = lw(1); ctx.stroke();
    strokeCtenes(ctx, n, BACK, H.rgbStr(c.mem, 0.28), lw(hd ? 1.6 : 1.3));
    // organs: pharynx, tentacle sheaths, statocyst, mouth
    ctx.beginPath(); ctx.ellipse(0.42 * rx, 0, 0.42 * rx, 0.1, 0, 0, TAU);
    ctx.fillStyle = H.rgbStr(c.nuc, 0.2); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.38); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (const sg of SIDES) ell(ctx, -0.2 * rx, sg * 0.34 * ry / 0.74, 0.3, 0.07, sg * 0.3);
    ctx.fillStyle = H.rgbStr(c.nuc, 0.28); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.45); ctx.lineWidth = lw(1); ctx.stroke();
    if (hd) {
      // infundibulum (stomach) between the tentacle bulbs
      ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(-0.08, -0.05); ctx.lineTo(-0.18, 0); ctx.lineTo(-0.08, 0.05); ctx.closePath();
      ctx.fillStyle = H.rgbStr(c.nuc, 0.3); ctx.fill();
    }
    glow(ctx, H, [210, 240, 255], -rx + 0.07, 0, 0.14, 0.8);
    ctx.beginPath(); ctx.arc(-rx + 0.07, 0, 0.04, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(rx - 0.02, -0.08); ctx.quadraticCurveTo(rx - 0.06, 0, rx - 0.02, 0.08);
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.8); ctx.lineWidth = lw(1.6); ctx.stroke();
    // outline
    smoothPath(ctx, NB);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.8); ctx.lineWidth = lw(hd ? 1.5 : 1.3); ctx.stroke();
    // front comb rows: track + ctenes with travelling rainbow shimmer
    track(true); ctx.strokeStyle = H.rgbStr(c.mem, 0.32); ctx.lineWidth = lw(1); ctx.stroke();
    strokeCtenes(ctx, n, PLAIN, H.rgbStr(c.mem, 0.5), lw(hd ? 2.4 : 2));
    rainbowCtenes(ctx, n, lw(hd ? 3 : 2.4), 0.9 + 0.1 * pulse, 2.6 + pulse);
    if (pulse > 0.01) glow(ctx, H, c.glow, 0, 0, 1.6, 0.55 * pulse);
    hl(ctx, H, e, 0, 0, 0.85);
    ctx.restore();
  },
};

// =====================================================================================================
// Ostracod (seed shrimp, Vargula-like) — bean-shaped bivalved shell (lateral view), antennae through the
// rostral notch, little legs from the ventral gape; squirts a blue bioluminescent cloud
// =====================================================================================================
function ostShell(ctx) {
  ctx.beginPath();
  ctx.moveTo(0.97, 0.05);
  ctx.bezierCurveTo(0.97, -0.38, 0.58, -0.72, 0.02, -0.72);
  ctx.bezierCurveTo(-0.55, -0.72, -0.97, -0.4, -0.96, 0.0);
  ctx.bezierCurveTo(-0.95, 0.36, -0.6, 0.57, -0.08, 0.57);
  ctx.bezierCurveTo(0.38, 0.57, 0.7, 0.48, 0.8, 0.3);
  ctx.quadraticCurveTo(0.74, 0.16, 0.97, 0.05);
  ctx.closePath();
}
const ostracod = {
  name: 'Ostracod',
  col: { body: [228, 214, 150], mem: [255, 248, 215], nuc: [110, 65, 45], glow: [80, 170, 255] },
  portraitR: 0.3,
  portraitRot: -0.25,
  states: [
    { label: 'idle' },
    { label: 'glowK 0.5', glowK: 0.5 },
    { label: 'glowK 1 (blue cloud)', glowK: 1 },
  ],
  draw(ctx, e, t, s, H) {
    const c = H.col, lw = H.lw, lod = H.lod, hd = H.hd;
    const gk = smooth(e.glowK || 0);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const st = e.stretch || 0;
    // lateral view: keep the back (dorsal side) up on screen whichever way it swims
    // (seen edge-on from above when heading straight up/down, like a seed)
    let fy = max(-1, min(1, cos(e.ang || 0) * 3));
    if (abs(fy) < 0.45) fy = fy < 0 ? -0.45 : 0.45;
    ctx.scale(1 + st, fy * (1 - st * 0.5));
    // blue cloud: puffs of luminous secretion drifting back from the lip glands
    if (gk > 0.01) {
      for (let j = 0; j < 6; j++) {
        const ph = fract(t * 0.32 + j / 6), x = 0.55 - ph * 2.7, y = 0.3 + 0.45 * sin(j * 2.3 + t * 0.8) * ph;
        glow(ctx, H, c.glow, x, y, 0.55 + ph * 1.5, gk * (1 - ph * 0.85) * 0.9);
      }
      glow(ctx, H, [170, 225, 255], 0.75, 0.32, 0.8, gk * 0.9, 1);
    }
    if (lod) {
      ostShell(ctx); ctx.fillStyle = H.rgbStr(c.body, 0.9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.8, 0.2); ctx.lineTo(1.3, 0.45);
      ctx.strokeStyle = H.rgbStr(c.mem, 0.8); ctx.lineWidth = lw(1.2); ctx.stroke();
      ctx.restore();
      return;
    }
    const memA = (a) => H.rgbStr(c.mem, a);
    // --- second antennae: rowing exopods with long natatory setae out of the rostral notch
    const row = 0.5 + 0.5 * sin(t * (3.2 + 5 * gk));
    ctx.beginPath();
    ctx.moveTo(0.62, 0.12); ctx.lineTo(0.92, 0.24 + 0.04 * row);
    ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = lw(hd ? 4 : 3); ctx.stroke();
    ctx.beginPath();
    const nset = hd ? 8 : 5;
    for (let i = 0; i < nset; i++) {
      const f = i / (nset - 1), a = lerp(-0.25, 1.05, f) + row * 0.65, L = 0.62 - 0.1 * abs(f - 0.4);
      const bx = 0.92, by = 0.24 + 0.04 * row;
      ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + cos(a) * L * 0.5, by + sin(a) * L * 0.5, bx + cos(a + 0.25) * L, by + sin(a + 0.25) * L);
    }
    // first antennae (sensory, from the rostrum)
    ctx.moveTo(0.9, -0.02); ctx.quadraticCurveTo(1.04, -0.1, 1.12, -0.06 + 0.02 * sin(t * 2));
    ctx.moveTo(1.0, -0.07); ctx.lineTo(1.1, -0.17); ctx.moveTo(1.06, -0.08); ctx.lineTo(1.2, -0.12);
    // walking legs + furca from the ventral gape
    for (let i = 0; i < 3; i++) {
      const x = 0.32 - i * 0.24, k = sin(t * 3 + i * 1.7) * 0.06;
      ctx.moveTo(x, 0.5); ctx.lineTo(x - 0.03 + k, 0.66); ctx.lineTo(x - 0.1 + k, 0.72);
    }
    ctx.moveTo(-0.55, 0.45); ctx.quadraticCurveTo(-0.66, 0.6, -0.8, 0.62);
    ctx.moveTo(-0.58, 0.47); ctx.quadraticCurveTo(-0.65, 0.66, -0.75, 0.71);
    ctx.strokeStyle = memA(0.75); ctx.lineWidth = lw(hd ? 1.3 : 1.1); ctx.stroke();
    if (hd) {
      // plumose hairs on the swimming setae
      ctx.beginPath();
      for (let i = 0; i < nset; i++) {
        const f = i / (nset - 1), a = lerp(-0.25, 1.05, f) + row * 0.65, L = 0.62 - 0.1 * abs(f - 0.4);
        for (let m = 3; m < 9; m++) {
          const u = m / 9, x = 0.92 + cos(a + 0.12 * u) * L * u, y = 0.24 + 0.04 * row + sin(a + 0.12 * u) * L * u;
          ctx.moveTo(x, y); ctx.lineTo(x - sin(a) * 0.03, y + cos(a) * 0.03);
        }
      }
      ctx.strokeStyle = memA(0.35); ctx.lineWidth = lw(0.8); ctx.stroke();
    }
    // --- shell (one valve faces us; the other's rim shows along the gape)
    ctx.save(); ctx.translate(0.02, 0.035); ctx.scale(0.985, 0.985); ostShell(ctx); ctx.restore();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, [60, 40, 20], 0.35), 0.6); ctx.fill();
    ostShell(ctx);
    fillIn(ctx, H.bodyGrad(ctx, c.body, 1.15), 0, -0.07, 0.97, 0.68);
    ctx.save(); ctx.clip();
    // inside, seen through the valve: gut, compound eye, adductor muscle scar
    ctx.beginPath(); ctx.ellipse(0.12, 0.14, 0.62, 0.34, -0.12, 0, TAU);
    ctx.fillStyle = H.rgbStr(c.nuc, 0.1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.42, 0.04); ctx.bezierCurveTo(0.12, -0.1, -0.22, 0.06, -0.48, 0.24);
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.22); ctx.lineWidth = 0.075; ctx.stroke();
    ctx.beginPath(); ctx.arc(0.55, -0.15, 0.13, 0, TAU);
    fillIn(ctx, H.nucGrad(ctx, [120, 40, 30]), 0.55, -0.15, 0.13, 0.13);
    if (hd) {
      ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = i * 2.4, r = 0.03 + 0.07 * fract(i * 0.618); const x = 0.55 + cos(a) * r, y = -0.15 + sin(a) * r; ctx.moveTo(x + 0.014, y); ctx.arc(x, y, 0.014, 0, TAU); }
      ctx.fillStyle = 'rgba(255,190,140,0.35)'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0.6, -0.19, 0.035, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3, x = -0.02 + cos(a) * 0.08, y = -0.02 + sin(a) * 0.06; ell(ctx, x, y, 0.035, 0.022, a); }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.3); ctx.fill();
    if (hd) {
      // growth lines + pore dots on the valve
      ctx.beginPath();
      for (const k of [0.82, 0.64]) { ctx.save(); ctx.translate(-0.02, -0.08); ctx.scale(k, k); ostShell(ctx); ctx.restore(); }
      ctx.strokeStyle = memA(0.16); ctx.lineWidth = lw(1); ctx.stroke();
      H.dots(ctx, 26, 0.7, 0, 0.1, 0.9, 0.012, 0, -0.02, 0.95, 0.62); ctx.fillStyle = memA(0.35); ctx.fill();
    }
    // light gland in the upper lip
    glow(ctx, H, c.glow, 0.72, 0.3, 0.16 + 0.2 * gk, 0.35 + 0.65 * gk, gk > 0.3 ? 1 : 0);
    ctx.restore();
    ostShell(ctx);
    ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lw(hd ? 1.7 : 1.4); ctx.stroke();
    // hinge line along the back
    ctx.beginPath(); ctx.moveTo(0.55, -0.6); ctx.bezierCurveTo(0.25, -0.69, -0.25, -0.69, -0.55, -0.6);
    ctx.strokeStyle = memA(0.45); ctx.lineWidth = lw(1.1); ctx.stroke();
    if (gk > 0.01) {
      // shell edges catch the blue light
      const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * gk * 0.6;
      ostShell(ctx); ctx.strokeStyle = H.cstr(c.glow); ctx.lineWidth = lw(3); ctx.stroke();
      ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
    }
    ctx.restore();
    if (!lod) H.highlight(ctx, e.ang || 0);
  },
};

// =====================================================================================================
// Beroe (boss) — thimble-shaped comb jelly, no tentacles, a huge mouth at +x, 8 iridescent comb rows,
// branching meridional canals
// =====================================================================================================
const BR_TH = Array.from({ length: 8 }, (_, k) => (k / 8) * TAU + 0.2);
let BR_MK = 0, BR_T = 0, BR_X0 = -1, BR_XM = 0.92;
const brX = (u) => BR_X0 + u * (BR_XM - BR_X0);
function brW(u) {
  const q = u * (2 - u);
  return (0.71 + 0.012 * sin(BR_T * 1.1 + u * 4)) * pow(q > 0 ? q : 0, 0.38) + BR_MK * 0.17 * u * u * u * u;
}
let BR_CANALS = null; // flat [u1, th1, u2, th2, ...]: side branches of the meridional canals
function beroeCanals() {
  if (BR_CANALS) return BR_CANALS;
  const out = []; let sd = 7;
  const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 8; k++) {
    const th0 = BR_TH[k];
    for (let u = 0.12; u < 0.95; u += 0.05 + rnd() * 0.035) {
      for (const sg of SIDES) {
        let uu = u + rnd() * 0.02, th = th0;
        const steps = 2 + ((rnd() * 2) | 0);
        for (let s = 0; s < steps; s++) {
          const du = 0.018 + rnd() * 0.03, dth = sg * (0.07 + rnd() * 0.07);
          out.push(uu, th, uu + du, th + dth);
          if (s > 0 && rnd() < 0.55) out.push(uu + du, th + dth, uu + du + 0.03 + rnd() * 0.02, th + dth - sg * (0.02 + rnd() * 0.05));
          uu += du; th += dth;
        }
      }
    }
  }
  BR_CANALS = new Float32Array(out);
  return BR_CANALS;
}
function beroeOutline(ctx, n, rxm, wm) {
  let m = 0;
  for (let i = 0; i <= n; i++) { const u = pow(i / n, 1.5); BX[m] = brX(u); BY[m++] = -brW(u); }
  for (let i = 1; i < 10; i++) { const a = -PI / 2 + (i / 10) * PI; BX[m] = BR_XM + cos(a) * rxm; BY[m++] = sin(a) * wm; }
  for (let i = n; i > 0; i--) { const u = pow(i / n, 1.5); BX[m] = brX(u); BY[m++] = brW(u); }
  smoothPath(ctx, m);
}
function mouthGrad(ctx, c) {
  return cachedGrad(ctx, 'bm' + c.join(','), (g0) => {
    const g = g0.createRadialGradient(-0.25, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${c[0] * 0.25 | 0},${c[1] * 0.12 | 0},${c[2] * 0.22 | 0},0.92)`);
    g.addColorStop(0.65, `rgba(${c[0] * 0.5 | 0},${c[1] * 0.25 | 0},${c[2] * 0.38 | 0},0.82)`);
    g.addColorStop(1, `rgba(${c[0]},${c[1] * 0.7 | 0},${c[2] * 0.8 | 0},0.7)`);
    return g;
  });
}
const TORN_C = 'rgba(70,18,38,0.85)';
const beroe = {
  name: 'Beroe',
  boss: true,
  col: { body: [255, 150, 185], mem: [255, 222, 235], nuc: [200, 70, 115], glow: [255, 140, 195] },
  portraitR: 0.3,
  portraitRot: -0.4,
  states: [
    { label: 'idle (mouthK 0)' },
    { label: 'mouthK 1 (gape)', mouthK: 1 },
    { label: 'rows torn [1,0,1,.5,0,1,.2,1]', rows: [1, 0, 1, 0.5, 0, 1, 0.2, 1], mouthK: 0.35 },
  ],
  draw(ctx, e, t, s, H) {
    const c = H.col, lw = H.lw, lwb = H.lwb || H.lw, lod = H.lod, hd = H.hd;
    const mk = smooth(e.mouthK || 0), rows = e.rows;
    BR_MK = mk; BR_T = t;
    BR_X0 = -1 - 0.05 * mk; BR_XM = 0.9 + 0.1 * mk + (e.stretch || 0) * 0.5;
    const rxm = 0.05 + 0.3 * mk, wm = brW(1);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const breath = 1 + 0.015 * sin(t * 1.3);
    ctx.scale(1, breath);
    if (lod) {
      beroeOutline(ctx, 8, rxm, wm); ctx.fillStyle = H.rgbStr(c.body, 0.8); ctx.fill();
      ctx.restore();
      return;
    }
    const memA = (a) => H.rgbStr(c.mem, a);
    const NO = hd ? 40 : 24;
    // --- body sac
    beroeOutline(ctx, NO, rxm, wm);
    fillIn(ctx, H.bodyGrad(ctx, c.body, 0.95), -0.02, 0, 1.0, 0.76);
    // the gastric cavity (most of the sac), slightly darker
    ctx.save(); ctx.translate(0.1, 0); ctx.scale(0.86, 0.82); beroeOutline(ctx, (NO / 2) | 0, rxm, wm); ctx.restore();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.6), 0.14); ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.16); ctx.lineWidth = lwb(1.2); ctx.stroke();
    // --- meridional canals (with branching diverticula when large)
    const rowH = (k) => (rows && rows[k] !== undefined ? clamp01(rows[k]) : 1);
    for (const front of [false, true]) {
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        if ((cos(BR_TH[k]) >= 0) !== front) continue;
        const sn = sin(BR_TH[k]);
        for (let i = 0; i <= 16; i++) { const u = 0.06 + 0.92 * i / 16, x = brX(u), y = brW(u) * sn * 0.955; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      }
      if (hd) {
        const cn = beroeCanals();
        for (let i = 0; i < cn.length; i += 4) {
          const th = (cn[i + 1] + cn[i + 3]) / 2;
          if ((cos(th) >= 0) !== front) continue;
          const u1 = min(0.97, cn[i]), u2 = min(0.97, cn[i + 2]);
          ctx.moveTo(brX(u1), brW(u1) * sin(cn[i + 1]) * 0.955);
          ctx.lineTo(brX(u2), brW(u2) * sin(cn[i + 3]) * 0.955);
        }
      }
      ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.3), front ? 0.34 : 0.16); ctx.lineWidth = lwb(front ? 1.2 : 0.9); ctx.stroke();
    }
    if (hd) {
      // rosy pigment speckles
      ctx.beginPath();
      for (let i = 0; i < 46; i++) {
        const u = 0.1 + 0.85 * hash(i * 1.7), th = hash(i * 3.3 + 1) * TAU;
        const x = brX(u), y = brW(u) * sin(th) * 0.9, r = 0.008 + 0.01 * hash(i * 5.1);
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fillStyle = H.rgbStr(c.nuc, 0.35); ctx.fill();
    }
    // --- comb rows: geometry, health, shimmer
    const NC = hd ? 24 : 12, speed = 1 + 0.5 * mk;
    let n = 0;
    for (let k = 0; k < 8; k++) {
      const sn = sin(BR_TH[k]), z = cos(BR_TH[k]), h = rowH(k);
      for (let i = 0; i < NC; i++) {
        const u = 0.09 + 0.72 * (i + 0.5) / NC, x = brX(u), y = brW(u) * sn * 0.955;
        const dx = brX(u + 0.01) - brX(u - 0.01), dy = (brW(u + 0.01) - brW(u - 0.01)) * sn * 0.955;
        const dl = hypot(dx, dy) || 1, hl = (hd ? 0.048 : 0.06) * (0.5 + 0.5 * abs(z));
        CX[n] = x; CY[n] = y; CU[n] = -dy / dl * hl; CV[n] = dx / dl * hl;
        const alive = hash(k * 31.7 + i * 7.3) < h * 1.02;
        CB[n++] = !alive ? TORN : z < 0 ? BACK : cteneBucket(i, k, t, speed, 0.12);
      }
    }
    // rows on the far side, seen through the jelly
    const rowTrack = (k, jag) => {
      const sn = sin(BR_TH[k]);
      for (let i = 0; i <= 14; i++) {
        const u = 0.08 + 0.75 * i / 14, x = brX(u), y = brW(u) * sn * 0.955 + (jag ? (i % 2 ? 1 : -1) * 0.022 * jag : 0);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
    };
    ctx.beginPath();
    for (let k = 0; k < 8; k++) if (cos(BR_TH[k]) < 0) rowTrack(k, 0);
    ctx.strokeStyle = memA(0.16); ctx.lineWidth = lwb(1.2); ctx.stroke();
    strokeCtenes(ctx, n, BACK, memA(0.3), lwb(hd ? 1.8 : 1.4));
    // --- mouth: closed lips form a seam; open, a wide gape lined with macrocilia
    ctx.beginPath(); ctx.ellipse(BR_XM, 0, rxm, wm * 0.97, 0, 0, TAU);
    fillIn(ctx, mouthGrad(ctx, c.nuc), BR_XM, 0, rxm, wm * 0.97);
    if (mk > 0.05) {
      // inner wall folds deep in the gullet
      ctx.beginPath();
      for (let i = 0; i < 7; i++) { const y = (i / 6 - 0.5) * wm * 1.4; ctx.moveTo(BR_XM - rxm * 0.85, y * 0.85); ctx.quadraticCurveTo(BR_XM - rxm * 0.2, y, BR_XM + rxm * 0.1, y * 0.95); }
      ctx.strokeStyle = H.rgbStr(c.body, 0.18 * mk); ctx.lineWidth = lwb(1.2); ctx.stroke();
    }
    const NM = hd ? 64 : 28;
    ctx.beginPath();
    for (let i = 0; i < NM; i++) {
      const a = (i / NM) * TAU, ca = cos(a), sa = sin(a);
      const x = BR_XM + ca * rxm * 0.94, y = sa * wm * 0.92;
      let ix = -ca * rxm, iy = -sa * wm; const il = hypot(ix, iy) || 1;
      const L = (0.045 + 0.02 * hash(i)) * (0.4 + 0.6 * mk), w = 0.012 * sin(t * 6 + i);
      ctx.moveTo(x, y); ctx.lineTo(x + ix / il * L + w, y + iy / il * L);
    }
    ctx.strokeStyle = memA(0.25 + 0.55 * mk); ctx.lineWidth = lwb(hd ? 1.3 : 1.1); ctx.stroke();
    // --- outline + lips
    beroeOutline(ctx, NO, rxm, wm);
    ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lwb(1.8); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(BR_XM, 0, rxm, wm * 0.97, 0, 0, TAU);
    ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, [255, 255, 255], 0.35), 0.85); ctx.lineWidth = lwb(hd ? 3.2 : 2.4); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(BR_XM, 0, rxm, wm * 0.97, 0, -PI * 0.45, PI * 0.45);
    ctx.strokeStyle = memA(0.7); ctx.lineWidth = lwb(1.2); ctx.stroke();
    // --- statocyst + polar fields at the aboral pole
    const sx = BR_X0 + 0.07;
    glow(ctx, H, [255, 230, 240], sx, 0, 0.22, 0.7);
    if (hd) {
      ctx.beginPath(); for (const sg of SIDES) ell(ctx, sx + 0.03, sg * 0.1, 0.035, 0.08, sg * 0.25);
      ctx.strokeStyle = memA(0.55); ctx.lineWidth = lwb(1); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(sx, 0, 0.045, 0, TAU); ctx.fillStyle = memA(0.55); ctx.fill(); ctx.strokeStyle = memA(0.8); ctx.lineWidth = lwb(1); ctx.stroke();
    ctx.beginPath(); ctx.arc(sx + 0.008, -0.008, 0.016, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    // --- front comb rows: healthy track, torn track, ctenes
    ctx.beginPath();
    for (let k = 0; k < 8; k++) if (cos(BR_TH[k]) >= 0 && rowH(k) > 0.02) rowTrack(k, 0);
    ctx.strokeStyle = memA(0.32); ctx.lineWidth = lwb(1.3); ctx.stroke();
    // damage: dark, jagged wound along hurt rows (front and back alike — the jelly is transparent)
    for (let k = 0; k < 8; k++) {
      const h = rowH(k);
      if (h > 0.98) continue;
      const dmg = 1 - h, fr = cos(BR_TH[k]) >= 0 ? 1 : 0.6;
      ctx.beginPath(); rowTrack(k, 0);
      ctx.strokeStyle = `rgba(60,10,30,${(0.22 * dmg * fr).toFixed(3)})`; ctx.lineWidth = hd ? 0.07 : 0.08; ctx.stroke();
      ctx.beginPath(); rowTrack(k, dmg);
      ctx.strokeStyle = `rgba(80,20,40,${(0.7 * dmg * fr).toFixed(3)})`; ctx.lineWidth = lwb(1.6); ctx.stroke();
    }
    strokeCtenes(ctx, n, TORN, TORN_C, lwb(hd ? 1.6 : 1.3));
    strokeCtenes(ctx, n, PLAIN, memA(0.55), lwb(hd ? 2.2 : 1.8));
    // shimmer strength fades with each row's health
    for (let i = 0; i < n; i++) {
      if (CB[i] >= NH) continue;
      const k = (i / NC) | 0, h = rowH(k);
      if (h < 0.999 && hash(k * 9.1 + i) > h) CB[i] = PLAIN;
    }
    rainbowCtenes(ctx, n, lwb(hd ? 3 : 2.2), 0.9, hd ? 2.2 : 0);
    if (hd) {
      // sparkles riding the crest of each healthy row's wave
      for (let k = 0; k < 8; k++) {
        if (cos(BR_TH[k]) < 0) continue;
        const h = rowH(k);
        if (h < 0.3) continue;
        const u = 0.09 + 0.72 * fract(t * 0.45 + k * 0.37), sn = sin(BR_TH[k]);
        glow(ctx, H, [255, 255, 255], brX(u), brW(u) * sn * 0.955, 0.07, 0.8 * h, 1);
      }
    }
    H.highlight(ctx, e.ang || 0);
    ctx.restore();
  },
};

// =====================================================================================================
// Pompeii worm (boss) — Alvinella pompejana: segmented worm, scarlet feathery gills at the head (+x), a
// whitish fleece of bacteria on its back, living in a mineral chimney tube (mouth at x ≈ 0.6, tube to -x)
// =====================================================================================================
const TUBE_DARK = [40, 34, 37], TUBE_RUST = [182, 96, 46], TUBE_MAT = [226, 220, 200], TUBE_LIP = [226, 214, 192];
const T_MX = 0.6, T_RXO = 0.12, T_RYO = 0.31, T_END = -2.9;
const tubeR = (x, sg) => 0.33 + 0.02 * (T_MX - x) + 0.025 * sin(x * 7.3 + sg * 1.7) + 0.015 * sin(x * 17.1 + sg * 4.1) + (x > 0.4 ? 0.05 * smooth((x - 0.4) / 0.2) : 0);
function tubeGrad(ctx) {
  return cachedGrad(ctx, 'tube', (g0) => {
    const g = g0.createLinearGradient(0, -1, 0, 1);
    g.addColorStop(0, 'rgba(36,30,34,0.98)'); g.addColorStop(0.2, 'rgba(100,90,86,0.98)'); g.addColorStop(0.4, 'rgba(166,154,138,0.98)');
    g.addColorStop(0.56, 'rgba(138,126,114,0.98)'); g.addColorStop(0.84, 'rgba(70,60,60,0.98)'); g.addColorStop(1, 'rgba(28,23,28,0.98)');
    return g;
  });
}
function tubeHoleGrad(ctx) {
  return cachedGrad(ctx, 'tubehole', (g0) => {
    const g = g0.createRadialGradient(-0.3, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(6,3,5,1)'); g.addColorStop(0.72, 'rgba(26,16,16,1)'); g.addColorStop(1, 'rgba(80,58,50,1)');
    return g;
  });
}
function wormGrad(ctx, c) {
  return cachedGrad(ctx, 'worm' + c.join(','), (g0) => {
    const g = g0.createLinearGradient(0, -1, 0, 1);
    const rs = (k, a, add = 0) => `rgba(${min(255, c[0] * k + add) | 0},${min(255, c[1] * k + add) | 0},${min(255, c[2] * k + add) | 0},${a})`;
    g.addColorStop(0, rs(0.5, 0.96)); g.addColorStop(0.22, rs(0.82, 0.94)); g.addColorStop(0.42, rs(1, 0.92, 18));
    g.addColorStop(0.62, rs(0.95, 0.92)); g.addColorStop(0.85, rs(0.72, 0.94)); g.addColorStop(1, rs(0.45, 0.96));
    return g;
  });
}
// The tube: drawn under the worm, in the worm's unit space (mouth at x = T_MX, extending to -x)
function drawTube(ctx, t, H) {
  const lw = H.lw, lwb = H.lwb || H.lw, lod = H.lod, hd = H.hd;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const N = lod ? 6 : hd ? 44 : 22;
  const r0 = tubeR(T_MX, -1), r1 = tubeR(T_MX, 1);
  // silhouette: top edge back to the far end, bottom edge forward, then the front half of the lip
  let n = 0;
  for (let i = 0; i <= N; i++) { const x = lerp(T_MX, T_END, i / N); BX[n] = x; BY[n++] = -tubeR(x, -1); }
  BX[n] = T_END - 0.1; BY[n++] = 0;
  for (let i = N; i >= 0; i--) { const x = lerp(T_MX, T_END, i / N); BX[n] = x; BY[n++] = tubeR(x, 1); }
  for (let i = 1; i < 8; i++) { const a = PI / 2 - (i / 8) * PI; BX[n] = T_MX + cos(a) * T_RXO * 1.3; BY[n++] = sin(a) * (a > 0 ? r1 : r0); }
  smoothPath(ctx, n);
  if (lod) { ctx.fillStyle = 'rgb(120,108,100)'; ctx.fill(); ctx.restore(); return; }
  fillIn(ctx, tubeGrad(ctx), 0, 0, 1, 0.4);
  ctx.strokeStyle = H.rgbStr(TUBE_DARK, 0.9); ctx.lineWidth = lwb(1.5); ctx.stroke();
  // growth rings (ellipse arcs: the tube is seen a little from its open end)
  ctx.beginPath();
  for (let x = T_MX - 0.15, i = 0; x > T_END + 0.1; x -= 0.13 + 0.09 * hash(i * 4.7), i++) {
    ctx.moveTo(x, -tubeR(x, -1) * 0.96); ctx.ellipse(x, 0, 0.08, tubeR(x, 1) * 0.96, 0, -PI / 2, PI / 2);
  }
  ctx.strokeStyle = H.rgbStr(TUBE_DARK, 0.4); ctx.lineWidth = lwb(1.2); ctx.stroke();
  ctx.beginPath();
  for (let x = T_MX - 0.17, i = 0; x > T_END + 0.1; x -= 0.13 + 0.09 * hash(i * 4.7), i++) {
    ctx.moveTo(x, -tubeR(x, -1) * 0.55); ctx.ellipse(x, 0, 0.08, tubeR(x, 1) * 0.55, 0, -PI / 2, -0.25);
  }
  ctx.strokeStyle = H.rgbStr(TUBE_LIP, 0.2); ctx.lineWidth = lwb(1.1); ctx.stroke();
  // mineral crust: dark sulphide knobs, rusty iron oxide, pale bacterial mats
  const K = hd ? 72 : 30;
  for (const [col, a, k0] of [[TUBE_DARK, 0.9, 0], [TUBE_RUST, 0.55, 1], [TUBE_MAT, 0.32, 2]]) {
    ctx.beginPath();
    for (let i = k0; i < K; i += 3) {
      const x = lerp(T_MX - 0.1, T_END + 0.1, hash(i * 1.31)), sg = hash(i * 2.7) < 0.5 ? -1 : 1;
      const edge = hash(i * 3.9) < 0.6;
      const y = sg * tubeR(x, sg) * (edge ? 0.94 + 0.1 * hash(i * 5.3) : hash(i * 6.1) * 0.8);
      const r = (edge ? 0.03 : 0.018) + 0.032 * hash(i * 7.7);
      ell(ctx, x, y, r, r * (0.6 + 0.4 * hash(i)), hash(i * 8.8) * 3);
    }
    ctx.fillStyle = H.rgbStr(col, a); ctx.fill();
  }
  if (hd) {
    // fine cracks in the crust
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      let x = lerp(T_MX - 0.2, T_END + 0.3, hash(i * 9.7)), y = (hash(i * 4.4) - 0.5) * 0.4;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x -= 0.05 + 0.04 * hash(i * 3 + j); y += (hash(i * 7 + j) - 0.5) * 0.1; ctx.lineTo(x, y); }
    }
    ctx.strokeStyle = H.rgbStr(TUBE_DARK, 0.5); ctx.lineWidth = lwb(0.9); ctx.stroke();
  }
  // the opening: a dark hole with a pale, papery lip
  ctx.beginPath(); ctx.ellipse(T_MX, 0, T_RXO, T_RYO, 0, 0, TAU);
  fillIn(ctx, tubeHoleGrad(ctx), T_MX, 0, T_RXO, T_RYO);
  ctx.beginPath(); ctx.ellipse(T_MX, 0, T_RXO * 1.12, T_RYO * 1.1, 0, 0, TAU);
  ctx.strokeStyle = H.rgbStr(TUBE_LIP, 0.9); ctx.lineWidth = lwb(hd ? 3.4 : 2.6); ctx.stroke();
  if (hd) {
    // bacterial fuzz waving on the lip
    ctx.beginPath();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU, x = T_MX + cos(a) * T_RXO * 1.18, y = sin(a) * T_RYO * 1.14, w = 0.015 * sin(t * 2.2 + i);
      ctx.moveTo(x, y); ctx.lineTo(x + cos(a) * 0.04 + 0.02 + w, y + sin(a) * 0.04 + w);
    }
    ctx.strokeStyle = H.rgbStr(TUBE_MAT, 0.45); ctx.lineWidth = lw(1); ctx.stroke();
  }
  ctx.restore();
}

// worm spine, sampled finely from the head (d = 0) back into the tube
const P_D = 0.105, P_STEP = 0.035, P_MAX = 48;
const WX = new Float32Array(P_MAX), WY = new Float32Array(P_MAX), WA = new Float32Array(P_MAX), WW = new Float32Array(P_MAX);
let W_XH = 0, W_AMP = 0, W_T = 0;
const wSpineY = (d) => { const x = W_XH - d; return W_AMP * sin(d * 3.4 - W_T * 2.1) * clamp01((x - 0.5) * 1.6); };
const wHalf = (d) => 0.11 + 0.08 * smooth(d / 0.38) + 0.014 * (0.5 + 0.5 * cos((d / P_D) * TAU));
// point + normal on the spine at distance d behind the head → into Q
const Q = { x: 0, y: 0, nx: 0, ny: 1, a: 0 };
function wAt(d) {
  const y0 = wSpineY(d - 0.01), y1 = wSpineY(d + 0.01);
  const a = atan2(y0 - y1, 0.02);
  Q.x = W_XH - d; Q.y = wSpineY(d); Q.a = a; Q.nx = -sin(a); Q.ny = cos(a);
  return Q;
}
const FLEECE = [240, 238, 226], CHAETA = [255, 222, 165];
const pompeii = {
  name: 'Pompeii worm',
  boss: true,
  col: { body: [236, 160, 150], mem: [255, 226, 215], nuc: [232, 36, 48], glow: [255, 100, 70] },
  portraitR: 0.3,
  portraitRot: -0.75,
  states: [
    { label: 'emergeK 0 (in tube)', emergeK: 0, withTube: true, ang: -0.785 },
    { label: 'emergeK 0.5', emergeK: 0.5, withTube: true, ang: -0.785 },
    { label: 'emergeK 1 (lunge)', emergeK: 1, withTube: true, ang: -0.785 },
  ],
  drawTube,
  draw(ctx, e, t, s, H) {
    const c = H.col, lw = H.lw, lwb = H.lwb || H.lw, lod = H.lod, hd = H.hd;
    const portrait = e.r === undefined; // codex portrait: show it half out of its tube
    const ek = smooth(e.emergeK ?? (portrait ? 0.75 : 0)), open = smooth(ek * 1.25);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (portrait) ctx.translate(-0.62, 0);
    if (e.withTube || portrait) drawTube(ctx, t, H);
    W_XH = lerp(0.42, 1.45, ek) + (e.stretch || 0) * 0.3; W_AMP = 0.025 + 0.06 * ek; W_T = t;
    const dMax = min((P_MAX - 1) * P_STEP, W_XH - 0.3);
    const ns = max(2, (dMax / P_STEP) | 0);
    for (let j = 0; j <= ns; j++) { const d = (j / ns) * dMax; wAt(d); WX[j] = Q.x; WY[j] = Q.y; WA[j] = Q.a; WW[j] = wHalf(d); }
    const hy = WY[0], ha = WA[0];
    if (lod) {
      ctx.beginPath(); ctx.moveTo(T_MX, 0); ctx.lineTo(W_XH, hy);
      ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = 0.34; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(W_XH - 0.1, hy, 0.2 + 0.15 * open, 0.2 + 0.3 * open, 0, 0, TAU);
      ctx.fillStyle = H.rgbStr(c.nuc, 0.9); ctx.fill();
      ctx.restore();
      return;
    }
    // clip to the outside of the tube plus what shows through its mouth
    ctx.save();
    ctx.beginPath(); ctx.rect(T_MX, -6, 8, 12); ell(ctx, T_MX, 0, T_RXO, T_RYO); ctx.clip();
    glow(ctx, H, c.nuc, W_XH - 0.05, hy, 0.5 + 0.3 * ek, 0.12 + 0.12 * ek);
    // parapodia (side lobes) with golden chaetae, one pair per segment
    ctx.beginPath();
    for (let i = 1; i * P_D < dMax; i++) {
      const p = wAt(i * P_D), w = wHalf(i * P_D);
      for (const sg of SIDES) { const px = p.x + p.nx * sg * (w + 0.004), py = p.y + p.ny * sg * (w + 0.004); ell(ctx, px, py, 0.032, 0.026, p.a); }
    }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.2), 0.9); ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.4); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let i = 1; i * P_D < dMax; i++) {
      const p = wAt(i * P_D), w = wHalf(i * P_D);
      for (const sg of SIDES) {
        const px = p.x + p.nx * sg * (w + 0.01), py = p.y + p.ny * sg * (w + 0.01);
        for (let f = -1; f <= 1; f++) {
          const L = 0.07 + 0.025 * (1 - abs(f)), ba = p.a + sg * (PI / 2 + 0.35 + f * 0.3) + 0.06 * sin(t * 3 + i);
          ctx.moveTo(px, py); ctx.lineTo(px + cos(ba) * L, py + sin(ba) * L);
        }
      }
    }
    ctx.strokeStyle = H.rgbStr(CHAETA, 0.75); ctx.lineWidth = lw(hd ? 1.2 : 1); ctx.stroke();
    // body: one continuous, gently annulated tube
    let n = 0;
    for (let j = 0; j <= ns; j++) { BX[n] = WX[j] - sin(WA[j]) * -WW[j]; BY[n++] = WY[j] - cos(WA[j]) * WW[j]; }
    for (let j = ns; j >= 0; j--) { BX[n] = WX[j] + sin(WA[j]) * -WW[j]; BY[n++] = WY[j] + cos(WA[j]) * WW[j]; }
    smoothPath(ctx, n);
    fillIn(ctx, wormGrad(ctx, c.body), 0, 0, 1, 0.21);
    ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, [90, 20, 30], 0.35), 0.8); ctx.lineWidth = lwb(1.3); ctx.stroke();
    // segment grooves
    ctx.beginPath();
    for (let i = 0; (i + 0.5) * P_D < dMax; i++) {
      const d = (i + 0.5) * P_D, p = wAt(d), w = wHalf(d) * 0.94, tx = cos(p.a) * 0.03, ty = sin(p.a) * 0.03;
      ctx.moveTo(p.x - p.nx * w, p.y - p.ny * w); ctx.quadraticCurveTo(p.x + tx * 1.4, p.y + ty * 1.4, p.x + p.nx * w, p.y + p.ny * w);
    }
    ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, [110, 30, 40], 0.5), 0.5); ctx.lineWidth = lwb(1.2); ctx.stroke();
    // dorsal fleece of filamentous bacteria (behind the gill segments)
    const f0 = 0.3;
    if (dMax > f0) {
      ctx.beginPath();
      for (let j = 0; j <= ns; j++) { const d = (j / ns) * dMax; if (d < f0) continue; ctx.lineTo(WX[j], WY[j]); }
      ctx.strokeStyle = H.rgbStr(FLEECE, 0.32); ctx.lineWidth = 0.2; ctx.stroke();
      ctx.beginPath();
      const nf = hd ? 14 : 7;
      for (let i = 3; i * P_D < dMax; i++) {
        const p = wAt(i * P_D), w = wHalf(i * P_D), px = p.x, py = p.y, nx = p.nx, ny = p.ny;
        for (let f = 0; f < nf; f++) {
          const sg = f % 2 ? 1 : -1, r1 = hash(i * 13.1 + f), r2 = hash(i * 7.7 + f * 3.3);
          const o = 0.02 + 0.08 * r1, x0 = px + nx * sg * o + (r2 - 0.5) * 0.09, y0 = py + ny * sg * o;
          const wv = 0.025 * sin(t * 2.4 + i * 0.9 + f), L = w + 0.06 + 0.07 * r2 - o;
          ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + nx * sg * L * 0.6 - 0.03, y0 + ny * sg * L * 0.6 + wv, x0 + nx * sg * L - 0.09 - 0.04 * r1, y0 + ny * sg * L + wv);
        }
      }
      ctx.strokeStyle = H.rgbStr(FLEECE, 0.72); ctx.lineWidth = lw(hd ? 1.3 : 1.1); ctx.stroke();
      if (hd) {
        ctx.beginPath();
        for (let i = 3; i * P_D < dMax; i++) {
          const p = wAt(i * P_D);
          for (let f = 0; f < 6; f++) { const x = p.x + (hash(i * 3.1 + f) - 0.5) * 0.1, y = p.y + (hash(i * 5.9 + f) - 0.5) * 0.2, r = 0.01 + 0.012 * hash(i + f * 9.1); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
        }
        ctx.fillStyle = H.rgbStr(FLEECE, 0.55); ctx.fill();
      }
    }
    // head (prostomium) with a fringe of grooved buccal tentacles
    ctx.save(); ctx.translate(W_XH, hy); ctx.rotate(ha);
    ctx.beginPath();
    const nt = hd ? 14 : 8;
    for (let i = 0; i < nt; i++) {
      const f = i / (nt - 1) - 0.5, a = f * 2.4, L = 0.06 + 0.09 * ek * (1 - abs(f)), w = 0.025 * sin(t * 4 + i * 1.3);
      const bx = 0.06 + cos(a) * 0.05, by = sin(a) * 0.085;
      ctx.moveTo(bx, by); ctx.quadraticCurveTo(bx + cos(a) * L * 0.6, by + sin(a) * L * 0.6 + w, bx + cos(a) * L + w, by + sin(a) * L * 1.1 + w * 2);
    }
    ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, [255, 255, 255], 0.35), 0.9); ctx.lineWidth = lwb(hd ? 2 : 1.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.06, -0.12); ctx.bezierCurveTo(0.06, -0.13, 0.12, -0.07, 0.12, 0);
    ctx.bezierCurveTo(0.12, 0.07, 0.06, 0.13, -0.06, 0.12); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.22), 0.95); ctx.fill();
    fillIn(ctx, H.bodyGrad(ctx, H.mixRGB(c.body, [90, 20, 30], 0.3), 1), 0.02, 0, 0.12, 0.13);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lwb(1.1); ctx.stroke();
    if (ek > 0.6) { ctx.beginPath(); ctx.ellipse(0.1, 0, 0.018, 0.012 + 0.04 * (ek - 0.6) / 0.4, 0, 0, TAU); ctx.fillStyle = 'rgba(70,15,25,0.8)'; ctx.fill(); }
    ctx.restore();
    // feathery scarlet gills: 4 pairs on the first segments — bundled forward in the tube, fanned out when out
    const np = hd ? 18 : 9;
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (let j = 0; j < 4; j++) {
        const p = wAt(0.07 + j * 0.065), x = p.x, y = p.y, a0 = p.a;
        for (const sg of SIDES) {
          const bx = x + p.nx * sg * 0.07, by = y + p.ny * sg * 0.07;
          const a = a0 + sg * (lerp(0.08 + j * 0.06, 0.92 + j * 0.34, open) + 0.08 * sin(t * 2.1 + j + sg));
          const curl = sg * lerp(0.08, 0.42, open), L = (0.44 - j * 0.025) * lerp(0.95, 0.86, open);
          const cx = bx + cos(a) * L * 0.55, cy = by + sin(a) * L * 0.55;
          const tx = bx + cos(a + curl) * L, ty = by + sin(a + curl) * L;
          if (pass) { ctx.moveTo(bx, by); ctx.quadraticCurveTo(cx, cy, tx, ty); continue; }
          for (let m = 1; m <= np; m++) {
            const u = m / (np + 1), iu = 1 - u;
            const px = iu * iu * bx + 2 * iu * u * cx + u * u * tx, py = iu * iu * by + 2 * iu * u * cy + u * u * ty;
            let dx = 2 * iu * (cx - bx) + 2 * u * (tx - cx), dy = 2 * iu * (cy - by) + 2 * u * (ty - cy);
            const dl = hypot(dx, dy) || 1; dx /= dl; dy /= dl;
            const pl = 0.11 * (1 - u * 0.5) * lerp(0.55, 1, open), wv = 0.15 * sin(t * 3 + m * 0.7 + j);
            for (const q of SIDES) { ctx.moveTo(px, py); ctx.lineTo(px + (dx * (0.5 + wv) - q * dy) * pl, py + (dy * (0.5 + wv) + q * dx) * pl); }
          }
        }
      }
      if (pass) { ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, [90, 0, 20], 0.45), 1); ctx.lineWidth = lwb(hd ? 2.6 : 2); ctx.stroke(); }
      else {
        ctx.strokeStyle = H.rgbStr(c.nuc, 0.95); ctx.lineWidth = lw(hd ? 1.6 : 1.2); ctx.stroke();
        if (hd) {
          const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = H.rgbStr([255, 110, 90], 0.22); ctx.lineWidth = lw(1); ctx.stroke();
          ctx.globalCompositeOperation = op;
        }
      }
    }
    hl(ctx, H, e, W_XH, hy, 0.22);
    // inside the tube it is dark
    ctx.beginPath(); ctx.ellipse(T_MX, 0, T_RXO, T_RYO, 0, PI / 2, PI * 1.5); ctx.closePath();
    ctx.fillStyle = 'rgba(10,5,8,0.55)'; ctx.fill();
    ctx.restore();
    // near half of the tube's lip passes in front of the worm
    ctx.beginPath(); ctx.ellipse(T_MX, 0, T_RXO * 1.12, T_RYO * 1.1, 0, -PI / 2, PI / 2);
    ctx.strokeStyle = H.rgbStr(TUBE_LIP, 0.9); ctx.lineWidth = lwb(hd ? 3.4 : 2.6); ctx.stroke();
    ctx.restore();
  },
};

export default { copepod, arrowworm, combjelly, ostracod, beroe, pompeii };
