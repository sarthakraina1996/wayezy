/* ============================================================
   LIVE POSITION for the phone app: the visitor's dot on the map, routes that start where the visitor is,
   route mode that follows the visitor instead of playing a walk, and a new route when they leave it.
   The kiosk never uses this: it knows where it stands.

   Where the position comes from (all end in onFix):
   - the native shell (iOS / Android), which scans for the mall's Bluetooth beacons and calls
       window.ireoBeacons([{key:'1:23', rssi:-67}, ...])      key = iBeacon major:minor (beacons.js), about once a second
     The maths is locate.js (the baseline engine for the pilot).
   - a positioning vendor's engine in the native shell, which calls
       window.ireoPosition({f:'G', x:372, y:900, acc:3})      plan units (or {f, east, north} in metres from the main entrance)
   - the simulator, for demos and tests without hardware: ?sim=1 walks a simulated visitor along the chosen route and
     feeds the same beacon readings a phone would hear (?beacons=pilot: only the pilot zone's beacons are "installed").
   Survey mode (?survey=1) is the pilot's measuring tool: stand under a beacon, record, and it keeps the error.
   ============================================================ */
const LIVE={fix:null,shown:null,src:null,prog:null,goal:null,offSince:0,manual:false,log:[],
  /* is there a position fresh enough to use? */
  get ok(){return !!(this.fix&&Date.now()-this.fix.at<8000);}};
const LIVE_OFF_M=10,LIVE_OFF_MS=5000,LIVE_ARRIVE_M=4;
const liveBeacons=()=>{const all=typeof BEACONS!=='undefined'?BEACONS:[];return QS.get('beacons')==='pilot'?all.filter(b=>b.pilot):all;};
const liveTracker=typeof Locate!=='undefined'?Locate.tracker(liveBeacons(),{snap:snapToWalk,sc:SC}):null;
const BEACON_BY_KEY={};(typeof BEACONS!=='undefined'?BEACONS:[]).forEach(b=>{BEACON_BY_KEY[b.key]=b.id;});

/* ---- sources ---- */
window.ireoBeacons=function(readings,t){if(!liveTracker||!Array.isArray(readings))return;
  const fix=liveTracker.update(readings.map(r=>({id:r.id||BEACON_BY_KEY[r.key],rssi:+r.rssi})),t||Date.now());
  if(fix)onFix(fix,'ble');else if(LIVE.fix&&!liveTracker.fix)lostFix();};
window.ireoPosition=function(p){if(!p||!FLOORS[p.f])return;const e=FLOORS.G.entrances[0];
  const x=isFinite(p.x)?+p.x:e.x+p.east/SC,y=isFinite(p.y)?+p.y:e.y-p.north/SC;if(isFinite(x)&&isFinite(y))onFix({f:p.f,x,y,acc:+p.acc||5,n:0},'sdk');};

function onFix(fix,src){const first=!LIVE.fix;LIVE.fix={f:fix.f,x:fix.x,y:fix.y,acc:fix.acc,n:fix.n,at:Date.now()};LIVE.src=src;
  if(first||!LIVE.shown||LIVE.shown.f!==fix.f)LIVE.shown={f:fix.f,x:fix.x,y:fix.y};
  if(first&&VIEW==='app'&&!LIVE.manual&&!state.route){APP_ORIGIN='me';placeMe();setOrigin('me');setFloor(fix.f,true);renderPanels();}
  if(typeof RM!=='undefined'&&RM.on&&RM.live)followRoute();
  liveChip();}
function lostFix(){LIVE.fix=null;liveChip();}
/* the dot glides between fixes (10 times a second) instead of jumping once a second */
function placeMe(){const s=LIVE.shown;if(!s)return false;const me=setMe(s.f,s.x,s.y);if(me&&ORIGIN==='me'&&MAPR)MAPR.setOrigin();return !!me;}
setInterval(()=>{if(VIEW!=='app'||!LIVE.fix||!LIVE.shown)return;const f=LIVE.fix,s=LIVE.shown;
  if(!LIVE.ok){if(LIVE.src)liveChip();return;}
  if(s.f!==f.f){LIVE.shown={f:f.f,x:f.x,y:f.y};}else{s.x+=(f.x-s.x)*0.22;s.y+=(f.y-s.y)*0.22;}
  if(ORIGIN==='me'&&cur!==LIVE.shown.f&&!(typeof RM!=='undefined'&&RM.on)&&!state.route)setFloor(LIVE.shown.f,false);
  placeMe();
  if(typeof RM!=='undefined'&&RM.on&&RM.live&&LIVE.goal&&!RM.finished){const g=LIVE.goal,p=LIVE.prog||(LIVE.prog={leg:g.leg,m:g.m});
    if(p.leg!==g.leg){p.leg=g.leg;p.m=g.m;}else p.m+=(g.m-p.m)*0.22;MAPR.guideJump(p.leg,p.m,false);}
},100);

/* ---- routes ---- */
/* can route mode follow the visitor right now? */
function liveFollowing(){return VIEW==='app'&&ORIGIN==='me'&&LIVE.ok;}
/* the route again, from where the visitor is now (before "Take me here", and when they have left the route) */
function liveReroute(){if(!placeMe())return null;const ids=state.brand?brandTargets(state.brand):((state.toilet&&state.toilet.ids)||(state.route&&[state.route.target]));if(!ids)return null;
  const r=routeTo(ids,{from:'me',stepFree:state.stepFree});if(!r)return null;
  if(state.brand)state.targetUnit=POIS[r.target].unit;state.route=r;state.noRoute=false;drawRoute(r);LIVE.prog=null;LIVE.goal=null;LIVE.offSince=0;return r;}
function liveBeforeRoute(){if(liveFollowing()&&state.route&&state.route.from==='me')liveReroute();}
function followRoute(){const r=state.route,f=LIVE.fix;if(!r||RM.finished)return;
  const p=routeProgress(r,f.f,f.x,f.y,LIVE.goal);
  if(p&&p.off<=LIVE_OFF_M){LIVE.offSince=0;LIVE.goal=p;
    if(p.leg===r.legs.length-1&&p.len-p.m<=LIVE_ARRIVE_M){MAPR.guideJump(p.leg,p.len,false);showStep(RM.steps.length-1);arrive();}
    return;}
  if(!LIVE.offSince){LIVE.offSince=Date.now();return;}
  if(Date.now()-LIVE.offSince<LIVE_OFF_MS)return;
  // off the route for a while (a wrong turn, the wrong escalator): plan again from here
  const nr=liveReroute();if(!nr)return;toast(T('You have left the route. Here is a new one.'),3600);Voice.stop();
  routeWords();RM.k=-1;renderRouteSteps();renderRouteDest();MAPR.guideJump(0,0,false);showStep(0);}

/* ---- the chip on the phone's map ---- */
function liveChip(){const el=document.getElementById('liveChip');if(!el)return;const show=VIEW==='app'&&!!LIVE.src;el.hidden=!show;if(!show)return;
  const ok=LIVE.ok;el.classList.toggle('lost',!ok);
  el.innerHTML='<i></i>'+escapeHtml(ok?T('Live location')+' · '+T('±{m} m',{m:Math.round(LIVE.fix.acc)})+(LIVE.src==='sim'?' · '+T('simulated'):''):T('Looking for your location…'));}

/* ---- simulator: ?sim=1 ---- */
const LiveSim={on:QS.get('sim')==='1',pos:null,route:null,leg:0,d:0,ride:0,away:0,rand:typeof Locate!=='undefined'?Locate.seeded(20260930):Math.random,
  start(){const o=POIS[QS.get('at')?'kiosk':'ent:main']||POIS.kiosk;const s=snapToWalk(o.f,o.x,o.y);this.pos={f:o.f,x:s?s.x:o.x,y:s?s.y:o.y};setInterval(()=>this.tick(),1000);this.tick();},
  /* walk off somewhere for a while (for showing what happens when a visitor leaves the route) */
  wander(f,x,y,secs){this.pos={f,x,y};this.away=secs||20;},
  tick(){if(VIEW!=='app')return;const walking=typeof RM!=='undefined'&&RM.on&&!RM.finished&&state.route;
    if(this.away>0)this.away--;
    else if(walking){const r=state.route;if(this.route!==r){this.route=r;this.leg=0;this.d=0;this.ride=0;}
      const leg=r.legs[this.leg];let step=1.25/SC;
      if(this.ride>0){this.ride--;if(this.ride===4){this.leg++;this.d=0;const p=r.legs[this.leg].pts[0];this.pos={f:r.legs[this.leg].f,x:p[0],y:p[1]};}}
      else{let acc=0,placed=false;this.d+=step;
        for(let i=1;i<leg.pts.length;i++){const a=leg.pts[i-1],b=leg.pts[i],L=dist(a,b);if(this.d<=acc+L){const k=(this.d-acc)/(L||1);this.pos={f:leg.f,x:a[0]+(b[0]-a[0])*k,y:a[1]+(b[1]-a[1])*k};placed=true;break;}acc+=L;}
        if(!placed){const e=leg.pts[leg.pts.length-1];this.pos={f:leg.f,x:e[0],y:e[1]};if(this.leg<r.legs.length-1&&!this.ride)this.ride=8;}}}
    else this.route=null;
    if(!liveTracker)return;const fix=liveTracker.update(Locate.simulate(liveBeacons(),this.pos,this.rand),Date.now());
    if(fix)onFix(fix,'sim');else{LIVE.src='sim';if(LIVE.fix&&!liveTracker.fix)lostFix();else liveChip();}}};

/* ---- survey mode: ?survey=1 (the pilot's measuring tool) ----
   Stand directly under a beacon, choose it, press Record: the app keeps how far its dot was from where you stood. */
function surveyPanel(){const box=document.createElement('div');box.className='survey';box.id='survey';
  const opts=liveBeacons().map(b=>`<option value="${escapeHtml(b.id)}">${escapeHtml(b.id)}</option>`).join('');
  box.innerHTML=`<b>Survey</b><select id="svAt" aria-label="Beacon you are standing under">${opts}</select><button id="svRec">Record</button><button id="svCsv">CSV</button><span id="svOut">0 points</span>`;
  document.getElementById('mapwrap').appendChild(box);
  const out=()=>{const e=LIVE.log.filter(r=>r.err!==null).map(r=>r.err).sort((a,b)=>a-b),n=LIVE.log.length,wrong=LIVE.log.filter(r=>r.floorOk===false).length;
    document.getElementById('svOut').textContent=n+' points'+(e.length?' · median '+e[Math.floor(e.length/2)].toFixed(1)+' m · 90% '+e[Math.min(e.length-1,Math.floor(e.length*0.9))].toFixed(1)+' m':'')+(wrong?' · wrong floor '+wrong:'');};
  document.getElementById('svRec').onclick=()=>{const b=liveBeacons().find(x=>x.id===document.getElementById('svAt').value);if(!b)return;const f=LIVE.ok?LIVE.fix:null;
    LIVE.log.push({id:b.id,f:b.f,at:new Date().toISOString(),got:!!f,floorOk:f?f.f===b.f:null,err:f&&f.f===b.f?Math.hypot(f.x-b.x,f.y-b.y)*SC:null,acc:f?f.acc:null,n:f?f.n:null,src:LIVE.src||''});out();};
  document.getElementById('svCsv').onclick=()=>{const rows=[['beacon','floor','time','position found','right floor','error m','app accuracy m','beacons used','source']].concat(LIVE.log.map(r=>[r.id,FL[r.f],r.at,r.got?'yes':'no',r.floorOk===null?'':r.floorOk?'yes':'no',r.err===null?'':r.err.toFixed(2),r.acc===null?'':r.acc.toFixed(1),r.n===null?'':r.n,r.src]));
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.map(r=>r.join(',')).join('\r\n')],{type:'text/csv'}));a.download='ireo-pilot-survey.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);};}

/* called by boot.js once the app is up */
function startLive(){if(QS.get('survey')==='1')surveyPanel();if(LiveSim.on&&liveTracker)LiveSim.start();liveChip();}
