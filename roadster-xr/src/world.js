// a grab bar under a floating panel: drag it to put the panel anywhere (it keeps facing you); onMoved is told
// where it ended up, so the panel rides with the stage from there. The box covers only the bar.
var _rnLook = new THREE6.Object3D();
function rnPanelHandle(ctx, root, { w = 0.12, y = -0.16, onMoved = null } = {}) {
  const T = THREE6, bar = new T.Mesh(new T.CapsuleGeometry(5e-3, w, 4, 12).rotateZ(Math.PI / 2), new T.MeshBasicMaterial({ color: 12632256 }));
  bar.position.set(0, y, 4e-3);
  bar.userData.noCollider = bar.userData.noHighlight = true;
  root.add(bar);
  const it = ctx.add(root, {
    draggable: true, highlight: false,
    box: new T.Box3(new T.Vector3(-w / 2 - 0.012, y - 0.013, -0.012), new T.Vector3(w / 2 + 0.012, y + 0.013, 0.016)),
    constrain: ({ position, quaternion }) => {
      _rnLook.position.copy(position);
      _rnLook.lookAt(ctx.app.input.head);
      quaternion.copy(_rnLook.quaternion);
    }
  });
  it.on("statechange", ({ level }) => bar.material.color.setHex(level ? 16777215 : 12632256));
  if (onMoved) it.on("dragend", onMoved);
  return it;
}
// - the world: the diorama on your floor (or a tabletop), its bar, the console riding with it, the show and
// the drive -
var RoadsterNight = {
  id: "roadster",
  title: "Roadster Night",
  init(ctx) {
    const { root, THREE: T } = ctx, app = this.app = ctx.app;
    this.ctx = ctx;
    if (!rnEnv) {
      const pm = new T.PMREMGenerator(app.renderer);
      rnEnv = pm.fromScene(new RnRoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    this.tableTop = app.sessionMode ? T.MathUtils.clamp(app.input.head.y - RN_TABLE_BELOW_HEAD, 0.55, 1.6) : 1.1;
    root.add(new T.HemisphereLight(13424895, 2236962, 1.5));
    const moon = new T.DirectionalLight(16773335, 2.4);
    moon.position.set(0.4, 1, 0.9);
    root.add(moon);
    const back = new T.DirectionalLight(10275071, 1.2);
    back.position.set(-0.3, 0.8, -1);
    root.add(back);
    // stage (hand-sized frame: bar, rim) > mini (1:60, real metres) > venue, ramp, car, vapour
    const stage = this.stage = new T.Group();
    stage.name = "stage";
    root.add(stage);
    const plinth = new T.Mesh(new T.CylinderGeometry(RN_STAGE_R + 0.01, RN_STAGE_R + 0.01, 0.012, 96), new T.MeshStandardMaterial({ color: 0, roughness: 0.6 }));
    plinth.position.y = 6e-3;
    plinth.userData.noCollider = plinth.userData.noHighlight = true;
    stage.add(plinth);
    stage.add(rnLines(rnCircle(RN_STAGE_R + 0.01, 0.013), { px: 3, opacity: 0.95 }));
    const mini = this.mini = new T.Group();
    mini.scale.setScalar(RN_SC);
    mini.position.y = 0.0125;
    stage.add(mini);
    const venue = this.venue = rnBuildVenue();
    mini.add(venue);
    this.V = venue.userData;
    const tex = rnPuffTexture();
    this.puffs = new RnParticles(900, { size: 1.6, tex });
    this.smoke = new RnParticles(300, { size: 2.4, tex });
    this.sparks = new RnParticles(600, { size: 0.9, tex });
    mini.add(this.puffs.points, this.smoke.points, this.sparks.points);
    const carG = rnBuildRoadster();
    mini.add(carG);
    this.car = new RnCar(carG, this.puffs, this.smoke);
    // headlight beams for the finale flash
    const beam = new T.Mesh(new T.ConeGeometry(3.5, 16, 16, 1, true).translate(0, -8, 0).rotateZ(Math.PI / 2), new T.MeshBasicMaterial({ color: 15661055, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    beam.position.set(2.3, 0.4, 0);
    beam.visible = false;
    beam.userData.noCollider = beam.userData.noHighlight = true;
    carG.add(beam);
    this.beam = beam;
    // blob shadow keeps the car on the pad when it flies
    const sc = document.createElement("canvas");
    sc.width = sc.height = 64;
    const sg = sc.getContext("2d"), gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(0,0,0,0.7)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    sg.fillStyle = gr;
    sg.fillRect(0, 0, 64, 64);
    this.shadow = new T.Mesh(new T.PlaneGeometry(6, 3).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.userData.noCollider = this.shadow.userData.noHighlight = true;
    mini.add(this.shadow);
    // a goal ring where you pinched
    this.goal = new T.Mesh(new T.RingGeometry(1.6, 2.1, 40).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.9, depthWrite: false }));
    this.goal.position.y = 0.06;
    this.goal.visible = false;
    this.goal.userData.noCollider = this.goal.userData.noHighlight = true;
    mini.add(this.goal);
    // the stage bar on the near edge: move the stage, two hands turn and scale it
    const R = RN_STAGE_R + 0.09;
    const bar = new T.Mesh(new T.CapsuleGeometry(0.018, 0.34, 6, 20).rotateZ(Math.PI / 2), new T.MeshStandardMaterial({ color: 1118481, roughness: 0.5 }));
    bar.position.set(0, 0.03, R);
    bar.userData.noCollider = bar.userData.noHighlight = true;
    stage.add(bar);
    const barLine = rnLines([-0.17, 0.052, R, 0.17, 0.052, R], { px: 2, opacity: 0.8 });
    stage.add(barLine);
    this.stageIt = ctx.add(stage, {
      draggable: true,
      translateOnly: true,
      twoHand: true,
      highlight: false,
      box: new T.Box3(new T.Vector3(-0.21, 0, R - 0.035), new T.Vector3(0.21, 0.07, R + 0.035)),
      constrain: ({ position, quaternion, scale }) => {
        position.y = this.stageY ?? position.y;
        const e = new T.Euler().setFromQuaternion(quaternion, "YXZ");
        quaternion.setFromEuler(e.set(0, e.y, 0, "YXZ"));
        scale.setScalar(T.MathUtils.clamp(scale.x, 0.2, 1.6));
      }
    });
    this.stageIt.on("statechange", ({ level }) => {
      bar.material.color.setHex(level ? 5592405 : 1118481);
      barLine.material.opacity = level ? 1 : 0.8;
    });
    // the pad is a target: point + pinch anywhere on it and the car drives there
    this.padIt = ctx.add(this.V.pad, { highlight: false, dragThreshold: 0, box: new T.Box3(new T.Vector3(-RN_PAD_R, -0.3, -RN_PAD_R), new T.Vector3(RN_PAD_R, 0.3, RN_PAD_R)) });
    this.padIt.on("press", (e) => {
      const p = this.mini.worldToLocal(e.point.clone());
      if (Math.hypot(p.x, p.z) < RN_PAD_R - 3) this.goTo(p.x, p.z);
    });
    // the car: grab it, lift it, let go - it lands on its thrusters
    this.carIt = ctx.add(carG, {
      draggable: true, highlight: false,
      box: new T.Box3(new T.Vector3(-3.2, -0.4, -1.8), new T.Vector3(3.2, 2.2, 1.8)),
      constrain: ({ quaternion, scale }) => {
        if (this._grabQ) quaternion.copy(this._grabQ), scale.copy(this._grabS);
      }
    });
    this.carIt.on("dragstart", () => {
      this._grabQ = carG.getWorldQuaternion(new T.Quaternion());
      this._grabS = carG.getWorldScale(new T.Vector3());
      this.setMode("drive");
      this.manualGen = null;
      this.car.held = true;
      this.car.v = 0;
      this.goal.visible = false;
    }).on("dragend", () => {
      this.car.held = false;
      this._grabQ = null;
      if (this.car.pos.y > 0.05) this._run(rnFly(this.car, { vx: 0, sound: this.sound }));
    });
    this._buildConsole(ctx);
    // status line over the far side of the stage, and a hint along its near edge
    this.capTex = textTexture("", { w: 1024, h: 64, size: 34 });
    this.capMesh = new T.Mesh(new T.PlaneGeometry(0.9, 0.9 / 16), new T.MeshBasicMaterial({ map: this.capTex, transparent: true, depthWrite: false }));
    this.capMesh.userData.noCollider = this.capMesh.userData.noHighlight = true;
    root.add(this.capMesh);
    const hint = ctx.label("Grab the joystick to drive · pinch the pad to send the car · grab the car · the bar moves the stage", { height: 0.016 });
    hint.position.set(0, 0.004, R + 0.08);
    hint.rotation.x = -Math.PI / 2.4;
    hint.userData.noCollider = hint.userData.noHighlight = true;
    stage.add(hint);
    this.sound = new RnSound(app);
    this.keys = new Set();
    this._kd = (e) => {
      if (e.target?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === " ") this.thrust();
      else if (k === "shift") this.launch();
      else if (k === "p") this.setPlaying(!(this.mode === "show" && !this.paused));
      else if ("1234".includes(k) && k.length === 1) this.setMode("show", +k - 1);
      else {
        this.keys.add(k);
        return;
      }
      e.preventDefault();
    };
    this._ku = (e) => this.keys.delete(e.key.toLowerCase());
    addEventListener("keydown", this._kd);
    addEventListener("keyup", this._ku);
    this.clock = 0;
    this.slow = 1;
    this.cheerT = 0;
    this.fw = false;
    this.fwAt = 0;
    this._placeStage(this.tabletop ?? false);
    this.car.place(RN_LAUNCH.x0, RN_LAUNCH.z, 0);
    this.setMode("show", 0);
  },
  // - console: show controls (left), drive joystick (right); both ride with the stage -
  _buildConsole(ctx) {
    const T = THREE6, b = (label, o) => ctx.button(label, { w: 0.066, h: 0.026, fontSize: 22, ...o });
    const panel = this.panel = ctx.panel("Roadster Night · the show", { w: 0.3, h: 0.155 });
    this.btn = {
      play: b("Playing", { toggle: true, value: true, onClick: (v) => this.setPlaying(v) }),
      acts: RN_ACTS.map((a, i) => b(a.label, { onClick: () => this.setMode("show", i) })),
      slow: b("Slow-mo", { toggle: true, onClick: (v) => this.slow = v ? 0.3 : 1 }),
      drive: b("Drive", { toggle: true, onClick: (v) => v ? this.setMode("drive") : this.setMode("show", 0) }),
      table: b("Tabletop", { toggle: true, value: !!this.tabletop, onClick: (v) => {
        this._placeStage(v);
      } }),
      sound: b("Sound", { toggle: true, value: true, onClick: (v) => this.sound.on = v }),
      reset: b("Reset", { onClick: () => this.reset() })
    };
    const B = this.btn;
    panel.layout([B.play, ...B.acts, B.slow, B.drive, B.table, B.sound, B.reset], { cols: 4, top: 0.03 });
    ctx.add(panel.root.children[0], { near: false, highlight: false });
    ctx.root.add(panel.root);
    const joy = this.joyPanel = ctx.panel("Drive · grab the knob", { w: 0.15, h: 0.19 });
    const R = this.joyR = 0.042;
    const pad = new T.Group();
    pad.position.set(0, 0.002, 2e-3);
    pad.add(rnLines(rnCircle(R, 0, 64), { px: 2, opacity: 0.8 }).rotateX(Math.PI / 2));
    joy.root.add(pad);
    const knob = new T.Mesh(new T.SphereGeometry(0.014, 24, 16), new T.MeshStandardMaterial({ color: 16777215, roughness: 0.4 }));
    knob.position.z = 0.01;
    pad.add(knob);
    this.joy = new T.Vector2();
    const knobIt = ctx.add(knob, { dragThreshold: 0 });
    const drive = (e) => {
      const p = pad.worldToLocal(e.point.clone());
      p.z = 0;
      if (p.length() > R) p.setLength(R);
      knob.position.set(p.x, p.y, 0.01);
      this.joy.set(p.x / R, p.y / R);
    };
    knobIt.on("press", drive).on("drag", drive).on("release", () => {
      knob.position.set(0, 0, 0.01);
      this.joy.set(0, 0);
    });
    const thr = ctx.button("Thrust", { w: 0.062, h: 0.026, fontSize: 24, onClick: () => this.thrust() });
    const lau = ctx.button("Launch", { w: 0.062, h: 0.026, fontSize: 24, onClick: () => this.launch() });
    thr.root.position.set(-0.034, -0.065, 0);
    lau.root.position.set(0.034, -0.065, 0);
    joy.root.add(thr.root, lau.root);
    ctx.add(joy.root.children[0], { near: false, highlight: false });
    ctx.root.add(joy.root);
    this.panelIts = new Map();
    for (const [root, w, h] of [[panel.root, 0.14, 0.155], [joy.root, 0.08, 0.19]]) this.panelIts.set(root, rnPanelHandle(ctx, root, { w, y: -h / 2 - 0.014, onMoved: () => this._remember(root) }));
  },
  // floor: real floor (1.6 m under your head), 1.8 m across; tabletop: the same at 0.42 on a desk in front of you
  _placeStage(tabletop) {
    this.tabletop = tabletop;
    const st = this.stage, top = this.tableTop, app = this.app;
    if (tabletop) {
      st.position.set(0, top - 0.02, -0.75);
      st.scale.setScalar(RN_TABLE_SCALE);
    } else {
      st.position.set(0, app.sessionMode ? app.input.head.y - RN_FLOOR_BELOW_HEAD : 0, -1.55);
      st.scale.setScalar(1);
    }
    st.rotation.set(0, 0, 0);
    this.stageY = st.position.y;
    const y = tabletop ? top + 0.02 : top + 0.05;
    this.panel.root.position.set(-0.45, y, -0.38);
    this.panel.root.lookAt(0, y + 0.45, 0.35);
    this.joyPanel.root.position.set(0.43, y - 0.02, -0.38);
    this.joyPanel.root.lookAt(0, y + 0.45, 0.35);
    // the console rides with the stage: poses stored relative to its position and heading (not its scale)
    const F = this._stageFrame(new THREE6.Matrix4()).invert();
    this.consoleRel = [this.panel.root, this.joyPanel.root].map((o) => {
      o.updateMatrix();
      return { o, m: F.clone().multiply(o.matrix) };
    });
    this.btn?.table.setValue(tabletop);
  },
  _stageFrame(out) {
    return out.compose(this.stage.position, this.stage.quaternion, new THREE6.Vector3(1, 1, 1));
  },
  _remember(o) {
    const e = this.consoleRel?.find((x) => x.o === o);
    if (!e) return;
    o.updateMatrix();
    e.m = this._stageFrame(new THREE6.Matrix4()).invert().multiply(o.matrix);
  },
  // - modes: the show plays its acts on a loop; drive hands the car to you -
  setMode(mode, act = 0) {
    this.mode = mode;
    this.paused = false;
    this.manualGen = null;
    this.goal.visible = false;
    this.fireworks(false);
    this.flash(0);
    this.lamps(3342336);
    this.car.suction = 0;
    this.car.steer = 0;
    if (mode === "show") {
      // an act starts from the car on the ground wherever it is
      if (this.car.air || this.car.pos.y > 0) this.car.pos.y = 0, this.car.air = false, this.car.setYaw(this.car.yaw);
      this.gen = rnShow(this, act);
      this.gen.next(0);
    } else {
      this.gen = null;
      if (this.car.air) this._run(rnFly(this.car, { vx: 0, sound: this.sound }));
      this.caption("Drive · joystick, thumbstick or WASD · Thrust hops · Launch is 0–60 · roll into the curl ramp");
      this.screen({ title: "DRIVE", sub: "YOUR TURN" });
    }
    this.btn.play.setValue(mode === "show");
    this.btn.drive.setValue(mode === "drive");
  },
  setPlaying(on) {
    if (on) {
      if (this.mode !== "show") this.setMode("show", 0);
      else this.paused = false;
    } else if (this.mode === "show") this.paused = true;
    this.btn.play.setValue(on);
    this.btn.play.setLabel?.(on ? "Playing" : "Paused");
  },
  onAct(i) {
    this.actIdx = i;
    this.btn.acts.forEach((b, k) => b.root.scale.setScalar(k === i ? 1.12 : 1));
    this.app.log(`act → ${RN_ACTS[i].id}`);
  },
  _run(gen) {
    gen.next(0);
    this.manualGen = gen;
  },
  goTo(x, z) {
    if (this.car.held) return;
    if (this.mode !== "drive") this.setMode("drive");
    if (this.car.air) return;
    const h = Math.atan2(-(z - this.car.pos.z), x - this.car.pos.x) * 180 / Math.PI;
    this._run(rnFollow(this.car, rnRoute(this.car, [[x, z, h]], { vmax: 12 })));
    this.manualGen.route = true;
    this.goal.position.set(x, 0.06, z);
    this.goal.visible = true;
  },
  thrust() {
    if (this.mode !== "drive") this.setMode("drive");
    if (this.car.air || this.car.held || this.manualGen && !this.manualGen.route) return;
    this.goal.visible = false;
    this._run(rnHop(this, {}));
  },
  launch() {
    if (this.mode !== "drive") this.setMode("drive");
    if (this.car.air || this.car.held || this.manualGen && !this.manualGen.route) return;
    this.goal.visible = false;
    const car = this.car, t0 = this.clock;
    this.sound.whoosh();
    this._run(rnStraight(car, () => 33.1, (c) => c.v >= 26.82 || this._blocked(c.pos), (dt) => {
      car.thrust(-2.35, 0.48, 0, -1, 0, 0, 140, dt, 18);
      this.sound.hiss(1);
      this.screen({ title: `${(this.clock - t0).toFixed(2)} s`, sub: `${Math.round(car.v * 2.237)} MPH`, big: true });
    }));
  },
  reset() {
    this.car.held = false;
    this.car.place(RN_LAUNCH.x0, RN_LAUNCH.z, 0);
    this._placeStage(this.tabletop);
    this.setMode("show", 0);
  },
  // - hooks the acts use -
  caption(s) {
    if (s !== this._cap) this.capTex.userData.draw(this._cap = s);
  },
  screen({ title = "", sub = "", big = false }) {
    const key = `${title}|${sub}|${big}`;
    if (key === this._scr) return;
    this._scr = key;
    const c = this.V.screenCanvas, g = c.getContext("2d");
    g.fillStyle = "#05070a";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 6;
    g.strokeRect(10, 10, c.width - 20, c.height - 20);
    g.textAlign = "center";
    g.fillStyle = "#ffffff";
    g.font = `800 ${big ? 190 : 150}px system-ui, sans-serif`;
    g.fillText(title, c.width / 2, big ? 220 : 210, c.width - 60);
    g.fillStyle = "#ffcc66";
    g.font = "600 58px system-ui, sans-serif";
    g.fillText(sub, c.width / 2, 340, c.width - 60);
    this.V.screenTex.needsUpdate = true;
  },
  lamp(i, color) {
    this.V.lamps[i].material.color.setHex(color);
  },
  lamps(color) {
    for (const l of this.V.lamps) l.material.color.setHex(color);
  },
  cheer(level) {
    this.cheerT = Math.max(this.cheerT, 2.5 * level);
    this.sound.cheer(2.5 + level, 0.12 * level);
  },
  fireworks(on) {
    this.fw = on;
  },
  flash(on) {
    this.beam.visible = !!on;
    this.car.g.userData.front.scale.set(1, on ? 2.2 : 1, on ? 1.15 : 1);
  },
  // - driving by hand -
  _readManual(out) {
    out[0] = out[1] = 0;
    if (this.joy.lengthSq() > 4e-3) return out[0] = this.joy.y, out[1] = -this.joy.x, out;
    for (const s of this.app.input.sources.values()) {
      if (s.kind !== "controller" || s.stick.lengthSq() < 0.03) continue;
      const g = this.app.im.group(s);
      if (g?.list.some((i) => i.selecting)) continue;
      return out[0] = -s.stick.y, out[1] = -s.stick.x, out;
    }
    const k = this.keys, on = (...n) => n.some((x) => k.has(x));
    out[0] = (on("w", "arrowup") ? 1 : 0) - (on("s", "arrowdown") ? 1 : 0);
    out[1] = (on("a", "arrowleft") ? 1 : 0) - (on("d", "arrowright") ? 1 : 0);
    return out;
  },
  // stands, rocket stand, the ramp's structure, the line-up (on the ground), the pad's edge
  _blocked(p) {
    const r = Math.hypot(p.x, p.z), a = (Math.atan2(p.z, p.x) * 180 / Math.PI + 360) % 360, L = RN_LOOP, dz = Math.abs(p.z - L.z);
    if (r > RN_PAD_R - 3) return true;
    if (r > 37 && a > 243 && a < 301) return true;
    if (Math.hypot(p.x + 32.1, p.z + 35.7) < 7) return true;
    if (p.x > L.x - 1.8 && p.x < L.x + L.R + 1 && dz < 4.8 && !(dz < 2.4 && p.x < L.x + 0.3)) return true;
    if (p.y < 1) for (const v of this.V.lineup) if (p.x > v.x0 - 1.1 && p.x < v.x1 + 1.1 && p.z > v.z0 - 1.1 && p.z < v.z1 + 1.1) return true;
    return false;
  },
  _drive(dt) {
    const car = this.car, m = this._readManual(this._m ??= [0, 0]), L = RN_LOOP;
    const thr = m[0], st = m[1];
    if (thr > 0) car.v += thr * (car.v < 0 ? 18 : 12) * dt;
    else if (thr < 0) car.v += thr * (car.v > 0 ? 18 : 7) * dt;
    else car.v -= Math.sign(car.v) * Math.min(Math.abs(car.v), 3 * dt);
    car.v = THREE6.MathUtils.clamp(car.v - car.v * 0.06 * dt, -7, 36);
    car.steer += (st - car.steer) * Math.min(1, dt * 6);
    const yr = THREE6.MathUtils.clamp(car.v * Math.tan(car.steer * 0.5) / 2.84, -2.4, 2.4);
    car.setYaw(car.yaw + yr * dt);
    const old = car.pos.clone();
    car.pos.addScaledVector(car.fwd(_rnV), car.v * dt);
    if (this._blocked(car.pos)) {
      car.pos.copy(old);
      if (Math.abs(car.v) > 2) this.sound.thud();
      car.v *= -0.3;
    }
    if (Math.abs(car.v) > 20 && Math.abs(car.steer) > 0.5) car.tyreSmoke(30, dt);
    // rolling into the curl ramp's run-in, square and quick enough, takes the ramp
    if (Math.abs(car.pos.z - L.z) < 2.2 && car.pos.x > L.x - 5 && car.pos.x < L.x && Math.cos(car.yaw) > 0.9 && car.v > 6) this._run(rnLoopRun(this, Math.max(car.v, 18)));
  },
  update(dt, t) {
    dt = Math.min(dt, 1 / 30);
    const sd = dt * this.slow, car = this.car;
    this.clock += sd;
    if (this.mode === "show") {
      if (!this.paused && this.gen) this.gen.next(sd);
    } else if (car.held) {
      car.pos.copy(car.g.position);
      car.pos.y = Math.max(0, car.pos.y);
    } else {
      // the knob (or a stick) takes over from a pinch route; stunts run to the end
      if (this.manualGen?.route && Math.abs(this._readManual(this._m ??= [0, 0])[0]) + Math.abs(this._m[1]) > 0.2) this.manualGen = null, this.goal.visible = false;
      if (this.manualGen) {
        if (this.manualGen.next(sd).done) {
          this.manualGen = null;
          this.goal.visible = false;
        }
      } else this._drive(sd);
      if (this.mode === "drive" && !this.manualGen) this.screen({ title: `${Math.round(Math.abs(car.v) * 2.237)} MPH`, sub: "DRIVE" });
    }
    // taking the knob or a stick during the show hands you the car
    if (this.mode === "show") {
      const m = this._readManual(this._m ??= [0, 0]);
      if (Math.abs(m[0]) + Math.abs(m[1]) > 0.3) this.setMode("drive");
    }
    for (const s of this.app.input.sources.values()) if (s.kind === "controller" && s.buttonDown?.a) this.thrust();
    if (!car.held) car.sync(sd);
    else car.g.quaternion.copy(car.q);
    const ws = this.stage.scale.x * RN_SC;
    this.puffs.update(sd, ws);
    this.smoke.update(sd, ws);
    this.sparks.update(sd, ws);
    this.V.phones.material.size = 0.3 * ws;
    const h = car.pos.y;
    this.shadow.position.set(car.pos.x, 0.05, car.pos.z);
    this.shadow.rotation.y = car.yaw;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - h / 30));
    this.shadow.material.opacity = Math.max(0.15, 1 - h / 20);
    this._animate(sd, t);
    this.sound.update(car.v, dt);
    this._frame(dt);
  },
  // venue life: search beams sway, the tower light blinks, the crowd jumps when it cheers, fireworks
  _animate(dt, t) {
    const V = this.V;
    for (const b of V.sky) b.rotation.set(Math.sin(t * 0.35 + b.userData.phase) * 0.35, 0, Math.cos(t * 0.27 + b.userData.phase) * 0.3);
    V.blink.visible = t % 1.4 < 0.25;
    this.cheerT = Math.max(0, this.cheerT - dt);
    const cr = V.crowd;
    if (this.cheerT > 0 || this._crowdUp) {
      this._crowdUp = this.cheerT > 0;
      const k = Math.min(1, this.cheerT);
      cr.userData.base.forEach(([x, y, z, ph], i) => {
        _rnM.makeTranslation(x, y + Math.abs(Math.sin(t * 9 + ph)) * 0.45 * k, z);
        cr.setMatrixAt(i, _rnM);
      });
      cr.instanceMatrix.needsUpdate = true;
    }
    if (this.fw && this.clock > this.fwAt) {
      this.fwAt = this.clock + 0.45 + Math.random() * 0.5;
      const x = (Math.random() - 0.5) * 50, y = 30 + Math.random() * 12, z = -52 + Math.random() * 6;
      const col = [[1, 0.85, 0.5], [0.6, 0.85, 1], [1, 0.5, 0.45], [1, 1, 1], [0.7, 1, 0.7]][Math.floor(Math.random() * 5)];
      for (let i = 0; i < 70; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), sp = 9 + Math.random() * 3;
        this.sparks.spawn(x, y, z, s * Math.cos(a) * sp, u * sp, s * Math.sin(a) * sp, 1.3 + Math.random() * 0.6, ...col, 1.2, 5);
      }
      this.sound._tone(70, 0.5, 0.12, "sine", 0.6);
    }
  },
  // the console riding with the stage, the status line over it, the desktop camera's landing frame
  _frame(dt) {
    const st = this.stage, head = this.app.input.head;
    st.updateMatrixWorld();
    const F = this._stageFrame(_rnM);
    for (const { o, m } of this.consoleRel) {
      if (this.panelIts?.get(o)?.selections.length) continue;
      new THREE6.Matrix4().multiplyMatrices(F, m).decompose(o.position, o.quaternion, o.scale);
    }
    const s = st.scale.x;
    this.capMesh.position.copy(st.position).add(_rnV.set(0, 0, -RN_STAGE_R * 0.55 * s).applyQuaternion(st.quaternion)).add(_rnV2.set(0, (this.tabletop ? 0.62 : 0.78) * Math.max(s, 0.42), 0));
    this.capMesh.lookAt(head);
    this.capMesh.scale.setScalar(this.tabletop ? 0.5 : 1);
  },
  exit() {
    removeEventListener("keydown", this._kd);
    removeEventListener("keyup", this._ku);
    this.sound?.stop();
    this.gen = this.manualGen = null;
  }
};
