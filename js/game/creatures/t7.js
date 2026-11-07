// Creature art for the t7 tier: sailfish scale (1 – 4 m), the open blue ocean.
// Each entry: { name, col, portraitR, states, draw(ctx, e, t, s, H, opts) } — see README.md.
// Like t5/t6, every animal is seen from above: +x = heading and the body is mirror-symmetric about the x axis where the
// anatomy allows (dorsal fins lean to −y; the flying fish's longer lower tail lobe, the hammerhead's long upper lobe and
// the thresher's scythe are drawn to one side). Mouths open in the picture plane (the jaws part sideways or the lower
// jaw swings forward) so a bite reads from above.
// Preview-only extra: `e.view = [k, dx]` zooms the drawing out by k and pans it by dx units (dev gallery tiles).
// Codex portraits (e.r undefined) recentre / shorten the long animals (man o' war, thresher, billfish) themselves.

const TAU = Math.PI * 2;
const { sin, cos, min, max, abs, sqrt, PI, atan2, floor, round, hypot } = Math;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const sstep = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const fract = (v) => v - floor(v);
const hash = (i) => fract(sin(i * 127.1 + 311.7) * 43758.5453);
const lerp = (a, b, k) => a + (b - a) * k;
const WHITE = [255, 255, 255];
const SHADE = [3, 4, 9];
const C1 = [0, 0, 0], C2 = [0, 0, 0], C3 = [0, 0, 0], C4 = [0, 0, 0]; // scratch colours for mixRGB

// ---------------------------------------------------------------- shared helpers (same construction as t5 / t6)
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
// a four-pointed sparkle (adds to the current path)
function star(ctx, x, y, r) {
  const q = r * 0.22;
  ctx.moveTo(x + r, y); ctx.lineTo(x + q, y + q); ctx.lineTo(x, y + r); ctx.lineTo(x - q, y + q);
  ctx.lineTo(x - r, y); ctx.lineTo(x - q, y - q); ctx.lineTo(x, y - r); ctx.lineTo(x + q, y - q); ctx.closePath();
}

// Phase integrated over time, so a changing rate (sprinting, gliding, dazed) never makes a fin or tail jump. Two slots
// (tail beat, fins). Stateless callers (portraits, frozen objects) get exactly t·f.
function phaseOf(e, t, f, slot = 0) {
  if (!Object.isExtensible(e)) return t * f;
  const kt = slot ? '_t7t1' : '_t7t0', kp = slot ? '_t7p1' : '_t7p0';
  const dt = t - e[kt];
  if (dt >= 0 && dt < 0.25) e[kp] += dt * f; else e[kp] = t * f;
  e[kt] = t;
  return e[kp];
}

// ---- swimming centre line: integrated from the snout backwards (heading PI + travelling wave). bend curves the whole
// body, hs turns the head (the snout stays put, the body swings behind it), rc curls only the rear half.
const NS = 64;
const SX = new Float32Array(NS + 1), SY = new Float32Array(NS + 1), SA = new Float32Array(NS + 1), SW = new Float32Array(NS + 1);
let SN = 1;
function spine(n, x0, len, wfn, amp, k, ph, pw, bend = 0, hs = 0, rc = 0) {
  SN = n; const ds = len / n; let x = x0, y = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, a = PI + bend * u + amp * u ** pw * sin(ph - k * u) + hs * (1 - u) * (1 - u) + (rc && u > 0.45 ? rc * sstep((u - 0.45) / 0.55) : 0);
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
// a closed patch along the body from u0 to u1 between flank offsets fa(u) and fb(u) (f in −1..1)
function bandPath(ctx, u0, u1, m, fa, fb) {
  let q = 0;
  for (let i = 0; i <= m; i++) { const u = u0 + (u1 - u0) * (i / m); sp(u, fa(u)); OX[q] = P[0]; OY[q] = P[1]; q++; }
  for (let i = m; i >= 0; i--) { const u = u0 + (u1 - u0) * (i / m); sp(u, fb(u)); OX[q] = P[0]; OY[q] = P[1]; q++; }
  smooth(ctx, q);
}
// a ribbon along the midline from u0 to u1 that leans sideways (a long dorsal fin seen from above)
function midRibbon(ctx, u0, u1, nseg, leanFn) {
  ctx.beginPath();
  for (let i = 0; i <= nseg; i++) {
    const u = u0 + (u1 - u0) * (i / nseg); sp(u, 0); const a = spA(u), l = leanFn(i / nseg);
    const x = P[0] - sin(a) * l, y = P[1] + cos(a) * l; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
}
// a polyline along the body at flank offset f from u0 to u1 (adds to the current path)
function flankLine(ctx, u0, u1, m, f) {
  for (let i = 0; i <= m; i++) { sp(u0 + (u1 - u0) * (i / m), f); i ? ctx.lineTo(P[0], P[1]) : ctx.moveTo(P[0], P[1]); }
}
// cheap tail triangle for LOD silhouettes (adds to the current path)
function tailTri(ctx, tx, ty, ta, L, sp0, notch) {
  ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - sp0) * L, ty + sin(ta - sp0) * L);
  ctx.lineTo(tx + cos(ta) * notch, ty + sin(ta) * notch); ctx.lineTo(tx + cos(ta + sp0) * L, ty + sin(ta + sp0) * L); ctx.closePath();
}

// ---- fins & eyes
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
// caudal fin rooted at the origin, local +x pointing away from the body. nk = notch depth (0.3 crescent, 0.45 fork),
// f = flex of the lobes
function tailPath(ctx, L, W, r0, f, nk) {
  const cn = nk < 1 ? nk + 0.14 : nk + 0.08;
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L * 0.42, -W * 0.5, L, -W * 0.62 + f);
  ctx.quadraticCurveTo(L * cn, -W * 0.16 + f * 0.6, L * nk, f * 0.5);
  ctx.quadraticCurveTo(L * cn, W * 0.16 + f * 0.6, L, W * 0.62 + f);
  ctx.quadraticCurveTo(L * 0.42, W * 0.5, 0, r0);
  ctx.closePath();
}
// forked tail with lobes of different length: L1 on −y, L2 on +y
function tailPathAsym(ctx, L1, L2, W1, W2, r0, f, nk) {
  const Lc = min(L1, L2) * nk;
  ctx.beginPath(); ctx.moveTo(0, -r0);
  ctx.quadraticCurveTo(L1 * 0.4, -W1 * 0.45, L1, -W1 + f);
  ctx.quadraticCurveTo(lerp(Lc, L1, 0.35), -W1 * 0.2 + f * 0.6, Lc, f * 0.5);
  ctx.quadraticCurveTo(lerp(Lc, L2, 0.35), W2 * 0.2 + f * 0.6, L2, W2 + f);
  ctx.quadraticCurveTo(L2 * 0.4, W2 * 0.45, 0, r0);
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
// a thin tooth from base (bx, by) to tip (tx, ty), half-width bw at the base (adds to the current path)
function tooth(ctx, bx, by, tx, ty, bw) {
  const dx = tx - bx, dy = ty - by, l = hypot(dx, dy) || 1, px = -dy / l * bw, py = dx / l * bw;
  ctx.moveTo(bx + px, by + py); ctx.quadraticCurveTo(bx + dx * 0.55 + px * 0.4, by + dy * 0.55 + py * 0.4, tx, ty); ctx.lineTo(bx - px, by - py);
}
// motion streaks behind a sprinting body
function streaks(ctx, H, rgb, t, k, x0, spanY) {
  ctx.beginPath();
  for (let j = 0; j < 9; j++) {
    if (j === 4) continue;
    const y = (j - 4) * spanY * (1 + 0.3 * abs(j - 4) / 4), f = fract(t * 2.4 + hash(j + 1) * 3), xa = x0 - abs(j - 4) * 0.25 - f * 2.4, len = (0.45 + 0.4 * hash(j + 7)) * (1 - f * 0.5);
    ctx.moveTo(xa, y); ctx.lineTo(xa - len, y);
  }
  ctx.strokeStyle = H.rgbStr(rgb, 0.45 * k); ctx.lineWidth = H.lw(1.4); ctx.lineCap = 'round'; ctx.stroke();
}
// point on a quadratic Bézier → P
function bez2(x0, y0, x1, y1, x2, y2, u) { const w = 1 - u; P[0] = w * w * x0 + 2 * w * u * x1 + u * u * x2; P[1] = w * w * y0 + 2 * w * u * y1 + u * u * y2; return P; }
// falcate (sickle) fin rooted at (x, y) along a; side mirrors
function sickle(ctx, x, y, a, side, L, W, fill, edge, lwE) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(1, side);
  ctx.beginPath(); ctx.moveTo(0, -W * 0.5);
  ctx.bezierCurveTo(L * 0.4, -W * 0.72, L * 0.82, -W * 0.3, L, W * 0.5);
  ctx.quadraticCurveTo(L * 0.48, W * 0.08, 0, W * 0.5);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = lwE; ctx.stroke(); }
  ctx.restore();
}
// a dorsal fin seen from above: rooted on the midline from u0 to u1, its tip set back by db and leaning to −y by dl
function dorsalPath(ctx, u0, u1, db, dl) {
  sp(u0, 0); const ax = P[0], ay = P[1], a = spA(u0), ca = cos(a), sa = sin(a);
  sp(u1, 0); const bx = P[0], by = P[1];
  const hx = ax - ca * db + sa * dl, hy = ay - sa * db - ca * dl;
  ctx.beginPath(); ctx.moveTo(ax, ay);
  ctx.quadraticCurveTo(ax - ca * db * 0.15 + sa * dl * 0.5, ay - sa * db * 0.15 - ca * dl * 0.5, hx, hy);
  ctx.quadraticCurveTo(hx + (bx - hx) * 0.12, hy + (by - hy) * 0.55, bx, by);
  ctx.closePath();
}
// a fan of fin rays rooted at the origin pointing along local +x (leading ray on −y): the flying fish's wings
const RX = new Float32Array(16), RY = new Float32Array(16);
function fanPath(ctx, L, a0, span, nr, taper, t, wob) {
  ctx.beginPath(); ctx.moveTo(0, -0.015);
  let pl = 0, pa = 0;
  for (let i = 0; i <= nr; i++) {
    const v = i / nr, a = a0 + span * v + wob * sin(t * 9 + i * 1.3), l = L * (1 - taper * v * v) * (0.9 + 0.1 * sin(PI * v));
    const x = cos(a) * l, y = sin(a) * l;
    if (i) { const am = (a + pa) / 2, lm = (l + pl) * 0.5 * 0.95; ctx.quadraticCurveTo(cos(am) * lm, sin(am) * lm, x, y); } else ctx.lineTo(x, y);
    RX[i] = x; RY[i] = y; pl = l; pa = a;
  }
  ctx.lineTo(0, 0.02 + 0.02 * L); ctx.closePath();
}
function fanRays(ctx, nr) { ctx.beginPath(); for (let i = 0; i <= nr; i++) { ctx.moveTo(0, 0); ctx.lineTo(RX[i] * 0.97, RY[i] * 0.97); } }
// small triangle pointing along a, base half-width bw (finlets; adds to the current path)
function finlet(ctx, x, y, a, len, bw) {
  const ca = cos(a), sa = sin(a);
  ctx.moveTo(x - sa * bw, y + ca * bw); ctx.lineTo(x + ca * len, y + sa * len); ctx.lineTo(x + sa * bw, y - ca * bw); ctx.closePath();
}
// dazed: sparkles circling over (x, y)
function dazed(ctx, H, t, k, x, y, rx, ry, sz = 1) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = t * 2.2 + (i / 3) * TAU, px = x + cos(a) * rx, py = y + sin(a) * ry, r = 0.07 * sz * (0.8 + 0.2 * sin(t * 5 + i));
    star(ctx, px, py, r);
    glow(ctx, H, [255, 240, 150], px, py, 0.16 * sz, 0.5 * k);
  }
  ctx.fillStyle = `rgba(255,246,190,${(0.95 * k).toFixed(3)})`; ctx.fill();
}

// =================================================================================================== flying fish
const FF_W = (u) => (u < 0.2 ? 0.075 + 0.115 * sin((u / 0.2) * PI / 2) ** 0.7 : 0.04 + 0.15 * (1 - ((u - 0.2) / 0.8) ** 1.45));
const FF_SILVER = [212, 226, 246], FF_SPRAY = [200, 235, 255];
function drawFlyingfish(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const g = sstep(e.glideK ?? (e.r === undefined ? 1 : 0)); // the codex shows it gliding
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 7 * (1 + st * 2) * (1 - 0.8 * g));
  const n = H.lod ? 8 : 22;
  spine(n, 1.0, 1.75, FF_W, (0.16 + st * 0.3) * (1 - 0.9 * g), 4.4, ph, 2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.05 * sin(ph - 4.4) * (1 - 0.7 * g);
  const wa = PI - 0.12 - (PI / 2 - 0.52) * g; // wing angle off the heading: folded back along the flank → spread wide
  if (H.lod) {
    outline(ctx, 0.05); tailTri(ctx, tx, ty, ta, 0.5, 0.55, 0.22);
    if (g > 0.25) for (const sd of [-1, 1]) { sp(0.22, sd * 0.7); const a = spA(0.22) + sd * wa, L = 1.3 * g; ctx.moveTo(P[0] + 0.12, P[1]); ctx.lineTo(P[0] + cos(a - sd * 0.2) * L, P[1] + sin(a - sd * 0.2) * L); ctx.lineTo(P[0] + cos(a + sd * 0.5) * L * 0.75, P[1] + sin(a + sd * 0.5) * L * 0.75); ctx.lineTo(P[0] - 0.15, P[1]); ctx.closePath(); }
    ctx.fillStyle = H.cstr(c.body); ctx.fill(); return;
  }
  const finF = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.4 - 0.15 * g, C1), 0.55 - 0.12 * g), finE = H.rgbStr(c.mem, 0.7), finR = H.rgbStr(c.nuc, 0.55);
  // spray: droplets and sparkles flung off as it bursts out of the water and glides
  if (g > 0.02) {
    ctx.beginPath();
    for (let i = 0; i < (hd ? 14 : 8); i++) {
      const f = fract(t * 0.9 + hash(i + 1)), sd = i & 1 ? 1 : -1;
      const x = -0.3 - f * 1.6 + (hash(i + 4) - 0.5) * 0.5, y = sd * (0.15 + hash(i + 7) * 1.1) * (0.6 + 0.6 * f);
      circ(ctx, x, y, (0.016 + 0.02 * hash(i + 9)) * (1 - 0.5 * f));
    }
    ctx.fillStyle = H.rgbStr(WHITE, 0.7 * g); ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 5 : 3); i++) {
      const f = fract(t * 0.7 + hash(i + 20)), sd = i & 1 ? -1 : 1, x = 0.1 - f * 1.3 - hash(i + 21) * 0.4, y = sd * (0.55 + hash(i + 22) * 0.75), r = 0.1 * sin(PI * f) + 0.01;
      star(ctx, x, y, r); glow(ctx, H, FF_SPRAY, x, y, r * 2.6, 0.55 * g * sin(PI * f));
    }
    ctx.fillStyle = H.rgbStr(WHITE, 0.95 * g); ctx.fill();
  }
  // forked tail, the lower lobe (+y) longer: it sculls the surface to launch a glide
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  tailPathAsym(ctx, 0.4, 0.62, 0.32, 0.4, 0.035, flex, 0.4);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.3, C2), 0.6); ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
  ctx.restore();
  // pelvic fins: the small hind wings
  for (const sd of [-1, 1]) {
    sp(0.56, sd * 0.6); const a = spA(0.56) + sd * (PI - 0.22 - (PI / 2 - 0.8) * g);
    ctx.save(); ctx.translate(P[0], P[1]); ctx.rotate(a); ctx.scale(1, sd);
    fanPath(ctx, 0.3 + 0.2 * g, -0.12, 0.22 + 0.45 * g, 5, 0.35, t, 0.015 * g);
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
    fanRays(ctx, 5); ctx.strokeStyle = finR; ctx.lineWidth = lw(0.6); ctx.stroke();
    ctx.restore();
  }
  // the big pectoral wings
  const nr = hd ? 11 : 8;
  for (const sd of [-1, 1]) {
    sp(0.22, sd * 0.72); const a = spA(0.22) + sd * wa;
    ctx.save(); ctx.translate(P[0], P[1]); ctx.rotate(a); ctx.scale(1, sd);
    fanPath(ctx, 0.95 + 0.38 * g, -0.12, 0.2 + 0.72 * g, nr, 0.42, t, 0.012 * g);
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
    fanRays(ctx, nr); ctx.strokeStyle = finR; ctx.lineWidth = lw(hd ? 0.8 : 0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(RX[0], RY[0]); ctx.strokeStyle = H.rgbStr(c.nuc, 0.8); ctx.lineWidth = lw(1.5); ctx.stroke();
    ctx.restore();
  }
  // body: dark-blue back, silver flanks
  outline(ctx, 0.06);
  ctx.fillStyle = H.rgbStr(FF_SILVER, 0.84); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.12, 0, 0.95, 0.24);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.95); ctx.lineWidth = lb(1.3); ctx.stroke();
  outline(ctx, 0.03, 0.5, 1, n - 3); ctx.fillStyle = H.rgbStr(c.nuc, 0.62); ctx.fill();
  if (hd) { // fine scale rows
    ctx.beginPath();
    for (let i = 0; i < 12; i++) for (let j = -2; j <= 2; j++) { if (!j) continue; const u = 0.26 + i * 0.05 + (j & 1) * 0.025; sp(u, j * 0.3); const r = spW(u) * 0.14; ctx.moveTo(P[0] + r * 0.2, P[1] - r); ctx.quadraticCurveTo(P[0] - r, P[1], P[0] + r * 0.2, P[1] + r); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.3); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // a silver sheen line along each flank
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.18, 0.85, 8, sd * 0.68);
  ctx.strokeStyle = H.rgbStr(WHITE, 0.4); ctx.lineWidth = lw(1); ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.11, sd * 0.6); eye(ctx, P[0], P[1], 0.066, 'rgb(196,220,248)', lw(1), 0.62); }
  shine(ctx, H, e, 0.3, 0.5);
}

// =================================================================================================== yellowfin tuna
const TUNA_W = (u) => (u < 0.36 ? 0.055 + 0.27 * sin((u / 0.36) * PI / 2) ** 0.72 : 0.032 + 0.293 * (1 - ((u - 0.36) / 0.64) ** 1.55));
const TUNA_YEL = [255, 210, 40], TUNA_SIL = [206, 216, 228];
function drawTuna(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 8.5 * (1 + st * 2));
  const n = H.lod ? 10 : 26;
  spine(n, 1.08, 2.05, TUNA_W, 0.13 + st * 0.2, 2.4, ph, 3.4);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.05 * sin(ph - 2.6);
  if (H.lod) { outline(ctx, 0.06); tailTri(ctx, tx, ty, ta, 0.5, 0.95, 0.15); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return; }
  const dark = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.3, C1), 0.92), edge = H.rgbStr(c.mem, 0.6), yel = H.rgbStr(TUNA_YEL, 0.95), yelE = 'rgba(150,100,10,0.9)';
  // crescent tail: tall and stiff, beating fast (thunniform: only the rear third moves)
  tailFin(ctx, tx, ty, ta, 0.46, 1.02, 0.03, flex, 0.3, H.rgbStr(H.mixRGB(c.nuc, TUNA_YEL, 0.25, C2), 0.9), edge, H.rgbStr(c.mem, 0.22), lb(1.1), lw(0.6), hd ? 5 : 0);
  // the long yellow sickle second-dorsal and anal fins, streaming back on both sides
  for (const sd of [-1, 1]) { sp(0.45, sd * 0.62); sickle(ctx, P[0], P[1], spA(0.45) + sd * (PI - 0.6 + 0.05 * sin(ph - 1.5)), sd, 0.84, 0.13, yel, yelE, lw(1)); }
  // small pelvics, long dark pectorals
  for (const sd of [-1, 1]) { sp(0.33, sd * 0.6); sickle(ctx, P[0], P[1], spA(0.33) + sd * (PI / 2 + 1.25), sd, 0.16, 0.06, dark, edge, lw(0.8)); }
  for (const sd of [-1, 1]) { sp(0.26, sd * 0.9); sickle(ctx, P[0], P[1], spA(0.26) + sd * (PI / 2 + 0.95 + 0.05 * sin(t * 2 + sd)), sd, 0.5, 0.11, dark, edge, lw(1)); }
  // body: silver-yellow flanks
  outline(ctx, 0.07);
  ctx.fillStyle = H.rgbStr(H.mixRGB(TUNA_SIL, c.body, 0.3, C2), 0.9); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.08, 0, 1.1, 0.34);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.3); ctx.stroke();
  // pale spot rows on the lower flank
  if (hd) {
    ctx.beginPath();
    for (let i = 0; i < 14; i++) for (const sd of [-1, 1]) for (let j = 0; j < 2; j++) { sp(0.36 + i * 0.03, sd * (0.82 + j * 0.08)); circ(ctx, P[0], P[1], 0.011); }
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  }
  // dark-blue back
  outline(ctx, 0.04, 0.64, 1, n - 2); ctx.fillStyle = H.rgbStr(c.nuc, 0.84); ctx.fill();
  outline(ctx, 0.02, 0.3, 2, n - 4); ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, SHADE, 0.4, C3), 0.4); ctx.fill();
  // the golden stripe along each flank
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.07, 0.78, 12, sd * 0.72);
  ctx.strokeStyle = H.rgbStr(TUNA_YEL, 0.62); ctx.lineWidth = 0.032; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = H.rgbStr([255, 246, 190], 0.6); ctx.lineWidth = lw(0.8); ctx.stroke();
  // caudal keels on the narrow tail stock
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.9, 1, 3, sd * 0.85);
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.9); ctx.lineWidth = lw(2); ctx.stroke();
  // the row of yellow finlets near the tail: along the back and peeking out along each flank
  ctx.beginPath();
  for (let i = 0; i < (hd ? 8 : 7); i++) {
    const u = 0.64 + i * (hd ? 0.042 : 0.048), a = spA(u);
    sp(u, 0); finlet(ctx, P[0], P[1], a + PI - 0.3, 0.06, 0.016);
    for (const sd of [-1, 1]) { sp(u, sd * 0.9); finlet(ctx, P[0], P[1], a + PI - sd * 0.6, 0.066, 0.017); }
  }
  ctx.fillStyle = yel; ctx.fill(); ctx.strokeStyle = yelE; ctx.lineWidth = lw(0.7); ctx.stroke();
  // first dorsal, folded down into its groove
  dorsalPath(ctx, 0.27, 0.42, 0.22, 0.07);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, SHADE, 0.3, C3), 0.9); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.body, 0.35); ctx.lineWidth = lw(0.8); ctx.stroke();
  // gill cover
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.25, sd * 0.98); const x0 = P[0], y0 = P[1]; sp(0.21, sd * 0.6); const cx = P[0], cy = P[1]; sp(0.15, sd * 0.4); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(1.1); ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.1, sd * 0.68); eye(ctx, P[0], P[1], 0.058, 'rgb(226,214,160)', lw(1), 0.62); }
  shine(ctx, H, e, 0.3, 0.6);
}

// =================================================================================================== mahi-mahi
const MAHI_W = (u) => (u < 0.16 ? 0.2 + 0.085 * sin((u / 0.16) * PI / 2) : 0.035 + 0.25 * (1 - (u - 0.16) / 0.84) ** 1.3);
const MAHI_GOLD = [248, 212, 58], MAHI_BLUE = [50, 130, 255], MAHI_SHEEN = [120, 255, 200];
function drawMahi(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 5.5 * (1 + st * 2.5)), fph = phaseOf(e, t, 3, 1);
  const n = H.lod ? 10 : 26;
  spine(n, 0.95, 1.95, MAHI_W, 0.15 + st * 0.3, 4, ph, 2);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.06 * sin(ph - 4);
  if (H.lod) { outline(ctx, 0.03); tailTri(ctx, tx, ty, ta, 0.55, 0.65, 0.22); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return; }
  const gold = H.rgbStr(MAHI_GOLD, 0.92), finE = H.rgbStr(c.mem, 0.65);
  // deeply forked golden tail
  tailFin(ctx, tx, ty, ta, 0.56, 0.84, 0.04, flex, 0.4, H.rgbStr(H.mixRGB(MAHI_GOLD, c.body, 0.3, C1), 0.72), finE, H.rgbStr(c.nuc, 0.3), lb(1.1), lw(0.6), hd ? 5 : 3);
  // the long anal fin peeking out along both rear flanks
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.48, 0.9, 8, sd * 1.12);
  ctx.strokeStyle = H.rgbStr(MAHI_GOLD, 0.45); ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.stroke();
  // small pectorals and pelvics
  for (const sd of [-1, 1]) { sp(0.3, sd * 0.7); fin(ctx, P[0], P[1], spA(0.3) + sd * (PI / 2 + 1.1 + 0.15 * sin(fph + sd)), sd, 0.18, 0.08, gold, finE, null, lw(0.8), 0, 0); }
  for (const sd of [-1, 1]) { sp(0.21, sd * 0.9); fin(ctx, P[0], P[1], spA(0.21) + sd * (PI / 2 + 1.2 + 0.2 * sin(fph + (sd > 0 ? 0 : 0.8))), sd, 0.26, 0.08, H.rgbStr(MAHI_GOLD, 0.75), finE, H.rgbStr(c.nuc, 0.3), lw(0.9), lw(0.5), hd ? 4 : 0); }
  // body: gold flanks, green back; blunt square forehead
  outline(ctx, 0.03);
  ctx.fillStyle = gold; ctx.fill();
  gfill(ctx, H, H.mixRGB(MAHI_GOLD, c.body, 0.35, C4), 0.9, 0.05, 0, 1.0, 0.3);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.3); ctx.stroke();
  outline(ctx, 0.02, 0.56, 0, n - 2); ctx.fillStyle = H.rgbStr(c.body, 0.82); ctx.fill();
  outline(ctx, 0.01, 0.36, 1, n - 3); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.5, C2), 0.5); ctx.fill();
  // iridescence: a sheen sliding along the body
  glow(ctx, H, MAHI_SHEEN, sp(0.25 + 0.4 * (0.5 + 0.5 * sin(t * 0.9)), 0)[0], P[1], 0.55, 0.22, 0, 0.6);
  // small blue spots
  ctx.beginPath();
  for (let i = 0; i < (hd ? 34 : 16); i++) { const u = 0.08 + hash(i + 3) * 0.8, f = (hash(i * 1.3 + 7) * 2 - 1) * 0.86; sp(u, f); circ(ctx, P[0], P[1], (hd ? 0.016 : 0.02) * (0.7 + 0.5 * hash(i + 11))); }
  ctx.fillStyle = H.rgbStr(MAHI_BLUE, 0.85); ctx.fill();
  // the dorsal fin running the whole length of the back
  midRibbon(ctx, 0.02, 0.9, hd ? 18 : 12, (v) => -0.03 - 0.025 * sin(fph * 1.4 - v * 7));
  ctx.lineCap = 'round'; ctx.strokeStyle = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.25, C3), 0.88); ctx.lineWidth = 0.085; ctx.stroke();
  ctx.strokeStyle = H.rgbStr(MAHI_BLUE, 0.85); ctx.lineWidth = lw(1.3); ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (let i = 0; i < 26; i++) { const u = 0.03 + i * 0.033, l = -0.03 - 0.025 * sin(fph * 1.4 - (u - 0.02) / 0.88 * 7); sp(u, 0); const a = spA(u), x = P[0] - sin(a) * l, y = P[1] + cos(a) * l; ctx.moveTo(x - sin(a) * 0.04 - cos(a) * 0.01, y + cos(a) * 0.04 - sin(a) * 0.01); ctx.lineTo(x + sin(a) * 0.04 + cos(a) * 0.01, y - cos(a) * 0.04 + sin(a) * 0.01); }
    ctx.strokeStyle = H.rgbStr(MAHI_SHEEN, 0.35); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // mouth across the blunt front and the gill cover
  ctx.beginPath();
  sp(0, -0.55); ctx.moveTo(P[0] + 0.02, P[1]); sp(0, 0.55); ctx.quadraticCurveTo(SX[0] + 0.05, SY[0], P[0] + 0.02, P[1]);
  for (const sd of [-1, 1]) { sp(0.24, sd * 0.98); const x0 = P[0], y0 = P[1]; sp(0.2, sd * 0.65); const cx = P[0], cy = P[1]; sp(0.13, sd * 0.5); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.55); ctx.lineWidth = lw(1.1); ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.07, sd * 0.76); eye(ctx, P[0], P[1], 0.055, 'rgb(240,206,90)', lw(1), 0.62); }
  shine(ctx, H, e, 0.3, 0.6);
}

// =================================================================================================== common dolphin
const DOL_W = (u) => (u < 0.34 ? 0.16 + 0.13 * sin((u / 0.34) * PI / 2) ** 0.85 : 0.034 + 0.256 * (1 - ((u - 0.34) / 0.66) ** 1.4));
const DOL_TAN = [238, 198, 112], DOL_PALE = [214, 220, 230], DOL_MOUTH = [200, 96, 110];
const dolCape = (u) => (0.4 + 0.52 * Math.exp(-(((u - 0.5) / 0.085) ** 2))) * (1 - 0.25 * u);
const dolCapeN = (u) => -dolCape(u);
const dolTanA = (u) => 0.96 - 0.5 * sin(PI * clamp01((u - 0.08) / 0.44)), dolTanB = () => 0.97;
const dolGreyA = (u) => 0.96 - 0.45 * sin(PI * clamp01((u - 0.48) / 0.42));
const dolTanAN = (u) => -dolTanA(u), dolTanBN = () => -0.97, dolGreyAN = (u) => -dolGreyA(u);
function flukePath(ctx, span, chord) {
  ctx.beginPath(); ctx.moveTo(0, -0.035);
  ctx.bezierCurveTo(chord * 0.02, -span * 0.5, chord * 0.5, -span * 0.98, chord, -span);
  ctx.quadraticCurveTo(chord * 0.5, -span * 0.32, chord * 0.62, -0.035);
  ctx.lineTo(chord * 0.5, 0); ctx.lineTo(chord * 0.62, 0.035);
  ctx.quadraticCurveTo(chord * 0.5, span * 0.32, chord, span);
  ctx.bezierCurveTo(chord * 0.5, span * 0.98, chord * 0.02, span * 0.5, 0, 0.035);
  ctx.closePath();
}
function drawDolphin(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = clamp01(e.sprintK || 0), bite = sstep(e.biteK || 0), st = (e.stretch || 0) + 0.05 * k;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 3.4 + 5 * k); // the flukes pump up and down: barely any side-to-side wave
  const pump = sin(ph);
  const n = H.lod ? 10 : 26;
  spine(n, 0.95, 2.05, DOL_W, 0.035 * (1 - k), 2.5, t * 0.8, 2);
  const tx = SX[n], ty = SY[n], ta = SA[n];
  const fk = 0.84 + 0.16 * pump; // apparent size of the flukes as they rise towards / sink away from the viewer
  if (H.lod) {
    outline(ctx, 0.07);
    ctx.moveTo(SX[0], -0.06); ctx.lineTo(SX[0] + 0.34, 0); ctx.lineTo(SX[0], 0.06); ctx.closePath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx + cos(ta - 1.1) * 0.5 * fk, ty + sin(ta - 1.1) * 0.5 * fk); ctx.lineTo(tx + cos(ta) * 0.2, ty + sin(ta) * 0.2); ctx.lineTo(tx + cos(ta + 1.1) * 0.5 * fk, ty + sin(ta + 1.1) * 0.5 * fk); ctx.closePath();
    ctx.fillStyle = H.cstr(c.body); ctx.fill(); return;
  }
  const dark = H.rgbStr(c.nuc, 0.92), edge = H.rgbStr(c.mem, 0.7);
  if (k > 0.01) { streaks(ctx, H, c.mem, t, k, 0.4, 0.12); glow(ctx, H, c.glow, -0.2, 0, 1.4, 0.16 * k, 0, 0.35); }
  // horizontal flukes, seen from above as a crescent that swells and shrinks as they pump
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta); ctx.scale(0.7 + 0.3 * fk, fk);
  flukePath(ctx, 0.46, 0.4);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.15 + 0.25 * (0.5 + 0.5 * pump), C1), 0.95); ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lb(1.1); ctx.stroke();
  ctx.restore();
  // flippers (tucked back when sprinting)
  for (const sd of [-1, 1]) { sp(0.27, sd * 0.84); sickle(ctx, P[0], P[1], spA(0.27) + sd * (PI / 2 + 0.75 + 0.55 * k + 0.07 * sin(t * 1.6 + sd)), sd, 0.36, 0.14, dark, edge, lw(1)); }
  // the mouth: the beak's two jaws part sideways, a pink mouth between
  const bx = SX[0] - 0.02, jaw = 0.36 * bite, BL = 0.5;
  if (bite > 0.02) {
    ctx.beginPath(); ctx.moveTo(bx, 0);
    ctx.lineTo(bx + cos(-jaw) * BL * 0.8, sin(-jaw) * BL * 0.8); ctx.quadraticCurveTo(bx + BL * 0.45, 0, bx + cos(jaw) * BL * 0.8, sin(jaw) * BL * 0.8); ctx.closePath();
    ctx.fillStyle = H.rgbStr(DOL_MOUTH, 0.95); ctx.fill();
    smudge(ctx, H, [90, 20, 40], bx + 0.12, 0, 0.14, 0.1 * (0.3 + bite), 0.7 * bite);
  }
  for (const sd of [-1, 1]) {
    ctx.save(); ctx.translate(bx, 0); ctx.rotate(sd * jaw);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, sd * 0.075); ctx.bezierCurveTo(0.14, sd * 0.07, 0.3, sd * 0.05, BL, sd * 0.012); ctx.lineTo(BL + 0.01, 0); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.4, C2), 0.97); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw(1); ctx.stroke();
    if (bite > 0.05) { // rows of small conical teeth along the jaw's inner edge
      ctx.beginPath(); for (let i = 0; i < (hd ? 13 : 9); i++) { const x = 0.12 + i * (hd ? 0.026 : 0.038); tooth(ctx, x, sd * 0.004, x + 0.006, -sd * 0.024 * bite, 0.008); }
      ctx.fillStyle = 'rgba(255,255,250,0.95)'; ctx.fill();
    }
    ctx.restore();
  }
  // body: pale grey flanks
  outline(ctx, 0.1);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, DOL_PALE, 0.4, C3), 0.92); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.0, 0, 1.15, 0.32);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.4); ctx.stroke();
  // the hourglass: a tan-yellow patch on each forward flank, a pale grey one behind, crossed by the dark cape's V
  bandPath(ctx, 0.08, 0.52, 10, dolTanA, dolTanB); ctx.fillStyle = H.rgbStr(DOL_TAN, 0.9); ctx.fill();
  bandPath(ctx, 0.08, 0.52, 10, dolTanAN, dolTanBN); ctx.fill();
  bandPath(ctx, 0.48, 0.9, 10, dolGreyA, dolTanB); ctx.fillStyle = H.rgbStr(DOL_PALE, 0.75); ctx.fill();
  bandPath(ctx, 0.48, 0.9, 10, dolGreyAN, dolTanBN); ctx.fill();
  bandPath(ctx, 0.0, 0.97, hd ? 24 : 16, dolCape, dolCapeN); ctx.fillStyle = dark; ctx.fill();
  ctx.beginPath(); ctx.arc(SX[0] - 0.06, 0, 0.12, -0.75, 0.75);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.35); ctx.lineWidth = lw(1.1); ctx.stroke();
  // dark stripe from the beak to each eye, eyes, blowhole
  ctx.beginPath();
  for (const sd of [-1, 1]) { ctx.moveTo(SX[0] + 0.02, sd * 0.06); sp(0.04, sd * 0.75); const qx = P[0], qy = P[1]; sp(0.1, sd * 0.88); ctx.quadraticCurveTo(qx, qy, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.8); ctx.lineWidth = lw(1.6); ctx.lineCap = 'round'; ctx.stroke();
  for (const sd of [-1, 1]) {
    sp(0.1, sd * 0.88);
    ctx.beginPath(); ctx.ellipse(P[0], P[1], 0.036, 0.026, spA(0.1), 0, TAU); ctx.fillStyle = '#05070c'; ctx.fill();
    ctx.beginPath(); ctx.arc(P[0] + 0.008, P[1] - 0.008, 0.009, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
  }
  sp(0.11, 0); ctx.beginPath(); ctx.arc(P[0] + 0.05, P[1], 0.06, PI - 0.7, PI + 0.7);
  ctx.strokeStyle = 'rgba(8,10,16,0.9)'; ctx.lineWidth = lw(1.8); ctx.stroke();
  // falcate dorsal fin
  dorsalPath(ctx, 0.42, 0.56, 0.26, 0.24);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, SHADE, 0.2, C4), 0.96); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw(1); ctx.stroke();
  if (hd) { // countershading seam and a hint of the melon
    ctx.beginPath(); sp(0.02, -0.5); ctx.moveTo(P[0], P[1]); sp(0.05, 0); const mx = P[0], my = P[1]; sp(0.02, 0.5); ctx.quadraticCurveTo(mx + 0.04, my, P[0], P[1]);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.25); ctx.lineWidth = lw(1); ctx.stroke();
  }
  shine(ctx, H, e, 0.25, 0.7);
}

// =================================================================================================== Portuguese man o' war
const MW_X0 = -0.62, MW_X1 = 0.86;
const MW_CREST = [236, 120, 214], MW_TENT = [110, 160, 255], MW_BEAD = [80, 150, 255], MW_POLYP = [130, 90, 220], MW_FLASH = [190, 235, 255];
const MW_N = 9, MW_K = 22;
const MTX = new Float32Array(MW_N * (MW_K + 1)), MTY = new Float32Array(MW_N * (MW_K + 1));
function mowHalf(v) { return v < 0.68 ? 0.07 + 0.37 * sin((v / 0.68) * PI / 2) ** 0.9 : 0.44 * sqrt(max(0, 1 - ((v - 0.68) / 0.32) ** 2)); }
function floatPath(ctx, m, puff) {
  let q = 0;
  for (let i = 0; i <= m; i++) { const v = i / m; OX[q] = MW_X0 + (MW_X1 - MW_X0) * v; OY[q] = -mowHalf(v) * puff; q++; }
  for (let i = m - 1; i >= 0; i--) { const v = i / m; OX[q] = MW_X0 + (MW_X1 - MW_X0) * v; OY[q] = mowHalf(v) * puff; q++; }
  smooth(ctx, q);
}
function drawManowar(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, sk = sstep(e.stingK || 0);
  const codex = e.r === undefined;
  if (codex) ctx.translate(0.6, 0.05);
  ctx.rotate(0.04 * sin(t * 0.7));
  const NT = H.lod ? 4 : hd ? MW_N : 7, NK = H.lod ? 6 : hd ? MW_K : 14, lenK = codex ? 0.55 : 1;
  for (let i = 0; i < NT; i++) {
    const v = i / (NT - 1), xr = -0.42 + 0.5 * hash(i + 3), yr = (v - 0.5) * 0.5, len = (2.9 + 0.8 * hash(i + 11)) * lenK, o = i * (MW_K + 1);
    for (let k = 0; k <= NK; k++) {
      const u = k / NK;
      MTX[o + k] = xr - len * u;
      MTY[o + k] = yr * (1 + 0.8 * u) + (0.03 + 0.2 * u) * sin(t * 1.1 - u * 6 + i * 1.9) + 0.16 * u * u * sin(t * 0.37 + i * 2.3);
    }
  }
  const tentPath = () => { ctx.beginPath(); for (let i = 0; i < NT; i++) { const o = i * (MW_K + 1); ctx.moveTo(MTX[o], MTY[o]); for (let k = 1; k <= NK; k++) ctx.lineTo(MTX[o + k], MTY[o + k]); } };
  const puff = 1 + 0.035 * sin(t * 1.3);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (H.lod) {
    tentPath(); ctx.strokeStyle = H.rgbStr(sk > 0.3 ? MW_FLASH : MW_TENT, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
    floatPath(ctx, 8, puff); ctx.fillStyle = H.rgbStr(c.body, 0.85); ctx.fill(); return;
  }
  // tentacles: beaded strings of stinging cells trailing far behind
  tentPath();
  if (hd) { ctx.strokeStyle = H.rgbStr(MW_TENT, 0.12); ctx.lineWidth = lw(5); ctx.stroke(); }
  ctx.strokeStyle = H.rgbStr(MW_TENT, 0.5); ctx.lineWidth = lw(hd ? 1.5 : 1.2); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < NT; i++) for (let k = 2; k <= NK; k += hd ? 1 : 2) { const o = i * (MW_K + 1) + k, u = k / NK; circ(ctx, MTX[o], MTY[o], 0.032 * (1.15 - 0.6 * u)); }
  ctx.fillStyle = H.rgbStr(MW_BEAD, 0.88); ctx.fill();
  if (hd) {
    ctx.beginPath(); for (let i = 0; i < NT; i++) for (let k = 2; k <= NK; k++) { const o = i * (MW_K + 1) + k, u = k / NK; circ(ctx, MTX[o] - 0.008, MTY[o] - 0.008, 0.011 * (1.15 - 0.6 * u)); }
    ctx.fillStyle = 'rgba(210,235,255,0.75)'; ctx.fill();
  }
  if (sk > 0.01) { // stinging: the tentacles flash
    ctx.globalCompositeOperation = 'lighter';
    tentPath(); ctx.strokeStyle = H.rgbStr(MW_FLASH, 0.5 * sk); ctx.lineWidth = lw(5); ctx.stroke();
    ctx.strokeStyle = H.rgbStr(WHITE, 0.85 * sk); ctx.lineWidth = lw(1.7); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < NT; i++) for (let k = 3; k <= NK; k += hd ? 4 : 4) { const o = i * (MW_K + 1) + k; glow(ctx, H, MW_FLASH, MTX[o], MTY[o], 0.22, 0.5 * sk * (0.7 + 0.3 * sin(t * 18 + k + i)), 1); }
  }
  // the hanging cluster of feeding and reproductive polyps under the float
  ctx.beginPath();
  for (let j = 0; j < (hd ? 9 : 6); j++) {
    let x = -0.45 + 0.5 * hash(j + 31), y = (hash(j + 37) - 0.5) * 0.5, a = PI + (hash(j + 41) - 0.5) * 0.8;
    ctx.moveTo(x, y);
    for (let q = 0; q < 5; q++) { a += 0.55 * sin(t * 1.3 + j + q * 1.1); x += cos(a) * 0.075; y += sin(a) * 0.075; ctx.lineTo(x, y); }
  }
  ctx.strokeStyle = H.rgbStr(MW_POLYP, 0.55); ctx.lineWidth = lw(hd ? 3.2 : 2.4); ctx.stroke();
  ctx.beginPath();
  for (let j = 0; j < (hd ? 16 : 9); j++) circ(ctx, -0.42 + 0.6 * hash(j + 51), (hash(j + 57) - 0.5) * 0.5, 0.045 + 0.04 * hash(j + 61));
  ctx.fillStyle = H.rgbStr(H.mixRGB(MW_POLYP, MW_CREST, 0.35, C1), 0.42); ctx.fill();
  // the gas-filled float
  floatPath(ctx, 18, puff);
  ctx.fillStyle = H.rgbStr(c.body, 0.4); ctx.fill();
  gfill(ctx, H, c.body, 1.1, 0.12, 0, 0.78, 0.46 * puff);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.5); ctx.stroke();
  ctx.save(); ctx.translate(0.15, 0); ctx.scale(0.82, 0.5); ctx.translate(-0.15, 0);
  floatPath(ctx, 14, puff); ctx.fillStyle = H.rgbStr(c.nuc, 0.22); ctx.fill();
  ctx.restore();
  // the crest (sail): a crinkled ribbon along the top, leaning to +y
  // pleated like a fan, its free edge crimped into scallops
  const CN = hd ? 16 : 10, X0 = -0.52, XL = 1.2;
  const cy = (v) => -0.08 + 0.05 * sin(v * PI * 1.6 + 0.4 + 0.4 * sin(t * 0.6));
  const ch = (v) => 0.03 + 0.2 * sin(PI * v) ** 0.7 * (1 + 0.06 * sin(t * 1.7 + v * 9));
  ctx.beginPath();
  for (let i = 0; i <= CN; i++) { const v = i / CN; i ? ctx.lineTo(X0 + XL * v, cy(v) - 0.03) : ctx.moveTo(X0 + XL * v, cy(v) - 0.03); }
  let ex = X0 + XL - 0.03, ey = cy(1) + ch(1); ctx.lineTo(ex, ey);
  for (let i = CN - 1; i >= 0; i--) { const v = i / CN, x = X0 + XL * v - 0.03, y = cy(v) + ch(v); ctx.quadraticCurveTo((ex + x) / 2, max(ey, y) + 0.05 * sin(PI * (v + 0.5 / CN)) + 0.012, x, y); ex = x; ey = y; }
  ctx.closePath();
  ctx.fillStyle = H.rgbStr(MW_CREST, 0.55); ctx.fill();
  ctx.strokeStyle = 'rgba(255,214,248,0.9)'; ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.beginPath();
  for (let i = 1; i < CN; i++) { const v = i / CN; ctx.moveTo(X0 + XL * v, cy(v) - 0.02); ctx.lineTo(X0 + XL * v - 0.03, cy(v) + ch(v) * 0.97); }
  ctx.strokeStyle = 'rgba(150,50,170,0.45)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); for (let i = 0; i <= 8; i++) { const v = i / 8; i ? ctx.lineTo(X0 + XL * v, cy(v) - 0.03) : ctx.moveTo(X0 + XL * v, cy(v) - 0.03); }
  ctx.strokeStyle = H.rgbStr(MW_BEAD, 0.6); ctx.lineWidth = lw(1.4); ctx.stroke();
  glow(ctx, H, c.glow, 0.1, 0, 0.9, 0.12 + 0.2 * sk, 0, 0.6);
  shine(ctx, H, e, 0.15, 0.7);
}

// =================================================================================================== scalloped hammerhead
const HAM_W = (u) => (u < 0.3 ? 0.12 + 0.16 * sin((u / 0.3) * PI / 2) : 0.05 + 0.23 * (1 - ((u - 0.3) / 0.7) ** 1.35));
// the cephalofoil, +y half, in the head frame (x forward): from the front centre outwards round the eye lobe and back
// along the rear edge towards the neck
const HAM_HEAD = [[0.13, 0], [0.165, 0.1], [0.152, 0.2], [0.125, 0.26], [0.142, 0.34], [0.128, 0.47], [0.088, 0.59], [0.025, 0.66], [-0.045, 0.645], [-0.085, 0.57], [-0.1, 0.43], [-0.13, 0.3], [-0.19, 0.2]];
const HAM_UJ = 0.1;
function hamOutline(ctx) {
  const hx = SX[0], hy = SY[0], ha = SA[0] - PI, ca = cos(ha), sa = sin(ha), NH = HAM_HEAD.length;
  let m = 0;
  for (let i = 0; i < NH; i++) { const lx = HAM_HEAD[i][0], ly = -HAM_HEAD[i][1]; OX[m] = hx + ca * lx - sa * ly; OY[m] = hy + sa * lx + ca * ly; m++; }
  const j0 = round(HAM_UJ * SN);
  for (let i = j0; i <= SN; i++) { const a = SA[i], w = SW[i]; OX[m] = SX[i] - sin(a) * w; OY[m] = SY[i] + cos(a) * w; m++; }
  for (let i = SN; i >= j0; i--) { const a = SA[i], w = SW[i]; OX[m] = SX[i] + sin(a) * w; OY[m] = SY[i] - cos(a) * w; m++; }
  for (let i = NH - 1; i >= 1; i--) { const lx = HAM_HEAD[i][0], ly = HAM_HEAD[i][1]; OX[m] = hx + ca * lx - sa * ly; OY[m] = hy + sa * lx + ca * ly; m++; }
  smooth(ctx, m);
}
function drawHammerhead(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const bite = clamp01(e.biteK || 0), g = sstep(bite);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 3.6 * (1 + st * 2));
  const n = H.lod ? 10 : 26;
  // the head sweeps slowly side to side, scanning the water like a metal detector
  spine(n, 0.84, 2.2, HAM_W, (0.13 + st * 0.2) * (1 - 0.5 * g), 4, ph, 2, 0, 0.2 * sin(t * 1.3) * (1 - 0.7 * g));
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.07 * sin(ph - 4);
  const hx = SX[0], hy = SY[0], ha = SA[0] - PI;
  if (H.lod) { hamOutline(ctx); tailTri(ctx, tx, ty, ta, 0.6, 0.55, 0.25); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return; }
  const finF = H.rgbStr(c.body, 0.92), finE = H.rgbStr(c.mem, 0.7), dk = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.25, C1), 0.96);
  // heterocercal tail: the long upper lobe on −y
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ta);
  tailPathAsym(ctx, 0.74, 0.4, 0.44, 0.32, 0.05, flex, 0.45);
  ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lb(1.1); ctx.stroke();
  ctx.restore();
  // pelvic fins and falcate pectorals
  for (const sd of [-1, 1]) { sp(0.66, sd * 0.8); sickle(ctx, P[0], P[1], spA(0.66) + sd * (PI / 2 + 0.95), sd, 0.17, 0.08, finF, finE, lw(1)); }
  for (const sd of [-1, 1]) { sp(0.3, sd * 0.88); sickle(ctx, P[0], P[1], spA(0.3) + sd * (PI / 2 + 0.6 + 0.07 * sin(t * 1.8 + sd)), sd, 0.56, 0.22, finF, finE, lw(1.1)); }
  // the jaw swings forward from under the hammer: dark gape with serrated teeth ahead of its front edge
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ha);
  if (g > 0.01) {
    const d = 0.18 * g, cx = -0.06;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const p2 = -1.15 + 2.3 * (i / 10); const x = cx + (0.2 + d) * cos(p2), y = 0.17 * sin(p2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fillStyle = 'rgb(58,16,24)'; ctx.fill();
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const p2 = -1.15 + 2.3 * (i / 10); const x = cx + (0.26 + d) * cos(p2), y = 0.19 * sin(p2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    for (let i = 10; i >= 0; i--) { const p2 = -1.15 + 2.3 * (i / 10); ctx.lineTo(cx + (0.2 + d) * cos(p2), 0.17 * sin(p2)); }
    ctx.closePath(); ctx.fillStyle = H.rgbStr(c.mem, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.body, 0.9); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < (hd ? 11 : 7); i++) { const p2 = -0.95 + 1.9 * (i / ((hd ? 11 : 7) - 1)), bx = cx + (0.2 + d) * cos(p2), by = 0.17 * sin(p2); tooth(ctx, bx, by, bx - cos(p2) * 0.06 * g, by - sin(p2) * 0.05 * g, 0.016); }
    ctx.fillStyle = 'rgba(255,255,250,0.98)'; ctx.fill();
  }
  ctx.restore();
  // body and hammer as one outline
  hamOutline(ctx);
  ctx.fillStyle = H.rgbStr(c.body, 0.82); ctx.fill();
  gfill(ctx, H, c.body, 1, -0.05, 0, 1.25, 0.4);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.4); ctx.stroke();
  outline(ctx, 0.0, 0.5, 2, n - 2); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.3, C2), 0.32); ctx.fill();
  // gill slits
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { sp(0.2 + i * 0.022, sd * 0.98); ctx.moveTo(P[0], P[1]); sp(0.2 + i * 0.022 - 0.008, sd * 0.72); ctx.lineTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.42); ctx.lineWidth = lw(1); ctx.stroke();
  // the hammer's details: scalloped front groove, nostrils near the lobes, electric-sense pores
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ha);
  ctx.beginPath();
  for (const sd of [-1, 1]) { ctx.moveTo(0.1, sd * 0.42); ctx.quadraticCurveTo(0.12, sd * 0.5, 0.08, sd * 0.56); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.7); ctx.lineWidth = lw(1.4); ctx.stroke();
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(-0.02, sd * 0.08); ctx.quadraticCurveTo(-0.03, sd * 0.35, -0.06, sd * 0.56); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.28); ctx.lineWidth = lw(1); ctx.stroke();
  if (hd) {
    ctx.beginPath(); for (let i = 0; i < 28; i++) { const v = (i / 27) * 2 - 1; circ(ctx, 0.11 - 0.06 * v * v + 0.015 * hash(i), v * 0.5, 0.006); }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.5); ctx.fill();
  }
  if (g > 0.1) { // upper teeth peeking past the hammer's front edge
    ctx.beginPath(); for (let i = 0; i < (hd ? 9 : 6); i++) { const p2 = -0.85 + 1.7 * (i / ((hd ? 9 : 6) - 1)), bx = -0.06 + 0.19 * cos(p2), by = 0.16 * sin(p2); tooth(ctx, bx, by, bx + cos(p2) * 0.05 * g, by + sin(p2) * 0.04 * g, 0.014); }
    ctx.fillStyle = 'rgba(255,255,250,0.95)'; ctx.fill();
  }
  // eyes at the tips of the hammer (the third eyelid flicks over them as it bites)
  for (const sd of [-1, 1]) {
    const x = 0.02, y = sd * 0.632;
    ctx.beginPath(); ctx.ellipse(x, y, 0.038, 0.03, 0, 0, TAU); ctx.fillStyle = 'rgb(214,190,110)'; ctx.fill(); ctx.strokeStyle = 'rgba(8,16,26,0.8)'; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(x + 0.004, y, 0.026, 0.01, 0, 0, TAU); ctx.fillStyle = '#04060c'; ctx.fill();
    if (g > 0.01) { ctx.beginPath(); ctx.ellipse(x, y, 0.04, 0.032, 0, 0, TAU); ctx.fillStyle = `rgba(236,240,244,${(0.88 * g).toFixed(3)})`; ctx.fill(); }
  }
  ctx.restore();
  // the tall dorsal fin and the small second dorsal
  dorsalPath(ctx, 0.3, 0.46, 0.32, 0.34);
  ctx.fillStyle = dk; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
  dorsalPath(ctx, 0.74, 0.8, 0.07, 0.06);
  ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(0.9); ctx.stroke();
  shine(ctx, H, e, 0.3, 0.6);
}

// =================================================================================================== blue marlin
const MAR_W = (u) => (u < 0.3 ? 0.065 + 0.235 * sin((u / 0.3) * PI / 2) ** 0.8 : 0.034 + 0.266 * (1 - ((u - 0.3) / 0.7) ** 1.5));
const MAR_SIL = [196, 212, 236], MAR_STRIPE = [176, 222, 255], MAR_ELEC = [70, 200, 255];
function marStripes(ctx, hd) {
  ctx.beginPath();
  for (let j = 0; j < (hd ? 12 : 9); j++) {
    const u = 0.26 + j * (hd ? 0.052 : 0.07);
    for (const sd of [-1, 1]) { sp(u - 0.004, sd * 0.3); ctx.moveTo(P[0], P[1]); sp(u + 0.01, sd * 0.68); const qx = P[0], qy = P[1]; sp(u + 0.004, sd * 0.97); ctx.quadraticCurveTo(qx, qy, P[0], P[1]); }
  }
}
function drawMarlin(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const k = clamp01(e.sprintK || 0), bite = sstep(e.biteK || 0), st = (e.stretch || 0) + 0.06 * k;
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 4.5 + 6 * k);
  const n = H.lod ? 10 : 26;
  spine(n, 0.9, 2.1, MAR_W, (0.12 + st * 0.2) * (1 - 0.85 * k), 3, ph, 2.6);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.06 * sin(ph - 3) * (1 - 0.5 * k);
  const hx = SX[0], hy = SY[0], ha = SA[0] - PI;
  if (H.lod) {
    outline(ctx, 0.04);
    ctx.moveTo(hx, hy - 0.05); ctx.lineTo(hx + cos(ha) * 0.95, hy + sin(ha) * 0.95); ctx.lineTo(hx, hy + 0.05); ctx.closePath();
    tailTri(ctx, tx, ty, ta, 0.56, 1.0, 0.16); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return;
  }
  const dark = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.55, C1), 0.94), edge = H.rgbStr(c.mem, 0.65);
  if (k > 0.01) { streaks(ctx, H, MAR_STRIPE, t, k, 0.3, 0.12); glow(ctx, H, MAR_ELEC, -0.1, 0, 1.6, 0.22 * k, 0, 0.4); }
  // tall crescent tail
  tailFin(ctx, tx, ty, ta, 0.56, 1.2, 0.03, flex, 0.28, dark, edge, H.rgbStr(c.mem, 0.22), lb(1.1), lw(0.6), hd ? 5 : 0);
  // long thin pelvic fins, then the rigid scythe pectorals (pressed flat when sprinting)
  ctx.beginPath(); for (const sd of [-1, 1]) { sp(0.33, sd * 0.55); ctx.moveTo(P[0], P[1]); const a = spA(0.33) + sd * (PI - 0.3 + 0.15 * k); ctx.quadraticCurveTo(P[0] + cos(a) * 0.2, P[1] + sin(a) * 0.2, P[0] + cos(a + sd * 0.12) * 0.4, P[1] + sin(a + sd * 0.12) * 0.4); }
  ctx.strokeStyle = dark; ctx.lineWidth = lw(1.6); ctx.lineCap = 'round'; ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.25, sd * 0.88); sickle(ctx, P[0], P[1], spA(0.25) + sd * (PI / 2 + 0.75 + (PI / 2 - 0.9) * k), sd, 0.5 * (1 - 0.15 * k), 0.11, dark, edge, lw(1)); }
  // the jaws: the spear (upper jaw) and the short lower jaw part sideways
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ha);
  const jl = 0.5 * bite, ju = -0.12 * bite;
  if (bite > 0.02) {
    ctx.beginPath(); ctx.moveTo(-0.14, 0); ctx.lineTo(-0.12 + cos(ju) * 0.55, sin(ju) * 0.55); ctx.quadraticCurveTo(0.2, 0.05 * bite, -0.12 + cos(jl) * 0.44, sin(jl) * 0.44); ctx.closePath();
    ctx.fillStyle = 'rgb(116,32,52)'; ctx.fill();
    smudge(ctx, H, [40, 8, 20], 0.0, 0.04 * bite, 0.14, 0.08 + 0.06 * bite, 0.8 * bite);
  }
  ctx.save(); ctx.translate(-0.12, 0); ctx.rotate(jl);
  ctx.beginPath(); ctx.moveTo(0, -0.045); ctx.quadraticCurveTo(0.25, -0.03, 0.44, -0.004); ctx.lineTo(0.44, 0.004); ctx.quadraticCurveTo(0.25, 0.04, 0, 0.055); ctx.closePath();
  ctx.fillStyle = H.rgbStr(MAR_SIL, 0.95); ctx.fill(); ctx.strokeStyle = H.rgbStr(c.nuc, 0.5); ctx.lineWidth = lw(0.9); ctx.stroke();
  if (bite > 0.1) { ctx.beginPath(); for (let i = 0; i < 7; i++) { const x = 0.06 + i * 0.045; ctx.moveTo(x, -0.03); ctx.lineTo(x + 0.012, -0.045); } ctx.strokeStyle = 'rgba(255,255,250,0.8)'; ctx.lineWidth = lw(0.8); ctx.stroke(); }
  ctx.restore();
  ctx.rotate(ju);
  ctx.beginPath(); ctx.moveTo(-0.08, -0.055); ctx.quadraticCurveTo(0.45, -0.032, 0.95, -0.004); ctx.lineTo(0.97, 0); ctx.lineTo(0.95, 0.004); ctx.quadraticCurveTo(0.45, 0.032, -0.08, 0.055); ctx.closePath();
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.35, C2), 0.97); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -0.012); ctx.quadraticCurveTo(0.45, -0.01, 0.9, -0.002); ctx.strokeStyle = H.rgbStr(c.mem, 0.45); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.restore();
  // body: silver flanks, cobalt back
  outline(ctx, 0.04);
  ctx.fillStyle = H.rgbStr(MAR_SIL, 0.9); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.0, 0, 1.15, 0.32);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.3); ctx.stroke();
  outline(ctx, 0.02, 0.72, 1, n - 2); ctx.fillStyle = H.rgbStr(c.body, 0.9); ctx.fill();
  outline(ctx, 0.01, 0.34, 2, n - 3); ctx.fillStyle = H.rgbStr(c.nuc, 0.45); ctx.fill();
  // pale-blue vertical stripes; they light up electric blue as it hunts
  marStripes(ctx, hd);
  ctx.strokeStyle = H.rgbStr(MAR_STRIPE, 0.42 + 0.4 * k); ctx.lineWidth = lw(1.8); ctx.lineCap = 'round'; ctx.stroke();
  if (k > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = H.rgbStr(MAR_ELEC, 0.5 * k); ctx.lineWidth = lw(4.5); ctx.stroke();
    ctx.strokeStyle = H.rgbStr(WHITE, 0.6 * k); ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    for (let j = 0; j < 5; j++) { sp(0.3 + j * 0.12, 0); glow(ctx, H, MAR_ELEC, P[0], P[1], 0.42, 0.35 * k * (0.75 + 0.25 * sin(t * 9 + j * 2)), 0, 1.3); }
  }
  // lateral line, caudal keels
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.12, 0.95, 10, sd * 0.85);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.28); ctx.lineWidth = lw(0.9); ctx.stroke();
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.9, 1, 3, sd * 0.9);
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.9); ctx.lineWidth = lw(2); ctx.stroke();
  // the high pointed dorsal: a tall front lobe, then a low ridge down the back (folded flat into its groove when sprinting)
  {
    const fold = 1 - 0.85 * k;
    sp(0.17, 0); const ax = P[0], ay = P[1], a = spA(0.17), ca = cos(a), sa = sin(a);
    const hx2 = ax - ca * (0.16 + 0.12 * k) + sa * 0.56 * fold, hy2 = ay - sa * (0.16 + 0.12 * k) - ca * 0.56 * fold;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + sa * 0.25 * fold, ay - ca * 0.25 * fold, hx2, hy2);
    sp(0.3, -0.5 * fold - 0.05); ctx.quadraticCurveTo((hx2 + P[0]) / 2 + 0.04, (hy2 + P[1]) / 2, P[0], P[1]);
    for (let i = 1; i <= 5; i++) { const u = 0.3 + i * 0.065; sp(u, -(0.45 - 0.2 * (i / 5)) * fold - 0.05); ctx.lineTo(P[0], P[1]); }
    sp(0.66, 0); ctx.lineTo(P[0], P[1]); ctx.closePath();
    ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.3, C3), 0.92); ctx.fill(); ctx.strokeStyle = H.rgbStr(MAR_STRIPE, 0.7); ctx.lineWidth = lw(1.1); ctx.stroke();
    if (hd) { ctx.beginPath(); for (let i = 0; i < 9; i++) { const u = 0.19 + i * 0.05; sp(u, 0); ctx.moveTo(P[0], P[1]); sp(u + 0.03, -(i < 2 ? 1.6 - i * 0.5 : 0.45) * fold); ctx.lineTo(P[0], P[1]); } ctx.strokeStyle = H.rgbStr(c.mem, 0.25); ctx.lineWidth = lw(0.7); ctx.stroke(); }
  }
  // gill cover and eyes
  ctx.beginPath();
  for (const sd of [-1, 1]) { sp(0.22, sd * 0.98); const x0 = P[0], y0 = P[1]; sp(0.17, sd * 0.6); const cx = P[0], cy = P[1]; sp(0.11, sd * 0.42); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.5); ctx.lineWidth = lw(1.1); ctx.stroke();
  for (const sd of [-1, 1]) { sp(0.08, sd * 0.72); eye(ctx, P[0], P[1], 0.05, 'rgb(120,170,230)', lw(1), 0.64); }
  shine(ctx, H, e, 0.3, 0.6);
}

// =================================================================================================== thresher shark (boss)
const THR_W = (u) => (u < 0.3 ? 0.31 * sqrt(max(0, 1 - 0.8 * ((0.3 - u) / 0.3) ** 2)) : 0.05 + 0.26 * (1 - ((u - 0.3) / 0.7) ** 1.25));
const TB_N = 24, TBX = new Float32Array(TB_N + 1), TBY = new Float32Array(TB_N + 1), TBA = new Float32Array(TB_N + 1);
const THR_LEN = 2.45, THR_IRIS = [150, 168, 120], THR_BELLY = [236, 236, 242];
// the long upper tail lobe: centre line from the tail root. It turns at the root towards the heading D (absolute), with
// a gentle scythe curve and the swimming wave running down it.
function thrBlade(nt, D, wave, ph) {
  const ds = THR_LEN / nt, a0 = SA[SN], d = D - a0;
  let x = SX[SN], y = SY[SN];
  for (let i = 0; i <= nt; i++) {
    const v = i / nt, a = a0 + d * sstep(v / 0.24) - 0.22 * v * v + wave * v ** 1.2 * sin(ph - 2.6 - v * 3.2);
    TBX[i] = x; TBY[i] = y; TBA[i] = a;
    x += cos(a) * ds; y += sin(a) * ds;
  }
}
const thrBW = (v) => 0.1 * (1 - v) ** 0.85 * (v < 0.06 ? 0.55 + 0.45 * (v / 0.06) : 1) + 0.006;
function bladePath(ctx, nt) {
  let q = 0;
  for (let i = 0; i <= nt; i++) { const v = i / nt, a = TBA[i], w = thrBW(v) * 0.7; OX[q] = TBX[i] + sin(a) * w; OY[q] = TBY[i] - cos(a) * w; q++; }
  for (let i = nt; i >= 0; i--) { const v = i / nt, a = TBA[i], w = thrBW(v) * (v > 0.84 && v < 0.9 ? 0.5 : 1.3); OX[q] = TBX[i] - sin(a) * w; OY[q] = TBY[i] + cos(a) * w; q++; }
  smooth(ctx, q);
}
function drawThresher(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd, st = e.stretch || 0;
  const wind = sstep(e.windK || 0), whip = sstep(e.whipK || 0), sk = sstep(e.stunK || 0);
  const codex = e.r === undefined;
  if (codex) ctx.translate(0.95, 0.15);
  if (st) ctx.scale(1 + st * 0.4, 1 - st * 0.3);
  if (sk > 0.01) { ctx.translate(0.03 * sin(t * 0.9) * sk, 0.04 * sin(t * 0.7) * sk); ctx.rotate(0.12 * sk * sin(t * 0.6)); ctx.scale(1, 1 - 0.06 * sk); }
  const slow = 1 - 0.75 * sk;
  const ph = phaseOf(e, t, 3.2 * slow * (1 + st * 2)), fph = phaseOf(e, t, 1.8 * slow, 1);
  const n = H.lod ? 10 : 26, nt = H.lod ? 8 : hd ? TB_N : 16;
  // windK coils the body into a C towards +y and folds the scythe forward along that flank; whipK coils it harder and
  // lashes the scythe across, over and past the head towards −y
  const cw = max(wind, whip);
  spine(n, 1.0, 2.0, THR_W, (0.11 + st * 0.2) * (1 - 0.7 * cw), 4, ph, 2, -0.75 * cw - 0.2 * whip, 0, -0.85 * cw - 0.35 * whip);
  // the scythe's heading: trailing (PI) → cocked forward on +y → lashed past the head
  const Dw = PI + (0.25 - PI) * wind, D = Dw + (-0.85 - Dw) * whip, wave = 0.16 * (1 - 0.8 * cw) * slow;
  if (H.lod) {
    outline(ctx, 0.1);
    thrBlade(nt, D, wave, ph); const tl = nt;
    ctx.moveTo(TBX[0], TBY[0] - 0.06); ctx.lineTo(TBX[tl], TBY[tl]); ctx.lineTo(TBX[0], TBY[0] + 0.06); ctx.closePath();
    ctx.fillStyle = H.cstr(c.body); ctx.fill(); return;
  }
  const finF = H.rgbStr(c.body, 0.94), finE = H.rgbStr(c.mem, 0.7), dk = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.3, C1), 0.96);
  // the lash: a motion-blur arc swept by the tail since it left its cocked position, and fading ghost tails
  const blur = sstep(whip * 1.6) * (1 - 0.35 * sstep((whip - 0.6) / 0.4));
  if (blur > 0.01) {
    thrBlade(nt, D, 0, ph);
    const rx = TBX[0], ry = TBY[0], aN = atan2(TBY[nt] - ry, TBX[nt] - rx), rr = hypot(TBX[nt] - rx, TBY[nt] - ry);
    const span = min(1.2, (Dw - D) * 0.75);
    for (let j = 0; j < 5; j++) { // the fan fades away from the blade (j = 0 hugs it)
      const a0 = aN + span * (j / 5) ** 1.3, a1 = aN + span * ((j + 1) / 5) ** 1.3;
      ctx.beginPath(); ctx.arc(rx, ry, rr * 1.02, a0, a1); ctx.arc(rx, ry, rr * (0.36 + 0.08 * j), a1, a0, true); ctx.closePath();
      ctx.fillStyle = H.rgbStr(c.mem, 0.2 * (1 - j / 5) ** 1.5 * blur); ctx.fill();
    }
    ctx.beginPath();
    for (let j = 0; j < 3; j++) { const r = rr * (0.7 + 0.15 * j); ctx.moveTo(rx + cos(aN + 0.04) * r, ry + sin(aN + 0.04) * r); ctx.arc(rx, ry, r, aN + 0.04, aN + span * (0.5 + 0.2 * j)); }
    ctx.strokeStyle = H.rgbStr(WHITE, 0.32 * blur); ctx.lineWidth = lw(1.2); ctx.lineCap = 'round'; ctx.stroke();
    for (let j = 1; j <= 2; j++) { thrBlade(nt, D + span * 0.33 * j, 0, ph); bladePath(ctx, nt); ctx.fillStyle = H.rgbStr(c.body, (0.3 - 0.11 * j) * blur); ctx.fill(); }
  }
  // the small lower tail lobe
  {
    const x0 = SX[n], y0 = SY[n], a0 = SA[n] + 0.55;
    ctx.beginPath(); ctx.moveTo(x0 + sin(a0) * 0.04, y0 - cos(a0) * 0.04); ctx.quadraticCurveTo(x0 + cos(a0) * 0.18, y0 + sin(a0) * 0.18, x0 + cos(a0 + 0.2) * 0.3, y0 + sin(a0 + 0.2) * 0.3);
    ctx.quadraticCurveTo(x0 + cos(a0 + 0.5) * 0.12, y0 + sin(a0 + 0.5) * 0.12, x0 - sin(a0) * 0.04, y0 + cos(a0) * 0.04); ctx.closePath();
    ctx.fillStyle = finF; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
  }
  // pelvic fins and the long falcate pectorals
  for (const sd of [-1, 1]) { sp(0.64, sd * 0.8); sickle(ctx, P[0], P[1], spA(0.64) + sd * (PI / 2 + 0.95), sd, 0.18, 0.09, finF, finE, lw(1)); }
  for (const sd of [-1, 1]) { sp(0.3, sd * 0.88); sickle(ctx, P[0], P[1], spA(0.3) + sd * (PI / 2 + 0.6 + 0.08 * sin(fph + sd)), sd, 0.72, 0.24, finF, finE, lb(1.1)); }
  // body: compact, purplish grey, white belly showing above the pectorals
  outline(ctx, 0.1);
  ctx.fillStyle = H.rgbStr(c.body, 0.84); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.05, 0, 1.1, 0.36);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.9); ctx.lineWidth = lb(1.5); ctx.stroke();
  bandPath(ctx, 0.3, 0.62, 8, (u) => 0.98 - 0.22 * sin(PI * (u - 0.3) / 0.32), () => 1.0); ctx.fillStyle = H.rgbStr(THR_BELLY, 0.6); ctx.fill();
  bandPath(ctx, 0.3, 0.62, 8, (u) => -0.98 + 0.22 * sin(PI * (u - 0.3) / 0.32), () => -1.0); ctx.fill();
  outline(ctx, 0.04, 0.5, 1, n - 2); ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.35, C2), 0.4); ctx.fill();
  if (sk > 0.01) { // rolled a little: its pale belly shows along one flank
    ctx.beginPath(); flankLine(ctx, 0.12, 0.9, 10, 0.92);
    ctx.strokeStyle = H.rgbStr(THR_BELLY, 0.55 * sk); ctx.lineWidth = 0.06; ctx.lineCap = 'round'; ctx.stroke();
  }
  // gill slits, lateral line, a short snout with nostrils
  ctx.beginPath();
  for (const sd of [-1, 1]) for (let i = 0; i < 5; i++) { sp(0.22 + i * 0.02, sd * 0.98); ctx.moveTo(P[0], P[1]); sp(0.22 + i * 0.02 - 0.008, sd * 0.76); ctx.lineTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.45); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); for (const sd of [-1, 1]) { sp(0.02, sd * 0.45); ctx.moveTo(P[0], P[1]); sp(0.04, sd * 0.6); ctx.lineTo(P[0], P[1]); }
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.6); ctx.lineWidth = lw(1.3); ctx.stroke();
  if (hd) {
    ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.3, 0.97, 10, sd * 0.6);
    ctx.strokeStyle = H.rgbStr(c.mem, 0.22); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 18; i++) { const u = 0.01 + 0.1 * hash(i + 3), f = (hash(i + 7) * 2 - 1) * 0.6; sp(u, f); circ(ctx, P[0], P[1], 0.008); }
    ctx.fillStyle = H.rgbStr(c.nuc, 0.45); ctx.fill();
  }
  // dorsal fin and the tiny second dorsal
  dorsalPath(ctx, 0.36, 0.5, 0.22, 0.22);
  ctx.fillStyle = dk; ctx.fill(); ctx.strokeStyle = finE; ctx.lineWidth = lw(1); ctx.stroke();
  dorsalPath(ctx, 0.84, 0.88, 0.04, 0.03);
  ctx.fillStyle = finF; ctx.fill();
  // the scythe: the upper tail lobe as long as the body (drawn over the body: it whips up and over the head)
  thrBlade(nt, D, wave, ph);
  bladePath(ctx, nt);
  ctx.fillStyle = finF; ctx.fill();
  ctx.strokeStyle = finE; ctx.lineWidth = lb(1.2); ctx.stroke();
  ctx.beginPath(); for (let i = 1; i < nt; i++) { const a = TBA[i], w = -thrBW(i / nt) * 0.25; i > 1 ? ctx.lineTo(TBX[i] + sin(a) * w, TBY[i] - cos(a) * w) : ctx.moveTo(TBX[i] + sin(a) * w, TBY[i] - cos(a) * w); }
  ctx.strokeStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.5, C3), 0.6); ctx.lineWidth = lw(hd ? 2 : 1.4); ctx.stroke();
  if (hd) { // denticle sheen along the blade
    ctx.beginPath(); for (let i = 2; i < nt - 2; i += 2) { const a = TBA[i], w = thrBW(i / nt) * 0.7; ctx.moveTo(TBX[i] + sin(a) * w * 0.5, TBY[i] - cos(a) * w * 0.5); ctx.lineTo(TBX[i + 1] - sin(a) * w * 0.7, TBY[i + 1] + cos(a) * w * 0.7); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.25); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // impact: fish-stunning sparkles off the tail tip as it lands
  const hit = sstep((whip - 0.55) / 0.45);
  if (hit > 0.01) {
    const x = TBX[nt], y = TBY[nt];
    ctx.beginPath();
    for (let i = 0; i < (hd ? 5 : 3); i++) { const a = i * 2.1 + t * 3, d = 0.18 + 0.12 * sin(t * 7 + i), r = 0.08 * (0.7 + 0.3 * sin(t * 9 + i * 2)); star(ctx, x + cos(a) * d, y + sin(a) * d, r); }
    ctx.fillStyle = H.rgbStr(WHITE, 0.9 * hit); ctx.fill();
    glow(ctx, H, c.glow, x, y, 0.6, 0.45 * hit);
    ctx.beginPath(); ctx.arc(x, y, 0.3 + 0.05 * sin(t * 12), 0, TAU); ctx.strokeStyle = H.rgbStr(WHITE, 0.35 * hit); ctx.lineWidth = lw(1.5); ctx.stroke();
  }
  // huge eyes (it hunts in dim, deep water); rolled and half-lidded when dazed
  for (const sd of [-1, 1]) {
    sp(0.12, sd * 0.8); const x = P[0], y = P[1], r = 0.085;
    eye(ctx, x, y, r, H.rgbStr(H.mixRGB(THR_IRIS, THR_BELLY, 0.85 * sk, C4)), lw(1.1), 0.7 - 0.38 * sk, '#04060c', 0.1 - 0.45 * sk, -sd * 0.4 * sk);
    if (sk > 0.01) {
      ctx.beginPath(); ctx.ellipse(x, y, r, r, 0, sd > 0 ? -PI : 0, sd > 0 ? 0 : PI); ctx.lineTo(x, y); ctx.closePath();
      ctx.save(); ctx.globalAlpha *= sk; ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.2, C3), 0.98); ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.strokeStyle = H.rgbStr(c.nuc, 0.8 * sk); ctx.lineWidth = lw(1.2); ctx.stroke();
    }
  }
  if (sk > 0.01) dazed(ctx, H, t, sk, 0.5, 0, 0.62, 0.52, 1.6);
  shine(ctx, H, e, 0.35, 0.7);
}

// =================================================================================================== broadbill swordfish (boss)
const SWF_W = (u) => (u < 0.3 ? 0.085 + 0.235 * sin((u / 0.3) * PI / 2) ** 0.75 : 0.04 + 0.28 * (1 - ((u - 0.3) / 0.7) ** 1.45));
const SWF_ORANGE = [255, 150, 60], SWF_HOT = [255, 210, 120], SWF_BLUE = [70, 170, 255], SWF_SWORD = [86, 74, 86], SWF_IRIS = [60, 120, 150];
function drawSwordfish(ctx, e, t, s, H) {
  const c = H.col, lw = H.lw, lb = H.lwb || H.lw, hd = H.hd;
  const ch = sstep(e.chargeK || 0), gk = sstep(e.glowK || 0), wk = sstep(e.wakeK || 0), st = (e.stretch || 0) + 0.08 * ch;
  const codex = e.r === undefined;
  if (codex) ctx.translate(-0.2, 0);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  const ph = phaseOf(e, t, 3.6 + 6 * ch);
  const n = H.lod ? 10 : 26;
  spine(n, 0.92, 2.1, SWF_W, (0.11 + st * 0.2) * (1 - 0.85 * ch), 3, ph, 2.6);
  const tx = SX[n], ty = SY[n], ta = SA[n], flex = 0.06 * sin(ph - 3) * (1 - 0.5 * ch);
  const hx = SX[0], hy = SY[0], ha = SA[0] - PI, SL = 1.28;
  if (H.lod) {
    outline(ctx, 0.04);
    ctx.moveTo(hx, hy - 0.1); ctx.lineTo(hx + cos(ha) * SL, hy + sin(ha) * SL); ctx.lineTo(hx, hy + 0.1); ctx.closePath();
    tailTri(ctx, tx, ty, ta, 0.6, 1.0, 0.16); ctx.fillStyle = H.cstr(c.body); ctx.fill(); return;
  }
  const dark = H.rgbStr(H.mixRGB(c.body, c.nuc, 0.5, C1), 0.95), edge = H.rgbStr(c.mem, 0.6);
  // the wake: blue bioluminescent sparks stirred up along and behind the body
  if (wk > 0.01) {
    glow(ctx, H, SWF_BLUE, -1.5, 0, 1.3, 0.18 * wk, 0, 0.5);
    const N = hd ? 34 : 20;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const f = fract(t * 0.55 + hash(i + 1)), u0 = hash(i + 7) * 1.15, sd = i & 1 ? 1 : -1;
      if (u0 <= 1) sp(u0, sd * (0.95 + 0.5 * hash(i + 3))); else { P[0] = tx - (u0 - 1) * 2.5; P[1] = ty + sd * hash(i + 3) * 0.5; }
      const x = P[0] - f * (1.2 + 0.8 * hash(i + 9)), y = P[1] + sd * f * 0.3 * hash(i + 13), a = wk * (1 - f) * (0.65 + 0.35 * sin(t * 7 + i * 2.3)), r = 0.045 + 0.06 * hash(i + 5);
      glow(ctx, H, SWF_BLUE, x, y, r * 3.2, a, 1);
      circ(ctx, x, y, r * 0.3 * (1 - f));
    }
    ctx.fillStyle = H.rgbStr([220, 245, 255], 0.85 * wk); ctx.fill();
  }
  if (ch > 0.01) { streaks(ctx, H, c.mem, t, ch, 0.4, 0.13); glow(ctx, H, c.glow, 0, 0, 1.5, 0.14 * ch, 0, 0.4); }
  // big crescent tail
  tailFin(ctx, tx, ty, ta, 0.6, 1.22, 0.03, flex, 0.26, dark, edge, H.rgbStr(c.mem, 0.2), lb(1.1), lw(0.6), hd ? 5 : 0);
  // long sickle pectorals (no pelvic fins at all); swept back in the charge
  for (const sd of [-1, 1]) { sp(0.27, sd * 0.88); sickle(ctx, P[0], P[1], spA(0.27) + sd * (PI / 2 + 0.85 + 0.55 * ch + 0.05 * sin(t * 1.7 + sd)), sd, 0.5, 0.12, dark, edge, lw(1)); }
  // the sword: long, flat and wide
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ha);
  ctx.beginPath(); ctx.moveTo(-0.06, -0.12); ctx.bezierCurveTo(0.4, -0.115, 0.95, -0.085, SL, 0); ctx.bezierCurveTo(0.95, 0.085, 0.4, 0.115, -0.06, 0.12); ctx.closePath();
  ctx.fillStyle = H.rgbStr(H.mixRGB(SWF_SWORD, c.body, 0.3, C2), 0.98); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw(1.1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(SL - 0.1, 0);
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.55); ctx.lineWidth = lw(1.3); ctx.stroke();
  ctx.beginPath(); for (const sd of [-1, 1]) { ctx.moveTo(0.02, sd * 0.085); ctx.bezierCurveTo(0.4, sd * 0.082, 0.9, sd * 0.06, SL - 0.04, sd * 0.004); }
  ctx.strokeStyle = H.rgbStr(c.mem, 0.32 + 0.5 * ch); ctx.lineWidth = lw(1 + ch); ctx.stroke();
  if (ch > 0.01) { // a bow wave off the sword tip
    ctx.beginPath(); for (let j = 0; j < 2; j++) { const x0 = SL + 0.05 + j * 0.09; ctx.moveTo(x0 - 0.3, -0.2 - j * 0.1); ctx.quadraticCurveTo(x0, 0, x0 - 0.3, 0.2 + j * 0.1); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.4 * ch); ctx.lineWidth = lw(1.3); ctx.stroke();
  }
  ctx.restore();
  // body: smooth scaleless skin, dark bronze-purple back
  outline(ctx, 0.04);
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.body, c.mem, 0.12, C3), 0.92); ctx.fill();
  gfill(ctx, H, c.body, 1, 0.0, 0, 1.15, 0.34);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.85); ctx.lineWidth = lb(1.4); ctx.stroke();
  outline(ctx, 0.02, 0.68, 1, n - 2); ctx.fillStyle = H.rgbStr(c.nuc, 0.72); ctx.fill();
  // a long sheen down the smooth back, the lateral line, the big keel on the tail stock
  ctx.beginPath(); flankLine(ctx, 0.12, 0.8, 10, -0.32);
  ctx.strokeStyle = H.rgbStr(WHITE, 0.16); ctx.lineWidth = 0.035; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.15, 0.95, 10, sd * 0.84);
  ctx.strokeStyle = H.rgbStr(c.mem, 0.24); ctx.lineWidth = lw(0.9); ctx.stroke();
  ctx.beginPath(); for (const sd of [-1, 1]) flankLine(ctx, 0.88, 1, 4, sd * 0.95);
  ctx.strokeStyle = H.rgbStr(c.nuc, 0.95); ctx.lineWidth = lw(2.6); ctx.stroke();
  if (hd) { // faint skin texture: oblique creases behind the head
    ctx.beginPath(); for (let i = 0; i < 10; i++) for (const sd of [-1, 1]) { const u = 0.3 + i * 0.05; sp(u, sd * 0.35); ctx.moveTo(P[0], P[1]); sp(u + 0.03, sd * 0.75); ctx.lineTo(P[0], P[1]); }
    ctx.strokeStyle = H.rgbStr(c.mem, 0.12); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // second dorsal / anal finlets near the tail
  dorsalPath(ctx, 0.86, 0.9, 0.05, 0.04); ctx.fillStyle = dark; ctx.fill();
  // the tall rigid sickle dorsal (a little lowered in the charge)
  dorsalPath(ctx, 0.19, 0.33, 0.34 + 0.08 * ch, 0.44 * (1 - 0.3 * ch));
  ctx.fillStyle = H.rgbStr(H.mixRGB(c.nuc, c.body, 0.35, C4), 0.95); ctx.fill(); ctx.strokeStyle = edge; ctx.lineWidth = lw(1); ctx.stroke();
  // heated eyes and brain: a warm glow from the heater tissue behind the eyes
  if (gk > 0.01) {
    sp(0.12, 0); glow(ctx, H, SWF_ORANGE, P[0], P[1], 0.42, 0.5 * gk, 0, 0.9);
    for (const sd of [-1, 1]) { sp(0.1, sd * 0.74); glow(ctx, H, SWF_ORANGE, P[0], P[1], 0.36, 0.75 * gk); glow(ctx, H, SWF_HOT, P[0], P[1], 0.16, 0.6 * gk, 1); }
  }
  // huge eyes
  for (const sd of [-1, 1]) {
    sp(0.1, sd * 0.74);
    eye(ctx, P[0], P[1], 0.09, H.rgbStr(H.mixRGB(SWF_IRIS, SWF_ORANGE, gk, C1)), lw(1.1), 0.68, gk > 0.5 ? 'rgb(30,10,6)' : '#04060c', 0.1);
  }
  shine(ctx, H, e, 0.3, 0.7);
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
  flyingfish: {
    name: 'Flying fish',
    col: { body: [130, 178, 236], mem: [226, 240, 255], nuc: [24, 50, 112], glow: [150, 200, 255] },
    portraitR: 0.21,
    states: [
      { label: 'idle', view: [0.85, 0.12] },
      { label: 'glideK 0.5', glideK: 0.5, view: [0.8, 0.12] },
      { label: 'glideK 1', glideK: 1, view: [0.8, 0.12] },
    ],
    draw: entry(drawFlyingfish),
  },
  tuna: {
    name: 'Yellowfin tuna',
    col: { body: [150, 176, 210], mem: [236, 242, 255], nuc: [20, 34, 86], glow: [170, 200, 240] },
    portraitR: 0.24,
    states: [{ label: 'idle', view: [0.78, 0.25] }, { label: 'cruising (stretch 0.15)', stretch: 0.15, view: [0.72, 0.25] }],
    draw: entry(drawTuna),
  },
  mahimahi: {
    name: 'Mahi-mahi',
    col: { body: [70, 190, 120], mem: [236, 255, 210], nuc: [16, 80, 110], glow: [140, 240, 140] },
    portraitR: 0.25,
    states: [{ label: 'idle', view: [0.82, 0.2] }, { label: 'swimming (stretch 0.15)', stretch: 0.15, view: [0.76, 0.2] }],
    draw: entry(drawMahi),
  },
  dolphin: {
    name: 'Common dolphin',
    col: { body: [176, 186, 204], mem: [236, 242, 250], nuc: [38, 42, 58], glow: [180, 200, 230] },
    portraitR: 0.23,
    states: [
      { label: 'idle', view: [0.75, 0.15] },
      { label: 'sprintK 1', sprintK: 1, view: [0.7, 0.3] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.75, 0.05] },
      { label: 'biteK 1', biteK: 1, view: [0.75, 0.0] },
    ],
    draw: entry(drawDolphin),
  },
  manowar: {
    name: 'Portuguese man o\' war',
    col: { body: [140, 150, 255], mem: [224, 228, 255], nuc: [210, 110, 230], glow: [170, 140, 255] },
    portraitR: 0.2,
    states: [
      { label: 'idle', view: [0.32, 1.6] },
      { label: 'stingK 0.5', stingK: 0.5, view: [0.32, 1.6] },
      { label: 'stingK 1', stingK: 1, view: [0.32, 1.6] },
      { label: 'float (close-up)', view: [1, 0] },
    ],
    draw: entry(drawManowar),
  },
  hammerhead: {
    name: 'Scalloped hammerhead',
    col: { body: [150, 160, 170], mem: [228, 234, 238], nuc: [36, 42, 52], glow: [170, 200, 220] },
    portraitR: 0.21,
    states: [
      { label: 'idle', view: [0.7, 0.45] },
      { label: 'biteK 0.5', biteK: 0.5, view: [0.7, 0.4] },
      { label: 'biteK 1', biteK: 1, view: [0.7, 0.35] },
    ],
    draw: entry(drawHammerhead),
  },
  marlin: {
    name: 'Blue marlin',
    col: { body: [44, 92, 200], mem: [214, 232, 255], nuc: [10, 22, 66], glow: [80, 180, 255] },
    portraitR: 0.2,
    states: [
      { label: 'idle', view: [0.72, 0.0] },
      { label: 'sprintK 0.5', sprintK: 0.5, view: [0.7, 0.05] },
      { label: 'sprintK 1', sprintK: 1, view: [0.68, 0.1] },
      { label: 'biteK 1', biteK: 1, view: [0.72, 0.0] },
    ],
    draw: entry(drawMarlin),
  },
  thresher: {
    name: 'Common thresher shark',
    boss: true,
    col: { body: [128, 122, 150], mem: [228, 226, 240], nuc: [38, 34, 54], glow: [180, 170, 235] },
    portraitR: 0.165,
    states: [
      { label: 'idle', view: [0.36, 1.25] },
      { label: 'windK 0.5', windK: 0.5, view: [0.36, 0.6] },
      { label: 'windK 1', windK: 1, view: [0.36, 0.2] },
      { label: 'windK 1 + whipK 0.5', windK: 1, whipK: 0.5, view: [0.36, 0.1] },
      { label: 'whipK 1', windK: 1, whipK: 1, view: [0.36, 0] },
      { label: 'stunK 1', stunK: 1, view: [0.36, 1.25] },
    ],
    draw: entry(drawThresher),
  },
  swordfish: {
    name: 'Broadbill swordfish',
    boss: true,
    col: { body: [112, 84, 112], mem: [228, 210, 230], nuc: [34, 20, 40], glow: [170, 140, 230] },
    portraitR: 0.19,
    states: [
      { label: 'idle', view: [0.64, -0.2] },
      { label: 'chargeK 1', chargeK: 1, view: [0.6, -0.1] },
      { label: 'glowK 1', glowK: 1, view: [0.64, -0.2] },
      { label: 'wakeK 1', wakeK: 1, view: [0.55, 0.3] },
      { label: 'night hunt (glowK + wakeK)', glowK: 1, wakeK: 1, view: [0.55, 0.3] },
    ],
    draw: entry(drawSwordfish),
  },
};
