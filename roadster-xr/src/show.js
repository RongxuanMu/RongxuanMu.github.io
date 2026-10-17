// - the car's motion: on the ground it follows its heading (or a planned route); on the ramp and in the air
// its whole pose is scripted from the stunt's physics; every pose lands in car.pos / car.q (diorama metres) -
var RnCar = class {
  constructor(group, puffs, smoke) {
    this.g = group;
    this.puffs = puffs;
    this.smoke = smoke;
    this.pos = new THREE6.Vector3();
    this.q = new THREE6.Quaternion();
    this.yaw = 0;
    this.v = 0;
    this.steer = 0;
    this.spin = 0;
    this.suction = 0;
    this.air = false;
    this.held = false;
  }
  place(x, z, yawDeg) {
    this.pos.set(x, 0, z);
    this.setYaw(yawDeg * Math.PI / 180);
    this.v = 0;
    this.air = false;
  }
  setYaw(y) {
    this.yaw = y;
    this.q.setFromAxisAngle(RN_UP, y);
  }
  fwd(out = new THREE6.Vector3()) {
    return out.set(1, 0, 0).applyQuaternion(this.q);
  }
  // a car-frame point (metres) in diorama space
  at(x, y, z, out = new THREE6.Vector3()) {
    return out.set(x, y, z).applyQuaternion(this.q).add(this.pos);
  }
  // cold-gas puffs from a nozzle (car frame) blowing along a car-frame direction
  thrust(nx, ny, nz, dx, dy, dz, rate, dt, speed = 14) {
    const n = Math.min(12, Math.round(rate * dt + Math.random()));
    if (!n) return;
    const p = this.at(nx, ny, nz, _rnV), d = _rnV2.set(dx, dy, dz).applyQuaternion(this.q);
    const carV = this.fwd(new THREE6.Vector3()).multiplyScalar(this.v * 0.6);
    for (let i = 0; i < n; i++) {
      const s = speed * (0.6 + Math.random() * 0.6);
      this.puffs.spawn(p.x, p.y, p.z, d.x * s + carV.x + (Math.random() - 0.5) * 3, d.y * s + carV.y + (Math.random() - 0.5) * 3, d.z * s + carV.z + (Math.random() - 0.5) * 3, 0.5 + Math.random() * 0.5, 0.9, 0.95, 1, 2.6);
    }
  }
  tyreSmoke(rate, dt) {
    const n = Math.min(6, Math.round(rate * dt + Math.random()));
    for (let i = 0; i < n; i++) {
      const p = this.at(-1.4, 0.3, i % 2 ? 0.9 : -0.9, _rnV);
      this.smoke.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 1.2 + Math.random(), 0.42, 0.42, 0.45, 1.2);
    }
  }
  sync(dt) {
    this.g.position.copy(this.pos);
    this.g.quaternion.copy(this.q);
    this.spin += this.v * dt / 0.36;
    for (const w of this.g.userData.wheels) {
      w.spin.rotation.z = -this.spin;
      w.steer.rotation.y = w.front ? this.steer * 0.45 : 0;
    }
    const gl = this.g.userData.glow;
    gl.material.opacity += ((this.suction ? 0.55 : 0) - gl.material.opacity) * Math.min(1, dt * 8);
  }
};
// - a ground route through waypoints [x, z, headingDeg]: Hermite curves sampled every ~0.5 m, then a speed
// profile limited by grip on the bends and by acceleration / braking -
function rnRoute(car, wps, { vmax = 14, acc = 7, dec = 9, grip = 9, v1 = 0 } = {}) {
  const pts = [], P = [[car.pos.x, car.pos.z, car.yaw * 180 / Math.PI], ...wps];
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az, ah] = P[i], [bx, bz, bh] = P[i + 1], d = Math.hypot(bx - ax, bz - az), k = d * 1.1;
    const ta = [Math.cos(ah * Math.PI / 180) * k, -Math.sin(ah * Math.PI / 180) * k], tb = [Math.cos(bh * Math.PI / 180) * k, -Math.sin(bh * Math.PI / 180) * k];
    const n = Math.max(4, Math.ceil(d / 0.5));
    for (let j = i ? 1 : 0; j <= n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t, h1 = 2 * t3 - 3 * t2 + 1, h2 = t3 - 2 * t2 + t, h3 = -2 * t3 + 3 * t2, h4 = t3 - t2;
      pts.push([h1 * ax + h2 * ta[0] + h3 * bx + h4 * tb[0], h1 * az + h2 * ta[1] + h3 * bz + h4 * tb[1]]);
    }
  }
  return rnProfile(car, pts, { vmax, acc, dec, grip, v1 });
}
function rnProfile(car, pts, { vmax = 14, acc = 7, dec = 9, grip = 9, v1 = 0 } = {}) {
  const s = [0], hd = [];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    hd.push(Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  }
  const v = pts.map((_, i) => {
    const j = Math.min(pts.length - 1, i + 2), k = Math.max(0, i - 2), ds = s[j] - s[k];
    const kap = ds > 1e-6 ? Math.abs(RN_WRAP(hd[j] - hd[k])) / ds : 0;
    return Math.min(vmax, Math.sqrt(grip / Math.max(kap, 1e-4)));
  });
  v[0] = Math.min(v[0], Math.max(Math.abs(car.v), 0));
  for (let i = 1; i < v.length; i++) v[i] = Math.min(v[i], Math.sqrt(v[i - 1] ** 2 + 2 * acc * (s[i] - s[i - 1])));
  v[v.length - 1] = Math.min(v[v.length - 1], v1);
  for (let i = v.length - 2; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] ** 2 + 2 * dec * (s[i + 1] - s[i])));
  return { pts, s, hd, v, L: s[s.length - 1] };
}
// - avoiding things: an occupancy grid (1 m cells) of everything on the pad, grown by a clearance margin; A*
// across it, the path pulled taut, its corners rounded, then checked again -
var RN_POSTS = [[RN_LAUNCH.x0 + 2.3, RN_LAUNCH.z - 3.4, 0.4], [RN_LAUNCH.x0 + 2.3, RN_LAUNCH.z + 3.4, 0.4], ...[200, 232, 312, 340].map((d) => [Math.cos(d * Math.PI / 180) * 49, Math.sin(d * Math.PI / 180) * 49, 0.6])];
function rnClear(x, z, m, lineup) {
  const r = Math.hypot(x, z), L = RN_LOOP;
  if (r > RN_PAD_R - 2.5 - m) return false;
  const a = (Math.atan2(z, x) * 180 / Math.PI + 360) % 360, da = m / Math.max(r, 1) * 180 / Math.PI;
  if (r > 37 - m && a > 243 - da && a < 301 + da) return false;
  if (Math.hypot(x + 32.1, z + 35.7) < 7 + m) return false;
  if (x > L.x - 1.8 - m && x < L.x + L.R + 1 + m && Math.abs(z - L.z) < 4.8 + m) return false;
  for (const [px, pz, pr] of RN_POSTS) if (Math.hypot(x - px, z - pz) < pr + m) return false;
  for (const v of lineup) if (x > v.x0 - m && x < v.x1 + m && z > v.z0 - m && z < v.z1 + m) return false;
  return true;
}
var rnGrids = /* @__PURE__ */ new Map();
function rnGrid(m, lineup) {
  if (!rnGrids.has(m)) {
    const N = 2 * RN_PAD_R, g = new Uint8Array(N * N);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) g[i * N + j] = rnClear(i - RN_PAD_R + 0.5, j - RN_PAD_R + 0.5, m, lineup) ? 1 : 0;
    rnGrids.set(m, g);
  }
  return rnGrids.get(m);
}
function rnSegClear(a, b, m, lineup) {
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4);
  for (let k = 0; k <= n; k++) if (!rnClear(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, m, lineup)) return false;
  return true;
}
// a collision-free path [[x, z], ...] from (x0, z0) to (x1, z1), or null
function rnPlan(x0, z0, x1, z1, lineup, m = 1.8) {
  const N = 2 * RN_PAD_R, H = RN_PAD_R, g = rnGrid(m, lineup);
  const cell = (x, z) => [Math.max(0, Math.min(N - 1, Math.floor(x + H))), Math.max(0, Math.min(N - 1, Math.floor(z + H)))];
  // a start or goal inside the margin snaps to the nearest free cell
  const nearest = (x, z) => {
    const [ci, cj] = cell(x, z);
    for (let r = 0; r < 12; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < N && j < N && g[i * N + j]) return i * N + j;
    }
    return -1;
  };
  // a goal inside something becomes the nearest spot the whole car (not just its middle) fits in
  if (!rnClear(x1, z1, m * 0.6, lineup)) {
    const g2 = rnGrid(m + 1.2, lineup), [ci, cj] = cell(x1, z1);
    let best = null;
    for (let r = 0; r < 14 && !best; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      const i = ci + di, j = cj + dj;
      if (Math.max(Math.abs(di), Math.abs(dj)) === r && i >= 0 && j >= 0 && i < N && j < N && g2[i * N + j] && !best) best = [i - H + 0.5, j - H + 0.5];
    }
    if (best) [x1, z1] = best;
  }
  const S = nearest(x0, z0), G = nearest(x1, z1);
  if (S < 0 || G < 0) return null;
  const gi = Math.floor(G / N), gj = G % N, hcost = (k) => {
    const di = Math.abs(Math.floor(k / N) - gi), dj = Math.abs(k % N - gj);
    return di + dj + (Math.SQRT2 - 2) * Math.min(di, dj);
  };
  const cost = new Float32Array(N * N).fill(Infinity), from = new Int32Array(N * N).fill(-1), heap = [[hcost(S), S]];
  cost[S] = 0;
  const push = (e) => {
    heap.push(e);
    for (let i = heap.length - 1; i > 0; ) {
      const p = i - 1 >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1, r = l + 1;
        let k = i;
        if (l < heap.length && heap[l][0] < heap[k][0]) k = l;
        if (r < heap.length && heap[r][0] < heap[k][0]) k = r;
        if (k === i) break;
        [heap[k], heap[i]] = [heap[i], heap[k]];
        i = k;
      }
    }
    return top;
  };
  while (heap.length) {
    const [, k] = pop();
    if (k === G) break;
    const i = Math.floor(k / N), j = k % N;
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = ni * N + nj;
      if (!g[nk] || di && dj && !(g[i * N + nj] && g[ni * N + j])) continue;
      const c = cost[k] + (di && dj ? Math.SQRT2 : 1);
      if (c < cost[nk]) {
        cost[nk] = c;
        from[nk] = k;
        push([c + hcost(nk), nk]);
      }
    }
  }
  if (from[G] < 0 && G !== S) return null;
  const cells = [];
  for (let k = G; k >= 0; k = from[k]) cells.unshift([Math.floor(k / N) - H + 0.5, k % N - H + 0.5]);
  // the real start and goal, unless they sit inside something (then the nearest free cell stands in)
  if (rnClear(x0, z0, m * 0.6, lineup)) cells[0] = [x0, z0];
  else cells.unshift([x0, z0]);
  if (rnClear(x1, z1, m * 0.6, lineup)) cells[cells.length - 1] = [x1, z1];
  // pulled taut: from each kept point, jump to the farthest one still in clear sight
  const taut = [cells[0]];
  for (let i = 0; i < cells.length - 1; ) {
    let j = cells.length - 1;
    while (j > i + 1 && !rnSegClear(cells[i], cells[j], m * 0.85, lineup)) j--;
    taut.push(cells[j]);
    i = j;
  }
  // rounded corners (Chaikin), kept only where they stay clear
  let pts = taut;
  for (let it = 0; it < 3; it++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      if (i > 0) out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
      if (i < pts.length - 2) out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    if (out.every((p, i) => i === 0 || rnSegClear(out[i - 1], p, m * 0.6, lineup))) pts = out;
    else break;
  }
  // even spacing for the follower
  const dense = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
    for (let k = 1; k <= n; k++) dense.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  return dense;
}
function* rnFollow(car, route) {
  let d = 0, i = 0;
  const { pts, s, hd, v, L } = route;
  while (d < L - 1e-3) {
    const dt = yield;
    while (i < s.length - 2 && s[i + 1] < d) i++;
    const t = THREE6.MathUtils.clamp((d - s[i]) / Math.max(s[i + 1] - s[i], 1e-6), 0, 1);
    const sp = Math.max(v[i] + (v[i + 1] - v[i]) * t, d < L - 0.3 ? 1.2 : 0.4);
    car.v = sp;
    car.pos.set(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, 0, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t);
    const h = hd[i] + RN_WRAP(hd[i + 1] - hd[i]) * t;
    car.steer = THREE6.MathUtils.clamp(RN_WRAP(h - car.yaw) / Math.max(dt, 1e-3) * 0.25, -1, 1);
    car.setYaw(h);
    d += sp * dt;
  }
  car.v = v[v.length - 1];
  car.steer = 0;
}
function* rnWait(sec) {
  let t = 0;
  while (t < sec) t += yield;
}
// straight-line motion along the heading with an acceleration profile a(v, x) until done(v, x) (both in metres)
function* rnStraight(car, accel, done, onStep = null) {
  const f = car.fwd(new THREE6.Vector3());
  while (true) {
    const dt = yield;
    car.v = Math.max(0, car.v + accel(car) * dt);
    car.pos.addScaledVector(f, car.v * dt);
    car.steer *= 0.9;
    onStep?.(dt);
    if (done(car)) return;
  }
}
// in the air: ballistic, cold-gas burns (lift until `liftFor` s, roll about the car's long axis by `roll` rad),
// then a landing burn timed so it touches down softly; returns once it is back on its wheels
// level: seconds to right the car from however it was let go (heading kept) before it may touch down
function* rnFly(car, { vx, vz = 0, vy = 0, lift = 0, liftFor = 0, roll = 0, rollFrom = 0, rollFor = 1, onPuff = null, sound = null, level = 0 }) {
  car.air = true;
  const q0 = car.q.clone(), axis = new THREE6.Vector3(1, 0, 0), vel = new THREE6.Vector3(vx, vy, vz);
  let qL = null;
  if (level) {
    // the heading: the nose's direction on the ground, or the roof's when it was let go nose-up or nose-down
    const f = car.fwd(new THREE6.Vector3());
    if (Math.hypot(f.x, f.z) < 0.25) f.set(0, -1, 0).applyQuaternion(q0).multiplyScalar(Math.sign(f.y) || 1);
    qL = new THREE6.Quaternion().setFromAxisAngle(RN_UP, Math.atan2(-f.z, f.x));
  }
  let t = 0, burning = false;
  const LAND = 14;
  while (true) {
    const dt = yield;
    t += dt;
    let ay = -RN_G;
    const lifting = t < liftFor;
    if (lifting) ay += lift;
    // landing burn: start when the burn can just stop the fall at the ground
    const stop = vel.y < 0 ? (vel.y * vel.y - 2) / (2 * LAND) : 0;
    if (!lifting && vel.y < 0 && car.pos.y <= stop + 0.4) burning = true;
    if (burning) ay += RN_G + LAND;
    vel.y += ay * dt;
    if (burning && vel.y > -1.3) vel.y = -1.3;
    // air drag, and a hard brake from the side thrusters near the pad's edge
    const k = Math.hypot(car.pos.x, car.pos.z) > RN_PAD_R - 6 ? 2.5 : 0.04;
    vel.x *= 1 - k * dt;
    vel.z *= 1 - k * dt;
    car.pos.addScaledVector(vel, dt);
    // righting itself on the pad: it rests there instead of sinking through
    if (qL && car.pos.y < 0) car.pos.y = 0, vel.y = 0;
    car.v = Math.hypot(vel.x, vel.z);
    const rt = THREE6.MathUtils.clamp((t - rollFrom) / rollFor, 0, 1), e = rt * rt * (3 - 2 * rt);
    car.q.copy(q0).multiply(_rnQ.setFromAxisAngle(axis, roll * e));
    if (qL) {
      const u = Math.min(1, t / level);
      car.q.slerpQuaternions(q0, qL, u * u * (3 - 2 * u));
    }
    // puffs: under the car while lifting or braking the fall, from the flanks while rolling
    if (lifting || burning) {
      for (const [x, z] of [[1.6, 0.8], [1.6, -0.8], [-1.6, 0.8], [-1.6, -0.8]]) car.thrust(x, 0.1, z, 0, -1, 0, 70, dt, 16);
      sound?.hiss(lifting ? 0.8 : 0.6);
    }
    if (rt > 0 && rt < 1) {
      car.thrust(0, 0.6, 1.0, 0, 0, 1, 50, dt);
      car.thrust(0, 0.6, -1.0, 0, 0, -1, 50, dt);
      sound?.hiss(0.5);
    }
    onPuff?.(dt, t);
    if (car.pos.y <= 0 && vel.y <= 0 && t > Math.max(0.2, level)) {
      car.pos.y = 0;
      car.air = false;
      // back on four wheels: keep the heading, drop pitch and roll
      const f = car.fwd(_rnV);
      car.setYaw(Math.atan2(-f.z, f.x));
      sound?.thud();
      return;
    }
  }
}
// - the show: four acts on a loop -
var RN_ACTS = [
  { id: "launch", label: "0–60", caption: "0–60 mph in 0.81 s · rear cold-gas thrusters" },
  { id: "loop", label: "Curl ramp", caption: "Up the curl ramp · suction fans hold it upside down" },
  { id: "jump", label: "Jump", caption: "A thruster hop over a Cybercab, Cybertruck, Semi, Model Y and Model 3" },
  { id: "finale", label: "Finale", caption: "Production 2028 · about 300 mi range · over 230 mph" }
];
function* rnActLaunch(W) {
  const car = W.car, LA = RN_LAUNCH;
  W.caption("Launch night · SpaceX test site, McGregor, Texas · 15 Oct 2026");
  W.screen({ title: "ROADSTER", sub: "0–60 MPH" });
  if (Math.hypot(car.pos.x - LA.x0, car.pos.z - LA.z) > 1 || Math.cos(car.yaw) < 0.95) yield* rnFollow(car, rnRoute(car, rnRouteTo(car, LA.x0, LA.z), { vmax: 13 }));
  car.place(LA.x0, LA.z, 0);
  W.caption(RN_ACTS[0].caption);
  yield* rnWait(0.6);
  // three red lamps, then go
  for (let i = 0; i < 3; i++) {
    W.lamp(i, 16720418);
    W.sound.beep(440, 0.12);
    yield* rnWait(0.55);
  }
  W.lamps(5635925);
  W.sound.beep(880, 0.35);
  W.sound.whoosh();
  const t0 = W.clock;
  let split = 0;
  const x0 = car.pos.x;
  yield* rnStraight(car, (c) => c.pos.x < -6 ? (c.v < 26.82 ? 33.1 : 20) : -26, (c) => c.v <= 0 && c.pos.x > -6, (dt) => {
    const el = W.clock - t0;
    if (!split && car.v >= 26.82) {
      split = el;
      W.sound.ding();
    }
    W.screen({ title: split ? "0.81 s" : `${el.toFixed(2)} s`, sub: `${Math.round(car.v * 2.237)} MPH`, big: true });
    if (el < 1.2) car.thrust(-2.35, 0.48, 0, -1, 0, 0, 140, dt, 18), car.thrust(-2.35, 0.48, 0.42, -1, 0, 0, 60, dt, 18), W.sound.hiss(1);
    if (car.pos.x - x0 < 3) car.tyreSmoke(40, dt);
  });
  W.lamps(3342336);
  W.screen({ title: "0.81 s", sub: "0–60 MPH", big: true });
  W.cheer(0.7);
  yield* rnWait(1.6);
}
function* rnActLoop(W) {
  const car = W.car, L = RN_LOOP;
  W.caption("Lining up for the curl ramp");
  W.screen({ title: "CURL RAMP", sub: "SUCTION + THRUST" });
  yield* rnFollow(car, rnRoute(car, rnRouteTo(car, -40, L.z), { vmax: 13 }));
  yield* rnLoopRun(W, 22);
}
// waypoints from wherever the car is to (x, z) heading +x on the left side of the course: swing round into a
// corridor that stays clear of the stunts (front z = 6, back z = -15), run left along it, U-turn at the left end
function rnRouteTo(car, x, z) {
  const p = car.pos, c = Math.cos(car.yaw), zc = z > -12 ? 6 : -15, out = [];
  const lim = (zz) => Math.sqrt(Math.max(0, 47 * 47 - zz * zz));
  if (!(c < -0.3 && p.x < -28)) {
    if (c > 0.3) {
      const zm = (p.z + zc) / 2, xr = Math.min(p.x + 7, lim(zm) - 1);
      out.push([xr, zm, zc < p.z ? 90 : -90], [Math.min(p.x, xr - 9), zc, 180]);
    } else out.push([p.x - 7, zc, 180]);
  }
  if (out.length === 0 || out[out.length - 1][0] > -30) out.push([-34, zc, 180]);
  out.push([-44, (zc + z) / 2, z > zc ? -90 : 90], [x, z, 0]);
  return out;
}
// the curl-ramp stunt from the run-in: up the half loop clinging by suction, off the top upside down, a 180°
// roll in the air and a thruster-eased landing on the pad below
function* rnLoopRun(W, vIn) {
  const car = W.car, L = RN_LOOP;
  W.caption(RN_ACTS[1].caption);
  car.setYaw(0);
  car.pos.z = L.z;
  yield* rnStraight(car, (c) => c.v < vIn ? 9 : 0, (c) => c.pos.x >= L.x, (dt) => W.sound.hiss(0));
  car.suction = 1;
  let th = -Math.PI / 2;
  const v0 = Math.max(car.v, vIn), f = new THREE6.Vector3(), u = new THREE6.Vector3(), r = new THREE6.Vector3();
  while (th < Math.PI / 2) {
    const dt = yield;
    const h = L.R + L.R * Math.sin(th);
    car.v = Math.max(9, Math.sqrt(Math.max(0, v0 * v0 - 2 * RN_G * h)));
    th = Math.min(Math.PI / 2, th + car.v * dt / L.R);
    rnLoopPoint(th, car.pos);
    f.set(-Math.sin(th), Math.cos(th), 0);
    u.set(-Math.cos(th), -Math.sin(th), 0);
    r.crossVectors(f, u);
    car.q.setFromRotationMatrix(_rnM.makeBasis(f, u, r));
    car.thrust(-0.2, 0.05, 0, -u.x, -u.y, 0, 30, dt, 6);
  }
  car.suction = 0;
  W.caption("Off the top · rolls 180° · thrusters ease the landing");
  yield* rnFly(car, { vx: -car.v, roll: Math.PI, rollFrom: 0.15, rollFor: 0.9, sound: W.sound });
  car.setYaw(Math.PI);
  W.cheer(1);
  yield* rnStraight(car, () => -9, (c) => c.v <= 0);
  yield* rnWait(1.2);
}
function* rnActJump(W) {
  const car = W.car, J = RN_JUMP;
  W.caption("Lining up for the line-up");
  W.screen({ title: "THRUST", sub: "10 COLD-GAS THRUSTERS" });
  yield* rnFollow(car, rnRoute(car, rnRouteTo(car, J.x0, J.z), { vmax: 13 }));
  W.caption(RN_ACTS[2].caption);
  yield* rnStraight(car, (c) => c.v < 10 ? 5 : 0, (c) => c.pos.x >= J.take);
  yield* rnHop(W, { roll: Math.PI * 2 });
  W.cheer(1);
  yield* rnStraight(car, () => -8, (c) => c.v <= 0);
  yield* rnWait(1);
}
// a thruster hop from wherever it is rolling: lift, a full barrel roll at the top, eased landing
function* rnHop(W, { roll = Math.PI * 2, lift = RN_G + 14, liftFor = 0.8 } = {}) {
  const car = W.car, f = car.fwd(new THREE6.Vector3()), v = Math.max(car.v, 4);
  W.sound.whoosh();
  yield* rnFly(car, { vx: f.x * v, vz: f.z * v, lift, liftFor, roll, rollFrom: liftFor + 0.3, rollFor: 1.1, sound: W.sound });
  car.v = v;
}
function* rnActFinale(W) {
  const car = W.car;
  W.caption("Finale");
  W.screen({ title: "ROADSTER", sub: "2028" });
  const p = car.pos, wp = Math.cos(car.yaw) > 0.3 ? [[Math.min(p.x + 3, Math.sqrt(47 * 47 - 15 * 15) - 1), Math.max(p.z + 7, -15), -90]] : [];
  yield* rnFollow(car, rnRoute(car, wp.concat([[24, 2, 180], [12, 2, 180]]), { vmax: 13, v1: 6 }));
  // donuts about a point on its left, nose in, tail out, in vapour and tyre smoke
  const c = car.at(0, 0, -3.2, new THREE6.Vector3()), R = 3.2;
  let a = Math.atan2(car.pos.z - c.z, car.pos.x - c.x), t = 0;
  W.fireworks(true);
  W.cheer(1.4);
  while (t < 6) {
    const dt = yield;
    t += dt;
    const w = Math.min(2.4, 0.6 + t * 1.2);
    a -= w * dt;
    car.pos.set(c.x + Math.cos(a) * R, 0, c.z + Math.sin(a) * R);
    car.setYaw(Math.PI / 2 - a + 0.9);
    car.v = w * R;
    car.steer = 1;
    car.tyreSmoke(60, dt);
    car.thrust(-2.35, 0.48, 0, -1, 0, 0, 40, dt, 10);
    W.sound.hiss(0.4);
  }
  car.steer = 0;
  W.caption(RN_ACTS[3].caption);
  W.screen({ title: "ROADSTER", sub: "2028 · 300 MI · 230+ MPH" });
  yield* rnFollow(car, rnRoute(car, [[0, 8, -90]], { vmax: 6 }));
  for (let i = 0; i < 3; i++) {
    W.flash(1);
    yield* rnWait(0.25);
    W.flash(0);
    yield* rnWait(0.2);
  }
  yield* rnWait(2.5);
  W.fireworks(false);
}
var RN_ACT_GENS = { launch: rnActLaunch, loop: rnActLoop, jump: rnActJump, finale: rnActFinale };
function* rnShow(W, from = 0) {
  for (let i = from; ; i = (i + 1) % RN_ACTS.length) {
    W.onAct(i);
    yield* RN_ACT_GENS[RN_ACTS[i].id](W);
  }
}
// - sound: an electric whine with the speed, cold-gas hiss, countdown beeps, crowd swells - all synthesised -
var RnSound = class {
  constructor(app) {
    this.app = app;
    this.on = true;
    this.c = null;
    this.hissLevel = 0;
  }
  _ctx() {
    if (!this.on) return null;
    const c = this.app.sfx?.ctx;
    if (!c || c.state !== "running") return null;
    if (this.c !== c) this._graph(c);
    return c;
  }
  _graph(c) {
    this.c = c;
    this.out = c.createGain();
    this.out.gain.value = 0.5;
    this.out.connect(c.destination);
    const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = noise;
    // motor: two detuned oscillators through a low-pass, pitch with speed
    this.m1 = c.createOscillator();
    this.m1.type = "sawtooth";
    this.m2 = c.createOscillator();
    this.m2.type = "sine";
    this.mf = c.createBiquadFilter();
    this.mf.type = "lowpass";
    this.mf.frequency.value = 900;
    this.mg = c.createGain();
    this.mg.gain.value = 0;
    this.m1.connect(this.mf);
    this.m2.connect(this.mf);
    this.mf.connect(this.mg).connect(this.out);
    this.m1.start();
    this.m2.start();
    // hiss: looped noise through a band-pass, level follows the thrusters
    const src = c.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value = 0.7;
    this.hg = c.createGain();
    this.hg.gain.value = 0;
    src.connect(bp).connect(this.hg).connect(this.out);
    src.start();
  }
  update(speed, dt) {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime, s = Math.abs(speed);
    this.m1.frequency.setTargetAtTime(40 + s * 9, t, 0.05);
    this.m2.frequency.setTargetAtTime(300 + s * 38, t, 0.05);
    this.mg.gain.setTargetAtTime(s > 0.3 ? Math.min(0.09, 0.02 + s * 3e-3) : 0, t, 0.08);
    this.hg.gain.setTargetAtTime(this.hissLevel * 0.22, t, 0.04);
    this.hissLevel = Math.max(0, this.hissLevel - dt * 6);
  }
  hiss(level) {
    this.hissLevel = Math.max(this.hissLevel, level);
  }
  _tone(f, dur, gain = 0.12, type = "sine", slide = 0) {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  beep(f, dur) {
    this._tone(f, dur, 0.1, "square");
  }
  ding() {
    this._tone(1320, 0.5, 0.08);
    this._tone(1980, 0.5, 0.05);
  }
  whoosh() {
    this._noise(0.8, 600, 4e3, 0.25);
  }
  thud() {
    this._tone(90, 0.25, 0.25, "sine", 0.5);
  }
  cheer(len = 3, gain = 0.18) {
    this._noise(len, 900, 1400, gain, 0.6);
  }
  _noise(dur, f0, f1, gain, attack = 0.02) {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise;
    bp.type = "bandpass";
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    s.connect(bp).connect(g).connect(this.out);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }
  stop() {
    try {
      this.m1?.stop();
      this.m2?.stop();
      this.out?.disconnect();
    } catch (e) {
    }
    this.c = null;
  }
};
