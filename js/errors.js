/* ============================================================
   ERRORS: loads first. Everything that goes wrong is logged here (and kept for the
   admin hub's Settings page) instead of leaving a public screen broken.
   A locked kiosk (?lock=1) recovers on its own: it reloads after a burst of errors,
   and once a night at 4 AM to start the day fresh.
   ============================================================ */
const ERRLOG=[];
function reportError(e,where){
  const msg=String((e&&(e.message||e.reason))||e||'Unknown error');
  const entry={at:new Date().toISOString(),where:where||'app',msg:msg.slice(0,300),stack:String(e&&e.stack||'').split('\n').slice(0,4).join('\n')};
  ERRLOG.push(entry);if(ERRLOG.length>40)ERRLOG.shift();
  try{const k='ireo.errors';const old=JSON.parse(localStorage.getItem(k)||'[]');old.push(entry);localStorage.setItem(k,JSON.stringify(old.slice(-20)));}catch(_){}
  console.error('['+entry.where+']',e);
  watchdog();
}
function recentErrors(){try{return JSON.parse(localStorage.getItem('ireo.errors')||'[]');}catch(_){return ERRLOG.slice();}}
function clearErrors(){ERRLOG.length=0;try{localStorage.removeItem('ireo.errors');}catch(_){}}
window.addEventListener('error',e=>{
  if(e.target&&e.target!==window&&(e.target.src||e.target.href)){console.warn('Could not load',e.target.src||e.target.href);return;}   // a script, image or video that failed to load
  reportError(e.error||e.message,'page');},true);
window.addEventListener('unhandledrejection',e=>reportError(e.reason,'promise'));
let burst=[];
function watchdog(){
  if(new URLSearchParams(location.search).get('lock')!=='1')return;
  const now=Date.now();burst=burst.filter(t=>now-t<60000);burst.push(now);
  let last=0;try{last=+sessionStorage.getItem('ireo.recovered')||0;}catch(_){}
  if(burst.length>=15&&now-last>300000){try{sessionStorage.setItem('ireo.recovered',String(now));}catch(_){}location.reload();}   // at most once every 5 minutes
}
(function nightly(){if(new URLSearchParams(location.search).get('lock')!=='1')return;
  const n=new Date(),t=new Date(n);t.setHours(4,0,0,0);if(t<=n)t.setDate(t.getDate()+1);setTimeout(()=>location.reload(),t-n);})();
