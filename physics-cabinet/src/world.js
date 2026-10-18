// - the cabinet: a plate on the table, one exhibit at a time, a panel to choose -
var PhysicsCabinet = {
  id: "physics-cabinet",
  title: "Physics Cabinet",
  init(ctx) {
    const { root, THREE: T } = ctx;
    const app2 = this.app = ctx.app;
    this.ctx = ctx;
    const TABLE = app2.sessionMode ? THREE6.MathUtils.clamp(app2.input.head.y - PC_TABLE_BELOW_HEAD, 0.55, 1.6) : 1.44;
    if (!pcEnv) {
      const pm = new T.PMREMGenerator(app2.renderer);
      pcEnv = pm.fromScene(new PcRoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    root.add(new T.HemisphereLight(16777215, 7368816, 2.4));
    const sun = new T.DirectionalLight(16777215, 2.6);
    sun.position.set(0.6, 2.5, 1.2);
    root.add(sun);
    // the stage: a floating plate; grab its rim to move it, two hands to turn it
    const stage = this.stage = new T.Group();
    stage.name = "plate";
    stage.position.set(0, TABLE, -0.5);
    root.add(stage);
    const PH = 0.026;
    const plate = new T.Mesh(new T.CylinderGeometry(PC_PLATE_R, PC_PLATE_R, PH, 96), new T.MeshBasicMaterial({ color: 0 }));
    plate.position.y = -PH / 2;
    stage.add(plate);
    const rim = pcRims(plate.geometry, 0.9, 4);
    rim.position.copy(plate.position);
    stage.add(rim);
    const ring = new T.Mesh(new T.RingGeometry(PC_PLATE_R - 0.03, PC_PLATE_R - 0.026, 96).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.35 }));
    ring.position.y = 1e-3;
    ring.userData.noCollider = ring.userData.noHighlight = true;
    stage.add(ring);
    ctx.add(stage, {
      draggable: true,
      twoHand: true,
      box: new T.Box3(new T.Vector3(-PC_PLATE_R, -PH, -PC_PLATE_R), new T.Vector3(PC_PLATE_R, 0, PC_PLATE_R)),
      constrain: ({ quaternion, scale }) => {
        const e = new T.Euler().setFromQuaternion(quaternion, "YXZ");
        quaternion.setFromEuler(new T.Euler(0, e.y, 0, "YXZ"));
        scale.setScalar(1);
      }
    });
    // - panel: exhibits on top, the current exhibit's own buttons below -
    const panel = this.panel = ctx.panel("Physics Cabinet · ten experiments", { w: 0.32, h: 0.19 });
    panel.root.position.set(0.5, TABLE + 0.09, -0.36);
    panel.root.lookAt(0, TABLE + 0.34, 0.3);
    root.add(panel.root);
    this.exBtns = PC_EXHIBITS.map((e, i) => ctx.button(e.label, { onClick: () => this.load(i) }));
    panel.layout(this.exBtns, { cols: 5, top: 0.03 });
    this.infoTex = textTexture("", { w: 1024, h: 56, size: 26, color: "#ffffff" });
    const info = new T.Mesh(new T.PlaneGeometry(0.3, 0.3 * 56 / 1024), new T.MeshBasicMaterial({ map: this.infoTex, transparent: true, depthWrite: false }));
    info.position.set(0, -0.078, 2e-3);
    panel.root.add(info);
    // the panel rides on the plate, and its bar moves it
    stage.updateWorldMatrix(true, false);
    stage.attach(panel.root);
    pcPanelHandle(ctx, panel.root, { w: 0.16, y: -0.19 / 2 - 0.014 });
    this.titleTex = textTexture("", { w: 1024, h: 96, size: 56, color: "#ffffff" });
    const title = this.title = new T.Mesh(new T.PlaneGeometry(0.36, 0.36 * 96 / 1024), new T.MeshBasicMaterial({ map: this.titleTex, transparent: true, depthWrite: false }));
    title.userData.noCollider = title.userData.noHighlight = true;
    root.add(title);
    const tl = ctx.label("Grab, drag and throw · poke with a fingertip · grab the plate rim to move it, two hands to turn it", { height: 0.011 });
    tl.position.set(0, TABLE + 0.012, -0.17);
    tl.rotation.x = -Math.PI / 2.6;
    root.add(tl);
    // the hint rides on the plate: moved, turned or scaled, it goes along
    stage.updateWorldMatrix(true, false);
    stage.attach(tl);
    this._kd = (e) => {
      const k = "1234567890".indexOf(e.key);
      if (k >= 0) this.load(k);
      else if (e.key === "ArrowRight") this.load((this.idx + 1) % PC_EXHIBITS.length);
      else if (e.key === "ArrowLeft") this.load((this.idx + PC_EXHIBITS.length - 1) % PC_EXHIBITS.length);
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", this._kd);
    this.cur = null;
    this.load(this._start ?? 0);
  },
  load(i) {
    this._unloadExhibit();
    this.idx = this._start = i;
    const ex = PC_EXHIBITS[i], T = THREE6, app2 = this.app, ctx = this.ctx;
    this.exBtns.forEach((b, k) => {
      b.toggle = k === i;
      b.setValue(k === i);
    });
    this.titleTex.userData.draw(ex.title);
    this.infoTex.userData.draw(ex.blurb);
    const root = new T.Group();
    root.name = `exhibit:${ex.id}`;
    this.stage.add(root);
    const owned = [], actions = [], stage = this.stage;
    const sfx = new PcSfx(app2);
    const X = {
      app: app2,
      sfx,
      root,
      stage,
      get stageY() {
        return stage.position.y;
      },
      add: (obj, opts) => {
        const it = ctx.add(obj, opts);
        owned.push(it);
        return it;
      },
      remove: (it) => app2.im.remove(it),
      action: (label, onClick, { toggle = false, value = false } = {}) => {
        const b = ctx.button(label, { toggle, value, onClick, w: 0.068 });
        actions.push(b);
        owned.push(b.it);
        return b;
      },
      local: (p) => stage.worldToLocal(p.clone()),
      // fingertips (and controller tips) in plate space, for pushing cloth and jelly
      tips: () => {
        const out = [];
        if (!app2.sessionMode) return out;
        for (const s of app2.input.list()) if (s.tracked && (s.kind === "hand" || s.kind === "controller")) out.push(stage.worldToLocal(s.pokePoint.clone()));
        return out;
      },
      tone: (f, gain = 0.1, dur = 0.2, type = "sine") => {
        const c = app2.sfx.ensure();
        if (!c || c.state !== "running") return;
        const t = c.currentTime, o = c.createOscillator(), gn = c.createGain();
        o.type = type;
        o.frequency.value = f;
        gn.gain.setValueAtTime(1e-4, t);
        gn.gain.exponentialRampToValueAtTime(gain, t + 4e-3);
        gn.gain.exponentialRampToValueAtTime(1e-4, t + dur);
        o.connect(gn).connect(c.destination);
        o.start(t);
        o.stop(t + dur + 0.02);
      },
      // a small text plate whose words can change (mesh.userData.draw)
      text: (width) => {
        const tex = textTexture("", { w: 512, h: 56, size: 30, color: "#ffffff" });
        const m = new T.Mesh(new T.PlaneGeometry(width, width * 56 / 512), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
        m.userData.noCollider = m.userData.noHighlight = true;
        m.userData.draw = (s) => {
          if (m.userData.last !== s) tex.userData.draw(m.userData.last = s);
        };
        return m;
      }
    };
    let inst;
    try {
      inst = ex.build(X);
    } catch (e) {
      console.error(e);
      app2.error(`${ex.title} failed: ${e.message}`);
      inst = { update() {
      } };
    }
    // the exhibit's own buttons, in a row under the exhibit list
    const n = Math.max(actions.length, 1), gap = 6e-3, w = 0.068;
    actions.forEach((b, k) => {
      b.root.position.set(-((n - 1) * (w + gap)) / 2 + k * (w + gap), this.panel.h / 2 - 0.03 - 2 * 0.032 - 0.02 - 0.013, 0);
      this.panel.root.add(b.root);
    });
    this.cur = { ex, root, owned, actions, inst, sfx };
    app2.log(`exhibit → ${ex.title}`);
  },
  _unloadExhibit() {
    const c = this.cur;
    if (!c) return;
    c.sfx.stop();
    for (const it of c.owned) this.app.im.remove(it);
    const own = new Set(c.owned);
    this.ctx._owned.splice(0, this.ctx._owned.length, ...this.ctx._owned.filter((it) => !own.has(it)));
    for (const b of c.actions) b.root.removeFromParent();
    c.root.removeFromParent();
    c.root.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
    this.cur = null;
  },
  update(dt, t) {
    const c = this.cur;
    if (c) {
      try {
        c.inst.update(Math.min(dt, 1 / 30), t);
      } catch (e) {
        console.error(e);
        this.app.error(`${c.ex.title}: ${e.message}`);
        c.inst.update = () => {
        };
      }
    }
    // the title floats behind the plate, facing the viewer
    const head = this.app.input.head, sp = this.stage.getWorldPosition(new THREE6.Vector3());
    const away = new THREE6.Vector3(sp.x - head.x, 0, sp.z - head.z).normalize();
    this.title.position.copy(sp).addScaledVector(away, PC_PLATE_R + 0.05).setY(sp.y + 0.52);
    this.title.lookAt(head.x, this.title.position.y, head.z);
  },
  exit() {
    this._unloadExhibit();
    removeEventListener("keydown", this._kd);
  }
};
