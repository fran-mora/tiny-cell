// Creature art for the T4 tier (primordial-fish scale, 1–10 cm): reef life.
// See js/game/creatures/README.md for the conventions. Unit space: +x = facing, 1 unit = collision radius.
// The swimmers and crawlers are seen from above (like the player's fish); the jellyfish and the anchored
// anemone are seen side-on, as the README describes them.

const TAU = Math.PI * 2;
const { sin, cos, max, min, abs, exp, sqrt, PI, atan2, hypot, floor, pow } = Math;
const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v) => { v = cl01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, k) => a + (b - a) * k;
const frac = (v) => v - floor(v);
const rgba = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a > 0 ? a.toFixed(3) : 0})`);
const mixc = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const hash = (k) => frac(sin(k * 12.9898 + 4.1) * 43758.5453);
const WHITE = [255, 255, 255];
const SIDES = [-1, 1];

// ---------- shared helpers ----------
// additive glow sprite (alpha is relative to the alpha the creature is drawn with)
function glow(ctx, H, A0, c, x, y, r, a, hard = 0) {
  if (a <= 0.004 || r <= 0) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = A0 * (a > 1 ? 1 : a);
  ctx.drawImage(H.glowSprite(c, hard), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
}
function circ(ctx, x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
function ell(ctx, x, y, rx, ry, rot = 0) { ctx.moveTo(x + cos(rot) * rx, y + sin(rot) * rx); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); }
// fill the current path with a style laid out in a translated/scaled frame (gradients are unit-circle sized)
function fillIn(ctx, style, x, y, sx, sy) { ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy); ctx.fillStyle = style; ctx.fill(); ctx.restore(); }
// world-fixed specular highlight, shrunk for slender bodies
function shine(ctx, H, e, x, y, k) { ctx.save(); ctx.translate(x, y); ctx.scale(k, k); H.highlight(ctx, e.ang || 0); ctx.restore(); }

// smooth closed outline through the midpoints of QX/QY
const QX = new Float32Array(220), QY = new Float32Array(220);
function smoothClosed(ctx, n) {
  ctx.beginPath();
  ctx.moveTo((QX[n - 1] + QX[0]) / 2, (QY[n - 1] + QY[0]) / 2);
  for (let i = 0; i < n; i++) { const j = i + 1 === n ? 0 : i + 1; ctx.quadraticCurveTo(QX[i], QY[i], (QX[i] + QX[j]) / 2, (QY[i] + QY[j]) / 2); }
  ctx.closePath();
}
// bending centre line shared by the swimmers: y = BA·w^BE·sin(BP + BK·x), w = (BX − x)/BL behind BX
let BA = 0, BP = 0, BK = 0, BX = 0, BL = 1, BE = 2;
function setBend(a, p, k, x0, len, e) { BA = a; BP = p; BK = k; BX = x0; BL = len; BE = e; }
function bend(x) { if (x >= BX || !BA) return 0; return BA * pow((BX - x) / BL, BE) * sin(BP + BK * x); }
// heading of the centre line at x, pointing towards the tail (≈ π)
function tailA(x) { return atan2(bend(x - 0.03) - bend(x + 0.03), -0.06); }
// body outline from a width profile [x0, w0, x1, w1, ...] (head → tail, end widths 0) around the bent centre line
function profilePath(ctx, p, k = 1) {
  const m = p.length >> 1; let n = 0;
  for (let i = 0; i < m; i++) { const x = p[2 * i]; QX[n] = x; QY[n] = bend(x) - p[2 * i + 1] * k; n++; }
  for (let i = m - 2; i >= 1; i--) { const x = p[2 * i]; QX[n] = x; QY[n] = bend(x) + p[2 * i + 1] * k; n++; }
  smoothClosed(ctx, n);
}
function profW(p, x) {
  const m = p.length >> 1;
  if (x >= p[0]) return p[1];
  for (let i = 1; i < m; i++) {
    const x1 = p[2 * i];
    if (x >= x1) { const x0 = p[2 * i - 2], k = (x - x1) / (x0 - x1 || 1); return p[2 * i + 1] + (p[2 * i - 1] - p[2 * i + 1]) * k; }
  }
  return p[2 * m - 1];
}
// rounded limb segment (adds a subpath)
function capsule(ctx, x0, y0, x1, y1, w0, w1) {
  const a = atan2(y1 - y0, x1 - x0), nx = cos(a - PI / 2), ny = sin(a - PI / 2);
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
  ctx.arc(x1, y1, w1, a - PI / 2, a + PI / 2);
  ctx.arc(x0, y0, w0, a + PI / 2, a + PI * 1.5);
  ctx.closePath();
}
// tapered limb along a quadratic curve p0 → p2 (control p1), width w0 → w1 (adds a subpath)
const AX = new Float32Array(24), AY = new Float32Array(24), ANX = new Float32Array(24), ANY = new Float32Array(24);
function taper(ctx, x0, y0, x1, y1, x2, y2, w0, w1, n = 8) {
  for (let i = 0; i <= n; i++) { const u = i / n, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; AX[i] = a * x0 + b * x1 + c * x2; AY[i] = a * y0 + b * y1 + c * y2; }
  taperPts(ctx, n, w0, w1);
}
function taperPts(ctx, n, w0, w1) {
  for (let i = 0; i <= n; i++) {
    const i0 = i ? i - 1 : 0, i1 = i < n ? i + 1 : n;
    let tx = AX[i1] - AX[i0], ty = AY[i1] - AY[i0]; const l = hypot(tx, ty) || 1; tx /= l; ty /= l;
    ANX[i] = -ty; ANY[i] = tx;
  }
  for (let i = 0; i <= n; i++) { const w = lerp(w0, w1, i / n), x = AX[i] + ANX[i] * w, y = AY[i] + ANY[i] * w; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = n; i >= 0; i--) { const w = lerp(w0, w1, i / n); ctx.lineTo(AX[i] - ANX[i] * w, AY[i] - ANY[i] * w); }
  ctx.closePath();
}
// cavitation flash: the light, bubble ring and spray of a snapping claw or a mantis-shrimp strike
const CAV = [190, 235, 255];
function cavitation(ctx, H, A0, x, y, k, R, lw) {
  if (k <= 0.01) return;
  glow(ctx, H, A0, CAV, x, y, R * (1 + 0.6 * k), 0.9 * k, 1);
  glow(ctx, H, A0, WHITE, x, y, R * 0.42, k, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath(); circ(ctx, x, y, R * (0.3 + 0.55 * (1 - k)));
  ctx.strokeStyle = rgba(CAV, 0.85 * k); ctx.lineWidth = lw(2.4); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i * 0.628 + 0.25, r0 = R * (0.48 + 0.25 * (1 - k)), r1 = r0 + R * (0.22 + 0.2 * hash(i));
    ctx.moveTo(x + cos(a) * r0, y + sin(a) * r0); ctx.lineTo(x + cos(a) * r1, y + sin(a) * r1);
  }
  ctx.strokeStyle = rgba(WHITE, 0.75 * k); ctx.lineWidth = lw(1.5); ctx.lineCap = 'round'; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
// the bright, cute fish eyes used by the player (pale iris, dark pupil, two glints), a pair at (x, ±y)
function fishEyes(ctx, x, y, r, lw, hd, lite) {
  ctx.beginPath(); circ(ctx, x, -y, r); circ(ctx, x, y, r);
  ctx.fillStyle = 'rgba(176,214,232,0.96)'; ctx.fill();
  ctx.strokeStyle = 'rgba(15,40,55,0.6)'; ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); circ(ctx, x + r * 0.14, -y, r * 0.7); circ(ctx, x + r * 0.14, y, r * 0.7); ctx.fillStyle = '#06141f'; ctx.fill();
  if (hd) { ctx.beginPath(); for (const sg of SIDES) { ctx.moveTo(x + r * 0.14 + cos(0.6) * r * 0.58, sg * y + sin(0.6) * r * 0.58); ctx.arc(x + r * 0.14, sg * y, r * 0.58, 0.6, 2.6); } ctx.strokeStyle = 'rgba(120,230,255,0.35)'; ctx.lineWidth = lw(1.4); ctx.stroke(); }
  ctx.beginPath(); circ(ctx, x - r * 0.06, -y - r * 0.3, r * 0.26); circ(ctx, x - r * 0.06, y - r * 0.3, r * 0.26); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
  if (!lite) { ctx.beginPath(); circ(ctx, x + r * 0.42, -y + r * 0.28, r * 0.11); circ(ctx, x + r * 0.42, y + r * 0.28, r * 0.11); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill(); }
}
// little tail fan of a shrimp: telson + a pair of uropods, drawn in a frame whose +x points backwards
function tailFan(ctx, x, y, a, spread, ul, uw, tl, fill, edge, lw, hd) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath();
  for (const sg of SIDES) { const r = sg * spread; ell(ctx, cos(r) * ul * 0.9, sg * 0.03 + sin(r) * ul * 0.9, ul, uw, r); }
  ctx.moveTo(-0.01, -uw * 0.8); ctx.quadraticCurveTo(tl * 0.6, -uw * 0.7, tl, -uw * 0.25); ctx.lineTo(tl, uw * 0.25); ctx.quadraticCurveTo(tl * 0.6, uw * 0.7, -0.01, uw * 0.8); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.strokeStyle = edge; ctx.lineWidth = lw(1.1); ctx.stroke();
  if (hd) {
    // fringe of setae around the uropods
    ctx.beginPath();
    for (const sg of SIDES) {
      const r = sg * spread, cx = cos(r) * ul * 0.9, cy = sg * 0.03 + sin(r) * ul * 0.9;
      for (let i = 0; i < 9; i++) { const b = -1.3 + i * 0.32, px = cx + cos(r) * cos(b) * ul - sin(r) * sin(b) * uw * sg, py = cy + sin(r) * cos(b) * ul + cos(r) * sin(b) * uw * sg; ctx.moveTo(px, py); ctx.lineTo(px + cos(r + sg * b * 0.5) * 0.05, py + sin(r + sg * b * 0.5) * 0.05); }
    }
    ctx.strokeStyle = edge; ctx.lineWidth = lw(0.7); ctx.stroke();
  }
  ctx.restore();
}

// =====================================================================================================
// krill — translucent shrimp, black stalked eyes, glowing blue photophores (food swarm). glowK.
// =====================================================================================================
const KR_COL = { body: [255, 150, 128], mem: [255, 224, 208], nuc: [222, 66, 60], glow: [110, 200, 255] };
const KR_PROF = [1.05, 0, 0.98, 0.07, 0.9, 0.14, 0.72, 0.2, 0.45, 0.215, 0.2, 0.21, 0.07, 0.2, 0.04, 0.183, -0.14, 0.186, -0.32, 0.174, -0.5, 0.16, -0.68, 0.14, -0.85, 0.114, -0.98, 0.088, -1.08, 0.062, -1.12, 0];
const KR_SEG = [0.05, -0.14, -0.32, -0.5, -0.68, -0.86];
const KR_LEG = [0.74, 0.63, 0.52, 0.41, 0.3, 0.19];
const KR_PH = [0.86, 0.13, 0.5, 0.15, 0.2, 0.14];           // paired photophores (x, ±y)
const KR_PHV = [-0.05, -0.23, -0.41, -0.59];                // ventral photophores on the midline
const PHOTO = [110, 200, 255], PHOTO_CORE = [215, 246, 255], KR_GUT = [150, 205, 95];

function drawKrill(ctx, e, t, s, H) {
  const col = H.col, lw = H.lwb || H.lw, A0 = ctx.globalAlpha, hd = H.hd, gk = cl01(e.glowK || 0), st = e.stretch || 0;
  ctx.save();
  if (st) ctx.scale(1 + st * 0.4, 1 - st * 0.3);
  setBend(0.07, t * 3.4, 2.4, 0.12, 1.25, 2);
  if (H.lod) {
    profilePath(ctx, KR_PROF); ctx.fillStyle = rgba(col.body, 0.8); ctx.fill();
    ctx.beginPath(); circ(ctx, 0.97, -0.19, 0.1); circ(ctx, 0.97, 0.19, 0.1); ctx.fillStyle = '#160b12'; ctx.fill();
    glow(ctx, H, A0, PHOTO, 0, 0, 1.3, gk * 0.6);
    ctx.restore(); return;
  }
  const lite = !hd && s < 30;                                // small on screen: skip the finest details
  ctx.lineCap = 'round';
  // antennules (two flagella each) and the long second antennae
  ctx.beginPath();
  for (const sg of SIDES) {
    const a1 = 0.06 * sin(t * 1.7 + sg), a2 = 0.05 * sin(t * 2.3 + sg * 2);
    ctx.moveTo(1.2, sg * 0.1); ctx.quadraticCurveTo(1.6, sg * (0.17 + a1), 2.05, sg * (0.36 + a1 * 2));
    ctx.moveTo(1.2, sg * 0.1); ctx.quadraticCurveTo(1.55, sg * (0.1 + a2), 1.92, sg * (0.16 + a2 * 2));
    ctx.moveTo(1.0, sg * 0.15); ctx.bezierCurveTo(1.5, sg * (0.3 + a1), 1.95, sg * (0.62 + a2), 2.3, sg * (0.98 + a1 * 2));
  }
  ctx.strokeStyle = rgba(col.mem, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
  if (!lite) {
    ctx.beginPath();
    for (const sg of SIDES) { ctx.moveTo(0.9, sg * 0.05); ctx.lineTo(1.21, sg * 0.1); }
    if (hd) for (const sg of SIDES) { ell(ctx, 1.05, sg * 0.2, 0.09, 0.03, sg * 0.35); }
    ctx.strokeStyle = rgba(col.body, 0.85); ctx.lineWidth = lw(2.2); ctx.stroke();
  }
  // thoracic legs: the feeding basket poking out under the carapace, sweeping in a wave
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const x = KR_LEG[i], sw = 0.05 * sin(t * 5 - i * 0.9);
    for (const sg of SIDES) {
      ctx.moveTo(x, sg * 0.15); ctx.quadraticCurveTo(x + 0.07, sg * 0.29, x - 0.02 + sw, sg * (0.38 + 0.012 * i));
      if (hd) for (let k = 1; k <= 3; k++) { const px = x + 0.035 - 0.02 * k + sw * k * 0.3, py = sg * (0.27 + 0.035 * k); ctx.moveTo(px, py); ctx.lineTo(px - 0.05, py + sg * 0.012); }
    }
  }
  ctx.strokeStyle = rgba(col.mem, 0.72); ctx.lineWidth = lw(1.1); ctx.stroke();
  // pleopods beating under the abdomen (metachronal wave)
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = (KR_SEG[i] + KR_SEG[i + 1]) / 2, y = bend(x), w = profW(KR_PROF, x), b = sin(t * 11 - i * 1.2);
    for (const sg of SIDES) {
      const tx = x - 0.09 - 0.06 * b, ty = y + sg * (w + 0.11 + 0.03 * b);
      ctx.moveTo(x, y + sg * w * 0.7); ctx.lineTo(tx, ty);
      if (hd) { ctx.moveTo(tx, ty); ctx.lineTo(tx - 0.05, ty + sg * 0.03); ctx.moveTo(tx, ty); ctx.lineTo(tx + 0.03, ty + sg * 0.04); }
    }
  }
  ctx.strokeStyle = rgba(col.body, 0.75); ctx.lineWidth = lw(1.4); ctx.stroke();
  // tail fan
  tailFan(ctx, -1.07, bend(-1.07), tailA(-1.07), 0.3 + 0.08 * sin(t * 3.4 + 1), 0.16, 0.045, 0.3, rgba(col.body, 0.4), rgba(col.mem, 0.75), lw, hd);
  // body
  profilePath(ctx, KR_PROF);
  fillIn(ctx, H.bodyGrad(ctx, col.body), -0.05, 0, 1.12, 0.25);
  ctx.strokeStyle = rgba(col.mem, 0.92); ctx.lineWidth = lw(1.4); ctx.stroke();
  // segment rings, carapace margin and cervical groove
  ctx.beginPath();
  for (let i = 0; i < KR_SEG.length; i++) { const x = KR_SEG[i], y = bend(x), w = profW(KR_PROF, x) * 0.95; ctx.moveTo(x + 0.03, y - w); ctx.quadraticCurveTo(x - 0.04, y, x + 0.03, y + w); }
  ctx.moveTo(0.6, -0.18); ctx.quadraticCurveTo(0.52, 0, 0.6, 0.18);
  ctx.strokeStyle = rgba(col.mem, 0.45); ctx.lineWidth = lw(1); ctx.stroke();
  // gut: green digestive gland (a phytoplankton meal) and the hindgut running down the tail
  ctx.beginPath(); ell(ctx, 0.42, 0, 0.19, 0.085);
  ctx.fillStyle = rgba(KR_GUT, 0.5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.26, 0);
  for (let x = 0.1; x >= -1.0; x -= 0.15) ctx.lineTo(x, bend(x));
  ctx.strokeStyle = rgba(KR_GUT, 0.42); ctx.lineWidth = lw(1.6); ctx.stroke();
  if (!lite) {
    const beat = 0.5 + 0.5 * sin(t * 8);
    ctx.beginPath(); circ(ctx, 0.14, 0, 0.032 * (1 + 0.25 * beat)); ctx.fillStyle = rgba([255, 100, 110], 0.4 + 0.3 * beat); ctx.fill();
    // red chromatophores
    ctx.beginPath();
    const nc = hd ? 22 : 9;
    for (let i = 0; i < nc; i++) { const x = 0.85 - (i + 0.5) * (1.85 / nc), w = profW(KR_PROF, x), y = bend(x) + (hash(i + e.seed * 3) - 0.5) * w * 1.4, r = 0.012 + 0.012 * hash(i * 3.1); circ(ctx, x, y, r); }
    ctx.fillStyle = rgba(col.nuc, 0.75); ctx.fill();
  }
  // stalked black compound eyes
  ctx.beginPath();
  for (const sg of SIDES) { ctx.moveTo(0.84, sg * 0.06); ctx.lineTo(0.95, sg * 0.17); }
  ctx.strokeStyle = rgba(col.body, 0.9); ctx.lineWidth = lw(2.6); ctx.stroke();
  ctx.beginPath(); for (const sg of SIDES) circ(ctx, 0.975, sg * 0.195, 0.088);
  ctx.fillStyle = '#170b12'; ctx.fill();
  ctx.strokeStyle = rgba(col.nuc, 0.55); ctx.lineWidth = lw(1); ctx.stroke();
  if (!lite) { ctx.beginPath(); for (const sg of SIDES) circ(ctx, 0.95, sg * 0.195 - 0.03, 0.026); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill(); }
  // photophores: cores + glow (glowK = bright bioluminescent display)
  const pa = 0.35 + 0.65 * gk, pr = 0.1 + 0.17 * gk;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) for (const sg of SIDES) circ(ctx, KR_PH[2 * i], bend(KR_PH[2 * i]) + sg * KR_PH[2 * i + 1], 0.028);
  for (const x of KR_PHV) circ(ctx, x, bend(x), 0.03);
  ctx.fillStyle = rgba(PHOTO_CORE, 0.6 + 0.4 * gk); ctx.fill();
  glow(ctx, H, A0, PHOTO, 0, 0, 1.6, 0.4 * gk);
  for (let i = 0; i < 3; i++) for (const sg of SIDES) { if ((!hd && i === 1) || (lite && i === 2)) continue; const x = KR_PH[2 * i]; glow(ctx, H, A0, PHOTO, x, bend(x) + sg * KR_PH[2 * i + 1], pr, pa * (0.8 + 0.2 * sin(t * 3 + i * 1.7 + sg)), 1); }
  for (let i = 0; i < 4; i += lite ? 2 : 1) { const x = KR_PHV[i]; glow(ctx, H, A0, PHOTO, x, bend(x), pr * (lite ? 1.4 : 1.1), pa * (0.8 + 0.2 * sin(t * 3 - i * 1.3)), 1); }
  shine(ctx, H, e, 0.35, 0, 0.42);
  ctx.restore();
}

// =====================================================================================================
// larvalfish — glassy fish larva: huge eyes, yolk sac and gut, continuous fin fold, wiggly tail.
// =====================================================================================================
const LF_COL = { body: [190, 230, 255], mem: [232, 249, 255], nuc: [255, 186, 84], glow: [160, 225, 255] };
const LF_PROF = [1.02, 0, 0.98, 0.13, 0.9, 0.22, 0.78, 0.265, 0.62, 0.27, 0.48, 0.255, 0.32, 0.24, 0.16, 0.19, 0.0, 0.13, -0.25, 0.1, -0.6, 0.076, -0.95, 0.056, -1.3, 0.036, -1.5, 0.016, -1.56, 0];
const LF_FOLD = [0.22, 0, 0.06, 0.135, -0.2, 0.175, -0.55, 0.205, -0.9, 0.215, -1.2, 0.205, -1.45, 0.175, -1.62, 0.125, -1.72, 0.055, -1.75, 0];
const LF_MEL = [0.2, 0.08, -0.05, -0.18, -0.3, -0.52, -0.76, -1.0, -1.24];

const LF_K = 0.85;                                                   // drawn a little smaller so the long tail stays in frame
function drawLarvalFish(ctx, e, t, s, H) {
  const col = H.col, lw0 = H.lwb || H.lw, lw = (px) => lw0(px) / LF_K, A0 = ctx.globalAlpha, hd = H.hd, st = e.stretch || 0;
  ctx.save();
  ctx.translate(0.04, 0); ctx.scale(LF_K, LF_K);
  if (st) ctx.scale(1 + st * 0.45, 1 - st * 0.3);
  // beat-and-glide: bursts of quick tail beats
  const burst = 0.5 + 0.5 * sin(t * 1.3);
  setBend(0.07 + 0.17 * burst, t * 9, 3.3, 0.45, 2.2, 1.5);
  if (H.lod) {
    profilePath(ctx, LF_FOLD); ctx.fillStyle = rgba(col.body, 0.3); ctx.fill();
    profilePath(ctx, LF_PROF); ctx.fillStyle = rgba(col.body, 0.8); ctx.fill();
    ctx.restore(); return;
  }
  const lite = !hd && s < 30;
  ctx.lineCap = 'round';
  // continuous fin fold around the tail
  profilePath(ctx, LF_FOLD);
  ctx.fillStyle = rgba(col.body, 0.17); ctx.fill();
  ctx.strokeStyle = rgba(col.mem, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (let x = 0.0; x > -1.66; x -= 0.055) {
      const wi = profW(LF_PROF, x), wo = profW(LF_FOLD, x - 0.03) * 0.96;
      if (wo - wi < 0.03) continue;
      for (const sg of SIDES) { ctx.moveTo(x, bend(x) + sg * wi); ctx.lineTo(x - 0.03, bend(x - 0.03) + sg * wo); }
    }
    ctx.strokeStyle = rgba(col.mem, 0.2); ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // pectoral fins: little round fans, fluttering
  ctx.beginPath();
  for (const sg of SIDES) { const a = sg * (PI / 2 + 0.55 + 0.35 * sin(t * 13 + sg)); ell(ctx, 0.42 + cos(a) * 0.1, sg * 0.21 + sin(a) * 0.1, 0.12, 0.07, a); }
  ctx.fillStyle = rgba(col.body, 0.3); ctx.fill();
  ctx.strokeStyle = rgba(col.mem, 0.65); ctx.lineWidth = lw(1); ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (const sg of SIDES) { const a = sg * (PI / 2 + 0.55 + 0.35 * sin(t * 13 + sg)), ry = sg * 0.21; for (let k = -2; k <= 2; k++) { const b = a + k * 0.28; ctx.moveTo(0.42, ry); ctx.lineTo(0.42 + cos(b) * 0.19, ry + sin(b) * 0.19); } }
    ctx.strokeStyle = rgba(col.mem, 0.3); ctx.lineWidth = lw(0.7); ctx.stroke();
  }
  // body
  profilePath(ctx, LF_PROF);
  fillIn(ctx, H.bodyGrad(ctx, col.body), -0.22, 0, 1.32, 0.33);
  ctx.strokeStyle = rgba(col.mem, 0.92); ctx.lineWidth = lw(1.4); ctx.stroke();
  // myomeres + notochord
  if (!lite) {
    ctx.beginPath();
    for (let x = 0.08; x > -1.42; x -= 0.105) { const y = bend(x), w = profW(LF_PROF, x) * 0.84; ctx.moveTo(x - 0.05, y - w); ctx.lineTo(x + 0.035, y); ctx.lineTo(x - 0.05, y + w); }
    ctx.strokeStyle = rgba(col.mem, 0.22); ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0.55, 0);
  for (let x = 0.4; x >= -1.5; x -= 0.1) ctx.lineTo(x, bend(x));
  ctx.strokeStyle = 'rgba(235,252,255,0.36)'; ctx.lineWidth = lw(2.2); ctx.stroke();
  // gut, from behind the yolk to the mid-body anus
  ctx.beginPath(); ctx.moveTo(0.14, 0.04); ctx.bezierCurveTo(0.0, 0.1, -0.2, bend(-0.2) + 0.08, -0.37, bend(-0.37) + 0.05);
  ctx.strokeStyle = 'rgba(240,170,100,0.42)'; ctx.lineWidth = 0.055; ctx.stroke();
  if (!lite) { ctx.strokeStyle = 'rgba(255,225,180,0.4)'; ctx.lineWidth = lw(0.9); ctx.stroke(); }
  // yolk sac with its oil globule
  ctx.beginPath(); ell(ctx, 0.3, 0, 0.2, 0.165);
  fillIn(ctx, H.nucGrad(ctx, col.nuc), 0.3, 0, 0.2, 0.165);
  ctx.strokeStyle = rgba(mixc(col.nuc, WHITE, 0.5), 0.7); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); circ(ctx, 0.41, -0.035, 0.055); ctx.fillStyle = 'rgba(255,244,160,0.92)'; ctx.fill();
  if (!lite) { ctx.beginPath(); circ(ctx, 0.395, -0.05, 0.018); ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill(); }
  // melanophores (star-shaped pigment cells) along the gut and the tail
  ctx.beginPath();
  for (let i = 0; i < LF_MEL.length; i++) {
    const x = LF_MEL[i], y = bend(x) + (i < 5 ? 0.075 : 0.02 * (i & 1 ? 1 : -1)), r = 0.02 + 0.008 * hash(i);
    circ(ctx, x, y, r);
    if (hd) for (let k = 0; k < 4; k++) { const a = k * 1.57 + i; ctx.moveTo(x, y); ctx.lineTo(x + cos(a) * r * 2.6, y + sin(a) * r * 2.6); }
  }
  ctx.fillStyle = 'rgba(32,26,40,0.78)'; ctx.fill();
  if (hd) { ctx.strokeStyle = 'rgba(32,26,40,0.55)'; ctx.lineWidth = lw(0.9); ctx.stroke(); }
  // beating heart and the brain between the eyes
  if (!lite) {
    const beat = 0.5 + 0.5 * sin(t * 9);
    ctx.beginPath(); circ(ctx, 0.56, 0.06, 0.034 * (1 + 0.3 * beat)); ctx.fillStyle = rgba([255, 100, 125], 0.4 + 0.3 * beat); ctx.fill();
    ctx.beginPath(); ell(ctx, 0.82, -0.065, 0.09, 0.06, 0.2); ell(ctx, 0.82, 0.065, 0.09, 0.06, -0.2);
    ctx.fillStyle = 'rgba(215,240,255,0.18)'; ctx.fill();
  }
  // the huge eyes
  fishEyes(ctx, 0.68, 0.24, 0.17, lw, hd, lite);
  shine(ctx, H, e, 0.45, 0, 0.5);
  ctx.restore();
}

// =====================================================================================================
// jellyfish — side-on medusa (bell front = +x): pulsing striped bell, frilly oral arms, 8 long stinging
// tentacles trailing to −x. stingK.
// =====================================================================================================
const JF_COL = { body: [224, 152, 255], mem: [250, 230, 255], nuc: [255, 118, 196], glow: [215, 150, 255] };
const JF_TENT = [255, 196, 238], JF_STING = [255, 236, 255], JF_FLASH = [255, 150, 240];
const JT_N = 8, JT_K = 22, JO_K = 16;
const JTX = new Float32Array(JT_N * (JT_K + 1)), JTY = new Float32Array(JT_N * (JT_K + 1));
const JF_ORAL = [-0.27, -0.09, 0.09, 0.27];

// bell contraction: quick squeeze, slow relaxation
function bellPulse(t) { const q = frac(t * 0.45); return q < 0.28 ? ease(q / 0.28) : 1 - ease((q - 0.28) / 0.72); }
function domePt(xr, L, R, flare, th) { const c = max(0, cos(th)), sn = sin(th); QX[0] = xr + L * pow(c, 0.88); QY[0] = R * sn * (1 + flare * pow(abs(sn), 10)); }

function drawJellyfish(ctx, e, t, s, H) {
  const col = H.col, lw = H.lwb || H.lw, A0 = ctx.globalAlpha, hd = H.hd, sk = cl01(e.stingK || 0);
  const c = bellPulse(t + e.seed);
  const R = 0.98 - 0.22 * c, apex = 0.9 + 0.05 * c, L = 1.0 + 0.16 * c, xr = apex - L, re = 0.15 - 0.05 * c, flare = 0.12 * (1 - c);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // ---- tentacles: rooted around the bell margin, flowing back to ~−3.5
  const NK = H.lod ? 8 : hd ? JT_K : 14, wr = 1 + 0.6 * sk;
  for (let i = 0; i < JT_N; i++) {
    const al = PI / 2 + ((i + 0.5) / JT_N) * PI, x0 = xr + re * cos(al) * 0.9, y0 = R * (1 + flare) * sin(al) * 0.94;
    const len = 3.05 + 0.4 * hash(i + 2), o = i * (JT_K + 1);
    for (let k = 0; k <= NK; k++) {
      const u = k / NK;
      JTX[o + k] = x0 - len * u * (1 - 0.03 * sin(t * 2 + i));
      JTY[o + k] = y0 * (1 + 0.35 * u) + (0.04 + 0.2 * u) * wr * sin(t * 1.8 - u * 7 + i * 1.3) + 0.14 * u * u * sin(t * 0.5 + i * 2.1);
    }
  }
  const tentPath = () => {
    ctx.beginPath();
    for (let i = 0; i < JT_N; i++) { const o = i * (JT_K + 1); ctx.moveTo(JTX[o], JTY[o]); for (let k = 1; k <= NK; k++) ctx.lineTo(JTX[o + k], JTY[o + k]); }
  };
  if (H.lod) {
    tentPath(); ctx.strokeStyle = rgba(sk ? JF_STING : JF_TENT, 0.6 + 0.4 * sk); ctx.lineWidth = lw(1); ctx.stroke();
    domePt(xr, L, R, flare, 0); bellPath(ctx, xr, L, R, re, flare, 12);
    ctx.fillStyle = rgba(col.body, 0.75); ctx.fill();
    ctx.restore(); return;
  }
  // ---- frilly oral arms (behind the bell, hanging from its mouth): ruffled ribbons, one path
  const NO = hd ? JO_K : 10;
  for (let pass = 0; pass < (hd ? 2 : 1); pass++) {
    ctx.beginPath();
    for (let j = 0; j < 4; j++) {
      const yb = JF_ORAL[j] * R, len = 2.05 + 0.3 * hash(j + 7);
      for (let k = 0; k <= NO; k++) { const u = k / NO; AX[k] = xr + 0.2 - len * u; AY[k] = yb * (1 + 0.6 * u) + 0.13 * u * sin(t * 1.3 - u * 4.5 + j * 2.2); }
      if (pass) { ctx.moveTo(AX[0], AY[0]); for (let k = 1; k <= NO; k++) ctx.lineTo(AX[k], AY[k]); continue; }
      for (let k = 0; k <= NO; k++) {
        const i0 = k ? k - 1 : 0, i1 = k < NO ? k + 1 : NO;
        let tx = AX[i1] - AX[i0], ty = AY[i1] - AY[i0]; const l = hypot(tx, ty) || 1; ANX[k] = -ty / l; ANY[k] = tx / l;
      }
      for (let k = 0; k <= NO; k++) { const u = k / NO, w = (0.1 - 0.06 * u) * (1 + 0.35 * sin(u * 30 + t * 2.5 + j)); const x = AX[k] + ANX[k] * w, y = AY[k] + ANY[k] * w; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      for (let k = NO; k >= 0; k--) { const u = k / NO, w = (0.1 - 0.06 * u) * (1 + 0.35 * sin(u * 30 - t * 2.1 + j * 1.7)); ctx.lineTo(AX[k] - ANX[k] * w, AY[k] - ANY[k] * w); }
      ctx.closePath();
    }
    if (pass) { ctx.strokeStyle = rgba(col.nuc, 0.4); ctx.lineWidth = lw(1.6); ctx.stroke(); }
    else {
      ctx.fillStyle = rgba(col.nuc, 0.3); ctx.fill();
      ctx.strokeStyle = rgba(mixc(col.nuc, WHITE, 0.45), 0.6); ctx.lineWidth = lw(1); ctx.stroke();
    }
  }
  // ---- tentacles
  tentPath();
  if (hd) { ctx.strokeStyle = rgba(JF_TENT, 0.14); ctx.lineWidth = lw(5); ctx.stroke(); }
  ctx.strokeStyle = rgba(JF_TENT, 0.6); ctx.lineWidth = lw(hd ? 1.6 : 1.3); ctx.stroke();
  // nematocyst batteries
  if (s > 30) {
    ctx.beginPath();
    for (let i = 0; i < JT_N; i++) for (let k = 3; k <= NK; k += hd ? 2 : 3) { const o = i * (JT_K + 1) + k; circ(ctx, JTX[o], JTY[o], 0.02 * (1.2 - k / NK)); }
    ctx.fillStyle = rgba(JF_STING, 0.55 + 0.45 * sk); ctx.fill();
  }
  if (sk > 0.01) {
    // stinging: the tentacles flash
    ctx.globalCompositeOperation = 'lighter';
    tentPath(); ctx.strokeStyle = rgba(JF_FLASH, 0.55 * sk); ctx.lineWidth = lw(5); ctx.stroke();
    ctx.strokeStyle = rgba(JF_STING, 0.9 * sk); ctx.lineWidth = lw(1.8); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < JT_N; i++) for (let k = hd ? 5 : 7; k <= NK; k += hd ? 6 : 7) { const o = i * (JT_K + 1) + k; glow(ctx, H, A0, JF_FLASH, JTX[o], JTY[o], 0.2 + 0.1 * sk, 0.55 * sk * (0.75 + 0.25 * sin(t * 20 + k + i)), 1); }
  }
  // ---- the bell
  // subumbrella cavity seen through the opening
  ctx.beginPath(); ell(ctx, xr, 0, re, R * (1 + flare));
  ctx.fillStyle = rgba(mixc(col.body, [60, 30, 90], 0.5), 0.22); ctx.fill();
  bellPath(ctx, xr, L, R, re, flare, hd ? 30 : 18);
  fillIn(ctx, H.bodyGrad(ctx, col.body, 0.9), xr + L * 0.38, 0, L * 0.72, R * 1.06);
  // radial stripes (sea-nettle style): wedges between meridians, foreshortened toward the silhouette.
  // (everything drawn over the bell lies on or inside the dome, so no clip is needed)
  ctx.beginPath();
  for (let k = 1; k <= 7; k++) {
    const ph = (k / 8) * PI, d = 0.09;
    const nm = hd ? 8 : 5;
    for (let i = 0; i <= nm; i++) { const th = (i / nm) * (PI / 2); domePt(xr, L, R, flare, th); const y = QY[0] * cos(ph - d); i ? ctx.lineTo(QX[0], y) : ctx.moveTo(QX[0], y); }
    for (let i = nm; i >= 0; i--) { const th = (i / nm) * (PI / 2); domePt(xr, L, R, flare, th); ctx.lineTo(QX[0], QY[0] * cos(ph + d)); }
    ctx.closePath();
  }
  ctx.fillStyle = rgba(mixc(col.nuc, col.body, 0.3), 0.26); ctx.fill();
  // stomach + gonads glimpsed through the bell
  ctx.beginPath(); ell(ctx, xr + 0.42, 0, 0.3, 0.36 * R);
  ctx.fillStyle = rgba(col.nuc, 0.16); ctx.fill();
  if (hd) {
    // four frilly gonads around the stomach
    for (let k = 0; k < 4; k++) {
      const gy = (k < 2 ? -1 : 1) * (k & 1 ? 0.52 : 0.2) * R, gx = xr + (k & 1 ? 0.3 : 0.42);
      ctx.save(); ctx.translate(gx, gy); ctx.scale(0.17, (k & 1 ? 0.1 : 0.12) * R);
      H.blobPath(ctx, { n: 18, t: t * 0.6, seed: k * 1.7, amp: 0.08, lobes: 6, lobeAmp: 0.14 });
      ctx.restore();
      ctx.fillStyle = rgba(col.nuc, 0.32); ctx.fill();
      ctx.strokeStyle = rgba(mixc(col.nuc, WHITE, 0.4), 0.55); ctx.lineWidth = lw(1.2); ctx.stroke();
    }
    // nematocyst warts on the bell
    ctx.beginPath();
    for (let i = 0; i < 26; i++) { const th = 0.15 + hash(i) * 1.3, ph = 0.3 + hash(i + 40) * 2.5; domePt(xr, L, R, flare, th); circ(ctx, QX[0], QY[0] * cos(ph), 0.016); }
    ctx.fillStyle = rgba(WHITE, 0.32); ctx.fill();
  }
  // inner dome (subumbrella) and outline
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) { const th = -1.35 + (i / 16) * 2.7; domePt(xr + 0.1, L * 0.66, R * 0.84, 0, th); i ? ctx.lineTo(QX[0], QY[0]) : ctx.moveTo(QX[0], QY[0]); }
  ctx.strokeStyle = rgba(col.mem, 0.3); ctx.lineWidth = lw(1.2); ctx.stroke();
  bellPath(ctx, xr, L, R, re, flare, hd ? 30 : 18);
  ctx.strokeStyle = rgba(col.mem, 0.88); ctx.lineWidth = lw(1.6); ctx.stroke();
  // scalloped margin (lappets)
  ctx.beginPath();
  const nl = hd ? 28 : 14;
  for (let i = 0; i <= nl; i++) { const al = PI / 2 + (i / nl) * PI, r = 1 + 0.25 * abs(sin(i * PI / 2 + 0.5)); const x = xr + re * cos(al) * r, y = R * (1 + flare) * sin(al); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = rgba(col.mem, 0.7); ctx.lineWidth = lw(1.3); ctx.stroke();
  // soft inner glow (it is a bioluminescent jelly) and the sting flash halo
  glow(ctx, H, A0, col.glow, xr + 0.55, 0, 1.0, 0.18 + 0.1 * c);
  glow(ctx, H, A0, JF_FLASH, -1.6, 0, 2.2, 0.35 * sk);
  shine(ctx, H, e, xr + L * 0.55, 0, 0.75);
  ctx.restore();
}
function bellPath(ctx, xr, L, R, re, flare, n) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { domePt(xr, L, R, flare, -PI / 2 + (i / n) * PI); i ? ctx.lineTo(QX[0], QY[0]) : ctx.moveTo(QX[0], QY[0]); }
  ctx.ellipse(xr, 0, re, R * (1 + flare), 0, PI / 2, PI * 1.5);
  ctx.closePath();
}

// =====================================================================================================
// pistolshrimp — snapping shrimp: one oversized snapping claw (+x, on its right), a slender minor claw,
// eyes under orbital hoods. cockK (claw cocked open), snapK (snapped shut, cavitation flash at the tip).
// =====================================================================================================
const PS_COL = { body: [255, 140, 98], mem: [255, 228, 204], nuc: [186, 50, 42], glow: [255, 170, 120] };
const PS_CLAW = [240, 96, 70], PS_TIP = [255, 238, 222];
const PS_PROF = [0.74, 0, 0.71, 0.1, 0.63, 0.19, 0.48, 0.235, 0.26, 0.25, 0.06, 0.245, 0.01, 0.225, -0.03, 0.21, -0.2, 0.215, -0.38, 0.205, -0.55, 0.183, -0.71, 0.15, -0.84, 0.115, -0.94, 0.08, -0.99, 0];
const PS_SEG = [0.02, -0.17, -0.35, -0.53, -0.69, -0.85];
const PS_LEG = [0.36, 0.24, 0.12, 0.02];
const PS_BANDS = [[0.42, 0.26], [0.02, -0.17], [-0.35, -0.53], [-0.69, -0.85]];
const PS_BX = -0.28, PS_BSX = 0.85, PS_BSY = 0.95;               // body frame (the claw is drawn in unit space)

function drawPistolShrimp(ctx, e, t, s, H) {
  const col = H.col, lw = H.lwb || H.lw, A0 = ctx.globalAlpha, hd = H.hd, st = e.stretch || 0;
  const ck = ease(e.cockK || 0), sk = cl01(e.snapK || 0), cocked = ck * (1 - sk);
  const open = cocked * 1.45;                                          // dactyl opening (rad)
  // the big claw's palm frame: base point and heading (cocking draws it back and outwards)
  const cx = 0.27 - 0.07 * cocked + 0.04 * sk, cy = 0.36 + 0.04 * cocked, ca = -0.04 + 0.2 * cocked - 0.04 * sk + 0.03 * sin(t * 0.9);
  const CSX = 1.03, CSY = 1.1;
  const bodyFrame = () => { ctx.save(); ctx.translate(PS_BX, 0); ctx.scale(PS_BSX, PS_BSY); };
  ctx.save();
  if (st) ctx.scale(1 + st * 0.35, 1 - st * 0.25);
  setBend(0.05, t * 2.2, 2.0, 0.05, 1.1, 2);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (H.lod) {
    bodyFrame(); profilePath(ctx, PS_PROF); ctx.restore();
    capsule(ctx, cx, cy, cx + cos(ca) * 0.8, cy + sin(ca) * 0.8, 0.2, 0.12);
    ctx.fillStyle = rgba(col.body, 0.85); ctx.fill();
    ctx.restore(); return;
  }
  const memC = rgba(col.mem, 0.9), clawC = mixc(col.body, PS_CLAW, 0.6);
  bodyFrame();
  // walking legs (short, folded under the body)
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const x = PS_LEG[i];
    for (const sg of SIDES) { const stp = 0.04 * sin(t * 4 + i * 1.6 + (sg > 0 ? PI : 0)); ctx.moveTo(x, sg * 0.2); ctx.lineTo(x + 0.04, sg * 0.34); ctx.lineTo(x - 0.08 + stp, sg * 0.43); }
  }
  ctx.strokeStyle = rgba(col.body, 0.9); ctx.lineWidth = lw(2.4); ctx.stroke();
  ctx.strokeStyle = rgba(col.mem, 0.45); ctx.lineWidth = lw(0.8); ctx.stroke();
  // pleopods
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const x = (PS_SEG[i] + PS_SEG[i + 1]) / 2, y = bend(x), w = profW(PS_PROF, x), b = sin(t * 9 - i * 1.2);
    for (const sg of SIDES) { ctx.moveTo(x, y + sg * w * 0.75); ctx.lineTo(x - 0.08 - 0.05 * b, y + sg * (w + 0.08 + 0.02 * b)); }
  }
  ctx.strokeStyle = rgba(col.body, 0.75); ctx.lineWidth = lw(1.6); ctx.stroke();
  // minor claw (left): slender, picking at the bottom
  ctx.save(); ctx.translate(0.45, -0.17); ctx.rotate(0.07 * sin(t * 1.7));
  ctx.beginPath();
  capsule(ctx, 0, 0, 0.2, -0.1, 0.036, 0.036); capsule(ctx, 0.2, -0.1, 0.32, -0.12, 0.035, 0.036); capsule(ctx, 0.32, -0.12, 0.55, -0.12, 0.05, 0.042);
  ctx.fillStyle = rgba(clawC, 0.92); ctx.fill();
  ctx.strokeStyle = memC; ctx.lineWidth = lw(1); ctx.stroke();
  const mo = 0.02 + 0.025 * (0.5 + 0.5 * sin(t * 2.3));
  ctx.beginPath(); ctx.moveTo(0.55, -0.14); ctx.quadraticCurveTo(0.64, -0.13 - mo, 0.71, -0.12 - mo * 0.5); ctx.moveTo(0.55, -0.1); ctx.quadraticCurveTo(0.64, -0.11, 0.7, -0.115);
  ctx.strokeStyle = rgba(PS_TIP, 0.92); ctx.lineWidth = lw(2); ctx.stroke();
  ctx.restore();
  // big claw arm: merus + carpus from under the carapace to the palm (whose base is in unit space)
  const kx = (cx - cos(ca) * 0.02 - PS_BX) / PS_BSX, ky = (cy - sin(ca) * 0.02) / PS_BSY;
  ctx.beginPath(); capsule(ctx, 0.4, 0.16, 0.6, ky - 0.08, 0.065, 0.075); capsule(ctx, 0.6, ky - 0.08, kx, ky, 0.075, 0.095);
  ctx.fillStyle = rgba(clawC, 0.95); ctx.fill();
  ctx.strokeStyle = memC; ctx.lineWidth = lw(1.1); ctx.stroke();
  // tail fan
  tailFan(ctx, -0.94, bend(-0.94), tailA(-0.94), 0.42 + 0.06 * sin(t * 2.2), 0.18, 0.065, 0.28, rgba(col.body, 0.6), rgba(col.mem, 0.8), lw, hd);
  // body
  profilePath(ctx, PS_PROF);
  ctx.fillStyle = rgba(col.body, 0.35); ctx.fill();
  fillIn(ctx, H.bodyGrad(ctx, col.body), -0.13, 0, 0.92, 0.28);
  ctx.strokeStyle = memC; ctx.lineWidth = lw(1.5); ctx.stroke();
  // banded pattern (quads that follow the body outline) + pale dorsal stripe
  ctx.beginPath();
  for (const [x0, x1] of PS_BANDS) {
    const w0 = profW(PS_PROF, x0) * 0.93, w1 = profW(PS_PROF, x1) * 0.93;
    ctx.moveTo(x0, bend(x0) - w0); ctx.lineTo(x1, bend(x1) - w1); ctx.quadraticCurveTo(x1 - 0.03, bend(x1), x1, bend(x1) + w1); ctx.lineTo(x0, bend(x0) + w0); ctx.quadraticCurveTo(x0 - 0.03, bend(x0), x0, bend(x0) - w0); ctx.closePath();
  }
  ctx.fillStyle = rgba(col.nuc, 0.32); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.6, 0); for (let x = 0.4; x >= -0.9; x -= 0.15) ctx.lineTo(x, bend(x));
  ctx.strokeStyle = 'rgba(255,245,235,0.32)'; ctx.lineWidth = 0.06; ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < PS_SEG.length; i++) { const x = PS_SEG[i], y = bend(x), w = profW(PS_PROF, x) * 0.96; ctx.moveTo(x + 0.03, y - w); ctx.quadraticCurveTo(x - 0.04, y, x + 0.03, y + w); }
  ctx.strokeStyle = rgba(col.mem, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (let i = 0; i < 14; i++) { const x = 0.55 - hash(i) * 1.35, w = profW(PS_PROF, x); circ(ctx, x, bend(x) + (hash(i + 9) - 0.5) * w * 1.5, 0.012 + 0.01 * hash(i + 3)); }
    ctx.fillStyle = 'rgba(255,240,225,0.4)'; ctx.fill();
  }
  // eyes peering through the orbital hoods
  ctx.beginPath(); for (const sg of SIDES) circ(ctx, 0.62, sg * 0.085, 0.085);
  ctx.fillStyle = rgba(mixc(col.body, WHITE, 0.3), 0.45); ctx.fill();
  ctx.strokeStyle = rgba(col.mem, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath(); for (const sg of SIDES) circ(ctx, 0.635, sg * 0.085, 0.048);
  ctx.fillStyle = 'rgba(70,10,28,0.88)'; ctx.fill();
  ctx.beginPath(); for (const sg of SIDES) circ(ctx, 0.622, sg * 0.085 - 0.02, 0.016);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  shine(ctx, H, e, 0.1, 0, 0.5);
  ctx.restore();
  // ---- the snapping claw (palm, fixed finger, hinged dactyl with its plunger)
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ca); ctx.scale(CSX, CSY);
  const da = -0.25 + open;
  // dactyl (behind the palm edge)
  ctx.save(); ctx.translate(0.58, 0.075); ctx.rotate(da);
  ctx.beginPath(); ctx.moveTo(-0.03, -0.05); ctx.bezierCurveTo(0.1, -0.08, 0.27, -0.05, 0.38, -0.005); ctx.quadraticCurveTo(0.3, 0.06, 0.12, 0.08); ctx.quadraticCurveTo(0.0, 0.088, -0.04, 0.04); ctx.closePath();
  if (hd || open > 0.05) circ(ctx, 0.07, -0.068, 0.028);              // the plunger
  ctx.fillStyle = rgba(clawC, 0.62); ctx.fill();
  fillIn(ctx, H.bodyGrad(ctx, PS_CLAW), 0.15, 0, 0.26, 0.12);
  ctx.strokeStyle = memC; ctx.lineWidth = lw(1.2); ctx.stroke();
  ctx.beginPath(); ell(ctx, 0.3, 0.008, 0.07, 0.026, 0.1); ctx.fillStyle = rgba(PS_TIP, 0.8); ctx.fill();
  ctx.restore();
  // palm + pollex
  ctx.beginPath();
  ctx.moveTo(0.0, -0.09);
  ctx.bezierCurveTo(0.12, -0.165, 0.42, -0.18, 0.58, -0.115);
  ctx.quadraticCurveTo(0.78, -0.09, 0.93, -0.03);
  ctx.quadraticCurveTo(0.8, -0.03, 0.62, -0.005);
  ctx.lineTo(0.6, 0.065);
  ctx.bezierCurveTo(0.56, 0.22, 0.25, 0.235, 0.05, 0.13);
  ctx.quadraticCurveTo(-0.045, 0.02, 0.0, -0.09);
  ctx.closePath();
  ctx.fillStyle = rgba(clawC, 0.62); ctx.fill();
  fillIn(ctx, H.bodyGrad(ctx, PS_CLAW), 0.38, 0.02, 0.52, 0.21);
  ctx.strokeStyle = memC; ctx.lineWidth = lw(1.5); ctx.stroke();
  ctx.beginPath(); ell(ctx, 0.86, -0.04, 0.07, 0.022, 0.25); ctx.fillStyle = rgba(PS_TIP, 0.8); ctx.fill();
  if (open > 0.02) { ctx.beginPath(); ell(ctx, 0.6, -0.035, 0.036, 0.022); ctx.fillStyle = `rgba(60,10,20,${(0.75 * open / 1.45).toFixed(3)})`; ctx.fill(); }  // the socket
  // pale band + tubercles
  ctx.beginPath(); ctx.moveTo(0.5, -0.16); ctx.quadraticCurveTo(0.56, 0.02, 0.5, 0.19);
  ctx.strokeStyle = 'rgba(255,230,215,0.32)'; ctx.lineWidth = 0.045; ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (let i = 0; i < 12; i++) { const x = 0.08 + hash(i + 20) * 0.4, y = (hash(i + 31) - 0.5) * 0.24; circ(ctx, x, y, 0.012 + 0.008 * hash(i)); }
    ctx.fillStyle = 'rgba(255,225,205,0.45)'; ctx.fill();
  }
  shine(ctx, H, e, 0.3, 0.02, 0.3);
  // the snap: motion arc of the dactyl
  if (sk > 0.25) {
    ctx.beginPath(); ctx.arc(0.58, 0.075, 0.34, -0.2, 1.1);
    ctx.strokeStyle = rgba(WHITE, 0.5 * (sk - 0.25)); ctx.lineWidth = lw(3); ctx.stroke();
  }
  ctx.restore();
  // antennae on top
  bodyFrame();
  ctx.beginPath();
  for (const sg of SIDES) {
    const a1 = 0.05 * sin(t * 1.6 + sg), a2 = 0.06 * sin(t * 2.1 + sg * 2);
    ctx.moveTo(0.92, sg * 0.07); ctx.quadraticCurveTo(1.15, sg * (0.1 + a1), 1.4, sg * (0.22 + a1 * 2));
    ctx.moveTo(0.92, sg * 0.07); ctx.quadraticCurveTo(1.12, sg * (0.06 + a2), 1.34, sg * (0.08 + a2 * 2));
    ctx.moveTo(0.7, sg * 0.13); ctx.bezierCurveTo(1.1, sg * (0.18 + a2), 1.7, sg * (0.34 + a1), 2.2, sg * (0.7 + a1 * 3));
  }
  ctx.strokeStyle = rgba(col.mem, 0.75); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.beginPath();
  for (const sg of SIDES) { ctx.moveTo(0.68, sg * 0.05); ctx.lineTo(0.92, sg * 0.07); }
  ctx.strokeStyle = rgba(col.body, 0.9); ctx.lineWidth = lw(2.4); ctx.stroke();
  ctx.beginPath(); for (const sg of SIDES) ell(ctx, 0.8, sg * 0.175, 0.1, 0.035, sg * 0.15);
  ctx.fillStyle = rgba(col.body, 0.4); ctx.fill(); ctx.strokeStyle = rgba(col.mem, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
  ctx.restore();
  // cavitation flash just ahead of the claw tip
  const lx = 1.02 * CSX, ly = -0.02 * CSY, fx = cx + cos(ca) * lx - sin(ca) * ly, fy = cy + sin(ca) * lx + cos(ca) * ly;
  if (sk > 0.01) cavitation(ctx, H, A0, fx, fy, sk, 0.45, lw);
  else if (cocked > 0.05) glow(ctx, H, A0, CAV, cx + cos(ca) * 0.68 - sin(ca) * 0.12, cy + sin(ca) * 0.68 + cos(ca) * 0.12, 0.22, 0.3 * cocked, 1);
  ctx.restore();
}

// =====================================================================================================
// anemone — anchored: pedal disc at −x, column, oral disc at +x ringed by soft swaying bubble-tip
// tentacles. reach (tentacles stretch toward the target), closedK (pulls everything in when hurt).
// =====================================================================================================
const AN_COL = { body: [255, 112, 150], mem: [255, 208, 226], nuc: [160, 36, 86], glow: [255, 140, 190] };
const AN_TENT = [255, 182, 218], AN_TIP = [205, 255, 182], AN_BEAD = [120, 175, 255];
const TIPX = new Float32Array(40), TIPY = new Float32Array(40), TIPW = new Float32Array(40), TIPA = new Float32Array(40);
let NTIP = 0;

// one path of soft tentacles rooted on the oral disc ellipse (ring = fraction of its radius): each tapers,
// swells into a bubble just below the tip, and sways with a wave running out along it
function anTentacles(ctx, n, ring, off, xd, rxd, hh, rk, ck, t, w0, N) {
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const al = off + (k / n) * TAU, sa = sin(al), ca = cos(al), h = hash(k * 1.7 + ring * 5);
    const len = (0.6 + 0.32 * h) * (1 + 1.1 * rk) * pow(1 - ck, 1.5);
    if (len < 0.03) continue;
    let x = xd + rxd * ca * ring, y = hh * sa * ring;
    let a = atan2(sa * (1 - 0.45 * rk), 0.4 + 0.8 * rk + 0.2 * ca);
    const step = len / N, curl = (h - 0.5) * 0.12;
    for (let j = 0; j <= N; j++) {
      AX[j] = x; AY[j] = y;
      a += (0.13 * sin(t * 1.4 + k * 1.9 - j * 0.6 * 10 / N) + 0.05 * sin(t * 0.55 + k) + curl) * (1 - 0.55 * rk) * 10 / N;
      x += cos(a) * step; y += sin(a) * step;
    }
    // widths: taper, then the bubble near the tip
    const w = w0 * (1 - 0.4 * ck);
    for (let j = 0; j <= N; j++) {
      const i0 = j ? j - 1 : 0, i1 = j < N ? j + 1 : N;
      let tx = AX[i1] - AX[i0], ty = AY[i1] - AY[i0]; const l = hypot(tx, ty) || 1; ANX[j] = -ty / l; ANY[j] = tx / l;
    }
    for (let j = 0; j <= N; j++) { const u = j / N, b = u - 0.8, ww = w * (1 - 0.5 * u + 0.45 * exp(-b * b * 60)) * (j === N ? 0.75 : 1); const px = AX[j] + ANX[j] * ww, py = AY[j] + ANY[j] * ww; j ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.arc(AX[N], AY[N], w * 0.375, atan2(ANY[N], ANX[N]), atan2(ANY[N], ANX[N]) - PI, true);
    for (let j = N; j >= 0; j--) { const u = j / N, b = u - 0.8, ww = w * (1 - 0.5 * u + 0.45 * exp(-b * b * 60)) * (j === N ? 0.75 : 1); ctx.lineTo(AX[j] - ANX[j] * ww, AY[j] - ANY[j] * ww); }
    ctx.closePath();
    if (NTIP < 40) { TIPX[NTIP] = AX[N - 1] * 0.35 + AX[N] * 0.65; TIPY[NTIP] = AY[N - 1] * 0.35 + AY[N] * 0.65; TIPW[NTIP] = w * 0.5; TIPA[NTIP] = a; NTIP++; }
  }
}

function drawAnemone(ctx, e, t, s, H) {
  const col = H.col, lw = H.lwb || H.lw, A0 = ctx.globalAlpha, hd = H.hd;
  const rk = ease(e.reach || 0), ck = ease(e.closedK || 0);
  const xf = -0.92, hf = 0.6 + 0.08 * ck;
  const xd = lerp(0.42, -0.1, ck), hdd = lerp(0.6, 0.1, ck), rxd = lerp(0.17, 0.05, ck), cc = lerp(0.46, 0.92, ck);
  const breathe = 1 + 0.015 * sin(t * 1.1);
  // column half-height along it (u: 0 = foot, 1 = oral disc): a quadratic bulge, a flared pedal disc, a lip
  const colH = (u) => ((1 - u) * (1 - u) * hf + 2 * u * (1 - u) * cc + u * u * hdd + 0.12 * pow(1 - u, 8) + 0.05 * (1 - ck) * pow(u, 10)) * breathe;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // column outline: top side foot → disc, front of the disc, bottom side back, the foot's back edge
  const colPath = () => {
    let n = 0;
    for (let i = 0; i <= 12; i++) { const u = i / 12; QX[n] = lerp(xf, xd, u); QY[n] = -colH(u); n++; }
    for (let i = 1; i < 8; i++) { const a = -PI / 2 + (i / 8) * PI; QX[n] = xd + rxd * cos(a); QY[n] = colH(1) * sin(a); n++; }
    for (let i = 12; i >= 0; i--) { const u = i / 12; QX[n] = lerp(xf, xd, u); QY[n] = colH(u); n++; }
    for (let i = 1; i < 6; i++) { const a = PI / 2 + (i / 6) * PI; QX[n] = xf + 0.06 * cos(a); QY[n] = colH(0) * sin(a); n++; }
    smoothClosed(ctx, n);
  };
  if (H.lod) {
    colPath(); ctx.fillStyle = rgba(col.body, 0.85); ctx.fill();
    if (ck < 0.9) { ctx.beginPath(); ell(ctx, xd + 0.35 * (1 + rk), 0, (0.4 + 0.5 * rk) * (1 - ck) + 0.05, 0.85 * (1 - ck) + 0.05); ctx.fillStyle = rgba(AN_TENT, 0.6); ctx.fill(); }
    ctx.restore(); return;
  }
  const off = 0.13 + e.seed;
  // soft fluorescent glow of the crown
  glow(ctx, H, A0, col.glow, xd + 0.45 + 0.4 * rk, 0, 1.3 + 0.5 * rk, 0.22 * (1 - ck));
  // outer ring of tentacles (behind the disc)
  NTIP = 0;
  if (ck < 0.98) {
    anTentacles(ctx, hd ? 22 : 13, 1, off, xd, rxd, hdd, rk, ck, t, 0.068, hd ? 10 : 7);
    ctx.fillStyle = rgba(AN_TENT, 0.6); ctx.fill();
    ctx.strokeStyle = rgba(col.mem, 0.62); ctx.lineWidth = lw(1); ctx.stroke();
  }
  // column
  colPath();
  ctx.fillStyle = rgba(col.body, 0.3); ctx.fill();
  fillIn(ctx, H.bodyGrad(ctx, col.body), (xf + xd) / 2 + 0.05, 0, (xd - xf) / 2 + 0.22, max(hf, cc * 0.8) * 1.12);
  ctx.strokeStyle = rgba(col.mem, 0.9); ctx.lineWidth = lw(1.6); ctx.stroke();
  // longitudinal stripes
  ctx.beginPath();
  for (const v of [-0.62, -0.22, 0.2, 0.6]) for (let i = 0; i <= 12; i++) { const u = i / 12, x = lerp(xf, xd, u) + 0.02, y = v * colH(u); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.strokeStyle = rgba(col.nuc, 0.22); ctx.lineWidth = lw(hd ? 3 : 1.8); ctx.stroke();
  if (hd) {
    // verrucae: sticky warts on the upper column
    ctx.beginPath();
    for (let i = 0; i < 26; i++) { const u = 0.5 + 0.45 * hash(i + 3), v = (hash(i + 17) - 0.5) * 1.6; circ(ctx, lerp(xf, xd, u), v * colH(u), 0.016 + 0.01 * hash(i)); }
    ctx.fillStyle = 'rgba(255,215,232,0.4)'; ctx.fill();
  }
  // the pedal disc gripping the rock
  ctx.beginPath(); ell(ctx, xf, 0, 0.07, colH(0) * 0.98);
  ctx.fillStyle = rgba(col.nuc, 0.4); ctx.fill();
  ctx.strokeStyle = rgba(col.mem, 0.45); ctx.lineWidth = lw(1.2); ctx.stroke();
  // oral disc with mouth, radial lines and blue acrorhagi beads around the rim
  const da = 1 - ck;
  if (da > 0.02) {
    ctx.globalAlpha = A0 * da;
    ctx.beginPath(); ell(ctx, xd, 0, rxd, hdd);
    ctx.fillStyle = rgba(mixc(col.body, WHITE, 0.35), 0.75); ctx.fill();
    ctx.strokeStyle = rgba(col.mem, 0.75); ctx.lineWidth = lw(1.2); ctx.stroke();
    if (hd) {
      ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; ctx.moveTo(xd + rxd * 0.3 * cos(a), hdd * 0.25 * sin(a)); ctx.lineTo(xd + rxd * 0.92 * cos(a), hdd * 0.92 * sin(a)); }
      ctx.strokeStyle = rgba(col.nuc, 0.25); ctx.lineWidth = lw(1); ctx.stroke();
    }
    const gape = 0.2 + 0.05 * sin(t * 0.9);
    ctx.beginPath(); ell(ctx, xd + rxd * 0.08, 0, rxd * 0.26, hdd * gape);
    ctx.fillStyle = rgba(col.nuc, 0.85); ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,200,0.65)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.beginPath();
    const nb = hd ? 18 : 10;
    for (let i = 0; i < nb; i++) { const a = (i / nb) * TAU + 0.2; circ(ctx, xd + rxd * 1.02 * cos(a) - 0.02, hdd * 1.04 * sin(a), hd ? 0.028 : 0.034); }
    ctx.fillStyle = rgba(AN_BEAD, 0.9); ctx.fill();
    ctx.globalAlpha = A0;
  }
  if (ck > 0.02) {
    // closed: the column's rim puckers over the disc
    ctx.beginPath();
    for (let i = 0; i < 7; i++) { const v = (i - 3) / 3.5, x0 = xd + 0.04, y0 = v * 0.06; ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 - 0.18, v * 0.3, x0 - 0.34, v * 0.5); }
    ctx.strokeStyle = rgba(col.nuc, 0.45 * ck); ctx.lineWidth = lw(1.6); ctx.stroke();
    ctx.beginPath(); ell(ctx, xd + 0.03, 0, 0.04, 0.06 + 0.04 * (1 - ck)); ctx.fillStyle = rgba(col.nuc, 0.7 * ck); ctx.fill();
  }
  // inner ring of tentacles (in front)
  if (ck < 0.98) {
    anTentacles(ctx, hd ? 13 : 8, 0.6, off + 0.4, xd, rxd, hdd, rk, ck, t + 0.7, 0.06, hd ? 10 : 7);
    ctx.fillStyle = rgba(mixc(AN_TENT, WHITE, 0.12), 0.66); ctx.fill();
    ctx.strokeStyle = rgba(col.mem, 0.66); ctx.lineWidth = lw(1); ctx.stroke();
    // fluorescent tips
    ctx.beginPath();
    for (let i = 0; i < NTIP; i++) ell(ctx, TIPX[i], TIPY[i], TIPW[i] * 1.5, TIPW[i], TIPA[i]);
    ctx.fillStyle = rgba(AN_TIP, 0.85); ctx.fill();
    if (hd) for (let i = 0; i < NTIP; i++) glow(ctx, H, A0, AN_TIP, TIPX[i], TIPY[i], 0.13, 0.4 * (1 - ck) * (0.7 + 0.3 * sin(t * 2 + i)), 0);
    else glow(ctx, H, A0, AN_TIP, xd + 0.6 * (1 + rk), 0, 0.9, 0.2 * (1 - ck));
  }
  shine(ctx, H, e, -0.3, 0, 0.7);
  ctx.restore();
}

// =====================================================================================================
// cuttlefish (boss) — seen from above: oval mantle with a rippling fin skirt, passing-cloud chromatophore
// bands, W-pupilled eyes, 8 arms + 2 feeding tentacles. camo, strikeK, decoy (ink pseudomorph).
// =====================================================================================================
const CU_COL = { body: [206, 150, 116], mem: [255, 232, 212], nuc: [84, 40, 46], glow: [255, 185, 140] };
const CU_FIN = [236, 226, 255], CU_IRID = [120, 230, 255], CU_IRIS = [214, 182, 96], CU_INK = [22, 15, 26], CU_BG = [70, 135, 150];
const CU_TENT = [255, 196, 190];
const MC = -0.27, MA = 0.8, MB = 0.6;
// arms: [root y, tip x, tip y, root width] (ventral → dorsal: later ones are drawn on top)
const CU_ARMS = [0.2, 1.16, 0.17, 0.095, 0.14, 1.29, 0.115, 0.105, 0.08, 1.39, 0.065, 0.105, 0.028, 1.45, 0.022, 0.09];
const CU_BLOT = [-0.6, -0.3, 0.13, -0.35, 0.28, 0.1, 0.05, -0.38, 0.12, 0.15, 0.32, 0.1, -0.75, 0.15, 0.11, -0.2, -0.05, 0.14, 0.2, 0.0, 0.1, -0.5, 0.42, 0.09, -0.85, -0.12, 0.08, -0.05, 0.25, 0.09, -0.4, -0.12, 0.1];
// scattered skin spots inside the unit disc: [x, y, size] (chromatophores, then pale flecks near the rim)
const CU_SPOT = new Float32Array(3 * 130);
for (let i = 0; i < 130; i++) {
  const pale = i >= 90, a = hash(i * 3.7 + 1) * TAU, r = pale ? 0.72 + 0.2 * hash(i * 1.3 + 7) : sqrt(hash(i * 2.9 + 3)) * 0.93;
  CU_SPOT[3 * i] = cos(a) * r; CU_SPOT[3 * i + 1] = sin(a) * r; CU_SPOT[3 * i + 2] = 0.6 + 0.8 * hash(i * 5.1 + 2);
}
let MX = 0, MY = 0;
function mantlePt(th, k = 1) {
  const c = cos(th), d = atan2(sin(th), c);
  MX = MC + (MA * c + 0.07 * exp(-d * d * 9)) * k;
  MY = MB * sin(th) * (1 + 0.07 * c) * k;
}
function mantlePath(ctx, k = 1, n = 40) {
  for (let i = 0; i < n; i++) { mantlePt((i / n) * TAU, k); QX[i] = MX; QY[i] = MY; }
  smoothClosed(ctx, n);
}
// one arm (subpath): from the head (0.82, y0) to its tip, waving
function cuArm(ctx, i, sg, sk, t) {
  const ry = CU_ARMS[4 * i], tx = CU_ARMS[4 * i + 1] - 0.12 * sk, ty = CU_ARMS[4 * i + 2] * (1 + 0.8 * sk) + 0.08 * sk, w0 = CU_ARMS[4 * i + 3];
  const wv = 0.03 * sin(t * 1.6 + i * 1.3 + sg), curl = 0.05 * sin(t * 1.1 + i * 2 + sg * 0.7) + sg * 0.09 * sk * (0.6 + 0.2 * i);
  taper(ctx, 0.78, sg * ry, (0.84 + tx) / 2, sg * ((ry + ty) / 2 + 0.06 * sk) + wv, tx, sg * ty + wv * 1.4 + curl, w0, 0.014, 9);
}

function drawCuttlefish(ctx, e, t, s, H) {
  const col = H.col, lw = H.lwb || H.lw, A0 = ctx.globalAlpha, hd = H.hd;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (e.decoy) { drawInk(ctx, e, t, s, H, lw, A0); ctx.restore(); return; }
  const camo = cl01(e.camo || 0), sk = ease(e.strikeK || 0);
  const bA = 1 - 0.93 * camo;                                // body opacity
  const base = mixc(col.body, col.nuc, 0.18), shade = mixc(col.nuc, col.body, 0.35);
  if (H.lod) {
    ctx.globalAlpha = A0 * bA;
    mantlePath(ctx, 1.08, 16); ell(ctx, 0.62, 0, 0.3, 0.36); ctx.moveTo(0.8, -0.2); ctx.lineTo(1.5, 0); ctx.lineTo(0.8, 0.2); ctx.closePath();
    ctx.fillStyle = rgba(col.body, 0.85); ctx.fill();
    ctx.globalAlpha = A0;
    ctx.beginPath(); for (const sg of SIDES) circ(ctx, 0.6, sg * 0.34, 0.08);
    ctx.fillStyle = rgba(CU_IRIS, 0.95); ctx.fill();
    ctx.restore(); return;
  }
  ctx.globalAlpha = A0 * bA;
  // ---- fin skirt: a translucent frill along the mantle, its ripples running from head to tail
  const NF = hd ? 72 : 40, th0 = 0.55, wph = t * 7;
  let n = 0;
  for (let i = 0; i <= NF; i++) { mantlePt(th0 + (i / NF) * (TAU - 2 * th0), 0.99); QX[n] = MX; QY[n] = MY; n++; }
  for (let i = NF; i >= 0; i--) {
    const th = th0 + (i / NF) * (TAU - 2 * th0), dth = th < PI ? th : TAU - th;
    mantlePt(th); const x = MX, y = MY; mantlePt(th + 0.01); const tx = MX - x, ty = MY - y, l = hypot(tx, ty) || 1;
    const dr = (th - PI) / 0.22, env = ease((dth - th0) / 0.45) * (1 - 0.8 * exp(-dr * dr));
    const fw = 0.12 * env * (1 + 0.32 * sin(11 * dth - wph));
    QX[n] = x + (ty / l) * fw; QY[n] = y - (tx / l) * fw; n++;
  }
  smoothClosed(ctx, n);
  ctx.fillStyle = rgba(mixc(col.body, CU_FIN, 0.55), 0.3); ctx.fill();
  // light catching the crests of the ripples
  ctx.beginPath();
  for (let i = 0; i < NF; i++) {
    const th = th0 + ((i + 0.5) / NF) * (TAU - 2 * th0), dth = th < PI ? th : TAU - th;
    if (sin(11 * dth - wph + 0.9) < 0.35) continue;
    const j = 2 * NF + 1 - i;
    ctx.moveTo(QX[i], QY[i]); ctx.lineTo(QX[i + 1], QY[i + 1]); ctx.lineTo(QX[j - 1], QY[j - 1]); ctx.lineTo(QX[j], QY[j]); ctx.closePath();
  }
  ctx.fillStyle = rgba(WHITE, 0.16); ctx.fill();
  if (hd) {
    ctx.beginPath();
    for (let i = 0; i <= NF; i += 2) { const j = 2 * NF + 1 - i; ctx.moveTo(QX[i], QY[i]); ctx.lineTo(QX[j], QY[j]); }
    ctx.strokeStyle = rgba(WHITE, 0.14); ctx.lineWidth = lw(0.7); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(QX[NF + 1], QY[NF + 1]);
  for (let i = NF + 2; i < n; i++) ctx.lineTo(QX[i], QY[i]);
  ctx.strokeStyle = rgba(mixc(CU_FIN, CU_IRID, 0.35), 0.7); ctx.lineWidth = lw(1.2); ctx.stroke();
  // ---- feeding tentacles (shot out ahead when striking), under the arms
  const ctx2 = 0.95 + 2.05 * sk;
  if (sk > 0.02) {
    ctx.beginPath();
    for (const sg of SIDES) {
      const ty = sg * (0.05 + 0.03 * sin(t * 3 + sg));
      taper(ctx, 0.85, sg * 0.06, (0.85 + ctx2) / 2, sg * 0.1 + 0.03 * sin(t * 5), ctx2 - 0.16, ty, 0.032, 0.022, 10);
    }
    ctx.fillStyle = rgba(CU_TENT, 0.95); ctx.fill();
    ctx.strokeStyle = rgba(col.mem, 0.8); ctx.lineWidth = lw(1); ctx.stroke();
  }
  // ---- arms: soft, tapering, gently curling; they part to let the tentacles out
  ctx.beginPath();
  for (let i = 0; i < 4; i++) for (const sg of SIDES) cuArm(ctx, i, sg, sk, t);
  ctx.fillStyle = rgba(base, 0.94); ctx.fill();
  fillIn(ctx, H.bodyGrad(ctx, shade, 0.7), 1.05, 0, 0.6, 0.3 + 0.15 * sk);
  ctx.strokeStyle = rgba(shade, 0.45); ctx.lineWidth = lw(1); ctx.stroke();
  // pale stripe along the dorsal arms
  ctx.beginPath();
  for (let i = 2; i < 4; i++) for (const sg of SIDES) {
    const ry = CU_ARMS[4 * i], tx = CU_ARMS[4 * i + 1] - 0.12 * sk, ty = CU_ARMS[4 * i + 2] * (1 + 0.8 * sk) + 0.08 * sk;
    const wv = 0.03 * sin(t * 1.6 + i * 1.3 + sg), curl = 0.05 * sin(t * 1.1 + i * 2 + sg * 0.7) + sg * 0.09 * sk * (0.6 + 0.2 * i);
    ctx.moveTo(0.84, sg * ry); ctx.quadraticCurveTo((0.84 + tx) / 2, sg * ((ry + ty) / 2 + 0.06 * sk) + wv, lerp(0.84, tx, 0.8), sg * lerp(ry, ty, 0.8) + (wv * 1.4 + curl) * 0.7);
  }
  ctx.strokeStyle = 'rgba(255,240,222,0.35)'; ctx.lineWidth = lw(hd ? 2.4 : 1.4); ctx.stroke();
  // tentacle clubs with their suckers
  if (sk > 0.02) {
    for (const sg of SIDES) {
      const ty = sg * (0.05 + 0.03 * sin(t * 3 + sg));
      ctx.beginPath(); ell(ctx, ctx2, ty, 0.2, 0.075, 0.04 * sg);
      ctx.fillStyle = rgba(CU_TENT, 0.6); ctx.fill();
      fillIn(ctx, H.bodyGrad(ctx, CU_TENT), ctx2, ty, 0.2, 0.08);
      ctx.strokeStyle = rgba(col.mem, 0.85); ctx.lineWidth = lw(1.1); ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < (hd ? 7 : 4); k++) { const u = -0.7 + k * (1.4 / (hd ? 6 : 3)); circ(ctx, ctx2 + u * 0.16, ty + sg * 0.012, hd ? 0.018 : 0.022); }
      ctx.fillStyle = 'rgba(255,240,235,0.85)'; ctx.fill();
    }
  }
  // ---- head
  ctx.beginPath(); ell(ctx, 0.6, 0, 0.3, 0.35);
  ctx.fillStyle = rgba(base, 0.92); ctx.fill();
  fillIn(ctx, H.bodyGrad(ctx, shade, 0.75), 0.6, 0, 0.3, 0.36);
  ctx.globalAlpha = A0;
  ctx.strokeStyle = rgba(col.mem, lerp(0.55, 0.25, camo)); ctx.lineWidth = lw(1.3); ctx.stroke();
  ctx.globalAlpha = A0 * bA;
  ctx.beginPath(); ell(ctx, 0.72, 0, 0.07, 0.05);
  ctx.fillStyle = 'rgba(255,240,222,0.22)'; ctx.fill();
  // ---- mantle
  mantlePath(ctx);
  ctx.fillStyle = rgba(base, 0.92); ctx.fill();
  fillIn(ctx, H.bodyGrad(ctx, shade, 0.75), MC, 0, MA * 1.04, MB * 1.04);
  if (camo > 0.01) { ctx.globalAlpha = A0 * min(1, camo * (1.3 - camo) * 1.8); fillIn(ctx, H.bodyGrad(ctx, CU_BG), MC, 0, MA * 1.04, MB * 1.04); ctx.globalAlpha = A0 * bA; }
  ctx.save(); ctx.clip();
  // static mottle
  ctx.beginPath();
  for (let i = 0; i < CU_BLOT.length; i += 3) ell(ctx, CU_BLOT[i], CU_BLOT[i + 1], CU_BLOT[i + 2] * 1.3, CU_BLOT[i + 2], i * 0.7);
  ctx.fillStyle = rgba(col.nuc, 0.2); ctx.fill();
  // passing clouds: dark chromatophore bands sweeping from the tail to the head
  for (let k = 0; k < 3; k++) {
    const f = frac(t * 0.3 + k / 3 + e.seed), x = -1.15 + f * 1.8, a = pow(sin(f * PI), 0.8);
    ctx.beginPath(); ctx.moveTo(x - 0.22, -0.75); ctx.quadraticCurveTo(x + 0.14, 0, x - 0.22, 0.75);
    ctx.strokeStyle = rgba(col.nuc, 0.22 * a); ctx.lineWidth = 0.32; ctx.stroke();
    ctx.strokeStyle = rgba(col.nuc, 0.38 * a); ctx.lineWidth = 0.15; ctx.stroke();
  }
  // leucophores: the white dorsal square and pale spots along the fin base
  ctx.beginPath(); ell(ctx, -0.07, 0, 0.085, 0.07);
  ctx.fillStyle = 'rgba(255,248,236,0.18)'; ctx.fill();
  ctx.beginPath();
  for (let i = 90; i < (hd ? 130 : 104); i++) circ(ctx, MC + CU_SPOT[3 * i] * MA, CU_SPOT[3 * i + 1] * MB, (hd ? 0.016 : 0.022) * CU_SPOT[3 * i + 2]);
  ctx.fillStyle = 'rgba(255,250,240,0.32)'; ctx.fill();
  if (hd) {
    // chromatophores: tiny pigment sacs expanding and shrinking in waves
    ctx.beginPath();
    for (let i = 0; i < 90; i++) { const x = MC + CU_SPOT[3 * i] * MA, r = 0.012 * CU_SPOT[3 * i + 2] * (1 + 0.5 * sin(t * 2.2 - x * 4 + i)); circ(ctx, x, CU_SPOT[3 * i + 1] * MB, r); }
    ctx.fillStyle = rgba(col.nuc, 0.5); ctx.fill();
    // iridescent sheen along the fin base
    ctx.globalCompositeOperation = 'lighter';
    mantlePath(ctx, 0.95); ctx.strokeStyle = rgba(CU_IRID, 0.14); ctx.lineWidth = lw(3); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  mantlePath(ctx);
  ctx.globalAlpha = A0;
  ctx.strokeStyle = rgba(col.mem, lerp(0.6, 0.26, camo)); ctx.lineWidth = lw(1.5); ctx.stroke();
  // ---- eyes: bulging, a golden iris hooded by the eyelid, W-shaped pupil (visible even when camouflaged)
  for (const sg of SIDES) {
    ctx.save(); ctx.translate(0.6, sg * 0.33); ctx.scale(1, sg);
    ctx.globalAlpha = A0 * lerp(1, 0.35, camo);
    ctx.beginPath(); ell(ctx, 0, 0.012, 0.155, 0.11);
    ctx.fillStyle = rgba(base, 0.96); ctx.fill();
    ctx.strokeStyle = rgba(shade, 0.6); ctx.lineWidth = lw(1.1); ctx.stroke();
    ctx.globalAlpha = A0 * (1 - 0.1 * camo);
    ctx.beginPath(); ell(ctx, 0.005, 0.022, 0.128, 0.082);
    fillIn(ctx, H.nucGrad(ctx, CU_IRIS), -0.015, 0.03, 0.14, 0.09);
    // the W: gently arched top, two lobes hanging below a central cusp
    const dl = 1 + 0.12 * sin(t * 0.7);
    ctx.save(); ctx.translate(0.005, 0.03); ctx.scale(1.12, 1.1 * dl);
    ctx.beginPath();
    ctx.moveTo(-0.088, -0.01);
    ctx.quadraticCurveTo(0, -0.032, 0.088, -0.01);
    ctx.quadraticCurveTo(0.084, 0.046, 0.048, 0.05);
    ctx.quadraticCurveTo(0.018, 0.05, 0, 0.02);
    ctx.quadraticCurveTo(-0.018, 0.05, -0.048, 0.05);
    ctx.quadraticCurveTo(-0.084, 0.046, -0.088, -0.01);
    ctx.closePath();
    ctx.fillStyle = '#100a0e'; ctx.fill();
    ctx.restore();
    if (hd) {
      // fine radial striations of the iris
      ctx.beginPath();
      for (let k = 0; k < 14; k++) { const a = PI + 0.25 + (k / 13) * (PI - 0.5); ctx.moveTo(0.005 + cos(a) * 0.07, 0.035 + sin(a) * 0.035); ctx.lineTo(0.005 + cos(a) * 0.12, 0.024 + sin(a) * 0.072); }
      ctx.strokeStyle = 'rgba(120,80,30,0.35)'; ctx.lineWidth = lw(1); ctx.stroke();
    }
    // the eyelid hooding the top of the eye
    ctx.beginPath(); ctx.ellipse(0, 0.012, 0.156, 0.112, 0, PI, TAU); ctx.quadraticCurveTo(0, -0.02, -0.156, 0.012); ctx.closePath();
    ctx.fillStyle = rgba(base, 0.97); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.14, 0.006); ctx.quadraticCurveTo(0, -0.022, -0.14, 0.006);
    ctx.strokeStyle = rgba(shade, 0.75); ctx.lineWidth = lw(hd ? 2.2 : 1.4); ctx.stroke();
    ctx.beginPath(); circ(ctx, -0.05, sg < 0 ? 0.06 : 0.018, 0.017); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    if (hd) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.ellipse(0.005, 0.022, 0.116, 0.072, 0, 0.3, 2.8);
      ctx.strokeStyle = rgba(CU_IRID, 0.25); ctx.lineWidth = lw(1.5); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }
  ctx.globalAlpha = A0 * bA;
  shine(ctx, H, e, MC + 0.1, 0, 0.85);
  ctx.restore();
}

// the ink pseudomorph: a dark, soft, cuttlefish-shaped blob of ink and mucus, no eyes, wispy edges
const INK_PROF = [1.38, 0, 1.32, 0.09, 1.15, 0.17, 0.92, 0.25, 0.66, 0.35, 0.45, 0.44, 0.2, 0.6, -0.15, 0.66, -0.5, 0.6, -0.8, 0.45, -1.02, 0.22, -1.1, 0];
function inkPath(ctx, t, k, sd) {
  const m = INK_PROF.length >> 1; let n = 0;
  for (let i = 0; i < m; i++) { const x = INK_PROF[2 * i], w = INK_PROF[2 * i + 1] * k * (1 + 0.09 * sin(t * 0.9 + i * 1.9 + sd)); QX[n] = x * (0.92 + 0.08 * k); QY[n] = -w; n++; }
  for (let i = m - 2; i >= 1; i--) { const x = INK_PROF[2 * i], w = INK_PROF[2 * i + 1] * k * (1 + 0.09 * sin(t * 0.8 + i * 2.3 + sd + 1)); QX[n] = x * (0.92 + 0.08 * k); QY[n] = w; n++; }
  smoothClosed(ctx, n);
}
function drawInk(ctx, e, t, s, H, lw, A0) {
  const sd = e.seed * 7;
  // soft dark core: overlapping dark glow sprites (drawn normally, so they darken)
  const sp = H.glowSprite(CU_INK);
  ctx.globalAlpha = A0 * 0.8;
  for (let i = 0; i < 6; i++) { const x = -0.85 + i * 0.36, r = 0.95 - abs(x + 0.1) * 0.35; ctx.drawImage(sp, x - r, -r, r * 2, r * 2); }
  if (H.lod) { ctx.globalAlpha = A0; return; }
  // soft puffs billowing off the edges, slowly drifting outwards and backwards
  const pf = H.glowSprite(CU_INK);
  for (let i = 0; i < 16; i++) {
    const sg = i & 1 ? 1 : -1, f = (i >> 1) / 7.5, x = lerp(1.1, -1.0, f), w = profW(INK_PROF, x);
    const drift = frac(t * 0.12 + hash(i)), r = 0.24 + 0.14 * hash(i + 4) + 0.2 * drift;
    ctx.globalAlpha = A0 * 0.5 * (1 - drift) * min(1, drift * 5);
    ctx.drawImage(pf, x - 0.25 * drift - r, sg * (w + 0.1 + 0.25 * drift) - r, r * 2, r * 2);
  }
  ctx.globalAlpha = A0;
  // a few curling wisps trailing behind
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const sg = i & 1 ? 1 : -1, y0 = sg * (0.12 + 0.18 * (i >> 1)), c = 0.12 * sin(t * 0.6 + i * 1.7);
    ctx.moveTo(-0.95, y0); ctx.bezierCurveTo(-1.2, y0 + c, -1.35, y0 + sg * 0.2 - c, -1.55 - 0.1 * (i >> 1), y0 + sg * (0.15 + 0.1 * sin(t * 0.8 + i)));
  }
  ctx.strokeStyle = rgba(CU_INK, 0.14); ctx.lineWidth = 0.14; ctx.stroke();
  ctx.strokeStyle = rgba(CU_INK, 0.3); ctx.lineWidth = 0.05; ctx.stroke();
  // layered silhouette: fainter, larger rims and a dense middle, for a diffuse edge
  for (const [k, a] of [[1.24, 0.1], [1.12, 0.18], [1.0, 0.36], [0.86, 0.4]]) { inkPath(ctx, t, k, sd); ctx.globalAlpha = A0 * a; ctx.fillStyle = rgba(CU_INK); ctx.fill(); }
  ctx.globalAlpha = A0;
  // faint sheen of the mucus surface
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = A0 * 0.07;
  ctx.drawImage(H.glowSprite([140, 120, 160]), -0.6, -0.55, 0.8, 0.6);
  ctx.globalAlpha = A0; ctx.globalCompositeOperation = 'source-over';
}

// =====================================================================================================
// mantis (boss) — peacock mantis shrimp from above: green armour, stalked trinocular eyes, pink antennal
// scales, red legs, segmented abdomen, blue/orange tail fan and a pair of folded raptorial clubs.
// cockK (clubs drawn back), strikeK (clubs punched forward with a cavitation flash).
// =====================================================================================================
const MS_COL = { body: [64, 196, 122], mem: [208, 255, 224], nuc: [236, 72, 70], glow: [120, 255, 170] };
const MS_LEG = [255, 112, 82], MS_SCALE = [255, 118, 150], MS_BLUE = [70, 140, 255], MS_ORANGE = [255, 168, 64];
const MS_LIME = [170, 230, 90], MS_EYE = [86, 226, 206], MS_CLUB = [255, 224, 234], MS_MERUS = [250, 178, 152], MS_PROP = [255, 120, 120], MS_DARK = [16, 64, 46];
const MS_AB = [0.1, -0.07, -0.24, -0.41, -0.58, -0.75, -0.92];        // abdominal tergite boundaries
const MS_ABW = [0.34, 0.37, 0.39, 0.4, 0.385, 0.33];
const MS_TH = [0.42, 0.33, 0.22, 0.1], MS_THW = [0.26, 0.29, 0.32];
const MS_PROF = [1.12, 0, 1.0, 0.12, 0.9, 0.22, 0.5, 0.32, 0.3, 0.32, 0.1, 0.36, -0.3, 0.4, -0.7, 0.37, -0.92, 0.32, -1.2, 0.25, -1.34, 0];
// raptorial appendage key poses (shoulder S fixed; elbow K and club P): rest / cocked / strike
const RP = { S: [0.76, 0.17], K: [[0.55, 0.43], [0.4, 0.48], [1.02, 0.31]], P: [[1.03, 0.37], [0.68, 0.56], [1.6, 0.17]] };
const MS_K = 0.87;                                                   // the whole animal is drawn at this scale

function msPlate(ctx, H, pc, col, base, xf, xb, w, lw, hd, t, i) {
  const xm = (xf + xb) / 2, hl = (xf - xb) / 2 + 0.035, y = bend(xm), a = atan2(bend(xf) - bend(xb), xf - xb);
  ctx.save(); ctx.translate(xm, y); ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(hl, -w * 0.93);
  ctx.lineTo(-hl + 0.06, -w);
  ctx.lineTo(-hl - 0.025, -w - 0.04);
  ctx.quadraticCurveTo(-hl + 0.0, -w * 0.5, -hl - 0.03, 0);
  ctx.quadraticCurveTo(-hl + 0.0, w * 0.5, -hl - 0.025, w + 0.04);
  ctx.lineTo(-hl + 0.06, w);
  ctx.lineTo(hl, w * 0.93);
  ctx.closePath();
  ctx.fillStyle = rgba(base, 0.92); ctx.fill();
  fillIn(ctx, H.bandGrad(ctx, pc), 0, 0, 1, w);
  ctx.strokeStyle = rgba(MS_DARK, 0.75); ctx.lineWidth = lw(1.3); ctx.stroke();
  // darker posterior margin with a pale rim, then the carinae (longitudinal ridges)
  ctx.beginPath(); ctx.moveTo(-hl + 0.02, -w * 0.92); ctx.quadraticCurveTo(-hl + 0.035, 0, -hl + 0.02, w * 0.92);
  ctx.strokeStyle = rgba(MS_DARK, 0.4); ctx.lineWidth = 0.035; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-hl - 0.012, -w * 0.9); ctx.quadraticCurveTo(-hl + 0.005, 0, -hl - 0.012, w * 0.9);
  ctx.strokeStyle = 'rgba(235,255,160,0.4)'; ctx.lineWidth = lw(1.3); ctx.stroke();
  ctx.beginPath();
  for (const v of hd ? [-0.72, -0.4, -0.12, 0.12, 0.4, 0.72] : [-0.4, 0.4]) { ctx.moveTo(hl - 0.03, v * w); ctx.lineTo(-hl + 0.05, v * w * 1.02); }
  ctx.strokeStyle = rgba(col.mem, hd ? 0.28 : 0.3); ctx.lineWidth = lw(1); ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (let k = 0; k < 5; k++) circ(ctx, (hash(i * 7 + k) - 0.5) * hl * 1.4, (hash(i * 5 + k + 50) - 0.5) * w * 1.6, 0.012);
    ctx.fillStyle = rgba(MS_DARK, 0.45); ctx.fill();
    // a bright yellow-green glint on the leading edge of each plate
    ctx.beginPath(); ctx.moveTo(hl - 0.01, -w * 0.6); ctx.lineTo(hl - 0.01, w * 0.6);
    ctx.strokeStyle = 'rgba(230,255,170,0.3)'; ctx.lineWidth = lw(1.6); ctx.stroke();
  }
  ctx.restore();
}

function drawMantis(ctx, e, t, s, H) {
  const col = H.col, lw0 = H.lwb || H.lw, lw = (px) => lw0(px) / MS_K, A0 = ctx.globalAlpha, hd = H.hd;
  const sk = ease(e.strikeK || 0), ckr = ease(e.cockK || 0), ck = ckr * (1 - sk);
  const base = mixc(col.body, MS_DARK, 0.45);
  ctx.save();
  ctx.scale(MS_K, MS_K);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  setBend(0.045, t * 1.5, 2.0, 0.15, 1.4, 2);
  if (H.lod) {
    profilePath(ctx, MS_PROF); ctx.fillStyle = rgba(col.body, 0.9); ctx.fill();
    ctx.beginPath(); for (const sg of SIDES) circ(ctx, 1.18, sg * 0.18, 0.11); ctx.fillStyle = rgba(MS_EYE); ctx.fill();
    ctx.restore(); return;
  }
  // ---- antennules (three flagella each) and antennae
  ctx.beginPath();
  for (const sg of SIDES) {
    for (let k = 0; k < 3; k++) {
      const sw = 0.07 * sin(t * (1.5 + k * 0.3) + sg + k), ex = 1.95 - k * 0.07 + 0.05 * sin(t + k), ey = sg * (0.16 + k * 0.13 + sw * 2);
      ctx.moveTo(1.36, sg * 0.09); ctx.quadraticCurveTo(1.65, sg * (0.1 + k * 0.05) + sw, ex, ey);
    }
    const sw = 0.08 * sin(t * 1.2 + sg * 2);
    ctx.moveTo(1.12, sg * 0.25); ctx.bezierCurveTo(1.35, sg * (0.38 + sw), 1.6, sg * (0.6 + sw), 1.75, sg * (0.82 + sw * 2));
  }
  ctx.strokeStyle = rgba(mixc(MS_ORANGE, WHITE, 0.35), 0.8); ctx.lineWidth = lw(1.1); ctx.stroke();
  ctx.beginPath();
  for (const sg of SIDES) capsule(ctx, 1.02, sg * 0.04, 1.37, sg * 0.09, 0.024, 0.02);
  ctx.fillStyle = rgba(mixc(col.body, MS_BLUE, 0.3), 0.95); ctx.fill();
  ctx.strokeStyle = rgba(col.mem, 0.6); ctx.lineWidth = lw(0.9); ctx.stroke();
  // ---- walking legs (thoracic) and pleopods (abdomen)
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = 0.37 - i * 0.1;
    for (const sg of SIDES) {
      const stp = 0.035 * sin(t * 3 + i * 2.1 + (sg > 0 ? 0 : PI)), kx = x + 0.015 + stp * 0.3, ky = sg * (0.44 + 0.01 * i), fx = x - 0.1 + stp, fy = sg * (0.55 + 0.015 * i);
      capsule(ctx, x, sg * 0.24, kx, ky, 0.03, 0.026); capsule(ctx, kx, ky, fx, fy, 0.024, 0.014);
    }
  }
  ctx.fillStyle = rgba(MS_LEG, 0.95); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,195,0.75)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 3; i++) { const x = 0.37 - i * 0.1; for (const sg of SIDES) { const stp = 0.035 * sin(t * 3 + i * 2.1 + (sg > 0 ? 0 : PI)); circ(ctx, x + 0.015 + stp * 0.3, sg * (0.44 + 0.01 * i), 0.022); } }
  ctx.fillStyle = 'rgba(255,235,215,0.85)'; ctx.fill();
  for (let i = 0; i < 5; i++) {
    const x = (MS_AB[i] + MS_AB[i + 1]) / 2, y = bend(x), w = MS_ABW[i], b = sin(t * 6 - i * 1.1);
    ctx.beginPath();
    for (const sg of SIDES) {
      const rx = x + 0.02, ry = y + sg * (w - 0.06), tx = x - 0.11 - 0.06 * b, ty = y + sg * (w + 0.14 + 0.02 * b);
      ctx.moveTo(rx + 0.04, ry); ctx.quadraticCurveTo(tx + 0.08, ty, tx, ty); ctx.quadraticCurveTo(tx + 0.02, ty - sg * 0.07, rx - 0.04, ry); ctx.closePath();
    }
    ctx.fillStyle = rgba(MS_LEG, 0.7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,190,0.6)'; ctx.lineWidth = lw(0.9); ctx.stroke();
  }
  if (hd) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = (MS_AB[i] + MS_AB[i + 1]) / 2, y = bend(x), w = MS_ABW[i], b = sin(t * 6 - i * 1.1);
      for (const sg of SIDES) { const tx = x - 0.11 - 0.06 * b, ty = y + sg * (w + 0.14 + 0.02 * b); for (let k = 0; k < 4; k++) { const u = 0.4 + k * 0.18, px = lerp(x, tx, u), py = lerp(y + sg * (w - 0.06), ty, u); ctx.moveTo(px, py); ctx.lineTo(px - 0.05, py + sg * 0.035); } }
    }
    ctx.strokeStyle = 'rgba(255,200,170,0.5)'; ctx.lineWidth = lw(0.8); ctx.stroke();
  }
  // ---- tail fan: uropods (blue endopod, orange exopod, long protopod spine) + telson
  {
    const x = -0.92, y = bend(x), a = tailA(x), fan = 0.08 * sin(t * 1.5);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);               // +x now points backwards
    for (const sg of SIDES) {
      const r = sg * (0.62 + fan);
      ctx.beginPath(); ell(ctx, 0.04 + cos(r) * 0.2, sg * 0.22 + sin(r) * 0.2, 0.21, 0.075, r);
      ctx.fillStyle = rgba(MS_ORANGE, 0.9); ctx.fill(); ctx.strokeStyle = 'rgba(255,230,190,0.85)'; ctx.lineWidth = lw(1.1); ctx.stroke();
      const r2 = sg * (0.3 + fan * 0.7);
      ctx.beginPath(); ell(ctx, 0.06 + cos(r2) * 0.2, sg * 0.17 + sin(r2) * 0.2, 0.2, 0.08, r2);
      ctx.fillStyle = rgba(MS_BLUE, 0.92); ctx.fill(); ctx.strokeStyle = 'rgba(200,225,255,0.85)'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.0, sg * 0.24); ctx.lineTo(0.38, sg * (0.34 + 0.5 * fan * sg));
      ctx.strokeStyle = 'rgba(255,240,215,0.9)'; ctx.lineWidth = lw(2); ctx.stroke();
      if (hd) {
        ctx.beginPath();
        for (let k = 0; k < 7; k++) { const b = -0.9 + k * 0.3, px = 0.04 + cos(r) * 0.2 + cos(r) * cos(b) * 0.21 - sin(r) * sin(b) * 0.075 * sg, py = sg * 0.22 + sin(r) * 0.2 + sin(r) * cos(b) * 0.21 + cos(r) * sin(b) * 0.075 * sg; ctx.moveTo(px, py); ctx.lineTo(px + cos(r) * 0.05, py + sin(r) * 0.05); }
        ctx.strokeStyle = 'rgba(255,240,210,0.8)'; ctx.lineWidth = lw(1.2); ctx.stroke();
        ctx.beginPath(); ell(ctx, 0.06 + cos(r2) * 0.24, sg * 0.17 + sin(r2) * 0.24, 0.06, 0.03, r2);
        ctx.fillStyle = 'rgba(20,30,90,0.55)'; ctx.fill();
      }
    }
    // telson: shield with marginal teeth and carinae
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.3); ctx.quadraticCurveTo(0.18, -0.32, 0.3, -0.24); ctx.lineTo(0.34, -0.27); ctx.lineTo(0.36, -0.17);
    ctx.lineTo(0.41, -0.15); ctx.lineTo(0.42, -0.07); ctx.lineTo(0.47, -0.03); ctx.lineTo(0.43, 0); ctx.lineTo(0.47, 0.03); ctx.lineTo(0.42, 0.07);
    ctx.lineTo(0.41, 0.15); ctx.lineTo(0.36, 0.17); ctx.lineTo(0.34, 0.27); ctx.lineTo(0.3, 0.24); ctx.quadraticCurveTo(0.18, 0.32, -0.02, 0.3); ctx.closePath();
    ctx.fillStyle = rgba(base, 0.92); ctx.fill();
    fillIn(ctx, H.bandGrad(ctx, col.body), 0, 0, 1, 0.32);
    ctx.strokeStyle = rgba(MS_DARK, 0.8); ctx.lineWidth = lw(1.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.02, 0); ctx.lineTo(0.4, 0);
    for (const sg of SIDES) { ctx.moveTo(0.04, sg * 0.12); ctx.quadraticCurveTo(0.24, sg * 0.14, 0.34, sg * 0.2); }
    ctx.strokeStyle = rgba(col.mem, 0.45); ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.restore();
  }
  // ---- abdomen (rear plates first, so each overlaps the next) and exposed thoracic somites
  for (let i = 5; i >= 0; i--) msPlate(ctx, H, mixc(col.body, MS_LIME, 0.32 * (1 - i / 5)), col, base, MS_AB[i], MS_AB[i + 1], MS_ABW[i], lw, hd, t, i);
  for (let i = 2; i >= 0; i--) {
    const xf = MS_TH[i], xb = MS_TH[i + 1], w = MS_THW[i];
    ctx.beginPath(); ctx.moveTo(xf + 0.02, -w * 0.85); ctx.lineTo(xb + 0.04, -w); ctx.lineTo(xb - 0.01, -w - 0.06); ctx.quadraticCurveTo(xb + 0.01, 0, xb - 0.01, w + 0.06); ctx.lineTo(xb + 0.04, w); ctx.lineTo(xf + 0.02, w * 0.85); ctx.closePath();
    ctx.fillStyle = rgba(base, 0.92); ctx.fill();
    fillIn(ctx, H.bandGrad(ctx, col.body), 0, 0, 1, w);
    ctx.strokeStyle = rgba(MS_DARK, 0.75); ctx.lineWidth = lw(1.2); ctx.stroke();
  }
  // ---- raptorial appendages: merus from under the carapace, propodus, white club (dactyl heel)
  const KX = [], PX_ = [];
  for (const sg of SIDES) {
    const S = RP.S;
    let kx = lerp(lerp(RP.K[0][0], RP.K[1][0], ck), RP.K[2][0], sk), ky = lerp(lerp(RP.K[0][1], RP.K[1][1], ck), RP.K[2][1], sk);
    let px = lerp(lerp(RP.P[0][0], RP.P[1][0], ck), RP.P[2][0], sk), py = lerp(lerp(RP.P[0][1], RP.P[1][1], ck), RP.P[2][1], sk);
    const idle = (1 - sk) * 0.012 * sin(t * 2 + sg);
    ky += idle; py += idle;
    const sx = S[0], sy = sg * S[1], ky2 = sg * ky, py2 = sg * py;
    KX.push(kx, ky2); PX_.push(px, py2);
    // merus (pale, leopard-spotted, bulging when cocked)
    const ma = atan2(ky2 - sy, kx - sx), ml = hypot(kx - sx, ky2 - sy), mw = 0.095 + 0.018 * ck;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ma);
    ctx.beginPath(); capsule(ctx, 0, 0, ml, 0, 0.07, mw);
    ctx.fillStyle = rgba(mixc(MS_MERUS, MS_PROP, 0.35), 0.95); ctx.fill();
    fillIn(ctx, H.bandGrad(ctx, MS_MERUS), 0, 0, 1, mw);
    ctx.strokeStyle = 'rgba(255,232,218,0.9)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < (hd ? 10 : 4); k++) circ(ctx, ml * (0.18 + hash(k + 3) * 0.75), (hash(k + 11) - 0.5) * mw * 1.3, 0.013 + 0.011 * hash(k));
    ctx.fillStyle = 'rgba(130,30,45,0.6)'; ctx.fill();
    ctx.restore();
    // propodus
    const pa = atan2(py2 - ky2, px - kx), pl = hypot(px - kx, py2 - ky2);
    ctx.save(); ctx.translate(kx, ky2); ctx.rotate(pa);
    ctx.beginPath(); capsule(ctx, 0, 0, pl, 0, 0.062, 0.07);
    ctx.fillStyle = rgba(mixc(MS_PROP, MS_DARK, 0.15), 0.95); ctx.fill();
    fillIn(ctx, H.bandGrad(ctx, MS_PROP), 0, 0, 1, 0.07);
    ctx.strokeStyle = 'rgba(255,222,216,0.9)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    // dactyl folded back along the propodus' inner edge (its heel is the club)
    const iy = -sg * (pa > -PI / 2 && pa < PI / 2 ? 1 : -1) * 0.045;
    ctx.beginPath();
    taper(ctx, pl, iy * 0.4, pl * 0.62, iy * 1.6, pl * 0.32, iy * 1.1, 0.042, 0.012, 6);
    ctx.fillStyle = rgba(mixc(MS_CLUB, MS_PROP, 0.3), 0.95); ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,240,0.9)'; ctx.lineWidth = lw(1); ctx.stroke();
    ctx.restore();
    // the club: mineralised dactyl heel
    ctx.beginPath(); circ(ctx, px, py2, 0.098 + 0.008 * ck);
    fillIn(ctx, H.nucGrad(ctx, MS_CLUB), px, py2, 0.105, 0.105);
    ctx.strokeStyle = 'rgba(190,90,110,0.8)'; ctx.lineWidth = lw(1.2); ctx.stroke();
    ctx.beginPath(); circ(ctx, px - 0.025, py2 - 0.03, 0.025); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  }
  // ---- carapace + rostral plate
  ctx.beginPath();
  ctx.moveTo(1.0, -0.05);
  ctx.quadraticCurveTo(0.99, -0.2, 0.86, -0.245);
  ctx.quadraticCurveTo(0.62, -0.3, 0.44, -0.31);
  ctx.quadraticCurveTo(0.39, -0.29, 0.4, -0.2);
  ctx.quadraticCurveTo(0.43, 0, 0.4, 0.2);
  ctx.quadraticCurveTo(0.39, 0.29, 0.44, 0.31);
  ctx.quadraticCurveTo(0.62, 0.3, 0.86, 0.245);
  ctx.quadraticCurveTo(0.99, 0.2, 1.0, 0.05);
  ctx.closePath();
  ctx.fillStyle = rgba(base, 0.92); ctx.fill();
  fillIn(ctx, H.bandGrad(ctx, col.body), 0, 0, 1, 0.31);
  ctx.strokeStyle = rgba(MS_DARK, 0.8); ctx.lineWidth = lw(1.4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.97, -0.045); ctx.lineTo(0.43, -0.05); ctx.moveTo(0.97, 0.045); ctx.lineTo(0.43, 0.05);
  for (const sg of SIDES) { ctx.moveTo(0.9, sg * 0.15); ctx.quadraticCurveTo(0.7, sg * 0.12, 0.5, sg * 0.24); }
  ctx.strokeStyle = rgba(col.mem, 0.35); ctx.lineWidth = lw(1.2); ctx.stroke();
  if (hd) {
    ctx.beginPath();
    for (let k = 0; k < 18; k++) { const x = 0.48 + hash(k + 70) * 0.46, y = (hash(k + 90) - 0.5) * 0.5 * (x < 0.9 ? 1 : 0.6); circ(ctx, x, y, 0.011 + 0.007 * hash(k)); }
    ctx.fillStyle = rgba(MS_DARK, 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.95, -0.12); ctx.quadraticCurveTo(0.7, -0.2, 0.47, -0.27);
    ctx.strokeStyle = 'rgba(230,255,180,0.3)'; ctx.lineWidth = lw(2); ctx.stroke();
  }
  ctx.beginPath();
  for (let k = 0; k < (hd ? 14 : 6); k++) { const x = 0.5 + hash(k + 130) * 0.42, y = (hash(k + 150) - 0.5) * 0.44; if (abs(y) < 0.06) continue; circ(ctx, x, y, (hd ? 0.016 : 0.022) + 0.01 * hash(k + 7)); }
  ctx.fillStyle = rgba(MS_ORANGE, 0.75); ctx.fill();
  if (hd) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const x = 0.55 + hash(k + 170) * 0.35, y = (hash(k + 180) - 0.5) * 0.4; if (abs(y) < 0.06) continue; circ(ctx, x, y, 0.014); }
    ctx.fillStyle = rgba(MS_BLUE, 0.7); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(0.98, -0.055); ctx.quadraticCurveTo(1.1, -0.04, 1.1, 0); ctx.quadraticCurveTo(1.1, 0.04, 0.98, 0.055); ctx.closePath();
  ctx.fillStyle = rgba(mixc(col.body, MS_ORANGE, 0.4), 0.95); ctx.fill(); ctx.strokeStyle = rgba(MS_DARK, 0.7); ctx.lineWidth = lw(1); ctx.stroke();
  // ---- antennal scales: pink paddles beside the eyes
  for (const sg of SIDES) {
    const a = sg * (0.62 + 0.08 * sin(t * 1.3 + sg));
    ctx.beginPath(); ell(ctx, 1.06 + cos(a) * 0.12, sg * 0.24 + sin(a) * 0.12 * sg * sg, 0.15, 0.06, a);
    fillIn(ctx, H.bodyGrad(ctx, MS_SCALE, 1.4), 1.06 + cos(a) * 0.12, sg * 0.24 + sin(a) * 0.12, 0.16, 0.16);
    ctx.strokeStyle = 'rgba(255,220,230,0.9)'; ctx.lineWidth = lw(1.1); ctx.stroke();
    if (hd) {
      ctx.beginPath();
      const cx2 = 1.06 + cos(a) * 0.12, cy2 = sg * 0.24 + sin(a) * 0.12;
      for (let k = 0; k < 9; k++) { const b = -1.4 + k * 0.35, px = cx2 + cos(a) * cos(b) * 0.15 - sin(a) * sin(b) * 0.06, py = cy2 + sin(a) * cos(b) * 0.15 + cos(a) * sin(b) * 0.06; ctx.moveTo(px, py); ctx.lineTo(px + (px - cx2) * 0.35, py + (py - cy2) * 0.35); }
      ctx.strokeStyle = 'rgba(255,200,215,0.7)'; ctx.lineWidth = lw(0.9); ctx.stroke();
    }
  }
  // ---- stalked trinocular eyes, swivelling independently
  for (const sg of SIDES) {
    const sw = 0.35 * sin(t * 0.8 + sg * 2.1) + 0.15 * sin(t * 2.3 + sg);
    const ex = 1.17 + 0.03 * sin(sw), ey = sg * (0.17 + 0.03 * sw * sg);
    ctx.beginPath(); ctx.moveTo(1.0, sg * 0.05); ctx.quadraticCurveTo(1.09, sg * 0.08, ex, ey);
    ctx.strokeStyle = rgba(mixc(col.body, MS_BLUE, 0.35)); ctx.lineWidth = 0.065; ctx.stroke();
    ctx.strokeStyle = rgba(col.mem, 0.5); ctx.lineWidth = lw(1); ctx.stroke();
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(sg * 0.45 + sw);
    ctx.beginPath(); ell(ctx, 0, 0, 0.09, 0.135);
    fillIn(ctx, H.nucGrad(ctx, MS_EYE), 0, 0, 0.1, 0.14);
    ctx.strokeStyle = 'rgba(10,50,45,0.85)'; ctx.lineWidth = lw(1.3); ctx.stroke();
    // the midband: rows of specialised ommatidia splitting the eye in two
    ctx.beginPath(); ctx.rect(-0.022, -0.128, 0.044, 0.256);
    ctx.fillStyle = 'rgba(150,80,190,0.55)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.022, -0.125); ctx.lineTo(-0.022, 0.125); ctx.moveTo(0.022, -0.125); ctx.lineTo(0.022, 0.125); ctx.moveTo(0, -0.13); ctx.lineTo(0, 0.13);
    ctx.strokeStyle = 'rgba(255,240,140,0.6)'; ctx.lineWidth = lw(1); ctx.stroke();
    if (hd) { H.dots(ctx, 26, sg + 2, 0, 0.3, 0.92, 0.009, 0, 0, 0.08, 0.125); ctx.fillStyle = 'rgba(210,255,240,0.35)'; ctx.fill(); }
    // three pseudopupils in a row across the band (trinocular vision)
    const gz = 0.03 * sin(t * 1.1 + sg);
    ctx.beginPath(); circ(ctx, -0.05, gz, 0.024); circ(ctx, 0, gz, 0.02); circ(ctx, 0.05, gz, 0.024);
    ctx.fillStyle = 'rgba(8,24,30,0.88)'; ctx.fill();
    ctx.beginPath(); circ(ctx, -0.035, -0.07, 0.022); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    ctx.restore();
  }
  shine(ctx, H, e, 0.1, 0, 0.9);
  // ---- charge glint on the clubs / strike flash
  for (let i = 0; i < 2; i++) {
    const px = PX_[2 * i], py = PX_[2 * i + 1], kx = KX[2 * i], ky = KX[2 * i + 1], l = hypot(px - kx, py - ky) || 1;
    if (sk > 0.01) cavitation(ctx, H, A0, px + ((px - kx) / l) * 0.16, py + ((py - ky) / l) * 0.16, sk, 0.5, lw);
    else if (ck > 0.02) glow(ctx, H, A0, MS_CLUB, px, py, 0.3, 0.45 * ck, 1);
  }
  ctx.restore();
}

export default {
  krill: {
    name: 'Krill', col: KR_COL, portraitR: 0.2, portraitRot: -0.5,
    states: [{ label: 'idle' }, { label: 'glowK 1 (photophores lit)', glowK: 1 }],
    draw: drawKrill,
  },
  larvalfish: {
    name: 'Larval fish', col: LF_COL, portraitR: 0.27, portraitRot: -0.4,
    states: [{ label: 'idle' }, { label: 'swim stretch 0.15', stretch: 0.15 }],
    draw: drawLarvalFish,
  },
  jellyfish: {
    name: 'Jellyfish', col: JF_COL, portraitR: 0.15, portraitRot: -1.05,
    states: [{ label: 'idle' }, { label: 'stingK 1', stingK: 1 }],
    draw: drawJellyfish,
  },
  pistolshrimp: {
    name: 'Pistol shrimp', col: PS_COL, portraitR: 0.25, portraitRot: -0.4,
    states: [{ label: 'idle' }, { label: 'cockK 1 (claw cocked)', cockK: 1 }, { label: 'snapK 1 (snap!)', snapK: 1, cockK: 1 }],
    draw: drawPistolShrimp,
  },
  anemone: {
    name: 'Sea anemone', col: AN_COL, portraitR: 0.25, portraitRot: -0.9,
    states: [{ label: 'idle' }, { label: 'reach 1', reach: 1 }, { label: 'closedK 1', closedK: 1 }],
    draw: drawAnemone,
  },
  cuttlefish: {
    name: 'Cuttlefish', col: CU_COL, portraitR: 0.3, portraitRot: -0.45, boss: true,
    states: [{ label: 'idle' }, { label: 'camo 0.8', camo: 0.8 }, { label: 'strikeK 1 (tentacles)', strikeK: 1 }, { label: 'decoy (ink pseudomorph)', decoy: true }],
    draw: drawCuttlefish,
  },
  mantis: {
    name: 'Peacock mantis shrimp', col: MS_COL, portraitR: 0.29, portraitRot: -0.45, boss: true,
    states: [{ label: 'idle' }, { label: 'cockK 1 (clubs drawn back)', cockK: 1 }, { label: 'strikeK 1 (punch!)', strikeK: 1 }],
    draw: drawMantis,
  },
};
