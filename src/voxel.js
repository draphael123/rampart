import * as THREE from '../vendor/three.module.js';

// Merge a list of {x,y,z,w,h,d,c} boxes into one flat-shaded geometry with
// vertex colours. x,y,z = centre. Cheap and chunky.
export function boxesGeometry(list) {
  const pos = [], nor = [], col = [];
  const faces = [
    { n: [1, 0, 0], v: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  ];
  const tmp = new THREE.Color();
  for (const b of list) {
    tmp.set(b.c);
    const hw = b.w / 2, hh = b.h / 2, hd = b.d / 2;
    for (const f of faces) {
      // face shading baked slightly so it reads even with flat lights
      const shade = f.n[1] === 1 ? 1.0 : f.n[1] === -1 ? 0.55 : (f.n[0] !== 0 ? 0.82 : 0.9);
      const r = tmp.r * shade, g = tmp.g * shade, bl = tmp.b * shade;
      const idx = [0, 1, 2, 0, 2, 3];
      for (const i of idx) {
        const v = f.v[i];
        pos.push(b.x + v[0] * hw, b.y + v[1] * hh, b.z + v[2] * hd);
        nor.push(f.n[0], f.n[1], f.n[2]);
        col.push(r, g, bl);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

export const MAT = new THREE.MeshLambertMaterial({ vertexColors: true });

export function boxesMesh(list, opts = {}) {
  const m = new THREE.Mesh(boxesGeometry(list), opts.material || MAT);
  m.castShadow = opts.shadow !== false; m.receiveShadow = true;
  return m;
}

// ---------- character rigs ----------
// Silhouette hierarchy: big torso, small head, clear sword + shield masses.
export function knightRig(palette = {}) {
  const P = Object.assign({ armor: '#aeb4c2', trim: '#d8b050', cloth: '#8a2d2d', skin: '#e2b48c', steel: '#e4e8ee', shield: '#8a2d2d', cape: '#7a2020' }, palette);
  const g = new THREE.Group();
  const torso = boxesMesh([
    { x: 0, y: 0.95, z: 0, w: 0.62, h: 0.6, d: 0.4, c: P.armor },
    { x: 0, y: 0.62, z: 0, w: 0.5, h: 0.16, d: 0.32, c: P.cloth },   // tabard hem
    { x: 0, y: 1.0, z: 0.21, w: 0.2, h: 0.35, d: 0.03, c: P.trim },  // chest crest
    { x: 0, y: 1.3, z: 0, w: 0.7, h: 0.12, d: 0.46, c: P.armor },   // pauldron line
  ]);
  const head = new THREE.Group();
  head.add(boxesMesh([
    { x: 0, y: 0, z: 0, w: 0.36, h: 0.38, d: 0.36, c: P.armor },
    { x: 0, y: -0.04, z: 0.19, w: 0.3, h: 0.08, d: 0.02, c: '#1a1a22' }, // visor slit
    { x: 0, y: 0.3, z: -0.06, w: 0.07, h: 0.34, d: 0.36, c: P.cloth },   // plume
    { x: 0, y: 0.5, z: -0.22, w: 0.06, h: 0.14, d: 0.2, c: P.cloth },
  ]));
  head.position.set(0, 1.55, 0);
  const mkLeg = () => {
    const leg = new THREE.Group();
    leg.add(boxesMesh([{ x: 0, y: -0.16, z: 0, w: 0.2, h: 0.32, d: 0.22, c: P.armor }]));
    const shin = new THREE.Group();
    shin.add(boxesMesh([{ x: 0, y: -0.14, z: 0, w: 0.18, h: 0.28, d: 0.2, c: P.armor }, { x: 0, y: -0.28, z: 0.04, w: 0.2, h: 0.1, d: 0.3, c: P.trim }]));
    shin.position.set(0, -0.32, 0); leg.add(shin); leg.userData.shin = shin;
    return leg;
  };
  const legL = mkLeg(), legR = mkLeg();
  legL.position.set(-0.16, 0.62, 0); legR.position.set(0.16, 0.62, 0);
  // sword arm (right) pivot at shoulder
  const armR = new THREE.Group();
  armR.add(boxesMesh([{ x: 0, y: -0.22, z: 0, w: 0.16, h: 0.44, d: 0.16, c: P.armor }]));
  const sword = boxesMesh([
    { x: 0, y: 0.0, z: 0.08, w: 0.07, h: 0.07, d: 0.2, c: '#3a2a1a' },   // grip
    { x: 0, y: 0.0, z: 0.2, w: 0.3, h: 0.05, d: 0.05, c: P.trim },      // guard
    { x: 0, y: 0.0, z: 0.75, w: 0.1, h: 0.035, d: 1.05, c: P.steel },   // blade
  ]);
  sword.position.set(0, -0.42, 0.05);
  armR.add(sword);
  armR.position.set(0.4, 1.2, 0);
  // shield arm (left)
  const armL = new THREE.Group();
  armL.add(boxesMesh([{ x: 0, y: -0.22, z: 0, w: 0.16, h: 0.44, d: 0.16, c: P.armor }]));
  const shield = boxesMesh([
    { x: 0, y: -0.2, z: 0.1, w: 0.5, h: 0.7, d: 0.07, c: P.shield },
    { x: 0, y: -0.2, z: 0.145, w: 0.12, h: 0.45, d: 0.02, c: P.trim },
    { x: 0, y: -0.2, z: 0.145, w: 0.38, h: 0.1, d: 0.02, c: P.trim },
  ]);
  shield.position.set(-0.1, -0.05, 0.05);
  armL.add(shield);
  armL.position.set(-0.4, 1.2, 0);
  // cape: a flat cloth behind the torso, pivoting at the shoulders so it can swing
  const cape = boxesMesh([{ x: 0, y: -0.5, z: -0.04, w: 0.56, h: 1.0, d: 0.06, c: P.cape }, { x: 0, y: -0.95, z: -0.05, w: 0.6, h: 0.14, d: 0.07, c: P.trim }]);
  cape.position.set(0, 1.32, -0.22); cape.castShadow = false;
  g.add(torso, head, legL, legR, armR, armL, cape);
  g.userData = { torso, head, legL, legR, armR, armL, sword, shield, cape };
  return g;
}

export function gruntRig(kind = 'grunt') {
  const pal = {
    grunt: { armor: '#5a5a4a', trim: '#2a2a22', cloth: '#3d4a2e', skin: '#c9a07a', steel: '#b9bec6', shield: '#4a3a2a' },
    shield: { armor: '#6a6a7a', trim: '#c9a24a', cloth: '#2e3a4a', skin: '#c9a07a', steel: '#b9bec6', shield: '#3b4a6a' },
    crossbow: { armor: '#4a4a3a', trim: '#2a2a22', cloth: '#6a4a2e', skin: '#c9a07a', steel: '#b9bec6', shield: '#4a3a2a' },
    swarm: { armor: '#3a3a32', trim: '#2a2a22', cloth: '#5a3a2a', skin: '#c9a07a', steel: '#9a9ea6', shield: '#4a3a2a' },
    captain: { armor: '#2a2a33', trim: '#d8b050', cloth: '#5a1a1a', skin: '#c9a07a', steel: '#e0e4ea', shield: '#5a1a1a' },
    pell: { armor: '#8a6a3a', trim: '#5a3a1a', cloth: '#6a4a2a', skin: '#8a6a3a', steel: '#6a4a2a', shield: '#6a4a2a' },
    pellshield: { armor: '#8a6a3a', trim: '#5a3a1a', cloth: '#6a4a2a', skin: '#8a6a3a', steel: '#6a4a2a', shield: '#4a5a7a' },
    drill: { armor: '#6a6a5a', trim: '#3a3a2a', cloth: '#4a5a3e', skin: '#c9a07a', steel: '#b9bec6', shield: '#4a3a2a' },
    bomber: { armor: '#4a4438', trim: '#2a2a22', cloth: '#6a3a2e', skin: '#c9a07a', steel: '#b9bec6', shield: '#4a3a2a' },
    defender: { armor: '#8d94a3', trim: '#c9a24a', cloth: '#7a2d2d', skin: '#e2b48c', steel: '#d8dde5', shield: '#7a2d2d' },
    drillbow: { armor: '#6a6a5a', trim: '#3a3a2a', cloth: '#5a4a3e', skin: '#c9a07a', steel: '#b9bec6', shield: '#4a3a2a' },
  }[kind];
  const g = knightRig(pal);
  const u = g.userData;
  if (kind !== 'captain' && kind !== 'defender') u.cape.visible = false;
  if (kind === 'grunt' || kind === 'drill') { u.head.add(boxesMesh([{ x: 0, y: 0.2, z: 0, w: 0.42, h: 0.08, d: 0.42, c: '#3a3a32' }, { x: 0, y: 0.3, z: 0, w: 0.2, h: 0.14, d: 0.2, c: '#3a3a32' }])); u.torso.add(boxesMesh([{ x: 0, y: 0.9, z: -0.24, w: 0.5, h: 0.7, d: 0.06, c: '#4a3a28' }])); }
  if (kind === 'shield' || kind === 'captain') {
    u.shield.scale.set(1.5, 1.4, 1); u.shield.position.y = 0.05;
    u.head.add(boxesMesh([{ x: -0.22, y: 0.18, z: 0, w: 0.08, h: 0.3, d: 0.08, c: '#d8cfa0' }, { x: 0.22, y: 0.18, z: 0, w: 0.08, h: 0.3, d: 0.08, c: '#d8cfa0' }, { x: -0.22, y: 0.36, z: 0, w: 0.06, h: 0.12, d: 0.06, c: '#d8cfa0' }, { x: 0.22, y: 0.36, z: 0, w: 0.06, h: 0.12, d: 0.06, c: '#d8cfa0' }]));
  }
  if (kind === 'captain') { u.cape.scale.set(1.3, 1.25, 1); u.torso.add(boxesMesh([{ x: -0.45, y: 1.32, z: 0, w: 0.34, h: 0.2, d: 0.5, c: '#d8b050' }, { x: 0.45, y: 1.32, z: 0, w: 0.34, h: 0.2, d: 0.5, c: '#d8b050' }])); u.sword.scale.set(1.3, 1.3, 1.25); }
  if (kind === 'bomber') { u.sword.visible = false; u.shield.visible = false; u.armR.add(boxesMesh([{ x: 0, y: -0.45, z: 0.1, w: 0.55, h: 0.55, d: 0.55, c: '#22222a' }, { x: 0, y: -0.12, z: 0.1, w: 0.1, h: 0.16, d: 0.1, c: '#c9a24a' }])); u.torso.add(boxesMesh([{ x: -0.3, y: 0.8, z: -0.26, w: 0.5, h: 0.5, d: 0.24, c: '#3a3428' }])); }
  if (kind === 'swarm') { u.head.children[0].visible = false; u.head.add(boxesMesh([{ x: 0, y: 0, z: 0, w: 0.32, h: 0.34, d: 0.32, c: '#c9a07a' }, { x: 0, y: 0.14, z: 0, w: 0.34, h: 0.1, d: 0.34, c: '#3a2a1a' }])); u.torso.rotation.x = 0.25; u.head.position.z = 0.12; }
  if (kind === 'crossbow' || kind === 'drillbow') { u.head.children[0].visible = false; u.head.add(boxesMesh([{ x: 0, y: 0, z: 0, w: 0.38, h: 0.4, d: 0.38, c: '#4a3a2e' }, { x: 0, y: 0.3, z: -0.06, w: 0.22, h: 0.22, d: 0.22, c: '#4a3a2e' }, { x: 0, y: -0.04, z: 0.2, w: 0.24, h: 0.12, d: 0.02, c: '#1a1a22' }])); u.torso.add(boxesMesh([{ x: 0.22, y: 1.0, z: -0.26, w: 0.18, h: 0.6, d: 0.14, c: '#5a3a1a' }, { x: 0.22, y: 1.34, z: -0.26, w: 0.12, h: 0.2, d: 0.12, c: '#d8c8a0' }])); }
  if (kind === 'crossbow' || kind === 'drillbow' || kind === 'defender') {
    g.userData.sword.visible = false;
    g.userData.shield.visible = false;
    const xbow = boxesMesh([
      { x: 0, y: 0, z: 0.3, w: 0.08, h: 0.08, d: 0.7, c: '#3a2a1a' },
      { x: 0, y: 0, z: 0.55, w: 0.7, h: 0.04, d: 0.06, c: '#6a4a2a' },
    ]);
    xbow.position.set(0, -0.4, 0.1);
    g.userData.armR.add(xbow);
  }
  if (kind === 'swarm') { g.scale.set(0.85, 0.85, 0.85); g.userData.shield.visible = false; }
  if (kind === 'hound') {
    // a low quadruped: rebuild the silhouette but keep the userData contract
    for (const ch of [...g.children]) g.remove(ch);
    const body = boxesMesh([{ x: 0, y: 0.55, z: 0, w: 0.55, h: 0.42, d: 1.05, c: '#4a4038' }, { x: 0, y: 0.76, z: -0.14, w: 0.4, h: 0.14, d: 0.5, c: '#3a322c' }]);
    const head = new THREE.Group();
    head.add(boxesMesh([{ x: 0, y: 0, z: 0.12, w: 0.34, h: 0.3, d: 0.42, c: '#4a4038' }, { x: 0, y: -0.05, z: 0.36, w: 0.22, h: 0.18, d: 0.22, c: '#3a322c' }, { x: -0.1, y: 0.2, z: 0, w: 0.09, h: 0.16, d: 0.06, c: '#3a322c' }, { x: 0.1, y: 0.2, z: 0, w: 0.09, h: 0.16, d: 0.06, c: '#3a322c' }, { x: 0, y: 0.02, z: 0.48, w: 0.1, h: 0.06, d: 0.06, c: '#181410' }]));
    head.position.set(0, 0.72, 0.5);
    const mkLeg = () => boxesMesh([{ x: 0, y: -0.22, z: 0, w: 0.14, h: 0.44, d: 0.14, c: '#3f362e' }]);
    const legL = mkLeg(), legR = mkLeg(), armR = new THREE.Group(), armL = new THREE.Group();
    armR.add(mkLeg()); armL.add(mkLeg());
    legL.position.set(-0.18, 0.5, 0.38); legR.position.set(0.18, 0.5, 0.38);
    armR.position.set(0.18, 0.5, -0.38); armL.position.set(-0.18, 0.5, -0.38);
    const tail = boxesMesh([{ x: 0, y: 0.1, z: -0.25, w: 0.1, h: 0.1, d: 0.5, c: '#3a322c' }]); tail.position.set(0, 0.75, -0.55);
    const sword = new THREE.Group(), shield = new THREE.Group(), cape = new THREE.Group(); cape.visible = false;
    g.add(body, head, legL, legR, armR, armL, tail, cape);
    g.userData = { torso: body, head, legL, legR, armR, armL, sword, shield, cape };
  }
  if (kind === 'pell') { g.userData.shield.visible = false; g.userData.sword.visible = false; g.userData.head.children[0].visible = false; g.add(boxesMesh([{ x: 0, y: 1.62, z: 0, w: 0.34, h: 0.34, d: 0.34, c: '#8a6a3a' }, { x: 0, y: 0.3, z: 0, w: 0.18, h: 0.6, d: 0.18, c: '#5a3a1a' }])); g.userData.legL.visible = false; g.userData.legR.visible = false; }
  if (kind === 'pellshield') { g.userData.sword.visible = false; g.userData.head.children[0].visible = false; g.add(boxesMesh([{ x: 0, y: 1.62, z: 0, w: 0.34, h: 0.34, d: 0.34, c: '#8a6a3a' }, { x: 0, y: 0.3, z: 0, w: 0.18, h: 0.6, d: 0.18, c: '#5a3a1a' }])); g.userData.legL.visible = false; g.userData.legR.visible = false; g.userData.shield.scale.set(1.5, 1.4, 1); g.userData.shield.position.y = 0.05; }
  if (kind === 'captain') { g.scale.set(1.45, 1.45, 1.45); }
  return g;
}
