import * as THREE from '../vendor/three.module.js';
import { World, overlap } from './physics.js';
import { Player, P, S } from './player.js';
import { Enemy, Bolt, E } from './enemies.js';
import { buildLevel, updatePlatforms } from './level.js';
import { ChaseCam } from './camera.js';
import { knightRig, gruntRig, boxesMesh, MAT } from './voxel.js';
import { Audio, Music } from './audio.js';

const FIXED = 1 / 120;

// ------------------------------------------------------------------ scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#2a1f2e');
scene.fog = new THREE.Fog('#3a2a36', 40, 140);
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 300);

const hemi = new THREE.HemisphereLight('#c4a4a8', '#5a4632', 2.4); scene.add(hemi);
scene.add(new THREE.AmbientLight('#5a4a5a', 0.5));
const sun = new THREE.DirectionalLight('#ffc080', 2.0);
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
  const disc = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: '#ffd9a0', fog: false, transparent: true, opacity: 0.95 }));
  disc.position.set(40, 14, 240); disc.lookAt(0, 0, 0); scene.add(disc);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({ color: '#ff9a4a', fog: false, transparent: true, opacity: 0.25, depthWrite: false }));
  glow.position.set(40, 14, 238); glow.lookAt(0, 0, 0); scene.add(glow);
}
// embers + smoke: two Points clouds
const emberGeo = new THREE.BufferGeometry(); const EMBERS = 260; const emberPos = new Float32Array(EMBERS * 3); const emberVel = [];
const smokeGeo = new THREE.BufferGeometry(); const SMOKE = 160; const smokePos = new Float32Array(SMOKE * 3); const smokeAge = new Float32Array(SMOKE);
const softTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const embers = new THREE.Points(emberGeo, new THREE.PointsMaterial({ color: '#ffb24a', size: 0.32, map: softTex, transparent: true, opacity: 0.95, sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending }));
const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ color: '#3a2e34', size: 5, map: softTex, transparent: true, opacity: 0.22, sizeAttenuation: true, depthWrite: false }));
scene.add(embers); scene.add(smoke);
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
const smokeSrc = [];
for (let i = -28; i <= 28; i += 8) smokeSrc.push({ x: i + 1.2, y: 3.4, z: 46 + (i % 16 === 0 ? 6 : 0) });
smokeSrc.push({ x: -14, y: 1.2, z: 14 });
for (let i = 0; i < SMOKE; i++) { const sdx = smokeSrc[i % smokeSrc.length]; smokePos[i * 3] = sdx.x; smokePos[i * 3 + 1] = sdx.y + Math.random() * 12; smokePos[i * 3 + 2] = sdx.z; smokeAge[i] = Math.random() * 8; }
smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
function updateAtmos(dt) {
  const t = game.time;
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
// the chasm mist: a huge red plane below the walls (anything outside the walls is a drop)
const mist = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#5a1620', transparent: true, opacity: 0.85, depthWrite: false }));
mist.rotation.x = -Math.PI / 2; mist.position.set(0, L.mistY, 30); scene.add(mist);
const mist2 = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: '#7a2030', transparent: true, opacity: 0.35, depthWrite: false }));
mist2.rotation.x = -Math.PI / 2; mist2.position.set(0, L.mistY + 1.5, 30); scene.add(mist2);
// portcullis bars
const gateMesh = boxesMesh(Array.from({ length: 5 }, (_, i) => ({ x: -1.6 + i * 0.8, y: 3, z: 0, w: 0.18, h: 6, d: 0.18, c: '#3a3d44' })).concat([{ x: 0, y: 1.5, z: 0, w: 3.6, h: 0.14, d: 0.2, c: '#3a3d44' }, { x: 0, y: 3.5, z: 0, w: 3.6, h: 0.14, d: 0.2, c: '#3a3d44' }]));
gateMesh.position.set(0, 0, -15); scene.add(gateMesh);
// landing ring under player (iso-readability lesson: elevation needs a shadow anchor)
const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.6, depthWrite: false }));
ring.rotation.x = -Math.PI / 2; scene.add(ring);

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
      if (r === 'guard') { this.fx('clank', hp); audio.play('clank'); this.player.body.vel.x *= -0.3; this.player.body.vel.z *= -0.3; }
      else if (r === 'guardbreak') { this.fx('break', hp); audio.play('break'); cam.shake = 0.6; this.hitstop = 0.07; }
      else {
        spawnFx('hit', hp, box.kind === 'heavy' ? 18 : 10, this.player.fwd()); audio.play(box.kind === 'heavy' ? 'heavyhit' : 'hit');
        this.hitstop = box.kind === 'heavy' ? 0.09 : (box.kind === 'light' && this.player.combo === 2 ? 0.07 : 0.045);
        cam.shake = Math.max(cam.shake, box.kind === 'heavy' ? 0.55 : 0.22); cam.punch = box.kind === 'heavy' ? 0.5 : 0.25;
        e.hitFlash = 0.1; this.player.stats.hitsLanded++;
        if (r === 'dead') { this.slowmo = 0.28; cam.shake = Math.max(cam.shake, 0.5); this.fx('die', hp); }
      }
    }
    // barricades: only bash / heavy / pound break them
    for (const bx of this.L.barricades) {
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
  onBossPhase(e) {
    toast('The Captain braces. Break him from above — or with a heavy.', 4); audio.play('break'); cam.shake = 0.9; this.slowmo = 0.4;
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
    for (const bx of this.L.barricades) if (bx.enabled && Math.hypot(bx.cx - pos.x, bx.cz - pos.z) < radius + 1 && Math.abs(pos.y - bx.min.y) < 2) this.breakBarricade(bx);
    this.hitstop = 0.06;
  },
  enemyHit(e, box, dmg, opts) {
    const p = this.player;
    if (p.dead || !overlap(box, p.body.aabb)) return;
    const r = p.takeHit(dmg, e.pos, opts);
    const hp = { x: p.pos.x, y: p.pos.y + 1.1, z: p.pos.z };
    if (r === 'hit') { this.fx('hurt', hp); audio.play('hurt'); cam.shake = 0.7; this.hitstop = 0.06; this.vignette = 1; }
    else if (r === 'blocked') { this.fx('clank', hp); audio.play('clank'); cam.shake = 0.2; }
    else if (r === 'parried') {
      this.fx('parry', hp); audio.play('parry'); cam.shake = 0.4; this.hitstop = 0.14; this.flash = 0.6; this.slowmo = 0.2;
      e.stun = 1.4; e.guardUp = false; e.state = 'flinch'; e.t = 0; e.telegraph = 0; this.releaseAttackToken(e);
      e.body.vel.x = (e.pos.x - p.pos.x) * 3; e.body.vel.z = (e.pos.z - p.pos.z) * 3;
    }
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
    if (e.kind === 'captain') { this.bossDead = true; toast('The Siege Captain falls. Raise the banner.'); }
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
    p.state = S.IDLE; p.t = 0; p.iframes = 1.0; p.lockTarget = null; cam.lock = null;
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

for (const sp of L.spawns) {
  const e = new Enemy(sp.kind, world, game, sp.x, sp.y, sp.z, { perch: sp.perch, facing: Math.PI });
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
  const N = count || spec.n;
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
const keys = {}; let mouseDX = 0, mouseDY = 0; const pressed = {};
const KEYMAP = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'dash', ShiftRight: 'dash', KeyQ: 'heavy', KeyF: 'bash', ControlLeft: 'pound', KeyC: 'pound', KeyE: 'interact', Tab: 'lock', KeyZ: 'lock', KeyR: 'respawn', KeyT: 'tune', Escape: 'menu', KeyJ: 'light', KeyK: 'block' };
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
  return { mx: dz(gp.axes[0]), my: dz(gp.axes[1]), cx: dz(gp.axes[2]), cy: dz(gp.axes[3]),
    jump: b(0), light: b(2), heavy: b(3), dash: b(1), block: b(5) || (gp.buttons[7] && gp.buttons[7].value > 0.4), bash: b(4), pound: b(6) || b(7) && false, lock: b(10) || b(9), interact: b(4) };
}
let gpPrev = {};

function collectInput() {
  // camera-relative movement
  const f = cam.forward(), r = cam.right();
  let ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), iz = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  const gp = readGamepad();
  const gpPressed = {};
  if (gp) {
    ix += gp.mx; iz += -gp.my;
    cam.input(gp.cx * 12, gp.cy * 10);
    for (const k of ['jump', 'light', 'heavy', 'dash', 'bash', 'pound', 'lock', 'interact']) { gpPressed[k] = gp[k] && !gpPrev[k]; }
    gpPrev = gp;
  }
  const inp = {
    mx: f.x * iz + r.x * ix, mz: f.z * iz + r.z * ix,
    jump: !!pressed.jump || !!gpPressed.jump, jumpHeld: !!keys.jump || !!(gp && gp.jump),
    dash: !!pressed.dash || !!gpPressed.dash, light: !!pressed.light || !!gpPressed.light,
    heavy: !!pressed.heavy || !!gpPressed.heavy, heavyHeld: !!keys.heavy || !!(gp && gp.heavy),
    block: !!keys.block || !!(gp && gp.block), bash: !!pressed.bash || !!gpPressed.bash,
    pound: !!pressed.pound || !!gpPressed.pound || (!!pressed.block && !player.body.grounded), interact: !!pressed.interact || !!gpPressed.interact,
    lock: !!pressed.lock || !!gpPressed.lock, respawn: !!pressed.respawn,
  };
  for (const k in pressed) pressed[k] = false;
  return inp;
}

// ------------------------------------------------------------------ simulation step
function step(dt, inp) {
  if (game.hitstop > 0) { game.hitstop -= dt; return; }
  game.time += dt;
  updatePlatforms(L, game.time, dt);
  if (inp.lock) toggleLock();
  if (inp.respawn && !player.dead) { game.respawn(false); }
  if (inp.interact) tryInteract();
  player.update(dt, inp);
  // events → audio
  for (const ev of player.events) {
    if (ev === 'jump' || ev === 'djump') { audio.play(ev); spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }); player.squash = { s: 1.18, t: 0.12 }; }
    else if (ev === 'land') { spawnFx('dust', { x: player.pos.x, y: player.pos.y, z: player.pos.z }, 8); audio.play('land'); player.squash = { s: 0.78, t: 0.14 }; cam.shake = Math.max(cam.shake, Math.min(0.35, -player.landVy * 0.012)); }
    else if (['swing', 'dash', 'bash', 'charge', 'heavyrelease', 'block', 'die'].includes(ev)) audio.play(ev);
  }
  player.events.length = 0;
  // enemies
  for (const e of game.enemies) {
    if (e.dead) { e.deathT += dt; continue; }
    if (game.noEnemies) continue;
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
  updateLadders(dt);
  // tutorial prompts: fire once when the player passes each trigger line (south → north)
  for (const tt of L.tutorial) {
    if (tt.done) continue;
    if (tt.after && !L.tutorial.find(x => x.key === tt.after).done) continue;
    let fire = false;
    if (tt.z !== undefined) fire = player.pos.z > tt.z && (tt.key !== 'hoist' || (player.pos.x < -13 && player.pos.y > 5));
    else if (tt.cond === 'hit') fire = player.stats.hitsLanded > 0;
    else if (tt.cond === 'guardbreak') fire = game.enemies.some(e => e.kind === 'pellshield' && (e.stun > 0 || e.dead));
    else if (tt.cond === 'barricade') fire = !L.barricades[0].enabled;
    else if (tt.cond === 'boltparry') fire = !!game.boltParried || game.enemies.some(e => e.kind === 'drillbow' && e.dead);
    if (fire) { tt.done = true; toast(tt.text, 4.5); }
  }
  // portcullis: opens when the drill sergeant falls
  if (L.portcullis.enabled && !game.enemies.some(e => e.kind === 'drill' && !e.dead)) { L.portcullis.enabled = false; game.gateT = 0; toast('The gate opens. Into the courtyard.', 3); audio.play('checkpoint'); }
  // checkpoints
  for (let i = game.checkpoint + 1; i < L.checkpoints.length; i++) {
    const c = L.checkpoints[i];
    if (Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 3 && Math.abs(c.y - player.pos.y) < 2) { game.checkpoint = i; toast('Checkpoint: ' + c.name); audio.play('checkpoint'); }
  }
  // goal
  if (game.bossDead && !game.won && Math.hypot(L.goal.x - player.pos.x, L.goal.z - player.pos.z) < L.goal.r && Math.abs(player.pos.y - L.goal.y) < 2) win();
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
    const near = Math.abs(player.pos.x - ld.x) < 26 && player.pos.y > 5 && player.pos.y < 20 && player.pos.z > 20;
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

function tryInteract() {
  for (const ld of L.ladders) {
    if (ld.up && Math.abs(player.pos.x - ld.x) < 1.6 && Math.abs(player.pos.z - (ld.z - 1.2)) < 1.6 && Math.abs(player.pos.y - ld.top) < 2) { game.kickLadder(ld); return; }
  }
}
function toggleLock() {
  if (player.lockTarget) { player.lockTarget = null; cam.lock = null; return; }
  let best = null, bd = 16;
  const f = player.fwd();
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z; const d = Math.hypot(dx, dz);
    if (d > 16 || Math.abs(e.pos.y - player.pos.y) > 5) continue;
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
  u.torso.position.y = moving ? Math.abs(Math.sin(ph)) * 0.06 : 0;
  u.head.position.y = 1.55 + u.torso.position.y;
  // defaults
  let armR = moving ? -Math.sin(ph) * 0.4 : 0, armL = moving ? Math.sin(ph) * 0.4 : 0, armRy = 0, armRz = 0, lean = 0, shieldUp = 0;
  const t = ent.t;
  if (isPlayer) {
    switch (st) {
      case S.LIGHT: { const a = P.light[ent.combo]; const k = Math.min(1, t / a.t); const w = k < 0.25 ? -2.2 + (k / 0.25) * 0.4 : (k < 0.6 ? -1.8 + ((k - 0.25) / 0.35) * 3.0 : 1.2 - ((k - 0.6) / 0.4) * 1.2); armR = w; armRy = ent.combo === 1 ? 0.9 : (ent.combo === 2 ? -0.5 : 0.4); armRz = ent.combo === 1 ? -0.8 : 0.5; lean = k < 0.6 ? 0.25 : 0.05; break; }
      case S.HEAVY_CHARGE: armR = -2.7; armRz = 0.8; lean = -0.15 + Math.sin(game.time * 40) * 0.02 * Math.min(1, ent.charge / P.heavyCharge); break;
      case S.HEAVY: { const k = Math.min(1, t / P.heavyT); armR = k < 0.3 ? -2.7 + (k / 0.3) * 1.0 : (k < 0.55 ? -1.7 + ((k - 0.3) / 0.25) * 3.2 : 1.5 - ((k - 0.55) / 0.45) * 1.5); armRz = 0.5; lean = k < 0.55 ? 0.4 : 0.1; break; }
      case S.BLOCK: shieldUp = 1; lean = 0.1; break;
      case S.DASH: lean = 0.55; armR = 0.6; armL = 0.6; break;
      case S.BASH: shieldUp = 1.4; lean = 0.45; break;
      case S.POUND: armR = -1.0; armRz = 0.3; lean = t < 0.12 ? -0.3 : 0.2; u.legL.rotation.x = 0.8; u.legR.rotation.x = 0.8; break;
      case S.HURT: lean = -0.35; armR = -0.6; armL = -0.6; break;
      case S.DEAD: rig.rotation.x = -Math.PI / 2 * Math.min(1, t * 2); rig.position.y += 0.3 * Math.min(1, t * 2); break;
      case S.AIR: armR = -0.5; armL = -0.5; lean = Math.max(-0.2, Math.min(0.2, -b.vel.y * 0.02)); break;
    }
    if (st !== S.DEAD) rig.rotation.x = 0;
    if (ent.iframes > 0 && st === S.HURT) rig.visible = Math.floor(game.time * 30) % 2 === 0; else rig.visible = true;
    // squash & stretch
    if (ent.squash) { ent.squash.t -= dt; const k = Math.max(0, ent.squash.t / 0.14); const s = 1 + (ent.squash.s - 1) * k; rig.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); if (ent.squash.t <= 0) { ent.squash = null; rig.scale.set(1, 1, 1); } }
    else if (!b.grounded) { const s = 1 + Math.max(-0.08, Math.min(0.1, b.vel.y * 0.008)); rig.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); }
    else rig.scale.set(1, 1, 1);
    // footsteps
    if (moving) { const ph2 = Math.floor(ph / Math.PI); if (ph2 !== ent.lastStep) { ent.lastStep = ph2; audio.play('step'); if (sp > 5) spawnFx('dust', { x: b.pos.x, y: b.pos.y, z: b.pos.z }, 2); } }
    ent.landVy = b.grounded ? 0 : b.vel.y;
    // sword trail during hit windows
    const trailOn = (st === S.LIGHT && t >= P.light[ent.combo].hit[0] - 0.02 && t <= P.light[ent.combo].hit[1] + 0.06) || (st === S.HEAVY && t >= P.heavyHit[0] - 0.02 && t <= P.heavyHit[1] + 0.08);
    swordTrail.visible = trailOn;
    if (trailOn) { swordTrail.position.set(b.pos.x, b.pos.y + 1.0, b.pos.z); swordTrail.rotation.set(0, ent.facing + (ent.combo === 1 ? 0.4 : -0.4) * (st === S.LIGHT ? 1 : 0), ent.combo === 2 || st === S.HEAVY ? 0.5 : -0.2); swordTrail.scale.setScalar(st === S.HEAVY ? 1.35 : 1); swordTrail.material.opacity = 0.55; }
    // hurt flash
    playerMat.emissive.set(ent.state === S.HURT ? '#ff3030' : (ent.iframes > 0 && ent.state === S.DASH ? '#80c0ff' : '#000000'));
  } else {
    if (ent.dead) { const k = Math.min(1, ent.deathT * 2.2); rig.rotation.x = -Math.PI / 2 * k; rig.rotation.z = 0.3 * k; rig.position.y -= Math.max(0, ent.deathT - 0.6) * 1.2; u.mat.emissive.set('#000'); u.mat.transparent = true; u.mat.opacity = Math.max(0, 1 - Math.max(0, ent.deathT - 0.7) * 1.6); }
    else {
      rig.rotation.x = 0;
      if (st === 'slamwind') { armR = -2.8; armL = -2.8; lean = -0.35; }
      else if (st === 'slam') { armR = 1.2; armL = 1.2; lean = 0.6; }
      else if (ent.brace > 0) { shieldUp = 1.2; lean = 0.25; armR = 0.4; }
      else if (st === 'windup') { armR = -2.2 - ent.telegraph * 0.6; armRz = 0.6; lean = -0.15; if (ent.kind === 'crossbow') { armR = -1.5; armRz = 0; } }
      else if (st === 'swing') { armR = 1.3; armRz = 0.4; lean = 0.35; if (ent.kind === 'crossbow') { armR = -1.5; } }
      else if (st === 'flinch') { lean = -0.3; armR = -0.5; }
      else if (st === 'climb') { const c = Math.sin(game.time * 8); u.legL.rotation.x = c * 0.8; u.legR.rotation.x = -c * 0.8; armR = -2.2 + c * 0.4; armL = -2.2 - c * 0.4; }
      if (ent.kind === 'crossbow' && st !== 'windup' && st !== 'swing') { armR = -1.2; }
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
  hud.charge.style.display = player.state === S.HEAVY_CHARGE ? 'block' : 'none';
  if (player.state === S.HEAVY_CHARGE) hud.charge.firstElementChild.style.width = Math.min(100, player.charge / P.heavyCharge * 100) + '%';
  hud.charge.classList.toggle('full', player.charge >= P.heavyCharge);
  // ladder prompt
  let near = null;
  for (const ld of L.ladders) if (ld.up && Math.abs(player.pos.x - ld.x) < 2 && Math.abs(player.pos.z - (ld.z - 1.2)) < 2 && Math.abs(player.pos.y - ld.top) < 2) near = ld;
  hud.prompt.style.display = near ? 'block' : 'none';
  hud.alt.textContent = 'ALT ' + player.pos.y.toFixed(0) + 'm';
  // objective + off-screen marker
  const gl = L.beacon; const dist = Math.hypot(gl.x - player.pos.x, gl.y - 7 - player.pos.y, gl.z - player.pos.z);
  const obj = document.getElementById('objective');
  obj.textContent = (game.bossDead ? 'RAISE THE BANNER' : L.portcullis.enabled ? 'TRAINING YARD — DEFEAT THE DRILL SERGEANT' : ['REACH THE WALL', 'REACH THE WALL', 'CROSS THE BATTLEMENTS', 'CLIMB TO THE HOIST', 'CLIMB THE KEEP', 'CLIMB THE KEEP', 'DEFEAT THE SIEGE CAPTAIN'][Math.min(6, game.checkpoint)]) + '  ·  ' + dist.toFixed(0) + 'm';
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
  const wantFov = 62 + (player.state === S.DASH || player.state === S.BASH ? 9 : 0) + (game.slowmo > 0 ? -4 : 0);
  if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
  // enemy health bars
  for (const e of game.enemies) {
    const show = !e.dead && (e.aggroed || e.hp < e.maxHp);
    if (!show) { if (e.bar) e.bar.style.display = 'none'; continue; }
    if (!e.bar) { e.bar = document.createElement('div'); e.bar.className = 'ebar'; e.bar.innerHTML = '<div></div>'; document.body.appendChild(e.bar); }
    const p = new THREE.Vector3(e.pos.x, e.pos.y + 2.1 * e.scale, e.pos.z).project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) { e.bar.style.display = 'none'; continue; }
    e.bar.style.display = 'block'; e.bar.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; e.bar.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
    e.bar.firstElementChild.style.width = (e.hp / e.maxHp * 100) + '%'; e.bar.classList.toggle('guard', !!e.guardUp && e.stun <= 0);
  }
}

function win() {
  game.won = true; audio.play('win');
  const el = document.getElementById('win'); el.classList.add('show');
  document.getElementById('winstats').textContent = `${(game.time / 60) | 0}:${String((game.time % 60) | 0).padStart(2, '0')} · ${player.kills} foes · ${game.deaths} deaths · ${player.stats.parries} parries`;
  document.exitPointerLock();
}
function showMenu(on) { document.getElementById('menu').classList.toggle('show', on && game.started && !game.won); game.paused = on; }
function start() { if (game.started) return; game.started = true; document.getElementById('title').classList.add('hide'); audio.resume(); music.start(); cam.yaw = Math.PI; cam.pitch = 0.38; cam.idle = 0; toast('Reach the keep. Raise the banner.'); }
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
    cam.input(mouseDX, mouseDY); mouseDX = mouseDY = 0;
    let first = true;
    while (acc >= FIXED) { step(FIXED, first ? inp : { ...inp, jump: false, dash: false, light: false, heavy: false, bash: false, pound: false, interact: false, lock: false, respawn: false }); acc -= FIXED; first = false; }
  }
  render(dt);
}
function render(dt) {
  if (game.falling) { game.falling -= dt; if (game.falling <= 0) { game.falling = 0; document.getElementById('fell').classList.remove('show'); player.hp = Math.max(0, player.hp - 1); game.respawn(player.hp <= 0); } }
  updateAtmos(dt); game.slowmo = Math.max(0, game.slowmo - dt); game.vignette = Math.max(0, game.vignette - dt * 1.6); game.flash = Math.max(0, game.flash - dt * 3);
  const moving = Math.hypot(player.body.vel.x, player.body.vel.z) > 1;
  if (game.started && !game.paused) cam.update(dt, player, moving);
  else if (!game.started) { const t = performance.now() / 1000; camera.position.set(Math.sin(t * 0.08) * 22, 9 + Math.sin(t * 0.13) * 1.5, 6 + Math.cos(t * 0.08) * 22); camera.lookAt(0, 3, 14); }
  animateRig(playerRig, player, dt, true);
  for (const e of game.enemies) if (e.mesh) animateRig(e.mesh, e, dt, false);
  for (const b of game.bolts) {
    if (!b.mesh) { b.mesh = boxesMesh([{ x: 0, y: 0, z: 0, w: 0.06, h: 0.06, d: 0.7, c: '#d8c8a0' }, { x: 0, y: 0, z: 0.33, w: 0.1, h: 0.1, d: 0.08, c: '#3a3d44' }], { shadow: false }); scene.add(b.mesh); }
    b.mesh.position.set(b.pos.x, b.pos.y, b.pos.z); b.mesh.lookAt(b.pos.x + b.vel.x, b.pos.y + b.vel.y, b.pos.z + b.vel.z);
  }
  updateFx(dt);
  // landing ring: project down to the first surface
  const h = world.raycast({ x: player.pos.x, y: player.pos.y + 0.05, z: player.pos.z }, { x: 0, y: -1, z: 0 }, 60, b => b.tag !== 'field');
  if (h) { ring.position.set(player.pos.x, player.pos.y + 0.05 - h.t + 0.02, player.pos.z); ring.visible = !player.body.grounded; ring.material.opacity = Math.max(0.2, 0.8 - h.t * 0.03); ring.scale.setScalar(1 + Math.min(1.5, h.t * 0.08)); } else ring.visible = false;
  // sun follows player so the shadow map stays sharp
  sun.position.set(player.pos.x - 30, player.pos.y + 45, player.pos.z + 20); sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);
  // torches flicker; only nearest 8 lit
  torchLights.sort((a, b) => a.light.position.distanceToSquared(camera.position) - b.light.position.distanceToSquared(camera.position));
  torchLights.forEach((t, i) => { t.light.intensity = i < 8 ? t.base * (0.85 + 0.15 * Math.sin(game.time * 13 + t.seed) * Math.sin(game.time * 7.3 + t.seed)) : 0; });
  beacon.material.opacity = 0.3 + 0.1 * Math.sin(game.time * 2); beacon.rotation.y += dt * 0.3; beaconCore.material.opacity = 0.5 + 0.2 * Math.sin(game.time * 3);
  if (!L.portcullis.enabled && game.gateT !== undefined) { game.gateT += dt; gateMesh.position.y = Math.min(5.6, game.gateT * 2.5); }
  if (L.flag) L.flag.rotation.y = Math.sin(game.time * 2) * 0.15 + (game.bossDead ? 0 : 0);
  renderHud(dt);
  // music intensity: nearby aggroed foes, boss
  if (game.started) { let inten = 0.15; for (const e of game.enemies) { if (e.dead || !e.aggroed) continue; const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z); if (d < 16) inten = Math.max(inten, e.boss ? 1 : 0.65); } if (game.won) inten = 0; music.update(dt, inten); }
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
  game, player, world, L, P, E, cam, scene, renderer, camera,
  collectInput, animateRig,
  shot() { render(0); return fetch('/shot', { method: 'POST', body: canvas.toDataURL('image/png') }).then(r => r.text()); },
  start() { start(); game.paused = false; },
  step(dt = FIXED, inp = {}) { step(dt, { ...ZERO, ...inp }); },
  // run a script: array of [seconds, inputObj]; returns final player pos
  sim(script) { for (const [sec, inp] of script) { const n = Math.round(sec / FIXED); for (let i = 0; i < n; i++) step(FIXED, { ...ZERO, ...inp, jump: i === 0 && !!inp.jump, dash: i === 0 && !!inp.dash, light: i === 0 && !!inp.light, heavy: i === 0 && !!inp.heavy, bash: i === 0 && !!inp.bash, pound: i === 0 && !!inp.pound }); } return { ...player.pos }; },
  teleport(x, y, z) { player.body.pos.x = x; player.body.pos.y = y; player.body.pos.z = z; player.body.vel.x = player.body.vel.y = player.body.vel.z = 0; player.body.syncAabb(); player.state = S.IDLE; player.t = 0; player.hp = P.hp; player.iframes = 0; game.bolts.length = 0; document.getElementById('dead').classList.remove('show'); cam.target.set(x, y + 1.2, z); },
  state() { return { pos: { ...player.pos }, vel: { ...player.body.vel }, grounded: player.body.grounded, state: player.state, hp: player.hp, enemies: game.enemies.filter(e => !e.dead).map(e => ({ kind: e.kind, hp: e.hp, state: e.state, pos: { ...e.pos } })), checkpoint: game.checkpoint, won: game.won, time: game.time }; },
};
