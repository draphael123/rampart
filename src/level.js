import * as THREE from '../vendor/three.module.js';
import { Box } from './physics.js';
import { boxesMesh, MAT } from './voxel.js';

const C = {
  stone: '#7d7a72', stoneD: '#5f5c55', stoneL: '#9a968c', ground: '#6b6a4f', dirt: '#5c4a36',
  wood: '#6e4b2a', woodD: '#4a3119', roof: '#6a2f2a', iron: '#3a3d44', gold: '#c9a24a', banner: '#7a1f1f',
  grass: '#55693a', hoist: '#8a6a3a',
};

export function buildLevel(world) {
  const L = { static: [], spawns: [], ladders: [], checkpoints: [], platforms: [], props: new THREE.Group(), goal: null, torches: [] };
  const stat = L.static;

  // block: adds both a collision box and a render box (centre x,z; bottom y)
  // per-box colour jitter so big stone faces don't read as flat paint
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jit = (c) => { if (typeof c !== 'string' || !c.startsWith('#') || c.length !== 7) return c; const k = 0.93 + rnd() * 0.14; const n = parseInt(c.slice(1), 16); const r = Math.min(255, ((n >> 16) & 255) * k) | 0, g = Math.min(255, ((n >> 8) & 255) * k) | 0, b = Math.min(255, (n & 255) * k) | 0; return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); };
  const block = (x, y, z, w, h, d, c, opts = {}) => {
    if (!opts.noCollide) world.add(new Box(x, y, z, w, h, d, opts));
    stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) });
  };
  const deco = (x, y, z, w, h, d, c) => stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) });
  // little prop kits
  const crate = (x, y, z, s = 1.1) => block(x, y, z, s, s, s, rnd() < 0.5 ? C.wood : C.woodD);
  const barrel = (x, y, z) => { block(x, y, z, 0.9, 1.1, 0.9, C.wood); deco(x, y + 0.3, z, 0.96, 0.08, 0.96, C.iron); deco(x, y + 0.75, z, 0.96, 0.08, 0.96, C.iron); };
  const hay = (x, y, z) => block(x, y, z, 1.3, 0.9, 1.1, '#b89a4a');
  const brazier = (x, y, z) => { deco(x, y, z, 0.7, 0.9, 0.7, C.iron); deco(x, y + 0.9, z, 0.9, 0.25, 0.9, C.iron); L.torches.push({ x, y: y + 1.25, z }); };
  const arrows = (x, y, z, n = 4) => { for (let i = 0; i < n; i++) deco(x + (rnd() - 0.5) * 1.4, y, z + (rnd() - 0.5) * 1.4, 0.06, 0.7 + rnd() * 0.3, 0.06, C.woodD); };
  const rubble = (x, y, z, n = 5) => { for (let i = 0; i < n; i++) deco(x + (rnd() - 0.5) * 2.2, y, z + (rnd() - 0.5) * 2.2, 0.3 + rnd() * 0.5, 0.2 + rnd() * 0.4, 0.3 + rnd() * 0.5, rnd() < 0.5 ? C.stoneD : C.stone); };
  const puddle = (x, z, w, d) => deco(x, 0.005, z, w, 0.01, d, '#3a3340');
  const slits = (x, y, z, n, dx, dz) => { for (let i = 0; i < n; i++) deco(x + dx * i, y, z + dz * i, dx ? 0.3 : 0.06, 1.4, dz ? 0.3 : 0.06, '#1a1418'); };
  const crenels = (x0, x1, y, z, c = C.stoneL) => { for (let x = x0; x <= x1; x += 2) block(x, y, z, 0.9, 0.7, 0.7, c); };
  const stairs = (x, y, z, dir, steps, rise = 0.4, run = 0.7, width = 3, c = C.stone) => {
    for (let i = 0; i < steps; i++) {
      const sx = x + dir.x * run * i, sz = z + dir.z * run * i;
      const w = dir.x ? run + 0.02 : width, d = dir.z ? run + 0.02 : width;
      block(sx, y, sz, w, rise * (i + 1), d, i % 2 ? c : C.stoneD);
    }
  };

  // ---------------- ZONE 0: TRAINING YARD (tutorial) ----------------
  // A long walled yard south of the courtyard. Contiguous steps: a failed jump lands you where you
  // were (or in a shallow pit you can hop out of). Order: move → jump → double jump → dash gap →
  // ride a slider → narrow beam (watch the ring) → drop → bash a barricade → pells (light/heavy)
  // → parry a slow crossbow's bolt → block/parry the drill sergeant → the portcullis opens.
  L.signs = []; L.tutorial = []; L.barricades = [];
  const sign = (x, y, z, text, facing = 0) => L.signs.push({ x, y, z, text, facing });
  const barricade = (x, y, z, w, d, h = 2.3) => { const bx = world.add(new Box(x, y, z, w, h, d, { tag: 'barricade' })); bx.hp = 1; L.barricades.push(bx); return bx; };
  block(0, -2, -43, 26, 2, 54, C.ground); deco(0, -0.01, -43, 26, 0.02, 54, C.dirt);
  block(-13.5, 0, -43, 1.5, 8, 56, C.stoneD); block(13.5, 0, -43, 1.5, 8, 56, C.stoneD); block(0, 0, -71, 28, 8, 2, C.stoneD);
  for (const bx of [-8, 0, 8]) { deco(bx, 2.5, -69.9, 1.4, 3.5, 0.1, C.banner); deco(bx, 6, -69.9, 1.8, 0.25, 0.2, C.gold); }
  // tents, hay, a rack: the yard is where the garrison trains
  for (const [tx, tz] of [[-10, -66], [10, -66], [-10, -58]]) { deco(tx, 0, tz, 3.2, 2.2, 3.2, C.woodD); deco(tx, 2.2, tz, 4, 0.5, 4, C.roof); deco(tx, 2.7, tz, 3, 0.5, 3, C.roof); }
  for (const [hx, hz] of [[9, -60], [10.3, -60.6], [9.6, -59.2]]) deco(hx, 0, hz, 1.2, 0.9, 1.2, '#b89a4a');
  deco(-11, 0, -52, 0.2, 1.8, 3, C.wood); for (let i = 0; i < 4; i++) deco(-11, 0.3, -53.2 + i * 0.8, 0.1, 1.4, 0.12, C.steel || '#d8dde5');
  L.start = { x: 0, y: 0.1, z: -68 };
  L.checkpoints.push({ x: 0, y: 0.1, z: -68, name: 'Training yard' });
  sign(4, 0, -66, 'WASD to move\nmouse to look', Math.PI);
  L.tutorial.push({ z: -65, key: 'jump', text: 'SPACE — jump' });
  block(0, 0, -61, 26, 1.2, 4, C.stone); sign(-4, 1.2, -60.6, 'SPACE to jump', Math.PI);
  L.tutorial.push({ z: -60.2, key: 'djump', text: 'SPACE again in the air — double jump' });
  block(0, 0, -57, 26, 3.8, 4, C.stoneL); sign(4, 3.8, -56.6, 'SPACE again\nin the air', Math.PI);
  L.tutorial.push({ z: -56.2, key: 'dash', text: 'SHIFT — dash. Works in the air, once per jump' });
  block(0, 0, -52.75, 26, 2.4, 4.5, C.stoneD);                       // pit (hop back out)
  block(0, 0, -48.5, 26, 3.8, 4, C.stone); sign(-4, 3.8, -48.1, 'SHIFT in the air\nto dash', Math.PI);
  // slider over a pit
  L.tutorial.push({ z: -47.8, key: 'slider', text: 'Ride the moving platform — you move with it' });
  block(0, 0, -42, 26, 2.4, 9, C.stoneD);                            // pit floor under the slider
  const tsl = world.add(new Box(-6, 3.5, -42, 2.8, 0.3, 2.8, { moving: true, tag: 'slider' }));
  tsl.path = { a: { x: -7, y: 3.5, z: -42 }, b: { x: 7, y: 3.5, z: -42 }, period: 7, phase: 0 }; L.platforms.push(tsl);
  block(0, 0, -36, 26, 3.8, 3, C.stone); sign(4, 3.8, -35.6, 'Ride the platform', Math.PI);
  // narrow beam: teaches the landing ring
  L.tutorial.push({ z: -35.4, key: 'beam', text: 'Narrow beam — the ring beneath you shows where you will land' });
  block(0, 0, -30.5, 26, 2.4, 8, C.stoneD);                          // pit under the beam
  block(0, 3.5, -30.5, 0.9, 0.3, 8, C.wood); deco(0, 2.4, -30.5, 0.3, 1.1, 0.3, C.woodD);
  block(0, 0, -25.5, 26, 3.8, 2, C.stone);
  // drop into the yard proper (z -24.5 .. -16); a barricade bars the way
  L.tutorial.push({ z: -25.2, key: 'bash', text: 'F — shield bash smashes barricades (or hold Q for a heavy)' });
  block(-8.5, 0, -21, 9, 8, 1.2, C.stoneD); block(8.5, 0, -21, 9, 8, 1.2, C.stoneD); 
  barricade(0, 0, -21, 8, 1.2, 8);
  sign(-6.5, 0, -22.6, 'F — shield bash\nbreaks it', Math.PI);
  // pells
  L.spawns.push({ kind: 'pell', x: -5, y: 0.1, z: -18.6 }, { kind: 'pellshield', x: 5, y: 0.1, z: -18.6, facing: Math.PI });
  sign(-5, 0, -17, 'LEFT CLICK\nthree-hit chain', Math.PI); sign(5, 0, -17, 'hold Q — charged heavy\nbreaks a shield', Math.PI);
  L.tutorial.push({ key: 'light', after: 'bash', cond: 'barricade', text: 'LEFT CLICK — sword. Chain three on the pell' });
  L.tutorial.push({ key: 'heavy', after: 'light', cond: 'hit', text: 'Hold Q — a charged heavy breaks the shield pell' });
  // a slow crossbow on a crate: parry its bolt back at it
  block(-11, 0, -17, 2, 2.2, 2, C.stoneD);
  L.spawns.push({ kind: 'drillbow', x: -11, y: 2.25, z: -17, perch: true, facing: Math.PI / 2 });
  sign(-9.4, 2.2, -15.8, 'RIGHT CLICK as the\nbolt arrives: parry', Math.PI / 2);
  L.tutorial.push({ key: 'parry', after: 'heavy', cond: 'guardbreak', text: 'The crossbow: block as its bolt arrives to parry it back' });
  // drill sergeant guards the portcullis
  L.spawns.push({ kind: 'drill', x: 0, y: 0.1, z: -17.2, facing: Math.PI });
  L.tutorial.push({ key: 'block', after: 'parry', cond: 'boltparry', text: 'The sergeant: hold RIGHT CLICK to block — at the last instant to parry, then strike' });
  block(0, -2, -15, 4, 2, 2.2, C.ground);   // floor of the gate passage
  L.portcullis = world.add(new Box(0, 0, -15, 4, 6, 1.2, { tag: 'gate' }));
  deco(0, 6, -15, 6, 4, 2.2, C.stoneL); deco(-3.2, 0, -15, 0.6, 6, 2.4, C.stoneL); deco(3.2, 0, -15, 0.6, 6, 2.4, C.stoneL);
  L.torches.push({ x: -3.6, y: 4.5, z: -16.8 }, { x: 3.6, y: 4.5, z: -16.8 }, { x: -12.6, y: 4, z: -62 }, { x: 12.6, y: 4, z: -50 }, { x: -12.6, y: 4, z: -38 }, { x: 12.6, y: 4, z: -26 });

  // ---------------- ZONE A: COURTYARD ----------------
  block(0, -2, 10, 60, 2, 48, C.ground); deco(0, -0.01, 10, 60, 0.02, 48, C.ground);
  deco(-6, 0.0, 4, 6, 0.03, 5, C.dirt); deco(9, 0.0, 14, 7, 0.03, 4, C.dirt);
  // cobbled road from gate to gate, worn patches, grass tufts
  for (let z = -13; z < 29; z += 1.1) for (let x = -2.2; x <= 2.2; x += 1.1) deco(x + (rnd() - 0.5) * 0.2, 0.0, z + (rnd() - 0.5) * 0.2, 1.0, 0.04 + rnd() * 0.03, 1.0, rnd() < 0.5 ? '#7a7468' : '#6e6a5e');
  for (let z = 2; z < 24; z += 1.1) for (let x = 3.3; x <= 24; x += 1.1) { if (rnd() < 0.25) continue; deco(x, 0.0, z, 1.0, 0.035, 1.0, rnd() < 0.5 ? '#756f62' : '#6a665a'); if (z > 4 && z < 6 && x > 22) {} }
  for (let i = 0; i < 26; i++) { const gx = -28 + rnd() * 56, gz = -12 + rnd() * 40; if (Math.abs(gx) < 3) continue; deco(gx, 0, gz, 0.25, 0.22 + rnd() * 0.2, 0.25, rnd() < 0.5 ? '#5f7a3a' : '#4e6a30'); deco(gx + 0.3, 0, gz + 0.2, 0.2, 0.18, 0.2, '#5a7236'); }
  for (let i = 0; i < 9; i++) { const gx = -26 + rnd() * 52, gz = -12 + rnd() * 40; deco(gx, 0.0, gz, 2 + rnd() * 4, 0.025, 1.5 + rnd() * 3, rnd() < 0.5 ? C.dirt : '#615f48'); }
  block(-17, 0, -15, 28, 10, 2, C.stoneD); block(17, 0, -15, 28, 10, 2, C.stoneD); block(-31, 0, 10, 2, 12, 52, C.stoneD); block(31, 0, 10, 2, 12, 52, C.stoneD);
  block(0, 0, 32, 62, 6.5, 4, C.stone); deco(0, 0, 30.01, 62, 6.5, 0.02, C.stoneD);
  deco(0, 0, 29.9, 4, 5, 0.3, C.iron); deco(0, 5, 29.9, 6, 1, 0.3, C.stoneL);
  block(-8, 0, 0, 1.2, 1.2, 1.2, C.wood); block(-9.2, 0, 0, 1.2, 0.6, 1.2, C.woodD); block(-8, 1.2, 0, 1.2, 1.2, 1.2, C.wood);
  block(5, 0, 2, 1.2, 0.5, 1.2, C.woodD); block(6.3, 0, 2, 1.2, 1.0, 1.2, C.wood);
  block(-3, 0, 8, 2, 2.2, 2, C.stoneD);
  block(12, 0, 6, 3, 1.2, 3, C.stoneD); block(12, 1.2, 6, 2, 1.0, 2, C.stone);
  block(-14, 0, 14, 2.4, 1.0, 2.4, C.stoneL); deco(-14, 1.0, 14, 1.6, 0.2, 1.6, C.iron);
  deco(-14.9, 1, 14, 0.2, 2.2, 0.2, C.wood); deco(-13.1, 1, 14, 0.2, 2.2, 0.2, C.wood); deco(-14, 3.1, 14, 2.4, 0.3, 1.2, C.roof);
  block(4, 0, 20, 3, 0.9, 1.6, C.woodD); deco(2.6, 0.1, 20, 0.3, 1.2, 1.2, C.iron); deco(5.4, 0.1, 20, 0.3, 1.2, 1.2, C.iron);
  for (const [bx, bz] of [[-3, 24], [-4.2, 24.4], [-3.4, 25.5], [20, 3], [21.2, 3.6]]) barrel(bx, 0, bz);
  // LIVED-IN: the courtyard is a garrison mid-siege
  hay(-20, 0, 2); hay(-21.3, 0, 2.4); hay(-20.6, 0.9, 2.2);
  crate(-24, 0, 8); crate(-24, 1.1, 8, 0.9); crate(-22.8, 0, 8.6); barrel(-25.5, 0, 10);
  // smithy stall against the west wall
  deco(-27.5, 0, 18, 0.25, 3.2, 0.25, C.wood); deco(-23.5, 0, 18, 0.25, 3.2, 0.25, C.wood); deco(-27.5, 0, 22, 0.25, 3.2, 0.25, C.wood); deco(-23.5, 0, 22, 0.25, 3.2, 0.25, C.wood);
  deco(-25.5, 3.2, 20, 4.8, 0.3, 4.8, C.roof); deco(-25.5, 0, 20, 1.2, 0.9, 0.8, C.iron); deco(-25.5, 0.9, 20, 0.5, 0.3, 0.4, C.iron); brazier(-27, 0, 21);
  deco(-24, 0, 19, 0.2, 1.8, 2.4, C.wood); for (let i = 0; i < 3; i++) deco(-24, 0.3, 18.2 + i * 0.8, 0.1, 1.4, 0.12, C.steel);
  // sandbags and a fallen ladder by the gate, arrows stuck in the ground
  for (let i = 0; i < 5; i++) deco(-6 + i * 1.1, 0, 27.5, 1.1, 0.5, 0.7, '#7a6a4a'); for (let i = 0; i < 4; i++) deco(-5.5 + i * 1.1, 0.5, 27.5, 1.1, 0.5, 0.7, '#8a7a5a');
  deco(14, 0.1, 25, 0.9, 0.14, 7, C.woodD); for (let i = 0; i < 9; i++) deco(14, 0.2, 22 + i * 0.7, 0.8, 0.08, 0.1, C.wood);
  arrows(4, 0, 8, 6); arrows(-9, 0, 20, 5); arrows(18, 0, 14, 4);
  rubble(22, 0, 26, 7); rubble(-19, 0, 26, 6); puddle(-8, 12, 4, 3); puddle(16, 2, 3, 2.2);
  brazier(-12, 0, 0); brazier(12, 0, 0);
  // a broken siege ladder leaning on the inside of the east wall, a dead cart
  deco(28.5, 0, 14, 0.25, 6, 0.25, C.wood); deco(29.5, 0, 14, 0.25, 6, 0.25, C.wood); for (let i = 0; i < 8; i++) deco(29, 0.5 + i * 0.7, 14, 1.0, 0.08, 0.12, C.woodD);
  block(-16, 0, -6, 3, 0.9, 1.6, C.woodD); deco(-17.4, 0.1, -6, 0.3, 1.2, 1.2, C.iron); deco(-14.6, 0.1, -6, 0.3, 1.2, 1.2, C.iron); hay(-16, 0.9, -6);
  // arrow slits and a roof on the gatehouse
  slits(-24, 3.5, 29.9, 5, 4, 0); slits(8, 3.5, 29.9, 5, 4, 0); slits(-30.05, 4, -6, 6, 0, 5); slits(30.05, 4, -6, 6, 0, 5);
  // gatehouse: an arch over the walk (piers have collision, the walk passes under)
  block(0, 8, 30.35, 1.6, 3.2, 0.7, C.stoneL); block(0, 8, 33.75, 1.6, 3.2, 0.7, C.stoneL);
  block(0, 11.2, 32, 2.2, 0.8, 4.6, C.stoneL); deco(0, 12, 32, 6.4, 1, 3.8, C.roof); deco(0, 13, 32, 4.4, 1, 2.6, C.roof); deco(0, 14, 32, 2.2, 0.9, 1.4, C.roof); deco(0, 14.9, 32, 0.3, 2, 0.3, C.wood); deco(0.7, 15.9, 32, 1.4, 0.9, 0.06, C.banner);
  stairs(26, 0, 4, { x: 0, z: 1 }, 20, 0.4, 0.8, 3.2);
  block(26, 7.6, 21.5, 3.2, 0.4, 4, C.stone);
  block(26, 7.6, 28.5, 3.2, 0.4, 3, C.stone);
  // banners on the south wall
  for (const bx of [-10, 0, 10]) { deco(bx, 3, -13.9, 1.6, 4, 0.1, C.banner); deco(bx, 7, -13.9, 2, 0.3, 0.2, C.gold); }
  L.checkpoints.push({ x: 0, y: 0.1, z: -10, name: 'Courtyard' });
  L.spawns.push({ kind: 'grunt', x: -4, y: 0.1, z: 10 }, { kind: 'grunt', x: 8, y: 0.1, z: 18 });
  L.spawns.push({ kind: 'crossbow', x: 12, y: 2.2, z: 6, perch: true });
  L.torches.push({ x: -29.5, y: 4, z: 0 }, { x: 29.5, y: 4, z: 0 }, { x: -6, y: 5.5, z: 29.6 }, { x: 6, y: 5.5, z: 29.6 });

  // walkway segments at y=6.5 → top y=8 (1.5 thick). Gaps: x∈[-9,-5] (4m), x∈[7,13] (6m)
  const segs = [[-30, -9], [-5, 7], [13, 30]];
  for (const [a, b] of segs) { const w = b - a; block((a + b) / 2, 6.5, 32, w, 1.5, 4, C.stone); }
  // BARRICADE: a wooden barricade across the walk — only a shield bash, heavy or pound breaks it
  barricade(-14, 8, 32, 1.2, 4);
  sign(-10.5, 8, 30.6, 'F — shield bash\nbreaks barricades', Math.PI / 2);
  sign(6, 8, 30.6, 'CTRL in the air\nground pound kicks ladders', Math.PI);
  // rubble at gap edges
  block(-9.6, 8, 31, 0.8, 0.5, 0.8, C.stoneD); block(-4.4, 8, 33, 0.6, 0.4, 0.6, C.stoneD); block(6.4, 8, 33, 0.8, 0.5, 0.8, C.stoneD);
  // a rubble stepping block in the 6m gap (lands a double jump short of the far side)
  block(10, 5.5, 32, 1.4, 1.0, 1.4, C.stoneD);
  // crenellations on outer (north) edge
  for (const [a, b] of segs) crenels(Math.ceil(a) + 1, b - 1, 8, 33.6);
  // inner parapet, low
  for (const [a, b] of segs) block((a + b) / 2, 8, 30.3, b - a, 0.4, 0.4, C.stoneD);
  // towers at each end (x=±30): top at y=12
  block(30, 0, 32, 6, 12, 8, C.stoneD); block(-30, 0, 32, 6, 12, 8, C.stoneD);
  crenels(28, 32, 12, 36); crenels(28, 32, 12, 28);
  // stair up the east tower from the walk: small blocks
  block(27.5, 8, 29.2, 1.2, 1.0, 1.2, C.stone); block(28.6, 8, 29.2, 1.2, 2.0, 1.2, C.stone); block(29.7, 8, 29.2, 1.2, 3.0, 1.2, C.stone);
  // the wall is manned: buckets, oil cauldron, rope, arrows in the boards, friendly archers
  barrel(-24, 8, 30.9); barrel(20, 8, 30.9); deco(24, 8, 31, 0.9, 0.7, 0.9, C.iron); deco(24, 8.7, 31, 1.1, 0.2, 1.1, '#2a1a10');
  deco(-4, 8, 31, 0.8, 0.35, 0.8, C.woodD); deco(15, 8, 33, 0.8, 0.35, 0.8, C.woodD);
  arrows(-26, 8, 32, 5); arrows(-1, 8, 33, 4); arrows(17, 8, 31.5, 5);
  brazier(29, 12, 30); brazier(-29, 12, 30);
  L.spawns.push({ kind: 'defender', x: -24.5, y: 8.1, z: 33, facing: 0 }, { kind: 'defender', x: 2, y: 8.1, z: 33, facing: 0 }, { kind: 'defender', x: 24, y: 8.1, z: 33, facing: 0 }, { kind: 'defender', x: 30, y: 12.1, z: 35, facing: 0 });
  // enemies on the walk
  L.spawns.push({ kind: 'shield', x: 18, y: 8.1, z: 32 }, { kind: 'grunt', x: -18, y: 8.1, z: 32 });
  L.spawns.push({ kind: 'crossbow', x: 30, y: 12.1, z: 32, perch: true });
  // ladders on the outer face (north side, z=34): swarm climbs from y=0 outside to wall top
  for (const lx of [-20, 3, 20]) {
    L.ladders.push({ x: lx, z: 34.6, bottom: 0, top: 8, facing: Math.PI, up: true, respawn: 0, spawnEvery: 9, t: 3 + Math.random() * 2 });
  }
  // outside ground (so falling off the far side is death but looks like a field)
  // THE CHASM: everything outside the walls is a drop. Field far below, red mist above it.
  block(0, -16, 40, 240, 4, 200, '#2a1418', { tag: 'field' });
  block(-80, -16, -10, 60, 4, 120, '#2a1418', { tag: 'field' });
  L.mistY = -5;
  // siege camp props outside
  // broken stubs of the outer works, poking out of the mist
  for (let i = -24; i <= 24; i += 12) { deco(i, -9, 44, 3, 6 + (i % 24 === 0 ? 3 : 0), 3, C.stoneD); }
  L.checkpoints.push({ x: 26, y: 8.1, z: 28.5, name: 'Wall' });
  // the wall's west end is closed off by the tower; the only way on is down the scaffold


  // hoist at the west end: moving platform between wall (y=8) and tower ledge (y=14)
  // THE SCAFFOLD: from the wall's west end, drop down the inner face of the west wall on builders'
  // scaffolds, cross a slider, then climb pillars back up to the hoist. (wall y=8 → down to 4.5 → up to 11)
  const scaf = (x, y, z, w = 2.4, d = 2.4) => { block(x, y, z, w, 0.3, d, C.wood); deco(x - w / 2 + 0.15, y - 1.2, z - d / 2 + 0.15, 0.2, 1.2, 0.2, C.woodD); deco(x + w / 2 - 0.15, y - 1.2, z + d / 2 - 0.15, 0.2, 1.2, 0.2, C.woodD); };
  scaf(-27.5, 6.6, 25.5); scaf(-27.5, 5.4, 20.5, 2.4, 6); scaf(-27.5, 4.2, 13.5, 2.4, 4);
  const sl1 = world.add(new Box(-24, 4.2, 9, 2.6, 0.3, 2.6, { moving: true, tag: 'slider' }));
  sl1.path = { a: { x: -26, y: 4.2, z: 9 }, b: { x: -18, y: 4.2, z: 9 }, period: 6, phase: 0.2 }; L.platforms.push(sl1);
  scaf(-15.5, 5.5, 9, 2.6, 2.6);
  // pillar climb north along x≈-16..-22
  block(-16, 0, 13, 2.2, 7.0, 2.2, C.stoneL); block(-18.5, 0, 18, 2.2, 8.2, 2.2, C.stone); block(-21, 0, 22, 2.4, 9.6, 2.4, C.stoneL);
  L.tutorial.push({ z: 19.5, key: 'hoist', text: 'Double jump onto the hoist' });
  L.spawns.push({ kind: 'crossbow', x: -12, y: 2.25, z: 20, perch: true }); block(-12, 0, 20, 2, 2.2, 2, C.stoneD);
  L.checkpoints.push({ x: -15.5, y: 5.6, z: 9, name: 'Scaffold' });
  const hoist = world.add(new Box(-24.5, 12, 27, 4, 0.4, 4, { moving: true, tag: 'hoist' }));
  hoist.path = { a: { x: -24.5, y: 12, z: 27 }, b: { x: -24.5, y: 15.6, z: 27 }, period: 8, phase: 0 };
  L.platforms.push(hoist);
  deco(-26.4, 0, 27, 0.25, 17, 0.25, C.wood); deco(-22.6, 0, 27, 0.25, 17, 0.25, C.wood); deco(-24.5, 17, 27, 4.4, 0.3, 0.3, C.wood);
  L.torches.push({ x: -27, y: 9.5, z: 30.2 }, { x: 27, y: 9.5, z: 30.2 });

  // ---------------- ZONE C: THE KEEP TOWER ----------------
  const T = { x: -40, z: 22 };
  // ledge at y=16 connecting from hoist (hoist top at 16.0)
  block(-34.5, 15.6, 26, 11, 0.5, 3, C.stone);
  L.checkpoints.push({ x: -35.5, y: 16.1, z: 26, name: 'Keep foot' });
  // spiral: platforms at radius ~6.2 from tower centre, angle step 35°, rise 1.8 per step
  const R = 7.0; let ang = Math.atan2(26 - T.z, -35.5 - T.x); let y = 16.1;
  const steps = 26; const RISE = 1.45; L.spiral = [];
  for (let i = 1; i <= steps; i++) {
    ang += THREE.MathUtils.degToRad(34);
    y += RISE;
    const px = T.x + Math.cos(ang) * R, pz = T.z + Math.sin(ang) * R;
    // every 7th platform is a slider; every 9th is missing (forces a double jump)
    L.spiral.push({ i, x: px, y, z: pz, gap: i % 9 === 0 });
    if (i % 9 === 0) { y -= RISE; continue; }   // gap: next platform sits at this height → double-jump gate, not a wall
    if (i % 7 === 0) {
      const pl = world.add(new Box(px, y - 0.5, pz, 2.2, 0.5, 2.2, { moving: true, tag: 'slider' }));
      const ox = Math.cos(ang) * 2.6, oz = Math.sin(ang) * 2.6;
      pl.path = { a: { x: px - ox * 0.25, y: y - 0.5, z: pz - oz * 0.25 }, b: { x: px + ox * 0.45, y: y - 0.5, z: pz + oz * 0.45 }, period: 4, phase: i * 0.7 };
      L.platforms.push(pl);
    } else {
      const w = (i % 5 === 0 && i % 9 !== 1) ? 2.0 : 2.6;
      block(px, y - 0.5, pz, w, 0.5, w, i % 2 ? C.stone : C.stoneL);
      // bracket
      deco((px + T.x) / 2, y - 1.2, (pz + T.z) / 2, 0.6, 0.6, 0.6, C.woodD);
    }
    if (i === 6) L.spawns.push({ kind: 'grunt', x: px, y: y + 0.05, z: pz });
    if (i === 12) { L.checkpoints.push({ x: px, y: y + 0.05, z: pz, name: 'Keep mid' }); }
    if (i === 10 || i === 20) L.torches.push({ x: px + (T.x - px) * 0.15, y: y + 1.6, z: pz + (T.z - pz) * 0.15 });
  }
  // tower-face crossbow perches
  block(T.x + 4.8, 24, T.z - 4.8, 2, 0.5, 2, C.stone); L.spawns.push({ kind: 'crossbow', x: T.x + 4.8, y: 24.55, z: T.z - 4.8, perch: true });
  // top platform (y = 40.6) — arena + flag
  const topY = y + RISE;
  block(T.x, 0, T.z, 7, topY - 1, 7, C.stoneD);
  block(T.x, topY - 1, T.z, 11, 1, 11, C.stone);
  deco(T.x, topY - 0.02, T.z, 11, 0.02, 11, C.stoneL);
  L.arenaCrenels = [];
  const acren = (x, z, w, d) => { const bx = world.add(new Box(x, topY, z, w, 1, d)); const m = boxesMesh([{ x: 0, y: 0.5, z: 0, w, h: 1, d, c: C.stoneL }]); m.position.set(x, topY, z); bx.crumbleMesh = m; L.props.add(m); L.arenaCrenels.push(bx); };
  for (let i = -4; i <= 4; i += 2) { acren(T.x + i, T.z + 5.2, 1, 0.6); acren(T.x + i, T.z - 5.2, 1, 0.6); acren(T.x + 5.2, T.z + i, 0.6, 1); acren(T.x - 5.2, T.z + i, 0.6, 1); }
  L.checkpoints.push({ x: T.x + 3, y: topY + 0.05, z: T.z + 3, name: 'Keep top' });
  L.spawns.push({ kind: 'captain', x: T.x - 1.2, y: topY + 0.05, z: T.z - 1.2, boss: true });
  // arena cover: four pillars
  for (const [ox, oz] of [[3.6, 3.6], [-3.6, 3.6], [3.6, -3.6], [-3.6, -3.6]]) { block(T.x + ox, topY, T.z + oz, 1.2, 3.2, 1.2, C.stoneL); deco(T.x + ox, topY + 3.2, T.z + oz, 1.6, 0.3, 1.6, C.stoneD); }
  // keep silhouette: corner buttresses, a string course, arrow slits, banners
  for (const [ox, oz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    block(T.x + ox * 3.9, 0, T.z + oz * 3.9, 1.6, topY - 8, 1.6, C.stoneD);
    deco(T.x + ox * 3.9, topY - 8, T.z + oz * 3.9, 2.0, 1.0, 2.0, C.stoneL);
  }
  for (let yy = 10; yy < topY - 6; yy += 8) deco(T.x, yy, T.z, 7.4, 0.5, 7.4, C.stoneL);
  for (let yy = 14; yy < topY - 6; yy += 6) { deco(T.x + 3.52, yy, T.z, 0.06, 1.6, 0.3, '#1a1418'); deco(T.x - 3.52, yy, T.z, 0.06, 1.6, 0.3, '#1a1418'); deco(T.x, yy, T.z + 3.52, 0.3, 1.6, 0.06, '#1a1418'); deco(T.x, yy, T.z - 3.52, 0.3, 1.6, 0.06, '#1a1418'); }
  deco(T.x + 3.55, topY - 14, T.z + 1.2, 0.1, 6, 1.4, C.banner); deco(T.x - 3.55, topY - 20, T.z - 1.2, 0.1, 6, 1.4, C.banner);
  // banners along the north wall's inner face and the towers
  for (const bx of [-22, -14, 14, 22]) { deco(bx, 2, 29.95, 1.4, 3.6, 0.08, C.banner); deco(bx, 5.6, 29.95, 1.8, 0.25, 0.2, C.gold); }
  deco(30, 6, 27.9, 1.8, 5, 0.1, C.banner); deco(-30, 6, 27.9, 1.8, 5, 0.1, C.banner);
  // flagpole
  deco(T.x, topY, T.z, 0.3, 7, 0.3, C.wood);
  L.goal = { x: T.x, y: topY, z: T.z, r: 2.2 };
  L.beacon = { x: T.x, y: topY + 7, z: T.z };
  L.torches.push({ x: T.x + 4.6, y: topY + 1.5, z: T.z + 4.6 }, { x: T.x - 4.6, y: topY + 1.5, z: T.z - 4.6 });
  L.topY = topY; L.tower = T;

  // ---------------- MESHES ----------------
  L.mesh = boxesMesh(stat);
  // platform meshes
  for (const pl of L.platforms) {
    const m = boxesMesh([{ x: 0, y: pl.h / 2, z: 0, w: pl.w, h: pl.h, d: pl.d, c: pl.tag === 'hoist' ? C.hoist : C.wood }]);
    pl.mesh = m; L.props.add(m);
  }
  // ladders meshes
  for (const ld of L.ladders) {
    const g = new THREE.Group();
    const rails = boxesMesh([
      { x: -0.45, y: 4, z: 0, w: 0.14, h: 8.6, d: 0.14, c: C.wood }, { x: 0.45, y: 4, z: 0, w: 0.14, h: 8.6, d: 0.14, c: C.wood },
      ...Array.from({ length: 14 }, (_, i) => ({ x: 0, y: 0.4 + i * 0.58, z: 0, w: 0.9, h: 0.08, d: 0.1, c: C.woodD })),
    ]);
    g.add(rails); g.position.set(ld.x, ld.bottom, ld.z); ld.mesh = g; L.props.add(g);
  }
  // barricade meshes
  for (const bx of L.barricades) {
    const m = boxesMesh([
      ...Array.from({ length: Math.round(bx.h / 0.6) }, (_, i) => ({ x: 0, y: 0.4 + i * 0.6, z: 0, w: bx.w, h: 0.28, d: bx.d, c: i % 2 ? C.wood : C.woodD })),
      { x: -bx.w * 0.3, y: bx.h / 2, z: -bx.d * 0.35, w: 0.2, h: bx.h, d: 0.2, c: C.woodD }, { x: bx.w * 0.3, y: bx.h / 2, z: bx.d * 0.35, w: 0.2, h: bx.h, d: 0.2, c: C.woodD },
      { x: 0, y: bx.h / 2, z: 0, w: 0.3, h: bx.h, d: 0.3, c: '#3a3d44' },
    ]);
    m.position.set(bx.cx, bx.min.y, bx.cz); bx.mesh = m; L.props.add(m);
  }
  // signposts: canvas-texture planes on a post
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
  // flag
  const flag = boxesMesh([{ x: 0.9, y: 0, z: 0, w: 1.8, h: 1.1, d: 0.06, c: C.banner }, { x: 0.9, y: 0.0, z: 0.04, w: 0.6, h: 0.5, d: 0.02, c: C.gold }]);
  flag.position.set(L.goal.x, L.goal.y + 6.2, L.goal.z); L.flag = flag; L.props.add(flag);
  return L;
}

export function updatePlatforms(L, time, dt) {
  for (const pl of L.platforms) {
    const p = pl.path;
    // cycle with dwell at both ends: hold 0-0.22, travel 0.22-0.5, hold 0.5-0.72, travel 0.72-1
    const u = ((time / p.period + p.phase) % 1 + 1) % 1;
    const ease = x => 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, x)) * Math.PI);
    const s = u < 0.22 ? 0 : u < 0.5 ? ease((u - 0.22) / 0.28) : u < 0.72 ? 1 : 1 - ease((u - 0.72) / 0.28);
    const nx = p.a.x + (p.b.x - p.a.x) * s, ny = p.a.y + (p.b.y - p.a.y) * s, nz = p.a.z + (p.b.z - p.a.z) * s;
    pl.vel.x = nx - pl.cx; pl.vel.y = ny - pl.min.y; pl.vel.z = nz - pl.cz;   // per-step delta (used by Body.move)
    pl.setCenter(nx, ny, nz);
    if (pl.mesh) pl.mesh.position.set(nx, ny, nz);
  }
}
