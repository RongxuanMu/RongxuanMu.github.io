  // Continuous mineral underpainting plus contour ridges, kept in one draw call.
  const landGeometry=new THREE.BufferGeometry();
  const landMaterial=new THREE.ShaderMaterial({side:THREE.DoubleSide,vertexColors:true,
    vertexShader:`varying vec3 vColor; varying vec3 vLocal; void main(){vColor=color;vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 vColor;varying vec3 vLocal;void main(){float fiber=sin(vLocal.y*19.+sin(vLocal.x*3.1)*3.)*sin(vLocal.x*13.7+vLocal.z*7.);float fold=sin(vLocal.x*1.8+sin(vLocal.y*.4)*2.+vLocal.y*.15);gl_FragColor=vec4(vColor*(.96+fiber*.055+fold*.035),1.);
#include <colorspace_fragment>
}`});
  const land=new THREE.Mesh(landGeometry,landMaterial);land.userData.noCollider=true;world.add(land);
  const contour=layer(2400,{renderOrder:3});
  function buildUnderpainting(){
    const positions=[],colors=[],indices=[];let ci=0;
    RANGES.forEach((rg,ri)=>{
      const base=positions.length/3,NX=180,NY=16,fade=ri/5;
      for(let x=0;x<=NX;x++){
        const az=-rg.w+2*rg.w*x/NX,prof=ridge(az,ri*3.1,rg.n,rg.w),top=prof*rg.h;
        for(let y=0;y<=NY;y++){
          const h=y/NY,dist=rg.d+(1-h)*6*(1+ri*.4)+Math.sin(x*.31+y*.26)*.45;
          const p=place(az,dist,.1+h*top,rg.w);positions.push(p.x,p.y,p.z);
          const col=PAL.malachite[1].clone().lerp(PAL.azurite[1],Math.pow(h,.65));
          const fold=.5+.5*Math.sin(az*55+Math.sin(h*6+ri)*2);
          col.multiplyScalar(.72+fold*.29).lerp(PAL.silk[2],fade*.48);
          if(h>.9) col.lerp(PAL.gold[0],.13);
          colors.push(col.r,col.g,col.b);
        }
        if(x<NX)for(let y=0;y<NY;y++){const a=base+x*(NY+1)+y,b=a+NY+1;indices.push(a,b,a+1,b,b+1,a+1);}
        if(ci<contour.n){const p=place(az,rg.d-.5,.12+top,rg.w),col=PAL.azurite[0].clone().lerp(PAL.silk[1],fade*.5);contour.set(ci++,p.x,p.y,p.z,col,MODE==='scroll'?2.8:rg.d*.015,.2+rg.d*.001,0,.8);}
      }
      // Delicate vertical cun texture along the folds, not oversized horizontal dabs.
      for(let k=0;k<180;k++){
        const az=rnd(-rg.w,rg.w),top=ridge(az,ri*3.1,rg.n,rg.w)*rg.h,y=rnd(.1,.92)*top;
        const p=place(az,rg.d-.7,y,rg.w),col=PAL.azurite[0].clone().lerp(PAL.silk[2],fade*.55);
        if(ci<contour.n)contour.set(ci++,p.x,p.y,p.z,col,.13+rg.d*.003,rnd(.6,2.2)*(1+rg.d/80),-.15+Math.sin(az*15)*.3,.28);
      }
    });
    if(!landGeometry.getAttribute('position')){landGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));landGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));landGeometry.setIndex(indices);}else{landGeometry.getAttribute('position').array.set(positions);landGeometry.getAttribute('position').needsUpdate=true;landGeometry.getAttribute('color').array.set(colors);landGeometry.getAttribute('color').needsUpdate=true;}landGeometry.computeBoundingSphere();
    for(;ci<contour.n;ci++)contour.set(ci,0,-999,0,PAL.ink[0],.01,.01,0,0);contour.flush(true);
  }
