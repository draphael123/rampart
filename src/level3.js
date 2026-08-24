import * as THREE from '../vendor/three.module.js';
import { Box } from './physics.js';
import { boxesMesh } from './voxel.js';

// SKYREACH — beyond the crest door. A chain of floating islets ABOVE the clouds,
// climbing a wind-carved stair to the Gale Spire, then descending INSIDE the
// great island: the Undercroft, a torch-lit hollow in the rock the sky carries.
// Four crests: the Stair, the Gale, the Undercroft, and eight sky pennants.
const C = {
  turf: '#8fae6a', turfD: '#7a9a58', rock: '#8a8fa0', rockD: '#6e7484', rockL: '#a8aeba',
  stone: '#9aa0b0', stoneD: '#7e8494', stoneL: '#b8bec8', wood: '#7a5c3a', woodD: '#5e462c',
  gold: '#c9a24a', banner: '#b03a3a', cave: '#4e4a58', caveD: '#3e3a48', white: '#e8e4d8',
};

export function buildLevel3(world) {
  const L = { static: [], spawns: [], ladders: [], checkpoints: [], platforms: [], props: new THREE.Group(), goal: null, torches: [], vale: 3 };
  const stat = L.static;
  let seed = 47; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jit = (c) => { if (typeof c !== 'string' || !c.startsWith('#') || c.length !== 7) return c; const k = 0.93 + rnd() * 0.14; const n = parseInt(c.slice(1), 16); const r = Math.min(255, ((n >> 16) & 255) * k) | 0, g = Math.min(255, ((n >> 8) & 255) * k) | 0, b = Math.min(255, (n & 255) * k) | 0; return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); };
  const block = (x, y, z, w, h, d, c, opts = {}) => { if (!opts.noCollide) world.add(new Box(x, y, z, w, h, d, opts)); stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) }); };
  const deco = (x, y, z, w, h, d, c) => stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) });
  L.signs = []; L.tutorial = []; L.pennants = []; L.shards = []; L.hearts = []; L.trees = []; L.winds = [];
  const sign = (x, y, z, text, facing = 0) => L.signs.push({ x, y, z, text, facing });
  const pennant = (x, y, z) => L.pennants.push({ x, y, z });
  const rubble = (x, y, z, n = 4) => { for (let i = 0; i < n; i++) deco(x + (rnd() - 0.5) * 2.0, y, z + (rnd() - 0.5) * 2.0, 0.3 + rnd() * 0.5, 0.2 + rnd() * 0.4, 0.3 + rnd() * 0.5, rnd() < 0.5 ? C.rockD : C.rock); };
  const tuft = (x, y, z) => { deco(x, y, z, 0.25, 0.2 + rnd() * 0.2, 0.25, rnd() < 0.5 ? '#7fa05a' : '#6e9050'); };

  // a floating islet: turf top + tapering rock underside
  const islet = (x, z, w, d, top, c = C.turf) => {
    block(x, top - 1.2, z, w, 1.2, d, C.rock);
    deco(x, top - 0.01, z, w, 0.04, d, c);
    deco(x, top - 0.42, z, w + 0.24, 0.42, d + 0.24, C.turfD);
    deco(x + (rnd() - 0.5), top - 2.4, z + (rnd() - 0.5), w * 0.7, 1.6, d * 0.7, C.rockD);
    deco(x + (rnd() - 0.5) * 1.4, top - 4.0, z + (rnd() - 0.5) * 1.4, w * 0.42, 1.8, d * 0.42, C.rock);
    deco(x, top - 5.3, z, w * 0.2, 1.6, d * 0.2, C.rockD);
  };
  // a pure cloud slab: bright platform of packed cloud
  const cloudSlab = (x, y, z, w = 4, d = 4) => { block(x, y, z, w, 0.7, d, C.white); deco(x, y - 0.28, z, w * 0.8, 0.4, d * 0.8, '#d8dce8'); };
  // wind-bent tree: trunk with a streaming one-sided canopy
  const bentTree = (x, y, z, s = 1) => { block(x, y, z, 0.35 * s, 1.7 * s, 0.35 * s, C.woodD); deco(x + 0.9 * s, y + 1.5 * s, z, 1.7 * s, 0.5 * s, 1.1 * s, '#7fa05a'); deco(x + 1.5 * s, y + 1.2 * s, z + 0.2, 1.0 * s, 0.4 * s, 0.7 * s, '#6e9050'); };

  // ================= 1. THE LANDING =================
  islet(0, 0, 22, 20, 0);
  L.start = { x: 0, y: 0.1, z: -4 };
  L.checkpoints.push({ x: 0, y: 0.1, z: -4, name: 'The Landing' });
  sign(3, 0, -7, 'SKYREACH\nthe stair climbs north\nwind has a rhythm', Math.PI);
  L.tutorial.push({ z: -2, key: 'sky', text: 'Islets adrift over the cloud sea. Four crests ride the wind here.' });
  // the return door: an arch back down to the Vale
  block(-6.8, 0, -7.2, 0.7, 3.4, 0.7, C.stone); block(-4.2, 0, -7.2, 0.7, 3.4, 0.7, C.stone);
  deco(-5.5, 3.4, -7.2, 3.3, 0.6, 0.9, C.stoneL); deco(-5.5, 0.02, -7.2, 2.4, 0.05, 1.6, C.stoneD);
  deco(-5.5, 1.2, -7.55, 2.0, 2.2, 0.12, '#b8d0e8');
  L.returnGate = { x: -5.5, y: 0.1, z: -6.6 };
  // pennant shrine (the 8-pennant crest rises here)
  deco(7, 0, -6, 3.4, 0.28, 3.4, C.stone); deco(7, 0.28, -6, 2.2, 0.22, 2.2, C.stoneL);
  deco(7, 0.5, -6, 0.18, 2.2, 0.18, C.wood); deco(7.45, 2.2, -6, 1.0, 0.7, 0.06, C.banner);
  L.shrine = { x: 7, y: 0.6, z: -6 };
  bentTree(-8, 0, 3, 1.1); bentTree(9, 0, 6, 0.9);
  for (let i = 0; i < 8; i++) tuft(-9 + rnd() * 18, 0, -8 + rnd() * 16);
  rubble(-3, 0, 7, 3);
  L.hearts.push({ x: -8.5, y: 0, z: -2 });
  pennant(8, 0, 4);

  // ================= 2. THE STAIR (islet chain north) =================
  // every stair islet carries a low approach SHELF on its near side: two honest
  // 1.5m steps instead of one impossible 3m leap (max run-jump rise is ~2.1m)
  const shelf = (x, top, z, w = 3, d = 2.4) => { block(x, top - 0.7, z, w, 0.7, d, C.rockL); deco(x, top, z, w - 0.5, 0.05, d - 0.5, C.turfD); };
  islet(0, 16, 7, 6, 2); shelf(0, 0.5, 12.2); pennant(0, 2, 18);
  islet(6, 27, 6, 5, 4.5); shelf(4.5, 3.0, 23.6);
  islet(-2, 38, 6.5, 5.5, 7); shelf(0.8, 5.5, 34.0);
  L.spawns.push({ kind: 'crossbow', x: -2, y: 7.1, z: 40, perch: true });
  pennant(-2, 7, 36);
  // the gust crossing: wind shoves +x between these two
  islet(-10, 49, 5.5, 5, 10); shelf(-7.2, 8.5, 45.3);
  L.winds.push({ x: -6, y: 8.5, z: 44, r: 6.5, h: 9, dx: 1, dz: 0, period: 6, on: 2.4 });
  pennant(-10, 10, 51);
  islet(-4, 61, 8, 7, 13); shelf(-6.4, 11.5, 56.3);
  L.checkpoints.push({ x: -4, y: 13.1, z: 61, name: 'The Stair' });
  L.crestSpots = { stair: { x: -4, y: 13.4, z: 63 } };
  bentTree(-7, 13, 59, 0.8); tuft(-2, 13, 63); tuft(-6, 13, 64);


  // ================= 3. THE GALE SPIRE =================
  cloudSlab(2, 12.4, 68); cloudSlab(8, 11.8, 72);
  islet(14, 76, 10, 9, 10);
  // spire body; the top platform overhangs south so the updraft delivers you onto its lip
  block(14, 10, 79, 6, 17, 5, C.rock);
  deco(14, 10.2, 76.2, 6.4, 0.5, 0.8, C.rockD);
  block(14, 27, 79, 7, 1.0, 6, C.stone); deco(14, 28, 79, 6.2, 0.06, 5.2, C.turf); deco(14, 27.6, 79, 7.3, 0.42, 6.3, C.turfD);
  L.winds.push({ x: 14, y: 19, z: 73.4, r: 2.4, h: 11, up: true });
  deco(14, 10.05, 73.4, 2.2, 0.06, 2.2, '#b8d0e8');   // updraft vent glow patch
  sign(10.5, 10, 73, 'the gale blows UP\nstand in the vent', 2.4);
  L.crestSpots.gale = { x: 14, y: 28.4, z: 80 };
  L.checkpoints.push({ x: 14, y: 28.1, z: 77, name: 'The Gale' });
  pennant(16.5, 28, 74.5);
  L.spawns.push({ kind: 'crossbow', x: 17.5, y: 10.1, z: 79, perch: true });
  L.tower = { x: 14, z: 79 }; L.topY = 28;
  L.goal = null;
  L.flagSpot = { x: 12, y: 28, z: 80 };

  // ================= 4. THE UNDERCROFT (descend inside the island) =================
  // bridge from spire top: cloud slabs stepping north-west and down
  cloudSlab(8, 26.4, 86); cloudSlab(2, 25.6, 92, 4.5, 4.5);
  // the great island. Interior hollow: x -8..8, z 93.5..108.5, floor top y 4.2, cap under 24.8.
  // CAP: a ring of four slabs (y 24.8..26) leaving a real 3.2x3.8 entry hole at (4, 98.65)
  block(0, 24.8, 93.875, 22, 1.2, 5.75, C.rock);                 // south strip (z 91..96.75)
  block(0, 24.8, 105.775, 22, 1.2, 10.45, C.rock);               // north strip (z 100.55..111)
  block(-4.3, 24.8, 98.65, 13.4, 1.2, 3.8, C.rock);              // west of the hole
  block(8.3, 24.8, 98.65, 5.4, 1.2, 3.8, C.rock);                // east of the hole
  // turf on the roof (visual, mirrors the ring)
  deco(0, 25.99, 93.875, 22, 0.04, 5.75, C.turf); deco(0, 25.99, 105.775, 22, 0.04, 10.45, C.turf);
  deco(-4.3, 25.99, 98.65, 13.4, 0.04, 3.8, C.turf); deco(8.3, 25.99, 98.65, 5.4, 0.04, 3.8, C.turf);
  deco(0, 24.4, 101, 22.3, 0.42, 20.3, C.turfD);                 // rim lip
  // entry crack walls standing on the roof around the hole
  block(4, 26, 100.45, 3.4, 1.1, 0.5, C.rockD);   // north lip wall (south side open: walk in)
  block(2.45, 26, 98.65, 0.5, 1.1, 4.1, C.rockD); block(5.55, 26, 98.65, 0.5, 1.1, 4.1, C.rockD);
  L.checkpoints.push({ x: 4, y: 26.1, z: 95.2, name: 'The Undercroft' });
  sign(6.8, 26, 95, 'the UNDERCROFT\ndescend inside the island', 2.8);
  pennant(0, 26.9, 94);   // on the roof
  // WALLS of the hollow (y 4 up to the cap)
  block(-9.3, 4, 101, 2.6, 21, 20, C.cave);                      // west
  block(9.3, 4, 101, 2.6, 21, 20, C.cave);                       // east
  block(0, 4, 92.2, 21.2, 21, 2.6, C.cave);                      // south
  block(0, 4, 109.8, 21.2, 21, 2.6, C.cave);                     // north
  // FLOOR: four slabs (y 2..4.2) leaving a real 2.6x2.6 exit hole at (-4, 106)
  block(0, 2, 98.35, 20, 2.2, 12.7, C.caveD);                    // z 92..104.7
  block(0, 2, 108.65, 20, 2.2, 2.7, C.caveD);                    // z 107.3..110
  block(-7.65, 2, 106, 4.7, 2.2, 2.6, C.caveD);                  // west of the hole
  block(3.65, 2, 106, 12.7, 2.2, 2.6, C.caveD);                  // east of the hole
  // underside taper (visual)
  deco(0, -1.2, 101, 16, 3, 14, C.rockD); deco(0.6, -3.8, 100, 10, 2.2, 9, C.rock); deco(0, -5.6, 101, 4.5, 1.8, 4, C.rockD);
  // descending ledges hugging the walls (a broken spiral)
  const ledge = (x, y, z, w = 3.2, d = 2.8) => { block(x, y, z, w, 0.5, d, C.stoneD); deco(x, y + 0.5, z, w - 0.6, 0.06, d - 0.6, C.stone); };
  ledge(4, 22, 98.6);                                            // directly under the entry
  ledge(7, 19.5, 103); L.torches.push({ x: 7.2, y: 21.0, z: 104.2 });
  ledge(2, 17, 106.8);
  ledge(-4, 14.5, 106.8); pennant(-4, 15.2, 106.8);
  ledge(-7.2, 12, 101); L.torches.push({ x: -7.4, y: 13.5, z: 99.8 });
  ledge(-4, 9.5, 95.3);
  ledge(2, 7, 94.4); L.torches.push({ x: 2.2, y: 8.5, z: 93.8 });
  ledge(6.5, 5.5, 99);
  // light-slit cracks in the east wall (daylight through the rock)
  deco(7.9, 12, 97, 0.4, 3.2, 0.5, '#d8e8f8'); deco(7.9, 8, 104, 0.4, 2.4, 0.5, '#d8e8f8');
  L.crestSpots.undercroft = { x: 0, y: 4.6, z: 103 };
  L.hearts.push({ x: 2, y: 4.2, z: 99 });
  rubble(-3, 4.2, 102, 5); rubble(4, 4.2, 106.8, 3);
  L.spawns.push({ kind: 'swarm', x: -4, y: 4.3, z: 103 }, { kind: 'swarm', x: 3, y: 4.3, z: 101 }, { kind: 'swarm', x: -1, y: 4.3, z: 97 });
  L.torches.push({ x: 0, y: 5.4, z: 108.6 });
  sign(-4, 4.2, 103.6, 'the sky shows through\nbelow: drop down', 0.6);
  // catch slabs under the island, stepping down toward the finale
  cloudSlab(-6, -3, 108, 5, 5); cloudSlab(-11, -7.5, 112, 4.5, 4.5);

  // ================= 5. THE FINALE ISLET =================
  islet(-18, 118, 13, 11, -12);
  L.checkpoints.push({ x: -18, y: -11.9, z: 118, name: 'The Far Islet' });
  L.spawns.push({ kind: 'shield', x: -18, y: -11.9, z: 121 });
  pennant(-21, -12, 121); L.hearts.push({ x: -20, y: -12, z: 120.5 });
  bentTree(-22, -12, 116, 1.2); tuft(-19, -12, 122); tuft(-14, -12, 119);
  rubble(-16, -12, 122, 3);
  // the ride home: an updraft column back to the undercroft roof
  L.winds.push({ x: -15.2, y: 9, z: 115, r: 2.4, h: 23, up: true });
  deco(-15.2, -11.95, 115, 2.2, 0.06, 2.2, '#b8d0e8');
  sign(-15.8, -12, 111.8, 'the wind goes HOME\nride it up', 1.2);

  L.peakCrest = null;
  L.beacon = { x: 14, y: -15, z: 79 };   // the spire beam: a landmark column visible level-wide

  // ================= MESHES =================
  L.mesh = boxesMesh(stat);
  for (const pl of L.platforms) { const m = boxesMesh([{ x: 0, y: pl.h / 2, z: 0, w: pl.w, h: pl.h, d: pl.d, c: C.wood }]); pl.mesh = m; L.props.add(m); }
  L.treeMeshes = [];
  for (const sg of L.signs) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
    g.fillStyle = '#241c14'; g.fillRect(0, 0, 512, 256); g.fillStyle = '#4e3a2a'; g.fillRect(10, 10, 492, 236);
    g.fillStyle = '#e8d8c0'; g.font = 'bold 42px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = sg.text.split('\n'); lines.forEach((ln, i) => g.fillText(ln, 256, 128 + (i - (lines.length - 1) / 2) * 54));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: tex }));
    const post = new THREE.Group(); post.add(m); m.position.y = 1.9;
    const stick = boxesMesh([{ x: 0, y: 0.7, z: -0.05, w: 0.12, h: 1.4, d: 0.12, c: C.woodD }]); post.add(stick);
    post.position.set(sg.x, sg.y, sg.z); post.rotation.y = sg.facing; L.props.add(post);
  }
  const flag = boxesMesh([{ x: 0.9, y: 0, z: 0, w: 1.8, h: 1.1, d: 0.06, c: C.banner }, { x: 0.9, y: 0.0, z: 0.04, w: 0.6, h: 0.5, d: 0.02, c: C.gold }]);
  flag.position.set(L.flagSpot.x, L.flagSpot.y + 5.2, L.flagSpot.z); L.flag = flag; L.props.add(flag);
  const pole = boxesMesh([{ x: 0, y: 2.6, z: 0, w: 0.16, h: 5.2, d: 0.16, c: C.woodD }]);
  pole.position.set(L.flagSpot.x, L.flagSpot.y, L.flagSpot.z); L.props.add(pole);
  return L;
}
