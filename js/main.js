// Tiny Cell — home screen, meta-progression and run lifecycle around the microbe roguelike.
import { store } from './store.js';
import { el, icon, fmt, toast, sheet, dialog, confirm, duration, closeTopModal, anyModalOpen } from './ui.js';
import { audio, haptic } from './audio.js';
import { AGES, roman, dnaMultFor, advanceAge } from './ages.js';
import { CHANGELOG } from './changelog.js';
import { BUILD, BUILD_TIME } from './version.js';
import * as Game from './game/index.js';
import { drawPlayer, glowSprite } from './game/art.js';

const S = () => store.state;

class App {
  boot() {
    store.load();
    const st = S();
    window.__tw_haptics = st.settings.haptics;
    audio.setSfx(st.settings.sfx); audio.setMusic(st.settings.music);
    this.app = document.getElementById('app');
    this.fade = el('div.fade-cover'); this.app.appendChild(this.fade);
    advanceAge(st);
    this.buildHub();
    this.startHubAnim();
    document.getElementById('boot').classList.add('hide');
    setTimeout(() => document.getElementById('boot')?.remove(), 700);
    // audio needs a user gesture
    const first = () => { audio.init(); audio.music(this.run ? 'microbe' : 'title'); };
    window.addEventListener('pointerdown', first, { once: true, capture: true });
    window.addEventListener('pointerdown', () => { if (audio.ready) audio.resume(); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) { store.save(); audio.suspend(); } else audio.resume(); });
    window.addEventListener('pagehide', () => store.save());
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.run) closeTopModal(); });
    if (store.imported) setTimeout(() => toast(`Brought over your progress from Tiny World: <b>${store.imported.genes}</b> genome upgrades, <b>${store.imported.runs}</b> dives and <b class="dna-c">${fmt(store.imported.dna)} DNA</b>.`, { icon: 'dna', kind: 'dna', ms: 6000 }), 900);
    window.__tc = this;
    this.registerSW();
  }

  // ---------------------------------------------------------------- hub
  buildHub() {
    const st = S();
    this.hub = el('div.hub');
    this.canvas = el('canvas.hub-bg');
    this.dnaChip = el('button.chip.hub-dna', { onclick: () => this.openGenome() }, [icon('dna'), el('span.num.dna-c', {}, fmt(st.dna))]);
    this.dnaChip.querySelector('svg').style.color = 'var(--dna)';
    const menuBtn = el('button.icon-btn', { 'aria-label': 'Menu', onclick: () => { audio.sfx('click'); this.openMenu(); } }, icon('menu'));
    this.ageEl = el('button.hub-age.panel', { onclick: () => { audio.sfx('click'); this.openAges(); } });
    this.diveBtn = el('button.btn.btn-primary.btn-lg.btn-block.hub-dive', { onclick: () => this.dive() }, [icon('microbe'), 'Dive']);
    this.genomeBtn = el('button.hub-tile', { onclick: () => this.openGenome() }, [icon('dna'), el('span', {}, 'Genome')]);
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
        el('div.hub-tiles', {}, [this.genomeBtn, codexBtn, recBtn]),
        el('button.build-tag', { onclick: () => this.whatsNew() }, [`Build ${BUILD} · ${BUILD_TIME} · `, el('u', {}, 'What’s new')]),
      ]),
    );
    this.app.insertBefore(this.hub, this.fade);
    this.refreshHub();
  }

  refreshHub() {
    const st = S(), A = AGES[st.age];
    this.dnaChip.lastChild.textContent = fmt(st.dna);
    this.ageEl.replaceChildren(
      el('div.hub-age-name', { style: { color: A.color } }, `Ocean Age ${roman(st.age)} · ${A.name}`),
      el('div.small.dim', {}, A.goal ? `Next age: ${A.goal}` : 'The oldest ocean. Can you beat it again?'),
    );
    const canBuy = Game.GENOME_UPGRADES.some((u) => (st.genome[u.id] | 0) < u.maxLevel && st.dna >= u.cost(st.genome[u.id] | 0));
    let dot = this.genomeBtn.querySelector('.dot');
    if (canBuy && !dot) this.genomeBtn.appendChild(el('i.dot'));
    if (!canBuy && dot) dot.remove();
    const last = st.history[0];
    this.lastRunEl.textContent = last ? `Last dive: depth ${last.depth} · level ${last.level} · +${last.dna} DNA${last.win ? ' · victory!' : ''}` : 'Drag anywhere to swim. Eat what is smaller, flee what is bigger.';
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
      const age = S().age;
      const tint = [[12, 70, 86], [10, 82, 84], [14, 90, 70], [40, 80, 60], [20, 92, 58], [44, 40, 96]][age - 1];
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
      cell.muts = S().lastMuts || {};
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
    setTimeout(() => {
      const st = S();
      this.hub.style.display = 'none';
      this.host = el('div.run-host');
      this.app.insertBefore(this.host, this.fade);
      audio.music('microbe');
      this.runStart = performance.now();
      this.run = Game.startMicrobeRun({
        host: this.host, era: st.age, genome: { ...st.genome },
        codex: { microbes: { ...st.codex.microbes }, mutations: { ...st.codex.mutations } },
        settings: { ...st.settings }, firstRun: st.totals.runs === 0, dnaMult: dnaMultFor(st.age),
        returnLabel: 'Back to the surface', debug: location.search.includes('debug'),
        onExit: (res) => this.endRun(res),
      });
      setTimeout(() => this.fade.classList.remove('on'), 60);
    }, 420);
  }

  endRun(res) {
    const st = S();
    const ageBefore = st.age;
    this.fade.classList.add('on');
    setTimeout(() => {
      try { this.run && this.run.destroy(); } catch (e) { console.warn(e); }
      this.run = null; this.host?.remove(); this.host = null;
      if (res) {
        const dna = Math.max(0, Math.round(res.dna || 0));
        st.dna += dna; st.totals.dnaEarned += dna;
        st.totals.runs++;
        if (res.victory) st.totals.wins++;
        st.totals.bestDepth = Math.max(st.totals.bestDepth, res.depth || 0);
        st.totals.bestLevel = Math.max(st.totals.bestLevel, res.level || 0);
        st.totals.bossKills += res.bossKills || 0;
        st.totals.kills += res.kills || 0;
        st.totals.playTimeSec += res.timeSec || 0;
        if (res.victory) st.totals.bestTime = st.totals.bestTime ? Math.min(st.totals.bestTime, res.timeSec) : res.timeSec;
        for (const id of res.discovered?.microbes || []) st.codex.microbes[id] = true;
        for (const id of res.discovered?.mutations || []) st.codex.mutations[id] = true;
        for (const id of res.mutations || []) st.codex.mutations[id] = true;
        st.lastMuts = Object.fromEntries((res.mutations || []).map((id) => [id, 2]));
        st.history.unshift({ d: Date.now(), dna, depth: res.depth, level: res.level, win: !!res.victory, time: res.timeSec, age: st.age });
        st.history = st.history.slice(0, 30);
      }
      advanceAge(st);
      store.save();
      this.hub.style.display = '';
      audio.music('title');
      this.refreshHub();
      this.startHubAnim();
      setTimeout(() => this.fade.classList.remove('on'), 60);
      if (res && res.dna) setTimeout(() => { toast(`<b class="dna-c">+${fmt(res.dna)} DNA</b>`, { icon: 'dna', kind: 'dna', sound: 'coin' }); }, 450);
      if (st.age > ageBefore) setTimeout(() => this.ageUp(st.age), 1100);
      else if (res && st.totals.runs === 1) setTimeout(() => this.afterFirstRun(), 1100);
    }, 420);
  }

  // ---------------------------------------------------------------- dialogs
  afterFirstRun() {
    toast('DNA buys permanent upgrades for every future cell. Tap <b>Genome</b> when you\u2019re ready.', { icon: 'dna', kind: 'dna', ms: 5000 });
  }

  ageUp(age) {
    const A = AGES[age];
    audio.sfx('milestone'); haptic([20, 40, 20]);
    dialog({
      dismissable: false,
      body: el('div.center', {}, [
        el('div.era-kicker', { style: { color: A.color } }, `Ocean Age ${roman(age)}`),
        el('div.era-big', {}, A.name),
        el('p.dim', { style: { margin: '0 0 6px' } }, A.blurb),
        el('p.small', { style: { margin: 0, color: 'var(--dna)' } }, `DNA from every dive: +${Math.round((dnaMultFor(age) - 1) * 100)}%`),
      ]),
      buttons: [{ label: 'Onward', cls: 'btn-primary btn-lg' }],
    });
  }

  openAges() {
    const st = S();
    const items = [];
    for (let a = 1; a <= 6; a++) {
      const A = AGES[a], cur = a === st.age, past = a < st.age;
      items.push(el('div.card', { style: { borderColor: cur ? A.color : '', boxShadow: cur ? `0 0 0 1px ${A.color} inset` : '', opacity: a > st.age + 1 ? 0.55 : 1 } }, [
        el('div.row.between', {}, [el('div', { style: { fontWeight: 850, color: A.color } }, `${roman(a)} · ${A.name}`), el('span.tag', { class: past || cur ? 'good' : '' }, past ? 'Reached' : cur ? 'Now' : 'Locked')]),
        el('div.small.dim', { style: { marginTop: '4px' } }, a <= st.age + 1 ? A.blurb : '???'),
        a === st.age && A.goal ? el('div.small', { style: { marginTop: '6px' } }, ['To advance: ', el('b', {}, A.goal)]) : null,
        el('div.small', { style: { marginTop: '4px', color: 'var(--dna)' } }, `+${Math.round((dnaMultFor(a) - 1) * 100)}% DNA`),
      ]));
    }
    sheet({ title: 'Ocean Ages', body: [el('p.dim', { style: { margin: '0 0 12px', fontSize: '14px' } }, 'Each age makes the ocean richer and stranger: more food, new species, tougher bosses and more DNA.'), el('div.list', {}, items)] });
  }

  openGenome() {
    audio.sfx('click');
    const content = el('div');
    const head = el('div.row', { style: { marginBottom: '12px' } });
    const sh = sheet({ title: 'Genome', body: [head, content], onClose: () => this.refreshHub() });
    const render = () => {
      const st = S();
      head.replaceChildren(el('span.chip', {}, [icon('dna'), el('span.dna-c.num', {}, fmt(st.dna))]), el('span.small.dim.grow', {}, 'Permanent upgrades. Every new cell is born with them.'));
      head.firstChild.querySelector('svg').style.color = 'var(--dna)';
      const list = el('div.list');
      for (const u of Game.GENOME_UPGRADES) {
        const l = st.genome[u.id] | 0, max = l >= u.maxLevel, cost = max ? 0 : u.cost(l);
        let p = null; try { p = Game.portrait('genome', u.id, 112); p.style.width = p.style.height = '100%'; } catch (e) {}
        list.appendChild(el('div.card.res-card', {}, [
          el('div.thumb', {}, p || icon('dna', 'lg')),
          el('div.info', {}, [
            el('div.nm', {}, [u.name, el('span.pips', {}, Array.from({ length: u.maxLevel }, (_, k) => el('i', { class: k < l ? 'on' : '' })))]),
            el('div.ds', {}, u.desc),
            el('div.ds', { style: { color: 'var(--dna)' } }, l > 0 ? `Now: ${u.effect(l)}${max ? '' : ` → ${u.effect(l + 1)}`}` : `Next: ${u.effect(1)}`),
          ]),
          max ? el('span.tag.good', {}, 'Max') : el('button.btn.btn-dna', { class: st.dna >= cost ? '' : 'disabled', onclick: () => {
            if (st.dna < cost) return;
            st.dna -= cost; st.genome[u.id] = l + 1; store.save();
            audio.sfx('evolve'); haptic(12); render(); this.refreshHub();
          } }, [icon('dna', 'sm'), fmt(cost)]),
        ]));
      }
      content.replaceChildren(list);
    };
    render();
    return sh;
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
      el('div.section-title', {}, `Microbes · ${Object.keys(st.codex.microbes).length}/${Game.MICROBE_SPECIES.length}`),
      grid(Game.MICROBE_SPECIES, 'microbe'),
      el('div.section-title', {}, `Mutations · ${Object.keys(st.codex.mutations).length}/${Game.MUTATIONS.length}`),
      grid(Game.MUTATIONS, 'mutation'),
    ] });
  }

  openRecords() {
    audio.sfx('click');
    const st = S(), T = st.totals;
    const stat = (v, k) => el('div.stat', {}, [el('div.v', {}, v), el('div.k', {}, k)]);
    const hist = st.history.slice(0, 15).map((h) => el('div.row', { style: { padding: '8px 2px', borderBottom: '1px solid var(--line)', fontSize: '13.5px' } }, [
      el('span', { style: { color: h.win ? 'var(--good)' : 'var(--text-dim)', display: 'inline-flex' }, html: icon(h.win ? 'star' : 'microbe', 'sm') }),
      el('div.grow', {}, `Depth ${h.depth} · Lv ${h.level}${h.time ? ' · ' + duration(h.time) : ''}`),
      el('span.dna-c', { style: { fontWeight: 800 } }, `+${h.dna}`),
    ]));
    sheet({ title: 'Records', body: [
      el('div.stat-grid', {}, [
        stat(fmt(T.runs), 'Dives'), stat(fmt(T.wins), 'Victories'),
        stat(String(T.bestDepth || 0), 'Deepest depth'), stat(String(T.bestLevel || 0), 'Highest level'),
        stat(fmt(T.bossKills), 'Bosses defeated'), stat(fmt(T.kills), 'Cells eaten'),
        stat(fmt(T.dnaEarned), 'DNA earned'), stat(T.bestTime ? duration(T.bestTime) : '—', 'Fastest victory'),
        stat(duration(T.playTimeSec), 'Time underwater'), stat(`${roman(st.age)}`, 'Ocean Age'),
      ]),
      el('div.section-title', {}, 'Recent dives'),
      hist.length ? el('div', {}, hist) : el('div.empty', {}, 'No dives yet.'),
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
        el('button.btn.btn-block.btn-danger', { onclick: async () => { if (await confirm('Erase all progress?', 'Your genome, codex, records and DNA will be wiped. This cannot be undone.', 'Erase everything', 'btn-danger')) { store.wipe(); localStorage.setItem('tinycell.noimport', '1'); location.reload(); } } }, [icon('trash'), 'Erase all progress']),
      ]),
      el('div.small.faint.center', { style: { marginTop: '18px' } }, `Tiny Cell · Build ${BUILD} (${BUILD_TIME})`),
    ] });
  }

  howToPlay() {
    const p = (t) => el('p', { style: { margin: '0 0 10px', fontSize: '14px', color: 'var(--text-dim)' }, html: t });
    sheet({ title: 'How to play', body: [
      p('<b style="color:var(--text)">Swim:</b> drag anywhere on the screen. The further you drag, the faster you go. Let go to drift.'),
      p('<b style="color:var(--text)">Eat</b> glowing motes and any cell smaller than you. Anything bigger than you is dangerous. Red spiky Hunters chase you.'),
      p('<b style="color:var(--text)">Evolve:</b> every level you pick a mutation that changes how your cell looks and plays. Some give an active ability: tap its button (bottom right) to use it.'),
      p('<b style="color:var(--text)">Depths:</b> survive each depth to sink deeper. A boss waits at the end of depth 3 and depth 5. Bite their glowing weak spots and avoid their bodies.'),
      p('<b style="color:var(--dna)">DNA</b> from every dive buys permanent <b style="color:var(--text)">Genome</b> upgrades.'),
      p('<b style="color:var(--text)">Ocean Ages:</b> going deeper and beating bosses awakens older oceans with more food, new species, tougher bosses and more DNA.'),
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
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
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
