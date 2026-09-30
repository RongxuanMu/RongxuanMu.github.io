// Spatial Yellowtail: smoothed centerline, rotation-minimizing frames and guided flight.
class YellowtailStroke {
  constructor(ctx,color,index){
    const T=ctx.THREE;this.T=T;this.ctx=ctx;this.index=index;this.root=new T.Group();this.points=[];this.released=false;this.distance=0;this.age=0;this.expired=false;
    this.geometry=new T.BufferGeometry();this.positions=new Float32Array(180*8*3);this.geometry.setAttribute('position',new T.BufferAttribute(this.positions,3).setUsage(T.DynamicDrawUsage));
    const indices=[];for(let i=0;i<179;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8;indices.push(a,b,a+8,b,b+8,a+8);}
    this.geometry.setIndex(indices);this.geometry.setDrawRange(0,0);
    this.material=new T.MeshBasicMaterial({color,transparent:true,opacity:1,side:T.DoubleSide,depthWrite:false});
    this.mesh=new T.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.root.add(this.mesh);
    this.tangent=new T.Vector3();this.side=new T.Vector3();this.up=new T.Vector3();
    this.seedSide=null;this.seedTangent=null;this.spin=new T.Quaternion();this.renderPoints=[];
    this.smoothA=Array.from({length:180},()=>new T.Vector3());this.smoothB=Array.from({length:180},()=>new T.Vector3());
    this.tangents=Array.from({length:180},()=>new T.Vector3());this.lengths=new Float32Array(180);
    this.steerTangent=new T.Vector3();this.turnQ=new T.Quaternion();this.viewer=new T.Vector3();
  }
  add(p){
    if(this.released||!Number.isFinite(p.x+p.y+p.z))return;
    if(this.points.length&&this.points.at(-1).distanceToSquared(p)<.000064)return;
    this.points.push(p.clone());if(this.points.length>180)this.points.shift();this.render();
  }
  render(){
    const n=this.points.length;if(n<2)return;
    // Two gentle low-pass passes remove tracking corners without rounding away the gesture.
    let pts=this.smoothA,other=this.smoothB;
    for(let i=0;i<n;i++)pts[i].copy(this.points[i]);
    for(let pass=0;pass<2;pass++){
      for(let i=0;i<n;i++){other[i].copy(pts[i]);if(i>0&&i<n-1)other[i].multiplyScalar(.5).addScaledVector(pts[i-1],.25).addScaledVector(pts[i+1],.25);}
      [pts,other]=[other,pts];
    }
    this.renderPoints=pts;const tangents=this.tangents;
    for(let i=0;i<n;i++){
      tangents[i].copy(pts[Math.min(n-1,i+1)]).sub(pts[Math.max(0,i-1)]);
      if(tangents[i].lengthSq()<1e-10){if(i)tangents[i].copy(tangents[i-1]);else tangents[i].set(0,0,-1);}
      tangents[i].normalize();
    }
    // Carry the first frame between updates, then parallel-transport it down the curve.
    if(this.seedSide){
      this.spin.setFromUnitVectors(this.seedTangent,tangents[0]);this.side.copy(this.seedSide).applyQuaternion(this.spin);
    }else{
      this.side.set(1,0,0);if(Math.abs(tangents[0].x)>.85)this.side.set(0,0,1);
    }
    this.side.addScaledVector(tangents[0],-this.side.dot(tangents[0])).normalize();
    if(!this.seedSide){this.seedSide=new this.T.Vector3();this.seedTangent=new this.T.Vector3();}this.seedSide.copy(this.side);this.seedTangent.copy(tangents[0]);
    let arc=0;const lengths=this.lengths;lengths[0]=0;for(let i=1;i<n;i++){arc+=pts[i].distanceTo(pts[i-1]);lengths[i]=arc;}
    for(let i=0;i<n;i++){
      if(i){this.spin.setFromUnitVectors(tangents[i-1],tangents[i]);this.side.applyQuaternion(this.spin);}
      this.tangent.copy(tangents[i]);this.side.addScaledVector(this.tangent,-this.side.dot(this.tangent)).normalize();
      this.up.crossVectors(this.side,this.tangent).normalize();
      const u=arc?Math.min(1,lengths[i]/arc):i/(n-1),width=.002+.016*Math.pow(Math.sin(Math.PI*u),.7),p=pts[i];
      for(let j=0;j<8;j++){const a=j/8*Math.PI*2,k=(i*8+j)*3;
        const w=Math.cos(a)*width,h=Math.sin(a)*width*.32;
        this.positions[k]=p.x+this.side.x*w+this.up.x*h;
        this.positions[k+1]=p.y+this.side.y*w+this.up.y*h;
        this.positions[k+2]=p.z+this.side.z*w+this.up.z*h;
      }
    }
    this.geometry.setDrawRange(0,(n-1)*48);this.geometry.attributes.position.needsUpdate=true;
  }
  finish(){
    if(this.points.length<3)return false;
    const T=this.T;this.render();this.points=this.renderPoints.slice(0,this.points.length).map(p=>p.clone());
    this.arc=[0];for(let i=1;i<this.points.length;i++)this.arc.push(this.arc.at(-1)+this.points[i].distanceTo(this.points[i-1]));
    this.length=this.arc.at(-1);if(this.length<.025)return false;
    this.released=true;this.head=this.points.at(-1).clone();this.previousHead=this.head.clone();
    this.heading=this.head.clone().sub(this.points[Math.max(0,this.points.length-6)]).normalize();
    if(this.heading.lengthSq()<.001)this.heading.copy(this.tangents[this.points.length-1]);
    this.center=headPos(this.ctx.app,new T.Vector3());
    this.orbitCenter=this.center.clone();this.radial=new T.Vector3();this.desired=new T.Vector3();
    this.turn=this.index%2?1:-1;
    this.path=this.points.map((p,i)=>({p:p.clone(),s:this.arc[i]}));this.pathDistance=this.length;
    return true;
  }
  steer(step){
    const T=this.T;
    this.center.copy(headPos(this.ctx.app,this.viewer));
    // Slow recentering prevents a sudden head movement from yanking the artwork.
    this.orbitCenter.lerp(this.center,1-Math.exp(-step*.45));
    this.radial.copy(this.head).sub(this.orbitCenter);this.radial.y=0;
    let radius=this.radial.length();if(radius<.01)this.radial.set(0,0,-1);else this.radial.divideScalar(radius);
    const tangent=this.steerTangent.set(-this.radial.z,0,this.radial.x).multiplyScalar(this.turn);
    const radialGain=T.MathUtils.clamp((3-radius)*1.4,-1.4,1.4);
    const height=this.orbitCenter.y+.35*Math.sin(this.distance*.55+this.index*1.7);
    this.desired.copy(tangent).addScaledVector(this.radial,radialGain);
    this.desired.y=T.MathUtils.clamp((height-this.head.y)*.7,-.45,.45);
    this.desired.normalize();
    // Bound curvature in metres, so fast/slow settings share the same smooth path.
    const angle=this.heading.angleTo(this.desired);
    this.spin.setFromUnitVectors(this.heading,this.desired);
    const q=this.turnQ.identity().slerp(this.spin,Math.min(1,step*1.05/Math.max(angle,.0001)));
    this.heading.applyQuaternion(q).normalize();
  }
  advance(step){
    this.previousHead.copy(this.head);this.steer(step);this.head.addScaledVector(this.heading,step);
    this.distance+=step;this.pathDistance+=step;this.path.push({p:this.head.clone(),s:this.pathDistance});
    const tail=this.pathDistance-this.length;
    while(this.path.length>2&&this.path[1].s<tail)this.path.shift();
    let j=0;
    for(let i=0;i<this.points.length;i++){
      const s=tail+this.arc[i];while(j<this.path.length-2&&this.path[j+1].s<s)j++;
      const a=this.path[j],b=this.path[j+1];this.points[i].lerpVectors(a.p,b.p,this.T.MathUtils.clamp((s-a.s)/(b.s-a.s||1),0,1));
    }
  }
  update(dt,speed,paused){
    if(!this.released||paused||this.expired)return;
    let travel=Math.min(.1,Math.max(0,dt))*Math.max(0,speed)*.65;
    while(travel>1e-8){const step=Math.min(.012,travel);this.advance(step);travel-=step;}
    this.expired=this.distance>=20;
    this.material.opacity=1-this.T.MathUtils.smoothstep(this.distance,17,20);this.render();
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
    this.hint=ctx.label('Pinch or hold the trigger to draw in space. Release to send it flowing around you.',{height:.017,color:'#f4f0e4'});this.hint.position.copy(head).addScaledVector(f,1.44);this.hint.position.y+=.54;this.hint.quaternion.copy(q);root.add(this.hint);
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
    if(this.strokes.length>=12){const i=this.strokes.findIndex(s=>s.released);if(i<0)return null;this.strokes.splice(i,1)[0].dispose();}
    const stroke=new YellowtailStroke(ctx,this.palette[this.nextColor++%this.palette.length],this.nextColor);
    stroke.depth=src.kind==='hand' ? .16 : .72;ctx.root.add(stroke.root);stroke.add(this.pointFor(ctx,src,stroke));this.strokes.push(stroke);return stroke;
  },
  finish(src,stroke){if(!stroke.finish()){const i=this.strokes.indexOf(stroke);if(i>=0)this.strokes.splice(i,1);stroke.dispose();}},
  clear(){for(const stroke of this.strokes)stroke.dispose();this.strokes=[];this.held?.clear();},
  addDemo(ctx){
    if(!ctx||this.strokes.length>=12)return;const T=ctx.THREE,stroke=new YellowtailStroke(ctx,this.palette[this.nextColor++%this.palette.length],this.nextColor);
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
