/* ============================================================
   MEMBERS: the phone app's sign-in and everything that is only for members.
   A member signs in with a mobile number and a one-time code (server.js, /api/member/*). What members get:
   - a member card (number, barcode, points) on the Account tab
   - members-only offers: an offer a store marks "members only" is a locked teaser for everyone else
   - their stores: a heart on any store saves it; saved stores sit on Home and on the Account tab
   - points: the balance and what it was for (the mall's team adds them in the admin hub)
   - their language and step-free choice, remembered on any phone they sign in on
   - find my car: where they parked in the basement (level and pillar or bay), saved by hand or by scanning the QR code
     on a pillar (?park=B1-P23), and a route back to it: to a lift that goes down to parking, then the pillar
   The kiosk is never signed in. Without the live server (the one-file build) there is no membership, and the
   Account tab keeps only the settings.
   ============================================================ */
const Member={me:null,booted:false,pollT:null,
  /* is a member signed in on this phone? (only ever true in the phone app) */
  get on(){return !!this.me&&VIEW==='app';},
  get can(){return DBKIND==='server';},
  get token(){try{return localStorage.getItem('ireo.member')||'';}catch(e){return '';}},
  set token(v){try{if(v)localStorage.setItem('ireo.member',v);else localStorage.removeItem('ireo.member');}catch(e){}},
  async call(path,method,body){const h={};if(body)h['Content-Type']='application/json';if(this.token)h.Authorization='Bearer '+this.token;
    let r;try{r=await fetch('api/member/'+path,{method:method||'GET',headers:h,body:body?JSON.stringify(body):undefined,cache:'no-store'});}
    catch(e){throw Object.assign(new Error(T('No connection. Check the internet and try again.')),{status:0});}
    let j=null;try{j=await r.json();}catch(e){}
    if(!r.ok||!j||!j.ok)throw Object.assign(new Error(T((j&&j.error)||'Something went wrong. Try again.')),{status:r.status});
    return j;},
  /* who is signed in on this phone (called at start-up, and every so often so points added by the mall show up) */
  async boot(){if(this.booted||DBKIND==='none')return;this.booted=true;await this.load();parkFromLink();},   // once the app knows whether it has a server
  async load(){if(!this.can||!this.token)return;
    try{const j=await this.call('me');this.adopt(j.member,false);}catch(e){if(e.status===401){this.token='';this.me=null;memberChanged();}}},
  adopt(m,fresh){const was=this.me;this.me=m;
    if(fresh&&m.prefs){if(m.prefs.lang&&m.prefs.lang!==LANG)setLang(m.prefs.lang,true);if(typeof m.prefs.stepFree==='boolean')state.stepFree=m.prefs.stepFree;}
    if(fresh)setTimeout(parkFromLink,0);
    if(!was||JSON.stringify(was)!==JSON.stringify(m))memberChanged();
    clearInterval(this.pollT);this.pollT=setInterval(()=>{if(VIEW==='app'&&!document.hidden&&this.me)this.load();},20000);},
  async save(patch){if(!this.me)return;Object.assign(this.me,patch);memberChanged();
    try{const j=await this.call('me','PUT',patch);this.me=j.member;memberChanged();}catch(e){toast(e.message);if(e.status===401){this.token='';this.me=null;memberChanged();}}},
  isFav(b){return !!(this.me&&(this.me.favs||[]).includes(b));},
  toggleFav(b){if(!this.on){signInSheet(T('Sign in to save your stores'));return;}
    const favs=(this.me.favs||[]).filter(x=>x!==b);if(!this.isFav(b))favs.unshift(b);this.save({favs});},
  prefs(){if(this.me)this.save({prefs:{lang:LANG,stepFree:!!state.stepFree}});},
  async signOut(){try{await this.call('logout','POST');}catch(e){}this.token='';this.me=null;clearInterval(this.pollT);memberChanged();toast(T('You are signed out'));}
};
/* a member's offers are unlocked for them; for everyone else (and on the kiosk) they are a locked teaser */
const offerLocked=o=>!!(o&&o.members)&&!Member.on;
const offerTitle=o=>offerLocked(o)?T('Members-only offer'):tc(o.title);
function memberOffers(){return allOffers().filter(o=>o.members);}
function memberChanged(){if(!window.APP_READY)return;if(VIEW==='admin')return;renderQuick();renderPanels();}
const firstName=()=>Member.me&&Member.me.name?Member.me.name.split(/\s+/)[0]:'';
const memberNo=id=>String(id).replace(/^(\d{4})(\d{3})(\d{3})$/,'$1 $2 $3');

/* ---------------- the member card ---------------- */
function barcodeSVG(digits){const bars=itfBars(digits);if(!bars.length)return '';let x=0,h='';bars.forEach(([on,w])=>{if(on)h+=`<rect x="${x}" y="0" width="${w}" height="40"/>`;x+=w;});
  return `<svg class="m-bars" viewBox="0 0 ${x} 40" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(T('Member number {n}',{n:digits}))}">${h}</svg>`;}
const sinceText=m=>{const d=new Date(m.joined);return isNaN(d)?'':d.toLocaleDateString(locale(),{month:'short',year:'numeric'});};
function memberCardHTML(){const m=Member.me;
  return `<button class="m-card" data-act="showcard" aria-label="${T('Show my member card')}"><span class="m-card-top"><img src="${LOGO_W}" alt="Wayezy"><span class="m-tier">${T('Member')}</span></span>
    <span class="m-card-mid"><b class="m-name">${escapeHtml(m.name||T('Member'))}</b><span class="m-no">${memberNo(m.id)}</span></span>
    <span class="m-card-foot"><span><small>${T('Points')}</small><b>${(m.points||0).toLocaleString(locale())}</b></span><span><small>${T('Member since')}</small><b>${sinceText(m)}</b></span></span></button>`;}
/* the card full size, to show at a counter */
function showCardSheet(){const m=Member.me;if(!m)return;const s=modal(`<div class="sheet-body m-show"><small>${T('Show this at the counter')}</small><b class="m-show-name">${escapeHtml(m.name||T('Member'))}</b>
    <div class="m-code">${barcodeSVG(m.id)}<span>${memberNo(m.id)}</span></div>
    <div class="m-show-foot"><span>${T('Points')} <b>${(m.points||0).toLocaleString(locale())}</b></span><span>${T('Member since')} <b>${sinceText(m)}</b></span></div><button class="btn wide" data-close>${T('Done')}</button></div>`);
  s.classList.add('sheet');}
const BENEFITS=[['lock','Members-only offers','Offers from the stores that only members can use.'],['heart','Your stores','Save the stores you like and get to them in one tap.'],
  ['car','Find my car','Save where you parked in the basement, and get taken back to it.'],
  ['star','Points','Your points and what they were for, in one place.'],['lang','Remembered for you','Your language and step-free choice, on any phone you sign in on.']];
const benefitsHTML=()=>`<div class="m-list">${BENEFITS.map(([ic,t,d])=>`<div class="m-row"><i>${IC[ic]}</i><div><b>${T(t)}</b><span>${T(d)}</span></div></div>`).join('')}</div>`;
function prefsHTML(){const sw=(act,on,label,ic)=>`<button class="m-row sw" data-act="${act}" role="switch" aria-checked="${!!on}"><i>${IC[ic]}</i><div><b>${T(label)}</b></div><em></em></button>`;
  return `<div class="m-list"><div class="m-row"><i>${IC.lang}</i><div><b>${T('Language')}</b></div><div class="seg" role="group"><button data-setlang="en" aria-pressed="${LANG==='en'}" lang="en">English</button><button data-setlang="hi" aria-pressed="${LANG==='hi'}" lang="hi">हिन्दी</button></div></div>
    ${sw('stepfree',state.stepFree,'Step-free routes','access')}${typeof Voice!=='undefined'&&Voice.supported?sw('voice',Voice.on,'Spoken directions','sound'):''}${sw('mode',MODE==='evening','Evening map','clock')}
    <button class="m-row" data-act="help"><i>${IC.phone}</i><div><b>${T('Help desk')}</b></div>${IC.chev}</button></div>`;}
/* the Account tab */
function accountHTML(){const m=Member.me;
  if(!Member.can)return `<div class="p-page"><h2>${T('Account')}</h2><p>${T('Membership needs a connection to the mall. Your settings are below.')}</p></div><div class="sec-title"><h3>${T('Settings')}</h3></div>${prefsHTML()}`;
  if(!m)return `<div class="m-hero"><small>${T('Membership')}</small><h2>${T('Get more from every visit')}</h2><p>${T('Join in a minute with your mobile number.')}</p><button class="btn gold" data-act="signin">${T('Sign in or join')}</button></div>
    <div class="sec-title"><h3>${T('What members get')}</h3></div>${benefitsHTML()}<div class="sec-title"><h3>${T('Settings')}</h3></div>${prefsHTML()}`;
  const favs=(m.favs||[]).filter(isBrand),mo=memberOffers(),log=m.log||[];
  return `<div class="m-hello"><b class="avatar big">${escapeHtml((firstName()||'M')[0].toUpperCase())}</b><div><small>${T('Hello')}</small><b>${escapeHtml(firstName()||T('Member'))}</b></div></div>
    ${memberCardHTML()}
    <div class="m-actions"><button data-act="showcard"><i>${IC.user}</i><span>${T('Show card')}</span></button><button data-act="car"><i>${IC.car}</i><span>${T('Find my car')}</span></button><button data-act="favs"><i>${IC.heart}</i><span>${T('Saved stores')}</span><em>${favs.length||''}</em></button></div>
    <div class="sec-title"><h3>${T('Your car')}</h3></div>${carCardHTML()}
    ${mo.length?`<div class="sec-title"><h3>${T('Just for members')}</h3></div>${mo.map(offerCardHTML).join('')}`:''}
    <div class="sec-title" id="mFavs"><h3>${T('Your stores')}</h3></div>${favs.length?favs.map(b=>itemHTML(b)).join(''):`<p class="empty">${T('Tap the heart on any store to keep it here.')}</p>`}
    <div class="sec-title"><h3>${T('Points')}</h3></div>${log.length?`<div class="m-list">${log.map(l=>`<div class="m-row"><i class="${l.points<0?'neg':'pos'}">${l.points>0?'+':''}${l.points}</i><div><b>${escapeHtml(l.note||T(l.points<0?'Points used':'Points added'))}</b><span>${escapeHtml(new Date(l.at).toLocaleDateString(locale(),{day:'numeric',month:'short',year:'numeric'}))}</span></div></div>`).join('')}</div>`:`<p class="empty">${T('Points the mall adds for you will show here.')}</p>`}
    <div class="sec-title"><h3>${T('Settings')}</h3></div>${prefsHTML()}
    <div class="m-out"><button class="btn" data-act="editname">${T('Change name')}</button><button class="btn" data-act="signout">${T('Sign out')}</button></div>
    <p class="m-id">${escapeHtml(m.phone)}</p>`;}

/* ---------------- signing in: number, code, (first time) name ---------------- */
function signInSheet(why){if(!Member.can){toast(T('Membership needs a connection to the mall.'));return;}
  if(document.querySelector('.modal.sheet'))return;let phone='';
  const m=modal('<div class="sheet-body"></div>');m.classList.add('sheet');const box=m.querySelector('.sheet-body');
  const err=t=>{const e=box.querySelector('.m-err');if(e){e.textContent=t||'';e.hidden=!t;}};
  const busy=(b,on)=>{b.disabled=on;b.classList.toggle('busy',on);};
  const stepPhone=()=>{box.innerHTML=`<h3>${T(why||'Sign in or join')}</h3><p class="note">${T('Enter your mobile number. We will text you a 6-digit code.')}</p>
      <label class="m-field"><span>+91</span><input id="mPhone" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="12" placeholder="98765 43210" aria-label="${T('Mobile number')}"></label>
      <p class="m-err" role="alert" hidden></p><button class="btn gold wide" id="mGo">${T('Send code')}</button><p class="note small">${T('Your number is used only to sign you in.')}</p><button class="linkbtn" data-close>${T('Not now')}</button>`;
    const inp=box.querySelector('#mPhone'),go=box.querySelector('#mGo');inp.value=phone;setTimeout(()=>inp.focus(),60);
    const send=async()=>{phone=inp.value;if(phone.replace(/\D/g,'').length<10){err(T('Enter a 10-digit mobile number.'));return;}err('');busy(go,true);
      try{const j=await Member.call('start','POST',{phone});stepCode(j.demo?j.code:null);}catch(e){err(e.message);busy(go,false);}};
    go.onclick=send;inp.onkeydown=e=>{if(e.key==='Enter')send();};};
  const stepCode=demo=>{box.innerHTML=`<h3>${T('Enter the code')}</h3><p class="note">${T('Sent to +91 {n}',{n:escapeHtml(phone.replace(/\D/g,'').slice(-10).replace(/(\d{5})(\d{5})/,'$1 $2'))})}</p>
      ${demo?`<div class="m-demo"><b>${T('Demo mode')}</b> ${T('No SMS service is connected yet, so here is your code:')} <strong>${demo}</strong></div>`:''}
      <input id="mCode" class="m-codein" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${T('6-digit code')}">
      <p class="m-err" role="alert" hidden></p><button class="btn gold wide" id="mOk">${T('Sign in')}</button><button class="linkbtn" id="mBack">${T('Use a different number')}</button>`;
    const inp=box.querySelector('#mCode'),ok=box.querySelector('#mOk');setTimeout(()=>inp.focus(),60);
    const verify=async()=>{const code=inp.value.replace(/\D/g,'');if(code.length!==6){err(T('Enter the 6-digit code.'));return;}err('');busy(ok,true);
      try{const j=await Member.call('verify','POST',{phone,code});Member.token=j.token;Member.adopt(j.member,true);
        if(j.isNew||!j.member.name)stepName(true);else{m.remove();toast(T('Welcome back, {name}',{name:firstName()||T('Member')}));goAccount();}}
      catch(e){err(e.message);busy(ok,false);inp.select();}};
    ok.onclick=verify;inp.oninput=()=>{inp.value=inp.value.replace(/\D/g,'').slice(0,6);if(inp.value.length===6)verify();};box.querySelector('#mBack').onclick=stepPhone;};
  const stepName=isNew=>{box.innerHTML=`<h3>${T(isNew?'Welcome! What is your name?':'Your name')}</h3><p class="note">${T('It goes on your member card.')}</p>
      <label class="m-field"><input id="mName" type="text" autocomplete="name" maxlength="40" aria-label="${T('Your name')}" value="${escapeHtml((Member.me&&Member.me.name)||'')}"></label>
      <p class="m-err" role="alert" hidden></p><button class="btn gold wide" id="mSave">${T('Save')}</button>${isNew?`<button class="linkbtn" data-close>${T('Skip for now')}</button>`:''}`;
    const inp=box.querySelector('#mName'),sv=box.querySelector('#mSave');setTimeout(()=>inp.focus(),60);
    const save=async()=>{const name=inp.value.trim();if(!name){err(T('Enter your name.'));return;}busy(sv,true);await Member.save({name,prefs:{lang:LANG,stepFree:!!state.stepFree}});m.remove();if(isNew){toast(T('You are a member now. Welcome!'));goAccount();}};
    sv.onclick=save;inp.onkeydown=e=>{if(e.key==='Enter')save();};};
  if(why==='__name')stepName(false);else stepPhone();}
function goAccount(){if(VIEW!=='app')return;if(typeof RM!=='undefined'&&RM.on)return;PTAB='me';setMapFull(false);renderQuick();renderPanels();document.getElementById('pScroll').scrollTop=0;}

/* ---------------- find my car (members only) ----------------
   The basement levels and the lifts that go down to parking are set in the admin hub (Settings -> Parking). The car is
   saved as a level and a pillar or bay; "Find my car" walks the member to the nearest of those lifts and tells them the
   level and the pillar. Once the basement floor plans are traced into the map, the last stretch can be drawn too. */
function parkingConf(){const p=INFO.settings.parking||{},all=CONNECTORS.filter(c=>c.type==='lift').map(c=>c.id);
  const lifts=(Array.isArray(p.lifts)?p.lifts:[]).filter(id=>all.includes(id));
  return {levels:(Array.isArray(p.levels)&&p.levels.length?p.levels:['B1']).map(l=>String(l).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4)).filter(Boolean).slice(0,6),lifts:lifts.length?lifts:all};}
function carCardHTML(){const c=Member.me&&Member.me.car;
  if(!c)return `<button class="m-park" data-act="park"><i>${IC.car}</i><div><b>${T('Parked in the basement?')}</b><span>${T('Save your spot, and the app takes you back to it.')}</span></div>${IC.chev}</button>`;
  return `<div class="m-car"><div class="m-car-top"><i>${IC.car}</i><div><small>${T('Your car')}</small><b>${escapeHtml(c.level)} · ${escapeHtml(c.spot)}</b>${c.note?`<span>${escapeHtml(c.note)}</span>`:''}</div>${c.at?`<em>${escapeHtml(T('Saved {ago}',{ago:ago(c.at)}))}</em>`:''}</div>
    <div class="m-car-btns"><button class="btn gold" data-act="findcar">${IC.nav}<span>${T('Find my car')}</span></button><button class="btn" data-act="park">${T('Change')}</button><button class="btn" data-act="clearcar">${T('Car collected')}</button></div></div>`;}
function parkSheet(){if(!Member.on){signInSheet('Sign in to save where you parked');return;}
  if(document.querySelector('.modal.sheet'))return;const conf=parkingConf(),c=Member.me.car||{};let level=conf.levels.includes(c.level)?c.level:conf.levels[0];
  const m=modal(`<div class="sheet-body"><h3>${T('Where did you park?')}</h3><p class="note">${T('Choose the level, then the pillar or bay number nearest your car.')}</p>
    <div class="seg wide" role="group" aria-label="${T('Level')}" style="margin-top:16px">${conf.levels.map(l=>`<button data-lv="${escapeHtml(l)}" aria-pressed="${l===level}">${escapeHtml(l)}</button>`).join('')}</div>
    <label class="m-field"><span>${IC.car}</span><input id="pkSpot" maxlength="16" autocapitalize="characters" placeholder="${T('Pillar or bay, e.g. P-23')}" aria-label="${T('Pillar or bay number')}" value="${escapeHtml(c.spot||'')}"></label>
    <label class="m-field"><input id="pkNote" maxlength="60" placeholder="${T('A note, if you like (near the ramp…)')}" aria-label="${T('Note')}" value="${escapeHtml(c.note||'')}"></label>
    <p class="m-err" role="alert" hidden></p><button class="btn gold wide" id="pkSave">${T('Save my spot')}</button><p class="note small">${T('Tip: scan the QR code on the pillar to save it in one go.')}</p><button class="linkbtn" data-close>${T('Not now')}</button></div>`);
  m.classList.add('sheet');
  m.querySelectorAll('[data-lv]').forEach(b=>b.onclick=()=>{level=b.dataset.lv;m.querySelectorAll('[data-lv]').forEach(x=>x.setAttribute('aria-pressed',x===b));});
  const spot=m.querySelector('#pkSpot');setTimeout(()=>spot.focus(),60);
  const save=async()=>{const sp=spot.value.trim();if(!sp){const e=m.querySelector('.m-err');e.textContent=T('Enter the pillar or bay number.');e.hidden=false;return;}
    await Member.save({car:{level,spot:sp,note:m.querySelector('#pkNote').value.trim()}});m.remove();toast(T('Parking spot saved: {level} · {spot}',{level,spot:sp}));};
  m.querySelector('#pkSave').onclick=save;spot.onkeydown=e=>{if(e.key==='Enter')save();};}
/* the route back: to the nearest lift that goes down to parking; the last step names the level and the pillar */
function findMyCar(){const c=Member.me&&Member.me.car;if(!Member.on||!c){parkSheet();return;}
  const ids=[];parkingConf().lifts.forEach(id=>{const k=CONNECTORS.find(x=>x.id===id);if(k)for(const f in k.at)ids.push('c:'+id+':'+f);});
  if(VIEW==='app'){PTAB='home';setMapFull(false);}
  routeToPois(ids,{kind:'car',ids,title:'Your car',car:c});if(VIEW==='app')document.getElementById('pScroll').scrollTop=0;}
/* what the last step says on the way to the car */
function carStep(r,c){const p=POIS[r.target],lift=p&&p.conn?tr(p.conn.name):T('the lift'),v={lift,level:c.level,spot:c.spot};
  return {ic:'lift',t:T('Take {lift} down to {level}. Your car is at {spot}.',v),say:T('Take {lift} down to {level}. Your car is at {spot}.',v)};}
/* a pillar's QR code opens the app with ?park=B1-P23: saved straight away for a member, after signing in for anyone else */
function parkFromLink(){let v=QS.get('park');try{v=v||sessionStorage.getItem('ireo.park');}catch(e){}if(!v||VIEW!=='app')return;
  const m=/^([A-Za-z0-9]{1,4})[-:_ ]+(.{1,16})$/.exec(String(v).trim());if(!m)return;
  if(QS.get('park')){try{const u=new URL(location.href);u.searchParams.delete('park');history.replaceState(null,'',u);QS.delete('park');}catch(e){}}
  if(!Member.on){try{sessionStorage.setItem('ireo.park',v);}catch(e){}signInSheet('Sign in to save where you parked');return;}
  try{sessionStorage.removeItem('ireo.park');}catch(e){}
  const level=m[1].toUpperCase(),spot=m[2].trim().toUpperCase();Member.save({car:{level,spot,note:''}});toast(T('Parking spot saved: {level} · {spot}',{level,spot}),4200);}

