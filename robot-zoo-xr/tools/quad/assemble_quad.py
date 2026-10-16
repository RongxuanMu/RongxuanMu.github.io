import os, shutil
W = os.environ['RZ_WORK']; R = f'{W}/robots'
OUT = '/home/user/RongxuanMu.github.io/robot-zoo-xr/assets'
SRC = {
 'go2': ('go2_robotlab.onnx', 'Unitree Go2 walking policy: fan-ziqi/rl_sar policy/go2/robot_lab/policy.pt (rl_sar 376d42c, Apache-2.0), trained with fan-ziqi/robot_lab (Apache-2.0); converted TorchScript -> ONNX, weights unchanged.\n'
         'Robot model: unitreerobotics/unitree_mujoco unitree_robots/go2 (1eb6642, BSD-3-Clause, Unitree Robotics), as shipped in fan-ziqi/rl_sar_zoo.\n',
         [f'{R}/rl_sar/LICENSE', f'{R}/robot_lab/LICENSE', f'{R}/unitree_mujoco/LICENSE']),
 'b2': ('b2_robotlab.onnx', 'Unitree B2 walking policy: fan-ziqi/rl_sar policy/b2/robot_lab/policy.pt (rl_sar 376d42c, Apache-2.0), trained with fan-ziqi/robot_lab (Apache-2.0); converted TorchScript -> ONNX, weights unchanged.\n'
         'Robot model: unitreerobotics/unitree_mujoco unitree_robots/b2 (1eb6642, BSD-3-Clause, Unitree Robotics), as shipped in fan-ziqi/rl_sar_zoo.\n',
         [f'{R}/rl_sar/LICENSE', f'{R}/robot_lab/LICENSE', f'{R}/unitree_mujoco/LICENSE']),
 'd1': ('d1_robotlab.onnx', 'AgiBot D1 walking policy: fan-ziqi/rl_sar policy/d1/robot_lab/policy.pt (rl_sar 376d42c, Apache-2.0), trained with fan-ziqi/robot_lab (Apache-2.0); converted TorchScript -> ONNX, weights unchanged.\n'
         'Robot model: fan-ziqi/rl_sar_zoo d1_description/mjcf (7dd30bd), converted from the D1 URDF distributed in fan-ziqi/robot_lab (source/robot_lab/data/Robots/agibot/d1, Apache-2.0 repository licence; no separate AgiBot licence file).\n',
         [f'{R}/rl_sar/LICENSE', f'{R}/robot_lab/LICENSE']),
}
for rid, (pol, txt, lics) in SRC.items():
    src, dst = f'{W}/rz_pack/{rid}', f'{OUT}/{rid}'
    if os.path.exists(dst): shutil.rmtree(dst)
    os.makedirs(dst)
    for f in ('physics.xml', 'visual.bin', 'visual.json'): shutil.copy(f'{src}/{f}', dst)
    if os.path.isdir(f'{src}/m') and os.listdir(f'{src}/m'): shutil.copytree(f'{src}/m', f'{dst}/m')
    shutil.copy(f'{W}/qout/{pol}', f'{dst}/policy.onnx')
    open(f'{dst}/SOURCE.txt', 'w').write(txt)
    for lic in lics: shutil.copy(lic, f'{dst}/{os.path.basename(os.path.dirname(lic))}-{os.path.basename(lic)}')
    s = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(dst) for f in fs)
    print(rid, f'{s / 1048576:.2f} MB', sorted(os.listdir(dst)))
