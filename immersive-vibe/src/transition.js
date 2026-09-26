// A head-centred veil works in stereo XR and passthrough as well as desktop.
class GalleryTransition {
  constructor(app) {
    this.app=app;
    this.material=new THREE7.MeshBasicMaterial({color:0x080a0e,side:THREE7.BackSide,transparent:true,opacity:0,depthTest:false,depthWrite:false,toneMapped:false});
    this.mesh=new THREE7.Mesh(new THREE7.SphereGeometry(.5,24,16),this.material);
    this.mesh.renderOrder=10000;this.mesh.frustumCulled=false;this.mesh.visible=false;
    this.mesh.userData.noCollider=true;app.scene.add(this.mesh);
  }
  fade(to,duration) {
    this.finish?.();
    const from=this.material.opacity,start=performance.now();
    this.mesh.visible=true;
    return new Promise(resolve=>{
      const finish=()=>{
        clearTimeout(timer);this.material.opacity=to;this.mesh.visible=to>0;
        this.step=null;this.finish=null;resolve();
      };
      const timer=setTimeout(finish,duration+80);
      this.finish=finish;
      this.step=now=>{
        const t=Math.min(1,(now-start)/duration);
        const ease=t*t*t*(t*(t*6-15)+10);
        this.material.opacity=from+(to-from)*ease;
        if(t===1)finish();
      };
    });
  }
  update(now) {
    this.mesh.position.copy(this.app.input.head);
    this.step?.(now);
  }
}
