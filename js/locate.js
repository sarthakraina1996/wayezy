/* ============================================================
   LOCATE: where the phone is, from the Bluetooth beacons it can hear.
   Pure maths, no DOM: `node tests/locate.test.js` walks simulated visitors round the mall with it.

   A beacon is {id, f, x, y} (plan units, from beacons.js). A reading is {id, rssi} (dBm). The phone's native
   shell hands over a batch of readings about once a second; tracker.update(readings, timeMs) answers with a
   fix {f, x, y, acc (metres, rough), n (beacons heard), t}, or null while it cannot tell.

   How: the visitor can only be on a walkway, so the tracker keeps a probability for every metre of walkway on
   every floor (opts.grid, the engine's walkGrid()). Each second two things happen. The probabilities spread a
   walking step along the walkways (and between floors only where a lift or an escalator joins them). Then every
   beacon heard votes: a point where that beacon should sound the way it did gains, a point where it should sound
   very different loses. One freak reading changes little, because every beacon votes and the last position
   still counts; a wrong floor is hard to reach, because floors join only at the lifts and escalators. The dot is
   the middle of the likeliest stretch, and it never moves faster than a brisk walk.

   This is the baseline engine for the pilot. The pilot measures it on site (survey mode in livepos.js); if it
   is not good enough, a vendor's engine replaces this file and everything else stays (it only has to produce
   the same fix).
   ============================================================ */
const Locate=(function(){
  const DEF={
    tx:-59,            // a beacon's signal 1 m away (dBm); calibrated per beacon model during the survey
    n:2.4,             // how fast the signal fades indoors (2 = open air, 3+ = crowded, cluttered)
    height:3,          // beacons are mounted about this far above a phone in the hand (m)
    storey:5,          // floor to floor (m)
    floorLoss:18,      // a floor slab costs about this much signal (dB)
    floorIdx:{G:0,F:1,S:2},
    sigma:6,           // how far a reading is trusted to be from what the model expects (dB): larger = calmer, slower
    offset:3,          // how much louder or quieter than expected one whole scan may be (a hand, a pocket, a crowd) (dB)
    learn:0.06,        // how fast the tracker learns how loud this particular phone hears everything (0 = do not)
    sure:0.6,          // the first position is given once this share of the probability is in one place
    stay:0.45,         // share of the probability that stays put in each spreading step
    lost:0.002,        // a little probability is always spread everywhere, so a lost dot can find itself again
    near:6,            // m: the dot is the middle of the probability within this distance of the likeliest point
    window:8000,       // no beacon heard for this long: the position is gone (ms)
    maxSpeed:2.5,      // m/s: nobody moves faster than a brisk walk
    sc:0.16            // metres per plan unit
  };
  /* signal strength -> straight-line distance in metres, and back */
  function metres(rssi,tx,n){return Math.pow(10,(tx-rssi)/(10*n));}
  function expected(b,p,o){const dh=Math.hypot(b.x-p.x,b.y-p.y)*o.sc,df=o.floorIdx[b.f]-o.floorIdx[p.f];
    return o.tx-10*o.n*Math.log10(Math.max(0.5,Math.hypot(dh,Math.abs(df*o.storey+o.height))))-Math.abs(df)*o.floorLoss;}
  function tracker(beacons,opts){
    const o=Object.assign({},DEF,opts||{});const G=o.grid||{pts:[],links:[]},P=G.pts,N=P.length;
    const MU={};(beacons||[]).forEach(b=>{const a=new Float32Array(N);for(let j=0;j<N;j++)a[j]=expected(b,P[j],o);MU[b.id]=a;});
    // walkway points a step apart are neighbours; so are the two ends of a lift or an escalator
    const NB=P.map(()=>[]);{const cell=2/o.sc,H={};const key=(f,x,y)=>f+'|'+Math.floor(x/cell)+'|'+Math.floor(y/cell);
      P.forEach((p,j)=>{(H[key(p.f,p.x,p.y)]=H[key(p.f,p.x,p.y)]||[]).push(j);});const r=1.6/o.sc;
      P.forEach((p,j)=>{for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)(H[key(p.f,p.x+dx*cell,p.y+dy*cell)]||[]).forEach(k=>{if(k!==j&&Math.hypot(P[k].x-p.x,P[k].y-p.y)<=r)NB[j].push(k);});});
      (G.links||[]).forEach(([a,b])=>{if(NB[a]&&NB[b]&&a!==b){NB[a].push(b);NB[b].push(a);}});}
    let p=new Float64Array(N).fill(N?1/N:0),q=new Float64Array(N),fix=null,lastT=null,lastHeard=null,count=0,bias=0;const s1=new Float64Array(N);
    function spread(times){for(let s=0;s<times;s++){q.fill(0);for(let k=0;k<N;k++){const v=p[k];if(!v)continue;const nb=NB[k];
        if(!nb.length){q[k]+=v;continue;}q[k]+=v*o.stay;const share=v*(1-o.stay)/nb.length;for(let i=0;i<nb.length;i++)q[nb[i]]+=share;}const tmp=p;p=q;q=tmp;}}
    function forget(){p.fill(N?1/N:0);fix=null;count=0;}                     // (what was learnt about the phone is kept)
    function update(readings,t){
      const use=(readings||[]).filter(r=>r&&MU[r.id]&&typeof r.rssi==='number'&&isFinite(r.rssi));
      if(!N)return null;
      if(lastT!==null&&t>lastT)spread(Math.max(1,Math.min(12,Math.round(o.maxSpeed*(t-lastT)/1000/1))));
      lastT=t;
      if(!use.length){if(lastHeard===null||t-lastHeard>o.window)forget();return fix;}
      lastHeard=t;count++;
      // Each point's score: how well what was heard fits there. Phones differ in how loud they hear everything (by
      // several dB): that is learnt as the walk goes on (bias), and each scan may be a little louder or quieter again.
      const k=1/(2*o.sigma*o.sigma),lam=o.sigma*o.sigma/(o.offset*o.offset),m=use.length;let best=-Infinity;q.fill(0);s1.fill(0);
      use.forEach(r=>{const mu=MU[r.id],v=r.rssi-bias;for(let j=0;j<N;j++){const d=v-mu[j];q[j]+=d*d;s1[j]+=d;}});
      for(let j=0;j<N;j++){q[j]=-k*(q[j]-s1[j]*s1[j]/(m+lam));if(q[j]>best)best=q[j];}
      let sum=0;for(let j=0;j<N;j++){p[j]*=Math.exp(q[j]-best);sum+=p[j];}
      if(!(sum>0)){p.fill(1/N);sum=1;}
      for(let j=0;j<N;j++)p[j]=p[j]/sum*(1-o.lost)+o.lost/N;
      // the floor with the most probability, its likeliest point, and the middle of the probability round that point
      const mass={};let top=-1,topP=-1;for(let j=0;j<N;j++)mass[P[j].f]=(mass[P[j].f]||0)+p[j];
      let f=null;for(const g in mass)if(f===null||mass[g]>mass[f])f=g;
      if(fix&&fix.f!==f&&mass[f]<(mass[fix.f]||0)*1.5)f=fix.f;                                  // not on a whim
      for(let j=0;j<N;j++)if(P[j].f===f&&p[j]>topP){topP=p[j];top=j;}
      const R=o.near/o.sc;let w=0,x=0,y=0,v=0;
      for(let j=0;j<N;j++){if(P[j].f!==f)continue;const d=Math.hypot(P[j].x-P[top].x,P[j].y-P[top].y);if(d>R)continue;w+=p[j];x+=p[j]*P[j].x;y+=p[j]*P[j].y;}
      x/=w;y/=w;for(let j=0;j<N;j++){if(P[j].f!==f)continue;const d=Math.hypot(P[j].x-x,P[j].y-y);if(d<=R*2)v+=p[j]*d*d;}
      const acc=Math.max(1.5,Math.min(15,Math.sqrt(v/Math.max(w,1e-9))*o.sc*1.3+1));
      if(!fix&&(count<3||w<o.sure))return null;                                                 // not sure yet: say nothing rather than guess
      if(o.learn&&count>3&&m>=3){let d=0;use.forEach(r=>{d+=r.rssi-MU[r.id][top];});bias+=o.learn*(d/m-bias);bias=Math.max(-15,Math.min(15,bias));}
      if(fix&&fix.f===f&&t>fix.t&&count>4){const dx=x-fix.x,dy=y-fix.y,step=Math.hypot(dx,dy),max=o.maxSpeed*Math.min(3,(t-fix.t)/1000)/o.sc;
        if(step>max){x=fix.x+dx*max/step;y=fix.y+dy*max/step;}}
      fix={f,x,y,acc,n:use.length,t};return fix;}
    return {update,get fix(){return fix;},get bias(){return bias;},reset(){forget();lastT=null;lastHeard=null;bias=0;},options:o};
  }
  /* What a phone at (f,x,y) would hear: the same signal model the tracker assumes, with the jitter real Bluetooth
     has (sigma dB of noise, some packets lost). rand() is a 0..1 random source.
     For the simulator and the tests only: real walls, people and phones are why there is a pilot. */
  function simulate(beacons,pos,rand,opts){
    const o=Object.assign({},DEF,{sigma:5,loss:0.2,range:-97,bias:0},opts||{});const out=[];
    const gauss=()=>{let u=0,v=0;while(!u)u=rand();while(!v)v=rand();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
    (beacons||[]).forEach(b=>{if(rand()<o.loss)return;const rssi=expected(b,pos,o)+o.bias+gauss()*o.sigma;if(rssi>=o.range)out.push({id:b.id,rssi:Math.round(rssi)});});
    return out;}
  /* a small repeatable random source, so a simulated walk can be replayed */
  function seeded(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}
  return {DEF,metres,tracker,simulate,seeded};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=Locate;
