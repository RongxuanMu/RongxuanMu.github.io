"""The landing page every VibeXR project shares (applied by each project's build.py to the framework text).

  - the entry card sits on the LEFT in landscape (at the bottom in portrait, compact on short screens), so the
    middle of the page stays free;
  - the camera's view is offset so the scene's centre - the world's interactive object - is framed in the free
    space to the right of the card (the layout Microduck XR introduced);
  - the card carries a line with the date of the latest update and what changed.

  import landing
  s = landing.apply(s, updated='2026-10-16', notes='...')

The VibeXR framework 0.8.28 (on CodePen) does the same natively; once the GitHub copy is synced to it, this
module can go."""
import html


def _swap(s, a, b):
    assert s.count(a) == 1, f'landing: expected exactly one of {a[:60]!r}'
    return s.replace(a, b)


CSS = ('  @media (min-aspect-ratio: 5/4) and (min-width: 601px) { #overlay { justify-content: flex-start; '
       'padding-left: max(20px, 6vw); box-sizing: border-box; } .card { max-width: min(440px, 44vw); } }\n'
       '  @media (max-aspect-ratio: 5/4) and (min-width: 601px) { #overlay { align-items: flex-end; padding-bottom: 24px; } }\n'
       '  @media (max-height: 560px) { .card { padding: 16px 20px; } h1 { font-size: 21px; } .sub { font-size: 12.5px; '
       'margin-bottom: 12px; } button { padding: 10px 12px; font-size: 16px; flex-basis: 100px; } #status { margin-top: 10px; } }\n'
       '  .upd { margin: -6px 0 16px; font-size: 12px; line-height: 1.45; color: rgba(255,255,255,0.55); }\n'
       '  .upd b { color: rgba(255,255,255,0.8); font-weight: 600; }\n')

FRAME = '''  // landing (desktop, before / outside XR): the entry card sits on the left (at the bottom in portrait); the
  // camera's view is offset so the scene's centre is framed in the free space beside it
  _frameLanding() {
    const cam = this.camera, W = innerWidth, H = innerHeight, el = document.querySelector("#overlay:not(.hidden) .card");
    let rx = 0, rw = W, rh = H;
    if (el) {
      const r = el.getBoundingClientRect();
      if (W - r.right > r.top) rx = r.right, rw = W - r.right;
      else rh = r.top;
    }
    const ox = Math.round(W / 2 - (rx + rw / 2)), oy = Math.round(H / 2 - rh / 2), key = `${ox},${oy},${W},${H}`;
    if (key === this._landingKey) return;
    this._landingKey = key;
    if (ox || oy) cam.setViewOffset(W, H, ox, oy, W, H);
    else cam.clearViewOffset();
  }
  // - logging -'''


def apply(s, updated, notes, css=True):
    """css=False when the page already lays the card out itself (Microduck XR). updated=None stamps the build's own
    date and time (UTC), so the card always shows when the page last changed."""
    if updated is None:
        import datetime
        updated = datetime.datetime.now(datetime.timezone.utc).strftime('%-d %b %Y, %H:%M UTC')
    if css:
        s = _swap(s, '  @media (max-width: 600px) { #overlay { align-items: flex-end; padding-bottom: 16px; } }\n',
                  '  @media (max-width: 600px) { #overlay { align-items: flex-end; padding-bottom: 16px; } }\n' + CSS)
    else:
        s = _swap(s, '  #ver {', '  .upd { margin: -6px 0 16px; font-size: 12px; line-height: 1.45; '
                  'color: rgba(255,255,255,0.55); }\n  .upd b { color: rgba(255,255,255,0.8); font-weight: 600; }\n  #ver {')
    s = _swap(s, '    <div class="row">',
              f'    <p class="upd"><b>Updated {html.escape(updated)}</b> &middot; {html.escape(notes)}</p>\n    <div class="row">')
    if '_frameLanding()' not in s:
        s = _swap(s, '      this.controls.update();\n    }', '      this.controls.update();\n      this._frameLanding();\n    }')
        s = _swap(s, '  // - logging -', FRAME)
    return s
