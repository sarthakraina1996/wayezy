/* ============================================================
   ADMIN HUB
   ============================================================ */
const PERMS=[['store.profile','Store profile, hours and contact'],['store.offers','Create and edit offers'],['store.ads','Make kiosk ads within the airtime the mall gives'],
  ['rest.wait','Update restaurant wait time'],['rest.menu','Edit menu highlights'],['mall.approve','Approve offers and promotions'],['mall.events','Manage events'],
  ['mall.stores','Edit every store and add new ones'],['mall.ads','Kiosk ad airtime, kiosks and ad allowances'],['mall.users','Manage users and permissions'],['mall.settings','Kiosk and mall settings']];
const DEFAULT_ROLES={
  mall_admin:{name:'Mall admin',scoped:false,perms:PERMS.map(p=>p[0])},
  marketing:{name:'Marketing',scoped:false,perms:['store.offers','store.ads','mall.approve','mall.events','mall.stores','mall.ads']},
  store_mgr:{name:'Store manager',scoped:true,perms:['store.profile','store.offers','store.ads']},
  rest_mgr:{name:'Restaurant manager',scoped:true,perms:['store.profile','store.offers','store.ads','rest.wait','rest.menu']}};
const ROLES=()=>Object.keys(INFO.roles).length?INFO.roles:DEFAULT_ROLES;
const USERS=()=>Object.assign({owner:{name:'Mall admin (you)',role:'mall_admin'}},INFO.users);
let AUSER=(()=>{try{return localStorage.getItem('ireo.admin.user')||'owner';}catch(e){return 'owner';}})();
let ASEC='overview',AEDIT=null;
const me=()=>USERS()[AUSER]||USERS().owner;
function can(p,b){const u=me();if(u.role==='mall_admin')return p!=='rest.wait'||!b||!BRANDS[b]||BRANDS[b].cat==='food';   // the master admin can do everything
  const r=ROLES()[u.role];if(!r)return false;const has=x=>(r.perms||[]).includes(x);
  if(p.startsWith('mall.'))return has(p);
  if(has('mall.stores')&&(p!=='rest.wait'||BRANDS[b]&&BRANDS[b].cat==='food'))return true;
  if(!has(p))return false;if(r.scoped)return !!b&&u.store===b;return true;}
function inScope(b){const u=me(),r=ROLES()[u.role]||{};return !r.scoped||u.store===b;}
const SAVED_MSG={live:'Saved — now live on every kiosk and phone',offline:'Saved',device:'Saved on this device — kiosk and app tabs in this browser update straight away',screen:'Saved on this screen only — this browser blocks storage'};
/* optimistic: the screen updates at once; if the database refuses, the previous value comes back */
/* the server refused the admin password (changed, or signed out elsewhere): back to the sign-in screen */
function authLost(e){if(!(e&&e.code==='auth'))return false;DB.logout&&DB.logout();toast('Please sign in to the admin hub again.',5000);if(VIEW==='admin')renderAdmin();return true;}
async function saveDoc(col,id,data,quiet){const prev=INFO[col][id];INFO[col][id]=data;onInfo();if(!DBOK){if(!quiet)toast('Not connected yet — try again in a moment');return false;}
  try{await DB.doc(col+'/'+id).set(data);if(!quiet)toast(SAVED_MSG[dbLabel()]||SAVED_MSG.live);return true;}
  catch(e){if(prev===undefined)delete INFO[col][id];else INFO[col][id]=prev;onInfo();if(!authLost(e)){toast('Could not save ('+(e&&(e.code||e.message)||'error')+'). Nothing was changed.',5000);reportError(e,'save '+col);}return false;}}
async function delDoc(col,id,quiet){const prev=INFO[col][id];delete INFO[col][id];onInfo();if(!DBOK)return false;
  try{await DB.doc(col+'/'+id).delete();if(!quiet)toast('Deleted');return true;}
  catch(e){if(prev!==undefined)INFO[col][id]=prev;onInfo();if(!authLost(e)){toast('Could not delete ('+(e&&(e.code||e.message)||'error')+')',5000);reportError(e,'delete '+col);}return false;}}
/* served by node server.js: the admin hub needs the admin password (kiosks and phones do not) */
const needsSignIn=()=>DBKIND==='server'&&DB&&DB.auth&&!DB.signedIn();
function renderSignIn(el){
  el.innerHTML=`<div class="a-login"><form class="panel" id="aLogin"><img src="${LOGO_G}" alt="Wayezy"><h2>Admin hub</h2>
    <p class="note">Enter the admin password to manage stores, offers, wait times, events, kiosks and ads.</p>
    <label class="fld">Password<input id="aPw" type="password" autocomplete="current-password" required></label>
    <button class="btn gold" type="submit">Sign in</button><p class="note" id="aLoginMsg" role="status" aria-live="polite"></p>
    <div class="a-hint" id="aHint" hidden></div></form></div>`;
  const f=el.querySelector('#aLogin'),msg=el.querySelector('#aLoginMsg');
  f.onsubmit=async e=>{e.preventDefault();msg.textContent='Checking…';const r=await DB.login(el.querySelector('#aPw').value);
    if(r.ok){Intro.play('admin',true);renderAdmin();Intro.then(()=>toast('Signed in'));}else{msg.textContent=r.error;el.querySelector('#aPw').select();}};
  // the password itself, under the form: the server only gives it to a page opened on this computer (server.js SHOW_HINT)
  fetch('api/admin/hint',{cache:'no-store'}).then(r=>r.json()).then(h=>{const box=el.querySelector('#aHint');if(!box||!h||!h.key)return;
    box.innerHTML=`<small>On this computer only</small><span>Password <code>${escapeHtml(h.key)}</code></span><button class="btn sm" type="button">Sign in with it</button>`;
    box.hidden=false;box.querySelector('button').onclick=()=>{el.querySelector('#aPw').value=h.key;f.requestSubmit();};}).catch(()=>{});
  setTimeout(()=>{const i=el.querySelector('#aPw');if(i)i.focus();},60);}
const saveStore=(b,patch)=>saveDoc('stores',b,Object.assign({},S(b),patch));
function pendingCount(){let n=0;Object.keys(INFO.stores).forEach(b=>(S(b).offers||[]).forEach(o=>{if(o.status==='pending')n++;}));Object.values(INFO.ads).forEach(a=>{if(a.status==='pending')n++;});return n;}
/* a store's own login (scoped role) sees the store portal; the mall team sees the whole hub */
const isPortal=()=>!!(ROLES()[me().role]||{}).scoped;
function adminNav(){const u=me();
  if(isPortal()){const b=u.store,food=b&&BRANDS[b]&&BRANDS[b].cat==='food';
    return [['overview','Dashboard','dash'],['stores','My store','store'],['myads','My kiosk ads','ads'],...(food&&can('rest.wait',b)?[['waits','Wait time','clock']]:[]),['offers','Offers','offer']];}
  return [['overview','Overview','dash'],['stores','Stores','store'],...(can('mall.ads')?[['ads','Ads & slots','ads'],['kiosks','Kiosks','kiosk']]:[]),['waits','Wait times','clock'],['offers','Offers & promotions','offer'],['events','Events','cal'],
    ...(can('mall.users')&&DBKIND==='server'?[['members','Members','user']]:[]),...(can('mall.users')?[['users','Users & permissions','users']]:[]),...(can('mall.settings')?[['settings','Settings','gear']]:[])];}
function adPendingCount(){return Object.values(INFO.adcreatives).filter(c=>c.status==='pending').length;}
function renderAdmin(){
  const el=document.getElementById('admin');if(needsSignIn()){if(!el.querySelector('#aLogin'))renderSignIn(el);return;}
  const u=me();const role=ROLES()[u.role]||{name:'—'};
  const nav=adminNav();if(!nav.some(n=>n[0]===ASEC))ASEC='overview';
  const pend=pendingCount(),adp=adPendingCount();
  el.innerHTML=`<aside class="a-side"><img src="${LOGO_G}" alt="Wayezy"><div class="sub">${isPortal()?'STORE PORTAL':'ADMIN HUB'}</div>
    ${nav.map(([k,t,i])=>`<button data-sec="${k}" aria-pressed="${ASEC===k}">${IC[i]}${t}${k==='offers'&&pend&&can('mall.approve')?`<span class="n">${pend}</span>`:''}${k==='ads'&&adp?`<span class="n">${adp}</span>`:''}</button>`).join('')}
    <div class="foot">${{live:'● Live — changes reach every kiosk and phone instantly',offline:'○ Reconnecting to the server…',device:'● Saved on this device — kiosk and app tabs in this browser stay in sync',screen:'○ This browser blocks storage — changes last until the page reloads'}[dbLabel()]||'○ Connecting…'}${DBKIND==='server'&&DB&&DB.auth?' <button class="linkbtn" id="aSignOut">Sign out</button>':''}</div></aside>
    <main class="a-main" id="aMain"><div class="a-top"><h1>${escapeHtml(nav.find(n=>n[0]===ASEC)[1])}</h1>
    <div class="a-user"><span class="chip">${escapeHtml(role.name)}${u.store&&BRANDS[u.store]?' · '+escapeHtml(BRANDS[u.store].name):''}</span><select id="aUserSel" aria-label="Signed in as">${Object.entries(USERS()).map(([id,x])=>`<option value="${id}" ${id===AUSER?'selected':''}>${escapeHtml(x.name)}</option>`).join('')}</select></div></div>
    <div id="aBody"></div></main>`;
  el.querySelectorAll('[data-sec]').forEach(b=>b.onclick=()=>{const was=ASEC;ASEC=b.dataset.sec;AEDIT=null;ADSTORE=null;ADDRAFT=null;renderAdmin();document.getElementById('aMain').scrollTop=0;if(was!==ASEC)swapIn(document.getElementById('aMain'));});
  const so=el.querySelector('#aSignOut');if(so)so.onclick=()=>{DB.logout();renderAdmin();};
  el.querySelector('#aUserSel').onchange=e=>{AUSER=e.target.value;try{localStorage.setItem('ireo.admin.user',AUSER);}catch(_){ }ASEC='overview';AEDIT=null;ADSTORE=null;ADDRAFT=null;renderAdmin();};
  const body=el.querySelector('#aBody');
  ({overview:aOverview,stores:aStores,ads:aAds,kiosks:aKiosks,myads:aMyAds,waits:aWaits,offers:aOffers,events:aEvents,members:aMembers,users:aUsers,settings:aSettings}[ASEC]||aOverview)(body);
}
function myBrands(){return Object.keys(BRANDS).filter(b=>floorsOfBrand(b).length&&inScope(b)).sort((a,b)=>BRANDS[a].name.localeCompare(BRANDS[b].name));}
function waitCell(b){const w=waitView(b,true);const wo=waitOf(b);if(!w)return '<span class="chip grey">Not set</span>';return `<span class="chip ${w.cls==='ok'?'ok':w.cls==='grey'?'grey':'warn'}">${w.t}</span> <small class="note">${wo&&wo.updatedAt?ago(wo.updatedAt):''}</small>`;}
function aOverview(el){
  if(isPortal())return aPortalHome(el);
  const brands=myBrands();const food=brands.filter(b=>BRANDS[b].cat==='food');const offers=brands.reduce((n,b)=>n+liveOffers(b).length,0);
  const fresh=food.filter(b=>{const w=waitOf(b);return w&&!w.stale;}).length;const dirs=brands.reduce((n,b)=>n+((INFO.stats[b]||{}).today&&(INFO.stats[b]||{}).day===todayISO()?(INFO.stats[b].today):0),0);
  const top=brands.map(b=>[b,(INFO.stats[b]||{}).directions||0]).filter(x=>x[1]).sort((a,b)=>b[1]-a[1]).slice(0,6);
  el.innerHTML=`${dbLabel()==='device'?'<div class="lockmsg">Running on this device: changes are saved in this browser and shared with kiosk and app tabs open here. Start the demo server (<code>node server.js</code>, see README) to reach every kiosk and phone.</div>':dbLabel()==='offline'?'<div class="lockmsg">The connection to the server dropped. It reconnects by itself; changes made now are not saved.</div>':dbLabel()==='screen'?'<div class="lockmsg">This browser blocks storage, so changes last until the page reloads.</div>':''}
  <div class="a-grid"><div class="kpi"><small>Stores you manage</small><b>${brands.length}</b></div><div class="kpi"><small>Live offers</small><b>${offers}</b></div>
  <div class="kpi"><small>Restaurants with a current wait time</small><b>${fresh}<span style="font-size:20px;color:var(--ink3)"> / ${food.length}</span></b></div><div class="kpi"><small>Directions requested today</small><b>${dirs}</b></div></div>
  <div class="two"><div class="panel"><h2>Wait times now<button class="btn sm sp" data-go="waits">Update</button></h2>${food.length?`<table><tr><th>Restaurant</th><th>Floor</th><th>Wait</th></tr>${food.map(b=>`<tr><td>${escapeHtml(BRANDS[b].name)}</td><td>${floorsOfBrand(b).map(f=>FL[f]).join(', ')}</td><td>${waitCell(b)}</td></tr>`).join('')}</table>`:'<p class="note">No restaurants in your scope.</p>'}</div>
  <div><div class="panel"><h2>Needs approval</h2>${approvalsHTML()}</div>${can('mall.ads')?adsOverviewHTML():''}<div class="panel"><h2>Most requested directions</h2>${top.length?`<table>${top.map(([b,n])=>`<tr><td>${escapeHtml(BRANDS[b].name)}</td><td style="text-align:right">${n}</td></tr>`).join('')}</table>`:'<p class="note">No direction requests recorded yet. Each time a visitor asks for directions on a kiosk or the app, it is counted here.</p>'}</div></div></div>`;
  el.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ASEC=b.dataset.go;renderAdmin();});wireApprovals(el);
}
function approvalsHTML(){if(!can('mall.approve'))return '<p class="note">Offers and promotions you submit appear on kiosks once the mall team approves them.</p>';
  const rows=[];Object.keys(INFO.stores).forEach(b=>(S(b).offers||[]).forEach(o=>{if(o.status==='pending')rows.push({kind:'offer',b,o});}));
  Object.entries(INFO.ads).forEach(([id,a])=>{if(a.status==='pending')rows.push({kind:'ad',id,a});});
  if(!rows.length)return '<p class="note">Nothing waiting for approval.</p>';
  return `<table>${rows.map(r=>r.kind==='offer'?`<tr><td><b>${escapeHtml(r.o.title)}</b><br><small class="note">Offer · ${escapeHtml(BRANDS[r.b]?BRANDS[r.b].name:r.b)}</small></td><td style="text-align:right;white-space:nowrap"><button class="btn sm green" data-ap="o|${r.b}|${r.o.id}|live">Approve</button> <button class="btn sm" data-ap="o|${r.b}|${r.o.id}|rejected">Reject</button></td></tr>`
    :`<tr><td><b>${escapeHtml(r.a.headline)}</b><br><small class="note">Kiosk promotion${r.a.brand&&BRANDS[r.a.brand]?' · '+escapeHtml(BRANDS[r.a.brand].name):''}</small></td><td style="text-align:right;white-space:nowrap"><button class="btn sm green" data-ap="a|${r.id}||live">Approve</button> <button class="btn sm" data-ap="a|${r.id}||rejected">Reject</button></td></tr>`).join('')}</table>`;}
function wireApprovals(el){el.querySelectorAll('[data-ap]').forEach(b=>b.onclick=()=>{const[k,x,y,st]=b.dataset.ap.split('|');
  if(k==='o'){const offers=(S(x).offers||[]).map(o=>o.id===y?Object.assign({},o,{status:st}):o);saveStore(x,{offers});}else{saveDoc('ads',x,Object.assign({},INFO.ads[x],{status:st}));}});}
function logoData(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const k=Math.min(1,600/img.width,300/img.height);
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*k));c.height=Math.max(1,Math.round(img.height*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  let d=c.toDataURL('image/png');if(d.length>230000)d=c.toDataURL('image/webp',0.9);if(d.length>230000)return rej(new Error('That logo is too large — try a smaller file'));res(d);};img.onerror=()=>rej(new Error('That file is not an image'));img.src=fr.result;};fr.readAsDataURL(file);});}
const nrm=x=>String(x).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');
async function importLogos(files){let ok=0;const miss=[];for(const f of files){const n=nrm(f.name.replace(/\.[a-z]+$/i,''));
  const b=Object.keys(BRANDS).find(k=>{const bn=nrm(BRANDS[k].name);return bn&&(n===bn||n.includes(bn)||(bn.includes(n)&&n.length>3));});
  if(!b){miss.push(f.name);continue;}try{const d=await logoData(f);await saveStore(b,{logo:d});ok++;}catch(e){miss.push(f.name);}}
  toast(`${ok} logo${ok===1?'':'s'} added${miss.length?' · not matched: '+miss.slice(0,4).join(', ')+(miss.length>4?'…':''):''}`);}
function aStores(el){
  if(AEDIT==='__new'&&can('mall.stores'))return aAddStore(el);
  if(isPortal()){const b=me().store;if(b&&BRANDS[b])return aStoreEdit(el,b);el.innerHTML='<div class="panel"><p class="note">Your account is not linked to a store yet. Ask the mall team.</p></div>';return;}
  if(AEDIT&&BRANDS[AEDIT]&&inScope(AEDIT))return aStoreEdit(el,AEDIT);
  const list=myBrands();
  el.innerHTML=`${can('mall.stores')?`<div class="panel"><h2>Store logos<label class="btn sm gold sp">Import logos<input type="file" id="aLogos" multiple accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label></h2><p class="note">Select many files at once. Name each file after its store (for example <b>good-earth.png</b>) and it is matched automatically. ${Object.keys(BRANDS).filter(b=>logoOf(b)).length} of ${Object.keys(BRANDS).length} stores have a logo.</p></div>`:''}<div class="panel"><h2>Stores<input id="aSq" class="sp search-in" placeholder="Search stores">${can('mall.stores')?`<button class="btn sm gold" id="aNewStore">${IC.plus}Add a store</button>`:''}</h2>
  <table><tr><th>Store</th><th>Category</th><th>Location</th><th>Live offers</th><th>Wait time</th><th></th></tr>
  ${list.map(b=>`<tr data-row="${escapeHtml(BRANDS[b].name.toLowerCase())}"><td><b>${escapeHtml(BRANDS[b].name)}</b>${BRANDS[b].custom?' <span class="chip">New</span>':''}${INFO.adrules[b]&&INFO.adrules[b].enabled!==false?' <span class="chip ok">Kiosk ads</span>':''}</td><td>${escapeHtml(CATS[BRANDS[b].cat].name)}</td><td>${floorsOfBrand(b).map(f=>FL[f]).join(', ')}</td><td>${liveOffers(b).length||'—'}</td><td>${BRANDS[b].cat==='food'?waitCell(b):'—'}</td><td style="text-align:right"><button class="btn sm" data-edit="${b}">Manage</button></td></tr>`).join('')}</table></div>`;
  el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{AEDIT=b.dataset.edit;renderAdmin();});
  const ns=el.querySelector('#aNewStore');if(ns)ns.onclick=()=>{AEDIT='__new';aAddStore.d=null;renderAdmin();};
  const al=el.querySelector('#aLogos');if(al)al.onchange=()=>importLogos([...al.files]);
  const sq=el.querySelector('#aSq');sq.oninput=()=>{const v=sq.value.toLowerCase();el.querySelectorAll('tr[data-row]').forEach(tr=>tr.hidden=!tr.dataset.row.includes(v));};
}
function aStoreEdit(el,b){
  const st=S(b),B=BRANDS[b],food=B.cat==='food';const cP=can('store.profile',b),cO=can('store.offers',b),cA=can('store.ads',b),cW=can('rest.wait',b)&&food,cM=can('rest.menu',b)&&food,appr=can('mall.approve');
  const h=st.hours||{};const stats=INFO.stats[b]||{};
  el.innerHTML=`${isPortal()?'':'<button class="btn sm" id="aBack">← All stores</button>'}
  <div class="two"><div>
   <div class="panel"><h2>${escapeHtml(B.name)} <span class="chip">${escapeHtml(CATS[B.cat].name)}</span><span class="note sp">${unitText(b)}</span>${B.custom&&can('mall.stores')?'<button class="btn sm" id="aRmStore">Remove store</button>':''}</h2>
    ${!cP?'<div class="lockmsg">Your role can view this profile but not change it.</div>':''}
    <label class="fld">About the store<textarea id="fDesc" ${cP?'':'disabled'}>${escapeHtml(st.desc||'')}</textarea></label>
    <div class="row2"><label class="fld">Opens<input id="fOpen" type="time" value="${escapeHtml(h.open||'')}" ${cP?'':'disabled'}></label><label class="fld">Closes<input id="fClose" type="time" value="${escapeHtml(h.close||'')}" ${cP?'':'disabled'}></label></div>
    <div class="row2"><label class="fld">Phone<input id="fPhone" value="${escapeHtml(st.phone||'')}" ${cP?'':'disabled'}></label><label class="fld">Tags (comma separated)<input id="fTags" value="${escapeHtml((st.tags||[]).join(', '))}" ${cP?'':'disabled'}></label></div>
    ${(cP?'<button class="btn gold" id="fSave">Save profile</button>':'')+`<div class="fld" style="margin-top:16px">Logo — shown on the building sign, store cards and the app<div style="display:flex;align-items:center;gap:12px;margin-top:4px">${safeImg(st.logo)?`<img src="${safeImg(st.logo)}" alt="" style="height:52px;max-width:200px;object-fit:contain;background:#fff;border-radius:10px;padding:6px 10px;box-shadow:0 0 0 1px var(--line)">`:'<span class="chip grey">No logo yet</span>'}${cP?`<label class="btn sm">Upload logo<input type="file" id="fLogo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>${st.logo?'<button class="btn sm" id="fLogoDel">Remove</button>':''}`:''}</div><span style="font-size:12px">Use a transparent PNG or SVG in dark colours; it sits on a light sign panel.</span></div>`}</div>
   <div class="panel"><h2>Offers</h2>
    ${(st.offers||[]).length?`<table><tr><th>Offer</th><th>Until</th><th>Status</th><th></th></tr>${st.offers.map(o=>`<tr><td><b>${escapeHtml(o.title)}</b><br><small class="note">${escapeHtml(o.detail||'')}</small></td><td>${escapeHtml(o.until||'—')}</td><td><span class="chip ${o.status==='live'?'ok':o.status==='pending'?'warn':'red'}">${o.status}</span>${o.members?' <span class="chip">members only</span>':''}${o.sample?' <span class="chip grey">sample</span>':''}</td><td style="text-align:right">${cO?`<button class="btn sm" data-del="${o.id}">Remove</button>`:''}</td></tr>`).join('')}</table>`:'<p class="note">No offers yet.</p>'}
    ${cO?`<div class="row2" style="margin-top:12px"><label class="fld">Headline<input id="oT" placeholder="e.g. Flat 30% off"></label><label class="fld">Label<input id="oK" placeholder="e.g. Season special"></label></div>
     <div class="row2"><label class="fld">Details<input id="oD" placeholder="e.g. On selected styles"></label><label class="fld">Ends on<input id="oU" type="date"></label></div>
     <label class="chk"><input type="checkbox" id="oM"> Members only <span class="note">— signed-in members of the app can use it; everyone else sees it locked, with an invitation to join</span></label>
     <button class="btn gold" id="oAdd">${appr?'Publish offer':'Submit for approval'}</button>`:''}</div>
  </div><div>
   ${food?`<div class="panel"><h2>Wait time</h2>${waitEditorHTML(b,cW)}</div>`:''}
   <div class="panel"><h2>Today's specials</h2><p class="note">Shown under “Live now” on the store card, on kiosks and in the app. One per line, up to four.</p><label class="fld"><textarea id="spT" rows="3" ${cP||cM?'':'disabled'} placeholder="${food?'e.g. Cold brew, made fresh this morning':'e.g. Extra 10% off on linen today'}">${escapeHtml((st.specials||[]).join('\n'))}</textarea></label>${cP||cM?`<div class="linkrow"><button class="btn gold" id="spSave">Save specials</button>${(st.specials||[]).length?'<button class="btn" id="spClear">Clear</button>':''}${st.specialsAt?`<span class="note">Updated ${ago(st.specialsAt)}</span>`:''}</div>`:''}</div>
   ${food?`<div class="panel"><h2>Menu highlights</h2><label class="fld">One dish per line<textarea id="mT" ${cM?'':'disabled'}>${escapeHtml((st.menu||[]).join('\n'))}</textarea></label>${cM?'<button class="btn gold" id="mSave">Save menu</button>':''}</div>`:''}
   <div class="panel"><h2>Kiosk ads</h2>${storeAdsSummaryHTML(b)}</div>
   <div class="panel"><h2>Performance</h2><p class="note">Directions requested: <b>${stats.directions||0}</b> in total, <b>${stats.day===todayISO()?stats.today||0:0}</b> today${stats.lastAt?' · last '+ago(stats.lastAt):''}.</p></div>
  </div></div>`;
  const bk=el.querySelector('#aBack');if(bk)bk.onclick=()=>{AEDIT=null;renderAdmin();};
  const $=id=>el.querySelector('#'+id);
  const rm=$('aRmStore');if(rm)rm.onclick=()=>confirmBox(`Remove ${B.name}?`,'It disappears from the map, search and the kiosks, and its unit shows as empty again.','Remove store',async()=>{await delDoc('stores',b,true);if(INFO.adrules[b])await delDoc('adrules',b,true);AEDIT=null;renderAdmin();toast('Store removed');});
  if(cP||cM){$('spSave').onclick=()=>{const sp=$('spT').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,4);saveStore(b,{specials:sp,specialsAt:new Date().toISOString(),specialsBy:me().name});};
    const sc=$('spClear');if(sc)sc.onclick=()=>saveStore(b,{specials:[],specialsAt:new Date().toISOString(),specialsBy:me().name});}
  el.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>{ASEC=x.dataset.go;if(x.dataset.store){ADSTORE=x.dataset.store;ADDRAFT=null;}renderAdmin();});
  if(cP){const fl=$('fLogo');if(fl)fl.onchange=async()=>{const f=fl.files[0];if(!f)return;try{const d=await logoData(f);saveStore(b,{logo:d});}catch(e){toast(e.message||'That image could not be used');}};const fd=$('fLogoDel');if(fd)fd.onclick=()=>saveStore(b,{logo:''});}
  if(cP)$('fSave').onclick=()=>saveStore(b,{desc:$('fDesc').value.trim(),hours:{open:$('fOpen').value,close:$('fClose').value},phone:$('fPhone').value.trim(),tags:$('fTags').value.split(',').map(s=>s.trim()).filter(Boolean)});
  if(cO){$('oAdd').onclick=()=>{const t=$('oT').value.trim();if(!t){toast('Add a headline first');return;}
      const o={id:'o'+Date.now(),title:t,kicker:$('oK').value.trim(),detail:$('oD').value.trim(),until:$('oU').value,status:appr?'live':'pending',by:me().name,at:new Date().toISOString()};if($('oM').checked)o.members=true;
      saveStore(b,{offers:(st.offers||[]).concat([o])});};
    el.querySelectorAll('[data-del]').forEach(x=>x.onclick=()=>saveStore(b,{offers:(st.offers||[]).filter(o=>o.id!==x.dataset.del)}));}
  if(cM)$('mSave').onclick=()=>saveStore(b,{menu:$('mT').value.split('\n').map(s=>s.trim()).filter(Boolean)});
  wireWait(el);
}
const WAITS=[['nowait','No wait',0],['5','5 min',5],['10','10 min',10],['15','15 min',15],['20','20 min',20],['30','30 min',30],['45','45+ min',45],['closed','Closed',null]];
function waitEditorHTML(b,editable){const w=waitOf(b);const curKey=!w?'':w.status==='closed'?'closed':!w.mins?'nowait':String(w.mins);
  return `<div class="now" style="font-size:24px;font-weight:700">${(waitView(b,true)||{t:'Not set'}).t}</div><div class="note">${w&&w.updatedAt?'Updated '+ago(w.updatedAt)+(w.by?' by '+escapeHtml(w.by):''):'Never updated'}${w&&w.stale&&w.updatedAt?' — kiosks now show “not updated”':''}</div>
  ${editable?`<div class="wbtns">${WAITS.map(([k,t])=>`<button data-wait="${b}|${k}" aria-pressed="${curKey===k}">${t}</button>`).join('')}</div>`:'<p class="note">Your role cannot update this wait time.</p>'}`;}
function wireWait(el){el.querySelectorAll('[data-wait]').forEach(x=>x.onclick=()=>{const[b,k]=x.dataset.wait.split('|');const def=WAITS.find(w=>w[0]===k);
  saveStore(b,{wait:{mins:def[2]||0,status:k==='closed'?'closed':'open',updatedAt:new Date().toISOString(),by:me().name}});});}
function aWaits(el){const food=myBrands().filter(b=>BRANDS[b].cat==='food'&&(can('rest.wait',b)||can('mall.stores')));
  el.innerHTML=`<p class="note">Tap the current wait. Kiosks and the app update straight away. A wait time older than ${Math.round(((INFO.settings.mall||{}).staleMins||120)/60)} hours shows as “not updated”, so visitors are never misled.</p>
  ${food.length?`<div class="waitgrid">${food.map(b=>`<div class="wcard"><h3>${escapeHtml(BRANDS[b].name)}</h3><small class="note">${floorText(b)}</small>${waitEditorHTML(b,can('rest.wait',b))}</div>`).join('')}</div>`:'<div class="panel"><p class="note">You do not manage any restaurants.</p></div>'}`;wireWait(el);}
function aOffers(el){
  const rows=[];myBrands().forEach(b=>(S(b).offers||[]).forEach(o=>rows.push({b,o})));
  const ads=Object.entries(INFO.ads).filter(([,a])=>!a.brand||inScope(a.brand));
  el.innerHTML=`<div class="panel"><h2>Waiting for approval</h2>${approvalsHTML()}</div>
  <div class="panel"><h2>All offers</h2>${rows.length?`<table><tr><th>Offer</th><th>Store</th><th>Until</th><th>Status</th></tr>${rows.map(({b,o})=>`<tr><td><b>${escapeHtml(o.title)}</b><br><small class="note">${escapeHtml(o.detail||'')}</small></td><td>${escapeHtml(BRANDS[b].name)}</td><td>${escapeHtml(o.until||'—')}</td><td><span class="chip ${o.status==='live'?'ok':o.status==='pending'?'warn':'red'}">${o.status}</span>${o.sample?' <span class="chip grey">sample</span>':''}</td></tr>`).join('')}</table>`:'<p class="note">No offers yet. Stores add them from Stores → Manage.</p>'}</div>
  <div class="panel"><h2>Kiosk promotions</h2>${ads.length?`<table><tr><th>Promotion</th><th>Store</th><th>Status</th><th></th></tr>${ads.map(([id,a])=>`<tr><td><b>${escapeHtml(a.headline)}</b><br><small class="note">${escapeHtml(a.sub||'')}</small></td><td>${a.brand&&BRANDS[a.brand]?escapeHtml(BRANDS[a.brand].name):'Mall'}</td><td><span class="chip ${a.status==='live'?'ok':a.status==='pending'?'warn':'red'}">${a.status}</span>${a.sample?' <span class="chip grey">sample</span>':''}</td><td style="text-align:right">${can('mall.approve')?`<button class="btn sm" data-adt="${id}">${a.active===false?'Show':'Hide'}</button> <button class="btn sm" data-add="${id}">Delete</button>`:''}</td></tr>`).join('')}</table>`:'<p class="note">No promotions yet.</p>'}
   ${can('mall.approve')?`<div class="row2" style="margin-top:12px"><label class="fld">Mall-wide promotion headline<input id="mpH" placeholder="e.g. Weekend live music"></label><label class="fld">Line underneath<input id="mpS"></label></div><button class="btn gold" id="mpAdd">Publish promotion</button>`:''}</div>`;
  wireApprovals(el);
  el.querySelectorAll('[data-adt]').forEach(b=>b.onclick=()=>{const a=INFO.ads[b.dataset.adt];saveDoc('ads',b.dataset.adt,Object.assign({},a,{active:a.active===false}));});
  el.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>delDoc('ads',b.dataset.add));
  const mp=el.querySelector('#mpAdd');if(mp)mp.onclick=()=>{const h=el.querySelector('#mpH').value.trim();if(!h){toast('Add a headline first');return;}saveDoc('ads','ad'+Date.now(),{headline:h,sub:el.querySelector('#mpS').value.trim(),kicker:'At '+venueName(),status:'live',active:true,by:me().name,at:new Date().toISOString()});};
}
function aEvents(el){const ev=Object.entries(INFO.events).sort((a,b)=>(a[1].date||'').localeCompare(b[1].date||''));const ce=can('mall.events');
  el.innerHTML=`<div class="panel"><h2>Events</h2>${ev.length?`<table><tr><th>Event</th><th>Date</th><th>Where</th><th></th></tr>${ev.map(([id,e])=>`<tr><td><b>${escapeHtml(e.title)}</b><br><small class="note">${escapeHtml(e.desc||'')}</small>${e.sample?' <span class="chip grey">sample</span>':''}</td><td>${escapeHtml(e.date||'')} ${escapeHtml(e.time||'')}</td><td>${escapeHtml(e.where||'')}</td><td style="text-align:right">${ce?`<button class="btn sm" data-del="${id}">Delete</button>`:''}</td></tr>`).join('')}</table>`:'<p class="note">No events yet.</p>'}</div>
  ${ce?`<div class="panel"><h2>Add an event</h2><div class="row2"><label class="fld">Title<input id="eT"></label><label class="fld">Where<input id="eW" placeholder="e.g. Central boulevard"></label></div>
   <div class="row2"><label class="fld">Date<input id="eD" type="date"></label><label class="fld">Time<input id="eH" placeholder="e.g. 6–9 PM"></label></div>
   <div class="row2"><label class="fld">Link to a store (optional)<select id="eB"><option value="">None</option>${Object.keys(BRANDS).sort((a,b)=>BRANDS[a].name.localeCompare(BRANDS[b].name)).map(b=>`<option value="${b}">${escapeHtml(BRANDS[b].name)}</option>`).join('')}</select></label><label class="fld">Description<input id="eX"></label></div>
   <button class="btn gold" id="eAdd">Publish event</button></div>`:'<div class="panel"><p class="note">Events are managed by the mall team.</p></div>'}`;
  el.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>delDoc('events',b.dataset.del));
  const a=el.querySelector('#eAdd');if(a)a.onclick=()=>{const $=i=>el.querySelector('#'+i).value.trim();if(!$('eT')){toast('Add a title first');return;}saveDoc('events','ev'+Date.now(),{title:$('eT'),where:$('eW'),date:$('eD'),time:$('eH'),brand:$('eB'),desc:$('eX')});};}
function aUsers(el){const R=ROLES(),U=USERS();const edit=can('mall.users');
  el.innerHTML=`<div class="panel"><h2>Permission sets</h2><p class="note">Tick what each role may do. “Scoped” roles only reach the store they are assigned to.</p>
  <table class="matrix"><tr><th>Permission</th>${Object.values(R).map(r=>`<th>${escapeHtml(r.name)}${r.scoped?'<br><small class="note">scoped</small>':''}</th>`).join('')}</tr>
  ${PERMS.map(([p,t])=>`<tr><td>${t}</td>${Object.entries(R).map(([rid,r])=>`<td><input type="checkbox" data-perm="${rid}|${p}" ${rid==='mall_admin'||(r.perms||[]).includes(p)?'checked':''} ${edit&&rid!=='mall_admin'?'':'disabled'}></td>`).join('')}</tr>`).join('')}</table></div>
  <div class="panel"><h2>Users</h2><table><tr><th>Name</th><th>Role</th><th>Store</th><th></th></tr>${Object.entries(U).map(([id,x])=>`<tr><td>${escapeHtml(x.name)}${x.sample?' <span class="chip grey">sample</span>':''}</td><td>${escapeHtml((R[x.role]||{}).name||x.role)}</td><td>${x.store&&BRANDS[x.store]?escapeHtml(BRANDS[x.store].name):'All'}</td><td style="text-align:right">${edit&&id!=='owner'?`<button class="btn sm" data-udel="${id}">Remove</button>`:''}</td></tr>`).join('')}</table>
  ${edit?`<div class="row2" style="margin-top:12px"><label class="fld">Name<input id="uN"></label><label class="fld">Role<select id="uR">${Object.entries(R).map(([rid,r])=>`<option value="${rid}">${escapeHtml(r.name)}</option>`).join('')}</select></label></div>
   <label class="fld">Store (for scoped roles)<select id="uS"><option value="">—</option>${Object.keys(BRANDS).sort((a,b)=>BRANDS[a].name.localeCompare(BRANDS[b].name)).map(b=>`<option value="${b}">${escapeHtml(BRANDS[b].name)}</option>`).join('')}</select></label>
   <button class="btn gold" id="uAdd">Add user</button><p class="note">In this demo you can switch between users at the top right to see exactly what each role can do. A live rollout adds proper sign-in for each person.</p>`:''}</div>`;
  el.querySelectorAll('[data-perm]').forEach(c=>c.onchange=()=>{const[rid,p]=c.dataset.perm.split('|');const all=JSON.parse(JSON.stringify(R));const r=all[rid];
    r.perms=c.checked?Array.from(new Set((r.perms||[]).concat([p]))):(r.perms||[]).filter(x=>x!==p);
    if(!Object.keys(INFO.roles).length){Object.entries(all).forEach(([id,v])=>saveDoc('roles',id,v));}else saveDoc('roles',rid,r);});
  el.querySelectorAll('[data-udel]').forEach(b=>b.onclick=()=>delDoc('users',b.dataset.udel));
  const a=el.querySelector('#uAdd');if(a)a.onclick=()=>{const n=el.querySelector('#uN').value.trim();const r=el.querySelector('#uR').value;const s=el.querySelector('#uS').value;
    if(!n){toast('Add a name first');return;}if(ROLES()[r]&&ROLES()[r].scoped&&!s){toast('Pick the store this person manages');return;}saveDoc('users','u'+Date.now(),{name:n,role:r,store:s});};}
function aSettings(el){const m=INFO.settings.mall||{};
  el.innerHTML=`<div class="panel"><h2>Help desk</h2><label class="fld">Concierge phone number shown when visitors tap “Need help?”<input id="sH" value="${escapeHtml(m.helpDesk||'')}"></label>
  <label class="fld">Mall name (shown to visitors: “Welcome to …”, “Dine at …”)<input id="sNm" value="${escapeHtml(m.name||'')}" placeholder="Ireo Boulevard"></label>
  <label class="fld">Mall opening hours (shown in the app)<input id="sO" value="${escapeHtml(m.hours||'')}" placeholder="e.g. 11 AM – 11 PM"></label>
  <div class="row3"><label class="fld">Mall opens<input id="sMo" type="time" value="${escapeHtml(m.open||'10:00')}"></label><label class="fld">Mall closes<input id="sMc" type="time" value="${escapeHtml(m.close||'23:00')}"></label><label class="check" style="align-self:end"><input type="checkbox" id="sAds" ${m.adsEnabled===false?'':'checked'}> Kiosk ads on</label></div>
  <label class="check"><input type="checkbox" id="sVoice" ${m.kioskVoice===false?'':'checked'}> Kiosks read directions aloud (visitors can still turn the voice off or on)</label>
  <label class="fld">Public link to the phone app, for the QR codes on the kiosks (empty: this page's own address)<input id="sApp" value="${escapeHtml(m.appUrl||'')}" placeholder="https://…"></label>
  <div class="row2"><label class="fld">Kiosk goes back to the ads after this many seconds without a touch<input id="sI" type="number" min="15" max="900" value="${escapeHtml(m.idleSecs||15)}"></label><label class="fld">Wait times count as out of date after (minutes)<input id="sW" type="number" min="10" max="1440" value="${escapeHtml(m.staleMins||120)}"></label></div><button class="btn gold" id="sSave">Save</button></div>
  <div class="panel"><h2>Parking (Find my car)</h2><p class="note">Members can save where they parked and be taken back to it. Set the basement levels and the lifts that go down to parking.${(INFO.settings.parking||{}).sample?' <span class="chip grey">sample</span>':''}</p>
   <label class="fld">Basement levels, top to bottom (comma separated)<input id="pkL" value="${escapeHtml((parkingConf().levels).join(', '))}" placeholder="e.g. B1, B2"></label>
   <div class="fld">Lifts that go down to parking<div class="linkrow" style="flex-wrap:wrap;gap:14px;margin-top:6px">${CONNECTORS.filter(c=>c.type==='lift').map(c=>`<label class="check"><input type="checkbox" data-pklift="${c.id}" ${parkingConf().lifts.includes(c.id)?'checked':''}> ${escapeHtml(c.name)}</label>`).join('')}</div></div>
   <p class="note">To save a spot in one go, put a QR code on each pillar that opens the app at <code>${escapeHtml(m.appUrl||location.origin+location.pathname)}?view=app&amp;park=B1-P23</code> (level, a dash, then the pillar). Any QR code maker can make them.</p>
   <button class="btn gold" id="pkSave">Save</button></div>
  <div class="panel"><h2>Kiosks</h2><p class="note">Each kiosk opens this page with its own position and facing direction, so “You are here” and the map rotation are right for where it stands. Add these to the kiosk's link:</p>
  <table><tr><th>Setting</th><th>Example</th><th>What it does</th></tr><tr><td>Position</td><td><code>?at=G,374,699</code></td><td>Floor and map position of the kiosk</td></tr><tr><td>Facing</td><td><code>&heading=90</code></td><td>Turns the map so the view ahead is at the top</td></tr><tr><td>Lock</td><td><code>&lock=1</code></td><td>Hides the demo view switcher on public screens</td></tr><tr><td>Quality</td><td><code>&quality=low</code></td><td>For less powerful kiosk hardware</td></tr><tr><td>2D map</td><td><code>&map=2d</code></td><td>Flat floor plan for screens without 3D graphics (also used automatically)</td></tr><tr><td>Idle</td><td><code>&idle=120</code></td><td>Seconds before the kiosk resets and plays the attract film</td></tr><tr><td>Attract film</td><td><code>&attract=0</code></td><td>Turns the idle film off</td></tr></table></div>
  ${recentErrors().length?`<div class="panel"><h2>Problems on this screen<button class="btn sm sp" id="sErrClear">Clear</button></h2><p class="note">The last things that went wrong on this device, newest first. Useful if you contact support.</p><table>${recentErrors().slice().reverse().slice(0,8).map(x=>`<tr><td style="white-space:nowrap">${escapeHtml(new Date(x.at).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))}</td><td>${escapeHtml(x.where)}</td><td>${escapeHtml(x.msg)}</td></tr>`).join('')}</table></div>`:''}
  <div class="panel"><h2>Sample data</h2><p class="note">The demo is seeded with sample offers, wait times, specials, events, users, kiosks, ad airtime and ads, all marked “sample”. Remove them before going live.</p><button class="btn" id="sClear">Remove all sample data</button></div>`;
  el.querySelector('#sSave').onclick=()=>{const num=(id,lo,hi,d)=>{const v=parseInt(el.querySelector(id).value,10);return v>=lo&&v<=hi?v:d;};
    saveDoc('settings','mall',Object.assign({},m,{name:el.querySelector('#sNm').value.trim().slice(0,60),helpDesk:el.querySelector('#sH').value.trim(),hours:el.querySelector('#sO').value.trim(),idleSecs:num('#sI',15,900,15),staleMins:num('#sW',10,1440,120),open:el.querySelector('#sMo').value||'10:00',close:el.querySelector('#sMc').value||'23:00',adsEnabled:el.querySelector('#sAds').checked,kioskVoice:el.querySelector('#sVoice').checked,
      appUrl:(v=>/^https?:\/\/[^\s<>"]+$/i.test(v)?v:'')(el.querySelector('#sApp').value.trim())}));
    if(el.querySelector('#sApp').value.trim()&&!/^https?:\/\//i.test(el.querySelector('#sApp').value.trim()))toast('The app link must start with https:// (left empty)');};
  el.querySelector('#pkSave').onclick=()=>{const levels=el.querySelector('#pkL').value.split(',').map(s=>s.trim().toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4)).filter(Boolean).slice(0,6);
    const lifts=[...el.querySelectorAll('[data-pklift]')].filter(x=>x.checked).map(x=>x.dataset.pklift);if(!levels.length){toast('Add at least one level');return;}if(!lifts.length){toast('Tick at least one lift');return;}
    saveDoc('settings','parking',{levels,lifts});};
  const ec=el.querySelector('#sErrClear');if(ec)ec.onclick=()=>{clearErrors();aSettings(el);};
  el.querySelector('#sClear').onclick=()=>modal(`<h3>Remove sample data?</h3><p class="note">This removes every offer, wait time, special, promotion, event, user, kiosk, ad airtime and ad marked “sample”. Anything your team added stays.</p><div class="linkrow" style="justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn gold" id="mConfirm">Remove</button></div>`)
    .querySelector('#mConfirm').onclick=async e=>{e.target.closest('.modal').remove();let n=0;
      for(const b of Object.keys(INFO.stores)){const st=S(b);const offers=(st.offers||[]).filter(o=>!o.sample);const sampleWait=st.wait&&st.wait.by==='Sample data';
        if(!st.sample&&offers.length===(st.offers||[]).length&&st.specialsBy!=='Sample data')continue;
        const next=Object.assign({},st,{offers});delete next.sample;if(sampleWait)delete next.wait;if(!next.offers.length)delete next.offers;if(next.specialsBy==='Sample data'){delete next.specials;delete next.specialsBy;}
        n++;if(Object.keys(next).length)await saveDoc('stores',b,next,true);else await delDoc('stores',b,true);}
      const gone=new Set(Object.entries(INFO.adcreatives).filter(([,v])=>v&&v.sample).map(([id])=>id));
      for(const c of ['ads','events','users','kiosks','adrules','adcreatives'])for(const [id,v] of Object.entries(INFO[c]))if(v&&v.sample){n++;await delDoc(c,id,true);}
      for(const id of Object.keys(INFO.adstats))if(gone.has(id))await delDoc('adstats',id,true);
      toast(n?'Sample data removed':'There was no sample data left');};}

/* ---------------- members (the phone app's sign-ins) ----------------
   Members are private: they are not in the live data every screen receives. This page asks the server for them with
   the admin password (server.js, /api/members). The mall's team adds or takes points here; the member's app shows it. */
async function adminFetch(path,method,body){let key='';try{key=localStorage.getItem('ireo.adminKey')||'';}catch(e){}
  const r=await fetch(path,{method:method||'GET',headers:Object.assign({'X-Admin-Key':key},body?{'Content-Type':'application/json'}:{}),body:body?JSON.stringify(body):undefined,cache:'no-store'});
  let j=null;try{j=await r.json();}catch(e){}if(!r.ok||!j||!j.ok)throw new Error((j&&j.error)||'The server did not answer.');return j;}
let MEMQ='';
async function aMembers(el){el.innerHTML='<div class="panel"><p class="note">Loading members…</p></div>';let data;
  try{data=await adminFetch('api/members');}catch(e){el.innerHTML=`<div class="panel"><p class="note">Members could not be loaded: ${escapeHtml(e.message)}</p></div>`;return;}
  if(ASEC!=='members')return;
  const list=data.members.sort((a,b)=>(b.joined||'').localeCompare(a.joined||''));const total=list.reduce((n,m)=>n+m.points,0);
  const day=iso=>{const d=new Date(iso);return isNaN(d)?'—':d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});};
  const no=id=>String(id).replace(/^(\d{4})(\d{3})(\d{3})$/,'$1 $2 $3');
  el.innerHTML=`${data.demo?'<div class="lockmsg"><b>Sign-in is in demo mode.</b> No SMS service is connected, so the app shows the sign-in code on screen instead of texting it. Good for a demonstration; connect an SMS service before real members join (DEPLOY.md).</div>':''}
   <div class="a-grid"><div class="kpi"><small>Members</small><b>${list.length}</b></div><div class="kpi"><small>Joined in the last 7 days</small><b>${list.filter(m=>Date.now()-Date.parse(m.joined)<7*864e5).length}</b></div><div class="kpi"><small>Points held</small><b>${total.toLocaleString('en-IN')}</b></div><div class="kpi"><small>Members-only offers live</small><b>${allOffers().filter(o=>o.members).length}</b></div></div>
   <div class="panel"><h2>Members <input id="mQ" class="sp" type="search" placeholder="Find by name, number or mobile" value="${escapeHtml(MEMQ)}" style="max-width:280px"></h2>
   ${list.length?`<div class="tscroll"><table><tr><th>Member</th><th>Member no.</th><th>Mobile</th><th>Joined</th><th>Saved stores</th><th>Points</th><th>Add or take points</th><th></th></tr>
   ${list.map(m=>`<tr data-row="${escapeHtml((m.name+' '+m.id+' '+m.phone).toLowerCase())}"><td class="m-who"><b>${escapeHtml(m.name||'(no name yet)')}</b>${m.log&&m.log[0]?`<br><small class="note">last: ${m.log[0].points>0?'+':''}${m.log[0].points} ${escapeHtml(m.log[0].note||'')}</small>`:''}</td><td>${no(m.id)}</td><td>${escapeHtml(m.phone)}</td><td>${day(m.joined)}</td><td>${m.favs}</td><td><b>${m.points.toLocaleString('en-IN')}</b></td>
     <td><div class="ptsrow"><input type="number" step="1" placeholder="+50" aria-label="Points" data-pts="${m.id}"><input type="text" maxlength="80" placeholder="What for" aria-label="What for" data-note="${m.id}"><button class="btn sm gold" data-give="${m.id}">Save</button></div></td>
     <td style="text-align:right"><button class="btn sm" data-rm="${m.id}">Remove</button></td></tr>`).join('')}</table></div>`
    :'<p class="note">No members yet. People join from the Account tab of the phone app.</p>'}</div>
   <div class="panel"><h2>How membership works</h2><p class="note">People join in the phone app with their mobile number. Members see members-only offers (tick “Members only” when adding an offer to a store), save their favourite stores, and see their points. Points are added here by the mall's team; the member's app shows the new balance within a few seconds.</p></div>`;
  const q=el.querySelector('#mQ');const filt=()=>{MEMQ=q.value;const v=q.value.toLowerCase().trim();el.querySelectorAll('tr[data-row]').forEach(tr=>tr.hidden=!!v&&!tr.dataset.row.includes(v));};if(q){q.oninput=filt;filt();}
  el.querySelectorAll('[data-give]').forEach(b=>b.onclick=async()=>{const id=b.dataset.give,pts=Math.round(+el.querySelector(`[data-pts="${id}"]`).value),note=el.querySelector(`[data-note="${id}"]`).value.trim();
    if(!pts){toast('Enter the points to add (or a minus number to take away)');return;}b.disabled=true;
    try{await adminFetch('api/members/points','POST',{id,points:pts,note,by:me().name});toast(pts>0?pts+' points added':Math.abs(pts)+' points taken');aMembers(el);}catch(e){toast(e.message);b.disabled=false;}});
  el.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{const m=list.find(x=>x.id===b.dataset.rm);confirmBox(`Remove ${m.name||'this member'}?`,'Their membership, points and saved stores are deleted. This cannot be undone.','Remove member',async()=>{try{await adminFetch('api/members/'+m.id,'DELETE');toast('Member removed');}catch(e){toast(e.message);}aMembers(el);});});
}
