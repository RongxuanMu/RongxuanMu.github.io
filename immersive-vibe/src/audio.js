// One shared context: evolving ambient phrases and dry, crisp interaction feedback.
class GalleryAudio {
  constructor() {
    this.enabled=true;this.active=false;this.world='gallery';this.lastClick=-1;
    this.voices=new Set();this.timer=null;this.phrase=0;this.nextPhrase=0;
  }
  async unlock() {
    if(!this.enabled)return;
    try {
      if(!this.ctx)this.build();
      if(this.ctx.state==='suspended')await this.ctx.resume();
      this.sync();
    } catch(e){console.warn('Audio unavailable; the gallery remains usable.',e.message);}
  }
  build() {
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)throw new Error('Web Audio unavailable');
    const c=this.ctx=new AC();
    this.master=c.createGain();this.master.gain.value=0;
    const limiter=c.createDynamicsCompressor();limiter.threshold.value=-18;limiter.ratio.value=5;
    this.master.connect(limiter);limiter.connect(c.destination);
    this.music=c.createGain();this.music.gain.value=.5;this.music.connect(this.master);
    this.reverb=c.createConvolver();
    const impulse=c.createBuffer(2,Math.round(c.sampleRate*3.6),c.sampleRate);
    for(let ch=0;ch<2;ch++){const d=impulse.getChannelData(ch);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3)*.24;}
    this.reverb.buffer=impulse;
    const wet=c.createGain();wet.gain.value=.32;this.reverb.connect(wet);wet.connect(this.master);
    this.noise=c.createBuffer(1,Math.round(c.sampleRate*.1),c.sampleRate);
    const noise=this.noise.getChannelData(0);for(let i=0;i<noise.length;i++)noise[i]=Math.random()*2-1;
  }
  audible(){return this.enabled&&this.active&&!document.hidden;}
  sync() {
    if(!this.ctx)return;
    const on=this.audible();this.master.gain.setTargetAtTime(on?.6:0,this.ctx.currentTime,.2);
    if(on&&!this.timer){
      this.nextPhrase=this.ctx.currentTime+.08;
      this.schedule();this.timer=setInterval(()=>this.schedule(),180);
    } else if(!on){
      clearInterval(this.timer);this.timer=null;this.stopVoices();
    }
  }
  setActive(v){this.active=v;this.sync();if(v)void this.unlock();}
  setEnabled(v){this.enabled=v;this.sync();if(v&&this.active)void this.unlock();}
  setWorld(id){
    if(this.world===id)return;
    this.world=id;this.phrase=0;
    if(this.ctx){this.stopVoices();this.nextPhrase=this.ctx.currentTime+.35;}
  }
  // Finite voices, including scheduled notes, are reclaimed on mute / exit / world change.
  track(source,nodes,end){
    const voice={source,nodes};this.voices.add(voice);
    source.onended=()=>{nodes.forEach(n=>n.disconnect());this.voices.delete(voice);};
    source.stop(end);return voice;
  }
  stopVoices(){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    for(const v of this.voices){
      if(v.envelope){v.envelope.cancelScheduledValues(t);v.envelope.setTargetAtTime(.0001,t,.05);}
      try{v.source.stop(t+.25);}catch{}
    }
  }
  note(midi,t,duration,level,pan=0,bright=false){
    const c=this.ctx,o=c.createOscillator(),g=c.createGain(),p=c.createStereoPanner(),f=c.createBiquadFilter();
    o.type=bright?'triangle':'sine';o.frequency.value=440*Math.pow(2,(midi-69)/12);
    o.detune.value=(Math.random()-.5)*5;f.type='lowpass';f.frequency.value=bright?1500:800;
    p.pan.value=pan;
    const attack=bright?.018:1.2;
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(level,t+attack);
    g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(f);f.connect(g);g.connect(p);p.connect(this.music);p.connect(this.reverb);
    o.start(t);this.track(o,[o,f,g,p],t+duration+.05).envelope=g.gain;
  }
  schedule(){
    if(!this.audible()||this.ctx.state!=='running')return;
    const now=this.ctx.currentTime;if(this.nextPhrase<now-.5)this.nextPhrase=now+.08;
    if(this.nextPhrase>now+.3)return;
    const settings={
      gallery:[45,1], 'starry-night':[45,.85], 'impression-sunrise':[48,1.1],
      'qianli-jiangshan':[43,.95], 'living-ink':[41,.8]
    };
    const [root,pace]=settings[this.world]||settings.gallery;
    const chords=[[0,7,14,16],[5,12,16,21],[9,16,19,26],[2,9,14,21],[0,12,16,23],[7,14,21,26]];
    const chord=chords[this.phrase%chords.length],t=this.nextPhrase,length=(9+Math.random()*3)/pace;
    chord.forEach((n,i)=>this.note(root+n,t+i*.18,length+2,i===0?.065:.027,(i-1.5)*.35));
    // Pentatonic fragments leave deliberate gaps, rather than a repeating arpeggio.
    const scale=[0,2,4,7,9,12],count=this.phrase%3===2?2:4;
    for(let i=0;i<count;i++){
      const degree=scale[(this.phrase*2+i*2+Math.floor(Math.random()*3))%scale.length];
      this.note(root+24+degree,t+1.5+i*(length-3)/count+Math.random()*.5,2.5+Math.random()*2,.018+Math.random()*.012,(Math.random()-.5)*1.3,true);
    }
    this.phrase++;this.nextPhrase+=length;
  }
  click(kind='tap'){
    if(!this.ctx||!this.audible()||this.ctx.state!=='running')return;
    const c=this.ctx,t=c.currentTime;if(t-this.lastClick<.065)return;this.lastClick=t;
    // Framework v0.8.22 finger snap: noise crack, bright edge and short low thump.
    const level=kind==='ink'?.12:.22;
    const burst=(type,freq,q,amp,duration)=>{
      const src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
      src.buffer=this.noise;f.type=type;f.frequency.value=freq;f.Q.value=q;
      g.gain.setValueAtTime(amp,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
      src.connect(f);f.connect(g);g.connect(this.master);src.start(t);this.track(src,[src,f,g],t+duration+.01);
    };
    burst('bandpass',2600,.9,level*1.6,.07);burst('highpass',6000,.707,level*.9,.025);
    const o=c.createOscillator(),g=c.createGain();o.type='sine';
    o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(90,t+.06);
    g.gain.setValueAtTime(level*.8,t);g.gain.exponentialRampToValueAtTime(.0001,t+.08);
    o.connect(g);g.connect(this.master);o.start(t);this.track(o,[o,g],t+.09);
  }
  dispose(){
    clearInterval(this.timer);this.timer=null;this.stopVoices();
    for(const v of this.voices)v.nodes.forEach(n=>n.disconnect());
    this.voices.clear();void this.ctx?.close();
  }
}
