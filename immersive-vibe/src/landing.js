// Landing spiral artwork: every dab is a live brush stroke that answers the cursor.
// Hover stirs the paint along with you and whirls it in your wake, a quick flick
// scatters it, press-and-hold gathers it into a whirlpool (release lets it bloom out).
// Left alone, the whole spiral turns slowly, like a galaxy seen at a tilt.
(() => {
  const host = document.querySelector('.artwork');
  const svg = host && host.querySelector('svg');
  if (!svg) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [vbX, vbY, vbW, vbH] = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
  const paths = svg.querySelectorAll('path');
  const N = paths.length;
  if (!N) return;
  const F = () => new Float32Array(N);
  const hx = F(), hy = F(), a0 = F(), len = F(), wid = F(), ph = F();
  const u0 = F(), w0 = F(), du0 = F(), dw0 = F(), r0 = F();
  const x = F(), y = F(), vx = F(), vy = F(), ang = F(), glow = F(), rel = F();
  const col = new Array(N), key = new Uint16Array(N);
  const keyStyle = [], keyWidth = [], keyMap = new Map();
  const q = (v) => Math.min(255, Math.round(v / 24) * 24);
  let cx = 0, cy = 0;
  for (let i = 0; i < N; i++) {
    const p = paths[i];
    const m = /M\s*([-\d.]+)[\s,]+([-\d.]+)\s*l\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(p.getAttribute('d') || '') || [0, 0, 0, 0, 0];
    const dx = +m[3], dy = +m[4];
    hx[i] = x[i] = +m[1] + dx / 2; hy[i] = y[i] = +m[2] + dy / 2;
    a0[i] = ang[i] = Math.atan2(dy, dx); len[i] = Math.hypot(dx, dy);
    wid[i] = +(p.getAttribute('stroke-width') || 1);
    const c = col[i] = p.getAttribute('stroke') || '#ffffff';
    ph[i] = Math.random() * 6.283;
    cx += hx[i]; cy += hy[i];
    // resting strokes are drawn in batches: quantised colour + width
    const r = q(parseInt(c.slice(1, 3), 16)), g = q(parseInt(c.slice(3, 5), 16)), b = q(parseInt(c.slice(5, 7), 16));
    const wl = Math.max(1, Math.round(wid[i] * 2)) / 2, k = r + ',' + g + ',' + b + '|' + wl;
    if (!keyMap.has(k)) { keyMap.set(k, keyStyle.length); keyStyle.push('rgb(' + r + ',' + g + ',' + b + ')'); keyWidth.push(wl); }
    key[i] = keyMap.get(k);
  }
  cx /= N; cy /= N;
  // the spiral is a flattened disc: work in its round frame (y stretched by 1/k)
  let sxx = 0, syy = 0;
  for (let i = 0; i < N; i++) { sxx += (hx[i] - cx) ** 2; syy += (hy[i] - cy) ** 2; }
  const k = Math.sqrt(syy / sxx) || 1;
  let rmax = 1, wind = 0;
  for (let i = 0; i < N; i++) {
    const u = u0[i] = hx[i] - cx, w = w0[i] = (hy[i] - cy) / k;
    let du = Math.cos(a0[i]), dw = Math.sin(a0[i]) / k; const dl = Math.hypot(du, dw) || 1; du /= dl; dw /= dl;
    du0[i] = du; dw0[i] = dw;
    const r = r0[i] = Math.hypot(u, w) || 1; rmax = Math.max(rmax, r);
    wind += ((du * u + dw * w) / r) * ((dw * u - du * w) / r);
  }
  for (let i = 0; i < N; i++) r0[i] /= rmax;
  const OMEGA = -Math.sign(wind || 1) * (2 * Math.PI / 140);  // one slow turn every ~2 min, arms trailing
  let theta = 0, primed = false;
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => key[a] - key[b]);

  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  host.insertBefore(cv, svg);
  host.classList.add('live');

  let W = 0, H = 0, dpr = 1, s = 1, ox = 0, oy = 0, BASE = 0.32;
  const small = matchMedia('(max-width:700px)');
  function fit() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    s = Math.min(W / vbW, H / vbH) || 1;                 // same "meet" fit as the SVG,
    if (H > W) s = Math.max(s, Math.min(H * 0.42 / vbH, W * 1.8 / vbW));   // but bleeding wider on a portrait screen
    ox = (W - vbW * s) / 2 - vbX * s; oy = (H - vbH * s) / 2 - vbY * s;
    BASE = small.matches ? 0.26 : 0.34;
  }

  // ── the cursor ─────────────────────────────────────────────────────────
  const P = { x: 1e9, y: 1e9, vx: 0, vy: 0, t: 0, in: false, down: false, downAt: 0, burst: 0, bx: 0, by: 0 };
  const overlayEl = document.getElementById('overlay');
  const active = () => !overlayEl || !overlayEl.classList.contains('hidden');
  const toVB = (e) => { const r = host.getBoundingClientRect(); return [(e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s]; };
  window.addEventListener('pointermove', (e) => {
    if (!active()) return;
    const [nx, ny] = toVB(e), now = performance.now();
    if (P.in && P.t) {
      const dt = Math.max(0.008, (now - P.t) / 1000), k = Math.min(1, dt * 18);
      P.vx += ((nx - P.x) / dt - P.vx) * k; P.vy += ((ny - P.y) / dt - P.vy) * k;
    } else { P.vx = P.vy = 0; }
    P.x = nx; P.y = ny; P.t = now; P.in = true; wake();
  }, { passive: true });
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) P.in = false; }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (!active() || e.button > 0) return;
    if (e.target.closest && e.target.closest('button,a,input,select,textarea,label,[role="button"]')) return;
    const [nx, ny] = toVB(e);
    P.x = nx; P.y = ny; P.vx = P.vy = 0; P.in = true; P.t = performance.now();
    P.down = true; P.downAt = P.t; wake();
  }, { passive: true });
  const release = (e, bloom) => {
    if (P.down && bloom && performance.now() - P.downAt > 160) { P.burst = 1; P.bx = P.x; P.by = P.y; }
    P.down = false;
    if (e.pointerType === 'touch') P.in = false;
  };
  window.addEventListener('pointerup', (e) => release(e, true), { passive: true });
  window.addEventListener('pointercancel', (e) => release(e, false), { passive: true });

  // ── the paint ──────────────────────────────────────────────────────────
  const HALF = Math.PI / 2;
  const wrapH = (d) => { d = (d + HALF) % Math.PI; if (d < 0) d += Math.PI; return d - HALF; };  // strokes have no head/tail
  let energy = 0;
  function step(dt, t) {
    theta += OMEGA * dt;
    const R = Math.min(200, Math.max(45, 110 / s));      // ~110 px of reach on screen
    const G = P.down ? R * 1.7 : R;
    const pvx = P.vx, pvy = P.vy, sp = Math.hypot(pvx, pvy);
    const on = P.in, burst = P.burst, B2 = (R * 1.8) * (R * 1.8);
    P.burst = 0; energy = 0;
    const K = 14, C = 3.4, fade = Math.exp(-dt * 1.6), turn = Math.min(1, dt * 9);
    for (let i = 0; i < N; i++) {
      // where this dab's home has drifted to as the disc turns (inner arms breathe a little)
      const th = theta + 0.06 * Math.sin(t * 0.3 + r0[i] * 2.2) * (1 - r0[i]);
      const c = Math.cos(th), sn = Math.sin(th);
      const nhx = cx + u0[i] * c - w0[i] * sn, nhy = cy + (u0[i] * sn + w0[i] * c) * k;
      const hvx = primed ? (nhx - hx[i]) / dt : 0, hvy = primed ? (nhy - hy[i]) / dt : 0;
      hx[i] = nhx; hy[i] = nhy;
      a0[i] = Math.atan2((du0[i] * sn + dw0[i] * c) * k, du0[i] * c - dw0[i] * sn);
      let kS = K, ax = 0, ay = 0, g = 0;
      if (on) {
        const dx = x[i] - P.x, dy = y[i] - P.y, d2 = dx * dx + dy * dy;
        if (d2 < G * G) {
          const d = Math.sqrt(d2) || 1e-3, ux = dx / d, uy = dy / d;
          if (P.down) {
            // gather: drawn in to a ring round the cursor and drained like a whirlpool
            const f = 1 - d / G, pull = 560 * f * Math.max(-1, Math.min(1, (d - 9) / 16)), sw = 320 * f;
            ax += -ux * pull - uy * sw; ay += -uy * pull + ux * sw;
            kS = K * (1 - 0.92 * f); g = 0.35 + 0.6 * f;
          } else {
            const f = 1 - d / R, f2 = f * f;
            // stir: the paint is dragged along with the cursor
            ax += (pvx - vx[i]) * 7 * f2; ay += (pvy - vy[i]) * 7 * f2;
            // whirl: counter-rotating eddies shed in the wake, plus a slow swirl while you hover
            const w = (pvx * dy - pvy * dx >= 0 ? 1 : -1) * sp * 1.4 * f2 + 55 * f2;
            ax += -uy * w; ay += ux * w;
            // scatter: a quick flick throws the dabs outward
            if (sp > 260) { const sc = (sp - 260) * 2.2 * f; ax += ux * sc; ay += uy * sc; }
            g = f * (0.45 + Math.min(0.55, sp / 420));
          }
        }
      }
      if (burst) {  // release after a gather: the pool blooms back out
        const dx = x[i] - P.bx, dy = y[i] - P.by, d2 = dx * dx + dy * dy;
        if (d2 < B2) { const d = Math.sqrt(d2) || 1e-3, f = 1 - d / (R * 1.8); vx[i] += dx / d * 300 * f; vy[i] += dy / d * 300 * f; }
      }
      ax += (hx[i] - x[i]) * kS - (vx[i] - hvx) * C; ay += (hy[i] - y[i]) * kS - (vy[i] - hvy) * C;
      vx[i] += ax * dt; vy[i] += ay * dt;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      const rx = vx[i] - hvx, ry = vy[i] - hvy, v2 = rx * rx + ry * ry;   // motion relative to the slow turn
      rel[i] = Math.sqrt(v2);
      let target = a0[i];                                  // dabs turn to follow the flow
      if (v2 > 16) target = a0[i] + wrapH(Math.atan2(ry, rx) - a0[i]) * Math.min(1, rel[i] / 140);
      ang[i] += wrapH(target - ang[i]) * turn;
      glow[i] = Math.max(glow[i] * fade, g);
      energy += v2 + glow[i];
    }
    primed = true;
  }

  function seg(i, t, amb) {
    const a = ang[i] + amb * 0.08 * Math.sin(t * 0.7 + ph[i]);
    const px = x[i], py = y[i];
    const L = len[i] * 0.5 * (1 + Math.min(1.6, rel[i] / 150));   // smear when stirred
    const c = Math.cos(a) * L, sn = Math.sin(a) * L;
    ctx.moveTo(px - c, py - sn); ctx.lineTo(px + c, py + sn);
  }
  function draw(t, amb) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.lineCap = 'round';
    ctx.globalAlpha = BASE;
    let cur = -1;
    for (let n = 0; n < N; n++) {                        // resting strokes, batched
      const i = order[n];
      if (glow[i] > 0.04) continue;
      if (key[i] !== cur) {
        if (cur >= 0) ctx.stroke();
        cur = key[i]; ctx.strokeStyle = keyStyle[cur]; ctx.lineWidth = keyWidth[cur]; ctx.beginPath();
      }
      seg(i, t, amb);
    }
    if (cur >= 0) ctx.stroke();
    for (let i = 0; i < N; i++) {                        // stirred strokes light up
      const gl = glow[i];
      if (gl <= 0.04) continue;
      ctx.globalAlpha = BASE + (0.95 - BASE) * Math.min(1, gl);
      ctx.strokeStyle = col[i]; ctx.lineWidth = wid[i] * (1 + 0.5 * gl);
      ctx.beginPath(); seg(i, t, amb); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  let raf = 0, last = 0, frame = 0;
  function tick(now) {
    raf = 0;
    if (!active()) return;                               // woken again when the cover returns
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60); last = now;
    if (now - P.t > 40) { const k = Math.exp(-dt * 10); P.vx *= k; P.vy *= k; }
    step(dt, now / 1000);
    const r = host.getBoundingClientRect();
    const calm = !P.in && !P.down && energy < 2;
    if (r.bottom > 0 && r.top < innerHeight && !(calm && (frame++ & 1))) draw(now / 1000, 1);
    raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf && !reduce && active()) { last = 0; primed = false; raf = requestAnimationFrame(tick); } }

  fit();
  if (reduce) draw(0, 0);
  new ResizeObserver(() => { fit(); if (reduce) draw(0, 0); else wake(); }).observe(host);
  if (overlayEl) new MutationObserver(wake).observe(overlayEl, { attributes: true, attributeFilter: ['class'] });
  wake();
})();
