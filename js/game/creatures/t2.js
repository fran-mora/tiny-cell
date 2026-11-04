// Creature art for tier T2 (colony scale, 0.1–1 mm): nauplius, hydra, tardigrade, heliozoan, chytrid.
// Each entry: { name, col, portraitR, portraitRot, states, draw(ctx, e, t, s, H, opts) }. Conventions: ./README.md
// (unit space: 1 = collision radius, +x = facing; H.lod = cheap silhouette, H.hd = boss-scale detail).

const TAU = Math.PI * 2;
const { sin, cos, max, min, abs, exp, sqrt, PI, atan2, round } = Math;
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const hash = (i) => { const x = sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const WHITE = [255, 255, 255];

// Derived colours / style strings, built once per palette object (species default or boss override) and kind,
// so nothing is allocated per frame and the gradient / glow caches only ever see constant colours.
const PAL = new WeakMap();
function pal(H, kind, make) {
  let m = PAL.get(H.col);
  if (!m) { m = {}; PAL.set(H.col, m); }
  return m[kind] || (m[kind] = make(H.col, H));
}
// soft additive glow (cached sprite) centred at (x, y) with radius r
function glow(ctx, H, c, x, y, r, a, hard = 0) {
  if (a <= 0.003) return;
  const ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * min(1, a);
  ctx.drawImage(H.glowSprite(c, hard), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = 'source-over';
}
// world-fixed specular highlight for a body centred at (x, y) with radius ~k
function spec(ctx, H, ang, x, y, k) {
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k); H.highlight(ctx, ang); ctx.restore();
}
// smooth path through points xs/ys [i0..i1] (quadratic curves through the midpoints)
function smoothRun(ctx, xs, ys, i0, i1, move) {
  if (move) ctx.moveTo(xs[i0], ys[i0]); else ctx.lineTo(xs[i0], ys[i0]);
  for (let i = i0 + 1; i < i1; i++) ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
  ctx.lineTo(xs[i1], ys[i1]);
}
// closed capsule (tapered limb segment) from (x0,y0) to (x1,y1) with end radii w0, w1 — adds a sub-path
function capsule(ctx, x0, y0, x1, y1, w0, w1) {
  const d = atan2(y1 - y0, x1 - x0), c = cos(d), s = sin(d);
  ctx.moveTo(x0 + s * w0, y0 - c * w0);
  ctx.lineTo(x1 + s * w1, y1 - c * w1);
  ctx.arc(x1, y1, w1, d - PI / 2, d + PI / 2);
  ctx.lineTo(x0 - s * w0, y0 + c * w0);
  ctx.arc(x0, y0, w0, d + PI / 2, d + PI * 1.5);
  ctx.closePath();
}
function smoothClosed(ctx, xs, ys, n) {
  ctx.moveTo((xs[n - 1] + xs[0]) / 2, (ys[n - 1] + ys[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; ctx.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2); }
  ctx.closePath();
}

// =====================================================================================================
// Nauplius — copepod larva: pear-shaped body, three pairs of setose limbs (antennules, antennae, mandibles),
// a single red naupliar eye at the front. jumpK sweeps the limbs back in a power stroke.
// =====================================================================================================
// per limb pair (upper side, y < 0): base, rest angle, rowing amplitude, protopod + ramus lengths, biramous?, setae
const NL = [
  { x: 0.62, y: 0.44, a: -0.78, amp: 0.2, l1: 0.3, l2: 0.4, bi: 0, n: 4, sl: 0.5, ph: 0 },      // antennule
  { x: 0.28, y: 0.66, a: -1.48, amp: 0.46, l1: 0.36, l2: 0.42, bi: 1, n: 5, sl: 0.62, ph: 0.9 }, // antenna
  { x: -0.12, y: 0.64, a: -2.04, amp: 0.38, l1: 0.3, l2: 0.36, bi: 1, n: 4, sl: 0.5, ph: 1.8 },  // mandible
];
const NT = new Float32Array(12 * 5); // ramus tips: x, y, angle, setae count, seta length
const EYE_RED = [255, 60, 50];

function naupBody(ctx, k) {
  ctx.beginPath();
  ctx.moveTo(0.92, 0);
  ctx.bezierCurveTo(0.92, -0.52 * k, 0.62, -0.76 * k, 0.24, -0.76 * k);
  ctx.bezierCurveTo(-0.2, -0.76 * k, -0.62, -0.5 * k, -0.86, -0.2 * k);
  ctx.quadraticCurveTo(-0.97, -0.07 * k, -0.97, 0);
  ctx.quadraticCurveTo(-0.97, 0.07 * k, -0.86, 0.2 * k);
  ctx.bezierCurveTo(-0.62, 0.5 * k, -0.2, 0.76 * k, 0.24, 0.76 * k);
  ctx.bezierCurveTo(0.62, 0.76 * k, 0.92, 0.52 * k, 0.92, 0);
  ctx.closePath();
}

function drawNauplius(ctx, e, t, s, H) {
  const { lw, lwb, lod, hd, col } = H;
  const P = pal(H, 'naup', (c, h) => ({
    limbO: h.rgbStr(c.mem, 0.8), limbFill: h.rgbStr(h.mixRGB(c.body, WHITE, 0.2), 0.5),
    seta: h.rgbStr(c.mem, 0.62), setule: h.rgbStr(c.mem, 0.35), mem: h.cstr(c.mem),
    shield: h.rgbStr(c.mem, 0.22), gut: h.rgbStr(h.mixRGB(c.body, c.nuc, 0.35), 0.3), musc: h.rgbStr(c.mem, 0.16),
    oil: h.rgbStr(c.nuc, 0.85), oilHi: 'rgba(255,255,255,0.55)',
  }));
  const jk = ease(clamp01(e.jumpK || 0)), st = e.stretch || 0;
  const row = t * 4.2;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.scale(1 + st + jk * 0.04, 1 - st * 0.55 - jk * 0.03);
  // ---- limbs: protopod + one or two rami per limb, mirrored on both sides (translucent jointed capsules)
  let nt = 0;
  const wp = max(0.048, lw(1.6)), wr = max(0.03, lw(1.1));
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const L = NL[i];
    const o = sin(row - L.ph), oc = cos(row - L.ph);
    let a1 = L.a + L.amp * o * (1 - jk), a2 = a1 - 0.3 - 0.22 * oc * (1 - jk);
    a1 = lerp(a1, -2.7 - i * 0.12, jk); a2 = lerp(a2, -2.94 - i * 0.04, jk);
    for (let f = -1; f <= 1; f += 2) {
      const bx = L.x, by = -L.y * f;
      const jx = bx + cos(a1) * L.l1, jy = by + sin(a1) * L.l1 * f;
      if (lod) { ctx.moveTo(bx, by); ctx.lineTo(jx, jy); } else capsule(ctx, bx, by, jx, jy, wp * 1.15, wp);
      for (let r = 0; r <= L.bi; r++) {
        const ra = L.bi ? a2 + (r ? 0.24 : -0.16) * (1 - jk * 0.6) : a2, rl = r ? L.l2 * 0.72 : L.l2;
        const tx = jx + cos(ra) * rl, ty = jy + sin(ra) * rl * f;
        if (lod) { if (!r) { ctx.moveTo(jx, jy); ctx.lineTo(tx, ty); } } else capsule(ctx, jx, jy, tx, ty, wr * (r ? 0.85 : 1), wr * 0.6);
        const q = nt * 5; NT[q] = tx; NT[q + 1] = ty; NT[q + 2] = ra; NT[q + 3] = r ? L.n - 1 : L.n; NT[q + 4] = (r ? 0.8 : 1) * L.sl * f; nt++;
      }
    }
  }
  if (lod) {
    ctx.strokeStyle = P.limbO; ctx.lineWidth = max(0.08, lw(1.2)); ctx.stroke();
  } else {
    ctx.fillStyle = P.limbFill; ctx.fill();
    ctx.strokeStyle = P.limbO; ctx.lineWidth = lwb(1); ctx.stroke();
    // ---- setae: fans at each ramus tip curving back along the stroke (in HD each carries rows of setules,
    // the feathery side hairs); caudal spines at the rear
    const sp = lerp(0.4, 0.12, jk);
    for (let pass = 0; pass < (hd ? 2 : 1); pass++) {
      ctx.beginPath();
      for (let k = 0; k < nt; k++) {
        const q = k * 5, x = NT[q], y = NT[q + 1], ra = NT[q + 2], n = NT[q + 3], sl = NT[q + 4];
        const f = sl < 0 ? -1 : 1, len = abs(sl);
        for (let j = 0; j < n; j++) {
          const d = ra - 0.18 - jk * 0.15 + sp * ((n > 1 ? j / (n - 1) : 0.5) - 0.5) * 2 + 0.06 * sin(row * 1.3 + j + k);
          const l = len * (0.82 + 0.25 * hash(k * 7 + j)), bend = 0.28 + 0.2 * jk;
          const cx = x + cos(d) * l * 0.5, cy = y + sin(d) * l * 0.5 * f, ex = x + cos(d - bend) * l, ey = y + sin(d - bend) * l * f;
          if (pass === 0) { ctx.moveTo(x, y); ctx.quadraticCurveTo(cx, cy, ex, ey); continue; }
          for (let b = 1; b <= 5; b++) {
            const u = b / 6, m = 1 - u;
            const px = m * m * x + 2 * m * u * cx + u * u * ex, py = m * m * y + 2 * m * u * cy + u * u * ey;
            const tx = 2 * m * (cx - x) + 2 * u * (ex - cx), ty = 2 * m * (cy - y) + 2 * u * (ey - cy), tl = Math.hypot(tx, ty) || 1;
            const dx = tx / tl, dy = ty / tl, bl = 0.045 * (1.1 - u);
            ctx.moveTo(px - dy * bl + dx * bl * 0.7, py + dx * bl + dy * bl * 0.7); ctx.lineTo(px, py);
            ctx.lineTo(px + dy * bl + dx * bl * 0.7, py - dx * bl + dy * bl * 0.7);
          }
        }
      }
      if (pass === 0) {
        for (let f = -1; f <= 1; f += 2) { // caudal spines
          const fl = 0.12 * sin(row * 0.5) + jk * 0.1;
          ctx.moveTo(-0.9, 0.09 * f); ctx.quadraticCurveTo(-1.12, (0.14 + fl * 0.3) * f, -1.32, (0.2 + fl) * f);
        }
        ctx.strokeStyle = P.seta; ctx.lineWidth = max(0.016, lwb(0.9)); ctx.stroke();
      } else { ctx.strokeStyle = P.setule; ctx.lineWidth = lw(0.8); ctx.stroke(); }
    }
  }
  // ---- body
  const br = 1 + 0.025 * sin(t * 2.3);
  naupBody(ctx, br);
  ctx.fillStyle = H.bodyGrad(ctx, col.body); ctx.fill();
  ctx.strokeStyle = P.mem; ctx.lineWidth = lwb(1.6); ctx.stroke();
  if (!lod) {
    if (hd) {
      // dorsal shield rim, gut and the limb muscles seen through the glassy body
      ctx.save(); ctx.translate(0.04, 0); ctx.scale(0.86, 0.86); naupBody(ctx, br); ctx.restore();
      ctx.strokeStyle = P.shield; ctx.lineWidth = lwb(1); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-0.18, 0, 0.5, 0.16, 0, 0, TAU); ctx.fillStyle = P.gut; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) for (let f = -1; f <= 1; f += 2) { const x = NL[i].x, y = -NL[i].y * f; ctx.moveTo(x, y * 0.92); ctx.quadraticCurveTo(x * 0.85, y * 0.7, x * 0.7 + 0.03, y * 0.5); }
      ctx.strokeStyle = P.musc; ctx.lineWidth = lwb(1.4); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0.5, 0, 0.2, 0.17, 0, 0, TAU); ctx.strokeStyle = P.shield; ctx.lineWidth = lwb(1); ctx.stroke(); // labrum
    }
    // orange oil droplets (stored lipid)
    ctx.beginPath();
    ctx.moveTo(-0.08, -0.2); ctx.arc(-0.18, -0.2, 0.1, 0, TAU);
    ctx.moveTo(-0.33, 0.2); ctx.arc(-0.4, 0.2, 0.07, 0, TAU);
    ctx.moveTo(0.1, 0.27); ctx.arc(0.05, 0.27, 0.05, 0, TAU);
    if (hd) { ctx.moveTo(-0.52, -0.06); ctx.arc(-0.56, -0.06, 0.04, 0, TAU); }
    ctx.fillStyle = P.oil; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-0.19, -0.23); ctx.arc(-0.21, -0.23, 0.03, 0, TAU);
    ctx.moveTo(-0.4, 0.18); ctx.arc(-0.42, 0.18, 0.022, 0, TAU);
    ctx.fillStyle = P.oilHi; ctx.fill();
    // the naupliar eye: three fused red ocelli
    glow(ctx, H, EYE_RED, 0.64, 0, 0.26, 0.4);
    ctx.beginPath(); ctx.ellipse(0.64, 0, 0.085, 0.1, 0, 0, TAU); ctx.fillStyle = '#d8232c'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.7, -0.04); ctx.arc(0.665, -0.04, 0.034, 0, TAU); ctx.moveTo(0.7, 0.04); ctx.arc(0.665, 0.04, 0.034, 0, TAU);
    ctx.fillStyle = '#6a0410'; ctx.fill();
    ctx.beginPath(); ctx.arc(0.615, -0.045, 0.024, 0, TAU); ctx.fillStyle = 'rgba(255,235,235,0.85)'; ctx.fill();
    spec(ctx, H, e.ang || 0, 0.02, 0, 0.95);
  } else {
    ctx.beginPath(); ctx.arc(0.62, 0, 0.16, 0, TAU); ctx.fillStyle = '#e0303a'; ctx.fill();
  }
  ctx.restore();
}

// =====================================================================================================
// Hydra — freshwater polyp, anchored by its foot disc at −x; tubular column, hypostome (mouth cone) and a crown of
// six long tentacles beaded with nematocyst batteries at +x. A bud grows on its side. reach / strikeK / closedK.
// =====================================================================================================
const HB = 12, HM = 12;
const HCX = new Float32Array(HB), HCY = new Float32Array(HB), HW = new Float32Array(HB), HNX = new Float32Array(HB), HNY = new Float32Array(HB);
const HPX = new Float32Array(2 * HB + 2), HPY = new Float32Array(2 * HB + 2);
const TX = new Float32Array(6 * (HM + 1)), TY = new Float32Array(6 * (HM + 1)), TWD = new Float32Array(6 * (HM + 1)), TPH = new Float32Array(6 * (HM + 1));
const TL = new Float32Array(6);
const H_BASE = [-1.18, -0.7, -0.23, 0.23, 0.7, 1.18];

function drawHydra(ctx, e, t, s, H) {
  const { lw, lwb, lod, hd, col } = H;
  const P = pal(H, 'hydra', (c, h) => {
    const endo = h.mixRGB(c.body, c.nuc, 0.55);
    return {
      mem: h.cstr(c.mem), tent: h.rgbStr(h.mixRGB(c.body, c.mem, 0.3), 0.55), tentEdge: h.rgbStr(c.mem, 0.7),
      nema: h.rgbStr(h.mixRGB(c.mem, [255, 255, 235], 0.4), 0.55), nemaGlow: h.mixRGB(c.glow, WHITE, 0.45),
      endo: h.rgbStr(endo, 0.45), endoEdge: h.rgbStr(c.mem, 0.18), algae: h.rgbStr(c.nuc, 0.55), cavity: h.rgbStr(c.mem, 0.22),
      foot: h.rgbStr(h.mixRGB(c.body, c.nuc, 0.55), 0.85), mucus: h.mixRGB(c.mem, c.body, 0.4),
      crease: h.rgbStr(c.mem, 0.35), mouth: h.rgbStr(h.mixRGB(c.nuc, [40, 20, 20], 0.5), 0.75),
      bud: h.rgbStr(h.mixRGB(c.body, c.mem, 0.15), 0.7), budEdge: h.rgbStr(c.mem, 0.85),
    };
  });
  const reach = clamp01(e.reach || 0), S = ease(clamp01(e.strikeK || 0)), C = ease(clamp01(e.closedK || 0));
  const FX = -0.98;
  const hx = lerp(0.5, -0.3, C) + 0.12 * S;
  const sway = (0.12 * sin(t * 0.7) + 0.04 * sin(t * 1.9 + 1)) * (1 - C) * (1 - 0.7 * S);
  const span = hx - FX;
  // ---- column centre line, normals and half widths (foot → neck)
  for (let i = 0; i < HB; i++) {
    const u = i / (HB - 1);
    HCX[i] = FX + span * u; HCY[i] = sway * u * u;
    const ph = atan2(2 * sway * u, span);
    HNX[i] = -sin(ph); HNY[i] = cos(ph);
    let wo = 0.14 + 0.105 * ease(clamp01((u - 0.1) / 0.6)) + 0.035 * exp(-u * u / 0.005);
    wo *= 1 + 0.05 * sin(u * 8 - t * 1.6);
    const wc = 0.2 + 0.27 * sqrt(max(0, 1 - (2 * u - 1) * (2 * u - 1)));
    HW[i] = lerp(wo, wc, C);
  }
  const n1 = HB - 1, nx = HCX[n1], ny = HCY[n1], wn = HW[n1];
  const ha = atan2(2 * sway, span), ca = cos(ha), sa = sin(ha);
  const dl = 0.22 * (1 - 0.45 * C) + 0.04 * S;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';

  // ---- tentacles (behind the head): tapered, swaying, beaded with nematocyst batteries
  const baseL = lerp(0.68, 2.3, reach) * (1 + 0.12 * S) * lerp(1, 0.13, C);
  if (lod) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const tb = H_BASE[k], th = lerp(lerp(tb * lerp(1.25, 1.0, reach), tb * 0.26, S), tb * 1.35, C) + ha;
      const L = baseL * (0.9 + 0.16 * hash(k + 3));
      ctx.moveTo(nx + ca * dl * 0.4, ny + sa * dl * 0.4); ctx.lineTo(nx + cos(th) * L, ny + sin(th) * L);
    }
    ctx.strokeStyle = P.tentEdge; ctx.lineWidth = max(0.07, lw(1.2)); ctx.stroke();
  } else {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const tb = H_BASE[k], sg = tb < 0 ? -1 : 1;
      const th = lerp(lerp(tb * lerp(1.25, 1.0, reach), tb * 0.26, S), tb * 1.35, C) + ha;
      const L = baseL * (0.9 + 0.16 * hash(k + 3)), step = L / HM;
      // base on the hypostome, in the head frame
      const bxl = dl * 0.4 * cos(tb), byl = wn * 0.92 * sin(tb) / sin(1.18);
      let x = nx + bxl * ca - byl * sa, y = ny + bxl * sa + byl * ca;
      const o = k * (HM + 1);
      for (let j = 0; j <= HM; j++) {
        const u = j / HM;
        const phi = th + 0.26 * sin(t * 0.85 + k * 1.9 - u * 2.4) * u * (1 - S) * (1 - C)
          + sg * 0.55 * u * (1 - reach) * (1 - S) * (1 - C) - sg * S * 1.7 * u * u * u;
        TX[o + j] = x; TY[o + j] = y; TPH[o + j] = phi;
        TWD[o + j] = max((0.046 - 0.024 * u) * lerp(1, 1.8, C), lw(0.8));
        x += cos(phi) * step; y += sin(phi) * step;
      }
      TL[k] = L;
      const e1 = o + HM;
      ctx.moveTo(TX[o] - sin(TPH[o]) * TWD[o], TY[o] + cos(TPH[o]) * TWD[o]);
      for (let j = o + 1; j <= e1; j++) ctx.lineTo(TX[j] - sin(TPH[j]) * TWD[j], TY[j] + cos(TPH[j]) * TWD[j]);
      ctx.arc(TX[e1], TY[e1], TWD[e1], TPH[e1] + PI / 2, TPH[e1] - PI / 2, true);
      for (let j = e1; j >= o; j--) ctx.lineTo(TX[j] + sin(TPH[j]) * TWD[j], TY[j] - cos(TPH[j]) * TWD[j]);
      ctx.closePath();
    }
    ctx.fillStyle = P.tent; ctx.fill();
    ctx.strokeStyle = P.tentEdge; ctx.lineWidth = lwb(1); ctx.stroke();
    // nematocyst batteries: small warts along each tentacle, alternating sides
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const o = k * (HM + 1), nb = max(2, min(22, round(TL[k] / 0.1)));
      for (let b = 0; b < nb; b++) {
        const u = (b + 0.8) / (nb + 0.3), fj = u * HM, j0 = fj | 0, j1 = min(HM, j0 + 1), fr = fj - j0;
        const w = lerp(TWD[o + j0], TWD[o + j1], fr), ph = TPH[o + j0], sd = (b & 1 ? 0.55 : -0.55) * w;
        const x = lerp(TX[o + j0], TX[o + j1], fr) - sin(ph) * sd, y = lerp(TY[o + j0], TY[o + j1], fr) + cos(ph) * sd;
        const r = max(w * 0.55, lw(0.8));
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
      }
    }
    ctx.fillStyle = P.nema; ctx.fill();
    if (S > 0.01) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= S * 0.55; ctx.fillStyle = P.nema; ctx.fill(); ctx.restore();
      for (let k = 0; k < 6; k++) { const j = k * (HM + 1) + HM; glow(ctx, H, P.nemaGlow, TX[j], TY[j], 0.24, S * 0.42); }
    }
  }

  // ---- column + hypostome outline
  for (let i = 0; i < HB; i++) {
    HPX[i] = HCX[i] - HNX[i] * HW[i]; HPY[i] = HCY[i] - HNY[i] * HW[i];
    HPX[2 * HB - 1 - i] = HCX[i] + HNX[i] * HW[i]; HPY[2 * HB - 1 - i] = HCY[i] + HNY[i] * HW[i];
  }
  ctx.beginPath();
  if (lod) { ctx.moveTo(HPX[0], HPY[0]); for (let i = 2; i < HB; i += 3) ctx.lineTo(HPX[i], HPY[i]); ctx.lineTo(HPX[n1], HPY[n1]); }
  else smoothRun(ctx, HPX, HPY, 0, n1, true);
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(ha);
  ctx.bezierCurveTo(dl * 0.6, -wn, dl, -wn * 0.5, dl, 0);
  ctx.bezierCurveTo(dl, wn * 0.5, dl * 0.6, wn, 0, wn);
  ctx.restore();
  if (lod) { for (let i = HB + 2; i < 2 * HB; i += 3) ctx.lineTo(HPX[i], HPY[i]); ctx.lineTo(HPX[2 * HB - 1], HPY[2 * HB - 1]); }
  else smoothRun(ctx, HPX, HPY, HB, 2 * HB - 1, false);
  ctx.quadraticCurveTo(FX - 0.05, HCY[0], HPX[0], HPY[0]);
  ctx.closePath();
  ctx.save(); ctx.translate(lerp(-0.22, -0.62, C), 0); ctx.scale(lerp(0.92, 0.6, C), lerp(0.36, 0.52, C));
  ctx.fillStyle = H.bodyGrad(ctx, col.body); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = P.mem; ctx.lineWidth = lwb(1.6); ctx.stroke();

  // ---- bud: a small daughter polyp growing out of the column wall (asexual budding)
  const kb = lod ? 0 : 1 - C;
  if (kb > 0.02) {
    const i = 6, bx = HCX[i] + HNX[i] * HW[i] * 0.72, by = HCY[i] + HNY[i] * HW[i] * 0.72;
    const ba = atan2(HNY[i], HNX[i]) - 0.62 + 0.08 * sin(t * 0.9), bl = 0.3 * kb, bw = 0.085 * kb;
    const cb = cos(ba), sb = sin(ba);
    const tx = bx + cb * bl, ty = by + sb * bl;
    ctx.beginPath(); // four little tentacles on the bud's head
    for (let q = -1.5; q <= 1.5; q += 1) {
      const a = ba + q * 0.55 + 0.12 * sin(t * 1.3 + q), l = (0.22 - 0.03 * abs(q)) * kb, a2 = a + q * 0.35;
      ctx.moveTo(tx + cb * bw * 0.5, ty + sb * bw * 0.5); ctx.quadraticCurveTo(tx + cos(a) * l * 0.6, ty + sin(a) * l * 0.6, tx + cos(a2) * l, ty + sin(a2) * l);
    }
    ctx.strokeStyle = P.tentEdge; ctx.lineWidth = max(0.026, lw(1)); ctx.stroke();
    ctx.beginPath(); tgLeg(ctx, bx, by, ba, bl, bw * 1.15, bw, true);
    ctx.fillStyle = P.bud; ctx.fill();
    ctx.strokeStyle = P.budEdge; ctx.lineWidth = lwb(1.1); ctx.stroke();
  }

  if (!lod) {
    // endoderm (the green algae-filled inner layer) lining the gut cavity
    ctx.beginPath();
    for (let i = 1; i < HB; i++) { const x = HCX[i] - HNX[i] * HW[i] * 0.52, y = HCY[i] - HNY[i] * HW[i] * 0.52; i === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.save(); ctx.translate(nx, ny); ctx.rotate(ha);
    ctx.quadraticCurveTo(dl * 0.75, -wn * 0.3, dl * 0.75, 0); ctx.quadraticCurveTo(dl * 0.75, wn * 0.3, 0, wn * 0.52);
    ctx.restore();
    for (let i = HB - 1; i >= 1; i--) ctx.lineTo(HCX[i] + HNX[i] * HW[i] * 0.52, HCY[i] + HNY[i] * HW[i] * 0.52);
    ctx.closePath();
    ctx.fillStyle = P.endo; ctx.fill();
    if (hd) {
      ctx.strokeStyle = P.endoEdge; ctx.lineWidth = lwb(1); ctx.stroke();
      // symbiotic algae speckling the endoderm, the gastric cavity line
      ctx.beginPath();
      for (let q = 0; q < 34; q++) {
        const u = 0.12 + 0.86 * hash(q), v = (hash(q + 40) * 2 - 1) * 0.42;
        const fi = u * (HB - 1), i0 = fi | 0, i1 = min(HB - 1, i0 + 1), fr = fi - i0;
        const cx = lerp(HCX[i0], HCX[i1], fr), cy = lerp(HCY[i0], HCY[i1], fr), w = lerp(HW[i0], HW[i1], fr);
        const x = cx + HNX[i0] * w * v, y = cy + HNY[i0] * w * v, r = 0.018 + 0.012 * hash(q + 80);
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fillStyle = P.algae; ctx.fill();
      ctx.beginPath(); ctx.moveTo(HCX[2], HCY[2]); for (let i = 3; i < HB; i++) ctx.lineTo(HCX[i], HCY[i]); ctx.lineTo(nx + ca * dl * 0.8, ny + sa * dl * 0.8);
      ctx.strokeStyle = P.cavity; ctx.lineWidth = lwb(1); ctx.stroke();
    }
    // hypostome crease and mouth
    ctx.save(); ctx.translate(nx, ny); ctx.rotate(ha);
    ctx.beginPath(); ctx.moveTo(0, -wn * 0.92); ctx.quadraticCurveTo(dl * 0.3, 0, 0, wn * 0.92);
    ctx.strokeStyle = P.crease; ctx.lineWidth = lwb(1); ctx.stroke();
    const mo = 0.035 + 0.04 * S;
    ctx.beginPath(); ctx.ellipse(dl - 0.015, 0, 0.025 + 0.01 * S, mo, 0, 0, TAU); ctx.fillStyle = P.mouth; ctx.fill();
    if (hd) {
      ctx.beginPath();
      for (let q = -2; q <= 2; q++) { const a = q * 0.42; ctx.moveTo(dl - 0.02, 0); ctx.lineTo(dl - 0.02 - cos(a) * dl * 0.55, sin(a) * wn * 0.7); }
      ctx.strokeStyle = P.endoEdge; ctx.lineWidth = lwb(0.8); ctx.stroke();
    }
    ctx.restore();
    // soft specular streak along the column
    const i = 7, hxp = HCX[i] - HNX[i] * HW[i] * 0.42, hyp = HCY[i] - HNY[i] * HW[i] * 0.42;
    ctx.save(); ctx.translate(hxp, hyp); ctx.rotate(ha * 0.6); ctx.scale(lerp(0.42, 0.22, C), 0.1);
    ctx.globalAlpha *= 0.5; ctx.drawImage(H.glowSprite(WHITE), -1, -1, 2, 2);
    ctx.restore();
  }
  // ---- foot (basal) disc, glued to the substrate with a little mucus
  if (!lod) glow(ctx, H, P.mucus, FX - 0.02, HCY[0], 0.3, 0.28);
  ctx.beginPath(); ctx.ellipse(FX + 0.035, HCY[0], 0.05, HW[0] * 0.86, 0, 0, TAU);
  ctx.fillStyle = P.foot; ctx.fill();
  ctx.restore();
}

// =====================================================================================================
// Tardigrade — water bear: plump segmented barrel, 4 pairs of stubby clawed legs (the last pair at the rear),
// round head with a tubular mouth, stylets and two eyespots. biteK thrusts the stylets out. Walks on t.
// =====================================================================================================
const TG_A = 0.97, TG_B = 0.6, TG_E = 2.5, TG_N = 44;
const TGX = new Float32Array(TG_N), TGY = new Float32Array(TG_N);
const TG_LEGS = [0.27, -0.12, -0.47], TG_CREASE = [0.44, 0.07, -0.3, -0.64];
function tgShape(x) { // width multiplier along the body: head taper, neck and segment creases, narrower rear
  let f = 1 - 0.22 * ease(clamp01((x - 0.3) / 0.6));
  f *= 1 - 0.09 * exp(-((x - 0.44) ** 2) / 0.0035);
  f *= 1 - 0.05 * (exp(-((x - 0.07) ** 2) / 0.003) + exp(-((x + 0.3) ** 2) / 0.003) + exp(-((x + 0.64) ** 2) / 0.003));
  f *= 1 - 0.12 * ease(clamp01((-x - 0.55) / 0.42));
  return f;
}
function tgHalf(x) { const u = min(1, abs(x) / TG_A); return TG_B * (1 - u ** TG_E) ** (1 / TG_E) * tgShape(x); }
// plump lobe (tardigrade leg, hydra bud): bulges in the middle, rounded tip; `open` leaves the base edge unstroked
function tgLeg(ctx, bx, by, d, L, wb, wt, open = false) {
  const c = cos(d), s = sin(d), tx = bx + c * L, ty = by + s * L, mx = bx + c * L * 0.5, my = by + s * L * 0.5, wm = wb * 1.3;
  ctx.moveTo(bx - s * wb, by + c * wb);
  ctx.quadraticCurveTo(mx - s * wm, my + c * wm, tx - s * wt, ty + c * wt);
  ctx.arc(tx, ty, wt, d + PI / 2, d - PI / 2, true);
  ctx.quadraticCurveTo(mx + s * wm, my - c * wm, bx + s * wb, by - c * wb);
  if (!open) ctx.closePath();
}

function drawTardigrade(ctx, e, t, s, H) {
  const { lw, lwb, lod, hd, col } = H;
  const P = pal(H, 'tardi', (c, h) => ({
    mem: h.cstr(c.mem), leg: h.rgbStr(h.mixRGB(c.body, c.nuc, 0.1), 0.62), legEdge: h.rgbStr(c.mem, 0.85), claw: h.rgbStr(h.mixRGB(c.nuc, [50, 28, 16], 0.35), 0.95),
    crease: h.rgbStr(c.mem, 0.3), gut: h.rgbStr(h.mixRGB(c.nuc, [140, 150, 60], 0.45), 0.3), food: h.rgbStr(h.mixRGB(c.nuc, [90, 140, 40], 0.6), 0.6),
    cells: h.rgbStr(c.mem, 0.38), bulb: h.rgbStr(h.mixRGB(c.body, c.nuc, 0.45), 0.6), bulbEdge: h.rgbStr(c.mem, 0.5),
    placoid: h.rgbStr(h.mixRGB(c.nuc, [40, 20, 10], 0.5), 0.8), tube: h.rgbStr(h.mixRGB(c.mem, c.nuc, 0.3), 0.75),
    stylet: h.rgbStr(h.mixRGB(c.mem, [255, 215, 150], 0.45), 0.95), eye: h.rgbStr(h.mixRGB(c.nuc, [30, 8, 12], 0.75), 1),
    papilla: h.rgbStr(c.mem, 0.28), mouth: h.rgbStr(h.mixRGB(c.body, c.nuc, 0.3), 0.85), glint: h.mixRGB(c.mem, [255, 230, 190], 0.5),
  }));
  const B = ease(clamp01(e.biteK || 0));
  const wp = t * 2.6;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.rotate(0.03 * sin(wp));
  const st = e.stretch || 0;
  if (st) ctx.scale(1 + st * 0.5, 1 - st * 0.3);

  // ---- legs (behind the body): three side pairs + the backward-pointing fourth pair
  ctx.beginPath();
  if (lod) {
    for (let f = -1; f <= 1; f += 2) {
      for (let i = 0; i < 3; i++) { const x = TG_LEGS[i], o = 0.3 * sin(wp + i * 1.9 + (f > 0 ? PI : 0)); ctx.moveTo(x, f * 0.4); ctx.lineTo(x + o * 0.3, f * 0.78); }
      ctx.moveTo(-0.75, f * 0.22); ctx.lineTo(-1.02, f * 0.42);
    }
    ctx.strokeStyle = P.leg; ctx.lineWidth = max(0.16, lw(1.5)); ctx.stroke();
  } else {
    const nC = hd ? 4 : 3;
    // pre-pass to build leg shapes; claws collected in a second path
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let f = -1; f <= 1; f += 2) {
        for (let i = 0; i < 4; i++) {
          const ph = wp + i * 1.9 + (f > 0 ? PI : 0), o = sin(ph), lift = max(0, cos(ph));
          let bx, by, d, L;
          if (i < 3) { bx = TG_LEGS[i]; by = f * tgHalf(bx) * 0.86; d = f * (PI / 2 + 0.12 - 0.36 * o); L = 0.27 * (1 - 0.2 * lift); }
          else { bx = -0.8; by = f * 0.2; d = f * (PI - 0.72 - 0.18 * o); L = 0.27 * (1 - 0.18 * lift); }
          if (pass === 0) { tgLeg(ctx, bx, by, d, L, 0.11, 0.085, true); continue; }
          // claws: two double claws per leg, little hooks curling back
          const c = cos(d), sn = sin(d), tx = bx + c * (L + 0.05), ty = by + sn * (L + 0.05), cl = 0.08 * (1 - 0.35 * lift);
          for (let q = 0; q < nC; q++) {
            const v = (q / (nC - 1) - 0.5) * 2, ox = -sn * v * 0.045, oy = c * v * 0.045;
            const sx = tx + ox, sy = ty + oy, ex = sx + c * cl + sn * 0.035 * f, ey = sy + sn * cl - c * 0.035 * f;
            ctx.moveTo(sx - c * 0.02, sy - sn * 0.02);
            ctx.quadraticCurveTo(sx + c * cl * 1.1, sy + sn * cl * 1.1, ex, ey);
          }
        }
      }
      if (pass === 0) { ctx.fillStyle = P.leg; ctx.fill(); ctx.strokeStyle = P.legEdge; ctx.lineWidth = lwb(1.3); ctx.stroke(); }
      else { ctx.strokeStyle = P.claw; ctx.lineWidth = max(0.022, lwb(1.3)); ctx.stroke(); }
    }
  }

  // ---- body: superellipse barrel with segment creases
  for (let i = 0; i < TG_N; i++) {
    const th = (i / TG_N) * TAU, c = cos(th), sn = sin(th);
    const x = TG_A * Math.sign(c) * abs(c) ** (2 / TG_E);
    TGX[i] = x; TGY[i] = TG_B * Math.sign(sn) * abs(sn) ** (2 / TG_E) * tgShape(x);
  }
  ctx.beginPath();
  if (lod) ctx.ellipse(0, 0, 0.97, 0.56, 0, 0, TAU); else smoothClosed(ctx, TGX, TGY, TG_N);
  ctx.save(); ctx.scale(1.02, 0.66); ctx.fillStyle = H.bodyGrad(ctx, col.body, 1.4); ctx.fill(); ctx.restore();
  ctx.strokeStyle = P.mem; ctx.lineWidth = lwb(1.7); ctx.stroke();

  if (!lod) {
    // segment creases
    ctx.beginPath();
    for (let i = 0; i < 4; i++) { const x = TG_CREASE[i], w = tgHalf(x) * 0.93; ctx.moveTo(x - 0.02, -w); ctx.quadraticCurveTo(x + 0.07, 0, x - 0.02, w); }
    ctx.strokeStyle = P.crease; ctx.lineWidth = lwb(1.1); ctx.stroke();
    // gut with food, storage cells drifting in the body cavity
    ctx.beginPath(); ctx.ellipse(-0.25, 0.02, 0.46, 0.25, 0, 0, TAU); ctx.fillStyle = P.gut; ctx.fill();
    if (hd) { H.dots(ctx, 10, (e.seed || 0) + 2, t, 0.05, 0.85, 0.035, 0.12, -0.25, 0.46, 0.25); ctx.fillStyle = P.food; ctx.fill(); }
    H.dots(ctx, hd ? 16 : 8, e.seed || 0, t, 0.35, 0.95, 0.042, 0.1, -0.08, 0.86, 0.48); ctx.fillStyle = P.cells; ctx.fill();
    if (hd) {
      // cuticle papillae along the outline
      ctx.beginPath();
      for (let i = 0; i < TG_N; i += 2) { const x = TGX[i] * 0.93, y = TGY[i] * 0.88, r = 0.022; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); }
      ctx.fillStyle = P.papilla; ctx.fill();
    }
    // feeding apparatus: buccal tube → muscular pharyngeal bulb with placoids; stylets beside the tube
    const pump = 1 + 0.08 * sin(t * 5) + 0.12 * B;
    ctx.beginPath(); ctx.ellipse(0.38, 0, 0.13 * pump, 0.1 * pump, 0, 0, TAU); ctx.fillStyle = P.bulb; ctx.fill();
    ctx.strokeStyle = P.bulbEdge; ctx.lineWidth = lwb(1); ctx.stroke();
    if (hd) {
      ctx.beginPath(); for (let q = -1; q <= 1; q++) { ctx.moveTo(0.3 + 0.07 * abs(q), q * 0.045); ctx.lineTo(0.42 + 0.03 * abs(q), q * 0.045); }
      ctx.strokeStyle = P.placoid; ctx.lineWidth = lwb(1.6); ctx.stroke();
    }
    const snout = 0.97 + 0.1 * B;
    ctx.beginPath(); ctx.moveTo(0.5, 0); ctx.lineTo(snout - 0.03, 0);
    ctx.strokeStyle = P.tube; ctx.lineWidth = max(0.02, lwb(1.4)); ctx.stroke();
    // oral cone (pushes out when biting)
    if (B > 0.01) {
      ctx.beginPath(); ctx.moveTo(0.9, -0.1); ctx.quadraticCurveTo(snout + 0.02, -0.09, snout + 0.02, 0); ctx.quadraticCurveTo(snout + 0.02, 0.09, 0.9, 0.1);
      ctx.fillStyle = P.leg; ctx.fill(); ctx.strokeStyle = P.mem; ctx.lineWidth = lwb(1.2); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(snout - 0.01, 0, 0.03, 0.05 + 0.025 * B, 0, 0, TAU); ctx.fillStyle = P.mouth; ctx.fill();
    // stylets: a pair of needles that shoot out through the mouth
    const sx0 = 0.5 + 0.38 * B, sx1 = 0.86 + 0.42 * B;
    ctx.beginPath();
    for (let f = -1; f <= 1; f += 2) { ctx.moveTo(sx0, f * 0.07 * (1 - 0.4 * B)); ctx.quadraticCurveTo((sx0 + sx1) / 2, f * 0.05, sx1, f * (0.012 + 0.03 * B)); }
    ctx.strokeStyle = P.stylet; ctx.lineWidth = max(0.018, lwb(1.3 + 0.4 * B)); ctx.stroke();
    if (B > 0.3) for (let f = -1; f <= 1; f += 2) glow(ctx, H, P.glint, sx1, f * (0.012 + 0.03 * B), 0.14, (B - 0.3) * 0.9, 1);
    // eyespots
    ctx.beginPath(); ctx.moveTo(0.745, -0.24); ctx.arc(0.68, -0.24, 0.065, 0, TAU); ctx.moveTo(0.745, 0.24); ctx.arc(0.68, 0.24, 0.065, 0, TAU);
    ctx.fillStyle = P.eye; ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.685, -0.265); ctx.arc(0.665, -0.265, 0.02, 0, TAU); ctx.moveTo(0.685, 0.215); ctx.arc(0.665, 0.215, 0.02, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    spec(ctx, H, e.ang || 0, 0, 0, 1);
  } else {
    ctx.beginPath(); ctx.arc(0.66, -0.22, 0.09, 0, TAU); ctx.arc(0.66, 0.22, 0.09, 0, TAU); ctx.fillStyle = P.eye; ctx.fill();
  }
  ctx.restore();
}

// =====================================================================================================
// Heliozoan — sun-animalcule (Actinophrys-like): foamy round cell, central nucleus, 30–40 straight needle-like
// axopods with granules streaming along them. snag: axopods near the catch point (+x) bend onto it and glow.
// =====================================================================================================
const HZ_N = 40;
const HZ_A = new Float32Array(HZ_N), HZ_L = new Float32Array(HZ_N), HZ_G = new Float32Array(HZ_N);
for (let i = 0; i < HZ_N; i++) { HZ_A[i] = (hash(i + 11) - 0.5) * 0.08; HZ_L[i] = 0.86 + 0.2 * hash(i + 23); HZ_G[i] = hash(i + 57); }
const HZ_RC = 0.72;
const HZ_P = new Float32Array(HZ_N * 7); // per axopod: base x/y, control x/y, tip x/y, snag weight

function drawHeliozoan(ctx, e, t, s, H) {
  const { lw, lwb, lod, hd, col } = H;
  const P = pal(H, 'helio', (c, h) => ({
    mem: h.cstr(c.mem), axo: h.rgbStr(h.mixRGB(c.mem, WHITE, 0.3), 0.72), axoHot: h.rgbStr(h.mixRGB(c.glow, WHITE, 0.55), 0.95),
    gran: h.rgbStr(h.mixRGB(c.mem, WHITE, 0.4), 0.9),
    vac: h.rgbStr(c.mem, 0.1), vacEdge: h.rgbStr(c.mem, 0.42), endo: h.rgbStr(h.mixRGB(c.body, c.nuc, 0.2), 0.24),
    cv: 'rgba(235,250,255,0.28)', cvEdge: h.rgbStr(c.mem, 0.65), food: h.rgbStr(h.mixRGB(c.nuc, [120, 170, 70], 0.4), 0.55),
    hot: h.mixRGB(c.glow, WHITE, 0.35),
  }));
  const K = ease(clamp01(e.snag || 0));
  const rc = HZ_RC, rot = t * 0.05;
  const N = lod ? 12 : hd ? 40 : s < 24 ? 24 : 34;
  const px = rc + 0.78, py = 0; // catch point, in front
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (!lod) glow(ctx, H, col.glow, 0, 0, 1.55, 0.22 + 0.25 * K);

  // ---- axopod geometry: base → (control) → tip; near the catch point they bend onto the prey
  let anyHot = false;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + rot + HZ_A[i] + 0.025 * sin(t * 0.7 + i * 2.1);
    const c = cos(a), sn = sin(a), q = i * 7;
    const L = 1.3 * HZ_L[i] * (1 + 0.03 * sin(t * 1.3 + i)) * (1 - 0.1 * K);
    const bx = c * rc * 0.94, by = sn * rc * 0.94;
    let tx = c * (rc + L), ty = sn * (rc + L), cx = (bx + tx) / 2, cy = (by + ty) / 2;
    const d = atan2(sn, c), w = lod ? 0 : K * exp(-d * d * 2.2);
    if (w > 0.01) {
      let gx = tx - px, gy = ty - py; const gl = Math.hypot(gx, gy) || 1;
      gx = px + (gx / gl) * 0.26; gy = py + (gy / gl) * 0.26;
      tx = lerp(tx, gx, w * 0.9); ty = lerp(ty, gy, w * 0.9);
      const cl = 0.5 * Math.hypot(tx - bx, ty - by); cx = bx + c * cl; cy = by + sn * cl;
      if (w > 0.15) anyHot = true;
    }
    HZ_P[q] = bx; HZ_P[q + 1] = by; HZ_P[q + 2] = cx; HZ_P[q + 3] = cy; HZ_P[q + 4] = tx; HZ_P[q + 5] = ty; HZ_P[q + 6] = w;
  }
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const q = i * 7; ctx.moveTo(HZ_P[q], HZ_P[q + 1]);
    if (HZ_P[q + 6] > 0.01) ctx.quadraticCurveTo(HZ_P[q + 2], HZ_P[q + 3], HZ_P[q + 4], HZ_P[q + 5]); else ctx.lineTo(HZ_P[q + 4], HZ_P[q + 5]);
  }
  ctx.strokeStyle = P.axo; ctx.lineWidth = lod ? max(0.05, lw(1)) : max(0.014, lw(hd ? 1.1 : 1)); ctx.stroke();

  if (!lod) {
    // granules streaming both ways along each axopod (+ conical axopod bases when large)
    ctx.beginPath();
    const gr = max(0.022, lw(1.1)), ng = hd ? 3 : 2;
    for (let i = 0; i < N; i++) {
      const q = i * 7, bx = HZ_P[q], by = HZ_P[q + 1], cx = HZ_P[q + 2], cy = HZ_P[q + 3], tx = HZ_P[q + 4], ty = HZ_P[q + 5];
      for (let g = 0; g < ng; g++) {
        let u = (HZ_G[i] + g * 0.37 + t * (g % 2 ? -0.09 : 0.12)) % 1; if (u < 0) u += 1;
        u = 0.08 + u * 0.88;
        const m = 1 - u, x = m * m * bx + 2 * m * u * cx + u * u * tx, y = m * m * by + 2 * m * u * cy + u * u * ty;
        const r = gr * (1.1 - 0.4 * u);
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
      }
      if (hd) {
        const c = bx / (rc * 0.94), sn = by / (rc * 0.94), pn = 0.025;
        ctx.moveTo(bx - sn * pn, by + c * pn); ctx.lineTo(c * (rc + 0.16), sn * (rc + 0.16)); ctx.lineTo(bx + sn * pn, by - c * pn);
      }
    }
    ctx.fillStyle = P.gran; ctx.fill();
    // axopods wrapped around the prey light up
    if (anyHot) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha *= K;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const q = i * 7;
        if (HZ_P[q + 6] <= 0.15) continue;
        const bx = HZ_P[q], by = HZ_P[q + 1], cx = HZ_P[q + 2], cy = HZ_P[q + 3];
        ctx.moveTo(bx + (cx - bx) * 0.6, by + (cy - by) * 0.6); ctx.quadraticCurveTo(cx, cy, HZ_P[q + 4], HZ_P[q + 5]);
      }
      ctx.strokeStyle = P.axoHot; ctx.lineWidth = max(0.03, lw(1.8)); ctx.stroke();
      ctx.restore();
    }
  }

  // ---- cell body: foamy ectoplasm around a denser endoplasm with the nucleus
  const bulge = e.dent > 0.01 ? 0 : 0.12 * K;
  ctx.save(); ctx.scale(rc, rc);
  if (lod) { ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); }
  else H.blobPath(ctx, { n: hd ? 30 : 20, t, seed: e.seed || 0, amp: 0.035, dentA: e.dent > 0.01 ? e.dentA : 0, dent: e.dent > 0.01 ? e.dent : -bulge });
  ctx.fillStyle = H.bodyGrad(ctx, col.body); ctx.fill();
  ctx.strokeStyle = P.mem; ctx.lineWidth = lwb(1.5) / rc; ctx.stroke();
  ctx.restore();
  if (!lod) {
    ctx.beginPath(); ctx.arc(0, 0, rc * 0.56, 0, TAU); ctx.fillStyle = P.endo; ctx.fill();
    // alveolar vacuoles (the foam)
    const nv = hd ? 26 : 16, vr = rot * 0.6;
    ctx.beginPath();
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * TAU + vr + hash(i + 3) * 0.2, d = rc * (0.74 + 0.08 * hash(i + 9)), r = rc * (0.1 + 0.05 * hash(i + 17));
      const x = cos(a) * d, y = sin(a) * d; ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
    }
    if (hd) for (let i = 0; i < 10; i++) { const a = i * 2.4 + vr, d = rc * (0.42 + 0.1 * hash(i + 31)), r = rc * 0.07; ctx.moveTo(cos(a) * d + r, sin(a) * d); ctx.arc(cos(a) * d, sin(a) * d, r, 0, TAU); }
    ctx.fillStyle = P.vac; ctx.fill();
    ctx.strokeStyle = P.vacEdge; ctx.lineWidth = lwb(0.8); ctx.stroke();
    // contractile vacuole: swells slowly at the rim, then empties
    const cvk = ((t * 0.35 + (e.seed || 0)) % 1 + 1) % 1, cvr = rc * (0.06 + 0.14 * cvk * cvk), cva = 2.4 + rot;
    ctx.beginPath(); ctx.arc(cos(cva) * rc * 0.86, sin(cva) * rc * 0.86, cvr, 0, TAU);
    ctx.fillStyle = P.cv; ctx.fill(); ctx.strokeStyle = P.cvEdge; ctx.lineWidth = lwb(1); ctx.stroke();
    // food vacuoles
    ctx.beginPath(); ctx.arc(-0.2, 0.17, 0.07, 0, TAU); ctx.moveTo(0.27, -0.13); ctx.arc(0.2, -0.13, 0.05, 0, TAU);
    ctx.fillStyle = P.food; ctx.fill();
    H.nucleus(ctx, col.nuc, 0, 0, rc * 0.24, t, e.seed || 0);
    spec(ctx, H, e.ang || 0, 0, 0, rc);
    if (K > 0.01) { glow(ctx, H, P.hot, px, py, 0.75, K * 0.85); glow(ctx, H, P.hot, px, py, 0.28, K * 0.7, 1); }
  }
  ctx.restore();
}

// =====================================================================================================
// Chytrid — fungal zoospore: tiny oval spore with a refractive lipid globule and one long trailing whiplash
// flagellum. latched: flagellum coils up, spore flattens against the host (+x) and pushes rhizoids into it.
// =====================================================================================================
const CH_N = 22;
const CHX = new Float32Array(CH_N), CHY = new Float32Array(CH_N);
const CFX = new Float32Array(17), CFY = new Float32Array(17);

function drawChytrid(ctx, e, t, s, H) {
  const { lw, lwb, lod, hd, col } = H;
  const P = pal(H, 'chytrid', (c, h) => ({
    mem: h.cstr(c.mem), flag: h.rgbStr(c.mem, 0.85), flagTip: h.rgbStr(c.mem, 0.5), rhiz: h.rgbStr(h.mixRGB(c.mem, c.body, 0.3), 0.8),
    nuc: h.mixRGB(c.body, [70, 30, 110], 0.55), lipidHi: 'rgba(255,255,255,0.75)', dot: h.rgbStr(c.mem, 0.45), lipidGlow: h.mixRGB(c.nuc, WHITE, 0.3),
  }));
  const k = ease(clamp01(e.latched || 0)), st = (e.stretch || 0) * (1 - k);
  const cx = lerp(0.06, 0.42, k), rx = lerp(0.74, 0.44, k) * (1 + st), ry = lerp(0.64, 0.88, k) * (1 - st * 0.5);
  const flat = 1 / (1 + 2.2 * k);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.rotate(0.07 * sin(t * 6) * (1 - k));

  // ---- flagellum: whiplash trailing wave → coiled spiral when latched
  const ax = cx - rx * 0.96, len = 2.25, nf = lod ? 8 : 16;
  for (let i = 0; i <= nf; i++) {
    const u = i / nf;
    const wx = ax - u * len, wy = sin(u * 5.4 - t * 11) * 0.16 * len * u;
    const r = 0.3 * (1 - 0.72 * u), a = u * PI * 3.4;
    const sx = ax - 0.3 + cos(a) * r, sy = sin(a) * r * 0.9;
    CFX[i] = lerp(wx, sx, k); CFY[i] = lerp(wy, sy, k);
  }
  ctx.beginPath();
  if (lod) { ctx.moveTo(CFX[0], CFY[0]); for (let i = 1; i <= nf; i++) ctx.lineTo(CFX[i], CFY[i]); }
  else smoothRun(ctx, CFX, CFY, 0, hd ? 13 : nf, true);
  ctx.strokeStyle = P.flag; ctx.lineWidth = max(lod ? 0.055 : 0.04, lw(lod ? 1.1 : 1.4)); ctx.stroke();
  if (hd && !lod) { // the thin whiplash end piece
    ctx.beginPath(); smoothRun(ctx, CFX, CFY, 13, nf, true);
    ctx.strokeStyle = P.flagTip; ctx.lineWidth = max(0.03, lw(1)); ctx.stroke();
  }

  // ---- rhizoids growing into the host once latched
  if (k > 0.25 && !lod) {
    const g = (k - 0.25) / 0.75, fx = cx + rx * 0.92;
    ctx.beginPath();
    for (let q = -1; q <= 1; q++) {
      const a = q * 0.55, l = (q === 0 ? 0.54 : 0.42) * g;
      const ex = fx + cos(a) * l, ey = sin(a) * l;
      ctx.moveTo(fx, q * 0.05); ctx.quadraticCurveTo(fx + l * 0.5, q * 0.05 + sin(a) * l * 0.25 + 0.04 * q * q, ex, ey);
      ctx.moveTo(fx + (ex - fx) * 0.55, ey * 0.5); ctx.lineTo(fx + (ex - fx) * 0.8 + 0.06 * g, ey * 0.5 + (q ? q : 1) * 0.14 * g);
    }
    ctx.strokeStyle = P.rhiz; ctx.lineWidth = max(0.025, lw(1)); ctx.stroke();
    glow(ctx, H, col.glow, fx + 0.12, 0, 0.5, g * (0.35 + 0.15 * sin(t * 4)));
  }

  // ---- spore body
  for (let i = 0; i < CH_N; i++) {
    const th = (i / CH_N) * TAU, c = cos(th), sn = sin(th);
    const px = c > 0 ? c ** flat : c;
    const wob = 1 + 0.04 * sin(3 * th + t * 4) * (1 - k);
    CHX[i] = cx + rx * px * wob; CHY[i] = ry * sn * wob;
  }
  ctx.beginPath();
  if (lod) ctx.ellipse(cx, 0, rx, ry, 0, 0, TAU); else smoothClosed(ctx, CHX, CHY, CH_N);
  ctx.save(); ctx.translate(cx, 0); ctx.scale(rx, ry); ctx.fillStyle = H.bodyGrad(ctx, col.body, 1.1); ctx.fill(); ctx.restore();
  ctx.strokeStyle = P.mem; ctx.lineWidth = lwb(1.5); ctx.stroke();
  if (!lod) {
    // nucleus near the front, refractive lipid globule behind it
    H.nucleus(ctx, P.nuc, cx + rx * 0.38, ry * 0.2, min(rx, ry) * 0.26, t, e.seed || 0);
    if (hd) { H.dots(ctx, 7, (e.seed || 0) + 1, t, 0.25, 0.8, 0.04, 0.4, cx, rx, ry); ctx.fillStyle = P.dot; ctx.fill(); }
    const gx = cx - rx * 0.22, gy = -ry * 0.12, gr = min(rx, ry) * 0.42;
    glow(ctx, H, P.lipidGlow, gx, gy, gr * 2.6, 0.45);
    ctx.save(); ctx.translate(gx, gy); ctx.scale(gr, gr);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fillStyle = H.nucGrad(ctx, col.nuc); ctx.fill();
    ctx.beginPath(); ctx.arc(-0.3, -0.32, 0.3, 0, TAU); ctx.fillStyle = P.lipidHi; ctx.fill();
    ctx.restore();
    spec(ctx, H, e.ang || 0, cx, 0, min(rx, ry) * 1.1);
  }
  ctx.restore();
}

export default {
  nauplius: {
    name: 'Nauplius',
    col: { body: [255, 178, 108], mem: [255, 236, 210], nuc: [255, 105, 40], glow: [255, 175, 110] },
    portraitR: 0.22, portraitRot: -0.5,
    states: [{ label: 'idle' }, { label: 'jumpK 0.5', jumpK: 0.5 }, { label: 'jumpK 1 (power stroke)', jumpK: 1 }],
    draw: drawNauplius,
  },
  hydra: {
    name: 'Hydra',
    col: { body: [125, 215, 110], mem: [215, 255, 200], nuc: [50, 140, 55], glow: [140, 240, 120] },
    portraitR: 0.23, portraitRot: -0.45,
    states: [
      { label: 'idle (reach 0)' }, { label: 'reach 0.5', reach: 0.5 }, { label: 'reach 1', reach: 1 },
      { label: 'strikeK 1 (reach 1)', reach: 1, strikeK: 1 }, { label: 'strikeK 1 (reach 0)', strikeK: 1 },
      { label: 'closedK 0.5', closedK: 0.5 }, { label: 'closedK 1', closedK: 1 },
    ],
    draw: drawHydra,
  },
  tardigrade: {
    name: 'Tardigrade',
    col: { body: [242, 198, 168], mem: [255, 240, 228], nuc: [150, 96, 72], glow: [255, 205, 170] },
    portraitR: 0.3, portraitRot: -0.4,
    states: [{ label: 'idle (walking)' }, { label: 'biteK 0.5', biteK: 0.5 }, { label: 'biteK 1', biteK: 1 }],
    draw: drawTardigrade,
  },
  heliozoan: {
    name: 'Heliozoan',
    col: { body: [255, 212, 120], mem: [255, 246, 212], nuc: [215, 140, 50], glow: [255, 220, 120] },
    portraitR: 0.22, portraitRot: 0,
    states: [{ label: 'idle' }, { label: 'snag 0.5', snag: 0.5 }, { label: 'snag 1', snag: 1 }],
    draw: drawHeliozoan,
  },
  chytrid: {
    name: 'Chytrid',
    col: { body: [215, 150, 255], mem: [246, 228, 255], nuc: [255, 225, 130], glow: [215, 145, 255] },
    portraitR: 0.17, portraitRot: -0.5,
    states: [{ label: 'idle' }, { label: 'latched 0.5', latched: 0.5 }, { label: 'latched 1', latched: 1 }],
    draw: drawChytrid,
  },
};
