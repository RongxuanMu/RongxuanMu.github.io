// src/worlds/dreamcage.js
// Dream Cage: a diorama-sized portal cube in the spirit of Moncage. Each of the six faces is a window into its
// own small world; all the worlds share the cube's volume and each fragment shader keeps only what is seen
// through its own face (the eye ray's entry face, found with a slab test in the cube's local space). That is a
// single pass in plain WebGL, per eye, with no stencil buffer and no renderer changes.
// Goal: turn the cube until half a shape on one face meets its other half on the next face, across the
// glowing edge, so the two make one whole shape. Each whole shape joins two worlds; six joins finish the cube.
import * as THREE6 from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
var DC_HALF = 0.12;
// m: half the cube's edge, a 24 cm diorama
var DC_VIEW = 0.45;
// m: viewing distance the paired shapes are sized for (equal angular size there)
var DC_ALIGN = THREE6.MathUtils.degToRad(1.8);
// lined up: seen from the head, the two shapes coincide and the edge runs through both, within this angle.
// The shapes are ~1.9 deg in radius at DC_VIEW, so this is "about one radius off". Generous on purpose: the
// two eyes are ~6.4 cm apart and each sees the join a little differently, so neither eye has to be exact.
var DC_NEAR = THREE6.MathUtils.degToRad(10);
// shapes start to glow inside this angle
var DC_HOLD = 0.3;
// s the alignment has to hold
var DC_HINT_AFTER = 45;
// s without progress before the sight-line hint turns itself on
var DC_TABLE_BELOW_HEAD = 0.5;
var DC_FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };
var DC_NORMAL = { px: [1, 0, 0], nx: [-1, 0, 0], py: [0, 1, 0], ny: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1] };
var DC_PORTAL = { inv: { value: new THREE6.Matrix4() }, half: { value: DC_HALF } };
var DC_CLIP = `
uniform mat4 uCubeInv;
uniform float uHalf;
varying vec3 vCubeP;
void portalClip() {
  if (any(greaterThan(abs(vCubeP), vec3(uHalf * 1.003)))) discard;
  vec3 co = (uCubeInv * vec4(cameraPosition, 1.0)).xyz;
  vec3 rd = vCubeP - co;
  rd += vec3(1e-7) * step(abs(rd), vec3(1e-7));
  vec3 ta = (vec3(-uHalf) - co) / rd, tb = (vec3(uHalf) - co) / rd;
  vec3 tn = min(ta, tb);
  float te = max(max(tn.x, tn.y), tn.z);
  if (te <= 0.0) discard;
  int f = te == tn.x ? (rd.x < 0.0 ? 0 : 1) : te == tn.y ? (rd.y < 0.0 ? 2 : 3) : (rd.z < 0.0 ? 4 : 5);
  if (f != PORTAL_FACE) discard;
}
`;
// make any built-in material draw only through one face of the cube
function dcPortal(mat, face) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCubeInv = DC_PORTAL.inv;
    sh.uniforms.uHalf = DC_PORTAL.half;
    sh.vertexShader = "uniform mat4 uCubeInv;\nvarying vec3 vCubeP;\n" + sh.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>
  {
    vec4 cp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      cp = instanceMatrix * cp;
    #endif
    vCubeP = (uCubeInv * modelMatrix * cp).xyz;
  }`);
    sh.fragmentShader = `#define PORTAL_FACE ${face}\n` + DC_CLIP + sh.fragmentShader.replace("void main() {", "void main() {\n  portalClip();");
  };
  mat.customProgramCacheKey = () => `dc-portal-${face}`;
  return mat;
}
// Six links around the cube's belt (front - right - top - back - left - bottom - front), so every world holds
// two halves. A link sits on the edge between faces a and b: X is a point on that edge, v the outward line of
// sight (between the two face normals, tilted by k along the edge). Its two shapes lie on the line through X
// along -v, at depths dA (world a) and dB (world b). From anywhere on that line outside the cube the eye ray
// grazes the edge, so the edge splits the two shapes and their halves make one whole shape.
var DC_LINKS = [
  { a: "pz", b: "px", e: [0, 1, 0], t: 0.045, k: 0.3, dA: 0.24, dB: 0.07, kind: "sphere",
    title: "The sunset lights the workshop lamp" },
  { a: "px", b: "py", e: [0, 0, 1], t: -0.04, k: 0, dA: 0.08, dB: 0.21, kind: "ring",
    title: "The gear sets the koi swimming" },
  { a: "py", b: "nz", e: [1, 0, 0], t: 0.05, k: 0, dA: 0.21, dB: 0.12, kind: "ring",
    title: "The lily ring starts the town clock" },
  { a: "nz", b: "nx", e: [0, 1, 0], t: 0.04, k: -0.2, dA: 0.25, dB: 0.08, kind: "sphere",
    title: "The moon sets the balloon free" },
  { a: "nx", b: "ny", e: [0, 0, 1], t: -0.03, k: 0, dA: 0.035, dB: 0.2, kind: "ring",
    title: "The buried wheel wakes the crystals" },
  { a: "ny", b: "pz", e: [1, 0, 0], t: -0.05, k: 0, dA: 0.2, dB: 0.035, kind: "sphere",
    title: "The cave pearl lights the lighthouse" }
];
for (const L of DC_LINKS) {
  const n = new THREE6.Vector3(...DC_NORMAL[L.a]).add(new THREE6.Vector3(...DC_NORMAL[L.b]));
  L.e = new THREE6.Vector3(...L.e);
  L.X = n.clone().multiplyScalar(DC_HALF).addScaledVector(L.e, L.t);
  L.v = n.clone().addScaledVector(L.e, L.k).normalize();
  L.ends = [n.clone().multiplyScalar(DC_HALF).addScaledVector(L.e, -DC_HALF), n.clone().multiplyScalar(DC_HALF).addScaledVector(L.e, DC_HALF)];
  L.PA = L.X.clone().addScaledVector(L.v, -L.dA);
  L.PB = L.X.clone().addScaledVector(L.v, -L.dB);
  L.rA = 0.015 * (DC_VIEW + L.dA) / DC_VIEW;
  L.rB = 0.015 * (DC_VIEW + L.dB) / DC_VIEW;
}
function dcTableTop(app2) {
  if (!app2.sessionMode) return 1.44;
  return THREE6.MathUtils.clamp(app2.input.head.y - DC_TABLE_BELOW_HEAD, 0.55, 1.6);
}
var DreamCage = {
  id: "dream-cage",
  title: "Dream Cage",
  init(ctx) {
    const { root, THREE: T } = ctx;
    const app2 = this.app = ctx.app;
    const H = DC_HALF, G = -0.065;
    const TABLE = this.table = dcTableTop(app2);
    root.add(new T.HemisphereLight(16777215, 3355443, 1.5));
    const sun = new T.DirectionalLight(16777215, 1.6);
    sun.position.set(1.2, 3, 2);
    root.add(sun);
    // - desk and the cube shell (the framework's white-line sketch style) -
    const rims = (geo, opacity, px, color = 16777215) => {
      const eg = geo.isBufferGeometry && !geo.userData.segments ? new T.EdgesGeometry(geo, 30) : null;
      const lg = new LineSegmentsGeometry().setPositions(eg ? Array.from(eg.attributes.position.array) : geo.userData.segments);
      const lm = new LineMaterial({ color, linewidth: px, transparent: true, opacity, worldUnits: false });
      const l = new LineSegments2(lg, lm);
      l.userData.noCollider = l.userData.noHighlight = true;
      l.computeLineDistances();
      l.onBeforeRender = (renderer, scene, camera) => {
        const vp = camera.viewport;
        if (vp) lm.resolution.set(vp.z, vp.w);
        else renderer.getSize(lm.resolution);
      };
      eg?.dispose();
      return l;
    };
    // The diorama: the plinth is a handle that carries everything on it. The rig (cube, rims, pips, labels,
    // panel) follows the plinth every frame, with its origin at the centre of the plinth's top.
    const PLATE_H = this.plateH = 0.05;
    const plate = this.plate = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, PLATE_H, 64), new T.MeshBasicMaterial({ color: 0 }));
    plate.name = "diorama plinth";
    plate.position.set(0, TABLE - PLATE_H / 2, -0.5);
    root.add(plate);
    const rig = this.rig = new T.Group();
    rig.position.set(0, TABLE, -0.5);
    root.add(rig);
    rig.updateMatrixWorld(true);
    const plateRims = rims(plate.geometry, 0.9, 4);
    plateRims.position.set(0, -PLATE_H / 2, 0);
    rig.add(plateRims);
    const ring = new T.Mesh(new T.RingGeometry(0.15, 0.156, 64).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.5 }));
    ring.position.set(0, 1e-3, 0);
    rig.add(ring);
    // progress: one pip per link around the plinth ring
    this.pips = DC_LINKS.map((L, i) => {
      const a = -Math.PI / 2 + (i - 2.5) * 0.16;
      const p = new T.Mesh(new T.SphereGeometry(6e-3, 16, 10), new T.MeshBasicMaterial({ color: 5592405 }));
      p.position.set(Math.cos(a) * 0.2, 6e-3, -Math.sin(a) * 0.2);
      rig.add(p);
      return p;
    });
    const cube = this.cube = new T.Group();
    cube.name = "dream cage";
    this.home = new T.Vector3(0, 0.04 + H, 0);
    cube.position.copy(this.home);
    cube.rotation.y = THREE6.MathUtils.degToRad(20);
    rig.add(cube);
    // the shell is the grab / hover target: its material is hidden, so only its hover outline ever draws
    const shellMat = new T.MeshBasicMaterial({ color: 0 });
    shellMat.visible = false;
    const shell = new T.Mesh(new T.BoxGeometry(2 * H, 2 * H, 2 * H), shellMat);
    cube.add(shell);
    cube.add(rims(shell.geometry, 0.95, 3));
    // one glow line per link edge: the active link's edge breathes, a joined edge flashes
    this.seams = DC_LINKS.map((L) => {
      const g = new T.BufferGeometry();
      g.userData.segments = [...L.ends[0].toArray(), ...L.ends[1].toArray()];
      const s = rims(g, 0, 3, 16766586);
      cube.add(s);
      return s;
    });
    const inner = this.inner = new T.Group();
    cube.add(inner);
    // - building blocks -
    const F = DC_FACE;
    const std = (color, face, o = {}) => dcPortal(new T.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o }), face);
    const basic = (color, face, o = {}) => dcPortal(new T.MeshBasicMaterial({ color, ...o }), face);
    const add = (geo, mat, x = 0, y = 0, z = 0, parent = inner) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    // the inside walls of one world: a vertical gradient through [y, colour] stops
    const sky = (face, stops) => {
      const geo = new T.BoxGeometry(2 * H * 0.97, 2 * H * 0.97, 2 * H * 0.97, 1, 24, 1);
      const col = new Float32Array(geo.attributes.position.count * 3);
      geo.setAttribute("color", new T.BufferAttribute(col, 3));
      const m = add(geo, basic(16777215, face, { vertexColors: true, side: T.BackSide }));
      const ca = new T.Color(), cb = new T.Color(), c = new T.Color();
      m.userData.set = (st) => {
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          let j = 0;
          while (j < st.length - 2 && y > st[j + 1][0]) j++;
          const [y0, c0] = st[j], [y1, c1] = st[j + 1];
          c.lerpColors(ca.set(c0), cb.set(c1), THREE6.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1)).toArray(col, i * 3);
        }
        geo.attributes.color.needsUpdate = true;
      };
      m.userData.set(stops);
      return m;
    };
    const block = (face, color, top = G, bottom = -H) => add(new T.BoxGeometry(2 * H * 0.97, top - bottom, 2 * H * 0.97), std(color, face), 0, (top + bottom) / 2, 0);
    const aim = (m, v) => m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), v);
    const cone4 = (r, h) => new T.ConeGeometry(r, h, 4).rotateY(Math.PI / 4);
    const between = (a, b, r, mat) => {
      const m = add(new T.CylinderGeometry(r, r, 1, 5), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(1, a.distanceTo(b), 1);
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    };
    const V = (x, y, z) => new T.Vector3(x, y, z);
    let seed = 20261014;
    const rnd = (a = 0, b = 1) => a + (b - a) * ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    const stars = (face, n, color, ymin) => {
      const p = [];
      for (let i = 0; i < n; i++) {
        const side = Math.floor(rnd(0, 3)), a = rnd(-1, 1) * H * 0.96, b = ymin + rnd() * (H * 0.96 - ymin);
        if (side === 0) p.push(a, b, -H * 0.96);
        else if (side === 1) p.push(a, H * 0.96, rnd(-1, 1) * H);
        else p.push(-H * 0.96 * (rnd() < 0.5 ? 1 : -1), b, a);
      }
      const g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(p, 3));
      const pts = new T.Points(g, dcPortal(new T.PointsMaterial({ color, size: 2.5, sizeAttenuation: false }), face));
      inner.add(pts);
      return pts;
    };
    const glowMat = (color, face, emissive, base) => {
      const m = std(color, face, { emissive, emissiveIntensity: base, roughness: 0.6, flatShading: false });
      m.userData.base = base;
      return m;
    };
    // a link shape: a sphere, or a ring facing the line of sight
    const motif = (L, which, color, emissive, base) => {
      const p = which === "A" ? L.PA : L.PB, r = which === "A" ? L.rA : L.rB;
      const mat = glowMat(color, F[which === "A" ? L.a : L.b], emissive, base);
      const geo = L.kind === "ring" ? new T.TorusGeometry(r * 0.8, r * 0.2, 14, 40) : new T.SphereGeometry(r, 32, 20);
      const m = add(geo, mat, p.x, p.y, p.z);
      if (L.kind === "ring") aim(m, L.v);
      return m;
    };
    const L = DC_LINKS;
    const fx = this.fx = {};
    // - front (+Z): a lighthouse on a rock over the evening sea, and under it the seabed -
    {
      const f = F.pz;
      sky(f, [[-H, 1393498], [G, 3112853], [G + 1e-3, 16033898], [H, 2834286]]);
      const sea = new T.PlaneGeometry(2 * H * 0.97, 2 * H * 0.97, 22, 22).rotateX(-Math.PI / 2);
      fx.sea = add(sea, std(3108742, f, { roughness: 0.4, side: T.DoubleSide, emissive: 1060915 }), 0, G, 0);
      fx.seaY = Float32Array.from(sea.attributes.position.array);
      block(f, 13283706, -H * 0.95);
      // the rock rises from the seabed; the lighthouse stands on it
      add(new T.CylinderGeometry(0.03, 0.042, G + H * 0.95, 7), std(4996928, f), 0, (G - H * 0.95) / 2, -0.07);
      const rock = add(new T.DodecahedronGeometry(0.05, 0), std(5984328, f), 0, G + 6e-3, -0.07);
      rock.scale.set(1.1, 0.75, 1);
      add(new T.DodecahedronGeometry(0.028, 0), std(4996928, f), -0.06, G, -0.08).scale.set(1.2, 0.6, 1);
      const lh = new T.Group();
      lh.position.set(0, G + 0.04, -0.075);
      inner.add(lh);
      for (let i = 0; i < 4; i++) {
        const r0 = 0.016 - i * 2e-3, r1 = r0 - 2e-3;
        add(new T.CylinderGeometry(r1, r0, 0.02, 16), std(i % 2 ? 12729138 : 16052198, f), 0, 0.01 + i * 0.02, 0, lh);
      }
      add(new T.CylinderGeometry(0.012, 0.012, 3e-3, 16), std(2236962, f), 0, 0.082, 0, lh);
      fx.lantern = add(new T.CylinderGeometry(7e-3, 7e-3, 0.012, 12), glowMat(16771496, f, 16764006, 0.05), 0, 0.09, 0, lh);
      add(new T.ConeGeometry(9e-3, 0.012, 12), std(12729138, f), 0, 0.102, 0, lh);
      const beam = new T.Mesh(
        new T.ConeGeometry(0.03, 0.22, 20, 1, true).translate(0, -0.11, 0).rotateZ(Math.PI / 2),
        dcPortal(new T.MeshBasicMaterial({ color: 16773824, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), f)
      );
      beam.position.set(0, 0.09, 0);
      beam.visible = false;
      lh.add(beam);
      fx.beam = beam;
      const boat = fx.boat = new T.Group();
      boat.position.set(-0.04, G + 3e-3, 0.03);
      inner.add(boat);
      add(new T.BoxGeometry(0.03, 8e-3, 0.012), std(7884339, f), 0, 0, 0, boat);
      const sail = new T.BufferGeometry().setFromPoints([V(0, 4e-3, 0), V(0, 0.032, 0), V(0.016, 4e-3, 0)]);
      sail.computeVertexNormals();
      add(sail, std(15921632, f, { side: T.DoubleSide }), -6e-3, 0, 0, boat);
      add(new T.CylinderGeometry(6e-4, 6e-4, 0.03, 4), std(3355443, f), -6e-3, 0.018, 0, boat);
      // under the sea: seaweed, fish and the open clam that holds the pearl (link 6)
      for (let k = 0; k < 9; k++) {
        const h = rnd(0.02, 0.045), w = add(new T.ConeGeometry(3e-3, h, 4), std(3112520, f), rnd(-0.1, 0.1), -H * 0.95 + h / 2, rnd(-0.1, 0.06));
        w.rotation.z = rnd(-0.2, 0.2);
      }
      fx.fish = [];
      for (let k = 0; k < 4; k++) {
        const fish = add(new T.ConeGeometry(4e-3, 0.012, 5).rotateZ(Math.PI / 2), std(k % 2 ? 16762920 : 16744272, f), 0, 0, 0);
        fish.userData = { r: rnd(0.04, 0.08), y: rnd(-0.1, -0.075), p: rnd(0, 6), s: rnd(0.4, 0.7) };
        fx.fish.push(fish);
      }
      const P6 = L[5].PB, half = (top) => add(new T.SphereGeometry(0.014, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(13409704, f, { side: T.DoubleSide }), P6.x, -H * 0.95 + 2e-3, P6.z);
      const lower = half();
      lower.rotation.x = Math.PI;
      lower.scale.y = 0.4;
      const upper = half();
      upper.rotation.x = -1.2;
      upper.position.z -= 0.012;
      upper.scale.y = 0.4;
    }
    // - right (+X): a workshop yard at dusk, dark until the lamp lights -
    {
      const f = F.px;
      fx.rightSky = sky(f, [[-H, 7170662], [H, 3027253]]);
      block(f, 4867650);
      const shed = (x, z, w, d, h) => {
        add(new T.BoxGeometry(w, h, d), std(7039851, f), x, G + h / 2, z);
        for (let k = 0; k < 3; k++) {
          const tooth = add(new T.CylinderGeometry(w / 6, w / 6, d, 3), std(5263440, f), x - w / 3 + k * w / 3, G + h + w / 12, z);
          tooth.rotation.x = Math.PI / 2;
        }
      };
      shed(0.03, 0.04, 0.07, 0.05, 0.035);
      shed(-0.06, -0.02, 0.05, 0.06, 0.03);
      fx.chimneys = [[-0.07, -0.075, 0.12], [0.0, -0.085, 0.095]].map(([x, z, h]) => {
        add(new T.CylinderGeometry(7e-3, 0.01, h, 10), std(9127231, f), x, G + h / 2, z);
        return V(x, G + h, z);
      });
      fx.windows = [];
      for (let k = 0; k < 3; k++) {
        const w = add(new T.PlaneGeometry(9e-3, 0.011), basic(2894892, f), 0.0655, G + 0.017, 0.024 + k * 0.016);
        w.rotation.y = Math.PI / 2;
        fx.windows.push(w);
      }
      fx.smoke = [];
      for (let k = 0; k < 10; k++) {
        const s = add(new T.IcosahedronGeometry(6e-3, 0), std(13421772, f, { transparent: true, opacity: 0.7 }));
        s.visible = false;
        s.userData.t = k / 10;
        s.userData.c = fx.chimneys[k % 2];
        fx.smoke.push(s);
      }
      const dark = std(1118481, f);
      between(L[0].PB, V(L[0].PB.x, H * 0.97, L[0].PB.z), 6e-4, dark);
      // the gear (link 2) turns on a tall mast
      between(V(L[1].PA.x, G, L[1].PA.z), L[1].PA, 2.5e-3, std(3355443, f));
    }
    // - top (+Y): a courtyard pond seen from above -
    {
      const f = F.py, W = -0.035;
      fx.topSky = sky(f, [[-H, 2768417], [H, 3812714]]);
      block(f, 6649429, W - 4e-3);
      add(new T.CylinderGeometry(0.09, 0.09, 4e-3, 48), std(2125686, f, { roughness: 0.3 }), 0, W - 1e-3, 0);
      add(new T.TorusGeometry(0.092, 5e-3, 6, 48).rotateX(Math.PI / 2), std(9078903, f), 0, W, 0);
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * Math.PI * 2 + 0.4, r = rnd(0.03, 0.075);
        add(new T.CylinderGeometry(0.01, 0.01, 1.5e-3, 12), std(4889157, f), Math.cos(a) * r, W + 1e-3, Math.sin(a) * r).scale.set(1, 1, 0.85);
      }
      fx.koi = [];
      for (let k = 0; k < 5; k++) {
        const koi = add(new T.SphereGeometry(4e-3, 10, 6), std(k % 2 ? 16733490 : 16316664, f), 0, W, 0);
        koi.scale.set(2.4, 0.6, 1);
        koi.userData = { r: 0.03 + k * 0.01, p: k * 1.3, s: 0.5 + k * 0.08 };
        fx.koi.push(koi);
      }
      fx.pondLamps = [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]].map(([x, z]) => {
        add(new T.BoxGeometry(0.012, 0.03, 0.012), std(9078903, f), x, W + 0.015, z);
        const lamp = add(new T.BoxGeometry(0.016, 0.01, 0.016), glowMat(14540253, f, 16765056, 0), x, W + 0.035, z);
        add(cone4(0.014, 0.01), std(6710886, f), x, W + 0.045, z);
        return lamp;
      });
      // the finale: a dream orb rises from the pond
      const dream = fx.dream = new T.Group();
      dream.visible = false;
      inner.add(dream);
      fx.dreamOrb = add(new T.IcosahedronGeometry(0.02, 2), glowMat(16777215, f, 16766586, 1.2), 0, 0.02, 0, dream);
      const msg = ctx.label("The six worlds are one", { height: 0.014 });
      dcPortal(msg.material, f);
      msg.rotation.x = -Math.PI / 2;
      msg.position.set(0, W + 2e-3, 0.075);
      dream.add(msg);
    }
    // - back (-Z): a small town under the night sky -
    {
      const f = F.nz;
      sky(f, [[-H, 1911632], [H, 461594]]);
      stars(f, 160, 16777215, 0);
      block(f, 2107450);
      fx.townWindows = [];
      const house = (x, z, w, h, roofCol) => {
        add(new T.BoxGeometry(w, h, w), std(4146536, f), x, G + h / 2, z);
        add(cone4(w * 0.75, w * 0.6), std(roofCol, f), x, G + h + w * 0.3, z);
        for (const sx of [-1, 1]) {
          const lit = rnd() < 0.3;
          const win = add(new T.PlaneGeometry(w * 0.2, w * 0.24), basic(lit ? 16765056 : 1316654, f), x + sx * w * 0.22, G + h * 0.55, z - w / 2 - 3e-4);
          win.rotation.y = Math.PI;
          if (!lit) fx.townWindows.push(win);
        }
      };
      house(-0.07, -0.02, 0.035, 0.03, 9124417);
      house(-0.03, 0.06, 0.03, 0.025, 6052985);
      house(0.075, 0.07, 0.032, 0.035, 9124417);
      house(-0.08, 0.07, 0.028, 0.04, 6052985);
      house(-0.01, -0.08, 0.04, 0.028, 7366285);
      // the clock (link 3) sits on top of the tower, tilted up towards its line of sight
      const P3 = L[2].PB, tw = 0.04, top = P3.y - 0.01;
      add(new T.BoxGeometry(tw, top - G, tw), std(5590631, f), P3.x, (top + G) / 2, P3.z + 0.01);
      fx.hands = [0.8, 0.55].map((len, k) => {
        const piv = new T.Group();
        piv.position.copy(P3);
        aim(piv, L[2].v);
        inner.add(piv);
        add(new T.BoxGeometry(1.6e-3, L[2].rB * len, 1.5e-3).translate(0, L[2].rB * len / 2, 0), basic(15658734, f), 0, 0, 2e-3, piv);
        piv.userData.k = k;
        return piv;
      });
    }
    // - left (-X): a garden on a bright day, and the soil under it -
    {
      const f = F.nx;
      sky(f, [[-H, 4864040], [G, 9069638], [G + 1e-3, 13625584], [H, 8369368]]);
      add(new T.BoxGeometry(2 * H * 0.97, 6e-3, 2 * H * 0.97), std(8368229, f), 0, G - 3e-3, 0);
      const tree = (x, z, h, round) => {
        add(new T.CylinderGeometry(2.5e-3, 3.5e-3, h * 0.45, 6), std(7031354, f), x, G + h * 0.225, z);
        if (round) add(new T.IcosahedronGeometry(h * 0.33, 0), std(5016130, f), x, G + h * 0.65, z);
        else add(new T.ConeGeometry(h * 0.26, h * 0.7, 7), std(3963462, f), x, G + h * 0.72, z);
        // roots reach down into the soil
        const root2 = std(9136970, f);
        for (let k = 0; k < 3; k++) between(V(x, G - 6e-3, z), V(x + rnd(-0.03, 0.03), G - rnd(0.02, 0.045), z + rnd(-0.03, 0.03)), 1.2e-3, root2);
      };
      tree(0.06, -0.07, 0.09, true);
      tree(0.085, 0.04, 0.07, false);
      tree(-0.04, 0.085, 0.08, false);
      tree(0.02, 0.085, 0.06, true);
      for (let k = 0; k < 7; k++) add(new T.BoxGeometry(3e-3, 0.018, 3e-3), std(15526361, f), 0.1, G + 9e-3, -0.09 + k * 0.03);
      add(new T.BoxGeometry(2e-3, 3e-3, 0.19), std(15526361, f), 0.1, G + 0.013, 0);
      for (let k = 0; k < 6; k++) add(new T.DodecahedronGeometry(rnd(5e-3, 0.012), 0), std(6971983, f), rnd(-0.1, 0.1), rnd(-0.11, -0.08), rnd(-0.1, 0.1));
      fx.flowers = [];
      const fc = [16742520, 16771429, 14193663, 16777215];
      for (let k = 0; k < 18; k++) {
        const fl = add(new T.IcosahedronGeometry(3.5e-3, 0), std(fc[k % 4], f), rnd(-0.1, 0.1), G + 3e-3, rnd(-0.1, 0.1));
        fl.scale.setScalar(0.01);
        fx.flowers.push(fl);
      }
      fx.string = add(new T.CylinderGeometry(4e-4, 4e-4, 1, 4), std(16777215, f), L[3].PB.x, 0, L[3].PB.z);
      fx.peg = V(L[3].PB.x + 0.01, G, L[3].PB.z - 0.01);
      add(new T.CylinderGeometry(1.5e-3, 1.5e-3, 8e-3, 5), std(7031354, f), fx.peg.x, G + 4e-3, fx.peg.z);
    }
    // - bottom (-Y): a crystal cave, seen looking up. Its roof is the far side; long stalactites, crystals and
    // drifting spores fill the space down towards the viewer -
    {
      const f = F.ny, C = 0.075;
      sky(f, [[-H, 1182754], [H, 3876470]]);
      block(f, 4865370, H, C);
      for (let k = 0; k < 22; k++) {
        const h = rnd(0.03, 0.12), s = add(new T.ConeGeometry(rnd(5e-3, 0.012), h, 6), std(6052985, f, { emissive: 1315880 }), rnd(-0.105, 0.105), C - h / 2, rnd(-0.105, 0.105));
        s.rotation.x = Math.PI;
      }
      fx.crystals = [];
      for (let k = 0; k < 16; k++) {
        const col = k % 2 ? 6745343 : 12093183, y = k < 8 ? C - 4e-3 : rnd(-0.06, 0.03);
        const c = add(new T.OctahedronGeometry(rnd(6e-3, 0.012), 0), glowMat(col, f, col, 0.35), rnd(-0.1, 0.1), y, rnd(-0.1, 0.1));
        c.scale.y = 2.2;
        if (k >= 8) between(c.position, V(c.position.x, C, c.position.z), 4e-4, std(8947848, f));
        fx.crystals.push(c);
      }
      const sp = [];
      for (let k = 0; k < 120; k++) sp.push(rnd(-0.11, 0.11), rnd(-0.11, C), rnd(-0.11, 0.11));
      const sg = new T.BufferGeometry();
      sg.setAttribute("position", new T.Float32BufferAttribute(sp, 3));
      fx.spores = new T.Points(sg, dcPortal(new T.PointsMaterial({ color: 10092543, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.7 }), f));
      inner.add(fx.spores);
      // both of this world's shapes hang from the cave roof
      const chain = std(8947848, f);
      between(L[4].PB, V(L[4].PB.x, C, L[4].PB.z), 5e-4, chain);
      between(L[5].PA, V(L[5].PA.x, C, L[5].PA.z), 5e-4, chain);
    }
    // the shapes of each link (A, B)
    this.motifs = [
      [motif(L[0], "A", 16764794, 16750144, 0.7), motif(L[0], "B", 16774348, 16764006, 0.02)],
      [motif(L[1], "A", 12157272, 16766586, 0), motif(L[1], "B", 16756444, 16756444, 0.05)],
      [motif(L[2], "A", 7189364, 16766586, 0), motif(L[2], "B", 15654348, 16766586, 0.05)],
      [motif(L[3], "A", 15985872, 15985872, 0.45), motif(L[3], "B", 14832970, 16742520, 0)],
      [motif(L[4], "A", 8214070, 16766586, 0), motif(L[4], "B", 6745343, 6745343, 0.3)],
      [motif(L[5], "A", 13431039, 13431039, 0.5), motif(L[5], "B", 16248549, 16777215, 0.15)]
    ];
    {
      const gear = this.motifs[1][0], r = L[1].rA;
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2;
        add(new T.BoxGeometry(r * 0.28, r * 0.3, r * 0.28), gear.material, Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, 0, gear).rotation.z = a;
      }
      for (let k = 0; k < 3; k++) add(new T.BoxGeometry(r * 1.6, r * 0.12, r * 0.12), gear.material, 0, 0, 0, gear).rotation.z = k * Math.PI / 3;
      const wheel = this.motifs[4][0], rw = L[4].rA;
      for (let k = 0; k < 4; k++) add(new T.BoxGeometry(rw * 1.6, rw * 0.1, rw * 0.1), wheel.material, 0, 0, 0, wheel).rotation.z = k * Math.PI / 4;
    }
    inner.traverse((o) => o.userData.noCollider = o.userData.noHighlight = true);
    // - hint: a dashed sight line out of the active edge, ending in a small "eye" ring -
    {
      const g = new T.BufferGeometry().setFromPoints([V(0, 0, 0), V(0, 0, 0.32)]);
      const line = new T.Line(g, new T.LineDashedMaterial({ color: 16766586, dashSize: 0.01, gapSize: 7e-3, transparent: true, opacity: 0.9 }));
      line.computeLineDistances();
      const eye = new T.Mesh(new T.RingGeometry(0.012, 0.016, 32), new T.MeshBasicMaterial({ color: 16766586, side: T.DoubleSide, transparent: true, opacity: 0.9 }));
      eye.position.z = 0.32;
      const hint = this.hint = new T.Group();
      hint.add(line, eye);
      hint.visible = false;
      hint.traverse((o) => o.userData.noCollider = o.userData.noHighlight = true);
      cube.add(hint);
    }
    // - interaction: one hand turns it with the wrist; two hands turn it about any axis (twist included) and
    // scale it once they move apart or together by more than 12 % -
    this.it = ctx.add(cube, {
      draggable: true,
      twoHand: true,
      twist: true,
      scaleDeadzone: 0.12,
      minScale: 0.3,
      maxScale: 5,
      box: new T.Box3(V(-H, -H, -H), V(H, H, H)),
      constrain: ({ position, scale }) => {
        // never below the plinth top, wherever the diorama has been carried
        position.y = Math.max(position.y, this.rig.position.y + H * scale.y);
      }
    });
    this.it.on("dragstart", () => this.spin = null);
    this.it.on("transformstart", () => this.spin = null);
    // the plinth: carry it anywhere, turn it about the vertical, two hands scale the whole diorama
    this.plateIt = ctx.add(plate, {
      draggable: true,
      // one hand carries the plinth and keeps its front to you; two hands turn and scale it
      faceViewer: true,
      twoHand: true,
      scaleDeadzone: 0.12,
      minScale: 0.5,
      maxScale: 2.5,
      constrain: ({ quaternion }) => {
        const e = new T.Euler().setFromQuaternion(quaternion, "YXZ");
        quaternion.setFromAxisAngle(V(0, 1, 0), e.y);
      }
    });
    // - the panel -
    const panel = ctx.panel("Dream Cage", { w: 0.22, h: 0.15 });
    panel.root.position.set(0.4, 0.08, 0.14);
    rig.add(panel.root);
    panel.root.lookAt(0, TABLE + 0.32, 0.3);
    const hintB = ctx.button("Hint", { toggle: true, onClick: (v) => this.hint.visible = v && this.active < 6 });
    const reset = ctx.button("Reset", { onClick: () => app2.worlds.reload() });
    const left = ctx.button("Turn ⟲", { onClick: () => this.turn(V(0, 1, 0), 1) });
    const right = ctx.button("Turn ⟳", { onClick: () => this.turn(V(0, 1, 0), -1) });
    const over = ctx.button("Tip over", { onClick: () => this.turn(V(1, 0, 0), 1) });
    const back = ctx.button("Tip back", { onClick: () => this.turn(V(1, 0, 0), -1) });
    panel.layout([hintB, reset, left, right, over, back], { cols: 2, top: 0.03 });
    this.hintB = hintB;
    this.statusTex = textTexture("", { w: 512, h: 44, size: 22, color: "#ffffff" });
    const status = new T.Mesh(new T.PlaneGeometry(0.21, 0.21 * 44 / 512), new T.MeshBasicMaterial({ map: this.statusTex, transparent: true, depthWrite: false }));
    status.position.set(0, -0.062, 2e-3);
    panel.root.add(status);
    const goal = [
      "Goal: turn the cube until the two halves meet across the glowing edge",
      "and make one whole shape. Each whole shape joins two worlds.",
      "Grab the plinth to carry, turn or scale the whole diorama."
    ];
    goal.forEach((text, i) => {
      const tl = ctx.label(text, { height: 0.011 });
      tl.position.set(0, 0.02 - i * 6e-3, 0.26 + i * 0.016);
      tl.rotation.x = -Math.PI / 2.6;
      rig.add(tl);
    });
    // desktop preview: the arrow keys turn the cube
    this.keys = {};
    this._kd = (e) => {
      if (e.key.startsWith("Arrow")) {
        this.keys[e.key] = true;
        e.preventDefault();
      }
    };
    this._ku = (e) => delete this.keys[e.key];
    addEventListener("keydown", this._kd);
    addEventListener("keyup", this._ku);
    this.active = 0;
    this.hold = 0;
    this.solvedAt = [];
    this.spin = null;
    this.time = 0;
    this.since = null;
    this._setStatus();
  },
  // a quarter turn about a world axis (y: turn, x: tip towards / away from the viewer)
  turn(axis, dir) {
    const q = new THREE6.Quaternion().setFromAxisAngle(axis, dir * Math.PI / 2);
    const from = this.spin ? this.spin.to.clone() : this.cube.quaternion.clone();
    this.spin = { q0: this.cube.quaternion.clone(), to: q.multiply(from), t: 0 };
  },
  _setStatus() {
    const n = this.active;
    this.statusTex.userData.draw(n >= 6 ? "All six worlds joined · look in from the top" : `Worlds joined ${n} / 6 · find the glowing edge`);
  },
  _chime(final) {
    const c = this.app.sfx.ensure();
    if (!c || c.state !== "running") return;
    const notes = final ? [523, 659, 784, 1047, 1319] : [784, 988, 1319];
    notes.forEach((f, i) => {
      const t = c.currentTime + i * 0.09, o = c.createOscillator(), g = c.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      g.gain.exponentialRampToValueAtTime(1e-4, t + 0.9);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 1);
    });
  },
  _solve(k) {
    this.solvedAt[k] = this.time;
    this.active = k + 1;
    this.hold = 0;
    this.since = this.time;
    this._chime(k === 5);
    this.app.log(`joined: ${DC_LINKS[k].title}`);
    const fx = this.fx;
    this.pips[k].material.color.setHex(16766586);
    if (k === 0) {
      fx.rightSky.userData.set([[-DC_HALF, 15315578], [DC_HALF, 5917278]]);
      for (const w of fx.windows) w.material.color.setHex(16767104);
      for (const s of fx.smoke) s.visible = true;
    }
    if (k === 2) {
      for (const w of fx.townWindows) w.material.color.setHex(16765056);
      for (const l of fx.pondLamps) l.material.emissiveIntensity = 1.2;
    }
    if (k === 4) for (const c of fx.crystals) c.material.emissiveIntensity = 1;
    if (k === 5) {
      fx.beam.visible = true;
      fx.lantern.material.emissiveIntensity = 2;
      fx.dream.visible = true;
    }
    this.hint.visible = this.hintB.value && this.active < 6;
    this._setStatus();
  },
  // how far from lined up, seen from h (cube space): the larger of the angle between the two shapes and each
  // shape's angular distance from the plane through the eye and the edge (the edge has to split them)
  _misalign(L, h) {
    const a = L.PA.clone().sub(h), b = L.PB.clone().sub(h);
    const n = L.X.clone().sub(h).cross(L.e).normalize();
    const off = (d) => Math.asin(Math.min(1, Math.abs(n.dot(d)) / d.length()));
    return Math.max(a.angleTo(b), off(a), off(b));
  },
  update(dt, t) {
    this.time = t;
    if (this.since === null) this.since = t;
    const cube = this.cube, fx = this.fx, T = THREE6;
    const plate = this.plate, rig = this.rig;
    rig.quaternion.copy(plate.quaternion);
    rig.scale.copy(plate.scale);
    rig.position.set(0, this.plateH / 2 * plate.scale.y, 0).applyQuaternion(plate.quaternion).add(plate.position);
    rig.updateMatrixWorld(true);
    // turning by panel buttons / arrow keys
    if (this.spin && !this.it.selections.length) {
      const s = this.spin;
      s.t = Math.min(1, s.t + dt / 0.45);
      cube.quaternion.slerpQuaternions(s.q0, s.to, s.t * s.t * (3 - 2 * s.t));
      if (s.t >= 1) this.spin = null;
    }
    const k = this.keys, yaw = (k.ArrowLeft ? 1 : 0) - (k.ArrowRight ? 1 : 0), pitch = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    if (yaw || pitch) {
      this.spin = null;
      const head = this.app.input.head, right = new T.Vector3().subVectors(cube.getWorldPosition(new T.Vector3()), head).cross(new T.Vector3(0, 1, 0)).normalize();
      cube.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw * dt * 1.4));
      right.transformDirection(rig.matrixWorld.clone().invert());
      cube.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(right, -pitch * dt * 1));
    }
    cube.updateMatrixWorld(true);
    DC_PORTAL.inv.value.copy(cube.matrixWorld).invert();
    // alignment, measured from the head (between the eyes) in the cube's own space
    const h = this.app.input.head.clone().applyMatrix4(DC_PORTAL.inv.value);
    let glow = 0;
    if (this.active < 6) {
      const L = DC_LINKS[this.active];
      const outside = h.clone().sub(L.X).dot(L.v) > 0.05;
      const ang = outside ? this._misalign(L, h) : Math.PI;
      glow = 1 - T.MathUtils.smoothstep(ang, DC_ALIGN, DC_NEAR);
      if (ang < DC_ALIGN) {
        this.hold += dt;
        if (this.hold >= DC_HOLD) this._solve(this.active);
      } else this.hold = Math.max(0, this.hold - dt);
      if (t - this.since > DC_HINT_AFTER && !this.hintB.value) {
        this.hintB.setValue(true);
        this.hint.visible = true;
      }
    }
    this.motifs.forEach((pair, i) => {
      const since = this.solvedAt[i] !== void 0 ? t - this.solvedAt[i] : -1;
      const g = i === this.active ? glow : 0;
      const flash = since >= 0 ? Math.max(0, 1 - since / 1.5) : 0;
      for (const m of pair) m.material.emissiveIntensity = Math.max(m.material.userData.base, since >= 0 ? 0.6 : 0) + g * 0.9 + flash * 1.5;
      const seam = this.seams[i].material;
      const breathe = i === this.active ? 0.3 + 0.2 * Math.sin(t * 3) : 0;
      seam.opacity = Math.min(1, Math.max(breathe * (1 - g), flash, this.active >= 6 ? 0.35 + 0.25 * Math.sin(t * 2 + i) : 0));
    });
    if (this.hint.visible && this.active < 6) {
      const L = DC_LINKS[this.active];
      this.hint.position.copy(L.X);
      this.hint.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), L.v);
    }
    // - ambient life in the worlds -
    const p = fx.sea.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = fx.seaY[i * 3], z = fx.seaY[i * 3 + 2];
      p.setY(i, Math.sin(x * 70 + t * 1.3) * 1.6e-3 + Math.cos(z * 55 + t * 0.9 + x * 20) * 1.2e-3);
    }
    p.needsUpdate = true;
    fx.sea.geometry.computeVertexNormals();
    for (const fish of fx.fish) {
      const u = fish.userData, a = u.p + t * u.s;
      fish.position.set(Math.cos(a) * u.r, u.y + Math.sin(a * 2) * 3e-3, -0.02 + Math.sin(a) * u.r * 0.6);
      fish.rotation.y = -a - Math.PI / 2;
    }
    const solved = (i) => this.solvedAt[i] !== void 0;
    const age = (i) => solved(i) ? t - this.solvedAt[i] : 0;
    if (solved(0)) for (const s of fx.smoke) {
      const u = (s.userData.t + t * 0.12) % 1;
      s.position.copy(s.userData.c).add(new T.Vector3(Math.sin(u * 6 + s.userData.t * 9) * 4e-3 + u * 0.012, u * 0.07, 0));
      s.position.y = Math.min(s.position.y, DC_HALF - 0.01);
      s.scale.setScalar(0.6 + u * 1.4);
      s.material.opacity = 0.7 * (1 - u);
    }
    // koi drift until the gear turns, then they swim their circles
    const swim = solved(1) ? 1 : 0.08;
    fx.koiT = (fx.koiT || 0) + dt * swim;
    for (const koi of fx.koi) {
      const u = koi.userData, a = u.p + fx.koiT * u.s;
      koi.position.set(Math.cos(a) * u.r, koi.position.y, Math.sin(a) * u.r);
      koi.rotation.y = -a;
    }
    if (solved(1)) this.motifs[1][0].rotateZ(dt * 1.2);
    if (solved(2)) for (const hnd of fx.hands) hnd.rotateZ(-dt * (hnd.userData.k ? 0.15 : 1.8));
    const L4 = DC_LINKS[3], bal = this.motifs[3][1];
    if (solved(3)) {
      const u = Math.min(1, age(3) / 5), e = u * u * (3 - 2 * u);
      bal.position.set(L4.PB.x + 0.05 * e + Math.sin(t * 0.8) * 3e-3 * e, L4.PB.y + (DC_HALF - 0.03 - L4.PB.y) * e, L4.PB.z + 0.04 * e);
    }
    const top = bal.position.clone().setY(bal.position.y - L4.rB), peg = fx.peg;
    fx.string.visible = !solved(3) || age(3) < 0.6;
    fx.string.position.copy(top).add(peg).multiplyScalar(0.5);
    fx.string.scale.set(1, top.distanceTo(peg), 1);
    fx.string.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), top.clone().sub(peg).normalize());
    if (solved(4)) {
      fx.flowers.forEach((fl, i) => fl.scale.setScalar(T.MathUtils.clamp((age(4) - i * 0.08) * 2, 0.01, 1)));
      this.motifs[4][0].rotateZ(-dt * 0.8);
      fx.crystals.forEach((c, i) => c.material.emissiveIntensity = 0.8 + 0.4 * Math.sin(t * 2 + i));
    }
    fx.spores.rotation.y = t * 0.03;
    if (solved(5)) {
      fx.beam.rotation.y = t * 0.9;
      const a = age(5) * 0.25;
      fx.boat.position.set(-0.01 + Math.cos(a) * 0.045, -0.062, 0.02 + Math.sin(a) * 0.05);
      fx.boat.rotation.y = -a;
      fx.dreamOrb.position.y = 0.02 + 0.006 * Math.sin(t * 1.5);
      fx.dreamOrb.rotation.y = t * 0.4;
    }
  },
  exit() {
    removeEventListener("keydown", this._kd);
    removeEventListener("keyup", this._ku);
  }
};
