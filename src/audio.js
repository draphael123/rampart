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
  play(name) {
    if (!this.ctx) return;
    const now = performance.now(); if (this.last[name] && now - this.last[name] < 40) return; this.last[name] = now;
    switch (name) {
      case 'jump': this.tone(300, 620, 0.12, 'square', 0.12); break;
      case 'step': this.noise(0.05, 0.05, 600); break;
      case 'land': this.noise(0.09, 0.12, 300); this.tone(120, 60, 0.08, 'sine', 0.1); break;
      case 'djump': this.tone(420, 900, 0.14, 'square', 0.12); this.noise(0.08, 0.05, 2000); break;
      case 'dash': this.noise(0.16, 0.18, 1200); this.tone(200, 80, 0.15, 'sawtooth', 0.08); break;
      case 'bash': this.noise(0.18, 0.2, 600); this.tone(160, 60, 0.2, 'square', 0.12); break;
      case 'swing': this.noise(0.12, 0.14, 1800); break;
      case 'charge': this.tone(120, 240, 0.5, 'sawtooth', 0.06); break;
      case 'heavyrelease': this.noise(0.2, 0.22, 900); this.tone(90, 40, 0.25, 'sawtooth', 0.15); break;
      case 'hit': this.tone(220, 110, 0.09, 'square', 0.22); this.noise(0.06, 0.15, 3000); break;
      case 'heavyhit': this.tone(140, 50, 0.18, 'square', 0.3); this.noise(0.12, 0.25, 1500); break;
      case 'clank': this.tone(1400, 900, 0.08, 'triangle', 0.2); this.tone(2200, 1800, 0.05, 'sine', 0.1); break;
      case 'break': this.tone(900, 200, 0.25, 'sawtooth', 0.2); this.noise(0.2, 0.2, 2000); break;
      case 'parry': this.tone(1800, 2600, 0.12, 'sine', 0.25); this.tone(900, 1400, 0.2, 'triangle', 0.15, 0.02); break;
      case 'block': this.tone(500, 380, 0.06, 'triangle', 0.08); break;
      case 'hurt': this.tone(180, 70, 0.25, 'sawtooth', 0.25); this.noise(0.15, 0.2, 500); break;
      case 'pound': this.tone(90, 30, 0.35, 'square', 0.3); this.noise(0.3, 0.3, 300); break;
      case 'poundstart': this.tone(400, 700, 0.1, 'square', 0.08); break;
      case 'windup': this.tone(260, 520, 0.3, 'triangle', 0.07); break;
      case 'bolt': this.tone(700, 300, 0.08, 'sawtooth', 0.1); this.noise(0.05, 0.08, 3000); break;
      case 'die': this.tone(300, 60, 0.4, 'sawtooth', 0.18); this.noise(0.25, 0.15, 800); break;
      case 'fall': this.tone(500, 80, 0.6, 'sine', 0.18); break;
      case 'ladder': this.noise(0.3, 0.2, 400); this.tone(200, 60, 0.4, 'square', 0.1); break;
      case 'checkpoint': this.tone(520, 780, 0.15, 'triangle', 0.12); this.tone(780, 1040, 0.2, 'triangle', 0.12, 0.12); break;
      case 'lock': this.tone(1000, 1300, 0.06, 'sine', 0.1); break;
      case 'win': [0, 0.15, 0.3, 0.45].forEach((d, i) => this.tone([520, 660, 780, 1040][i], [520, 660, 780, 1040][i], 0.4, 'triangle', 0.15, d)); break;
    }
  }
}

// ---------------------------------------------------------------- music
// Procedural siege score: low drone, war drums, a distant horn. Intensity
// 0..1 blends in the drums. No assets.
export class Music {
  constructor(audio) { this.a = audio; this.on = false; this.intensity = 0; this.target = 0; this.next = 0; this.beat = 0; this.vol = 0.35; }
  start() {
    const c = this.a.ctx; if (!c || this.on) return; this.on = true;
    this.bus = c.createGain(); this.bus.gain.value = this.vol; this.bus.connect(this.a.master);
    // drone: two detuned saws through a lowpass
    this.droneGain = c.createGain(); this.droneGain.gain.value = 0.0; this.droneGain.connect(this.bus);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2; lp.connect(this.droneGain);
    for (const f of [55, 55.4, 82.5]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.25; o.connect(g); g.connect(lp); o.start(); }
    this.lp = lp;
    this.droneGain.gain.linearRampToValueAtTime(0.5, c.currentTime + 3);
    this.drumGain = c.createGain(); this.drumGain.gain.value = 0; this.drumGain.connect(this.bus);
    this.t0 = c.currentTime; this.next = c.currentTime + 0.1;
  }
  kick(t, g = 1) { const c = this.a.ctx; const o = c.createOscillator(), gn = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25); gn.gain.setValueAtTime(0.9 * g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.45); o.connect(gn); gn.connect(this.drumGain); o.start(t); o.stop(t + 0.5); }
  tom(t, f = 90, g = 0.6) { const c = this.a.ctx; const o = c.createOscillator(), gn = c.createGain(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.2); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(gn); gn.connect(this.drumGain); o.start(t); o.stop(t + 0.35); }
  hat(t, g = 0.15) { const c = this.a.ctx; const n = Math.floor(c.sampleRate * 0.05); const buf = c.createBuffer(1, n, c.sampleRate); const d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n); const s = c.createBufferSource(); s.buffer = buf; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000; const gn = c.createGain(); gn.gain.value = g; s.connect(f); f.connect(gn); gn.connect(this.drumGain); s.start(t); }
  horn(t) { const c = this.a.ctx; for (const [f, d] of [[196, 0], [196, 0.45], [261.6, 0.9]]) { const o = c.createOscillator(), gn = c.createGain(); o.type = 'sawtooth'; o.frequency.value = f; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; gn.gain.setValueAtTime(0.0001, t + d); gn.gain.exponentialRampToValueAtTime(0.12, t + d + 0.08); gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9); o.connect(lp); lp.connect(gn); gn.connect(this.bus); o.start(t + d); o.stop(t + d + 1); } }
  update(dt, intensity) {
    if (!this.on) return; const c = this.a.ctx;
    this.target = intensity;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * (this.target > this.intensity ? 3 : 0.5));
    this.drumGain.gain.value = 0.15 + 0.85 * this.intensity;
    this.lp.frequency.value = 180 + 500 * this.intensity;
    // schedule a bar ahead
    const bpm = 96; const spb = 60 / bpm;
    while (this.next < c.currentTime + 0.5) {
      const b = this.beat % 8; const t = this.next;
      if (b === 0 || b === 4) this.kick(t); if (b === 3 || b === 7) this.kick(t, 0.6);
      if (this.intensity > 0.3) { if (b === 2 || b === 6) this.tom(t, 110, 0.5); if (b === 7) this.tom(t + spb * 0.5, 140, 0.4); }
      if (this.intensity > 0.6) { this.hat(t + spb * 0.5, 0.08); this.hat(t, 0.05); }
      if (this.beat % 64 === 16 && this.intensity < 0.5) this.horn(t);
      this.next += spb; this.beat++;
    }
  }
}
