from pathlib import Path
import re
P=Path(__file__).resolve().parent
OUT=P.parent/'local-artifacts'/'immersive-vibe'
s=(OUT/'Immersive-Vibe-v0.5.html').read_text()
game=(P/'src/ink-game.js').read_text()
s=s.replace('// src/main.js\nvar VERSION', game+'\n// src/main.js\nvar VERSION')
s=s.replace('this.worlds.register(LivingInk);','this.worlds.register(LivingInk);this.worlds.register(StrokeBreaker);')
s=s.replace('load("gallery")','load("stroke-breaker")').replace("load('gallery')","load('stroke-breaker')")
s=s.replace('Immersive Vibe','Stroke Breaker').replace('Stroke Breaker v0.7.0','Stroke Breaker v1.0.0').replace('Immersive<br><em>Vibe</em>','Stroke<br><em>Breaker</em>')
s=s.replace('Step into a painting.','Draw a stroke.').replace('Make it move.','Break the canvas.')
s=s.replace('Enter gallery ↗','Enter game ↗').replace('Art beyond the frame','Draw · Release · Break').replace('Immersive WebXR Gallery','WebXR Drawing Game')
s=s.replace('Gallery v${GALLERY_VERSION}','Stroke Breaker v1.0')
s=re.sub(r'<section class="worlds".*?</section>', '<section class="worlds" aria-label="How to play"><article><small>01</small><div><h2>Draw</h2><p>Pinch or hold your trigger</p></div></article><article><small>02</small><div><h2>Aim &amp; release</h2><p>Your stroke becomes a projectile</p></div></article><article><small>03</small><div><h2>Break the canvas</h2><p>Up to three hits per stroke</p></div></article><article><small>04</small><div><h2>Five levels</h2><p>Armored and moving targets</p></div></article></section>',s,flags=re.S)
s=s.replace("const stats=document.createElement('output');", "add('Retry level',()=>app.worlds.current?.retry?.());const stats=document.createElement('output');")
s=s.replace('failed:!!app.worlds._failed','failed:!!app.worlds._failed,level:app.worlds.current?.level,gameState:app.worlds.current?.state,shots:app.worlds.current?.shots,score:app.worlds.current?.score')
s=s.replace('export {\n  VERSION', "document.addEventListener('keydown',e=>{if(e.code==='KeyR'&&document.getElementById('overlay').classList.contains('hidden'))app.worlds.current?.retry?.();});\nexport {\n  VERSION")
(OUT/'Stroke-Breaker.html').write_text(s)
(OUT/'game-check.mjs').write_text(s.split('<script type="module">')[1].split('</script>')[0])
print('Built Stroke-Breaker.html')
