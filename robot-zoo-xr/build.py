"""Build Robot Zoo XR: the VibeXR Interaction Framework single-file build with its demo playground world swapped
for the Robot Zoo world. Robot Zoo is Microduck XR's world (../microduck-xr/src/microduck.js, included as is) with a
robot picker: src/core.js, src/tracking.js and src/world.js add the humanoids and quadrupeds. Outputs:
  index.html    the site page: robots from assets/ (packed from their repos), three.js / MuJoCo WASM / ONNX
                Runtime Web from the copies Microduck XR already serves (../microduck-xr/assets/lib)
  codepen.html  the same page with jsDelivr libraries and the robots fetched from the GitHub Pages site, to paste
                as-is into a CodePen HTML panel

  python3 robot-zoo-xr/build.py"""
from pathlib import Path
import sys
import re

P = Path(__file__).resolve().parent
s = (P.parent / 'vibexr' / 'codepen.html').read_text()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


version = re.search(r'var VERSION = "([^"]+)";', s).group(1)
world = '\n'.join([(P.parent / 'microduck-xr' / 'src' / 'microduck.js').read_text().rstrip()]
                  + [(P / 'src' / f).read_text().rstrip() for f in ('core.js', 'tracking.js', 'world.js')])
a = s.index('// src/worlds/playground.js')
b = s.index('// src/main.js\nvar VERSION')
s = s[:a] + world + '\n\n' + s[b:]
swap('this.worlds.register(Playground);', 'this.worlds.register(RobotZoo);')
swap('await app.worlds.load("playground");', 'await app.worlds.load("robot-zoo");')

# the framework patches Microduck XR's build applies (see microduck-xr/build.py): exact cursor depth on a hit,
# double-sided panels, and hand-menu pages (Microduck's commands are the menu's home page in XR)
swap('  _cursorDepth(origin, dir, hit) {', '  _cursorDepth(origin, dir, hit) {\n    if (hit) return hit.distance;')
swap('new THREE4.MeshBasicMaterial({ map: roundedPanelTexture(512, Math.round(512 * h / w)), alphaTest: 0.5, alphaToCoverage: true })',
     'new THREE4.MeshBasicMaterial({ map: roundedPanelTexture(512, Math.round(512 * h / w)), alphaTest: 0.5, alphaToCoverage: true, side: THREE4.DoubleSide })')
swap(r'this.panel = new UIPanel("VibeXR \u00b7 Menu", { w: 0.17, h: 0.204 });',
     'this.panel = new UIPanel("Settings", { w: 0.17, h: 0.236 });')
swap('    this.root = this.panel.root;',
     '    this.root = new THREE4.Group();\n    this.root.add(this.panel.root);\n    this.pages = { settings: this.panel };\n    this.home = "settings";')
swap('  _hands() {\n    return this.app.input.list()',
     '  addPage(name, panel, home = true) {\n    this.pages[name] = panel;\n    this.root.add(panel.root);\n    if (home) this.home = name;\n    this.show(this.home);\n  }\n'
     '  removePage(name) {\n    const p = this.pages[name];\n    if (!p) return;\n    p.root.removeFromParent();\n    delete this.pages[name];\n    if (this.home === name) this.home = "settings";\n    this.show(this.home);\n  }\n'
     '  show(name) {\n    this.page = name;\n    for (const [k, p] of Object.entries(this.pages)) p.root.visible = k === name;\n  }\n'
     '  _hands() {\n    return this.app.input.list()')
swap('    if (this.owner === src) return;', '    if (this.owner === src) return;\n    this.show(this.home);')

swap(f'<!-- VibeXR Interaction Framework v{version} - single-file build',
     '<!-- Robot Zoo XR - open-source humanoid and quadruped robots running their published policies in MuJoCo WASM + ONNX Runtime\n'
     '  Web: Pollen Microduck (Microduck XR itself), Unitree G1 (whole-body motion tracking and walking), H1, H1-2, Booster T1,\n'
     '  AgiBot X1, Berkeley Humanoid Lite and the Unitree Go2 / B2 and AgiBot D1 robot dogs, life-size on your floor or on a tabletop. Built on the VibeXR Interaction Framework v' + version + '.\n'
     '  Robots, models and policies keep their own licences (see assets/*/SOURCE.txt and the licence files beside them).\n\n'
     f'  VibeXR Interaction Framework v{version} - single-file build')
swap('<h1>VibeXR</h1>', '<h1>Robot Zoo XR</h1>')
# the shared landing page: card on the left, the scene framed beside it, the latest update on the card
sys.path.insert(0, str(P.parent / 'vibexr'))
import landing  # noqa: E402
s = landing.apply(s, updated='16 Oct 2026', notes="three robot dogs: Unitree Go2, Unitree B2 and AgiBot D1; robots walk through your room on Microduck XR's stage; a Robot Zoo hand menu; draggable panels")
swap('<p class="sub">Interaction framework &middot; see-through by default &middot; hands, controllers &amp; gaze pointers</p>',
     '<p class="sub">Open-source robots running their real policies &middot; Microduck, humanoids and robot dogs from Unitree, Booster, AgiBot, Berkeley &middot; '
     'life-size on your floor or on a tabletop</p>\n'
     '    <p class="by">by <a href="https://rongxuanmu.com/" target="_blank" rel="noopener">Rongxuan Mu</a> '
     '&middot; built on the VibeXR interaction framework</p>')
swap('  #ver {', '  .by { margin: -10px 0 18px; font-size: 13px; color: rgba(255,255,255,0.5); }\n'
     '  .by a { color: rgba(255,255,255,0.85); text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.35); }\n'
     '  #ver {')
swap(re.search(r'"WebXR not available - desktop preview \([^"]*\)"', s).group(0),
     '"Desktop preview: click the floor to walk there, drag the robot, WASD drives, Space resets, right-drag orbits"')
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
s = s[:a] + 'var RZ_URL = {\n  assets: new URL("assets/", location.href).href\n};' + s[b:]
# Microduck from Microduck XR's own copies (models, every policy)
MD = '../microduck-xr/assets'
a = s.index('var MD_URL = {')
b = s.index('};', a) + 2
s = s[:a] + f"""var MD_URL = {{
  space: new URL("{MD}/microduck", location.href).href,
  mujoco: new URL("{LIB}/mujoco/mujoco.js", location.href).href,
  ort: new URL("{LIB}/onnxruntime-web/dist/ort.wasm.min.mjs", location.href).href,
  ortDir: new URL("{LIB}/onnxruntime-web/dist/", location.href).href,
  meshopt: new URL("{LIB}/meshoptimizer/meshopt_simplifier.module.js", location.href).href
}};""" + s[b:]
assert 'jsdelivr' not in s and 'huggingface' not in s, 'a remote URL is left in the site build'
desc = ('Robot Zoo XR by Rongxuan Mu: open-source robots - Pollen Microduck, Unitree G1, H1, H1-2, Booster T1, AgiBot X1, '
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
<meta property="og:url" content="https://rongxuanmu.com/robot-zoo-xr/">
<meta property="og:image" content="https://rongxuanmu.com/Resources/robot-zoo-xr/RobotZoo.jpg">
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
