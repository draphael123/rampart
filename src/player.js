import { Body } from './physics.js';

// All tuning in one place (live-editable from the T panel).
export const P = {
  runSpeed: 7.5, accel: 60, airAccel: 30, friction: 50,
  gravity: 32, jumpV: 10.4, jumpSpeedBonus: 0.22, jumpCut: 0.45,
  coyote: 0.12, buffer: 0.12, fallMax: 28,
  dashSpeed: 19, dashTime: 0.17, dashCooldown: 0.35, dashIframes: 0.2,
  light: [
    { dmg: 1, t: 0.32, hit: [0.08, 0.2], lunge: 3.0 },
    { dmg: 1, t: 0.34, hit: [0.1, 0.22], lunge: 3.0 },
    { dmg: 2, t: 0.5, hit: [0.16, 0.3], lunge: 5.0 },
  ],
  comboWindow: 0.22,
  heavyCharge: 0.55, heavyDmg: 3, heavyT: 0.62, heavyHit: [0.18, 0.34], heavyLunge: 4.0,
  rushSpeed: 12.5, rushTime: 0.9, rushTurn: 2.6, rushDmg: 1, rushCooldown: 0.8,
  longJumpV: 9.2, longJumpH: 14.5,
  bopBounce: 9.5, bopBounceHeld: 12,
  poundFall: -26, poundDmg: 2, poundRadius: 2.6, poundStun: 0.25,
  blockArc: 0.35,           // cos of half-angle (~70 deg half)
  parryWindow: 0.15,
  hurtTime: 0.35, iframes: 0.8,
  hp: 6,
  reach: 1.7, arc: 1.1,     // light hitbox depth / half-width
};

export const S = {
  IDLE: 'idle', AIR: 'air', DASH: 'dash', LIGHT: 'light', HEAVY_CHARGE: 'charge', HEAVY: 'heavy',
  RUSH: 'rush', POUND: 'pound', BLOCK: 'block', HURT: 'hurt', DEAD: 'dead',
};

export class Player {
  constructor(world, game) {
    this.world = world; this.game = game;
    this.body = new Body(0.7, 1.6, 0.7);
    this.body.stepUp = 0.45;
    this.facing = 0;           // yaw; forward = (sin, cos)
    this.hp = P.hp;
    this.state = S.IDLE; this.t = 0;
    this.coyote = 0; this.buffer = 0;
    this.jumps = 0; this.airDash = true; this.dashCd = 0; this.bashCd = 0;
    this.combo = 0; this.comboT = 0; this.hitDone = false;
    this.charge = 0; this.iframes = 0;
    this.blockT = 0;           // time block has been held (parry window)
    this.events = [];          // for sfx/vfx: strings
    this.lockTarget = null;
    this.dashDir = { x: 0, z: 0 };
    this.lastGroundPos = { x: 0, y: 0, z: 0 };
    this.bashId = 0;
    this.kills = 0;
    this.stats = { hitsLanded: 0, hitsTaken: 0, parries: 0 };
  }
  get pos() { return this.body.pos; }
  get dead() { return this.state === S.DEAD; }
  fwd() { return { x: Math.sin(this.facing), z: Math.cos(this.facing) }; }
  emit(e) { this.events.push(e); }

  canAct() { return [S.IDLE, S.AIR, S.BLOCK].includes(this.state); }

  // Hitbox in front of the player (world AABB approx)
  attackBox(depth = P.reach, half = P.arc, dmg = 1, kind = 'light') {
    const f = this.fwd();
    const cx = this.pos.x + f.x * (0.3 + depth / 2), cz = this.pos.z + f.z * (0.3 + depth / 2);
    const r = Math.max(depth / 2, half);
    return { min: { x: cx - r, y: this.pos.y + 0.1, z: cz - r }, max: { x: cx + r, y: this.pos.y + 1.9, z: cz + r }, dmg, kind, owner: this };
  }

  update(dt, inp) {
    const b = this.body;
    this.t += dt;
    this.coyote = Math.max(0, this.coyote - dt); this.buffer = Math.max(0, this.buffer - dt);
    this.dashCd = Math.max(0, this.dashCd - dt); this.bashCd = Math.max(0, this.bashCd - dt);
    this.iframes = Math.max(0, this.iframes - dt); this.comboT = Math.max(0, this.comboT - dt);
    if (inp.jump) this.buffer = P.buffer;

    if (b.grounded) { this.coyote = P.coyote; this.jumps = 0; this.airDash = true; this.lastGroundPos = { x: b.pos.x, y: b.pos.y, z: b.pos.z }; }

    // ---- movement intent (camera-relative, already in inp.mx/mz)
    const wish = { x: inp.mx, z: inp.mz };
    let wlen = Math.hypot(wish.x, wish.z);
    if (wlen > 1) { wish.x /= wlen; wish.z /= wlen; wlen = 1; }

    let controlMove = true, gravity = true, canTurn = true;
    let speedMul = 1;

    switch (this.state) {
      case S.DEAD: controlMove = false; canTurn = false; break;
      case S.HURT:
        controlMove = false; canTurn = false;
        if (this.t >= P.hurtTime) this.setState(b.grounded ? S.IDLE : S.AIR);
        break;
      case S.IDLE:
        if (!b.grounded && this.coyote <= 0) this.setState(S.AIR);
        break;
      case S.AIR:
        if (b.grounded) { this.setState(S.IDLE); this.emit('land'); }
        break;
      case S.BLOCK:
        this.blockT += dt; speedMul = 0.35;
        if (!inp.block) this.setState(b.grounded ? S.IDLE : S.AIR);
        break;
      case S.DASH:
        controlMove = false; gravity = false; canTurn = false;
        b.vel.x = this.dashDir.x * P.dashSpeed; b.vel.z = this.dashDir.z * P.dashSpeed; b.vel.y = 0;
        if (this.t >= P.dashTime) { b.vel.x *= 0.45; b.vel.z *= 0.45; this.setState(b.grounded ? S.IDLE : S.AIR); }
        break;
      case S.LIGHT: {
        const a = P.light[this.combo];
        controlMove = false; canTurn = this.t < a.hit[0];
        if (this.t < a.hit[1]) { const f = this.fwd(); b.vel.x = f.x * a.lunge; b.vel.z = f.z * a.lunge; }
        else { b.vel.x *= 0.8; b.vel.z *= 0.8; }
        if (!this.hitDone && this.t >= a.hit[0] && this.t <= a.hit[1]) {
          this.hitDone = true;
          this.game.playerHit(this.attackBox(P.reach, P.arc, a.dmg, 'light'), { kb: this.combo === 2 ? 9 : 4, up: this.combo === 2 ? 5 : 2 });
        }
        // buffered next combo
        if (this.t >= a.hit[1] && inp.light && this.combo < 2) { this.combo++; this.t = 0; this.hitDone = false; this.emit('swing'); break; }
        if (this.t >= a.t) { this.comboT = P.comboWindow; this.setState(b.grounded ? S.IDLE : S.AIR); }
        break;
      }
      case S.HEAVY_CHARGE:
        speedMul = 0.25; this.charge += dt;
        if (!inp.heavyHeld || this.charge >= P.heavyCharge * 2.2) {
          this.setState(S.HEAVY); this.hitDone = false;
          this.emit(this.charge >= P.heavyCharge ? 'heavyrelease' : 'heavyweak');
        }
        break;
      case S.HEAVY: {
        controlMove = false; canTurn = this.t < P.heavyHit[0];
        const full = this.charge >= P.heavyCharge;
        if (this.t < P.heavyHit[1]) { const f = this.fwd(); b.vel.x = f.x * P.heavyLunge; b.vel.z = f.z * P.heavyLunge; }
        else { b.vel.x *= 0.8; b.vel.z *= 0.8; }
        if (!this.hitDone && this.t >= P.heavyHit[0]) {
          this.hitDone = true;
          this.game.playerHit(this.attackBox(P.reach + 0.4, P.arc + 0.3, full ? P.heavyDmg : 2, 'heavy'), { kb: 11, up: 6, breaksGuard: true });
        }
        if (this.t >= P.heavyT) { this.charge = 0; this.setState(b.grounded ? S.IDLE : S.AIR); }
        break;
      }
      case S.RUSH: {
        controlMove = false; canTurn = false;
        // steer the charge toward the stick, slowly — a bull, not a car
        if (wlen > 0.2) {
          const want = Math.atan2(wish.x, wish.z); let dd = ((want - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          const turn = Math.max(-P.rushTurn * dt, Math.min(P.rushTurn * dt, dd)); this.facing += turn;
          this.dashDir = this.fwd();
        }
        b.vel.x = this.dashDir.x * P.rushSpeed; b.vel.z = this.dashDir.z * P.rushSpeed;
        this.game.playerHit(this.attackBox(1.2, 0.9, P.rushDmg, 'bash'), { kb: 13, up: 4, breaksGuard: true, once: 'rush' + this.bashId });
        // jump out of a charge = LONG JUMP
        if (this.buffer > 0 && b.grounded) {
          this.buffer = 0; this.cutDone = true; this.longJump = true;
          b.vel.y = P.longJumpV; b.vel.x = this.dashDir.x * P.longJumpH; b.vel.z = this.dashDir.z * P.longJumpH;
          b.grounded = false; this.setState(S.AIR); this.emit('longjump'); break;
        }
        if (this.t >= P.rushTime || !inp.bashHeld || b.hitWall) { if (b.hitWall) this.emit('thud'); b.vel.x *= 0.35; b.vel.z *= 0.35; this.setState(b.grounded ? S.IDLE : S.AIR); }
        break;
      }
      case S.POUND:
        controlMove = false; gravity = false; canTurn = false;
        if (this.t < 0.12) { b.vel.x = 0; b.vel.z = 0; b.vel.y = 2; }   // hang
        else { b.vel.x = 0; b.vel.z = 0; b.vel.y = P.poundFall; }
        if (b.grounded && this.t > 0.12) {
          this.game.playerPound(this.pos, P.poundRadius, P.poundDmg);
          this.emit('pound'); this.setState(S.IDLE);
        }
        break;
    }

    // ---- actions (priority order)
    if (this.canAct()) {
      if (inp.block && this.state !== S.BLOCK && b.grounded) { this.setState(S.BLOCK); this.blockT = 0; this.emit('block'); }
      if (inp.pound && !b.grounded && this.state !== S.BLOCK) { this.setState(S.POUND); this.emit('poundstart'); }
      else if (inp.bash && this.bashCd <= 0 && b.grounded) {
        this.bashCd = P.rushCooldown; this.bashId++;
        const d = wlen > 0.2 ? { x: wish.x / wlen, z: wish.z / wlen } : this.fwd();
        this.dashDir = d; this.facing = Math.atan2(d.x, d.z);
        this.setState(S.RUSH); this.emit('bash');
      }
      else if (inp.dash && this.dashCd <= 0 && (b.grounded || this.airDash)) {
        if (!b.grounded) this.airDash = false;
        this.dashCd = P.dashCooldown; this.iframes = Math.max(this.iframes, P.dashIframes);
        const d = wlen > 0.2 ? { x: wish.x / wlen, z: wish.z / wlen } : this.fwd();
        this.dashDir = d; this.facing = Math.atan2(d.x, d.z);
        this.setState(S.DASH); this.emit('dash');
      }
      else if (inp.light && this.state !== S.BLOCK) {
        this.combo = (this.comboT > 0 && this.combo < 2) ? this.combo + 1 : 0;
        this.faceToward(wish, wlen);
        this.setState(S.LIGHT); this.hitDone = false; this.emit('swing');
      }
      else if (inp.heavy && this.state !== S.BLOCK && b.grounded) {
        this.faceToward(wish, wlen);
        this.setState(S.HEAVY_CHARGE); this.charge = 0; this.emit('charge');
      }
      else if (this.buffer > 0 && this.state !== S.BLOCK) {
        if (b.grounded || this.coyote > 0) { const sp = Math.hypot(b.vel.x, b.vel.z); b.vel.y = P.jumpV + sp * P.jumpSpeedBonus; this.jumps = 1; this.cutDone = false; this.coyote = 0; this.buffer = 0; b.grounded = false; this.setState(S.AIR); this.emit('jump'); }
      }
    }
    // variable jump height
    if (this.state === S.AIR && !inp.jumpHeld && b.vel.y > 0 && this.jumps >= 1 && !this.cutDone) { b.vel.y *= P.jumpCut; this.cutDone = true; }

    if (b.grounded) this.longJump = false;
    // ---- horizontal physics
    if (controlMove) {
      const acc = b.grounded ? P.accel : (this.longJump ? P.airAccel * 0.35 : P.airAccel);
      // a long jump keeps its momentum: steering never slows you below your current speed
      const spd = this.longJump ? Math.max(P.runSpeed, Math.hypot(b.vel.x, b.vel.z)) : P.runSpeed;
      const target = { x: wish.x * spd * speedMul, z: wish.z * spd * speedMul };
      if (wlen > 0.05) {
        const k = Math.min(1, acc / P.runSpeed * dt);
        b.vel.x += (target.x - b.vel.x) * k;
        b.vel.z += (target.z - b.vel.z) * k;
        if (canTurn && this.state !== S.BLOCK) this.facing = Math.atan2(wish.x, wish.z);
      } else if (b.grounded) {
        const f = Math.max(0, 1 - P.friction * dt / P.runSpeed);
        b.vel.x *= f; b.vel.z *= f;
      } else {
        const drag = this.longJump ? 0.08 : 0.6;
        b.vel.x *= (1 - drag * dt); b.vel.z *= (1 - drag * dt);
      }
      if (this.lockTarget && (this.state === S.BLOCK || wlen < 0.05)) {
        const tp = this.lockTarget.pos;
        this.facing = Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z);
      }
    }
    if (gravity) { b.vel.y -= P.gravity * dt; if (b.vel.y < -P.fallMax) b.vel.y = -P.fallMax; }

    if (this.state !== S.DEAD) b.move(this.world, b.vel.x * dt, b.vel.y * dt, b.vel.z * dt);
    // BOP: landing on a foe's head bounces you and hurts them (platforming IS combat)
    if (!b.grounded && b.vel.y < -1 && this.state !== S.POUND && this.iframes <= 0) {
      for (const e of this.game.enemies) {
        if (e.dead || e.cfg.friendly) continue;   // passive pells ARE boppable (drill 4 needs it)
        const top = e.pos.y + e.body.h;
        if (this.pos.y > top - 0.45 && this.pos.y < top + 0.15 && Math.abs(e.pos.x - this.pos.x) < 0.5 + e.body.w * 0.5 && Math.abs(e.pos.z - this.pos.z) < 0.5 + e.body.d * 0.5) {
          e.takeHit(1, { x: this.pos.x, y: this.pos.y, z: this.pos.z }, { fromAbove: true, kind: 'bop', kb: 2, up: 0 });
          b.vel.y = inp.jumpHeld ? P.bopBounceHeld : P.bopBounce; this.cutDone = true; this.airDash = true; this.dashCd = 0;
          this.emit('bop'); this.game.onBop(e); break;
        }
      }
    }
    if (b.hitCeil && b.vel.y > 0) b.vel.y = 0;

    if (b.pos.y < -44 && this.state !== S.DEAD) this.game.playerFell();
  }

  faceToward(wish, wlen) {
    if (this.lockTarget) { const tp = this.lockTarget.pos; this.facing = Math.atan2(tp.x - this.pos.x, tp.z - this.pos.z); }
    else if (wlen > 0.2) this.facing = Math.atan2(wish.x, wish.z);
  }

  setState(s) { this.state = s; this.t = 0; }

  // Returns 'blocked' | 'parried' | 'hit' | 'iframe' | 'dead'
  takeHit(dmg, fromPos, opts = {}) {
    if (this.state === S.DEAD) return 'dead';
    if (this.iframes > 0 || this.state === S.DASH) return 'iframe';
    const dx = fromPos.x - this.pos.x, dz = fromPos.z - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const f = this.fwd();
    const dot = (dx / len) * f.x + (dz / len) * f.z;
    if (this.state === S.BLOCK && dot > P.blockArc && !opts.unblockable) {
      if (this.blockT <= P.parryWindow) { this.stats.parries++; this.emit('parry'); return 'parried'; }
      this.emit('blocked');
      this.body.vel.x -= (dx / len) * 4; this.body.vel.z -= (dz / len) * 4;
      return 'blocked';
    }
    this.hp -= dmg; this.stats.hitsTaken++;
    this.iframes = P.iframes;
    this.body.vel.x = -(dx / len) * (opts.kb || 7); this.body.vel.z = -(dz / len) * (opts.kb || 7); this.body.vel.y = opts.up || 4;
    this.body.grounded = false;
    this.charge = 0; this.combo = 0;
    this.emit('hurt');
    if (this.hp <= 0) { this.hp = 0; this.setState(S.DEAD); this.emit('die'); }
    else this.setState(S.HURT);
    return 'hit';
  }
}
