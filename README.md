# Tiny Cell

You are a single cell in a young ocean. Drag to swim, eat what is smaller and flee what is bigger. Cross 48 levels in 8 habitats, beat a boss at the end of each, and pick a permanent trait every time your evolution bar fills. Along the way you evolve from a single cell into a colony, a multicellular body, a swimmer and finally a sea creature. Die and you retry the same level, keeping everything you have earned.

**Play:** https://fran-mora.github.io/tiny-cell/

Works offline: open it once while online, then add it to your Home Screen (iPhone: Share → Add to Home Screen).

## Build
Plain ES modules, no build step, no dependencies.
- `js/game/` the game itself (Canvas 2D): `game.js` engine, `campaign.js` levels, habitats, bosses and stages, `cinematics.js` death, level-clear, evolution and level transitions, `art.js` drawing
- `js/main.js` home screen, journey, traits, codex, records
- `tools/build_sw.py` regenerates `sw.js` and the build number; run it after changing files
- `tools/make_icons.py` draws the app icon
- Add `?debug` to the URL for a `window.__mb` test hook
