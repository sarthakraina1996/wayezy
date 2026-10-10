/* ============================================================
   KIOSK ADS in the admin hub
   - Ads & slots (master admin): give each store airtime (time windows x seconds per rotation, on
     chosen kiosks), set how many ads are free and what extra ads cost, approve ads, see plays.
   - Kiosks (master admin): the screens and how long each ad rotation is.
   - My ads (store portal): a store sees its airtime and allowance, and uploads its ads.
   - Add a store (master admin): a new shop in an empty unit, with its ad permissions and slot.
   All the arithmetic is in adsched.js.
   ============================================================ */
let ADSTORE=null,ADDRAFT=null;
const DAYN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const kioskList=()=>Object.entries(INFO.kiosks).map(([id,k])=>Object.assign({id},k)).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
const blankRule=()=>({enabled:true,kiosks:['*'],freeAds:3,maxAds:5,extraPrice:1500,autoApprove:false,slots:[]});
const ruleOf=b=>INFO.adrules[b]||null;
const kiosksOfRule=r=>{const all=kioskList();const k=r&&r.kiosks&&r.kiosks.length?r.kiosks:['*'];return k.includes('*')?all:all.filter(x=>k.includes(x.id));};
const mallOpen=()=>((INFO.settings.mall||{}).open)||'10:00',mallClose=()=>((INFO.settings.mall||{}).close)||'23:00';
const winLabel=s=>`${AdSched.label(s.from)} – ${AdSched.label(s.to)}`;
const daysLabel=d=>!d||!d.length||d.length===7?'Every day':(d.slice().sort().join()==='1,2,3,4,5'?'Weekdays':d.slice().sort().join()==='0,6'?'Weekends':d.map(x=>DAYN[x]).join(', '));
const inr=n=>'₹'+Number(n||0).toLocaleString('en-IN');
const bname=b=>BRANDS[b]?BRANDS[b].name:b;
const creativesOf=b=>Object.entries(INFO.adcreatives).map(([id,c])=>Object.assign({id},c)).filter(c=>c.brand===b).sort((x,y)=>(y.createdAt||'').localeCompare(x.createdAt||''));
const statusChip=s=>({live:'<span class="chip ok">Live</span>',pending:'<span class="chip warn">Waiting for approval</span>',paused:'<span class="chip grey">Paused</span>',rejected:'<span class="chip red">Not approved</span>'})[s]||'';
const playsOf=id=>{const s=INFO.adstats[id]||{};return {today:s.day===todayISO()?(s.today||0):0,total:s.total||0};};
const newId=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

/* ---------- a kiosk's day: what share of each half hour's rotation is sold ---------- */
function timelineHTML(k,mine,rules,mineName){const day=new Date().getDay(),a=AdSched.toMin(mallOpen()),z=AdSched.toMin(mallClose());rules=rules||INFO.adrules;
  const nm=x=>x===mine&&mineName?mineName:bname(x);
  const blocks=AdSched.usage(rules,k,day,30).filter(bl=>bl.from>=a&&bl.to<=z);if(!blocks.length)return '';
  const axis=[];for(let h=Math.ceil(a/60);h*60<=z;h+=2)axis.push(`<span style="left:${((h*60-a)/(z-a)*100).toFixed(2)}%">${AdSched.label(AdSched.toHHMM(h*60))}</span>`);
  const nd=new Date(),now=nd.getHours()*60+nd.getMinutes();const nowPct=now>=a&&now<=z?((now-a)/(z-a)*100).toFixed(2):null;
  return `<div class="tl"><div class="tl-name"><b>${escapeHtml(k.name||k.id)}</b><span>${escapeHtml(k.id)} · ${k.loopSecs||60} s rotation${k.active===false?' · switched off':''}</span></div>
    <div class="tl-bar">${blocks.map(bl=>{const p=bl.used/bl.cap;const me=mine&&bl.who.includes(mine);
      return `<i class="${p>=1?'full':p>=0.66?'busy':p>0?'some':'free'}${me?' mine':''}" title="${AdSched.label(AdSched.toHHMM(bl.from))}–${AdSched.label(AdSched.toHHMM(bl.to))}: ${bl.used} s of ${bl.cap} s sold${bl.who.length?' · '+bl.who.map(nm).map(escapeHtml).join(', '):''}"></i>`;}).join('')}
      ${nowPct?`<b class="tl-now" style="left:${nowPct}%"></b>`:''}</div><div class="tl-axis">${axis.join('')}</div></div>`;}
const tlLegend=(mine,name)=>`<div class="tl-legend"><span><i class="free"></i>Free</span><span><i class="some"></i>Some sold</span><span><i class="busy"></i>Nearly full</span><span><i class="full"></i>Full</span>${mine?`<span><i class="mine"></i>${escapeHtml(name||bname(mine))}</span>`:''}</div>`;
const footfallBars=f=>`<span class="ffb" title="Estimated footfall">${[.2,.4,.6,.8,1].map(t=>`<i class="${f>=t-.1?'on':''}"></i>`).join('')}</span>`;

/* ---------- slot rows, used by the store airtime editor and by Add a store ---------- */
function slotFree(R,brand,i){const s=R.slots[i];const rules=Object.assign({},INFO.adrules,{[brand]:Object.assign({},R,{enabled:true,slots:R.slots.filter((_,j)=>j!==i)})});
  return AdSched.freeIn(rules,kiosksOfRule(R),s.from,s.to,s.days);}
const slotBad=(R,brand)=>R.slots.filter((s,i)=>AdSched.toMin(s.from)===null||AdSched.toMin(s.to)===null||s.from===s.to||slotFree(R,brand,i)<s.secs);
function slotRowsHTML(R,brand){const slots=R.slots;
  if(!slots.length)return '<p class="note">No time windows yet. Find the best free slot below, or add one by hand.</p>';
  return slots.map((s,i)=>{const others=slotFree(R,brand,i);
    const ok=others>=s.secs;const days=s.days&&s.days.length?s.days:[0,1,2,3,4,5,6];
    return `<div class="slotrow${ok?'':' bad'}" data-i="${i}">
      <label>From<input type="time" data-f="from" value="${escapeHtml(s.from)}"></label><label>To<input type="time" data-f="to" value="${escapeHtml(s.to)}"></label>
      <label>Seconds per rotation<input type="number" min="3" max="60" step="1" data-f="secs" value="${s.secs}"></label>
      <div class="days">${DAYN.map((d,j)=>`<button type="button" data-day="${j}" aria-pressed="${days.includes(j)}">${d[0]}</button>`).join('')}</div>
      <span class="slotfree">${ok?`${others} s free here`:`Only ${Math.max(0,others)} s free: overbooked`}</span>
      <button type="button" class="btn sm" data-rm="${i}">Remove</button></div>`;}).join('');}
function wireSlotRows(host,slots,rerender){
  host.querySelectorAll('.slotrow').forEach(row=>{const i=+row.dataset.i;const s=slots[i];
    row.querySelectorAll('input[data-f]').forEach(inp=>inp.onchange=()=>{const f=inp.dataset.f;s[f]=f==='secs'?Math.max(3,Math.min(60,parseInt(inp.value,10)||6)):inp.value;rerender();});
    row.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{const d=+b.dataset.day;let days=s.days&&s.days.length?s.days.slice():[0,1,2,3,4,5,6];days=days.includes(d)?days.filter(x=>x!==d):days.concat([d]).sort();s.days=days.length===7?[]:days;rerender();});});
  host.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{slots.splice(+b.dataset.rm,1);rerender();});}
function suggestHTML(res,secs){if(!res.best)return `<p class="note warnline">No window has ${secs} s free on these kiosks between ${AdSched.label(mallOpen())} and ${AdSched.label(mallClose())}. Try fewer seconds, a shorter window or other kiosks.</p>`;
  const rows=res.options.slice(0,4);if(res.roomiest&&!rows.some(o=>o.from===res.roomiest.from))rows.push(res.roomiest);
  return `<div class="sugg">${rows.map((o,i)=>`<div class="sugg-row${o===res.best?' best':''}"><div><b>${winLabel(o)}</b>${o===res.best?'<span class="chip ok">Best: busiest hours with room</span>':o===res.roomiest?'<span class="chip grey">Most free time</span>':''}</div>
    <span>${o.free} s free per rotation</span>${footfallBars(o.footfall)}<button type="button" class="btn sm gold" data-use="${o.from}|${o.to}">Use</button></div>`).join('')}</div>
    <p class="note">Busy hours are an estimate for a Gurugram high street: quiet mornings, a lunch peak and a strong 6 to 10 PM.</p>`;}

/* ============================================================ Ads & slots (master admin) */
function aAds(el){
  if(ADSTORE&&BRANDS[ADSTORE])return aAdsStore(el,ADSTORE);
  const ks=kioskList(),rules=INFO.adrules;const stores=Object.keys(rules).filter(b=>BRANDS[b]).sort((a,b)=>bname(a).localeCompare(bname(b)));
  const all=Object.entries(INFO.adcreatives).map(([id,c])=>Object.assign({id},c));const pending=all.filter(c=>c.status==='pending');
  const live=all.filter(c=>c.status==='live').length;
  const revenue=stores.reduce((n,b)=>n+all.filter(c=>c.brand===b&&c.chargeable&&c.status!=='rejected').reduce((m,c)=>m+(c.price||0),0),0);
  const without=Object.keys(BRANDS).filter(b=>unitsOfBrand(b).length&&!rules[b]).sort((a,b)=>bname(a).localeCompare(bname(b)));
  el.innerHTML=`<div class="a-grid"><div class="kpi"><small>Kiosks</small><b>${ks.filter(k=>k.active!==false).length}</b></div><div class="kpi"><small>Stores with airtime</small><b>${stores.filter(b=>rules[b].enabled!==false).length}</b></div>
    <div class="kpi"><small>Ads live</small><b>${live}</b></div><div class="kpi"><small>Paid ads this month</small><b>${inr(revenue)}</b></div></div>
    ${pending.length?`<div class="panel"><h2>Waiting for approval <span class="chip warn">${pending.length}</span></h2><div class="adgrid">${pending.map(c=>creativeCardHTML(c,true)).join('')}</div></div>`:''}
    <div class="panel"><h2>Airtime sold today${tlLegend()}</h2><p class="note">Each bar is one kiosk from opening to closing. The colour shows how much of each half hour's ad rotation is sold. Hover for who is on.</p>
      ${ks.map(k=>timelineHTML(k)).join('')||'<p class="note">No kiosks yet. Add them under Kiosks.</p>'}</div>
    <div class="panel"><h2>Stores with airtime<span class="sp"></span><select id="adNew" aria-label="Give a store airtime"><option value="">+ Give a store airtime…</option>${without.map(b=>`<option value="${b}">${escapeHtml(bname(b))}</option>`).join('')}</select></h2>
      ${stores.length?`<table><tr><th>Store</th><th>Time windows</th><th>Kiosks</th><th>Ads</th><th>Plays today</th><th></th></tr>${stores.map(b=>{const r=rules[b],al=AdSched.allowance(r,INFO.adcreatives,b);const cs=creativesOf(b);
        const pt=cs.reduce((n,c)=>n+playsOf(c.id).today,0);const pend=cs.filter(c=>c.status==='pending').length;
        return `<tr><td><b>${escapeHtml(bname(b))}</b>${r.enabled===false?' <span class="chip grey">Off</span>':''}${pend?` <span class="chip warn">${pend} to approve</span>`:''}</td>
          <td>${(r.slots||[]).map(s=>`<div>${winLabel(s)} · ${s.secs} s${s.days&&s.days.length?' · '+daysLabel(s.days):''}</div>`).join('')||'—'}</td>
          <td>${(r.kiosks||['*']).includes('*')?'All':escapeHtml((r.kiosks||[]).join(', '))}</td><td>${al.count} of ${al.free} free${al.paid?` · ${al.paid} paid`:''}</td><td>${pt}</td>
          <td style="text-align:right"><button class="btn sm" data-store="${b}">Manage</button></td></tr>`;}).join('')}</table>`:'<p class="note">No store has kiosk airtime yet.</p>'}</div>`;
  el.querySelectorAll('[data-store]').forEach(x=>x.onclick=()=>{ADSTORE=x.dataset.store;ADDRAFT=null;renderAdmin();});
  el.querySelector('#adNew').onchange=e=>{if(e.target.value){ADSTORE=e.target.value;ADDRAFT=null;renderAdmin();}};
  wireCreativeCards(el);
}
function aAdsStore(el,b){
  if(!ADDRAFT||ADDRAFT.brand!==b)ADDRAFT={brand:b,rule:JSON.parse(JSON.stringify(ruleOf(b)||blankRule()))};
  const R=ADDRAFT.rule;R.slots=R.slots||[];const ks=kioskList();const kset=kiosksOfRule(R);const cs=creativesOf(b);const al=AdSched.allowance(R,INFO.adcreatives,b);
  const allK=(R.kiosks||['*']).includes('*');
  el.innerHTML=`<button class="btn sm" id="adBack">← All stores with airtime</button>
  <div class="two"><div>
    <div class="panel"><h2>Airtime for ${escapeHtml(bname(b))}<label class="switch sp"><input type="checkbox" id="adOn" ${R.enabled!==false?'checked':''}><span>Ads on</span></label></h2>
      <div class="fld">Kiosks<div class="chips" id="adK"><button type="button" data-k="*" aria-pressed="${allK}">All kiosks</button>${ks.map(k=>`<button type="button" data-k="${k.id}" aria-pressed="${!allK&&(R.kiosks||[]).includes(k.id)}">${escapeHtml(k.id)} · ${escapeHtml(k.name||'')}</button>`).join('')}</div></div>
      <div class="row3"><label class="fld">Free ads<input type="number" min="0" max="20" id="adFree" value="${R.freeAds??3}"></label><label class="fld">Most ads allowed<input type="number" min="0" max="30" id="adMax" value="${R.maxAds??5}"></label><label class="fld">Each extra ad (₹)<input type="number" min="0" step="100" id="adPrice" value="${R.extraPrice??0}"></label></div>
      <label class="check"><input type="checkbox" id="adAuto" ${R.autoApprove?'checked':''}> Go live without approval</label>
      <h3 class="sub3">Time windows</h3><div id="adSlots">${slotRowsHTML(R,b)}</div>
      <button type="button" class="btn sm" id="adAddSlot">+ Add a window by hand</button>
      <h3 class="sub3">Find the best free slot</h3>
      <div class="row3"><label class="fld">Seconds per rotation<input type="number" min="3" max="60" id="sgSecs" value="6"></label><label class="fld">Window length (hours)<input type="number" min="1" max="13" step="0.5" id="sgHours" value="3"></label><div class="fld"><span>&nbsp;</span><button type="button" class="btn green" id="sgGo">Find slots</button></div></div>
      <div id="sgOut"></div>
      <div class="savebar"><button class="btn gold" id="adSave">Save airtime</button>${ruleOf(b)?'<button class="btn" id="adDel">Remove all airtime</button>':''}<span class="note" id="adMsg"></span></div>
    </div>
  </div><div>
    <div class="panel"><h2>On the kiosks today${tlLegend(b)}</h2>${kset.map(k=>timelineHTML(k,b,Object.assign({},INFO.adrules,{[b]:R}))).join('')||'<p class="note">Choose at least one kiosk.</p>'}
      <p class="note">About <b>${kset.reduce((n,k)=>n+AdSched.plays(R,k),0).toLocaleString('en-IN')}</b> plays a day across ${kset.length} kiosk${kset.length===1?'':'s'} (${Math.round(kset.reduce((n,k)=>n+AdSched.dailyAirtime(R,k),0)/60)} minutes of screen time).</p></div>
    <div class="panel"><h2>${escapeHtml(bname(b))}'s ads <span class="chip">${al.count} of ${al.free} free${al.paid?' · '+al.paid+' paid':''}</span></h2>
      ${cs.length?`<div class="adgrid">${cs.map(c=>creativeCardHTML(c,true)).join('')}</div>`:'<p class="note">No ads uploaded yet. The store adds them in its portal (My ads).</p>'}
      ${al.paid?`<p class="note">Paid ads: <b>${inr(cs.filter(c=>c.chargeable&&c.status!=='rejected').reduce((n,c)=>n+(c.price||0),0))}</b> this month.</p>`:''}</div>
  </div></div>`;
  const $=id=>el.querySelector('#'+id);const rerender=()=>{readForm();aAdsStore(el,b);};
  function readForm(){R.enabled=$('adOn').checked;R.freeAds=Math.max(0,parseInt($('adFree').value,10)||0);R.maxAds=Math.max(R.freeAds,parseInt($('adMax').value,10)||0);R.extraPrice=Math.max(0,parseInt($('adPrice').value,10)||0);R.autoApprove=$('adAuto').checked;}
  $('adBack').onclick=()=>{ADSTORE=null;ADDRAFT=null;renderAdmin();};
  $('adK').querySelectorAll('[data-k]').forEach(x=>x.onclick=()=>{readForm();const k=x.dataset.k;if(k==='*')R.kiosks=['*'];else{let l=(R.kiosks||[]).filter(v=>v!=='*');l=l.includes(k)?l.filter(v=>v!==k):l.concat([k]);R.kiosks=l.length?l:['*'];}aAdsStore(el,b);});
  wireSlotRows($('adSlots'),R.slots,rerender);
  $('adAddSlot').onclick=()=>{readForm();R.slots.push({id:newId('sl'),from:'14:00',to:'17:00',secs:6,days:[]});aAdsStore(el,b);};
  $('sgGo').onclick=()=>{readForm();const secs=Math.max(3,parseInt($('sgSecs').value,10)||6),hours=Math.max(1,parseFloat($('sgHours').value)||3);
    const others=Object.assign({},INFO.adrules,{[b]:{enabled:true,kiosks:R.kiosks,slots:R.slots}});
    const res=AdSched.suggest(others,kset,{secs,hours,open:mallOpen(),close:mallClose()});$('sgOut').innerHTML=suggestHTML(res,secs);
    $('sgOut').querySelectorAll('[data-use]').forEach(x=>x.onclick=()=>{const [f,t]=x.dataset.use.split('|');R.slots.push({id:newId('sl'),from:f,to:t,secs,days:[]});aAdsStore(el,b);toast(`Added ${AdSched.label(f)} – ${AdSched.label(t)}. Save to confirm.`);});};
  $('adSave').onclick=async()=>{readForm();const bad=slotBad(R,b);
    if(bad.length){$('adMsg').textContent=`${bad.length} window${bad.length>1?'s are':' is'} overbooked or incomplete. Change the time or seconds, or use a suggested slot.`;return;}
    const rule=Object.assign({},R,{updatedAt:new Date().toISOString(),by:me().name});delete rule.sample;if(await saveDoc('adrules',b,rule))ADDRAFT=null;};
  const del=$('adDel');if(del)del.onclick=()=>confirmBox(`Remove all of ${bname(b)}'s airtime?`,'Its ads stop playing on every kiosk straight away. The ads themselves are kept.','Remove airtime',async()=>{await delDoc('adrules',b);ADSTORE=null;ADDRAFT=null;renderAdmin();});
  wireCreativeCards(el);
}

/* ---------- one ad, as the kiosk shows it, with its status and controls ---------- */
function creativeCardHTML(c,master){const p=playsOf(c.id);const r=ruleOf(c.brand)||{};const slots=(r.slots||[]).filter(s=>!c.slots||!c.slots.length||c.slots.includes(s.id));
  return `<div class="adcard"><div class="adprev">${adHTML({brand:c.brand,creative:c,secs:6},'preview')}</div>
    <div class="adinfo"><b>${escapeHtml(c.title||'Untitled ad')}</b><small>${escapeHtml(bname(c.brand))}${c.chargeable?` · paid ${inr(c.price)}`:' · free'}${c.sample?' · sample':''}</small>
      <div>${statusChip(c.status)}</div><small>${slots.length?slots.map(winLabel).join(', '):'No matching window'} · ${p.today} plays today, ${p.total} in all</small>
      <div class="adbtns">${master&&c.status==='pending'?`<button class="btn sm green" data-cr="${c.id}|live">Approve</button><button class="btn sm" data-cr="${c.id}|rejected">Reject</button>`:''}
        ${c.status==='live'?`<button class="btn sm" data-cr="${c.id}|paused">Pause</button>`:''}${c.status==='paused'?`<button class="btn sm" data-cr="${c.id}|${master||(r.autoApprove)?'live':'pending'}">Resume</button>`:''}
        ${master?`<button class="btn sm" data-cpaid="${c.id}">${c.chargeable?'Make free':'Make paid'}</button>`:''}<button class="btn sm" data-cdel="${c.id}">Delete</button></div></div></div>`;}
function wireCreativeCards(el){
  el.querySelectorAll('[data-cr]').forEach(x=>x.onclick=()=>{const [id,st]=x.dataset.cr.split('|');const c=INFO.adcreatives[id];if(!c)return;saveDoc('adcreatives',id,Object.assign({},c,{status:st,reviewedBy:me().name,reviewedAt:new Date().toISOString()}));});
  el.querySelectorAll('[data-cpaid]').forEach(x=>x.onclick=()=>{const id=x.dataset.cpaid,c=INFO.adcreatives[id];if(!c)return;const r=ruleOf(c.brand)||{};saveDoc('adcreatives',id,Object.assign({},c,{chargeable:!c.chargeable,price:!c.chargeable?(r.extraPrice||0):0}));});
  el.querySelectorAll('[data-cdel]').forEach(x=>x.onclick=()=>confirmBox('Delete this ad?','It stops playing straight away and cannot be brought back.','Delete',()=>delDoc('adcreatives',x.dataset.cdel)));}

/* ============================================================ Kiosks (master admin) */
function aKiosks(el){const ks=kioskList();const now=new Date();
  el.innerHTML=`<div class="panel"><h2>Kiosks</h2><p class="note">Each kiosk plays an ad rotation: the stores whose windows are open share it, each for the seconds it bought. When a window closes those ads stop and the next ones start by themselves.</p>
    <table><tr><th>Kiosk</th><th>Where</th><th>Rotation</th><th>Playing now</th><th>Open it</th><th></th></tr>
    ${ks.map(k=>{const on=AdSched.activeSlots(INFO.adrules,k.id,now);const used=on.reduce((n,x)=>n+x.slot.secs,0);const f=(k.at||'').split(',')[0];
      const url=`?kiosk=${encodeURIComponent(k.id)}${k.at?'&at='+encodeURIComponent(k.at):''}${k.heading?'&heading='+k.heading:''}&lock=1`;
      return `<tr><td><b>${escapeHtml(k.id)}</b> ${escapeHtml(k.name||'')}${k.active===false?' <span class="chip grey">Off</span>':''}${k.sample?' <span class="chip grey">sample</span>':''}</td><td>${FLOORS[f]?FLOORS[f].name:'—'}</td>
        <td>${k.loopSecs||60} s</td><td>${on.length?`${on.map(x=>escapeHtml(bname(x.brand))).join(', ')} <small class="note">(${used} of ${k.loopSecs||60} s)</small>`:'<span class="note">Nothing right now</span>'}</td>
        <td><a class="btn sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a></td><td style="text-align:right"><button class="btn sm" data-kedit="${k.id}">Edit</button></td></tr>`;}).join('')}</table></div>
    <div class="panel"><h2 id="kfTitle">Add a kiosk</h2>
      <div class="row3"><label class="fld">Kiosk ID<input id="kfId" placeholder="e.g. K5"></label><label class="fld">Name<input id="kfName" placeholder="e.g. Food court, second floor"></label><label class="fld">Ad rotation (seconds)<select id="kfLoop">${[30,45,60,90,120].map(s=>`<option ${s===60?'selected':''}>${s}</option>`).join('')}</select></label></div>
      <div class="row3"><label class="fld">Position on the map<input id="kfAt" placeholder="floor,x,y e.g. G,374,699"></label><label class="fld">Facing (degrees)<input id="kfHead" type="number" value="0"></label><label class="check" style="align-self:end"><input type="checkbox" id="kfOn" checked> Switched on</label></div>
      <div class="savebar"><button class="btn gold" id="kfSave">Save kiosk</button><button class="btn" id="kfDel" hidden>Remove kiosk</button></div></div>`;
  const $=id=>el.querySelector('#'+id);
  el.querySelectorAll('[data-kedit]').forEach(x=>x.onclick=()=>{const k=INFO.kiosks[x.dataset.kedit];$('kfTitle').textContent='Edit kiosk '+x.dataset.kedit;$('kfId').value=x.dataset.kedit;$('kfId').disabled=true;
    $('kfName').value=k.name||'';$('kfLoop').value=String(k.loopSecs||60);$('kfAt').value=k.at||'';$('kfHead').value=k.heading||0;$('kfOn').checked=k.active!==false;$('kfDel').hidden=false;$('kfName').focus();});
  $('kfSave').onclick=()=>{const id=($('kfId').value||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,12);if(!id){toast('Give the kiosk an ID, e.g. K5');return;}
    const at=$('kfAt').value.trim();if(at&&!/^[GFS],\d+(\.\d+)?,\d+(\.\d+)?$/.test(at)){toast('Position looks like G,374,699 (floor G, F or S, then x,y)');return;}
    const prev=INFO.kiosks[id]||{};const k=Object.assign({},prev,{name:$('kfName').value.trim()||id,loopSecs:+$('kfLoop').value,at,heading:parseInt($('kfHead').value,10)||0,active:$('kfOn').checked});delete k.sample;saveDoc('kiosks',id,k);};
  $('kfDel').onclick=()=>{const id=$('kfId').value;confirmBox(`Remove kiosk ${id}?`,'Its ads stop. Stores keep their airtime on the other kiosks.','Remove',()=>delDoc('kiosks',id));};
}

/* ============================================================ My ads (store portal) */
function aMyAds(el){const b=me().store;if(!b||!BRANDS[b]){el.innerHTML='<div class="panel"><p class="note">Your account is not linked to a store yet. Ask the mall team.</p></div>';return;}
  if(!can('store.ads',b)){el.innerHTML='<div class="panel"><p class="note">Your role cannot manage kiosk ads. Ask the mall team.</p></div>';return;}
  const r=ruleOf(b),cs=creativesOf(b),al=AdSched.allowance(r,INFO.adcreatives,b);
  if(!r||r.enabled===false){el.innerHTML=`<div class="panel"><h2>Kiosk ads</h2><p class="note">${escapeHtml(bname(b))} does not have kiosk airtime yet. The mall team gives each store its time windows and seconds on the kiosk screens; ask them to set yours up.</p></div>`;return;}
  const ks=kiosksOfRule(r);const draft=aMyAds.draft=aMyAds.draft&&aMyAds.draft.brand===b?aMyAds.draft:{brand:b,title:'',sub:'',kind:'card',photo:PHOTOS[b]?b:'',media:'',slots:[]};
  el.innerHTML=`<div class="two"><div>
    <div class="panel"><h2>Your airtime</h2>
      ${(r.slots||[]).map(s=>`<div class="airrow">${IC.clock}<div><b>${winLabel(s)}</b><span>${s.secs} seconds in every rotation · ${daysLabel(s.days)}</span></div></div>`).join('')}
      <p class="note">On ${ks.length===kioskList().length?'all':ks.length} kiosk${ks.length===1?'':'s'}: about <b>${ks.reduce((n,k)=>n+AdSched.plays(r,k),0).toLocaleString('en-IN')}</b> plays a day. Your ads only play inside these windows; outside them the kiosk moves on to other stores.</p>
      <div class="allow"><div><b>${al.count}</b><span>ads</span></div><div><b>${al.freeLeft}</b><span>free left</span></div><div><b>${al.max}</b><span>most allowed</span></div><div><b>${inr(al.price)}</b><span>each extra ad</span></div></div></div>
    <div class="panel"><h2>Your ads</h2>${cs.length?`<div class="adgrid">${cs.map(c=>creativeCardHTML(c,false)).join('')}</div>`:'<p class="note">No ads yet. Make your first one here.</p>'}</div>
  </div><div>
    <div class="panel"><h2>New ad</h2>${al.canAdd?`
      <label class="fld">Headline<input id="naT" maxlength="40" value="${escapeHtml(draft.title)}" placeholder="e.g. Flat 30% off this weekend"></label>
      <label class="fld">Line underneath<input id="naS" maxlength="60" value="${escapeHtml(draft.sub)}" placeholder="e.g. On selected styles"></label>
      <div class="fld">Picture<div class="chips">${PHOTOS[b]?`<button type="button" data-pic="photo" aria-pressed="${draft.kind==='card'&&!!draft.photo}">Our store photo</button>`:''}<button type="button" data-pic="plain" aria-pressed="${draft.kind==='card'&&!draft.photo}">Plain colour</button><label class="btn sm">Upload a picture<input type="file" id="naImg" accept="image/png,image/jpeg,image/webp" hidden></label></div>
        <span style="font-size:12px">A landscape picture works best (1920 × 1080). It is shown full screen on idle kiosks.</span></div>
      <div class="fld">Play it in<div class="chips">${(r.slots||[]).map(s=>`<button type="button" data-sl="${s.id}" aria-pressed="${!draft.slots.length||draft.slots.includes(s.id)}">${winLabel(s)}</button>`).join('')}</div></div>
      <div class="fld">How it looks on the kiosk<div class="adprev big" id="naPrev"></div></div>
      ${al.nextIsPaid?`<p class="lockmsg">You have used your ${al.free} free ad${al.free===1?'':'s'}. This one is a paid ad: ${inr(al.price)}.</p>`:''}
      <button class="btn gold" id="naGo">${r.autoApprove?'Publish':'Send for approval'}</button>`:`<p class="note">You have ${al.count} ads, the most your plan allows (${al.max}). Delete one to add another, or ask the mall team for more.</p>`}</div>
  </div></div>`;
  wireCreativeCards(el);if(!al.canAdd)return;
  const $=id=>el.querySelector('#'+id);
  const prev=()=>{draft.title=$('naT').value.trim();draft.sub=$('naS').value.trim();$('naPrev').innerHTML=adHTML({brand:b,secs:6,creative:{kind:draft.kind,title:draft.title||'Your headline',sub:draft.sub,photo:draft.photo,media:draft.media}},'preview');};
  prev();$('naT').oninput=prev;$('naS').oninput=prev;
  el.querySelectorAll('[data-pic]').forEach(x=>x.onclick=()=>{draft.kind='card';draft.media='';draft.photo=x.dataset.pic==='photo'?b:'';aMyAds(el);});
  $('naImg').onchange=async()=>{const f=$('naImg').files[0];if(!f)return;try{draft.media=await adImageData(f);draft.kind='image';draft.photo='';aMyAds(el);}catch(e){toast(e.message||'That picture could not be used');}};
  el.querySelectorAll('[data-sl]').forEach(x=>x.onclick=()=>{const id=x.dataset.sl;const all=(r.slots||[]).map(s=>s.id);let l=draft.slots.length?draft.slots.slice():all.slice();l=l.includes(id)?l.filter(v=>v!==id):l.concat([id]);draft.slots=l.length===all.length||!l.length?[]:l;aMyAds(el);});
  $('naGo').onclick=()=>{prev();if(!draft.title&&draft.kind!=='image'){toast('Add a headline first');return;}
    const go=()=>{const c={brand:b,kind:draft.kind,title:draft.title,sub:draft.sub,photo:draft.photo||'',media:draft.kind==='image'?draft.media:'',slots:draft.slots,
        status:r.autoApprove?'live':'pending',chargeable:al.nextIsPaid,price:al.nextIsPaid?al.price:0,createdAt:new Date().toISOString(),by:me().name};
      saveDoc('adcreatives',newId('ad'),c);aMyAds.draft=null;};
    if(al.nextIsPaid)confirmBox(`This will be a paid ad: ${inr(al.price)}`,`You have used your ${al.free} free ad${al.free===1?'':'s'}. The mall team bills paid ads each month.`,'Yes, add a paid ad',go);else go();};
}
/* pictures for ads: landscape, at most 1600 px wide, kept small enough for the database */
function adImageData(file){return new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const k=Math.min(1,1600/img.width,900/img.height);
  const c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  let q=0.82,d=c.toDataURL('image/jpeg',q);while(d.length>420000&&q>0.4){q-=0.1;d=c.toDataURL('image/jpeg',q);}
  if(d.length>420000)return rej(new Error('That picture is too large. Try a smaller one.'));res(d);};img.onerror=()=>rej(new Error('That file is not a picture'));img.src=fr.result;};fr.readAsDataURL(file);});}

/* ============================================================ Add a store (master admin) */
function aAddStore(el){
  const D=aAddStore.d=aAddStore.d||{name:'',cat:'fashion',units:[],desc:'',open:'',close:'',ads:true,rule:blankRule()};const R=D.rule;
  const vac=vacantUnits();const byF={};vac.forEach(u=>(byF[u.f]=byF[u.f]||[]).push(u));
  const ks=kiosksOfRule(R);const custom=Object.entries(INFO.stores).filter(([k,v])=>v&&v.custom);
  el.innerHTML=`<button class="btn sm" id="nsBack">← All stores</button>
  <div class="two"><div>
    <div class="panel"><h2>New store</h2>
      <div class="row2"><label class="fld">Store name<input id="nsName" value="${escapeHtml(D.name)}" placeholder="e.g. Whiskers"></label>
        <label class="fld">Category<select id="nsCat">${Object.entries(CATS).map(([k,c])=>`<option value="${k}" ${k===D.cat?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></label></div>
      <div class="fld">Unit on the plan (only empty units are listed)${FLOOR_ORDER.map(f=>byF[f]?`<div class="unitpick"><b>${FLOORS[f].name}</b>${byF[f].map(u=>`<button type="button" data-u="${u.key}" aria-pressed="${D.units.includes(u.key)}">${escapeHtml(u.id)}</button>`).join('')}</div>`:'').join('')}</div>
      <label class="fld">About the store<textarea id="nsDesc">${escapeHtml(D.desc)}</textarea></label>
      <div class="row2"><label class="fld">Opens<input type="time" id="nsOpen" value="${escapeHtml(D.open)}"></label><label class="fld">Closes<input type="time" id="nsClose" value="${escapeHtml(D.close)}"></label></div></div>
    <div class="panel"><h2>Kiosk ads<label class="switch sp"><input type="checkbox" id="nsAds" ${D.ads?'checked':''}><span>Give airtime</span></label></h2>
      ${D.ads?`<div class="fld">Kiosks<div class="chips" id="nsK"><button type="button" data-k="*" aria-pressed="${(R.kiosks||['*']).includes('*')}">All kiosks</button>${kioskList().map(k=>`<button type="button" data-k="${k.id}" aria-pressed="${!(R.kiosks||['*']).includes('*')&&R.kiosks.includes(k.id)}">${escapeHtml(k.id)}</button>`).join('')}</div></div>
      <div class="row3"><label class="fld">Free ads<input type="number" id="nsFree" min="0" value="${R.freeAds}"></label><label class="fld">Most ads allowed<input type="number" id="nsMax" min="0" value="${R.maxAds}"></label><label class="fld">Each extra ad (₹)<input type="number" id="nsPrice" min="0" step="100" value="${R.extraPrice}"></label></div>
      <label class="check"><input type="checkbox" id="nsAuto" ${R.autoApprove?'checked':''}> Their ads go live without approval</label>
      <h3 class="sub3">Time windows</h3><div id="nsSlots">${slotRowsHTML(R,'__new')}</div>
      <div class="row3"><label class="fld">Seconds per rotation<input type="number" id="nsSecs" min="3" max="60" value="6"></label><label class="fld">Window length (hours)<input type="number" id="nsHours" min="1" max="13" step="0.5" value="3"></label><div class="fld"><span>&nbsp;</span><button type="button" class="btn green" id="nsFind">Find the best slot</button></div></div>
      <div id="nsSugg"></div>`:'<p class="note">This store will not appear in kiosk ad rotations. You can give it airtime later under Ads & slots.</p>'}</div>
    <div class="savebar"><button class="btn gold" id="nsSave">Create store</button><span class="note" id="nsMsg"></span></div>
  </div><div>
    ${D.ads?`<div class="panel"><h2>Airtime on the kiosks today${tlLegend('__new',D.name||'New store')}</h2>${ks.map(k=>timelineHTML(k,'__new',Object.assign({},INFO.adrules,{__new:R}),D.name||'New store')).join('')}<p class="note">The highlighted blocks are the windows chosen for this store.</p></div>`:''}
    ${custom.length?`<div class="panel"><h2>Stores added here</h2><table>${custom.map(([k,v])=>`<tr><td><b>${escapeHtml(v.name)}</b><br><small class="note">${escapeHtml((v.units||[]).map(x=>x.replace(':',' · ')).join(', '))}</small></td><td style="text-align:right"><button class="btn sm" data-rmstore="${k}">Remove</button></td></tr>`).join('')}</table></div>`:''}
  </div></div>`;
  const $=id=>el.querySelector('#'+id);
  const read=()=>{D.name=$('nsName').value.trim();D.cat=$('nsCat').value;D.desc=$('nsDesc').value.trim();D.open=$('nsOpen').value;D.close=$('nsClose').value;D.ads=$('nsAds').checked;
    if(D.ads&&$('nsFree')){R.freeAds=Math.max(0,parseInt($('nsFree').value,10)||0);R.maxAds=Math.max(R.freeAds,parseInt($('nsMax').value,10)||0);R.extraPrice=Math.max(0,parseInt($('nsPrice').value,10)||0);R.autoApprove=$('nsAuto').checked;}};
  const again=()=>{read();aAddStore(el);};
  $('nsBack').onclick=()=>{AEDIT=null;aAddStore.d=null;renderAdmin();};
  el.querySelectorAll('[data-u]').forEach(x=>x.onclick=()=>{read();const k=x.dataset.u;D.units=D.units.includes(k)?D.units.filter(v=>v!==k):D.units.concat([k]);aAddStore(el);});
  $('nsAds').onchange=again;
  if(D.ads){el.querySelectorAll('#nsK [data-k]').forEach(x=>x.onclick=()=>{read();const k=x.dataset.k;if(k==='*')R.kiosks=['*'];else{let l=(R.kiosks||[]).filter(v=>v!=='*');l=l.includes(k)?l.filter(v=>v!==k):l.concat([k]);R.kiosks=l.length?l:['*'];}aAddStore(el);});
    wireSlotRows($('nsSlots'),R.slots,again);
    $('nsFind').onclick=()=>{read();const secs=Math.max(3,parseInt($('nsSecs').value,10)||6),hours=Math.max(1,parseFloat($('nsHours').value)||3);
      const res=AdSched.suggest(Object.assign({},INFO.adrules,{__new:{enabled:true,kiosks:R.kiosks,slots:R.slots}}),kiosksOfRule(R),{secs,hours,open:mallOpen(),close:mallClose()});
      $('nsSugg').innerHTML=suggestHTML(res,secs);$('nsSugg').querySelectorAll('[data-use]').forEach(x=>x.onclick=()=>{const [f,t]=x.dataset.use.split('|');R.slots.push({id:newId('sl'),from:f,to:t,secs,days:[]});aAddStore(el);});};}
  el.querySelectorAll('[data-rmstore]').forEach(x=>x.onclick=()=>{const k=x.dataset.rmstore;confirmBox(`Remove ${INFO.stores[k].name}?`,'It disappears from the map, search and the kiosks, and its unit shows as empty again.','Remove store',async()=>{await delDoc('stores',k,true);if(INFO.adrules[k])await delDoc('adrules',k,true);toast('Store removed');});});
  $('nsSave').onclick=async()=>{read();const key=D.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'').slice(0,24);
    const msg=t=>{$('nsMsg').textContent=t;};
    if(!D.name)return msg('Give the store a name.');if(!key)return msg('Use letters or numbers in the name.');if(BRANDS[key])return msg(`${D.name} is already on the map.`);if(!D.units.length)return msg('Choose the unit the store is in.');
    if(D.ads){if(!R.slots.length)return msg('Add at least one time window, or switch "Give airtime" off.');
      if(slotBad(R,'__new').length)return msg('One window is overbooked or incomplete. Use a suggested slot or fewer seconds.');}
    const doc={custom:true,name:D.name,cat:D.cat,units:D.units,desc:D.desc,createdAt:new Date().toISOString(),by:me().name};if(D.open&&D.close)doc.hours={open:D.open,close:D.close};
    if(!await saveDoc('stores',key,doc,true))return;if(D.ads)await saveDoc('adrules',key,Object.assign({},R,{updatedAt:new Date().toISOString(),by:me().name}),true);
    toast(`${D.name} added${D.ads?' with its airtime':''}. It is on the map and in search now.`);aAddStore.d=null;AEDIT=key;renderAdmin();};
}

/* a yes/no box in the page (browser pop-ups are blocked inside claude.ai) */
function confirmBox(title,text,yes,fn){const m=modal(`<h3>${escapeHtml(title)}</h3><p class="note">${escapeHtml(text)}</p><div class="linkrow" style="justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn gold" id="cbYes">${escapeHtml(yes)}</button></div>`);
  m.querySelector('#cbYes').onclick=()=>{m.remove();fn();};}

/* ============================================================ summaries used on dashboards and the store page */
function storeAdsSummaryHTML(b){const r=ruleOf(b);const master=!isPortal()&&can('mall.ads');
  if(!r||r.enabled===false)return `<p class="note">${escapeHtml(bname(b))} has no kiosk airtime${r?' right now (switched off)':' yet'}.${master?'':' The mall team gives each store its time windows on the kiosk screens.'}</p>${master?`<button class="btn sm gold" data-go="ads" data-store="${b}">Give airtime</button>`:''}`;
  const al=AdSched.allowance(r,INFO.adcreatives,b),ks=kiosksOfRule(r),n=ks.reduce((t,k)=>t+AdSched.plays(r,k),0);
  const today=creativesOf(b).reduce((t,c)=>t+playsOf(c.id).today,0);
  return `${(r.slots||[]).map(s=>`<div class="airrow">${IC.clock}<div><b>${winLabel(s)}</b><span>${s.secs} s in every rotation · ${daysLabel(s.days)}</span></div></div>`).join('')}
    <div class="allow sm"><div><b>${ks.length}</b><span>kiosk${ks.length===1?'':'s'}</span></div><div><b>${n.toLocaleString('en-IN')}</b><span>plays a day</span></div><div><b>${today}</b><span>played today</span></div><div><b>${al.count}/${al.max}</b><span>ads (${al.free} free)</span></div></div>
    <button class="btn sm gold" data-go="${master?'ads':'myads'}"${master?` data-store="${b}"`:''}>${master?'Manage airtime':'Manage my ads'}</button>`;}
function adsOverviewHTML(){const all=Object.entries(INFO.adcreatives);const live=all.filter(([,c])=>c.status==='live').length,pend=all.filter(([,c])=>c.status==='pending').length;
  const plays=all.reduce((n,[id])=>n+playsOf(id).today,0);const now=new Date();
  const on=[...new Set(kioskList().filter(k=>k.active!==false).flatMap(k=>AdSched.activeSlots(INFO.adrules,k.id,now).map(x=>x.brand)))];
  return `<div class="panel"><h2>Kiosk ads<button class="btn sm sp" data-go="ads">Open</button></h2>
    <div class="allow sm"><div><b>${live}</b><span>ads live</span></div><div><b>${pend}</b><span>to approve</span></div><div><b>${plays}</b><span>plays today</span></div><div><b>${on.length}</b><span>stores on air</span></div></div>
    <p class="note">${on.length?'On the screens now: '+on.map(x=>escapeHtml(bname(x))).join(', '):'No store airtime is running at this hour.'}</p></div>`;}

/* ============================================================ store portal: the store's own dashboard */
function aPortalHome(el){const b=me().store;if(!b||!BRANDS[b]){el.innerHTML='<div class="panel"><p class="note">Your account is not linked to a store yet. Ask the mall team.</p></div>';return;}
  const B=BRANDS[b],st=S(b),food=B.cat==='food',stats=INFO.stats[b]||{},w=food?waitView(b,true):null,wo=waitOf(b);
  const h=new Date().getHours(),hello=h<12?'Good morning':h<17?'Good afternoon':'Good evening';const r=ruleOf(b);
  const tiles=[food&&can('rest.wait',b)?['waits',IC.clock,'Update the wait time',w?'Now: '+w.t:'Not set yet']:null,
    ['stores',IC.star,"Today's specials",(st.specials||[]).length?(st.specials||[]).length+' on your card':'Add what is special today'],
    ['stores',IC.tag,'Add an offer',liveOffers(b).length?liveOffers(b).length+' live now':'No live offers'],
    can('store.ads',b)?['myads',IC.ads,'Make a kiosk ad',r&&r.enabled!==false?(n=>n===1?'1 free ad left':n+' free ads left')(AdSched.allowance(r,INFO.adcreatives,b).freeLeft):'Ask the mall for airtime']:null].filter(Boolean);
  el.innerHTML=`<div class="hello"><small>${hello}</small><h2>${escapeHtml(B.name)}</h2><span>${escapeHtml(CATS[B.cat].name)} · ${unitText(b)}</span></div>
    <div class="a-grid"><div class="kpi"><small>Directions to you today</small><b>${stats.day===todayISO()?stats.today||0:0}</b></div><div class="kpi"><small>Directions in all</small><b>${stats.directions||0}</b></div>
      <div class="kpi"><small>${food?'Wait time now':'Live offers'}</small><b>${food?(w?w.t:'—'):liveOffers(b).length}</b>${food&&wo&&wo.updatedAt?`<span class="kpi-sub">updated ${ago(wo.updatedAt)}</span>`:''}</div>
      <div class="kpi"><small>Your ads played today</small><b>${creativesOf(b).reduce((t,c)=>t+playsOf(c.id).today,0)}</b></div></div>
    <div class="two"><div>
      <div class="panel"><h2>Quick updates</h2><div class="tiles">${tiles.map(([go,ic,t,sub])=>`<button class="tile" data-go="${go}">${ic}<b>${t}</b><span>${escapeHtml(sub)}</span></button>`).join('')}</div></div>
      <div class="panel"><h2>What visitors see now</h2><p class="note">Your store card on the kiosks and in the app.</p><div class="cardprev">${liveHTML(b)||'<p class="note">Nothing live right now. Add today\'s specials or an offer and it shows here, under “Live now”.</p>'}</div></div>
    </div><div>
      <div class="panel"><h2>Your kiosk airtime</h2>${storeAdsSummaryHTML(b)}</div>
      ${r&&r.enabled!==false?`<div class="panel"><h2>Today on the kiosks${tlLegend(b)}</h2>${kiosksOfRule(r).map(k=>timelineHTML(k,b)).join('')}</div>`:''}
    </div></div>`;
  el.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>{ASEC=x.dataset.go;renderAdmin();});}
