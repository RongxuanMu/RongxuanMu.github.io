// - loading (once per page; robots are fetched the first time they are picked, then kept). MuJoCo and ONNX
// Runtime are the one instance Microduck XR loads (mdLoadLib) -
var rzEnv = null;
var rzRobotCache = /* @__PURE__ */ new Map();
function rzFetch(url, kind) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url.split("/").slice(-2).join("/")}: HTTP ${r.status}`);
    return r[kind]();
  });
}
function rzLoadRobot(R, status) {
  if (rzRobotCache.has(R.id)) return rzRobotCache.get(R.id);
  const p = (async () => {
    status("Loading MuJoCo and ONNX Runtime\u2026");
    const L = await mdLoadLib(), base = `${RZ_URL.assets}${R.id}/`;
    status(`Loading ${R.name}\u2026`);
    let [xml, vis, bin] = await Promise.all([rzFetch(base + "physics.xml", "text"), rzFetch(base + "visual.json", "json"), rzFetch(base + "visual.bin", "arrayBuffer")]);
    // the physics step each deploy loop uses
    xml = /<option\b/.test(xml) ? xml.replace(/<option\b([^>]*?)(\/?)>/, (m, a, s) => `<option${a.replace(/\s*timestep="[^"]*"/, "")} timestep="${R.dt}"${s}>`) : xml.replace(/(<mujoco\b[^>]*>)/, `$1\n  <option timestep="${R.dt}"/>`);
    const files = [...xml.matchAll(/<mesh\b[^>]*\bfile="([^"]+)"/g)].map((m) => m[1]);
    const dir = (xml.match(/meshdir="([^"]*)"/)?.[1] ?? "").replace(/\/?$/, "/");
    const vfs = new L.mujoco.MjVFS();
    await Promise.all(files.map(async (f) => vfs.addBuffer(dir + f, new Uint8Array(await rzFetch(base + "m/" + f, "arrayBuffer")))));
    const model = L.mujoco.MjModel.from_xml_string(xml, vfs);
    status(`Loading ${R.name}'s policy…`);
    const pol = await rzSession(L.ort, base + "policy.onnx");
    const extra = {};
    if (R.kind === "track") {
      extra.cfg = await rzFetch(base + "tracking.json", "json");
      extra.frames = {};
      await Promise.all(extra.cfg.clips.map(async (c) => extra.frames[c.file] = new Float32Array(await rzFetch(`${base}motions/${c.file}`, "arrayBuffer"))));
    }
    return { ...L, model, vis, bin, pol, extra };
  })();
  p.catch(() => rzRobotCache.delete(R.id));
  rzRobotCache.set(R.id, p);
  return p;
}
// the robot's look: decimated visual meshes (int16-quantised), one group per MuJoCo body
function rzBuildVisual(A, R) {
  const { vis, bin, model, mujoco } = A;
  const geos = vis.meshes.map((m) => {
    const q = new Int16Array(bin, m.v[0], m.v[1] * 3), pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = (q[i] + 32768) * m.scale[i % 3] + m.lo[i % 3] - 32768 * m.scale[i % 3];
    const idx = m.i[2] === 2 ? new Uint16Array(bin, m.i[0], m.i[1]) : new Uint32Array(bin, m.i[0], m.i[1]);
    const g = new THREE6.BufferGeometry();
    g.setAttribute("position", new THREE6.BufferAttribute(pos, 3));
    g.setIndex(new THREE6.BufferAttribute(idx, 1));
    const c = rzCreased(g, Math.PI / 5);
    g.dispose();
    return c;
  });
  const mats = /* @__PURE__ */ new Map(), mat = (rgba) => {
    const k = rgba.join();
    if (!mats.has(k)) {
      let c = new THREE6.Color().setRGB(rgba[0], rgba[1], rgba[2], THREE6.SRGBColorSpace);
      // a model coloured part by part for debugging reads better in its real two-tone finish
      if (R.tone) c = new THREE6.Color(0.299 * rgba[0] + 0.587 * rgba[1] + 0.114 * rgba[2] > 0.5 ? R.tone[0] : R.tone[1]);
      mats.set(k, new THREE6.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.35, envMap: rzEnv, envMapIntensity: 0.8, emissive: 0 }));
    }
    return mats.get(k);
  };
  const root = new THREE6.Group(), bodies = /* @__PURE__ */ new Map();
  for (const g of vis.geoms) {
    const id = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY.value, g.body);
    if (id < 0) continue;
    if (!bodies.has(id)) {
      const b = new THREE6.Group();
      root.add(b);
      bodies.set(id, b);
    }
    let geo = g.mesh !== void 0 ? geos[g.mesh] : null;
    if (!geo) {
      const [a, b] = g.size;
      geo = g.type === "sphere" ? new THREE6.SphereGeometry(a, 16, 12) : g.type === "box" ? new THREE6.BoxGeometry(2 * a, 2 * b, 2 * g.size[2]) : g.type === "capsule" ? new THREE6.CapsuleGeometry(a, 2 * b, 6, 12).rotateX(Math.PI / 2) : new THREE6.CylinderGeometry(a, a, 2 * b, 16).rotateX(Math.PI / 2);
    }
    const m = new THREE6.Mesh(geo, mat(g.rgba[3] < 0.05 ? [0.6, 0.6, 0.6, 1] : g.rgba));
    m.position.fromArray(g.pos);
    m.quaternion.set(g.quat[1], g.quat[2], g.quat[3], g.quat[0]);
    m.userData.noCollider = m.userData.noHighlight = true;
    bodies.get(id).add(m);
  }
  root.userData.mats = [...mats.values()];
  return { root, bodies: [...bodies.entries()] };
}
// m: how tall a humanoid stands on the tabletop stage (Microduck keeps Microduck XR's 0.4 scale)
var RZ_TABLE_HEIGHT = 0.42;
// m: the robot picker's height (eleven robots in three rows of four, the picked one's credits below)
var RZ_PICKER_H = 0.2;
// Robot Zoo IS Microduck XR: the same world object (stage in the room, its bar, the console riding with it, goal
// flag, floor pinch, grab spring, follow me, boundary, tabletop, sounds, desktop camera), with a robot picker.
// Microduck runs Microduck XR's own code path unchanged; a humanoid plugs its MuJoCo model and published policy
// into the same stage. The stage is placed once when the world starts (from your head) and never moves on its
// own: robots walk across it, in your room.
var RobotZoo = Object.assign(Object.create(Microduck), {
  id: "robot-zoo",
  title: "Robot Zoo",
  init(ctx) {
    this.idx ??= 0;
    this.R = RZ_ROBOTS[this.idx];
    // everything per world instance (a session start reloads the world)
    this.A = this.rigs = this.HS = this.hvis = this.camBody = this.duckIt = this.rig = null;
    this.hIts = /* @__PURE__ */ new Map();
    this._sizeFor(this.R);
    if (!rzEnv) {
      const pm = new THREE6.PMREMGenerator(ctx.app.renderer);
      rzEnv = pm.fromScene(new RzRoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    Microduck.init.call(this, ctx);
  },
  _boot() {
    this.pick(this.idx);
  },
  _sizeFor(R) {
    const h = R.height;
    this.camSize = h / 0.25;
    this.statusLift = R.kind === "duck" ? 1 : (h + 0.3) / 0.57;
    this.flag?.scale.setScalar(THREE6.MathUtils.clamp(h / 0.45, 1, 3));
  },
  _tableScale() {
    return this.R.kind === "duck" ? 0.4 : Math.min(0.4, RZ_TABLE_HEIGHT / this.R.height);
  },
  // - console: Microduck XR's (shown for Microduck), a humanoid panel in its place, and the robot picker -
  _buildConsole(ctx) {
    Microduck._buildConsole.call(this, ctx);
    const T = THREE6;
    const pk = this.picker = ctx.panel("Robot Zoo · pick a robot", { w: 0.3, h: RZ_PICKER_H });
    this.robotBtns = RZ_ROBOTS.map((R, i) => ctx.button(R.label, { w: 0.068, h: 0.026, fontSize: 24, toggle: true, onClick: () => this.pick(i) }));
    pk.layout(this.robotBtns, { cols: 4, top: 0.03 });
    this.infoTex = textTexture("", { w: 1024, h: 120, size: 30, color: "#ffffff" });
    const info = new T.Mesh(new T.PlaneGeometry(0.28, 0.28 * 120 / 1024), new T.MeshBasicMaterial({ map: this.infoTex, transparent: true, depthWrite: false }));
    info.position.set(0, -RZ_PICKER_H / 2 + 0.024, 2e-3);
    info.userData.noCollider = true;
    pk.root.add(info);
    ctx.add(pk.root.children[0], { near: false, highlight: false });
    ctx.root.add(pk.root);
    this._handle(ctx, pk.root, { w: 0.14, y: RZ_PICKER_H / 2 + 0.014 });
    // humanoid commands, where Microduck's console sits; the shared toggles stay in sync with Microduck's copies
    this.humSlot = new T.Group();
    ctx.root.add(this.humSlot);
    const shared = (key, label, fn) => {
      const b = ctx.button(label, { w: 0.078, h: 0.026, fontSize: 26, toggle: true, value: !!this.btn[key].value, onClick: (v) => {
        this.btn[key].setValue(v);
        fn(v);
      } });
      this.btn[key].add(b);
      return b;
    };
    const common = () => [
      ctx.button("Push", { w: 0.078, h: 0.026, fontSize: 26, onClick: () => this._shove() }),
      shared("table", "Tabletop", (v) => {
        this._placeStage(v);
        if (!this.app.renderer.xr.isPresenting) this._heroCamera();
      }),
      shared("bound", "Boundary", (v) => this.setBoundary(v)),
      shared("sound", "Sound", (v) => this.sound.setOn(this.soundOn = v)),
      ctx.button("Reset", { w: 0.078, h: 0.026, fontSize: 26, onClick: () => this.reset() })
    ];
    const make = (title, items, h, slider) => {
      const p = ctx.panel(title, { w: 0.26, h });
      p.layout(items, { cols: 3, top: 0.03 });
      if (slider) {
        const sl = ctx.slider("Speed", { w: 0.2, value: this.speed, onChange: (v) => {
          this.speed = v;
          for (const o of this.speedSliders) if (o !== sl) o.set(v, true);
        } });
        sl.root.position.set(0, h / 2 - 0.03 - Math.ceil(items.length / 3) * 0.032 - 0.026, 4e-3);
        p.root.add(sl.root);
        this.speedSliders.push(sl);
      }
      ctx.add(p.root.children[0], { near: false, highlight: false });
      this.humSlot.add(p.root);
      return p;
    };
    const follow = shared("follow", "Follow me", (v) => {
      this.follow = v;
      if (v) this.goal.active = false;
    });
    this._handle(ctx, this.humSlot, { w: 0.14, y: -0.25 / 2 - 0.014 });
    this.walkPanel = make("Walk · pinch the floor, grab, drive", [follow, ...common()], 0.15, true);
    if (this.inMenu) this._zooMenu(ctx);
    this.trackPanel = make("Unitree G1 · pick a motion", [...RZ_TRACK_CLIPS.map((l) => ctx.button(l, { w: 0.078, h: 0.026, fontSize: 24, onClick: () => this._play(l) })), ...common()], 0.25, false);
  },
  // the picker sits on your right with the commands, stacked above them as one console (as Microduck XR keeps
  // everything you press on the right and only the drive joystick on the left)
  // the hand menu (XR): a Robot Zoo home page - the robots and the commands every robot shares - with
  // Microduck's own moves one page away and the framework's Settings page
  _zooMenu(ctx) {
    const app = ctx.app, b = (label, o) => ctx.button(label, { w: 0.075, h: 0.026, fontSize: 24, ...o });
    const page = this.zooPage = ctx.panel("Robot Zoo", { w: 0.26, h: 0.25 });
    this.menuRobots = RZ_ROBOTS.map((R, i) => b(R.label, { toggle: true, value: i === this.idx, onClick: () => this.pick(i) }));
    const shared = (key, label, fn) => {
      const x = b(label, { toggle: true, value: !!this.btn[key].value, onClick: (v) => {
        this.btn[key].setValue(v);
        fn(v);
      } });
      this.btn[key].add(x);
      return x;
    };
    this.duckMovesB = b("Duck moves \u203a", { onClick: () => app.menu.show("duck") });
    page.layout([...this.menuRobots,
      shared("follow", "Follow me", (v) => {
        this.follow = v;
        if (v) this.goal.active = false;
      }),
      shared("table", "Tabletop", (v) => this._placeStage(v)),
      shared("bound", "Boundary", (v) => this.setBoundary(v)),
      shared("sound", "Sound", (v) => this.sound.setOn(this.soundOn = v)),
      b("Reset", { onClick: () => this.reset() }), this.duckMovesB, b("Settings \u203a", { onClick: () => app.menu.show("settings") })], { cols: 3, top: 0.03 });
    app.menu.addPage("zoo", page);
    this.menuBack.setLabel("\u2039 Robot Zoo");
    this.menuBack.onClick = () => app.menu.show("zoo");
  },
  _placeConsole(y) {
    this.picker.root.position.set(0.42, y + 0.29 / 2 + RZ_PICKER_H / 2 + 0.012, -0.36);
    this.picker.root.lookAt(0, y + 0.45, 0.35);
    // where Microduck XR puts its command panel (_placeStage sets that one only after asking us)
    this.humSlot.position.set(0.42, y, -0.36);
    this.humSlot.lookAt(0, y + 0.45, 0.35);
    return [this.picker.root, this.humSlot];
  },
  _drawInfo() {
    const R = this.R, g = this.infoTex.image.getContext("2d");
    g.clearRect(0, 0, 1024, 120);
    g.fillStyle = "#ffffff";
    g.textAlign = "left";
    g.font = "600 34px system-ui, sans-serif";
    g.fillText(`${R.name} · ${R.maker}`, 16, 44);
    g.font = "500 26px system-ui, sans-serif";
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillText(R.policy, 16, 92);
    this.infoTex.needsUpdate = true;
  },
  // - picking a robot: the stage stays where it is; only what stands on it changes -
  pick(i) {
    const R = RZ_ROBOTS[i], duck = R.kind === "duck", token = this.token, pt = this.pickToken = {};
    this.idx = i;
    this.R = R;
    this.robotBtns.forEach((b, k) => b.setValue(k === i));
    this.menuRobots?.forEach((b, k) => b.setValue(k === i));
    if (this.duckMovesB) this.duckMovesB.root.visible = duck;
    this._drawInfo();
    this._sizeFor(R);
    if (this.tabletop) this.stage.scale.setScalar(this._tableScale());
    this.panel.root.visible = duck;
    this.walkPanel.root.visible = !duck && R.kind !== "track";
    this.trackPanel.root.visible = R.kind === "track";
    this.goal.active = false;
    this.kickPlan = null;
    const live = () => token === this.token && pt === this.pickToken;
    if (duck) {
      this._dropHumanoid();
      mdLoadAssets((m) => live() && this.status(m)).then((A) => {
        if (!live()) return;
        if (!this.A) this._startSim(A);
        else this.setLoco(this.loco ?? "legs");
      }).catch((e) => {
        console.error(e);
        if (live()) this.status(`⚠ ${e.message}`);
      });
      return;
    }
    this._dropDuck();
    this._dropHumanoid();
    rzLoadRobot(R, (m) => live() && this.status(m)).then((A) => live() && this._startHumanoid(R, A)).catch((e) => {
      console.error(e);
      if (live()) this.status(`⚠ ${e.message}`);
    });
  },
  // a pick that lands while Microduck's rig is still being built must not leave the duck in charge
  async setLoco(loco) {
    await Microduck.setLoco.call(this, loco);
    if (this.R.kind !== "duck" && this.S && !this.S.hum) {
      this._dropDuck();
      this.pick(this.idx);
    }
  },
  _dropDuck() {
    if (this.S && !this.S.hum) {
      this._grabEnd();
      this.S.data.delete();
      this.S = null;
    }
    for (const r of Object.values(this.rigs ?? {})) r.group.visible = false;
    this.ball.visible = false;
    this.rig = this.duckIt = null;
  },
  _dropHumanoid() {
    if (this.S?.hum) {
      this._grabEnd();
      this.S.data.delete();
      this.S = null;
    }
    if (this.hvis) this.hvis.root.visible = false;
    this.camBody = this.duckIt = null;
  },
  _startHumanoid(R, A) {
    const V = A.visual ||= rzBuildVisual(A, R);
    this.sim.add(V.root);
    V.root.visible = true;
    this.hvis = V;
    this.HA = A;
    this._hReset();
    const S = this.S, rootG = V.bodies.find(([id]) => id === S.rootId)[1];
    // grab target: the root body, with a box around the whole standing robot (in the root body's frame)
    let it = this.hIts.get(R.id);
    if (!it) {
      const d = S.data, x = d.xpos, r = S.rootId, inv = new THREE6.Matrix4().compose(new THREE6.Vector3(x[r * 3], x[r * 3 + 1], x[r * 3 + 2]), new THREE6.Quaternion(d.xquat[r * 4 + 1], d.xquat[r * 4 + 2], d.xquat[r * 4 + 3], d.xquat[r * 4]), new THREE6.Vector3(1, 1, 1)).invert();
      const box = new THREE6.Box3();
      for (let b = 1; b < S.model.nbody; b++) box.expandByPoint(new THREE6.Vector3(x[b * 3], x[b * 3 + 1], x[b * 3 + 2]).applyMatrix4(inv));
      box.expandByScalar(0.06 * R.height);
      it = this._grabbable(this.ctx, rootG, "duck", { twoHand: true, highlight: false, box });
      it.on("transformstart", () => this._grab2Start()).on("transformend", () => this.S?.grab?.two && this._grabEnd());
      it.on("tap", () => this.sound.hup()).on("statechange", ({ level }) => this._tint(level));
      this.hIts.set(R.id, it);
    }
    this.duckIt = it;
    this.camBody = rootG;
    this.setBoundary(this.boundary);
    this.status(R.kind === "track" ? "Pick a motion · a finished clip returns to standing" : "Point + pinch the floor to walk · grab the robot · Push to test its balance");
    this.app.log(`robot → ${R.name} (${R.kind})`);
  },
  _hReset() {
    const A = this.HA, R = this.R;
    if (this.S?.hum) {
      this._grabEnd();
      this.S.data.delete();
    }
    const data = new A.mujoco.MjData(A.model);
    A.mujoco.mj_forward(A.model, data);
    const rootId = A.mujoco.mj_name2id(A.model, A.mujoco.mjtObj.mjOBJ_BODY.value, R.root);
    const S = this.S = {
      hum: true, R, A, mujoco: A.mujoco, model: A.model, data, pol: A.pol, extra: A.extra, t: 0, acc: 0, busy: false,
      cmd: [0, 0, 0], tw: [0, 0, 0], fallen: 0, loco: "humanoid", mode: "walk", curbIds: [], rootId,
      ctrl: RZ_CONTROLLERS[R.kind], ctrlDt: R.dt * R.dec,
      trunk: { bodyId: rootId, qAdr: 0, dofAdr: 0, mass: A.model.body(rootId).subtreemass, rad: 0.12 * R.height }
    };
    A.pol.reset();
    S.ctrl.setup(S);
    A.mujoco.mj_forward(A.model, data);
    S.z0 = data.qpos[2];
    // footsteps: the two lowest bodies when standing (four on a quadruped)
    const z = [];
    for (let b = 1; b < A.model.nbody; b++) z.push([data.xpos[b * 3 + 2], b]);
    S.feetIds = z.sort((a, b) => a[0] - b[0]).slice(0, R.kind === "quad" ? 4 : 2).map((e) => e[1]);
    this.goal.active = false;
    this.flag.position.set(0.5, 0, 0);
    this._hSync();
  },
  reset() {
    if (this.S?.hum) this._hReset();
    else Microduck.reset.call(this);
  },
  // Microduck-only moves (the hand menu and keys reach them whatever stands on the stage)
  trigger(what) {
    if (this.S?.hum) return this.status("That one is a Microduck move");
    return Microduck.trigger.call(this, what);
  },
  kick(foot) {
    if (this.S?.hum) return this.status("That one is a Microduck move");
    return Microduck.kick.call(this, foot);
  },
  spawnBall() {
    if (this.S?.hum) return this.status("The ball is Microduck's");
    return Microduck.spawnBall.call(this);
  },
  quack() {
    if (this.S?.hum) return this.sound.hup();
    return Microduck.quack.call(this);
  },
  _idle(dt, t) {
    if (!this.S?.hum) Microduck._idle.call(this, dt, t);
  },
  setGoal(x, y) {
    if (this.S?.hum && this.R.kind === "track") return this.status("G1 dance follows its clips · pick one on the panel");
    Microduck.setGoal.call(this, x, y);
  },
  _play(label) {
    const S = this.S;
    if (!S?.hum || S.R.kind !== "track") return;
    if (!RZ_CONTROLLERS.track.play(S, label)) {
      // still busy: go back to standing first, then play
      RZ_CONTROLLERS.track.play(S, "default");
      S.queued = label;
    }
    this.status(`${label}…`);
  },
  _shove() {
    const S = this.S;
    if (!S?.hum) return;
    const a = Math.random() * Math.PI * 2;
    S.shove = { t: 0.12, f: [Math.cos(a) * S.trunk.mass * 9, Math.sin(a) * S.trunk.mass * 9] };
    this.sound.whoa();
  },
  _tint(level) {
    for (const m of this.hvis?.root.userData.mats ?? []) m.emissive.setScalar(level ? 0.08 * level : 0);
  },
  // twist for the walking policies: joystick / sticks / keys > follow me > goal, as Microduck's, with each
  // robot's own speed range; near the boundary the walk outward fades to a stop
  _hCommand(S) {
    if (S.R.kind === "track") return S.tw;
    const R = S.R, m = this.manual, q = S.data.qpos, yaw = rzYaw(q), sp = this.speed;
    const fwd = R.vmax * (0.4 + 0.6 * sp), ang = 0.5 + 0.4 * sp, want = [0, 0, 0];
    const steer = (tx, ty, dist) => {
      const err = MD_WRAP(Math.atan2(ty - q[1], tx - q[0]) - yaw);
      if (Math.abs(err) > 0.6) return [0, 0, Math.sign(err) * ang];
      return [fwd * Math.cos(err) * T6clamp(dist / 0.6, 0.35, 1), 0, T6clamp(err * 2, -ang, ang)];
    };
    if (!S.grab) {
      if (Math.hypot(m[0], m[2]) > 0.12) {
        this.goal.active = false;
        want[0] = m[0] > 0 ? m[0] * fwd : 0.5 * m[0] * fwd;
        want[2] = m[2] * ang;
      } else if (this.follow) {
        const h = this.sim.worldToLocal(this.app.input.head.clone()), dist = Math.hypot(h.x - q[0], h.y - q[1]);
        const err = MD_WRAP(Math.atan2(h.y - q[1], h.x - q[0]) - yaw);
        if (dist > (0.5 + 0.35 * R.height) / this.stage.scale.x) want.splice(0, 3, ...steer(h.x, h.y, dist));
        else if (Math.abs(err) > 0.35) want[2] = Math.sign(err) * ang;
      } else if (this.goal.active) {
        const g = this.goal.pos, dist = Math.hypot(g.x - q[0], g.y - q[1]);
        if (dist > 0.12) want.splice(0, 3, ...steer(g.x, g.y, dist));
        else this.goal.active = false;
      }
    }
    if (this.boundary && want[0] > 0) {
      const r = Math.hypot(q[0], q[1]), lim = this._lim() - 0.15;
      if (r > lim - 0.3 && Math.cos(yaw - Math.atan2(q[1], q[0])) > 0) want[0] *= T6clamp((lim - r) / 0.3, 0, 1);
    }
    for (let k = 0; k < 3; k++) S.tw[k] += 0.2 * (want[k] - S.tw[k]);
    return S.tw;
  },
  async _hStep(S) {
    const { mujoco, model, data } = S;
    S.cmd = this._hCommand(S);
    await S.ctrl.policy(S);
    if (S !== this.S) return;
    const xf = data.xfrc_applied, k = S.rootId * 6;
    for (let i = 0; i < S.R.dec; i++) {
      S.ctrl.torque(S);
      if (S.grab) this._applyGrab();
      else for (let a = 0; a < 6; a++) xf[k + a] = 0;
      if (S.shove && (S.shove.t -= S.R.dt) > 0) xf[k] += S.shove.f[0], xf[k + 1] += S.shove.f[1];
      mujoco.mj_step(model, data);
      S.t += S.R.dt;
      S.ctrl.tick?.(S, S.R.dt);
    }
    this._hAfter(S);
  },
  _hAfter(S) {
    const q = S.data.qpos, v = S.data.qvel, R = S.R, snd = this.sound;
    if (!Number.isFinite(q[2])) return this._hReset();
    // thrown off the stage: back to the middle, as Microduck
    if (!S.grab && Math.hypot(q[0], q[1]) > this._lim() + 0.35) return this._hReset();
    // a fall: the walkers have no get-up policy, so it stands back up at the spot it started from
    // (Berkeley Humanoid Lite's root sits at ground level when standing: its height is no test, only its tilt)
    const up = rzGravity(q, 3)[2] < -0.5 && (S.z0 < 0.1 || q[2] > 0.45 * S.z0);
    const was = S.fallen;
    S.fallen = up || S.grab ? 0 : S.fallen + S.ctrlDt;
    if (was < 0.3 && S.fallen >= 0.3) snd.uhoh(), this.status("Fell over · standing it back up");
    if (S.fallen > (R.kind === "track" ? 4 : 1.5)) {
      this._hReset();
      snd.getup();
      return;
    }
    // footsteps and servo whine, as Microduck's (thresholds for a bigger stride)
    let jv = 0;
    for (let j = 6; j < S.model.nv; j++) jv += Math.abs(v[j]);
    S.jv = jv * 14 / Math.max(1, S.model.nv - 6);
    if (!S.grab) {
      const xp = S.data.xpos, z = S.feetIds.map((b) => xp[b * 3 + 2]), g = Math.min(...z), now = performance.now();
      S.feet ??= S.feetIds.map(() => ({ air: false, z: 0, at: 0 }));
      S.feet.forEach((f, i) => {
        const vz = (z[i] - f.z) / S.ctrlDt;
        f.z = z[i];
        if (z[i] - g > 0.03) f.air = true;
        else if (f.air && z[i] - g < 0.01 && vz < -0.05 && now - f.at > 200) {
          f.air = false;
          f.at = now;
          snd.step(Math.min(1, Math.abs(vz) / 0.6));
        }
      });
    }
  },
  _hSync() {
    const S = this.S, V = this.hvis;
    if (!S?.hum || !V) return;
    const x = S.data.xpos, q = S.data.xquat;
    for (const [id, g] of V.bodies) {
      g.position.set(x[id * 3], x[id * 3 + 1], x[id * 3 + 2]);
      g.quaternion.set(q[id * 4 + 1], q[id * 4 + 2], q[id * 4 + 3], q[id * 4]);
    }
    const p = S.data.qpos, lift = T6clamp(p[2] / S.z0, 0, 3);
    this.shadow.position.set(p[0], p[1], 2e-3);
    this.shadow.scale.setScalar(2.2 * S.R.height * T6clamp(1.6 - 0.6 * lift, 0.5, 1.2));
    this.shadow.material.opacity = T6clamp(1.6 - 0.6 * lift, 0.2, 1);
  },
  update(dt, t) {
    this._frame(dt, t);
    const S = this.S;
    if (!S?.hum) return this._duckUpdate(dt);
    this._readManual();
    this._grab2Update();
    // control at the policy's rate, paced by the render loop (as Microduck): one pump at a time, catching up at
    // most three steps when the headset renders slower; beyond that the sim slows instead of spiralling
    S.acc = Math.min(S.acc + dt, S.ctrlDt * 3);
    if (!S.busy && S.acc >= S.ctrlDt) {
      S.busy = true;
      (async () => {
        while (this.S === S && S.acc >= S.ctrlDt) {
          S.acc -= S.ctrlDt;
          await this._hStep(S);
        }
      })().catch((e) => {
        console.error(e);
        this.status(`⚠ ${e.message}`);
        if (this.S === S) this.S = null;
      }).finally(() => S.busy = false);
    }
    this._hSync();
    const a = this.app, xr = a.renderer.xr.isPresenting, moving = Math.hypot(S.tw[0], S.tw[2]) > 0.05;
    this.sound.update(this.camBody.getWorldPosition(_mdV), xr ? a.input.head : a.camera.position, xr ? a.input.headQuat : a.camera.quaternion,
      S.grab || moving || S.R.kind === "track" || S.jv > 6 ? Math.min(1, (S.jv ?? 0) / 25) : 0, 0);
    this.flag.visible = this.goal.active || this.flagIt.selections.length > 0;
    this.flagHead.material.emissive.setHex(this.goal.active ? 3342336 : 0);
    if (S.queued && S.tracker?.name === "default" && S.tracker.done) {
      RZ_CONTROLLERS.track.play(S, S.queued);
      S.queued = null;
    }
  },
  exit(ctx) {
    if (this.inMenu) ctx.app.menu.removePage("zoo");
    if (this.hvis) this.hvis.root.removeFromParent();
    Microduck.exit.call(this, ctx);
    this.hvis = null;
  }
});
var RZ_TRACK_CLIPS = ["Dance", "Dance 2", "Tai chi", "Kung fu", "Jumps", "Run", "Walk", "Get up", "Cartwheel", "Jump kick", "Backflip", "Handspring", "Dive roll"];
