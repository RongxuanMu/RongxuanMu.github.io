"""Build Microduck XR: the VibeXR Interaction Framework single-file build with its demo playground
world swapped for the Microduck world (src/microduck.js). Output: index.html, a single file that can be
pasted as-is into a CodePen HTML panel."""
from pathlib import Path
import re

P = Path(__file__).resolve().parent
s = (P.parent / 'immersive-vibe' / 'framework-v0.8.22.html').read_text()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


# world: the playground section is replaced wholesale; the framework modules stay untouched
a = s.index('// src/worlds/playground.js')
b = s.index('// src/main.js\nvar VERSION')
s = s[:a] + (P / 'src' / 'microduck.js').read_text().rstrip() + '\n\n' + s[b:]
swap('this.worlds.register(Playground);', 'this.worlds.register(Microduck);')
swap('await app.worlds.load("playground");', 'await app.worlds.load("microduck");')

# framework patches (kept small and generic; each is a behaviour fix / extension of the framework, not duck code)
# 1. cursor on an exact ray hit sits ON the hit: the spatial depth blend returned the first candidate whose
#    bounding sphere contained the ray - a large target (the stage floor) always does, so the cursor was
#    drawn on the floor while a button was hovered
swap('  _cursorDepth(origin, dir, hit) {', '  _cursorDepth(origin, dir, hit) {\n    if (hit) return hit.distance;')
# 2. opts.outlinePush (m or () => m): draw the hover hull that far BEHIND the object along the view ray, so the
#    object's own parts hide every inner edge and only the outer silhouette shows (multi-part models)
swap('m.userData.viewport = { value: new THREE2.Vector2(1024, 1024) };',
     'm.userData.viewport = { value: new THREE2.Vector2(1024, 1024) };\n  m.userData.push = { value: 0 };')
swap('sh.uniforms.uViewport = m.userData.viewport;', 'sh.uniforms.uViewport = m.userData.viewport;\n    sh.uniforms.uPush = m.userData.push;')
swap(r'sh.vertexShader = "uniform float uOutlinePx;\nuniform vec2 uViewport;\n"',
     r'sh.vertexShader = "uniform float uOutlinePx;\nuniform vec2 uViewport;\nuniform float uPush;\n"')
swap(r'"#include <project_vertex>\n vec4 vxrC',
     r'"#include <project_vertex>\n if ( uPush > 0.0 ) { vec4 vxrP = mvPosition; vxrP.xyz *= ( length( vxrP.xyz ) + uPush ) / max( length( vxrP.xyz ), 1e-4 ); gl_Position = projectionMatrix * vxrP; }\n vec4 vxrC')
swap('this._outlineMat.opacity = level === 2 ? 1 : 0.85;',
     'this._outlineMat.opacity = level === 2 ? 1 : 0.85;\n'
     '    const push = this.opts.outlinePush;\n'
     '    this._outlineMat.userData.push.value = typeof push === "function" ? push() : push || 0;')
# 3. UI panel bases are visible from behind too
swap('new THREE4.MeshBasicMaterial({ map: roundedPanelTexture(512, Math.round(512 * h / w)), alphaTest: 0.5, alphaToCoverage: true })',
     'new THREE4.MeshBasicMaterial({ map: roundedPanelTexture(512, Math.round(512 * h / w)), alphaTest: 0.5, alphaToCoverage: true, side: THREE4.DoubleSide })')
# 4. hand menu pages: the framework menu becomes the "Settings" page; a world can add its own page and make it
#    the one the menu opens on (addPage / removePage / show)
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

# one entry button: "Enter" starts passthrough AR where supported and falls back to VR otherwise
swap('      <button id="enter-vr" class="alt">VR only</button>\n', '')
swap('var vrBtn = document.getElementById("enter-vr");\nvrBtn.onclick = () => app.enterXR("vr");\n', '')
swap('    vrBtn.disabled = arBtn.disabled = true;', '    arBtn.disabled = true;')
swap('  vrBtn.disabled = !vr;\n  arBtn.disabled = !ar;\n', '  arBtn.disabled = !ar && !vr;\n')
swap('if (!ar && vr) arBtn.textContent = "Enter (VR only)", arBtn.disabled = false, arBtn.onclick = () => app.enterXR("vr");',
     'if (!ar && vr) arBtn.onclick = () => app.enterXR("vr");')
# page chrome
swap('<!-- VibeXR Interaction Framework v0.8.23 - single-file build',
     '<!-- Microduck XR - drive the Pollen Robotics Microduck (real RL policies in MuJoCo WASM + ONNX Runtime Web)\n'
     '  with hands, controllers or a mouse. Built on the VibeXR Interaction Framework v0.8.23.\n'
     '  Robot: Pollen Robotics Microduck - pollen-robotics/microduck + microduck_rl (Apache-2.0). Model, visual mesh\n'
     '  and trained policies load at runtime from the pollen-robotics/microduck-simulator Space.\n\n'
     '  VibeXR Interaction Framework v0.8.23 - single-file build')
swap('<h1>VibeXR</h1>', '<h1>Microduck XR</h1>')
# landing: the card sits left of the duck in landscape, at the bottom in portrait, compact on short screens;
# the world frames the duck in whatever space is left
swap('@media (max-width: 600px) { #overlay { align-items: flex-end; padding-bottom: 16px; } }',
     '@media (max-width: 600px) { #overlay { align-items: flex-end; padding-bottom: 16px; } }\n'
     '  @media (min-aspect-ratio: 5/4) and (min-width: 601px) { #overlay { justify-content: flex-start; padding-left: max(20px, 6vw); box-sizing: border-box; } .card { max-width: min(440px, 44vw); } }\n'
     '  @media (max-aspect-ratio: 5/4) and (min-width: 601px) { #overlay { align-items: flex-end; padding-bottom: 24px; } }\n'
     '  @media (max-height: 560px) { .card { padding: 16px 20px; } h1 { font-size: 21px; } .sub { font-size: 12.5px; margin-bottom: 12px; } '
     'button { padding: 10px 12px; font-size: 16px; flex-basis: 100px; } #status { margin-top: 10px; } }')
swap('<p class="sub">Interaction framework &middot; see-through by default &middot; hands, controllers &amp; gaze pointers</p>',
     '<p class="sub">The real Microduck walking policies in MuJoCo &middot; point, pinch &amp; grab to play &middot; '
     'built on the VibeXR interaction framework</p>')
swap('"WebXR not available - desktop preview (left-click = ray pinch, wheel while dragging = push / pull, right-drag = orbit)"',
     '"Desktop preview: click the floor to walk, drag the duck, WASD drive, Q quack, right-drag orbit"')
swap('document.getElementById("ver").textContent = `v${VERSION}`;',
     'document.getElementById("ver").textContent = `Microduck XR \\u00b7 VibeXR v${VERSION}`;')
swap('this.camera.position.set(0, 1.95, 0.7);', 'this.camera.position.set(0, 1.75, 0.55);')
swap('this.controls.target.set(0, 1.6, -0.5);', 'this.controls.target.set(0, 0.35, -1.3);')
# head: portrait favicon (like the rest of the portfolio) + social preview card. Absolute URLs, so they also
# resolve when the file is pasted into CodePen.
SITE = 'https://rongxuanmu.github.io'
head = f"""<meta charset="utf-8">
<title>Microduck XR</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" type="image/jpeg" href="{SITE}/Resources/common/Rongxuan.jpeg">
<link rel="apple-touch-icon" href="{SITE}/Resources/common/Rongxuan.jpeg">
<meta name="description" content="Microduck XR by Rongxuan Mu - Pollen Robotics' Microduck robot in WebXR. Its real walking policies run in MuJoCo in your browser; pick it up, send it walking, make it kick.">
<meta property="og:type" content="website">
<meta property="og:title" content="Microduck XR - Rongxuan Mu">
<meta property="og:description" content="A real robot policy you can pick up with your hands. Pollen Robotics' Microduck in WebXR, simulated live in the browser.">
<meta property="og:url" content="{SITE}/microduck-xr/">
<meta property="og:image" content="{SITE}/Resources/microduck/social-preview.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Microduck XR by Rongxuan Mu: the white and orange Microduck robot standing on a line-drawn stage.">
<meta name="twitter:card" content="summary_large_image">
"""
s = head + s

# single-module sanity: no binding imported twice
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

(P / 'index.html').write_text(s)
print(f'index.html  {len(s) / 1024:.0f} KB')
