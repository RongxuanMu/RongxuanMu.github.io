# Ink regression checks

Use Node.js and Three.js 0.186.0 (the same version as the gallery import map).
If Three.js is installed locally, run `node immersive-vibe/tests/ink-motion.mjs`
and `node immersive-vibe/tests/ink-game.mjs`.
Alternatively set `THREE_MODULE` to a file URL for the Three.js core ES module.

The motion check covers speed independence, stable ribbon frames, finite geometry,
three-meter orbits, pause and expiry. The game check simulates real projectile
collisions across all five levels, progression, loss, retry and pause.

Browser preview: build with `python3 immersive-vibe/build.py` then
`python3 immersive-vibe/build-game.py`. Serve the repository locally and open
`local-artifacts/immersive-vibe/Stroke-Breaker.html?qa=1` for developer controls.
Real headset hand/controller input and comfort still require hardware testing.
