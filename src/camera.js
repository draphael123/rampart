import * as THREE from '../vendor/three.module.js';

// Mouse-orbit chase camera with collision pull-in, auto-settle behind the
// player when the mouse is idle, and a lock-on framing mode.
export class ChaseCam {
  constructor(camera, world) {
    this.cam = camera; this.world = world;
    this.yaw = Math.PI;          // camera sits behind player looking +z at start
    this.pitch = 0.38;
    this.dist = 7.5; this.curDist = 7.5;
    this.target = new THREE.Vector3();
    this.idle = 0;
    this.sens = 0.0022;
    this.shake = 0; this.punch = 0;
    this.lock = null;
    this.tmp = new THREE.Vector3();
  }
  input(dx, dy) {
    if (dx === 0 && dy === 0) return;
    this.yaw -= dx * this.sens; this.pitch += dy * this.sens;
    this.pitch = Math.max(-0.25, Math.min(1.2, this.pitch));
    this.idle = 0;
  }
  // forward vector on XZ for movement relative to camera
  forward() { return { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) }; }
  right() { const f = this.forward(); return { x: -f.z, z: f.x }; }

  update(dt, player, moving) {
    this.idle += dt;
    const p = player.pos;
    // auto-settle: ease yaw to behind the player's facing when idle & moving
    if (this.idle > 0.9 && moving && !this.lock) {
      const want = player.facing + Math.PI;
      let d = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      // only settle when camera is well off-axis, gently
      this.yaw += d * Math.min(1, 0.9 * dt);
    }
    if (this.lock && !this.lock.dead) {
      const lp = this.lock.pos;
      const want = Math.atan2(p.x - lp.x, p.z - lp.z);
      let d = ((want - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.yaw += d * Math.min(1, 4 * dt);
      this.pitch += (0.3 - this.pitch) * Math.min(1, 3 * dt);
    }
    // target: slightly above the player, with look-ahead on velocity
    const v = player.body.vel;
    const lookY = 1.2 + (player.body.grounded ? 0 : Math.max(-0.8, Math.min(0.6, v.y * 0.03)));
    const tx = p.x + v.x * 0.08, tz = p.z + v.z * 0.08;
    this.target.x += (tx - this.target.x) * Math.min(1, 12 * dt);
    this.target.z += (tz - this.target.z) * Math.min(1, 12 * dt);
    // vertical: smooth, but snap when falling far
    const ty = p.y + lookY;
    const ky = player.body.grounded ? 8 : (v.y < -12 ? 14 : 5);
    this.target.y += (ty - this.target.y) * Math.min(1, ky * dt);

    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // collision: raycast from target toward desired camera position
    const o = { x: this.target.x, y: this.target.y, z: this.target.z };
    const d = { x: dir.x, y: dir.y, z: dir.z };
    let want = this.dist;
    const hit = this.world.raycast(o, d, this.dist, b => b.tag !== 'field');
    if (hit) want = Math.max(1.2, hit.t - 0.35);
    // pull in fast, push out slow
    this.curDist += (want - this.curDist) * Math.min(1, (want < this.curDist ? 20 : 3) * dt);
    if (this.punch > 0) this.punch = Math.max(0, this.punch - dt * 4);
    const pos = this.tmp.copy(this.target).addScaledVector(dir, this.curDist - this.punch * 0.8);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      pos.x += (Math.random() - 0.5) * this.shake * 0.5; pos.y += (Math.random() - 0.5) * this.shake * 0.5;
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(this.target.x, this.target.y + 0.2, this.target.z);
  }
}
