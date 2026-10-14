"""Build Robot Zoo XR: the VibeXR Interaction Framework single-file build with its demo playground world swapped
for the Robot Zoo world (src/core.js, src/tracking.js, src/world.js). Outputs:
  index.html    the site page: robots from assets/ (packed from their repos), three.js / MuJoCo WASM / ONNX
                Runtime Web from the copies Microduck XR already serves (../microduck-xr/assets/lib)
  codepen.html  the same page with jsDelivr libraries and the robots fetched from the GitHub Pages site, to paste
                as-is into a CodePen HTML panel

  python3 robot-zoo-xr/build.py"""
from pathlib import Path
import re

P = Path(__file__).resolve().parent
s = (P.parent / 'vibexr' / 'codepen.html').read_text()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


version = re.search(r'var VERSION = "([^"]+)";', s).group(1)
world = '\n'.join((P / 'src' / f).read_text().rstrip() for f in ('core.js', 'tracking.js', 'world.js'))
a = s.index('// src/worlds/playground.js')
b = s.index('// src/main.js\nvar VERSION')
s = s[:a] + world + '\n\n' + s[b:]
swap('this.worlds.register(Playground);', 'this.worlds.register(RobotZoo);')
swap('await app.worlds.load("playground");', 'await app.worlds.load("robot-zoo");')

swap(f'<!-- VibeXR Interaction Framework v{version} - single-file build',
     '<!-- Robot Zoo XR - open-source humanoid robots running their published policies in MuJoCo WASM + ONNX Runtime\n'
     '  Web: Unitree G1 (whole-body motion tracking and walking), H1, H1-2, Booster T1, AgiBot X1 and Berkeley\n'
     '  Humanoid Lite, on your table or life-size in your room. Built on the VibeXR Interaction Framework v' + version + '.\n'
     '  Robots, models and policies keep their own licences (see assets/*/SOURCE.txt and the licence files beside them).\n\n'
     f'  VibeXR Interaction Framework v{version} - single-file build')
swap('<h1>VibeXR</h1>', '<h1>Robot Zoo XR</h1>')
swap('<p class="sub">Interaction framework &middot; see-through by default &middot; hands, controllers &amp; gaze pointers</p>',
     '<p class="sub">Open-source humanoids running their real policies &middot; Unitree, Booster, AgiBot, Berkeley &middot; '
     'on your table or life-size</p>\n'
     '    <p class="by">by <a href="https://rongxuanmu.github.io/" target="_blank" rel="noopener">Rongxuan Mu</a> '
     '&middot; built on the VibeXR interaction framework</p>')
swap('  #ver {', '  .by { margin: -10px 0 18px; font-size: 13px; color: rgba(255,255,255,0.5); }\n'
     '  .by a { color: rgba(255,255,255,0.85); text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.35); }\n'
     '  #ver {')
swap('"WebXR not available - desktop preview (left-click = ray pinch, wheel while dragging = push / pull, right-drag = orbit)"',
     '"Desktop preview: click the floor to walk there, drag the robot, WASD drives, R resets, right-drag orbits"')
swap('document.getElementById("ver").textContent = `v${VERSION}`;',
     'document.getElementById("ver").textContent = `Robot Zoo XR \\u00b7 VibeXR v${VERSION}`;')
swap('this.camera.position.set(0, 1.95, 0.7);', 'this.camera.position.set(0, 1.78, 0.18);')
swap('this.controls.target.set(0, 1.6, -0.5);', 'this.controls.target.set(-0.08, 1.58, -0.55);')

names = re.findall(r'^import (?:\* as (\w+)|\{([^}]*)\}|(\w+)) from', s, re.M)
bound = []
for star, group, default in names:
    if star:
        bound.append(star)
    elif default:
        bound.append(default)
    else:
        bound += [x.split(' as ')[-1].strip() for x in group.split(',') if x.strip()]
dupes = {n for n in bound if bound.count(n) > 1}
assert not dupes, f'duplicate import bindings: {dupes}'
assert 'enter-vr' not in s and 'VR only' not in s, 'VibeXR pages have exactly one Enter button'
(P / 'codepen.html').write_text(s)

# site build: libraries from Microduck XR's copies on the same site, robots from ./assets
LIB = '../microduck-xr/assets/lib'
swap('"https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js"', f'"{LIB}/three/build/three.module.js"')
swap('"https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/"', f'"{LIB}/three/examples/jsm/"')
swap('window.__HAND_URL = "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0.20/dist/profiles/generic-hand/";',
     f'window.__HAND_URL = new URL("{LIB}/webxr-input-profiles/dist/profiles/generic-hand/", location.href).href;')
swap('import { RoomEnvironment as RzRoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";',
     'import { RoomEnvironment as RzRoomEnvironment } from "./assets/lib/RoomEnvironment.js";')
a = s.index('var RZ_URL = {')
b = s.index('};', a) + 2
s = s[:a] + f"""var RZ_URL = {{
  assets: new URL("assets/", location.href).href,
  mujoco: new URL("{LIB}/mujoco/mujoco.js", location.href).href,
  ort: new URL("{LIB}/onnxruntime-web/dist/ort.wasm.min.mjs", location.href).href,
  ortDir: new URL("{LIB}/onnxruntime-web/dist/", location.href).href
}};""" + s[b:]
assert 'jsdelivr' not in s, 'a CDN URL is left in the site build'
desc = ('Robot Zoo XR by Rongxuan Mu: open-source humanoid robots - Unitree G1, H1, H1-2, Booster T1, AgiBot X1, '
        'Berkeley Humanoid Lite - running their real RL policies in MuJoCo in your browser, in WebXR.')
page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Robot Zoo XR</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="Robot Zoo XR - Rongxuan Mu">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://rongxuanmu.github.io/robot-zoo-xr/">
<meta property="og:image" content="https://rongxuanmu.github.io/Resources/robot-zoo-xr/RobotZoo.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../Resources/common/Rongxuan.jpeg" type="image/jpeg">
</head>
<body>
<!-- Generated by robot-zoo-xr/build.py from src/*.js and vibexr/codepen.html. Edit those, not this file. -->
{s.rstrip()}
</body>
</html>
'''
(P / 'index.html').write_text(page)
print(f'robot-zoo-xr/index.html and codepen.html built (framework v{version}, {len(s) / 1024:.0f} KB)')
