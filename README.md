# RAMPART

*A knight's climb at dusk.* A 3D voxel platformer with knight combat, built with three.js and a hand-rolled AABB character controller. No build step.

**Premise:** the keep is under siege. Climb from the courtyard to the wall, fight along the battlements, ride the hoist, spiral up the keep, and raise the banner.

## Run

```
python serve.py 5822
```

Open http://localhost:5822. The server sends `no-store` so module edits always reload.

## Controls

WASD move · mouse orbit · Space jump / double jump · Shift dash (dodge, once in the air) · LMB three-hit sword · Q / MMB hold for charged heavy (breaks shields) · RMB block, last-instant block = parry · F shield bash · Ctrl/C ground pound · E kick ladder · Tab lock-on · R checkpoint · T tuning panel.

## Enemies

- **Siege grunt** — melee pressure, two hits to kill.
- **Crossbowman** — perched; forces movement or blocks. Parried bolts fly back.
- **Shield-bearer** — lights clank off the front; heavy, bash or pound breaks the guard.
- **Ladder swarm** — climb the outer wall in waves; kick the ladder to drop them.
- **The Siege Captain** — at the top of the keep. Doesn't flinch from light attacks.

Only one melee foe winds up at a time (attack token).

## Headless testing

`RAMPART.step(dt, input)`, `RAMPART.sim([[seconds, input], ...])`, `RAMPART.teleport(x,y,z)`, `RAMPART.state()`, `RAMPART.game.noEnemies = true`. Inputs: `mx, mz, jump, jumpHeld, dash, light, heavy, heavyHeld, block, bash, pound, interact, lock`.

## Layout

- `src/physics.js` — AABB world, moving platforms, body mover with step-up and coyote-friendly ground probe
- `src/player.js` — movement + combat state machine, all tuning in `P`
- `src/enemies.js` — five enemy types, bolts
- `src/level.js` — courtyard → wall walk → hoist → keep spiral → arena
- `src/camera.js` — orbit chase cam with collision pull-in, auto-settle, lock-on
- `src/voxel.js` — merged-box geometry and character rigs
- `src/audio.js` — WebAudio sfx + procedural siege score
- `src/main.js` — scene, input, HUD, loop, headless API
