from pathlib import Path
import math,re
P=Path(__file__).resolve().parent
s=(P/'original-codepen.html').read_text()
# Keep the application worlds while taking the interaction, visuals, UI and
# world-lifecycle core from the latest framework Pen.
framework=(P/'framework-v0.8.22.html').read_text()
for start,end in [
    ('// src/interaction.js','// src/visuals.js'),
    ('// src/visuals.js','// src/ui.js'),
    ('// src/ui.js','// src/world.js'),
    ('// src/world.js','// src/worlds/playground.js'),
]:
    a=s.index(start); b=s.index(end,a)
    fa=framework.index(start); fb=framework.index(end,fa)
    s=s[:a]+framework[fa:fb]+s[b:]
s=re.sub(r'var VERSION = "[^"]+";', 'var VERSION = "0.8.22";', s, count=1)
s=s.replace('built on VibeXR Interaction Framework v0.8.7','built on VibeXR Interaction Framework v0.8.22')
cover=(P/'src/cover.html').read_text()
paths=[]
for i in range(34):
    pts=[]
    for j in range(65):
        t=j/64*math.pi*2;r=30+i*6.3
        x=300+math.cos(t+i*.067)*r*(.75+.18*math.sin(t*3+i*.055))
        y=285+math.sin(t+i*.067)*r*(.66+.22*math.cos(t*2+i*.08))
        pts.append(f'{x:.1f},{y:.1f}')
    paths.append(f'<path d="M'+ ' L'.join(pts)+f'" opacity="{.25+i/170:.2f}"/>')
cover=cover.replace('{{ORB_PATHS}}','\n'+'\n'.join(paths)+'\n')
a=s.index('<style>');b=s.index('<script type="importmap">')
s=s[:a]+cover+'\n'+s[b:]
a=s.index('<div id="overlay">',s.index('<script type="importmap">'));b=s.index('<script type="module">',a)
s=s[:a]+s[b:]
s=s.replace('var GALLERY_VERSION = "0.4";','var GALLERY_VERSION = "0.5.0";')
s=s.replace('// src/main.js\nvar VERSION', (P/'src/audio.js').read_text()+'\n'+(P/'src/ink.js').read_text()+'\n// src/main.js\nvar VERSION')
s=s.replace('this.worlds = new WorldManager(this);','this.worlds = new WorldManager(this);\n    this.audio = new GalleryAudio();\n    document.addEventListener("visibilitychange",()=>{this.audio.sync(); if(!document.hidden && this.audio.active) void this.audio.unlock();});\n    window.addEventListener("pagehide",()=>this.audio.setActive(false));')
s=s.replace('this.worlds.register(QianliJiangshan);','this.worlds.register(QianliJiangshan);\n    this.worlds.register(LivingInk);')
s=s.replace('home: b("Home", { onClick:', 'sound: b("Sound", { toggle:true, value:true, onClick:v=>{this.audio.setEnabled(v);syncSoundButton();} }),\n      home: b("Home", { onClick:')
s=s.replace('[m.home, m.vst, m.gain,','[m.home, m.sound, m.vst, m.gain,')
s=s.replace('async enterXR(mode) {','async enterXR(mode) {\n    if(this._entering || this.sessionMode) return;\n    this._entering=true;\n    document.getElementById("error").hidden=true;\n    void this.audio.unlock();\n    let pendingSession=null;')
s=s.replace('if (!navigator.xr) return this.error("WebXR is not available in this browser.");','if (!navigator.xr) {this._entering=false;return this.error("WebXR is not available in this browser.");}')
s=s.replace('const session = await navigator.xr.requestSession(type, {','const session = pendingSession = await navigator.xr.requestSession(type, {')
s=s.replace('this.mouse.tracked = false;','this.audio.setActive(true);\n      session.addEventListener("visibilitychange",()=>this.audio.setActive(session.visibilityState==="visible"));\n      this.mouse.tracked = false;')
s=s.replace('this.error(`Could not start ${type}: ${e.message}`);\n    }','this.audio.setActive(false);\n      if(pendingSession) await pendingSession.end().catch(()=>{});\n      this.error(`Could not start ${type}: ${e.message}`);\n    } finally { this._entering=false; }')
s=s.replace('_onSessionEnd() {','_onSessionEnd() {\n    this.audio.setActive(false);\n    this._calibrate=0;')
s=s.replace('if (e.type === "statechange" || e.type === "drag") return;', 'if(e.type === "press") this.audio.click();\n    if (e.type === "statechange" || e.type === "drag") return;')
s=s.replace('app.onWorldChanged = (w, c) => setWorldMenu(app, w, c);','app.onWorldChanged = (w,c)=>{setWorldMenu(app,w,c);app.audio.setWorld(w.id);};')
s=s.replace('document.getElementById("ver").textContent', '''function syncSoundButton(){const b=document.getElementById('sound');b.setAttribute('aria-pressed',String(app.audio.enabled));b.textContent=app.audio.enabled?'Sound on · ambient & interaction':'Sound off';app.menuButtons.sound.setValue(app.audio.enabled);}
document.getElementById('sound').onclick=()=>{app.audio.setEnabled(!app.audio.enabled);syncSoundButton();};
document.getElementById("ver").textContent''')
s=s.replace('WebXR not available - desktop preview (left-click = ray pinch, wheel while dragging = push / pull, right-drag = orbit)','Open this gallery in a WebXR-compatible headset browser to enter.')
s=s.replace('No immersive mode on this device - desktop preview','Headset required. Open this page in your headset browser.')
s=s.replace('"Ready" :','"Ready. Put on your headset and enter the gallery." :')
s=s.replace('"Enter (VR only)"','"Enter gallery ↗"')
# An uneven spatial cluster with bounded jitter keeps portals distinct and reachable.
s=s.replace('const n = ART.length, gap = 0.62;', """const portalSpots = [
      [-.64,.40,-1.05],[-.23,.16,-.72],[.22,.57,-1.19],[.66,.25,-.88]
    ];""")
s=s.replace('const x = (i - (n - 1) / 2) * gap, z = -0.85;', """const spot=portalSpots[i];
      const x=spot[0]+(Math.random()-.5)*.06;
      const y=top+spot[1]+(Math.random()-.5)*.04;
      const z=spot[2]+(Math.random()-.5)*.06;""")
s=s.replace('ball.position.set(x, top + 0.26, z)', 'ball.position.set(x, y, z)')
s=s.replace('title.position.set(x, top + 0.45, z)', 'title.position.set(x, y + .20, z)')
s=s.replace('by.position.set(x, top + 0.415, z)', 'by.position.set(x, y + .165, z)')
s=s.replace('s.ball.position.y = s.base.y + br * 0.022 + br2 * 0.004;', """s.ball.position.set(
          s.base.x+Math.sin(t*.31+s.phase)*.015,
          s.base.y+br*.022+br2*.004,
          s.base.z+Math.sin(t*.23+s.phase*1.4)*.012);
        s.labels.forEach((label,j)=>label.position.copy(s.ball.position).add(new T.Vector3(0,j===0?.20:.165,0)));""".replace('new T.Vector3','new ctx.THREE.Vector3'))
s=s.replace('ctx.label(a.title, { height: 0.03','ctx.label(a.title, { height: 0.025')
s=s.replace('`${a.byline}  \\u00b7  tap to enter`, { height: 0.016','`${a.byline}`, { height: 0.011')
s=s.replace('  { id: "qianli-jiangshan", title:', '  { id:"living-ink", title:"Living Ink", byline:"Rongxuan Mu · a study in movement", glsl:`vec3 art(vec3 p,vec3 n,float t){float ink=fbm(p*8.);float brush=sin(p.x*12.+p.y*5.+fbm(p*4.)*8.);vec3 paper=vec3(.88,.84,.73);return mix(paper,vec3(.055,.11,.1),smoothstep(.3,.55,brush)*smoothstep(.35,.55,ink));}` },\n  { id: "qianli-jiangshan", title:')
# Reorder Ink fourth (after Qianli) without affecting source definitions.
a=s.index('var ART = [');b=s.index('\n];',a)
lines=s[a:b].splitlines();ink=next(l for l in lines if 'id:"living-ink"' in l);lines.remove(ink);lines[-1]+=',';lines.append(ink.rstrip(','));s=s[:a]+'\n'.join(lines)+s[b:]
# Soft asymmetric silhouettes retain the existing painted textures and interaction bounds.
s=s.replace('const ball = new T.Mesh(new T.SphereGeometry(0.12, 48, 32), mat);', '''const organicGeo=new T.SphereGeometry(0.12,48,32);
      const positions=organicGeo.attributes.position;
      for(let j=0;j<positions.count;j++){
        const x=positions.getX(j),y=positions.getY(j),z=positions.getZ(j);
        const swell=1+.10*Math.sin(x*24+i*1.7)*Math.cos(y*19-z*16)+.055*Math.sin(y*35+z*22+i);
        positions.setXYZ(j,x*swell*(1+i*.025),y*swell*(1.08-i*.025),z*swell);
      }
      organicGeo.computeVertexNormals();organicGeo.computeBoundingSphere();
      const ball = new T.Mesh(organicGeo, mat);''')
s=s.replace('new T.SphereGeometry(0.128, 32, 20)', 'organicGeo.clone().scale(1.065,1.065,1.065)')
# Hide idle far affordances; targeting and free-space gestures remain active.
s=s.replace('const farOn = a === g.far && this.showRay;', 'const farOn = a === g.far && this.showRay && s.ray.valid && !!(g.far.hover || g.far.selecting);')
# Prevent asynchronous world-load races, release world menu resources and retain cached previews.
a=s.index('  async load(id) {',s.index('var WorldManager'));b=s.index('  unload() {',a)
s=s[:a]+'''  async load(id) {
    if(this._loading){this._queued=id;return;}
    this._loading=true;
    try {
      const w=this.worlds.get(id);if(!w)throw new Error(`unknown world ${id}`);
      this.unload();const ctx=this._makeCtx(w);this.ctx=ctx;this.current=w;this._failed=false;
      try {await w.init?.(ctx);w.enter?.(ctx);this.app.onWorldChanged?.(w,ctx);this.app.log(`world → ${w.title||id}`);}
      catch(e){console.error(e);this.unload();this.app.error(`Could not open ${w.title||id}. Returning to the gallery.`);if(id!=="gallery")this._queued="gallery";}
    } finally {this._loading=false;const next=this._queued;this._queued=null;if(next)await this.load(next);}
  }
'''+s[b:]
s=s.replace('    ctx.root.removeFromParent();\n    ctx.root.traverse', '''    // Menu buttons are reparented outside the world root; reclaim them as well.
    for(const it of ctx._owned) if(!ctx.root.getObjectById(it.object.id)) {it.object.removeFromParent();ctx.root.add(it.object);}
    ctx.root.removeFromParent();
    const disposed=new Set();
    ctx.root.traverse''')
s=s.replace('o.geometry?.dispose?.();\n      const mats', 'if(o.geometry && !disposed.has(o.geometry)){disposed.add(o.geometry);o.geometry.dispose();}\n      const mats')
s=s.replace('for (const k in m) if (m[k]?.isTexture) m[k].dispose();\n        m.dispose();', 'if(disposed.has(m))continue;disposed.add(m);\n        for(const k in m) if(m[k]?.isTexture && !m[k].userData.sharedPreview && !disposed.has(m[k])){disposed.add(m[k]);m[k].dispose();}\n        m.dispose();')
s=s.replace('if (!this.current?.update) return;', 'if (this._loading || this._failed || !this.current?.update) return;')
s=s.replace('this.current.update = null;', 'this._failed = true;')
s=s.replace('PREVIEW_CACHE.set(art.id, rt.texture);','rt.texture.userData.sharedPreview=true;\n  PREVIEW_CACHE.set(art.id, rt.texture);')
# Qianli upgrades limited to that world.
a=s.index('function buildQianli(');b=s.index('var GALLERY_VERSION',a);q=s[a:b]
q=q.replace('  const pick =', '  let seed=73021;\n  const random=()=>((seed=(1664525*seed+1013904223)>>>0)/4294967296);\n  const pick =').replace('Math.random()', 'random()')
q=q.replace('const SCROLL_STRETCH = 1.45','const SCROLL_STRETCH = 2.0')
q=q.replace('float a = 1.0 - smoothstep(0.35, 1.0, d);', '''float grain=fract(sin(dot(floor(vUv*vec2(75.,13.)),vec2(12.9898,78.233)))*43758.5453);
      float a = (1.0 - smoothstep(0.38, 1.0, d)) * (.78+.22*grain);''')
q=q.replace('const MTN_N = 18000, MIST_N = 600, TREE_N = 2600, WAVE_N = 3000;', 'const MTN_N = 14000, MIST_N = 460, TREE_N = 3200, WAVE_N = 2200;')
q=q.replace('    return v;','    return v * (.88+.08*Math.sin(az*23+k)+.035*Math.sin(az*59+k*1.7)+.025*Math.cos(az*101));')
q=q.replace('  const RANGE_W =', (P/'src/mountains.js').read_text()+'\n  const RANGE_W =')
q=q.replace('place(az + rnd(-0.02, 0.02), rg.d + rnd(-4, 4) * (1 + ri), y + 0.3, rg.w)', 'place(az, rg.d + (1-hi)*6*(1+ri*.4)-.4, y + .12, rg.w)')
q=q.replace('rnd(2.2, 5.0) * sc, rnd(0.45, 0.95) * sc', 'rnd(.55, 1.55) * sc, rnd(.2, .55) * sc')
q=q.replace('(0.85 + random() * 0.15) * (1 - fade * 0.2)', '(.65 + random() * .2) * (1 - fade * .3)')
q=q.replace('    buildMountains(); buildTrees(); buildMist(); buildWaves();', '    seed=73021;\n    buildUnderpainting();buildMountains(); buildTrees(); buildMist(); buildWaves();')
q=q.replace('      h.wasActive = true;','      h.wasActive = true;')
q=q.replace('  // ── per-frame', '  // ── per-frame')
q=q.replace('    simT += dt;', '    for(const h of Object.values(hands)) if(!h.active) h.wasActive=false;\n    simT += dt;')
q=q.replace('mist.home[i3] += Math.sin(t * 0.13 + ph) * 0.006;', 'mist.home[i3] += Math.sin(t * 0.13 + ph) * .36 * dt;')
q=q.replace('mist.home[i3 + 1] += Math.cos(t * 0.09 + ph) * 0.003;', 'mist.home[i3 + 1] += Math.cos(t * 0.09 + ph) * .18 * dt;')
q=q.replace('L.vel[i3 + c] *= damp;', 'L.vel[i3 + c] *= Math.pow(damp,dt*60);')
q=q.replace('if (stir.length) {                                     // a hard pinch shakes the pines', '{ // Continue settling after release; never leave trees suspended.')
q=q.replace('N: MTN_N + TREE_N + MIST_N + WAVE_N','N: MTN_N + TREE_N + MIST_N + WAVE_N + contour.n')
s=s[:a]+q+s[b:]
# Paper grain and a river band give the scroll a readable foreground.
a=s.index('function buildQianli(');b=s.index('var GALLERY_VERSION',a);q=s[a:b]
q=q.replace('new THREE.MeshBasicMaterial({ color: 0xd9c79c, fog: false })', '''new THREE.ShaderMaterial({vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 vUv;void main(){float grain=fract(sin(dot(vUv,vec2(127.1,311.7)))*43758.5453);float weave=sin(vUv.x*1400.)*sin(vUv.y*900.);vec3 silk=vec3(.80,.76,.63)+grain*.026+weave*.009;float river=(1.-smoothstep(.25,.46,vUv.y))*smoothstep(.04,.21,vUv.y);float wave=sin(vUv.y*430.+sin(vUv.x*50.)*.8);silk=mix(silk,vec3(.58,.69,.64),river*.3);silk-=vec3(.018)*river*pow(max(0.,wave),18.);gl_FragColor=vec4(silk,1.);}`})''')
s=s[:a]+q+s[b:]
# Reset transient state on re-entry.
s=s.replace('this.qj = buildQianli(T, root, app);','this.hot=false;\n    this.qj = buildQianli(T, root, app);')
s=s.replace('<!-- VibeXR Gallery v0.4','<!-- Immersive Vibe v0.5.0')
# Explicit opt-in developer QA only, never a desktop-experience CTA.
qa='''
if(new URLSearchParams(location.search).get('qa')==='1'){
 const panel=document.createElement('div');panel.id='qa';panel.style='position:fixed;bottom:8px;left:8px;z-index:20;display:flex;gap:6px;flex-wrap:wrap;max-width:95vw';
 const add=(name,fn)=>{const b=document.createElement('button');b.textContent=name;b.style='font-size:11px;padding:8px 12px';b.onclick=fn;panel.append(b);};
 add('Cover',()=>overlay.show());add('Gallery',()=>{overlay.hide();void app.worlds.load('gallery');});
 ART.forEach(a=>add(a.title,()=>{overlay.hide();void app.worlds.load(a.id);}));
 for(const mode of ['scroll','globe','immersive'])add(mode,()=>{if(app.worlds.current?.qj)app.worlds.current.qj.setMode(mode);});
 add('Stroke test',()=>app.worlds.current?.addDemo?.(app.worlds.ctx));
 add('Clear',()=>app.worlds.current?.clear?.());
 add('Audio test',()=>{app.audio.setActive(!app.audio.active);app.audio.click();});
 const stats=document.createElement('output');stats.id='qa-stats';stats.style='font:10px monospace;color:white;align-self:center';panel.append(stats);
 setInterval(()=>{stats.textContent=JSON.stringify({world:app.worlds.current?.id,geometries:app.renderer.info.memory.geometries,textures:app.renderer.info.memory.textures,draws:app.renderer.info.render.calls,strokes:app.worlds.current?.strokes?.length,audio:app.audio.ctx?.state,points:app.worlds.current?.strokes?.reduce((n,s)=>n+s.points.length,0),failed:!!app.worlds._failed});},1000);
 document.body.append(panel);
}
'''
# Use one direct headset entry point. The browser selects AR when available and
# falls back to VR; there is no secondary or redirect button.
start=s.index('var arBtn = document.getElementById("enter-ar");')
end=s.index('export {',start)
s=s[:start]+'''var arBtn = document.getElementById("enter-ar");
arBtn.onclick = () => app.enterXR(app.preferredXRMode || "vr");
(async () => {
  if (!navigator.xr) {
    arBtn.disabled = true;
    overlay.status("Open this page in a WebXR-compatible headset browser.");
    return;
  }
  const [vr, ar] = await Promise.all(["immersive-vr", "immersive-ar"].map((m) => navigator.xr.isSessionSupported(m).catch(() => false)));
  app.preferredXRMode = ar ? "ar" : vr ? "vr" : null;
  arBtn.disabled = !app.preferredXRMode;
  overlay.status(app.preferredXRMode ? "Ready. Put on your headset and enter the gallery." : "No immersive session is available in this browser.");
})();
''' + s[end:]
s=s.replace('export {\n  VERSION',qa+'\nexport {\n  VERSION')
(P/'Immersive-Vibe-v0.5.html').write_text(s)
# Syntax check uses the identical module body that CodePen executes.
(P/'module-check.mjs').write_text(s.split('<script type="module">')[1].split('</script>')[0])
print(f'Built {len(s):,} characters → {P/"Immersive-Vibe-v0.5.html"}')
