// Cinematic moments, mixed into the game: arriving in a level, dying, clearing a level,
// evolving between habitats, and the dive (or re-forming) that carries you into the next level.
import { el, icon } from '../ui.js';
import * as C from './campaign.js';
import { COLORS } from './data.js';
import { glowSprite, rgbStr, portrait } from './art.js';

const { sin, cos, atan2, hypot, min, max, exp, random, PI } = Math;
const TAU = PI * 2;
const cl = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const out3 = (k) => 1 - (1 - k) ** 3;
const in2 = (k) => k * k;
const in3 = (k) => k * k * k;
const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const back = (k) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; };
const GOLD = [255, 214, 120], GOLD_HI = [255, 246, 205];

// The colour the screen dissolves into between levels. Both the level you leave and the level
// you arrive in compute it from the same palette, so the hand-over is seamless.
export function coverColor(pal) {
  return [0, 1, 2].map((i) => Math.round(pal.edge[i] * 0.6 + pal.bg[i] * 0.4));
}

function makeStreaks(W, H, n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ x: random() * W, y: random() * H, l: 30 + random() * 90, w: 0.8 + random() * 1.8, a: 0.18 + random() * 0.45, sp: 0.5 + random() });
  return a;
}

export const Cinematics = {
  pcol() {
    const p = this.p, c = COLORS.player;
    return { body: p.bodyCol || c.body, mem: p.memCol || c.mem, nuc: c.nuc, glow: c.glow };
  },

  // ------------------------------------------------------------ level start
  cineStart(kind) {
    const p = this.p;
    this.cover = coverColor(this.L.pal);
    this.intro = { kind, t: 0, dur: kind === 'retry' ? 1.7 : 1.6, popped: kind !== 'retry', popT: 0, hud: false };
    this.root.classList.add('mb-intro');
    p.iframes = max(p.iframes, 2.4);
    if (kind === 'retry') {
      const n = this.battery ? 18 : 32, col = this.pcol();
      this.reform = [];
      for (let i = 0; i < n; i++) {
        this.reform.push({ a: random() * TAU, d: p.r * (3.5 + random() * 5.5), delay: random() * 0.3, s: 0.5 + random() * 0.9, c: random() < 0.65 ? col.glow : col.mem, sw: (random() < 0.5 ? -1 : 1) * (1.2 + random()) });
      }
      this.later(120, () => this.sfx('reform'));
    } else {
      this.streaks = makeStreaks(this.W, this.H, this.battery ? 22 : 42);
      this.streakV = 2300;
    }
  },
  // Level title: a big habitat card when you arrive somewhere new, otherwise the usual banner.
  levelBanner() {
    const L = this.L, kind = this.introKind;
    const show = () => {
      if (L.j === 1 && kind !== 'retry') this.habitatCard();
      else if (L.ocean) this.banner(`Expedition ${L.ocean}`, L.isBoss ? L.title : L.name, L.isBoss ? 'danger' : '');
      else this.banner(`Level ${L.c}`, L.isBoss ? `${L.name} · Boss` : L.title, L.isBoss ? 'danger' : '');
    };
    if (kind === 'retry') this.later(1050, show);
    else this.later(300, show);
  },
  habitatCard() {
    const L = this.L, H = C.HABITATS[L.h], a = H.pal.accent;
    if (this.bannerEl) this.bannerEl.remove();
    const card = this.bannerEl = el('div.mb-habitat', {}, [
      el('div.mb-kicker', {}, L.ocean ? `Open Ocean \u00b7 leg ${L.leg}` : `Habitat ${L.h} of ${C.HABITATS.length - 1}`),
      el('h1', {}, L.ocean ? H.name : L.name),
      el('div.mb-hab-line'),
      el('p', {}, L.ocean ? 'Endless water. How far can you go?' : H.tag || ''),
      el('p.mb-hab-lv', {}, L.ocean ? `Expedition ${L.ocean}` : `Level ${L.c}`),
    ]);
    card.style.setProperty('--acc', rgbStr(a));
    card.style.setProperty('--accg', `rgba(${a[0]},${a[1]},${a[2]},.5)`);
    this.hud.appendChild(card);
    this.later(4000, () => card.remove());
  },

  // ------------------------------------------------------------ death
  startDeathFx() {
    const p = this.p;
    this.hitStop = 0.13;
    this.shake = 16; p.flashT = 0.35;
    this.deathWhy = this.hurtWhy || 'Worn down';
    this.deathFx = { t: 0, x: p.x, y: p.y, r: p.r, burst: false, frags: [], drops: [], nuc: null, titled: false };
    this.root.classList.add('mb-cine');
    this.slowmo = 1;
  },
  rupture() {
    const F = this.deathFx, r = F.r, col = this.pcol(), p = this.p;
    F.burst = true;
    const nf = this.battery ? 8 : 12;
    for (let i = 0; i < nf; i++) {
      const a = (i / nf) * TAU + (random() - 0.5) * 0.35;
      F.frags.push({ a, dist: r, v: r * (4.5 + random() * 5), rot: a + (random() - 0.5) * 0.6, spin: (random() - 0.5) * 7, len: r * (TAU / nf) * (0.5 + random() * 0.45), w: r * (0.08 + random() * 0.08), age: 0, life: 1.8 + random() * 0.7, curl: 1.2 + random() * 1.4 });
    }
    const nd = this.battery ? 16 : 30;
    for (let i = 0; i < nd; i++) {
      const a = random() * TAU, d = random() * r * 0.7, sp = r * (1.5 + random() * 7);
      const life = 1.3 + random() * 1.4;
      F.drops.push({ x: F.x + cos(a) * d, y: F.y + sin(a) * d, vx: cos(a) * sp + p.vx * 0.25, vy: sin(a) * sp + p.vy * 0.25, s: r * (0.05 + random() * 0.11), life, max: life, c: random() < 0.8 ? col.body : col.mem });
    }
    F.nuc = { x: F.x, y: F.y, vx: (random() - 0.5) * r * 0.6, vy: (random() - 0.5) * r * 0.6, r: r * 0.3 };
    F.ripple = 0;
    this.burst(F.x, F.y, col.glow, 18, 120 + r * 3);
    this.slowmo = 0.3;
    this.sfx('burst'); this.buzz([50, 30, 110]);
  },
  deathTitle() {
    const kick = this.camp ? `Level ${this.L.c}` : `Depth ${this.depth}`;
    if (this.bannerEl) this.bannerEl.remove();
    const b = this.bannerEl = el('div.mb-banner.death', {}, [
      el('div.mb-kicker', {}, kick),
      el('h1', {}, 'Dissolved'),
      el('div.mb-why', { html: icon('heart') + '<span></span>' }),
    ]);
    b.querySelector('.mb-why span').textContent = this.deathWhy;
    this.root.appendChild(b);
    this.later(2600, () => b.remove());
  },

  // ------------------------------------------------------------ level cleared
  startClearFx() {
    const p = this.p, vr = this.viewR();
    this.root.classList.add('mb-cine');
    const n = this.battery ? 18 : 34;
    const F = this.clearFx = { t: 0, motes: [], glow: 0, chimes: 0 };
    for (let i = 0; i < n; i++) F.motes.push({ a: random() * TAU, d: vr * (0.5 + random() * 0.45), delay: random() * 0.55, dur: 0.75 + random() * 0.45, s: 0.6 + random() * 0.8, c: random() < 0.6 ? GOLD : GOLD_HI, done: false });
    this.shockwave(p.x, p.y, max(240, p.r * 10), 0, true); // push everything gently away
  },
  startMetamorph(to) {
    const p = this.p, vr = this.viewR(), col = this.pcol();
    const M = this.meta = { t: 0, to, swapped: false, titled: false, motes: [] };
    const n = this.battery ? 16 : 30;
    for (let i = 0; i < n; i++) M.motes.push({ a: random() * TAU, d: vr * (0.3 + random() * 0.4), delay: random() * 0.75, dur: 0.5 + random() * 0.3, s: 0.6 + random() * 0.8, c: random() < 0.5 ? col.glow : GOLD_HI });
    p.vx *= 0.3; p.vy *= 0.3;
    this.sfx('metamorph'); this.buzz(20);
  },
  metaSwap() {
    const M = this.meta, p = this.p, col = this.pcol();
    M.swapped = true;
    p.stage = M.to;
    // you are ten times bigger now: everything around you shrinks to your new scale
    for (const e of this.ents) if (e.alive && !e.boss && !e.ally) { e.shrinkFrom = e.r; e.shrinkTo = e.r * 0.32; e.shrinkT = 0; }
    this.bigFlash = 1;
    this.rings = this.rings || [];
    this.rings.push({ x: p.x, y: p.y, r: 0, R: p.r * 8, life: 0.6, c: GOLD_HI });
    this.rings.push({ x: p.x, y: p.y, r: 0, R: p.r * 14, life: 0.6, c: col.glow });
    this.burst(p.x, p.y, GOLD, 26, 160 + p.r * 4);
    this.burst(p.x, p.y, col.glow, 18, 120 + p.r * 3);
    this.shockwave(p.x, p.y, max(220, p.r * 9), 0, true);
    this.shake = 12;
    this.sfx('evolve'); this.later(260, () => this.sfx('milestone'));
    this.buzz([30, 40, 30, 40, 90]);
  },

  // ------------------------------------------------------------ leaving a level
  closeResults() {
    const ov = this.root.querySelector('.mb-res-ov');
    if (ov) { ov.classList.add('closing'); this.later(260, () => ov.remove()); }
    this.modal = null;
  },
  goNext() {
    if (this.outro || this.exited) return;
    const next = C.levelConfig(this.L.c + 1);
    this.closeResults();
    const pal = {}; for (const k in next.pal) pal[k] = next.pal[k].map((v, i) => (k === 'bg' || k === 'edge' ? v * 0.92 : v));
    this.palT = pal;
    this.outro = { kind: 'next', t: 0, dur: 1.4, cover: coverColor(next.pal) };
    this.streaks = makeStreaks(this.W, this.H, this.battery ? 22 : 42);
    this.streakV = 0;
    this.input.active = false;
    this.sfx('descend'); this.buzz([15, 30, 15]);
  },
  goRetry() {
    if (this.outro || this.exited) return;
    this.closeResults();
    this.outro = { kind: 'retry', t: 0, dur: 0.65, cover: coverColor(this.L.pal) };
    this.input.active = false;
  },
  cineLock() {
    const I = this.intro;
    return !!(this.outro || this.meta || (I && !I.popped));
  },
  // movement while the player is not in control (diving away, evolving, re-forming)
  cineMove(dt) {
    const p = this.p, O = this.outro;
    if (O && O.kind === 'next') {
      const k = cl(O.t / O.dur);
      p.vx *= exp(-dt * 4);
      p.vy += (60 + 1200 * k * k - p.vy) * min(1, dt * 6);
      const d = atan2(sin(PI / 2 - p.ang), cos(PI / 2 - p.ang));
      p.ang += d * min(1, dt * 5);
      p.speedN = min(1, (p.speedN || 0) + dt * 2);
    } else { p.vx *= exp(-dt * 4); p.vy *= exp(-dt * 4); }
    p.x += p.vx * dt; p.y += p.vy * dt;
  },

  // ------------------------------------------------------------ per frame (real time)
  cineTick(rd) {
    const p = this.p;
    if (this.bigFlash) this.bigFlash = max(0, this.bigFlash - rd * 2.2);
    // arrival
    const I = this.intro;
    if (I) {
      I.t += rd;
      if (!I.popped && I.t >= 0.95) {
        I.popped = true; I.popT = I.t;
        const col = this.pcol();
        this.rings = this.rings || [];
        this.rings.push({ x: p.x, y: p.y, r: 0, R: p.r * 4.5, life: 0.6, c: col.glow });
        this.burst(p.x, p.y, col.glow, 14, 90 + p.r * 2);
        this.sfx('pop'); this.buzz(18);
      }
      if (!I.hud && I.t > (I.kind === 'retry' ? 1.15 : 0.85)) { I.hud = true; this.root.classList.remove('mb-intro'); }
      if (I.t >= I.dur) { this.intro = null; this.reform = null; if (!this.outro) this.streaks = null; }
    }
    // streaks: decelerate on arrival, accelerate on the way out
    if (this.streaks) {
      if (this.outro && this.outro.kind === 'next') this.streakV = 2600 * in2(cl(this.outro.t / this.outro.dur));
      else this.streakV *= exp(-rd * 3);
      const V = this.streakV, H = this.H, W = this.W;
      for (const s of this.streaks) {
        s.y -= V * s.sp * rd;
        if (s.y + s.l * 2 < -20) { s.y = H + random() * 80; s.x = random() * W; }
      }
    }
    // death
    const F = this.deathFx;
    if (F) {
      F.t += rd;
      if (!F.burst && F.t >= 0.13) this.rupture();
      if (F.burst) {
        this.slowmo = min(1, 0.3 + 0.7 * cl((F.t - 0.13) / 1.7));
        const wd = rd * (0.45 + 0.55 * this.slowmo); // debris moves in gentle slow motion
        F.ripple += rd;
        for (const f of F.frags) { f.age += rd; f.dist += f.v * wd; f.v *= exp(-wd * 2); f.rot += f.spin * wd; f.spin *= exp(-wd * 0.8); }
        for (const d of F.drops) { d.life -= rd; d.x += d.vx * wd; d.y += d.vy * wd; const k = exp(-wd * 2.4); d.vx *= k; d.vy *= k; }
        if (F.nuc) { const n = F.nuc; n.x += n.vx * wd; n.y += n.vy * wd; }
      }
      if (!F.titled && F.t >= 0.45) { F.titled = true; this.deathTitle(); }
      if (!F.done && F.t >= 2.7) { F.done = true; if (this.camp) this.showCampaignResults(false); else this.showResults(); }
    }
    // level cleared: golden light spirals in
    const G = this.clearFx;
    if (G) {
      G.t += rd;
      for (const m of G.motes) {
        if (!m.done && G.t >= m.delay + m.dur) {
          m.done = true; G.glow = min(1.1, G.glow + 0.06);
          if ((G.chimes++ % 4) === 0) this.sfx('eat', { pitch: G.chimes >> 2 });
        }
      }
      if (G.motes.every((m) => m.done)) G.glow *= exp(-rd * 0.7);
      if (this.evolvedTo && !G.meta && G.t >= 1.3) { G.meta = true; this.startMetamorph(this.evolvedTo); }
      const endAt = this.evolvedTo ? 1.3 + 2.7 : this.L && this.L.isBoss ? 1.7 : 2.3;
      if (!G.done && G.t >= endAt) { G.done = true; this.showCampaignResults(true); }
    }
    // metamorphosis
    const M = this.meta;
    for (const e of this.ents) if (e.shrinkTo) { e.shrinkT = min(1, e.shrinkT + rd / 1.4); e.r = e.shrinkFrom + (e.shrinkTo - e.shrinkFrom) * out3(e.shrinkT); if (e.shrinkT >= 1) e.shrinkTo = 0; }
    if (M) {
      M.t += rd;
      if (M.t < 1.1) this.shake = max(this.shake, 4 * in2(M.t / 1.1));
      if (!M.swapped && M.t >= 1.1) this.metaSwap();
      if (!M.titled && M.t >= 1.4) { M.titled = true; this.banner('You evolved', C.STAGES[M.to].name, 'gold'); }
    }
    // the way out
    const O = this.outro;
    if (O) {
      O.t += rd;
      if (O.t >= O.dur && !O.done) {
        O.done = true;
        this.exit(O.kind, { seamless: true, cover: O.cover, evolveShown: !!this.evolvedTo });
      }
    }
  },

  // camera push-in for the current moment
  cineZoom() {
    let z = 1;
    const I = this.intro, F = this.deathFx, G = this.clearFx, M = this.meta, O = this.outro;
    if (I) z *= I.kind === 'retry' ? 1 + 0.2 * (1 - out3(cl(I.t / I.dur))) : 1 + 0.38 * (1 - out3(cl(I.t / I.dur)));
    if (F) z *= 1 + 0.45 * inOut(cl(F.t / 1.9));
    if (G) z *= 1 + 0.14 * inOut(cl(G.t / 1.4));
    if (M) z *= M.t < 1.1 ? 1 + 0.22 * inOut(M.t / 1.1) : 1 + 0.22 - 0.1 * out3(cl((M.t - 1.1) / 0.8));
    if (O) z *= O.kind === 'next' ? 1 + 0.5 * in2(cl(O.t / O.dur)) : 1 + 0.08 * cl(O.t / O.dur);
    return z;
  },

  // how to draw the player right now: { s: scale, a: alpha } or null when the cell is gone
  cinePlayer() {
    const F = this.deathFx;
    if (F) {
      if (F.t < 0.13) return { s: 1 + 0.9 * F.t, a: 1 };
      if (F.t < 0.42) { const k = (F.t - 0.13) / 0.29; return { s: 1.12 + 0.4 * k, a: 0.55 * (1 - k) }; }
      return null;
    }
    if (this.dead) return null;
    const I = this.intro;
    if (I && I.kind === 'retry') {
      if (!I.popped) return null;
      const k = cl((I.t - I.popT) / 0.55);
      return { s: max(0.02, back(k)), a: min(1, k * 4) };
    }
    const M = this.meta;
    if (M) {
      if (M.t < 1.1) return { s: 1 - 0.5 * in2(M.t / 1.1), a: 1 };
      const k = cl((M.t - 1.1) / 0.6);
      return { s: 0.4 + 0.6 * max(0, back(k)), a: 1 };
    }
    return { s: 1, a: 1 };
  },

  // world-space effects drawn behind the player
  cineBack(ctx) {
    const p = this.p, T = this.T;
    const G = this.clearFx;
    if (G && G.glow > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      const s = p.r * (3 + 0.15 * sin(T * 4));
      ctx.globalAlpha = min(0.9, G.glow);
      ctx.drawImage(glowSprite(GOLD), p.x - s, p.y - s, s * 2, s * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const M = this.meta;
    if (M) {
      const k = M.t < 1.1 ? in2(M.t / 1.1) : max(0, 1 - (M.t - 1.1) / 0.9);
      if (k > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        const s = p.r * (2 + 2.5 * k);
        ctx.globalAlpha = 0.9 * k;
        ctx.drawImage(glowSprite(GOLD), p.x - s, p.y - s, s * 2, s * 2);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    const I = this.intro;
    if (I && I.kind === 'retry' && !I.popped) {
      // a faint nucleus gathers before the cell re-forms around it
      const k = cl(I.t / 0.95), s = p.r * (0.4 + 1.1 * k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.6 * k;
      ctx.drawImage(glowSprite(this.pcol().glow), p.x - s, p.y - s, s * 2, s * 2);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  },

  // world-space effects drawn over the player
  cineFront(ctx, z) {
    const p = this.p;
    ctx.lineCap = 'round';
    const F = this.deathFx;
    if (F && F.burst) {
      const col = this.pcol();
      // a soft ripple through the water
      if (F.ripple < 0.9) {
        const k = F.ripple / 0.9;
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.strokeStyle = rgbStr(col.glow); ctx.lineWidth = F.r * 0.1 * (1 - k) + 1 / z;
        ctx.beginPath(); ctx.arc(F.x, F.y, F.r * (1.2 + 5 * out3(k)), 0, TAU); ctx.stroke();
      }
      // cytoplasm spilling out
      for (const d of F.drops) {
        if (d.life <= 0) continue;
        const k = d.life / d.max;
        ctx.globalAlpha = 0.8 * Math.sqrt(k);
        ctx.fillStyle = rgbStr(d.c);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.s * (0.35 + 0.65 * k), 0, TAU); ctx.fill();
      }
      // the nucleus drifts free, flickers twice and goes dark
      if (F.nuc) {
        const n = F.nuc, t = F.t;
        const fade = cl(1 - (t - 1.3) / 1.1);
        const beat = 0.9 * exp(-(((t - 0.6) / 0.09) ** 2)) + 0.5 * exp(-(((t - 1.15) / 0.1) ** 2));
        if (fade > 0) {
          ctx.globalAlpha = 0.85 * fade;
          ctx.fillStyle = rgbStr(col.nuc);
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (0.85 + 0.15 * fade), 0, TAU); ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = min(1, 0.2 * fade + beat);
          const s = n.r * (2.2 + beat * 1.5);
          ctx.drawImage(glowSprite(col.glow), n.x - s, n.y - s, s * 2, s * 2);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      // torn membrane pieces curl up as they drift away
      for (const f of F.frags) {
        const k = cl((f.life - f.age) / 0.7);
        if (k <= 0) continue;
        const rc = F.r * (0.3 + 0.7 * exp(-f.age * f.curl)), ang = min(TAU * 0.9, f.len / rc);
        ctx.save();
        ctx.translate(F.x + cos(f.a) * f.dist, F.y + sin(f.a) * f.dist);
        ctx.rotate(f.rot);
        ctx.beginPath(); ctx.arc(-rc, 0, rc, -ang / 2, ang / 2);
        ctx.globalAlpha = 0.35 * k; ctx.strokeStyle = rgbStr(col.body); ctx.lineWidth = f.w * 2.2; ctx.stroke();
        ctx.globalAlpha = 0.95 * k; ctx.strokeStyle = rgbStr(col.mem); ctx.lineWidth = f.w; ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    // golden motes spiral in
    const spiral = (list, t, swirl) => {
      ctx.globalCompositeOperation = 'lighter';
      for (const m of list) {
        const k = cl((t - m.delay) / m.dur);
        if (k <= 0 || k >= 1) continue;
        for (let j = 0; j < 3; j++) {
          const kk = max(0, k - j * 0.05), e = in2(kk);
          const a = m.a + e * swirl, d = m.d * (1 - e) + p.r * 0.2;
          const s = max(9 / z, p.r * 0.5) * m.s * (1 - j * 0.28);
          ctx.globalAlpha = min(1, kk * 4) * (1 - j * 0.35);
          ctx.drawImage(glowSprite(m.c, 1), p.x + cos(a) * d - s, p.y + sin(a) * d - s, s * 2, s * 2);
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    };
    if (this.clearFx) spiral(this.clearFx.motes, this.clearFx.t, 2.4);
    if (this.meta && this.meta.t < 1.3) spiral(this.meta.motes, this.meta.t, -3);
    // the chrysalis: the old body melts into light, the new one bursts out of it
    const M = this.meta;
    if (M) {
      const k = M.t < 1.1 ? in2(cl((M.t - 0.45) / 0.65)) : max(0, 1 - (M.t - 1.1) / 0.35);
      if (k > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        const s = p.r * 1.5;
        ctx.globalAlpha = 0.95 * k;
        ctx.drawImage(glowSprite(GOLD_HI), p.x - s, p.y - s, s * 2, s * 2);
        ctx.drawImage(glowSprite([255, 255, 255]), p.x - s * 0.7, p.y - s * 0.7, s * 1.4, s * 1.4);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    // re-forming: specks of you drift back together
    const I = this.intro;
    if (I && this.reform && !I.popped) {
      ctx.globalCompositeOperation = 'lighter';
      for (const m of this.reform) {
        const k = cl((I.t - m.delay) / (0.95 - m.delay));
        if (k <= 0) continue;
        const e = in3(k), a = m.a + (1 - e) * m.sw, d = m.d * (1 - e);
        const s = max(5 / z, p.r * 0.28) * m.s * (0.6 + 0.4 * k);
        ctx.globalAlpha = min(1, k * 3);
        ctx.drawImage(glowSprite(m.c, 1), p.x + cos(a) * d - s, p.y + sin(a) * d - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  },

  // screen-space: streaks, the death darkening, flashes and the colour cover between levels
  cineScreen(ctx, W, H) {
    const pal = this.palCur;
    if (this.streaks && this.streakV > 40) {
      const V = this.streakV, st = min(1, V / 1500), va = min(1, V / 500);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgbStr(pal.plankton); ctx.lineCap = 'round';
      for (const s of this.streaks) {
        ctx.globalAlpha = s.a * va; ctx.lineWidth = s.w;
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y + s.l * (0.3 + st * 1.7)); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const F = this.deathFx;
    if (F) {
      const red = cl(1 - F.t / 0.7);
      if (red > 0) {
        if (!this.dmgVig) { const g = ctx.createRadialGradient(W / 2, H / 2, min(W, H) * 0.32, W / 2, H / 2, hypot(W, H) * 0.58); g.addColorStop(0, 'rgba(255,20,50,0)'); g.addColorStop(0.7, 'rgba(255,30,60,0.35)'); g.addColorStop(1, 'rgba(255,40,70,0.85)'); this.dmgVig = g; }
        ctx.globalAlpha = red; ctx.fillStyle = this.dmgVig; ctx.fillRect(0, 0, W, H);
      }
      const dark = 0.55 * inOut(cl((F.t - 0.5) / 1.7));
      if (dark > 0) { ctx.globalAlpha = dark; ctx.fillStyle = 'rgb(2,4,10)'; ctx.fillRect(0, 0, W, H); }
      ctx.globalAlpha = 1;
    }
    if (this.bigFlash > 0.01) { ctx.globalAlpha = min(1, this.bigFlash) * 0.85; ctx.fillStyle = 'rgb(255,250,235)'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    let cover = 0, cc = this.cover;
    const I = this.intro;
    if (I) cover = I.kind === 'retry' ? 1 - out3(cl(I.t / 0.6)) : 1 - out3(cl(I.t / 0.85));
    const O = this.outro;
    if (O) { cc = O.cover; cover = O.kind === 'next' ? in3(cl((O.t / O.dur - 0.3) / 0.7)) : in2(cl(O.t / O.dur)); }
    if (cover > 0.002 && cc) { ctx.globalAlpha = min(1, cover); ctx.fillStyle = rgbStr(cc); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  },

  // the "you evolved" block on the results screen
  evolveBox(to) {
    const S = C.STAGES[to];
    let pic = null;
    try { pic = portrait('stage', to, 120); pic.style.width = pic.style.height = '64px'; } catch (e) { pic = null; }
    // traits you already have that look different on the new body (polyps → pyloric caeca, …)
    const m = this.p.muts, changed = Object.keys(m).filter((id) => m[id] > 0 && this.mutName(id, to - 1) !== this.mutName(id, to));
    const forms = changed.length ? `${to === 4 ? 'Your old traits take fish form' : 'Your traits change with your body'}: ${changed.slice(0, 5).map((id) => `${this.mutName(id, to - 1)} → ${this.mutName(id, to)}`).join(', ')}${changed.length > 5 ? `, and ${changed.length - 5} more (see Traits)` : ''}.` : '';
    return el('div.panel.mb-evobox', {}, [
      pic,
      el('div', {}, [
        el('div.mb-kicker', {}, 'You evolved'),
        el('b', {}, S.name),
        S.size ? el('div.small', { style: { color: '#ffd678', fontWeight: 800, margin: '0 0 2px' } }, `You are about ${S.size} long now`) : null,
        C.STAGE_POWER[to] ? el('div.small', { style: { color: '#9fdcff', fontWeight: 800, margin: '0 0 2px' } }, `New power: ${C.POWER_NAMES[C.STAGE_POWER[to]]}`) : null,
        el('p.dim.small', {}, S.blurb.replace(/^[^.]*\.\s*/, '').replace(/New power: [^.]*\.\s*/, '')),
        forms ? el('p.small', { style: { color: '#a8ffd8', margin: '4px 0 0' } }, forms) : null,
      ]),
    ]);
  },
};
