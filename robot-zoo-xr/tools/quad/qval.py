"""Headless check of rl_sar quadruped policies in MuJoCo, following rl_sar's rl_sim_mujoco + rl_sdk:
obs terms from sensordata (jointpos, jointvel, ..., imu framequat, imu gyro), joint_mapping policy<-MJCF,
PD torque kp*(default + a*scale - q) - kd*dq every physics step, policy every `dec` steps.
  python qval.py <robot> [xml] [dt] [dec]"""
import os, sys, json
import mujoco, numpy as np, onnxruntime as ort

W = os.environ['RZ_WORK']
Z = f'{W}/robots/rl_sar_zoo'
SPECS = {
    'go2': dict(xml=f'{Z}/go2_description/mjcf/scene.xml', onnx=f'{W}/qout/go2_himloco.onnx', terms=['commands', 'ang_vel', 'gravity', 'dof_pos', 'dof_vel', 'actions'],
                hist=6, cmd_scale=[2, 2, 0.25], kp=40, kd=1, tau=33.5, default=[0.1, 0.8, -1.5, -0.1, 0.8, -1.5, 0.1, 1.0, -1.5, -0.1, 1.0, -1.5],
                mapping=[3, 4, 5, 0, 1, 2, 9, 10, 11, 6, 7, 8], clip=100),
    'go2_rl': dict(xml=f'{Z}/go2_description/mjcf/scene.xml', onnx=f'{W}/qout/go2_robotlab.onnx', terms=['ang_vel', 'gravity', 'commands', 'dof_pos', 'dof_vel', 'actions'],
                hist=0, cmd_scale=[1, 1, 1], kp=20, kd=0.5, tau=23.5, vlim=30, default=[0, 0.8, -1.5] * 4, mapping=list(range(12)), clip=100),
    'b2': dict(xml=f'{Z}/b2_description/mjcf/scene.xml', onnx=f'{W}/qout/b2_robotlab.onnx', terms=['ang_vel', 'gravity', 'commands', 'dof_pos', 'dof_vel', 'actions'],
               hist=0, cmd_scale=[1, 1, 1], kp=160, kd=5, tau=[200, 200, 320] * 4, vlim=[23, 23, 14] * 4, default=[0, 0.8, -1.5] * 4, mapping=list(range(12)), clip=100),
    'd1': dict(xml=f'{Z}/d1_description/mjcf/scene.xml', onnx=f'{W}/qout/d1_robotlab.onnx', terms=['ang_vel', 'gravity', 'commands', 'dof_pos', 'dof_vel', 'actions'],
               hist=0, cmd_scale=[1, 1, 1], kp=20, kd=0.8, tau=33.5, vlim=21, default=[0, 0.8, -1.5] * 4, mapping=list(range(12)), clip=3),
}
SCALE = np.array([0.125, 0.25, 0.25] * 4, np.float32)


def rot_inv(q, v):  # rotate world vector v into body frame, q = w x y z
    w, x, y, z = q
    qv = np.array([x, y, z])
    a = v * (2 * w * w - 1)
    b = np.cross(qv, v) * w * 2
    c = qv * np.dot(qv, v) * 2
    return a - b + c


class Ctl:
    def __init__(self, s, m, d):
        self.s, self.m, self.d = s, m, d
        self.sess = ort.InferenceSession(s['onnx'])
        if os.environ.get('NOSELF'):  # no self-collision (Isaac Lab trains with enabled_self_collisions=False)
            for g in range(m.ngeom):
                if m.geom_bodyid[g] > 0 and m.geom_contype[g]:
                    m.geom_conaffinity[g] = 0
        self.n = 12
        self.map = np.array(s['mapping'])
        self.default = np.array(s['default'], np.float32)
        self.kp = np.broadcast_to(np.array(s['kp'], np.float32), 12)
        self.kd = np.broadcast_to(np.array(s['kd'], np.float32), 12)
        self.tau = np.broadcast_to(np.array(s['tau'], np.float32), 12)
        self.vlim = np.broadcast_to(np.array(s['vlim'], np.float32), 12) if s.get('vlim') and os.environ.get('DC', '1') == '1' else None
        self.actions = np.zeros(12, np.float32)
        self.target = self.default.copy()
        self.buf = None
        # stand at the default pose (rl_sar's GetUp ends there)
        d.qpos[:] = 0
        d.qpos[3] = 1
        jadr = [m.jnt_qposadr[m.actuator_trnid[self.map[i], 0]] for i in range(12)]
        self.jadr = np.array(jadr)
        self.vadr = np.array([m.jnt_dofadr[m.actuator_trnid[self.map[i], 0]] for i in range(12)])
        d.qpos[self.jadr] = self.default
        mujoco.mj_forward(m, d)
        # drop so the lowest foot touches the floor
        d.qpos[2] = s.get('z0', 0.0)
        mujoco.mj_forward(m, d)
        lo = min(d.geom_xpos[g][2] - (m.geom_size[g][0] if m.geom_type[g] == 2 else 0) for g in range(m.ngeom) if m.geom_bodyid[g] > 0)
        d.qpos[2] -= lo - 0.002
        mujoco.mj_forward(m, d)
        n = self.n
        self.quat_adr = m.sensor_adr[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_SENSOR, 'imu_quat')]
        self.gyro_adr = m.sensor_adr[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_SENSOR, 'imu_gyro')]

    def q(self):  # fresh joint state (sensordata lags one physics step)
        return self.d.qpos[self.jadr].astype(np.float32)

    def dq(self):
        return self.d.qvel[self.vadr].astype(np.float32)

    def control(self, cmd):
        s, sd = self.s, self.d.sensordata
        quat = self.d.qpos[3:7]  # base orientation; free-joint angular velocity qvel[3:6] is in the base frame
        parts = dict(commands=np.array(cmd, np.float32) * s['cmd_scale'], ang_vel=self.d.qvel[3:6] * 0.25,
                     gravity=rot_inv(quat, np.array([0, 0, -1.0])), dof_pos=self.q() - self.default, dof_vel=self.dq() * 0.05, actions=self.actions)
        o = np.clip(np.concatenate([parts[t] for t in s['terms']]).astype(np.float32), -100, 100)
        if s['hist']:
            if self.buf is None:
                self.buf = np.zeros((s['hist'], o.size), np.float32)  # rl_sar: history buffer starts at zeros
            self.buf = np.roll(self.buf, 1, 0)
            self.buf[0] = o
            x = self.buf.reshape(-1)  # newest first (observations_history [0..5], time priority)
        else:
            x = o
        self.last_in = x
        a = self.sess.run(None, {'obs': x[None]})[0][0]
        self.actions = np.clip(a, -s['clip'], s['clip']).astype(np.float32)
        self.target = self.default + self.actions * SCALE

    def torque(self):
        tau = self.kp * (self.target - self.q()) - self.kd * self.dq()
        if self.vlim is not None:  # Isaac Lab DCMotor: torque-speed limit
            v = self.dq()
            hi = np.clip(self.tau * (1 - v / self.vlim), 0, self.tau)
            lo = np.clip(self.tau * (-1 - v / self.vlim), -self.tau, 0)
            tau = np.clip(tau, lo, hi)
        else:
            tau = np.clip(tau, -self.tau, self.tau)
        out = np.zeros(self.m.nu)
        out[self.map] = tau
        return out


def run(name, xml=None, dt=0.005, dec=4, phases=((0, 0, 0, 2), (0.5, 0, 0, 4), (0, 0, 1.0, 4), (0, 0, 0, 2)), quiet=False, log=None, alpha=0.2, slew=None):
    """alpha: world.js command filter per policy step (tw += 0.2 * (want - tw)); slew: optional max change per second"""
    s = SPECS[name]
    m = mujoco.MjModel.from_xml_path(xml or s['xml'])
    m.opt.timestep = dt
    d = mujoco.MjData(m)
    ctl = Ctl(s, m, d)
    base = 1  # free body
    z_start = d.qpos[2]
    out = dict(robot=name, xml=xml or s['xml'], dt=dt, dec=dec, start_z=round(float(z_start), 3), phases=[])
    step = 0
    tw = np.zeros(3)
    upright_all = True
    for vx, vy, wz, dur in phases:
        p0 = d.qpos[:2].copy()
        y0 = np.arctan2(2 * (d.qpos[3] * d.qpos[6] + d.qpos[4] * d.qpos[5]), 1 - 2 * (d.qpos[5] ** 2 + d.qpos[6] ** 2))
        zmin, upmin, dyaw, yprev = 9, 1, 0.0, y0
        for _ in range(int(round(dur / dt))):
            if step % dec == 0:
                want = np.array([vx, vy, wz])
                if slew:
                    tw = tw + np.clip(want - tw, -slew * dt * dec, slew * dt * dec)
                else:
                    tw = tw + alpha * (want - tw)
                ctl.control(tuple(tw))
                if log is not None:
                    log.append(ctl.last_in.copy())
            d.ctrl[:] = ctl.torque()
            mujoco.mj_step(m, d)
            step += 1
            zmin = min(zmin, d.qpos[2])
            w, x, y, z = d.qpos[3:7]
            upmin = min(upmin, 1 - 2 * (x * x + y * y))  # body z . world z
            yc = np.arctan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
            dyaw += (yc - yprev + np.pi) % (2 * np.pi) - np.pi
            yprev = yc
        dyaw = np.degrees(dyaw)
        upright_all &= upmin > 0.7
        ph = dict(cmd=[vx, vy, wz], dur=dur, moved=round(float(np.linalg.norm(d.qpos[:2] - p0)), 3), z_end=round(float(d.qpos[2]), 3),
                  z_min=round(float(zmin), 3), yaw_change_deg=round(float(dyaw), 1), min_uprightness=round(float(upmin), 3))
        out['phases'].append(ph)
        if not quiet:
            print(f'  {name} cmd ({vx}, {vy}, {wz}) {dur}s: moved {ph["moved"]:.2f} m, z {ph["z_end"]:.3f} (min {ph["z_min"]:.3f}), yaw {dyaw:+.0f} deg, upright min {upmin:.2f}')
    out['upright'] = bool(upright_all)
    out['final_z'] = round(float(d.qpos[2]), 3)
    return out


if __name__ == '__main__':
    name = sys.argv[1]
    xml = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None
    dt = float(sys.argv[3]) if len(sys.argv) > 3 else 0.005
    dec = int(sys.argv[4]) if len(sys.argv) > 4 else 4
    r = run(name, xml, dt, dec)
    print(json.dumps(dict(upright=r['upright'], final_z=r['final_z'], start_z=r['start_z'])))
