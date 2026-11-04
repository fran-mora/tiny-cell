// Late-journey threats, mixed into the game: lurkers (ambush lunges), spitters (aimed shard volleys),
// spore mines (proximity bursts), mucus mats (slow you down) and whirlpools (drag you into a core).
import { el, icon } from '../ui.js';
import { glowSprite, rgbStr, portrait } from './art.js';

const { sin, cos, atan2, hypot, min, max, random, PI } = Math;
const TAU = PI * 2;

// shown the first time you meet each one (once per save)
export const THREAT_INFO = {
  lurker: { name: 'Lurkers', tip: 'Camouflaged hunters. They flash, then lunge in a straight line: dodge sideways.' },
  spitter: { name: 'Spitters', tip: 'Glass cells that keep their distance and fire shard volleys. They glow just before they shoot.' },
  mine: { name: 'Spore puffs', tip: 'Fungal puffballs that swell and burst when you get close. Toxins pop them from a distance.' },
  hydra: { name: 'Hydra', tip: 'Anchored polyps with stinging tentacles. They cannot chase you: just do not swim within reach.' },
  heliozoan: { name: 'Sun-animalcules', tip: 'Their sticky spines trap you and slowly digest you. Keep clear of the spines.' },
  tardigrade: { name: 'Tardigrades', tip: 'Water bears are slow but armoured: your attacks do half damage. Outswim them.' },
  chytrid: { name: 'Chytrid spores', tip: 'Fungal spores that swarm and latch on. Wiggle or dash to shake them off.' },
  arrowworm: { name: 'Arrow worms', tip: 'Glassy ambush predators. They flash, then dart in a straight line: dodge sideways.' },
  combjelly: { name: 'Comb jellies', tip: 'Slow, shimmering and sticky: get caught and they digest you. Bigger ones are best avoided.' },
  ostracod: { name: 'Seed shrimp', tip: 'Tasty, but eating one sets off a blue glow that draws every predator nearby to you.' },
  jellyfish: { name: 'Jellyfish', tip: 'The bell is harmless. The long tentacles trailing behind it sting: approach from the front.' },
  pistolshrimp: { name: 'Pistol shrimp', tip: 'Its claw snaps a bubble shock wave at you. It cocks the claw first: move sideways.' },
  anemone: { name: 'Sea anemones', tip: 'Glued to the reef, waving stinging tentacles. Give them room.' },
  squid: { name: 'Squid', tip: 'Small ones vanish behind ink. Big ones shoot out two long tentacles from a distance.' },
  barracuda: { name: 'Barracuda', tip: 'They cruise, then sprint at you in a straight line. Turn away at the last moment.' },
  moray: { name: 'Moray eels', tip: 'They hide in rocky dens and lunge at anything that swims too close.' },
  cookiecutter: { name: 'Cookie-cutter sharks', tip: 'Small glowing sharks that latch on and bite. Wiggle or dash to throw them off.' },
  angler: { name: 'Anglerfish', tip: 'In the dark, a light is often a lure. Get close and the jaws snap shut.' },
  mucus: { name: 'Biofilm', tip: 'Sticky bacterial slime. It slows you right down, so route around it. Osmoregulation helps.' },
  vortex: { name: 'Whirlpools', tip: 'They drag you towards a crushing core. Swim across them, not into them.' },
};

export const Threats = {
  threatIntro(id) {
    const info = THREAT_INFO[id]; if (!info) return;
    // wait until the level title has gone, and space several introductions out
    const now = performance.now(), at = Math.max(now + Math.max(0, 4 - (this.depthTime || 0)) * 1000, (this.introAt || 0) + 2600);
    this.introAt = at;
    if (at - now > 50) { this.later(at - now, () => this.showThreatIntro(id)); return; }
    this.showThreatIntro(id);
  },
  showThreatIntro(id) {
    const info = THREAT_INFO[id]; if (!info || this.dead || this.victory) return;
    const pic = id === 'mucus' || id === 'vortex' ? el('div.mb-threat-ic', { html: icon(id === 'vortex' ? 'refresh' : 'drop') }) : portrait('microbe', id, 48);
    const t = el('div.toast.mb-threat', {}, [pic, el('div.mb-tt', {}, [el('small', {}, 'New threat'), el('b', {}, info.name), el('span', {}, info.tip)])]);
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild.remove();
    this.sfx('event'); this.buzz([20, 40, 20]);
    this.later(5200, () => { t.classList.add('out'); this.later(320, () => t.remove()); });
  },
  // hazards are not species, so they are remembered in the codex under their own ids
  noticeHazard(type) {
    if (!THREAT_INFO[type] || this.seen[type]) return;
    this.seen[type] = true;
    if (this.codex.microbes && this.codex.microbes[type]) return;
    if (!this.disc.microbes.includes(type)) this.disc.microbes.push(type);
    this.threatIntro(type);
  },

  spitterFire(e, dx, dy, d) {
    const a0 = atan2(dy, dx), sp = 215 * min(1.35, Math.sqrt(this.L ? this.L.spdMult : 1));
    if (e.kind === 'pistolshrimp' || e.kind === 'spitter') {
      // the claw snaps so fast it fires a cavitation bubble
      this.shards.push({ x: e.x + cos(a0) * e.r, y: e.y + sin(a0) * e.r, vx: cos(a0) * sp * 1.45, vy: sin(a0) * sp * 1.45, life: 2.2, a: a0, why: 'Pistol shrimp snap', bubble: true });
      e.snapK = 1; e.flash = 0.6; this.sfx('hit', { pitch: 3 }); this.shake = min(8, this.shake + 2);
      return;
    }
    for (const off of [-0.2, 0, 0.2]) {
      const a = a0 + off;
      this.shards.push({ x: e.x + cos(a) * e.r, y: e.y + sin(a) * e.r, vx: cos(a) * sp, vy: sin(a) * sp, life: 3.2, a, why: 'Spitter shards', c: [170, 230, 255] });
    }
    e.flash = 0.6;
    this.sfx('toxin', { vol: 0.3 });
  },

  mineRadius(e) { return e.r * 3 + 50; },
  mineBurst(e) {
    if (e.burst) return;
    e.burst = true; e.alive = false;
    const p = this.p, R = this.mineRadius(e), d = hypot(p.x - e.x, p.y - e.y);
    this.burst(e.x, e.y, [255, 180, 90], 24, 260); this.burst(e.x, e.y, [255, 235, 170], 10, 150);
    this.rings = this.rings || [];
    this.rings.push({ x: e.x, y: e.y, r: 0, R, life: 0.6, c: [255, 170, 90] });
    this.sfx('burst'); this.shake = min(14, this.shake + 6);
    if (!this.dead && !this.victory && d < R + p.r) {
      const k = 1 - max(0, d - p.r) / R;
      if (this.hurt((14 + 3 * this.depth) * (0.4 + 0.6 * k), e, { why: 'Spore mine', env: true, iframes: 0.5 })) {
        const a = atan2(p.y - e.y, p.x - e.x); p.vx += cos(a) * 380; p.vy += sin(a) * 380;
      }
    }
    // anything else caught in the blast gets hurt too, and other mines go off in a chain
    for (const o of this.ents) {
      if (o === e || !o.alive || o.boss || o.ally) continue;
      if (hypot(o.x - e.x, o.y - e.y) > R + o.r) continue;
      if (o.kind === 'mine') this.later(140, () => this.mineBurst(o)); else this.damage(o, 45, e);
    }
  },

  // telegraphs drawn over the creatures (world space)
  drawThreatFx(ctx, z, inView) {
    const T = this.T;
    for (const e of this.ents) {
      if (!e.alive || !inView(e.x, e.y, 320)) continue;
      if (e.kind === 'lurker' && e.tele > 0) {
        const k = 1 - e.tele / 0.7, L = 300;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.setLineDash([10 / z, 8 / z]); ctx.lineDashOffset = -T * 60 / z;
        ctx.strokeStyle = `rgba(200,120,255,${0.25 + 0.5 * k})`; ctx.lineWidth = (2 + 3 * k) / z;
        ctx.beginPath(); ctx.moveTo(e.x + cos(e.la) * e.r, e.y + sin(e.la) * e.r); ctx.lineTo(e.x + cos(e.la) * (e.r + L), e.y + sin(e.la) * (e.r + L)); ctx.stroke();
        ctx.setLineDash([]);
        const s = e.r * (1.6 + k);
        ctx.globalAlpha = 0.4 + 0.5 * k * (0.5 + 0.5 * sin(T * 30));
        ctx.drawImage(glowSprite([190, 110, 255]), e.x - s, e.y - s, s * 2, s * 2);
        ctx.restore();
      } else if ((e.kind === 'spitter' || e.kind === 'pistolshrimp') && e.aim > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const s = e.r * (1.3 + e.aim * 1.2);
        ctx.globalAlpha = 0.25 + 0.6 * e.aim;
        ctx.drawImage(glowSprite([160, 230, 255]), e.x - s, e.y - s, s * 2, s * 2);
        ctx.restore();
      } else if (e.kind === 'mine' && e.arm > 0) {
        const k = e.armK || 0, R = this.mineRadius(e);
        ctx.save();
        ctx.beginPath(); ctx.arc(e.x, e.y, R, 0, TAU);
        ctx.fillStyle = `rgba(255,120,60,${0.05 + 0.12 * k})`; ctx.fill();
        ctx.strokeStyle = `rgba(255,150,80,${0.3 + 0.5 * k * (0.5 + 0.5 * sin(T * 26))})`; ctx.lineWidth = 2.5 / z; ctx.stroke();
        ctx.restore();
      }
    }
  },

  // mucus mats and whirlpools (world space, under the creatures)
  drawNewHazard(ctx, h, z, inView) {
    const T = this.T;
    if (h.type === 'mucus') {
      if (!inView(h.x, h.y, h.r * 1.2)) return;
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * TAU, r = h.r * (0.86 + 0.08 * sin(a * 3 + h.t * 0.6 + h.a) + 0.05 * sin(a * 7 - h.t * 0.4));
        i ? ctx.lineTo(h.x + cos(a) * r, h.y + sin(a) * r) : ctx.moveTo(h.x + cos(a) * r, h.y + sin(a) * r);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(h.x, h.y, h.r * 0.1, h.x, h.y, h.r);
      g.addColorStop(0, 'rgba(150,170,60,0.34)'); g.addColorStop(1, 'rgba(110,130,40,0.2)');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(190,210,110,0.45)'; ctx.lineWidth = 2.5 / z; ctx.stroke();
      // strands and trapped bubbles
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + h.a, r1 = h.r * 0.15, r2 = h.r * 0.75;
        ctx.moveTo(h.x + cos(a) * r1, h.y + sin(a) * r1);
        ctx.quadraticCurveTo(h.x + cos(a + 0.5) * h.r * 0.5, h.y + sin(a + 0.5) * h.r * 0.5, h.x + cos(a + 0.2) * r2, h.y + sin(a + 0.2) * r2);
      }
      ctx.strokeStyle = 'rgba(200,220,120,0.18)'; ctx.lineWidth = 3 / z; ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 9; i++) { const a = i * 2.3 + h.a, r = h.r * (0.2 + 0.6 * ((i * 0.41) % 1)), x = h.x + cos(a) * r, y = h.y + sin(a) * r, br = 3 + (i % 3) * 2; ctx.moveTo(x + br, y); ctx.arc(x, y, br, 0, TAU); }
      ctx.strokeStyle = 'rgba(230,240,170,0.35)'; ctx.lineWidth = 1.2 / z; ctx.stroke();
      ctx.restore();
    } else if (h.type === 'vortex') {
      if (!inView(h.x, h.y, h.r * 1.1)) return;
      ctx.save(); ctx.translate(h.x, h.y);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, h.r);
      g.addColorStop(0, 'rgba(0,0,10,0.55)'); g.addColorStop(0.3, 'rgba(10,10,30,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, h.r, 0, TAU); ctx.fill();
      ctx.rotate(-T * 1.4 + h.a);
      const acc = this.palCur.accent;
      ctx.lineCap = 'round';
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 26; i++) { const u = i / 26, r = h.r * (0.12 + 0.88 * u), a = (k / 5) * TAU + u * 3.4; i ? ctx.lineTo(cos(a) * r, sin(a) * r) : ctx.moveTo(cos(a) * r, sin(a) * r); }
        ctx.strokeStyle = `rgba(${acc[0]},${acc[1]},${acc[2]},0.28)`; ctx.lineWidth = 3 / z; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, h.r * 0.2, 0, TAU);
      ctx.strokeStyle = 'rgba(255,120,140,0.55)'; ctx.lineWidth = 2.5 / z; ctx.stroke();
      ctx.restore();
    }
  },
};
