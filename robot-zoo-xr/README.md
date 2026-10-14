# Robot Zoo XR

Live: https://rongxuanmu.github.io/robot-zoo-xr/ · Built on the [VibeXR framework](../vibexr/README.md)

Open-source humanoid robots running the policies their makers (and the community) published, simulated in
MuJoCo WASM with ONNX Runtime Web. You can watch them on the table or life-size on your floor. Point and pinch the floor to send a
robot walking, grab it to push or lift it, drive with a thumbstick or WASD.

| Robot | Policy | Source (licence) |
| --- | --- | --- |
| Unitree G1 · dance | whole-body motion tracking, 50 Hz, 13 clips | Axellwppr/humanoid-policy-viewer (Apache-2.0); G1 model Unitree (BSD-3-Clause) |
| Unitree G1 · walk | LSTM walking, 50 Hz | unitreerobotics/unitree_rl_gym (BSD-3-Clause) |
| Unitree H1, H1-2 | LSTM walking, 50 Hz | unitreerobotics/unitree_rl_gym (BSD-3-Clause) |
| Booster T1 | MLP walking, 50 Hz | BoosterRobotics/booster_gym (Apache-2.0) |
| AgiBot X1 | MLP walking, 100 Hz over 66 frames of history | AgibotTech/agibot_x1_infer (Mulan PSL v2) |
| Berkeley Humanoid Lite | biped walking, 50 Hz | HybridRobotics/Berkeley-Humanoid-Lite (MIT); model CC BY-SA 4.0 |

Each `assets/<robot>/` folder holds its `SOURCE.txt` and the licence files of the repositories it came from.

## Files

| Path | What it is |
| --- | --- |
| `src/core.js` | robot list, ONNX sessions, one controller per policy family (observation, gains and timing of its deploy code) |
| `src/tracking.js` | the G1 motion-tracking controller, ported from humanoid-policy-viewer |
| `src/world.js` | loading, rendering, stage, driving, grabbing, panel |
| `build.py` | writes `index.html` (site) and `codepen.html` (CodePen) from the framework and `src/` |
| `assets/` | packed robots, policies, motion clips, `lib/RoomEnvironment.js` (three.js, MIT) |
| `tools/` | how `assets/` was made (below) |

`index.html` loads three.js, MuJoCo and ONNX Runtime from Microduck XR's copies (`../microduck-xr/assets/lib`).

## How the assets were made

All of it is reproducible with `tools/` (Python with `mujoco onnxruntime onnx numpy trimesh scipy pyyaml`, Node with
`meshoptimizer@0.25`). `RZ_WORK` is a scratch folder holding clones of the source repositories under `robots/`.

1. `ts2onnx.py`: the Unitree and Booster policies ship as TorchScript. It reads their weights straight from the
   archive (no PyTorch), rebuilds the LSTM / MLP as ONNX, and checks it against a NumPy forward pass (max error about 1e-6).
2. `validate.py`: each walking policy runs headless in MuJoCo with its repo's own deploy loop (walk 0.5 m/s, turn,
   stand, walk 0.8 m/s). They all stay up and track the commands. `PACK=1` runs the same check on the packed
   models, with identical results.
3. `pack.py` + `vis.mjs`: physics keeps the collision geoms only, and mesh colliders become their convex hulls (what
   MuJoCo collides with anyway). Visual meshes are simplified with meshoptimizer and stored as int16 positions.
4. `assemble.py`: copies the packs, policies and licences into `assets/`. The G1 motion clips become float32 frames
   (joint positions, root position, root quaternion), trimmed to 10–30 s.

The browser controllers were checked against the Python runs. The same command sequence gives the same distances,
heights and headings, and every G1 clip (flips and the fall-and-get-up included) ends standing.
