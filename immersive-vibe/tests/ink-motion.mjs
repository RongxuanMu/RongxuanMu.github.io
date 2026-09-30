const THREE = await import(process.env.THREE_MODULE || 'three');
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../src/ink.js',import.meta.url),'utf8');
const head=new THREE.Vector3(0,1.6,0),ctx={THREE,app:{}};
const Stroke=new Function('headPos',source.split('var LivingInk=')[0]+';return YellowtailStroke;')((app,out)=>out.copy(head));
function make(n=100,scale=1){const s=new Stroke(ctx,'white',1);for(let i=0;i<n;i++){const a=i/(n-1)*Math.PI*1.4;s.add(new THREE.Vector3(Math.sin(a)*.3*scale,1.6+Math.cos(a)*.4*scale,-.6-i/n*.2));}assert(s.finish());return s;}
for(const n of [24,80,160]){
 const s=make(n);let old=s.head.clone(),maxError=0,radii=[];
 for(let i=0;i<2200;i++){s.update(1/72,1,false);maxError=Math.max(maxError,Math.abs(s.head.distanceTo(old)-.65/72));old.copy(s.head);
  if(s.distance>8)radii.push(Math.hypot(s.head.x-head.x,s.head.z-head.z));
  assert(s.positions.every(Number.isFinite));
 }
 assert(maxError<.00001,`constant speed ${maxError}`);assert(Math.min(...radii)>2.7&&Math.max(...radii)<3.3,`orbit range ${Math.min(...radii)} ${Math.max(...radii)}`);
 console.log({n,maxSpeedError:maxError,orbit:[Math.min(...radii),Math.max(...radii)]});
}
const a=make(50,.5),b=make(160,2);for(let i=0;i<100;i++){a.update(1/60,1,false);b.update(1/60,1,false);}assert(Math.abs(a.distance-b.distance)<1e-9);
const p=a.head.clone();a.update(.05,1,true);assert(a.head.equals(p));
// A nearly vertical curve crossing the old .9 tangent threshold must have no frame flips.
const v=new Stroke(ctx,'white',2);for(let i=0;i<150;i++){const t=i/149;v.add(new THREE.Vector3(.25*Math.sin(t*5),t*1.4,-.7));}
let minDot=1;for(let i=1;i<v.points.length;i++){
 const side=i=>new THREE.Vector3(v.positions[i*24]-v.renderPoints[i].x,v.positions[i*24+1]-v.renderPoints[i].y,v.positions[i*24+2]-v.renderPoints[i].z).normalize();
 minDot=Math.min(minDot,side(i).dot(side(i-1)));
}assert(minDot>.98,`frame discontinuity ${minDot}`);console.log({minimumFrameDot:minDot});
for(let i=0;i<2500;i++)a.update(1/60,1,false);assert(a.expired);console.log('Ink motion tests passed');
