/* ============================================================
   UI: kiosk, phone app and admin hub on one live data layer
   ============================================================ */
const state={brand:null,cat:null,route:null,stepFree:false,query:'',toilet:null,targetUnit:null,noRoute:false};
/* no ?view=: phones get the app, everything else the kiosk */
let VIEW=['kiosk','app','admin'].includes(QS.get('view'))?QS.get('view'):(matchMedia('(max-width:700px)').matches?'app':'kiosk');
if(QS.get('lock')==='1')document.body.classList.add('lock');
['kLogo','pLogo','sLogo'].forEach(id=>{const i=document.getElementById(id);if(i)i.src=LOGO_G;});document.getElementById('aLogo').src=LOGO_W;   // colour on the white bars, white on the idle screen

const GROUPS={fashion:{name:'Fashion',cats:['fashion','access'],icon:'bag'},dining:{name:'Dining',cats:['food'],icon:'fork'},home:{name:'Home Decor',cats:['home'],icon:'sofa'},
  beauty:{name:'Beauty & Wellness',short:'Beauty',cats:['beauty'],icon:'lotus'},more:{name:'More',cats:['other','cinema'],icon:'more'}};
function catMatch(c){const g=GROUPS[state.cat];return g?g.cats.includes(c):c===state.cat;}
function groupOf(b){const c=BRANDS[b].cat;for(const k in GROUPS)if(GROUPS[k].cats.includes(c))return k;return 'more';}
/* the venue the app is running in (Admin -> Settings): the demo shows Ireo Boulevard, whose plans the map is built from */
function venueName(){return String((typeof INFO!=='undefined'&&INFO.settings&&INFO.settings.mall&&INFO.settings.mall.name)||'').trim()||'Ireo Boulevard';}
function escapeHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const isBrand=b=>typeof b==='string'&&Object.prototype.hasOwnProperty.call(BRANDS,b);
/* data URLs from the database go into src="": only accept real image data */
const safeImg=u=>typeof u==='string'&&/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(u)?u:'';

/* ============================================================
   SELECTION AND ROUTING
   ============================================================ */
let guideT=null;
/* on the kiosk, preview the walk a moment after the overview (Google Maps style); never on the phone */
/* picking a store shows the whole route; the guided walk starts with Take me here (route mode) */
function scheduleGuide(){clearTimeout(guideT);}
function cancelScheduledGuide(){clearTimeout(guideT);}
function applyRoute(route){
  state.route=route;state.noRoute=!route;
  if(route){drawRoute(route);setFloor(route.legs[0].f,false);showRouteOnFloor(true);scheduleGuide();}
  else{clearRoute();cancelScheduledGuide();}
}
function brandTargets(b){return unitsOfBrand(b).map(u=>'u:'+u.key);}
function selectBrand(b){
  if(!isBrand(b))return;
  state.brand=b;state.cat=null;state.toilet=null;applyHighlights();
  const atIt=POIS[ORIGIN]&&POIS[ORIGIN].unit&&POIS[ORIGIN].unit.b===b;
  const route=atIt?null:routeTo(brandTargets(b),{from:ORIGIN,stepFree:state.stepFree});
  state.targetUnit=route?POIS[route.target].unit:(unitsOfBrand(b)[0]||null);state.here=atIt;
  applyRoute(route);
  if(!route){const u=state.targetUnit;if(u){setFloor(u.f,false);MAPR&&MAPR.showRouteOnFloor&&fitFloor(500);}
    if(!atIt)toast(T(state.stepFree?'No step-free route found to {name}':'No route found to {name}. Please ask at the concierge desk.',{name:BRANDS[b].name}));}
  bumpStat(b);renderCard();renderQuick();
}
function selectToilet(t){routeToPois(['wc:'+t.id],{title:t.name,kind:'wc',g:t.g});}
function routeToPois(ids,info){
  state.brand=null;state.cat=null;applyHighlights();
  const route=routeTo(ids,{from:ORIGIN,stepFree:state.stepFree});state.targetUnit=null;state.toilet=info;state.here=false;
  applyRoute(route);
  if(!route)toast(T('No route found. Please ask at the concierge desk.'));
  renderCard();renderQuick();
}
/* re-plan the current trip after "step-free" or the starting point changes */
function reroute(){if(state.brand)selectBrand(state.brand);else if(state.toilet&&state.toilet.ids)routeToPois(state.toilet.ids,state.toilet);else if(state.route)resetAll();}
function nearestToilet(g){
  const ids=Object.keys(POIS).filter(k=>k.startsWith('wc:')&&(!g||POIS[k].g===g||POIS[k].g==='all'));
  routeToPois(ids,{kind:'wc',g:g||null,ids,title:g==='m'?"Nearest men's toilets":g==='f'?"Nearest women's toilets":'Nearest toilets'});
}
function nearestLift(){
  const f=originPoint().f;const ids=CONNECTORS.filter(c=>c.type==='lift'&&c.at[f]).map(c=>'c:'+c.id+':'+f);
  routeToPois(ids,{kind:'lift',ids,title:'Nearest lift'});
}
function goEntrance(){routeToPois(['ent:main'],{kind:'entrance',ids:['ent:main'],title:'Main entrance'});}
function onUnitTap(u){
  poke();
  if(u.b){selectBrand(u.b);return;}
  state.brand=null;state.route=null;state.toilet={kind:'unit',unit:u};clearRoute();applyHighlights();
  markUnit(u);renderCard();
}
function resetAll(){
  if(typeof RM!=='undefined'&&RM.on){RM.on=false;clearInterval(RM.timer);clearInterval(RM.arriveT);Voice.stop();document.getElementById('rhud').hidden=true;document.body.classList.remove('routing');if(VIEW==='app')setMapFull(false);}
  state.brand=null;state.cat=null;state.route=null;state.toilet=null;state.targetUnit=null;state.query='';state.noRoute=false;state.here=false;
  cancelScheduledGuide();qEl.value='';pqEl.value='';clearRoute();applyHighlights();setFloor(originPoint().f,false);fitFloor(400);
  document.querySelectorAll('.modal').forEach(m=>m.remove());closeKbd();renderCard();renderQuick();
}
const walkBtn=document.getElementById('walkbtn');
walkBtn.onclick=()=>{takeMeHere();};walkBtn.dataset.i18n='Take me here';walkBtn.textContent=T('Take me here');
setInterval(()=>{walkBtn.hidden=!(state.route&&!guide);},250);
document.getElementById('mapwrap').addEventListener('pointerdown',cancelScheduledGuide);

/* ---------------- live data helpers (collections come from datastore.js) ---------------- */
function onInfo(){applyCustomStores();onAdsData();renderPanels();renderQuick();refreshSigns();if(VIEW==='admin')renderAdmin();if(typeof Member!=='undefined')Member.boot();}
/* shops added in the admin hub (stores/<key> with custom:true) join the map, search and routing */
let customKey='';
function applyCustomStores(){const list=Object.entries(INFO.stores).filter(([k,v])=>v&&v.custom&&v.name&&Array.isArray(v.units));
  const key=JSON.stringify(list.map(([k,v])=>[k,v.name,v.cat,v.units]));if(key===customKey)return;customKey=key;
  Object.keys(BRANDS).forEach(k=>{if(BRANDS[k].custom&&!INFO.stores[k])unregisterStore(k);});
  list.forEach(([k,v])=>registerStore(k,v));MAPR&&MAPR.refreshStores&&MAPR.refreshStores();applyHighlights();}
const S=b=>INFO.stores[b]||{};
const todayISO=()=>localISO();                          // the mall's local date, not UTC
function liveOffers(b){return (S(b).offers||[]).filter(o=>o.status==='live'&&(!o.until||o.until>=todayISO()));}
function waitOf(b){const w=S(b).wait;if(!w)return null;const age=(Date.now()-Date.parse(w.updatedAt||0))/60000;const lim=(INFO.settings.mall||{}).staleMins||120;return Object.assign({},w,{age,stale:!(age<lim)});}
/* a wait time older than the stale limit is not shown to visitors at all (an old number looks neglected); staff screens pass staff=true */
function waitView(b,staff){const w=waitOf(b);if(!w)return null;if(w.status==='closed')return{t:T('Closed'),cls:'grey',sub:T('Not seating now')};
  if(w.stale)return staff?{t:'—',cls:'grey',sub:T('Wait time not updated')}:null;if(!w.mins)return{t:T('No wait'),cls:'ok',sub:T('Walk straight in')};
  return{t:w.mins>=45?T('45+ min'):T('{n} min',{n:w.mins}),cls:'',sub:T('wait time'),mins:w.mins};}
function ago(iso){const m=Math.round((Date.now()-Date.parse(iso||''))/60000);if(!(m>=0))return'';if(m<1)return T('just now');if(m<60)return T('{n} min ago',{n:m});const h=Math.round(m/60);return h<24?T('{n} h ago',{n:h}):T('{n} d ago',{n:Math.round(h/24)});}
function fmt12(t){if(!/^\d{1,2}:\d{2}$/.test(t||''))return'';const[h,m]=t.split(':').map(Number);return clockText(h,m);}
/* the mall's opening hours: "10 AM" in English, "सुबह 10 बजे" in Hindi */
const hourLabel=t=>LANG==='hi'?fmt12(t):AdSched.label(t);
function openState(b){const h=S(b).hours;if(!h||!fmt12(h.open)||!fmt12(h.close))return null;const n=new Date(),m=n.getHours()*60+n.getMinutes();
  const[a1,a2]=h.open.split(':').map(Number),[c1,c2]=h.close.split(':').map(Number);const o=a1*60+a2,c=c1*60+c2;const isOpen=c>o?(m>=o&&m<c):(m>=o||m<c);
  return{isOpen,text:fmt12(h.open)+' – '+fmt12(h.close)};}
function unitText(b){const us=unitsOfBrand(b).filter(u=>!u.noRoute);const by={};us.forEach(u=>{(by[u.f]=by[u.f]||[]).push(u.id);});
  return FLOOR_ORDER.filter(f=>by[f]).map(f=>`${floorName(f)} · ${T('Unit {id}',{id:by[f].map(tr).join(', ')})}`).join('<br>');}
function floorText(b){return floorsOfBrand(b).map(floorName).join(T(' & '));}
function phClass(b){return PHOTOS[b]?' ph ph-'+b:'';}
function coverStyle(b){if(PHOTOS[b])return '';const c=BRANDS[b].cat;const base={fashion:['#223A5E','#4E6A93'],access:['#4C3566','#8A6AA8'],beauty:['#6E2E42','#B45F78'],home:['#2F4B2A','#6E8B4E'],
  food:['#5A3A1E','#A8733C'],cinema:['#5E1E1C','#A5403A'],other:['#3D463F','#7A857C']}[c]||['#1E2551','#2C3778'];return `background:${base[0]}`;}
function bumpStat(b){if(!DBOK)return;const st=INFO.stats[b]||{};const today=todayISO();const next={directions:(st.directions||0)+1,today:st.day===today?(st.today||0)+1:1,day:today,lastAt:new Date().toISOString()};
  INFO.stats[b]=next;DB.doc('stats/'+b).set(next).catch(e=>console.warn('stats',e));}
let toastEl=null,toastT=null;
function toast(t,ms){if(!toastEl){toastEl=document.createElement('div');toastEl.className='toast';toastEl.setAttribute('role','status');document.body.appendChild(toastEl);}
  toastEl.textContent=t;toastEl.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{toastEl.hidden=true;},ms||3200);}

/* ---------------- route helpers ---------------- */
/* the directions in the visitor's language (engine.js builds the Hindi itself) */
function stepsOf(r,dest){const st=directions(r,{dest,lang:LANG,from:poiName(r.from)}),c=state.toilet&&state.toilet.kind==='car'&&state.toilet.car;
  if(c&&st.length)Object.assign(st[st.length-1],carStep(r,c));return st;}
function stepsHTML(r,dest){return '<ol class="steps">'+stepsOf(r,dest).map(s=>`<li class="${s.ride?'ride':s.end?'end':''}"><i>${IC[s.ic]||IC.up}</i><span>${escapeHtml(s.t)}</span>${s.m?`<em>${T('{m} m',{m:s.m})}</em>`:(s.ride&&s.f!==cur?`<button data-floor="${s.f}">${T('Show {floor}',{floor:flShort(s.f)})}</button>`:'')}</li>`).join('')+'</ol>';}
function destName(){if(state.brand)return BRANDS[state.brand].name;const t=state.toilet;if(!t)return'';if(t.kind==='entrance')return T('The main entrance');if(t.kind==='lift')return T('The lift');if(t.kind==='unit')return T('Unit {id}',{id:t.unit.id});if(t.kind==='car')return T('Your car');return T('The toilets');}
/* why there is no route, in words a visitor can act on */
function noRouteHTML(){if(state.here)return `<p class="note routenote">${T('You are already here.')}</p>`;if(!state.noRoute)return '';
  return `<p class="note routenote">${state.stepFree?T('There is no step-free route from here. '):''}${T("We couldn't plan a route from {from}. Please ask at the concierge desk.",{from:escapeHtml(poiName(ORIGIN)||T('here'))})}</p>`;}

/* ---------------- categories, tabs ---------------- */
let KTAB='map',PTAB='home';
/* Categories live in the chips at the top of the panel; places to go (map, A-Z, offers, events, services)
   in the bar at the bottom. Nothing is offered twice. */
const KTABS=[['map','Map','map'],['directory','Directory','az'],['offers','Offers','offer'],['events','Events','cal'],['services','Services','svc']];
const PTABS=[['home','Home','home'],['map','Map','map'],['offers','Offers','offer'],['events','Events','cal'],['me','Account','user']];
let OFFTAB='all';                                         // the phone's Offers tab: everything, or members' offers
const PCHIPS=[['all','All','bag'],['fashion','Fashion','bag'],['dining','Dining','fork'],['home','Home Decor','sofa'],['beauty','Beauty','lotus'],['more','More','more']];
function renderQuick(){
  const kc=document.getElementById('kCats');
  patchHTML(kc,Object.entries(GROUPS).map(([k,g])=>`<button class="k-cat" data-g="${k}" aria-pressed="${state.cat===k}"><i>${IC[g.icon]}</i>${T(g.short||g.name)}</button>`).join(''));
  kc.querySelectorAll('button').forEach(b=>b.onclick=()=>{poke();KTAB='map';setGroup(b.dataset.g,false,()=>swapIn(document.getElementById('kBody')));});
  const kt=document.getElementById('kTabs');
  patchHTML(kt,KTABS.map(([k,t,i])=>`<button data-t="${k}" aria-pressed="${KTAB===k&&!state.cat}">${IC[i]}${T(t)}</button>`).join(''));
  kt.querySelectorAll('button').forEach(b=>b.onclick=()=>{poke();setKTab(b.dataset.t);});
  const pc=document.getElementById('pChips');
  patchHTML(pc,PCHIPS.map(([k,t,i])=>`<button data-c="${k}" aria-pressed="${(k==='all'&&!state.cat)||state.cat===k}">${IC[i]}<span>${T(t)}</span></button>`).join(''));
  pc.querySelectorAll('button').forEach(b=>b.onclick=()=>{const k=b.dataset.c;PTAB='home';setGroup(k==='all'?null:k,k!=='all',()=>{document.getElementById('pScroll').scrollTop=0;swapIn(document.getElementById('pList'));});});
  const pt=document.getElementById('pTabs');
  patchHTML(pt,PTABS.map(([k,t,i])=>`<button data-t="${k}" aria-pressed="${PTAB===k}"><i>${k==='me'&&typeof Member!=='undefined'&&Member.on?`<b class="avatar">${escapeHtml((firstName()||'M')[0].toUpperCase())}</b>`:IC[i]}</i><span>${T(t)}</span></button>`).join(''));
  document.getElementById('app').dataset.tab=PTAB;
  pt.querySelectorAll('button').forEach(b=>b.onclick=()=>{if(typeof RM!=='undefined'&&RM.on)exitRouteMode(false);PTAB=b.dataset.t;if(PTAB!=='home')state.cat=null;if(PTAB!=='home'&&PTAB!=='map'){clearSelection();state.query='';pqEl.value='';}renderQuick();
    afterPaint(()=>{if(PTAB!=='home'&&PTAB!=='map')applyHighlights();setMapFull(PTAB==='map');renderPanels();document.getElementById('pScroll').scrollTop=0;swapIn(document.getElementById('pList'));});});
  renderToday();
}
/* the kiosk header's one line about today */
function renderToday(){const el=document.getElementById('kToday');if(!el)return;const m=INFO.settings.mall||{};
  const hours=m.hours||(m.open&&m.close?hourLabel(m.open)+' – '+hourLabel(m.close):'');
  const nowait=dineList().filter(b=>{const w=waitView(b);return w&&w.cls==='ok';}).length,offers=allOffers().length;
  el.innerHTML=[hours?`<span>${IC.clock}${T('Open today {hours}',{hours:escapeHtml(hours)})}</span>`:'',nowait?`<span>${IC.fork}${T(nowait>1?'{n} restaurants with no wait':'{n} restaurant with no wait',{n:nowait})}</span>`:'',offers?`<span>${IC.tag}${T(offers>1?'{n} offers live':'{n} offer live',{n:offers})}</span>`:''].filter(Boolean).join('');}
function clearSelection(){if(state.brand||state.route||state.toilet){state.brand=null;state.toilet=null;state.targetUnit=null;state.route=null;state.noRoute=false;state.here=false;cancelScheduledGuide();clearRoute();}}
/* the bar answers at once; the list and the map follow a frame later (motion.js afterPaint), so the selection slides smoothly */
function setGroup(g,keep,then){state.cat=state.cat===g&&!keep?null:g;clearSelection();renderQuick();afterPaint(()=>{applyHighlights();renderPanels();if(then)then();});}
function setKTab(t){const was=KTAB;KTAB=t;state.cat=null;clearSelection();renderQuick();
  afterPaint(()=>{if(t==='map')fitFloor(500);applyHighlights();renderPanels();const kb=document.getElementById('kBody');kb.scrollTop=0;if(was!==t)swapIn(kb);});}

/* ---------------- shared list builders ---------------- */
/* search: typo-tolerant and synonym-aware (engine.js), plus the tags stores add in the admin hub */
function brandsList(){const q=(state.query||'').trim();
  if(q)return searchBrands(q,{tags:b=>S(b).tags}).map(r=>r.b);
  let list=brandKeys();if(state.cat&&GROUPS[state.cat])list=list.filter(b=>GROUPS[state.cat].cats.includes(BRANDS[b].cat));
  return list.sort((a,b)=>BRANDS[a].name.localeCompare(BRANDS[b].name));}
function itemHTML(b){const w=BRANDS[b].cat==='food'?waitView(b):null;const off=liveOffers(b);
  return `<button class="item${off.length?' has-off':''}" data-b="${b}">${thumbHTML(b)}
  <div class="t"><b>${escapeHtml(BRANDS[b].name)}${Member.isFav(b)&&VIEW==='app'?`<i class="favdot" aria-label="${T('Saved')}">${IC.heart}</i>`:''}</b><span>${escapeHtml(catName(BRANDS[b].cat))} · ${floorsOfBrand(b).map(flShort).join(', ')}</span></div>
  ${w?`<div class="r"><b class="${w.cls}">${w.t}</b>${escapeHtml(w.sub)}</div>`:''}${off.length?`<span class="chip item-off${off[0].members?' mem':''}">${(offerLocked(off[0])?IC.lock:IC.tag).replace('<svg','<svg width="12" height="12"')} ${escapeHtml(offerTitle(off[0]))}</span>`:''}</button>`;}
function dineList(limit){const food=brandKeys().filter(b=>BRANDS[b].cat==='food');
  const key=b=>{const w=waitView(b);if(!w)return 900;if(w.cls==='grey')return 800;return w.cls==='ok'?0:Math.min(45,w.mins)||60;};
  food.sort((a,b)=>key(a)-key(b)||BRANDS[a].name.localeCompare(BRANDS[b].name));return limit?food.slice(0,limit):food;}
function liveAds(){return Object.entries(INFO.ads).filter(([,a])=>a&&a.status==='live'&&a.active!==false).map(([id,a])=>Object.assign({id},a));}
function eventsList(){return Object.entries(INFO.events).map(([id,e])=>Object.assign({id},e)).filter(e=>e.title&&(!e.date||e.date>=todayISO())).sort((a,b)=>(a.date||'').localeCompare(b.date||''));}
function allOffers(){const o=[];brandKeys().forEach(b=>liveOffers(b).forEach(x=>o.push(Object.assign({b},x))));return o;}
function shortDate(d){const t=new Date(d+'T00:00');return isNaN(t)?'':t.toLocaleDateString(locale(),{day:'numeric',month:'short'});}
function promoHTML(a){const b=isBrand(a.brand)?a.brand:'';return `<div class="promo${b&&PHOTOS[b]?' promo-ph ph-'+b:''}"${b?` data-b="${b}" role="button" tabindex="0"`:''}><small>${escapeHtml(tc(a.kicker)||T('Featured'))}</small><b>${escapeHtml(tc(a.headline)||'')}</b><span>${escapeHtml(tc(a.sub)||'')}${b?' · '+escapeHtml(BRANDS[b].name):''}</span></div>`;}
function servicesHTML(){return `${mallHours()?`<p class="note">${T('Mall hours: ')}<b>${escapeHtml(mallHours())}</b></p>`:''}<div class="svc">
  <button data-act="wc">${IC.wc}${T('Toilets')}</button><button data-act="lift">${IC.lift}${T('Lifts')}</button>
  <button data-act="exit">${IC.exit}${T('Exit')}</button><button data-act="stepfree" aria-pressed="${state.stepFree}">${IC.access}${T('Step-free route')}</button>
  <button data-act="help">${IC.phone}${T('Help desk')}</button><button data-act="mode">${IC.clock}${T(MODE==='day'?'Evening view':'Day view')}</button>
  <button data-act="lang" lang="${LANG==='hi'?'en':'hi'}">${IC.lang}${LANG==='hi'?'English':'हिन्दी'}</button></div>`;}
/* an empty list says what is missing, why, and offers somewhere useful to go instead */
function emptyHTML(icon,title,text,act,actText){return `<div class="empty-state"><i>${IC[icon]||''}</i><b>${title}</b>${text?`<span>${text}</span>`:''}${act?`<button class="btn sm" data-act="${act}">${actText}</button>`:''}</div>`;}
function eventsHTML(){const ev=eventsList();if(!ev.length)return emptyHTML('cal',T('No upcoming events are listed right now.'),T('New events show up here as soon as they are announced.'),allOffers().length?'alloffers':'',T("See today's offers"));
  return ev.map(e=>`<button class="item" ${isBrand(e.brand)?`data-b="${e.brand}"`:''}><div class="thumb" style="background:#1E2551">${e.date?shortDate(e.date):T('Soon')}</div><div class="t"><b>${escapeHtml(tc(e.title))}</b><span>${escapeHtml([tc(e.time),tc(e.where)].filter(Boolean).join(' · '))}</span><br><span>${escapeHtml(tc(e.desc)||'')}</span></div></button>`).join('');}

/* ---------------- logos (uploaded in the admin hub) ---------------- */
function logoOf(b){return safeImg(S(b).logo);}
function logoImg(b,cls){const l=logoOf(b);return l?`<img class="${cls||'blogo'}" src="${l}" alt="${escapeHtml(T('{name} logo',{name:BRANDS[b].name}))}">`:'';}
function thumbHTML(b){if(PHOTOS[b])return `<div class="thumb ph ph-${b}">${logoOf(b)?`<span class="thumb-logo">${logoImg(b)}</span>`:''}</div>`;
  if(logoOf(b))return `<div class="thumb logo-th">${logoImg(b)}</div>`;return `<div class="thumb" style="${coverStyle(b)}">${escapeHtml(BRANDS[b].name)}</div>`;}
/* an offer. Members' offers carry a gold "Members only" label; to anyone not signed in (and on the kiosk) they are a
   locked teaser, and on the phone a tap opens the sign-in. */
function offerCardHTML(o){const B=BRANDS[o.b],lock=offerLocked(o),app=VIEW==='app';
  return `<button class="ocard${o.members?' mem':''}${lock?' locked':''}" ${lock&&app?'data-act="signin"':`data-b="${o.b}"`}><div class="oimg${PHOTOS[o.b]?' ph ph-'+o.b:''}" style="${PHOTOS[o.b]?'':coverStyle(o.b)}">${logoOf(o.b)?`<span class="thumb-logo">${logoImg(o.b)}</span>`:PHOTOS[o.b]?'':`<em>${escapeHtml(B.name)}</em>`}${lock?`<span class="olock">${IC.lock}</span>`:''}</div>
  <div class="otxt"><small>${o.members?`<span class="memtag">${IC.star}${T('Members only')}</span>`:escapeHtml(tc(o.kicker)||T('Offer'))} · ${escapeHtml(B.name)}</small><b>${escapeHtml(tc(o.title))}</b><span>${lock?T(app?'Sign in to use this offer':'Sign in on the Wayezy app to use it'):escapeHtml(tc(o.detail)||'')+(o.until?' · '+T('until {date}',{date:shortDate(o.until)}):'')}</span></div></button>`;}
function featuredHTML(){const list=brandKeys().filter(b=>PHOTOS[b]).sort((a,b)=>(liveOffers(b).length-liveOffers(a).length)||BRANDS[a].name.localeCompare(BRANDS[b].name)).slice(0,10);
  return `<div class="sec-title"><h3>${T('Featured stores')}</h3></div><div class="hscroll feat-row" data-carousel="feat" data-auto="1">${list.map(b=>`<button class="fcard ph ph-${b}" data-b="${b}"><span class="fcat">${escapeHtml(catName(BRANDS[b].cat))} · ${floorsOfBrand(b).map(flShort).join(', ')}</span><b>${escapeHtml(BRANDS[b].name)}</b>${liveOffers(b).length?`<em>${escapeHtml(offerTitle(liveOffers(b)[0]))}</em>`:''}</button>`).join('')}</div>`;}
function greetHTML(){const h=new Date().getHours();const g=T(h<12?'Good morning':h<17?'Good afternoon':'Good evening');
  const nowait=dineList().filter(b=>{const w=waitView(b);return w&&w.cls==='ok';}).length;const offers=allOffers().length;
  const mem=typeof Member!=='undefined'&&Member.on,join=typeof Member!=='undefined'&&Member.can&&!mem;
  return `<div class="greet${mem?' mem':''}"><div><small>${g}${mem&&firstName()?', '+escapeHtml(firstName()):''}</small><b>${T(mem?'Good to see you at {venue}':'Welcome to {venue}',{venue:venueName()})}</b><span>${mallHours()?T('Open today {hours}',{hours:escapeHtml(mallHours())})+' · ':''}${nowait?T(nowait>1?'{n} restaurants with no wait':'{n} restaurant with no wait',{n:nowait}):''}${offers?(nowait?' · ':'')+T(offers>1?'{n} offers live':'{n} offer live',{n:offers}):''}</span></div>
    ${mem?`<button class="greet-pts" data-act="account"><b>${(Member.me.points||0).toLocaleString(locale())}</b><span>${T('Points')}</span></button>`:join?`<button class="greet-join" data-act="signin">${T('Join')}</button>`:''}</div>
    ${mem&&Member.me.car?`<button class="greet-car" data-act="findcar"><i>${IC.car}</i><span><small>${T('Your car')}</small><b>${escapeHtml(Member.me.car.level)} · ${escapeHtml(Member.me.car.spot)}</b></span><em>${T('Find my car')}${IC.chev}</em></button>`:''}
    <div class="quick${mem?' five':''}">${[['wc','wc','Toilets'],['lift','lift','Lifts'],['exit','exit','Exit'],...(mem?[['car','car','My car']]:[]),['help','phone','Help']].map(([a,i,t])=>`<button data-act="${a}"><i>${IC[i]}</i><span>${T(t)}</span></button>`).join('')}</div>`;}
function favRowHTML(){if(typeof Member==='undefined'||!Member.on)return '';const favs=(Member.me.favs||[]).filter(isBrand);if(!favs.length)return '';
  return `<div class="sec-title"><h3>${T('Your stores')}</h3><button data-act="account">${T('See all')}</button></div><div class="hscroll favrow">${favs.slice(0,10).map(b=>`<button class="favchip" data-b="${b}">${thumbHTML(b)}<span>${escapeHtml(BRANDS[b].name)}</span></button>`).join('')}</div>`;}
/* ---------------- store card ---------------- */
function mallHours(){return (INFO.settings.mall||{}).hours||'';}
function storeEvents(b){const ev=eventsList().filter(e=>e.brand===b);return ev.map(e=>`<div class="offer">${IC.cal}<div class="t"><small>${T('Event')}</small><strong>${escapeHtml(tc(e.title))}</strong><span>${escapeHtml([e.date?shortDate(e.date):'',tc(e.time),tc(e.where)].filter(Boolean).join(' · '))}</span></div></div>`).join('');}
function storeExtras(b){const st=S(b),os=openState(b);let h='';
  if(os)h+=`<div class="hours">${IC.clock}<span>${os.text} · <span class="${os.isOpen?'open':'closed'}">${T(os.isOpen?'Open now':'Closed now')}</span></span></div>`;
  if(st.desc)h+=`<p class="desc">${escapeHtml(tc(st.desc))}</p>`;
  if(Array.isArray(st.menu)&&st.menu.length)h+=`<div class="desc"><b>${T('Menu highlights:')}</b> ${escapeHtml(st.menu.map(tc).join(' · '))}</div>`;
  if(st.phone)h+=`<div class="meta">${escapeHtml(st.phone)}</div>`;
  return h+storeEvents(b);}
/* "Take me here": time, distance, how you change floors, then (folded) every step */
function routeBlockHTML(r,dest,compact){if(!r)return noRouteHTML();const rs=routeStats(r);const via=r.legs.slice(1).map(l=>l.ride.conn.type);const n=stepsOf(r,dest).length;
  const rides=`${via.length>1?'Two':'One'} ${via.includes('lift')?(via.every(v=>v==='lift')?'lift ride':'lift or escalator ride'):'escalator ride'}${via.length>1?'s':''}`;
  return `<button class="getdir" data-act="walk">${IC.nav}<span>${T('Take me here')}</span><small>${T('{min} min · {m} m',rs)}</small></button>
  <div class="routemeta">${ORIGIN!=='kiosk'?`${T('From {name}',{name:escapeHtml(poiName(ORIGIN))})} · `:''}${T(via.length?rides:'Same floor, no stairs')}${state.stepFree?T(' · step-free'):''}
  <button class="linkbtn" data-act="stepfree" aria-pressed="${state.stepFree}">${T(state.stepFree?'Step-free on':'Need step-free?')}</button></div>
  ${compact?'':`<details class="stepsbox"><summary>${T('See all {n} steps',{n})}</summary>${stepsHTML(r,dest)}</details>`}`;}
/* what is on right now: wait time, today's specials, offers */
function liveHTML(b){const st=S(b),w=BRANDS[b].cat==='food'?waitView(b):null,wo=waitOf(b),offers=liveOffers(b);
  const sp=(Array.isArray(st.specials)?st.specials:[]).map(x=>String(x).trim()).filter(Boolean);
  if(!w&&!offers.length&&!sp.length)return '';
  return `<div class="live"><div class="live-h"><span class="dot"></span>${T('Live now')}</div>
    ${w?`<div class="wait ${w.cls}">${IC.clock}<div><b>${w.t}</b><span>${escapeHtml(w.sub)}${wo&&wo.updatedAt&&!wo.stale?' · '+T('updated {ago}',{ago:ago(wo.updatedAt)}):''}</span></div></div>`:''}
    ${sp.length?`<div class="specials"><b>${IC.star}${T("Today's specials")}</b><ul>${sp.slice(0,4).map(x=>`<li>${escapeHtml(tc(x))}</li>`).join('')}</ul></div>`:''}
    ${offers.map(o=>{const lock=offerLocked(o);return `<div class="offer${o.members?' mem':''}${lock?' locked':''}"${lock&&VIEW==='app'?' data-act="signin" role="button" tabindex="0"':''}>${lock?IC.lock:IC.tag}<div class="t"><small>${o.members?`<span class="memtag">${IC.star}${T('Members only')}</span>`:escapeHtml(tc(o.kicker)||T('Offer'))}</small><strong>${escapeHtml(tc(o.title))}</strong><span>${lock?T(VIEW==='app'?'Sign in to use this offer':'Sign in on the Wayezy app to use it'):escapeHtml(tc(o.detail)||'')+(o.until?' · '+T('until {date}',{date:shortDate(o.until)}):'')}</span></div></div>`;}).join('')}</div>`;}
function storeCardHTML(b,compact){
  const B=BRANDS[b],st=S(b),os=openState(b);const r=state.route;const tags=Array.isArray(st.tags)?st.tags:[];
  return `<div class="scard"><div class="top"><div class="cover${phClass(b)}" style="${coverStyle(b)}">${logoOf(b)?`<span class="cover-logo">${logoImg(b)}</span>`:''}<b>${escapeHtml(B.name)}</b></div>
  <div><h2>${escapeHtml(B.name)}</h2><div class="meta">${escapeHtml(catName(B.cat))}${tags.length?' · '+escapeHtml(tags.join(' · ')):''}<br><b>${unitText(b)}</b></div>
  ${os?`<div class="hours">${IC.clock}<span>${os.text}<br><span class="${os.isOpen?'open':'closed'}">${T(os.isOpen?'Open now':'Closed now')}</span></span></div>`:''}</div></div>
  ${liveHTML(b)}
  ${routeBlockHTML(r,B.name,compact)}
  ${VIEW==='kiosk'&&r?handoffHTML(b):''}
  ${st.desc?`<p class="desc">${escapeHtml(tc(st.desc))}</p>`:''}
  ${(Array.isArray(st.menu)&&st.menu.length)?`<div class="desc"><b>${T('Menu highlights:')}</b> ${escapeHtml(st.menu.map(tc).join(' · '))}</div>`:''}
  ${st.phone?`<div class="meta" style="margin-top:8px">${escapeHtml(st.phone)}</div>`:''}
  ${storeEvents(b)}
  <div class="linkrow"><button class="btn sm" data-act="reset">${T('Back')}</button>${r&&MAPR&&MAPR.kind==='3d'?`<button class="btn sm" data-act="stack">${T('See all floors')}</button>`:''}</div></div>`;}
/* ---------------- the kiosk's QR codes: carry on with the phone ----------------
   The link opens the phone app at this kiosk (?at, ?heading), in the kiosk's language, with a store's route when one is
   chosen (?to). The public address is the mall's (Admin -> Settings -> App link); without one, the page's own. */
function phoneLink(b){const m=INFO.settings.mall||{};let u;
  try{u=new URL(/^https?:\/\/[^\s]+$/i.test(String(m.appUrl||'').trim())?String(m.appUrl).trim():location.origin+location.pathname);}catch(e){u=new URL(location.origin+location.pathname);}
  ['view','at','heading','to','lang'].forEach(k=>u.searchParams.delete(k));
  u.searchParams.set('view','app');u.searchParams.set('at',`${KIOSK.f},${KIOSK.x},${KIOSK.y}`);if(QS.get('heading'))u.searchParams.set('heading',QS.get('heading'));
  if(b&&isBrand(b))u.searchParams.set('to',b);if(LANG!=='en')u.searchParams.set('lang',LANG);return u.toString();}
function handoffHTML(b){let qr='';try{qr=qrSVG(phoneLink(b),{label:T(b?'QR code: this route on your phone':'QR code: the mall map on your phone')});}catch(e){return '';}
  return `<div class="handoff${b?'':' home'}"><div class="qrbox">${qr}</div><div><small>${T('The Wayezy app')}</small><b>${T(b?'Take this route on your phone':'The map on your phone')}</b>
    <span>${T(b?'Scan with your phone camera. The route opens in the app, starting from this kiosk.':'Scan to find your way anywhere in the mall, starting from this kiosk.')}</span></div></div>`;}
function miniCardHTML(){const t=state.toilet;const r=state.route;let title='',sub='';
  if(t.kind==='unit'){title=T('Unit {id}',{id:t.unit.id});sub=T('{floor}. No store is listed for this unit yet.',{floor:floorName(t.unit.f)});}
  else{title=T(t.title)||destName();const p=r?POIS[r.target]:null;sub=p?(tr(p.name||(p.conn&&p.conn.name)||'')+(p.f?', '+floorName(p.f):'')):'';
    if(t.kind==='car')sub=`${t.car.level} · ${t.car.spot}`+(p&&p.conn?' · '+T('via {lift}',{lift:tr(p.conn.name)}):'');}
  return `<div class="scard"><h2>${escapeHtml(title)}</h2><div class="meta">${escapeHtml(sub)}</div>
  ${t.kind!=='unit'?routeBlockHTML(r,destName()):''}
  ${t.kind==='wc'?`<div class="linkrow"><button class="btn sm" data-act="wcany" aria-pressed="${!t.g}">${T('Nearest')}</button><button class="btn sm" data-act="wcf" aria-pressed="${t.g==='f'}">${T("Women's")}</button><button class="btn sm" data-act="wcm" aria-pressed="${t.g==='m'}">${T("Men's")}</button></div>`:''}
  <div class="linkrow"><button class="btn sm" data-act="reset">${T('Back')}</button></div></div>`;}

/* keep the list where the visitor left it when live data refreshes the same screen */
const scrollMemo={};
function setPanel(el,key,html){const same=scrollMemo[el.id]&&scrollMemo[el.id].key===key;const top=same?el.scrollTop:0;el.innerHTML=html;wirePanel(el);if(same)el.scrollTop=top;scrollMemo[el.id]={key};}

/* ---------------- kiosk panel ---------------- */
function directoryHTML(){const list=brandKeys().sort((a,b)=>BRANDS[a].name.localeCompare(BRANDS[b].name));let h='',last='';
  list.forEach(b=>{const c=BRANDS[b].name[0].toUpperCase().replace(/[^A-Z]/,'#');if(c!==last){h+=`<div class="az-h">${c}</div>`;last=c;}h+=itemHTML(b);});
  return `<div class="sec-title"><h3>${T('All stores A–Z ({n})',{n:list.length})}</h3></div>`+h;}
function renderKiosk(){
  const el=document.getElementById('kBody');let h='';const q=(state.query||'').trim();
  const home=!state.brand&&!state.toilet&&!q&&!state.cat&&KTAB==='map';
  document.getElementById('kAd').hidden=!home||!ADP.list.length;
  if(state.brand)h=storeCardHTML(state.brand);
  else if(state.toilet)h=miniCardHTML();
  else if(q){const list=brandsList();const fac=searchFacility(q);
    if(fac)h+=`<div class="sec-title"><h3>${T('Services')}</h3></div>`+facilityHTML(fac);
    h+=`<div class="sec-title"><h3>${T('Results ({n})',{n:list.length})}</h3></div>`+(list.length?list.map(b=>itemHTML(b)).join(''):`<p class="empty">${T('Nothing matches “{q}”. Try a store name, or a word like <i>coffee</i>, <i>jewellery</i> or <i>salon</i>.',{q:escapeHtml(q)})}</p>`);}
  else if(state.cat){const list=state.cat==='dining'?dineList():brandsList();const gn=T(GROUPS[state.cat]?GROUPS[state.cat].name:'');
    h=`<div class="sec-title"><h3>${escapeHtml(state.cat==='dining'?T('{group} · live wait times',{group:gn}):gn)} (${list.length})</h3><button data-act="clearcat">${T('Show all')}</button></div>`+list.map(b=>itemHTML(b)).join('');}
  else if(KTAB==='directory')h=directoryHTML();
  else if(KTAB==='offers'){const o=allOffers();h=`<div class="sec-title"><h3>${T('Offers live now ({n})',{n:o.length})}</h3></div>`+(o.length?o.map(offerCardHTML).join(''):emptyHTML('offer',T('No offers are live right now.'),T('Stores add their offers here as they go live.')))+liveAds().map(promoHTML).join('');}
  else if(KTAB==='events')h=`<div class="sec-title"><h3>${T('Events at {venue}',{venue:venueName()})}</h3></div>`+eventsHTML();
  else if(KTAB==='services')h=`<div class="sec-title"><h3>${T('Services')}</h3></div>`+servicesHTML();
  else{
    h+=liveAds().map(promoHTML).join('');
    h+=handoffHTML();
    h+=`<div class="sec-title"><h3>${T('Dine at {venue}',{venue:venueName()})}</h3><button data-act="alldining">${T('View all')}</button></div>`+dineList(4).map(b=>itemHTML(b)).join('');
    const off=allOffers();if(off.length)h+=`<div class="sec-title"><h3>${T('Offers today')}</h3><button data-act="alloffers">${T('View all')}</button></div>`+off.slice(0,3).map(offerCardHTML).join('');
    h+=`<div class="sec-title"><h3>${T('Services')}</h3></div>`+servicesHTML();
  }
  setPanel(el,[state.brand,state.toilet&&state.toilet.kind,q,KTAB,state.cat,LANG].join('|'),h);
}
function facilityHTML(fac){const map={wc:['wc','wc','Nearest toilets'],lift:['lift','lift','Nearest lift'],exit:['exit','exit','Way out · main entrance']};const m=map[fac.kind];
  return `<div class="svc"><button data-act="${fac.kind==='wc'&&fac.g?'wc'+fac.g:m[0]}">${IC[m[1]]}${T(fac.kind==='wc'&&fac.g?(fac.g==='m'?"Men's toilets":"Women's toilets"):m[2])}</button></div>`;}
/* ---------------- mobile app ---------------- */
/* where the phone's route starts: the entrance, a kiosk (when opened from its QR code) or any store */
function originPickerHTML(){const opts=[['ent:main',T('Main entrance')]];if(QS.get('at'))opts.unshift(['kiosk',T('The kiosk I scanned')]);
  if(typeof LIVE!=='undefined'&&LIVE.ok&&POIS.me)opts.unshift(['me',T('My location')]);
  brandKeys().sort((a,b)=>BRANDS[a].name.localeCompare(BRANDS[b].name)).forEach(b=>{const u=unitsOfBrand(b)[0];if(u)opts.push(['u:'+u.key,BRANDS[b].name+' ('+flShort(u.f)+')']);});
  return `<label class="fromsel">${IC.pin}<span>${T('Starting from')}</span><select data-act="from" aria-label="${T('Starting from')}">${opts.map(([v,t])=>`<option value="${escapeHtml(v)}" ${v===ORIGIN?'selected':''}>${escapeHtml(t)}</option>`).join('')}</select></label>`;}
function renderApp(){
  const d=document.getElementById('pDest'),s=document.getElementById('pSteps'),l=document.getElementById('pList'),sc=document.getElementById('pScroll');
  const r=state.route;const key=[state.brand,state.toilet&&state.toilet.kind,state.query,PTAB,state.cat,LANG].join('|');const top=scrollMemo.pScroll&&scrollMemo.pScroll.key===key?sc.scrollTop:null;
  if(state.brand||state.toilet){
    const name=state.brand?BRANDS[state.brand].name:(T(state.toilet.title)||destName());const rs=r?routeStats(r):null;
    const car=state.toilet&&state.toilet.kind==='car'?state.toilet.car:null,tp=r&&POIS[r.target];
    const sub=state.brand?`${escapeHtml(catName(BRANDS[state.brand].cat))}<br>${escapeHtml(floorText(state.brand))}`:car?`${escapeHtml(car.level)} · ${escapeHtml(car.spot)}${tp&&tp.conn?'<br>'+escapeHtml(T('via {lift}',{lift:tr(tp.conn.name)})):''}`:'';
    const w=null;
    const tu=state.targetUnit;const nSteps=r?stepsOf(r,name).length:0;
    d.innerHTML=`<div class="p-card"><div class="p-dest">${state.brand?thumbHTML(state.brand):car?`<div class="thumb carthumb">${IC.car}</div>`:`<div class="thumb" style="background:#1E2551">${escapeHtml(name)}</div>`}
      <div><small>${T('Your destination')}</small><h2>${escapeHtml(name)}</h2><div class="meta" style="font-size:12.5px">${sub}${w?`<br><b style="color:var(--warn)">${w.t}</b> ${escapeHtml(w.sub)}`:''}</div></div>
      <div class="p-dest-btns">${state.brand&&Member.can?`<button class="heart" data-act="fav" aria-pressed="${Member.isFav(state.brand)}" aria-label="${T(Member.isFav(state.brand)?'Remove from your stores':'Save to your stores')}">${IC.heart}</button>`:''}<button class="x" data-act="reset">${T('Change')}</button></div></div>
      ${originPickerHTML()}
      ${rs?`<div class="p-route"><span style="font-size:15px;font-weight:600;color:var(--gold)">${T('Your route')}</span><b>${T('{min} min · {m} m',rs)}</b></div>
      <div class="prog"><span class="bar" style="width:${guide?50:12}%"></span><div class="done"><i></i><b>${T('Start')}</b>${escapeHtml(poiName(ORIGIN)||floorName(originPoint().f))}</div><div class="${guide?'now':''}"><i></i><b>${T('Follow route')}</b>${T('{n} steps',{n:nSteps})}</div><div><i></i><b>${T(r.legs.length>1?'Change floor':'Straight on')}</b>${r.legs.length>1?flShort(r.legs[r.legs.length-1].f):T('{m} m',{m:rs.m})}</div><div><i></i><b>${T('Arrive')}</b>${tu?T('Unit {id}',{id:escapeHtml(tu.id)}):flShort(r.legs[r.legs.length-1].f)}</div></div>`:noRouteHTML()}
      ${rs?`<button class="getdir" data-act="walk">${IC.nav}<span>${T('Take me here')}</span><small>${T('{min} min · {m} m',rs)}</small></button>`:''}
      ${state.brand?liveHTML(state.brand)+storeExtras(state.brand):''}</div>`;
    s.innerHTML=r?`<div class="p-card p-steps"><h4>${T('Step-by-step directions')}</h4>${stepsHTML(r,name)}</div>`:'';
  }else{d.innerHTML='';s.innerHTML='';}
  let h='';const q=(state.query||'').trim();
  if(q){const list=brandsList();const fac=searchFacility(q);h=(fac?`<div class="sec-title"><h3>${T('Services')}</h3></div>`+facilityHTML(fac):'')+`<div class="sec-title"><h3>${T('Results ({n})',{n:list.length})}</h3></div>`+(list.length?list.map(b=>itemHTML(b)).join(''):`<p class="empty">${T('Nothing matches “{q}”.',{q:escapeHtml(q)})}</p>`);}
  else if(state.brand||state.toilet)h='';
  else if(PTAB==='offers'){const all=allOffers(),mo=all.filter(o=>o.members),o=(OFFTAB==='members'?mo:all).slice().sort((a,b)=>(b.members?1:0)-(a.members?1:0));
    h=`<div class="p-page"><h2>${T('Offers')}</h2><p>${T(all.length===1?'{n} offer live across the mall today':'{n} offers live across the mall today',{n:all.length})}</p></div>
      <div class="seg wide" role="group"><button data-off="all" aria-pressed="${OFFTAB==='all'}">${T('All offers')} · ${all.length}</button><button data-off="members" aria-pressed="${OFFTAB==='members'}">${IC.star}${T('For members')} · ${mo.length}</button></div>`
      +(o.length?o.map(offerCardHTML).join(''):emptyHTML('offer',T(OFFTAB==='members'?'No members-only offers right now. New ones appear here first.':'No offers are live right now.'),OFFTAB==='members'?'':T('Stores add their offers here as they go live.')))+liveAds().map(promoHTML).join('');}
  else if(PTAB==='events'){const n=eventsList().length;h=`<div class="p-page"><h2>${T('Events')}</h2><p>${T('What is on at {venue}',{venue:venueName()})}</p></div>`+eventsHTML();}
  else if(PTAB==='me')h=accountHTML();
  else if(state.cat==='dining')h=`<div class="sec-title"><h3>${T('Dining · live wait times')}</h3></div>`+dineList().map(b=>itemHTML(b)).join('');
  else if(state.cat){const list=brandsList();h=`<div class="sec-title"><h3>${escapeHtml(T(GROUPS[state.cat].name))}</h3></div>`+list.map(b=>itemHTML(b)).join('');}
  else if(!state.brand&&!state.toilet){const off=allOffers().sort((a,b)=>(b.members?1:0)-(a.members?1:0));h=favRowHTML()+featuredHTML()+liveAds().map(promoHTML).join('')+(off.length?`<div class="sec-title"><h3>${T('Offers for you')}</h3><button data-act="alloffers">${T('See all')}</button></div><div class="hscroll" data-carousel="offers">${off.slice(0,6).map(offerCardHTML).join('')}</div>`:'')+`<div class="sec-title"><h3>${T('Nearby dining')}</h3><button data-act="alldining">${T('See all')}</button></div>`+dineList(4).map(b=>itemHTML(b)).join('');}
  l.innerHTML=h;[d,s,l].forEach(wirePanel);initCarousels(l);
  l.querySelectorAll('[data-off]').forEach(b=>b.onclick=()=>{OFFTAB=b.dataset.off;renderPanels();});
  l.querySelectorAll('[data-setlang]').forEach(b=>b.onclick=()=>{setLang(b.dataset.setlang,true);});
  const home=!state.brand&&!state.toilet&&!q&&PTAB==='home'&&!state.cat;const pg=document.getElementById('pGreet');pg.innerHTML=home?greetHTML():'';wirePanel(pg);document.getElementById('pMapTitle').hidden=!home;document.getElementById('pMapBox').hidden=!home&&!state.brand&&!state.toilet&&PTAB!=='map';
  document.getElementById('pFloorSel').innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /> <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /> <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>'+'<span class="pfl">'+floorName(cur)+'</span>';document.getElementById('pBackTxt').textContent=state.brand?BRANDS[state.brand].name:(state.toilet?destName():T('Map'));
  const af=document.getElementById('appFeat');if(af.dataset.lang!==LANG){af.dataset.lang=LANG;af.innerHTML=[['pin','FIND','STORES & DINING','Real-time guidance'],['clock','LIVE','WAIT TIMES','Updated by each restaurant'],['offer','OFFERS','AS THEY GO LIVE','Straight from the stores']].map(x=>`<div class="feat"><i>${IC[x[0]]}</i><div><b>${T(x[1])}<br>${T(x[2])}</b><span>${T(x[3])}</span></div></div>`).join('');}
  if(top!==null)sc.scrollTop=top;scrollMemo.pScroll={key};
}
/* ---------------- carousels: featured stores slide by themselves; swipe, or drag with a mouse, to move them ----------------
   The position is kept across re-renders (live data refreshes the list). Touching a carousel pauses it for a few
   seconds; a drag never counts as a tap on a card. */
const CAROUSEL={};                                        // key -> {i, holdUntil}
function initCarousels(root){root.querySelectorAll('[data-carousel]').forEach(el=>{
  const key=el.dataset.carousel,st=CAROUSEL[key]||(CAROUSEL[key]={i:0,holdUntil:0});const cards=[...el.children];
  if(cards.length<2)return;
  const hold=()=>{st.holdUntil=Date.now()+6000;};
  const pos=k=>cards[k].offsetLeft-cards[0].offsetLeft;
  const nearest=()=>{let k=0,bd=Infinity;cards.forEach((c,j)=>{const d=Math.abs(pos(j)-el.scrollLeft);if(d<bd){bd=d;k=j;}});return k;};
  const dotsEl=document.createElement('div');dotsEl.className='cdots';dotsEl.setAttribute('role','tablist');
  dotsEl.innerHTML=cards.map((_,k)=>`<button role="tab" aria-label="${T('{k} of {n}',{k:k+1,n:cards.length})}"></button>`).join('');el.after(dotsEl);
  const dots=()=>dotsEl.querySelectorAll('button').forEach((d,k)=>d.setAttribute('aria-selected',k===st.i));
  const go=(k,smooth)=>{st.i=(k+cards.length)%cards.length;el.scrollTo({left:pos(st.i),behavior:smooth&&!reduce?'smooth':'auto'});dots();};
  el._next=()=>go(st.i+1>=cards.length||pos(st.i)>=el.scrollWidth-el.clientWidth-2?0:st.i+1,true);   // at the end: back to the first
  dotsEl.querySelectorAll('button').forEach((d,k)=>d.onclick=e=>{e.stopPropagation();hold();go(k,true);});
  requestAnimationFrame(()=>go(Math.min(st.i,cards.length-1),false));
  let sT=null;el.addEventListener('scroll',()=>{clearTimeout(sT);sT=setTimeout(()=>{st.i=nearest();dots();},90);},{passive:true});
  el.addEventListener('touchstart',hold,{passive:true});el.addEventListener('wheel',hold,{passive:true});
  st.hover=false;el.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')st.hover=true;});el.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')st.hover=false;});   // a mouse resting on it pauses it (a finger's tap must not)
  let drag=null;                                           // mouse and pen: drag to slide (touch scrolls natively)
  el.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'||e.button!==0)return;hold();drag={x:e.clientX,left:el.scrollLeft,moved:false,id:e.pointerId};});
  el.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;
    if(!drag.moved&&Math.abs(dx)>5){drag.moved=true;el.classList.add('dragging');try{el.setPointerCapture(drag.id);}catch(_){}}
    if(drag.moved){el.scrollLeft=drag.left-dx;e.preventDefault();}});
  const end=()=>{if(!drag)return;const moved=drag.moved;drag=null;el.classList.remove('dragging');
    if(moved){hold();go(nearest(),true);el.dataset.dragged='1';setTimeout(()=>{delete el.dataset.dragged;},0);}};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('click',e=>{if(el.dataset.dragged){e.stopPropagation();e.preventDefault();}},true);   // the drag was not a tap
});}
setInterval(()=>{if(reduce)return;document.querySelectorAll('[data-carousel][data-auto="1"]').forEach(el=>{const st=CAROUSEL[el.dataset.carousel];
  if(el._next&&st&&el.offsetParent&&Date.now()>st.holdUntil&&!st.hover)el._next();});},3800);
function wirePanel(el){
  el.querySelectorAll('[data-b]').forEach(b=>{if(!isBrand(b.dataset.b))return;const go=()=>{poke();state.query='';qEl.value='';pqEl.value='';closeKbd();if(VIEW==='app'&&PTAB!=='home'&&PTAB!=='map'){PTAB='home';renderQuick();}selectBrand(b.dataset.b);if(VIEW==='app')document.getElementById('pScroll').scrollTop=0;};
    b.onclick=go;if(b.tagName!=='BUTTON')b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}};});
  el.querySelectorAll('[data-act]').forEach(b=>{const a=b.dataset.act;
    if(a==='from'){b.onchange=()=>{poke();APP_ORIGIN=b.value;if(typeof LIVE!=='undefined')LIVE.manual=b.value!=='me';setOrigin(APP_ORIGIN);reroute();};return;}
    const act=()=>{poke();
    if(a==='wc'||a==='wcany')nearestToilet(null);else if(a==='wcf')nearestToilet('f');else if(a==='wcm')nearestToilet('m');else if(a==='lift')nearestLift();else if(a==='exit')goEntrance();
    else if(a==='stepfree'){state.stepFree=!state.stepFree;toast(T(state.stepFree?'Step-free routes on: lifts only, no escalators':'Step-free routes off'));if(state.route||state.noRoute)reroute();else renderPanels();Member.prefs();}
    else if(a==='signin')signInSheet();else if(a==='signout')Member.signOut();else if(a==='editname')signInSheet('__name');else if(a==='account')goAccount();
    else if(a==='fav'){if(state.brand)Member.toggleFav(state.brand);}
    else if(a==='car'){if(Member.on&&Member.me.car)findMyCar();else parkSheet();}else if(a==='findcar')findMyCar();else if(a==='park')parkSheet();
    else if(a==='clearcar'){Member.save({car:null});toast(T('Parking spot cleared'));}
    else if(a==='showcard')showCardSheet();else if(a==='favs'){const f=document.getElementById('mFavs');if(f)f.scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'});}
    else if(a==='voice'){Voice.init('app');Voice.set(!Voice.on,'app');renderPanels();}
    else if(a==='help')showHelp();else if(a==='lang')setLang(LANG==='hi'?'en':'hi',true);else if(a==='mode'){MODE=MODE==='day'?'evening':'day';applyMode();renderPanels();}
    else if(a==='walk')takeMeHere();else if(a==='reset')resetAll();else if(a==='stack')MAPR&&MAPR.toggleStack();
    else if(a==='clearcat'){state.cat=null;applyHighlights();renderQuick();renderPanels();}
    else if(a==='alloffers'){if(VIEW==='app'){PTAB='offers';renderQuick();renderPanels();document.getElementById('pScroll').scrollTop=0;}else setKTab('offers');}
    else if(a==='alldining'){if(VIEW==='app')PTAB='home';else KTAB='map';setGroup('dining',true);}};
    b.onclick=act;if(b.tagName!=='BUTTON')b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act();}};});
  el.querySelectorAll('button[data-floor]').forEach(b=>b.onclick=()=>{poke();setFloor(b.dataset.floor,true);});
}
function renderPanels(){try{renderKiosk();renderApp();}catch(e){reportError(e,'panel');}}
function renderDir(){renderPanels();}
function renderCard(){renderPanels();}
function modal(html,onClose){const m=document.createElement('div');m.className='modal';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.innerHTML=`<div>${html}</div>`;
  const close=()=>{m.remove();onClose&&onClose();};m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-close]'))close();});document.body.appendChild(m);
  const f=m.querySelector('button');if(f)f.focus();return m;}
function showHelp(){const n=(INFO.settings.mall||{}).helpDesk;
  modal(`<h3>${T('How can we help?')}</h3><p class="note">${n?T('Call the concierge desk on {n}',{n:`<b style="font-size:20px;color:var(--ink)">${escapeHtml(n)}</b>`}):T('Please visit the concierge desk, or ask any member of the mall team.')}</p><div class="linkrow"><button class="btn green" data-close style="margin-left:auto">${T('Close')}</button></div>`);}

/* ---------------- search, keyboard, clock ---------------- */
const qEl=document.getElementById('q');const pqEl=document.getElementById('pq');
let queryT=null;
function onQuery(v){state.query=v;if(v&&(state.brand||state.toilet)){clearSelection();applyHighlights();}
  clearTimeout(queryT);queryT=setTimeout(renderPanels,v.length>1?90:0);}                 // debounced: typing stays smooth
function pickTop(){const list=brandsList();if(list.length){selectBrand(list[0]);state.query='';qEl.value='';pqEl.value='';closeKbd();}}
[qEl,pqEl].forEach(inp=>{inp.addEventListener('input',()=>onQuery(inp.value));
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pickTop();}else if(e.key==='Escape'){inp.value='';onQuery('');}});});
const kbd=document.getElementById('kbd');const coarse=matchMedia('(pointer: coarse)').matches;if(coarse)qEl.setAttribute('inputmode','none');
(function(){['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'].forEach((r,i)=>{const d=document.createElement('div');d.className='r';[...r].forEach(ch=>{const b=document.createElement('button');b.textContent=ch;b.onclick=()=>typeKey(ch.toLowerCase());d.appendChild(b);});
  if(i===2){const bs=document.createElement('button');bs.className='w';bs.dataset.i18n='Delete';bs.textContent=T('Delete');bs.onclick=()=>typeKey('\b');d.appendChild(bs);}kbd.appendChild(d);});
  const d=document.createElement('div');d.className='r';const sp=document.createElement('button');sp.className='w';sp.style.flex='5';sp.dataset.i18n='Space';sp.textContent=T('Space');sp.onclick=()=>typeKey(' ');
  const dn=document.createElement('button');dn.className='w go';dn.dataset.i18n='Done';dn.textContent=T('Done');dn.onclick=closeKbd;d.append(sp,dn);kbd.appendChild(d);})();
function typeKey(k){poke();qEl.value=k==='\b'?qEl.value.slice(0,-1):qEl.value+k;onQuery(qEl.value);}
function closeKbd(){kbd.classList.remove('open');qEl.blur();}
qEl.addEventListener('focus',()=>{if(coarse)kbd.classList.add('open');});
function tick(){const d=new Date();const t=LANG==='hi'?clockText(d.getHours(),d.getMinutes(),true):d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}).toUpperCase();
  const ds=d.toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  document.getElementById('kTime').textContent=t;document.getElementById('kDate').textContent=ds;document.getElementById('pTime').textContent=t;document.getElementById('pDate').textContent=d.toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'short'});
  document.getElementById('pClock').textContent=d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
tick();setInterval(tick,15000);setInterval(()=>{if(VIEW!=='admin'&&!ATTRACT.on)renderPanels();},60000);   // wait times go stale by the minute

/* ---------------- idle: reset, then the attract loop (Blender film, blender/attract.py) ---------------- */
const idleSecs=()=>{const u=parseInt(QS.get('idle'),10);const s=(INFO.settings.mall||{}).idleSecs;return u>=15?u:(s>=15?s:15);};
const ATTRACT={el:document.getElementById('attract'),vid:document.getElementById('attractVid'),on:false,videoOk:QS.get('attract')!=='0'};
if(ATTRACT.vid){ATTRACT.vid.addEventListener('error',()=>{ATTRACT.videoOk=false;if(ATTRACT.on){ATTRACT.el.classList.remove('film');MAPR.pause(false);MAPR.setIdle(true);}},true);}   // missing or unplayable file
let idleT=null;
function poke(){if(ATTRACT.on)stopAttract();clearTimeout(idleT);if(VIEW!=='kiosk')return;idleT=setTimeout(goIdle,idleSecs()*1000);}
/* a route being walked on screen, or spoken, is not idle: check again a few seconds later */
function goIdle(){if(VIEW!=='kiosk')return;
  if(typeof RM!=='undefined'&&RM.on&&!RM.finished&&(guide&&!RM.userHold||Voice.busy)){clearTimeout(idleT);idleT=setTimeout(goIdle,5000);return;}
  KTAB='map';setOrigin('kiosk');resetAll();if(LANG!==KIOSK_LANG)setLang(KIOSK_LANG);if(QS.get('attract')!=='0')startAttract();}
/* the idle screen opens with the ads running now, full screen, then the film, then the ads again (adplayer.js) */
function startAttract(){if(!ATTRACT.el||ATTRACT.on)return;ATTRACT.on=true;ATTRACT.el.hidden=false;document.body.classList.add('attracting');markLangPick();
  if(typeof playIdleAds==='function'){MAPR&&MAPR.pause(true);playIdleAds(()=>{if(ATTRACT.on)startFilm();});}else startFilm();}
function startFilm(){const v=ATTRACT.vid;
  const idleMap=()=>{ATTRACT.el.classList.remove('film');if(MAPR){MAPR.pause(false);MAPR.setIdle(true);}};   // no film: the live map turns slowly instead
  if(!v||!ATTRACT.videoOk||v.error){idleMap();return;}
  const play=()=>{if(!ATTRACT.on)return;const p=v.play();
    if(p&&p.then)p.then(()=>{if(!ATTRACT.on){v.pause();return;}ATTRACT.el.classList.add('film');if(MAPR){MAPR.setIdle(false);MAPR.pause(true);}})
      .catch(err=>{console.warn('attract film:',err&&err.name);idleMap();});};
  try{v.currentTime=0;}catch(e){}
  if(v.readyState>=3)play();else{idleMap();v.addEventListener('canplay',play,{once:true});if(v.networkState===0||v.readyState===0)v.load();}
}
function stopAttract(){if(!ATTRACT.on)return;ATTRACT.on=false;ATTRACT.el.hidden=true;ATTRACT.el.classList.remove('film');document.body.classList.remove('attracting');
  try{ATTRACT.vid&&ATTRACT.vid.pause();}catch(e){}MAPR&&MAPR.pause(false);MAPR&&MAPR.setIdle(false);fitFloor(700);}
/* a touch anywhere starts; the language buttons on the idle screen also pick the language */
if(ATTRACT.el)ATTRACT.el.addEventListener('pointerdown',e=>{e.stopPropagation();const b=e.target.closest('[data-lang]');if(b)setLang(b.dataset.lang);poke();});
function markLangPick(){document.querySelectorAll('.lang-pick [data-lang]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lang===LANG));}
document.addEventListener('pointerdown',poke);document.addEventListener('keydown',poke);document.addEventListener('wheel',poke,{passive:true});
/* the kiosk: no long-press or right-click menu, no dragged images, no ctrl+wheel page zoom (styles.css "Kiosk touch") */
document.addEventListener('contextmenu',e=>{if(VIEW==='kiosk'&&!e.target.closest('input,textarea'))e.preventDefault();});
document.addEventListener('dragstart',e=>{if(VIEW==='kiosk')e.preventDefault();});
document.addEventListener('wheel',e=>{if(VIEW==='kiosk'&&e.ctrlKey)e.preventDefault();},{passive:false});
document.getElementById('kHelp').onclick=showHelp;

/* ---------------- view switching & map mounting ---------------- */
const mapwrap=document.getElementById('mapwrap');
function setMapFull(on){const box=document.getElementById('pMapBox');box.classList.toggle('full',!!on);if(on)box.closest('.screen').appendChild(box);else document.getElementById('pScroll').insertBefore(box,document.getElementById('pSteps'));}
document.getElementById('pBack').onclick=()=>{if(typeof RM!=='undefined'&&RM.on){exitRouteMode(false);return;}PTAB='home';setMapFull(false);renderQuick();renderPanels();};
document.getElementById('pExpand').onclick=()=>{const full=!document.getElementById('pMapBox').classList.contains('full');PTAB=full?'route':'home';setMapFull(full);renderQuick();};
/* the one map moves between the kiosk and the phone; in the admin hub it waits, hidden, in the kiosk slot */
function mountMap(){if(VIEW==='app')document.getElementById('pMapBox').appendChild(mapwrap);else document.getElementById('kMapSlot').prepend(mapwrap);}
let adminPrevLang=null;
function setView(v){const prev=VIEW;VIEW=v;document.body.classList.remove('view-kiosk','view-app','view-admin');document.body.classList.add('view-'+v);
  document.querySelectorAll('#viewswitch button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));
  if(v==='admin'&&LANG!=='en'){adminPrevLang=LANG;setLang('en');}else if(v!=='admin'&&adminPrevLang){const l=adminPrevLang;adminPrevLang=null;setLang(l);}   // the admin hub is in English for now
  stopAttract();
  mountMap();
  if(v!=='admin'){const o=v==='app'?APP_ORIGIN:'kiosk';if(o!==ORIGIN){setOrigin(o);if(state.route||state.noRoute)reroute();}}
  if(v==='admin')renderAdmin();else{renderQuick();renderPanels();}
  if(prev!==v&&v!=='admin'&&!state.route)setTimeout(()=>fitFloor(0),60);
  poke();
  if(v==='app'&&prev!==v)keepLang();
  if(prev!==v&&typeof Intro!=='undefined'){if(v!=='admin')Intro.play(v);else if(!needsSignIn())Intro.play('admin');}}   // the intro, the first time a view opens   // from the kiosk to the phone: the language chosen there carries over
document.querySelectorAll('#viewswitch button').forEach(b=>b.onclick=()=>setView(b.dataset.v));

/* ---------------- language: English / हिन्दी ----------------
   Kiosk: the idle screen offers both (a touch on either starts in it), the bottom bar switches, and every new
   visitor starts in the kiosk's language again. Phone: never asks; the pill in its header switches, and the choice
   (or the language carried over from the kiosk) is remembered. */
function langBtns(){const other=LANG==='hi'?'en':'hi';[['kLang',1],['pLang',0]].forEach(([id,long])=>{const b=document.getElementById(id);if(!b)return;
  b.lang=other;b.innerHTML=(long?IC.lang:'')+'<span>'+(other==='hi'?'हिन्दी':'English')+'</span>';});}
['kLang','pLang'].forEach(id=>{const b=document.getElementById(id);if(b)b.onclick=()=>{poke();setLang(LANG==='hi'?'en':'hi',true);};});
function onLang(){langBtns();walkBtn.textContent=T('Take me here');tick();markLangPick();
  if(typeof updateFloorUI==='function')updateFloorUI();if(typeof applyMode==='function')applyMode();
  MAPR&&MAPR.relabel&&MAPR.relabel();if(MAPR)MAPR.setOrigin();
  if(typeof Voice!=='undefined')Voice.lang(LANG);if(typeof RM!=='undefined'&&RM.on&&typeof relangRoute==='function')relangRoute();
  if(typeof renderPanelAd==='function'&&ADP.list[ADP.i])renderPanelAd(ADP.list[ADP.i]);if(typeof liveChip==='function')liveChip();
  if(VIEW!=='admin'){renderQuick();renderPanels();}
  if(typeof Member!=='undefined'&&Member.on&&(Member.me.prefs||{}).lang!==LANG)Member.prefs();}
function savedLang(){try{const l=localStorage.getItem('ireo.lang');return LANGS[l]?l:null;}catch(e){return null;}}
function keepLang(){try{localStorage.setItem('ireo.lang',LANG);}catch(e){}}
(function(){if(VIEW==='app'&&!QS.get('lang')&&savedLang())LANG=savedLang();
  document.documentElement.lang=LANG;document.body.classList.toggle('lang-hi',LANG==='hi');applyStaticText();langBtns();})();

