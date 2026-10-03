"""Vendor every runtime file Microduck XR needs into assets/, so the site serves them itself (no Hugging Face /
jsDelivr at runtime). Pinned versions; re-run only when a version below changes. Output layout:
  assets/microduck/...    model, meshes and policies, same layout as the pollen-robotics/microduck-simulator Space
  assets/lib/<pkg>/...    three.js, MuJoCo WASM, ONNX Runtime Web, meshoptimizer, the generic hand meshes"""
from pathlib import Path
import re
import subprocess

P = Path(__file__).resolve().parent
A = P / 'assets'
SPACE = 'https://huggingface.co/spaces/pollen-robotics/microduck-simulator/resolve/023172c8a7d629b5258d90364c13bafe013abbfa/app/public'
NPM = 'https://cdn.jsdelivr.net/npm'
POLICIES = ['BEST_alpha_walking', 'BEST_alpha_stand', 'BEST_alpha_sitstand', 'roulade', 'ball_kick_left',
            'ball_kick_right', 'alpha_ground_pick', 'BEST_roller', 'BEST_roller_crouch']
ROBOT = ['microduck.glb', 'kinematics.json', 'robot_allcollisions.xml', 'kinematics_rollers.json',
         'robot_allcollisions_rollers.xml']
# roller-only meshes (the GLB carries every legged-duck mesh)
ROLLER_MESHES = ['roller_blade.stl', 'rim.stl', 'tire.stl', 'ankle_l_v1.stl', 'ankle_r_v1.stl']
THREE = 'three@0.186.0'
THREE_ENTRY = ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js',
               'examples/jsm/utils/BufferGeometryUtils.js', 'examples/jsm/loaders/GLTFLoader.js',
               'examples/jsm/loaders/STLLoader.js', 'examples/jsm/lines/LineSegments2.js',
               'examples/jsm/lines/LineSegmentsGeometry.js', 'examples/jsm/lines/LineMaterial.js']
FILES = {  # npm package -> files
    '@mujoco/mujoco@3.11.0': ['mujoco.js', 'mujoco.wasm'],
    'onnxruntime-web@1.27.0': ['dist/ort.wasm.min.mjs', 'dist/ort-wasm-simd-threaded.mjs',
                               'dist/ort-wasm-simd-threaded.wasm'],
    'meshoptimizer@0.22.0': ['meshopt_simplifier.module.js', 'LICENSE.md'],
    '@webxr-input-profiles/assets@1.0.20': ['dist/profiles/generic-hand/left.glb',
                                            'dist/profiles/generic-hand/right.glb'],
    THREE: ['LICENSE'],
}

LIBDIR = {'@webxr-input-profiles/assets@1.0.20': 'webxr-input-profiles'}


def get(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return dest.read_bytes()
    subprocess.run(['curl', '-sfL', '--retry', '3', '-o', str(dest), url], check=True)   # curl: HF redirects to its CDN
    data = dest.read_bytes()
    print(f'{len(data) / 1024:9.0f} KB  {dest.relative_to(P)}')
    return data


def lib(pkg, path):
    return get(f'{NPM}/{pkg}/{path}', A / 'lib' / LIBDIR.get(pkg, pkg.rsplit('@', 1)[0].split('/')[-1]) / path)


for f in ROBOT:
    get(f'{SPACE}/robot/mjlab/{f}', A / 'microduck' / 'robot' / 'mjlab' / f)
for f in ROLLER_MESHES:
    get(f'{SPACE}/robot/mjlab/meshes/{f}', A / 'microduck' / 'robot' / 'mjlab' / 'meshes' / f)
for p in POLICIES:
    get(f'{SPACE}/policies/{p}.onnx', A / 'microduck' / 'policies' / f'{p}.onnx')
get('https://raw.githubusercontent.com/pollen-robotics/microduck/main/LICENSE', A / 'microduck' / 'LICENSE')
get('https://raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE', A / 'lib' / 'onnxruntime-web' / 'LICENSE')
get('https://raw.githubusercontent.com/google-deepmind/mujoco/main/LICENSE', A / 'lib' / 'mujoco' / 'LICENSE')
for pkg, files in FILES.items():
    for f in files:
        lib(pkg, f)

# three.js: the entry modules plus everything they import relatively
todo, seen = list(THREE_ENTRY), set()
while todo:
    f = todo.pop()
    if f in seen:
        continue
    seen.add(f)
    src = lib(THREE, f).decode()
    for dep in re.findall(r'''(?:from|import)\s*['"](\.{1,2}/[^'"]+)['"]''', src):
        todo.append(str((Path(f).parent / dep).as_posix()).replace('/./', '/'))
        todo[-1] = re.sub(r'[^/]+/\.\./', '', todo[-1])
total = sum(f.stat().st_size for f in A.rglob('*') if f.is_file())
print(f'assets/  {total / 1048576:.1f} MB')
