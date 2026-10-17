// src/worlds/archiscape.js
// Archiscape: a Townscaper-style town builder on a tabletop, where the same town can be rebuilt in any era of
// architecture, from Stonehenge to Zaha Hadid. Tap a tile to raise a block and tap a wall to build beside it;
// hold to take a block away. Each style is a kit: walls, windows, roofs, crowns for towers, ground, trees and
// a palette. The blocks are only heights on an irregular grid, so every style re-reads the same town.
//
// Grid: the Townscaper recipe. A hexagon of triangles; random neighbouring pairs merge into quads; every
// polygon is split into quads around its centre; the quads are relaxed towards squares (each quad's corners
// rotated onto a common square and pulled towards it), with the rim pinned to a circle.
import * as THREE6 from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { RoomEnvironment as AsRoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
var AS_N = 5;
// hex rings of the base triangle grid (about 320 cells)
var AS_R = 0.27;
// m: island radius
var AS_H = 0.03;
// m: storey height
var AS_MAXH = 8;
var AS_TABLE_BELOW_HEAD = 0.5;
var AS_UP = new THREE6.Vector3(0, 1, 0);
function asRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// stable 0..1 hash of integers: windows, colours and trees stay put when the town is rebuilt
function asHash(...v) {
  let h = 2166136261;
  for (const x of v) {
    h = Math.imul(h ^ (x | 0), 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 2246822507);
  }
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function asPick(list, r) {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}
function asGrid(seed) {
  const rnd = asRng(seed), N = AS_N, S3 = Math.sqrt(3) / 2;
  const inside = (q, r) => Math.abs(q) <= N && Math.abs(r) <= N && Math.abs(q + r) <= N;
  const vid = new Map(), P = [];
  const vert = (q, r) => {
    const k = q * 1e3 + r;
    if (!vid.has(k)) {
      vid.set(k, P.length);
      P.push([q + r / 2, r * S3]);
    }
    return vid.get(k);
  };
  const tris = [];
  for (let q = -N; q <= N; q++) for (let r = -N; r <= N; r++) {
    if (inside(q, r) && inside(q + 1, r) && inside(q, r + 1)) tris.push([vert(q, r), vert(q + 1, r), vert(q, r + 1)]);
    if (inside(q + 1, r) && inside(q + 1, r + 1) && inside(q, r + 1)) tris.push([vert(q + 1, r), vert(q + 1, r + 1), vert(q, r + 1)]);
  }
  const ek = (a, b) => a < b ? a * 65536 + b : b * 65536 + a;
  const et = new Map();
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const e = ek(t[k], t[(k + 1) % 3]);
      if (!et.has(e)) et.set(e, []);
      et.get(e).push(i);
    }
  });
  const order = tris.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  // merge random neighbouring triangles into quads (both are counter-clockwise in x / z)
  const used = new Uint8Array(tris.length), polys = [];
  for (const i of order) {
    if (used[i]) continue;
    used[i] = 1;
    const t = tris[i], cands = [];
    for (let k = 0; k < 3; k++) for (const j of et.get(ek(t[k], t[(k + 1) % 3]))) if (!used[j]) cands.push([j, k]);
    if (cands.length && rnd() < 0.9) {
      const [j, k] = cands[Math.floor(rnd() * cands.length)];
      used[j] = 1;
      const a = t[k], b = t[(k + 1) % 3], c = t[(k + 2) % 3], o = tris[j].find((v) => v !== a && v !== b);
      polys.push([a, o, b, c]);
    } else polys.push(t);
  }
  // split every polygon into quads around its centre
  const mids = new Map(), Q = [];
  const mid = (a, b) => {
    const k = ek(a, b);
    if (!mids.has(k)) {
      mids.set(k, P.length);
      P.push([(P[a][0] + P[b][0]) / 2, (P[a][1] + P[b][1]) / 2]);
    }
    return mids.get(k);
  };
  for (const poly of polys) {
    const n = poly.length;
    let cx = 0, cz = 0;
    for (const v of poly) cx += P[v][0] / n, cz += P[v][1] / n;
    const c = P.length;
    P.push([cx, cz]);
    for (let i = 0; i < n; i++) Q.push([poly[i], mid(poly[i], poly[(i + 1) % n]), c, mid(poly[(i + n - 1) % n], poly[i])]);
  }
  const eq = new Map();
  Q.forEach((q, i) => {
    for (let k = 0; k < 4; k++) {
      const e = ek(q[k], q[(k + 1) % 4]);
      if (!eq.has(e)) eq.set(e, []);
      eq.get(e).push([i, k]);
    }
  });
  // the rim: pinned, and pushed onto a circle so the island is round
  const fixed = new Uint8Array(P.length);
  for (const [e, l] of eq) if (l.length === 1) fixed[Math.floor(e / 65536)] = fixed[e % 65536] = 1;
  const RIM = N * 0.93;
  for (let v = 0; v < P.length; v++) if (fixed[v]) {
    const r = Math.hypot(P[v][0], P[v][1]);
    P[v][0] *= RIM / r;
    P[v][1] *= RIM / r;
  }
  // relax: each quad pulls its corners towards the best-fitting square
  for (let it = 0; it < 80; it++) {
    const F = new Float64Array(P.length * 2);
    for (const q of Q) {
      let cx = 0, cz = 0;
      for (const v of q) cx += P[v][0] / 4, cz += P[v][1] / 4;
      let vx = 0, vz = 0;
      for (let i = 0; i < 4; i++) {
        let dx = P[q[i]][0] - cx, dz = P[q[i]][1] - cz;
        for (let k = 0; k < i; k++) [dx, dz] = [dz, -dx];
        vx += dx / 4;
        vz += dz / 4;
      }
      for (let i = 0; i < 4; i++) {
        let tx = vx, tz = vz;
        for (let k = 0; k < i; k++) [tx, tz] = [-tz, tx];
        F[q[i] * 2] += cx + tx - P[q[i]][0];
        F[q[i] * 2 + 1] += cz + tz - P[q[i]][1];
      }
    }
    for (let v = 0; v < P.length; v++) if (!fixed[v]) {
      P[v][0] += F[v * 2] * 0.3;
      P[v][1] += F[v * 2 + 1] * 0.3;
    }
  }
  const S = AS_R / RIM;
  const verts = P.map(([x, z]) => new THREE6.Vector2(x * S, z * S));
  const cells = Q.map((q, i) => {
    const pts = q.map((v) => verts[v]);
    const c = new THREE6.Vector2();
    for (const p of pts) c.addScaledVector(p, 0.25);
    const e = pts.map((a, k) => {
      const b = pts[(k + 1) % 4], t = b.clone().sub(a), len = t.length();
      t.divideScalar(len);
      return { a, b, t, n: new THREE6.Vector2(t.y, -t.x), len };
    });
    // inscribed radius (for domes and spires)
    const ins = Math.min(...e.map((x) => Math.abs(c.clone().sub(x.a).dot(x.n))));
    return { i, v: q, c, e, ins, nb: [-1, -1, -1, -1] };
  });
  for (const l of eq.values()) if (l.length === 2) {
    const [[i, k], [j, m]] = l;
    cells[i].nb[k] = j;
    cells[j].nb[m] = i;
  }
  const vcells = verts.map(() => []);
  cells.forEach((c) => c.v.forEach((v) => vcells[v].push(c.i)));
  return { verts, cells, vcells };
}
// - geometry kit: every primitive is appended, already transformed and vertex-coloured, to one batch per
// surface kind; each batch becomes a single mesh -
var AS_KINDS = {
  ground: { roughness: 0.95, metalness: 0 },
  matte: { roughness: 0.9, metalness: 0 },
  satin: { roughness: 0.6, metalness: 0 },
  gloss: { roughness: 0.32, metalness: 0.05 },
  metal: { roughness: 0.26, metalness: 0.95, env: true },
  gold: { roughness: 0.28, metalness: 1, env: true },
  glass: { roughness: 0.06, metalness: 0.5, env: true },
  glow: { glow: true },
  // matte, but light colours glow a little from within, so every white wall reads as one even plane whichever
  // way it faces (ink-wash painting); dark tiles and ink lines stay as they are
  wash: { roughness: 0.95, metalness: 0, wash: 0.6 },
  // tufts on open ground: like matte, but left out of the line looks' edges
  grass: { roughness: 0.9, metalness: 0 }
};
var _asV = new THREE6.Vector3(), _asN = new THREE6.Vector3(), _asM = new THREE6.Matrix4(), _asNM = new THREE6.Matrix3();
var _asC = new THREE6.Color(), _asA = new THREE6.Vector3(), _asB = new THREE6.Vector3();
var asGeoCache = /* @__PURE__ */ new Map();
function asUnit(key, make) {
  if (!asGeoCache.has(key)) {
    const g = make();
    asGeoCache.set(key, g.index ? g.toNonIndexed() : g);
  }
  return asGeoCache.get(key);
}
var AS_PROFILES = {
  hemi: Array.from({ length: 9 }, (_, i) => [Math.cos(i / 8 * Math.PI / 2), Math.sin(i / 8 * Math.PI / 2)]),
  onion: [[1, 0], [1.18, 0.22], [1.14, 0.48], [0.88, 0.78], [0.5, 1.05], [0.22, 1.32], [0.07, 1.56], [0, 1.72]],
  pointed: [[1, 0], [1, 0.18], [0.96, 0.46], [0.82, 0.76], [0.58, 1.02], [0.28, 1.24], [0, 1.42]],
  bell: [[1, 0], [0.98, 0.12], [0.62, 0.28], [0.42, 0.5], [0.3, 0.8], [0, 0.95]],
  spire: [[1, 0], [0.97, 0.12], [0.88, 0.3], [0.72, 0.5], [0.52, 0.68], [0.32, 0.83], [0.15, 0.94], [0, 1]],
  stepped: [[1, 0], [1, 0.08], [0.92, 0.08], [0.92, 0.16], [0.84, 0.16], [0.84, 0.22], [0.8, 0.3], [0.7, 0.5], [0.5, 0.7], [0.26, 0.82], [0.2, 0.84], [0.2, 0.86], [0, 0.86]]
};
function asKit(tess = null, remap = null) {
  const B = {};
  const batch = (k0) => {
    const k = remap?.[k0] ?? k0;
    return B[k] || (B[k] = { p: [], n: [], c: [], s: [] });
  };
  const col = (hex, vary = 0, r = 0.5) => {
    _asC.setHex(hex);
    if (vary) _asC.offsetHSL(0, 0, (r - 0.5) * vary);
    return _asC;
  };
  const K = {
    B,
    tess,
    // 1 while furnishing the ground: those vertices bend in the wind (trees, grass)
    sway: 0,
    // append a cached unit geometry under a matrix
    geo(kind, hex, g, m, vary = 0, r = 0.5) {
      const b = batch(kind), c = col(hex, vary, r), P = g.attributes.position, N = g.attributes.normal;
      _asNM.getNormalMatrix(m);
      // a mirroring matrix (e.g. along-wall, up, out) flips the winding; double-sided shading would then turn
      // the normals inwards, so the triangles are re-wound
      const flip = m.determinant() < 0;
      for (let j = 0; j < P.count; j++) {
        const i = flip ? j - j % 3 + [0, 2, 1][j % 3] : j;
        _asV.fromBufferAttribute(P, i).applyMatrix4(m);
        _asN.fromBufferAttribute(N, i).applyMatrix3(_asNM).normalize();
        b.p.push(_asV.x, _asV.y, _asV.z);
        b.n.push(_asN.x, _asN.y, _asN.z);
        b.c.push(c.r, c.g, c.b);
        b.s.push(K.sway);
      }
    },
    tri(kind, hex, a, b2, c2, vary = 0, r = 0.5) {
      const b = batch(kind), c = col(hex, vary, r);
      _asN.subVectors(b2, a).cross(_asA.subVectors(c2, a));
      if (_asN.lengthSq() < 1e-16) return;
      _asN.normalize();
      for (const p of [a, b2, c2]) {
        b.p.push(p.x, p.y, p.z);
        b.n.push(_asN.x, _asN.y, _asN.z);
        b.c.push(c.r, c.g, c.b);
        b.s.push(K.sway);
      }
    },
    poly(kind, hex, pts, vary = 0, r = 0.5) {
      for (let i = 1; i + 1 < pts.length; i++) K.tri(kind, hex, pts[0], pts[i], pts[i + 1], vary, r);
    },
    // a flat four-sided patch p00 -> p10 (u) and p00 -> p01 (v); tessellated when the style bends its buildings
    quad(kind, hex, p00, p10, p11, p01, vary = 0, r = 0.5) {
      const [nu, nv] = K.tess || [1, 1];
      if (nu === 1 && nv === 1) return K.poly(kind, hex, [p00, p10, p11, p01], vary, r);
      const at = (u, v) => new THREE6.Vector3().lerpVectors(p00, p10, u).multiplyScalar(1 - v).add(new THREE6.Vector3().lerpVectors(p01, p11, u).multiplyScalar(v));
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        K.poly(kind, hex, [at(i / nu, j / nv), at((i + 1) / nu, j / nv), at((i + 1) / nu, (j + 1) / nv), at(i / nu, (j + 1) / nv)], vary, r);
      }
    },
    // box centred at c with unit axes ax / ay / az and sizes sx / sy / sz
    box(kind, hex, c, ax, ay, az, sx, sy, sz, vary = 0, r = 0.5) {
      _asM.makeBasis(_asA.copy(ax).multiplyScalar(sx), _asB.copy(ay).multiplyScalar(sy), _asV.copy(az).multiplyScalar(sz)).setPosition(c);
      K.geo(kind, hex, asUnit("box", () => new THREE6.BoxGeometry(1, 1, 1)), _asM, vary, r);
    },
    // upright box with a yaw
    ybox(kind, hex, x, y, z, sx, sy, sz, yaw = 0, vary = 0, r = 0.5) {
      const ax = new THREE6.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), az = new THREE6.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      K.box(kind, hex, new THREE6.Vector3(x, y, z), ax, AS_UP, az, sx, sy, sz, vary, r);
    },
    // frustum from a (radius r0) to b (radius r1)
    cyl(kind, hex, a, b, r0, r1, seg = 8, vary = 0, r = 0.5) {
      // thin shafts (columns, posts, arch rings) look round enough with six sides: the towns are mostly these
      if (Math.max(r0, r1) < 2.5e-3) seg = Math.min(seg, 6);
      const ratio = Math.round(r1 / r0 * 50) / 50;
      const g = asUnit(`cyl${seg}:${ratio}`, () => new THREE6.CylinderGeometry(ratio, 1, 1, seg, 1, false));
      const ay = _asB.subVectors(b, a), len = ay.length();
      if (len < 1e-6) return;
      ay.divideScalar(len);
      const ax = Math.abs(ay.y) < 0.9 ? new THREE6.Vector3(0, 1, 0).cross(ay).normalize() : new THREE6.Vector3(1, 0, 0).cross(ay).normalize();
      const az = new THREE6.Vector3().crossVectors(ax, ay);
      _asM.makeBasis(ax.multiplyScalar(r0), ay.clone().multiplyScalar(len), az.multiplyScalar(r0)).setPosition(_asV.addVectors(a, b).multiplyScalar(0.5));
      K.geo(kind, hex, g, _asM, vary, r);
    },
    sphere(kind, hex, c, rx, ry = rx, rz = rx, detail = 1, vary = 0, r = 0.5) {
      _asM.makeScale(rx, ry, rz).setPosition(c);
      K.geo(kind, hex, asUnit(`ico${detail}`, () => new THREE6.IcosahedronGeometry(1, detail)), _asM, vary, r);
    },
    // a surface of revolution from a named profile ([radius, height] pairs, radius 1), scaled
    lathe(kind, hex, base, name, rad, height, seg = 12, yaw = 0, vary = 0, r = 0.5) {
      const g = asUnit(`lathe:${name}:${seg}`, () => new THREE6.LatheGeometry(AS_PROFILES[name].map(([x, y]) => new THREE6.Vector2(Math.max(x, 1e-4), y)), seg));
      _asM.makeRotationY(yaw).scale(new THREE6.Vector3(rad, height, rad)).setPosition(base);
      K.geo(kind, hex, g, _asM, vary, r);
    }
  };
  return K;
}
// - wall helpers. E is one exposed wall face of one storey: a3 / b3 its bottom corners, t3 along it, n3 out -
function asAt(E, u, y, out = 0) {
  return E.a3.clone().addScaledVector(E.t3, u * E.len).addScaledVector(AS_UP, y).addScaledVector(E.n3, out);
}
// the face itself, optionally between heights y0..y1 of the storey and pushed in / out
function asWall(K, E, kind, hex, y0 = 0, y1 = AS_H, out = 0, vary = 0) {
  const [a, b] = out ? asInset(E, -out) : [E.a3, E.b3];
  K.quad(kind, hex, a.clone().setY(E.y0 + y0), b.clone().setY(E.y0 + y0), b.clone().setY(E.y0 + y1), a.clone().setY(E.y0 + y1), vary, E.r);
}
// the face's bottom corners moved d inwards, mitred with the neighbouring exposed faces so corners stay closed
function asInset(E, d) {
  const end = (p, nOther, exposed) => {
    if (!exposed) return p.clone().addScaledVector(E.n3, -d);
    const m = _asV.copy(E.n3).add(nOther), k = 1 + E.n3.dot(nOther);
    return k < 0.2 ? p.clone().addScaledVector(E.n3, -d) : p.clone().addScaledVector(m, -d / k);
  };
  return [end(E.a3, E.nPrev, E.prevExp), end(E.b3, E.nNext, E.nextExp)];
}
// a box on the face: centred at u (0..1 along) and height y above the storey floor, w x hh, standing out by `out`
function asOn(K, E, kind, hex, u, y, w, hh, out = 6e-4, d = 1.4e-3, vary = 0) {
  K.box(kind, hex, asAt(E, u, E.y0 + y - E.a3.y, out), E.t3, AS_UP, E.n3, w, hh, d, vary, E.r);
}
// a horizontal band the whole length of the face
function asBand(K, E, kind, hex, y, hh, out = 1e-3, d = 2e-3, ext = 0) {
  K.box(kind, hex, asAt(E, 0.5, E.y0 + y + hh / 2 - E.a3.y, out), E.t3, AS_UP, E.n3, E.len + ext, hh, d, 0, E.r);
}
// slot positions (0..1) for openings about `spacing` apart; none on very short faces
function asSlots(len, spacing, min = 0.6) {
  if (len < spacing * min) return [];
  const n = Math.max(1, Math.round(len / spacing));
  return Array.from({ length: n }, (_, i) => (i + 0.5) / n);
}
// an arched opening: a rectangle and a half-disc on top
function asArch(K, E, kind, hex, u, y, w, hh, out = 4e-4) {
  asOn(K, E, kind, hex, u, y, w, hh, out, 1.2e-3);
  const c = asAt(E, u, E.y0 + y + hh / 2 - E.a3.y, out);
  K.cyl(kind, hex, c.clone().addScaledVector(E.n3, -6e-4), c.clone().addScaledVector(E.n3, 6e-4), w / 2, w / 2, 10);
}
// a pointed opening: a rectangle with a diamond on top
function asPointed(K, E, kind, hex, u, y, w, hh, out = 4e-4) {
  asOn(K, E, kind, hex, u, y, w, hh, out, 1.2e-3);
  const c = asAt(E, u, E.y0 + y + hh / 2 - E.a3.y, out);
  const ax = E.t3.clone().add(AS_UP).normalize(), ay = AS_UP.clone().sub(E.t3).normalize();
  K.box(kind, hex, c, ax, ay, E.n3, w * 0.71, w * 0.71, 1.2e-3);
}
// - roof helpers. R is the top of one column: v3 its corners at roof height, join[k] = the neighbour across
// edge k is at least as tall (no eave there, the roof runs on) -
// a pitched roof whose ridge runs across the cell towards its joined neighbours, so rows of houses share one
// ridge line; free ends are hipped, or closed by a gable (a callback draws the gable wall)
function asPitched(K, R, { kind, hex, pitch = 0.5, over = 5e-3, hip = 0.5, up = 0, gable = null, ridge = null, end = null, dir = null, flush = false }) {
  const v = R.v3, j = R.join, n = R.n3;
  const mids = [0, 1, 2, 3].map((k) => v[k].clone().lerp(v[(k + 1) % 4], 0.5));
  const sA = j[0] + j[2], sB = j[1] + j[3];
  // dir: the ridge follows one fixed direction (rows of parallel roofs); otherwise it runs towards the joined
  // neighbours, else along the cell's longer axis
  const a = dir ? Math.abs(_asA.subVectors(mids[2], mids[0]).normalize().dot(dir)) >= Math.abs(_asB.subVectors(mids[3], mids[1]).normalize().dot(dir)) ? 0 : 1 : sA !== sB ? sA > sB ? 0 : 1 : mids[0].distanceTo(mids[2]) >= mids[1].distanceTo(mids[3]) ? 0 : 1;
  const i0 = a, i1 = (a + 1) % 4, i2 = (a + 2) % 4, i3 = (a + 3) % 4;
  const rise = pitch * mids[i1].distanceTo(mids[i3]) / 2;
  // flush: a gable wall rises above the roof's free ends (horse-head walls), so the roof stops at it instead of
  // overhanging past it
  const gableEdge = (k) => flush && gable && (k === i0 || k === i2);
  const E = v.map((p, i) => {
    const q = p.clone();
    let ex = 0;
    for (const k of [(i + 3) % 4, i]) if (!j[k]) {
      if (!gableEdge(k)) q.addScaledVector(n[k], over);
      ex++;
    }
    if (ex === 2) q.y += up;
    return q;
  });
  const ridgeEnd = (k) => {
    const m = mids[k].clone();
    if (!j[k]) {
      if (gable && !flush) m.addScaledVector(n[k], over);
      else m.lerp(R.cen, hip);
    }
    m.y = R.y + rise;
    return m;
  };
  const R0 = ridgeEnd(i0), R2 = ridgeEnd(i2);
  K.poly(kind, hex, [E[i1], E[i2], R2, R0], 0.06, R.r);
  K.poly(kind, hex, [E[i3], E[i0], R0, R2], 0.06, R.r);
  for (const [k, ra] of [[i0, R0], [i2, R2]]) {
    const p = v[k], q = v[(k + 1) % 4], apex = mids[k].clone().setY(R.y + rise);
    if (j[k]) K.tri("matte", R.wall, p, q, apex);
    else if (gable) gable(K, p, q, apex, k);
    else K.tri(kind, hex, E[k], E[(k + 1) % 4], ra, 0.06, R.r);
  }
  if (ridge) K.cyl(kind, ridge, R0, R2, 1.1e-3, 1.1e-3, 5);
  if (end) {
    if (!j[i0]) end(K, R0);
    if (!j[i2]) end(K, R2);
  }
  return { R0, R2, rise };
}
// a flat roof, with a parapet (and battlements) along the free edges
function asFlat(K, R, { kind = "matte", hex, parapet = 0, phex = hex, merlon = 0, rail = 0, rhex = 16777215 }) {
  K.poly(kind, hex, R.v3.map((p) => p.clone().setY(R.y + 2e-4)), 0.04, R.r);
  R.n3.forEach((n, k) => {
    if (R.join[k]) return;
    const a = R.v3[k], b = R.v3[(k + 1) % 4], t = b.clone().sub(a), len = t.length();
    t.divideScalar(len);
    const mid = a.clone().lerp(b, 0.5);
    if (parapet) K.box("matte", phex, mid.clone().addScaledVector(n, -1e-3).setY(R.y + parapet / 2), t, AS_UP, n, len + 2e-3, parapet, 2.2e-3, 0.04, R.r);
    if (merlon) for (const u of asSlots(len, merlon * 2.2, 0.5)) {
      K.box("matte", phex, a.clone().addScaledVector(t, u * len).addScaledVector(n, -1e-3).setY(R.y + parapet + merlon * 0.6), t, AS_UP, n, merlon, merlon * 1.2, 2.4e-3, 0.04, R.r);
    }
    if (rail) {
      K.box("satin", rhex, mid.clone().addScaledVector(n, -8e-4).setY(R.y + rail), t, AS_UP, n, len, 6e-4, 6e-4);
      for (const u of asSlots(len, 6e-3, 0.3)) K.box("satin", rhex, a.clone().addScaledVector(t, u * len).addScaledVector(n, -8e-4).setY(R.y + rail / 2), t, AS_UP, n, 4e-4, rail, 4e-4);
    }
  });
}
// a cupola: drum, then a dome of a named profile, optional finial
function asDome(K, R, { kind = "satin", hex, profile = "hemi", scale = 0.85, drum = 6e-3, drumHex = R.wall, height = 1, finial = null, seg = 14 }) {
  const r = R.ins * scale, base = R.cen.clone();
  if (drum) {
    K.cyl("matte", drumHex, base, base.clone().setY(base.y + drum), r * 1.02, r * 1.02, seg);
    base.y += drum;
  }
  const top = AS_PROFILES[profile].at(-1)[1] * r * height;
  K.lathe(kind, hex, base, profile, r, r * height, seg, 0, 0.04, R.r);
  if (finial) finial(K, base.clone().setY(base.y + top));
  return base.y + top;
}
function asCross(K, p, hex = 14264890) {
  K.box("gold", hex, p.clone().setY(p.y + 4e-3), new THREE6.Vector3(1, 0, 0), AS_UP, new THREE6.Vector3(0, 0, 1), 6e-4, 8e-3, 6e-4);
  K.box("gold", hex, p.clone().setY(p.y + 5.5e-3), new THREE6.Vector3(1, 0, 0), AS_UP, new THREE6.Vector3(0, 0, 1), 4e-3, 6e-4, 6e-4);
}
// - trees and props -
function asTree(K, type, x, z, s, r, hex) {
  const g = (y) => new THREE6.Vector3(x, y, z);
  const trunk = (h, rad, c = 6050356) => K.cyl("matte", c, g(0), g(h), rad, rad * 0.7, 5);
  if (type === "round") {
    trunk(0.012 * s, 1.1e-3 * s);
    K.sphere("matte", hex ?? 6658134, g(0.017 * s), 7e-3 * s, 6e-3 * s, 7e-3 * s, 1, 0.12, r);
  } else if (type === "olive") {
    trunk(7e-3 * s, 1.2e-3 * s, 7364693);
    K.sphere("matte", hex ?? 9016426, g(0.011 * s), 6.5e-3 * s, 4e-3 * s, 6.5e-3 * s, 1, 0.12, r);
  } else if (type === "cypress") {
    trunk(3e-3 * s, 1e-3 * s);
    K.lathe("matte", hex ?? 3033399, g(2e-3 * s), "bell", 3e-3 * s, 0.026 * s, 7, 0, 0.1, r);
  } else if (type === "fir") {
    trunk(4e-3 * s, 1e-3 * s);
    for (let i = 0; i < 3; i++) K.cyl("matte", i === 2 ? 15200493 : hex ?? 2639401, g((3 + i * 6) * 1e-3 * s), g((13 + i * 6) * 1e-3 * s), (6.5 - i * 1.6) * 1e-3 * s, 1e-4, 7, 0.08, r);
  } else if (type === "pine") {
    trunk(0.017 * s, 1e-3 * s, 7029588);
    K.sphere("matte", hex ?? 4878648, g(0.019 * s), 9e-3 * s, 3e-3 * s, 9e-3 * s, 1, 0.1, r);
  } else if (type === "palm") {
    const lean = new THREE6.Vector3((r - 0.5) * 6e-3, 0.022 * s, (asHash(r * 1e6) - 0.5) * 6e-3);
    K.cyl("matte", 9271651, g(0), g(0).add(lean), 1.1e-3 * s, 7e-4 * s, 5);
    const top = g(0).add(lean);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + r * 6, d = new THREE6.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize();
      K.box("matte", hex ?? 5146670, top.clone().addScaledVector(d, 5e-3 * s), d, new THREE6.Vector3(-Math.sin(a), 0, Math.cos(a)), new THREE6.Vector3().crossVectors(d, new THREE6.Vector3(-Math.sin(a), 0, Math.cos(a))), 0.011 * s, 2.6e-3 * s, 4e-4);
    }
  } else if (type === "willow") {
    trunk(0.011 * s, 1.3e-3 * s, 5262899);
    const top = g(0.016 * s);
    K.sphere("matte", hex ?? 9351015, top, 7e-3 * s, 4.5e-3 * s, 7e-3 * s, 1, 0.1, r);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, p = top.clone().add(new THREE6.Vector3(Math.cos(a) * 6e-3 * s, -2e-3 * s, Math.sin(a) * 6e-3 * s));
      K.cyl("matte", hex ?? 10404982, p, p.clone().setY(p.y - 0.01 * s), 1.2e-3 * s, 5e-4 * s, 4);
    }
  } else if (type === "birch") {
    K.cyl("matte", 15790320, g(0), g(0.016 * s), 8e-4 * s, 6e-4 * s, 5);
    K.sphere("matte", hex ?? 13156968, g(0.018 * s), 4.5e-3 * s, 7e-3 * s, 4.5e-3 * s, 1, 0.15, r);
  }
}
