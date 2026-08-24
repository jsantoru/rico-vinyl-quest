# Rico's Vinyl Quest — Mini-Game Refactor

This is the first structural refactor of `game(9).js`. The mini-games and their shared infrastructure have been moved out of the main game file. The intent is to reduce the size of `game.js` while preserving the existing gameplay architecture and function names.

## Load order

These are classic scripts, not ES modules. **Every file below must be loaded before `game.js`.** This preserves access to the game's existing global state without requiring a large rewrite of the current engine.

```html
<script src="minigames/minigame-core.js"></script>
<script src="minigames/darts.js"></script>
<script src="minigames/beatmatch.js"></script>
<script src="minigames/beatjam.js"></script>
<script src="minigames/whackpigeon.js"></script>
<script src="minigames/cratedig.js"></script>
<script src="minigames/speedsweep.js"></script>
<script src="minigames/staringcontest.js"></script>
<script src="minigames/buildpizza.js"></script>
<script src="minigames/clawmachine.js"></script>
<script src="minigames/scratchdj.js"></script>
<script src="game.js"></script>
```

Do not load the original `game(9).js` alongside the refactored `game.js`.

## Extracted pieces

### Shared core
`minigame-core.js` contains:
- `enterMinigame()` / `exitMinigame()`
- `MINIGAME_ACTIONS`
- `MINIGAME_TROPHIES` and trophy helpers
- lazy Three.js loading
- shared Three.js renderer cache
- shared ambience helpers
- `createMiniFX()`
- shared mode-selection menu
- shared arcade-sign rendering

### Individual games
- `darts.js`
- `beatmatch.js`
- `beatjam.js`
- `whackpigeon.js`
- `cratedig.js`
- `speedsweep.js`
- `staringcontest.js`
- `buildpizza.js`
- `clawmachine.js`
- `scratchdj.js`

## Deliberate scope

This pass does **not** redesign the mini-games, change their mechanics, change their scoring, or convert the whole project to ES modules. It is intentionally a low-risk extraction. The next refactors can tackle the player, UI, world/level data, asset loading, etc. one system at a time.
