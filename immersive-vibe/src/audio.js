// One reusable audio graph. No autoplay, downloads or accumulating music loops.
class GalleryAudio {
  constructor() { this.enabled = true; this.active = false; this.world = 'gallery'; this.lastClick = -1; this.nodes = []; }
  async unlock() {
    if (!this.enabled) return;
    try {
      if (!this.ctx) this.build();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      this.sync();
    } catch (e) { console.warn('Audio unavailable; the gallery remains usable.', e.message); }
  }
  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('Web Audio unavailable');
    this.ctx = new AC(); const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0;
    const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -18; limiter.ratio.value = 5;
    this.master.connect(limiter); limiter.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = .22; this.music.connect(this.master);
    this.wet = c.createGain(); this.wet.gain.value = .2;
    const reverb = c.createConvolver(), impulse = c.createBuffer(2, c.sampleRate * 3, c.sampleRate);
    let seed = 241; const rand = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
    for(let channel=0;channel<2;channel++){ const a=impulse.getChannelData(channel); for(let i=0;i<a.length;i++) a[i]=(rand()*2-1)*Math.pow(1-i/a.length,3)*.28; }
    reverb.buffer = impulse; this.music.connect(reverb); reverb.connect(this.wet); this.wet.connect(this.master);
    this.tones = [55,82.4069,110,164.8138,220].map((frequency,i) => {
      const osc=c.createOscillator(), gain=c.createGain(), lfo=c.createOscillator(), motion=c.createGain(), pan=c.createStereoPanner();
      osc.type='sine'; osc.frequency.value=frequency; osc.detune.value=(i%2?1:-1)*3;
      gain.gain.value=i<2?.14:.045; lfo.frequency.value=.027+i*.011; motion.gain.value=i<2?.03:.012;
      lfo.connect(motion); motion.connect(gain.gain); osc.connect(gain); gain.connect(pan); pan.pan.value=(i-2)*.28; pan.connect(this.music);
      osc.start(); lfo.start(); this.nodes.push(osc,lfo); return osc;
    });
    this.setWorld(this.world);
  }
  sync() {
    if(!this.ctx) return;
    const audible=this.enabled && this.active && !document.hidden;
    this.master.gain.setTargetAtTime(audible?.6:0,this.ctx.currentTime,.25);
  }
  setActive(v) { this.active=v; this.sync(); if(v) void this.unlock(); }
  setEnabled(v) { this.enabled=v; this.sync(); if(v && this.active) void this.unlock(); }
  setWorld(id) {
    this.world=id; if(!this.ctx) return;
    const roots={gallery:55,'starry-night':55,'impression-sunrise':65.4064,'qianli-jiangshan':49,'living-ink':43.6535};
    const root=roots[id]||55, ratios=[1,1.5,2,3,4];
    this.tones.forEach((osc,i)=>osc.frequency.setTargetAtTime(root*ratios[i],this.ctx.currentTime,1.6));
  }
  click(kind='tap') {
    if(!this.ctx || !this.enabled || !this.active || document.hidden || this.ctx.state!=='running') return;
    const c=this.ctx, t=c.currentTime;
    if(t-this.lastClick<.065) return; this.lastClick=t;
    const osc=c.createOscillator(), g=c.createGain(); osc.type='sine';
    osc.frequency.setValueAtTime(kind==='ink'?560:1460,t); osc.frequency.exponentialRampToValueAtTime(kind==='ink'?210:880,t+.065);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(kind==='ink'?.045:.075,t+.004); g.gain.exponentialRampToValueAtTime(.0001,t+.14);
    osc.connect(g); g.connect(this.master); osc.start(t); osc.stop(t+.16); osc.onended=()=>{osc.disconnect();g.disconnect();};
  }
  dispose() { this.nodes.forEach(n=>{try{n.stop();}catch{}}); this.nodes=[]; void this.ctx?.close(); }
}
