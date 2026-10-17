"""Build Archiscape: the VibeXR Interaction Framework single-file build with its demo playground world swapped
for the Archiscape world (src/core.js, src/styles.js, src/world.js), a Townscaper-style town builder that
rebuilds one town in any era of architecture.
  codepen.html  exactly what goes in a CodePen HTML panel
  index.html    the same markup wrapped in a full page for GitHub Pages  ->  /archiscape/

  python3 archiscape/build.py"""
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

# world: the playground section is replaced wholesale; the framework modules stay untouched
world = '\n'.join((P / 'src' / f).read_text().rstrip() for f in ('core.js', 'styles.js', 'music.js', 'world.js'))
a = s.index('// src/worlds/playground.js')
b = s.index('// src/main.js\nvar VERSION')
s = s[:a] + world + '\n\n' + s[b:]
swap('this.worlds.register(Playground);', 'this.worlds.register(Archiscape);')
swap('await app.worlds.load("playground");', 'await app.worlds.load("archiscape");')

# page chrome (the one Enter button is the framework's, unchanged)
swap(f'<!-- VibeXR Interaction Framework v{version} - single-file build',
     '<!-- Archiscape - a Townscaper-style town builder for your table: tap to build, hold to remove, and rebuild the\n'
     '  same town in any of nineteen eras, from Stonehenge, Athens, Rome and Hagia Sophia through the Forbidden City,\n'
     '  Jiangnan after Wu Guanzhong, Kyoto, the Kremlin and the Thai temples to Gaudi, Wright, Le Corbusier, Meier, Ando, I. M. Pei,\n'
     '  Gehry and Zaha Hadid, each with its own music. Built on the VibeXR Interaction Framework v' + version + '.\n\n'
     f'  VibeXR Interaction Framework v{version} - single-file build')
swap('<h1>VibeXR</h1>', '<h1>Archiscape</h1>')
# the shared landing page: card on the left, the scene framed beside it, the latest update on the card
sys.path.insert(0, str(P.parent / 'vibexr'))
import landing  # noqa: E402
s = landing.apply(s, updated='17 Oct 2026', notes='this page plays the eras by itself while you read, opening on the Forbidden City; Jiangnan walls in one even white; the tour reforms each town once per era; panels on your right, clear of this card; nineteen eras with Kyoto and Thai temples')
swap('<p class="sub">Interaction framework &middot; see-through by default &middot; hands, controllers &amp; gaze pointers</p>',
     '<p class="sub">One town on your table, every era of architecture &middot; tap to build, hold to remove &middot; '
     'Stonehenge to Zaha Hadid</p>\n'
     '    <p class="by">by <a href="https://rongxuanmu.com/" target="_blank" rel="noopener">Rongxuan Mu</a> '
     '&middot; built on the VibeXR interaction framework</p>')
swap('  #ver {', '  .by { margin: -10px 0 18px; font-size: 13px; color: rgba(255,255,255,0.5); }\n'
     '  .by a { color: rgba(255,255,255,0.85); text-decoration: none; border-bottom: 1px solid rgba(255,255,255,0.35); }\n'
     '  #ver {')
swap(re.search(r'"WebXR not available - desktop preview \([^"]*\)"', s).group(0),
     '"Desktop preview: click to build, hold to remove, arrow keys change era, right-drag orbits"')
swap('document.getElementById("ver").textContent = `v${VERSION}`;',
     'document.getElementById("ver").textContent = `Archiscape \\u00b7 VibeXR v${VERSION}`;')
swap('this.camera.position.set(0, 1.95, 0.7);', 'this.camera.position.set(0.2, 1.95, 0.45);')
swap('this.controls.target.set(0, 1.6, -0.5);', 'this.controls.target.set(0.2, 1.47, -0.5);')

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
desc = ('Archiscape by Rongxuan Mu: a Townscaper-style town builder in WebXR. Build a town on your table, then '
        'rebuild it in any of nineteen eras of architecture, from Stonehenge and the Forbidden City to Gaudi, I. M. Pei and Zaha Hadid, each with its own music.')
page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Archiscape</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:title" content="Archiscape - Rongxuan Mu">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="https://rongxuanmu.com/archiscape/">
<meta property="og:image" content="https://rongxuanmu.com/Resources/archiscape/Archiscape.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../Resources/common/Rongxuan.jpeg" type="image/jpeg">
</head>
<body>
<!-- Generated by archiscape/build.py from src/*.js and vibexr/codepen.html. Edit those, not this file. -->
{s.rstrip()}
</body>
</html>
'''
(P / 'index.html').write_text(page)
print(f'archiscape/index.html and codepen.html built (framework v{version}, {len(s) / 1024:.0f} KB)')
