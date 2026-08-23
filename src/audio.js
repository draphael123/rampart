// Tiny WebAudio synth — no assets. Each sfx is a short recipe.
export class Audio {
  constructor() { this.ctx = null; this.vol = 0.5; this.last = {}; }
  resume() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination); } catch (e) { this.ctx = null; } } if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  tone(f0, f1, dur, type = 'square', g = 0.3, delay = 0) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type; const t = c.currentTime + delay;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, g = 0.3, hp = 800, delay = 0) {
    const c = this.ctx; if (!c) return;
    const n = Math.floor(c.sampleRate * dur); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const gn = c.createGain(); gn.gain.value = g; s.connect(f); f.connect(gn); gn.connect(this.master); s.start(c.currentTime + delay);
  }
  ring(f, dur, g = 0.2, delay = 0) { const c = this.ctx; if (!c) return; for (const [m, gg] of [[1, 1], [2.76, 0.5], [5.4, 0.3], [8.9, 0.15]]) { const o = c.createOscillator(), gn = c.createGain(); o.type = 'sine'; o.frequency.value = f * m; const t = c.currentTime + delay; gn.gain.setValueAtTime(g * gg, t); gn.gain.exponentialRampToValueAtTime(0.0005, t + dur / (1 + m * 0.3)); o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + dur + 0.05); } }
  thump(f0, dur, g = 0.3, delay = 0) { const c = this.ctx; if (!c) return; const o = c.createOscillator(), gn = c.createGain(); o.type = 'sine'; const t = c.currentTime + delay; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(25, f0 * 0.3), t + dur); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + dur + 0.02); }
  whoosh(dur, g = 0.2, f0 = 400, f1 = 2400, delay = 0) { const c = this.ctx; if (!c) return; const n = Math.floor(c.sampleRate * dur); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) { const e = Math.sin(Math.PI * i / n); d[i] = (Math.random() * 2 - 1) * e * e; } const src = c.createBufferSource(); src.buffer = buf; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2; const t = c.currentTime + delay; bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur); const gn = c.createGain(); gn.gain.value = g; src.connect(bp); bp.connect(gn); gn.connect(this.master); src.start(t); }
  play(name) {
    if (!this.ctx) return;
    const now = performance.now(); if (this.last[name] && now - this.last[name] < 40) return; this.last[name] = now;
    switch (name) {
      case 'jump': this.tone(300, 620, 0.12, 'square', 0.12); break;
      case 'thunder': this.noise(0.7, 0.35, 150); this.thump(60, 0.9, 0.5, 0.05); this.noise(0.4, 0.2, 400, 0.25); break;
      case 'roar': this.tone(90, 40, 1.2, 'sawtooth', 0.35); this.tone(130, 55, 1.0, 'square', 0.2, 0.05); this.noise(0.8, 0.25, 200); break;
      case 'bossdie': this.tone(160, 30, 1.6, 'sawtooth', 0.3); this.noise(1.2, 0.3, 300); [0.3, 0.6, 0.9].forEach((d, i) => this.tone([392, 523, 659][i], [392, 523, 659][i], 0.8, 'triangle', 0.14, d)); break;
      case 'heart': this.tone(70, 50, 0.12, 'sine', 0.25); this.tone(60, 45, 0.1, 'sine', 0.18, 0.18); break;
      case 'step': this.noise(0.04, 0.045, 500 + Math.random() * 300); this.thump(120 + Math.random() * 40, 0.04, 0.05); break;
      case 'stepwood': this.thump(170 + Math.random() * 40, 0.06, 0.1); this.noise(0.03, 0.03, 900); break;
      case 'land': this.noise(0.09, 0.12, 300); this.thump(110, 0.12, 0.22); break;
      case 'djump': this.tone(420, 900, 0.14, 'square', 0.12); this.noise(0.08, 0.05, 2000); break;
      case 'dash': this.whoosh(0.22, 0.26, 200, 1800); break;
      case 'bash': this.whoosh(0.2, 0.2, 150, 900); this.thump(140, 0.2, 0.3); break;
      case 'swing': this.whoosh(0.16 + Math.random() * 0.05, 0.22, 300 + Math.random() * 200, 2600 + Math.random() * 800); break;
      case 'charge': this.tone(120, 240, 0.5, 'sawtooth', 0.06); break;
      case 'heavyrelease': this.noise(0.2, 0.22, 900); this.tone(90, 40, 0.25, 'sawtooth', 0.15); break;
      case 'hit': { const k = 0.85 + Math.random() * 0.35; this.thump(180 * k, 0.12, 0.35); this.noise(0.05, 0.18, 2400 + Math.random() * 1400); this.ring(1900 * k, 0.25, 0.06); break; }
      case 'heavyhit': this.thump(110, 0.28, 0.5); this.noise(0.14, 0.3, 1200); this.ring(1400, 0.5, 0.1, 0.02); break;
      case 'clank': { const k = 0.9 + Math.random() * 0.25; this.ring(2400 * k, 0.45, 0.16); this.noise(0.03, 0.12, 4000); this.thump(300, 0.06, 0.12); break; }
      case 'break': this.ring(1100, 0.6, 0.18); this.tone(900, 200, 0.25, 'sawtooth', 0.12); this.noise(0.25, 0.25, 1200); this.thump(90, 0.3, 0.35); break;
      case 'parry': this.ring(3200, 0.9, 0.22); this.tone(1800, 2600, 0.12, 'sine', 0.2); this.whoosh(0.3, 0.12, 2000, 6000); this.thump(260, 0.08, 0.15); break;
      case 'block': this.thump(420, 0.05, 0.1); this.noise(0.04, 0.06, 1500); break;
      case 'hurt': this.thump(160, 0.25, 0.4); this.tone(180, 70, 0.25, 'sawtooth', 0.15); this.noise(0.15, 0.2, 500); break;
      case 'pound': this.thump(80, 0.45, 0.6); this.noise(0.35, 0.35, 250); this.ring(600, 0.3, 0.06, 0.03); break;
      case 'poundstart': this.tone(400, 700, 0.1, 'square', 0.08); break;
      case 'windup': this.tone(260, 520, 0.3, 'triangle', 0.07); break;
      case 'bolt': this.tone(700, 300, 0.08, 'sawtooth', 0.1); this.noise(0.05, 0.08, 3000); break;
      case 'die': this.tone(300, 60, 0.4, 'sawtooth', 0.14); this.noise(0.25, 0.15, 800); this.thump(100, 0.3, 0.3, 0.15); break;
      case 'fall': this.tone(500, 80, 0.6, 'sine', 0.18); break;
      case 'ladder': this.noise(0.4, 0.25, 300); this.thump(120, 0.5, 0.4); [0.15, 0.3, 0.42].forEach(d => this.noise(0.12, 0.15, 500 + Math.random() * 500, d)); break;
      case 'ui': this.tone(900, 1200, 0.06, 'sine', 0.08); break;
      case 'checkpoint': this.tone(520, 780, 0.15, 'triangle', 0.12); this.tone(780, 1040, 0.2, 'triangle', 0.12, 0.12); break;
      case 'lock': this.tone(1000, 1300, 0.06, 'sine', 0.1); break;
      case 'crestget': { const seq = [523, 659, 784, 1047, 1319]; seq.forEach((f, i) => this.tone(f, f, 0.5, 'triangle', 0.16, i * 0.11)); this.ring(2093, 1.4, 0.12, 0.55); break; }
      case 'bird': { const b = 2200 + Math.random() * 1200; this.tone(b, b * (0.8 + Math.random() * 0.4), 0.07 + Math.random() * 0.06, 'sine', 0.045); if (Math.random() < 0.5) this.tone(b * 1.2, b, 0.06, 'sine', 0.035, 0.09); break; }
      case 'win': [0, 0.15, 0.3, 0.45].forEach((d, i) => this.tone([520, 660, 780, 1040][i], [520, 660, 780, 1040][i], 0.4, 'triangle', 0.15, d)); break;
    }
  }
}

// ---------------------------------------------------------------- music
// Procedural score with a real chord progression. Modes:
//   title - gentle harp arpeggio, no drums
//   vale1 - A-minor folk theme, war drums fade in with intensity
//   vale2 - darker Am/Em/F/E night theme, bell timbre, sparse
//   boss  - chromatic menace, double-time drums, horn stabs
export class Music {
  constructor(audio) { this.a = audio; this.on = false; this.intensity = 0; this.target = 0; this.next = 0; this.beat = 0; this.vol = 0.35; this.mode = 'vale1'; this.chordIdx = -1; this.melIdx = 4; }
  start() {
    const c = this.a.ctx; if (!c || this.on) return; this.on = true;
    this.bus = c.createGain(); this.bus.gain.value = this.vol; this.bus.connect(this.a.master);
    // drone: detuned saws + a fifth through a lowpass; oscillators retune to the chord root
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0.0; this.droneGain.connect(this.bus);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2; lp.connect(this.droneGain);
    this.droneOscs = [];
    for (const [mult, g0] of [[1, 0.25], [1.006, 0.25], [1.5, 0.16]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55 * mult; const g = c.createGain(); g.gain.value = g0; o.connect(g); g.connect(lp); o.start(); this.droneOscs.push({ o, mult }); }
    this.lp = lp;
    this.droneGain.gain.linearRampToValueAtTime(0.5, c.currentTime + 3);
    this.drumGain = c.createGain(); this.drumGain.gain.value = 0; this.drumGain.connect(this.bus);
    // wind: looped noise through a slowly wandering bandpass
    { const n = c.sampleRate * 4; const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6; const g = c.createGain(); g.gain.value = 0.05; src.connect(bp); bp.connect(g); g.connect(this.a.master); src.start(); this.wind = { bp, g }; }
    this.t0 = c.currentTime; this.next = c.currentTime + 0.1;
  }
  kick(t, g = 1) { const c = this.a.ctx; const o = c.createOscillator(), gn = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25); gn.gain.setValueAtTime(0.9 * g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.45); o.connect(gn); gn.connect(this.drumGain); o.start(t); o.stop(t + 0.5); }
  tom(t, f = 90, g = 0.6) { const c = this.a.ctx; const o = c.createOscillator(), gn = c.createGain(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.2); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(gn); gn.connect(this.drumGain); o.start(t); o.stop(t + 0.35); }
  hat(t, g = 0.15) { const c = this.a.ctx; const n = Math.floor(c.sampleRate * 0.05); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000; const gn = c.createGain(); gn.gain.value = g; s.connect(f); f.connect(gn); gn.connect(this.drumGain); s.start(t); }
  horn(t, fs) { const c = this.a.ctx; for (const [f, d] of fs || [[196, 0], [196, 0.45], [261.6, 0.9]]) { const o = c.createOscillator(), gn = c.createGain(); o.type = 'sawtooth'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; gn.gain.setValueAtTime(0.0001, t + d); gn.gain.exponentialRampToValueAtTime(0.12, t + d + 0.08); gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9); o.connect(lp); lp.connect(gn); gn.connect(this.bus); o.start(t + d); o.stop(t + d + 1); } }
  // one scheduled melody note. bell=true gives the long night timbre.
  note(f, t, g, bell) {
    const c = this.a.ctx; if (!c) return;
    const o = c.createOscillator(); o.type = bell ? 'sine' : 'triangle'; o.frequency.value = f;
    const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + (bell ? 1.9 : 0.8));
    o.connect(gn); gn.connect(this.bus); o.start(t); o.stop(t + (bell ? 2 : 0.9));
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * (bell ? 2.76 : 2);
    const g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(g * (bell ? 0.25 : 0.35), t + 0.01); g2.gain.exponentialRampToValueAtTime(0.0001, t + (bell ? 1.1 : 0.5));
    o2.connect(g2); g2.connect(this.bus); o2.start(t); o2.stop(t + 1.2);
  }
  update(dt, intensity, ppos, mode) {
    if (!this.on) return; const c = this.a.ctx;
    if (mode) this.mode = mode;
    const M = this.mode;
    this.target = M === 'title' ? 0 : intensity;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * (this.target > this.intensity ? 3 : 0.5));
    this.drumGain.gain.value = M === 'title' ? 0 : (M === 'boss' ? 1 : 0.15 + 0.85 * this.intensity);
    // ambience by place: birds in the green, water babble near the gully (ppos gates it)
    if (ppos) {
      this.birdT = (this.birdT || 0) - dt;
      if (ppos.y < -12 && this.intensity < 0.35 && this.birdT <= 0) { this.birdT = 1.5 + Math.random() * 4; if (Math.random() < 0.7) this.a.play('bird'); }
      const dWater = Math.hypot(ppos.x - 0, ppos.z - (-114));
      const wg = Math.max(0, 1 - dWater / 26) * 0.06;
      if (!this.babble && wg > 0) { const c2 = this.a.ctx; const n = c2.sampleRate * 2; const buf = c2.createBuffer(1, n, c2.sampleRate); const d2 = buf.getChannelData(0); for (let i = 0; i < n; i++) d2[i] = Math.random() * 2 - 1; const src = c2.createBufferSource(); src.buffer = buf; src.loop = true; const bp = c2.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8; const g2 = c2.createGain(); g2.gain.value = 0; src.connect(bp); bp.connect(g2); g2.connect(this.a.master); src.start(); this.babble = { g: g2, bp }; }
      if (this.babble) { this.babble.g.gain.value = wg; this.babble.bp.frequency.value = 1200 + Math.sin(c.currentTime * 2.3) * 300; }
    }
    // distant battle under the mix (not on the title, not at night)
    if (M === 'vale1' || M === 'boss') { this.far = (this.far || 0) - dt; if (this.far <= 0) { this.far = 1.2 + Math.random() * 2.5; const g = 0.05 * (1 - this.intensity * 0.6); const r = Math.random(); if (r < 0.6) this.a.ring(1500 + Math.random() * 1500, 0.5, g); else if (r < 0.85) this.a.thump(70 + Math.random() * 40, 0.5, g * 2); else this.a.tone(180 + Math.random() * 60, 150, 0.9, 'sawtooth', g * 0.8); } }
    if (this.wind) { const t = c.currentTime; this.wind.bp.frequency.value = 420 + Math.sin(t * 0.23) * 180 + Math.sin(t * 0.61) * 90; this.wind.g.gain.value = (M === 'vale2' ? 0.05 : 0.035) + 0.025 * (0.5 + 0.5 * Math.sin(t * 0.17)); }
    this.lp.frequency.value = (M === 'boss' ? 320 : 180) + 500 * this.intensity;
    // ---- harmony + scheduling ----
    const PROG = {
      title: [55, 65.41, 49, 43.65],
      vale1: [55, 43.65, 65.41, 49],
      vale2: [55, 41.2, 43.65, 41.2],
      boss: [55, 58.27, 55, 51.91],
    }[M];
    const SCALE = [220, 246.9, 261.6, 293.7, 329.6, 349.2, 392, 440, 493.9, 523.3];
    const TONES = {
      title: [[0, 2, 4, 7], [2, 4, 6, 9], [6, 1, 3, 8], [5, 0, 2, 7]],
      vale1: [[0, 2, 4, 7], [5, 0, 2, 7], [2, 4, 6, 9], [6, 1, 3, 8]],
      vale2: [[0, 2, 4], [4, 6, 1], [5, 0, 2], [4, 1, 4]],
      boss: [[0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4]],
    }[M];
    const bpm = M === 'boss' ? 118 : M === 'vale2' ? 84 : M === 'title' ? 72 : 96;
    const spb = 60 / bpm;
    while (this.next < c.currentTime + 0.5) {
      const t = this.next; const b = this.beat % 8;
      const ci = (((this.beat / 8) | 0) % PROG.length);
      if (ci !== this.chordIdx) {
        this.chordIdx = ci;
        for (const dr of this.droneOscs) { dr.o.frequency.cancelScheduledValues(t); dr.o.frequency.setValueAtTime(dr.o.frequency.value, t); dr.o.frequency.linearRampToValueAtTime(PROG[ci] * dr.mult, t + 0.5); }
      }
      const tones = TONES[ci];
      // drums
      if (M === 'boss') {
        this.kick(t); if (b === 3 || b === 7) this.kick(t, 0.7); this.hat(t + spb * 0.5, 0.1); this.hat(t + spb * 0.25, 0.05);
        if (b === 6) { this.tom(t, 130, 0.5); this.tom(t + spb * 0.5, 100, 0.55); }
        if (this.beat % 32 === 24) this.horn(t, [[233, 0], [220, 0.5]]);
        if (b === 0) { const f = PROG[ci] * 4; this.a.tone(f, f, spb * 1.8, 'sawtooth', 0.07); }
      } else if (M !== 'title') {
        if (b === 0 || b === 4) this.kick(t, M === 'vale2' ? 0.7 : 1); if ((b === 3 || b === 7) && M !== 'vale2') this.kick(t, 0.6);
        if (this.intensity > 0.3) { if (b === 2 || b === 6) this.tom(t, 110, 0.5); if (b === 7) this.tom(t + spb * 0.5, 140, 0.4); }
        if (this.intensity > 0.6) { this.hat(t + spb * 0.5, 0.08); this.hat(t, 0.05); }
        if (this.beat % 64 === 16 && this.intensity < 0.5 && M === 'vale1') this.horn(t);
      }
      // melody
      if (M === 'title') {
        const f = SCALE[tones[b % tones.length]] * (b >= 4 ? 1 : 0.5);
        this.note(f, t, 0.05, false);
        if (b === 0) this.note(SCALE[tones[0]] * 0.25, t, 0.06, true);
      } else if (M === 'vale2') {
        if (b % 2 === 0 && Math.random() < 0.55 && this.intensity < 0.6) {
          this.melIdx = Math.max(0, Math.min(SCALE.length - 1, this.melIdx + ((Math.random() * 3) | 0) - 1));
          const idx = (b === 0) ? tones[(Math.random() * tones.length) | 0] : this.melIdx;
          this.note(SCALE[idx], t, 0.038 * (1 - this.intensity), true);
        }
      } else if (this.intensity < 0.55) {
        if (Math.random() < 0.8) {
          if (b % 2 === 0) { this.melIdx = tones[(Math.random() * tones.length) | 0]; }
          else { this.melIdx = Math.max(0, Math.min(SCALE.length - 1, this.melIdx + ((Math.random() * 3) | 0) - 1)); }
          this.note(SCALE[this.melIdx], t, 0.05 * (1 - this.intensity), false);
          if (b === 0) this.note(SCALE[tones[0]] * 0.5, t, 0.045, false);
        }
      }
      this.next += spb; this.beat++;
    }
  }
}
