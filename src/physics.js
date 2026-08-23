// RAMPART physics — axis-separated AABB mover against a world of static boxes
// and kinematic (moving) platforms. Everything in metres. Deliberately small:
// castle geometry is boxes, and a hand-rolled mover gives us coyote time,
// step-up assist and carried-by-platform for free.

export class Box {
  constructor(x, y, z, w, h, d, opts = {}) {
    this.min = { x: x - w / 2, y: y, z: z - d / 2 };
    this.max = { x: x + w / 2, y: y + h, z: z + d / 2 };
    this.w = w; this.h = h; this.d = d;
    this.moving = !!opts.moving;     // kinematic platform
    this.vel = { x: 0, y: 0, z: 0 };  // current velocity (platforms)
    this.tag = opts.tag || 'solid';
    this.mesh = null;
    this.oneWay = !!opts.oneWay;
    this.enabled = true;
  }
  get cx() { return (this.min.x + this.max.x) / 2; }
  get cz() { return (this.min.z + this.max.z) / 2; }
  get top() { return this.max.y; }
  setCenter(x, y, z) {
    // y = bottom
    this.min.x = x - this.w / 2; this.max.x = x + this.w / 2;
    this.min.y = y; this.max.y = y + this.h;
    this.min.z = z - this.d / 2; this.max.z = z + this.d / 2;
  }
}

export function overlap(a, b) {
  return a.min.x < b.max.x && a.max.x > b.min.x &&
         a.min.y < b.max.y && a.max.y > b.min.y &&
         a.min.z < b.max.z && a.max.z > b.min.z;
}

export class World {
  constructor() {
    this.boxes = [];
    this.platforms = [];
  }
  add(box) { this.boxes.push(box); if (box.moving) this.platforms.push(box); return box; }
  remove(box) {
    const i = this.boxes.indexOf(box); if (i >= 0) this.boxes.splice(i, 1);
    const j = this.platforms.indexOf(box); if (j >= 0) this.platforms.splice(j, 1);
  }
  // candidate boxes near a query AABB (broadphase is a plain filter; the
  // world is a few hundred boxes, fine)
  near(aabb, pad = 0.5) {
    const out = [];
    for (const b of this.boxes) {
      if (!b.enabled) continue;
      if (aabb.min.x - pad < b.max.x && aabb.max.x + pad > b.min.x &&
          aabb.min.y - pad < b.max.y && aabb.max.y + pad > b.min.y &&
          aabb.min.z - pad < b.max.z && aabb.max.z + pad > b.min.z) out.push(b);
    }
    return out;
  }
  // raycast against boxes; returns nearest t in [0,maxT] or null
  raycast(o, d, maxT, filter) {
    let best = null;
    for (const b of this.boxes) {
      if (!b.enabled) continue;
      if (filter && !filter(b)) continue;
      let tmin = 0, tmax = maxT;
      let ok = true;
      for (const ax of ['x', 'y', 'z']) {
        if (Math.abs(d[ax]) < 1e-9) {
          if (o[ax] < b.min[ax] || o[ax] > b.max[ax]) { ok = false; break; }
        } else {
          let t1 = (b.min[ax] - o[ax]) / d[ax];
          let t2 = (b.max[ax] - o[ax]) / d[ax];
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
          if (tmin > tmax) { ok = false; break; }
        }
      }
      if (ok && (best === null || tmin < best.t)) best = { t: tmin, box: b };
    }
    return best;
  }
}

// A Body is a moving AABB (player/enemy). pos = bottom-centre.
export class Body {
  constructor(w, h, d) {
    this.w = w; this.h = h; this.d = d;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.ground = null;       // box we're standing on
    this.hitWall = false;
    this.hitCeil = false;
    this.stepUp = 0.45;       // step-up assist height
    this.aabb = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    this.syncAabb();
  }
  syncAabb() {
    const a = this.aabb, p = this.pos;
    a.min.x = p.x - this.w / 2; a.max.x = p.x + this.w / 2;
    a.min.y = p.y;              a.max.y = p.y + this.h;
    a.min.z = p.z - this.d / 2; a.max.z = p.z + this.d / 2;
    return a;
  }
  // Move by delta, resolving against the world. Returns nothing; sets flags.
  move(world, dx, dy, dz) {
    this.hitWall = false; this.hitCeil = false;
    const wasGrounded = this.grounded;
    // carried by platform
    if (this.ground && this.ground.moving && wasGrounded) {
      // the platform already moved this step: ride it. Snap feet to its top
      // first so the X/Z passes don't see us as inside it and shove us off.
      dx += this.ground.vel.x; dz += this.ground.vel.z;
      if (this.ground.vel.y >= 0 && this.vel.y <= 0) { this.pos.y = this.ground.max.y; this.syncAabb(); }
      else dy += this.ground.vel.y;
    }
    this.grounded = false; this.ground = null;
    // X
    if (dx !== 0) this._axis(world, 'x', dx, wasGrounded);
    if (dz !== 0) this._axis(world, 'z', dz, wasGrounded);
    this._axisY(world, dy);
    this.syncAabb();
  }
  _axis(world, ax, delta, wasGrounded) {
    this.pos[ax] += delta; this.syncAabb();
    const hits = world.near(this.aabb, 0).filter(b => !b.oneWay && overlap(this.aabb, b));
    if (hits.length === 0) return;
    // step-up assist: try lifting
    if (wasGrounded && this.stepUp > 0) {
      const lift = this._stepHeight(hits);
      if (lift > 0 && lift <= this.stepUp) {
        this.pos.y += lift + 0.001; this.syncAabb();
        const again = world.near(this.aabb, 0).filter(b => !b.oneWay && overlap(this.aabb, b));
        if (again.length === 0) return;
        this.pos.y -= lift + 0.001; this.syncAabb();
      }
    }
    // push out along axis
    const half = ax === 'x' ? this.w / 2 : this.d / 2;
    for (const b of hits) {
      if (delta > 0) this.pos[ax] = Math.min(this.pos[ax], b.min[ax] - half - 0.001);
      else this.pos[ax] = Math.max(this.pos[ax], b.max[ax] + half + 0.001);
    }
    this.vel[ax] = 0; this.hitWall = true;
    this.syncAabb();
  }
  _stepHeight(hits) {
    let top = -Infinity;
    for (const b of hits) top = Math.max(top, b.max.y);
    return top - this.pos.y;
  }
  _axisY(world, dy) {
    this.pos.y += dy; this.syncAabb();
    const cands = world.near(this.aabb, 0);
    for (const b of cands) {
      if (!overlap(this.aabb, b)) continue;
      if (dy <= 0) {
        // landing: only if we came from above (feet were above top)
        const prevFeet = this.pos.y - dy;
        if (b.oneWay && prevFeet < b.max.y - 0.01) continue;
        if (!b.oneWay || prevFeet >= b.max.y - 0.01) {
          if (prevFeet >= b.max.y - 0.05 || !b.oneWay) {
            // only land if horizontally overlapping (already true) and we're
            // not deep inside (side contact handled by X/Z pass)
            const pen = b.max.y - this.pos.y;
            if (pen >= 0 && pen <= Math.abs(dy) + 0.06) {
              this.pos.y = b.max.y; this.grounded = true; this.ground = b;
              if (this.vel.y < 0) this.vel.y = 0;
            }
          }
        }
      } else {
        if (b.oneWay) continue;
        const pen = this.aabb.max.y - b.min.y;
        if (pen >= 0 && pen <= dy + 0.06) {
          this.pos.y = b.min.y - this.h - 0.001; this.vel.y = 0; this.hitCeil = true;
        }
      }
      this.syncAabb();
    }
    // ground probe (so tiny dy=0 still reports grounded)
    if (!this.grounded && dy <= 0) {
      const probe = { min: { x: this.aabb.min.x, y: this.pos.y - 0.08, z: this.aabb.min.z },
                      max: { x: this.aabb.max.x, y: this.pos.y + 0.02, z: this.aabb.max.z } };
      for (const b of world.near(probe, 0)) {
        if (overlap(probe, b) && b.max.y <= this.pos.y + 0.02 && b.max.y >= this.pos.y - 0.08) {
          this.pos.y = b.max.y; this.grounded = true; this.ground = b; if (this.vel.y < 0) this.vel.y = 0; break;
        }
      }
    }
  }
}
