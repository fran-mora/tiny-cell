// Creature art for the t6 tier: pufferfish scale (0.5 – 3 m): reef, wreck and cold-upwelling animals.
// Each entry: { name, col, portraitR, states, draw(ctx, e, t, s, H, opts) } — see README.md.
// Like t5, every animal is seen from above: +x = heading and the body is mirror-symmetric about the x axis (the
// urchin is radial), so it reads at any rotation. Mouths open in the picture plane (the jaws part sideways / the
// lower jaw swings forward) so a bite reads from above.
// Preview-only extras: `e.view = [k, dx]` zooms the drawing out by k and pans it by dx units (dev gallery tiles);
// grouper `e.withWreck` draws its wreck lair underneath.

const TAU = Math.PI * 2;
const { sin, cos, min, max, abs, sqrt, PI, atan2, floor, round, exp } = Math;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const sstep = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const fract = (v) => v - floor(v);
const hash = (i) => fract(sin(i * 127.1 + 311.7) * 43758.5453);
const WHITE = [255, 255, 255];
const INK = [20, 12, 28];
const SHADE = [3, 4, 9];
const C1 = [0, 0, 0], C2 = [0, 0, 0], C3 = [0, 0, 0], C4 = [0, 0, 0]; // scratch colours for mixRGB
// constant tables hoisted out of the draw calls (no per-frame allocation)
const BEAK_ROWS_HD = [0.45, 0.62, 0.8], BEAK_ROWS = [0.55, 0.8];
const FAN_BANDS_HD = [[0.12, 0.2], [0.29, 0.38], [0.47, 0.55], [0.62, 0.68]], FAN_BANDS = [[0.15, 0.26], [0.36, 0.47], [0.56, 0.66]];
const SPINE_BANDS = [[0.22, 0.36], [0.52, 0.66], [0.82, 0.93]];
const SCUTES = [[0.43, 0], [0.17, 0], [-0.09, 0], [-0.345, 0], [-0.585, 0], [0.3, 0.38], [0.04, 0.44], [-0.22, 0.43], [-0.47, 0.34], [0.3, -0.38], [0.04, -0.44], [-0.22, -0.43], [-0.47, -0.34]];
const CLUB_ROWS_HD = [-1, 1], CLUB_ROWS = [0];
const GR_BARS = [0.3, 0.44, 0.57, 0.7, 0.83];
const WK_SEAMS = [-0.95, -0.48, 0, 0.48, 0.95], WK_BOLLARDS = [[-0.4, -1.1], [-0.2, -1.1], [0.9, 1.1], [1.1, 1.1], [-2.7, 1.05]], WK_FANS = [[-3.0, 0.05, PI], [1.6, 1.45, PI / 2]];
const UR_FEET = new Float32Array(30);

// ---------------------------------------------------------------- shared helpers (same as t5)
// additive glow from the cached sprite (alpha a, radius r, ky squashes it vertically)
function glow(ctx, H, rgb, x, y, r, a, hard = 0, ky = 1) {
  if (!(a > 0.004) || r <= 0) return;
  const A = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = A * min(1, a);
  ctx.drawImage(H.glowSprite(rgb, hard), x - r, y - r * ky, r * 2, r * 2 * ky);
  ctx.globalAlpha = A; ctx.globalCompositeOperation = op;
}
// soft dark smudge (ink, shadow): the same cached sprite drawn normally
function smudge(ctx, H, rgb, x, y, rx, ry, a) {
  if (!(a > 0.004)) return;
  const A = ctx.globalAlpha;
  ctx.globalAlpha = A * min(1, a);
  ctx.drawImage(H.glowSprite(rgb), x - rx, y - ry, rx * 2, ry * 2);
  ctx.globalAlpha = A;
}
// fill the current path with the cached body gradient mapped onto an ellipse
function gfill(ctx, H, rgb, a, cx, cy, rx, ry) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(rx, ry); ctx.fillStyle = H.bodyGrad(ctx, rgb, a); ctx.fill(); ctx.restore();
}
// a few gradients the H helpers do not cover (rust, the hatch's dark), cached per context like art.js does
const GC = new WeakMap();
function cgrad(ctx, key, make) {
  let m = GC.get(ctx); if (!m) { m = new Map(); GC.set(ctx, m); }
  let g = m.get(key); if (!g) { g = make(ctx); m.set(key, g); }
  return g;
}
// world-fixed specular highlight over (x, 0), size k
function shine(ctx, H, e, x, k) { ctx.save(); ctx.translate(x, 0); ctx.scale(k, k); H.highlight(ctx, e.ang || 0); ctx.restore(); }
// helpers for a sub-drawing scaled by k (line widths stay in device pixels)
function subH(H, k, hd = H.hd) {
  const lw0 = H.lw, lb0 = H.lwb || H.lw;
  return { ...H, lw: (px) => lw0(px) / k, lwb: (px) => lb0(px) / k, hd };
}
function circ(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }

// Phase integrated over time, so a changing rate (sprinting, dazed) never makes a fin or tail jump. Two slots
// (tail beat, fins). Stateless callers (portraits, frozen objects) get exactly t·f.
function phaseOf(e, t, f, slot = 0) {
  if (!Object.isExtensible(e)) return t * f;
  const kt = slot ? '_t6t1' : '_t6t0', kp = slot ? '_t6p1' : '_t6p0';
  const dt = t - e[kt];
  if (dt >= 0 && dt < 0.25) e[kp] += dt * f; else e[kp] = t * f;
  e[kt] = t;
  return e[kp];
}

// ---- swimming centre line: integrated from the snout backwards (heading PI + travelling wave)
const NS = 64;
const SX = new Float32Array(NS + 1), SY = new Float32Array(NS + 1), SA = new Float32Array(NS + 1), SW = new Float32Array(NS + 1);
let SN = 1;
function spine(n, x0, len, wfn, amp, k, ph, pw, bend = 0) {
  SN = n; const ds = len / n; let x = x0, y = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = PI + bend * u + amp * u ** pw * sin(ph - k * u);
    SX[i] = x; SY[i] = y; SA[i] = a; SW[i] = wfn(u);
    x += cos(a) * ds; y += sin(a) * ds;
  }
}
const P = [0, 0];
// point at spine parameter u (0 = snout, 1 = tail root), f = −1..1 across the body (+1 = the +y flank)
function sp(u, f) {
  const fi = u * SN, i = min(SN - 1, max(0, floor(fi))), r = fi - i;
  const x = SX[i] + (SX[i + 1] - SX[i]) * r, y = SY[i] + (SY[i + 1] - SY[i]) * r;
  const a = SA[i] + (SA[i + 1] - SA[i]) * r, w = (SW[i] + (SW[i + 1] - SW[i]) * r) * f;
  P[0] = x + sin(a) * w; P[1] = y - cos(a) * w;
  return P;
}
// body heading at u (0 = straight ahead)
function spA(u) { const i = min(SN, max(0, round(u * SN))); return SA[i] - PI; }
// body half-width at u
function spW(u) { return SW[min(SN, max(0, round(u * SN)))]; }
const OX = new Float32Array(4 * NS + 24), OY = new Float32Array(4 * NS + 24);
function smooth(ctx, m) {
  ctx.beginPath(); ctx.moveTo((OX[m - 1] + OX[0]) / 2, (OY[m - 1] + OY[0]) / 2);
  for (let i = 0; i < m; i++) { const j = i + 1 < m ? i + 1 : 0; ctx.quadraticCurveTo(OX[i], OY[i], (OX[i] + OX[j]) / 2, (OY[i] + OY[j]) / 2); }
  ctx.closePath();
}
// closed body outline around the spine (cap = rounded snout ahead of point `from`, ws = width scale)
function outline(ctx, cap = 0, ws = 1, from = 0, to = SN) {
  let m = 0;
  if (cap) { OX[m] = SX[from] - cos(SA[from]) * cap; OY[m] = SY[from] - sin(SA[from]) * cap; m++; }
  for (let i = from; i <= to; i++) { const a = SA[i], w = SW[i] * ws; OX[m] = SX[i] - sin(a) * w; OY[m] = SY[i] + cos(a) * w; m++; }
  for (let i = to; i >= from; i--) { const a = SA[i], w = SW[i] * ws; OX[m] = SX[i] + sin(a) * w; OY[m] = SY[i] - cos(a) * w; m++; }
  smooth(ctx, m);
}
// a ribbon along the midline from u0 to u1 that leans sideways (a dorsal fin seen from above)
function midRibbon(ctx, u0, u1, nseg, leanFn) {
  ctx.beginPath();
  for (let i = 0; i <= nseg; i++) {
    const u = u0 + (u1 - u0) * (i / nseg); sp(u, 0); const a = spA(u), l = leanFn(i / nseg);
    const x = P[0] - sin(a) * l, y = P[1] + cos(a) * l; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
}
// cheap tail triangle for LOD silhouettes (adds to the current path)
function tailTri(ctx, tx, ty, ta, L, sp0, notch) {
  ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - sp0) * L, ty + sin(ta - sp0) * L);
  ctx.lineTo(tx + cos(ta) * notch, ty + sin(ta) * notch); ctx.lineTo(tx + cos(ta + sp0) * L, ty + sin(ta + sp0) * L); ctx.closePath();
}

// ---- fins & eyes (same construction as the player's fish)
// translucent ray fin rooted at (x, y) pointing along a; side mirrors it so the leading edge faces forward
function fin(ctx, x, y, a, side, len, wid, fill, edge, ray, lwE, lwR, rays) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -wid * 0.4);
  ctx.bezierCurveTo(len * 0.3, -wid * 1.1, len * 0.85, -wid * 0.95, len, -wid * 0.1);
  ctx.bezierCurveTo(len * 0.95, wid * 0.5, len * 0.45, wid * 0.8, 0, wid * 0.4);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = lwE; ctx.stroke(); }
  if (rays) {
    ctx.beginPath();
    for (let k = 1; k <= rays; k++) { const u = k / (rays + 1); ctx.moveTo(0, (u - 0.5) * wid * 0.6); ctx.lineTo(len * (0.62 + 0.3 * sin(u * PI)), (u - 0.62) * wid * 1.5); }
    ctx.strokeStyle = ray; ctx.lineWidth = lwR; ctx.stroke();
  }
  ctx.restore();
}
// caudal fin rooted at (x, y), local +x pointing away from the body along a. nk = notch depth (0.45 deep fork,
// 1 truncate, >1 rounded fan), f = flex of the lobes
function tailPath(ctx, L, W, r0, f, nk) {
  const cn = nk < 1 ? nk + 0.14 : nk + 0.08;
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L * 0.42, -W * 0.5, L, -W * 0.62 + f);
  ctx.quadraticCurveTo(L * cn, -W * 0.16 + f * 0.6, L * nk, f * 0.5);
  ctx.quadraticCurveTo(L * cn, W * 0.16 + f * 0.6, L, W * 0.62 + f);
  ctx.quadraticCurveTo(L * 0.42, W * 0.5, 0, r0);
  ctx.closePath();
}
function tailFin(ctx, x, y, a, L, W, r0, f, nk, fill, edge, ray, lwE, lwR, rays) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  tailPath(ctx, L, W, r0, f, nk);
  ctx.fillStyle = fill; ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = lwE; ctx.stroke(); }
  if (rays) {
    ctx.beginPath();
    for (let k = -rays; k <= rays; k++) {
      const v = k / rays, av = abs(v), ex = L * (nk + (1 - nk) * av) * 0.93, ey = v * W * 0.58 + f * (0.5 + 0.5 * av);
      ctx.moveTo(0.02, v * r0 * 0.7); ctx.quadraticCurveTo(ex * 0.5, v * W * 0.32 + f * 0.2, ex, ey);
    }
    ctx.strokeStyle = ray; ctx.lineWidth = lwR; ctx.stroke();
  }
  ctx.restore();
}
function eye(ctx, x, y, r, iris, lwO, pk = 0.64, pupil = '#04060c', px = 0.14, py = 0) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = iris; ctx.fill();
  ctx.strokeStyle = 'rgba(8,16,26,0.75)'; ctx.lineWidth = lwO; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * px, y + r * py, r * pk, 0, TAU); ctx.fillStyle = pupil; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.08, y - r * 0.3, r * 0.26, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.3, r * 0.11, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
}
// a thin needle tooth from base (bx, by) to tip (tx, ty), half-width bw at the base (adds to the current path)
function tooth(ctx, bx, by, tx, ty, bw) {
  const dx = tx - bx, dy = ty - by, l = Math.hypot(dx, dy) || 1, px = -dy / l * bw, py = dx / l * bw;
  ctx.moveTo(bx + px, by + py); ctx.quadraticCurveTo(bx + dx * 0.55 + px * 0.4, by + dy * 0.55 + py * 0.4, tx, ty); ctx.lineTo(bx - px, by - py);
}
// a tapered tube (arm, tentacle) around the centre line held in B (segs + 1 points), into the current path
const AB = new Float32Array(32 * 2);
function tube(ctx, B, segs, w0, wt = 0.004, pw = 0.85) {
  for (let k = 0; k <= segs; k++) {
    const i = min(k, segs - 1), dx = B[i * 2 + 2] - B[i * 2], dy = B[i * 2 + 3] - B[i * 2 + 1], l = Math.hypot(dx, dy) || 1;
    const w = w0 * (1 - k / segs) ** pw + wt;
    const px = -dy / l * w, py = dx / l * w;
    k ? ctx.lineTo(B[k * 2] + px, B[k * 2 + 1] + py) : ctx.moveTo(B[0] + px, B[1] + py);
  }
  for (let k = segs; k >= 0; k--) {
    const i = min(k, segs - 1), dx = B[i * 2 + 2] - B[i * 2], dy = B[i * 2 + 3] - B[i * 2 + 1], l = Math.hypot(dx, dy) || 1;
    const w = w0 * (1 - k / segs) ** pw + wt;
    ctx.lineTo(B[k * 2] + dy / l * w, B[k * 2 + 1] - dx / l * w);
  }
  ctx.closePath();
}
// one squid-style limb: centre line into AB, then the tube
function limb(ctx, x, y, a, len, w0, segs, t, j, curl, wig) {
  const ds = len / segs;
  AB[0] = x; AB[1] = y;
  for (let k = 1; k <= segs; k++) {
    a += wig * sin(t * 1.8 + j * 1.1 + k * 0.7) + curl * (k / segs);
    x += cos(a) * ds; y += sin(a) * ds; AB[k * 2] = x; AB[k * 2 + 1] = y;
  }
  tube(ctx, AB, segs, w0);
}
const SEPIA = [104, 74, 100];
// ink cloud billowing behind the animal, starting at x0
function inkCloud(ctx, H, t, k, x0 = -1.05) {
  const np = H.lod ? 3 : 8;
  for (let pass = 0; pass < (H.lod ? 1 : 2); pass++) {
    for (let i = 0; i < np; i++) {
      const u = i / (np - 1);
      const x = x0 - (0.25 + 2.0 * u) * (0.55 + 0.45 * k) - 0.1 * sin(t * 0.7 + i);
      const y = (0.1 + 0.55 * u) * sin(i * 2.3 + t * 0.5) * k;
      const r = (0.38 + 0.6 * u) * (0.45 + 0.55 * k) + 0.06 * sin(t * 1.3 + i * 1.7);
      if (pass === 0) smudge(ctx, H, SEPIA, x, y, r * 1.35, r * 1.2 * (0.85 + 0.15 * sin(i * 1.9)), k * (0.9 - 0.35 * u));
      else smudge(ctx, H, INK, x + 0.05, y, r * 0.75, r * 0.65, k * (1 - 0.45 * u));
    }
  }
  if (!H.lod) smudge(ctx, H, [8, 4, 12], x0 - 0.25 - 0.3 * k, 0, 0.42 * k + 0.1, 0.3 * k + 0.08, k);
}
// rotate (x, y) about (cx, cy) by a → P
function rot(x, y, cx, cy, a) { const c = cos(a), s = sin(a), dx = x - cx, dy = y - cy; P[0] = cx + dx * c - dy * s; P[1] = cy + dx * s + dy * c; return P; }
// motion streaks behind a sprinting body
function streaks(ctx, H, c, t, k, x0, spanY) {
  ctx.beginPath();
  for (let j = 0; j < 9; j++) {
    if (j === 4) continue;
    const y = (j - 4) * spanY * (1 + 0.3 * abs(j - 4) / 4), f = fract(t * 2.4 + hash(j + 1) * 3), xa = x0 - abs(j - 4) * 0.25 - f * 2.4, len = (0.45 + 0.4 * hash(j + 7)) * (1 - f * 0.5);
    ctx.moveTo(xa, y); ctx.lineTo(xa - len, y);
  }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.45 * k); ctx.lineWidth = H.lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
}

// =================================================================================================== parrotfish
const PARROT_W = (u) => (u < 0.32 ? 0.16 + 0.31 * sin((u / 0.32) * PI / 2) ** 0.8 : 0.11 + 0.36 * (1 - ((u - 0.32) / 0.68) ** 1.7));
const BEAK = [176, 236, 226], BEAK_E = 'rgba(30,110,104,0.9)', CRUMB = [255, 238, 230], REEF_DEEP = [8, 40, 70];
function drawParrot(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const bite = clamp01(e.biteK || 0);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 5 * (1 + st * 3));
  const n = H.lod ? 8 : 22;
  spine(n, 0.88 + 0.06 * bite, 1.7, PARROT_W, 0.12 + st * 0.35, 4.2, ph, 2.2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.07 * sin(ph - 5.2);
  if (H.lod) { outline(ctx, 0.14); tailTri(ctx, tx, ty, ta, 0.6, 0.6, 0.36); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return; }
  const finF = H.rgbStr(c.body, 0.45), finE = H.rgbStr(c.nuc, 0.9), finR = H.rgbStr(c.mem, 0.4);
  // lunate tail with streaming lobe tips (a terminal-phase male), edged pink
  tailFin(ctx, tx, ty, ta, 0.62, 0.86, 0.08, flex, 0.56, finF, finE, finR, lb(1.6), lw(0.8), hd ? 5 : 3);
  for (const sd of [-1, 1]) { sp(0.44, sd * 0.7); fin(ctx, P[0], P[1], spA(0.44) + sd * (PI / 2 + 1.15), sd, 0.2, 0.08, finF, finE, finR, lw(1), lw(0.6), 0); }
  // big pectorals: parrotfish row with them (labriform swimming)
  for (const sd of [-1, 1]) {
    const row = sin(t * 3.3 + (sd > 0 ? 0 : 0.7));
    sp(0.33, sd * 0.88);
    fin(ctx, P[0], P[1], spA(0.34) + sd * (PI / 2 + 1.25 + 0.3 * row), sd, 0.56, 0.25, H.rgbStr(c.body, 0.55), finE, finR, lb(1.3), lw(0.7), hd ? 6 : 4);
  }
  // body
  outline(ctx, 0.13);
  ctx.fillStyle = H.rgbStr(c.body, 0.74); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 0.95, 0.46);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.95); ctx.lineWidth = lb(1.5); ctx.stroke();
  outline(ctx, 0.05, 0.55, 2, n - 3);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, REEF_DEEP, 0.4, C1), 0.45); ctx.fill();
  // big scales, each edged pink/orange (free edge facing the tail)
  {
    const cols = hd ? 11 : 7, rows = hd ? 6 : 4;
    ctx.beginPath();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const u = 0.3 + (i + (j & 1) * 0.5) * (0.6 / cols), f = (((j + 0.5) / rows) * 2 - 1) * 0.8;
      sp(u, f); const r = spW(u) * (hd ? 0.16 : 0.21);
      ctx.moveTo(P[0] + r * 0.25, P[1] - r); ctx.quadraticCurveTo(P[0] - r * 1.1, P[1], P[0] + r * 0.25, P[1] + r);
    }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.62); ctx.lineWidth = lw(hd ? 1.2 : 1.1); ctx.stroke();
  }
  // gill cover
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.29, sd * 0.97); const x0 = P[0], y0 = P[1]; sp(0.26, sd * 0.5); const cx = P[0], cy = P[1]; sp(0.2, sd * 0.22); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(1.1); ctx.stroke();
  // face paint: pink-orange bands from the beak round the eye
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    sp(0.03, sd * 0.62); ctx.moveTo(P[0], P[1]); sp(0.1, sd * 0.88); const ax = P[0], ay = P[1]; sp(0.2, sd * 0.86); ctx.quadraticCurveTo(ax, ay, P[0], P[1]);
    sp(0.05, sd * 0.3); ctx.moveTo(P[0], P[1]); sp(0.12, sd * 0.36); const bx = P[0], by = P[1]; sp(0.24, sd * 0.42); ctx.quadraticCurveTo(bx, by, P[0], P[1]);
  }
  ctx.lineCap = 'round'; ctx.strokeStyle = H.rgbStr(c.nuc, 0.82); ctx.lineWidth = 0.032; ctx.stroke();
  // dorsal fin: a long pink-edged ribbon down the back
  midRibbon(ctx, 0.25, 0.86, 10, (v) => 0.03 * sin(ph * 0.5 - v * 5));
  ctx.strokeStyle = H.rgbStr(c.mem, 0.3); ctx.lineWidth = 0.075; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.75); ctx.lineWidth = lw(1.3); ctx.stroke();
  // the beak: fused teeth plates; they part sideways and snap shut (crunch)
  const bx = SX[0] - 0.12, bry = 0.17, brx = 0.3, th = 0.62 * bite;
  if (bite > 0.02) {
    ctx.beginPath(); ctx.ellipse(bx + 0.13, 0, 0.1 + 0.07 * bite, 0.03 + 0.15 * bite, 0, 0, TAU);
    ctx.fillStyle = 'rgb(70,18,34)'; ctx.fill();
  }
  for (const sd of [-1, 1]) {
    ctx.save(); ctx.translate(bx, sd * bry); ctx.rotate(sd * th); ctx.translate(-bx, -sd * bry);
    const a0 = sd > 0 ? 0 : -PI / 2, a1 = sd > 0 ? PI / 2 : 0;
    // lips
    ctx.beginPath(); ctx.moveTo(bx - 0.02, sd * 0.004); ctx.ellipse(bx - 0.02, 0, brx + 0.045, bry + 0.04, 0, a0, a1); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.nuc, 0.85); ctx.fill();
    // beak plate
    ctx.beginPath(); ctx.moveTo(bx, sd * 0.004); ctx.ellipse(bx, 0, brx, bry, 0, a0, a1); ctx.closePath();
    ctx.fillStyle = H.rgbStr(BEAK, 0.97); ctx.fill(); ctx.strokeStyle = BEAK_E; ctx.lineWidth = lw(1.1); ctx.stroke();
    // rows of fused teeth (a mosaic)
    ctx.beginPath();
    for (const k of hd ? BEAK_ROWS_HD : BEAK_ROWS) { ctx.moveTo(bx + brx * k * cos(a0 + 0.12), bry * k * sin(a0 + 0.12)); ctx.ellipse(bx, 0, brx * k, bry * k, 0, a0 + 0.12, a1 - 0.12); }
    ctx.strokeStyle = 'rgba(40,130,120,0.42)'; ctx.lineWidth = lw(0.9); ctx.stroke();
    ctx.restore();
  }
  // coral crumbs flying off the crunch
  if (bite > 0.15) {
    ctx.beginPath();
    for (let i = 0; i < (hd ? 9 : 5); i++) {
      const f = fract(t * 1.6 + hash(i + 3)), a = (hash(i + 9) - 0.5) * 2.4, d = 0.12 + f * 0.6;
      circ(ctx, SX[0] + 0.15 + cos(a) * d, sin(a) * d, (0.02 + 0.022 * hash(i + 1)) * (1 - f * 0.6));
    }
    ctx.fillStyle = H.rgbStr(CRUMB, 0.9 * (bite - 0.15) / 0.85); ctx.fill();
  }
  for (const sd of [-1, 1]) { sp(0.19, sd * 0.6); eye(ctx, P[0], P[1], 0.088, 'rgb(255,196,96)', lw(1), 0.6); }
  shine(ctx, H, e, 0.2, 0.7);
}

// =================================================================================================== sea urchin
const UR_TR = 0.5, UR_LS = 1.22, UR_A0 = 0.31;
const UR_ORANGE = [255, 146, 54], UR_BLUE = [96, 186, 255], UR_GONAD = [250, 140, 50];
const BX = new Float32Array(80), BY = new Float32Array(80);
function urTestPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU, rr = r * (1 + 0.035 * cos(5 * (a - UR_A0))); i ? ctx.lineTo(cos(a) * rr, sin(a) * rr) : ctx.moveTo(rr, 0); }
  ctx.closePath();
}
// one layer of spines: layer 0 = lower hemisphere (drawn under the test), 1 = upper (over it)
function urSpines(ctx, H, c, t, k, live, layer, N, crack, rin) {
  ctx.beginPath();
  let nb = 0;
  for (let i = 0; i < N; i++) {
    const h = layer * 97.3 + i * 1.618;
    let a = ((i + 0.6 * hash(h + 0.3)) / N) * TAU + layer * 0.21;
    const el = layer ? 1.22 * hash(h + 7.7) ** 0.75 : 0.6 * hash(h + 7.7); // elevation: high spines look short from above
    const ce = cos(el);
    const sk = clamp01((0.15 + 0.85 * hash(h * 3.7 + 1.3) - k) * 6); // 1 = snapped off
    const L = UR_LS * (0.72 + 0.28 * hash(h + 2.2)) * (1 - sk * (0.84 - 0.16 * hash(h + 5.1))) * ce;
    a += live * (0.05 * sin(t * 0.9 - a * 2) + 0.025 * sin(t * 1.7 + i));
    const rb = layer ? UR_TR * ce * 0.97 : UR_TR * 0.84;
    if (layer && crack > 0 && rb < rin) continue;
    let ox = 0, oy = 0;
    if (layer && crack > 0) { const j = round((a - UR_A0) / (TAU / 5)), am = UR_A0 + j * (TAU / 5); ox = cos(am) * 0.07 * crack; oy = sin(am) * 0.07 * crack; }
    const ca = cos(a), sa = sin(a), x0 = ox + ca * rb, y0 = oy + sa * rb, x1 = x0 + ca * L, y1 = y0 + sa * L;
    const bw = 0.022, tw = 0.014 * sk;
    ctx.moveTo(x0 - sa * bw, y0 + ca * bw); ctx.lineTo(x1 - sa * tw, y1 + ca * tw); ctx.lineTo(x1 + sa * tw, y1 - ca * tw); ctx.lineTo(x0 + sa * bw, y0 - ca * bw); ctx.closePath();
    if (sk > 0.5 && nb < 80) { BX[nb] = x1; BY[nb] = y1; nb++; }
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.97); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, layer ? 0.34 : 0.24); ctx.lineWidth = H.lw(0.7); ctx.stroke();
  if (nb) { ctx.beginPath(); for (let i = 0; i < nb; i++) circ(ctx, BX[i], BY[i], 0.018); ctx.fillStyle = H.rgbStr(c.mem, 0.75); ctx.fill(); }
}
function drawUrchin(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = e.armorMax ? clamp01(e.armor / e.armorMax) : 1;
  const crack = clamp01((0.3 - k) / 0.3), live = 1 - crack, cl = clamp01((0.6 - k) / 0.3) * (1 - crack);
  if (H.lod) {
    ctx.beginPath();
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU + 0.2, L = (UR_TR + UR_LS * (0.5 + 0.5 * hash(i))) * (k > hash(i * 3.7 + 1) ? 1 : 0.4); ctx.moveTo(cos(a) * 0.3, sin(a) * 0.3); ctx.lineTo(cos(a) * L, sin(a) * L); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.95); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, UR_TR, 0, TAU); ctx.fillStyle = H.cstr(crack > 0.5 ? UR_GONAD : c.body); ctx.fill();
    return;
  }
  smudge(ctx, H, SHADE, 0.05, 0.07, 1.0, 1.0, 0.4);
  urSpines(ctx, H, c, t, k, live, 0, hd ? 40 : 26, crack, 0);
  // tube feet: five rows of sticky little feet poking out round the rim
  {
    ctx.beginPath();
    let ne = 0;
    for (let j = 0; j < 5; j++) for (let m = 0; m < 3; m++) {
      const a = UR_A0 + j * (TAU / 5) + (m - 1) * 0.1, l = UR_TR + (0.1 + 0.09 * (0.5 + 0.5 * sin(t * 1.8 + j * 1.3 + m))) * (0.4 + 0.6 * live);
      const w = 0.04 * sin(t * 2.3 + j + m * 2) * live, ex = cos(a) * l - sin(a) * w, ey = sin(a) * l + cos(a) * w;
      ctx.moveTo(cos(a) * UR_TR * 0.95, sin(a) * UR_TR * 0.95); ctx.quadraticCurveTo(cos(a) * (l - 0.05), sin(a) * (l - 0.05), ex, ey);
      UR_FEET[ne++] = ex; UR_FEET[ne++] = ey;
    }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(1.1); ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < ne; i += 2) circ(ctx, UR_FEET[i], UR_FEET[i + 1], 0.016);
    ctx.fillStyle = H.rgbStr(c.mem, 0.75); ctx.fill();
  }
  const rin = UR_TR * 0.72 * sqrt(crack);
  if (crack <= 0.001) {
    urTestPath(ctx, UR_TR);
    ctx.fillStyle = H.rgbStr(c.nuc, 0.95); ctx.fill();
    gfill(ctx, H, c.body, 1, 0, 0, UR_TR, UR_TR);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lb(1.2); ctx.stroke();
  } else {
    // cracked open: the soft orange roe (gonads) in a dark cavity, the shell broken into five plates
    ctx.beginPath(); ctx.arc(0, 0, UR_TR * 0.95, 0, TAU); ctx.fillStyle = 'rgb(54,20,24)'; ctx.fill();
    for (let j = 0; j < 5; j++) {
      const a = UR_A0 + (j + 0.5) * (TAU / 5), r = 0.17 + 0.03 * crack;
      ctx.save(); ctx.translate(cos(a) * r, sin(a) * r); ctx.rotate(a); ctx.scale(0.17 + 0.02 * sin(t * 0.8 + j), 0.1);
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fillStyle = H.nucGrad(ctx, UR_GONAD); ctx.fill(); ctx.restore();
    }
    if (hd) { // Aristotle's lantern: the five jaws, glimpsed in the middle
      ctx.beginPath(); for (let j = 0; j < 5; j++) { const a = UR_A0 + j * (TAU / 5); ctx.moveTo(0, 0); ctx.lineTo(cos(a) * 0.09, sin(a) * 0.09); }
      ctx.strokeStyle = 'rgba(250,240,225,0.85)'; ctx.lineWidth = lw(2); ctx.stroke();
    }
    glow(ctx, H, UR_GONAD, 0, 0, 0.5, 0.25 * crack);
    for (let j = 0; j < 5; j++) {
      const am = UR_A0 + j * (TAU / 5), ox = cos(am) * 0.07 * crack, oy = sin(am) * 0.07 * crack, a0 = am - PI / 5 + 0.03, a1 = am + PI / 5 - 0.03;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * (i / 8), rr = UR_TR * (1 + 0.035 * cos(5 * (a - UR_A0))); i ? ctx.lineTo(ox + cos(a) * rr, oy + sin(a) * rr) : ctx.moveTo(ox + cos(a) * rr, oy + sin(a) * rr); }
      for (let i = 6; i >= 0; i--) { const a = a0 + (a1 - a0) * (i / 6), rr = rin * (1 + 0.45 * (hash(j * 9 + i) - 0.5)); ctx.lineTo(ox + cos(a) * rr, oy + sin(a) * rr); }
      ctx.closePath();
      ctx.fillStyle = H.rgbStr(c.nuc, 0.96); ctx.fill();
      ctx.save(); ctx.translate(ox, oy); ctx.scale(UR_TR, UR_TR); ctx.fillStyle = H.bodyGrad(ctx, c.body, 1); ctx.fill(); ctx.restore();
      ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lb(1.1); ctx.stroke();
    }
  }
  // the five ambulacra: double rows of iridescent blue dots
  {
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const am = UR_A0 + j * (TAU / 5), ox = cos(am) * 0.07 * crack, oy = sin(am) * 0.07 * crack;
      for (const sd of [-1, 1]) for (let i = 0; i < (hd ? 7 : 4); i++) {
        const r = 0.13 + i * (hd ? 0.05 : 0.085); if (crack > 0 && r < rin + 0.03) continue;
        const a = am + sd * (0.12 - 0.06 * (r / UR_TR)); circ(ctx, ox + cos(a) * r, oy + sin(a) * r, hd ? 0.016 : 0.022);
      }
    }
    ctx.fillStyle = H.rgbStr(UR_BLUE, 0.85); ctx.fill();
  }
  const pa = clamp01(1 - crack * 5);
  if (pa > 0.01) {
    // the anal cone on top, ringed bright orange (it goes when the shell breaks)
    ctx.beginPath(); ctx.arc(0, 0, 0.085, 0, TAU); ctx.strokeStyle = H.rgbStr(UR_ORANGE, 0.95 * pa); ctx.lineWidth = 0.034; ctx.stroke();
    ctx.beginPath(); ctx.arc(0.008, -0.008, 0.045, 0, TAU); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, WHITE, 0.25, C1), 0.9 * pa); ctx.fill();
    glow(ctx, H, UR_ORANGE, 0, 0, 0.22, 0.3 * pa);
    if (hd && crack <= 0.001) { // five white spots between the ambulacra (Diadema setosum)
      ctx.beginPath(); for (let j = 0; j < 5; j++) { const a = UR_A0 + (j + 0.5) * (TAU / 5); circ(ctx, cos(a) * 0.26, sin(a) * 0.26, 0.02); }
      ctx.fillStyle = 'rgba(245,245,255,0.8)'; ctx.fill();
    }
  }
  // hairline cracks once most spines are gone
  if (cl > 0.01) {
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const a = UR_A0 + (j + 0.5) * (TAU / 5); let r = 0.12, x = cos(a) * r, y = sin(a) * r; ctx.moveTo(x, y);
      for (let i = 1; i <= 4; i++) { r = 0.12 + (UR_TR * 0.95 - 0.12) * (i / 4) * cl; const aa = a + (hash(j * 5 + i) - 0.5) * 0.35; ctx.lineTo(cos(aa) * r, sin(aa) * r); }
    }
    ctx.strokeStyle = 'rgba(8,2,12,0.85)'; ctx.lineWidth = lw(1.4); ctx.stroke();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.35); ctx.lineWidth = lw(0.6); ctx.stroke();
  }
  urSpines(ctx, H, c, t, k, live, 1, hd ? 58 : 36, crack, rin);
  shine(ctx, H, e, 0, 0.55);
}

// =================================================================================================== triggerfish
const TRIG_W = (u) => (u < 0.44 ? 0.13 + 0.46 * (1 - (1 - u / 0.44) ** 1.3) : 0.1 + 0.49 * (1 - ((u - 0.44) / 0.56) ** 1.1));
const TRIG_ACC = [246, 156, 60];
function drawTrigger(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const bite = clamp01(e.biteK || 0), st = (e.stretch || 0) + 0.05 * bite;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  if (bite) ctx.translate(0.1 * bite, 0);
  const ph = phaseOf(e, t, 3 + 4 * bite);
  const n = H.lod ? 8 : 22;
  spine(n, 0.98, 1.8, TRIG_W, 0.07 + st * 0.3, 3.4, ph, 2.6);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.06 * sin(ph - 4.5);
  if (H.lod) { outline(ctx, 0.05); tailTri(ctx, tx, ty, ta, 0.45, 0.75, 0.3); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return; }
  const finC = H.mixRGB(c.body, TRIG_ACC, 0.35, C1), finF = H.rgbStr(finC, 0.55), finE = H.rgbStr(c.nuc, 0.85), finR = H.rgbStr(c.nuc, 0.3);
  // lyre tail with long lobe tips, dark-edged
  tailFin(ctx, tx, ty, ta, 0.46, 0.76, 0.08, flex, 0.6, finF, finE, finR, lb(1.5), lw(0.8), hd ? 5 : 3);
  // small fluttering pectorals
  for (const sd of [-1, 1]) {
    const fl = 0.3 * sin(phaseOf(e, t, 8 + 4 * bite, 1) + sd * 1.2);
    sp(0.47, sd * 0.93); fin(ctx, P[0], P[1], spA(0.47) + sd * (PI / 2 + 0.95 + fl), sd, 0.3, 0.16, finF, finE, finR, lw(1.1), lw(0.6), hd ? 4 : 2);
  }
  // body: a deep diamond
  outline(ctx, 0.05);
  ctx.fillStyle = H.rgbStr(c.body, 0.62); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.1, 0, 0.92, 0.62);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.5); ctx.stroke();
  outline(ctx, 0.02, 0.45, 3, n - 2);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.45, C2), 0.4); ctx.fill();
  // scale net: a lattice of dark-edged plates
  {
    const cols = hd ? 13 : 8, rows = hd ? 9 : 6;
    ctx.beginPath();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const u = 0.3 + (i + (j & 1) * 0.5) * (0.62 / cols), f = (((j + 0.5) / rows) * 2 - 1) * 0.86;
      if (abs(f) > 0.9 * (1 - abs(u - 0.44) * 0.6)) continue;
      sp(u, f); const r = spW(u) * (hd ? 0.07 : 0.1);
      ctx.moveTo(P[0] + r, P[1]); ctx.lineTo(P[0], P[1] + r * 0.8); ctx.lineTo(P[0] - r, P[1]); ctx.lineTo(P[0], P[1] - r * 0.8); ctx.closePath();
    }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.38); ctx.fill();
  }
  // dark saddle over the snout and the orange "moustache" behind the mouth
  ctx.beginPath();
  sp(0.17, -0.95); ctx.moveTo(P[0], P[1]); sp(0.15, 0); const sx0 = P[0], sy0 = P[1]; sp(0.17, 0.95); ctx.quadraticCurveTo(sx0, sy0, P[0], P[1]);
  sp(0.3, 0.95); ctx.lineTo(P[0], P[1]); sp(0.28, 0); const sx1 = P[0], sy1 = P[1]; sp(0.3, -0.95); ctx.quadraticCurveTo(sx1, sy1, P[0], P[1]); ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.nuc, 0.5); ctx.fill();
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.05, sd * 0.5); ctx.moveTo(P[0], P[1]); sp(0.13, sd * 0.66); const ax = P[0], ay = P[1]; sp(0.22, sd * 0.74); ctx.quadraticCurveTo(ax, ay, P[0], P[1]); }
  ctx.lineCap = 'round'; ctx.strokeStyle = H.rgbStr(TRIG_ACC, 0.9); ctx.lineWidth = 0.05; ctx.stroke();
  // soft dorsal fin on the back: rippling (triggerfish swim with it)
  midRibbon(ctx, 0.56, 0.93, 10, (v) => 0.014 * sin(t * 7 - v * 6) * v);
  ctx.strokeStyle = H.rgbStr(finC, 0.45); ctx.lineWidth = 0.06; ctx.stroke();
  // mouth: small orange lips that part sideways, with big chisel buck teeth
  const g = bite, mx = SX[0] + 0.07, th = 0.6 * g, hx = mx - 0.12, hy = 0.12;
  if (g > 0.02) { ctx.beginPath(); ctx.ellipse(mx + 0.02, 0, 0.07 + 0.06 * g, 0.03 + 0.12 * g, 0, 0, TAU); ctx.fillStyle = 'rgb(60,16,24)'; ctx.fill(); }
  for (const sd of [-1, 1]) {
    ctx.save(); ctx.translate(hx, sd * hy); ctx.rotate(sd * th); ctx.translate(-hx, -sd * hy);
    // two chisel teeth per side, jutting forward past the lips
    ctx.beginPath();
    for (let q = 0; q < 2; q++) {
      const y0 = sd * (0.006 + q * 0.046), L = (q ? 0.1 : 0.13) * (1 + 0.3 * g), x0 = mx - 0.02;
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + L, y0 + sd * 0.003); ctx.quadraticCurveTo(x0 + L + 0.01, y0 + sd * 0.022, x0 + L - 0.005, y0 + sd * 0.041); ctx.lineTo(x0, y0 + sd * 0.044); ctx.closePath();
    }
    ctx.fillStyle = 'rgba(255,252,240,0.98)'; ctx.fill(); ctx.strokeStyle = 'rgba(90,80,60,0.7)'; ctx.lineWidth = lw(0.8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx, sd * 0.004); ctx.ellipse(mx - 0.07, 0, 0.12, 0.13, 0, sd > 0 ? 0 : -PI / 2, sd > 0 ? PI / 2 : 0); ctx.closePath();
    ctx.fillStyle = H.rgbStr(TRIG_ACC, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.restore();
  }
  // eyes set far back and high on the head, a dark bar running forward from each
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.36, sd * 0.42); ctx.moveTo(P[0], P[1]); sp(0.2, sd * 0.34); ctx.lineTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = 0.035; ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.37, sd * 0.44); eye(ctx, P[0], P[1], 0.078, 'rgb(214,220,130)', lw(1), 0.56); }
  // the trigger: a stout first dorsal spine; folded flat in its groove, it snaps upright when it attacks
  {
    const raise = sstep(bite);
    sp(0.42, 0); const bx = P[0], by = P[1];
    const L = 0.38 * (1 - 0.2 * raise), a = spA(0.42) + PI + raise * 1.15, ex = bx + cos(a) * L, ey = by + sin(a) * L;
    if (raise > 0.02) { // the membrane behind it and a second, smaller spine
      sp(0.58, 0); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.quadraticCurveTo((ex + P[0]) / 2 + 0.03, (ey + P[1]) / 2, P[0], P[1]); ctx.closePath();
      ctx.fillStyle = H.rgbStr(finC, 0.5 * raise); ctx.fill();
      smudge(ctx, H, SHADE, (bx + ex) / 2 + 0.05, (by + ey) / 2 + 0.06, L * 0.6, 0.08, 0.35 * raise);
    }
    const nx = -sin(a), ny = cos(a), w = 0.042;
    ctx.beginPath(); ctx.moveTo(bx + nx * w, by + ny * w); ctx.lineTo(ex, ey); ctx.lineTo(bx - nx * w, by - ny * w); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.nuc, 0.92); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.65); ctx.lineWidth = lw(1); ctx.stroke();
    if (raise > 0.3) glow(ctx, H, WHITE, ex, ey, 0.09, 0.7 * (raise - 0.3));
  }
  shine(ctx, H, e, 0.15, 0.75);
}

// =================================================================================================== lionfish
const LION_W = (u) => (u < 0.22 ? 0.17 + 0.12 * sin((u / 0.22) * PI / 2) : 0.06 + 0.23 * (1 - ((u - 0.22) / 0.78) ** 1.4));
const RX = new Float32Array(24), RY = new Float32Array(24);
// one huge pectoral fan rooted at (x, y): long rays from angle aF (front) to aB (back), webbed for most of their
// length with banded membrane, the ray tips running free like feathers
function lionFan(ctx, H, c, x, y, sd, aF, aB, L, t, hd, fl) {
  const nr = hd ? 15 : 11, lw = H.lw, M = 0.7;
  for (let i = 0; i < nr; i++) {
    const v = i / (nr - 1), a = aF + (aB - aF) * v + 0.04 * sin(t * 1.9 + i * 0.7), l = L * ((0.42 + 0.62 * v ** 0.7) * (1 - fl) + (0.66 + 0.4 * sin(v * PI) ** 0.6) * fl);
    RX[i] = cos(a) * l; RY[i] = sd * sin(a) * l;
  }
  ctx.save(); ctx.translate(x, y);
  // membrane with a deeply scalloped edge
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let i = 0; i < nr; i++) {
    if (i === 0) ctx.lineTo(RX[0] * M, RY[0] * M);
    else ctx.quadraticCurveTo((RX[i - 1] + RX[i]) * 0.25, (RY[i - 1] + RY[i]) * 0.25, RX[i] * M, RY[i] * M);
  }
  ctx.closePath();
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.mem, c.body, 0.12, C3), 0.66); ctx.fill();
  // red-brown bands across the fan
  ctx.beginPath();
  for (const [f0, f1] of hd ? FAN_BANDS_HD : FAN_BANDS) {
    for (let i = 0; i < nr; i++) i ? ctx.lineTo(RX[i] * f0, RY[i] * f0) : ctx.moveTo(RX[0] * f0, RY[0] * f0);
    for (let i = nr - 1; i >= 0; i--) ctx.lineTo(RX[i] * f1, RY[i] * f1);
    ctx.closePath();
  }
  ctx.fillStyle = H.rgbStr(c.body, 0.85); ctx.fill();
  // rays: pale spines the full length, banded red where they run free
  ctx.beginPath();
  for (let i = 0; i < nr; i++) { ctx.moveTo(0, 0); ctx.quadraticCurveTo(RX[i] * 0.5 - RY[i] * 0.05 * sd, RY[i] * 0.5 + RX[i] * 0.05 * sd, RX[i], RY[i]); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.8); ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); for (let i = 0; i < nr; i++) { ctx.moveTo(RX[i] * 0.78, RY[i] * 0.78); ctx.lineTo(RX[i] * 0.88, RY[i] * 0.88); }
  ctx.strokeStyle = H.rgbStr(c.body, 0.95); ctx.lineWidth = lw(1.6); ctx.stroke();
  ctx.restore();
}
function drawLion(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const bite = clamp01(e.biteK || 0), fl = sstep(bite);
  if (st) ctx.scale(1 + st * 0.4, 1 - st * 0.25);
  const ph = phaseOf(e, t, 3.2 * (1 + st * 2));
  const n = H.lod ? 8 : 22;
  spine(n, 0.92, 1.72, LION_W, 0.09 + st * 0.3, 3.8, ph, 2.2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.05 * sin(ph - 4.5);
  const br = 0.07 * sin(t * 1.2);
  const aF = 1.3 - 0.95 * fl + br, aB = 2.88 - 0.38 * fl + br * 0.5, Lf = 1.25 * (1 + 0.05 * fl);
  if (H.lod) {
    ctx.beginPath();
    for (const sd of [-1, 1]) { sp(0.3, sd * 0.8); const x = P[0], y = P[1]; ctx.moveTo(x, y); ctx.lineTo(x + cos(aF) * Lf, y + sd * sin(aF) * Lf); ctx.lineTo(x + cos((aF + aB) / 2) * Lf * 1.05, y + sd * sin((aF + aB) / 2) * Lf * 1.05); ctx.lineTo(x + cos(aB) * Lf * 0.8, y + sd * sin(aB) * Lf * 0.8); ctx.closePath(); }
    ctx.fillStyle = H.rgbStr(c.body, 0.6); ctx.fill();
    outline(ctx, 0.08); tailTri(ctx, tx, ty, ta, 0.4, 0.7, 0.4); ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  // rounded, see-through tail fan dotted with dark spots
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  tailPath(ctx, 0.46, 0.62, 0.06, flex, 1.15);
  ctx.fillStyle = H.rgbStr(c.mem, 0.22); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); for (let i = 0; i < (hd ? 14 : 8); i++) { const v = (hash(i + 4) - 0.5) * 0.9, d = 0.12 + 0.3 * hash(i + 9); circ(ctx, d, v * 0.62 * (0.4 + d * 1.4) + flex * d * 2, hd ? 0.016 : 0.024); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.7); ctx.fill();
  ctx.restore();
  // the huge banded pectoral fans
  for (const sd of [-1, 1]) { sp(0.3, sd * 0.82); lionFan(ctx, H, c, P[0], P[1], sd, aF, aB, Lf, t + (sd > 0 ? 0 : 0.8), hd, fl); }
  // soft dorsal fin, glassy and spotted
  midRibbon(ctx, 0.6, 0.9, 8, (v) => 0.04 * sin(ph * 0.6 - v * 5));
  ctx.strokeStyle = H.rgbStr(c.mem, 0.28); ctx.lineWidth = 0.08; ctx.lineCap = 'round'; ctx.stroke();
  // body: cream with red-brown bars
  outline(ctx, 0.08);
  ctx.fillStyle = H.rgbStr(c.mem, 0.82); ctx.fill();
  gfill(ctx, H, c.mem, 1, 0.05, 0, 0.92, 0.3);
  ctx.save(); outline(ctx, 0.08); ctx.restore();
  {
    const nb = hd ? 12 : 9;
    ctx.beginPath();
    for (let i = 0; i < nb; i++) {
      const u0 = 0.06 + i * (0.9 / nb), u1 = u0 + 0.9 / nb * 0.55, cv = 0.02;
      sp(u0, -1); ctx.moveTo(P[0], P[1]); sp(u0 - cv, 0); ctx.lineTo(P[0], P[1]); sp(u0, 1); ctx.lineTo(P[0], P[1]);
      sp(u1, 1); ctx.lineTo(P[0], P[1]); sp(u1 - cv, 0); ctx.lineTo(P[0], P[1]); sp(u1, -1); ctx.lineTo(P[0], P[1]); ctx.closePath();
    }
    ctx.fillStyle = H.rgbStr(c.body, 0.92); ctx.fill();
  }
  outline(ctx, 0.08); ctx.strokeStyle = H.rgbStr(c.nuc, 0.75); ctx.lineWidth = lb(1.3); ctx.stroke();
  // mouth: gulping a round mouthful of water
  {
    const g = bite, mx = SX[0] + 0.03 + 0.03 * g;
    ctx.beginPath(); ctx.ellipse(mx, 0, 0.035 + 0.085 * g, 0.07 + 0.11 * g, 0, 0, TAU);
    ctx.fillStyle = H.rgbStr(c.mem, 0.95); ctx.fill();
    if (g > 0.005) { ctx.beginPath(); ctx.ellipse(mx + 0.01, 0, 0.065 * g, 0.11 * g + 0.03 * min(1, g * 8), 0, 0, TAU); ctx.fillStyle = 'rgb(56,10,20)'; ctx.fill(); }
    if (g < 0.15) { ctx.beginPath(); ctx.moveTo(mx - 0.01, -0.06); ctx.quadraticCurveTo(mx + 0.04, 0, mx - 0.01, 0.06); ctx.strokeStyle = `rgba(80,20,26,${(0.8 * (1 - g / 0.15)).toFixed(3)})`; ctx.lineWidth = lw(1.2); ctx.stroke(); }
    if (bite > 0.1) glow(ctx, H, c.glow, mx + 0.25, 0, 0.5, 0.22 * (bite - 0.1));
  }
  // eyes, a dark bar through each, and the fleshy brow tentacles
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.06, sd * 0.4); ctx.moveTo(P[0], P[1]); sp(0.18, sd * 0.9); ctx.lineTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.75); ctx.lineWidth = 0.04; ctx.lineCap = 'round'; ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.12, sd * 0.62); eye(ctx, P[0], P[1], 0.072, 'rgb(214,96,70)', lw(1), 0.55); }
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    sp(0.1, sd * 0.85); const x = P[0], y = P[1], a = sd * (1.2 + 0.15 * sin(t * 2 + sd));
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + cos(a) * 0.1, y + sin(a) * 0.1, x + cos(a + sd * 0.4) * 0.2, y + sin(a + sd * 0.4) * 0.2);
  }
  ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = 0.028; ctx.stroke();
  // long venomous dorsal spines, splayed like a crown, banded red/white, webbed at the base
  {
    const ns = hd ? 13 : 9, BXs = BX, BYs = BY;
    for (let i = 0; i < ns; i++) {
      const u = 0.14 + i * (0.46 / (ns - 1)); sp(u, 0); const bx = P[0], by = P[1];
      const sd = i & 1 ? 1 : -1, len = (0.5 + 0.34 * sin(((i + 1) / (ns + 1)) * PI)) * (1 + 0.15 * fl);
      const a = spA(u) + PI - sd * (0.72 + 0.55 * fl + 0.06 * sin(t * 1.3 + i));
      BXs[i * 3] = bx; BYs[i * 3] = by; BXs[i * 3 + 1] = bx + cos(a) * len; BYs[i * 3 + 1] = by + sin(a) * len; BXs[i * 3 + 2] = a; BYs[i * 3 + 2] = len;
    }
    ctx.beginPath();
    for (let i = 0; i < ns - 1; i++) {
      const f = 0.45, x0 = BXs[i * 3], y0 = BYs[i * 3], x1 = BXs[i * 3 + 3], y1 = BYs[i * 3 + 3];
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + (BXs[i * 3 + 1] - x0) * f, y0 + (BYs[i * 3 + 1] - y0) * f); ctx.lineTo(x1 + (BXs[i * 3 + 4] - x1) * f, y1 + (BYs[i * 3 + 4] - y1) * f); ctx.lineTo(x1, y1); ctx.closePath();
    }
    ctx.fillStyle = H.rgbStr(c.mem, 0.3); ctx.fill();
    ctx.beginPath(); for (let i = 0; i < ns; i++) { ctx.moveTo(BXs[i * 3], BYs[i * 3]); ctx.lineTo(BXs[i * 3 + 1], BYs[i * 3 + 1]); }
    ctx.strokeStyle = H.rgbStr(c.body, 0.98); ctx.lineWidth = lw(2.6); ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < ns; i++) {
      const x0 = BXs[i * 3], y0 = BYs[i * 3], dx = BXs[i * 3 + 1] - x0, dy = BYs[i * 3 + 1] - y0;
      for (const [f0, f1] of SPINE_BANDS) { ctx.moveTo(x0 + dx * f0, y0 + dy * f0); ctx.lineTo(x0 + dx * f1, y0 + dy * f1); }
    }
    ctx.strokeStyle = 'rgba(255,248,240,0.95)'; ctx.lineWidth = lw(2.4); ctx.stroke();
    if (fl > 0.2) { for (let i = 0; i < ns; i += 2) glow(ctx, H, c.glow, BXs[i * 3 + 1], BYs[i * 3 + 1], 0.07, 0.75 * (fl - 0.2), 1); }
  }
  shine(ctx, H, e, 0.25, 0.6);
}

// =================================================================================================== octopus
const OCT_L0 = [1.5, 1.66, 1.66, 1.5], OCT_LG = [2.2, 2.0, 1.75, 1.45];
const OA = new Float32Array(8 * 2 * 15);
function drawOcto(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const ink = clamp01(e.inkK || 0), grab = clamp01(e.grabK || 0), G = sstep(grab), I = sstep(ink) * (1 - G);
  if (st) ctx.scale(1 + st * 0.35, 1 - st * 0.25);
  if (ink > 0.01) inkCloud(ctx, H, t, ink, -0.95);
  const segs = H.lod ? 6 : 14, cx = 0.34;
  // arm centre lines: trailing back (swimming), streamlined (jetting) or shot forward (grabbing)
  for (let j = 0; j < 8; j++) {
    const sd = j < 4 ? -1 : 1, q = j < 4 ? 3 - j : j - 4;
    const ar = sd * (0.35 + 0.62 * q);
    let a0 = sd * (1.2 + 0.4 * q), aE = sd * (2.9 + 0.05 * q);
    a0 = a0 + (sd * (1.5 + 0.3 * q) - a0) * I; aE = aE + (sd * (PI - 0.06 - 0.05 * q) - aE) * I;
    a0 = a0 + (sd * (0.12 + 0.2 * q) - a0) * G; aE = aE + (sd * (0.08 + 0.1 * q) - aE) * G;
    const L = (OCT_L0[q] + (OCT_LG[q] - OCT_L0[q]) * G) * (1 - 0.08 * I), ds = L / segs, wav = 0.3 * (1 - 0.7 * G) * (1 - 0.6 * I);
    let x = cx + cos(ar) * 0.12, y = sin(ar) * 0.12;
    const o = j * 30; OA[o] = x; OA[o + 1] = y;
    for (let k = 1; k <= segs; k++) {
      const u = k / segs;
      const a = a0 + (aE - a0) * u ** 0.75 + wav * sin(t * 1.6 + j * 1.3 - k * 0.55) * u - sd * 1.6 * G * max(0, (u - 0.72) / 0.28) ** 2 + sd * 0.8 * (1 - G) * (1 - I) * max(0, (u - 0.8) / 0.2) ** 2;
      x += cos(a) * ds; y += sin(a) * ds; OA[o + k * 2] = x; OA[o + k * 2 + 1] = y;
    }
  }
  const skin = H.mixRGB(c.body, WHITE, 0.45 * I, C1);
  if (H.lod) {
    ctx.beginPath();
    for (let j = 0; j < 8; j++) { const o = j * 30; ctx.moveTo(OA[o], OA[o + 1]); ctx.quadraticCurveTo(OA[o + segs], OA[o + segs + 1], OA[o + segs * 2], OA[o + segs * 2 + 1]); }
    ctx.strokeStyle = H.cstr(skin); ctx.lineWidth = 0.12; ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.4, 0, 0.55, 0.42, 0, 0, TAU); ctx.moveTo(0.48, 0); ctx.ellipse(0.2, 0, 0.28, 0.32, 0, 0, TAU);
    ctx.fillStyle = H.cstr(skin); ctx.fill();
    return;
  }
  // arms
  ctx.beginPath();
  for (let j = 0; j < 8; j++) { for (let k = 0; k <= segs; k++) { AB[k * 2] = OA[j * 30 + k * 2]; AB[k * 2 + 1] = OA[j * 30 + k * 2 + 1]; } tube(ctx, AB, segs, 0.1, 0.006, 1.1); }
  ctx.fillStyle = H.rgbStr(skin, 0.9); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.65); ctx.lineWidth = lw(1); ctx.stroke();
  // suckers: pale rings along every arm
  ctx.beginPath();
  for (let j = 0; j < 8; j++) {
    const sd = j < 4 ? -1 : 1, o = j * 30;
    for (let k = 1; k < segs - 1; k += hd ? 1 : 2) {
      const x0 = OA[o + k * 2], y0 = OA[o + k * 2 + 1], dx = OA[o + k * 2 + 2] - x0, dy = OA[o + k * 2 + 3] - y0, l = Math.hypot(dx, dy) || 1;
      const w = 0.1 * (1 - k / segs) ** 1.1, r = 0.012 + 0.026 * (1 - k / segs), off = (k & 1 ? 0.45 : -0.45) * w * (hd ? 1 : 0.3) - sd * w * 0.2;
      circ(ctx, x0 - dy / l * off, y0 + dx / l * off, r);
    }
  }
  ctx.fillStyle = H.rgbStr(c.mem, 0.7); ctx.fill();
  if (hd) { ctx.strokeStyle = H.rgbStr(c.nuc, 0.5); ctx.lineWidth = lw(0.7); ctx.stroke(); }
  // the web between the arm bases
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const j = [3, 2, 1, 0, 4, 5, 6, 7][i], o = j * 30 + 4; i ? ctx.lineTo(OA[o], OA[o + 1]) : ctx.moveTo(OA[o], OA[o + 1]); }
  ctx.lineTo(cx - 0.15, 0.2); ctx.lineTo(cx - 0.15, -0.2); ctx.closePath();
  ctx.fillStyle = H.rgbStr(skin, 0.9); ctx.fill();
  // mantle: a soft bag behind the head, breathing
  const br = 1 + 0.035 * sin(t * 2.2) - 0.12 * I;
  ctx.beginPath(); ctx.ellipse(-0.42, 0, 0.56 * (1 + 0.04 * I), 0.42 * br, 0, 0, TAU);
  ctx.fillStyle = H.rgbStr(skin, 0.86); ctx.fill();
  gfill(ctx, H, skin, 1, -0.42, 0, 0.56, 0.42);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.4); ctx.stroke();
  // chromatophores: "passing clouds" of dark patches drifting over the skin, pale spots and papillae
  const blanch = 1 - 0.75 * I;
  ctx.beginPath();
  for (let i = 0; i < (hd ? 26 : 13); i++) {
    const x = -0.9 + hash(i + 2) * 0.95, y = (hash(i * 1.9 + 7) * 2 - 1) * 0.36 * sqrt(max(0, 1 - ((x + 0.42) / 0.58) ** 2));
    const r = (0.04 + 0.05 * hash(i + 13)) * (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.4 - x * 7 + i * 0.3))) * blanch;
    ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.8, hash(i) * 3, 0, TAU);
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.55); ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < (hd ? 22 : 10); i++) { const x = -0.86 + hash(i + 40) * 0.95, y = (hash(i * 1.3 + 50) * 2 - 1) * 0.3 * sqrt(max(0, 1 - ((x + 0.42) / 0.58) ** 2)); circ(ctx, x, y, 0.016 + 0.012 * hash(i + 60)); }
  ctx.fillStyle = H.rgbStr(c.mem, 0.6); ctx.fill();
  // head with the big eyes (they bulge up from the skin)
  ctx.beginPath(); ctx.ellipse(0.17, 0, 0.27, 0.3, 0, 0, TAU);
  ctx.fillStyle = H.rgbStr(skin, 0.9); ctx.fill();
  gfill(ctx, H, skin, 1, 0.17, 0, 0.28, 0.31);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.8); ctx.lineWidth = lb(1.2); ctx.stroke();
  // the dark false-eye spots (ocelli) at the arm bases
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(0.4, sd * 0.3); ctx.ellipse(0.36, sd * 0.3, 0.05, 0.035, 0, 0, TAU); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.85 * blanch); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6 * blanch); ctx.lineWidth = lw(1.1); ctx.stroke();
  for (const sd of [-1, 1]) {
    const ex = 0.12, ey = sd * 0.25;
    ctx.beginPath(); ctx.ellipse(ex, ey, 0.11, 0.1, 0, 0, TAU); ctx.fillStyle = H.rgbStr(skin, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ex + 0.01, ey, 0.075, 0.07, 0, 0, TAU); ctx.fillStyle = 'rgb(236,206,120)'; ctx.fill();
    // horizontal bar pupil
    ctx.beginPath(); ctx.ellipse(ex + 0.012, ey, 0.058, 0.022 + 0.012 * G, 0, 0, TAU); ctx.fillStyle = '#06060a'; ctx.fill();
    ctx.beginPath(); ctx.arc(ex - 0.02, ey - 0.03, 0.018, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  shine(ctx, H, e, -0.3, 0.6);
}

// =================================================================================================== blacktip reef shark
const SHARK_W = (u) => (u < 0.2 ? 0.3 * sqrt(max(0, 1 - 0.85 * ((0.2 - u) / 0.2) ** 2)) : 0.055 + 0.245 * (1 - ((u - 0.2) / 0.8) ** 1.35));
// points on quadratic / cubic Béziers → P
function bez2(x0, y0, x1, y1, x2, y2, u) { const w = 1 - u; P[0] = w * w * x0 + 2 * w * u * x1 + u * u * x2; P[1] = w * w * y0 + 2 * w * u * y1 + u * u * y2; return P; }
function bez3(x0, y0, x1, y1, x2, y2, x3, y3, u) { const w = 1 - u, a = w * w * w, b = 3 * w * w * u, c = 3 * w * u * u, d = u * u * u; P[0] = a * x0 + b * x1 + c * x2 + d * x3; P[1] = a * y0 + b * y1 + c * y2 + d * y3; return P; }
// falcate (sickle) fin rooted at (x, y) along a; side mirrors; tk paints its outer tip with tipFill
function sickle(ctx, x, y, a, side, L, W, fill, edge, lwE, tipFill, tk) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.4, -W * 0.72, L * 0.82, -W * 0.3, L, W * 0.5);
  ctx.quadraticCurveTo(L * 0.48, W * 0.08, 0, W * 0.5);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lwE; ctx.stroke();
  if (tk) { // the black tip: the outer part of both edges, closed with a soft curve
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) { bez3(0, -W * 0.5, L * 0.4, -W * 0.72, L * 0.82, -W * 0.3, L, W * 0.5, 1 - tk + tk * (i / 5)); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    for (let i = 1; i <= 4; i++) { bez2(L, W * 0.5, L * 0.48, W * 0.08, 0, W * 0.5, tk * 0.75 * (i / 4)); ctx.lineTo(P[0], P[1]); }
    ctx.closePath(); ctx.fillStyle = tipFill; ctx.fill();
  }
  ctx.restore();
}
function drawShark(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = clamp01(e.sprintK || 0), bite = clamp01(e.biteK || 0), st = (e.stretch || 0) + 0.06 * k;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.35);
  const ph = phaseOf(e, t, 4 + 6 * k);
  const n = H.lod ? 10 : 26;
  spine(n, 1.1, 2.3, SHARK_W, 0.13 * (1 - 0.8 * k) * (1 - 0.5 * bite), 4, ph, 2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.08 * sin(ph - 5) * (1 - 0.6 * k);
  const black = H.rgbStr(c.nuc, 0.92);
  if (H.lod) {
    outline(ctx, 0.08);
    for (const sd of [-1, 1]) { sp(0.3, sd * 0.9); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] - 0.3, P[1] + sd * 0.55); sp(0.42, sd * 0.7); ctx.lineTo(P[0], P[1]); ctx.closePath(); }
    tailTri(ctx, tx, ty, ta, 0.55, 0.6, 0.25);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  if (k > 0.01) { streaks(ctx, H, c, t, k, 0.6, 0.12); glow(ctx, H, c.glow, -0.2, 0, 1.4, 0.18 * k, 0, 0.35); }
  const finF = H.rgbStr(c.body, 0.92), finE = H.rgbStr(c.mem, 0.75);
  // lunate caudal fin with black tips on both lobes
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  {
    const L = 0.56, W = 0.74, r0 = 0.05, nk = 0.5, cn = nk + 0.14;
    tailPath(ctx, L, W, r0, flex, nk); ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      for (let i = 0; i <= 4; i++) { bez2(0, sd * r0, L * 0.42, sd * W * 0.5, L, sd * W * 0.62 + flex, 0.62 + 0.38 * (i / 4)); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
      for (let i = 1; i <= 3; i++) { bez2(L, sd * W * 0.62 + flex, L * cn, sd * W * 0.16 + flex * 0.6, L * nk, flex * 0.5, 0.4 * (i / 3)); ctx.lineTo(P[0], P[1]); }
      ctx.closePath();
    }
    ctx.fillStyle = black; ctx.fill();
  }
  ctx.restore();
  // pelvic fins, then the big sickle pectorals (swept back when sprinting)
  for (const sd of [-1, 1]) { sp(0.66, sd * 0.8); sickle(ctx, P[0], P[1], spA(0.66) + sd * (PI / 2 + 0.95), sd, 0.18, 0.09, finF, finE, lw(1), black, 0.45); }
  for (const sd of [-1, 1]) {
    const flap = 0.08 * sin(t * 2 + sd) * (1 - k);
    sp(0.29, sd * 0.88); sickle(ctx, P[0], P[1], spA(0.29) + sd * (PI / 2 + 0.55 + 0.4 * k + flap), sd, 0.62 * (1 - 0.1 * k), 0.26, finF, finE, lw(1.1), black, 0.36);
  }
  // jaws (biting): the lower jaw swings forward ahead of the snout, a dark gape with serrated teeth between
  const g = sstep(bite);
  if (g > 0.01) {
    const d = 0.22 * g, cxj = 0.62;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const ph2 = -1.15 + 2.3 * (i / 12); const x = cxj + (0.53 + d) * cos(ph2), y = (0.3 + 0.03 * g) * sin(ph2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const ph2 = -1.15 + 2.3 * (i / 12); ctx.lineTo(cxj + 0.5 * cos(ph2), 0.28 * sin(ph2)); }
    ctx.closePath(); ctx.fillStyle = 'rgb(58,16,24)'; ctx.fill();
    smudge(ctx, H, [120, 30, 44], cxj + 0.55 + d * 0.4, 0, 0.12 + 0.12 * g, 0.2, 0.5 * g);
    // lower jaw rim and its teeth pointing back into the mouth
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const ph2 = -1.15 + 2.3 * (i / 12); const x = cxj + (0.6 + d) * cos(ph2), y = (0.32 + 0.03 * g) * sin(ph2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const ph2 = -1.15 + 2.3 * (i / 12); ctx.lineTo(cxj + (0.53 + d) * cos(ph2), (0.3 + 0.03 * g) * sin(ph2)); }
    ctx.closePath(); ctx.fillStyle = H.rgbStr(c.mem, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 13 : 8); i++) { const ph2 = -1.0 + 2.0 * (i / ((hd ? 13 : 8) - 1)); const bx = cxj + (0.53 + d) * cos(ph2), by = (0.3 + 0.03 * g) * sin(ph2); tooth(ctx, bx, by, bx - cos(ph2) * 0.07 * g, by - sin(ph2) * 0.06 * g, 0.018); }
    ctx.fillStyle = 'rgba(255,255,250,0.98)'; ctx.fill();
  }
  // body: pale grey, countershaded
  outline(ctx, 0.08);
  ctx.fillStyle = H.rgbStr(c.body, 0.78); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 1.2, 0.32);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.4); ctx.stroke();
  outline(ctx, 0.04, 0.55, 1, n - 2); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.25, C1), 0.35); ctx.fill();
  // the white flank band showing along the rear flanks
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i <= 8; i++) { sp(0.42 + i * 0.04, sd * 0.94); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = lw(1.6); ctx.stroke();
  // gill slits
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { sp(0.17 + i * 0.022, sd * 0.98); ctx.moveTo(P[0], P[1]); sp(0.17 + i * 0.022 - 0.008, sd * 0.72); ctx.lineTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.42); ctx.lineWidth = lw(1); ctx.stroke();
  // upper teeth peeking down from the snout as it bites
  if (g > 0.1) {
    ctx.beginPath();
    for (let i = 0; i < (hd ? 11 : 7); i++) { const ph2 = -0.95 + 1.9 * (i / ((hd ? 11 : 7) - 1)), bx = 0.62 + 0.49 * cos(ph2), by = 0.27 * sin(ph2); tooth(ctx, bx - cos(ph2) * 0.02, by - sin(ph2) * 0.02, bx + cos(ph2) * 0.07 * g, by + sin(ph2) * 0.05 * g, 0.018); }
    ctx.fillStyle = 'rgba(255,255,250,0.98)'; ctx.fill();
  }
  // dorsal fins along the back: a tall first one with the famous black tip, a small second one
  {
    sp(0.34, 0); const ax = P[0], ay = P[1]; sp(0.5, 0); const bx = P[0], by = P[1];
    const hx = ax - 0.24, hy = ay - 0.22;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax - 0.04, ay - 0.1, hx, hy); ctx.quadraticCurveTo(hx + 0.02, (hy + by) / 2, bx, by); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.15, C2), 0.95); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) { bez2(ax, ay, ax - 0.04, ay - 0.1, hx, hy, 0.5 + 0.5 * (i / 4)); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    for (let i = 1; i <= 4; i++) { bez2(hx, hy, hx + 0.02, (hy + by) / 2, bx, by, 0.5 * (i / 4)); ctx.lineTo(P[0], P[1]); }
    ctx.closePath(); ctx.fillStyle = black; ctx.fill();
    sp(0.72, 0); const cx0 = P[0], cy0 = P[1]; sp(0.78, 0);
    ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(cx0 - 0.04, cy0 - 0.06, P[0] - 0.02, P[1] - 0.05); ctx.lineTo(P[0], P[1]); ctx.closePath();
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  // nostrils and eyes (cat-eye pupils; the eyes roll white as it bites)
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(1.08, sd * 0.07); ctx.lineTo(1.03, sd * 0.12); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(1.3); ctx.stroke();
  for (const sd of [-1, 1]) {
    sp(0.1, sd * 0.82); const x = P[0], y = P[1];
    ctx.beginPath(); ctx.ellipse(x, y, 0.06, 0.045, 0, 0, TAU); ctx.fillStyle = 'rgb(200,196,150)'; ctx.fill(); ctx.strokeStyle = 'rgba(8,16,26,0.8)'; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 0.004, y, 0.014, 0.038, 0, 0, TAU); ctx.fillStyle = '#04060c'; ctx.fill();
    if (g > 0.01) { ctx.beginPath(); ctx.ellipse(x, y, 0.062, 0.047, 0, 0, TAU); ctx.fillStyle = `rgba(236,240,244,${(0.9 * g).toFixed(3)})`; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x - 0.015, y - 0.015, 0.012, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  shine(ctx, H, e, 0.35, 0.6);
}

// =================================================================================================== banded sea krait
const SNK_LEN = 3.6, SNK_YEL = [240, 210, 96];
function snakeW(s) {
  if (s < 0.18) return 0.1 + 0.095 * sqrt(s / 0.18);
  if (s < 0.36) return 0.195 - 0.045 * ((s - 0.18) / 0.18);
  if (s < 1.6) return 0.15 + 0.065 * ((s - 0.36) / 1.24);
  if (s < 3.0) return 0.215 - 0.08 * ((s - 1.6) / 1.4);
  const v = min(1, (s - 3.0) / 0.6);
  return (0.135 + 0.09 * sin(v * PI * 0.75)) * sqrt(max(0, 1 - v ** 4)) + 0.004;
}
function drawSnake(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, lod = H.lod;
  const codex = e.r === undefined, bite = clamp01(e.biteK || 0), B = sstep(bite);
  const n = lod ? 16 : 48, ds = SNK_LEN / n;
  const amp = (codex ? 0.9 : 0.62), kk = codex ? 1.75 : 2.3, ph = phaseOf(e, t, 2.6);
  const x0 = 0.92 + 0.25 * B;
  SN = n;
  {
    let x = x0, y = 0;
    for (let i = 0; i <= n; i++) {
      const sa = i * ds, ramp = min(1, sa / 0.9) * (1 - B * max(0, 1 - sa / 1.4));
      const a = PI + amp * ramp * sin(ph - kk * sa) + 0.08 * sin(t * 0.8) * (1 - B);
      SX[i] = x; SY[i] = y; SA[i] = a; SW[i] = snakeW(sa);
      x += cos(a) * ds; y += sin(a) * ds;
    }
  }
  if (codex) { // centre the coil for the portrait
    let mx = 0, my = 0; for (let i = 0; i <= n; i++) { mx += SX[i]; my += SY[i]; } mx /= n + 1; my /= n + 1;
    ctx.translate(-mx, -my);
  }
  if (lod) { outline(ctx, 0.06); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return; }
  const g = B, sx = SX[0] - cos(SA[0]) * 0.07, sy = SY[0] - sin(SA[0]) * 0.07, ha = SA[0] - PI;
  // striking: the lower jaw drops forward, a pink mouth between it and the snout
  if (g > 0.01) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ha); ctx.scale(1.3, 1.3);
    ctx.beginPath(); ctx.moveTo(-0.16, -0.1); ctx.quadraticCurveTo(0.05 + 0.18 * g, -0.12 - 0.04 * g, 0.08 + 0.2 * g, 0); ctx.quadraticCurveTo(0.05 + 0.18 * g, 0.12 + 0.04 * g, -0.16, 0.1); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.nuc, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lw(1) / 1.3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.12, -0.075); ctx.quadraticCurveTo(0.03 + 0.15 * g, -0.09 - 0.03 * g, 0.05 + 0.17 * g, 0); ctx.quadraticCurveTo(0.03 + 0.15 * g, 0.09 + 0.03 * g, -0.12, 0.075); ctx.closePath();
    ctx.fillStyle = 'rgb(214,120,140)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.02, 0, 0.04, 0.025, 0, 0, TAU); ctx.fillStyle = 'rgb(90,24,40)'; ctx.fill();
    ctx.restore();
  } else {
    // a flick of the forked tongue now and then
    const fr = fract(t * 0.35 + 0.2);
    if (fr < 0.18) {
      const L = 0.3 * sin((fr / 0.18) * PI), wv = 0.02 * sin(t * 40);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(ha);
      ctx.beginPath(); ctx.moveTo(-0.02, 0); ctx.lineTo(L * 0.7, wv); ctx.lineTo(L, wv - 0.05 * (L / 0.3)); ctx.moveTo(L * 0.7, wv); ctx.lineTo(L, wv + 0.05 * (L / 0.3));
      ctx.strokeStyle = 'rgba(200,40,70,0.95)'; ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
      ctx.restore();
    }
  }
  // body: blue-white with black rings
  outline(ctx, 0.07);
  ctx.fillStyle = H.rgbStr(c.body, 0.9); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.3); ctx.stroke();
  outline(ctx, 0, 0.45, 4, n - 3); ctx.fillStyle = H.rgbStr(c.mem, 0.32); ctx.fill();
  {
    const step = 0.2, bw = 0.072;
    ctx.beginPath();
    for (let s0 = 0.36; s0 < SNK_LEN - 0.04; s0 += step) {
      const s1 = min(SNK_LEN - 0.01, s0 + bw * (s0 > 3.0 ? 1.4 : 1)), u0 = s0 / SNK_LEN, u1 = s1 / SNK_LEN, um = (u0 + u1) / 2;
      sp(u0, -1.04); ctx.moveTo(P[0], P[1]); sp(um - 0.002, 0); ctx.lineTo(P[0], P[1]); sp(u0, 1.04); ctx.lineTo(P[0], P[1]);
      sp(u1, 1.04); ctx.lineTo(P[0], P[1]); sp(um + 0.002, 0); ctx.lineTo(P[0], P[1]); sp(u1, -1.04); ctx.lineTo(P[0], P[1]); ctx.closePath();
    }
    // black tail tip
    sp(3.42 / SNK_LEN, -1); ctx.moveTo(P[0], P[1]); for (let i = 1; i <= 4; i++) { sp((3.42 + i * 0.045) / SNK_LEN, -1); ctx.lineTo(P[0], P[1]); }
    for (let i = 4; i >= 0; i--) { sp((3.42 + i * 0.045) / SNK_LEN, 1); ctx.lineTo(P[0], P[1]); } ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.nuc, 0.94); ctx.fill();
  }
  if (hd) { // small scales: a fine net of dots along the back
    ctx.beginPath();
    for (let i = 0; i < 70; i++) { const u = 0.1 + (i / 70) * 0.82; sp(u, ((i % 3) - 1) * 0.5); circ(ctx, P[0], P[1], 0.009); }
    ctx.fillStyle = H.rgbStr(c.mem, 0.35); ctx.fill();
  }
  // head: black cap, yellow snout and a yellow stripe over each eye
  const ih = max(2, round(0.3 / ds));
  outline(ctx, 0.07, 1.02, 0, ih); ctx.fillStyle = H.rgbStr(c.nuc, 0.95); ctx.fill();
  ctx.beginPath(); ctx.ellipse(sx - cos(ha) * 0.07, sy - sin(ha) * 0.07, 0.075, 0.11, ha, 0, TAU);
  ctx.fillStyle = H.rgbStr(SNK_YEL, 0.95); ctx.fill();
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.05 / SNK_LEN, sd * 0.6); ctx.moveTo(P[0], P[1]); sp(0.15 / SNK_LEN, sd * 0.8); const ax = P[0], ay = P[1]; sp(0.28 / SNK_LEN, sd * 0.62); ctx.quadraticCurveTo(ax, ay, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(SNK_YEL, 0.9); ctx.lineWidth = 0.035; ctx.lineCap = 'round'; ctx.stroke();
  if (g > 0.3) { // two little fangs at the front of the upper jaw
    const fl = 0.09 * (g - 0.3) / 0.7;
    ctx.beginPath(); for (const sd of [-1, 1]) { rot(sx + 0.0, sy + sd * 0.055, sx, sy, ha); const bx = P[0], by = P[1]; rot(sx + fl, sy + sd * 0.045, sx, sy, ha); tooth(ctx, bx, by, P[0], P[1], 0.014); }
    ctx.fillStyle = 'rgba(255,255,250,0.95)'; ctx.fill();
  }
  for (const sd of [-1, 1]) { sp(0.13 / SNK_LEN, sd * 0.62); eye(ctx, P[0], P[1], 0.05, 'rgb(40,36,44)', lw(0.8), 0.7, '#000'); }
  shine(ctx, H, e, SX[3], 0.35);
}

// =================================================================================================== green sea turtle
const TURT_SKIN = [96, 94, 84];
// carapace outline point at angle th, scaled by k about its centre → P
function tcPt(th, k) {
  const cs = cos(th), sn = sin(th);
  P[0] = -0.06 + k * (0.8 * cs - (cs < 0 ? 0.1 * cs ** 4 : 0) - 0.05 * max(0, cs) ** 30);
  P[1] = k * 0.66 * sn * (1 + 0.07 * cs);
  return P;
}
function carapace(ctx, k) { let m = 0; for (let i = 0; i < 32; i++) { tcPt((i / 32) * TAU, k); OX[m] = P[0]; OY[m] = P[1]; m++; } smooth(ctx, m); }
// a flipper blade rooted at (x, y), pointing along a; side mirrors; wk = width (feathering)
function flipper(ctx, x, y, a, side, L, W, bend) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.35, -W * 0.95, L * 0.78, -W * 0.5 + bend * 0.5, L, W * 0.05 + bend);
  ctx.quadraticCurveTo(L * 0.62, W * 0.55 + bend * 0.5, 0, W * 0.5);
  ctx.closePath();
  ctx.restore();
}
function drawTurtle(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.2, 1 - st * 0.15);
  const ph = phaseOf(e, t, 1.25 * (1 + st * 2));
  const skin = H.mixRGB(c.body, TURT_SKIN, 0.78, C1);
  const fa = 1.5 + 0.68 * sin(ph), fw = 0.62 + 0.38 * abs(cos(ph)), bend = -0.08 * cos(ph);
  const ra = 2.45 + 0.15 * sin(ph + 0.8), hb = 0.03 * sin(ph * 2 - 0.5);
  if (H.lod) {
    ctx.beginPath();
    for (const sd of [-1, 1]) { const x = 0.38, y = sd * 0.48, a = sd * fa; ctx.moveTo(x, y); ctx.lineTo(x + cos(a - sd * 0.2) * 1.0, y + sin(a - sd * 0.2) * 1.0); ctx.lineTo(x + cos(a + sd * 0.25) * 0.4, y + sin(a + sd * 0.25) * 0.4); ctx.closePath(); }
    ctx.moveTo(1.15, 0); ctx.ellipse(0.92, 0, 0.23, 0.17, 0, 0, TAU);
    ctx.fillStyle = H.cstr(skin); ctx.fill();
    carapace(ctx, 1); ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  smudge(ctx, H, SHADE, 0.02, 0.06, 1.1, 0.95, 0.35);
  const sF = H.rgbStr(skin, 0.95), sE = H.rgbStr(c.mem, 0.7);
  // rear flippers and the stubby tail
  for (const sd of [-1, 1]) { flipper(ctx, -0.62, sd * 0.36, sd * ra, sd, 0.4, 0.26 * (0.8 + 0.2 * abs(sin(ph))), 0.02); ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lw(1); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(-0.84, -0.05); ctx.quadraticCurveTo(-1.02, 0, -0.84, 0.05); ctx.closePath(); ctx.fillStyle = sF; ctx.fill();
  // long front flippers, slowly flapping like wings (and feathering at the end of each stroke)
  for (const sd of [-1, 1]) {
    flipper(ctx, 0.38, sd * 0.48, sd * fa, sd, 1.05, 0.34 * fw, bend);
    ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lb(1.2); ctx.stroke();
    // scales along the flipper, pale leading edge, claw
    ctx.save(); ctx.translate(0.38, sd * 0.48); ctx.rotate(sd * fa); ctx.scale(1, sd);
    ctx.beginPath();
    for (let i = 1; i < (hd ? 7 : 4); i++) { const x = (i / (hd ? 7 : 4)) * 0.95, w = 0.34 * fw * 0.5 * (1 - (x / 1.05) ** 2); ctx.moveTo(x, -w * 0.9); ctx.quadraticCurveTo(x + 0.05, 0, x, w * 0.8 + bend * x); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.38); ctx.lineWidth = lw(0.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.05, -0.34 * fw * 0.55); ctx.bezierCurveTo(0.35, -0.34 * fw * 0.92, 0.7, -0.34 * fw * 0.45, 0.95, -0.02);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(1.6); ctx.stroke();
    ctx.beginPath(); circ(ctx, 0.3, -0.34 * fw * 0.75, 0.018); ctx.fillStyle = 'rgba(40,30,20,0.8)'; ctx.fill();
    ctx.restore();
  }
  // neck and head (beaked, big plated scales)
  ctx.save(); ctx.translate(hb, 0);
  ctx.beginPath(); ctx.moveTo(0.5, -0.17); ctx.quadraticCurveTo(0.72, -0.14, 0.78, -0.13); ctx.lineTo(0.78, 0.13); ctx.quadraticCurveTo(0.72, 0.14, 0.5, 0.17); ctx.closePath();
  ctx.fillStyle = sF; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.68, -0.15); ctx.bezierCurveTo(0.8, -0.24, 1.06, -0.21, 1.17, -0.06); ctx.quadraticCurveTo(1.21, 0, 1.17, 0.06); ctx.bezierCurveTo(1.06, 0.21, 0.8, 0.24, 0.68, 0.15); ctx.closePath();
  ctx.fillStyle = H.rgbStr(skin, 0.97); ctx.fill();
  ctx.save(); ctx.translate(0.93, 0); ctx.scale(0.28, 0.22); ctx.fillStyle = H.bodyGrad(ctx, H.mixRGB(skin, c.nuc, 0.3, C2), 0.9); ctx.fill(); ctx.restore();
  ctx.strokeStyle = sE; ctx.lineWidth = lb(1.2); ctx.stroke();
  // head scutes: the pair of long prefrontals on the snout, a frontal plate, cheek plates
  ctx.beginPath();
  ctx.moveTo(1.13, 0); ctx.lineTo(0.98, 0); ctx.moveTo(1.13, -0.035); ctx.quadraticCurveTo(1.03, -0.09, 0.97, -0.07); ctx.lineTo(0.97, 0.07); ctx.quadraticCurveTo(1.03, 0.09, 1.13, 0.035);
  ctx.moveTo(0.97, -0.07); ctx.lineTo(0.88, -0.1); ctx.lineTo(0.8, -0.06); ctx.lineTo(0.8, 0.06); ctx.lineTo(0.88, 0.1); ctx.lineTo(0.97, 0.07);
  if (hd) { ctx.moveTo(0.88, -0.1); ctx.lineTo(0.85, -0.17); ctx.moveTo(0.88, 0.1); ctx.lineTo(0.85, 0.17); ctx.moveTo(0.8, -0.06); ctx.lineTo(0.72, -0.13); ctx.moveTo(0.8, 0.06); ctx.lineTo(0.72, 0.13); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1.17, -0.06); ctx.quadraticCurveTo(1.22, 0, 1.17, 0.06); ctx.strokeStyle = 'rgba(40,32,22,0.8)'; ctx.lineWidth = lw(1.8); ctx.stroke();
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(0.95, sd * 0.165, 0.045, 0.032, sd * 0.2, 0, TAU); ctx.fillStyle = 'rgb(28,20,14)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0.96, sd * 0.165 - 0.012, 0.012, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  ctx.restore();
  // the domed carapace: marginal scutes round the rim, 5 vertebral and 4 + 4 costal scutes, radiating streaks
  carapace(ctx, 1);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.5, C3), 0.97); ctx.fill();
  gfill(ctx, H, c.body, 1, -0.1, 0, 0.82, 0.68);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lb(1.5); ctx.stroke();
  // mottled streaks radiating from each scute's growth centre
  const XB = [0.56, 0.3, 0.04, -0.22, -0.47, -0.7];
  {
    ctx.beginPath();
    const centres = SCUTES;
    const nr = hd ? 7 : 5;
    // radiating rays from each scute's growth centre: pale wedges, dark wedges between
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let q = 0; q < centres.length; q++) {
        const [x, y] = centres[q];
        for (let i = 0; i < nr; i++) {
          const a = ((i + (pass ? 0.5 : 0) + 0.5 * hash(q * 5 + i + pass * 17)) / nr) * TAU + q, l = 0.08 + 0.08 * hash(q * 9 + i + pass * 31), w = 0.022 + 0.012 * hash(q + i);
          const ex = x + cos(a) * l, ey = y + sin(a) * l * 0.85, nx = -sin(a) * w, ny = cos(a) * w;
          ctx.moveTo(x, y); ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.closePath();
        }
      }
      ctx.fillStyle = pass ? H.rgbStr(c.nuc, 0.4) : H.rgbStr(H.mixRGB(c.mem, [255, 214, 120], 0.45, C4), 0.36); ctx.fill();
    }
  }
  // seams
  ctx.beginPath();
  carapace(ctx, 0.84);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.38); ctx.lineWidth = lw(1.1); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 24; i++) { const th = ((i + 0.5) / 24) * TAU; tcPt(th, 0.84); ctx.moveTo(P[0], P[1]); tcPt(th, 1); ctx.lineTo(P[0], P[1]); }
  // vertebral column (hexagonal plates)
  for (const sd of [-1, 1]) { ctx.moveTo(XB[0], sd * 0.1); for (let i = 0; i < 5; i++) { ctx.lineTo((XB[i] + XB[i + 1]) / 2, sd * 0.2); ctx.lineTo(XB[i + 1], sd * (i === 4 ? 0.1 : 0.16)); } }
  for (let i = 0; i < 6; i++) { const w = i === 0 || i === 5 ? 0.1 : 0.16; ctx.moveTo(XB[i], -w); ctx.lineTo(XB[i], w); }
  // costal seams out to the rim
  for (const sd of [-1, 1]) for (let i = 1; i < 5; i++) {
    const x = XB[i], th = Math.acos(max(-1, min(1, (x - 0.08 * (i - 2.5) + 0.06) / (0.8 * 0.84)))); tcPt(th, 0.84);
    ctx.moveTo(x, sd * 0.16); ctx.quadraticCurveTo((x + P[0]) / 2, sd * (0.16 + abs(P[1])) / 2 * 1.05, P[0], sd * abs(P[1]));
  }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.38); ctx.lineWidth = lw(1.1); ctx.stroke();
  shine(ctx, H, e, -0.15, 0.95);
}

// =================================================================================================== Humboldt squid
const HB_X0 = 0.5, HB_X1 = -1.42, HB_DEEP = [140, 10, 26], HB_PALE = [255, 246, 242];
function hbW(x) { const v = (HB_X0 - x) / (HB_X0 - HB_X1); return 0.31 * (v < 0.2 ? 0.86 + 0.14 * sin((v / 0.2) * PI / 2) : sqrt(max(0, 1 - ((v - 0.2) / 0.8) ** 2.3))); }
function hbMantle(ctx, by) {
  const m = 16; let q = 0;
  for (let i = 0; i <= m; i++) { const x = HB_X0 + (HB_X1 - HB_X0) * (i / m); OX[q] = x; OY[q] = -hbW(x) * by; q++; }
  for (let i = m - 1; i >= 0; i--) { const x = HB_X0 + (HB_X1 - HB_X0) * (i / m); OX[q] = x; OY[q] = hbW(x) * by; q++; }
  OX[q] = HB_X0 + 0.05; OY[q] = 0; q++;
  smooth(ctx, q);
}
function hbFins(ctx, t, by, keep = false) {
  if (!keep) ctx.beginPath();
  for (const sd of [-1, 1]) {
    const wv = 0.05 * sin(t * 4 + sd * 0.8), wv2 = 0.03 * sin(t * 4 + sd * 0.8 - 1.2);
    ctx.moveTo(-0.6, sd * 0.2 * by);
    ctx.bezierCurveTo(-0.72, sd * (0.4 + wv2), -0.88, sd * (0.6 + wv), -1.02, sd * (0.64 + wv));
    ctx.bezierCurveTo(-1.16, sd * (0.5 + wv2), -1.36, sd * 0.2, -1.5, 0);
    ctx.lineTo(-1.2, sd * 0.1 * by); ctx.lineTo(-0.9, sd * 0.17 * by); ctx.closePath();
  }
}
function drawHumboldt(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const flash = clamp01(e.flashK || 0), red = clamp01(e.redK || 0), grab = clamp01(e.grabK || 0), ink = clamp01(e.inkK || 0);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const by = 1 + 0.04 * sin(t * 2.8) - 0.12 * ink;
  const body = H.mixRGB(c.body, HB_DEEP, red * 0.85, C1), mem = H.mixRGB(c.mem, [255, 150, 150], red * 0.55, C2);
  if (ink > 0.01) inkCloud(ctx, H, t, ink, -1.4);
  if (red > 0.05 && !H.lod) glow(ctx, H, HB_DEEP, -0.2, 0, 1.8, 0.25 * red, 0, 0.6);
  if (H.lod) {
    ctx.fillStyle = H.cstr(body);
    hbMantle(ctx, by); ctx.fill();
    hbFins(ctx, t, by);
    ctx.moveTo(0.6, 0.2); ctx.lineTo(1.6 + 1.3 * grab, 0); ctx.lineTo(0.6, -0.2); ctx.closePath(); ctx.fill();
    return;
  }
  // flicker pattern value along the body: waves running head → tail, with a faster shimmer on top
  const fv = (x) => sin(x * 8.5 + t * 15) + 0.45 * sin(x * 19 - t * 23 + 1.3);
  // arrowhead fins
  hbFins(ctx, t, by);
  ctx.fillStyle = H.rgbStr(body, 0.55); ctx.fill(); ctx.strokeStyle = H.rgbStr(mem, 0.8); ctx.lineWidth = lw(1.1); ctx.stroke();
  if (flash > 0.02) { hbFins(ctx, t, by); ctx.fillStyle = H.rgbStr(fv(-1) > 0 ? HB_DEEP : HB_PALE, 0.45 * flash); ctx.fill(); }
  if (hd) {
    ctx.beginPath(); for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { const x = -0.7 - i * 0.1; ctx.moveTo(x, sd * 0.18); ctx.lineTo(x - 0.12, sd * (0.5 - abs(i - 3.3) * 0.05)); }
    ctx.strokeStyle = H.rgbStr(mem, 0.28); ctx.lineWidth = lw(0.7); ctx.stroke();
  }
  // 8 stout arms
  const spread = 0.32 + 0.55 * grab, ARMS = [0.68, 0.84, 0.95, 0.88, 0.88, 0.95, 0.84, 0.68];
  ctx.beginPath();
  for (let j = 0; j < 8; j++) { const v = (j - 3.5) / 3.5; limb(ctx, 0.74, v * 0.13, v * spread, ARMS[j] * (1 - 0.12 * grab), 0.075, 7, t, j, -v * (0.24 - 0.32 * grab), 0.07 * (1 - 0.5 * grab)); }
  ctx.fillStyle = H.rgbStr(body, 0.86); ctx.fill(); ctx.strokeStyle = H.rgbStr(mem, 0.75); ctx.lineWidth = lw(0.9); ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (let j = 0; j < 8; j++) { const v = (j - 3.5) / 3.5, a = v * spread; for (let q = 1; q <= 5; q++) { const d = ARMS[j] * (1 - 0.12 * grab) * q * 0.16; circ(ctx, 0.74 + cos(a) * d, v * 0.13 + sin(a) * d, 0.013 * (1.25 - q * 0.15)); } }
    ctx.fillStyle = H.rgbStr(mem, 0.55); ctx.fill();
  }
  // the two long tentacles: tucked among the arms, shot ~3 units ahead to grab
  const Lt = 1.05 + 1.05 * grab;
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    let x = 0.76, y = sd * 0.025, a = sd * (0.06 - 0.045 * grab);
    const segs = 10, dss = Lt * 0.8 / segs;
    ctx.moveTo(x, y);
    for (let q = 1; q <= segs; q++) { a += (0.12 * sin(t * 1.5 + sd + q * 0.6) - sd * 0.02) * (1 - grab); x += cos(a) * dss; y += sin(a) * dss; ctx.lineTo(x, y); }
    ctx.strokeStyle = H.rgbStr(body, 0.85); ctx.lineWidth = 0.04; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = H.rgbStr(mem, 0.7); ctx.lineWidth = lw(0.9); ctx.stroke();
    const cw = 0.06 + 0.055 * grab, cl = Lt * 0.24;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cl * 0.4, -cw * 1.3, cl, -cw * 0.2 * (1 - grab)); ctx.quadraticCurveTo(cl * 0.4, cw * 1.3, 0, 0); ctx.closePath();
    ctx.fillStyle = H.rgbStr(body, 0.9); ctx.fill(); ctx.strokeStyle = H.rgbStr(mem, 0.85); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let q = 0; q < (hd ? 7 : 4); q++) { const u = 0.2 + q * (hd ? 0.1 : 0.17); for (const r of hd ? CLUB_ROWS_HD : CLUB_ROWS) circ(ctx, cl * u, r * cw * 0.35 * sin(u * PI) * (0.6 + grab), 0.017 + 0.01 * grab); }
    ctx.fillStyle = H.rgbStr(mem, 0.8); ctx.fill();
    if (hd) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw(0.6); ctx.stroke(); } // toothed sucker rings
    ctx.restore();
  }
  // the torpedo mantle
  hbMantle(ctx, by);
  ctx.fillStyle = H.rgbStr(body, 0.55); ctx.fill();
  gfill(ctx, H, body, 1, -0.45, 0, 1.0, 0.33 * by);
  ctx.strokeStyle = H.rgbStr(mem, 0.95); ctx.lineWidth = lb(1.5); ctx.stroke();
  if (red > 0.01) { ctx.fillStyle = H.rgbStr(HB_DEEP, 0.4 * red); ctx.fill(); }
  if (ink > 0.01) { ctx.fillStyle = `rgba(255,250,245,${(0.25 * ink * (1 - red)).toFixed(3)})`; ctx.fill(); }
  // flicker: travelling bands of deep red and white across the mantle
  if (flash > 0.02) {
    const ns = 30, dx = (HB_X1 - HB_X0) / ns;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < ns; i++) {
        const xa = HB_X0 + dx * i, xb = xa + dx, v = fv(xa + dx / 2);
        if (pass === 0 ? v < 0.25 : v > -0.45) continue;
        const wa = hbW(xa) * by * 0.97, wb = hbW(xb) * by * 0.97;
        ctx.moveTo(xa, -wa); ctx.lineTo(xb, -wb); ctx.lineTo(xb, wb); ctx.lineTo(xa, wa); ctx.closePath();
      }
      ctx.fillStyle = pass === 0 ? H.rgbStr(HB_DEEP, 0.72 * flash) : H.rgbStr(HB_PALE, 0.6 * flash); ctx.fill();
    }
  }
  // gladius along the back, chromatophores
  ctx.beginPath(); ctx.moveTo(0.48, 0); ctx.quadraticCurveTo(-0.4, 0.01, -1.34, 0);
  ctx.strokeStyle = H.rgbStr(mem, 0.32); ctx.lineWidth = lw(1.4); ctx.stroke();
  {
    const nc = hd ? 50 : 24;
    ctx.beginPath();
    for (let i = 0; i < nc; i++) {
      const x = 0.44 - hash(i + 3.1) * 1.75, hw = hbW(x) * by * 0.8, y = (hash(i * 1.7 + 9.2) * 2 - 1) * hw;
      const r = (0.016 + 0.022 * hash(i + 21.4)) * (0.45 + 0.55 * (0.5 + 0.5 * sin(t * 2.2 + i * 1.3))) * (1 - 0.6 * ink);
      circ(ctx, x, y, r);
    }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, HB_DEEP, red, C3), 0.7); ctx.fill();
  }
  // head with the big eyes
  ctx.beginPath(); ctx.ellipse(0.62, 0, 0.19, 0.24, 0, 0, TAU);
  ctx.fillStyle = H.rgbStr(body, 0.5); ctx.fill();
  gfill(ctx, H, body, 1, 0.62, 0, 0.22, 0.27);
  if (flash > 0.02) { ctx.fillStyle = H.rgbStr(fv(0.62) > 0 ? HB_DEEP : HB_PALE, 0.5 * flash); ctx.fill(); }
  if (red > 0.01) { ctx.fillStyle = H.rgbStr(HB_DEEP, 0.35 * red); ctx.fill(); }
  ctx.strokeStyle = H.rgbStr(mem, 0.95); ctx.lineWidth = lb(1.2); ctx.stroke();
  if (hd || grab > 0.01) { ctx.beginPath(); ctx.arc(0.77, 0, (hd ? 0.045 : 0) + (hd ? 0.035 : 0.08) * grab, 0, TAU); ctx.fillStyle = 'rgba(40,14,20,0.9)'; ctx.fill(); } // beak at the hub of the arms
  for (const sd of [-1, 1]) eye(ctx, 0.59, sd * 0.24, 0.13, 'rgb(236,214,160)', lw(1), 0.72, '#05060d');
  shine(ctx, H, e, -0.2, 0.62);
}

// =================================================================================================== Goliath grouper
let GR_FLARE = 0, GR_CHEEK = 0;
const GROUP_W = (u) => (u < 0.3 ? 0.4 + 0.29 * sin((u / 0.3) * PI / 2) ** 0.8 : 0.2 + 0.49 * (1 - ((u - 0.3) / 0.7) ** 1.6))
  + GR_FLARE * exp(-(((u - 0.37) / 0.07) ** 2)) + GR_CHEEK * exp(-(((u - 0.17) / 0.08) ** 2));
const GR_IRIS = [210, 180, 90], GR_WHITE = [250, 246, 230], GR_RED = [190, 40, 50], PUFF = [90, 240, 215], PUFF_E = [30, 110, 105]; // the wedged pufferfish is the player: its colours
// mouth curves for gape g: −y half as cubic control points [x0,y0, x1,y1, x2,y2, x3,y3] (corner → front); +y mirrors
const MU = new Float32Array(8), MI = new Float32Array(8), MO = new Float32Array(8);
function set8(M, a, b, c, d, e, f, g, h) { M[0] = a; M[1] = b; M[2] = c; M[3] = d; M[4] = e; M[5] = f; M[6] = g; M[7] = h; }
function grMouth(g, x0) {
  set8(MU, x0 - 0.38, -0.5, x0 - 0.16, -0.5, x0 + 0.02, -0.33, x0 + 0.03, 0);
  set8(MI, x0 - 0.38, -0.5, x0 - 0.12 + 0.25 * g, -0.58 - 0.12 * g, x0 + 0.06 + 0.42 * g, -0.38 - 0.14 * g, x0 + 0.06 + 0.44 * g, 0);
  set8(MO, x0 - 0.42, -0.55, x0 - 0.1 + 0.27 * g, -0.66 - 0.12 * g, x0 + 0.13 + 0.46 * g, -0.43 - 0.14 * g, x0 + 0.13 + 0.48 * g, 0);
}
function curve(ctx, C, sd, fwd, move) {
  const k = -sd;
  if (fwd) { move ? ctx.moveTo(C[0], k * C[1]) : ctx.lineTo(C[0], k * C[1]); ctx.bezierCurveTo(C[2], k * C[3], C[4], k * C[5], C[6], k * C[7]); }
  else { move ? ctx.moveTo(C[6], k * C[7]) : ctx.lineTo(C[6], k * C[7]); ctx.bezierCurveTo(C[4], k * C[5], C[2], k * C[3], C[0], k * C[1]); }
}
function cpt(C, u, sd) {
  const w = 1 - u, a = w * w * w, b = 3 * w * w * u, c = 3 * w * u * u, d = u * u * u;
  P[0] = a * C[0] + b * C[2] + c * C[4] + d * C[6]; P[1] = -sd * (a * C[1] + b * C[3] + c * C[5] + d * C[7]);
  return P;
}
function band(ctx, A, B) { ctx.beginPath(); curve(ctx, A, -1, true, true); curve(ctx, A, 1, false, false); curve(ctx, B, 1, true, false); curve(ctx, B, -1, false, false); ctx.closePath(); }
// an inflated pufferfish (the player) jammed in the mouth: spiny sandy ball, wide eyes
function puffer(ctx, H, x, y, r, t, hd, a) {
  const A = ctx.globalAlpha; ctx.globalAlpha = A * a;
  ctx.beginPath();
  const ns = hd ? 26 : 16;
  for (let i = 0; i < ns; i++) { const an = (i / ns) * TAU + 0.1, l = r * (1.28 + 0.06 * sin(t * 6 + i)), w = 0.18; ctx.moveTo(x + cos(an - w) * r * 0.95, y + sin(an - w) * r * 0.95); ctx.lineTo(x + cos(an) * l, y + sin(an) * l); ctx.lineTo(x + cos(an + w) * r * 0.95, y + sin(an + w) * r * 0.95); }
  ctx.fillStyle = H.rgbStr(PUFF_E, 0.95); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = H.rgbStr(PUFF, 0.95); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r); ctx.fillStyle = H.bodyGrad(ctx, [60, 200, 180], 0.8); ctx.fill(); ctx.restore();
  ctx.strokeStyle = H.rgbStr([210, 255, 245], 0.9); ctx.lineWidth = H.lw(1.2); ctx.stroke();
  ctx.beginPath(); for (let i = 0; i < (hd ? 14 : 8); i++) { const an = hash(i + 70) * TAU, d = r * (0.25 + 0.6 * hash(i + 80)); circ(ctx, x + cos(an) * d, y + sin(an) * d, r * 0.07); }
  ctx.fillStyle = H.rgbStr(PUFF_E, 0.6); ctx.fill();
  for (const sd of [-1, 1]) eye(ctx, x + r * 0.42, y + sd * r * 0.42, r * 0.24, 'rgb(250,250,240)', H.lw(1), 0.5, '#05060c', 0.3);
  ctx.globalAlpha = A;
}
function drawGrouper(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const gape = clamp01(e.gapeK || 0), suck = clamp01(e.suckK || 0), choke = clamp01(e.chokeK || 0), stun = clamp01(e.stunK || 0);
  const ck = sstep(choke), sk = sstep(stun);
  const g = max(sstep(gape), 0.5 * ck);
  if (e.withWreck) drawWreck(ctx, t, H);
  if (ck > 0.01) ctx.translate(0.014 * sin(t * 37) * ck, 0.012 * sin(t * 29) * ck);
  if (sk > 0.01) { ctx.rotate(0.14 * sk); ctx.scale(1, 1 - 0.06 * sk); }
  const ph = phaseOf(e, t, 2.2 * (1 - 0.7 * sk) + 3 * ck), fph = phaseOf(e, t, 2.6 * (1 - 0.75 * sk) + 12 * ck, 1);
  GR_FLARE = 0.13 * g; GR_CHEEK = 0.1 * ck;
  const n = H.lod ? 10 : 26;
  spine(n, 0.98, 2.0, GROUP_W, 0.08 * (1 - 0.5 * g), 3.2, ph, 2.2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.06 * sin(ph - 4);
  if (H.lod) { outline(ctx, 0.06); tailTri(ctx, tx, ty, ta, 0.5, 0.75, 0.48); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return; }
  const finF = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.25, C1), 0.75), finE = H.rgbStr(c.mem, 0.6), finR = H.rgbStr(c.nuc, 0.35);
  smudge(ctx, H, SHADE, -0.1, 0.1, 1.6, 1.0, 0.3);
  // water rushing into the open mouth (suction feeding)
  const mx0 = 1.08 + 0.3 * g;
  if (suck > 0.01) {
    // a cone of drawn-in water, streaks curling in towards the mouth, particles swept along
    glow(ctx, H, c.mem, mx0 + 0.75, 0, 1.0, 0.12 * suck, 0, 0.75);
    ctx.beginPath();
    for (let i = 0; i < (hd ? 22 : 14); i++) {
      const f = fract(t * 1.5 + hash(i + 11)), a = (hash(i + 5) - 0.5) * 1.5, d0 = 0.22 + 1.35 * (1 - f) ** 0.8, len = 0.18 + 0.3 * (1 - f), d1 = max(0.12, d0 - len);
      const a0 = a * (1 + 0.35 * (d0 / 1.6)), a1 = a * (1 + 0.35 * (d1 / 1.6)), am = (a0 + a1) / 2 + 0.06 * Math.sign(a), dm = (d0 + d1) / 2;
      ctx.moveTo(mx0 + cos(a0) * d0, sin(a0) * d0); ctx.quadraticCurveTo(mx0 + cos(am) * dm, sin(am) * dm, mx0 + cos(a1) * d1, sin(a1) * d1);
    }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.55 * suck); ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 26 : 14); i++) { const f = fract(t * 1.1 + hash(i + 31)), a = (hash(i + 37) - 0.5) * 1.5 * (0.35 + 0.65 * (1 - f)), d = 0.15 + 1.45 * (1 - f) ** 1.3; circ(ctx, mx0 + cos(a) * d, sin(a) * d, (0.012 + 0.02 * hash(i + 41)) * (0.5 + 0.5 * (1 - f))); }
    ctx.fillStyle = H.rgbStr(WHITE, 0.8 * suck); ctx.fill();
    glow(ctx, H, c.glow, mx0 + 0.3, 0, 1.0, 0.15 * suck, 0, 0.8);
  }
  // rounded tail fan
  tailFin(ctx, tx, ty, ta, 0.56, 0.82, 0.18, flex, 1.15, finF, finE, finR, lb(1.3), lw(0.8), hd ? 6 : 3);
  // pelvic fins, rounded pectorals (slow sculling; frantic when choking)
  for (const sd of [-1, 1]) { sp(0.47, sd * 0.62); fin(ctx, P[0], P[1], spA(0.47) + sd * (PI / 2 + 1.0 + 0.1 * sin(fph + sd)), sd, 0.3, 0.17, finF, finE, finR, lw(1), lw(0.6), hd ? 4 : 0); }
  for (const sd of [-1, 1]) {
    const flap = (0.22 + 0.15 * ck) * sin(fph + (sd > 0 ? 0 : 0.6));
    sp(0.43, sd * 0.9); fin(ctx, P[0], P[1], spA(0.43) + sd * (PI / 2 + 0.95 + flap), sd, 0.6, 0.42, finF, finE, finR, lb(1.2), lw(0.7), hd ? 7 : 4);
  }
  // mouth: the gullet and the lower jaw, which swings forward as it gapes
  grMouth(g, SX[0] + 0.02);
  band(ctx, MU, MI);
  ctx.fillStyle = 'rgb(44,14,18)'; ctx.fill();
  if (g > 0.02) smudge(ctx, H, [140, 40, 50], SX[0] + 0.12 + 0.18 * g, 0, 0.12 + 0.2 * g, 0.3 + 0.08 * g, 0.55 * g);
  band(ctx, MO, MI);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.35, C2), 0.98); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lb(1.2); ctx.stroke();
  if (hd) { // a band of tiny teeth on the lower jaw
    ctx.beginPath(); for (const sd of [-1, 1]) for (let i = 0; i < 12; i++) { cpt(MI, 0.25 + i * 0.065, sd); const bx = P[0], bym = P[1]; tooth(ctx, bx, bym, bx - 0.035, bym * 0.9, 0.009); }
    ctx.fillStyle = 'rgba(250,245,232,0.9)'; ctx.fill();
  }
  if (ck > 0.01) puffer(ctx, H, SX[0] + 0.2 + 0.14 * g, 0, 0.36 * (0.7 + 0.3 * ck), t, hd, min(1, ck * 2.5));
  // body
  outline(ctx, 0.06);
  ctx.fillStyle = H.rgbStr(c.body, 0.86); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 1.1, 0.78);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.8); ctx.lineWidth = lb(1.6); ctx.stroke();
  outline(ctx, 0.03, 0.5, 2, n - 2); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.4, C3), 0.3); ctx.fill();
  if (sk > 0.01) { // rolled a little: its pale belly shows along one flank
    ctx.beginPath(); for (let i = 0; i <= 10; i++) { sp(0.12 + i * 0.075, 0.93); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.55 * sk); ctx.lineWidth = 0.07; ctx.lineCap = 'round'; ctx.stroke();
  }
  // mottling: irregular dark oblique bars and blotches, yellow-olive patches, small black spots on the head
  {
    ctx.beginPath();
    const bars = GR_BARS;
    for (let b = 0; b < bars.length; b++) for (let j = -2; j <= 2; j++) {
      const u = bars[b] + j * 0.018 + (hash(b * 7 + j) - 0.5) * 0.03, f = j * 0.36 + (hash(b * 3 + j + 9) - 0.5) * 0.15;
      sp(u, f); const r = spW(u) * (0.16 + 0.08 * hash(b + j * 5)), a = spA(u) + 0.5;
      ctx.moveTo(P[0] + cos(a) * r * 1.3, P[1] + sin(a) * r * 1.3); ctx.ellipse(P[0], P[1], r * 1.3, r * 0.85, a, 0, TAU);
    }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.42); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 16 : 8); i++) { const u = 0.25 + hash(i + 50) * 0.6, f = (hash(i * 1.7 + 51) * 2 - 1) * 0.75; sp(u, f); const r = spW(u) * (0.08 + 0.08 * hash(i + 52)); circ(ctx, P[0], P[1], r); }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.mem, [240, 220, 90], 0.5, C4), 0.3); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 36 : 16); i++) { const u = 0.04 + hash(i + 90) * 0.3, f = (hash(i * 2.1 + 91) * 2 - 1) * 0.85; sp(u, f); circ(ctx, P[0], P[1], hd ? 0.014 : 0.02); }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill();
  }
  // gill covers flaring out: their rear edges lift away from the head, the red gills show behind them
  if (g > 0.02) {
    const fo = 0.24 * g, ga = min(1, g * 2.5);
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      sp(0.355, sd * 0.8); ctx.moveTo(P[0], P[1]); sp(0.37, sd * (1 + fo)); ctx.lineTo(P[0], P[1]);
      sp(0.43, sd * (1 + fo * 0.7)); const qx = P[0], qy = P[1]; sp(0.46, sd * 0.98); ctx.quadraticCurveTo(qx, qy, P[0], P[1]); sp(0.44, sd * 0.8); ctx.lineTo(P[0], P[1]); ctx.closePath();
    }
    ctx.fillStyle = H.rgbStr(GR_RED, 0.95 * ga); ctx.fill();
    ctx.beginPath();
    for (const sd of [-1, 1]) for (let i = 0; i < (hd ? 9 : 5); i++) { const v = (i + 0.5) / (hd ? 9 : 5); sp(0.37 + v * 0.07, sd * 0.84); ctx.moveTo(P[0], P[1]); sp(0.375 + v * 0.075, sd * (1 + fo * (1 - 0.7 * v))); ctx.lineTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr([255, 150, 150], 0.6 * ga); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      sp(0.22, sd * 0.97); ctx.moveTo(P[0], P[1]); sp(0.31, sd * (1.02 + fo * 0.7)); const ax = P[0], ay = P[1]; sp(0.375, sd * (1 + fo)); ctx.quadraticCurveTo(ax, ay, P[0], P[1]);
      sp(0.35, sd * 0.62); const bx = P[0], by = P[1]; sp(0.27, sd * 0.42); ctx.quadraticCurveTo(bx, by, P[0], P[1]); ctx.closePath();
    }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.12, C4), 0.97); ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.65); ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  // gill cover edge
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.36, sd * (1 + 0.1 * g)); const x0 = P[0], y0 = P[1]; sp(0.32, sd * 0.6); const cx = P[0], cy = P[1]; sp(0.24, sd * 0.32); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.55); ctx.lineWidth = lw(1.4); ctx.stroke();
  // soft dorsal fin along the back
  midRibbon(ctx, 0.32, 0.88, 12, (v) => 0.04 * sin(fph * 0.6 - v * 5) - 0.02);
  ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.3, C1), 0.6); ctx.lineWidth = 0.09; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.45); ctx.lineWidth = lw(1); ctx.stroke();
  // upper lip over the jaw (and over the wedged pufferfish)
  ctx.beginPath(); curve(ctx, MU, -1, true, true); curve(ctx, MU, 1, false, false);
  ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.3, C2), 0.95); ctx.lineWidth = 0.05; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(1.2); ctx.stroke();
  // small eyes high on the head: bulging when it chokes, half-shut and rolled when dazed
  for (const sd of [-1, 1]) {
    sp(0.21, sd * (0.5 + 0.12 * ck)); const x = P[0], y = P[1], r = 0.058 * (1 + 0.6 * ck);
    if (ck > 0.01) { ctx.beginPath(); ctx.arc(x, y, r * 1.3, 0, TAU); ctx.fillStyle = H.rgbStr(c.body, 0.9); ctx.fill(); }
    eye(ctx, x, y, r, H.rgbStr(H.mixRGB(GR_IRIS, GR_WHITE, ck, C2)), lw(1), 0.62 - 0.3 * ck - 0.1 * sk, '#04060c', 0.14 - 0.4 * sk, -sd * 0.35 * sk);
  }
  if (sk > 0.01) {
    for (const sd of [-1, 1]) {
      sp(0.21, sd * 0.5); const x = P[0], y = P[1], r = 0.058 * 1.1;
      ctx.beginPath(); ctx.ellipse(x, y, r, r, 0, sd > 0 ? -PI : 0, sd > 0 ? 0 : PI); // the half facing the midline
      ctx.lineTo(x, y); ctx.closePath();
      ctx.save(); ctx.globalAlpha *= sk; ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.2, C3), 0.98); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.strokeStyle = H.rgbStr(c.nuc, 0.8 * sk); ctx.lineWidth = lw(1.2); ctx.stroke();
    }
    // dazed: little sparkles circling over its head
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = t * 2.2 + (i / 3) * TAU, x = 0.3 + cos(a) * 0.42, y = sin(a) * 0.32, r = 0.07 * (0.8 + 0.2 * sin(t * 5 + i));
      ctx.moveTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25); ctx.lineTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.closePath();
      glow(ctx, H, [255, 240, 150], x, y, 0.16, 0.5 * sk);
    }
    ctx.fillStyle = `rgba(255,246,190,${(0.95 * sk).toFixed(3)})`; ctx.fill();
  }
  if (ck > 0.01) { // distress: bubbles bursting from the gills
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const f = fract(t * 1.3 + hash(i + 3)), sd = i & 1 ? 1 : -1; sp(0.4 + f * 0.2, sd * (1.05 + f * 0.5)); circ(ctx, P[0], P[1], 0.03 + 0.03 * f); }
    ctx.strokeStyle = `rgba(230,250,255,${(0.7 * ck).toFixed(3)})`; ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  shine(ctx, H, e, 0.1, 1.0);
}

// ---- the wreck: a rusted hull section, ~7 × 3 units, centred at 0,0, its open cargo hatch near +x
const WK_W = 1.45;
const WK_CORAL = [[-1.5, -1.05, 0], [-2.85, 0.6, 1], [0.2, 1.12, 2], [0.65, -0.6, 0], [2.95, 0.95, 1], [-0.6, 0.35, 2], [2.9, -1.0, 2], [-3.1, -0.55, 0]];
const WK_CC = [[255, 120, 170], [255, 164, 80], [196, 120, 255]];
function hullOutline(ctx, inset) {
  const w = WK_W - inset;
  ctx.beginPath(); ctx.moveTo(3.15 - inset, -w); ctx.lineTo(-2.3, -w);
  ctx.ellipse(-2.3, 0, 1.2 - inset, w, 0, -PI / 2, -1.5 * PI, true);
  ctx.lineTo(3.15 - inset, w);
  for (let i = 1; i < 10; i++) { const v = i / 10; ctx.lineTo(3.15 - inset + (hash(i + 0.5) - 0.5) * 0.42 + 0.12 * sin(v * PI), w - 2 * w * v); }
  ctx.closePath();
}
function drawWreck(ctx, t, H) {
  const lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, lod = H.lod;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  smudge(ctx, H, SHADE, 0.2, 0.25, 4.4, 2.3, 0.6);
  // ribs (frames) sticking out of the torn end
  if (!lod) {
    ctx.beginPath(); for (let i = 0; i < 7; i++) { const y = -1.25 + i * 0.42; ctx.moveTo(3.0, y); ctx.quadraticCurveTo(3.45, y * 1.02, 3.62 - 0.1 * hash(i), y * 0.86); }
    ctx.strokeStyle = 'rgb(86,46,30)'; ctx.lineWidth = 0.09; ctx.stroke();
    ctx.strokeStyle = 'rgba(200,120,70,0.6)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  hullOutline(ctx, 0);
  ctx.fillStyle = cgrad(ctx, 'wkHull', (g) => {
    const gr = g.createLinearGradient(0, -WK_W, 0, WK_W);
    gr.addColorStop(0, 'rgb(74,44,34)'); gr.addColorStop(0.18, 'rgb(122,74,48)'); gr.addColorStop(0.5, 'rgb(140,96,66)'); gr.addColorStop(0.82, 'rgb(112,68,46)'); gr.addColorStop(1, 'rgb(62,38,30)');
    return gr;
  });
  ctx.fill();
  if (lod) { ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(1.35, -0.62, 1.2, 1.24); ctx.restore(); return; }
  // gunwale: a thick rusty rim
  ctx.strokeStyle = 'rgb(70,40,30)'; ctx.lineWidth = 0.14; ctx.stroke();
  ctx.strokeStyle = 'rgba(214,140,90,0.55)'; ctx.lineWidth = lb(1.4); ctx.stroke();
  // deck plating seams and rivets
  ctx.beginPath();
  for (const y of WK_SEAMS) { ctx.moveTo(-3.0 + abs(y) * 0.5, y); ctx.lineTo(3.0, y); }
  for (let i = 0; i < 9; i++) { const x = -2.6 + i * 0.68; for (let r = 0; r < 4; r++) { const y0 = -0.95 + r * 0.475; ctx.moveTo(x + (r & 1) * 0.34, y0); ctx.lineTo(x + (r & 1) * 0.34, y0 + 0.475); } }
  ctx.strokeStyle = 'rgba(40,22,16,0.45)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  if (hd) {
    ctx.beginPath(); for (let i = 0; i < 60; i++) { const x = -2.8 + (i % 20) * 0.3, y = [-0.95, 0, 0.95][floor(i / 20)] + 0.04; circ(ctx, x, y, 0.016); }
    ctx.fillStyle = 'rgba(210,150,110,0.55)'; ctx.fill();
  }
  // rust blooms, sediment, dark stains
  for (let i = 0; i < 9; i++) smudge(ctx, H, [210, 110, 50], -3 + hash(i + 1) * 6, (hash(i + 2) - 0.5) * 2.2, 0.45 + 0.4 * hash(i + 3), 0.3 + 0.3 * hash(i + 4), 0.35);
  for (let i = 0; i < 6; i++) smudge(ctx, H, [200, 190, 150], -3 + hash(i + 11) * 6, (hash(i + 12) - 0.5) * 2.4, 0.5, 0.3, 0.3);
  for (let i = 0; i < 5; i++) smudge(ctx, H, [20, 12, 10], -2.8 + hash(i + 21) * 5.5, (hash(i + 22) - 0.5) * 2.2, 0.35, 0.22, 0.45);
  // collapsed deckhouse at the stern
  ctx.beginPath(); ctx.moveTo(-1.3, -0.7); ctx.lineTo(-2.4, -0.7); ctx.lineTo(-2.4, 0.7); ctx.lineTo(-1.75, 0.7); ctx.moveTo(-1.3, 0.35); ctx.lineTo(-1.3, -0.7);
  ctx.strokeStyle = 'rgb(66,40,32)'; ctx.lineWidth = 0.13; ctx.stroke(); ctx.strokeStyle = 'rgba(200,130,86,0.6)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.fillStyle = 'rgba(30,16,14,0.45)'; ctx.fillRect(-2.35, -0.65, 1.0, 1.3);
  // a fallen mast lying across the deck and over the side
  ctx.beginPath(); ctx.moveTo(-1.0, -0.15); ctx.lineTo(0.95, 1.75);
  ctx.strokeStyle = 'rgb(78,48,34)'; ctx.lineWidth = 0.12; ctx.stroke(); ctx.strokeStyle = 'rgba(214,150,100,0.5)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  // bollards
  ctx.beginPath(); for (const [x, y] of WK_BOLLARDS) circ(ctx, x, y, 0.07);
  ctx.fillStyle = 'rgb(70,42,32)'; ctx.fill(); ctx.strokeStyle = 'rgba(210,140,90,0.6)'; ctx.lineWidth = lw(1); ctx.stroke();
  // the open cargo hatch: a raised coaming round a pit of darkness (the grouper's lair)
  ctx.beginPath(); ctx.rect(1.28, -0.7, 1.34, 1.4);
  ctx.fillStyle = 'rgb(64,38,30)'; ctx.fill(); ctx.strokeStyle = 'rgba(210,140,90,0.6)'; ctx.lineWidth = lb(1.3); ctx.stroke();
  ctx.beginPath(); ctx.rect(1.38, -0.6, 1.14, 1.2);
  ctx.fillStyle = cgrad(ctx, 'wkHole', (g) => {
    const gr = g.createRadialGradient(1.95, 0, 0.05, 1.95, 0, 0.85);
    gr.addColorStop(0, 'rgb(0,0,2)'); gr.addColorStop(0.6, 'rgb(4,6,10)'); gr.addColorStop(1, 'rgb(22,16,16)');
    return gr;
  });
  ctx.fill();
  // its hatch cover, knocked askew over the side
  ctx.save(); ctx.translate(2.05, -1.32); ctx.rotate(0.42);
  ctx.beginPath(); ctx.rect(-0.6, -0.32, 1.2, 0.64); ctx.fillStyle = 'rgb(104,62,42)'; ctx.fill(); ctx.strokeStyle = 'rgba(40,22,16,0.8)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.2, -0.32); ctx.lineTo(-0.2, 0.32); ctx.moveTo(0.2, -0.32); ctx.lineTo(0.2, 0.32); ctx.strokeStyle = 'rgba(40,22,16,0.5)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.restore();
  // barnacles crusting the rim and the structures
  {
    ctx.beginPath();
    const nb = hd ? 80 : 44;
    for (let i = 0; i < nb; i++) {
      const h = hash(i + 0.37), side = i % 4;
      let x, y;
      if (side < 2) { x = -2.4 + h * 5.4; y = (side ? 1 : -1) * (WK_W - 0.08 - 0.12 * hash(i + 5)); }
      else if (side === 2) { const a = PI / 2 + h * PI; x = -2.3 + cos(a) * 1.1; y = sin(a) * (WK_W - 0.12); }
      else { x = (hash(i + 9) < 0.5 ? 1.28 + hash(i + 7) * 1.34 : -2.4 + hash(i + 7)); y = (hash(i + 8) < 0.5 ? -0.72 : 0.72) + (hash(i + 6) - 0.5) * 0.08; }
      circ(ctx, x, y, 0.035 + 0.035 * hash(i + 3));
    }
    ctx.fillStyle = 'rgba(214,210,196,0.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(70,60,56,0.7)'; ctx.lineWidth = lw(0.8); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < nb; i++) {
      const h = hash(i + 0.37), side = i % 4;
      let x, y;
      if (side < 2) { x = -2.4 + h * 5.4; y = (side ? 1 : -1) * (WK_W - 0.08 - 0.12 * hash(i + 5)); }
      else if (side === 2) { const a = PI / 2 + h * PI; x = -2.3 + cos(a) * 1.1; y = sin(a) * (WK_W - 0.12); }
      else { x = (hash(i + 9) < 0.5 ? 1.28 + hash(i + 7) * 1.34 : -2.4 + hash(i + 7)); y = (hash(i + 8) < 0.5 ? -0.72 : 0.72) + (hash(i + 6) - 0.5) * 0.08; }
      circ(ctx, x, y, 0.012 + 0.012 * hash(i + 3));
    }
    ctx.fillStyle = 'rgba(40,34,36,0.85)'; ctx.fill();
  }
  // soft coral tufts swaying, a sea fan or two
  for (let q = 0; q < WK_CORAL.length; q++) {
    const [cx, cy, ci] = WK_CORAL[q], col = WK_CC[ci], sw = 0.03 * sin(t * 1.1 + q * 1.7);
    glow(ctx, H, col, cx, cy, 0.45, 0.22);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) { const a = hash(q * 11 + i) * TAU, d = 0.06 + 0.13 * hash(q * 13 + i), r = 0.07 + 0.06 * hash(q * 17 + i); circ(ctx, cx + cos(a) * d + sw * (d / 0.19), cy + sin(a) * d, r); }
    ctx.fillStyle = H.rgbStr(col, 0.85); ctx.fill(); ctx.strokeStyle = H.rgbStr(H.mixRGB(col, WHITE, 0.5, C1), 0.6); ctx.lineWidth = lw(0.8); ctx.stroke();
    if (hd) { ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = hash(q * 23 + i) * TAU, d = 0.2 * hash(q * 29 + i); circ(ctx, cx + cos(a) * d + sw, cy + sin(a) * d, 0.012); } ctx.fillStyle = 'rgba(255,250,250,0.8)'; ctx.fill(); }
  }
  if (hd) {
    ctx.beginPath();
    for (const [fx, fy, fa] of WK_FANS) for (let i = 0; i < 9; i++) {
      const a = fa + (i - 4) * 0.2 + 0.03 * sin(t * 0.9 + i), l = 0.35 + 0.1 * hash(i + fx);
      ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + cos(a) * l * 0.5, fy + sin(a) * l * 0.5, fx + cos(a + 0.1) * l, fy + sin(a + 0.1) * l);
    }
    ctx.strokeStyle = 'rgba(170,90,230,0.8)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  }
  ctx.restore();
}

// =================================================================================================== registry
function entry(fn) {
  return function draw(ctx, e, t, s, H, opts) {
    ctx.save();
    if (e.view) { const k = e.view[0]; ctx.scale(k, k); ctx.translate(e.view[1] || 0, 0); fn(ctx, e, t, s * k, subH(H, k), opts); }
    else fn(ctx, e, t, s, H, opts);
    ctx.restore();
  };
}

export default {
  parrotfish: {
    name: 'Parrotfish',
    col: { body: [64, 196, 178], mem: [196, 255, 238], nuc: [255, 132, 140], glow: [110, 240, 210] },
    portraitR: 0.26,
    states: [{ label: 'idle', view: [0.88, 0.12] }, { label: 'biteK 0.5', biteK: 0.5, view: [0.88, 0.08] }, { label: 'biteK 1', biteK: 1, view: [0.88, 0.04] }],
    draw: entry(drawParrot),
  },
  seaurchin: {
    name: 'Long-spined sea urchin',
    col: { body: [118, 60, 150], mem: [206, 170, 240], nuc: [22, 10, 30], glow: [150, 110, 255] },
    portraitR: 0.2,
    portraitRot: 0,
    states: [
      { label: 'armor 3/3', armor: 3, armorMax: 3, view: [0.72, 0] },
      { label: 'armor 2/3', armor: 2, armorMax: 3, view: [0.72, 0] },
      { label: 'armor 1/3', armor: 1, armorMax: 3, view: [0.72, 0] },
      { label: 'armor 0 (cracked)', armor: 0, armorMax: 3, view: [0.72, 0] },
    ],
    draw: entry(drawUrchin),
  },
  triggerfish: {
    name: 'Titan triggerfish',
    col: { body: [170, 164, 92], mem: [244, 236, 182], nuc: [40, 44, 34], glow: [230, 210, 120] },
    portraitR: 0.27,
    states: [{ label: 'idle' }, { label: 'biteK 0.5', biteK: 0.5 }, { label: 'biteK 1', biteK: 1 }],
    draw: entry(drawTrigger),
  },
  lionfish: {
    name: 'Lionfish',
    col: { body: [200, 66, 58], mem: [255, 236, 226], nuc: [96, 22, 28], glow: [255, 140, 120] },
    portraitR: 0.24,
    states: [{ label: 'idle', view: [0.8, 0] }, { label: 'biteK 0.5', biteK: 0.5, view: [0.75, -0.1] }, { label: 'biteK 1', biteK: 1, view: [0.72, -0.15] }],
    draw: entry(drawLion),
  },
  octopus: {
    name: 'Day octopus',
    col: { body: [196, 112, 82], mem: [255, 214, 186], nuc: [104, 40, 34], glow: [255, 170, 130] },
    portraitR: 0.24,
    states: [
      { label: 'idle', view: [0.75, 0.3] },
      { label: 'inkK 0.5', inkK: 0.5, view: [0.6, 0.8] },
      { label: 'inkK 1', inkK: 1, view: [0.52, 1.1] },
      { label: 'grabK 0.5', grabK: 0.5, view: [0.6, -0.5] },
      { label: 'grabK 1', grabK: 1, view: [0.5, -0.9] },
    ],
    draw: entry(drawOcto),
  },
  reefshark: {
    name: 'Blacktip reef shark',
    col: { body: [146, 150, 154], mem: [226, 230, 232], nuc: [18, 20, 26], glow: [170, 200, 225] },
    portraitR: 0.2,
    states: [
      { label: 'idle', view: [0.72, 0.3] },
      { label: 'sprintK 1', sprintK: 1, view: [0.66, 0.4] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.72, 0.2] },
      { label: 'biteK 1', biteK: 1, view: [0.72, 0.1] },
    ],
    draw: entry(drawShark),
  },
  seasnake: {
    name: 'Banded sea krait',
    col: { body: [160, 192, 222], mem: [232, 244, 255], nuc: [16, 18, 28], glow: [150, 200, 255] },
    portraitR: 0.17,
    states: [
      { label: 'idle', view: [0.5, 0.85] },
      { label: 'biteK 1', biteK: 1, view: [0.5, 0.65] },
      { label: 'tail (paddle)', view: [1.2, 2.2] },
      { label: 'biteK 1 (head)', biteK: 1, view: [1.0, -0.4] },
    ],
    draw: entry(drawSnake),
  },
  seaturtle: {
    name: 'Green sea turtle',
    col: { body: [118, 112, 62], mem: [230, 220, 166], nuc: [52, 38, 20], glow: [190, 215, 150] },
    portraitR: 0.24,
    states: [{ label: 'idle', view: [0.8, 0] }, { label: 'cruising (stretch 0.15)', stretch: 0.15, view: [0.8, 0] }],
    draw: entry(drawTurtle),
  },
  humboldt: {
    name: 'Humboldt squid',
    col: { body: [238, 132, 122], mem: [255, 224, 216], nuc: [150, 18, 38], glow: [255, 110, 110] },
    portraitR: 0.22,
    states: [
      { label: 'idle', view: [0.68, -0.08] },
      { label: 'flashK 0.5', flashK: 0.5, view: [0.68, -0.08] },
      { label: 'flashK 1', flashK: 1, view: [0.68, -0.08] },
      { label: 'redK 1 (attack signal)', redK: 1, view: [0.68, -0.08] },
      { label: 'grabK 1 + redK 1', grabK: 1, redK: 1, view: [0.45, -0.9] },
      { label: 'inkK 1', inkK: 1, view: [0.46, 1.0] },
    ],
    draw: entry(drawHumboldt),
  },
  grouper: {
    name: 'Goliath grouper',
    boss: true,
    col: { body: [150, 128, 76], mem: [236, 214, 152], nuc: [50, 38, 22], glow: [230, 196, 110] },
    portraitR: 0.24,
    states: [
      { label: 'idle', view: [0.8, 0.1] },
      { label: 'gapeK 0.5', gapeK: 0.5, view: [0.8, 0] },
      { label: 'gapeK 1 + suckK 1', gapeK: 1, suckK: 1, view: [0.62, -0.5] },
      { label: 'chokeK 1', chokeK: 1, view: [0.8, -0.1] },
      { label: 'stunK 1', stunK: 1, view: [0.8, 0.1] },
      { label: 'wreck lair (wreck + grouper)', withWreck: true, view: [0.34, 0] },
    ],
    wreck: drawWreck,
    draw: entry(drawGrouper),
  },
};
