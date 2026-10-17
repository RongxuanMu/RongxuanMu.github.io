// src/worlds/robotzoo.js
// Robot Zoo XR: open-source humanoid and quadruped robots running the very policies their makers (and the community) trained,
// simulated live in MuJoCo WASM with ONNX Runtime Web, on your table or life-size in your room.
//
// Every robot runs its published policy with the observation, gains and timing of its own deploy code:
//   Pollen Microduck   Microduck XR itself (microduck.js): every microduck_rl policy, the same stage and console
//   Unitree G1 dance   whole-body motion tracking (Axellwppr/humanoid-policy-viewer), 50 Hz, 623 inputs
//   Unitree G1 / H1 / H1-2   unitree_rl_gym walking, LSTM, 50 Hz (deploy_mujoco.py)
//   Booster T1         booster_gym walking, 50 Hz (play_mujoco.py)
//   AgiBot X1          agibot_x1_infer walking, 100 Hz over a 66-frame history, 1 kHz PD with filtered targets
//   Berkeley Humanoid Lite   biped walking, 50 Hz, 2 kHz PD (sim2sim/play_mujoco.py)
//   Unitree Go2 / B2, AgiBot D1   robot_lab velocity walking as rl_sar deploys it, 50 Hz, 200 Hz PD
// The Unitree, Booster and rl_sar TorchScript policies were converted to ONNX (weights unchanged, checked against a
// NumPy forward pass); each policy was checked in desktop MuJoCo walking, turning and standing before shipping.
import { toCreasedNormals as rzCreased } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoomEnvironment as RzRoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
var RZ_URL = {
  assets: "https://rongxuanmu.com/robot-zoo-xr/assets/"
};
var RZ_UNITREE_KP = {
  g1_walk: [100, 100, 100, 150, 40, 40, 100, 100, 100, 150, 40, 40],
  h1: [150, 150, 150, 200, 40, 150, 150, 150, 200, 40],
  h1_2: [200, 200, 200, 300, 40, 40, 200, 200, 200, 300, 40, 40]
};
var RZ_UNITREE_KD = {
  g1_walk: [2, 2, 2, 4, 2, 2, 2, 2, 2, 4, 2, 2],
  h1: [2, 2, 2, 4, 2, 2, 2, 2, 4, 2],
  h1_2: [2.5, 2.5, 2.5, 4, 2, 2, 2.5, 2.5, 2.5, 4, 2, 2]
};
var RZ_UNITREE_DEF = {
  g1_walk: [-0.1, 0, 0, 0.3, -0.2, 0, -0.1, 0, 0, 0.3, -0.2, 0],
  h1: [0, 0, -0.1, 0.3, -0.2, 0, 0, -0.1, 0.3, -0.2],
  h1_2: [0, -0.16, 0, 0.36, -0.2, 0, 0, -0.16, 0, 0.36, -0.2, 0]
};
var RZ_ROBOTS = [
  // Microduck is Microduck XR itself: its own assets, every policy (walk, sit, roll, peck, kicks, skates)
  { id: "microduck", label: "Microduck", name: "Microduck", maker: "Pollen Robotics", kind: "duck", height: 0.25,
    policy: "microduck_rl \u00b7 walk, sit, roll, peck, kick, skate \u00b7 Apache-2.0" },
  { id: "g1", label: "G1 dance", name: "Unitree G1", maker: "Unitree 宇树", kind: "track", height: 1.32, dt: 5e-3, dec: 4, vmax: 0, root: "pelvis",
    policy: "Whole-body motion tracking · humanoid-policy-viewer · Apache-2.0" },
  { id: "g1_walk", label: "G1 walk", name: "Unitree G1", maker: "Unitree 宇树", kind: "unitree", height: 1.32, dt: 2e-3, dec: 10, vmax: 0.8, root: "pelvis",
    policy: "unitree_rl_gym walking (LSTM) · BSD-3-Clause" },
  { id: "h1", label: "H1", name: "Unitree H1", maker: "Unitree 宇树", kind: "unitree", height: 1.8, dt: 2e-3, dec: 10, vmax: 0.8, root: "pelvis",
    policy: "unitree_rl_gym walking (LSTM) · BSD-3-Clause" },
  { id: "h1_2", label: "H1-2", name: "Unitree H1-2", maker: "Unitree 宇树", kind: "unitree", height: 1.75, dt: 2e-3, dec: 10, vmax: 0.8, root: "pelvis",
    policy: "unitree_rl_gym walking (LSTM) · BSD-3-Clause" },
  { id: "t1", label: "Booster T1", name: "Booster T1", maker: "Booster Robotics 加速进化", kind: "t1", height: 1.2, dt: 2e-3, dec: 10, vmax: 0.8, root: "Trunk",
    policy: "booster_gym walking · Apache-2.0" },
  { id: "x1", label: "AgiBot X1", name: "AgiBot X1 灵犀", maker: "AgiBot 智元", kind: "x1", height: 1.3, dt: 1e-3, dec: 10, vmax: 0.6, root: "x1-body", tone: [15000554, 3421244],
    policy: "agibot_x1_infer walking · Mulan PSL v2" },
  { id: "bhl", label: "Berkeley Lite", name: "Berkeley Humanoid Lite", maker: "UC Berkeley Hybrid Robotics", kind: "bhl", height: 0.8, dt: 5e-4, dec: 40, vmax: 0.5, root: "base",
    policy: "Berkeley Humanoid Lite biped · MIT · model CC BY-SA 4.0" },
  { id: "go2", label: "Go2", name: "Unitree Go2", maker: "Unitree 宇树", kind: "quad", height: 0.4, dt: 5e-3, dec: 4, vmax: 0.8, root: "base_link",
    quad: { z0: 0.337, kp: 20, kd: 0.5, tmax: [23.5, 23.5, 23.5], wmax: [30, 30, 30], clip: 100 },
    policy: "robot_lab walking via rl_sar · Apache-2.0 · model BSD-3-Clause" },
  { id: "b2", label: "B2", name: "Unitree B2", maker: "Unitree 宇树", kind: "quad", height: 0.65, dt: 5e-3, dec: 4, vmax: 0.8, root: "base_link",
    quad: { z0: 0.546, kp: 160, kd: 5, tmax: [200, 200, 320], wmax: [23, 23, 14], clip: 100 },
    policy: "robot_lab walking via rl_sar · Apache-2.0 · model BSD-3-Clause" },
  { id: "d1", label: "AgiBot D1", name: "AgiBot D1", maker: "AgiBot 智元", kind: "quad", height: 0.4, dt: 5e-3, dec: 4, vmax: 0.8, root: "base_link",
    quad: { z0: 0.327, kp: 20, kd: 0.8, tmax: [33.5, 33.5, 33.5], wmax: [21, 21, 21], clip: 3 },
    policy: "robot_lab walking via rl_sar · Apache-2.0" }
];
// - small math on MuJoCo arrays (quaternions are w, x, y, z) -
function rzGravity(q, o = 0) {
  const w = q[o], x = q[o + 1], y = q[o + 2], z = q[o + 3];
  return [2 * (-z * x + w * y), -2 * (z * y + w * x), 1 - 2 * (w * w + z * z)];
}
function rzYaw(q, o = 3) {
  const w = q[o], x = q[o + 1], y = q[o + 2], z = q[o + 3];
  return Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
}
// - one policy session: the first input takes the observation; recurrent ONNX (h_in / c_in) keep their state -
async function rzSession(ort, url) {
  const sess = await ort.InferenceSession.create(url, { executionProviders: ["wasm"] });
  const rec = sess.inputNames.includes("h_in");
  const s = {
    sess,
    reset() {
      if (rec) s.h = new ort.Tensor("float32", new Float32Array(64), [1, 1, 64]), s.c = new ort.Tensor("float32", new Float32Array(64), [1, 1, 64]);
    },
    async run(obs, outName = null) {
      const feed = { [sess.inputNames[0]]: new ort.Tensor("float32", obs, [1, obs.length]) };
      if (rec) feed.h_in = s.h, feed.c_in = s.c;
      const out = await sess.run(feed);
      if (rec) s.h = out.h_out, s.c = out.c_out;
      return out[outName ?? sess.outputNames[0]].data;
    }
  };
  s.reset();
  return s;
}
// - controllers: setup(S) poses the robot, policy(S) runs one inference, torque(S) writes data.ctrl every
// physics step (the PD the deploy code runs at its physics rate) -
var RZ_CONTROLLERS = {
  // unitree_rl_gym deploy_mujoco.py
  unitree: {
    setup(S) {
      const id = S.R.id;
      S.kp = RZ_UNITREE_KP[id];
      S.kd = RZ_UNITREE_KD[id];
      S.def = RZ_UNITREE_DEF[id];
      S.n = S.def.length;
      S.action = new Float32Array(S.n);
      S.target = Float64Array.from(S.def);
    },
    async policy(S) {
      const q = S.data.qpos, v = S.data.qvel, n = S.n, o = new Float32Array(9 + 3 * n + 2), g = rzGravity(q, 3);
      for (let i = 0; i < 3; i++) o[i] = v[3 + i] * 0.25, o[3 + i] = g[i];
      o[6] = S.cmd[0] * 2;
      o[7] = S.cmd[1] * 2;
      o[8] = S.cmd[2] * 0.25;
      for (let j = 0; j < n; j++) {
        o[9 + j] = q[7 + j] - S.def[j];
        o[9 + n + j] = v[6 + j] * 0.05;
        o[9 + 2 * n + j] = S.action[j];
      }
      const ph = S.t % 0.8 / 0.8;
      o[9 + 3 * n] = Math.sin(2 * Math.PI * ph);
      o[10 + 3 * n] = Math.cos(2 * Math.PI * ph);
      const a = await S.pol.run(o, "actions");
      for (let j = 0; j < n; j++) S.action[j] = a[j], S.target[j] = a[j] * 0.25 + S.def[j];
    },
    torque(S) {
      const q = S.data.qpos, v = S.data.qvel, c = S.data.ctrl;
      for (let j = 0; j < S.n; j++) c[j] = (S.target[j] - q[7 + j]) * S.kp[j] - v[6 + j] * S.kd[j];
    }
  },
  // booster_gym play_mujoco.py
  t1: {
    setup(S) {
      const { model, mujoco } = S, names = Array.from({ length: model.nu }, (_, i) => mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_ACTUATOR.value, i));
      S.def = names.map((n) => n.includes("Hip_Pitch") ? -0.2 : n.includes("Knee_Pitch") ? 0.4 : n.includes("Ankle_Pitch") ? -0.25 : 0);
      S.kp = names.map((n) => n.includes("Ankle") ? 50 : 200);
      S.kd = names.map((n) => n.includes("Ankle") ? 1 : 5);
      const q = S.data.qpos;
      q.set([0, 0, 0.72, 1, 0, 0, 0]);
      S.def.forEach((d, j) => q[7 + j] = d);
      S.quatAdr = model.sensor("orientation").adr;
      S.gyroAdr = model.sensor("angular-velocity").adr;
      S.action = new Float32Array(12);
      S.target = Float64Array.from(S.def);
      S.gait = 0;
      S.freq = 0;
    },
    async policy(S) {
      const sd = S.data.sensordata, q = S.data.qpos, v = S.data.qvel, o = new Float32Array(47), g = rzGravity(sd, S.quatAdr);
      S.freq = S.cmd[0] || S.cmd[1] || S.cmd[2] ? 1.5 : 0;
      for (let i = 0; i < 3; i++) o[i] = g[i], o[3 + i] = sd[S.gyroAdr + i], o[6 + i] = S.cmd[i];
      o[9] = S.freq ? Math.cos(2 * Math.PI * S.gait) : 0;
      o[10] = S.freq ? Math.sin(2 * Math.PI * S.gait) : 0;
      for (let j = 0; j < 12; j++) o[11 + j] = q[7 + j] - S.def[j], o[23 + j] = v[6 + j] * 0.1, o[35 + j] = S.action[j];
      const a = await S.pol.run(o);
      for (let j = 0; j < 12; j++) S.action[j] = Math.max(-1, Math.min(1, a[j])), S.target[j] = S.def[j] + S.action[j];
    },
    torque(S) {
      const q = S.data.qpos, v = S.data.qvel, c = S.data.ctrl, cr = S.model.actuator_ctrlrange;
      for (let j = 0; j < 12; j++) c[j] = Math.max(cr[2 * j], Math.min(cr[2 * j + 1], S.kp[j] * (S.target[j] - q[7 + j]) - S.kd[j] * v[6 + j]));
    },
    tick(S, dt) {
      S.gait = (S.gait + dt * S.freq) % 1;
    }
  },
  // agibot_x1_infer: walk_leg = [pd_zero, pd_stand, rl_walk_leg] at 1 kHz; serial leg joints get low-pass
  // filtered position targets, the parallel ankles low-pass filtered torques
  x1: {
    setup(S) {
      const q = S.data.qpos;
      q.fill(0);
      q[2] = 0.68;
      q[3] = 1;
      for (const [j, a] of Object.entries(RZ_X1.stand)) q[7 + +j] = a;
      RZ_X1.init.forEach((a, k) => q[7 + 17 + k] = a);
      S.mujoco.mj_forward(S.model, S.data);
      S.lpf = RZ_X1.init.map((a, k) => rzLpf(RZ_X1.parallel.has(k) ? 0 : a));
      S.quatAdr = S.model.sensor("body-orientation").adr;
      S.gyroAdr = S.model.sensor("body-angular-velocity").adr;
      S.action = new Float32Array(12);
      S.last = new Float32Array(12);
      S.hist = null;
    },
    async policy(S) {
      const sd = S.data.sensordata, q = S.data.qpos, v = S.data.qvel, c = S.cmd;
      const phase = Math.hypot(c[0], c[1], c[2]) <= 0.05 ? 0 : S.t / 0.7;
      const w = sd[S.quatAdr], x = sd[S.quatAdr + 1], y = sd[S.quatAdr + 2], z = sd[S.quatAdr + 3];
      const o = new Float32Array(47);
      o.set([Math.sin(2 * Math.PI * phase), Math.cos(2 * Math.PI * phase), c[0] * 2, c[1] * 2, c[2]]);
      for (let k = 0; k < 12; k++) o[5 + k] = q[24 + k] - RZ_X1.init[k], o[17 + k] = v[23 + k] * 0.05, o[29 + k] = S.last[k];
      for (let i = 0; i < 3; i++) o[41 + i] = sd[S.gyroAdr + i];
      o[44] = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
      o[45] = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
      o[46] = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
      if (!S.hist) {
        const o0 = o.slice();
        o0.fill(0, 29, 41);
        S.hist = new Float32Array(47 * 66);
        for (let h = 0; h < 66; h++) S.hist.set(o0, h * 47);
      }
      S.hist.copyWithin(0, 47);
      S.hist.set(o, 47 * 65);
      const a = await S.pol.run(S.hist.map((u) => Math.max(-100, Math.min(100, u))));
      for (let k = 0; k < 12; k++) S.action[k] = a[k];
    },
    torque(S) {
      const q = S.data.qpos, v = S.data.qvel, c = S.data.ctrl, X = RZ_X1;
      for (let j = 0; j < 29; j++) c[j] = X.zeroKp[j] * -q[7 + j] - X.zeroKd[j] * v[6 + j];
      for (const [j, a] of Object.entries(X.stand)) c[j] = 300 * (a - q[7 + +j]) - 0.6 * v[6 + +j];
      for (let k = 0; k < 12; k++) {
        const j = 17 + k, des = S.action[k] * 0.5 + X.init[k];
        if (X.parallel.has(k)) c[j] = S.lpf[k](X.kp[k] * (des - q[7 + j]) - X.kd[k] * v[6 + j]);
        else c[j] = X.kp[k] * (S.lpf[k](des) - q[7 + j]) - X.kd[k] * v[6 + j];
        S.last[k] = S.action[k];
      }
    }
  },
  // robot_lab velocity walking (Isaac Lab) as rl_sar deploys it: 45 inputs from fresh qpos / qvel (sensordata
  // lags a physics step), PD every 5 ms clamped to the trained DC-motor torque-speed box
  quad: {
    setup(S) {
      const q = S.data.qpos, Q = RZ_QUAD;
      q.fill(0);
      q.set([0, 0, S.R.quad.z0, 1, 0, 0, 0]);
      Q.def.forEach((d, i) => q[Q.qadr[i]] = d);
      S.data.qvel.fill(0);
      S.action = new Float32Array(12);
      S.target = Float64Array.from(Q.def);
      S.hold = 0;
    },
    async policy(S) {
      const q = S.data.qpos, v = S.data.qvel, Q = RZ_QUAD, P = S.R.quad, o = new Float32Array(45), g = rzGravity(q, 3);
      // trained on heading commands: with no turn asked it holds its heading (Go2 otherwise drifts round, trotting)
      const yaw = rzYaw(q), c = S.cmd;
      let wz = c[2];
      if (Math.abs(wz) < 0.02) wz = T6clamp(MD_WRAP(S.hold - yaw), -1, 1);
      else S.hold = yaw;
      for (let i = 0; i < 3; i++) o[i] = v[3 + i] * 0.25, o[3 + i] = g[i];
      o[6] = c[0];
      o[7] = c[1];
      o[8] = wz;
      for (let i = 0; i < 12; i++) o[9 + i] = q[Q.qadr[i]] - Q.def[i], o[21 + i] = v[Q.vadr[i]] * 0.05, o[33 + i] = S.action[i];
      const a = await S.pol.run(o.map((u) => Math.max(-100, Math.min(100, u))));
      for (let i = 0; i < 12; i++) S.action[i] = Math.max(-P.clip, Math.min(P.clip, a[i])), S.target[i] = Q.def[i] + S.action[i] * Q.scale[i];
    },
    torque(S) {
      const q = S.data.qpos, v = S.data.qvel, c = S.data.ctrl, Q = RZ_QUAD, P = S.R.quad;
      for (let i = 0; i < 12; i++) {
        const dq = v[Q.vadr[i]], tm = P.tmax[i % 3], wm = P.wmax[i % 3];
        const hi = T6clamp(tm * (1 - dq / wm), 0, tm), lo = T6clamp(tm * (-1 - dq / wm), -tm, 0);
        c[i] = T6clamp(P.kp * (S.target[i] - q[Q.qadr[i]]) - P.kd * dq, lo, hi);
      }
    }
  },
  // Berkeley Humanoid Lite: MujocoSimulator + RlController (sensordata: joint pos, vel, torque, then imu)
  bhl: {
    setup(S) {
      const q = S.data.qpos;
      q.set([0, 0, 0, 1, 0, 0, 0]);
      RZ_BHL_DEF.forEach((d, j) => q[7 + j] = d);
      S.prev = new Float32Array(12);
      S.target = Float64Array.from(RZ_BHL_DEF);
    },
    async policy(S) {
      const sd = S.data.sensordata, n = S.model.nu, o = new Float32Array(45), g = rzGravity(sd, 3 * n);
      o.set([S.cmd[0], S.cmd[1] * 0.5, S.cmd[2]]);
      for (let i = 0; i < 3; i++) o[3 + i] = sd[3 * n + 4 + i], o[6 + i] = g[i];
      for (let j = 0; j < 12; j++) o[9 + j] = sd[j] - RZ_BHL_DEF[j], o[21 + j] = sd[12 + j], o[33 + j] = S.prev[j];
      const a = await S.pol.run(o);
      for (let j = 0; j < 12; j++) S.prev[j] = a[j], S.target[j] = a[j] * 0.25 + RZ_BHL_DEF[j];
    },
    torque(S) {
      const sd = S.data.sensordata, c = S.data.ctrl;
      for (let j = 0; j < 12; j++) c[j] = Math.max(-5, Math.min(5, 20 * (S.target[j] - sd[j]) - 2 * sd[12 + j]));
    }
  }
};
// the quadrupeds: policy joint i is actuator i (FR, FL, RR, RL legs: hip, thigh, calf); the kinematic tree, and
// so qpos / qvel, runs FL, FR, RL, RR
var RZ_QUAD = {
  def: [0, 0.8, -1.5, 0, 0.8, -1.5, 0, 0.8, -1.5, 0, 0.8, -1.5],
  qadr: [10, 11, 12, 7, 8, 9, 16, 17, 18, 13, 14, 15],
  vadr: [9, 10, 11, 6, 7, 8, 15, 16, 17, 12, 13, 14],
  scale: [0.125, 0.25, 0.25, 0.125, 0.25, 0.25, 0.125, 0.25, 0.25, 0.125, 0.25, 0.25]
};
var RZ_BHL_DEF = [0, 0, -0.2, 0.4, -0.3, 0, 0, 0, -0.2, 0.4, -0.3, 0];
var RZ_X1 = {
  zeroKp: [700, 700, 700, 300, 300, 30, 300, 30, 30, 30, 300, 300, 30, 300, 30, 30, 30, 250, 250, 250, 250, 200, 100, 250, 250, 250, 250, 200, 100],
  zeroKd: [0.6, 0.6, 0.6, 0.6, 0.6, 0.1, 0.6, 0.1, 0.1, 0.1, 0.6, 0.6, 0.1, 0.6, 0.1, 0.1, 0.1, 0.4, 0.4, 0.4, 0.4, 0.6, 0.3, 0.4, 0.4, 0.4, 0.4, 0.6, 0.3],
  // pd_stand on the arms: shoulder pitch / roll and elbow pitch
  stand: { 3: 0.15, 4: -0.1, 6: 0.3, 10: 0.15, 11: -0.1, 13: 0.3 },
  init: [0.4, 0.05, -0.31, 0.49, -0.21, 0, -0.4, -0.05, 0.31, 0.49, -0.21, 0],
  kp: [30, 40, 35, 100, 35, 35, 30, 40, 35, 100, 35, 35],
  kd: [3, 3, 4, 10, 0.5, 0.5, 3, 3, 4, 10, 0.5, 0.5],
  parallel: /* @__PURE__ */ new Set([4, 5, 10, 11])
};
// agibot's digital_lp_filter: second-order Butterworth (bilinear), wc 100 rad/s at 1 kHz
function rzLpf(init, wc = 100, ts = 1e-3) {
  const den = 2500 * ts * ts * wc * wc + 7071 * ts * wc + 1e4;
  const a0 = 2500 * ts * ts * wc * wc / den, a1 = 5e3 * ts * ts * wc * wc / den, a2 = a0;
  const b1 = -(5e3 * ts * ts * wc * wc - 2e4) / den, b2 = -(2500 * ts * ts * wc * wc - 7071 * ts * wc + 1e4) / den;
  let i0 = init, i1 = init, o0 = init, o1 = init;
  return (x) => {
    const y = a0 * x + a1 * i0 + a2 * i1 + b1 * o0 + b2 * o1;
    i1 = i0;
    i0 = x;
    o1 = o0;
    o0 = y;
    return y;
  };
}
