/* Festive looks: the admin hub (Settings -> Festive look) dresses the kiosks and the phone app for a festival, the
   way shopping apps change for Diwali or Christmas. A look is a set of brand colours (the same CSS variables the
   whole app is built on) plus a small greeting with its own motif. The admin hub itself keeps the standard look.
   settings.theme = {key, greet, until}: greet replaces the look's own greeting, until (YYYY-MM-DD) ends it by itself. */
const THEMES={
  standard:{name:'Standard',greet:''},
  diwali:{name:'Diwali',greet:'Happy Diwali',motif:'diya',c:['#4A1530','#6B2245','#F7ECEF','#E08A1E','#F6C36A','#FDF1DF']},
  holi:{name:'Holi',greet:'Happy Holi',motif:'splash',c:['#3B1F6B','#55308F','#EFEAF8','#E83E8C','#F79BC4','#FDE8F2']},
  eid:{name:'Eid',greet:'Eid Mubarak',motif:'moon',c:['#0E4A47','#16655F','#E5F2F0','#C99A2E','#E9C97A','#FBF3DF']},
  christmas:{name:'Christmas',greet:'Merry Christmas',motif:'star',c:['#14472F','#1F6343','#E8F2EC','#C8202F','#F08A93','#FBE7E9']},
  newyear:{name:'New Year',greet:'Happy New Year',motif:'spark',c:['#111827','#1F2937','#EEF0F3','#C9A227','#E8CF74','#FAF4DE']},
  national:{name:'Independence & Republic Day',greet:'Happy Independence Day',motif:'kite',c:['#12306B','#1C428C','#E8EDF6','#E9761A','#F9B676','#FEF0E3']}};
const THEME_VARS=['--green','--green2','--green3','--gold','--gold2','--goldbg'];
const MOTIFS={
  diya:'<path d="M3 13h18c-1 4.2-4.6 6.4-9 6.4S4 17.2 3 13z" fill="currentColor"/><path d="M12 3.2c1.8 2.2 2.4 3.9 2.4 5.2a2.4 2.4 0 0 1-4.8 0c0-1.3.6-3 2.4-5.2z" fill="var(--fx2)"/>',
  splash:'<circle cx="7" cy="9" r="3.4" fill="var(--fx2)"/><circle cx="15.5" cy="7.5" r="2.6" fill="currentColor"/><circle cx="16" cy="15.5" r="3.6" fill="var(--fx3)"/><circle cx="8" cy="17" r="2" fill="currentColor"/>',
  moon:'<path d="M14.6 3.6a8.4 8.4 0 1 0 5.8 13.4A7 7 0 0 1 14.6 3.6z" fill="currentColor"/><path d="m18.6 6.2.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" fill="var(--fx2)"/>',
  star:'<path d="m12 2.8 2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z" fill="var(--fx2)"/><circle cx="12" cy="12.4" r="1.6" fill="currentColor"/>',
  spark:'<path d="M12 2.6 13.6 10.4 21.4 12l-7.8 1.6L12 21.4l-1.6-7.8L2.6 12l7.8-1.6z" fill="var(--fx2)"/><circle cx="19" cy="5" r="1.3" fill="currentColor"/><circle cx="5" cy="19" r="1.1" fill="currentColor"/>',
  kite:'<path d="M12 2.6 19.4 10 12 17.4 4.6 10z" fill="var(--fx2)"/><path d="M12 2.6 19.4 10H4.6z" fill="currentColor" opacity=".9"/><path d="M12 17.4c-.6 2-2.2 3-4 3.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'};
function themeConf(){const t=(typeof INFO!=='undefined'&&INFO.settings&&INFO.settings.theme)||{};const key=THEMES[t.key]?t.key:'standard';
  const ended=t.until&&/^\d{4}-\d{2}-\d{2}$/.test(t.until)&&Date.now()>Date.parse(t.until+'T23:59:59');
  return ended?{key:'standard',greet:''}:{key,greet:String(t.greet||'').trim().slice(0,40)||THEMES[key].greet};}
function motifSVG(k){return MOTIFS[k]?`<svg viewBox="0 0 24 24" aria-hidden="true">${MOTIFS[k]}</svg>`:'';}
/* the greeting strip: under the phone's header and in the kiosk's header */
function festHTML(){const t=themeConf(),th=THEMES[t.key];if(t.key==='standard'||!t.greet)return '';
  return `<div class="fest" data-motif="${th.motif}">${motifSVG(th.motif)}<span>${escapeHtml(T(t.greet))}</span>${motifSVG(th.motif)}</div>`;}
let THEME_ON='';
function applyTheme(force){const t=themeConf(),th=THEMES[t.key],sig=t.key+'|'+t.greet+'|'+(typeof LANG!=='undefined'?LANG:'');if(sig===THEME_ON&&!force)return;THEME_ON=sig;
  for(const id of ['kiosk','app']){const el=document.getElementById(id);if(!el)continue;
    THEME_VARS.forEach((v,i)=>{if(th.c)el.style.setProperty(v,th.c[i]);else el.style.removeProperty(v);});
    el.dataset.theme=t.key;}
  document.body.dataset.theme=t.key;
  const tc=document.querySelector('meta[name="theme-color"]');if(tc&&VIEW!=='admin')tc.content=th.c?th.c[0]:'#1E2551';
  for(const host of document.querySelectorAll('.p-head,.k-head')){let f=host.querySelector(':scope>.fest-slot');
    if(!f){f=document.createElement('div');f.className='fest-slot';host.insertBefore(f,host.querySelector(':scope>.k-clock'));}
    f.innerHTML=festHTML();}}
