import { Body } from './physics.js';

const G = 32;

export const E = {
  grunt:    { hp: 2, speed: 4.2, windup: 0.55, swing: 0.18, recover: 0.6, dmg: 1, reach: 1.6, aggro: 14, stop: 1.3 },
  shield:   { hp: 4, speed: 3.0, windup: 0.75, swing: 0.2, recover: 0.8, dmg: 1, reach: 1.7, aggro: 14, stop: 1.4, guardBreak: 1.6 },
  crossbow: { hp: 2, speed: 0, windup: 1.1, swing: 0.1, recover: 1.6, dmg: 1, reach: 30, aggro: 34, stop: 0, boltSpeed: 22 },
  swarm:    { hp: 1, speed: 5.4, windup: 0.4, swing: 0.15, recover: 0.5, dmg: 1, reach: 1.3, aggro: 40, stop: 1.0 },
  captain:  { hp: 16, speed: 3.4, windup: 0.7, swing: 0.22, recover: 0.7, dmg: 2, reach: 2.6, aggro: 30, stop: 2.0, guardBreak: 1.2, slam: { windup: 1.05, radius: 4.2, dmg: 2 } },
  pell:     { hp: 3, speed: 0, windup: 9, swing: 0.1, recover: 9, dmg: 0, reach: 0, aggro: 0, stop: 0, passive: true },
  pellshield: { hp: 3, speed: 0, windup: 9, swing: 0.1, recover: 9, dmg: 0, reach: 0, aggro: 0, stop: 0, passive: true, guardBreak: 2.0 },
  drill:    { hp: 4, speed: 2.4, windup: 1.1, swing: 0.2, recover: 1.4, dmg: 1, reach: 1.6, aggro: 9, stop: 1.3 },
  defender: { hp: 99, speed: 0, windup: 9, swing: 0.1, recover: 9, dmg: 0, reach: 0, aggro: 0, stop: 0, passive: true, friendly: true },
  drillbow: { hp: 1, speed: 0, windup: 1.4, swing: 0.1, recover: 2.4, dmg: 1, reach: 14, aggro: 12, stop: 0, boltSpeed: 9, bow: true },
};

let _id = 1;

export class Enemy {
  constructor(kind, world, game, x, y, z, opts = {}) {
    this.id = _id++;
    this.kind = kind; this.cfg = E[kind]; this.world = world; this.game = game;
    const s = kind === 'captain' ? 1.45 : kind === 'swarm' ? 0.85 : 1;
    this.scale = s;
    this.body = new Body(0.7 * s, 1.6 * s, 0.7 * s);
    this.body.pos.x = x; this.body.pos.y = y; this.body.pos.z = z; this.body.syncAabb();
    this.hp = this.cfg.hp; this.maxHp = this.cfg.hp;
    this.facing = opts.facing || 0;
    this.state = 'idle'; this.t = 0;
    this.telegraph = 0;       // 0..1 — drives emissive colour (hue channel, not alpha)
    this.stun = 0; this.guardUp = kind === 'shield' || kind === 'captain' || kind === 'pellshield';
    this.guardBroken = 0;
    this.dead = false; this.deathT = 0;
    this.hitIds = new Set();
    this.events = [];
    this.home = { x, y, z };
    this.perch = !!opts.perch;       // crossbowmen never leave
    this.ladder = opts.ladder || null;
    this.climbT = 0;
    this.aggroed = false;
    this.attackCount = 0;
    this.flinchT = 0;
    this.mesh = null;
    this.phase = 1; this.brace = 0; this.slamming = false;
  }
  get pos() { return this.body.pos; }
  fwd() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }
  emit(e) { this.events.push(e); }

  distTo(p) { return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }
  face(p) { this.facing = Math.atan2(p.x - this.pos.x, p.z - this.pos.z); }

  update(dt, player) {
    const b = this.body, c = this.cfg;
    this.t += dt; this.flinchT = Math.max(0, this.flinchT - dt);
    if (this.dead) { this.deathT += dt; return; }
    if (this.cfg.passive) { this.telegraph = 0; b.vel.y -= G * dt; b.move(this.world, 0, b.vel.y * dt, 0); return; }
    const pp = player.pos;
    const d = this.distTo(pp);
    const dy = pp.y - this.pos.y;

    let move = { x: 0, z: 0 };
    let gravity = true;

    if (this.stun > 0) {
      this.stun -= dt; this.telegraph = 0;
      if (this.stun <= 0) { this.state = 'idle'; this.t = 0; if (this.kind === 'shield' || this.kind === 'captain' || this.kind === 'pellshield') this.guardUp = true; }
    } else if (this.state === 'climb') {
      // ladder swarm: climb straight up the ladder path, then drop onto the wall
      gravity = false;
      const L = this.ladder;
      this.climbT += dt;
      b.vel.x = 0; b.vel.z = 0;
      const climbSpeed = 3.2;
      b.pos.y += climbSpeed * dt;
      b.pos.x += (L.x - b.pos.x) * Math.min(1, 6 * dt);
      b.pos.z += (L.z - b.pos.z) * Math.min(1, 6 * dt);
      this.facing = L.facing;
      if (!L.up) { this.die(true); this.emit('fall'); }   // ladder was kicked
      if (b.pos.y >= L.top) {
        b.pos.y = L.top + 0.02; const f = this.fwd();
        b.pos.x += f.x * 0.9; b.pos.z += f.z * 0.9;
        this.state = 'idle'; this.t = 0;
      }
      b.syncAabb();
      return;
    } else {
      switch (this.state) {
        case 'idle':
          this.telegraph = 0;
          if (d < c.aggro && Math.abs(dy) < ((this.kind === 'crossbow' || c.bow) ? 40 : 6)) { this.aggroed = true; this.state = 'chase'; this.t = 0; }
          break;
        case 'chase': {
          this.telegraph = 0;
          this.face(pp);
          const canAttack = (c.bow || this.kind === 'crossbow') ? (d < c.reach && this.game.hasLineOfSight(this, player)) : (d < c.reach + 0.2 && Math.abs(dy) < 1.6);
          if (this.brace > 0) { this.brace -= dt; this.telegraph = 0.35; if (this.brace <= 0) this.emit('unbrace'); break; }
          if (c.slam && d < c.slam.radius - 0.4 && Math.abs(dy) < 2 && (this.phase === 2 ? this.attackCount % 2 === 1 : this.attackCount % 3 === 2) && this.game.requestAttackToken(this)) { this.state = 'slamwind'; this.t = 0; this.slamming = true; this.emit('slamwind'); }
          else if (canAttack && this.game.requestAttackToken(this)) { this.state = 'windup'; this.t = 0; this.slamming = false; this.emit('windup'); }
          else if (!this.perch && d > c.stop) {
            // blocked by a pillar/crate: slide sideways for a moment, alternating sides
            if (b.hitWall && !this.sideT) { this.sideT = 0.7; this.side = this.side ? -this.side : (Math.random() < 0.5 ? 1 : -1); }
            let dir = this.fwd();
            if (this.sideT > 0) { this.sideT -= dt; const a = this.facing + this.side * 1.25; dir = { x: Math.sin(a), z: Math.cos(a) }; if (this.sideT <= 0) this.sideT = 0; }
            // don't walk off ledges: probe ahead along the chosen direction (body-width wide)
            const ahead = { x: this.pos.x + dir.x * (0.6 + b.w * 0.5), y: this.pos.y - 1.5, z: this.pos.z + dir.z * (0.6 + b.w * 0.5) };
            const hw = b.w * 0.5;
            const probe = { min: { x: ahead.x - hw, y: ahead.y, z: ahead.z - hw }, max: { x: ahead.x + hw, y: this.pos.y + 0.3, z: ahead.z + hw } };
            const floor = this.world.near(probe, 0).some(bx => bx.max.y <= this.pos.y + 0.5 && bx.max.y >= this.pos.y - 0.6 && overlapXZ(probe, bx) && bx.tag !== 'field');
            if (floor || !b.grounded) move = dir; else if (this.sideT > 0) { this.sideT = 0; this.side = -this.side; }
          }
          if (d > c.aggro * 1.6) { this.state = 'idle'; this.t = 0; }
          break;
        }
        case 'slamwind': {
          const w = c.slam.windup * (this.phase === 2 ? 0.8 : 1);
          this.telegraph = Math.min(1, this.t / w); b.vel.x *= 0.8; b.vel.z *= 0.8;
          if (this.t >= w) { this.state = 'slam'; this.t = 0; this.hitDone = false; this.attackCount++; this.emit('slam'); }
          break;
        }
        case 'slam':
          this.telegraph = 1;
          if (!this.hitDone) { this.hitDone = true; this.game.enemySlam(this, c.slam.radius, c.slam.dmg); }
          if (this.t >= 0.25) { this.state = 'recover'; this.t = 0; this.game.releaseAttackToken(this); if (this.phase === 2) { this.brace = 2.4; this.emit('brace'); } }
          break;
        case 'windup':
          this.telegraph = Math.min(1, this.t / c.windup);
          if (this.t < c.windup * 0.6) this.face(pp);      // tracks early, commits late
          if (this.t >= c.windup) { this.state = 'swing'; this.t = 0; this.hitDone = false; this.attackCount++; this.emit('swing'); }
          break;
        case 'swing':
          this.telegraph = 1;
          if (!this.hitDone) {
            this.hitDone = true;
            if (this.kind === 'crossbow' || c.bow) this.game.fireBolt(this, player);
            else {
              const f = this.fwd();
              const step = this.kind === 'captain' ? 6 : 4;
              b.vel.x = f.x * step; b.vel.z = f.z * step;
              const reach = c.reach + 0.3;
              const cx = this.pos.x + f.x * reach * 0.55, cz = this.pos.z + f.z * reach * 0.55;
              const r = reach * 0.6;
              this.game.enemyHit(this, { min: { x: cx - r, y: this.pos.y, z: cz - r }, max: { x: cx + r, y: this.pos.y + 2 * this.scale, z: cz + r } }, c.dmg, { kb: this.kind === 'captain' ? 12 : 7, up: this.kind === 'captain' ? 6 : 4 });
            }
          }
          if (this.t >= c.swing) { this.state = 'recover'; this.t = 0; this.game.releaseAttackToken(this); }
          break;
        case 'recover':
          this.telegraph = 0;
          if (this.t >= c.recover) { this.state = 'chase'; this.t = 0; }
          break;
        case 'flinch':
          this.telegraph = 0;
          if (this.t >= 0.28) { this.state = 'chase'; this.t = 0; }
          break;
      }
    }

    // physics
    const sp = c.speed;
    const k = Math.min(1, 10 * dt);
    if (this.state === 'chase' && (move.x || move.z)) { b.vel.x += (move.x * sp - b.vel.x) * k; b.vel.z += (move.z * sp - b.vel.z) * k; }
    else { const f = Math.max(0, 1 - 8 * dt); b.vel.x *= f; b.vel.z *= f; }
    if (gravity) b.vel.y -= G * dt;
    b.move(this.world, b.vel.x * dt, b.vel.y * dt, b.vel.z * dt);
    if (b.pos.y < -8) this.die(true);
  }

  // returns 'guard' | 'hit' | 'dead'
  takeHit(dmg, fromPos, opts = {}) {
    if (this.dead) return 'dead';
    if (this.cfg.friendly) return 'dup';
    if (opts.once) { if (this.hitIds.has(opts.once)) return 'dup'; this.hitIds.add(opts.once); }
    const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const f = this.fwd();
    const dot = (dx / len) * f.x + (dz / len) * f.z;
    if (this.brace > 0 && !opts.breaksGuard) { this.emit('clank'); return 'guard'; }
    if (this.brace > 0 && opts.breaksGuard) { this.brace = 0; this.guardUp = false; this.stun = 1.8; this.emit('guardbreak'); this.game.releaseAttackToken(this); return 'guardbreak'; }
    if (this.guardUp && this.stun <= 0 && dot > 0.2 && !opts.breaksGuard && !opts.fromAbove) {
      this.emit('clank');
      return 'guard';
    }
    if (this.guardUp && opts.breaksGuard && dot > 0.2) {
      this.guardUp = false; this.stun = this.cfg.guardBreak || 1.2; this.emit('guardbreak');
      this.game.releaseAttackToken(this);
      this.body.vel.x = -(dx / len) * 3; this.body.vel.z = -(dz / len) * 3;
      return 'guardbreak';
    }
    this.hp -= dmg;
    if (this.cfg.slam && this.phase === 1 && this.hp <= this.maxHp / 2) { this.phase = 2; this.emit('phase2'); this.game.onBossPhase(this); }
    this.body.vel.x = -(dx / len) * (opts.kb || 5); this.body.vel.z = -(dz / len) * (opts.kb || 5);
    this.body.vel.y = opts.up || 2; this.body.grounded = false;
    this.flinchT = 0.15;
    this.emit('hit');
    if (this.hp <= 0) { this.die(); return 'dead'; }
    // interrupt (captain doesn't flinch from lights)
    if (!(this.kind === 'captain' && (opts.kind === 'light' || this.phase === 2))) {
      if (this.state === 'windup' || this.state === 'swing') this.game.releaseAttackToken(this);
      this.state = 'flinch'; this.t = 0; this.telegraph = 0;
    }
    return 'hit';
  }

  die(silent = false) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0; this.telegraph = 0;
    this.game.releaseAttackToken(this);
    if (!silent) this.emit('die');
    this.game.onEnemyDied(this);
  }
}

function overlapXZ(a, b) {
  return a.min.x < b.max.x && a.max.x > b.min.x && a.min.z < b.max.z && a.max.z > b.min.z;
}

export class Bolt {
  constructor(x, y, z, vx, vy, vz, owner) {
    this.pos = { x, y, z }; this.vel = { x: vx, y: vy, z: vz }; this.owner = owner;
    this.life = 3; this.dead = false; this.mesh = null;
  }
  update(dt, world, game) {
    this.life -= dt; if (this.life <= 0) this.dead = true;
    const nx = this.pos.x + this.vel.x * dt, ny = this.pos.y + this.vel.y * dt, nz = this.pos.z + this.vel.z * dt;
    const hit = world.raycast(this.pos, this.vel, dt, b => !b.oneWay);
    if (hit) { this.dead = true; game.fx('boltstick', { x: this.pos.x + this.vel.x * hit.t, y: this.pos.y + this.vel.y * hit.t, z: this.pos.z + this.vel.z * hit.t }); return; }
    this.pos.x = nx; this.pos.y = ny; this.pos.z = nz;
    this.vel.y -= 6 * dt;
    // player hit
    const p = game.player;
    if (!p.dead && Math.abs(this.pos.x - p.pos.x) < 0.5 && Math.abs(this.pos.z - p.pos.z) < 0.5 && this.pos.y > p.pos.y && this.pos.y < p.pos.y + 1.7) {
      const r = p.takeHit(1, this.owner.pos, { kb: 5, up: 3 });
      if (r === 'parried') { this.vel.x *= -1.3; this.vel.z *= -1.3; this.vel.y = 2; this.owner = p; this.life = 2; game.fx('parry', this.pos); game.boltParried = true; return; }
      if (r !== 'iframe') this.dead = true;
    }
    // parried bolt hits enemies
    if (this.owner === p) {
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (Math.abs(this.pos.x - e.pos.x) < 0.6 && Math.abs(this.pos.z - e.pos.z) < 0.6 && this.pos.y > e.pos.y && this.pos.y < e.pos.y + 1.8 * e.scale) {
          e.takeHit(2, this.pos, { kb: 4, up: 2, breaksGuard: true }); this.dead = true; game.fx('hit', this.pos); return;
        }
      }
    }
  }
}
