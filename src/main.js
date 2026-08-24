import * as THREE from '../vendor/three.module.js';
import { World, overlap, Box } from './physics.js';
import { Player, P, S } from './player.js';
import { Enemy, Bolt, Bomb, E } from './enemies.js';
import { buildLevel, updatePlatforms } from './level.js';
import { buildLevel2 } from './level2.js';
import { buildLevel3 } from './level3.js';
import { ChaseCam } from './camera.js';
import { knightRig, gruntRig, boxesMesh, MAT } from './voxel.js';
import { Audio, Music } from './audio.js';

const FIXED = 1 / 120;
const VALE = { '2': 2, '3': 3 }[new URLSearchParams(location.search).get('vale')] || 1;

// ---------------- settings (persisted) ----------------
const SETTINGS_DEFAULT = { volume: 0.5, music: 0.35, sens: 1.0, invertY: false, shake: true, fov: 62, shadows: 'soft', pixelRatio: 1, glows: true, particles: 1, grade: 'dusk', reduceMotion: false, dmgNumbers: true, camDist: 1, hudScale: 1, timer: false, touchSize: 1, leftHanded: false };
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
  const top = new THREE.Color(VALE === 3 ? '#3a6ab8' : VALE === 2 ? '#0a0918' : '#1d1630'), mid = new THREE.Color(VALE === 3 ? '#88aede' : VALE === 2 ? '#242040' : '#7a3a3e'), hor = new THREE.Color(VALE === 3 ? '#f0d8a8' : VALE === 2 ? '#51406a' : '#e8884a');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 260; const c = new THREE.Color();
    if (y > 0.12) c.copy(mid).lerp(top, Math.min(1, (y - 0.12) / 0.7)); else c.copy(hor).lerp(mid, Math.max(0, Math.min(1, (y + 0.05) / 0.17)));
    cols.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
}

if (VALE === 2) {
  scene.background = new THREE.Color('#141020'); scene.fog.color.set('#221c30'); scene.fog.near = 30; scene.fog.far = 120;
  hemi.color.set('#7a86b8'); hemi.groundColor.set('#2c2834'); hemi.intensity = 1.9;
  sun.color.set('#9ab0e0'); sun.intensity = 1.1;
}
if (VALE === 3) {
  scene.background = new THREE.Color('#a8c4e8'); scene.fog.color.set('#b8cce8'); scene.fog.near = 55; scene.fog.far = 175;
  hemi.color.set('#e8f0ff'); hemi.groundColor.set('#8a9a78'); hemi.intensity = 3.1;
  sun.color.set('#fff2d8'); sun.intensity = 2.6; sun.position.set(24, 62, -12);
}
// sun disc low on the horizon (north, behind the gate)
{
  const disc = new THREE.Mesh(new THREE.CircleGeometry(VALE === 2 ? 11 : VALE === 3 ? 13 : 16, 32), new THREE.MeshBasicMaterial({ color: VALE === 2 ? '#e8ecff' : VALE === 3 ? '#fff8e8' : '#fff2d8', fog: false, transparent: true, opacity: 0.98 }));
  disc.position.set(40, VALE === 3 ? 60 : 10, 240); disc.lookAt(0, 0, 0); scene.add(disc);
  for (const [r, op, col, dz] of (VALE === 3 ? [[26, 0.35, '#fff0c8', 2], [56, 0.16, '#ffe0a8', 4], [96, 0.08, '#e8d0a0', 6]] : VALE === 2 ? [[22, 0.3, '#c8d4f8', 2], [44, 0.14, '#8a9ae0', 4], [80, 0.07, '#5a6ab0', 6]] : [[34, 0.4, '#ffd9a0', 2], [64, 0.22, '#ff9a4a', 4], [110, 0.12, '#e8683a', 6]])) {
    const glow = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshBasicMaterial({ color: col, fog: false, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.position.set(40, VALE === 3 ? 60 : 10, 240 - dz); glow.lookAt(0, 0, 0); scene.add(glow);
  }
  // horizon haze band all around
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(252, 252, 60, 32, 1, true), new THREE.MeshBasicMaterial({ color: VALE === 3 ? '#d8e4f4' : VALE === 2 ? '#2c2848' : '#d88a5a', fog: false, transparent: true, opacity: VALE === 3 ? 0.3 : VALE === 2 ? 0.34 : 0.28, side: THREE.BackSide, depthWrite: false }));
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
const L = VALE === 3 ? buildLevel3(world) : VALE === 2 ? buildLevel2(world) : buildLevel(world);
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
const smokeSrc = VALE !== 1 ? L.torches.slice(0, 4).map(t => ({ x: t.x, y: t.y, z: t.z })) : [{ x: 2, y: -23, z: -80 }, { x: -25.5, y: 3.6, z: 20 }, { x: -27, y: 2.2, z: 21 }, { x: -12, y: 2, z: 0 }, { x: 12, y: 2, z: 0 }];
for (let i = 0; i < SMOKE; i++) { const sdx = smokeSrc[i % smokeSrc.length]; smokePos[i * 3] = sdx.x; smokePos[i * 3 + 1] = sdx.y + Math.random() * 12; smokePos[i * 3 + 2] = sdx.z; smokeAge[i] = Math.random() * 8; }
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
// ambient life: butterflies in the meadow, leaves near oaks, campfire flames, a waterfall
const FLUT = 10; const flutGeo = new THREE.BufferGeometry(); const flutPos = new Float32Array(FLUT * 3); flutGeo.setAttribute('position', new THREE.BufferAttribute(flutPos, 3));
const flutter = new THREE.Points(flutGeo, new THREE.PointsMaterial({ color: '#e8d060', size: 0.22, map: softTex, transparent: true, depthWrite: false })); scene.add(flutter);
const LEAF = 16; const leafGeo = new THREE.BufferGeometry(); const leafPos = new Float32Array(LEAF * 3); const leafSeed = new Float32Array(LEAF); for (let i = 0; i < LEAF; i++) leafSeed[i] = Math.random() * 100;
leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
const leaves = new THREE.Points(leafGeo, new THREE.PointsMaterial({ color: '#7a9a4a', size: 0.18, map: softTex, transparent: true, depthWrite: false })); scene.add(leaves);
const fireGlow = addGlow(scene, '#ff9a3a', 5, 0.0); fireGlow.position.set(2, -22.6, -80); fireGlow.visible = VALE === 1;
const flameMesh = boxesMesh([{ x: 0, y: 0.35, z: 0, w: 0.5, h: 0.7, d: 0.5, c: '#ffb040' }, { x: 0, y: 0.8, z: 0, w: 0.26, h: 0.4, d: 0.26, c: '#ffe08a' }], { shadow: false, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }) });
flameMesh.position.set(2, -23.55, -80); flameMesh.visible = VALE === 1; scene.add(flameMesh);
// waterfall: thin animated sheet where the west-bank stream would spill into the gully
const fallMat = new THREE.MeshBasicMaterial({ color: '#8fc0da', transparent: true, opacity: 0.5, depthWrite: false });
const fall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.6), fallMat); fall.position.set(-10.1, -32.6, -114); fall.rotation.y = Math.PI / 2; fall.visible = VALE === 1; scene.add(fall);
const fallFoam = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), new THREE.MeshBasicMaterial({ color: '#dceef8', transparent: true, opacity: 0.55, depthWrite: false }));
fallFoam.rotation.x = -Math.PI / 2; fallFoam.position.set(-10.8, -34.68, -114); fallFoam.visible = VALE === 1; scene.add(fallFoam);
// ---------------- sky island atmosphere ----------------
// clouds BELOW the vale: the whole level floats above a slow sea of cloud
const underClouds = [];
{
  const tint = VALE === 3 ? '#f4f0e6' : VALE === 2 ? '#2e2a44' : '#e8ae8a';
  const op = VALE === 3 ? 0.72 : VALE === 2 ? 0.5 : 0.62;
  for (let i = 0; i < 14; i++) {
    const grp = new THREE.Group();
    const ca = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const cr = 52 + Math.random() * 105;
    grp.position.set(Math.cos(ca) * cr, -52 - Math.random() * 34, Math.sin(ca) * cr - 40);
    const n = 3 + (i % 3);
    for (let j = 0; j < n; j++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: tint, transparent: true, opacity: op * (0.6 + Math.random() * 0.4), depthWrite: false, fog: false }));
      const w = 16 + Math.random() * 20;
      sp.scale.set(w, w * 0.38, 1);
      sp.position.set((Math.random() - 0.5) * w * 0.9, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * w * 0.5);
      grp.add(sp);
    }
    scene.add(grp);
    underClouds.push({ grp, speed: 1.1 + Math.random() * 1.6 });
  }
}
// distant floating islets: other shards of the torn earth, adrift
const islets = [];
{
  const rockC = VALE === 3 ? '#8a8fa0' : VALE === 2 ? '#2c2836' : '#4a4442', rockD = VALE === 3 ? '#6e7484' : VALE === 2 ? '#221e2c' : '#3a3634';
  const topC = VALE === 3 ? '#8fae6a' : VALE === 2 ? '#4a3440' : '#5c7a38';
  for (let i = 0; i < 5; i++) {
    const a2 = i * 1.35 + 0.6, r2 = 120 + i * 16;
    const bx = [];
    const w = 9 + (i % 3) * 4;
    bx.push({ x: 0, y: 0, z: 0, w, h: 1.2, d: w * 0.8, c: topC });
    bx.push({ x: 0, y: -1.6, z: 0, w: w * 0.8, h: 2.2, d: w * 0.62, c: rockC });
    bx.push({ x: 0.8, y: -3.6, z: -0.5, w: w * 0.5, h: 2.4, d: w * 0.4, c: rockD });
    bx.push({ x: -0.5, y: -5.4, z: 0.4, w: w * 0.26, h: 2.2, d: w * 0.2, c: rockC });
    if (i % 2 === 0) { bx.push({ x: -w * 0.24, y: 1.6, z: 0.6, w: 0.7, h: 2.2, d: 0.7, c: '#3a3026' }); bx.push({ x: -w * 0.24, y: 3.4, z: 0.6, w: 2.6, h: 2.2, d: 2.6, c: VALE === 2 ? '#3a2c34' : '#3e5c2a' }); }
    if (i === 2) { bx.push({ x: w * 0.2, y: 2.2, z: -0.8, w: 1.6, h: 4.4, d: 1.6, c: rockD }); bx.push({ x: w * 0.2, y: 4.6, z: -0.8, w: 2.2, h: 0.7, d: 2.2, c: rockC }); }
    const m = boxesMesh(bx, { shadow: false });
    m.position.set(Math.cos(a2) * r2, -18 + i * 11 - 20, Math.sin(a2) * r2 - 30);
    scene.add(m);
    islets.push({ m, baseY: m.position.y, ph: i * 2.1 });
  }
}
// air motes around the player: dusk pollen in the Vale, drifting ash on the moor
const MOTES = 90;
const moteGeo = new THREE.BufferGeometry(); const motePos = new Float32Array(MOTES * 3); const moteSeed = new Float32Array(MOTES);
for (let i = 0; i < MOTES; i++) { motePos[i * 3] = L.start.x + (Math.random() - 0.5) * 30; motePos[i * 3 + 1] = L.start.y + Math.random() * 7; motePos[i * 3 + 2] = L.start.z + (Math.random() - 0.5) * 30; moteSeed[i] = Math.random() * 100; }
moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const motes = new THREE.Points(moteGeo, VALE !== 1
  ? new THREE.PointsMaterial({ color: VALE === 3 ? '#fff4d0' : '#b8b4ac', size: 0.12, map: softTex, transparent: true, opacity: 0.55, depthWrite: false })
  : new THREE.PointsMaterial({ color: '#ffe9a0', size: 0.1, map: softTex, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(motes);
// fireflies by the gully water and the grotto mouth (Vale 1, two blink phases)
const fireflyClouds = [];
if (VALE === 1) {
  for (const [cx, cy, cz, rr, ph] of [[6, -33.6, -114, 9, 0], [-21, -33.8, -114, 4, 1.7], [16, -33.4, -113, 6, 3.1]]) {
    const n = 10; const g2 = new THREE.BufferGeometry(); const pp = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pp[i * 3] = cx + (Math.random() - 0.5) * rr; pp[i * 3 + 1] = cy + Math.random() * 1.6; pp[i * 3 + 2] = cz + (Math.random() - 0.5) * 4; }
    g2.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(g2, new THREE.PointsMaterial({ color: '#c8ff6a', size: 0.16, map: softTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(pts); fireflyClouds.push({ pts, pp, g2, cx, cy, cz, rr, ph });
  }
}
// waterfall mist: cool spray climbing from the plunge pool
const MIST = 18; const mistGeo = new THREE.BufferGeometry(); const mistPos = new Float32Array(MIST * 3); const mistAge = new Float32Array(MIST);
for (let i = 0; i < MIST; i++) { mistPos[i * 3] = -10.8 + (Math.random() - 0.5) * 2.6; mistPos[i * 3 + 1] = -34.6; mistPos[i * 3 + 2] = -114 + (Math.random() - 0.5) * 3; mistAge[i] = Math.random() * 1.8; }
mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
const mist = new THREE.Points(mistGeo, new THREE.PointsMaterial({ color: '#cfe6f2', size: 1.1, map: softTex, transparent: true, opacity: 0.22, depthWrite: false }));
mist.visible = VALE === 1; scene.add(mist);
// ember geysers on the moor: cracks that breathe sparks (visual only)
const geysers = [];
if (VALE === 2) {
  for (const [gx, gy, gz, ph] of [[12, -30, -28, 0], [-14, -30, 4, 1.4], [6, -26, 36, 2.7]]) {
    const n = 20; const g2 = new THREE.BufferGeometry(); const pp = new Float32Array(n * 3); const ages = new Float32Array(n);
    for (let i = 0; i < n; i++) { pp[i * 3] = gx; pp[i * 3 + 1] = gy; pp[i * 3 + 2] = gz; ages[i] = Math.random() * 1.2; }
    g2.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(g2, new THREE.PointsMaterial({ color: '#ff9a3a', size: 0.3, map: softTex, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(pts);
    const glow = addGlow(scene, '#ff6a2a', 4.5, 0.0); glow.position.set(gx, gy + 0.15, gz); glow.rotation.x = -Math.PI / 2;
    geysers.push({ pts, pp, g2, ages, gx, gy, gz, ph, glow });
  }
}
// wind streams: visible streaks for gusts and updrafts
const windFx = [];
if (L.winds) for (const w of L.winds) {
  const n = 14; const g2 = new THREE.BufferGeometry(); const pp = new Float32Array(n * 3); const ages = new Float32Array(n);
  for (let i = 0; i < n; i++) { pp[i * 3] = w.x; pp[i * 3 + 1] = w.y; pp[i * 3 + 2] = w.z; ages[i] = Math.random(); }
  g2.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  const pts = new THREE.Points(g2, new THREE.PointsMaterial({ color: '#e8f2ff', size: 0.22, map: softTex, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts); windFx.push({ w, pts, pp, g2, ages });
}
function updateAtmos(dt) {
  const t = game.time;
  for (let i = 0; i < CROWS; i++) { const k = i * 3; const c = i < 8 ? { x: L.tower.x, y: L.topY + 6, z: L.tower.z, r: 9 } : { x: (i % 2 ? 30 : -30), y: 15, z: 32, r: 6 }; const a = t * (0.35 + (i % 3) * 0.1) + i * 1.3; crowPos[k] = c.x + Math.cos(a) * (c.r + (i % 4)); crowPos[k + 1] = c.y + Math.sin(t * 0.9 + i) * 1.5 + (i % 3); crowPos[k + 2] = c.z + Math.sin(a) * (c.r + (i % 4)); }
  crowGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < FLUT; i++) { const k = i * 3; const a = t * (0.5 + (i % 4) * 0.13) + i * 2.1; flutPos[k] = L.start.x - 10 + Math.cos(a) * (10 + (i % 5) * 3) + Math.sin(t * 1.7 + i) * 2; flutPos[k + 1] = L.start.y + 0.9 + Math.sin(t * 2.2 + i * 1.3) * 0.8 + (i % 3) * 0.4; flutPos[k + 2] = L.start.z + 8 + Math.sin(a * 0.8) * 10; }
  flutGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < LEAF && L.trees.length; i++) { const k = i * 3; const cyc = ((t * 0.24 + leafSeed[i]) % 6) / 6; const tree = L.trees[i % L.trees.length]; leafPos[k] = tree.x + Math.sin(t * 1.1 + leafSeed[i]) * 1.4; leafPos[k + 1] = tree.y + 3.2 - cyc * 3.4; leafPos[k + 2] = tree.z + Math.cos(t * 0.9 + leafSeed[i]) * 1.4; }
  leafGeo.attributes.position.needsUpdate = true;
  for (const fm of beaconFlames) fm.scale.set(1 + Math.sin(t * 12 + fm.position.x) * 0.15, 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(t * 9 + fm.position.z)), 1);
  flameMesh.scale.set(1 + Math.sin(t * 13) * 0.15, 0.85 + 0.3 * (0.5 + 0.5 * Math.sin(t * 9.7)), 1 + Math.cos(t * 11) * 0.15); flameMesh.rotation.y = t * 2;
  fireGlow.material.opacity = 0.35 + 0.12 * Math.sin(t * 10.3); fireGlow.lookAt(camera.position);
  fallMat.opacity = 0.42 + 0.12 * (0.5 + 0.5 * Math.sin(t * 6.1)); fall.position.y = -32.6 + Math.sin(t * 12) * 0.05;
  for (let i = 0; i < EMBERS; i++) { const e = emberVel[i]; e.life -= dt; const k = i * 3; emberPos[k + 1] += dt * (0.8 + (i % 5) * 0.2); emberPos[k] += Math.sin(t * 2 + i) * dt * 0.4; emberPos[k + 2] += Math.cos(t * 1.7 + i * 0.3) * dt * 0.4; if (e.life <= 0) { e.life = 1.5 + Math.random() * 2.5; emberPos[k] = e.t.x + (Math.random() - 0.5) * 0.4; emberPos[k + 1] = e.t.y; emberPos[k + 2] = e.t.z + (Math.random() - 0.5) * 0.4; } }
  emberGeo.attributes.position.needsUpdate = true;
  for (let i = 0; i < SMOKE; i++) { const k = i * 3; smokeAge[i] += dt; smokePos[k + 1] += dt * 1.4; smokePos[k] += dt * (0.6 + Math.sin(t * 0.5 + i) * 0.3); if (smokeAge[i] > 9) { const sdx = smokeSrc[i % smokeSrc.length]; smokeAge[i] = 0; smokePos[k] = sdx.x; smokePos[k + 1] = sdx.y; smokePos[k + 2] = sdx.z; } }
  smokeGeo.attributes.position.needsUpdate = true;
  // wind streams
  for (const wf of windFx) {
    const w = wf.w; const on = w.isOn === undefined ? true : w.isOn;
    wf.pts.material.opacity = on ? 0.6 : 0.12;
    for (let i = 0; i < 14; i++) { const k = i * 3; wf.ages[i] += dt * (on ? 1 : 0.3);
      if (w.up) { wf.pp[k + 1] += dt * (on ? 9 : 2); if (wf.pp[k + 1] > w.y + w.h) { wf.ages[i] = 0; wf.pp[k] = w.x + (Math.random() - 0.5) * w.r * 1.4; wf.pp[k + 1] = w.y - w.h; wf.pp[k + 2] = w.z + (Math.random() - 0.5) * w.r * 1.4; } }
      else { wf.pp[k] += (w.dx || 0) * dt * (on ? 13 : 2); wf.pp[k + 2] += (w.dz || 0) * dt * (on ? 13 : 2); if (wf.ages[i] > 1.1) { wf.ages[i] = 0; wf.pp[k] = w.x - (w.dx || 0) * w.r + (Math.random() - 0.5) * 3; wf.pp[k + 1] = w.y - w.h * 0.5 + Math.random() * w.h; wf.pp[k + 2] = w.z - (w.dz || 0) * w.r + (Math.random() - 0.5) * 3; } }
    }
    wf.g2.attributes.position.needsUpdate = true;
  }
  // gust audio when a wind is pushing us
  if (game.windActive && !game.windActive.up) { game.gustT = (game.gustT || 0) - dt; if (game.gustT <= 0) { game.gustT = 0.5; audio.whoosh(0.5, 0.12, 200, 900); } }
  // undercloud drift (wrap on a big ring)
  for (const uc of underClouds) { uc.grp.position.x += uc.speed * dt; if (uc.grp.position.x > 175) uc.grp.position.x = -175; }
  // islet bob
  for (const il of islets) il.m.position.y = il.baseY + Math.sin(t * 0.12 + il.ph) * 2.2;
  // air motes: recycle around the player
  { const px = player.pos.x, py = player.pos.y, pz = player.pos.z; const on = SET.particles > 0; motes.visible = on;
    if (on) { for (let i = 0; i < MOTES; i++) { const k = i * 3;
      if (VALE === 2) { motePos[k + 1] -= dt * (0.35 + (i % 4) * 0.1); motePos[k] += Math.sin(t * 0.7 + moteSeed[i]) * dt * 0.5; }
      else if (VALE === 3) { motePos[k] += dt * 1.6; motePos[k + 1] += Math.sin(t * 1.1 + moteSeed[i]) * dt * 0.5; }
      else { motePos[k + 1] += Math.sin(t * 0.9 + moteSeed[i]) * dt * 0.35; motePos[k] += dt * 0.3 + Math.sin(t * 0.6 + moteSeed[i]) * dt * 0.3; motePos[k + 2] += Math.cos(t * 0.5 + moteSeed[i]) * dt * 0.3; }
      const dx = motePos[k] - px, dy = motePos[k + 1] - py, dz2 = motePos[k + 2] - pz;
      if (dx * dx + dz2 * dz2 > 340 || dy < -9 || dy > 12) { motePos[k] = px + (Math.random() - 0.5) * 32; motePos[k + 1] = py + Math.random() * 8 - 1; motePos[k + 2] = pz + (Math.random() - 0.5) * 32; }
    } moteGeo.attributes.position.needsUpdate = true; } }
  // fireflies: slow wander, phased blink
  for (const fc of fireflyClouds) {
    fc.pts.material.opacity = Math.max(0, Math.sin(t * 0.9 + fc.ph)) * 0.85;
    for (let i = 0; i < 10; i++) { const k = i * 3; fc.pp[k] += Math.sin(t * 0.8 + i * 2.2 + fc.ph) * dt * 0.5; fc.pp[k + 1] = fc.cy + 0.8 + Math.sin(t * 1.3 + i * 1.7) * 0.7; fc.pp[k + 2] += Math.cos(t * 0.7 + i * 1.9) * dt * 0.4; }
    fc.g2.attributes.position.needsUpdate = true;
  }
  // waterfall mist
  if (mist.visible) { for (let i = 0; i < MIST; i++) { const k = i * 3; mistAge[i] += dt; mistPos[k + 1] += dt * 1.1; mistPos[k] += Math.sin(t + i) * dt * 0.3; if (mistAge[i] > 1.9) { mistAge[i] = 0; mistPos[k] = -10.8 + (Math.random() - 0.5) * 2.6; mistPos[k + 1] = -34.6; mistPos[k + 2] = -114 + (Math.random() - 0.5) * 3; } } mistGeo.attributes.position.needsUpdate = true; }
  // ember geysers: 1.4s breath every ~4.5s
  for (const gy2 of geysers) {
    const cyc = (t * 0.22 + gy2.ph) % 1; const active = cyc < 0.31; const k2 = active ? (cyc / 0.31) : 0;
    gy2.glow.material.opacity = active ? 0.5 * Math.sin(k2 * Math.PI) + 0.08 : 0.08 + 0.04 * Math.sin(t * 7 + gy2.ph);
    for (let i = 0; i < 20; i++) { const k = i * 3; gy2.ages[i] += dt;
      if (active) { gy2.pp[k + 1] += dt * (4.5 + (i % 5)); gy2.pp[k] += Math.sin(t * 3 + i) * dt * 0.6; }
      else gy2.pp[k + 1] += dt * 0.4;
      if (gy2.ages[i] > (active ? 0.8 : 2.2) || gy2.pp[k + 1] > gy2.gy + 6) { gy2.ages[i] = Math.random() * 0.4; gy2.pp[k] = gy2.gx + (Math.random() - 0.5) * 0.8; gy2.pp[k + 1] = gy2.gy; gy2.pp[k + 2] = gy2.gz + (Math.random() - 0.5) * 0.8; }
    }
    gy2.g2.attributes.position.needsUpdate = true;
  }
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
const CRESTS = VALE === 3 ? [
  { key: 'stair', name: 'CLIMB THE SKY STAIR', hint: 'islet to islet, north' },
  { key: 'gale', name: 'RIDE THE GALE', hint: 'the spire vent blows up' },
  { key: 'undercroft', name: 'THE UNDERCROFT', hint: 'descend inside the island' },
  { key: 'pennants', name: 'EIGHT SKY PENNANTS', hint: 'strung across the isles' },
] : VALE === 2 ? [
  { key: 'captain', name: 'FELL THE EMBER MARSHAL', hint: 'the broken spire' },
  { key: 'beacons', name: 'RELIGHT THE FIVE BEACONS', hint: 'cold braziers on the moor' },
  { key: 'pennants', name: 'EIGHT SCORCHED PENNANTS', hint: 'across the Embermoor' },
  { key: 'peaks', name: 'CROSS THE VOID CHAIN', hint: 'floating stones to the west' },
] : [
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
  for (const sh of shardMeshes) { if (sh.got) continue; sh.m.rotation.y += dt * 3;
    { const dx = player.pos.x - sh.c.x, dy2 = player.pos.y + 0.8 - sh.c.y, dz = player.pos.z - sh.c.z; const d2 = Math.hypot(dx, dy2, dz); if (d2 < 4.2 && d2 > 0.01) { const pull = (1 - d2 / 4.2) * 10 * dt; sh.c.x += dx / d2 * pull; sh.c.y += dy2 / d2 * pull * 0.7; sh.c.z += dz / d2 * pull; sh.m.position.x = sh.c.x; sh.m.position.z = sh.c.z; } }
    sh.m.position.y = sh.c.y + 0.6 + Math.sin(game.time * 2.6 + sh.c.x) * 0.1; if (Math.hypot(sh.c.x - player.pos.x, sh.c.z - player.pos.z) < 1.3 && Math.abs(sh.c.y + 0.6 - player.pos.y) < 2) { sh.got = true; sh.m.visible = false; game.shards = (game.shards || 0) + 1; audio.tone(880 + (game.shards % 5) * 90, 1200 + (game.shards % 5) * 90, 0.09, 'sine', 0.1); if (game.shards % 5 === 0) saveGame(); spawnFx('parry', { x: sh.c.x, y: sh.c.y + 0.6, z: sh.c.z }, 5); if (game.shards >= 30 && !(game.crestsGot || {}).shards) { game.crestsGot = game.crestsGot || {}; game.crestsGot.shards = true; game.crests = Object.keys(game.crestsGot).length; crestGet('shards'); } } }
  for (const pn of pennantMeshes) { if (pn.got) continue; pn.m.rotation.y += dt * 2.4; if (Math.hypot(pn.c.x - player.pos.x, pn.c.z - player.pos.z) < 1.3 && Math.abs(pn.c.y + 0.8 - player.pos.y) < 2) { pn.got = true; pn.m.visible = false; game.pennants = (game.pennants || 0) + 1; audio.play('ui'); shockRing({ x: pn.c.x, y: pn.c.y + 1, z: pn.c.z }, '#ff6a5a', 0.85); audio.tone(660 + game.pennants * 40, 900 + game.pennants * 40, 0.12, 'triangle', 0.1); spawnFx('hit', { x: pn.c.x, y: pn.c.y + 1, z: pn.c.z }, 10); toast('Pennant ' + game.pennants + ' of 8', 1.6); saveGame(); if (game.pennants >= 8) { spawnCrest('pennants', L.shrine.x, L.shrine.y, L.shrine.z); toast('The shrine kindles ' + '\u2014' + ' a crest rises in the meadow', 4); } } }
  for (const h of heartMeshes) { h.cd = Math.max(0, h.cd - dt); h.m.visible = h.cd <= 0; if (h.cd <= 0) { h.m.rotation.y += dt * 2.4; if (player.hp < P.hp && Math.hypot(h.c.x - player.pos.x, h.c.z - player.pos.z) < 1.2 && Math.abs(h.c.y + 0.6 - player.pos.y) < 1.6) { h.cd = 30; player.hp = Math.min(P.hp, player.hp + 1); audio.play('heart'); audio.play('checkpoint'); shockRing({ x: h.c.x, y: h.c.y + 0.8, z: h.c.z }, '#7ae08a', 0.8); spawnFx('hurt', { x: h.c.x, y: h.c.y + 0.8, z: h.c.z }, 8); floatText({ x: h.c.x, y: h.c.y + 1.4, z: h.c.z }, '+1', 'big gold'); } } }
  document.getElementById('crests').textContent = '\u2726 ' + (game.crests || 0) + '/8';
  document.getElementById('pennantsHud').textContent = '\u25b8 ' + (game.pennants || 0) + '/8';
  document.getElementById('shardsHud').textContent = '\u2b26 ' + (game.shards || 0) + '/30';
}
// hall banners: one kindles per crest earned
const hallBannerMeshes = [];
for (const hb of (L.hallBanners || [])) { const m = boxesMesh([{ x: 0, y: 0, z: 0, w: 1.3, h: 2.6, d: 0.08, c: '#4e2a30' }, { x: 0, y: 0.2, z: 0.05, w: 0.5, h: 0.6, d: 0.02, c: '#3a2226' }, { x: 0, y: -1.15, z: 0, w: 1.3, h: 0.3, d: 0.09, c: '#5a4630' }], { shadow: false }); m.position.set(hb.x, hb.y, hb.z + hb.face * 0.35); scene.add(m); hallBannerMeshes.push({ m, hb, lit: false }); }
// THE CREST DOOR (vale 1): sealed until five crests; opens onto Skyreach
let doorLeafL = null, doorLeafR = null, doorSeal = null, doorBox = null, doorOpen = false;
if (VALE === 1 && L.crestDoor) {
  const D = L.crestDoor;
  const mkLeaf = (side) => {
    const gld = new THREE.Group();
    gld.add(boxesMesh([
      { x: side * 0.72, y: 2.05, z: 0, w: 1.44, h: 4.1, d: 0.3, c: '#5e462c' },
      { x: side * 0.72, y: 2.05, z: 0.17, w: 0.13, h: 4.1, d: 0.05, c: '#c9a24a' },
      { x: side * 0.72, y: 0.35, z: 0.17, w: 1.4, h: 0.16, d: 0.05, c: '#c9a24a' },
      { x: side * 0.72, y: 3.8, z: 0.17, w: 1.4, h: 0.16, d: 0.05, c: '#c9a24a' },
    ]));
    gld.position.set(D.x + side * -1.44, D.y, D.z); scene.add(gld); return gld;
  };
  doorLeafL = mkLeaf(1); doorLeafR = mkLeaf(-1);
  doorBox = world.add(new Box(D.x, D.y, D.z, 2.9, 4.4, 0.5, {}));
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#1a1626'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e3c070'; g.lineWidth = 5; g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#e3c070'; g.font = '44px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('\u2726', 44, 58); g.font = 'bold 46px Georgia'; g.fillText('5', 88, 60);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  doorSeal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  doorSeal.position.set(D.x, D.y + 2.1, D.z + 0.28); scene.add(doorSeal);
}
// M64-style opening: the camera sweeps the length of the vale, then finds the knight in the hall
const INTRO_KEYS = [
  { p: [0, -12, -175], l: [0, -28, -140] },
  { p: [-16, -14, -128], l: [0, -26, -108] },
  { p: [18, -8, -94], l: [-2, -20, -70] },
  { p: [22, 0, -56], l: [-18, -4, -58] },
  { p: [10, 13, -28], l: [0, 3, 12] },
  { p: [12, 6, 6], l: [31, 1.5, -2] },
  { p: [30.4, 2.8, -2], l: [40, 1.3, -2] },
];
function startIntro() {
  game.intro = { t: 0, dur: (INTRO_KEYS.length - 1) * 1.7 };
  toast('PENNANT VALE', 4.5);
  setTimeout(() => { if (game.intro) say('The war is over. The Vale drifts in the evening sky \u2014 and its eight crests are scattered.', 6); }, 1600);
}
function endIntro() { if (!game.intro) return; game.intro = null; cam.yaw = Math.PI * 0.5; cam.pitch = 0.3; cam.idle = 0; cam.target.set(player.pos.x, player.pos.y + 1.2, player.pos.z); toast('Reclaim the crests. The war table awaits your first five.', 4); setTimeout(() => { if (!game.boardOpen) showBoard(true); }, 800); }
addEventListener('keydown', () => { if (game.intro && game.intro.t > 0.8) endIntro(); });
addEventListener('mousedown', () => { if (game.intro && game.intro.t > 0.8) endIntro(); });
function updateIntro(dt) {
  const it = game.intro; if (!it) return;
  it.t += dt;
  const T = Math.min(it.t / 1.7, INTRO_KEYS.length - 1.0001);
  const i = Math.floor(T); const f = T - i; const e2 = f * f * (3 - 2 * f);
  const a = INTRO_KEYS[i], b2 = INTRO_KEYS[Math.min(i + 1, INTRO_KEYS.length - 1)];
  camera.position.set(a.p[0] + (b2.p[0] - a.p[0]) * e2, a.p[1] + (b2.p[1] - a.p[1]) * e2, a.p[2] + (b2.p[2] - a.p[2]) * e2);
  camera.lookAt(a.l[0] + (b2.l[0] - a.l[0]) * e2, a.l[1] + (b2.l[1] - a.l[1]) * e2, a.l[2] + (b2.l[2] - a.l[2]) * e2);
  if (it.t >= it.dur + 0.6) endIntro();
}
function setDoorOpen() { doorOpen = true; if (doorBox) doorBox.enabled = false; if (doorLeafL) { doorLeafL.rotation.y = -1.95; doorLeafR.rotation.y = 1.95; } if (doorSeal) doorSeal.visible = false; }
function updateDoor(dt) {
  if (game.doorShake > 0) { game.doorShake -= dt; const j = game.doorShake * 0.06; doorLeafL.position.x = L.crestDoor.x - 1.44 + (Math.random() - 0.5) * j; doorLeafR.position.x = L.crestDoor.x + 1.44 + (Math.random() - 0.5) * j; }
  if (game.doorAnim === undefined) return;
  game.doorAnim += dt; const t2 = game.doorAnim;
  if (doorSeal && doorSeal.visible) { doorSeal.rotation.z -= dt * (2 + t2 * 7); doorSeal.position.y = L.crestDoor.y + 2.1 + Math.max(0, t2 - 0.35) * 3.2; doorSeal.material.opacity = Math.max(0, 1 - Math.max(0, t2 - 0.9) * 2.2); if (doorSeal.material.opacity <= 0) doorSeal.visible = false; }
  const k = Math.max(0, Math.min(1, (t2 - 1.05) / 0.9)); const e2 = 1 - Math.pow(1 - k, 3);
  doorLeafL.rotation.y = -1.95 * e2; doorLeafR.rotation.y = 1.95 * e2;
  if (k > 0.1 && doorBox) doorBox.enabled = false;
  if (t2 > 1.1 && t2 - dt <= 1.1) { audio.play('break'); shockRing({ x: L.crestDoor.x, y: L.crestDoor.y + 2.2, z: L.crestDoor.z }, '#ffd27a', 1.4); }
  if (t2 > 2.4 && !game.doorTravelled) { game.doorTravelled = true; game.flash = 1; travel(3); }
}
let trophyMeshes = [];
function refreshTrophies() {
  if (!L.trophies) return;
  for (const m of trophyMeshes) scene.remove(m); trophyMeshes = [];
  for (const tr of L.trophies) {
    let earned = false;
    if (tr.key === 'captain') earned = !!(game.crestsGot || {}).captain;
    if (tr.key === 'marshal') { try { const d2 = JSON.parse(localStorage.getItem('rampart_save_' + SLOT + '_v2') || 'null'); earned = !!(d2 && d2.crestsGot && d2.crestsGot.captain); } catch (e) {} }
    if (!earned) continue;
    const m = tr.key === 'captain'
      ? boxesMesh([{ x: 0, y: 0.22, z: 0, w: 0.44, h: 0.44, d: 0.44, c: '#2a2a33' }, { x: 0, y: 0.5, z: 0, w: 0.5, h: 0.12, d: 0.5, c: '#d8b050' }, { x: -0.14, y: 0.62, z: 0, w: 0.1, h: 0.3, d: 0.1, c: '#d8b050' }, { x: 0.14, y: 0.62, z: 0, w: 0.1, h: 0.3, d: 0.1, c: '#d8b050' }, { x: 0, y: 0.16, z: 0.23, w: 0.34, h: 0.09, d: 0.02, c: '#1a1a22' }])
      : boxesMesh([{ x: 0, y: 0.2, z: 0, w: 0.4, h: 0.4, d: 0.4, c: '#3a2c34' }, { x: 0, y: 0.14, z: 0.21, w: 0.3, h: 0.08, d: 0.02, c: '#ff6a2a' }, { x: 0, y: 0.52, z: 0, w: 0.18, h: 0.24, d: 0.18, c: '#ff9a3a' }]);
    m.position.set(tr.x, tr.y, tr.z); scene.add(m); trophyMeshes.push(m);
    if (tr.key === 'marshal') addGlow(m, '#ff6a2a', 1.6, 0.4).position.y = 0.5;
  }
}
function refreshHallBanners() {
  const n = game.crests || 0;
  for (let i = 0; i < hallBannerMeshes.length; i++) { const b = hallBannerMeshes[i]; if (i < n && !b.lit) { b.lit = true; scene.remove(b.m); const m = boxesMesh([{ x: 0, y: 0, z: 0, w: 1.3, h: 2.6, d: 0.08, c: '#8a2d2d' }, { x: 0, y: 0.2, z: 0.06 * b.hb.face, w: 0.55, h: 0.7, d: 0.03, c: '#e3c070' }, { x: 0, y: -1.15, z: 0, w: 1.3, h: 0.3, d: 0.09, c: '#c9a24a' }], { shadow: false }); m.position.set(b.hb.x, b.hb.y, b.hb.z + b.hb.face * 0.35); scene.add(m); b.m = m; } }
}
// THE SQUIRE: the race rival waiting in the meadow
const squireRig = gruntRig('defender'); if (L.race) { scene.add(squireRig); squireRig.position.set(L.race.start.x, L.race.start.y, L.race.start.z); }
const raceState = { state: 'idle', wp: 0, t: 0, pos: L.race ? { ...L.race.start } : { x: 0, y: 0, z: 0 }, speed: 6.9, countdown: 0 };
function startRace() {
  raceState.state = 'countdown'; raceState.countdown = 3.2; raceState.wp = 0; raceState.pos = { ...L.race.start };
  toast('Race to the watchtower flag!', 2);
}
function updateRace(dt) {
  if (!L.race) return;
  const rs = raceState;
  if (rs.state === 'countdown') {
    const prev = Math.ceil(rs.countdown); rs.countdown -= dt; const now = Math.ceil(rs.countdown);
    if (now !== prev && now > 0) { toast(String(now), 0.8); audio.tone(500 + (4 - now) * 140, 500 + (4 - now) * 140, 0.12, 'square', 0.1); }
    if (rs.countdown <= 0) { rs.state = 'running'; toast('GO!', 1); audio.tone(1040, 1040, 0.3, 'square', 0.12); audio.play('checkpoint'); }
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
  f.alive = true; f.t = 0; f.vx = (Math.random() - 0.5) * 44; f.pos = { x: pos.x, y: pos.y, z: pos.z }; f.el.textContent = text; f.el.className = 'ftext ' + cls; f.el.style.display = 'block';
}
function updateFloatText(dt) {
  for (const f of floatPool) {
    if (!f.alive) continue; f.t += dt; if (f.t > 0.9) { f.alive = false; f.el.style.display = 'none'; continue; }
    const v = new THREE.Vector3(f.pos.x, f.pos.y + f.t * 1.4, f.pos.z).project(camera);
    if (v.z > 1) { f.el.style.display = 'none'; continue; } f.el.style.display = 'block';
    f.el.style.left = ((v.x + 1) / 2 * innerWidth + (f.vx || 0) * f.t) + 'px'; f.el.style.top = ((1 - v.y) / 2 * innerHeight) + 'px'; f.el.style.opacity = f.t < 0.6 ? 1 : (0.9 - f.t) / 0.3;
    const pk = f.t < 0.1 ? 1.45 - 4.5 * f.t : 1; f.el.style.transform = 'translate(-50%,-50%) scale(' + pk.toFixed(3) + ')';
  }
}

// shockwave rings: expanding billboard rings for parry / guard break / pound
const ringTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.strokeStyle = 'rgba(255,255,255,1)'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke(); g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 10; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const ringPool = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ringTex, color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.visible = false; scene.add(m); return { m, t: 1 }; });
function shockRing(pos, color = '#ffd27a', big = 1) { const r = ringPool.find(q => q.t >= 1) || ringPool[0]; r.t = 0; r.big = big; r.m.visible = true; r.m.material.color.set(color); r.m.position.set(pos.x, pos.y, pos.z); }
function updateRings(dt) { for (const r of ringPool) { if (r.t >= 1) { r.m.visible = false; continue; } r.t += dt * 2.8; const s = (0.6 + r.t * 4.2) * (r.big || 1); r.m.scale.set(s, s, 1); r.m.material.opacity = 0.7 * (1 - r.t); r.m.lookAt(camera.position); } }
// sword trail: a fading ribbon swept by the blade during swings
const TRAIL_N = 14;
const trailGeo = new THREE.BufferGeometry();
const trailPos = new Float32Array((TRAIL_N - 1) * 18);
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trailMat = new THREE.MeshBasicMaterial({ color: '#ffe9b0', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const trailMesh = new THREE.Mesh(trailGeo, trailMat); trailMesh.frustumCulled = false; scene.add(trailMesh);
let trailPts = [];
const _tv1 = new THREE.Vector3(), _tv2 = new THREE.Vector3();
function updateTrail() {
  const u = playerRig.userData; const sw = u && u.sword;
  const swinging = !player.dead && (player.state === S.LIGHT || player.state === S.HEAVY);
  if (swinging && sw && SET.particles > 0) {
    sw.updateWorldMatrix(true, false);
    _tv1.set(0, 0, 1.35).applyMatrix4(sw.matrixWorld);
    _tv2.set(0, 0, 0.3).applyMatrix4(sw.matrixWorld);
    trailPts.push({ tx: _tv1.x, ty: _tv1.y, tz: _tv1.z, bx: _tv2.x, by: _tv2.y, bz: _tv2.z });
    if (trailPts.length > TRAIL_N) trailPts.shift();
  } else if (trailPts.length) trailPts.splice(0, 3);
  let v = 0;
  for (let i = 0; i < trailPts.length - 1; i++) {
    const a = trailPts[i], b = trailPts[i + 1];
    trailPos[v++] = a.bx; trailPos[v++] = a.by; trailPos[v++] = a.bz;
    trailPos[v++] = a.tx; trailPos[v++] = a.ty; trailPos[v++] = a.tz;
    trailPos[v++] = b.tx; trailPos[v++] = b.ty; trailPos[v++] = b.tz;
    trailPos[v++] = a.bx; trailPos[v++] = a.by; trailPos[v++] = a.bz;
    trailPos[v++] = b.tx; trailPos[v++] = b.ty; trailPos[v++] = b.tz;
    trailPos[v++] = b.bx; trailPos[v++] = b.by; trailPos[v++] = b.bz;
  }
  trailGeo.setDrawRange(0, v / 3);
  trailGeo.attributes.position.needsUpdate = true;
  trailMat.opacity = trailPts.length > 1 ? 0.45 : 0;
}
// souls: a wisp that rises from a fallen foe
const soulPool = Array.from({ length: 5 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#cfe0ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); sp.visible = false; scene.add(sp); return { sp, t: 2 }; });
function spawnSoul(pos) { const r = soulPool.find(q => q.t >= 2) || soulPool[0]; r.t = 0; r.x = pos.x; r.z = pos.z; r.y0 = pos.y + 1; r.sp.visible = true; }
function updateSouls(dt) { for (const r of soulPool) { if (r.t >= 2) { r.sp.visible = false; continue; } r.t += dt; const k = r.t / 2; r.sp.position.set(r.x + Math.sin(r.t * 3) * 0.2, r.y0 + k * 3.2, r.z + Math.cos(r.t * 2.3) * 0.2); const s = 0.7 - k * 0.35; r.sp.scale.set(s, s, 1); r.sp.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, k * 1.15)); } }
// impact stars: an anime spike-burst sprite on heavy hits and kills
const starTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); g.translate(32, 32); g.fillStyle = 'rgba(255,255,255,1)'; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4 * (i === 0 ? 0 : 1)); g.beginPath(); g.moveTo(0, -30); g.lineTo(5, 0); g.lineTo(0, 30); g.lineTo(-5, 0); g.closePath(); g.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const starPool = Array.from({ length: 3 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: '#fff6d8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); sp.visible = false; scene.add(sp); return { sp, t: 1 }; });
function impactStar(pos, size = 1) { const r = starPool.find(q => q.t >= 1) || starPool[0]; r.t = 0; r.size = size; r.sp.visible = true; r.sp.position.set(pos.x, pos.y, pos.z); r.sp.material.rotation = Math.random() * Math.PI; }
function updateStars(dt) { for (const r of starPool) { if (r.t >= 1) { r.sp.visible = false; continue; } r.t += dt * 6.5; const k = r.t < 0.4 ? r.t / 0.4 : 1; r.sp.scale.set(2.2 * k * r.size, 2.2 * k * r.size, 1); r.sp.material.opacity = 0.9 * (1 - Math.max(0, r.t - 0.4) / 0.6); } }
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
      if (r === 'guard') { this.fx('clank', hp); audio.play('clank'); floatText(hp, 'GUARDED', 'dim'); tipOnce('shieldfoe', 'A raised shield turns your sword. A charged HEAVY (hold Q) breaks it — or BOP the head.'); this.player.body.vel.x *= -0.3; this.player.body.vel.z *= -0.3; }
      else if (r === 'guardbreak') { this.fx('break', hp); audio.play('break'); floatText(hp, 'GUARD BREAK', 'big'); shockRing(hp, '#6aa0ff', 0.9); e.squash = { s: 1.25, t: 0.13 }; if (game.trainingOn && e.kind === 'pellshield') game.trainBreak = true; cam.shake = 0.6; this.hitstop = 0.07; }
      else {
        spawnFx('hit', hp, box.kind === 'heavy' ? 18 : 10, this.player.fwd()); audio.play(box.kind === 'heavy' ? 'heavyhit' : 'hit', 1 + (box.kind === 'light' ? this.player.combo * 0.14 : 0));
        if (box.kind === 'heavy' || (box.kind === 'light' && this.player.combo === 2)) impactStar(hp, box.kind === 'heavy' ? 1.2 : 0.8);
        { const ddx = e.pos.x - this.player.pos.x, ddz = e.pos.z - this.player.pos.z; const dl = Math.hypot(ddx, ddz) || 1; e.hitTilt = { x: ddx / dl, z: ddz / dl, t: 0.2 }; }
        this.hitstop = box.kind === 'heavy' ? 0.09 : (box.kind === 'light' && this.player.combo === 2 ? 0.07 : 0.045);
        cam.shake = Math.max(cam.shake, box.kind === 'heavy' ? 0.55 : 0.22); cam.punch = box.kind === 'heavy' ? 0.5 : 0.25;
        e.hitFlash = 0.1; this.player.stats.hitsLanded++; rumble(0.25, 0.5, 90); if (game.trainingOn && e.kind === 'pell') game.trainHits = (game.trainHits || 0) + 1; floatText(hp, String(box.dmg), (box.kind === 'heavy' || (box.kind === 'light' && this.player.combo === 2)) ? 'big' : '');
        if (r === 'dead') { e.body.vel.x = -(this.player.pos.x - e.pos.x) * 3; e.body.vel.z = -(this.player.pos.z - e.pos.z) * 3; e.body.vel.y = 6; }
        if (r === 'dead') { this.slowmo = 0.28; cam.shake = Math.max(cam.shake, 0.5); this.fx('die', hp); impactStar(hp, 1.1); }
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
  breakBarricade(bx) { bx.enabled = false; if (bx.mesh) { bx.mesh.visible = false; } for (let i = 0; i < 3; i++) this.fx('die', { x: bx.cx + (Math.random() - 0.5) * bx.w, y: bx.min.y + 0.5 + i * 0.6, z: bx.cz + (Math.random() - 0.5) * bx.d }); audio.play('break'); cam.shake = 0.6; this.hitstop = 0.06; shockRing({ x: bx.cx, y: bx.min.y + 0.8, z: bx.cz }, '#d8a860', 1.2); impactStar({ x: bx.cx, y: bx.min.y + 0.9, z: bx.cz }, 1.1); rumble(0.6, 0.6, 180); toast('Barricade smashed', 1.6); },
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
  onBop(e) { if (e.kind !== 'hound') e.squash = { s: 0.62, t: 0.14 }; if (game.trainingOn && (e.kind === 'pell' || e.kind === 'pellshield')) game.trainBop = true; this.hitstop = 0.05; cam.shake = Math.max(cam.shake, 0.25); this.fx('hit', { x: e.pos.x, y: e.pos.y + e.body.h, z: e.pos.z }); },
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
    if (r === 'hit') { this.fx('hurt', hp); audio.play('hurt'); cam.shake = 0.7; this.hitstop = 0.06; this.vignette = 1; this.camRoll = (Math.random() < 0.5 ? -1 : 1) * 0.05; floatText(hp, '-' + dmg, 'hurt'); rumble(0.7, 0.4, 220); const hpEl = document.getElementById('hp'); hpEl.classList.remove('shake'); void hpEl.offsetWidth; hpEl.classList.add('shake'); }
    else if (r === 'blocked') { this.fx('clank', hp); audio.play('clank'); cam.shake = 0.2; floatText(hp, 'BLOCKED', 'dim'); tipOnce('parrytip', 'A block held is safe — a block at the LAST INSTANT is a parry, and staggers them.'); }
    else if (r === 'parried') {
      this.fx('parry', hp); audio.play('parry'); cam.shake = 0.4; this.hitstop = 0.14; this.flash = 0.6; this.slowmo = 0.2; floatText(hp, 'PARRY', 'big gold'); shockRing(hp, '#fff2c0', 1.1); cam.punch = Math.max(cam.punch, 0.4); if (game.trainingOn) game.trainParry = true;
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
  bombBeep(fuse) { audio.tone(900 + (3.2 - fuse) * 260, 900 + (3.2 - fuse) * 260, 0.05, 'square', 0.055); },
  onAggro(e) { floatText({ x: e.pos.x, y: e.pos.y + 2.1, z: e.pos.z }, '!', 'big'); audio.tone(880, 660, 0.1, 'square', 0.07); },
  onEnemyDied(e) {
    this.player.kills++;
    if (!e.cfg.passive) spawnSoul(e.pos);
    if (!e.cfg.passive) {
      const now = this.time;
      this.killChain = (this.lastKillT && now - this.lastKillT < 1.5) ? (this.killChain || 1) + 1 : 1;
      this.lastKillT = now;
      const notes = [523.3, 659.3, 784, 1046.5, 1318.5];
      audio.tone(notes[Math.min(this.killChain - 1, 4)], notes[Math.min(this.killChain - 1, 4)], 0.32, 'triangle', 0.11);
      if (this.killChain >= 3) floatText({ x: e.pos.x, y: e.pos.y + 1.8, z: e.pos.z }, this.killChain + ' CHAIN', 'big gold');
    }
    if (!e.cfg.passive) { this.killsBy = this.killsBy || {}; this.killsBy[e.kind] = (this.killsBy[e.kind] || 0) + 1; }
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
const HER_DEFS = {
  colours: { label: 'THE COLOURS', opts: { crimson: ['#8a2d2d', '#7a2020'], azure: ['#2d4a8a', '#20356a'], verdant: ['#2d6a3a', '#1f4a28'], violet: ['#5a2d7a', '#42205a'], gold: ['#b8902e', '#8a6a1e'], sable: ['#26262e', '#1a1a22'] } },
  armor: { label: 'THE ARMOUR', opts: { steel: '#aeb4c2', dark: '#6a7080', bronze: '#a08a5a', blackened: '#3c3a44' } },
  trim: { label: 'THE TRIM', opts: { gold: '#d8b050', silver: '#c8ccd4', copper: '#c07848' } },
};
let HER = { colours: 'crimson', armor: 'steel', trim: 'gold' };
try { const h = JSON.parse(localStorage.getItem('rampart_heraldry') || 'null'); if (h) HER = Object.assign(HER, h); } catch (e) {}
function heraldryPalette() {
  const col = HER_DEFS.colours.opts[HER.colours] || HER_DEFS.colours.opts.crimson;
  return { cloth: col[0], shield: col[0], cape: col[1], armor: HER_DEFS.armor.opts[HER.armor] || '#aeb4c2', trim: HER_DEFS.trim.opts[HER.trim] || '#d8b050' };
}
let playerRig = knightRig(heraldryPalette()); scene.add(playerRig);
function applyHeraldry() {
  try { localStorage.setItem('rampart_heraldry', JSON.stringify(HER)); } catch (e) {}
  const old = playerRig; scene.remove(old);
  playerRig = knightRig(heraldryPalette()); scene.add(playerRig);
  playerRig.position.copy(old.position); playerRig.rotation.y = old.rotation.y;
}
function buildHeraldry() {
  const rows = document.getElementById('herrows'); rows.innerHTML = '';
  for (const key in HER_DEFS) {
    const def = HER_DEFS[key];
    const row = document.createElement('div'); row.className = 'herrow';
    const lab = document.createElement('div'); lab.className = 'hlabel'; lab.textContent = def.label; row.appendChild(lab);
    const sws = document.createElement('div'); sws.className = 'swatches';
    for (const name in def.opts) {
      const v = def.opts[name]; const c = Array.isArray(v) ? v[0] : v;
      const sw = document.createElement('div'); sw.className = 'sw' + (HER[key] === name ? ' on' : ''); sw.style.background = c; sw.title = name;
      sw.onclick = () => { HER[key] = name; applyHeraldry(); buildHeraldry(); audio.play('checkpoint'); };
      sws.appendChild(sw);
    }
    row.appendChild(sws); rows.appendChild(row);
  }
}
let herReturn = null;
function showHeraldry(on, from) {
  if (on) { herReturn = from || null; buildHeraldry(); }
  document.getElementById('heraldry').style.display = on ? 'flex' : 'none';
  if (!on && herReturn === 'pause') document.getElementById('menu').classList.add('show');
  audio.play('ui');
}
document.getElementById('btnHerClose').onclick = () => showHeraldry(false);
document.addEventListener('mouseover', ev2 => { const t2 = ev2.target; if (t2 && (t2.tagName === 'BUTTON' || t2.classList.contains('slotrow') || t2.classList.contains('sw') || t2.classList.contains('otoggle'))) audio.play('lock'); });
// ---------------- bestiary ----------------
const BESTIARY = [
  { kind: 'grunt', ic: '\u2694', name: 'CAMP GRUNT', d: 'A levy blade of the siege host. Rushes straight in and swings wide.', w: 'Parry the swing; a bop staggers the whole rush.' },
  { kind: 'shield', ic: '\u26e8', name: 'SHIELDMAN', d: 'Advances behind a tower shield. Your sword turns on it.', w: 'A charged heavy breaks the guard \u2014 or bop the helm.' },
  { kind: 'crossbow', ic: '\u27b3', name: 'CROSSBOWMAN', d: 'Perches high and looses bolts on a slow rhythm.', w: 'Block at the last instant to parry the bolt back.' },
  { kind: 'swarm', ic: '\u2620', name: 'SWARMLING', d: 'Hunched, quick, and never alone.', w: 'The CHARGE bowls a whole pack over.' },
  { kind: 'bomber', ic: '\u2299', name: 'BOMBARDIER', d: 'Lobs powder bombs in a high arc from behind the line.', w: 'Close the gap \u2014 his own blasts hurt his own side.' },
  { kind: 'hound', ic: '\u16c1', name: 'WAR HOUND', d: 'Lunges low and fast, then circles for another pass.', w: 'Dash through the lunge and strike the turn.' },
  { kind: 'captain', ic: '\u2655', name: 'SIEGE CAPTAIN \u00b7 EMBER MARSHAL', d: 'Breaker of walls. Braces at half strength; the storm answers his rage.', w: 'Bop the braced guard from above, or break it with a heavy.' },
];
function showBestiary(on) {
  const el = document.getElementById('bestiary');
  if (on) {
    const rows = document.getElementById('bestrows'); rows.innerHTML = '';
    const met = game.met || {}, kb = game.killsBy || {};
    for (const b of BESTIARY) {
      const seen = met[b.kind] || (kb[b.kind] || 0) > 0;
      const row = document.createElement('div'); row.className = 'bestrow' + (seen ? '' : ' unseen');
      row.innerHTML = seen
        ? '<div class="bic2">' + b.ic + '</div><div><div class="bn">' + b.name + '</div><div class="bd">' + b.d + '</div><div class="bw">' + b.w + '</div></div><div class="bk">SLAIN ' + (kb[b.kind] || 0) + '</div>'
        : '<div class="bic2">?</div><div><div class="bn">? ? ?</div><div class="bd">This page waits for its foe.</div></div><div class="bk"></div>';
      rows.appendChild(row);
    }
  }
  el.style.display = on ? 'flex' : 'none'; audio.play('ui');
}
document.getElementById('btnBestClose').onclick = () => showBestiary(false);
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
  cam.dist = 7.5 * SET.camDist;
  for (const [id, org] of [['hp', 'left top'], ['crests', 'left top'], ['pennantsHud', 'left top'], ['shardsHud', 'left top'], ['alt', 'right top'], ['compass', 'center top'], ['objective', 'center top'], ['timer', 'right top']]) { const el = document.getElementById(id); if (el) { el.style.transformOrigin = org; el.style.transform = (id === 'compass' || id === 'objective' ? 'translateX(-50%) ' : '') + 'scale(' + SET.hudScale + ')'; } }
  { const tm = document.getElementById('timer'); if (tm) tm.style.display = SET.timer ? 'block' : 'none'; }
  { const tu = document.getElementById('touchui'); if (tu) { tu.classList.toggle('lefty', !!SET.leftHanded); const st2 = document.getElementById('stick'), tb = document.getElementById('tbtns'); if (st2) { st2.style.transformOrigin = SET.leftHanded ? 'right bottom' : 'left bottom'; st2.style.transform = 'scale(' + SET.touchSize + ')'; } if (tb) { tb.style.transformOrigin = SET.leftHanded ? 'left bottom' : 'right bottom'; tb.style.transform = 'scale(' + SET.touchSize + ')'; } } }
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
  { key: 'camDist', label: 'CAMERA DISTANCE', type: 'range', min: 0.8, max: 1.4, step: 0.05 },
  { key: 'hudScale', label: 'HUD SCALE', type: 'range', min: 0.8, max: 1.25, step: 0.05 },
  { key: 'timer', label: 'SPEEDRUN TIMER', type: 'toggle' },
  { key: 'touchSize', label: 'TOUCH BUTTON SIZE', type: 'range', min: 0.8, max: 1.5, step: 0.05 },
  { key: 'leftHanded', label: 'LEFT-HANDED TOUCH', type: 'toggle' },
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
document.getElementById('btnHeraldry').onclick = () => { document.getElementById('menu').classList.remove('show'); showHeraldry(true, 'pause'); };
document.getElementById('btnMoves').onclick = () => { document.getElementById('menu').classList.remove('show'); const mv = document.getElementById('moves'); const grid = document.getElementById('movesGrid'); if (!grid.childElementCount) { const src = document.getElementById('keysGrid'); const cl = src.cloneNode(true); cl.style.margin = '10px auto 0'; grid.appendChild(cl); } mv.style.display = 'flex'; audio.play('ui'); };
document.getElementById('btnMovesClose').onclick = () => { document.getElementById('moves').style.display = 'none'; document.getElementById('menu').classList.add('show'); audio.play('ui'); };
document.getElementById('btnPauseOptions').onclick = () => { document.getElementById('menu').classList.remove('show'); showOptions(true, 'pause'); };
document.getElementById('btnResume').onclick = () => { if (lockFallback) showMenu(false); else requestLock(); };
document.getElementById('btnKeepPlaying').onclick = () => { document.getElementById('win').classList.remove('show'); game.won = false; audio.play('ui'); toast('The vale is yours to wander.', 3); };
document.getElementById('btnWinQuit').onclick = () => { game.won = false; saveGame(); location.reload(); };
document.getElementById('btnQuit').onclick = () => { saveGame(); location.reload(); };

// beacons (Embermoor): relight with E; five lit raises a crest at the shrine
const beaconFlames = [];
function lightBeacon(bz) {
  bz.lit = true; audio.play('checkpoint'); shockRing({ x: bz.x, y: bz.y + 0.6, z: bz.z }, '#ffb24a', 1.3); spawnFx('shock', { x: bz.x, y: bz.y, z: bz.z }, 10);
  const fm = boxesMesh([{ x: 0, y: 0.3, z: 0, w: 0.5, h: 0.6, d: 0.5, c: '#ffb040' }, { x: 0, y: 0.7, z: 0, w: 0.24, h: 0.36, d: 0.24, c: '#ffe08a' }], { shadow: false, material: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92 }) });
  fm.position.set(bz.x, bz.y, bz.z); scene.add(fm); beaconFlames.push(fm); addGlow(fm, '#ff9a3a', 3.4, 0.5);
  const lit = L.braziers.filter(b2 => b2.lit).length;
  toast('Beacon ' + lit + ' of ' + L.braziers.length + ' relit', 2.2); saveGame();
  if (lit >= L.braziers.length) { spawnCrest('beacons', L.shrine.x, L.shrine.y, L.shrine.z); toast('The five flames answer \u2014 a crest rises at the shrine', 4); }
}
function ensureWorldCrests() { if (L.peakCrest) spawnCrest('peaks', L.peakCrest.x, L.peakCrest.y, L.peakCrest.z); if (L.grotto) spawnCrest('grotto', L.grotto.x, L.grotto.y, L.grotto.z); if (L.balcony) spawnCrest('shadow', L.balcony.x, L.balcony.y, L.balcony.z); if (L.crestSpots) for (const k in L.crestSpots) spawnCrest(k, L.crestSpots[k].x, L.crestSpots[k].y, L.crestSpots[k].z); }
function travel(vale) {
  saveGame(); try { sessionStorage.setItem('rampart_slot', String(SLOT)); } catch (e) {}
  toast(vale === 2 ? 'Descending through the clouds...' : vale === 3 ? 'Rising through the door of clouds...' : 'Rising home...', 2);
  try { if (vale === 1) sessionStorage.setItem('rampart_travelback', '1'); } catch (e) {}
  setTimeout(() => { location.href = location.pathname + (vale === 1 ? '' : '?vale=' + vale); }, 900);
}
// ---------------- save slots ----------------
let SLOT = 0;
function slotKey(i) { return 'rampart_save_' + i + (VALE === 2 ? '_v2' : VALE === 3 ? '_v3' : ''); }
function readSlot(i) { try { return JSON.parse(localStorage.getItem(slotKey(i)) || 'null'); } catch (e) { return null; } }
function saveGame() {
  if (!SLOT || !game.started) return;
  const data = { killsBy: game.killsBy || {}, met: game.met || {}, tips: game.tips || {}, braziers: (L.braziers || []).map(b2 => b2.lit), crestsGot: game.crestsGot || {}, pennants: pennantMeshes.map(p => p.got), shards: shardMeshes.map(sh => sh.got), pennantCount: game.pennants || 0, shardCount: game.shards || 0, checkpoint: game.checkpoint, time: (readSlot(SLOT)?.time || 0) + game.time - (game.lastSaveTime || 0), deaths: game.deaths, campDone: !!game.campDone };
  game.lastSaveTime = game.time;
  try { localStorage.setItem(slotKey(SLOT), JSON.stringify(data)); } catch (e) {}
}
function loadSlot(i) {
  SLOT = i; const d = readSlot(i);
  if (!d) return;
  game.crestsGot = d.crestsGot || {}; game.crests = Object.keys(game.crestsGot).length;
  (d.pennants || []).forEach((got, k) => { if (got && pennantMeshes[k]) { pennantMeshes[k].got = true; pennantMeshes[k].m.visible = false; } });
  (d.shards || []).forEach((got, k) => { if (got && shardMeshes[k]) { shardMeshes[k].got = true; shardMeshes[k].m.visible = false; } });
  game.pennants = d.pennantCount || 0; game.shards = d.shardCount || 0; game.deaths = d.deaths || 0; game.campDone = !!d.campDone; game.tips = d.tips || {}; game.killsBy = d.killsBy || {}; game.met = d.met || {};
  if (game.crests >= CRESTS.length) game.wonDone = true;   // completed save: no win replay on load
  if (game.campDone) game.campWave = 2;
  (d.braziers || []).forEach((lit, k) => { if (lit && L.braziers && L.braziers[k] && !L.braziers[k].lit) lightBeacon(L.braziers[k]); });
  try { if (VALE === 1 && localStorage.getItem('rampart_save_' + SLOT + '_v3')) setDoorOpen(); } catch (e) {}
  game.checkpoint = Math.min(d.checkpoint || 0, L.checkpoints.length - 1);
  const cp = L.checkpoints[game.checkpoint];
  player.body.pos.x = cp.x; player.body.pos.y = cp.y; player.body.pos.z = cp.z; player.body.syncAabb(); cam.target.set(cp.x, cp.y + 1.2, cp.z);
  refreshHallBanners(); refreshTrophies(); renderBoard();
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
let arrivedByTravel = false;
try { const st = sessionStorage.getItem('rampart_slot'); if (st && new URLSearchParams(location.search).has('vale')) { arrivedByTravel = true; pendingSlot = +st; } else if (st && VALE === 1 && sessionStorage.getItem('rampart_travelback')) { arrivedByTravel = true; pendingSlot = +st; sessionStorage.removeItem('rampart_travelback'); } } catch (e) {}
let atSplash = true;
function leaveSplash() { if (!atSplash) return; atSplash = false; audio.resume(); audio.play('checkpoint'); music.start(); document.getElementById('splash').style.display = 'none'; buildSlots(); document.getElementById('fileselect').style.display = 'flex'; }
if (VALE === 2) { const bn = document.querySelector('#boss .name'); if (bn) bn.textContent = 'THE EMBER MARSHAL'; }
if (VALE === 3) { const bt = document.querySelector('#crestboard .btitle'), bs = document.querySelector('#crestboard .bsub'); if (bt) bt.textContent = 'SKYREACH'; if (bs) bs.textContent = 'THE FOUR CRESTS OF THE ISLES'; }
if (VALE === 2) { const bt = document.querySelector('#crestboard .btitle'); if (bt) bt.textContent = 'EMBERMOOR'; }
if (arrivedByTravel) { atSplash = false; document.getElementById('splash').style.display = 'none'; const t2 = document.getElementById('title'); t2.style.display = 'flex'; t2.classList.remove('hide'); if (VALE === 3) { t2.querySelector('h1').textContent = 'SKYREACH'; t2.querySelector('.sub').textContent = 'THE ISLES ABOVE THE CLOUDS'; t2.querySelector('p').innerHTML = 'Beyond the crest door, islets ride the morning wind. The stair climbs, the gale lifts, and inside the great island the Undercroft waits. <b style="color:var(--gold);font-style:normal">Four crests fly here.</b>'; } if (VALE === 2) { t2.querySelector('h1').textContent = 'EMBERMOOR'; t2.querySelector('.sub').textContent = 'THE VALE BELOW THE CLOUDS'; t2.querySelector('p').innerHTML = 'Ash, dead trees, and five cold beacons. The Ember Marshal broods on the broken spire. <b style="color:var(--gold);font-style:normal">Four crests sleep here.</b>'; } }
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
  bindBtn('tPause', () => { showMenu(!game.paused); });
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
  if (L.winds) {
    game.windActive = null;
    for (const w of L.winds) {
      const on = w.up || ((game.time % w.period) < w.on);
      w.isOn = on; if (!on) continue;
      const dw = Math.hypot(player.pos.x - w.x, player.pos.z - w.z);
      if (dw < w.r && Math.abs(player.pos.y - w.y) < w.h) {
        if (w.up) { player.body.vel.y = Math.min(player.body.vel.y + 90 * dt, 12.5); player.body.grounded = false; }
        else if (!player.body.grounded) { player.body.vel.x += (w.dx || 0) * 16 * dt; player.body.vel.z += (w.dz || 0) * 16 * dt; }
        game.windActive = w;
      }
    }
  }
  let skipUpdate = false;
  if (L.ladders && L.ladders.length && !player.dead) {
    if (player.climb) {
      const ld = player.climb;
      const dxl = ld.x - player.pos.x, dzl = ld.z - player.pos.z; const dl = Math.hypot(dxl, dzl) || 1;
      if (!ld.up || inp.jump || dl > 1.8 || player.pos.y < ld.bottom - 1.4) {
        if (inp.jump) { player.body.vel.y = 8.5; player.body.vel.x = -dxl / dl * 4.5; player.body.vel.z = -dzl / dl * 4.5; audio.play('jump'); }
        player.climb = null;
      } else {
        const push = inp.mx * dxl / dl + inp.mz * dzl / dl;
        player.body.vel.x = 0; player.body.vel.z = 0; player.body.vel.y = 0;
        player.body.pos.y += push * 4.2 * dt;
        player.facing = Math.atan2(dxl, dzl);
        if (player.body.pos.y >= ld.top + 0.2) { player.body.vel.y = 7.5; player.body.vel.x = dxl / dl * 3.5; player.body.vel.z = dzl / dl * 3.5; player.climb = null; audio.play('jump'); }
        player.body.syncAabb();
        skipUpdate = true;
      }
    } else if ((player.state === S.IDLE || player.state === S.RUN || player.state === S.AIR) && player.iframes <= 0) {
      for (const ld of L.ladders) {
        if (!ld.up) continue;
        const dxl = ld.x - player.pos.x, dzl = ld.z - player.pos.z; const dl = Math.hypot(dxl, dzl);
        if (dl < 1.2 && dl > 0.01 && player.pos.y > ld.bottom - 1.5 && player.pos.y < ld.top - 0.4) {
          const push = inp.mx * dxl / dl + inp.mz * dzl / dl;
          if (push > 0.45) { player.climb = ld; audio.play('stepwood'); break; }
        }
      }
    }
  }
  if (!skipUpdate) player.update(dt, inp);
  // events → audio
  for (const ev of player.events) {
    if (ev === 'jump' || ev === 'djump') { audio.play(ev); spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }); player.squash = { s: 1.18, t: 0.12 }; }
    else if (ev === 'land') { player.bopChain = 0; const fv = Math.abs(player.landVy || 0); spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }, Math.min(18, 6 + (fv * 0.5) | 0)); audio.play('land', Math.max(0.7, 1 - fv * 0.012)); cam.punch = Math.max(cam.punch, Math.min(0.45, fv * 0.016)); if (fv > 19) shockRing({ x: player.pos.x, y: player.pos.y + 0.15, z: player.pos.z }, '#d8cfa0', 0.8); player.squash = { s: 0.78, t: 0.14 }; cam.shake = Math.max(cam.shake, Math.min(0.35, -player.landVy * 0.012)); }
    else if (ev === 'longjump') { audio.play('djump'); spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }, 8); player.squash = { s: 1.25, t: 0.14 }; }
    else if (ev === 'bop') { player.bopChain = (player.bopChain || 0) + 1; audio.play('djump', 1 + Math.min(6, player.bopChain) * 0.13); player.squash = { s: 0.7, t: 0.12 }; }
    else if (ev === 'thud') { audio.play('land'); cam.shake = Math.max(cam.shake, 0.3); }
    else if (ev === 'blocked') { player.blockJolt = 0.18; player.squash = { s: 0.9, t: 0.1 }; }
    else if (ev === 'parry') { player.blockJolt = 0.25; }
    else if (ev === 'swing') audio.play('swing', 1 + player.combo * 0.12);
    else if (['dash', 'bash', 'charge', 'heavyrelease', 'block', 'die'].includes(ev)) audio.play(ev);
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
  updateLadders(dt); updateRace(dt); updateTraining(dt); updateTips();
  // BREAK THE SIEGE CAMP: three waves, then the crest at the campfire
  if (!game.campDone && L.campArena) {
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
    if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 3 && Math.abs(c.y - player.pos.y) < 2) { game.checkpoint = i; toast('Checkpoint: ' + c.name); audio.play('checkpoint'); shockRing({ x: c.x, y: c.y + 1, z: c.z }, '#7ad0e8', 1.0); saveGame(); }
  }
  // boss intro: first time the player stands on the arena near the captain
  if (!game.bossIntroDone) { const cap = game.enemies.find(e => e.boss && !e.dead); if (cap && player.pos.y > L.topY - 0.5 && Math.hypot(cap.pos.x - player.pos.x, cap.pos.z - player.pos.z) < 11) { game.bossIntroDone = true; game.bossIntro = 2.6; game.slowmo = 2.6; cap.aggroed = true; cap.state = 'chase'; player.lockTarget = cap; cam.lock = cap; cam.idle = 0; audio.play('roar'); document.getElementById('bosscard').classList.add('show'); setTimeout(() => document.getElementById('bosscard').classList.remove('show'), 3200); cam.shake = 0.6; for (let k = 0; k < 3; k++) spawnFx('shock', { x: cap.pos.x, y: cap.pos.y + 0.1, z: cap.pos.z }, 10); } }
  if (game.bossIntro > 0) { game.bossIntro -= dt; }
  // all four crests = the vale is yours
  if (!game.won && (game.crests || 0) >= CRESTS.length) win();
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
  for (const e of game.enemies) if (e.dead && e.deathT > 1.4 && e.mesh && !e.cfg.passive) { scene.remove(e.mesh); e.mesh = null; if (e.bar) { e.bar.remove(); e.bar = null; } }
  game.enemies = game.enemies.filter(e => e.cfg.passive || !(e.dead && e.deathT > 1.4));
}

function spawnCampWave(n) {
  toast(n === 1 ? 'The camp rallies! Second wave!' : 'Their last stand!', 3); audio.play('roar');
  const A = L.campArena;
  const defs = n === 1 ? [['hound', -8, -88], ['hound', 16, -76], ['bomber', -14, -76]] : [['swarm', -8, -88], ['swarm', 16, -88], ['swarm', -14, -78], ['bomber', 20, -80]];
  for (const [k, x, z] of defs) { const e = new Enemy(k, world, game, x, A.y + 0.1, z, {}); e.aggroed = true; e.state = 'chase'; e.campWave = true; attachRig(e); game.enemies.push(e); spawnFx('shock', { x, y: A.y + 0.1, z }, 8); }
}
const TRAIN_STEPS = [
  { text: 'Drill 1 \u2014 LEFT CLICK: chain three strikes on the pell.', done: g2 => g2.trainHits >= 3 },
  { text: 'Drill 2 \u2014 hold Q: a charged heavy breaks the shield pell\u2019s guard.', done: g2 => g2.trainBreak },
  { text: 'Drill 3 \u2014 RIGHT CLICK at the last instant: parry the crossbow\u2019s bolt.', done: g2 => g2.trainParry },
  { text: 'Drill 4 \u2014 BOP: jump on a pell\u2019s head.', done: g2 => g2.trainBop },
  { text: 'Drills complete. The Vale awaits, knight.', done: () => false },
];
function updateTraining(dt) {
  if (!game.trainingOn) return;
  const step = TRAIN_STEPS[game.trainStep || 0];
  if (!step) { game.trainingOn = false; return; }
  if (step.done(game)) { game.trainStep = (game.trainStep || 0) + 1; audio.play('checkpoint'); const nxt = TRAIN_STEPS[game.trainStep]; if (nxt) say(nxt.text, 6); if (game.trainStep >= TRAIN_STEPS.length - 1) { game.trainingOn = false; say(TRAIN_STEPS[TRAIN_STEPS.length - 1].text, 5); } }
}
// one-time contextual tips: fire once per save file, at the moment they matter
function tipOnce(key, text) { game.tips = game.tips || {}; if (game.tips[key]) return; game.tips[key] = true; say(text, 6.5); audio.play('ui'); saveGame(); }
const TIP_SPOTS = VALE === 3 ? [
  { key: 'skystart', x: 0, z: 0, r: 9, text: 'The cloud sea holds nothing. Fall, and the wind carries you back to a checkpoint.' },
  { key: 'skygust', x: -6, z: 44, r: 8, text: 'The crosswind BLOWS in gusts. Watch the streaks \u2014 cross while it rests.' },
] : VALE === 2 ? [
  { key: 'v2start', x: 0, z: -26, r: 10, text: 'Cold ground. The beacons will light your way \u2014 seek the braziers.' },
  { key: 'v2void', x: -30, z: -8, r: 9, text: 'Slabs over open sky. CHARGE (F), then SPACE mid-charge to LONG JUMP the gaps.' },
] : [
  { key: 'gully', x: 0, z: -122, r: 10, text: 'A broken bridge. Hold F to CHARGE, then SPACE mid-charge \u2014 the LONG JUMP clears it.' },
  { key: 'camp', x: -2, z: -100, r: 12, text: 'A war camp ahead. BOP a head (jump on it) to bounce \u2014 or CHARGE through the mob.' },
  { key: 'spiral', x: -33, z: 26, r: 8, text: 'The keep spirals up. Hold SPACE for full jumps \u2014 a running start jumps higher.' },
  { key: 'drill', x: 14, z: -6, r: 7, text: 'The drill yard. Press E at the post to run the combat drills.' },
];
function updateTips() {
  if (!game.started || game.won) return;
  for (const t of TIP_SPOTS) { if (game.tips && game.tips[t.key]) continue; if (Math.hypot(t.x - player.pos.x, t.z - player.pos.z) < t.r) { tipOnce(t.key, t.text); break; } }
}
function tryInteract() {
  if (VALE === 1 && L.crestDoor && Math.hypot(L.crestDoor.x - player.pos.x, L.crestDoor.z - player.pos.z) < 3.2) {
    if (doorOpen) { toast('To Skyreach...', 1.5); travel(3); return; }
    if (game.doorAnim !== undefined) return;
    if ((game.crests || 0) >= 5) { game.doorAnim = 0; audio.play('crestget'); toast('The seal breaks. The door remembers the sky.', 3); cam.shake = 0.4; }
    else { game.doorShake = 0.5; audio.play('clank'); toast('The seal holds \u2014 it wants \u2726 five crests. (' + (game.crests || 0) + '/5)', 2.6); }
    return;
  }
  if (L.armoury && Math.hypot(L.armoury.x - player.pos.x, L.armoury.z - player.pos.z) < 2.4) { showHeraldry(true); return; }
  if (L.lectern && Math.hypot(L.lectern.x - player.pos.x, L.lectern.z - player.pos.z) < 2.4) { showBestiary(true); return; }
  if (L.trainingPost && Math.hypot(L.trainingPost.x - player.pos.x, L.trainingPost.z - player.pos.z) < 2.6) {
    game.trainingOn = true; game.trainStep = 0; game.trainHits = 0; game.trainBreak = false; game.trainParry = false; game.trainBop = false;
    // revive the pells for a fresh drill
    for (const e of game.enemies) if ((e.kind === 'pell' || e.kind === 'pellshield' || e.kind === 'drillbow') && e.dead) { e.dead = false; e.hp = e.maxHp; e.deathT = 0; if (!e.mesh) attachRig(e); e.mesh.visible = true; if (e.kind === 'pellshield') e.guardUp = true; }
    say(TRAIN_STEPS[0].text, 6); audio.play('ui'); return;
  }
  if (L.race && raceState.state === 'idle' && !(game.crestsGot || {}).race && Math.hypot(L.race.start.x - player.pos.x, L.race.start.z - player.pos.z) < 2.6) { startRace(); return; }
  if (L.braziers) { for (const bz of L.braziers) { if (!bz.lit && Math.hypot(bz.x - player.pos.x, bz.z - player.pos.z) < 2.4 && Math.abs(bz.y - player.pos.y) < 3) { lightBeacon(bz); return; } } }
  if (L.returnGate && Math.hypot(L.returnGate.x - player.pos.x, L.returnGate.z - player.pos.z) < 2.4) { travel(1); return; }
  if (L.warTable && Math.hypot(L.warTable.x - player.pos.x, L.warTable.z - player.pos.z) < 2.8) { if ((game.crests || 0) >= 8) { say('The clouds part below... to the Embermoor!', 3); setTimeout(() => travel(2), 1200); } else { showBoard(true); say('The map of Pennant Vale. Another vale lies beyond the clouds \u2014 when all eight crests are claimed.', 5); } return; }
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
  const gait = ent.kind === 'captain' ? 0.62 : 1;
  const leg = moving ? Math.sin(ph * gait) * (0.8 + (ent.kind === 'captain' ? 0.25 : 0)) : (b.grounded ? 0 : 0.45);
  u.legL.rotation.x = leg; u.legR.rotation.x = -leg;
  if (u.legL.userData && u.legL.userData.shin) {
    u.legL.userData.shin.rotation.x = moving ? Math.max(0, -Math.sin(ph * gait)) * 0.9 : (b.grounded ? 0 : 0.7);
    u.legR.userData.shin.rotation.x = moving ? Math.max(0, Math.sin(ph * gait)) * 0.9 : (b.grounded ? 0 : 0.7);
  }
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
    if (ent.dead && ent.cfg.passive) { rig.visible = ent.deathT < 1.2; }
    if (ent.dead) { const k = Math.min(1, ent.deathT * 2.2); rig.rotation.x = -Math.PI / 2 * k; rig.rotation.z = 0.3 * k; rig.rotation.y = ent.facing + ent.deathT * 5; rig.position.y -= Math.max(0, ent.deathT - 0.6) * 1.2; u.mat.emissive.set('#000'); u.mat.transparent = true; u.mat.opacity = Math.max(0, 1 - Math.max(0, ent.deathT - 0.7) * 1.6); }
    else {
      rig.rotation.x = 0; rig.rotation.z = 0;
      if (isPlayer && ent.climb) { ent.climbPh = ent.climbPh || 0; const cyc = Math.floor(b.pos.y * 1.6); if (cyc !== ent.climbPh) { ent.climbPh = cyc; audio.play('stepwood'); } }
      if (ent.hitTilt && ent.hitTilt.t > 0) {
        ent.hitTilt.t -= dt; const k = Math.max(0, ent.hitTilt.t / 0.2) * 0.3;
        const rel = Math.atan2(ent.hitTilt.x, ent.hitTilt.z) - ent.facing;
        rig.rotation.x += -Math.cos(rel) * k; rig.rotation.z += Math.sin(rel) * k;
      }
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
  if (isPlayer && ent.climb) { const cph = b.pos.y * 3.2; armR = -2.35 + Math.sin(cph) * 0.55; armL = -2.35 - Math.sin(cph) * 0.55; armRy = 0; armRz = 0; lean = 0.12; u.legL.rotation.x = 0.5 + Math.sin(cph) * 0.4; u.legR.rotation.x = 0.5 - Math.sin(cph) * 0.4; }
  u.armR.rotation.x = armR; u.armR.rotation.y = armRy; u.armR.rotation.z = armRz;
  if (u.armR.userData && u.armR.userData.fore) {
    const base = b.grounded ? -0.38 : -0.6;
    u.armR.userData.fore.rotation.x = base + Math.max(0, Math.min(1.4, armR)) * 0.32 + (moving ? Math.max(0, Math.sin(ph)) * 0.25 : 0);
    u.armL.userData.fore.rotation.x = shieldUp ? -0.85 : base + Math.max(0, Math.min(1.4, armL)) * 0.32 + (moving ? Math.max(0, -Math.sin(ph)) * 0.25 : 0);
  }
  u.armL.rotation.x = shieldUp ? -1.4 : armL; u.armL.rotation.y = shieldUp ? 0.9 * Math.min(1, shieldUp) : 0;
  u.armL.position.x = shieldUp ? -0.2 : -0.4; u.armL.position.z = shieldUp ? 0.25 * shieldUp : 0;
  u.torso.rotation.x = lean;
  u.torso.rotation.y = (isPlayer && (ent.state === S.LIGHT || ent.state === S.HEAVY)) ? (ent.combo === 1 ? 0.35 : -0.3) * Math.min(1, t * 8) : u.torso.rotation.y * 0.85;
  u.head.rotation.x = lean * 0.5;
  if (u.cape && u.cape.visible) { const v = Math.hypot(b.vel.x, b.vel.z); u.cape.rotation.x = -0.15 - Math.min(1.1, v * 0.09) - (b.grounded ? 0 : Math.max(-0.3, Math.min(0.6, -b.vel.y * 0.04))) + Math.sin(game.time * 3.1) * 0.04; }
}

// ------------------------------------------------------------------ render/HUD
// compass strip: cardinal letters + the objective star + next checkpoint
const compassEls = [];
let compassObj = null, compassCp = null;
{ const comp = document.getElementById('compass');
  for (const [txt, ang] of [['N', Math.PI], ['E', -Math.PI / 2], ['S', 0], ['W', Math.PI / 2]]) { const sp = document.createElement('span'); sp.textContent = txt; comp.appendChild(sp); compassEls.push({ el: sp, ang }); }
  compassObj = document.createElement('span'); compassObj.textContent = '\u2726'; compassObj.className = 'cobj'; comp.appendChild(compassObj);
  compassCp = document.createElement('span'); compassCp.textContent = '\u2691'; compassCp.className = 'ccp'; comp.appendChild(compassCp);
}
function compassPlace(entry, viewYaw) {
  let rel = entry.ang - viewYaw; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
  if (Math.abs(rel) > 1.35) { entry.el.style.display = 'none'; return; }
  entry.el.style.display = 'block'; entry.el.style.left = (50 + rel / 1.35 * 50) + '%';
}
const hud = {
  hp: document.getElementById('hp'), boss: document.getElementById('boss'), bossFill: document.getElementById('bossfill'),
  toast: document.getElementById('toast'), charge: document.getElementById('charge'), prompt: document.getElementById('prompt'), alt: document.getElementById('alt'),
};
let toastT = 0;
function toast(msg, t = 2.6) { hud.toast.textContent = msg; hud.toast.classList.add('show'); toastT = t; }
function renderHud(dt) {
  // hp pips
  if (!renderHud.pips || renderHud.pips.length !== P.hp) { hud.hp.innerHTML = ''; renderHud.pips = []; for (let i = 0; i < P.hp; i++) { const el = document.createElement('i'); hud.hp.appendChild(el); renderHud.pips.push(el); } renderHud.prevHp = player.hp; renderHud.pips.forEach((el, i) => el.className = i < player.hp ? 'on' : ''); }
  if (player.hp !== renderHud.prevHp) {
    const prev = renderHud.prevHp;
    renderHud.pips.forEach((el, i) => {
      const cls = i < player.hp ? 'on' : '';
      if (player.hp < prev && i >= player.hp && i < prev) { el.className = 'burst'; setTimeout(() => { if (el.className === 'burst') el.className = ''; }, 520); }
      else if (player.hp > prev && i >= prev && i < player.hp) { el.className = 'on heal'; setTimeout(() => { el.classList.remove('heal'); }, 640); }
      else if (!el.className.includes('burst')) el.className = cls;
    });
    renderHud.prevHp = player.hp;
  }
  hud.hp.classList.toggle('low', player.hp <= 1 && !player.dead);
  if (SET.timer) { const tm = document.getElementById('timer'); if (tm) tm.textContent = fmtTime(game.time); }
  const boss = game.enemies.find(e => e.boss && !e.dead && e.aggroed);
  const bossVis = !!boss;
  if (bossVis && !renderHud.bossWas) { hud.boss.classList.remove('bossin'); void hud.boss.offsetWidth; hud.boss.classList.add('bossin'); renderHud.ghostW = 100; }
  renderHud.bossWas = bossVis;
  hud.boss.style.display = bossVis ? 'block' : 'none';
  if (boss) {
    const pct = boss.hp / boss.maxHp * 100;
    hud.bossFill.style.width = pct + '%';
    renderHud.ghostW = Math.max(pct, (renderHud.ghostW === undefined ? 100 : renderHud.ghostW) - dt * 26);
    const gh = document.getElementById('bossghost'); if (gh) gh.style.width = renderHud.ghostW + '%';
  }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) hud.toast.classList.remove('show'); }
  if (sayT > 0) { sayT -= dt; if (sayT <= 0) document.getElementById('dialogue').classList.remove('show'); }
  { const c = document.getElementById('combo'); if (player.comboT > 0 || player.state === S.LIGHT) { c.style.display = 'block'; const txt = (player.combo + 1) + ' HIT'; if (c.textContent !== txt) { c.textContent = txt; c.classList.remove('cpop2'); void c.offsetWidth; c.classList.add('cpop2'); c.classList.toggle('x3', player.combo >= 2); } } else { c.style.display = 'none'; c.classList.remove('x3'); } }
  hud.charge.style.display = player.state === S.HEAVY_CHARGE ? 'block' : 'none';
  if (player.state === S.HEAVY_CHARGE) hud.charge.firstElementChild.style.width = Math.min(100, player.charge / P.heavyCharge * 100) + '%';
  hud.charge.classList.toggle('full', player.charge >= P.heavyCharge);
  // ladder prompt
  let near = null;
  for (const ld of L.ladders) if (ld.up && Math.abs(player.pos.x - ld.x) < 2 && Math.abs(player.pos.z - ld.z) < 2.4 && Math.abs(player.pos.y - ld.top) < 2) near = ld;
  const nearSquire = L.race && raceState.state === 'idle' && !(game.crestsGot || {}).race && Math.hypot(L.race.start.x - player.pos.x, L.race.start.z - player.pos.z) < 2.6;
  const nearBeacon = L.braziers && L.braziers.some(bz => !bz.lit && Math.hypot(bz.x - player.pos.x, bz.z - player.pos.z) < 2.4 && Math.abs(bz.y - player.pos.y) < 3);
  const nearGate = L.returnGate && Math.hypot(L.returnGate.x - player.pos.x, L.returnGate.z - player.pos.z) < 2.4;
  const nearTrain = L.trainingPost && !game.trainingOn && Math.hypot(L.trainingPost.x - player.pos.x, L.trainingPost.z - player.pos.z) < 2.6;
  const nearDoor = VALE === 1 && L.crestDoor && Math.hypot(L.crestDoor.x - player.pos.x, L.crestDoor.z - player.pos.z) < 3.2;
  const nearArm = L.armoury && Math.hypot(L.armoury.x - player.pos.x, L.armoury.z - player.pos.z) < 2.4;
  const nearLec = L.lectern && Math.hypot(L.lectern.x - player.pos.x, L.lectern.z - player.pos.z) < 2.4;
  const nearTable = L.warTable && Math.hypot(L.warTable.x - player.pos.x, L.warTable.z - player.pos.z) < 2.8;
  hud.prompt.textContent = near ? 'E \u2014 KICK THE LADDER' : nearTable ? 'E \u2014 THE WAR TABLE' : nearBeacon ? 'E \u2014 RELIGHT THE BEACON' : nearGate ? 'E \u2014 RETURN TO PENNANT VALE' : nearTrain ? 'E \u2014 BEGIN THE DRILL' : nearDoor ? (doorOpen ? 'E \u2014 TO SKYREACH' : 'E \u2014 THE CREST DOOR  \u2726 5') : nearArm ? 'E \u2014 THE ARMOURY' : nearLec ? 'E \u2014 THE BESTIARY' : 'E \u2014 RACE THE SQUIRE';
  hud.prompt.style.display = (near || nearSquire || nearTable || nearBeacon || nearGate || nearTrain || nearArm || nearLec || nearDoor) ? 'block' : 'none';
  { const ti = document.getElementById('tInteract'); if (ti) ti.style.display = (IS_TOUCH && (near || nearSquire || nearTable || nearBeacon || nearGate)) ? 'flex' : 'none'; }
  hud.alt.textContent = 'ALT ' + player.pos.y.toFixed(0) + 'm';
  // objective + off-screen marker
  // nearest unclaimed crest target drives the objective line and the marker
  const got = game.crestsGot || {};
  const targets = [];
  if (!got.captain && L.goal) targets.push({ name: VALE === 2 ? 'FELL THE EMBER MARSHAL' : 'FELL THE SIEGE CAPTAIN', x: L.goal.x, y: L.goal.y + 2, z: L.goal.z });
  if (VALE === 2 && !got.beacons && L.braziers) { const un = L.braziers.find(b2 => !b2.lit); if (un) targets.push({ name: 'RELIGHT THE BEACONS', x: un.x, y: un.y + 1, z: un.z }); else targets.push({ name: 'THE SHRINE CREST', x: L.shrine.x, y: L.shrine.y + 1, z: L.shrine.z }); }
  if (VALE === 1 && !got.race) targets.push(raceState.state === 'running' ? { name: 'RACE! TO THE WATCHTOWER', x: L.raceFinish.x, y: L.raceFinish.y + 2, z: L.raceFinish.z } : { name: 'THE SQUIRE WAITS', x: L.race.start.x, y: L.race.start.y + 1, z: L.race.start.z });
  if (!got.pennants) { if (VALE === 2 && (game.pennants || 0) >= 8) { /* v2 pennant crest at its shrine handled below */ } if ((game.pennants || 0) >= 8) targets.push({ name: 'THE SHRINE CREST', x: L.shrine.x, y: L.shrine.y + 1, z: L.shrine.z }); else { let bestp = null, bpd = 1e9; for (const pn of pennantMeshes) { if (pn.got) continue; const d = Math.hypot(pn.c.x - player.pos.x, pn.c.z - player.pos.z); if (d < bpd) { bpd = d; bestp = pn; } } if (bestp) targets.push({ name: 'RED PENNANTS ' + (game.pennants || 0) + '/8', x: bestp.c.x, y: bestp.c.y + 1, z: bestp.c.z }); } }
  if (!got.peaks && L.peakCrest) targets.push({ name: 'CREST OF THE PEAKS', x: L.peakCrest.x, y: L.peakCrest.y + 1, z: L.peakCrest.z });
  if (L.crestSpots) for (const ck in L.crestSpots) { if (!got[ck]) { const cdef = CRESTS.find(c2 => c2.key === ck); targets.push({ name: cdef ? cdef.name : ck.toUpperCase(), x: L.crestSpots[ck].x, y: L.crestSpots[ck].y + 1, z: L.crestSpots[ck].z }); } }
  let gl = L.beacon, tname = 'THE VALE IS YOURS';
  if (targets.length) { let bd2 = 1e9; for (const t of targets) { const d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z); if (d < bd2) { bd2 = d; gl = { x: t.x, y: t.y + 7, z: t.z }; tname = t.name; } } }
  const dist = Math.hypot(gl.x - player.pos.x, gl.y - 7 - player.pos.y, gl.z - player.pos.z);
  const obj = document.getElementById('objective');
  obj.textContent = tname + '  ' + String.fromCharCode(183) + '  ' + dist.toFixed(0) + 'm';
  if (renderHud.lastObj !== tname) { renderHud.lastObj = tname; obj.classList.remove('objswitch'); void obj.offsetWidth; obj.classList.add('objswitch'); }
  // compass strip
  { const vd = new THREE.Vector3(); camera.getWorldDirection(vd); const viewYaw = Math.atan2(vd.x, vd.z);
    for (const ce of compassEls) compassPlace(ce, viewYaw);
    compassPlace({ el: compassObj, ang: Math.atan2(gl.x - player.pos.x, gl.z - player.pos.z) }, viewYaw);
    const cp2 = L.checkpoints[game.checkpoint];
    if (cp2 && Math.hypot(cp2.x - player.pos.x, cp2.z - player.pos.z) > 8) compassPlace({ el: compassCp, ang: Math.atan2(cp2.x - player.pos.x, cp2.z - player.pos.z) }, viewYaw); else compassCp.style.display = 'none';
  }
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
  shockRing({ x: player.pos.x, y: player.pos.y + 1.2, z: player.pos.z }, '#ffd27a', 1.6);
  for (let k = 0; k < 3; k++) spawnFx('parry', { x: player.pos.x, y: player.pos.y + 0.8 + k * 0.5, z: player.pos.z }, 10);
  const el = document.getElementById('crestcard');
  document.getElementById('crestcardname').textContent = def ? def.name : key;
  document.getElementById('crestcardcount').textContent = '\u2726 ' + (game.crests || 0) + ' of 4';
  el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3400);
  const cc = document.getElementById('crests'); cc.classList.remove('pop'); void cc.offsetWidth; cc.classList.add('pop');
  audio.play('crestget');
  renderBoard(); refreshHallBanners(); refreshTrophies(); say(CREST_LINES[key] || '');
}
const CREST_LINES = VALE === 3 ? {
  stair: 'The stair is climbed. The wind remembers your steps.',
  gale: 'You rode the gale itself. The spire bows.',
  undercroft: 'The hollow heart of the island, and you walked it.',
  pennants: 'Eight sky pennants. The isles fly your colours now.',
} : VALE === 2 ? {
  captain: 'The Marshal falls. The moor exhales.',
  beacons: 'Five flames against the dark. The moor remembers warmth.',
  pennants: 'Eight scorched pennants \u2014 the old company is honoured.',
  peaks: 'The void chain crossed. Few have stood there and lived.',
} : {
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
  rows.innerHTML = CRESTS.map((c, ri) => { const got = (game.crestsGot || {})[c.key]; return '<div style="--i:' + ri + '" class="brow' + (got ? ' got' : '') + '"><span class="bic">' + (got ? '\u2726' : '\u2727') + '</span><span class="bname">' + c.name + '</span><span class="bhint">' + (got ? 'CLAIMED' : c.hint) + '</span></div>'; }).join('');
  document.getElementById('boardpennants').textContent = 'red pennants: ' + (game.pennants || 0) + ' / 8';
}
function showBoard(on) { game.boardOpen = on; document.getElementById('crestboard').classList.toggle('show', on); if (on) renderBoard(); }
document.getElementById('crestboard').addEventListener('mousedown', () => showBoard(false));
function win() {
  if (game.wonDone) return; game.wonDone = true;
  game.won = true; audio.play('win');
  const el = document.getElementById('win'); el.classList.add('show');
  const NWORD = { 4: 'four', 8: 'eight' }[CRESTS.length] || CRESTS.length;
  document.getElementById('winSub').textContent = VALE === 3 ? 'The isles fly your colours. The wind will carry you home.' : VALE === 2 ? 'The Embermoor sleeps warm again. The Vale above awaits your return.' : 'Eight banners hang in the Great Hall. Beyond the clouds, another vale waits.';
  document.getElementById('winstats').textContent = 'All ' + NWORD + ' crests claimed. ' + `${(game.time / 60) | 0}:${String((game.time % 60) | 0).padStart(2, '0')} · ${player.kills} foes · ${game.deaths} deaths · ${player.stats.parries} parries`;
  document.exitPointerLock();
}
function showMenu(on) {
  document.getElementById('menu').classList.toggle('show', on && game.started && !game.won);
  if (on) { const ps = document.getElementById('pausestats'); if (ps) ps.textContent = '\u2726 ' + (game.crests || 0) + '/' + CRESTS.length + '   \u25b8 ' + (game.pennants || 0) + '/8   \u2b26 ' + (game.shards || 0) + '/30   \u2020 ' + (game.deaths || 0); }
  if (!on) { const mv = document.getElementById('moves'); if (mv) mv.style.display = 'none'; }
  game.paused = on;
}
function start() { if (game.started) return; if (atSplash || document.getElementById('fileselect').style.display === 'flex') return; game.started = true; document.body.classList.remove('pregame'); const fresh = pendingSlot && !readSlot(pendingSlot); if (pendingSlot) loadSlot(pendingSlot); applySettings(); ensureWorldCrests();
  if (fresh && VALE === 1 && !arrivedByTravel) { const hi = L.checkpoints.findIndex(c2 => c2.name === 'The Great Hall'); if (hi >= 0) { game.checkpoint = hi; const cp = L.checkpoints[hi]; player.body.pos.x = cp.x; player.body.pos.y = cp.y + 0.1; player.body.pos.z = cp.z; player.body.syncAabb(); cam.target.set(cp.x, cp.y + 1.2, cp.z); } startIntro(); }
  if (!game.intro) setTimeout(() => { if (!game.boardOpen) showBoard(true); }, 600); document.getElementById('title').classList.add('hide'); audio.resume(); music.start(); cam.yaw = Math.PI; cam.pitch = 0.38; cam.idle = 0; toast('Reclaim the eight crests of the Vale.', 3.5); }
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
    const inp = game.intro ? { mx: 0, mz: 0 } : collectInput();
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
  if (game.intro) updateIntro(dt);
  if (game.started && !game.paused && !(game.deathCine > 0) && !game.intro) cam.update(dt, player, moving);
  updateRings(dt); updateStars(dt); updateTrail(); updateSouls(dt); if (doorLeafL) updateDoor(dt);
  if (game.camRoll) { if (!SET.reduceMotion) camera.rotateZ(game.camRoll); game.camRoll *= Math.max(0, 1 - dt * 6); if (Math.abs(game.camRoll) < 0.002) game.camRoll = 0; }
  // low-hp heartbeat
  if (game.started && player.hp === 1 && !player.dead && !game.won) {
    game.heartT = (game.heartT || 0) - dt;
    if (game.heartT <= 0) { game.heartT = 0.95; audio.thump(52, 0.16, 0.28); audio.thump(48, 0.14, 0.2, 0.16); }
    game.vignette = Math.max(game.vignette, 0.2 + 0.08 * Math.sin(game.time * 6.6));
  }
  // charge scuff: heavier, faster puffs + rumble ticks while rushing
  if (player.state === S.RUSH && player.body.grounded && SET.particles > 0) {
    game.scuffT = (game.scuffT || 0) - dt;
    if (game.scuffT <= 0) { game.scuffT = 0.07; spawnFx('dust', { x: player.pos.x - Math.sin(player.facing) * 0.5, y: player.pos.y, z: player.pos.z - Math.cos(player.facing) * 0.5 }, 3); rumble(0.08, 0.22, 45); }
  }
  // long-jump air streaks
  if (!player.body.grounded && Math.hypot(player.body.vel.x, player.body.vel.z) > 10.5 && SET.particles > 0) {
    game.streakT = (game.streakT || 0) - dt;
    if (game.streakT <= 0) { game.streakT = 0.09; spawnFx('dust', { x: player.pos.x, y: player.pos.y + 0.6, z: player.pos.z }, 1); }
  }
  // sprint dust puffs
  if (player.body.grounded && Math.hypot(player.body.vel.x, player.body.vel.z) > 6.8 && SET.particles > 0) {
    game.dustT = (game.dustT || 0) - dt;
    if (game.dustT <= 0) { game.dustT = 0.16; spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }, 2); }
  }
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
  torchLights.forEach((t, i) => { const dpx = Math.hypot(t.light.position.x - player.pos.x, t.light.position.z - player.pos.z); const prox = 1 + Math.max(0, 1 - dpx / 6) * 0.55; t.light.intensity = i < 8 ? t.base * prox * (0.85 + 0.15 * Math.sin(game.time * 13 + t.seed) * Math.sin(game.time * 7.3 + t.seed)) : 0; });
  beacon.material.opacity = 0.3 + 0.1 * Math.sin(game.time * 2); beacon.rotation.y += dt * 0.3; beaconCore.material.opacity = 0.5 + 0.2 * Math.sin(game.time * 3);
  for (let ci = 0; ci < cloudDecks.length; ci++) { const m = cloudDecks[ci]; m.material.map.offset.x += dt * 0.002 * (ci + 1); }
  if (waterMeshes.length) { waterMeshes[0].position.y = L.water.y + Math.sin(game.time * 1.2) * 0.05; waterMeshes[1].position.y = L.water.y + 0.06 + Math.sin(game.time * 1.7 + 1) * 0.06; waterMeshes[1].material.opacity = 0.18 + 0.1 * (0.5 + 0.5 * Math.sin(game.time * 2.3)); }
  for (const gq of glowFacers) { if (gq.parent && gq.parent.visible) gq.lookAt(camera.position); }
  for (const gq of torchGlows) { gq.lookAt(camera.position); gq.material.opacity = 0.4 + 0.14 * Math.sin(game.time * 11 + gq.userData.seed); }
  if (L.flag) L.flag.rotation.y = Math.sin(game.time * 2) * 0.15 + (game.bossDead ? 0 : 0);
  renderHud(dt);
  // music intensity: nearby aggroed foes, boss
  { let inten = 0.15, bossNear = false; for (const e of game.enemies) { if (e.dead || !e.aggroed) continue; const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z); if (d < 16) inten = Math.max(inten, e.boss ? 1 : 0.65); if (e.boss && d < 30) bossNear = true; } if (game.won) { inten = 0; bossNear = false; }
    const mmode = !game.started ? 'title' : bossNear ? 'boss' : VALE === 3 ? 'vale3' : VALE === 2 ? 'vale2' : 'vale1';
    music.update(dt, inten, game.started && L.water ? player.pos : null, mmode); }
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
  audio, music,
  debugStart() { atSplash = false; pendingSlot = 0; for (const id of ['splash', 'fileselect', 'options', 'title']) document.getElementById(id).style.display = 'none'; document.getElementById('title').classList.add('hide'); game.started = true; document.body.classList.remove('pregame'); applySettings(); ensureWorldCrests(); },
  shot() { render(0); return fetch('/shot', { method: 'POST', body: canvas.toDataURL('image/png') }).then(r => r.text()); },
  start() { start(); game.paused = false; },
  step(dt = FIXED, inp = {}) { step(dt, { ...ZERO, ...inp }); },
  // run a script: array of [seconds, inputObj]; returns final player pos
  sim(script) { for (const [sec, inp] of script) { const n = Math.round(sec / FIXED); for (let i = 0; i < n; i++) step(FIXED, { ...ZERO, ...inp, jump: i === 0 && !!inp.jump, dash: i === 0 && !!inp.dash, light: i === 0 && !!inp.light, heavy: i === 0 && !!inp.heavy, bash: i === 0 && !!inp.bash, pound: i === 0 && !!inp.pound }); } return { ...player.pos }; },
  teleport(x, y, z) { player.body.pos.x = x; player.body.pos.y = y; player.body.pos.z = z; player.body.vel.x = player.body.vel.y = player.body.vel.z = 0; player.body.syncAabb(); player.state = S.IDLE; player.t = 0; player.hp = P.hp; player.iframes = 0; game.bolts.length = 0; document.getElementById('dead').classList.remove('show'); cam.target.set(x, y + 1.2, z); },
  state() { return { pos: { ...player.pos }, vel: { ...player.body.vel }, grounded: player.body.grounded, state: player.state, hp: player.hp, enemies: game.enemies.filter(e => !e.dead).map(e => ({ kind: e.kind, hp: e.hp, state: e.state, pos: { ...e.pos } })), checkpoint: game.checkpoint, won: game.won, time: game.time }; },
};
