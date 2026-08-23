import * as THREE from '../vendor/three.module.js';
import { Box } from './physics.js';
import { boxesMesh, MAT } from './voxel.js';

const C = {
  stone: '#7d7a72', stoneD: '#5f5c55', stoneL: '#9a968c', ground: '#6b6a4f', dirt: '#5c4a36',
  wood: '#6e4b2a', woodD: '#4a3119', roof: '#6a2f2a', iron: '#3a3d44', gold: '#c9a24a', banner: '#7a1f1f',
  grass: '#66854a', grassD: '#53713c', rock: '#7d7468', rockD: '#645c52', rockL: '#8f867a',
};

// PENNANT VALE — one open level, Bob-omb-Battlefield shaped:
// a winding ~60s climb from a meadow, over a broken bridge, past a siege camp and a
// watchtower, up to the castle courtyard and the keep spiral. Four crests, all live at once.
export function buildLevel(world) {
  const L = { static: [], spawns: [], ladders: [], checkpoints: [], platforms: [], props: new THREE.Group(), goal: null, torches: [] };
  const stat = L.static;

  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jit = (c) => { if (typeof c !== 'string' || !c.startsWith('#') || c.length !== 7) return c; const k = 0.93 + rnd() * 0.14; const n = parseInt(c.slice(1), 16); const r = Math.min(255, ((n >> 16) & 255) * k) | 0, g = Math.min(255, ((n >> 8) & 255) * k) | 0, b = Math.min(255, (n & 255) * k) | 0; return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); };
  const block = (x, y, z, w, h, d, c, opts = {}) => {
    if (!opts.noCollide) world.add(new Box(x, y, z, w, h, d, opts));
    stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) });
  };
  const deco = (x, y, z, w, h, d, c) => stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) });
  const crate = (x, y, z, s = 1.1) => block(x, y, z, s, s, s, rnd() < 0.5 ? C.wood : C.woodD);
  const barrel = (x, y, z) => { block(x, y, z, 0.9, 1.1, 0.9, C.wood); deco(x, y + 0.3, z, 0.96, 0.08, 0.96, C.iron); deco(x, y + 0.75, z, 0.96, 0.08, 0.96, C.iron); };
  const hay = (x, y, z) => block(x, y, z, 1.3, 0.9, 1.1, '#b89a4a');
  const brazier = (x, y, z) => { deco(x, y, z, 0.7, 0.9, 0.7, C.iron); deco(x, y + 0.9, z, 0.9, 0.25, 0.9, C.iron); L.torches.push({ x, y: y + 1.25, z }); };
  const arrows = (x, y, z, n = 4) => { for (let i = 0; i < n; i++) deco(x + (rnd() - 0.5) * 1.4, y, z + (rnd() - 0.5) * 1.4, 0.06, 0.7 + rnd() * 0.3, 0.06, C.woodD); };
  const rubble = (x, y, z, n = 5) => { for (let i = 0; i < n; i++) deco(x + (rnd() - 0.5) * 2.2, y, z + (rnd() - 0.5) * 2.2, 0.3 + rnd() * 0.5, 0.2 + rnd() * 0.4, 0.3 + rnd() * 0.5, rnd() < 0.5 ? C.rockD : C.rock); };
  const slits = (x, y, z, n, dx, dz) => { for (let i = 0; i < n; i++) deco(x + dx * i, y, z + dz * i, dx ? 0.3 : 0.06, 1.4, dz ? 0.3 : 0.06, '#1a1418'); };
  const crenels = (x0, x1, y, z, c = C.stoneL) => { let k = 0; for (let x = x0; x <= x1; x += 2) { block(x, y, z, 0.9, k++ % 3 === 2 ? 0.45 : 0.7, 0.7, c); } };
  const stairs = (x, y, z, dir, steps, rise = 0.4, run = 0.7, width = 3, c = C.stone) => {
    for (let i = 0; i < steps; i++) {
      const sx = x + dir.x * run * i, sz = z + dir.z * run * i;
      const w = dir.x ? run + 0.02 : width, d = dir.z ? run + 0.02 : width;
      block(sx, y, sz, w, rise * (i + 1), d, i % 2 ? c : C.stoneD);
    }
  };
  L.signs = []; L.tutorial = []; L.pennants = [];
  const sign = (x, y, z, text, facing = 0) => L.signs.push({ x, y, z, text, facing });
  const pennant = (x, y, z) => L.pennants.push({ x, y, z });

  // terrain kit: a grass-topped pad and a rock ramp of shelves
  const pad = (x, z, w, d, top, th = 7, c = C.grass) => {
    block(x, top - th, z, w, th, d, C.rock);
    deco(x, top - 0.01, z, w, 0.04, d, c);
    deco(x, top - 0.5, z, w + 0.24, 0.5, d + 0.24, c === C.dirt ? '#6a5840' : C.grassD);           // grass lip overhang
    for (let sy = top - th + 0.6; sy < top - 1.2; sy += 1.5 + rnd()) deco(x, sy, z, w + 0.1 + rnd() * 0.16, 0.28, d + 0.1 + rnd() * 0.16, rnd() < 0.5 ? C.rockD : '#615a52');  // strata bands
  };
  const shelves = (x0, z0, x1, z1, y0, y1, w, n) => {   // n shelf-steps from (x0,z0,y0) → (x1,z1,y1)
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1); const sx = x0 + (x1 - x0) * t, sz = z0 + (z1 - z0) * t, sy = y0 + (y1 - y0) * (i / n);
      const len = Math.hypot(x1 - x0, z1 - z0) / n + 1.4;
      const horiz = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      block(sx, sy - 4, sz, horiz ? len : w, 4 + 0.45, horiz ? w : len, i % 2 ? C.rock : C.rockD);
      deco(sx, sy + 0.44, sz, (horiz ? len : w) - 0.2, 0.03, (horiz ? w : len) - 0.2, i % 2 ? C.grass : C.grassD);
      deco(sx, sy + 0.1, sz, (horiz ? len : w) + 0.18, 0.34, (horiz ? w : len) + 0.18, C.grassD);
    }
  };
  const tuft = (x, y, z) => { deco(x, y, z, 0.25, 0.22 + rnd() * 0.2, 0.25, rnd() < 0.5 ? '#5f7a3a' : '#4e6a30'); deco(x + 0.3, y, z + 0.2, 0.2, 0.18, 0.2, '#5a7236'); };
  L.trees = [];
  const pine = (x, y, z, s = 1) => { block(x, y, z, 0.4 * s, 1.6 * s, 0.4 * s, C.woodD); L.trees.push({ x, y, z, s, kind: 'pine' }); };
  const routePost = (x, y, z) => { deco(x, y, z, 0.18, 2.6, 0.18, C.woodD); deco(x + 0.35, y + 1.9, z, 0.75, 0.55, 0.06, '#b03a3a'); deco(x + 0.28, y + 2.42, z, 0.5, 0.3, 0.05, '#8a2d2d'); };
  const statue = (x, y, z, ry = 0) => {   // the FALLEN KNIGHT: a mossy memorial of the war
    deco(x, y, z, 3.4, 0.7, 3.4, C.stoneL); deco(x, y + 0.7, z, 2.6, 0.5, 2.6, C.stone);
    deco(x, y + 1.2, z, 1.0, 2.1, 1.0, '#8a8a94'); deco(x, y + 3.3, z, 0.62, 0.62, 0.62, '#8a8a94');
    deco(x + 0.75, y + 1.5, z + 0.2, 0.28, 2.4, 0.28, '#9a9aa4');                       // raised sword arm
    deco(x + 0.75, y + 3.9, z + 0.2, 0.16, 1.3, 0.16, '#c8ccd4');
    deco(x - 0.72, y + 1.7, z, 0.5, 1.1, 0.24, '#7a7a84');                              // shield
    deco(x, y + 0.7, z + 1.15, 1.8, 0.28, 0.3, C.stoneD);
    for (let i = 0; i < 4; i++) deco(x - 1.4 + rnd() * 2.8, y + 0.7 + rnd() * 1.4, z - 1.2 + rnd() * 2.4, 0.3, 0.2, 0.3, '#4f6a3a');  // moss
  };
  const trebuchet = (x, y, z) => {
    deco(x - 1.2, y, z, 0.4, 2.6, 0.4, C.woodD); deco(x + 1.2, y, z, 0.4, 2.6, 0.4, C.woodD);
    deco(x, y + 2.4, z, 3.2, 0.35, 0.35, C.wood); deco(x, y + 2.5, z, 0.35, 0.35, 5.6, C.wood);
    deco(x, y + 2.6, z - 2.9, 0.9, 0.9, 0.9, C.rockD); deco(x, y + 1.2, z + 2.6, 0.25, 1.5, 0.25, '#5a4630');
    deco(x, y, z + 1.4, 2.6, 0.5, 1.4, C.woodD); boulder(x + 2.2, y, z + 1.2, 0.8); boulder(x + 2.9, y, z + 0.5, 0.6);
  };
  const stones = (x, y, z) => { for (let k = 0; k < 6; k++) { const a2 = k / 6 * Math.PI * 2; deco(x + Math.cos(a2) * 3.4, y, z + Math.sin(a2) * 3.4, 0.9, 2.2 + (k % 3) * 0.7, 0.7, k % 2 ? C.rockL : C.rock); } deco(x, y, z, 1.6, 0.4, 1.6, C.stoneL); };
  const aqueduct = (x, y, z, n = 3) => { for (let k = 0; k < n; k++) { const zz = z + k * 4.4; deco(x - 1.7, y, zz, 1.0, 5.2, 1.0, C.stoneL); deco(x + 1.7, y, zz, 1.0, 5.2, 1.0, C.stoneL); deco(x, y + 5.2, zz, 4.6, 0.8, 1.4, C.stone); deco(x, y + 4.4, zz, 2.4, 0.9, 1.0, C.stoneD); } deco(x, y + 6.0, z + (n - 1) * 2.2, 1.2, 0.6, (n - 1) * 4.4 + 1.4, C.stoneD); };
  const millwheel = (x, y, z) => { for (let k = 0; k < 8; k++) { const a2 = k / 8 * Math.PI * 2; deco(x, y + 2.2 + Math.sin(a2) * 1.9, z + Math.cos(a2) * 1.9, 0.35, 0.9, 0.9, C.woodD); } deco(x, y + 2.2, z, 0.5, 0.7, 0.7, '#5a4630'); deco(x - 0.5, y + 2.2, z, 0.3, 4.4, 0.3, C.woodD); deco(x, y, z + 2.8, 2.2, 3.4, 2.6, C.wood); deco(x, y + 3.4, z + 2.8, 3.0, 0.6, 3.2, C.roof); };
  const boulder = (x, y, z, s = 1) => { block(x, y, z, 1.6 * s, 1.1 * s, 1.4 * s, rnd() < 0.5 ? C.rock : C.rockL); deco(x + 0.3 * s, y, z + 0.2 * s, 1.2 * s, 0.5 * s, 1.0 * s, C.rockD); };
  const oak = (x, y, z, s = 1) => { block(x, y, z, 0.5 * s, 2.1 * s, 0.5 * s, '#5a4028'); L.trees.push({ x, y, z, s, kind: 'oak' }); };
  const bush = (x, y, z, s = 1) => { deco(x, y, z, 1.2 * s, 0.7 * s, 1.1 * s, '#42603a'); deco(x + 0.4 * s, y, z + 0.3 * s, 0.8 * s, 0.55 * s, 0.8 * s, '#4c6a3e'); };
  const flowers = (x, y, z, n = 5) => { const cols = ['#d8c050', '#c05050', '#c8c8e0', '#d07840']; for (let i = 0; i < n; i++) { const fx = x + (rnd() - 0.5) * 2.4, fz = z + (rnd() - 0.5) * 2.4; deco(fx, y, fz, 0.08, 0.28, 0.08, '#4e6a30'); deco(fx, y + 0.28, fz, 0.16, 0.12, 0.16, cols[(rnd() * 4) | 0]); } };

  // ============================ THE VALLEY ============================
  // Heights: meadow -30 → camp -24 → terrace -16 → shelf -8 → castle gate 0.

  // --- meadow (spawn)
  pad(0, -136, 56, 34, -30, 9);
  L.start = { x: 0, y: -29.9, z: -146 };
  L.checkpoints.push({ x: 0, y: -29.9, z: -146, name: 'The meadow' });
  sign(5, -30, -143, 'WASD to move\nmouse to look\nSPACE to jump', Math.PI);
  L.tutorial.push({ z: -144, key: 'jump', text: 'Welcome to the Vale. Four crests are hidden here.' });
  for (let i = 0; i < 14; i++) tuft(-24 + rnd() * 48, -30, -150 + rnd() * 28);
  pine(-20, -30, -147, 1.2); pine(24, -30, -141, 1.0); pine(-24, -30, -128, 1.4); pine(18, -30, -126, 0.9);
  oak(12, -30, -144, 1.1); oak(-8, -30, -125, 1.3); bush(-18, -30, -140); bush(22, -30, -134); bush(2, -30, -150);
  flowers(6, -30, -138, 7); flowers(-20, -30, -132, 6); flowers(16, -30, -128, 5); flowers(-6, -30, -147, 6);
  boulder(-20, -30, -136, 1.3); boulder(16, -30, -148, 1);
  statue(22, -30, -120);
  // training corner: a pell and an archery target by the spawn
  deco(-6, -30, -141, 0.3, 1.8, 0.3, C.woodD); deco(-6, -28.4, -141, 0.7, 0.7, 0.7, '#8a6a3a'); deco(-6, -29.1, -141, 0.9, 0.24, 0.9, '#6a4a2a');
  deco(-9, -30, -140, 0.25, 2.0, 1.6, C.wood); deco(-9.02, -29.3, -140, 0.1, 1.0, 1.0, '#d8cfa0'); deco(-9.05, -29.05, -140, 0.1, 0.5, 0.5, '#b03a3a'); deco(-9.08, -28.92, -140, 0.1, 0.22, 0.22, '#e8d8a0');
  routePost(8, -30, -136); routePost(6, -30, -124);
  // the pennant shrine: where the 8-pennant crest appears
  pad(-16, -142, 8, 8, -29.4, 8.6, C.stoneL);
  deco(-16, -29.4, -142, 5, 0.3, 5, C.stone); deco(-16, -29.1, -142, 3.4, 0.25, 3.4, C.stoneL);
  for (const [ox, oz] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) deco(-16 + ox, -29.4, -142 + oz, 0.5, 2.2, 0.5, C.stoneD);
  deco(-16, -27.2, -142, 0.2, 2.4, 0.2, C.wood); deco(-15.5, -25.4, -142, 1.2, 0.8, 0.06, '#b03a3a');
  sign(-12.5, -29.4, -139.6, '8 red pennants\nraise a crest here', 2.6);
  L.shrine = { x: -16, y: -28.9, z: -142 };
  // the Squire, ready to race
  L.race = { start: { x: 8, y: -29.9, z: -142 } };
  pennant(20, -30, -132); pennant(-25, -30, -122);

  // --- gully + broken bridge (z -122 → -108)
  pad(0, -114, 56, 10, -35, 6, C.dirt);                     // gully floor
  // west bank hides THE GROTTO: roof + wall strips leave a cavity, mouth opening east
  block(-19, -31.4, -114, 18, 1.4, 10.4, C.rock); deco(-19, -30, -114, 18, 0.04, 10.4, C.grass);
  block(-19, -35, -117.9, 18, 3.6, 2.6, C.rock);
  block(-19, -35, -110.0, 18, 3.6, 2.2, C.rock);
  block(-26.5, -35, -114, 3, 3.6, 10.4, C.rockD);
  deco(-24, -34.99, -114, 2, 0.02, 4, '#3a3430'); deco(-13, -32.2, -115.5, 1.4, 0.8, 0.1, '#cfd6da'); deco(-12.4, -33.8, -112.8, 0.9, 0.5, 0.1, '#cfd6da');
  L.torches.push({ x: -23, y: -33.4, z: -114 });
  L.grotto = { x: -23.5, y: -34.9, z: -114 };
  // bridge over the gully at meadow height, BROKEN in the middle (5.5m — long jump, or drop & climb)
  const bw = 4.4;
  block(4, -30.6, -111.6, bw, 0.6, 5.6, C.wood); block(4, -30.6, -116.4, bw, 0.6, 0.1, C.woodD);
  block(4, -30.6, -121.8, bw, 0.6, 6.2, C.wood);
  deco(2.2, -30, -110.4, 0.25, 1.1, 0.25, C.woodD); deco(5.8, -30, -110.4, 0.25, 1.1, 0.25, C.woodD);
  deco(2.2, -30, -123.6, 0.25, 1.1, 0.25, C.woodD); deco(5.8, -30, -123.6, 0.25, 1.1, 0.25, C.woodD);
  deco(4, -35, -111, 0.4, 4.4, 0.4, C.woodD); deco(4, -35, -122, 0.4, 4.4, 0.4, C.woodD);
  sign(8.6, -30, -124.5, 'hold F: charge\nSPACE mid-charge:\nLONG JUMP the gap', Math.PI);
  L.tutorial.push({ z: -126, key: 'long', text: 'Hold F to charge — SPACE mid-charge for a LONG JUMP across the bridge' });
  // rubble ramps out of the gully on both banks (fall in, walk out)
  stairs(-8, -35, -116.2, { x: 0, z: 1 }, 14, 0.42, 0.55, 5.2, C.rock);
  stairs(-3.5, -35, -109.9, { x: -1, z: 0 }, 14, 0.42, 0.55, 2.2, C.rockD);   // wall-hugging ramp, mount from the east
  stairs(-2, -35, -112.4, { x: 0, z: -1 }, 13, 0.42, 0.55, 5.2, C.rockD);
  L.water = { x: 0, y: -34.72, z: -114, w: 55, d: 4.4 };
  block(0, -35, -114, 1.6, 0.75, 1.4, C.rockL);   // stepping stone carrying the stream pennant
  deco(0, -35.04, -114, 55, 0.05, 4.8, '#31424f');
  for (let wx = -24; wx < 26; wx += 4.5) { deco(wx, -34.98, -116.6, 2.6, 0.06, 0.5, '#8a8276'); deco(wx + 2, -34.98, -111.6, 2.2, 0.06, 0.5, '#8a8276'); }
  pennant(0, -34.25, -114);
  millwheel(-13.4, -35, -114);
  boulder(14, -35, -113, 1.2); tuft(-4, -35, -116, 1); tuft(10, -35, -111, 1);

  // --- rise A: gully's north bank → camp level (-24), west switchback (z -108 → -92)
  pad(0, -100, 56, 18, -29.2, 7);
  shelves(-14, -104, -14, -92, -29.2, -24, 9, 9);
  pine(8, -29.2, -100, 1.1); pine(-2, -29.2, -95, 0.8); boulder(18, -29.2, -98, 1);
  L.spawns.push({ kind: 'hound', x: 12, y: -29.1, z: -100 });
  routePost(-10, -29.2, -102); routePost(-10.5, -26.2, -94);
  L.tutorial.push({ z: -104, key: 'dash', text: 'SHIFT — dash. Works once in the air; it refreshes when you land or BOP a foe' });

  // --- siege camp plateau (-24), z -92 → -72
  pad(4, -82, 48, 22, -24, 8);
  L.checkpoints.push({ x: -10, y: -23.9, z: -88, name: 'Siege camp' });
  // tents, fire, supplies
  for (const [tx, tz, r] of [[-4, -84, 0], [8, -78, 0.6], [18, -85, -0.5]]) {
    deco(tx, -24, tz, 3.4, 2.5, 3.4, C.woodD); deco(tx, -21.5, tz, 4.2, 0.55, 4.2, C.roof); deco(tx, -20.95, tz, 3.1, 0.5, 3.1, C.roof); deco(tx, -20.45, tz, 0.2, 1.2, 0.2, C.wood);
  }
  deco(2, -24, -80, 1.4, 0.35, 1.4, C.iron); L.torches.push({ x: 2, y: -23.4, z: -80 });   // campfire
  crate(-9, -24, -79); crate(-9, -22.9, -79, 0.9); barrel(-7.6, -24, -80); hay(13, -24, -74); hay(14.3, -24, -74.4);
  arrows(6, -24, -86, 5); rubble(22, -24, -76, 4);
  L.spawns.push({ kind: 'grunt', x: -2, y: -23.9, z: -82, camp: true }, { kind: 'grunt', x: 12, y: -23.9, z: -79, camp: true });
  L.spawns.push({ kind: 'bomber', x: 18, y: -23.9, z: -86, camp: true });
  L.campArena = { x: 4, y: -24, z: -82 };
  bush(-16, -24, -84); flowers(-14, -24, -78, 4); oak(24, -24, -88, 1.0);
  trebuchet(-12, -24, -73);
  pennant(-9, -21.8, -79);                    // atop the crate stack
  pennant(-20, -24, -74);
  L.tutorial.push({ z: -90, key: 'combat', text: 'Grunts ahead — LEFT CLICK chains, BOP their heads, or CHARGE through them' });
  // ladders lean on the north rise: swarm trickles down into the camp; kick from above
  // (rise B to terrace -16 is just north)
  for (const lx of [-6, 10]) L.ladders.push({ x: lx, z: -71.6, bottom: -24, top: -16, facing: 0, up: true, respawn: 0, spawnEvery: 16, t: 6 + Math.random() * 3 });
  sign(2, -16, -69.3, 'CTRL in the air:\nground pound\nkicks ladders', Math.PI);

  // --- rise B: camp → terrace (-16), east side stairs (z -76 → -64)
  shelves(20, -76, 20, -64, -24, -16, 10, 14);
  pad(0, -62, 60, 16, -16, 8);
  L.tutorial.push({ z: -66, key: 'block', text: 'Hold RIGHT CLICK to block — at the last instant to PARRY' });
  pine(-22, -16, -64, 1.2); boulder(-16, -16, -60, 1.1); tuft(8, -16, -62, 1); tuft(-6, -16, -58, 1);
  oak(6, -16, -66, 1.2); bush(12, -16, -60); flowers(-2, -16, -62, 6); flowers(24, -16, -66, 4);
  stones(-4, -16, -66);
  routePost(16, -20.5, -70); routePost(17, -16, -62);

  // --- the watchtower (race finish): spur at west, base -16, top -3
  const WT = { x: -18, z: -58 };
  block(WT.x, -16, WT.z, 6, 10, 6, C.stoneD);
  for (let sy = -14.5; sy < -7; sy += 1.7) { deco(WT.x, sy, WT.z + 3.03, 5.8, 0.08, 0.05, '#4e4a44'); deco(WT.x + 3.03, sy, WT.z, 0.05, 0.08, 5.8, '#4e4a44'); }
  deco(WT.x, -16, WT.z + 3.06, 6.2, 0.5, 0.08, '#453e38');
  crenels(WT.x - 2, WT.x + 2, -6, WT.z + 3.2); crenels(WT.x - 2, WT.x + 2, -6, WT.z - 3.2);
  block(WT.x, -6, WT.z, 7, 0.6, 7, C.stone);
  deco(WT.x, -5.4, WT.z, 0.25, 4.5, 0.25, C.wood); deco(WT.x + 0.9, -2.2, WT.z, 1.7, 1.0, 0.07, '#b03a3a');   // the race flag
  for (let yy = -14.5; yy < -7; yy += 1.6) { deco(WT.x - 3.02, yy, WT.z, 0.04, 0.08, 5.8, '#4e4a44'); deco(WT.x + 3.02, yy, WT.z, 0.04, 0.08, 5.8, '#4e4a44'); }
  slits(WT.x - 3.05, -12, WT.z - 1.5, 2, 0, 1.5);
  // exterior stair to the top
  stairs(WT.x + 4.2, -16, WT.z - 5.6, { x: 0, z: 1 }, 8, 0.42, 0.6, 2.4, C.rock);
  block(WT.x + 4.2, -12.7, WT.z - 0.2, 2.4, 0.4, 1.6, C.stone);
  stairs(WT.x + 4.2 - 0.8, -12.4, WT.z + 1.4, { x: -1, z: 0 }, 9, 0.4, 0.62, 2.0, C.rock);
  block(WT.x - 2.2, -9, WT.z + 1.6, 2.2, 0.4, 1.8, C.stone);
  stairs(WT.x - 2.4, -8.7, WT.z + 0.4, { x: 0, z: -1 }, 6, 0.42, 0.6, 1.8, C.rock);
  L.spawns.push({ kind: 'crossbow', x: WT.x, y: -5.3, z: WT.z, perch: true });
  L.checkpoints.push({ x: WT.x + 4.2, y: -15.9, z: WT.z - 5.6, name: 'Watchtower' });
  L.raceFinish = { x: WT.x, y: -5.4, z: WT.z, r: 3.2 };
  pennant(WT.x - 6, -16, WT.z + 4);

  // --- rise C: terrace → shelf (-8), z -56 → -44, with a slider gap
  shelves(14, -58, 14, -46, -16, -8, 9, 12);
  pad(-2, -40, 52, 14, -8, 7);
  const sl1 = world.add(new Box(-4, -8.6, -47, 3, 0.4, 3, { moving: true, tag: 'slider' }));
  sl1.path = { a: { x: -12, y: -8.6, z: -47 }, b: { x: 2, y: -8.6, z: -47 }, period: 7, phase: 0.2 }; L.platforms.push(sl1);
  pennant(6, -8, -44);
  pine(-16, -8, -42, 1.0); tuft(-10, -8, -38, 1); boulder(20, -8, -40, 1.2);
  oak(-22, -8, -38, 1.1); bush(8, -8, -38); flowers(-4, -8, -42, 5);
  aqueduct(-14, -8, -44, 3);
  routePost(8, -8, -44); routePost(4, -5.5, -30);

  // --- castle approach: shelf → gate (0), z -40 → -16
  shelves(0, -34, 0, -20, -8, 0, 10, 12);
  sign(6, -8, -36, 'the castle gate\nis open', Math.PI);
  L.checkpoints.push({ x: 0, y: -0.4, z: -18, name: 'Castle gate' });
  // gate arch (open — no portcullis in the Vale); apron so there is no gap before the gate
  block(0, -2, -15, 4, 2, 2.2, C.ground); block(0, -2.4, -19, 8, 2.4, 6, C.rock); deco(0, -0.01, -19, 8, 0.02, 6, '#7a7468');
  deco(0, 6, -15, 6, 4, 2.2, C.stoneL); deco(-3.2, 0, -15, 0.6, 6, 2.4, C.stoneL); deco(3.2, 0, -15, 0.6, 6, 2.4, C.stoneL);
  L.torches.push({ x: -3.6, y: 4.5, z: -16.8 }, { x: 3.6, y: 4.5, z: -16.8 });

  // --- THE PEAKS: spire chain from the watchtower top, north-west, pure movement
  const spires = [ [-27, -50, 0], [-32, -40, 3.5], [-36, -30, 7], [-38, -19, 10.5] ];
  for (const [sx, sz, sy] of spires) { block(sx, sy - 26, sz, 2.6, 26, 2.6, C.rockD); deco(sx, sy - 0.05, sz, 2.9, 0.34, 2.9, C.grass); deco(sx, sy - 0.34, sz, 3.0, 0.2, 3.0, C.grassD); deco(sx, sy - 4, sz, 3.2, 0.5, 3.2, C.rock); for (let yy = sy - 22; yy < sy - 5; yy += 5) deco(sx, yy, sz, 2.72, 0.4, 2.72, rnd() < 0.5 ? C.rock : '#584f46'); }
  L.peakCrest = { x: spires[3][0], y: spires[3][2] + 0.6, z: spires[3][1] };
  sign(WT.x - 2.8, -5.4, WT.z - 2.4, 'the peaks:\nlong jumps west', -2.2);

  // --- valley rim: enclosing cliffs so the vale reads as a bowl
  block(-34, -38, -80, 10, 34, 150, C.rockD);   // west rim
  block(35, -38, -80, 12, 30, 150, C.rockD);    // east rim
  block(0, -36, -158, 80, 26, 10, C.rockD);     // south rim behind spawn
  for (let i = 0; i < 10; i++) { const rx = rnd() < 0.5 ? -30 - rnd() * 4 : 30 + rnd() * 5; deco(rx, -8 + rnd() * 6, -140 + rnd() * 120, 3 + rnd() * 4, 3 + rnd() * 5, 3 + rnd() * 4, C.rock); }
  for (let i = 0; i < 8; i++) pine(-30 + rnd() * 3, -4 + rnd() * 2, -130 + rnd() * 90, 0.8 + rnd() * 0.5);
  for (let i = 0; i < 22; i++) { const rx = rnd() < 0.5 ? -33 - rnd() * 3 : 34 + rnd() * 3; const rz = -150 + rnd() * 135; deco(rx, -6 + rnd() * 4, rz, 2.5 + rnd() * 3.5, 3 + rnd() * 6, 2.5 + rnd() * 3.5, rnd() < 0.5 ? C.rockD : '#5e564e'); }
  for (let i = 0; i < 12; i++) { const rz = -156 + rnd() * 8; deco(-36 + rnd() * 72, -12 + rnd() * 4, rz, 3 + rnd() * 4, 4 + rnd() * 7, 3 + rnd() * 3, C.rockD); }
  // strata on the rim's inner faces + AO base bands
  for (const [rx, face] of [[-28.9, 1], [28.9, -1]]) {
    for (let sy = -26; sy < -6; sy += 4.5) deco(rx + face * 0.06, sy + rnd() * 1.5, -80, 0.1, 0.5 + rnd() * 0.5, 148, rnd() < 0.5 ? '#57504a' : '#6d655c');
    deco(rx + face * 0.1, -30, -80, 0.14, 1.2, 148, '#453e38');
  }
  for (let sz = -156.9; sz < -152; sz += 100) deco(0, -26, sz + 0.05, 78, 0.6, 0.12, '#57504a');
  // crag undersides
  deco(0, -44, -100, 70, 9, 100, '#3e362e'); deco(0, -50, -95, 44, 7, 70, '#332c26');

  // ============================ THE CASTLE (summit) ============================
  block(0, -2, 10, 60, 2, 48, C.ground); deco(0, -0.01, 10, 60, 0.02, 48, C.ground);
  deco(-6, 0.0, 4, 6, 0.03, 5, C.dirt); deco(9, 0.0, 14, 7, 0.03, 4, C.dirt);
  for (let yy = 1.2; yy < 6.2; yy += 1.25) deco(0, yy, 29.98, 62, 0.08, 0.04, '#4e4a44');
  for (let yy = 1.5; yy < 9; yy += 1.6) { deco(-29.98, yy, 10, 0.04, 0.08, 52, '#4e4a44'); deco(29.98, yy, 10, 0.04, 0.08, 52, '#4e4a44'); }
  for (const [sx, sz, sw] of [[-16, 29.95, 3], [9, 29.95, 2.4], [22, 29.95, 3.5]]) { deco(sx, 0, sz, sw, 2.6 + rnd() * 1.5, 0.06, '#2a2220'); deco(sx + 0.4, 0, sz - 0.01, sw * 0.5, 1.2, 0.06, '#1a1412'); }
  // cobbled road, tufts, patches
  for (let z = -13; z < 29; z += 1.1) for (let x = -2.2; x <= 2.2; x += 1.1) deco(x + (rnd() - 0.5) * 0.2, 0.0, z + (rnd() - 0.5) * 0.2, 1.0, 0.04 + rnd() * 0.03, 1.0, rnd() < 0.5 ? '#7a7468' : '#6e6a5e');
  for (let i = 0; i < 26; i++) { const gx = -28 + rnd() * 56, gz = -12 + rnd() * 40; if (Math.abs(gx) < 3) continue; tuft(gx, 0, gz); }
  for (let i = 0; i < 9; i++) { const gx = -26 + rnd() * 52, gz = -12 + rnd() * 40; deco(gx, 0.0, gz, 2 + rnd() * 4, 0.025, 1.5 + rnd() * 3, rnd() < 0.5 ? C.dirt : '#615f48'); }
  // south wall (two segments + the open gate), side walls with a DOORWAY cut in the west wall at z 24..28
  block(-17, 0, -15, 28, 10, 2, C.stoneD); block(17, 0, -15, 28, 10, 2, C.stoneD);
  block(31, 0, -9.75, 2, 12, 12.5, C.stoneD); block(31, 0, 17.75, 2, 12, 36.5, C.stoneD); block(31, 6, -2, 2, 6, 4, C.stoneD);
  block(-31, 0, -2, 2, 12, 28, C.stoneD);        // west wall south segment (z -16..12)
  block(-31, 0, 18, 2, 12, 12, C.stoneD);        // west wall mid segment (z 12..24)
  block(-31, 8, 26, 2, 4, 4, C.stoneD);          // above the doorway (z 24..28): passage below at y 0..8? no — bridge crosses at 8
  block(-31, 0, 26, 2, 8, 4, C.stoneD, { tag: 'doorwall' });  // solid below the bridge opening
  block(-31, 0, 32, 2, 12, 8, C.stoneD);         // west wall north segment
  // north wall + gatehouse arch + walkway (solid, no gaps — a viewpoint now)
  block(0, 0, 32, 62, 6.5, 4, C.stone); deco(0, 0, 30.01, 62, 6.5, 0.02, C.stoneD);
  deco(0, 0, 29.9, 4, 5, 0.3, C.iron); deco(0, 5, 29.9, 6, 1, 0.3, C.stoneL);
  block(0, 6.5, 32, 60, 1.5, 4, C.stone);
  for (let x = -28; x < 28; x += 1.15) for (let z = 30.6; z < 33.6; z += 1.15) { if (rnd() < 0.2) continue; deco(x, 8.0, z, 1.05, 0.03 + rnd() * 0.02, 1.05, rnd() < 0.5 ? '#868078' : '#7a756c'); }
  crenels(-28, 28, 8, 33.6);
  block(0, 8, 30.3, 58, 0.4, 0.4, C.stoneD);
  block(0, 8, 30.35, 1.6, 3.2, 0.7, C.stoneL); block(0, 8, 33.75, 1.6, 3.2, 0.7, C.stoneL);
  block(0, 11.2, 32, 2.2, 0.8, 4.6, C.stoneL); deco(0, 12, 32, 6.4, 1, 3.8, C.roof); deco(0, 13, 32, 4.4, 1, 2.6, C.roof); deco(0, 14, 32, 2.2, 0.9, 1.4, C.roof); deco(0, 14.9, 32, 0.3, 2, 0.3, C.wood); deco(0.7, 15.9, 32, 1.4, 0.9, 0.06, C.banner);
  // east stair up to the walkway (the old one)
  stairs(26, 0, 4, { x: 0, z: 1 }, 20, 0.4, 0.8, 3.2);
  block(26, 7.6, 21.5, 3.2, 0.4, 4, C.stone); block(26, 7.6, 28.5, 3.2, 0.4, 3, C.stone);
  // towers at the wall ends
  block(30, 0, 32, 6, 12, 8, C.stoneD); block(-30, 0, 32, 6, 12, 8, C.stoneD);
  crenels(28, 32, 12, 36); crenels(28, 32, 12, 28);
  for (const tx of [30, -30]) { deco(tx, 12, 32, 6.6, 0.7, 8.6, C.stoneL); deco(tx, 12.7, 32, 5.2, 1.2, 7, C.roof); deco(tx, 13.9, 32, 3.6, 1.2, 5, C.roof); deco(tx, 15.1, 32, 2.0, 1.1, 3, C.roof); deco(tx, 16.2, 32, 0.3, 1.6, 0.3, C.wood); deco(tx + 0.6, 17.2, 32, 1.2, 0.7, 0.06, C.banner); }
  for (const [wx, wy, wz] of [[-30.98, 5, 6], [-30.98, 5, 16], [30.98, 5, 6], [30.98, 5, 16], [-30.98, 8.5, 32], [30.98, 8.5, 32]]) { deco(wx, wy, wz, 0.06, 1.1, 0.7, '#ffb45a'); }
  block(27.5, 8, 29.2, 1.2, 1.0, 1.2, C.stone); block(28.6, 8, 29.2, 1.2, 2.0, 1.2, C.stone); block(29.7, 8, 29.2, 1.2, 3.0, 1.2, C.stone);
  // props: garrison life
  block(-8, 0, 0, 1.2, 1.2, 1.2, C.wood); block(-9.2, 0, 0, 1.2, 0.6, 1.2, C.woodD); block(-8, 1.2, 0, 1.2, 1.2, 1.2, C.wood);
  block(5, 0, 2, 1.2, 0.5, 1.2, C.woodD); block(6.3, 0, 2, 1.2, 1.0, 1.2, C.wood);
  block(-3, 0, 8, 2, 2.2, 2, C.stoneD);
  block(12, 0, 6, 3, 1.2, 3, C.stoneD); block(12, 1.2, 6, 2, 1.0, 2, C.stone);
  block(-14, 0, 14, 2.4, 1.0, 2.4, C.stoneL); deco(-14, 1.0, 14, 1.6, 0.2, 1.6, C.iron);
  deco(-14.9, 1, 14, 0.2, 2.2, 0.2, C.wood); deco(-13.1, 1, 14, 0.2, 2.2, 0.2, C.wood); deco(-14, 3.1, 14, 2.4, 0.3, 1.2, C.roof);
  block(4, 0, 20, 3, 0.9, 1.6, C.woodD); deco(2.6, 0.1, 20, 0.3, 1.2, 1.2, C.iron); deco(5.4, 0.1, 20, 0.3, 1.2, 1.2, C.iron);
  for (const [bx, bz] of [[-3, 24], [-4.2, 24.4], [-3.4, 25.5], [20, 3], [21.2, 3.6]]) barrel(bx, 0, bz);
  hay(-20, 0, 2); hay(-21.3, 0, 2.4); hay(-20.6, 0.9, 2.2);
  crate(-24, 0, 8); crate(-24, 1.1, 8, 0.9); crate(-22.8, 0, 8.6); barrel(-25.5, 0, 10);
  // smithy
  deco(-27.5, 0, 18, 0.25, 3.2, 0.25, C.wood); deco(-23.5, 0, 18, 0.25, 3.2, 0.25, C.wood); deco(-27.5, 0, 22, 0.25, 3.2, 0.25, C.wood); deco(-23.5, 0, 22, 0.25, 3.2, 0.25, C.wood);
  deco(-25.5, 3.2, 20, 4.8, 0.3, 4.8, C.roof); deco(-25.5, 0, 20, 1.2, 0.9, 0.8, C.iron); deco(-25.5, 0.9, 20, 0.5, 0.3, 0.4, C.iron); brazier(-27, 0, 21);
  deco(-24, 0, 19, 0.2, 1.8, 2.4, C.wood); for (let i = 0; i < 3; i++) deco(-23.85, 0, 18.2 + i * 0.8, 0.1, 1.9, 0.12, '#d8dde5');
  for (let i = 0; i < 5; i++) deco(-6 + i * 1.1, 0, 27.5, 1.1, 0.5, 0.7, '#7a6a4a'); for (let i = 0; i < 4; i++) deco(-5.5 + i * 1.1, 0.5, 27.5, 1.1, 0.5, 0.7, '#8a7a5a');
  arrows(4, 0, 8, 6); arrows(-9, 0, 20, 5); arrows(18, 0, 14, 4);
  rubble(22, 0, 26, 7); rubble(-19, 0, 26, 6);
  brazier(-12, 0, 0); brazier(12, 0, 0);
  block(-16, 0, -6, 3, 0.9, 1.6, C.woodD); deco(-17.4, 0.1, -6, 0.3, 1.2, 1.2, C.iron); deco(-14.6, 0.1, -6, 0.3, 1.2, 1.2, C.iron); hay(-16, 0.9, -6);
  slits(-24, 3.5, 29.9, 5, 4, 0); slits(8, 3.5, 29.9, 5, 4, 0); slits(30.05, 4, -6, 6, 0, 5);
  for (const bx of [-10, 10]) { deco(bx, 3, -13.9, 1.6, 4, 0.1, C.banner); deco(bx, 7, -13.9, 2, 0.3, 0.2, C.gold); }
  for (const bx of [-22, -14, 14, 22]) { deco(bx, 2, 29.95, 1.4, 3.6, 0.08, C.banner); deco(bx, 5.6, 29.95, 1.8, 0.25, 0.2, C.gold); }
  deco(30, 6, 27.9, 1.8, 5, 0.1, C.banner); deco(-30, 6, 27.9, 1.8, 5, 0.1, C.banner);
  for (const [sx, sz, sw, sd] of [[0, 29.9, 60, 0.5], [-30.9, 10, 0.5, 50], [30.9, 10, 0.5, 50], [-17, -13.9, 27, 0.5], [17, -13.9, 27, 0.5]]) deco(sx, 0.01, sz, sw, 0.02, sd, '#4a463e');
  // THE TRAINING CORNER (courtyard SE): pells, a drill crossbow, and a hop course
  L.spawns.push({ kind: 'pell', x: 18, y: 0.1, z: -8 }, { kind: 'pellshield', x: 22, y: 0.1, z: -8, facing: Math.PI });
  block(25.5, 0, -3, 2, 2.2, 2, C.stoneD);
  L.spawns.push({ kind: 'drillbow', x: 25.5, y: 2.25, z: -3, perch: true, facing: Math.PI / 2 });
  block(8, 0, -12, 2.2, 1.2, 2.2, C.stoneL); block(12, 0, -12, 2.0, 2.4, 2.0, C.stone); block(16, 0, -12, 1.8, 3.6, 1.8, C.stoneL);
  deco(16, 3.6, -12, 0.14, 1.1, 0.14, C.wood); deco(16.35, 4.4, -12, 0.7, 0.45, 0.05, '#b03a3a');
  sign(14, 0, -6, 'THE DRILL YARD\nE at this post\nto train', Math.PI / 2 + 0.4);
  L.trainingPost = { x: 14, y: 0.1, z: -6 };
  L.checkpoints.push({ x: 0, y: 0.1, z: -10, name: 'Courtyard' });
  L.spawns.push({ kind: 'grunt', x: 2, y: 0.1, z: 14 });
  L.spawns.push({ kind: 'hound', x: -20, y: 0.1, z: 24 });
  L.torches.push({ x: -29.5, y: 4, z: 0 }, { x: 29.5, y: 4, z: 0 }, { x: -6, y: 5.5, z: 29.6 }, { x: 6, y: 5.5, z: 29.6 });
  L.spawns.push({ kind: 'defender', x: -24.5, y: 8.1, z: 33, facing: 0 }, { kind: 'defender', x: 2, y: 8.1, z: 33, facing: 0 }, { kind: 'defender', x: 24, y: 8.1, z: 33, facing: 0 }, { kind: 'defender', x: 30, y: 12.1, z: 35, facing: 0 });
  pennant(-14, 1.2, 14);                                      // on the well
  // crag undersides for the summit
  deco(0, -9, 9, 52, 7, 40, '#4a4038'); deco(0, -14, 8, 38, 5, 28, '#3e362e');
  deco(0, -7, 33, 40, 5, 8, '#4a4038'); deco(-40, -8, 22, 8, 6, 8, '#3e362e');

  // ============================ THE GREAT HALL (the hub seed) ============================
  // door through the east wall at z 8, into a hall beyond
  { const hx = 40, hz = -2;
    // cut the east wall: rebuild as two segments around a doorway (z 6..10)
    // (the original east wall block spans z -16..36; we overlay a doorway frame and passage)
    block(33.5, -2, hz, 7, 2, 6, C.ground); deco(33.5, -0.01, hz, 7, 0.02, 6, '#7a7468');
    deco(31, 6, hz, 2.4, 3, 4.4, C.stoneL); deco(29.9, 0, hz - 2.6, 0.5, 6, 0.9, C.stoneL); deco(29.9, 0, hz + 2.6, 0.5, 6, 0.9, C.stoneL);
    L.hallDoor = { x: 31, y: 0, z: hz };
    // hall shell
    block(hx, -2, hz, 15, 2, 16, C.ground); deco(hx, -0.01, hz, 15, 0.02, 16, '#6a5f52');
    block(hx, 0, hz - 8.6, 16, 8, 1.2, C.stoneD); block(hx, 0, hz + 8.6, 16, 8, 1.2, C.stoneD);
    block(hx + 8.1, 0, hz, 1.2, 8, 18.4, C.stoneD);
    block(hx - 8.1, 0, hz - 5.4, 1.2, 8, 7.6, C.stoneD); block(hx - 8.1, 0, hz + 5.4, 1.2, 8, 7.6, C.stoneD);   // west wall w/ door gap z 6..10
    block(hx - 8.1, 6, hz, 1.2, 2, 4, C.stoneD);
    block(hx, 8, hz, 17, 1, 18.6, C.stoneD);
    deco(hx, 7.2, hz, 15.5, 0.6, 0.6, C.woodD); deco(hx, 7.2, hz - 4, 15.5, 0.5, 0.5, C.woodD); deco(hx, 7.2, hz + 4, 15.5, 0.5, 0.5, C.woodD);
    // war table with the map of the vale
    block(hx, 0, hz, 4.6, 1.1, 2.8, C.woodD); deco(hx, 1.1, hz, 4.2, 0.08, 2.4, '#caa96a');
    deco(hx - 0.9, 1.2, hz + 0.3, 0.7, 0.06, 0.5, '#66854a'); deco(hx + 0.6, 1.2, hz - 0.4, 0.5, 0.06, 0.4, '#7d7468'); deco(hx + 1.2, 1.25, hz + 0.5, 0.3, 0.12, 0.3, C.stoneL);
    L.warTable = { x: hx, y: 1.2, z: hz };
    // fireplace on the east wall
    deco(hx + 7.4, 0, hz, 0.6, 3, 3.4, C.stoneL); deco(hx + 7.3, 0.2, hz, 0.5, 1.6, 2.2, '#1a1418'); L.torches.push({ x: hx + 7, y: 0.9, z: hz });
    brazier(hx - 6.5, 0, hz - 6.5); brazier(hx - 6.5, 0, hz + 6.5);
    // 8 banner slots (lit when a crest is earned) — main.js toggles these
    L.hallBanners = [];
    for (let i = 0; i < 8; i++) { const bx2 = hx - 5.6 + (i % 4) * 3.6, bz2 = i < 4 ? hz - 8.0 : hz + 8.0; L.hallBanners.push({ x: bx2, y: 3.2, z: bz2, face: i < 4 ? 1 : -1 }); }
    // rug, candles, wall shields, wainscot
    deco(hx, 0.005, hz, 7.5, 0.02, 5.5, '#6a2430'); deco(hx, 0.012, hz, 6.7, 0.02, 4.7, '#7d2c38'); deco(hx, 0.02, hz, 5.9, 0.02, 3.9, '#6a2430');
    deco(hx - 1.6, 1.2, hz - 0.9, 0.12, 0.5, 0.12, '#e8d8a0'); deco(hx + 1.7, 1.2, hz + 0.8, 0.12, 0.38, 0.12, '#e8d8a0');
    L.torches.push({ x: hx - 1.6, y: 1.85, z: hz - 0.9 });
    for (const [sx2, sz2] of [[hx - 3, hz - 7.9], [hx + 3, hz - 7.9], [hx, hz + 7.9]]) { deco(sx2, 3.6, sz2 + (sz2 < hz ? 0.35 : -0.35), 0.9, 1.1, 0.06, '#8a2d2d'); deco(sx2, 3.75, sz2 + (sz2 < hz ? 0.38 : -0.38), 0.3, 0.5, 0.05, '#c9a24a'); deco(sx2, 2.9, sz2 + (sz2 < hz ? 0.36 : -0.36), 1.1, 0.14, 0.05, '#5a4630'); }
    deco(hx, 2.2, hz - 8.0, 15.6, 0.14, 0.1, '#5a4630'); deco(hx, 2.2, hz + 8.0, 15.6, 0.14, 0.1, '#5a4630'); deco(hx + 7.45, 2.2, hz, 0.1, 0.14, 16.6, '#5a4630');
    // benches
    block(hx - 3, 0, hz - 4.6, 3.2, 0.55, 0.9, C.wood); block(hx + 3, 0, hz + 4.6, 3.2, 0.55, 0.9, C.wood);
    L.checkpoints.push({ x: 33.5, y: 0.1, z: hz, name: 'The Great Hall' });
    deco(hx, -8, hz, 15, 6, 15, '#4a4038'); deco(hx, -12.5, hz, 10, 4, 10, '#3e362e');
  }

  // --- keep approach: stairs up the west courtyard wall to a landing, through the doorway, to the ledge
  stairs(-27.2, 0, 6, { x: 0, z: 1 }, 14, 0.42, 0.75, 3.0, C.stone);   // rises to ~5.9 at z ≈ 16
  block(-27.2, 5.9, 18.6, 3.0, 0.5, 3.4, C.stone);
  stairs(-27.2, 6.4, 21.4, { x: 0, z: 1 }, 5, 0.34, 0.7, 3.0, C.stone);
  block(-27.2, 7.9, 26, 3.0, 0.5, 4, C.stone);                          // landing before the doorway (y 8.4 top)
  // bridge west through the wall doorway to the keep ledge
  block(-33, 8.1, 26, 6, 0.4, 3, C.wood);
  deco(-33, 7.6, 26, 6, 0.15, 0.2, C.woodD); deco(-31, 4, 26, 0.4, 3.9, 0.4, C.woodD);
  L.tutorial.push({ z: 22, key: 'keep', text: 'The keep spiral — the Siege Captain waits at the top' });

  // ============================ THE KEEP ============================
  const T = { x: -40, z: 22 };
  block(-36.5, 8.1, 26, 3, 0.5, 3, C.stone);                            // keep ledge (spiral start)
  L.checkpoints.push({ x: -36.5, y: 8.7, z: 26, name: 'Keep foot' });
  const R = 7.0; let ang = Math.atan2(26 - T.z, -36.5 - T.x); let y = 8.7;
  const steps = 26; const RISE = 1.45; L.spiral = [];
  for (let i = 1; i <= steps; i++) {
    ang += THREE.MathUtils.degToRad(34);
    y += RISE;
    let RR = R + Math.max(0, i - 23) * 1.35;
    if (i === steps) { const sr = 9 / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang))); RR = sr + 2.4; }
    const px = T.x + Math.cos(ang) * RR, pz = T.z + Math.sin(ang) * RR;
    L.spiral.push({ i, x: px, y, z: pz, gap: i % 9 === 0 });
    if (i % 9 === 0) { y -= RISE; continue; }
    if (i % 7 === 0) {
      const pl = world.add(new Box(px, y - 0.5, pz, 2.2, 0.5, 2.2, { moving: true, tag: 'slider' }));
      const ox = Math.cos(ang) * 2.6, oz = Math.sin(ang) * 2.6;
      pl.path = { a: { x: px - ox * 0.25, y: y - 0.5, z: pz - oz * 0.25 }, b: { x: px + ox * 0.45, y: y - 0.5, z: pz + oz * 0.45 }, period: 4, phase: i * 0.7 };
      L.platforms.push(pl);
    } else {
      const w = (i % 5 === 0 && i % 9 !== 1) ? 2.0 : 2.6;
      block(px, y - 0.5, pz, w, 0.5, w, i % 2 ? C.stone : C.stoneL);
      { const rr = Math.hypot(px - T.x, pz - T.z); const ux = (px - T.x) / rr, uz = (pz - T.z) / rr; deco(T.x + ux * (rr - w / 2 + 0.2), y - 1.0, T.z + uz * (rr - w / 2 + 0.2), 0.7, 0.5, 0.7, C.stoneD); const f = 3.5 / Math.max(Math.abs(ux), Math.abs(uz)); deco(T.x + ux * (f + 0.3), y - 1.0, T.z + uz * (f + 0.3), 0.6, 0.5, 0.6, C.stoneD); }
    }
    if (i === 12) { L.checkpoints.push({ x: px, y: y + 0.05, z: pz, name: 'Keep mid' }); }
    if (i % 4 === 2) L.torches.push({ x: px + (T.x - px) * 0.22, y: y + 1.7, z: pz + (T.z - pz) * 0.22 });
    if (i % 3 === 0) { deco(px + (rnd() - 0.5) * 1.2, y, pz + (rnd() - 0.5) * 1.2, 0.3 + rnd() * 0.3, 0.2 + rnd() * 0.2, 0.3 + rnd() * 0.3, C.stoneD); }
  }
  const topYPre = y + RISE;
  { const sr = 9 / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
    const bxp = T.x + Math.cos(ang) * (sr + 1.1), bzp = T.z + Math.sin(ang) * (sr + 1.1);
    block(bxp, topYPre - 0.75, bzp, 1.9, 0.5, 1.9, C.stoneL); deco(bxp, topYPre - 1.5, bzp, 0.8, 0.8, 0.8, C.stoneD);
    L.arenaNotch = { x: T.x + Math.cos(ang) * 8.7, z: T.z + Math.sin(ang) * 8.7 };
  }
  const topY = y + RISE;
  block(T.x, 0, T.z, 7, topY - 1, 7, C.stoneD);
  block(T.x, topY - 1, T.z, 18, 1, 18, C.stone);
  deco(T.x, topY - 0.02, T.z, 18, 0.02, 18, C.stoneL);
  // arena floor: gold inlay ring + worn center
  for (let k = 0; k < 20; k++) { const a2 = k / 20 * Math.PI * 2; deco(T.x + Math.cos(a2) * 5.4, topY, T.z + Math.sin(a2) * 5.4, 0.7, 0.025, 0.7, '#b8952e'); }
  deco(T.x, topY + 0.005, T.z, 3.2, 0.02, 3.2, '#8f867a'); deco(T.x, topY + 0.01, T.z, 2.2, 0.02, 2.2, '#b8952e');
  for (let k = 0; k < 8; k++) deco(T.x - 7 + rnd() * 14, topY, T.z - 7 + rnd() * 14, 0.8 + rnd(), 0.02, 0.6 + rnd(), '#8a8276');
  deco(T.x, topY - 2.6, T.z, 13, 1.8, 13, C.stoneD); deco(T.x, topY - 4, T.z, 10, 1.6, 10, '#4a4642');
  L.arenaCrenels = [];
  const acren = (x, z, w, d) => { if (L.arenaNotch && Math.hypot(x - L.arenaNotch.x, z - L.arenaNotch.z) < 1.9) return; const bx = world.add(new Box(x, topY, z, w, 1, d)); const m = boxesMesh([{ x: 0, y: 0.5, z: 0, w, h: 1, d, c: C.stoneL }]); m.position.set(x, topY, z); bx.crumbleMesh = m; L.props.add(m); L.arenaCrenels.push(bx); };
  for (let i = -8; i <= 8; i += 2) { acren(T.x + i, T.z + 8.7, 1, 0.6); acren(T.x + i, T.z - 8.7, 1, 0.6); acren(T.x + 8.7, T.z + i, 0.6, 1); acren(T.x - 8.7, T.z + i, 0.6, 1); }
  L.checkpoints.push({ x: T.x + 6, y: topY + 0.05, z: T.z + 6, name: 'Keep top' });
  L.spawns.push({ kind: 'captain', x: T.x - 1.2, y: topY + 0.05, z: T.z - 1.2, boss: true });
  for (const [ox, oz] of [[5.6, 5.6], [-5.6, 5.6], [5.6, -5.6], [-5.6, -5.6]]) { block(T.x + ox, topY, T.z + oz, 1.4, 3.4, 1.4, C.stoneL); deco(T.x + ox, topY + 3.4, T.z + oz, 1.8, 0.3, 1.8, C.stoneD); }
  for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    block(T.x + ox * 3.9, 0, T.z + oz * 3.9, 1.6, topY - 8, 1.6, C.stoneD);
    deco(T.x + ox * 3.9, topY - 8, T.z + oz * 3.9, 2.0, 1.0, 2.0, C.stoneL);
  }
  for (let yy = 6; yy < topY - 6; yy += 8) deco(T.x, yy, T.z, 7.4, 0.5, 7.4, C.stoneL);
  deco(T.x, -6, T.z, 8.2, 12, 8.2, '#4a4642');
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; const f = 8.8 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))); deco(T.x + Math.cos(a) * (f - 0.25), topY - 1.9, T.z + Math.sin(a) * (f - 0.25), 0.8, 0.95, 0.8, C.stoneL); }
  for (let yy = 12; yy < topY - 6; yy += 6) for (const [ox, oz, w, d] of [[3.55, 0, 0.14, 0.7], [-3.55, 0, 0.14, 0.7], [0, 3.55, 0.7, 0.14], [0, -3.55, 0.7, 0.14]]) deco(T.x + ox, yy - 0.25, T.z + oz, w, 2.1, d, C.stoneL);
  for (let yy = 12; yy < topY - 6; yy += 12) { deco(T.x + 3.54, yy + 0.2, T.z, 0.05, 1.1, 0.24, '#ffb45a'); deco(T.x - 3.54, yy + 6.2, T.z, 0.05, 1.1, 0.24, '#ffb45a'); }
  for (let yy = 12; yy < topY - 6; yy += 6) { deco(T.x + 3.52, yy, T.z, 0.06, 1.6, 0.3, '#1a1418'); deco(T.x - 3.52, yy, T.z, 0.06, 1.6, 0.3, '#1a1418'); deco(T.x, yy, T.z + 3.52, 0.3, 1.6, 0.06, '#1a1418'); deco(T.x, yy, T.z - 3.52, 0.3, 1.6, 0.06, '#1a1418'); }
  deco(T.x + 3.6, topY - 9, T.z - 2, 0.1, 8, 1.6, C.banner); deco(T.x - 3.6, topY - 9, T.z + 2, 0.1, 8, 1.6, C.banner); deco(T.x + 2, topY - 9, T.z + 3.6, 1.6, 8, 0.1, C.banner); deco(T.x - 2, topY - 9, T.z - 3.6, 1.6, 8, 0.1, C.banner);
  for (const [ox, oz] of [[3.6, -2], [-3.6, 2]]) deco(T.x + ox, topY - 1, T.z + oz, 0.14, 0.25, 2.0, C.gold); for (const [ox, oz] of [[2, 3.6], [-2, -3.6]]) deco(T.x + ox, topY - 1, T.z + oz, 2.0, 0.25, 0.14, C.gold);
  deco(T.x, topY, T.z, 0.3, 7, 0.3, C.wood);
  // THE KEEP'S SHADOW: a balcony below the arena's south rim; corbels lead back up
  block(T.x, topY - 5.2, T.z - 10.2, 4.4, 0.5, 2.6, C.stoneL); deco(T.x, topY - 6.2, T.z - 9.4, 1.2, 1.0, 1.2, C.stoneD);
  block(T.x + 3.2, topY - 3.8, T.z - 9.9, 2.2, 0.4, 2.2, C.stoneL);
  block(T.x + 5.6, topY - 2.5, T.z - 9.3, 2.2, 0.4, 2.2, C.stoneL);
  block(T.x + 7.6, topY - 1.2, T.z - 8.0, 2.2, 0.4, 2.2, C.stoneL);
  deco(T.x - 1.4, topY - 4.7, T.z - 10.8, 0.14, 0.25, 1.2, C.gold);
  L.balcony = { x: T.x, y: topY - 4.7, z: T.z - 10.2 };
  L.goal = { x: T.x, y: topY, z: T.z, r: 2.2 };
  L.beacon = { x: T.x, y: topY + 7, z: T.z };
  L.torches.push({ x: T.x + 4.6, y: topY + 1.5, z: T.z + 4.6 }, { x: T.x - 4.6, y: topY + 1.5, z: T.z - 4.6 });
  L.topY = topY; L.tower = T;
  L.shards = [];
  const shard = (x, y, z) => L.shards.push({ x, y, z });
  // meadow & shrine ring (6)
  shard(6, -29.6, -140); shard(-8, -29.6, -137); shard(-16, -28.4, -142); shard(14, -29.6, -133); shard(-22, -29.6, -127); shard(0, -29.6, -128);
  // bridge & gully (4)
  shard(4, -29.4, -118); shard(4, -28.8, -114); shard(4, -29.4, -110); shard(12, -34.2, -113);
  // rise A + camp (6)
  shard(-14, -28.2, -98); shard(-14, -26.4, -95); shard(-6, -23.4, -88); shard(8, -23.2, -80); shard(18, -23.4, -77); shard(2, -22.8, -80);
  // rise B + terrace + watchtower (6)
  shard(20, -22.6, -74); shard(20, -19.8, -69); shard(20, -16.8, -66); shard(2, -15.4, -60); shard(-14, -5.0, -58); shard(-18, -15.2, -52);
  // rise C + shelf + approach (4)
  shard(14, -14.8, -55); shard(14, -11.6, -50); shard(-4, -7.4, -47); shard(0, -5.2, -28);
  // castle & keep (4)
  shard(0, 0.8, -6); shard(26, 8.6, 25); shard(-33, 9.0, 26); shard(T.x, topY + 0.8, T.z + 7);
  L.hearts = [ { x: 2, y: -23.9, z: -76 }, { x: 0, y: 0.1, z: -8 }, { x: T.x, y: topY + 0.1, z: T.z + 7.5 } ];

  // the race path: waypoints the Squire runs (meadow → bridge → rise A → camp → rise B → tower stairs)
  L.raceWaypoints = [
    { x: 8, y: -29.9, z: -142 }, { x: 4, y: -29.9, z: -128 }, { x: 4, y: -29.9, z: -119 },
    { x: 4, y: -29.9, z: -114 },     // crosses the bridge gap (he leaps it)
    { x: 4, y: -29.9, z: -108 }, { x: -6, y: -28.9, z: -102 },
    { x: -14, y: -28.5, z: -103 }, { x: -14, y: -23.6, z: -93 },  // up rise A
    { x: -6, y: -23.9, z: -86 }, { x: 12, y: -23.9, z: -80 }, { x: 20, y: -23.9, z: -76 },
    { x: 20, y: -15.6, z: -65 },     // up rise B
    { x: 2, y: -15.9, z: -60 }, { x: -13.5, y: -15.9, z: -63.5 },
    { x: -13.8, y: -12.4, z: -58 },  // tower stairs (approx — he glides up)
    { x: -15.5, y: -8.8, z: -56.5 }, { x: -18, y: -5.3, z: -58 },
  ];

  // ---------------- MESHES ----------------
  L.mesh = boxesMesh(stat);
  for (const pl of L.platforms) {
    const m = boxesMesh([{ x: 0, y: pl.h / 2, z: 0, w: pl.w, h: pl.h, d: pl.d, c: C.wood }]);
    pl.mesh = m; L.props.add(m);
  }
  for (const ld of L.ladders) {
    const g = new THREE.Group();
    const H = ld.top - ld.bottom + 0.6;
    const rails = boxesMesh([
      { x: -0.45, y: H / 2, z: 0, w: 0.14, h: H, d: 0.14, c: C.wood }, { x: 0.45, y: H / 2, z: 0, w: 0.14, h: H, d: 0.14, c: C.wood },
      ...Array.from({ length: Math.floor(H / 0.58) }, (_, i) => ({ x: 0, y: 0.4 + i * 0.58, z: 0, w: 0.9, h: 0.08, d: 0.1, c: C.woodD })),
    ]);
    g.add(rails); g.position.set(ld.x, ld.bottom, ld.z); ld.mesh = g; L.props.add(g);
  }
  // tree canopies: individual fadeable meshes (the camera sees through them politely)
  L.treeMeshes = [];
  for (const t of L.trees) {
    const s2 = t.s;
    const boxes = t.kind === 'pine'
      ? [ { x: 0, y: 1.8 * s2, z: 0, w: 2.2 * s2, h: 1.2 * s2, d: 2.2 * s2, c: '#3f5a30' }, { x: 0, y: 2.8 * s2, z: 0, w: 1.5 * s2, h: 1.1 * s2, d: 1.5 * s2, c: '#48663a' }, { x: 0, y: 3.7 * s2, z: 0, w: 0.8 * s2, h: 1.0 * s2, d: 0.8 * s2, c: '#527544' } ]
      : [ { x: 0, y: 2.75 * s2, z: 0, w: 2.6 * s2, h: 1.7 * s2, d: 2.4 * s2, c: '#4a6a34' }, { x: 0.7 * s2, y: 3.2 * s2, z: 0.4 * s2, w: 1.6 * s2, h: 1.2 * s2, d: 1.5 * s2, c: '#557842' }, { x: -0.7 * s2, y: 3.4 * s2, z: -0.3 * s2, w: 1.4 * s2, h: 1.0 * s2, d: 1.3 * s2, c: '#4f7038' } ];
    const mat = MAT.clone(); mat.transparent = true;
    const m = boxesMesh(boxes, { material: mat });
    m.position.set(t.x, t.y, t.z); L.props.add(m); L.treeMeshes.push({ m, mat, x: t.x, z: t.z, y: t.y });
  }
  for (const sg of L.signs) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#6e4b2a'; g.fillRect(10, 10, 492, 236);
    g.fillStyle = '#f3e6c8'; g.font = 'bold 44px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = sg.text.split('\n'); lines.forEach((ln, i) => g.fillText(ln, 256, 128 + (i - (lines.length - 1) / 2) * 56));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: tex }));
    const post = new THREE.Group(); post.add(m); m.position.y = 1.9;
    const stick = boxesMesh([{ x: 0, y: 0.7, z: -0.05, w: 0.12, h: 1.4, d: 0.12, c: C.woodD }]); post.add(stick);
    post.position.set(sg.x, sg.y, sg.z); post.rotation.y = sg.facing; L.props.add(post);
  }
  const flag = boxesMesh([{ x: 0.9, y: 0, z: 0, w: 1.8, h: 1.1, d: 0.06, c: C.banner }, { x: 0.9, y: 0.0, z: 0.04, w: 0.6, h: 0.5, d: 0.02, c: C.gold }]);
  flag.position.set(L.goal.x, L.goal.y + 6.2, L.goal.z); L.flag = flag; L.props.add(flag);
  return L;
}

export function updatePlatforms(L, time, dt) {
  for (const pl of L.platforms) {
    const p = pl.path;
    const u = ((time / p.period + p.phase) % 1 + 1) % 1;
    const ease = x => 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, x)) * Math.PI);
    const s = u < 0.22 ? 0 : u < 0.5 ? ease((u - 0.22) / 0.28) : u < 0.72 ? 1 : 1 - ease((u - 0.72) / 0.28);
    const nx = p.a.x + (p.b.x - p.a.x) * s, ny = p.a.y + (p.b.y - p.a.y) * s, nz = p.a.z + (p.b.z - p.a.z) * s;
    pl.vel.x = nx - pl.cx; pl.vel.y = ny - pl.min.y; pl.vel.z = nz - pl.cz;
    pl.setCenter(nx, ny, nz);
    if (pl.mesh) pl.mesh.position.set(nx, ny, nz);
  }
}
