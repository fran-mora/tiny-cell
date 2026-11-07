// Dev gallery for creature art (js/game/creatures/*). ?tier=t3 to filter, ?t=1.3 to freeze time, ?kind=copepod for one.
import { drawSpecies, portrait, CREATURE_ART } from '../js/game/art.js';
import T2 from '../js/game/creatures/t2.js';
import T3 from '../js/game/creatures/t3.js';
import T4 from '../js/game/creatures/t4.js';
import T5 from '../js/game/creatures/t5.js';
import T6 from '../js/game/creatures/t6.js';
import T7 from '../js/game/creatures/t7.js';
import T8 from '../js/game/creatures/t8.js';
import T9 from '../js/game/creatures/t9.js';
import T10 from '../js/game/creatures/t10.js';

const q = new URLSearchParams(location.search);
const only = q.get('tier'), one = q.get('kind');
const fixedT = q.has('t') ? parseFloat(q.get('t')) : null;
const BG = { t2: ['#123f4a', '#051820'], t3: ['#2a1550', '#08041a'], t4: ['#12405c', '#041626'], t5: ['#0d1430', '#020409'], t6: ['#0f4a5e', '#03141c'], t7: ['#0c4f78', '#02162a'], t8: ['#14506a', '#041822'], t9: ['#1a4458', '#05121a'], t10: ['#0a3f6e', '#021226'] };
const root = document.getElementById('root');
const tiles = [];
const el = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) e.append(k); return e; };

function tile(kind, state, R, label, bg) {
  const W = Math.max(60, Math.round(R * 2.6 + 20)), H = W;
  const c = el('canvas'); c.width = W * 2; c.height = H * 2; c.style.width = W + 'px'; c.style.height = H + 'px';
  c.style.setProperty('--bg1', bg[0]); c.style.setProperty('--bg2', bg[1]);
  const ctx = c.getContext('2d');
  const e = { kind, seed: 0.37, ang: 0, t: 0, r: R, hp: 1, maxHp: 1, ...state };
  tiles.push((T) => { ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, W, H); ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(e.ang || 0); ctx.scale(R, R); drawSpecies(ctx, e, T, R * 2, { hd: R > 60 }); ctx.restore(); });
  return el('figure', {}, [c, el('figcaption', { textContent: label })]);
}

for (const [tier, mod] of [['t2', T2], ['t3', T3], ['t4', T4], ['t5', T5], ['t6', T6], ['t7', T7], ['t8', T8], ['t9', T9], ['t10', T10]]) {
  if (only && only !== tier) continue;
  for (const [kind, def] of Object.entries(mod)) {
    if (one && one !== kind) continue;
    root.append(el('h2', { innerHTML: `${kind} <small>${tier}${def.boss ? ' · boss' : ''} — ${def.name || ''}</small>` }));
    const row = el('div.row'); row.className = 'row';
    const bg = BG[tier];
    const states = def.states || [{ label: 'idle' }];
    const big = def.boss ? 150 : 70;
    for (const st of states) { const { label, ...s } = st; row.append(tile(kind, s, big, label || 'state', bg)); }
    row.append(tile(kind, {}, 22, 'in-game small (r=22)', bg));
    row.append(tile(kind, {}, 7, 'tiny / LOD (r=7)', bg));
    let pc = null; try { pc = portrait('microbe', kind, 96); } catch (e) { pc = el('div', { textContent: 'portrait failed: ' + e.message }); }
    row.append(el('figure', {}, [pc, el('figcaption', { textContent: 'codex portrait' })]));
    root.append(row);
  }
}
if (!tiles.length) root.append(el('p', { textContent: 'No creatures registered yet: ' + Object.keys(CREATURE_ART).join(', ') }));
const t0 = performance.now();
function frame(now) { const T = fixedT ?? (now - t0) / 1000; for (const d of tiles) d(T); if (fixedT === null) requestAnimationFrame(frame); }
requestAnimationFrame(frame);
