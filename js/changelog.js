// Player-facing release notes, newest first.
export const CHANGELOG = [
  { build: 9, title: 'Dying, diving and evolving', notes: [
    'Dying is a proper moment now: time slows, your membrane tears open, the insides spill out and the nucleus flickers out. The screen also tells you what killed you.',
    'Try again and your cell re-forms from drifting specks of itself.',
    'Clearing a level pulls golden light into you. Going on dives you down through rushing water straight into the next level, with no black screen.',
    'Arriving in a new habitat shows its name with a line about the place.',
    'Beating the Great Ciliate, Rotifer Tyrant, Colossus Prime or Diatom Leviathan plays your metamorphosis right there in the water.',
    'Hunters lose interest once you have won a level, so they no longer crowd the celebration.',
  ] },
  { build: 8, title: 'Clearer damage, no pile-ups', notes: [
    'Fixed: some levels started with a blank screen because hunters spawned before the camera existed.',
    'When something hurts you, the screen edges flash red, your health pill pulses and a label says what is hurting you (UV light, toxic cloud, vent heat, a hunter...).',
    'Floating numbers show damage you take and deal.',
    'Cells you hurt show a health bar, so you can see your toxins, spikes and stings working.',
    'Cells push each other apart instead of piling up on top of one another.',
  ] },
  { build: 7, title: 'The evolution journey', notes: [
    '48 levels across 8 habitats: Sunlit Shallows, Kelp Twilight, Midnight Gyre, Violet Abyss, Green Sea, Ember Vents, Glass Reef and the Origin Trench.',
    'A boss ends every habitat: Colossal Amoeba, Great Ciliate, Phage Queen, Rotifer Tyrant, Volvox Titan, Colossus Prime, Diatom Leviathan and the Progenitor.',
    'Die and you retry the same level. Traits and evolution progress are never lost.',
    'Eating fills your evolution bar. Each time it fills you pick a trait that stays for the whole journey.',
    'Five body stages: Single Cell, Colony, Multicellular, Swimmer and Sea Creature, each with its own look, more trait slots and new traits (guard cells, jaws, stinging cells, fins, eyes, shell, tentacles, gills and more).',
    'When your body is full, a new trait replaces one you choose.',
    'New home screen with your Journey map and Traits. The DNA shop is gone: traits are your upgrades now.',
  ] },
  { build: 5, title: 'Quiet exit', notes: ['Fixed the harsh noise when closing or switching away from the app: sound now fades out instantly and music restarts cleanly when you come back.'] },
  { build: 3, title: 'Calmer start', notes: ['The game opens straight onto the home screen: no welcome popup. Look around and dive when you\u2019re ready.', 'The tip about spending DNA after your first dive is now a quiet message instead of a popup.'] },
  { build: 1, title: 'Tiny Cell is its own game', notes: [
    'The microbe dives from Tiny World are now a standalone game with their own home screen.',
    'Ocean Ages: six ages of richer, stranger and more dangerous water, unlocked by how deep you get and which bosses you beat. Each age pays +10% DNA.',
    'Genome upgrades, Codex and Records live right on the home screen.',
    'Your genome, codex and records from Tiny World were brought across automatically.',
    'Fixed: once every mutation was maxed, the level-up screen was empty and the dive froze. You now get repeatable rewards instead.',
  ] },
];
