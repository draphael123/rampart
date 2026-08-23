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
  const block = (x, y, z, w, h, d, c, opts = {}) => {
    if (!opts.noCollide) world.add(new Box(x, y, z, w, h, d, opts));
    stat.push({ x, y: y + h / 2, z, w, h, d, c });
  };
  const deco = (x, y, z, w, h, d, c) => stat.push({ x, y: y + h / 2, z, w, h, d, c });
  const crenels = (x0, x1, y, z, c = C.stoneL) => { for (let x = x0; x <= x1; x += 2) block(x, y, z, 0.9, 0.7, 0.7, c); };
  const stairs = (x, y, z, dir, steps, rise = 0.4, run = 0.7, width = 3, c = C.stone) => {
    for (let i = 0; i < steps; i++) {
      const sx = x + dir.x * run * i, sz = z + dir.z * run * i;
      const w = dir.x ? run + 0.02 : width, d = dir.z ? run + 0.02 : width;
      block(sx, y, sz, w, rise * (i + 1), d, i % 2 ? c : C.stoneD);
    }
  };

  // ---------------- ZONE A: COURTYARD ----------------
  block(0, -2, 10, 60, 2, 48, C.ground); deco(0, -0.01, 10, 60, 0.02, 48, C.ground);
  deco(-6, 0.0, 4, 6, 0.03, 5, C.dirt); deco(9, 0.0, 14, 7, 0.03, 4, C.dirt);
  block(0, 0, -15, 62, 10, 2, C.stoneD); block(-31, 0, 10, 2, 12, 52, C.stoneD); block(31, 0, 10, 2, 12, 52, C.stoneD);
  block(0, 0, 32, 62, 6.5, 4, C.stone); deco(0, 0, 30.01, 62, 6.5, 0.02, C.stoneD);
  deco(0, 0, 29.9, 4, 5, 0.3, C.iron); deco(0, 5, 29.9, 6, 1, 0.3, C.stoneL);
  block(-8, 0, 0, 1.2, 1.2, 1.2, C.wood); block(-9.2, 0, 0, 1.2, 0.6, 1.2, C.woodD); block(-8, 1.2, 0, 1.2, 1.2, 1.2, C.wood);
  block(5, 0, 2, 1.2, 0.5, 1.2, C.woodD); block(6.3, 0, 2, 1.2, 1.0, 1.2, C.wood);
  block(-3, 0, 8, 2, 2.2, 2, C.stoneD);
  block(12, 0, 6, 3, 1.2, 3, C.stoneD); block(12, 1.2, 6, 2, 1.0, 2, C.stone);
  block(-14, 0, 14, 2.4, 1.0, 2.4, C.stoneL); deco(-14, 1.0, 14, 1.6, 0.2, 1.6, C.iron);
  deco(-14.9, 1, 14, 0.2, 2.2, 0.2, C.wood); deco(-13.1, 1, 14, 0.2, 2.2, 0.2, C.wood); deco(-14, 3.1, 14, 2.4, 0.3, 1.2, C.roof);
  block(4, 0, 20, 3, 0.9, 1.6, C.woodD); deco(2.6, 0.1, 20, 0.3, 1.2, 1.2, C.iron); deco(5.4, 0.1, 20, 0.3, 1.2, 1.2, C.iron);
  for (const [bx, bz] of [[-3, 24], [-4.2, 24.4], [-3.4, 25.5], [20, 3], [21.2, 3.6]]) block(bx, 0, bz, 0.9, 1.1, 0.9, C.wood);
  stairs(26, 0, 4, { x: 0, z: 1 }, 20, 0.4, 0.8, 3.2);
  block(26, 7.6, 21.5, 3.2, 0.4, 4, C.stone);
  block(26, 7.6, 28.5, 3.2, 0.4, 3, C.stone);
  // banners on the south wall
  for (const bx of [-10, 0, 10]) { deco(bx, 3, -13.9, 1.6, 4, 0.1, C.banner); deco(bx, 7, -13.9, 2, 0.3, 0.2, C.gold); }
  L.start = { x: 0, y: 0.1, z: -5 };
  L.checkpoints.push({ x: 0, y: 0.1, z: -5, name: 'Courtyard' });
  L.spawns.push({ kind: 'grunt', x: -4, y: 0.1, z: 10 }, { kind: 'grunt', x: 6, y: 0.1, z: 12 }, { kind: 'grunt', x: 1, y: 0.1, z: 22 });
  L.spawns.push({ kind: 'crossbow', x: 12, y: 2.2, z: 6, perch: true });
  L.torches.push({ x: -29.5, y: 4, z: 0 }, { x: 29.5, y: 4, z: 0 }, { x: -6, y: 5.5, z: 29.6 }, { x: 6, y: 5.5, z: 29.6 });

  // walkway segments at y=6.5 → top y=8 (1.5 thick). Gaps: x∈[-9,-5] (4m), x∈[7,13] (6m)
  const segs = [[-30, -9], [-5, 7], [13, 30]];
  for (const [a, b] of segs) { const w = b - a; block((a + b) / 2, 6.5, 32, w, 1.5, 4, C.stone); }
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
  // enemies on the walk
  L.spawns.push({ kind: 'shield', x: 18, y: 8.1, z: 32 }, { kind: 'shield', x: -2, y: 8.1, z: 32 }, { kind: 'grunt', x: -18, y: 8.1, z: 32 });
  L.spawns.push({ kind: 'crossbow', x: 30, y: 12.1, z: 32, perch: true }, { kind: 'crossbow', x: -3, y: 2.25, z: 8, perch: true });
  // ladders on the outer face (north side, z=34): swarm climbs from y=0 outside to wall top
  for (const lx of [-22, -16, 16, 22, 3]) {
    L.ladders.push({ x: lx, z: 34.6, bottom: 0, top: 8, facing: Math.PI, up: true, respawn: 0, spawnEvery: 4.5, t: 2 + Math.random() * 2 });
  }
  // outside ground (so falling off the far side is death but looks like a field)
  block(0, -3, 64, 160, 3, 60, C.grass, { tag: 'field' });
  for (let i = 0; i < 18; i++) { const fx = -70 + (i * 37) % 140, fz = 38 + (i * 23) % 50; deco(fx, 0.0, fz, 5 + (i % 3) * 3, 0.04, 4 + (i % 4) * 2, i % 2 ? C.dirt : '#4e6230'); }
  // siege camp props outside
  for (let i = -28; i <= 28; i += 8) { const z = 46 + (i % 16 === 0 ? 6 : 0); deco(i, 0, z, 3.2, 2.4, 3.2, C.woodD); deco(i, 2.4, z, 4, 0.5, 4, C.roof); deco(i, 2.9, z, 3, 0.5, 3, C.roof); deco(i, 3.4, z, 0.2, 1.4, 0.2, C.wood); }
  for (let i = -24; i <= 24; i += 6) { deco(i, 0, 40, 0.3, 2.2, 0.3, C.wood); deco(i, 2.2, 40, 1.6, 0.9, 0.08, C.banner); }
  L.checkpoints.push({ x: 26, y: 8.1, z: 28.5, name: 'Wall' });

  // hoist at the west end: moving platform between wall (y=8) and tower ledge (y=14)
  const hoist = world.add(new Box(-24.5, 8, 26, 4, 0.4, 4, { moving: true, tag: 'hoist' }));
  hoist.path = { a: { x: -24.5, y: 8, z: 26 }, b: { x: -24.5, y: 15.6, z: 26 }, period: 9, phase: 0 };
  L.platforms.push(hoist);
  deco(-26.4, 0, 26, 0.25, 17, 0.25, C.wood); deco(-22.6, 0, 26, 0.25, 17, 0.25, C.wood); deco(-24.5, 17, 26, 4.4, 0.3, 0.3, C.wood);
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
    if (i === 16) L.spawns.push({ kind: 'crossbow', x: px, y: y + 0.05, z: pz, perch: true });
    if (i === 10 || i === 20) L.torches.push({ x: px + (T.x - px) * 0.15, y: y + 1.6, z: pz + (T.z - pz) * 0.15 });
  }
  // tower-face crossbow perches
  block(T.x + 4.8, 24, T.z - 4.8, 2, 0.5, 2, C.stone); L.spawns.push({ kind: 'crossbow', x: T.x + 4.8, y: 24.55, z: T.z - 4.8, perch: true });
  // top platform (y = 40.6) — arena + flag
  const topY = y + RISE;
  block(T.x, 0, T.z, 7, topY - 1, 7, C.stoneD);
  block(T.x, topY - 1, T.z, 11, 1, 11, C.stone);
  deco(T.x, topY - 0.02, T.z, 11, 0.02, 11, C.stoneL);
  for (let i = -4; i <= 4; i += 2) { block(T.x + i, topY, T.z + 5.2, 1, 1, 0.6, C.stoneL); block(T.x + i, topY, T.z - 5.2, 1, 1, 0.6, C.stoneL); block(T.x + 5.2, topY, T.z + i, 0.6, 1, 1, C.stoneL); block(T.x - 5.2, topY, T.z + i, 0.6, 1, 1, C.stoneL); }
  L.checkpoints.push({ x: T.x + 3, y: topY + 0.05, z: T.z + 3, name: 'Keep top' });
  L.spawns.push({ kind: 'captain', x: T.x - 2.5, y: topY + 0.05, z: T.z - 2.5, boss: true });
  // flagpole
  deco(T.x, topY, T.z, 0.3, 7, 0.3, C.wood);
  L.goal = { x: T.x, y: topY, z: T.z, r: 2.2 };
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
