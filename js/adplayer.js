/* ============================================================
   KIOSK AD PLAYER: plays each store's airtime on this screen.
   Which kiosk this is: ?kiosk=K1 (default K1). The line-up comes from AdSched: the stores whose
   time window is open right now, each for the seconds it was given. When a window closes its ads
   drop out and the next window's ads come in by themselves: the player re-plans at every rotation
   and exactly at every window edge.
   Ads appear in two places: a sponsored card at the top of the kiosk panel, and full screen on the
   idle screen between plays of the film. Plays are counted per ad for the admin hub.
   ============================================================ */
const KIOSK_ID=((QS.get('kiosk')||'K1').replace(/[^\w-]/g,'').slice(0,20))||'K1';
const ADP={list:[],i:-1,loop:0,t:null,edgeT:null,plays:{},idleT:null};
function kioskConf(){return INFO.kiosks[KIOSK_ID]||{name:'This kiosk',loopSecs:60,active:true};}
function adsOn(){return (INFO.settings.mall||{}).adsEnabled!==false&&kioskConf().active!==false;}
function planAds(){ADP.list=adsOn()?AdSched.playlist(INFO.adrules,INFO.adcreatives,KIOSK_ID,new Date(),ADP.loop,kioskConf().loopSecs||60):[];}
function scheduleEdge(){clearTimeout(ADP.edgeT);const n=AdSched.nextChange(INFO.adrules,KIOSK_ID,new Date());
  if(n)ADP.edgeT=setTimeout(()=>{restartAds();},Math.max(1500,n-Date.now()+800));}
function restartAds(){clearTimeout(ADP.t);ADP.i=-1;ADP.loop++;planAds();scheduleEdge();nextAd();}
function nextAd(){clearTimeout(ADP.t);ADP.i++;
  if(ADP.i>=ADP.list.length){ADP.loop++;ADP.i=0;planAds();}
  const it=ADP.list[ADP.i];renderPanelAd(it);
  if(!it){ADP.t=setTimeout(nextAd,20000);return;}
  if(panelAdVisible())countPlay(it);
  ADP.t=setTimeout(nextAd,Math.max(3,it.secs)*1000);}
const panelAdVisible=()=>VIEW==='kiosk'&&!ATTRACT.on&&!document.getElementById('kAd').hidden&&!document.body.classList.contains('routing');
/* one ad, as a flat card: an uploaded image, or a store photo with the ad's words */
function adHTML(it,where){const c=it.creative,b=it.brand,B=BRANDS[b]||{name:b,cat:'other'};
  const img=c.kind==='image'?safeImg(c.media):'';const ph=!img&&c.photo&&PHOTOS[c.photo]?' ph ph-'+c.photo:'';
  const style=img?`background-image:url(${img})`:(ph?'':coverStyle(b)||'background:#1E2551');
  return `<div class="adc adc-${where}${img?' img':''}${ph}" style="${style}" data-b="${isBrand(b)?b:''}" role="button" tabindex="0" aria-label="${escapeHtml(B.name)}: ${escapeHtml(tc(c.title)||'')}">
    ${img?'':`<div class="adc-txt"><small>${escapeHtml(B.name)}</small><b>${escapeHtml(tc(c.title)||'')}</b>${c.sub?`<span>${escapeHtml(tc(c.sub))}</span>`:''}</div>`}
    <em class="adc-tag">${T('Sponsored')}</em><i class="adc-bar" style="animation-duration:${it.secs}s"></i></div>`;}
function renderPanelAd(it){const el=document.getElementById('kAd');if(!el)return;
  if(!it){el.innerHTML='';el.classList.add('empty');return;}el.classList.remove('empty');
  el.innerHTML=adHTML(it,'panel');const card=el.firstElementChild;
  const go=()=>{poke();if(isBrand(it.brand))selectBrand(it.brand);};card.onclick=go;card.onkeydown=e=>{if(e.key==='Enter')go();};}
/* idle screen: the ads running now, full screen, then the film, then the ads again (the map rests while an ad covers it) */
function playIdleAds(done){planAds();const items=ADP.list.slice();const el=document.getElementById('attractAd');
  if(!items.length||!el){done();return;}let i=0;
  const show=()=>{clearTimeout(ADP.idleT);if(!ATTRACT.on){el.hidden=true;ATTRACT.el.classList.remove('adshow');return;}
    if(i>=items.length){el.hidden=true;ATTRACT.el.classList.remove('adshow');done();return;}
    const it=items[i++];el.innerHTML=adHTML(it,'full');MAPR&&MAPR.pause(true);el.hidden=false;ATTRACT.el.classList.add('adshow');countPlay(it);
    ADP.idleT=setTimeout(show,Math.max(3,it.secs)*1000);};
  show();}
if(ATTRACT.vid)ATTRACT.vid.addEventListener('ended',()=>{if(!ATTRACT.on)return;
  playIdleAds(()=>{if(!ATTRACT.on)return;try{ATTRACT.vid.currentTime=0;ATTRACT.vid.play().catch(()=>{});}catch(e){}});});
/* without the film, the ads still come round every 40 seconds over the slowly turning map */
setInterval(()=>{if(ATTRACT.on&&!ATTRACT.el.classList.contains('film')&&!ATTRACT.el.classList.contains('adshow'))playIdleAds(()=>{if(ATTRACT.on&&MAPR)MAPR.pause(false);});},40000);
/* plays per ad per day, written once a minute (billing and proof of play) */
function countPlay(it){ADP.plays[it.creativeId]=(ADP.plays[it.creativeId]||0)+1;}
setInterval(()=>{if(!DBOK)return;const today=todayISO();
  for(const id in ADP.plays){const n=ADP.plays[id];if(!n)continue;const cur=INFO.adstats[id]||{};const c=INFO.adcreatives[id]||{};
    const next={brand:c.brand||cur.brand||'',total:(cur.total||0)+n,today:cur.day===today?(cur.today||0)+n:n,day:today,lastAt:new Date().toISOString(),kiosks:Object.assign({},cur.kiosks,{[KIOSK_ID]:((cur.kiosks||{})[KIOSK_ID]||0)+n})};
    INFO.adstats[id]=next;DB.doc('adstats/'+id).set(next).catch(e=>console.warn('adstats',e));}
  ADP.plays={};},60000);
/* re-plan whenever the schedule or the ads change in the admin hub */
let adPlanKey='';
function onAdsData(){const key=JSON.stringify([INFO.adrules,Object.keys(INFO.adcreatives).map(k=>k+INFO.adcreatives[k].status),INFO.kiosks[KIOSK_ID],(INFO.settings.mall||{}).adsEnabled]);
  if(key===adPlanKey)return;adPlanKey=key;restartAds();}
