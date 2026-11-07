// Tiny World — Microbe mode public API.
// A 2D action roguelike: you are a single cell in the primordial ocean. Each run earns DNA.
import { MICROBE_SPECIES as SPECIES, MUTATIONS as MUTS, GENOME_UPGRADES as GENOME } from './data.js';
import { portrait as drawPortrait } from './art.js';
import { startGame } from './game.js';
import * as C from './campaign.js';
import { ABILITIES } from './abilities.js';
// active powers in button order
export const ABILITY_IDS = ABILITIES.map((a) => a.id);
export { STAGES, HABITATS, BOSSES, levelConfig, TOTAL_LEVELS, LEVELS_PER_HABITAT, EVOLVE_AFTER, stageForCleared, evoNeed, TRAIT_FROM, OCEAN_HABS, STAGE_POWER, FINAL_POWER, SHOAL_STAGE, POWER_NAMES, powersFor, traitForm, loadoutFor, LOADOUT_SIZE, newestPower, LIVE_HABITATS, LIVE_STAGE } from './campaign.js';

// Codex entries for every enemy / prey / boss: { id, name, desc, firstEra }
export const MICROBE_SPECIES = SPECIES.map(({ id, name, desc, firstEra }) => ({ id, name, desc, firstEra }));

// Mutations offered on level-up: { id, name, desc, maxLevel, rarity, tags }
export const MUTATIONS = [...MUTS, ...C.NEW_MUTATIONS.filter((m) => (m.stage || 1) <= C.LIVE_STAGE)].map(({ id, name, desc, maxLevel, rarity, tags, stage, lv, active }) => ({ id, name, desc, maxLevel, rarity, tags: tags.slice(), stage: stage || 1, lv, active: !!active }));

// Permanent upgrades bought with DNA: { id, name, desc, maxLevel, cost(level), effect(level) }
export const GENOME_UPGRADES = GENOME.map(({ id, name, desc, maxLevel, cost, effect }) => ({ id, name, desc, maxLevel, cost, effect }));

// kind: 'microbe' | 'mutation' | 'genome' -> HTMLCanvasElement (transparent background, CSS size = size px)
// stage: the body a trait is shown on (fish bodies show the fish form of early traits)
export function portrait(kind, id, size = 96, stage) {
  return drawPortrait(kind, id, size, stage);
}

// opts: { host, era, genome, codex, settings, firstRun, dnaMult, onExit }
// returns { destroy(), pause(), resume() }
export function startMicrobeRun(opts = {}) {
  if (!opts.host) throw new Error('startMicrobeRun: opts.host is required');
  const game = startGame(opts);
  const handle = {
    destroy() { game.destroy(); if (window.__mb && window.__mb.game === game) window.__mb = null; },
    pause() { game.pause(true); },
    resume() { game.resume(); },
  };
  // debug hook only when explicitly requested (dev harness)
  if (opts.debug) window.__mb = game.debug();
  return handle;
}
