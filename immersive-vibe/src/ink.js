// A spatial interpretation of Golan Levin's Processing Yellowtail study.
// Draw in the air, release, and the finished mark continually travels along
// the three-dimensional track recorded by the hand or controller.
class YellowtailStroke {
  constructor(ctx,color,index){
    const T=ctx.THREE;this.T=T;this.root=new T.Group();this.points=[];this.released=false;this.distance=0;this.expired=false;
    this.geometry=new T.BufferGeometry();this.positions=new Float32Array(180*8*3);this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    const indices=[];for(let i=0;i<179;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8;indices.push(a,b,a+8,b,b+8,a+8);}
    this.geometry.setIndex(indices);this.geometry.setDrawRange(0,0);
    this.material=new T.MeshBasicMaterial({color,transparent:true,opacity:1,side:T.DoubleSide});
    this.mesh=new T.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.root.add(this.mesh);
    this.tangent=new T.Vector3();this.side=new T.Vector3();this.up=new T.Vector3();this.axis=new T.Vector3();
  }
  add(p){
    if(this.points.length&&this.points.at(-1).distanceToSquared(p)<.000064)return;
    this.points.push(p.clone());if(this.points.length>180)this.points.shift();this.render();
  }
  render(){
    const n=this.points.length;if(n<2)return;
    for(let i=0;i<n;i++){
      const p=this.points[i],prev=this.points[Math.max(0,i-1)],next=this.points[Math.min(n-1,i+1)];
      this.tangent.copy(next).sub(prev).normalize();this.axis.set(Math.abs(this.tangent.y)>.9?1:0,Math.abs(this.tangent.y)>.9?0:1,0);
      this.side.crossVectors(this.tangent,this.axis).normalize();this.up.crossVectors(this.side,this.tangent).normalize();
      const u=i/(n-1),width=.002+.014*Math.pow(Math.sin(Math.PI*u),.65);
      for(let j=0;j<8;j++){const a=j/8*Math.PI*2,k=(i*8+j)*3;
        this.positions[k]=p.x+this.side.x*Math.cos(a)*width+this.up.x*Math.sin(a)*width*.3;
        this.positions[k+1]=p.y+this.side.y*Math.cos(a)*width+this.up.y*Math.sin(a)*width*.3;
        this.positions[k+2]=p.z+this.side.z*Math.cos(a)*width+this.up.z*Math.sin(a)*width*.3;
      }
    }
    this.geometry.setDrawRange(0,(n-1)*48);this.geometry.attributes.position.needsUpdate=true;
  }
  finish(){
    if(this.points.length<3)return false;
    const T=this.T;this.released=true;this.steps=[];
    for(let i=1;i<this.points.length;i++)this.steps.push(this.points[i].clone().sub(this.points[i-1]));
    // Repeat the recorded gesture's increments forward, like Yellowtail, never reverse.
    this.stepIndex=0;this.progress=0;this.travel=new T.Vector3();
    this.drift=this.points.at(-1).clone().sub(this.points[0]);
    if(this.drift.length()<.12)this.drift.copy(this.steps.at(-1)).normalize().multiplyScalar(.3);
    else this.drift.setLength(.25);
    this.drift.divideScalar(this.steps.length);return true;
  }
  update(dt,speed,paused){
    if(!this.released||paused||this.expired)return;
    this.progress+=dt*speed*55;
    while(this.progress>=1&&!this.expired){
      this.progress--;this.travel.copy(this.steps[this.stepIndex++%this.steps.length]).add(this.drift);
      const next=this.points.at(-1).clone().add(this.travel);this.points.shift();this.points.push(next);this.distance+=this.travel.length();
      if(this.distance>=6)this.expired=true;
    }
    this.material.opacity=1-this.T.MathUtils.smoothstep(this.distance,3.5,6);this.render();
  }
  dispose(){this.root.removeFromParent();this.geometry.dispose();this.material.dispose();}
}

var LivingInk={
  id:'living-ink',title:'Living Ink',
  init(ctx){
    const {root,THREE:T,app}=ctx;enterArtWorld(this,ctx);setImmersive(app,false);
    this.environment=new T.Group();root.add(this.environment);
    this.strokes=[];this.held=new Map();this.speed=1;this.paused=false;this.palette=['#f4ef34','#76a4ee','#f4f0e4','#c48ce6','#6ee7d2'];this.nextColor=0;
    const dome=new T.Mesh(new T.SphereGeometry(38,32,16),new T.MeshBasicMaterial({color:0x171d2f,side:T.BackSide}));this.environment.add(dome);
    const floor=new T.Mesh(new T.CircleGeometry(14,64),new T.MeshBasicMaterial({color:0x111629}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.05;this.environment.add(floor);
    const rings=new T.Group();for(let i=1;i<=6;i++){const r=new T.Mesh(new T.RingGeometry(i*1.1,i*1.1+.006,96),new T.MeshBasicMaterial({color:i%2?0x76a4ee:0xf4ef34,transparent:true,opacity:.1,side:T.DoubleSide}));r.rotation.x=-Math.PI/2;r.position.y=-1.045;rings.add(r);}this.environment.add(rings);
    const head=headPos(app,new T.Vector3()),q=app.renderer.xr.isPresenting?app.renderer.xr.getCamera().quaternion:app.camera.quaternion;
    const f=new T.Vector3(0,0,-1).applyQuaternion(q);f.y=0;if(f.lengthSq()<.01)f.set(0,0,-1);f.normalize();
    this.title=ctx.label('SPATIAL YELLOWTAIL',{height:.052,color:'#f4ef34'});this.title.position.copy(head).addScaledVector(f,1.45);this.title.position.y+=.64;this.title.quaternion.copy(q);root.add(this.title);
    this.hint=ctx.label('Pinch or hold the trigger to draw in space. Release to set the stroke in motion.',{height:.017,color:'#f4f0e4'});this.hint.position.copy(head).addScaledVector(f,1.44);this.hint.position.y+=.54;this.hint.quaternion.copy(q);root.add(this.hint);
    this.syncEnvironment(app);
  },
  syncEnvironment(app){
    // In AR the framework backdrop controls room visibility via the hand menu.
    this.environment.visible=app.sessionMode!=='ar';
    if(this.environment.visible)ownSky(app,true);
  },
  pointFor(ctx,src,stroke){
    const T=ctx.THREE;
    if(src.kind==='hand'&&src.nearPoint)return src.nearPoint.clone();
    const depth=stroke?.depth||.72;
    if(src.ray?.valid)return src.ray.origin.clone().addScaledVector(src.ray.dir,depth);
    return headPos(ctx.app,new T.Vector3()).add(new T.Vector3(0,0,-depth));
  },
  begin(ctx,src){
    if(this.strokes.length>=12){const old=this.strokes.shift();old.dispose();}
    const stroke=new YellowtailStroke(ctx,this.palette[this.nextColor++%this.palette.length],this.nextColor);
    stroke.depth=src.kind==='hand' ? .16 : .72;ctx.root.add(stroke.root);stroke.add(this.pointFor(ctx,src,stroke));this.strokes.push(stroke);return stroke;
  },
  finish(src,stroke){if(!stroke.finish()){const i=this.strokes.indexOf(stroke);if(i>=0)this.strokes.splice(i,1);stroke.dispose();}},
  clear(){for(const stroke of this.strokes)stroke.dispose();this.strokes=[];this.held?.clear();},
  addDemo(ctx){
    if(!ctx)return;const T=ctx.THREE,stroke=new YellowtailStroke(ctx,this.palette[this.nextColor++%this.palette.length],this.nextColor);
    const head=headPos(ctx.app,new T.Vector3());for(let i=0;i<92;i++){const a=i/91*Math.PI*2;stroke.add(new T.Vector3(Math.cos(a)*.42,Math.sin(a*2)*.16,Math.sin(a)*.28).add(head).add(new T.Vector3(0,0,-1)));}
    ctx.root.add(stroke.root);stroke.finish();this.strokes.push(stroke);
  },
  menuItems(ctx){
    const b=(label,fn)=>ctx.button(label,{w:.075,h:.026,fontSize:21,onClick:fn});
    return [b('Slower',()=>this.speed=Math.max(.25,this.speed*.75)),b('Faster',()=>this.speed=Math.min(3,this.speed*1.3)),ctx.button('Pause',{w:.075,h:.026,fontSize:21,toggle:true,value:false,onClick:v=>this.paused=v}),b('Clear',()=>this.clear())];
  },
  update(dt,t,ctx){
    freeSelects(ctx.app,src=>this.begin(ctx,src),(src,stroke)=>stroke.add(this.pointFor(ctx,src,stroke)),(src,stroke)=>this.finish(src,stroke),this.held);
    for(const stroke of this.strokes)stroke.update(dt,this.speed,this.paused);
    this.strokes=this.strokes.filter(stroke=>{if(!stroke.expired)return true;stroke.dispose();return false;});this.syncEnvironment(ctx.app);
  },
  exit(ctx){this.clear();exitArtWorld(this,ctx);this.title=this.hint=this.environment=null;}
};
