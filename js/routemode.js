/* ============================================================
   ROUTE MODE: what happens after "Take me here".
   Kiosk: the side panel folds away and the map takes the whole screen.
   Phone: the map goes full screen by itself.
   Both: a large step card, what comes next, the destination with its live wait time
   and offer, spoken directions, and simple controls. The walk plays on its own; on
   arrival the screen says so, then returns to search by itself.
   Voice and walk go together: the route is introduced, then each step is said as the walker
   reaches it (a few metres early, like a satnav). If the next step comes before the last
   sentence is finished, the walker waits at the corner, so no instruction is ever cut off.
   Two separate holds: userHold (Pause, a step picked by hand, touching the map) and
   voiceHold (waiting for the voice) - releasing one never overrides the other.
   Language: the screen shows the steps in the visitor's language (RM.steps); the voice says RM.say, the same steps in
   the language this device can speak (Hindi, or English where there is no Hindi voice).
   Live (RM.live): on a phone that knows where it is (livepos.js) nothing is played: the walker is the visitor. The
   step shown is the one they have reached, steps can be skipped or gone back to as they walk, arrival is when they
   get there, and livepos.js plans a new route if they leave this one.
   ============================================================ */
const RM={on:false,live:false,steps:[],say:[],k:-1,timer:null,arriveT:null,count:0,finished:false,userHold:false,voiceHold:false,startT:null};
const rh=id=>document.getElementById(id);
const ARRIVE_SECS=9;
const LOOKAHEAD_M=6;                                   // a step is announced this far before the walker reaches it
function applyHold(){if(guide&&!RM.live)MAPR.guideHold(RM.userHold||RM.voiceHold);syncPlayBtn();}
function walkSpeed(){MAPR.setGuideSpeed&&MAPR.setGuideSpeed(Voice.on?5.5:9);}   // a calmer pace while the steps are being read out

function takeMeHere(){if(!state.route)return;poke();cancelScheduledGuide();if(typeof liveBeforeRoute==='function')liveBeforeRoute();enterRouteMode();}
function enterRouteMode(){
  const r=state.route;if(!r)return;
  Voice.init(VIEW);Voice.lang(LANG);RM.on=true;RM.live=typeof liveFollowing==='function'&&liveFollowing()&&r.from==='me';routeWords();RM.k=-1;
  rh('rhud').classList.toggle('live',RM.live);rh('rhLive').textContent=T('Following your location');RM.finished=false;RM.walked=false;RM.userHold=false;RM.voiceHold=false;
  document.body.classList.add('routing');
  if(VIEW==='app'){PTAB='route';setMapFull(true);renderQuick();}
  rh('rhud').hidden=false;rh('rhArrive').hidden=true;rh('rhud').classList.remove('arrived');
  renderRouteSteps();renderRouteDest();syncVoiceBtn();
  const rs=routeStats(r),tf=r.legs[r.legs.length-1].f,of=r.legs[0].f;
  showStep(0,true);                                   // on screen now; said after the introduction
  // start walking once the panel has folded away and the map has its new size, and (voice on) as the first step is said
  let started=false;const start=()=>{clearTimeout(RM.startT);if(started||!RM.on)return;started=true;if(guide)return;
    if(RM.live){MAPR.guideJump(0,0,false);RM.walked=true;syncPlayBtn();return;}     // live: the visitor does the walking
    walkSpeed();startGuide();syncPlayBtn();};   // (a step picked by hand has already placed the walker)
  if(Voice.on){if(LANG==='hi'&&Voice.sayLang!=='hi')toast(T('This device has no Hindi voice, so directions will be spoken in English.'),4200);
    Voice.speak(inLang(Voice.sayLang,()=>{const d=destName();return LANG==='hi'
        ?`${d} का रास्ता${tf!==of?`। यह ${floorWords(tf,'hi')} पर है,`:','} लगभग ${rs.min} मिनट की दूरी पर।`
        :`Directions to ${d}${tf!==of?', on the '+floorWords(tf):''}. About ${rs.min} minute${rs.min>1?'s':''} away.`;}),{urgent:true,
      done:cancelled=>{if(!RM.on)return;if(!cancelled)Voice.speak(RM.say[0].say);start();}});
    RM.startT=setTimeout(start,4500);}                // never wait long if this device will not speak
  else RM.startT=setTimeout(start,VIEW==='kiosk'?480:260);
  clearInterval(RM.timer);RM.timer=setInterval(tickRoute,120);
}
/* the steps on screen, and the same steps as they will be spoken */
function routeWords(){const r=state.route;RM.steps=stepsOf(r,destName());RM.say=Voice.sayLang===LANG?RM.steps:inLang(Voice.sayLang,()=>stepsOf(r,destName()));}
/* the visitor switched language during a route */
function relangRoute(){if(!RM.on||!state.route)return;Voice.stop();routeWords();renderRouteSteps();renderRouteDest();syncVoiceBtn();syncPlayBtn();
  if(RM.finished)return;const k=Math.max(0,RM.k);RM.k=-1;showStep(k,true);}
function exitRouteMode(toHome){
  if(!RM.on)return;RM.on=false;RM.live=false;rh('rhud').classList.remove('live');clearInterval(RM.timer);clearInterval(RM.arriveT);clearTimeout(RM.startT);Voice.stop();RM.userHold=RM.voiceHold=false;
  stopGuide();rh('rhud').hidden=true;document.body.classList.remove('routing');
  if(VIEW==='app'){setMapFull(false);PTAB='home';}
  if(toHome){resetAll();if(VIEW==='app')document.getElementById('pScroll').scrollTop=0;}
  else{showRouteOnFloor(true);renderPanels();}
  renderQuick();
}
/* follow the walker: which step is it on? One step at a time, each said in full before the next */
function tickRoute(){
  if(!RM.on||RM.finished)return;
  if(RM.live){if(guide){const k=stepAt(RM.steps,guide.legIdx,(MAPR.kind==='2d'?guide.d*SC:guide.d)+LOOKAHEAD_M);
      if(k!==RM.k&&!RM.steps[k].end){const back=k<RM.k;showStep(k,true);if(!back){Voice.speak((RM.say[k]||RM.steps[k]).say,{urgent:true});Voice.buzz(RM.steps[k].ride?[80,60,80,60,80]:[60,40,60]);}}}
    return;}
  if(guide){
    let leg=guide.legIdx,m=MAPR.kind==='2d'?guide.d*SC:guide.d;
    if(guide.ride){leg=guide.legIdx-1;m=1e9;}                     // riding: the ride step of the leg just walked
    let k=stepAt(RM.steps,leg,m+(Voice.on?LOOKAHEAD_M:0.5));
    if(k>RM.k+1)k=RM.k+1;                                         // never skip a step
    if(k>RM.k){
      if(Voice.busy&&!RM.userHold){if(!RM.voiceHold){RM.voiceHold=true;applyHold();}}   // still speaking: wait at the corner
      else{if(RM.voiceHold){RM.voiceHold=false;applyHold();}showStep(k);}}
    else if(RM.voiceHold&&!Voice.busy){RM.voiceHold=false;applyHold();}
  }else if(RM.k===RM.steps.length-1&&RM.walked)arrive();
  syncPlayBtn();
}
function showStep(k,quiet){
  k=Math.max(0,Math.min(RM.steps.length-1,k));const s=RM.steps[k];if(!s)return;const first=RM.k<0;RM.k=k;
  if(guide)RM.walked=true;
  rh('rhIc').innerHTML=IC[s.ic]||IC.up;
  rh('rhNo').textContent=s.end?T('Arriving'):T('Step {k} of {n}',{k:k+1,n:RM.steps.length})+(s.f?` · ${floorName(s.f)}`:'');
  rh('rhText').textContent=s.t;
  rh('rhSub').textContent=s.m?T('then {m} m',{m:s.m}):(s.ride?T(s.up?'Up to {fl}':'Down to {fl}',{fl:flShort(s.f)}):'');
  const nx=RM.steps[k+1];rh('rhNextLine').innerHTML=nx?`<span>${T('Then')}</span> ${escapeHtml(nx.t)}`:'';rh('rhNextLine').hidden=!nx;
  rh('rhBar').style.width=Math.round((k+1)/RM.steps.length*100)+'%';
  rh('rhSteps').querySelectorAll('li').forEach((li,i)=>{li.classList.toggle('now',i===k);li.classList.toggle('done',i<k);});
  const li=rh('rhSteps').children[k];if(li&&li.scrollIntoView)li.scrollIntoView({block:'nearest',behavior:reduce?'auto':'smooth'});
  const c=rh('rhCard');c.classList.remove('flash');void c.offsetWidth;c.classList.add('flash');
  if(!quiet){Voice.speak((RM.say[k]||s).say,{urgent:RM.userHold});if(!first)Voice.buzz(s.ride?[80,60,80,60,80]:[60,40,60]);}   // stepping by hand: say it now
}
function renderRouteSteps(){
  rh('rhSteps').innerHTML=RM.steps.map((s,i)=>`<li data-k="${i}" class="${s.ride?'ride':s.end?'end':''}"><i>${IC[s.ic]||IC.up}</i><span>${escapeHtml(s.t)}</span>${s.m?`<em>${T('{m} m',{m:s.m})}</em>`:''}</li>`).join('');
  rh('rhSteps').querySelectorAll('li').forEach(li=>li.onclick=()=>{poke();jumpTo(+li.dataset.k);});
}
function renderRouteDest(){
  const r=state.route,rs=routeStats(r),b=state.brand;let extra='';
  if(b){const w=BRANDS[b].cat==='food'?waitView(b):null,off=liveOffers(b)[0],sp=(S(b).specials||[])[0];
    extra=[w?`<b class="${w.cls}">${escapeHtml(w.t)}</b> ${escapeHtml(w.sub)}`:'',off?`${offerLocked(off)?IC.lock:IC.tag}${escapeHtml(offerTitle(off))}`:'',!off&&sp?`★ ${escapeHtml(tc(sp))}`:''].filter(Boolean).map(x=>`<span>${x}</span>`).join('');}
  rh('rhDest').innerHTML=`${b?thumbHTML(b):`<div class="thumb" style="background:#1E2551">${IC.pin}</div>`}<div class="rh-dname"><b>${escapeHtml(destName())}</b><div class="rh-live">${extra||`<span>${escapeHtml(T(r.legs.length>1?'Change floor on the way':'Same floor, no stairs'))}</span>`}</div></div><em>${T('{min} min · {m} m',rs)}</em>`;
}
function syncVoiceBtn(){const b=rh('rhVoice');if(!Voice.supported){b.hidden=true;return;}
  b.setAttribute('aria-pressed',Voice.on);b.innerHTML=(Voice.on?IC.sound:IC.mute)+`<span>${T(Voice.on?'Voice on':'Voice off')}</span>`;}
function syncPlayBtn(){const b=rh('rhPlay');const playing=!!(guide&&!RM.userHold);b.innerHTML=(playing?IC.pause:IC.play)+`<span>${T(playing?'Pause':(RM.k>0?'Resume':'Play'))}</span>`;b.setAttribute('aria-label',T(playing?'Pause':'Play'));}
/* jump to a step and hold there: for visitors who want to go at their own pace */
function jumpTo(k){if(!RM.steps||!RM.steps.length)return;   // no route (a tap as route mode closes)
  k=Math.max(0,Math.min(RM.steps.length-1,k));const s=RM.steps[k];
  RM.userHold=true;RM.voiceHold=false;MAPR.guideJump(s.leg,s.ride||s.end?1e9:s.at,false);showStep(k);syncPlayBtn();}
function arrive(){
  if(RM.finished)return;RM.finished=true;const b=state.brand;
  rh('rhud').classList.add('arrived');const a=rh('rhArrive');a.hidden=false;
  let live='';if(b){const w=BRANDS[b].cat==='food'?waitView(b):null;const offs=liveOffers(b);const sp=S(b).specials||[];
    live=(w?`<div class="ra-row">${IC.clock}<span><b>${escapeHtml(w.t)}</b> ${escapeHtml(w.sub)}</span></div>`:'')+offs.slice(0,2).map(o=>`<div class="ra-row">${offerLocked(o)?IC.lock:IC.tag}<span><b>${escapeHtml(offerTitle(o))}</b> ${offerLocked(o)?'':escapeHtml(tc(o.detail)||'')}</span></div>`).join('')+sp.slice(0,2).map(x=>`<div class="ra-row">★<span>${escapeHtml(tc(x))}</span></div>`).join('');}
  const car=state.toilet&&state.toilet.kind==='car'?state.toilet.car:null;
  a.innerHTML=`<div class="ra-top"><i>${car?IC.car:IC.check}</i><div><small>${T(car?'Now take the lift down':'You have arrived')}</small><b>${car?escapeHtml(car.level+' · '+car.spot):escapeHtml(destName())}</b></div></div>${live}
    <div class="ra-btns">${RM.live?'':`<button class="btn" id="raAgain">${T('Replay route')}</button>`}<button class="btn green" id="raDone">${T('Done')}</button></div><p class="ra-count" id="raCount"></p>`;
  if(!car)Voice.speak(inLang(Voice.sayLang,()=>LANG==='hi'?`आपकी मंज़िल, ${destName()}, आ गई है।`:`You have arrived at ${destName()}.`));Voice.buzz([220]);   // (the way to the car ends with its own last step)   // after the last step has been said
  RM.count=ARRIVE_SECS;const tick=()=>{const c=rh('raCount');if(c)c.textContent=T('Back to search in {n} s',{n:RM.count});if(RM.count--<=0){clearInterval(RM.arriveT);exitRouteMode(true);}};
  tick();RM.arriveT=setInterval(tick,1000);
  if(rh('raAgain'))rh('raAgain').onclick=()=>{poke();clearInterval(RM.arriveT);a.hidden=true;rh('rhud').classList.remove('arrived');RM.finished=false;RM.walked=false;RM.k=-1;RM.userHold=RM.voiceHold=false;
    Voice.stop();showStep(0);walkSpeed();startGuide();};
  rh('raDone').onclick=()=>{poke();clearInterval(RM.arriveT);exitRouteMode(true);};
}
rh('rhPrev').onclick=()=>{poke();jumpTo(RM.k-1);};
rh('rhNext').onclick=()=>{poke();jumpTo(RM.k+1);};
rh('rhPlay').onclick=()=>{poke();
  if(!RM.steps||!RM.steps.length)return;
  if(!guide){const s=RM.steps[Math.max(0,RM.k)];RM.userHold=RM.voiceHold=false;walkSpeed();MAPR.guideJump(s.leg,s.ride||s.end?1e9:s.at,true);}
  else{RM.userHold=!RM.userHold;applyHold();}syncPlayBtn();};
rh('rhVoice').onclick=()=>{poke();Voice.set(!Voice.on,VIEW);syncVoiceBtn();walkSpeed();
  if(Voice.on&&RM.say[RM.k])Voice.speak(RM.say[RM.k].say,{urgent:true});else if(RM.voiceHold){RM.voiceHold=false;applyHold();}};
rh('rhEnd').onclick=()=>{poke();exitRouteMode(true);};
Voice.init(VIEW);Voice.lang(LANG);
