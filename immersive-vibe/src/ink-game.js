// Standalone Stroke Breaker game. Uses the same input and ribbon renderer as Living Ink.
class BreakerStroke extends YellowtailStroke {
  finish(){
    if(!super.finish())return false;
    const outward=this.head.clone().sub(this.center).normalize();
    this.heading.lerp(outward,.85).normalize();this.hits=new Set();this.power=3;return true;
  }
  steer(step){
    // A small aim assist rewards a near miss without steering behind the player.
    let best=null,alignment=.96;
    for(const brick of this.game.bricks){if(!brick.alive||this.hits.has(brick))continue;
      const d=brick.mesh.position.clone().sub(this.head),distance=d.length();if(distance<.001)continue;
      d.divideScalar(distance);const dot=this.heading.dot(d);if(dot>alignment){alignment=dot;best=d;}
    }
    if(best)this.heading.lerp(best,1-Math.exp(-step*1.4)).normalize();
  }
  advance(step){
    super.advance(step);
    for(const brick of this.game.bricks){
      if(!brick.alive||this.hits.has(brick))continue;
      // Swept capsule test: a fast tip cannot skip a brick between frames.
      const segment=this.head.clone().sub(this.previousHead),to=brick.mesh.position.clone().sub(this.previousHead);
      const u=this.T.MathUtils.clamp(to.dot(segment)/(segment.lengthSq()||1),0,1);
      const closest=this.previousHead.clone().addScaledVector(segment,u);
      if(closest.distanceToSquared(brick.mesh.position)<brick.radius*brick.radius){
        this.hits.add(brick);this.game.hit(brick);if(--this.power<=0)this.spent=true;
      }
    }
  }
  update(dt,speed,paused){
    super.update(dt,2.3,paused);
    if(this.released){const fade=this.T.MathUtils.smoothstep(this.distance,6,8);this.material.opacity*=1-fade;if(this.distance>=8)this.expired=true;}
    if(this.spent){this.material.opacity*=.5;this.expired=true;}
  }
}
const INK_LEVELS=[
  {name:'First marks',rows:2,cols:3,shots:7,armor:false,moving:false},
  {name:'A wider canvas',rows:2,cols:5,shots:12,armor:false,moving:false},
  {name:'Layers of color',rows:3,cols:4,shots:19,armor:true,moving:false},
  {name:'Drifting targets',rows:3,cols:5,shots:19,armor:false,moving:true},
  {name:'The living wall',rows:3,cols:6,shots:29,armor:true,moving:true}
];
var StrokeBreaker={
  ...LivingInk,id:'stroke-breaker',title:'Stroke Breaker',
  init(ctx){
    LivingInk.init.call(this,ctx);this.ctx=ctx;this.level=0;this.score=0;this.elapsed=0;this.effects=[];this.bricks=[];this.state='playing';
    this.title.visible=false;this.hint.visible=false;
    const T=ctx.THREE;this.hudCanvas=document.createElement('canvas');this.hudCanvas.width=1536;this.hudCanvas.height=256;
    this.hudTexture=new T.CanvasTexture(this.hudCanvas);this.hudTexture.colorSpace=T.SRGBColorSpace;
    this.hud=new T.Mesh(new T.PlaneGeometry(2.5,.417),new T.MeshBasicMaterial({map:this.hudTexture,transparent:true,depthWrite:false}));ctx.root.add(this.hud);
    this.startLevel(0);
  },
  startLevel(level){
    this.clear();for(const b of this.bricks){b.mesh.removeFromParent();b.mesh.geometry.dispose();b.mesh.material.dispose();}
    for(const e of this.effects)this.disposeEffect(e);this.effects=[];this.bricks=[];
    this.level=level;const config=INK_LEVELS[level];this.shots=config.shots;this.state='playing';this.advanceAt=null;this.levelScore=this.score;
    const T=this.ctx.THREE,app=this.ctx.app;this.anchor=headPos(app,new T.Vector3());
    const q=app.renderer.xr.isPresenting?app.renderer.xr.getCamera().quaternion:app.camera.quaternion;
    this.forward=new T.Vector3(0,0,-1).applyQuaternion(q);this.forward.y=0;this.forward.normalize();if(this.forward.lengthSq()<.01)this.forward.set(0,0,-1);
    this.right=new T.Vector3().crossVectors(this.forward,new T.Vector3(0,1,0)).normalize();
    this.hud.position.copy(this.anchor).addScaledVector(this.forward,2.85);this.hud.position.y+=.72;this.hud.lookAt(this.anchor);
    for(let row=0;row<config.rows;row++)for(let col=0;col<config.cols;col++){
      const angle=(col-(config.cols-1)/2)*.16,offset=(row-(config.rows-1)/2)*.37;
      const pos=this.anchor.clone().addScaledVector(this.forward,Math.cos(angle)*3).addScaledVector(this.right,Math.sin(angle)*3);pos.y+=offset;
      const hp=config.armor&&(row+col)%3===0?2:1,color=hp===2?'#faf8eb':this.palette[(row+level)%this.palette.length];
      const mesh=new T.Mesh(new T.BoxGeometry(.33,.25,.16),new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.65,roughness:.45,metalness:.05}));
      mesh.position.copy(pos);mesh.lookAt(this.anchor);this.ctx.root.add(mesh);
      this.bricks.push({mesh,base:pos.clone(),hp,alive:true,radius:.185,phase:col*.65+row*.9});
    }
    this.refreshHUD();
  },
  refreshHUD(){
    const g=this.hudCanvas.getContext('2d'),cfg=INK_LEVELS[this.level];g.clearRect(0,0,1536,256);
    g.fillStyle='rgba(23,29,47,.92)';g.fillRect(0,0,1536,256);g.textAlign='center';
    g.fillStyle='#f4ef34';g.font='600 48px Arial';
    const title=this.state==='won'?(this.level===4?'ALL FIVE LEVELS COMPLETE':'LEVEL COMPLETE'):this.state==='lost'?'OUT OF INK · TRY AGAIN':`LEVEL ${this.level+1} / 5 · ${cfg.name.toUpperCase()}`;
    g.fillText(title,768,65);g.fillStyle='#faf8eb';g.font='32px Arial';
    g.fillText(`${this.shots} STROKES LEFT     ·     ${this.bricks.filter(b=>b.alive).length} BRICKS     ·     SCORE ${this.score}`,768,123);
    g.fillStyle='#a9c2ed';g.font='27px Arial';
    g.fillText(this.state==='playing'?'Draw toward a brick. Release to launch. White bricks take two hits.':this.state==='lost'?'Palm up → Retry, or press R on desktop.':this.level===4?'Palm up → Restart to play again.':'Your next canvas arrives in a moment…',768,187);
    g.fillText('Each stroke can hit up to 3 bricks · aim gently assisted',768,228);this.hudTexture.needsUpdate=true;
  },
  begin(ctx,src){
    if(this.state!=='playing'||this.shots<=this.held.size)return null;
    const stroke=new BreakerStroke(ctx,this.palette[this.nextColor++%this.palette.length],this.nextColor);stroke.game=this;
    stroke.depth=src.kind==='hand'?.16:.72;ctx.root.add(stroke.root);stroke.add(this.pointFor(ctx,src,stroke));this.strokes.push(stroke);return stroke;
  },
  finish(src,stroke){
    if(stroke.finish()){this.shots--;this.refreshHUD();}else{this.strokes=this.strokes.filter(s=>s!==stroke);stroke.dispose();}
  },
  hit(brick){
    if(this.state!=='playing')return;brick.hp--;this.score+=brick.hp?25:100;
    brick.mesh.material.color.set('#f4ef34');brick.mesh.material.emissive.set('#f4ef34');
    if(brick.hp<=0){brick.alive=false;brick.mesh.visible=false;}
    const T=this.ctx.THREE;
    for(let i=0;i<7;i++){
      const mesh=new T.Mesh(new T.BoxGeometry(.035,.035,.035),new T.MeshBasicMaterial({color:brick.mesh.material.color,transparent:true}));mesh.position.copy(brick.mesh.position);this.ctx.root.add(mesh);
      this.effects.push({mesh,age:0,velocity:new T.Vector3(Math.sin(i*2.4)*.6,.3+Math.cos(i)*.35,Math.cos(i*2.4)*.6)});
    }
    this.ctx.app.audio?.click();
    if(this.bricks.every(b=>!b.alive)){this.state='won';this.score+=this.shots*50;this.advanceAt=this.elapsed+2.5;}
    this.refreshHUD();
  },
  retry(){this.score=this.levelScore;this.startLevel(this.level);},
  menuItems(ctx){
    const b=(label,fn)=>ctx.button(label,{w:.075,h:.026,fontSize:21,onClick:fn});
    return [b('Retry',()=>this.retry()),b('Restart',()=>{this.score=0;this.startLevel(0);}),ctx.button('Pause',{w:.075,h:.026,fontSize:21,toggle:true,value:false,onClick:v=>this.paused=v})];
  },
  // Developer QA fires a genuine swept-collision shot at a live brick.
  addDemo(ctx){
    if(this.state!=='playing'||this.shots<=0)return;
    const T=ctx.THREE,b=this.bricks.find(b=>b.alive),d=b.mesh.position.clone().sub(this.anchor).normalize();
    const stroke=new BreakerStroke(ctx,'#f4ef34',++this.nextColor);stroke.game=this;
    for(let i=0;i<24;i++)stroke.add(this.anchor.clone().addScaledVector(d,.35+i*.018));
    ctx.root.add(stroke.root);this.strokes.push(stroke);this.finish(null,stroke);
  },
  disposeEffect(e){e.mesh.removeFromParent();e.mesh.geometry.dispose();e.mesh.material.dispose();},
  update(dt,t,ctx){
    if(this.paused){this.syncEnvironment(ctx.app);return;}dt=Math.min(dt,.1);this.elapsed+=dt;
    if(INK_LEVELS[this.level].moving)for(const b of this.bricks)if(b.alive)b.mesh.position.copy(b.base).addScaledVector(this.right,Math.sin(this.elapsed*.65+b.phase)*.12);
    freeSelects(ctx.app,s=>this.begin(ctx,s),(s,stroke)=>stroke.add(this.pointFor(ctx,s,stroke)),(s,stroke)=>this.finish(s,stroke),this.held);
    for(const stroke of this.strokes)stroke.update(dt,1,false);
    this.strokes=this.strokes.filter(stroke=>{if(!stroke.expired)return true;stroke.dispose();return false;});
    this.effects=this.effects.filter(e=>{e.age+=dt;e.mesh.position.addScaledVector(e.velocity,dt);e.mesh.material.opacity=Math.max(0,1-e.age/.65);if(e.age<.65)return true;this.disposeEffect(e);return false;});
    if(this.state==='playing'&&this.shots===0&&!this.strokes.length&&!this.held.size){this.state='lost';this.refreshHUD();}
    if(this.state==='won'&&this.level<4&&this.elapsed>=this.advanceAt)this.startLevel(this.level+1);
    this.syncEnvironment(ctx.app);
  },
  exit(ctx){this.clear();this.bricks=[];this.effects=[];exitArtWorld(this,ctx);}
};
