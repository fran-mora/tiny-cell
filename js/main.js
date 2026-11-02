// Tiny Cell — home screen, meta-progression and run lifecycle around the microbe roguelike.
import { store } from './store.js';
import { el, icon, fmt, toast, sheet, dialog, confirm, duration, closeTopModal, anyModalOpen } from './ui.js';
import { audio, haptic } from './audio.js';
import { CHANGELOG } from './changelog.js';
import { BUILD, BUILD_TIME } from './version.js';
import * as Game from './game/index.js';
import { drawPlayer, glowSprite } from './game/art.js';

const C = () => store.state.campaign;
const habitatOf = (c) => Math.ceil(c / Game.LEVELS_PER_HABITAT);

const S = () => store.state;

class App {
  boot() {
    store.load();
    const st = S();
    window.__tw_haptics = st.settings.haptics;
    audio.setSfx(st.settings.sfx); audio.setMusic(st.settings.music);
    this.app = document.getElementById('app');
    this.fade = el('div.fade-cover'); this.app.appendChild(this.fade);
    this.buildHub();
    this.startHubAnim();
    document.getElementById('boot').classList.add('hide');
    setTimeout(() => document.getElementById('boot')?.remove(), 700);
    // audio needs a user gesture
    const first = () => { audio.init(); audio.music(this.run ? 'microbe' : 'title'); };
    window.addEventListener('pointerdown', first, { once: true, capture: true });
    window.addEventListener('pointerdown', () => { if (audio.ready) audio.resume(); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { audio.suspend(); store.save(); } else audio.resume(); });
    window.addEventListener('pagehide', () => { audio.suspend(); store.save(); });
    document.addEventListener('freeze', () => audio.suspend());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.run) closeTopModal(); });
    if (store.migratedFromV1) { store.save(); setTimeout(() => toast('Tiny Cell is now a <b>48-level evolution journey</b>. Your codex and records came with you.', { icon: 'star', ms: 6500 }), 900); }
    window.__tc = this;
    this.registerSW();
  }

  // ---------------------------------------------------------------- hub
  buildHub() {
    const st = S();
    this.hub = el('div.hub');
    this.canvas = el('canvas.hub-bg');
    this.dnaChip = el('button.chip.hub-dna', { onclick: () => this.openTraits() }, [icon('dna'), el('span.num.dna-c', {}, '')]);
    this.dnaChip.querySelector('svg').style.color = 'var(--dna)';
    const menuBtn = el('button.icon-btn', { 'aria-label': 'Menu', onclick: () => { audio.sfx('click'); this.openMenu(); } }, icon('menu'));
    this.ageEl = el('button.hub-age.panel', { onclick: () => { audio.sfx('click'); this.openJourney(); } });
    this.diveBtn = el('button.btn.btn-primary.btn-lg.btn-block.hub-dive', { onclick: () => this.dive() }, [icon('microbe'), 'Play']);
    const journeyBtn = el('button.hub-tile', { onclick: () => { audio.sfx('click'); this.openJourney(); } }, [icon('globe'), el('span', {}, 'Journey')]);
    this.genomeBtn = el('button.hub-tile', { onclick: () => this.openTraits() }, [icon('dna'), el('span', {}, 'Traits')]);
    const codexBtn = el('button.hub-tile', { onclick: () => this.openCodex() }, [icon('book'), el('span', {}, 'Codex')]);
    const recBtn = el('button.hub-tile', { onclick: () => this.openRecords() }, [icon('chart'), el('span', {}, 'Records')]);
    this.lastRunEl = el('div.hub-last');
    this.hub.append(
      this.canvas,
      el('div.hub-top', {}, [this.dnaChip, el('div.grow'), menuBtn]),
      el('div.hub-title', {}, [el('h1', {}, ['Tiny', el('br'), 'Cell']), this.ageEl]),
      el('div.hub-bottom', {}, [
        this.lastRunEl,
        this.diveBtn,
        el('div.hub-tiles', {}, [journeyBtn, this.genomeBtn, codexBtn, recBtn]),
        el('button.build-tag', { onclick: () => this.whatsNew() }, [`Build ${BUILD} · ${BUILD_TIME} · `, el('u', {}, 'What’s new')]),
      ]),
    );
    this.app.insertBefore(this.hub, this.fade);
    this.refreshHub();
  }

  refreshHub() {
    const st = S(), c = C();
    const L = Game.levelConfig(c.level), stage = Game.STAGES[c.stage];
    const used = (c.mutOrder || []).filter((id) => c.muts[id] > 0).length, total = Game.MUTATIONS.length;
    this.dnaChip.lastChild.textContent = `Evo ${c.evo.level}`;
    this.ageEl.replaceChildren(
      el('div.hub-age-name', {}, c.complete ? 'Journey complete' : `Level ${c.level} of ${Game.TOTAL_LEVELS} \u00b7 ${L.name}`),
      el('div.small.dim', {}, `${stage.name} \u00b7 ${used} of ${total} traits collected`),
    );
    const label = c.complete ? 'Replay the final boss' : L.isBoss ? `Fight the ${Game.BOSSES[L.boss].name}` : `Play level ${c.level}`;
    this.diveBtn.innerHTML = icon(L.isBoss ? 'target' : 'microbe') + `<span>${label}</span>`;
    this.diveBtn.classList.toggle('boss', L.isBoss);
    const last = st.history[0];
    const tries = c.attempts[c.level] | 0;
    this.lastRunEl.textContent = last ? (last.cleared ? `Cleared level ${last.level} \u00b7 +${last.gained} new trait${last.gained === 1 ? '' : 's'}` : `Level ${c.level}: ${tries} attempt${tries === 1 ? '' : 's'} so far \u00b7 your traits stay with you`) : 'Drag anywhere to swim. Eat what is smaller, flee what is bigger.';
  }

  startHubAnim() {
    const c = this.canvas, ctx = c.getContext('2d');
    const motes = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 1.6, s: 0.004 + Math.random() * 0.012, ph: Math.random() * 6.28 }));
    const sprite = glowSprite([255, 232, 140]);
    const cell = { r: 1, ang: -1.2, seed: 0.37, muts: {}, wob: 0.01, speedN: 0.2, stretch: 0.03, dent: 0, dentA: 0 };
    let last = performance.now();
    const loop = (now) => {
      if (this.run) { this.hubRaf = null; return; }
      this.hubRaf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // freeze the backdrop while a sheet or dialog is open: blurred glass over a moving canvas is
      // very expensive, and nobody is looking at the background then
      if (anyModalOpen()) return;
      const t = now / 1000;
      const dpr = Math.min(S().settings.battery ? 1 : 2, window.devicePixelRatio || 1);
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pal = Game.HABITATS[habitatOf(C().level)].pal.bg;
      const tint = [pal[0] * 0.8, pal[1] * 0.8, pal[2] * 0.8].map(Math.round);
      const g = ctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.5, Math.max(W, H) * 0.8);
      g.addColorStop(0, `rgb(${tint[0] + 18},${tint[1] + 30},${tint[2] + 30})`); g.addColorStop(1, '#020812');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // light shafts
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const x = W * (0.2 + i * 0.3) + Math.sin(t * 0.2 + i) * 30;
        const sg = ctx.createLinearGradient(x, 0, x + 60, H * 0.8);
        sg.addColorStop(0, 'rgba(170,255,235,0.07)'); sg.addColorStop(1, 'rgba(170,255,235,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(x - 30, 0); ctx.lineTo(x + 40, 0); ctx.lineTo(x + 140, H * 0.8); ctx.lineTo(x + 40, H * 0.8); ctx.fill();
      }
      for (const m of motes) {
        m.y -= m.s * dt * 4; if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
        const x = (m.x + Math.sin(t * 0.3 + m.ph) * 0.01) * W, y = m.y * H, s = m.r * 7 * (0.8 + 0.2 * Math.sin(t * 2 + m.ph));
        ctx.globalAlpha = 0.55; ctx.drawImage(sprite, x - s, y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // the player's cell, wearing the mutations of its last dive
      cell.muts = C().muts || {}; cell.stage = C().stage;
      cell.ang = -1.57 + Math.sin(t * 0.4) * 0.35;
      // sit the cell in the open water between the age panel and the dive button
      const top = this.ageEl ? this.ageEl.getBoundingClientRect().bottom : H * 0.4;
      const bot = this.lastRunEl ? this.lastRunEl.getBoundingClientRect().top : H * 0.75;
      const R = Math.max(26, Math.min(W * 0.15, (bot - top) * 0.26));
      ctx.save();
      ctx.translate(W / 2 + Math.sin(t * 0.5) * 8, (top + bot) / 2 + Math.sin(t * 0.8) * 6);
      ctx.scale(R, R);
      try { drawPlayer(ctx, cell, t, R); } catch (e) { /* cosmetic */ }
      ctx.restore();
    };
    this.hubRaf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- run
  dive() {
    if (this.run || anyModalOpen()) return;
    audio.init(); audio.sfx('descend'); haptic(15);
    store.save();
    this.fade.classList.add('on');
    setTimeout(() => this.startLevel(), 420);
  }

  startLevel(intro = 'dive', cover = null) {
    const st = S(), c = C();
    if (c.complete) c.level = Game.TOTAL_LEVELS;
    this.hub.style.display = 'none';
    this.host?.remove();
    this.host = el('div.run-host');
    // between levels the old level hands over a colour, and the new one fades in from it
    if (cover) this.host.style.background = `rgb(${cover.join(',')})`;
    this.app.insertBefore(this.host, this.fade);
    audio.music('microbe');
    this.run = Game.startMicrobeRun({
      host: this.host,
      campaign: { level: c.level, stage: c.stage, evo: { ...c.evo }, muts: { ...c.muts }, mutOrder: [...c.mutOrder], attempts: c.attempts[c.level] | 0 },
      codex: { microbes: { ...st.codex.microbes }, mutations: { ...st.codex.mutations } },
      settings: { ...st.settings }, debug: location.search.includes('debug'), intro,
      onExit: (res) => this.endRun(res),
      onSettings: (patch) => { Object.assign(S().settings, patch); store.save(); },
    });
    setTimeout(() => this.fade.classList.remove('on'), 60);
  }

  endRun(res) {
    const st = S(), c = C();
    let evolved = 0;
    if (res && res.campaign) {
      // evolution progress is always kept, cleared or not
      c.muts = { ...res.muts }; c.mutOrder = [...res.mutOrder]; c.evo = { ...res.evo };
      c.attempts[res.level] = (c.attempts[res.level] | 0) + 1;
      st.totals.attempts++;
      st.totals.kills += res.kills || 0; st.totals.bossKills += res.bossKills || 0;
      st.totals.playTimeSec += res.timeSec || 0; st.totals.biomass += res.biomass || 0;
      for (const id of res.discovered?.microbes || []) st.codex.microbes[id] = true;
      for (const id of res.mutOrder || []) st.codex.mutations[id] = true;
      for (const id of res.gained || []) st.codex.mutations[id] = true;
      if (res.cleared) {
        st.totals.cleared++;
        c.best = Math.max(c.best, res.level);
        if (res.boss) c.bosses[res.boss] = true;
        const before = c.stage;
        c.stage = Math.max(c.stage, Game.stageForCleared(Math.floor(c.best / Game.LEVELS_PER_HABITAT)));
        if (c.stage > before) evolved = c.stage;
        if (res.level >= Game.TOTAL_LEVELS) c.complete = true; else c.level = Math.max(c.level, res.level + 1);
      } else if (!res.abandoned) st.totals.deaths++;
      st.history.unshift({ d: Date.now(), level: res.level, cleared: !!res.cleared, gained: new Set(res.gained || []).size, time: res.timeSec });
      st.history = st.history.slice(0, 30);
    }
    store.save();
    const choice = res?.choice || 'home';
    const goOn = (choice === 'next' || choice === 'retry') && !(choice === 'next' && c.complete);
    if (goOn && res?.seamless && (!evolved || res.evolveShown)) {
      // the level already played its own outro: swap straight into the next one, no black screen
      try { this.run && this.run.destroy(); } catch (e) { console.warn(e); }
      this.run = null;
      this.startLevel(choice === 'retry' ? 'retry' : 'next', res.cover);
      return;
    }
    this.fade.classList.add('on');
    setTimeout(() => {
      try { this.run && this.run.destroy(); } catch (e) { console.warn(e); }
      this.run = null; this.host?.remove(); this.host = null;
      if (goOn && (!evolved || res?.evolveShown)) { this.startLevel(choice === 'retry' ? 'retry' : 'next'); return; }
      this.hub.style.display = '';
      audio.music('title');
      this.refreshHub();
      this.startHubAnim();
      setTimeout(() => this.fade.classList.remove('on'), 60);
      if (evolved && !res?.evolveShown) setTimeout(() => this.evolveDialog(evolved, goOn), 500);
      else if (c.complete && res?.cleared && res.level >= Game.TOTAL_LEVELS) setTimeout(() => this.endingDialog(), 500);
    }, 420);
  }

  // ---------------------------------------------------------------- dialogs
  evolveDialog(stage, continueAfter) {
    const S2 = Game.STAGES[stage];
    audio.sfx('evolve'); setTimeout(() => audio.sfx('milestone'), 300); haptic([20, 40, 20, 40, 60]);
    let pic = null; try { pic = Game.portrait('stage', stage, 200); pic.style.width = pic.style.height = '160px'; } catch (e) {}
    dialog({
      dismissable: false,
      body: el('div.center', {}, [
        el('div.era-kicker', {}, 'You evolved'),
        el('div.era-big', {}, S2.name),
        pic ? el('div', { style: { display: 'flex', justifyContent: 'center', margin: '4px 0 8px' } }, pic) : null,
        el('p.dim', { style: { margin: 0 } }, S2.blurb),
      ]),
      buttons: [{ label: continueAfter ? `On to level ${C().level}` : 'Onward', cls: 'btn-primary btn-lg', onClick: () => { if (continueAfter) setTimeout(() => this.dive(), 200); } }],
    });
  }

  endingDialog() {
    audio.sfx('victory'); haptic([30, 60, 30, 60, 30]);
    const st = S();
    dialog({
      dismissable: false,
      body: el('div.center', {}, [
        el('div.era-kicker', {}, 'Journey complete'),
        el('div.era-big', {}, 'From a single cell'),
        el('p.dim', { style: { margin: '0 0 10px' } }, 'You crossed eight habitats, beat eight bosses and evolved into a true creature of the deep.'),
        el('div.stat-grid', {}, [
          el('div.stat', {}, [el('div.v', {}, fmt(st.totals.attempts)), el('div.k', {}, 'Attempts')]),
          el('div.stat', {}, [el('div.v', {}, duration(st.totals.playTimeSec)), el('div.k', {}, 'Time underwater')]),
        ]),
      ]),
      buttons: [{ label: 'Wonderful', cls: 'btn-primary btn-lg' }],
    });
  }

  openJourney() {
    const c = C();
    const items = [];
    for (let h = 1; h < Game.HABITATS.length; h++) {
      const H = Game.HABITATS[h], B = Game.BOSSES[H.boss];
      const first = (h - 1) * Game.LEVELS_PER_HABITAT + 1, lastL = h * Game.LEVELS_PER_HABITAT;
      const reached = c.level >= first || c.best >= first;
      const done = c.best >= lastL;
      const dots = el('div.jr-dots');
      for (let lv = first; lv <= lastL; lv++) {
        const boss = lv === lastL;
        dots.appendChild(el('i', { class: (c.best >= lv ? 'on' : '') + (lv === c.level && !c.complete ? ' cur' : '') + (boss ? ' boss' : '') }));
      }
      const evo = Game.EVOLVE_AFTER[h];
      let bossPic = null;
      if (reached) { try { bossPic = Game.portrait('microbe', B.id, 88); bossPic.style.width = bossPic.style.height = '100%'; } catch (e) {} }
      items.push(el('div.card.jr-card', { class: (done ? 'done' : '') + (!reached ? ' locked' : '') + (c.level >= first && c.level <= lastL && !c.complete ? ' cur' : '') }, [
        el('div.thumb', {}, bossPic || icon('lock', 'lg')),
        el('div.grow', {}, [
          el('div.jr-name', {}, [`${h} \u00b7 ${reached ? H.name : '???'}`, done ? el('span.tag.good', {}, 'Cleared') : null]),
          el('div.small.dim', {}, reached ? `Boss: ${c.bosses[B.id] || done ? B.name : '???'}` : `Levels ${first}\u2013${lastL}`),
          dots,
          evo ? el('div.small', { style: { color: 'var(--dna)', marginTop: '4px' } }, `Beat the boss to evolve: ${Game.STAGES[evo].name}`) : null,
        ]),
      ]));
    }
    sheet({ title: 'Journey', body: [el('p.dim', { style: { margin: '0 0 12px', fontSize: '14px' } }, `48 levels across 8 habitats. You are on level ${c.complete ? 48 : c.level}. Die and you retry the same level, keeping every trait.`), el('div.list', {}, items)] });
  }

  openTraits() {
    audio.sfx('click');
    const c = C(), S2 = Game.STAGES[c.stage];
    const owned = (c.mutOrder || []).filter((id) => c.muts[id] > 0);
    const defs = Object.fromEntries(Game.MUTATIONS.map((m) => [m.id, m]));
    let pic = null; try { pic = Game.portrait('stage', c.stage, 160); pic.style.width = pic.style.height = '100%'; } catch (e) {}
    const evoNeed = Game.evoNeed(c.evo.level);
    const rows = owned.map((id) => {
      const d = defs[id]; const l = c.muts[id];
      let p = null; try { p = Game.portrait('mutation', id, 96); p.style.width = p.style.height = '100%'; } catch (e) {}
      return el('div.card.res-card', {}, [
        el('div.thumb', {}, p || icon('dna')),
        el('div.info', {}, [el('div.nm', {}, [d ? d.name : id, el('span.pips', {}, Array.from({ length: d ? d.maxLevel : l }, (_, k) => el('i', { class: k < l ? 'on' : '' })))]), el('div.ds', {}, d ? d.desc : ''), d && d.lv ? el('div.ds', { style: { color: 'var(--dna)' } }, d.lv(l)) : null]),
      ]);
    });
    const tiers = [2, 3, 4, 5].map((stg) => {
      const list = Game.MUTATIONS.filter((m) => m.stage === stg);
      const open = c.stage >= stg;
      return el('div.small', { style: { margin: '4px 2px', color: open ? 'var(--text-dim)' : 'var(--text-faint)' } }, [el('b', { style: { color: open ? 'var(--good)' : 'var(--text-faint)' } }, `${Game.STAGES[stg].name}: `), list.map((m) => m.name).join(', '), open ? '' : ' (locked)']);
    });
    sheet({ title: 'Traits', body: [
      el('div.card.row', { style: { marginBottom: '12px' } }, [
        el('div.thumb', { style: { width: '72px', height: '72px' } }, pic || icon('microbe', 'lg')),
        el('div.grow', {}, [
          el('div', { style: { fontWeight: 850, fontSize: '17px' } }, S2.name),
          el('div.small.dim', {}, `${owned.length} of ${Game.MUTATIONS.length} traits collected \u00b7 Evolution Lv ${c.evo.level}`),
          el('div.bar.xp', { style: { marginTop: '8px' } }, el('i', { style: { width: Math.round(100 * c.evo.xp / evoNeed) + '%' } })),
        ]),
      ]),
      owned.length ? el('div.list', {}, rows) : el('div.empty', {}, 'No traits yet. Eat to fill your evolution bar and pick your first trait.'),
      el('div.section-title', {}, 'Trait families'),
      ...tiers,
    ] });
  }

  openCodex() {
    audio.sfx('click');
    const st = S();
    const grid = (items, kind) => el('div.codex-grid', {}, items.map((m) => {
      const known = kind === 'microbe' ? !!st.codex.microbes[m.id] : !!st.codex.mutations[m.id];
      let p = null; try { p = Game.portrait(kind, m.id, 112); p.style.width = p.style.height = '100%'; } catch (e) {}
      return el('div.codex-item', { class: known ? '' : 'unknown', onclick: () => { audio.sfx('click'); if (known) dialog({ title: m.name, text: m.desc, body: el('div.thumb', { style: { width: '120px', height: '120px', margin: '0 auto' } }, Game.portrait(kind, m.id, 120)) }); } }, [el('div.thumb', {}, p || icon('microbe')), known ? m.name : '???']);
    }));
    sheet({ title: 'Codex', body: [
      el('div.section-title', {}, `Microbes · ${Game.MICROBE_SPECIES.filter((m) => st.codex.microbes[m.id]).length}/${Game.MICROBE_SPECIES.length}`),
      grid(Game.MICROBE_SPECIES, 'microbe'),
      el('div.section-title', {}, `Mutations · ${Object.keys(st.codex.mutations).length}/${Game.MUTATIONS.length}`),
      grid(Game.MUTATIONS, 'mutation'),
    ] });
  }

  openRecords() {
    audio.sfx('click');
    const st = S(), T = st.totals, c = C();
    const stat = (v, k) => el('div.stat', {}, [el('div.v', {}, v), el('div.k', {}, k)]);
    const hist = st.history.slice(0, 15).map((h) => el('div.row', { style: { padding: '8px 2px', borderBottom: '1px solid var(--line)', fontSize: '13.5px' } }, [
      el('span', { style: { color: h.cleared ? 'var(--good)' : 'var(--text-dim)', display: 'inline-flex' }, html: icon(h.cleared ? 'check' : 'microbe', 'sm') }),
      el('div.grow', {}, `Level ${h.level} \u00b7 ${h.cleared ? 'cleared' : 'dissolved'}${h.time ? ' \u00b7 ' + duration(h.time) : ''}`),
      h.gained ? el('span.dna-c', { style: { fontWeight: 800 } }, `+${h.gained} trait${h.gained === 1 ? '' : 's'}`) : null,
    ]));
    sheet({ title: 'Records', body: [
      el('div.stat-grid', {}, [
        stat(`${c.complete ? 48 : c.best}/48`, 'Levels cleared'), stat(Game.STAGES[c.stage].name, 'Body'),
        stat(`Lv ${c.evo.level}`, 'Evolution'), stat(fmt(T.attempts), 'Attempts'),
        stat(fmt(T.deaths), 'Times dissolved'), stat(fmt(T.bossKills), 'Bosses defeated'),
        stat(fmt(T.kills), 'Cells eaten'), stat(duration(T.playTimeSec), 'Time underwater'),
      ]),
      el('div.section-title', {}, 'Recent attempts'),
      hist.length ? el('div', {}, hist) : el('div.empty', {}, 'No attempts yet.'),
    ] });
  }

  openMenu() {
    const st = S(), s = st.settings;
    const row = (ic, label, sub, control) => el('div.row', { style: { padding: '10px 2px', borderBottom: '1px solid var(--line)' } }, [el('span', { style: { color: 'var(--text-dim)', display: 'inline-flex' }, html: icon(ic) }), el('div.grow', {}, [el('div', { style: { fontWeight: 700 } }, label), sub ? el('div.small.dim', {}, sub) : null]), control]);
    const toggle = (key, after) => { const t = el('button.toggle', { class: s[key] ? 'on' : '', onclick: () => { s[key] = !s[key]; t.classList.toggle('on', s[key]); audio.sfx('tick'); after && after(s[key]); store.save(); } }); return t; };
    sheet({ title: 'Menu', body: [
      el('div.section-title', {}, 'Settings'),
      row('sound', 'Sound effects', null, toggle('sfx', (v) => audio.setSfx(v))),
      row('music', 'Music', null, toggle('music', (v) => audio.setMusic(v))),
      row('hand', 'Vibration', 'Haptic feedback on supported phones', toggle('haptics', (v) => { window.__tw_haptics = v; })),
      row('bolt', 'Battery saver', 'Lower resolution and fewer particles', toggle('battery')),
      el('div.section-title', {}, 'Help'),
      el('div.list', {}, [
        el('button.btn.btn-block', { onclick: () => this.howToPlay() }, [icon('book'), 'How to play']),
        el('button.btn.btn-block', { onclick: () => this.offlineHelp() }, [icon('globe'), 'Playing offline']),
        el('button.btn.btn-block', { onclick: () => this.whatsNew() }, [icon('star'), 'What’s new']),
      ]),
      el('div.section-title', {}, 'Save data'),
      el('div.list', {}, [
        el('button.btn.btn-block', { onclick: () => this.backup() }, [icon('shield'), 'Back up or restore save']),
        el('button.btn.btn-block.btn-danger', { onclick: async () => { if (await confirm('Erase all progress?', 'Your journey, traits, codex and records will be wiped. This cannot be undone.', 'Erase everything', 'btn-danger')) { store.reset(); location.reload(); } } }, [icon('trash'), 'Erase all progress']),
      ]),
      el('div.small.faint.center', { style: { marginTop: '18px' } }, `Tiny Cell · Build ${BUILD} (${BUILD_TIME})`),
    ] });
  }

  howToPlay() {
    const p = (t) => el('p', { style: { margin: '0 0 10px', fontSize: '14px', color: 'var(--text-dim)' }, html: t });
    sheet({ title: 'How to play', body: [
      p('<b style="color:var(--text)">Swim:</b> drag anywhere on the screen. The further you drag, the faster you go. Let go to drift.'),
      p('<b style="color:var(--text)">Eat</b> glowing motes and any cell smaller than you. Anything bigger is dangerous. You start each level small and grow as you eat.'),
      p('<b style="color:var(--text)">The journey:</b> 48 levels across 8 habitats. Survive the timer to clear a level. Every sixth level is a boss: bite its glowing weak spots and avoid its body.'),
      p('<b style="color:var(--text)">Dying</b> sends you back to the start of the same level. You never lose traits or evolution progress.'),
      p('<b style="color:var(--dna)">Evolution:</b> eating fills your evolution bar. When it fills, pick a trait. Traits stay for the whole journey and stack when picked again.'),
      p('<b style="color:var(--text)">Body stages:</b> some bosses evolve you: Colony, Multicellular, Swimmer, Sea Creature. Each stage unlocks a new family of traits. There is no limit: every trait you pick stays with you, so you can collect them all.'),
    ] });
  }

  offlineHelp() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const p = (t) => el('p', { style: { margin: '0 0 10px', fontSize: '14px', color: 'var(--text-dim)' }, html: t });
    sheet({ title: 'Playing offline', body: [
      p(standalone ? '<b style="color:var(--good)">You are running the installed app.</b> It works with no connection.' : 'Tiny Cell works fully offline after you open it online once.'),
      p('<b style="color:var(--text)">iPhone (Safari):</b> Share → <b style="color:var(--text)">Add to Home Screen</b>, then open it from the icon.'),
      p('<b style="color:var(--text)">Android (Chrome):</b> ⋮ menu → <b style="color:var(--text)">Install app</b>.'),
      p(`Offline cache: <b style="color:var(--text)">${navigator.serviceWorker?.controller ? 'ready ✓' : 'not ready yet. Reload once while online.'}</b>`),
    ] });
  }

  whatsNew() {
    audio.sfx('click');
    sheet({ title: 'What’s new', body: CHANGELOG.map((e) => el('div.card', { style: { marginBottom: '10px', borderColor: e.build === BUILD ? 'var(--leaf)' : '' } }, [
      el('div.row.between', {}, [el('div', { style: { fontWeight: 850 } }, e.title), el('span.tag', { class: e.build === BUILD ? 'good' : '' }, `Build ${e.build}`)]),
      el('ul', { style: { margin: '6px 0 0', paddingLeft: '18px', color: 'var(--text-dim)', fontSize: '13.5px' } }, e.notes.map((n) => el('li', { style: { marginTop: '3px' } }, n))),
    ])) });
  }

  backup() {
    const ta = el('textarea', { style: { width: '100%', height: '120px', borderRadius: '12px', background: 'rgba(0,0,0,.3)', color: 'var(--text)', border: '1px solid var(--line)', padding: '10px', fontSize: '11px', fontFamily: 'monospace' } });
    store.save(); ta.value = store.export();
    dialog({ title: 'Back up save', text: 'Copy this code somewhere safe. Paste a code and tap Restore to load it.', body: ta, buttons: [
      { label: 'Copy', cls: 'btn-primary', onClick: () => { ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Copied save code', { icon: 'check' }); } catch (e) { document.execCommand('copy'); } return false; } },
      { label: 'Restore from code', cls: 'btn-danger', onClick: () => { try { store.import(ta.value); location.reload(); } catch (e) { toast('That code did not work.', { kind: 'bad' }); } return false; } },
      { label: 'Close', cls: 'btn-ghost' },
    ] });
  }

  registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      document.addEventListener('visibilitychange', () => { if (!document.hidden && reg) reg.update().catch(() => {}); });
    }).catch((e) => console.warn('SW failed', e));
    const had = !!navigator.serviceWorker.controller;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing || !had) return;
      refreshing = true;
      if (!this.run) { store.save(); location.reload(); }
      else toast('A new version of Tiny Cell is ready. It loads after this dive.', { icon: 'refresh', ms: 4000 });
    });
  }
}

new App().boot();
