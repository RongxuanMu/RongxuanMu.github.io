// src/quest.js
// - Archiscape Quest: the Archiscape town builder turned puzzle. Little figures walk the town on their own -
// one storey up or down at a step, never more - and you shape their way by adding and removing blocks, with
// only so many blocks to spend. Levels are historical scenes; the first is the fall of Troy -
var QUEST = { base: null, tag: null };
var _asGreek = AS_STYLES.find((s) => s.id === "greek");
// Troy: rough stone walls in courses, mud-brick houses, Athena's temple on the citadel; what you build is timber
var AS_TROY = {
  id: "troy",
  label: "Troy",
  title: "The Wooden Horse",
  era: "Troy · c. 1180 BC · the Scaean Gate",
  blurb: "Get Odysseus' men over the walls to open the gate, and the horse rolls in",
  palette: [0xb8a27c],
  ground: { hex: 0xa9a46c, side: 0x6e5a3e },
  wall(K, E) {
    const tag = QUEST.tag?.[E.ci], built = E.L >= (QUEST.base?.[E.ci] ?? 99);
    if (built) {
      // a siege ramp of planks: boards, seams and corner posts
      asWall(K, E, "matte", 0x8a5a32, 0, AS_H, 0, 0.18);
      for (let i = 1; i < 4; i++) asBand(K, E, "matte", 0x6e4526, i * AS_H / 4, 9e-4, 5e-4, 1.2e-3);
      if (!E.prevExp) asOn(K, E, "matte", 0x5b3a20, 0.03, AS_H / 2, 2.2e-3, AS_H, 9e-4);
      asOn(K, E, "matte", 0x5b3a20, 0.97, AS_H / 2, 2.2e-3, AS_H, 9e-4);
      return;
    }
    if (tag === "temple") return _asGreek.wall(K, E);
    const house = tag === "house";
    asWall(K, E, "matte", house ? 0xd9c7a1 : 0xb8a27c, 0, AS_H, 0, 0.14);
    if (!house) for (let y = 7.5e-3; y < AS_H - 1e-3; y += 7.5e-3) asBand(K, E, "matte", 0x9c876a, y, 6e-4, 4e-4, 1e-3);
    if (tag === "gate" && E.L === 0) {
      asOn(K, E, "matte", 0x5a3b22, 0.5, AS_H * 0.36, Math.min(0.016, E.len * 0.6), AS_H * 0.72, 1.1e-3);
      asOn(K, E, "matte", 0x3b2516, 0.5, AS_H * 0.36, 7e-4, AS_H * 0.72, 1.6e-3);
    }
    if (house && E.top) asOn(K, E, "matte", 0x3d3229, 0.5, AS_H * 0.6, 3e-3, 4.5e-3, 3e-4);
  },
  roof(K, R) {
    const tag = QUEST.tag?.[R.ci], built = R.h > (QUEST.base?.[R.ci] ?? 99);
    if (built) return asFlat(K, R, { kind: "matte", hex: 0x9b6b3d });
    if (tag === "temple") return _asGreek.roof(K, R);
    if (tag === "wall" || tag === "gate") return asFlat(K, R, { kind: "matte", hex: 0xc4ae86, merlon: 1.8e-3 });
    asFlat(K, R, { kind: "matte", hex: 0xcbb48b });
  },
  prop: _asGreek.prop
};
AS_STYLES.push(AS_TROY);
AS_MUSIC.troy = AS_MUSIC.greek;
AS_BIRDS.troy = AS_BIRDS.greek;
// - levels: each builds its base heights and tags on the grid. Tags are fixed (can't be built on or removed) -
var QUEST_LEVELS = [{
  id: "troy",
  style: "troy",
  title: "The Wooden Horse",
  goal1: "Lead the soldiers over the wall to the gate lever",
  goal2: "The gate is open: the horse rolls to Athena's square",
  budget: 9,
  par: 6,
  soldiers: 5,
  make(grid) {
    const cells = grid.cells, n = cells.length, base = new Int8Array(n), tag = new Array(n).fill(null);
    const C = new THREE6.Vector2(0.06, 0), near = (x, z) => cells.reduce((b, c) => c.c.distanceTo(new THREE6.Vector2(x, z)) < b.c.distanceTo(new THREE6.Vector2(x, z)) ? c : b).i;
    for (const c of cells) {
      const d = c.c.distanceTo(C), a = Math.atan2(c.c.y - C.y, c.c.x - C.x), r = asHash(c.i, 41);
      if (d < 0.032) base[c.i] = 2, tag[c.i] = "temple";
      else if (d >= 0.1 && d < 0.136) {
        base[c.i] = 3;
        tag[c.i] = Math.abs(Math.abs(a) - Math.PI) < 0.26 ? "gate" : "wall";
      } else if (d > 0.048 && d < 0.094 && !(c.c.x < C.x && Math.abs(c.c.y) < 0.03) && r < 0.5) {
        base[c.i] = r < 0.2 ? 2 : 1;
        tag[c.i] = "house";
      }
    }
    const horse = near(-0.17, 0), lever = near(C.x - 0.083, 0), square = near(C.x - 0.05, 0);
    for (const i of [horse, lever, square]) base[i] = 0;
    tag[horse] = "horse";
    tag[lever] = "lever";
    tag[square] = "square";
    // the horse's road from the camp to the gate stays clear
    for (const c of cells) if (c.c.x < C.x - 0.1 && c.c.x > -0.2 && Math.abs(c.c.y) < 0.03 && !tag[c.i]) base[c.i] = 0;
    return { base, tag, horse, lever, square };
  }
}];
// one figure's way: breadth-first over open neighbours no more than `climb` storeys apart; if the goal can't be
// reached, the way to the reachable cell nearest it (and `stuck`)
function questPath(grid, h, from, to, climb) {
  const cells = grid.cells, prev = new Int32Array(cells.length).fill(-2);
  prev[from] = -1;
  const q = [from];
  let best = from, bd = Infinity;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    if (i === to) {
      best = i;
      bd = 0;
      break;
    }
    const d = cells[i].c.distanceTo(cells[to].c);
    if (d < bd) bd = d, best = i;
    for (const nb of cells[i].nb) {
      if (nb < 0 || prev[nb] !== -2 || Math.abs(h[nb] - h[i]) > climb) continue;
      prev[nb] = i;
      q.push(nb);
    }
  }
  const way = [];
  for (let i = best; i >= 0; i = prev[i]) way.push(i);
  return { way: way.reverse(), stuck: best !== to };
}
// little merged meshes with vertex colours (one draw call each)
function questMesh(parts) {
  const P = [], N = [], C = [], col = new THREE6.Color();
  for (const [g0, hex, m] of parts) {
    const g = (g0.index ? g0.toNonIndexed() : g0).applyMatrix4(m);
    col.setHex(hex);
    P.push(...g.attributes.position.array);
    N.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) C.push(col.r, col.g, col.b);
  }
  return new THREE6.BufferGeometry().setAttribute("position", new THREE6.Float32BufferAttribute(P, 3)).setAttribute("normal", new THREE6.Float32BufferAttribute(N, 3)).setAttribute("color", new THREE6.Float32BufferAttribute(C, 3));
}
var _qM = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE6.Matrix4().compose(new THREE6.Vector3(x, y, z), new THREE6.Quaternion().setFromEuler(new THREE6.Euler(rx, ry, rz)), new THREE6.Vector3(1, 1, 1));
var ArchiscapeQuest = {
  ...Archiscape,
  id: "archiscape-quest",
  title: "Archiscape Quest",
  claimKeys: "gr",
  // for tools and tests: the pathfinder as the figures use it
  questPath,
  init(ctx) {
    Archiscape.init.call(this, ctx);
    const T = THREE6, app2 = this.app, TABLE = this.table;
    // the sandbox's own panel, hint and keys stand down
    removeEventListener("keydown", this._kd);
    this.panelRoot.visible = false;
    this.hintLabel.visible = false;
    if (this.tourEras) this.tourErasB._click();
    this.autoTour = true;
    // - the figures -
    const soldier = questMesh([
      [new T.CylinderGeometry(1.1e-3, 1.7e-3, 4.2e-3, 8), 0x9c2a1e, _qM(0, 2.1e-3, 0)],
      [new T.SphereGeometry(1.15e-3, 8, 6), 0xc8964a, _qM(0, 5e-3, 0)],
      [new T.BoxGeometry(4e-4, 1.4e-3, 2.4e-3), 0xc0392b, _qM(0, 6.2e-3, 0)],
      [new T.CylinderGeometry(1.5e-3, 1.5e-3, 3e-4, 10), 0xbc8f37, _qM(-1.5e-3, 3e-3, 0, 0, 0, Math.PI / 2)]
    ]);
    this.soldierMesh = new T.InstancedMesh(soldier, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 8);
    this.soldierMesh.castShadow = true;
    const wood = 0x9a6b3e, dark = 0x6a4526;
    this.horse = new T.Mesh(questMesh([
      [new T.BoxGeometry(0.014, 2.4e-3, 0.026), dark, _qM(0, 3.4e-3, 0)],
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [new T.CylinderGeometry(2.6e-3, 2.6e-3, 1.6e-3, 12), dark, _qM(sx * 7.6e-3, 2.6e-3, sz * 9e-3, 0, 0, Math.PI / 2)])),
      ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => [new T.BoxGeometry(2.4e-3, 9e-3, 2.4e-3), wood, _qM(sx * 3.4e-3, 9e-3, sz * 7e-3)])),
      [new T.BoxGeometry(0.0105, 0.009, 0.021), wood, _qM(0, 0.0175, 0)],
      [new T.BoxGeometry(5e-3, 0.013, 5e-3), wood, _qM(0, 0.026, 0.0105, 0.45, 0, 0)],
      [new T.BoxGeometry(5e-3, 5e-3, 0.011), wood, _qM(0, 0.0325, 0.0165, 0.2, 0, 0)],
      [new T.BoxGeometry(1.6e-3, 8e-3, 6e-3), dark, _qM(0, 0.029, 6.5e-3, 0.45, 0, 0)],
      [new T.BoxGeometry(1.4e-3, 0.011, 2e-3), dark, _qM(0, 0.0165, -0.0115, -0.5, 0, 0)]
    ]), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    this.horse.castShadow = true;
    // the lever: a post with a red banner; Athena's square: a gold ring
    this.leverMark = new T.Mesh(questMesh([
      [new T.CylinderGeometry(4e-4, 4e-4, 0.016, 6), 0x5b3a20, _qM(0, 8e-3, 0)],
      [new T.BoxGeometry(6e-3, 4e-3, 3e-4), 0xc0392b, _qM(3e-3, 0.0135, 0)]
    ]), new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: T.DoubleSide }));
    this.squareMark = new T.Mesh(new T.RingGeometry(7e-3, 9e-3, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xe6a53f, transparent: true, opacity: 0.85, depthWrite: false }));
    this.wayLine = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: 16777215, linewidth: 3, transparent: true, opacity: 0.75, worldUnits: false, dashed: false }));
    this.wayLine.onBeforeRender = this.ghost.onBeforeRender;
    for (const o of [this.soldierMesh, this.horse, this.leverMark, this.squareMark, this.wayLine]) {
      o.userData.noCollider = o.userData.noHighlight = true;
      o.frustumCulled = false;
      this.island.add(o);
    }
    // - the quest panel, on your right like the sandbox's -
    const PW = 0.3, PH = 0.19;
    const panel = ctx.panel("Archiscape Quest", { w: PW, h: PH });
    panel.root.position.set(0.5, TABLE + 0.1, -0.34);
    panel.root.lookAt(0, TABLE + 0.34, 0.3);
    ctx.root.add(panel.root);
    this.lines = [0, 1, 2].map((k) => {
      const tex = textTexture("", { w: 1024, h: 64, size: k ? 30 : 38, color: "#ffffff", align: "left" });
      const m = new T.Mesh(new T.PlaneGeometry(PW - 0.02, (PW - 0.02) * 64 / 1024), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.position.set(0, PH / 2 - 0.042 - k * 0.022, 2e-3);
      m.userData.noCollider = m.userData.noHighlight = true;
      panel.root.add(m);
      return tex;
    });
    const btn = (label, o) => ctx.button(label, { w: 0.062, fontSize: 26, ...o });
    this.goB = btn("Go!", { onClick: () => this.go() });
    const reset = btn("Reset", { onClick: () => this.loadLevel(this.levelIdx) });
    const undo = btn("Undo", { onClick: () => this.undo() });
    const music = btn("Music", { toggle: true, value: asMusic.on, onClick: (v) => {
      app2.sfx.ensure();
      asMusic.setOn(v);
    } });
    panel.layout([this.goB, undo, reset, music], { cols: 4, top: 0.115 });
    this.island.updateWorldMatrix(true, false);
    this.island.attach(panel.root);
    this.qPanel = panel.root;
    asPanelHandle(ctx, panel.root, { w: 0.14, y: -PH / 2 - 0.014 });
    this._qk = (e) => {
      if (e.key === "g" || e.key === "G") this.go();
      else if (e.key === "r" || e.key === "R") this.loadLevel(this.levelIdx);
      else if (e.key === "z" || e.key === "Z") this.undo();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", this._qk);
    this.loadLevel(0);
  },
  loadLevel(i) {
    const L = this.level = QUEST_LEVELS[this.levelIdx = i];
    const m = this.map = L.make(this.grid);
    QUEST.base = m.base;
    QUEST.tag = m.tag;
    this.caches = {};
    this.history = [];
    this.morph = null;
    this.h = Int8Array.from(m.base);
    this.phase = "build";
    this.soldiers = [];
    this.spawnT = 0;
    this.horseU = { cell: m.horse, to: m.horse, u: 0, yaw: Math.PI / 2 };
    this.won = false;
    const si = AS_STYLES.findIndex((s) => s.id === L.style);
    if (this.styleIdx !== si || !this.town) this.setStyle(si, true);
    else {
      this._dispose(this.town);
      this.town = null;
      this._rebuild(null);
    }
    this._rebuildPick();
    this.ghostKey = "";
    this.wayKey = null;
    this._status();
  },
  // blocks you have placed (storeys above the level's own)
  used() {
    let n = 0;
    for (let i = 0; i < this.h.length; i++) n += Math.max(0, this.h[i] - this.map.base[i]);
    return n;
  },
  _status() {
    const L = this.level, left = L.budget - this.used();
    this.lines[0].userData.draw(this.won ? `Troy has fallen  ${"★".repeat(this.stars)}${"☆".repeat(3 - this.stars)}` : L.title);
    this.lines[1].userData.draw(this.won ? `${this.used()} blocks (par ${L.par}) · Reset to play again` : this.phase === "horse" ? L.goal2 : L.goal1);
    this.lines[2].userData.draw(this.won ? "" : this.phase === "build" ? `Blocks left: ${left} · tap to build, hold to remove · Go! when ready` : this.phase === "march" ? `Blocks left: ${left} · ${this.soldiers.filter((s) => s.done).length} / ${L.soldiers} at the lever` : "");
  },
  // what may be built or removed: never on fixed ground, never past the budget, only your own blocks come away
  _target(o, d) {
    const tg = Archiscape._target.call(this, o, d);
    if (!tg) return null;
    const m = this.map, h = this.h;
    let add = tg.add, del = tg.del;
    if (add && (m.tag[add.cell] || add.level !== h[add.cell] || this.used() >= this.level.budget || this.won)) add = null;
    if (del) del = h[del.cell] > m.base[del.cell] && !this.won ? { cell: del.cell, level: h[del.cell] - 1 } : null;
    return { add, del };
  },
  _edit(e, op) {
    Archiscape._edit.call(this, e, op);
    this._status();
  },
  undo() {
    if (this.won || this.phase === "horse") return;
    Archiscape.undo.call(this);
    this._status();
  },
  go() {
    if (this.phase !== "build") return;
    this.phase = "march";
    this.spawnT = 0;
    this._status();
  },
  // landing: the camera circles the scene (the panel waits off stage); a key, click or wheel hands it over
  _attract(dt) {
    const a = this.app, on = !a.renderer.xr.isPresenting && !this.tookOver && !document.getElementById("overlay")?.classList.contains("hidden");
    if (this.qPanel) this.qPanel.visible = !on;
    if (!on) return this.attract = null;
    const A = this.attract ||= { ang: null }, cam = a.camera, ctl = a.controls, c = this.island.getWorldPosition(new THREE6.Vector3());
    if (A.ang === null) A.ang = Math.atan2(cam.position.x - c.x, cam.position.z - c.z);
    A.ang += dt * 0.07;
    ctl.target.set(c.x, c.y + 0.06, c.z);
    cam.position.set(c.x + Math.sin(A.ang) * 0.62, c.y + 0.36, c.z + Math.cos(A.ang) * 0.62);
    cam.lookAt(ctl.target);
    ctl.update();
  },
  _top(i) {
    return this.h[i] * AS_H;
  },
  // one figure stepping cell to cell: walking pace on the level, a hop up or down a storey
  _walk(f, dt, climb, goal, speed) {
    const cells = this.grid.cells;
    if (f.to === f.cell) {
      const p = questPath(this.grid, this.h, f.cell, goal, climb);
      f.stuck = p.stuck;
      if (p.way.length < 2) return f.cell === goal;
      f.to = p.way[1];
      f.u = 0;
      f.dur = cells[f.cell].c.distanceTo(cells[f.to].c) / speed + Math.abs(this.h[f.to] - this.h[f.cell]) * 0.35;
      f.yaw = Math.atan2(cells[f.to].c.x - cells[f.cell].c.x, cells[f.to].c.y - cells[f.cell].c.y);
    }
    // the next cell grew or sank out of reach mid-step: turn back
    if (Math.abs(this.h[f.to] - this.h[f.cell]) > climb) {
      f.to = f.cell;
      return false;
    }
    f.u += dt / f.dur;
    if (f.u >= 1) {
      f.cell = f.to;
      f.u = 0;
    }
    return false;
  },
  _pos(f, out, lift = 0) {
    const a = this.grid.cells[f.cell].c, b = this.grid.cells[f.to].c, u = f.to === f.cell ? 0 : f.u;
    const y0 = this._top(f.cell), y1 = this._top(f.to);
    // a hop: rise to the higher top early, land on the lower one late
    const k = y1 > y0 ? Math.min(1, u * 2.2) : Math.max(0, (u - 0.55) / 0.45);
    out.set(a.x + (b.x - a.x) * u, y0 + (y1 - y0) * k + Math.sin(Math.PI * u) * (y1 !== y0 ? 4e-3 : 0) + lift, a.y + (b.y - a.y) * u);
    return out;
  },
  update(dt, t) {
    Archiscape.update.call(this, dt, t);
    if (!this.map) return;
    const L = this.level, m = this.map, cells = this.grid.cells, T = THREE6, p = new T.Vector3(), q = new T.Quaternion(), S = new T.Vector3(1, 1, 1), M = new T.Matrix4();
    // soldiers climb out of the horse one by one and make for the lever
    if (this.phase === "march") {
      this.spawnT -= dt;
      if (this.soldiers.length < L.soldiers && this.spawnT <= 0) {
        this.spawnT = 0.7;
        this.soldiers.push({ cell: m.horse, to: m.horse, u: 0, yaw: -Math.PI / 2, k: this.soldiers.length });
      }
      for (const s of this.soldiers) if (!s.done) s.done = this._walk(s, dt, 1, m.lever, 0.034);
      if (this.soldiers.length === L.soldiers && this.soldiers.every((s) => s.done)) this._openGate();
      this._statusT = (this._statusT || 0) + dt;
      if (this._statusT > 0.3) this._statusT = 0, this._status();
    }
    if (this.phase === "horse" && !this.morph && !this.won) {
      if (this._walk(this.horseU, dt, 0, m.square, 0.028)) this._win();
    }
    // draw the soldiers: standing in a little ring around their cell, bobbing as they walk
    this.soldierMesh.count = this.soldiers.length;
    this.soldiers.forEach((s, i) => {
      this._pos(s, p);
      const a = s.k * 2.4, r = s.to === s.cell ? 4.5e-3 : 1.5e-3;
      p.x += Math.cos(a) * r;
      p.z += Math.sin(a) * r;
      if (s.to !== s.cell) p.y += Math.abs(Math.sin(this.time * 11 + s.k)) * 6e-4;
      q.setFromEuler(new T.Euler(0, s.yaw, 0));
      this.soldierMesh.setMatrixAt(i, M.compose(p, q, S));
    });
    this.soldierMesh.instanceMatrix.needsUpdate = true;
    this._pos(this.horseU, this.horse.position);
    this.horse.rotation.y = this.horseU.yaw;
    if (this.horseU.to !== this.horseU.cell) this.horse.rotation.z = Math.sin(this.time * 9) * 0.02;
    this.leverMark.position.set(cells[m.lever].c.x + 6e-3, this._top(m.lever), cells[m.lever].c.y + 6e-3);
    this.leverMark.rotation.z = this.phase === "horse" ? -0.9 : 0;
    this.squareMark.position.set(cells[m.square].c.x, this._top(m.square) + 4e-4, cells[m.square].c.y);
    this.squareMark.material.opacity = 0.55 + 0.35 * Math.sin(this.time * 3);
    this._wayline();
  },
  // the way the soldiers would take from the horse to the lever, white when it gets there, orange where it stops
  _wayline() {
    const m = this.map, show = this.phase === "build";
    this.wayLine.visible = show;
    if (!show) return;
    const key = this.h.join("");
    if (key === this.wayKey) return;
    this.wayKey = key;
    const p = questPath(this.grid, this.h, m.horse, m.lever, 1), cells = this.grid.cells, seg = [];
    for (let k = 1; k < p.way.length; k++) {
      const a = cells[p.way[k - 1]], b = cells[p.way[k]];
      seg.push(a.c.x, this._top(a.i) + 2.5e-3, a.c.y, b.c.x, this._top(b.i) + 2.5e-3, b.c.y);
    }
    this.wayLine.geometry.dispose();
    this.wayLine.geometry = new LineSegmentsGeometry().setPositions(seg.length ? seg : [0, -1, 0, 0, -1, 0]);
    this.wayLine.material.color.setHex(p.stuck ? 16747625 : 16777215);
    this.wayStuck = p.stuck;
  },
  _openGate() {
    if (this.phase === "horse") return;
    this.phase = "horse";
    const h = Int8Array.from(this.h);
    this.map.tag.forEach((tg, i) => {
      if (tg === "gate") h[i] = 0, this.map.base[i] = 0;
    });
    this._morphTo(h);
    this._rumble();
    this._status();
  },
  _win() {
    this.won = true;
    const u = this.used(), par = this.level.par;
    this.stars = u <= par ? 3 : u <= par + 2 ? 2 : 1;
    this._fanfare();
    this._status();
  },
  _rumble() {
    const c = this.app.sfx.ensure();
    if (!c || c.state !== "running") return;
    const t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.app.sfx.noise;
    s.loop = true;
    f.type = "lowpass";
    f.frequency.value = 160;
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.2);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 1.6);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + 1.7);
  },
  _fanfare() {
    const c = this.app.sfx.ensure();
    if (!c || c.state !== "running") return;
    [0, 4, 7, 12].forEach((st, k) => {
      const t = c.currentTime + k * 0.14, o = c.createOscillator(), g = c.createGain();
      o.type = "triangle";
      o.frequency.value = 392 * Math.pow(2, st / 12);
      g.gain.setValueAtTime(1e-4, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(1e-4, t + (k === 3 ? 1.2 : 0.35));
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 1.3);
    });
  },
  exit() {
    removeEventListener("keydown", this._qk);
    Archiscape.exit.call(this);
  }
};
