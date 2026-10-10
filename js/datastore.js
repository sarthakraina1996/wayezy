/* ============================================================
   LIVE DATA: offers, wait times, events, promotions, roles, users, stats,
   and the kiosk ad system: kiosks, adrules (each store's airtime), adcreatives (their ads), adstats (plays).
   On claude.ai the page uses the artifact database (window.claude.use('db')).
   Served by the demo server (node server.js) it uses ServerDB: one live copy on the server, pushed to
   every kiosk, phone and admin screen that can reach it the moment anything changes.
   Opened as a file it uses LocalDB (localStorage + BroadcastChannel): a kiosk tab, the phone
   view and the admin hub open in the same browser stay in sync, and the demo works offline.
   Both expose the same small API, so a production backend (Firestore, Supabase...) only has
   to provide it too:  collection(c).onSnapshot(fn,err) -> unsubscribe,  doc('c/id').set(data)|delete().
   ============================================================ */
const INFO={stores:{},ads:{},events:{},settings:{},roles:{},users:{},stats:{},kiosks:{},adrules:{},adcreatives:{},adstats:{}};
const COLLECTIONS=Object.keys(INFO);
let DB=null,DBOK=false,DBKIND='none',DBUNSUB=[];

/* Sample content, copied from the published demo's database. Every item is marked sample:true
   and can be cleared in Admin hub > Settings. Wait times are stamped "now" when seeded. */
function sampleSeed(){const ago=m=>new Date(Date.now()-m*60000).toISOString();
  const wait=(mins,status,m)=>({mins,status,updatedAt:ago(m),by:'Sample data'});
  return {
    stores:{avatar:{sample:true,wait:wait(15,'open',4)},bellagio:{sample:true,wait:wait(45,'open',12)},bisaat:{sample:true,wait:wait(0,'closed',30)},
      bluetokai:{sample:true,wait:wait(0,'open',6),specials:['Pour-over of the week'],specialsBy:'Sample data',offers:[{id:'s6',title:'A cookie with any coffee',detail:'Show your member card at the counter',until:'2026-11-30',status:'live',members:true,sample:true}]},
      nicobar:{sample:true,offers:[{id:'s7',title:'Extra 10% off',detail:'On the Autumn Collection, for members',until:'2026-11-15',status:'live',members:true,sample:true}]},cafedori:{sample:true,wait:wait(5,'open',3)},fatlulu:{sample:true,wait:wait(20,'open',9)},
      greenr:{sample:true,wait:wait(15,'open',15)},juujuu:{sample:true,wait:wait(30,'open',18)},manam:{sample:true,wait:wait(0,'open',11)},
      parisian:{sample:true,wait:wait(0,'open',7)},romeolane:{sample:true,wait:wait(20,'open',20)},
      starbucks:{sample:true,wait:wait(10,'open',5),specials:['Cold brew, made fresh this morning','Warm croissants until noon'],specialsBy:'Sample data',offers:[{id:'s1',title:'Buy 1 Get 1 Free',kicker:'Afternoon treat',detail:'On handcrafted beverages, 3–5 PM',until:'2026-10-31',status:'live',sample:true}]},
      goodearth:{sample:true,offers:[{id:'s2',title:'Festive Edit',kicker:'New in store',detail:'Seasonal home collection now in',until:'2026-11-15',status:'live',sample:true}]},
      masaba:{sample:true,offers:[{id:'s3',title:'Flat 30% off',kicker:'Season special',detail:'On selected styles',until:'2026-10-15',status:'live',sample:true}]},
      kama:{sample:true,offers:[{id:'s4',title:'Free gift',kicker:'With purchase',detail:'On orders above ₹3,000',until:'2026-10-20',status:'live',sample:true}]},
      vnv:{sample:true,offers:[{id:'s5',title:'Sneaker drop Saturday',kicker:'Launch',detail:'Limited pairs from 11 AM',until:'2026-10-04',status:'live',sample:true}]}},
    ads:{sample_ad1:{headline:'Evenings on the Boulevard',sub:'Live music by the fountains, Fridays',kicker:'At Ireo Boulevard',status:'live',active:true,sample:true},
      sample_ad2:{brand:'nicobar',headline:'The Autumn Collection',sub:'Now in store',kicker:'Featured',status:'live',active:true,sample:true}},
    events:{sample_ev1:{title:'Live acoustic evening',date:'2026-10-02',time:'7–9 PM',where:'Central boulevard',desc:'Acoustic sets by the water features.',sample:true}},
    settings:{mall:{staleMins:1440,open:'10:00',close:'23:00'},parking:{levels:['B1','B2'],lifts:['LC','LD','LE','LA'],sample:true}},
    /* the ad system: four sample screens, a few stores with airtime, and ads built from their photos */
    kiosks:{K1:{name:'Boulevard, ground floor',at:'G,374,699',heading:0,loopSecs:60,active:true},
      K2:{name:'Main entrance',at:'G,384,1123',heading:0,loopSecs:60,active:true,sample:true},
      K3:{name:'First floor, by the escalators',at:'F,330,815',heading:0,loopSecs:45,active:true,sample:true},
      K4:{name:'Second floor, dining',at:'S,357,699',heading:0,loopSecs:45,active:true,sample:true}},
    adrules:{starbucks:{enabled:true,kiosks:['*'],freeAds:3,maxAds:5,extraPrice:1500,autoApprove:false,sample:true,
        slots:[{id:'sb1',from:'09:00',to:'12:00',secs:6},{id:'sb2',from:'14:00',to:'17:00',secs:6}]},
      nicobar:{enabled:true,kiosks:['K1','K2'],freeAds:3,maxAds:4,extraPrice:2000,sample:true,slots:[{id:'nb1',from:'18:00',to:'21:00',secs:10}]},
      masaba:{enabled:true,kiosks:['*'],freeAds:2,maxAds:3,extraPrice:2000,sample:true,slots:[{id:'ms1',from:'12:00',to:'15:00',secs:8},{id:'ms2',from:'19:00',to:'22:00',secs:8}]},
      goodearth:{enabled:true,kiosks:['K1','K3'],freeAds:3,maxAds:5,extraPrice:1500,sample:true,slots:[{id:'ge1',from:'10:00',to:'23:00',secs:8}]}},
    adcreatives:{sample_c1:{brand:'starbucks',kind:'card',title:'Buy 1 Get 1 Free',sub:'Handcrafted beverages, 3–5 PM',status:'live',slots:[],createdAt:ago(900),sample:true},
      sample_c2:{brand:'nicobar',kind:'card',photo:'nicobar',title:'The Autumn Collection',sub:'Now in store',status:'live',slots:[],createdAt:ago(800),sample:true},
      sample_c3:{brand:'masaba',kind:'card',photo:'masaba',title:'Flat 30% off',sub:'On selected styles',status:'live',slots:[],createdAt:ago(700),sample:true},
      sample_c4:{brand:'goodearth',kind:'card',photo:'goodearth',title:'The Festive Edit',sub:'Seasonal home collection',status:'live',slots:[],createdAt:ago(600),sample:true},
      sample_c5:{brand:'starbucks',kind:'card',title:'Seasonal beverages are here',sub:'Try one this afternoon',status:'pending',slots:['sb2'],createdAt:ago(60),sample:true}},
    users:{sample_u1:{name:'Good Earth – store manager',role:'store_mgr',store:'goodearth',sample:true},
      sample_u2:{name:'Starbucks – restaurant manager',role:'rest_mgr',store:'starbucks',sample:true},
      sample_u3:{name:'Marketing team',role:'marketing',sample:true}}
  };}

/* ---------------- local adapter ---------------- */
function LocalDB(ns){
  let store=null;                                      // in-memory fallback when localStorage is blocked
  const ok=(()=>{try{const k=ns+':probe';localStorage.setItem(k,'1');localStorage.removeItem(k);return true;}catch(e){return false;}})();
  const read=c=>{if(!ok)return (store=store||{})[c]||{};try{return JSON.parse(localStorage.getItem(ns+':'+c)||'{}')||{};}catch(e){return {};}};
  const write=(c,o)=>{if(!ok){(store=store||{})[c]=o;return;}localStorage.setItem(ns+':'+c,JSON.stringify(o));};
  const subs={};const snap=o=>({docs:Object.keys(o).map(id=>({id,data:()=>o[id]}))});
  const emit=c=>{const o=read(c);(subs[c]||[]).slice().forEach(fn=>{try{fn(snap(o));}catch(e){console.error(e);}});};
  const bc=(()=>{try{return new BroadcastChannel(ns);}catch(e){return null;}})();
  const tell=c=>{if(bc)try{bc.postMessage({c});}catch(e){}};
  if(bc)bc.onmessage=e=>{if(e.data&&e.data.c)emit(e.data.c);};
  else if(ok)addEventListener('storage',e=>{if(e.key&&e.key.startsWith(ns+':'))emit(e.key.slice(ns.length+1));});
  // first run on this device: load the sample content
  try{const s=sampleSeed();const old=ok&&localStorage.getItem(ns+':seeded');
    for(const c in s){const flag=ns+':seeded:'+c;
      if(!ok){write(c,s[c]);continue;}
      if(localStorage.getItem(flag)||(old&&['stores','ads','events','settings','users'].includes(c)))continue;   // seeded before
      write(c,Object.assign(s[c],read(c)));localStorage.setItem(flag,'1');}
    // devices seeded before specials existed get the sample specials once (only where a store has none)
    if(ok&&!localStorage.getItem(ns+':seeded:specials')){const cur=read('stores');let n=0;for(const [k,v] of Object.entries(s.stores||{}))if(v.specials&&cur[k]&&!cur[k].specials){cur[k].specials=v.specials;cur[k].specialsBy=v.specialsBy;n++;}
      if(n)write('stores',cur);localStorage.setItem(ns+':seeded:specials','1');}
    if(ok)localStorage.setItem(ns+':seeded','1');}catch(e){console.warn('seed',e);}
  return {kind:ok?'local':'memory',
    collection(c){return {onSnapshot(fn,err){(subs[c]=subs[c]||[]).push(fn);try{fn(snap(read(c)));}catch(e){err&&err(e);}return ()=>{subs[c]=(subs[c]||[]).filter(x=>x!==fn);};}};},
    doc(path){const [c,id]=path.split('/');return {
      async set(data){const o=read(c);o[id]=data;try{write(c,o);}catch(e){throw Object.assign(new Error('storage full'),{code:'storage-full'});}emit(c);tell(c);},
      async delete(){const o=read(c);delete o[id];write(c,o);emit(c);tell(c);}};}};
}

/* ---------------- server adapter (node server.js) ----------------
   One live copy of the data for every screen that can reach the server: the admin hub on a laptop, the
   kiosks and phones on the same Wi-Fi. Changes arrive as Server-Sent Events the moment they are saved;
   after a dropped connection the browser reconnects by itself and gets everything again. */
function ServerDB(info){
  const data={};COLLECTIONS.forEach(c=>data[c]={});
  const subs={};let ready=false,online=false,seq=0,mode='stream',have=false,keepT=0;
  /* the last live data, kept on this device: when the page opens without the server (sw.js serves the app from its
     cache), the screens show what they showed last, never the sample data, until the server answers again */
  const LAST='wz.lastData';
  const keep=()=>{clearTimeout(keepT);keepT=setTimeout(()=>{try{const s=JSON.stringify(data);if(s.length<2e6)localStorage.setItem(LAST,s);}catch(e){}},1500);};
  try{const o=JSON.parse(localStorage.getItem(LAST)||'null');if(o&&typeof o==='object'){COLLECTIONS.forEach(c=>{data[c]=o[c]||{};});have=true;}}catch(e){}
  const snap=o=>({docs:Object.keys(o).map(id=>({id,data:()=>o[id]}))});
  const emit=c=>{(subs[c]||[]).slice().forEach(fn=>{try{fn(snap(data[c]||{}));}catch(e){console.error(e);}});};
  const status=on=>{if(on===online)return;online=on;queueInfo();};
  const applySnapshot=(s,all)=>{COLLECTIONS.forEach(c=>{data[c]=(all&&all[c])||{};});seq=s||seq;ready=true;have=true;status(true);COLLECTIONS.forEach(emit);keep();};
  const applyChange=m=>{if(!m||!COLLECTIONS.includes(m.c)||(m.seq&&m.seq<=seq))return;
    if(m.data===null)delete data[m.c][m.id];else data[m.c][m.id]=m.data;if(m.seq)seq=m.seq;emit(m.c);keep();};
  /* streaming first; if nothing comes through (some proxies and tunnels hold streams back), long polling */
  function stream(){const es=new EventSource('api/stream');
    const give=setTimeout(()=>{if(!ready){es.close();poll();}},6000);
    es.addEventListener('snapshot',e=>{let m;try{m=JSON.parse(e.data);}catch(_){return;}clearTimeout(give);applySnapshot(m.seq,m.data);});
    es.addEventListener('change',e=>{let m;try{m=JSON.parse(e.data);}catch(_){return;}applyChange(m);});
    es.onerror=()=>status(false);}                    // EventSource retries on its own and gets everything again
  async function poll(){mode='poll';
    for(;;){try{const r=await fetch('api/poll?since='+seq,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const m=await r.json();
        if(m.snapshot)applySnapshot(m.seq,m.snapshot);else{(m.changes||[]).forEach(applyChange);status(true);}}
      catch(e){status(false);await new Promise(res=>setTimeout(res,3000));}}}
  stream();
  /* the admin password (asked for by the admin hub, kept on this device); kiosks and phones never need it */
  const KEY='ireo.adminKey';
  const key=()=>{try{return localStorage.getItem(KEY)||'';}catch(e){return '';}};
  const req=async(method,c,id,body)=>{const h={'Content-Type':'application/json'};const k=key();if(k)h['X-Admin-Key']=k;
    const r=await fetch('api/db/'+encodeURIComponent(c)+'/'+encodeURIComponent(id),{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
    if(!r.ok){let msg='HTTP '+r.status;try{msg=(await r.json()).error||msg;}catch(_){}
      throw Object.assign(new Error(msg),{code:r.status===401?'auth':r.status===413?'too-large':r.status===429?'busy':'server'});}};
  return {kind:'server',get online(){return online;},get mode(){return mode;},auth:!!(info&&info.auth),
    signedIn(){return !!key();},
    async login(k){try{const r=await fetch('api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:String(k||'')})});
        const m=await r.json().catch(()=>({}));if(r.ok){try{localStorage.setItem(KEY,String(k));}catch(e){}return {ok:true};}return {ok:false,error:r.status===401?'That password is not right.':(m.error||'Could not check the password.')};}
      catch(e){return {ok:false,error:'Could not reach the server.'};}},
    logout(){try{localStorage.removeItem(KEY);}catch(e){}},
    collection(c){return {onSnapshot(fn,err){(subs[c]=subs[c]||[]).push(fn);if(have){try{fn(snap(data[c]||{}));}catch(e){err&&err(e);}}return ()=>{subs[c]=(subs[c]||[]).filter(x=>x!==fn);};}};},
    doc(path){const [c,id]=path.split('/');return {
      async set(v){await req('PUT',c,id,v);data[c][id]=v;emit(c);},
      async delete(){await req('DELETE',c,id);delete data[c][id];emit(c);}};}};
}
/* is this page served by node server.js? */
function findServer(){
  if(typeof fetch!=='function'||typeof EventSource==='undefined'||!/^https?:$/.test(location.protocol))return Promise.resolve(null);
  const ctl=typeof AbortController!=='undefined'?new AbortController():null;const t=setTimeout(()=>ctl&&ctl.abort(),2500);
  return fetch('api/info',{cache:'no-store',signal:ctl&&ctl.signal}).then(r=>r.ok?r.json():null).then(i=>i&&i.ok?i:null).catch(()=>null).finally(()=>clearTimeout(t));
}

/* ---------------- connect ---------------- */
let infoQueued=false;
function queueInfo(){if(infoQueued)return;infoQueued=true;(typeof requestAnimationFrame==='function'?requestAnimationFrame:setTimeout)(()=>{infoQueued=false;if(typeof onInfo==='function'&&window.APP_READY)onInfo();});}
function attachDB(db,kind){
  DBUNSUB.forEach(u=>{try{typeof u==='function'&&u();}catch(e){}});DBUNSUB=[];
  COLLECTIONS.forEach(c=>INFO[c]={});
  DB=db;DBOK=true;DBKIND=kind;
  COLLECTIONS.forEach(c=>{try{DBUNSUB.push(DB.collection(c).onSnapshot(snap=>{const o={};snap.docs.forEach(d=>{o[d.id]=d.data();});INFO[c]=o;queueInfo();},
    e=>{console.warn('db',c,e&&(e.code||e.message));}));}catch(e){console.warn('db subscribe',c,e);}});
  queueInfo();
}
(function connect(tries){
  const hasClaude=typeof window!=='undefined'&&window.claude&&typeof window.claude.use==='function';
  if(hasClaude){window.claude.use('db').then(db=>{if(!db)throw new Error('no database');attachDB(db,'claude');})
    .catch(e=>{console.warn('Live database unavailable, using this device',e);if(DBKIND==='none'){const L=LocalDB('ireo-boulevard');attachDB(L,L.kind);}});return;}
  const hosted=typeof location!=='undefined'&&/claude|anthropic/.test(location.hostname);   // only inside claude.ai is a live database worth waiting for
  if(tries===0&&!hosted&&document.documentElement.dataset.host==='static'){const L=LocalDB('ireo-boulevard');attachDB(L,L.kind);return;}   // the static website copy: no server to look for
  if(tries===0&&!hosted){                             // served by node server.js: one live copy for every device
    findServer().then(info=>{if(DBKIND!=='none')return;
      let served=false;try{served=localStorage.getItem('wz.server')==='1';if(info)localStorage.setItem('wz.server','1');}catch(e){}
      if(!info&&served)info={ok:true,auth:true,away:true};   // the server is away for now: its last data, reconnecting on its own
      if(info){attachDB(ServerDB(info),'server');
        if(!info.seeded&&!info.away)fetch('api/seed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sampleSeed())}).catch(e=>console.warn('seed',e));}
      else{const L=LocalDB('ireo-boulevard');attachDB(L,L.kind);}});   // no server (a file on disk): this device only
    return;}
  if(tries===5&&DBKIND==='none'){const L=LocalDB('ireo-boulevard');attachDB(L,L.kind);}   // start on this device
  if(tries<40)setTimeout(()=>connect(tries+1),250);                               // but switch if the claude runtime turns up
})(0);
const dbLabel=()=>DBKIND==='claude'?'live':DBKIND==='server'?(DB&&DB.online?'live':'offline'):DBKIND==='local'?'device':DBKIND==='memory'?'screen':'none';
