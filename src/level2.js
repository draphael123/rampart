import * as THREE from '../vendor/three.module.js';
import { Box } from './physics.js';
import { boxesMesh, MAT } from './voxel.js';

// EMBERMOOR — the vale below the clouds. A night moor of ash and dying embers,
// reached from Pennant Vale's war table. Four crests: relight the five beacons,
// fell the Ember Marshal on the broken spire, gather eight scorched pennants,
// and cross the void chain. Compact, moody, reuses every system.
const C = {
  ash: '#4a4448', ashD: '#3a353a', rock: '#524a50', rockD: '#423c42', rockL: '#665e64',
  ember: '#ff7a30', emberD: '#c04a18', wood: '#4e3a2a', woodD: '#382a1e', iron: '#2e3038',
  stone: '#5e5a62', stoneD: '#4a4650', stoneL: '#746e78', gold: '#c9a24a', banner: '#6a1f1f',
};

export function buildLevel2(world) {
  const L = { static: [], spawns: [], ladders: [], checkpoints: [], platforms: [], props: new THREE.Group(), goal: null, torches: [], vale: 2 };
  const stat = L.static;
  let seed = 31; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jit = (c) => { if (typeof c !== 'string' || !c.startsWith('#') || c.length !== 7) return c; const k = 0.93 + rnd() * 0.14; const n = parseInt(c.slice(1), 16); const r = Math.min(255, ((n >> 16) & 255) * k) | 0, g = Math.min(255, ((n >> 8) & 255) * k) | 0, b = Math.min(255, (n & 255) * k) | 0; return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0'); };
  const block = (x, y, z, w, h, d, c, opts = {}) => { if (!opts.noCollide) world.add(new Box(x, y, z, w, h, d, opts)); stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) }); };
  const deco = (x, y, z, w, h, d, c) => stat.push({ x, y: y + h / 2, z, w, h, d, c: jit(c) });
  L.signs = []; L.tutorial = []; L.pennants = []; L.shards = []; L.hearts = []; L.trees = [];
  const sign = (x, y, z, text, facing = 0) => L.signs.push({ x, y, z, text, facing });
  const pennant = (x, y, z) => L.pennants.push({ x, y, z });
  const pad = (x, z, w, d, top, th = 7, c = C.ash) => {
    block(x, top - th, z, w, th, d, C.rock);
    deco(x, top - 0.01, z, w, 0.04, d, c);
    deco(x, top - 0.5, z, w + 0.24, 0.5, d + 0.24, C.ashD);
    for (let sy = top - th + 0.6; sy < top - 1.2; sy += 1.5 + rnd()) deco(x, sy, z, w + 0.1 + rnd() * 0.16, 0.28, d + 0.1 + rnd() * 0.16, rnd() < 0.5 ? C.rockD : '#4a4248');
  };
  const emberCrack = (x, z, w, d) => { deco(x, 0.02 - 30, z, w, 0.03, d, C.emberD); deco(x, 0.04 - 30, z, w * 0.55, 0.03, d * 0.55, C.ember); };
  const rubble = (x, y, z, n = 5) => { for (let i = 0; i < n; i++) deco(x + (rnd() - 0.5) * 2.2, y, z + (rnd() - 0.5) * 2.2, 0.3 + rnd() * 0.5, 0.2 + rnd() * 0.4, 0.3 + rnd() * 0.5, rnd() < 0.5 ? C.rockD : C.rock); };
  const deadTree = (x, y, z, s = 1) => { block(x, y, z, 0.35 * s, 2.4 * s, 0.35 * s, C.woodD); deco(x + 0.5 * s, y + 1.8 * s, z, 1.1 * s, 0.16 * s, 0.16 * s, C.woodD); deco(x - 0.4 * s, y + 2.1 * s, z + 0.2 * s, 0.9 * s, 0.14 * s, 0.14 * s, C.wood); };
  const shard = (x, y, z) => L.shards.push({ x, y, z });
  const boulder = (x, y, z, s = 1) => { block(x, y, z, 1.6 * s, 1.1 * s, 1.4 * s, rnd() < 0.5 ? C.rock : C.rockL); };

  // ---- the moor floor (three pads stepping up toward the spire)
  pad(0, -20, 64, 70, -30, 9);
  pad(0, 32, 56, 36, -26, 8);
  pad(0, 62, 44, 28, -21, 8);
  // ember cracks glowing through the ash
  for (let i = 0; i < 14; i++) emberCrack(-26 + rnd() * 52, -46 + rnd() * 70, 1.2 + rnd() * 3.5, 0.4 + rnd() * 0.8);
  for (let i = 0; i < 20; i++) deadTree(-26 + rnd() * 52, -30, -48 + rnd() * 60, 0.7 + rnd() * 0.8);
  for (let i = 0; i < 10; i++) boulder(-24 + rnd() * 48, -30, -44 + rnd() * 56, 0.8 + rnd() * 0.9);
  L.start = { x: 0, y: -29.9, z: -46 };
  L.checkpoints.push({ x: 0, y: -29.9, z: -46, name: 'The Embermoor' });
  sign(4, -30, -43, 'EMBERMOOR\nrelight the five beacons\nfell the Marshal', Math.PI);
  L.tutorial.push({ z: -44, key: 'v2', text: 'The vale below the clouds. Four crests sleep here.' });
  // the return arch back to Pennant Vale
  deco(-6, -30, -48, 0.9, 5, 0.9, C.stone); deco(-3, -30, -48, 0.9, 5, 0.9, C.stone); deco(-4.5, -25.2, -48, 4.2, 0.9, 0.9, C.stoneL);
  deco(-4.5, -29.2, -48.1, 2.4, 4.2, 0.2, '#8ab0d8');
  L.returnGate = { x: -4.5, y: -29.9, z: -47.5 };
  sign(-1, -30, -45.5, 'the way home\nto Pennant Vale', 2.6);

  // ---- five cold beacons scattered over the moor
  L.braziers = [];
  const beacon = (x, y, z) => {
    block(x, y, z, 1.6, 1.0, 1.6, C.stoneD); deco(x, y + 1.0, z, 1.9, 0.35, 1.9, C.iron);
    deco(x, y + 1.35, z, 1.2, 0.3, 1.2, '#241f26');
    L.braziers.push({ x, y: y + 1.6, z, lit: false });
  };
  beacon(-20, -30, -34); beacon(22, -30, -8); beacon(-18, -26, 26); beacon(16, -21, 58); beacon(0, -30, 6);
  // CHARRED WATCHTOWER: a burned stump of the old moor-watch
  block(24, -30, -46, 3.4, 1.0, 3.4, C.rockD);
  block(25.2, -29, -47.2, 1.0, 4.0, 1.0, '#1c1820'); block(22.8, -29, -47.2, 1.0, 2.4, 1.0, '#241e28');
  block(25.2, -29, -44.8, 1.0, 1.5, 1.0, '#241e28'); block(22.8, -29, -44.8, 1.0, 3.2, 1.0, '#1c1820');
  deco(24, -29, -46, 1.6, 0.9, 1.6, C.rockD);
  deco(25.2, -25.0, -47.2, 1.3, 0.24, 1.3, '#2c2430');
  rubble(24, -30, -43.4, 5); rubble(26.2, -30, -46, 3);
  deco(23.4, -29.98, -48.6, 1.4, 0.05, 1.0, '#16121c');
  // BONE ARCH: something vast died on this moor
  block(-8.4, -30, 2, 0.8, 3.4, 0.8, '#cfc8b8'); block(-3.6, -30, 2, 0.8, 3.4, 0.8, '#c4bcac');
  deco(-8.4, -26.6, 2, 1.0, 0.5, 1.0, '#dcd4c4'); deco(-3.6, -26.6, 2, 1.0, 0.5, 1.0, '#dcd4c4');
  deco(-6, -26.3, 2, 4.4, 0.55, 0.7, '#dcd4c4');
  deco(-6, -25.9, 2, 2.6, 0.4, 0.6, '#cfc8b8');
  deco(-10.4, -30, 3.4, 0.5, 1.9, 0.5, '#c4bcac'); deco(-1.6, -30, 0.8, 0.5, 1.5, 0.5, '#cfc8b8');
  deco(-11.4, -30, 1.2, 0.4, 1.1, 0.4, '#b8b0a0'); deco(-0.8, -30, 3.2, 0.4, 0.8, 0.4, '#c4bcac');
  // BURNING TREE: one dead oak that never stopped smouldering
  deadTree(18, -26, 22, 1.4);
  deco(18, -26, 22, 1.3, 0.35, 1.3, '#1c1014');
  L.torches.push({ x: 18.4, y: -22.4, z: 22 });
  // geyser cracks: scorched seams where the moor breathes
  for (const [gx, gy, gz] of [[12, -30, -28], [-14, -30, 4], [6, -26, 36]]) {
    deco(gx, gy + 0.02, gz, 2.4, 0.05, 0.9, '#160e12'); deco(gx, gy + 0.03, gz, 1.6, 0.05, 0.45, '#5a1e12');
    deco(gx + 0.9, gy + 0.02, gz + 0.7, 1.0, 0.04, 0.5, '#160e12'); deco(gx - 0.8, gy + 0.02, gz - 0.6, 0.9, 0.04, 0.5, '#160e12');
  }
  // the shrine where the beacon crest rises
  deco(0, -30, -16, 4.4, 0.4, 4.4, C.stone); deco(0, -29.6, -16, 3, 0.3, 3, C.stoneL);
  for (const [ox, oz] of [[1.7, 1.7], [-1.7, 1.7], [1.7, -1.7], [-1.7, -1.7]]) deco(ox, -30, -16 + oz, 0.45, 1.9, 0.45, C.stoneD);
  L.shrine = { x: 0, y: -29.4, z: -16 };
  sign(3.4, -30, -14, 'five flames\nraise a crest here', 2.8);

  // ---- pennants (8) along the moor
  pennant(12, -30, -38); pennant(-24, -30, -18); pennant(24, -30, -28); pennant(-10, -30, 2);
  pennant(8, -26, 30); pennant(-16, -26, 38); pennant(20, -21, 54); pennant(-8, -21, 66);

  // ---- shards? a modest 12 in the dark (counts toward nothing here — ambience)
  shard(6, -29.4, -30); shard(-14, -29.4, -6); shard(18, -25.4, 34); shard(-4, -20.4, 60);

  // ---- rises between pads (rubble ramps)
  const stairs2 = (x, z0, y0, n, width) => { for (let i = 0; i < n; i++) block(x, y0, z0 + i * 0.55, width, 0.42 * (i + 1), 0.57, i % 2 ? C.rock : C.rockD); };
  stairs2(-6, 8.2, -30, 11, 6); stairs2(8, 41.8, -26, 11, 6);
  L.checkpoints.push({ x: -6, y: -25.9, z: 20, name: 'The mid moor' });

  // ---- THE BROKEN SPIRE: the Marshal's perch (mini-arena at the far end)
  const T = { x: 0, z: 84 };
  block(T.x, -21, T.z, 6, 17, 6, C.stoneD);
  block(T.x, -4.5, T.z, 14, 1, 14, C.stone);
  deco(T.x, -3.52, T.z, 14, 0.02, 14, C.stoneL);
  for (let k = 0; k < 12; k++) { const a2 = k / 12 * Math.PI * 2; const f = 6.8 / Math.max(Math.abs(Math.cos(a2)), Math.abs(Math.sin(a2))); deco(T.x + Math.cos(a2) * (f - 0.25), -5.3, T.z + Math.sin(a2) * (f - 0.25), 0.7, 0.85, 0.7, C.stoneL); }
  L.arenaCrenels = [];
  const acren = (x, z, w, d) => { const bx = world.add(new Box(x, -3.5, z, w, 1, d)); const m = boxesMesh([{ x: 0, y: 0.5, z: 0, w, h: 1, d, c: C.stoneL }]); m.position.set(x, -3.5, z); bx.crumbleMesh = m; L.props.add(m); L.arenaCrenels.push(bx); };
  for (let i = -6; i <= 6; i += 2) { if (i === 0) continue; acren(T.x + i, T.z + 6.7, 1, 0.6); acren(T.x + i, T.z - 6.7, 1, 0.6); acren(T.x + 6.7, T.z + i, 0.6, 1); acren(T.x - 6.7, T.z + i, 0.6, 1); }
  // ramp up the spire from the high pad
  stairs2(0, 68.5, -21, 14, 5);
  block(0, -13.2, 76.6, 5, 0.5, 2.4, C.stone);
  stairs2(0, 77.6, -13.2, 12, 5);
  L.checkpoints.push({ x: 0, y: -3.4, z: 78.5, name: 'The spire' });
  L.spawns.push({ kind: 'captain', x: T.x, y: -3.4, z: T.z + 2, boss: true });
  for (const [ox, oz] of [[4.4, 4.4], [-4.4, 4.4], [4.4, -4.4], [-4.4, -4.4]]) { block(T.x + ox, -3.5, T.z + oz, 1.2, 2.8, 1.2, C.stoneL); }
  deco(T.x, -3.5, T.z, 0.3, 6, 0.3, C.wood);
  L.goal = { x: T.x, y: -3.5, z: T.z, r: 2.2 };
  L.beacon = { x: T.x, y: 2, z: T.z };
  L.tower = T; L.topY = -3.5;
  L.torches.push({ x: T.x + 4.4, y: -2, z: T.z + 4.4 }, { x: T.x - 4.4, y: -2, z: T.z - 4.4 });

  // ---- THE VOID CHAIN: floating slabs off the moor's west edge → the peaks crest
  const chain = [ [-30, -30, 0], [-37, -29.2, 2.5], [-43.5, -28.2, 5.5], [-49.5, -27, 9], [-55.5, -25.8, 13.5] ];
  for (const [cx2, cy2, cz2] of chain) { block(cx2, cy2 - 5, cz2, 4.4, 5, 4.4, C.rockD); deco(cx2, cy2 - 0.05, cz2, 4.7, 0.3, 4.7, C.ashD); }
  L.peakCrest = { x: chain[4][0], y: chain[4][1] + 0.6, z: chain[4][2] };
  sign(-26, -30, -4, 'the void chain:\nlong jumps west', -2.4);

  // ---- moor rim cliffs
  block(-36, -36, -36, 10, 26, 40, C.rockD); block(-36, -36, 46, 10, 26, 60, C.rockD);   // west rim with a gap for the void chain
  block(36, -36, 10, 10, 26, 130, C.rockD); block(0, -34, -56, 84, 22, 10, C.rockD);
  deco(0, -44, 10, 76, 10, 130, '#2a262c');
  // enemies: sparse night hunters
  L.spawns.push({ kind: 'hound', x: 8, y: -29.9, z: -20 }, { kind: 'hound', x: -12, y: -25.9, z: 34 });
  L.spawns.push({ kind: 'bomber', x: 12, y: -20.9, z: 62 });

  // ---------------- MESHES ----------------
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
  flag.position.set(L.goal.x, L.goal.y + 5.2, L.goal.z); L.flag = flag; L.props.add(flag);
  return L;
}
