// Creature art for the t9 tier: great-white scale (4–8 m): a seal island and a deep mid-ocean shark gathering spot.
// Each entry: { name, col, portraitR, states, draw(ctx, e, t, s, H, opts) } — see README.md.
// Like t5/t6, every animal is seen from above: +x = heading and the body is mirror-symmetric about the x axis, so it
// reads at any rotation. Shark jaws open in the picture plane (the lower jaw swings forward ahead of the snout) so a
// bite reads from above.
// Preview-only extra: `e.view = [k, dx]` zooms the drawing out by k and pans it by dx units (dev gallery tiles).
// Extra export: `tentaclePos(e, T, i)` (giant squid): where feeding tentacle i's club (or its stump) is, in unit space.

const TAU = Math.PI * 2;
const { sin, cos, min, max, abs, sqrt, PI, floor, round, exp } = Math;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const sstep = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const fract = (v) => v - floor(v);
const hash = (i) => fract(sin(i * 127.1 + 311.7) * 43758.5453);
const WHITE = [255, 255, 255];
const INK = [20, 12, 28];
const SHADE = [3, 4, 9];
const C1 = [0, 0, 0], C2 = [0, 0, 0], C3 = [0, 0, 0];

// ---------------------------------------------------------------- shared helpers (same as t5 / t6)
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
// fill the current path with the cached body gradient mapped onto an ellipse (only constant colours: it is cached)
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

// Phase integrated over time, so a changing rate (sprinting, sick) never makes a fin or tail jump. Two slots.
// Stateless callers (portraits, frozen objects) get exactly t·f.
function phaseOf(e, t, f, slot = 0) {
  if (!Object.isExtensible(e)) return t * f;
  const kt = slot ? '_t9t1' : '_t9t0', kp = slot ? '_t9p1' : '_t9p0';
  const dt = t - e[kt];
  if (dt >= 0 && dt < 0.25) e[kp] += dt * f; else e[kp] = t * f;
  e[kt] = t;
  return e[kp];
}

// width profile through knots [u0, w0, u1, w1, …] (u ascending 0 → 1), Hermite-interpolated
function prof(K) {
  const n = K.length >> 1, M = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = max(0, i - 1), b = min(n - 1, i + 1); M[i] = (K[b * 2 + 1] - K[a * 2 + 1]) / (K[b * 2] - K[a * 2]); }
  return (u) => {
    let i = 1; while (i < n - 1 && u > K[i * 2]) i++;
    const u0 = K[i * 2 - 2], h = K[i * 2] - u0, v = clamp01((u - u0) / h), v2 = v * v, v3 = v2 * v;
    return (2 * v3 - 3 * v2 + 1) * K[i * 2 - 1] + (v3 - 2 * v2 + v) * h * M[i - 1] + (3 * v2 - 2 * v3) * K[i * 2 + 1] + (v3 - v2) * h * M[i];
  };
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
// cheap tail triangle for LOD silhouettes (adds to the current path)
function tailTri(ctx, tx, ty, ta, L, sp0, notch) {
  ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - sp0) * L, ty + sin(ta - sp0) * L);
  ctx.lineTo(tx + cos(ta) * notch, ty + sin(ta) * notch); ctx.lineTo(tx + cos(ta + sp0) * L, ty + sin(ta + sp0) * L); ctx.closePath();
}
// caudal fin rooted at the origin, +x pointing away from the body. nk = notch depth (0.45 deep fork), f = lobe flex
function tailPath(ctx, L, W, r0, f, nk) {
  const cn = nk < 1 ? nk + 0.14 : nk + 0.08;
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L * 0.42, -W * 0.5, L, -W * 0.62 + f);
  ctx.quadraticCurveTo(L * cn, -W * 0.16 + f * 0.6, L * nk, f * 0.5);
  ctx.quadraticCurveTo(L * cn, W * 0.16 + f * 0.6, L, W * 0.62 + f);
  ctx.quadraticCurveTo(L * 0.42, W * 0.5, 0, r0);
  ctx.closePath();
}
// a thin tooth from base (bx, by) to tip (tx, ty), half-width bw at the base (adds to the current path)
function tooth(ctx, bx, by, tx, ty, bw) {
  const dx = tx - bx, dy = ty - by, l = Math.hypot(dx, dy) || 1, px = -dy / l * bw, py = dx / l * bw;
  ctx.moveTo(bx + px, by + py); ctx.quadraticCurveTo(bx + dx * 0.55 + px * 0.4, by + dy * 0.55 + py * 0.4, tx, ty); ctx.lineTo(bx - px, by - py);
}
// a tapered tube (arm, tentacle) around the centre line held in B (segs + 1 points), into the current path
function tube(ctx, B, segs, w0, wt = 0.004, pw = 0.85) {
  for (let k = 0; k <= segs; k++) {
    const i = min(k, segs - 1), dx = B[i * 2 + 2] - B[i * 2], dy = B[i * 2 + 3] - B[i * 2 + 1], l = Math.hypot(dx, dy) || 1;
    const w = w0 * (1 - k / segs) ** pw + wt;
    k ? ctx.lineTo(B[k * 2] - dy / l * w, B[k * 2 + 1] + dx / l * w) : ctx.moveTo(B[0] - dy / l * w, B[1] + dx / l * w);
  }
  for (let k = segs; k >= 0; k--) {
    const i = min(k, segs - 1), dx = B[i * 2 + 2] - B[i * 2], dy = B[i * 2 + 3] - B[i * 2 + 1], l = Math.hypot(dx, dy) || 1;
    const w = w0 * (1 - k / segs) ** pw + wt;
    ctx.lineTo(B[k * 2] + dy / l * w, B[k * 2 + 1] - dx / l * w);
  }
  ctx.closePath();
}
// one squid-style limb: centre line into AB, then the tube
const AB = new Float32Array(40 * 2), ARMB = new Float32Array(8 * 12 * 2);
function limb(ctx, x, y, a, len, w0, segs, t, j, curl, wig) {
  const ds = len / segs;
  AB[0] = x; AB[1] = y;
  for (let k = 1; k <= segs; k++) {
    a += wig * sin(t * 1.5 + j * 1.1 + k * 0.7) + curl * (k / segs);
    x += cos(a) * ds; y += sin(a) * ds; AB[k * 2] = x; AB[k * 2 + 1] = y;
  }
  tube(ctx, AB, segs, w0);
}
const SEPIA = [104, 74, 100];
// ink cloud billowing behind the animal, starting at x0 (sz scales the whole cloud)
function inkCloud(ctx, H, t, k, x0 = -1.05, sz = 1) {
  const np = H.lod ? 3 : 8;
  for (let pass = 0; pass < (H.lod ? 1 : 2); pass++) {
    for (let i = 0; i < np; i++) {
      const u = i / (np - 1);
      const x = x0 - (0.25 + 2.0 * u) * (0.55 + 0.45 * k) * sz - 0.1 * sin(t * 0.7 + i);
      const y = (0.1 + 0.55 * u) * sin(i * 2.3 + t * 0.5) * k * sz;
      const r = ((0.38 + 0.6 * u) * (0.45 + 0.55 * k) + 0.06 * sin(t * 1.3 + i * 1.7)) * sz;
      if (pass === 0) smudge(ctx, H, SEPIA, x, y, r * 1.35, r * 1.2 * (0.85 + 0.15 * sin(i * 1.9)), k * (0.9 - 0.35 * u));
      else smudge(ctx, H, INK, x + 0.05, y, r * 0.75, r * 0.65, k * (1 - 0.45 * u));
    }
  }
  if (!H.lod) smudge(ctx, H, [8, 4, 12], x0 - 0.25 - 0.3 * k, 0, (0.42 * k + 0.1) * sz, (0.3 * k + 0.08) * sz, k);
}
// motion streaks behind a fast body
function streaks(ctx, H, c, t, k, x0, spanY) {
  ctx.beginPath();
  for (let j = 0; j < 9; j++) {
    if (j === 4) continue;
    const y = (j - 4) * spanY * (1 + 0.3 * abs(j - 4) / 4), f = fract(t * 2.4 + hash(j + 1) * 3), xa = x0 - abs(j - 4) * 0.25 - f * 2.4, len = (0.45 + 0.4 * hash(j + 7)) * (1 - f * 0.5);
    ctx.moveTo(xa, y); ctx.lineTo(xa - len, y);
  }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.45 * k); ctx.lineWidth = H.lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
}
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
  if (tk) {
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) { bez3(0, -W * 0.5, L * 0.4, -W * 0.72, L * 0.82, -W * 0.3, L, W * 0.5, 1 - tk + tk * (i / 5)); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    for (let i = 1; i <= 4; i++) { bez2(L, W * 0.5, L * 0.48, W * 0.08, 0, W * 0.5, tk * 0.75 * (i / 4)); ctx.lineTo(P[0], P[1]); }
    ctx.closePath(); ctx.fillStyle = tipFill; ctx.fill();
  }
  ctx.restore();
}
// a rounded flipper / paddle blade rooted at (x, y), pointing along a; side mirrors (path only)
function flipper(ctx, x, y, a, side, L, W, bend) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.35, -W * 0.95, L * 0.78, -W * 0.5 + bend * 0.5, L, W * 0.05 + bend);
  ctx.quadraticCurveTo(L * 0.62, W * 0.55 + bend * 0.5, 0, W * 0.5);
  ctx.closePath();
  ctx.restore();
}
// whiskers: n pale curved bristles per side fanning out from (x, ±y)
function whiskers(ctx, H, x, y, n, L, a0, a1, rgba, px) {
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < n; i++) {
    const v = n > 1 ? i / (n - 1) : 0.5, a = a0 + (a1 - a0) * v, l = L * (0.8 + 0.3 * sin(v * PI)), y0 = sd * (y + 0.02 * v);
    const ex = x + cos(a) * l, ey = y0 + sd * sin(a) * l;
    ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + cos(a) * l * 0.6, y0 + sd * sin(a) * l * 0.5, ex - 0.04 * l, ey + sd * 0.12 * l);
  }
  ctx.strokeStyle = rgba; ctx.lineWidth = H.lw(px); ctx.lineCap = 'round'; ctx.stroke();
}

// =================================================================================================== sharks
// One pipeline for the four sharks (spine, fins, jaws, countershaded body, gills, dorsal fins, eyes); each species
// supplies its shape S and a state o = { k (body straightened), sk (motion streaks), g (jaw opening), d (lower-jaw
// reach), wide (extra gape, gulping), sick, va (body opacity: camouflage), shimmer }.
const THROAT = 'rgb(58,16,24)', TOOTH = 'rgba(255,255,248,0.98)', SICK = [176, 214, 150];
// lunate caudal fin; tk = dark tip fraction painted in tipFill
function sharkTail(ctx, tx, ty, ta, L, W, r0, flex, nk, fill, edge, lwE, tk, tipFill) {
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  tailPath(ctx, L, W, r0, flex, nk); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lwE; ctx.stroke();
  if (tk > 0) {
    const cn = nk + 0.14;
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      for (let i = 0; i <= 4; i++) { bez2(0, sd * r0, L * 0.42, sd * W * 0.5, L, sd * W * 0.62 + flex, 1 - tk + tk * (i / 4)); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
      for (let i = 1; i <= 3; i++) { bez2(L, sd * W * 0.62 + flex, L * cn, sd * W * 0.16 + flex * 0.6, L * nk, flex * 0.5, tk * 1.05 * (i / 3)); ctx.lineTo(P[0], P[1]); }
      ctx.closePath();
    }
    ctx.fillStyle = tipFill; ctx.fill();
  }
  ctx.restore();
}
// long, low caudal fin of the sixgill: a tapering blade with a notch just before its tip (path only)
function longTailPath(ctx, L, W, r0, f) {
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.bezierCurveTo(L * 0.12, -W * 0.44 + f * 0.1, L * 0.32, -W * 0.38 + f * 0.3, L * 0.6, -W * 0.26 + f * 0.55);
  ctx.quadraticCurveTo(L * 0.68, -W * 0.22 + f * 0.65, L * 0.72, -W * 0.07 + f * 0.7);
  ctx.quadraticCurveTo(L * 0.84, -W * 0.2 + f * 0.82, L, f);
  ctx.quadraticCurveTo(L * 0.84, W * 0.2 + f * 0.82, L * 0.72, W * 0.07 + f * 0.7);
  ctx.quadraticCurveTo(L * 0.68, W * 0.22 + f * 0.65, L * 0.6, W * 0.26 + f * 0.55);
  ctx.bezierCurveTo(L * 0.32, W * 0.38 + f * 0.3, L * 0.12, W * 0.44 + f * 0.1, 0, r0);
  ctx.closePath();
}
// jaws: the lower jaw swings forward ahead of the snout (reach d), a dark gape between it and the upper jaw edge
// (ellipse J = [cx, rx, ry]); wide opens the gape further (gulping)
function sharkJaws(ctx, H, c, J, g, d, wide, nt, tl, tw, hd) {
  const cx = J[0], rx = J[1], ry = J[2], A = 1.15 + 0.2 * wide;
  const ry1 = ry + 0.02 + 0.03 * g + wide, rx1 = rx + 0.03 + d;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) { const a = -A + 2 * A * (i / 12); const x = cx + rx1 * cos(a), y = ry1 * sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = 12; i >= 0; i--) { const a = -A + 2 * A * (i / 12); ctx.lineTo(cx + rx * cos(a), ry * sin(a)); }
  ctx.closePath(); ctx.fillStyle = THROAT; ctx.fill();
  smudge(ctx, H, [120, 30, 44], cx + rx + d * 0.45, 0, 0.12 + 0.12 * g + wide, 0.2 + wide, 0.5 * g);
  if (wide > 0.01) smudge(ctx, H, [10, 2, 6], cx + rx + 0.02 + d * 0.3, 0, 0.1 + wide, 0.12 + wide * 1.5, 0.9 * (wide / 0.1)); // the throat
  // lower jaw rim and its teeth pointing back into the mouth
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) { const a = -A + 2 * A * (i / 12); const x = cx + (rx1 + 0.07) * cos(a), y = (ry1 + 0.025) * sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = 12; i >= 0; i--) { const a = -A + 2 * A * (i / 12); ctx.lineTo(cx + rx1 * cos(a), ry1 * sin(a)); }
  ctx.closePath(); ctx.fillStyle = H.rgbStr(c.mem, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = H.lw(1); ctx.stroke();
  const m = hd ? nt : max(5, round(nt * 0.6));
  ctx.beginPath();
  for (let i = 0; i < m; i++) { const a = -A * 0.88 + 2 * A * 0.88 * (i / (m - 1)); const bx = cx + rx1 * cos(a), by = ry1 * sin(a); tooth(ctx, bx, by, bx - cos(a) * tl * g, by - sin(a) * tl * 0.85 * g, tw); }
  ctx.fillStyle = TOOTH; ctx.fill();
}
// upper teeth peeking out under the snout edge as the jaws open
function upperTeeth(ctx, J, g, nt, tl, tw, hd) {
  const cx = J[0], rx = J[1], ry = J[2], m = hd ? nt : max(5, round(nt * 0.6));
  ctx.beginPath();
  for (let i = 0; i < m; i++) { const a = -0.95 + 1.9 * (i / (m - 1)), bx = cx + (rx - 0.01) * cos(a), by = (ry - 0.01) * sin(a); tooth(ctx, bx - cos(a) * 0.02, by - sin(a) * 0.02, bx + cos(a) * tl * g, by + sin(a) * tl * 0.75 * g, tw); }
  ctx.fillStyle = TOOTH; ctx.fill();
}
function sharkCore(ctx, e, t, s, H, S, o) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = o.k || 0, g = o.g || 0, sick = o.sick || 0, va = o.va ?? 1;
  const st = (e.stretch || 0) + 0.06 * k;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.35);
  const ph = phaseOf(e, t, S.f0 * (1 + 1.5 * k) * (1 - 0.6 * sick));
  const n = H.lod ? 10 : 26;
  spine(n, S.x0, S.len, S.W, S.amp * (1 - 0.85 * k) * (1 - 0.5 * g) * (1 + 1.1 * sick), S.kw, ph, S.pw);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.08 * sin(ph - 5) * (1 - 0.6 * k);
  const pu = S.pect[0], pf = S.pect[1], pL = S.pect[2], pW = S.pect[3], pa = S.pect[4];
  const cap = S.cap * (1 - 0.35 * g);
  const A0 = ctx.globalAlpha;
  if (va < 1) ctx.globalAlpha = A0 * va;
  if (H.lod) {
    outline(ctx, cap);
    for (const sd of [-1, 1]) { sp(pu, sd * 0.9); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] - pL * 0.5, P[1] + sd * pL * 0.8); sp(pu + 0.12, sd * 0.7); ctx.lineTo(P[0], P[1]); ctx.closePath(); }
    tailTri(ctx, tx, ty, ta, S.tail[0], S.longTail ? 0.25 : 0.65, S.longTail ? S.tail[0] * 0.8 : S.tail[0] * 0.4);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    ctx.globalAlpha = A0;
    return;
  }
  if (o.sk > 0.01) { streaks(ctx, H, c, t, o.sk, 0.5, 0.12); glow(ctx, H, c.glow, -0.2, 0, 1.4, 0.18 * o.sk, 0, 0.35); }
  let finC = S.finDark ? H.mixRGB(c.body, c.nuc, S.finDark, C1) : c.body;
  if (sick > 0.01) finC = H.mixRGB(finC, SICK, 0.5 * sick, C1);
  const finF = H.rgbStr(finC, 0.94), finE = H.rgbStr(c.mem, 0.72), tipF = H.rgbStr(c.nuc, 0.55);
  // caudal fin
  if (S.longTail) {
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
    longTailPath(ctx, S.tail[0], S.tail[1], S.tail[2], flex * 1.4);
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
    ctx.restore();
  } else sharkTail(ctx, tx, ty, ta, S.tail[0], S.tail[1], S.tail[2], flex, S.tail[3], finF, finE, lb(1.1), S.tipK, tipF);
  // lateral keels on the tail stock (lamnid sharks)
  if (S.keel) {
    ctx.beginPath();
    for (const sd of [-1, 1]) { sp(0.84, sd * 0.95); ctx.moveTo(P[0], P[1]); sp(0.95, sd * 2.1); ctx.lineTo(P[0], P[1]); sp(1, sd * 0.9); ctx.lineTo(P[0], P[1]); ctx.closePath(); }
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  // pelvic fins, then the pectorals (swept back when fast, drooping when sick)
  const pv = S.pelv;
  for (const sd of [-1, 1]) { sp(pv[0], sd * 0.8); sickle(ctx, P[0], P[1], spA(pv[0]) + sd * (PI / 2 + 0.95 + 0.3 * sick), sd, pv[1], pv[2], finF, finE, lw(1), tipF, S.tipK); }
  for (const sd of [-1, 1]) {
    const flap = (0.08 * sin(t * 2 + sd) + 0.1 * sick * sin(t * 0.9 + sd * 2)) * (1 - k);
    sp(pu, sd * pf);
    const a = spA(pu) + sd * (PI / 2 + pa + 0.4 * k + flap + 0.35 * sick);
    if (S.paddle) { flipper(ctx, P[0], P[1], a, sd, pL * (1 - 0.1 * k), pW, 0.03); ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1.1); ctx.stroke(); }
    else sickle(ctx, P[0], P[1], a, sd, pL * (1 - 0.1 * k), pW, finF, finE, lw(1.1), tipF, S.tipK);
  }
  // jaws
  const tt = S.teeth;
  if (g > 0.01) sharkJaws(ctx, H, c, S.jaw, g, (o.d ?? S.reach * g), o.wide || 0, tt[0], tt[2], tt[3], hd);
  // body: pale underside showing round the edges (countershading seen from above), dorsal colour on top
  outline(ctx, cap);
  ctx.fillStyle = H.rgbStr(S.belly, 0.92); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.4); ctx.stroke();
  outline(ctx, cap * 0.8, 1 - S.rim, 0, n);
  ctx.fillStyle = H.rgbStr(c.body, 0.84); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 1.2, 0.34);
  if (S.sheen) { outline(ctx, cap * 0.5, 0.38, 1, n - 3); ctx.fillStyle = H.rgbStr(S.sheen, 0.26); ctx.fill(); }
  else { outline(ctx, cap * 0.5, 0.5, 1, n - 2); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.3, C2), 0.3); ctx.fill(); }
  if (sick > 0.01) { outline(ctx, cap); ctx.fillStyle = H.rgbStr(SICK, 0.5 * sick); ctx.fill(); }
  if (S.pattern) S.pattern(ctx, H, c, t, o, hd);
  // gill slits
  {
    const gu = S.gills[0], gn = S.gills[1], gd = S.gills[2], gl = S.gills[3], fl = o.flare || 0;
    ctx.beginPath();
    for (const sd of [-1, 1]) for (let i = 0; i < gn; i++) { const u = gu + i * gd; sp(u, sd * 0.99); ctx.moveTo(P[0], P[1]); sp(u - 0.01, sd * (0.99 - 0.28 * gl)); ctx.lineTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.45 + 0.3 * fl); ctx.lineWidth = lw(1 + 1.2 * fl); ctx.lineCap = 'round'; ctx.stroke();
  }
  if (g > 0.1) upperTeeth(ctx, S.jaw, g, tt[1], tt[2], tt[3], hd);
  // dorsal fins along the back (they lean, as if seen a little from the side)
  {
    const D = S.dors;
    sp(D[0], 0); const ax = P[0], ay = P[1]; sp(D[1], 0); const bx = P[0], by = P[1];
    const hx = ax - D[3], hy = ay - D[2];
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax - D[3] * 0.15, ay - D[2] * 0.48, hx, hy); ctx.quadraticCurveTo(hx + 0.02, (hy + by) / 2, bx, by); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(finC, c.nuc, 0.18, C2), 0.95); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
    if (S.tipK) {
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) { bez2(ax, ay, ax - D[3] * 0.15, ay - D[2] * 0.48, hx, hy, 0.62 + 0.38 * (i / 4)); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
      for (let i = 1; i <= 4; i++) { bez2(hx, hy, hx + 0.02, (hy + by) / 2, bx, by, 0.38 * (i / 4)); ctx.lineTo(P[0], P[1]); }
      ctx.closePath(); ctx.fillStyle = tipF; ctx.fill();
    }
    if (S.dors2) {
      sp(S.dors2[0], 0); const cx0 = P[0], cy0 = P[1]; sp(S.dors2[1], 0);
      ctx.beginPath(); ctx.moveTo(cx0, cy0); ctx.quadraticCurveTo(cx0 - 0.04, cy0 - 0.06, P[0] - 0.02, P[1] - 0.05); ctx.lineTo(P[0], P[1]); ctx.closePath();
      ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
    }
  }
  // nostrils
  if (S.nost) {
    ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(S.nost[0], sd * S.nost[1]); ctx.lineTo(S.nost[0] - 0.05, sd * (S.nost[1] + 0.05)); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(1.3); ctx.stroke();
  }
  // a camouflaged shark still bends the light a little: a faint shimmering edge
  if (va < 0.98 && o.shimmer) {
    ctx.globalAlpha = A0;
    outline(ctx, cap); ctx.strokeStyle = H.rgbStr(c.mem, 0.13 * (1 - va) * (0.75 + 0.25 * sin(t * 2.3))); ctx.lineWidth = lw(1); ctx.stroke();
  }
  // eyes (kept visible even when the body is not: the sixgill's glint)
  ctx.globalAlpha = A0;
  for (const sd of [-1, 1]) { sp(S.eye[0], sd * S.eye[1]); S.eyes(ctx, H, c, P[0], P[1], sd, o, t, va); }
  ctx.globalAlpha = A0 * va;
  shine(ctx, H, e, 0.35, 0.6);
  ctx.globalAlpha = A0;
}

// ---- shortfin mako
const MAKO_BELLY = [236, 242, 255], MAKO_SHEEN = [150, 196, 255];
const MAKO_S = {
  W: prof([0, 0.045, 0.07, 0.13, 0.15, 0.2, 0.25, 0.262, 0.35, 0.275, 0.52, 0.226, 0.72, 0.14, 0.9, 0.072, 1, 0.048]),
  x0: 1.08, len: 2.32, cap: 0.17, amp: 0.11, kw: 4, pw: 2.2, f0: 4.4,
  tail: [0.5, 1.0, 0.04, 0.36], tipK: 0, keel: true,
  pect: [0.3, 0.86, 0.46, 0.19, 0.62], pelv: [0.64, 0.13, 0.07],
  dors: [0.33, 0.47, 0.24, 0.2], dors2: [0.75, 0.79],
  gills: [0.19, 5, 0.024, 1.15], jaw: [0.62, 0.47, 0.22], reach: 0.24, teeth: [13, 9, 0.11, 0.013],
  eye: [0.1, 0.78], rim: 0.17, belly: MAKO_BELLY, sheen: MAKO_SHEEN, nost: [1.12, 0.05],
  eyes(ctx, H, c, x, y, sd, o) { // big, round, all-black eye; it rolls back as the shark bites
    ctx.beginPath(); ctx.arc(x, y, 0.056, 0, TAU); ctx.fillStyle = '#03050c'; ctx.fill();
    ctx.strokeStyle = 'rgba(170,200,255,0.55)'; ctx.lineWidth = H.lw(1); ctx.stroke();
    if (o.g > 0.01) { ctx.beginPath(); ctx.ellipse(x - 0.01, y, 0.052, 0.05, 0, 0, TAU); ctx.fillStyle = `rgba(232,238,246,${(0.88 * o.g).toFixed(3)})`; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x - 0.016, y - 0.018, 0.016, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  },
};
function drawMako(ctx, e, t, s, H) {
  const k = sstep(e.sprintK || 0), g = sstep(e.biteK || 0);
  sharkCore(ctx, e, t, s, H, MAKO_S, { k, sk: k, g });
}

// ---- bronze whaler (copper shark)
const BRONZE_BELLY = [240, 230, 210], BRONZE_SHEEN = [240, 170, 96];
const BRONZE_S = {
  W: prof([0, 0.07, 0.07, 0.165, 0.16, 0.235, 0.27, 0.285, 0.4, 0.28, 0.58, 0.21, 0.78, 0.12, 1, 0.055]),
  x0: 1.1, len: 2.3, cap: 0.1, amp: 0.13, kw: 4, pw: 2, f0: 4,
  tail: [0.58, 0.8, 0.05, 0.5], tipK: 0.32,
  pect: [0.29, 0.88, 0.66, 0.25, 0.55], pelv: [0.66, 0.17, 0.085],
  dors: [0.34, 0.5, 0.21, 0.22], dors2: [0.73, 0.78],
  gills: [0.17, 5, 0.022, 1], jaw: [0.62, 0.5, 0.27], reach: 0.22, teeth: [13, 9, 0.075, 0.018],
  eye: [0.1, 0.8], rim: 0.14, belly: BRONZE_BELLY, sheen: BRONZE_SHEEN, nost: [1.1, 0.08],
  eyes(ctx, H, c, x, y, sd, o) { // golden-green iris, dark pupil; the nictitating membrane closes as it bites
    ctx.beginPath(); ctx.ellipse(x, y, 0.06, 0.045, 0, 0, TAU); ctx.fillStyle = 'rgb(206,190,104)'; ctx.fill(); ctx.strokeStyle = 'rgba(30,20,10,0.8)'; ctx.lineWidth = H.lw(1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 0.004, y, 0.02, 0.034, 0, 0, TAU); ctx.fillStyle = '#060404'; ctx.fill();
    if (o.g > 0.01) { ctx.beginPath(); ctx.ellipse(x, y, 0.062, 0.047, 0, 0, TAU); ctx.fillStyle = `rgba(236,232,224,${(0.9 * o.g).toFixed(3)})`; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x - 0.015, y - 0.015, 0.012, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  },
};
function drawBronze(ctx, e, t, s, H) {
  sharkCore(ctx, e, t, s, H, BRONZE_S, { k: 0, sk: 0, g: sstep(e.biteK || 0) });
}

// ---- bluntnose sixgill
const SIX_BELLY = [92, 90, 82], SIX_EYE = [110, 255, 150];
const SIX_S = {
  W: prof([0, 0.17, 0.05, 0.245, 0.14, 0.31, 0.3, 0.33, 0.46, 0.3, 0.62, 0.24, 0.8, 0.16, 1, 0.085]),
  x0: 1.0, len: 2.0, cap: 0.08, amp: 0.15, kw: 3.6, pw: 1.8, f0: 2.8,
  tail: [0.95, 0.36, 0.08, 0], longTail: true, tipK: 0, paddle: true,
  pect: [0.3, 0.9, 0.42, 0.3, 0.8], pelv: [0.62, 0.16, 0.1],
  dors: [0.76, 0.86, 0.14, 0.15], dors2: null,
  gills: [0.14, 6, 0.024, 1.2], jaw: [0.66, 0.4, 0.3], reach: 0.22, teeth: [15, 9, 0.06, 0.026],
  eye: [0.085, 0.66], rim: 0.1, belly: SIX_BELLY, sheen: null, nost: [1.02, 0.1],
  eyes(ctx, H, c, x, y, sd, o, t, va) { // glowing green eyes: brighter as it tenses; a faint glint even when hidden
    const br = 0.25 + 0.55 * (o.tele || 0) + 0.35 * (o.lunge || 0);
    const ea = 0.45 + 0.55 * va;
    glow(ctx, H, SIX_EYE, x, y, 0.13 + 0.12 * br, (0.35 + 0.6 * br) * (0.55 + 0.45 * va), 1);
    if (!(ea > 0.01)) return;
    const A = ctx.globalAlpha; ctx.globalAlpha = A * ea;
    ctx.beginPath(); ctx.ellipse(x, y, 0.06, 0.048, 0, 0, TAU); ctx.fillStyle = H.rgbStr(SIX_EYE, 0.85 + 0.15 * br); ctx.fill();
    ctx.strokeStyle = 'rgba(10,30,16,0.8)'; ctx.lineWidth = H.lw(1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 0.006, y, 0.03 - 0.012 * br, 0.034, 0, 0, TAU); ctx.fillStyle = '#020604'; ctx.fill();
    ctx.beginPath(); ctx.arc(x - 0.016, y - 0.016, 0.012, 0, TAU); ctx.fillStyle = 'rgba(235,255,240,0.9)'; ctx.fill();
    ctx.globalAlpha = A;
  },
};
function drawSixgill(ctx, e, t, s, H) {
  const tele = sstep(min(1, (e.tele || 0) / 0.7)), lunge = sstep(min(1, (e.lunge || 0) / 0.42)); // the lurker AI counts these down from 0.7 s and 0.42 s
  const vis = e.vis === undefined ? 1 : clamp01(e.vis); // the game always sets vis; undefined (codex, gallery) = seen
  const va = 0.03 + 0.97 * sstep(vis);
  const tense = tele * (1 - lunge);
  if (tense > 0.01) { ctx.translate(0.01 * tense * sin(t * 47), 0.006 * tense * sin(t * 31)); ctx.scale(1 - 0.05 * tense, 1 + 0.04 * tense); }
  if (lunge > 0.01) ctx.scale(1 + 0.06 * lunge, 1 - 0.05 * lunge);
  sharkCore(ctx, e, t, s, H, SIX_S, { k: max(lunge, 0.7 * tele), sk: lunge, g: max(0.18 * tele, lunge), va, shimmer: true, tele, lunge, flare: tele });
}

// ---- tiger shark (boss)
let TG_BULGE = 0;
const TIGER_W0 = prof([0, 0.2, 0.04, 0.255, 0.12, 0.31, 0.26, 0.345, 0.42, 0.33, 0.6, 0.245, 0.8, 0.14, 1, 0.06]);
const TIGER_BELLY = [234, 228, 210];
const TIGER_S = {
  W: (u) => TIGER_W0(u) + TG_BULGE * exp(-(((u - 0.2) / 0.1) ** 2)),
  x0: 1.06, len: 2.32, cap: 0.025, amp: 0.13, kw: 4, pw: 2, f0: 3.4,
  tail: [0.7, 0.82, 0.05, 0.42], tipK: 0,
  pect: [0.3, 0.9, 0.6, 0.3, 0.55], pelv: [0.66, 0.17, 0.09],
  dors: [0.33, 0.49, 0.23, 0.22], dors2: [0.73, 0.78],
  gills: [0.18, 5, 0.022, 1], jaw: [0.74, 0.36, 0.3], reach: 0.24, teeth: [15, 11, 0.07, 0.03],
  eye: [0.1, 0.76], rim: 0.12, belly: TIGER_BELLY, sheen: null, nost: [1.07, 0.14],
  pattern: tigerStripes, finDark: 0.16,
  eyes(ctx, H, c, x, y, sd, o) { // dark eye, nictitating membrane closing as it bites; rolled up when sick
    const sick = o.sick || 0;
    ctx.beginPath(); ctx.ellipse(x, y, 0.066, 0.05, 0, 0, TAU); ctx.fillStyle = H.rgbStr(H.mixRGB([150, 140, 92], [236, 240, 226], sick, C3)); ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,10,0.85)'; ctx.lineWidth = H.lw(1.1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 0.004 - 0.03 * sick, y - sd * 0.016 * sick, 0.016 - 0.006 * sick, 0.04 - 0.024 * sick, 0, 0, TAU); ctx.fillStyle = '#060504'; ctx.fill();
    const nm = o.nict || 0;
    if (nm > 0.01) { ctx.beginPath(); ctx.ellipse(x, y, 0.068, 0.052, 0, 0, TAU); ctx.fillStyle = `rgba(230,228,220,${(0.9 * nm).toFixed(3)})`; ctx.fill(); }
    ctx.beginPath(); ctx.arc(x - 0.017, y - 0.016, 0.013, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  },
};
const TIGER_BARS = 13;
function tigerStripes(ctx, H, c, t, o, hd) {
  // dark tiger bars crossing the back (strongest towards the tail), broken spots on the head
  ctx.beginPath();
  for (let j = 0; j < TIGER_BARS; j++) {
    const u = 0.25 + j * 0.054 + 0.012 * hash(j + 3), bw = 0.014 + 0.01 * hash(j + 11) + 0.008 * (j / TIGER_BARS);
    for (let i = 0; i <= 6; i++) { const f = -0.86 + 1.72 * (i / 6); sp(u + 0.012 * abs(f) + 0.01 * sin(j * 2.1 + i * 1.7), f); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
    for (let i = 6; i >= 0; i--) { const f = -0.86 + 1.72 * (i / 6); sp(u + bw + 0.012 * abs(f) + 0.01 * sin(j * 2.1 + i * 1.7 + 1), f * 0.95); ctx.lineTo(P[0], P[1]); }
    ctx.closePath();
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.58); ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < (hd ? 26 : 12); i++) { const u = 0.07 + 0.18 * hash(i + 41), f = (hash(i * 3.3 + 7) * 2 - 1) * 0.72; sp(u, f); circ(ctx, P[0], P[1], 0.011 + 0.012 * hash(i + 5)); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.45); ctx.fill();
  if (hd) {
    // lateral lines, sensory pores on the snout, long upper labial furrows, old scars
    ctx.beginPath();
    for (const sd of [-1, 1]) { for (let i = 0; i <= 10; i++) { sp(0.24 + i * 0.07, sd * 0.62); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); } }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.28); ctx.lineWidth = H.lw(1); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 22; i++) { const u = 0.01 + 0.07 * hash(i + 71), f = (hash(i * 1.9 + 3) * 2 - 1) * 0.85; sp(u, f); circ(ctx, P[0], P[1], 0.006); }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill();
    ctx.beginPath();
    for (const sd of [-1, 1]) { sp(0.05, sd * 0.96); ctx.moveTo(P[0], P[1]); sp(0.12, sd * 0.86); ctx.lineTo(P[0], P[1]); }
    ctx.moveTo(0.1, -0.15); ctx.lineTo(-0.06, -0.09); ctx.moveTo(-0.2, 0.18); ctx.quadraticCurveTo(-0.3, 0.12, -0.38, 0.16);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.4); ctx.lineWidth = H.lw(1.2); ctx.stroke();
  }
}
const BUB = [214, 255, 190];
function drawTiger(ctx, e, t, s, H) {
  const c = H.col, gape = sstep(e.gapeK || 0), bite = sstep(e.biteK || 0), sick = sstep(e.sickK || 0);
  if (sick > 0.01) { ctx.rotate(0.12 * sick * sin(t * 1.3)); ctx.translate(0.04 * sick * sin(t * 0.9), 0.03 * sick * sin(t * 1.1 + 1)); }
  // gulping: water (and anything in it) streams into the huge mouth
  if (gape > 0.3 && !H.lod) {
    const k = (gape - 0.3) / 0.7;
    ctx.beginPath();
    for (let i = 0; i < (H.hd ? 12 : 7); i++) {
      const f = fract(t * 1.3 + hash(i + 2)), a = (hash(i + 13) - 0.5) * 2.2, r0 = 1.75 - 1.2 * f * f, r1 = r0 - 0.16 - 0.1 * f;
      ctx.moveTo(1.12 + cos(a) * r0 * 0.6, sin(a) * r0 * 0.5); ctx.lineTo(1.12 + cos(a) * r1 * 0.6, sin(a) * r1 * 0.5);
    }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.5 * k); ctx.lineWidth = H.lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
  }
  TG_BULGE = 0.045 * gape;
  const g = max(gape, bite);
  sharkCore(ctx, e, t, s, H, TIGER_S, { k: 0, sk: 0, g, d: 0.24 * g + 0.1 * gape, wide: 0.1 * gape, sick, nict: max(bite, 0.5 * gape), flare: gape });
  TG_BULGE = 0;
  // sick: a sluggish trail of greenish bubbles from the gills
  if (sick > 0.05 && !H.lod) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const f = fract(t * 0.5 + i / 6), sd = i & 1 ? 1 : -1;
      circ(ctx, 0.5 - f * 1.2, sd * (0.42 + 0.25 * f + 0.05 * sin(t * 2 + i)), 0.025 + 0.03 * f);
    }
    ctx.strokeStyle = H.rgbStr(BUB, 0.55 * sick); ctx.lineWidth = H.lw(1.1); ctx.stroke();
  }
}

// =================================================================================================== Cape fur seal
const FS_W = prof([0, 0.045, 0.06, 0.1, 0.14, 0.152, 0.23, 0.138, 0.31, 0.19, 0.43, 0.27, 0.58, 0.262, 0.76, 0.19, 0.9, 0.11, 1, 0.065]);
const FS_BELLY = [204, 168, 126], FS_WHISK = 'rgba(250,240,214,0.88)', FOAM = [235, 248, 255];
// a seal's hind flipper: narrow at the ankle, fanning out to a scalloped edge of rounded toes (path only);
// outer > 0 makes the outer toes longer, nd = depth of the notches between toes
function hindFlipper(ctx, x, y, a, L, W, toes, outer, nd = 0.84) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.16);
  ctx.quadraticCurveTo(L * 0.5, -W * 0.22, L * 0.9, -W * 0.5);
  for (let i = 0; i < toes; i++) {
    const ya = -W * 0.5 + (i / toes) * W, yb = ya + W / toes, tx = L * (0.98 + outer * abs(2 * i / (toes - 1) - 1) * 0.12);
    ctx.quadraticCurveTo(tx + L * 0.06, (ya + yb) / 2, i === toes - 1 ? L * 0.9 : L * nd, yb);
  }
  ctx.quadraticCurveTo(L * 0.5, W * 0.22, 0, W * 0.16);
  ctx.closePath();
  ctx.restore();
}
function drawFurSeal(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const pp = phaseOf(e, t, 5.4 * (1 + st * 2), 1); // porpoising / flipper-stroke cycle
  const lift = 0.5 + 0.5 * sin(pp); // 1 = top of a porpoising leap, nearest the camera
  const n = H.lod ? 9 : 22;
  if (!H.lod) smudge(ctx, H, SHADE, 0.04 + 0.12 * lift, 0.06 + 0.16 * lift, 1.15, 0.6, 0.32 - 0.12 * lift);
  const sc = 1 + 0.08 * lift;
  ctx.scale(sc * (1 + st * 0.3), sc * (1 - st * 0.2));
  const ph = phaseOf(e, t, 4.5 * (1 + st * 2));
  spine(n, 1.0, 1.92, FS_W, 0.07 + st * 0.25, 3.4, ph, 2.4);
  const tx = SX[n], ty = SY[n], ta = SA[n];
  // flipper stroke: a power stroke while in the water, flippers held back while airborne
  const stroke = sin(pp + 1.2), fa = PI / 2 + 0.75 + 0.42 * stroke + 0.25 * lift;
  const skin = H.mixRGB(c.nuc, c.body, 0.25, C1);
  if (H.lod) {
    outline(ctx, 0.05);
    for (const sd of [-1, 1]) { sp(0.4, sd * 0.8); const x = P[0], y = P[1], a = spA(0.4) + sd * fa; ctx.moveTo(x, y); ctx.lineTo(x + cos(a - sd * 0.12) * 0.6, y + sin(a - sd * 0.12) * 0.6); ctx.lineTo(x + cos(a + sd * 0.35) * 0.25, y + sin(a + sd * 0.35) * 0.25); ctx.closePath(); }
    tailTri(ctx, tx, ty, ta, 0.42, 0.42, 0.25);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  const sF = H.rgbStr(skin, 0.95), sE = H.rgbStr(c.mem, 0.55);
  // spray flung off as it leaps
  if (lift > 0.55) {
    const k = sstep((lift - 0.55) / 0.45);
    ctx.beginPath();
    for (let i = 0; i < (hd ? 12 : 7); i++) { const f = fract(pp / TAU * 2 + hash(i + 4)), sd = i & 1 ? 1 : -1; circ(ctx, 0.5 - 1.6 * f - 0.3 * hash(i + 9), sd * (0.3 + 0.35 * f + 0.15 * hash(i + 1)), 0.022 * (1 - 0.5 * f)); }
    ctx.fillStyle = H.rgbStr(FOAM, 0.75 * k); ctx.fill();
  }
  // hind flippers (paired, pointing back) and the stubby tail between them
  for (const sd of [-1, 1]) {
    sp(0.97, sd * 0.55);
    hindFlipper(ctx, P[0], P[1], ta + sd * (0.3 + 0.08 * sin(ph + sd)), 0.42, 0.24, 4, 0.2);
    ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lw(1); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(tx + 0.02 * sin(ta), ty - 0.04); ctx.quadraticCurveTo(tx + cos(ta) * 0.14, ty + sin(ta) * 0.14, tx - 0.02 * sin(ta), ty + 0.04); ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.body, 0.95); ctx.fill();
  // long front flippers (naked black skin), sweeping in a quick power stroke
  for (const sd of [-1, 1]) {
    sp(0.4, sd * 0.82); const a = spA(0.4) + sd * fa;
    flipper(ctx, P[0], P[1], a, sd, 0.64, 0.2, -0.04 * stroke);
    ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lb(1.1); ctx.stroke();
    if (hd) { // faint digit lines and nails
      ctx.save(); ctx.translate(P[0], P[1]); ctx.rotate(a); ctx.scale(1, sd);
      ctx.beginPath(); for (let i = 0; i < 4; i++) { const y0 = -0.05 + i * 0.03; ctx.moveTo(0.18, y0 * 0.8); ctx.quadraticCurveTo(0.4, y0, 0.58, y0 * 0.4 + 0.01); }
      ctx.strokeStyle = H.rgbStr(c.mem, 0.22); ctx.lineWidth = lw(0.8); ctx.stroke(); ctx.restore();
    }
  }
  // body: dark-brown fur, paler belly showing round the edges
  outline(ctx, 0.05);
  ctx.fillStyle = H.rgbStr(FS_BELLY, 0.95); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.3); ctx.stroke();
  outline(ctx, 0.04, 0.82, 0, n);
  ctx.fillStyle = H.rgbStr(c.body, 0.9); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.1, 0, 1.0, 0.3);
  outline(ctx, 0.02, 0.45, 3, n - 2); ctx.fillStyle = H.rgbStr(c.nuc, 0.3); ctx.fill(); // darker back
  // wet sheen when it surfaces
  if (lift > 0.4) { outline(ctx, 0, 0.3, 2, n - 4); ctx.fillStyle = H.rgbStr(c.mem, 0.12 * (lift - 0.4) / 0.6); ctx.fill(); }
  if (hd) { // fur: short strokes along the back
    ctx.beginPath();
    for (let i = 0; i < 46; i++) { const u = 0.22 + 0.72 * hash(i + 1.3), f = (hash(i * 2.7 + 5) * 2 - 1) * 0.7; sp(u, f); const a = spA(u); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] - cos(a) * 0.05, P[1] - sin(a) * 0.05); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.16); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // head: grizzled crown, little rolled ear flaps, big dark eyes, dark nose, long whiskers
  outline(ctx, 0.05, 0.92, 0, round(n * 0.22));
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.12, C2), 0.55); ctx.fill();
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.21, sd * 0.86); const x = P[0], y = P[1], a = spA(0.21) + sd * (PI - 0.55); ctx.moveTo(x - 0.015, y - sd * 0.02); ctx.quadraticCurveTo(x + cos(a) * 0.06, y + sin(a) * 0.06 + sd * 0.02, x + cos(a) * 0.1, y + sin(a) * 0.1); ctx.lineTo(x + 0.02, y + sd * 0.012); ctx.closePath(); }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.85); ctx.fill();
  sp(0.02, 0); const nx = P[0], ny = P[1];
  ctx.beginPath(); ctx.ellipse(nx + 0.005, ny, 0.032, 0.045, 0, 0, TAU); ctx.fillStyle = H.rgbStr(c.nuc, 0.95); ctx.fill();
  sp(0.06, 0); whiskers(ctx, H, P[0], 0.06, hd ? 6 : 4, 0.27, 0.8, 1.75, FS_WHISK, 0.9);
  for (const sd of [-1, 1]) {
    sp(0.125, sd * 0.68); const x = P[0], y = P[1];
    ctx.beginPath(); ctx.ellipse(x, y, 0.048, 0.04, 0, 0, TAU); ctx.fillStyle = '#0a0604'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + 0.012, y - sd * 0.012, 0.014, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  shine(ctx, H, e, 0.25, 0.55);
}

// =================================================================================================== elephant seal
const ES_W = prof([0, 0.13, 0.06, 0.22, 0.13, 0.285, 0.2, 0.28, 0.3, 0.4, 0.45, 0.56, 0.6, 0.6, 0.74, 0.54, 0.86, 0.4, 0.95, 0.22, 1, 0.12]);
const ES_BELLY = [196, 182, 164], ES_SHIELD = [214, 160, 150], ES_NOSE = [142, 112, 104];
const ES_BLOTCH = [[0.45, 0.4, 0.13], [0.6, -0.35, 0.11], [0.75, 0.15, 0.09], [0.38, -0.2, 0.08], [0.55, 0.05, 0.1], [0.82, -0.25, 0.07]];
function drawElephantSeal(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.25, 1 - st * 0.15);
  const ph = phaseOf(e, t, 1.7 * (1 + st * 2));
  const n = H.lod ? 9 : 22;
  const br = 1 + 0.02 * sin(t * 0.8);
  spine(n, 0.9, 1.95, (u) => ES_W(u) * br, 0.13, 2.4, ph, 3);
  const tx = SX[n], ty = SY[n], ta = SA[n];
  const sw = sin(ph); // both hind flippers sweep side to side together
  const sF = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.35, C1), 0.95), sE = H.rgbStr(c.mem, 0.55);
  // the floppy trunk: swings and droops with every move
  const tw = 0.2 * sin(t * 1.6) + 0.07 * sin(t * 3.7 + 1), tl = 0.34 + 0.025 * sin(t * 2.3);
  const bx = 0.8, ex = bx + cos(tw) * tl, ey = sin(tw) * tl;
  if (H.lod) {
    outline(ctx, 0.05);
    tailTri(ctx, tx, ty, ta, 0.42, 0.5, 0.2);
    ctx.moveTo(ex + 0.12, ey); ctx.arc(ex, ey, 0.12, 0, TAU);
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  smudge(ctx, H, SHADE, 0.05, 0.08, 1.2, 0.85, 0.35);
  // hind flippers: broad fans, the outer toes longest
  for (const sd of [-1, 1]) {
    sp(0.97, sd * 0.55);
    hindFlipper(ctx, P[0], P[1], ta + sd * 0.24 + 0.3 * sw, 0.46, 0.42 * (0.78 + 0.22 * sd * sw), 5, 0.9, 0.9);
    ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lw(1); ctx.stroke();
  }
  // small front flippers with claws, mostly tucked against the body
  for (const sd of [-1, 1]) {
    sp(0.32, sd * 0.9); const x = P[0], y = P[1], a = spA(0.32) + sd * (PI / 2 + 0.85 + 0.12 * sin(t * 1.3 + sd));
    flipper(ctx, x, y, a, sd, 0.34, 0.17, 0.01);
    ctx.fillStyle = sF; ctx.fill(); ctx.strokeStyle = sE; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 4; i++) { const v = -0.05 + i * 0.033, cx = x + cos(a) * 0.31 - sin(a) * v * sd, cy = y + sin(a) * 0.31 + cos(a) * v * sd; ctx.moveTo(cx, cy); ctx.lineTo(cx + cos(a) * 0.04, cy + sin(a) * 0.04); }
    ctx.strokeStyle = 'rgba(30,22,18,0.85)'; ctx.lineWidth = lw(1.1); ctx.lineCap = 'round'; ctx.stroke();
  }
  // the huge rotund body
  outline(ctx, 0.05);
  ctx.fillStyle = H.rgbStr(ES_BELLY, 0.95); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.4); ctx.stroke();
  outline(ctx, 0.04, 0.86, 0, n);
  ctx.fillStyle = H.rgbStr(c.body, 0.9); ctx.fill();
  gfill(ctx, H, c.body, 1, 0, 0, 1.1, 0.62);
  // moulting blotches
  for (let i = 0; i < (hd ? 6 : 4); i++) { const B = ES_BLOTCH[i]; sp(B[0], B[1]); smudge(ctx, H, i & 1 ? c.nuc : c.mem, P[0], P[1], B[2] * 1.6, B[2], i & 1 ? 0.35 : 0.22); }
  // the scarred chest shield and the thick folds of the neck
  for (const sd of [-1, 1]) { sp(0.26, sd * 0.62); smudge(ctx, H, ES_SHIELD, P[0], P[1], 0.2, 0.16, 0.4); }
  ctx.beginPath();
  for (let j = 0; j < 4; j++) { const u = 0.19 + j * 0.04; for (let i = 0; i <= 6; i++) { const f = -0.85 + 1.7 * (i / 6); sp(u + 0.022 * (1 - f * f), f); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); } }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.3); ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < (hd ? 9 : 4); i++) { const u = 0.18 + 0.16 * hash(i + 2), f = (hash(i * 4.1 + 1) * 2 - 1) * 0.7; sp(u, f); const a = 1.2 * hash(i + 8); ctx.moveTo(P[0], P[1]); ctx.lineTo(P[0] + cos(a) * 0.07, P[1] + sin(a) * 0.07); }
  ctx.strokeStyle = H.rgbStr(ES_SHIELD, 0.6); ctx.lineWidth = lw(1.1); ctx.lineCap = 'round'; ctx.stroke();
  // the trunk: a fleshy, wrinkled proboscis flopping over the snout
  {
    const a = tw, ca = cos(a), sa = sin(a), w0 = 0.12, wn = 0.085, wb = 0.12;
    const px = (u, v) => bx + ca * u - sa * v, py = (u, v) => sa * u + ca * v;
    ctx.beginPath();
    ctx.moveTo(px(-0.1, -w0), py(-0.1, -w0));
    ctx.quadraticCurveTo(px(tl * 0.45, -wn), py(tl * 0.45, -wn), px(tl * 0.82, -wb), py(tl * 0.82, -wb));
    ctx.quadraticCurveTo(px(tl + 0.08, -wb * 0.8), py(tl + 0.08, -wb * 0.8), px(tl + 0.08, 0), py(tl + 0.08, 0));
    ctx.quadraticCurveTo(px(tl + 0.08, wb * 0.8), py(tl + 0.08, wb * 0.8), px(tl * 0.82, wb), py(tl * 0.82, wb));
    ctx.quadraticCurveTo(px(tl * 0.45, wn), py(tl * 0.45, wn), px(-0.1, w0), py(-0.1, w0));
    ctx.closePath();
    ctx.fillStyle = H.rgbStr(ES_NOSE, 0.96); ctx.fill();
    ctx.save(); ctx.translate(px(tl * 0.5, 0), py(tl * 0.5, 0)); ctx.rotate(a); ctx.scale(tl * 0.7, 0.13); ctx.fillStyle = H.bodyGrad(ctx, c.body, 0.8); ctx.fill(); ctx.restore();
    ctx.strokeStyle = H.rgbStr(c.mem, 0.7); ctx.lineWidth = lb(1.1); ctx.stroke();
    ctx.beginPath();
    for (let i = 1; i <= (hd ? 5 : 3); i++) { const u = tl * (0.08 + i * (hd ? 0.13 : 0.2)), w = 0.085 + 0.008 * i; ctx.moveTo(px(u, -w), py(u, -w)); ctx.quadraticCurveTo(px(u + 0.035, 0), py(u + 0.035, 0), px(u, w), py(u, w)); }
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.4); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); for (const sd of [-1, 1]) { const x = px(tl + 0.04, sd * 0.042), y = py(tl + 0.04, sd * 0.042); ctx.moveTo(x + 0.02, y); ctx.ellipse(x, y, 0.02, 0.028, a, 0, TAU); }
    ctx.fillStyle = 'rgba(30,18,16,0.85)'; ctx.fill();
  }
  sp(0.07, 0); whiskers(ctx, H, P[0], 0.15, hd ? 5 : 4, 0.26, 0.9, 1.7, 'rgba(240,230,210,0.75)', 0.9);
  for (const sd of [-1, 1]) {
    sp(0.11, sd * 0.66); const x = P[0], y = P[1];
    ctx.beginPath(); ctx.ellipse(x, y, 0.062, 0.05, 0, 0, TAU); ctx.fillStyle = '#0a0606'; ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 0.014, y - sd * 0.016, 0.017, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fill();
  }
  shine(ctx, H, e, 0.1, 0.85);
}

// =================================================================================================== giant manta ray
const MANTA_SKIN = [56, 62, 78];
// body disc and wings in one path: head front, convex leading edges swept back to pointed wingtips, concave trailing
// edges back to the pelvic fins
function mantaDisc(ctx, span, tip, fl) {
  const tx = -0.02 + tip, ty = 1.04 * span, cv = 0.05 * fl;
  const l1x = 0.47, l1y = 0.46 * span, l2x = 0.3 + tip * 0.3, l2y = 0.84 * span;
  const r1x = -0.05 + tip * 0.5, r1y = 0.7 * span + cv, r2x = -0.22, r2y = 0.34 * span;
  ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(0.48, 0.17);
  ctx.bezierCurveTo(l1x, l1y, l2x, l2y, tx, ty);
  ctx.bezierCurveTo(r1x, r1y, r2x, r2y, -0.42, 0.15);
  ctx.lineTo(-0.5, 0); ctx.lineTo(-0.42, -0.15);
  ctx.bezierCurveTo(r2x, -r2y, r1x, -r1y, tx, -ty);
  ctx.bezierCurveTo(l2x, -l2y, l1x, -l1y, 0.48, -0.17);
  ctx.closePath();
}
function drawManta(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.2, 1 - st * 0.1);
  const ph = phaseOf(e, t, 1.25 * (1 + st * 2));
  const fl = sin(ph), span = 1 - 0.1 * fl * fl, tip = -0.07 * fl - 0.03 * cos(ph);
  const tailY = (x) => 0.04 * sin(t * 2 + x * 3) * (x + 0.5);
  if (H.lod) {
    mantaDisc(ctx, span, tip, fl);
    ctx.moveTo(-0.5, 0.025); ctx.lineTo(-0.95, 0); ctx.lineTo(-0.5, -0.025); ctx.closePath();
    ctx.fillStyle = H.cstr(c.body); ctx.fill();
    return;
  }
  smudge(ctx, H, SHADE, 0.06, 0.1, 0.9, 1.15, 0.3);
  // short whip of a tail
  ctx.beginPath(); ctx.moveTo(-0.48, -0.03);
  for (let i = 1; i <= 6; i++) { const x = -0.48 - i * 0.08; ctx.lineTo(x, tailY(x) - 0.03 * (1 - i / 6)); }
  for (let i = 6; i >= 0; i--) { const x = -0.48 - i * 0.08; ctx.lineTo(x, tailY(x) + 0.03 * (1 - i / 6)); }
  ctx.closePath(); ctx.fillStyle = H.rgbStr(c.body, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(0.9); ctx.stroke();
  // pelvic fins at the tail root
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(-0.4, sd * 0.1); ctx.quadraticCurveTo(-0.5, sd * 0.2, -0.6, sd * 0.13); ctx.lineTo(-0.5, sd * 0.04); ctx.closePath(); }
  ctx.fillStyle = H.rgbStr(c.body, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(0.9); ctx.stroke();
  // the cephalic fins: two horn-like lobes either side of the mouth, rolled up while cruising
  for (const sd of [-1, 1]) {
    const cu = 0.03 * sin(t * 0.9 + sd), L = 0.72 + cu;
    ctx.beginPath(); ctx.moveTo(0.44, sd * 0.09);
    ctx.bezierCurveTo(0.54, sd * 0.08, 0.64, sd * 0.09, L, sd * 0.12);
    ctx.quadraticCurveTo(L + 0.025, sd * 0.19, L - 0.06, sd * 0.215);
    ctx.quadraticCurveTo(0.56, sd * 0.235, 0.44, sd * 0.21); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.14, C1), 0.97); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.65); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.48, sd * 0.16); ctx.quadraticCurveTo(0.6, sd * 0.17, L - 0.03, sd * 0.155); ctx.quadraticCurveTo(L - 0.01, sd * 0.18, L - 0.05, sd * 0.19);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.3); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // wings and body disc: black back, a paler rim of the white underside at the edges
  mantaDisc(ctx, span, tip, fl);
  ctx.fillStyle = H.rgbStr(c.mem, 0.75); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.3); ctx.stroke();
  ctx.save(); ctx.translate(0.03, 0); ctx.scale(0.95, 0.93);
  mantaDisc(ctx, span, tip, fl);
  ctx.restore();
  ctx.fillStyle = H.rgbStr(c.body, 0.97); ctx.fill();
  gfill(ctx, H, MANTA_SKIN, 1, 0, 0, 0.8, 1.05 * span);
  // wings catch the light as they rise
  if (fl > 0) { mantaDisc(ctx, span * 0.9, tip, fl); ctx.fillStyle = H.rgbStr(c.mem, 0.08 * fl); ctx.fill(); }
  // white shoulder patches (the black between them makes a "T")
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    ctx.moveTo(0.34, sd * 0.21);
    ctx.quadraticCurveTo(0.33, sd * 0.42 * span, 0.24 + tip * 0.3, sd * 0.62 * span);
    ctx.quadraticCurveTo(0.1, sd * 0.42 * span, -0.02, sd * 0.24);
    ctx.closePath();
  }
  ctx.fillStyle = H.rgbStr(c.nuc, 0.8); ctx.fill();
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.28); ctx.lineWidth = lw(3); ctx.stroke();
  // raised body ridge down the middle, dorsal fin at the tail root
  ctx.beginPath(); ctx.ellipse(0.0, 0, 0.5, 0.17, 0, 0, TAU); ctx.fillStyle = H.rgbStr(c.mem, 0.08); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.38, 0); ctx.quadraticCurveTo(-0.44, -0.03, -0.56, -0.08); ctx.lineTo(-0.52, 0); ctx.closePath();
  ctx.fillStyle = H.rgbStr(c.body, 0.98); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = lw(0.9); ctx.stroke();
  if (hd) { // faint grooves along the wings
    ctx.beginPath(); for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) { const v = 0.3 + i * 0.15; ctx.moveTo(0.12 - v * 0.3, sd * v * 0.5); ctx.quadraticCurveTo(0.02 - v * 0.15, sd * v * 0.95 * span, -0.08 + tip, sd * (0.5 + v * 0.5) * span); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.08); ctx.lineWidth = lw(1); ctx.stroke();
  }
  // wide mouth at the front and the eyes on the sides of the head
  ctx.beginPath(); ctx.moveTo(0.5, -0.13); ctx.quadraticCurveTo(0.56, 0, 0.5, 0.13); ctx.strokeStyle = 'rgba(6,8,12,0.9)'; ctx.lineWidth = lw(2); ctx.stroke();
  for (const sd of [-1, 1]) {
    ctx.beginPath(); ctx.ellipse(0.42, sd * 0.2, 0.035, 0.03, 0, 0, TAU); ctx.fillStyle = '#05060a'; ctx.fill(); ctx.strokeStyle = H.rgbStr(c.mem, 0.6); ctx.lineWidth = lw(0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.43, sd * 0.2 - 0.01, 0.01, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  shine(ctx, H, e, 0.05, 0.9);
}

// =================================================================================================== giant squid (boss)
const GS_X0 = 0.36, GS_X1 = -1.36, GS_EYE = [255, 238, 176], GS_BLOOD = [110, 160, 255], GS_FLESH = [252, 206, 192];
const GS_ARMS = [1.0, 1.18, 1.32, 1.24, 1.24, 1.32, 1.18, 1.0], GS_CL = 0.4, GS_KEEP = 0.16, TS = 20; // club length, stump left at cut = 1
const TB = [new Float32Array((TS + 1) * 2), new Float32Array((TS + 1) * 2)], TQ = new Float32Array((TS + 2) * 2);
function gsW(x) { const v = (GS_X0 - x) / (GS_X0 - GS_X1); return 0.27 * (v < 0.16 ? 0.88 + 0.12 * sin((v / 0.16) * PI / 2) : (1 - ((v - 0.16) / 0.84) ** 1.8) ** 0.7); }
function gsMantle(ctx, by) {
  const m = 18; let q = 0;
  for (let i = 0; i <= m; i++) { const x = GS_X0 + (GS_X1 - GS_X0) * (i / m); OX[q] = x; OY[q] = -gsW(x) * by; q++; }
  for (let i = m - 1; i >= 0; i--) { const x = GS_X0 + (GS_X1 - GS_X0) * (i / m); OX[q] = x; OY[q] = gsW(x) * by; q++; }
  OX[q] = GS_X0 + 0.04; OY[q] = 0; q++;
  smooth(ctx, q);
}
function gsFins(ctx, t, by) {
  ctx.beginPath();
  for (const sd of [-1, 1]) {
    const wv = 0.035 * sin(t * 2.2 + sd * 0.8), wv2 = 0.02 * sin(t * 2.2 + sd * 0.8 - 1.1);
    ctx.moveTo(-0.86, sd * 0.13 * by);
    ctx.bezierCurveTo(-0.95, sd * (0.27 + wv2), -1.06, sd * (0.36 + wv), -1.16, sd * (0.35 + wv));
    ctx.bezierCurveTo(-1.28, sd * (0.3 + wv2), -1.4, sd * 0.13, -1.47, 0);
    ctx.lineTo(-1.2, sd * 0.05); ctx.closePath();
  }
}
// centre line of feeding tentacle i (0 = the −y one, 1 = the +y one) into B; returns its full length
function tentLine(e, t, i, B) {
  const grab = sstep(e.grabK || 0), sd = i ? 1 : -1, codex = e.r === undefined;
  const L = (codex ? 1.9 : 2.3) + 1.25 * grab, ds = L / TS;
  let x = 0.7, y = sd * 0.035, a = sd * (0.1 * (1 - grab) + 0.01 * grab);
  B[0] = x; B[1] = y;
  for (let q = 1; q <= TS; q++) {
    a += (0.13 * sin(t * 1.2 + sd * 1.3 + q * 0.5) - sd * 0.009) * (1 - grab);
    x += cos(a) * ds; y += sin(a) * ds; B[q * 2] = x; B[q * 2 + 1] = y;
  }
  return L;
}
// point (and heading) at arc length l along B → P, returns the heading
function along(B, ds, l) {
  const f = min(TS - 1e-4, max(0, l / ds)), i = floor(f), r = f - i;
  const dx = B[i * 2 + 2] - B[i * 2], dy = B[i * 2 + 3] - B[i * 2 + 1];
  P[0] = B[i * 2] + dx * r; P[1] = B[i * 2 + 1] + dy * r;
  return Math.atan2(dy, dx);
}
const cutOf = (e, i) => clamp01((e.cut && e.cut[i]) || 0);
// club (or stump) position of feeding tentacle i in unit space, at game time T (the same T the game passes to drawSpecies)
export function tentaclePos(e, T, i) {
  const t = T + (e.seed || 0) * 10, B = TB[i ? 1 : 0], L = tentLine(e, t, i, B), st = e.stretch || 0;
  const rem = L * (1 - (1 - GS_KEEP) * cutOf(e, i));
  along(B, L / TS, max(0, rem - (rem > L - GS_CL ? GS_CL * 0.4 : 0)));
  return { x: P[0] * (1 + st * 0.45), y: P[1] * (1 - st * 0.3) };
}
function gsTentacle(ctx, H, c, body, mem, t, e, i, grab, hd) {
  const B = TB[i], L = tentLine(e, t, i, B), ds = L / TS, cut = cutOf(e, i);
  const rem = L * (1 - (1 - GS_KEEP) * cut), sL = L - GS_CL, stalkEnd = min(rem, sL);
  // stalk: copy the centre line up to stalkEnd into TQ, then a gently tapering tube
  let m = 0;
  for (let q = 0; q <= TS && q * ds < stalkEnd; q++) { TQ[m * 2] = B[q * 2]; TQ[m * 2 + 1] = B[q * 2 + 1]; m++; }
  along(B, ds, stalkEnd); TQ[m * 2] = P[0]; TQ[m * 2 + 1] = P[1]; m++;
  if (m >= 2) {
    ctx.beginPath(); tube(ctx, TQ, m - 1, 0.035, 0.018, 1);
    ctx.fillStyle = H.rgbStr(body, 0.92); ctx.fill(); ctx.strokeStyle = H.rgbStr(mem, 0.7); ctx.lineWidth = H.lw(0.9); ctx.stroke();
  }
  // the club: a widened, sucker-studded leaf at the tip (opened wide as it grabs)
  const cf = clamp01((rem - sL) / GS_CL);
  if (cf > 0.01) {
    const cw = 0.065 + 0.05 * grab, np = 7;
    ctx.beginPath();
    for (let q = 0; q <= np; q++) { const v = (q / np) * cf, a = along(B, ds, sL + v * GS_CL), w = cw * sin(PI * (0.08 + 0.92 * v) ** 0.75) + 0.016; const x = P[0] - sin(a) * w, y = P[1] + cos(a) * w; q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let q = np; q >= 0; q--) { const v = (q / np) * cf, a = along(B, ds, sL + v * GS_CL), w = cw * sin(PI * (0.08 + 0.92 * v) ** 0.75) + 0.016; ctx.lineTo(P[0] + sin(a) * w, P[1] - cos(a) * w); }
    ctx.closePath();
    ctx.fillStyle = H.rgbStr(body, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(mem, 0.85); ctx.lineWidth = H.lw(1); ctx.stroke();
    // toothed suckers in rows down the club
    ctx.beginPath();
    const ns = hd ? 8 : 5;
    for (let q = 0; q < ns; q++) {
      const v = 0.12 + 0.76 * (q / (ns - 1)); if (v > cf) break;
      const a = along(B, ds, sL + v * GS_CL), w = cw * sin(PI * v ** 0.75) * 0.45 * (0.5 + grab);
      for (const r of hd ? [-1, 0, 1] : [-1, 1]) circ(ctx, P[0] - sin(a) * w * r, P[1] + cos(a) * w * r, (0.016 + 0.008 * grab) * (r ? 0.85 : 1.1));
    }
    ctx.fillStyle = H.rgbStr(mem, 0.85); ctx.fill();
    if (hd) { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = H.lw(0.8); ctx.stroke(); }
  }
  // a ragged stump where it was bitten off: torn flesh, a haze of blue blood
  if (cut > 0.001) {
    const a = along(B, ds, rem), x = P[0], y = P[1], w = cf > 0.01 ? 0.05 : 0.03, k = clamp01(cut * 8);
    glow(ctx, H, GS_BLOOD, x + cos(a) * 0.06, y + sin(a) * 0.06, 0.22 + 0.06 * sin(t * 2), 0.45 * k);
    ctx.beginPath(); ctx.moveTo(x - sin(a) * w * 1.1, y + cos(a) * w * 1.1);
    for (let q = 0; q <= 4; q++) { const v = (q / 4) * 2 - 1, l = (q & 1 ? 0.012 : 0.05) * k * (0.6 + 0.4 * hash(q + i * 5)); ctx.lineTo(x - sin(a) * w * v * -1 + cos(a) * l, y + cos(a) * w * v * -1 + sin(a) * l); }
    ctx.lineTo(x + sin(a) * w * 1.1, y - cos(a) * w * 1.1); ctx.closePath();
    ctx.fillStyle = H.rgbStr(GS_FLESH, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.7); ctx.lineWidth = H.lw(0.9); ctx.stroke();
  }
}
function drawGiantSquid(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const grab = sstep(e.grabK || 0), eyeK = sstep(e.eyeK || 0), ink = sstep(e.inkK || 0);
  if (e.r === undefined) ctx.translate(-0.45, 0); // codex: centre the long body
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const by = 1 + 0.035 * sin(t * 1.4) - 0.1 * ink;
  const body = ink > 0.01 ? H.mixRGB(c.body, [250, 226, 214], 0.45 * ink, C1) : c.body, mem = c.mem;
  if (ink > 0.01) inkCloud(ctx, H, t, ink, -1.4, 1.4);
  if (H.lod) {
    ctx.fillStyle = H.cstr(c.body);
    gsMantle(ctx, by); ctx.fill();
    gsFins(ctx, t, by);
    ctx.moveTo(0.6, 0.22); ctx.lineTo(1.9 + 1.2 * grab, 0); ctx.lineTo(0.6, -0.22); ctx.closePath(); ctx.fill();
    return;
  }
  if (eyeK > 0.01) glow(ctx, H, GS_EYE, 0.5, 0, 1.0, 0.18 * eyeK, 0, 0.8);
  // fins at the tail end
  gsFins(ctx, t, by);
  ctx.fillStyle = H.rgbStr(body, 0.6); ctx.fill(); ctx.strokeStyle = H.rgbStr(mem, 0.8); ctx.lineWidth = lw(1.1); ctx.stroke();
  if (hd) {
    ctx.beginPath(); for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const x = -0.95 - i * 0.08; ctx.moveTo(x, sd * 0.12); ctx.lineTo(x - 0.1, sd * (0.32 - abs(i - 2.5) * 0.04)); }
    ctx.strokeStyle = H.rgbStr(mem, 0.25); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // 8 long, thick arms with rows of suckers
  const spread = 0.3 + 0.38 * grab;
  ctx.beginPath();
  for (let j = 0; j < 8; j++) {
    const v = (j - 3.5) / 3.5;
    limb(ctx, 0.66, v * 0.13, v * spread, GS_ARMS[j] * (1 - 0.1 * grab), 0.075, 10, t * 0.8, j, -v * (0.22 - 0.3 * grab), 0.075 * (1 - 0.5 * grab));
    ARMB.set(AB.subarray(0, 22), j * 22);
  }
  ctx.fillStyle = H.rgbStr(body, 0.88); ctx.fill(); ctx.strokeStyle = H.rgbStr(mem, 0.72); ctx.lineWidth = lw(0.9); ctx.stroke();
  { // suckers down the middle of each arm
    ctx.beginPath();
    const step = hd ? 1 : 2;
    for (let j = 0; j < 8; j++) for (let q = 1; q < 10; q += step) circ(ctx, ARMB[j * 22 + q * 2], ARMB[j * 22 + q * 2 + 1], 0.016 * (1.15 - 0.85 * q / 10));
    ctx.fillStyle = H.rgbStr(mem, 0.55); ctx.fill();
  }
  if (grab > 0.05 || hd) { ctx.beginPath(); ctx.arc(0.74, 0, 0.035 + 0.05 * grab, 0, TAU); ctx.fillStyle = 'rgba(36,12,14,0.92)'; ctx.fill(); } // beak at the hub
  // the two feeding tentacles: very long, ending in toothed clubs; shot ahead to grab
  for (let i = 0; i < 2; i++) gsTentacle(ctx, H, c, body, mem, t, e, i, grab, hd);
  // the long mantle
  gsMantle(ctx, by);
  ctx.fillStyle = H.rgbStr(body, 0.6); ctx.fill();
  gfill(ctx, H, c.body, 1, -0.5, 0, 0.95, 0.3 * by);
  ctx.strokeStyle = H.rgbStr(mem, 0.95); ctx.lineWidth = lb(1.5); ctx.stroke();
  if (ink > 0.01) { ctx.fillStyle = `rgba(255,246,240,${(0.22 * ink).toFixed(3)})`; ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(0.34, 0); ctx.quadraticCurveTo(-0.5, 0.01, -1.3, 0); ctx.strokeStyle = H.rgbStr(mem, 0.3); ctx.lineWidth = lw(1.4); ctx.stroke();
  {
    const nc = hd ? 60 : 26;
    ctx.beginPath();
    for (let i = 0; i < nc; i++) {
      const x = 0.3 - hash(i + 3.1) * 1.6, hw = gsW(x) * by * 0.8, y = (hash(i * 1.7 + 9.2) * 2 - 1) * hw;
      circ(ctx, x, y, (0.014 + 0.02 * hash(i + 21.4)) * (0.5 + 0.5 * (0.5 + 0.5 * sin(t * 1.7 + i * 1.3))) * (1 - 0.6 * ink));
    }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.6); ctx.fill();
  }
  // head and the biggest eyes in the animal kingdom
  ctx.beginPath(); ctx.ellipse(0.52, 0, 0.2, 0.2, 0, 0, TAU);
  ctx.fillStyle = H.rgbStr(body, 0.6); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.52, 0, 0.22, 0.22);
  ctx.strokeStyle = H.rgbStr(mem, 0.95); ctx.lineWidth = lb(1.2); ctx.stroke();
  for (const sd of [-1, 1]) {
    const x = 0.5, y = sd * 0.205, r = 0.135;
    if (eyeK > 0.01) glow(ctx, H, GS_EYE, x, y, 0.42, 0.75 * eyeK, 1);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = H.rgbStr(H.mixRGB([196, 206, 214], GS_EYE, eyeK, C2)); ctx.fill();
    ctx.strokeStyle = H.rgbStr(c.nuc, 0.85); ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fillStyle = H.rgbStr(H.mixRGB([30, 40, 58], [255, 210, 120], eyeK * 0.6, C3)); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.08, y, r * (0.58 - 0.22 * eyeK), 0, TAU); ctx.fillStyle = '#020306'; ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.32, r * 0.22, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.35, y + r * 0.3, r * 0.09, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  }
  shine(ctx, H, e, -0.3, 0.62);
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
  furseal: {
    name: 'Cape fur seal',
    col: { body: [104, 74, 52], mem: [228, 202, 166], nuc: [34, 22, 16], glow: [230, 190, 150] },
    portraitR: 0.27,
    states: [{ label: 'idle', view: [0.85, 0.12] }, { label: 'porpoising fast (stretch 0.15)', stretch: 0.15, view: [0.85, 0.12] }],
    draw: entry(drawFurSeal),
  },
  elephantseal: {
    name: 'Elephant seal',
    col: { body: [132, 116, 100], mem: [218, 204, 186], nuc: [60, 48, 42], glow: [200, 180, 160] },
    portraitR: 0.26,
    states: [{ label: 'idle', view: [0.85, 0.08] }, { label: 'swimming (stretch 0.15)', stretch: 0.15, view: [0.85, 0.08] }],
    draw: entry(drawElephantSeal),
  },
  mako: {
    name: 'Shortfin mako',
    col: { body: [34, 62, 168], mem: [214, 228, 255], nuc: [8, 14, 46], glow: [90, 140, 255] },
    portraitR: 0.21,
    states: [
      { label: 'idle', view: [0.74, 0.25] },
      { label: 'sprintK 1', sprintK: 1, view: [0.68, 0.35] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.74, 0.2] },
      { label: 'biteK 1', biteK: 1, view: [0.74, 0.12] },
    ],
    draw: entry(drawMako),
  },
  bronzewhaler: {
    name: 'Bronze whaler',
    col: { body: [150, 98, 52], mem: [246, 226, 196], nuc: [64, 40, 20], glow: [240, 180, 110] },
    portraitR: 0.21,
    states: [
      { label: 'idle', view: [0.74, 0.28] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.74, 0.2] },
      { label: 'biteK 1', biteK: 1, view: [0.74, 0.12] },
    ],
    draw: entry(drawBronze),
  },
  sixgill: {
    name: 'Bluntnose sixgill',
    ownVis: true, // fades itself with e.vis: the game skips its usual camouflage fade
    col: { body: [66, 64, 58], mem: [150, 158, 142], nuc: [20, 20, 18], glow: [110, 255, 150] },
    portraitR: 0.21,
    states: [
      { label: 'vis 1 (revealed)', vis: 1, view: [0.68, 0.38] },
      { label: 'vis 0 (hidden)', vis: 0, view: [0.68, 0.38] },
      { label: 'vis 0.4', vis: 0.4, view: [0.68, 0.38] },
      { label: 'tele 1', vis: 1, tele: 1, view: [0.68, 0.38] },
      { label: 'lunge 1', vis: 1, lunge: 1, view: [0.66, 0.3] },
    ],
    draw: entry(drawSixgill),
  },
  manta: {
    name: 'Giant oceanic manta ray',
    col: { body: [30, 34, 44], mem: [160, 172, 196], nuc: [244, 246, 250], glow: [110, 140, 200] },
    portraitR: 0.3,
    portraitRot: -0.2,
    states: [{ label: 'idle', view: [0.9, 0.15] }, { label: 'cruising (stretch 0.15)', stretch: 0.15, view: [0.9, 0.15] }],
    draw: entry(drawManta),
  },
  tigershark: {
    name: 'Tiger shark',
    boss: true,
    col: { body: [126, 118, 96], mem: [230, 222, 198], nuc: [44, 38, 28], glow: [210, 190, 140] },
    portraitR: 0.21,
    states: [
      { label: 'idle', view: [0.72, 0.28] },
      { label: 'gapeK 0.5', gapeK: 0.5, view: [0.72, 0.2] },
      { label: 'gapeK 1', gapeK: 1, view: [0.7, 0.1] },
      { label: 'biteK 1', biteK: 1, view: [0.72, 0.15] },
      { label: 'sickK 0.5', sickK: 0.5, view: [0.72, 0.28] },
      { label: 'sickK 1', sickK: 1, view: [0.72, 0.28] },
    ],
    draw: entry(drawTiger),
  },
  giantsquid: {
    name: 'Giant squid',
    boss: true,
    col: { body: [164, 62, 46], mem: [255, 204, 182], nuc: [92, 22, 18], glow: [255, 140, 110] },
    portraitR: 0.2,
    states: [
      { label: 'idle', view: [0.58, -0.75] },
      { label: 'eyeK 1 (spotted you)', eyeK: 1, view: [0.58, -0.75] },
      { label: 'grabK 0.5', grabK: 0.5, view: [0.5, -1.1] },
      { label: 'grabK 1', grabK: 1, eyeK: 1, view: [0.44, -1.4] },
      { label: 'inkK 1', inkK: 1, view: [0.4, 0.15] },
      { label: 'cut [0.3, 1]', cut: [0.3, 1], view: [0.58, -0.75] },
      { label: 'cut [1, 1] + grabK 1', cut: [1, 1], grabK: 1, view: [0.58, -0.75] },
    ],
    tentaclePos,
    draw: entry(drawGiantSquid),
  },
};
