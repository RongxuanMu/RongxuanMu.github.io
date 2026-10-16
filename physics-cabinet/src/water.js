// src/water.js
// The water ball, from Water Ball XR (codepen.io/MuRongxuan/pen/PwpQYap), unchanged in its physics, surface and
// sound: position-based SPH with double density relaxation (Clavet et al. 2005), surface tension from the kept
// negative pressure, a marching-cubes surface over a density grid that follows the water, droplet impostors for
// lone particles, and bubble sounds. Here it floats over the plate, scaled to the table.
import { MarchingCubes as WBMarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
var WB_MOBILE = /OculusBrowser|Quest|Pico|Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
var WB_MAXN = 48;            // neighbours kept per particle
var WB_CELLS = 1 << 14;      // spatial-hash buckets
var WB_MAX_COLLIDERS = 72;

function wbHash(x, y, z) {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (WB_CELLS - 1);
}
// density a particle sees inside a cubic lattice of the given spacing: the rest density of the liquid
function wbLatticeDensity(h, s) {
  let rho = 0;
  const R = Math.ceil(h / s);
  for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) {
    if (!i && !j && !k) continue;
    const q = 1 - Math.hypot(i, j, k) * s / h;
    if (q > 0) rho += q * q;
  }
  return rho;
}

var WaterSim = class {
  constructor(n) {
    this.n = n;
    this.h = 0.04;                      // interaction radius (m)
    this.radius = 0.0105;               // particle radius
    this.k = 34;                        // stiffness
    this.kNear = 120;                   // near-stiffness: keeps particles apart, gives the surface its sharpness
    this.tension = 0.6;                 // share of negative pressure kept: surface tension (0 = splashy, 1 = goo)
    this.visc = 0.05;                   // XSPH smoothing
    this.pull = 26;                     // zero-g pull toward the anchor (1/s^2)
    this.pullMax = 6;                   // ... capped (m/s^2) so far droplets come back gently
    this.damping = 0.5;                 // zero-g velocity damping (1/s): a thrown ball glides to a stop
    this.gravity = false;
    this.rho0 = wbLatticeDensity(this.h, 0.5 * this.h);
    this.p = new Float32Array(n * 3);
    this.o = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.dv = new Float32Array(n * 3);
    this.speed = new Float32Array(n);
    this.vis = new Float32Array(n).fill(1);    // 0 = drawn by the surface, 1 = drawn as a droplet
    this.cellOf = new Int32Array(n);
    this.cellStart = new Int32Array(WB_CELLS + 1);
    this.cellFill = new Int32Array(WB_CELLS);
    this.sorted = new Int32Array(n);
    this.nb = new Int32Array(n * WB_MAXN);
    this.nq = new Float32Array(n * WB_MAXN);
    this.nc = new Int32Array(n);
    this.cols = new Float32Array(WB_MAX_COLLIDERS * 4);
    this.nCols = 0;
    this.anchor = new THREE6.Vector3();
    this.centroid = new THREE6.Vector3();
    this.grabs = new Map();             // key -> { idx: Int32Array, off: Float32Array, target: Vector3 }
    this.floorHits = 0;                 // for the sound: how hard water hit the floor / was pushed since last read
    this.floorAt = new THREE6.Vector3();
    this.pokes = 0;
    this.floorR2 = Infinity;            // the floor (y = 0) only reaches this far from the axis: past it, water falls
  }

  // a ball of water: particles on a jittered lattice inside a sphere, nearest-first
  reset(center) {
    const s = 0.5 * this.h, pts = [];
    const R = Math.cbrt(this.n * s * s * s * 3 / (4 * Math.PI)) + s;
    for (let x = -R; x <= R; x += s) for (let y = -R; y <= R; y += s) for (let z = -R; z <= R; z += s) {
      const d = Math.hypot(x, y, z);
      if (d <= R) pts.push([d, x, y, z]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < this.n; i++) {
      const [, x, y, z] = pts[i % pts.length], b = i * 3, j = () => (Math.random() - 0.5) * 1e-3;
      this.p[b] = this.o[b] = center.x + x + j();
      this.p[b + 1] = this.o[b + 1] = center.y + y + j();
      this.p[b + 2] = this.o[b + 2] = center.z + z + j();
      this.v[b] = this.v[b + 1] = this.v[b + 2] = 0;
    }
    this.anchor.copy(center);
    this.centroid.copy(center);
    this.grabs.clear();
  }

  setColliders(list) {
    const n = Math.min(list.length, WB_MAX_COLLIDERS);
    for (let i = 0; i < n; i++) this.cols.set(list[i], i * 4);
    this.nCols = n;
  }

  // grab the water around `point`: the nearest particles follow the grabber, bunched slightly together
  grab(key, point) {
    const p = this.p, near = [];
    for (let r = 0.07; r <= 0.2 && near.length < 12; r += 0.045) {
      near.length = 0;
      for (let i = 0; i < this.n; i++) {
        const b = i * 3, d = Math.hypot(p[b] - point.x, p[b + 1] - point.y, p[b + 2] - point.z);
        if (d < r) near.push([d, i]);
      }
    }
    if (!near.length) return false;
    near.sort((a, b) => a[0] - b[0]);
    const m = Math.min(near.length, 140), idx = new Int32Array(m), off = new Float32Array(m * 3);
    for (let k = 0; k < m; k++) {
      const i = near[k][1], b = i * 3;
      idx[k] = i;
      off[k * 3] = (p[b] - point.x) * 0.55;
      off[k * 3 + 1] = (p[b + 1] - point.y) * 0.55;
      off[k * 3 + 2] = (p[b + 2] - point.z) * 0.55;
    }
    this.grabs.set(key, { idx, off, target: point.clone() });
    return true;
  }

  // a splash: particles near `point` kicked outward
  splash(point, strength = 1.4, radius = 0.12) {
    const p = this.p, v = this.v;
    for (let i = 0, b = 0; i < this.n; i++, b += 3) {
      const dx = p[b] - point.x, dy = p[b + 1] - point.y, dz = p[b + 2] - point.z, d = Math.hypot(dx, dy, dz);
      if (d > radius || d < 1e-5) continue;
      const f = strength * (1 - d / radius) / d;
      v[b] += dx * f; v[b + 1] += dy * f + 0.3 * strength * (1 - d / radius); v[b + 2] += dz * f;
    }
  }

  updateCentroid() {
    // centre of the main body: the plain mean, then a second mean that ignores far stragglers
    const p = this.p, n = this.n, c = this.centroid;
    let x = 0, y = 0, z = 0;
    for (let i = 0, b = 0; i < n; i++, b += 3) { x += p[b]; y += p[b + 1]; z += p[b + 2]; }
    c.set(x / n, y / n, z / n);
    let m = 0; x = y = z = 0;
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      if ((p[b] - c.x) ** 2 + (p[b + 1] - c.y) ** 2 + (p[b + 2] - c.z) ** 2 > 0.09) continue;
      x += p[b]; y += p[b + 1]; z += p[b + 2]; m++;
    }
    if (m > n * 0.2) c.set(x / m, y / m, z / m);
  }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    if (!(dt > 1e-4)) return;
    const S = dt > 1 / 55 ? 3 : 2, sdt = dt / S;
    for (let s = 0; s < S; s++) this.substep(sdt);
  }

  substep(dt) {
    const n = this.n, p = this.p, o = this.o, v = this.v;
    const ax = this.anchor.x, ay = this.anchor.y, az = this.anchor.z, K = this.pull, AM = this.pullMax;
    const damp = this.gravity ? 1 : Math.exp(-this.damping * dt), g = this.gravity ? -9.81 * dt : 0;
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      if (this.gravity) v[b + 1] += g;
      else {
        let fx = (ax - p[b]) * K, fy = (ay - p[b + 1]) * K, fz = (az - p[b + 2]) * K;
        const f = Math.hypot(fx, fy, fz);
        if (f > AM) { const s = AM / f; fx *= s; fy *= s; fz *= s; }
        v[b] = (v[b] + fx * dt) * damp; v[b + 1] = (v[b + 1] + fy * dt) * damp; v[b + 2] = (v[b + 2] + fz * dt) * damp;
      }
      o[b] = p[b]; o[b + 1] = p[b + 1]; o[b + 2] = p[b + 2];
      p[b] += v[b] * dt; p[b + 1] += v[b + 1] * dt; p[b + 2] += v[b + 2] * dt;
    }
    // grabbed particles are drawn to the grabber (position based, so the motion becomes their velocity)
    for (const gr of this.grabs.values()) {
      const t = gr.target;
      for (let k = 0; k < gr.idx.length; k++) {
        const b = gr.idx[k] * 3;
        p[b] += (t.x + gr.off[k * 3] - p[b]) * 0.3;
        p[b + 1] += (t.y + gr.off[k * 3 + 1] - p[b + 1]) * 0.3;
        p[b + 2] += (t.z + gr.off[k * 3 + 2] - p[b + 2]) * 0.3;
      }
    }
    this.neighbours();
    this.relax(dt);
    this.collide();
    const idt = 1 / dt;
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      v[b] = (p[b] - o[b]) * idt; v[b + 1] = (p[b + 1] - o[b + 1]) * idt; v[b + 2] = (p[b + 2] - o[b + 2]) * idt;
    }
    this.viscosity();
  }

  neighbours() {
    const n = this.n, p = this.p, ih = 1 / this.h, h2 = this.h * this.h;
    const { cellOf, cellStart, cellFill, sorted, nb, nc } = this;
    cellStart.fill(0);
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      const c = wbHash(Math.floor(p[b] * ih), Math.floor(p[b + 1] * ih), Math.floor(p[b + 2] * ih));
      cellOf[i] = c; cellStart[c + 1]++;
    }
    for (let c = 0; c < WB_CELLS; c++) cellStart[c + 1] += cellStart[c];
    cellFill.set(cellStart.subarray(0, WB_CELLS));
    for (let i = 0; i < n; i++) sorted[cellFill[cellOf[i]]++] = i;
    const seen = new Int32Array(27);
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      const x = p[b], y = p[b + 1], z = p[b + 2];
      const cx = Math.floor(x * ih), cy = Math.floor(y * ih), cz = Math.floor(z * ih), base = i * WB_MAXN;
      let cnt = 0, ns = 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const c = wbHash(cx + dx, cy + dy, cz + dz);
        let dup = false;
        for (let s = 0; s < ns; s++) if (seen[s] === c) { dup = true; break; }
        if (dup) continue;
        seen[ns++] = c;
        for (let k = cellStart[c], e = cellStart[c + 1]; k < e && cnt < WB_MAXN; k++) {
          const j = sorted[k];
          if (j === i) continue;
          const jb = j * 3, ex = p[jb] - x, ey = p[jb + 1] - y, ez = p[jb + 2] - z;
          if (ex * ex + ey * ey + ez * ez < h2) nb[base + cnt++] = j;
        }
      }
      nc[i] = cnt;
    }
  }

  relax(dt) {
    const n = this.n, p = this.p, h = this.h, ih = 1 / h, h2 = h * h, dt2 = dt * dt;
    const { nb, nq, nc, k: K, kNear: KN, rho0, tension } = this, maxD = 0.1 * h;
    for (let i = 0; i < n; i++) {
      const b = i * 3, base = i * WB_MAXN, m = nc[i], x = p[b], y = p[b + 1], z = p[b + 2];
      let rho = 0, rhoN = 0;
      for (let k = 0; k < m; k++) {
        const jb = nb[base + k] * 3, ex = p[jb] - x, ey = p[jb + 1] - y, ez = p[jb + 2] - z, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 >= h2) { nq[base + k] = 0; continue; }
        const q = 1 - Math.sqrt(d2) * ih;
        nq[base + k] = q; rho += q * q; rhoN += q * q * q;
      }
      let P = K * (rho - rho0);
      if (P < 0) P *= tension;
      const PN = KN * rhoN;
      let ax = 0, ay = 0, az = 0;
      for (let k = 0; k < m; k++) {
        const q = nq[base + k];
        if (q <= 0) continue;
        const jb = nb[base + k] * 3, ex = p[jb] - x, ey = p[jb + 1] - y, ez = p[jb + 2] - z;
        const r = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (r < 1e-6) continue;
        let D = dt2 * (P * q + PN * q * q);
        if (D > maxD) D = maxD; else if (D < -maxD) D = -maxD;
        const s = 0.5 * D / r, ux = ex * s, uy = ey * s, uz = ez * s;
        p[jb] += ux; p[jb + 1] += uy; p[jb + 2] += uz;
        ax -= ux; ay -= uy; az -= uz;
      }
      p[b] += ax; p[b + 1] += ay; p[b + 2] += az;
    }
  }

  collide() {
    const n = this.n, p = this.p, o = this.o, r = this.radius, cols = this.cols, nCols = this.nCols;
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      let x = p[b], y = p[b + 1], z = p[b + 2];
      for (let c = 0; c < nCols; c++) {
        const cb = c * 4, R = cols[cb + 3] + r, dx = x - cols[cb], dy = y - cols[cb + 1], dz = z - cols[cb + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 1e-6, s = R / d;
          x = cols[cb] + dx * s; y = cols[cb + 1] + dy * s; z = cols[cb + 2] + dz * s;
          this.pokes += R - Math.sqrt(d2);
        }
      }
      if (y < r && x * x + z * z < this.floorR2) {
        const fall = o[b + 1] - y;               // how far it dropped this substep: impact strength
        if (fall > 4e-3) { this.floorHits += fall; this.floorAt.set(x, 0, z); }
        y = r; x = o[b] + (x - o[b]) * 0.75; z = o[b + 2] + (z - o[b + 2]) * 0.75; }   // the floor, with friction
      p[b] = x; p[b + 1] = y; p[b + 2] = z;
    }
  }

  viscosity() {
    const n = this.n, v = this.v, dv = this.dv, { nb, nq, nc, visc, speed } = this;
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      const base = i * WB_MAXN, m = nc[i];
      let sx = 0, sy = 0, sz = 0, sw = 0;
      for (let k = 0; k < m; k++) {
        const q = nq[base + k];
        if (q <= 0) continue;
        const jb = nb[base + k] * 3;
        sx += q * (v[jb] - v[b]); sy += q * (v[jb + 1] - v[b + 1]); sz += q * (v[jb + 2] - v[b + 2]); sw += q;
      }
      if (sw > 0) { const f = visc / sw; dv[b] = sx * f; dv[b + 1] = sy * f; dv[b + 2] = sz * f; }
      else dv[b] = dv[b + 1] = dv[b + 2] = 0;
    }
    for (let i = 0, b = 0; i < n; i++, b += 3) {
      let vx = v[b] + dv[b], vy = v[b + 1] + dv[b + 1], vz = v[b + 2] + dv[b + 2], s = Math.hypot(vx, vy, vz);
      if (s > 5) { const f = 5 / s; vx *= f; vy *= f; vz *= f; s = 5; }
      v[b] = vx; v[b + 1] = vy; v[b + 2] = vz; speed[i] = s;
    }
  }
};

// The liquid surface: a density grid that follows the water (sized to the body each frame, snapped to 2 cm
// steps so it does not swim) and marching cubes over it. Particles outside the grid stay droplets.
var WaterSurface = class {
  constructor(sim, resolution, envMap) {
    this.sim = sim;
    this.kernel = 0.036;
    this.center = new THREE6.Vector3();
    this.ext = new THREE6.Vector3(0.2, 0.2, 0.2);
    const mat = new THREE6.MeshPhysicalMaterial({
      color: 0xa8e2ff, roughness: 0.02, metalness: 0, ior: 1.33, envMap, envMapIntensity: 1.7,
      clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, transparent: true, depthWrite: false
    });
    // fresnel alpha: clear where you look straight through, bright and opaque at grazing angles - water
    // wbClear: alpha where you look straight through (the transparency slider); wbGlow: rim tint (the palette)
    this.uniforms = { wbClear: { value: 0.1 }, wbGlow: { value: new THREE6.Color(0x4d9ed9) } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.fragmentShader = "uniform float wbClear;\nuniform vec3 wbGlow;\n" + sh.fragmentShader.replace("#include <opaque_fragment>", `
        float wbFres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.2);
        diffuseColor.a = mix(wbClear, max(wbClear, 0.95), wbFres);
        outgoingLight = outgoingLight * (0.55 + 0.6 * wbFres) + wbGlow * wbFres * 0.5;
        #include <opaque_fragment>`);
    };
    this.mat = mat;
    this.mc = new WBMarchingCubes(resolution, mat, false, false, 50000);
    this.mc.isolation = 1.0;
    this.mc.frustumCulled = false;
    this.mc.userData.noCollider = this.mc.userData.noHighlight = true;
  }

  update() {
    const s = this.sim, mc = this.mc, N = mc.size, field = mc.field, p = s.p, vis = s.vis, nc = s.nc;
    // fit the grid to the body (particles with neighbours), snapped so it only changes in 2 cm steps
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    const c = s.centroid;
    for (let i = 0, b = 0; i < s.n; i++, b += 3) {
      if (nc[i] < 1) continue;
      const x = p[b], y = p[b + 1], z = p[b + 2];
      if (Math.abs(x - c.x) > 0.7 || Math.abs(y - c.y) > 0.7 || Math.abs(z - c.z) > 0.7) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    if (x0 > x1) { mc.visible = false; vis.fill(1); return; }
    mc.visible = true;
    const pad = this.kernel + 0.04, snap = (v) => Math.ceil(v / 0.02) * 0.02, snapC = (v) => Math.round(v / 0.02) * 0.02;
    const ext = this.ext.set(snap(Math.min(0.75, (x1 - x0) / 2 + pad)), snap(Math.min(0.75, (y1 - y0) / 2 + pad)), snap(Math.min(0.75, (z1 - z0) / 2 + pad)));
    const ctr = this.center.set(snapC((x0 + x1) / 2), snapC((y0 + y1) / 2), snapC((z0 + z1) / 2));
    mc.position.copy(ctr);
    mc.scale.copy(ext);
    field.fill(0);
    mc.normal_cache.fill(0);
    const vx = 2 * ext.x / N, vy = 2 * ext.y / N, vz = 2 * ext.z / N;
    // a stretched grid (water splashed over the floor) gets a wider kernel so thin sheets stay a surface; the
    // weight is scaled back so the density - and with it the iso level - means the same at any width
    const half = N / 2, R = Math.max(this.kernel, 1.6 * Math.max(vx, vy, vz)), R2 = R * R, wgt = Math.pow(this.kernel / R, 3);
    const rx = Math.ceil(R / vx), ry = Math.ceil(R / vy), rz = Math.ceil(R / vz);
    const splat = (x, y, z) => {
      const gx = (x - ctr.x) / ext.x * half + half, gy = (y - ctr.y) / ext.y * half + half, gz = (z - ctr.z) / ext.z * half + half;
      const ix = Math.round(gx), iy = Math.round(gy), iz = Math.round(gz);
      for (let k = Math.max(iz - rz, 1), k1 = Math.min(iz + rz, N - 2); k <= k1; k++) {
        const dz = (k - gz) * vz, dz2 = dz * dz;
        if (dz2 >= R2) continue;
        const zo = k * N * N;
        for (let j = Math.max(iy - ry, 1), j1 = Math.min(iy + ry, N - 2); j <= j1; j++) {
          const dy = (j - gy) * vy, dyz = dy * dy + dz2;
          if (dyz >= R2) continue;
          const yo = zo + j * N;
          for (let i = Math.max(ix - rx, 1), i1 = Math.min(ix + rx, N - 2); i <= i1; i++) {
            const dx = (i - gx) * vx, d2 = dx * dx + dyz;
            if (d2 >= R2) continue;
            const t = 1 - d2 / R2;
            field[yo + i] += t * t * t * wgt;
          }
        }
      }
    };
    const lo = 2, hi = N - 3, M = 0.5 * R;
    for (let i = 0, b = 0; i < s.n; i++, b += 3) {
      if (nc[i] < 1) { vis[i] = 1; continue; }        // only a particle with no neighbour at all is a droplet
      const x = p[b], y = p[b + 1], z = p[b + 2];
      const gx = (x - ctr.x) / ext.x * half + half, gy = (y - ctr.y) / ext.y * half + half, gz = (z - ctr.z) / ext.z * half + half;
      if (gx < lo || gx > hi || gy < lo || gy > hi || gz < lo || gz > hi) { vis[i] = 1; continue; }
      vis[i] = 0;
      splat(x, y, z);
      if (y < M) splat(x, -y, z);                     // mirror below the floor: puddles meet the ground
    }
    mc.update();
    // flatten anything below the floor onto it
    const P = mc.positionArray, Nr = mc.normalArray, floor = (0.001 - ctr.y) / ext.y;
    if (floor > -1) {
      for (let v = 0, o = 0; v < mc.count; v++, o += 3) {
        if (P[o + 1] < floor) { P[o + 1] = floor; Nr[o] = 0; Nr[o + 1] = 1; Nr[o + 2] = 0; }
      }
    }
  }
};

// droplets: lit sphere impostors for the particles the surface does not cover
function wbDroplets(sim) {
  const geo = new THREE6.BufferGeometry();
  const pos = new THREE6.BufferAttribute(sim.p, 3).setUsage(THREE6.DynamicDrawUsage);
  const vis = new THREE6.BufferAttribute(sim.vis, 1).setUsage(THREE6.DynamicDrawUsage);
  geo.setAttribute("position", pos);
  geo.setAttribute("vis", vis);
  const mat = new THREE6.ShaderMaterial({
    uniforms: { uRadius: { value: sim.radius * 1.05 }, uViewH: { value: 1000 }, uColor: { value: new THREE6.Color(0xa8e2ff) }, uClear: { value: 0.1 } },
    vertexShader: `
      attribute float vis;
      uniform float uRadius, uViewH;
      void main() {
        if (vis < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uRadius * projectionMatrix[1][1] * uViewH / gl_Position.w, 1.0, 200.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uClear;
      void main() {
        float wClear = uClear;
        vec2 c = gl_PointCoord * 2.0 - 1.0; c.y = -c.y;
        float d = dot(c, c);
        if (d > 1.0) discard;
        vec3 n = vec3(c, sqrt(1.0 - d)), L = normalize(vec3(0.35, 0.8, 0.5));
        float fres = pow(1.0 - n.z, 2.2);
        float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
        gl_FragColor = vec4(uColor * (0.55 + 0.45 * fres) + spec, mix(0.2 + wClear, 0.95, fres) + spec);
      }`,
    transparent: true, depthWrite: false
  });
  const pts = new THREE6.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.noCollider = pts.userData.noHighlight = true;
  const size = new THREE6.Vector2();
  pts.onBeforeRender = (renderer, scene, camera) => {
    mat.uniforms.uViewH.value = camera.viewport?.w || renderer.getDrawingBufferSize(size).y;
  };
  pts.uniforms = mat.uniforms;
  pts.sync = () => { pos.needsUpdate = true; vis.needsUpdate = true; };
  return pts;
}

var _wbF = new THREE6.Vector3(), _wbU = new THREE6.Vector3();
var WbSound = class {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = true;
    this.out = null;
    this.budget = 0;                    // bubbles allowed right now (refills over time): keeps it a trickle, not noise
  }
  _ctx() {
    const c = this.sfx.ensure();
    if (!c || c.state !== "running" || !this.on) return null;
    if (!this.out) {
      // a little room: a short noise-burst convolution reverb, mixed in quietly
      const len = Math.round(c.sampleRate * 0.9), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
      }
      this.verb = c.createConvolver();
      this.verb.buffer = ir;
      const wet = c.createGain();
      wet.gain.value = 0.22;
      this.out = c.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(c.destination);
      this.verb.connect(wet).connect(this.out);
    }
    return c;
  }
  setOn(v) { this.on = v; }
  // a panner at p, feeding the dry out and the reverb
  _at(c, p) {
    const pn = c.createPanner();
    Object.assign(pn, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 0.5, rolloffFactor: 1 });
    if (pn.positionX) { pn.positionX.value = p.x; pn.positionY.value = p.y; pn.positionZ.value = p.z; }
    else pn.setPosition(p.x, p.y, p.z);
    pn.connect(this.out);
    pn.connect(this.verb);
    return pn;
  }
  listener(h, q) {
    const c = this.sfx.ctx;
    if (!c || c.state !== "running") return;
    const L = c.listener, f = _wbF.set(0, 0, -1).applyQuaternion(q), u = _wbU.set(0, 1, 0).applyQuaternion(q);
    if (L.positionX) {
      L.positionX.value = h.x; L.positionY.value = h.y; L.positionZ.value = h.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z;
    } else {
      L.setPosition(h.x, h.y, h.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }
  // one bubble: sine at f0 sweeping up by `rise` over its life, fast attack, exponential ring-out.
  // Small bubbles are high and short, big ones low and longer.
  bubble(p, { f0 = 900, rise = 2, dur = 0.06, gain = 0.25, delay = 0 } = {}) {
    const c = this._ctx();
    if (!c || this.budget <= 0) return;
    this.budget--;
    const t = c.currentTime + 0.005 + delay, o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * rise, t + dur);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g).connect(this._at(c, p));
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  // a random small bubble: drips, trickles
  drip(p, level = 1, delay = 0) {
    const f0 = 600 + Math.random() * 1400;
    this.bubble(p, { f0, rise: 1.6 + Math.random() * 1.6, dur: 0.035 + 90 / f0 * 0.03 * (0.6 + Math.random()), gain: 0.12 * level, delay });
  }
  // a cluster of drips spread over `spread` seconds
  burst(p, n, level = 1, spread = 0.12) {
    for (let i = 0; i < n; i++) this.drip(p, level * (0.5 + Math.random() * 0.6), Math.random() * spread);
  }
  bloop(p) {                                  // grabbing: one big low bubble and a small one after it
    this.budget = Math.max(this.budget, 3);
    this.bubble(p, { f0: 220 + Math.random() * 60, rise: 2.6, dur: 0.14, gain: 0.32 });
    this.bubble(p, { f0: 700, rise: 1.8, dur: 0.05, gain: 0.12, delay: 0.07 });
  }
  plop(p) {                                   // letting go
    this.budget = Math.max(this.budget, 3);
    this.bubble(p, { f0: 380 + Math.random() * 80, rise: 2.2, dur: 0.09, gain: 0.26 });
    this.drip(p, 0.6, 0.05);
  }
  rise(p) {                                   // reform: a chain of bubbles climbing in pitch
    this.budget = Math.max(this.budget, 16);
    for (let i = 0; i < 14; i++) this.bubble(p, { f0: 260 * Math.pow(1.13, i) * (0.9 + Math.random() * 0.2), rise: 2, dur: 0.07, gain: 0.14, delay: i * 0.075 + Math.random() * 0.02 });
  }
};

// water tints: [swatch, rim glow]
var WB_WATER = [[0xa8e2ff, 0x4d9ed9], [0x5fe0d2, 0x1fa89a], [0x4f86ff, 0x2350c8], [0x9dffc4, 0x3fc77d], [0xff9ad8, 0xd04c9a], [0xffc06b, 0xd98a1f]];
// what the water reflects: the chosen sky (brightened) plus two soft light panels, so the reflections are smooth
// and always match the room colour
function wbEnvScene([t, h, b]) {
  const sc = new THREE6.Scene(), lift = (hex, k) => new THREE6.Color(hex).multiplyScalar(k).addScalar(0.06);
  const mat = new THREE6.ShaderMaterial({
    uniforms: { top: { value: lift(t, 1.8) }, mid: { value: lift(h, 1.8) }, bot: { value: lift(b, 1.2) } },
    vertexShader: "varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 top, mid, bot; varying vec3 vDir; void main() { float y = vDir.y; gl_FragColor = vec4(y > 0.0 ? mix(mid, top, pow(y, 0.6)) : mix(mid, bot, pow(-y, 0.45)), 1.0); }",
    side: THREE6.BackSide
  });
  sc.add(new THREE6.Mesh(new THREE6.SphereGeometry(10, 32, 16), mat));
  const panel = (w, hgt, k, pos) => {
    const m = new THREE6.Mesh(new THREE6.PlaneGeometry(w, hgt), new THREE6.MeshBasicMaterial({ color: new THREE6.Color(k, k, k), side: THREE6.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    sc.add(m);
  };
  panel(6, 3, 3.2, [0, 8, 2]);          // soft overhead light
  panel(2.5, 4, 1.8, [-6, 3, 5]);       // window-like key light, front left
  return sc;
}

