// src/worlds/roadster.js
// Roadster Night: a fan-made miniature of the Roadster reveal (15 Oct 2026, SpaceX's rocket test site at
// McGregor, near Waco, Texas). A 1:60 diorama on your floor - the launch pad at night, the curl ramp, the
// line-up of five cars, the stands, the screen and a rocket on its test stand - plays the show by itself:
// 0-60 mph in 0.81 s, up the inverted ramp and off the top with a mid-air roll, a thruster hop over the
// line-up, then a finale. Take over with the joystick (or pinch the floor) to drive it yourself.
// Everything is built from code (no model files) and kept light enough for standalone and tethered headsets.
// Not affiliated with Tesla or SpaceX.
import * as THREE6 from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { RoomEnvironment as RnRoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
// the diorama is built in real metres inside a group scaled 1:60
var RN_SC = 1 / 60;
var RN_PAD_R = 54;
var RN_STAGE_R = RN_PAD_R * RN_SC;
var RN_FLOOR_BELOW_HEAD = 1.6;
var RN_TABLE_BELOW_HEAD = 0.5;
var RN_TABLE_SCALE = 0.42;
var RN_G = 9.81;
// diorama time vs yours: true-scale speed at 1:60 reads as slow motion (a miniature needs about sqrt(60) = 7.7x to
// look real, which is too fast to follow); 2.5x keeps the stunts readable and lively
var RN_PACE = 2.5;
// the course (real metres; +x right, -z away from you): launch strip in front, the curl ramp and the
// thruster jump behind it, the stands, screen and test stand at the back
var RN_LAUNCH = { x0: -42, z: 16 };
var RN_LOOP = { x: -6, z: -6, R: 9, entry: 30, w: 5.2 };
var RN_JUMP = { x0: -30, z: -24, take: 0, line: 9 };
var rnEnv = null;
var RN_WRAP = (a) => Math.atan2(Math.sin(a), Math.cos(a));
var _rnV = new THREE6.Vector3(), _rnV2 = new THREE6.Vector3(), _rnQ = new THREE6.Quaternion(), _rnM = new THREE6.Matrix4();
var RN_UP = new THREE6.Vector3(0, 1, 0);
function rnStd(color, o = {}) {
  return new THREE6.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...o });
}
function rnGlow(color, opacity = 1) {
  return new THREE6.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}
function rnQuiet(o) {
  o.traverse((c) => c.userData.noCollider = c.userData.noHighlight = true);
  return o;
}
// fat lines size their pixels from the camera drawing them (each eye in XR)
function rnLines(pts, { px = 2, opacity = 0.9, color = 16777215 } = {}) {
  const lm = new LineMaterial({ color, linewidth: px, transparent: true, opacity, worldUnits: false });
  const l = new LineSegments2(new LineSegmentsGeometry().setPositions(pts), lm);
  l.onBeforeRender = (renderer, scene, camera) => {
    const vp = camera.viewport;
    if (vp) lm.resolution.set(vp.z, vp.w);
    else renderer.getSize(lm.resolution);
  };
  return rnQuiet(l);
}
function rnCircle(r, y = 0, n = 128) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2;
    out.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(b) * r, y, Math.sin(b) * r);
  }
  return out;
}
// - a lofted, flat-shaded body: stations along +x, each an (x, w, yb, ys, yr, wr) cross-section: half width,
// sill, shoulder and roof heights and the roof's half width. Angular on purpose (the new design language) -
function rnStation(list, x) {
  if (x <= list[0][0]) return list[0];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    if (x <= b[0]) {
      const t = (x - a[0]) / (b[0] - a[0]);
      return a.map((v, k) => v + (b[k] - v) * t);
    }
  }
  return list[list.length - 1];
}
function rnSection([x, w, yb, ys, yr, wr]) {
  return [[w, yb + 0.06], [w, ys], [wr, yr], [-wr, yr], [-w, ys], [-w, yb + 0.06], [-w * 0.86, yb], [w * 0.86, yb]].map(([z, y]) => [x, y, z]);
}
function rnLoft(list, { steps = 14, section = rnSection, caps = true } = {}) {
  const x0 = list[0][0], x1 = list[list.length - 1][0], rings = [];
  for (let i = 0; i <= steps; i++) rings.push(section(rnStation(list, x0 + (x1 - x0) * i / steps)));
  const pos = [], quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const n = rings[0].length;
  for (let i = 0; i < steps; i++) for (let k = 0; k < n; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % n], c = rings[i + 1][(k + 1) % n], d = rings[i + 1][k];
    quad(a, d, c, b);
  }
  if (caps) for (const [r, flip] of [[rings[0], false], [rings[steps], true]]) for (let k = 1; k < n - 1; k++) {
    if (flip) pos.push(...r[0], ...r[k], ...r[k + 1]);
    else pos.push(...r[0], ...r[k + 1], ...r[k]);
  }
  const g = new THREE6.BufferGeometry();
  g.setAttribute("position", new THREE6.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function rnWheel(r, w, mat, rim) {
  const g = new THREE6.Group(), tyre = new THREE6.Mesh(new THREE6.CylinderGeometry(r, r, w, 16).rotateX(Math.PI / 2), mat);
  const hub = new THREE6.Mesh(new THREE6.CylinderGeometry(r * 0.62, r * 0.62, w * 1.04, 6).rotateX(Math.PI / 2), rim);
  g.add(tyre, hub);
  return g;
}
// - the Roadster (stark white, wedge, light bars), forward +x, origin on the ground between the axles -
var RN_ROADSTER = [
  [-2.3, 0.92, 0.24, 0.74, 0.84, 0.66],
  [-1.6, 1.0, 0.17, 0.8, 1.0, 0.6],
  [-0.4, 1.0, 0.15, 0.76, 1.12, 0.48],
  [0.6, 0.98, 0.15, 0.68, 0.98, 0.5],
  [1.5, 0.96, 0.16, 0.56, 0.62, 0.72],
  [2.3, 0.84, 0.2, 0.36, 0.4, 0.74]
];
function rnBuildRoadster() {
  const car = new THREE6.Group();
  car.name = "roadster";
  const white = rnStd(16250871, { roughness: 0.22, metalness: 0.35, envMap: rnEnv, envMapIntensity: 1.2 });
  const body = new THREE6.Mesh(rnLoft(RN_ROADSTER), white);
  car.add(body);
  // the canopy: a dark glass band over the cabin
  const glass = rnStd(1055264, { roughness: 0.08, metalness: 0.6, envMap: rnEnv });
  const canopy = new THREE6.Mesh(rnLoft(RN_ROADSTER.map((s) => s.slice()).filter((s) => s[0] > -1.7 && s[0] < 1.6), {
    steps: 8, caps: false,
    section: ([x, w, yb, ys, yr, wr]) => {
      const f = THREE6.MathUtils.clamp(1 - Math.abs(x + 0.2) / 1.5, 0, 1), k = 0.18 + 0.4 * f, o = 0.012;
      const sz = wr + (w - wr) * k, sy = yr - (yr - ys) * k;
      return [[sz + o, sy + o], [wr + o * 0.5, yr + o], [-wr - o * 0.5, yr + o], [-sz - o, sy + o]].map(([z, y]) => [x, y, z]);
    }
  }), glass);
  car.add(canopy);
  // light bars: a white blade across the nose, a red one across the tail
  const front = new THREE6.Mesh(new THREE6.BoxGeometry(0.04, 0.035, 1.5), rnGlow(15661055));
  front.position.set(2.31, 0.37, 0);
  const rear = new THREE6.Mesh(new THREE6.BoxGeometry(0.04, 0.04, 1.62), rnGlow(16719420));
  rear.position.set(-2.32, 0.74, 0);
  car.add(front, rear);
  // tail: diffuser, two cold-gas nozzles
  const dark = rnStd(1710618, { roughness: 0.6 });
  const diff = new THREE6.Mesh(new THREE6.BoxGeometry(0.3, 0.16, 1.5), dark);
  diff.position.set(-2.22, 0.3, 0);
  car.add(diff);
  for (const z of [-0.42, 0.42]) {
    const n = new THREE6.Mesh(new THREE6.CylinderGeometry(0.07, 0.09, 0.14, 10).rotateZ(Math.PI / 2), rnStd(5263440, { metalness: 0.9, roughness: 0.3, envMap: rnEnv }));
    n.position.set(-2.33, 0.48, z);
    car.add(n);
  }
  // side intakes
  for (const s of [-1, 1]) {
    const intake = new THREE6.Mesh(new THREE6.BoxGeometry(0.9, 0.18, 0.02), dark);
    intake.position.set(-0.9, 0.5, s * 1.005);
    intake.rotation.x = s * 0.05;
    car.add(intake);
  }
  const tyre = rnStd(1052688, { roughness: 0.85 }), rim = rnStd(9474192, { metalness: 0.9, roughness: 0.35, envMap: rnEnv });
  const wheels = [];
  for (const [x, z, front2] of [[1.42, 0.86, true], [1.42, -0.86, true], [-1.42, 0.88, false], [-1.42, -0.88, false]]) {
    const steer = new THREE6.Group(), w = rnWheel(0.36, 0.3, tyre, rim);
    steer.position.set(x, 0.36, z);
    steer.add(w);
    car.add(steer);
    wheels.push({ steer, spin: w, front: front2 });
  }
  // suction-fan glow under the floor (on while it clings to the ramp)
  const glow = new THREE6.Mesh(new THREE6.PlaneGeometry(3.6, 1.6).rotateX(Math.PI / 2), new THREE6.MeshBasicMaterial({ color: 7387903, transparent: true, opacity: 0, blending: THREE6.AdditiveBlending, depthWrite: false }));
  glow.position.y = 0.1;
  car.add(glow);
  car.userData = { wheels, glow, front, rear };
  return rnQuiet(car);
}
// - the line-up it jumps over, as simple silhouettes (no badges): Cybercab, Cybertruck, Semi, Model Y, Model 3 -
function rnVehicle(kind) {
  const g = new THREE6.Group(), tyre = rnStd(1052688, { roughness: 0.85 }), rim = rnStd(7368816, { metalness: 0.8, roughness: 0.4 });
  const glass = rnStd(1055264, { roughness: 0.1, metalness: 0.5, envMap: rnEnv });
  const wheels = (xs, z, r) => {
    for (const x of xs) for (const s of [-1, 1]) {
      const w = rnWheel(r, 0.28, tyre, rim);
      w.position.set(x, r, s * z);
      g.add(w);
    }
  };
  let len = 4.7, wid = 2, hgt = 1.5;
  if (kind === "cybertruck") {
    const steel = rnStd(12105912, { metalness: 0.85, roughness: 0.32, envMap: rnEnv });
    const prof = [[-2.85, 0.45], [-2.85, 1.38], [0.25, 1.9], [2.85, 1.1], [2.85, 0.45]];
    const shape = new THREE6.Shape(prof.map(([x, y]) => new THREE6.Vector2(x, y)));
    const body = new THREE6.Mesh(new THREE6.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false }).translate(0, 0, -1), steel);
    g.add(body);
    const ws = new THREE6.Mesh(new THREE6.PlaneGeometry(1.5, 1.7), glass);
    ws.position.set(1.15, 1.56, 0);
    ws.rotation.set(0, Math.PI / 2, 0);
    ws.rotateX(-0.3);
    g.add(ws);
    wheels([-1.9, 1.9], 1, 0.44);
    len = 5.7;
    hgt = 1.9;
    wid = 2.03;
  } else if (kind === "semi") {
    const paint = rnStd(14211288, { metalness: 0.4, roughness: 0.3, envMap: rnEnv });
    const cab = new THREE6.Mesh(rnLoft([[-1.2, 1.25, 0.9, 2.6, 3.9, 1.1], [0.8, 1.25, 0.9, 2.6, 3.9, 1.1], [2.2, 1.25, 0.6, 1.4, 3.0, 1.05], [2.6, 1.2, 0.6, 1.0, 1.6, 1.1]], { steps: 6 }), paint);
    cab.position.x = 1.3;
    g.add(cab);
    const ws = new THREE6.Mesh(new THREE6.PlaneGeometry(2.2, 1.2), glass);
    ws.position.set(3.15, 2.75, 0);
    ws.rotation.set(0, Math.PI / 2, 0);
    ws.rotateX(-0.6);
    g.add(ws);
    const frame = new THREE6.Mesh(new THREE6.BoxGeometry(5, 0.4, 1.1), rnStd(2236962));
    frame.position.set(-1.2, 0.85, 0);
    g.add(frame);
    const fifth = new THREE6.Mesh(new THREE6.CylinderGeometry(0.55, 0.55, 0.15, 16), rnStd(3355443));
    fifth.position.set(-2.2, 1.1, 0);
    g.add(fifth);
    wheels([2.6, -1.6, -3.0], 1.05, 0.52);
    len = 7.2;
    hgt = 3.9;
    wid = 2.5;
  } else {
    const spec = {
      cybercab: { c: 14206606, st: [[-1.95, 0.86, 0.22, 0.7, 1.2, 0.55], [-0.8, 0.92, 0.18, 0.76, 1.42, 0.58], [0.4, 0.92, 0.18, 0.74, 1.38, 0.56], [1.4, 0.9, 0.2, 0.66, 0.95, 0.66], [1.95, 0.8, 0.24, 0.52, 0.6, 0.66]], w: [-1.3, 1.3], wz: 0.82 },
      modely: { c: 12722486, st: [[-2.38, 0.92, 0.3, 0.86, 1.12, 0.72], [-1.6, 0.97, 0.22, 0.92, 1.58, 0.66], [0.2, 0.98, 0.2, 0.9, 1.62, 0.64], [1.3, 0.97, 0.22, 0.82, 1.06, 0.82], [2.38, 0.9, 0.3, 0.62, 0.72, 0.8]], w: [-1.45, 1.45], wz: 0.86 },
      model3: { c: 2245006, st: [[-2.35, 0.9, 0.3, 0.78, 0.98, 0.72], [-1.5, 0.95, 0.2, 0.84, 1.36, 0.62], [0.2, 0.96, 0.18, 0.82, 1.44, 0.6], [1.2, 0.95, 0.2, 0.74, 0.92, 0.8], [2.35, 0.88, 0.28, 0.56, 0.62, 0.78]], w: [-1.45, 1.45], wz: 0.84 }
    }[kind];
    const paint = rnStd(spec.c, { metalness: 0.45, roughness: 0.28, envMap: rnEnv });
    g.add(new THREE6.Mesh(rnLoft(spec.st, { steps: 10 }), paint));
    const top = spec.st.filter((s) => s[0] > -1.7 && s[0] < 1.4);
    g.add(new THREE6.Mesh(rnLoft(top, { steps: 6, caps: false, section: ([x, w, yb, ys, yr, wr]) => [[wr + (w - wr) * 0.45 + 0.012, yr - (yr - ys) * 0.45], [wr + 0.01, yr + 0.01], [-wr - 0.01, yr + 0.01], [-wr - (w - wr) * 0.45 - 0.012, yr - (yr - ys) * 0.45]].map(([z, y]) => [x, y, z]) }), glass));
    wheels(spec.w, spec.wz, 0.35);
    len = spec.st[spec.st.length - 1][0] - spec.st[0][0];
    hgt = Math.max(...spec.st.map((s) => s[4]));
  }
  g.userData = { len, wid, hgt };
  return rnQuiet(g);
}
// - the curl ramp: a straight run-in, then half a loop that ends upside down, 2R up -
function rnLoopPoint(th, out = new THREE6.Vector3()) {
  const L = RN_LOOP;
  return out.set(L.x + L.R * Math.cos(th), L.R + L.R * Math.sin(th), L.z);
}
function rnBuildRamp() {
  const L = RN_LOOP, g = new THREE6.Group(), hw = L.w / 2;
  const path = [];
  for (let i = 0; i <= 12; i++) path.push([L.x - L.entry + L.entry * i / 12, 0.02, -Math.PI / 2]);
  for (let i = 1; i <= 48; i++) {
    const th = -Math.PI / 2 + Math.PI * i / 48, p = rnLoopPoint(th);
    path.push([p.x, p.y, th]);
  }
  // deck: a ribbon whose surface normal points to the loop centre (or up on the run-in)
  const pos = [], idx = [], edges = [[], []], thick = 0.35;
  path.forEach(([x, y, th], i) => {
    const nx = -Math.cos(th), ny = -Math.sin(th);
    const up = i <= 12 ? [0, 1] : [nx, ny];
    for (const s of [-1, 1]) pos.push(x, y, L.z + s * hw);
    for (const s of [-1, 1]) pos.push(x - up[0] * thick, y - up[1] * thick, L.z + s * hw);
    edges[0].push(new THREE6.Vector3(x + up[0] * 0.12, y + up[1] * 0.12, L.z - hw));
    edges[1].push(new THREE6.Vector3(x + up[0] * 0.12, y + up[1] * 0.12, L.z + hw));
  });
  for (let i = 0; i < path.length - 1; i++) {
    const a = i * 4, b = a + 4;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
    idx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
    idx.push(a, a + 2, b, a + 2, b + 2, b);
    idx.push(a + 1, b + 1, a + 3, a + 3, b + 1, b + 3);
  }
  const deckG = new THREE6.BufferGeometry();
  deckG.setAttribute("position", new THREE6.Float32BufferAttribute(pos, 3));
  deckG.setIndex(idx);
  deckG.computeVertexNormals();
  const deck = new THREE6.Mesh(deckG, rnStd(12896189, { roughness: 0.7, side: THREE6.DoubleSide }));
  g.add(deck);
  // LED edges and lane stripes
  const led = rnGlow(9890047);
  for (const e of edges) g.add(new THREE6.Mesh(new THREE6.TubeGeometry(new THREE6.CatmullRomCurve3(e), 120, 0.12, 5), led));
  // supports: towers either side of the top, columns under the rising half, beams over the inverted end
  const steel = rnStd(5592405, { metalness: 0.6, roughness: 0.45 });
  const beam = (a, b, r = 0.22) => {
    const d = _rnV.subVectors(b, a), m = new THREE6.Mesh(new THREE6.CylinderGeometry(r, r, d.length(), 6), steel);
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(RN_UP, d.normalize());
    g.add(m);
  };
  const V = (x, y, z) => new THREE6.Vector3(x, y, z), topY = 2 * L.R + 0.6;
  for (const s of [-1, 1]) {
    const z = L.z + s * (hw + 1.4);
    for (const dx of [-1.2, 1.2]) beam(V(L.x + dx, 0, z), V(L.x + dx, topY + 0.5, z), 0.3);
    for (let y = 2; y < topY; y += 3.2) beam(V(L.x - 1.2, y, z), V(L.x + 1.2, y + 3.2, z), 0.12);
    beam(V(L.x, topY + 0.5, z), V(L.x + L.R * 0.7, L.R * 1.7 + 0.5, z), 0.18);
    for (const th of [-1.05, -0.5, 0, 0.5]) {
      const p = rnLoopPoint(th), o = V(-Math.cos(th), -Math.sin(th), 0).multiplyScalar(-0.5);
      const top = V(p.x + o.x, p.y + o.y, L.z + s * (hw - 0.4));
      if (th <= 0) beam(V(top.x, 0, top.z), top, 0.2);
      else beam(top, V(L.x + L.R * 0.7, L.R * 1.7 + 0.5, z), 0.14);
    }
  }
  beam(V(L.x, topY + 0.5, L.z - hw - 1.4), V(L.x, topY + 0.5, L.z + hw + 1.4), 0.26);
  return rnQuiet(g);
}
// - the venue: pad and markings, stands with a crowd, the big screen, light masts, a rocket on its stand -
function rnBuildVenue() {
  const g = new THREE6.Group();
  const pad = new THREE6.Mesh(new THREE6.CircleGeometry(RN_PAD_R, 96).rotateX(-Math.PI / 2), rnStd(1449505, { roughness: 0.92 }));
  pad.name = "pad";
  g.add(pad);
  const paint = rnGlow(15790320), amber = rnGlow(16764006);
  const strip = (x0, x1, z, w, mat = paint, y = 0.03) => {
    const m = new THREE6.Mesh(new THREE6.PlaneGeometry(x1 - x0, w).rotateX(-Math.PI / 2), mat);
    m.position.set((x0 + x1) / 2, y, z);
    g.add(m);
    return m;
  };
  // launch strip: edge lines, dashed centre, start line, 0-60 gate (60 mph is reached 10.9 m out)
  const LA = RN_LAUNCH;
  strip(LA.x0 - 2, 32, LA.z - 2.6, 0.18);
  strip(LA.x0 - 2, 32, LA.z + 2.6, 0.18);
  for (let x = LA.x0 + 2; x < 30; x += 4) strip(x, x + 2, LA.z, 0.12, amber);
  const gate = [];
  for (const [x, mat] of [[LA.x0 + 2.3, paint], [LA.x0 + 2.3 + 10.9, amber]]) {
    const m = new THREE6.Mesh(new THREE6.PlaneGeometry(0.35, 5.2).rotateX(-Math.PI / 2), mat);
    m.position.set(x, 0.035, LA.z);
    g.add(m);
    gate.push(m);
  }
  // the start gantry with its three lamps
  const steel = rnStd(3815994, { metalness: 0.6, roughness: 0.4 });
  for (const s of [-1, 1]) {
    const post = new THREE6.Mesh(new THREE6.BoxGeometry(0.3, 4.2, 0.3), steel);
    post.position.set(LA.x0 + 2.3, 2.1, LA.z + s * 3.4);
    g.add(post);
  }
  const bar = new THREE6.Mesh(new THREE6.BoxGeometry(0.4, 0.5, 7.1), steel);
  bar.position.set(LA.x0 + 2.3, 4.2, LA.z);
  g.add(bar);
  const lamps = [-1.4, 0, 1.4].map((dz) => {
    const l = new THREE6.Mesh(new THREE6.SphereGeometry(0.42, 12, 8), new THREE6.MeshBasicMaterial({ color: 3342336 }));
    l.position.set(LA.x0 + 2.05, 4.2, LA.z + dz);
    g.add(l);
    return l;
  });
  // jump lane and the curl ramp's run-in
  strip(RN_JUMP.x0 - 2, 44, RN_JUMP.z - 3, 0.16);
  strip(RN_JUMP.x0 - 2, 44, RN_JUMP.z + 3, 0.16);
  strip(-46, RN_LOOP.x - RN_LOOP.entry, RN_LOOP.z - 2.6, 0.16);
  strip(-46, RN_LOOP.x - RN_LOOP.entry, RN_LOOP.z + 2.6, 0.16);
  // stands: tiers on an arc behind the course, facing the middle, with a crowd
  const tierMat = rnStd(2763306, { roughness: 0.8 }), a0 = 247 * Math.PI / 180, a1 = 297 * Math.PI / 180;
  const people = [];
  for (let r = 0; r < 6; r++) {
    const R = 39 + r * 1.5, h = 0.5 + r * 0.75, n = 28;
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i + 0.5) / n, len = R * (a1 - a0) / n;
      const step = new THREE6.Mesh(new THREE6.BoxGeometry(len + 0.05, h, 1.5), tierMat);
      step.position.set(Math.cos(a) * R, h / 2, Math.sin(a) * R);
      step.rotation.y = -a + Math.PI / 2;
      g.add(step);
      for (let k = 0; k < 2; k++) if (Math.random() < 0.85) people.push([a + (k - 0.5) * (a1 - a0) / n * 0.5 + (Math.random() - 0.5) * 0.004, R + (Math.random() - 0.5) * 0.4, h]);
    }
  }
  const crowd = new THREE6.InstancedMesh(new THREE6.CapsuleGeometry(0.24, 0.85, 2, 6), rnStd(16777215, { roughness: 0.8 }), people.length);
  const tones = [3355443, 4473924, 2236979, 5592422, 6710886, 3359829, 5579298, 2245751];
  people.forEach(([a, R, h], i) => {
    _rnM.makeTranslation(Math.cos(a) * R, h + 0.66, Math.sin(a) * R);
    crowd.setMatrixAt(i, _rnM);
    crowd.setColorAt(i, new THREE6.Color(tones[i % tones.length]));
  });
  crowd.userData.base = people.map(([a, R, h]) => [Math.cos(a) * R, h + 0.66, Math.sin(a) * R, Math.random() * 6.28]);
  g.add(crowd);
  // phone lights in the crowd
  const ph = [];
  for (const [x, y, z] of crowd.userData.base) if (Math.random() < 0.18) ph.push(x, y + 0.7, z);
  const phones = new THREE6.Points(new THREE6.BufferGeometry().setAttribute("position", new THREE6.Float32BufferAttribute(ph, 3)), new THREE6.PointsMaterial({ color: 16777215, size: 0.35, sizeAttenuation: true }));
  g.add(phones);
  // the big screen over the stands
  const screenCanvas = document.createElement("canvas");
  screenCanvas.width = 1024;
  screenCanvas.height = 420;
  const screenTex = new THREE6.CanvasTexture(screenCanvas);
  screenTex.colorSpace = THREE6.SRGBColorSpace;
  const sa = 272 * Math.PI / 180, sx = Math.cos(sa) * 50, sz = Math.sin(sa) * 50;
  const screen = new THREE6.Mesh(new THREE6.PlaneGeometry(30, 12.3), new THREE6.MeshBasicMaterial({ map: screenTex }));
  screen.position.set(sx, 15, sz + 0.4);
  screen.lookAt(0, 9, 0);
  const frame = new THREE6.Mesh(new THREE6.BoxGeometry(31, 13.3, 0.6), steel);
  frame.position.set(sx, 15, sz);
  frame.lookAt(0, 9, -0.4 + 0);
  g.add(frame, screen);
  for (const dx of [-12, 12]) {
    const leg = new THREE6.Mesh(new THREE6.BoxGeometry(0.6, 9, 0.6), steel);
    leg.position.set(sx + dx, 4.5, sz - 0.5);
    g.add(leg);
  }
  // light masts with floodlight heads and soft beams down onto the pad
  const beams = [];
  const beamMat = new THREE6.MeshBasicMaterial({ color: 16772829, transparent: true, opacity: 0.045, blending: THREE6.AdditiveBlending, depthWrite: false, side: THREE6.DoubleSide });
  for (const deg of [200, 232, 312, 340]) {
    const a = deg * Math.PI / 180, x = Math.cos(a) * 49, z = Math.sin(a) * 49, H = 26;
    const mast = new THREE6.Mesh(new THREE6.CylinderGeometry(0.35, 0.5, H, 6), steel);
    mast.position.set(x, H / 2, z);
    const head = new THREE6.Mesh(new THREE6.BoxGeometry(3.2, 1.8, 0.6), rnGlow(16775388));
    head.position.set(x, H, z);
    head.lookAt(0, 0, 0);
    const len = Math.hypot(x, H, z) * 0.75;
    const cone = new THREE6.Mesh(new THREE6.ConeGeometry(9, len, 20, 1, true).translate(0, -len / 2, 0), beamMat);
    cone.position.set(x, H, z);
    cone.quaternion.setFromUnitVectors(new THREE6.Vector3(0, -1, 0), _rnV.set(-x, -H, -z).normalize());
    g.add(mast, head, cone);
    beams.push(cone);
  }
  // search beams into the sky behind the stands
  const sky = [];
  const skyMat = new THREE6.MeshBasicMaterial({ color: 13426687, transparent: true, opacity: 0.12, blending: THREE6.AdditiveBlending, depthWrite: false, side: THREE6.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const a = (240 + i * 12) * Math.PI / 180, b = new THREE6.Mesh(new THREE6.CylinderGeometry(1.6, 0.5, 46, 10, 1, true).translate(0, 23, 0), skyMat);
    b.position.set(Math.cos(a) * 52, 1, Math.sin(a) * 52);
    b.userData.phase = i * 1.3;
    g.add(b);
    sky.push(b);
  }
  // the rocket on its test stand, back left, with blinking tower lights
  const ra = 228 * Math.PI / 180, rx = Math.cos(ra) * 48, rz = Math.sin(ra) * 48;
  const lattice = rnStd(4342338, { metalness: 0.5, roughness: 0.5 });
  const tower = new THREE6.Group();
  for (const [dx, dz] of [[-2, -2], [2, -2], [2, 2], [-2, 2]]) {
    const p = new THREE6.Mesh(new THREE6.BoxGeometry(0.4, 30, 0.4), lattice);
    p.position.set(dx, 15, dz);
    tower.add(p);
  }
  for (let y = 2; y < 30; y += 3) for (const [a, b] of [[[-2, -2], [2, -2]], [[2, -2], [2, 2]], [[2, 2], [-2, 2]], [[-2, 2], [-2, -2]]]) {
    const m = new THREE6.Mesh(new THREE6.BoxGeometry(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.18, 0.18), lattice);
    m.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
    m.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
    tower.add(m);
  }
  const rocketMat = rnStd(15592941, { metalness: 0.7, roughness: 0.3, envMap: rnEnv });
  const rocket = new THREE6.Mesh(new THREE6.CylinderGeometry(2.2, 2.2, 26, 20), rocketMat);
  rocket.position.set(5, 17, 0);
  const nose = new THREE6.Mesh(new THREE6.ConeGeometry(2.2, 6, 20), rocketMat);
  nose.position.set(5, 33, 0);
  const band = new THREE6.Mesh(new THREE6.CylinderGeometry(2.23, 2.23, 1.2, 20), rnStd(2236962));
  band.position.set(5, 8, 0);
  const plinth = new THREE6.Mesh(new THREE6.BoxGeometry(8, 4, 8), rnStd(3355443, { roughness: 0.9 }));
  plinth.position.set(5, 2, 0);
  const blink = new THREE6.Mesh(new THREE6.SphereGeometry(0.5, 8, 6), new THREE6.MeshBasicMaterial({ color: 16720418 }));
  blink.position.set(0, 30.5, 0);
  tower.add(rocket, nose, band, plinth, blink);
  tower.position.set(rx, 0, rz);
  tower.lookAt(0, 0, 0);
  g.add(tower);
  // the line-up across the jump lane, broadside
  const lineup = [];
  let x = RN_JUMP.line;
  for (const kind of ["cybercab", "cybertruck", "semi", "modely", "model3"]) {
    const v = rnVehicle(kind), wid = v.userData.wid;
    v.position.set(x + wid / 2, 0, RN_JUMP.z);
    v.rotation.y = kind === "semi" ? Math.PI / 2 : -Math.PI / 2;
    g.add(v);
    lineup.push({ kind, x0: x, x1: x + wid, z0: RN_JUMP.z - v.userData.len / 2, z1: RN_JUMP.z + v.userData.len / 2, h: v.userData.hgt });
    x += wid + 0.7;
  }
  g.add(rnBuildRamp());
  g.userData = { pad, lamps, gate, crowd, phones, screen, screenCanvas, screenTex, beams, sky, blink, lineup };
  return rnQuiet(g);
}
// - cold-gas vapour (and tyre smoke, fireworks): one Points cloud per kind, additive, fading to nothing -
var RnParticles = class {
  constructor(n, { size = 1.6, tex = null } = {}) {
    this.n = n;
    this.base = size;
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.c = new Float32Array(n * 3);
    this.c0 = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.age = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.next = 0;
    const g = new THREE6.BufferGeometry();
    g.setAttribute("position", new THREE6.BufferAttribute(this.p, 3));
    g.setAttribute("color", new THREE6.BufferAttribute(this.c, 3));
    this.mat = new THREE6.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE6.AdditiveBlending, sizeAttenuation: true });
    this.points = rnQuiet(new THREE6.Points(g, this.mat));
    this.points.frustumCulled = false;
    this.p.fill(0);
    for (let i = 0; i < n; i++) this.p[i * 3 + 1] = -1e3;
  }
  spawn(x, y, z, vx, vy, vz, life, r = 1, gr = 1, b = 1, drag = 2, grav = 0) {
    const i = this.next, k = i * 3;
    this.next = (i + 1) % this.n;
    this.p[k] = x, this.p[k + 1] = y, this.p[k + 2] = z;
    this.v[k] = vx, this.v[k + 1] = vy, this.v[k + 2] = vz;
    this.c0[k] = r, this.c0[k + 1] = gr, this.c0[k + 2] = b;
    this.life[i] = life;
    this.age[i] = 0;
    this.drag[i] = drag;
    this.grav[i] = grav;
  }
  update(dt, worldScale) {
    const { p, v, c, c0 } = this;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      if (this.age[i] >= this.life[i]) {
        c[k] = c[k + 1] = c[k + 2] = 0;
        continue;
      }
      this.age[i] += dt;
      const f = Math.max(0, 1 - this.drag[i] * dt);
      v[k] *= f, v[k + 1] = v[k + 1] * f - this.grav[i] * dt, v[k + 2] *= f;
      p[k] += v[k] * dt, p[k + 1] += v[k + 1] * dt, p[k + 2] += v[k + 2] * dt;
      const t = this.age[i] / this.life[i], a = t < 0.1 ? t / 0.1 : (1 - t) * (1 - t) / 0.81;
      c[k] = c0[k] * a, c[k + 1] = c0[k + 1] * a, c[k + 2] = c0[k + 2] * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.mat.size = this.base * worldScale;
  }
};
function rnPuffTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE6.CanvasTexture(c);
  t.colorSpace = THREE6.SRGBColorSpace;
  return t;
}
