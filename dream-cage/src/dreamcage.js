// src/worlds/dreamcage.js
// Dream Cage: a diorama-sized portal cube in the spirit of Moncage. Every face of the cube is a window into
// its own small world; all the worlds share the cube's volume and each fragment shader keeps only what is seen
// through its own face (the eye ray's entry face, found with a slab test in the cube's local space). That is a
// single pass in plain WebGL, per eye, with no stencil buffer and no renderer changes.
// Turn the cube (grab it, two hands, or the arrow keys on desktop) until a shape in one world lines up with
// its partner in the neighbouring world across the shared edge: the two halves join and the worlds connect.
import * as THREE6 from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
var DC_HALF = 0.12;
// m: half the cube's edge, a 24 cm diorama
var DC_VIEW = 0.45;
// m: viewing distance the paired shapes are sized for (equal angular size there)
var DC_ALIGN = THREE6.MathUtils.degToRad(0.6);
// lined up: seen from the head, the two shapes coincide and the edge runs through both, within this angle
// (the shapes are ~1.9 deg in radius at DC_VIEW)
var DC_NEAR = THREE6.MathUtils.degToRad(8);
// shapes start to glow inside this angle
var DC_HOLD = 0.45;
// s the alignment has to hold
var DC_TABLE_BELOW_HEAD = 0.5;
var DC_FACE = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };
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
// The four links, one per vertical edge. Each pairs a shape in world A with one in world B, both on the line
// that leaves the edge point X along the outward view direction v. Seen from anywhere on that line outside
// the cube, the eye ray grazes the edge, so the edge splits the two shapes and their halves join into one.
var DC_LINKS = [
  { a: "pz", b: "px", sx: 1, sz: 1, y0: 0.045, ev: 0.3, dA: 0.24, dB: 0.07, kind: "sphere",
    title: "The sunset lights the workshop lamp" },
  { a: "px", b: "nz", sx: 1, sz: -1, y0: 0, ev: 0.12, dA: 0.09, dB: 0.2, kind: "ring",
    title: "The gear turns the town clock" },
  { a: "nz", b: "nx", sx: -1, sz: -1, y0: 0.04, ev: -0.2, dA: 0.25, dB: 0.08, kind: "sphere",
    title: "The moon sets the balloon free" },
  { a: "nx", b: "pz", sx: -1, sz: 1, y0: 0.02, ev: 0.45, dA: 0.15, dB: 0.06, kind: "ring",
    title: "The cart wheel wakes the lighthouse" }
];
for (const L of DC_LINKS) {
  L.X = new THREE6.Vector3(L.sx * DC_HALF, L.y0, L.sz * DC_HALF);
  L.v = new THREE6.Vector3(L.sx, L.ev, L.sz).normalize();
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
    const PLATE_H = 0.05;
    const plate = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, PLATE_H, 64), new T.MeshBasicMaterial({ color: 0 }));
    plate.position.set(0, TABLE - PLATE_H / 2, -0.5);
    root.add(plate);
    const plateRims = rims(plate.geometry, 0.9, 4);
    plateRims.position.copy(plate.position);
    root.add(plateRims);
    const ring = new T.Mesh(new T.RingGeometry(0.15, 0.156, 64).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.5 }));
    ring.position.set(0, TABLE + 1e-3, -0.5);
    root.add(ring);
    const cube = this.cube = new T.Group();
    cube.name = "dream cage";
    this.home = new T.Vector3(0, TABLE + 0.04 + H, -0.5);
    cube.position.copy(this.home);
    cube.rotation.y = THREE6.MathUtils.degToRad(20);
    root.add(cube);
    // the shell is the grab / hover target: its material is hidden, so only its hover outline ever draws
    const shellMat = new T.MeshBasicMaterial({ color: 0 });
    shellMat.visible = false;
    const shell = new T.Mesh(new T.BoxGeometry(2 * H, 2 * H, 2 * H), shellMat);
    cube.add(shell);
    cube.add(rims(shell.geometry, 0.95, 3));
    // one glow line per vertical edge: the active link's edge breathes, a joined edge flashes
    this.seams = DC_LINKS.map((L) => {
      const g = new T.BufferGeometry();
      g.userData.segments = [L.X.x, -H, L.X.z, L.X.x, H, L.X.z];
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
    const sky = (face, bottom, top) => {
      // a little inside the shell, so the shell's back edges stay hidden behind the walls without z-fighting
      const geo = new T.BoxGeometry(2 * H * 0.97, 2 * H * 0.97, 2 * H * 0.97, 1, 10, 1);
      const col = new Float32Array(geo.attributes.position.count * 3);
      geo.setAttribute("color", new T.BufferAttribute(col, 3));
      const m = add(geo, basic(16777215, face, { vertexColors: true, side: T.BackSide }));
      const cb = new T.Color(), ct = new T.Color(), c = new T.Color();
      m.userData.set = (b, t) => {
        cb.set(b);
        ct.set(t);
        const p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
          c.lerpColors(cb, ct, THREE6.MathUtils.smoothstep(p.getY(i), -H, H)).toArray(col, i * 3);
        }
        geo.attributes.color.needsUpdate = true;
      };
      m.userData.set(bottom, top);
      return m;
    };
    const block = (face, color, top = G) => add(new T.BoxGeometry(2 * H * 0.985, top + H * 0.985, 2 * H * 0.985), std(color, face), 0, (top - H * 0.985) / 2, 0);
    const aim = (m, v) => m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), v);
    const cone4 = (r, h) => new T.ConeGeometry(r, h, 4).rotateY(Math.PI / 4);
    const stars = (face, n, color, ymin) => {
      const p = [];
      for (let i = 0; i < n; i++) {
        const u = Math.random(), w = Math.random(), side = Math.floor(Math.random() * 3);
        const a = (u * 2 - 1) * H * 0.99, b = ymin + w * (H - ymin);
        if (side === 0) p.push(a, b, -H * 0.99);
        else if (side === 1) p.push(a, H * 0.99, (w * 2 - 1) * H);
        else p.push(-H * 0.99 * (Math.random() < 0.5 ? 1 : -1), b, a);
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
    // a link shape: a sphere, or a ring facing the viewer's line of sight
    const motif = (L, which, color, emissive, base, face) => {
      const p = which === "A" ? L.PA : L.PB, r = which === "A" ? L.rA : L.rB;
      const mat = glowMat(color, face, emissive, base);
      const geo = L.kind === "ring" ? new T.TorusGeometry(r * 0.8, r * 0.2, 14, 40) : new T.SphereGeometry(r, 32, 20);
      const m = add(geo, mat, p.x, p.y, p.z);
      if (L.kind === "ring") aim(m, L.v);
      return m;
    };
    const fx = this.fx = {};
    // - front (+Z): a lighthouse on a cliff over the evening sea -
    {
      const f = F.pz;
      fx.frontSky = sky(f, 16033898, 2834286);
      block(f, 1784143, G - 4e-3);
      const sea = new T.PlaneGeometry(2 * H * 0.994, 2 * H * 0.994, 22, 22).rotateX(-Math.PI / 2);
      fx.sea = add(sea, std(3108742, f, { roughness: 0.4 }), 0, G, 0);
      fx.seaY = Float32Array.from(sea.attributes.position.array);
      const rock = add(new T.DodecahedronGeometry(0.05, 0), std(5984328, f), 0, G + 6e-3, -0.07);
      rock.scale.set(1.1, 0.75, 1);
      add(new T.DodecahedronGeometry(0.028, 0), std(4996928, f), -0.015, G, -0.08).scale.set(1.2, 0.6, 1);
      const base = G + 0.04;
      const lh = new T.Group();
      lh.position.set(0, base, -0.075);
      inner.add(lh);
      for (let i = 0; i < 4; i++) {
        const r0 = 0.016 - i * 2e-3, r1 = r0 - 2e-3;
        add(new T.CylinderGeometry(r1, r0, 0.02, 16), std(i % 2 ? 12729138 : 16052198, f), 0, 0.01 + i * 0.02, 0, lh);
      }
      add(new T.CylinderGeometry(0.012, 0.012, 3e-3, 16), std(2236962, f), 0, 0.082, 0, lh);
      fx.lantern = add(new T.CylinderGeometry(7e-3, 7e-3, 0.012, 12), glowMat(16771496, f, 16764006, 0.05), 0, 0.09, 0, lh);
      add(new T.ConeGeometry(9e-3, 0.012, 12), std(12729138, f), 0, 0.102, 0, lh);
      // the beam: hidden until the last link
      const beam = new T.Mesh(
        new T.ConeGeometry(0.03, 0.22, 20, 1, true).translate(0, -0.11, 0).rotateZ(Math.PI / 2),
        dcPortal(new T.MeshBasicMaterial({ color: 16773824, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), f)
      );
      beam.position.set(0, 0.09, 0);
      beam.visible = false;
      lh.add(beam);
      fx.beam = beam;
      // a little sailing boat, moored until the lighthouse wakes
      const boat = fx.boat = new T.Group();
      boat.position.set(-0.01, G + 3e-3, 0.03);
      inner.add(boat);
      add(new T.BoxGeometry(0.03, 8e-3, 0.012), std(7884339, f), 0, 0, 0, boat);
      const sail = new T.BufferGeometry().setFromPoints([new T.Vector3(0, 4e-3, 0), new T.Vector3(0, 0.032, 0), new T.Vector3(0.016, 4e-3, 0)]);
      sail.computeVertexNormals();
      add(sail, std(15921632, f, { side: T.DoubleSide }), -6e-3, 0, 0, boat);
      add(new T.CylinderGeometry(6e-4, 6e-4, 0.03, 4), std(3355443, f), -6e-3, 0.018, 0, boat);
    }
    // - right (+X): a workshop yard at dusk, dark until the lamp lights -
    {
      const f = F.px;
      fx.rightSky = sky(f, 7170662, 3027253);
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
        return new T.Vector3(x, G + h, z);
      });
      fx.windows = [];
      // the shed windows face the viewer of this world (+X)
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
      // the lamp hangs on a cable from the cube's ceiling
      const L1 = DC_LINKS[0];
      add(new T.CylinderGeometry(6e-4, 6e-4, H - L1.PB.y, 4), std(1118481, f), L1.PB.x, (H + L1.PB.y) / 2, L1.PB.z);
      // the gear stands on a post; it gets teeth so its turning shows
      const L2 = DC_LINKS[1];
      add(new T.CylinderGeometry(2e-3, 3e-3, L2.PA.y - G, 6), std(3355443, f), L2.PA.x, (L2.PA.y + G) / 2, L2.PA.z);
    }
    // - back (-Z): a small town under the night sky -
    {
      const f = F.nz;
      sky(f, 1911632, 461594);
      stars(f, 160, 16777215, 0);
      block(f, 2107450);
      fx.townWindows = [];
      const house = (x, z, w, h, roofCol) => {
        add(new T.BoxGeometry(w, h, w), std(4146536, f), x, G + h / 2, z);
        add(cone4(w * 0.75, w * 0.6), std(roofCol, f), x, G + h + w * 0.3, z);
        for (const sx of [-1, 1]) {
          const lit = Math.random() < 0.3;
          // windows on the -Z walls, the side this world is seen from
          const win = add(new T.PlaneGeometry(w * 0.2, w * 0.24), basic(lit ? 16765056 : 1316654, f), x + sx * w * 0.22, G + h * 0.55, z - w / 2 - 3e-4);
          win.rotation.y = Math.PI;
          if (!lit) fx.townWindows.push(win);
        }
      };
      house(-0.07, -0.02, 0.035, 0.03, 9124417);
      house(-0.03, 0.06, 0.03, 0.025, 6052985);
      house(0.075, 0.05, 0.032, 0.035, 9124417);
      house(-0.08, 0.07, 0.028, 0.04, 6052985);
      house(0.02, -0.08, 0.04, 0.028, 7366285);
      // the clock tower stands behind the clock face, turned towards the clock's line of sight
      const L2 = DC_LINKS[1], hv = new T.Vector3(L2.v.x, 0, L2.v.z).normalize();
      const tw = 0.05, top = L2.PB.y + 0.035;
      const tower = add(new T.BoxGeometry(tw, top - G, tw), std(5590631, f), L2.PB.x - hv.x * 0.03, (top + G) / 2, L2.PB.z - hv.z * 0.03);
      tower.rotation.y = Math.atan2(hv.x, hv.z);
      const roof = add(cone4(tw * 0.78, 0.04), std(9124417, f), tower.position.x, top + 0.02, tower.position.z);
      roof.rotation.y = tower.rotation.y;
      fx.hands = [0.8, 0.55].map((len, k) => {
        const piv = new T.Group();
        piv.position.copy(L2.PB);
        aim(piv, L2.v);
        inner.add(piv);
        add(new T.BoxGeometry(1.6e-3, L2.rB * len, 1.5e-3).translate(0, L2.rB * len / 2, 0), basic(15658734, f), 0, 0, 2e-3, piv);
        piv.userData.k = k;
        return piv;
      });
    }
    // - left (-X): a garden on a bright day -
    {
      const f = F.nx;
      sky(f, 13625584, 8369368);
      block(f, 8368229);
      const tree = (x, z, h, round) => {
        add(new T.CylinderGeometry(2.5e-3, 3.5e-3, h * 0.45, 6), std(7031354, f), x, G + h * 0.225, z);
        if (round) add(new T.IcosahedronGeometry(h * 0.33, 0), std(5016130, f), x, G + h * 0.65, z);
        else add(new T.ConeGeometry(h * 0.26, h * 0.7, 7), std(3963462, f), x, G + h * 0.72, z);
      };
      tree(0.06, -0.07, 0.09, true);
      tree(0.085, 0.04, 0.07, false);
      tree(-0.04, 0.085, 0.08, false);
      tree(0.02, 0.085, 0.06, true);
      for (let k = 0; k < 7; k++) add(new T.BoxGeometry(3e-3, 0.018, 3e-3), std(15526361, f), 0.1, G + 9e-3, -0.09 + k * 0.03);
      add(new T.BoxGeometry(2e-3, 3e-3, 0.19), std(15526361, f), 0.1, G + 0.013, 0);
      fx.flowers = [];
      const fc = [16742520, 16771429, 14193663, 16777215];
      for (let k = 0; k < 18; k++) {
        const fl = add(new T.IcosahedronGeometry(3.5e-3, 0), std(fc[k % 4], f), (Math.random() - 0.5) * 0.2, G + 3e-3, (Math.random() - 0.5) * 0.2);
        fl.scale.setScalar(0.01);
        fx.flowers.push(fl);
      }
      // the balloon's string runs down to a peg in the lawn
      const L3 = DC_LINKS[2];
      fx.string = add(new T.CylinderGeometry(4e-4, 4e-4, 1, 4), std(16777215, f), L3.PB.x, 0, L3.PB.z);
      fx.peg = new T.Vector3(L3.PB.x + 0.01, G, L3.PB.z - 0.01);
      add(new T.CylinderGeometry(1.5e-3, 1.5e-3, 8e-3, 5), std(7031354, f), fx.peg.x, G + 4e-3, fx.peg.z);
      // the cart the wheel belongs to
      const L4 = DC_LINKS[3], hv = new T.Vector3(L4.v.x, 0, L4.v.z).normalize();
      const cart = add(new T.BoxGeometry(0.05, 0.02, 0.03), std(10379576, f), L4.PA.x - hv.x * 0.025, L4.PA.y + 4e-3, L4.PA.z - hv.z * 0.025);
      cart.rotation.y = Math.atan2(hv.x, hv.z) + Math.PI / 2;
    }
    // - top (+Y): the lid; it shows progress and opens at the end -
    {
      const f = F.py;
      fx.topSky = sky(f, 0, 0);
      const lid = fx.lid = new T.Group();
      inner.add(lid);
      add(new T.CylinderGeometry(H * 0.95, H * 0.95, 0.01, 4).rotateY(Math.PI / 4), std(1118481, f), 0, 0.06, 0, lid).scale.set(1.41, 1, 1.41);
      add(new T.TorusGeometry(0.06, 1.5e-3, 6, 64).rotateX(Math.PI / 2), basic(16777215, f), 0, 0.066, 0, lid);
      fx.pips = DC_LINKS.map((L) => add(new T.SphereGeometry(7e-3, 16, 10), glowMat(3355443, f, 16766586, 0), L.sx * 0.042, 0.068, L.sz * 0.042, lid));
      const dream = fx.dream = new T.Group();
      dream.visible = false;
      inner.add(dream);
      dream.add(stars(f, 260, 16777215, -H));
      fx.dreamOrb = add(new T.IcosahedronGeometry(0.025, 2), glowMat(16777215, f, 16766586, 1.2), 0, -0.02, 0, dream);
      const msg = ctx.label("The four worlds are one", { height: 0.016 });
      dcPortal(msg.material, f);
      msg.rotation.x = -Math.PI / 2;
      msg.position.set(0, -0.06, 0.07);
      dream.add(msg);
    }
    // - bottom (-Y): a plain base -
    {
      const f = F.ny;
      sky(f, 0, 0);
      add(new T.TorusGeometry(0.07, 1.5e-3, 6, 64).rotateX(Math.PI / 2), basic(8947848, f), 0, -0.06, 0);
    }
    // the shapes of each link
    const L = DC_LINKS;
    this.motifs = [
      [motif(L[0], "A", 16764794, 16750144, 0.7, F.pz), motif(L[0], "B", 16774348, 16764006, 0.02, F.px)],
      [motif(L[1], "A", 12157272, 16766586, 0, F.px), motif(L[1], "B", 15654348, 16766586, 0.05, F.nz)],
      [motif(L[2], "A", 15985872, 15985872, 0.45, F.nz), motif(L[2], "B", 14832970, 16742520, 0, F.nx)],
      [motif(L[3], "A", 8214070, 16766586, 0, F.nx), motif(L[3], "B", 14699066, 16766586, 0, F.pz)]
    ];
    // gear teeth and spokes ride with the gear
    {
      const gear = this.motifs[1][0], r = L[1].rA;
      for (let k = 0; k < 10; k++) {
        const a = k / 10 * Math.PI * 2;
        add(new T.BoxGeometry(r * 0.28, r * 0.3, r * 0.28), gear.material, Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, 0, gear).rotation.z = a;
      }
      for (let k = 0; k < 3; k++) add(new T.BoxGeometry(r * 1.6, r * 0.12, r * 0.12), gear.material, 0, 0, 0, gear).rotation.z = k * Math.PI / 3;
      const wheel = this.motifs[3][0], rw = L[3].rA;
      for (let k = 0; k < 4; k++) add(new T.BoxGeometry(rw * 1.6, rw * 0.1, rw * 0.1), wheel.material, 0, 0, 0, wheel).rotation.z = k * Math.PI / 4;
      // the life ring hangs on a pier post
      const ringB = this.motifs[3][1];
      add(new T.CylinderGeometry(2.5e-3, 2.5e-3, ringB.position.y - G, 6), std(7031354, F.pz), ringB.position.x, (ringB.position.y + G) / 2, ringB.position.z - 6e-3);
    }
    inner.traverse((o) => o.userData.noCollider = o.userData.noHighlight = true);
    // - hint: a dashed sight line out of the active edge, ending in a small "eye" ring -
    {
      const g = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, 0, 0.32)]);
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
    // - interaction -
    this.it = ctx.add(cube, {
      draggable: true,
      twoHand: true,
      box: new T.Box3(new T.Vector3(-H, -H, -H), new T.Vector3(H, H, H)),
      constrain: ({ position, scale }) => {
        scale.setScalar(THREE6.MathUtils.clamp(scale.x, 0.6, 2.2));
        position.y = Math.max(position.y, TABLE + H * scale.y);
      }
    });
    this.it.on("dragstart", () => this.spin = null);
    // - the panel -
    const panel = ctx.panel("Dream Cage", { w: 0.2, h: 0.128 });
    panel.root.position.set(-0.38, TABLE + 0.07, -0.36);
    panel.root.lookAt(0, TABLE + 0.32, 0.3);
    root.add(panel.root);
    const hintB = ctx.button("Hint", { toggle: true, onClick: (v) => this.hint.visible = v && this.active < 4 });
    const reset = ctx.button("Reset", { onClick: () => app2.worlds.reload() });
    const left = ctx.button("Turn ⟲", { onClick: () => this.turn(1) });
    const right = ctx.button("Turn ⟳", { onClick: () => this.turn(-1) });
    panel.layout([hintB, reset, left, right], { cols: 2, top: 0.03 });
    this.hintB = hintB;
    this.statusTex = textTexture("", { w: 512, h: 44, size: 22, color: "#ffffff" });
    const status = new T.Mesh(new T.PlaneGeometry(0.19, 0.19 * 44 / 512), new T.MeshBasicMaterial({ map: this.statusTex, transparent: true, depthWrite: false }));
    status.position.set(0, -0.049, 2e-3);
    panel.root.add(status);
    const tl = ctx.label("Grab and turn the cube · line up a shape with its partner across an edge to join two worlds", { height: 0.01 });
    tl.position.set(0, TABLE + 0.02, -0.23);
    tl.rotation.x = -Math.PI / 2.6;
    root.add(tl);
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
    this._setStatus();
  },
  turn(dir) {
    const q = new THREE6.Quaternion().setFromAxisAngle(new THREE6.Vector3(0, 1, 0), dir * Math.PI / 2);
    const from = this.spin ? this.spin.to.clone() : this.cube.quaternion.clone();
    this.spin = { q0: this.cube.quaternion.clone(), to: q.multiply(from), t: 0 };
  },
  _setStatus() {
    const n = this.active;
    this.statusTex.userData.draw(n >= 4 ? "All four worlds joined · look in from the top" : `Worlds joined ${n} / 4`);
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
    this._chime(k === 3);
    this.app.log(`joined: ${DC_LINKS[k].title}`);
    const fx = this.fx;
    fx.pips[k].material.color.setHex(16766586);
    fx.pips[k].material.emissiveIntensity = 1;
    if (k === 0) {
      fx.rightSky.userData.set(15315578, 5917278);
      for (const w of fx.windows) w.material.color.setHex(16767104);
      for (const s of fx.smoke) s.visible = true;
    }
    if (k === 1) for (const w of fx.townWindows) w.material.color.setHex(16765056);
    if (k === 3) {
      fx.beam.visible = true;
      fx.lantern.material.emissiveIntensity = 2;
      fx.lid.visible = false;
      fx.dream.visible = true;
      fx.topSky.userData.set(1709370, 2758218);
    }
    this.hint.visible = this.hintB.value && this.active < 4;
    this._setStatus();
  },
  // how far from lined up, seen from h (cube space): the larger of the angle between the two shapes and each
  // shape's angular distance from the plane through the eye and the edge (the edge has to split them)
  _misalign(L, h) {
    const a = L.PA.clone().sub(h), b = L.PB.clone().sub(h);
    const n = L.X.clone().sub(h).cross(new THREE6.Vector3(0, 1, 0)).normalize();
    const off = (d) => Math.asin(Math.min(1, Math.abs(n.dot(d)) / d.length()));
    return Math.max(a.angleTo(b), off(a), off(b));
  },
  update(dt, t) {
    this.time = t;
    const cube = this.cube, fx = this.fx, T = THREE6;
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
      const head = this.app.input.head, right = new T.Vector3().subVectors(cube.position, head).cross(new T.Vector3(0, 1, 0)).normalize();
      cube.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw * dt * 1.4));
      cube.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(right, -pitch * dt * 1.0));
    }
    cube.updateMatrixWorld(true);
    DC_PORTAL.inv.value.copy(cube.matrixWorld).invert();
    // alignment, measured from the head in the cube's own space
    const h = this.app.input.head.clone().applyMatrix4(DC_PORTAL.inv.value);
    let glow = 0;
    if (this.active < 4) {
      const L = DC_LINKS[this.active];
      const outside = h.clone().sub(L.X).dot(L.v) > 0.05;
      const ang = outside ? this._misalign(L, h) : Math.PI;
      glow = 1 - T.MathUtils.smoothstep(ang, DC_ALIGN, DC_NEAR);
      if (ang < DC_ALIGN) {
        this.hold += dt;
        if (this.hold >= DC_HOLD) this._solve(this.active);
      } else this.hold = Math.max(0, this.hold - dt * 2);
    }
    this.motifs.forEach((pair, i) => {
      const since = this.solvedAt[i] !== void 0 ? t - this.solvedAt[i] : -1;
      const g = i === this.active ? glow : 0;
      const flash = since >= 0 ? Math.max(0, 1 - since / 1.5) : 0;
      for (const m of pair) {
        const solvedLit = since >= 0 ? 0.6 : 0;
        m.material.emissiveIntensity = Math.max(m.material.userData.base, solvedLit) + g * 0.9 + flash * 1.5;
      }
      const seam = this.seams[i].material;
      const breathe = i === this.active ? 0.18 + 0.12 * Math.sin(t * 3) : 0;
      seam.opacity = Math.min(1, Math.max(breathe * (1 - g), flash, this.active >= 4 ? 0.35 + 0.25 * Math.sin(t * 2 + i) : 0));
    });
    // hint: points from the active edge out along the line of sight
    if (this.hint.visible && this.active < 4) {
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
    const solved = (i) => this.solvedAt[i] !== void 0;
    const age = (i) => solved(i) ? t - this.solvedAt[i] : 0;
    // 1: chimney smoke
    if (solved(0)) for (const s of fx.smoke) {
      const u = (s.userData.t + t * 0.12) % 1;
      s.position.copy(s.userData.c).add(new T.Vector3(Math.sin(u * 6 + s.userData.t * 9) * 4e-3 + u * 0.012, u * 0.07, 0));
      s.position.y = Math.min(s.position.y, DC_HALF - 0.01);
      s.scale.setScalar(0.6 + u * 1.4);
      s.material.opacity = 0.7 * (1 - u);
    }
    // 2: the gear and the clock hands turn
    if (solved(1)) {
      this.motifs[1][0].rotateZ(dt * 1.2);
      for (const hnd of fx.hands) hnd.rotateZ(-dt * (hnd.userData.k ? 0.15 : 1.8));
    }
    // 3: the balloon floats free, up to the cube's ceiling
    const L3 = DC_LINKS[2], bal = this.motifs[2][1];
    if (solved(2)) {
      const u = Math.min(1, age(2) / 5), e = u * u * (3 - 2 * u);
      bal.position.set(L3.PB.x + 0.05 * e + Math.sin(t * 0.8) * 3e-3 * e, L3.PB.y + (DC_HALF - 0.03 - L3.PB.y) * e, L3.PB.z + 0.04 * e);
    }
    const top = bal.position.clone().setY(bal.position.y - L3.rB), peg = fx.peg;
    const stringLen = top.distanceTo(peg);
    const slack = solved(2) ? Math.min(1, age(2) / 0.6) : 0;
    fx.string.visible = slack < 1;
    fx.string.position.copy(top).add(peg).multiplyScalar(0.5);
    fx.string.scale.set(1, stringLen, 1);
    fx.string.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), top.clone().sub(peg).normalize());
    // 4: flowers open, the wheel rolls, the beam sweeps, the boat sails, the dream orb breathes
    if (solved(3)) {
      fx.flowers.forEach((fl, i) => fl.scale.setScalar(T.MathUtils.clamp((age(3) - i * 0.08) * 2, 0.01, 1)));
      this.motifs[3][0].rotateZ(-dt * 0.8);
      fx.beam.rotation.y = t * 0.9;
      const a = age(3) * 0.25;
      fx.boat.position.set(0.035 + Math.cos(a) * 0.04, -0.062, 0.02 + Math.sin(a) * 0.05);
      fx.boat.rotation.y = -a;
      fx.dreamOrb.scale.setScalar(1 + 0.08 * Math.sin(t * 2));
      fx.dreamOrb.rotation.y = t * 0.4;
    }
  },
  exit() {
    removeEventListener("keydown", this._kd);
    removeEventListener("keyup", this._ku);
  }
};
