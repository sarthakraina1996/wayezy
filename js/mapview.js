/* ============================================================
   MAP VIEW: map state and controls shared by the kiosk and the phone.
   Drawing is handed to a renderer: the 3D map (map3d.js) or, where WebGL
   is missing or fails, the 2D floor plan (map2d.js). The UI only calls the
   functions below, so it works the same with either.
   ============================================================ */
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
let MODE=QS.get('mode')==='evening'?'evening':'day';
let cur=KIOSK.f,stackMode=false,guide=null;
let MAPR=null;                                    // the active renderer
/* Where routes start. The kiosk always routes from itself; the phone from wherever the visitor
   says they are (default: the main entrance, or the kiosk whose QR code opened the page). */
let ORIGIN='kiosk';
let APP_ORIGIN=QS.get('at')?'kiosk':'ent:main';
function poiName(id){const p=POIS[id];if(!p)return '';if(p.unit&&p.unit.b)return BRANDS[p.unit.b].name;if(p.kind==='kiosk')return T('This kiosk');if(p.kind==='me')return T('My location');return tr(p.name||'');}
function originPoint(){const p=POIS[ORIGIN]||POIS.kiosk;return {id:POIS[ORIGIN]?ORIGIN:'kiosk',f:p.f,x:p.x,y:p.y,label:ORIGIN==='kiosk'||ORIGIN==='me'?T('You are here'):T('Start: {name}',{name:poiName(ORIGIN)})};}

/* ---------------- floor switcher ---------------- */
const $id=id=>document.getElementById(id);
const floorsNav=$id('floors'),floorBtns={};
const stackBtn=document.createElement('button');stackBtn.id='stack';stackBtn.className='stackbtn';stackBtn.setAttribute('aria-pressed','false');stackBtn.dataset.i18n='All floors';stackBtn.textContent='All floors';floorsNav.appendChild(stackBtn);
[...FLOOR_ORDER].reverse().forEach(f=>{const b=document.createElement('button');
  b.innerHTML=`<span class="n">${FL[f]}</span><span class="t"></span><span class="here"></span>`;
  b.onclick=()=>{interruptGuide();setFloor(f,true);poke();};floorsNav.insertBefore(b,stackBtn);floorBtns[f]=b;});
/* the floor buttons' words, in the visitor's language ("Ground" / "ग्राउंड") */
function updateFloorUI(){FLOOR_ORDER.forEach(f=>{const b=floorBtns[f];b.querySelector('.t').textContent=T(FLOORS[f].name.replace(' floor',''));b.setAttribute('aria-label',floorName(f));});
  const rl=$id('rotl'),rr=$id('rotr');if(rl){rl.title=T('Rotate left');rr.title=T('Rotate right');}syncFloorUI();}
function syncFloorUI(){const of=originPoint().f;FLOOR_ORDER.forEach(k=>{floorBtns[k].setAttribute('aria-pressed',k===cur);floorBtns[k].classList.toggle('kiosk',k===of);});
  const fn=$id('floorname');fn.querySelector('b').textContent=floorName(cur);fn.querySelector('span').textContent=cur===of?T('You are here'):'';
  const pf=document.querySelector('#pFloorSel .pfl');if(pf)pf.textContent=floorName(cur);}   // the phone's floor chip follows the map
function syncStackUI(){stackBtn.setAttribute('aria-pressed',stackMode);}

/* ---------------- renderer dispatch ---------------- */
function setFloor(f,refit,opts){if(!FLOORS[f]||!MAPR)return;MAPR.setFloor(f,refit,opts);if(state.brand||state.toilet)renderCard();}
function fitFloor(ms){MAPR&&MAPR.fitFloor(ms);}
function drawRoute(r){MAPR&&MAPR.drawRoute(r);}
function clearRoute(){MAPR&&MAPR.clearRoute();}
function showRouteOnFloor(animate){MAPR&&MAPR.showRouteOnFloor(animate);}
function startGuide(){MAPR&&MAPR.startGuide();}
function stopGuide(){MAPR&&MAPR.stopGuide();}
function applyHighlights(){MAPR&&MAPR.applyHighlights();}
function markUnit(u){MAPR&&MAPR.markUnit(u);}
function refreshSigns(){MAPR&&MAPR.refreshSigns&&MAPR.refreshSigns();}
function setOrigin(id){ORIGIN=POIS[id]?id:'kiosk';MAPR&&MAPR.setOrigin();syncFloorUI();}
function applyMode(){MAPR&&MAPR.applyMode();$id('daynight').textContent=T(MODE==='evening'?'Day':'Evening');document.body.classList.toggle('night',MODE==='evening');}

/* ---------------- controls ---------------- */
/* touching a control during a route pauses the walk (Resume carries on); otherwise it just stops it */
function interruptGuide(){if(typeof RM!=='undefined'&&RM.on){RM.userHold=true;MAPR.guideHold&&MAPR.guideHold(true);}else stopGuide();}
$id('zin').onclick=()=>{interruptGuide();MAPR.zoom(0.72);poke();};
$id('zout').onclick=()=>{interruptGuide();MAPR.zoom(1/0.72);poke();};
$id('zfit').onclick=()=>{interruptGuide();fitFloor(650);poke();};
$id('rotl').onclick=()=>{interruptGuide();MAPR.rotate(0.5);poke();};
$id('rotr').onclick=()=>{interruptGuide();MAPR.rotate(-0.5);poke();};
$id('tilt').onclick=()=>{interruptGuide();const t=MAPR.toggleTilt();if(t)$id('tilt').textContent=t;poke();};
$id('compass').onclick=()=>{interruptGuide();MAPR.faceKiosk();poke();};
$id('daynight').onclick=()=>{MODE=MODE==='evening'?'day':'evening';applyMode();poke();};
stackBtn.onclick=()=>{interruptGuide();MAPR.toggleStack();poke();};
$id('guidestop').onclick=()=>{stopGuide();showRouteOnFloor(true);poke();};
/* one control column plus a rotation bar, so nothing overlaps */
(function(){const mw=$id('mapwrap');const rb=document.createElement('div');rb.className='rotbar';
  const rl=$id('rotl'),rr=$id('rotr'),cp=$id('compass');
  rl.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" /></svg>';
  rr.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /> <path d="M21 3v5h-5" /></svg>';
  rl.title=T('Rotate left');rr.title=T('Rotate right');rb.append(rl,cp,rr);mw.appendChild(rb);
  const mc=document.createElement('div');mc.className='mapctl';mc.append(floorsNav,mw.querySelector('.zoom'));mw.appendChild(mc);})();

function showMapNotice(msg){let n=$id('mapNotice');if(!n){n=document.createElement('div');n.id='mapNotice';n.className='mapnotice';n.setAttribute('role','status');$id('mapwrap').appendChild(n);}
  n.textContent=msg||'';n.hidden=!msg;}

/* ---------------- start the map: 3D if possible, otherwise the 2D plan ---------------- */
function loadScript(src,ms){return new Promise((ok,fail)=>{const s=document.createElement('script');s.src=src;s.async=false;
  const t=setTimeout(()=>{s.remove();fail(new Error('timed out: '+src));},ms||12000);
  s.onload=()=>{clearTimeout(t);ok();};s.onerror=()=>{clearTimeout(t);s.remove();fail(new Error('could not load '+src));};document.head.appendChild(s);});}
const THREE_CDN='https://cdn.jsdelivr.net/npm/three@0.147.0/';
/* three.js: a copy in vendor/ if there is one (offline kiosks), otherwise the CDN */
function ensureThree(){
  if(window.THREE&&THREE.OrbitControls)return Promise.resolve();
  const core=()=>window.THREE?Promise.resolve():loadScript('vendor/three.min.js',6000).catch(()=>loadScript(THREE_CDN+'build/three.min.js'));
  const ctl=()=>THREE.OrbitControls?Promise.resolve():loadScript('vendor/OrbitControls.js',6000).catch(()=>loadScript(THREE_CDN+'examples/js/controls/OrbitControls.js'));
  // optional: the Blender asset kit (js/decor.js) needs the glTF loader; without it the map uses its built-in trees and gate
  const gltf=()=>(typeof DECOR==='undefined'||THREE.GLTFLoader)?Promise.resolve():loadScript('vendor/GLTFLoader.js',6000).catch(()=>loadScript(THREE_CDN+'examples/js/loaders/GLTFLoader.js')).catch(()=>{});
  return core().then(ctl).then(gltf);
}
/* until a renderer is ready, map calls are harmless no-ops (the floor is still remembered) */
MAPR=new Proxy({kind:'none',setFloor(f){cur=f;syncFloorUI();},toggleTilt(){return null;}},{get:(t,k)=>k in t?t[k]:()=>{}});
function startMap(){
  const loading=$id('loading');
  const ready=()=>{if(loading&&loading.parentNode)loading.remove();setTimeout(()=>{if(Object.values(BRANDS).some(x=>x.custom))MAPR.refreshStores();},0);   /* stores added in the admin hub before the map finished building */
    syncFloorUI();applyMode();applyHighlights();
    if(state.route){drawRoute(state.route);setFloor(state.route.legs[0].f,false);showRouteOnFloor(false);}   // a route chosen before the map finished loading
    renderQuick();renderPanels();};
  const fallback=e=>{
    if(e)reportError(e,'3D map');
    if(MAPR.kind==='2d')return;
    try{MAPR.dispose&&MAPR.dispose();}catch(_){}
    $id('scene').innerHTML='';$id('labels').innerHTML='';document.body.classList.add('map2d');
    MAPR=createMap2D();ready();
    if(state.route)drawRoute(state.route);applyHighlights();setFloor(cur,false);fitFloor(0);
    if(e)toast(T('Showing the 2D map on this screen'));};
  if(QS.get('map')==='2d'){fallback(null);return;}
  ensureThree().then(()=>typeof Intro!=='undefined'?Intro.rolling():0).then(()=>{try{MAPR=createMap3D(ready,fallback);}catch(e){fallback(e);}},fallback);   // the 3D build waits for the intro to be rolling
}
updateFloorUI();
