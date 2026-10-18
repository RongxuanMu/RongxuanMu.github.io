// - the town: heights per cell, rebuilt into one mesh per surface kind for the current style. Each cell's
// geometry depends only on its own height and its neighbours', so it is cached under that key and an edit
// regenerates just the handful of cells around it -
function asCellChunk(grid, h, style, cell) {
  const K = asKit(style.tess || null, style.kinds || null), H = AS_H, water = !!style.ground.water;
  const v3 = (p, y) => new THREE6.Vector3(p.x, y, p.y);
  const hc = h[cell.i], r = asHash(cell.i, 11);
  if (!hc) {
    if (!water) K.poly("ground", style.ground.hex, cell.v.map((vi) => v3(grid.verts[vi], 0)), 0.07, r);
    // trees keep clear of walls: only cells whose neighbours are open too
    K.sway = 1;
    if (style.prop && (cell.nb.every((n) => n < 0 || !h[n]) || r < 0.06)) style.prop(K, cell.c.x, cell.c.y, asHash(cell.i, 13), cell);
    const gh = asGrassHex(style);
    if (gh !== null) asGrass(K, grid, cell, gh);
    K.sway = 0;
  } else {
    const bh = asPick(style.palette, asHash(cell.i, 1));
    const tower = hc >= 2 && cell.nb.every((n) => n < 0 || h[n] <= hc - 2);
    const exposed = (L, k) => cell.nb[k] < 0 || h[cell.nb[k]] <= L;
    if (water) {
      // stone footing down into the water
      cell.e.forEach((e, k) => {
        if (cell.nb[k] >= 0 && h[cell.nb[k]]) return;
        K.poly("matte", style.found, [v3(e.a, -0.012), v3(e.b, -0.012), v3(e.b, 0), v3(e.a, 0)], 0.05, r);
      });
    }
    if (style.column) {
      style.column(K, { ci: cell.i, h: hc, cell, corners: cell.v.map((vi) => grid.verts[vi]), cen2: cell.c, exposed });
      if (!water) K.poly("ground", style.ground.hex, cell.v.map((vi) => v3(grid.verts[vi], 1e-4)), 0.07, r);
    } else {
      // floor under the building too: styles that set their walls back (Greek colonnades) would show the void
      if (!water) K.poly("ground", style.ground.hex, cell.v.map((vi) => v3(grid.verts[vi], 1e-4)), 0.07, r);
      for (let L = 0; L < hc; L++) {
        const y0 = L * H;
        cell.e.forEach((e, k) => {
          if (!exposed(L, k)) return;
          const kp = (k + 3) % 4, kn = (k + 1) % 4;
          style.wall(K, {
            ci: cell.i, k, L, h: hc, y0, y1: y0 + H, top: L === hc - 1, tower, bh, cell,
            a3: v3(e.a, y0), b3: v3(e.b, y0), t3: v3(e.t, 0), n3: v3(e.n, 0), len: e.len,
            r: asHash(cell.i, k, L), prevExp: exposed(L, kp), nextExp: exposed(L, kn),
            nPrev: v3(cell.e[kp].n, 0), nNext: v3(cell.e[kn].n, 0)
          });
        });
      }
      const y = hc * H;
      style.roof(K, {
        ci: cell.i, h: hc, y, tower, r, wall: bh, ins: cell.ins,
        v3: cell.v.map((vi) => v3(grid.verts[vi], y)), n3: cell.e.map((e) => v3(e.n, 0)),
        join: cell.nb.map((n) => n >= 0 && h[n] >= hc), cen: v3(cell.c, y)
      });
    }
  }
  const out = {};
  for (const [kind, b] of Object.entries(K.B)) {
    if (!b.p.length) continue;
    const P = new Float32Array(b.p), C = new Float32Array(b.c), S = new Float32Array(b.s);
    let N = new Float32Array(b.n);
    if (style.warp && kind !== "ground") {
      const p = new THREE6.Vector3();
      for (let i = 0; i < P.length; i += 3) {
        style.warp(p.set(P[i], P[i + 1], P[i + 2]));
        P[i] = p.x;
        P[i + 1] = p.y;
        P[i + 2] = p.z;
      }
      // bent surfaces: smooth normals within the cell (or recomputed flat ones)
      let g = new THREE6.BufferGeometry().setAttribute("position", new THREE6.BufferAttribute(P, 3)).setAttribute("color", new THREE6.BufferAttribute(C, 3)).setAttribute("sway", new THREE6.BufferAttribute(S, 1));
      // smooth: true, or the list of surface kinds to smooth (the rest keep flat normals; merging is costly)
      if (style.smooth === true || style.smooth?.includes?.(kind)) {
        g = mergeVertices(g, 1e-5);
        g.computeVertexNormals();
        g = g.toNonIndexed();
        out[kind] = { p: g.attributes.position.array, n: g.attributes.normal.array, c: g.attributes.color.array, s: g.attributes.sway.array };
        continue;
      }
      g.computeVertexNormals();
      N = g.attributes.normal.array;
    }
    out[kind] = { p: P, n: N, c: C, s: S };
  }
  return out;
}
// grass for grounds that are green enough to be lawns or meadows (not sand, paving or water): the ground's
// own hue, a shade deeper
function asGrassHex(style) {
  if (style._grass !== void 0) return style._grass;
  const c = new THREE6.Color(style.ground.hex), hsl = c.getHSL({});
  const green = !style.ground.water && hsl.h > 0.15 && hsl.h < 0.45 && hsl.s > 0.12;
  return style._grass = green ? c.offsetHSL(0.01, 0.08, -0.07).getHex() : null;
}
// a few tufts of three blades each, scattered over an open cell
function asGrass(K, grid, cell, hex) {
  const n = cell.v.length, cx = cell.c.x, cz = cell.c.y;
  for (let t = 0; t < 9; t++) {
    const q = (k) => asHash(cell.i, t, k);
    const k = Math.floor(q(1) * n), a = grid.verts[cell.v[k]], b = grid.verts[cell.v[(k + 1) % n]];
    let u = q(2) * 0.85, v = q(3) * 0.85;
    if (u + v > 0.85) u = 0.85 - u, v = 0.85 - v;
    const x = cx + (a.x - cx) * u + (b.x - cx) * v, z = cz + (a.y - cz) * u + (b.y - cz) * v;
    for (let j = 0; j < 3; j++) {
      const r = (m) => asHash(cell.i, t, j, m), ang = r(1) * 6.283, w = 4e-4;
      const ox = Math.cos(ang) * w, oz = Math.sin(ang) * w, lean = 9e-4 * (r(2) - 0.5);
      const hh = 2.4e-3 + r(3) * 2.2e-3;
      K.tri("grass", hex, new THREE6.Vector3(x - ox, 0, z - oz), new THREE6.Vector3(x + ox, 0, z + oz), new THREE6.Vector3(x + lean * Math.sin(ang), hh, z - lean * Math.cos(ang)), 0.25, r(4));
    }
  }
}
// a cell's creases and outlines, for the line looks: ground and lights left out (the ground would draw the grid)
function asChunkEdges(chunk) {
  const parts = Object.entries(chunk).filter(([k]) => k !== "ground" && k !== "glow" && k !== "grass").map(([, c]) => c.p);
  const n = parts.reduce((a, p) => a + p.length, 0);
  if (!n) return new Float32Array(0);
  // EdgesGeometry welds at 1e-4; the town's details are millimetres, so work at 100x and scale back
  const P = new Float32Array(n);
  let o = 0;
  for (const p of parts) P.set(p, o), o += p.length;
  for (let i = 0; i < n; i++) P[i] *= 100;
  const g = new THREE6.BufferGeometry().setAttribute("position", new THREE6.BufferAttribute(P, 3));
  const E = new THREE6.EdgesGeometry(g, 28).attributes.position.array;
  for (let i = 0; i < E.length; i++) E[i] *= 0.01;
  return E;
}
// the same edges drawn by hand: two strokes each, a little off the true line and running past the corners
function asSketchStrokes(E, seed) {
  const out = new Float32Array(E.length * 2), a = new THREE6.Vector3(), b = new THREE6.Vector3(), d = new THREE6.Vector3(), j = new THREE6.Vector3();
  let o = 0;
  for (let i = 0; i < E.length; i += 6) {
    a.fromArray(E, i);
    b.fromArray(E, i + 3);
    const L = a.distanceTo(b);
    d.subVectors(b, a).normalize();
    for (let k = 0; k < 2; k++) {
      const r = (q) => asHash(seed, i, k * 7 + q) - 0.5;
      const over = Math.min(L * 0.18, 1.6e-3);
      j.set(r(1), r(2), r(3)).multiplyScalar(6e-4);
      out.set(a.clone().addScaledVector(d, -over * (0.3 + r(4) + 0.5)).add(j).toArray(), o);
      j.set(r(5), r(6), r(7)).multiplyScalar(6e-4);
      out.set(b.clone().addScaledVector(d, over * (0.3 + r(8) + 0.5)).add(j).toArray(), o + 3);
      o += 6;
    }
  }
  return out;
}
// The town is cut into AS_TILES x AS_TILES tiles, each with one mesh per surface kind. An edit (or a step of a
// reform) rebuilds only the tiles whose cells changed, instead of re-merging and re-uploading the whole town.
var AS_TILES = 4;
function asTileOf(grid) {
  return grid.tileOf ||= grid.cells.map((c) => {
    const f = (v) => Math.min(AS_TILES - 1, Math.max(0, Math.floor((v + AS_R) / (2 * AS_R) * AS_TILES)));
    return f(c.c.x) * AS_TILES + f(c.c.y);
  });
}
function asCellKey(cell, h) {
  return h[cell.i] + ":" + cell.nb.map((n) => n < 0 ? -1 : h[n]).join(",");
}
// one tile's meshes from its cells' cached chunks
function asTileMeshes(grid, h, style, mats, cache, tile) {
  const parts = {}, tileOf = asTileOf(grid), keys = [];
  for (const cell of grid.cells) {
    if (tileOf[cell.i] !== tile) continue;
    const key = asCellKey(cell, h);
    keys.push(key);
    let e = cache.get(cell.i);
    if (!e || e.key !== key) cache.set(cell.i, e = { key, chunk: asCellChunk(grid, h, style, cell) });
    for (const [kind, c] of Object.entries(e.chunk)) (parts[kind] ||= []).push(c);
  }
  const meshes = [];
  // watercolour and sketch draw the edges too: worked out per cell (and cached with it) only once a look asks for them
  const ls = mats.lines();
  if (ls) {
    const segs = [];
    for (const cell of grid.cells) if (tileOf[cell.i] === tile) {
      const e = cache.get(cell.i);
      e.edges ||= asChunkEdges(e.chunk);
      const E = ls === "S" ? e.strokes ||= asSketchStrokes(e.edges, cell.i) : e.edges;
      if (E.length) segs.push(E);
    }
    if (segs.length) {
      const n = segs.reduce((a, e) => a + e.length, 0), P = new Float32Array(n);
      let o = 0;
      for (const e of segs) P.set(e, o), o += e.length;
      const l = new THREE6.LineSegments(new THREE6.BufferGeometry().setAttribute("position", new THREE6.BufferAttribute(P, 3)), mats.lineMat);
      l.geometry.computeBoundingSphere();
      l.userData.noCollider = l.userData.noHighlight = true;
      meshes.push(l);
    }
  }
  for (const [kind, list] of Object.entries(parts)) {
    const cat = (k) => {
      const n = list.reduce((s2, c) => s2 + c[k].length, 0), out = new Float32Array(n);
      let o = 0;
      for (const c of list) {
        out.set(c[k], o);
        o += c[k].length;
      }
      return out;
    };
    const g = new THREE6.BufferGeometry();
    g.setAttribute("position", new THREE6.BufferAttribute(cat("p"), 3));
    g.setAttribute("normal", new THREE6.BufferAttribute(cat("n"), 3));
    g.setAttribute("color", new THREE6.BufferAttribute(cat("c"), 3));
    g.setAttribute("sway", new THREE6.BufferAttribute(cat("s"), 1));
    g.computeBoundingSphere();
    const m = new THREE6.Mesh(g, mats.kind(kind));
    m.castShadow = kind !== "ground" && kind !== "glow";
    m.receiveShadow = kind !== "glow";
    m.userData.noCollider = m.userData.noHighlight = true;
    meshes.push(m);
  }
  return { key: keys.join("|") + "|" + ls, meshes };
}
function asBuild(grid, h, style, mats, cache) {
  const group = new THREE6.Group();
  group.name = `town:${style.id}`;
  const water = !!style.ground.water;
  // the island's edge
  const side = new THREE6.Mesh(new THREE6.CylinderGeometry(AS_R + 2e-3, AS_R + 2e-3, 0.022, 96, 1, true), mats.make("side", style.ground.side));
  side.position.y = -0.011;
  group.add(side);
  if (water) {
    const w = new THREE6.Mesh(new THREE6.CircleGeometry(AS_R + 2e-3, 96).rotateX(-Math.PI / 2), mats.water(style.ground.hex));
    w.position.y = -4e-3;
    w.receiveShadow = true;
    group.add(w);
    const bed = new THREE6.Mesh(new THREE6.CircleGeometry(AS_R + 2e-3, 96).rotateX(-Math.PI / 2), mats.make("bed", style.ground.side));
    bed.position.y = -0.02;
    group.add(bed);
  }
  group.userData.tiles = [];
  for (let t = 0; t < AS_TILES * AS_TILES; t++) {
    const tl = asTileMeshes(grid, h, style, mats, cache, t);
    for (const m of tl.meshes) group.add(m);
    group.userData.tiles.push(tl);
  }
  group.userData.style = style.id;
  group.traverse((o) => o.userData.noCollider = o.userData.noHighlight = true);
  return group;
}
// the same town after an edit: only the tiles whose cells changed get new meshes
function asUpdate(town, grid, h, style, mats, cache) {
  const tileOf = asTileOf(grid), keys = Array.from({ length: AS_TILES * AS_TILES }, () => []);
  for (const cell of grid.cells) keys[tileOf[cell.i]].push(asCellKey(cell, h));
  town.userData.tiles.forEach((tl, t) => {
    if (tl.key === keys[t].join("|") + "|" + mats.lines()) return;
    for (const m of tl.meshes) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    const nt = town.userData.tiles[t] = asTileMeshes(grid, h, style, mats, cache, t);
    for (const m of nt.meshes) {
      m.userData.noCollider = m.userData.noHighlight = true;
      town.add(m);
    }
  });
}
// the invisible pick mesh: the top of every column and each exposed storey face, tagged per triangle
function asPickMesh(grid, h) {
  const pos = [], meta = [];
  const push = (pts, m) => {
    for (let i = 1; i + 1 < pts.length; i++) {
      for (const p of [pts[0], pts[i], pts[i + 1]]) pos.push(p[0], p[1], p[2]);
      meta.push(m);
    }
  };
  for (const cell of grid.cells) {
    const hc = h[cell.i], y = hc * AS_H;
    push(cell.v.map((vi) => [grid.verts[vi].x, y, grid.verts[vi].y]), { cell: cell.i, top: true, level: hc });
    for (let L = 0; L < hc; L++) cell.e.forEach((e, k) => {
      if (cell.nb[k] >= 0 && h[cell.nb[k]] > L) return;
      push([[e.a.x, L * AS_H, e.a.y], [e.b.x, L * AS_H, e.b.y], [e.b.x, (L + 1) * AS_H, e.b.y], [e.a.x, (L + 1) * AS_H, e.a.y]], { cell: cell.i, top: false, level: L, k });
    });
  }
  const g = new THREE6.BufferGeometry();
  g.setAttribute("position", new THREE6.Float32BufferAttribute(pos, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  const mat = new THREE6.MeshBasicMaterial({ side: THREE6.DoubleSide });
  mat.visible = false;
  const mesh = new THREE6.Mesh(g, mat);
  mesh.userData.meta = meta;
  mesh.userData.noHighlight = true;
  return mesh;
}
// a town to start from: noise hills of houses, a canal, a square and a few towers
function asGenerate(cells, seed) {
  const rnd = asRng(seed), ph = Array.from({ length: 8 }, () => rnd() * 6.283);
  const fq = Array.from({ length: 4 }, () => 9 + rnd() * 14);
  const noise = (x, z) => (Math.sin(x * fq[0] + ph[0]) * Math.cos(z * fq[1] + ph[1]) + 0.6 * Math.sin(x * fq[2] + z * fq[3] + ph[2]) + 0.4 * Math.cos(z * fq[0] * 1.7 - x * fq[3] * 0.6 + ph[3])) / 2;
  const ang = rnd() * Math.PI, cn = new THREE6.Vector2(Math.cos(ang), Math.sin(ang)), off = (rnd() - 0.5) * 0.08;
  const sq = cells[Math.floor(rnd() * cells.length)].c;
  const h = cells.map((c) => {
    const d = c.c.length() / AS_R;
    const v = noise(c.c.x, c.c.y) * 0.55 + 0.62 - d * 0.75;
    if (Math.abs(c.c.dot(cn) - off + Math.sin(c.c.dot(new THREE6.Vector2(-cn.y, cn.x)) * 22) * 0.012) < 0.016) return 0;
    if (c.c.distanceTo(sq) < 0.04) return 0;
    // fewer blocks than a full town: a headset (and the landing tour) rebuilds every one of them on an era change
    return v > 0.32 ? Math.min(4, 1 + Math.floor((v - 0.32) * 6 + rnd() * 0.6)) : 0;
  });
  const built = cells.filter((c) => h[c.i] >= 2);
  for (let t = 0; t < 2 && built.length; t++) {
    const c = built[Math.floor(rnd() * built.length)];
    h[c.i] = Math.min(AS_MAXH, h[c.i] + 2 + Math.floor(rnd() * 2));
    for (const n of c.nb) if (n >= 0) h[n] = Math.min(h[n], h[c.i] - 2);
  }
  return h;
}
var Archiscape = {
  id: "archiscape",
  title: "Archiscape",
  // keys the world uses itself (VibeXR 0.9+ leaves them to it instead of flying the camera)
  claimKeys: "enz",
  init(ctx) {
    const { root, THREE: T } = ctx;
    const app2 = this.app = ctx.app;
    this.ctx = ctx;
    const TABLE = this.table = app2.sessionMode ? THREE6.MathUtils.clamp(app2.input.head.y - AS_TABLE_BELOW_HEAD, 0.55, 1.6) : 1.44;
    const r = app2.renderer;
    if (!r.shadowMap.enabled) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = T.PCFShadowMap;
    }
    // one shared environment map for metal, glass and water (built once per page)
    if (!asEnv) {
      const pm = new T.PMREMGenerator(r);
      asEnv = pm.fromScene(new AsRoomEnvironment(), 0.04).texture;
      pm.dispose();
    }
    this.mats = asMaterials();
    root.add(new T.HemisphereLight(16777215, 9204838, 2.6));
    // - the island on a floating plate; the plate is the handle -
    const island = this.island = new T.Group();
    island.name = "island";
    island.position.set(0, TABLE + 0.035, -0.55);
    island.rotation.y = THREE6.MathUtils.degToRad(-15);
    // a little smaller than the town's own scale: the whole diorama sits comfortably within reach
    island.scale.setScalar(AS_ISLAND_SCALE);
    root.add(island);
    const sun = new T.DirectionalLight(16773852, 3.4);
    sun.position.set(0.3, 0.6, 0.45);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -0.36, right: 0.36, top: 0.36, bottom: -0.36, near: 0.05, far: 1.4 });
    sun.shadow.bias = -4e-4;
    sun.shadow.normalBias = 3e-3;
    island.add(sun, sun.target);
    const PLATE_H = 0.026;
    const plateMat = new T.MeshBasicMaterial({ color: 0 });
    const plate = new T.Mesh(new T.CylinderGeometry(AS_R + 0.03, AS_R + 0.03, PLATE_H, 96), plateMat);
    plate.position.y = -0.022 - PLATE_H / 2;
    island.add(plate);
    const rim = asRims(plate.geometry, 0.9, 4);
    rim.position.copy(plate.position);
    island.add(rim);
    this.grid = asGrid(20251014);
    this.h = new Int8Array(asGenerate(this.grid.cells, 7));
    this.history = [];
    this.caches = {};
    this.styleIdx = AS_STYLES.findIndex((s) => s.id === "stonehenge");
    this.town = null;
    this.leaving = [];
    this.islandIt = ctx.add(island, {
      draggable: true,
      // one hand carries the plate and keeps its front (the hint, the panel on its right) to you; two hands turn it
      faceViewer: true,
      twoHand: true,
      box: new T.Box3(new T.Vector3(-AS_R - 0.03, -0.022 - PLATE_H, -AS_R - 0.03), new T.Vector3(AS_R + 0.03, -0.022, AS_R + 0.03)),
      // stays upright: only position, yaw and scale
      constrain: ({ position, quaternion, scale }) => {
        const e = new T.Euler().setFromQuaternion(quaternion, "YXZ");
        quaternion.setFromEuler(new T.Euler(0, e.y, 0, "YXZ"));
        scale.setScalar(THREE6.MathUtils.clamp(scale.x, 0.4, 3));
        position.y = Math.max(position.y, 0.3);
      }
    });
    // - the pick mesh is the build target -
    const pickRoot = this.pickRoot = new T.Group();
    pickRoot.name = "town";
    island.add(pickRoot);
    this._rebuildPick();
    this.townIt = ctx.add(pickRoot, { precise: true, highlight: false, longPress: true });
    this.townIt.on("tap", (e) => this._edit(e, this.erase ? "del" : "add"));
    this.townIt.on("longpress", (e) => this._edit(e, "del"));
    // ghost outline of the block a tap would add (or remove)
    this.ghost = new LineSegments2(new LineSegmentsGeometry(), new LineMaterial({ color: 16777215, linewidth: 3, transparent: true, opacity: 0.9, worldUnits: false, depthTest: false }));
    this.ghost.renderOrder = 10;
    this.ghost.visible = false;
    this.ghost.userData.noCollider = this.ghost.userData.noHighlight = true;
    this.ghost.onBeforeRender = (renderer, scene, camera) => {
      const vp = camera.viewport;
      if (vp) this.ghost.material.resolution.set(vp.z, vp.w);
      else renderer.getSize(this.ghost.material.resolution);
    };
    island.add(this.ghost);
    this.ghostKey = "";
    // the white flash of a block that just appeared or went
    this.flash = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0, depthWrite: false }));
    this.flash.userData.noCollider = this.flash.userData.noHighlight = true;
    this.flash.visible = false;
    island.add(this.flash);
    // - title over the island -
    this.titleTex = textTexture("", { w: 1024, h: 96, size: 56, color: "#ffffff" });
    this.subTex = textTexture("", { w: 1024, h: 64, size: 30, color: "#ffffff" });
    const tm = new T.Mesh(new T.PlaneGeometry(0.4, 0.4 * 96 / 1024), new T.MeshBasicMaterial({ map: this.titleTex, transparent: true, depthWrite: false }));
    const sm = new T.Mesh(new T.PlaneGeometry(0.4, 0.4 * 64 / 1024), new T.MeshBasicMaterial({ map: this.subTex, transparent: true, depthWrite: false, opacity: 0.75 }));
    sm.position.y = -0.035;
    const title = this.title = new T.Group();
    title.add(tm, sm);
    title.traverse((o) => o.userData.noCollider = o.userData.noHighlight = true);
    root.add(title);
    // - the panel: one button per style, then the tools -
    const PW = 0.39, PH = 0.284;
    const panel = ctx.panel("Archiscape · one town, every era", { w: PW, h: PH });
    panel.root.position.set(0.5, TABLE + 0.1, -0.34);
    panel.root.lookAt(0, TABLE + 0.34, 0.3);
    root.add(panel.root);
    // nineteen eras in five columns, the tools in two rows under them
    this.styleBtns = AS_STYLES.map((s, i) => ctx.button(s.label, { w: 0.07, fontSize: s.label.length > 10 ? 22 : 26, onClick: () => this.setStyle(i) }));
    const tool = (label, o) => ctx.button(label, { w: 0.0885, fontSize: 24, ...o });
    const gen = tool("New town", { onClick: () => this.generate() });
    this.eraseB = tool("Erase", { toggle: true, onClick: (v) => {
      this.erase = v;
      this.ghostKey = "";
    } });
    const undo = tool("Undo", { onClick: () => this.undo() });
    const clear = tool("Clear", { onClick: () => this._commit(new Int8Array(this.h.length)) });
    // tours. Eras: each era reforms its town once (New town, grown out of the last shape), then the next era
    // takes over the same shape. Towns: stay in this era, reforming again and again
    const tour = () => this.tour = this.tourEras || this.tourTowns ? this.tour ?? 0 : null;
    this.tourErasB = tool("Tour eras", { w: 0.0885, toggle: true, onClick: (v) => {
      this.tourEras = v;
      tour();
    } });
    this.tourTownsB = tool("Tour towns", { w: 0.0885, toggle: true, onClick: (v) => {
      this.tourTowns = v;
      tour();
    } });
    // the render look: vivid colour, white clay, watercolour, pencil sketch
    this.lookIdx = 0;
    this.lookB = tool("Look: Vivid", { onClick: () => this.setLook((this.lookIdx + 1) % AS_LOOKS.length) });
    asMusic ||= new AsMusic(app2.sfx);
    this.music = asMusic;
    const music = tool("Music", { w: 0.0885, toggle: true, value: asMusic.on, onClick: (v) => {
      app2.sfx.ensure();
      asMusic.setOn(v);
    } });
    panel.layout(this.styleBtns, { cols: 5, top: 0.03 });
    const rows = Math.ceil(AS_STYLES.length / 5);
    panel.layout([gen, this.eraseB, undo, clear, this.tourErasB, this.tourTownsB, music, this.lookB], { cols: 4, top: 0.03 + rows * 0.032 + 8e-3 });
    this.infoTex = textTexture("", { w: 1024, h: 56, size: 24, color: "#ffffff" });
    const info = new T.Mesh(new T.PlaneGeometry(PW - 0.016, (PW - 0.016) * 56 / 1024), new T.MeshBasicMaterial({ map: this.infoTex, transparent: true, depthWrite: false }));
    info.position.set(0, -PH / 2 + 0.02, 2e-3);
    panel.root.add(info);
    // the panel rides on the plate, and its bar moves it
    island.updateWorldMatrix(true, false);
    island.attach(panel.root);
    this.panelRoot = panel.root;
    asPanelHandle(ctx, panel.root, { w: 0.16, y: -PH / 2 - 0.014 });
    const tl = ctx.label("Tap a tile to build · tap a wall to build beside it · hold to remove · grab the plate to move, two hands to turn", { height: 0.011 });
    tl.position.set(0, TABLE + 0.012, -0.22);
    tl.rotation.x = -Math.PI / 2.6;
    root.add(tl);
    // the hint rides on the plate: moved, turned or scaled, it goes along
    this.island.updateWorldMatrix(true, false);
    this.island.attach(tl);
    this.hintLabel = tl;
    // desktop keys: arrows change era, N new town, E erase, Z undo
    this._kd = (e) => {
      if (e.key === "ArrowRight") this.setStyle((this.styleIdx + 1) % AS_STYLES.length);
      else if (e.key === "ArrowLeft") this.setStyle((this.styleIdx + AS_STYLES.length - 1) % AS_STYLES.length);
      else if (e.key === "n" || e.key === "N") this.generate();
      else if (e.key === "e" || e.key === "E") this.eraseB._click();
      else if (e.key === "z" || e.key === "Z") this.undo();
      else return;
      e.preventDefault();
    };
    addEventListener("keydown", this._kd);
    // on a desktop the landing card never goes away: the first key, click or wheel hands the camera over (the
    // camera only: the tour plays on until its button stops it)
    this._took = () => this.tookOver = true;
    addEventListener("keydown", this._took);
    app2.renderer.domElement.addEventListener("pointerdown", this._took);
    app2.renderer.domElement.addEventListener("wheel", this._took, { passive: true });
    this.erase = false;
    this.tour = null;
    this.tourEras = this.tourTowns = false;
    this.time = 0;
    this.life = new AsLife(this);
    this.setStyle(this.styleIdx, true);
    // both tours start on (their buttons say so); either button stops them
    this.tourErasB._click();
    this.tourTownsB._click();
    this.autoTour = true;
  },
  setLook(i) {
    const had = this.mats.lines();
    this.lookIdx = i;
    this.mats.setLook(i);
    this.lookB.setLabel(`Look: ${AS_LOOKS[i].label}`);
    // a look with lines (or one without, after one with) patches every tile of the town
    if (this.mats.lines() !== had) this._rebuild(null);
    this.app.log(`look → ${AS_LOOKS[i].label}`);
  },
  setStyle(i, instant = false) {
    this.styleIdx = i;
    const s = AS_STYLES[i];
    // the current era reads as a toggled-on button; the others are plain buttons
    this.styleBtns.forEach((b, k) => {
      b.toggle = k === i;
      b.setValue(k === i);
    });
    this.titleTex.userData.draw(s.title);
    this.subTex.userData.draw(s.era);
    this.infoTex.userData.draw(s.blurb);
    // the era's own music, crossfading from the last one
    asMusic?.play(s.id);
    this.life?.setStyle(s);
    this._rebuild(instant ? null : "era");
    this.app.log(`era → ${s.title}`);
  },
  // swap in a freshly built town; on an era change the old town sinks while the new one rises
  _rebuild(mode = null) {
    const t0 = performance.now();
    const st = AS_STYLES[this.styleIdx];
    const cache = this.caches[st.id] ||= /* @__PURE__ */ new Map();
    // an edit in the same era: patch the changed tiles of the town in place
    if (mode === null && this.town && this.town.userData.style === st.id && this.town.userData.rise === void 0) {
      asUpdate(this.town, this.grid, this.h, st, this.mats, cache);
      this.buildMs = performance.now() - t0;
      return;
    }
    const town = asBuild(this.grid, this.h, st, this.mats, cache);
    this.buildMs = performance.now() - t0;
    if (this.town) {
      if (mode === "era") {
        this.leaving.push({ g: this.town, t: 0 });
        town.scale.y = 1e-3;
        town.userData.rise = 0;
      } else this._dispose(this.town);
    }
    this.town = town;
    this.island.add(town);
  },
  // build (up to `ms` milliseconds' worth of) cells of a style's town into its cache, as asBuild would
  _warm(style, ms) {
    const cache = this.caches[style.id] ||= /* @__PURE__ */ new Map(), t0 = performance.now(), h = this.h;
    for (const cell of this.grid.cells) {
      const key = h[cell.i] + ":" + cell.nb.map((n) => n < 0 ? -1 : h[n]).join(",");
      const e = cache.get(cell.i);
      if (e && e.key === key) continue;
      cache.set(cell.i, { key, chunk: asCellChunk(this.grid, h, style, cell) });
      if (performance.now() - t0 > ms) return;
    }
  },
  _dispose(g) {
    g.removeFromParent();
    g.traverse((o) => {
      o.geometry?.dispose();
      if (o.material?.userData.own) o.material.dispose();
    });
  },
  _rebuildPick() {
    this.pick?.geometry.dispose();
    this.pick?.removeFromParent();
    this.pick = asPickMesh(this.grid, this.h);
    this.pickRoot.add(this.pick);
    if (this.townIt) this.townIt.localBox = computeLocalBox(this.pickRoot);
  },
  _commit(h, flash = null) {
    this.morph = null;
    this.history.push(this.h);
    if (this.history.length > 60) this.history.shift();
    this.h = h;
    this._rebuild();
    this._rebuildPick();
    this.ghostKey = "";
    if (flash) this._flash(flash.cell, flash.level, flash.del);
  },
  undo() {
    this.morph = null;
    const h = this.history.pop();
    if (!h) return;
    this.h = h;
    this._rebuild();
    this._rebuildPick();
    this.ghostKey = "";
  },
  _tourStep() {
    this.tourK = (this.tourK ?? 0) + 1;
    if (this.tourEras && this.tourK % (AS_TOUR_REFORMS + 1) === 0) return this.setStyle((this.styleIdx + 1) % AS_STYLES.length);
    this.generate();
  },
  // a new layout: a style's own preset now and then (Stonehenge's ring), otherwise a fresh town
  _layout(s) {
    this._seed = (this._seed || 7) + 1;
    return s.preset && this._seed % 2 ? s.preset(this.grid.cells) : asGenerate(this.grid.cells, this._seed * 7919);
  },
  generate() {
    this._morphTo(new Int8Array(this._layout(AS_STYLES[this.styleIdx])));
  },
  // reshape the town into h: a wave sweeps across the island from a random side and each column it passes steps
  // one storey at a time towards its new height, so the old town grows into the new one
  _morphTo(h) {
    this.history.push(this.h);
    if (this.history.length > 60) this.history.shift();
    const a = Math.random() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    const key = this.grid.cells.map((c) => (c.c.x * dx + c.c.y * dz) / (2 * AS_R) + 0.5 + Math.random() * 0.08);
    this.morph = { target: h, key, t: 0, acc: 0 };
  },
  _morphStep(dt) {
    const m = this.morph;
    m.t += dt;
    m.acc += dt;
    if (m.acc < 0.03) return;
    m.acc = 0;
    const front = m.t / AS_MORPH_S, next = Int8Array.from(this.h);
    // at most AS_MORPH_CELLS columns move per tick (each one rebuilds its cell and its neighbours'): the wave
    // stays smooth on a headset instead of one heavy frame per step
    let changed = 0, left = false;
    for (let i = 0; i < next.length; i++) {
      if (next[i] === m.target[i]) continue;
      left = true;
      if (m.key[i] > front || changed >= AS_MORPH_CELLS) continue;
      next[i] += Math.sign(m.target[i] - next[i]);
      changed++;
    }
    if (changed) {
      this.h = next;
      this._rebuild();
    }
    if (!left) {
      this.morph = null;
      this._rebuildPick();
      this.ghostKey = "";
    }
  },
  // what a ray would build / remove: the top of a column builds on it, a wall builds in the column beside it
  _target(origin, dir) {
    const rc = new THREE6.Raycaster(origin, dir, 0, 20);
    this.pick.updateMatrixWorld();
    const hit = rc.intersectObject(this.pick, false)[0];
    if (!hit) return null;
    const m = this.pick.userData.meta[hit.faceIndex], cell = this.grid.cells[m.cell];
    if (m.top) return { add: m.level < AS_MAXH ? { cell: m.cell, level: m.level } : null, del: m.level > 0 ? { cell: m.cell, level: m.level - 1 } : null };
    const nb = cell.nb[m.k];
    return { add: nb >= 0 ? { cell: nb, level: m.level } : null, del: { cell: m.cell, level: m.level } };
  },
  _rayOf(interactor, point) {
    const s = interactor.source;
    if (interactor.type === "far" && s.ray?.valid) return [s.ray.origin.clone(), s.ray.dir.clone()];
    // a pinch or poke builds on the column right under the fingers
    const down = new THREE6.Vector3(0, -1, 0).transformDirection(this.island.matrixWorld);
    return [point.clone().addScaledVector(down, -0.06), down];
  },
  _edit(e, op) {
    const [o, d] = this._rayOf(e.interactor, e.point);
    const tg = this._target(o, d);
    const t = tg?.[op];
    if (!t || t.level === null) return;
    const h = Int8Array.from(this.h);
    if (op === "add") h[t.cell] = Math.min(AS_MAXH, t.level + 1);
    else h[t.cell] = t.level;
    this._commit(h, { ...t, del: op === "del" });
    this._plink(op === "add" ? t.level : -1);
  },
  _prism(cell, level, grow = 0) {
    const c = this.grid.cells[cell], pts = c.v.map((vi) => this.grid.verts[vi].clone().sub(c.c).multiplyScalar(1 + grow).add(c.c));
    return { pts, y0: level * AS_H - grow * 0.01, y1: (level + 1) * AS_H + grow * 0.01 };
  },
  _flash(cell, level, del) {
    const { pts, y0, y1 } = this._prism(cell, level, 0.04);
    const pos = [];
    const q = (a, b, c2, d) => pos.push(...a, ...b, ...c2, ...a, ...c2, ...d);
    for (let k = 0; k < 4; k++) {
      const a = pts[k], b = pts[(k + 1) % 4];
      q([a.x, y0, a.y], [b.x, y0, b.y], [b.x, y1, b.y], [a.x, y1, a.y]);
    }
    q(...pts.map((p) => [p.x, y1, p.y]));
    this.flash.geometry.dispose();
    this.flash.geometry = new THREE6.BufferGeometry().setAttribute("position", new THREE6.Float32BufferAttribute(pos, 3));
    this.flash.material.side = THREE6.DoubleSide;
    this.flash.material.color.setHex(del ? 16747625 : 16777215);
    this.flashT = 0;
    this.flash.visible = true;
  },
  // Townscaper-like plink, higher the taller it builds; a soft thud for a removal
  _plink(level) {
    const c = this.app.sfx.ensure();
    if (!c || c.state !== "running") return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    const f = level < 0 ? 180 : 520 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19][Math.min(8, level)] / 12);
    o.frequency.setValueAtTime(f * (level < 0 ? 1.6 : 1), t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(level < 0 ? 0.18 : 0.12, t + 8e-3);
    g.gain.exponentialRampToValueAtTime(1e-4, t + (level < 0 ? 0.25 : 0.6));
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.7);
  },
  _updateGhost() {
    let tg = null, op = this.erase ? "del" : "add";
    for (const g of this.app.im.groups.values()) {
      if (g.blocked) continue;
      for (const i of g.list) {
        if (i.hover !== this.townIt || i.selecting) continue;
        const [o, d] = this._rayOf(i, i.attach);
        tg = this._target(o, d);
        if (tg) break;
      }
      if (tg) break;
    }
    const t = tg?.[op];
    const key = t && t.level !== null ? `${op}:${t.cell}:${t.level}` : "";
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ghost.visible = !!key;
    if (!key) return;
    const { pts, y0, y1 } = this._prism(t.cell, t.level, 0.02);
    const seg = [];
    for (let k = 0; k < 4; k++) {
      const a = pts[k], b = pts[(k + 1) % 4];
      seg.push(a.x, y0, a.y, b.x, y0, b.y, a.x, y1, a.y, b.x, y1, b.y, a.x, y0, a.y, a.x, y1, a.y);
    }
    this.ghost.geometry.dispose();
    this.ghost.geometry = new LineSegmentsGeometry().setPositions(seg);
    this.ghost.material.color.setHex(op === "del" ? 16747625 : 16777215);
  },
  update(dt, t) {
    this.time += dt;
    this.mats.time.value = this.time;
    this.life?.update(dt);
    asMusic?.tick();
    // era change: the old town sinks, the new one springs up
    for (const l of this.leaving) {
      l.t += dt / 0.35;
      l.g.scale.y = Math.max(1e-3, 1 - l.t * l.t);
      if (l.t >= 1) this._dispose(l.g);
    }
    this.leaving = this.leaving.filter((l) => l.t < 1);
    const tw = this.town;
    if (tw.userData.rise !== void 0) {
      const u = tw.userData.rise = Math.min(1, tw.userData.rise + dt / 0.7);
      const k = Math.max(0, (u - 0.3) / 0.7), c1 = 1.70158, c3 = c1 + 1;
      tw.scale.y = Math.max(1e-3, k <= 0 ? 1e-3 : 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2));
      if (u >= 1) {
        tw.scale.y = 1;
        delete tw.userData.rise;
      }
    }
    if (this.flash.visible) {
      this.flashT += dt / 0.3;
      this.flash.material.opacity = 0.55 * Math.max(0, 1 - this.flashT);
      if (this.flashT >= 1) this.flash.visible = false;
    }
    this._attract(dt);
    if (this.morph) this._morphStep(dt);
    // on the era tour, the quiet seconds before the next era are spent building its town a few cells at a time,
    // so the switch itself costs almost nothing
    else if (this.tour !== null && this.tourEras && ((this.tourK ?? 0) + 1) % (AS_TOUR_REFORMS + 1) === 0) this._warm(AS_STYLES[(this.styleIdx + 1) % AS_STYLES.length], 5);
    if (this.tour !== null) {
      // the pause starts once the town has finished changing (a reform's wave, a new era's rise): the tour keeps
      // moving, with only a breath on each finished town
      if (this.morph || this.town.userData.rise !== void 0) this.tour = 0;
      else this.tour += dt;
      if (this.tour > (this.attract ? AS_ATTRACT_S : AS_TOUR_S)) {
        this.tour = 0;
        this._tourStep();
      }
    }
    this._updateGhost();
    // the title floats behind the island and turns to face the viewer
    const head = this.app.input.head, ip = this.island.getWorldPosition(new THREE6.Vector3());
    const s = this.island.scale.x;
    const away = new THREE6.Vector3(ip.x - head.x, 0, ip.z - head.z).normalize();
    this.title.position.copy(ip).addScaledVector(away, (AS_R + 0.04) * s).setY(ip.y + 0.26 * Math.max(0.7, s));
    this.title.lookAt(head.x, this.title.position.y, head.z);
    this.title.scale.setScalar(Math.max(0.7, s));
  },
  // landing (desktop, before Enter): the island plays by itself - the era tour at a brisker pace, each town
  // reforming before the next era grows out of it - while the camera circles it slowly. Entering the page ends it
  // (and leaves the tour as you had it)
  _attract(dt) {
    const a = this.app, on = !a.renderer.xr.isPresenting && !this.tookOver && !document.getElementById("overlay")?.classList.contains("hidden");
    // the landing page starts the era tour once, through the Tour eras button so the panel always shows the
    // real state; after that only the button starts or stops it (taking the camera or entering leaves it running)
    if (on && !this.attract) {
      this.attract = { ang: null };
      if (!this.autoTour) {
        this.autoTour = true;
        if (!this.tourEras) this.tourErasB._click();
      }
    } else if (!on && this.attract) this.attract = null;
    // the panel would swing through the shot as the camera circles: it waits off stage until you enter
    if (this.panelRoot) this.panelRoot.visible = this.hintLabel.visible = !this.attract;
    if (!this.attract) return;
    const A = this.attract, cam = a.camera, ctl = a.controls, c = this.island.getWorldPosition(new THREE6.Vector3());
    if (A.ang === null) A.ang = Math.atan2(cam.position.x - c.x, cam.position.z - c.z);
    A.ang += dt * 0.07;
    ctl.target.set(c.x, c.y + 0.06, c.z);
    cam.position.set(c.x + Math.sin(A.ang) * 0.62, c.y + 0.36, c.z + Math.cos(A.ang) * 0.62);
    cam.lookAt(ctl.target);
    ctl.update();
  },
  exit() {
    removeEventListener("keydown", this._kd);
    removeEventListener("keydown", this._took);
    this.app.renderer.domElement.removeEventListener("pointerdown", this._took);
    this.app.renderer.domElement.removeEventListener("wheel", this._took);
    asMusic?.stop();
  }
};
// a grab bar under a floating panel: drag it to put the panel anywhere (it keeps facing you); the panel is a
// child of the plate, so wherever you leave it, it then travels with the plate. The box covers only the bar.
var _asLook = new THREE6.Object3D();
function asPanelHandle(ctx, root, { w = 0.12, y = -0.16 } = {}) {
  const T = THREE6, bar = new T.Mesh(new T.CapsuleGeometry(5e-3, w, 4, 12).rotateZ(Math.PI / 2), new T.MeshBasicMaterial({ color: 12632256 }));
  bar.position.set(0, y, 4e-3);
  bar.name = "panel-handle";
  bar.userData.noCollider = bar.userData.noHighlight = true;
  root.add(bar);
  const it = ctx.add(root, {
    draggable: true, highlight: false,
    box: new T.Box3(new T.Vector3(-w / 2 - 0.012, y - 0.013, -0.012), new T.Vector3(w / 2 + 0.012, y + 0.013, 0.016)),
    constrain: ({ position, quaternion }) => {
      _asLook.position.copy(position);
      _asLook.lookAt(ctx.app.input.head);
      quaternion.copy(_asLook.quaternion);
    }
  });
  it.on("statechange", ({ level }) => bar.material.color.setHex(level ? 16777215 : 12632256));
  return it;
}
var asEnv = null, asMusic = null;
// s: how long the tour rests on each finished town before the next change (19 eras, each reformed once, in about
// a minute and a half)
var AS_TOUR_S = 0.9;
// s: the same on the landing page's self-playing tour
var AS_ATTRACT_S = 1.6;
var AS_ISLAND_SCALE = 0.88;
// how many times each era reforms its town on the tour before the next era; s: how long a reform takes to sweep
var AS_TOUR_REFORMS = 1, AS_MORPH_S = 1.4, AS_MORPH_CELLS = 6;
// render looks. Every town material reads one shared uniform, so a switch is instant and costs no recompile
var AS_LOOKS = [
  { id: "vivid", label: "Vivid", code: 0 },
  { id: "clay", label: "Clay", code: 1 },
  { id: "watercolor", label: "Watercolor", code: 3, lines: { hex: 4864554, opacity: 0.5 } },
  { id: "sketch", label: "Sketch", code: 4, lines: { hex: 3355443, opacity: 0.7, sketch: true } }
];
var AS_LOOK_GLSL = `uniform int asLook;
varying vec3 vAsP;
varying vec3 vAsN;
float asHashN(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float asNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(asHashN(i), asHashN(i + vec3(1, 0, 0)), f.x), mix(asHashN(i + vec3(0, 1, 0)), asHashN(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(asHashN(i + vec3(0, 0, 1)), asHashN(i + vec3(1, 0, 1)), f.x), mix(asHashN(i + vec3(0, 1, 1)), asHashN(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;
function asLookify(m, look) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m), lit = !m.isMeshBasicMaterial;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.uniforms.asLook = look;
    sh.vertexShader = "varying vec3 vAsP;\nvarying vec3 vAsN;\n" + (lit ? sh.vertexShader.replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\n  vAsN = objectNormal;") : sh.vertexShader).replace("#include <begin_vertex>", "#include <begin_vertex>\n  vAsP = transformed;" + (lit ? "" : "\n  vAsN = vec3(0.0, 1.0, 0.0);"));
    let f = AS_LOOK_GLSL + sh.fragmentShader;
    // clay: every surface one white; watercolour: colours a little paler, as if thinned with water
    f = f.replace("#include <color_fragment>", `#include <color_fragment>
  if (asLook == 1) diffuseColor.rgb = vec3(0.82);
  else if (asLook == 4) diffuseColor.rgb = mix(vec3(0.95, 0.93, 0.88), diffuseColor.rgb, 0.22);
  else if (asLook == 3) diffuseColor.rgb = mix(mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), 0.12), vec3(0.97, 0.95, 0.9), 0.16);`);
    if (lit) {
      f = f.replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
  if (asLook != 0) { metalnessFactor = 0.0; roughnessFactor = max(roughnessFactor, 0.8); }`);
      // watercolour: soft-edged washes, cool
      // blue shade instead of grey, pigment that granulates and pools at the edges, paper showing through
      f = f.replace("#include <opaque_fragment>", `if (asLook >= 2) {
    float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
    float base = max(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)), 0.02);
    float s = clamp(dot(outgoingLight, vec3(0.299, 0.587, 0.114)) / base, 0.0, 3.0);
    if (asLook == 3) {
      float n = asNoise(vAsP * 700.0) * 0.55 + asNoise(vAsP * 160.0) * 0.45;
      float sh = smoothstep(0.3, 0.8, s + (n - 0.5) * 0.25);
      vec3 col = diffuseColor.rgb * mix(vec3(0.68, 0.7, 0.84), vec3(1.1, 1.08, 1.04), sh);
      col *= 0.95 + 0.09 * n;
      col = mix(col, col * col * 1.2, 0.35 * smoothstep(0.35, 0.05, ndv));
      outgoingLight = mix(col, vec3(0.97, 0.95, 0.9), 0.14 * smoothstep(0.55, 0.8, n));
    } else if (asLook == 4) {
      // pencil hatching laid on the model (not the screen, so both eyes agree): one layer in shade, a cross
      // layer where it is darker; strokes waver with a little noise and fade to an even grey when too fine
      vec3 an = abs(vAsN);
      vec2 uv = an.y > 0.6 ? vAsP.xz : (an.x > an.z ? vAsP.zy : vAsP.xy);
      float n = asNoise(vAsP * 450.0);
      float a1 = (uv.x + uv.y) * 600.0 + n * 0.7, a2 = (uv.x - uv.y) * 680.0 + n * 0.7;
      float w1 = fwidth(a1), w2 = fwidth(a2);
      float l1 = 1.0 - smoothstep(0.1, 0.1 + w1, abs(fract(a1) - 0.5));
      float l2 = 1.0 - smoothstep(0.1, 0.1 + w2, abs(fract(a2) - 0.5));
      l1 = mix(l1, 0.3, smoothstep(0.25, 0.6, w1));
      l2 = mix(l2, 0.3, smoothstep(0.25, 0.6, w2));
      float t = s + (n - 0.5) * 0.25;
      float ink = max(l1 * (1.0 - smoothstep(0.7, 0.95, t)), l2 * (1.0 - smoothstep(0.4, 0.6, t))) * 0.6;
      vec3 paper = diffuseColor.rgb * mix(0.93, 1.04, smoothstep(0.4, 1.0, s));
      outgoingLight = mix(paper, vec3(0.2, 0.2, 0.23), ink) * (1.0 - 0.55 * smoothstep(0.25, 0.05, ndv));
    }
  }
  #include <opaque_fragment>`);
    }
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => prevKey() + "|look";
  return m;
}
function asMaterials() {
  // the shader's look codes (0 vivid, 1 clay, 3 watercolour, 4 sketch) stay fixed as looks come and go
  const cache = {}, look = { value: 0 }, time = { value: 0 };
  let cur = AS_LOOKS[0];
  const lineMat = new THREE6.LineBasicMaterial({ color: 0, transparent: true, opacity: 0.9 });
  const kind = (k) => {
    if (cache[k]) return cache[k];
    const o = AS_KINDS[k];
    const m = o.glow ? new THREE6.MeshBasicMaterial({ vertexColors: true, side: THREE6.DoubleSide }) : new THREE6.MeshStandardMaterial({ vertexColors: true, side: THREE6.DoubleSide, roughness: o.roughness, metalness: o.metalness, envMap: o.env ? asEnv : null, envMapIntensity: 0.9 });
    if (o.wash) {
      m.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * ${o.wash.toFixed(2)} * smoothstep(0.35, 0.75, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));`);
      };
      m.customProgramCacheKey = () => `wash${o.wash}`;
    }
    m.polygonOffset = true;
    m.polygonOffsetFactor = m.polygonOffsetUnits = 1;
    // wind: furnishings bend with their height above the ground, a ripple plus slow gusts sweeping across
    const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      sh.uniforms.asTime = time;
      sh.vertexShader = "attribute float sway;\nuniform float asTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
  if (sway > 0.0) {
    float hh = max(transformed.y, 0.0);
    float gust = 0.5 + 0.5 * sin(asTime * 0.45 - transformed.x * 9.0 - transformed.z * 4.0);
    float w = sin(asTime * 2.3 + transformed.x * 90.0 + transformed.z * 70.0) * 0.55 + sin(asTime * 3.9 + transformed.z * 140.0) * 0.25;
    transformed.x += (w + gust * 1.1) * hh * 0.055;
    transformed.z += (w * 0.6 + gust * 0.4) * hh * 0.04;
  }`);
    };
    m.customProgramCacheKey = () => prevKey() + "|wind";
    return cache[k] = asLookify(m, look);
  };
  const own = (m) => (m.userData.own = true, asLookify(m, look));
  const make = (name, hex) => own(new THREE6.MeshStandardMaterial({ color: hex, roughness: 0.95 }));
  const water = (hex) => own(new THREE6.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.05, envMap: asEnv, envMapIntensity: 0.22 }));
  const setLook = (i) => {
    cur = AS_LOOKS[i];
    look.value = cur.code;
    const L = cur.lines;
    if (L) lineMat.color.setHex(L.hex), lineMat.opacity = L.opacity;
  };
  // "" no lines, "L" clean edges, "S" sketched strokes
  const lines = () => {
    const L = cur.lines;
    return L ? L.sketch ? "S" : "L" : "";
  };
  return { kind, make, water, look, time, lineMat, setLook, lines };
}
function asRims(geo, opacity, px) {
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
// - life: birds over the town, leaves drifting down from the trees, koi in the water eras. Each is one
// instanced mesh moved on the CPU (a few dozen matrices a frame); wings and tails move in the vertex shader -
var AS_LEAVES = {
  kyoto: [16233167, 16242398, 16769511],
  jiangnan: [9418581, 11192933, 13221233],
  default: [13141050, 14263361, 10903854, 12298280]
};
// each era's birds: colour, size, wing length (x stretch), wingbeat speed, how much they glide (0 flap all the
// time .. 1 mostly soar), flock size, circle radius and height, angular speed
var AS_BIRDS = {
  default: { hex: 2829104, size: 0.85, wing: 1, beat: 13, glide: 0.5, n: 9, r: 0.2, y: 0.2, w: 0.32 },
  stonehenge: { hex: 1381653, size: 1.05, wing: 1.1, beat: 8, glide: 0.4, n: 6, r: 0.22, y: 0.22, w: 0.22 },
  greek: { hex: 15724527, size: 0.95, wing: 1.5, beat: 7, glide: 0.85, n: 5, r: 0.23, y: 0.24, w: 0.2 },
  roman: { hex: 7369604, size: 0.7, wing: 1, beat: 15, glide: 0.3, n: 12, r: 0.17, y: 0.19, w: 0.4 },
  hagia: { hex: 15724527, size: 0.95, wing: 1.5, beat: 7, glide: 0.85, n: 6, r: 0.23, y: 0.25, w: 0.2 },
  islamic: { hex: 7369604, size: 0.7, wing: 1, beat: 15, glide: 0.3, n: 12, r: 0.16, y: 0.2, w: 0.42 },
  forbidden: { hex: 1381653, size: 0.85, wing: 1.05, beat: 10, glide: 0.5, n: 8, r: 0.21, y: 0.23, w: 0.28 },
  jiangnan: { hex: 16250871, size: 1.1, wing: 1.6, beat: 5, glide: 0.75, n: 3, r: 0.16, y: 0.11, w: 0.16 },
  kyoto: { hex: 15790320, size: 1.25, wing: 1.7, beat: 4.5, glide: 0.7, n: 3, r: 0.2, y: 0.22, w: 0.14 },
  kremlin: { hex: 1381653, size: 0.85, wing: 1.05, beat: 10, glide: 0.45, n: 10, r: 0.2, y: 0.26, w: 0.3 },
  thai: { hex: 1716304, size: 0.6, wing: 1.3, beat: 18, glide: 0.25, n: 14, r: 0.15, y: 0.17, w: 0.6 },
  prussian: { hex: 3355443, size: 0.8, wing: 1, beat: 12, glide: 0.4, n: 9, r: 0.19, y: 0.22, w: 0.3 },
  gaudi: { hex: 2236962, size: 0.6, wing: 1.6, beat: 20, glide: 0.35, n: 16, r: 0.16, y: 0.24, w: 0.65 },
  wright: { hex: 7029314, size: 1.4, wing: 1.6, beat: 5, glide: 0.95, n: 1, r: 0.18, y: 0.3, w: 0.15 },
  corbusier: { hex: 7369604, size: 0.7, wing: 1, beat: 15, glide: 0.3, n: 10, r: 0.17, y: 0.2, w: 0.4 },
  meier: { hex: 15724527, size: 0.95, wing: 1.5, beat: 7, glide: 0.85, n: 5, r: 0.22, y: 0.25, w: 0.2 },
  ando: { hex: 1381653, size: 0.9, wing: 1.05, beat: 9, glide: 0.5, n: 4, r: 0.2, y: 0.23, w: 0.24 },
  pei: { hex: 1716304, size: 0.6, wing: 1.3, beat: 18, glide: 0.25, n: 12, r: 0.16, y: 0.18, w: 0.55 },
  gehry: { hex: 15724527, size: 0.95, wing: 1.5, beat: 7, glide: 0.85, n: 6, r: 0.22, y: 0.24, w: 0.22 },
  hadid: { hex: 2236962, size: 0.6, wing: 1.6, beat: 20, glide: 0.35, n: 16, r: 0.17, y: 0.26, w: 0.65 }
};
var AS_KOI = [15233066, 15921128, 14240555, 15315516, 15921128];
var _lifeM = new THREE6.Matrix4(), _lifeQ = new THREE6.Quaternion(), _lifeE = new THREE6.Euler(), _lifeS = new THREE6.Vector3(), _lifeP = new THREE6.Vector3();
function asLifeMat(m, time, shaderLine, extra = {}) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.asTime = time;
    Object.assign(sh.uniforms, extra);
    sh.vertexShader = "attribute float aPhase;\nuniform float asTime;\n" + Object.keys(extra).map((k) => `uniform float ${k};\n`).join("") + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + shaderLine);
  };
  m.customProgramCacheKey = () => shaderLine;
  return m;
}
var AsLife = class {
  constructor(world) {
    this.w = world;
    const time = world.mats.time, island = world.island;
    const inst = (geo, mat, n) => {
      const ph = new Float32Array(n);
      for (let i = 0; i < n; i++) ph[i] = i * 2.399;
      geo.setAttribute("aPhase", new THREE6.InstancedBufferAttribute(ph, 1));
      const m = new THREE6.InstancedMesh(geo, mat, n);
      m.frustumCulled = false;
      m.userData.noCollider = m.userData.noHighlight = true;
      island.add(m);
      return m;
    };
    const geo = (pts) => {
      const g = new THREE6.BufferGeometry().setAttribute("position", new THREE6.Float32BufferAttribute(pts, 3));
      g.computeVertexNormals();
      return g;
    };
    // birds: body, tail and two wings; the wing tips beat (|x| is the distance out along the wing), with
    // glides between bursts of flapping
    const bird = geo([
      0, 3e-4, 4.5e-3, 1e-3, 0, -1e-3, -1e-3, 0, -1e-3,
      0, 0, -1e-3, 1.4e-3, 0, -4.6e-3, -1.4e-3, 0, -4.6e-3,
      0, 0, 2e-3, -7.5e-3, 0, -6e-4, 0, 0, -1.5e-3,
      0, 0, 2e-3, 0, 0, -1.5e-3, 7.5e-3, 0, -6e-4
    ]);
    this.birdU = { uBeat: { value: 13 }, uGlide: { value: 0.5 }, uWing: { value: 1 } };
    this.birds = inst(bird, asLifeMat(new THREE6.MeshBasicMaterial({ color: 2829104, side: THREE6.DoubleSide }), time,
      "transformed.x *= uWing;\n  float fl = smoothstep(-0.3 + uGlide, 0.3 + uGlide, sin(asTime * 0.8 + aPhase * 1.7));\n  transformed.y += abs(transformed.x) * (sin(asTime * uBeat + aPhase) * 0.75 * fl + 0.12);", this.birdU), 16);
    this.bird = AS_BIRDS.default;
    this.flock = Array.from({ length: 16 }, (_, i) => ({ da: (asHash(i, 1) - 0.5) * 0.7, dr: (asHash(i, 2) - 0.5) * 0.05, dy: (asHash(i, 3) - 0.5) * 0.04, ph: asHash(i, 4) * 6.28 }));
    // leaves: a small bent quad that spins as it flutters down
    const leaf = geo([-1.1e-3, 0, -7e-4, 1.1e-3, 0, -7e-4, 1.1e-3, 3e-4, 7e-4, -1.1e-3, 0, -7e-4, 1.1e-3, 3e-4, 7e-4, -1.1e-3, 0, 7e-4]);
    this.leafMesh = inst(leaf, new THREE6.MeshStandardMaterial({ side: THREE6.DoubleSide, roughness: 0.8 }), 30);
    this.leaves = Array.from({ length: 30 }, (_, i) => ({ life: -asHash(i, 9) * 8, p: new THREE6.Vector3(), rot: new THREE6.Euler(), spin: new THREE6.Vector3(), ph: asHash(i, 5) * 6.28 }));
    // koi: a slim body and a tail fin that sweeps more the further back it is
    const fish = geo([
      0, 0, 3.2e-3, 1e-3, 0, 1e-3, -1e-3, 0, 1e-3,
      1e-3, 0, 1e-3, 7e-4, 0, -2e-3, -1e-3, 0, 1e-3,
      -1e-3, 0, 1e-3, 7e-4, 0, -2e-3, -7e-4, 0, -2e-3,
      7e-4, 0, -2e-3, 0, 0, -2.8e-3, -7e-4, 0, -2e-3,
      0, 0, -2.6e-3, 1.3e-3, 0, -4.4e-3, -1.3e-3, 0, -4.4e-3
    ]);
    this.fishMesh = inst(fish, asLifeMat(new THREE6.MeshStandardMaterial({ roughness: 0.45, side: THREE6.DoubleSide }), time,
      "transformed.x += sin(asTime * 7.0 + aPhase - transformed.z * 700.0) * max(0.0, 1.5e-3 - transformed.z) * 0.35;"), 7);
    this.fish = Array.from({ length: 7 }, (_, i) => ({ cell: -1, to: -1, x: 0, z: 0, yaw: 0, sp: 0.009 + asHash(i, 7) * 0.006 }));
    const c = new THREE6.Color();
    for (let i = 0; i < 7; i++) this.fishMesh.setColorAt(i, c.setHex(AS_KOI[i % AS_KOI.length]));
    this.t = 0;
  }
  setStyle(style) {
    const B = this.bird = { ...AS_BIRDS.default, ...AS_BIRDS[style.id] };
    this.birds.material.color.setHex(B.hex);
    this.birds.count = B.n;
    this.birdU.uBeat.value = B.beat;
    this.birdU.uGlide.value = B.glide;
    this.birdU.uWing.value = B.wing;
    this.water = !!style.ground.water;
    this.fishMesh.visible = this.water;
    for (const f of this.fish) f.cell = -1;
    const pal = AS_LEAVES[style.id] || AS_LEAVES.default, c = new THREE6.Color();
    for (let i = 0; i < this.leaves.length; i++) this.leafMesh.setColorAt(i, c.setHex(pal[i % pal.length]));
    this.leafMesh.instanceColor.needsUpdate = true;
  }
  _open(i) {
    const h = this.w.h;
    return h[i] === 0;
  }
  update(dt) {
    const t = this.t += dt, W = this.w, grid = W.grid, h = W.h;
    // the flock wheels around a centre that wanders over the island, rising and falling together
    const B = this.bird, cx = Math.sin(t * 0.07) * 0.05, cz = Math.cos(t * 0.05) * 0.05, A = t * B.w;
    this.flock.forEach((b, i) => {
      if (i >= B.n) return;
      const a = A + b.da * Math.min(1, B.n / 6), r = B.r + b.dr + Math.sin(t * 0.2 + b.ph) * 0.02;
      const y = B.y + b.dy + Math.sin(t * 0.5 + b.ph) * 0.012;
      _lifeP.set(cx + Math.sin(a) * r, y, cz + Math.cos(a) * r);
      // heading along the circle (counter-clockwise from above), banked into the turn
      _lifeQ.setFromEuler(_lifeE.set(0, a + Math.PI / 2, -0.35, "YXZ"));
      this.birds.setMatrixAt(i, _lifeM.compose(_lifeP, _lifeQ, _lifeS.setScalar(B.size)));
    });
    this.birds.instanceMatrix.needsUpdate = true;
    // leaves let go from open ground (where the trees are), drift downwind and settle, then fade
    const trees = this._trees ||= [];
    if (!(t < this._treesT + 2)) {
      this._treesT = t;
      trees.length = 0;
      for (const cell of grid.cells) if (!h[cell.i] && cell.nb.every((n) => n < 0 || !h[n])) trees.push(cell);
    }
    const floor = this.water ? -3.5e-3 : 3e-4, gust = 0.5 + 0.5 * Math.sin(t * 0.45);
    this.leaves.forEach((L, i) => {
      L.life += dt;
      if (L.life > 0 && L.p.y === 0 && L.state !== "fall") {
        if (!trees.length) return this.leafMesh.setMatrixAt(i, _lifeM.makeScale(0, 0, 0));
        const cell = trees[Math.floor(asHash(i, Math.floor(t * 10)) * trees.length)];
        L.p.set(cell.c.x + (Math.random() - 0.5) * 0.01, 0.022 + Math.random() * 0.016, cell.c.y + (Math.random() - 0.5) * 0.01);
        L.spin.set(Math.random() * 3, Math.random() * 4, Math.random() * 3);
        L.state = "fall";
      }
      let s = 0;
      if (L.state === "fall") {
        L.p.x += (0.004 + gust * 0.006 + Math.sin(t * 2.6 + L.ph) * 0.004) * dt;
        L.p.z += (0.002 + Math.cos(t * 2.1 + L.ph) * 0.004) * dt;
        L.p.y -= (0.0045 + Math.sin(t * 3.3 + L.ph) * 0.002) * dt;
        L.rot.x += L.spin.x * dt;
        L.rot.y += L.spin.y * dt;
        L.rot.z += L.spin.z * dt;
        s = 1;
        if (L.p.y <= floor || L.p.length() > AS_R) {
          L.p.y = Math.max(L.p.y, floor);
          L.state = "rest";
          L.rest = 0;
          L.rot.x = L.rot.z = 0;
        }
      } else if (L.state === "rest") {
        L.rest += dt;
        // a leaf on the water drifts on a little
        if (this.water) L.p.x += 0.002 * dt;
        s = Math.max(0, 1 - Math.max(0, L.rest - 2.5) / 1.5);
        if (L.rest > 4) {
          L.state = null;
          L.p.y = 0;
          L.life = -1 - asHash(i, Math.floor(t)) * 5;
        }
      }
      this.leafMesh.setMatrixAt(i, _lifeM.compose(L.p, _lifeQ.setFromEuler(L.rot), _lifeS.setScalar(s * 1.4)));
    });
    this.leafMesh.instanceMatrix.needsUpdate = true;
    if (!this.water) return;
    // koi wander from open cell to open cell, steering smoothly, so they keep to the water between buildings
    const cells = grid.cells;
    this.fish.forEach((f, i) => {
      if (f.cell < 0 || h[f.cell] || h[f.to]) {
        const open = cells.filter((c) => !h[c.i]);
        if (!open.length) return this.fishMesh.setMatrixAt(i, _lifeM.makeScale(0, 0, 0));
        const c = open[Math.floor(Math.random() * open.length)];
        f.cell = f.to = c.i;
        f.x = c.c.x;
        f.z = c.c.y;
        f.yaw = Math.random() * 6.28;
      }
      const tc = cells[f.to].c, dx = tc.x - f.x, dz = tc.y - f.z;
      if (dx * dx + dz * dz < 2e-5) {
        f.cell = f.to;
        const nb = cells[f.cell].nb.filter((n) => n >= 0 && !h[n]);
        f.to = nb.length ? nb[Math.floor(Math.random() * nb.length)] : f.cell;
      }
      let d = Math.atan2(dx, dz) - f.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      f.yaw += THREE6.MathUtils.clamp(d, -2.4 * dt, 2.4 * dt);
      const sp = f.sp * (0.75 + 0.25 * Math.sin(t * 1.3 + i));
      f.x += Math.sin(f.yaw) * sp * dt;
      f.z += Math.cos(f.yaw) * sp * dt;
      this.fishMesh.setMatrixAt(i, _lifeM.compose(_lifeP.set(f.x, -3.4e-3, f.z), _lifeQ.setFromEuler(_lifeE.set(0, f.yaw, 0)), _lifeS.setScalar(1.6)));
    });
    this.fishMesh.instanceMatrix.needsUpdate = true;
  }
};
