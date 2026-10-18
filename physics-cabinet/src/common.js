// src/worlds/physics-cabinet.js
// Physics Cabinet: ten tabletop physics experiments you can pick up and play with, one at a time on a plate in
// front of you. Every one is simulated live in the page (no engine): position-based fluid, pendulums with
// exact collisions, XPBD cloth and jelly, rigid-body precession, a Galton board, n-body orbits and the
// magnetic pendulum with its fractal map. Grab, drag, poke (fingertips push cloth and jelly) and throw.
import * as THREE6 from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { Line2 as PcLine2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry as PcLineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { RoomEnvironment as PcRoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
var PC_G = 9.81;
var PC_TABLE_BELOW_HEAD = 0.5;
var PC_PLATE_R = 0.3;
var pcEnv = null, pcWaterEnv = null;
var _pcV = new THREE6.Vector3(), _pcV2 = new THREE6.Vector3(), _pcQ = new THREE6.Quaternion();
var PC_YUP = new THREE6.Vector3(0, 1, 0);
// fat lines get their pixel resolution from the camera that draws them (each eye in XR)
function pcLineRes(l, lm) {
  l.onBeforeRender = (renderer, scene, camera) => {
    const vp = camera.viewport;
    if (vp) lm.resolution.set(vp.z, vp.w);
    else renderer.getSize(lm.resolution);
  };
  l.userData.noCollider = l.userData.noHighlight = true;
  return l;
}
function pcRims(geo, opacity, px, color = 16777215) {
  const eg = new THREE6.EdgesGeometry(geo, 30);
  const lm = new LineMaterial({ color, linewidth: px, transparent: true, opacity, worldUnits: false });
  const l = pcLineRes(new LineSegments2(new LineSegmentsGeometry().setPositions(Array.from(eg.attributes.position.array)), lm), lm);
  eg.dispose();
  return l;
}
// a fading-free polyline trail with a ring buffer of points
function pcTrail(n, color, px = 2.5, opacity = 0.85) {
  const lm = new LineMaterial({ color, linewidth: px, transparent: true, opacity, worldUnits: false });
  const line = pcLineRes(new PcLine2(new PcLineGeometry(), lm), lm);
  line.frustumCulled = false;
  const pts = [];
  let dirty = false, count = 0;
  line.visible = false;
  return {
    line,
    push(p) {
      pts.push(p.x, p.y, p.z);
      if (pts.length > n * 3) pts.splice(0, 3);
      dirty = true;
    },
    clear() {
      pts.length = 0;
      line.visible = false;
    },
    color(hex) {
      lm.color.setHex(hex);
    },
    // geometry is rebuilt at most once per frame, only when something was pushed
    flush() {
      if (!dirty) return;
      dirty = false;
      if (pts.length < 6) return void (line.visible = false);
      if (++count % 300 === 0 || pts.length / 3 !== line.userData.n) {
        line.geometry.dispose();
        line.geometry = new PcLineGeometry();
      }
      line.geometry.setPositions(pts);
      line.userData.n = pts.length / 3;
      line.computeLineDistances();
      line.visible = true;
    }
  };
}
// a unit cylinder (along Y) that can be stretched between two points
function pcRod(radius, mat, seg = 6) {
  const m = new THREE6.Mesh(new THREE6.CylinderGeometry(radius, radius, 1, seg, 1, true), mat);
  m.userData.noCollider = m.userData.noHighlight = true;
  m.set = (a, b) => {
    m.position.addVectors(a, b).multiplyScalar(0.5);
    _pcV.subVectors(b, a);
    const len = _pcV.length();
    m.scale.set(1, Math.max(len, 1e-6), 1);
    if (len > 1e-9) m.quaternion.setFromUnitVectors(PC_YUP, _pcV.divideScalar(len));
    return m;
  };
  return m;
}
// recent positions -> release velocity (m/s) for throws
function pcTracker() {
  const s = [];
  return {
    reset() {
      s.length = 0;
    },
    push(p, t = performance.now() / 1e3) {
      s.push([p.clone(), t]);
      while (s.length > 2 && t - s[0][1] > 0.1) s.shift();
    },
    velocity(out = new THREE6.Vector3()) {
      if (s.length < 2) return out.set(0, 0, 0);
      const [a, ta] = s[0], [b, tb] = s[s.length - 1];
      return tb - ta < 1e-3 ? out.set(0, 0, 0) : out.subVectors(b, a).divideScalar(tb - ta);
    }
  };
}
// a grab bar under a floating panel: drag it to put the panel anywhere (it keeps facing you); the panel is a
// child of the plate, so wherever you leave it, it then travels with the plate. The box covers only the bar.
var _pcLook = new THREE6.Object3D();
function pcPanelHandle(ctx, root, { w = 0.12, y = -0.16 } = {}) {
  const T = THREE6, bar = new T.Mesh(new T.CapsuleGeometry(5e-3, w, 4, 12).rotateZ(Math.PI / 2), new T.MeshBasicMaterial({ color: 12632256 }));
  bar.position.set(0, y, 4e-3);
  bar.name = "panel-handle";
  bar.userData.noCollider = bar.userData.noHighlight = true;
  root.add(bar);
  const it = ctx.add(root, {
    draggable: true, highlight: false,
    box: new T.Box3(new T.Vector3(-w / 2 - 0.012, y - 0.013, -0.012), new T.Vector3(w / 2 + 0.012, y + 0.013, 0.016)),
    constrain: ({ position, quaternion }) => {
      _pcLook.position.copy(position);
      _pcLook.lookAt(ctx.app.input.head);
      quaternion.copy(_pcLook.quaternion);
    }
  });
  it.on("statechange", ({ level }) => bar.material.color.setHex(level ? 16777215 : 12632256));
  return it;
}
var PC_MAT = {
  chrome: () => new THREE6.MeshStandardMaterial({ color: 15263976, metalness: 1, roughness: 0.12, envMap: pcEnv }),
  steel: () => new THREE6.MeshStandardMaterial({ color: 12632256, metalness: 0.9, roughness: 0.3, envMap: pcEnv }),
  brass: () => new THREE6.MeshStandardMaterial({ color: 14199374, metalness: 1, roughness: 0.25, envMap: pcEnv }),
  wood: () => new THREE6.MeshStandardMaterial({ color: 6965812, roughness: 0.7 }),
  dark: () => new THREE6.MeshStandardMaterial({ color: 2236962, roughness: 0.6 }),
  white: () => new THREE6.MeshStandardMaterial({ color: 15724527, roughness: 0.5 }),
  string: () => new THREE6.MeshBasicMaterial({ color: 14540253 }),
  glass: (opacity = 0.12) => new THREE6.MeshStandardMaterial({ color: 16777215, transparent: true, opacity, roughness: 0.05, metalness: 0.1, envMap: pcEnv, depthWrite: false })
};
function pcStd(color, o = {}) {
  return new THREE6.MeshStandardMaterial({ color, roughness: 0.45, ...o });
}
// - sounds: small synthesized effects for the exhibits (nothing to download). One kit per exhibit; its
// continuous voices (rustle, hum, whoosh) stop when the exhibit is put away -
var PcSfx = class {
  constructor(app) {
    this.app = app;
    this.voices = [];
    this.last = {};
  }
  // the audio context once the page has had a gesture (sounds before that are skipped, not queued)
  _c(make = false) {
    const s = this.app.sfx, c = make ? s.ensure() : s.ctx;
    if (!c || c.state !== "running") return null;
    if (this.c !== c) {
      this.c = c;
      this.out = c.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(c.destination);
    }
    return c;
  }
  // rate limit per key: false if the same sound played less than `gap` seconds ago
  ok(key, gap) {
    const t = performance.now() / 1e3;
    if (t - (this.last[key] ?? -1) < gap) return false;
    this.last[key] = t;
    return true;
  }
  _env(g, t, peak, dur, attack = 4e-3) {
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(Math.max(2e-4, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
  }
  _noise(c, t, dur) {
    const s = c.createBufferSource();
    s.buffer = this.app.sfx.noise;
    s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    s.start(t, Math.random() * 0.05);
    s.stop(t + dur + 0.05);
    return s;
  }
  // a wet squelch ("gengjiu"): a formant sweeping down through noise, over a quick falling blip
  squish(gain = 0.3, pitch = 1) {
    const c = this._c(true);
    if (!c) return;
    const t = c.currentTime, dur = 0.16 + Math.random() * 0.05;
    const bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = "bandpass";
    bp.Q.value = 5;
    bp.frequency.setValueAtTime(1500 * pitch, t);
    bp.frequency.exponentialRampToValueAtTime(350 * pitch, t + dur);
    this._env(g, t, gain * 1.6, dur, 8e-3);
    this._noise(c, t, dur).connect(bp).connect(g).connect(this.out);
    const o = c.createOscillator(), g2 = c.createGain();
    o.frequency.setValueAtTime(520 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(150 * pitch, t + 0.09);
    this._env(g2, t, gain * 0.5, 0.1);
    o.connect(g2).connect(this.out);
    o.start(t);
    o.stop(t + 0.12);
  }
  // a springy wobble ("duang"): a low tone that overshoots, then wobbles down as the vibrato dies away
  boing(gain = 0.3, f = 150, dur = 0.8) {
    const c = this._c(true);
    if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain();
    const lfo = c.createOscillator(), depth = c.createGain();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.setValueAtTime(f * 1.35, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(f * 0.82, t + dur);
    o2.frequency.setValueAtTime(f * 2.7, t);
    o2.frequency.exponentialRampToValueAtTime(f * 1.64, t + dur);
    lfo.frequency.setValueAtTime(13, t);
    lfo.frequency.linearRampToValueAtTime(7, t + dur);
    depth.gain.setValueAtTime(f * 0.18, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.01, t + dur);
    lfo.connect(depth);
    depth.connect(o.frequency);
    depth.connect(o2.frequency);
    this._env(g, t, gain, dur, 6e-3);
    this._env(g2, t, gain * 0.25, dur * 0.6, 6e-3);
    o.connect(g).connect(this.out);
    o2.connect(g2).connect(this.out);
    for (const x of [o, o2, lfo]) x.start(t), x.stop(t + dur + 0.05);
  }
  // steel on steel: a few inharmonic partials and a tick of noise
  clack(gain = 0.2) {
    const c = this._c(true);
    if (!c) return;
    const t = c.currentTime, d = 0.9 + Math.random() * 0.2;
    for (const [f, a, dur] of [[2950, 1, 0.07], [4410, 0.6, 0.05], [6240, 0.35, 0.035]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * d;
      this._env(g, t, gain * a, dur, 1e-3);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    const hp = c.createBiquadFilter(), g = c.createGain();
    hp.type = "highpass";
    hp.frequency.value = 3000;
    this._env(g, t, gain * 0.7, 0.012, 1e-3);
    this._noise(c, t, 0.02).connect(hp).connect(g).connect(this.out);
  }
  // a tiny ping (a bead on a peg) or a soft knock, by pitch
  tick(gain = 0.08, f = 3800, dur = 0.05) {
    const c = this._c(true);
    if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f * (0.95 + Math.random() * 0.1);
    this._env(g, t, gain, dur, 1e-3);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // a soft bell-like bloop (pendulum wave notes)
  note(f, gain = 0.06, dur = 0.6) {
    const c = this._c(true);
    if (!c) return;
    const t = c.currentTime;
    for (const [m, a] of [[1, 1], [2.01, 0.25]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * m;
      this._env(g, t, gain * a, dur * (m > 1 ? 0.5 : 1), 6e-3);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }
  // a continuous voice: "rustle" (cloth), "whoosh" (air), "hum" (a spinning top), "scrape"; set(level, freq)
  // every frame, it glides there
  voice(kind) {
    const v = { kind, n: null, set: (level, f) => {
      const c = this._c();
      if (!c) return;
      if (!v.n) {
        const g = c.createGain();
        g.gain.value = 0;
        let src, filt = c.createBiquadFilter();
        if (kind === "hum") {
          src = c.createOscillator();
          src.type = "sawtooth";
          filt.type = "lowpass";
          filt.frequency.value = 700;
          filt.Q.value = 2;
        } else {
          src = c.createBufferSource();
          src.buffer = this.app.sfx.noise;
          src.loop = true;
          filt.type = "bandpass";
          filt.Q.value = kind === "rustle" ? 0.7 : kind === "scrape" ? 3 : 1.2;
        }
        src.connect(filt).connect(g).connect(this.out);
        src.start();
        v.n = { src, filt, g };
      }
      const t = c.currentTime;
      v.n.g.gain.setTargetAtTime(Math.max(0, level), t, 0.05);
      if (kind === "hum") v.n.src.frequency.setTargetAtTime(f, t, 0.05), v.n.filt.frequency.setTargetAtTime(f * 3, t, 0.05);
      else v.n.filt.frequency.setTargetAtTime(f, t, 0.05);
    } };
    this.voices.push(v);
    return v;
  }
  stop() {
    for (const v of this.voices) if (v.n) {
      try {
        v.n.g.gain.setTargetAtTime(0, this.c.currentTime, 0.05);
        v.n.src.stop(this.c.currentTime + 0.3);
      } catch (_) {
      }
    }
    this.voices = [];
  }
};
