# Robot Zoo XR

Live: https://rongxuanmu.github.io/robot-zoo-xr/ · Built on the [VibeXR framework](../vibexr/README.md)

Open-source robots running the policies their makers (and the community) published, simulated in MuJoCo WASM
with ONNX Runtime Web.

Robot Zoo is Microduck XR with a robot picker. The world object inherits Microduck XR's (`../microduck-xr/src/microduck.js`
is built in as is), so every robot gets Microduck's experience: the stage is placed once when you enter, life-size on the
floor (1.6 m below your head, not the headset's tracked floor) or on a tabletop (0.5 m below your head), and never
moves on its own; robots walk across it, through your room. The stage bar moves and turns it with the console riding
along. Point and pinch the floor or drag the flag to send a robot walking. Grab a robot to lift it (two hands turn
it). Follow me, Boundary, the speed slider, the drive joystick, thumbsticks / WASD and the sounds all work as in
Microduck XR. Microduck itself runs Microduck XR's own code and assets, with every move (sit, roll, peck, kicks, ball,
roller skates, colourways); picking another robot swaps what stands on the stage, never the stage.

| Robot | Policy | Source (licence) |
| --- | --- | --- |
| Pollen Microduck | every Microduck XR policy, from `../microduck-xr/assets/microduck` | pollen-robotics/microduck + microduck_rl (Apache-2.0) |
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
| `src/world.js` | the humanoids on Microduck XR's world: loading, rendering, driving, grabbing, robot picker |
| `build.py` | writes `index.html` (site) and `codepen.html` (CodePen) from the framework and `src/` |
| `assets/` | packed robots, policies, motion clips, `lib/RoomEnvironment.js` (three.js, MIT) |
| `tools/` | how `assets/` was made (below) |

`index.html` loads three.js, MuJoCo, ONNX Runtime and Microduck from Microduck XR's copies (`../microduck-xr/assets`).

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
