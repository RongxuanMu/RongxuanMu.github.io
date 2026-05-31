(function initMetaballs() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.id = 'metaballs-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.prepend(canvas);

    const ctx = canvas.getContext('2d', { alpha: true });
    const mouse = { x: -9999, y: -9999, active: false };
    const RENDER_SCALE = 0.5;
    const MAX_BLOBS = 10;
    const METABALL_BLUR = 28;

    let width = 0;
    let height = 0;
    let canvasW = 0;
    let canvasH = 0;
    let animationId = 0;
    let isPaused = false;
    let resizeTimer = 0;

    const palettes = {
        light: [
            [147, 197, 253, 1],
            [196, 181, 253, 0.98],
            [125, 211, 252, 0.96],
            [167, 243, 208, 0.92],
            [253, 186, 216, 0.9],
            [255, 228, 160, 0.88],
            [244, 162, 247, 0.9],
            [129, 212, 250, 0.94],
        ],
        dark: [
            [96, 165, 250, 0.52],
            [167, 139, 250, 0.48],
            [56, 189, 248, 0.46],
            [52, 211, 153, 0.42],
            [244, 114, 182, 0.4],
            [251, 191, 36, 0.38],
            [192, 132, 252, 0.44],
            [45, 212, 191, 0.4],
        ],
    };

    const blobs = [];

    function isDark() {
        return document.documentElement.classList.contains('dark-mode');
    }

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function makeBlob(x, y, radius, color) {
        return {
            x,
            y,
            vx: randomBetween(-0.22, 0.22),
            vy: randomBetween(-0.22, 0.22),
            radius,
            color,
            phase: Math.random() * Math.PI * 2,
            driftSpeed: randomBetween(0.00055, 0.00115),
            driftAmp: randomBetween(0.028, 0.055),
            wanderAngle: Math.random() * Math.PI * 2,
            jitterPhase: Math.random() * Math.PI * 2,
        };
    }

    function createBlobs() {
        blobs.length = 0;
        const area = width * height;
        const count = Math.min(
            MAX_BLOBS,
            Math.max(8, Math.floor(area / 120000))
        );
        const palette = isDark() ? palettes.dark : palettes.light;

        for (let i = 0; i < count; i += 1) {
            const color = palette[i % palette.length];
            let placed = false;

            for (let attempt = 0; attempt < 50; attempt += 1) {
                const radius = randomBetween(140, 220);
                const x = randomBetween(radius, width - radius);
                const y = randomBetween(radius, height - radius);
                let tooClose = false;

                for (let j = 0; j < blobs.length; j += 1) {
                    const other = blobs[j];
                    const dist = Math.hypot(x - other.x, y - other.y);
                    const minSpawn = (radius + other.radius) * 1.08;

                    if (dist < minSpawn) {
                        tooClose = true;
                        break;
                    }
                }

                if (tooClose) {
                    continue;
                }

                blobs.push(makeBlob(x, y, radius, color));
                placed = true;
                break;
            }

            if (!placed) {
                const radius = randomBetween(140, 220);
                blobs.push(
                    makeBlob(
                        randomBetween(radius, width - radius),
                        randomBetween(radius, height - radius),
                        radius,
                        color
                    )
                );
            }
        }
    }

    function measurePage() {
        const doc = document.documentElement;
        const bodyEl = document.body;
        width = doc.clientWidth;
        height = Math.max(
            doc.scrollHeight,
            bodyEl.scrollHeight,
            doc.offsetHeight,
            bodyEl.offsetHeight,
            window.innerHeight
        );
    }

    function applyCanvasSize() {
        canvasW = Math.max(1, Math.floor(width * RENDER_SCALE));
        canvasH = Math.max(1, Math.floor(height * RENDER_SCALE));
        canvas.width = canvasW;
        canvas.height = canvasH;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
        ctx.imageSmoothingEnabled = true;
    }

    function resize() {
        const prevWidth = width;
        measurePage();
        applyCanvasSize();
        if (blobs.length === 0 || Math.abs(prevWidth - width) > 1) {
            createBlobs();
        }
    }

    function scheduleResize() {
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resize, 150);
    }

    function setMouseFromEvent(event) {
        mouse.x =
            event.pageX !== undefined
                ? event.pageX
                : event.clientX + window.scrollX;
        mouse.y =
            event.pageY !== undefined
                ? event.pageY
                : event.clientY + window.scrollY;
        mouse.active = true;
    }

    function applySeparation(blob, index) {
        const minScale = 0.98;
        const softMult = 2.55;
        const hardPush = 1.15;
        const softPush = 0.38;

        for (let i = 0; i < blobs.length; i += 1) {
            if (i === index) {
                continue;
            }

            const other = blobs[i];
            const dx = blob.x - other.x;
            const dy = blob.y - other.y;
            const dist = Math.hypot(dx, dy) || 1;
            const minDist = (blob.radius + other.radius) * minScale;

            if (dist < minDist) {
                const push = ((minDist - dist) / minDist) * hardPush;
                blob.vx += (dx / dist) * push;
                blob.vy += (dy / dist) * push;
                continue;
            }

            const softZone = minDist * softMult;
            if (dist < softZone) {
                const t = (softZone - dist) / (softZone - minDist);
                const push = t * softPush;
                blob.vx += (dx / dist) * push;
                blob.vy += (dy / dist) * push;
            }
        }
    }

    function blobPad(blob) {
        return blob.radius * 0.85;
    }

    function edgeInsets(blob) {
        const pad = blobPad(blob);
        return {
            pad,
            left: blob.x - pad,
            right: width - pad - blob.x,
            top: blob.y - pad,
            bottom: height - pad - blob.y,
        };
    }

    function distanceFromMouse(blob) {
        if (!mouse.active) {
            return Infinity;
        }
        return Math.hypot(mouse.x - blob.x, mouse.y - blob.y);
    }

    function viewportSpan() {
        return Math.max(window.innerWidth, window.innerHeight);
    }

    function isFarFromMouse(blob) {
        return distanceFromMouse(blob) > viewportSpan() * 0.38;
    }

    function isNearEdge(blob) {
        const { left, right, top, bottom } = edgeInsets(blob);
        const margin = blob.radius * 0.55;
        return left < margin || right < margin || top < margin || bottom < margin;
    }

    function isInCorner(blob) {
        const { left, right, top, bottom } = edgeInsets(blob);
        const corner = blob.radius * 0.5;
        return (
            (left < corner && top < corner) ||
            (left < corner && bottom < corner) ||
            (right < corner && top < corner) ||
            (right < corner && bottom < corner)
        );
    }

    function applyEdgeForces(blob) {
        const { pad, left, right, top, bottom } = edgeInsets(blob);
        const edgeZone = blob.radius * 0.95;
        let ax = 0;
        let ay = 0;

        if (left < edgeZone) {
            const t = 1 - left / edgeZone;
            ax += t * t * 0.42;
        }
        if (right < edgeZone) {
            const t = 1 - right / edgeZone;
            ax -= t * t * 0.42;
        }
        if (top < edgeZone) {
            const t = 1 - top / edgeZone;
            ay += t * t * 0.42;
        }
        if (bottom < edgeZone) {
            const t = 1 - bottom / edgeZone;
            ay -= t * t * 0.42;
        }

        blob.vx += ax;
        blob.vy += ay;

        if (isInCorner(blob)) {
            const cx = width * 0.5;
            const cy = height * 0.5;
            const dx = cx - blob.x;
            const dy = cy - blob.y;
            const dist = Math.hypot(dx, dy) || 1;
            const escape = isFarFromMouse(blob) ? 0.55 : 0.38;
            blob.vx += (dx / dist) * escape;
            blob.vy += (dy / dist) * escape;
            blob.wanderAngle = Math.atan2(dy, dx) + randomBetween(-0.5, 0.5);
        }
    }

    function resolveBounds(blob) {
        const pad = blobPad(blob);
        const minBounce = isFarFromMouse(blob) ? 0.72 : 0.58;

        if (blob.x < pad) {
            blob.x = pad;
            blob.vx = Math.max(minBounce, Math.abs(blob.vx) * 0.88 + 0.2);
        } else if (blob.x > width - pad) {
            blob.x = width - pad;
            blob.vx = -Math.max(minBounce, Math.abs(blob.vx) * 0.88 + 0.2);
        }

        if (blob.y < pad) {
            blob.y = pad;
            blob.vy = Math.max(minBounce, Math.abs(blob.vy) * 0.88 + 0.2);
        } else if (blob.y > height - pad) {
            blob.y = height - pad;
            blob.vy = -Math.max(minBounce, Math.abs(blob.vy) * 0.88 + 0.2);
        }

        if (isInCorner(blob)) {
            const { left, right, top, bottom } = edgeInsets(blob);
            if (left < blob.radius * 0.35 && top < blob.radius * 0.35) {
                blob.vx += 0.35;
                blob.vy += 0.35;
            }
            if (left < blob.radius * 0.35 && bottom < blob.radius * 0.35) {
                blob.vx += 0.35;
                blob.vy -= 0.35;
            }
            if (right < blob.radius * 0.35 && top < blob.radius * 0.35) {
                blob.vx -= 0.35;
                blob.vy += 0.35;
            }
            if (right < blob.radius * 0.35 && bottom < blob.radius * 0.35) {
                blob.vx -= 0.35;
                blob.vy -= 0.35;
            }
        }
    }

    function applyMouseFollow(blob) {
        const dx = mouse.x - blob.x;
        const dy = mouse.y - blob.y;
        const dist = Math.hypot(dx, dy) || 1;
        const followRadius = viewportSpan() * 0.95;
        const orbitRadius = blob.radius * 0.9;
        const proximity = Math.max(0.12, 1 - dist / followRadius);
        const near = Math.min(1, dist / orbitRadius);
        const pull = (0.035 + proximity * 0.15) * near;
        blob.vx += (dx / dist) * pull;
        blob.vy += (dy / dist) * pull;

        const orbit = (0.05 + proximity * 0.1) * near;
        blob.vx += (-dy / dist) * orbit;
        blob.vy += (dx / dist) * orbit;
    }

    function applyMouseBehavior(blob) {
        if (!mouse.active) {
            return;
        }
        applyMouseFollow(blob);
    }

    function applyRandomMotion(blob, time) {
        const far = isFarFromMouse(blob);
        const nearEdge = isNearEdge(blob);
        const roaming = !mouse.active || far;
        let wander = far ? 0.055 : nearEdge ? 0.048 : 0.038;
        let driftScale = far ? 1.45 : nearEdge ? 1.25 : 1;
        let angleStep = far ? 0.022 : 0.012;
        let jitterChance = far ? 0.045 : 0.032;

        if (roaming) {
            wander *= 1.75;
            driftScale *= 1.4;
            angleStep = 0.034;
            jitterChance = 0.058;
            blob.wanderAngle += randomBetween(-0.12, 0.12);
        }

        blob.wanderAngle += blob.driftSpeed * (roaming ? 3.6 : 2.4);
        blob.vx +=
            Math.sin(time * blob.driftSpeed + blob.phase) * blob.driftAmp * driftScale +
            Math.sin(time * 0.00062 + blob.jitterPhase) * wander +
            Math.cos(blob.wanderAngle) * angleStep;
        blob.vy +=
            Math.cos(time * blob.driftSpeed * 1.13 + blob.phase * 0.7) * blob.driftAmp * driftScale +
            Math.cos(time * 0.00071 + blob.jitterPhase * 1.4) * wander +
            Math.sin(blob.wanderAngle) * angleStep;

        if (Math.random() < jitterChance) {
            const kick = roaming ? 0.62 : 0.45;
            blob.vx += randomBetween(-kick, kick);
            blob.vy += randomBetween(-kick, kick);
        }
    }

    function enforceMinWander(blob) {
        const far = isFarFromMouse(blob);
        const nearEdge = isNearEdge(blob);
        const corner = isInCorner(blob);
        let minSpeed = mouse.active ? 0.32 : 0.48;
        if (far) {
            minSpeed = 0.58;
        }
        if (nearEdge) {
            minSpeed = Math.max(minSpeed, 0.52);
        }
        if (corner) {
            minSpeed = Math.max(minSpeed, far ? 0.78 : 0.68);
        }

        const speed = Math.hypot(blob.vx, blob.vy);
        if (speed >= minSpeed) {
            return;
        }
        const boost = minSpeed - speed;
        blob.vx += Math.cos(blob.wanderAngle) * boost;
        blob.vy += Math.sin(blob.wanderAngle) * boost;
        blob.wanderAngle += randomBetween(-0.4, 0.4);
    }

    function updateBlob(blob, time, index) {
        applyRandomMotion(blob, time);
        applyEdgeForces(blob);
        applyMouseBehavior(blob);

        applySeparation(blob, index);
        applySeparation(blob, index);
        applySeparation(blob, index);

        applyEdgeForces(blob);
        enforceMinWander(blob);

        blob.vx *= mouse.active ? 0.982 : 0.99;
        blob.vy *= mouse.active ? 0.982 : 0.99;

        const speedCap = mouse.active ? 3.3 : 2.1;
        const speed = Math.hypot(blob.vx, blob.vy);
        if (speed > speedCap) {
            blob.vx = (blob.vx / speed) * speedCap;
            blob.vy = (blob.vy / speed) * speedCap;
        }

        blob.x += blob.vx;
        blob.y += blob.vy;

        resolveBounds(blob);
        if (isFarFromMouse(blob) || isInCorner(blob)) {
            enforceMinWander(blob);
        }
    }

    function drawMetaball(blob) {
        const dark = isDark();
        const [r, g, b, a] = blob.color;
        const core = Math.min(1, a * (dark ? 0.92 : 1.15));
        const drawRadius = blob.radius * (dark ? 1.08 : 1.14);
        const gradient = ctx.createRadialGradient(
            blob.x,
            blob.y,
            0,
            blob.x,
            blob.y,
            drawRadius
        );
        if (dark) {
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${core})`);
            gradient.addColorStop(0.22, `rgba(${r}, ${g}, ${b}, ${a * 0.55})`);
            gradient.addColorStop(0.48, `rgba(${r}, ${g}, ${b}, ${a * 0.26})`);
            gradient.addColorStop(0.72, `rgba(${r}, ${g}, ${b}, ${a * 0.08})`);
        } else {
            gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${core})`);
            gradient.addColorStop(0.16, `rgba(${r}, ${g}, ${b}, ${a * 0.82})`);
            gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${a * 0.48})`);
            gradient.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, ${a * 0.2})`);
        }
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(blob.x, blob.y, drawRadius, 0, Math.PI * 2);
        ctx.fill();
    }

    function renderMetaballs() {
        ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0);
        ctx.clearRect(0, 0, width, height);
        const dark = isDark();
        const blur = dark ? 32 : 24;
        const saturate = dark ? 1.1 : 1.5;
        ctx.filter = `blur(${blur}px) saturate(${saturate})`;
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < blobs.length; i += 1) {
            drawMetaball(blobs[i]);
        }

        ctx.filter = 'none';
        ctx.globalCompositeOperation = 'source-over';
    }

    function render(time) {
        animationId = window.requestAnimationFrame(render);

        if (isPaused || document.hidden) {
            return;
        }

        for (let i = 0; i < blobs.length; i += 1) {
            updateBlob(blobs[i], time, i);
        }

        renderMetaballs();
    }

    function refreshPalette() {
        const palette = isDark() ? palettes.dark : palettes.light;
        blobs.forEach((blob, index) => {
            blob.color = palette[index % palette.length];
        });
    }

    window.addEventListener('resize', scheduleResize, { passive: true });
    window.addEventListener('load', scheduleResize, { passive: true });

    let layoutObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
        layoutObserver = new ResizeObserver(scheduleResize);
        layoutObserver.observe(document.documentElement);
        layoutObserver.observe(document.body);
    }

    window.addEventListener('pointermove', setMouseFromEvent, { passive: true });

    window.addEventListener('pointerleave', () => {
        mouse.active = false;
    });

    window.addEventListener('pointerdown', setMouseFromEvent, { passive: true });

    document.addEventListener('visibilitychange', () => {
        isPaused = document.hidden;
    });

    const observer = new MutationObserver(refreshPalette);
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
    });

    resize();
    animationId = window.requestAnimationFrame(render);

    window.addEventListener('beforeunload', () => {
        window.cancelAnimationFrame(animationId);
        window.clearTimeout(resizeTimer);
        observer.disconnect();
        if (layoutObserver) {
            layoutObserver.disconnect();
        }
    });
})();
