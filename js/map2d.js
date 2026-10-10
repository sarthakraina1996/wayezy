/* ============================================================
   2D MAP: an SVG floor plan with the same API as the 3D map.
   Used when WebGL is unavailable or fails (old kiosk PCs, locked-down
   browsers), or on request with ?map=2d. Pan by dragging, zoom with the
   wheel, pinch or the + and - buttons. "Ahead" for the kiosk points up.
   ============================================================ */
function createMap2D(){
const NS='http://www.w3.org/2000/svg';
const ENT_2D=(FLOORS.G.entrances||[])[0]||{x:397,y:1176};   // main entrance, from the plan data
function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
const host=document.getElementById('scene');host.innerHTML='';
const svg=el('svg',{class:'plan2d',role:'img','aria-label':T('Floor plan of {venue}',{venue:venueName()})},host);
const VB=[110,45,735,1250];
const ROT=KIOSK_FACING*180/Math.PI;                   // rotate so the way the kiosk faces is up
const RC=[(VB[0]+VB[2])/2,(VB[1]+VB[3])/2];
const world=el('g',{transform:`rotate(${ROT} ${RC[0]} ${RC[1]})`},svg);
const rot=(x,y)=>{const a=ROT*Math.PI/180,dx=x-RC[0],dy=y-RC[1];return [RC[0]+dx*Math.cos(a)-dy*Math.sin(a),RC[1]+dx*Math.sin(a)+dy*Math.cos(a)];};
const pts=P=>P.map(p=>p.join(',')).join(' ');
const floorG={},unitEl={},labelEls=[];
const upright=(x,y)=>`rotate(${-ROT} ${x} ${y})`;
function text(g,str,x,y,cls,size){const t=el('text',{x,y,class:cls,'text-anchor':'middle','dominant-baseline':'central',transform:upright(x,y),'font-size':size||11},g);t.textContent=str;labelEls.push(t);return t;}

function brandTexts(f,g){const brands=new Set(FLOORS[f].units.filter(u=>u.b&&BRANDS[u.b]).map(u=>u.b));
  brands.forEach(b=>brandClusters(f,b).forEach(c=>{const [cx,cy]=c.length===1?c[0].c:ctr(bbox(c.flatMap(u=>u.pts)));
    const w=Math.min(...c.map(u=>u.bb[2]-u.bb[0]));const t=text(g,BRANDS[b].name,cx,cy,'lbl2d',Math.max(9,Math.min(15,w/BRANDS[b].name.length*1.7)));t.dataset.b=b;}));}
/* a store added in the admin hub: colour its unit and name it, without redrawing the plan */
function refreshStores(){Object.values(unitEl).forEach(e=>{const cat=e.u.b&&BRANDS[e.u.b]?BRANDS[e.u.b].cat:null;e.fill=cat?CATS[cat].fill:'#E8E4DC';e.p.setAttribute('fill',e.fill);e.p.classList.toggle('empty',!e.u.b);});
  for(let i=labelEls.length-1;i>=0;i--){const t=labelEls[i];if(t.dataset&&t.dataset.b){t.remove();labelEls.splice(i,1);}}
  FLOOR_ORDER.forEach(f=>{const g=floorG[f];const n=g.querySelector('.lbl2d.wc');const before=labelEls.length;brandTexts(f,g);if(n)labelEls.slice(before).forEach(t=>g.insertBefore(t,n));});applyHighlights();}
FLOOR_ORDER.forEach(f=>{const F=FLOORS[f];const g=el('g',{class:'fl2d'},world);floorG[f]=g;g.style.display='none';
  if(f==='G'){const pv=F.paving;el('rect',{x:pv[0]-120,y:pv[1]-120,width:pv[2]-pv[0]+240,height:pv[3]-pv[1]+190,class:'lawn2d'},g);
    el('rect',{x:pv[0],y:pv[1],width:pv[2]-pv[0],height:pv[3]-pv[1],class:'walk2d'},g);
    (F.courts||[]).forEach(r=>el('rect',{x:r[0]+3,y:r[1]+3,width:r[2]-r[0]-6,height:r[3]-r[1]-6,class:'court2d'},g));
    (F.planters||[]).forEach(r=>el('rect',{x:r[0],y:r[1],width:r[2]-r[0],height:r[3]-r[1],class:'water2d'},g));}
  else{(F.walks||[]).forEach(r=>el('rect',{x:r[0],y:r[1],width:r[2]-r[0],height:r[3]-r[1],class:'walk2d'},g));
    (F.terraces||[]).forEach(t=>el('polygon',{points:pts(ptsOf(t)),class:'terrace2d'},g));
    (F.halls||[]).forEach(h=>el('rect',{x:h.r[0],y:h.r[1],width:h.r[2]-h.r[0],height:h.r[3]-h.r[1],class:'walk2d'},g));}
  F.units.forEach(u=>{const cat=u.b?BRANDS[u.b].cat:null;const p=el('polygon',{points:pts(u.pts),class:'unit2d'+(u.b?'':' empty'),fill:cat?CATS[cat].fill:'#E8E4DC'},g);
    p.dataset.key=u.key;unitEl[u.key]={p,u,fill:cat?CATS[cat].fill:'#E8E4DC'};});
  F.cores.forEach(c=>el('polygon',{points:pts(ptsOf(c)),class:'core2d'},g));
  F.toilets.forEach(t=>{const r=el('rect',{x:t.r[0],y:t.r[1],width:t.r[2]-t.r[0],height:t.r[3]-t.r[1],class:'wc2d'},g);r.dataset.wc=t.id;});
  (F.esc||[]).forEach(r=>el('rect',{x:r[0],y:r[1],width:r[2]-r[0],height:r[3]-r[1],class:'esc2d'},g));
  brandTexts(f,g);
  F.toilets.forEach(t=>{const k=t.g==='f'?'Women':t.g==='m'?'Men':'Toilets';text(g,T(k),t.c[0],t.c[1],'lbl2d wc',8).dataset.k=k;});
  if(f==='G')text(g,T('Main entrance').toUpperCase(),ENT_2D.x,ENT_2D.y+6,'lbl2d gate',10).dataset.k='Main entrance';
});
const routeG=el('g',{class:'route2d'},world);
const hereG=el('g',{class:'here2d'},world);
el('circle',{r:14,class:'here-pulse'},hereG);el('circle',{r:6.5,class:'here-dot'},hereG);
const hereTxt=el('text',{y:-14,'text-anchor':'middle',class:'here-txt','font-size':11},hereG);
const walker=el('circle',{r:7,class:'walker2d'},world);walker.style.display='none';

/* ---------------- view box: pan and zoom ---------------- */
let vb=null,anim=null;
function fitBox(b,ms){const c=[rot(b[0],b[1]),rot(b[2],b[1]),rot(b[2],b[3]),rot(b[0],b[3])];const bb=bbox(c);
  const W=host.clientWidth||1,H=host.clientHeight||1,aspect=W/H;let w=bb[2]-bb[0],h=bb[3]-bb[1];
  if(w/h<aspect)w=h*aspect;else h=w/aspect;const cx=(bb[0]+bb[2])/2,cy=(bb[1]+bb[3])/2;setVB([cx-w*0.53,cy-h*0.53,w*1.06,h*1.06],ms);}
function setVB(t,ms){if(!vb||!ms||reduce){vb=t;anim=null;apply();return;}const s=vb.slice(),t0=performance.now();
  // each move has its own step; a newer move (or an instant jump) replaces anim, and the older one stops at its next frame
  const step=()=>{if(anim!==step)return;const k=Math.min(1,(performance.now()-t0)/ms),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;vb=s.map((v,i)=>v+(t[i]-v)*e);apply();if(k<1)requestAnimationFrame(step);else anim=null;};
  anim=step;requestAnimationFrame(step);}
function apply(){svg.setAttribute('viewBox',vb.map(v=>v.toFixed(1)).join(' '));}
function zoom(k,cx,cy){if(!vb)return;const W=vb[2]*k,H=vb[3]*k;if(W<60||W>2400)return;const px=cx==null?vb[0]+vb[2]/2:cx,py=cy==null?vb[1]+vb[3]/2:cy;
  const fx=(px-vb[0])/vb[2],fy=(py-vb[1])/vb[3];setVB([px-W*fx,py-H*fy,W,H],cx==null?250:0);}
const toSvg=(ex,ey)=>{const r=svg.getBoundingClientRect();return [vb[0]+(ex-r.left)/r.width*vb[2],vb[1]+(ey-r.top)/r.height*vb[3]];};
const ptrs=new Map();let drag=null,pinch=null;
svg.addEventListener('pointerdown',e=>{svg.setPointerCapture(e.pointerId);ptrs.set(e.pointerId,[e.clientX,e.clientY]);poke();if(typeof RM!=='undefined'&&RM.on){if(guide){RM.userHold=true;guide.hold=true;}}else stopGuide();
  if(ptrs.size===1)drag={x:e.clientX,y:e.clientY,vb:vb.slice(),moved:0};else if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),vb:vb.slice()};drag=null;}});
svg.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,[e.clientX,e.clientY]);const r=svg.getBoundingClientRect();
  if(pinch&&ptrs.size===2){const [a,b]=[...ptrs.values()];const d=Math.hypot(a[0]-b[0],a[1]-b[1]);const k=pinch.d/Math.max(1,d);const c=toSvg((a[0]+b[0])/2,(a[1]+b[1])/2);vb=pinch.vb.slice();zoom(k,c[0],c[1]);return;}
  if(drag){const dx=(e.clientX-drag.x)/r.width*drag.vb[2],dy=(e.clientY-drag.y)/r.height*drag.vb[3];drag.moved=Math.max(drag.moved,Math.hypot(e.clientX-drag.x,e.clientY-drag.y));vb=[drag.vb[0]-dx,drag.vb[1]-dy,drag.vb[2],drag.vb[3]];apply();}});
const endPtr=e=>{const wasTap=drag&&drag.moved<7&&ptrs.size===1;ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;
  if(wasTap){const t=document.elementFromPoint(e.clientX,e.clientY);if(t&&t.dataset){if(t.dataset.key&&unitEl[t.dataset.key])onUnitTap(unitEl[t.dataset.key].u);
    else if(t.dataset.wc){const w=FLOORS[cur].toilets.find(x=>x.id===t.dataset.wc);if(w)selectToilet(w,cur);}}}
  if(!ptrs.size)drag=null;};
svg.addEventListener('pointerup',endPtr);svg.addEventListener('pointercancel',endPtr);
svg.addEventListener('wheel',e=>{e.preventDefault();const c=toSvg(e.clientX,e.clientY);zoom(e.deltaY>0?1.15:1/1.15,c[0],c[1]);},{passive:false});
new ResizeObserver(()=>{if(vb)fitFloor(0);}).observe(host);

/* ---------------- floors, origin, highlights ---------------- */
function setFloor(f,refit){cur=f;syncFloorUI();FLOOR_ORDER.forEach(k=>floorG[k].style.display=k===f?'':'none');
  [...routeG.children].forEach(g=>g.style.display=g.dataset.f===f?'':'none');setOrigin();
  if(refit){if(state.route&&state.route.legs.some(l=>l.f===f))showRouteOnFloor(true);else fitFloor(400);}}
function fitFloor(ms){fitBox(VB,ms);}
function setOrigin(){const o=originPoint();hereG.style.display=o.f===cur?'':'none';hereG.setAttribute('transform',`translate(${o.x} ${o.y}) ${upright(0,0)}`);hereTxt.textContent=o.label;}
function applyHighlights(){Object.values(unitEl).forEach(({p,u,fill})=>{const on=state.brand?u.b===state.brand:state.cat?(u.b&&catMatch(BRANDS[u.b].cat)):true;
  p.classList.toggle('sel',!!(state.brand&&u.b===state.brand));p.classList.toggle('dim',!on);p.setAttribute('fill',state.brand&&u.b===state.brand?'#D2AE6C':fill);});
  labelEls.forEach(t=>{if(t.dataset.b)t.classList.toggle('dim',!!(state.brand&&t.dataset.b!==state.brand));});}
function markUnit(u){const e=unitEl[u.key];if(e)e.p.classList.add('sel');}

/* ---------------- route ---------------- */
function clearRoute(){stopGuide();routeG.innerHTML='';FLOOR_ORDER.forEach(f=>floorBtns[f].classList.remove('onroute'));}
function drawRoute(r){clearRoute();
  r.legs.forEach((leg,i)=>{floorBtns[leg.f].classList.add('onroute');const g=el('g',{},routeG);g.dataset.f=leg.f;g.style.display=leg.f===cur?'':'none';
    el('polyline',{points:pts(leg.pts),class:'rt-case'},g);const line=el('polyline',{points:pts(leg.pts),class:'rt-line'},g);
    let L=0;for(let k=1;k<leg.pts.length;k++)L+=dist(leg.pts[k-1],leg.pts[k]);line.style.strokeDasharray=L;line.style.strokeDashoffset=reduce?0:L;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{line.style.transition=`stroke-dashoffset ${Math.min(1.6,Math.max(.5,L*SC/40))}s ease-out`;line.style.strokeDashoffset=0;}));
    const e=leg.pts[leg.pts.length-1];
    if(i<r.legs.length-1){const nx=r.legs[i+1],up=FLOORS[nx.f].idx>FLOORS[leg.f].idx;el('circle',{cx:e[0],cy:e[1],r:9,class:'rt-conn'},g);
      const t=el('text',{x:e[0],y:e[1]-16,'text-anchor':'middle',class:'rt-lbl',transform:upright(e[0],e[1]-16)},g);t._txt=()=>T(nx.ride.conn.type==='lift'?'{arrow} Lift to {fl}':'{arrow} Escalator to {fl}',{arrow:up?'▲':'▼',fl:flShort(nx.f)});t.textContent=t._txt();}
    else{const tu=state.brand&&state.targetUnit&&state.targetUnit.f===leg.f?state.targetUnit:null,pp=tu?(tu.lp||tu.c):e;   // on the shop itself
      const pg=el('g',{class:'rt-pin',transform:`translate(${pp[0]} ${pp[1]}) ${upright(0,0)}`},g);el('path',{d:'M0 0 C-4 -9 -11 -13 -11 -21 A11 11 0 1 1 11 -21 C11 -13 4 -9 0 0Z'},pg);el('circle',{cx:0,cy:-21,r:4.5,class:'rt-pin-core'},pg);}});}
function showRouteOnFloor(animate){const r=state.route;if(!r)return;const leg=r.legs.find(l=>l.f===cur);if(!leg){fitFloor(animate?400:0);return;}
  let P=leg.pts.slice();if(state.targetUnit&&state.targetUnit.f===cur)P=P.concat(state.targetUnit.pts);const b=bbox(P);const pad=70;fitBox([b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad],animate?500:0);}

/* ---------------- walk-through: a dot follows the route, floor by floor (guide.d is in plan units) ---------------- */
let walk=null,lastT=0;
function legGeom(leg){let L=0;const seg=[];for(let k=1;k<leg.pts.length;k++){const d=dist(leg.pts[k-1],leg.pts[k]);seg.push(d);L+=d;}return {L,seg};}
function drawWalker(zoomIn){const r=guide.r,leg=r.legs[guide.legIdx],{L,seg}=legGeom(leg);let d=Math.min(guide.d,L),k=0;while(k<seg.length-1&&d>seg[k]){d-=seg[k];k++;}
  const a=leg.pts[k],b=leg.pts[Math.min(k+1,leg.pts.length-1)],q=seg[k]?d/seg[k]:1,p=[a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q];
  walker.style.display='';walker.setAttribute('cx',p[0]);walker.setAttribute('cy',p[1]);
  if(vb){const c=rot(p[0],p[1]);const W=Math.min(vb[2],420),H=W*vb[3]/vb[2],f=zoomIn?1:0.08;vb=[vb[0]+(c[0]-W/2-vb[0])*f,vb[1]+(c[1]-H/2-vb[1])*f,vb[2]+(W-vb[2])*f,vb[3]+(H-vb[3])*f];apply();}
  return L;}
function startGuide(){const r=state.route;if(!r)return;stopGuide();
  if(reduce){setFloor(r.legs[0].f,false);showRouteOnFloor(false);return;}
  guide={r,legIdx:0,d:0,hold:false};walk=true;setFloor(r.legs[0].f,false);document.getElementById('guidebar').hidden=false;guideText();lastT=0;requestAnimationFrame(stepWalk);}
function stopGuide(){if(!guide)return;guide=null;walk=null;walker.style.display='none';const gb=document.getElementById('guidebar');if(gb)gb.hidden=true;}
function guideText(){const r=guide.r,leg=r.legs[guide.legIdx],last=guide.legIdx===r.legs.length-1;
  const nx=r.legs[guide.legIdx+1],up=nx&&FLOORS[nx.f].idx>FLOORS[leg.f].idx,fw=f=>LANG==='hi'?floorName(f):FLOORS[f].name.toLowerCase();
  document.getElementById('guidetext').textContent=last?T('Walk to {dest}',{dest:destName()||T('your destination')}):T(`Walk to the ${nx.ride.conn.type==='lift'?'lift':'escalator'}, then go ${up?'up':'down'} to the {floor}`,{floor:fw(nx.f)});}
let walkSpeed=9;                                   // metres per second of preview (slower while the voice is on)
function stepWalk(t){if(!guide||!walk||guide.hold||guide.ride||guide.ended)return;const dt=Math.min(0.25,((t-(lastT||t))/1000));lastT=t;const r=guide.r;
  guide.d+=dt*walkSpeed/SC;const L=drawWalker(false);
  if(guide.d>=L){if(guide.legIdx<r.legs.length-1){guide.ride=true;guide.legIdx++;guide.d=0;setTimeout(()=>{if(!guide)return;guide.ride=false;setFloor(r.legs[guide.legIdx].f,false);guideText();lastT=0;requestAnimationFrame(stepWalk);},900);return;}
    guide.ended=true;const end=()=>{if(!guide)return;if(guide.hold){guide.endPending=true;return;}stopGuide();showRouteOnFloor(true);};setTimeout(end,1200);return;}   // held at the end: finish when released
  requestAnimationFrame(stepWalk);}
/* pause, or put the walker on a chosen step (metres along a leg) */
function guideJump(leg,m,play){const r=state.route;if(!r)return;if(!guide){guide={r,legIdx:0,d:0};walk=true;}
  leg=Math.max(0,Math.min(r.legs.length-1,leg));guide.legIdx=leg;guide.ride=false;guide.ended=false;guide.endPending=false;guide.d=Math.min(Math.max(0,m)/SC,legGeom(r.legs[leg]).L);guide.hold=!play;
  if(cur!==r.legs[leg].f)setFloor(r.legs[leg].f,false);drawWalker(true);if(play){lastT=0;requestAnimationFrame(stepWalk);}}
function guideHold(on){if(!guide)return;guide.hold=!!on;if(!on){if(guide.endPending){setTimeout(()=>{if(guide&&!guide.hold){stopGuide();showRouteOnFloor(true);}},500);return;}walk=true;lastT=0;requestAnimationFrame(stepWalk);}}

return {kind:'2d',setFloor,fitFloor,drawRoute,clearRoute,showRouteOnFloor,startGuide,stopGuide,guideJump,guideHold,setGuideSpeed(v){walkSpeed=v;},applyHighlights,markUnit,refreshStores,
  applyMode(){svg.classList.toggle('night',MODE==='evening');},refreshSigns(){},
  relabel(){svg.setAttribute('aria-label',T('Floor plan of {venue}',{venue:venueName()}));labelEls.forEach(t=>{const k=t.dataset.k;if(k)t.textContent=k==='Main entrance'?T(k).toUpperCase():T(k);});routeG.querySelectorAll('text').forEach(t=>{if(t._txt)t.textContent=t._txt();});setOrigin();},
  toggleStack(){toast(T('“All floors” needs the 3D map. Use the floor buttons.'));},zoom:k=>zoom(k),rotate(){},toggleTilt(){return null;},faceKiosk(){fitFloor(400);},
  resize(){},setOrigin,setIdle(){},pause(){},isReady:()=>true,dispose(){host.innerHTML='';}};
}
