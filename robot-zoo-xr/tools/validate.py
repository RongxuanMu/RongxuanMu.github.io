"""Headless sim2sim check of a locomotion policy: run the deploy loop for a few command phases and report
base height, distance and heading. Robot specs mirror each repo's own deploy code.
  python validate.py <robot>"""
import os
import sys

import mujoco
import numpy as np
import onnxruntime as ort

R = os.environ.get('RZ_WORK', '/tmp/rz') + '/robots'
OUT = os.environ.get('RZ_WORK', '/tmp/rz') + '/rz_out'


def grav(q):
    w, x, y, z = q
    return np.array([2 * (-z * x + w * y), -2 * (z * y + w * x), 1 - 2 * (w * w + z * z)])


def unitree(name, xml, n, kps, kds, default):
    return dict(xml=xml, onnx=f'{OUT}/unitree_{name}.onnx', n=n, kps=np.array(kps, np.float32), kds=np.array(kds, np.float32),
                default=np.array(default, np.float32), dt=0.002, dec=10, kind='unitree')


SPECS = {
    'bhl': dict(xml=f'{R}/Berkeley-Humanoid-Lite-Assets/data/robots/berkeley_humanoid/berkeley_humanoid_lite/mjcf/bhl_biped_scene.xml', dt=0.0005, dec=40, kind='bhl'),
    'x1': dict(xml=f'{R}/agibot_x1_infer/src/module/sim_module/model/mjcf/xyber_x1_flat.xml', dt=0.001, dec=10, kind='x1'),
    't1': dict(xml=f'{R}/booster_gym/resources/T1/T1_locomotion.xml', dt=0.002, dec=10, kind='t1'),
    'g1': unitree('g1', f'{R}/unitree_rl_gym/resources/robots/g1_description/scene.xml', 12,
                  [100, 100, 100, 150, 40, 40, 100, 100, 100, 150, 40, 40], [2, 2, 2, 4, 2, 2, 2, 2, 2, 4, 2, 2],
                  [-0.1, 0, 0, 0.3, -0.2, 0, -0.1, 0, 0, 0.3, -0.2, 0]),
    'h1': unitree('h1', f'{R}/unitree_rl_gym/resources/robots/h1/scene.xml', 10,
                  [150, 150, 150, 200, 40, 150, 150, 150, 200, 40], [2, 2, 2, 4, 2, 2, 2, 2, 4, 2],
                  [0, 0, -0.1, 0.3, -0.2, 0, 0, -0.1, 0.3, -0.2]),
    'h1_2': unitree('h1_2', f'{R}/unitree_rl_gym/resources/robots/h1_2/scene.xml', 12,
                    [200, 200, 200, 300, 40, 40, 200, 200, 200, 300, 40, 40], [2.5, 2.5, 2.5, 4, 2, 2, 2.5, 2.5, 2.5, 4, 2, 2],
                    [0, -0.16, 0, 0.36, -0.2, 0, 0, -0.16, 0, 0.36, -0.2, 0]),
}


class T1:
    """booster_gym play_mujoco.py"""
    def __init__(self, s, m, d):
        self.m, self.d = m, d
        self.sess = ort.InferenceSession(f'{OUT}/booster_t1.onnx')
        names = [mujoco.mj_id2name(m, mujoco.mjtObj.mjOBJ_ACTUATOR, i) for i in range(m.nu)]
        self.default = np.array([-0.2 if 'Hip_Pitch' in n else 0.4 if 'Knee_Pitch' in n else -0.25 if 'Ankle_Pitch' in n else 0 for n in names], np.float32)
        self.kp = np.array([200 if 'Hip' in n else 200 if 'Knee' in n else 50 for n in names], np.float32)
        self.kd = np.array([5 if 'Hip' in n else 5 if 'Knee' in n else 1 for n in names], np.float32)
        d.qpos[:] = np.concatenate([[0, 0, 0.72, 1, 0, 0, 0], self.default])
        mujoco.mj_forward(m, d)
        self.actions = np.zeros(12, np.float32)
        self.target = self.default.copy()
        self.gait = 0.0
        self.freq = 0.0

    def control(self, cmd):
        d = self.d
        self.freq = 0.0 if not any(cmd) else 1.5
        q = d.sensor('orientation').data
        obs = np.zeros(47, np.float32)
        obs[0:3] = grav(q)
        obs[3:6] = d.sensor('angular-velocity').data
        obs[6:9] = cmd
        on = self.freq > 1e-8
        obs[9] = np.cos(2 * np.pi * self.gait) * on
        obs[10] = np.sin(2 * np.pi * self.gait) * on
        obs[11:23] = d.qpos[7:] - self.default
        obs[23:35] = d.qvel[6:] * 0.1
        obs[35:47] = self.actions
        self.actions = np.clip(self.sess.run(None, {'obs': obs[None]})[0][0], -1, 1)
        self.target = self.default + self.actions

    def torque(self):
        m, d = self.m, self.d
        return np.clip(self.kp * (self.target - d.qpos[7:]) - self.kd * d.qvel[6:], m.actuator_ctrlrange[:, 0], m.actuator_ctrlrange[:, 1])

    def tick(self, dt):
        self.gait = np.fmod(self.gait + dt * self.freq, 1.0)


class LPF:
    """agibot digital_lp_filter: 2nd-order Butterworth, bilinear"""
    def __init__(self, wc=100.0, ts=0.001):
        den = 2500 * ts * ts * wc * wc + 7071 * ts * wc + 10000
        self.a = (2500 * ts * ts * wc * wc / den, 5000 * ts * ts * wc * wc / den, 2500 * ts * ts * wc * wc / den,
                  -(5000 * ts * ts * wc * wc - 20000) / den, -(2500 * ts * ts * wc * wc - 7071 * ts * wc + 10000) / den)
        self.i = [0.0, 0.0]
        self.o = [0.0, 0.0]
        self.y = 0.0

    def init(self, v):
        self.i = [v, v]
        self.o = [v, v]

    def input(self, x):
        a = self.a
        self.y = a[0] * x + a[1] * self.i[0] + a[2] * self.i[1] + a[3] * self.o[0] + a[4] * self.o[1]
        self.i = [x, self.i[0]]
        self.o = [self.y, self.o[0]]
        return self.y


class X1:
    """agibot_x1_infer: state walk_leg = controllers [pd_zero, pd_stand, rl_walk_leg], 1 kHz"""
    ZERO_KP = [700] * 3 + [300, 300, 30, 300, 30, 30, 30] * 2 + [250, 250, 250, 250, 200, 100] * 2
    ZERO_KD = [0.6] * 3 + [0.6, 0.6, 0.1, 0.6, 0.1, 0.1, 0.1] * 2 + [0.4, 0.4, 0.4, 0.4, 0.6, 0.3] * 2
    STAND = {3: 0.15, 4: -0.1, 6: 0.3, 10: 0.15, 11: -0.1, 13: 0.3}  # shoulder pitch / roll, elbow pitch (kp 300, kd 0.6)
    LEGS = list(range(17, 29))
    INIT = np.array([0.4, 0.05, -0.31, 0.49, -0.21, 0.0, -0.4, -0.05, 0.31, 0.49, -0.21, 0.0])
    KP = np.array([30, 40, 35, 100, 35, 35] * 2, float)
    KD = np.array([3, 3, 4, 10, 0.5, 0.5] * 2, float)
    PARALLEL = {4, 5, 10, 11}  # ankle pitch / roll: torque, filtered

    def __init__(self, s, m, d):
        self.m, self.d = m, d
        self.sess = ort.InferenceSession(f'{OUT}/agibot_x1.onnx')
        d.qpos[:] = 0
        d.qpos[2] = 0.68
        d.qpos[3] = 1
        for j, v in self.STAND.items():
            d.qpos[7 + j] = v
        d.qpos[7 + 17:7 + 29] = self.INIT
        mujoco.mj_forward(m, d)
        self.lpf = [LPF() for _ in range(12)]
        for k in range(12):
            self.lpf[k].init(0.0 if k in self.PARALLEL else d.qpos[7 + 17 + k])
        self.actions = np.zeros(12)
        self.last = np.zeros(12)
        self.hist = None
        self.t = 0.0
        self.cmd = (0, 0, 0)

    def control(self, cmd):
        d = self.d
        self.cmd = cmd
        phase = 0.0 if np.sqrt(cmd[0] ** 2 + cmd[1] ** 2 + cmd[2] ** 2) <= 0.05 else self.t
        phase /= 0.7
        w, x, y, z = d.sensor('body-orientation').data
        eul = [np.arctan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)), np.arcsin(np.clip(2 * (w * y - z * x), -1, 1)),
               np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))]
        q, dq = d.qpos[7 + 17:7 + 29], d.qvel[6 + 17:6 + 29]
        o = np.concatenate([[np.sin(2 * np.pi * phase), np.cos(2 * np.pi * phase), cmd[0] * 2, cmd[1] * 2, cmd[2]],
                            q - self.INIT, dq * 0.05, self.last, d.sensor('body-angular-velocity').data, eul]).astype(np.float32)
        if self.hist is None:
            o0 = o.copy()
            o0[5 + 24:5 + 36] = 0
            self.hist = np.tile(o0, 66)
        self.hist = np.concatenate([self.hist[47:], o])
        self.actions = np.clip(self.sess.run(None, {'input': np.clip(self.hist, -100, 100)[None]})[0][0], -100, 100)

    def torque(self):
        d = self.d
        q, dq = d.qpos[7:], d.qvel[6:]
        tau = np.array(self.ZERO_KP) * (0 - q) + np.array(self.ZERO_KD) * (0 - dq)
        for j, v in self.STAND.items():
            tau[j] = 300 * (v - q[j]) + 0.6 * (0 - dq[j])
        for k in range(12):
            j = 17 + k
            des = self.actions[k] * 0.5 + self.INIT[k]
            if k in self.PARALLEL:
                tau[j] = self.lpf[k].input(self.KP[k] * (des - q[j]) - self.KD[k] * dq[j])
            else:
                tau[j] = self.KP[k] * (self.lpf[k].input(des) - q[j]) - self.KD[k] * dq[j]
            self.last[k] = self.actions[k]
        return tau


class BHL:
    """Berkeley Humanoid Lite biped: MujocoSimulator + RlController, policy 50 Hz, PD every 0.5 ms"""
    DEF = np.array([0, 0, -0.2, 0.4, -0.3, 0, 0, 0, -0.2, 0.4, -0.3, 0], np.float32)

    def __init__(self, s, m, d):
        self.m, self.d = m, d
        self.sess = ort.InferenceSession(f'{OUT}/bhl_biped.onnx')
        self.key = self.sess.get_inputs()[0].name
        d.qpos[:3] = 0
        d.qpos[3:7] = [1, 0, 0, 0]
        d.qpos[7:] = self.DEF
        mujoco.mj_forward(m, d)
        self.prev = np.zeros(12, np.float32)
        self.target = self.DEF.copy()
        self.nu = m.nu

    def control(self, cmd):
        d, n = self.d, self.nu
        sd = d.sensordata
        quat, gyro = sd[3 * n:3 * n + 4], sd[3 * n + 4:3 * n + 7]
        obs = np.concatenate([[cmd[0], cmd[1] * 0.5, cmd[2]], gyro, grav(quat), sd[:12] - self.DEF, sd[12:24], self.prev]).astype(np.float32)
        a = self.sess.run(None, {self.key: obs[None]})[0][0]
        self.prev = a.astype(np.float32)
        self.target = a * 0.25 + self.DEF

    def torque(self):
        sd = self.d.sensordata
        return np.clip(20 * (self.target - sd[:12]) - 2 * sd[12:24], -5, 5)


class Unitree:
    def __init__(self, s, m, d):
        self.s, self.m, self.d = s, m, d
        self.sess = ort.InferenceSession(s['onnx'])
        self.h = np.zeros((1, 1, 64), np.float32)
        self.c = np.zeros((1, 1, 64), np.float32)
        self.action = np.zeros(s['n'], np.float32)
        self.target = s['default'].copy()
        self.t = 0.0

    def control(self, cmd):
        s, d, n = self.s, self.d, self.s['n']
        obs = np.zeros(9 + 3 * n + 2, np.float32)
        obs[:3] = d.qvel[3:6] * 0.25
        obs[3:6] = grav(d.qpos[3:7])
        obs[6:9] = np.array(cmd) * [2, 2, 0.25]
        obs[9:9 + n] = d.qpos[7:7 + n] - s['default']
        obs[9 + n:9 + 2 * n] = d.qvel[6:6 + n] * 0.05
        obs[9 + 2 * n:9 + 3 * n] = self.action
        ph = self.t % 0.8 / 0.8
        obs[9 + 3 * n:] = [np.sin(2 * np.pi * ph), np.cos(2 * np.pi * ph)]
        a, self.h, self.c = self.sess.run(None, {'obs': obs[None], 'h_in': self.h, 'c_in': self.c})
        self.action = a[0]
        self.target = self.action * 0.25 + s['default']

    def torque(self):
        s, d, n = self.s, self.d, self.s['n']
        return (self.target - d.qpos[7:7 + n]) * s['kps'] - d.qvel[6:6 + n] * s['kds']


def run(name, phases=((0.5, 0, 0, 4), (0, 0, 0.8, 3), (0, 0, 0, 3), (0.8, 0, 0, 4))):
    s = SPECS[name]
    # PACK=1: run the packed physics.xml instead of the source MJCF (it has to behave the same)
    xml = os.path.join(os.environ.get('RZ_WORK', '/tmp/rz'), 'rz_pack', {'g1': 'g1_walk'}.get(name, name), 'physics.xml') if os.environ.get('PACK') else s['xml']
    m = mujoco.MjModel.from_xml_path(xml)
    m.opt.timestep = s['dt']
    d = mujoco.MjData(m)
    if m.nkey:
        mujoco.mj_resetDataKeyframe(m, d, 0)
    mujoco.mj_forward(m, d)
    ctl = {'t1': T1, 'x1': X1, 'bhl': BHL}.get(s['kind'], Unitree)(s, m, d)
    step = 0
    print(f'{name}: nq {m.nq} nu {m.nu} start z {d.qpos[2]:.3f}')
    for vx, vy, wz, dur in phases:
        p0 = d.qpos[:2].copy()
        zmin = 9
        for _ in range(int(dur / s['dt'])):
            if step % s['dec'] == 0:
                ctl.control((vx, vy, wz))
            d.ctrl[:] = ctl.torque()
            mujoco.mj_step(m, d)
            ctl.t = getattr(ctl, 't', 0) + s['dt']
            if hasattr(ctl, 'tick'):
                ctl.tick(s['dt'])
            step += 1
            zmin = min(zmin, d.qpos[2])
        yaw = np.degrees(np.arctan2(2 * (d.qpos[3] * d.qpos[6] + d.qpos[4] * d.qpos[5]), 1 - 2 * (d.qpos[5] ** 2 + d.qpos[6] ** 2)))
        print(f'  cmd ({vx}, {vy}, {wz}) {dur}s: moved {np.linalg.norm(d.qpos[:2] - p0):.2f} m, z now {d.qpos[2]:.3f} min {zmin:.3f}, yaw {yaw:.0f}')


if __name__ == '__main__':
    for n in sys.argv[1:]:
        run(n)
