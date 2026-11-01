# Tiny Cell

You are a single cell in a young ocean. Drag to swim, eat what is smaller, flee what is bigger, and pick a new mutation every time you grow. Survive five depths, beat the Colossal Amoeba and the Phage Queen, and spend the DNA you earn on permanent genome upgrades. Going deeper awakens older Ocean Ages with more food, new species and tougher bosses.

**Play:** https://fran-mora.github.io/tiny-cell/

Works offline: open it once while online, then add it to your Home Screen (iPhone: Share → Add to Home Screen).

## Build
Plain ES modules, no build step, no dependencies.
- `js/game/` the roguelike itself (Canvas 2D)
- `js/main.js` home screen, genome, codex, records, Ocean Ages
- `tools/build_sw.py` regenerates `sw.js` and the build number; run it after changing files
- `tools/make_icons.py` draws the app icon
