// - the exhibits. build(X) fills X.root (stage-local: y up from the plate top, metres) and returns
// { update(dt, t) }. X.add registers interactables, X.action adds a button to the panel's action row -
var PC_EXHIBITS = [];
// 1 - water ball: a liquid with a free surface in a glass sphere you can carry and shake. The surface is the first
// sloshing mode of a part-filled sphere (a damped pendulum driven by gravity minus the glass's acceleration), with
// ripples on top (the damped wave equation on a grid, pinned at the glass); Swirl spins up a whirlpool (paraboloid
// surface, ripples carried round), and in zero g the water gathers into a floating, wobbling droplet
PC_EXHIBITS.push({
  id: "water",
  label: "Water ball",
  title: "Water ball",
  blurb: "Liquid in a glass sphere: it sloshes, ripples and whirls · pick it up, shake it, dip a finger in, try zero g",
  build(X) {
    const T = THREE6, R = 0.095, RI = R - 1.5e-3, FILL = 0.42;
    const ball = new T.Group();
    ball.position.set(0, R + 0.035, 0);
    ball.name = "water ball";
    X.root.add(ball);
    const glass = new T.Mesh(new T.SphereGeometry(R + 2e-3, 48, 32), PC_MAT.glass(0.14));
    glass.renderOrder = 3;
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
    // the pool: a cap of the sphere whose volume is FILL of the ball; its flat surface sits S along the surface
    // normal from the centre (the same at any tilt: the sphere is round)
    const V = FILL * 4 / 3 * Math.PI * RI ** 3;
    let lo = 0, hi = 2 * RI;
    for (let k = 0; k < 50; k++) {
      const m = (lo + hi) / 2;
      if (Math.PI * m * m * (3 * RI - m) / 3 < V) lo = m;
      else hi = m;
    }
    const S = lo - RI, RC = Math.sqrt(RI * RI - S * S), RB = Math.cbrt(3 * V / (4 * Math.PI));
    // liquid space: the ball's centre, the stage's axes (the water does not turn with the glass)
    const liquid = new T.Group();
    liquid.userData.noCollider = true;
    X.root.add(liquid);
    const water = { color: 2124754, roughness: 0.06, metalness: 0, transparent: true, envMap: pcEnv, envMapIntensity: 1.1 };
    // body: the inside of the sphere, cut off above the surface plane in the shader
    const cut = { uN: { value: new T.Vector3(0, 1, 0) }, uS: { value: S } };
    const bodyMat = new T.MeshStandardMaterial({ ...water, opacity: 0.78, side: T.DoubleSide, depthWrite: false });
    bodyMat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, cut);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLiq;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLiq = position;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vLiq;\nuniform vec3 uN;\nuniform float uS;").replace("void main() {", "void main() {\n  if (dot(vLiq, uN) > uS) discard;");
    };
    const body = new T.Mesh(new T.SphereGeometry(RI, 64, 40), bodyMat);
    body.renderOrder = 1;
    body.userData.noCollider = body.userData.noHighlight = true;
    liquid.add(body);
    // surface: a polar mesh over the cut disc, heights from the wave grid
    const NR = 22, NS = 72, NV = 1 + NR * NS;
    const capGeo = new T.BufferGeometry(), cp = new Float32Array(NV * 3), ccol = new Float32Array(NV * 3), cidx = [];
    for (let s = 0; s < NS; s++) cidx.push(0, 1 + (s + 1) % NS, 1 + s);
    for (let r = 1; r < NR; r++) for (let s = 0; s < NS; s++) {
      const a = 1 + (r - 1) * NS + s, b = 1 + (r - 1) * NS + (s + 1) % NS, c = a + NS, d = b + NS;
      cidx.push(a, b, d, a, d, c);
    }
    capGeo.setIndex(cidx);
    capGeo.setAttribute("position", new T.BufferAttribute(cp, 3));
    capGeo.setAttribute("color", new T.BufferAttribute(ccol, 3));
    // the surface is glossier than the body, so every wave catches the light
    const cap = new T.Mesh(capGeo, new T.MeshStandardMaterial({ ...water, color: 16777215, vertexColors: true, opacity: 0.9, roughness: 0.1, envMapIntensity: 0.35, side: T.DoubleSide, depthWrite: false }));
    cap.renderOrder = 2;
    cap.frustumCulled = false;
    cap.userData.noCollider = cap.userData.noHighlight = true;
    liquid.add(cap);
    // zero g: one droplet, its l = 2 wobble (Rayleigh) about the last kick's axis
    const blobGeo = new T.SphereGeometry(RB, 48, 32), bp0 = blobGeo.attributes.position.array.slice();
    const blob = new T.Mesh(blobGeo, new T.MeshStandardMaterial({ ...water, opacity: 0.8, depthWrite: false }));
    blob.renderOrder = 2;
    blob.visible = false;
    blob.userData.noCollider = blob.userData.noHighlight = true;
    liquid.add(blob);
    // ripples: damped wave equation on a G x G grid across the disc (pinned outside it)
    const G = 44, DX = 2 * RC / (G - 1), CW = 0.26, GAM = 1.1, NU = 9e-5, AMP = 0.012;
    const hgt = new Float32Array(G * G), hv = new Float32Array(G * G), tmpH = new Float32Array(G * G), inside = new Uint8Array(G * G);
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) inside[i * G + j] = Math.hypot(-RC + i * DX, -RC + j * DX) < RC * 0.97 ? 1 : 0;
    const sample = (u, v) => {
      const fi = (u + RC) / DX, fj = (v + RC) / DX, i = Math.floor(fi), j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= G - 1 || j >= G - 1) return 0;
      const a = fi - i, b = fj - j, k = i * G + j;
      return (hgt[k] * (1 - a) + hgt[k + G] * a) * (1 - b) + (hgt[k + 1] * (1 - a) + hgt[k + G + 1] * a) * b;
    };
    const splash = (u, v, amp, rad = 2.5) => {
      const ci = (u + RC) / DX, cj = (v + RC) / DX;
      for (let i = Math.max(0, Math.floor(ci - 3 * rad)); i <= Math.min(G - 1, Math.ceil(ci + 3 * rad)); i++) for (let j = Math.max(0, Math.floor(cj - 3 * rad)); j <= Math.min(G - 1, Math.ceil(cj + 3 * rad)); j++) {
        if (inside[i * G + j]) hv[i * G + j] += amp * Math.exp(-((i - ci) ** 2 + (j - cj) ** 2) / (rad * rad));
      }
    };
    // state
    const n = new T.Vector3(0, 1, 0), nv = new T.Vector3(), up = new T.Vector3(), eu = new T.Vector3(), ev = new T.Vector3();
    const prevP = new T.Vector3().copy(ball.position), vel = new T.Vector3(), prevV = new T.Vector3(), acc = new T.Vector3(), accLP = new T.Vector3(), accHP = new T.Vector3();
    const prevTip = [];
    const geff = new T.Vector3(), down = new T.Vector3(), qi = new T.Quaternion(), tv = new T.Vector3();
    const bpos = new T.Vector3(), bvel = new T.Vector3(), bax = new T.Vector3(0, 1, 0);
    let gravity = true, shake = 0, omega = 0, mode = "pool", A = 0, Av = 0, first = true;
    const basis = () => {
      tv.set(Math.abs(n.z) < 0.9 ? 0 : 1, 0, Math.abs(n.z) < 0.9 ? 1 : 0);
      eu.crossVectors(tv, n).normalize();
      ev.crossVectors(n, eu);
    };
    const toPool = (kick) => {
      mode = "pool";
      hgt.fill(0);
      hv.fill(0);
      if (kick) {
        nv.copy(kick);
        basis();
        splash(0, 0, -0.3, 5);
      }
      body.visible = cap.visible = true;
      blob.visible = false;
    };
    const toBlob = () => {
      mode = "blob";
      bpos.copy(n).multiplyScalar(-(RI - RB) * 0.9);
      bvel.set(0, 0, 0);
      A = 0;
      Av = 1.2;
      bax.copy(n);
      body.visible = cap.visible = false;
      blob.visible = true;
    };
    X.action("Swirl", () => mode === "pool" ? omega = 9 : bvel.add(tv.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25)));
    X.action("Shake", () => shake = 0.8);
    X.action("Zero g", (v) => {
      gravity = !v;
      if (!gravity && mode === "pool") toBlob();
    }, { toggle: true });
    X.action("Refill", () => {
      ball.position.set(0, R + 0.035, 0);
      ball.quaternion.identity();
      n.set(0, 1, 0);
      nv.set(0, 0, 0);
      omega = 0;
      first = true;
      if (gravity) toPool();
      else toBlob();
    });
    const W0 = Math.sqrt(1.3 * PC_G / R), ZETA = 0.045, WB = 1.7, ZB = 0.06;
    return {
      update(dt, t) {
        // a shake moves the ball itself, so the glass pushes the water around
        if (shake > 0 && !it.selections.length) {
          shake = Math.max(0, shake - dt);
          ball.position.x += Math.sin(t * 40) * 4e-3 * shake;
          ball.position.y += Math.cos(t * 33) * 3e-3 * shake;
        }
        liquid.position.copy(ball.position);
        // the glass's acceleration (smoothed: hand tracking is noisy), and gravity in stage axes
        if (first) prevP.copy(ball.position), vel.set(0, 0, 0), first = false;
        vel.subVectors(ball.position, prevP).divideScalar(dt);
        prevP.copy(ball.position);
        acc.subVectors(vel, prevV).divideScalar(dt);
        prevV.copy(vel);
        if (acc.length() > 60) acc.setLength(60);
        accLP.lerp(acc, Math.min(1, dt / 0.04));
        accHP.lerp(accLP, Math.min(1, dt / 0.25));
        X.root.getWorldQuaternion(qi).invert();
        down.set(0, -1, 0).applyQuaternion(qi);
        geff.copy(down).multiplyScalar(gravity ? PC_G : 0).sub(accLP);
        if (mode === "blob") {
          // free fall in the glass's frame: gravity (if back on) minus the glass's acceleration
          bvel.addScaledVector(geff, dt);
          bpos.addScaledVector(bvel, dt);
          const lim = RI - RB * (1 + 0.5 * Math.abs(A)), d = bpos.length();
          if (d > lim) {
            const nrm = tv.copy(bpos).divideScalar(d), vn = bvel.dot(nrm);
            bpos.multiplyScalar(lim / d);
            if (vn > 0) {
              bvel.addScaledVector(nrm, -1.25 * vn);
              bax.copy(nrm);
              Av -= 4 * vn / RB * 0.1;
              // gravity is back: the droplet lands and becomes a pool again
              if (gravity && geff.lengthSq() > 4) {
                n.copy(geff).negate().normalize();
                toPool(tv.copy(bvel).cross(n).multiplyScalar(-4));
              }
            }
          }
          bvel.multiplyScalar(Math.exp(-0.3 * dt));
          Av += (-WB * WB * A - 2 * ZB * WB * Av) * dt;
          A += Av * dt;
          A = Math.max(-0.35, Math.min(0.35, A));
          blob.position.copy(bpos);
          const P = blobGeo.attributes.position.array;
          for (let k = 0; k < P.length; k += 3) {
            const x = bp0[k], y = bp0[k + 1], z = bp0[k + 2], c = (x * bax.x + y * bax.y + z * bax.z) / RB;
            const f = 1 + A * 0.5 * (3 * c * c - 1);
            P[k] = x * f;
            P[k + 1] = y * f;
            P[k + 2] = z * f;
          }
          blobGeo.attributes.position.needsUpdate = true;
          blobGeo.computeVertexNormals();
          return;
        }
        // sloshing: the surface normal swings toward "up" of the effective gravity
        const gl = geff.length();
        if (gl > 0.5) {
          up.copy(geff).divideScalar(-gl);
          const w0 = W0 * Math.sqrt(gl / PC_G);
          nv.addScaledVector(tv.subVectors(up, n), w0 * w0 * dt).multiplyScalar(Math.exp(-2 * ZETA * w0 * dt));
        }
        n.addScaledVector(nv, dt).normalize();
        nv.addScaledVector(n, -nv.dot(n));
        basis();
        cut.uN.value.copy(n);
        // ripples: forced by sudden moves of the glass, shaken drops, carried round by a whirlpool
        const fu = (accLP.x - accHP.x) * eu.x + (accLP.y - accHP.y) * eu.y + (accLP.z - accHP.z) * eu.z;
        const fv = (accLP.x - accHP.x) * ev.x + (accLP.y - accHP.y) * ev.y + (accLP.z - accHP.z) * ev.z;
        if (shake > 0 && Math.random() < 0.6) splash((Math.random() * 2 - 1) * RC * 0.6, (Math.random() * 2 - 1) * RC * 0.6, -0.22 * shake, 4.5);
        // a still glass is never quite still: now and then a faint ripple
        if (Math.random() < dt * 1.2) splash((Math.random() * 2 - 1) * RC * 0.5, (Math.random() * 2 - 1) * RC * 0.5, -0.05, 3.5);
        // fingertips / controller tips dipped in the water push it down and stir it
        const tips = X.tips();
        tips.forEach((tp, ti) => {
          const rel = tv.subVectors(tp, ball.position), y = rel.dot(n) - S, pv = prevTip[ti] ?? (prevTip[ti] = tp.clone());
          const sp = pv.distanceTo(tp) / Math.max(dt, 1e-3);
          pv.copy(tp);
          if (rel.length() > RI || y > 8e-3 || y < -0.04) return;
          const u = rel.dot(eu), v = rel.dot(ev);
          if (Math.hypot(u, v) > RC * 0.92) return;
          splash(u, v, -Math.min(1.2, 0.08 + sp * 1.5) * dt * 60 * 0.12, 3);
        });
        prevTip.length = tips.length;
        // the slosh itself makes waves: the swing of the surface pushes on the water it leaves behind
        const su = nv.dot(eu) * 2.4, sv = nv.dot(ev) * 2.4;
        const SUB = 2, h = dt / SUB;
        for (let s = 0; s < SUB; s++) {
          for (let i = 1; i < G - 1; i++) for (let j = 1; j < G - 1; j++) {
            const k = i * G + j;
            if (!inside[k]) continue;
            const lap = (hgt[k - G] + hgt[k + G] + hgt[k - 1] + hgt[k + 1] - 4 * hgt[k]) / (DX * DX);
            // NU: a little viscosity on the surface speed, so grid-size wiggles die out first
            const lapv = (hv[k - G] + hv[k + G] + hv[k - 1] + hv[k + 1] - 4 * hv[k]) / (DX * DX);
            hv[k] += (CW * CW * lap + NU * lapv - GAM * hv[k] - (0.55 * (fu * (-RC + i * DX) + fv * (-RC + j * DX)) + 0.9 * (su * (-RC + i * DX) + sv * (-RC + j * DX)))) * h;
          }
          // heights saturate softly (a hard clip would turn every crest into a spike)
          for (let k = 0; k < G * G; k++) hgt[k] = inside[k] ? AMP * Math.tanh((hgt[k] + hv[k] * h) / AMP) : 0;
        }
        if (omega > 0.3) {
          // whirlpool: the ripples ride round with the water
          const a = omega * dt, c = Math.cos(a), sn = Math.sin(a);
          tmpH.set(hgt);
          for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
            const u = -RC + i * DX, v = -RC + j * DX;
            hgt[i * G + j] = inside[i * G + j] ? 0 : 0;
            if (!inside[i * G + j]) continue;
            const fi = (c * u + sn * v + RC) / DX, fj = (-sn * u + c * v + RC) / DX, i0 = Math.floor(fi), j0 = Math.floor(fj);
            if (i0 < 0 || j0 < 0 || i0 >= G - 1 || j0 >= G - 1) continue;
            const x = fi - i0, y = fj - j0, k = i0 * G + j0;
            hgt[i * G + j] = (tmpH[k] * (1 - x) + tmpH[k + G] * x) * (1 - y) + (tmpH[k + 1] * (1 - x) + tmpH[k + G + 1] * x) * y;
          }
          if (Math.random() < 0.2) splash((Math.random() - 0.5) * RC, (Math.random() - 0.5) * RC, -0.04, 3);
        }
        omega *= Math.exp(-dt / 2.5);
        // the surface mesh
        const k2 = omega * omega / (2 * PC_G);
        let vi = 0;
        const put = (rho, th) => {
          const u = rho * Math.cos(th), v = rho * Math.sin(th), y = S + sample(u, v) + k2 * (rho * rho - RC * RC);
          cp[vi * 3] = n.x * y + eu.x * u + ev.x * v;
          cp[vi * 3 + 1] = n.y * y + eu.y * u + ev.y * v;
          cp[vi * 3 + 2] = n.z * y + eu.z * u + ev.z * v;
          const fi = Math.round((u + RC) / DX), fj = Math.round((v + RC) / DX);
          const k = Math.max(0, Math.min(G - 1, fi)) * G + Math.max(0, Math.min(G - 1, fj));
          // troughs deep blue, crests pale, fast-moving water whitens: the waves read even where the light is flat
          const crest = Math.max(-1, Math.min(1, (hgt[k] || 0) / (AMP * 0.3))), foam = Math.min(1, Math.max(0, Math.abs(hv[k] || 0) / 0.35 - 0.3));
          // (linear colours) trough (0.02, 0.1, 0.32) -> crest (0.22, 0.5, 0.8) -> foam white
          const lv = 0.5 + 0.5 * crest, cr = 0.02 + 0.2 * lv, cg = 0.1 + 0.4 * lv, cb = 0.32 + 0.48 * lv;
          ccol[vi * 3] = cr + (0.9 - cr) * foam;
          ccol[vi * 3 + 1] = cg + (0.95 - cg) * foam;
          ccol[vi * 3 + 2] = cb + (1 - cb) * foam;
          vi++;
        };
        put(0, 0);
        for (let r = 1; r <= NR; r++) for (let s = 0; s < NS; s++) put(RC * r / NR, s / NS * Math.PI * 2);
        capGeo.attributes.position.needsUpdate = true;
        capGeo.attributes.color.needsUpdate = true;
        capGeo.computeVertexNormals();
      }
    };
  }
});
// 2 - Newton's cradle: steel balls on pendulums, touching. Contacts are Hertzian (force ~ overlap^1.5, a few
// microseconds long, with a little Hunt-Crossley damping), integrated in 5 us steps: so one ball in sends one ball
// out, then, as in a real cradle, the middle balls slowly join in until the whole row swings together
PC_EXHIBITS.push({
  id: "cradle",
  label: "Cradle",
  title: "Newton's cradle",
  blurb: "Momentum and energy pass down the row · pull balls back and let go",
  build(X) {
    const T = THREE6, NB = 5, r = 0.0175, L = 0.12, TOP = 0.19, ZS = 0.04;
    // steel: mass of one ball, contact stiffness (N / m^1.5), contact damping (s / m), air + string losses (1 / s)
    const MASS = 7850 * 4 / 3 * Math.PI * r ** 3, KH = 1e10, CH = 0.03, DAMP = 0.012, DT = 5e-6;
    const chrome = PC_MAT.chrome(), str = PC_MAT.string(), wood = PC_MAT.wood();
    X.root.add(new T.Mesh(new T.BoxGeometry(0.26, 0.014, 0.12), wood).translateY(7e-3));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = pcRod(2.5e-3, chrome, 10).set(new T.Vector3(sx * 0.115, 0.014, sz * ZS), new T.Vector3(sx * 0.115, TOP, sz * ZS));
      X.root.add(p);
    }
    for (const sz of [-1, 1]) X.root.add(pcRod(2.5e-3, chrome, 10).set(new T.Vector3(-0.115, TOP, sz * ZS), new T.Vector3(0.115, TOP, sz * ZS)));
    const x0 = (i) => (i - (NB - 1) / 2) * 2 * r;
    const F = new Float64Array(NB), touching = new Uint8Array(NB);
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
        // fine 5 us steps only while two balls press or are about to meet; otherwise 1 ms pendulum steps
        const near = () => {
          for (let i = 0; i + 1 < NB; i++) {
            const gap = pos(i + 1) - pos(i) - 2 * r, vrel = L * w[i] * Math.cos(th[i]) - L * w[i + 1] * Math.cos(th[i + 1]);
            // pressing, or closing in within the next coarse step (resting contact at zero gap needs neither)
            if (gap < -1e-7 || vrel > 1e-4 && gap < vrel * 1.2e-3 + 1e-6) return true;
          }
          return false;
        };
        for (let left = dt, guard = 0; left > 1e-9 && guard < 20000; guard++) {
          const h = Math.min(left, near() || held.some((x) => x !== null) ? DT : 1e-3);
          left -= h;
          F.fill(0);
          for (let i = 0; i + 1 < NB; i++) {
            const d = 2 * r - (pos(i + 1) - pos(i));
            if (d <= 0) {
              touching[i] = 0;
              continue;
            }
            const vrel = L * w[i] * Math.cos(th[i]) - L * w[i + 1] * Math.cos(th[i + 1]);
            // a new contact clacks as loud as it hits
            if (!touching[i]) clack = Math.max(clack, Math.abs(vrel)), touching[i] = 1;
            const f = Math.max(0, KH * d * Math.sqrt(d) * (1 + CH * vrel));
            F[i] -= f;
            F[i + 1] += f;
          }
          for (let i = 0; i < NB; i++) {
            if (held[i] !== null) {
              // a held ball follows the hand and is as heavy as the hand: contacts don't move it
              const prev = th[i];
              th[i] += (held[i] - th[i]) * Math.min(1, h * 40);
              w[i] = (th[i] - prev) / h;
              continue;
            }
            w[i] += (-PC_G / L * Math.sin(th[i]) - DAMP * w[i] + F[i] * Math.cos(th[i]) / (MASS * L)) * h;
            th[i] += w[i] * h;
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
