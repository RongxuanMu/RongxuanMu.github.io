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
var pcEnv = null;
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
