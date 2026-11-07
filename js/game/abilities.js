// Abilities you trigger with a button. The cell has two (Enzyme Burst, Toxin Nova); the fish bodies add
// what real fish use: a photophore flash that blinds, a shoal of decoys, suction feeding, and the
// pufferfish's trick of inflating into a spiny ball.
import { SP } from './ecology.js';
import { glowSprite } from './art.js';

const { sin, cos, atan2, hypot, min, max, random, PI, exp, abs } = Math;
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
  { id: 'slash', cdKey: 'slashCd', cd: (l) => 7 - 0.8 * (l - 1), col: '#8fd0ff', key: 'c', use: 'useSlash' },
  { id: 'breach', cdKey: 'breachCd', cd: (l) => 12 - 1.5 * (l - 1), col: '#bfe9ff', key: 'x', use: 'useBreach' },
  { id: 'sense', cdKey: 'senseCd', cd: (l) => 15 - 2 * (l - 1), col: '#d2b8ff', key: 'v', use: 'useSense' },
  { id: 'filter', cdKey: 'filterCd', cd: (l) => 12 - 1.5 * (l - 1), col: '#b8f0ff', key: 'b', use: 'useFilter' },
];
const senseR = (p) => (p.r0 || p.r) * 8 + 420;
const filterCone = (p) => { const g = 1 + 0.15 * (p.muts.gillrakers | 0); return { L: ((p.r0 || p.r) * 4.5 + 260) * g, half: 0.75 }; };
const BREACH_T = 0.95; // time in the air
const breachR = (p) => (p.r0 || p.r) * 5 + 80;
const SLASH_T = 0.32; // how long the swipe lasts
const slashArc = (p) => ({ R: (p.r0 || p.r) * 3.4 + 50, half: 1.15 });
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

  // Bill Slash: a sailfish whips its bill sideways through a shoal, stunning and injuring the fish it hits.
  useSlash() {
    const p = this.p, lv = p.muts.slash | 0;
    if (!lv || p.slashCd > 0 || this.dead || this.modal) return;
    p.slashCd = ABILITY_BY_ID.slash.cd(lv); p.slashT = SLASH_T; p.slashDir = -(p.slashDir || 1);
    const { R, half } = slashArc(p), st = p.muts.stripes | 0, sf = this.stageHit();
    let hits = 0;
    for (const e of this.ents) {
      if (!e.alive || e.ally || e.boss) continue;
      const ux = e.x - p.x, uy = e.y - p.y, ud = hypot(ux, uy);
      if (ud > R + e.r || abs(ad(p.ang, atan2(uy, ux))) > half + e.r / max(ud, 1)) continue;
      this.damage(e, e.maxHp * (0.3 + 0.1 * lv) / sf, p, true);
      e.stun = max(e.stun || 0, 1.2 + 0.4 * st); e.flash = 1;
      const sa = p.ang + p.slashDir * PI / 2; e.vx += cos(sa) * 260; e.vy += sin(sa) * 260;
      if (e.latched) { e.latched = false; p.latched = max(0, p.latched - 1); }
      hits++;
    }
    const b = this.boss;
    if (b && b.alive && b.kit && b.kit.slashAny) b.kit.slashAny(this, b, b.k, R, half); // packs check every member
    else if (b && b.alive) {
      const ux = b.x - p.x, uy = b.y - p.y, ud = hypot(ux, uy);
      if (ud < R + b.r && abs(ad(p.ang, atan2(uy, ux))) < half + b.r / max(ud, 1)) { if (b.kit && b.kit.slash) b.kit.slash(this, b, b.k); else this.bossDamage(40 + 15 * lv); }
    }
    if (st) p.stripeT = 0.8;
    this.sfx('dash', { vol: 0.6 }); this.sfx('hit', { pitch: 1.4 }); this.buzz(hits ? [15, 20, 25] : 12); this.shake = min(10, this.shake + (hits ? 4 : 1));
    this.abFlash('slash');
    once(this, 'slash', 'Slash! Everything in front of your bill is stunned', 'bolt');
  },

  // Breach: an ocean sunfish leaps clear of the water and crashes back down. In the air nothing can touch you;
  // the landing is a shock wave that stuns and hurts everything around.
  useBreach() {
    const p = this.p, lv = p.muts.breach | 0;
    if (!lv || p.breachCd > 0 || p.breachT > 0 || this.dead || this.modal) return;
    p.breachCd = ABILITY_BY_ID.breach.cd(lv); p.breachT = BREACH_T; p.iframes = max(p.iframes, BREACH_T + 0.2);
    for (const e of this.ents) if (e.latched) { e.latched = false; e.stun = max(e.stun || 0, 0.6); }
    p.latched = 0;
    this.burst(p.x, p.y, [210, 240, 255], 18, 220); this.sfx('dash', { vol: 0.5 }); this.sfx('bubble'); this.buzz(15);
    this.abFlash('breach');
    once(this, 'breach', 'Breach! Nothing can touch you in the air, and the landing stuns everything around', 'bolt');
  },
  breachLand() {
    const p = this.p, lv = p.muts.breach | 0 || 1, R = breachR(p), sf = this.stageHit();
    (this.rings = this.rings || []).push({ x: p.x, y: p.y, r: 0, R, life: 0.6, c: [210, 240, 255] });
    this.shake = min(18, this.shake + 12); this.flash = 0.3;
    for (const e of this.ents) {
      if (!e.alive || e.ally || e.boss) continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = hypot(dx, dy) + 0.01;
      if (d > R + e.r) continue;
      if (e.latched) { e.latched = false; p.latched = max(0, p.latched - 1); }
      this.damage(e, e.maxHp * (0.25 + 0.08 * lv) / sf, p, true);
      e.stun = max(e.stun || 0, 1.5); e.vx += dx / d * 380; e.vy += dy / d * 380;
    }
    const b = this.boss;
    if (b && b.alive && hypot(b.x - p.x, b.y - p.y) < R + b.r) { if (b.kit && b.kit.breach) b.kit.breach(this, b, b.k, R); else this.bossDamage(60 + 20 * lv); }
    if (b && b.alive && b.kit && b.kit.breachAny) b.kit.breachAny(this, b, b.k, R);
    for (let i = 0; i < 26; i++) { const a = random() * PI * 2, v = 160 + random() * 260; this.part(p.x, p.y, cos(a) * v, sin(a) * v, 0.7, [220, 245, 255], 2 + random() * 4); }
    this.sfx('hit', { pitch: 0.6 }); this.sfx('bubble', { vol: 0.8 }); this.buzz([30, 30, 40]);
  },

  // Electrosense: sharks feel the faint electric field of beating hearts and working muscles through jelly-filled
  // pores on the snout (the ampullae of Lorenzini). For a few seconds you sense everything around you: hidden
  // animals show up, every heartbeat is marked, and your bites find the weak spots.
  useSense() {
    const p = this.p, lv = p.muts.sense | 0;
    if (!lv || p.senseCd > 0 || this.dead || this.modal) return;
    p.senseCd = ABILITY_BY_ID.sense.cd(lv); p.senseT = 4 + lv; p.senseMax = p.senseT;
    (this.rings = this.rings || []).push({ x: p.x, y: p.y, r: 0, R: senseR(p), life: 0.9, c: [210, 180, 255] });
    this.revealSensed();
    const b = this.boss;
    if (b && b.alive && b.kit && b.kit.sense) b.kit.sense(this, b, b.k);
    this.sfx('event', { vol: 0.5 }); this.sfx('tick'); this.buzz([10, 40, 10]);
    this.abFlash('sense');
    once(this, 'sense', 'Electrosense! You feel every heartbeat around you, and your bites hit harder', 'eye');
  },
  revealSensed() {
    const p = this.p, R = senseR(p);
    for (const e of this.ents) if (e.alive && !e.ally && SP[e.kind] && SP[e.kind].camo && hypot(e.x - p.x, e.y - p.y) < R + e.r) { e.vis = 1; e.lcd = max(e.lcd || 0, 1); }
  },

  // Filter Feeding: a whale shark opens its mouth wide and swims, sieving everything small from the water
  useFilter() {
    const p = this.p, lv = p.muts.filter | 0;
    if (!lv || p.filterCd > 0 || this.dead || this.modal) return;
    p.filterCd = ABILITY_BY_ID.filter.cd(lv); p.filterT = 2.5 + 0.5 * lv; p.filterMax = p.filterT;
    this.sfx('gulp'); this.sfx('bubble', { vol: 0.8 }); this.buzz(15);
    this.abFlash('filter');
    once(this, 'filter', 'Mouth wide open! Everything small in front of you is sucked in', 'fish');
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
    if (p.r0) p.r = p.r0 * (1 + ((p.stage | 0) === 6 ? 0.55 : 0) * p.puffK); // only a pufferfish actually swells
    // electrosense: the sense fades; hidden hunters stay revealed while it lasts
    if (p.senseT > 0) { p.senseT -= dt; p.senseRev = (p.senseRev || 0) - dt; if (p.senseRev <= 0) { p.senseRev = 0.25; this.revealSensed(); } }
    p.senseK = (p.senseK || 0) + ((p.senseT > 0 ? 1 : 0) - (p.senseK || 0)) * (1 - exp(-dt * 6));
    // filter feeding: the mouth gapes and a wide cone of water pours in
    if (p.filterT > 0) p.filterT -= dt;
    p.filterK = (p.filterK || 0) + ((p.filterT > 0 ? 1 : 0) - (p.filterK || 0)) * (1 - exp(-dt * 7));
    if (p.filterT > 0) {
      const { L, half } = filterCone(p), a0 = p.ang, R0 = p.r0 || p.r;
      const mx = p.x + cos(a0) * R0 * 0.9, my = p.y + sin(a0) * R0 * 0.9;
      for (const m of this.motes) { const ux = m.x - mx, uy = m.y - my, ud = hypot(ux, uy) + 0.01; if (ud < L && abs(ad(a0, atan2(uy, ux))) < half) { const k = min(1, (700 + R0 * 8) * dt / ud); m.x += (mx - m.x) * k; m.y += (my - m.y) * k; } }
      for (const e of this.ents) {
        if (!e.alive || e.ally || e.boss || !e.edibleCache) continue;
        const ux = e.x - mx, uy = e.y - my, ud = hypot(ux, uy) + 0.01;
        if (ud > L + e.r || abs(ad(a0, atan2(uy, ux))) > half + e.r / ud) continue;
        e.stun = max(e.stun || 0, 0.4); const k = min(1, (420 + R0 * 5) * dt / ud); e.x += (mx - e.x) * k; e.y += (my - e.y) * k;
        if (ud < R0 * 0.9 + e.r) this.eat(e);
      }
    }
    // breach: up, over and down with a crash
    if (p.breachT > 0) { p.breachT -= dt; p.breachK = sin(PI * min(1, 1 - p.breachT / BREACH_T)); if (p.breachT <= 0) { p.breachT = 0; p.breachK = 0; this.breachLand(); } }
    // sailfish: the bill swipe, the sail (raised to turn and hunt, folded to race) and the hunting stripes
    if (p.slashT > 0) p.slashT -= dt;
    p.slashK = p.slashT > 0 ? 1 - p.slashT / SLASH_T : max(0, (p.slashK || 0) - dt * 4);
    if ((p.stage | 0) >= 7) {
      const sl = p.muts.sail | 0, hunting = p.slashT > 0 || p.dashT > 0 || p.puffK > 0.3 || (p.speedN < 0.6 && p.wiggle > 1.5); // Spread Fins raises the sail too
      const sailWant = hunting ? 1 : sl ? 0.25 + 0.1 * sl : 0;
      p.sailK = (p.sailK || 0) + (sailWant - (p.sailK || 0)) * (1 - exp(-dt * (sailWant > p.sailK ? 8 : 2.5)));
      if (p.stripeT > 0) p.stripeT -= dt;
      const stWant = p.stripeT > 0 || p.slashT > 0 ? 1 : 0.25 * (p.muts.stripes | 0);
      p.stripeK = (p.stripeK || 0) + (stWant - (p.stripeK || 0)) * (1 - exp(-dt * (stWant > p.stripeK ? 10 : 2)));
    }
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

  // electrosense: every heartbeat in range pulses, drawn over the dark (screen space)
  drawSense(ctx, W, H, wx, wy, z) {
    const p = this.p; if (!(p.senseK > 0.02)) return;
    const T = this.T, R = senseR(p), k = p.senseK;
    const groups = [[], [], []]; // prey, danger, boss
    for (const e of this.ents) {
      if (!e.alive || e.ally || e.hidePlayerFx) continue;
      const d = hypot(e.x - p.x, e.y - p.y); if (d > R + e.r) continue;
      const sx = wx(e.x), sy = wy(e.y), sr = e.r * z; if (sx < -sr || sy < -sr || sx > W + sr || sy > H + sr) continue;
      groups[e.boss ? 2 : e.edibleCache ? 0 : SP[e.kind] && SP[e.kind].hostile ? 1 : 0].push([sx, sy, sr, e.seed || 0]);
    }
    const cols = ['rgba(150,255,210,', 'rgba(255,140,170,', 'rgba(220,180,255,'];
    ctx.lineWidth = 2;
    for (let gi = 0; gi < 3; gi++) {
      const G = groups[gi]; if (!G.length) continue;
      ctx.beginPath();
      for (const [sx, sy, sr, sd] of G) { const beat = (T * 1.6 + sd) % 1, rr = sr * (1.1 + 0.6 * beat) + 6; ctx.moveTo(sx + rr, sy); ctx.arc(sx, sy, rr, 0, TAU); }
      ctx.strokeStyle = cols[gi] + (0.55 * k).toFixed(3) + ')'; ctx.stroke();
      ctx.beginPath();
      for (const [sx, sy, sr] of G) { const rr = max(3, sr * 0.25); ctx.moveTo(sx + rr, sy); ctx.arc(sx, sy, rr, 0, TAU); }
      ctx.fillStyle = cols[gi] + (0.5 * k).toFixed(3) + ')'; ctx.fill();
    }
  },

  drawActives(ctx, z) {
    const p = this.p, T = this.T;
    if (p.filterK > 0.02) {
      const { L, half } = filterCone(p), a0 = p.ang, R0 = p.r0 || p.r, k = p.filterK;
      const mx = p.x + cos(a0) * R0 * 0.9, my = p.y + sin(a0) * R0 * 0.9;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.arc(mx, my, L, a0 - half, a0 + half); ctx.closePath();
      ctx.fillStyle = `rgba(180,240,255,${0.06 * k})`; ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 22; i++) {
        const a = a0 + (((i * 0.618) % 1) - 0.5) * 2 * half, u = 1 - ((T * 1.4 + i * 0.37) % 1), r0 = L * u, r1 = r0 - 60 - R0 * 0.6;
        if (r1 < R0 * 0.5) continue;
        ctx.moveTo(mx + cos(a) * r0, my + sin(a) * r0); ctx.lineTo(mx + cos(a) * r1, my + sin(a) * r1);
      }
      ctx.strokeStyle = `rgba(215,250,255,${0.5 * k})`; ctx.lineWidth = 3 / z; ctx.lineCap = 'round'; ctx.stroke();
    }
    // the bill slash: a bright crescent sweeping across the front
    if (p.slashT > 0) {
      const { R, half } = slashArc(p), u = 1 - p.slashT / SLASH_T, d = p.slashDir;
      const a0 = p.ang - d * half, a1 = a0 + d * 2 * half * min(1, u * 1.4);
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.92, a0, a1, d < 0);
      ctx.strokeStyle = `rgba(200,235,255,${0.75 * (1 - u * 0.6)})`; ctx.lineWidth = (10 + 18 * (1 - u)) / z; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.92, a0, a1, d < 0);
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - u)})`; ctx.lineWidth = 3 / z; ctx.stroke();
    }
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
