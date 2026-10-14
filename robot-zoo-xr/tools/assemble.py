"""Copy the packed robots, their policies and the G1 motion clips into robot-zoo-xr/assets.
Motion clips are trimmed and stored as float32 frames of [joint_pos (29, dataset order), root_pos (3), root_quat wxyz (4)]."""
import json
import os
import shutil

import numpy as np

T = os.environ.get('RZ_WORK', '/tmp/rz')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets')
R = f'{T}/robots'
POL = {
    'g1': f'{R}/humanoid-policy-viewer/public/examples/checkpoints/g1/policy_latest.onnx',
    'g1_walk': f'{T}/rz_out/unitree_g1.onnx', 'h1': f'{T}/rz_out/unitree_h1.onnx', 'h1_2': f'{T}/rz_out/unitree_h1_2.onnx',
    't1': f'{T}/rz_out/booster_t1.onnx', 'x1': f'{T}/rz_out/agibot_x1.onnx', 'bhl': f'{T}/rz_out/bhl_biped.onnx',
}
LICENSES = {
    'g1': (f'{R}/humanoid-policy-viewer/LICENSE', 'Axellwppr/humanoid-policy-viewer (Apache-2.0); G1 model: Unitree (BSD-3-Clause)'),
    'g1_walk': (None, 'unitreerobotics/unitree_rl_gym (BSD-3-Clause)'), 'h1': (None, 'unitreerobotics/unitree_rl_gym (BSD-3-Clause)'),
    'h1_2': (None, 'unitreerobotics/unitree_rl_gym (BSD-3-Clause)'), 't1': (None, 'BoosterRobotics/booster_gym (Apache-2.0)'),
    'x1': (None, 'AgibotTech/agibot_x1_infer (Mulan PSL v2)'), 'bhl': (None, 'HybridRobotics/Berkeley-Humanoid-Lite (MIT); robot model: Berkeley-Humanoid-Lite-Assets (CC BY-SA 4.0)'),
}
LIC_FILES = {k: [f'{R}/unitree_rl_gym/LICENSE'] for k in ('g1_walk', 'h1', 'h1_2')}
LIC_FILES.update(g1=[f'{R}/humanoid-policy-viewer/LICENSE', f'{R}/humanoid-policy-viewer/LICENSES/Unitree-BSD-3-Clause.txt'],
                 t1=[f'{R}/booster_gym/LICENSE'], x1=[f'{R}/agibot_x1_infer/LICENSE.txt'],
                 bhl=[f'{R}/Berkeley-Humanoid-Lite/LICENCE', f'{R}/Berkeley-Humanoid-Lite-Assets/LICENCE'])
for rid, pol in POL.items():
    src = f'{T}/rz_pack/{rid}'
    dst = f'{OUT}/{rid}'
    if os.path.exists(dst):
        shutil.rmtree(dst)
    os.makedirs(dst)
    for f in ('physics.xml', 'visual.bin', 'visual.json'):
        shutil.copy(f'{src}/{f}', dst)
    if os.path.isdir(f'{src}/m') and os.listdir(f'{src}/m'):
        shutil.copytree(f'{src}/m', f'{dst}/m')
    shutil.copy(pol, f'{dst}/policy.onnx')
    open(f'{dst}/SOURCE.txt', 'w').write(LICENSES[rid][1] + '\n')
    for lic in LIC_FILES.get(rid, []):
        shutil.copy(lic, f'{dst}/{os.path.basename(os.path.dirname(lic))}-{os.path.basename(lic)}')

# G1 motions: (label, file, start s, length s)
MD = f'{R}/humanoid-policy-viewer/public/examples/checkpoints/g1/motions'
CLIPS = [('Dance', 'dance1_subject1.json', 4, 30), ('Dance 2', 'dance2_subject1.json', 4, 30), ('Tai chi', '12_04.json', 0, 30),
         ('Kung fu', 'fight1_subject2.json', 2, 25), ('Jumps', 'jumps1_subject1.json', 2, 20), ('Run', 'run1_subject2.json', 2, 16),
         ('Walk', 'walk1_subject1.json', 2, 20), ('Get up', 'fallAndGetUp1_subject1.json', 0, 30), ('Cartwheel', '90_02.json', 0, 99),
         ('Jump kick', '75_16.json', 0, 99), ('Backflip', '90_19.json', 0, 99), ('Handspring', '90_14.json', 0, 99), ('Dive roll', '127_23.json', 0, 99)]
os.makedirs(f'{OUT}/g1/motions', exist_ok=True)
index = []
for label, f, start, length in CLIPS:
    c = json.load(open(f'{MD}/{f}'))
    jp, rp, rq = (np.array(c[k], np.float32) for k in ('joint_pos', 'root_pos', 'root_quat'))
    a, b = int(start * 50), min(len(jp), int((start + length) * 50))
    frames = np.concatenate([jp[a:b], rp[a:b], rq[a:b]], 1).astype(np.float32)
    name = os.path.splitext(f)[0]
    frames.tofile(f'{OUT}/g1/motions/{name}.bin')
    index.append(dict(label=label, file=f'{name}.bin', frames=int(b - a)))
d = json.load(open(f'{MD}/default.json'))
default = np.concatenate([np.array(d['joint_pos'], np.float32)[:1], np.array(d['root_pos'], np.float32)[:1], np.array(d['root_quat'], np.float32)[:1]], 1)
cfg = json.load(open(f'{R}/humanoid-policy-viewer/public/examples/checkpoints/g1/tracking_policy_latest.json'))
json.dump(dict(fps=50, width=36, default=default[0].round(6).tolist(), clips=index,
               policy_joint_names=cfg['policy_joint_names'], dataset_joint_names=cfg['tracking']['dataset_joint_names'],
               action_scale=cfg['action_scale'], stiffness=cfg['stiffness'], damping=cfg['damping'], default_joint_pos=cfg['default_joint_pos'],
               transition_steps=cfg['tracking']['transition_steps'], future_steps=cfg['tracking']['future_steps'], obs=cfg['obs_config']['policy']),
          open(f'{OUT}/g1/tracking.json', 'w'), separators=(',', ':'))
total = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
print(f'assets: {total / 1048576:.1f} MB')
for rid in POL:
    s = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(f'{OUT}/{rid}') for f in fs)
    print(f'  {rid}: {s / 1048576:.2f} MB')
