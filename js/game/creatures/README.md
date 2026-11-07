# Creature art modules

Tiny Cell's world changes scale as the player evolves (roughly x10 per body stage). Each scale
("tier") has its own cast of real organisms. The microbial tier (T1) is drawn in `../art.js`
(`drawSpecies`). Tiers 2–6 live here, one module per tier:

| file  | tier | player body stage        | real scale  | look & feel |
|-------|------|--------------------------|-------------|-------------|
| t2.js | T2   | Colony                   | 0.1–1 mm    | translucent micro-animals, still "cellular"; soft glows |
| t3.js | T3   | Flatworm (first animals) | 1–10 mm     | glassy plankton: crustaceans, jellies, worms; iridescence |
| t4.js | T4   | Primordial fish          | 1–10 cm     | reef life: shrimp, larval fish, jellyfish, anemones |
| t5.js | T5   | Jawed fish               | 10 cm – 1 m | sea creatures: fish, squid, eels, deep-sea glow |
| t6.js | T6   | Pufferfish               | 0.5 – 3 m   | reef, shipwreck & cold upwelling: big fish, sharks, cephalopods |

## Module shape

```js
export default {
  copepod: {
    name: 'Copepod',            // display name (codex)
    col: { body: [r,g,b], mem: [r,g,b], nuc: [r,g,b], glow: [r,g,b] },  // default palette (glow is used for halos)
    portraitR: 0.3,             // codex portrait radius as a fraction of the portrait size (default 0.3)
    portraitRot: -0.4,          // codex portrait rotation (default -0.4)
    states: [ { label: 'idle' }, { label: 'escape jump', jumpK: 1 } ],   // previews for dev/creatures.html
    draw(ctx, e, t, s, H, opts) { ... },
  },
};
```

`draw` is called with the context **already translated to the creature's centre, rotated so +x is
the direction it faces/swims, and scaled so 1 unit = its collision radius `e.r`**.

* The main body should fit inside radius ≈ 1 (that is what collides). Appendages (antennae,
  tentacles, tails, fins) may reach further, up to ~3 units, but keep the mass of the creature
  inside the unit circle so sizes read correctly.
* `t` = time in seconds (already offset per creature by its seed) → use it for all animation
  (`sin(t * k)`); never use `Date.now()` / `performance.now()`.
* `s` = on-screen size of the radius in device pixels. Use `H.lw(px)` to get a line width that is
  `px` device pixels wide. `H.lod` is true when the creature is tiny on screen (s < 9): draw a
  cheap silhouette only (one or two paths, no details). `H.hd` is true for boss-sized drawings:
  add extra detail.
* `H.col` = the palette (`{body, mem, nuc, glow}`, rgb arrays). Respect it (bosses and variants
  override it).
* Helpers in `H`: `bodyGrad(ctx, rgb, alpha)` (soft radial body fill, cached), `glassGrad`,
  `nucGrad`, `bandGrad`, `cstr(rgb)` / `rgbStr(rgb, a)`, `glowSprite(rgb, hard)` (a cached glow
  image to `drawImage` with `'lighter'` compositing), `blobPath(ctx, opts)`, `flagellum(...)`,
  `ciliaFringe(...)`, `spikeRing(...)`, `dots(...)`, `nucleus(...)`, `highlight(ctx, ang)`,
  `mixRGB(a, b, k)`. Read `../art.js` (drawSpecies, the hunter / rotifer / siphonophore / queen
  drawings) to match the existing style: translucent gradient bodies, a lighter outline stroke,
  a specular highlight, gentle idle motion, soft additive glows. Cute but anatomically right.
* `e` holds the creature's state. Besides `e.kind`, `e.seed`, `e.r`, `e.hp`, `e.maxHp`,
  `e.flash`, `e.stretch` (0–0.15, swim stretch) there are per-creature **state hooks** listed
  below: all optional, default 0/false, all must animate smoothly between 0 and 1.
* Always leave the context as you found it (`save`/`restore`, reset `globalAlpha` and
  `globalCompositeOperation`). Performance matters (phones, 60 fps, dozens on screen): no
  `shadowBlur`, no `ctx.filter`, no creating canvases or gradients per frame (use the `H`
  helpers, which cache), keep path counts modest, and skip detail when `H.lod`.
* Don't edit `../art.js`, `../game.js` or other tiers' files. Only your module (and its entries
  in `dev/creatures.html` previews via `states`).

Check your work in the gallery: `dev/creatures.html?tier=t3` (add `&t=1.3` to freeze time for
screenshots). It shows each state large, in-game size, tiny/LOD and the codex portrait.

## The cast and their state hooks

### T2 — colony scale (0.1–1 mm)
* **nauplius** — copepod larva: teardrop/pear body, three pairs of feathery swimming limbs,
  a single red naupliar eye at the front. Prey. `jumpK` (limbs swept back in a jerky stroke).
* **hydra** — hydroid polyp, anchored: foot disc at the back (−x ≈ −1), tubular body, a crown of
  6 long thin tentacles at the front that sway; nematocyst dots on the tentacles. Engine points
  +x at its target. `reach` (tentacles extend from ~1.2 to ~3 units), `strikeK` (tentacles snap
  forward together), `closedK` (contracts into a small knob when hurt).
* **tardigrade** — water bear: plump segmented barrel body, 4 pairs of stubby legs with claws
  (last pair at the rear), round head with a tubular mouth and two eyespots. Slow, tough
  predator. `biteK` (mouth stylets thrust out). Walk cycle from `t`.
* **heliozoan** — sun-animalcule: a foamy round cell with 30–40 long, thin, straight axopods
  radiating like a sun, tiny granules travelling along them. A sticky trap. `snag` (axopods bend
  inward and glow where something is caught).
* **chytrid** — fungal zoospore: tiny round/oval spore with one long trailing flagellum.
  Latches on like a phage. `latched` (flagellum curled, spore flattened against the host).

### T3 — first animals (1–10 mm)
* **copepod** — the classic: teardrop body (cephalosome) with a narrow tail (urosome) and two
  caudal setae, one red eye, VERY long first antennae held out sideways like wings with tiny
  hairs. Prey that escapes in jumps. `jumpK` (antennae folded back along the body, swimming legs
  sweeping), `eggs` (two egg sacs at the tail).
* **arrowworm** — chaetognath: slender, glassy torpedo with paired lateral fins and a tail fin,
  a head with two fans of grasping spines (hooks). Ambush predator that lunges. `tele` (body
  tenses, hooks start to open, faint glow), `lunge` (body straight, hooks wide open).
* **combjelly** — ctenophore (Pleurobrachia): transparent oval/egg body with 8 comb rows running
  pole to pole whose cilia shimmer in travelling rainbow colours, and two long trailing
  tentacles with side branches (to −x). Engulfing predator. `pulse`.
* **ostracod** — seed shrimp: bean-shaped two-valved shell (like a tiny clam) with antennae and
  little legs poking out of the gap. Prey that releases a blue glowing cloud when attacked.
  `glowK` (bright blue bioluminescent cloud around/behind it).
* **beroe** (boss, `boss: true`) — Beroe comb jelly: large thimble/sack-shaped transparent body
  with NO tentacles, a huge mouth at the front (+x) and 8 iridescent comb rows. `mouthK` (mouth
  gapes wide, body stretches), `rows` (array of 8 numbers 0–1: health of each comb row; 0 =
  destroyed: dark, torn, no shimmer).
* **pompeii** (boss) — Pompeii worm: segmented worm, head at +x with a feathery scarlet gill
  plume, a whitish fleece of bacteria along its back. Lives in a chimney tube. `emergeK` (0 = only
  the plume tips visible at the tube mouth, 1 = fully out, lunging). Also export
  `drawTube(ctx, t, H)` drawing its mineral chimney tube in the same unit space (mouth of the tube
  at x ≈ 0.6, tube extending to −x).

### T4 — primordial-fish scale (1–10 cm)
* **krill** — small translucent shrimp, long body, many legs, black stalked eyes, glowing blue
  photophore dots. Food swarm. `glowK`.
* **larvalfish** — transparent fish larva: huge eyes, a visible gut/yolk, continuous fin fold,
  wiggly tail. Schooling prey.
* **jellyfish** — medusa: translucent pulsing bell (front = +x), frilly oral arms and several long
  trailing tentacles flowing back toward −x (to ~−3.5 units). The stinging zone is those
  tentacles. `stingK` (tentacles flash bright when stinging). Bell pulse from `t`.
* **pistolshrimp** — snapping shrimp: shrimp body with one oversized claw (+x). `cockK` (claw
  opened/cocked back), `snapK` (claw snapped shut with a bright flash at the tip).
* **anemone** — sea anemone, anchored: column with foot at −x, oral disc at +x, many soft
  tentacles waving. `reach`, `closedK` (pulls tentacles in when hurt).
* **cuttlefish** (boss) — cuttlefish: oval mantle with a rippling fin skirt, W-shaped pupils,
  8 arms + 2 long feeding tentacles at +x, animated chromatophore patterns ("passing clouds" of
  dark bands). `camo` (0–1: fades towards transparency/background tones; at 1 only a faint
  outline and eyes), `strikeK` (feeding tentacles shoot out ahead to ~+3 units), `decoy` (bool:
  draw instead an ink pseudomorph: a dark, soft, cuttlefish-shaped ink blob with no eyes, wispy
  edges).
* **mantis** (boss) — peacock mantis shrimp: vivid green/red/blue, stalked eyes, segmented
  abdomen and tail fan, a pair of folded raptorial clubs at the front. `cockK` (clubs drawn back),
  `strikeK` (clubs punched forward with a cavitation flash).

### T5 — jawed-fish scale (10 cm – 1 m)
* **sardine** — small silvery schooling fish: blue-green back, silver flank, forked tail.
* **squid** — torpedo mantle with fins at the rear (−x), 8 arms + 2 tentacles at +x, big eyes.
  `inkK` (ink cloud billowing behind it), `grabK` (tentacles shoot out ahead).
* **barracuda** — long slim silver predator, dark bars, jutting lower jaw with fangs.
  `sprintK` (body straightened, motion streaks).
* **moray** — moray eel: long mottled body trailing back to −x (~3 units, sinuous), blunt head,
  open mouth with teeth. `emergeK` (0 = only the head out of its den, 1 = lunging fully out),
  `biteK` (mouth wide). Also export `drawDen(ctx, t, H)`: a rocky crevice/den drawn in the same
  unit space at the −x end.
* **cookiecutter** — cookie-cutter shark: small cigar-shaped shark, dark collar band behind the
  head, glowing blue-green belly. `latched` (bites on: body bent, mouth suction-cupped).
* **angler** (also a boss) — deep-sea anglerfish: round dark body, huge mouth with needle teeth,
  small eyes, an illicium ("fishing rod") from the forehead arching forward with a glowing esca
  (lure) at its tip. `mouthK` (gape), `lureK` (lure brightness). Export `lurePos(e, t)` returning
  `{x, y}` of the lure in unit space so the game can place its light.
* **siphboss** (boss) — giant siphonophore colony (Praya-like). The game moves the colony as a
  chain; export part drawers in unit space (each part centred at 0,0, facing +x along the chain):
  `parts: { float, bell, feeder, stinger, core }` with signature `(ctx, t, H, st)` where
  `st = { alive, hit, pulse }`: float = gas-filled pneumatophore at the head, bell = swimming
  nectophore (transparent bell that pulses), feeder = gastrozooid feeding polyp, stinger =
  dactylozooid with a long coiled fishing tentacle, core = glowing stem node. Dead parts look
  collapsed/dark. `draw` itself draws a compact chain (float, 2 bells, feeder, stinger) for the
  codex.

### T6 — pufferfish scale (0.5–3 m)
* **parrotfish** — chunky blue-green parrotfish, big scales edged pink/orange, pink face paint, fused
  turquoise beak with pink lips at +x, big rowing pectorals, lunate tail. Neutral grazer. `biteK` (beak
  plates part sideways and crunch; coral crumbs fly).
* **seaurchin** — long-spined urchin (Diadema): dark purple test with five rows of iridescent blue dots
  and an orange-ringed anal cone, ~60–100 long thin swaying spines, tube feet round the rim. Radial (no
  mirror symmetry). Shell from `e.armor / e.armorMax` (k): as k drops spines snap off (blunt pale stubs),
  hairline cracks appear below ~0.6, and at 0 the test is broken into five plates showing the soft
  orange roe inside.
* **triggerfish** — titan triggerfish: diamond body, scale lattice, dark face saddle, orange lips and
  "moustache", big chisel buck teeth, eyes set far back, lyre tail, rippling soft dorsal. Aggressive
  predator. `biteK` (lunges, lips part showing the teeth, the first dorsal "trigger" spine snaps up).
* **lionfish** — red/cream barred body, huge banded pectoral fans swept back like wings, a crown of long
  banded venomous dorsal spines with webbing, brow tentacles, spotted see-through tail. Predator that
  corners prey. `biteK` (fans and spines flare wide and forward, mouth gulps open).
* **octopus** — day octopus: mantle at −x, head and big bar-pupilled eyes near the centre, dark ocelli,
  chromatophore "passing clouds", 8 sucker-lined arms webbed at the base, trailing to −x. `inkK` (ink
  cloud behind; it blanches and streamlines its arms), `grabK` (arms shoot forward to ~+2.5, tips
  curling in).
* **reefshark** — blacktip reef shark: pale grey shark silhouette, sickle pectorals, tall first dorsal,
  lunate tail, black tips on every fin, white flank band, gill slits, cat-eye pupils. `sprintK` (body
  straightened, fins swept back, motion streaks), `biteK` (lower jaw swings forward ahead of the snout,
  serrated teeth, eyes roll white).
* **seasnake** — banded sea krait: ~3.6 units of sinuous blue-white body with black rings trailing to
  −x, black head with yellow snout and brow stripes, paddle tail, flicking forked tongue. Predator.
  `biteK` (neck straightens, head lunges, lower jaw drops forward showing a pink mouth and fangs). The
  codex portrait coils it up and centres it.
* **seaturtle** — green sea turtle: domed olive carapace with marginal, vertebral and costal scutes and
  radiating streaks, long front flippers flapping slowly like wings (feathering at the end of each
  stroke), small rear flippers, beaked head with plated scales at +x. Neutral, too big to eat. No hooks.
* **humboldt** — Humboldt (jumbo) squid: long torpedo mantle, arrowhead fins at −x, stout arms and two
  long tentacles at +x, big eyes. Used for the regular squid and for each squid of the boss pack (`H.hd`
  when big). `flashK` (strength of fast red/white bands travelling head → tail across the mantle, head
  and fins; the pattern itself comes from `t`), `redK` (whole body flushes deep red: the attack signal),
  `grabK` (tentacles shoot out ahead to ~+3 units), `inkK` (ink cloud behind, it blanches).
* **grouper** (boss) — Goliath grouper: massive rounded body, mottled olive/brown/yellow with dark
  bars and spots, huge wide mouth with a jutting lower lip at +x, small eyes, rounded fins and tail.
  `gapeK` (lower jaw swings forward into a huge dark gape, gill covers flare showing red gills),
  `suckK` (streaks and particles drawn into the mouth), `chokeK` (mouth jammed half open on an inflated
  spiny pufferfish, cheeks bulging, eyes bulging white, shaking, frantic fins, bubbles), `stunK` (dazed:
  eyelids drooping, pupils rolled, body tilted and rolled showing its pale flank, slow fins, sparkles
  circling the head). Also export `wreck(ctx, t, H)`: its lair, a rusted shipwreck hull section
  (~7 × 3 units, centred at 0,0, drawn under the grouper) with a torn end, ribs, plating, a collapsed
  deckhouse, a fallen mast, barnacles, soft coral tufts, sea fans and a dark open cargo hatch near +x.
