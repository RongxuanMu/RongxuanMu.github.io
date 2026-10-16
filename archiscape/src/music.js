// - music: every era has its own generative piece, synthesized live (WebAudio, no samples). Changing era
// crossfades: the new piece swells in over ~3 s while the old one fades away.
//
// Instruments: plucked strings are Karplus-Strong (rendered once per pitch and timbre, then cached), so a
// guzheng, a pipa, an oud, a lyre and a Spanish guitar are the same physics with different damping, brightness
// and bends; bells are inharmonic partials (Russian zvon, bianzhong, celesta); winds are a vibrato tone with
// breath noise (dizi, xiao, ney, shakuhachi, aulos); pads are detuned saws through a filter (choir, organ,
// synths); drums are tuned noise and sine thumps. Everything goes through one room reverb.
var AS_MIDI = (m) => 440 * Math.pow(2, (m - 69) / 12);
var AsMusic = class {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = true;
    this.vol = 0.8;
    this.layers = [];
    this.want = null;
    this.ks = /* @__PURE__ */ new Map();
  }
  setOn(v) {
    this.on = v;
    const c = this.c;
    if (c && this.master) this.master.gain.setTargetAtTime(v ? this.vol : 0, c.currentTime, 0.4);
  }
  play(id) {
    this.want = id;
  }
  // the audio graph, built once the page has had a gesture: layers -> dry + room reverb -> compressor -> out
  _graph() {
    // the framework makes the AudioContext on the first gesture; until then there is nothing to play into
    const c = this.sfx.ctx;
    if (!c || c.state !== "running") return null;
    if (this.c === c) return c;
    this.c = c;
    this.master = c.createGain();
    this.master.gain.value = this.on ? this.vol : 0;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(comp).connect(c.destination);
    // room: decaying stereo noise, a little darker at the tail
    const len = Math.round(c.sampleRate * 4.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / c.sampleRate, k = Math.min(0.9, 0.2 + t * 0.25);
        lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = lp * Math.pow(1 - i / len, 2.2) * (t < 0.012 ? t / 0.012 : 1);
      }
    }
    this.verb = c.createConvolver();
    this.verb.buffer = ir;
    this.verb.connect(this.master);
    return c;
  }
  // called every frame by the world: starts / crossfades pieces and schedules ~0.3 s ahead
  tick() {
    const c = this._graph();
    if (!c) return;
    const now = c.currentTime;
    const cur = this.layers.at(-1);
    if (this.want && cur?.id !== this.want && AS_MUSIC[this.want]) {
      for (const L of this.layers) if (!L.out) {
        L.out = now + 2.6;
        L.bus.gain.cancelScheduledValues(now);
        L.bus.gain.setValueAtTime(L.bus.gain.value, now);
        L.bus.gain.linearRampToValueAtTime(0, now + 2.6);
      }
      this.layers.push(this._layer(this.want, now));
    }
    for (const L of this.layers) {
      // music off, or the tab was away: skip ahead instead of playing a backlog
      if (!this.on || L.next < now - 0.2) {
        while (L.next < now) L.step++, L.next += 60 / L.spec.bpm / 2;
        if (!this.on) continue;
      }
      while (L.next < now + 0.3) {
        if (!L.out || L.next < L.out) {
          try {
            L.spec.beat(L.M, L.next, L.step);
          } catch (e) {
            console.error(e);
          }
        }
        L.step++;
        L.next += 60 / L.spec.bpm / 2 * (L.step % 2 ? 1 + (L.spec.swing ?? 0) : 1 - (L.spec.swing ?? 0));
      }
    }
    // retire faded pieces
    this.layers = this.layers.filter((L) => {
      if (!L.out || now < L.out + 4) return true;
      for (const s of L.held) try {
        s.stop();
      } catch (_) {
      }
      L.bus.disconnect();
      return false;
    });
  }
  _layer(id, now) {
    const c = this.c, spec = AS_MUSIC[id];
    const bus = c.createGain(), send = c.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(spec.level ?? 1, now + 3);
    send.gain.value = spec.wet ?? 0.35;
    bus.connect(this.master);
    bus.connect(send).connect(this.verb);
    const L = { id, spec, bus, next: now + 0.1, step: 0, out: 0, held: [] };
    L.M = this._voices(L);
    spec.init?.(L.M, now + 0.1);
    return L;
  }
  // the instrument set handed to a piece; every note goes to that piece's bus
  _voices(L) {
    const c = this.c, bus = L.bus, spec = L.spec, self = this;
    let seed = 0;
    for (const ch of L.id) seed = seed * 31 + ch.charCodeAt(0) | 0;
    const rnd = asRng(seed ^ Math.floor(performance.now()));
    const pan = (x, node) => {
      if (!c.createStereoPanner) return node;
      const p = c.createStereoPanner();
      p.pan.value = x;
      node.connect(p);
      return p;
    };
    const env = (t, a, peak, d, hold = 0) => {
      const g = c.createGain();
      g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      if (hold) g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.exponentialRampToValueAtTime(1e-4, t + a + hold + d);
      return g;
    };
    const M = {
      rnd,
      chance: (p) => rnd() < p,
      pick: (a) => a[Math.floor(rnd() * a.length)],
      // scale degree -> Hz (degrees beyond the scale wrap into octaves)
      f(deg, oct = 0, scale = spec.scale, root = spec.root) {
        const n = scale.length, o = Math.floor(deg / n), k = (deg % n + n) % n;
        return AS_MIDI(root + scale[k] + 12 * (o + oct));
      },
      // a melodic random walk with memory: mostly steps, sometimes a leap, kept inside [lo, hi]
      walk(key, lo, hi, leap = 0.18) {
        const s = M[key] ??= { d: Math.round((lo + hi) / 2) };
        const r = rnd();
        let step = r < leap ? (rnd() < 0.5 ? -1 : 1) * (2 + Math.floor(rnd() * 2)) : r < 0.82 ? rnd() < 0.5 ? -1 : 1 : 0;
        if (s.d + step < lo || s.d + step > hi) step = -step;
        s.d = Math.max(lo, Math.min(hi, s.d + step));
        return s.d;
      },
      // plucked string (Karplus-Strong). damp: 0.5 dull .. 0.05 bright; decay per period; bend: semitones of
      // slide into the note; vol; x: stereo position
      pluck(f, t, { vol = 0.3, damp = 0.3, decay = 0.996, dur = 2.4, bend = 0, bendT = 0.12, x = 0, body = 0 } = {}) {
        const buf = self._ks(f, damp, decay, dur), s = c.createBufferSource();
        s.buffer = buf;
        if (bend) {
          s.playbackRate.setValueAtTime(Math.pow(2, -bend / 12), t);
          s.playbackRate.exponentialRampToValueAtTime(1, t + bendT);
        }
        const g = c.createGain();
        g.gain.value = vol;
        let n = s.connect(g);
        if (body) {
          // a resonant body (oud, guitar): a broad peak an octave or so above the fundamental
          const pk = c.createBiquadFilter();
          pk.type = "peaking";
          pk.frequency.value = body;
          pk.Q.value = 1.2;
          pk.gain.value = 6;
          n = n.connect(pk);
        }
        pan(x, n).connect(bus);
        s.start(t);
        s.stop(t + dur);
      },
      // a struck bell: inharmonic partials, each with its own decay
      bell(f, t, { vol = 0.2, dur = 4, partials = [[1, 1, 1], [2.01, 0.55, 0.6], [2.76, 0.4, 0.5], [5.4, 0.22, 0.3], [8.93, 0.1, 0.18]], x = 0, attack = 2e-3 } = {}) {
        const out = pan(x, c.createGain());
        out.connect(bus);
        for (const [ratio, amp, life] of partials) {
          const fr = f * ratio;
          if (fr > 14e3) continue;
          const o = c.createOscillator(), g = env(t, attack, vol * amp, dur * life);
          o.frequency.value = fr;
          o.connect(g).connect(out.numberOfInputs ? out : bus);
          o.start(t);
          o.stop(t + attack + dur * life + 0.05);
        }
      },
      // a wind instrument: tone + soft overtones, vibrato that blooms after the attack, breath noise
      flute(f, t, dur, { vol = 0.12, breath = 0.25, vib = 5.2, depth = 0.012, attack = 0.08, x = 0, wave = "sine", bend = 0, nasal = 0 } = {}) {
        const out = pan(x, c.createGain());
        out.connect(bus);
        const g = c.createGain();
        g.gain.setValueAtTime(1e-4, t);
        g.gain.exponentialRampToValueAtTime(vol, t + attack);
        g.gain.setValueAtTime(vol * 0.85, t + Math.max(attack, dur - 0.12));
        g.gain.exponentialRampToValueAtTime(1e-4, t + dur + 0.15);
        g.connect(out.numberOfInputs ? out : bus);
        const o = c.createOscillator();
        o.type = wave;
        if (bend) {
          o.frequency.setValueAtTime(f * Math.pow(2, -bend / 12), t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
        } else o.frequency.value = f;
        const lfo = c.createOscillator(), ld = c.createGain();
        lfo.frequency.value = vib;
        ld.gain.setValueAtTime(0, t);
        ld.gain.linearRampToValueAtTime(f * depth, t + Math.min(0.5, dur * 0.6));
        lfo.connect(ld).connect(o.frequency);
        let src = o;
        if (nasal) {
          const bp = c.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.value = f * 3;
          bp.Q.value = 1.5;
          src = o.connect(bp);
        }
        src.connect(g);
        const o2 = c.createOscillator(), g2 = c.createGain();
        o2.frequency.value = f * 2;
        g2.gain.value = 0.18;
        o2.connect(g2).connect(g);
        const nz = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
        nz.buffer = self.sfx.noise;
        nz.loop = true;
        bp.type = "bandpass";
        bp.frequency.value = Math.min(9e3, f * 2.5);
        bp.Q.value = 2;
        ng.gain.value = breath;
        nz.connect(bp).connect(ng).connect(g);
        for (const s of [o, lfo, o2, nz]) {
          s.start(t);
          s.stop(t + dur + 0.25);
        }
      },
      // a held chord: detuned saws (or another wave) through a low-pass, slow swell; formant = choir vowel
      pad(fs, t, dur, { vol = 0.06, cutoff = 1200, attack = 1.2, release = 1.5, wave = "sawtooth", detune = 9, formant = false, x = 0 } = {}) {
        const out = pan(x, c.createGain());
        out.connect(bus);
        const g = c.createGain();
        g.gain.setValueAtTime(1e-4, t);
        g.gain.exponentialRampToValueAtTime(vol, t + attack);
        g.gain.setValueAtTime(vol, t + Math.max(attack, dur));
        g.gain.exponentialRampToValueAtTime(1e-4, t + dur + release);
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = cutoff;
        lp.Q.value = 0.7;
        if (!formant) lp.connect(g);
        else {
          // "ah": two formant peaks
          const mix = c.createGain();
          for (const [fr, q, gain] of [[730, 6, 1], [1090, 8, 0.6], [2440, 10, 0.25]]) {
            const bp = c.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.value = fr;
            bp.Q.value = q;
            const bg = c.createGain();
            bg.gain.value = gain * 3;
            lp.connect(bp).connect(bg).connect(mix);
          }
          mix.connect(g);
        }
        g.connect(out.numberOfInputs ? out : bus);
        for (const f of fs) for (const d of [-detune, 0, detune]) {
          const o = c.createOscillator();
          o.type = wave;
          o.frequency.value = f;
          o.detune.value = d + (rnd() - 0.5) * 3;
          o.connect(lp);
          o.start(t);
          o.stop(t + dur + release + 0.1);
        }
        return g;
      },
      // percussion
      drum(type, t, vol = 0.3, x = 0) {
        const out = pan(x, c.createGain());
        out.connect(bus);
        const to = out.numberOfInputs ? out : bus;
        const thump = (f0, f1, d, v) => {
          const o = c.createOscillator(), g = env(t, 3e-3, v, d);
          o.frequency.setValueAtTime(f0, t);
          o.frequency.exponentialRampToValueAtTime(f1, t + d);
          o.connect(g).connect(to);
          o.start(t);
          o.stop(t + d + 0.05);
        };
        const hiss = (type2, fr, q, d, v) => {
          const s = c.createBufferSource(), f = c.createBiquadFilter(), g = env(t, 1e-3, v, d);
          s.buffer = self.sfx.noise;
          f.type = type2;
          f.frequency.value = fr;
          f.Q.value = q;
          s.connect(f).connect(g).connect(to);
          s.start(t);
          s.stop(t + d + 0.05);
        };
        if (type === "frame") thump(110, 55, 0.35, vol), hiss("lowpass", 900, 0.7, 0.08, vol * 0.3);
        else if (type === "dum") thump(140, 70, 0.28, vol), hiss("bandpass", 600, 1, 0.05, vol * 0.25);
        else if (type === "tek") hiss("highpass", 3200, 0.8, 0.05, vol * 0.7), thump(700, 500, 0.03, vol * 0.2);
        else if (type === "wood") thump(1250, 1150, 0.06, vol * 0.8), hiss("bandpass", 2500, 3, 0.02, vol * 0.3);
        else if (type === "clave") thump(2400, 2300, 0.05, vol * 0.6);
        else if (type === "castanet") {
          hiss("bandpass", 3800, 2, 0.02, vol);
          hiss("bandpass", 4200, 2, 0.02, vol * 0.6);
        } else if (type === "taiko") thump(80, 42, 0.6, vol), hiss("lowpass", 500, 0.7, 0.12, vol * 0.4);
        else if (type === "shaker") hiss("highpass", 6e3, 0.7, 0.07, vol * 0.5);
        else if (type === "tick") hiss("highpass", 8e3, 0.7, 0.015, vol * 0.4);
      },
      // a sustained drone for the life of the piece (it fades with the piece)
      drone(fs, t, { vol = 0.05, wave = "sawtooth", cutoff = 500, wobble = 0.1 } = {}) {
        const g = c.createGain(), lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = cutoff;
        g.gain.setValueAtTime(1e-4, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 4);
        lp.connect(g).connect(bus);
        const lfo = c.createOscillator(), ld = c.createGain();
        lfo.frequency.value = wobble;
        ld.gain.value = cutoff * 0.35;
        lfo.connect(ld).connect(lp.frequency);
        lfo.start(t);
        L.held.push(lfo);
        for (const f of fs) for (const d of [-6, 5]) {
          const o = c.createOscillator();
          o.type = wave;
          o.frequency.value = f;
          o.detune.value = d;
          o.connect(lp);
          o.start(t);
          L.held.push(o);
        }
      },
      // weather: wind (a moving band of noise) or water (drips: tiny upward sine chirps), for the piece's life
      wind(t, { vol = 0.03, center = 500 } = {}) {
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), ld = c.createGain();
        s.buffer = self._longNoise();
        s.loop = true;
        f.type = "bandpass";
        f.frequency.value = center;
        f.Q.value = 1.4;
        lfo.frequency.value = 0.07;
        ld.gain.value = center * 0.6;
        lfo.connect(ld).connect(f.frequency);
        g.gain.setValueAtTime(1e-4, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 5);
        s.connect(f).connect(g).connect(bus);
        s.start(t);
        lfo.start(t);
        L.held.push(s, lfo);
      },
      drip(t, { vol = 0.05, x = 0 } = {}) {
        const o = c.createOscillator(), g = env(t, 2e-3, vol, 0.09), f0 = 900 + rnd() * 1400;
        o.frequency.setValueAtTime(f0, t);
        o.frequency.exponentialRampToValueAtTime(f0 * 1.9, t + 0.06);
        pan(x, o.connect(g)).connect(bus);
        o.start(t);
        o.stop(t + 0.12);
      }
    };
    return M;
  }
  _ks(f, damp, decay, dur) {
    const c = this.c, key = `${Math.round(f * 10)}:${damp}:${decay}:${dur}`;
    let b = this.ks.get(key);
    if (b) return b;
    const sr = c.sampleRate, N = Math.max(2, Math.round(sr / f)), len = Math.round(sr * dur);
    b = c.createBuffer(1, len, sr);
    const d = b.getChannelData(0), ring = new Float32Array(N);
    // the pluck: noise, softened for a darker string
    let lp = 0;
    for (let i = 0; i < N; i++) {
      lp = lp * damp + (Math.random() * 2 - 1) * (1 - damp);
      ring[i] = lp;
    }
    let idx = 0, prev = 0;
    const S = 0.5 - damp * 0.45;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx], v = decay * ((1 - S) * cur + S * prev);
      d[i] = cur;
      prev = cur;
      ring[idx] = v;
      idx = (idx + 1) % N;
    }
    // remove the DC the filter leaves and fade the tail
    let m = 0;
    for (let i = 0; i < len; i++) m += d[i] / len;
    const fade = Math.round(sr * 0.05);
    for (let i = 0; i < len; i++) d[i] = (d[i] - m) * (i > len - fade ? (len - i) / fade : 1);
    if (this.ks.size > 260) this.ks.delete(this.ks.keys().next().value);
    this.ks.set(key, b);
    return b;
  }
  _longNoise() {
    if (this._ln) return this._ln;
    const c = this.c, len = c.sampleRate * 4, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this._ln = b;
  }
  stop() {
    for (const L of this.layers) {
      for (const s of L.held) try {
        s.stop();
      } catch (_) {
      }
      L.bus.disconnect();
    }
    this.layers = [];
  }
};
// - the pieces. scale: semitones from root (MIDI); bpm counts quarter notes, beat(M, t, i) runs every eighth -
var AS_SCALES = {
  // Chinese pentatonic modes
  gong: [0, 2, 4, 7, 9],
  yu: [0, 3, 5, 7, 10],
  zhi: [0, 2, 5, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  // maqam Hijaz (on D: D Eb F# G A Bb C)
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  // Japanese in scale
  in: [0, 1, 5, 7, 8],
  whole: [0, 2, 4, 6, 8, 10],
  minpent: [0, 3, 5, 7, 10]
};
var AS_MUSIC = {
  // the Neolithic: wind over the plain, a low drone, a slow heartbeat drum and a bone flute far away
  stonehenge: {
    bpm: 50, root: 38, scale: AS_SCALES.minpent, wet: 0.55, level: 1.2,
    init(M, t) {
      M.wind(t, { vol: 0.045, center: 420 });
      M.drone([AS_MIDI(38), AS_MIDI(45)], t, { vol: 0.05, cutoff: 260, wobble: 0.05 });
    },
    beat(M, t, i) {
      if (i % 8 === 0) M.drum("frame", t, 0.32);
      if (i % 8 === 3 && M.chance(0.6)) M.drum("frame", t, 0.16);
      if (i % 16 === 8 && M.chance(0.5)) M.flute(M.f(M.walk("m", 5, 11), 0), t, 2.4, { vol: 0.07, breath: 0.6, depth: 0.02, attack: 0.25, x: 0.4 });
    }
  },
  // Classical Greece: a lyre in the Dorian mode, an aulos answering
  greek: {
    bpm: 76, root: 50, scale: AS_SCALES.dorian, wet: 0.4,
    beat(M, t, i) {
      if (i % 2 === 0 && M.chance(0.75)) M.pluck(M.f(M.walk("l", 4, 13), 0), t, { vol: 0.32, damp: 0.25, decay: 0.995, x: -0.25 });
      if (i % 8 === 0) M.pluck(M.f(0, -1), t, { vol: 0.28, damp: 0.35, decay: 0.997, dur: 3 });
      if (i % 32 >= 16 && i % 4 === 0 && M.chance(0.7)) M.flute(M.f(M.walk("a", 7, 14), 0), t, 0.7, { vol: 0.06, wave: "triangle", nasal: 1, breath: 0.2, x: 0.3 });
    }
  },
  // Imperial Rome: a march - frame drums, harp arpeggios, horn calls
  roman: {
    bpm: 84, root: 45, scale: AS_SCALES.mixolydian, wet: 0.35, level: 1.7,
    beat(M, t, i) {
      if (i % 4 === 0) M.drum("frame", t, 0.3);
      if (i % 8 === 6) M.drum("dum", t, 0.18);
      const chord = [0, 4, 7, 9][Math.floor(i / 16) % 4];
      if (i % 2 === 0) M.pluck(M.f(chord + [0, 2, 4, 7][i / 2 % 4], 1), t, { vol: 0.2, damp: 0.2, decay: 0.994, x: -0.3 });
      if (i % 32 === 0) [0, 4, 7].forEach((d, k) => M.flute(M.f(chord + d, 0), t + k * 0.36, 0.6, { vol: 0.07, wave: "sawtooth", breath: 0.05, depth: 4e-3, attack: 0.03, x: 0.25 }));
    }
  },
  // Hagia Sophia: Byzantine chant - a held ison drone, a slow line in the choir's vowel, a vast dome of reverb
  hagia: {
    bpm: 48, root: 50, scale: AS_SCALES.hijaz, wet: 0.75, level: 1.1,
    init(M, t) {
      M.drone([AS_MIDI(38), AS_MIDI(50)], t, { vol: 0.045, cutoff: 600, wobble: 0.06, wave: "sawtooth" });
    },
    beat(M, t, i) {
      if (i % 4 === 0 && M.chance(0.85)) M.pad([M.f(M.walk("c", 0, 8), 0)], t, 1.6, { vol: 0.05, cutoff: 2600, attack: 0.35, release: 0.8, formant: true, detune: 6 });
      if (i % 32 === 24 && M.chance(0.6)) M.flute(M.f(M.walk("n", 7, 12), 0), t, 3, { vol: 0.06, breath: 0.9, depth: 0.018, attack: 0.3, x: 0.35, bend: 1 });
    }
  },
  // Islamic: an oud in maqam Hijaz over a darbuka (dum - tek - tek), a ney floating above
  islamic: {
    bpm: 96, root: 50, scale: AS_SCALES.hijaz, wet: 0.35,
    beat(M, t, i) {
      const r = i % 8;
      if (r === 0 || r === 3) M.drum("dum", t, 0.3, -0.1);
      if (r === 2 || r === 5 || r === 6) M.drum("tek", t, 0.18, 0.15);
      if (M.chance(r % 2 ? 0.35 : 0.8)) M.pluck(M.f(M.walk("o", 0, 9), 0), t, { vol: 0.28, damp: 0.4, decay: 0.993, dur: 1.4, bend: M.chance(0.15) ? 1 : 0, body: 260, x: -0.2 });
      if (i % 32 === 16) M.flute(M.f(M.walk("ney", 7, 12), 0), t, 2.6, { vol: 0.07, breath: 0.8, depth: 0.02, attack: 0.25, x: 0.35, bend: 0.8 });
    }
  },
  // the Forbidden City: bianzhong bronze bells and a guqin, in the gong mode - slow, ceremonial
  forbidden: {
    bpm: 58, root: 48, scale: AS_SCALES.gong, wet: 0.5,
    beat(M, t, i) {
      if (i % 8 === 0) M.bell(M.f([0, 2, 4, 3][Math.floor(i / 8) % 4], -1), t, { vol: 0.16, dur: 5, partials: [[1, 1, 1], [2.4, 0.5, 0.5], [3.9, 0.3, 0.3], [5.1, 0.15, 0.2]] });
      if (i % 4 === 2 && M.chance(0.5)) M.bell(M.f(M.walk("b", 5, 10), 0), t, { vol: 0.08, dur: 3, x: 0.3, partials: [[1, 1, 1], [2.4, 0.4, 0.4], [3.9, 0.2, 0.25]] });
      if (i % 2 === 0 && M.chance(0.55)) M.pluck(M.f(M.walk("q", 0, 7), -1), t, { vol: 0.3, damp: 0.55, decay: 0.998, dur: 3, bend: M.chance(0.3) ? 2 : 0, bendT: 0.25, x: -0.3 });
      if (i % 16 === 12 && M.chance(0.6)) M.drum("wood", t, 0.15, 0.4);
    }
  },
  // Jiangnan, after Wu Guanzhong: a guzheng with glissandi, a soft xiao, rain dripping into the canals
  jiangnan: {
    bpm: 66, root: 55, scale: AS_SCALES.yu, wet: 0.5, level: 1.4,
    init(M, t) {
      M.wind(t, { vol: 0.012, center: 1600 });
    },
    beat(M, t, i) {
      if (i % 16 === 0) for (let k = 0; k < 6; k++) M.pluck(M.f(k + 2, -1), t + k * 0.045, { vol: 0.12 + k * 0.02, damp: 0.15, decay: 0.996, x: -0.4 + k * 0.08 });
      else if (M.chance(0.55)) M.pluck(M.f(M.walk("z", 2, 11), 0), t, { vol: 0.24, damp: 0.18, decay: 0.997, dur: 2.6, bend: M.chance(0.2) ? 1.5 : 0, bendT: 0.2, x: -0.2 });
      if (i % 16 === 8 && M.chance(0.75)) M.flute(M.f(M.walk("x", 4, 10), 0), t, 2.2, { vol: 0.06, breath: 0.7, depth: 0.012, attack: 0.3, x: 0.3 });
      if (M.chance(0.18)) M.drip(t + M.rnd() * 0.2, { vol: 0.035, x: M.rnd() * 2 - 1 });
    }
  },
  // Tulou: a Hakka folk tune on the dizi over a small drum and woodblock
  tulou: {
    bpm: 100, root: 62, scale: AS_SCALES.zhi, wet: 0.3, swing: 0.08, level: 1.3,
    beat(M, t, i) {
      if (i % 4 === 0) M.drum("dum", t, 0.18);
      if (i % 2 === 1 && M.chance(0.6)) M.drum("wood", t, 0.1, 0.3);
      if (M.chance(i % 2 ? 0.45 : 0.85)) M.flute(M.f(M.walk("d", 3, 11), 0), t, 0.32, { vol: 0.07, breath: 0.35, depth: 8e-3, attack: 0.02, x: 0.15, bend: M.chance(0.1) ? 1 : 0 });
      if (i % 8 === 0) M.pluck(M.f(0, -1), t, { vol: 0.16, damp: 0.3, x: -0.3 });
    }
  },
  // Kremlin and St Basil's: the zvon - bells pealing in patterns - over a low choir
  kremlin: {
    bpm: 72, root: 50, scale: AS_SCALES.aeolian, wet: 0.55,
    init(M, t) {
      M.pad([AS_MIDI(38), AS_MIDI(45), AS_MIDI(50)], t, 600, { vol: 0.035, cutoff: 900, attack: 4, formant: true, detune: 7 });
    },
    beat(M, t, i) {
      const z = [[0, 4], [2], [0, 4], [3], [0], [2, 4], [1], [2]][i % 8];
      for (const d of z) M.bell(M.f(d, 1), t, { vol: 0.07, dur: 2.2, x: (d - 2) * 0.2 });
      if (i % 8 === 0) M.bell(M.f(0, -1), t, { vol: 0.2, dur: 6, partials: [[1, 1, 1], [1.2, 0.6, 0.7], [2.0, 0.5, 0.6], [2.6, 0.3, 0.4], [4.1, 0.2, 0.3]] });
      if (i % 32 === 16) M.pad([M.f(M.walk("ch", 0, 7), 0), M.f(2, 0)], t, 3.5, { vol: 0.04, cutoff: 1400, formant: true, attack: 1 });
    }
  },
  // Prussian brick Gothic: a pipe organ chorale
  prussian: {
    bpm: 66, root: 43, scale: AS_SCALES.major, wet: 0.6, level: 0.8,
    beat(M, t, i) {
      if (i % 4 !== 0) return;
      const prog = [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4], [5, 7, 9], [3, 5, 7], [1, 3, 5], [4, 6, 8]];
      const ch = prog[Math.floor(i / 4) % prog.length];
      M.pad(ch.map((d) => M.f(d, 0)).concat([M.f(ch[0], -1)]), t, 60 / 66 * 2 - 0.1, { vol: 0.035, wave: "square", cutoff: 1800, attack: 0.08, release: 0.25, detune: 2 });
      if (M.chance(0.6)) M.pad([M.f(ch[M.walk("s", 0, 2)] + 7, 0)], t, 60 / 66 * 2 - 0.15, { vol: 0.02, wave: "triangle", cutoff: 3e3, attack: 0.05, release: 0.2, detune: 1 });
    }
  },
  // Gaudi's Barcelona: a Spanish guitar in the Phrygian mode, castanets
  gaudi: {
    bpm: 104, root: 52, scale: AS_SCALES.phrygian, wet: 0.3, level: 1.4,
    beat(M, t, i) {
      const prog = [0, 6, 5, 4], ch = prog[Math.floor(i / 8) % 4];
      if (i % 8 === 0) for (let k = 0; k < 5; k++) M.pluck(M.f(ch + [0, 2, 4, 7, 9][k], -1), t + k * 0.025, { vol: 0.13, damp: 0.25, decay: 0.994, body: 220, x: -0.3 });
      else if (M.chance(0.6)) M.pluck(M.f(ch + M.walk("g", 3, 10), 0), t, { vol: 0.2, damp: 0.2, decay: 0.993, dur: 1.4, body: 300, x: 0.1 });
      if ([3, 6].includes(i % 8)) M.drum("castanet", t, 0.15, 0.35);
    }
  },
  // Frank Lloyd Wright: warm wooden marimba lines, prairie-open, a little jazz
  wright: {
    bpm: 88, root: 53, scale: AS_SCALES.major, wet: 0.35, swing: 0.12, level: 0.85,
    beat(M, t, i) {
      const prog = [[0, 2, 4, 6], [3, 5, 7, 9], [1, 3, 5, 7], [4, 6, 8, 10]], ch = prog[Math.floor(i / 8) % 4];
      if (i % 8 === 0) M.pad(ch.map((d) => M.f(d, 0)), t, 3.6, { vol: 0.025, wave: "triangle", cutoff: 1500, attack: 0.4 });
      if (M.chance(0.7)) M.bell(M.f(M.walk("mar", 4, 14), 0), t, { vol: 0.12, dur: 0.8, partials: [[1, 1, 1], [3.9, 0.3, 0.25], [10, 0.08, 0.1]], x: 0.2 });
      if (i % 4 === 2) M.drum("tick", t, 0.12);
    }
  },
  // Le Corbusier: machine-age piano - clear lines, parallel chords, a steady pulse
  corbusier: {
    bpm: 92, root: 57, scale: AS_SCALES.lydian, wet: 0.3, level: 1.4,
    beat(M, t, i) {
      const piano = (f, v) => M.bell(f, t, { vol: v, dur: 2, partials: [[1, 1, 1], [2, 0.4, 0.6], [3, 0.2, 0.4], [4, 0.1, 0.3]], attack: 4e-3 });
      if (i % 2 === 0) piano(M.f([0, 4, 2, 4][i / 2 % 4], -1), 0.07);
      if (M.chance(0.55)) {
        const d = M.walk("p", 7, 16);
        piano(M.f(d, 0), 0.08);
        piano(M.f(d + 2, 0), 0.05);
      }
      if (i % 4 === 0) M.drum("clave", t, 0.06, 0.3);
    }
  },
  // Richard Meier: luminous minimal piano and a white pad
  meier: {
    bpm: 70, root: 60, scale: AS_SCALES.lydian, wet: 0.55,
    beat(M, t, i) {
      if (i % 16 === 0) M.pad([M.f(0, -1), M.f(4, -1), M.f(6, 0)], t, 7, { vol: 0.03, wave: "triangle", cutoff: 2500, attack: 2 });
      if (M.chance(0.35)) M.bell(M.f(M.walk("w", 5, 14), 0), t, { vol: 0.08, dur: 3, partials: [[1, 1, 1], [2, 0.25, 0.5], [4, 0.08, 0.3]], x: M.rnd() * 0.8 - 0.4 });
    }
  },
  // Tadao Ando: a shakuhachi and a koto in the in scale, long silences, still water
  ando: {
    bpm: 46, root: 62, scale: AS_SCALES.in, wet: 0.7, level: 1.5,
    beat(M, t, i) {
      if (i % 16 === 0 && M.chance(0.8)) M.flute(M.f(M.walk("sh", 0, 6), -1), t, 3.4, { vol: 0.08, breath: 1.2, depth: 0.025, vib: 4, attack: 0.5, bend: M.chance(0.4) ? 1 : 0 });
      if (i % 4 === 2 && M.chance(0.35)) M.pluck(M.f(M.walk("k", 3, 10), 0), t, { vol: 0.2, damp: 0.12, decay: 0.997, dur: 3, x: 0.35, bend: M.chance(0.3) ? 1 : 0 });
      if (M.chance(0.05)) M.drip(t, { vol: 0.03, x: -0.4 });
    }
  },
  // I. M. Pei: glass and stone - celesta figures over a pentatonic pad, East meeting West
  pei: {
    bpm: 72, root: 60, scale: AS_SCALES.gong, wet: 0.5,
    beat(M, t, i) {
      if (i % 16 === 0) M.pad([M.f(0, -1), M.f(2, -1), M.f(4, -1)], t, 7.5, { vol: 0.03, wave: "sawtooth", cutoff: 900, attack: 2 });
      if (i % 2 === 0 || M.chance(0.3)) M.bell(M.f([0, 2, 4, 2, 3, 1, 4, 3][i % 8] + Math.floor(i / 16) % 3, 1), t, { vol: 0.06, dur: 1.6, partials: [[1, 1, 1], [3, 0.3, 0.3], [5.04, 0.1, 0.2]], x: Math.sin(i * 0.7) * 0.5 });
      if (i % 32 === 20) M.pluck(M.f(M.walk("pp", 2, 8), -1), t, { vol: 0.2, damp: 0.2, decay: 0.997, dur: 2.5, bend: 1.5, bendT: 0.2 });
    }
  },
  // Frank Gehry: metal - detuned bells tumbling in whole tones, a restless pulse
  gehry: {
    bpm: 104, root: 55, scale: AS_SCALES.whole, wet: 0.4, level: 1.7,
    beat(M, t, i) {
      if (M.chance(0.6)) M.bell(M.f(M.walk("t", 0, 12, 0.4), 0), t, { vol: 0.06, dur: 1.2, partials: [[1, 1, 1], [2.31, 0.6, 0.5], [3.8, 0.4, 0.4], [6.2, 0.2, 0.2]], x: M.rnd() * 1.2 - 0.6 });
      if (i % 4 === 0) M.bell(M.f(M.pick([0, 1, 3]), -1), t, { vol: 0.1, dur: 0.6, partials: [[1, 1, 1], [3.9, 0.3, 0.2]] });
      if (i % 2 === 1) M.drum("shaker", t, 0.06);
      if (i % 16 === 0) M.drum("taiko", t, 0.12);
    }
  },
  // Zaha Hadid: flowing synth arpeggios over a slowly turning pad
  hadid: {
    bpm: 112, root: 57, scale: AS_SCALES.aeolian, wet: 0.5,
    beat(M, t, i) {
      const prog = [[0, 2, 4], [5, 7, 9], [3, 5, 7], [6, 8, 10]], ch = prog[Math.floor(i / 16) % 4];
      if (i % 16 === 0) M.pad(ch.map((d) => M.f(d, -1)), t, 8, { vol: 0.03, cutoff: 1100, attack: 2.5, release: 2.5 });
      const arp = [0, 1, 2, 1, 2, 0, 2, 1];
      M.pad([M.f(ch[arp[i % 8]] + (i % 16 >= 8 ? 7 : 0), 1)], t, 0.18, { vol: 0.03, wave: "triangle", cutoff: 4e3, attack: 0.01, release: 0.4, detune: 4, x: Math.sin(i * 0.4) * 0.6 });
    }
  }
};
