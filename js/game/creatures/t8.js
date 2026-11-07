// Creature art for the t8 tier: ocean-sunfish scale (2 – 5 m): jellyfish-rich open water, kelp and reef cleaning stations.
// Each entry: { name, col, portraitR, states, draw(ctx, e, t, s, H, opts) } — see README.md.
// The player here is a 3 m ocean sunfish that eats jellyfish, so much of this cast is gelatinous.
// Like t5/t6 the swimmers are seen from above: +x = heading, mirror-symmetric about the x axis (the sea lion rolls as
// it plays, which breaks the symmetry for a moment). Nomura's jellyfish is drawn side-on like t4's medusa (bell apex
// at +x, oral arms and tentacles trailing to −x): that is how a jelly swimming past looks from above. The lion's mane
// boss is seen from straight above: a round, eight-lobed bell with its fringe streaming back.
// Preview-only extras: `e.view = [k, dx]` zooms the drawing out by k and pans it by dx units (dev gallery tiles);
// lionsmane `e.withCurtains` adds a few long tentacle curtains drawn with its exported `tentacle` drawer.

const TAU = Math.PI * 2;
const { sin, cos, min, max, abs, sqrt, PI, atan2, floor, round, exp, hypot } = Math;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const sstep = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const fract = (v) => v - floor(v);
const hash = (i) => fract(sin(i * 127.1 + 311.7) * 43758.5453);
const WHITE = [255, 255, 255];
const SHADE = [3, 4, 9];
const C1 = [0, 0, 0], C2 = [0, 0, 0], C3 = [0, 0, 0], C4 = [0, 0, 0]; // scratch colours for mixRGB

// ---------------------------------------------------------------- shared helpers (same as t5/t6)
// additive glow from the cached sprite (alpha a, radius r, ky squashes it vertically)
function glow(ctx, H, rgb, x, y, r, a, hard = 0, ky = 1) {
  if (!(a > 0.004) || r <= 0) return;
  const A = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = A * min(1, a);
  ctx.drawImage(H.glowSprite(rgb, hard), x - r, y - r * ky, r * 2, r * 2 * ky);
  ctx.globalAlpha = A; ctx.globalCompositeOperation = op;
}
// soft dark smudge (shadow): the same cached sprite drawn normally
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
// world-fixed specular highlight over (x, 0), size k
function shine(ctx, H, e, x, k) { ctx.save(); ctx.translate(x, 0); ctx.scale(k, k); H.highlight(ctx, e.ang || 0); ctx.restore(); }
// helpers for a sub-drawing scaled by k (line widths stay in device pixels)
function subH(H, k, hd = H.hd) {
  const lw0 = H.lw, lb0 = H.lwb || H.lw;
  return { ...H, lw: (px) => lw0(px) / k, lwb: (px) => lb0(px) / k, hd };
}
function circ(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }

// Phase integrated over time, so a changing rate (sprinting) never makes a fin or tail jump. Two slots (body, fins).
// Stateless callers (portraits, frozen objects) get exactly t·f.
function phaseOf(e, t, f, slot = 0) {
  if (!Object.isExtensible(e)) return t * f;
  const kt = slot ? '_t8t1' : '_t8t0', kp = slot ? '_t8p1' : '_t8p0';
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
// a band along the body between flank offsets f0 and f1 (u0 → u1); taper pinches both ends to the band's middle
function strip(ctx, u0, u1, f0, f1, ns, taper = false) {
  ctx.beginPath();
  for (let i = 0; i <= ns; i++) {
    const v = i / ns, k = taper ? sin(v * PI) ** 0.5 : 1, fm = (f0 + f1) / 2;
    sp(u0 + (u1 - u0) * v, fm + (f0 - fm) * k); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]);
  }
  for (let i = ns; i >= 0; i--) {
    const v = i / ns, k = taper ? sin(v * PI) ** 0.5 : 1, fm = (f0 + f1) / 2;
    sp(u0 + (u1 - u0) * v, fm + (f1 - fm) * k); ctx.lineTo(P[0], P[1]);
  }
  ctx.closePath();
}
// cheap tail triangle for LOD silhouettes (adds to the current path)
function tailTri(ctx, tx, ty, ta, L, sp0, notch) {
  ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - sp0) * L, ty + sin(ta - sp0) * L);
  ctx.lineTo(tx + cos(ta) * notch, ty + sin(ta) * notch); ctx.lineTo(tx + cos(ta + sp0) * L, ty + sin(ta + sp0) * L); ctx.closePath();
}
// caudal fin rooted at (x, y), local +x pointing away from the body along a. nk = notch depth, f = flex of the lobes
function tailPath(ctx, L, W, r0, f, nk) {
  const cn = nk < 1 ? nk + 0.14 : nk + 0.08;
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L * 0.42, -W * 0.5, L, -W * 0.62 + f);
  ctx.quadraticCurveTo(L * cn, -W * 0.16 + f * 0.6, L * nk, f * 0.5);
  ctx.quadraticCurveTo(L * cn, W * 0.16 + f * 0.6, L, W * 0.62 + f);
  ctx.quadraticCurveTo(L * 0.42, W * 0.5, 0, r0);
  ctx.closePath();
}
function eye(ctx, x, y, r, iris, lwO, pk = 0.64, pupil = '#04060c', px = 0.14, py = 0) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = iris; ctx.fill();
  ctx.strokeStyle = 'rgba(8,16,26,0.75)'; ctx.lineWidth = lwO; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * px, y + r * py, r * pk, 0, TAU); ctx.fillStyle = pupil; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.08, y - r * 0.3, r * 0.26, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.4, y + r * 0.3, r * 0.11, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
}
// a thin conical tooth from base (bx, by) to tip (tx, ty), half-width bw at the base (adds to the current path)
function tooth(ctx, bx, by, tx, ty, bw) {
  const dx = tx - bx, dy = ty - by, l = hypot(dx, dy) || 1, px = -dy / l * bw, py = dx / l * bw;
  ctx.moveTo(bx + px, by + py); ctx.quadraticCurveTo(bx + dx * 0.55 + px * 0.4, by + dy * 0.55 + py * 0.4, tx, ty); ctx.lineTo(bx - px, by - py);
}
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
// falcate (sickle) fin rooted at (x, y) along a; side mirrors it so the leading edge faces forward
function sickle(ctx, x, y, a, side, L, W, fill, edge, lwE) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.4, -W * 0.72, L * 0.82, -W * 0.3, L, W * 0.5);
  ctx.quadraticCurveTo(L * 0.48, W * 0.08, 0, W * 0.5);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lwE; ctx.stroke();
  ctx.restore();
}
// a flipper blade rooted at (x, y), pointing along a; side mirrors (leading edge at local −y); leaves the path open
function flipper(ctx, x, y, a, side, L, W, bend) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.35, -W * 0.95, L * 0.78, -W * 0.5 + bend * 0.5, L, W * 0.05 + bend);
  ctx.quadraticCurveTo(L * 0.62, W * 0.55 + bend * 0.5, 0, W * 0.5);
  ctx.closePath();
  ctx.restore();
}
// bell contraction for the jellies: quick squeeze, slow relaxation
function bellPulse(t) { const q = fract(t * 0.38); return q < 0.3 ? sstep(q / 0.3) : 1 - sstep((q - 0.3) / 0.7); }

// =================================================================================================== salp chain
// 6–10 glassy barrel zooids linked in a zigzag along x; a contraction wave runs down the chain.
const SZN = 10, SALP_GUT_D = [110, 40, 0];
const ZX = new Float32Array(SZN), ZY = new Float32Array(SZN), ZC = new Float32Array(SZN), ZS = new Float32Array(SZN), ZA = new Float32Array(SZN), ZB = new Float32Array(SZN);
function salpCount(e) { return 6 + min(4, floor(hash((e.seed || 0) * 13.7 + 2.1) * 5)); }
function salpLayout(n, t) {
  const a0 = min(0.27, 2.45 / ((n - 1) * 1.38 + 1.9)), d = a0 * 1.38, x0 = ((n - 1) * d) / 2;
  for (let i = 0; i < n; i++) {
    const z = i & 1 ? 1 : -1, p = max(0, sin(TAU * (t * 0.6 - i * 0.09))) ** 2;
    const ang = z * 0.56 + 0.07 * sin(t * 0.8 - i * 0.7);
    ZX[i] = x0 - i * d; ZY[i] = z * a0 * 0.4 + 0.07 * sin(t * 0.5 - i * 0.5);
    ZC[i] = cos(ang); ZS[i] = sin(ang);
    ZA[i] = a0 * (1 + 0.05 * p); ZB[i] = a0 * 0.62 * (1 - 0.15 * p);
  }
}
// zooid i local (lx, ly) → P, and path commands in zooid space
function zp(i, lx, ly) { const c = ZC[i], s = ZS[i]; P[0] = ZX[i] + lx * c - ly * s; P[1] = ZY[i] + lx * s + ly * c; return P; }
function zMove(ctx, i, x, y) { zp(i, x, y); ctx.moveTo(P[0], P[1]); }
function zLine(ctx, i, x, y) { zp(i, x, y); ctx.lineTo(P[0], P[1]); }
function zQuad(ctx, i, cx, cy, x, y) { zp(i, cx, cy); const qx = P[0], qy = P[1]; zp(i, x, y); ctx.quadraticCurveTo(qx, qy, P[0], P[1]); }
function zBez(ctx, i, x1, y1, x2, y2, x, y) { zp(i, x1, y1); const ax = P[0], ay = P[1]; zp(i, x2, y2); const bx = P[0], by = P[1]; zp(i, x, y); ctx.bezierCurveTo(ax, ay, bx, by, P[0], P[1]); }
// a barrel with slightly truncated ends (the two siphon openings)
function zBarrel(ctx, i) {
  const a = ZA[i], b = ZB[i];
  zMove(ctx, i, a, -0.5 * b);
  zBez(ctx, i, a * 0.72, -1.12 * b, -a * 0.68, -1.12 * b, -a, -0.48 * b);
  zQuad(ctx, i, -a * 1.1, 0, -a, 0.48 * b);
  zBez(ctx, i, -a * 0.68, 1.12 * b, a * 0.72, 1.12 * b, a, 0.5 * b);
  zQuad(ctx, i, a * 1.08, 0, a, -0.5 * b);
  ctx.closePath();
}
function drawSalp(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.3, 1 - st * 0.2);
  const n = salpCount(e);
  salpLayout(n, t);
  if (H.lod) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { ctx.moveTo(ZX[i] + ZC[i] * ZA[i], ZY[i] + ZS[i] * ZA[i]); ctx.ellipse(ZX[i], ZY[i], ZA[i], ZB[i], atan2(ZS[i], ZC[i]), 0, TAU); }
    ctx.fillStyle = H.rgbStr(c.body, 0.75); ctx.fill();
    return;
  }
  glow(ctx, H, c.glow, 0, 0, 1.7, 0.13, 0, 0.5);
  // glassy tunics: a per-barrel body gradient when big, then one path for every barrel
  if (hd || s > 60) for (let i = 0; i < n; i++) {
    ctx.beginPath(); zBarrel(ctx, i);
    ctx.save(); ctx.translate(ZX[i], ZY[i]); ctx.rotate(atan2(ZS[i], ZC[i])); ctx.scale(ZA[i], ZB[i]); ctx.fillStyle = H.bodyGrad(ctx, c.body, 0.6); ctx.fill(); ctx.restore();
  }
  ctx.beginPath(); for (let i = 0; i < n; i++) zBarrel(ctx, i);
  ctx.fillStyle = H.rgbStr(c.body, 0.2); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.body, 0.32); ctx.lineWidth = ZB[0] * 0.3; ctx.stroke(); // the thick, soft tunic wall
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.1); ctx.stroke();
  // muscle bands: hoops round each barrel
  const NB = hd ? 6 : 4;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = ZA[i], b = ZB[i];
    for (let k = 0; k < NB; k++) {
      const x = a * (0.64 - (1.22 * k) / (NB - 1)), w = b * 0.94 * sqrt(max(0, 1 - (x / (a * 1.04)) ** 4));
      zMove(ctx, i, x + 0.05 * a, -w); zQuad(ctx, i, x - 0.14 * a, 0, x + 0.05 * a, w);
    }
  }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.38); ctx.lineWidth = lw(hd ? 1 : 0.8); ctx.stroke();
  // the gill bar slanting through each barrel
  if (s > 30) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) { const a = ZA[i], b = ZB[i]; zMove(ctx, i, a * 0.5, -b * 0.55); zLine(ctx, i, -a * 0.42, b * 0.22); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.3); ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
  }
  // gut nucleus: the compact orange gut at the back of each zooid
  ctx.beginPath();
  for (let i = 0; i < n; i++) { zp(i, -ZA[i] * 0.56, ZB[i] * 0.12); circ(ctx, P[0], P[1], ZB[i] * 0.33); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.95); ctx.fill();
  ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, SALP_GUT_D, 0.6, C1), 0.7); ctx.lineWidth = lw(0.8); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < n; i++) { zp(i, -ZA[i] * 0.6, 0); circ(ctx, P[0], P[1], ZB[i] * 0.11); }
  ctx.fillStyle = 'rgba(255,240,205,0.75)'; ctx.fill();
  if (s > 30) for (let i = 0; i < n; i++) { zp(i, -ZA[i] * 0.56, ZB[i] * 0.12); glow(ctx, H, c.nuc, P[0], P[1], ZB[i] * 1.2, 0.3); }
  // eye spots near the front of each zooid
  if (s > 60) {
    ctx.beginPath(); for (let i = 0; i < n; i++) { zp(i, ZA[i] * 0.4, -ZB[i] * 0.05); circ(ctx, P[0], P[1], ZB[i] * 0.075); }
    ctx.fillStyle = 'rgba(150,40,50,0.85)'; ctx.fill();
  }
  // glassy glints along each barrel
  ctx.beginPath();
  for (let i = 0; i < n; i++) { const a = ZA[i], b = ZB[i]; zMove(ctx, i, a * 0.55, -b * 0.7); zQuad(ctx, i, 0, -b * 1.0, -a * 0.5, -b * 0.68); }
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke();
  shine(ctx, H, e, 0.3, 0.55);
}

// =================================================================================================== pyrosome
// A hollow, bumpy colony tube: rounded closed end at +x, open end at −x; each bump is a zooid with a light organ.
const PY_X0 = 0.98, PY_X1 = -1.08;
let PYT = 0;
const pyX = (u) => PY_X0 + (PY_X1 - PY_X0) * u;
const pyC = (u) => 0.05 * sin(PYT * 0.55 - u * 2.4) * (0.3 + u); // gentle sway of the tube
function pyW(u) { const w = 0.16 + 0.27 * u ** 0.8; return u < 0.16 ? w * sqrt(max(0, 1 - (1 - u / 0.16) ** 2)) : w; }
// tube outline (u0 → mouth), nb bumps of size `bump` along each side, ws = width scale
function pyOutline(ctx, nb, bump, u0 = 0, ws = 1) {
  const m = nb * 4; let q = 0;
  if (u0 <= 0) { OX[q] = PY_X0; OY[q] = pyC(0); q++; }
  for (let i = 1; i <= m; i++) { const u = u0 + (1 - u0) * (i / m), w = (pyW(u) + bump * abs(sin(u * PI * nb))) * ws; OX[q] = pyX(u); OY[q] = pyC(u) - w; q++; }
  for (let i = m; i >= 1; i--) { const u = u0 + (1 - u0) * (i / m), w = (pyW(u) + bump * abs(sin(u * PI * nb))) * ws; OX[q] = pyX(u); OY[q] = pyC(u) + w; q++; }
  smooth(ctx, q);
}
const LXA = new Float32Array(160), LYA = new Float32Array(160), LRA = new Float32Array(160), LBA = new Float32Array(160);
function drawPyro(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0, gk = clamp01(e.glowK || 0);
  if (st) ctx.scale(1 + st * 0.25, 1 - st * 0.15);
  PYT = t;
  if (H.lod) { pyOutline(ctx, 3, 0); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.6 * gk, C1), 0.8); ctx.fill(); return; }
  const cols = hd ? 15 : s > 30 ? 10 : 7, rows = hd ? 7 : 5;
  const uw = fract(t * 0.45) * 1.5 - 0.25; // crest of the light wave, running tip → mouth
  glow(ctx, H, c.glow, -0.1, 0, 1.5, 0.1 + 0.22 * gk, 0, 0.55);
  if (gk > 0.01) { const uu = clamp01(uw); glow(ctx, H, c.nuc, pyX(uu), pyC(uu), 0.75 + 0.3 * gk, 0.75 * gk * (1 - abs(uw - uu) * 4), 0, 0.9); }
  // translucent body
  pyOutline(ctx, cols, 0.022);
  ctx.fillStyle = H.rgbStr(c.body, 0.26); ctx.fill();
  gfill(ctx, H, c.body, 0.85, -0.05, 0, 1.06, 0.46);
  if (gk > 0.01) { ctx.fillStyle = H.rgbStr(c.nuc, 0.1 * gk); ctx.fill(); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.75); ctx.lineWidth = lb(1.2); ctx.stroke();
  // the hollow inside (seen through the wall)
  pyOutline(ctx, 4, 0, 0.12, 0.55); ctx.fillStyle = 'rgba(60,20,60,0.16)'; ctx.fill();
  // zooids: staggered whorls of bumps, foreshortened toward the silhouette
  let nl = 0; const zr = 0.95 / cols;
  ctx.beginPath();
  for (let i = 0; i < cols; i++) {
    const u = 0.07 + ((i + 0.5) / cols) * 0.9, w = pyW(u), x0 = pyX(u), yc = pyC(u);
    const crest = gk * exp(-(((u - uw) / 0.1) ** 2));
    for (let j = 0; j < rows; j++) {
      const ph = -PI / 2 + ((j + 0.5 + (i & 1) * 0.5) / rows) * PI;
      if (ph > PI / 2 - 0.08) continue;
      const cp = cos(ph), y = yc + w * sin(ph) * 0.93, rx = zr * 0.44, ry = zr * 0.44 * (0.3 + 0.7 * cp);
      ctx.moveTo(x0 + rx, y); ctx.ellipse(x0, y, rx, ry, 0, 0, TAU);
      const r = 0.5 + 0.5 * sin(t * 2.3 - u * 10 + j * 1.3);
      LXA[nl] = x0 - rx * 0.15; LYA[nl] = y; LRA[nl] = rx * 0.36 * (0.55 + 0.45 * cp) * (1 + 0.7 * crest);
      LBA[nl] = 0.25 + 0.62 * r * r + 0.25 * gk + 1.5 * crest;
      nl++;
    }
  }
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.35, C1), 0.32); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.32); ctx.lineWidth = lw(0.7); ctx.stroke();
  // their light organs: blue-green spots that ripple (three brightness levels → three fills)
  for (let lv = 0; lv < 3; lv++) {
    ctx.beginPath();
    for (let q = 0; q < nl; q++) { const b = LBA[q], l = b < 0.5 ? 0 : b < 0.8 ? 1 : 2; if (l === lv) circ(ctx, LXA[q], LYA[q], LRA[q] * (0.8 + 0.25 * lv)); }
    ctx.fillStyle = H.rgbStr(lv === 2 ? H.mixRGB(c.nuc, WHITE, 0.45, C2) : c.nuc, lv === 0 ? 0.35 : lv === 1 ? 0.7 : 0.95); ctx.fill();
  }
  if (s > 30) for (let q = 0; q < nl; q++) if (LBA[q] > 0.8) glow(ctx, H, c.nuc, LXA[q], LYA[q], LRA[q] * 4, min(0.6, 0.2 + (LBA[q] - 0.8) * 0.6), 1);
  // the open end (with its diaphragm) at −x
  {
    const yc = pyC(1), w = pyW(1);
    ctx.beginPath(); ctx.ellipse(PY_X1, yc, 0.075, w * 0.97, 0, 0, TAU);
    ctx.fillStyle = 'rgba(40,14,40,0.3)'; ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(PY_X1 - 0.01, yc, 0.045, w * 0.55, 0, 0, TAU); ctx.strokeStyle = H.rgbStr(c.mem, 0.35); ctx.lineWidth = lw(1); ctx.stroke();
  }
  shine(ctx, H, e, 0.25, 0.6);
}

// =================================================================================================== Nomura's jellyfish
// Side-on (like t4's medusa): huge mottled mushroom bell at +x, thick frilly oral arms, many filaments to ~−3.
const NM_ARM = [248, 222, 202], NM_TENT = [255, 214, 196], NM_STING = [255, 246, 238], NM_FLASH = [255, 170, 150], NM_CAV = [80, 36, 34];
const NT_N = 22, NT_K = 18, NO_K = 18;
const NTX = new Float32Array(NT_N * (NT_K + 1)), NTY = new Float32Array(NT_N * (NT_K + 1));
const NAX = new Float32Array(8 * (NO_K + 1)), NAY = new Float32Array(8 * (NO_K + 1)), NNX = new Float32Array(NO_K + 1), NNY = new Float32Array(NO_K + 1);
const NM_ARMS_HD = [-0.46, -0.33, -0.2, -0.07, 0.07, 0.2, 0.33, 0.46], NM_ARMS = [-0.4, -0.24, -0.08, 0.08, 0.24, 0.4];
// silhouette point of the bell at polar angle th (0 = apex) → P
function nmDome(xr, L, R, flare, th) { const cc = max(0, cos(th)), sn = sin(th); P[0] = xr + L * cc ** 0.6; P[1] = R * sn * (1 + flare * abs(sn) ** 8); return P; }
function nmBell(ctx, xr, L, R, re, flare, n) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { nmDome(xr, L, R, flare, -PI / 2 + (i / n) * PI); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
  ctx.ellipse(xr, 0, re, R * (1 + flare), 0, PI / 2, PI * 1.5);
  ctx.closePath();
}
function drawNomura(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, sk = clamp01(e.stingK || 0), st = e.stretch || 0;
  if (e.r === undefined) ctx.translate(1.0, 0); // codex: centre bell + tentacles
  if (st) ctx.scale(1 + st * 0.2, 1 - st * 0.12);
  const cp = bellPulse(t);
  const R = 0.96 - 0.15 * cp, L = 0.7 + 0.14 * cp, xr = 0.9 + 0.03 * cp - L, re = 0.13 - 0.04 * cp, flare = 0.1 * (1 - cp);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // ---- filaments trailing from the oral arms back to ~−3
  const NT = H.lod ? 6 : hd ? NT_N : 14, NK = H.lod ? 5 : hd ? NT_K : 11, wr = 1 + 0.5 * sk;
  for (let i = 0; i < NT; i++) {
    const h1 = hash(i * 3.1 + 0.7), h2 = hash(i * 5.3 + 1.9), o = i * (NT_K + 1);
    const y0 = (((i + 0.5) / NT) * 2 - 1) * R * 0.72, x0 = xr - 0.2 - 0.5 * h1, len = x0 + 2.8 + 0.3 * h2;
    for (let k = 0; k <= NK; k++) {
      const u = k / NK;
      NTX[o + k] = x0 - len * u * (1 - 0.025 * sin(t * 1.7 + i));
      NTY[o + k] = y0 * (1 + 0.3 * u) + (0.02 + 0.08 * u) * wr * sin(t * 1.5 - u * 6.5 + i * 0.9) + 0.07 * u * u * sin(t * 0.45 + i * 1.3);
    }
  }
  const tentPath = () => {
    ctx.beginPath();
    for (let i = 0; i < NT; i++) { const o = i * (NT_K + 1); ctx.moveTo(NTX[o], NTY[o]); for (let k = 1; k <= NK; k++) ctx.lineTo(NTX[o + k], NTY[o + k]); }
  };
  if (H.lod) {
    tentPath(); ctx.strokeStyle = H.rgbStr(sk ? NM_STING : NM_TENT, 0.55 + 0.4 * sk); ctx.lineWidth = lw(1); ctx.stroke();
    nmBell(ctx, xr, L, R, re, flare, 12); ctx.fillStyle = H.rgbStr(c.body, 0.85); ctx.fill();
    return;
  }
  tentPath();
  if (hd) { ctx.strokeStyle = H.rgbStr(NM_TENT, 0.12); ctx.lineWidth = lw(4); ctx.stroke(); }
  ctx.strokeStyle = H.rgbStr(NM_TENT, 0.5); ctx.lineWidth = lw(hd ? 1.3 : 1); ctx.stroke();
  if (s > 30) { // nematocyst batteries
    ctx.beginPath();
    for (let i = 0; i < NT; i++) for (let k = 3; k <= NK; k += hd ? 2 : 3) { const o = i * (NT_K + 1) + k; circ(ctx, NTX[o], NTY[o], 0.018 * (1.2 - k / NK)); }
    ctx.fillStyle = H.rgbStr(NM_STING, 0.5 + 0.45 * sk); ctx.fill();
  }
  if (sk > 0.01) { // stinging: the filaments flash
    ctx.globalCompositeOperation = 'lighter';
    tentPath(); ctx.strokeStyle = H.rgbStr(NM_FLASH, 0.5 * sk); ctx.lineWidth = lw(5); ctx.stroke();
    ctx.strokeStyle = H.rgbStr(NM_STING, 0.9 * sk); ctx.lineWidth = lw(1.8); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < NT; i += hd ? 1 : 2) for (let k = 4; k <= NK; k += hd ? 6 : 5) { const o = i * (NT_K + 1) + k; glow(ctx, H, NM_FLASH, NTX[o], NTY[o], 0.2 + 0.1 * sk, 0.5 * sk * (0.75 + 0.25 * sin(t * 20 + k + i)), 1); }
  }
  // ---- thick frilly oral arms (ruffled ribbons, one path)
  const ARMS = hd ? NM_ARMS_HD : NM_ARMS, NA = ARMS.length, NO = hd ? NO_K : 11, armC = H.mixRGB(NM_ARM, c.body, 0.3, C1);
  ctx.beginPath();
  for (let j = 0; j < NA; j++) {
    const yb = ARMS[j] * R, len = 1.15 + 0.7 * hash(j * 2.3 + 7.7), o = j * (NO_K + 1);
    for (let k = 0; k <= NO; k++) { const u = k / NO; NAX[o + k] = xr + 0.1 - len * u; NAY[o + k] = yb * (0.5 + 0.95 * u) + 0.11 * u * sin(t * 1.2 - u * 4 + j * 2.1); }
    for (let k = 0; k <= NO; k++) {
      const i0 = k ? k - 1 : 0, i1 = k < NO ? k + 1 : NO, tx = NAX[o + i1] - NAX[o + i0], ty = NAY[o + i1] - NAY[o + i0], l = hypot(tx, ty) || 1;
      NNX[k] = -ty / l; NNY[k] = tx / l;
    }
    for (let k = 0; k <= NO; k++) { const u = k / NO, w = (0.15 - 0.12 * u ** 1.4) * (1 + 0.42 * abs(sin(u * 30 + t * 2.2 + j))); const x = NAX[o + k] + NNX[k] * w, y = NAY[o + k] + NNY[k] * w; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let k = NO; k >= 0; k--) { const u = k / NO, w = (0.15 - 0.12 * u ** 1.4) * (1 + 0.42 * abs(sin(u * 27 - t * 1.9 + j * 1.7))); ctx.lineTo(NAX[o + k] - NNX[k] * w, NAY[o + k] - NNY[k] * w); }
    ctx.closePath();
  }
  ctx.fillStyle = H.rgbStr(armC, 0.66); ctx.fill();
  ctx.strokeStyle = H.rgbStr(H.mixRGB(armC, WHITE, 0.4, C2), 0.6); ctx.lineWidth = lw(1); ctx.stroke();
  // frilly clumps (cauliflower-like ruffles) along the arms
  ctx.beginPath();
  const nq = hd ? 11 : 6;
  for (let j = 0; j < NA; j++) for (let q = 0; q < nq; q++) {
    const u = 0.05 + q * (0.72 / (nq - 1)), k = round(u * NO), o = j * (NO_K + 1) + k, w = 0.15 - 0.12 * u ** 1.4, sd = (q + j) & 1 ? 1 : -1;
    const k1 = min(NO, k + 1), tx = NAX[o + (k1 - k)] - NAX[o], ty = NAY[o + (k1 - k)] - NAY[o], l = hypot(tx, ty) || 1;
    const x = NAX[o] - (ty / l) * sd * w * 0.75, y = NAY[o] + (tx / l) * sd * w * 0.75, r = w * (0.62 + 0.1 * sin(t * 2 + q + j));
    circ(ctx, x, y, r); circ(ctx, x - r * 0.7, y + sd * r * 0.35, r * 0.7);
  }
  ctx.fillStyle = H.rgbStr(H.mixRGB(armC, c.nuc, 0.22, C3), 0.5); ctx.fill();
  ctx.strokeStyle = H.rgbStr(H.mixRGB(armC, WHITE, 0.5, C2), 0.45); ctx.lineWidth = lw(0.8); ctx.stroke();
  // ruffled skirt of scapulets round the mouth, under the bell margin
  ctx.save(); ctx.translate(xr - 0.1, 0); ctx.scale(0.22, R * 0.6);
  H.blobPath(ctx, { n: hd ? 40 : 26, t: t * 0.8, seed: 1.3, amp: 0.05, lobes: 9, lobeAmp: 0.22 });
  ctx.restore();
  ctx.fillStyle = H.rgbStr(armC, 0.75); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
  // ---- the bell
  ctx.beginPath(); ctx.ellipse(xr, 0, re, R * (1 + flare), 0, 0, TAU);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, NM_CAV, 0.5, C2), 0.35); ctx.fill();
  nmBell(ctx, xr, L, R, re, flare, hd ? 32 : 20);
  ctx.fillStyle = H.rgbStr(c.body, 0.45); ctx.fill();
  gfill(ctx, H, c.body, 1, xr + L * 0.42, 0, L * 0.72, R * 1.05);
  // mottling: irregular brown blotches and pale warts over the dome (points on the dome, foreshortened)
  ctx.beginPath();
  const nbl = hd ? 30 : 16;
  for (let i = 0; i < nbl; i++) {
    const th = 0.12 + hash(i * 1.9 + 0.3) * 1.28, ph = 0.35 + hash(i * 2.7 + 4.1) * 2.45;
    nmDome(xr, L, R, flare, th); const x = P[0], y = P[1] * cos(ph);
    const r = (0.04 + 0.06 * hash(i + 11.3)) * (0.45 + 0.55 * sin(ph)) * (0.6 + 0.4 * cos(th));
    circ(ctx, x, y, r); circ(ctx, x - r * 0.5, y + r * 0.9 * (hash(i + 3) - 0.5), r * 0.7);
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.42); ctx.fill();
  // faint radial grooves over the dome
  ctx.beginPath();
  for (let q = 1; q < 8; q++) {
    const ph = (q / 8) * PI;
    for (let i = 0; i <= 8; i++) { nmDome(xr, L, R, flare, 0.08 + (i / 8) * 1.42); const y = P[1] * cos(ph); i ? ctx.lineTo(P[0], y) : ctx.moveTo(P[0], y); }
  }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.16); ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < (hd ? 60 : 26); i++) {
    const th = 0.1 + hash(i * 3.3 + 7) * 1.32, ph = 0.3 + hash(i * 1.1 + 2) * 2.55;
    nmDome(xr, L, R, flare, th); circ(ctx, P[0], P[1] * cos(ph), 0.011 + 0.009 * hash(i + 5.5));
  }
  ctx.fillStyle = 'rgba(255,238,220,0.5)'; ctx.fill();
  // inner dome (subumbrella) line and outline
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) { const th = -1.35 + (i / 16) * 2.7; nmDome(xr + 0.08, L * 0.7, R * 0.84, 0, th); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.28); ctx.lineWidth = lw(1.1); ctx.stroke();
  nmBell(ctx, xr, L, R, re, flare, hd ? 32 : 20);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.5); ctx.stroke();
  // scalloped margin (many small lappets)
  ctx.beginPath();
  const nl = hd ? 36 : 18;
  for (let i = 0; i <= nl; i++) { const al = PI / 2 + (i / nl) * PI, r = 1 + 0.3 * abs(sin(i * PI / 2 + 0.5)); const x = xr + re * cos(al) * r, y = R * (1 + flare) * sin(al); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.65); ctx.lineWidth = lw(1.2); ctx.stroke();
  glow(ctx, H, c.glow, xr + 0.5, 0, 1.0, 0.12 + 0.08 * cp);
  glow(ctx, H, NM_FLASH, -1.4, 0, 2.2, 0.32 * sk);
  shine(ctx, H, e, xr + L * 0.55, 0.75);
}

// =================================================================================================== leatherback turtle
// Teardrop leathery shell with seven lengthwise ridges, white speckles, no scutes; huge rowing front flippers.
const LB_CX = -0.2, LB_AX = 0.82, LB_AY = 0.76, LB_SPK = [232, 238, 244], LB_PINK = [236, 150, 168], LB_SKIN = [70, 82, 96];
const LB_RIDGES = [-0.88, -0.6, -0.3, 0, 0.3, 0.6, 0.88];
// teardrop outline point at angle th (0 = front), scaled by k about its centre → P (pointed caudal peak at th = PI)
function lbPt(th, k) { const cs = cos(th), sn = sin(th); P[0] = LB_CX + k * (LB_AX * cs - 0.05 * max(0, cs) ** 16); P[1] = k * LB_AY * sn * ((1 + cs) / 2) ** 0.6; return P; }
function lbShell(ctx, k) { let m = 0; for (let i = 0; i < 40; i++) { lbPt((i / 40) * TAU, k); OX[m] = P[0]; OY[m] = P[1]; m++; } smooth(ctx, m); }
function drawLeather(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.2, 1 - st * 0.15);
  const ph = phaseOf(e, t, 1.0 * (1 + st * 2));
  const skin = H.mixRGB(c.body, LB_SKIN, 0.4, C1);
  const fa = 1.55 + 0.62 * sin(ph), fw = 0.66 + 0.34 * abs(cos(ph)), bend = -0.1 * cos(ph);
  const ra = 2.55 + 0.14 * sin(ph + 0.8), hb = 0.025 * sin(ph * 2 - 0.5);
  if (H.lod) {
    ctx.beginPath();
    for (const sd of [-1, 1]) { const x = 0.36, y = sd * 0.44, a = sd * fa; ctx.moveTo(x, y); ctx.lineTo(x + cos(a - sd * 0.15) * 1.25, y + sin(a - sd * 0.15) * 1.25); ctx.lineTo(x + cos(a + sd * 0.3) * 0.45, y + sin(a + sd * 0.3) * 0.45); ctx.closePath(); }
    ctx.moveTo(1.14, 0); ctx.ellipse(0.9, 0, 0.24, 0.2, 0, 0, TAU);
    ctx.fillStyle = H.cstr(skin); ctx.fill();
    lbShell(ctx, 1); ctx.fillStyle = H.cstr(H.mixRGB(c.body, c.mem, 0.22, C2)); ctx.fill();
    return;
  }
  smudge(ctx, H, SHADE, 0.02, 0.06, 1.2, 1.0, 0.35);
  const sF = H.rgbStr(skin, 0.96), sE = H.rgbStr(c.mem, 0.5), spk = H.rgbStr(LB_SPK, 0.62);
  // rear flippers: broad paddles webbed to the tail
  for (const sd of [-1, 1]) { flipper(ctx, -0.64, sd * 0.24, sd * ra, sd, 0.42, 0.32, 0.02); ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lw(1); ctx.stroke(); }
  // front flippers: the longest of any turtle, rowing slowly (feathering at the end of each stroke)
  for (const sd of [-1, 1]) {
    const L = 1.28, W = 0.42 * fw;
    flipper(ctx, 0.36, sd * 0.44, sd * fa, sd, L, W, bend);
    ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lb(1.2); ctx.stroke();
    ctx.save(); ctx.translate(0.36, sd * 0.44); ctx.rotate(sd * fa); ctx.scale(1, sd);
    // pale trailing edge and white speckles
    ctx.beginPath(); ctx.moveTo(L * 0.97, W * 0.08 + bend); ctx.quadraticCurveTo(L * 0.62, W * 0.52 + bend * 0.5, L * 0.1, W * 0.48);
    ctx.strokeStyle = H.rgbStr(LB_SPK, 0.42); ctx.lineWidth = lw(hd ? 2.2 : 1.6); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 22 : 10); i++) { const x = L * (0.08 + 0.82 * hash(i * 1.7 + 0.4)), y = (hash(i * 2.9 + 3.3) - 0.42) * W * 0.75 * (1 - (x / L) ** 1.5) + bend * (x / L) * 0.6; circ(ctx, x, y, 0.009 + 0.01 * hash(i + 8.1)); }
    ctx.fillStyle = spk; ctx.fill();
    ctx.restore();
  }
  // neck and head: big, blotched, with a notched beak and the pink spot on top
  ctx.beginPath(); ctx.moveTo(0.44, -0.25); ctx.quadraticCurveTo(0.6, -0.22, 0.7 + hb, -0.18); ctx.lineTo(0.7 + hb, 0.18); ctx.quadraticCurveTo(0.6, 0.22, 0.44, 0.25); ctx.closePath();
  ctx.fillStyle = sF; ctx.fill();
  ctx.save(); ctx.translate(hb - 0.045, 0);
  ctx.beginPath(); ctx.moveTo(0.66, -0.17);
  ctx.bezierCurveTo(0.78, -0.27, 1.02, -0.25, 1.12, -0.09);
  ctx.quadraticCurveTo(1.17, -0.04, 1.155, -0.014); ctx.lineTo(1.135, 0); ctx.lineTo(1.155, 0.014);
  ctx.quadraticCurveTo(1.17, 0.04, 1.12, 0.09);
  ctx.bezierCurveTo(1.02, 0.25, 0.78, 0.27, 0.66, 0.17); ctx.closePath();
  ctx.fillStyle = H.rgbStr(skin, 0.97); ctx.fill();
  ctx.save(); ctx.translate(0.92, 0); ctx.scale(0.28, 0.24); ctx.fillStyle = H.bodyGrad(ctx, H.mixRGB(skin, c.nuc, 0.3, C2), 0.9); ctx.fill(); ctx.restore();
  ctx.strokeStyle = sE; ctx.lineWidth = lb(1.2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < (hd ? 16 : 8); i++) { const x = 0.7 + 0.36 * hash(i * 4.1 + 1.3), y = (hash(i * 3.3 + 0.9) * 2 - 1) * 0.17 * sqrt(max(0, 1 - ((x - 0.9) / 0.26) ** 2)); circ(ctx, x, y, 0.01 + 0.012 * hash(i + 2.2)); }
  ctx.fillStyle = spk; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.86, 0, 0.036, 0.028, 0, 0, TAU); ctx.fillStyle = H.rgbStr(LB_PINK, 0.9); ctx.fill();
  ctx.beginPath(); ctx.moveTo(1.15, -0.06); ctx.quadraticCurveTo(1.12, -0.03, 1.135, 0); ctx.quadraticCurveTo(1.12, 0.03, 1.15, 0.06);
  ctx.strokeStyle = 'rgba(14,16,22,0.7)'; ctx.lineWidth = lw(1.4); ctx.stroke();
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(0.95, sd * 0.17, 0.04, 0.03, sd * 0.25, 0, TAU); ctx.fillStyle = 'rgb(12,14,18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0.96, sd * 0.17 - 0.011, 0.011, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  ctx.restore();
  // the leathery shell
  lbShell(ctx, 1);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.45, C3), 0.97); ctx.fill();
  gfill(ctx, H, c.body, 1, -0.12, 0, 0.88, 0.62);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.45); ctx.lineWidth = lb(1.4); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < (hd ? 90 : 40); i++) {
    const th = 0.25 + hash(i * 1.31 + 0.2) * 2.75, f = (hash(i * 2.17 + 5.3) * 2 - 1) * 0.92;
    lbPt(th, 1); circ(ctx, P[0], P[1] * f, 0.008 + 0.014 * hash(i * 3.7 + 1.1));
  }
  ctx.fillStyle = spk; ctx.fill();
  // seven lengthwise ridges converging on the caudal peak: a dark groove under a pale crest
  ctx.beginPath();
  const m = hd ? 20 : 12;
  for (const f of LB_RIDGES) for (let i = 0; i <= m; i++) { const th = 0.46 + (PI - 0.5) * (i / m); lbPt(th, 1); const x = P[0], y = P[1] * f * 0.97; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.lineCap = 'round';
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.45); ctx.lineWidth = lw(hd ? 3.4 : 2.4); ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(hd ? 1.2 : 1); ctx.stroke();
  shine(ctx, H, e, -0.1, 0.95);
}

// =================================================================================================== blue shark
// Slender cobalt shark: long conical snout, big eyes, very long scythe pectorals.
const BS_W = (u) => (u < 0.24 ? 0.014 + 0.206 * sin((u / 0.24) * PI / 2) ** 0.8 : 0.042 + 0.178 * (1 - ((u - 0.24) / 0.76) ** 1.25));
const BS_JX = 0.72, BS_RX = 0.45, BS_RY = 0.19;
function drawBlueShark(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const bite = clamp01(e.biteK || 0), st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.35);
  const ph = phaseOf(e, t, 3.6);
  const n = H.lod ? 10 : 28;
  spine(n, 1.2, 2.45, BS_W, 0.14 * (1 - 0.5 * bite), 4, ph, 2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.08 * sin(ph - 5);
  if (H.lod) {
    outline(ctx, 0.05);
    for (const sd of [-1, 1]) { sp(0.3, sd * 0.9); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] - 0.6, P[1] + sd * 0.75); sp(0.4, sd * 0.7); ctx.lineTo(P[0], P[1]); ctx.closePath(); }
    tailTri(ctx, tx, ty, ta, 0.66, 0.55, 0.25);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  const dark = H.mixRGB(c.body, c.nuc, 0.45, C1);
  const finF = H.rgbStr(dark, 0.92), finE = H.rgbStr(c.mem, 0.6);
  // tall forked tail with long slender lobes
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  tailPath(ctx, 0.72, 0.8, 0.04, flex, 0.4); ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
  ctx.restore();
  // pelvic fins, then the very long scythe pectorals
  for (const sd of [-1, 1]) { sp(0.64, sd * 0.8); sickle(ctx, P[0], P[1], spA(0.64) + sd * (PI / 2 + 0.95), sd, 0.16, 0.07, finF, finE, lw(1)); }
  for (const sd of [-1, 1]) {
    const flap = 0.07 * sin(t * 1.6 + sd);
    sp(0.3, sd * 0.85); sickle(ctx, P[0], P[1], spA(0.3) + sd * (PI / 2 + 0.8 + flap), sd, 0.98, 0.21, finF, finE, lw(1.1));
  }
  // jaws (biting): the lower jaw swings forward ahead of the snout, a dark gape with serrated teeth between
  const g = sstep(bite);
  if (g > 0.01) {
    const d = 0.2 * g;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const a = -1.15 + 2.3 * (i / 12); const x = BS_JX + (BS_RX + d) * cos(a), y = (BS_RY + 0.03 * g) * sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const a = -1.15 + 2.3 * (i / 12); ctx.lineTo(BS_JX + (BS_RX - 0.03) * cos(a), (BS_RY - 0.02) * sin(a)); }
    ctx.closePath(); ctx.fillStyle = 'rgb(58,16,30)'; ctx.fill();
    smudge(ctx, H, [120, 30, 54], BS_JX + BS_RX + d * 0.4, 0, 0.1 + 0.1 * g, 0.15, 0.5 * g);
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const a = -1.15 + 2.3 * (i / 12); const x = BS_JX + (BS_RX + 0.06 + d) * cos(a), y = (BS_RY + 0.025 + 0.03 * g) * sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const a = -1.15 + 2.3 * (i / 12); ctx.lineTo(BS_JX + (BS_RX + d) * cos(a), (BS_RY + 0.03 * g) * sin(a)); }
    ctx.closePath(); ctx.fillStyle = H.rgbStr(c.mem, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    const nt = hd ? 13 : 8;
    for (let i = 0; i < nt; i++) { const a = -1.0 + 2.0 * (i / (nt - 1)); const bx = BS_JX + (BS_RX + d) * cos(a), by = (BS_RY + 0.03 * g) * sin(a); tooth(ctx, bx, by, bx - cos(a) * 0.06 * g, by - sin(a) * 0.045 * g, 0.016); }
    ctx.fillStyle = 'rgba(255,255,250,0.98)'; ctx.fill();
  }
  // body: bright cobalt flanks, deep indigo back
  outline(ctx, 0.05);
  ctx.fillStyle = H.rgbStr(c.body, 0.85); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 1.25, 0.26);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.3); ctx.stroke();
  outline(ctx, 0.03, 0.62, 1, n - 2); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.62, C2), 0.82); ctx.fill();
  // bright cobalt line along each flank
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i <= 10; i++) { sp(0.12 + i * 0.075, sd * 0.78); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.45, C4), 0.55); ctx.lineWidth = lw(1.3); ctx.stroke();
  // gill slits
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { sp(0.19 + i * 0.02, sd * 0.98); ctx.moveTo(P[0], P[1]); sp(0.19 + i * 0.02 - 0.008, sd * 0.7); ctx.lineTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
  // upper teeth peeking down from the snout as it bites
  if (g > 0.1) {
    ctx.beginPath();
    const nt = hd ? 11 : 7;
    for (let i = 0; i < nt; i++) { const a = -0.95 + 1.9 * (i / (nt - 1)), bx = BS_JX + (BS_RX - 0.04) * cos(a), by = (BS_RY - 0.02) * sin(a); tooth(ctx, bx - cos(a) * 0.02, by - sin(a) * 0.02, bx + cos(a) * 0.06 * g, by + sin(a) * 0.04 * g, 0.016); }
    ctx.fillStyle = 'rgba(255,255,250,0.98)'; ctx.fill();
  }
  // first dorsal (set back, leaning) and the small second dorsal
  {
    sp(0.38, 0); const ax = P[0], ay = P[1]; sp(0.53, 0); const bx = P[0], by = P[1];
    const hx = ax - 0.26, hy = ay - 0.16;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax - 0.05, ay - 0.09, hx, hy); ctx.quadraticCurveTo(hx + 0.03, (hy + by) / 2, bx, by); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.7, C3), 0.95); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
    sp(0.74, 0); const cx0 = P[0], cy0 = P[1]; sp(0.8, 0);
    ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(cx0 - 0.04, cy0 - 0.05, P[0] - 0.02, P[1] - 0.045); ctx.lineTo(P[0], P[1]); ctx.closePath();
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  // nostrils and big round eyes
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(1.07, sd * 0.035); ctx.lineTo(1.02, sd * 0.06); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(1.2); ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.115, sd * 0.8); eye(ctx, P[0], P[1], 0.05, 'rgb(36,46,78)', lw(1), 0.76, '#02040a', 0.1); }
  shine(ctx, H, e, 0.35, 0.55);
}

// =================================================================================================== California sea lion
// Sleek brown body, dog-like muzzle with whiskers, small ear flaps, long fore-flippers, paired hind flippers.
// half-width along the body: blunt muzzle, round skull, a slight neck, deep chest, tapering to the hips
const SL_W = (u) => (u < 0.05 ? 0.058 + 0.032 * sin((u / 0.05) * PI / 2)
  : u < 0.13 ? 0.09 + 0.09 * sin(((u - 0.05) / 0.08) * PI / 2)
  : u < 0.21 ? 0.18 - 0.028 * sin(((u - 0.13) / 0.08) * PI)
  : u < 0.4 ? 0.18 + 0.1 * sin(((u - 0.21) / 0.19) * PI / 2)
  : 0.07 + 0.21 * (1 - ((u - 0.4) / 0.6) ** 1.6));
const SL_TAN = [214, 172, 124], SL_GAPE = [120, 36, 48];
// hind flipper in local space: root at the origin pointing +x, outer edge at −y, five toes on a scalloped trailing edge
function hindFlipper(ctx, L, W) {
  ctx.beginPath(); ctx.moveTo(0, -W * 0.22);
  ctx.quadraticCurveTo(L * 0.55, -W * 0.3, L * 1.02, -W * 0.56);
  for (let k = 1; k <= 5; k++) { const y1 = -W * 0.56 + k * W * 0.22; ctx.quadraticCurveTo(L * (0.86 - 0.02 * k), y1 - W * 0.11, L * (1.02 - 0.05 * k), y1); }
  ctx.quadraticCurveTo(L * 0.5, W * 0.2, 0, W * 0.16); ctx.closePath();
}
// fore-flipper: a long, broad, blunt-tipped paddle (leading edge at local −y); leaves the path open
function foreFlipper(ctx, x, y, a, side, L, W, bend) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.3, -W * 0.66, L * 0.72, -W * 0.52 + bend * 0.4, L * 0.93, -W * 0.22 + bend);
  ctx.quadraticCurveTo(L * 1.03, -W * 0.02 + bend, L * 0.92, W * 0.16 + bend);
  ctx.bezierCurveTo(L * 0.66, W * 0.4 + bend * 0.5, L * 0.3, W * 0.56, 0, W * 0.5);
  ctx.closePath();
  ctx.restore();
}
function drawSeaLion(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = clamp01(e.sprintK || 0), bite = clamp01(e.biteK || 0), B = sstep(bite), st = (e.stretch || 0) + 0.07 * k;
  if (st) ctx.scale(1 + st * 0.4, 1 - st * 0.3);
  const ph = phaseOf(e, t, 2.2 + 3 * k), fp = phaseOf(e, t, 1.7 + 2.3 * k, 1);
  const play = (1 - 0.85 * k) * (1 - 0.6 * B);
  const roll = 0.5 * sin(t * 0.9 + 0.5) * play, ws = 1 - 0.12 * abs(roll);
  const n = H.lod ? 10 : 26;
  spine(n, 1.1 + 0.05 * B, 2.0, SL_W, 0.13 * play + 0.04, 3, ph, 1.6, 0.3 * sin(t * 0.7) * play);
  const tx = SX[n], ty = SY[n], ta = SA[n];
  if (H.lod) {
    outline(ctx, 0.05, ws);
    for (const sd of [-1, 1]) {
      sp(0.35, sd * 0.86); const a = spA(0.35) + sd * (PI / 2 + 0.6 + 0.7 * k);
      ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] + cos(a) * 0.75, P[1] + sin(a) * 0.75); ctx.lineTo(P[0] + cos(a + sd * 0.5) * 0.3, P[1] + sin(a + sd * 0.5) * 0.3); ctx.closePath();
    }
    tailTri(ctx, tx, ty, ta, 0.55, 0.35, 0.4);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  if (k > 0.01) streaks(ctx, H, c, t, k, 0.4, 0.12);
  const flipC = H.mixRGB(c.nuc, c.body, 0.3, C1), fF = H.rgbStr(flipC, 0.96), fE = H.rgbStr(c.mem, 0.42);
  // hind flippers: a separate pair trailing in a V, toes spread
  for (const sd of [-1, 1]) {
    const a = ta - sd * (0.34 + 0.12 * sin(t * 2.4 + sd * 1.3) * (1 - k) - 0.16 * k);
    sp(0.95, sd * 0.62);
    ctx.save(); ctx.translate(P[0], P[1]); ctx.rotate(a); ctx.scale(1, sd);
    hindFlipper(ctx, 0.56, 0.27); ctx.fillStyle = fF; ctx.fill(); ctx.strokeStyle = fE; ctx.lineWidth = lw(1); ctx.stroke();
    if (s > 40) {
      ctx.beginPath(); for (let q = 0; q < 5; q++) { ctx.moveTo(0.08, (-0.06 + q * 0.025)); ctx.lineTo(0.56 * (0.9 - 0.05 * q), 0.27 * (-0.45 + q * 0.22)); }
      ctx.strokeStyle = H.rgbStr(c.mem, 0.22); ctx.lineWidth = lw(0.8); ctx.stroke();
    }
    ctx.restore();
  }
  // long fore-flippers: the sea lion "flies" with them; swept back when sprinting
  for (const sd of [-1, 1]) {
    sp(0.34, sd * 0.86);
    const L = 0.7 * (1 + 0.22 * roll * sd) * (1 - 0.08 * k), W = 0.3 * (0.85 + 0.15 * abs(cos(fp)));
    const a = spA(0.34) + sd * (PI / 2 + 0.55 + 0.4 * sin(fp) * (1 - 0.75 * k) + 0.75 * k);
    const x = P[0], y = P[1];
    foreFlipper(ctx, x, y, a, sd, L, W, -0.05 * cos(fp));
    ctx.fillStyle = fF; ctx.fill(); ctx.strokeStyle = fE; ctx.lineWidth = lb(1.1); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, sd);
    // furred base (body colour) fading into the bare dark paddle; digit lines when big
    ctx.beginPath(); ctx.ellipse(L * 0.12, 0, L * 0.2, W * 0.5, 0, 0, TAU); ctx.fillStyle = H.rgbStr(c.body, 0.85); ctx.fill();
    if (s > 60) {
      ctx.beginPath(); for (let q = 0; q < 4; q++) { const yy = (-0.27 + q * 0.17) * W; ctx.moveTo(L * 0.3, yy); ctx.quadraticCurveTo(L * 0.62, yy * 0.85, L * (0.86 + 0.02 * q - 0.04 * abs(q - 1.5)), yy * 0.45); }
      ctx.strokeStyle = H.rgbStr(c.mem, 0.2); ctx.lineWidth = lw(0.9); ctx.stroke();
    }
    ctx.restore();
  }
  // biting: the lower jaw swings forward, a dark pink gape and the canines
  const sx = SX[0], sy = SY[0], ha = SA[0] - PI;
  if (B > 0.01) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ha);
    ctx.beginPath(); ctx.moveTo(-0.1, -0.07); ctx.quadraticCurveTo(0.06 + 0.15 * B, -0.085 - 0.02 * B, 0.08 + 0.16 * B, 0); ctx.quadraticCurveTo(0.06 + 0.15 * B, 0.085 + 0.02 * B, -0.1, 0.07); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, SL_TAN, 0.5, C2), 0.97); ctx.fill(); ctx.strokeStyle = fE; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.08, -0.05); ctx.quadraticCurveTo(0.04 + 0.12 * B, -0.065, 0.055 + 0.13 * B, 0); ctx.quadraticCurveTo(0.04 + 0.12 * B, 0.065, -0.08, 0.05); ctx.closePath();
    ctx.fillStyle = H.rgbStr(SL_GAPE, 0.95); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.02 + 0.04 * B, 0, 0.045 + 0.03 * B, 0.028, 0, 0, TAU); ctx.fillStyle = 'rgb(214,120,130)'; ctx.fill();
    ctx.beginPath(); for (const sd of [-1, 1]) tooth(ctx, 0.05 + 0.13 * B, sd * 0.05, 0.02 + 0.09 * B, sd * 0.028, 0.013);
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.fill();
    ctx.restore();
  }
  // tail stub between the hind flippers
  ctx.beginPath(); sp(0.98, -0.4); ctx.moveTo(P[0], P[1]); ctx.lineTo(tx + cos(ta) * 0.1, ty + sin(ta) * 0.1); sp(0.98, 0.4); ctx.lineTo(P[0], P[1]); ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.body, 0.95); ctx.fill();
  // sleek body
  outline(ctx, 0.05, ws);
  ctx.fillStyle = H.rgbStr(c.body, 0.92); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.1, 0, 1.05, 0.34);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lb(1.2); ctx.stroke();
  // darker back (shifts as it rolls) and the pale belly showing on the rolled-up side
  strip(ctx, 0.12, 0.97, (-0.55 - 0.35 * roll) * ws, (0.55 - 0.35 * roll) * ws, 14, true); ctx.fillStyle = H.rgbStr(c.nuc, 0.3); ctx.fill();
  if (abs(roll) > 0.03) { const sd = roll > 0 ? 1 : -1; strip(ctx, 0.2, 0.86, sd * 0.97 * ws, sd * 0.5 * ws, 10, true); ctx.fillStyle = H.rgbStr(SL_TAN, 0.6 * abs(roll)); ctx.fill(); }
  if (hd) { // fur lie: short strokes flowing back
    ctx.beginPath();
    for (let i = 0; i < 46; i++) { const u = 0.16 + 0.78 * hash(i * 1.3 + 0.5), f = (hash(i * 2.1 + 3.3) * 2 - 1) * 0.8 * ws; sp(u, f); const x = P[0], y = P[1]; sp(u + 0.035, f * 0.97); ctx.moveTo(x, y); ctx.lineTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.25); ctx.lineWidth = lw(1); ctx.stroke();
  }
  // lighter muzzle
  sp(0.03, 0); ctx.beginPath(); ctx.ellipse(P[0], P[1], 0.085, 0.08 * ws, ha, 0, TAU); ctx.fillStyle = H.rgbStr(SL_TAN, 0.5); ctx.fill();
  // wet sheen along the back
  ctx.beginPath(); for (let i = 0; i <= 10; i++) { sp(0.2 + i * 0.06, (-0.3 - 0.35 * roll) * ws); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = lw(2.4); ctx.lineCap = 'round'; ctx.stroke();
  // small rolled ear flaps behind the eyes
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    sp(0.155, sd * 0.97 * ws); const x = P[0], y = P[1], a = spA(0.155) + PI - sd * 0.75, ca = cos(a), sa = sin(a);
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + ca * 0.04 - sa * sd * 0.03, y + sa * 0.04 + ca * sd * 0.03, x + ca * 0.08, y + sa * 0.08); ctx.quadraticCurveTo(x + ca * 0.035 + sa * sd * 0.012, y + sa * 0.035 - ca * sd * 0.012, x, y);
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.85); ctx.fill();
  // nose
  ctx.beginPath(); ctx.ellipse(sx - cos(ha) * 0.02, sy - sin(ha) * 0.02, 0.028, 0.04, ha, 0, TAU); ctx.fillStyle = 'rgb(30,20,16)'; ctx.fill();
  // big dark eyes
  for (const sd of [-1, 1]) { sp(0.088, sd * 0.6 * ws); eye(ctx, P[0], P[1], 0.044, 'rgb(34,22,16)', lw(0.9), 0.78, '#000', 0.1); }
  // upper canines when biting
  if (B > 0.2) {
    ctx.beginPath(); for (const sd of [-1, 1]) { const bx = sx - cos(ha) * 0.01 - sin(ha) * sd * 0.045, by = sy - sin(ha) * 0.01 + cos(ha) * sd * 0.045; tooth(ctx, bx, by, bx + cos(ha) * 0.06 * B, by + sin(ha) * 0.06 * B, 0.012); }
    ctx.fillStyle = 'rgba(255,252,240,0.95)'; ctx.fill();
  }
  // whiskers fanning from the muzzle (flared forward when it bites)
  ctx.beginPath();
  const nw = hd ? 8 : 5;
  for (const sd of [-1, 1]) for (let q = 0; q < nw; q++) {
    sp(0.018 + q * (0.022 / nw), sd * 0.85 * ws); const x = P[0], y = P[1];
    const a = ha + sd * (0.75 + (q * 0.9) / nw - 0.4 * B), l = 0.13 + (0.07 * q) / nw + 0.015 * sin(t * 1.5 + q);
    const a2 = a + sd * 0.5;
    ctx.moveTo(x, y); ctx.quadraticCurveTo(x + cos(a) * l * 0.55, y + sin(a) * l * 0.55, x + cos(a2) * l, y + sin(a2) * l);
  }
  ctx.strokeStyle = 'rgba(255,246,226,0.75)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  // whisker pads
  if (s > 40) { ctx.beginPath(); for (const sd of [-1, 1]) for (let q = 0; q < 4; q++) { sp(0.016 + q * 0.007, sd * (0.55 + 0.1 * (q & 1)) * ws); circ(ctx, P[0], P[1], 0.006); } ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill(); }
  shine(ctx, H, e, 0.3, 0.6);
}

// =================================================================================================== lion's mane jellyfish (boss)
// Seen from straight above: a huge eight-lobed bell, red-orange to yellow, eight horseshoe clusters of pleated
// tentacle bases and a frilly red "mane" of oral curtains in the centre, with a dense fringe of fine tentacles
// streaming back to ~−1.6. The long tentacle curtains are drawn by the game with the exported `tentacle` drawer.
const LM_DEEP = [150, 28, 20], LM_YEL = [255, 206, 96], LM_TENT = [236, 92, 44], LM_TENT2 = [255, 168, 84], LM_LIMP = [112, 80, 70], LM_BRUISE = [64, 16, 14], LM_FLASH = [255, 214, 150], LM_GLOW = [255, 140, 70];
const LM_R = 0.95;
let LMT = 0, LMH = 0, LMN = 0.08;
// bell margin radius at angle th: 8 lobes (centred on 0, ±PI/4, …) split by deep notches, 4 lappets per lobe; hurt crumples it
function lmRad(th, R) {
  const v = th / (TAU / 8) - round(th / (TAU / 8)), dn = 0.5 - abs(v);
  let r = 1 + 0.016 * cos(v * TAU) - LMN * exp(-((dn / 0.055) ** 2)) - 0.008 * (1 - abs(sin(v * 4 * PI)));
  if (LMH) r += LMH * (0.05 * sin(th * 5 + LMT * 9) + 0.03 * sin(th * 11 - LMT * 13));
  return R * r;
}
function lmBell(ctx, R, n) { for (let i = 0; i < n; i++) { const th = (i / n) * TAU, r = lmRad(th, R); OX[i] = cos(th) * r; OY[i] = sin(th) * r; } smooth(ctx, n); }
// the fringe: n fine tentacles in 8 clusters (one per lobe) from under the margin, streaming back (one path)
function lmFringe(ctx, R, t, cK, n, layer) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const h = hash(i * 1.37 + layer * 9.1), lobe = i % 8;
    const th = (lobe + (h - 0.5) * 0.78) * (TAU / 8), cs = cos(th), sn = sin(th);
    const r0 = R * (0.8 + 0.08 * hash(i * 2.3 + 1 + layer)), x0 = cs * r0, y0 = sn * r0;
    const out = (0.16 + 0.2 * hash(i * 3.7 + layer * 2.1)) * (1 - 0.35 * cK);
    const back = (0.04 + 0.36 * ((1 - cs) / 2) * (0.7 + 0.6 * hash(i * 5.1 + layer))) * (1 - 0.25 * cK);
    const x1 = x0 + cs * out - back, y1 = y0 + sn * out;
    const dx = x1 - x0, dy = y1 - y0, l = hypot(dx, dy) || 1, px = -dy / l, py = dx / l;
    const wv = (0.02 + 0.06 * l) * sin(t * 2.2 + i * 1.7 + layer);
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x0 + dx * 0.33 + px * wv, y0 + dy * 0.33 + py * wv, x0 + dx * 0.66 - px * wv, y0 + dy * 0.66 - py * wv, x1, y1);
  }
}
// ---- exported curtain drawer: a bundle of fine wavy tentacles from A to B in the current transform's units.
// k = 1 healthy (faint glow) … 0 cut and limp (dim, slack). Cheap: one path of 3–5 strands, ≤ 3 strokes.
const TN_PH = [0, 2.1, 4.3, 1.2, 3.4], TN_STY = new Array(17);
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
function tnStyle(q) {
  let o = TN_STY[q];
  if (!o) {
    const k = q / 16, m = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    o = TN_STY[q] = { main: rgba(m(LM_LIMP, LM_TENT), 0.4 + 0.4 * k), hi: rgba(m(LM_LIMP, LM_TENT2), 0.55 * k), glow: rgba(LM_GLOW, 0.14 * k) };
  }
  return o;
}
// Each strand's sideways offset at an end point depends only on that point's position (and t), so consecutive
// segments meet exactly and the strands weave across one another along the curtain like loose hair.
const TN_O = new Float32Array(10);
function tnOffsets(x, y, px, t, ns, gap, k, base) {
  const f = ((x * 0.8 + y * 0.6) / px) * 0.035 + t * (0.5 + 0.7 * k);
  for (let j = 0; j < ns; j++) TN_O[base + j] = (j - (ns - 1) / 2) * gap + gap * (0.9 + 0.4 * k) * sin(f + j * 1.9 + TN_PH[j]);
}
function tnPath(ctx, ax, ay, bx, by, nx, ny, ns, j0, dj, amp, w0, sag, k) {
  ctx.beginPath();
  for (let j = j0; j < ns; j += dj) {
    const oa = TN_O[j], ob = TN_O[5 + j], wv = amp * sin(w0 + TN_PH[j] * 1.7 + j * (1 - k) * 0.9) + sag, om = (oa + ob) / 2 + wv;
    ctx.moveTo(ax + nx * oa, ay + ny * oa);
    ctx.quadraticCurveTo((ax + bx) / 2 + nx * om, (ay + by) / 2 + ny * om, bx + nx * ob, by + ny * ob);
  }
}
function lmTentacle(ctx, ax, ay, bx, by, t, H, k) {
  const dx = bx - ax, dy = by - ay, L = hypot(dx, dy);
  if (!(L > 1e-9)) return;
  k = clamp01(k || 0);
  const px = H && H.lw ? H.lw(1) : 1, nx = -dy / L, ny = dx / L, sty = tnStyle(round(k * 16));
  const ns = k > 0.3 ? 5 : 3, gap = px * (0.8 + 1.4 * k), amp = min(L * 0.3, px * (2.2 + 2.2 * (1 - k)));
  const w0 = t * (0.6 + 1.8 * k) + ((ax - ay) / px) * 0.05, sag = 0;
  tnOffsets(ax, ay, px, t, ns, gap, k, 0); tnOffsets(bx, by, px, t, ns, gap, k, 5);
  ctx.save();
  ctx.lineCap = 'butt';
  tnPath(ctx, ax, ay, bx, by, nx, ny, ns, 0, 1, amp, w0, sag, k);
  if (k > 0.05) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = sty.glow; ctx.lineWidth = px * 4; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; }
  ctx.lineCap = 'round';
  ctx.strokeStyle = sty.main; ctx.lineWidth = px * (0.8 + 0.4 * k); ctx.stroke();
  if (k > 0.3) { tnPath(ctx, ax, ay, bx, by, nx, ny, ns, 1, 2, amp, w0, sag, k); ctx.strokeStyle = sty.hi; ctx.lineWidth = px * 0.8; ctx.stroke(); } // two lighter strands
  ctx.restore();
}
// preview only: a few curtains trailing from the bell, two of them cut
function lmCurtains(ctx, t, H, R) {
  for (let j = 0; j < 8; j++) {
    const th = PI * (0.6 + 0.8 * (j / 7)), k = j === 2 || j === 6 ? 0 : 1, nseg = k ? 14 : 6;
    const y0 = sin(th) * R * 0.7;
    let ax = cos(th) * R * 0.7, ay = y0;
    for (let q = 1; q <= nseg; q++) {
      const u = q / 14, bx = ax - 0.26, by = y0 * (1 + 0.5 * u) + 0.22 * u * sin(t * 1.2 - u * 5 + j * 1.3) + (k ? 0 : 0.25 * u * u);
      lmTentacle(ctx, ax, ay, bx, by, t, H, k);
      ax = bx; ay = by;
    }
  }
}
function drawLionsMane(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const pk = clamp01(e.pulse || 0), sk = clamp01(e.stingK || 0), hk = clamp01(e.hurtK || 0), st = e.stretch || 0;
  const cK = pk + 0.3 * bellPulse(t * 0.8) * (1 - pk);
  if (hk > 0) ctx.translate(0.025 * hk * sin(t * 37) - 0.04 * hk, 0.02 * hk * sin(t * 29));
  if (st) ctx.scale(1 - st * 0.15, 1 + st * 0.08);
  const R = LM_R * (1 - 0.14 * cK) * (1 - 0.1 * hk);
  LMT = t; LMH = hk; LMN = 0.07 + 0.07 * cK + 0.04 * hk;
  const body = H.mixRGB(c.body, LM_BRUISE, 0.5 * hk, C1), deep = H.mixRGB(c.nuc, LM_BRUISE, 0.45 * hk, C2);
  if (e.withCurtains) lmCurtains(ctx, t, H, R);
  if (H.lod) {
    lmFringe(ctx, R, t, cK, 16, 0); ctx.strokeStyle = H.rgbStr(sk ? LM_FLASH : LM_TENT, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
    lmBell(ctx, R, 40); ctx.fillStyle = H.cstr(body); ctx.fill();
    return;
  }
  glow(ctx, H, c.glow, -0.15, 0, 1.7, 0.2 * (1 - 0.6 * hk));
  // fringe of fine hair-like tentacles under the bell
  const n0 = hd ? 170 : s > 30 ? 72 : 32, n1 = hd ? 80 : s > 30 ? 30 : 0;
  ctx.lineCap = 'round';
  lmFringe(ctx, R, t, cK, n0, 0); ctx.strokeStyle = H.rgbStr(H.mixRGB(LM_TENT, LM_LIMP, 0.4 * hk, C3), 0.6); ctx.lineWidth = lw(hd ? 1 : 0.85); ctx.stroke();
  if (n1) { lmFringe(ctx, R, t, cK, n1, 1); ctx.strokeStyle = H.rgbStr(H.mixRGB(LM_TENT2, LM_LIMP, 0.4 * hk, C4), 0.5); ctx.lineWidth = lw(0.8); ctx.stroke(); }
  if (sk > 0.01) { // stinging: the fringe flashes
    ctx.globalCompositeOperation = 'lighter';
    lmFringe(ctx, R, t, cK, n0, 0); ctx.strokeStyle = H.rgbStr(LM_FLASH, 0.45 * sk); ctx.lineWidth = lw(3.2); ctx.stroke();
    ctx.strokeStyle = H.rgbStr(WHITE, 0.6 * sk); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    glow(ctx, H, LM_FLASH, -0.85, 0, 1.3, 0.45 * sk, 0, 1.1);
    for (let i = 0; i < 8; i++) { const a = PI * (0.55 + 0.9 * (i / 7)); glow(ctx, H, LM_FLASH, cos(a) * R * 1.05 - 0.3 * (1 - cos(a)) / 2, sin(a) * R * 1.05, 0.26, 0.55 * sk * (0.7 + 0.3 * sin(t * 18 + i * 2)), 1); }
  }
  // ---- the bell: translucent golden margin over a deep red-orange centre
  const nb = hd ? 128 : 80, gold = H.mixRGB(body, LM_YEL, 0.4, C3);
  lmBell(ctx, R, nb);
  ctx.fillStyle = H.rgbStr(gold, 0.55); ctx.fill();
  gfill(ctx, H, gold, 0.8, 0, 0, R, R);
  smudge(ctx, H, deep, 0, 0, R * 0.95, R * 0.95, 0.8 * (1 - 0.3 * hk));
  smudge(ctx, H, body, 0, 0, R * 0.8, R * 0.8, 0.35);
  // 16 radial bands (canals out to the lobe centres and the notches), tapered at both ends
  ctx.beginPath();
  for (let q = 0; q < 16; q++) {
    const a = (q * TAU) / 16, r1 = lmRad(a, R) * 0.9, rm = R * 0.55, dA = q & 1 ? 0.035 : 0.05;
    ctx.moveTo(cos(a) * R * 0.2, sin(a) * R * 0.2); ctx.lineTo(cos(a - dA) * rm, sin(a - dA) * rm); ctx.lineTo(cos(a) * r1, sin(a) * r1); ctx.lineTo(cos(a + dA) * rm, sin(a + dA) * rm); ctx.closePath();
  }
  ctx.fillStyle = H.rgbStr(deep, 0.16); ctx.fill();
  // eight horseshoe clusters of tentacle bases seen through the bell: a soft band, then tufts of hair-fine roots
  ctx.beginPath();
  for (let q = 0; q < 8; q++) {
    const ac = (q * TAU) / 8;
    for (let i = 0; i <= 10; i++) { const v = i / 10 - 0.5, a = ac + v * 0.6, r = R * (0.67 + 0.15 * (2 * v) ** 2); i ? ctx.lineTo(cos(a) * r, sin(a) * r) : ctx.moveTo(cos(a) * r, sin(a) * r); }
  }
  ctx.strokeStyle = H.rgbStr(deep, 0.24); ctx.lineWidth = R * 0.11; ctx.stroke();
  ctx.beginPath();
  const nz = hd ? 20 : s > 30 ? 11 : 7;
  for (let q = 0; q < 8; q++) {
    const ac = (q * TAU) / 8;
    for (let i = 0; i <= nz; i++) {
      const v = i / nz - 0.5, a = ac + v * 0.6, r = R * (0.62 + 0.15 * (2 * v) ** 2), l = R * (0.09 + 0.04 * hash(i * 1.3 + q)), b = 0.12 * sin(t * 1.4 + i * 0.8 + q) + v * 0.5;
      ctx.moveTo(cos(a) * r, sin(a) * r); ctx.quadraticCurveTo(cos(a) * (r + l * 0.5), sin(a) * (r + l * 0.5), cos(a + b * 0.1) * (r + l), sin(a + b * 0.1) * (r + l));
    }
  }
  ctx.strokeStyle = H.rgbStr(H.mixRGB(deep, body, 0.2, C4), 0.6); ctx.lineWidth = lw(hd ? 1.3 : 1); ctx.lineCap = 'round'; ctx.stroke();
  // the central "mane": four long, ruffled oral curtains in a cross, deep red, with fold lines
  ctx.beginPath();
  const mc = hd ? 30 : 16, Lc = R * 0.56 * (1 - 0.1 * cK);
  for (let q = 0; q < 4; q++) {
    const a = PI / 4 + (q * PI) / 2, ca = cos(a), sa = sin(a);
    for (let i = 0; i <= mc; i++) { const u = i / mc, w = R * 0.15 * sin(u * PI) ** 0.6 * (1 + 0.2 * sin(u * 40 + t * 1.4 + q)), d = Lc * u; const x = ca * d - sa * w, y = sa * d + ca * w; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = mc; i >= 0; i--) { const u = i / mc, w = R * 0.15 * sin(u * PI) ** 0.6 * (1 + 0.2 * sin(u * 37 - t * 1.2 + q * 2)), d = Lc * u; ctx.lineTo(ca * d + sa * w, sa * d - ca * w); }
    ctx.closePath();
  }
  ctx.fillStyle = H.rgbStr(deep, 0.5); ctx.fill();
  ctx.strokeStyle = H.rgbStr(H.mixRGB(deep, LM_YEL, 0.5, C4), 0.5); ctx.lineWidth = lw(1); ctx.stroke();
  if (s > 30) {
    ctx.beginPath();
    for (let q = 0; q < 4; q++) {
      const a = PI / 4 + (q * PI) / 2, ca = cos(a), sa = sin(a);
      for (const f of [-0.45, 0, 0.45]) for (let i = 0; i <= 8; i++) { const u = 0.12 + (i / 8) * 0.8, w = R * 0.15 * sin(u * PI) ** 0.6 * f + R * 0.012 * sin(u * 26 + t + q + f * 5), d = Lc * u; const x = ca * d - sa * w, y = sa * d + ca * w; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    }
    ctx.strokeStyle = H.rgbStr(H.mixRGB(deep, LM_BRUISE, 0.4, C4), 0.45); ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  ctx.beginPath(); circ(ctx, 0, 0, R * 0.06); ctx.fillStyle = H.rgbStr(LM_BRUISE, 0.5); ctx.fill();
  // rim, inner lappet line, coronal muscle rings (hd)
  lmBell(ctx, R, nb);
  if (hk > 0.01) { ctx.fillStyle = H.rgbStr(LM_BRUISE, 0.35 * hk); ctx.fill(); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.62); ctx.lineWidth = lb(1.3); ctx.stroke();
  lmBell(ctx, R * 0.93, nb);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.22); ctx.lineWidth = lw(1); ctx.stroke();
  if (hd) {
    ctx.beginPath(); circ(ctx, 0, 0, R * 0.84); circ(ctx, 0, 0, R * 0.875);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.12); ctx.lineWidth = lw(1); ctx.stroke();
  }
  // rhopalia (sense organs) in the eight notches
  if (s > 30) {
    ctx.beginPath();
    for (let q = 0; q < 8; q++) { const a = ((q + 0.5) * TAU) / 8, r = lmRad(a, R) + 0.012; circ(ctx, cos(a) * r, sin(a) * r, hd ? 0.016 : 0.022); }
    ctx.fillStyle = H.rgbStr(LM_YEL, 0.9); ctx.fill();
  }
  glow(ctx, H, c.glow, 0, 0, 0.9 * R, 0.14 * (1 - hk));
  shine(ctx, H, e, -0.1, 0.9);
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
  salp: {
    name: 'Salp chain',
    col: { body: [176, 228, 250], mem: [232, 250, 255], nuc: [255, 146, 58], glow: [160, 225, 255] },
    portraitR: 0.3,
    states: [{ label: 'idle' }, { label: 'cruising (stretch 0.15)', stretch: 0.15, view: [0.9, 0] }],
    draw: entry(drawSalp),
  },
  pyrosome: {
    name: 'Pyrosome',
    col: { body: [236, 178, 208], mem: [255, 234, 246], nuc: [110, 255, 226], glow: [100, 236, 236] },
    portraitR: 0.3,
    states: [{ label: 'idle', view: [0.85, 0.05] }, { label: 'glowK 0.5', glowK: 0.5, view: [0.85, 0.05] }, { label: 'glowK 1', glowK: 1, view: [0.85, 0.05] }],
    draw: entry(drawPyro),
  },
  nomura: {
    name: 'Nomura\'s jellyfish',
    col: { body: [214, 150, 124], mem: [255, 230, 210], nuc: [120, 66, 44], glow: [255, 190, 150] },
    portraitR: 0.22,
    states: [{ label: 'idle', view: [0.62, 1.05] }, { label: 'stingK 0.5', stingK: 0.5, view: [0.62, 1.05] }, { label: 'stingK 1', stingK: 1, view: [0.62, 1.05] }],
    draw: entry(drawNomura),
  },
  leatherback: {
    name: 'Leatherback turtle',
    col: { body: [58, 68, 82], mem: [200, 212, 222], nuc: [16, 20, 28], glow: [150, 180, 200] },
    portraitR: 0.24,
    states: [{ label: 'idle', view: [0.55, 0] }, { label: 'cruising (stretch 0.15)', stretch: 0.15, view: [0.55, 0] }],
    draw: entry(drawLeather),
  },
  blueshark: {
    name: 'Blue shark',
    col: { body: [52, 106, 210], mem: [176, 210, 255], nuc: [14, 26, 74], glow: [90, 150, 255] },
    portraitR: 0.2,
    states: [{ label: 'idle', view: [0.62, 0.35] }, { label: 'biteK 0.5', biteK: 0.5, view: [0.62, 0.3] }, { label: 'biteK 1', biteK: 1, view: [0.62, 0.2] }],
    draw: entry(drawBlueShark),
  },
  sealion: {
    name: 'California sea lion',
    col: { body: [146, 102, 62], mem: [236, 206, 166], nuc: [56, 36, 22], glow: [220, 170, 110] },
    portraitR: 0.24,
    states: [
      { label: 'idle', view: [0.68, 0.2] },
      { label: 'sprintK 1', sprintK: 1, view: [0.62, 0.3] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.68, 0.1] },
      { label: 'biteK 1', biteK: 1, view: [0.68, 0.05] },
    ],
    draw: entry(drawSeaLion),
  },
  lionsmane: {
    name: 'Lion\'s mane jellyfish',
    boss: true,
    col: { body: [232, 110, 52], mem: [255, 216, 160], nuc: [150, 30, 22], glow: [255, 150, 70] },
    portraitR: 0.26,
    states: [
      { label: 'idle', view: [0.75, 0.35] },
      { label: 'pulse 0.5', pulse: 0.5, view: [0.75, 0.35] },
      { label: 'pulse 1', pulse: 1, view: [0.75, 0.35] },
      { label: 'stingK 1', stingK: 1, view: [0.75, 0.35] },
      { label: 'hurtK 0.5', hurtK: 0.5, view: [0.75, 0.35] },
      { label: 'hurtK 1', hurtK: 1, view: [0.75, 0.35] },
      { label: 'tentacle curtains (k 1 / cut k 0)', withCurtains: true, view: [0.42, 1.6] },
    ],
    tentacle: lmTentacle,
    draw: entry(drawLionsMane),
  },
};
