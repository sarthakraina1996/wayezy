/* ============================================================
   ENGINE: geometry, walk graph, routing, directions and search.
   Pure logic: no DOM and no three.js, so it also runs under Node
   (see tests/engine.test.js). Loads after data.js.
   ============================================================ */
const {CATS,BRANDS,FLOOR_ORDER,FLOORS,CONNECTORS}=DATA;
const SC=0.16, CX=420, CY=620;               // plan units -> metres; plan point at the 3D origin
const WALK_MPS=1.2;                          // an unhurried shopper
const RIDE={esc:{board:10,perFloor:24},lift:{board:55,perFloor:8}};   // seconds, incl. waiting for the lift
const QS=typeof location!=='undefined'?new URLSearchParams(location.search):new URLSearchParams('');
const FL={G:'G',F:'1F',S:'2F'};

/* Kiosk position in the shared grid. Override with ?at=G,374,699 (floor,x,y) and ?heading=deg */
const KIOSK=(()=>{const q=QS.get('at');
  if(q){const [f,x,y]=q.split(',');if(FLOORS[f]&&isFinite(parseFloat(x))&&isFinite(parseFloat(y)))return {f,x:+x,y:+y};}
  return {f:'G',x:374,y:699};})();
const KIOSK_FACING=((parseFloat(QS.get('heading'))||0)%360)*Math.PI/180;
/* the direction a visitor standing at the kiosk faces, in plan coordinates (y points down the page) */
const KIOSK_AHEAD=[-Math.sin(KIOSK_FACING),-Math.cos(KIOSK_FACING)];

/* ---------------- geometry ---------------- */
const rectPts=r=>[[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]];
const rectPtsW=rectPts;
const ptsOf=o=>o.p||rectPts(o.r);
function bbox(pts){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const [x,y] of pts){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}return [x0,y0,x1,y1];}
const ctr=b=>[(b[0]+b[2])/2,(b[1]+b[3])/2];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function segInter(a,b,c,d){
  const r=[b[0]-a[0],b[1]-a[1]],s=[d[0]-c[0],d[1]-c[1]];
  const den=r[0]*s[1]-r[1]*s[0];if(Math.abs(den)<1e-9)return null;
  const qp=[c[0]-a[0],c[1]-a[1]];
  const t=(qp[0]*s[1]-qp[1]*s[0])/den,u=(qp[0]*r[1]-qp[1]*r[0])/den;
  const e=1e-6;if(t<-e||t>1+e||u<-e||u>1+e)return null;
  return {t:Math.max(0,Math.min(1,t)),u:Math.max(0,Math.min(1,u)),x:a[0]+t*r[0],y:a[1]+t*r[1]};
}
function project(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1];const L=dx*dx+dy*dy;let t=L?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L:0;t=Math.max(0,Math.min(1,t));return {t,x:a[0]+t*dx,y:a[1]+t*dy};}
function pointInPoly(pt,P){let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if(((a[1]>pt[1])!==(b[1]>pt[1]))&&(pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0]))c=!c;}return c;}
function polyDist(pt,P){if(pointInPoly(pt,P))return 0;let d=Infinity;for(let i=0;i<P.length;i++){const q=project(pt,P[i],P[(i+1)%P.length]);d=Math.min(d,dist(pt,[q.x,q.y]));}return d;}
function touchBB(a,b){return !(a[2]<b[0]-1.5||b[2]<a[0]-1.5||a[3]<b[1]-1.5||b[3]<a[1]-1.5);}
const nkey=(f,x,y)=>f+':'+(Math.round(x*2)/2)+','+(Math.round(y*2)/2);

/* ---------------- units (independent of the 3D scene) ---------------- */
const UNITS=[],UNIT_BY_KEY={},UNITS_BY_BRAND={};
for(const f of FLOOR_ORDER){
  FLOORS[f].units.forEach(u=>{u.f=f;u.key=f+':'+u.id;u.pts=ptsOf(u);u.bb=bbox(u.pts);u.c=u.lp||ctr(u.bb);
    UNITS.push(u);UNIT_BY_KEY[u.key]=u;if(u.b&&BRANDS[u.b])(UNITS_BY_BRAND[u.b]=UNITS_BY_BRAND[u.b]||[]).push(u);});
  FLOORS[f].toilets.forEach(t=>{t.f=f;t.c=ctr(t.r);});
}
function unitsOfBrand(b){return (UNITS_BY_BRAND[b]||[]).filter(u=>!u.noRoute);}
function floorsOfBrand(b){const s=new Set(unitsOfBrand(b).map(u=>u.f));return FLOOR_ORDER.filter(f=>s.has(f));}
function brandKeys(){return Object.keys(BRANDS).filter(b=>unitsOfBrand(b).length);}
function vacantUnits(){return UNITS.filter(u=>!u.b&&!u.noRoute);}
function reindexBrands(){for(const k in UNITS_BY_BRAND)delete UNITS_BY_BRAND[k];UNITS.forEach(u=>{if(u.b&&BRANDS[u.b])(UNITS_BY_BRAND[u.b]=UNITS_BY_BRAND[u.b]||[]).push(u);});
  if(typeof SEARCH_IX!=='undefined')SEARCH_IX=null;if(typeof computeFronts==='function'&&GRAPH.nodes)computeFronts();}
/* {name, cat, units:['G:21-B']} -> the store appears in search, lists and routing at once */
function registerStore(key,info){if(!key||!info||!info.name||(BRANDS[key]&&!BRANDS[key].custom))return false;
  BRANDS[key]={name:String(info.name).slice(0,60),cat:CATS[info.cat]?info.cat:'other',custom:true};
  UNITS.forEach(u=>{if(u.b===key)delete u.b;});(info.units||[]).forEach(k=>{const u=UNIT_BY_KEY[k];if(u&&!u.b)u.b=key;});
  reindexBrands();return true;}
function unregisterStore(key){if(!BRANDS[key]||!BRANDS[key].custom)return false;UNITS.forEach(u=>{if(u.b===key)delete u.b;});delete BRANDS[key];reindexBrands();return true;}
/* group a brand's units into touching clusters (one sign / label per cluster) */
function brandClusters(f,b){const cl=[];(UNITS_BY_BRAND[b]||[]).filter(u=>u.f===f).forEach(u=>{let hit=null;for(const c of cl){if(c.some(v=>touchBB(v.bb,u.bb))){hit=c;break;}}hit?hit.push(u):cl.push([u]);});return cl;}

/* ---------------- points of interest ---------------- */
const POIS={};
function addPoi(id,f,x,y,extra){return POIS[id]=Object.assign({id,f,x,y},extra||{});}
addPoi('kiosk',KIOSK.f,KIOSK.x,KIOSK.y,{kind:'kiosk',name:'You are here'});
(FLOORS.G.entrances||[]).forEach(e=>addPoi('ent:'+e.id,'G',e.x,e.y,{kind:'entrance',name:e.name}));
UNITS.forEach(u=>{const d=u.door||u.c;addPoi('u:'+u.key,u.f,d[0],d[1],{kind:'unit',unit:u});});
FLOOR_ORDER.forEach(f=>FLOORS[f].toilets.forEach(t=>addPoi('wc:'+t.id,f,t.c[0],t.c[1],{kind:'wc',name:t.name,g:t.g,outline:rectPts(t.r)})));
CONNECTORS.forEach(c=>{for(const f in c.at)addPoi('c:'+c.id+':'+f,f,c.at[f][0],c.at[f][1],{kind:'conn',conn:c});});

/* ---------------- walk graph (edge weights are seconds) ---------------- */
const GRAPH={nodes:{},adj:{},ver:0};
let TREE_CACHE={};
function gNode(id,f,x,y){if(!GRAPH.nodes[id]){GRAPH.nodes[id]={id,f,x,y};GRAPH.adj[id]=[];}return id;}
function gEdge(a,b,w,meta){GRAPH.adj[a].push({to:b,w,meta});GRAPH.adj[b].push({to:a,w,meta});}
const walkSecs=units=>units*SC/WALK_MPS;
function rideSecs(type,floors){const r=RIDE[type]||RIDE.esc;return r.board+r.perFloor*floors;}
function buildGraph(){
  for(const k in GRAPH.nodes)delete GRAPH.nodes[k];for(const k in GRAPH.adj)delete GRAPH.adj[k];TREE_CACHE={};GRAPH.ver++;
  for(const f of FLOOR_ORDER){
    const segs=FLOORS[f].segs.map(s=>({a:[s[0],s[1]],b:[s[2],s[3]],pts:[{t:0,x:s[0],y:s[1]},{t:1,x:s[2],y:s[3]}]}));
    for(let i=0;i<segs.length;i++)for(let j=i+1;j<segs.length;j++){
      const I=segInter(segs[i].a,segs[i].b,segs[j].a,segs[j].b);
      if(I){segs[i].pts.push({t:I.t,x:I.x,y:I.y});segs[j].pts.push({t:I.u,x:I.x,y:I.y});}
    }
    const pois=Object.values(POIS).filter(p=>p.f===f);
    pois.forEach(p=>{let best=null;
      segs.forEach(s=>{const pr=project([p.x,p.y],s.a,s.b);const d=dist([p.x,p.y],[pr.x,pr.y]);if(!best||d<best.d)best={d,s,pr};});
      if(!best)return;best.s.pts.push({t:best.pr.t,x:best.pr.x,y:best.pr.y});p.proj=[best.pr.x,best.pr.y];});
    segs.forEach(s=>{s.pts.sort((a,b)=>a.t-b.t);let prev=null;
      s.pts.forEach(q=>{const id=gNode(nkey(f,q.x,q.y),f,q.x,q.y);
        if(prev&&prev!==id){const A=GRAPH.nodes[prev],B=GRAPH.nodes[id];gEdge(prev,id,walkSecs(dist([A.x,A.y],[B.x,B.y])));}
        prev=id;});});
    pois.forEach(p=>{if(!p.proj)return;const pid=gNode('poi:'+p.id,f,p.x,p.y);gEdge(pid,nkey(f,p.proj[0],p.proj[1]),walkSecs(dist([p.x,p.y],p.proj))+0.01);});
  }
  CONNECTORS.forEach(c=>{
    const fl=Object.keys(c.at).sort((a,b)=>FLOORS[a].idx-FLOORS[b].idx);
    for(let i=0;i<fl.length;i++)for(let j=i+1;j<fl.length;j++){
      const df=FLOORS[fl[j]].idx-FLOORS[fl[i]].idx;
      if(c.type==='esc'&&df>1)continue;                        // escalators only link neighbouring floors
      gEdge('poi:c:'+c.id+':'+fl[i],'poi:c:'+c.id+':'+fl[j],rideSecs(c.type,df),{conn:c,type:c.type,floors:df});
    }
  });
}

/* Neighbouring units, cores and toilets can hide part of a front (Cinépolis' long west side has shops in front of
   most of it). The open part is where the glass, the door and the sign go; the door sits where the plan draws it
   (u.door) when that is on the open part, otherwise in its middle. Distances in plan units along the edge from a. */
function openSpan(u,fr,f){const F=FLOORS[f],a=fr.a,b=fr.b,L=dist(a,b);if(L<1)return {s0:0,s1:L,door:L/2};
  const t=[(b[0]-a[0])/L,(b[1]-a[1])/L],n=fr.n;
  const others=[].concat(F.units.filter(v=>v!==u).map(v=>v.pts),(F.cores||[]).map(ptsOf),(F.toilets||[]).map(x=>rectPts(x.r)));
  const open=s=>{const p=[a[0]+t[0]*s+n[0]*2,a[1]+t[1]*s+n[1]*2];return !others.some(P=>pointInPoly(p,P));};
  const runs=[];let cur=null;const step=Math.max(0.5,L/240);
  for(let s=step/2;s<L;s+=step){if(open(s)){if(!cur)cur=[Math.max(0,s-step/2),s];cur[1]=Math.min(L,s+step/2);}else if(cur){runs.push(cur);cur=null;}}
  if(cur)runs.push(cur);
  if(!runs.length)return {s0:0,s1:L,door:L/2};
  const d=u.door?(u.door[0]-a[0])*t[0]+(u.door[1]-a[1])*t[1]:null;
  let r=d!==null&&runs.find(q=>d>=q[0]-2&&d<=q[1]+2);if(!r)r=runs.reduce((x,y)=>(y[1]-y[0])>(x[1]-x[0])?y:x);
  const m=Math.min(1.4/SC,(r[1]-r[0])*0.3);                      // keep the door off the corners
  const door=d!==null&&d>=r[0]-2&&d<=r[1]+2?Math.max(r[0]+m,Math.min(r[1]-m,d)):(r[0]+r[1])/2;
  return {s0:r[0],s1:r[1],door};}
/* Each shop's front is the edge facing the walkway; its route point moves to just outside the door. */
function computeFronts(){
  FLOOR_ORDER.forEach(f=>{const units=FLOORS[f].units;units.forEach(u=>{
    const poi=POIS['u:'+u.key];const ref=u.door||(poi&&poi.proj)||u.c;const P=u.pts;let best=null;
    for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];const lp=Math.hypot(b[0]-a[0],b[1]-a[1]);const lm=lp*SC;if(lm<2.4)continue;
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];let n=[(b[1]-a[1])/lp,-(b[0]-a[0])/lp];
      if(pointInPoly([mid[0]+n[0]*2,mid[1]+n[1]*2],P))n=[-n[0],-n[1]];
      const out=[mid[0]+n[0]*5,mid[1]+n[1]*5];
      const blocked=units.some(v=>v!==u&&pointInPoly(out,v.pts))||FLOORS[f].cores.some(c=>pointInPoly(out,ptsOf(c)));
      const score=Math.hypot(mid[0]-ref[0],mid[1]-ref[1])-Math.min(lm,12)*1.2+(blocked?400:0);
      if(!best||score<best.score)best={score,a,b,mid,n,lm,blocked};}
    if(!best){const a=P[0],b=P[1];best={a,b,mid:[(a[0]+b[0])/2,(a[1]+b[1])/2],n:[0,1],lm:Math.hypot(b[0]-a[0],b[1]-a[1])*SC};}
    best.span=openSpan(u,best,f);u.front=best;
    const L=dist(best.a,best.b)||1,t=[(best.b[0]-best.a[0])/L,(best.b[1]-best.a[1])/L],d=best.span.door;
    best.door=[best.a[0]+t[0]*d,best.a[1]+t[1]*d];                 // the door, on the part of the front that is open to the walkway
    if(poi&&u.b){poi.x=best.door[0]+best.n[0]*4;poi.y=best.door[1]+best.n[1]*4;}
  });});
  buildGraph();
}
buildGraph();computeFronts();

/* ---------------- glass balustrades on the upper floors ----------------
   Walkway, terrace and hall edges that look down into open space get a glass rail, so the floors
   below can be seen through the voids. A rail goes only where the space just outside the edge is
   open (no shop, core, toilet, walkway, terrace, stairs, or escalator arriving from below) and
   where no walking route crosses the edge, so it can never block a path.
   Returns runs in plan units: [{a:[x,y], b:[x,y], n:[nx,ny]}], n pointing out into the void.
   The Blender film reads the same runs (blender/rails.json, written by tests/export_rails.js). */
/* is a ground-level point under an upper floor (walkway, shop, core, terrace)? Trees are never planted there. */
const COVER={};
function coveredAbove(x,y){return FLOOR_ORDER.some(f=>{if(!FLOORS[f].idx)return false;const F=FLOORS[f];
  const C=COVER[f]||(COVER[f]=[].concat(F.units.map(u=>u.pts),(F.cores||[]).map(ptsOf),(F.toilets||[]).map(t=>rectPts(t.r)),(F.walks||[]).map(rectPts),(F.terraces||[]).map(ptsOf),(F.halls||[]).map(h=>rectPts(h.r))).map(Q=>({Q,b:bbox(Q)})));
  return C.some(({Q,b})=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3]&&pointInPoly([x,y],Q));});}
const RAIL_CACHE={};
function voidRails(f){if(RAIL_CACHE[f])return RAIL_CACHE[f];const F=FLOORS[f];if(!F||!F.idx)return (RAIL_CACHE[f]=[]);
  const below=FLOOR_ORDER.find(k=>FLOORS[k].idx===F.idx-1);
  const solid=[].concat(F.units.map(u=>u.pts),(F.cores||[]).map(ptsOf),(F.toilets||[]).map(t=>rectPts(t.r)),(F.walks||[]).map(rectPts),
    (F.terraces||[]).map(ptsOf),(F.halls||[]).map(h=>rectPts(h.r)),(F.esc||[]).map(rectPts),((below&&FLOORS[below].esc)||[]).map(rectPts),
    (F.stairsAreas||[]).map(rectPts),(F.cineStairs||[]).map(rectPts));
  const boxes=solid.map(bbox);
  const isSolid=p=>solid.some((Q,i)=>{const b=boxes[i];return p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3]&&pointInPoly(p,Q);});
  const paths=[];for(const id in GRAPH.adj){const A=GRAPH.nodes[id];if(A.f!==f)continue;
    GRAPH.adj[id].forEach(e=>{const B=GRAPH.nodes[e.to];if(B&&B.f===f&&id<e.to)paths.push([[A.x,A.y],[B.x,B.y]]);});}
  const crossed=(a,b)=>paths.some(([c,d])=>segInter(a,b,c,d));
  const walkables=[].concat((F.walks||[]).map(rectPts),(F.terraces||[]).map(ptsOf),(F.halls||[]).map(h=>rectPts(h.r)));
  const STEP=2,OFF=1.6,out=[];
  walkables.forEach(Q=>{for(let i=0;i<Q.length;i++){const a=Q[i],b=Q[(i+1)%Q.length];const L=dist(a,b);if(L<STEP)continue;
    const t=[(b[0]-a[0])/L,(b[1]-a[1])/L];let n=[t[1],-t[0]];const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    if(pointInPoly([mid[0]+n[0]*0.5,mid[1]+n[1]*0.5],Q))n=[-n[0],-n[1]];
    const at=d=>[a[0]+t[0]*d,a[1]+t[1]*d];let run=null;
    const flush=()=>{if(run&&run[1]-run[0]>=STEP*1.5)out.push({a:at(run[0]),b:at(run[1]),n});run=null;};
    for(let d=STEP/2;d<L;d+=STEP){const q=at(d),o=[q[0]+n[0]*OFF,q[1]+n[1]*OFF];
      const open=!isSolid(o)&&!crossed(at(Math.max(0,d-STEP/2)),at(Math.min(L,d+STEP/2)));
      if(open){if(!run)run=[Math.max(0,d-STEP/2),0];run[1]=Math.min(L,d+STEP/2);}else flush();}
    flush();}});
  return (RAIL_CACHE[f]=out);}

/* ---------------- escalators ----------------
   The floor plans draw every escalator twice: on the floor it leaves and again, in the void, on the floor it reaches.
   The map and the film build each one once, on the floor it leaves, rising the full storey towards where it arrives
   (the connector's point on the upper floor, or failing that the upper floor's drawing of it).
   Returns [{f, r:[x0,y0,x1,y1], axis:'x'|'y', dir:+1|-1 (rises towards +x or +y), conn}] in plan units.
   The Blender film reads the same runs (blender/escalators.json, written by tests/export_escalators.js). */
function rectDist(p,r){const dx=Math.max(r[0]-p[0],0,p[0]-r[2]),dy=Math.max(r[1]-p[1],0,p[1]-r[3]);return Math.hypot(dx,dy);}
function escalatorRuns(f){const F=FLOORS[f];if(!F||!F.esc)return [];const out=[];
  F.esc.forEach(r=>{let best=null;
    CONNECTORS.forEach(c=>{if(c.type!=='esc'||!c.at[f])return;const d=rectDist(c.at[f],r);if(!best||d<best.d)best={c,d};});
    const axis=(r[2]-r[0])>=(r[3]-r[1])?'x':'y',k=axis==='x'?0:1,mid=[(r[0]+r[2])/2,(r[1]+r[3])/2];
    let dir=0,conn=null;
    if(best&&best.d<=25){const c=best.c,fl=Object.keys(c.at).sort((a,b)=>FLOORS[a].idx-FLOORS[b].idx),upper=fl[fl.length-1];
      if(upper===f)return;                                        // it arrives here: built on the floor below
      conn=c.id;const U=c.at[upper];let off=U[k]-mid[k];
      const ur=(FLOORS[upper].esc||[]).slice().sort((a,b)=>rectDist(U,a)-rectDist(U,b))[0];
      if(Math.abs(off)<3&&ur)off=(ur[k]+ur[k+2])/2-mid[k];
      if(Math.abs(off)>=1)dir=off>0?1:-1;
      // a drawing too short for a real escalator (steeper than ~35 degrees): take its full length from both drawings, if that is clear
      if((r[k+2]-r[k])*SC<11&&ur){const lo=Math.min(r[k],ur[k]),hi=Math.max(r[k+2],ur[k+2]),q=r.slice();q[k]=lo;q[k+2]=hi;
        const hits=p=>F.units.some(u=>pointInPoly(p,u.pts))||(F.cores||[]).some(c=>pointInPoly(p,ptsOf(c)));let clear=true;
        for(let t=lo;t<=hi&&clear;t+=2)for(const s of [r[1-k]+1,(r[1-k]+r[3-k])/2,r[3-k]-1])if(hits(k===0?[t,s]:[s,t])){clear=false;break;}
        if(clear)r=q;}}
    if(!dir){                                                     // no clue from the connectors: rise away from a shop or core
      const L=(axis==='x'?r[2]-r[0]:r[3]-r[1])/2+6,tip=axis==='x'?[mid[0]+L,mid[1]]:[mid[0],mid[1]+L];
      dir=F.units.some(u=>pointInPoly(tip,u.pts))||(F.cores||[]).some(c=>pointInPoly(tip,ptsOf(c)))?-1:1;}
    out.push({f,r,axis,dir,conn});});
  return out;}

/* ---------------- shortest paths (binary-heap Dijkstra, one cached tree per origin) ---------------- */
function heapPush(h,d,v){h.push([d,v]);let i=h.length-1;while(i>0){const p=(i-1)>>1;if(h[p][0]<=h[i][0])break;[h[p],h[i]]=[h[i],h[p]];i=p;}}
function heapPop(h){const top=h[0],last=h.pop();if(h.length){h[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<h.length&&h[l][0]<h[m][0])m=l;if(r<h.length&&h[r][0]<h[m][0])m=r;if(m===i)break;[h[m],h[i]]=[h[i],h[m]];i=m;}}return top;}
function shortestTree(src,stepFree){
  const key=src+'|'+(stepFree?1:0);if(TREE_CACHE[key])return TREE_CACHE[key];
  const D={},P={},PE={};D[src]=0;const h=[];heapPush(h,0,src);
  while(h.length){const [d,u]=heapPop(h);if(d>D[u])continue;
    // arrive at shops, toilets and entrances, but never walk through them (lifts and escalators are fine)
    if(u!==src&&u.startsWith('poi:')&&!u.startsWith('poi:c:'))continue;
    for(const e of GRAPH.adj[u]||[]){if(stepFree&&e.meta&&e.meta.type==='esc')continue;
      const nd=d+e.w;if(nd<(D[e.to]===undefined?Infinity:D[e.to])){D[e.to]=nd;P[e.to]=u;PE[e.to]=e;heapPush(h,nd,e.to);}}}
  return TREE_CACHE[key]={D,P,PE};
}
function legLength(l){let m=0;for(let i=1;i<l.pts.length;i++)m+=dist(l.pts[i-1],l.pts[i]);return m*SC;}
/* Route from an origin POI (default: this kiosk) to the nearest of several target POIs, by time. */
function routeTo(targets,opts){
  opts=(opts&&typeof opts==='object')?opts:{stepFree:!!opts};
  const from=opts.from&&POIS[opts.from]?opts.from:'kiosk';const src='poi:'+from;
  if(!GRAPH.adj[src])return null;
  const {D,P,PE}=shortestTree(src,!!opts.stepFree);
  let best=null;(targets||[]).forEach(t=>{const id='poi:'+t;const d=D[id];if(id!==src&&d!==undefined&&(!best||d<D[best]))best=id;});
  if(!best)return null;
  const path=[];let cur=best;while(cur){path.unshift(cur);cur=P[cur];}
  const legs=[];let leg=null;
  for(let i=0;i<path.length;i++){const n=GRAPH.nodes[path[i]];
    if(!leg||leg.f!==n.f){if(leg)legs.push(leg);leg={f:n.f,pts:[],ride:i>0?PE[path[i]].meta:null};}
    leg.pts.push([n.x,n.y]);}
  legs.push(leg);
  // finish just inside the door rather than at the middle of the shop
  const tp=POIS[best.slice(4)];const outline=tp.unit?tp.unit.pts:(tp.kind==='wc'?tp.outline:null);const L=legs[legs.length-1].pts;
  if(outline&&L.length>=2){const a=L[L.length-2],b=L[L.length-1];let bt=null;
    for(let i=0;i<outline.length;i++){const I=segInter(a,b,outline[i],outline[(i+1)%outline.length]);if(I&&I.t>0.001&&(bt===null||I.t<bt))bt=I.t;}
    if(bt!==null){const len=dist(a,b)||1,t2=Math.min(1,bt+2/len);L[L.length-1]=[a[0]+(b[0]-a[0])*t2,a[1]+(b[1]-a[1])*t2];}}
  const metres=legs.reduce((s,l)=>s+legLength(l),0);
  return {legs,target:best.slice(4),from,cost:D[best],metres,seconds:D[best],stepFree:!!opts.stepFree};
}
function routeStats(r){return {m:Math.max(5,Math.round(r.metres/5)*5),min:Math.max(1,Math.round(r.seconds/60))};}

/* ---------------- live position (the phone app with Bluetooth beacons; the maths is in locate.js) ----------------
   The walkways as plain segments, the nearest walkway point to a position, the visitor as a place routes can start
   from ("me"), how far along a route a position is, and where the beacons go. Plan units unless a name says metres. */
let WALK_CACHE={ver:-1};
const offWalk=id=>id.startsWith('poi:');                 // doors, lifts, the kiosk, the visitor: not walkway
function walkEdges(f){if(WALK_CACHE.ver!==GRAPH.ver)WALK_CACHE={ver:GRAPH.ver};
  if(WALK_CACHE[f])return WALK_CACHE[f];const out=[];
  for(const id in GRAPH.adj){if(offWalk(id))continue;const A=GRAPH.nodes[id];if(A.f!==f)continue;
    for(const e of GRAPH.adj[id]){if(e.to<=id||offWalk(e.to))continue;const B=GRAPH.nodes[e.to];if(B.f===f)out.push({a:id,b:e.to,A:[A.x,A.y],B:[B.x,B.y]});}}
  return (WALK_CACHE[f]=out);}
/* the nearest point of a floor's walkways: {x, y, m: metres away, e: the edge} */
function snapToWalk(f,x,y){let best=null;if(!FLOORS[f])return null;
  for(const e of walkEdges(f)){const q=project([x,y],e.A,e.B),d=dist([x,y],[q.x,q.y]);if(!best||d<best.d)best={d,x:q.x,y:q.y,e};}
  return best&&{x:best.x,y:best.y,m:best.d*SC,e:best.e};}
/* Every metre of walkway on every floor, and which points a lift or an escalator joins: what the position
   tracker (locate.js) keeps its probabilities on. {pts:[{f,x,y}], links:[[i,j]]} */
function walkGrid(){const pts=[],seen={};
  FLOOR_ORDER.forEach(f=>walkEdges(f).forEach(e=>{const L=dist(e.A,e.B),n=Math.max(1,Math.round(L*SC));
    for(let i=0;i<=n;i++){const x=e.A[0]+(e.B[0]-e.A[0])*i/n,y=e.A[1]+(e.B[1]-e.A[1])*i/n,k=f+'|'+Math.round(x/3)+'|'+Math.round(y/3);if(seen[k])continue;seen[k]=1;pts.push({f,x,y});}}));
  const at=(f,x,y)=>{let b=-1,bd=Infinity;pts.forEach((p,i)=>{if(p.f!==f)return;const d=Math.hypot(p.x-x,p.y-y);if(d<bd){bd=d;b=i;}});return b;};
  const links=[];CONNECTORS.forEach(c=>{const fl=Object.keys(c.at).sort((a,b)=>FLOORS[a].idx-FLOORS[b].idx).map(f=>at(f,c.at[f][0],c.at[f][1]));
    for(let i=1;i<fl.length;i++)if(fl[i-1]>=0&&fl[i]>=0)links.push([fl[i-1],fl[i]]);});
  return {pts,links};}
function gDrop(id){(GRAPH.adj[id]||[]).forEach(e=>{if(GRAPH.adj[e.to])GRAPH.adj[e.to]=GRAPH.adj[e.to].filter(x=>x.to!==id);});delete GRAPH.adj[id];delete GRAPH.nodes[id];}
/* Put the visitor on the map as the POI "me" (on the nearest walkway), so routes can start there: routeTo(t,{from:'me'}).
   Cheap enough to call on every position fix: only this one node is re-linked. */
function setMe(f,x,y){if(!FLOORS[f]||!isFinite(x)||!isFinite(y))return null;const s=snapToWalk(f,x,y);if(!s)return null;
  gDrop('poi:me');addPoi('me',f,s.x,s.y,{kind:'me',name:'Your location',off:s.m});gNode('poi:me',f,s.x,s.y);
  [s.e.a,s.e.b].forEach(n=>{const N=GRAPH.nodes[n];if(N)gEdge('poi:me',n,walkSecs(dist([s.x,s.y],[N.x,N.y]))+0.01);});
  for(const k in TREE_CACHE)if(k.startsWith('poi:me|'))delete TREE_CACHE[k];
  return POIS.me;}
/* Where a position is on a route: {leg, m: metres along that leg, len: the leg's length, off: metres off the line}.
   from: the last answer, so the walker is not thrown back when a route passes the same place twice.
   null when the position is on a floor the route does not use (or has already left). */
function routeProgress(r,f,x,y,from){let best=null;const fl=from?from.leg:0;
  r.legs.forEach((leg,li)=>{if(leg.f!==f||li<fl)return;let acc=0;
    for(let i=1;i<leg.pts.length;i++){const a=leg.pts[i-1],b=leg.pts[i],L=dist(a,b);const q=project([x,y],a,b),d=dist([x,y],[q.x,q.y])*SC;
      const m=(acc+q.t*L)*SC;const back=from&&li===from.leg&&m<from.m-3?(from.m-m)*0.5:0;       // walking back is possible, but the less likely reading
      const score=d+back+(li-fl)*6;if(!best||score<best.score)best={leg:li,m,off:d,score};acc+=L;}});
  if(!best)return null;best.len=legLength(r.legs[best.leg]);delete best.score;return best;}
/* Where the beacons go. One at every lift and escalator landing and at each entrance (they settle which floor the
   visitor is on, and where a route starts), then the walkways are filled so that no walkway point is further than
   `radius` metres from a beacon (farthest point first, which spaces them evenly). These are planning positions:
   the site survey moves each to the nearest place it can be fixed and powered, and data/beacons.json records that.
   Returns [{id:'G-01', f, x, y, kind:'lift'|'esc'|'entrance'|'walk', ref, major, minor}]. */
function planBeacons(opts){opts=opts||{};const R=(opts.radius||5.5)/SC,near=3/SC,out=[];
  const put=(f,x,y,kind,ref)=>{if(kind!=='walk'&&out.some(b=>b.f===f&&dist([b.x,b.y],[x,y])<near))return;out.push({f,x:Math.round(x*10)/10,y:Math.round(y*10)/10,kind,ref:ref||''});};
  CONNECTORS.forEach(c=>{for(const f in c.at){const s=snapToWalk(f,c.at[f][0],c.at[f][1]);if(s)put(f,s.x,s.y,c.type,c.id);}});
  (FLOORS.G.entrances||[]).forEach(e=>{const s=snapToWalk('G',e.x,e.y);if(s)put('G',s.x,s.y,'entrance',e.id);});
  FLOOR_ORDER.forEach(f=>{const S=[];
    walkEdges(f).forEach(e=>{const L=dist(e.A,e.B),n=Math.max(1,Math.round(L*SC));for(let i=0;i<=n;i++)S.push([e.A[0]+(e.B[0]-e.A[0])*i/n,e.A[1]+(e.B[1]-e.A[1])*i/n]);});
    const shop=S.map(p=>UNITS.some(u=>u.f===f&&u.b&&pointInPoly(p,u.pts)));          // a walk line can clip a shop's corner: no beacon goes inside a shop
    const D=S.map(p=>{let d=Infinity;out.forEach(b=>{if(b.f===f)d=Math.min(d,dist(p,[b.x,b.y]));});return d;});
    for(;;){let k=-1,far=R;D.forEach((d,i)=>{if(d>far){far=d;k=i;}});if(k<0)break;
      let c=k;if(shop[k]){c=-1;let cd=Infinity;S.forEach((p,i)=>{if(shop[i])return;const d=dist(p,S[k]);if(d<cd){cd=d;c=i;}});}
      if(c<0||dist(S[c],S[k])>=D[k]){D[k]=0;continue;}                                  // nowhere better to put one for this point
      put(f,S[c][0],S[c][1],'walk');const b=out[out.length-1];S.forEach((p,i)=>{const d=dist(p,[b.x,b.y]);if(d<D[i])D[i]=d;});if(c!==k&&D[k]>R)D[k]=0;}});
  FLOOR_ORDER.forEach(f=>{const L=out.filter(b=>b.f===f).sort((a,b)=>a.y-b.y||a.x-b.x);
    L.forEach((b,i)=>{b.minor=i+1;b.major=FLOORS[f].idx+1;b.id=FL[f]+'-'+String(i+1).padStart(2,'0');});});
  return out.sort((a,b)=>a.major-b.major||a.minor-b.minor);}

/* ---------------- turn-by-turn directions ---------------- */
function simplify(P,eps){if(P.length<3)return P.slice();let dmax=0,k=0;const a=P[0],b=P[P.length-1];
  for(let i=1;i<P.length-1;i++){const q=project(P[i],a,b);const d=dist(P[i],[q.x,q.y]);if(d>dmax){dmax=d;k=i;}}
  if(dmax>eps){const l=simplify(P.slice(0,k+1),eps),r=simplify(P.slice(k),eps);return l.slice(0,-1).concat(r);}return [a,b];}
const turnAngle=(a,b)=>Math.atan2(a[0]*b[1]-a[1]*b[0],a[0]*b[0]+a[1]*b[1]);    // + is a right turn (plan y points down)
function turnWord(ang){const d=Math.abs(ang)*180/Math.PI,s=ang>0?'right':'left',ic=ang>0?'right':'left';
  if(d<25)return null;if(d<60)return {ic,k:'bear',s,t:'Bear '+s};if(d<150)return {ic,k:'turn',s,t:'Turn '+s};return {ic:'uturn',k:'uturn',s,t:'Turn around'};}
/* the nearest shop to a point, as a landmark ("turn left at Starbucks") */
function landmarkAt(f,pt,maxM,skip){let best=null;
  UNITS.forEach(u=>{if(u.f!==f||!u.b||(skip&&skip.has(u.b)))return;const d=polyDist(pt,u.pts)*SC;if(d<=maxM&&(!best||d<best.d))best={d,name:BRANDS[u.b].name,b:u.b};});
  return best;}
function roundM(m){return m<8?Math.max(2,Math.round(m)):Math.round(m/5)*5;}
function floorWords(f,lang){const n=FLOORS[f].name;return lang==='hi'?(FLOOR_HI[n]||n):n.replace(/^(\w)/,c=>c.toLowerCase());}
/* The words of the directions. English, and Hindi as it is spoken in Indian malls: the polite आप form, every
   instruction an imperative (-इए), which reads the same for every visitor, and the loanwords people use
   (लिफ्ट, एस्केलेटर, मीटर). Shop names stay as they are. */
const FLOOR_HI={'Ground floor':'ग्राउंड फ़्लोर','First floor':'पहली मंज़िल','Second floor':'दूसरी मंज़िल'};
const farEn=m=>m?(m>=10?'about '+m+' metres':m+' metres'):'a few steps';
const farHi=m=>m?(m>=10?'लगभग '+m+' मीटर':m+' मीटर'):'कुछ कदम';
const SIDE_HI={right:'दाएँ',left:'बाएँ'};
const DIRW={
  en:{dest:'Your destination',
    kiosk(tw,m,lm){const to=lm?' towards '+lm:'';
      if(!tw)return {t:'Walk straight ahead'+to,say:`Walk straight ahead${m?' for '+farEn(m):''}${lm?', towards '+lm:''}.`};
      const turn=tw.k==='uturn'?'Turn around':tw.k==='bear'?'Keep '+tw.s:tw.t;return {t:turn+' and walk'+to,say:`${turn}, then walk ${farEn(m)}${to}.`};},
    from(on,m,lm){const to=lm?' towards '+lm:'',w=on?'From '+on+', walk':'Walk';return {t:w+to,say:`${w} ${farEn(m)}${to}.`};},
    off(lift,m,lm){const to=lm?' towards '+lm:'';
      return {t:(lift?'Leave the lift and walk':'Step off and walk')+(lm?to:' ahead'),say:`${lift?'Leave the lift':'Step off the escalator'}, and walk ${farEn(m)}${lm?to:' straight ahead'}.`};},
    turn(tw,at,again,m){const t=tw.t+(at?' at '+at:again?' again':'');return {t,say:`${t}, then ${tw.k==='bear'?'carry on':'walk'} ${farEn(m)}.`};},
    ride(lift,up,f){const t=`Take the ${lift?'lift':'escalator'} ${up?'up':'down'} to the ${floorWords(f)}`;return {t,say:t+'.'};},
    end(dest,side){const s={ahead:'straight ahead',right:'on your right',left:'on your left',here:'right here'}[side];
      return {t:`${dest} is ${s}`,say:side==='here'?`You are at ${dest}.`:side==='ahead'?`${dest} is straight ahead.`:`${dest} is just ahead, ${s}.`};}},
  hi:{dest:'आपकी मंज़िल',
    kiosk(tw,m,lm){const to=lm?lm+' की ओर ':'';
      if(!tw)return {t:to+'सीधे चलिए',say:`${to}${m?farHi(m)+' ':''}सीधे चलिए।`};
      const side=SIDE_HI[tw.s];
      if(tw.k==='bear')return {t:`थोड़ा ${side} होकर ${to}चलिए`,say:`थोड़ा ${side} होकर, ${to}${farHi(m)} चलिए।`};
      const turn=tw.k==='uturn'?'पीछे':side;return {t:`${turn} मुड़कर ${to}चलिए`,say:`${turn} मुड़िए, फिर ${to}${farHi(m)} चलिए।`};},
    from(on,m,lm){const from=on?on+' से ':'',to=lm?lm+' की ओर ':'';return {t:`${from}${to}चलिए`,say:`${from}${to}${farHi(m)} चलिए।`};},
    off(lift,m,lm){const t=(lift?'लिफ्ट से निकलकर':'एस्केलेटर से उतरकर')+' '+(lm?lm+' की ओर':'सीधे')+' चलिए';
      return {t,say:`${lift?'लिफ्ट से निकलिए':'एस्केलेटर से उतरिए'}, फिर ${lm?lm+' की ओर '+farHi(m):farHi(m)+' सीधे'} चलिए।`};},
    turn(tw,at,again,m){const base=tw.k==='uturn'?'पीछे मुड़िए':(tw.k==='bear'?'थोड़ा ':'')+SIDE_HI[tw.s]+' मुड़िए';
      const t=(at?at+' के पास ':'')+(again?'दोबारा ':'')+base;return {t,say:`${t}, फिर ${farHi(m)} ${tw.k==='bear'?'आगे बढ़िए':'चलिए'}।`};},
    ride(lift,up,f){const t=`${lift?'लिफ्ट':'एस्केलेटर'} से ${up?'ऊपर':'नीचे'} ${floorWords(f,'hi')} पर जाइए`;return {t,say:t+'।'};},
    end(dest,side){const s={ahead:'सीधे सामने',right:'आपकी दाईं ओर',left:'आपकी बाईं ओर',here:'यहीं'}[side];
      return {t:`${dest} ${s} है`,say:side==='right'||side==='left'?`${dest} बस थोड़ा आगे, ${s} है।`:`${dest} ${s} है।`};}}
};
/* the graph's little jogs make choppy directions ("turn right, walk 3 m, turn left"): an inside stretch
   shorter than ~4 m folds into one corner, and a first or last bit shorter than ~3 m straightens out */
function tidyPath(P){P=P.slice();
  for(;;){let best=-1,bl=Infinity;for(let i=1;i<P.length-2;i++){const L=dist(P[i],P[i+1]);if(L*SC<4&&L<bl){bl=L;best=i;}}
    if(best<0)break;P.splice(best,2,[(P[best][0]+P[best+1][0])/2,(P[best][1]+P[best+1][1])/2]);}
  if(P.length>2&&dist(P[P.length-2],P[P.length-1])*SC<3)P.splice(P.length-2,1);
  if(P.length>2&&dist(P[0],P[1])*SC<3)P.splice(1,1);
  return P;}
/* Steps for the kiosk list and the phone. opts.dest: the destination's name.
   t: what the screen shows (the distance goes beside it); say: the same step as it is spoken, in whole sentences. */
function directions(r,opts){
  opts=opts||{};const W=DIRW[opts.lang]||DIRW.en;const dest=opts.dest||W.dest;const out=[];
  const tp=POIS[r.target],op=POIS[r.from];
  const skipB=new Set([tp&&tp.unit&&tp.unit.b,op&&op.unit&&op.unit.b].filter(Boolean));   // never "towards" where you start or finish
  r.legs.forEach((leg,li)=>{
    let P=[];leg.pts.forEach(p=>{if(!P.length||dist(P[P.length-1],p)>0.8)P.push(p);});
    P=tidyPath(simplify(P,7));                        // ~1 m: irons out the graph's small jogs
    const segs=[];for(let i=1;i<P.length;i++){const v=[P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]];const L=Math.hypot(v[0],v[1]);if(L>0.01)segs.push({a:P[i-1],b:P[i],v:[v[0]/L,v[1]/L],m:L*SC});}
    const startAt=[];let acc=0;segs.forEach(s=>{startAt.push(acc);acc+=s.m;});const legM=acc;
    const last=li===r.legs.length-1;
    if(!segs.length){if(!last)return;}
    const towards=(k)=>{const s=segs[k];if(!s)return null;const fp=[s.a[0]+(s.b[0]-s.a[0])*0.85,s.a[1]+(s.b[1]-s.a[1])*0.85];const lm=landmarkAt(leg.f,fp,9,skipB);return lm?lm.name:null;};
    // first instruction of the leg
    if(segs.length){
      let run=segs[0].m,k=0;while(k+1<segs.length&&!turnWord(turnAngle(segs[k].v,segs[k+1].v))){k++;run+=segs[k].m;}
      const lm=towards(k),m=run>=4?roundM(run):0;let st;
      if(li===0&&r.from==='kiosk'){const tw=turnWord(turnAngle(KIOSK_AHEAD,segs[0].v));st=Object.assign({ic:tw?tw.ic:'up'},W.kiosk(tw,m,lm));}
      else if(li===0){const o=POIS[r.from];const on=o?(o.unit&&o.unit.b?BRANDS[o.unit.b].name:(opts.from||o.name||'')):'';st=Object.assign({ic:'up'},W.from(on,m,lm));}
      else st=Object.assign({ic:'up'},W.off(leg.ride&&leg.ride.type==='lift',m,lm));
      if(m)st.m=m;st.f=leg.f;st.leg=li;st.at=0;out.push(st);
      // turns along the leg
      let prev=null;
      for(let i=k+1;i<segs.length;i++){
        const tw=turnWord(turnAngle(segs[i-1].v,segs[i].v));let run2=segs[i].m,j=i;
        while(j+1<segs.length&&!turnWord(turnAngle(segs[j].v,segs[j+1].v))){j++;run2+=segs[j].m;}
        if(tw){let at=landmarkAt(leg.f,segs[i].a,6,skipB);if(at&&prev&&prev.lm===at.name)at=null;          // the same shop twice running says nothing new
          const again=!at&&prev&&prev.ic===tw.ic&&tw.ic!=='uturn'&&startAt[i]-prev.at<25;const m2=roundM(run2);
          out.push(Object.assign({ic:tw.ic,m:m2,f:leg.f,leg:li,at:startAt[i]},W.turn(tw,at&&at.name,again,m2)));prev={ic:tw.ic,lm:at&&at.name,at:startAt[i]};}
        i=j;
      }
    }
    if(!last){const nx=r.legs[li+1],c=nx.ride.conn,up=FLOORS[nx.f].idx>FLOORS[leg.f].idx,lift=c.type==='lift';
      out.push(Object.assign({ic:lift?'lift':'esc',f:nx.f,ride:true,up,leg:li,at:legM},W.ride(lift,up,nx.f)));}
    else{let side='';const s=segs[segs.length-1];
      if(s&&tp){const ref=tp.unit?tp.unit.c:(tp.outline?ctr(bbox(tp.outline)):[tp.x,tp.y]);const w=[ref[0]-s.b[0],ref[1]-s.b[1]];
        const cr=s.v[0]*w[1]-s.v[1]*w[0],dt=s.v[0]*w[0]+s.v[1]*w[1];side=Math.abs(cr)<Math.abs(dt)*0.6?'ahead':(cr>0?'right':'left');}
      out.push(Object.assign({ic:'pin',f:leg.f,end:true,leg:li,at:legM},W.end(dest,side||'here')));}
  });
  return out;
}
/* the step a walker has reached: last step at or before (leg, metres along that leg) */
function stepAt(steps,leg,m){let k=0;steps.forEach((s,i)=>{if(s.leg<leg||(s.leg===leg&&s.at<=m+0.5))k=i;});return k;}
/* One line for a route, e.g. "3 min · 120 m · escalator to 1F" */
function routeSummary(r){const st=routeStats(r);const rides=r.legs.slice(1).map(l=>l.ride.conn.type==='lift'?'lift':'escalator');
  return `${st.min} min · ${st.m} m`+(rides.length?` · ${rides.length>1?rides.length+' '+rides[0]+'s':rides[0]} to ${FL[r.legs[r.legs.length-1].f]}`:'');}

/* ---------------- search: typo-tolerant, with synonyms ---------------- */
const SYNONYMS={
  cat:{fashion:'clothes clothing apparel fashion wear dress dresses designer couture ethnic saree sari lehenga kurta menswear womenswear bridal wedding shirts',
    access:'accessories bags handbags leather wallets jewellery jewelry jewels gold diamonds belts',
    beauty:'beauty cosmetics makeup skincare perfume fragrance salon spa grooming ayurveda haircut hair barber wellness',
    home:'home decor furniture furnishing interiors lighting homeware kitchen tableware linen gifts',
    food:'food eat dining restaurant restaurants cafe coffee tea dessert bakery chocolate lunch dinner breakfast snacks drinks',
    cinema:'cinema movie movies film films theatre theater multiplex tickets',other:''},
  brand:{starbucks:'coffee',bluetokai:'coffee',truefitt:'barber shave',geetanjali:'hair salon',manam:'chocolate',cinepolis:'movies',nykd:'lingerie innerwear',vnv:'sneakers'},
  facility:{wc:'toilet toilets restroom restrooms washroom washrooms wc loo bathroom ladies gents',lift:'lift lifts elevator elevators wheelchair',exit:'exit exits entrance way out gate taxi cab parking'}
};
/* the words Hindi speakers search with (typed in Devanagari on a phone) */
const SYNONYMS_HI={
  cat:{fashion:'फ़ैशन कपड़े ड्रेस साड़ी लहंगा कुर्ता शर्ट शादी डिज़ाइनर',access:'एक्सेसरीज़ बैग पर्स वॉलेट ज्वेलरी गहने सोना हीरा बेल्ट',
    beauty:'ब्यूटी मेकअप स्किनकेयर परफ़्यूम इत्र सैलून स्पा बाल हेयरकट नाई ग्रूमिंग वेलनेस',home:'होम डेकोर फ़र्नीचर घर सजावट लाइटिंग रसोई बर्तन तोहफ़े गिफ़्ट',
    food:'खाना खान-पान भोजन रेस्टोरेंट रेस्तरां कैफ़े कॉफ़ी चाय मिठाई डेज़र्ट बेकरी चॉकलेट नाश्ता लंच डिनर ड्रिंक्स',cinema:'सिनेमा फ़िल्म फ़िल्में मूवी पिक्चर टिकट',other:''},
  brand:{starbucks:'कॉफ़ी',bluetokai:'कॉफ़ी',truefitt:'नाई शेव',geetanjali:'बाल सैलून',manam:'चॉकलेट',cinepolis:'मूवी फ़िल्में',nykd:'इनरवियर',vnv:'स्नीकर्स जूते'},
  facility:{wc:'शौचालय टॉयलेट वॉशरूम बाथरूम',lift:'लिफ्ट व्हीलचेयर',exit:'निकास प्रवेश गेट बाहर पार्किंग टैक्सी कैब'}
};
for(const g of ['cat','brand','facility'])for(const k in SYNONYMS_HI[g])SYNONYMS[g][k]=(SYNONYMS[g][k]||'')+' '+SYNONYMS_HI[g][k];
/* lower case, no accents; Devanagari kept, with the nukta and chandrabindu folded so "कॉफी" finds "कॉफ़ी" */
function norm(s){return String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-़ͯ]/g,'').replace(/ँ/g,'ं').replace(/&/g,' and ').replace(/[^a-z0-9ऀ-ॣ०-ॿ]+/g,' ').trim();}
const toks=s=>norm(s).split(' ').filter(Boolean);
function editDist(a,b,max){if(Math.abs(a.length-b.length)>max)return max+1;const m=a.length,n=b.length;let pp=null,p=[],c;for(let j=0;j<=n;j++)p[j]=j;
  for(let i=1;i<=m;i++){c=[i];let lo=c[0];for(let j=1;j<=n;j++){const cost=a[i-1]===b[j-1]?0:1;let v=Math.min(p[j]+1,c[j-1]+1,p[j-1]+cost);
      if(pp&&i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])v=Math.min(v,pp[j-2]+1);c[j]=v;if(v<lo)lo=v;}
    if(lo>max)return max+1;pp=p;p=c;}return p[n];}
/* how well one query word matches one candidate word, 0..100 */
function wordScore(q,w){if(q===w)return 100;if(q.length>=2&&w.startsWith(q))return 70+20*q.length/w.length;
  if(q.length>=3&&w.includes(q))return 50;const tol=q.length>=7?2:q.length>=4?1:0;
  if(tol){const d=editDist(q,w.slice(0,Math.max(q.length,Math.min(w.length,q.length+1))),tol);if(d<=tol)return 44-d*8;}return 0;}
function fieldScore(qt,words){let best=0;for(const w of words){const s=wordScore(qt,w);if(s>best)best=s;}return best;}
let SEARCH_IX=null;
function searchIndex(){if(SEARCH_IX)return SEARCH_IX;
  SEARCH_IX=brandKeys().map(b=>{const B=BRANDS[b];return {b,name:toks(B.name),joined:norm(B.name).replace(/ /g,''),cat:toks(CATS[B.cat].name+' '+(SYNONYMS.cat[B.cat]||'')),syn:toks(SYNONYMS.brand[b]||''),units:unitsOfBrand(b).map(u=>norm(u.id).replace(/ /g,''))};});
  return SEARCH_IX;}
/* opts.tags(b): the live tags a store has added in the admin hub */
function searchBrands(q,opts){const qt=toks(q);if(!qt.length)return [];const tagsOf=(opts&&opts.tags)||(()=>[]);const joined=qt.join('');
  const res=[];
  for(const e of searchIndex()){const tags=toks((tagsOf(e.b)||[]).join(' '));let total=0,ok=true;
    for(const t of qt){const s=Math.max(fieldScore(t,e.name)*1.0,fieldScore(t,e.cat)*0.62,fieldScore(t,e.syn)*0.7,fieldScore(t,tags)*0.72,e.units.includes(t)?90:0);
      if(!s){ok=false;break;}total+=s;}
    if(e.units.includes(joined)){ok=true;total=Math.max(total,95*qt.length);}     // unit number, e.g. "15-A"
    // the whole query against the run-together name: "goodea", "starbuks"
    if(!ok||qt.length>1){const tol=joined.length>=7?2:joined.length>=4?1:0;
      if(e.joined.startsWith(joined)&&joined.length>=2){ok=true;total=Math.max(total,85*qt.length);}
      else if(tol&&editDist(joined,e.joined.slice(0,joined.length+1),tol)<=tol){ok=true;total=Math.max(total,45*qt.length);}}
    if(ok)res.push({b:e.b,score:total/qt.length});}
  return res.sort((a,b)=>b.score-a.score||BRANDS[a.b].name.localeCompare(BRANDS[b.b].name));}
/* facility words ("toilets", "lift", "exit") -> which service to offer first */
function searchFacility(q){const qt=toks(q);let best=null;
  for(const k in SYNONYMS.facility){const words=toks(SYNONYMS.facility[k]);for(const t of qt){const s=fieldScore(t,words);if(s>=44&&(!best||s>best.s))best={k,s};}}
  if(!best)return null;const words=toks(q),has=re=>words.some(w=>re.test(w));
  const g=has(/^(men|mens|gents|male|पुरुष|पुरुषों|जेंट्स|मर्द)$/)?'m':has(/^(women|womens|ladies|female|महिला|महिलाओं|लेडीज़|लेडीज|औरत)$/)?'f':null;
  return {kind:best.k,g};}

/* ---------------- the member card's barcode ----------------
   Interleaved 2 of 5 (ITF), the plain numeric barcode shop scanners read: digits go in pairs, the first of a pair in
   the bars and the second in the spaces, five elements each, two of them wide. Returns [[isBar, width], ...] with a
   quiet zone at both ends; an odd number of digits gets a leading 0. */
const ITF=['00110','10001','01001','11000','00101','10100','01100','00011','10010','01010'];
function itfBars(digits,narrow,wide){let d=String(digits==null?'':digits).replace(/\D/g,'');if(!d)return [];if(d.length%2)d='0'+d;
  const n=narrow||2,w=wide||5,out=[[0,n*10],[1,n],[0,n],[1,n],[0,n]];
  for(let i=0;i<d.length;i+=2){const a=ITF[+d[i]],b=ITF[+d[i+1]];for(let k=0;k<5;k++){out.push([1,a[k]==='1'?w:n]);out.push([0,b[k]==='1'?w:n]);}}
  out.push([1,w],[0,n],[1,n],[0,n*10]);return out;}

/* ---------------- dates and times ---------------- */
function localISO(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

if(typeof module!=='undefined'&&module.exports)module.exports={DATA,POIS,GRAPH,UNITS,KIOSK,SC,itfBars,walkEdges,walkGrid,snapToWalk,setMe,routeProgress,planBeacons,legLength,routeTo,escalatorRuns,openSpan,routeStats,routeSummary,directions,floorWords,stepAt,searchBrands,searchFacility,unitsOfBrand,floorsOfBrand,brandKeys,editDist,localISO,shortestTree,vacantUnits,registerStore,unregisterStore,voidRails,coveredAbove,pointInPoly,FLOORS,FLOOR_ORDER};
