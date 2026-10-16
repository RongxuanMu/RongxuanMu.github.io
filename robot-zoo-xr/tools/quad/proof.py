"""Proof on the PACKED physics.xml: stand 2 s, forward 0.5 m/s 4 s, turn 1.0 rad/s 4 s, stand 2 s (world.js command
filter tw += 0.2*(want-tw) per policy step), then ONNX vs original TorchScript on the first 5 s of logged observations."""
import os, sys, json
import numpy as np, torch
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import qval
PT = {'go2_rl': 'go2/robot_lab/policy.pt', 'b2': 'b2/robot_lab/policy.pt', 'd1': 'd1/robot_lab/policy.pt'}
PACK = {'go2_rl': 'go2', 'b2': 'b2', 'd1': 'd1'}
res = {}
for name in PT:
    xml = f'{os.environ["RZ_WORK"]}/rz_pack/{PACK[name]}/physics.xml'
    log = []
    print(f'== {PACK[name]} ({xml})')
    r = qval.run(name, xml, 0.005, 4, log=log)
    tm = torch.jit.load(f'{os.environ["RZ_WORK"]}/robots/rl_sar/policy/{PT[name]}', map_location='cpu').eval()
    import onnxruntime as ort
    s = ort.InferenceSession(qval.SPECS[name]['onnx'])
    X = np.array(log[:250], np.float32)  # 5 s at 50 Hz
    with torch.no_grad():
        ref = tm(torch.from_numpy(X)).numpy()
    out = np.concatenate([s.run(None, {'obs': x[None]})[0] for x in X])
    r['onnx_vs_torchscript_max_abs_err_5s'] = float(np.abs(out - ref).max())
    r['action_abs_max_5s'] = float(np.abs(ref).max())
    print('  upright', r['upright'], 'final z', r['final_z'], 'onnx err', f"{r['onnx_vs_torchscript_max_abs_err_5s']:.2e}", '(|a| max', f"{r['action_abs_max_5s']:.2f})")
    res[PACK[name]] = r
json.dump(res, open(os.environ['RZ_WORK'] + '/quadruped_proof.json', 'w'), indent=1)
