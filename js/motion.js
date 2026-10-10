/* ============================================================
   MOTION: a selection glides to the next tab instead of jumping
   Each bar of buttons below (tabs, chips, floors, segmented controls, the admin menu) gets one ".glider" that
   slides and resizes to the selected button (aria-pressed="true"); styles.css draws it per bar ("Motion").
   Bars drawn again with innerHTML keep their place: the glider starts where the last one of the same bar stood.
   patchHTML() re-renders a bar in place when only its buttons' state changed, so their colours ease too.
   Pure DOM, no dependencies; glideAll() runs on its own after any change that could move a selection.
   ============================================================ */
const GLIDES=[            // [the bar, its items, the part of the selected item the glider covers]
  ['#viewswitch','button'],
  ['#kCats','.k-cat','i'],
  ['#kTabs','button'],
  ['#pChips','button'],
  ['#pTabs','button','i'],
  ['#floors','button:not(.stackbtn)'],
  ['.a-side','button[data-sec]'],
  ['.seg','button']];
const GLIDE_SEL=GLIDES.map(g=>g[0]).join(',');
const GLIDE_LAST={};      // per bar: where its glider stood, and which buttons the bar had
function glideBar(bar,item,part,key){
  if(!bar.getClientRects().length)return;                                 // not on screen: nothing to measure
  const items=[...bar.children].filter(c=>c.matches(item));
  const sig=items.map(c=>Object.values(c.dataset).join(',')||c.textContent.trim()).join('|');
  const on=items.find(c=>c.getAttribute('aria-pressed')==='true');
  let g=null;for(const c of bar.children)if(c.classList.contains('glider')){g=c;break;}
  const last=GLIDE_LAST[key];
  if(!on){if(g)g.style.opacity='0';bar.classList.remove('glide-on');return;}
  const t=part&&on.querySelector(part)||on;
  let x=0,y=0,n=t;while(n&&n!==bar){x+=n.offsetLeft;y+=n.offsetTop;n=n.offsetParent;}
  if(n!==bar){const r=t.getBoundingClientRect(),b=bar.getBoundingClientRect();x=r.left-b.left-bar.clientLeft+bar.scrollLeft;y=r.top-b.top-bar.clientTop+bar.scrollTop;}
  const box={x,y,w:t.offsetWidth,h:t.offsetHeight,sig};
  const put=(el,b)=>{el.style.transform=`translate(${b.x}px,${b.y}px)`;el.style.width=b.w+'px';el.style.height=b.h+'px';};
  if(!g){g=document.createElement('span');g.className='glider now';g.setAttribute('aria-hidden','true');bar.prepend(g);
    const from=last&&last.sig===sig?last:null;                // a bar drawn again: start from the old place
    put(g,from||box);if(!from)g.style.opacity='0';void g.offsetWidth;g.classList.remove('now');}   // a first selection fades in
  g.style.opacity='';put(g,box);bar.classList.add('glide-on');
  GLIDE_LAST[key]=box;}
function glideAll(snap){for(const [sel,item,part] of GLIDES){let i=0;for(const bar of document.querySelectorAll(sel)){
    const g=snap&&(snap===true||snap.has(bar))&&bar.querySelector(':scope>.glider');if(g)g.classList.add('now');
    glideBar(bar,item,part,sel+':'+(i++));
    if(g){void g.offsetWidth;g.classList.remove('now');}}}}
/* the window, the fonts or a bar itself changed size: put those gliders in place without a slide */
const glideSnap=bars=>glideAll(bars||true);
/* re-render a bar in place: same buttons in the same order -> update their attributes and insides only */
function patchHTML(el,html){
  const t=document.createElement('template');t.innerHTML=html;
  const nw=[...t.content.children],old=[...el.children].filter(c=>!c.classList.contains('glider'));
  if(nw.length!==old.length||nw.some((c,i)=>c.tagName!==old[i].tagName||c.className!==old[i].className)){el.innerHTML=html;return;}
  nw.forEach((c,i)=>{const o=old[i];
    for(const a of [...o.attributes])if(!c.hasAttribute(a.name))o.removeAttribute(a.name);
    for(const a of [...c.attributes])if(o.getAttribute(a.name)!==a.value)o.setAttribute(a.name,a.value);
    if(o.innerHTML!==c.innerHTML)o.innerHTML=c.innerHTML;});}
/* run fn just after the next frame is on screen: a tap's quick answer (the glider) shows before its heavier work */
const afterPaint=fn=>requestAnimationFrame(()=>setTimeout(fn,0));
/* a panel's new content eases in when the visitor changes tab (not when live data redraws it) */
function swapIn(el){if(!el)return;el.classList.remove('swap-in');void el.offsetWidth;el.classList.add('swap-in');}
(function(){
  let queued=false;const run=()=>{queued=false;glideAll();};
  const queue=()=>{if(!queued){queued=true;Promise.resolve().then(run);}};
  /* a selection changed, or a bar was drawn again */
  new MutationObserver(recs=>{for(const r of recs){
      if(r.type==='attributes'){if(r.target.parentElement&&r.target.parentElement.matches(GLIDE_SEL)){queue();return;}continue;}
      if(!r.addedNodes.length)continue;
      if(r.target.closest(GLIDE_SEL)){if([...r.addedNodes].some(n=>!(n.classList&&n.classList.contains('glider')))){queue();return;}continue;}   // inside a bar (new labels, a new language)
      for(const n of r.addedNodes)if(n.nodeType===1&&(n.matches(GLIDE_SEL)||n.querySelector(GLIDE_SEL))){queue();return;}}})   // a bar drawn again
    .observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed']});
  let rt=0;addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>glideSnap(),80);});
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>glideSnap());
  if(typeof ResizeObserver==='function'){const size=new WeakMap();
    const ro=new ResizeObserver(es=>{const bars=new Set();
      for(const e of es){const k=Math.round(e.contentRect.width)+'x'+Math.round(e.contentRect.height);if(size.get(e.target)!==k){size.set(e.target,k);bars.add(e.target);}}
      if(bars.size)glideSnap(bars);});
    addEventListener('DOMContentLoaded',()=>GLIDES.forEach(([s])=>document.querySelectorAll(s).forEach(b=>ro.observe(b))));}
})();
