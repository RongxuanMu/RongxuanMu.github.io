// - the exhibits. build(X) fills X.root (stage-local: y up from the plate top, metres) and returns
// { update(dt, t) }. X.add registers interactables, X.action adds a button to the panel's action row -
var PC_EXHIBITS = [];
// 1 - water ball: position-based fluid (Macklin & Mueller 2013) in a glass sphere you can carry and shake
PC_EXHIBITS.push({
  id: "water",
  label: "Water ball",
  title: "Water ball",
  blurb: "900 particles of position-based fluid in a glass sphere · pick it up, tilt it, shake it",
  build(X) {
    const T = THREE6, R = 0.095, N = 900, S = 0.0112, H = S * 1.9, PR = 4.5e-3;
    const ball = new T.Group();
    ball.position.set(0, R + 0.035, 0);
    ball.name = "water ball";
    X.root.add(ball);
    const glass = new T.Mesh(new T.SphereGeometry(R + 2e-3, 48, 32), PC_MAT.glass(0.14));
    ball.add(glass);
    const back = new T.Mesh(new T.SphereGeometry(R + 2e-3, 48, 32), PC_MAT.glass(0.08));
    back.material.side = T.BackSide;
    back.userData.noHighlight = true;
    ball.add(back);
    // stand: a ring the ball rests in
    const stand = new T.Mesh(new T.TorusGeometry(0.05, 6e-3, 12, 64).rotateX(Math.PI / 2), PC_MAT.brass());
    stand.position.y = 0.018;
    X.root.add(stand);
    X.root.add(new T.Mesh(new T.CylinderGeometry(0.045, 0.055, 0.012, 48), PC_MAT.dark()).translateY(6e-3));
    const it = X.add(ball, { draggable: true, twoHand: true, box: new T.Box3(new T.Vector3(-R, -R, -R), new T.Vector3(R, R, R)),
      constrain: ({ position, scale }) => {
        scale.setScalar(1);
        position.y = Math.max(position.y, X.stageY + R + 0.02);
      } });
    // particles: a loose lattice filling the lower part of the sphere
    const pos = new Float32Array(N * 3), prd = new Float32Array(N * 3), vel = new Float32Array(N * 3);
    const lam = new Float32Array(N), dp = new Float32Array(N * 3);
    const fill = () => {
      let n = 0;
      for (let y = -R + S; y < R && n < N; y += S) for (let x = -R + S; x < R && n < N; x += S) for (let z = -R + S; z < R && n < N; z += S) {
        if (x * x + y * y + z * z > (R - S) ** 2) continue;
        pos.set([ball.position.x + x + (Math.random() - 0.5) * 1e-3, ball.position.y + y, ball.position.z + z + (Math.random() - 0.5) * 1e-3], n * 3);
        n++;
      }
      vel.fill(0);
    };
    fill();
    // kernels
    const H2 = H * H, POLY6 = 315 / (64 * Math.PI * H ** 9), SPIKY = -45 / (Math.PI * H ** 6);
    const W = (r2) => r2 >= H2 ? 0 : POLY6 * (H2 - r2) ** 3;
    // rest density and a relaxation constant from a full lattice around one particle
    let RHO0 = 0, DEN0 = 0;
    {
      let gx = 0, gy = 0, gz = 0, g2 = 0;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
        const r2 = (i * i + j * j + k * k) * S * S;
        RHO0 += W(r2);
      }
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
        const r = Math.sqrt(i * i + j * j + k * k) * S;
        if (!r || r >= H) continue;
        const g = SPIKY * (H - r) ** 2 / r / RHO0;
        gx += g * i * S;
        g2 += g * g * r * r;
      }
      DEN0 = g2 + gx * gx;
    }
    const EPS = DEN0 * 0.05, WQd = H2 - (0.25 * H) ** 2, CORR = 2e-3 / DEN0;
    // uniform grid around the ball (particles never leave it)
    const GC = Math.ceil(2 * (R + H) / H) + 1, cellStart = new Int32Array(GC ** 3 + 1), cellIdx = new Int32Array(N), sorted = new Int32Array(N);
    let ox = 0, oy = 0, oz = 0;
    const cellOf = (x, y, z) => {
      const i = Math.min(GC - 1, Math.max(0, Math.floor((x - ox) / H))), j = Math.min(GC - 1, Math.max(0, Math.floor((y - oy) / H))), k = Math.min(GC - 1, Math.max(0, Math.floor((z - oz) / H)));
      return (i * GC + j) * GC + k;
    };
    const buildGrid = (c) => {
      ox = c.x - R - H;
      oy = c.y - R - H;
      oz = c.z - R - H;
      cellStart.fill(0);
      for (let i = 0; i < N; i++) {
        cellIdx[i] = cellOf(prd[i * 3], prd[i * 3 + 1], prd[i * 3 + 2]);
        cellStart[cellIdx[i] + 1]++;
      }
      for (let c2 = 0; c2 < GC ** 3; c2++) cellStart[c2 + 1] += cellStart[c2];
      const fillp = cellStart.slice();
      for (let i = 0; i < N; i++) sorted[fillp[cellIdx[i]]++] = i;
    };
    // neighbour lists, built once per step (flat: up to MAXN per particle)
    const MAXN = 48, nbI = new Int32Array(N * MAXN), nbC = new Int32Array(N);
    const findNeighbours = () => {
      for (let i = 0; i < N; i++) {
        const x = prd[i * 3], y = prd[i * 3 + 1], z = prd[i * 3 + 2];
        const ci = Math.floor((x - ox) / H), cj = Math.floor((y - oy) / H), ck = Math.floor((z - oz) / H);
        let c = 0;
        const base = i * MAXN;
        for (let a2 = Math.max(0, ci - 1); a2 <= Math.min(GC - 1, ci + 1); a2++) for (let b2 = Math.max(0, cj - 1); b2 <= Math.min(GC - 1, cj + 1); b2++) for (let c2 = Math.max(0, ck - 1); c2 <= Math.min(GC - 1, ck + 1); c2++) {
          const cell = (a2 * GC + b2) * GC + c2;
          for (let s2 = cellStart[cell]; s2 < cellStart[cell + 1] && c < MAXN; s2++) {
            const j = sorted[s2];
            if (j === i) continue;
            const dx = x - prd[j * 3], dy = y - prd[j * 3 + 1], dz = z - prd[j * 3 + 2];
            if (dx * dx + dy * dy + dz * dz < H2) nbI[base + c++] = j;
          }
        }
        nbC[i] = c;
      }
    };
    // render: instanced droplets, coloured by speed (deep blue -> foam white)
    const drops = new T.InstancedMesh(new T.IcosahedronGeometry(6.6e-3, 1), new T.MeshStandardMaterial({ color: 16777215, roughness: 0.12, metalness: 0.05, envMap: pcEnv }), N);
    drops.userData.noCollider = drops.userData.noHighlight = true;
    drops.frustumCulled = false;
    X.root.add(drops);
    const deep = new T.Color(1924273), foam = new T.Color(13824511), col = new T.Color(), M = new T.Matrix4();
    for (let i = 0; i < N; i++) drops.setColorAt(i, deep);
    let gravity = true, shake = 0, swirl = 0;
    const center = new T.Vector3(), c0 = new T.Vector3(), cc = new T.Vector3();
    c0.copy(ball.position);
    X.action("Swirl", () => swirl = 0.6);
    X.action("Shake", () => shake = 0.8);
    X.action("Zero g", (v) => gravity = !v, { toggle: true });
    X.action("Refill", () => {
      ball.position.set(0, R + 0.035, 0);
      ball.quaternion.identity();
      c0.copy(ball.position);
      fill();
    });
    return {
      update(dt, t) {
        // a shake moves the ball itself, so the glass pushes the water around
        if (shake > 0 && !it.selections.length) {
          shake = Math.max(0, shake - dt);
          ball.position.x += Math.sin(t * 40) * 0.004 * shake;
          ball.position.y += Math.cos(t * 33) * 0.003 * shake;
        }
        const steps = 1, h = dt / steps, g = gravity ? -PC_G : 0;
        center.copy(ball.position);
        for (let st = 0; st < steps; st++) {
          cc.lerpVectors(c0, center, (st + 1) / steps);
          for (let i = 0; i < N; i++) {
            const k = i * 3;
            vel[k + 1] += g * h;
            if (swirl > 0) {
              const dx = pos[k] - cc.x, dz = pos[k + 2] - cc.z;
              vel[k] += -dz * 14 * h;
              vel[k + 2] += dx * 14 * h;
            }
            prd[k] = pos[k] + vel[k] * h;
            prd[k + 1] = pos[k + 1] + vel[k + 1] * h;
            prd[k + 2] = pos[k + 2] + vel[k + 2] * h;
          }
          buildGrid(cc);
          findNeighbours();
          const W0 = W(0), lim = R - PR;
          for (let iter = 0; iter < 3; iter++) {
            for (let i = 0; i < N; i++) {
              const x = prd[i * 3], y = prd[i * 3 + 1], z = prd[i * 3 + 2], base = i * MAXN;
              let rho = W0, sx = 0, sy = 0, sz = 0, s2 = 0;
              for (let q = 0; q < nbC[i]; q++) {
                const j = nbI[base + q], dx = x - prd[j * 3], dy = y - prd[j * 3 + 1], dz = z - prd[j * 3 + 2], r2 = dx * dx + dy * dy + dz * dz;
                if (r2 >= H2 || r2 < 1e-12) continue;
                const d = H2 - r2;
                rho += POLY6 * d * d * d;
                const r = Math.sqrt(r2), gw = SPIKY * (H - r) * (H - r) / r / RHO0;
                sx += gw * dx;
                sy += gw * dy;
                sz += gw * dz;
                s2 += gw * gw * r2;
              }
              const C = rho / RHO0 - 1;
              lam[i] = C > 0 ? -C / (s2 + sx * sx + sy * sy + sz * sz + EPS) : 0;
            }
            for (let i = 0; i < N; i++) {
              const x = prd[i * 3], y = prd[i * 3 + 1], z = prd[i * 3 + 2], base = i * MAXN, li = lam[i];
              let ax = 0, ay = 0, az = 0;
              for (let q = 0; q < nbC[i]; q++) {
                const j = nbI[base + q], dx = x - prd[j * 3], dy = y - prd[j * 3 + 1], dz = z - prd[j * 3 + 2], r2 = dx * dx + dy * dy + dz * dz;
                if (r2 >= H2 || r2 < 1e-12) continue;
                const d = (H2 - r2) / WQd, r = Math.sqrt(r2), wq = d * d * d;
                const gw = SPIKY * (H - r) * (H - r) / r * (li + lam[j] - CORR * wq * wq * wq * wq) / RHO0;
                ax += gw * dx;
                ay += gw * dy;
                az += gw * dz;
              }
              dp[i * 3] = ax;
              dp[i * 3 + 1] = ay;
              dp[i * 3 + 2] = az;
            }
            for (let i = 0; i < N; i++) {
              const k = i * 3;
              let x = prd[k] + dp[k] - cc.x, y = prd[k + 1] + dp[k + 1] - cc.y, z = prd[k + 2] + dp[k + 2] - cc.z;
              const d2 = x * x + y * y + z * z;
              if (d2 > lim * lim) {
                const f = lim / Math.sqrt(d2);
                x *= f;
                y *= f;
                z *= f;
              }
              prd[k] = cc.x + x;
              prd[k + 1] = cc.y + y;
              prd[k + 2] = cc.z + z;
            }
          }
          for (let i = 0; i < N * 3; i++) {
            vel[i] = (prd[i] - pos[i]) / h * 0.999;
            pos[i] = prd[i];
          }
          // XSPH viscosity: each particle drifts towards its neighbours' mean velocity
          for (let i = 0; i < N; i++) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], base = i * MAXN;
            let ax = 0, ay = 0, az = 0;
            for (let q = 0; q < nbC[i]; q++) {
              const j = nbI[base + q], dx = x - pos[j * 3], dy = y - pos[j * 3 + 1], dz = z - pos[j * 3 + 2], r2 = dx * dx + dy * dy + dz * dz;
              if (r2 >= H2) continue;
              const d = H2 - r2, wv = POLY6 * d * d * d / RHO0 * 0.06;
              ax += (vel[j * 3] - vel[i * 3]) * wv;
              ay += (vel[j * 3 + 1] - vel[i * 3 + 1]) * wv;
              az += (vel[j * 3 + 2] - vel[i * 3 + 2]) * wv;
            }
            dp[i * 3] = ax;
            dp[i * 3 + 1] = ay;
            dp[i * 3 + 2] = az;
          }
          for (let i = 0; i < N * 3; i++) vel[i] += dp[i];
        }
        c0.copy(center);
        swirl = Math.max(0, swirl - dt);
        for (let i = 0; i < N; i++) {
          const k = i * 3, sp = Math.hypot(vel[k], vel[k + 1], vel[k + 2]);
          M.makeTranslation(pos[k], pos[k + 1], pos[k + 2]);
          drops.setMatrixAt(i, M);
          drops.setColorAt(i, col.lerpColors(deep, foam, Math.min(1, sp / 1.1)));
        }
        drops.instanceMatrix.needsUpdate = true;
        drops.instanceColor.needsUpdate = true;
      }
    };
  }
});
// 2 - Newton's cradle: pendulums with exact elastic exchanges, swept along the row
PC_EXHIBITS.push({
  id: "cradle",
  label: "Cradle",
  title: "Newton's cradle",
  blurb: "Momentum and energy pass down the row · pull balls back and let go",
  build(X) {
    const T = THREE6, NB = 5, r = 0.0175, L = 0.12, TOP = 0.19, ZS = 0.04, E = 0.997;
    const chrome = PC_MAT.chrome(), str = PC_MAT.string(), wood = PC_MAT.wood();
    X.root.add(new T.Mesh(new T.BoxGeometry(0.26, 0.014, 0.12), wood).translateY(7e-3));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = pcRod(2.5e-3, chrome, 10).set(new T.Vector3(sx * 0.115, 0.014, sz * ZS), new T.Vector3(sx * 0.115, TOP, sz * ZS));
      X.root.add(p);
    }
    for (const sz of [-1, 1]) X.root.add(pcRod(2.5e-3, chrome, 10).set(new T.Vector3(-0.115, TOP, sz * ZS), new T.Vector3(0.115, TOP, sz * ZS)));
    const x0 = (i) => (i - (NB - 1) / 2) * 2 * r * 1.0005;
    const th = new Float64Array(NB), w = new Float64Array(NB), held = new Array(NB).fill(null);
    const balls = [], strings = [];
    for (let i = 0; i < NB; i++) {
      const b = new T.Mesh(new T.SphereGeometry(r, 32, 20), chrome);
      b.name = `ball ${i + 1}`;
      X.root.add(b);
      balls.push(b);
      strings.push([pcRod(4e-4, str), pcRod(4e-4, str)]);
      for (const s of strings[i]) X.root.add(s);
      const tr = pcTracker();
      const it = X.add(b, { highlight: true });
      const drag = (e) => {
        const p = X.local(e.point);
        held[i] = Math.max(-1.25, Math.min(1.25, Math.atan2(p.x - x0(i), Math.max(1e-3, TOP - p.y))));
        tr.push(new T.Vector3(held[i], 0, 0));
      };
      it.on("press", (e) => {
        tr.reset();
        drag(e);
      });
      it.on("drag", drag);
      it.on("release", () => {
        // let go with the swing the hand gave it
        w[i] = Math.max(-12, Math.min(12, tr.velocity(_pcV2).x));
        held[i] = null;
      });
    }
    const pos = (i) => x0(i) + L * Math.sin(th[i]);
    const lift = (k) => {
      for (let i = 0; i < NB; i++) {
        th[i] = i < k ? -0.7 : 0;
        w[i] = 0;
      }
    };
    lift(1);
    X.action("Lift 1", () => lift(1));
    X.action("Lift 2", () => lift(2));
    X.action("Lift 3", () => lift(3));
    X.action("Both ends", () => {
      lift(1);
      th[NB - 1] = 0.7;
    });
    let clack = 0;
    return {
      update(dt) {
        const n = Math.ceil(dt / 1e-3), h = dt / n;
        for (let s = 0; s < n; s++) {
          for (let i = 0; i < NB; i++) {
            if (held[i] !== null) {
              const prev = th[i];
              th[i] += (held[i] - th[i]) * Math.min(1, h * 40);
              w[i] = (th[i] - prev) / h;
              continue;
            }
            w[i] += (-PC_G / L * Math.sin(th[i]) - 0.04 * w[i]) * h;
            th[i] += w[i] * h;
          }
          // sweep the contacts both ways until nothing approaches: equal masses swap their velocities
          for (let pass = 0; pass < 2 * NB; pass++) {
            let any = false;
            for (let q = 0; q < 2 * (NB - 1); q++) {
              const i = q < NB - 1 ? q : 2 * (NB - 1) - 1 - q, j = i + 1;
              const gap = pos(j) - pos(i) - 2 * r;
              if (gap > 0) continue;
              const vi = L * w[i] * Math.cos(th[i]), vj = L * w[j] * Math.cos(th[j]);
              const hi = held[i] !== null, hj = held[j] !== null;
              if (vi - vj > 1e-6) {
                let ni, nj;
                if (hi && !hj) ni = vi, nj = vi + E * (vi - vj);
                else if (hj && !hi) nj = vj, ni = vj - E * (vi - vj);
                else ni = ((1 - E) * vi + (1 + E) * vj) / 2, nj = ((1 + E) * vi + (1 - E) * vj) / 2;
                if (!hi) w[i] = ni / (L * Math.cos(th[i]));
                if (!hj) w[j] = nj / (L * Math.cos(th[j]));
                clack = Math.max(clack, Math.abs(vi - vj));
                any = true;
              }
              // overlap: push the free ball(s) apart along the swing
              if (gap < -1e-5 && !(hi && hj)) {
                const si = hi ? 0 : hj ? 1 : 0.5, sj = 1 - si;
                th[i] += gap * si / (L * Math.cos(th[i]));
                th[j] -= gap * sj / (L * Math.cos(th[j]));
              }
            }
            if (!any) break;
          }
        }
        if (clack > 0.02) X.tone(2600 + Math.random() * 300, Math.min(0.25, clack * 0.5), 0.05, "triangle");
        clack = 0;
        for (let i = 0; i < NB; i++) {
          const c = new T.Vector3(pos(i), TOP - L * Math.cos(th[i]), 0);
          balls[i].position.copy(c);
          strings[i][0].set(c, new T.Vector3(x0(i), TOP, ZS));
          strings[i][1].set(c, new T.Vector3(x0(i), TOP, -ZS));
        }
      }
    };
  }
});
// 3 - double pendulum: Lagrangian equations, RK4, with a twin started 0.0001 rad apart
PC_EXHIBITS.push({
  id: "double",
  label: "Double pend.",
  title: "Double pendulum",
  blurb: "Deterministic chaos: the ghost twin starts 0.0001 rad away · drag either bob to set it",
  build(X) {
    const T = THREE6, L1 = 0.1, L2 = 0.1, m1 = 1, m2 = 1, PY = 0.3, g = PC_G;
    const piv = new T.Vector3(0, PY, 0);
    X.root.add(new T.Mesh(new T.CylinderGeometry(0.04, 0.05, 0.01, 40), PC_MAT.dark()).translateY(5e-3));
    X.root.add(pcRod(3e-3, PC_MAT.chrome(), 10).set(new T.Vector3(0, 0.01, -0.03), new T.Vector3(0, PY + 0.02, -0.03)));
    X.root.add(pcRod(2.5e-3, PC_MAT.chrome(), 10).set(new T.Vector3(0, PY, -0.03), new T.Vector3(0, PY, 4e-3)));
    const mk = (color, opacity) => {
      const m = opacity < 1 ? new T.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.3 }) : pcStd(color, { roughness: 0.3 });
      const rod = new T.MeshStandardMaterial({ color: 14540253, transparent: opacity < 1, opacity, roughness: 0.4 });
      const o = { b1: new T.Mesh(new T.SphereGeometry(0.011, 24, 16), m), b2: new T.Mesh(new T.SphereGeometry(0.013, 24, 16), m), r1: pcRod(2e-3, rod), r2: pcRod(2e-3, rod) };
      for (const k in o) X.root.add(o[k]);
      return o;
    };
    const A = mk(16742224, 1), B = mk(8962303, 0.55);
    const trA = pcTrail(500, 16742224), trB = pcTrail(500, 8962303, 2, 0.6);
    X.root.add(trA.line, trB.line);
    const sA = [2.4, 0, 2.6, 0], sB = [2.4, 0, 2.6 + 1e-4, 0];
    // [th1, w1, th2, w2]
    const deriv = (s) => {
      const [t1, w1, t2, w2] = s, d = t1 - t2, den = 2 * m1 + m2 - m2 * Math.cos(2 * d);
      const a1 = (-g * (2 * m1 + m2) * Math.sin(t1) - m2 * g * Math.sin(t1 - 2 * t2) - 2 * Math.sin(d) * m2 * (w2 * w2 * L2 + w1 * w1 * L1 * Math.cos(d))) / (L1 * den);
      const a2 = 2 * Math.sin(d) * (w1 * w1 * L1 * (m1 + m2) + g * (m1 + m2) * Math.cos(t1) + w2 * w2 * L2 * m2 * Math.cos(d)) / (L2 * den);
      return [w1, a1, w2, a2];
    };
    const rk4 = (s, h) => {
      const k1 = deriv(s), k2 = deriv(s.map((v, i) => v + k1[i] * h / 2)), k3 = deriv(s.map((v, i) => v + k2[i] * h / 2)), k4 = deriv(s.map((v, i) => v + k3[i] * h));
      for (let i = 0; i < 4; i++) s[i] += (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * h / 6;
    };
    const p1 = (s) => new T.Vector3(L1 * Math.sin(s[0]), PY - L1 * Math.cos(s[0]), 0);
    const p2 = (s) => p1(s).add(new T.Vector3(L2 * Math.sin(s[2]), -L2 * Math.cos(s[2]), 0));
    let held = null, twin = true;
    const grab = (which) => {
      const it = X.add(A[which], {});
      const tr = pcTracker();
      const drag = (e) => {
        const p = X.local(e.point).sub(piv);
        p.z = 0;
        if (which === "b1") sA[0] = Math.atan2(p.x, -p.y);
        else {
          // two-link IK, keeping the elbow on the side it is on
          const d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-3, p.length()));
          const base = Math.atan2(p.x, -p.y), k = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
          const side = Math.sin(sA[2] - sA[0]) >= 0 ? -1 : 1;
          sA[0] = base + side * k;
          const e1 = new T.Vector3(L1 * Math.sin(sA[0]), -L1 * Math.cos(sA[0]), 0);
          const q = p.clone().setLength(d).sub(e1);
          sA[2] = Math.atan2(q.x, -q.y);
        }
        sA[1] = sA[3] = 0;
        tr.push(new T.Vector3(sA[0], sA[2], 0));
      };
      it.on("press", (e) => {
        held = which;
        tr.reset();
        drag(e);
        trA.clear();
        trB.clear();
      });
      it.on("drag", drag);
      it.on("release", () => {
        held = null;
        sB.splice(0, 4, sA[0], sA[1], sA[2] + 1e-4, sA[3]);
      });
    };
    grab("b1");
    grab("b2");
    X.action("Chaos", () => {
      sA.splice(0, 4, 2 + Math.random(), 0, 2.5 + Math.random(), 0);
      sB.splice(0, 4, sA[0], 0, sA[2] + 1e-4, 0);
      trA.clear();
      trB.clear();
    });
    X.action("Twin", (v) => twin = v, { toggle: true, value: true });
    X.action("Clear trail", () => {
      trA.clear();
      trB.clear();
    });
    return {
      update(dt) {
        const n = Math.ceil(dt / 2e-3), h = dt / n;
        for (let i = 0; i < n; i++) {
          if (!held) rk4(sA, h);
          if (!held) rk4(sB, h);
        }
        for (const [o, s, tr, on] of [[A, sA, trA, true], [B, sB, trB, twin]]) {
          for (const k in o) o[k].visible = on;
          if (!on) {
            tr.clear();
            continue;
          }
          const a = p1(s), b = p2(s);
          o.b1.position.copy(a);
          o.b2.position.copy(b);
          o.r1.set(piv, a);
          o.r2.set(a, b);
          if (!held) tr.push(b);
          tr.flush();
        }
      }
    };
  }
});
// 4 - pendulum wave: fifteen pendulums tuned to 51..65 swings per minute
PC_EXHIBITS.push({
  id: "wave",
  label: "Pend. wave",
  title: "Pendulum wave",
  blurb: "Fifteen lengths, 51 to 65 swings a minute: snakes, splits and realigns every 60 s",
  build(X) {
    const T = THREE6, NP = 15, TOP = 0.3, PERIOD = 60, N0 = 51, W = 0.26;
    const L = Array.from({ length: NP }, (_, k) => PC_G * (PERIOD / (2 * Math.PI * (N0 + k))) ** 2);
    const om = L.map((l) => Math.sqrt(PC_G / l));
    const chrome = PC_MAT.chrome(), str = PC_MAT.string();
    X.root.add(new T.Mesh(new T.BoxGeometry(W + 0.04, 0.012, 0.08), PC_MAT.wood()).translateY(6e-3));
    for (const sx of [-1, 1]) X.root.add(pcRod(3e-3, chrome, 10).set(new T.Vector3(sx * (W / 2 + 0.01), 0.012, 0), new T.Vector3(sx * (W / 2 + 0.01), TOP, 0)));
    X.root.add(pcRod(3e-3, chrome, 10).set(new T.Vector3(-W / 2 - 0.01, TOP, 0), new T.Vector3(W / 2 + 0.01, TOP, 0)));
    const bobs = [], strs = [];
    let A = 0, t0 = 0, held = false, slow = false;
    for (let k = 0; k < NP; k++) {
      const b = new T.Mesh(new T.SphereGeometry(7e-3, 20, 14), pcStd(new T.Color().setHSL(k / NP * 0.85, 0.7, 0.55).getHex(), { roughness: 0.25 }));
      X.root.add(b);
      bobs.push(b);
      const s = pcRod(4e-4, str);
      X.root.add(s);
      strs.push(s);
      const it = X.add(b, {});
      const drag = (e) => {
        const p = X.local(e.point);
        A = Math.max(-0.6, Math.min(0.6, Math.atan2(p.z, Math.max(0.01, TOP - p.y))));
      };
      it.on("press", (e) => {
        held = true;
        drag(e);
      });
      it.on("drag", drag);
      it.on("release", () => {
        held = false;
        t0 = 0;
      });
    }
    const xs = (k) => -W / 2 + W * k / (NP - 1);
    X.action("Release", () => {
      A = 0.35;
      t0 = 0;
    });
    X.action("Slow motion", (v) => slow = v, { toggle: true });
    X.action("Stop", () => A = 0);
    A = 0.35;
    const clock = X.text(0.12);
    clock.position.set(0, TOP + 0.03, 0);
    X.root.add(clock);
    return {
      update(dt) {
        if (!held) t0 += dt * (slow ? 0.35 : 1);
        clock.userData.draw(held ? "let go to start" : `${t0.toFixed(1)} s of ${PERIOD} s`);
        for (let k = 0; k < NP; k++) {
          const th = held ? A : A * Math.cos(om[k] * t0) * Math.exp(-t0 * 2e-3);
          const p = new T.Vector3(xs(k), TOP - L[k] * Math.cos(th), L[k] * Math.sin(th));
          bobs[k].position.copy(p);
          strs[k].set(new T.Vector3(xs(k), TOP, 0), p);
        }
      }
    };
  }
});
// 5 - cloth: XPBD with small substeps (Macklin 2019), pinned to a rail; grab any point, re-pin it anywhere
PC_EXHIBITS.push({
  id: "cloth",
  label: "Cloth",
  title: "Cloth",
  blurb: "XPBD cloth on a rail · grab and pull any point (it stays where you leave a pinned corner) · fingertips push it",
  build(X) {
    const T = THREE6, NX = 22, NY = 22, SZ = 0.22, TOP = 0.33, D = SZ / (NX - 1);
    const N = NX * NY, x = new Float32Array(N * 3), p0 = new Float32Array(N * 3), v = new Float32Array(N * 3), w = new Float32Array(N);
    const idx = (i, j) => j * NX + i;
    const pinned = new Uint8Array(N);
    const reset = () => {
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
        const k = idx(i, j) * 3;
        x[k] = -SZ / 2 + i * D;
        x[k + 1] = TOP - j * D * 0.98;
        x[k + 2] = (j % 2) * 1e-4;
        pinned[idx(i, j)] = j === 0 && i % 3 === 0 ? 1 : 0;
      }
      pinned[idx(NX - 1, 0)] = 1;
      v.fill(0);
      for (let i = 0; i < N; i++) w[i] = pinned[i] ? 0 : 1;
    };
    reset();
    // constraints: [a, b, rest, compliance]
    const C = [];
    const link = (a, b, comp) => C.push([a, b, 0, comp]);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      if (i + 1 < NX) link(idx(i, j), idx(i + 1, j), 0);
      if (j + 1 < NY) link(idx(i, j), idx(i, j + 1), 0);
      if (i + 1 < NX && j + 1 < NY) {
        link(idx(i, j), idx(i + 1, j + 1), 1e-6);
        link(idx(i + 1, j), idx(i, j + 1), 1e-6);
      }
      if (i + 2 < NX) link(idx(i, j), idx(i + 2, j), 5e-4);
      if (j + 2 < NY) link(idx(i, j), idx(i, j + 2), 5e-4);
    }
    for (const c of C) {
      const [a, b] = c, ia = a % NX, ja = Math.floor(a / NX), ib = b % NX, jb = Math.floor(b / NX);
      c[2] = Math.hypot(ia - ib, ja - jb) * D;
    }
    // the rail
    X.root.add(pcRod(3e-3, PC_MAT.chrome(), 10).set(new T.Vector3(-SZ / 2 - 0.03, TOP, 0), new T.Vector3(SZ / 2 + 0.03, TOP, 0)));
    for (const sx of [-1, 1]) X.root.add(pcRod(3e-3, PC_MAT.chrome(), 10).set(new T.Vector3(sx * (SZ / 2 + 0.03), 0, 0), new T.Vector3(sx * (SZ / 2 + 0.03), TOP, 0)));
    // a blue-and-white print, like Chinese indigo cloth
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const g = cv.getContext("2d");
    g.fillStyle = "#1d3f7a";
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#e9eef7";
    g.lineWidth = 3;
    for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) {
      const cx = a * 32 + 16, cy = b * 32 + 16;
      g.beginPath();
      g.arc(cx, cy, 9, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#e9eef7";
      g.fillRect(cx - 2, cy - 2, 4, 4);
    }
    g.strokeRect(4, 4, 248, 248);
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    const geo = new T.PlaneGeometry(SZ, SZ, NX - 1, NY - 1);
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, side: T.DoubleSide, roughness: 0.8 }));
    mesh.name = "cloth";
    mesh.frustumCulled = false;
    X.root.add(mesh);
    let grabbed = -1, wind = false, ballOn = false;
    const target = new T.Vector3();
    const ball = new T.Mesh(new T.SphereGeometry(0.055, 32, 20), pcStd(13421772, { roughness: 0.6 }));
    ball.position.set(0, 0.08, 0.02);
    ball.visible = false;
    ball.userData.noCollider = true;
    X.root.add(ball);
    const it = X.add(mesh, { precise: true, highlight: false, box: new T.Box3(new T.Vector3(-0.2, 0, -0.2), new T.Vector3(0.2, 0.42, 0.2)) });
    it.on("press", (e) => {
      const p = X.local(e.point);
      let best = 0.04, bi = -1;
      for (let i = 0; i < N; i++) {
        const d = Math.hypot(x[i * 3] - p.x, x[i * 3 + 1] - p.y, x[i * 3 + 2] - p.z);
        if (d < best) best = d, bi = i;
      }
      grabbed = bi;
      target.copy(p);
    });
    it.on("drag", (e) => target.copy(X.local(e.point)));
    it.on("release", () => {
      if (grabbed >= 0 && !pinned[grabbed]) w[grabbed] = 1;
      grabbed = -1;
    });
    X.action("Wind", (on) => wind = on, { toggle: true });
    X.action("Ball", (on) => ballOn = ball.visible = on, { toggle: true });
    X.action("Drop", () => {
      pinned.fill(0);
      for (let i = 0; i < N; i++) if (i !== grabbed) w[i] = 1;
    });
    X.action("Hang", reset);
    const SUB = 12;
    return {
      update(dt, t) {
        const h = dt / SUB, tips = X.tips();
        for (let s = 0; s < SUB; s++) {
          for (let i = 0; i < N; i++) {
            const k = i * 3;
            p0[k] = x[k];
            p0[k + 1] = x[k + 1];
            p0[k + 2] = x[k + 2];
            if (!w[i]) continue;
            v[k + 1] -= PC_G * h;
            if (wind) {
              const gust = 0.6 + 0.4 * Math.sin(t * 1.3 + x[k] * 20);
              v[k + 2] += (1.8 * gust - v[k + 2] * 0.6) * h;
            }
            x[k] += v[k] * h;
            x[k + 1] += v[k + 1] * h;
            x[k + 2] += v[k + 2] * h;
          }
          if (grabbed >= 0) {
            w[grabbed] = 0;
            x.set([target.x, target.y, target.z], grabbed * 3);
          }
          const a2 = 1 / (h * h);
          for (const [a, b, rest, comp] of C) {
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
          for (let i = 0; i < N; i++) {
            if (!w[i]) continue;
            const k = i * 3;
            // the plate, the ball and the fingertips push the cloth out
            if (x[k + 1] < 2e-3) {
              x[k + 1] = 2e-3;
              x[k] = p0[k] + (x[k] - p0[k]) * 0.6;
              x[k + 2] = p0[k + 2] + (x[k + 2] - p0[k + 2]) * 0.6;
            }
            const push = (cx, cy, cz, rr) => {
              const dx = x[k] - cx, dy = x[k + 1] - cy, dz = x[k + 2] - cz, d = Math.hypot(dx, dy, dz);
              if (d < rr && d > 1e-9) {
                x[k] = cx + dx / d * rr;
                x[k + 1] = cy + dy / d * rr;
                x[k + 2] = cz + dz / d * rr;
              }
            };
            if (ballOn) push(ball.position.x, ball.position.y, ball.position.z, 0.058);
            for (const tp of tips) push(tp.x, tp.y, tp.z, 0.012);
          }
          for (let i = 0; i < N * 3; i++) v[i] = (x[i] - p0[i]) / h * 0.9995;
        }
        const P = geo.attributes.position;
        for (let i = 0; i < N; i++) P.setXYZ(i, x[i * 3], x[i * 3 + 1], x[i * 3 + 2]);
        P.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
      }
    };
  }
});
