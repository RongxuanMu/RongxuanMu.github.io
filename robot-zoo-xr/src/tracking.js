// - Unitree G1 whole-body motion tracking, ported from Axellwppr/humanoid-policy-viewer (Apache-2.0):
// TrackingHelper (reference clips aligned to the robot's current yaw / position, with a 100-step blend in) and
// the observation modules of tracking_policy_latest.json, in the same order and sizes (623 values) -
var rzQ = {
  norm([w, x, y, z]) {
    const n = Math.hypot(w, x, y, z) || 1;
    return [w / n, x / n, y / n, z / n];
  },
  inv([w, x, y, z]) {
    const n = w * w + x * x + y * y + z * z || 1;
    return [w / n, -x / n, -y / n, -z / n];
  },
  mul([aw, ax, ay, az], [bw, bx, by, bz]) {
    return [aw * bw - ax * bx - ay * by - az * bz, aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx, aw * bz + ax * by - ay * bx + az * bw];
  },
  applyInv([w, x, y, z], [vx, vy, vz]) {
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    return [vx - w * tx + (y * tz - z * ty), vy - w * ty + (z * tx - x * tz), vz - w * tz + (x * ty - y * tx)];
  },
  yaw([w, x, y, z]) {
    const a = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    return [Math.cos(a / 2), 0, 0, Math.sin(a / 2)];
  },
  rot6d(q) {
    const [w, x, y, z] = rzQ.norm(q);
    return [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y), 2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  },
  slerp(a, b, t) {
    a = rzQ.norm(a);
    b = rzQ.norm(b);
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) d = -d, b = b.map((v) => -v);
    if (1 - d < 1e-6) return rzQ.norm(a.map((v, i) => v + (b[i] - v) * t));
    const om = Math.acos(d), s = Math.sin(om);
    return a.map((v, i) => Math.sin((1 - t) * om) / s * v + Math.sin(t * om) / s * b[i]);
  }
};
function rzTracker(cfg, clips) {
  const map = cfg.policy_joint_names.map((n) => cfg.dataset_joint_names.indexOf(n));
  const toPolicy = (row) => Float32Array.from(map, (i) => row[i]);
  const T = {
    motions: {},
    ref: { j: [], p: [], q: [] },
    idx: 0,
    len: 0,
    name: "default",
    done: true,
    add(name, frames, n) {
      const W = cfg.width, j = [], p = [], q = [];
      for (let f = 0; f < n; f++) {
        const r = frames.subarray(f * W, (f + 1) * W);
        j.push(toPolicy(r));
        p.push(Array.from(r.subarray(29, 32)));
        q.push(Array.from(r.subarray(32, 36)));
      }
      T.motions[name] = { j, p, q };
    },
    // re-anchor a clip on the robot's current position and heading, then blend into its first frame
    start(name, st) {
      const m = T.motions[name], curJ = Array.from(st.jointPos), curP = Array.from(st.rootPos), curQ = Array.from(st.rootQuat);
      const qd = rzQ.mul(rzQ.yaw(curQ), rzQ.inv(rzQ.yaw(m.q[0])));
      const qdT = new THREE6.Quaternion(qd[1], qd[2], qd[3], qd[0]), p0 = new THREE6.Vector3(...m.p[0]), off = new THREE6.Vector3(curP[0], curP[1], m.p[0][2]);
      const P = m.p.map((r) => new THREE6.Vector3(...r).sub(p0).applyQuaternion(qdT).add(off).toArray());
      const Q = m.q.map((r) => {
        const a = qdT.clone().multiply(new THREE6.Quaternion(r[1], r[2], r[3], r[0]));
        return [a.w, a.x, a.y, a.z];
      });
      const steps = cfg.transition_steps, tj = [], tp = [], tq = [];
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1);
        tj.push(Float32Array.from(curJ, (v, k) => (1 - t) * v + t * m.j[0][k]));
        tp.push(curP.map((v, k) => (1 - t) * v + t * P[0][k]));
        tq.push(rzQ.slerp(curQ, Q[0], t));
      }
      T.ref = { j: [...tj, ...m.j], p: [...tp, ...P], q: [...tq, ...Q] };
      T.len = T.ref.j.length;
      T.idx = 0;
      T.name = name;
      T.done = T.len <= 1;
    },
    request(name, st) {
      if (!T.motions[name]) return false;
      if (T.name === "default" && T.done || name === "default") return T.start(name, st), true;
      return false;
    },
    advance() {
      if (T.len && T.idx < T.len - 1 && ++T.idx === T.len - 1) T.done = true;
    },
    future(steps) {
      return steps.map((s) => Math.min(T.len - 1, Math.max(0, T.idx + s)));
    }
  };
  T.add("default", Float32Array.from(cfg.default), 1);
  return T;
}
RZ_CONTROLLERS.track = {
  setup(S) {
    const { model, mujoco } = S, cfg = S.extra.cfg;
    S.cfg = cfg;
    S.n = cfg.policy_joint_names.length;
    S.qAdr = cfg.policy_joint_names.map((n) => model.jnt(n).qposadr);
    S.vAdr = cfg.policy_joint_names.map((n) => model.jnt(n).dofadr);
    // the actuator driving each policy joint
    const jid = cfg.policy_joint_names.map((n) => mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT.value, n));
    S.cAdr = jid.map((j) => {
      for (let a = 0; a < model.nu; a++) if (model.actuator_trnid[2 * a] === j) return a;
      return -1;
    });
    S.kp = cfg.stiffness;
    S.kd = cfg.damping;
    S.def = cfg.default_joint_pos;
    S.action = new Float32Array(S.n);
    S.target = Float64Array.from(S.def);
    S.tracker = rzTracker(cfg);
    for (const c of cfg.clips) if (S.extra.frames[c.file]) S.tracker.add(c.label, S.extra.frames[c.file], c.frames);
    S.jhist = null;
    S.ahist = Array.from({ length: 3 }, () => new Float32Array(S.n));
    S.tracker.request("default", RZ_CONTROLLERS.track.state(S));
  },
  state(S) {
    const q = S.data.qpos, v = S.data.qvel;
    return {
      jointPos: Float32Array.from(S.qAdr, (a) => q[a]),
      rootPos: [q[0], q[1], q[2]],
      rootQuat: [q[3], q[4], q[5], q[6]],
      rootAngVel: [v[3], v[4], v[5]]
    };
  },
  async policy(S) {
    const T = S.tracker, st = RZ_CONTROLLERS.track.state(S), F = S.cfg.future_steps, n = S.n;
    T.advance();
    // a finished clip hands back to the standing default
    if (T.done && T.name !== "default" && T.idx >= T.len - 1) T.request("default", st);
    const o = [];
    const ix = T.future(F);
    o.push(0);
    // TrackingCommandObsRaw: future root offsets in the current reference frame, relative rotations as 6D
    const bp = T.ref.p[ix[0]], bq = rzQ.norm(T.ref.q[ix[0]]);
    for (let i = 1; i < ix.length; i++) {
      const p = T.ref.p[ix[i]];
      o.push(...rzQ.applyInv(bq, [p[0] - bp[0], p[1] - bp[1], p[2] - bp[2]]));
    }
    const qi = rzQ.inv(rzQ.norm(st.rootQuat));
    for (const k of ix) o.push(...rzQ.rot6d(rzQ.mul(qi, rzQ.norm(T.ref.q[k]))));
    o.push(0, 0, 0);
    // TargetJointPosObs: targets, then target - current
    for (const k of ix) o.push(...T.ref.j[k]);
    for (const k of ix) for (let j = 0; j < n; j++) o.push(T.ref.j[k][j] - st.jointPos[j]);
    for (const k of ix) o.push(T.ref.p[k][2] + 0.035);
    for (const k of ix) o.push(...rzQ.applyInv(rzQ.norm(T.ref.q[k]), [0, 0, -1]));
    o.push(...st.rootAngVel);
    o.push(...rzQ.applyInv(rzQ.norm(st.rootQuat), [0, 0, -1]));
    // JointPos history at steps 0, 1, 2, 3, 4, 8
    if (!S.jhist) S.jhist = Array.from({ length: 9 }, () => st.jointPos.slice());
    S.jhist.pop();
    S.jhist.unshift(st.jointPos.slice());
    for (const s of [0, 1, 2, 3, 4, 8]) o.push(...S.jhist[s]);
    S.ahist.pop();
    S.ahist.unshift(S.action.slice());
    for (const a of S.ahist) o.push(...a);
    const a = await S.pol.run(Float32Array.from(o), S.pol.sess.outputNames[6]);
    for (let j = 0; j < n; j++) S.action[j] = Math.max(-10, Math.min(10, a[j])), S.target[j] = S.def[j] + S.cfg.action_scale[j] * S.action[j];
  },
  torque(S) {
    const q = S.data.qpos, v = S.data.qvel, c = S.data.ctrl, cr = S.model.actuator_ctrlrange;
    for (let j = 0; j < S.n; j++) {
      const a = S.cAdr[j];
      c[a] = Math.max(cr[2 * a], Math.min(cr[2 * a + 1], S.kp[j] * (S.target[j] - q[S.qAdr[j]]) - S.kd[j] * v[S.vAdr[j]]));
    }
  },
  play(S, label) {
    return S.tracker.request(label, RZ_CONTROLLERS.track.state(S));
  }
};
