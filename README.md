# Tiny Cell

You are a single cell in a young ocean. Drag to swim, eat what is smaller and flee what is bigger. Cross 80 levels in 16 habitats and pick a permanent trait every time your evolution bar fills. Every 10 levels you evolve and the world changes scale around you: a single cell, a colony, a flatworm, a primordial fish, a jawed fish, a pufferfish, a sailfish and an ocean sunfish, each with its own cast of real creatures and its own power. Each habitat ends with a boss you beat its own way, from luring a giant amoeba into sunlight to choking a giant grouper by inflating in its mouth or parrying a swordfish with your bill. After the journey, the Open Ocean offers endless expeditions and boss rematches. Die and you retry the same level, keeping everything you have earned.

**Play:** https://fran-mora.github.io/tiny-cell/

Works offline: open it once while online, then add it to your Home Screen (iPhone: Share → Add to Home Screen).

## Build
Plain ES modules, no build step, no dependencies.
- `js/game/` the game itself (Canvas 2D): `game.js` engine, `campaign.js` levels, habitats, bosses, stages and the Open Ocean, `ecology.js` every creature and the size tier it lives at, `bosses.js` the boss fights, `threats.js` threat intros and ranged attacks, `cinematics.js` death, level-clear, evolution and level transitions, `art.js` drawing (microbes and the player)
- `js/game/creatures/` art for the bigger creatures, one module per size tier (see the README there); `dev/creatures.html` previews them
- `js/main.js` home screen, journey, traits, codex, records
- `tools/build_sw.py` regenerates `sw.js` and the build number; run it after changing files
- `tools/make_icons.py` draws the app icon
- Add `?debug` to the URL for a `window.__mb` test hook
