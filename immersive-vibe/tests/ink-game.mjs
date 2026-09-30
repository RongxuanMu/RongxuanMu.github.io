const THREE = await import(process.env.THREE_MODULE || 'three');
import fs from 'node:fs';
import assert from 'node:assert/strict';
const head=new THREE.Vector3(0,1.6,0);
const source=fs.readFileSync(new URL('../src/ink.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../src/ink-game.js',import.meta.url),'utf8');
const canvas={width:0,height:0,getContext:()=>({clearRect(){},fillRect(){},fillText(){}})};
const game=new Function('headPos','enterArtWorld','exitArtWorld','setImmersive','ownSky','freeSelects','document',source+';return StrokeBreaker;')((a,out)=>out.copy(head),()=>{},()=>{},()=>{},()=>{},()=>{},{createElement:()=>({...canvas})});
const ctx={THREE,root:new THREE.Group(),app:{camera:{quaternion:new THREE.Quaternion()},renderer:{xr:{isPresenting:false}},audio:{click(){}}},label:()=>new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial())};
game.init(ctx);
for(let level=0;level<5;level++){
 game.startLevel(level);let fired=0;
 while(game.state==='playing'&&game.shots>0){game.addDemo(ctx);fired++;for(let f=0;f<330&&game.state==='playing';f++)game.update(1/60,f/60,ctx);}
 assert.equal(game.state,'won',`level ${level+1} failed after ${fired} shots`);console.log({level:level+1,shotsUsed:fired,remaining:game.shots,score:game.score});
 if(level<4){for(let i=0;i<160;i++)game.update(1/60,i/60,ctx);assert.equal(game.level,level+1);}
}
game.startLevel(0);game.shots=0;game.update(.016,0,ctx);assert.equal(game.state,'lost');game.retry();assert.equal(game.shots,7);assert.equal(game.state,'playing');
const elapsed=game.elapsed;game.paused=true;game.update(.1,0,ctx);assert.equal(game.elapsed,elapsed);
console.log('All five levels, automatic progression, loss, retry and pause passed');
