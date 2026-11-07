// Bespoke boss fights. Every boss is beaten a different way, borrowed from its real biology:
// a light-shy amoeba you lure into sunbeams, a virus you stop from infecting cells, a colony whose
// daughters you eat, a rotifer you choke with spores, a comb jelly you flank, a worm you catch between
// its chimneys, a cuttlefish you find among its ink decoys, a mantis shrimp you bait into missing,
// an anglerfish you blind with a glowing shrimp, a siphonophore colony you take apart polyp by polyp,
// a grouper that chokes on an inflated pufferfish, and a squid pack whose flashing signals you scramble.
//
// A kit = { r(p) radius, chip (share of trait/aura damage that still lands), phaseAt [hp fractions],
//           phaseText, hint [icon, text], spawn(g,b,k), tick(g,b,k,dt), eat?(g,b,k,e), under?, over?, screen?, die? }
// Kit damage is a share of the boss's max HP (bossHit), so the number of good hits a fight takes is
// the same at any level: difficulty comes from how fast and hard the boss attacks.
import * as D from './data.js';
import { glowSprite, rgbStr, drawSpecies, CREATURE_ART, artH } from './art.js';

const { sin, cos, atan2, hypot, min, max, abs, random, PI, exp, sqrt, floor } = Math;
const TAU = PI * 2;
const ad = (a, b) => { const d = b - a; if (!Number.isFinite(d)) return 0; return ((d + PI) % TAU + TAU) % TAU - PI; };
const turn = (a, target, rate) => { const d = ad(a, target); return a + (abs(d) < rate ? d : Math.sign(d) * rate); };
const steer = (b, tx, ty, sp, k, dt) => { const a = 1 - exp(-dt * k); b.vx += (tx * sp - b.vx) * a; b.vy += (ty * sp - b.vy) * a; };
const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
  const u = max(0, min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
  return hypot(px - ax - vx * u, py - ay - vy * u);
};
const ease = (x) => x * x * (3 - 2 * x);
// bites during a vulnerable window: a few per window, so a stun is a big chance but never the whole fight
const winBite = (b, k, most, cd = 0.6) => { if (b.biteCd > 0 || (k.wb | 0) >= most) return false; b.biteCd = cd; k.wb = (k.wb | 0) + 1; return true; };

// draw one of a creature module's extra drawers (tubes, dens, colony parts) in world space
function drawPart(ctx, fn, x, y, ang, r, sc, T, col, ...args) {
  if (!fn) return false;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(r, r);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; // the background layers may leave additive blending on
  fn(ctx, T, artH(r * sc, col), ...args);
  ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  return true;
}
function drawFake(ctx, e, T, sc, alpha = 1) {
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang || 0); ctx.scale(e.r, e.r);
  ctx.globalAlpha = alpha;
  drawSpecies(ctx, e, T, e.r * sc);
  ctx.restore(); ctx.globalAlpha = 1;
}
function glow(ctx, x, y, r, col, a) {
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
  ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

export const BOSS_KIT = {};

// ===================================================================================== Giant Amoeba
// Amoebae shy away from bright light. It creeps after you, avoiding the sunbeams, then surges at you in
// a straight line: stand behind a beam and the surge carries it into the light, where it is stunned and
// burnt. While it is stunned its nucleus is exposed: bite it.
BOSS_KIT.giantamoeba = {
  r: (p) => 100 + p.r * 1.3,
  chip: 0.15, phaseAt: [0.5], phaseText: ['Starving: faster surges'],
  hint: ['sun', 'Sunlight burns it! Stand behind a light beam so its surge carries it into the light'],
  spawn(g, b, k) {
    k.beams = []; const a0 = random() * TAU;
    for (let i = 0; i < 3; i++) k.beams.push({ a: a0 + i * TAU / 3, d: 290 + random() * 70, r: 130 + random() * 25, x: 0, y: 0, hot: 0 });
    for (const B of k.beams) { B.x = b.ax + cos(B.a) * B.d; B.y = b.ay + sin(B.a) * B.d; }
    k.state = 'hunt'; k.st = 0; k.surgeT = 2.6; k.pods = []; k.podT = 2.4; k.cool = 0; k.burns = 0;
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    for (const B of k.beams) { B.a += dt * 0.05; B.x = b.ax + cos(B.a) * B.d; B.y = b.ay + sin(B.a) * B.d; B.hot = max(0, B.hot - dt); }
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    k.cool = max(0, k.cool - dt);
    let tx = 0, ty = 0, sp = 0, sk = 1.2;
    // caught in a sunbeam
    if (k.cool <= 0 && k.state !== 'burn') {
      const B = k.beams.find((B) => hypot(B.x - b.x, B.y - b.y) < B.r * 0.8);
      if (B) {
        k.state = 'burn'; k.st = 2.3; k.burnB = B; B.hot = 2.3; k.pods.length = 0; k.burns++; k.wb = 0;
        g.sfx('toxin'); g.sfx('boss', { vol: 0.4 }); g.flash = 0.4;
        g.bossHit(0.11, b.x, b.y - b.r * 0.5, { raw: true, knock: false, text: 'Sunburnt!', tc: '#ffd36b', c: [255, 220, 120] });
        if (!b.alive) return;
        g.hint('boss_amoeba2', 'It’s stunned! Bite it while it burns', 'target', 3000);
      }
    }
    switch (k.state) {
      case 'hunt': {
        tx = dx / d; ty = dy / d; sp = ps * (ph2 ? 0.42 : 0.35);
        for (const B of k.beams) { // shy of the light: it flows around the beams
          const bx = b.x - B.x, by = b.y - B.y, bd = hypot(bx, by) + 0.01, R = B.r + b.r * 0.6 + 70;
          if (bd < R) { const f = (1 - bd / R) * 2.6; tx += bx / bd * f; ty += by / bd * f; }
        }
        const tl = hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        k.surgeT -= dt;
        if (k.surgeT <= 0 && d < 720 && !g.dead) { k.state = 'gather'; k.st = ph2 ? 0.8 : 0.95; k.aim = atan2(dy, dx); g.sfx('gulp', { vol: 0.6 }); }
        break;
      }
      case 'gather': { // telegraph: it bunches up, then flows at you in a straight line
        k.st -= dt; b.tele = 1; b.vx *= exp(-dt * 5); b.vy *= exp(-dt * 5);
        if (k.st > 0.3) k.aim = atan2(dy, dx); // the aim locks just before the surge
        if (k.st <= 0) { k.state = 'surge'; k.st = 1.1; g.sfx('dash'); g.shake = min(10, g.shake + 4); const s = ps * (ph2 ? 1.3 : 1.15); b.vx = cos(k.aim) * s; b.vy = sin(k.aim) * s; }
        break;
      }
      case 'surge': {
        k.st -= dt; tx = cos(k.aim); ty = sin(k.aim); sp = ps * (ph2 ? 1.3 : 1.15); sk = 8;
        if (random() < 0.6) g.part(b.x - tx * b.r * 0.8 + (random() - 0.5) * b.r, b.y - ty * b.r * 0.8 + (random() - 0.5) * b.r, -tx * 60, -ty * 60, 0.6, [255, 190, 130], 5);
        if (k.st <= 0) { k.state = 'hunt'; k.surgeT = ph2 ? 2.2 + random() : 3.2 + random() * 1.4; }
        break;
      }
      case 'burn': {
        k.st -= dt; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        b.hp -= b.maxHp * 0.035 * dt; b.flash = max(b.flash, 0.35);
        if (random() < dt * 14) { const a = random() * TAU, rr = random() * b.r; g.part(b.x + cos(a) * rr, b.y + sin(a) * rr, (random() - 0.5) * 30, -40 - random() * 50, 0.9, [255, 230, 170], 4 + random() * 5); }
        if (b.hp <= 0) { g.bossDie(); return; }
        if (k.st <= 0) { const B = k.burnB; k.state = 'flee'; k.st = 1.3; k.fa = atan2(b.y - B.y, b.x - B.x); k.cool = 2.2; }
        break;
      }
      case 'flee': {
        k.st -= dt; tx = cos(k.fa); ty = sin(k.fa); sp = ps * 0.75; sk = 3;
        if (k.st <= 0) { k.state = 'hunt'; k.surgeT = ph2 ? 1.6 : 2.4; }
        break;
      }
    }
    if (k.state !== 'gather' && k.state !== 'burn') steer(b, tx, ty, sp, sk, dt);
    // pseudopods: it reaches for you
    k.podT -= dt;
    if (k.state === 'hunt' && k.podT <= 0 && d < b.r + 300 && d > b.r * 0.9 && !g.dead) {
      k.podT = ph2 ? 1.7 : 2.5;
      k.pods.push({ a: atan2(dy, dx), len: 0, max: min(300, d - b.r * 0.75 + 70), t: 0, hit: false });
      g.sfx('bubble', { vol: 0.5 });
    }
    for (const q of k.pods) {
      q.t += dt;
      const T1 = 0.5, T2 = 0.78, T3 = 1.05, T4 = 1.7;
      q.len = q.t < T1 ? q.max * 0.12 * (q.t / T1) : q.t < T2 ? q.max * (0.12 + 0.88 * ease((q.t - T1) / (T2 - T1))) : q.t < T3 ? q.max : q.max * max(0, 1 - (q.t - T3) / (T4 - T3));
      q.x0 = b.x + cos(q.a) * b.r * 0.75; q.y0 = b.y + sin(q.a) * b.r * 0.75;
      q.x1 = b.x + cos(q.a) * (b.r * 0.75 + q.len); q.y1 = b.y + sin(q.a) * (b.r * 0.75 + q.len);
      if (!q.hit && q.t > T1 && q.t < T3 && !g.dead && segDist(p.x, p.y, q.x0, q.y0, q.x1, q.y1) < p.r + 18) {
        q.hit = true;
        if (g.hurt(16, b, { why: 'Giant Amoeba pseudopod', iframes: 0.7 })) { p.vx -= cos(q.a) * 380; p.vy -= sin(q.a) * 380; }
      }
    }
    k.pods = k.pods.filter((q) => q.t < 1.7);
    // contact: engulfing, unless it is stunned in the light
    if (!g.dead && d < b.r * 0.9 + p.r * 0.7) {
      if (k.state === 'burn') {
        if (winBite(b, k, 3)) g.bossHit(0.04, (p.x + b.x) / 2, (p.y + b.y) / 2);
      } else {
        const pen = b.r * 0.9 + p.r * 0.7 - d;
        p.x += dx / d * pen * 0.6; p.y += dy / d * pen * 0.6;
        p.vx *= exp(-dt * 3); p.vy *= exp(-dt * 3);
        if (k.state === 'surge') { if (g.hurt(22, b, { why: 'Giant Amoeba', iframes: 0.9 })) { p.vx += dx / d * 420; p.vy += dy / d * 420; } }
        else g.hurt(22 * dt, null, { dot: true, why: 'Giant Amoeba engulfing you' });
        if (!k.fx || k.fx < g.T) { k.fx = g.T + 0.25; p.flashT = 0.2; g.shake = min(6, g.shake + 1.5); }
      }
    }
  },
  under(g, ctx, z, inView) {
    const k = g.boss.k, T = g.T, b = g.boss;
    for (const B of k.beams) {
      if (!inView(B.x, B.y, B.r * 1.5 + 1400)) continue;
      const hot = B.hot > 0 ? 1 : 0;
      ctx.globalCompositeOperation = 'lighter';
      ctx.save(); ctx.translate(B.x, B.y); ctx.rotate(-0.25);
      ctx.globalAlpha = 0.22 + 0.05 * sin(T * 1.7 + B.a) + 0.2 * hot;
      ctx.drawImage(g.tint(g.shaft, [255, 230, 160]), -B.r * 0.85, -1500, B.r * 1.7, 1500 + B.r * 0.3);
      ctx.restore();
      // a bright pool of sunlight on the water
      ctx.globalAlpha = 0.75 + 0.1 * sin(T * 2 + B.a) + 0.25 * hot;
      ctx.drawImage(glowSprite([255, 215, 120]), B.x - B.r * 1.3, B.y - B.r * 1.3, B.r * 2.6, B.r * 2.6);
      ctx.globalAlpha = 0.45 + 0.3 * hot;
      ctx.drawImage(glowSprite([255, 245, 200], 1), B.x - B.r * 0.75, B.y - B.r * 0.75, B.r * 1.5, B.r * 1.5);
      // glinting motes of light
      for (let i = 0; i < 7; i++) {
        const a = i * 2.39 + B.a * 3, rr = B.r * 0.7 * ((i * 0.43 + T * 0.05) % 1), s = 5 + 3 * sin(T * 3 + i);
        ctx.globalAlpha = 0.5 + 0.4 * sin(T * 2.3 + i * 1.7);
        ctx.drawImage(glowSprite([255, 250, 220], 1), B.x + cos(a) * rr - s, B.y + sin(a) * rr - s, s * 2, s * 2);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(B.x, B.y, B.r * 0.8, 0, TAU);
      ctx.strokeStyle = `rgba(255,236,170,${0.55 + 0.15 * sin(T * 3 + B.a)})`; ctx.lineWidth = 2.5 / z; ctx.setLineDash([12 / z, 9 / z]); ctx.stroke(); ctx.setLineDash([]);
    }
    // pseudopods flow out from under the body
    for (const q of k.pods) {
      if (q.x0 === undefined) continue;
      const w0 = b.r * 0.32, w1 = 16, nx = -sin(q.a), ny = cos(q.a);
      ctx.beginPath();
      ctx.moveTo(q.x0 + nx * w0, q.y0 + ny * w0);
      ctx.quadraticCurveTo((q.x0 + q.x1) / 2 + nx * w1 * 1.4, (q.y0 + q.y1) / 2 + ny * w1 * 1.4, q.x1 + nx * w1, q.y1 + ny * w1);
      ctx.arc(q.x1, q.y1, w1, q.a + PI / 2, q.a - PI / 2, true);
      ctx.quadraticCurveTo((q.x0 + q.x1) / 2 - nx * w1 * 1.4, (q.y0 + q.y1) / 2 - ny * w1 * 1.4, q.x0 - nx * w0, q.y0 - ny * w0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,175,120,0.55)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,225,190,0.8)'; ctx.lineWidth = 2.5 / z; ctx.stroke();
      if (q.t < 0.5) glow(ctx, q.x0, q.y0, b.r * 0.5, [255, 120, 90], 0.5 * (q.t / 0.5));
    }
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k;
    if (k.state === 'gather') { // where the surge will go
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + cos(k.aim) * 380, b.y + sin(k.aim) * 380);
      ctx.strokeStyle = `rgba(255,120,90,${0.18 + 0.15 * sin(g.T * 20)})`; ctx.lineWidth = b.r * 0.9; ctx.lineCap = 'round'; ctx.stroke();
    }
    if (k.state === 'burn') glow(ctx, b.x, b.y, b.r * 1.6, [255, 220, 130], 0.35 + 0.15 * sin(g.T * 9));
  },
};

// ===================================================================================== Giant Virus
// A virus cannot make more of itself: it docks onto a cell and injects its genome, turning the cell into a
// virus factory that later bursts. While it is docked its capsid is open: bite it to stop the infection.
// Infected cells (purple) can be eaten before they burst, which destroys the factory.
const spawnHost = (g, b, initial) => {
  const p = g.p, a = random() * TAU, d = initial ? 200 + random() * 380 : g.viewR() * 1.05;
  const cx = initial ? b.ax : p.x, cy = initial ? b.ay : p.y;
  const e = g.spawn('grazer', cx + cos(a) * d, cy + sin(a) * d, { force: true, r: p.r * (0.52 + random() * 0.14) });
  if (e) e.host = true;
  return e;
};
BOSS_KIT.virus = {
  r: (p) => 56 + p.r * 0.9,
  chip: 0.12, phaseAt: [0.5], phaseText: ['It infects faster'],
  hint: ['microbe', 'It infects cells! Bite it while it’s docked, and eat purple infected cells'],
  spawn(g, b, k) {
    k.state = 'roam'; k.st = 0; k.seekT = 2.5; k.swarmT = 5; k.burstT = 6; k.host = null; k.hostT = 0;
    for (let i = 0; i < 9; i++) spawnHost(g, b, true);
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    const hosts = g.ents.filter((e) => e.alive && e.host);
    // keep the water stocked with cells to infect
    k.hostT -= dt; if (k.hostT <= 0 && hosts.filter((e) => !e.infected).length < 7) { k.hostT = 1.5; spawnHost(g, b, false); }
    // infected cells swell into virus factories and burst
    for (const e of hosts) {
      if (!e.infected) continue;
      e.infected = min(1, e.infected + dt / (ph2 ? 6 : 7.5));
      e.r = e.r0 * (1 + 0.32 * e.infected);
      if (e.r > p.r * 0.8) e.r = p.r * 0.8;
      e.ctl.tx = cos(e.seed + g.T * 0.3); e.ctl.ty = sin(e.seed + g.T * 0.3);
      if (e.infected >= 1) {
        e.alive = false;
        g.burst(e.x, e.y, [200, 120, 255], 22, 220); g.sfx('pop'); g.shake = min(10, g.shake + 4);
        for (let i = 0; i < (ph2 ? 6 : 5); i++) { const a = (i / 5) * TAU, f = g.spawn('phage', e.x + cos(a) * e.r, e.y + sin(a) * e.r, { force: true }); if (f) { f.vx = cos(a) * 200; f.vy = sin(a) * 200; } }
        b.hp = min(b.maxHp, b.hp + b.maxHp * 0.04);
        g.texts.push({ x: e.x, y: e.y - e.r, s: 'Burst! +virus', life: 1.2, c: '#d6a8ff' });
      }
    }
    let tx = 0, ty = 0, sp = 0, sk = 1.6;
    b.open = max(0, (b.open || 0) - dt * 2);
    switch (k.state) {
      case 'roam': {
        // keeps its distance and circles you
        const want = 320, kk = d > want + 60 ? 1 : d < want - 60 ? -1 : 0;
        tx = dx / d * kk - dy / d * 0.6; ty = dy / d * kk + dx / d * 0.6; sp = ps * (ph2 ? 0.6 : 0.5);
        b.ang = turn(b.ang, atan2(dy, dx), dt * 3);
        k.seekT -= dt;
        if (k.seekT <= 0) {
          let best = null, bs = -1e9;
          for (const e of hosts) { if (e.infected || e.r > p.r * 0.9) continue; const s = hypot(e.x - p.x, e.y - p.y) - 0.6 * hypot(e.x - b.x, e.y - b.y); if (s > bs) { bs = s; best = e; } }
          if (best) { k.host = best; best.targeted = true; k.state = 'seek'; k.st = 6; g.sfx('event', { vol: 0.4 }); } else k.seekT = 1;
        }
        k.swarmT -= dt;
        if (k.swarmT <= 0 && d < 700) {
          k.swarmT = ph2 ? 5 : 7; const n = ph2 ? 6 : 4, a0 = atan2(dy, dx);
          for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.35, f = g.spawn('phage', b.x + cos(a) * b.r, b.y + sin(a) * b.r, { force: true }); if (f) { f.vx = cos(a) * 240; f.vy = sin(a) * 240; } }
          g.sfx('bubble');
        }
        break;
      }
      case 'seek': {
        const h = k.host; k.st -= dt;
        if (!h || !h.alive || h.infected || k.st <= 0) { if (h) h.targeted = false; k.host = null; k.state = 'roam'; k.seekT = 1; break; }
        const hx = b.x - h.x, hy = b.y - h.y, hd = hypot(hx, hy) + 0.01;
        const dock = h.r + b.r * 2.5;
        const px = h.x + hx / hd * dock, py = h.y + hy / hd * dock, ex = px - b.x, ey = py - b.y, ed = hypot(ex, ey) + 0.01;
        tx = ex / ed; ty = ey / ed; sp = ps * (ph2 ? 0.95 : 0.8) * min(1, ed / 60); sk = 3;
        b.ang = turn(b.ang, atan2(hy, hx), dt * 3); // the tail swings round towards the cell
        if (ed < 24) {
          k.state = 'dock'; k.st = ph2 ? 2.4 : 3.2; k.dockA = atan2(hy, hx);
          h.ctl = { tx: 0, ty: 0, sp: 0, steer: 4 };
          g.sfx('gulp', { vol: 0.5 });
          g.hint('boss_virus2', 'It’s injecting! Bite the capsid now', 'target', 2500);
        }
        break;
      }
      case 'dock': {
        const h = k.host; k.st -= dt; b.tele = 1; b.open = 1;
        if (!h || !h.alive) { k.host = null; k.state = 'roam'; k.seekT = 1; break; }
        const dock = h.r + b.r * 2.5;
        b.x = h.x + cos(k.dockA) * dock; b.y = h.y + sin(k.dockA) * dock; b.vx = 0; b.vy = 0; b.ang = k.dockA;
        if (random() < dt * 20) { const u = random(); g.part(b.x - cos(b.ang) * b.r * 2.5 * u, b.y - sin(b.ang) * b.r * 2.5 * u, -cos(b.ang) * 120, -sin(b.ang) * 120, 0.5, [210, 130, 255], 4); }
        if (k.st <= 0) {
          h.targeted = false; h.infected = 0.01; h.r0 = h.r; h.ctl = { tx: 0, ty: 0, sp: 18, steer: 1 };
          g.burst(h.x, h.y, [200, 120, 255], 14, 120); g.sfx('toxin', { vol: 0.5 });
          g.texts.push({ x: h.x, y: h.y - h.r, s: 'Infected!', life: 1.2, c: '#d6a8ff' });
          g.hint('boss_virus3', 'Eat the infected cell before it bursts!', 'microbe', 3000);
          k.host = null; k.state = 'roam'; k.seekT = ph2 ? 1.8 : 3;
        }
        break;
      }
      case 'stagger': {
        k.st -= dt; b.open = 1; b.vx *= exp(-dt * 2); b.vy *= exp(-dt * 2);
        b.ang += dt * 3;
        if (k.st <= 0) { k.state = 'roam'; k.seekT = ph2 ? 1.5 : 2.5; }
        break;
      }
    }
    if (k.state === 'roam' || k.state === 'seek') steer(b, tx, ty, sp, sk, dt);
    if (ph2 && k.state === 'roam') {
      k.burstT -= dt;
      if (k.burstT <= 0.8) b.tele = 1;
      if (k.burstT <= 0) {
        k.burstT = 6; const n = 12, off = random() * TAU;
        for (let i = 0; i < n; i++) { const a = off + (i / n) * TAU; g.shards.push({ x: b.x + cos(a) * b.r, y: b.y + sin(a) * b.r, vx: cos(a) * 200, vy: sin(a) * 200, life: 4, a }); }
        g.sfx('toxin'); g.shake = min(12, g.shake + 5);
      }
    }
    // contact with the capsid
    if (!g.dead && d < b.r * 1.05 + p.r * 0.8) {
      const vuln = k.state === 'dock' || k.state === 'stagger';
      if (vuln) {
        if (k.state === 'dock' ? b.biteCd <= 0 : winBite(b, k, 2)) {
          b.biteCd = 0.5;
          const wasDock = k.state === 'dock';
          g.bossHit(wasDock ? 0.12 : 0.05, (p.x + b.x) / 2, (p.y + b.y) / 2, wasDock ? { text: 'Infection stopped!', tc: '#9dffcf' } : {});
          if (!b.alive) return;
          if (wasDock) {
            const h = k.host; if (h) { h.targeted = false; h.ctl = null; } k.host = null;
            k.state = 'stagger'; k.st = 1.5; k.wb = 0; b.vx = -dx / d * 260; b.vy = -dy / d * 260;
          }
        }
      } else {
        const pen = b.r * 1.05 + p.r * 0.8 - d; p.x += dx / d * pen; p.y += dy / d * pen;
        if (g.hurt(15, b, { why: 'Giant Virus spikes', iframes: 0.8 })) { p.vx = dx / d * 380; p.vy = dy / d * 380; }
      }
    }
  },
  eat(g, b, k, e) {
    if (!e.host) return;
    if (e.infected) g.bossHit(0.085, e.x, e.y, { raw: true, knock: false, text: 'Factory destroyed!', tc: '#9dffcf' });
    if (k.host === e) { k.host = null; if (k.state === 'seek' || k.state === 'dock') { k.state = 'roam'; k.seekT = 1.2; } }
  },
  over(g, ctx, z, inView) {
    const b = g.boss, k = b.k, T = g.T;
    for (const e of g.ents) {
      if (!e.alive || !e.host || !inView(e.x, e.y, e.r * 2)) continue;
      if (e.infected) {
        const pulse = 0.5 + 0.5 * sin(T * (5 + 10 * e.infected));
        glow(ctx, e.x, e.y, e.r * (1.8 + 0.4 * e.infected), [190, 90, 255], 0.35 + 0.35 * e.infected * pulse);
        ctx.beginPath();
        const n = 3 + floor(e.infected * 9);
        for (let i = 0; i < n; i++) { const a = i * 2.4 + e.seed + T * 0.4, rr = e.r * 0.55 * ((i * 0.37) % 1); const x = e.x + cos(a) * rr, y = e.y + sin(a) * rr; ctx.moveTo(x + e.r * 0.09, y); ctx.arc(x, y, e.r * 0.09, 0, TAU); }
        ctx.fillStyle = 'rgba(225,170,255,0.85)'; ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.15, -PI / 2, -PI / 2 + TAU * e.infected);
        ctx.strokeStyle = 'rgba(220,150,255,0.9)'; ctx.lineWidth = 3 / z; ctx.stroke();
      } else if (e.targeted) {
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.35, 0, TAU);
        ctx.strokeStyle = `rgba(210,140,255,${0.35 + 0.3 * sin(T * 10)})`; ctx.lineWidth = 2 / z; ctx.setLineDash([6 / z, 6 / z]); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    if (k.state === 'dock' || k.state === 'stagger') {
      glow(ctx, b.x, b.y, b.r * 1.9, [255, 240, 150], 0.3 + 0.2 * sin(T * 12));
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.12 + 0.05 * sin(T * 10)), 0, TAU);
      ctx.strokeStyle = 'rgba(255,245,200,0.85)'; ctx.lineWidth = 3 / z; ctx.stroke();
    }
  },
  die(g, b, k) { for (const e of g.ents) if (e.host) { e.targeted = false; if (e.infected) { e.alive = false; g.burst(e.x, e.y, [200, 140, 255], 10, 120); } else e.ctl = null; } },
};

// ===================================================================================== Volvox Titan
// A Volvox colony's tough jelly sphere shrugs off bites. It survives by releasing daughter colonies; eat
// the daughters before they grow and roll back to rejoin it.
const TITAN_KIDS = 11;
BOSS_KIT.titan = {
  r: (p) => 100 + p.r * 1.3,
  chip: 0.05, phaseAt: [0.5], phaseText: ['It rolls at you'],
  hint: ['sprout', 'Its shell is too tough to bite. Eat its daughter colonies before they grow back!'],
  spawn(g, b, k) { k.hatchT = 2.4; k.rollT = 5; k.state = 'roll'; k.st = 0; k.clinkT = 0; b.kids = 9; },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    k.clinkT = max(0, k.clinkT - dt);
    // daughters
    const kids = g.ents.filter((e) => e.alive && e.titanKid);
    for (const e of kids) {
      e.mat = min(1, e.mat + dt / (ph2 ? 8.5 : 10));
      e.r = min(p.r * 0.8, e.r0 * (1 + 0.55 * e.mat));
      const ex = e.x - p.x, ey = e.y - p.y, ed = hypot(ex, ey) + 0.01;
      if (e.mat < 1) {
        if (ed < 200 && e.mat > 0.15) { e.ctl.tx = ex / ed; e.ctl.ty = ey / ed; e.ctl.sp = ps * (ph2 ? 0.34 : 0.28); e.ctl.steer = 2; } // colonies are slow swimmers
        else { e.ctl.tx = cos(e.seed + g.T * 0.4); e.ctl.ty = sin(e.seed + g.T * 0.4); e.ctl.sp = ps * 0.12; e.ctl.steer = 1; }
      } else {
        // grown up: it rolls home to rejoin the colony
        const hx = b.x - e.x, hy = b.y - e.y, hd = hypot(hx, hy) + 0.01;
        e.ctl.tx = hx / hd; e.ctl.ty = hy / hd; e.ctl.sp = ps * 0.6; e.ctl.steer = 3;
        if (hd < b.r * 0.9) {
          e.alive = false; b.hp = min(b.maxHp, b.hp + b.maxHp / TITAN_KIDS * 0.7); b.kids = min(9, b.kids + 1);
          g.sparkle(e.x, e.y, [140, 255, 160], 10); g.sfx('gulp', { vol: 0.5 });
          g.texts.push({ x: b.x, y: b.y - b.r, s: 'Daughter rejoined', life: 1.2, c: '#b8ffc4' });
        }
      }
    }
    let tx = dx / d, ty = dy / d, sp = ps * (ph2 ? 0.46 : 0.38), sk = 0.8;
    if (k.state === 'roll') {
      if (ph2) {
        k.rollT -= dt;
        if (k.rollT <= 0 && d < 650) { k.state = 'wind'; k.st = 0.8; k.aim = atan2(dy, dx); g.sfx('tick'); }
      }
    } else if (k.state === 'wind') {
      k.st -= dt; b.tele = 1; sp = 0; if (k.st > 0.25) k.aim = atan2(dy, dx);
      if (k.st <= 0) { k.state = 'charge'; k.st = 1; g.sfx('dash'); }
    } else if (k.state === 'charge') {
      k.st -= dt; tx = cos(k.aim); ty = sin(k.aim); sp = ps * 1.2; sk = 6;
      if (k.st <= 0) { k.state = 'roll'; k.rollT = 4.5 + random() * 1.5; }
    }
    steer(b, tx, ty, sp, sk, dt);
    // releasing daughters
    k.hatchT -= dt;
    if (k.hatchT <= 1.2) { b.tele = 1; k.pore = k.pore ?? random() * TAU; }
    if (k.hatchT <= 0) {
      k.hatchT = ph2 ? 4 : 4.8;
      const n = ph2 ? 4 : 3, a0 = k.pore; k.pore = null;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.55, r0 = p.r * 0.46;
        const e = g.spawn('volvox', b.x + cos(a) * b.r * 0.9, b.y + sin(a) * b.r * 0.9, { force: true, r: r0, props: { isKid: true, titanKid: true, hp: 20, maxHp: 20, kids: 0, mat: 0, r0 } });
        if (e) { e.vx = cos(a) * 280; e.vy = sin(a) * 280; e.ctl = { tx: cos(a), ty: sin(a), sp: ps * 0.3, steer: 1 }; }
      }
      b.kids = max(3, b.kids - 1);
      g.sfx('pop'); g.burst(b.x + cos(a0) * b.r, b.y + sin(a0) * b.r, [150, 255, 170], 18, 200);
      g.hint('boss_titan2', 'Catch the daughters before they roll home!', 'sprout', 3000);
    }
    // the jelly shell: bumping it hurts you and bites bounce off
    if (!g.dead && d < b.r * 0.95 + p.r * 0.85) {
      const pen = b.r * 0.95 + p.r * 0.85 - d; p.x += dx / d * pen; p.y += dy / d * pen;
      if (k.clinkT <= 0) { k.clinkT = 1.6; g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: 'Too tough!', life: 0.9, c: '#cfe3d8' }); g.sfx('hit', { pitch: 2 }); }
      if (g.hurt(k.state === 'charge' ? 24 : 15, b, { why: 'Volvox Titan', iframes: 0.8 })) { p.vx = dx / d * 400; p.vy = dy / d * 400; }
    }
  },
  eat(g, b, k, e) {
    if (!e.titanKid) return;
    g.bossHit(1 / TITAN_KIDS, e.x, e.y, { raw: true, knock: false, text: 'Daughter eaten!', tc: '#b8ffc4', quietFx: true });
  },
  over(g, ctx, z, inView) {
    const b = g.boss, k = b.k, T = g.T;
    for (const e of g.ents) {
      if (!e.alive || !e.titanKid || !inView(e.x, e.y, e.r * 2)) continue;
      // a ring that fills as the daughter grows; it blinks when it is about to go home
      const warn = e.mat > 0.75 ? 0.5 + 0.5 * sin(T * 14) : 1;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 1.3, -PI / 2, -PI / 2 + TAU * e.mat);
      ctx.strokeStyle = e.mat >= 1 ? 'rgba(255,140,120,0.9)' : `rgba(150,255,180,${0.8 * warn})`; ctx.lineWidth = 3 / z; ctx.stroke();
    }
    if (k.pore != null) { const x = b.x + cos(k.pore) * b.r * 0.92, y = b.y + sin(k.pore) * b.r * 0.92; glow(ctx, x, y, b.r * 0.6, [170, 255, 180], 0.5 + 0.3 * sin(T * 16)); }
    if (k.state === 'wind') { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + cos(k.aim) * 420, b.y + sin(k.aim) * 420); ctx.strokeStyle = `rgba(255,110,100,${0.2 + 0.15 * sin(T * 20)})`; ctx.lineWidth = b.r; ctx.lineCap = 'round'; ctx.stroke(); }
  },
  die(g) { for (const e of g.ents) if (e.titanKid) { e.titanKid = false; e.ctl = null; } },
};

// ===================================================================================== Rotifer Tyrant
// A rotifer feeds by spinning its crown into a whirlpool that pulls everything into its grinding jaws.
// When it inhales, keep a spore puff between you and the crown: the puff is sucked in first and the
// Tyrant chokes on the spores, helpless while it coughs.
const addPod = (g, b, k, initial) => {
  const p = g.p, a = random() * TAU, d = initial ? 170 + random() * 330 : 420 + random() * 160;
  const cx = initial ? b.ax : p.x, cy = initial ? b.ay : p.y;
  k.pods.push({ x: cx + cos(a) * d, y: cy + sin(a) * d, vx: 0, vy: 0, r: max(26, p.r * 0.7), seed: random() * 10, ang: random() * TAU, fade: initial ? 1 : 0 });
};
BOSS_KIT.tyrant = {
  r: (p) => 92 + p.r * 1.15,
  chip: 0.1, phaseAt: [0.5], phaseText: ['Its crown spins harder'],
  hint: ['wave', 'When its crown spins, hide behind a spore puff: it will choke on it!'],
  spawn(g, b, k) {
    k.pods = []; k.podQ = []; for (let i = 0; i < 5; i++) addPod(g, b, k, true);
    k.state = 'stalk'; k.vortT = 3.2; k.st = 0;
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    const mx = b.x + cos(b.ang) * b.r * 0.95, my = b.y + sin(b.ang) * b.r * 0.95;
    k.mx = mx; k.my = my;
    let tx = 0, ty = 0, sp = 0, sk = 1.5;
    switch (k.state) {
      case 'stalk': {
        const want = 330, kk = d > want + 50 ? 1 : d < want - 80 ? -0.7 : 0;
        tx = dx / d * kk - dy / d * 0.35; ty = dy / d * kk + dx / d * 0.35; sp = ps * 0.45;
        b.ang = turn(b.ang, atan2(dy, dx), dt * 2);
        k.vortT -= dt;
        if (k.vortT <= 0 && d < 700) { k.state = 'wind'; k.st = ph2 ? 0.85 : 1.15; g.sfx('bubble'); }
        break;
      }
      case 'wind': // telegraph: the crown spins up and the cone of water starts to move
        k.st -= dt; b.tele = 1; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        b.ang = turn(b.ang, atan2(dy, dx), dt * 1.6);
        if (k.st <= 0) { k.state = 'suck'; k.st = ph2 ? 3.2 : 2.6; g.sfx('event', { vol: 0.5 }); }
        break;
      case 'suck': {
        k.st -= dt; b.tele = 1; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        b.ang = turn(b.ang, atan2(dy, dx), dt * (ph2 ? 0.75 : 0.55));
        const L = ph2 ? 600 : 540, half = ph2 ? 0.7 : 0.62;
        const inCone = (x, y) => { const ux = x - mx, uy = y - my, ud = hypot(ux, uy) + 0.01; return ud < L && abs(ad(b.ang, atan2(uy, ux))) < half ? ud : 0; };
        // the player
        const pd = inCone(p.x, p.y);
        if (pd && !g.dead) {
          const f = (430 * (1 - pd / L) + 140) * (1 - 0.2 * (p.muts.osmo | 0));
          p.vx -= (p.x - mx) / pd * f * dt; p.vy -= (p.y - my) / pd * f * dt;
          if (pd < b.r * 0.45 + p.r * 0.6) {
            if (g.hurt(26, b, { why: 'Rotifer Tyrant jaws', iframes: 1.1 })) { const s = b.ang + (random() < 0.5 ? 1.3 : -1.3); p.vx = cos(s) * 520; p.vy = sin(s) * 520; g.shake = min(16, g.shake + 8); }
          }
        }
        // spore puffs are light: they get there first
        for (const q of k.pods) {
          const qd = inCone(q.x, q.y); if (!qd) continue;
          const f = 760 * (1 - qd / L) + 260; q.vx -= (q.x - mx) / qd * f * dt; q.vy -= (q.y - my) / qd * f * dt;
          if (qd < b.r * 0.4 + q.r) {
            q.dead = true; k.state = 'choke'; k.st = 3.3; k.wb = 0;
            g.bossHit(0.14, mx, my, { raw: true, knock: false, text: 'Choking!', tc: '#e8ff9a', c: [220, 240, 120] });
            if (!b.alive) return;
            g.burst(mx, my, [210, 230, 110], 40, 300); g.sfx('pop'); g.sfx('boss', { vol: 0.4 }); g.shake = 16; g.flash = 0.3;
            k.podQ.push(2.8);
            g.hint('boss_tyrant2', 'It’s choking! Bite it now', 'target', 2600);
            break;
          }
        }
        // food motes get hoovered up too
        for (const m of g.motes) { const md = inCone(m.x, m.y); if (md) { m.vx -= (m.x - mx) / md * 500 * dt; m.vy -= (m.y - my) / md * 500 * dt; if (md < b.r * 0.4) m.life = -99; } }
        if (k.state === 'suck' && k.st <= 0) { k.state = 'stalk'; k.vortT = ph2 ? 2.8 : 3.8; }
        break;
      }
      case 'choke':
        k.st -= dt; b.vx *= exp(-dt * 3); b.vy *= exp(-dt * 3);
        b.ang += sin(g.T * 22) * dt * 2.5; b.dent = 0.2 + 0.1 * sin(g.T * 18); b.dentA = 0;
        if (random() < dt * 10) g.part(mx, my, cos(b.ang) * 160 + (random() - 0.5) * 120, sin(b.ang) * 160 + (random() - 0.5) * 120, 0.8, [220, 235, 130], 4 + random() * 4);
        if (k.st <= 0) { k.state = 'stalk'; k.vortT = ph2 ? 2.4 : 3.2; }
        break;
    }
    if (k.state === 'stalk') steer(b, tx, ty, sp, sk, dt);
    // spore puffs: you can shove them around like billiard balls
    for (const q of k.pods) {
      if (q.dead) continue;
      q.fade = min(1, q.fade + dt * 2);
      q.vx *= exp(-dt * 1.3); q.vy *= exp(-dt * 1.3); q.x += q.vx * dt; q.y += q.vy * dt; q.ang += dt * 0.3;
      const ux = q.x - p.x, uy = q.y - p.y, ud = hypot(ux, uy) + 0.01;
      if (!g.dead && ud < p.r + q.r) {
        const nx = ux / ud, ny = uy / ud, pen = p.r + q.r - ud;
        q.x += nx * pen; q.y += ny * pen;
        const push = max(0, p.vx * nx + p.vy * ny) * 1.3 + 50;
        q.vx += nx * push; q.vy += ny * push;
      }
      const bx = q.x - b.x, by = q.y - b.y, bd = hypot(bx, by) + 0.01;
      if (k.state !== 'suck' && bd < b.r + q.r) { const pen = b.r + q.r - bd; q.x += bx / bd * pen; q.y += by / bd * pen; }
      const ax = q.x - b.ax, ay = q.y - b.ay, aa = hypot(ax, ay) + 0.01; // drift back to the arena
      if (aa > 800) { q.vx -= ax / aa * 60 * dt; q.vy -= ay / aa * 60 * dt; }
    }
    k.pods = k.pods.filter((q) => !q.dead);
    for (let i = k.podQ.length - 1; i >= 0; i--) { k.podQ[i] -= dt; if (k.podQ[i] <= 0) { k.podQ.splice(i, 1); addPod(g, b, k, false); } }
    // contact
    if (!g.dead && d < b.r * 0.9 + p.r * 0.8) {
      if (k.state === 'choke') {
        if (winBite(b, k, 3)) g.bossHit(0.045, (p.x + b.x) / 2, (p.y + b.y) / 2);
      } else {
        const pen = b.r * 0.9 + p.r * 0.8 - d; p.x += dx / d * pen; p.y += dy / d * pen;
        if (k.state !== 'suck' && g.hurt(14, b, { why: 'Rotifer Tyrant', iframes: 0.8 })) { p.vx = dx / d * 380; p.vy = dy / d * 380; }
      }
    }
  },
  under(g, ctx, z, inView, sc) {
    const b = g.boss, k = b.k, T = g.T;
    // the cone of water it is about to inhale
    if ((k.state === 'wind' || k.state === 'suck') && k.mx !== undefined) {
      const L = b.phase >= 2 ? 600 : 540, half = b.phase >= 2 ? 0.7 : 0.62, on = k.state === 'suck';
      ctx.beginPath(); ctx.moveTo(k.mx, k.my); ctx.arc(k.mx, k.my, L, b.ang - half, b.ang + half); ctx.closePath();
      ctx.fillStyle = on ? 'rgba(160,220,255,0.08)' : `rgba(255,200,140,${0.05 + 0.05 * sin(T * 16)})`; ctx.fill();
      ctx.strokeStyle = on ? 'rgba(180,230,255,0.3)' : `rgba(255,190,120,${0.3 + 0.2 * sin(T * 16)})`; ctx.lineWidth = 2 / z; ctx.setLineDash([12 / z, 10 / z]); ctx.stroke(); ctx.setLineDash([]);
      if (on) { // streaks of water rushing in
        ctx.beginPath();
        for (let i = 0; i < 16; i++) {
          const a = b.ang + (((i * 0.618) % 1) - 0.5) * 2 * half, u = 1 - ((T * 0.9 + i * 0.37) % 1), r0 = L * u, r1 = r0 - 60;
          if (r1 < 20) continue;
          ctx.moveTo(k.mx + cos(a) * r0, k.my + sin(a) * r0); ctx.lineTo(k.mx + cos(a) * r1, k.my + sin(a) * r1);
        }
        ctx.strokeStyle = 'rgba(210,240,255,0.45)'; ctx.lineWidth = 2.5 / z; ctx.lineCap = 'round'; ctx.stroke();
      }
    }
    for (const q of k.pods) {
      if (!inView(q.x, q.y, q.r * 2)) continue;
      glow(ctx, q.x, q.y, q.r * 2.2, [220, 235, 120], 0.25 * q.fade);
      drawFake(ctx, { kind: 'mine', x: q.x, y: q.y, r: q.r, seed: q.seed, ang: q.ang, t: 0 }, T, sc, q.fade);
    }
  },
};

// ===================================================================================== Beroe
// Beroe has no tentacles: it hunts other comb jellies by swallowing them whole with its huge mouth.
// Never be in front of it. When a lunge misses, it is slow to turn: get to its side and bite the comb
// rows it swims with. Every row lost makes it slower.
const ROWS = 8;
BOSS_KIT.beroe = {
  r: (p) => 82 + p.r * 1.0,
  chip: 0.1, phaseAt: [0.5], phaseText: ['It lunges twice now'],
  hint: ['swords', 'Stay out of its mouth! Dodge a lunge, then bite its comb rows from the side'],
  spawn(g, b, k) { b.rows = new Array(ROWS).fill(1); b.mouthK = 0; k.state = 'track'; k.lungeT = 2.6; k.st = 0; k.second = false; },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    const alive = b.rows.filter((r) => r > 0).length, agile = 0.5 + 0.5 * alive / ROWS;
    let tx = 0, ty = 0, sp = 0, sk = 1.8;
    switch (k.state) {
      case 'track': {
        b.ang = turn(b.ang, atan2(dy, dx), dt * (ph2 ? 2.8 : 2.3) * agile);
        const want = 270, kk = d > want + 40 ? 1 : d < want - 60 ? -0.6 : 0.15;
        tx = cos(b.ang) * kk; ty = sin(b.ang) * kk; sp = ps * 0.55 * agile;
        b.mouthK = max(0, b.mouthK - dt * 2);
        k.lungeT -= dt;
        if (k.lungeT <= 0 && d < 560 && !g.dead) { k.state = 'gape'; k.st = ph2 ? 0.62 : 0.75; g.sfx('gulp', { vol: 0.5 }); }
        break;
      }
      case 'gape': // telegraph: the mouth opens wide
        k.st -= dt; b.mouthK = min(1, b.mouthK + dt * 2.5); b.tele = 1;
        if (k.st > 0.2) b.ang = turn(b.ang, atan2(dy, dx), dt * 3.5);
        b.vx *= exp(-dt * 3); b.vy *= exp(-dt * 3);
        if (k.st <= 0) { k.state = 'lunge'; k.st = 0.55; k.hit = false; const s = ps * 2.3 * (0.8 + 0.2 * agile); b.vx = cos(b.ang) * s; b.vy = sin(b.ang) * s; g.sfx('dash'); }
        break;
      case 'lunge':
        k.st -= dt; b.mouthK = 1; tx = cos(b.ang); ty = sin(b.ang); sp = ps * 2.3 * (0.8 + 0.2 * agile); sk = 8;
        if (k.st <= 0) {
          if (k.hit) { k.state = 'track'; k.lungeT = ph2 ? 1.8 : 2.4; }
          else if (ph2 && !k.second) { k.second = true; k.state = 'gape'; k.st = 0.42; }
          else { k.second = false; k.state = 'stall'; k.st = ph2 ? 1.7 : 2.0; k.wb = 0; g.texts.push({ x: b.x, y: b.y - b.r, s: 'Missed!', life: 1, c: '#9dffcf' }); g.hint('boss_beroe2', 'It missed! Bite its side now', 'target', 2500); }
        }
        break;
      case 'stall': // slow to recover from a missed lunge: its flanks are open
        k.st -= dt; b.mouthK = max(0, b.mouthK - dt * 1.2); b.vx *= exp(-dt * 2.5); b.vy *= exp(-dt * 2.5);
        b.ang = turn(b.ang, atan2(dy, dx), dt * 0.45);
        if (k.st <= 0) { k.state = 'track'; k.lungeT = ph2 ? 1.6 : 2.2; }
        break;
    }
    if (k.state === 'track' || k.state === 'lunge') steer(b, tx, ty, sp, sk, dt);
    if (g.dead) return;
    // where are you relative to it?
    const rel = ad(b.ang, atan2(dy, dx));
    const mouthZone = abs(rel) < 0.8 && d < b.r * 1.3 + p.r;
    if (mouthZone && (k.state === 'lunge' || b.mouthK > 0.3 || d < b.r * 1.05 + p.r * 0.6)) {
      if (g.hurt(k.state === 'lunge' ? 32 : 22, b, { why: 'Swallowed by Beroe', iframes: 1.0 })) {
        k.hit = true; p.vx = dx / d * 520; p.vy = dy / d * 520; b.mouthK = 1;
        g.sfx('gulp'); g.shake = min(16, g.shake + 8);
      }
      return;
    }
    // its soft flanks: comb rows run along both sides
    if (d < b.r * 1.0 + p.r * 0.75) {
      const pen = b.r + p.r * 0.75 - d; p.x += dx / d * pen * 0.7; p.y += dy / d * pen * 0.7;
      if (abs(rel) > 0.9 && (k.state === 'stall' ? winBite(b, k, 2) : b.biteCd <= 0 && (b.biteCd = 0.6))) {
        const side = rel > 0 ? 1 : -1; // +: its left side (rows 4–7), -: right (rows 0–3)
        const order = side > 0 ? [7, 6, 5, 4] : [0, 1, 2, 3];
        let i = order.find((j) => b.rows[j] > 0);
        if (i === undefined) i = b.rows.findIndex((r) => r > 0);
        if (i < 0) return;
        const amt = min(b.rows[i], 1.0 * g.biteK());
        b.rows[i] = max(0, b.rows[i] - amt);
        g.bossHit(amt / ROWS, (p.x + b.x) / 2, (p.y + b.y) / 2, { raw: true, text: b.rows[i] <= 0 ? 'Comb row torn!' : null, tc: '#c9b8ff', c: [200, 190, 255] });
        if (!b.alive) return;
        if (b.rows[i] <= 0) g.burst(b.x, b.y, [255, 200, 255], 20, 200);
        if (k.state === 'track' && random() < 0.5) { k.state = 'gape'; k.st = 0.6; } // it spins to bite back
      }
    }
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k, T = g.T;
    if (k.state === 'gape') {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + cos(b.ang) * 520, b.y + sin(b.ang) * 520);
      ctx.strokeStyle = `rgba(255,100,130,${0.16 + 0.14 * sin(T * 20)})`; ctx.lineWidth = b.r * 1.5; ctx.lineCap = 'round'; ctx.stroke();
    }
    if (k.state === 'stall') { // the flanks shimmer: they are open
      for (const s of [1, -1]) {
        const a = b.ang + s * PI / 2;
        glow(ctx, b.x + cos(a) * b.r * 0.85, b.y + sin(a) * b.r * 0.85, b.r * 0.7, [190, 170, 255], 0.35 + 0.2 * sin(T * 12));
      }
    }
  },
};

// ===================================================================================== Pompeii Worm
// The Pompeii worm lives in mineral chimneys on boiling vents. It peeks out to feed and snaps at anything in
// front of its tube. Come at a tube from the side, bite its head while it's out, and keep clear of the
// vents when they erupt.
BOSS_KIT.pompeii = {
  r: (p) => 34 + p.r * 0.55,
  chip: 0.1, phaseAt: [0.5], phaseText: ['The vents are boiling over'], fixed: true,
  hint: ['thermo', 'It hides in the chimneys. Approach from the side and bite its head when it peeks out!'],
  spawn(g, b, k) {
    k.tubes = []; const a0 = random() * TAU;
    for (let i = 0; i < 5; i++) {
      const a = a0 + (i / 5) * TAU + (random() - 0.5) * 0.4, dd = 220 + random() * 170;
      const x = b.ax + cos(a) * dd, y = b.ay + sin(a) * dd;
      k.tubes.push({ x, y, ang: atan2(y - b.ay, x - b.ax) + (random() - 0.5) * 1.6, erupt: 4 + random() * 5, tele: 0, on: 0, camp: 0 });
    }
    k.cur = 0; k.state = 'hidden'; k.st = 1.6; b.emergeK = 0.12; k.travel = null;
    const T0 = k.tubes[0]; b.x = T0.x; b.y = T0.y; b.ang = T0.ang; b.vx = b.vy = 0;
  },
  tick(g, b, k, dt) {
    const p = g.p, ph2 = b.phase >= 2, tube = k.tubes[k.cur];
    b.vx = 0; b.vy = 0;
    // eruptions
    for (const t of k.tubes) {
      t.erupt -= dt;
      if (t.on > 0) {
        t.on -= dt;
        const R = ph2 ? 150 : 125;
        if (!g.dead && hypot(p.x - t.x, p.y - t.y) < R + p.r * 0.5) { g.hurt(30 * dt, null, { dot: true, env: true, why: 'Vent eruption' }); if (random() < dt * 8) p.flashT = 0.1; }
        if (random() < dt * 30) { const a = random() * TAU, rr = random() * R; g.part(t.x + cos(a) * rr, t.y + sin(a) * rr, (random() - 0.5) * 60, -60 - random() * 90, 0.8, [255, 140 + random() * 60, 70], 4 + random() * 6); }
        if (t.on <= 0) t.erupt = ph2 ? 3.5 + random() * 2.5 : 5.5 + random() * 3.5;
      } else if (t.erupt <= 0) { t.on = 1.6; g.sfx('toxin', { vol: 0.5 }); g.shake = min(8, g.shake + 3); }
      t.tele = t.on <= 0 && t.erupt < 1.1 ? 1 : 0;
    }
    const pdx = p.x - tube.x, pdy = p.y - tube.y, pd = hypot(pdx, pdy) + 0.01;
    const inFront = abs(ad(tube.ang, atan2(pdy, pdx))) < 1.0;
    const head = () => ({ x: tube.x + cos(tube.ang) * b.r * (0.9 + 0.35 * b.emergeK), y: tube.y + sin(tube.ang) * b.r * (0.9 + 0.35 * b.emergeK) });
    // camping next to its chimney makes it vent the chimney at you
    if (k.state === 'hidden' && pd < 170) { tube.camp += dt; if (tube.camp > 1.8 && tube.on <= 0) { tube.erupt = 0.9; tube.camp = 0; } } else tube.camp = max(0, tube.camp - dt);
    const vulnerable = k.state === 'peek' || k.state === 'over';
    switch (k.state) {
      case 'hidden':
        b.emergeK += (0.12 - b.emergeK) * min(1, dt * 6); k.st -= dt;
        if (k.st <= 0 && pd > 220) { k.state = 'peek'; k.st = ph2 ? 2.8 : 3.4; k.react = null; }
        break;
      case 'peek':
        b.emergeK += (0.6 - b.emergeK) * min(1, dt * 5); k.st -= dt;
        if (pd < 190 && k.react === null) k.react = inFront ? 'lunge' : random() < (ph2 ? 0.35 : 0.2) ? 'retract' : 'stay';
        if (k.react === 'lunge') { k.state = 'cock'; k.st = 0.28; g.sfx('tick'); }
        else if (k.react === 'retract' || k.st <= 0) { k.state = 'retract'; }
        break;
      case 'cock': k.st -= dt; b.emergeK = max(0.45, b.emergeK - dt); b.tele = 1; if (k.st <= 0) { k.state = 'lunge'; k.st = 0.2; g.sfx('dash', { vol: 0.5 }); } break;
      case 'lunge': {
        k.st -= dt; b.emergeK = min(1, b.emergeK + dt * 6);
        const h = head();
        if (!k.bit && !g.dead && hypot(p.x - h.x, p.y - h.y) < p.r + b.r * 0.9) { k.bit = true; if (g.hurt(22, b, { why: 'Pompeii Worm', iframes: 0.9 })) { p.vx = cos(tube.ang) * 480; p.vy = sin(tube.ang) * 480; } }
        if (k.st <= 0) { k.state = 'over'; k.st = 1.15; k.bit = false; }
        break;
      }
      case 'over': k.st -= dt; b.emergeK = 1; if (k.st <= 0) k.state = 'retract'; break; // stretched out and slow to pull back
      case 'retract':
        b.emergeK = max(0, b.emergeK - dt * 4);
        if (b.emergeK <= 0) {
          // swim through the vent plumbing to another chimney (bubbles give it away)
          const opts = k.tubes.map((t, i) => i).filter((i) => i !== k.cur);
          opts.sort((a, c) => hypot(k.tubes[c].x - p.x, k.tubes[c].y - p.y) - hypot(k.tubes[a].x - p.x, k.tubes[a].y - p.y));
          const to = opts[floor(random() * min(2, opts.length))];
          k.travel = { from: k.cur, to, t: 0, dur: ph2 ? 1.1 : 1.5 }; k.state = 'travel'; b.noDraw = true;
        }
        break;
      case 'travel': {
        const tr = k.travel; tr.t += dt; const A = k.tubes[tr.from], B = k.tubes[tr.to], u = min(1, tr.t / tr.dur);
        if (random() < dt * 22) g.part(A.x + (B.x - A.x) * u + (random() - 0.5) * 20, A.y + (B.y - A.y) * u + (random() - 0.5) * 20, (random() - 0.5) * 30, -50, 0.7, [220, 240, 255], 3 + random() * 3);
        if (u >= 1) { k.cur = tr.to; const T1 = k.tubes[k.cur]; b.x = T1.x; b.y = T1.y; b.ang = T1.ang; b.noDraw = false; k.state = 'hidden'; k.st = 0.7 + random() * 0.8; b.emergeK = 0; }
        break;
      }
    }
    if (g.dead || k.state === 'travel') return;
    // bite its head
    const h = head();
    if (vulnerable && b.biteCd <= 0 && hypot(p.x - h.x, p.y - h.y) < p.r + b.r * 0.8) {
      b.biteCd = 0.5;
      g.bossHit(k.state === 'over' ? 0.16 : 0.13, h.x, h.y, { text: 'Got it!', tc: '#ffd0a0' });
      if (!b.alive) return;
      k.state = 'retract';
      g.hint('boss_pompeii2', 'Watch the bubbles: they show which chimney it moves to', 'eye', 3000);
    }
    // the chimneys are solid rock
    for (const t of k.tubes) {
      const ux = p.x - t.x, uy = p.y - t.y, ud = hypot(ux, uy) + 0.01, R = b.r * 0.85 + p.r * 0.8;
      if (ud < R) { p.x += ux / ud * (R - ud); p.y += uy / ud * (R - ud); }
    }
  },
  under(g, ctx, z, inView, sc) {
    const b = g.boss, k = b.k, T = g.T, R = b.phase >= 2 ? 150 : 125;
    for (const t of k.tubes) {
      if (!inView(t.x, t.y, R * 1.6)) continue;
      // the vent glow: shimmering before it erupts, blazing while it does
      if (t.on > 0) { glow(ctx, t.x, t.y, R * 1.6, [255, 120, 60], 0.65 + 0.15 * sin(T * 30)); glow(ctx, t.x, t.y, R * 0.8, [255, 220, 150], 0.5); }
      else if (t.tele) { glow(ctx, t.x, t.y, R * 1.3, [255, 140, 70], 0.25 + 0.2 * sin(T * 24)); ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, TAU); ctx.strokeStyle = `rgba(255,150,90,${0.4 + 0.3 * sin(T * 24)})`; ctx.lineWidth = 2.5 / z; ctx.setLineDash([8 / z, 8 / z]); ctx.stroke(); ctx.setLineDash([]); }
      else glow(ctx, t.x, t.y, R * 0.9, [255, 120, 60], 0.15);
      const art = CREATURE_ART.pompeii;
      if (!drawPart(ctx, art && art.drawTube, t.x, t.y, t.ang, b.r, sc, T, art && art.col)) {
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
        ctx.beginPath(); ctx.ellipse(-b.r * 0.8, 0, b.r * 1.6, b.r * 0.6, 0, 0, TAU); ctx.fillStyle = '#5a4438'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(b.r * 0.6, 0, b.r * 0.25, b.r * 0.5, 0, 0, TAU); ctx.fillStyle = '#1b120e'; ctx.fill();
        ctx.restore();
      }
    }
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k, T = g.T;
    if (k.state === 'peek' || k.state === 'over') { const t = k.tubes[k.cur], hx = t.x + cos(t.ang) * b.r * (0.9 + 0.35 * b.emergeK), hy = t.y + sin(t.ang) * b.r * (0.9 + 0.35 * b.emergeK); glow(ctx, hx, hy, b.r * 1.4, [255, 230, 160], 0.25 + 0.15 * sin(T * 10)); }
    if (k.state === 'cock') { const t = k.tubes[k.cur]; ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + cos(t.ang) * b.r * 3, t.y + sin(t.ang) * b.r * 3); ctx.strokeStyle = 'rgba(255,90,90,0.35)'; ctx.lineWidth = b.r * 1.6; ctx.lineCap = 'round'; ctx.stroke(); }
  },
};

// ===================================================================================== Giant Cuttlefish
// Cuttlefish change colour in an instant. This one hides in plain sight, shows itself only to strike with
// its two feeding tentacles, and when hurt it squirts ink "pseudomorphs": cuttlefish-shaped decoys.
// Ignore the decoys and find the real one by its eyes.
BOSS_KIT.cuttlefish = {
  r: (p) => 60 + p.r * 0.8,
  chip: 0.1, phaseAt: [0.5], phaseText: ['More decoys, faster strikes'],
  hint: ['eye', 'It hides in plain sight. Dodge its tentacle strike, then bite it. Ink decoys have no eyes!'],
  spawn(g, b, k) { b.camo = 0.5; k.state = 'stalk'; k.strikeT = 3; k.st = 0; k.decoys = []; k.blind = 0; k.grab = 0; b.strikeK = 0; },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    k.blind = max(0, k.blind - dt);
    let tx = 0, ty = 0, sp = 0, sk = 1.6, camo = 0.85;
    switch (k.state) {
      case 'stalk': {
        const want = 290, kk = d > want + 40 ? 1 : d < want - 70 ? -0.8 : 0;
        tx = dx / d * kk + -dy / d * 0.5; ty = dy / d * kk + dx / d * 0.5; sp = ps * 0.55;
        b.ang = turn(b.ang, atan2(dy, dx), dt * 2.5);
        k.strikeT -= dt;
        if (k.strikeT <= 0 && d < 430 && !g.dead) { k.state = 'show'; k.st = ph2 ? 0.65 : 0.8; g.sfx('tick'); }
        break;
      }
      case 'show': // it flashes its colours: the strike is coming
        k.st -= dt; camo = 0; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        if (k.st > 0.2) b.ang = turn(b.ang, atan2(dy, dx), dt * 4);
        if (k.st <= 0) { k.state = 'strike'; k.st = 0.62; k.hit = false; g.sfx('dash', { vol: 0.5 }); }
        break;
      case 'strike': {
        k.st -= dt; camo = 0; const u = 0.62 - k.st;
        b.strikeK = u < 0.12 ? u / 0.12 : u < 0.34 ? 1 : max(0, 1 - (u - 0.34) / 0.28);
        const reach = b.r * (0.8 + 2.3 * b.strikeK);
        const x0 = b.x + cos(b.ang) * b.r * 0.8, y0 = b.y + sin(b.ang) * b.r * 0.8, x1 = b.x + cos(b.ang) * reach, y1 = b.y + sin(b.ang) * reach;
        if (!k.hit && !g.dead && b.strikeK > 0.5 && segDist(p.x, p.y, x0, y0, x1, y1) < p.r + 14) {
          k.hit = true;
          if (g.hurt(18, b, { why: 'Cuttlefish tentacles', iframes: 0.6 })) { k.grab = ph2 ? 1.1 : 0.9; g.hint('boss_cuttle3', 'Grabbed! Wiggle or dash free', 'hand', 2000); }
        }
        if (k.st <= 0) { k.state = 'open'; k.st = ph2 ? 1.2 : 1.5; b.strikeK = 0; }
        break;
      }
      case 'open': k.st -= dt; camo = 0; b.vx *= exp(-dt * 2); b.vy *= exp(-dt * 2); b.ang = turn(b.ang, atan2(dy, dx), dt * 1.2); if (k.st <= 0) { k.state = 'stalk'; k.strikeT = ph2 ? 1.8 : 2.4; } break;
      case 'jet': // it squirts away behind its ink
        k.st -= dt; camo = 1; tx = cos(k.ja); ty = sin(k.ja); sp = ps * (k.st > 0.6 ? 1.8 : 0.4); sk = 5;
        if (k.st <= 0) { k.state = 'stalk'; k.strikeT = ph2 ? 1.6 : 2.4; }
        break;
    }
    if (k.state === 'stalk' || k.state === 'jet') steer(b, tx, ty, sp, sk, dt);
    b.camo += (camo - b.camo) * min(1, dt * 6);
    // grabbed by the tentacles: pulled to the beak until you wiggle or dash free
    if (k.grab > 0) {
      k.grab -= dt;
      if (p.dashT > 0 || p.wiggle > 4 || g.dead) { k.grab = 0; if (p.wiggle > 4) p.wiggle -= 3; }
      else {
        const bx = b.x + cos(b.ang) * b.r * 1.1 - p.x, by = b.y + sin(b.ang) * b.r * 1.1 - p.y, bd = hypot(bx, by) + 0.01;
        p.vx += bx / bd * 900 * dt; p.vy += by / bd * 900 * dt; b.strikeK = max(b.strikeK, 0.4);
        g.hurt(22 * dt, null, { dot: true, why: 'Cuttlefish beak' });
      }
    }
    // decoys drift and fade; touching one blinds you with ink
    for (const q of k.decoys) {
      q.life -= dt; q.vx *= exp(-dt * 0.9); q.vy *= exp(-dt * 0.9);
      if (ph2) { q.vx += cos(q.seed + g.T * 0.7) * 30 * dt; q.vy += sin(q.seed + g.T * 0.7) * 30 * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.ang = turn(q.ang, atan2(q.vy, q.vx), dt * 1.5);
      if (!q.popped && !g.dead && hypot(p.x - q.x, p.y - q.y) < p.r + q.r * 0.8) {
        q.popped = true; q.life = min(q.life, 0.4);
        (g.inks = g.inks || []).push({ x: q.x, y: q.y, r: q.r * 1.4, grow: q.r * 3.2, life: 3, max: 3, seed: random() * 10 });
        k.blind = 2.2; g.sfx('bubble'); g.buzz(20);
        g.texts.push({ x: q.x, y: q.y - q.r, s: 'Just ink!', life: 1, c: '#c0b8d8' });
      }
    }
    k.decoys = k.decoys.filter((q) => q.life > 0);
    if (g.dead) return;
    // biting the real one
    if (d < b.r * 0.95 + p.r * 0.8 && k.state !== 'jet') {
      if (b.biteCd <= 0) {
        b.biteCd = 0.5;
        const hidden = b.camo > 0.6;
        g.bossHit(hidden ? 0.13 : 0.1, (p.x + b.x) / 2, (p.y + b.y) / 2, { text: hidden ? 'Found you!' : null, tc: '#ffe7a8' });
        if (!b.alive) return;
        // ink and run
        const n = (ph2 ? 3 : 2) + (b.hp < b.maxHp * 0.25 ? 1 : 0);
        (g.inks = g.inks || []).push({ x: b.x, y: b.y, r: b.r * 1.5, grow: b.r * 3.4, life: 3.5, max: 3.5, seed: random() * 10 });
        const away = atan2(-dy, -dx);
        for (let i = 0; i < n; i++) { const a = away + (i - (n - 1) / 2) * 1.3 + (random() - 0.5) * 0.4, s = 90 + random() * 90; k.decoys.push({ x: b.x, y: b.y, vx: cos(a) * s, vy: sin(a) * s, ang: a, r: b.r, life: 7.5, seed: random() * 10, popped: false }); }
        k.state = 'jet'; k.st = 1.6; k.ja = away + (random() < 0.5 ? 1 : -1) * (0.5 + random() * 1.2); k.grab = 0;
        g.sfx('bubble'); g.hint('boss_cuttle2', 'Ink decoys! The real one has glinting eyes', 'eye', 3000);
      }
    }
  },
  under(g, ctx, z, inView, sc) {
    const k = g.boss.k, T = g.T;
    for (const q of k.decoys) {
      if (!inView(q.x, q.y, q.r * 3)) continue;
      drawFake(ctx, { kind: 'cuttlefish', decoy: true, x: q.x, y: q.y, r: q.r, ang: q.ang, seed: q.seed, t: 0, camo: 0 }, T, sc, min(1, q.life / 1.5) * (q.popped ? 0.4 : 1));
    }
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k, T = g.T;
    if (k.state === 'show') { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + cos(b.ang) * b.r * 3.1, b.y + sin(b.ang) * b.r * 3.1); ctx.strokeStyle = `rgba(255,110,120,${0.2 + 0.15 * sin(T * 22)})`; ctx.lineWidth = 34; ctx.lineCap = 'round'; ctx.stroke(); }
    // the real one gives itself away: its eyes catch the light
    if (b.camo > 0.5) for (const s of [1, -1]) { const a = b.ang + s * 0.55; glow(ctx, b.x + cos(a) * b.r * 0.55, b.y + sin(a) * b.r * 0.55, b.r * 0.22, [255, 250, 200], 0.35 + 0.25 * sin(T * 3)); }
  },
  // a photophore flash shows it up for a moment, wherever it is hiding
  flash(g, b, k) { if (k.state === 'stalk' || k.state === 'jet') { k.state = 'open'; k.st = 1.4; b.camo = 0; g.texts.push({ x: b.x, y: b.y - b.r, s: 'Revealed!', life: 1, c: '#bfe6ff' }); } },
  screen(g, ctx, W, H) {
    const k = g.boss.k; if (!(k.blind > 0)) return;
    ctx.globalAlpha = min(1, k.blind) * 0.62; ctx.fillStyle = '#08061a'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  },
};

// ===================================================================================== Peacock Mantis Shrimp
// The fastest punch in the animal kingdom: its clubs strike so hard the water boils into a collapsing
// cavitation bubble. Its armour stops bites, but after every punch it needs a moment to re-cock the spring
// in its clubs. Get close, make it punch at nothing, then bite.
BOSS_KIT.mantis = {
  r: (p) => 56 + p.r * 0.75,
  chip: 0.05, phaseAt: [0.5], phaseText: ['One-two punches!'],
  hint: ['bolt', 'Armour stops bites. Make its punch miss, then bite while it reloads!'],
  spawn(g, b, k) { k.state = 'stalk'; k.st = 0; k.hopT = 2; k.punch = 0; k.cav = []; k.clinkT = 0; b.cockK = 0; b.strikeK = 0; },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    const reach = b.r * 2.3;
    k.clinkT = max(0, k.clinkT - dt);
    let tx = 0, ty = 0, sp = 0, sk = 2.5;
    switch (k.state) {
      case 'stalk': {
        b.ang = turn(b.ang, atan2(dy, dx), dt * 3.2);
        b.cockK = max(0, b.cockK - dt * 2); b.strikeK = max(0, b.strikeK - dt * 3);
        tx = dx / d; ty = dy / d; sp = ps * (d > reach * 0.85 ? 0.62 : 0.1);
        k.hopT -= dt;
        if (k.hopT <= 0) { k.hopT = (ph2 ? 1.0 : 1.3) + random() * 1.2; const s = random() < 0.5 ? 1 : -1; b.vx += -dy / d * s * ps * 1.7; b.vy += dx / d * s * ps * 1.7; }
        if (d < reach + p.r * 0.6 && abs(ad(b.ang, atan2(dy, dx))) < 0.6 && !g.dead) { k.state = 'cock'; k.st = ph2 && k.punch ? 0.3 : ph2 ? 0.4 : 0.5; g.sfx('tick'); }
        break;
      }
      case 'cock': // clubs drawn back: punch incoming
        k.st -= dt; b.cockK = min(1, b.cockK + dt * 4); b.tele = 1; b.vx *= exp(-dt * 6); b.vy *= exp(-dt * 6);
        if (k.st > 0.12) b.ang = turn(b.ang, atan2(dy, dx), dt * 3.5);
        if (k.st <= 0) {
          b.cockK = 0; b.strikeK = 1; k.punch++;
          const hx = b.x + cos(b.ang) * b.r * 1.9, hy = b.y + sin(b.ang) * b.r * 1.9;
          k.cav.push({ x: hx, y: hy, t: 0.2, r: 70 });
          g.sfx('hit'); g.sfx('boss', { vol: 0.3 }); g.shake = min(16, g.shake + 8); g.flash = 0.2;
          g.burst(hx, hy, [220, 240, 255], 14, 260);
          const rel = abs(ad(b.ang, atan2(dy, dx)));
          if (!g.dead && d < reach + p.r * 0.5 && rel < 0.6) {
            if (g.hurt(34, b, { why: 'Mantis shrimp punch', iframes: 0.5 })) { p.vx = cos(b.ang) * 650; p.vy = sin(b.ang) * 650; }
          }
          if (ph2 && k.punch < 2) { k.state = 'cock'; k.st = 0.3; } // the one-two
          else { k.state = 'reload'; k.st = ph2 ? 1.2 : 1.45; k.punch = 0; k.wb = 0; g.hint('boss_mantis2', 'It’s reloading! Bite it now', 'target', 2400); }
        }
        break;
      case 'reload': // re-cocking the spring in its clubs: open to bites
        k.st -= dt; b.strikeK = max(0, b.strikeK - dt * 1.5); b.vx *= exp(-dt * 3); b.vy *= exp(-dt * 3);
        b.ang = turn(b.ang, atan2(dy, dx), dt * 0.8);
        if (k.st <= 0) { k.state = 'backoff'; k.st = ph2 ? 0.9 : 1.3; }
        break;
      case 'backoff': // it scuttles back to the edge of its reach, clubs ready
        k.st -= dt; b.ang = turn(b.ang, atan2(dy, dx), dt * 3.2); tx = -dx / d; ty = -dy / d; sp = ps * 0.75; sk = 4;
        if (k.st <= 0) { k.state = 'stalk'; k.hopT = 0.5; }
        break;
    }
    if (k.state === 'stalk' || k.state === 'backoff') steer(b, tx, ty, sp, sk, dt);
    // cavitation bubbles collapse a moment after each punch
    for (const c of k.cav) {
      c.t -= dt;
      if (c.t <= 0 && !c.done) {
        c.done = true; c.life = 0.35;
        g.burst(c.x, c.y, [200, 230, 255], 18, 220); g.sfx('pop', { pitch: 2 });
        if (!g.dead && hypot(p.x - c.x, p.y - c.y) < c.r + p.r * 0.6) g.hurt(12, { x: c.x, y: c.y }, { why: 'Cavitation bubble', iframes: 0.4 });
      }
      if (c.done) c.life -= dt;
    }
    k.cav = k.cav.filter((c) => !c.done || c.life > 0);
    if (g.dead) return;
    if (d < b.r * 0.95 + p.r * 0.8) {
      if (k.state === 'reload') {
        if (winBite(b, k, 2, 0.55)) g.bossHit(0.065, (p.x + b.x) / 2, (p.y + b.y) / 2);
      } else {
        const pen = b.r * 0.95 + p.r * 0.8 - d; p.x += dx / d * pen; p.y += dy / d * pen;
        if (k.clinkT <= 0) { k.clinkT = 1.4; g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: 'Armoured!', life: 0.9, c: '#cfd8e8' }); g.sfx('hit', { pitch: 2 }); }
        if (g.hurt(10, b, { why: 'Mantis shrimp', iframes: 0.6 })) { p.vx = dx / d * 360; p.vy = dy / d * 360; }
      }
    }
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k, T = g.T;
    if (k.state === 'cock') {
      const reach = b.r * 2.3;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, reach, b.ang - 0.6, b.ang + 0.6); ctx.closePath();
      ctx.fillStyle = `rgba(255,90,90,${0.12 + 0.1 * sin(T * 26)})`; ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,120,0.6)'; ctx.lineWidth = 2 / z; ctx.stroke();
    }
    if (k.state === 'reload') glow(ctx, b.x - cos(b.ang) * b.r * 0.6, b.y - sin(b.ang) * b.r * 0.6, b.r * 1.1, [150, 255, 200], 0.3 + 0.15 * sin(T * 10));
    for (const c of k.cav) {
      if (!c.done) { ctx.beginPath(); ctx.arc(c.x, c.y, c.r * (0.4 + 0.6 * (1 - c.t / 0.2)), 0, TAU); ctx.strokeStyle = 'rgba(230,245,255,0.8)'; ctx.lineWidth = 3 / z; ctx.stroke(); }
      else glow(ctx, c.x, c.y, c.r * 1.6, [210, 235, 255], c.life / 0.35 * 0.8);
    }
  },
};

// ===================================================================================== Abyssal Anglerfish
// In the dark she shows only her lure, and anything that comes to the light gets swallowed. Deep-sea eyes are
// made for faint light, though: eat a seed shrimp right in front of her face and its flash of blue light
// blinds her. Then bite.
const spawnBait = (g, b, initial) => {
  const p = g.p, a = random() * TAU, d = initial ? 200 + random() * 300 : g.viewR() * 0.9;
  const e = g.spawn('ostracod', (initial ? b.ax : p.x) + cos(a) * d, (initial ? b.ay : p.y) + sin(a) * d, { force: true, r: p.r * 0.5 });
  if (e) { e.bait = true; e.ctl = { tx: 0, ty: 0, sp: 0, steer: 2 }; }
};
BOSS_KIT.abyssal = {
  r: (p) => 78 + p.r * 0.95,
  chip: 0.08, phaseAt: [0.5], phaseText: ['She hunts you in the dark'],
  hint: ['eye', 'Her lure is a trap. Eat a glowing seed shrimp near her face to blind her!'],
  spawn(g, b, k) { k.state = 'lurk'; k.st = 0; k.acd = 1; k.baitT = 0; k.rushT = 6; b.lureK = 1; b.mouthK = 0; for (let i = 0; i < 6; i++) spawnBait(g, b, true); },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    const lp = CREATURE_ART.angler && CREATURE_ART.angler.lurePos ? CREATURE_ART.angler.lurePos(b, g.T) : { x: 1.3, y: -1.1 };
    const ca = cos(b.ang), sa = sin(b.ang);
    const lx = b.x + (lp.x * ca - lp.y * sa) * b.r, ly = b.y + (lp.x * sa + lp.y * ca) * b.r;
    const ex = b.x + ca * b.r * 0.55, ey = b.y + sa * b.r * 0.55; // her eyes / face
    k.lx = lx; k.ly = ly;
    // seed shrimp are drawn to the lure
    const baits = g.ents.filter((e) => e.alive && e.bait);
    k.baitT -= dt; if (k.baitT <= 0 && baits.length < 5) { k.baitT = 1.6; spawnBait(g, b, false); }
    for (const e of baits) {
      const ux = lx - e.x, uy = ly - e.y, ud = hypot(ux, uy) + 0.01, pd = hypot(e.x - p.x, e.y - p.y) + 0.01;
      if (pd < 150 + p.r) { e.ctl.tx = (e.x - p.x) / pd; e.ctl.ty = (e.y - p.y) / pd; e.ctl.sp = ps * 0.5; }
      else { e.ctl.tx = ux / ud + cos(e.seed + g.T) * 0.5; e.ctl.ty = uy / ud + sin(e.seed + g.T) * 0.5; e.ctl.sp = ud > 60 ? ps * 0.32 : ps * 0.08; }
    }
    // a flash of seed-shrimp light near her face blinds her
    for (const gl of g.glows || []) {
      if (gl.seen) continue; gl.seen = true;
      if (k.state !== 'blind' && !(k.wary > 0) && hypot(gl.x - ex, gl.y - ey) < 190 + b.r * 0.45) {
        k.state = 'blind'; k.st = 3.2; b.lureK = 0; b.mouthK = 0; b.lureDark = true; k.wb = 0;
        g.bossHit(0.04, ex, ey, { raw: true, knock: false, text: 'Blinded!', tc: '#a8d8ff', c: [140, 200, 255] });
        if (!b.alive) return;
        g.sfx('boss', { vol: 0.3 }); g.shake = min(10, g.shake + 5);
        g.hint('boss_abyssal2', 'She’s blinded! Bite her now', 'target', 2500);
      }
    }
    k.acd = max(0, k.acd - dt); k.wary = max(0, (k.wary || 0) - dt);
    let tx = 0, ty = 0, sp = 0, sk = 1.2;
    switch (k.state) {
      case 'lurk': {
        // she hangs her lure in front of you
        b.lureK = 0.7 + 0.3 * sin(g.T * 3); b.mouthK = max(0, b.mouthK - dt * 2);
        b.ang = turn(b.ang, atan2(dy, dx), dt * 1.1);
        const want = b.r * 1.9, kk = d > want + 40 ? 1 : d < want - 30 ? -0.6 : 0;
        tx = dx / d * kk; ty = dy / d * kk; sp = ps * 0.32;
        const rel = abs(ad(b.ang, atan2(dy, dx)));
        if (k.acd <= 0 && rel < 0.7 && d < b.r * 1.75 + p.r && !g.dead) { k.state = 'snapT'; k.st = ph2 ? 0.26 : 0.32; b.lureK = 0.1; } // the lure flickers out
        if (ph2) { k.rushT -= dt; if (k.rushT <= 0 && d > 300 && d < 750) { k.state = 'rush'; k.st = 1.2; k.rushT = 7; b.lureK = 0; g.sfx('event', { vol: 0.4 }); } }
        break;
      }
      case 'snapT': k.st -= dt; b.lureK = 0.1; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4); if (k.st <= 0) { k.state = 'snap'; k.st = 0.25; } break;
      case 'snap': {
        k.st -= dt; b.mouthK = 1;
        if (!k.bit) {
          k.bit = true; g.sfx('gulp'); g.shake = min(12, g.shake + 6);
          const mx = b.x + ca * b.r * 1.1, my = b.y + sa * b.r * 1.1;
          if (!g.dead && hypot(p.x - mx, p.y - my) < b.r * 1.15 + p.r) { if (g.hurt(38, b, { why: 'Anglerfish jaws', iframes: 1.0 })) { p.vx = dx / d * 520; p.vy = dy / d * 520; } }
          for (const e of baits) if (hypot(e.x - mx, e.y - my) < b.r * 1.2) e.alive = false; // she snaps up shrimp too
        }
        if (k.st <= 0) { k.state = 'lurk'; k.acd = ph2 ? 1.3 : 1.7; k.bit = false; }
        break;
      }
      case 'rush': // lights out, then she comes at you
        k.st -= dt; b.lureK = 0; tx = dx / d; ty = dy / d; sp = ps * 1.45; sk = 4; b.ang = turn(b.ang, atan2(dy, dx), dt * 2);
        if (k.st <= 0 || d < b.r * 1.6 + p.r) { k.state = 'snap'; k.st = 0.3; k.bit = false; }
        break;
      case 'blind':
        k.st -= dt; b.lureK = 0; b.mouthK = 0; b.vx *= exp(-dt * 1.5); b.vy *= exp(-dt * 1.5); b.ang += sin(g.T * 2) * dt * 0.6;
        if (k.st <= 0) { k.state = 'lurk'; k.acd = 1; b.lureDark = false; k.wary = 5; }
        break;
    }
    if (k.state === 'lurk' || k.state === 'rush') steer(b, tx, ty, sp, sk, dt);
    if (g.dead) return;
    // her body: tough skin, but bites land, hard ones while she's blind
    if (d < b.r * 0.92 + p.r * 0.8) {
      const rel = abs(ad(b.ang, atan2(dy, dx)));
      if (k.state === 'blind' || rel > 0.9) {
        if (k.state === 'blind' ? winBite(b, k, 3) : b.biteCd <= 0 && (b.biteCd = 0.9)) {
          g.bossHit(k.state === 'blind' ? 0.06 : 0.012, (p.x + b.x) / 2, (p.y + b.y) / 2);
          if (!b.alive) return;
          if (k.state === 'lurk') b.ang = turn(b.ang, atan2(dy, dx), 0.8); // she whips round
        }
      } else { const pen = b.r * 0.92 + p.r * 0.8 - d; p.x += dx / d * pen; p.y += dy / d * pen; }
    }
  },
  die(g) { for (const e of g.ents) if (e.bait) { e.bait = false; e.ctl = null; } },
};

// ===================================================================================== The Progenitor
// A siphonophore is a colony of specialised animals strung along one stem: a gas float, swimming bells,
// feeding polyps, and stingers that trail long fishing tentacles. The feeders nourish the colony: while one
// lives, lost bells and stingers grow back. Kill the feeders, then the bells, and the heart of the colony
// lies open.
const PART_HP = { float: 0, bell: 4, core: 8, feeder: 4, stinger: 2 };
const ORDER = ['float', 'bell', 'bell', 'bell', 'core', 'feeder', 'stinger', 'feeder', 'stinger', 'feeder', 'stinger', 'feeder', 'stinger'];
BOSS_KIT.progenitor = {
  r: (p) => 38 + p.r * 0.5,
  chip: 0, fixed: true,
  hint: ['target', 'Bite its feeding polyps first: while they live, the colony regrows'],
  spawn(g, b, k) {
    const gap = b.r * 1.75; k.gap = gap;
    k.parts = ORDER.map((type, i) => ({ type, x: b.x - i * gap, y: b.y, ang: 0, hp: PART_HP[type], max: PART_HP[type], alive: true, regrow: 0, hit: 0, ph: random() * TAU }));
    k.weight = k.parts.reduce((s, q) => s + (q.type === 'stinger' || q.type === 'float' ? 0 : q.max), 0);
    k.heading = random() * TAU; k.dartT = 3; k.minT = 6; k.clinkT = 0; k.stage = 1;
    b.noDraw = true; b.vx = b.vy = 0;
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), P = k.parts;
    const feeders = P.filter((q) => q.type === 'feeder' && q.alive).length, bells = P.filter((q) => q.type === 'bell' && q.alive).length;
    k.clinkT = max(0, k.clinkT - dt);
    // stages: no feeders left -> it can't heal; no bells left -> the core is exposed
    if (k.stage === 1 && feeders === 0) { k.stage = 2; b.phase = 2; g.banner('The Progenitor', 'It can no longer heal', 'danger'); g.sfx('boss'); g.shake = 14; g.hint('boss_prog2', 'Now bite its swimming bells', 'target', 3000); }
    if (k.stage === 2 && bells === 0) { k.stage = 3; b.phase = 3; g.banner('Final form', 'The heart of the colony lies open', 'danger'); g.sfx('boss'); g.shake = 18; g.flash = 0.5; g.hint('boss_prog3', 'Bite the glowing core!', 'target', 3000); }
    // regrowth while any feeder lives
    for (const q of P) {
      q.hit = max(0, q.hit - dt * 3);
      if (!q.alive && q.type !== 'feeder' && q.type !== 'core' && feeders > 0) {
        q.regrow -= dt;
        if (q.regrow <= 0) { q.alive = true; q.hp = q.max; g.sparkle(q.x, q.y, [255, 200, 240], 12); g.texts.push({ x: q.x, y: q.y - b.r, s: 'Regrown!', life: 1, c: '#ffb3e6' }); }
      }
    }
    // swimming: the float leads, the colony follows its stem
    const H = P[0], hx = p.x - H.x, hy = p.y - H.y, hd = hypot(hx, hy) + 0.01;
    const speed = ps * (k.stage === 3 ? 0.22 : (0.3 + 0.13 * bells) * (k.stage === 2 ? 1.25 : 1));
    const orbit = k.stage === 2 ? 300 : 400;
    // it circles you, so its tentacles sweep across your path
    const toP = atan2(hy, hx), tang = toP + PI / 2 * (k.dir || (k.dir = random() < 0.5 ? 1 : -1));
    const target = hd > orbit + 200 ? toP : hd < orbit - 150 ? tang + (k.dir > 0 ? 0.6 : -0.6) : tang;
    k.heading = turn(k.heading, k.stage === 3 ? toP : target, dt * 1.1);
    H.x += cos(k.heading) * speed * dt; H.y += sin(k.heading) * speed * dt; H.ang = k.heading;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], q = P[i], ux = q.x - a.x, uy = q.y - a.y, ud = hypot(ux, uy) + 0.01;
      q.x = a.x + ux / ud * k.gap; q.y = a.y + uy / ud * k.gap; q.ang = atan2(-uy, -ux);
    }
    b.x = H.x; b.y = H.y; b.ang = H.ang; b.vx = cos(k.heading) * speed; b.vy = sin(k.heading) * speed;
    // stingers trail long fishing tentacles
    const sweep = k.stage === 3 ? 1.8 : 1;
    k.tents = [];
    for (let i = 0; i < P.length; i++) {
      const q = P[i]; if (q.type !== 'stinger' || !q.alive) continue;
      const base = q.ang + PI / 2 * (i % 4 === 2 ? 1 : -1), pts = [{ x: q.x, y: q.y }];
      const L = b.r * 4.6 * (k.stage === 3 ? 1.25 : 1);
      for (let s = 1; s <= 7; s++) { const u = s / 7, a = base + sin(g.T * 1.3 * sweep + i + u * 2) * 0.55 * sweep; pts.push({ x: pts[s - 1].x + cos(a) * L / 7, y: pts[s - 1].y + sin(a) * L / 7 }); }
      k.tents.push(pts);
    }
    // minions and darts
    if (k.stage === 2) { k.minT -= dt; if (k.minT <= 0) { k.minT = 8; const e = g.spawn('siphonophore', H.x, H.y, { force: true, r: p.r * 0.6 }); if (e) { e.vx = cos(k.heading) * 200; e.vy = sin(k.heading) * 200; } } }
    if (k.stage === 3) {
      k.dartT -= dt;
      if (k.dartT <= 0) {
        k.dartT = 2.6;
        for (const q of P) if (q.type === 'stinger' && q.alive) { const a = atan2(p.y - q.y, p.x - q.x); for (const o of [-0.18, 0, 0.18]) g.shards.push({ x: q.x, y: q.y, vx: cos(a + o) * 230, vy: sin(a + o) * 230, life: 3.5, a: a + o, c: [255, 140, 220] }); }
        g.sfx('toxin', { vol: 0.5 });
      }
    }
    // hp bar: what is left between you and the core
    b.hp = b.maxHp * P.reduce((s, q) => s + (q.type === 'stinger' || q.type === 'float' || !q.alive ? 0 : q.hp), 0) / k.weight;
    if (g.dead) return;
    // tentacles sting
    let stung = false;
    for (const pts of k.tents) { for (let s = 1; s < pts.length && !stung; s++) if (segDist(p.x, p.y, pts[s - 1].x, pts[s - 1].y, pts[s].x, pts[s].y) < p.r + 6) stung = true; if (stung) break; }
    if (stung) { g.hurt(36 * dt, null, { dot: true, why: 'Progenitor stinging tentacles' }); p.vx *= exp(-dt * 3); p.vy *= exp(-dt * 3); if (!k.sfx || k.sfx < g.T) { k.sfx = g.T + 0.3; p.flashT = 0.2; g.sfx('toxin', { vol: 0.3 }); } }
    // biting parts
    for (const q of P) {
      const ux = p.x - q.x, uy = p.y - q.y, ud = hypot(ux, uy) + 0.01, R = b.r * 0.85 + p.r * 0.8;
      if (ud > R) continue;
      const vuln = q.alive && q.type !== 'float' && (q.type !== 'core' || k.stage === 3);
      if (vuln && b.biteCd <= 0) {
        b.biteCd = 0.6; q.hit = 1;
        const dmg = min(q.hp, min(1.5, g.biteK()));
        q.hp -= dmg;
        g.burst(q.x, q.y, [255, 190, 240], 14, 200); g.sfx('gulp'); g.sfx('hit'); g.buzz(30); g.shake = min(12, g.shake + 6);
        if (q.hp <= 0) {
          q.alive = false; q.hp = 0; q.regrow = 8;
          g.burst(q.x, q.y, [255, 150, 230], 28, 260); g.sfx('pop');
          g.texts.push({ x: q.x, y: q.y - b.r, s: { feeder: 'Feeder destroyed!', bell: 'Bell destroyed!', stinger: 'Stinger destroyed!', core: 'Core destroyed!' }[q.type], life: 1.2, c: '#ffe28a' });
          if (q.type === 'core') { b.hp = 0; g.bossDie(); return; }
        } else g.texts.push({ x: q.x, y: q.y - b.r, s: '-' + Math.round(dmg / q.max * 100) + '%', life: 0.8, c: '#ffe28a' });
        p.vx = ux / ud * 380; p.vy = uy / ud * 380; p.iframes = max(p.iframes, 0.3);
        break;
      }
      // the float and a shielded core are tough; a stinger's body stings
      p.x = q.x + ux / ud * R; p.y = q.y + uy / ud * R;
      if (!vuln && k.clinkT <= 0) { k.clinkT = 1.5; g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: q.type === 'core' ? 'Shielded!' : q.type === 'float' ? 'Too tough!' : '', life: 0.9, c: '#e0d0f0' }); g.sfx('hit', { pitch: 2 }); }
      if (q.type === 'stinger' && q.alive) g.hurt(14, q, { why: 'Progenitor stinger', iframes: 0.6 });
      break;
    }
  },
  over(g, ctx, z, inView, sc) {
    const b = g.boss, k = b.k, T = g.T, P = k.parts, art = CREATURE_ART.siphboss, parts = art && art.parts;
    // the stem
    ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length; i++) ctx.lineTo(P[i].x, P[i].y);
    ctx.strokeStyle = 'rgba(255,200,240,0.55)'; ctx.lineWidth = max(2 / z, b.r * 0.12); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
    // fishing tentacles
    if (k.tents) {
      ctx.beginPath();
      for (const pts of k.tents) { ctx.moveTo(pts[0].x, pts[0].y); for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s].x, pts[s].y); }
      ctx.strokeStyle = k.stage === 3 ? 'rgba(255,120,200,0.75)' : 'rgba(255,160,220,0.55)'; ctx.lineWidth = 3 / z; ctx.stroke();
      ctx.beginPath();
      for (const pts of k.tents) for (let s = 2; s < pts.length; s++) { ctx.moveTo(pts[s].x + 4, pts[s].y); ctx.arc(pts[s].x, pts[s].y, 4, 0, TAU); }
      ctx.fillStyle = 'rgba(255,190,230,0.8)'; ctx.fill();
    }
    for (let i = P.length - 1; i >= 0; i--) {
      const q = P[i]; if (!inView(q.x, q.y, b.r * 3)) continue;
      const next = (k.stage === 1 && q.type === 'feeder') || (k.stage === 2 && q.type === 'bell') || (k.stage === 3 && q.type === 'core');
      if (q.alive && next) glow(ctx, q.x, q.y, b.r * 1.8, [255, 235, 150], 0.25 + 0.15 * sin(T * 6 + i));
      if (q.type === 'core') glow(ctx, q.x, q.y, b.r * 2, k.stage === 3 ? [255, 120, 160] : [255, 180, 240], k.stage === 3 ? 0.6 : 0.3);
      const st = { alive: q.alive, hit: q.hit, pulse: T * 2 + q.ph };
      if (!(parts && drawPart(ctx, parts[q.type], q.x, q.y, q.ang, b.r, sc, T, null, st))) {
        ctx.beginPath(); ctx.arc(q.x, q.y, b.r * (q.type === 'bell' ? 0.9 : 0.7), 0, TAU);
        ctx.fillStyle = q.alive ? ({ float: '#ffd0e8', bell: 'rgba(230,220,255,0.6)', core: '#ff7ab8', feeder: '#ffb070', stinger: '#ff5fa0' }[q.type]) : 'rgba(80,60,80,0.6)'; ctx.fill();
      }
      if (q.type === 'core' && k.stage < 3) { ctx.beginPath(); ctx.arc(q.x, q.y, b.r * 1.05, 0, TAU); ctx.strokeStyle = `rgba(230,210,255,${0.5 + 0.2 * sin(T * 4)})`; ctx.lineWidth = 3 / z; ctx.stroke(); }
      if (q.alive && q.max && q.hp < q.max) { ctx.beginPath(); ctx.arc(q.x, q.y, b.r * 1.15, -PI / 2, -PI / 2 + TAU * q.hp / q.max); ctx.strokeStyle = 'rgba(255,230,140,0.85)'; ctx.lineWidth = 3 / z; ctx.stroke(); }
      if (!q.alive && q.regrow > 0 && q.type !== 'feeder' && q.type !== 'core' && P.some((x) => x.type === 'feeder' && x.alive)) { ctx.beginPath(); ctx.arc(q.x, q.y, b.r * 0.9, -PI / 2, -PI / 2 + TAU * (1 - q.regrow / 8)); ctx.strokeStyle = 'rgba(255,170,230,0.6)'; ctx.lineWidth = 2 / z; ctx.setLineDash([5 / z, 5 / z]); ctx.stroke(); ctx.setLineDash([]); }
    }
  },
};

// ===================================================================================== Goliath Grouper
// The giant grouper of wrecks and reefs ambushes its prey and inhales it whole: its huge mouth opens so fast
// that it sucks in everything in front of it. But nothing can swallow a pufferfish that inflates in its mouth:
// the grouper chokes, spits it out and is dazed for a while. Let it suck you in, inflate, then bite.
const GULP_STATES = ['gape', 'suck', 'gulp', 'choke'];
BOSS_KIT.grouper = {
  r: (p) => 92 + p.r * 1.2,
  chip: 0.06, phaseAt: [0.5], phaseText: ['Hungrier: it lunges before it gulps'],
  hint: ['shield', 'It swallows prey whole! Let it suck you in, then Inflate inside its mouth so it chokes'],
  spawn(g, b, k) {
    k.wx = b.x; k.wy = b.y; k.wa = random() * TAU; // its wreck stays where it first appeared
    k.state = 'lurk'; k.st = 0; k.gapeT = 3.2; k.bumpT = 0;
    b.gapeK = 0; b.suckK = 0; b.chokeK = 0; b.stunK = 0;
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const mx = b.x + cos(b.ang) * b.r * 0.95, my = b.y + sin(b.ang) * b.r * 0.95; // its mouth
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    const mdx = p.x - mx, mdy = p.y - my, md = hypot(mdx, mdy) + 0.01;
    const reach = b.r * 4.2;
    k.bumpT = max(0, k.bumpT - dt);
    let tx = 0, ty = 0, sp = 0, sk = 1.4;
    const spit = (hurt) => {
      const a = b.ang + (random() - 0.5) * 0.7;
      p.x = mx + cos(a) * (b.r * 0.3 + p.r); p.y = my + sin(a) * (b.r * 0.3 + p.r);
      p.vx = cos(a) * 720; p.vy = sin(a) * 720; p.iframes = max(p.iframes, hurt ? p.iframes : 0.7);
    };
    switch (k.state) {
      case 'lurk': {
        b.ang = turn(b.ang, atan2(dy, dx), dt * 1.6);
        const want = b.r * 2.6, kk = d > want + 60 ? 1 : d < want - 60 ? -0.5 : 0;
        tx = dx / d * kk + -dy / d * 0.25; ty = dy / d * kk + dx / d * 0.25; sp = ps * 0.5;
        k.gapeT -= dt;
        if (k.gapeT <= 0 && d < reach + b.r && abs(ad(b.ang, atan2(dy, dx))) < 0.5 && !g.dead) {
          if (ph2 && random() < 0.6) { k.state = 'lunge'; k.st = 0.45; g.sfx('dash', { vol: 0.4 }); }
          else { k.state = 'gape'; k.st = ph2 ? 0.5 : 0.7; g.sfx('tick'); }
        }
        break;
      }
      case 'lunge': // a short rush to close the gap before it gulps
        k.st -= dt; tx = cos(b.ang); ty = sin(b.ang); sp = ps * 1.6; sk = 5;
        b.ang = turn(b.ang, atan2(dy, dx), dt * 1.5);
        if (k.st <= 0) { k.state = 'gape'; k.st = 0.4; g.sfx('tick'); }
        break;
      case 'gape': // mouth opening and gill covers flaring: the suck is coming
        k.st -= dt; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4); b.tele = 1;
        b.ang = turn(b.ang, atan2(dy, dx), dt * 2.2);
        if (k.st <= 0) { k.state = 'suck'; k.st = ph2 ? 1.6 : 1.4; g.sfx('gulp', { pitch: 0.5 }); g.sfx('bubble'); g.shake = min(12, g.shake + 5); }
        break;
      case 'suck': {
        k.st -= dt; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        const inCone = (x, y) => { const ux = x - mx, uy = y - my, ud = hypot(ux, uy) + 0.01; return ud < reach && abs(ad(b.ang, atan2(uy, ux))) < 0.9 ? ud : 0; };
        if (!g.dead && inCone(p.x, p.y)) {
          const f = (1 - md / reach) * 1500 + 260;
          p.vx -= mdx / md * f * dt; p.vy -= mdy / md * f * dt;
          if (md < b.r * 0.35 + p.r * 0.6) {
            k.state = 'gulp'; k.st = 1.15; g.sfx('gulp'); g.shake = 12; g.buzz([30, 30, 30]);
            g.hint('boss_grouper2', 'Swallowed! Inflate now!', 'shield', 1800);
          }
        }
        // small fish and food go in too
        for (const e of g.ents) {
          if (!e.alive || e.boss || e.ally) continue;
          const ud = inCone(e.x, e.y); if (!ud) continue;
          const kk = min(1, (420 + b.r) * dt / ud); e.x += (mx - e.x) * kk; e.y += (my - e.y) * kk; e.stun = max(e.stun || 0, 0.3);
          if (ud < b.r * 0.4) { e.alive = false; if (e.latched) p.latched = max(0, p.latched - 1); }
        }
        for (const m of g.motes) { const ud = inCone(m.x, m.y); if (ud) { const kk = min(1, 700 * dt / ud); m.x += (mx - m.x) * kk; m.y += (my - m.y) * kk; } }
        if (k.state === 'suck' && k.st <= 0) { k.state = 'snap'; k.st = 0.9; g.sfx('hit', { pitch: 0.6 }); } // missed
        break;
      }
      case 'gulp': // you are in its mouth: inflate before it swallows
        k.st -= dt; b.vx *= exp(-dt * 6); b.vy *= exp(-dt * 6);
        p.x = mx; p.y = my; p.vx = 0; p.vy = 0;
        if (p.puffK > 0.5) {
          k.state = 'choke'; k.st = 0.7; b.chokeK = 1;
          g.sfx('boss'); g.shake = 14; g.flash = 0.25; g.buzz([40, 30, 60]);
          g.bossHit(0.06, mx, my, { raw: true, knock: false, text: 'Choking!', tc: '#ffd58a', c: [255, 230, 160] });
          if (!b.alive) return;
        } else if (p.dashT > 0) { spit(false); k.state = 'snap'; k.st = 0.9; } // burst out before it closes
        else if (k.st <= 0) {
          g.hurt(30, b, { why: 'Swallowed by the grouper', iframes: 1 });
          spit(true); k.state = 'snap'; k.st = 1.0;
          g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: 'Too big to swallow… just', life: 1.3, c: '#ffb0a0' });
        }
        break;
      case 'choke': // it can't swallow a spiny ball: jammed open, then it spits you out
        k.st -= dt; p.x = mx; p.y = my; p.vx = 0; p.vy = 0;
        if (k.st <= 0) { spit(false); k.state = 'dazed'; k.st = ph2 ? 2.8 : 3.2; k.wb = 0; b.chokeK = 0; g.hint('boss_grouper3', 'It’s choking! Bite it now', 'target', 2400); }
        break;
      case 'dazed':
        k.st -= dt; b.vx *= exp(-dt * 2); b.vy *= exp(-dt * 2); b.ang += sin(g.T * 2.2) * dt * 0.3;
        if (k.st <= 0) { k.state = 'lurk'; k.gapeT = ph2 ? 2.0 : 2.6; }
        break;
      case 'snap': // the mouth slams shut; a moment to recover
        k.st -= dt; b.vx *= exp(-dt * 3); b.vy *= exp(-dt * 3);
        if (k.st <= 0) { k.state = 'lurk'; k.gapeT = ph2 ? 1.8 : 2.4; }
        break;
    }
    if (k.state === 'lurk' || k.state === 'lunge') steer(b, tx, ty, sp, sk, dt);
    const ap = (v, to, rate) => v + (to - v) * min(1, dt * rate);
    b.gapeK = ap(b.gapeK, GULP_STATES.includes(k.state) ? (k.state === 'gape' ? 0.55 : 1) : 0, k.state === 'snap' ? 14 : 7);
    b.suckK = ap(b.suckK, k.state === 'suck' ? 1 : 0, 8);
    b.chokeK = ap(b.chokeK, k.state === 'choke' ? 1 : 0, 14);
    g.hidePlayer = k.state === 'choke'; // the art draws you wedged in its mouth
    b.stunK = ap(b.stunK, k.state === 'dazed' ? 1 : 0, 5);
    if (g.dead || k.state === 'gulp' || k.state === 'choke') return;
    // its body: bites land only while it is dazed
    if (d < b.r * 0.9 + p.r * 0.8) {
      if (k.state === 'dazed') { if (winBite(b, k, 3, 0.5)) g.bossHit(0.075, (p.x + b.x) / 2, (p.y + b.y) / 2); }
      else {
        const pen = b.r * 0.9 + p.r * 0.8 - d; p.x += dx / d * pen; p.y += dy / d * pen;
        if (k.bumpT <= 0) { k.bumpT = 1.6; g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: 'Too big to bite!', life: 0.9, c: '#cfd8e8' }); }
        if (g.hurt(12, b, { why: 'Goliath grouper', iframes: 0.6 })) { p.vx = dx / d * 380; p.vy = dy / d * 380; }
      }
    }
  },
  under(g, ctx, z, inView, sc) {
    const b = g.boss, k = b.k, art = CREATURE_ART.grouper;
    if (art && art.wreck && inView(k.wx, k.wy, b.r * 5)) drawPart(ctx, art.wreck, k.wx, k.wy, k.wa, b.r * 0.9, sc, g.T, art.col);
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k, T = g.T;
    if (k.state === 'gape' || k.state === 'suck') {
      const mx = b.x + cos(b.ang) * b.r * 0.95, my = b.y + sin(b.ang) * b.r * 0.95, reach = b.r * 4.2;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.arc(mx, my, reach, b.ang - 0.9, b.ang + 0.9); ctx.closePath();
      ctx.fillStyle = k.state === 'gape' ? `rgba(255,120,110,${0.1 + 0.08 * sin(T * 24)})` : 'rgba(200,240,255,0.08)'; ctx.fill();
      ctx.strokeStyle = k.state === 'gape' ? 'rgba(255,150,130,0.55)' : 'rgba(210,245,255,0.35)'; ctx.lineWidth = 2 / z; ctx.stroke();
    }
    if (k.state === 'gulp') {
      const p = g.p;
      ctx.font = `800 ${Math.round(22 / z)}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,225,150,${0.75 + 0.25 * sin(T * 20)})`; ctx.fillText('INFLATE!', p.x, p.y - p.r * 2.2);
    }
    if (k.state === 'dazed') glow(ctx, b.x, b.y, b.r * 1.3, [150, 255, 200], 0.22 + 0.12 * sin(T * 9));
  },
};

// ===================================================================================== Humboldt Squid Pack
// Jumbo squid hunt in packs in the cold Pacific, talking in waves of red and white flickering across their
// skin. The pack circles you, flushes red all together, then attacks at once. After every attack the squid
// are spent for a moment: bite them then. Inflate and the grabbers get a mouthful of spines; a Photophore
// Flash scrambles their signals and they turn on each other, as these cannibal squid really do.
const PACK = 5, SQ_HITS = 6;
const sqSteer = (q, tx, ty, sp, k, dt) => { const a = 1 - exp(-dt * k); q.vx += (tx * sp - q.vx) * a; q.vy += (ty * sp - q.vy) * a; };
BOSS_KIT.squidpack = {
  r: (p) => 18 + p.r * 1.0, // a jumbo squid is 1.5–2 m: bigger than you, not a monster
  fixed: true, chip: 0.08, phaseAt: [0.5], phaseText: ['They attack in waves'],
  hint: ['bolt', 'When the pack flushes red, they all attack at once. Inflate or Flash, then bite the tired squid'],
  spawn(g, b, k) {
    const p = g.p;
    k.sq = [b];
    for (let i = 1; i < PACK; i++) {
      const a = atan2(b.y - p.y, b.x - p.x) + (i - 2) * 0.5, R = hypot(b.x - p.x, b.y - p.y);
      k.sq.push({ kind: 'humboldt', x: p.x + cos(a) * R, y: p.y + sin(a) * R, vx: 0, vy: 0, ang: a + PI, r: b.r * (0.86 + random() * 0.18), seed: random() * 10, t: random() * 5, alive: true });
    }
    k.total = PACK * SQ_HITS;
    for (const q of k.sq) Object.assign(q, { hits: SQ_HITS, st: 'circle', stT: 0, orb: atan2(q.y - p.y, q.x - p.x), flashK: 0.5, redK: 0, grabK: 0, inkK: 0, biteCd: 0, wb: 0, hit: false, flash: 0 });
    k.mode = 'circle'; k.signalT = 4.5; k.wave = 0; k.bumpT = 0;
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2, T = g.T;
    k.bumpT = max(0, k.bumpT - dt);
    const live = k.sq.filter((q) => q.alive !== false);
    // the pack's signal: everyone circling flushes red, then they all attack (in two waves once desperate)
    k.signalT -= dt;
    if (k.signalT <= 0 && !g.dead) {
      const ready = live.filter((q) => q.st === 'circle');
      const wave = ph2 ? ready.filter((q, i) => (i + k.wave) % 2 === 0) : ready;
      for (const q of wave) { q.st = 'signal'; q.stT = ph2 ? 0.7 : 0.9; }
      if (wave.length) { g.sfx('tick'); g.sfx('boss', { vol: 0.25 }); }
      k.wave++; k.signalT = ph2 ? 2.3 : 3.8;
    }
    for (const q of live) {
      q.t = (q.t || 0) + dt; q.biteCd = max(0, q.biteCd - dt); q.flash = max(0, (q.flash || 0) - dt * 4);
      const dx = p.x - q.x, dy = p.y - q.y, d = hypot(dx, dy) + 0.01;
      let tx = 0, ty = 0, sp = 0, sk = 2.2, red = 0, fl = 0.55 + 0.25 * sin(T * 3 + q.seed);
      switch (q.st) {
        case 'circle': { // orbit you, flickering to each other
          q.orb += dt * (0.55 + 0.1 * sin(q.seed)) * (q.seed > 5 ? 1 : -1);
          const R = 250 + q.r * 2.2 + 30 * sin(T * 0.7 + q.seed);
          const gx = p.x + cos(q.orb) * R - q.x, gy = p.y + sin(q.orb) * R - q.y, gd = hypot(gx, gy) + 0.01;
          tx = gx / gd; ty = gy / gd; sp = min(ps * 1.25, gd * 3);
          q.ang = turn(q.ang, atan2(dy, dx), dt * 3);
          break;
        }
        case 'signal': // flushed red: the attack is coming
          q.stT -= dt; red = 1; fl = 0; q.vx *= exp(-dt * 3); q.vy *= exp(-dt * 3);
          q.ang = turn(q.ang, atan2(dy, dx), dt * 5);
          if (q.stT <= 0) { q.st = 'attack'; q.stT = 0.6; q.hit = false; q.aa = atan2(dy + p.vy * 0.25, dx + p.vx * 0.25); g.sfx('dash', { vol: 0.3 }); }
          break;
        case 'attack': { // a jet straight at you, tentacles out
          q.stT -= dt; red = 1; fl = 0; tx = cos(q.aa); ty = sin(q.aa); sp = ps * 2.5; sk = 7; q.ang = turn(q.ang, q.aa, dt * 6);
          q.grabK = min(1, q.grabK + dt * 6);
          if (!q.hit && !g.dead && d < q.r * 1.7 + p.r) {
            q.hit = true;
            if (p.puffK > 0.5) { // a mouthful of spines
              q.st = 'tired'; q.stT = 1.6; q.wb = 0; q.flash = 1;
              this.hitSquid(g, b, k, q, 0.35, 'Spiked!');
              continue;
            }
            if (g.hurt(20, q, { why: 'Humboldt squid', iframes: 0.45 })) { p.vx += cos(q.aa) * 260; p.vy += sin(q.aa) * 260; }
          }
          if (q.stT <= 0) { q.st = 'tired'; q.stT = ph2 ? 0.85 : 1.0; q.wb = 0; }
          break;
        }
        case 'tired': // spent after the attack: pale and slow. Bite now
          q.stT -= dt; fl = 0; q.vx *= exp(-dt * 2.2); q.vy *= exp(-dt * 2.2);
          if (q.stT <= 0) { q.st = 'circle'; q.orb = atan2(q.y - p.y, q.x - p.x); }
          break;
        case 'confused': { // signals scrambled: they flicker madly, blunder about and bite each other
          q.stT -= dt; fl = 0.6 + 0.4 * sin(T * 31 + q.seed * 7);
          q.wa = (q.wa ?? random() * TAU) + (random() - 0.5) * dt * 4; tx = cos(q.wa); ty = sin(q.wa); sp = ps * 0.45;
          q.ang = turn(q.ang, atan2(q.vy, q.vx), dt * 3);
          if (q.stT <= 0) { q.st = 'circle'; q.orb = atan2(q.y - p.y, q.x - p.x); }
          break;
        }
      }
      if (q.st !== 'tired' && q.st !== 'signal') sqSteer(q, tx, ty, sp, sk, dt);
      if (q.st !== 'attack') q.grabK = max(0, q.grabK - dt * 3);
      q.redK += (red - q.redK) * min(1, dt * 6); q.flashK += (fl - q.flashK) * min(1, dt * 6);
      q.inkK = max(0, q.inkK - dt * 0.8);
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (!Number.isFinite(q.x) || hypot(q.x - p.x, q.y - p.y) > 2000) { const a = random() * TAU; q.x = p.x + cos(a) * 600; q.y = p.y + sin(a) * 600; q.vx = q.vy = 0; }
      if (g.dead || !b.alive) continue;
      // your bite
      if (d < q.r * 0.95 + p.r * 0.8) {
        if (q.st === 'tired' || q.st === 'confused') {
          if (q.biteCd <= 0 && q.wb < 1) { q.biteCd = 0.5; q.wb++; this.hitSquid(g, b, k, q, g.biteK(), null); }
        } else if (q.st === 'circle' && k.bumpT <= 0) {
          k.bumpT = 1.2; g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: 'Too quick!', life: 0.8, c: '#cfd8e8' });
          if (g.hurt(12, q, { why: 'Humboldt squid', iframes: 0.5 })) { p.vx = dx / d * 320; p.vy = dy / d * 320; }
        }
      }
    }
    if (!b.alive) return;
    // scrambled squid bite each other
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
      const a = live[i], c = live[j];
      if (a.st !== 'confused' && c.st !== 'confused') continue;
      if (hypot(a.x - c.x, a.y - c.y) > (a.r + c.r) * 0.9 || (a.cannT || 0) > T) continue;
      a.cannT = c.cannT = T + 0.9;
      const v = a.st === 'confused' ? c : a; v.flash = 1;
      g.texts.push({ x: v.x, y: v.y - v.r, s: 'Cannibal!', life: 1, c: '#ffb3a8' });
      this.hitSquid(g, b, k, v, 0.5, null, true);
      if (!b.alive) return;
    }
    // keep the boss entity's fields in step for its art
    if (b.st === 'tired' || b.st === 'confused') b.tele = 0;
  },
  // one squid takes a bite: the boss bar drops by its share, and a squid that has had enough flees in ink
  hitSquid(g, b, k, q, n, text, raw) {
    const frac = n / k.total;
    const ox = q.x, oy = q.y;
    g.bossHit(frac, q.x, q.y, { raw: true, knock: !raw, text, tc: '#ffd0c0', c: [255, 190, 170] });
    q.hits -= n; q.flash = 1;
    if (!b.alive) return;
    if (q.hits <= 0.01) {
      (g.inks = g.inks || []).push({ x: ox, y: oy, r: q.r * 1.4, grow: q.r * 3, life: 2.5, max: 2.5, seed: random() * 10 });
      g.sfx('bubble'); g.texts.push({ x: ox, y: oy - q.r, s: 'Fled!', life: 1, c: '#e8d8ff' });
      if (q === b) { // the boss entity takes over the nearest squid still fighting
        const rest = k.sq.filter((o) => o !== b && o.alive !== false);
        if (!rest.length) return;
        const o = rest.reduce((a, c) => (hypot(c.x - ox, c.y - oy) < hypot(a.x - ox, a.y - oy) ? c : a));
        for (const key of ['x', 'y', 'vx', 'vy', 'ang', 'r', 'seed', 't', 'hits', 'st', 'stT', 'orb', 'flashK', 'redK', 'grabK', 'inkK', 'biteCd', 'wb', 'hit', 'aa', 'wa']) b[key] = o[key];
        o.alive = false;
      } else q.alive = false;
      k.sq = k.sq.filter((o) => o.alive !== false);
    }
  },
  slashAny(g, b, k, R, half) {
    const p = g.p;
    for (const q of k.sq) { if (q.alive === false) continue; const ux = q.x - p.x, uy = q.y - p.y, ud = hypot(ux, uy); if (ud < R + q.r && abs(ad(p.ang, atan2(uy, ux))) < half + q.r / max(ud, 1)) { q.st = 'tired'; q.stT = 1.4; q.wb = 0; q.flash = 1; } }
  },
  // a photophore flash scrambles the signals of every squid it reaches
  flashAny(g, b, k, R) {
    const p = g.p; let n = 0;
    for (const q of k.sq) {
      if (q.alive === false || hypot(q.x - p.x, q.y - p.y) > R + q.r) continue;
      q.st = 'confused'; q.stT = 3 + 0.4 * (p.muts.photo | 0); q.redK = 0; q.wb = 0; n++;
    }
    if (n) { g.texts.push({ x: p.x, y: p.y - p.r * 2, s: 'Signals scrambled!', life: 1.4, c: '#bfe6ff' }); g.hint('boss_squid2', 'Scrambled! They bite each other. Bite them too', 'target', 2600); }
  },
  over(g, ctx, z, inView, sc) {
    const b = g.boss, k = b.k, T = g.T;
    for (const q of k.sq) {
      if (q === b || q.alive === false || !inView(q.x, q.y, q.r * 4)) continue;
      drawFake(ctx, q, T, sc);
    }
    for (const q of k.sq) {
      if (q.alive === false || !inView(q.x, q.y, q.r * 3)) continue;
      if (q.st === 'signal') { // flushed red: about to attack. A pulsing red ring and a warning mark make it unmissable
        const pu = 0.5 + 0.5 * sin(T * 26);
        glow(ctx, q.x, q.y, q.r * 2.2, [255, 60, 50], 0.35 + 0.25 * pu);
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1.5 + 0.15 * pu), 0, TAU); ctx.strokeStyle = `rgba(255,80,70,${0.55 + 0.35 * pu})`; ctx.lineWidth = 3 / z; ctx.stroke();
        ctx.font = `900 ${Math.round(26 / z)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(255,110,95,${0.7 + 0.3 * pu})`; ctx.fillText('!', q.x, q.y - q.r * 1.7);
      }
      else if (q.st === 'tired') glow(ctx, q.x, q.y, q.r * 1.6, [150, 255, 200], 0.2 + 0.1 * sin(T * 9));
      else if (q.st === 'confused') glow(ctx, q.x, q.y, q.r * 1.5, [190, 225, 255], 0.18 + 0.12 * sin(T * 17 + q.seed));
    }
  },
};

// ===================================================================================== Thresher Shark
// Thresher sharks herd fish with their enormous tail, then lash it over their heads to stun the whole shoal.
// Stay out of the arc in front of it. After a lash it is spent for a moment: bite it, or slash it with your
// bill. Slashing it while it winds up staggers it.
BOSS_KIT.thresher = {
  r: (p) => 50 + p.r * 0.95,
  chip: 0.06, phaseAt: [0.5], phaseText: ['Double lashes!'],
  hint: ['target', 'Keep out of the arc in front of it. After its tail lashes it is spent: bite or slash it then'],
  spawn(g, b, k) { k.state = 'circle'; k.st = 0; k.whipT = 3; k.lashes = 0; k.bumpT = 0; k.orb = atan2(b.y - g.p.y, b.x - g.p.x); b.windK = 0; b.whipK = 0; b.stunK = 0; },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01, reach = b.r * 3.4;
    k.bumpT = max(0, k.bumpT - dt);
    let tx = 0, ty = 0, sp = 0, sk = 2;
    switch (k.state) {
      case 'circle': { // herding: it circles, closing in, then lines up a lash
        k.orb += dt * 0.7; k.whipT -= dt;
        const R = k.whipT > 0 ? b.r * 3.2 : reach * 0.7;
        const gx = p.x + cos(k.orb) * R - b.x, gy = p.y + sin(k.orb) * R - b.y, gd = hypot(gx, gy) + 0.01;
        tx = gx / gd; ty = gy / gd; sp = min(ps * 1.1, gd * 2.5);
        b.ang = turn(b.ang, k.whipT > 0 ? atan2(b.vy, b.vx) : atan2(dy, dx), dt * 3);
        if (k.whipT <= 0 && d < reach + p.r && abs(ad(b.ang, atan2(dy, dx))) < 0.5 && !g.dead) { k.state = 'wind'; k.st = ph2 && k.lashes ? 0.45 : ph2 ? 0.6 : 0.8; g.sfx('tick'); }
        break;
      }
      case 'wind': // the tail cocks forward: the lash is coming
        k.st -= dt; b.tele = 1; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        if (k.st > 0.25) b.ang = turn(b.ang, atan2(dy, dx), dt * 3);
        if (k.st <= 0) { k.state = 'whip'; k.st = 0.35; k.hit = false; g.sfx('dash', { vol: 0.6 }); }
        break;
      case 'whip': { // the tail lashes over its head through everything in front
        k.st -= dt;
        if (!k.hit && k.st < 0.2) {
          k.hit = true; k.lashes++; g.shake = min(16, g.shake + 8); g.sfx('hit', { pitch: 0.7 }); g.sfx('boss', { vol: 0.3 });
          const inArc = (x, y, r) => { const ux = x - b.x, uy = y - b.y, ud = hypot(ux, uy); return ud < reach + r && abs(ad(b.ang, atan2(uy, ux))) < 1.0; };
          for (const e of g.ents) if (e.alive && !e.boss && !e.ally && inArc(e.x, e.y, e.r)) { e.stun = max(e.stun || 0, 2.2); e.flash = 1; } // stunned fish: free food
          if (!g.dead && inArc(p.x, p.y, p.r * 0.6)) { if (g.hurt(26, b, { why: 'Thresher tail', iframes: 0.6 })) { p.vx = cos(b.ang) * 600; p.vy = sin(b.ang) * 600; } }
          g.burst(b.x + cos(b.ang) * reach * 0.6, b.y + sin(b.ang) * reach * 0.6, [220, 240, 255], 20, 300);
        }
        if (k.st <= 0) {
          if (ph2 && k.lashes < 2) { k.state = 'wind'; k.st = 0.45; }
          else { k.state = 'spent'; k.st = ph2 ? 1.25 : 1.5; k.wb = 0; k.lashes = 0; g.hint('boss_thresher2', 'It’s spent! Bite or slash it now', 'target', 2400); }
        }
        break;
      }
      case 'spent': // the tail drags: open to bites
        k.st -= dt; b.vx *= exp(-dt * 2.5); b.vy *= exp(-dt * 2.5); b.ang += sin(g.T * 2) * dt * 0.2;
        if (k.st <= 0) { k.state = 'circle'; k.whipT = ph2 ? 2.2 : 3.0; k.orb = atan2(b.y - p.y, b.x - p.x); }
        break;
    }
    if (k.state === 'circle') steer(b, tx, ty, sp, sk, dt);
    const ap = (v, to, rate) => v + (to - v) * min(1, dt * rate);
    b.windK = ap(b.windK, k.state === 'wind' ? 1 : 0, 8);
    b.whipK = k.state === 'whip' ? 1 - k.st / 0.35 : ap(b.whipK, 0, 4);
    b.stunK = ap(b.stunK, k.state === 'spent' ? 1 : 0, 5);
    if (g.dead) return;
    if (d < b.r * 0.9 + p.r * 0.8) {
      if (k.state === 'spent') { if (winBite(b, k, 2, 0.5)) g.bossHit(0.075, (p.x + b.x) / 2, (p.y + b.y) / 2); }
      else {
        const pen = b.r * 0.9 + p.r * 0.8 - d; p.x += dx / d * pen; p.y += dy / d * pen;
        if (k.bumpT <= 0) { k.bumpT = 1.4; g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: 'Too quick!', life: 0.9, c: '#cfd8e8' }); }
        if (g.hurt(12, b, { why: 'Thresher shark', iframes: 0.6 })) { p.vx = dx / d * 360; p.vy = dy / d * 360; }
      }
    }
  },
  slash(g, b, k) {
    if (k.state === 'spent') g.bossHit(0.1, b.x, b.y, { text: 'Slashed!', tc: '#bfe6ff', c: [200, 235, 255] });
    else if (k.state === 'wind') { g.bossHit(0.07, b.x, b.y, { text: 'Staggered!', tc: '#bfe6ff', c: [200, 235, 255] }); if (b.alive) { k.state = 'spent'; k.st = 1.2; k.wb = 0; k.lashes = 0; } }
    else g.bossDamage(30);
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k, T = g.T, reach = b.r * 3.4;
    if (k.state === 'wind' || k.state === 'whip') {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.arc(b.x, b.y, reach, b.ang - 1.0, b.ang + 1.0); ctx.closePath();
      ctx.fillStyle = k.state === 'wind' ? `rgba(255,110,100,${0.1 + 0.08 * sin(T * 24)})` : 'rgba(220,240,255,0.18)'; ctx.fill();
      ctx.strokeStyle = k.state === 'wind' ? 'rgba(255,140,120,0.6)' : 'rgba(230,245,255,0.6)'; ctx.lineWidth = 2 / z; ctx.stroke();
    }
    if (k.state === 'spent') glow(ctx, b.x, b.y, b.r * 1.3, [150, 255, 200], 0.22 + 0.12 * sin(T * 9));
  },
};

// ===================================================================================== Broadbill Swordfish
// Swordfish hunt at night. A heater organ warms their eyes and brain, so they see far better than their prey in
// cold, dark water. In the dark you see its glowing eyes and the sparks of its wake. It charges sword first:
// dodge, then bite its side as it turns, or meet the charge with your own bill (a parry) to stagger it.
BOSS_KIT.swordfish = {
  r: (p) => 48 + p.r * 0.9,
  chip: 0.06, phaseAt: [0.5], phaseText: ['Faster, double charges'],
  hint: ['eye', 'Watch for its glowing eyes. Dodge the charge and bite its side as it turns, or parry with a Bill Slash'],
  spawn(g, b, k) { k.state = 'stalk'; k.st = 0; k.chargeT = 3; k.n = 0; k.trail = []; k.trT = 0; k.orb = atan2(b.y - g.p.y, b.x - g.p.x); b.glowK = 0.4; b.wakeK = 0.3; b.chargeK = 0; },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2;
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    let tx = 0, ty = 0, sp = 0, sk = 2, glowW = 0.45, wakeW = 0.3;
    switch (k.state) {
      case 'stalk': { // a wide, slow circle in the dark
        k.orb += dt * 0.45 * (ph2 ? 1.3 : 1); k.chargeT -= dt;
        const R = 320, gx = p.x + cos(k.orb) * R - b.x, gy = p.y + sin(k.orb) * R - b.y, gd = hypot(gx, gy) + 0.01;
        tx = gx / gd; ty = gy / gd; sp = min(ps * 1.15, gd * 2.2);
        b.ang = turn(b.ang, atan2(b.vy, b.vx), dt * 3);
        if (k.chargeT <= 0 && !g.dead) { k.state = 'aim'; k.st = ph2 && k.n ? 0.4 : ph2 ? 0.55 : 0.75; g.sfx('tick'); }
        break;
      }
      case 'aim': // it turns on you, eyes blazing
        k.st -= dt; b.tele = 1; glowW = 1; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        b.ang = turn(b.ang, atan2(dy + p.vy * 0.2, dx + p.vx * 0.2), dt * 4.5);
        if (k.st <= 0) { k.state = 'charge'; k.st = min(0.9, max(0.35, (d + b.r * 2.4) / (ps * 3.1))); k.hit = false; k.ca = b.ang; g.sfx('dash', { vol: 0.6 }); } // it overshoots you by a couple of lengths
        break;
      case 'charge': { // sword first, in a straight line
        k.st -= dt; glowW = 1; wakeW = 1; tx = cos(k.ca); ty = sin(k.ca); sp = ps * 3.1; sk = 8; b.ang = k.ca;
        const ca = cos(b.ang), sa = sin(b.ang);
        if (!k.hit && !g.dead && segDist(p.x, p.y, b.x + ca * b.r * 0.6, b.y + sa * b.r * 0.6, b.x + ca * b.r * 2.2, b.y + sa * b.r * 2.2) < p.r + 8) {
          k.hit = true; if (g.hurt(34, b, { why: 'Swordfish sword', iframes: 0.7 })) { p.vx = ca * 650; p.vy = sa * 650; }
        }
        if (k.st <= 0) { k.n++; if (ph2 && k.n < 2) { k.state = 'aim'; k.st = 0.4; } else { k.state = 'turn'; k.st = ph2 ? 1.3 : 1.6; k.wb = 0; k.n = 0; g.hint('boss_sword3', 'It overshot! Bite its side as it turns', 'target', 2200); } }
        break;
      }
      case 'turn': // overshot: it swings round slowly, flank open
        k.st -= dt; glowW = 0.3; b.vx *= exp(-dt * 4); b.vy *= exp(-dt * 4);
        b.ang = turn(b.ang, atan2(dy, dx), dt * 1.1);
        if (k.st <= 0) { k.state = 'stalk'; k.chargeT = ph2 ? 1.8 : 2.4; k.orb = atan2(b.y - p.y, b.x - p.x); }
        break;
      case 'parried': // swords clashed: it reels
        k.st -= dt; glowW = 0.15; wakeW = 0.1; b.vx *= exp(-dt * 2); b.vy *= exp(-dt * 2); b.ang += sin(g.T * 3) * dt * 0.4;
        if (k.st <= 0) { k.state = 'stalk'; k.chargeT = ph2 ? 2.0 : 2.8; k.orb = atan2(b.y - p.y, b.x - p.x); }
        break;
    }
    if (k.state === 'stalk' || k.state === 'charge') steer(b, tx, ty, sp, sk, dt);
    const ap = (v, to, rate) => v + (to - v) * min(1, dt * rate);
    b.glowK = ap(b.glowK, glowW, 6); b.wakeK = ap(b.wakeK, wakeW, 4);
    b.chargeK = ap(b.chargeK, k.state === 'charge' ? 1 : 0, k.state === 'charge' ? 12 : 3);
    // its wake leaves a fading trail of sparks (they also light up the dark)
    k.trT -= dt; if (k.trT <= 0) { k.trT = 0.08; k.trail.push({ x: b.x - cos(b.ang) * b.r, y: b.y - sin(b.ang) * b.r, life: 1.2, a: b.wakeK }); }
    for (const q of k.trail) q.life -= dt; k.trail = k.trail.filter((q) => q.life > 0);
    if (g.dead) return;
    if (d < b.r * 0.9 + p.r * 0.8) {
      const rel = abs(ad(b.ang, atan2(dy, dx)));
      if ((k.state === 'turn' || k.state === 'parried') && rel > 0.5) { if (winBite(b, k, k.state === 'parried' ? 3 : 2, 0.5)) g.bossHit(0.075, (p.x + b.x) / 2, (p.y + b.y) / 2); }
      else if (k.state !== 'charge') {
        const pen = b.r * 0.9 + p.r * 0.8 - d; p.x += dx / d * pen; p.y += dy / d * pen;
        if (g.hurt(rel < 0.5 ? 18 : 10, b, { why: rel < 0.5 ? 'Swordfish sword' : 'Swordfish', iframes: 0.6 })) { p.vx = dx / d * 380; p.vy = dy / d * 380; }
      }
    }
  },
  // a Bill Slash that meets its charge is a parry: the swords clash and it reels
  slash(g, b, k) {
    const p = g.p, rel = abs(ad(b.ang, atan2(p.y - b.y, p.x - b.x))), d = hypot(p.x - b.x, p.y - b.y);
    if ((k.state === 'charge' || k.state === 'aim') && rel < 0.7 && d < b.r * 3) {
      k.state = 'parried'; k.st = 1.8; k.wb = 0; k.n = 0;
      g.sfx('hit', { pitch: 2 }); g.sfx('boss', { vol: 0.3 }); g.flash = 0.3; g.shake = 14;
      g.bossHit(0.06, (p.x + b.x) / 2, (p.y + b.y) / 2, { raw: true, text: 'Parried!', tc: '#bfe6ff', c: [220, 240, 255] });
      g.hint('boss_sword2', 'Parried! Bite it while it reels', 'target', 2400);
    } else if (k.state === 'turn' || k.state === 'parried') g.bossHit(0.08, b.x, b.y, { text: 'Slashed!', tc: '#bfe6ff', c: [200, 235, 255] });
    else g.bossDamage(30);
  },
  lights(g, b, k) {
    const out = [], ca = cos(b.ang), sa = sin(b.ang);
    for (const sd of [-1, 1]) out.push({ x: b.x + ca * b.r * 0.55 - sa * sd * b.r * 0.22, y: b.y + sa * b.r * 0.55 + ca * sd * b.r * 0.22, r: b.r * 0.9, col: [255, 170, 90], a: 0.25 + 0.55 * b.glowK });
    for (const q of k.trail) out.push({ x: q.x, y: q.y, r: b.r * 0.7, col: [110, 190, 255], a: 0.35 * q.life * q.a });
    return out;
  },
  over(g, ctx, z) {
    const b = g.boss, k = b.k, T = g.T;
    if (k.state === 'aim') {
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + cos(b.ang) * 900, b.y + sin(b.ang) * 900);
      ctx.strokeStyle = `rgba(255,150,110,${0.2 + 0.2 * sin(T * 26)})`; ctx.lineWidth = (b.r * 0.7); ctx.lineCap = 'round'; ctx.stroke();
    }
    if (k.state === 'turn' || k.state === 'parried') glow(ctx, b.x, b.y, b.r * 1.3, [150, 255, 200], 0.2 + 0.12 * sin(T * 9));
  },
};

// ===================================================================================== Lion's Mane Jellyfish
// The biggest jellyfish: a bell two metres wide and a mane of stinging tentacles longer than a blue whale.
// Sunfish eat jellies, tentacles and all: bite through the strands to open a path, then bite the bell.
// A Breach that lands near it rips through every strand around and stuns the bell. Cut strands regrow.
const LM_STRANDS = 10, LM_SEGS = 9;
BOSS_KIT.lionsmane = {
  r: (p) => 60 + p.r * 0.9,
  fixed: true, chip: 0.06, phaseAt: [0.5], phaseText: ['Its mane grows back faster'],
  hint: ['target', 'Bite through its stinging strands to reach the bell, then bite the bell. A Breach rips through them all'],
  spawn(g, b, k) {
    k.st = []; k.stunT = 0; k.bumpT = 0; k.drift = random() * TAU; b.pulse = 0; b.stingK = 0; b.hurtK = 0;
    for (let i = 0; i < LM_STRANDS; i++) {
      const a = (i / LM_STRANDS) * TAU, pts = [];
      for (let j = 0; j <= LM_SEGS; j++) pts.push({ x: b.x + cos(a) * b.r * (0.8 + j * 0.75), y: b.y + sin(a) * b.r * (0.8 + j * 0.75) });
      k.st.push({ a, pts, len: LM_SEGS, regrow: 0, sting: 0 });
    }
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2, T = g.T;
    k.bumpT = max(0, k.bumpT - dt); k.stunT = max(0, k.stunT - dt); b.hurtK = max(0, b.hurtK - dt * 1.5);
    // the bell pulses and drifts slowly after you
    b.pulse = 0.5 + 0.5 * sin(T * 2.1);
    const dx = p.x - b.x, dy = p.y - b.y, d = hypot(dx, dy) + 0.01;
    const want = k.stunT > 0 ? 0 : ps * (0.28 + 0.22 * max(0, sin(T * 2.1)));
    b.vx += ((dx / d) * want - b.vx) * min(1, dt * 1.2); b.vy += ((dy / d) * want - b.vy) * min(1, dt * 1.2);
    b.x += b.vx * dt; b.y += b.vy * dt; b.ang = atan2(b.vy, b.vx) || b.ang;
    if (hypot(b.x - p.x, b.y - p.y) > 1800) { b.x = p.x + dx / d * -700; b.y = p.y + dy / d * -700; }
    // strands: ropes hanging from the bell's rim, swaying, trailing a little behind its drift
    let stinging = false;
    const segL = b.r * 0.75;
    for (const S of k.st) {
      if (S.len < LM_SEGS) { S.regrow += dt; if (S.regrow > (ph2 ? 5 : 8)) { S.regrow = 0; S.len++; } }
      const sway = sin(T * 0.9 + S.a * 3) * 0.35, a = S.a + sway * 0.25;
      S.pts[0].x = b.x + cos(a) * b.r * 0.8; S.pts[0].y = b.y + sin(a) * b.r * 0.8;
      for (let j = 1; j <= LM_SEGS; j++) {
        const q = S.pts[j], pr = S.pts[j - 1];
        // rest direction: outwards, bent by the sway and by the bell's motion
        const tx = pr.x + cos(a + sway * j * 0.08) * segL - b.vx * 0.04 * j, ty = pr.y + sin(a + sway * j * 0.08) * segL - b.vy * 0.04 * j;
        q.x += (tx - q.x) * min(1, dt * 4); q.y += (ty - q.y) * min(1, dt * 4);
        const ux = q.x - pr.x, uy = q.y - pr.y, ud = hypot(ux, uy) + 0.01; q.x = pr.x + ux / ud * segL; q.y = pr.y + uy / ud * segL;
      }
      S.sting = max(0, S.sting - dt * 3);
      if (!S.touch) S.chew = max(0, (S.chew || 0) - dt); S.touch = false;
      if (g.dead) continue;
      // touching a live strand stings; biting it cuts it there
      for (let j = 1; j <= S.len; j++) {
        const q = S.pts[j], pr = S.pts[j - 1];
        if (segDist(p.x, p.y, pr.x, pr.y, q.x, q.y) < p.r * 0.8 + b.r * 0.12) {
          stinging = true; S.sting = 1; S.chew = (S.chew || 0) + dt; S.touch = true;
          // chewing through a strand takes a moment (and stings); a spiny ball or a dash cuts straight through
          if (p.puffK > 0.5 || p.dashT > 0 || S.chew > 0.45) { S.len = j - 1; S.regrow = 0; S.chew = 0; g.sparkle(q.x, q.y, [255, 170, 120], 6); g.sfx('gulp', { vol: 0.5 }); g.gainXP(0.4 * g.df(), false); }
          break;
        }
      }
    }
    if (stinging) {
      const proof = 1 - 0.3 * (p.muts.stingproof | 0);
      g.hurt(16 * dt * max(0.1, proof), null, { dot: true, why: "Lion's mane sting" });
      b.stingK = 1;
    } else b.stingK = max(0, b.stingK - dt * 2);
    if (g.dead) return;
    // the bell
    if (d < b.r * 0.9 + p.r * 0.8) {
      if (b.biteCd <= 0) {
        b.biteCd = k.stunT > 0 ? 0.45 : 0.75; b.hurtK = 1;
        g.bossHit(k.stunT > 0 ? 0.075 : 0.05, (p.x + b.x) / 2, (p.y + b.y) / 2);
        if (!b.alive) return;
        if (k.stunT <= 0) { b.vx -= dx / d * 260; b.vy -= dy / d * 260; } // it pulses away
      }
      const pen = b.r * 0.9 + p.r * 0.8 - d; p.x += dx / d * pen * 0.5; p.y += dy / d * pen * 0.5;
    }
  },
  // a breach landing near it rips through every strand in reach and stuns the bell
  breachAny(g, b, k, R) {
    const p = g.p; let cut = 0;
    for (const S of k.st) for (let j = 1; j <= S.len; j++) { const q = S.pts[j]; if (hypot(q.x - p.x, q.y - p.y) < R) { S.len = j - 1; S.regrow = 0; cut++; break; } }
    if (hypot(b.x - p.x, b.y - p.y) < R + b.r) { k.stunT = 3; b.hurtK = 1; g.bossHit(0.05, b.x, b.y, { raw: true, knock: false, text: 'Stunned!', tc: '#ffd0b0', c: [255, 200, 160] }); g.hint('boss_mane2', 'Stunned! Bite the bell', 'target', 2200); }
    else if (cut) g.texts.push({ x: p.x, y: p.y - p.r * 2, s: 'Strands torn!', life: 1, c: '#ffd0b0' });
  },
  under(g, ctx, z, inView, sc) {
    const b = g.boss, k = b.k, T = g.T, art = CREATURE_ART.lionsmane, H = art ? artH(b.r * 0.12 * sc, art.col) : null;
    ctx.lineCap = 'round';
    for (const S of k.st) {
      for (let j = 1; j <= LM_SEGS; j++) {
        const q = S.pts[j], pr = S.pts[j - 1], live = j <= S.len;
        if (!inView(q.x, q.y, b.r)) continue;
        if (art && art.tentacle) { art.tentacle(ctx, pr.x, pr.y, q.x, q.y, T + S.a, H, live ? 0.6 + 0.4 * S.sting : 0); continue; }
        ctx.beginPath(); ctx.moveTo(pr.x, pr.y); ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = live ? `rgba(255,${150 + 60 * S.sting},110,0.7)` : 'rgba(150,90,70,0.25)'; ctx.lineWidth = (live ? 5 : 2) / z; ctx.stroke();
      }
    }
  },
  over(g, ctx, z) { const b = g.boss, k = b.k; if (k.stunT > 0) glow(ctx, b.x, b.y, b.r * 1.3, [150, 255, 200], 0.2 + 0.12 * sin(g.T * 9)); },
};

// ===================================================================================== Sea lion gang
// Young sea lions are fast, clever and playful, and they love to bite the fins off sunfish. The gang darts in
// one at a time to nip you (each nip slows you down), then rolls away showing off. Bite one mid-roll, or stun
// the gang: a Breach landing in their midst, a spiny Inflate or a Bill Slash all leave them dazed.
const GANG = 4, SL_HITS = 4;
BOSS_KIT.sealions = {
  r: (p) => 26 + p.r * 0.85,
  fixed: true, chip: 0.08, phaseAt: [0.5], phaseText: ['Bolder: two at a time'],
  hint: ['bolt', 'They dart in to nip your fins. Bite one as it rolls away, or Breach to stun the whole gang'],
  spawn(g, b, k) {
    const p = g.p; k.sq = [b];
    for (let i = 1; i < GANG; i++) {
      const a = atan2(b.y - p.y, b.x - p.x) + i * 0.6, R = hypot(b.x - p.x, b.y - p.y);
      k.sq.push({ kind: 'sealion', x: p.x + cos(a) * R, y: p.y + sin(a) * R, vx: 0, vy: 0, ang: a + PI, r: b.r * (0.9 + random() * 0.15), seed: random() * 10, t: random() * 5, alive: true });
    }
    k.total = GANG * SL_HITS;
    for (const q of k.sq) Object.assign(q, { hits: SL_HITS, st: 'circle', stT: 0, orb: atan2(q.y - p.y, q.x - p.x), sprintK: 0, biteK: 0, biteCd: 0, wb: 0, flash: 0, hit: false });
    k.dartT = 2; k.bumpT = 0;
  },
  tick(g, b, k, dt) {
    const p = g.p, ps = g.pTop(), ph2 = b.phase >= 2, T = g.T;
    k.bumpT = max(0, k.bumpT - dt);
    const live = k.sq.filter((q) => q.alive !== false);
    k.dartT -= dt;
    if (k.dartT <= 0 && !g.dead) {
      const ready = live.filter((q) => q.st === 'circle');
      for (let i = 0; i < (ph2 ? 2 : 1) && ready.length; i++) { const q = ready.splice((random() * ready.length) | 0, 1)[0]; q.st = 'eye'; q.stT = 0.45; }
      k.dartT = ph2 ? 1.3 : 1.7;
    }
    for (const q of live) {
      q.t = (q.t || 0) + dt; q.biteCd = max(0, q.biteCd - dt); q.flash = max(0, (q.flash || 0) - dt * 4);
      const dx = p.x - q.x, dy = p.y - q.y, d = hypot(dx, dy) + 0.01;
      let tx = 0, ty = 0, sp = 0, sk = 3;
      switch (q.st) {
        case 'circle': {
          q.orb += dt * (0.9 + 0.2 * sin(q.seed)) * (q.seed > 5 ? 1 : -1);
          const R = 230 + q.r * 2 + 60 * sin(T * 1.3 + q.seed);
          const gx = p.x + cos(q.orb) * R - q.x, gy = p.y + sin(q.orb) * R - q.y, gd = hypot(gx, gy) + 0.01;
          tx = gx / gd; ty = gy / gd; sp = min(ps * 1.5, gd * 3); q.ang = turn(q.ang, atan2(q.vy, q.vx), dt * 5);
          break;
        }
        case 'eye': // it eyes you up: the dart is coming
          q.stT -= dt; q.vx *= exp(-dt * 4); q.vy *= exp(-dt * 4); q.ang = turn(q.ang, atan2(dy, dx), dt * 8);
          if (q.stT <= 0) { q.st = 'dart'; q.stT = 0.55; q.hit = false; q.da = atan2(dy + p.vy * 0.2, dx + p.vx * 0.2); g.sfx('dash', { vol: 0.25 }); }
          break;
        case 'dart': {
          q.stT -= dt; tx = cos(q.da); ty = sin(q.da); sp = ps * 2.6; sk = 9; q.ang = turn(q.ang, q.da, dt * 8); q.sprintK = 1;
          if (!q.hit && !g.dead && d < q.r + p.r * 0.9) {
            q.hit = true; q.biteK = 1;
            if (p.puffK > 0.5) { q.st = 'dazed'; q.stT = 2.2; q.wb = 0; this.hitSeal(g, b, k, q, 0.4, 'Spiked!'); continue; }
            if (g.hurt(14, q, { why: 'Sea lion nip', iframes: 0.4 })) { p.slowT = 2; g.texts.push({ x: p.x, y: p.y - p.r * 1.6, s: 'Fin nipped!', life: 1, c: '#ffc8a0' }); }
          }
          if (q.stT <= 0) { q.st = 'roll'; q.stT = ph2 ? 0.8 : 1.0; q.wb = 0; }
          break;
        }
        case 'roll': // a playful barrel roll after the nip: open to a bite
          q.stT -= dt; q.vx *= exp(-dt * 2.2); q.vy *= exp(-dt * 2.2); q.ang += dt * 5;
          if (q.stT <= 0) { q.st = 'circle'; q.orb = atan2(q.y - p.y, q.x - p.x); }
          break;
        case 'dazed':
          q.stT -= dt; q.vx *= exp(-dt * 2); q.vy *= exp(-dt * 2); q.ang += sin(T * 3 + q.seed) * dt;
          if (q.stT <= 0) { q.st = 'circle'; q.orb = atan2(q.y - p.y, q.x - p.x); }
          break;
      }
      if (q.st === 'circle' || q.st === 'dart') sqSteer(q, tx, ty, sp, sk, dt);
      if (q.st !== 'dart') q.sprintK = max(0, q.sprintK - dt * 3);
      q.biteK = max(0, q.biteK - dt * 3);
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (!Number.isFinite(q.x) || hypot(q.x - p.x, q.y - p.y) > 2000) { const a = random() * TAU; q.x = p.x + cos(a) * 600; q.y = p.y + sin(a) * 600; q.vx = q.vy = 0; }
      if (g.dead || !b.alive) continue;
      if (d < q.r * 0.95 + p.r * 0.8) {
        if (q.st === 'roll' || q.st === 'dazed') { if (q.biteCd <= 0 && q.wb < (q.st === 'dazed' ? 2 : 1)) { q.biteCd = 0.5; q.wb++; this.hitSeal(g, b, k, q, g.biteK(), null); } }
        else if (q.st === 'circle' && k.bumpT <= 0) { k.bumpT = 1.2; g.texts.push({ x: p.x, y: p.y - p.r * 1.5, s: 'Too quick!', life: 0.8, c: '#cfd8e8' }); }
      }
    }
  },
  hitSeal(g, b, k, q, n, text) {
    const ox = q.x, oy = q.y;
    g.bossHit(n / k.total, q.x, q.y, { raw: true, text, tc: '#ffd8b8', c: [255, 210, 170] });
    q.hits -= n; q.flash = 1;
    if (!b.alive || q.hits > 0.01) return;
    g.texts.push({ x: ox, y: oy - q.r, s: 'Gave up!', life: 1, c: '#e8d8c8' }); g.sfx('bubble');
    if (q === b) {
      const rest = k.sq.filter((o) => o !== b && o.alive !== false); if (!rest.length) return;
      const o = rest.reduce((a, c) => (hypot(c.x - ox, c.y - oy) < hypot(a.x - ox, a.y - oy) ? c : a));
      for (const key of ['x', 'y', 'vx', 'vy', 'ang', 'r', 'seed', 't', 'hits', 'st', 'stT', 'orb', 'sprintK', 'biteK', 'biteCd', 'wb', 'hit', 'da']) b[key] = o[key];
      o.alive = false;
    } else q.alive = false;
    k.sq = k.sq.filter((o) => o.alive !== false);
  },
  stunNear(g, b, k, x, y, R, text) {
    let n = 0;
    for (const q of k.sq) if (q.alive !== false && hypot(q.x - x, q.y - y) < R + q.r) { q.st = 'dazed'; q.stT = 2.4; q.wb = 0; q.flash = 1; n++; }
    if (n) { g.texts.push({ x, y: y - 40, s: text, life: 1.2, c: '#ffe0c0' }); g.hint('boss_seal2', 'Dazed! Bite them now', 'target', 2400); }
  },
  breachAny(g, b, k, R) { this.stunNear(g, b, k, g.p.x, g.p.y, R, 'Splashed!'); },
  slashAny(g, b, k, R, half) {
    const p = g.p; let n = 0;
    for (const q of k.sq) { if (q.alive === false) continue; const ux = q.x - p.x, uy = q.y - p.y, ud = hypot(ux, uy); if (ud < R + q.r && abs(ad(p.ang, atan2(uy, ux))) < half + q.r / max(ud, 1)) { q.st = 'dazed'; q.stT = 2; q.wb = 0; q.flash = 1; n++; } }
    if (n) { g.texts.push({ x: p.x, y: p.y - p.r * 2, s: 'Slashed!', life: 1, c: '#ffe0c0' }); g.hint('boss_seal2', 'Dazed! Bite them now', 'target', 2400); }
  },
  over(g, ctx, z, inView, sc) {
    const b = g.boss, k = b.k, T = g.T;
    for (const q of k.sq) { if (q === b || q.alive === false || !inView(q.x, q.y, q.r * 3)) continue; drawFake(ctx, q, T, sc); }
    for (const q of k.sq) {
      if (q.alive === false || !inView(q.x, q.y, q.r * 3)) continue;
      if (q.st === 'eye') { glow(ctx, q.x, q.y, q.r * 2, [255, 120, 80], 0.3 + 0.2 * sin(T * 26)); ctx.font = `900 ${Math.round(24 / z)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,150,110,0.9)'; ctx.fillText('!', q.x, q.y - q.r * 1.6); }
      else if (q.st === 'roll' || q.st === 'dazed') glow(ctx, q.x, q.y, q.r * 1.6, [150, 255, 200], 0.2 + 0.1 * sin(T * 9));
    }
  },
};

// ===================================================================================== engine glue (mixin)
export const Bosses = {
  pTop() { return D.baseSpeed(this.p.r) * this.speedMult; },
  // how hard your bites land on a boss: jaws, eyes, enzymes and a dash all help
  biteK() { const p = this.p; return (1 + 0.1 * (p.muts.lysosome | 0)) * (1 + 0.12 * (p.muts.beak | 0)) * Math.pow(this.biteMult || 1, 0.35) * (p.dashT > 0 ? 1.25 : 1); },
  kitSpawn(b) {
    const K = b.kit, p = this.p;
    b.k = {}; b.ax = p.x; b.ay = p.y; b.biteCd = 0; b.phase = 1; b.tele = 0;
    K.spawn(this, b, b.k);
    if (K.hint) this.later(1600, () => { if (this.boss === b) this.hint('boss_' + b.bossId, K.hint[1], K.hint[0], 6500); });
  },
  kitTick(b, dt) {
    const K = b.kit, k = b.k, p = this.p;
    b.biteCd = max(0, b.biteCd - dt); b.tele = max(0, (b.tele || 0) - dt * 2);
    // a current keeps the fight together
    const ux = p.x - b.ax, uy = p.y - b.ay, ud = hypot(ux, uy) + 0.01, R = K.arena || 900;
    if (ud > R && !this.dead) { const f = (ud - R) * 6 * dt; p.vx -= ux / ud * f; p.vy -= uy / ud * f; }
    K.tick(this, b, k, dt);
    if (!b.alive || this.boss !== b) return;
    if (K.phaseAt) {
      while (b.phase - 1 < K.phaseAt.length && b.hp < b.maxHp * K.phaseAt[b.phase - 1]) {
        b.phase++;
        this.banner(b.B.name, K.phaseText[b.phase - 2] || 'It grows desperate', 'danger');
        this.sfx('boss'); this.shake = 14; this.flash = 0.4; this.buzz([60, 40, 60]);
        this.burst(b.x, b.y, [255, 170, 150], 30, 300);
      }
    }
    if (!K.fixed) {
      const bv = hypot(b.vx, b.vy), vmax = 1100;
      if (bv > vmax) { b.vx *= vmax / bv; b.vy *= vmax / bv; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || hypot(b.x - p.x, b.y - p.y) > 2200) {
        const a = Number.isFinite(b.x) ? atan2(b.y - p.y, b.x - p.x) : random() * TAU, rr = this.viewR() * 0.9;
        b.x = p.x + cos(a) * rr; b.y = p.y + sin(a) * rr; b.vx = 0; b.vy = 0;
      }
    }
    if (!Number.isFinite(b.ang)) b.ang = 0;
  },
  bossHit(frac, x, y, o = {}) {
    const b = this.boss; if (!b || !b.alive) return 0;
    const n = b.maxHp * frac * (o.raw ? 1 : this.biteK());
    b.hp -= n; b.flash = 1;
    this.burst(x, y, o.c || [255, 240, 140], 16, 220);
    this.sfx('gulp'); this.sfx('hit'); this.buzz(30); this.shake = min(14, this.shake + 7);
    if (o.text) this.texts.push({ x, y: y - 26, s: o.text, life: 1.3, c: o.tc || '#ffe28a' });
    this.texts.push({ x, y: y - 6, s: '-' + Math.round(frac * (o.raw ? 1 : this.biteK()) * 100) + '%', life: 1, c: '#ffe28a' });
    if (o.knock !== false) { const p = this.p, na = atan2(p.y - y, p.x - x); p.vx = cos(na) * 360; p.vy = sin(na) * 360; p.iframes = max(p.iframes, 0.3); }
    if (b.hp <= 0) this.bossDie();
    return n;
  },
  kitEat(e) { const b = this.boss; if (b && b.alive && b.kit && b.kit.eat) b.kit.eat(this, b, b.k, e); },
  kitDie(b) { if (b.kit && b.kit.die) b.kit.die(this, b, b.k); },
  kitDraw(layer, ctx, z, inView) {
    const b = this.boss; if (!b || !b.alive || !b.kit || !b.k) return;
    const fn = b.kit[layer]; if (fn) fn(this, ctx, z, inView, this.dpr * z);
  },
  kitScreen(ctx, W, H) { const b = this.boss; if (b && b.alive && b.kit && b.kit.screen) b.kit.screen(this, ctx, W, H); },
};
