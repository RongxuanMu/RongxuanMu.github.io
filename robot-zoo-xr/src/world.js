// - loading (once per page; robots are fetched the first time they are picked, then kept) -
var rzLib = null, rzEnv = null;
var rzRobotCache = /* @__PURE__ */ new Map();
function rzLoadLib() {
  rzLib ||= (async () => {
    const [mujoco, ort] = await Promise.all([import(RZ_URL.mujoco).then((m) => m.default()), import(RZ_URL.ort)]);
    ort.env.wasm.wasmPaths = RZ_URL.ortDir;
    ort.env.wasm.numThreads = 1;
    return { mujoco, ort };
  })();
  rzLib.catch(() => rzLib = null);
  return rzLib;
}
function rzFetch(url, kind) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`${url.split("/").slice(-2).join("/")}: HTTP ${r.status}`);
    return r[kind]();
  });
}
function rzLoadRobot(R, status) {
  if (rzRobotCache.has(R.id)) return rzRobotCache.get(R.id);
  const p = (async () => {
    const L = await rzLoadLib(), base = `${RZ_URL.assets}${R.id}/`;
    status(`Loading ${R.name}…`);
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
    m.castShadow = true;
    m.userData.noCollider = m.userData.noHighlight = true;
    bodies.get(id).add(m);
  }
  root.userData.mats = [...mats.values()];
  return { root, bodies: [...bodies.entries()] };
}
function rzRims(geo, opacity, px) {
  const eg = new THREE6.EdgesGeometry(geo, 30);
  const lm = new LineMaterial({ color: 16777215, linewidth: px, transparent: true, opacity, worldUnits: false });
  const l = new LineSegments2(new LineSegmentsGeometry().setPositions(Array.from(eg.attributes.position.array)), lm);
  l.userData.noCollider = l.userData.noHighlight = true;
  l.onBeforeRender = (renderer, scene, camera) => {
    const vp = camera.viewport;
    if (vp) lm.resolution.set(vp.z, vp.w);
    else renderer.getSize(lm.resolution);
  };
  eg.dispose();
  return l;
}
// a floor grid that scrolls with the robot (the plate stays on the table, the ground slides under it)
function rzGridTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 256);
  g.moveTo(0, 128);
  g.lineTo(256, 128);
  g.stroke();
  const t = new THREE6.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE6.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
var RobotZoo = {
  id: "robot-zoo",
  title: "Robot Zoo",
  init(ctx) {
    const { root, THREE: T } = ctx;
    const app2 = this.app = ctx.app;
    this.ctx = ctx;
    this.token = (this.token || 0) + 1;
    const TABLE = this.table = app2.sessionMode ? THREE6.MathUtils.clamp(app2.input.head.y - RZ_TABLE_BELOW_HEAD, 0.55, 1.6) : 1.44;
    const r = app2.renderer;
    if (!r.shadowMap.enabled) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFShadowMap;
    }
    if (!rzEnv) {
      const pm = new T.PMREMGenerator(r);
      rzEnv = pm.fromScene(new RzRoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    root.add(new T.HemisphereLight(16777215, 5592405, 2.2));
    // - the stage: a plate on the table (life size: the floor) -
    const stage = this.stage = new T.Group();
    stage.name = "stage";
    root.add(stage);
    const sun = this.sun = new T.DirectionalLight(16777215, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -3e-4;
    sun.shadow.normalBias = 2e-3;
    stage.add(sun, sun.target);
    const PLATE_R = 0.32, PH = 0.026;
    const plate = this.plate = new T.Group();
    stage.add(plate);
    const disc = new T.Mesh(new T.CylinderGeometry(PLATE_R, PLATE_R, PH, 96), new T.MeshBasicMaterial({ color: 0 }));
    disc.position.y = -PH / 2;
    plate.add(disc);
    const rim = rzRims(disc.geometry, 0.9, 4);
    rim.position.copy(disc.position);
    plate.add(rim);
    this.gridTex = rzGridTexture();
    const grid = this.grid = new T.Mesh(new T.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: this.gridTex, transparent: true, depthWrite: false, opacity: 0.8 }));
    grid.position.y = 1e-3;
    grid.userData.noCollider = grid.userData.noHighlight = true;
    stage.add(grid);
    const shadow = this.shadow = new T.Mesh(new T.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new T.ShadowMaterial({ opacity: 0.45 }));
    shadow.position.y = 2e-3;
    shadow.receiveShadow = true;
    shadow.userData.noCollider = shadow.userData.noHighlight = true;
    stage.add(shadow);
    // the plate edge moves the stage; its top is the "walk there" floor
    this.stageIt = ctx.add(stage, { draggable: true, twoHand: true, box: new T.Box3(new T.Vector3(-PLATE_R, -PH, -PLATE_R), new T.Vector3(PLATE_R, -4e-3, PLATE_R)),
      constrain: ({ quaternion, scale }) => {
        const e = new T.Euler().setFromQuaternion(quaternion, "YXZ");
        quaternion.setFromEuler(new T.Euler(0, e.y, 0, "YXZ"));
        scale.setScalar(1);
      } });
    const floor = this.floor = new T.Mesh(new T.CircleGeometry(PLATE_R, 64).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0 }));
    floor.material.visible = false;
    floor.name = "floor";
    floor.position.y = 3e-3;
    stage.add(floor);
    this.floorIt = ctx.add(floor, { highlight: false, box: new T.Box3(new T.Vector3(-PLATE_R, -2e-3, -PLATE_R), new T.Vector3(PLATE_R, 2e-3, PLATE_R)) });
    const goalAt = (e) => {
      const p = this.sim.worldToLocal(e.point.clone());
      if (this.S && this.R.kind !== "track") this.goal = { x: p.x, y: p.y, on: true }, this.modeBtns?.forEach((b) => b.setValue(false)), this.mode = null;
    };
    this.floorIt.on("press", goalAt).on("drag", goalAt);
    // the simulation frame: MuJoCo is z-up, so it is turned onto three's y-up
    // MuJoCo is z-up with robots facing +x: turned onto three's y-up, facing the viewer (+z)
    const sim = this.sim = new T.Group();
    sim.quaternion.setFromEuler(new T.Euler(-Math.PI / 2, 0, -Math.PI / 2, "YXZ"));
    stage.add(sim);
    const flag = this.flag = new T.Mesh(new T.ConeGeometry(0.06, 0.18, 16).rotateX(Math.PI / 2).translate(0, 0, 0.09), new T.MeshBasicMaterial({ color: 16766586 }));
    flag.visible = false;
    flag.userData.noCollider = flag.userData.noHighlight = true;
    sim.add(flag);
    // grabbing the robot: an invisible box that follows its root body
    const proxy = this.proxy = new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial());
    proxy.material.visible = false;
    proxy.name = "robot";
    stage.add(proxy);
    this.robotIt = ctx.add(proxy, { highlight: false });
    this.robotIt.on("press", (e) => this._grabStart(e)).on("drag", (e) => this._grabMove(e)).on("release", () => this.grab = null);
    this.robotIt.on("statechange", ({ level }) => this._tint(level));
    // - panel -
    const panel = this.panel = ctx.panel("Robot Zoo · open-source humanoids, real policies", { w: 0.31, h: 0.3 });
    panel.root.position.set(-0.5, TABLE + 0.12, -0.36);
    panel.root.lookAt(0, TABLE + 0.36, 0.3);
    root.add(panel.root);
    this.robotBtns = RZ_ROBOTS.map((R, i) => ctx.button(R.label, { onClick: () => this.pick(i), w: 0.068 }));
    panel.layout(this.robotBtns, { cols: 4, top: 0.03 });
    this.infoTex = textTexture("", { w: 1024, h: 120, size: 30, color: "#ffffff" });
    const info = new T.Mesh(new T.PlaneGeometry(0.29, 0.29 * 120 / 1024), new T.MeshBasicMaterial({ map: this.infoTex, transparent: true, depthWrite: false }));
    info.position.set(0, -0.125, 2e-3);
    panel.root.add(info);
    this.actions = [];
    const tl = ctx.label("Point + pinch the floor to send it walking · grab the robot to push or lift it · thumbstick / WASD drives", { height: 0.011 });
    tl.position.set(0, TABLE + 0.012, -0.17);
    tl.rotation.x = -Math.PI / 2.6;
    root.add(tl);
    this.tableLabel = tl;
    this.keys = {};
    this._kd = (e) => {
      if (/^(w|a|s|d|q|e|W|A|S|D|Q|E)$/.test(e.key)) this.keys[e.key.toLowerCase()] = true;
      else if (e.key === "r" || e.key === "R") this.reset();
      else return;
      e.preventDefault();
    };
    this._ku = (e) => delete this.keys[e.key.toLowerCase()];
    addEventListener("keydown", this._kd);
    addEventListener("keyup", this._ku);
    this.life = this.life ?? false;
    this.goal = { on: false };
    this.mode = null;
    this.center = new T.Vector2();
    this._place();
    this.pick(this.idx ?? 0);
  },
  _status(s) {
    this.statusText = s;
    this._drawInfo();
  },
  _drawInfo() {
    const R = this.R;
    if (!R) return;
    const g = this.infoTex.image.getContext("2d");
    g.clearRect(0, 0, 1024, 120);
    g.fillStyle = "#ffffff";
    g.textAlign = "left";
    g.font = "600 34px system-ui, sans-serif";
    g.fillText(`${R.name} · ${R.maker}`, 16, 34);
    g.font = "500 26px system-ui, sans-serif";
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillText(R.policy, 16, 72);
    g.fillText(this.statusText || "", 16, 108);
    this.infoTex.needsUpdate = true;
  },
  // tabletop: robots stand RZ_TABLE_HEIGHT tall on the plate; life size: 1:1 on the real floor ahead of you
  _place() {
    const head = this.app.input.head, life = this.life;
    if (life) {
      const fwd = new THREE6.Vector3(0, 0, -1);
      if (this.app.sessionMode) this.app.camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      this.stage.position.set(head.x + fwd.x * 2.2, 0, head.z + fwd.z * 2.2);
      this.stage.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
    } else {
      this.stage.position.set(0, this.table, -0.55);
      this.stage.rotation.set(0, 0, 0);
    }
    this.plate.visible = !life;
    this.tableLabel && (this.tableLabel.visible = !life);
    this._scale();
  },
  _scale() {
    const R = this.R ?? RZ_ROBOTS[0], s = this.life ? 1 : RZ_TABLE_HEIGHT / R.height;
    this.s = s;
    this.sim.scale.setScalar(s);
    const gr = this.life ? 3 : 0.3;
    this.grid.scale.setScalar(gr);
    this.shadow.scale.setScalar(this.life ? 3 : 0.31);
    // grid squares are 0.5 m of robot ground
    this.gridTex.repeat.set(2 * gr / (0.5 * s), 2 * gr / (0.5 * s));
    const sc = this.sun.shadow.camera, ext = this.life ? 2.5 : 0.35;
    Object.assign(sc, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.05, far: this.life ? 10 : 3 });
    sc.updateProjectionMatrix();
    this.sun.position.set(0.35, 1.2, 0.5).multiplyScalar(this.life ? 3 : 1);
  },
  async pick(i) {
    this.idx = i;
    const R = RZ_ROBOTS[i], token = ++this.token;
    this.robotBtns.forEach((b, k) => {
      b.toggle = k === i;
      b.setValue(k === i);
    });
    this.R = R;
    this._scale();
    this._status("Loading MuJoCo and ONNX Runtime…");
    this._buildActions(R);
    try {
      const A = await rzLoadRobot(R, (m) => token === this.token && this._status(m));
      if (token !== this.token) return;
      if (this.vis) {
        this.vis.root.removeFromParent();
      }
      this.A = A;
      this.vis = A.visual ||= rzBuildVisual(A, R);
      this.sim.add(this.vis.root);
      this.reset();
      this._status(R.kind === "track" ? "Pick a motion · a finished clip returns to standing" : "Ready · pinch the floor to send it walking");
      this.app.log(`robot → ${R.name} (${R.kind})`);
    } catch (e) {
      console.error(e);
      if (token === this.token) this._status(`⚠ ${e.message}`);
    }
  },
  _buildActions(R) {
    for (const b of this.actions) {
      this.app.im.remove(b.it);
      b.root.removeFromParent();
    }
    this.actions = [];
    const btn = (label, onClick, o = {}) => {
      const b = this.ctx.button(label, { onClick, w: 0.068, ...o });
      this.actions.push(b);
      return b;
    };
    let list;
    if (R.kind === "track") {
      list = [...RZ_TRACK_CLIPS.map((label) => btn(label, () => this._play(label)))];
      this.modeBtns = null;
    } else {
      const mode = (m) => (v) => {
        this.mode = v ? m : null;
        this.goal.on = false;
        this.modeBtns.forEach((b) => b.setValue(b.mode === this.mode));
      };
      const walk = btn("Walk ▲", mode("walk"), { toggle: true }), left = btn("◀ Turn", mode("left"), { toggle: true }), right = btn("Turn ▶", mode("right"), { toggle: true });
      walk.mode = "walk";
      left.mode = "left";
      right.mode = "right";
      this.modeBtns = [walk, left, right];
      list = [walk, left, right, btn("Stop", () => {
        this.mode = null;
        this.goal.on = false;
        this.modeBtns.forEach((b) => b.setValue(false));
      })];
    }
    const lifeB = btn("Life size", (v) => {
      this.life = v;
      this._place();
    }, { toggle: true, value: this.life });
    list.push(btn("Push", () => this._shove()), lifeB, btn("Reset", () => this.reset()));
    // below the robot list (two rows of four)
    const top = 0.03 + 2 * 0.032 + 0.012;
    list.forEach((b, k) => {
      const c = k % 4, row = Math.floor(k / 4);
      b.root.position.set(-0.31 / 2 + 8e-3 + 0.0705 / 2 + c * (0.0705 + 6e-3), 0.3 / 2 - top - 0.013 - row * 0.032, 0);
      this.panel.root.add(b.root);
    });
  },
  _play(label) {
    const S = this.S;
    if (!S || S.R.kind !== "track") return;
    if (!RZ_CONTROLLERS.track.play(S, label)) {
      // still busy: go back to standing first, then play
      RZ_CONTROLLERS.track.play(S, "default");
      S.queued = label;
    }
    this._status(`${label}…`);
  },
  reset() {
    const A = this.A, R = this.R;
    if (!A) return;
    this.S?.data.delete();
    const data = new A.mujoco.MjData(A.model);
    A.mujoco.mj_forward(A.model, data);
    const S = this.S = { R, A, mujoco: A.mujoco, model: A.model, data, pol: A.pol, extra: A.extra, t: 0, acc: 0, busy: false, cmd: [0, 0, 0], fallen: 0 };
    S.rootId = A.mujoco.mj_name2id(A.model, A.mujoco.mjtObj.mjOBJ_BODY.value, R.root);
    S.mass = A.model.body(S.rootId).subtreemass;
    S.ctrl = RZ_CONTROLLERS[R.kind];
    S.ctrlDt = R.dt * R.dec;
    A.pol.reset();
    S.ctrl.setup(S);
    A.mujoco.mj_forward(A.model, data);
    S.z0 = data.qpos[2];
    this.goal.on = false;
    this.grab = null;
    this.center.set(data.qpos[0], data.qpos[1]);
    this._syncVisual();
  },
  _shove() {
    const S = this.S;
    if (!S) return;
    const a = Math.random() * Math.PI * 2;
    S.shove = { t: 0.12, f: [Math.cos(a) * S.mass * 9, Math.sin(a) * S.mass * 9] };
  },
  _tint(level) {
    for (const m of this.vis?.root.userData.mats ?? []) m.emissive.setScalar(level ? 0.08 * level : 0);
  },
  // grabbing: a spring pulls the root body toward the hand, carrying the robot's weight while held
  _grabStart(e) {
    const S = this.S;
    if (!S) return;
    const p = this.sim.worldToLocal(e.point.clone()), d = S.data.xpos, k = S.rootId * 3;
    this.grab = { off: [p.x - d[k], p.y - d[k + 1], p.z - d[k + 2]], target: [p.x, p.y, p.z] };
  },
  _grabMove(e) {
    if (!this.grab) return;
    const p = this.sim.worldToLocal(e.point.clone());
    this.grab.target = [p.x, p.y, Math.max(p.z, 0.05)];
  },
  _command(dt) {
    const S = this.S, R = this.R, c = [0, 0, 0];
    if (R.kind === "track") return c;
    let sx = 0, sy = 0;
    for (const s of this.app.input.list()) if (s.kind === "controller" && s.tracked && s.stick) sx += s.stick.x, sy += s.stick.y;
    const k = this.keys;
    sy += (k.w ? -1 : 0) + (k.s ? 1 : 0);
    sx += (k.d ? 1 : 0) + (k.a ? -1 : 0);
    const strafe = (k.e ? 1 : 0) - (k.q ? 1 : 0);
    if (Math.hypot(sx, sy) > 0.15 || strafe) {
      this.goal.on = false;
      c[0] = Math.max(-0.5, Math.min(1, -sy)) * R.vmax;
      c[2] = -Math.max(-1, Math.min(1, sx)) * 0.8;
      c[1] = -strafe * 0.3;
      return c;
    }
    const q = S.data.qpos;
    if (this.goal.on) {
      const dx = this.goal.x - q[0], dy = this.goal.y - q[1], dist = Math.hypot(dx, dy);
      if (dist < 0.25) this.goal.on = false;
      else {
        const err = Math.atan2(Math.sin(Math.atan2(dy, dx) - rzYaw(q)), Math.cos(Math.atan2(dy, dx) - rzYaw(q)));
        c[2] = Math.max(-0.8, Math.min(0.8, 1.6 * err));
        c[0] = R.vmax * Math.max(0, Math.cos(err)) ** 2 * Math.min(1, dist / 0.8);
      }
      return c;
    }
    if (this.mode === "walk") c[0] = R.vmax * 0.7;
    else if (this.mode === "left") c[2] = 0.6;
    else if (this.mode === "right") c[2] = -0.6;
    return c;
  },
  async _controlStep(S) {
    const { mujoco, model, data } = S;
    S.cmd = this._command(S.ctrlDt);
    await S.ctrl.policy(S);
    if (S !== this.S) return;
    const xf = data.xfrc_applied, k = S.rootId * 6, g = this.grab;
    for (let i = 0; i < S.R.dec; i++) {
      S.ctrl.torque(S);
      xf[k] = xf[k + 1] = xf[k + 2] = 0;
      if (g) {
        const p = data.xpos, v = data.qvel, b = S.rootId * 3;
        for (let a = 0; a < 3; a++) {
          const acc = 60 * (g.target[a] - (p[b + a] + g.off[a])) - 12 * v[a];
          xf[k + a] = S.mass * Math.max(-40, Math.min(40, acc)) + (a === 2 ? S.mass * 9.81 * 0.9 : 0);
        }
      }
      if (S.shove && (S.shove.t -= S.R.dt) > 0) xf[k] += S.shove.f[0], xf[k + 1] += S.shove.f[1];
      mujoco.mj_step(model, data);
      S.t += S.R.dt;
      S.ctrl.tick?.(S, S.R.dt);
    }
  },
  _pump() {
    const S = this.S;
    if (!S || S.busy) return;
    S.busy = true;
    (async () => {
      try {
        let n = 0;
        while (S.acc >= S.ctrlDt && n < 4 && S === this.S) {
          await this._controlStep(S);
          S.acc -= S.ctrlDt;
          n++;
        }
        // too far behind (slow device or a hitch): drop the backlog rather than spiral
        if (S.acc > 4 * S.ctrlDt) S.acc = 0;
      } catch (e) {
        console.error(e);
        this._status(`⚠ ${e.message}`);
        this.S = null;
      } finally {
        S.busy = false;
      }
    })();
  },
  _syncVisual() {
    const S = this.S, V = this.vis;
    if (!S || !V) return;
    const x = S.data.xpos, q = S.data.xquat;
    for (const [id, g] of V.bodies) {
      g.position.set(x[id * 3], x[id * 3 + 1], x[id * 3 + 2]);
      g.quaternion.set(q[id * 4 + 1], q[id * 4 + 2], q[id * 4 + 3], q[id * 4]);
    }
  },
  update(dt, t) {
    const S = this.S;
    if (!S) return;
    S.acc += Math.min(dt, 0.05);
    this._pump();
    this._syncVisual();
    const q = S.data.qpos, s = this.s;
    // keep the robot on the plate: the ground (and the robot) slide back under the table
    const far = Math.hypot(q[0] - this.center.x, q[1] - this.center.y);
    if (!this.life || far > 1.6) this.center.lerp(new THREE6.Vector2(q[0], q[1]), Math.min(1, dt * (this.life ? 1.5 : 3)));
    const d = new THREE6.Vector3(this.center.x, this.center.y, 0).applyQuaternion(this.sim.quaternion);
    this.sim.position.copy(d).multiplyScalar(-s);
    // the grid scrolls exactly as the ground under the robot does (one tile = 0.5 m of robot ground)
    this.gridTex.offset.set(d.x / 0.5 % 1, -d.z / 0.5 % 1);
    this.sun.target.position.set(0, 0, 0);
    // the grab box rides on the root body
    const b = S.rootId * 3, x = S.data.xpos, h = this.R.height;
    this.proxy.position.copy(this.sim.localToWorld(new THREE6.Vector3(x[b], x[b + 1], x[b + 2] * 0.6))).applyMatrix4(this.stage.matrixWorld.clone().invert());
    this.proxy.scale.set(0.45 * h * s, 0.9 * h * s, 0.45 * h * s);
    this.proxy.position.y = Math.max(this.proxy.position.y, 0.45 * h * s);
    this.flag.visible = !!this.goal.on;
    if (this.goal.on) this.flag.position.set(this.goal.x, this.goal.y, 0);
    this.flag.scale.setScalar(this.R.height / 1.3);
    // after a fall: walkers reset after a moment; the dancer gets more time (a clip may fall on purpose)
    const up = rzGravity(q, 3)[2] < -0.5 && q[2] > 0.45 * S.z0 - (S.z0 < 0.1 ? 1 : 0);
    S.fallen = up || this.grab ? 0 : S.fallen + dt;
    if (S.fallen > (this.R.kind === "track" ? 4 : 1.5)) {
      this._status("Fell over · standing it back up");
      this.reset();
    }
    if (S.queued && S.tracker?.name === "default" && S.tracker.done) {
      RZ_CONTROLLERS.track.play(S, S.queued);
      S.queued = null;
    }
  },
  exit() {
    this.token++;
    removeEventListener("keydown", this._kd);
    removeEventListener("keyup", this._ku);
    if (this.vis) this.vis.root.removeFromParent();
    this.S?.data.delete();
    this.S = null;
  }
};
var RZ_TRACK_CLIPS = ["Dance", "Dance 2", "Tai chi", "Kung fu", "Jumps", "Run", "Walk", "Get up", "Cartwheel", "Jump kick", "Backflip", "Handspring", "Dive roll"];
