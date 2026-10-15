// 6 - jelly: an XPBD lattice with stretch / shear / body-diagonal links, plus a gentle shape-matching pull (Mueller
// 2005) toward its rest shape. Links alone are equally happy with a folded, inside-out block: a drop, a squash or a
// jump used to flatten it for good. The visible block is skinned onto the lattice
PC_EXHIBITS.push({
  id: "jelly",
  label: "Jelly",
  title: "Jelly",
  blurb: "A soft body on 125 points · grab a corner and stretch, throw it, poke it with a fingertip",
  build(X) {
    const T = THREE6, n = 5, S = 0.08, sp = S / (n - 1), N = n * n * n;
    const x = new Float32Array(N * 3), p0 = new Float32Array(N * 3), v = new Float32Array(N * 3), w = new Float32Array(N).fill(1);
    const id = (i, j, k) => (i * n + j) * n + k;
    const reset = (lift = 0) => {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) x.set([-S / 2 + i * sp, j * sp + 1e-3 + lift, -S / 2 + k * sp], id(i, j, k) * 3);
      v.fill(0);
    };
    reset();
    // rest shape about the centre of mass, and the rotation found last time (warm start)
    const r0 = new Float32Array(N * 3), rq = new T.Quaternion();
    for (let i = 0; i < N * 3; i++) r0[i] = x[i] - (i % 3 === 1 ? S / 2 + 1e-3 : 0);
    const C = [];
    const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1]];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) for (const [a, b, c] of dirs) {
      const i2 = i + a, j2 = j + b, k2 = k + c;
      if (i2 < 0 || j2 < 0 || k2 < 0 || i2 >= n || j2 >= n || k2 >= n) continue;
      C.push([id(i, j, k), id(i2, j2, k2), Math.hypot(a, b, c) * sp]);
    }
    let comp = 1.2e-4, held = [];
    const geo = new T.BoxGeometry(S, S, S, 10, 10, 10);
    // each render vertex: its lattice cell and trilinear weights
    const P = geo.attributes.position, skin = [];
    for (let q = 0; q < P.count; q++) {
      const u = [P.getX(q), P.getY(q) + S / 2, P.getZ(q)].map((c, a) => (c + (a === 1 ? 0 : S / 2)) / sp);
      const c0 = u.map((c) => Math.min(n - 2, Math.max(0, Math.floor(c))));
      skin.push([c0, u.map((c, a) => c - c0[a])]);
    }
    const at = (c0, f, out) => {
      out.set(0, 0, 0);
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
        const wt = (a ? f[0] : 1 - f[0]) * (b ? f[1] : 1 - f[1]) * (c ? f[2] : 1 - f[2]), k = id(c0[0] + a, c0[1] + b, c0[2] + c) * 3;
        out.x += x[k] * wt;
        out.y += x[k + 1] * wt;
        out.z += x[k + 2] * wt;
      }
      return out;
    };
    const mat = new T.MeshStandardMaterial({ color: 16733047, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.86, envMap: pcEnv, envMapIntensity: 0.6 });
    const mesh = new T.Mesh(geo, mat);
    mesh.name = "jelly";
    mesh.frustumCulled = false;
    X.root.add(mesh);
    // a face, riding on the skin
    const face = [[0.3, 0.68], [0.7, 0.68]].map(([fx, fy]) => {
      const e = new T.Mesh(new T.SphereGeometry(4.5e-3, 12, 8), new T.MeshBasicMaterial({ color: 1118481 }));
      e.userData.noCollider = e.userData.noHighlight = true;
      X.root.add(e);
      const u = [fx * (n - 1), fy * (n - 1), n - 1 + 0.02];
      const c0 = u.map((c) => Math.min(n - 2, Math.floor(c)));
      return { e, c0, f: u.map((c, a) => c - c0[a]) };
    });
    const it = X.add(mesh, { precise: true, highlight: false, box: new T.Box3(new T.Vector3(-0.25, 0, -0.25), new T.Vector3(0.25, 0.45, 0.25)) });
    const target = new T.Vector3();
    it.on("press", (e) => {
      const p = X.local(e.point);
      held = [];
      let best = 1, bi = 0;
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(x[i * 3] - p.x, x[i * 3 + 1] - p.y, x[i * 3 + 2] - p.z);
        if (d < 0.028) held.push([i, x[i * 3] - p.x, x[i * 3 + 1] - p.y, x[i * 3 + 2] - p.z]);
        if (d < best) best = d, bi = i;
      }
      if (!held.length) held.push([bi, 0, 0, 0]);
      target.copy(p);
    });
    it.on("drag", (e) => target.copy(X.local(e.point)));
    it.on("release", () => {
      for (const [i] of held) w[i] = 1;
      held = [];
    });
    X.action("Drop", () => reset(0.22));
    X.action("Jump", () => {
      for (let i = 0; i < N; i++) v[i * 3 + 1] += 1.6 + (x[i * 3] > 0 ? 0.3 : 0);
    });
    X.action("Firm", (on) => comp = on ? 8e-6 : 1.2e-4, { toggle: true });
    X.action("Reset", () => reset());
    const SUB = 16, tmp = new T.Vector3();
    // shape matching: the best rotation of the rest shape onto the current one (Mueller et al. 2016, robust to
    // inverted shapes: it always returns a proper rotation), then every point moves part way to its goal
    const A = new Float64Array(9), R = new T.Matrix4(), dq = new T.Quaternion(), om = new T.Vector3(), rc = new T.Vector3(), ac = new T.Vector3();
    const shapeMatch = (k) => {
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < N; i++) cx += x[i * 3], cy += x[i * 3 + 1], cz += x[i * 3 + 2];
      cx /= N, cy /= N, cz /= N;
      A.fill(0);
      for (let i = 0; i < N; i++) {
        const px = x[i * 3] - cx, py = x[i * 3 + 1] - cy, pz = x[i * 3 + 2] - cz, ax = r0[i * 3], ay = r0[i * 3 + 1], az = r0[i * 3 + 2];
        A[0] += px * ax, A[1] += px * ay, A[2] += px * az, A[3] += py * ax, A[4] += py * ay, A[5] += py * az, A[6] += pz * ax, A[7] += pz * ay, A[8] += pz * az;
      }
      for (let it2 = 0; it2 < 6; it2++) {
        const e = R.makeRotationFromQuaternion(rq).elements;
        om.set(0, 0, 0);
        let den = 0;
        for (let j = 0; j < 3; j++) {
          rc.set(e[j * 4], e[j * 4 + 1], e[j * 4 + 2]);
          ac.set(A[j], A[3 + j], A[6 + j]);
          den += rc.dot(ac);
          om.add(rc.cross(ac));
        }
        om.multiplyScalar(1 / (Math.abs(den) + 1e-9));
        const wl = om.length();
        if (wl < 1e-9) break;
        rq.premultiply(dq.setFromAxisAngle(om.divideScalar(wl), wl)).normalize();
      }
      const e = R.makeRotationFromQuaternion(rq).elements;
      for (let i = 0; i < N; i++) {
        if (!w[i]) continue;
        const ax = r0[i * 3], ay = r0[i * 3 + 1], az = r0[i * 3 + 2], k3 = i * 3;
        x[k3] += (cx + e[0] * ax + e[4] * ay + e[8] * az - x[k3]) * k;
        x[k3 + 1] += (cy + e[1] * ax + e[5] * ay + e[9] * az - x[k3 + 1]) * k;
        x[k3 + 2] += (cz + e[2] * ax + e[6] * ay + e[10] * az - x[k3 + 2]) * k;
      }
    };
    return {
      update(dt) {
        const h = dt / SUB, a2 = 1 / (h * h), tips = X.tips(), ksm = 1 - Math.exp(-12 * h);
        for (let s = 0; s < SUB; s++) {
          for (let i = 0; i < N; i++) {
            const k = i * 3;
            p0[k] = x[k];
            p0[k + 1] = x[k + 1];
            p0[k + 2] = x[k + 2];
            v[k + 1] -= PC_G * h;
            x[k] += v[k] * h;
            x[k + 1] += v[k + 1] * h;
            x[k + 2] += v[k + 2] * h;
          }
          for (const [i, ox, oy, oz] of held) {
            w[i] = 0;
            x.set([target.x + ox, target.y + oy, target.z + oz], i * 3);
          }
          for (const [a, b, rest] of C) {
            const wa = w[a], wb = w[b], ws = wa + wb;
            if (!ws) continue;
            const ka = a * 3, kb = b * 3, dx = x[ka] - x[kb], dy = x[ka + 1] - x[kb + 1], dz = x[ka + 2] - x[kb + 2];
            const len = Math.hypot(dx, dy, dz);
            if (len < 1e-9) continue;
            const lam = -(len - rest) / (ws + comp * a2) / len;
            x[ka] += dx * lam * wa;
            x[ka + 1] += dy * lam * wa;
            x[ka + 2] += dz * lam * wa;
            x[kb] -= dx * lam * wb;
            x[kb + 1] -= dy * lam * wb;
            x[kb + 2] -= dz * lam * wb;
          }
          shapeMatch(ksm);
          for (let i = 0; i < N; i++) {
            const k = i * 3;
            if (x[k + 1] < 0) {
              // the plate: no sinking, and friction holds the contact still
              x[k + 1] = 0;
              x[k] = p0[k] + (x[k] - p0[k]) * 0.3;
              x[k + 2] = p0[k + 2] + (x[k + 2] - p0[k + 2]) * 0.3;
            }
            const r2 = x[k] * x[k] + x[k + 2] * x[k + 2];
            if (r2 > (PC_PLATE_R - 0.01) ** 2 && x[k + 1] < 0.02) {
              const f = (PC_PLATE_R - 0.01) / Math.sqrt(r2);
              x[k] *= f;
              x[k + 2] *= f;
            }
            for (const tp of tips) {
              const dx = x[k] - tp.x, dy = x[k + 1] - tp.y, dz = x[k + 2] - tp.z, d = Math.hypot(dx, dy, dz), rr = 0.022;
              if (d < rr && d > 1e-9) {
                x[k] = tp.x + dx / d * rr;
                x[k + 1] = tp.y + dy / d * rr;
                x[k + 2] = tp.z + dz / d * rr;
              }
            }
          }
          for (let i = 0; i < N * 3; i++) v[i] = (x[i] - p0[i]) / h * 0.9996;
        }
        for (let q = 0; q < P.count; q++) {
          at(skin[q][0], skin[q][1], tmp);
          P.setXYZ(q, tmp.x, tmp.y, tmp.z);
        }
        P.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
        for (const f of face) at(f.c0, f.f, f.e.position);
      }
    };
  }
});
// 7 - spinning top: a rigid body on a fixed tip, Euler's equations with gravity torque (precession, nutation)
PC_EXHIBITS.push({
  id: "top",
  label: "Spinning top",
  title: "Spinning top",
  blurb: "Gravity tilts it, spin turns the tilt into precession · tap to spin, drag the handle to tip it",
  build(X) {
    const T = THREE6, m = 0.06, l = 0.026, I1 = 0.25 * m * 0.03 ** 2 + m * l * l, I3 = 0.5 * m * 0.03 ** 2, TIP = new T.Vector3(0, 0.012, 0);
    X.root.add(new T.Mesh(new T.CylinderGeometry(0.05, 0.06, 0.012, 48), PC_MAT.dark()).translateY(6e-3));
    const prof = [[0, 0], [4e-3, 5e-3], [0.026, 0.02], [0.032, 0.026], [0.03, 0.031], [0.014, 0.036], [4e-3, 0.038], [3.5e-3, 0.06], [0, 0.062]].map(([r, y]) => new T.Vector2(Math.max(r, 1e-4), y));
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 64;
    const g = cv.getContext("2d");
    ["#e8483b", "#f4d35e", "#2b7bb9", "#f2efe6", "#3da35d", "#f4d35e", "#e8483b", "#f2efe6"].forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(i * 64, 0, 64, 64);
    });
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const body = new T.Mesh(new T.LatheGeometry(prof, 48), new T.MeshStandardMaterial({ map: tex, roughness: 0.35 }));
    const top = new T.Group();
    top.name = "top";
    top.position.copy(TIP);
    top.add(body);
    X.root.add(top);
    const q = new T.Quaternion(), Lm = new T.Vector3();
    const axis = () => new T.Vector3(0, 1, 0).applyQuaternion(q);
    const spin = (w3 = 170) => {
      let a = axis();
      if (a.y > 0.995) {
        q.setFromAxisAngle(new T.Vector3(1, 0, 0), 0.3);
        a = axis();
      }
      Lm.copy(a).multiplyScalar(I3 * w3);
    };
    q.setFromAxisAngle(new T.Vector3(1, 0, 0), 0.3);
    spin();
    const trail = pcTrail(400, 16766586, 2.5);
    X.root.add(trail.line);
    const arrow = new T.Group(), shaftM = new T.MeshBasicMaterial({ color: 8962303 });
    const shaft = new T.Mesh(new T.CylinderGeometry(1.2e-3, 1.2e-3, 1, 8).translate(0, 0.5, 0), shaftM), head = new T.Mesh(new T.ConeGeometry(4e-3, 0.012, 12), shaftM);
    arrow.add(shaft, head);
    arrow.visible = false;
    arrow.position.copy(TIP);
    arrow.traverse((o) => o.userData.noCollider = o.userData.noHighlight = true);
    X.root.add(arrow);
    let held = false, phi = 0;
    const it = X.add(top, { box: new T.Box3(new T.Vector3(-0.033, 0, -0.033), new T.Vector3(0.033, 0.062, 0.033)) });
    it.on("tap", () => spin());
    it.on("drag", (e) => {
      held = true;
      const a = X.local(e.point).sub(TIP);
      if (a.y < 0.01) a.y = 0.01;
      a.normalize();
      const s = Lm.dot(axis());
      q.setFromUnitVectors(PC_YUP, a);
      Lm.copy(a).multiplyScalar(s);
    });
    it.on("release", () => held = false);
    X.action("Spin", () => spin());
    X.action("Fast", () => spin(320));
    X.action("Show L", (on) => arrow.visible = on, { toggle: true });
    X.action("Clear trail", () => trail.clear());
    const MAXT = 0.72, w = new T.Vector3(), Rm = new T.Matrix3(), tau = new T.Vector3(), dq = new T.Quaternion();
    return {
      update(dt) {
        const n = Math.ceil(dt / 5e-4), h = dt / n;
        if (!held) for (let s = 0; s < n; s++) {
          const a = axis();
          // torque of gravity about the tip, then angular momentum -> angular velocity through the inertia
          tau.copy(a).multiplyScalar(l).cross(new T.Vector3(0, -m * PC_G, 0));
          Lm.addScaledVector(tau, h);
          Lm.multiplyScalar(1 - 0.02 * h);
          Lm.addScaledVector(a, -Lm.dot(a) * 0.035 * h);
          const Lb = Lm.clone().applyQuaternion(q.clone().invert());
          w.set(Lb.x / I1, Lb.y / I3, Lb.z / I1).applyQuaternion(q);
          dq.set(w.x * h / 2, w.y * h / 2, w.z * h / 2, 0).multiply(q);
          q.set(q.x + dq.x, q.y + dq.y, q.z + dq.z, q.w + dq.w).normalize();
          // the rim hits the plate: hold the tilt there and let friction drain the fall
          const b = axis(), tilt = Math.acos(Math.min(1, b.y));
          if (tilt > MAXT) {
            const nrm = new T.Vector3(0, 1, 0).cross(b).normalize();
            q.premultiply(new T.Quaternion().setFromAxisAngle(nrm, -(tilt - MAXT)));
            Lm.addScaledVector(nrm, -Lm.dot(nrm));
            Lm.multiplyScalar(1 - 1.5 * h);
          }
        }
        // drawn spin is capped, so a fast top reads as spinning instead of strobing
        const a = axis(), w3 = Lm.dot(a) / I3;
        phi += Math.max(-24, Math.min(24, w3)) * dt;
        top.quaternion.setFromUnitVectors(PC_YUP, a).multiply(_pcQ.setFromAxisAngle(PC_YUP, phi));
        trail.push(a.clone().multiplyScalar(0.062).add(TIP));
        trail.flush();
        if (arrow.visible) {
          const len = Math.min(0.2, Lm.length() / (I3 * 170) * 0.12);
          arrow.quaternion.setFromUnitVectors(PC_YUP, Lm.clone().normalize());
          shaft.scale.set(1, len, 1);
          head.position.y = len;
        }
      }
    };
  }
});
// 8 - Galton board: 2D position-based balls through a peg triangle into bins; flip it like an hourglass
PC_EXHIBITS.push({
  id: "galton",
  label: "Galton board",
  title: "Galton board",
  blurb: "Twelve rows of coin-flips pile up into a bell curve · grab the board and turn it over",
  build(X) {
    const T = THREE6, NB = 180, r = 3e-3, ROWS = 12, DX = 0.0168, DY = 0.0145, Y0 = 0.255, PEG = 1.6e-3, W2 = 0.125, HT = 0.42;
    const board = new T.Group();
    board.name = "galton board";
    board.position.set(0, HT / 2 + 0.012, 0);
    X.root.add(board);
    const inner = new T.Group();
    inner.position.y = -HT / 2;
    board.add(inner);
    const back = new T.Mesh(new T.BoxGeometry(2 * W2 + 0.012, HT, 6e-3), pcStd(1316384, { roughness: 0.8 }));
    back.position.set(0, HT / 2, -7e-3);
    inner.add(back);
    const glass = new T.Mesh(new T.PlaneGeometry(2 * W2, HT), PC_MAT.glass(0.08));
    glass.position.set(0, HT / 2, 6e-3);
    glass.userData.noHighlight = true;
    inner.add(glass);
    // walls as segments [x1, y1, x2, y2]; drawn as thin boxes
    const segs = [[-W2, 0, -W2, HT], [W2, 0, W2, HT], [-W2, 3e-3, W2, 3e-3], [-W2, 0.32, -9e-3, 0.272], [W2, 0.32, 9e-3, 0.272], [-W2, HT, W2, HT]];
    for (let k = -6; k <= 7; k++) segs.push([(k - 0.5) * DX, 3e-3, (k - 0.5) * DX, 0.085]);
    const wallM = PC_MAT.white();
    for (const [x1, y1, x2, y2] of segs) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const b = new T.Mesh(new T.BoxGeometry(len, 1.6e-3, 0.012), wallM);
      b.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0);
      b.rotation.z = Math.atan2(y2 - y1, x2 - x1);
      inner.add(b);
    }
    const pegs = [];
    for (let row = 0; row < ROWS; row++) for (let c = 0; c <= row + 1; c++) pegs.push([(c - (row + 1) / 2) * DX, Y0 - row * DY]);
    const pegMesh = new T.InstancedMesh(new T.CylinderGeometry(PEG, PEG, 0.012, 8).rotateX(Math.PI / 2), PC_MAT.brass(), pegs.length);
    pegs.forEach(([px, py], i) => pegMesh.setMatrixAt(i, new T.Matrix4().makeTranslation(px, py, 0)));
    inner.add(pegMesh);
    const balls = new T.InstancedMesh(new T.SphereGeometry(r, 12, 8), PC_MAT.steel(), NB);
    balls.frustumCulled = false;
    inner.add(balls);
    for (const o of [pegMesh, balls]) o.userData.noCollider = o.userData.noHighlight = true;
    const x = new Float32Array(NB * 2), x0 = new Float32Array(NB * 2), v = new Float32Array(NB * 2);
    const fill = () => {
      for (let i = 0; i < NB; i++) {
        const col = i % 34, row = Math.floor(i / 34);
        x[i * 2] = -0.1 + col * 6.1e-3 + (row % 2) * 3e-3 + Math.random() * 1e-4;
        x[i * 2 + 1] = 0.33 + row * 6.2e-3;
      }
      v.fill(0);
    };
    fill();
    // the expected heap: binomial counts, at the height they stack to
    const curve = pcTrail(64, 16766586, 2.5, 0.9), binW = DX - 1.6e-3, per = 2 * r * 2 * r * 1.12 / binW;
    for (let k = 0; k <= ROWS; k++) {
      let c = 1;
      for (let j = 0; j < k; j++) c = c * (ROWS - j) / (j + 1);
      curve.push(new T.Vector3((k - ROWS / 2) * DX, 3e-3 + NB * c / 4096 * per, 4e-3));
    }
    curve.flush();
    inner.add(curve.line);
    const it = X.add(board, { draggable: true, twoHand: true, box: new T.Box3(new T.Vector3(-W2 - 6e-3, -HT / 2, -0.01), new T.Vector3(W2 + 6e-3, HT / 2, 0.01)),
      constrain: ({ position, scale }) => {
        scale.setScalar(1);
        position.y = Math.max(position.y, X.stageY + 0.05);
      } });
    let flip = null;
    X.action("Refill", () => {
      flip = null;
      board.quaternion.identity();
      board.position.set(0, HT / 2 + 0.012, 0);
      fill();
    });
    X.action("Turn over", () => flip = { q0: board.quaternion.clone(), q1: board.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI)), t: 0 });
    X.action("Curve", (on) => curve.line.visible = on, { toggle: true, value: true });
    const grid = /* @__PURE__ */ new Map(), gl = new T.Vector3();
    const push = (i, cx, cy, rr) => {
      const dx = x[i * 2] - cx, dy = x[i * 2 + 1] - cy, d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 1e-14) {
        const d = Math.sqrt(d2);
        x[i * 2] = cx + dx / d * rr;
        x[i * 2 + 1] = cy + dy / d * rr;
      }
    };
    return {
      update(dt) {
        if (flip && !it.selections.length) {
          flip.t = Math.min(1, flip.t + dt / 1.2);
          const e = flip.t * flip.t * (3 - 2 * flip.t);
          board.quaternion.slerpQuaternions(flip.q0, flip.q1, e);
          if (flip.t >= 1) flip = null;
        }
        // gravity in the board's own plane
        gl.set(0, -PC_G, 0).applyQuaternion(board.quaternion.clone().invert());
        const SUB = 5, h = dt / SUB;
        for (let s = 0; s < SUB; s++) {
          for (let i = 0; i < NB; i++) {
            x0[i * 2] = x[i * 2];
            x0[i * 2 + 1] = x[i * 2 + 1];
            v[i * 2] += gl.x * h;
            v[i * 2 + 1] += gl.y * h;
            x[i * 2] += v[i * 2] * h;
            x[i * 2 + 1] += v[i * 2 + 1] * h;
          }
          for (let iter = 0; iter < 2; iter++) {
            grid.clear();
            for (let i = 0; i < NB; i++) {
              const key = Math.floor(x[i * 2] / (2 * r)) * 1e4 + Math.floor(x[i * 2 + 1] / (2 * r));
              let l = grid.get(key);
              if (!l) grid.set(key, l = []);
              l.push(i);
            }
            for (let i = 0; i < NB; i++) {
              const cx = Math.floor(x[i * 2] / (2 * r)), cy = Math.floor(x[i * 2 + 1] / (2 * r));
              for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
                const l = grid.get((cx + a) * 1e4 + cy + b);
                if (!l) continue;
                for (const j of l) {
                  if (j <= i) continue;
                  const dx = x[j * 2] - x[i * 2], dy = x[j * 2 + 1] - x[i * 2 + 1], d2 = dx * dx + dy * dy;
                  if (d2 >= 4 * r * r || d2 < 1e-14) continue;
                  const d = Math.sqrt(d2), c = (2 * r - d) / 2 / d;
                  x[i * 2] -= dx * c;
                  x[i * 2 + 1] -= dy * c;
                  x[j * 2] += dx * c;
                  x[j * 2 + 1] += dy * c;
                }
              }
              const row = Math.round((Y0 - x[i * 2 + 1]) / DY);
              for (let rr = row - 1; rr <= row + 1; rr++) {
                if (rr < 0 || rr >= ROWS) continue;
                const cc = Math.round(x[i * 2] / DX + (rr + 1) / 2);
                for (let c = cc - 1; c <= cc + 1; c++) if (c >= 0 && c <= rr + 1) push(i, (c - (rr + 1) / 2) * DX, Y0 - rr * DY, r + PEG);
              }
              for (const [x1, y1, x2, y2] of segs) {
                const sx = x2 - x1, sy = y2 - y1, t = Math.max(0, Math.min(1, ((x[i * 2] - x1) * sx + (x[i * 2 + 1] - y1) * sy) / (sx * sx + sy * sy)));
                push(i, x1 + sx * t, y1 + sy * t, r + 8e-4);
              }
              x[i * 2] = Math.max(-W2 + r, Math.min(W2 - r, x[i * 2]));
              x[i * 2 + 1] = Math.max(3e-3 + r, Math.min(HT - r, x[i * 2 + 1]));
            }
          }
          for (let i = 0; i < NB * 2; i++) v[i] = (x[i] - x0[i]) / h * 0.995;
        }
        const M = new T.Matrix4();
        for (let i = 0; i < NB; i++) balls.setMatrixAt(i, M.makeTranslation(x[i * 2], x[i * 2 + 1], 0));
        balls.instanceMatrix.needsUpdate = true;
      }
    };
  }
});
// 9 - orbits: n-body gravity, leapfrog; fling a planet and watch its new orbit
PC_EXHIBITS.push({
  id: "orbits",
  label: "Orbits",
  title: "Orbits",
  blurb: "Newtonian gravity between every body · grab a planet and fling it · try the figure-eight three-body orbit",
  build(X) {
    const T = THREE6, Y = 0.17, C = new T.Vector3(0, Y, 0), EPS2 = 1e-3 ** 2;
    X.root.add(pcRod(2e-3, PC_MAT.chrome(), 8).set(new T.Vector3(0, 0, 0), new T.Vector3(0, Y - 0.03, 0)));
    const light = new T.PointLight(16773332, 0.6, 0, 0);
    X.root.add(light);
    let bodies = [];
    const kill = (b) => {
      b.mesh.removeFromParent();
      b.trail.line.removeFromParent();
      b.trail.line.geometry.dispose();
      X.remove(b.it);
      bodies = bodies.filter((o) => o !== b);
    };
    const body = (p, vel, mass, rad, color, star = false) => {
      const mesh = new T.Mesh(new T.SphereGeometry(rad, 24, 16), star ? new T.MeshBasicMaterial({ color }) : pcStd(color, { roughness: 0.5, emissive: color, emissiveIntensity: 0.15 }));
      mesh.position.copy(p);
      X.root.add(mesh);
      const trail = pcTrail(star ? 200 : 360, color, 2, 0.75);
      X.root.add(trail.line);
      const b = { p: p.clone(), v: vel.clone(), a: new T.Vector3(), m: mass, rad, mesh, trail, star, held: false, tr: pcTracker() };
      b.it = X.add(mesh, {});
      b.it.on("press", () => {
        b.held = true;
        b.tr.reset();
      });
      b.it.on("drag", (e) => {
        b.p.copy(X.local(e.point));
        b.tr.push(b.p);
      });
      b.it.on("release", () => {
        b.held = false;
        b.tr.velocity(b.v);
        b.v.clampLength(0, 0.6);
        b.trail.clear();
      });
      bodies.push(b);
      return b;
    };
    const clear = () => {
      for (const b of [...bodies]) kill(b);
    };
    const circ = (M, rr, ang, mass, rad, color, center = C, cv = new T.Vector3()) => {
      const p = new T.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr).add(center), sp = Math.sqrt(M / rr);
      return body(p, new T.Vector3(-Math.sin(ang) * sp, 0, Math.cos(ang) * sp).add(cv), mass, rad, color);
    };
    const solar = () => {
      clear();
      const M = 25e-4;
      body(C, new T.Vector3(), M, 0.016, 16767061, true);
      circ(M, 0.05, 0, 2e-7, 4e-3, 12627341);
      circ(M, 0.08, 2, 2e-6, 5.5e-3, 15253860);
      circ(M, 0.105, 4, 3e-6, 6e-3, 4886745);
      // a heavy outer planet, far enough out to keep a moon without stirring up the inner orbits
      const jup = circ(M, 0.19, 1, 2e-5, 5.5e-3, 14178390);
      circ(2e-5, 9e-3, 0, 1e-9, 1.6e-3, 14540253, jup.p, jup.v);
    };
    const figure8 = () => {
      clear();
      // Chenciner & Montgomery's choreography, scaled to 10 cm and ~6 s
      const s = 0.1, Gm = s ** 3, p1 = new T.Vector3(0.97000436, 0, -0.24308753).multiplyScalar(s), v3 = new T.Vector3(-0.93240737, 0, -0.86473146).multiplyScalar(s);
      body(p1.clone().add(C), v3.clone().multiplyScalar(-0.5), Gm, 7e-3, 16742224);
      body(p1.clone().negate().add(C), v3.clone().multiplyScalar(-0.5), Gm, 7e-3, 8962303);
      body(C.clone(), v3, Gm, 7e-3, 16766586);
    };
    const binary = () => {
      clear();
      const m = 12e-4, D = 0.06, sp = Math.sqrt(m / (2 * D));
      body(C.clone().add(new T.Vector3(D / 2, 0, 0)), new T.Vector3(0, 0, sp), m, 0.011, 16756820, true);
      body(C.clone().add(new T.Vector3(-D / 2, 0, 0)), new T.Vector3(0, 0, -sp), m, 9e-3, 11129855, true);
      circ(2 * m, 0.15, 0.5, 1e-6, 5e-3, 7983033);
    };
    solar();
    X.action("Solar", solar);
    X.action("Figure 8", figure8);
    X.action("Binary", binary);
    X.action("Add planet", () => {
      let M = 0;
      for (const b of bodies) M += b.m;
      circ(M, 0.06 + Math.random() * 0.1, Math.random() * 6.28, 1e-6, 4.5e-3 + Math.random() * 2e-3, new T.Color().setHSL(Math.random(), 0.6, 0.6).getHex());
    });
    const acc = () => {
      for (const b of bodies) b.a.set(0, 0, 0);
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        _pcV.subVectors(b.p, a.p);
        const d2 = _pcV.lengthSq() + EPS2, inv = 1 / (d2 * Math.sqrt(d2));
        a.a.addScaledVector(_pcV, b.m * inv);
        b.a.addScaledVector(_pcV, -a.m * inv);
      }
    };
    return {
      update(dt) {
        const n = Math.ceil(dt / 1.5e-3), h = dt / n;
        acc();
        for (let s = 0; s < n; s++) {
          for (const b of bodies) if (!b.held) {
            b.v.addScaledVector(b.a, h / 2);
            b.p.addScaledVector(b.v, h);
          }
          acc();
          for (const b of bodies) if (!b.held) b.v.addScaledVector(b.a, h / 2);
        }
        // merge on contact (momentum kept, the heavier one absorbs), drop anything flung off the table
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], b = bodies[j];
          if (a.p.distanceTo(b.p) < (a.rad + b.rad) * 0.85) {
            const [big, small] = a.m >= b.m ? [a, b] : [b, a];
            if (big.held || small.held) continue;
            big.v.multiplyScalar(big.m).addScaledVector(small.v, small.m).divideScalar(big.m + small.m);
            big.m += small.m;
            X.tone(180, 0.15, 0.3, "sine");
            kill(small);
            return;
          }
        }
        for (const b of [...bodies]) if (b.p.distanceTo(C) > 0.6) kill(b);
        let star = null;
        for (const b of bodies) {
          b.mesh.position.copy(b.p);
          if (!b.held) b.trail.push(b.p);
          b.trail.flush();
          if (b.star && !star) star = b;
        }
        light.position.copy(star ? star.p : C);
      }
    };
  }
});
// 10 - magnetic pendulum: three magnets under a swinging bob; the plate maps where each start ends up
PC_EXHIBITS.push({
  id: "magnets",
  label: "Magnets",
  title: "Magnetic pendulum",
  blurb: "Which magnet wins? The plate below fills in the answer for every start: a fractal · drag the bob and let go",
  build(X) {
    const T = THREE6, PY = 0.32, LEN = 0.28, SC = 0.05, K = 0.5, B = 0.18, D2 = 0.3 ** 2, RM = 2.2;
    const MAG = [0, 1, 2].map((i) => [Math.cos(Math.PI / 2 + i * 2.0944), Math.sin(Math.PI / 2 + i * 2.0944)]);
    const COL = [[232, 72, 59], [61, 163, 93], [43, 123, 185]];
    const acc = (px, py, vx, vy, out) => {
      let ax = -K * px - B * vx, ay = -K * py - B * vy;
      for (const [mx, my] of MAG) {
        const dx = mx - px, dy = my - py, d = Math.pow(dx * dx + dy * dy + D2, 1.5);
        ax += dx / d;
        ay += dy / d;
      }
      out[0] = ax;
      out[1] = ay;
    };
    // which magnet a start settles on, and how long it took
    const settle = (px, py, max = 2500) => {
      let vx = 0, vy = 0;
      const a = [0, 0], h = 0.03;
      for (let s = 0; s < max; s++) {
        acc(px, py, vx, vy, a);
        vx += a[0] * h;
        vy += a[1] * h;
        px += vx * h;
        py += vy * h;
        if (s > 40 && vx * vx + vy * vy < 4e-4) for (let m = 0; m < 3; m++) if ((px - MAG[m][0]) ** 2 + (py - MAG[m][1]) ** 2 < 0.06) return [m, s / max];
      }
      return [-1, 1];
    };
    // base, magnets, stand
    X.root.add(new T.Mesh(new T.CylinderGeometry(0.13, 0.14, 0.01, 64), PC_MAT.dark()).translateY(5e-3));
    const MP = 256, cv = document.createElement("canvas");
    cv.width = cv.height = MP;
    const g = cv.getContext("2d"), img = g.createImageData(MP, MP);
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const map = new T.Mesh(new T.CircleGeometry(RM * SC, 96).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: tex, transparent: true }));
    map.position.y = 0.0102;
    map.userData.noCollider = map.userData.noHighlight = true;
    X.root.add(map);
    const mags = MAG.map(([mx, my], i) => {
      const mm = new T.Mesh(new T.CylinderGeometry(9e-3, 9e-3, 8e-3, 24), pcStd(new T.Color(`rgb(${COL[i].join(",")})`).getHex(), { roughness: 0.3, emissive: new T.Color(`rgb(${COL[i].join(",")})`), emissiveIntensity: 0.1 }));
      mm.position.set(mx * SC, 0.014, my * SC);
      X.root.add(mm);
      return mm;
    });
    const chrome = PC_MAT.chrome();
    X.root.add(pcRod(3e-3, chrome, 10).set(new T.Vector3(-0.14, 0, -0.06), new T.Vector3(-0.14, PY + 0.01, -0.06)));
    X.root.add(pcRod(2.5e-3, chrome, 10).set(new T.Vector3(-0.14, PY + 0.01, -0.06), new T.Vector3(0, PY + 0.01, 0)));
    const bob = new T.Mesh(new T.SphereGeometry(8e-3, 24, 16), PC_MAT.steel());
    bob.name = "bob";
    X.root.add(bob);
    const str = pcRod(4e-4, PC_MAT.string());
    X.root.add(str);
    const trail = pcTrail(900, 16777215, 2, 0.8);
    X.root.add(trail.line);
    // the fractal fills in pixel by pixel, in a shuffled order so the whole picture sharpens at once
    const order = new Uint32Array(MP * MP);
    for (let i = 0; i < order.length; i++) order[i] = i;
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let next = 0, showMap = true, lastUp = 0;
    const st = { p: [1.6, -0.9], v: [0, 0], held: false, settled: -1 };
    const it = X.add(bob, {});
    const drag = (e) => {
      const p = X.local(e.point);
      let px = p.x / SC, py = p.z / SC;
      const rr = Math.hypot(px, py);
      if (rr > RM) px *= RM / rr, py *= RM / rr;
      st.p = [px, py];
      st.v = [0, 0];
    };
    it.on("press", (e) => {
      st.held = true;
      trail.clear();
      trail.color(16777215);
      st.settled = -1;
      drag(e);
    });
    it.on("drag", drag);
    it.on("release", () => st.held = false);
    X.action("Random start", () => {
      const a = Math.random() * 6.28, rr = 1.2 + Math.random() * 0.9;
      st.p = [Math.cos(a) * rr, Math.sin(a) * rr];
      st.v = [0, 0];
      st.settled = -1;
      trail.clear();
      trail.color(16777215);
    });
    X.action("Fractal map", (on) => map.visible = showMap = on, { toggle: true, value: true });
    X.action("Clear trail", () => trail.clear());
    const a = [0, 0];
    return {
      update(dt) {
        if (!st.held) {
          const n = Math.ceil(dt / 0.115 / 0.01), h = dt / 0.115 / n;
          for (let s = 0; s < n; s++) {
            acc(st.p[0], st.p[1], st.v[0], st.v[1], a);
            st.v[0] += a[0] * h;
            st.v[1] += a[1] * h;
            st.p[0] += st.v[0] * h;
            st.p[1] += st.v[1] * h;
          }
          if (st.settled < 0 && st.v[0] ** 2 + st.v[1] ** 2 < 4e-4) for (let m = 0; m < 3; m++) {
            if ((st.p[0] - MAG[m][0]) ** 2 + (st.p[1] - MAG[m][1]) ** 2 < 0.06) {
              st.settled = m;
              trail.color(new T.Color(`rgb(${COL[m].join(",")})`).getHex());
              X.tone(440 * [1, 1.25, 1.5][m], 0.1, 0.5, "sine");
            }
          }
        }
        mags.forEach((mm, i) => mm.material.emissiveIntensity = st.settled === i ? 0.8 : 0.1);
        const x = st.p[0] * SC, z = st.p[1] * SC, y = PY - Math.sqrt(Math.max(0, LEN * LEN - x * x - z * z));
        bob.position.set(x, y, z);
        str.set(new T.Vector3(0, PY + 0.01, 0), bob.position);
        if (!st.held) trail.push(new T.Vector3(x, Math.max(0.02, y - 8e-3), z));
        trail.flush();
        // fractal: a few milliseconds of work per frame
        if (showMap && next < order.length) {
          const t0 = performance.now();
          while (next < order.length && performance.now() - t0 < 4) {
            const px = order[next++], ix = px % MP, iy = Math.floor(px / MP);
            const ux = (ix + 0.5) / MP * 2 - 1, uy = (iy + 0.5) / MP * 2 - 1, o = px * 4;
            if (ux * ux + uy * uy > 1) continue;
            const [m, f] = settle(ux * RM, uy * RM);
            const shade = m < 0 ? 0 : 0.35 + 0.65 * Math.pow(1 - f, 2);
            const c = m < 0 ? [20, 20, 20] : COL[m];
            img.data[o] = c[0] * shade;
            img.data[o + 1] = c[1] * shade;
            img.data[o + 2] = c[2] * shade;
            img.data[o + 3] = 235;
          }
          if (performance.now() - lastUp > 250 || next >= order.length) {
            g.putImageData(img, 0, 0);
            tex.needsUpdate = true;
            lastUp = performance.now();
          }
        }
      }
    };
  }
});
