// Creature art for the t10 tier: whale-shark scale (10 – 30 m): the open ocean's giants, and the clouds of tiny
// animals a filter feeder lives on. Each entry: { name, col, portraitR, states, draw(ctx, e, t, s, H, opts) } — see
// README.md. Like t5/t6, every animal is seen from above: +x = heading and the body is mirror-symmetric about the x
// axis (the sperm whale's single blowhole sits at the front left, as in life).
// Whales beat their flukes up and down, so from above their bodies barely sway: the beat shows as the flukes
// foreshortening. Dorsal fins and spouts lean towards −y (the same cheat t6 uses) so their height reads from above.
// The swarms (krill, bait ball, coral eggs) are pre-baked point tables animated from `t`, a few paths each; they thin
// out as they are eaten (e.hp / e.maxHp).
// Preview-only extras: `e.view = [k, dx]` zooms the drawing out by k and pans it by dx units (dev gallery tiles);
// `e.hdPreview` forces the boss-scale detail (H.hd) in a gallery tile.

const TAU = Math.PI * 2, HPI = Math.PI / 2;
const { sin, cos, min, max, abs, sqrt, PI, floor, round, exp } = Math;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const sstep = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const fract = (v) => v - floor(v);
const hash = (i) => fract(sin(i * 127.1 + 311.7) * 43758.5453);
const hpK = (e) => (e.maxHp > 0 && e.hp !== undefined ? clamp01(e.hp / e.maxHp) : 1);
const WHITE = [255, 255, 255];
const SHADE = [3, 4, 9];
const MIST = [236, 246, 255];
const SIDES = [-1, 1];
const C1 = [0, 0, 0], C2 = [0, 0, 0], C3 = [0, 0, 0], C4 = [0, 0, 0]; // scratch colours for mixRGB

// ---------------------------------------------------------------- shared helpers (same as t5 / t6)
// additive glow from the cached sprite (alpha a, radius r, ky squashes it vertically)
function glow(ctx, H, rgb, x, y, r, a, hard = 0, ky = 1) {
  if (!(a > 0.004) || r <= 0) return;
  const A = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = A * min(1, a);
  ctx.drawImage(H.glowSprite(rgb, hard), x - r, y - r * ky, r * 2, r * 2 * ky);
  ctx.globalAlpha = A; ctx.globalCompositeOperation = op;
}
// soft smudge (shadow, mist): the same cached sprite drawn normally
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

// Phase integrated over time, so a changing rate (sprinting, falling asleep) never makes a fluke jump. Stateless
// callers (portraits, frozen objects) get exactly t·f.
function phaseOf(e, t, f) {
  if (!Object.isExtensible(e)) return t * f;
  const dt = t - e._t10t;
  if (dt >= 0 && dt < 0.25) e._t10p += dt * f; else e._t10p = t * f;
  e._t10t = t;
  return e._t10p;
}

// ---- body centre line: integrated from the snout backwards (heading PI + travelling wave + steering bend)
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
// cheap tail triangle for LOD silhouettes (adds to the current path)
function tailTri(ctx, tx, ty, ta, L, sp0, notch) {
  ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - sp0) * L, ty + sin(ta - sp0) * L);
  ctx.lineTo(tx + cos(ta) * notch, ty + sin(ta) * notch); ctx.lineTo(tx + cos(ta + sp0) * L, ty + sin(ta + sp0) * L); ctx.closePath();
}
// LOD side fins: a triangle on each flank at u, swept back (adds to the current path)
function lodFins(ctx, u, f, L, sw) {
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j]; sp(u, sd * f); const x = P[0], y = P[1], a = spA(u) + sd * (HPI + sw);
    ctx.moveTo(x, y); ctx.lineTo(x + cos(a) * L, y + sin(a) * L); sp(u + 0.1, sd * f * 0.9); ctx.lineTo(P[0], P[1]); ctx.closePath();
  }
}

// ---- fins, flukes, eyes
// shark caudal fin rooted at the tail, local +x pointing away from the body. nk = notch depth, f = lobe flex
function tailPath(ctx, L, W, r0, f, nk) {
  const cn = nk < 1 ? nk + 0.14 : nk + 0.08;
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L * 0.42, -W * 0.5, L, -W * 0.62 + f);
  ctx.quadraticCurveTo(L * cn, -W * 0.16 + f * 0.6, L * nk, f * 0.5);
  ctx.quadraticCurveTo(L * cn, W * 0.16 + f * 0.6, L, W * 0.62 + f);
  ctx.quadraticCurveTo(L * 0.42, W * 0.5, 0, r0);
  ctx.closePath();
}
// horizontal whale flukes seen from above (adds to the current path), rooted at the tail stock (x, y), local +x
// pointing back along a. span = half-span, ch = chord root → tips, nk = notch position (fraction of the chord),
// lobe = how far the trailing edge bulges back beside the notch, beat = up/down stroke −1..1 (foreshortens the
// chord), sy = squash of the span (the body rolled onto its side)
// local → screen for the small hand-built shapes below (no per-call closures)
let LX0 = 0, LY0 = 0, LCA = 1, LSA = 0;
function lset(x, y, ca, sa) { LX0 = x; LY0 = y; LCA = ca; LSA = sa; }
const lx = (u, v) => LX0 + u * LCA - v * LSA, ly = (u, v) => LY0 + u * LSA + v * LCA;
const lM = (ctx, u, v) => ctx.moveTo(lx(u, v), ly(u, v)), lL = (ctx, u, v) => ctx.lineTo(lx(u, v), ly(u, v));
const lQ = (ctx, u1, v1, u, v) => ctx.quadraticCurveTo(lx(u1, v1), ly(u1, v1), lx(u, v), ly(u, v));
const lC = (ctx, u1, v1, u2, v2, u, v) => ctx.bezierCurveTo(lx(u1, v1), ly(u1, v1), lx(u2, v2), ly(u2, v2), lx(u, v), ly(u, v));
function flukePath(ctx, x, y, a, span, ch, nk, lobe, beat, sy = 1, root = 0.05) {
  const c = ch * (1 - 0.2 * beat * beat), w = span * sy, r0 = root * max(0.3, sy), tb = nk + 0.26 + 0.22 * lobe;
  lset(x, y, cos(a), sin(a));
  lM(ctx, -0.14, -r0);
  // leading edges swept back from the tail stock to pointed tips; trailing edges run in from the tips, bulge into
  // two rounded lobes and meet at the median notch
  lC(ctx, c * 0.08, -r0 - w * 0.12, c * 0.48, -w * 0.78, c * 0.95, -w);
  lQ(ctx, c * 1.06, -w * 1.03, c * 1.0, -w * 0.9);
  lC(ctx, c * 0.84, -w * 0.62, c * tb, -w * 0.3, c * nk, 0);
  lC(ctx, c * tb, w * 0.3, c * 0.84, w * 0.62, c * 1.0, w * 0.9);
  lQ(ctx, c * 1.06, w * 1.03, c * 0.95, w);
  lC(ctx, c * 0.48, w * 0.78, c * 0.08, r0 + w * 0.12, -0.14, r0);
  ctx.closePath();
}
// rounded lobe fin (paddle flipper, broad pectoral) in local space: root at the origin, tip at (L, bow·L). The half
// width is W/2·(1 + tp·(v − 0.5)) with a rounded end beyond v = r0. v0 > 0 builds only the tip beyond v0, its inner
// edge wavy by wav (a mottled tip marking). Starts a fresh path.
function lobeHW(v, W, tp, r0) {
  const e = v > r0 ? sqrt(max(0, 1 - ((v - r0) / (1 - r0)) ** 2)) : 1, root = v < 0.12 ? 0.6 + 0.4 * (v / 0.12) : 1;
  return W * 0.5 * (1 + tp * (v - 0.5)) * e * root;
}
function lobePath(ctx, L, W, bow, tp, r0, v0 = 0, wav = 0) {
  const n = 12; let m = 0;
  for (let i = 0; i <= n; i++) { const v = v0 + (1 - v0) * (i / n), cy = bow * L * v * v, hw = lobeHW(v, W, tp, r0); OX[m] = v * L; OY[m] = cy - hw; m++; }
  for (let i = n - 1; i >= 0; i--) { const v = v0 + (1 - v0) * (i / n), cy = bow * L * v * v, hw = lobeHW(v, W, tp, r0); OX[m] = v * L; OY[m] = cy + hw; m++; }
  if (v0 > 0) { // the inner edge of the tip marking, across the fin
    const cy = bow * L * v0 * v0, hw = lobeHW(v0, W, tp, r0);
    for (let i = 1; i < 4; i++) { const q = i / 4; OX[m] = (v0 + wav * sin(q * 9.4 + v0 * 20)) * L; OY[m] = cy + hw * (1 - 2 * q); m++; }
  }
  smooth(ctx, m);
}
function lobeAt(ctx, x, y, a, side, L, W, bow, tp, r0, v0 = 0, wav = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side); lobePath(ctx, L, W, bow, tp, r0, v0, wav); ctx.restore();
}
// A dorsal fin from its side-on profile: a chain of cubic Béziers [x0,y0, (c1x,c1y, c2x,c2y, x,y)…] with the base
// along x 0 (front) → 1 (rear) and the height along y 0 → 1, mapped onto the base F → R on the back and the height
// vector (hx, hy) (leaning towards −y so it reads from above). thr > 0 builds only the part above height thr (a
// tip marking, its lower edge wavy). Starts a fresh path.
const FPX = new Float32Array(72), FPY = new Float32Array(72);
function profFin(ctx, B, fx, fy, rx, ry, hx, hy, thr = 0) {
  let m = 0;
  const per = 6, ns = (B.length - 2) / 6;
  for (let s = 0; s < ns; s++) {
    const o = s * 6;
    for (let i = s ? 1 : 0; i <= per; i++) {
      const u = i / per, w = 1 - u, a = w * w * w, b = 3 * w * w * u, c = 3 * w * u * u, d = u * u * u;
      FPX[m] = a * B[o] + b * B[o + 2] + c * B[o + 4] + d * B[o + 6]; FPY[m] = a * B[o + 1] + b * B[o + 3] + c * B[o + 5] + d * B[o + 7]; m++;
    }
  }
  const bx = rx - fx, by = ry - fy;
  let q = 0, first = -1, last = -1;
  for (let i = 0; i < m; i++) {
    if (FPY[i] < thr) continue;
    if (first < 0) first = i; last = i;
    OX[q] = fx + bx * FPX[i] + hx * FPY[i]; OY[q] = fy + by * FPX[i] + hy * FPY[i]; q++;
  }
  if (thr > 0 && first >= 0) { // wavy lower edge back across the fin
    for (let i = 1; i < 4; i++) { const v = i / 4, px = FPX[last] + (FPX[first] - FPX[last]) * v, py = thr - 0.06 * sin(v * PI) + 0.04 * sin(v * 11); OX[q] = fx + bx * px + hx * py; OY[q] = fy + by * px + hy * py; q++; }
  }
  if (q > 2) smooth(ctx, q); else ctx.beginPath();
}
const FIN_ROUND = [0, 0, 0.03, 0.5, 0.18, 1.0, 0.46, 1.0, 0.72, 1.0, 0.76, 0.55, 0.84, 0.3, 0.88, 0.16, 0.98, 0.06, 1.12, 0, 0.7, 0, 0.3, 0, 0, 0];
// long pointed flipper blade (blue whale) rooted at (x, y) along a; side mirrors. Starts a fresh path.
function flipper(ctx, x, y, a, side, L, W, bend) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.3, -W * 0.95, L * 0.75, -W * 0.45 + bend * 0.5, L, W * 0.1 + bend);
  ctx.quadraticCurveTo(L * 0.6, W * 0.6 + bend * 0.5, 0, W * 0.5);
  ctx.closePath();
  ctx.restore();
}
function eye(ctx, x, y, r, iris, lwO, pk = 0.64, pupil = '#04060c') {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = iris; ctx.fill();
  ctx.strokeStyle = 'rgba(8,16,26,0.75)'; ctx.lineWidth = lwO; ctx.stroke();
  ctx.beginPath(); ctx.arc(x + r * 0.12, y, r * pk, 0, TAU); ctx.fillStyle = pupil; ctx.fill();
  ctx.beginPath(); ctx.arc(x - r * 0.08, y - r * 0.3, r * 0.28, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
}
// a thin conical tooth from base (bx, by) to tip (tx, ty), half-width bw at the base (adds to the current path)
function tooth(ctx, bx, by, tx, ty, bw) {
  const dx = tx - bx, dy = ty - by, l = Math.hypot(dx, dy) || 1, px = -dy / l * bw, py = dx / l * bw;
  ctx.moveTo(bx + px, by + py); ctx.quadraticCurveTo(bx + dx * 0.55 + px * 0.4, by + dy * 0.55 + py * 0.4, tx, ty); ctx.lineTo(bx - px, by - py);
}
// points on quadratic Béziers → P
function bez2(x0, y0, x1, y1, x2, y2, u) { const w = 1 - u; P[0] = w * w * x0 + 2 * w * u * x1 + u * u * x2; P[1] = w * w * y0 + 2 * w * u * y1 + u * u * y2; return P; }
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
// A whale's blow seen from above: a column of mist rising towards the viewer, drawn leaning along (dx, dy) so its
// height reads on screen. k = 0..1 builds it from a puff at the blowhole to the full plume; hgt = plume length,
// wid = its width, n = puffs.
function spout(ctx, H, x, y, k, t, hgt, wid, n, dx, dy) {
  if (k < 0.01) return;
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  const kk = sstep(k), top = hgt * (0.2 + 0.8 * kk);
  smudge(ctx, H, MIST, x, y, wid * 2.2, wid * 2.2, 0.55 * kk); // mist spreading round the blowhole
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1), d = top * v;
    const wob = 0.3 * wid * v;
    const px = x + dx * d + wob * sin(t * 2.1 + i * 1.7), py = y + dy * d + wob * cos(t * 1.7 + i * 2.3);
    const r = wid * (0.7 + 1.5 * v) * (0.55 + 0.45 * kk) * (1 + 0.12 * sin(t * 3.1 + i * 2.3));
    const a = kk * (1 - 0.45 * v);
    smudge(ctx, H, MIST, px, py, r * 1.5, r * 1.5, a * 0.75);
    if (!H.lod) { const A = ctx.globalAlpha; ctx.globalAlpha = A * a * 0.55; ctx.drawImage(H.glowSprite(MIST, 1), px - r * 0.9, py - r * 0.9, r * 1.8, r * 1.8); ctx.globalAlpha = A; }
  }
  glow(ctx, H, MIST, x + dx * top * 0.5, y + dy * top * 0.5, top * 0.6 + wid, 0.25 * kk);
  if (!H.lod) { // droplets falling out of the plume
    ctx.beginPath();
    for (let i = 0; i < 9; i++) { const v = 0.3 + 0.7 * hash(i + 4), f = fract(t * 0.9 + hash(i + 9)), q = (hash(i + 13) - 0.5) * 2; circ(ctx, x + dx * top * v - dy * q * wid * (1 + f), y + dy * top * v + dx * q * wid * (1 + f), wid * (0.05 + 0.04 * hash(i + 2))); }
    ctx.fillStyle = H.rgbStr(MIST, 0.55 * kk); ctx.fill();
  }
}

// ---- patches on a body that can roll (orca): φ = angle round the body (0 the back, ±π the belly, + towards +y).
// Rolled by rho, a point at φ shows at f = sin(φ − rho) across the outline, and only if cos(φ − rho) > 0.
let RB0 = 0, RB1 = 0;
function rbClip(a, b, rho) {
  let lo = 0, hi = 0, best = 0;
  for (let k = -1; k <= 1; k++) { const l = max(-HPI, a - rho + k * TAU), h = min(HPI, b - rho + k * TAU); if (h - l > best) { best = h - l; lo = l; hi = h; } }
  if (best <= 0) { let m = (a + b) / 2 - rho; m -= TAU * Math.round(m / TAU); RB0 = RB1 = m > 0 ? 1 : -1; return; }
  RB0 = sin(lo); RB1 = sin(hi);
}
const QB = new Float32Array(40);
// the visible part of the band φ ∈ c(u)·side ± h(u) for u in [u0, u1] (fresh path)
function rollBand(ctx, u0, u1, nseg, cfn, hfn, rho, side) {
  let m = 0;
  for (let i = 0; i <= nseg; i++) { const u = u0 + (u1 - u0) * (i / nseg), cc = cfn(u) * side, h = hfn(u); rbClip(cc - h, cc + h, rho); sp(u, RB0); OX[m] = P[0]; OY[m] = P[1]; m++; QB[i] = RB1; }
  for (let i = nseg; i >= 0; i--) { sp(u0 + (u1 - u0) * (i / nseg), QB[i]); OX[m] = P[0]; OY[m] = P[1]; m++; }
  smooth(ctx, m);
}

// =================================================================================================== krill cloud
// Pre-baked swarm: each krill has a radius, angle, angular speed (most mill one way, a few the other), size,
// colour bucket (pink / orange / pale / faint outer fringe) and a thinning rank.
const KR_N = 240;
const KR_R = new Float32Array(KR_N), KR_A = new Float32Array(KR_N), KR_W = new Float32Array(KR_N), KR_Z = new Float32Array(KR_N), KR_L = new Float32Array(KR_N), KR_K = new Float32Array(KR_N);
const KR_B = new Uint8Array(KR_N);
const KX = new Float32Array(KR_N), KY = new Float32Array(KR_N), KTX = new Float32Array(KR_N), KTY = new Float32Array(KR_N);
for (let i = 0; i < KR_N; i++) {
  KR_R[i] = 0.04 + 1.36 * hash(i * 3.17 + 0.71) ** 0.66;
  KR_A[i] = hash(i * 1.73 + 5.3) * TAU;
  KR_W[i] = (hash(i * 0.91 + 91) < 0.14 ? -1 : 1) * (0.3 + 0.45 * hash(i * 2.31 + 17)) / (0.3 + KR_R[i]);
  KR_Z[i] = hash(i * 4.13 + 29) * TAU;
  KR_L[i] = 0.7 + 0.6 * hash(i * 6.7 + 2);
  KR_K[i] = hash(i * 7.9 + 13);
  KR_B[i] = KR_R[i] > 1.1 ? 3 : (hash(i * 5.71 + 3) * 3) | 0;
}
const KR_BLUE = [90, 190, 255];
function drawKrill(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw;
  const dens = 0.3 + 0.7 * hpK(e), st = e.stretch || 0;
  const ex = (1 + 0.05 * sin(t * 0.47)) * (1 + st), ey = (1 - 0.05 * sin(t * 0.47 + 0.8)) * (1 - st * 0.5);
  glow(ctx, H, c.glow, 0, 0, 1.8, 0.38 + 0.3 * dens, 0, ey / ex);
  glow(ctx, H, c.body, 0, 0, 0.9, 0.12 + 0.18 * dens, 0, ey / ex);
  if (H.lod) { glow(ctx, H, c.body, 0, 0, 1.15, 0.45 + 0.3 * dens); return; }
  const nmax = min(KR_N, round(KR_N * min(1, 0.45 + s / 110)));
  for (let i = 0; i < nmax; i++) {
    const a = KR_A[i] + t * KR_W[i], ca = cos(a), sa = sin(a);
    const r = KR_R[i] * (1 + 0.07 * sin(t * 0.9 + KR_Z[i]) + 0.07 * sin(2 * a + t * 0.4) + 0.04 * sin(3 * a - t * 0.31));
    const d = KR_W[i] > 0 ? 1 : -1, tw = 0.5 * sin(t * 1.7 + KR_Z[i] * 3); // heading: along the swirl, darting a little
    KX[i] = ca * r * ex; KY[i] = sa * r * ey;
    const hx = -sa * d, hy = ca * d;
    KTX[i] = hx * cos(tw) - hy * sin(tw); KTY[i] = hx * sin(tw) + hy * cos(tw);
  }
  // the specks: tiny elongated krill bodies, one path per colour
  ctx.lineCap = 'round';
  const base = lw(1.5) + 0.012;
  for (let b = 0; b < 4; b++) {
    ctx.beginPath();
    for (let i = 0; i < nmax; i++) {
      if (KR_B[i] !== b || KR_K[i] > dens) continue;
      const L = 0.026 * KR_L[i];
      ctx.moveTo(KX[i] - KTX[i] * L, KY[i] - KTY[i] * L); ctx.lineTo(KX[i] + KTX[i] * L, KY[i] + KTY[i] * L);
    }
    ctx.strokeStyle = b === 0 ? H.rgbStr(c.body, 0.92) : b === 1 ? H.rgbStr(c.nuc, 0.9) : b === 2 ? H.rgbStr(c.mem, 0.88) : H.rgbStr(c.body, 0.42);
    ctx.lineWidth = b === 3 ? base * 0.8 : base; ctx.stroke();
  }
  if (s > 110) { // close up: the black eye at the head end of each krill
    ctx.beginPath();
    for (let i = 0; i < nmax; i++) { if (KR_B[i] === 3 || KR_K[i] > dens) continue; const L = 0.026 * KR_L[i]; circ(ctx, KX[i] + KTX[i] * L, KY[i] + KTY[i] * L, base * 0.42); }
    ctx.fillStyle = 'rgba(40,12,24,0.85)'; ctx.fill();
  }
  // blue bioluminescent glints winking on and off through the swarm
  const ng = s > 30 ? 10 : 5;
  for (let j = 0; j < ng; j++) {
    const i = (j * 37 + 11) % nmax, f = sin(t * (2.1 + j * 0.37) + j * 2.1);
    if (f < 0.3 || KR_K[i] > dens) continue;
    const a = ((f - 0.3) / 0.7) ** 2;
    glow(ctx, H, KR_BLUE, KX[i], KY[i], 0.1 + 0.08 * a, 0.95 * a, 1);
  }
}

// =================================================================================================== bait ball
// Rings of sardines milling round a centre; inner rings turn faster. Each fish flashes silver when its flank
// catches the light as it turns.
const BB_RINGS = [0.12, 5, 0.24, 9, 0.36, 13, 0.48, 17, 0.6, 21, 0.72, 25, 0.84, 29, 0.95, 31];
const BB_NR = 8, BB_N = 150;
const BB_R = new Float32Array(BB_N), BB_A = new Float32Array(BB_N), BB_W = new Float32Array(BB_N), BB_S = new Float32Array(BB_N), BB_P = new Float32Array(BB_N), BB_K = new Float32Array(BB_N);
const BX = new Float32Array(BB_N), BY = new Float32Array(BB_N), BH = new Float32Array(BB_N), BL = new Uint8Array(BB_N);
{
  let q = 0;
  for (let j = 0; j < BB_NR; j++) {
    const r = BB_RINGS[j * 2], cnt = BB_RINGS[j * 2 + 1];
    for (let i = 0; i < cnt; i++, q++) {
      BB_R[q] = r + (hash(q * 2.1 + 1) - 0.5) * 0.06;
      BB_A[q] = ((i + 0.6 * hash(q * 3.3 + 7)) / cnt) * TAU + j * 0.7;
      BB_W[q] = (0.5 + 0.12 * hash(q * 5.1 + 3)) / (0.4 + r);
      BB_S[q] = 0.85 + 0.3 * hash(q * 7.7 + 2);
      BB_P[q] = hash(q * 9.1 + 5) * TAU;
      BB_K[q] = hash(q * 11.3 + 9);
    }
  }
}
// one little fish at (x, y) heading (ch, sh), length L, half-width hw, tail wag tw (adds to the current path)
function bbFish(ctx, x, y, ch, sh, L, hw, tw, simple) {
  lset(x, y, ch, sh);
  lM(ctx, 0.5 * L, 0);
  lQ(ctx, 0.08 * L, -hw * 1.3, -0.3 * L, -hw * 0.3 + tw * 0.4);
  if (!simple) { lL(ctx, -0.5 * L, -hw * 1.35 + tw); lL(ctx, -0.42 * L, tw); lL(ctx, -0.5 * L, hw * 1.35 + tw); }
  lL(ctx, -0.3 * L, hw * 0.3 + tw * 0.4);
  lQ(ctx, 0.08 * L, hw * 1.3, 0.5 * L, 0);
  ctx.closePath();
}
function drawBaitball(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw;
  const dens = 0.3 + 0.7 * hpK(e), st = e.stretch || 0;
  const ex = (1 + 0.05 * sin(t * 0.7)) * (1 + st * 0.6), ey = (1 - 0.05 * sin(t * 0.7)) * (1 - st * 0.3);
  if (H.lod) {
    ctx.beginPath(); ctx.ellipse(0, 0, ex, ey, 0, 0, TAU); ctx.fillStyle = H.rgbStr(c.body, 0.8); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, ex * 0.5, ey * 0.5, 0, 0, TAU); ctx.fillStyle = H.rgbStr(c.nuc, 0.7); ctx.fill();
    return;
  }
  glow(ctx, H, c.glow, 0, 0, 1.5, 0.26 + 0.14 * dens);
  smudge(ctx, H, c.nuc, 0, 0, 1.0 * ex, 1.0 * ey, 0.5 * dens); // the shoal shades the water
  glow(ctx, H, c.body, 0, 0, 0.8, 0.26 * dens); // and the packed core glints silver
  const la = -2.3 + 0.4 * sin(t * 0.23); // light direction the flanks flash towards
  for (let i = 0; i < BB_N; i++) {
    const a = BB_A[i] + t * BB_W[i], r = BB_R[i] * (1 + 0.04 * sin(t * 1.1 + BB_P[i]));
    BX[i] = cos(a) * r * ex; BY[i] = sin(a) * r * ey;
    const h = a + HPI + 0.14 * sin(t * 1.9 + BB_P[i]);
    BH[i] = h;
    const fl = 0.5 + 0.5 * sin(h - la + 0.7 * sin(t * 0.8 + BB_P[i] * 2)), f2 = 0.5 + 0.5 * sin(2 * h + t * 1.3 + BB_P[i]);
    BL[i] = fl > 0.9 || f2 > 0.97 ? 2 : fl > 0.38 || f2 > 0.7 ? 1 : 0;
  }
  const simple = s < 30, kL = 0.135, kW = 0.024;
  for (let b = 0; b < 3; b++) {
    ctx.beginPath();
    for (let i = 0; i < BB_N; i++) {
      if (BL[i] !== b || BB_K[i] > dens) continue;
      const L = kL * BB_S[i], tw = 0.25 * kW * BB_S[i] * sin(t * 11 + BB_P[i] * 5);
      bbFish(ctx, BX[i], BY[i], cos(BH[i]), sin(BH[i]), L, kW * BB_S[i] + lw(0.35), tw, simple);
    }
    ctx.fillStyle = b === 0 ? H.rgbStr(H.mixRGB(c.body, c.nuc, 0.45, C1), 0.95) : b === 1 ? H.rgbStr(c.body, 0.97) : H.rgbStr(WHITE, 0.98);
    ctx.fill();
  }
  if (s > 60) { // the blue-green back stripe, and eyes close up
    ctx.beginPath();
    for (let i = 0; i < BB_N; i++) {
      if (BL[i] === 2 || BB_K[i] > dens) continue;
      const L = kL * BB_S[i], ch = cos(BH[i]), sh = sin(BH[i]);
      ctx.moveTo(BX[i] + ch * L * 0.36, BY[i] + sh * L * 0.36); ctx.lineTo(BX[i] - ch * L * 0.3, BY[i] - sh * L * 0.3);
    }
    ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, [30, 110, 120], 0.4, C2), 0.7); ctx.lineWidth = lw(1.1); ctx.lineCap = 'round'; ctx.stroke();
    if (s > 110) {
      ctx.beginPath();
      for (let i = 0; i < BB_N; i++) { if (BB_K[i] > dens) continue; const L = kL * BB_S[i], ch = cos(BH[i]), sh = sin(BH[i]); circ(ctx, BX[i] + ch * L * 0.3, BY[i] + sh * L * 0.3, 0.008); }
      ctx.fillStyle = 'rgba(10,20,30,0.8)'; ctx.fill();
    }
  }
  // flashes: a glint on some of the fish turning their flank to the light
  let ng = 0;
  for (let i = BB_N - 1; i >= 0 && ng < (s > 30 ? 7 : 3); i -= 3) { if (BL[i] === 2 && BB_K[i] <= dens) { glow(ctx, H, WHITE, BX[i], BY[i], 0.13, 0.55, 1); ng++; } }
}

// =================================================================================================== coral egg cloud
// Bundles of pink and orange egg-sperm beads drifting up from a mass spawning, each bundle a few beads together.
const EG_N = 90, EG_NB = 30;
const EG_BX = new Float32Array(EG_NB), EG_BY = new Float32Array(EG_NB), EG_BP = new Float32Array(EG_NB);
const EG_X = new Float32Array(EG_N), EG_Y = new Float32Array(EG_N), EG_R = new Float32Array(EG_N), EG_K = new Float32Array(EG_N);
const EG_C = new Uint8Array(EG_N), EG_J = new Uint8Array(EG_N);
const EX = new Float32Array(EG_N), EY = new Float32Array(EG_N);
for (let j = 0; j < EG_NB; j++) { const r = 1.12 * hash(j * 3.7 + 1.1) ** 0.6, a = hash(j * 5.3 + 2.2) * TAU; EG_BX[j] = cos(a) * r; EG_BY[j] = sin(a) * r * 0.92; EG_BP[j] = hash(j * 7.1 + 3.3) * TAU; }
for (let i = 0; i < EG_N; i++) {
  const a = hash(i * 2.9 + 4) * TAU, d = i < EG_NB ? 0 : 0.075 + 0.05 * hash(i * 3.1 + 8);
  EG_J[i] = i % EG_NB; EG_X[i] = cos(a) * d; EG_Y[i] = sin(a) * d;
  EG_R[i] = 0.035 + 0.045 * hash(i * 4.7 + 6) ** 1.4; EG_C[i] = (hash(i * 6.1 + 1) * 3) | 0; EG_K[i] = hash(i * 8.3 + 5);
}
function drawEggs(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw;
  const dens = 0.3 + 0.7 * hpK(e), st = e.stretch || 0;
  glow(ctx, H, c.glow, 0, 0, 1.75, 0.32 + 0.16 * dens);
  if (H.lod) { glow(ctx, H, c.body, 0, 0, 1.1, 0.5 * dens + 0.2); return; }
  const rot = t * 0.07 + 0.12 * sin(t * 0.21), cr = cos(rot), sr = sin(rot), ex = 1 + st * 0.5, br = 1 + 0.03 * sin(t * 0.6);
  for (let i = 0; i < EG_N; i++) {
    const j = EG_J[i], p = EG_BP[j];
    const bx = EG_BX[j] * br + 0.05 * sin(t * 0.5 + p), by = EG_BY[j] * br + 0.05 * cos(t * 0.41 + p * 1.3);
    const sa = t * 0.3 + p, cs = cos(sa), sn = sin(sa);
    const x = bx + EG_X[i] * cs - EG_Y[i] * sn, y = by + EG_X[i] * sn + EG_Y[i] * cs;
    EX[i] = (x * cr - y * sr) * ex; EY[i] = x * sr + y * cr;
  }
  const rmin = lw(1.2);
  for (let b = 0; b < 3; b++) {
    ctx.beginPath();
    for (let i = 0; i < EG_N; i++) if (EG_C[i] === b && EG_K[i] <= dens) circ(ctx, EX[i], EY[i], max(rmin, EG_R[i]));
    ctx.fillStyle = b === 0 ? H.rgbStr(c.body, 0.88) : b === 1 ? H.rgbStr(c.nuc, 0.88) : H.rgbStr(H.mixRGB(c.body, c.mem, 0.45, C1), 0.88);
    ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  if (s > 90) { // close up: the eggs packed inside each bundle
    ctx.beginPath();
    for (let i = 0; i < EG_N; i++) { if (EG_K[i] > dens) continue; const r = EG_R[i]; for (let q = 0; q < 3; q++) { const a = q * 2.1 + i; circ(ctx, EX[i] + cos(a) * r * 0.42, EY[i] + sin(a) * r * 0.42, r * 0.26); } }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, [200, 60, 70], 0.4, C2), 0.4); ctx.fill();
  }
  // glossy highlight on each bead
  ctx.beginPath();
  for (let i = 0; i < EG_N; i++) { if (EG_K[i] > dens) continue; const r = max(rmin, EG_R[i]); circ(ctx, EX[i] - r * 0.32, EY[i] - r * 0.32, r * 0.34); }
  ctx.fillStyle = 'rgba(255,250,245,0.75)'; ctx.fill();
  // a faint glow pulsing through the cloud
  for (let q = 0; q < (s > 30 ? 7 : 3); q++) {
    const i = (q * 19 + 5) % EG_N, f = 0.5 + 0.5 * sin(t * (0.9 + q * 0.23) + q * 1.7);
    if (EG_K[i] <= dens) glow(ctx, H, c.glow, EX[i], EY[i], 0.2, 0.18 + 0.25 * f);
  }
}

// =================================================================================================== orca
// Seen from above it is mostly black: white eye patches at the sides of the head, a grey saddle behind the tall
// dorsal fin, black paddle flippers. flipK rolls it onto its side: the white belly and flank patch swing into
// view, the dorsal fin swings out to −y in profile, the flukes turn edge-on and show their pale undersides.
const ORCA_W = (u) => (u < 0.27 ? 0.355 * sqrt(max(0, 1 - 0.74 * ((0.27 - u) / 0.27) ** 2)) : 0.055 + 0.3 * (1 - ((u - 0.27) / 0.73) ** 1.45));
const ORCA_GREY = [150, 158, 172];
const orcaEyeC = (u) => 1.1 - 0.14 * clamp01((u - 0.1) / 0.17);
const orcaEyeH = (u) => 0.33 * sin(PI * clamp01((u - 0.1) / 0.17)) ** 0.6;
const orcaSadH = (u) => 0.95 * sin(PI * clamp01((u - 0.52) / 0.13)) ** 0.35;
const orcaBelH = (u) => (u > 0.93 ? 0 : (0.95 + 0.95 * exp(-(((u - 0.63) / 0.11) ** 2))) * (u > 0.8 ? 1 - (u - 0.8) / 0.13 : 1) * min(1, u / 0.05 + 0.25));
const fZERO = () => 0, fPI = () => PI;
function orcaFlippers(ctx, H, c, rho, k, t, front) {
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j], q = sd * (HPI + 0.45) - rho, fy = sin(q), fz = cos(q);
    if ((fz > 0) !== front) continue;
    const s2 = fy >= 0 ? 1 : -1, af = abs(fy);
    sp(0.27, 0.78 * fy);
    const ang = spA(0.27) + s2 * (HPI + 0.6 + 0.45 * k + 0.1 * sin(t * 1.2 + sd));
    lobeAt(ctx, P[0], P[1], ang, s2, 0.46 * (0.3 + 0.7 * af), 0.23, 0.14, 0.6, 0.42);
    ctx.fillStyle = H.rgbStr(front ? H.mixRGB(c.body, c.mem, 0.1, C3) : c.body, 0.97); ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = H.lw(1.1); ctx.stroke();
  }
}
// the tall dorsal fin: rooted on the back (which slides to −y as it rolls), its tip leaning further out to −y
function orcaDorsal(ctx, H, c, rho, lean, hf) {
  const fr = -sin(rho);
  sp(0.35, fr); const fx = P[0], fy = P[1];
  sp(0.53, fr); const rx = P[0], ry = P[1];
  sp(0.47, fr);
  const a = spA(0.47), h = hf * sin(min(PI - 0.4, rho + lean)), ca = cos(a), sa = sin(a);
  const tx = P[0] + sa * h - ca * hf * 0.14, ty = P[1] - ca * h - sa * hf * 0.14;
  ctx.beginPath(); ctx.moveTo(fx, fy);
  ctx.quadraticCurveTo((fx + tx) / 2 + ca * 0.06, (fy + ty) / 2 + sa * 0.06, tx, ty);
  ctx.quadraticCurveTo((rx + tx) / 2 + ca * 0.07, (ry + ty) / 2 + sa * 0.07, rx, ry);
  ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.body, 0.99); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = H.lw(1.1); ctx.stroke();
  // the lit face of the blade: a sheen from the leading edge down to the middle of the base
  sp(0.44, fr);
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo((fx + tx) / 2 + ca * 0.06, (fy + ty) / 2 + sa * 0.06, tx, ty); ctx.lineTo(P[0], P[1]); ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.mem, 0.2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo((fx + tx) / 2 + ca * 0.06, (fy + ty) / 2 + sa * 0.06, tx, ty);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = H.lw(1.8); ctx.stroke();
}
function drawOrca(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const codex = e.r === undefined; // the codex portrait shows it banking a little: white belly, fin in profile
  const k = clamp01(e.sprintK || 0), bite = clamp01(e.biteK || 0), fk = sstep(e.flipK || (codex ? 0.3 : 0)), br = clamp01(e.breathK || 0);
  const st = (e.stretch || 0) + 0.05 * k;
  if (codex) ctx.translate(0.2, 0); // centre the body
  if (st) ctx.scale(1 + st * 0.35, 1 - st * 0.25);
  const rho = 1.95 * fk;
  const ph = phaseOf(e, t, 1.7 + 4.5 * k);
  const n = H.lod ? 10 : 28;
  spine(n, 1.12, 2.36, ORCA_W, 0.025 * (1 - k), 3, ph, 3, 0.08 * sin(t * 0.33) * (1 - k) * (1 - fk));
  if (fk > 0) { const ws = 1 + 0.08 * sin(rho); for (let i = 0; i <= n; i++) SW[i] *= ws; }
  const beat = sin(ph) * (0.75 + 0.25 * k), tx = SX[n], ty = SY[n], ta = SA[n];
  const sy = cos(rho), syA = max(0.13, abs(sy));
  if (H.lod) {
    outline(ctx, 0.08); lodFins(ctx, 0.25, 0.8, 0.4, 0.6);
    flukePath(ctx, tx, ty, ta, 0.44, 0.42, 0.5, 0.6, 0, syA, SW[n]);
    ctx.fillStyle = H.cstr(c.body); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
    return;
  }
  smudge(ctx, H, SHADE, -0.15, 0.06, 1.55, 0.7, 0.32);
  if (k > 0.01) streaks(ctx, H, c, t, k, 0.3, 0.13);
  // flukes (the underside is white with black margins: it shows once rolled past edge-on)
  const under = clamp01(-sy * 2.5);
  ctx.beginPath(); flukePath(ctx, tx, ty, ta, 0.44, 0.42, 0.5, 0.6, beat, syA, SW[n]);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.82 * under, C1), 0.97); ctx.fill();
  ctx.strokeStyle = under > 0.05 ? H.rgbStr(c.body, 0.9) : H.rgbStr(c.mem, 0.7); ctx.lineWidth = under > 0.05 ? lw(2.2) : lb(1.1); ctx.stroke();
  orcaFlippers(ctx, H, c, rho, k, t, false);
  const lean = 0.72 * (1 - fk), hf = 0.54;
  if (sy < 0) orcaDorsal(ctx, H, c, rho, lean, hf);
  // biting: the lower jaw swings forward ahead of the snout; pink mouth, big conical teeth
  const g = sstep(bite), cxj = SX[0] - 0.42;
  if (g > 0.01) {
    const d = 0.2 * g, R0 = 0.5, RY = 0.255;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const q = -1.15 + 2.3 * (i / 12); const x = cxj + (R0 + 0.03 + d) * cos(q), y = (RY + 0.03 * g) * sin(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const q = -1.15 + 2.3 * (i / 12); ctx.lineTo(cxj + R0 * cos(q), RY * 0.97 * sin(q)); }
    ctx.closePath(); ctx.fillStyle = 'rgb(126,36,58)'; ctx.fill();
    smudge(ctx, H, [230, 120, 140], cxj + R0 + d * 0.5, 0, 0.1 + 0.1 * g, 0.16, 0.6 * g); // tongue
    ctx.beginPath(); // lower jaw rim: black on top, its white chin just showing round the outside
    for (let i = 0; i <= 12; i++) { const q = -1.15 + 2.3 * (i / 12); const x = cxj + (R0 + 0.11 + d) * cos(q), y = (RY + 0.06 + 0.03 * g) * sin(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const q = -1.15 + 2.3 * (i / 12); ctx.lineTo(cxj + (R0 + 0.03 + d) * cos(q), (RY + 0.03 * g) * sin(q)); }
    ctx.closePath(); ctx.fillStyle = H.rgbStr(c.body, 0.97); ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.9); ctx.lineWidth = lw(1.6); ctx.stroke();
    ctx.beginPath();
    const nt = hd ? 13 : 9;
    for (let i = 0; i < nt; i++) { const q = -1.0 + 2.0 * (i / (nt - 1)); const bx = cxj + (R0 + 0.04 + d) * cos(q), by = (RY + 0.035 + 0.03 * g) * sin(q); tooth(ctx, bx, by, bx - cos(q) * 0.075 * g, by - sin(q) * 0.06 * g, 0.024); }
    ctx.fillStyle = 'rgba(255,252,240,0.98)'; ctx.fill();
  }
  // body: glossy black
  outline(ctx, 0.08);
  ctx.fillStyle = H.rgbStr(c.body, 0.97); ctx.fill();
  gfill(ctx, H, H.mixRGB(c.body, c.mem, 0.28, C2), 0.85, 0.0, 0, 1.25, 0.36);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.72); ctx.lineWidth = lb(1.4); ctx.stroke();
  // white: the belly and flank patch (only slivers from above), the eye patches; the grey saddle
  const white = H.rgbStr(c.nuc, 0.97);
  rollBand(ctx, 0.02, 0.95, 18, fPI, orcaBelH, rho, 1); ctx.fillStyle = white; ctx.fill();
  for (let j = 0; j < 2; j++) { rollBand(ctx, 0.1, 0.27, 8, orcaEyeC, orcaEyeH, rho, SIDES[j]); ctx.fillStyle = white; ctx.fill(); }
  rollBand(ctx, 0.52, 0.65, 8, fZERO, orcaSadH, rho, 1); ctx.fillStyle = H.rgbStr(ORCA_GREY, 0.55); ctx.fill();
  if (hd) { // boss-pod detail: pale tooth rakes on the flanks, a soft sheen down the back
    ctx.beginPath();
    for (let i = 0; i < 9; i++) { const u = 0.4 + 0.045 * i + 0.02 * hash(i), f = (i & 1 ? 1 : -1) * (0.35 + 0.3 * hash(i + 5)); for (let q = 0; q < 3; q++) { sp(u + q * 0.012, f - 0.06); ctx.moveTo(P[0], P[1]); sp(u + q * 0.012 + 0.03, f + 0.08); ctx.lineTo(P[0], P[1]); } }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.22); ctx.lineWidth = lw(1); ctx.stroke();
    outline(ctx, 0.04, 0.3, 2, n - 6); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
  }
  // blowhole (a crescent on top of the head) and the small eyes in front of the patches
  const vb = cos(rho);
  sp(0.205, -sin(rho)); const bhx = P[0], bhy = P[1];
  if (vb > 0.1) {
    ctx.beginPath(); ctx.arc(bhx + 0.035, bhy, 0.045, PI - 0.9, PI + 0.9);
    ctx.strokeStyle = `rgba(0,0,0,${(0.85 * vb).toFixed(3)})`; ctx.lineWidth = lw(2); ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.4 * vb); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j], q = sd * 1.42 - rho, v = cos(q);
    if (v < 0.15) continue;
    sp(0.11, sin(q) * 0.97);
    ctx.beginPath(); ctx.ellipse(P[0], P[1], 0.03, 0.022 * (0.4 + 0.6 * v), spA(0.11), 0, TAU); ctx.fillStyle = 'rgb(6,8,12)'; ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(0.8); ctx.stroke();
    ctx.beginPath(); ctx.arc(P[0] + 0.006, P[1] - 0.006, 0.008, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  orcaFlippers(ctx, H, c, rho, k, t, true);
  if (sy >= 0) orcaDorsal(ctx, H, c, rho, lean, hf);
  if (g > 0.1) { // upper teeth peeking out of the snout as it bites
    ctx.beginPath();
    const nt = hd ? 11 : 7;
    for (let i = 0; i < nt; i++) { const q = -0.95 + 1.9 * (i / (nt - 1)), bx = cxj + 0.48 * cos(q), by = 0.245 * sin(q); tooth(ctx, bx - cos(q) * 0.02, by - sin(q) * 0.02, bx + cos(q) * 0.07 * g, by + sin(q) * 0.05 * g, 0.022); }
    ctx.fillStyle = 'rgba(255,252,240,0.98)'; ctx.fill();
  }
  shine(ctx, H, e, 0.3, 0.7);
  spout(ctx, H, bhx, bhy, br, t, 1.0, 0.17, 7, -0.55, -0.85);
}

// =================================================================================================== oceanic whitetip
// Stocky bronze-grey shark with a blunt rounded snout, huge rounded paddle pectorals and a big rounded first
// dorsal, every fin tipped mottled bright white. Pilot fish ride its bow wave in close-ups.
const WT_W = (u) => (u < 0.22 ? 0.315 * sqrt(max(0, 1 - 0.78 * ((0.22 - u) / 0.22) ** 2)) : 0.058 + 0.257 * (1 - ((u - 0.22) / 0.78) ** 1.3));
const PILOT = [196, 206, 220];
// a white mottled tip on the lobe fin: soft fringe, then solid
function whiteTip(ctx, H, c, x, y, a, side, L, W, bow, tp, r0, v0) {
  lobeAt(ctx, x, y, a, side, L, W, bow, tp, r0, v0 - 0.07, 0.025); ctx.fillStyle = H.rgbStr(c.nuc, 0.35); ctx.fill();
  lobeAt(ctx, x, y, a, side, L, W, bow, tp, r0, v0, 0.03); ctx.fillStyle = H.rgbStr(c.nuc, 0.97); ctx.fill();
}
function drawWhitetip(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = clamp01(e.sprintK || 0), bite = clamp01(e.biteK || 0), st = (e.stretch || 0) + 0.06 * k;
  if (e.r === undefined) ctx.translate(0.1, 0);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.35);
  const ph = phaseOf(e, t, 3.2 + 6 * k);
  const n = H.lod ? 10 : 26;
  spine(n, 1.04, 2.25, WT_W, 0.14 * (1 - 0.8 * k) * (1 - 0.5 * bite), 4, ph, 2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.08 * sin(ph - 5) * (1 - 0.6 * k);
  if (H.lod) {
    outline(ctx, 0.1); lodFins(ctx, 0.25, 0.85, 0.75, 0.4); tailTri(ctx, tx, ty, ta, 0.55, 0.6, 0.25);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  if (k > 0.01) { streaks(ctx, H, c, t, k, 0.5, 0.13); glow(ctx, H, c.glow, -0.2, 0, 1.4, 0.16 * k, 0, 0.35); }
  smudge(ctx, H, SHADE, -0.05, 0.05, 1.4, 0.8, 0.25);
  const finF = H.rgbStr(c.body, 0.94), finE = H.rgbStr(c.mem, 0.7), tipW = H.rgbStr(c.nuc, 0.97);
  // caudal fin, white tips on both lobes
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  {
    const L = 0.58, W = 0.78, r0 = 0.05, nk = 0.48, cn = nk + 0.14;
    tailPath(ctx, L, W, r0, flex, nk); ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
    ctx.beginPath();
    for (let j = 0; j < 2; j++) {
      const sd = SIDES[j];
      for (let i = 0; i <= 4; i++) { bez2(0, sd * r0, L * 0.42, sd * W * 0.5, L, sd * W * 0.62 + flex, 0.7 + 0.3 * (i / 4)); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
      for (let i = 1; i <= 3; i++) { bez2(L, sd * W * 0.62 + flex, L * cn, sd * W * 0.16 + flex * 0.6, L * nk, flex * 0.5, 0.32 * (i / 3)); ctx.lineTo(P[0], P[1]); }
      ctx.closePath();
    }
    ctx.fillStyle = tipW; ctx.fill();
  }
  ctx.restore();
  // pelvic fins
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j]; sp(0.64, sd * 0.8); const x = P[0], y = P[1], a = spA(0.64) + sd * (HPI + 0.85);
    lobeAt(ctx, x, y, a, sd, 0.2, 0.12, 0.15, -0.3, 0.55); ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
    lobeAt(ctx, x, y, a, sd, 0.2, 0.12, 0.15, -0.3, 0.55, 0.68, 0.02); ctx.fillStyle = tipW; ctx.fill();
  }
  // the huge rounded pectorals, held out like wings (swept back in a sprint)
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j], flap = 0.07 * sin(t * 1.6 + sd) * (1 - k);
    sp(0.25, sd * 0.85); const x = P[0], y = P[1], a = spA(0.25) + sd * (HPI + 0.38 + 0.4 * k + flap), L = 0.92 * (1 - 0.08 * k);
    lobeAt(ctx, x, y, a, sd, L, 0.36, 0.2, -0.42, 0.58); ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
    whiteTip(ctx, H, c, x, y, a, sd, L, 0.36, 0.2, -0.42, 0.58, 0.76);
    lobeAt(ctx, x, y, a, sd, L, 0.36, 0.2, -0.42, 0.58);
    ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  // jaws (biting): the lower jaw swings forward ahead of the snout, a dark gape with serrated teeth between
  const g = sstep(bite), cxj = 0.58;
  if (g > 0.01) {
    const d = 0.22 * g;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const q = -1.15 + 2.3 * (i / 12); const x = cxj + (0.53 + d) * cos(q), y = (0.3 + 0.03 * g) * sin(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const q = -1.15 + 2.3 * (i / 12); ctx.lineTo(cxj + 0.5 * cos(q), 0.28 * sin(q)); }
    ctx.closePath(); ctx.fillStyle = 'rgb(58,16,24)'; ctx.fill();
    smudge(ctx, H, [120, 30, 44], cxj + 0.55 + d * 0.4, 0, 0.12 + 0.12 * g, 0.2, 0.5 * g);
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) { const q = -1.15 + 2.3 * (i / 12); const x = cxj + (0.6 + d) * cos(q), y = (0.32 + 0.03 * g) * sin(q); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 12; i >= 0; i--) { const q = -1.15 + 2.3 * (i / 12); ctx.lineTo(cxj + (0.53 + d) * cos(q), (0.3 + 0.03 * g) * sin(q)); }
    ctx.closePath(); ctx.fillStyle = H.rgbStr(c.mem, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    const nt = hd ? 13 : 8;
    for (let i = 0; i < nt; i++) { const q = -1.0 + 2.0 * (i / (nt - 1)); const bx = cxj + (0.53 + d) * cos(q), by = (0.3 + 0.03 * g) * sin(q); tooth(ctx, bx, by, bx - cos(q) * 0.07 * g, by - sin(q) * 0.06 * g, 0.018); }
    ctx.fillStyle = 'rgba(255,255,250,0.98)'; ctx.fill();
  }
  // body: bronze-grey back, paler flanks
  outline(ctx, 0.1);
  ctx.fillStyle = H.rgbStr(c.body, 0.84); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 1.2, 0.34);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.88); ctx.lineWidth = lb(1.4); ctx.stroke();
  outline(ctx, 0.05, 0.55, 1, n - 2); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, [70, 54, 30], 0.35, C1), 0.38); ctx.fill();
  // gill slits
  ctx.beginPath();
  for (let j = 0; j < 2; j++) { const sd = SIDES[j]; for (let i = 0; i < 5; i++) { sp(0.16 + i * 0.022, sd * 0.98); ctx.moveTo(P[0], P[1]); sp(0.16 + i * 0.022 - 0.008, sd * 0.72); ctx.lineTo(P[0], P[1]); } }
  ctx.strokeStyle = 'rgba(40,30,20,0.42)'; ctx.lineWidth = lw(1); ctx.stroke();
  if (g > 0.1) {
    ctx.beginPath();
    const nt = hd ? 11 : 7;
    for (let i = 0; i < nt; i++) { const q = -0.95 + 1.9 * (i / (nt - 1)), bx = cxj + 0.49 * cos(q), by = 0.27 * sin(q); tooth(ctx, bx - cos(q) * 0.02, by - sin(q) * 0.02, bx + cos(q) * 0.07 * g, by + sin(q) * 0.05 * g, 0.018); }
    ctx.fillStyle = 'rgba(255,255,250,0.98)'; ctx.fill();
  }
  // the big rounded first dorsal (leaning to −y so its height shows), white-tipped; a small plain second dorsal
  {
    sp(0.33, 0); const fx = P[0], fy = P[1]; sp(0.5, 0); const rx = P[0], ry = P[1];
    const a = spA(0.42), h = 0.46, hx = sin(a) * h - cos(a) * h * 0.22, hy = -cos(a) * h - sin(a) * h * 0.22;
    profFin(ctx, FIN_ROUND, fx, fy, rx, ry, hx, hy); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, [60, 50, 34], 0.18, C2), 0.97); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1.1); ctx.stroke();
    profFin(ctx, FIN_ROUND, fx, fy, rx, ry, hx, hy, 0.64); ctx.fillStyle = H.rgbStr(c.nuc, 0.35); ctx.fill();
    profFin(ctx, FIN_ROUND, fx, fy, rx, ry, hx, hy, 0.74); ctx.fillStyle = tipW; ctx.fill();
    sp(0.74, 0); const cx0 = P[0], cy0 = P[1]; sp(0.8, 0);
    ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(cx0 - 0.04, cy0 - 0.06, P[0] - 0.02, P[1] - 0.05); ctx.lineTo(P[0], P[1]); ctx.closePath();
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  // nostrils and small round eyes (they roll white as it bites)
  ctx.beginPath(); for (let j = 0; j < 2; j++) { const sd = SIDES[j]; ctx.moveTo(1.06, sd * 0.08); ctx.lineTo(1.0, sd * 0.13); }
  ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  for (let j = 0; j < 2; j++) {
    sp(0.1, SIDES[j] * 0.84); const x = P[0], y = P[1];
    ctx.beginPath(); ctx.arc(x, y, 0.045, 0, TAU); ctx.fillStyle = 'rgb(30,26,22)'; ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = lw(0.9); ctx.stroke();
    if (g > 0.01) { ctx.beginPath(); ctx.arc(x, y, 0.047, 0, TAU); ctx.fillStyle = `rgba(236,240,244,${(0.9 * g).toFixed(3)})`; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x - 0.013, y - 0.013, 0.012, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  shine(ctx, H, e, 0.35, 0.6);
  if (s > 90 && bite < 0.3) { // pilot fish riding the bow wave: little black-and-white striped fish
    ctx.beginPath();
    for (let j = 0; j < 2; j++) {
      const sd = SIDES[j], x = SX[0] + 0.3 + 0.04 * sin(t * 1.3 + sd), y = sd * (0.3 + 0.03 * sin(t * 0.9 + sd * 2)), w = 0.03 * sin(t * 9 + sd);
      bbFish(ctx, x, y, 1, 0, 0.22, 0.04, w, false);
    }
    ctx.fillStyle = H.rgbStr(PILOT, 0.95); ctx.fill(); ctx.strokeStyle = 'rgba(20,24,34,0.7)'; ctx.lineWidth = lw(0.8); ctx.stroke();
    ctx.beginPath();
    for (let j = 0; j < 2; j++) { const sd = SIDES[j], x = SX[0] + 0.3 + 0.04 * sin(t * 1.3 + sd), y = sd * (0.3 + 0.03 * sin(t * 0.9 + sd * 2)); for (let q = 0; q < 4; q++) { const bx = x + 0.06 - q * 0.042; ctx.moveTo(bx, y - 0.04 * (1 - q * 0.18)); ctx.lineTo(bx - 0.006, y + 0.04 * (1 - q * 0.18)); } }
    ctx.strokeStyle = 'rgba(24,28,40,0.9)'; ctx.lineWidth = 0.018; ctx.stroke();
  }
}

// =================================================================================================== blue whale
// The longest animal ever: a very long slender mottled blue-grey body (snout x ≈ +3, fluke tips x ≈ −3.2), a
// broad flat U-shaped head with a single median ridge running to the splash guard in front of the twin
// blowholes, long thin flippers, a tiny dorsal fin far back and wide flukes. Slow, majestic beats.
const BW_W = (u) => (u < 0.3 ? 0.45 * (1 - 0.35 * (1 - u / 0.3) ** 2.4) : 0.06 + 0.39 * (1 - ((u - 0.3) / 0.7) ** 1.45));
const BW_NM = 260;
const BW_MU = new Float32Array(BW_NM), BW_MF = new Float32Array(BW_NM), BW_MR = new Float32Array(BW_NM), BW_MS = new Uint8Array(BW_NM);
for (let i = 0; i < BW_NM; i++) { BW_MU[i] = 0.17 + 0.8 * hash(i * 1.37 + 0.3) ** 0.85; BW_MF[i] = (hash(i * 2.71 + 4.1) * 2 - 1) * 0.88; BW_MR[i] = 0.012 + 0.026 * hash(i * 3.9 + 7.7) ** 1.5; BW_MS[i] = hash(i * 5.3 + 1.9) < 0.6 ? 0 : 1; }
function drawBlue(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const br = clamp01(e.breathK || 0), st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.2, 1 - st * 0.15);
  const ph = phaseOf(e, t, 0.8 * (1 + st * 2));
  const n = H.lod ? 14 : 44;
  spine(n, 2.9, 5.5, BW_W, 0.02, 2.5, ph, 3, 0.06 * sin(t * 0.21));
  const tx = SX[n], ty = SY[n], ta = SA[n], beat = sin(ph);
  if (H.lod) {
    outline(ctx, 0.17); lodFins(ctx, 0.27, 0.85, 0.8, 0.9);
    flukePath(ctx, tx, ty, ta, 0.76, 0.62, 0.48, 0.3, 0, 1, SW[n]);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  smudge(ctx, H, SHADE, -0.2, 0.1, 3.6, 1.0, 0.3);
  const finF = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.15, C1), 0.95), finE = H.rgbStr(c.mem, 0.65);
  ctx.beginPath(); flukePath(ctx, tx, ty, ta, 0.76, 0.62, 0.48, 0.3, beat, 1, SW[n]);
  ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.3); ctx.stroke();
  // long slender flippers, slowly sculling
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j]; sp(0.285, sd * 0.86);
    flipper(ctx, P[0], P[1], spA(0.285) + sd * (HPI + 0.92 + 0.08 * sin(t * 0.7 + sd)), sd, 0.88, 0.13, 0.02 * sin(t * 0.7 + sd));
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
  }
  // body
  outline(ctx, 0.17);
  ctx.fillStyle = H.rgbStr(c.body, 0.94); ctx.fill();
  gfill(ctx, H, c.body, 1, -0.1, 0, 3.15, 0.5);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.8); ctx.lineWidth = lb(1.5); ctx.stroke();
  outline(ctx, 0.04, 0.5, 3, n - 3); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.45, C2), 0.3); ctx.fill();
  // mottling: pale and dark blotches stretched along the body, densest behind the head
  {
    const nm = hd ? BW_NM : s > 60 ? 180 : 90;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let i = 0; i < nm; i++) {
        if (BW_MS[i] !== pass) continue;
        const u = BW_MU[i]; sp(u, BW_MF[i]); const r = max(lw(0.9), BW_MR[i] * (0.6 + 0.6 * spW(u) / 0.45)), a = spA(u);
        ctx.moveTo(P[0] + cos(a) * r * 1.6, P[1] + sin(a) * r * 1.6); ctx.ellipse(P[0], P[1], r * 1.6, r, a, 0, TAU);
      }
      ctx.fillStyle = pass ? H.rgbStr(c.nuc, 0.32) : H.rgbStr(c.mem, 0.3); ctx.fill();
    }
  }
  // head: median rostral ridge, the splash guard (a raised horseshoe) and the twin blowholes behind it
  {
    ctx.beginPath(); sp(0.012, 0); ctx.moveTo(P[0], P[1]); for (let i = 1; i <= 4; i++) { sp(0.012 + i * 0.03, 0); ctx.lineTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
    ctx.beginPath(); sp(0.195, -0.34); ctx.moveTo(P[0], P[1]);
    sp(0.122, -0.34); const ax = P[0], ay = P[1]; sp(0.122, 0.34); const bx = P[0], by = P[1]; sp(0.195, 0.34); ctx.bezierCurveTo(ax, ay, bx, by, P[0], P[1]);
    sp(0.195, 0.19); ctx.lineTo(P[0], P[1]);
    sp(0.152, 0.19); const cx1 = P[0], cy1 = P[1]; sp(0.152, -0.19); const cx2 = P[0], cy2 = P[1]; sp(0.195, -0.19); ctx.bezierCurveTo(cx1, cy1, cx2, cy2, P[0], P[1]);
    ctx.closePath(); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.3, C3), 0.55); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.55); ctx.lineWidth = lw(1.1); ctx.stroke();
    for (let j = 0; j < 2; j++) {
      const sd = SIDES[j]; sp(0.188, sd * 0.09); const x = P[0], y = P[1], a = spA(0.188) - sd * 0.32;
      ctx.beginPath(); ctx.ellipse(x, y, 0.07, 0.018, a, 0, TAU); ctx.fillStyle = 'rgb(16,24,38)'; ctx.fill();
      ctx.strokeStyle = H.rgbStr(c.mem, 0.45); ctx.lineWidth = lw(0.9); ctx.stroke();
    }
    // mouth line along the sides of the head, the small eyes at its corners
    ctx.beginPath();
    for (let j = 0; j < 2; j++) { const sd = SIDES[j]; sp(0.015, sd * 0.86); ctx.moveTo(P[0], P[1]); sp(0.1, sd * 0.95); const qx = P[0], qy = P[1]; sp(0.21, sd * 0.94); ctx.quadraticCurveTo(qx, qy, P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.45); ctx.lineWidth = lw(1.2); ctx.stroke();
    for (let j = 0; j < 2; j++) {
      sp(0.215, SIDES[j] * 0.95);
      ctx.beginPath(); ctx.ellipse(P[0], P[1], 0.04, 0.026, spA(0.215), 0, TAU); ctx.fillStyle = 'rgb(10,14,22)'; ctx.fill();
      ctx.beginPath(); ctx.arc(P[0] - 0.01, P[1] - 0.008, 0.01, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    }
  }
  if (hd) { // a long sheen down the back and the keel of the tail stock
    outline(ctx, 0.04, 0.22, 4, n - 8); ctx.fillStyle = 'rgba(230,245,255,0.08)'; ctx.fill();
    ctx.beginPath(); sp(0.84, 0); ctx.moveTo(P[0], P[1]); for (let i = 1; i <= 6; i++) { sp(0.84 + i * 0.026, 0); ctx.lineTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.3); ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  // the tiny dorsal fin, far back
  {
    sp(0.75, 0); const fx = P[0], fy = P[1]; sp(0.815, 0); const rx = P[0], ry = P[1];
    const a = spA(0.79), hx = rx - cos(a) * 0.08 + sin(a) * 0.17, hy = ry - sin(a) * 0.08 - cos(a) * 0.17;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo((fx + hx) / 2 + cos(a) * 0.03, (fy + hy) / 2 + sin(a) * 0.03, hx, hy); ctx.quadraticCurveTo((rx + hx) / 2 + cos(a) * 0.04, (ry + hy) / 2 + sin(a) * 0.04, rx, ry); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.4, C4), 0.97); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo((fx + hx) / 2 + cos(a) * 0.03, (fy + hy) / 2 + sin(a) * 0.03, hx, hy);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lw(1.4); ctx.stroke();
  }
  shine(ctx, H, e, 1.4, 1.1); shine(ctx, H, e, -0.6, 0.8);
  sp(0.18, 0);
  spout(ctx, H, P[0] - 0.02, P[1], br, t, 2.3, 0.26, 10, -0.4, -0.9);
}

// =================================================================================================== sperm whale (boss)
// A huge box-shaped head (a third of its length) as wide as the body, the single S-shaped blowhole at its front
// left, wrinkled prune-like skin behind, small paddle flippers, a low hump then a row of knuckles instead of a
// dorsal fin, broad triangular flukes. The narrow toothed lower jaw hides under the head until it bites.
const SPW_W = (u) => {
  const hw = 0.33 + 0.095 * sstep(u / 0.07), bw = 0.085 + 0.35 * (1 - clamp01((u - 0.45) / 0.55) ** 1.5), m = sstep((u - 0.32) / 0.1);
  return hw + (bw - hw) * m - 0.035 * exp(-(((u - 0.385) / 0.035) ** 2));
};
const SW_HEAD = 0.36, CLICK = [170, 236, 255], BUBBLE = [230, 248, 255];
const SC_RINGS = 18;
function drawSperm(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const click = clamp01(e.clickK || 0), sl = sstep(e.sleepK || 0), bite = clamp01(e.biteK || 0), g = sstep(bite);
  const st = (e.stretch || 0) * (1 - sl);
  if (e.r === undefined) ctx.translate(0.5, 0); // codex: centre the body
  if (st) ctx.scale(1 + st * 0.25, 1 - st * 0.18);
  const ph = phaseOf(e, t, 0.9 * (1 - 0.97 * sl) * (1 + st * 2));
  const n = H.lod ? 12 : 40;
  spine(n, 1.24, 3.0, SPW_W, 0.025 * (1 - sl), 2.6, ph, 3, 0.07 * sin(t * 0.27) * (1 - sl));
  const tx = SX[n], ty = SY[n], ta = SA[n], beat = sin(ph) * (1 - sl);
  if (H.lod) {
    outline(ctx, 0.03); flukePath(ctx, tx, ty, ta, 0.68, 0.56, 0.52, 0.12, 0, 1, SW[n]);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  smudge(ctx, H, SHADE, -0.3, 0.08, 2.1, 0.85, 0.32);
  if (sl > 0.01) { // logging at the surface: slow ripples spreading round the resting body
    for (let i = 0; i < 2; i++) {
      const f = fract(t * 0.2 + i * 0.5);
      outline(ctx, 0.12 + 0.45 * f, 1.18 + 0.7 * f, 0, n - 3);
      ctx.strokeStyle = H.rgbStr(MIST, 0.16 * sl * (1 - f) * min(1, f * 5)); ctx.lineWidth = lw(3); ctx.stroke();
    }
  }
  const finF = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.2, C1), 0.96), finE = H.rgbStr(c.mem, 0.6);
  ctx.beginPath(); flukePath(ctx, tx, ty, ta, 0.68, 0.56, 0.52, 0.12, beat, 1, SW[n]);
  ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.3); ctx.stroke();
  if (hd) { // a few nicks out of the trailing edge
    ctx.beginPath(); for (let i = 0; i < 3; i++) { const sd = i & 1 ? 1 : -1, q = 0.3 + 0.22 * i, d = 0.56 * (0.6 + 0.4 * q); circ(ctx, tx + cos(ta) * d - sin(ta) * sd * 0.62 * q, ty + sin(ta) * d + cos(ta) * sd * 0.62 * q, 0.022); }
    ctx.fillStyle = 'rgba(10,20,40,0.6)'; ctx.fill();
  }
  // small paddle flippers
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j]; sp(0.41, sd * 0.86);
    lobeAt(ctx, P[0], P[1], spA(0.41) + sd * (HPI + 0.55 + 0.12 * sin(t * 0.8 + sd) * (1 - sl)), sd, 0.3, 0.15, 0.12, 0.3, 0.45);
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1.1); ctx.stroke();
  }
  // biting: the long narrow lower jaw swings down and out from under the head, lined with conical teeth
  if (g > 0.01) {
    const x0 = SX[0] + 0.03, xh = x0 - 1.05, xt = x0 - 0.3 + 0.85 * g, jw = (x) => 0.07 + 0.07 * clamp01((xt - x) / 0.9);
    // the dark gape opening under the front of the head
    smudge(ctx, H, [24, 6, 14], x0 + 0.1 * g, 0, 0.3 + 0.25 * g, 0.34, 0.8 * g);
    ctx.beginPath(); ctx.ellipse(x0 - 0.06, 0, 0.06 + 0.16 * g, 0.24, 0, -HPI, HPI); ctx.closePath(); ctx.fillStyle = 'rgb(46,16,26)'; ctx.fill();
    // the lower jaw: long and narrow, white-lipped, a pink groove down the middle
    ctx.beginPath(); ctx.moveTo(xh, -jw(xh));
    for (let i = 1; i <= 6; i++) { const x = xh + (xt - 0.06 - xh) * (i / 6); ctx.lineTo(x, -jw(x)); }
    ctx.quadraticCurveTo(xt + 0.07, -0.06, xt + 0.07, 0); ctx.quadraticCurveTo(xt + 0.07, 0.06, xt - 0.06, jw(xt - 0.06));
    for (let i = 5; i >= 0; i--) { const x = xh + (xt - 0.06 - xh) * (i / 6); ctx.lineTo(x, jw(x)); }
    ctx.closePath();
    ctx.fillStyle = 'rgb(238,226,222)'; ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.85); ctx.lineWidth = lb(1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(xh, 0); ctx.lineTo(xt - 0.04, 0); ctx.strokeStyle = 'rgba(214,140,156,0.75)'; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.stroke();
    // two rows of big conical teeth
    ctx.beginPath();
    for (let x = xt - 0.05; x > max(xh, x0 - 0.25); x -= 0.07) { const w = jw(x) * 0.8; for (let j = 0; j < 2; j++) { const sd = SIDES[j]; tooth(ctx, x - 0.012, sd * w, x + 0.025, sd * (w + 0.075 * g), 0.022); } }
    ctx.fillStyle = 'rgb(252,246,228)'; ctx.fill(); ctx.strokeStyle = 'rgba(70,56,44,0.75)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  // body
  outline(ctx, 0.03);
  ctx.fillStyle = H.rgbStr(c.body, 0.95); ctx.fill();
  gfill(ctx, H, c.body, 1, -0.3, 0, 1.9, 0.48);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.72); ctx.lineWidth = lb(1.5); ctx.stroke();
  const ih = round(SW_HEAD * n);
  outline(ctx, 0.0, 0.48, ih, n - 2); ctx.fillStyle = H.rgbStr(c.nuc, 0.25); ctx.fill();
  // the smooth box head, a little paler, its front (the junk) lighter still
  outline(ctx, 0.03, 0.9, 0, ih); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.14, C2), 0.4); ctx.fill();
  smudge(ctx, H, c.mem, SX[0] - 0.12, 0, 0.32, 0.4, 0.12);
  ctx.beginPath(); sp(0.39, -0.95); ctx.moveTo(P[0], P[1]); sp(0.355, 0); const qx = P[0], qy = P[1]; sp(0.39, 0.95); ctx.quadraticCurveTo(qx, qy, P[0], P[1]);
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.45); ctx.lineWidth = lw(1.4); ctx.stroke();
  // wrinkled, prune-like skin from behind the head to the tail stock
  {
    const nw = hd ? 30 : s > 60 ? 16 : 9;
    ctx.beginPath();
    for (let i = 0; i < nw; i++) {
      const u = 0.42 + ((i + 0.5) / nw) * 0.54;
      const amp = 0.17 / nw, f0 = -0.9 + 0.12 * hash(i + 21), f1 = 0.9 - 0.12 * hash(i + 23);
      for (let j = 0; j <= 8; j++) { const f = f0 + (f1 - f0) * (j / 8); sp(u + amp * sin(j * 1.9 + i * 2.3), f); j ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.34); ctx.lineWidth = lw(1.1); ctx.stroke();
    if (hd) {
      ctx.beginPath();
      for (let i = 0; i < 60; i++) { const u = 0.42 + 0.54 * hash(i * 1.3 + 2), f = (hash(i * 2.9 + 1) * 2 - 1) * 0.85; sp(u, f); const x = P[0], y = P[1]; sp(u + 0.035, f + 0.04 * sin(i)); ctx.moveTo(x, y); ctx.lineTo(P[0], P[1]); }
      ctx.strokeStyle = H.rgbStr(c.mem, 0.12); ctx.lineWidth = lw(1); ctx.stroke();
    }
  }
  // the low hump, then a row of knuckles running back along the spine
  {
    sp(0.645, 0); const a = spA(0.645);
    smudge(ctx, H, SHADE, P[0] - cos(a) * 0.1, P[1] - sin(a) * 0.1, 0.2, 0.12, 0.45);
    ctx.beginPath(); lset(P[0], P[1], cos(a), sin(a)); lM(ctx, 0.19, 0); lQ(ctx, 0.05, -0.085, -0.1, -0.05); lQ(ctx, -0.15, 0, -0.1, 0.05); lQ(ctx, 0.05, 0.085, 0.19, 0); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.2, C3), 0.9); ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.4); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let j = 0; j < 6; j++) { const u = 0.73 + j * 0.04; sp(u, 0); const r = 0.04 * (1 - j * 0.12); ctx.moveTo(P[0] + r * 1.2, P[1]); ctx.ellipse(P[0], P[1], r * 1.2, r * 0.75, spA(u), 0, TAU); }
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.16, C3), 0.85); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
  }
  // pale scars on the head: scratches and, close up, the round sucker marks of giant squid
  {
    ctx.beginPath();
    const ns = hd ? 9 : 5;
    for (let i = 0; i < ns; i++) { const u0 = 0.04 + 0.28 * hash(i * 3.3 + 1), f0 = (hash(i * 1.9 + 7) * 2 - 1) * 0.75; sp(u0, f0); ctx.moveTo(P[0], P[1]); sp(u0 + 0.05 + 0.04 * hash(i), f0 + (hash(i + 3) - 0.5) * 0.5); const mx = P[0], my = P[1]; sp(u0 + 0.1 + 0.05 * hash(i + 1), f0 + (hash(i + 4) - 0.5) * 0.6); ctx.quadraticCurveTo(mx, my, P[0], P[1]); }
    ctx.strokeStyle = 'rgba(232,228,222,0.34)'; ctx.lineWidth = lw(1.1); ctx.stroke();
    if (hd) {
      ctx.beginPath();
      for (let i = 0; i < SC_RINGS; i++) { const u = 0.03 + 0.3 * hash(i * 4.1 + 3), f = (hash(i * 2.3 + 9) * 2 - 1) * 0.8; sp(u, f); circ(ctx, P[0], P[1], 0.018 + 0.016 * hash(i + 11)); }
      ctx.strokeStyle = 'rgba(232,228,222,0.3)'; ctx.lineWidth = lw(1); ctx.stroke();
    }
  }
  // the S-shaped blowhole at the front left of the head
  sp(0.035, -0.58); const bhx = P[0], bhy = P[1];
  ctx.beginPath(); ctx.moveTo(bhx - 0.06, bhy + 0.012); ctx.bezierCurveTo(bhx - 0.02, bhy - 0.045, bhx + 0.02, bhy + 0.045, bhx + 0.06, bhy - 0.012);
  ctx.strokeStyle = 'rgba(8,8,10,0.9)'; ctx.lineWidth = lw(2.2); ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.35); ctx.lineWidth = lw(0.8); ctx.stroke();
  // small eyes low at the back of the head: lids close as it sleeps
  for (let j = 0; j < 2; j++) {
    const sd = SIDES[j]; sp(0.335, sd * 0.95); const x = P[0], y = P[1], a = spA(0.335), open = 1 - sl;
    if (open > 0.02) {
      ctx.beginPath(); ctx.ellipse(x, y, 0.036, 0.024 * open, a, 0, TAU); ctx.fillStyle = 'rgb(14,12,14)'; ctx.fill();
      ctx.beginPath(); ctx.arc(x - 0.008, y - 0.008 * open, 0.008 * open, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(x, y, 0.04, 0.012 + 0.016 * open, a, sd > 0 ? 0 : PI, sd > 0 ? PI : TAU);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.35 + 0.4 * sl); ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  shine(ctx, H, e, 0.55, 1.0); shine(ctx, H, e, -0.8, 0.7);
  if (sl > 0.01) {
    // gentle bubbles rising along the flanks and a lazy blow, angled forward and to the left
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const f = fract(t * 0.32 + hash(i + 2)); sp(0.08 + 0.8 * hash(i + 5), (hash(i + 7) < 0.5 ? -1 : 1) * (1.05 + 0.25 * hash(i + 9)));
      circ(ctx, P[0], P[1], 0.02 + 0.045 * f);
    }
    ctx.strokeStyle = H.rgbStr(BUBBLE, 0.6 * sl); ctx.lineWidth = lw(1.1); ctx.stroke();
    outline(ctx, 0.02, 0.34, 0, n - 8); ctx.fillStyle = H.rgbStr(MIST, 0.1 * sl); ctx.fill(); // its wet back just breaking the surface
    const cb = fract(t * 0.16 + 0.1), blow = sl * sin(PI * clamp01(cb / 0.45));
    spout(ctx, H, bhx, bhy, blow * 0.8, t, 0.75, 0.15, 6, 0.75, -0.65);
  }
  if (click > 0.01) { // echolocation: bright arcs of sound bursting from the front of the head
    const cx = SX[0] + 0.05;
    glow(ctx, H, CLICK, cx, 0, 0.35 + 0.3 * click, 0.75 * click, 1);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const f = fract(t * 1.3 + i / 3), r = 0.12 + 1.5 * f, a = click * (1 - f) ** 1.2, sw = 0.5 + 0.35 * f;
      ctx.beginPath(); ctx.arc(cx, 0, r, -sw, sw);
      ctx.strokeStyle = H.rgbStr(CLICK, 0.28 * a); ctx.lineWidth = lb(7) * (1 - 0.4 * f); ctx.stroke();
      ctx.strokeStyle = H.rgbStr(WHITE, 0.95 * a); ctx.lineWidth = lb(2.2) * (1 - 0.4 * f); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- entries
function entry(fn) {
  return function draw(ctx, e, t, s, H, opts) {
    ctx.save();
    const hd = e.hdPreview ? !H.lod : H.hd;
    if (e.view) { const k = e.view[0]; ctx.scale(k, k); ctx.translate(e.view[1] || 0, 0); fn(ctx, e, t, s * k, subH(H, k, hd), opts); }
    else fn(ctx, e, t, s, hd !== H.hd ? subH(H, 1, hd) : H, opts);
    ctx.restore();
  };
}

export default {
  krillcloud: {
    name: 'Krill swarm',
    col: { body: [255, 128, 118], mem: [255, 222, 196], nuc: [255, 166, 92], glow: [255, 140, 130] },
    portraitR: 0.27,
    portraitRot: 0,
    states: [{ label: 'idle', view: [0.72, 0] }, { label: 'hp 0.3 (thinned out)', hp: 0.3, view: [0.72, 0] }],
    draw: entry(drawKrill),
  },
  baitball: {
    name: 'Sardine bait ball',
    col: { body: [176, 198, 214], mem: [236, 246, 255], nuc: [38, 74, 104], glow: [170, 205, 240] },
    portraitR: 0.33,
    portraitRot: 0,
    states: [{ label: 'idle', view: [0.85, 0] }, { label: 'hp 0.3 (thinned out)', hp: 0.3, view: [0.85, 0] }],
    draw: entry(drawBaitball),
  },
  eggcloud: {
    name: 'Coral spawn',
    col: { body: [255, 140, 160], mem: [255, 226, 214], nuc: [255, 156, 72], glow: [255, 160, 160] },
    portraitR: 0.29,
    portraitRot: 0,
    states: [{ label: 'idle', view: [0.78, 0] }, { label: 'hp 0.3 (thinned out)', hp: 0.3, view: [0.78, 0] }],
    draw: entry(drawEggs),
  },
  orca: {
    name: 'Orca',
    col: { body: [26, 28, 36], mem: [176, 190, 210], nuc: [248, 250, 252], glow: [140, 180, 230] },
    portraitR: 0.21,
    states: [
      { label: 'idle', view: [0.72, 0.2] },
      { label: 'sprintK 1', sprintK: 1, view: [0.66, 0.4] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.72, 0.1] },
      { label: 'biteK 1', biteK: 1, view: [0.72, 0.0] },
      { label: 'flipK 0.5', flipK: 0.5, view: [0.72, 0.2] },
      { label: 'flipK 1 (belly)', flipK: 1, view: [0.72, 0.2] },
      { label: 'breathK 0.5', breathK: 0.5, view: [0.72, 0.2] },
      { label: 'breathK 1', breathK: 1, view: [0.72, 0.2] },
      { label: 'boss pod (H.hd)', hdPreview: true, view: [0.72, 0.2] },
    ],
    draw: entry(drawOrca),
  },
  whitetip: {
    name: 'Oceanic whitetip shark',
    col: { body: [140, 124, 100], mem: [234, 226, 206], nuc: [255, 255, 250], glow: [210, 196, 160] },
    portraitR: 0.2,
    states: [
      { label: 'idle', view: [0.66, 0.3] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.66, 0.2] },
      { label: 'biteK 1', biteK: 1, view: [0.66, 0.1] },
      { label: 'sprintK 1', sprintK: 1, view: [0.62, 0.4] },
    ],
    draw: entry(drawWhitetip),
  },
  bluewhale: {
    name: 'Blue whale',
    col: { body: [88, 124, 166], mem: [196, 220, 242], nuc: [30, 50, 82], glow: [120, 170, 230] },
    portraitR: 0.125,
    states: [
      { label: 'idle', view: [0.29, 0.1] },
      { label: 'breathK 0.5', breathK: 0.5, view: [0.29, 0.1] },
      { label: 'breathK 1 (tall spout)', breathK: 1, view: [0.29, 0.1] },
      { label: 'head close-up', view: [0.8, -2.0] },
      { label: 'ending (H.hd)', hdPreview: true, view: [0.29, 0.1] },
    ],
    draw: entry(drawBlue),
  },
  spermwhale: {
    name: 'Sperm whale',
    boss: true,
    col: { body: [80, 75, 80], mem: [206, 198, 192], nuc: [30, 27, 31], glow: [170, 190, 230] },
    portraitR: 0.17,
    states: [
      { label: 'idle', view: [0.6, 0.5] },
      { label: 'clickK 0.5', clickK: 0.5, view: [0.6, 0.2] },
      { label: 'clickK 1', clickK: 1, view: [0.6, 0.0] },
      { label: 'sleepK 1 (resting at the surface)', sleepK: 1, view: [0.6, 0.5] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.6, 0.3] },
      { label: 'biteK 1', biteK: 1, view: [0.6, 0.2] },
    ],
    draw: entry(drawSperm),
  },
};
