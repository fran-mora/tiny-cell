// Creature art for the t5 tier: jawed-fish scale (10 cm – 1 m), open sea and deep sea.
// Each entry: { name, col, portraitR, states, draw(ctx, e, t, s, H, opts) } — see README.md.
// Like the player's fish, every animal is seen from above: +x = heading and the body is mirror-symmetric about
// the x axis, so it reads at any rotation. Mouths open in the picture plane (the jaws part sideways / the lower
// jaw swings forward) so a bite reads from above.
// Preview-only extra: `e.view = [k, dx]` zooms the drawing out by k and pans it by dx units (dev gallery tiles).

const TAU = Math.PI * 2;
const { sin, cos, min, max, abs, sqrt, PI, atan2, floor, round } = Math;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const fract = (v) => v - floor(v);
const hash = (i) => fract(sin(i * 127.1 + 311.7) * 43758.5453);
const WHITE = [255, 255, 255];
const INK = [20, 12, 28];
const SHADE = [3, 4, 9];

// ---------------------------------------------------------------- shared helpers
// additive glow from the cached sprite (alpha a, radius r, ky squashes it vertically)
function glow(ctx, H, rgb, x, y, r, a, hard = 0, ky = 1) {
  if (!(a > 0.004) || r <= 0) return;
  const A = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = A * min(1, a);
  ctx.drawImage(H.glowSprite(rgb, hard), x - r, y - r * ky, r * 2, r * 2 * ky);
  ctx.globalAlpha = A; ctx.globalCompositeOperation = op;
}
// soft dark smudge (ink, cave shadow): the same cached sprite drawn normally
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
// a few gradients the H helpers do not cover (rock, cave), cached per context like art.js does
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

// Tail-beat phase integrated over time, so a changing beat rate (sprinting, latching) never makes the tail jump.
// Stateless callers (portraits, frozen objects) get exactly t·f.
function phaseOf(e, t, f) {
  if (!Object.isExtensible(e)) return t * f;
  const dt = t - e._t5t;
  if (dt >= 0 && dt < 0.25) e._t5p += dt * f; else e._t5p = t * f;
  e._t5t = t;
  return e._t5p;
}

// ---- swimming centre line: integrated from the snout backwards (heading PI + travelling wave)
const NS = 64;
const SX = new Float32Array(NS + 1), SY = new Float32Array(NS + 1), SA = new Float32Array(NS + 1), SW = new Float32Array(NS + 1);
let SN = 1;
function spine(n, x0, len, wfn, amp, k, ph, pw, bend = 0, wk = 1) {
  SN = n; const ds = len / n; let x = x0, y = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = PI + bend * u + amp * u ** pw * sin(ph - k * u);
    SX[i] = x; SY[i] = y; SA[i] = a; SW[i] = wfn(u) * wk;
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
function tailFin(ctx, x, y, a, L, W, r0, f, nk, fill, edge, ray, lwE, lwR, rays) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const cn = nk < 1 ? nk + 0.14 : nk + 0.08;
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L * 0.42, -W * 0.5, L, -W * 0.62 + f);
  ctx.quadraticCurveTo(L * cn, -W * 0.16 + f * 0.6, L * nk, f * 0.5);
  ctx.quadraticCurveTo(L * cn, W * 0.16 + f * 0.6, L, W * 0.62 + f);
  ctx.quadraticCurveTo(L * 0.42, W * 0.5, 0, r0);
  ctx.closePath();
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
function eye(ctx, x, y, r, iris, lwO, pk = 0.64, pupil = '#04060c') {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = iris; ctx.fill();
  ctx.strokeStyle = 'rgba(8,16,26,0.75)'; ctx.lineWidth = lwO; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * 0.14, y, r * pk, 0, TAU); ctx.fillStyle = pupil; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.08, y - r * 0.3, r * 0.26, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.3, r * 0.11, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
}
// a thin needle tooth from base (bx, by) to tip (tx, ty), half-width bw at the base (adds to the current path)
function tooth(ctx, bx, by, tx, ty, bw) {
  const dx = tx - bx, dy = ty - by, l = Math.hypot(dx, dy) || 1, px = -dy / l * bw, py = dx / l * bw;
  ctx.moveTo(bx + px, by + py); ctx.quadraticCurveTo(bx + dx * 0.55 + px * 0.4, by + dy * 0.55 + py * 0.4, tx, ty); ctx.lineTo(bx - px, by - py);
}
// silver glints sliding along a flank (schooling fish flash as they turn)
function flankGlint(ctx, H, t, speed, u0, u1, f, r, a) {
  for (const sd of [-1, 1]) {
    const k = fract(t * speed + (sd > 0 ? 0.5 : 0)), u = u0 + (u1 - u0) * k;
    sp(u, sd * f); glow(ctx, H, WHITE, P[0], P[1], r, a * sin(k * PI), 0, 0.55);
  }
}

// =================================================================================================== sardine
const SARD_W = (u) => (u < 0.3 ? 0.33 * sqrt(max(0, 1 - ((0.3 - u) / 0.3) ** 2)) : 0.05 + 0.28 * (1 - ((u - 0.3) / 0.7) ** 1.7));
function drawSardine(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, st = e.stretch || 0, hd = H.hd;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 11 * (1 + st * 3));
  const n = H.lod ? 8 : 22;
  spine(n, 1.08, 1.95, SARD_W, 0.16 + st * 0.4, 4.6, ph, 2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.07 * sin(ph - 5.5);
  if (H.lod) {
    outline(ctx, 0.03);
    ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - 0.55) * 0.6, ty + sin(ta - 0.55) * 0.6);
    ctx.lineTo(tx + cos(ta) * 0.32, ty + sin(ta) * 0.32); ctx.lineTo(tx + cos(ta + 0.55) * 0.6, ty + sin(ta + 0.55) * 0.6); ctx.closePath();
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  const finF = H.rgbStr(c.body, 0.38), finE = H.rgbStr(c.mem, 0.8), finR = H.rgbStr(c.mem, 0.35);
  // forked tail, pectoral and pelvic fins (under the body)
  tailFin(ctx, tx, ty, ta, 0.58, 0.68, 0.05, flex, 0.4, finF, finE, finR, lb(1.2), lw(0.8), hd ? 4 : 2);
  for (const sd of [-1, 1]) {
    const flap = 0.25 * sin(t * 5 + sd * 1.3);
    sp(0.27, sd * 0.8); fin(ctx, P[0], P[1], spA(0.27) + sd * (PI / 2 + 0.85 + flap), sd, 0.32, 0.13, finF, finE, finR, lw(1), lw(0.7), hd ? 3 : 0);
    if (hd) { sp(0.55, sd * 0.85); fin(ctx, P[0], P[1], spA(0.55) + sd * (PI / 2 + 1.05 - flap * 0.5), sd, 0.18, 0.08, finF, finE, finR, lw(0.9), lw(0.6), 2); }
  }
  // body: silver flank, dark blue-green back
  outline(ctx, 0.025);
  ctx.fillStyle = H.rgbStr(c.mem, 0.32); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.12, 0, 1.0, 0.36);
  ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lb(1.5); ctx.stroke();
  outline(ctx, 0.02, 0.48, 1, n - 3);
  ctx.fillStyle = H.rgbStr(c.nuc, 0.62); ctx.fill();
  if (hd) {
    // scales: rows of little arcs across the flanks, and the lateral line
    ctx.beginPath();
    for (let i = 0; i < 9; i++) for (let j = -2; j <= 2; j++) {
      const u = 0.3 + i * 0.065 + (j & 1) * 0.032; sp(u, j * 0.36);
      const r = SW[min(SN, round(u * SN))] * 0.2; ctx.moveTo(P[0] - r * 0.3, P[1] - r); ctx.quadraticCurveTo(P[0] + r * 0.9, P[1], P[0] - r * 0.3, P[1] + r);
    }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.22); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // spots along the flank (pilchard), gill covers
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { sp(0.3 + i * 0.085, sd * 0.62); const r = 0.032 - i * 0.004; ctx.moveTo(P[0] + r, P[1]); ctx.arc(P[0], P[1], r, 0, TAU); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.75); ctx.fill();
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    sp(0.275, sd * 0.97); const x0 = P[0], y0 = P[1]; sp(0.245, sd * 0.55); const cx = P[0], cy = P[1]; sp(0.19, sd * 0.28);
    ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, P[0], P[1]);
  }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(1); ctx.stroke();
  // dorsal fin: a thin sail on the midline, leaning as the fish swims
  {
    const lean = 0.035 + 0.02 * sin(ph * 0.5);
    sp(0.38, 0); const ax = P[0], ay = P[1]; sp(0.52, 0); const bx = P[0], by = P[1];
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2 - 0.03, (ay + by) / 2 - lean * 1.6, bx - 0.05, by - lean); ctx.lineTo(bx, by); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.mem, 0.25); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // eyes
  for (const sd of [-1, 1]) { sp(0.12, sd * 0.7); eye(ctx, P[0], P[1], 0.105, 'rgb(206,226,236)', lw(1)); }
  flankGlint(ctx, H, t, 0.45, 0.2, 0.85, 0.55, 0.32, 0.5);
  shine(ctx, H, e, 0.35, 0.62);
}

// =================================================================================================== squid
function squidMantle(ctx, by) {
  ctx.beginPath();
  ctx.moveTo(0.44, -0.28 * by);
  ctx.bezierCurveTo(0.22, -0.4 * by, -0.45, -0.36 * by, -1.15, 0);
  ctx.bezierCurveTo(-0.45, 0.36 * by, 0.22, 0.4 * by, 0.44, 0.28 * by);
  ctx.quadraticCurveTo(0.52, 0, 0.44, -0.28 * by);
  ctx.closePath();
}
const ARM_L = [0.62, 0.78, 0.9, 0.82, 0.82, 0.9, 0.78, 0.62];
const AB = new Float32Array(16 * 2);
// one tapered limb into the current path; returns nothing, AB holds its centre line
function limb(ctx, x, y, a, len, w0, segs, t, j, curl, wig) {
  const ds = len / segs;
  AB[0] = x; AB[1] = y;
  for (let k = 1; k <= segs; k++) {
    a += wig * sin(t * 1.8 + j * 1.1 + k * 0.7) + curl * (k / segs);
    x += cos(a) * ds; y += sin(a) * ds; AB[k * 2] = x; AB[k * 2 + 1] = y;
  }
  for (let k = 0; k <= segs; k++) {
    const i = min(k, segs - 1), dx = AB[i * 2 + 2] - AB[i * 2], dy = AB[i * 2 + 3] - AB[i * 2 + 1], l = Math.hypot(dx, dy) || 1;
    const w = w0 * (1 - k / segs) ** 0.85 + 0.004;
    const px = -dy / l * w, py = dx / l * w;
    k ? ctx.lineTo(AB[k * 2] + px, AB[k * 2 + 1] + py) : ctx.moveTo(AB[0] + px, AB[1] + py);
  }
  for (let k = segs; k >= 0; k--) {
    const i = min(k, segs - 1), dx = AB[i * 2 + 2] - AB[i * 2], dy = AB[i * 2 + 3] - AB[i * 2 + 1], l = Math.hypot(dx, dy) || 1;
    const w = w0 * (1 - k / segs) ** 0.85 + 0.004;
    ctx.lineTo(AB[k * 2] + dy / l * w, AB[k * 2 + 1] - dx / l * w);
  }
  ctx.closePath();
}
const SEPIA = [104, 74, 100];
function inkCloud(ctx, H, t, k) {
  const np = H.lod ? 3 : 8;
  for (let pass = 0; pass < (H.lod ? 1 : 2); pass++) {
    for (let i = 0; i < np; i++) {
      const u = i / (np - 1);
      const x = -1.05 - (0.25 + 2.0 * u) * (0.55 + 0.45 * k) - 0.1 * sin(t * 0.7 + i);
      const y = (0.1 + 0.55 * u) * sin(i * 2.3 + t * 0.5) * k;
      const r = (0.38 + 0.6 * u) * (0.45 + 0.55 * k) + 0.06 * sin(t * 1.3 + i * 1.7);
      if (pass === 0) smudge(ctx, H, SEPIA, x, y, r * 1.35, r * 1.2 * (0.85 + 0.15 * sin(i * 1.9)), k * (0.9 - 0.35 * u));
      else smudge(ctx, H, INK, x + 0.05, y, r * 0.75, r * 0.65, k * (1 - 0.45 * u));
    }
  }
  // a darker jet core right behind the siphon
  if (!H.lod) smudge(ctx, H, [8, 4, 12], -1.3 - 0.3 * k, 0, 0.42 * k + 0.1, 0.3 * k + 0.08, k);
}
function drawSquid(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, st = e.stretch || 0, hd = H.hd;
  const ink = clamp01(e.inkK || 0), grab = clamp01(e.grabK || 0);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const by = 1 + 0.045 * sin(t * 2.6) - 0.13 * ink; // the mantle pumps, and squeezes as it jets ink
  if (ink > 0.01) inkCloud(ctx, H, t, ink);
  if (H.lod) {
    squidMantle(ctx, by);
    ctx.moveTo(0.4, 0.2); ctx.lineTo(1.5 + 1.2 * grab, 0); ctx.lineTo(0.4, -0.2); ctx.closePath(); // same winding as the mantle
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  const finF = H.rgbStr(c.body, 0.42), finE = H.rgbStr(c.mem, 0.8);
  // rhomboid fins at the rear, rippling
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      const wv = 0.06 * sin(t * 4.5 + sd * 0.8), wv2 = 0.04 * sin(t * 4.5 + sd * 0.8 - 1.2);
      ctx.moveTo(-0.3, sd * 0.22 * by);
      ctx.bezierCurveTo(-0.45, sd * (0.42 + wv2), -0.62, sd * (0.64 + wv), -0.8, sd * (0.66 + wv));
      ctx.bezierCurveTo(-0.95, sd * (0.55 + wv2), -1.08, sd * 0.22, -1.16, 0);
      if (pass === 0) { ctx.lineTo(-0.9, sd * 0.12 * by); ctx.lineTo(-0.6, sd * 0.19 * by); ctx.closePath(); }
    }
    if (pass === 0) { ctx.fillStyle = finF; ctx.fill(); } else { ctx.strokeStyle = finE; ctx.lineWidth = lw(1.1); ctx.stroke(); }
  }
  if (hd) {
    ctx.beginPath();
    for (const sd of [-1, 1]) for (let i = 0; i < 7; i++) { const x = -0.42 - i * 0.1; ctx.moveTo(x, sd * (0.2 - i * 0.012)); ctx.lineTo(x - 0.1, sd * (0.5 - abs(i - 3.3) * 0.06)); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.28); ctx.lineWidth = lw(0.7); ctx.stroke();
  }
  // arms (8) and tentacles (2) reaching forward from the head
  const spread = 0.34 + 0.5 * grab;
  ctx.beginPath();
  for (let j = 0; j < 8; j++) {
    const v = (j - 3.5) / 3.5;
    limb(ctx, 0.68, v * 0.12, v * spread, ARM_L[j] * (1 - 0.15 * grab), 0.052, 6, t, j, -v * (0.22 - 0.3 * grab), 0.07 * (1 - 0.5 * grab));
  }
  ctx.fillStyle = H.rgbStr(c.body, 0.62); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lw(0.9); ctx.stroke();
  // tentacle stalks: tucked among the arms at rest, shot straight ahead when grabbing
  const Lt = 1.1 + 1.95 * grab;
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    let x = 0.7, y = sd * 0.025, a = sd * (0.07 - 0.05 * grab);
    const segs = 9, ds = Lt * 0.8 / segs;
    ctx.moveTo(x, y);
    for (let k = 1; k <= segs; k++) { a += (0.13 * sin(t * 1.5 + sd + k * 0.6) - sd * 0.02) * (1 - grab); x += cos(a) * ds; y += sin(a) * ds; ctx.lineTo(x, y); }
    ctx.strokeStyle = H.rgbStr(c.body, 0.8); ctx.lineWidth = 0.034; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lw(0.9); ctx.stroke();
    // club: widens and opens to grab, lined with suckers
    const cw = 0.055 + 0.05 * grab, cl = Lt * 0.24;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cl * 0.4, -cw * 1.3, cl, -cw * 0.2 * (1 - grab)); ctx.quadraticCurveTo(cl * 0.4, cw * 1.3, 0, 0); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.body, 0.85); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < (hd ? 7 : 4); k++) { const u = 0.2 + k * (hd ? 0.1 : 0.17); for (const r of hd ? [-1, 1] : [0]) { const sx = cl * u, sy = r * cw * 0.35 * sin(u * PI) * (0.6 + grab), sr = 0.016 + 0.01 * grab; ctx.moveTo(sx + sr, sy); ctx.arc(sx, sy, sr, 0, TAU); } }
    ctx.fillStyle = H.rgbStr(c.mem, 0.75); ctx.fill();
    ctx.restore();
  }
  if (hd) {
    // sucker rows along the arms
    ctx.beginPath();
    for (let j = 0; j < 8; j++) {
      const v = (j - 3.5) / 3.5, a = v * spread;
      for (let k = 1; k <= 4; k++) { const d = ARM_L[j] * (1 - 0.15 * grab) * k * 0.2, x = 0.68 + cos(a) * d, y = v * 0.12 + sin(a) * d, r = 0.012 * (1.2 - k * 0.15); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    }
    ctx.fillStyle = H.rgbStr(c.mem, 0.5); ctx.fill();
  }
  // mantle
  squidMantle(ctx, by);
  ctx.fillStyle = H.rgbStr(c.mem, 0.18); ctx.fill();
  gfill(ctx, H, c.body, 1, -0.3, 0, 0.95, 0.4 * by);
  ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lb(1.5); ctx.stroke();
  if (ink > 0.01) { ctx.fillStyle = `rgba(255,250,245,${(0.28 * ink).toFixed(3)})`; ctx.fill(); } // blanches as it flees
  // gladius (the internal pen) along the back
  ctx.beginPath(); ctx.moveTo(0.42, 0); ctx.quadraticCurveTo(-0.3, 0.01, -1.08, 0);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.32); ctx.lineWidth = lw(1.4); ctx.stroke();
  // chromatophores: pigment spots that flicker open and shut
  const nc = hd ? 46 : 22;
  ctx.beginPath();
  for (let i = 0; i < nc; i++) {
    const x = 0.38 - hash(i + 3.1) * 1.35, hw = 0.34 * by * sqrt(max(0, (x + 1.15) / 1.55)) * (x > 0.1 ? 1 - (x - 0.1) * 0.5 : 1);
    const y = (hash(i * 1.7 + 9.2) * 2 - 1) * hw * 0.82, r = (0.016 + 0.022 * hash(i + 21.4)) * (0.45 + 0.55 * (0.5 + 0.5 * sin(t * 2.2 + i * 1.3))) * (1 - 0.6 * ink);
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.72); ctx.fill();
  // head with the big eyes
  ctx.beginPath(); ctx.ellipse(0.59, 0, 0.19, 0.23, 0, 0, TAU);
  gfill(ctx, H, c.body, 1, 0.59, 0, 0.22, 0.26);
  ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lb(1.2); ctx.stroke();
  if (hd) { ctx.beginPath(); ctx.arc(0.73, 0, 0.045 + 0.03 * grab, 0, TAU); ctx.fillStyle = 'rgba(40,14,20,0.85)'; ctx.fill(); } // beak at the hub of the arms
  for (const sd of [-1, 1]) eye(ctx, 0.56, sd * 0.235, 0.13, 'rgb(232,214,168)', lw(1), 0.7, '#05060d');
  ctx.beginPath(); for (let i = 0; i < 5; i++) { const x = 0.48 + hash(i + 50) * 0.2, y = (hash(i + 60) - 0.5) * 0.2, r = 0.014 + 0.01 * hash(i + 70); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill();
  shine(ctx, H, e, -0.1, 0.62);
}

// =================================================================================================== barracuda
const BARRA_W = (u) => (u < 0.34 ? 0.2 * sin((u / 0.34) * PI / 2) ** 0.8 : 0.045 + 0.155 * (1 - ((u - 0.34) / 0.66) ** 1.5));
function drawBarracuda(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = clamp01(e.sprintK || 0), st = (e.stretch || 0) + 0.08 * k;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.35);
  const ph = phaseOf(e, t, 6 + 9 * k);
  const n = H.lod ? 10 : 26;
  spine(n, 1.24, 2.34, BARRA_W, 0.14 * (1 - 0.85 * k), 4.8, ph, 2.2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.08 * sin(ph - 5.6) * (1 - 0.6 * k);
  if (H.lod) {
    outline(ctx, 0.08);
    ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - 0.6) * 0.55, ty + sin(ta - 0.6) * 0.55);
    ctx.lineTo(tx + cos(ta) * 0.3, ty + sin(ta) * 0.3); ctx.lineTo(tx + cos(ta + 0.6) * 0.55, ty + sin(ta + 0.6) * 0.55); ctx.closePath();
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  // speed: motion streaks trailing the body, a pressure wave at the snout
  if (k > 0.01) {
    ctx.beginPath();
    for (let j = 0; j < 9; j++) {
      const y = (j - 4) * 0.11 * (1 + 0.3 * abs(j - 4) / 4), f = fract(t * 2.4 + hash(j + 1) * 3), x0 = 0.6 - abs(j - 4) * 0.25 - f * 2.4, len = (0.45 + 0.4 * hash(j + 7)) * (1 - f * 0.5);
      if (abs(j - 4) < 1) continue;
      ctx.moveTo(x0, y); ctx.lineTo(x0 - len, y);
    }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.45 * k); ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
    glow(ctx, H, c.glow, -0.2, 0, 1.3, 0.22 * k, 0, 0.35);
  }
  const finF = H.rgbStr(c.body, 0.4), finE = H.rgbStr(c.mem, 0.8), finR = H.rgbStr(c.mem, 0.35);
  // the jutting lower jaw (under the snout, its tip sticks out ahead)
  const gape = 0.03 + 0.05 * k;
  ctx.beginPath(); ctx.moveTo(0.85, -0.1);
  ctx.quadraticCurveTo(1.26, -0.075 - gape, 1.45, -0.016); ctx.quadraticCurveTo(1.48, 0, 1.45, 0.016);
  ctx.quadraticCurveTo(1.26, 0.075 + gape, 0.85, 0.1); ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.mem, 0.92); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.8); ctx.lineWidth = lb(1.1); ctx.stroke();
  // fins
  tailFin(ctx, tx, ty, ta, 0.52, 0.62, 0.045, flex, 0.5, H.rgbStr(c.nuc, 0.45), finE, finR, lb(1.1), lw(0.8), hd ? 4 : 2);
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(0.44, sd * 0.36 + flex); ctx.lineTo(0.53, sd * 0.4 + flex * 1.2); }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw(2); ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
  for (const sd of [-1, 1]) {
    const flap = 0.2 * sin(t * 4 + sd) * (1 - k);
    sp(0.25, sd * 0.85); fin(ctx, P[0], P[1], spA(0.25) + sd * (PI / 2 + 0.95 + 0.45 * k + flap), sd, 0.26, 0.1, finF, finE, finR, lw(1), lw(0.7), hd ? 3 : 0);
    sp(0.5, sd * 0.85); fin(ctx, P[0], P[1], spA(0.5) + sd * (PI / 2 + 1.0 + 0.4 * k - flap * 0.5), sd, 0.18, 0.07, finF, finE, finR, lw(0.9), lw(0.6), 0);
  }
  // body
  outline(ctx, 0.0);
  ctx.fillStyle = H.rgbStr(c.mem, 0.3); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.1, 0, 1.25, 0.22);
  ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lb(1.4); ctx.stroke();
  // dark back
  outline(ctx, 0.02, 0.45, 2, n - 2);
  ctx.fillStyle = H.rgbStr(c.nuc, 0.42); ctx.fill();
  // dark bars: chevrons across the back
  const nb = hd ? 11 : 8;
  ctx.beginPath();
  for (let i = 0; i < nb; i++) {
    const u = 0.3 + (i / (nb - 1)) * 0.55, d = hd ? 0.026 : 0.034;
    sp(u + 0.035, -0.92); ctx.moveTo(P[0], P[1]); sp(u, 0); ctx.lineTo(P[0], P[1]); sp(u + 0.035, 0.92); ctx.lineTo(P[0], P[1]);
    sp(u + 0.035 + d, 0.92); ctx.lineTo(P[0], P[1]); sp(u + d, 0); ctx.lineTo(P[0], P[1]); sp(u + 0.035 + d, -0.92); ctx.lineTo(P[0], P[1]); ctx.closePath();
  }
  // black blotches on the rear flank
  for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { sp(0.74 + i * 0.08, sd * (0.55 + 0.2 * (i & 1))); const r = 0.028; ctx.moveTo(P[0] + r, P[1]); ctx.arc(P[0], P[1], r, 0, TAU); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.55); ctx.fill();
  if (hd) {
    ctx.beginPath();
    for (const sd of [-1, 1]) for (let i = 0; i <= 12; i++) { sp(0.24 + i * 0.058, sd * 0.62); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.35); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // two widely spaced dorsal fins, seen edge-on along the spine
  ctx.beginPath();
  for (const [u0, u1, h] of [[0.36, 0.47, 0.05], [0.68, 0.75, 0.035]]) {
    sp(u0, 0); const ax = P[0], ay = P[1]; sp(u1, 0); const bx = P[0], bly = P[1];
    ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax - 0.02, ay - h, bx - 0.04, bly - h * 0.5); ctx.lineTo(bx, bly); ctx.closePath();
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.55); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
  // mouth line with fangs poking out along it
  ctx.beginPath();
  for (const sd of [-1, 1]) { ctx.moveTo(1.22, sd * 0.012); sp(0.08, sd * 0.7); const mx = P[0], my = P[1]; sp(0.17, sd * 0.72); ctx.quadraticCurveTo(mx, my, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.75); ctx.lineWidth = lw(1.1); ctx.stroke();
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < (hd ? 6 : 4); i++) {
    const u = 0.025 + i * (hd ? 0.024 : 0.035); sp(u, sd * 0.86); const bx = P[0], bly = P[1]; const L = (i === 1 ? 0.075 : 0.045) * (1 + k * 0.3);
    tooth(ctx, bx + 0.012, bly, bx - 0.01, bly + sd * L, 0.012);
  }
  ctx.moveTo(1.43, -0.017); ctx.lineTo(1.39, -0.07); ctx.lineTo(1.4, -0.006); ctx.moveTo(1.43, 0.017); ctx.lineTo(1.39, 0.07); ctx.lineTo(1.4, 0.006);
  ctx.fillStyle = 'rgba(248,252,255,0.95)'; ctx.fill();
  for (const sd of [-1, 1]) { sp(0.165, sd * 0.6); eye(ctx, P[0], P[1], 0.078, 'rgb(236,214,128)', lw(1), 0.6); }
  flankGlint(ctx, H, t, 0.3, 0.25, 0.9, 0.5, 0.3, 0.45 + 0.3 * k);
  shine(ctx, H, e, 0.3, 0.55);
}

// =================================================================================================== moray
const MOR_LEN = 3.95, DEN_X = -0.82, LUNGE = 2.15, MOR_CORNER = 0.42;
function morayW(u) {
  const s = u * MOR_LEN;
  if (s < 0.32) return 0.13 + 0.17 * sqrt(s / 0.32);
  if (s < 0.7) return 0.3 + 0.02 * ((s - 0.32) / 0.38);
  if (s < 2.7) return 0.32 - 0.06 * ((s - 0.7) / 2.0);
  return 0.26 * max(0, 1 - ((s - 2.7) / 1.25) ** 1.3);
}
const ROCKS = [ // x, y, r, seed (den in moray unit space, mouth at DEN_X opening toward +x)
  [-2.65, -0.62, 0.72, 6], [-2.7, 0.66, 0.68, 7], [-3.3, 0.02, 0.62, 8], [-1.75, -1.2, 0.6, 3], [-1.8, 1.18, 0.58, 4],
  // front: the two boulders flanking the mouth and the slab roofing the crevice (drawn over the eel)
  [-1.1, -1.04, 0.48, 1], [-1.05, 1.06, 0.46, 2], [-2.0, 0.0, 0.68, 5],
];
function rock(ctx, H, x, y, r, sd) {
  let m = 0;
  for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + sd, rr = r * (0.8 + 0.3 * hash(sd * 13 + k)); OX[m] = x + cos(a) * rr; OY[m] = y + sin(a) * rr * 0.92; m++; }
  smooth(ctx, m);
  ctx.save(); ctx.translate(x, y); ctx.scale(r, r);
  const warm = sd & 1;
  ctx.fillStyle = cgrad(ctx, warm ? 'rock1' : 'rock0', (g) => {
    const gr = g.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1.08);
    if (warm) { gr.addColorStop(0, 'rgb(150,140,138)'); gr.addColorStop(0.55, 'rgb(96,88,92)'); gr.addColorStop(1, 'rgb(40,36,46)'); }
    else { gr.addColorStop(0, 'rgb(134,142,160)'); gr.addColorStop(0.55, 'rgb(80,88,108)'); gr.addColorStop(1, 'rgb(32,36,52)'); }
    return gr;
  });
  ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(12,14,26,0.7)'; ctx.lineWidth = H.lw(1.1); ctx.stroke();
}
// encrusting life on the rocks: coralline algae, sponges, little polyps
function crust(ctx, H, i0, i1, t) {
  const C = ['rgba(214,120,150,0.6)', 'rgba(226,168,90,0.55)', 'rgba(120,170,120,0.5)'];
  for (let ci = 0; ci < 3; ci++) {
    ctx.beginPath();
    for (let i = i0; i < i1; i++) {
      const [x, y, r, sd] = ROCKS[i];
      for (let k = 0; k < 2; k++) {
        const h = sd * 7 + k * 3 + ci, a = hash(h) * TAU, d = r * (0.3 + 0.5 * hash(h + 1)), rr = r * (0.035 + 0.04 * hash(h + 2));
        const px = x + cos(a) * d, py = y + sin(a) * d; ctx.moveTo(px + rr, py); ctx.arc(px, py, rr, 0, TAU);
      }
    }
    ctx.fillStyle = C[ci]; ctx.fill();
  }
  if (H.hd) {
    // feather-duster worms fanning on the front boulders
    ctx.beginPath();
    for (let i = 5; i < 7; i++) {
      const [x, y, r, sd] = ROCKS[i], cx = x + r * 0.15, cy = y - r * 0.3 * Math.sign(y);
      for (let k = 0; k < 9; k++) { const a = -PI / 2 * Math.sign(y) + (k - 4) * 0.28 + 0.12 * sin(t * 1.6 + k + sd); ctx.moveTo(cx, cy); ctx.lineTo(cx + cos(a) * r * 0.32, cy + sin(a) * r * 0.32); }
    }
    ctx.strokeStyle = 'rgba(255,170,200,0.85)'; ctx.lineWidth = H.lw(1.2); ctx.stroke();
  }
}
function denBack(ctx, t, H) {
  smudge(ctx, H, SHADE, -2.2, 0, 2.3, 1.9, 0.55);
  // the crevice: a dark hole under the rocks
  ctx.beginPath(); ctx.ellipse(DEN_X - 0.62, 0, 0.8, 0.8, 0, 0, TAU);
  ctx.save(); ctx.translate(DEN_X - 0.62, 0); ctx.scale(0.8, 0.8);
  ctx.fillStyle = cgrad(ctx, 'cave', (g) => {
    const gr = g.createRadialGradient(-0.2, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(0,0,2,1)'); gr.addColorStop(0.7, 'rgba(2,3,8,0.95)'); gr.addColorStop(1, 'rgba(6,8,18,0)');
    return gr;
  });
  ctx.fill(); ctx.restore();
  for (let i = 0; i < 5; i++) { const [x, y, r, sd] = ROCKS[i]; if (H.lod && i > 2) break; rock(ctx, H, x, y, r, sd); }
  if (!H.lod) crust(ctx, H, 0, 5, t);
}
function denFront(ctx, t, H) {
  for (let i = 5; i < ROCKS.length; i++) { const [x, y, r, sd] = ROCKS[i]; rock(ctx, H, x, y, r, sd); }
  if (!H.lod) crust(ctx, H, 5, ROCKS.length, t);
}
export function drawDen(ctx, t, H) { ctx.save(); ctx.lineJoin = 'round'; denBack(ctx, t, H); denFront(ctx, t, H); ctx.restore(); }

// rotate (x, y) about (cx, cy) by a → P
function rot(x, y, cx, cy, a) { const c = cos(a), s = sin(a), dx = x - cx, dy = y - cy; P[0] = cx + dx * c - dy * s; P[1] = cy + dx * s + dy * c; return P; }
function drawMoray(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, lod = H.lod;
  const codex = e.r === undefined; // codex portrait: show it peeking out of its den
  const em = codex ? 0.3 : clamp01(e.emergeK || 0), bite = clamp01(e.biteK || 0);
  const withDen = codex || !!e.withDen;
  const dx = -LUNGE * em, xd = DEN_X + dx; // the den (and the body's way in) slides back as it lunges out
  if (withDen) { ctx.save(); ctx.translate(dx, 0); denBack(ctx, t, H); ctx.restore(); }
  // sinuous centre line from the snout, sheared so the body enters the den mouth on the axis
  const n = lod ? 18 : 44, ds = MOR_LEN / n;
  const amp = 0.5 * (0.35 + 0.65 * em) * (1 - 0.35 * bite), ph = t * 2.3, hs = 0.12 * sin(t * 0.9) * (1 - 0.6 * em);
  SN = n;
  { let x = 0.98, y = 0; for (let i = 0; i <= n; i++) { const sa = i * ds, a = PI + hs + amp * min(1, sa / 1.1) * sin(ph - 2.1 * sa); SX[i] = x; SY[i] = y; SW[i] = morayW(i / n); x += cos(a) * ds; y += sin(a) * ds; } }
  // where the centre line crosses the den mouth (fractional index, so emergeK animates smoothly)
  let ic = n, icf = n, yc = SY[n];
  for (let i = 1; i <= n; i++) if (SX[i] < xd) { const f = (SX[i - 1] - xd) / (SX[i - 1] - SX[i]); ic = i; icf = i - 1 + f; yc = SY[i - 1] + (SY[i] - SY[i - 1]) * f; break; }
  for (let i = 1; i <= n; i++) {
    if (i < icf) SY[i] -= yc * (i / icf);
    else if (icf < n) { SX[i] = xd - (i - icf) * ds; SY[i] = 0; }
    else SY[i] -= yc;
  }
  for (let i = 0; i < n; i++) { let a = atan2(SY[i + 1] - SY[i], SX[i + 1] - SX[i]); if (a < 0) a += TAU; SA[i] = a; }
  SA[n] = SA[n - 1];
  const iv = min(n, ic + Math.ceil(0.55 / ds)); // a little past the den mouth, into the dark
  if (lod) {
    outline(ctx, 0.08, 1, 0, iv); ctx.fillStyle = H.cstr(c.body); ctx.fill();
    if (iv < n) smudge(ctx, H, SHADE, xd - 0.3, 0, 0.5, 0.5, 0.9);
    return;
  }
  // jaws: the front of the head splits about the mouth corner (morays breathe with the mouth ajar)
  const g = clamp01(0.12 + 0.07 * (0.5 + 0.5 * sin(t * 1.9)) + 0.88 * bite), th = 0.62 * g;
  const im = max(2, round(MOR_CORNER / ds)), mx = SX[im], my = SY[im];
  const ramp = (i) => min(1, (im - i) / 1.5);
  let m = 0;
  // top jaw inner edge (corner → tip), snout cap, top flank, bottom flank, bottom cap, bottom jaw inner edge
  for (let i = im - 1; i >= 0; i--) { rot(SX[i], SY[i], mx, my, -th * ramp(i)); OX[m] = P[0]; OY[m] = P[1] - 0.004; m++; }
  const capx = SX[0] + 0.09, w0 = SW[0];
  rot(capx, SY[0] - w0 * 0.55, mx, my, -th); OX[m] = P[0]; OY[m] = P[1]; m++;
  for (let i = 0; i <= iv; i++) { const a = SA[i], w = SW[i]; const x = SX[i] - sin(a) * w, y = SY[i] + cos(a) * w; if (i < im) rot(x, y, mx, my, -th * ramp(i)); else { P[0] = x; P[1] = y; } OX[m] = P[0]; OY[m] = P[1]; m++; }
  for (let i = iv; i >= 0; i--) { const a = SA[i], w = SW[i]; const x = SX[i] + sin(a) * w, y = SY[i] - cos(a) * w; if (i < im) rot(x, y, mx, my, th * ramp(i)); else { P[0] = x; P[1] = y; } OX[m] = P[0]; OY[m] = P[1]; m++; }
  rot(capx, SY[0] + w0 * 0.55, mx, my, th); OX[m] = P[0]; OY[m] = P[1]; m++;
  for (let i = 0; i < im; i++) { rot(SX[i], SY[i], mx, my, th * ramp(i)); OX[m] = P[0]; OY[m] = P[1] + 0.004; m++; }
  OX[m] = mx; OY[m] = my; m++;
  // the gaping mouth behind the jaws
  if (g > 0.05) {
    ctx.beginPath(); ctx.moveTo(mx - 0.06, my);
    rot(capx - 0.02, SY[0] - 0.02, mx, my, -th); ctx.lineTo(P[0], P[1]);
    rot(capx - 0.02, SY[0] + 0.02, mx, my, th); ctx.lineTo(P[0], P[1]); ctx.closePath();
    ctx.fillStyle = 'rgb(46,12,22)'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(mx - 0.02, my, 0.09, 0.05 + 0.06 * g, 0, 0, TAU); ctx.fillStyle = 'rgb(18,4,10)'; ctx.fill();
    if (hd && bite > 0.25) {
      // pharyngeal jaws: the second set of jaws shoots up from the throat
      const px = mx + 0.05 + 0.16 * bite;
      ctx.beginPath(); ctx.ellipse(px, my, 0.07, 0.05 + 0.03 * g, 0, 0, TAU); ctx.fillStyle = 'rgba(232,200,190,0.9)'; ctx.fill();
      ctx.beginPath(); for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) tooth(ctx, px - 0.04 + k * 0.035, my + sd * 0.045, px - 0.03 + k * 0.035, my + sd * 0.005, 0.009);
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
    }
  }
  smooth(ctx, m);
  ctx.fillStyle = H.rgbStr(c.body, 0.96); ctx.fill();
  ctx.save(); ctx.globalAlpha *= 0.55; ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = 0.09; ctx.stroke(); ctx.restore();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.4); ctx.stroke();
  // light along the back (rounded body), then the mottling
  outline(ctx, 0, 0.42, im + 1, max(im + 2, iv - 1));
  ctx.fillStyle = H.rgbStr(c.mem, 0.22); ctx.fill();
  const vis = iv * ds, nm = hd ? 70 : 34;
  ctx.beginPath();
  for (let j = 0; j < nm; j++) {
    const sa = 0.5 + (j / nm) * (MOR_LEN - 0.7) + (hash(j + 2) - 0.5) * 0.12;
    if (sa > vis - 0.05) break;
    const u = sa / MOR_LEN, f = (hash(j * 1.3 + 5) * 2 - 1) * 0.72, r = (0.045 + 0.05 * hash(j + 11)) * (SW[min(n, round(u * n))] / 0.3);
    sp(u, f); const a = spA(u);
    ctx.moveTo(P[0] + cos(a) * r * 1.4, P[1] + sin(a) * r * 1.4); ctx.ellipse(P[0], P[1], r * 1.4, r, a, 0, TAU);
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.62); ctx.fill();
  if (hd) {
    ctx.beginPath();
    for (let j = 0; j < 40; j++) {
      const sa = 0.55 + (j / 40) * (MOR_LEN - 0.8); if (sa > vis - 0.05) break;
      const u = sa / MOR_LEN; sp(u, (hash(j + 33) * 2 - 1) * 0.8); const r = 0.018;
      ctx.moveTo(P[0] + r, P[1]); ctx.arc(P[0], P[1], r, 0, TAU);
    }
    ctx.fillStyle = H.rgbStr(c.mem, 0.55); ctx.fill();
  }
  // continuous dorsal fin along the midline, its edge waving
  ctx.beginPath();
  for (let i = im + 2; i <= iv; i++) { const lean = 0.05 * sin(ph * 1.3 - i * 0.35); const a = SA[i]; const x = SX[i] - sin(a) * lean, y = SY[i] + cos(a) * lean; i > im + 2 ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.32); ctx.lineWidth = 0.07; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.75); ctx.lineWidth = lw(1); ctx.stroke();
  // spots on the head, gill holes
  ctx.beginPath();
  for (let j = 0; j < 7; j++) {
    const i = 1 + (j % (im - 1 || 1)), sd = j & 1 ? 1 : -1; const f = 0.3 + 0.45 * hash(j + 40);
    const a = SA[i], w = SW[i] * f * sd; rot(SX[i] + sin(a) * w, SY[i] - cos(a) * w, mx, my, sd * th * ramp(i));
    const r = 0.025 + 0.02 * hash(j + 44); ctx.moveTo(P[0] + r, P[1]); ctx.arc(P[0], P[1], r, 0, TAU);
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill();
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.78 / MOR_LEN, sd * 0.72); ctx.moveTo(P[0] + 0.035, P[1]); ctx.ellipse(P[0], P[1], 0.035, 0.024, spA(0.2), 0, TAU); }
  ctx.fillStyle = 'rgba(25,12,8,0.85)'; ctx.fill();
  // teeth along both jaws (interlocking needles, visible even when it rests)
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < im; i++) {
    const L = (i === 1 ? 0.075 : 0.05) * (0.8 + 0.4 * g);
    rot(SX[i] + 0.02, SY[i] + sd * 0.012, mx, my, sd * th * ramp(i)); const bx = P[0], bly = P[1];
    rot(SX[i] - 0.015, SY[i] - sd * L, mx, my, sd * th * ramp(i));
    tooth(ctx, bx, bly, P[0], P[1], 0.013);
  }
  ctx.fillStyle = 'rgba(252,250,240,0.96)'; ctx.fill();
  // tube nostrils at the jaw tips
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    rot(capx - 0.05, SY[0] + sd * w0 * 0.5, mx, my, sd * th); const bx = P[0], bly = P[1];
    rot(capx + 0.03, SY[0] + sd * (w0 * 0.5 + 0.012), mx, my, sd * th); ctx.moveTo(bx, bly); ctx.lineTo(P[0], P[1]);
  }
  ctx.strokeStyle = H.rgbStr(c.body, 1); ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lw(1); ctx.stroke();
  // eyes on top of the head, behind the mouth corner
  const ie = min(n, im + 1);
  for (const sd of [-1, 1]) { const a = SA[ie], w = SW[ie] * 0.5 * sd; eye(ctx, SX[ie] + sin(a) * w + 0.02, SY[ie] - cos(a) * w, 0.07 + 0.01 * bite, 'rgb(214,226,170)', lw(1), 0.58); }
  // where the body disappears into the hole
  if (iv < n) smudge(ctx, H, SHADE, xd - 0.5, 0, 0.6, 0.5, 0.97);
  shine(ctx, H, e, 0.5, 0.5);
  if (withDen) { ctx.save(); ctx.translate(dx, 0); denFront(ctx, t, H); ctx.restore(); }
}

// =================================================================================================== cookie-cutter shark
const COOK_W = (u) => (u < 0.2 ? 0.29 * sqrt(max(0, 1 - 0.88 * ((0.2 - u) / 0.2) ** 2)) : u < 0.68 ? 0.29 - 0.035 * ((u - 0.2) / 0.48) : 0.065 + 0.19 * (1 - ((u - 0.68) / 0.32) ** 1.25));
function drawCookie(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const lat = e.latched === true ? 1 : clamp01(+e.latched || 0);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const bend = lat * (0.8 + 0.3 * sin(t * 1.3)) + lat * 0.04 * sin(t * 23);
  const ph = phaseOf(e, t, 6 - 3 * lat);
  const n = H.lod ? 10 : 24;
  spine(n, 1.06, 2.15, COOK_W, 0.14 * (1 - 0.6 * lat), 4.2, ph, 2, bend);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.07 * sin(ph - 5);
  const gk = (0.75 + 0.25 * sin(t * 1.7)) * (1 + 0.6 * lat);
  if (H.lod) {
    glow(ctx, H, c.glow, -0.1, 0, 1.1, 0.3 * gk, 0, 0.6);
    outline(ctx, 0.06);
    ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - 0.5) * 0.45, ty + sin(ta - 0.5) * 0.45); ctx.lineTo(tx + cos(ta + 0.45) * 0.4, ty + sin(ta + 0.45) * 0.4); ctx.closePath();
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  // the glowing belly lights the water around it (the collar stays dark)
  for (let i = 0; i < 2; i++) {
    const u = 0.48 + i * 0.27; sp(u, 0); const a = spA(u);
    ctx.save(); ctx.translate(P[0], P[1]); ctx.rotate(a); glow(ctx, H, c.glow, 0, 0, 0.75, 0.3 * gk, 0, 0.62); ctx.restore();
  }
  sp(0.08, 0); glow(ctx, H, c.glow, P[0], P[1], 0.34, 0.18 * gk);
  const finF = H.rgbStr(c.body, 0.55), finE = H.rgbStr(c.mem, 0.7), finR = H.rgbStr(c.mem, 0.3);
  tailFin(ctx, tx, ty, ta, 0.46, 0.44, 0.06, flex, 0.86, finF, finE, finR, lb(1.1), lw(0.7), 0);
  for (const sd of [-1, 1]) {
    const flap = 0.18 * sin(t * 3.5 + sd);
    sp(0.34, sd * 0.85); fin(ctx, P[0], P[1], spA(0.34) + sd * (PI / 2 + 0.55 + flap), sd, 0.3, 0.17, finF, finE, finR, lw(1), lw(0.6), hd ? 3 : 0);
    sp(0.66, sd * 0.8); fin(ctx, P[0], P[1], spA(0.66) + sd * (PI / 2 + 0.75 - flap * 0.5), sd, 0.17, 0.09, finF, finE, finR, lw(0.9), lw(0.6), 0);
  }
  outline(ctx, 0.06);
  ctx.fillStyle = H.rgbStr(c.body, 0.78); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 1.15, 0.32);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.4); ctx.stroke();
  // darker back
  outline(ctx, 0.02, 0.5, 1, n - 2); ctx.fillStyle = H.rgbStr(c.nuc, 0.22); ctx.fill();
  // the dark collar around the throat
  ctx.beginPath();
  sp(0.215, -0.99); ctx.moveTo(P[0], P[1]); sp(0.19, 0); const fx = P[0], fy = P[1]; sp(0.215, 0.99); ctx.quadraticCurveTo(fx, fy, P[0], P[1]);
  sp(0.305, 0.97); ctx.lineTo(P[0], P[1]); sp(0.28, 0); const bx = P[0], bly = P[1]; sp(0.305, -0.97); ctx.quadraticCurveTo(bx, bly, P[0], P[1]); ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.nuc, 0.82); ctx.fill();
  // the luminous belly shows as a glowing rim along both flanks (not under the collar)
  {
    const A = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      for (let i = 0; i <= 12; i++) { sp(0.33 + i * 0.05, sd * 0.93); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
      for (let i = 0; i <= 4; i++) { sp(0.03 + i * 0.04, sd * 0.9); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    }
    ctx.lineCap = 'round';
    ctx.globalAlpha = A * min(1, 0.3 * gk); ctx.strokeStyle = H.cstr(c.glow); ctx.lineWidth = lw(5); ctx.stroke();
    ctx.globalAlpha = A * min(1, 0.55 * gk); ctx.strokeStyle = H.cstr(H.mixRGB(c.glow, WHITE, 0.4)); ctx.lineWidth = lw(1.4); ctx.stroke();
    ctx.globalAlpha = A; ctx.globalCompositeOperation = 'source-over';
  }
  if (hd) {
    ctx.beginPath();
    for (const sd of [-1, 1]) for (let r = 0; r < 2; r++) for (let i = 0; i < 26; i++) {
      const u = 0.33 + (i / 26) * 0.6 + r * 0.011, f = sd * (0.8 - r * 0.12 + 0.03 * hash(i + r * 40)); sp(u, f); const pr = 0.009;
      ctx.moveTo(P[0] + pr, P[1]); ctx.arc(P[0], P[1], pr, 0, TAU);
    }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.glow, WHITE, 0.5), 0.6); ctx.fill();
  }
  if (hd) {
    // gill slits just in front of the collar
    ctx.beginPath();
    for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { sp(0.15 + i * 0.012, sd * 0.97); ctx.moveTo(P[0], P[1]); sp(0.15 + i * 0.012 - 0.006, sd * 0.75); ctx.lineTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  ctx.beginPath();
  for (const [u0, u1] of [[0.62, 0.7], [0.74, 0.8]]) { sp(u0, 0); const ax = P[0], ay = P[1]; sp(u1, 0); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax - 0.03, ay - 0.04, P[0] - 0.02, P[1] - 0.02); ctx.lineTo(P[0], P[1]); ctx.closePath(); }
  ctx.fillStyle = H.rgbStr(c.body, 0.8); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.8); ctx.stroke();
  // mouth: a suction disc of lips ringed with saw teeth when it bites on
  if (lat > 0.01) {
    const L = lat, cx = 1.08, rx = 0.11 * L + 0.02, ry = 0.27 * L + 0.04;
    ctx.beginPath(); ctx.ellipse(cx, 0, rx, ry, 0, 0, TAU);
    ctx.fillStyle = 'rgba(205,140,140,0.95)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,215,210,0.9)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx + 0.01, 0, rx * 0.62, ry * 0.7, 0, 0, TAU); ctx.fillStyle = 'rgb(40,10,16)'; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 14 : 9); i++) { const a = PI * 0.5 + (i / ((hd ? 14 : 9) - 1) - 0.5) * PI * 1.6 + PI / 2, ex = cx + 0.01 + cos(a) * rx * 0.62, ey = sin(a) * ry * 0.7; tooth(ctx, ex, ey, cx + 0.01 + cos(a) * rx * 0.25, sin(a) * ry * 0.35, 0.028 * L); }
    ctx.fillStyle = 'rgba(250,248,240,0.95)'; ctx.fill();
  }
  for (const sd of [-1, 1]) { sp(0.11, sd * 0.62); eye(ctx, P[0], P[1], 0.1, 'rgb(150,236,182)', lw(1), 0.6); }
  shine(ctx, H, e, 0.3, 0.55);
}

// =================================================================================================== anglerfish
// a round ball of a body (seen from above), the short tail at −x
const ANG_W = (u) => {
  const x = 0.92 - 1.84 * u;
  if (x >= 0) return 0.86 * max(0, 1 - (x / 0.95) ** 2.4) ** (1 / 2.4);
  return max(0.14, 0.86 * max(0, 1 - (-x / 0.98) ** 1.8) ** (1 / 1.8));
};
// mouth curves, −y half as cubic control points [x0,y0, x1,y1, x2,y2, x3,y3] (corner → front); +y mirrors
const MU = new Float32Array(8), MI = new Float32Array(8), MO = new Float32Array(8);
function set8(M, a, b, c, d, e, f, g, h) { M[0] = a; M[1] = b; M[2] = c; M[3] = d; M[4] = e; M[5] = f; M[6] = g; M[7] = h; }
function mouthCurves(g) {
  set8(MU, 0.4, -0.68, 0.66, -0.64, 0.87, -0.38, 0.87, 0); // upper lip (edge of the head)
  set8(MI, 0.4, -0.68, 0.68 + 0.22 * g, -0.72 - 0.08 * g, 0.93 + 0.45 * g, -0.44 - 0.1 * g, 0.93 + 0.45 * g, 0); // lower jaw, inner rim
  set8(MO, 0.36, -0.73, 0.7 + 0.25 * g, -0.84 - 0.08 * g, 1.02 + 0.5 * g, -0.5 - 0.1 * g, 1.02 + 0.5 * g, 0); // lower jaw, outer rim
}
// trace curve C: half sd (−1 = −y), forward (corner → front) or back; `move` starts a subpath
function curve(ctx, C, sd, fwd, move) {
  const k = -sd; // stored as the −y half; sd = +1 mirrors it
  if (fwd) { move ? ctx.moveTo(C[0], k * C[1]) : ctx.lineTo(C[0], k * C[1]); ctx.bezierCurveTo(C[2], k * C[3], C[4], k * C[5], C[6], k * C[7]); }
  else { move ? ctx.moveTo(C[6], k * C[7]) : ctx.lineTo(C[6], k * C[7]); ctx.bezierCurveTo(C[4], k * C[5], C[2], k * C[3], C[0], k * C[1]); }
}
// point on curve C at u (0 = corner, 1 = front), half sd → P
function cpt(C, u, sd) {
  const w = 1 - u, a = w * w * w, b = 3 * w * w * u, c = 3 * w * u * u, d = u * u * u;
  P[0] = a * C[0] + b * C[2] + c * C[4] + d * C[6]; P[1] = -sd * (a * C[1] + b * C[3] + c * C[5] + d * C[7]);
  return P;
}
// region between two mouth curves (A outer edge, B inner edge), both halves
function band(ctx, A, B) {
  ctx.beginPath(); curve(ctx, A, -1, true, true); curve(ctx, A, 1, false, false); curve(ctx, B, 1, true, false); curve(ctx, B, -1, false, false); ctx.closePath();
}
function lureXY(e, t, out) {
  const g = clamp01(e.mouthK || 0), st = e.stretch || 0;
  out.x = (1.66 + 0.08 * g + 0.03 * sin(t * 1.9)) * (1 + st * 0.4);
  out.y = (0.13 * sin(t * 1.1) + 0.04 * sin(t * 2.7 + 1)) * (1 - st * 0.3);
  return out;
}
// lure position in unit space at game time T (the same T the game passes to drawSpecies)
export function lurePos(e, T) { return lureXY(e, T + (e.seed || 0) * 10, { x: 0, y: 0 }); }
const LP = { x: 0, y: 0 };
const UPPER_T = [0.09, 0.2, 0.11, 0.24, 0.12, 0.19, 0.1], LOWER_T = [0.1, 0.22, 0.12, 0.3, 0.14, 0.25, 0.11];
function drawAngler(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const g = clamp01(e.mouthK || 0), lk = clamp01(e.lureK || 0);
  if (st) ctx.scale(1 + st * 0.4, 1 - st * 0.3);
  const ph = t * 2.4;
  const n = H.lod ? 10 : 26;
  spine(n, 0.92, 1.84, ANG_W, 0.22, 3, ph, 3);
  const L = lureXY(e, t, LP), lx = L.x / (1 + st * 0.4), ly = L.y / (1 - st * 0.3);
  const fl = 0.88 + 0.12 * sin(t * 4.3) * sin(t * 1.3 + 1), b = (0.3 + 0.7 * lk) * fl; // lure brightness
  const dark = H.mixRGB(c.nuc, c.body, 0.3);
  if (H.lod) {
    outline(ctx, 0.04); ctx.fillStyle = H.cstr(c.body); ctx.fill();
    glow(ctx, H, c.glow, lx, ly, 0.6 + 0.4 * b, 0.6 + 0.4 * b, 1);
    return;
  }
  const finF = H.rgbStr(c.body, 0.5), finE = H.rgbStr(c.mem, 0.65), finR = H.rgbStr(c.mem, 0.32);
  // rounded tail fan and little fluttering pectorals
  tailFin(ctx, SX[n] + 0.04, SY[n], SA[n], 0.55, 0.6, 0.12, 0.06 * sin(ph - 3.5), 1.12, finF, finE, finR, lb(1.1), lw(0.7), hd ? 4 : 2);
  for (const sd of [-1, 1]) { const flap = 0.28 * sin(t * 4.6 + sd * 1.2); sp(0.6, sd * 0.86); fin(ctx, P[0], P[1], spA(0.6) + sd * (PI / 2 + 0.95 + flap), sd, 0.3, 0.2, finF, finE, finR, lw(1), lw(0.6), hd ? 5 : 3); }
  // body: a dark velvet ball with a lighter rim
  outline(ctx, 0.04);
  ctx.fillStyle = H.rgbStr(dark, 0.96); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.0, 0, 0.92, 0.88);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.6); ctx.stroke();
  // mottles, sensory papillae (lateral-line organs) and, close up, a skin of tiny spinules
  ctx.beginPath();
  for (let i = 0; i < (hd ? 24 : 11); i++) { const u = 0.3 + hash(i + 1) * 0.55, f = (hash(i * 2.3 + 4) * 2 - 1) * 0.75; sp(u, f); const r = 0.03 + 0.06 * hash(i + 9); ctx.moveTo(P[0] + r, P[1]); ctx.ellipse(P[0], P[1], r, r * 0.75, hash(i) * 3, 0, TAU); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.35); ctx.fill();
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < (hd ? 11 : 6); i++) {
    const v = i / ((hd ? 11 : 6) - 1); sp(0.22 + v * 0.55, sd * (0.62 - 0.22 * sin(v * PI)));
    const r = hd ? 0.016 : 0.022; ctx.moveTo(P[0] + r, P[1]); ctx.arc(P[0], P[1], r, 0, TAU);
  }
  if (hd) for (let i = 0; i < 80; i++) { const u = 0.12 + hash(i + 100) * 0.78, f = (hash(i * 3.1 + 200) * 2 - 1) * 0.9; sp(u, f); const r = 0.007; ctx.moveTo(P[0] + r, P[1]); ctx.arc(P[0], P[1], r, 0, TAU); }
  ctx.fillStyle = H.rgbStr(c.mem, 0.55); ctx.fill();
  if (hd) {
    // gill openings behind the pectorals
    ctx.beginPath(); for (const sd of [-1, 1]) { sp(0.66, sd * 0.66); ctx.moveTo(P[0] + 0.05, P[1]); ctx.ellipse(P[0], P[1], 0.05, 0.022, 0.3 * sd, 0, TAU); }
    ctx.fillStyle = 'rgba(5,3,10,0.8)'; ctx.fill();
  }
  // the mouth: a wide grin between the head and the swinging lower jaw (an underbite even when shut)
  mouthCurves(g);
  band(ctx, MU, MI);
  ctx.fillStyle = H.rgbStr(c.nuc, 0.98); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.9); ctx.lineWidth = lw(1.5); ctx.stroke();
  if (g > 0.02) smudge(ctx, H, [120, 24, 52], 0.9 + 0.08 * g, 0, 0.1 + 0.16 * g, 0.34, 0.45 * g); // the gullet, deep in the throat
  glow(ctx, H, c.glow, lx - 0.3, ly * 0.6, 1.0, 0.2 * b); // the lure lights up the face
  // upper fangs, pointing out over the jaw
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let j = 0; j < UPPER_T.length; j++) {
    const u = 0.32 + (j / (UPPER_T.length - 1)) * 0.64; cpt(MU, u, sd); const bx = P[0], by = P[1];
    const dx = bx - 0.25, dy = by * 0.75, l = Math.hypot(dx, dy) || 1, L2 = UPPER_T[j] * (0.85 + 0.25 * g);
    tooth(ctx, bx - dx / l * 0.03, by - dy / l * 0.03, bx + dx / l * L2, by + dy / l * L2, hd ? 0.013 : 0.019);
  }
  ctx.fillStyle = 'rgba(232,240,255,0.93)'; ctx.fill();
  if (hd) { ctx.strokeStyle = 'rgba(150,170,210,0.45)'; ctx.lineWidth = lw(0.7); ctx.stroke(); }
  // lower jaw: a fleshy rim, its needles pointing back into the mouth
  band(ctx, MO, MI);
  ctx.fillStyle = H.rgbStr(dark, 0.98); ctx.fill();
  ctx.fillStyle = H.rgbStr(c.body, 0.55); ctx.fill();
  ctx.beginPath(); curve(ctx, MO, -1, true, true); curve(ctx, MO, 1, false, false);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.4); ctx.stroke();
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let j = 0; j < LOWER_T.length; j++) {
    const u = 0.3 + (j / (LOWER_T.length - 1)) * 0.66; cpt(MI, u, sd); const bx = P[0], by = P[1];
    const dx = 0.3 - bx, dy = -by * 0.7, l = Math.hypot(dx, dy) || 1, L2 = LOWER_T[j] * (0.85 + 0.3 * g);
    tooth(ctx, bx - dx / l * 0.03, by - dy / l * 0.03, bx + dx / l * L2, by + dy / l * L2, hd ? 0.014 : 0.02);
  }
  ctx.fillStyle = 'rgba(238,245,255,0.96)'; ctx.fill();
  if (hd) { ctx.strokeStyle = 'rgba(150,170,210,0.45)'; ctx.lineWidth = lw(0.7); ctx.stroke(); }
  // small eyes
  for (const sd of [-1, 1]) eye(ctx, 0.47, sd * 0.37, 0.06, 'rgb(122,152,198)', lw(0.9), 0.7);
  shine(ctx, H, e, -0.05, 0.85);
  // illicium: the fishing rod (a modified fin ray) arching forward from the forehead
  const bx0 = 0.56, cpx = (bx0 + lx) / 2 + 0.05, cpy = (ly - 0.38) * 0.9;
  if (hd) {
    ctx.beginPath(); ctx.moveTo(bx0 + 0.04, 0.05); ctx.quadraticCurveTo(cpx + 0.06, cpy + 0.24, lx + 0.04, ly + 0.09);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = lw(3); ctx.lineCap = 'round'; ctx.stroke(); // its shadow
  }
  ctx.beginPath(); ctx.moveTo(bx0, 0); ctx.quadraticCurveTo(cpx, cpy, lx, ly);
  ctx.strokeStyle = H.rgbStr(dark, 0.95); ctx.lineWidth = lb(3.6); ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.4); ctx.stroke();
  // its thick base (the pterygiophore) on the forehead
  ctx.beginPath(); ctx.moveTo(bx0 - 0.14, 0); ctx.quadraticCurveTo(bx0 - 0.02, -0.01, bx0 + 0.07, cpy * 0.12);
  ctx.strokeStyle = H.rgbStr(dark, 1); ctx.lineWidth = lb(6); ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lb(1.6); ctx.stroke();
  // esca: a bacteria-filled bulb, pigmented cap at the back, trailing filaments
  const ea = atan2(ly - cpy, lx - cpx);
  glow(ctx, H, c.glow, lx, ly, 1.5, 0.3 * b);
  ctx.beginPath();
  for (let k = 0; k < (hd ? 5 : 3); k++) {
    const a = ea + PI + (k - (hd ? 2 : 1)) * 0.55, l = 0.16 + 0.06 * (k & 1) + (hd ? 0.06 : 0), sw = 0.3 * sin(t * 2 + k);
    ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx + cos(a) * l * 0.5 + 0.03 * sin(t * 3 + k), ly + sin(a) * l * 0.5, lx + cos(a + sw) * l, ly + sin(a + sw) * l);
  }
  ctx.strokeStyle = H.rgbStr(H.mixRGB(c.glow, WHITE, 0.3), 0.45 + 0.4 * b); ctx.lineWidth = lw(1.1); ctx.stroke();
  ctx.beginPath(); ctx.arc(lx, ly, 0.1, 0, TAU); ctx.fillStyle = H.rgbStr(H.mixRGB(c.glow, WHITE, 0.25 + 0.5 * lk), 0.75 + 0.25 * b); ctx.fill();
  ctx.beginPath(); ctx.arc(lx, ly, 0.1, ea + PI / 2 + 0.3, ea + PI * 1.5 - 0.3); ctx.closePath(); ctx.fillStyle = H.rgbStr(dark, 0.85); ctx.fill();
  glow(ctx, H, c.glow, lx, ly, 0.3 + 0.32 * b, 0.6 + 0.4 * b, 1);
  if (hd) {
    // glowing bacteria drifting off the lure
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const f = fract(t * 0.25 + hash(i + 7)), a = hash(i + 3) * TAU, d = 0.12 + f * 0.6, x = lx + cos(a) * d, y = ly + sin(a) * d - f * 0.1, r = 0.012 * (1 - f); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.glow, WHITE, 0.5), 0.7 * b); ctx.fill();
  }
}

// =================================================================================================== giant siphonophore
const SIPH_COL = { body: [160, 205, 255], mem: [225, 242, 255], nuc: [255, 120, 92], glow: [120, 190, 255] };
const ST0 = { alive: true, hit: 0 };
const DEAD = [70, 66, 82], DEAD_E = 'rgba(150,140,160,0.55)';
function stem(ctx, H, c, x0, x1, alive) {
  ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.lineCap = 'round';
  ctx.strokeStyle = alive ? H.rgbStr(c.nuc, 0.3) : 'rgba(80,70,80,0.45)'; ctx.lineWidth = 0.11; ctx.stroke();
  ctx.strokeStyle = alive ? H.rgbStr(c.mem, 0.75) : 'rgba(140,130,140,0.45)'; ctx.lineWidth = H.lw(1.3); ctx.stroke();
}
function hitFlash(ctx, H, st, r) { if (st.hit > 0) glow(ctx, H, WHITE, 0, 0, r, min(1, st.hit) * 0.45); }
function pulseOf(st, t, rate, ph) { return typeof st.pulse === 'number' ? clamp01(st.pulse) : 0.5 + 0.5 * sin(t * rate + ph); }

// pneumatophore: a small, shiny gas float at the head of the colony, red-pigmented at its tip
function siphFloat(ctx, t, H, st = ST0) {
  const c = H.col || SIPH_COL, alive = st.alive !== false, lw = H.lw, lb = H.lwb || H.lw;
  ctx.save(); ctx.lineJoin = 'round';
  stem(ctx, H, c, -1.1, -0.3, alive);
  if (alive) {
    const w = 1 + 0.04 * sin(t * 1.6);
    glow(ctx, H, c.glow, 0.1, 0, 1.5, 0.3);
    // neck where it joins the stem
    ctx.beginPath(); ctx.moveTo(-0.75, -0.14); ctx.quadraticCurveTo(-0.45, -0.3, -0.3, -0.36); ctx.lineTo(-0.3, 0.36); ctx.quadraticCurveTo(-0.45, 0.3, -0.75, 0.14); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.body, 0.35); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = lw(1); ctx.stroke();
    // the gas-filled bladder: silvery, glossy
    ctx.beginPath(); ctx.ellipse(0.15, 0, 0.78 * w, 0.52 / w, 0, 0, TAU);
    ctx.fillStyle = H.rgbStr(c.mem, 0.28); ctx.fill();
    gfill(ctx, H, c.body, 1, 0.15, 0, 0.78, 0.52);
    ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lb(1.6); ctx.stroke();
    if (!H.lod) {
      // the inner gas sac with its septa, the gas gland at the base
      ctx.beginPath(); ctx.ellipse(0.22, -0.02, 0.56 * w, 0.34 / w, 0, 0, TAU);
      ctx.fillStyle = 'rgba(240,250,255,0.18)'; ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
      if (H.hd) {
        ctx.beginPath();
        for (let k = 1; k <= 4; k++) { const x = 0.7 - k * 0.22, h = 0.33 * sqrt(max(0, 1 - ((x - 0.22) / 0.58) ** 2)); ctx.moveTo(x + 0.03, -h); ctx.quadraticCurveTo(x - 0.05, 0, x + 0.03, h); }
        ctx.strokeStyle = H.rgbStr(c.mem, 0.25); ctx.lineWidth = lw(0.8); ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(-0.42, 0, 0.12, 0.16, 0, 0, TAU); ctx.fillStyle = H.rgbStr(c.nuc, 0.5); ctx.fill();
    }
    // red-pigmented apical cap
    ctx.beginPath(); ctx.ellipse(0.78 * w, 0, 0.17, 0.24, 0, -PI / 2, PI / 2); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.nuc, 0.92); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = lw(1); ctx.stroke();
    glow(ctx, H, c.nuc, 0.82, 0, 0.42, 0.35);
    if (!H.lod) {
      // gloss: a window highlight and a rim glint
      ctx.beginPath(); ctx.ellipse(0.0, -0.3, 0.34, 0.08, -0.08, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0.5, -0.22, 0.05, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
    }
  } else {
    // deflated: a wrinkled, sagging sac
    let m = 0;
    for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU, r = 1 + 0.12 * sin(a * 5 + 1.3) + 0.06 * sin(a * 9); OX[m] = 0.1 + cos(a) * 0.72 * r; OY[m] = sin(a) * 0.26 * r + 0.07 * cos(a * 2); m++; }
    smooth(ctx, m);
    ctx.fillStyle = H.rgbStr(DEAD, 0.65); ctx.fill(); ctx.strokeStyle = DEAD_E; ctx.lineWidth = lb(1.2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0.78, 0.05, 0.08, 0.11, 0, 0, TAU); ctx.fillStyle = 'rgba(90,40,40,0.7)'; ctx.fill();
  }
  hitFlash(ctx, H, st, 1.2);
  ctx.restore();
}
// nectophore: a transparent, helmet-shaped swimming bell; its opening (ostium) faces −x, jetting water backwards
function bellPath(ctx, sx, sy, wob) {
  ctx.beginPath();
  ctx.moveTo(-0.86 * sx, -0.66 * sy);
  ctx.bezierCurveTo(-0.55 * sx, (-1.02 - wob) * sy, 0.55 * sx, (-0.95 + wob) * sy, 0.95 * sx, -0.32 * sy);
  ctx.quadraticCurveTo(1.08 * sx, 0, 0.95 * sx, 0.32 * sy);
  ctx.bezierCurveTo(0.55 * sx, (0.95 + wob) * sy, -0.55 * sx, (1.02 - wob) * sy, -0.86 * sx, 0.66 * sy);
  ctx.quadraticCurveTo(-0.5 * sx, 0.5 * sy, -0.6 * sx, 0);
  ctx.quadraticCurveTo(-0.5 * sx, -0.5 * sy, -0.86 * sx, -0.66 * sy);
  ctx.closePath();
}
function siphBell(ctx, t, H, st = ST0) {
  const c = H.col || SIPH_COL, alive = st.alive !== false, lw = H.lw, lb = H.lwb || H.lw;
  ctx.save(); ctx.lineJoin = 'round';
  stem(ctx, H, c, -1.1, 1.1, alive);
  if (alive) {
    const k = pulseOf(st, t, 3.2, 0), sx = 1 + 0.05 * k, sy = 1 - 0.2 * k;
    glow(ctx, H, c.glow, 0.1, 0, 1.4, 0.16 + 0.1 * k);
    if (k > 0.25 && !H.lod) {
      // the jet leaving the bell
      ctx.beginPath();
      for (let j = -2; j <= 2; j++) { const f = fract(t * 1.6 + j * 0.27), x = -0.7 - f * 0.7; ctx.moveTo(x, j * 0.1 * sy); ctx.lineTo(x - 0.22, j * 0.14 * sy); }
      ctx.strokeStyle = H.rgbStr(c.mem, 0.4 * (k - 0.25)); ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke();
    }
    bellPath(ctx, sx, sy, 0);
    gfill(ctx, H, c.body, 0.8, 0.1, 0, 0.95 * sx, 0.95 * sy);
    ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lb(1.5); ctx.stroke();
    // nectosac: the muscular cavity inside, opening at the ostium
    ctx.beginPath(); ctx.moveTo(-0.58 * sx, -0.4 * sy);
    ctx.bezierCurveTo(-0.3 * sx, -0.72 * sy, 0.45 * sx, -0.62 * sy, 0.62 * sx, 0);
    ctx.bezierCurveTo(0.45 * sx, 0.62 * sy, -0.3 * sx, 0.72 * sy, -0.58 * sx, 0.4 * sy); ctx.closePath();
    ctx.fillStyle = 'rgba(10,26,52,0.28)'; ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(1); ctx.stroke();
    if (!H.lod) {
      // radial canals running over the nectosac, the velum ring at the opening
      ctx.beginPath();
      for (const v of H.hd ? [-0.75, -0.3, 0.3, 0.75] : [-0.55, 0.55]) { ctx.moveTo(0.6 * sx, v * 0.08 * sy); ctx.bezierCurveTo(0.35 * sx, v * 0.75 * sy, -0.3 * sx, v * 0.82 * sy, -0.56 * sx, v * 0.5 * sy); }
      ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(1.2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-0.6 * sx, 0, 0.07, 0.42 * sy, 0, 0, TAU); ctx.strokeStyle = H.rgbStr(c.mem, 0.75); ctx.lineWidth = lw(1.3); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0.25, -0.62 * sy, 0.34, 0.06, 0.08, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
    }
  } else {
    // collapsed: crumpled, clouded, torn at the rim
    ctx.save(); ctx.translate(-0.1, 0.06); ctx.rotate(0.12); bellPath(ctx, 0.8, 0.55, 0.18); ctx.restore();
    ctx.fillStyle = H.rgbStr(DEAD, 0.5); ctx.fill(); ctx.strokeStyle = DEAD_E; ctx.lineWidth = lb(1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.7, -0.2); ctx.lineTo(-0.5, -0.05); ctx.lineTo(-0.72, 0.08); ctx.lineTo(-0.48, 0.2);
    ctx.strokeStyle = 'rgba(30,25,35,0.7)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  hitFlash(ctx, H, st, 1.1);
  ctx.restore();
}
// cormidium feeding unit: a leaf-like glassy bract over the stem and, hanging from it, the gastrozooid: a
// red-orange feeding polyp with a stinging basigaster at its base and a flared, gaping mouth
function siphFeeder(ctx, t, H, st = ST0) {
  const c = H.col || SIPH_COL, alive = st.alive !== false, lw = H.lw, lb = H.lwb || H.lw;
  ctx.save(); ctx.lineJoin = 'round';
  stem(ctx, H, c, -1.1, 1.1, alive);
  const k = pulseOf(st, t, 2.1, 1), n = H.lod ? 6 : 14, len = alive ? 1.05 : 0.75;
  SN = n;
  { let x = 0.08, y = 0.06; for (let i = 0; i <= n; i++) { const u = i / n, a = alive ? 2.0 + 0.42 * sin(t * 1.3 - u * 3) * u : 1.7 + 0.1 * u; SX[i] = x; SY[i] = y; SA[i] = a;
    const peri = alive ? 1 + 0.22 * sin(t * 3 - u * 8) * sin(u * PI) : 0.6;
    const base = u < 0.25 ? 0.13 * sin((u / 0.25) * PI) ** 0.7 : 0;           // basigaster bulb
    const tube = 0.055 + 0.05 * sin(u * PI) ** 0.6;                          // stomach tube
    const lip = u > 0.82 ? (u - 0.82) * (0.7 + 0.5 * k) : 0;                 // flared mouth
    SW[i] = (max(base, tube * peri) + lip) * (alive ? 1 : 0.7);
    x += cos(a) * len / n; y += sin(a) * len / n; } }
  outline(ctx, 0);
  if (alive) {
    gfill(ctx, H, c.nuc, 1, SX[n >> 1], SY[n >> 1], 0.45, 0.45);
    ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, WHITE, 0.55), 0.9); ctx.lineWidth = lb(1.2); ctx.stroke();
    if (!H.lod) {
      // the basigaster's cnidocyst battery, prey glowing in the stomach, the mouth opening and shutting
      dotsAlong(ctx, 0.04, 0.2, 5, 0.45); ctx.fillStyle = 'rgba(255,230,200,0.8)'; ctx.fill();
      const mi = round(n * 0.55); glow(ctx, H, [255, 200, 120], SX[mi], SY[mi], 0.3, 0.4);
      const ex = SX[n] + cos(SA[n]) * 0.02, ey = SY[n] + sin(SA[n]) * 0.02;
      ctx.beginPath(); ctx.ellipse(ex, ey, 0.04 + 0.03 * k, 0.04 + 0.08 * k, SA[n], 0, TAU); ctx.fillStyle = 'rgba(60,10,20,0.9)'; ctx.fill();
      if (H.hd) { ctx.beginPath(); for (let i = 4; i < n - 1; i += 2) { sp(i / n, -0.6); ctx.moveTo(P[0], P[1]); sp(i / n, 0.6); ctx.lineTo(P[0], P[1]); } ctx.strokeStyle = H.rgbStr(WHITE, 0.25); ctx.lineWidth = lw(0.8); ctx.stroke(); }
    }
  } else { ctx.fillStyle = 'rgba(105,80,70,0.75)'; ctx.fill(); ctx.strokeStyle = DEAD_E; ctx.lineWidth = lb(1); ctx.stroke(); }
  // bract: a transparent pointed leaf shielding the stem
  ctx.beginPath(); ctx.moveTo(0.9, 0.02); ctx.bezierCurveTo(0.55, -0.6, -0.35, -0.68, -0.85, -0.42); ctx.bezierCurveTo(-0.4, -0.1, 0.3, 0.14, 0.9, 0.02); ctx.closePath();
  if (alive) { gfill(ctx, H, c.body, 0.55, 0.05, -0.25, 0.85, 0.5); ctx.strokeStyle = H.rgbStr(c.mem, 0.8); }
  else { ctx.fillStyle = H.rgbStr(DEAD, 0.35); ctx.fill(); ctx.strokeStyle = DEAD_E; }
  ctx.lineWidth = lb(1.2); ctx.stroke();
  if (alive && !H.lod) { ctx.beginPath(); ctx.moveTo(0.75, -0.02); ctx.quadraticCurveTo(0.0, -0.3, -0.7, -0.38); ctx.strokeStyle = H.rgbStr(c.mem, 0.4); ctx.lineWidth = lw(1); ctx.stroke(); }
  hitFlash(ctx, H, st, 1.0);
  ctx.restore();
}
// dots on both sides along the current spine between u0 and u1 (into the current path)
function dotsAlong(ctx, u0, u1, k, f) {
  ctx.beginPath();
  for (let i = 0; i < k; i++) for (const sd of [-1, 1]) { sp(u0 + (u1 - u0) * (i / (k - 1)), sd * f); const r = 0.018; ctx.moveTo(P[0] + r, P[1]); ctx.arc(P[0], P[1], r, 0, TAU); }
}
// dactylozooid: a finger-like polyp trailing a long coiled fishing tentacle hung with stinging knobs
const TB = new Float32Array(2 * 121);
function siphStinger(ctx, t, H, st = ST0) {
  const c = H.col || SIPH_COL, alive = st.alive !== false, lw = H.lw, lb = H.lwb || H.lw;
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  stem(ctx, H, c, -1.1, 1.1, alive);
  const N = H.lod ? 30 : H.hd ? 120 : 80, Lt = alive ? 3.3 : 2.4;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    let x = -0.05 - u * Lt, y = 0.18 + (alive ? 0.35 * u + 0.22 * sin(t * 1.2 - u * 4) * u : 0.6 * u * u);
    if (alive) { const rc = 0.13 * (0.35 + 0.65 * sin(min(1, u * 3) * PI / 2)) * (1 - 0.3 * u), a = u * TAU * 10 - t * 2.5; x += cos(a) * rc * 0.75; y += sin(a) * rc; }
    TB[i * 2] = x; TB[i * 2 + 1] = y;
  }
  ctx.beginPath(); ctx.moveTo(TB[0], TB[1]); for (let i = 1; i <= N; i++) ctx.lineTo(TB[i * 2], TB[i * 2 + 1]);
  if (alive) { ctx.strokeStyle = H.rgbStr(c.nuc, 0.3); ctx.lineWidth = lw(4); ctx.stroke(); ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, WHITE, 0.5), 0.9); ctx.lineWidth = lw(1.3); ctx.stroke(); }
  else { ctx.strokeStyle = 'rgba(110,100,110,0.55)'; ctx.lineWidth = lw(1.2); ctx.stroke(); }
  if (!H.lod) {
    // tentilla: side branches ending in coiled cnidobands (the stinging batteries)
    const nt = H.hd ? 12 : 7;
    ctx.beginPath();
    for (let j = 0; j < nt; j++) {
      const i = round(((j + 0.7) / nt) * N * 0.95), x = TB[i * 2], y = TB[i * 2 + 1], sd = j & 1 ? 1 : -1, sw = alive ? 0.08 * sin(t * 2 + j) : 0.1;
      ctx.moveTo(x, y); ctx.quadraticCurveTo(x - 0.06, y + sd * 0.1, x - 0.12 + sw * 0.5, y + sd * 0.2 + sw);
    }
    ctx.strokeStyle = alive ? H.rgbStr(H.mixRGB(c.nuc, WHITE, 0.4), 0.7) : 'rgba(110,100,110,0.5)'; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let j = 0; j < nt; j++) {
      const i = round(((j + 0.7) / nt) * N * 0.95), sd = j & 1 ? 1 : -1, sw = alive ? 0.08 * sin(t * 2 + j) : 0.1;
      const x = TB[i * 2] - 0.12 + sw * 0.5, y = TB[i * 2 + 1] + sd * 0.2 + sw, r = 0.045;
      ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.7, 0.5 * sd, 0, TAU);
      if (alive) glow(ctx, H, c.nuc, x, y, 0.16, 0.45);
    }
    ctx.fillStyle = alive ? 'rgb(235,60,80)' : 'rgba(70,50,55,0.8)'; ctx.fill();
  }
  // the finger polyp (palpon) itself
  ctx.beginPath(); ctx.moveTo(0.06, 0.02);
  const pa = alive ? 1.9 + 0.3 * sin(t * 1.7) : 1.6;
  const ex = cos(pa) * 0.62, ey = sin(pa) * 0.62;
  ctx.quadraticCurveTo(ex * 0.5 + 0.14, ey * 0.5, ex, ey); ctx.quadraticCurveTo(ex * 0.5 - 0.14, ey * 0.5 + 0.05, -0.08, 0.04); ctx.closePath();
  ctx.fillStyle = alive ? H.rgbStr(H.mixRGB(c.nuc, WHITE, 0.45), 0.85) : 'rgba(100,90,95,0.7)'; ctx.fill();
  ctx.strokeStyle = alive ? H.rgbStr(c.mem, 0.8) : DEAD_E; ctx.lineWidth = lb(1); ctx.stroke();
  // the tentacle's base bulb
  ctx.beginPath(); ctx.arc(-0.05, 0.16, 0.12, 0, TAU);
  ctx.fillStyle = alive ? H.rgbStr(c.nuc, 0.9) : 'rgba(90,70,75,0.85)'; ctx.fill(); ctx.strokeStyle = alive ? H.rgbStr(c.mem, 0.8) : DEAD_E; ctx.lineWidth = lw(1); ctx.stroke();
  hitFlash(ctx, H, st, 1.1);
  ctx.restore();
}
// glowing stem node: the colony's growth zone
function siphCore(ctx, t, H, st = ST0) {
  const c = H.col || SIPH_COL, alive = st.alive !== false, lw = H.lw, lb = H.lwb || H.lw;
  ctx.save(); ctx.lineJoin = 'round';
  stem(ctx, H, c, -1.1, 1.1, alive);
  const k = pulseOf(st, t, 2.4, 0.5);
  if (alive) {
    glow(ctx, H, c.glow, 0, 0, 1.5 * (1 + 0.12 * k), 0.5 + 0.25 * k);
    // budding zooids around the node
    ctx.beginPath();
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3 + 0.06 * sin(t + i), r = 0.1 + 0.03 * sin(t * 2 + i), x = cos(a) * 0.56, y = sin(a) * 0.5; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.75); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.48, 0, TAU);
    gfill(ctx, H, H.mixRGB(c.glow, WHITE, 0.25), 1, 0, 0, 0.5, 0.5);
    ctx.strokeStyle = H.cstr(c.mem); ctx.lineWidth = lb(1.5); ctx.stroke();
    glow(ctx, H, c.glow, 0, 0, 0.42 + 0.1 * k, 0.75 + 0.25 * k, 1);
    if (H.hd) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 0.4; ctx.moveTo(cos(a) * 0.12, sin(a) * 0.12); ctx.lineTo(cos(a) * 0.38, sin(a) * 0.38); } ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = lw(1); ctx.stroke(); }
  } else {
    ctx.beginPath(); ctx.arc(0, 0, 0.42, 0, TAU); ctx.fillStyle = 'rgba(52,48,62,0.92)'; ctx.fill(); ctx.strokeStyle = DEAD_E; ctx.lineWidth = lb(1.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.3, -0.15); ctx.lineTo(-0.05, 0.02); ctx.lineTo(0.12, -0.2); ctx.moveTo(-0.05, 0.02); ctx.lineTo(0.05, 0.3);
    ctx.strokeStyle = 'rgba(20,18,26,0.85)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  hitFlash(ctx, H, st, 1.2);
  ctx.restore();
}
const SIPH_PARTS = { float: siphFloat, bell: siphBell, feeder: siphFeeder, stinger: siphStinger, core: siphCore };
const CHAIN = [['stinger', -0.72, 0.3], ['feeder', -0.3, 0.3], ['bell', 0.12, 0.31], ['bell', 0.5, 0.32], ['float', 0.92, 0.34]];
const LAYOUT = [['float', -0.82, -0.78], ['bell', 0.05, -0.78], ['core', 0.88, -0.78], ['feeder', -0.6, 0.12], ['stinger', 0.9, 0.42]];
function drawSiph(ctx, e, t, s, H) {
  const c = H.col;
  if (e.showParts) {
    // dev preview: each part on its own (alive / hit / dead)
    const k = 0.32, h = subH(H, k), stt = { alive: !e.dead, hit: e.hitK || 0, pulse: e.pulseK };
    for (const [name, x, y] of LAYOUT) { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); SIPH_PARTS[name](ctx, t, h, stt); ctx.restore(); }
    return;
  }
  if (H.lod) {
    // tiny: a stem with the float and the bell bulges, one path
    glow(ctx, H, c.glow, 0.3, 0, 1.2, 0.3);
    ctx.beginPath(); ctx.ellipse(0.95, 0, 0.3, 0.2, 0, 0, TAU); ctx.moveTo(0.78, 0); ctx.ellipse(0.5, 0, 0.3, 0.28, 0, 0, TAU); ctx.moveTo(0.4, 0); ctx.ellipse(0.12, 0, 0.3, 0.27, 0, 0, TAU);
    ctx.moveTo(-0.15, -0.03); ctx.lineTo(-1.6, 0.25); ctx.lineTo(-0.15, 0.05); ctx.closePath();
    ctx.fillStyle = H.rgbStr(c.body, 0.85); ctx.fill();
    return;
  }
  // compact colony for the codex: float, two bells, a feeding polyp and a stinger on one swaying stem
  glow(ctx, H, c.glow, 0.1, 0, 1.9, 0.16);
  const stt = ST0;
  for (let i = 0; i < CHAIN.length; i++) {
    const [name, x, k] = CHAIN[i], y = 0.1 * sin(t * 0.9 - x * 2), a = atan2(-0.2 * cos(t * 0.9 - x * 2), 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(k, k);
    SIPH_PARTS[name](ctx, t + i * 0.7, subH(H, k), stt);
    ctx.restore();
  }
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
  sardine: {
    name: 'Sardine',
    col: { body: [150, 200, 226], mem: [228, 246, 255], nuc: [28, 92, 118], glow: [170, 225, 255] },
    portraitR: 0.28,
    states: [{ label: 'idle' }, { label: 'swim burst (stretch 0.15)', stretch: 0.15 }],
    draw: entry(drawSardine),
  },
  squid: {
    name: 'Squid',
    col: { body: [250, 150, 136], mem: [255, 226, 216], nuc: [172, 52, 70], glow: [255, 150, 160] },
    portraitR: 0.25,
    states: [
      { label: 'idle' },
      { label: 'inkK 0.5', inkK: 0.5, view: [0.62, 0.8] },
      { label: 'inkK 1', inkK: 1, view: [0.55, 1.0] },
      { label: 'grabK 0.5', grabK: 0.5, view: [0.62, -0.5] },
      { label: 'grabK 1', grabK: 1, view: [0.5, -0.9] },
    ],
    draw: entry(drawSquid),
  },
  barracuda: {
    name: 'Barracuda',
    col: { body: [168, 192, 208], mem: [232, 244, 253], nuc: [38, 58, 80], glow: [160, 210, 240] },
    portraitR: 0.22,
    states: [{ label: 'idle' }, { label: 'sprintK 0.5', sprintK: 0.5, view: [0.75, 0.2] }, { label: 'sprintK 1', sprintK: 1, view: [0.68, 0.35] }],
    draw: entry(drawBarracuda),
  },
  moray: {
    name: 'Moray eel',
    col: { body: [192, 162, 80], mem: [250, 232, 168], nuc: [58, 40, 20], glow: [220, 190, 110] },
    portraitR: 0.2,
    states: [
      { label: 'emergeK 0 · den', withDen: true, view: [0.55, 1.3] },
      { label: 'emergeK 0.5 · den', emergeK: 0.5, withDen: true, view: [0.42, 2.0] },
      { label: 'emergeK 1 · den', emergeK: 1, withDen: true, view: [0.34, 2.4] },
      { label: 'biteK 1 (head)', emergeK: 0.6, biteK: 1, withDen: true },
      { label: 'biteK 1 · emergeK 0', biteK: 1, withDen: true, view: [0.6, 1.1] },
    ],
    drawDen,
    draw: entry(drawMoray),
  },
  cookiecutter: {
    name: 'Cookie-cutter shark',
    col: { body: [136, 112, 100], mem: [218, 200, 184], nuc: [24, 18, 22], glow: [90, 255, 205] },
    portraitR: 0.27,
    states: [{ label: 'idle' }, { label: 'latched 0.5', latched: 0.5 }, { label: 'latched', latched: true }],
    draw: entry(drawCookie),
  },
  angler: {
    name: 'Anglerfish',
    boss: true,
    col: { body: [88, 72, 112], mem: [178, 162, 212], nuc: [14, 9, 20], glow: [140, 235, 255] },
    portraitR: 0.25,
    states: [{ label: 'idle', view: [0.78, -0.12] }, { label: 'lureK 1', lureK: 1, view: [0.78, -0.12] }, { label: 'mouthK 1', mouthK: 1, view: [0.78, -0.12] }, { label: 'mouthK 1 + lureK 1', mouthK: 1, lureK: 1, view: [0.78, -0.12] }],
    lurePos,
    draw: entry(drawAngler),
  },
  siphboss: {
    name: 'Giant siphonophore',
    boss: true,
    col: SIPH_COL,
    portraitR: 0.2,
    states: [
      { label: 'colony (codex)' },
      { label: 'parts · alive', showParts: true },
      { label: 'parts · hit + contracted', showParts: true, hitK: 1, pulseK: 1 },
      { label: 'parts · dead', showParts: true, dead: true },
    ],
    parts: SIPH_PARTS,
    draw: entry(drawSiph),
  },
};
