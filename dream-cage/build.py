"""Build Dream Cage: the VibeXR Interaction Framework single-file build with its demo playground world swapped
for the Dream Cage world (src/dreamcage.js), a diorama-sized portal cube in the spirit of Moncage.
  codepen.html  exactly what goes in a CodePen HTML panel
  index.html    the same markup wrapped in a full page for GitHub Pages  ->  /dream-cage/

  python3 dream-cage/build.py"""
from pathlib import Path
import re

P = Path(__file__).resolve().parent
s = (P.parent / 'vibexr' / 'codepen.html').read_text()


def swap(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


version = re.search(r'var VERSION = "([^"]+)";', s).group(1)

# world: the playground section is replaced wholesale; the framework modules stay untouched
a = s.index('// src/worlds/playground.js')
b = s.index('// src/main.js\nvar VERSION')
s = s[:a] + (P / 'src' / 'dreamcage.js').read_text().rstrip() + '\n\n' + s[b:]
swap('this.worlds.register(Playground);', 'this.worlds.register(DreamCage);')
swap('await app.worlds.load("playground");', 'await app.worlds.load("dream-cage");')

# two-hand transform, opt-in per object (candidates for the framework itself):
#  opts.twist          the framework's two-hand rotation is only the swing of the line between the hands, so
#                      rolling the object about that line did nothing; add the hands' average roll about it
#  opts.scaleDeadzone  scale only once the hands move apart / together by more than this fraction, so the size
#                      does not wobble while rotating
#  opts.minScale/max   per-object scale limits inside the transform (a clamp in constrain() moved the object)
swap('      let ratio = len / st.len0;\n',
     '      let ratio = len / st.len0;\n'
     '      const dz = it.opts.scaleDeadzone || 0;\n'
     '      ratio = ratio > 1 + dz ? ratio / (1 + dz) : ratio < 1 - dz ? ratio / (1 - dz) : 1;\n')
swap('ratio = THREE2.MathUtils.clamp(s0 * ratio, ICFG.minScale, ICFG.maxScale) / s0;',
     'ratio = THREE2.MathUtils.clamp(s0 * ratio, it.opts.minScale ?? ICFG.minScale, it.opts.maxScale ?? ICFG.maxScale) / s0;')
swap('      const q = _q1.setFromUnitVectors(st.dir0, dir);\n',
     '      const q = _q1.setFromUnitVectors(st.dir0, dir);\n'
     '      if (it.opts.twist) q.premultiply(this._twist(st, dir));\n')
swap('    o.matrixWorld.decompose(st.pos0, st.quat0, st.scale0);\n    this.twoHand.set(it, st);',
     '    o.matrixWorld.decompose(st.pos0, st.quat0, st.scale0);\n'
     '    st.qa0 = this._selectorQuat(a.interactor).invert();\n'
     '    st.qb0 = this._selectorQuat(b.interactor).invert();\n'
     '    this.twoHand.set(it, st);')
swap('  _endTwoHand(it) {',
     '''  // orientation of a selector: the ray's for far, the pinch / grip's for near
  _selectorQuat(i) {
    const s = i.source;
    if (i.type === "far") return (i.selecting ? i.selecting.vq : s.ray.quat).clone();
    return s.nearQuat.clone();
  }
  // the two selectors' average roll about the axis between them since the two-hand grab began
  _twist(st, axis) {
    let sum = 0;
    for (const [sel, inv0] of [[st.a, st.qa0], [st.b, st.qb0]]) {
      const d = this._selectorQuat(sel.interactor).multiply(inv0);
      const s = d.x * axis.x + d.y * axis.y + d.z * axis.z;
      let ang = 2 * Math.atan2(s, d.w);
      if (ang > Math.PI) ang -= 2 * Math.PI;
      if (ang < -Math.PI) ang += 2 * Math.PI;
      sum += ang;
    }
    return new THREE2.Quaternion().setFromAxisAngle(axis, sum / 2);
  }
  _endTwoHand(it) {''')

# page chrome (the one Enter button is the framework's, unchanged)
swap(f'<!-- VibeXR Interaction Framework v{version} - single-file build',
     '<!-- Dream Cage - a diorama-sized portal cube in the spirit of Moncage: every face is a window into its own\n'
     '  small world; turn the cube until shapes line up across an edge to join two worlds.\n'
     f'  Built on the VibeXR Interaction Framework v{version}.\n\n'
     f'  VibeXR Interaction Framework v{version} - single-file build')
swap('<h1>VibeXR</h1>', '<h1>Dream Cage</h1>')
swap('<p class="sub">Interaction framework &middot; see-through by default &middot; hands, controllers &amp; gaze pointers</p>',
     '<p class="sub">A portal cube the size of a diorama: each of its six faces opens onto its own little world. '
     '<strong>Goal:</strong> turn the cube until half a shape on one face meets its other half on the next face, '
     'across the glowing edge, and makes one whole shape. Each whole shape joins two worlds.</p>\n'
     '    <p class="by">by <a href="https://rongxuanmu.github.io/" target="_blank" rel="noopener">Rongxuan Mu</a> '
     '&middot; built on the VibeXR interaction framework</p>')
swap('  #ver {', '  .by { margin: -10px 0 18px; font-size: 13px; color: rgba(255,255,255,0.5); }\n'
     '  .by a { color: rgba(255,255,255,0.85); text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.35); }\n'
     '  #ver {')
swap(re.search(r'"WebXR not available - desktop preview \([^"]*\)"', s).group(0),
     '"Desktop preview: arrow keys turn the cube, right-drag orbits, left-click presses the panel"')
swap('document.getElementById("ver").textContent = `v${VERSION}`;',
     'document.getElementById("ver").textContent = `Dream Cage \\u00b7 VibeXR v${VERSION}`;')

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
assert 'enter-vr' not in s and 'VR only' not in s, 'VibeXR pages have exactly one Enter button'

(P / 'codepen.html').write_text(s)
desc = ('Dream Cage by Rongxuan Mu: a diorama-sized portal cube in WebXR. Each of its six faces opens onto its own small world; '
        'turn it in your hands until two half-shapes meet across an edge and join two worlds.')
page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Dream Cage</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="Dream Cage - Rongxuan Mu">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://rongxuanmu.github.io/dream-cage/">
<meta property="og:image" content="https://rongxuanmu.github.io/Resources/dream-cage/DreamCage.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../Resources/common/favicon-64.png" type="image/png">
</head>
<body>
<!-- Generated by dream-cage/build.py from src/dreamcage.js and vibexr/codepen.html. Edit those, not this file. -->
{s.rstrip()}
</body>
</html>
'''
(P / 'index.html').write_text(page)
print(f'dream-cage/index.html and codepen.html built (framework v{version}, {len(s) / 1024:.0f} KB)')
