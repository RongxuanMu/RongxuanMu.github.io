// - the exhibits. build(X) fills X.root (stage-local: y up from the plate top, metres) and returns
// { update(dt, t) }. X.add registers interactables, X.action adds a button to the panel's action row -
var PC_EXHIBITS = [];
// 1 - water ball: Water Ball XR's water (src/water.js) floating over the plate: SPH held together by surface
// tension, drawn as one marching-cubes surface. Pull it apart with one or both hands, throw it, poke it with
// your fingers, drop it on the plate; Reform calls it back
PC_EXHIBITS.push({
  id: "water",
  label: "Water ball",
  title: "Water ball",
  blurb: "A ball of water held by surface tension · pull it apart with both hands, throw it, poke it, let it fall",
  build(X) {
    const T = THREE6, app = X.app, mobile = WB_MOBILE;
    const home = new T.Vector3(0, 0.17, 0);
    const sim = new WaterSim(mobile ? 460 : 620);
    sim.floorR2 = (PC_PLATE_R - 4e-3) ** 2;
    sim.tension = 0.15 + 0.8 * 0.6;
    sim.reset(home);
    // reflections: Water Ball XR's soft sky with two light panels, built once per page
    pcWaterEnv ||= (() => {
      const pm = new T.PMREMGenerator(app.renderer), tex = pm.fromScene(wbEnvScene([3426911, 5596796, 2042931]), 0.04).texture;
      pm.dispose();
      return tex;
    })();
    const surface = new WaterSurface(sim, mobile ? 30 : 40, pcWaterEnv);
    surface.uniforms.wbClear.value = 0.75 * Math.pow(1 - 0.8, 1.6) + 0.03;
    surface.mc.renderOrder = 2;
    X.root.add(surface.mc);
    const drops = wbDroplets(sim);
    drops.renderOrder = 3;
    drops.uniforms.uClear.value = surface.uniforms.wbClear.value;
    X.root.add(drops);
    let look = 0;
    const tint = () => {
      const [col, glow] = WB_WATER[look];
      surface.mat.color.setHex(col);
      surface.uniforms.wbGlow.value.setHex(glow);
      drops.uniforms.uColor.value.setHex(col);
    };
    tint();
    // the ball as one interactable (multi: every hand gets its own grab), following the water's centre and size
    const collider = new T.Mesh(new T.SphereGeometry(1, 24, 16), new T.MeshBasicMaterial({ visible: false }));
    collider.name = "water";
    // (no outline hull for the invisible sphere: the framework would draw it as a grey disc on press)
    collider.userData.noHighlight = true;
    X.root.add(collider);
    const it = X.add(collider, { multi: true, highlight: false, precise: true, dragThreshold: 0 });
    const sound = new WbSound(app.sfx), grabSources = new Set(), W = (p) => X.stage.localToWorld(p.clone());
    it.on("press", (e) => {
      const pt = X.local(e.point);
      if (sim.grab(e.interactor, pt)) {
        if (e.interactor?.source) grabSources.add(e.interactor.source);
        sound.bloop(W(pt));
      }
    });
    it.on("drag", (e) => sim.grabs.get(e.interactor)?.target.copy(X.local(e.point)));
    it.on("release", (e) => {
      const g = sim.grabs.get(e.interactor);
      if (g) sim.grabs.delete(e.interactor), sound.plop(W(g.target));
      grabSources.delete(e.interactor?.source);
    });
    it.on("tap", (e) => {
      const pt = X.local(e.point);
      sim.splash(pt, 0.9, 0.1);
      sound.budget += 6;
      sound.burst(W(pt), 5, 1.1);
    });
    let reformT = 0, gravity = false;
    const reform = () => {
      if (reformT <= 0 && (sim.gravity || sim.centroid.distanceTo(home) > 0.1)) sound.rise(W(home));
      sim.gravity = gravity = false;
      gravB?.setValue(false);
      reformT = 2.2;
    };
    X.action("Reform", reform);
    const gravB = X.action("Gravity", (v) => {
      gravity = sim.gravity = v;
      if (!v) reform();
    }, { toggle: true });
    X.action("Splash", () => {
      sim.splash(sim.centroid.clone().add(new T.Vector3(0, -0.04, 0.03)), 2.2, 0.2);
      sound.budget += 14;
      sound.burst(W(sim.centroid), 12, 1.3, 0.25);
    });
    X.action("Colour", () => {
      look = (look + 1) % WB_WATER.length;
      tint();
    });
    // fingers and controller tips that are not holding water push it (in plate space)
    const colliders = () => {
      const out = [];
      if (!app.sessionMode) return out;
      const v = new T.Vector3();
      for (const s of app.input.sources.values()) {
        if (!s.tracked || grabSources.has(s)) continue;
        if (s.kind === "hand") {
          for (const j of s.joints) if (j.valid) {
            X.stage.worldToLocal(v.copy(j.pos));
            out.push([v.x, v.y, v.z, Math.max(j.radius, 8e-3) * 1.5]);
          }
          if (s.joints[0].valid) X.stage.worldToLocal(v.copy(s.palmCenter)), out.push([v.x, v.y, v.z, 0.03]);
        } else if (s.kind === "controller") {
          if (s.grip.valid) X.stage.worldToLocal(v.copy(s.grip.pos)), out.push([v.x, v.y, v.z, 0.04]);
          if (s.ray.valid) X.stage.worldToLocal(v.copy(s.pokePoint)), out.push([v.x, v.y, v.z, 0.02]);
        }
      }
      return out;
    };
    let agitation = 0, lone0 = 0;
    const prevC = sim.centroid.clone(), vc = new T.Vector3(), tmp = new T.Vector3();
    const near = (c, r) => W(tmp.set(c.x + (Math.random() - 0.5) * r, c.y + (Math.random() - 0.5) * r, c.z + (Math.random() - 0.5) * r));
    return {
      update(dt) {
        sim.updateCentroid();
        if (reformT > 0) {
          reformT -= dt;
          sim.anchor.copy(home);
          sim.pullMax = 14;
          sim.damping = 6;
        } else {
          sim.anchor.copy(sim.centroid);
          sim.pullMax = 6;
          sim.damping = 0.5;
          // fell off the plate, or drifted away: call it back
          if (sim.centroid.y < -0.25 || !sim.gravity && sim.centroid.length() > 0.8) reform();
        }
        sim.setColliders(colliders());
        sim.step(dt);
        surface.update();
        drops.sync();
        const ext = surface.ext;
        collider.position.copy(sim.centroid);
        collider.scale.setScalar(sim.gravity ? Math.max(ext.x, ext.y, ext.z) * 0.8 : Math.max(0.06, Math.min(ext.x, ext.y, ext.z) - 0.04));
        collider.updateMatrixWorld();
        // sound: Water Ball XR's bubbles, placed in the room
        const head = app.input.head;
        sound.listener(head, app.sessionMode ? app.input.headQuat : app.camera.quaternion);
        sound.budget = Math.min(sound.budget + dt * 18, 12);
        const c = sim.centroid;
        vc.subVectors(c, prevC).divideScalar(Math.max(dt, 1e-3));
        prevC.copy(c);
        const v = sim.v;
        let a = 0, lone = 0;
        for (let i = 0, b = 0; i < sim.n; i++, b += 3) {
          a += Math.abs(v[b] - vc.x) + Math.abs(v[b + 1] - vc.y) + Math.abs(v[b + 2] - vc.z);
          if (sim.nc[i] < 3) lone++;
        }
        a /= sim.n;
        agitation += (a - agitation) * Math.min(1, dt * 6);
        if (Math.random() < Math.max(0, agitation - 0.12) * 22 * dt) sound.drip(near(c, 0.1), Math.min(1, 0.35 + agitation));
        if (lone < lone0 - 2) sound.burst(near(c, 0.1), Math.min(2, lone0 - lone - 1), 0.8, 0.08);
        if (lone > lone0 + 6) sound.bubble(W(c), { f0: 300 + Math.random() * 100, rise: 1.7, dur: 0.1, gain: 0.16 });
        lone0 = lone;
        if (sim.pokes > 0.03 && Math.random() < Math.min(0.6, sim.pokes * 1.2)) sound.drip(near(c, 0.08), Math.min(1.2, 0.4 + sim.pokes * 4));
        sim.pokes = 0;
        if (sim.floorHits > 0.02) sound.burst(W(sim.floorAt), Math.min(6, 1 + Math.floor(sim.floorHits * 12)), Math.min(1.4, 0.5 + sim.floorHits * 2), 0.06);
        sim.floorHits = 0;
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
        if (clack > 0.02) X.sfx.clack(Math.min(0.3, clack * 0.6));
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
    const air = X.sfx.voice("whoosh");
    return {
      update(dt) {
        // the air the arms cut: louder and brighter the faster the outer bob whirls
        const spd = held ? 0 : Math.abs(sA[1]) + Math.abs(sA[3]) + (twin ? 0.6 * (Math.abs(sB[1]) + Math.abs(sB[3])) : 0);
        air.set(Math.min(0.22, Math.max(0, spd - 4) * 0.012), 280 + spd * 45);
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
    const T = THREE6, NP = 15, PERIOD = 60, N0 = 51, W = 0.26;
    const L = Array.from({ length: NP }, (_, k) => PC_G * (PERIOD / (2 * Math.PI * (N0 + k))) ** 2);
    // the frame is as tall as the longest pendulum (34 cm for 51 swings a minute) plus room for its bob over the base
    const TOP = Math.max(...L) + 0.035;
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
    // each bob sounds a note as it swings through the bottom: shortest highest, a pentatonic scale across fifteen
    const PENTA = [0, 2, 4, 7, 9], note = (k) => 330 * Math.pow(2, (Math.floor(k / 5) * 12 + PENTA[k % 5]) / 12);
    const prevTh = new Float32Array(NP);
    const clock = X.text(0.12);
    clock.position.set(0, TOP + 0.03, 0);
    X.root.add(clock);
    return {
      update(dt) {
        if (!held) t0 += dt * (slow ? 0.35 : 1);
        clock.userData.draw(held ? "let go to start" : `${t0.toFixed(1)} s of ${PERIOD} s`);
        for (let k = 0; k < NP; k++) {
          const th = held ? A : A * Math.cos(om[k] * t0) * Math.exp(-t0 * 2e-3);
          if (!held && Math.abs(A) > 0.05 && Math.sign(th) !== Math.sign(prevTh[k]) && prevTh[k] !== 0) X.sfx.note(note(NP - 1 - k), 0.035, 0.5);
          prevTh[k] = th;
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
  blurb: "XPBD cloth on a rail · grab it with one hand or both and pull (a pinned corner stays where you leave it) · fingertips push it",
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
    // one grip per hand: both hands can hold the cloth at once and stretch it between them
    const grips = /* @__PURE__ */ new Map();
    let wind = false, ballOn = false;
    const rustle = X.sfx.voice("rustle");
    const ball = new T.Mesh(new T.SphereGeometry(0.055, 32, 20), pcStd(13421772, { roughness: 0.6 }));
    ball.position.set(0, 0.08, 0.02);
    ball.visible = false;
    ball.userData.noCollider = true;
    X.root.add(ball);
    const it = X.add(mesh, { precise: true, highlight: false, multi: true, box: new T.Box3(new T.Vector3(-0.2, 0, -0.2), new T.Vector3(0.2, 0.42, 0.2)) });
    it.on("press", (e) => {
      const p = X.local(e.point), taken = new Set([...grips.values()].map((g) => g.i));
      let best = 0.04, bi = -1;
      for (let i = 0; i < N; i++) {
        if (taken.has(i)) continue;
        const d = Math.hypot(x[i * 3] - p.x, x[i * 3 + 1] - p.y, x[i * 3 + 2] - p.z);
        if (d < best) best = d, bi = i;
      }
      if (bi < 0) return;
      grips.set(e.interactor, { i: bi, target: p.clone() });
      X.sfx.tick(0.12, 700, 0.06);
    });
    it.on("drag", (e) => grips.get(e.interactor)?.target.copy(X.local(e.point)));
    it.on("release", (e) => {
      const g = grips.get(e.interactor);
      if (g && !pinned[g.i]) w[g.i] = 1;
      grips.delete(e.interactor);
    });
    X.action("Wind", (on) => wind = on, { toggle: true });
    X.action("Ball", (on) => ballOn = ball.visible = on, { toggle: true });
    X.action("Drop", () => {
      pinned.fill(0);
      const held = new Set([...grips.values()].map((g) => g.i));
      for (let i = 0; i < N; i++) if (!held.has(i)) w[i] = 1;
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
          for (const { i, target } of grips.values()) {
            w[i] = 0;
            x.set([target.x, target.y, target.z], i * 3);
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
        // fabric rustle with how fast the cloth moves
        let sp = 0;
        for (let i = 0; i < N; i += 3) sp += Math.abs(v[i * 3]) + Math.abs(v[i * 3 + 1]) + Math.abs(v[i * 3 + 2]);
        sp /= N / 3;
        rustle.set(Math.min(0.28, Math.max(0, sp - 0.08) * 0.35), 1800 + sp * 1500);
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
