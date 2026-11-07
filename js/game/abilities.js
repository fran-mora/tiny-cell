// Abilities you trigger with a button. The cell has two (Enzyme Burst, Toxin Nova); the fish bodies add
// what real fish use: a photophore flash that blinds, a shoal of decoys, suction feeding, and the
// pufferfish's trick of inflating into a spiny ball.
import { SP } from './ecology.js';
import { glowSprite } from './art.js';

const { sin, cos, atan2, hypot, min, max, random, PI, exp } = Math;
const TAU = PI * 2;
const ad = (a, b) => { const d = b - a; if (!Number.isFinite(d)) return 0; return ((d + PI) % TAU + TAU) % TAU - PI; };

// cdKey: where the cooldown lives on the player; key: keyboard shortcut; col: cooldown ring colour
export const ABILITIES = [
  { id: 'dash', cdKey: 'dashCd', cd: (l) => 6 - 0.8 * (l - 1), col: '#8cf5d0', key: ' ', use: 'useDash' },
  { id: 'nova', cdKey: 'novaCd', cd: (l) => 15 - 2 * (l - 1), col: '#c79cff', key: 'e', use: 'useNova' },
  { id: 'photo', cdKey: 'photoCd', cd: (l) => 14 - 2 * (l - 1), col: '#9fdcff', key: 'q', use: 'usePhoto' },
  { id: 'shoal', cdKey: 'shoalCd', cd: (l) => 18 - 2 * (l - 1), col: '#ffd79a', key: 'r', use: 'useShoal' },
  { id: 'suction', cdKey: 'suckCd', cd: (l) => 10 - 1.5 * (l - 1), col: '#a8ffd8', key: 'f', use: 'useSuction' },
  { id: 'puff', cdKey: 'puffCd', cd: (l) => 13 - 1.5 * (l - 1), col: '#ffd58a', key: 'g', use: 'usePuff' },
];
export const ABILITY_BY_ID = Object.fromEntries(ABILITIES.map((a) => [a.id, a]));

const HINTED = new Set(); // explain each new ability once per session
const once = (g, id, text, ic) => { if (HINTED.has(id)) return; HINTED.add(id); g.hint('ab_' + id, text, ic, 3000); };
const suckCone = (p) => ({ L: p.r * (5 + (p.muts.suction | 0)) + 120, half: 0.55 + 0.1 * (p.muts.suction | 0) });

export const Abilities = {
  // Photophore Flash: a burst of light from your light organs. Everything nearby is dazzled: it stops, loses
  // track of you and lets go; camouflaged hunters show up; and deep-sea eyes (the Anglerfish's) are blinded.
  usePhoto() {
    const p = this.p, lv = p.muts.photo | 0;
    if (!lv || p.photoCd > 0 || this.dead || this.modal) return;
    p.photoCd = ABILITY_BY_ID.photo.cd(lv);
    const R = p.r * 6 + 140 + 30 * lv, dazzle = 2 + 0.5 * lv;
    (this.glows = this.glows || []).push({ x: p.x, y: p.y, r: R * 0.75, life: 1.4, max: 1.4, flash: true });
    (this.rings = this.rings || []).push({ x: p.x, y: p.y, r: 0, R, life: 0.6, c: [170, 225, 255] });
    this.flash = 0.55; this.shake = min(10, this.shake + 4);
    for (const e of this.ents) {
      if (!e.alive || e.ally || e.boss) continue;
      if (hypot(e.x - p.x, e.y - p.y) > R + e.r) continue;
      e.blind = max(e.blind || 0, dazzle); e.stun = max(e.stun || 0, 0.8);
      e.tele = 0; e.lunge = 0; e.snapT = 0; e.out = 0; // wind-ups are cancelled
      if (e.latched) { e.latched = false; p.latched--; const a = atan2(e.y - p.y, e.x - p.x); e.vx = cos(a) * 260; e.vy = sin(a) * 260; }
      if (SP[e.kind] && SP[e.kind].camo) { e.vis = 1; e.lcd = max(e.lcd || 0, dazzle); }
    }
    p.latched = max(0, p.latched);
    const b = this.boss;
    if (b && b.alive && b.kit && b.kit.flashAny) b.kit.flashAny(this, b, b.k, R); // a pack checks each member itself
    else if (b && b.alive && b.kit && b.kit.flash && hypot(b.x - p.x, b.y - p.y) < R + b.r) b.kit.flash(this, b, b.k);
    this.sfx('event'); this.sfx('boss', { vol: 0.2 }); this.buzz([15, 20, 15]);
    this.abFlash('photo');
    once(this, 'photo', 'Flash! Nearby animals are dazzled and lose track of you', 'eye');
  },

  // Shoal Call: a scent burst gathers a little school of fish around you. Predators go for them instead.
  useShoal() {
    const p = this.p, lv = p.muts.shoal | 0;
    if (!lv || p.shoalCd > 0 || this.dead || this.modal) return;
    p.shoalCd = ABILITY_BY_ID.shoal.cd(lv);
    const n = 3 + 2 * lv, kind = (p.stage | 0) >= 5 ? 'sardine' : 'larvalfish', life = 4 + lv;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + random() * 0.3;
      const e = this.spawn(kind, p.x + cos(a) * p.r * 1.6, p.y + sin(a) * p.r * 1.6, { force: true, r: p.r * (0.48 + random() * 0.12) });
      if (!e) continue;
      Object.assign(e, { ally: true, decoy: life, decoyMax: life, orb: a, spawnFade: 0.3, ctl: { tx: 0, ty: 0, sp: 0, steer: 5 } });
      e.vx = cos(a) * 220; e.vy = sin(a) * 220;
    }
    this.sparkle(p.x, p.y, [255, 225, 160], 14);
    this.sfx('bubble'); this.sfx('event', { vol: 0.4 }); this.buzz(15);
    this.abFlash('shoal');
    once(this, 'shoal', 'Predators chase your decoy school instead of you', 'fish');
  },

  // Suction Feeding: a fish opens its mouth so fast it vacuums in the water in front of it, food and all.
  useSuction() {
    const p = this.p, lv = p.muts.suction | 0;
    if (!lv || p.suckCd > 0 || this.dead || this.modal) return;
    p.suckCd = ABILITY_BY_ID.suction.cd(lv);
    p.suckT = 0.75; p.suckA = p.ang;
    this.sfx('gulp'); this.sfx('bubble', { vol: 0.6 }); this.buzz(12);
    this.abFlash('suction');
    once(this, 'suction', 'Gulp! Everything small in front of you gets sucked in', 'fish');
  },

  // Inflate: a pufferfish gulps water and swells into a spiny ball. Nothing can swallow, grab or latch onto it,
  // biters are spiked, other damage is halved; but it can barely swim and can't eat until it deflates.
  usePuff() {
    const p = this.p, lv = p.muts.puff | 0;
    if (!lv || p.puffCd > 0 || this.dead || this.modal) return;
    p.puffCd = ABILITY_BY_ID.puff.cd(lv); p.puffT = 2.5 + 0.5 * lv;
    // whatever was holding on is pushed off as you swell
    for (const e of this.ents) {
      if (!e.alive || e.ally || e.boss) continue;
      if (e.latched) { e.latched = false; const a = atan2(e.y - p.y, e.x - p.x); e.vx = cos(a) * 300; e.vy = sin(a) * 300; e.stun = max(e.stun || 0, 0.6); }
    }
    p.latched = 0;
    const b = this.boss;
    if (b && b.alive && b.kit && b.kit.puff) b.kit.puff(this, b, b.k);
    this.sparkle(p.x, p.y, [255, 235, 170], 10);
    this.sfx('gulp'); this.sfx('bubble', { vol: 0.8 }); this.buzz([10, 30, 20]);
    this.abFlash('puff');
    once(this, 'puff', 'Puffed up! Biters get spiked and nothing can swallow you, but you can\u2019t eat', 'shield');
  },

  // a predator prefers a nearby decoy fish to you
  lureFor(e, pd) {
    let best = null, bd = 520;
    for (const q of this.decoys) { if (!q.alive) continue; const d = hypot(q.x - e.x, q.y - e.y); if (d < bd) { bd = d; best = q; } }
    return best && bd < pd * 1.25 + 40 ? best : null;
  },

  updateActives(dt) {
    const p = this.p;
    // inflation: swell fast, deflate a little slower; your collision size follows the balloon
    if (p.puffT > 0) p.puffT -= dt;
    const want = p.puffT > 0 ? 1 : 0, wasK = p.puffK || 0;
    p.puffK = wasK + (want - wasK) * (1 - exp(-dt * (want ? 9 : 5)));
    if (p.puffK < 0.002 && !want) p.puffK = 0;
    if (p.r0) p.r = p.r0 * (1 + 0.55 * p.puffK);
    // decoy school: swirls around you, then scatters away when its time is up
    let decoys = null;
    for (const e of this.ents) {
      if (!e.alive || !e.decoy) continue;
      e.decoy -= dt;
      if (e.decoy <= 0) { e.alive = false; this.sparkle(e.x, e.y, [255, 225, 160], 4); continue; }
      (decoys || (decoys = [])).push(e);
      e.orb += dt * 1.6;
      const leaving = e.decoy < 1.2, R = p.r * (2.2 + 0.6 * sin(e.orb * 1.7 + e.seed));
      const gx = leaving ? e.x + cos(e.orb) * 400 : p.x + cos(e.orb) * R, gy = leaving ? e.y + sin(e.orb) * 400 : p.y + sin(e.orb) * R;
      const ux = gx - e.x, uy = gy - e.y, ud = hypot(ux, uy) + 0.01;
      e.ctl.tx = ux / ud; e.ctl.ty = uy / ud; e.ctl.sp = min(ud * 4, 260 + p.r * 4); e.ctl.steer = 6;
      if (leaving) e.spawnFade = min(e.spawnFade, e.decoy / 1.2);
    }
    this.decoys = decoys;
    // suction: everything small in the cone in front of your mouth is pulled in
    if (p.suckT > 0) {
      p.suckT -= dt;
      const { L, half } = suckCone(p), a0 = p.ang;
      const mx = p.x + cos(a0) * p.r * 0.9, my = p.y + sin(a0) * p.r * 0.9;
      const inCone = (x, y) => { const ux = x - mx, uy = y - my, ud = hypot(ux, uy) + 0.01; return ud < L && Math.abs(ad(a0, atan2(uy, ux))) < half ? ud : 0; };
      const pull = (o, ud, s) => { const k = min(1, s * dt / ud); o.x += (mx - o.x) * k; o.y += (my - o.y) * k; };
      for (const m of this.motes) { const ud = inCone(m.x, m.y); if (ud) pull(m, ud, 900 + p.r * 10); }
      for (const e of this.ents) {
        if (!e.alive || e.ally || e.boss || !e.edibleCache) continue;
        const ud = inCone(e.x, e.y); if (!ud) continue;
        e.stun = max(e.stun || 0, 0.4); pull(e, ud, 520 + p.r * 6);
      }
    }
  },

  drawActives(ctx, z) {
    const p = this.p, T = this.T;
    if (p.suckT > 0) {
      const { L, half } = suckCone(p), a0 = p.ang, k = min(1, p.suckT / 0.25);
      const mx = p.x + cos(a0) * p.r * 0.9, my = p.y + sin(a0) * p.r * 0.9;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.arc(mx, my, L, a0 - half, a0 + half); ctx.closePath();
      ctx.fillStyle = `rgba(170,255,220,${0.07 * k})`; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const a = a0 + (((i * 0.618) % 1) - 0.5) * 2 * half, u = 1 - ((T * 1.8 + i * 0.37) % 1), r0 = L * u, r1 = r0 - 50 - p.r;
        if (r1 < p.r * 0.5) continue;
        ctx.moveTo(mx + cos(a) * r0, my + sin(a) * r0); ctx.lineTo(mx + cos(a) * r1, my + sin(a) * r1);
      }
      ctx.strokeStyle = `rgba(210,255,240,${0.55 * k})`; ctx.lineWidth = 2.5 / z; ctx.lineCap = 'round'; ctx.stroke();
    }
    // a faint gold shimmer marks your decoy fish
    if (this.decoys) {
      ctx.globalCompositeOperation = 'lighter';
      for (const e of this.decoys) { ctx.globalAlpha = 0.25 * (e.spawnFade ?? 1); const r = e.r * 2.2; ctx.drawImage(glowSprite([255, 220, 150]), e.x - r, e.y - r, r * 2, r * 2); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  },
};
