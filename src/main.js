import * as THREE from '../vendor/three.module.js';
import { World, overlap } from './physics.js';
import { Player, P, S } from './player.js';
import { Enemy, Bolt, Bomb, E } from './enemies.js';
import { buildLevel, updatePlatforms } from './level.js';
import { ChaseCam } from './camera.js';
import { knightRig, gruntRig, boxesMesh, MAT } from './voxel.js';
import { Audio, Music } from './audio.js';

const FIXED = 1 / 120;

// ---------------- settings (persisted) ----------------
const SETTINGS_DEFAULT = { volume: 0.5, music: 0.35, sens: 1.0, invertY: false, shake: true, fov: 62, shadows: 'soft', pixelRatio: 1, glows: true, particles: 1, grade: 'dusk', reduceMotion: false, dmgNumbers: true };
let SET = { ...SETTINGS_DEFAULT };
try { Object.assign(SET, JSON.parse(localStorage.getItem('rampart_settings') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('rampart_settings', JSON.stringify(SET)); } catch (e) {} }


// ------------------------------------------------------------------ scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * (SET.pixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a1f2e');
scene.fog = new THREE.Fog('#3a2a36', 40, 140);
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 320);

const hemi = new THREE.HemisphereLight('#cfb0ac', '#5f4c36', 2.9); scene.add(hemi);
scene.add(new THREE.AmbientLight('#5a4a5a', 0.5));
const sun = new THREE.DirectionalLight('#ffc890', 2.3);
sun.position.set(-30, 45, 20); sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -32; sun.shadow.camera.right = 32; sun.shadow.camera.top = 32; sun.shadow.camera.bottom = -32;
sun.shadow.camera.near = 5; sun.shadow.camera.far = 140; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
scene.add(sun); scene.add(sun.target);
// sky dome: big inverted box gradient-ish via two planes — keep simple: a large sphere with a vertex-colour gradient
{
  const g = new THREE.SphereGeometry(260, 24, 12);
  const cols = []; const pos = g.attributes.position;
  const top = new THREE.Color('#1d1630'), mid = new THREE.Color('#7a3a3e'), hor = new THREE.Color('#e8884a');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 260; const c = new THREE.Color();
    if (y > 0.12) c.copy(mid).lerp(top, Math.min(1, (y - 0.12) / 0.7)); else c.copy(hor).lerp(mid, Math.max(0, Math.min(1, (y + 0.05) / 0.17)));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
}

// sun disc low on the horizon (north, behind the gate)
{
  const disc = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: '#fff2d8', fog: false, transparent: true, opacity: 0.98 }));
  disc.position.set(40, 10, 240); disc.lookAt(0, 0, 0); scene.add(disc);
  for (const [r, op, col, dz] of [[34, 0.4, '#ffd9a0', 2], [64, 0.22, '#ff9a4a', 4], [110, 0.12, '#e8683a', 6]]) {
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: col, fog: false, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(40, 10, 240 - dz); glow.lookAt(0, 0, 0); scene.add(glow);
  }
  // horizon haze band all around
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(252, 252, 60, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#d88a5a', fog: false, transparent: true, opacity: 0.28, side: THREE.BackSide, depthWrite: false }));
  haze.position.set(0, -18, 30); scene.add(haze);
}
// embers + smoke: two Points clouds
const emberGeo = new THREE.BufferGeometry(); const EMBERS = 260; const emberPos = new Float32Array(EMBERS * 3); const emberVel = [];
const smokeGeo = new THREE.BufferGeometry(); const SMOKE = 160; const smokePos = new Float32Array(SMOKE * 3); const smokeAge = new Float32Array(SMOKE);
const softTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const glowFacers = [];
function addGlow(parent, color, size = 1.4, op = 0.5) { const gq = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: softTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); gq.userData.isGlow = true; parent.add(gq); glowFacers.push(gq); return gq; }

const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: '#ffb24a', size: 0.32, map: softTex, transparent: true, opacity: 0.95, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending }));
const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ color: '#3a2e34', size: 5, map: softTex, transparent: true, opacity: 0.22, sizeAttenuation: true, depthWrite: false }));
scene.add(embers); scene.add(smoke);
// crows circling the keep and the towers; faint stars high up
const CROWS = 14; const crowGeo = new THREE.BufferGeometry(); const crowPos = new Float32Array(CROWS * 3); crowGeo.setAttribute('position', new THREE.BufferAttribute(crowPos, 3));
const crows = new THREE.Points(crowGeo, new THREE.PointsMaterial({ color: '#141018', size: 0.42, sizeAttenuation: true, transparent: true, alphaTest: 0.3 })); scene.add(crows);
crows.material.map = softTex; crows.material.needsUpdate = true;
{ const n = 220; const sp = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = 0.25 + Math.random() * 1.2; sp[i * 3] = Math.cos(a) * Math.cos(e) * 250; sp[i * 3 + 1] = Math.sin(e) * 250; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 250; } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(sp, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff4e0', size: 1.1, transparent: true, opacity: 0.55, fog: false }))); }
// ------------------------------------------------------------------ world
const world = new World();
const L = buildLevel(world);
scene.add(L.mesh); scene.add(L.props);
// torches: emissive flame boxes + a few point lights
const torchLights = [];
for (const t of L.torches) {
  const m = boxesMesh([{ x: 0, y: 0, z: 0, w: 0.22, h: 0.5, d: 0.22, c: '#ffb040' }, { x: 0, y: -0.5, z: 0, w: 0.12, h: 0.6, d: 0.12, c: '#3a2a1a' }], { material: new THREE.MeshBasicMaterial({ vertexColors: true }), shadow: false });
  m.position.set(t.x, t.y, t.z); scene.add(m);
  const pl = new THREE.PointLight('#ff9a3a', 0, 12, 2); pl.position.set(t.x, t.y + 0.3, t.z); scene.add(pl);
  torchLights.push({ light: pl, mesh: m, base: 18 + Math.random() * 6, seed: Math.random() * 10 });
}
// seed ember/smoke positions now that torches exist
for (let i = 0; i < EMBERS; i++) { const t = L.torches[i % L.torches.length]; emberPos[i * 3] = t.x + (Math.random() - 0.5); emberPos[i * 3 + 1] = t.y + Math.random() * 3; emberPos[i * 3 + 2] = t.z + (Math.random() - 0.5); emberVel.push({ t, life: Math.random() * 3 }); }
emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
const smokeSrc = [{ x: 2, y: -23, z: -80 }, { x: -25.5, y: 3.6, z: 20 }, { x: -27, y: 2.2, z: 21 }, { x: -12, y: 2, z: 0 }, { x: 12, y: 2, z: 0 }];
for (let i = 0; i < SMOKE; i++) { const sdx = smokeSrc[i % smokeSrc.length]; smokePos[i * 3] = sdx.x; smokePos[i * 3 + 1] = sdx.y + Math.random() * 12; smokePos[i * 3 + 2] = sdx.z; smokeAge[i] = Math.random() * 8; }
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
// ambient life: butterflies in the meadow, leaves near oaks, campfire flames, a waterfall
const FLUT = 10; const flutGeo = new THREE.BufferGeometry(); const flutPos = new Float32Array(FLUT * 3); flutGeo.setAttribute('position', new THREE.BufferAttribute(flutPos, 3));
const flutter = new THREE.Points(flutGeo, new THREE.PointsMaterial({ color: '#e8d060', size: 0.22, map: softTex, transparent: true, depthWrite: false })); scene.add(flutter);
const LEAF = 16; const leafGeo = new THREE.BufferGeometry(); const leafPos = new Float32Array(LEAF * 3); const leafSeed = new Float32Array(LEAF); for (let i = 0; i < LEAF; i++) leafSeed[i] = Math.random() * 100;
leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({ color: '#7a9a4a', size: 0.18, map: softTex, transparent: true, depthWrite: false })); scene.add(leaves);
const fireGlow = addGlow(scene, '#ff9a3a', 5, 0.0); fireGlow.position.set(2, -22.6, -80);
const flameMesh = boxesMesh([{ x: 0, y: 0.35, z: 0, w: 0.5, h: 0.7, d: 0.5, c: '#ffb040' }, { x: 0, y: 0.8, z: 0, w: 0.26, h: 0.4, d: 0.26, c: '#ffe08a' }], { shadow: false, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }) });
flameMesh.position.set(2, -23.55, -80); scene.add(flameMesh);
// waterfall: thin animated sheet where the west-bank stream would spill into the gully
const fallMat = new THREE.MeshBasicMaterial({ color: '#8fc0da', transparent: true, opacity: 0.5, depthWrite: false });
const fall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.6), fallMat); fall.position.set(-10.1, -32.6, -114); fall.rotation.y = Math.PI / 2; scene.add(fall);
const fallFoam = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), new THREE.MeshBasicMaterial({ color: '#dceef8', transparent: true, opacity: 0.55, depthWrite: false }));
fallFoam.rotation.x = -Math.PI / 2; fallFoam.position.set(-10.8, -34.68, -114); scene.add(fallFoam);
function updateAtmos(dt) {
  const t = game.time;
  for (let i = 0; i < CROWS; i++) { const k = i * 3; const c = i < 8 ? { x: L.tower.x, y: L.topY + 6, z: L.tower.z, r: 9 } : { x: (i % 2 ? 30 : -30), y: 15, z: 32, r: 6 }; const a = t * (0.35 + (i % 3) * 0.1) + i * 1.3; crowPos[k] = c.x + Math.cos(a) * (c.r + (i % 4)); crowPos[k + 1] = c.y + Math.sin(t * 0.9 + i) * 1.5 + (i % 3); crowPos[k + 2] = c.z + Math.sin(a) * (c.r + (i % 4)); }
  crowGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < FLUT; i++) { const k = i * 3; const a = t * (0.5 + (i % 4) * 0.13) + i * 2.1; flutPos[k] = -10 + Math.cos(a) * (10 + (i % 5) * 3) + Math.sin(t * 1.7 + i) * 2; flutPos[k + 1] = -29 + Math.sin(t * 2.2 + i * 1.3) * 0.8 + (i % 3) * 0.4; flutPos[k + 2] = -138 + Math.sin(a * 0.8) * 10; }
  flutGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < LEAF; i++) { const k = i * 3; const cyc = ((t * 0.24 + leafSeed[i]) % 6) / 6; const tree = L.trees[i % L.trees.length]; leafPos[k] = tree.x + Math.sin(t * 1.1 + leafSeed[i]) * 1.4; leafPos[k + 1] = tree.y + 3.2 - cyc * 3.4; leafPos[k + 2] = tree.z + Math.cos(t * 0.9 + leafSeed[i]) * 1.4; }
  leafGeo.attributes.position.needsUpdate = true;
  flameMesh.scale.set(1 + Math.sin(t * 13) * 0.15, 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(t * 9.7)), 1 + Math.cos(t * 11) * 0.15); flameMesh.rotation.y = t * 2;
  fireGlow.material.opacity = 0.35 + 0.12 * Math.sin(t * 10.3); fireGlow.lookAt(camera.position);
  fallMat.opacity = 0.42 + 0.12 * (0.5 + 0.5 * Math.sin(t * 6.1)); fall.position.y = -32.6 + Math.sin(t * 12) * 0.05;
  for (let i = 0; i < EMBERS; i++) { const e = emberVel[i]; e.life -= dt; const k = i * 3; emberPos[k + 1] += dt * (0.8 + (i % 5) * 0.2); emberPos[k] += Math.sin(t * 2 + i) * dt * 0.4; emberPos[k + 2] += Math.cos(t * 1.7 + i * 0.3) * dt * 0.4; if (e.life <= 0) { e.life = 1.5 + Math.random() * 2.5; emberPos[k] = e.t.x + (Math.random() - 0.5) * 0.4; emberPos[k + 1] = e.t.y; emberPos[k + 2] = e.t.z + (Math.random() - 0.5) * 0.4; } }
  emberGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < SMOKE; i++) { const k = i * 3; smokeAge[i] += dt; smokePos[k + 1] += dt * 1.4; smokePos[k] += dt * (0.6 + Math.sin(t * 0.5 + i) * 0.3); if (smokeAge[i] > 9) { const sdx = smokeSrc[i % smokeSrc.length]; smokeAge[i] = 0; smokePos[k] = sdx.x; smokePos[k + 1] = sdx.y; smokePos[k + 2] = sdx.z; } }
  smokeGeo.attributes.position.needsUpdate = true;
}
// goal beacon: a tall additive light shaft over the banner, pulsing
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 3.2, 90, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd080', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
const beaconCore = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 90, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#fff2cc', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
beaconCore.position.set(L.beacon.x, L.beacon.y + 43, L.beacon.z); scene.add(beaconCore);
beacon.position.set(L.beacon.x, L.beacon.y + 43, L.beacon.z); scene.add(beacon);
const beaconLight = new THREE.PointLight('#ffd080', 40, 30, 2); beaconLight.position.set(L.beacon.x, L.beacon.y, L.beacon.z); scene.add(beaconLight);
// THE CASTLE IS IN THE SKY: cloud decks far below, nothing else. Falling reads as falling.
const cloudTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); for (let i = 0; i < 46; i++) { const x = Math.random() * 256, y = 100 + Math.random() * 80, r = 22 + Math.random() * 42; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,236,225,0.65)'); gr.addColorStop(1, 'rgba(255,236,225,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
const cloudDecks = [];
for (const [cy, sc, op] of [[-58, 3, 0.95], [-74, 5, 0.8], [-94, 8, 0.7]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: op, depthWrite: false, color: '#ffd9c4' }));
  m.material.map = cloudTex.clone(); m.material.map.repeat.set(sc, sc); m.rotation.x = -Math.PI / 2; m.position.set(0, cy, 30); scene.add(m); cloudDecks.push(m);
}
const cloudFloor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: '#e8a488', transparent: true, opacity: 0.9, depthWrite: false }));
cloudFloor.rotation.x = -Math.PI / 2; cloudFloor.position.set(0, -104, 30); scene.add(cloudFloor);
// distant floating islands for scale
for (const [ix, iy, iz, iw] of [[-160, -20, 120, 26], [170, -30, 40, 34], [100, -14, 190, 20], [-150, -40, -80, 30]]) {
  const isl = boxesMesh([{ x: 0, y: 0, z: 0, w: iw, h: 6, d: iw * 0.8, c: '#5a5048' }, { x: 0, y: 3.6, z: 0, w: iw * 0.9, h: 1.2, d: iw * 0.72, c: '#6a7a4a' }, { x: iw * 0.15, y: 5.4, z: 0, w: iw * 0.2, h: 2.4, d: iw * 0.2, c: '#7d7a72' }], { shadow: false });
  isl.position.set(ix, iy, iz); scene.add(isl);
}
// (the vale's gate stands open)
// THE FOUR CRESTS (mission rewards) + 8 red pennants + hearts
const CRESTS = [
  { key: 'captain', name: 'FELL THE SIEGE CAPTAIN', hint: 'the keep top' },
  { key: 'race', name: 'RACE THE SQUIRE', hint: 'the meadow' },
  { key: 'pennants', name: 'EIGHT RED PENNANTS', hint: 'all over the vale' },
  { key: 'peaks', name: 'CREST OF THE PEAKS', hint: 'the spires past the watchtower' },
  { key: 'camp', name: 'BREAK THE SIEGE CAMP', hint: 'hold the camp against three waves' },
  { key: 'grotto', name: 'THE GROTTO BELOW', hint: 'beneath the west bank of the gully' },
  { key: 'shards', name: 'THIRTY SKY SHARDS', hint: 'glittering along the whole road' },
  { key: 'shadow', name: 'THE KEEP\'S SHADOW', hint: 'below the arena\'s south rim' },
];
const crestMesh = () => { const m = boxesMesh([{ x: 0, y: 0, z: 0, w: 0.8, h: 1.0, d: 0.14, c: '#e3c070' }, { x: 0, y: 0.08, z: 0.09, w: 0.32, h: 0.5, d: 0.03, c: '#8a2d2d' }, { x: 0, y: -0.58, z: 0, w: 0.5, h: 0.22, d: 0.14, c: '#e3c070' }, { x: 0, y: 0.62, z: 0, w: 0.5, h: 0.16, d: 0.14, c: '#e3c070' }], { shadow: false }); return m; };
const crestSpawns = {};   // key -> {m, c} once the crest is physically in the world
function spawnCrest(key, x, y, z) { if (crestSpawns[key] || (game.crestsGot || {})[key]) return; const m = crestMesh(); m.position.set(x, y + 1.0, z); scene.add(m); addGlow(m, '#ffd27a', 2.6, 0.55); crestSpawns[key] = { m, c: { x, y, z } }; spawnFx('parry', { x, y: y + 1, z }, 16); audio.play('checkpoint'); }
const shardMeshes = [];
for (const c of L.shards) { const m = boxesMesh([{ x: 0, y: 0, z: 0, w: 0.26, h: 0.5, d: 0.26, c: '#7ad0e8' }, { x: 0, y: 0.32, z: 0, w: 0.14, h: 0.16, d: 0.14, c: '#b8ecf8' }], { shadow: false, material: new THREE.MeshBasicMaterial({ vertexColors: true }) }); m.position.set(c.x, c.y + 0.6, c.z); scene.add(m); addGlow(m, '#7ad0e8', 1.3, 0.45); shardMeshes.push({ m, c, got: false }); }
const pennantMeshes = [];
for (const c of L.pennants) { const m = boxesMesh([{ x: 0, y: 0.55, z: 0, w: 0.08, h: 1.6, d: 0.08, c: '#4a3119' }, { x: 0.34, y: 1.05, z: 0, w: 0.6, h: 0.44, d: 0.05, c: '#c03434' }], { shadow: false }); m.position.set(c.x, c.y, c.z); scene.add(m); addGlow(m, '#ff6a4a', 1.2, 0.35).position.y = 1.0; pennantMeshes.push({ m, c, got: false }); }
const heartMeshes = [];
for (const c of L.hearts) { const m = boxesMesh([{ x: -0.11, y: 0.08, z: 0, w: 0.22, h: 0.22, d: 0.12, c: '#d23a3a' }, { x: 0.11, y: 0.08, z: 0, w: 0.22, h: 0.22, d: 0.12, c: '#d23a3a' }, { x: 0, y: -0.1, z: 0, w: 0.3, h: 0.2, d: 0.12, c: '#d23a3a' }], { shadow: false }); m.position.set(c.x, c.y + 0.7, c.z); scene.add(m); addGlow(m, '#ff5a5a', 1.1, 0.35); heartMeshes.push({ m, c, cd: 0 }); }
function updatePickups(dt) {
  for (const key in crestSpawns) {
    const cr = crestSpawns[key]; if (!cr) continue;
    cr.m.rotation.y += dt * 1.6; cr.m.position.y = cr.c.y + 1.0 + Math.sin(game.time * 2) * 0.14;
    if (Math.hypot(cr.c.x - player.pos.x, cr.c.z - player.pos.z) < 1.6 && Math.abs(cr.c.y + 0.8 - player.pos.y) < 2.2) {
      scene.remove(cr.m); crestSpawns[key] = null;
      game.crestsGot = game.crestsGot || {}; game.crestsGot[key] = true; game.crests = Object.keys(game.crestsGot).length;
      crestGet(key); saveGame();
    }
  }
  for (const sh of shardMeshes) { if (sh.got) continue; sh.m.rotation.y += dt * 3; sh.m.position.y = sh.c.y + 0.6 + Math.sin(game.time * 2.6 + sh.c.x) * 0.1; if (Math.hypot(sh.c.x - player.pos.x, sh.c.z - player.pos.z) < 1.3 && Math.abs(sh.c.y + 0.6 - player.pos.y) < 2) { sh.got = true; sh.m.visible = false; game.shards = (game.shards || 0) + 1; audio.play('ui'); if (game.shards % 5 === 0) saveGame(); spawnFx('parry', { x: sh.c.x, y: sh.c.y + 0.6, z: sh.c.z }, 5); if (game.shards >= 30 && !(game.crestsGot || {}).shards) { game.crestsGot = game.crestsGot || {}; game.crestsGot.shards = true; game.crests = Object.keys(game.crestsGot).length; crestGet('shards'); } } }
  for (const pn of pennantMeshes) { if (pn.got) continue; pn.m.rotation.y += dt * 2.4; if (Math.hypot(pn.c.x - player.pos.x, pn.c.z - player.pos.z) < 1.3 && Math.abs(pn.c.y + 0.8 - player.pos.y) < 2) { pn.got = true; pn.m.visible = false; game.pennants = (game.pennants || 0) + 1; audio.play('ui'); spawnFx('hit', { x: pn.c.x, y: pn.c.y + 1, z: pn.c.z }, 10); toast('Pennant ' + game.pennants + ' of 8', 1.6); saveGame(); if (game.pennants >= 8) { spawnCrest('pennants', L.shrine.x, L.shrine.y, L.shrine.z); toast('The shrine kindles ' + '\u2014' + ' a crest rises in the meadow', 4); } } }
  for (const h of heartMeshes) { h.cd = Math.max(0, h.cd - dt); h.m.visible = h.cd <= 0; if (h.cd <= 0) { h.m.rotation.y += dt * 2.4; if (player.hp < P.hp && Math.hypot(h.c.x - player.pos.x, h.c.z - player.pos.z) < 1.2 && Math.abs(h.c.y + 0.6 - player.pos.y) < 1.6) { h.cd = 30; player.hp = Math.min(P.hp, player.hp + 1); audio.play('checkpoint'); spawnFx('hurt', { x: h.c.x, y: h.c.y + 0.8, z: h.c.z }, 8); } } }
  document.getElementById('crests').textContent = '\u2726 ' + (game.crests || 0) + '/8';
  document.getElementById('pennantsHud').textContent = '\u25b8 ' + (game.pennants || 0) + '/8';
  document.getElementById('shardsHud').textContent = '\u2b26 ' + (game.shards || 0) + '/30';
}
// hall banners: one kindles per crest earned
const hallBannerMeshes = [];
for (const hb of L.hallBanners) { const m = boxesMesh([{ x: 0, y: 0, z: 0, w: 1.3, h: 2.6, d: 0.08, c: '#4e2a30' }, { x: 0, y: 0.2, z: 0.05, w: 0.5, h: 0.6, d: 0.02, c: '#3a2226' }, { x: 0, y: -1.15, z: 0, w: 1.3, h: 0.3, d: 0.09, c: '#5a4630' }], { shadow: false }); m.position.set(hb.x, hb.y, hb.z + hb.face * 0.35); scene.add(m); hallBannerMeshes.push({ m, hb, lit: false }); }
function refreshHallBanners() {
  const n = game.crests || 0;
  for (let i = 0; i < hallBannerMeshes.length; i++) { const b = hallBannerMeshes[i]; if (i < n && !b.lit) { b.lit = true; scene.remove(b.m); const m = boxesMesh([{ x: 0, y: 0, z: 0, w: 1.3, h: 2.6, d: 0.08, c: '#8a2d2d' }, { x: 0, y: 0.2, z: 0.06 * b.hb.face, w: 0.55, h: 0.7, d: 0.03, c: '#e3c070' }, { x: 0, y: -1.15, z: 0, w: 1.3, h: 0.3, d: 0.09, c: '#c9a24a' }], { shadow: false }); m.position.set(b.hb.x, b.hb.y, b.hb.z + b.hb.face * 0.35); scene.add(m); b.m = m; } }
}
// THE SQUIRE: the race rival waiting in the meadow
const squireRig = gruntRig('defender'); scene.add(squireRig);
squireRig.position.set(L.race.start.x, L.race.start.y, L.race.start.z);
const raceState = { state: 'idle', wp: 0, t: 0, pos: { ...L.race.start }, speed: 6.9, countdown: 0 };
function startRace() {
  raceState.state = 'countdown'; raceState.countdown = 3.2; raceState.wp = 0; raceState.pos = { ...L.race.start };
  toast('Race to the watchtower flag!', 2);
}
function updateRace(dt) {
  const rs = raceState;
  if (rs.state === 'countdown') {
    const prev = Math.ceil(rs.countdown); rs.countdown -= dt; const now = Math.ceil(rs.countdown);
    if (now !== prev && now > 0) { toast(String(now), 0.8); audio.play('ui'); }
    if (rs.countdown <= 0) { rs.state = 'running'; toast('GO!', 1); audio.play('checkpoint'); }
  } else if (rs.state === 'running') {
    const wps = L.raceWaypoints; const target = wps[Math.min(rs.wp + 1, wps.length - 1)];
    const dx = target.x - rs.pos.x, dy = target.y - rs.pos.y, dz = target.z - rs.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) { rs.wp++; if (rs.wp >= wps.length - 1) { rs.state = 'idle'; if (!(game.crestsGot || {}).race) { toast('The Squire wins. Speak to him to race again.', 3.5); } squireRig.position.set(L.race.start.x, L.race.start.y, L.race.start.z); return; } }
    else { rs.pos.x += dx / d * rs.speed * dt; rs.pos.z += dz / d * rs.speed * dt; rs.pos.y += (target.y - rs.pos.y) * Math.min(1, 6 * dt) + Math.abs(Math.sin(game.time * 9)) * 0; }
    squireRig.position.set(rs.pos.x, rs.pos.y + Math.abs(Math.sin(game.time * 10)) * 0.12, rs.pos.z);
    squireRig.rotation.y = Math.atan2(dx, dz);
    const u = squireRig.userData; const swing = Math.sin(game.time * 11) * 0.85; u.legL.rotation.x = swing; u.legR.rotation.x = -swing; u.armR.rotation.x = -swing * 0.6; u.armL.rotation.x = swing * 0.6;
    // player reaches the flag first?
    if (Math.hypot(L.raceFinish.x - player.pos.x, L.raceFinish.z - player.pos.z) < L.raceFinish.r && Math.abs(player.pos.y - L.raceFinish.y) < 2.5) {
      rs.state = 'idle'; squireRig.position.set(L.race.start.x, L.race.start.y, L.race.start.z);
      toast('You beat the Squire to the flag!', 3); spawnCrest('race', L.raceFinish.x + 1.5, L.raceFinish.y, L.raceFinish.z);
    }
  } else {
    // idle at the start, bouncing on his heels
    squireRig.position.set(L.race.start.x, L.race.start.y + Math.abs(Math.sin(game.time * 3)) * 0.06, L.race.start.z);
    squireRig.rotation.y = Math.atan2(player.pos.x - L.race.start.x, player.pos.z - L.race.start.z);
    const u = squireRig.userData; u.legL.rotation.x = 0; u.legR.rotation.x = 0;
  }
}
// gully water: two offset translucent planes shimmering
let waterMeshes = [];
if (L.water) {
  const wm = new THREE.Mesh(new THREE.PlaneGeometry(L.water.w, L.water.d), new THREE.MeshBasicMaterial({ color: '#4a7290', transparent: true, opacity: 0.55, depthWrite: false }));
  wm.rotation.x = -Math.PI / 2; wm.position.set(L.water.x, L.water.y, L.water.z); scene.add(wm);
  const wm2 = new THREE.Mesh(new THREE.PlaneGeometry(L.water.w, L.water.d), new THREE.MeshBasicMaterial({ color: '#6a92b0', transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  wm2.rotation.x = -Math.PI / 2; wm2.position.set(L.water.x, L.water.y + 0.06, L.water.z); scene.add(wm2);
  waterMeshes = [wm, wm2];
}
// torch glow sprites: warm additive quads at every torch
const torchGlows = [];
const glowMat = new THREE.MeshBasicMaterial({ map: softTex, color: '#ff9a3a', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
for (const t of L.torches) { const gq = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), glowMat.clone()); gq.position.set(t.x, t.y + 0.2, t.z); gq.userData.billboard = true; gq.userData.seed = Math.random() * 10; scene.add(gq); torchGlows.push(gq); }
// storm rain over the arena (hidden until the boss rages)
const RAIN = 260; const rainGeo = new THREE.BufferGeometry(); { const rp = new Float32Array(RAIN * 3); for (let i = 0; i < RAIN; i++) { rp[i * 3] = L.tower.x + (Math.random() - 0.5) * 26; rp[i * 3 + 1] = L.topY + Math.random() * 22; rp[i * 3 + 2] = L.tower.z + (Math.random() - 0.5) * 26; } rainGeo.setAttribute('position', new THREE.BufferAttribute(rp, 3)); }
const stormRain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: '#9ab4d0', size: 0.16, transparent: true, opacity: 0.5, depthWrite: false }));
stormRain.visible = false; scene.add(stormRain);
// landing ring under player (iso-readability lesson: elevation needs a shadow anchor)
const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.6, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; scene.add(ring);
// danger ring under whoever holds the attack token (telegraph on the floor, hue channel: amber → white)
const dangerRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 28), new THREE.MeshBasicMaterial({ color: '#ff9a2a', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
dangerRing.rotation.x = -Math.PI / 2; scene.add(dangerRing);
// floating combat text
const floatPool = [];
function floatText(pos, text, cls = '') {
  if (!SET.dmgNumbers && (cls === '' || cls === 'hurt' || cls === 'big')) return;
  let f = floatPool.find(x => !x.alive);
  if (!f) { f = { el: document.createElement('div'), alive: false }; f.el.className = 'ftext'; document.body.appendChild(f.el); floatPool.push(f); }
  f.alive = true; f.t = 0; f.pos = { x: pos.x, y: pos.y, z: pos.z }; f.el.textContent = text; f.el.className = 'ftext ' + cls; f.el.style.display = 'block';
}
function updateFloatText(dt) {
  for (const f of floatPool) {
    if (!f.alive) continue; f.t += dt; if (f.t > 0.9) { f.alive = false; f.el.style.display = 'none'; continue; }
    const v = new THREE.Vector3(f.pos.x, f.pos.y + f.t * 1.4, f.pos.z).project(camera);
    if (v.z > 1) { f.el.style.display = 'none'; continue; } f.el.style.display = 'block';
    f.el.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; f.el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; f.el.style.opacity = f.t < 0.6 ? 1 : (0.9 - f.t) / 0.3;
  }
}

// ------------------------------------------------------------------ game
const audio = new Audio(); const music = new Music(audio);
const game = {
  world, L, player: null, enemies: [], bolts: [], fxList: [], time: 0, hitstop: 0,
  attackToken: null, checkpoint: 0, won: false, paused: false, deaths: 0, started: false, slowmo: 0, vignette: 0, flash: 0,
  // --- callbacks used by player/enemies
  playerHit(box, opts) {
    let any = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (!overlap(box, e.body.aabb)) continue;
      const r = e.takeHit(box.dmg, this.player.pos, { ...opts, kind: box.kind });
      if (r === 'dup') continue;
      any = true;
      const hp = { x: e.pos.x, y: e.pos.y + 1.1, z: e.pos.z };
      if (r === 'guard') { this.fx('clank', hp); audio.play('clank'); floatText(hp, 'GUARDED', 'dim'); this.player.body.vel.x *= -0.3; this.player.body.vel.z *= -0.3; }
      else if (r === 'guardbreak') { this.fx('break', hp); audio.play('break'); floatText(hp, 'GUARD BREAK', 'big'); cam.shake = 0.6; this.hitstop = 0.07; }
      else {
        spawnFx('hit', hp, box.kind === 'heavy' ? 18 : 10, this.player.fwd()); audio.play(box.kind === 'heavy' ? 'heavyhit' : 'hit');
        this.hitstop = box.kind === 'heavy' ? 0.09 : (box.kind === 'light' && this.player.combo === 2 ? 0.07 : 0.045);
        cam.shake = Math.max(cam.shake, box.kind === 'heavy' ? 0.55 : 0.22); cam.punch = box.kind === 'heavy' ? 0.5 : 0.25;
        e.hitFlash = 0.1; this.player.stats.hitsLanded++; rumble(0.25, 0.5, 90); floatText(hp, String(box.dmg), box.kind === 'heavy' ? 'big' : '');
        if (r === 'dead') { e.body.vel.x = -(this.player.pos.x - e.pos.x) * 3; e.body.vel.z = -(this.player.pos.z - e.pos.z) * 3; e.body.vel.y = 6; }
        if (r === 'dead') { this.slowmo = 0.28; cam.shake = Math.max(cam.shake, 0.5); this.fx('die', hp); }
      }
    }
    // barricades: only bash / heavy / pound break them
    for (const bx of (this.L.barricades || [])) {
      if (!bx.enabled || !overlap(box, bx)) continue;
      const hp = { x: bx.cx, y: bx.min.y + 1.2, z: bx.cz };
      if (box.kind === 'light') { this.fx('clank', hp); audio.play('clank'); toast('Too sturdy — shield bash (F) or a heavy', 2); this.player.body.vel.x *= -0.3; this.player.body.vel.z *= -0.3; }
      else { this.breakBarricade(bx); }
      any = true;
    }
    // attacks also kick ladders
    for (const ld of this.L.ladders) {
      if (!ld.up) continue;
      const top = { x: ld.x, y: ld.top, z: ld.z - 0.8 };
      if (top.x > box.min.x && top.x < box.max.x && top.z > box.min.z - 0.6 && top.z < box.max.z + 0.6 && Math.abs(this.player.pos.y - ld.top) < 2) this.kickLadder(ld);
    }
    return any;
  },
  breakBarricade(bx) { bx.enabled = false; if (bx.mesh) { bx.mesh.visible = false; } for (let i = 0; i < 3; i++) this.fx('die', { x: bx.cx + (Math.random() - 0.5) * bx.w, y: bx.min.y + 0.5 + i * 0.6, z: bx.cz + (Math.random() - 0.5) * bx.d }); audio.play('break'); cam.shake = 0.6; this.hitstop = 0.06; toast('Barricade smashed', 1.6); },
  enemySlam(e, radius, dmg) {
    const p = this.player; cam.shake = 1.0; audio.play('pound'); this.fx('shock', { x: e.pos.x, y: e.pos.y + 0.1, z: e.pos.z });
    for (let k = 0; k < 16; k++) this.fx('dust', { x: e.pos.x + Math.cos(k / 16 * 6.28) * radius * 0.8, y: e.pos.y + 0.1, z: e.pos.z + Math.sin(k / 16 * 6.28) * radius * 0.8 });
    const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    // a slam is a floor wave: airborne players are safe
    if (!p.dead && d < radius && p.body.grounded) { const r = p.takeHit(dmg, e.pos, { kb: 12, up: 8, unblockable: true }); if (r === 'hit') { this.fx('hurt', { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z }); audio.play('hurt'); this.vignette = 1; this.hitstop = 0.08; } }
    if (e.phase === 2) this.crumbleCrenel();
  },
  crumbleCrenel() {
    const cands = this.L.arenaCrenels.filter(b => b.enabled);
    if (!cands.length) return; const b = cands[Math.floor(Math.random() * cands.length)]; b.enabled = false; if (b.crumbleMesh) b.crumbleMesh.visible = false;
    for (let i = 0; i < 2; i++) this.fx('die', { x: b.cx, y: b.min.y + 0.5, z: b.cz });
  },
  onBop(e) { this.hitstop = 0.05; cam.shake = Math.max(cam.shake, 0.25); this.fx('hit', { x: e.pos.x, y: e.pos.y + e.body.h, z: e.pos.z }); },
  onBossPhase3(e) {
    toast('The Captain rages \u2014 the storm breaks!', 3.5); audio.play('roar'); cam.shake = 1.1; this.slowmo = 0.5;
    this.storm = 1;   // full storm
  },
  onBossPhase(e) {
    toast('The Captain braces. Break him from above — or with a heavy.', 4); audio.play('break'); cam.shake = 0.9; this.slowmo = 0.4;
    this.storm = 0.5;   // clouds gather
    const T = this.L.tower; const yy = this.L.topY + 0.05;
    for (const [ox, oz] of [[4.3, 0], [-4.3, 0]]) { const s = new Enemy('swarm', this.world, this, T.x + ox, yy, T.z + oz, {}); s.aggroed = true; s.state = 'chase'; attachRig(s); this.enemies.push(s); this.fx('shock', { x: T.x + ox, y: yy, z: T.z + oz }); }
  },
  playerPound(pos, radius, dmg) {
    cam.shake = 0.8; audio.play('pound');
    this.fx('shock', { x: pos.x, y: pos.y + 0.1, z: pos.z });
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < radius && Math.abs(e.pos.y - pos.y) < 1.5) { e.takeHit(dmg, pos, { kb: 9, up: 7, breaksGuard: true, fromAbove: true, kind: 'pound' }); this.fx('hit', { x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }); }
    }
    for (const ld of this.L.ladders) if (ld.up && Math.hypot(ld.x - pos.x, ld.z - 0.8 - pos.z) < radius + 0.5 && Math.abs(pos.y - ld.top) < 2) this.kickLadder(ld);
    for (const bx of (this.L.barricades || [])) if (bx.enabled && Math.hypot(bx.cx - pos.x, bx.cz - pos.z) < radius + 1 && Math.abs(pos.y - bx.min.y) < 2) this.breakBarricade(bx);
    this.hitstop = 0.06;
  },
  enemyHit(e, box, dmg, opts) {
    const p = this.player;
    if (p.dead || !overlap(box, p.body.aabb)) return;
    const r = p.takeHit(dmg, e.pos, opts);
    const hp = { x: p.pos.x, y: p.pos.y + 1.1, z: p.pos.z };
    if (r === 'hit') { this.fx('hurt', hp); audio.play('hurt'); cam.shake = 0.7; this.hitstop = 0.06; this.vignette = 1; floatText(hp, '-' + dmg, 'hurt'); rumble(0.7, 0.4, 220); const hpEl = document.getElementById('hp'); hpEl.classList.remove('shake'); void hpEl.offsetWidth; hpEl.classList.add('shake'); }
    else if (r === 'blocked') { this.fx('clank', hp); audio.play('clank'); cam.shake = 0.2; floatText(hp, 'BLOCKED', 'dim'); }
    else if (r === 'parried') {
      this.fx('parry', hp); audio.play('parry'); cam.shake = 0.4; this.hitstop = 0.14; this.flash = 0.6; this.slowmo = 0.2; floatText(hp, 'PARRY', 'big gold');
      e.stun = 1.4; e.guardUp = false; e.state = 'flinch'; e.t = 0; e.telegraph = 0; this.releaseAttackToken(e);
      e.body.vel.x = (e.pos.x - p.pos.x) * 3; e.body.vel.z = (e.pos.z - p.pos.z) * 3;
    }
  },
  lobBomb(e, player) {
    const src = { x: e.pos.x, y: e.pos.y + 1.5, z: e.pos.z };
    const dx = player.pos.x - src.x, dz = player.pos.z - src.z; const d = Math.hypot(dx, dz) || 1;
    const t = Math.max(0.8, Math.min(1.6, d / 10));
    const vy = (player.pos.y + 0.5 - src.y + 0.5 * 22 * t * t) / t;
    this.bolts.push(Object.assign(new Bomb(src.x, src.y, src.z, dx / d * (d / t), vy, dz / d * (d / t), e), { isBomb: true }));
    audio.play('bolt');
  },
  explode(pos, radius, dmg, owner) {
    cam.shake = Math.max(cam.shake, 0.7); audio.play('pound'); this.fx('shock', { x: pos.x, y: pos.y, z: pos.z }); spawnFx('hit', { x: pos.x, y: pos.y + 0.5, z: pos.z }, 16);
    const p = this.player;
    if (!p.dead && Math.hypot(p.pos.x - pos.x, (p.pos.y + 0.8 - pos.y) * 0.7, p.pos.z - pos.z) < radius) { const r = p.takeHit(dmg, pos, { kb: 10, up: 6, unblockable: false }); if (r === 'hit') { this.vignette = 1; audio.play('hurt'); } }
    for (const e of this.enemies) { if (e.dead || e.cfg.friendly || e === owner) continue; if (Math.hypot(e.pos.x - pos.x, (e.pos.y + 0.8 - pos.y) * 0.7, e.pos.z - pos.z) < radius) e.takeHit(2, pos, { kb: 8, up: 5, breaksGuard: true }); }
  },
  fireBolt(e, player) {
    const src = { x: e.pos.x, y: e.pos.y + 1.3, z: e.pos.z };
    const tgt = { x: player.pos.x, y: player.pos.y + 0.9, z: player.pos.z };
    const d = { x: tgt.x - src.x, y: tgt.y - src.y, z: tgt.z - src.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1; const sp = e.cfg.boltSpeed || E.crossbow.boltSpeed;
    const t = len / sp;
    this.bolts.push(new Bolt(src.x, src.y, src.z, d.x / len * sp, d.y / len * sp + 3 * t, d.z / len * sp, e));
    audio.play('bolt');
  },
  hasLineOfSight(e, player) {
    const o = { x: e.pos.x, y: e.pos.y + 1.3, z: e.pos.z };
    const d = { x: player.pos.x - o.x, y: player.pos.y + 0.9 - o.y, z: player.pos.z - o.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    const h = this.world.raycast(o, { x: d.x / len, y: d.y / len, z: d.z / len }, len - 0.3, b => !b.oneWay && b.tag !== 'field');
    return !h;
  },
  requestAttackToken(e) {
    if (e.kind === 'crossbow' || e.cfg.bow) return true;
    if (this.attackToken && !this.attackToken.dead && this.attackToken !== e && (this.attackToken.state === 'windup' || this.attackToken.state === 'swing')) return false;
    this.attackToken = e; return true;
  },
  releaseAttackToken(e) { if (this.attackToken === e) this.attackToken = null; },
  onEnemyDied(e) {
    this.player.kills++;
    if (e.kind === 'captain') { this.bossDead = true; this.storm = 0; this.deathCine = 3.2; this.deathCineTarget = e; this.slowmo = 1.4; cam.shake = 1.2; this.flash = 0.8; audio.play('bossdie'); for (let k = 0; k < 4; k++) spawnFx('die', { x: e.pos.x, y: e.pos.y + 1 + k * 0.4, z: e.pos.z }, 14); for (let k = 0; k < 2; k++) spawnFx('parry', { x: e.pos.x, y: e.pos.y + 1.4, z: e.pos.z }, 20); setTimeout(() => { toast('The Siege Captain falls.', 3); spawnCrest('captain', L.goal.x + 1.5, L.goal.y, L.goal.z); }, 1200); }
    if (this.player.lockTarget === e) { this.player.lockTarget = null; cam.lock = null; }
  },
  playerFell() { if (this.falling) return; this.falling = 0.9; audio.play('fall'); document.getElementById('fell').classList.add('show'); },
  fx(kind, pos) { spawnFx(kind, pos); },
  kickLadder(ld) { ld.up = false; ld.respawn = 14; ld.fallT = 0; audio.play('ladder'); toast('Ladder kicked!'); this.fx('shock', { x: ld.x, y: ld.top, z: ld.z }); },
  respawn(died) {
    const p = this.player;
    if (died) { this.deaths++; p.hp = P.hp; }
    const cp = this.L.checkpoints[this.checkpoint];
    p.body.pos.x = cp.x; p.body.pos.y = cp.y; p.body.pos.z = cp.z; p.body.vel.x = p.body.vel.y = p.body.vel.z = 0; p.body.syncAabb();
    p.state = S.IDLE; p.t = 0; p.iframes = 1.0; p.lockTarget = null; cam.lock = null; game.deathT = 0; game.deadShown = false;
    cam.target.set(cp.x, cp.y + 1.2, cp.z); cam.yaw = Math.PI; cam.idle = 0;
    if (died) { this.bolts.length = 0; for (const e of this.enemies) if (!e.dead && e.aggroed && e.kind !== 'crossbow') { e.state = 'idle'; e.aggroed = false; e.stun = 0; e.hp = e.maxHp; e.body.pos.x = e.home.x; e.body.pos.y = e.home.y; e.body.pos.z = e.home.z; e.body.syncAabb(); if (e.kind === 'shield' || e.kind === 'captain') e.guardUp = true; } }
    if (died) document.getElementById('dead').classList.add('show');
    this.vignette = 0; this.falling = 0; document.getElementById('fell').classList.remove('show');
  },
};

const cam = new ChaseCam(camera, world); cam.tower = { x: L.tower.x, z: L.tower.z, topY: L.topY };
const player = new Player(world, game); game.player = player;
player.body.pos.x = L.start.x; player.body.pos.y = L.start.y; player.body.pos.z = L.start.z; player.body.syncAabb();
cam.target.set(L.start.x, L.start.y + 1.2, L.start.z);
const playerRig = knightRig(); scene.add(playerRig);
const playerMat = MAT.clone(); playerRig.traverse(o => { if (o.isMesh) o.material = playerMat; });
const swordTrail = new THREE.Mesh(new THREE.RingGeometry(0.9, 2.1, 24, 1, -0.2, 2.2), new THREE.MeshBasicMaterial({ color: '#fff0c0', transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
swordTrail.geometry.rotateX(-Math.PI / 2); swordTrail.visible = false; scene.add(swordTrail);
// dash afterimages: three ghost rigs trailing the knight
const ghostMat = new THREE.MeshBasicMaterial({ color: '#9ad0ff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
const ghosts = Array.from({ length: 3 }, () => { const g = knightRig(); g.traverse(o => { if (o.isMesh) { o.material = ghostMat; o.castShadow = false; } }); g.visible = false; scene.add(g); return { rig: g, t: 0 }; });
let ghostTimer = 0;
function updateGhosts(dt) {
  const dashing = player.state === S.DASH || player.state === S.RUSH;
  ghostTimer -= dt;
  if (dashing && ghostTimer <= 0) { ghostTimer = 0.045; const g = ghosts.reduce((a, b) => a.t < b.t ? a : b); g.t = 0.28; g.rig.visible = true; g.rig.position.copy(playerRig.position); g.rig.rotation.copy(playerRig.rotation); g.rig.scale.copy(playerRig.scale); }
  for (const g of ghosts) { if (!g.rig.visible) continue; g.t -= dt; if (g.t <= 0) { g.rig.visible = false; continue; } }
  ghostMat.opacity = 0.32;
}

for (const sp of L.spawns) {
  const e = new Enemy(sp.kind, world, game, sp.x, sp.y, sp.z, { perch: sp.perch, facing: Math.PI });
  e.camp = !!sp.camp;
  e.boss = !!sp.boss;
  attachRig(e);
  game.enemies.push(e);
}
function attachRig(e) {
  const rig = gruntRig(e.kind);
  // per-enemy material so we can drive emissive (telegraph is a HUE channel)
  const mat = MAT.clone(); rig.traverse(o => { if (o.isMesh) o.material = mat; });
  rig.userData.mat = mat;
  e.mesh = rig; scene.add(rig);
}

// ------------------------------------------------------------------ fx (tiny box particles)
const fxPool = [];
function spawnFx(kind, pos, count, dir) {
  const spec = {
    hit: { n: 10, c: '#ffd27a', sp: 6, life: 0.35, s: 0.12 }, hurt: { n: 12, c: '#ff4a3a', sp: 6, life: 0.4, s: 0.14 },
    clank: { n: 6, c: '#cfe6ff', sp: 4, life: 0.25, s: 0.08 }, parry: { n: 18, c: '#ffffff', sp: 9, life: 0.45, s: 0.12 },
    break: { n: 16, c: '#8ad0ff', sp: 8, life: 0.5, s: 0.14 }, shock: { n: 24, c: '#c9b28a', sp: 7, life: 0.5, s: 0.16 },
    dust: { n: 5, c: '#9a8a6a', sp: 2, life: 0.3, s: 0.1 }, boltstick: { n: 4, c: '#d8c8a0', sp: 3, life: 0.3, s: 0.08 },
    die: { n: 20, c: '#4a4a4a', sp: 5, life: 0.7, s: 0.18 },
  }[kind] || { n: 6, c: '#fff', sp: 4, life: 0.3, s: 0.1 };
  const N = Math.max(1, Math.round((count || spec.n) * (SET.particles || 1)));
  for (let i = 0; i < N; i++) {
    let f = fxPool.find(x => !x.alive);
    if (!f) { f = { mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#fff' })), alive: false }; scene.add(f.mesh); fxPool.push(f); }
    f.alive = true; f.life = spec.life * (0.6 + Math.random() * 0.6); f.max = f.life;
    f.mesh.material.color.set(spec.c); f.mesh.scale.setScalar(spec.s * (0.7 + Math.random() * 0.6)); f.mesh.visible = true;
    f.mesh.position.set(pos.x, pos.y, pos.z);
    const a = Math.random() * Math.PI * 2, u = Math.random();
    f.vel = new THREE.Vector3(Math.cos(a) * spec.sp * u, (kind === 'shock' ? 1 : 3) + Math.random() * spec.sp * 0.6, Math.sin(a) * spec.sp * u);
    if (dir) { f.vel.x += dir.x * spec.sp * 0.9; f.vel.z += dir.z * spec.sp * 0.9; }
  }
}
function updateFx(dt) {
  for (const f of fxPool) {
    if (!f.alive) continue;
    f.life -= dt; if (f.life <= 0) { f.alive = false; f.mesh.visible = false; continue; }
    f.vel.y -= 18 * dt; f.mesh.position.addScaledVector(f.vel, dt);
    f.mesh.rotation.x += dt * 6; f.mesh.rotation.z += dt * 4;
    const s = f.life / f.max; f.mesh.scale.multiplyScalar(0.97); f.mesh.material.opacity = s;
  }
}

// ------------------------------------------------------------------ input
function applySettings() {
  renderer.setPixelRatio(Math.max(0.5, Math.min(devicePixelRatio * 1.5, devicePixelRatio * SET.pixelRatio)));
  sun.castShadow = SET.shadows !== 'off';
  renderer.shadowMap.type = SET.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  renderer.toneMappingExposure = SET.grade === 'bright' ? 1.5 : SET.grade === 'moody' ? 1.12 : 1.32;
  hemi.intensity = SET.grade === 'bright' ? 3.3 : SET.grade === 'moody' ? 2.4 : 2.9;
  cam.sens = 0.0022 * SET.sens;
  if (audio.master) audio.master.gain.value = SET.volume;
  if (music.bus) music.bus.gain.value = SET.music;
  for (const gq of torchGlows) gq.visible = SET.glows;
  for (const gq of glowFacers) gq.visible = SET.glows;
  saveSettings();
}
const OPT_DEFS = [
  { key: 'volume', label: 'SOUND VOLUME', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'music', label: 'MUSIC VOLUME', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'sens', label: 'CAMERA SPEED', type: 'range', min: 0.4, max: 2.2, step: 0.1 },
  { key: 'invertY', label: 'INVERT CAMERA Y', type: 'toggle' },
  { key: 'fov', label: 'FIELD OF VIEW', type: 'range', min: 52, max: 78, step: 1 },
  { key: 'shadows', label: 'SHADOWS', type: 'select', opts: ['soft', 'hard', 'off'] },
  { key: 'pixelRatio', label: 'RENDER SCALE', type: 'select', opts: [0.75, 1, 1.25] },
  { key: 'grade', label: 'COLOR GRADE', type: 'select', opts: ['dusk', 'bright', 'moody'] },
  { key: 'glows', label: 'LIGHT GLOWS', type: 'toggle' },
  { key: 'particles', label: 'PARTICLES', type: 'select', opts: [0.5, 1, 1.5] },
  { key: 'shake', label: 'SCREEN SHAKE', type: 'toggle' },
  { key: 'reduceMotion', label: 'REDUCE MOTION', type: 'toggle' },
  { key: 'dmgNumbers', label: 'DAMAGE NUMBERS', type: 'toggle' },
];
function buildOptions() {
  const rows = document.getElementById('optrows'); rows.innerHTML = '';
  for (const d of OPT_DEFS) {
    const row = document.createElement('div'); row.className = 'optrow';
    const lab = document.createElement('span'); lab.className = 'olabel'; lab.textContent = d.label; row.appendChild(lab);
    if (d.type === 'range') {
      const inp = document.createElement('input'); inp.type = 'range'; inp.min = d.min; inp.max = d.max; inp.step = d.step; inp.value = SET[d.key];
      const val = document.createElement('span'); val.className = 'oval'; val.textContent = (+SET[d.key]).toFixed(d.step < 1 ? 2 : 0);
      inp.oninput = () => { SET[d.key] = +inp.value; val.textContent = (+inp.value).toFixed(d.step < 1 ? 2 : 0); applySettings(); audio.play('ui'); };
      row.appendChild(inp); row.appendChild(val);
    } else if (d.type === 'toggle') {
      const sp = document.createElement('span'); row.appendChild(sp);
      const t = document.createElement('span'); t.className = 'otoggle' + (SET[d.key] ? '' : ' off'); t.textContent = SET[d.key] ? 'ON' : 'OFF';
      t.onclick = () => { SET[d.key] = !SET[d.key]; t.textContent = SET[d.key] ? 'ON' : 'OFF'; t.className = 'otoggle' + (SET[d.key] ? '' : ' off'); applySettings(); audio.play('ui'); };
      row.appendChild(t);
    } else {
      const sp = document.createElement('span'); row.appendChild(sp);
      const sel = document.createElement('select');
      for (const o of d.opts) { const op = document.createElement('option'); op.value = o; op.textContent = String(o).toUpperCase(); if (String(SET[d.key]) === String(o)) op.selected = true; sel.appendChild(op); }
      sel.onchange = () => { const v = sel.value; SET[d.key] = isNaN(+v) ? v : +v; applySettings(); audio.play('ui'); };
      row.appendChild(sel);
    }
    rows.appendChild(row);
  }
}
let optionsFrom = 'file';
function showOptions(on, from) { if (from) optionsFrom = from; document.getElementById('options').style.display = on ? 'flex' : 'none'; if (on) buildOptions(); else if (optionsFrom === 'file') document.getElementById('fileselect').style.display = 'flex'; else showMenu(true); }
document.getElementById('btnOptions').onclick = () => { document.getElementById('fileselect').style.display = 'none'; showOptions(true, 'file'); };
document.getElementById('btnOptClose').onclick = () => showOptions(false);
document.getElementById('btnPauseOptions').onclick = () => { document.getElementById('menu').classList.remove('show'); showOptions(true, 'pause'); };
document.getElementById('btnResume').onclick = () => { if (lockFallback) showMenu(false); else requestLock(); };
document.getElementById('btnQuit').onclick = () => { saveGame(); location.reload(); };

// ---------------- save slots ----------------
let SLOT = 0;
function slotKey(i) { return 'rampart_save_' + i; }
function readSlot(i) { try { return JSON.parse(localStorage.getItem(slotKey(i)) || 'null'); } catch (e) { return null; } }
function saveGame() {
  if (!SLOT || !game.started) return;
  const data = { crestsGot: game.crestsGot || {}, pennants: pennantMeshes.map(p => p.got), shards: shardMeshes.map(sh => sh.got), pennantCount: game.pennants || 0, shardCount: game.shards || 0, checkpoint: game.checkpoint, time: (readSlot(SLOT)?.time || 0) + game.time - (game.lastSaveTime || 0), deaths: game.deaths, campDone: !!game.campDone };
  game.lastSaveTime = game.time;
  try { localStorage.setItem(slotKey(SLOT), JSON.stringify(data)); } catch (e) {}
}
function loadSlot(i) {
  SLOT = i; const d = readSlot(i);
  if (!d) return;
  game.crestsGot = d.crestsGot || {}; game.crests = Object.keys(game.crestsGot).length;
  (d.pennants || []).forEach((got, k) => { if (got && pennantMeshes[k]) { pennantMeshes[k].got = true; pennantMeshes[k].m.visible = false; } });
  (d.shards || []).forEach((got, k) => { if (got && shardMeshes[k]) { shardMeshes[k].got = true; shardMeshes[k].m.visible = false; } });
  game.pennants = d.pennantCount || 0; game.shards = d.shardCount || 0; game.deaths = d.deaths || 0; game.campDone = !!d.campDone;
  if (game.campDone) game.campWave = 2;
  game.checkpoint = Math.min(d.checkpoint || 0, L.checkpoints.length - 1);
  const cp = L.checkpoints[game.checkpoint];
  player.body.pos.x = cp.x; player.body.pos.y = cp.y; player.body.pos.z = cp.z; player.body.syncAabb(); cam.target.set(cp.x, cp.y + 1.2, cp.z);
  refreshHallBanners(); renderBoard();
}
function fmtTime(t) { const m = (t / 60) | 0, sec = (t % 60) | 0; return m + ':' + String(sec).padStart(2, '0'); }
function buildSlots() {
  const el = document.getElementById('slots'); el.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const d = readSlot(i);
    const row = document.createElement('div'); row.className = 'slotrow' + (d ? '' : ' empty');
    row.innerHTML = '<span class="sic">' + (d ? '\u2726' : '\u2727') + '</span><span class="sname">' + (d ? 'TALE ' + i : 'NEW TALE') + '</span><span class="sprog">' + (d ? ('\u2726 ' + Object.keys(d.crestsGot || {}).length + '/8 \u00b7 ' + fmtTime(d.time || 0)) : '\u2014') + '</span>' + (d ? '<span class="serase">ERASE</span>' : '<span></span>');
    row.onclick = (ev) => {
      if (ev.target.classList.contains('serase')) { if (row.dataset.confirm) { localStorage.removeItem(slotKey(i)); buildSlots(); } else { row.dataset.confirm = '1'; ev.target.textContent = 'SURE?'; } return; }
      audio.resume(); audio.play('checkpoint');
      document.getElementById('fileselect').style.display = 'none';
      document.getElementById('title').classList.remove('hide'); document.getElementById('title').style.display = 'flex';
      pendingSlot = i;
    };
    el.appendChild(row);
  }
}
let pendingSlot = 0;
setInterval(() => { if (game.started && !game.paused && !game.won) saveGame(); }, 10000);
const keys = {}; let mouseDX = 0, mouseDY = 0; const pressed = {};
const KEYMAP = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyQ: 'heavy', KeyF: 'bash', ControlLeft: 'pound', KeyC: 'board', KeyE: 'interact', Tab: 'lock', KeyZ: 'lock', KeyR: 'respawn', KeyT: 'tune', Escape: 'menu', KeyJ: 'light', KeyK: 'block' };
let atSplash = true;
function leaveSplash() { if (!atSplash) return; atSplash = false; audio.resume(); audio.play('checkpoint'); document.getElementById('splash').style.display = 'none'; buildSlots(); document.getElementById('fileselect').style.display = 'flex'; }
document.getElementById('splash').addEventListener('mousedown', leaveSplash);
addEventListener('keydown', e => { if (atSplash) { leaveSplash(); return; } }, true);
addEventListener('keydown', e => {
  const k = KEYMAP[e.code]; if (!k) return; e.preventDefault();
  if (!keys[k]) pressed[k] = true; keys[k] = true;
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) { keys[k] = false; } });
let lockFallback = false;   // pointer lock refused (embedded panes, some browsers): free-look without lock
function requestLock() {
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { lockFallback = true; showMenu(false); }); }
  catch (e) { lockFallback = true; showMenu(false); }
}
canvas.addEventListener('mousedown', e => {
  if (!game.started) { start(); requestLock(); return; }
  if (document.pointerLockElement !== canvas && !lockFallback) { requestLock(); return; }
  if (game.paused) { showMenu(false); return; }
  if (e.button === 0) { keys.light = true; pressed.light = true; }
  if (e.button === 2) { keys.block = true; }
  if (e.button === 1) { keys.heavy = true; pressed.heavy = true; }
  if (e.button === 3 || e.button === 4) { pressed.lock = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) keys.light = false; if (e.button === 2) keys.block = false; if (e.button === 1) keys.heavy = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { if (document.pointerLockElement === canvas || (lockFallback && game.started && !game.paused)) { mouseDX += e.movementX; mouseDY += e.movementY; } });
addEventListener('wheel', e => { cam.dist = Math.max(3.5, Math.min(12, cam.dist + Math.sign(e.deltaY) * 0.6)); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) { if (!lockFallback) showMenu(true); } else showMenu(false); });
addEventListener('keydown', e => { if (e.code === 'Escape' && lockFallback && game.started) showMenu(!game.paused); });

function readGamepad() {
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gps && gps[0]; if (!gp) return null;
  const dz = v => Math.abs(v) < 0.18 ? 0 : v;
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
  rumblePad = gp;
  return { mx: dz(gp.axes[0]), my: dz(gp.axes[1]), cx: dz(gp.axes[2]), cy: dz(gp.axes[3]),
    jump: b(0), light: b(2), heavy: b(3), dash: b(1), block: b(5) || (gp.buttons[7] && gp.buttons[7].value > 0.4), bash: b(4), pound: b(6), lock: b(10) || b(11), interact: b(4), start: b(9), select: b(8) };
}
let gpPrev = {};

// ---------------- touch controls ----------------
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const touch = { ax: 0, az: 0, dx: 0, dy: 0, jump: false, jumpP: false, atkP: false, dash: false, chg: false, blk: false, pnd: false, interactP: false };
if (IS_TOUCH) {
  document.getElementById('touchui').style.display = 'block';
  lockFallback = true;
  if (!localStorage.getItem('rampart_settings')) { SET.pixelRatio = 0.75; SET.shadows = 'hard'; saveSettings(); }
  const stick = document.getElementById('stick'), knob = document.getElementById('stickKnob');
  let stickId = null, camId = null, cx0 = 0, cy0 = 0;
  const sRect = () => stick.getBoundingClientRect();
  stick.addEventListener('touchstart', e => { e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier; }, { passive: false });
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { const r = sRect(); const dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2); const l = Math.hypot(dx, dy) || 1; const cl = Math.min(1, l); touch.ax = dx / l * cl; touch.az = -dy / l * cl; knob.style.transform = 'translate(' + (touch.ax * 34) + 'px,' + (-touch.az * 34) + 'px)'; }
      else if (t.identifier === camId) { touch.dx += (t.clientX - cx0) * 2.4; touch.dy += (t.clientY - cy0) * 2.4; cx0 = t.clientX; cy0 = t.clientY; }
    }
  }, { passive: false });
  addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; touch.ax = touch.az = 0; knob.style.transform = ''; } if (t.identifier === camId) camId = null; } });
  // camera drag: touches on the canvas that are not the stick or a button
  canvas.addEventListener('touchstart', e => { for (const t of e.changedTouches) { if (stickId === null || t.identifier !== stickId) { camId = t.identifier; cx0 = t.clientX; cy0 = t.clientY; } } if (!game.started) start(); }, { passive: true });
  const bindBtn = (id, down, up) => { const el = document.getElementById(id); el.addEventListener('touchstart', e => { e.preventDefault(); el.classList.add('on'); down(); }, { passive: false }); el.addEventListener('touchend', e => { e.preventDefault(); el.classList.remove('on'); if (up) up(); }, { passive: false }); };
  bindBtn('tJump', () => { touch.jump = true; touch.jumpP = true; }, () => { touch.jump = false; });
  bindBtn('tAtk', () => { touch.atkP = true; });
  bindBtn('tDash', () => { touch.dash = true; }, () => { touch.dash = false; });
  bindBtn('tChg', () => { touch.chg = true; }, () => { touch.chg = false; });
  bindBtn('tBlk', () => { touch.blk = true; }, () => { touch.blk = false; });
  bindBtn('tPnd', () => { touch.pnd = true; });
  bindBtn('tInteract', () => { touch.interactP = true; });
  bindBtn('tBoard', () => { showBoard(!game.boardOpen); });
}
let rumblePad = null;
function rumble(strong, weak, ms) { try { if (rumblePad && rumblePad.vibrationActuator) rumblePad.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) {} }
function collectInput() {
  // camera-relative movement
  const f = cam.forward(), r = cam.right();
  let ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), iz = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  const gp = readGamepad();
  const gpPressed = {};
  if (IS_TOUCH) { ix += touch.ax; iz += touch.az; cam.input(touch.dx, touch.dy); touch.dx = touch.dy = 0; }
  if (gp) {
    ix += gp.mx; iz += -gp.my;
    cam.input(gp.cx * 12, gp.cy * 10);
    for (const k of ['jump', 'light', 'heavy', 'dash', 'bash', 'pound', 'lock', 'interact', 'start', 'select']) { gpPressed[k] = gp[k] && !gpPrev[k]; }
    gpPrev = gp;
    if (gpPressed.start) { if (lockFallback) showMenu(!game.paused); else if (document.pointerLockElement) document.exitPointerLock(); }
    if (gpPressed.select) showBoard(!game.boardOpen);
  }
  const inp = {
    mx: f.x * iz + r.x * ix, mz: f.z * iz + r.z * ix,
    jump: !!pressed.jump || !!gpPressed.jump || touch.jumpP, jumpHeld: !!keys.jump || !!(gp && gp.jump) || touch.jump,
    dash: !!pressed.dash || !!gpPressed.dash || touch.dash, light: !!pressed.light || !!gpPressed.light || touch.atkP,
    heavy: !!pressed.heavy || !!gpPressed.heavy, heavyHeld: !!keys.heavy || !!(gp && gp.heavy),
    block: !!keys.block || !!(gp && gp.block) || touch.blk, bash: (!!pressed.bash || !!gpPressed.bash || (touch.chg && !touch.chgHeld)), bashHeld: !!keys.bash || !!(gp && gp.bash) || touch.chg,
    pound: !!pressed.pound || !!gpPressed.pound || touch.pnd, interact: !!pressed.interact || !!gpPressed.interact || touch.interactP,
    lock: !!pressed.lock || !!gpPressed.lock, respawn: !!pressed.respawn,
  };
  for (const k in pressed) pressed[k] = false;
  touch.chgHeld = touch.chg; touch.jumpP = false; touch.atkP = false; touch.pnd = false; touch.interactP = false;
  return inp;
}

// ------------------------------------------------------------------ simulation step
function step(dt, inp) {
  if (game.hitstop > 0) { game.hitstop -= dt; return; }
  game.time += dt;
  updatePlatforms(L, game.time, dt);
  if (pressed.board) { pressed.board = false; showBoard(!game.boardOpen); }
  if (game.boardOpen) inp = { ...inp, mx: 0, mz: 0, jump: false, dash: false, light: false, heavy: false, bash: false, pound: false, block: false, lock: false };
  if (game.bossIntro > 0) inp = { ...inp, mx: 0, mz: 0, jump: false, dash: false, light: false, heavy: false, bash: false, pound: false, block: false, lock: false };
  if (inp.lock) toggleLock();
  if (player.dead) { game.deathT = (game.deathT || 0) + dt; if (game.deathT > 1.2 && !game.deadShown) { game.deadShown = true; game.respawn(true); } }
  if (inp.respawn) { game.respawn(player.dead); }
  if (inp.interact) tryInteract();
  player.update(dt, inp);
  // events → audio
  for (const ev of player.events) {
    if (ev === 'jump' || ev === 'djump') { audio.play(ev); spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }); player.squash = { s: 1.18, t: 0.12 }; }
    else if (ev === 'land') { spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }, 8); audio.play('land'); player.squash = { s: 0.78, t: 0.14 }; cam.shake = Math.max(cam.shake, Math.min(0.35, -player.landVy * 0.012)); }
    else if (ev === 'longjump') { audio.play('djump'); spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }, 8); player.squash = { s: 1.25, t: 0.14 }; }
    else if (ev === 'bop') { audio.play('djump'); player.squash = { s: 0.7, t: 0.12 }; }
    else if (ev === 'thud') { audio.play('land'); cam.shake = Math.max(cam.shake, 0.3); }
    else if (ev === 'blocked') { player.blockJolt = 0.18; player.squash = { s: 0.9, t: 0.1 }; }
    else if (ev === 'parry') { player.blockJolt = 0.25; }
    else if (['swing', 'dash', 'bash', 'charge', 'heavyrelease', 'block', 'die'].includes(ev)) audio.play(ev);
  }
  player.events.length = 0;
  // enemies
  for (const e of game.enemies) {
    if (e.dead) { e.deathT += dt; if (e.deathT < 1.0) { e.body.vel.y -= 32 * dt; e.body.vel.x *= 0.97; e.body.vel.z *= 0.97; e.body.move(world, e.body.vel.x * dt, e.body.vel.y * dt, e.body.vel.z * dt); } continue; }
    if (game.noEnemies) continue;
    if (game.bossIntro > 0) { if (e.boss) { e.telegraph = 0.5 + 0.5 * Math.sin(game.time * 6); e.face(player.pos); } continue; }
    // wake-up radius only matters in 3D distance; also skip far ones for perf
    const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z, (e.pos.y - player.pos.y) * 0.5);
    if (d > 60) continue;
    e.update(dt, player);
    for (const ev of e.events) { if (ev === 'windup') audio.play('windup'); else if (ev === 'slamwind') { audio.play('charge'); } else if (ev === 'brace') audio.play('block'); else if (ev === 'die') { audio.play('die'); spawnFx('die', { x: e.pos.x, y: e.pos.y + 0.8, z: e.pos.z }); } }
    e.events.length = 0;
  }
  // bolts
  if (game.noEnemies) game.bolts.length = 0;
  for (const b of game.bolts) b.update(dt, world, game);
  game.bolts = game.bolts.filter(b => { if (b.dead && b.mesh) scene.remove(b.mesh); return !b.dead; });
  // ladders + swarm
  updateLadders(dt); updateRace(dt);
  // BREAK THE SIEGE CAMP: three waves, then the crest at the campfire
  if (!game.campDone) {
    const campAlive = game.enemies.some(e => !e.dead && e.campWave);
    if (game.campWave === undefined) { if (!game.enemies.some(e => !e.dead && e.camp)) { game.campWave = 1; spawnCampWave(1); } }
    else if (!campAlive && game.campWave === 1) { game.campWave = 2; spawnCampWave(2); }
    else if (!campAlive && game.campWave === 2) { game.campDone = true; toast('The camp is broken', 3); spawnCrest('camp', L.campArena.x, L.campArena.y, L.campArena.z); }
  }

  // tutorial prompts: fire once when the player passes each trigger line (south → north)
  for (const tt of L.tutorial) {
    if (tt.done) continue;
    if (tt.after && !L.tutorial.find(x => x.key === tt.after).done) continue;
    let fire = false;
    if (tt.z !== undefined) fire = player.pos.z > tt.z && (tt.key !== 'hoist' || (player.pos.x < -13 && player.pos.y > 5));
    else if (tt.cond === 'hit') fire = player.stats.hitsLanded > 0;
    else if (tt.cond === 'guardbreak') fire = game.enemies.some(e => e.kind === 'pellshield' && (e.stun > 0 || e.dead));
    if (fire) { tt.done = true; toast(tt.text, 4.5); }
  }
  // checkpoints
  for (let i = game.checkpoint + 1; i < L.checkpoints.length; i++) {
    const c = L.checkpoints[i];
    if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 3 && Math.abs(c.y - player.pos.y) < 2) { game.checkpoint = i; toast('Checkpoint: ' + c.name); audio.play('checkpoint'); saveGame(); }
  }
  // boss intro: first time the player stands on the arena near the captain
  if (!game.bossIntroDone) { const cap = game.enemies.find(e => e.boss && !e.dead); if (cap && player.pos.y > L.topY - 0.5 && Math.hypot(cap.pos.x - player.pos.x, cap.pos.z - player.pos.z) < 11) { game.bossIntroDone = true; game.bossIntro = 2.6; game.slowmo = 2.6; cap.aggroed = true; cap.state = 'chase'; player.lockTarget = cap; cam.lock = cap; cam.idle = 0; audio.play('roar'); document.getElementById('bosscard').classList.add('show'); setTimeout(() => document.getElementById('bosscard').classList.remove('show'), 3200); cam.shake = 0.6; for (let k = 0; k < 3; k++) spawnFx('shock', { x: cap.pos.x, y: cap.pos.y + 0.1, z: cap.pos.z }, 10); } }
  if (game.bossIntro > 0) { game.bossIntro -= dt; }
  // all four crests = the vale is yours
  if (!game.won && (game.crests || 0) >= 8) win();
  // lock maintenance
  if (player.lockTarget && (player.lockTarget.dead || Math.hypot(player.lockTarget.pos.x - player.pos.x, player.lockTarget.pos.z - player.pos.z) > 22)) { player.lockTarget = null; cam.lock = null; }
}

function updateLadders(dt) {
  const swarmAlive = game.enemies.filter(e => e.kind === 'swarm' && !e.dead).length;
  for (const ld of L.ladders) {
    if (!ld.up) {
      ld.fallT = (ld.fallT || 0) + dt; ld.respawn -= dt;
      if (ld.mesh) ld.mesh.rotation.x = -Math.min(1.35, ld.fallT * 2.2);
      if (ld.respawn <= 0) { ld.up = true; ld.fallT = 0; if (ld.mesh) ld.mesh.rotation.x = 0; }
      continue;
    }
    // spawn climbers only when the player is on/near the wall
    const near = Math.abs(player.pos.x - ld.x) < 26 && Math.abs(player.pos.z - ld.z) < 26 && player.pos.y > ld.bottom - 4 && player.pos.y < ld.top + 8;
    if (!near) continue;
    ld.t -= dt;
    if (ld.t <= 0 && swarmAlive < 6) {
      ld.t = ld.spawnEvery;
      const e = new Enemy('swarm', world, game, ld.x, ld.bottom - 1.5, ld.z, {});
      e.state = 'climb'; e.ladder = ld; e.aggroed = true; attachRig(e); game.enemies.push(e);
    }
  }
  // cull dead after fade
  for (const e of game.enemies) if (e.dead && e.deathT > 1.4 && e.mesh) { scene.remove(e.mesh); e.mesh = null; if (e.bar) { e.bar.remove(); e.bar = null; } }
  game.enemies = game.enemies.filter(e => !(e.dead && e.deathT > 1.4));
}

function spawnCampWave(n) {
  toast(n === 1 ? 'The camp rallies! Second wave!' : 'Their last stand!', 3); audio.play('roar');
  const A = L.campArena;
  const defs = n === 1 ? [['hound', -8, -88], ['hound', 16, -76], ['bomber', -14, -76]] : [['swarm', -8, -88], ['swarm', 16, -88], ['swarm', -14, -78], ['bomber', 20, -80]];
  for (const [k, x, z] of defs) { const e = new Enemy(k, world, game, x, A.y + 0.1, z, {}); e.aggroed = true; e.state = 'chase'; e.campWave = true; attachRig(e); game.enemies.push(e); spawnFx('shock', { x, y: A.y + 0.1, z }, 8); }
}
function tryInteract() {
  if (raceState.state === 'idle' && !(game.crestsGot || {}).race && Math.hypot(L.race.start.x - player.pos.x, L.race.start.z - player.pos.z) < 2.6) { startRace(); return; }
  if (L.warTable && Math.hypot(L.warTable.x - player.pos.x, L.warTable.z - player.pos.z) < 2.8) { showBoard(true); say('The map of Pennant Vale. Another vale lies beyond the clouds \u2014 when all eight crests are claimed.', 5); return; }
  for (const ld of L.ladders) {
    if (ld.up && Math.abs(player.pos.x - ld.x) < 2 && Math.abs(player.pos.z - ld.z) < 2.4 && Math.abs(player.pos.y - ld.top) < 2) { game.kickLadder(ld); return; }
  }
}
function toggleLock() {
  if (player.lockTarget) { player.lockTarget = null; cam.lock = null; return; }
  let best = null, bd = 16;
  const f = player.fwd();
  for (const e of game.enemies) {
    if (e.dead || e.cfg.friendly) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z; const d = Math.hypot(dx, dz);
    if (d > 16 || Math.abs(e.pos.y - player.pos.y) > 5) continue;
    if (!game.hasLineOfSight(e, player)) continue;
    const score = d - ((dx * f.x + dz * f.z) / (d || 1)) * 4;
    if (score < bd) { bd = score; best = e; }
  }
  if (best) { player.lockTarget = best; cam.lock = best; audio.play('lock'); }
}

// ------------------------------------------------------------------ animation
let runPhase = 0;
function animateRig(rig, ent, dt, isPlayer) {
  const u = rig.userData; const b = ent.body; const st = ent.state;
  rig.position.set(b.pos.x, b.pos.y, b.pos.z); rig.rotation.y = ent.facing;
  const sp = Math.hypot(b.vel.x, b.vel.z);
  const moving = sp > 0.5 && b.grounded;
  if (isPlayer) runPhase += dt * sp * 1.6; else ent.runPhase = (ent.runPhase || 0) + dt * sp * 1.6;
  const ph = isPlayer ? runPhase : ent.runPhase;
  const leg = moving ? Math.sin(ph) * 0.8 : (b.grounded ? 0 : 0.45);
  u.legL.rotation.x = leg; u.legR.rotation.x = -leg;
  u.torso.position.y = moving ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(game.time * 2.2 + (isPlayer ? 0 : ent.id)) * 0.015;
  if (!moving && b.grounded) { u.armR.rotation.z = Math.sin(game.time * 2.2) * 0.03; }
  u.head.position.y = 1.55 + u.torso.position.y;
  // defaults
  let armR = moving ? -Math.sin(ph) * 0.4 : 0, armL = moving ? Math.sin(ph) * 0.4 : 0, armRy = 0, armRz = 0, lean = 0, shieldUp = 0;
  const t = ent.t;
  if (isPlayer) {
    switch (st) {
      case S.LIGHT: { const a = P.light[ent.combo]; const k = Math.min(1, t / a.t); const w = k < 0.25 ? -2.2 + (k / 0.25) * 0.4 : (k < 0.6 ? -1.8 + ((k - 0.25) / 0.35) * 3.0 : 1.2 - ((k - 0.6) / 0.4) * 1.2); armR = w; armRy = ent.combo === 1 ? 0.9 : (ent.combo === 2 ? -0.5 : 0.4); armRz = ent.combo === 1 ? -0.8 : 0.5; lean = k < 0.6 ? 0.25 : 0.05; break; }
      case S.HEAVY_CHARGE: armR = -2.7; armRz = 0.8; lean = -0.15 + Math.sin(game.time * 40) * 0.02 * Math.min(1, ent.charge / P.heavyCharge); break;
      case S.HEAVY: { const k = Math.min(1, t / P.heavyT); armR = k < 0.3 ? -2.7 + (k / 0.3) * 1.0 : (k < 0.55 ? -1.7 + ((k - 0.3) / 0.25) * 3.2 : 1.5 - ((k - 0.55) / 0.45) * 1.5); armRz = 0.5; lean = k < 0.55 ? 0.4 : 0.1; break; }
      case S.BLOCK: shieldUp = 1; lean = 0.1; if (ent.blockJolt > 0) { ent.blockJolt -= dt; shieldUp = 1.5; lean = 0.22; } break;
      case S.DASH: lean = 0.55; armR = 0.6; armL = 0.6; break;
      case S.RUSH: shieldUp = 1.4; lean = 0.5; if (b.grounded && Math.random() < 0.4) spawnFx('dust', { x: b.pos.x - Math.sin(ent.facing) * 0.5, y: b.pos.y, z: b.pos.z - Math.cos(ent.facing) * 0.5 }, 1); break;
      case S.POUND: armR = -1.0; armRz = 0.3; lean = t < 0.12 ? -0.3 : 0.2; u.legL.rotation.x = 0.8; u.legR.rotation.x = 0.8; break;
      case S.HURT: lean = -0.35; armR = -0.6; armL = -0.6; break;
      case S.DEAD: rig.rotation.x = -Math.PI / 2 * Math.min(1, t * 2); rig.position.y += 0.3 * Math.min(1, t * 2); break;
      case S.AIR: armR = -0.5; armL = -0.5; lean = Math.max(-0.2, Math.min(0.2, -b.vel.y * 0.02)); break;
    }
    if (st !== S.DEAD) rig.rotation.x = 0;
    if (ent.iframes > 0 && st === S.HURT) rig.visible = Math.floor(game.time * 30) % 2 === 0; else rig.visible = true;
    // lean into the run; skid dust on hard turns
    const velAng = Math.atan2(b.vel.x, b.vel.z); const spd2 = Math.hypot(b.vel.x, b.vel.z);
    if (b.grounded && spd2 > 2) { let dAng = ((velAng - ent.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI; rig.rotation.z = -Math.max(-0.16, Math.min(0.16, dAng * 0.35)); rig.rotation.x += Math.min(0.12, spd2 * 0.012); }
    else rig.rotation.z *= 0.8;
    if (b.grounded && ent.state === S.IDLE) { const wish2 = Math.hypot(b.vel.x, b.vel.z); if (ent.lastSpeed > 5.5 && wish2 < 2) { spawnFx('dust', { x: b.pos.x, y: b.pos.y, z: b.pos.z }, 5); audio.play('step'); } }
    ent.lastSpeed = spd2;
    // idle look-around after a few quiet seconds
    if (ent.state === S.IDLE && spd2 < 0.5) { ent.idleT = (ent.idleT || 0) + dt; if (ent.idleT > 3) u.head.rotation.y = Math.sin(game.time * 0.7) * 0.55; else u.head.rotation.y *= 0.9; }
    else { ent.idleT = 0; u.head.rotation.y *= 0.9; }
    // squash & stretch
    if (ent.squash) { ent.squash.t -= dt; const k = Math.max(0, ent.squash.t / 0.14); const s = 1 + (ent.squash.s - 1) * k; rig.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); if (ent.squash.t <= 0) { ent.squash = null; rig.scale.set(1, 1, 1); } }
    else if (!b.grounded) { const s = 1 + Math.max(-0.08, Math.min(0.1, b.vel.y * 0.008)); rig.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); }
    else rig.scale.set(1, 1, 1);
    // canopies between the camera and the knight fade out
  { const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z; const px2 = player.pos.x, py2 = player.pos.y + 1.2, pz2 = player.pos.z;
    for (const t of L.treeMeshes) {
      const ax = px2 - cx, ay = py2 - cy, az = pz2 - cz; const len2 = ax * ax + ay * ay + az * az;
      const bx2 = t.x - cx, by2 = (t.y + 2.4) - cy, bz2 = t.z - cz;
      const tt = Math.max(0, Math.min(1, (ax * bx2 + ay * by2 + az * bz2) / (len2 || 1)));
      const dx2 = bx2 - ax * tt, dy2 = by2 - ay * tt, dz2 = bz2 - az * tt;
      const between = (dx2 * dx2 + dy2 * dy2 + dz2 * dz2) < 8.5 && tt > 0.05 && tt < 0.95;
      const want2 = between ? 0.22 : 1;
      t.mat.opacity += (want2 - t.mat.opacity) * Math.min(1, dt * 10);
      t.mat.depthWrite = t.mat.opacity > 0.6;
    }
  }
  // fade the knight when the camera is pulled in tight so it never fills the screen
  { const cd = cam.curDist; const fade = cd < 2.6 ? Math.max(0, (cd - 1.2) / 1.4) : 1; playerMat.transparent = fade < 1; playerMat.opacity = fade; playerMat.depthWrite = fade > 0.5; }
  // footsteps
    if (moving) { const ph2 = Math.floor(ph / Math.PI); if (ph2 !== ent.lastStep) { ent.lastStep = ph2; const gnd = b.ground; audio.play(gnd && (gnd.moving || gnd.tag === 'barricade' || (gnd.h <= 0.31 && gnd.w <= 4.1)) ? 'stepwood' : 'step'); if (sp > 5) spawnFx('dust', { x: b.pos.x, y: b.pos.y, z: b.pos.z }, 2); } }
    ent.landVy = b.grounded ? 0 : b.vel.y;
    // sword trail during hit windows
    const trailOn = (st === S.LIGHT && t >= P.light[ent.combo].hit[0] - 0.02 && t <= P.light[ent.combo].hit[1] + 0.06) || (st === S.HEAVY && t >= P.heavyHit[0] - 0.02 && t <= P.heavyHit[1] + 0.08);
    swordTrail.visible = trailOn;
    if (trailOn) { swordTrail.position.set(b.pos.x, b.pos.y + 1.0, b.pos.z); swordTrail.rotation.set(0, ent.facing + (ent.combo === 1 ? 0.4 : -0.4) * (st === S.LIGHT ? 1 : 0), ent.combo === 2 || st === S.HEAVY ? 0.5 : -0.2); swordTrail.scale.setScalar(st === S.HEAVY ? 1.35 : 1); swordTrail.material.opacity = 0.55; }
    // hurt flash
    playerMat.emissive.set(ent.state === S.HURT ? '#ff3030' : (ent.iframes > 0 && ent.state === S.DASH ? '#80c0ff' : '#000000'));
  } else {
    if (ent.dead) { const k = Math.min(1, ent.deathT * 2.2); rig.rotation.x = -Math.PI / 2 * k; rig.rotation.z = 0.3 * k; rig.rotation.y = ent.facing + ent.deathT * 5; rig.position.y -= Math.max(0, ent.deathT - 0.6) * 1.2; u.mat.emissive.set('#000'); u.mat.transparent = true; u.mat.opacity = Math.max(0, 1 - Math.max(0, ent.deathT - 0.7) * 1.6); }
    else {
      rig.rotation.x = 0;
      if (ent.kind === 'hound') { const gal = Math.sin(ph * 1.4); u.legL.rotation.x = gal * 0.9; u.legR.rotation.x = gal * 0.9; u.armR.rotation.x = -gal * 0.9; u.armL.rotation.x = -gal * 0.9; if (st === 'windup') { rig.scale.set(1, 0.8, 1); } else rig.scale.set(1, 1, 1); const m2 = u.mat; if (st === 'windup') m2.emissive.set('#ff9a2a').multiplyScalar(ent.telegraph * ent.telegraph * 0.7); return; }
      if (st === 'slamwind') { armR = -2.8; armL = -2.8; lean = -0.35; }
      else if (st === 'slam') { armR = 1.2; armL = 1.2; lean = 0.6; }
      else if (ent.brace > 0) { shieldUp = 1.2; lean = 0.25; armR = 0.4; }
      else if (st === 'windup') { armR = -2.2 - ent.telegraph * 0.6; armRz = 0.6; lean = -0.15; if (ent.kind === 'crossbow') { armR = -1.5; armRz = 0; } }
      else if (st === 'swing') { armR = 1.3; armRz = 0.4; lean = 0.35; if (ent.kind === 'crossbow') { armR = -1.5; } }
      else if (st === 'flinch') { lean = -0.3; armR = -0.5; }
      else if (st === 'climb') { const c = Math.sin(game.time * 8); u.legL.rotation.x = c * 0.8; u.legR.rotation.x = -c * 0.8; armR = -2.2 + c * 0.4; armL = -2.2 - c * 0.4; }
      if (ent.kind === 'crossbow' && st !== 'windup' && st !== 'swing') { armR = -1.2; }
      if (ent.cfg.friendly) { const cyc = (game.time * 0.5 + ent.id * 0.37) % 1; armR = cyc < 0.6 ? -1.3 - cyc * 0.4 : -1.0; lean = cyc < 0.6 ? -0.1 : 0.15; if (cyc > 0.6 && cyc < 0.62 && !ent.shotThis) { ent.shotThis = true; spawnFx('boltstick', { x: b.pos.x, y: b.pos.y + 1.4, z: b.pos.z + 0.6 }, 2, { x: 0, z: 1 }); } if (cyc < 0.5) ent.shotThis = false; rig.rotation.y = ent.facing + Math.sin(game.time * 0.3 + ent.id) * 0.25; }
      if (ent.guardUp && ent.stun <= 0 && st !== 'climb') shieldUp = 1;
      if (ent.stun > 0) { lean = 0.3; shieldUp = 0; armL = 0.8; u.head.rotation.z = Math.sin(game.time * 12) * 0.2; } else u.head.rotation.z = 0;
      // telegraph is a colour channel: grey → amber → white flash on swing
      const m = u.mat; const tg = ent.telegraph;
      if (st === 'swing') m.emissive.set('#fff6d0'); else m.emissive.set('#ff9a2a').multiplyScalar(tg * tg * 0.7);
      if (ent.flinchT > 0) m.emissive.set('#ff3030');
      if (ent.hitFlash > 0) { ent.hitFlash -= dt; m.emissive.set('#ffffff'); }
      if (ent.stun > 0) m.emissive.set('#3a7aff').multiplyScalar(0.5 + Math.sin(game.time * 10) * 0.2);
    }
  }
  u.armR.rotation.x = armR; u.armR.rotation.y = armRy; u.armR.rotation.z = armRz;
  u.armL.rotation.x = shieldUp ? -1.4 : armL; u.armL.rotation.y = shieldUp ? 0.9 * Math.min(1, shieldUp) : 0;
  u.armL.position.x = shieldUp ? -0.2 : -0.4; u.armL.position.z = shieldUp ? 0.25 * shieldUp : 0;
  u.torso.rotation.x = lean; u.head.rotation.x = lean * 0.5;
  if (u.cape && u.cape.visible) { const v = Math.hypot(b.vel.x, b.vel.z); u.cape.rotation.x = -0.15 - Math.min(1.1, v * 0.09) - (b.grounded ? 0 : Math.max(-0.3, Math.min(0.6, -b.vel.y * 0.04))) + Math.sin(game.time * 3.1) * 0.04; }
}

// ------------------------------------------------------------------ render/HUD
const hud = {
  hp: document.getElementById('hp'), boss: document.getElementById('boss'), bossFill: document.getElementById('bossfill'),
  toast: document.getElementById('toast'), charge: document.getElementById('charge'), prompt: document.getElementById('prompt'), alt: document.getElementById('alt'),
};
let toastT = 0;
function toast(msg, t = 2.6) { hud.toast.textContent = msg; hud.toast.classList.add('show'); toastT = t; }
function renderHud(dt) {
  // hp pips
  let s = ''; for (let i = 0; i < P.hp; i++) s += `<i class="${i < player.hp ? 'on' : ''}"></i>`; hud.hp.innerHTML = s;
  const boss = game.enemies.find(e => e.boss && !e.dead && e.aggroed);
  hud.boss.style.display = boss ? 'block' : 'none'; if (boss) hud.bossFill.style.width = (boss.hp / boss.maxHp * 100) + '%';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.toast.classList.remove('show'); }
  if (sayT > 0) { sayT -= dt; if (sayT <= 0) document.getElementById('dialogue').classList.remove('show'); }
  { const c = document.getElementById('combo'); const n = player.stats.hitsLanded - (game.comboBase || 0); if (player.comboT > 0 || player.state === S.LIGHT) { c.style.display = 'block'; c.textContent = (player.combo + 1) + ' HIT'; } else c.style.display = 'none'; }
  hud.charge.style.display = player.state === S.HEAVY_CHARGE ? 'block' : 'none';
  if (player.state === S.HEAVY_CHARGE) hud.charge.firstElementChild.style.width = Math.min(100, player.charge / P.heavyCharge * 100) + '%';
  hud.charge.classList.toggle('full', player.charge >= P.heavyCharge);
  // ladder prompt
  let near = null;
  for (const ld of L.ladders) if (ld.up && Math.abs(player.pos.x - ld.x) < 2 && Math.abs(player.pos.z - ld.z) < 2.4 && Math.abs(player.pos.y - ld.top) < 2) near = ld;
  const nearSquire = raceState.state === 'idle' && !(game.crestsGot || {}).race && Math.hypot(L.race.start.x - player.pos.x, L.race.start.z - player.pos.z) < 2.6;
  const nearTable = L.warTable && Math.hypot(L.warTable.x - player.pos.x, L.warTable.z - player.pos.z) < 2.8;
  hud.prompt.textContent = near ? 'E \u2014 KICK THE LADDER' : nearTable ? 'E \u2014 THE WAR TABLE' : 'E \u2014 RACE THE SQUIRE';
  hud.prompt.style.display = (near || nearSquire || nearTable) ? 'block' : 'none';
  { const ti = document.getElementById('tInteract'); if (ti) ti.style.display = (IS_TOUCH && (near || nearSquire || nearTable)) ? 'flex' : 'none'; }
  hud.alt.textContent = 'ALT ' + player.pos.y.toFixed(0) + 'm';
  // objective + off-screen marker
  // nearest unclaimed crest target drives the objective line and the marker
  const got = game.crestsGot || {};
  const targets = [];
  if (!got.captain) targets.push({ name: 'FELL THE SIEGE CAPTAIN', x: L.goal.x, y: L.goal.y + 2, z: L.goal.z });
  if (!got.race) targets.push(raceState.state === 'running' ? { name: 'RACE! TO THE WATCHTOWER', x: L.raceFinish.x, y: L.raceFinish.y + 2, z: L.raceFinish.z } : { name: 'THE SQUIRE WAITS', x: L.race.start.x, y: L.race.start.y + 1, z: L.race.start.z });
  if (!got.pennants) { if ((game.pennants || 0) >= 8) targets.push({ name: 'THE SHRINE CREST', x: L.shrine.x, y: L.shrine.y + 1, z: L.shrine.z }); else { let bestp = null, bpd = 1e9; for (const pn of pennantMeshes) { if (pn.got) continue; const d = Math.hypot(pn.c.x - player.pos.x, pn.c.z - player.pos.z); if (d < bpd) { bpd = d; bestp = pn; } } if (bestp) targets.push({ name: 'RED PENNANTS ' + (game.pennants || 0) + '/8', x: bestp.c.x, y: bestp.c.y + 1, z: bestp.c.z }); } }
  if (!got.peaks) targets.push({ name: 'CREST OF THE PEAKS', x: L.peakCrest.x, y: L.peakCrest.y + 1, z: L.peakCrest.z });
  let gl = L.beacon, tname = 'THE VALE IS YOURS';
  if (targets.length) { let bd2 = 1e9; for (const t of targets) { const d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z); if (d < bd2) { bd2 = d; gl = { x: t.x, y: t.y + 7, z: t.z }; tname = t.name; } } }
  const dist = Math.hypot(gl.x - player.pos.x, gl.y - 7 - player.pos.y, gl.z - player.pos.z);
  const obj = document.getElementById('objective');
  obj.textContent = tname + '  ' + String.fromCharCode(183) + '  ' + dist.toFixed(0) + 'm';
  const v = new THREE.Vector3(gl.x, gl.y - 3, gl.z).project(camera); const mk = document.getElementById('marker');
  const onScreen = v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
  if (onScreen) { mk.style.display = 'block'; mk.style.left = ((v.x + 1) / 2 * innerWidth) + 'px'; mk.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; mk.textContent = '▼'; }
  else { const a = Math.atan2(v.x, v.y) * (v.z > 1 ? -1 : 1); const r = 0.42; mk.style.display = 'block'; mk.style.left = (innerWidth / 2 + Math.sin(a) * innerWidth * r) + 'px'; mk.style.top = (innerHeight / 2 - Math.cos(a) * innerHeight * r) + 'px'; mk.textContent = '➤'; mk.style.transform = 'translate(-50%,-50%) rotate(' + (a * 180 / Math.PI - 90) + 'deg)'; }
  if (onScreen) mk.style.transform = 'translate(-50%,-100%)';
  // lock-on reticle
  const ret = document.getElementById('reticle');
  if (player.lockTarget && !player.lockTarget.dead) { const lp = new THREE.Vector3(player.lockTarget.pos.x, player.lockTarget.pos.y + 1.0 * player.lockTarget.scale, player.lockTarget.pos.z).project(camera); if (lp.z < 1) { ret.style.display = 'block'; ret.style.left = ((lp.x + 1) / 2 * innerWidth) + 'px'; ret.style.top = ((1 - lp.y) / 2 * innerHeight) + 'px'; } else ret.style.display = 'none'; }
  else ret.style.display = 'none';
  // dash FOV kick
  if (!SET.shake || SET.reduceMotion) cam.shake = 0;
  const spdF = SET.reduceMotion ? 0 : Math.min(4, Math.max(0, (Math.hypot(player.body.vel.x, player.body.vel.z) - 6) * 0.6));
  const wantFov = SET.fov + spdF + (!SET.reduceMotion && (player.state === S.DASH || player.state === S.RUSH) ? 8 : 0) + (game.slowmo > 0 ? -4 : 0);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
  // enemy health bars
  for (const e of game.enemies) {
    const show = !e.dead && !e.cfg.friendly && (e.aggroed || e.hp < e.maxHp);
    if (!show) { if (e.bar) e.bar.style.display = 'none'; continue; }
    if (!e.bar) { e.bar = document.createElement('div'); e.bar.className = 'ebar'; e.bar.innerHTML = '<div></div>'; document.body.appendChild(e.bar); }
    const p = new THREE.Vector3(e.pos.x, e.pos.y + 2.1 * e.scale, e.pos.z).project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) { e.bar.style.display = 'none'; continue; }
    e.bar.style.display = 'block'; e.bar.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; e.bar.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
    e.bar.firstElementChild.style.width = (e.hp / e.maxHp * 100) + '%'; e.bar.classList.toggle('guard', !!e.guardUp && e.stun <= 0);
  }
}

function crestGet(key) {
  const def = CRESTS.find(c => c.key === key);
  game.slowmo = 1.2; game.flash = 0.5; audio.play('win'); cam.shake = 0.4;
  const el = document.getElementById('crestcard');
  document.getElementById('crestcardname').textContent = def ? def.name : key;
  document.getElementById('crestcardcount').textContent = '\u2726 ' + (game.crests || 0) + ' of 4';
  el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3400);
  const cc = document.getElementById('crests'); cc.classList.remove('pop'); void cc.offsetWidth; cc.classList.add('pop');
  audio.play('crestget');
  renderBoard(); refreshHallBanners(); say(CREST_LINES[key] || '');
}
const CREST_LINES = {
  captain: 'Squire: The Captain has fallen! The Vale breathes again.',
  race: 'Squire: Fairly run, my lord. The flag is yours.',
  pennants: 'Squire: Eight pennants! The shrine remembers our colours.',
  peaks: 'Squire: You climbed the spires? The crows will speak of it.',
  camp: 'Smith: That camp plagued the road for a month. Well struck.',
  grotto: 'Smith: The grotto? My grandmother said the river hid its gold there.',
  shards: 'Squire: Thirty shards of sky. The Vale glitters for you.',
  shadow: 'Smith: The old balcony... no one has stood there since the siege began.',
};
let sayT = 0;
function say(text, t = 4.5) { if (!text) return; const el = document.getElementById('dialogue'); el.textContent = text; el.classList.add('show'); sayT = t; }
function renderBoard() {
  const rows = document.getElementById('boardrows'); if (!rows) return;
  rows.innerHTML = CRESTS.map(c => { const got = (game.crestsGot || {})[c.key]; return '<div class="brow' + (got ? ' got' : '') + '"><span class="bic">' + (got ? '\u2726' : '\u2727') + '</span><span class="bname">' + c.name + '</span><span class="bhint">' + (got ? 'CLAIMED' : c.hint) + '</span></div>'; }).join('');
  document.getElementById('boardpennants').textContent = 'red pennants: ' + (game.pennants || 0) + ' / 8';
}
function showBoard(on) { game.boardOpen = on; document.getElementById('crestboard').classList.toggle('show', on); if (on) renderBoard(); }
document.getElementById('crestboard').addEventListener('mousedown', () => showBoard(false));
function win() {
  game.won = true; audio.play('win');
  const el = document.getElementById('win'); el.classList.add('show');
  document.getElementById('winstats').textContent = 'All four crests claimed. ' + `${(game.time / 60) | 0}:${String((game.time % 60) | 0).padStart(2, '0')} · ${player.kills} foes · ${game.deaths} deaths · ${player.stats.parries} parries`;
  document.exitPointerLock();
}
function showMenu(on) { document.getElementById('menu').classList.toggle('show', on && game.started && !game.won); game.paused = on; }
function start() { if (game.started) return; if (atSplash || document.getElementById('fileselect').style.display === 'flex') return; game.started = true; if (pendingSlot) loadSlot(pendingSlot); applySettings(); spawnCrest('peaks', L.peakCrest.x, L.peakCrest.y, L.peakCrest.z); spawnCrest('grotto', L.grotto.x, L.grotto.y, L.grotto.z); spawnCrest('shadow', L.balcony.x, L.balcony.y, L.balcony.z); setTimeout(() => { if (!game.boardOpen) showBoard(true); }, 600); document.getElementById('title').classList.add('hide'); audio.resume(); music.start(); cam.yaw = Math.PI; cam.pitch = 0.38; cam.idle = 0; toast('Reclaim the eight crests of the Vale.', 3.5); }
for (const ev of ['mousedown', 'click']) document.getElementById('title').addEventListener(ev, () => { if (!game.started) { start(); requestLock(); } });
document.getElementById('menu').addEventListener('mousedown', () => { if (lockFallback) showMenu(false); else requestLock(); });
document.getElementById('retry').onclick = () => { document.getElementById('dead').classList.remove('show'); requestLock(); };
document.getElementById('dead').addEventListener('click', () => { document.getElementById('dead').classList.remove('show'); requestLock(); });

// tuning panel (T)
{
  const panel = document.getElementById('tune'); let built = false;
  addEventListener('keydown', e => {
    if (e.code !== 'KeyT') return;
    panel.classList.toggle('show');
    if (!built) {
      built = true;
      for (const k of Object.keys(P)) { if (typeof P[k] !== 'number') continue; const row = document.createElement('label'); row.innerHTML = `<span>${k}</span><input type=number step=0.05 value="${P[k]}">`; row.querySelector('input').oninput = ev => { P[k] = parseFloat(ev.target.value) || 0; }; panel.appendChild(row); }
    }
  });
}

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ------------------------------------------------------------------ main loop
let acc = 0, last = performance.now(), lastRender = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (game.started && !game.paused && !game.won) {
    acc += dt * (game.slowmo > 0 ? 0.35 : 1);
    const inp = collectInput();
    cam.input(mouseDX, (SET.invertY ? -1 : 1) * mouseDY); mouseDX = mouseDY = 0;
    let first = true;
    while (acc >= FIXED) { step(FIXED, first ? inp : { ...inp, jump: false, dash: false, light: false, heavy: false, bash: false, pound: false, interact: false, lock: false, respawn: false }); acc -= FIXED; first = false; }
  }
  render(dt);
}
function render(dt) {
  if (game.falling) { game.falling -= dt; if (game.falling <= 0) { game.falling = 0; document.getElementById('fell').classList.remove('show'); player.hp = Math.max(0, player.hp - 1); game.respawn(player.hp <= 0); } }
  for (const pl of L.platforms) if (pl.tag === 'hoist' && pl.mesh) { if (!pl.rope) { pl.rope = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), new THREE.MeshLambertMaterial({ color: '#5a4630' })); scene.add(pl.rope); } const top = 17; const h = Math.max(0.1, top - pl.max.y); pl.rope.scale.y = h; pl.rope.position.set(pl.cx, pl.max.y + h / 2, pl.cz); }
  updateAtmos(dt); game.slowmo = Math.max(0, game.slowmo - dt); game.vignette = Math.max(0, game.vignette - dt * 1.6); game.flash = Math.max(0, game.flash - dt * 3);
  const moving = Math.hypot(player.body.vel.x, player.body.vel.z) > 1;
  if (game.started && !game.paused && !(game.deathCine > 0)) cam.update(dt, player, moving);
  else if (!game.started) { const t = performance.now() / 1000; camera.position.set(Math.sin(t * 0.06) * 30, -14 + Math.sin(t * 0.11) * 3, -110 + Math.cos(t * 0.06) * 34); camera.lookAt(-10, -6, -30); }
  animateRig(playerRig, player, dt, true);
  for (const e of game.enemies) if (e.mesh) animateRig(e.mesh, e, dt, false);
  for (const b of game.bolts) {
    if (!b.mesh) { b.mesh = b.isBomb ? boxesMesh([{ x: 0, y: 0, z: 0, w: 0.5, h: 0.5, d: 0.5, c: '#22222a' }, { x: 0, y: 0.32, z: 0, w: 0.1, h: 0.16, d: 0.1, c: '#c9a24a' }], { shadow: false }) : boxesMesh([{ x: 0, y: 0, z: 0, w: 0.06, h: 0.06, d: 0.7, c: '#d8c8a0' }, { x: 0, y: 0, z: 0.33, w: 0.1, h: 0.1, d: 0.08, c: '#3a3d44' }], { shadow: false }); scene.add(b.mesh); }
    b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z);
    if (b.isBomb) { b.mesh.rotation.x += 0.1; if (b.fuse < 1 && Math.floor(game.time * 12) % 2 === 0) b.mesh.children === undefined ? 0 : 0; }
    else b.mesh.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z);
  }
  updateFx(dt); updateFloatText(dt); updateGhosts(dt); updatePickups(dt);
  // BOSS STORM: rain + lightning over the arena while the Captain rages
  if (game.storm && !stormRain.visible) { stormRain.visible = true; }
  if (stormRain.visible) {
    const T2 = L.tower; const on = (game.storm || 0) > 0 && !game.won;
    stormRain.material.opacity = on ? 0.5 * game.storm : Math.max(0, stormRain.material.opacity - dt * 0.5);
    if (stormRain.material.opacity <= 0.01 && !on) stormRain.visible = false;
    const pos2 = stormRain.geometry.attributes.position.array;
    for (let i = 0; i < RAIN; i++) { const k = i * 3; pos2[k + 1] -= dt * (26 + (i % 5) * 4); if (pos2[k + 1] < L.topY - 3) { pos2[k] = T2.x + (Math.random() - 0.5) * 26; pos2[k + 1] = L.topY + 16 + Math.random() * 8; pos2[k + 2] = T2.z + (Math.random() - 0.5) * 26; } }
    stormRain.geometry.attributes.position.needsUpdate = true;
    game.boltT = (game.boltT || 0) - dt;
    if ((game.storm || 0) >= 1 && game.boltT <= 0) { game.boltT = 2.2 + Math.random() * 3.5; game.flash = Math.max(game.flash, 0.55); audio.play('thunder'); cam.shake = Math.max(cam.shake, 0.35); }
  }
  // death cinematic: slow orbit around the fallen captain
  if (game.deathCine > 0) {
    game.deathCine -= dt; const e2 = game.deathCineTarget;
    if (e2) { const a2 = game.time * 0.6; camera.position.set(e2.pos.x + Math.cos(a2) * 7, e2.pos.y + 3.4, e2.pos.z + Math.sin(a2) * 7); camera.lookAt(e2.pos.x, e2.pos.y + 1, e2.pos.z); if (Math.random() < dt * 6) spawnFx('parry', { x: e2.pos.x + (Math.random() - 0.5) * 3, y: e2.pos.y + 1 + Math.random() * 2, z: e2.pos.z + (Math.random() - 0.5) * 3 }, 4); }
  }
  // danger ring under the foe that's winding up
  { const a = game.attackToken; const show = a && !a.dead && (a.state === 'windup' || a.state === 'slamwind' || a.state === 'swing' || a.state === 'slam'); dangerRing.material.opacity = show ? 0.55 + 0.3 * Math.sin(game.time * 18) : 0; if (show) { dangerRing.position.set(a.pos.x, a.pos.y + 0.04, a.pos.z); const r = a.state === 'slamwind' || a.state === 'slam' ? (a.cfg.slam ? a.cfg.slam.radius : 2) : (a.cfg.reach + 0.3) * 0.9; dangerRing.scale.setScalar(r); dangerRing.material.color.set(a.state === 'swing' || a.state === 'slam' ? '#fff6d0' : (a.telegraph > 0.75 ? '#ff4a2a' : '#ff9a2a')); } }
  // fog grading: higher = clearer and cooler
  { const h = Math.max(0, Math.min(1, (player.pos.y + 30) / 76)); scene.fog.near = 42 + h * 40; scene.fog.far = 150 + h * 80; scene.fog.color.setRGB(0.23 + 0.04 * h, 0.16 + 0.06 * h, 0.21 + 0.12 * h); }
  // low-hp heartbeat
  if (player.hp <= 2 && !player.dead && game.started && !game.won) { game.heart = (game.heart || 0) + dt; if (game.heart > 1.1) { game.heart = 0; audio.play('heart'); } }
  // landing ring: project down to the first surface
  const h = world.raycast({ x: player.pos.x, y: player.pos.y + 0.05, z: player.pos.z }, { x: 0, y: -1, z: 0 }, 60, b => b.tag !== 'field');
  if (h) { ring.position.set(player.pos.x, player.pos.y + 0.05 - h.t + 0.02, player.pos.z); ring.visible = !player.body.grounded; ring.material.opacity = Math.max(0.2, 0.8 - h.t * 0.03); ring.scale.setScalar(1 + Math.min(1.5, h.t * 0.08)); } else ring.visible = false;
  // sun follows player so the shadow map stays sharp
  sun.position.set(player.pos.x - 30, player.pos.y + 45, player.pos.z + 20); sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  // torches flicker; only nearest 8 lit
  torchLights.sort((a, b) => a.light.position.distanceToSquared(camera.position) - b.light.position.distanceToSquared(camera.position));
  torchLights.forEach((t, i) => { t.light.intensity = i < 8 ? t.base * (0.85 + 0.15 * Math.sin(game.time * 13 + t.seed) * Math.sin(game.time * 7.3 + t.seed)) : 0; });
  beacon.material.opacity = 0.3 + 0.1 * Math.sin(game.time * 2); beacon.rotation.y += dt * 0.3; beaconCore.material.opacity = 0.5 + 0.2 * Math.sin(game.time * 3);
  for (let ci = 0; ci < cloudDecks.length; ci++) { const m = cloudDecks[ci]; m.material.map.offset.x += dt * 0.002 * (ci + 1); }
  if (waterMeshes.length) { waterMeshes[0].position.y = L.water.y + Math.sin(game.time * 1.2) * 0.05; waterMeshes[1].position.y = L.water.y + 0.06 + Math.sin(game.time * 1.7 + 1) * 0.06; waterMeshes[1].material.opacity = 0.18 + 0.1 * (0.5 + 0.5 * Math.sin(game.time * 2.3)); }
  for (const gq of glowFacers) { if (gq.parent && gq.parent.visible) gq.lookAt(camera.position); }
  for (const gq of torchGlows) { gq.lookAt(camera.position); gq.material.opacity = 0.4 + 0.14 * Math.sin(game.time * 11 + gq.userData.seed); }
  if (L.flag) L.flag.rotation.y = Math.sin(game.time * 2) * 0.15 + (game.bossDead ? 0 : 0);
  renderHud(dt);
  // music intensity: nearby aggroed foes, boss
  if (game.started) { let inten = 0.15; for (const e of game.enemies) { if (e.dead || !e.aggroed) continue; const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z); if (d < 16) inten = Math.max(inten, e.boss ? 1 : 0.65); } if (game.won) inten = 0; music.update(dt, inten, player.pos); }
  document.getElementById('vig').style.opacity = Math.min(1, game.vignette) * 0.8 + (player.hp <= 2 && !player.dead ? 0.25 + 0.15 * Math.sin(game.time * 6) : 0);
  document.getElementById('flash').style.opacity = game.flash;
  renderer.render(scene, camera);
  lastRender = performance.now();
}
requestAnimationFrame(frame);
// watchdog: if RAF stalls (hidden pane), keep rendering so the page isn't black
setInterval(() => { if (performance.now() - lastRender > 500) render(0.016); }, 500);

// ------------------------------------------------------------------ headless API
const ZERO = { mx: 0, mz: 0, jump: false, jumpHeld: false, dash: false, light: false, heavy: false, heavyHeld: false, block: false, bash: false, pound: false, interact: false, lock: false, respawn: false };
window.RAMPART = {
  game, player, world, L, P, E, cam, scene, renderer, camera, updatePickups, updateRace, raceState, startRace, renderBoard,
  collectInput, animateRig,
  debugStart() { atSplash = false; pendingSlot = 0; for (const id of ['splash', 'fileselect', 'options', 'title']) document.getElementById(id).style.display = 'none'; document.getElementById('title').classList.add('hide'); game.started = true; applySettings(); },
  shot() { render(0); return fetch('/shot', { method: 'POST', body: canvas.toDataURL('image/png') }).then(r => r.text()); },
  start() { start(); game.paused = false; },
  step(dt = FIXED, inp = {}) { step(dt, { ...ZERO, ...inp }); },
  // run a script: array of [seconds, inputObj]; returns final player pos
  sim(script) { for (const [sec, inp] of script) { const n = Math.round(sec / FIXED); for (let i = 0; i < n; i++) step(FIXED, { ...ZERO, ...inp, jump: i === 0 && !!inp.jump, dash: i === 0 && !!inp.dash, light: i === 0 && !!inp.light, heavy: i === 0 && !!inp.heavy, bash: i === 0 && !!inp.bash, pound: i === 0 && !!inp.pound }); } return { ...player.pos }; },
  teleport(x, y, z) { player.body.pos.x = x; player.body.pos.y = y; player.body.pos.z = z; player.body.vel.x = player.body.vel.y = player.body.vel.z = 0; player.body.syncAabb(); player.state = S.IDLE; player.t = 0; player.hp = P.hp; player.iframes = 0; game.bolts.length = 0; document.getElementById('dead').classList.remove('show'); cam.target.set(x, y + 1.2, z); },
  state() { return { pos: { ...player.pos }, vel: { ...player.body.vel }, grounded: player.body.grounded, state: player.state, hp: player.hp, enemies: game.enemies.filter(e => !e.dead).map(e => ({ kind: e.kind, hp: e.hp, state: e.state, pos: { ...e.pos } })), checkpoint: game.checkpoint, won: game.won, time: game.time }; },
};
