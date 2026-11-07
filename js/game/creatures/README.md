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

### T7 — sailfish scale (1–4 m): the open blue ocean
Seen from above like T5/T6; mouths open in the picture plane (jaws part sideways or swing forward). The
player here is a ~3 m sailfish.
* **flyingfish** — slim fish, dark-blue back and silver flanks, big eyes, huge pectoral "wings" (ray fans
  folded back along the flanks when swimming) plus small pelvic hind wings, forked tail with the longer
  lower lobe on +y. Schooling prey. `glideK` (body straight, wings and hind wings spread wide, spray
  droplets and sparkles flung off). The codex portrait shows it gliding.
* **tuna** — yellowfin tuna: torpedo body, dark-blue back, silver-yellow flanks with a golden stripe, a
  row of yellow finlets along the back and flanks near the tail, long yellow sickle second-dorsal/anal
  fins streaming back on both sides, long dark pectorals, keeled tail stock, crescent tail with a fast
  thunniform beat. Schooling prey. No hooks.
* **mahimahi** — blunt square forehead, gold flanks and green back with small blue spots and a sliding
  iridescent sheen, a blue-edged dorsal fin running the whole length of the back, deeply forked golden
  tail. Prey. No hooks.
* **dolphin** — common dolphin: rounded melon and long beak, blowhole, dark cape with a V under the
  falcate dorsal fin over the tan-yellow (front) and pale-grey (rear) flank patches — the hourglass —,
  dark beak-to-eye stripe, flippers, horizontal flukes that pump up and down (barely any side-to-side
  wave): their crescent swells and shrinks with the stroke. Predator. `sprintK` (faster pump, flippers
  tucked, motion streaks), `biteK` (the beak's jaws part sideways: pink mouth, rows of small teeth).
* **manowar** — Portuguese man o' war: translucent blue-purple gas float with a pleated, scallop-edged
  pink crest along its top, a purple cluster of polyps beneath, 7–9 long beaded blue tentacles streaming
  back to ~−4 units. Hazard. `stingK` (tentacles flash bright white-blue, beads glow). The codex portrait
  shortens the tentacles and recentres it.
* **hammerhead** — scalloped hammerhead: grey shark with the wide scalloped cephalofoil at +x (eyes at
  its tips, nostril grooves, electro-sense pores when `H.hd`), the head sweeping slowly side to side,
  tall dorsal, falcate pectorals, long upper tail lobe (−y). Predator. `biteK` (the jaw swings forward
  from under the hammer with serrated teeth, third eyelids close).
* **marlin** — blue marlin: spear bill to ~+1.85, cobalt back, silver flanks, pale-blue vertical stripes,
  a high pointed dorsal lobe then a low ridge, rigid scythe pectorals, tall crescent tail, keels. Predator.
  `sprintK` (stripes glow electric blue, dorsal folded flat, pectorals pressed back, body straight,
  motion streaks), `biteK` (bill and short lower jaw part sideways round a dark-red gape).
* **thresher** (boss) — common thresher: compact purple-grey shark with huge eyes, white belly showing
  over the long falcate pectorals, and a scythe-like upper tail lobe as long as its body (to ~−3.5).
  `windK` (body coils into a C towards +y and the scythe folds forward along that flank: cocked),
  `whipK` (coils harder and lashes the scythe across, over and past the head towards −y with a fading
  motion-blur fan and ghost tails; impact sparkles at the tip as it lands) — `whipK` 1 wins over
  `windK`, so ramp `windK` then `whipK`; `stunK` (dazed: eyes rolled and half-lidded, slow wobbling
  drift, belly showing, sparkles circling the head). `H.hd`: lateral lines, snout pores, denticle sheen.
* **swordfish** (boss) — broadbill swordfish: long, flat, wide sword to ~+2.2, smooth scaleless dark
  bronze-purple skin, huge eyes, tall rigid sickle dorsal, long sickle pectorals (no pelvics), big keel
  and crescent tail. `chargeK` (sword-first lunge: body straight and stretched, fins swept back, the
  sword's edges gleam, bow wave off the tip, motion streaks), `glowK` (eyes and the brain-heater patch
  between them glow warm orange), `wakeK` (blue bioluminescent sparks stirred up along and behind it).

### T8 — ocean-sunfish scale (2–5 m): jellyfish-rich open water, kelp and reef cleaning stations
Swimmers are seen from above like T5/T6 (mouths open in the picture plane). Nomura's jellyfish is drawn
side-on like T4's medusa (bell apex at +x, arms and tentacles trailing to −x); the lion's mane boss is
seen from straight above. The player here is a 3 m, 2-tonne ocean sunfish that eats jellyfish.
* **salp** — salp chain: 6–10 glassy barrel zooids (count from `e.seed`) linked in a zigzag along x
  (~±1.25), each with faint muscle hoops, a slanting gill bar, a small orange gut nucleus at its rear and
  a red eye spot (big sizes); a contraction wave runs down the chain from `t`. Prey. No hooks.
* **pyrosome** — translucent pink hollow tube: rounded closed end at +x, open end with a diaphragm at −x
  (~−1.1); the bumpy surface is staggered whorls of tiny zooids, each with a blue-green light organ that
  ripples. Prey. `glowK` (a bright bioluminescent wave runs from the tip to the open end, the whole
  colony brightens).
* **nomura** — Nomura's jellyfish: huge brownish-pink mushroom bell (front = +x) mottled with brown
  blotches and pale warts, radial grooves, a ruffled skirt of scapulets, thick frilly cauliflower oral
  arms of mixed lengths (to ~−1.6) and many thin filaments trailing back to ~−3 with nematocyst dots.
  The bell pulses from `t`. Predator. `stingK` (filaments flash bright, sparks along them). The codex
  portrait shifts it forward so bell and filaments fit.
* **leatherback** — leatherback turtle: dark teardrop leathery shell with seven lengthwise ridges
  converging on a pointed caudal peak, white speckles, no scutes; huge speckled front flippers with pale
  trailing edges rowing slowly (feathering at the end of each stroke), broad rear paddles, big blotched
  head with a notched beak and the pink spot on top at +x. Neutral, too big to eat. No hooks.
* **blueshark** — blue shark: slender cobalt body with a deep-indigo back and bright flank lines, long
  conical snout, big round dark eyes, very long scythe pectorals, set-back dorsal, forked tail. Predator.
  `biteK` (lower jaw swings forward ahead of the snout: dark gape, serrated teeth).
* **sealion** — California sea lion: sleek brown body with a darker back and wet sheen, round head and
  blunt tan muzzle, dark nose, big dark eyes, small rolled ear flaps, short pale whiskers, long dark
  paddle fore-flippers (furred at the base) in a flying stroke, a V of hind flippers with five toes each.
  Playful twisting swim from `t`: the body rolls (the pale belly shows on one side, the flippers
  foreshorten) and bends. Predator; also drawn larger for the boss gang (`H.hd`: fur lie, digit lines,
  more whiskers). `sprintK` (body straight, flippers swept back, motion streaks), `biteK` (lower jaw
  swings forward: pink gape, tongue, canines; whiskers flare forward).
* **lionsmane** (boss) — lion's mane jellyfish seen from above: a huge round bell, eight lobes split by
  notches with yellow rhopalia, a translucent golden margin over a deep red-orange centre, 16 radial
  bands, eight horseshoe clusters of hair-fine tentacle roots seen through the bell, a frilly red "mane"
  of four ruffled oral curtains in a cross, and a dense fringe of fine tentacles streaming back to ~−1.6
  (the game draws the long curtains itself). Idle bell breathing from `t`. `pulse` (bell contracts,
  notches deepen, fringe pulls in), `stingK` (fringe flashes white-gold with sparks), `hurtK` (bell
  flinches and shakes, its rim crumples, it darkens to a bruised red-brown). Also export
  `tentacle(ctx, ax, ay, bx, by, t, H, k)`: a bundle of 3–5 fine wavy red-orange strands from A to B in
  the current transform's units (`H.lw` = pixel widths; `H.lod`/`H.hd` are ignored). Each strand's
  sideways offset at an end point depends only on that point's position, so consecutive segments join
  and the strands weave like hair; `k` 1 = healthy (faint additive glow, lighter strands), 0 = cut and
  limp (dim brownish, 3 slack strands, slow kinky waves). ≤ 3 strokes per call. Preview-only
  `e.withCurtains` draws a few curtains with it.

### T9 — great-white scale (4–8 m): a seal island and a deep mid-ocean shark gathering spot
The four sharks share one pipeline in `t9.js` (`sharkCore`): countershaded bodies (the pale underside
shows round the edges from above), sickle fins, jaws that open in the picture plane (the lower jaw swings
forward ahead of the snout), species shape tables. The player here is a 6 m great white.
* **furseal** — Cape fur seal: dark-brown torpedo body with a paler belly at the edges, small head with
  tiny rolled ears, big dark eyes, dark nose and long pale whiskers, long naked black fore flippers in a
  quick power stroke, paired hind flippers with scalloped toes at −x. Porpoising from `t`: it swells
  towards the camera at the top of each leap (shadow drifting away, spray flung off). Prey. No hooks.
* **elephantseal** — elephant seal: huge rotund grey-brown body with moult blotches, thick neck folds
  and pinkish scars, small clawed fore flippers, broad hind flippers sweeping side to side, huge eyes,
  and a floppy wrinkled trunk-like proboscis swinging over the snout. Neutral. No hooks.
* **mako** — shortfin mako: sleek indigo-blue body with a metallic sheen, white underside showing at the
  edges, long conical snout, big all-black eyes, short pectorals, crescent tail with keels on the tail
  stock. `sprintK` (body straightened, fins swept back, motion streaks, blue glow), `biteK` (jaw swings
  forward with long slender teeth, eyes roll white).
* **bronzewhaler** — copper/bronze requiem shark: coppery back with a sheen, pointed snout, long falcate
  pectorals, dusky fin tips, golden eyes. `biteK` (jaw forward, teeth showing, nictitating membranes close).
* **sixgill** — bluntnose sixgill: thick dark body, broad blunt rounded head, six gill slits, round paddle
  pectorals, a single small dorsal set far back, a long low tail with a notch near its tip, glowing green
  eyes. `vis` (0–1 visibility: at 0 only a faint shimmering edge and the green eye glints show; an
  undefined `vis` counts as 1, so the codex and gallery show it), `tele` (tenses and trembles, gills
  flare, mouth parts slightly, eyes glow brighter), `lunge` (body straight and stretched, mouth wide open
  with broad teeth, streaks). NB the game also multiplies `globalAlpha` by `e.vis` for `camo` kinds.
* **manta** — giant oceanic manta seen from above: black diamond of crescent wings flapping slowly (span
  foreshortens through the stroke, wings catch the light as they rise), white shoulder patches with the
  black "T" between them, a paler rim of the white underside, rolled cephalic fins either side of the
  wide mouth, eyes on the sides of the head, short whip tail with a little dorsal fin. Neutral. No hooks.
* **tigershark** (boss) — tiger shark: broad body, short square snout, dark tiger bars across a grey-brown
  back with spots on the head, darker fins, big jaws (`H.hd`: lateral lines, snout pores, labial furrows,
  scars). `gapeK` (jaw thrown wide forward into a huge round gape with a dark throat, head bulging, gills
  flaring, water streaming in), `biteK` (jaw forward, cockscomb teeth, nictitating membranes close),
  `sickK` (poisoned: pale and greenish, eyes rolled, slow lazy tail, drooping fins, sluggish wobble,
  greenish bubbles).
* **giantsquid** (boss) — giant squid: long red-brown mantle with a heart of fins at −x, the huge eyes
  on the head, 8 long sucker-lined arms and 2 very long feeding tentacles (at rest to ~+2.9) ending in
  toothed clubs. `grabK` (tentacles shoot out straight ahead to ~+4.2, clubs open, arms spread showing the
  beak), `eyeK` (eyes glow gold: it has spotted you), `inkK` (ink cloud behind, it blanches), `cut`
  (array `[a, b]` of 0–1 for the tentacle on the −y and +y side: the tip is bitten away, club first, down
  to a ragged stump with a haze of blue blood at 1). Also export `tentaclePos(e, T, i)` → `{x, y}` in unit
  space: where club (or stump end) `i` is at game time `T` (same `T` as `drawSpecies`, like `lurePos`).

### T10 — whale-shark scale (10–30 m): the open ocean's giants and the swarms they feed on
The player here is a 15 m whale shark, a filter feeder. Whales beat their flukes up and down, so from above
their bodies barely sway: the stroke shows as the notched flukes foreshortening. Dorsal fins and spouts lean
towards −y (like the T6 fins) so their height reads from above. The giants reach well outside the unit
circle along x (extents below), so give them several collision circles or a capsule. The three swarms are
pre-baked point tables (a few paths each, cheap); they thin out as they are eaten (`e.hp / e.maxHp`), and
their LOD is a soft glow blob.
* **krillcloud** — a loose glowing cloud of ~240 tiny pink-orange krill specks milling round (a few swim
  against the swirl), denser to radius ~1 with a fuzzy fringe to ~1.4, blue bioluminescent glints winking
  on and off; black eyes close up. Prey. No hooks.
* **baitball** — ~150 silver sardines in 8 rings milling round a centre (inner rings faster), each flashing
  white as its flank turns to the light, blue-green backs close up. Prey. No hooks.
* **eggcloud** — ~30 drifting bundles of pink and orange coral egg beads (glossy spheres, the eggs inside
  visible close up), glowing faintly. Prey. No hooks.
* **orca** — x ≈ +1.2 … −1.7. Glossy black, white eye patches at the sides of the head, grey saddle
  behind the tall leaning dorsal fin, black paddle flippers; the codex portrait shows it banking. Predator,
  also the boss pod (`H.hd`: tooth rakes, a sheen down the back). `sprintK` (body straight, faster fluke
  stroke, flippers tucked, motion streaks), `biteK` (lower jaw swings forward ahead of the snout: pink
  mouth, big conical teeth top and bottom), `flipK` (rolls onto its side: the white belly and flank patch
  swing into view, the dorsal fin swings out to −y in profile, the flukes turn edge-on and show their
  pale undersides), `breathK` (a bushy spout of mist from the blowhole).
* **whitetip** — oceanic whitetip: stocky bronze-grey shark, blunt rounded snout, huge rounded paddle
  pectorals, big rounded first dorsal, every fin tipped mottled white; pilot fish ride its bow wave close
  up. Predator. `biteK` (lower jaw swings forward, serrated teeth, eyes roll white); also `sprintK` (body
  straight, fins swept back, motion streaks).
* **bluewhale** — x ≈ +3.1 … −3.25. Very long slender mottled blue-grey body, broad flat U-shaped head with
  a single median ridge running to the splash guard in front of the twin blowholes, long thin flippers, a
  small dorsal fin far back, wide flukes, slow stroke. Neutral giant, also the ending (`H.hd`: denser
  mottling, a sheen down the back, the tail-stock keel). `breathK` (a tall column of mist).
* **spermwhale** (boss) — x ≈ +1.27 … −2.35 (the codex portrait recentres it). Box-shaped head a third of
  its length with pale scars (and round squid-sucker scars when `H.hd`), the S-shaped blowhole at its front
  left, wrinkled skin behind, small paddle flippers, a low hump then a row of knuckles, broad triangular
  flukes. `clickK` (echolocation, as a strength: a bright flash at the front of the head and arcs of sound
  that travel outwards from it on their own from `t`), `sleepK` (logging at the surface: perfectly still,
  eyes closed, its wet back showing, slow ripples, bubbles and a lazy blow angled forward-left every few
  seconds), `biteK` (the long narrow lower jaw swings out from under the head ahead of the snout: white,
  pink-grooved, two rows of conical teeth, a dark gape under the head).
