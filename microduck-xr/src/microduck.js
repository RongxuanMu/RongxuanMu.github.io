// src/worlds/microduck.js
// Microduck XR - the real Pollen Robotics Microduck walking policies, running in the browser and
// controlled with hands, controllers or a mouse through the VibeXR interaction framework.
//
// Physics: MuJoCo WASM (@mujoco/mujoco) stepping the same MJCF the policies were trained on
// (pollen-robotics/microduck_rl, as shipped by the microduck-simulator Space). Control: the exported
// ONNX checkpoints run with onnxruntime-web at 50 Hz (timestep 0.005 s, decimation 4), exactly the loop
// of microduck_rl/scripts/infer_policy.py:
//   obs (61) = [gyro(3), projected gravity(3), joint pos - default(14), joint vel(14), last action(14),
//               command(13) = twist(3) + head pose(4) + body pose(6)]
//   ctrl     = DEFAULT_POSE + action (action scale 1)
// Assets (MJCF, kinematics, visual GLB, policies) load at runtime from the Space at a pinned revision.
//
// Interaction (every piece is a framework Interactable, so ray / pinch / poke / mouse all work):
//   duck      : grab (pinch / trigger / ray) to pick it up - a MuJoCo-viewer spring pulls the trunk
//               toward the grab point, the policy keeps fighting for balance, the stand policy gets it
//               back up after a fall. Tap = quack, long-press = sit / stand.
//   floor     : point + pinch anywhere on the stage = walk there; hold and sweep to steer the goal.
//   goal flag : drag it around, the duck follows.
//   ball      : grab it, throw it, ask for a kick.
//   stage bar : move the stage, two hands to rotate (yaw) and scale it.
//   console   : buttons (poke / pinch / ray), speed slider, a drive joystick; controller thumbsticks
//               and WASD also drive.
import * as THREE6 from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeVertices as mdMergeVertices, mergeGeometries as mdMergeGeometries, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
var MD_URL = {
  // pinned Space revision: the policies were trained against exactly this MJCF
  space: "https://huggingface.co/spaces/pollen-robotics/microduck-simulator/resolve/023172c8a7d629b5258d90364c13bafe013abbfa/app/public",
  mujoco: "https://cdn.jsdelivr.net/npm/@mujoco/mujoco@3.11.0/mujoco.js",
  ort: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.wasm.min.mjs",
  ortDir: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/",
  meshopt: "https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_simplifier.module.js"
};
var MD_POLICIES = {
  walk: "BEST_alpha_walking.onnx",
  stand: "BEST_alpha_stand.onnx",
  // get-up policy for the automatic fall recovery
  sitstand: "BEST_alpha_sitstand.onnx",
  roll: "roulade.onnx",
  kickL: "ball_kick_left.onnx",
  kickR: "ball_kick_right.onnx",
  groundpick: "alpha_ground_pick.onnx",
  // roller-skate variant (lazy): velocity-tracking skating + the crouch-glide one-shot
  drive: "BEST_roller.onnx",
  crouch: "BEST_roller_crouch.onnx"
};
var MD_JOINTS = [
  "left_hip_yaw", "left_hip_roll", "left_hip_pitch", "left_knee", "left_ankle",
  "neck_pitch", "head_pitch", "head_yaw", "head_roll",
  "right_hip_yaw", "right_hip_roll", "right_hip_pitch", "right_knee", "right_ankle"
];
var MD_DEFAULT = new Float32Array([
  0, -0.08726646259971647, -0.457924, -494e-5, 0.452984,
  0.3490658503988659, 0.3490658503988659, 0, 0,
  0, 0.08726646259971647, 0.457924, 494e-5, -0.452984
]);
var MD_NJ = 14, MD_OBS = 61, MD_CMD = 13;
var MD_TIMESTEP = 5e-3, MD_DECIMATION = 4, MD_CTRL_DT = MD_TIMESTEP * MD_DECIMATION;
var MD_STAGE_R = 1;
// m (sim units): how far the duck may roam with the boundary off
var MD_FREE_R = 4;
// m (sim units): radius of the play disc, a low curb keeps the ball in
var MD_CURB_H = 0.025;
var MD_BALL_R = 0.05;
var MD_BALL_PARK = [50, 0, MD_BALL_R];
var MD_GRAB_K = 100, MD_GRAB_D = Math.sqrt(MD_GRAB_K), MD_GRAB_MAX_ACC = 200;
// MuJoCo viewer perturbation gains
var MD_TABLE_BELOW_HEAD = 0.5;
// skating brake strength and how early (s at the current speed) to start braking for a goal
// (14 goal trips each: -0.3 / 0.5 s fell 5 times, -0.22 / 0.8 s and -0.15 / 1.2 s twice, -0.1 / 1.8 s never,
// stopping a median 0.42 m from the goal)
var MD_SKATE = { brake: -0.1, lead: 1.8 };
var MD_WRAP = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// The four official colourways (linear RGB material specs, from the Space's variants.js). Every mesh fills a
// semantic slot; a colourway fills the slots. The chips use the press-kit shell colours, like the official picker.
var MD_SLOT = {
  "top_head_shell.stl": "headDome", "bottom_head_shell.stl": "trim", "face_part.stl": "facePlate",
  "noenoeil.stl": "eyeRing", "lens.stl": "lens", "m12_lens_holder.stl": "mechDark",
  "soft_mouth_top.stl": "beakUpper", "jaw.stl": "beakLower", "jaw_soft.stl": "tongue",
  "trunk_base.stl": "bodyShell", "left_shell.stl": "sideShells", "right_shell.stl": "sideShells",
  "upper_leg_left.stl": "legShells", "upper_leg_right.stl": "legShells", "hip_l.stl": "hips",
  "foot_left.stl": "feet", "foot_right.stl": "feet", "ankle_left.stl": "feet", "ankle_right.stl": "feet",
  "sole_left.stl": "soles", "sole_right.stl": "soles",
  // roller skates: blade + ankle bracket take the shoe colour, rims the sole accent, tyres rubber-dark
  "roller_blade.stl": "feet", "ankle_l_v1.stl": "feet", "ankle_r_v1.stl": "feet", "rim.stl": "soles", "tire.stl": "mechDark",
  "xl330.stl": "mechDark", "leg.stl": "mechGray", "seeed_bearing__configuration_default.stl": "mechDark",
  "yaw2roll.stl": "mechDark", "bearing_roll.stl": "mechDark", "neck.stl": "mechGray", "np_f970.stl": "mechDark",
  "pcb__raspberry_pi_zero_2_w.stl": "mechDark", "elec_rpi_robot_hat_pcb.stl": "mechDark", "banana_pcb_locker.stl": "mechDark",
  "speaker.stl": "mechDark", "upper_leg_rigidity_plate.stl": "mechGray", "yaw_roll_motion.stl": "mechGray",
  "neck_pitch.stl": "mechGray", "motor_support.stl": "mechGray", "power_support.stl": "mechGray",
  "seeed_bearing__configuration__22x16x4.stl": "mechGray"
};
var MD_VARIANTS = (() => {
  const s = (color, roughness = 0.45, metalness = 0) => ({ color, roughness, metalness });
  const AMBER_YELLOW = s([1, 0.413, 7e-3], 0.4), ORANGE = s([1, 0.144, 8e-3]), YELLOW = s([1, 0.608, 0.021], 0.4);
  const CREAM = s([0.888, 0.86, 0.798], 0.35), WARM_GRAY = s([0.328, 0.312, 0.283], 0.35);
  const DARK = s([0.012, 0.012, 0.014], 0.55, 0.3), GRAY = s([0.256, 0.256, 0.279], 0.5, 0.35), LENS = s([0.01, 0.012, 0.02], 0.05);
  const CHARCOAL = s([0.028, 0.028, 0.033], 0.5), CHARCOAL_BODY = s([0.017, 0.017, 0.019], 0.5);
  const PURPLE_RING = s([0.443, 0.308, 0.663], 0.4), PURPLE_SOLE = s([0.221, 0.134, 0.465]), SOFT_PURPLE = s([0.36, 0.23, 0.48]);
  const LAVENDER = s([0.462, 0.367, 0.688], 0.35), PALE_BLUE = s([0.441, 0.613, 0.723], 0.35);
  const common = { lens: LENS, hips: GRAY, mechDark: DARK, mechGray: GRAY, facePlate: WARM_GRAY };
  const warm = { trim: ORANGE, beakUpper: AMBER_YELLOW, beakLower: ORANGE, tongue: AMBER_YELLOW, eyeRing: AMBER_YELLOW, feet: ORANGE, soles: YELLOW };
  const cool = { trim: YELLOW, beakUpper: SOFT_PURPLE, beakLower: YELLOW, tongue: SOFT_PURPLE, feet: YELLOW, soles: PURPLE_SOLE };
  const shells = (c) => ({ headDome: c, bodyShell: c, sideShells: c, legShells: c });
  return {
    classic: { label: "Cream", chip: 16246475, ...common, ...warm, ...shells(CREAM) },
    charcoal: { label: "Graphite", chip: 7105128, ...common, ...cool, eyeRing: PURPLE_RING, ...shells(CHARCOAL_BODY), headDome: CHARCOAL },
    purple: { label: "Lavender", chip: 12560847, ...common, ...cool, eyeRing: PALE_BLUE, ...shells(LAVENDER) },
    blue: { label: "Sky", chip: 11131880, ...common, ...warm, ...shells(PALE_BLUE) }
  };
})();
var mdMats = /* @__PURE__ */ new Map();
function mdMaterial(variant, slot) {
  const v = MD_VARIANTS[variant] ?? MD_VARIANTS.classic, sp = v[slot] ?? v.mechGray;
  const key = sp.color.join() + sp.roughness + sp.metalness;
  if (!mdMats.has(key)) mdMats.set(key, new THREE6.MeshStandardMaterial({ color: new THREE6.Color(...sp.color), roughness: sp.roughness, metalness: sp.metalness }));
  return mdMats.get(key);
}
function mdPaint(rig, variant) {
  rig.root.traverse((o) => {
    if (o.isMesh && o.userData.slot) o.material = mdMaterial(variant, o.userData.slot);
  });
}
// - asset loading (once per page; world reloads reuse everything) -
var mdAssets = null;
function mdFetch(path, kind) {
  return fetch(`${MD_URL.space}/${path}`).then((r) => {
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return r[kind]();
  });
}
var MD_CREASE = Math.PI / 5;
// Render copy of a part: simplified to ~30 % of its triangles (meshopt, 1 % error bound; the full meshes stay for
// physics), creased normals, then re-indexed so shared corners shade once. The whole duck goes from ~200 k to
// ~60 k rendered triangles, which is what keeps a headset at full frame rate.
function mdDisplayGeometry(welded, MS) {
  let g = new THREE6.BufferGeometry();
  g.setAttribute("position", welded.attributes.position);
  const pos = welded.attributes.position.array, n = welded.attributes.position.count;
  let idx = welded.index ? new Uint32Array(welded.index.array) : Uint32Array.from({ length: n }, (_, i) => i);
  if (MS && idx.length > 600) {
    const [out] = MS.simplify(idx, pos instanceof Float32Array ? pos : new Float32Array(pos), 3, Math.floor(idx.length * 0.3 / 3) * 3, 0.01, []);
    if (out.length >= 36) idx = out;
  }
  g.setIndex(new THREE6.BufferAttribute(idx, 1));
  // toCreasedNormals hashes on a 0.01-unit grid; meshes are in metres, so work in mm and scale back
  g = g.clone();
  g.scale(1e3, 1e3, 1e3);
  const d = mdMergeVertices(toCreasedNormals(g, MD_CREASE));
  d.scale(1e-3, 1e-3, 1e-3);
  return d;
}
// MuJoCo's compiler wants binary STL in its VFS: rebuild it from the already-downloaded GLB
function mdBinaryStl(geometry) {
  const pos = geometry.attributes.position, idx = geometry.index;
  const tris = (idx ? idx.count : pos.count) / 3;
  const buf = new ArrayBuffer(84 + tris * 50), v = new DataView(buf);
  v.setUint32(80, tris, true);
  let o = 84;
  const P = (i) => {
    const j = idx ? idx.getX(i) : i;
    return [pos.getX(j), pos.getY(j), pos.getZ(j)];
  };
  for (let t = 0; t < tris; t++) {
    const a = P(3 * t), b = P(3 * t + 1), c = P(3 * t + 2);
    const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
    const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const f of [nx / l, ny / l, nz / l, ...a, ...b, ...c]) {
      v.setFloat32(o, f, true);
      o += 4;
    }
    v.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}
// robot_allcollisions.xml (what infer_policy.py's scene includes) minus the visual geoms, plus floor, a low
// curb around the stage, a kickable ball and the STAND keyframe
function mdBuildXml(src) {
  const doc = new DOMParser().parseFromString(src, "text/xml");
  for (const g of [...doc.querySelectorAll('geom[class="visual"]')]) g.remove();
  const used = new Set([...doc.querySelectorAll("geom[mesh]")].map((g) => g.getAttribute("mesh")));
  for (const m of [...doc.querySelectorAll("asset > mesh")]) {
    const name = m.getAttribute("name") ?? m.getAttribute("file").replace(/\.stl$/i, "");
    if (!used.has(name)) m.remove();
  }
  const el = (tag, attrs) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const root = doc.documentElement, wb = doc.querySelector("worldbody");
  root.appendChild(el("option", { timestep: String(MD_TIMESTEP) }));
  wb.appendChild(el("geom", { name: "floor", type: "plane", size: "0 0 0.05" }));
  const N = 36, t = 0.02, rr = MD_STAGE_R + t, half = Math.PI * rr / N * 1.08;
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2;
    wb.appendChild(el("geom", {
      name: `curb${k}`, type: "box", size: `${t} ${half} ${MD_CURB_H / 2}`,
      pos: `${Math.cos(a) * rr} ${Math.sin(a) * rr} ${MD_CURB_H / 2}`, euler: `0 0 ${a}`
    }));
  }
  const ball = el("body", { name: "ball", pos: MD_BALL_PARK.join(" ") });
  ball.appendChild(el("freejoint", { name: "ball_freejoint" }));
  ball.appendChild(el("geom", {
    name: "ball_geom", type: "sphere", size: String(MD_BALL_R),
    mass: "0.03", friction: "0.4 0.01 0.003", solref: "0.03 0.4", condim: "6"
  }));
  wb.appendChild(ball);
  const byName = new Map(MD_JOINTS.map((n, i) => [n, MD_DEFAULT[i]]));
  const joints = [...doc.querySelectorAll("body > joint")].map((j) => byName.get(j.getAttribute("name")) ?? 0).join(" ");
  const kf = doc.createElement("keyframe");
  kf.appendChild(el("key", { name: "STAND", qpos: `0 0 0.12 1 0 0 0 ${joints} ${MD_BALL_PARK.join(" ")} 1 0 0 0`, ctrl: Array.from(MD_DEFAULT).join(" ") }));
  root.appendChild(kf);
  const meshFiles = [...doc.querySelectorAll("asset > mesh")].map((m) => m.getAttribute("file"));
  return { xml: new XMLSerializer().serializeToString(doc), meshFiles };
}
function mdLoadAssets(status) {
  if (mdAssets) return mdAssets;
  mdAssets = (async () => {
    status("Loading MuJoCo, ONNX Runtime and the Microduck model…");
    const [mujoco, ort, gltf, kin, xmlSrc, MS] = await Promise.all([
      import(MD_URL.mujoco).then((m) => m.default()),
      import(MD_URL.ort),
      new GLTFLoader().loadAsync(`${MD_URL.space}/robot/mjlab/microduck.glb`),
      mdFetch("robot/mjlab/kinematics.json", "json"),
      mdFetch("robot/mjlab/robot_allcollisions.xml", "text"),
      // mesh simplifier for the render copies; without it the full meshes are drawn
      import(MD_URL.meshopt).then((m) => m.MeshoptSimplifier.ready.then(() => m.MeshoptSimplifier)).catch(() => null)
    ]);
    ort.env.wasm.wasmPaths = MD_URL.ortDir;
    ort.env.wasm.numThreads = 1;
    // no COOP / COEP on static hosts
    const geoms = /* @__PURE__ */ new Map();
    gltf.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const name = o.userData.meshFile || o.name || o.geometry.name;
      if (!name || geoms.has(name)) return;
      const entry = { welded: o.geometry, display: mdDisplayGeometry(o.geometry, MS) };
      geoms.set(name, entry);
      if (o.name && o.name !== name) geoms.set(o.name, entry);
    });
    // meshes missing from the GLB (none for the legged duck today) fall back to the Space's STL files
    const stl = new STLLoader();
    const mesh = async (name) => {
      if (geoms.has(name)) return geoms.get(name);
      const raw = await stl.loadAsync(`${MD_URL.space}/robot/mjlab/meshes/${name}`);
      raw.deleteAttribute("normal");
      const welded = mdMergeVertices(raw, 1e-4);
      const entry = { welded, display: mdDisplayGeometry(welded, MS) };
      geoms.set(name, entry);
      return entry;
    };
    status("Compiling physics…");
    const { xml, meshFiles } = mdBuildXml(xmlSrc);
    // one VFS for both variants; the rollers only add their wheel / blade meshes
    const vfs = new mujoco.MjVFS(), vfsFiles = /* @__PURE__ */ new Set();
    const addMeshes = async (files) => {
      for (const f of files) {
        if (vfsFiles.has(f)) continue;
        vfsFiles.add(f);
        vfs.addBuffer(`assets/${f}`, mdBinaryStl((await mesh(f)).welded));
      }
    };
    await addMeshes(meshFiles);
    const model = mujoco.MjModel.from_xml_string(xml, vfs);
    status("Loading walking policies…");
    const opts = { executionProviders: ["wasm"] };
    const load = (k) => ort.InferenceSession.create(`${MD_URL.space}/policies/${MD_POLICIES[k]}`, opts).then((s) => sessions[k] = s);
    const sessions = {};
    await Promise.all([load("walk"), load("stand")]);
    // the one-shot tricks stream in behind the walker
    const extras = Promise.allSettled(["sitstand", "roll", "kickL", "kickR", "groundpick"].map(load));
    return { mujoco, ort, mesh, sessions, extras, load, addMeshes, vfs, legs: { model, kin } };
  })();
  mdAssets.catch(() => mdAssets = null);
  return mdAssets;
}
// roller-skate Microduck: its own MJCF (same 14 actuators and 61-value observation, plus four passive wheels),
// kinematics and two policies - fetched the first time someone switches to it, then kept
function mdLoadRollers(A, status) {
  if (A.rollers) return A.rollers;
  A.rollers = (async () => {
    status("Loading the roller skates\u2026");
    const [xmlSrc, kin] = await Promise.all([
      mdFetch("robot/mjlab/robot_allcollisions_rollers.xml", "text"),
      mdFetch("robot/mjlab/kinematics_rollers.json", "json")
    ]);
    const { xml, meshFiles } = mdBuildXml(xmlSrc);
    await Promise.all([A.addMeshes(meshFiles), A.load("drive"), A.load("crouch")]);
    return { model: A.mujoco.MjModel.from_xml_string(xml, A.vfs), kin };
  })();
  A.rollers.catch(() => A.rollers = null);
  return A.rollers;
}
// - render rig: one Group per MJCF body, hinge joints as local rotations (port of the Space's duck.js) -
async function mdBuildRig(A, parent) {
  const T = THREE6, bodies = /* @__PURE__ */ new Map(), joints = /* @__PURE__ */ new Map();
  for (const b of A.kin.bodies) {
    const g = new T.Group();
    g.name = b.name;
    g.position.fromArray(b.pos);
    g.quaternion.set(b.quat[1], b.quat[2], b.quat[3], b.quat[0]);
    bodies.set(b.name, g);
  }
  for (const b of A.kin.bodies) (b.parent && bodies.has(b.parent) ? bodies.get(b.parent) : parent).add(bodies.get(b.name));
  for (const b of A.kin.bodies) {
    if (!b.joint || b.joint.type && b.joint.type !== "hinge") continue;
    const g = bodies.get(b.name);
    joints.set(b.joint.name, { body: g, axis: new T.Vector3(...b.joint.axis).normalize(), base: g.quaternion.clone(), range: b.joint.range ?? null });
  }
  // Parts of one body that share a colour slot are merged into one mesh (70 -> ~30 draws); the slot, not the
  // material, is the key so any colourway can repaint them. The jaw parts stay separate: they hinge.
  const seen = /* @__PURE__ */ new Set(), jaw = [], parts = /* @__PURE__ */ new Map();
  const pending = [];
  for (const b of A.kin.bodies) {
    for (const geom of b.geoms) {
      if (geom.type && geom.type !== "mesh" || !geom.mesh) continue;
      // the MJCF repeats a few geoms as visual + collision copies: drawing both would only z-fight
      const key = `${b.name}|${geom.mesh}|${geom.pos}|${geom.quat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pending.push(A.mesh(geom.mesh).then(({ display }) => {
        const slot = MD_SLOT[geom.mesh] ?? "mechGray";
        const m = new T.Matrix4().compose(
          new T.Vector3().fromArray(geom.pos ?? [0, 0, 0]),
          geom.quat ? new T.Quaternion(geom.quat[1], geom.quat[2], geom.quat[3], geom.quat[0]) : new T.Quaternion(),
          new T.Vector3(1, 1, 1)
        );
        if (geom.mesh === "jaw.stl" || geom.mesh === "jaw_soft.stl") {
          const mesh = new T.Mesh(display, mdMaterial(A.variant, slot));
          mesh.userData = { meshName: geom.mesh, slot };
          m.decompose(mesh.position, mesh.quaternion, mesh.scale);
          bodies.get(b.name).add(mesh);
          jaw.push(mesh);
          return;
        }
        const k = `${b.name}|${slot}`;
        if (!parts.has(k)) parts.set(k, { body: b.name, slot, items: [] });
        parts.get(k).items.push({ display, m });
      }));
    }
  }
  await Promise.all(pending);
  for (const { body, slot, items } of parts.values()) {
    const geo = items.length === 1 ? items[0].display.clone().applyMatrix4(items[0].m) : mdMergeGeometries(items.map((it) => it.display.clone().applyMatrix4(it.m)));
    const mesh = new T.Mesh(geo, mdMaterial(A.variant, slot));
    mesh.name = `${body}:${slot}`;
    mesh.userData.slot = slot;
    bodies.get(body).add(mesh);
  }
  // jaw hinge: the model has no jaw joint, the quack re-creates it about the fitted axle of jaw.stl
  let jawPivot = null;
  if (jaw.length) {
    parent.updateWorldMatrix(true, true);
    const body = jaw[0].parent, jm = jaw.find((m) => m.userData.meshName === "jaw.stl") ?? jaw[0];
    const hingeW = jm.localToWorld(new T.Vector3(0, 4e-5, 75e-4));
    // robot left-right = MJCF +Y; +angle about it swings the beak tip down
    const axisW = new T.Vector3(0, 1, 0).transformDirection(parent.matrixWorld);
    const hingeL = body.worldToLocal(hingeW.clone());
    const axisL = axisW.applyQuaternion(body.getWorldQuaternion(new T.Quaternion()).invert()).normalize();
    jawPivot = new T.Group();
    jawPivot.position.copy(hingeL);
    jawPivot.userData.axis = axisL;
    body.add(jawPivot);
    for (const m of jaw) {
      m.position.sub(hingeL);
      jawPivot.add(m);
    }
  }
  return { root: parent, bodies, joints, jawPivot, trunk: bodies.get("trunk_base") };
}
// one command, several on-screen copies (floating panel + hand menu page): state writes go to all of them
function mdMulti() {
  const list = [];
  return {
    list,
    add(b) {
      list.push(b);
    },
    get value() {
      return list[0]?.value;
    },
    get label() {
      return list[0]?.label;
    },
    setValue(v) {
      for (const b of list) b.setValue(v);
    },
    setLabel(l) {
      for (const b of list) b.setLabel(l);
    },
    _click() {
      list[0]?._click();
    }
  };
}
var _mdq = new THREE6.Quaternion();
function mdSetJoint(rig, name, a) {
  const j = rig.joints.get(name);
  if (!j) return;
  if (j.range) a = Math.min(j.range[1], Math.max(j.range[0], a));
  j.body.quaternion.copy(j.base).multiply(_mdq.setFromAxisAngle(j.axis, a));
}
// fat white rims, same pipeline as the framework's desk
function mdLines(points, { px = 3, opacity = 0.9, color = 16777215 } = {}) {
  const lg = new LineSegmentsGeometry().setPositions(points);
  const lm = new LineMaterial({ color, linewidth: px, transparent: opacity < 1, opacity, worldUnits: false });
  const l = new LineSegments2(lg, lm);
  l.userData.noCollider = l.userData.noHighlight = true;
  l.onBeforeRender = (renderer, scene, camera) => {
    const vp = camera.viewport;
    if (vp) lm.resolution.set(vp.z, vp.w);
    else renderer.getSize(lm.resolution);
  };
  return l;
}
function mdCircle(r, z, n = 96) {
  const p = [];
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
    p.push(Math.cos(a0) * r, Math.sin(a0) * r, z, Math.cos(a1) * r, Math.sin(a1) * r, z);
  }
  return p;
}
// Robot voice + mechanics, all synthesized (WebAudio, no samples), WALL-E flavoured: vibrato chirps for
// emotions, servo whirs and metal ticks for the body. Everything is spatialized at the duck (HRTF panner,
// listener on your head). Silent until the page has had a user gesture (browser autoplay rules).
var MdSound = class {
  constructor(sfx) {
    this.sfx = sfx;
    this.on = true;
    this.out = null;
  }
  setOn(v) {
    this.on = v;
    if (!v && this.hum) this.hum.gain.value = 0;
  }
  _ctx() {
    const c = this.sfx.ensure();
    if (!c || c.state !== "running" || !this.on) return null;
    if (!this.out) {
      this.panner = c.createPanner();
      Object.assign(this.panner, { panningModel: "HRTF", distanceModel: "inverse", refDistance: 0.7, rolloffFactor: 0.8 });
      this.out = c.createGain();
      this.out.gain.value = 0.85;
      this.out.connect(this.panner).connect(c.destination);
      // servo whine: detuned saw + square through a resonant band; level and pitch follow joint speed
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1300;
      bp.Q.value = 2.5;
      this.hum = c.createGain();
      this.hum.gain.value = 0;
      this.humOsc = ["sawtooth", "square"].map((type, i) => {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = 170 + i * 4;
        o.connect(bp);
        o.start();
        return o;
      });
      bp.connect(this.hum).connect(this.out);
    }
    return c;
  }
  stop() {
    for (const o of this.humOsc ?? []) o.stop();
    this.rumble?.src.stop();
    this.rumble = null;
    this.panner?.disconnect();
    this.humOsc = null;
    this.out = null;
  }
  // p = duck, h = listener position, q = listener orientation
  update(p, h, q, servo, roll = 0) {
    const c = this._ctx();
    if (!c || ![p.x, p.y, p.z, h.x, h.y, h.z, q.x, q.w, servo, roll].every(Number.isFinite)) return;
    // positions are written as plain values (per-frame setTargetAtTime piles automation events onto the audio
    // thread); the hum / rumble levels only get a new ramp when they actually change
    const t = c.currentTime, L = c.listener, f = _mdS1.set(0, 0, -1).applyQuaternion(q), u = _mdS2.set(0, 1, 0).applyQuaternion(q);
    const set = (param, v) => param.value = v;
    if (this.panner.positionX) [this.panner.positionX, this.panner.positionY, this.panner.positionZ].forEach((a, i) => set(a, p.getComponent(i)));
    else this.panner.setPosition(p.x, p.y, p.z);
    if (L.positionX) {
      [L.positionX, L.positionY, L.positionZ].forEach((a, i) => set(a, h.getComponent(i)));
      [L.forwardX, L.forwardY, L.forwardZ, L.upX, L.upY, L.upZ].forEach((a, i) => set(a, i < 3 ? f.getComponent(i) : u.getComponent(i - 3)));
    } else {
      L.setPosition(h.x, h.y, h.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    if (Math.abs(servo - (this.lastServo ?? -1)) > 0.02) {
      this.lastServo = servo;
      this.hum.gain.setTargetAtTime(0.05 * servo, t, 0.06);
      this.humOsc[0].frequency.setTargetAtTime(160 + 220 * servo, t, 0.08);
      this.humOsc[1].frequency.setTargetAtTime(164 + 226 * servo, t, 0.08);
    }
    // wheels: looped noise through a low band, level and brightness follow ground speed
    if (!this.rumble && roll > 0.01 && this.sfx.noise) {
      const src = c.createBufferSource(), f = c.createBiquadFilter();
      src.buffer = this.sfx.noise;
      src.loop = true;
      f.type = "bandpass";
      f.Q.value = 0.9;
      this.rumble = { src, f, g: c.createGain() };
      this.rumble.g.gain.value = 0;
      src.connect(f).connect(this.rumble.g).connect(this.out);
      src.start();
    }
    if (this.rumble && Math.abs(roll - (this.lastRoll ?? -1)) > 0.02) {
      this.lastRoll = roll;
      this.rumble.g.gain.setTargetAtTime(0.16 * roll, t, 0.08);
      this.rumble.f.frequency.setTargetAtTime(180 + 420 * roll, t, 0.1);
    }
  }
  // one voice: oscillator gliding f0 -> f1, optional vibrato (rate Hz, depth Hz), attack / exponential decay
  _tone(type, f0, f1, dur, gain, at = 0, vib = null, filter = null) {
    const c = this._ctx();
    if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = vib[0];
      lg.gain.value = vib[1];
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    let n = o.connect(g);
    if (filter) {
      const bf = c.createBiquadFilter();
      bf.type = filter[0];
      bf.frequency.value = filter[1];
      bf.Q.value = filter[2] ?? 1;
      n = n.connect(bf);
    }
    n.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  _noise(type, freq, q, dur, gain, at = 0) {
    const c = this._ctx();
    if (!c || !this.sfx.noise) return;
    const t = c.currentTime + at, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.sfx.noise;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  // footstep: servo "zzt" + metal tick + soft pad thump, scaled by landing speed
  step(u) {
    const r = Math.random();
    this._tone("sawtooth", 300 + 60 * r, 190, 0.07, 0.035 + 0.05 * u, 0, null, ["bandpass", 1500, 3]);
    this._tone("square", 2600 + 500 * r, 2000, 0.025, 0.02 + 0.025 * u, 0.01);
    this._noise("lowpass", 380, 0.7, 0.06, 0.08 + 0.12 * u);
  }
  // roll: excited rising "wheee" with vibrato, a second higher squeal on top
  whee() {
    this._tone("sine", 420, 1500, 0.55, 0.16, 0, [11, 40]);
    this._tone("triangle", 700, 2100, 0.4, 0.07, 0.35, [14, 60]);
    this._tone("sawtooth", 200, 520, 0.6, 0.03, 0, null, ["bandpass", 1400, 3]);
  }
  // crouch-glide: servo drop, then a long gliding "wheee" that rises as it stands back up
  glide() {
    this._tone("sawtooth", 380, 140, 0.45, 0.04, 0, null, ["bandpass", 1100, 3]);
    this._tone("sine", 520, 440, 1.2, 0.1, 0.3, [6, 25]);
    this._tone("sine", 440, 1250, 0.6, 0.12, 1.5, [10, 40]);
  }
  // stuck the landing: clunk + a pleased two-note "ta-da"
  land() {
    this.clunk(0.6);
    this._tone("square", 784, 790, 0.09, 0.06, 0.12, null, ["lowpass", 2600]);
    this._tone("square", 1175, 1180, 0.16, 0.06, 0.22, [9, 18], ["lowpass", 3000]);
  }
  // kick: effort grunt "hup!" then a servo snap
  hup() {
    this._tone("sine", 360, 980, 0.14, 0.13, 0, [18, 25]);
    this._tone("sawtooth", 500, 180, 0.12, 0.05, 0.14, null, ["bandpass", 1800, 4]);
  }
  // peck: curious "boop-bip"
  peck() {
    this._tone("sine", 620, 520, 0.1, 0.1);
    this._tone("sine", 900, 1250, 0.09, 0.09, 0.14);
  }
  sit() {
    this._tone("sawtooth", 420, 150, 0.5, 0.04, 0, null, ["bandpass", 1100, 3]);
    this._tone("sine", 700, 480, 0.25, 0.08, 0.35, [7, 20]);
  }
  stand() {
    this._tone("sawtooth", 150, 430, 0.5, 0.04, 0, null, ["bandpass", 1100, 3]);
    this._tone("sine", 520, 780, 0.2, 0.08, 0.4);
  }
  // fall: worried descending "uh-oh" with wobble, then the body clunk
  uhoh() {
    this._tone("sine", 760, 640, 0.18, 0.14, 0, [10, 30]);
    this._tone("sine", 560, 330, 0.34, 0.14, 0.24, [13, 45]);
  }
  // back up: three rising beeps
  getup() {
    [660, 880, 1320].forEach((f, i) => this._tone("square", f, f * 1.01, 0.08, 0.05, i * 0.1, null, ["lowpass", 3200]));
  }
  // picked up: surprised rising wobble
  whoa() {
    this._tone("sine", 480, 1100, 0.45, 0.14, 0, [8, 70]);
    this._tone("sawtooth", 300, 600, 0.3, 0.025, 0, null, ["bandpass", 1500, 3]);
  }
  clunk(u) {
    this._noise("bandpass", 900, 1.5, 0.12, 0.15 + 0.3 * u);
    this._tone("sine", 140, 55, 0.18, 0.12 + 0.25 * u);
    this._tone("square", 3100, 2400, 0.03, 0.03 + 0.03 * u);
  }
  boing(u) {
    this._tone("sine", 260 + 120 * u, 170, 0.14, 0.08 + 0.18 * u);
    this._noise("lowpass", 700, 0.8, 0.06, 0.06 + 0.12 * u);
  }
  // quack: a nasal robot duck - saw through two formants, falling, with a little vibrato
  quack() {
    this._tone("sawtooth", 540 + Math.random() * 80, 330, 0.2, 0.3, 0, [22, 18], ["bandpass", 1150, 3]);
    this._tone("square", 1080, 700, 0.12, 0.04, 0.01, null, ["peaking", 2600, 1]);
  }
};
var _mdS1 = new THREE6.Vector3(), _mdS2 = new THREE6.Vector3();
var Microduck = {
  id: "microduck",
  skate: MD_SKATE,
  title: "Microduck",
  init(ctx) {
    const T = THREE6, { root, app } = ctx;
    this.ctx = ctx;
    this.app = app;
    this.S = null;
    this.token = {};
    this.goal = { active: false, pos: new T.Vector2(0.5, 0) };
    this.manual = new Float32Array(3);
    // joystick / thumbstick / keys, [vx, vy, wz]
    this.joy = new T.Vector2();
    this.keys = /* @__PURE__ */ new Set();
    this.follow = this.look = false;
    this.sound?.stop();
    this.sound = new MdSound(app.sfx);
    this.sound.setOn(this.soundOn ?? true);
    this.kickPlan = null;
    this.speed ??= 0.35;
    // a steady 72 Hz: if the browser targets 90 / 120 Hz and a frame runs long it halves the rate, which reads
    // as a sudden low refresh; 72 is every current headset's comfortable floor
    const xs = app.renderer.xr.getSession?.();
    if (xs?.supportedFrameRates?.includes(72) && xs.frameRate !== 72) xs.updateTargetFrameRate(72).catch(() => {});
    this.jaw = 0;
    this.tableTop = app.sessionMode ? T.MathUtils.clamp(app.input.head.y - MD_TABLE_BELOW_HEAD, 0.55, 1.6) : 1.1;
    root.add(new T.HemisphereLight(16777215, 4473924, 1.7));
    const sun = new T.DirectionalLight(16777215, 1.6);
    sun.position.set(1, 3, 2);
    root.add(sun);
    this._buildStage(ctx);
    this._buildConsole(ctx);
    this._placeStage(this.tabletop ?? false);
    this.setBoundary(this.boundary ?? true);
    // keyboard drive for the desktop preview (WASD / arrows, Q quack, R roll, F follow)
    this._onKey = (e) => {
      if (e.repeat && e.type === "keydown") return;
      const k = e.key.toLowerCase();
      if (e.type === "keyup") return void this.keys.delete(k);
      this.keys.add(k);
      if (k === "q") this.quack();
      else if (k === "r") this.trigger("roll");
      else if (k === "f") this.btn.follow._click();
      else if (k === " ") this.reset();
    };
    addEventListener("keydown", this._onKey);
    addEventListener("keyup", this._onKey);
    // landing screen: the pointer steers the idle gaze; orbiting / zooming hands the camera to the user
    this.lastPointer = -1e9;
    this._onPointer = () => this.lastPointer = performance.now();
    this._onOrbit = () => this.cam && (this.cam.sway = false);
    app.renderer.domElement.addEventListener("pointermove", this._onPointer);
    app.controls.addEventListener("start", this._onOrbit);
    this.idleGaze = new T.Vector3(0.6, 0, 0.3);
    this.idle = { quackAt: 4, peckAt: 14 };
    if (!app.renderer.xr.isPresenting) this._heroCamera();
    const token = this.token;
    mdLoadAssets((m) => this.status(m)).then((A) => token === this.token && this._startSim(A)).catch((e) => {
      console.error(e);
      if (token === this.token) this.status(`⚠ ${e.message}`);
      app.error(`Microduck: ${e.message}`);
    });
  },
  // - scene: the stage (a disc in MJCF frame), goal flag, ball, drag bar -
  _buildStage(ctx) {
    const T = THREE6, root = ctx.root;
    const stage = this.stage = new T.Group();
    stage.name = "stage";
    // yaw-first: a heading past +-90 deg must read back as rotation.y after the framework decomposes a drag
    // matrix (XYZ order would re-express it as (180, 180 - yaw, 180))
    stage.rotation.order = "YXZ";
    root.add(stage);
    // MJCF frame: Z up -> three Y up. Everything simulated lives in here, in metres.
    const sim = this.sim = new T.Group();
    sim.rotation.x = -Math.PI / 2;
    stage.add(sim);
    this.discMat = new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.85, depthWrite: false });
    const disc = this.disc = new T.Mesh(new T.CircleGeometry(MD_STAGE_R, 96), this.discMat);
    disc.name = "floor";
    disc.position.z = -1e-3;
    sim.add(disc);
    const faint = [];
    for (let r = 0.3; r < MD_STAGE_R - 0.01; r += 0.3) faint.push(...mdCircle(r, 1e-3, 72));
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      faint.push(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 1e-3, Math.cos(a) * MD_STAGE_R, Math.sin(a) * MD_STAGE_R, 1e-3);
    }
    this.gridLines = mdLines(faint, { px: 1.5, opacity: 0.35 });
    sim.add(this.gridLines);
    this.rim = mdLines([...mdCircle(MD_STAGE_R, 0), ...mdCircle(MD_STAGE_R, MD_CURB_H)], { px: 3, opacity: 0.95 });
    sim.add(this.rim);
    // the floor is a target of its own: point + pinch anywhere on it = walk there
    this.floorIt = ctx.add(disc, { highlight: false, dragThreshold: 0, box: new T.Box3(new T.Vector3(-MD_STAGE_R, -MD_STAGE_R, -2e-3), new T.Vector3(MD_STAGE_R, MD_STAGE_R, 2e-3)) });
    const toGoal = (e) => {
      const p = this._floorPoint(e);
      if (p) this.setGoal(p.x, p.y);
    };
    this.floorIt.on("press", toGoal).on("drag", toGoal);
    // blob shadow grounds the duck in passthrough
    const sc = document.createElement("canvas");
    sc.width = sc.height = 64;
    const sg = sc.getContext("2d"), grad = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    sg.fillStyle = grad;
    sg.fillRect(0, 0, 64, 64);
    this.shadow = new T.Mesh(new T.CircleGeometry(0.1, 32), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.position.z = 2e-3;
    this.shadow.userData.noCollider = true;
    sim.add(this.shadow);
    // goal flag: a ring on the floor, a pin and a ball head you can grab and drag across the stage
    const flag = this.flag = new T.Group();
    flag.name = "goal";
    const ring = new T.Mesh(new T.RingGeometry(0.035, 0.045, 48), new T.MeshBasicMaterial({ color: 16777215, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.position.z = 3e-3;
    ring.userData.noCollider = ring.userData.noHighlight = true;
    const pin = new T.Mesh(new T.CylinderGeometry(3e-3, 3e-3, 0.11, 8).rotateX(Math.PI / 2), new T.MeshBasicMaterial({ color: 16777215 }));
    pin.position.z = 0.055;
    this.flagHead = new T.Mesh(new T.SphereGeometry(0.022, 24, 16), new T.MeshStandardMaterial({ color: 16742959, roughness: 0.35 }));
    this.flagHead.position.z = 0.12;
    flag.add(ring, pin, this.flagHead);
    sim.add(flag);
    this.flagIt = ctx.add(flag, {
      draggable: true,
      translateOnly: true,
      box: new T.Box3(new T.Vector3(-0.045, -0.045, 0), new T.Vector3(0.045, 0.045, 0.145)),
      // slides on the floor, inside the curb
      constrain: ({ position }) => {
        const p = this.sim.worldToLocal(position.clone());
        p.z = 0;
        const r = Math.hypot(p.x, p.y), lim = this._lim() - 0.08;
        if (r > lim) p.multiplyScalar(lim / r);
        position.copy(this.sim.localToWorld(p));
      }
    });
    this.flagIt.on("drag", () => this.setGoal(flag.position.x, flag.position.y)).on("tap", () => this.setGoal(flag.position.x, flag.position.y));
    // ball (physics body, parked far away until "Ball")
    const bc = document.createElement("canvas");
    bc.width = 256;
    bc.height = 128;
    const bg = bc.getContext("2d");
    bg.fillStyle = "#ffffff";
    bg.fillRect(0, 0, 256, 128);
    bg.fillStyle = "#ff6a1a";
    for (let k = 0; k < 4; k++) bg.fillRect(k * 64, 0, 32, 128);
    const btex = new T.CanvasTexture(bc);
    btex.colorSpace = T.SRGBColorSpace;
    this.ball = new T.Mesh(new T.SphereGeometry(MD_BALL_R, 32, 20), new T.MeshStandardMaterial({ map: btex, roughness: 0.4 }));
    this.ball.name = "ball";
    this.ball.visible = false;
    sim.add(this.ball);
    this.ballIt = this._grabbable(ctx, this.ball, "ball");
    // drag bar on the near edge: move the stage, two hands rotate (yaw) and scale it
    const bar = new T.Mesh(new T.CapsuleGeometry(0.018, 0.34, 6, 20), new T.MeshStandardMaterial({ color: 0, roughness: 0.5 }));
    bar.position.set(MD_STAGE_R + 0.09, 0, 0.03);
    bar.name = "stage-handle";
    sim.add(bar);
    this.barOutline = outlineHull(bar, hoverOutlineMaterial());
    this.barOutline.visible = true;
    this.barOutline.material.userData.px.value = 2;
    this.barOutline.material.opacity = 0.75;
    bar.add(this.barOutline);
    const R = MD_STAGE_R + 0.09;
    // collider box around the bar, in stage space (sim -> stage swaps y / z)
    this.stageIt = ctx.add(stage, {
      draggable: true,
      translateOnly: true,
      twoHand: true,
      highlight: false,
      box: new T.Box3(new T.Vector3(R - 0.035, 0, -0.21), new T.Vector3(R + 0.035, 0.07, 0.21)),
      // slides at its placed height (floor or desk), turns about the vertical only
      constrain: ({ position, quaternion }) => {
        position.y = this.stageY ?? 0;
        const e = new T.Euler().setFromQuaternion(quaternion, "YXZ");
        quaternion.setFromEuler(e.set(0, e.y, 0, "YXZ"));
      }
    });
    this.stageIt.on("statechange", (e) => {
      this.barOutline.material.userData.px.value = e.level === 2 ? ICFG.outlinePxSelect : e.level === 1 ? ICFG.outlinePx : 2;
      this.barOutline.material.opacity = e.level ? 1 : 0.75;
    });
    // floating status line above the stage
    this.statusTex = textTexture("", { w: 1024, h: 64, size: 34 });
    this.statusMesh = new T.Mesh(new T.PlaneGeometry(0.9, 0.9 / 16), new T.MeshBasicMaterial({ map: this.statusTex, transparent: true, depthWrite: false }));
    this.statusMesh.userData.noCollider = true;
    ctx.root.add(this.statusMesh);
  },
  // grab = MuJoCo-viewer perturbation: a spring on the body's freejoint toward the grab point
  _grabbable(ctx, obj, kind, opts = {}) {
    const it = ctx.add(obj, opts);
    it.on("dragstart", (e) => this._grabStart(kind, e)).on("drag", (e) => this._grabMove(e)).on("dragend", () => this._grabEnd());
    return it;
  },
  _grabStart(kind, e) {
    const S = this.S;
    if (!S) return;
    const b = kind === "duck" ? S.trunk : S.ballBody;
    const p = this.sim.worldToLocal(e.point.clone());
    const q = S.data.qpos;
    S.grab = { ...b, offset: [q[b.qAdr] - p.x, q[b.qAdr + 1] - p.y, q[b.qAdr + 2] - p.z], target: [q[b.qAdr], q[b.qAdr + 1], q[b.qAdr + 2]] };
    if (kind === "duck") this.goal.active = false, this.sound.whoa();
  },
  _grabMove(e) {
    const g = this.S?.grab;
    if (!g) return;
    const p = this.sim.worldToLocal(e.point.clone());
    g.target = [p.x + g.offset[0], p.y + g.offset[1], Math.max(0.02, p.z + g.offset[2])];
  },
  _grabEnd() {
    const S = this.S;
    if (!S?.grab) return;
    const x = S.data.xfrc_applied, a = S.grab.bodyId * 6;
    x[a] = x[a + 1] = x[a + 2] = 0;
    S.grab = null;
  },
  _applyGrab() {
    const S = this.S, g = S.grab;
    if (!g) return;
    const q = S.data.qpos, v = S.data.qvel;
    const f = [0, 1, 2].map((k) => MD_GRAB_K * (g.target[k] - q[g.qAdr + k]) - MD_GRAB_D * v[g.dofAdr + k]);
    // hold against gravity so a lifted duck hangs at the hand instead of sagging
    f[2] += 9.81;
    const n = Math.hypot(...f);
    if (n > MD_GRAB_MAX_ACC) for (let k = 0; k < 3; k++) f[k] *= MD_GRAB_MAX_ACC / n;
    const x = S.data.xfrc_applied, a = g.bodyId * 6;
    for (let k = 0; k < 3; k++) x[a + k] = g.mass * f[k];
  },
  // - console: action buttons + speed (left), drive joystick (right) -
  _buildConsole(ctx) {
    const T = THREE6;
    // The command panel floats at the left of the stage bar and rides with the stage. In XR the same commands
    // are also the hand menu's home page (palm up / controller B), with the framework's menu as its Settings
    // page. Both copies are built from one list and stay in sync (toggles, speed, colour).
    const app = ctx.app, inMenu = this.inMenu = !!app.sessionMode;
    const specs = [
      ["sit", "Sit", { toggle: true, onClick: (v) => this.trigger(v ? "sit" : "stand") }],
      ["roll", this.loco === "rollers" ? "Crouch" : "Roll", { onClick: () => this.trigger("roll") }],
      ["peck", "Peck", { onClick: () => this.trigger("groundpick") }],
      ["kickL", "Kick L", { onClick: () => this.kick("kickL") }],
      ["kickR", "Kick R", { onClick: () => this.kick("kickR") }],
      ["ball", "Ball", { onClick: () => this.spawnBall() }],
      ["follow", "Follow me", { toggle: true, onClick: (v) => {
        this.follow = v;
        if (v) this.goal.active = false, this.kickPlan = null;
      } }],
      ["look", "Look at me", { toggle: true, onClick: (v) => this.look = v }],
      ["quack", "Quack", { onClick: () => this.quack() }],
      ["table", "Tabletop", { toggle: true, value: !!this.tabletop, onClick: (v) => {
        this._placeStage(v);
        if (!this.app.renderer.xr.isPresenting) this._heroCamera();
      } }],
      ["bound", "Boundary", { toggle: true, value: this.boundary ?? true, onClick: (v) => this.setBoundary(v) }],
      ["rollers", "Rollers", { toggle: true, value: this.loco === "rollers", onClick: (v) => this.setLoco(v ? "rollers" : "legs") }],
      ["sound", "Sound", { toggle: true, value: this.soundOn ?? true, onClick: (v) => this.sound.setOn(this.soundOn = v) }],
      ["reset", "Reset", { onClick: () => this.reset() }],
      ["settings", "Settings \u203a", { onClick: () => app.menu.show("settings") }]
    ];
    this.btn = {};
    this.swatches = {};
    this.speedSliders = [];
    const makePanel = (title, withSettings) => {
      const panel = ctx.panel(title, { w: 0.26, h: 0.29 });
      const items = [];
      for (const [key, label, o] of specs) {
        if (key === "settings" && !withSettings) continue;
        const b = ctx.button(label, { w: 0.078, h: 0.026, fontSize: 26, ...o, onClick: (v, e) => {
          if (o.toggle) this.btn[key].setValue(v);
          o.onClick(v, e);
        } });
        (this.btn[key] ??= mdMulti()).add(b);
        items.push(b);
      }
      panel.layout(items, { cols: 3, top: 0.03 });
      const y0 = panel.h / 2 - 0.03 - Math.ceil(items.length / 3) * 0.032;
      const slider = ctx.slider("Speed", { w: 0.2, value: this.speed, onChange: (v) => {
        this.speed = v;
        for (const sl of this.speedSliders) if (sl !== slider) sl.set(v, true);
      } });
      slider.root.position.set(0, y0 - 0.026, 4e-3);
      panel.root.add(slider.root);
      this.speedSliders.push(slider);
      // colour plate: the four official colourways
      const lab = new T.Mesh(new T.PlaneGeometry(0.07, 0.07 * 40 / 256), new T.MeshBasicMaterial({ map: textTexture("Colour", { w: 256, h: 40, size: 34, align: "left" }), transparent: true, depthWrite: false }));
      lab.position.set(-0.086, y0 - 0.062, 2e-3);
      panel.root.add(lab);
      Object.entries(MD_VARIANTS).forEach(([name, v], i) => {
        const sw = ctx.button("", { w: 0.036, h: 0.022, swatch: v.chip, capsule: true, onClick: () => this.setVariant(name) });
        sw.root.position.set(-0.03 + i * 0.044, y0 - 0.062, 0);
        sw.root.name = `colour:${v.label}`;
        panel.root.add(sw.root);
        (this.swatches[name] ??= []).push(sw);
      });
      // panel bases stop the ray (otherwise it passes through to the floor / duck behind and a pinch there
      // sends the duck off); far only, so they never take a near grab from a button
      ctx.add(panel.root.children[0], { near: false, highlight: false });
      return panel;
    };
    this.panel = makePanel("Microduck \u00b7 poke, pinch or ray", false);
    ctx.root.add(this.panel.root);
    this.menuPanel = inMenu ? makePanel("Microduck", true) : null;
    this._markVariant();
    const joy = this.joyPanel = ctx.panel("Drive · grab the knob", { w: 0.13, h: 0.15 });
    const R = this.joyR = 0.042;
    const pad = this.pad = new T.Group();
    pad.position.set(0, -0.015, 2e-3);
    pad.add(mdLines([...mdCircle(R, 0, 64), -R * 0.5, 0, 0, R * 0.5, 0, 0, 0, -R * 0.5, 0, 0, R * 0.5, 0], { px: 2, opacity: 0.8 }));
    joy.root.add(pad);
    const knob = this.knob = new T.Mesh(new T.SphereGeometry(0.014, 24, 16), new T.MeshStandardMaterial({ color: 16777215, roughness: 0.4 }));
    knob.name = "joystick";
    knob.position.z = 0.01;
    pad.add(knob);
    this.knobIt = ctx.add(knob, { dragThreshold: 0 });
    const drive = (e) => {
      const p = pad.worldToLocal(e.point.clone());
      p.z = 0;
      if (p.length() > R) p.setLength(R);
      knob.position.set(p.x, p.y, 0.01);
      this.joy.set(p.x / R, p.y / R);
    };
    this.knobIt.on("press", drive).on("drag", drive).on("release", () => {
      knob.position.set(0, 0, 0.01);
      this.joy.set(0, 0);
    });
    ctx.add(joy.root.children[0], { near: false, highlight: false });
    ctx.root.add(joy.root);
    if (inMenu) {
      app.menu.addPage("duck", this.menuPanel);
      const m = app.menuButtons;
      this.menuBack = ctx.button("\u2039 Microduck", { w: 0.075, h: 0.026, fontSize: 26, onClick: () => app.menu.show("duck") });
      app.menu.setItems([this.menuBack, m.vst, m.gain, m.mesh, m.joints, m.ray, m.reset, m.clear, m.exit], app.opacitySlider);
    }
  },
  // colourway: repaint both rigs (legs and skates) and mark the chip
  setVariant(name) {
    if (!MD_VARIANTS[name]) return;
    this.variant = name;
    for (const r of Object.values(this.rigs ?? {})) mdPaint(r.rig, name);
    this._markVariant();
  },
  _markVariant() {
    const cur = this.variant ?? "classic";
    for (const [name, list] of Object.entries(this.swatches)) for (const sw of list) sw.root.scale.setScalar(name === cur ? 1.25 : 1);
  },
  // floor mode: the duck on the real floor at real size; tabletop: half size on a desk in front of you
  _placeStage(tabletop) {
    this.tabletop = tabletop;
    const st = this.stage, top = this.tableTop;
    if (tabletop) {
      st.position.set(0, top - 0.02, -0.75);
      st.scale.setScalar(0.4);
    } else {
      st.position.set(0, 0, -1.3);
      st.scale.setScalar(1);
    }
    this.stageY = st.position.y;
    // the duck walks along MJCF +X: turn the stage so it starts out facing you
    st.rotation.set(0, -Math.PI / 2, 0, "YXZ");
    // console at the sides of your reach, out of the line of sight to the stage
    const y = tabletop ? top + 0.02 : T6clamp(top + 0.05);
    const rel = [this.joyPanel.root, this.panel.root];
    this.joyPanel.root.position.set(0.4, y - 0.02, -0.36);
    this.joyPanel.root.lookAt(0, y + 0.45, 0.35);
    this.panel.root.position.set(-0.42, y, -0.36);
    this.panel.root.lookAt(0, y + 0.45, 0.35);
    // the console rides with the stage: its pose is stored relative to the stage's position + heading (not its
    // scale, so the buttons stay hand-sized when the stage is shrunk or grown)
    const F = this._stageFrame(new THREE6.Matrix4()).invert();
    this.consoleRel = rel.map((o) => {
      o.updateMatrix();
      return { o, m: F.clone().multiply(o.matrix) };
    });
    this.btn?.table.setValue(tabletop);
  },
  // - landing screen (desktop, before / outside XR): a three-quarter close-up of the duck, swaying gently;
  // the entry card sits beside it (view offset) instead of on top of it -
  _heroCamera() {
    const a = this.app, st = this.stage, s = st.scale.x;
    const target = st.position.clone().add(new THREE6.Vector3(0, 0.13 * s, 0));
    this.cam = { sway: true, theta0: st.rotation.y + Math.PI / 2 + 0.35, ox: null, oy: null, W: 0, H: 0 };
    a.controls.target.copy(target);
    a.camera.position.copy(target).add(new THREE6.Vector3().setFromSphericalCoords(0.46 * s, 1.33, this.cam.theta0));
    a.controls.update();
  },
  _desktopCamera(dt, t) {
    const a = this.app, cam = a.camera, ctl = a.controls, C = this.cam;
    // a zero-size window (minimized, hidden iframe) has no framing to compute; a corrupted pose is re-framed
    if (!C || innerWidth < 2 || innerHeight < 2) return;
    if (![cam.position.x, cam.position.y, cam.position.z, ctl.target.x].every(Number.isFinite)) return this._heroCamera();
    // follow the duck (target and camera slide together) until the user takes the camera
    if (this.rig && C.sway) {
      const f = this.rig.trunk.getWorldPosition(_mdV);
      f.y += 0.02 * this.stage.scale.x;
      const d = f.sub(ctl.target).multiplyScalar(1 - Math.exp(-dt * 2.5));
      ctl.target.add(d);
      cam.position.add(d);
    }
    if (C.sway) {
      const sph = new THREE6.Spherical().setFromVector3(_mdV.copy(cam.position).sub(ctl.target));
      sph.theta = C.theta0 + 0.38 * Math.sin(t * 0.13);
      cam.position.copy(ctl.target).add(_mdV.setFromSpherical(sph));
      cam.lookAt(ctl.target);
    }
    // frame the duck in the free part of the window: right of the entry card, or above it when the card
    // sits at the bottom; while the camera is ours, its distance makes the duck fill that space
    const W = innerWidth, H = innerHeight, el = document.querySelector("#overlay:not(.hidden) .card");
    let rx = 0, ry = 0, rw = W, rh = H;
    if (el) {
      const r = el.getBoundingClientRect();
      if (W - r.right > r.top) rx = r.right, rw = W - r.right;
      else rh = r.top;
    }
    const ox = Math.round(W / 2 - (rx + rw / 2)), oy = Math.round(H / 2 - (ry + rh / 2));
    if (ox !== C.ox || oy !== C.oy || W !== C.W || H !== C.H) {
      Object.assign(C, { ox, oy, W, H });
      if (ox || oy) cam.setViewOffset(W, H, ox, oy, W, H);
      else cam.clearViewOffset();
    }
    if (C.sway) {
      const s = this.stage.scale.x, tan = Math.tan(THREE6.MathUtils.degToRad(cam.fov / 2));
      // duck ~0.3 m tall incl. margin: fill ~62 % of the free height and at most ~70 % of the free width
      const d = Math.max(0.3 / (0.62 * (rh / H) * 2 * tan), 0.2 / (0.7 * (rw / W) * 2 * tan * cam.aspect));
      const off = _mdV.copy(cam.position).sub(ctl.target), len = off.length();
      const want = T6clamp(d, 0.32, 2.5) * s;
      cam.position.copy(ctl.target).add(off.setLength(len + (want - len) * Math.min(1, dt * 3)));
    }
  },
  // idle routine, driven through the real policy: gaze follows the pointer (or wanders when it rests),
  // plus an occasional quack and ground peck
  _idle(dt, t) {
    const S = this.S, a = this.app;
    if (!S || !this.rig) return;
    const q = S.data.qpos, yaw = this._yaw();
    if (a.mouse.inside && performance.now() - this.lastPointer < 4e3) {
      const rc = new THREE6.Raycaster();
      rc.setFromCamera(a.mouse.ndc, a.camera);
      const head = this.rig.trunk.getWorldPosition(_mdV);
      const p = rc.ray.at(rc.ray.origin.distanceTo(head), new THREE6.Vector3());
      this.idleGaze.copy(this.sim.worldToLocal(p));
    } else {
      const fx = 0.6, fy = 0.4 * Math.sin(t * 0.45) + 0.15 * Math.sin(t * 1.1), fz = 0.12 + 0.18 * Math.sin(t * 0.31);
      this.idleGaze.set(q[0] + Math.cos(yaw) * fx - Math.sin(yaw) * fy, q[1] + Math.sin(yaw) * fx + Math.cos(yaw) * fy, q[2] + fz);
    }
    const I = this.idle, calm = S.mode === "walk" && !S.recovery && !S.grab && !S.movingT && !this.goal.active && !this.follow && !this.kickPlan;
    if (!calm) return;
    I.quackAt -= dt;
    I.peckAt -= dt;
    if (I.quackAt <= 0) {
      this.quack();
      I.quackAt = 7 + Math.random() * 8;
    }
    if (I.peckAt <= 0 && S.A.sessions.groundpick && S.loco === "legs") {
      this.trigger("groundpick");
      I.peckAt = 18 + Math.random() * 14;
    }
  },
  // while the stage bar is dragged (one hand), the stage swings about the bar so the bar sits between you and
  // the stage centre - bar, joystick and console turn to face you; released, it keeps that heading
  _faceWhileDragged(dt) {
    const it = this.stageIt, sel = it.selections[0], st = this.stage, head = this.app.input.head;
    if (it.selections.length !== 1 || !sel.dragging || !sel.offsetPos || this.app.im.twoHand.has(it)) return;
    const R = (MD_STAGE_R + 0.09) * st.scale.x, th = st.rotation.y;
    const bar = _mdV.set(Math.cos(th), 0, -Math.sin(th)).multiplyScalar(R).add(st.position);
    const ux = bar.x - head.x, uz = bar.z - head.z, l = Math.hypot(ux, uz);
    if (l < 0.05) return;
    // bar direction from the centre = toward you: (cos t, 0, -sin t) = -(ux, 0, uz) / l
    const want = Math.atan2(uz / l, -ux / l), nt = th + MD_WRAP(want - th) * Math.min(1, dt * 8);
    const c = new THREE6.Vector3(bar.x - Math.cos(nt) * R, st.position.y, bar.z + Math.sin(nt) * R);
    sel.offsetPos.add(c.clone().sub(st.position));
    st.position.copy(c);
    st.rotation.set(0, nt, 0, "YXZ");
  },
  _stageFrame(out) {
    return out.compose(this.stage.position, this.stage.quaternion, _mdOne);
  },
  _lim() {
    return this.boundary ? MD_STAGE_R : MD_FREE_R;
  },
  // Boundary off: no curb (physics or drawing), no disc - the duck roams the open (passthrough) floor. The
  // floor stays a pinch / ray target out to MD_FREE_R; the handle bar still moves the stage origin.
  setBoundary(on) {
    this.boundary = on;
    this.rim.visible = this.gridLines.visible = on;
    this.discMat.visible = on;
    const R = this._lim();
    this.floorIt.localBox.set(new THREE6.Vector3(-R, -R, -2e-3), new THREE6.Vector3(R, R, 2e-3));
    this.btn?.bound.setValue(on);
    this._applyCurb();
  },
  _applyCurb() {
    const S = this.S;
    if (!S) return;
    for (const g of S.curbIds) {
      S.model.geom_contype[g] = this.boundary ? 1 : 0;
      S.model.geom_conaffinity[g] = this.boundary ? 1 : 0;
    }
  },
  status(msg) {
    this.statusTex?.userData.draw(msg);
  },
  // - simulation lifecycle -
  _startSim(A) {
    this.A = A;
    this.rigs = {};
    this.setLoco(this.loco ?? "legs");
    const token = this.token;
    A.extras.then(() => token === this.token && this.app.log("all policies loaded"));
  },
  // legs <-> rollers: each variant keeps its own model, rig and duck interactable; switching swaps the
  // simulation state (fresh MjData at the STAND keyframe) and shows the matching rig
  async setLoco(loco) {
    const A = this.A, token = this.token;
    if (!A || this.switching || this.S && this.S.loco === loco) return;
    this.switching = true;
    try {
      const V = loco === "rollers" ? await mdLoadRollers(A, (m) => this.status(m)) : A.legs;
      if (token !== this.token) return;
      if (!this.rigs[loco]) {
        const group = new THREE6.Group();
        group.name = `rig:${loco}`;
        this.sim.add(group);
        const rig = await mdBuildRig({ kin: V.kin, mesh: A.mesh, variant: this.variant ?? "classic" }, group);
        if (token !== this.token) return;
        // hull drawn ~one duck-size behind the duck: its own parts hide every inner edge, only the silhouette shows
        const it = this._grabbable(this.ctx, rig.trunk, "duck", { outlinePush: () => 0.3 * this.stage.scale.x });
        it.on("tap", () => this.quack()).on("longpress", () => this.S?.loco === "legs" && this.btn.sit._click());
        this.rigs[loco] = { group, rig, it };
      }
      const old = this.S;
      this.S = this._makeState(A, V, loco);
      old?.data.delete();
      for (const [k, r] of Object.entries(this.rigs)) r.group.visible = k === loco;
      Object.assign(this, { loco, rig: this.rigs[loco].rig, duckIt: this.rigs[loco].it });
      // the 1 m curb trips a skating robot (it reaches ~0.9 m/s): skates open the boundary, legs restore it
      if (loco === "rollers" && this.boundary) this.boundaryBeforeSkates = true, this.setBoundary(false);
      else if (loco === "legs" && this.boundaryBeforeSkates) this.boundaryBeforeSkates = false, this.setBoundary(true);
      this._applyCurb();
      this.reset();
      this._syncRig();
      this.btn.rollers.setValue(loco === "rollers");
      this.btn.roll.setLabel(loco === "rollers" ? "Crouch" : "Roll");
      this.status(loco === "rollers" ? "On roller skates \u00b7 Crouch for a glide" : "Point + pinch the floor to walk \u00b7 grab the duck \u00b7 tap = quack");
      this.app.log(`microduck ready (${loco})`);
    } catch (e) {
      console.error(e);
      this.status(`\u26a0 ${e.message}`);
      this.btn.rollers.setValue(this.S?.loco === "rollers");
    } finally {
      this.switching = false;
    }
  },
  _makeState(A, V, loco) {
    const { mujoco } = A, model = V.model;
    const data = new mujoco.MjData(model);
    const id = (type, name) => mujoco.mj_name2id(model, mujoco.mjtObj[type].value, name);
    const trunkId = id("mjOBJ_BODY", "trunk_base"), ballId = id("mjOBJ_BODY", "ball");
    const bj = model.jnt("ball_freejoint");
    return {
      A, mujoco, model, data, loco,
      qposAdr: MD_JOINTS.map((n) => model.jnt(n).qposadr),
      dofAdr: MD_JOINTS.map((n) => model.jnt(n).dofadr),
      // unactuated hinges (the rollers' four wheels): not in obs / ctrl, synced to the rig so they spin
      extra: V.kin.bodies.filter((b) => b.joint && b.joint.type === "hinge" && !MD_JOINTS.includes(b.joint.name)).map((b) => ({ name: b.joint.name, adr: model.jnt(b.joint.name).qposadr })),
      gyroAdr: model.sensor("imu_ang_vel").adr,
      trunkId,
      standKey: id("mjOBJ_KEY", "STAND"),
      curbIds: Array.from({ length: 36 }, (_, k) => id("mjOBJ_GEOM", `curb${k}`)),
      ankles: ["ankle_left", "ankle_right"].map((n) => id("mjOBJ_BODY", n)),
      trunk: { bodyId: trunkId, qAdr: 0, dofAdr: 0, mass: model.body(trunkId).subtreemass },
      ballBody: { bodyId: ballId, qAdr: bj.qposadr, dofAdr: bj.dofadr, mass: model.body(ballId).mass },
      obs: new Float32Array(MD_OBS),
      cmd: new Float32Array(MD_CMD),
      lastAction: new Float32Array(MD_NJ),
      head: new Float32Array(4),
      twist: new Float32Array(3),
      acc: 0,
      busy: false,
      steps: 0
    };
  },
  reset() {
    const S = this.S;
    this.goal.active = false;
    this.kickPlan = null;
    if (!S) return;
    this._grabEnd();
    Object.assign(S, { mode: "walk", sitFlag: 0, sitWanted: false, run: null, recovery: null, fallDebounce: 0, fallenSteps: 0, postKick: 0, pending: null });
    S.mujoco.mj_resetDataKeyframe(S.model, S.data, S.standKey);
    S.mujoco.mj_forward(S.model, S.data);
    S.lastAction.fill(0);
    S.head.fill(0);
    S.twist.fill(0);
    this.ball.visible = false;
    this.btn.sit.setValue(false);
    this.flag.position.set(0.5, 0, 0);
  },
  setGoal(x, y) {
    const r = Math.hypot(x, y), lim = this._lim() - 0.08;
    if (r > lim) x *= lim / r, y *= lim / r;
    this.goal.pos.set(x, y);
    this.goal.active = true;
    this.kickPlan = null;
    this.flag.position.set(x, y, 0);
    if (this.follow) this.btn.follow._click();
  },
  _floorPoint(e) {
    const i = e.interactor, s = i.source;
    this.sim.updateMatrixWorld();
    let p = e.point.clone();
    if (i.type === "far" && s.ray?.valid) {
      const n = new THREE6.Vector3(0, 0, 1).transformDirection(this.sim.matrixWorld);
      const plane = new THREE6.Plane().setFromNormalAndCoplanarPoint(n, this.sim.getWorldPosition(new THREE6.Vector3()));
      const hit = new THREE6.Ray(s.ray.origin, s.ray.dir).intersectPlane(plane, new THREE6.Vector3());
      if (!hit) return null;
      p = hit;
    }
    return this.sim.worldToLocal(p);
  },
  // - modes (the Space's state machine, step-counted at 50 Hz) -
  trigger(what) {
    const S = this.S;
    if (!S) return;
    // on skates: Roll is the crouch-glide; sit, peck and kicks are legged moves (as in the official simulator)
    if (S.loco === "rollers") {
      if (what === "roll") what = "crouch";
      else if (what !== "stand") return this.status("That one needs legs \u2014 switch Rollers off");
      else return;
    }
    const need = { sit: "sitstand", stand: "sitstand", roll: "roll", kickL: "kickL", kickR: "kickR", groundpick: "groundpick" }[what];
    if (need && !S.A.sessions[need]) return this.status("That move is still loading…");
    if (S.recovery || S.run) return;
    if (what === "sit") {
      this.sound.sit();
      // hand over gently: hold the stand under the sit-stand policy before asking for the sit
      S.mode = "sitstand";
      S.sitFlag = 0;
      S.sitWanted = true;
      S.lastAction.fill(0);
      S.pending = { steps: 40, then: () => S.sitFlag = 1 };
      this.goal.active = false;
      return;
    }
    if (what === "stand") {
      if (S.mode !== "sitstand") return;
      this.sound.stand();
      S.sitFlag = 0;
      S.sitWanted = false;
      S.pending = { steps: 100, then: () => {
        S.mode = "walk";
        S.lastAction.fill(0);
      } };
      return;
    }
    if (S.mode !== "walk" || S.pending) return;
    this.goal.active = false;
    S.mode = what;
    if (what === "roll") S.run = { steps: 0, tipped: false, max: 150 }, this.sound.whee();
    // crouch-glide: phase clock in the command slots, 5 s period, hands back at phase 0.7 (3.5 s)
    else if (what === "crouch") S.run = { phase: 0, period: 5, end: 0.7 }, this.sound.glide();
    else if (what === "groundpick") S.run = { phase: 0, period: 4, end: 0.7 }, this.sound.peck();
    else S.run = { steps: 0, max: 25 }, this.sound.hup();
  },
  spawnBall() {
    const S = this.S;
    if (!S) return;
    const q = S.data.qpos, v = S.data.qvel, a = S.ballBody.qAdr, d = S.ballBody.dofAdr;
    const yaw = Math.atan2(2 * (q[3] * q[6] + q[4] * q[5]), 1 - 2 * (q[5] * q[5] + q[6] * q[6])) + (Math.random() - 0.5) * 0.5;
    q.set([q[0] + Math.cos(yaw) * 0.3, q[1] + Math.sin(yaw) * 0.3, MD_BALL_R + 0.05, 1, 0, 0, 0], a);
    for (let k = 0; k < 6; k++) v[d + k] = 0;
    S.mujoco.mj_forward(S.model, S.data);
    this.ball.visible = true;
  },
  // the kicks are blind one-shots: they connect when the ball sits ~8.5 cm ahead and ~4.5 cm toward the
  // kicking foot. With a ball out, Kick walks up to it, lines up, then kicks; without one it kicks at the air.
  kick(foot) {
    if (!this.S) return;
    if (this.S.loco === "rollers") return this.trigger(foot);
    if (!this.ball.visible) return this.trigger(foot);
    const q = this.S.data.qpos, b = this.S.ballBody.qAdr;
    this.kickPlan = { foot, yaw: Math.atan2(q[b + 1] - q[1], q[b] - q[0]), t: 0 };
    this.goal.active = false;
    if (this.follow) this.btn.follow._click();
  },
  // [vx, vy, wz] for the kick approach, or null once the kick has been launched / abandoned.
  // The kicks are one-shots trained from a standstill: from standing they connect with the ball anywhere
  // 5-11 cm ahead and 1-9 cm toward the kicking foot, launched mid-stride they whiff. So:
  //   stage : walk to a point 30 cm behind the ball on the kick line (offset to the kicking foot), face along it
  //   strike: walk in, turning so the ball stays in front of the kicking foot, stop short
  //   settle: stand still, then kick if the ball is in the zone (either foot), else stage again
  _kickSteer(fwd, ang) {
    const S = this.S, q = S.data.qpos, b = S.ballBody.qAdr, kp = this.kickPlan;
    kp.t += MD_CTRL_DT;
    if (!this.ball.visible || kp.t > 25) return this.kickPlan = null;
    const yaw = this._yaw(), dx = q[b] - q[0], dy = q[b + 1] - q[1];
    const lx = Math.cos(yaw) * dx + Math.sin(yaw) * dy, ly = -Math.sin(yaw) * dx + Math.cos(yaw) * dy;
    const sgn = kp.foot === "kickR" ? -1 : 1;
    const restage = () => {
      kp.phase = "stage";
      kp.yaw = Math.atan2(dy, dx);
      return [0, 0, 0];
    };
    if (kp.phase === "settle") {
      const v = Math.hypot(S.data.qvel[0], S.data.qvel[1]);
      if ((kp.wait += MD_CTRL_DT) < 0.5 || v > 0.03) return [0, 0, 0];
      const zone = (f) => lx > 0.045 && lx < 0.11 && (f === "kickR" ? -ly : ly) > 0 && (f === "kickR" ? -ly : ly) < 0.1;
      const other = kp.foot === "kickR" ? "kickL" : "kickR";
      const foot = zone(kp.foot) ? kp.foot : zone(other) ? other : null;
      if (!foot) return restage();
      this.kickPlan = null;
      this.trigger(foot);
      return null;
    }
    if (kp.phase === "strike") {
      // walked past it or drifted off the line: stage again from here
      if (lx < 0.04 || lx > 0.45 || Math.abs(ly - sgn * 0.045) > 0.09) return restage();
      if (lx < 0.105) {
        kp.phase = "settle";
        kp.wait = 0;
        return [0, 0, 0];
      }
      // walk in, creeping over the last few cm (0.15 keeps an already-walking duck going)
      return [lx > 0.22 ? 0.2 : 0.15, 0, T6clamp((ly - sgn * 0.045) * 8, -0.6, 0.6)];
    }
    const c = Math.cos(kp.yaw), s = Math.sin(kp.yaw);
    let sx = q[b] - (c * 0.3 - s * sgn * 0.045), sy = q[b + 1] - (s * 0.3 + c * sgn * 0.045);
    const r = Math.hypot(sx, sy), lim = this._lim() - 0.1;
    if (r > lim) sx *= lim / r, sy *= lim / r;
    if (Math.hypot(sx - q[0], sy - q[1]) > 0.07) return this._steer(sx, sy, fwd, ang);
    const err = MD_WRAP(Math.atan2(dy, dx) - yaw);
    if (Math.abs(err) > 0.12) return [0, 0, this._turn(err)];
    kp.phase = "strike";
    return [0.2, 0, 0];
  },
  // the walking policy has start thresholds (measured over repeated trials from a settled stance): forward
  // 0.25 m/s starts every time, 0.2 usually; a left turn on the spot needs the full 1 rad/s, a right turn on
  // the spot never starts without some forward speed; backward rarely starts at all. Once walking it keeps
  // going down to ~0.15 m/s. So automatic commands are full-rate turns or forward speed, and _startAssist
  // bridges the start.
  _turn(err) {
    return Math.sign(err) * (this.S.loco === "rollers" ? 0.3 : 1);
  },
  _steer(tx, ty, fwd, ang) {
    const q = this.S.data.qpos, err = MD_WRAP(Math.atan2(ty - q[1], tx - q[0]) - this._yaw());
    if (Math.abs(err) > 0.6) return [0, 0, this._turn(err)];
    return [Math.max(0.2, fwd * Math.cos(err)), 0, T6clamp(err * 2.2, -ang, ang)];
  },
  // Skating, measured on the roller policy (boundary off): cmd[0] is push intensity, not speed - > 0 pushes
  // (0.3-0.6 reaches ~0.9 m/s), 0 coasts (it keeps rolling), < 0 brakes: hard brakes tip it over and braking
  // on once slow spins it (see MD_SKATE). cmd[2] is a heading error, capped at 0.3: it steers while rolling;
  // turning on the spot is unreliable. So: always roll a little to steer, brake gently only down to ~0.15 m/s,
  // and start braking well before a goal.
  _skate(m) {
    const S = this.S, q = S.data.qpos, v = Math.hypot(S.data.qvel[0], S.data.qvel[1]);
    const push = 0.25 + 0.35 * this.speed, B = this.skate, brake = v > 0.15 ? B.brake : 0;
    if (Math.hypot(m[0], m[2]) > 0.12) {
      this.goal.active = false;
      let x = m[0] > 0.12 ? 0.2 + (push - 0.2) * m[0] : m[0] < -0.12 ? brake : 0;
      const h = Math.abs(m[2]) > 0.12 ? 0.3 * m[2] : 0;
      if (h && x === 0 && v < 0.2) x = 0.25;
      return [x, 0, h];
    }
    let target = null, arrive = 0.35;
    if (this.follow) {
      const h = this.sim.worldToLocal(this.app.input.head.clone());
      target = [h.x, h.y];
      arrive = 0.6 / this.stage.scale.x;
    } else if (this.goal.active) target = [this.goal.pos.x, this.goal.pos.y];
    // nothing to do: roll to a stop instead of coasting away
    if (!target) return [v > 0.25 ? B.brake : 0, 0, 0];
    const dx = target[0] - q[0], dy = target[1] - q[1], dist = Math.hypot(dx, dy);
    if (dist < arrive + B.lead * v) {
      if (!this.follow && v < 0.12) this.goal.active = false;
      return [brake, 0, 0];
    }
    const err = MD_WRAP(Math.atan2(dy, dx) - this._yaw());
    return [Math.abs(err) > 0.6 ? 0.3 : Math.max(0.25, push * Math.min(1, dist)), 0, T6clamp(err, -0.3, 0.3)];
  },
  _startAssist(want) {
    if (this.S.movingT > 0) return want;
    if (want[0] > 0) want[0] = Math.max(want[0], 0.25);
    else if (want[0] === 0 && want[2] < -0.3) want[0] = 0.2;
    return want;
  },
  quack() {
    this.jaw = 1;
    this.sound.quack();
  },
  _activeSession() {
    const S = this.S, s = S.A.sessions;
    if (S.recovery?.state === "recovering") return s.stand;
    if (S.loco === "rollers") return S.mode === "crouch" ? s.crouch : s.drive;
    return s[S.mode] ?? s.walk;
  },
  _projGravity(out) {
    const xq = this.S.data.body(this.S.trunkId).xquat;
    _mdq.set(xq[1], xq[2], xq[3], xq[0]).conjugate();
    return out.set(0, 0, -1).applyQuaternion(_mdq);
  },
  _yaw() {
    const q = this.S.data.qpos;
    return Math.atan2(2 * (q[3] * q[6] + q[4] * q[5]), 1 - 2 * (q[5] * q[5] + q[6] * q[6]));
  },
  // twist + head targets from joystick / sticks / keys > follow-me > goal, recomputed every control step
  _command() {
    const S = this.S, q = S.data.qpos, tw = S.twist, head = this.app.input.head;
    // Speed slider. Legs: forward 0.2 (start threshold) .. 0.35 m/s (trained range: 0.4), turn 0.7 .. 1 rad/s.
    // Skates: forward 0.25 .. 0.6 m/s, turn capped at 0.3 rad/s - faster turns tip the robot over (the runtime
    // launches rollers with --max-angular-vel 0.3)
    const skates = S.loco === "rollers";
    const fwd = skates ? 0.25 + 0.35 * this.speed : 0.2 + 0.15 * this.speed, ang = skates ? 0.3 : 0.7 + 0.3 * this.speed;
    const m = this.manual;
    let want = [0, 0, 0];
    const locked = S.mode !== "walk" || S.recovery || S.postKick > 0 || S.grab || S.pending;
    if (!locked && skates) want = this._skate(m);
    else if (!locked) {
      if (Math.hypot(m[0], m[2]) > 0.12) {
        this.goal.active = false;
        this.kickPlan = null;
        // manual: any deflection past the dead zone clears the start threshold, full deflection = 0.35 m/s
        const ax = Math.abs(m[0]), az = Math.abs(m[2]);
        want = [
          ax > 0.12 ? Math.sign(m[0]) * (m[0] > 0 ? 0.2 + 0.15 * ax : 0.15 + 0.1 * ax) : 0,
          0,
          az > 0.12 ? Math.sign(m[2]) * (ax > 0.12 ? 0.4 + 0.6 * az : 1) : 0
        ];
      } else {
        const k = this.kickPlan && this._kickSteer(fwd, ang);
        if (k) want = k;
        else if (this.follow) {
          const h = this.sim.worldToLocal(head.clone());
          const dx = h.x - q[0], dy = h.y - q[1], err = MD_WRAP(Math.atan2(dy, dx) - this._yaw());
          if (Math.hypot(dx, dy) > 0.5 / this.stage.scale.x) want = this._steer(h.x, h.y, fwd, ang);
          else if (Math.abs(err) > 0.35) want = [0, 0, this._turn(err)];
        } else if (this.goal.active) {
          const g = this.goal.pos;
          if (Math.hypot(g.x - q[0], g.y - q[1]) > 0.1) want = this._steer(g.x, g.y, fwd, ang);
          else this.goal.active = false;
        }
      }
    }
    if (!locked && !skates) this._startAssist(want);
    for (let k = 0; k < 3; k++) tw[k] += 0.25 * (want[k] - tw[k]);
    // look at me: head yaw toward your head, neck + head pitch up toward it (training caps: pitch 1.1, yaw 1.4)
    const ht = [0, 0, 0, 0];
    const idle = this.attract && !want[0] && !want[2] && !this.kickPlan && !S.movingT;
    // (skates: the roller policies were trained with zero head / body command slots, so no gaze)
    const gaze = skates ? null : this.look ? this.sim.worldToLocal(head.clone()) : idle ? this.idleGaze : null;
    if (gaze && !locked) {
      const h = gaze;
      const dx = h.x - q[0], dy = h.y - q[1], dz = h.z - q[2] - 0.08;
      const yawErr = MD_WRAP(Math.atan2(dy, dx) - this._yaw());
      const elev = Math.atan2(dz, Math.hypot(dx, dy));
      const moving = Math.min(1, Math.abs(tw[0]) / 0.1);
      const k = 1 - 0.5 * moving;
      ht[0] = T6clamp(elev * 0.55, -0.3, 0.8) * k;
      ht[1] = -T6clamp(elev * 0.45, -0.3, 0.7) * k;
      ht[2] = T6clamp(yawErr, -1.2, 1.2) * k;
    }
    for (let k = 0; k < 4; k++) S.head[k] += 0.2 * (ht[k] - S.head[k]);
  },
  // observation noise = the training config's (microduck_velocity_env_cfg.py). Without it a perfectly still
  // duck sits in a fixed point of the walking policy and ignores velocity commands until something nudges it.
  _buildObs() {
    const S = this.S, q = S.data.qpos, v = S.data.qvel, sens = S.data.sensordata, o = S.obs, c = S.cmd;
    const n = (a) => (Math.random() * 2 - 1) * a;
    let i = 0;
    for (let a = 0; a < 3; a++) o[i++] = sens[S.gyroAdr + a] + n(0.03);
    const g = this._projGravity(_mdg);
    o[i++] = g.x + n(0.01);
    o[i++] = g.y + n(0.01);
    o[i++] = g.z + n(0.01);
    for (let j = 0; j < MD_NJ; j++) o[i++] = q[S.qposAdr[j]] - MD_DEFAULT[j] + n(1e-3);
    for (let j = 0; j < MD_NJ; j++) o[i++] = v[S.dofAdr[j]] + n(0.25);
    for (let j = 0; j < MD_NJ; j++) o[i++] = S.lastAction[j];
    c.fill(0);
    if (S.mode === "sitstand") c[0] = S.sitFlag;
    else if ((S.mode === "groundpick" || S.mode === "crouch") && S.run) {
      const a = 2 * Math.PI * S.run.phase;
      c[0] = Math.cos(a);
      c[1] = Math.sin(a);
    } else if (S.mode === "walk" && !S.recovery) c.set(S.twist, 0);
    // the stand and ground-pick policies were trained with zero-padded head / body slots
    if (S.mode !== "groundpick" && !S.recovery && S.loco === "legs") c.set(S.head, 3);
    for (let k = 0; k < MD_CMD; k++) o[i++] = c[k];
    return o;
  },
  async _controlStep() {
    const S = this.S, { mujoco, model, data, A } = S;
    this._command();
    if (S.recovery?.state !== "fallen") {
      const sess = this._activeSession();
      const out = await sess.run({ [sess.inputNames[0]]: new A.ort.Tensor("float32", this._buildObs(), [1, MD_OBS]) });
      if (this.S !== S) return;
      const act = out[sess.outputNames[0]].data;
      if (act.every(Number.isFinite)) {
        S.lastAction.set(act);
        const ctrl = data.ctrl;
        for (let j = 0; j < MD_NJ; j++) ctrl[j] = MD_DEFAULT[j] + act[j];
      }
    }
    for (let k = 0; k < MD_DECIMATION; k++) {
      this._applyGrab();
      mujoco.mj_step(model, data);
    }
    S.steps++;
    this._afterStep();
  },
  _afterStep() {
    const S = this.S, q = S.data.qpos;
    const gz = this._projGravity(_mdg).z;
    if (!Number.isFinite(q[2]) || !Number.isFinite(gz)) return this.reset();
    // thrown off the stage: respawn in the middle
    if (!S.grab && Math.hypot(q[0], q[1]) > this._lim() + 0.35) return this.reset();
    const b = S.ballBody.qAdr;
    if (this.ball.visible && (Math.hypot(q[b], q[b + 1]) > this._lim() + 0.3 || q[b + 2] < -0.5)) this.ball.visible = false;
    if (S.pending && --S.pending.steps <= 0) {
      const p = S.pending;
      S.pending = null;
      p.then();
    }
    if (S.postKick > 0 && S.mode === "walk") S.postKick--;
    this._simSounds();
    // gait latch for the start assist: moving (or turning) within the last 0.6 s
    const v = S.data.qvel;
    S.movingT = Math.hypot(v[0], v[1]) > 0.06 || Math.abs(v[5]) > 0.35 ? 0.6 : Math.max(0, (S.movingT ?? 0) - MD_CTRL_DT);
    // automatic fall recovery (walk mode): debounce, 0.3 s limp settle, then the get-up policy until upright 1 s
    const fallen = gz > -0.5 || q[2] < 0.02;
    if (S.recovery) {
      const r = S.recovery;
      r.steps++;
      if (r.state === "fallen" && r.steps >= 15) {
        S.recovery = { state: "recovering", steps: 0, upright: 0 };
        S.lastAction.fill(0);
      } else if (r.state === "recovering") {
        r.upright = gz < -0.85 ? r.upright + 1 : 0;
        if (r.upright >= 50) {
          S.recovery = null;
          S.mode = "walk";
          S.lastAction.fill(0);
          this.sound.getup();
          this.status("Back on its feet!");
        } else if (r.steps >= 300 && !S.grab) this.reset();
      }
    } else if (fallen && S.loco === "legs" && S.mode === "walk" && !S.grab && S.postKick === 0) {
      if (++S.fallDebounce >= 10) {
        S.fallDebounce = 0;
        S.recovery = { state: "fallen", steps: 0 };
        this.sound.uhoh();
        this.status("Oops — getting back up…");
      }
    } else if (fallen && !S.grab && S.mode !== "roll") {
      if (++S.fallenSteps > 50) this.reset();
    } else {
      S.fallDebounce = 0;
      S.fallenSteps = 0;
    }
    // one-shots hand back to walking on their own
    const run = S.run;
    if (!run) return;
    if (S.mode === "kickL" || S.mode === "kickR") {
      if (++run.steps >= run.max) {
        S.run = null;
        S.mode = "walk";
        S.postKick = 20;
      }
    } else if (S.mode === "groundpick" || S.mode === "crouch") {
      run.phase += MD_CTRL_DT / run.period;
      if (run.phase >= run.end) {
        S.run = null;
        S.mode = "walk";
      }
    } else if (S.mode === "roll") {
      run.steps++;
      if (gz > -0.3) run.tipped = true;
      const upright = gz < -0.85;
      if (run.tipped && upright && run.steps >= 40 || run.steps >= run.max) {
        S.run = null;
        S.mode = "walk";
        S.lastAction.fill(0);
        if (!upright) S.recovery = { state: "fallen", steps: 0 }, this.sound.uhoh();
        else this.sound.land();
      }
    }
  },
  // footsteps (ankle height relative to the lower ankle, lift / touch hysteresis), body and ball impacts,
  // and the servo whine level (joint speed)
  _simSounds() {
    const S = this.S, v = S.data.qvel, now = performance.now(), snd = this.sound;
    let jv = 0;
    for (let j = 0; j < MD_NJ; j++) jv += Math.abs(v[S.dofAdr[j]]);
    S.jv = jv;
    if (S.ankles.every((a) => a >= 0) && !S.grab) {
      const xp = S.data.xpos, z = S.ankles.map((a) => xp[a * 3 + 2]), g = Math.min(...z);
      S.feet ??= [{ air: false, z: 0, at: 0 }, { air: false, z: 0, at: 0 }];
      S.feet.forEach((f, i) => {
        const vz = (z[i] - f.z) / MD_CTRL_DT;
        f.z = z[i];
        if (z[i] - g > 0.012) f.air = true;
        else if (f.air && z[i] - g < 5e-3 && vz < -0.02 && now - f.at > 130) {
          f.air = false;
          f.at = now;
          snd.step(Math.min(1, Math.abs(vz) / 0.35));
        }
      });
    }
    const dv = Math.abs(v[2] - (S.pvz ?? v[2]));
    S.pvz = v[2];
    if (dv > 0.8 && !S.grab && now - (S.bumpAt ?? 0) > 250) S.bumpAt = now, snd.clunk(Math.min(1, (dv - 0.8) / 2));
    if (this.ball.visible) {
      const d = S.ballBody.dofAdr, bv = [v[d], v[d + 1], v[d + 2]], pb = S.pball ?? bv;
      const bdv = Math.hypot(bv[0] - pb[0], bv[1] - pb[1], bv[2] - pb[2]);
      S.pball = bv;
      if (bdv > 0.35 && now - (S.ballAt ?? 0) > 90) S.ballAt = now, snd.boing(Math.min(1, (bdv - 0.35) / 3));
    } else S.pball = null;
  },
  _syncRig() {
    const S = this.S, rig = this.rig, q = S.data.qpos;
    rig.trunk.position.set(q[0], q[1], q[2]);
    rig.trunk.quaternion.set(q[4], q[5], q[6], q[3]);
    for (let j = 0; j < MD_NJ; j++) mdSetJoint(rig, MD_JOINTS[j], q[S.qposAdr[j]]);
    for (const e of S.extra) mdSetJoint(rig, e.name, q[e.adr]);
    this.shadow.position.set(q[0], q[1], 2e-3);
    this.shadow.scale.setScalar(T6clamp(1.2 - q[2] * 1.5, 0.35, 1.1));
    this.shadow.material.opacity = T6clamp(1.3 - q[2] * 2, 0.2, 1);
    const b = S.ballBody.qAdr;
    this.ball.position.set(q[b], q[b + 1], q[b + 2]);
    this.ball.quaternion.set(q[b + 4], q[b + 5], q[b + 6], q[b + 3]);
    if (rig.jawPivot) rig.jawPivot.quaternion.setFromAxisAngle(rig.jawPivot.userData.axis, this.jaw > 0 ? 0.32 * Math.sin((1 - this.jaw) * Math.PI) : 0);
  },
  _readManual() {
    // joystick knob > controller thumbsticks (when that hand is not dragging something) > keys
    const m = this.manual;
    m.fill(0);
    if (this.joy.lengthSq() > 4e-3) {
      m[0] = this.joy.y;
      m[2] = -this.joy.x;
      return;
    }
    for (const s of this.app.input.sources.values()) {
      if (s.kind !== "controller" || s.stick.lengthSq() < 0.03) continue;
      const g = this.app.im.group(s);
      if (g?.list.some((i) => i.selecting)) continue;
      m[0] = -s.stick.y;
      m[2] = -s.stick.x;
      return;
    }
    const k = this.keys, on = (...n) => n.some((x) => k.has(x));
    m[0] = (on("w", "arrowup") ? 1 : 0) - (on("s", "arrowdown") ? 1 : 0);
    m[2] = (on("a", "arrowleft") ? 1 : 0) - (on("d", "arrowright") ? 1 : 0);
  },
  update(dt, t) {
    const a = this.app.sessionMode === "ar" ? this.app.vst.opacity : 1;
    this.discMat.opacity = 0.55 + 0.4 * a;
    this.gridLines.material.opacity = 0.25 + 0.2 * a;
    // status line floats over the far edge of the stage, facing you
    const st = this.stage;
    st.updateMatrixWorld();
    this.statusMesh.position.copy(st.position).add(new THREE6.Vector3(0, this.tabletop ? 0.2 : 0.57, 0));
    this.statusMesh.lookAt(this.app.input.head);
    this.statusMesh.scale.setScalar(this.tabletop ? 0.45 : 1);
    this._faceWhileDragged(dt);
    const F = this._stageFrame(_mdM);
    for (const { o, m } of this.consoleRel) {
      _mdM2.multiplyMatrices(F, m).decompose(o.position, o.quaternion, o.scale);
    }
    const desktop = !this.app.renderer.xr.isPresenting;
    this.attract = desktop && !document.getElementById("overlay")?.classList.contains("hidden");
    if (desktop) this._desktopCamera(dt, t);
    this.statusMesh.visible = !this.attract;
    if (this.attract) this._idle(dt, t);
    const S = this.S;
    if (!S) return;
    this._readManual();
    this.jaw = Math.max(0, this.jaw - dt / 0.35);
    // 50 Hz control, paced by the render loop: inference is async, so one pump runs at a time and catches up
    // (up to 3 steps) when the headset renders below 50 fps; beyond that the sim slows instead of spiralling
    S.acc = Math.min(S.acc + dt, MD_CTRL_DT * 3);
    if (!S.busy && S.acc >= MD_CTRL_DT) {
      S.busy = true;
      (async () => {
        while (this.S === S && S.acc >= MD_CTRL_DT) {
          S.acc -= MD_CTRL_DT;
          await this._controlStep();
        }
      })().catch((e) => {
        console.error(e);
        this.status(`⚠ ${e.message}`);
      }).finally(() => S.busy = false);
    }
    if (this.rig) {
      this._syncRig();
      const a = this.app, xr = a.renderer.xr.isPresenting;
      this.sound.update(this.rig.trunk.getWorldPosition(_mdV), xr ? a.input.head : a.camera.position, xr ? a.input.headQuat : a.camera.quaternion,
        S.grab || S.mode !== "walk" || S.movingT || S.jv > 6 ? Math.min(1, (S.jv ?? 0) / 25) : 0,
        S.loco === "rollers" && !S.grab && S.data.qpos[2] < 0.2 ? Math.min(1, Math.hypot(S.data.qvel[0], S.data.qvel[1]) / 0.5) : 0);
    }
    this.flag.visible = this.goal.active || this.flagIt.selections.length > 0;
    this.flagHead.material.emissive.setHex(this.goal.active ? 3342336 : 0);
    const B = this.btn;
    const sitting = S.mode === "sitstand" && S.sitWanted;
    if (B.sit.value !== sitting) B.sit.setValue(sitting);
  },
  exit(ctx) {
    this.token = {};
    this.sound.stop();
    if (this.inMenu) {
      const app = ctx.app, m = app.menuButtons;
      app.menu.removePage("duck");
      app.menu.setItems([m.vst, m.gain, m.mesh, m.joints, m.ray, m.reset, m.clear, m.exit], app.opacitySlider);
      this.menuPanel.root.traverse((o) => o.geometry?.dispose());
    }
    ctx.app.renderer.domElement.removeEventListener("pointermove", this._onPointer);
    ctx.app.controls.removeEventListener("start", this._onOrbit);
    removeEventListener("keydown", this._onKey);
    removeEventListener("keyup", this._onKey);
    this.S?.data.delete();
    this.S = null;
    this.rig = null;
  }
};
var _mdg = new THREE6.Vector3();
var _mdV = new THREE6.Vector3(), _mdOne = new THREE6.Vector3(1, 1, 1), _mdM = new THREE6.Matrix4(), _mdM2 = new THREE6.Matrix4();
function T6clamp(v, lo = 0.6, hi = 1.6) {
  return Math.min(hi, Math.max(lo, v));
}
