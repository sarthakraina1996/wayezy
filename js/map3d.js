/* ============================================================
   3D MAP (three.js r147): stylised buildings, water, escalators, route animation.
   createMap3D() builds everything inside its own scope and returns the renderer API that
   mapview.js calls (setFloor, drawRoute, startGuide...). It throws if WebGL is missing,
   and mapview.js then falls back to the 2D plan in map2d.js.
   ============================================================ */
function createMap3D(onReady,onFail){
if(typeof THREE==='undefined'||!THREE.WebGLRenderer||!THREE.OrbitControls)throw new Error('three.js did not load');
const GAP=26, STACK_GAP=44, STOREY=5.3;   // STOREY: real floor-to-floor height, used for the floors seen below through the voids
const SHOP_H=4.6, CORE_H=5.2, SLAB=0.45;
const HEADING=KIOSK_FACING;                                   // the way the kiosk faces
const LOWPOWER=QS.get('quality')==='low'||(QS.get('quality')!=='high'&&(navigator.hardwareConcurrency||4)<4);

const wrap=document.getElementById('mapwrap');
const canvasHost=document.getElementById('scene');
const labelsEl=document.getElementById('labels');
const renderer=new THREE.WebGLRenderer({antialias:!LOWPOWER,powerPreference:'high-performance',failIfMajorPerformanceCaveat:false});
if(!renderer.getContext())throw new Error('WebGL context unavailable');
/* Smooth edges: MSAA plus supersampling. The map draws at up to 1.5x the screen's resolution
   (capped near 4K worth of pixels) and steps down on its own if frames get slow; ?quality=high keeps it up. */
const DPR=window.devicePixelRatio||1,HIGHQ=QS.get('quality')==='high';
const PR_MAX=LOWPOWER?Math.min(DPR,1):Math.min(2.5,Math.max(DPR,1)*1.5),PR_MIN=LOWPOWER?Math.min(DPR,1):Math.min(DPR,1.25);
let pixelRatio=PR_MAX;
function fitPixelRatio(w,h){return Math.max(PR_MIN,Math.min(pixelRatio,Math.sqrt(8.3e6/Math.max(1,w*h))));}
renderer.setPixelRatio(pixelRatio);
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled=!LOWPOWER;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;   // redrawn only when something moves (shadowKey in frame())
canvasHost.appendChild(renderer.domElement);
/* A kiosk runs for days; if the GPU driver resets, the WebGL context is lost. Say so, then
   reload once the context comes back (or after 8 s) - every GPU resource has to be rebuilt anyway. */
let contextLost=false;
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;
  // a phone loses it too (the app sent to the background, a busy GPU): the 2D map takes over at once and the visitor
  // keeps their place (store, route); a kiosk runs unattended, so it reloads and rebuilds everything
  if(VIEW==='app'&&onFail){onFail(new Error('WebGL context lost'));return;}
  showMapNotice(T('Refreshing the map…'));setTimeout(()=>location.reload(),8000);},false);
renderer.domElement.addEventListener('webglcontextrestored',()=>{if(VIEW!=='app')location.reload();},false);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(36,1,1,2400);
const controls=new THREE.OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=0.09;controls.screenSpacePanning=false;
controls.maxPolarAngle=1.25;controls.minPolarAngle=0.02;controls.minDistance=18;controls.maxDistance=360;controls.rotateSpeed=0.6;
controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};
controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_ROTATE};
const hemi=new THREE.HemisphereLight(0xffffff,0x6b5a45,0.6);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffd6a8,0.9);sun.castShadow=!LOWPOWER;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-120,right:120,top:120,bottom:-120,near:10,far:420});
sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.05;scene.add(sun);scene.add(sun.target);

/* ---------- image-based light: a soft sky in the app's own colours ----------
   Glass, water, metal and the stone all pick up gentle reflections from it; it is rendered once
   into a prefiltered environment map (PMREM), one for day and one for the evening. */
const pmrem=new THREE.PMREMGenerator(renderer);
function skyEnv(night){const s=new THREE.Scene();const R=50;
  const g=new THREE.SphereGeometry(R,48,24),p=g.attributes.position,col=[];
  const top=new THREE.Color(night?0x0A1522:0xA9C6DE),hor=new THREE.Color(night?0x243240:0xF6F1E8),gnd=new THREE.Color(night?0x0C120F:0x8E8676);
  for(let i=0;i<p.count;i++){const y=p.getY(i)/R;const c=y>0?hor.clone().lerp(top,Math.pow(y,0.55)):hor.clone().lerp(gnd,Math.min(1,-y*2.5));col.push(c.r,c.g,c.b);}
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  s.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide})));
  const panel=(w,h,x,y,z,c,k)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(k),side:THREE.DoubleSide}));
    m.position.set(x,y,z);m.lookAt(0,0,0);s.add(m);};                        // soft bright windows: where glossy things catch a highlight
  if(night){panel(34,5,0,6,-46,0xFFB36E,2.4);panel(18,3,-42,5,18,0x8FB0E0,0.9);panel(18,3,40,5,22,0xFFD9A0,1.2);}
  else{panel(24,24,-26,34,20,0xFFF3DC,3.2);panel(46,12,32,18,-28,0xFFFFFF,1.3);panel(30,8,-30,10,-34,0xE8F0FF,1.1);}
  const rt=pmrem.fromScene(s,0.04);s.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});return rt.texture;}
const ENV={day:skyEnv(false),night:skyEnv(true)};
scene.environment=ENV.day;

/* ---------- floor cross-fades without see-through walls ----------
   Changing floor fades each floor with an ordered dither (a fine, fixed screen pattern), not transparency:
   every floor keeps drawing with its depth, so walls never show through walls and no material changes state
   mid-animation. One uniform per floor drives all of its materials. The ghosted "all floors" view still uses
   real transparency (a steady ghost reads better than a dither). */
const FADEU={G:{value:1},F:{value:1},S:{value:1}},DITHER_T={value:0};
/* interleaved gradient noise, shifted every frame: the eye averages it into a smooth dissolve */
const DITHER_GLSL=`uniform float uFade;uniform float uDitherT;
float fadeNoise(vec2 p){p+=vec2(5.588238,3.12713)*uDitherT;return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}`;
function hookFade(m,f){if(!m||m.isShaderMaterial||m.userData.fadeF)return;m.userData.fadeF=f;const prev=m.onBeforeCompile,prevKey=m.customProgramCacheKey.bind(m);
  m.onBeforeCompile=function(sh,r){if(prev)prev.call(this,sh,r);sh.uniforms.uFade=FADEU[f];
    sh.uniforms.uDitherT=DITHER_T;
    sh.fragmentShader=sh.fragmentShader.replace('void main() {',DITHER_GLSL+'\nvoid main() {\n\tif(uFade<0.999&&fadeNoise(gl_FragCoord.xy)>uFade)discard;');};
  m.customProgramCacheKey=()=>prevKey()+'|fade';}
/* the page colour at the edge of the world: the ground fades into it, so the map has no frame */
const EDGE={bg:{value:new THREE.Color(0xF4F5F8)},r0:{value:170},r1:{value:420}};
function hookEdgeFade(m){const prev=m.onBeforeCompile,prevKey=m.customProgramCacheKey.bind(m);
  m.onBeforeCompile=function(sh,r){if(prev)prev.call(this,sh,r);sh.uniforms.edgeBg=EDGE.bg;sh.uniforms.edgeR0=EDGE.r0;sh.uniforms.edgeR1=EDGE.r1;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEdgeW;').replace('#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvec4 edgeP=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nedgeP=instanceMatrix*edgeP;\n#endif\nvEdgeW=(modelMatrix*edgeP).xyz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform vec3 edgeBg;uniform float edgeR0;uniform float edgeR1;varying vec3 vEdgeW;')
      .replace('#include <dithering_fragment>','#include <dithering_fragment>\ngl_FragColor.rgb=mix(gl_FragColor.rgb,edgeBg,smoothstep(edgeR0,edgeR1,length(vEdgeW.xz)));');};
  m.customProgramCacheKey=()=>prevKey()+'|edge';return m;}

const disp={G:0,F:GAP,S:2*GAP};
const floorGroup={}, unitEls={}, wcMesh={};
const routeGroup=new THREE.Group();scene.add(routeGroup);
const markerGroup=new THREE.Group();scene.add(markerGroup);
const W3=(f,x,y,h)=>new THREE.Vector3((x-CX)*SC,disp[f]+(h||0),(y-CY)*SC);
const P2=(x,y)=>new THREE.Vector2((x-CX)*SC,-(y-CY)*SC);   // shape space (becomes world x, -z)
const U={time:{value:0},night:{value:1}};                    // shared shader uniforms

/* ---------- procedural textures ---------- */
function canvasTex(w,h,draw,repeat){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');draw(g,w,h);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  if(repeat){t.wrapS=t.wrapT=THREE.RepeatWrapping;}return t;}
function rnd(s){let x=Math.sin(s*9301+49297)*233280;return x-Math.floor(x);}
// shopfront: glass bays + fascia band + stone pilasters (1 texture tile = 3m wide x full height)
function drawFacade(g,w,h,lit,seed){
  const fas=h*0.26;
  g.fillStyle='#E9E2D6';g.fillRect(0,0,w,h);                                   // stone
  g.fillStyle='#24292E';g.fillRect(0,0,w,fas);                                 // fascia
  g.fillStyle='rgba(255,206,140,.9)';g.fillRect(0,fas-4,w,4);                  // LED line
  const gx=w*0.07,gw=w*0.86,gy=fas+10,gh=h-gy-6;
  if(lit){g.fillStyle='#F6D29C';}
  else{g.fillStyle='#C9CFD1';}
  g.fillRect(gx,gy,gw,gh);
  if(lit){ // interior hints: shelves, racks, silhouettes
    g.fillStyle='rgba(120,70,30,.35)';for(let i=0;i<3;i++)g.fillRect(gx+8,gy+gh*(0.3+i*0.22),gw-16,5);
    for(let i=0;i<4;i++){const x=gx+12+rnd(seed+i)*(gw-40),y=gy+gh*0.45;g.fillStyle=`rgba(60,40,30,${0.25+rnd(seed*3+i)*0.25})`;
      g.beginPath();g.ellipse(x,y,9,9,0,0,7);g.fill();g.fillRect(x-9,y+10,18,gh*0.4);}
  }else{g.fillStyle='rgba(255,255,255,.35)';for(let i=0;i<6;i++)g.fillRect(gx,gy+i*gh/6,gw,2);}
  g.fillStyle='#2F3438';g.fillRect(gx+gw/2-2,gy,4,gh);                        // mullion
  g.fillRect(gx,gy,gw,3);
}
const TEX={};
function makeTextures(){
  TEX.facade=canvasTex(256,384,(g,w,h)=>drawFacade(g,w,h,true,1),true);
  TEX.facadeGlow=canvasTex(256,384,(g,w,h)=>{g.fillStyle='#000';g.fillRect(0,0,w,h);const fas=h*0.26;
    const gx=w*0.07,gw=w*0.86,gy=fas+10,gh=h-gy-6;g.fillStyle='#8a6a3a';g.fillRect(gx,gy,gw,gh);g.fillStyle='#ffc98a';g.fillRect(0,fas-4,w,4);},true);
  TEX.hoarding=canvasTex(256,384,(g,w,h)=>drawFacade(g,w,h,false,2),true);
  TEX.core=canvasTex(128,384,(g,w,h)=>{g.fillStyle='#33475A';g.fillRect(0,0,w,h);g.fillStyle='#4E6679';for(let y=0;y<h;y+=24)g.fillRect(0,y,w,2);},true);
  // roof membrane: light, quiet, with faint seams (the rooftop logo plaque is what the eye should find)
  TEX.roof=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#E4E0D8';g.fillRect(0,0,w,h);for(let i=0;i<1600;i++){const v=214+Math.floor(rnd(i)*26);g.fillStyle=`rgba(${v},${v-3},${v-8},.35)`;g.fillRect(rnd(i*7)*w,rnd(i*13)*h,2,2);}
    g.strokeStyle='rgba(160,152,140,.22)';g.lineWidth=1.5;for(let x=0;x<=w;x+=128){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}},true);
  TEX.paving=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#D9D3C7';g.fillRect(0,0,w,h);for(let i=0;i<16;i++)for(let j=0;j<16;j++){const v=rnd(i*31+j*7)*14;g.fillStyle=`rgb(${214+v},${208+v},${196+v})`;g.fillRect(i*16+1,j*16+1,14,14);}},true);
  TEX.stone=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#E8E4DC';g.fillRect(0,0,w,h);g.strokeStyle='rgba(160,150,135,.35)';g.lineWidth=2;for(let x=0;x<=w;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}for(let y=0;y<=h;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}},true);
  TEX.deck=canvasTex(256,256,(g,w,h)=>{for(let y=0;y<h;y+=16){const v=rnd(y)*20;g.fillStyle=`rgb(${160+v},${112+v},${72+v})`;g.fillRect(0,y,w,15);}},true);
  TEX.lawn=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#4E6A3C';g.fillRect(0,0,w,h);for(let i=0;i<2500;i++){const v=rnd(i)*40;g.fillStyle=`rgba(${70+v},${110+v},${50+v},.5)`;g.fillRect(rnd(i*3)*w,rnd(i*5)*h,2,3);}},true);
  TEX.plaza=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#CFC6B6';g.fillRect(0,0,w,h);for(let i=0;i<8;i++)for(let j=0;j<4;j++){const v=rnd(i*17+j*5)*16;g.fillStyle=`rgb(${200+v},${192+v},${178+v})`;g.fillRect(i*32+1,j*64+1,30,62);}},true);
  TEX.road=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#34373A';g.fillRect(0,0,w,h);for(let i=0;i<1500;i++){const v=40+rnd(i)*30;g.fillStyle=`rgba(${v},${v},${v},.6)`;g.fillRect(rnd(i*3)*w,rnd(i*5)*h,2,2);}g.fillStyle='#D9D3C2';for(let x=0;x<w;x+=64)g.fillRect(x,h/2-3,34,6);},true);
  TEX.steps=canvasTex(64,64,(g,w,h)=>{g.fillStyle='#3A3F44';g.fillRect(0,0,w,h);g.fillStyle='#7C8388';for(let y=0;y<h;y+=8)g.fillRect(0,y,w,3);},true);
}
makeTextures();

/* ---------- materials (one set per floor so a floor can be ghosted on its own) ---------- */
function matSet(){
  const m={};
  m.facade=new THREE.MeshStandardMaterial({map:TEX.facade,emissiveMap:TEX.facadeGlow,emissive:0xffffff,emissiveIntensity:1,roughness:0.55,metalness:0.05});
  m.hoarding=new THREE.MeshStandardMaterial({map:TEX.hoarding,roughness:0.8});
  m.core=new THREE.MeshStandardMaterial({map:TEX.core,roughness:0.6});
  m.coreRoof=new THREE.MeshStandardMaterial({color:0x2E4756,roughness:0.7});
  m.wc=new THREE.MeshStandardMaterial({color:0x2B7A8C,roughness:0.6});
  m.slab=new THREE.MeshStandardMaterial({map:TEX.stone,roughness:0.85});
  m.slabEdge=new THREE.MeshStandardMaterial({color:0xD8D2C6,roughness:0.9});
  m.deck=new THREE.MeshStandardMaterial({map:TEX.deck,roughness:0.8});
  m.steps=new THREE.MeshStandardMaterial({map:TEX.steps,roughness:0.5,metalness:0.3});
  m.glass=new THREE.MeshStandardMaterial({color:0xBFE3EE,transparent:true,opacity:0.32,roughness:0.1,metalness:0.1,depthWrite:false});
  m.rail=new THREE.MeshStandardMaterial({color:0x1F2427,roughness:0.4,metalness:0.6});
  m.railGlass=new THREE.MeshStandardMaterial({color:0xCFE8EF,transparent:true,opacity:0.3,roughness:0.08,metalness:0.1,depthWrite:false,side:THREE.DoubleSide});
  m.coping=new THREE.MeshStandardMaterial({map:TEX.stone,color:0xEDE6D8,roughness:0.6});
  m.basin=new THREE.MeshStandardMaterial({color:0x2C4A52,roughness:0.9});
  m.soil=new THREE.MeshStandardMaterial({color:0x3B2E24,roughness:1});
  m.shopWall=new THREE.MeshStandardMaterial({color:0xE3DACB,roughness:0.8,emissive:0xE3DACB,emissiveIntensity:0.15});
  m.fasciaMat=new THREE.MeshStandardMaterial({color:0x1E2551,roughness:0.5,metalness:0.2});
  m.shopGlass=new THREE.MeshStandardMaterial({color:0xD6EEF5,transparent:true,opacity:0.14,roughness:0.05,metalness:0.1,depthWrite:false});
  m.doorGlass=new THREE.MeshStandardMaterial({color:0xD6EEF5,transparent:true,opacity:0.22,roughness:0.05,metalness:0.1,depthWrite:false});
  m.floorWood=new THREE.MeshStandardMaterial({color:0xC49A6C,roughness:0.6,emissive:0xC49A6C,emissiveIntensity:0.35});
  m.floorTile=new THREE.MeshStandardMaterial({color:0xE8E4DC,roughness:0.4,emissive:0xE8E4DC,emissiveIntensity:0.3});
  m.ceilLight=new THREE.MeshBasicMaterial({color:0xFFF1D6,side:THREE.DoubleSide});
  m.furn=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.7,emissive:0x3A3228,emissiveIntensity:0.6});
  m.ac=new THREE.MeshStandardMaterial({color:0xCDD0D0,roughness:0.45,metalness:0.4});          // rooftop plant
  m.escTruss=new THREE.MeshStandardMaterial({color:0x3A4046,roughness:0.5,metalness:0.55});   // escalator truss and skirts
  m.parapet=new THREE.MeshStandardMaterial({color:0xF3EEE4,roughness:0.7});
  INTERIOR_MATS.push([m.floorWood,0.12,0.55],[m.floorTile,0.1,0.5],[m.furn,0.15,1.3],[m.shopWall,0.0,0.08]);
  m.sign=null;
  return m;
}
const MATS={};
/* roofs carry a whisper of their category's colour; empty units stay plain */
function roofTint(cat){return cat?new THREE.Color(CATS[cat].fill).lerp(new THREE.Color(0xF6F2EA),0.62):new THREE.Color(0xE9E5DD);}
function roofMat(f,cat){ // per unit (so it can be highlighted)
  return new THREE.MeshStandardMaterial({map:TEX.roof,color:roofTint(cat),roughness:0.85});
}

/* ---------- geometry helpers ---------- */
function shapeFrom(pts){const s=new THREE.Shape();pts.forEach((p,i)=>{const v=P2(p[0],p[1]);i?s.lineTo(v.x,v.y):s.moveTo(v.x,v.y);});s.closePath();return s;}
function prism(pts,h,mats,y0,uvScaleH){
  const g=new THREE.ExtrudeGeometry(shapeFrom(pts),{depth:h,bevelEnabled:false,UVGenerator:WALL_UV(h)});
  g.rotateX(-Math.PI/2);if(y0)g.translate(0,y0,0);
  const m=new THREE.Mesh(g,mats);m.castShadow=true;m.receiveShadow=true;return m;
}
// UVs: walls map 1 unit u = 3 m, v = 0..1 over height; caps in metres
function WALL_UV(h){return{
  generateTopUV(g,v,a,b,c){return[new THREE.Vector2(v[a*3]/6,v[a*3+1]/6),new THREE.Vector2(v[b*3]/6,v[b*3+1]/6),new THREE.Vector2(v[c*3]/6,v[c*3+1]/6)];},
  generateSideWallUV(g,v,a,b,c,d){
    const ax=v[a*3],ay=v[a*3+1],az=v[a*3+2],bx=v[b*3],by=v[b*3+1],cz=v[c*3+2];
    const len=Math.hypot(bx-ax,by-ay);const u0=0,u1=Math.max(1,Math.round(len/3));
    const va=az/h,vc=cz/h;
    return[new THREE.Vector2(u0,va),new THREE.Vector2(u1,va),new THREE.Vector2(u1,vc),new THREE.Vector2(u0,vc)];}
};}
function flat(pts,y,mat,thick){const m=prism(pts,thick||0.02,[mat,mat],y-(thick||0.02));m.castShadow=false;return m;}

/* ---------- signs ---------- */
function signTexture(text,w){
  const H=128,Wp=Math.min(2048,Math.max(256,Math.round(w*110)));
  return canvasTex(Wp,H,(g,W,H)=>{g.fillStyle='#1E2551';g.fillRect(0,0,W,H);g.fillStyle='#E8413B';g.fillRect(0,H-6,W,6);
    let fs=76;g.font=`600 ${fs}px Inter, "Segoe UI", system-ui, sans-serif`;const T=text.toUpperCase();
    const sp=0.06;const mw=()=>g.measureText(T).width+T.length*fs*sp;
    while(mw()>W*0.9&&fs>20){fs-=2;g.font=`600 ${fs}px Inter, "Segoe UI", system-ui, sans-serif`;}
    g.fillStyle='#FFFFFF';g.textBaseline='middle';
    let x=(W-mw())/2;for(const ch of T){g.fillText(ch,x,H/2);x+=g.measureText(ch).width+fs*sp;}
  });
}
const treeData={G:[],F:[],S:[]};
/* ---------- geometry merge helper ---------- */
function mergeGeos(list){
  const parts=list.map(o=>{let g=o.geo.index?o.geo.toNonIndexed():o.geo;const n=g.attributes.position.count;
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(n*2),2));
    if(!g.attributes.color){const c=new Float32Array(n*3);const col=new THREE.Color(o.color||0xffffff);for(let i=0;i<n;i++){c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;}g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));}
    return g;});
  const out=new THREE.BufferGeometry();
  ['position','normal','uv','color'].forEach(k=>{const size=parts[0].attributes[k].itemSize;let len=0;parts.forEach(p=>len+=p.attributes[k].array.length);
    const arr=new Float32Array(len);let off=0;parts.forEach(p=>{arr.set(p.attributes[k].array,off);off+=p.attributes[k].array.length;});out.setAttribute(k,new THREE.BufferAttribute(arr,size));});
  return out;
}
function noise3(x,y,z){return Math.sin(x*1.7+y*3.1)*0.5+Math.sin(y*2.3+z*1.9)*0.3+Math.sin(z*2.9+x*2.1)*0.2;}

/* ---------- foliage geometry ---------- */
function lobe(cx,cy,cz,r,seed,cA,cB){
  const g=new THREE.IcosahedronGeometry(r,2);const p=g.attributes.position,n=p.count;const col=new Float32Array(n*3),nor=new Float32Array(n*3);
  const A=new THREE.Color(cA),B=new THREE.Color(cB),c=new THREE.Color(),v=new THREE.Vector3();
  for(let i=0;i<n;i++){v.fromBufferAttribute(p,i);const d=v.clone().normalize();
    const k=1+0.16*noise3(d.x*3+seed,d.y*3,d.z*3-seed)+0.07*noise3(d.x*9,d.y*9+seed,d.z*9);v.copy(d).multiplyScalar(r*k);
    p.setXYZ(i,v.x+cx,v.y*0.92+cy,v.z+cz);nor[i*3]=d.x;nor[i*3+1]=d.y;nor[i*3+2]=d.z;
    const t=THREE.MathUtils.clamp(0.5+d.y*0.5+0.18*noise3(d.x*7+seed,d.y*7,d.z*7),0,1);c.copy(A).lerp(B,t);col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
  g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));return g;
}
function trunkGeo(h,r0,r1,bend){
  const pts=[];for(let i=0;i<=6;i++){const t=i/6;pts.push(new THREE.Vector3(Math.sin(t*1.6)*bend,t*h,Math.sin(t*2.1)*bend*0.4));}
  const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),10,1,7,false);
  const p=g.attributes.position;const uv=g.attributes.uv;const pc=new THREE.Vector3();
  // taper: tube radius 1 -> scale around centreline by height
  const curve=new THREE.CatmullRomCurve3(pts);
  for(let i=0;i<p.count;i++){const t=uv.getX(i);const c=curve.getPointAt(t);pc.fromBufferAttribute(p,i).sub(c);const r=r0+(r1-r0)*t;pc.multiplyScalar(r).add(c);p.setXYZ(i,pc.x,pc.y,pc.z);}
  g.computeVertexNormals();return g;
}
function makeTreeGeo(variant){
  const parts=[];const dark=variant?0x2F4F24:0x365A28,light=variant?0x7FA04A:0x8DB356;
  parts.push({geo:trunkGeo(variant?3.4:2.6,0.26,0.12,0.25),color:0x5A4434});
  // two branches
  const br1=trunkGeo(1.4,0.1,0.04,0.3);br1.rotateZ(0.8);br1.translate(0.1,2.0,0);parts.push({geo:br1,color:0x5A4434});
  const br2=trunkGeo(1.3,0.1,0.04,0.2);br2.rotateZ(-0.7);br2.rotateY(1.4);br2.translate(0,2.2,0.1);parts.push({geo:br2,color:0x5A4434});
  const L=variant?[[0,4.6,0,1.35],[0.2,5.8,0.1,1.05],[0.6,3.9,0.4,1.0],[-0.6,4.1,-0.3,1.05],[0,6.6,0,0.7]]
                 :[[0,3.7,0,1.55],[1.0,3.3,0.3,1.15],[-0.9,3.4,-0.4,1.2],[0.2,4.5,-0.3,1.15],[-0.3,3.2,1.0,1.05],[0.4,3.5,-1.1,1.0]];
  L.forEach((l,i)=>parts.push({geo:lobe(l[0],l[1],l[2],l[3],i*1.7+variant*5,dark,light)}));
  return mergeGeos(parts);
}
function makeBushGeo(){return mergeGeos([[0,0.45,0,0.6],[0.5,0.35,0.2,0.45],[-0.45,0.38,-0.15,0.48]].map((l,i)=>({geo:lobe(l[0],l[1],l[2],l[3],i*3.1,0x2E4D22,0x6E9A40)})));}
function frondTexture(){return canvasTex(128,512,(g,w,h)=>{g.clearRect(0,0,w,h);g.strokeStyle='#3F6B2A';g.lineWidth=5;g.beginPath();g.moveTo(w/2,h);g.lineTo(w/2,4);g.stroke();
  for(let y=h-12;y>10;y-=9){const t=y/h;const len=(w/2-6)*Math.sin(Math.PI*Math.min(1,(1-t)*1.15+0.1));
    [-1,1].forEach(s=>{g.strokeStyle='#5C8A3A';g.lineWidth=3.2;
      g.beginPath();g.moveTo(w/2,y);g.quadraticCurveTo(w/2+s*len*0.5,y-8,w/2+s*len,y-24);g.stroke();});}},false);}
function makePalmParts(){
  const trunk=trunkGeo(5.6,0.24,0.17,0.45);const p=trunk.attributes.position,n=p.count,c=new Float32Array(n*3),uv=trunk.attributes.uv,col=new THREE.Color();
  for(let i=0;i<n;i++){const t=uv.getX(i);const ring=0.5+0.5*Math.sin(t*90);col.set(0x6F5A44).lerp(new THREE.Color(0x9C8466),ring*0.6);c[i*3]=col.r;c[i*3+1]=col.g;c[i*3+2]=col.b;}
  trunk.setAttribute('color',new THREE.BufferAttribute(c,3));
  const top=new THREE.Vector3(0.45*Math.sin(1.6),5.6,0.45*0.4*Math.sin(2.1));
  const fr=[];const N=11;
  for(let k=0;k<N;k++){
    const g=new THREE.PlaneGeometry(1.1,3.6,2,10);g.translate(0,1.8,0);const q=g.attributes.position;
    const droop=0.9+rnd(k)*0.8;
    for(let i=0;i<q.count;i++){const x=q.getX(i),y=q.getY(i);const s=y/3.6;const fold=Math.abs(x)*0.35;
      q.setXYZ(i,x,s*3.2,(-droop*s*s*2.2+0.9*s)+fold);}
    // lay frond outwards: its length runs along +y -> rotate so it points outwards then tilt
    g.rotateX(Math.PI/2- (0.35+rnd(k*3)*0.3));
    g.rotateY(k/N*Math.PI*2+rnd(k*7)*0.3);
    g.translate(top.x,top.y,top.z);g.computeVertexNormals();fr.push({geo:g});
  }
  const nut=lobe(top.x,top.y-0.15,top.z,0.32,9,0x4A3A22,0x6B5530);
  return {trunk:mergeGeos([{geo:trunk},{geo:nut}]),fronds:mergeGeos(fr)};
}
/* ---------- the Blender asset kit (blender/assets.py -> export_decor.py -> js/decor.js) ----------
   Trees, palms, bushes, street lamps, bollards and the entrance gate are modelled in Blender and loaded
   from DECOR.glb; the fountains follow DECOR.jets. Without the kit (no decor.js or no GLTFLoader) the
   built-in versions below are used instead. */
let KIT=null;const KIT_MATS={};
function loadKit(){
  if(typeof DECOR==='undefined'||!THREE.GLTFLoader||QS.get('decor')==='0')return Promise.resolve(null);
  return new Promise(res=>{const t=setTimeout(()=>res(null),8000);
    try{const bin=atob(DECOR.glb.slice(DECOR.glb.indexOf(',')+1));const buf=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);
      new THREE.GLTFLoader().parse(buf.buffer,'',g=>{clearTimeout(t);g.scene.updateMatrixWorld(true);const kit={};g.scene.children.forEach(o=>{kit[o.name]=o;});res(kit);},
        e=>{clearTimeout(t);reportError(e,'decor');res(null);});}
    catch(e){clearTimeout(t);reportError(e,'decor');res(null);}});}
/* the meshes of one asset, with materials cloned per floor (floors fade independently) */
function kitParts(name,f){const root=KIT&&KIT[name];if(!root)return null;const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();const out=[];
  root.traverse(o=>{if(!o.isMesh)return;const key=f+'|'+o.material.name;
    if(!KIT_MATS[key]){const m=o.material.clone();if(m.map)m.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());KIT_MATS[key]=m;
      // the Blender sky-light bake darkens crowns inside; lift the whole plant back to daylight brightness here
      if(/leaf|frond|flowers|bougain/.test(m.name)){m.color.multiplyScalar(/flowers|bougain/.test(m.name)?1.3:1.6);if(m.alphaTest>0&&!LOWPOWER)m.alphaToCoverage=true;}   // soft leaf edges with MSAA
      else if(/bark|palmtrunk/.test(m.name))m.color.multiplyScalar(1.3);}
    out.push({geo:o.geometry,mat:KIT_MATS[key],m:new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld)});});return out;}
/* copies of an asset: items = [{x,y,z,rot,s,sy}] in world units; one instanced mesh per part */
function placeKit(group,f,name,items,shadow,tint){const parts=kitParts(name,f);if(!parts||!items.length)return false;
  const M=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3(),sc=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),col=new THREE.Color(),white=new THREE.Color(1,1,1);
  parts.forEach(pt=>{const im=new THREE.InstancedMesh(pt.geo,pt.mat,items.length);const leafy=tint&&/leaf|frond/.test(pt.mat.name);
    items.forEach((it,i)=>{p.set(it.x,it.y||0,it.z);q.setFromAxisAngle(up,it.rot||0);sc.set(it.s||1,(it.s||1)*(it.sy||1),it.s||1);M.compose(p,q,sc).multiply(pt.m);im.setMatrixAt(i,M);
      if(leafy){col.setHSL(0.24+rnd(i*9+it.x)*0.07,0.55,0.5).lerp(white,0.62+rnd(i*7)*0.12);im.setColorAt(i,col);}});
    im.castShadow=!!shadow&&!pt.mat.transparent;im.receiveShadow=true;group.add(im);});return true;}

let TREE_GEO=null;
function buildTrees(f,group){
  const T=f==='G'?treeData.G.filter(t=>t[3]==='bush'||!coveredAbove(t[0],t[1])):treeData[f];if(!T.length)return;
  if(KIT){const byK={t0:[],t1:[],t2:[],ash:[],palm:[],bush:[],bushf:[]};
    const KITNAME={t0:'tree_a',t1:'tree_b',t2:'tree_c',ash:'ashoka',palm:'palm',bush:'bush',bushf:'bush_f'},FALLBACK={t2:'t0',ash:'t1',bushf:'bush'};   // older kits lack the newer species
    T.forEach((t,i)=>{let type=t[3]||(rnd(i*3.3)>0.5?'t0':'t1');if(!KIT[KITNAME[type]])type=FALLBACK[type]||'t0';const w=W3(f,t[0],t[1],0);
      const k=(t[2]||1)*({t0:0.8,t1:0.8,t2:0.78,ash:0.85}[type]||1);
      (byK[type]||byK.t0).push({x:w.x,y:t[4]||0,z:w.z,rot:rnd(i+t[0])*6.28,s:k,sy:0.92+rnd(i*5+t[1])*0.16});});
    for(const k in byK)placeKit(group,f,KITNAME[k],byK[k],!/bush/.test(k),true);return;}
  if(!TREE_GEO){TREE_GEO={t0:makeTreeGeo(0),t1:makeTreeGeo(1),bush:makeBushGeo(),palm:makePalmParts(),frondTex:frondTexture()};}
  const byType={t0:[],t1:[],bush:[],palm:[]};
  T.forEach((t,i)=>{const type=t[3]||(rnd(i*3.3)>0.5?'t0':'t1');(byType[type]||byType.t0).push(t);});
  const leafMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.85});
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),s=new THREE.Vector3(),p=new THREE.Vector3(),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
  const place=(geo,mat,list,shadow,tint)=>{if(!list.length)return;const im=new THREE.InstancedMesh(geo,mat,list.length);
    list.forEach((t,i)=>{const w=W3(f,t[0],t[1],0);const k=t[2]||1;p.set(w.x,t[4]||0,w.z);q.setFromAxisAngle(up,rnd(i+t[0])*6.28);s.set(k,k*(0.92+rnd(i*5+t[1])*0.2),k);m.compose(p,q,s);im.setMatrixAt(i,m);
      if(tint){col.setHSL(0.25+rnd(i*9)*0.05,0.25+rnd(i*4)*0.2,0.45+rnd(i*7)*0.12);im.setColorAt(i,col);}});
    im.castShadow=shadow;im.receiveShadow=true;group.add(im);};
  if(!CANOPY)CANOPY=makeCanopyTree();const TM=treeMats(f);const tl=byType.t0.concat(byType.t1);
  place(CANOPY.bark,TM.bark,tl,true,false);place(CANOPY.lobes,TM.lobes,tl,true,true);place(CANOPY.cards,TM.cards,tl,false,true);place(TREE_GEO.bush,leafMat,byType.bush,false,true);
  place(TREE_GEO.palm.trunk,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.9}),byType.palm,true,false);
  place(TREE_GEO.palm.fronds,new THREE.MeshStandardMaterial({map:TREE_GEO.frondTex,alphaTest:0.45,side:THREE.DoubleSide,roughness:0.8,color:0xffffff}),byType.palm,false,false);
}

/* ---------- water: scrolling normal maps, fresnel sky reflection, sun glints, fountain ripples ---------- */
function waterNormalTex(){
  const N=256,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');const img=g.createImageData(N,N);
  const waves=[];for(let i=0;i<14;i++){const fx=Math.round((rnd(i)*2-1)*(3+i*1.3)),fy=Math.round((rnd(i*7)*2-1)*(3+i*1.3))||1;waves.push([fx,fy,rnd(i*13)*6.28,1/(1+i*0.55)]);}
  const H=(x,y)=>{let h=0;waves.forEach(w=>{h+=w[3]*Math.sin(2*Math.PI*(w[0]*x+w[1]*y)/N+w[2]);});return h;};
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const dx=H(x+1,y)-H(x-1,y),dy=H(x,y+1)-H(x,y-1);const v=new THREE.Vector3(-dx*2.2,-dy*2.2,1).normalize();
    const i=(y*N+x)*4;img.data[i]=(v.x*0.5+0.5)*255;img.data[i+1]=(v.y*0.5+0.5)*255;img.data[i+2]=(v.z*0.5+0.5)*255;img.data[i+3]=255;}
  g.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
const MAXRIP=64;
/* the pools use the Blender water (js/water.js: the FFT ocean's normals and the caustics they cast); without it, a procedural map */
function imgTex(src){const img=new Image(),t=new THREE.Texture(img);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  img.onload=()=>{t.needsUpdate=true;};img.src=src;return t;}
const BW=typeof WATER!=='undefined'&&WATER.normal;
const WU={time:U.time,night:U.night,nTex:{value:BW?imgTex(WATER.normal):waterNormalTex()},cTex:{value:BW?imgTex(WATER.caustics):null},hasC:{value:BW?1:0},tile:{value:BW?1/WATER.size:0.16},
  sunDir:{value:new THREE.Vector3(-0.5,0.8,0.3).normalize()},rip:{value:Array.from({length:MAXRIP},()=>new THREE.Vector3(9999,0,9999))},nRip:{value:0}};
const waterMat=new THREE.ShaderMaterial({uniforms:WU,
  vertexShader:`varying vec3 vW;varying vec2 vUv;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float time;uniform float night;uniform sampler2D nTex;uniform sampler2D cTex;uniform float hasC;uniform float tile;uniform vec3 sunDir;uniform vec3 rip[${MAXRIP}];uniform int nRip;
  varying vec3 vW;varying vec2 vUv;
  vec2 slope(vec2 uv){vec3 n=texture2D(nTex,uv).xyz*2.-1.;return n.xy/max(n.z,.35);}
  void main(){
    vec2 p=vW.xz;
    vec2 g=hasC>.5
      ?(slope(p*tile+vec2(time*0.016,time*0.010))*0.55+slope(p*tile*1.63+vec2(-time*0.012,time*0.019))*0.45)*0.22    // two layers of the Blender ripples drifting apart
      :(texture2D(nTex,p*0.16+vec2(time*0.020,time*0.013)).xy*2.-1.)*0.4+(texture2D(nTex,p*0.37+vec2(-time*0.017,time*0.024)).xy*2.-1.)*0.2;
    for(int i=0;i<${MAXRIP};i++){if(i>=nRip)break;vec2 d=p-rip[i].xz;float r=length(d);float big=rip[i].y;if(r<1.4+big*2.){float w=cos(r*(13.-big*4.)-time*(8.-big))*exp(-r*(2.4-big*1.2))*(0.42+big*0.15);g+=normalize(d+1e-4)*w;}}
    vec3 N=normalize(vec3(g.x,1.6,g.y));
    vec3 V=normalize(cameraPosition-vW);
    float fres=0.03+0.97*pow(1.-max(dot(N,V),0.),5.);
    vec3 R=reflect(-V,N);float up=clamp(R.y,0.,1.);
    vec3 skyD=mix(vec3(.93,.91,.86),vec3(.52,.68,.84),pow(up,.7));
    vec3 skyN=mix(vec3(.13,.15,.19),vec3(.03,.05,.10),pow(up,.6))+vec3(.22,.13,.05)*pow(1.-up,8.);
    vec3 sky=mix(skyD,skyN,night);
    float edge=min(min(vUv.x,1.-vUv.x),min(vUv.y,1.-vUv.y));
    vec3 deep=mix(vec3(.04,.27,.32),vec3(.005,.05,.08),night);
    vec3 shal=mix(vec3(.24,.56,.55),vec3(.03,.22,.28),night);
    vec3 body=mix(shal,deep,smoothstep(0.,.3,edge));
    float caust;
    if(hasC>.5){float c1=texture2D(cTex,p*tile*1.25+g*0.35+vec2(time*0.021,-time*0.013)).r,c2=texture2D(cTex,p*tile*0.93-g*0.25+vec2(-time*0.015,time*0.019)).r;
      caust=min(c1,c2)*1.7+c1*c2*0.6;                                     // two drifting copies: the light net moves like it does in a real pool
      body+=caust*mix(vec3(.34,.44,.36),vec3(.07,.24,.28),night)*(0.55+0.45*smoothstep(0.,.3,edge));}
    else{caust=pow(max(0.,1.-abs(g.x*2.3+g.y*1.7)),6.);body+=caust*mix(vec3(.06,.12,.12),vec3(.05,.16,.18),night);}
    vec3 col=mix(body,sky,fres);
    vec3 L=normalize(sunDir);float spec=pow(max(dot(R,L),0.),220.);
    col+=spec*mix(vec3(1.4),vec3(1.2,.8,.45),night);
    col+=night*vec3(.05,.22,.26)*(1.-smoothstep(0.,.22,edge))*0.8;     // pool edge lights
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`});
const fountains=[];let ripCount=0;
function addFountain(group,x,y,z,scale){
  const sc=scale||1;const jets=[[0,5.2*sc,0.10,150]];for(let k=0;k<6;k++)jets.push([k/6*6.283,3.2*sc,1.05*sc,46]);
  let n=0;jets.forEach(j=>n+=j[3]);
  const vel=new Float32Array(n*3),ph=new Float32Array(n),sz=new Float32Array(n);let i=0;
  jets.forEach((j,ji)=>{for(let k=0;k<j[3];k++,i++){const a=ji===0?rnd(i)*6.283:j[0]+(rnd(i*3)-0.5)*0.12;const hs=ji===0?j[2]*rnd(i*5):j[2]*(0.9+rnd(i*5)*0.2);
    vel[i*3]=Math.cos(a)*hs;vel[i*3+1]=j[1]*(0.93+rnd(i*7)*0.1);vel[i*3+2]=Math.sin(a)*hs;ph[i]=rnd(i*11+x);sz[i]=0.6+rnd(i*13)*0.8;}});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));
  g.setAttribute('vel',new THREE.BufferAttribute(vel,3));g.setAttribute('ph',new THREE.BufferAttribute(ph,1));g.setAttribute('sz',new THREE.BufferAttribute(sz,1));
  const m=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
    vertexShader:`uniform float time;attribute vec3 vel;attribute float ph;attribute float sz;varying float vA;
    void main(){float life=2.*vel.y/9.8;float t=fract(time/life*0.9+ph)*life;
      vec3 p=vec3(vel.x*t,vel.y*t-4.9*t*t,vel.z*t);float u=t/life;vA=smoothstep(0.,.08,u)*(1.-smoothstep(.75,1.,u));
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(sz*(90.+60.*u)/-mv.z,1.,14.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float night;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;
      vec3 col=mix(vec3(.85,.93,1.),vec3(.75,.95,1.),night);gl_FragColor=vec4(col,vA*pow(1.-d*2.,1.5)*mix(.55,.8,night));}`});
  const pts=new THREE.Points(g,m);pts.position.set(x,y,z);pts.frustumCulled=false;group.add(pts);fountains.push(pts);
  // foam disc at the base
  const foam=new THREE.Mesh(new THREE.CircleGeometry(0.55*sc,24),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.55,depthWrite:false}));
  foam.rotation.x=-Math.PI/2;foam.position.set(x,y+0.02,z);group.add(foam);
  if(ripCount<MAXRIP){WU.rip.value[ripCount].set(x,0,z);ripCount++;WU.nRip.value=ripCount;}
}
/* fountains from the Blender layout (DECOR.jets, Blender metres: x, y, z up): glassy arcing jets that cross each
   pool, a geyser in the middle with its falling crown, spray where the water lands, and ripples on the pool */
const toW=v=>new THREE.Vector3(v[0],v[2],-v[1]);                       // Blender (x, y, z-up) -> three.js
function arcPts(a,b,h,n){const pts=[];for(let i=0;i<=n;i++){const t=i/n;const base=a.y+(b.y-a.y)*t;   // same curve as assets._arc_points
  pts.push(new THREE.Vector3(a.x+(b.x-a.x)*t,base+4*(h-Math.max(a.y,b.y))*t*(1-t),a.z+(b.z-a.z)*t));}return pts;}
function buildJets(group){const J=DECOR.jets;const tubes=[],drops=[];let ji=0;
  const tube=(pts,r,seg,seed)=>tubes.push({geo:new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),seg,r,8,false),color:new THREE.Color(seed,seed,seed)});
  J.forEach(j=>{ji++;
    if(j.kind==='arc'){const a=toW(j.a),b=toW(j.b);tube(arcPts(a,b,j.h,20),0.05,28,rnd(ji*3.1));
      for(let k=0;k<22;k++)drops.push([b.x,b.y,b.z,(rnd(ji*31+k)-0.5)*1.2,1.0+rnd(ji*7+k)*1.4,(rnd(ji*13+k)-0.5)*1.2,rnd(ji*3+k*5),0.6+rnd(k+ji)*0.7]);
      const pts=arcPts(a,b,j.h,20);for(let k=0;k<10;k++){const q=pts[4+Math.floor(rnd(ji*41+k)*14)];drops.push([q.x,q.y,q.z,(rnd(ji*43+k)-0.5)*0.35,0.4+rnd(ji*47+k)*0.5,(rnd(ji*53+k)-0.5)*0.35,rnd(ji*59+k),0.4+rnd(k*7+ji)*0.4]);}
      if(ripCount<MAXRIP){WU.rip.value[ripCount].set(b.x,0,b.z);ripCount++;}}
    else{const a=toW(j.a),top=a.clone().add(new THREE.Vector3(0,j.h,0));
      tube([a,a.clone().lerp(top,0.5),top],0.09,12,rnd(ji*5.3));
      for(let k=0;k<8;k++){const ang=k/8*Math.PI*2;const land=new THREE.Vector3(a.x+Math.cos(ang)*0.55,a.y,a.z+Math.sin(ang)*0.55);tube(arcPts(top,land,top.y+0.15,12),0.04,14,rnd(ji*11+k));}
      for(let k=0;k<140;k++){const ang=rnd(ji*17+k)*6.283,hs=rnd(ji*19+k)*0.7;drops.push([a.x,a.y,a.z,Math.cos(ang)*hs,5.3+rnd(ji*5+k)*1.0,Math.sin(ang)*hs,rnd(ji*23+k),0.6+rnd(k*3+ji)*0.8]);}
      if(ripCount<MAXRIP){WU.rip.value[ripCount].set(a.x,1,a.z);ripCount++;}}});
  WU.nRip.value=ripCount;
  const g=mergeGeos(tubes);const c=g.attributes.color,n=c.count,seed=new Float32Array(n);for(let i=0;i<n;i++)seed[i]=c.getX(i);g.setAttribute('seed',new THREE.BufferAttribute(seed,1));
  const jm=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,
    vertexShader:`attribute float seed;varying float vU;varying float vS;varying vec3 vN;varying vec3 vV;
      void main(){vU=uv.x;vS=seed;vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=cameraPosition-w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`uniform float time;uniform float night;varying float vU;varying float vS;varying vec3 vN;varying vec3 vV;
      void main(){float f=fract(vU*5.-time*1.9+vS*7.);float streak=smoothstep(0.,.1,f)*(1.-smoothstep(.1,.55,f));
        float fres=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.5);
        vec3 day=mix(vec3(.86,.94,.97),vec3(1.),fres*.5+streak*.5);
        vec3 nite=mix(vec3(.5,.9,1.),vec3(.95,1.,1.),streak)*1.6;
        float a=clamp(.62+.3*fres+.2*streak,0.,.95)*smoothstep(0.,.04,vU);
        gl_FragColor=vec4(mix(day,nite,night),a);
        #include <tonemapping_fragment>
        #include <encodings_fragment>
      }`});
  const jets=new THREE.Mesh(g,jm);jets.renderOrder=2;jets.frustumCulled=false;group.add(jets);
  if(LOWPOWER)return;
  // spray: every droplet flies on its own arc and starts again when it lands
  const N=drops.length,org=new Float32Array(N*3),vel=new Float32Array(N*3),ph=new Float32Array(N),sz=new Float32Array(N);
  drops.forEach((d,i)=>{org.set([d[0],d[1],d[2]],i*3);vel.set([d[3],d[4],d[5]],i*3);ph[i]=d[6];sz[i]=d[7];});
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.BufferAttribute(org,3));pg.setAttribute('vel',new THREE.BufferAttribute(vel,3));
  pg.setAttribute('ph',new THREE.BufferAttribute(ph,1));pg.setAttribute('sz',new THREE.BufferAttribute(sz,1));
  const pm=new THREE.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,
    vertexShader:`uniform float time;attribute vec3 vel;attribute float ph;attribute float sz;varying float vA;
      void main(){float life=2.*vel.y/9.8;float t=fract(time/life+ph)*life;vec3 p=position+vec3(vel.x*t,vel.y*t-4.9*t*t,vel.z*t);float u=t/life;
        vA=smoothstep(0.,.1,u)*(1.-smoothstep(.72,1.,u));vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(sz*170./-mv.z,1.5,13.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`uniform float night;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;
      vec3 col=mix(vec3(.97,.99,1.),vec3(.75,.97,1.)*1.4,night);gl_FragColor=vec4(col,vA*pow(1.-d*2.,.7)*.95);}`});
  const spray=new THREE.Points(pg,pm);spray.frustumCulled=false;spray.renderOrder=3;group.add(spray);}
/* water feature: pools with palm planters between them */
function buildWaterFeature(group,F,M){
  // pair the narrow strips into one wider channel per band
  const bands=[];for(let i=0;i<F.planters.length;i+=2){const a=F.planters[i],b=F.planters[i+1]||a;bands.push([Math.min(a[0],b[0])-1.5,a[1],Math.max(a[2],b[2])+1.5,a[3]]);}
  bands.forEach(r=>{
    const len=r[3]-r[1];const nPools=Math.max(1,Math.round(len/34));const gap=7;const pl=(len-gap*(nPools-1))/nPools;
    for(let k=0;k<nPools;k++){const y0=r[1]+k*(pl+gap),y1=y0+pl;
      const e=1.2,inner=[r[0]+e,y0+e,r[2]-e,y1-e];
      [[r[0],y0,r[2],y0+e],[r[0],y1-e,r[2],y1],[r[0],y0+e,r[0]+e,y1-e],[r[2]-e,y0+e,r[2],y1-e]].forEach(q=>group.add(prism(rectPtsW(q),0.55,[M.coping,M.coping])));
      const basin=prism(rectPtsW(inner),0.1,[M.basin,M.basin],0.02);basin.castShadow=false;group.add(basin);
      const wg=new THREE.PlaneGeometry((inner[2]-inner[0])*SC,(inner[3]-inner[1])*SC);wg.rotateX(-Math.PI/2);
      const wm=new THREE.Mesh(wg,waterMat);const c=W3('G',(inner[0]+inner[2])/2,(inner[1]+inner[3])/2,0);wm.position.set(c.x,0.44,c.z);wm.receiveShadow=false;group.add(wm);
      if(!LOWPOWER&&!(typeof DECOR!=='undefined'&&DECOR.jets)){const nF=Math.max(1,Math.round(pl/22));for(let j=0;j<nF;j++){const yy=y0+(j+0.5)*pl/nF;const p=W3('G',(r[0]+r[2])/2,yy,0);addFountain(group,p.x,0.45,p.z,0.8);}}
      if(k<nPools-1){const yy=y1+gap/2;const pc=[r[0]+0.5,y1+0.8,r[2]-0.5,y1+gap-0.8];group.add(prism(rectPtsW(pc),0.7,[M.soil,M.coping]));treeData.G.push([(r[0]+r[2])/2,yy,0.95,'palm',0.7]);}
    }
  });
  if(typeof DECOR!=='undefined'&&DECOR.jets)buildJets(group);
}

/* ---------- main entrance gate ---------- */
const ENTRANCE={x:397,y:1163,w:83};    // south end of the ground-floor street, 94 pt between the building lines (x 350 and 444):
                                       // an 83 pt opening puts each pylon's centre on a building line, so the gate frames the boulevard
const GATE_W=2048,GATE_H=256;
function gateSignTex(){const c=document.createElement('canvas');c.width=GATE_W;c.height=GATE_H;const g=c.getContext('2d');
  g.fillStyle='#221D19';g.fillRect(0,0,GATE_W,GATE_H);g.fillStyle='#C9A36A';g.fillRect(0,GATE_H-8,GATE_W,8);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  const img=new Image();img.onload=()=>{const h=150,w=img.width*h/img.height;g.drawImage(img,(GATE_W-w)/2,(GATE_H-8-h)/2,w,h);t.needsUpdate=true;};img.src=LOGO_W;
  return t;}
function buildEntrance(group,M,F){
  const E=ENTRANCE,half=E.w/2;const KG=!!(KIT&&KIT.gate);
  const stone=new THREE.MeshStandardMaterial({map:TEX.stone,color:0xE2D6C2,roughness:0.7});
  const bronze=new THREE.MeshStandardMaterial({color:0x3A2F27,roughness:0.45,metalness:0.4});
  const wood=new THREE.MeshStandardMaterial({color:0x8A5A36,roughness:0.6});
  if(KG){const c=W3('G',E.x,E.y,0);placeKit(group,'G','gate',[{x:c.x,y:0,z:c.z,rot:0,s:1}],true,false);}
  else{
  // pylons
  [[E.x-half-8,E.x-half+6],[E.x+half-6,E.x+half+8]].forEach(([x0,x1])=>{
    const py=prism(rectPtsW([x0,E.y-8,x1,E.y+8]),8.4,[stone,stone],0);group.add(py);
    const strip=new THREE.Mesh(new THREE.BoxGeometry(0.12,7.6,0.12),new THREE.MeshStandardMaterial({color:0xFFD9A0,emissive:0xFFC070,emissiveIntensity:1.2}));
    const c=W3('G',(x0+x1)/2,E.y+8,0);strip.position.set(c.x,4.0,c.z+0.02);group.add(strip);});
  // canopy beam
  const beamPts=rectPtsW([E.x-half-12,E.y-10,E.x+half+12,E.y+10]);
  const beam=prism(beamPts,1.5,[bronze,bronze],7.0);group.add(beam);
  const soffit=prism(rectPtsW([E.x-half-11,E.y-9,E.x+half+11,E.y+9]),0.2,[wood,wood],6.85);group.add(soffit);
  // downlights under the canopy
  for(let x=E.x-half;x<=E.x+half;x+=11){const d=new THREE.Mesh(new THREE.CircleGeometry(0.18,12),new THREE.MeshBasicMaterial({color:0xFFE2B0}));d.rotation.x=Math.PI/2;const c=W3('G',x,E.y,0);d.position.set(c.x,6.83,c.z);group.add(d);}
  // sign on both faces
  const tex=gateSignTex();const sw=(E.w+20)*SC*0.82;
  const sm=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:0xffffff,emissiveIntensity:0.9,roughness:0.5});
  [1,-1].forEach(s=>{const sg=new THREE.Mesh(new THREE.PlaneGeometry(sw*0.8,sw*0.8*GATE_H/GATE_W),sm);const c=W3('G',E.x,E.y+s*10.2,0);sg.position.set(c.x,7.75,c.z);if(s<0)sg.rotation.y=Math.PI;group.add(sg);});
  }
  // entrance plaza, steps and road
  const pv=F.paving;const plazaY1=pv[3]+70;
  const plaza=flat(rectPtsW([E.x-130,pv[3]+2,E.x+130,plazaY1]),0.03,new THREE.MeshStandardMaterial({map:TEX.plaza,roughness:0.9}),0.05);plaza.receiveShadow=true;group.add(plaza);
  for(let k=0;k<3;k++){const st=prism(rectPtsW([E.x-60+k*6,pv[3]+18+k*5,E.x+60-k*6,pv[3]+23+k*5]),0.001,[stone,stone],0);} // (flush; kept for layout)
  const kerb=prism(rectPtsW([pv[0]-60,plazaY1,pv[2]+60,plazaY1+3]),0.18,[stone,stone],0);group.add(kerb);
  // the road itself is part of the street grid (buildSurroundings); a zebra crossing at the gate (as in the Blender model)
  const paint=new THREE.MeshStandardMaterial({color:0xF2F0EA,roughness:0.6,side:THREE.DoubleSide});const ry0=plazaY1+3,ry1=plazaY1+62;
  const zebra=[];for(let k=-5;k<=5;k++){const g=new THREE.ShapeGeometry(shapeFrom(rectPtsW([E.x+k*6.2-1.6,ry0+5,E.x+k*6.2+1.6,ry1-5])));g.rotateX(-Math.PI/2);g.translate(0,0.04,0);zebra.push({geo:g});}
  const zm=new THREE.Mesh(mergeGeos(zebra),paint);zm.receiveShadow=true;group.add(zm);
  if(KIT&&KIT.lamp){const L=[];for(let x=pv[0]-40;x<pv[2]+60;x+=90){const c=W3('G',x,plazaY1-4,0);L.push({x:c.x,y:0,z:c.z,rot:-Math.PI/2,s:1});}placeKit(group,'G','lamp',L,true,false);}
  if(KIT&&KIT.bollard){const B=[];for(let i=0;i<14;i++){const x=E.x-120+i*(240/13);if(Math.abs(x-E.x)<=half+4)continue;const c=W3('G',x,plazaY1-8,0);B.push({x:c.x,y:0,z:c.z,rot:0,s:1});}placeKit(group,'G','bollard',B,false,false);}
  else{
  // bollards with lights
  const bg=new THREE.CylinderGeometry(0.12,0.14,0.9,10);bg.translate(0,0.45,0);
  const bm=new THREE.InstancedMesh(bg,new THREE.MeshStandardMaterial({color:0x2B2B2B,roughness:0.5,metalness:0.4}),14);
  const cap=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13,0.13,0.08,10),new THREE.MeshStandardMaterial({color:0xFFE0A8,emissive:0xFFC77A,emissiveIntensity:1.4}),14);
  const mm=new THREE.Matrix4();for(let i=0;i<14;i++){const x=E.x-120+i*(240/13);const c=W3('G',x,plazaY1-6,0);mm.makeTranslation(c.x,0,c.z);bm.setMatrixAt(i,mm);mm.makeTranslation(c.x,0.92,c.z);cap.setMatrixAt(i,mm);}
  group.add(bm,cap);
  }
  // palms and planters flanking the gate
  const ph=59;                                    // the flanking palms keep their places (the baked ground shading has them there)
  [[E.x-ph-30,E.y+26],[E.x+ph+30,E.y+26],[E.x-ph-60,E.y+40],[E.x+ph+60,E.y+40]].forEach(p=>{
    group.add(prism(rectPtsW([p[0]-7,p[1]-7,p[0]+7,p[1]+7]),0.6,[M.soil,stone]));treeData.G.push([p[0],p[1],1.05,'palm',0.6]);});
  addPlanterTree(group,'G',E.x-ph-100,E.y+40,0,0.9);addPlanterTree(group,'G',E.x+ph+100,E.y+40,0,0.9);
  for(let x=E.x-125;x<=E.x+125;x+=16){if(Math.abs(x-E.x)<ph+20)continue;treeData.G.push([x,plazaY1-14,0.9,rnd(x*3)>0.55?'bushf':'bush']);}   // bougainvillea among the hedge
  return plazaY1;
}

/* ---------- the neighbourhood: ring roads with ashoka avenues, then city blocks as a white architectural model ----------
   Everything outside the site is drawn in a quiet, light palette and fades into the page colour at the edge of
   the world, so the map sits in a place instead of floating on a board. World metres; the site is x -62..64,
   z -100..99; the ring roads run round it and carry on as the city's street grid. */
const RING={w:-70.5,e:72.5,n:-108.5,s:104.1,rw:9.4};         // ring road centre lines and width
function cityFacadeTex(){return canvasTex(512,512,(g,w,h)=>{const n=8,cw=w/n,ch=h/n;g.fillStyle='#F3F0E9';g.fillRect(0,0,w,h);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){g.fillStyle=j%2?'#D5DCDF':'#D9E0E3';g.fillRect(i*cw+cw*0.2,j*ch+ch*0.28,cw*0.6,ch*0.5);g.fillStyle='rgba(120,110,95,.14)';g.fillRect(i*cw,j*ch+ch*0.94,cw,ch*0.06);}},true);}
function cityGlowTex(){return canvasTex(512,512,(g,w,h)=>{const n=8,cw=w/n,ch=h/n;g.fillStyle='#000';g.fillRect(0,0,w,h);
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const r=rnd(i*13+j*7.7);if(r<0.42)continue;g.fillStyle=r>0.85?'#FFE3B0':r>0.65?'#E9C08A':'#9C7A52';g.fillRect(i*cw+cw*0.2,j*ch+ch*0.28,cw*0.6,ch*0.5);}},true);}
const CITY_MATS=[];
function buildSurroundings(group){
  const quads={ground:[],road:[],paint:[],path:[],plinth:[],park:[]};
  const quad=(list,x0,z0,x1,z1,y,col)=>{const g=new THREE.PlaneGeometry(Math.abs(x1-x0),Math.abs(z1-z0));g.rotateX(-Math.PI/2);g.translate((x0+x1)/2,y,(z0+z1)/2);list.push({geo:g,color:col});};
  const E=470;                                               // how far the world goes (it has faded out well before)
  quad(quads.ground,-E,-E,E,E,-0.1,0xFFFFFF);
  // the street grid: the ring roads carry on into the city
  const X=[-374.5,-298.5,-222.5,-146.5,RING.w,1,RING.e,148.5,224.5,300.5,376.5],Z=[-412.5,-336.5,-260.5,-184.5,RING.n,-3.7,RING.s,180.1,256.1,332.1,408.1];
  const inSite=(x,z)=>x>RING.w-1&&x<RING.e+1&&z>RING.n-1&&z<RING.s+1;
  const hw=RING.rw/2;
  X.forEach(x=>{const ring=x===RING.w||x===RING.e;const segs=x===1?[[-E,RING.n],[RING.s,E]]:[[-E,E]];
    segs.forEach(([z0,z1])=>{quad(quads.road,x-hw,z0,x+hw,z1,0.02,0xFFFFFF);
      for(let z=z0+2;z<z1-4;z+=9){if(Z.some(zz=>Math.abs(zz-z)<hw+1.5||Math.abs(zz-(z+4))<hw+1.5))continue;quad(quads.paint,x-0.12,z,x+0.12,z+4,0.035,0xFFFFFF);}   // dashed centre line
      if(ring)[-1,1].forEach(s=>quad(quads.path,x+s*hw,z0,x+s*(hw+4.2),z1,0.045,0xFFFFFF));});});
  Z.forEach(z=>{const ring=z===RING.n||z===RING.s;const segs=z===-3.7?[[-E,RING.w],[RING.e,E]]:[[-E,E]];
    segs.forEach(([x0,x1])=>{quad(quads.road,x0,z-hw,x1,z+hw,0.021,0xFFFFFF);
      for(let x=x0+2;x<x1-4;x+=9){if(X.some(xx=>Math.abs(xx-x)<hw+1.5||Math.abs(xx-(x+4))<hw+1.5))continue;quad(quads.paint,x,z-0.12,x+4,z+0.12,0.035,0xFFFFFF);}
      if(ring)[-1,1].forEach(s=>quad(quads.path,x0,z+s*hw,x1,z+s*(hw+4.2),0.046,0xFFFFFF));
      if(ring)[-1,1].forEach(s=>quad(quads.paint,x0,z+s*(hw-0.9)-0.1,x1,z+s*(hw-0.9)+0.1,0.034,0xFFFFFF));});});   // edge lines
  // blocks: towers get taller away from the mall; a few are parks
  const boxes=[],parkTrees=[],streetTrees=[],lamps=[];
  for(let i=0;i<X.length-1;i++)for(let j=0;j<Z.length-1;j++){const x0=X[i]+hw+(X[i]===RING.w||X[i]===RING.e?6:4),x1=X[i+1]-hw-(X[i+1]===RING.w||X[i+1]===RING.e?6:4);
    const z0=Z[j]+hw+(Z[j]===RING.n||Z[j]===RING.s?6:4),z1=Z[j+1]-hw-(Z[j+1]===RING.n||Z[j+1]===RING.s?6:4);const cx=(x0+x1)/2,cz=(z0+z1)/2;
    if(inSite(cx,cz)||x1-x0<12||z1-z0<12)continue;
    const d=Math.hypot(cx,cz),seed=i*31+j*17,south=cz>RING.s;           // the kiosk looks north: keep the blocks in front of the mall low
    quad(quads.plinth,x0,z0,x1,z1,0.06,0xFFFFFF);
    if(rnd(seed)<0.2&&d<330){quad(quads.park,x0+3,z0+3,x1-3,z1-3,0.08,0xFFFFFF);
      for(let k=0;k<7;k++)parkTrees.push({x:x0+6+rnd(seed*3+k)*(x1-x0-12),y:0,z:z0+6+rnd(seed*5+k)*(z1-z0-12),rot:rnd(k+seed)*6.28,s:0.9+rnd(k*7+seed)*0.35});continue;}
    const lots=rnd(seed*7)<0.5?[[x0,z0,x1,z1]]:(x1-x0>z1-z0?[[x0,z0,(x0+x1)/2-3,z1],[(x0+x1)/2+3,z0,x1,z1]]:[[x0,z0,x1,(z0+z1)/2-3],[x0,(z0+z1)/2+3,x1,z1]]);
    lots.forEach((L,k)=>{const r=rnd(seed*11+k),inset=3+r*5;const hMax=south?(d<200?9:18):(d<170?16:d<260?30:44);
      const h=Math.max(6,hMax*(0.45+0.55*rnd(seed*13+k)));boxes.push([L[0]+inset,L[1]+inset,L[2]-inset,L[3]-inset,h]);
      if(rnd(seed*17+k)<0.45&&h>12){const w=(L[2]-L[0])-inset*2,dd=(L[3]-L[1])-inset*2;boxes.push([L[0]+inset+w*0.25,L[1]+inset+dd*0.2,L[2]-inset-w*0.25,L[3]-inset-dd*0.35,h+6+rnd(seed*19+k)*14]);}});}
  // avenues of ashoka trees and street lamps along both sides of the ring roads
  const alongX=(x,z0,z1,step)=>{for(let z=z0;z<=z1;z+=step)[-1,1].forEach(s=>streetTrees.push({x:x+s*(hw+2.1),y:0,z,rot:rnd(z+x)*6.28,s:0.85+rnd(z*3+x)*0.25}));};
  const alongZ=(z,x0,x1,step)=>{for(let x=x0;x<=x1;x+=step)[-1,1].forEach(s=>streetTrees.push({x,y:0,z:z+s*(hw+2.1),rot:rnd(x+z)*6.28,s:0.85+rnd(x*3+z)*0.25}));};
  alongX(RING.w,-190,190,17);alongX(RING.e,-190,190,17);alongZ(RING.n,-180,180,17);alongZ(RING.s,-180,-30,17);alongZ(RING.s,30,180,17);   // the gate's crossing stays open
  const cross=t=>X.some(x=>Math.abs(t.x-x)<hw+3)&&Z.some(z=>Math.abs(t.z-z)<hw+3);   // not on a junction
  const ST=streetTrees.filter(t=>!cross(t));
  for(let z=-200;z<=200;z+=34)[RING.w,RING.e].forEach(x=>lamps.push({x:x+(x<0?-1:1)*(hw+0.4),y:0,z,rot:x<0?0:Math.PI,s:1}));
  // merged meshes, one per surface
  const SURF=[['ground',0xE7E1D6,1],['plinth',0xF1ECE3,0.95],['path',0xE3DCCF,0.9],['road',0x7B7C7E,0.92],['paint',0xF4F2EC,0.6],['park',0xA9BE93,1]];
  SURF.forEach(([k,c,rough])=>{if(!quads[k].length)return;const m=hookEdgeFade(new THREE.MeshStandardMaterial({color:c,roughness:rough,metalness:0}));m.userData.city=k;CITY_MATS.push(m);
    const mesh=new THREE.Mesh(mergeGeos(quads[k]),m);mesh.receiveShadow=true;group.add(mesh);});
  // buildings: one merged mesh, walls with windows, lit at night
  if(!TEX.city){TEX.city=cityFacadeTex();TEX.cityGlow=cityGlowTex();}
  const pos=[],nor=[],uv=[],col=[];
  const face=(a,b,c,d,n,u0,v0,u1,v1,shade)=>{[a,b,c,a,c,d].forEach(p=>pos.push(p[0],p[1],p[2]));for(let i=0;i<6;i++)nor.push(n[0],n[1],n[2]);
    [[u0,v0],[u1,v0],[u1,v1],[u0,v0],[u1,v1],[u0,v1]].forEach(t=>uv.push(t[0],t[1]));for(let i=0;i<6;i++)col.push(shade,shade,shade);};
  boxes.forEach(([x0,z0,x1,z1,h])=>{if(x1-x0<4||z1-z0<4)return;const bay=4,fl=3.6,U=(L)=>L/bay/8,V=h/fl/8,o=rnd(x0+z0)*0.5;
    face([x0,0,z1],[x1,0,z1],[x1,h,z1],[x0,h,z1],[0,0,1],o,0,o+U(x1-x0),V,0.97);
    face([x1,0,z0],[x0,0,z0],[x0,h,z0],[x1,h,z0],[0,0,-1],o,0,o+U(x1-x0),V,0.93);
    face([x1,0,z1],[x1,0,z0],[x1,h,z0],[x1,h,z1],[1,0,0],o,0,o+U(z1-z0),V,0.95);
    face([x0,0,z0],[x0,0,z1],[x0,h,z1],[x0,h,z0],[-1,0,0],o,0,o+U(z1-z0),V,0.9);
    face([x0,h,z1],[x1,h,z1],[x1,h,z0],[x0,h,z0],[0,1,0],0,0,0.001,0.001,1.04);});   // roofs: plain, a touch brighter
  if(pos.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    const m=hookEdgeFade(new THREE.MeshStandardMaterial({map:TEX.city,vertexColors:true,roughness:0.85,emissive:0xFFD9A0,emissiveMap:TEX.cityGlow,emissiveIntensity:0}));m.userData.city='bld';CITY_MATS.push(m);
    const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;group.add(mesh);}
  if(KIT){placeKit(group,'G','ashoka',ST,false,true);placeKit(group,'G','tree_a',parkTrees,false,true);if(KIT.lamp)placeKit(group,'G','lamp',lamps,false,false);}
  // the tree and lamp materials out here fade with the edge of the world too
  group.traverse(o=>{if(o.isInstancedMesh&&!o.material.userData.edge){o.material.userData.edge=1;hookEdgeFade(o.material);}});
}

/* ---------- escalators ---------- */
const escSteps=[];
/* run = engine.escalatorRuns(): built once, on the floor it leaves, rising the full storey towards where it arrives */
function addEscalator(group,run,rise,mats){const r=run.r;
  const w=(r[2]-r[0])*SC,d=(r[3]-r[1])*SC;const alongX=run.axis==='x';const L=alongX?w:d,W=alongX?d:w;
  const c=W3('G',(r[0]+r[2])/2,(r[1]+r[3])/2,0);
  const g=new THREE.Group();g.position.set(c.x,0,c.z);                          // built rising towards local +x, then turned
  g.rotation.y=alongX?(run.dir>0?0:Math.PI):(run.dir>0?-Math.PI/2:Math.PI/2);
  const land=1.3,hrun=Math.max(1,L-land*2),ang=Math.atan2(rise,hrun),slope=Math.hypot(hrun,rise),Wi=W*0.8;
  const tex=TEX.steps.clone();tex.needsUpdate=true;tex.repeat.set(slope*2.5,1);
  const sm=new THREE.MeshStandardMaterial({map:tex,roughness:0.5,metalness:0.3});escSteps.push(tex);
  const incline=(mesh,up)=>{mesh.rotation.z=ang;mesh.position.set(-Math.sin(ang)*up,rise/2+Math.cos(ang)*up,mesh.position.z);return mesh;};   // offset along the incline's normal
  g.add(incline(new THREE.Mesh(new THREE.BoxGeometry(slope,0.22,Wi),[mats.rail,mats.rail,sm,mats.rail,mats.rail,mats.rail]),0));   // the steps
  g.add(incline(new THREE.Mesh(new THREE.BoxGeometry(slope+0.6,0.9,Wi*1.02),mats.escTruss),-0.56));                                   // truss underneath
  const l1=new THREE.Mesh(new THREE.BoxGeometry(land,0.22,Wi),mats.rail);l1.position.set(-L/2+land/2,0.02,0);                          // landing plates, the top one flush with the floor above
  const l2=l1.clone();l2.position.set(L/2-land/2,rise-0.1,0);g.add(l1,l2);
  [-1,1].forEach(sd=>{
    const gl=incline(new THREE.Mesh(new THREE.BoxGeometry(slope+1.2,0.95,0.04),mats.glass),0.6);gl.position.z=sd*Wi*0.52;
    const hr=incline(new THREE.Mesh(new THREE.BoxGeometry(slope+1.5,0.09,0.11),mats.rail),1.1);hr.position.z=sd*Wi*0.52;
    const sk=incline(new THREE.Mesh(new THREE.BoxGeometry(slope+0.8,0.3,0.08),mats.escTruss),0.12);sk.position.z=sd*Wi*0.5;   // skirt along the steps
    g.add(gl,hr,sk);});
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  group.add(g);return g;
}

/* ============================================================
   SHOPFRONTS v4: see-through glazing, lit interiors, sliding doors
   ============================================================ */
/* furniture (merged, vertex coloured) */
function boxG(w,h,d,x,y,z,col){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);return{geo:g,color:col};}
function cylG(r0,r1,h,x,y,z,col,seg){const g=new THREE.CylinderGeometry(r0,r1,h,seg||12);g.translate(x,y,z);return{geo:g,color:col};}
const GARMENT=[0x2E4756,0xB04A4A,0xE0B354,0x4F7A3A,0x6D5A99,0xE8E4DC,0x1F2327,0x3E6E9E,0xC26A3D,0xD9B8A0];
const PRODUCT=[0xF2E6D8,0xC9A36A,0xE07A5F,0x3D405B,0x81B29A,0xF2CC8F,0xFFFFFF,0x9E768F];
function FURN(){
  const F={};
  { const p=[cylG(.025,.025,1.55,-.75,.78,0,0x2A2A2A),cylG(.025,.025,1.55,.75,.78,0,0x2A2A2A),boxG(1.56,.04,.04,0,1.55,0,0x2A2A2A),boxG(1.6,.05,.45,0,.03,0,0x2A2A2A)];
    for(let i=0;i<7;i++)p.push(boxG(.06,.9+rnd(i)*.25,.45,-.6+i*.2,1.05-rnd(i)*.12,0,GARMENT[i%GARMENT.length]));F.rack=mergeGeos(p);}
  F.mannequin=mergeGeos([cylG(.28,.3,.06,0,.03,0,0xDDDDDD),cylG(.03,.03,.6,0,.33,0,0xBBBBBB),cylG(.2,.15,.75,0,1.0,0,0xEFEAE2),cylG(.12,.2,.35,0,1.52,0,0xEFEAE2),{geo:new THREE.SphereGeometry(.12,12,10).translate(0,1.83,0),color:0xEFEAE2}]);
  { const p=[boxG(2.0,2.2,.45,0,1.1,0,0x8A6A4A)];for(let s=0;s<4;s++){p.push(boxG(1.9,.04,.44,0,.35+s*.5,.01,0x6B5238));for(let k=0;k<6;k++)p.push(boxG(.22,.25+rnd(s*9+k)*.12,.3,-.8+k*.32,.5+s*.5,.06,PRODUCT[(s*6+k)%PRODUCT.length]));}F.shelf=mergeGeos(p);}
  { const p=[boxG(1.5,.08,.85,0,.86,0,0xC9A36A),boxG(1.4,.8,.75,0,.42,0,0xEDE6DA)];for(let k=0;k<5;k++)p.push(boxG(.2,.18+rnd(k)*.2,.2,-.55+k*.27,1.0,(rnd(k*3)-.5)*.4,PRODUCT[k%PRODUCT.length]));F.table=mergeGeos(p);}
  { const p=[cylG(.45,.45,.04,0,.75,0,0xF3EFE7,20),cylG(.04,.04,.72,0,.37,0,0x333333),cylG(.3,.3,.03,0,.02,0,0x333333)];
    [[-.8,0],[.8,0]].forEach(([x,z])=>{p.push(boxG(.45,.05,.45,x,.46,z,0x9A6B45),boxG(.45,.45,.05,x+(x<0?-.2:.2),.7,z,0x9A6B45).geo?boxG(.05,.45,.45,x+(x<0?-.22:.22),.7,z,0x9A6B45):null,cylG(.03,.03,.46,x,.23,z,0x333333));});
    F.cafe=mergeGeos(p.filter(Boolean));}
  F.counter=mergeGeos([boxG(2.0,1.0,.6,0,.5,0,0x2F3438),boxG(2.1,.06,.7,0,1.03,0,0xE8E2D6),boxG(.35,.3,.25,.6,1.2,0,0x111111)]);
  F.sofa=mergeGeos([boxG(1.9,.42,.85,0,.21,0,0x7D8A6E),boxG(1.9,.45,.2,0,.62,-.33,0x7D8A6E),boxG(.2,.3,.85,-.85,.55,0,0x6F7B61),boxG(.2,.3,.85,.85,.55,0,0x6F7B61),boxG(.55,.4,.55,1.5,.2,.2,0xC9A36A)]);
  return F;
}
const PLAN={fashion:{front:'mannequin',mid:'rack',back:'shelf'},access:{front:'table',mid:'table',back:'shelf'},beauty:{front:'table',mid:'table',back:'shelf'},
  home:{front:'sofa',mid:'table',back:'shelf'},food:{front:'cafe',mid:'cafe',back:'counter'},cinema:{front:'counter',mid:null,back:null},other:{front:'table',mid:'table',back:'shelf'}};
const DOORS=[];let doorHold=false;const SIGNS=[];
const INTERIOR_MATS=[];
function buildShops(f,group,M){
  const F=FLOORS[f];
  if(!TEX.leafCard)TEX.leafCard=null;
  const acc={wall:[],hoard:[],fascia:[],glass:[],frame:[],ceil:[],floorWood:[],floorTile:[],parapet:[],ac:[]};
  const furn={};const FG=FURN();
  const invis=new THREE.MeshBasicMaterial({visible:false});
  const pushBox=(list,len,h,th,mid,n,y,inset)=>{ // box along an edge: mid is plan point, n outward (plan), inset metres inward from edge
    const g=new THREE.BoxGeometry(len,h,th);const ang=Math.atan2(n[0],n[1]); // box local +z faces outward
    g.rotateY(ang);const w=W3(f,mid[0],mid[1],0);g.translate(w.x-n[0]*inset,y+h/2,w.z-n[1]*inset);list.push({geo:g});};
  F.units.forEach(u=>{
    const cat=u.b?BRANDS[u.b].cat:null;const P=u.pts;const fr=u.front;
    if(f!=='G'){const s=prism(P,SLAB,[M.slab,M.slabEdge],-SLAB);s.castShadow=false;group.add(s);}
    // pick volume + roof
    const pick=new THREE.Mesh(prism(P,SHOP_H,[invis,invis],0).geometry,invis);pick.userData.unit=u;group.add(pick);
    const rm=roofMat(f,cat);const roof=prism(P,0.4,[rm,M.fasciaMat],SHOP_H-0.4);group.add(roof);
    unitEls[u.key]={unit:u,mesh:pick,roof:rm,base:rm.color.clone()};
    const H=SHOP_H-0.4;
    for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];const lp=Math.hypot(b[0]-a[0],b[1]-a[1]);if(lp<0.5)continue;
      const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];let n=[(b[1]-a[1])/lp,-(b[0]-a[0])/lp];if(pointInPoly([mid[0]+n[0]*1.5,mid[1]+n[1]*1.5],P))n=[-n[0],-n[1]];
      const L=lp*SC;const isFront=u.b&&fr&&a===fr.a&&b===fr.b;
      pushBox(acc.parapet,L+0.02,0.34,0.24,mid,n,SHOP_H,0.12);                         // parapet round the roof
      if(!isFront){pushBox(u.b?acc.wall:acc.hoard,L,H,0.25,mid,n,0,0.125);continue;}
      // front: only the part open to the walkway (engine openSpan) gets fascia, glass and the door; any part hidden behind a neighbour is wall
      const t=[(b[0]-a[0])/lp,(b[1]-a[1])/lp],at=q=>[a[0]+t[0]*q,a[1]+t[1]*q];
      const sp=fr.span||{s0:0,s1:lp,door:lp/2};
      [[0,sp.s0],[sp.s1,lp]].forEach(([q0,q1])=>{if(q1-q0>0.5)pushBox(acc.wall,(q1-q0)*SC,H,0.25,at((q0+q1)/2),n,0,0.125);});
      const oL=(sp.s1-sp.s0)*SC,om=at((sp.s0+sp.s1)/2),dm=at(sp.door);
      const fasH=1.05;pushBox(acc.fascia,oL,fasH,0.3,om,n,H-fasH,0.15);
      const gH=H-fasH;pushBox(acc.glass,Math.max(0.2,oL-0.2),gH,0.04,om,n,0,0.12);
      pushBox(acc.frame,oL,0.12,0.14,om,n,0,0.1);                                   // sill
      const dW=Math.min(2.4,oL*0.5),dH=Math.min(2.8,gH-0.1);
      const nm=Math.max(1,Math.round(oL/3));for(let k=1;k<nm;k++){const q=sp.s0+(sp.s1-sp.s0)*k/nm;if(Math.abs(q-sp.door)*SC<dW/2+0.4)continue;pushBox(acc.frame,0.08,gH,0.12,at(q),n,0,0.12);}
      // door: frame + two sliding leaves, where the plan draws it
      pushBox(acc.frame,dW+0.2,0.14,0.16,dm,n,dH,0.08);
      [-1,1].forEach(sd=>{const mp=[dm[0]+t[0]*sd*(dW/2+0.05)/SC,dm[1]+t[1]*sd*(dW/2+0.05)/SC];pushBox(acc.frame,0.1,dH,0.16,mp,n,0,0.08);});
      const dg=new THREE.Group();const w=W3(f,dm[0],dm[1],0);dg.position.set(w.x+n[0]*0.02,0,w.z+n[1]*0.02);dg.rotation.y=Math.atan2(n[0],n[1]);
      const leaves=[-1,1].map(sd=>{const lf=new THREE.Group();const pane=new THREE.Mesh(new THREE.BoxGeometry(dW/2-0.04,dH-0.04,0.04),M.doorGlass);pane.position.y=(dH)/2;
        const edge=new THREE.Mesh(new THREE.BoxGeometry(0.05,dH-0.04,0.06),M.rail);edge.position.set(-sd*(dW/4-0.03),dH/2,0);
        const handle=new THREE.Mesh(new THREE.BoxGeometry(0.04,0.9,0.04),M.rail);handle.position.set(-sd*(dW/4-0.14),1.1,0.07);
        lf.add(pane,edge,handle);lf.position.x=sd*dW/4;dg.add(lf);return lf;});
      group.add(dg);DOORS.push({L:leaves[0],R:leaves[1],w:dW,x:w.x,z:w.z,f,key:u.key,open:0});
    }
    // rooftop plant on the larger roofs: kept to the corners, clear of the logo plaque in the middle
    {const bb=u.bb,wm=(bb[2]-bb[0])*SC,dm=(bb[3]-bb[1])*SC;
      if(wm*dm>170){const c=u.c;[[0.18,0.2],[0.8,0.78],[0.22,0.82]].slice(0,wm*dm>420?3:2).forEach(([fx,fy],k)=>{
        const q=[bb[0]+(bb[2]-bb[0])*fx,bb[1]+(bb[3]-bb[1])*fy];if(!pointInPoly(q,P)||Math.hypot((q[0]-c[0])*SC,(q[1]-c[1])*SC)<Math.min(wm,dm)*0.34)return;
        const w=W3(f,q[0],q[1],0);const g=new THREE.BoxGeometry(1.5,0.9,1.0);g.rotateY(rnd(k+q[0])>0.5?Math.PI/2:0);g.translate(w.x,SHOP_H+0.45,w.z);acc.ac.push({geo:g});
        const fan=new THREE.CylinderGeometry(0.34,0.34,0.06,16);fan.translate(w.x,SHOP_H+0.93,w.z);acc.ac.push({geo:fan});});}}
    if(!u.b)return;
    // interior: floor, lit ceiling, furniture
    const floorGeo=new THREE.ShapeGeometry(shapeFrom(P));floorGeo.rotateX(-Math.PI/2);floorGeo.translate(0,0.03,0);
    (cat==='fashion'||cat==='home'||cat==='food'?acc.floorWood:acc.floorTile).push({geo:floorGeo});
    const cg=new THREE.ShapeGeometry(shapeFrom(P));cg.rotateX(Math.PI/2);cg.translate(0,H-0.02,0);acc.ceil.push({geo:cg});
    if(!fr)return;
    const plan=PLAN[cat]||PLAN.other;const tv=[(fr.b[0]-fr.a[0]),(fr.b[1]-fr.a[1])];const tl=Math.hypot(tv[0],tv[1]);const t=[tv[0]/tl,tv[1]/tl];const nin=[-fr.n[0],-fr.n[1]];
    let depth=0;P.forEach(p=>{depth=Math.max(depth,((p[0]-fr.mid[0])*nin[0]+(p[1]-fr.mid[1])*nin[1])*SC);});
    const yaw=Math.atan2(nin[0],nin[1])+Math.PI;let count=0;
    const inside=(q)=>{const m=0.9/SC;return [[0,0],[m,0],[-m,0],[0,m],[0,-m]].every(o=>pointInPoly([q[0]+o[0],q[1]+o[1]],P));};
    const put=(type,s,d,rot)=>{if(!type||count>=26)return;const q=[fr.mid[0]+(t[0]*s+nin[0]*d)/SC,fr.mid[1]+(t[1]*s+nin[1]*d)/SC];if(!inside(q))return;(furn[type]=furn[type]||[]).push([q[0],q[1],yaw+(rot||0)]);count++;};
    const half=fr.lm/2-1.2;
    for(let d=2.0;d<depth-1.2;d+=2.8){const back=d>depth-3.8,front=d<3.6;const type=back?plan.back:front?plan.front:plan.mid;
      for(let s=-half;s<=half+0.01;s+=(type==='shelf'?2.3:2.6)){if(front&&Math.abs(s)<1.5)continue;put(type,s,back?depth-0.9:d,0);}}
    if(cat!=='food'&&cat!=='cinema'&&depth>5)put('counter',half>2?half-0.6:0,Math.min(depth-1.6,4.2),Math.PI/2);
  });
  // merged shells
  const add=(list,mat,shadow)=>{if(!list.length)return;const m=new THREE.Mesh(mergeGeos(list),mat);m.castShadow=!!shadow;m.receiveShadow=true;group.add(m);return m;};
  add(acc.wall,M.shopWall,true);add(acc.hoard,M.hoarding,true);add(acc.fascia,M.fasciaMat,true);add(acc.frame,M.rail,false);
  add(acc.parapet,M.parapet,true);add(acc.ac,M.ac,true);
  add(acc.floorWood,M.floorWood,false);add(acc.floorTile,M.floorTile,false);add(acc.ceil,M.ceilLight,false);
  const gl=add(acc.glass,M.shopGlass,false);if(gl)gl.renderOrder=2;
  // furniture instances
  const mm=new THREE.Matrix4(),q=new THREE.Quaternion(),sc=new THREE.Vector3(1,1,1),pv=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  for(const type in furn){const L=furn[type];const im=new THREE.InstancedMesh(FG[type],M.furn,L.length);
    L.forEach((it,i)=>{const w=W3(f,it[0],it[1],0);pv.set(w.x,0.03,w.z);q.setFromAxisAngle(up,it[2]);mm.compose(pv,q,sc);im.setMatrixAt(i,mm);});
    im.castShadow=false;im.receiveShadow=true;group.add(im);}
  // signs: one per brand cluster, on the front of its widest shop
  const byBrand={};F.units.forEach(u=>{if(u.b)(byBrand[u.b]=byBrand[u.b]||[]).push(u);});
  for(const b in byBrand){const cl=[];byBrand[b].forEach(u=>{let hit=null;for(const c of cl){if(c.some(v=>touchBB(v.bb,u.bb))){hit=c;break;}}hit?hit.push(u):cl.push([u]);});
    const openM=x=>x.front?(x.front.span?(x.front.span.s1-x.front.span.s0)*SC:x.front.lm):0;
    cl.forEach(c=>{const u=c.slice().sort((x,y)=>openM(y)-openM(x))[0];if(!u.front)return;const fr=u.front;
      const w=Math.min(openM(u)*0.86,Math.max(3.5,BRANDS[b].name.length*0.5+1.6));const hS=Math.min(0.78,w*0.24);const tex=signTexture(BRANDS[b].name,w);   // on the open part of the front, over the door
      const mat=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:0xffffff,emissiveIntensity:0.9,roughness:0.5});
      const m=new THREE.Mesh(new THREE.PlaneGeometry(w,hS),mat);SIGNS.push({b,mat,w,hS,logo:''});const sm=fr.door||fr.mid,p=W3(f,sm[0],sm[1],0);
      m.position.set(p.x+fr.n[0]*0.02,SHOP_H-0.4-0.52,p.z+fr.n[1]*0.02);m.rotation.y=Math.atan2(fr.n[0],fr.n[1]);group.add(m);});}
}
function stepDoors(dt){
  const gp=(guide&&guideDot&&guideDot.visible)?guideDot.position:null;const gf=guide?guide.r.legs[guide.legIdx].f:null;
  DOORS.forEach(d=>{let tgt=0;
    if(gp&&d.f===gf&&Math.hypot(gp.x-d.x,gp.z-d.z)<5.5)tgt=1;
    if(doorHold&&state.targetUnit&&d.key===state.targetUnit.key)tgt=1;
    if(Math.abs(tgt-d.open)<0.002&&tgt===d.open)return;
    d.open+=(tgt-d.open)*Math.min(1,dt*3.5);if(Math.abs(tgt-d.open)<0.002)d.open=tgt;
    const slide=d.w/2-0.1;d.L.position.x=-d.w/4-d.open*slide;d.R.position.x=d.w/4+d.open*slide;});
}

/* ---------- rooftop logo plaques ----------
   Every store has its logo on its roof: the one uploaded in the admin hub, or until then its name, set in
   the app's type on a light plaque with a gold edge. Plaques turn with the map so they always read upright,
   and they are what the eye finds from above; the floating name labels step aside once a plaque is big
   enough on screen to read. */
const BADGES=[];
/* where a store's plaque goes: the roomiest point of its roof (the point furthest from every edge), and how big it
   may be there. L-shaped and narrow units get a plaque that fits their widest part instead of hanging over an edge. */
function edgeDist(pt,P){let d=Infinity;for(let i=0;i<P.length;i++){const q=project(pt,P[i],P[(i+1)%P.length]);d=Math.min(d,dist(pt,[q.x,q.y]));}return d;}
const SPOTS=new Map();
function plaqueSpot(units){const key=units.map(u=>u.key).join('|');if(SPOTS.has(key))return SPOTS.get(key);let best=null;
  units.forEach(u=>{const b=u.bb,step=Math.max(1,Math.min(b[2]-b[0],b[3]-b[1])/16);
    for(let x=b[0]+step/2;x<b[2];x+=step)for(let y=b[1]+step/2;y<b[3];y+=step){if(!pointInPoly([x,y],u.pts))continue;const d=edgeDist([x,y],u.pts);if(!best||d>best.d+1e-6)best={x,y,d};}});
  if(!best){const c=units[0].c;best={x:c[0],y:c[1],d:3};}
  const s=Math.max(2.6,Math.min(13,2*best.d*SC*0.86));   // the plaque's diagonal: it turns in quarter steps, so it must fit the clear circle
  const out={x:best.x,y:best.y,s,w:s/Math.hypot(1,0.36)};SPOTS.set(key,out);return out;}
function badgeFit(units){return plaqueSpot(units).s;}
function roundRect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath();}
function drawBadge(c,b,img){const g=c.getContext('2d'),W=c.width,H=c.height;g.clearRect(0,0,W,H);
  const cat=BRANDS[b]&&CATS[BRANDS[b].cat];
  g.fillStyle='#E8413B';g.fillRect(0,0,W,H);                                   // the plaque is a solid block: its corners are the gold edge
  roundRect(g,7,7,W-14,H-14,H*0.16);g.fillStyle='#FFFFFF';g.fill();
  if(img){const pad=H*0.16,bw=W-pad*2,bh=H-pad*2,k=Math.min(bw/img.width,bh/img.height);g.drawImage(img,(W-img.width*k)/2,(H-img.height*k)/2,img.width*k,img.height*k);return;}
  const name=BRANDS[b]?BRANDS[b].name:'';let fs=Math.round(H*0.44);const font=s=>`700 ${s}px Inter, "Segoe UI", system-ui, sans-serif`;g.font=font(fs);
  while(g.measureText(name).width>W*0.84&&fs>14){fs-=2;g.font=font(fs);}
  g.fillStyle='#1E2551';g.textAlign='center';g.textBaseline='middle';g.fillText(name,W/2,H*0.47);
  g.fillStyle=cat?cat.ink:'#E8413B';const rw=Math.min(W*0.3,g.measureText(name).width*0.5);g.fillRect(W/2-rw/2,H*0.47+fs*0.62,rw,Math.max(3,H*0.035));}   // a short rule in the category's colour
function makeBadge(f,group,b,units){
  const s=badgeFit(units),logo=logoOf(b);const a=0.36,w=s/Math.hypot(1,a),h=w*a;
  const c=document.createElement('canvas');c.width=512;c.height=Math.round(512*a);drawBadge(c,b,null);
  const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());
  const top=new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:0xffffff,emissiveIntensity:MODE==='evening'?0.8:0.3,roughness:0.55});
  const geo=new THREE.BoxGeometry(w,0.16,h);geo.clearGroups();                 // one draw call: the sides take their colour from the gold edge of the canvas
  const uvA=geo.attributes.uv;for(let i=0;i<uvA.count;i++){if(i<8||i>=16)uvA.setXY(i,0.012,0.5);}
  const mesh=new THREE.Mesh(geo,top);const side=null;
  const spot=plaqueSpot(units);const p=W3(f,spot.x,spot.y,0);
  mesh.position.set(p.x,SHOP_H+0.5,p.z);mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);
  const B={b,f,mesh,top,side,tex,canvas:c,w,logo:''};BADGES.push(B);
  [top].forEach(m=>{hookFade(m,f);if(floorMats&&floorMats[f]){m.userData.baseOpacity=m.opacity;m.userData.baseTransparent=m.transparent;m.userData.baseDepthWrite=m.depthWrite;floorMats[f].push(m);}});
  if(logo)badgeLogo(B,logo);return B;}
function badgeLogo(B,l){B.logo=l;if(!l){drawBadge(B.canvas,B.b,null);B.tex.needsUpdate=true;return;}
  const img=new Image();img.onload=()=>{if(B.logo!==l)return;drawBadge(B.canvas,B.b,img);B.tex.needsUpdate=true;};img.onerror=()=>{B.logo='';};img.src=l;}
function buildBadges(f,group){const F=FLOORS[f];const brands=new Set(F.units.filter(u=>u.b&&BRANDS[u.b]).map(u=>u.b));
  brands.forEach(b=>brandClusters(f,b).forEach(c=>makeBadge(f,group,b,c)));}
function clearBadges(){BADGES.forEach(B=>{B.mesh.parent&&B.mesh.parent.remove(B.mesh);B.mesh.geometry.dispose();B.tex.dispose();[B.top].forEach(m=>{m.dispose();const L=floorMats&&floorMats[B.f];if(L){const i=L.indexOf(m);if(i>=0)L.splice(i,1);}});});BADGES.length=0;}
/* plaques stay square to the buildings: of the four ways round, the one that reads upright from the camera;
   they swing smoothly to the next quarter as the map turns */
let badgeTheta=null,badgeRot=null;
function turnBadges(dt){const th=Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z);
  const want=Math.round(th/(Math.PI/2))*(Math.PI/2);badgeTheta=want;
  if(badgeRot===null)badgeRot=want;let d=want-badgeRot;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;
  if(Math.abs(d)<1e-4){if(BADGES.length&&BADGES[0].mesh.rotation.y===badgeRot)return;}else{badgeRot+=d*Math.min(1,(dt||0.016)*8);if(Math.abs(want-badgeRot)<2e-3)badgeRot=want;labelsDirty=true;}
  BADGES.forEach(B=>{B.mesh.rotation.y=badgeRot;});}

/* ============================================================
   REFERENCE TREE: multi-stem canopy tree in a lit planter with bench
   ============================================================ */
function tubeAlong(pts,r0,r1,seg){const curve=new THREE.CatmullRomCurve3(pts);const g=new THREE.TubeGeometry(curve,seg||10,1,7,false);
  const p=g.attributes.position,uv=g.attributes.uv,v=new THREE.Vector3();for(let i=0;i<p.count;i++){const t=uv.getX(i);const c=curve.getPointAt(t);v.fromBufferAttribute(p,i).sub(c).multiplyScalar(r0+(r1-r0)*t).add(c);p.setXYZ(i,v.x,v.y,v.z);}
  g.computeVertexNormals();return g;}
function leafCardTex(){return canvasTex(256,256,(g,w,h)=>{g.clearRect(0,0,w,h);
  for(let i=0;i<46;i++){const x=30+rnd(i*3)*196,y=30+rnd(i*7)*196,a=rnd(i*11)*6.28,L=22+rnd(i*5)*16;const l=40+rnd(i*13)*45;
    g.save();g.translate(x,y);g.rotate(a);g.fillStyle=`hsl(${90+rnd(i)*22},47%,${l*0.65}%)`;g.beginPath();g.ellipse(0,0,L,L*0.42,0,0,6.283);g.fill();g.strokeStyle='rgba(30,50,20,.35)';g.lineWidth=1.2;g.beginPath();g.moveTo(-L,0);g.lineTo(L,0);g.stroke();g.restore();}},false);}
function underplantTex(){return canvasTex(256,256,(g,w,h)=>{g.clearRect(0,0,w,h);
  for(let i=0;i<9;i++){const x=40+rnd(i*5)*176,y=150+rnd(i*9)*60,a=-1.9+rnd(i*3)*0.9;g.save();g.translate(x,y);g.rotate(a);g.fillStyle=`hsl(${105+rnd(i)*15},45%,${22+rnd(i*4)*12}%)`;
    g.beginPath();g.ellipse(46,0,50,26,0,0,6.283);g.fill();g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=2;for(let k=1;k<5;k++){g.beginPath();g.moveTo(k*18,-4);g.lineTo(k*18+10,-24);g.stroke();}g.restore();}
  for(let i=0;i<26;i++){const x=10+rnd(i*17)*236;g.strokeStyle=`hsl(${95+rnd(i)*25},50%,${28+rnd(i*3)*20}%)`;g.lineWidth=5;g.beginPath();g.moveTo(x,256);g.quadraticCurveTo(x+(rnd(i*5)-.5)*60,160,x+(rnd(i*7)-.5)*120,60+rnd(i)*60);g.stroke();}
  for(let i=0;i<22;i++){const x=20+rnd(i*23)*216,y=110+rnd(i*29)*110;g.fillStyle='#FFFFFF';for(let p=0;p<5;p++){g.beginPath();g.ellipse(x+Math.cos(p*1.26)*5,y+Math.sin(p*1.26)*5,4,2.4,p*1.26,0,6.283);g.fill();}g.fillStyle='#F2C94C';g.beginPath();g.arc(x,y,2,0,6.283);g.fill();}},false);}
let CANOPY=null;
function makeCanopyTree(){
  const bark=[];const B=0x6E5B4A;
  bark.push({geo:tubeAlong([new THREE.Vector3(0,0,0),new THREE.Vector3(0.05,0.8,0),new THREE.Vector3(0,1.4,0.05)],0.32,0.26),color:B});
  const tips=[];
  for(let k=0;k<3;k++){const a=k*2.094+0.3;const mid=new THREE.Vector3(Math.cos(a)*0.7,2.7,Math.sin(a)*0.7);const top=new THREE.Vector3(Math.cos(a)*1.3,3.7,Math.sin(a)*1.3);
    bark.push({geo:tubeAlong([new THREE.Vector3(0,1.3,0),mid,top],0.22,0.1),color:B});
    for(let j=0;j<2;j++){const a2=a+(j?0.6:-0.6);const t2=new THREE.Vector3(Math.cos(a2)*2.1,4.4+rnd(k*3+j)*0.4,Math.sin(a2)*2.1);bark.push({geo:tubeAlong([mid.clone().lerp(top,0.6),t2],0.1,0.04,6),color:B});tips.push(t2);}}
  const lobes=[];const cards=[];const cardG=[];
  for(let i=0;i<34;i++){const th=rnd(i*3.1)*6.283,ph=Math.acos(0.15+rnd(i*5.7)*0.85);const rx=2.5,ry=1.25,cy=4.7;
    const x=Math.sin(ph)*Math.cos(th)*rx*(0.7+rnd(i)*0.3),y=cy+Math.cos(ph)*ry*(0.6+rnd(i*2)*0.4)-0.15,z=Math.sin(ph)*Math.sin(th)*rx*(0.7+rnd(i*9)*0.3);
    lobes.push({geo:lobe(x,y,z,0.55+rnd(i*4)*0.35,i*1.3,0x23401B,0x5E8A34)});}
  const card=new THREE.PlaneGeometry(1.25,1.25);
  for(let i=0;i<150;i++){const th=rnd(i*2.3+7)*6.283,ph=Math.acos(-0.1+rnd(i*3.9+1)*1.1);const rx=2.85,ry=1.45,cy=4.7;
    const g=card.clone();g.rotateX((rnd(i)-0.5)*2.4);g.rotateY(rnd(i*8)*6.28);
    g.translate(Math.sin(ph)*Math.cos(th)*rx*(0.8+rnd(i*5)*0.25),cy+Math.cos(ph)*ry*(0.75+rnd(i*6)*0.3),Math.sin(ph)*Math.sin(th)*rx*(0.8+rnd(i*4)*0.25));cardG.push({geo:g});}
  return {bark:mergeGeos(bark),lobes:mergeGeos(lobes),cards:mergeGeos(cardG)};
}
/* one set per floor: ghosting a floor in the stacked view must not ghost another floor's trees */
const TREE_MATS={},LEAF_TEX={};
function treeMats(f){if(!LEAF_TEX.cards){LEAF_TEX.cards=leafCardTex();LEAF_TEX.under=underplantTex();}
  if(!TREE_MATS[f]){TREE_MATS[f]={bark:new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95}),lobes:new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.85}),
  cards:new THREE.MeshStandardMaterial({map:LEAF_TEX.cards,alphaTest:0.5,side:THREE.DoubleSide,roughness:0.8}),under:new THREE.MeshStandardMaterial({map:LEAF_TEX.under,alphaTest:0.45,side:THREE.DoubleSide,roughness:0.85})};}return TREE_MATS[f];}
// planter tree as in the reference: concrete planter, timber bench, underplanting, LED under-glow
function addPlanterTree(group,f,x,y,rotDeg,scale,kind){
  if(!CANOPY&&!KIT)CANOPY=makeCanopyTree();const TM=treeMats(f);const k=scale||1;
  const g=new THREE.Group();const w=W3(f,x,y,0);g.position.set(w.x,0,w.z);g.rotation.y=(rotDeg||0)*Math.PI/180;
  const conc=new THREE.MeshStandardMaterial({color:0xB9B2A6,roughness:0.9});const cap=new THREE.MeshStandardMaterial({color:0xCFC8BC,roughness:0.8});
  const PW=6.2*k,PD=3.8*k,PH=0.75;
  const body=new THREE.Mesh(new THREE.BoxGeometry(PW,PH,PD),conc);body.position.y=PH/2+0.08;g.add(body);
  const lip=new THREE.Mesh(new THREE.BoxGeometry(PW+0.16,0.08,PD+0.16),cap);lip.position.y=PH+0.12;g.add(lip);
  const soil=new THREE.Mesh(new THREE.BoxGeometry(PW-0.3,0.05,PD-0.3),new THREE.MeshStandardMaterial({color:0x3A2C20,roughness:1}));soil.position.y=PH+0.14;g.add(soil);
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(PW-0.3,0.08,PD-0.3),new THREE.MeshStandardMaterial({color:0x2A2622}));plinth.position.y=0.04;g.add(plinth);
  const led=new THREE.Mesh(new THREE.BoxGeometry(PW-0.25,0.04,PD-0.25),new THREE.MeshStandardMaterial({color:0xFFD9A0,emissive:0xFFC070,emissiveIntensity:1.3}));led.position.y=0.09;g.add(led);g.userData.led=led;
  const bench=new THREE.Mesh(new THREE.BoxGeometry(PW*0.42,0.12,0.9),new THREE.MeshStandardMaterial({map:TEX.deck,roughness:0.7}));bench.position.set(PW*0.2,0.5,PD/2+0.3);g.add(bench);
  const bLeg=new THREE.Mesh(new THREE.BoxGeometry(PW*0.4,0.44,0.7),conc);bLeg.position.set(PW*0.2,0.22,PD/2+0.3);g.add(bLeg);
  // underplanting cards
  const ug=[];for(let i=0;i<46;i++){const c=new THREE.PlaneGeometry(1.1,0.95);c.translate(0,0.47,0);c.rotateY(rnd(i*3)*6.28);c.translate((rnd(i*5)-0.5)*(PW-1),PH+0.14,(rnd(i*7)-0.5)*(PD-0.9));ug.push({geo:c});}
  const under=new THREE.Mesh(mergeGeos(ug),TM.under);g.add(under);
  // tree
  const tr=new THREE.Group();tr.position.y=PH+0.12;tr.scale.setScalar(k);
  let cards=null;const kp=kitParts(kind&&KIT&&KIT[kind]?kind:'tree_a',f);
  if(kp){tr.scale.setScalar(k*0.78);kp.forEach(pt=>{const m=new THREE.Mesh(pt.geo,pt.mat);m.applyMatrix4(pt.m);m.castShadow=!/card/.test(pt.mat.name);m.receiveShadow=true;tr.add(m);});}
  else{const bark=new THREE.Mesh(CANOPY.bark,TM.bark),lob=new THREE.Mesh(CANOPY.lobes,TM.lobes);cards=new THREE.Mesh(CANOPY.cards,TM.cards);
    bark.castShadow=lob.castShadow=true;lob.receiveShadow=cards.receiveShadow=true;tr.add(bark,lob,cards);}
  g.add(tr);
  g.traverse(o=>{if(o.isMesh){o.receiveShadow=true;if(o!==cards&&o!==under&&o!==led)o.castShadow=o.castShadow||false;}});
  body.castShadow=true;group.add(g);return g;
}

/* ---------- build each floor ---------- */
const labelsBuilt=[];let lawnMat=null;
function buildFloor(f){
  const F=FLOORS[f];const group=new THREE.Group();group.name='Floor_'+f;scene.add(group);floorGroup[f]=group;
  const M=MATS[f]=matSet();
  const y=0; // local
  if(f==='G'){
    buildSurroundings(group);
    // the site's own lawn, inside the ring roads, and its paving
    lawnMat=new THREE.MeshStandardMaterial({map:TEX.lawn.clone(),roughness:1});lawnMat.map.needsUpdate=true;lawnMat.map.repeat.set(12,20);
    const lawn=new THREE.Mesh(new THREE.PlaneGeometry(126,199),lawnMat);lawn.rotation.x=-Math.PI/2;lawn.position.set(1,-0.06,-0.5);lawn.receiveShadow=true;group.add(lawn);
    const pv=F.paving;const pav=flat(rectPtsW([pv[0]-6,pv[1]-6,pv[2]+6,pv[3]+6]),0,new THREE.MeshStandardMaterial({map:TEX.paving,roughness:0.95}),0.05);
    pav.material.map=TEX.paving.clone();pav.material.map.needsUpdate=true;pav.material.map.repeat.set(1/2,1/2);pav.receiveShadow=true;group.add(pav);
    F.courts.forEach((r,i)=>{const m=flat(rectPtsW([r[0]+3,r[1]+3,r[2]-3,r[3]-3]),0.08,new THREE.MeshStandardMaterial({map:TEX.lawn,roughness:1}),0.1);m.receiveShadow=true;group.add(m);
      addPlanterTree(group,'G',(r[0]+r[2])/2,(r[1]+r[3])/2,(r[3]-r[1])>(r[2]-r[0])?90:0,1,i===1?'tree_c':'tree_a');});   // a flame tree in bloom in the middle court
    // central water feature: pools and palm planters along the boulevard
    buildWaterFeature(group,F,M);
    // courtyard hedges
    F.courts.forEach(r=>{for(let x=r[0]+8;x<r[2]-4;x+=10){treeData.G.push([x,r[1]+6,0.8,rnd(x+r[1])>0.7?'bushf':'bush']);treeData.G.push([x,r[3]-6,0.8,rnd(x*2+r[3])>0.7?'bushf':'bush']);}});
    // perimeter trees (east and west edges, north edge): shade trees, with flame trees and ashoka columns among them
    const edgeTree=k=>{const r=rnd(k*5.3);return r<0.22?'t2':r<0.36?'ash':r<0.68?'t0':'t1';};
    for(let x=pv[0]+10;x<pv[2];x+=30){treeData.G.push([x,pv[1]-14,1.25,edgeTree(x)]);}
    for(let yy=pv[1]+300;yy<pv[3];yy+=32){treeData.G.push([pv[0]-12,yy,1.25,edgeTree(yy)]);treeData.G.push([pv[2]+12,yy,1.25,edgeTree(yy+7)]);}
    buildEntrance(group,M,F);
    // office tower
    const off=prism(F.office,9,[new THREE.MeshStandardMaterial({color:0x9DA3A6,roughness:0.8}),new THREE.MeshStandardMaterial({map:TEX.hoarding,roughness:0.8})]);group.add(off);
    F.pavilions.forEach(r=>group.add(prism(rectPtsW(r),3,[M.slab,M.facade])));
    (F.halls||[]).forEach(h=>group.add(flat(rectPtsW(h.r),0.12,M.slab,0.1)));
  }else{
    (F.walks||[]).forEach(r=>{const m=prism(rectPtsW(r),SLAB,[M.slab,M.slabEdge],-SLAB);m.castShadow=false;group.add(m);});
    (F.terraces||[]).forEach(t=>{const m=prism(ptsOf(t),SLAB,[M.deck,M.slabEdge],-SLAB);m.castShadow=false;group.add(m);});
    (F.halls||[]).forEach(h=>group.add(prism(rectPtsW(h.r),SLAB,[M.slab,M.slabEdge],-SLAB)));
    addRails(group,f,M);
  }
  buildShops(f,group,M);buildBadges(f,group);
  // cores & toilets
  F.cores.forEach(c=>{const P=ptsOf(c);group.add(prism(P,CORE_H,[M.coreRoof,M.core],0));if(f!=='G'){const s=prism(P,SLAB,[M.slab,M.slabEdge],-SLAB);s.castShadow=false;group.add(s);}});
  F.toilets.forEach(t=>{const P=rectPtsW(t.r);const m=prism(P,SHOP_H*0.8,[M.wc,M.wc],0);m.userData.toilet=t;m.userData.floor=f;group.add(m);wcMesh[t.id]=m;
    if(f!=='G'){const s=prism(P,SLAB,[M.slab,M.slabEdge],-SLAB);s.castShadow=false;group.add(s);}});
  (F.stairsAreas||[]).concat(F.cineStairs||[]).forEach(r=>group.add(prism(rectPtsW(r),0.4,[M.steps,M.slabEdge],0)));
  escalatorRuns(f).forEach(run=>addEscalator(group,run,STOREY,M));   // one per escalator, on the floor it leaves
  if(f==='S'){ // terrace planters
    (F.terraces||[]).forEach(t=>{if(t.lp)treeData.S.push([t.lp[0],t.lp[1]+14,0.7]);});
  }
  buildTrees(f,group);
  addShade(f,group);
}

/* ---------- glass balustrades where a walkway looks down into a void (engine.voidRails: never across a path) ---------- */
function addRails(group,f,M){const R=voidRails(f);if(!R.length)return;const glass=[],metal=[];
  const box=(list,len,h,th,mid,n,y,inset)=>{const g=new THREE.BoxGeometry(len,h,th);g.rotateY(Math.atan2(n[0],n[1]));const w=W3(f,mid[0],mid[1],0);
    g.translate(w.x-n[0]*inset,y+h/2,w.z-n[1]*inset);list.push({geo:g});};
  R.forEach(r=>{const L=dist(r.a,r.b)*SC;if(L<0.3)return;const mid=[(r.a[0]+r.b[0])/2,(r.a[1]+r.b[1])/2];
    box(glass,L,0.98,0.03,mid,r.n,0.06,0.14);          // frameless glass
    box(metal,L,0.05,0.08,mid,r.n,1.04,0.14);          // handrail
    box(metal,L,0.08,0.07,mid,r.n,0,0.14);});          // shoe at the floor
  const gm=new THREE.Mesh(mergeGeos(glass),M.railGlass);gm.renderOrder=3;group.add(gm);
  const mm=new THREE.Mesh(mergeGeos(metal),M.rail);mm.castShadow=true;group.add(mm);}

/* ---------- baked shading from Blender (blender/bake_shade.py -> js/shade.js) ----------
   A top-down ambient-occlusion render of each floor, laid over the walkways with multiply
   blending: soft contact shadows under walls, planters and trees that realtime shadows miss. */
const SHADE_MATS=[];
function shadeStrength(){return MODE==='evening'?0.7:0.92;}
function addShade(f,group){
  if(typeof SHADE==='undefined'||!SHADE[f])return;
  const b=SHADE.bounds,img=new Image(),tex=new THREE.Texture(img);
  tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());img.onload=()=>{tex.needsUpdate=true;};img.src=SHADE[f];
  const geo=new THREE.PlaneGeometry((b[2]-b[0])*SC,(b[3]-b[1])*SC);geo.rotateX(-Math.PI/2);
  const mat=new THREE.ShaderMaterial({uniforms:{map:{value:tex},strength:{value:shadeStrength()}},transparent:true,depthWrite:false,
    blending:THREE.MultiplyBlending,premultipliedAlpha:true,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform sampler2D map;uniform float strength;varying vec2 vUv;void main(){vec3 s=texture2D(map,vUv).rgb;gl_FragColor=vec4(mix(vec3(1.),s,strength),1.);}'});
  mat.userData.shade=true;
  const m=new THREE.Mesh(geo,mat);const c=W3(f,(b[0]+b[2])/2,(b[1]+b[3])/2,0);
  m.position.set(c.x,f==='G'?0.09:0.05,c.z);m.renderOrder=1;m.frustumCulled=false;group.add(m);SHADE_MATS.push({f,mat});
}

/* ---------- lighting modes ---------- */
function applyMode(){
  const night=MODE==='evening';U.night.value=night?1:0;
  const bg=new THREE.Color(night?0x141933:0xF4F5F8);scene.background=bg;scene.fog=new THREE.Fog(bg,380,1000);EDGE.bg.value.copy(bg);Object.values(HAZE).forEach(h=>h.material.color.copy(bg));   // the app's own cream (or night green): no hard frame round the map
  scene.environment=night?ENV.night:ENV.day;
  hemi.color.set(night?0x8FA3C8:0xFFFFFF);hemi.groundColor.set(night?0x2A241C:0xC9C3B8);hemi.intensity=night?0.2:0.36;
  sun.color.set(night?0xFFB877:0xFFF3E2);sun.intensity=night?0.38:1.0;
  scene.traverse(o=>{if(!o.material)return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.isMeshStandardMaterial)m.envMapIntensity=m.userData.envK!==undefined?m.userData.envK:(night?0.45:0.8);});});
  CITY_MATS.forEach(m=>{const k=m.userData.city,day={ground:0xE7E1D6,plinth:0xF1ECE3,path:0xE3DCCF,road:0x7B7C7E,paint:0xF4F2EC,park:0xA9BE93,bld:0xFFFFFF}[k],
    nite={ground:0x1E2B25,plinth:0x26332D,path:0x2E3A34,road:0x3A4240,paint:0x8A8F88,park:0x31463A,bld:0x6E746F}[k];m.color.set(night?nite:day);if(k==='bld')m.emissiveIntensity=night?1.1:0;});
  styleBadges();
  if(lawnMat)lawnMat.color.set(night?0x6E7F66:0xD6DDC4);
  renderer.toneMappingExposure=night?1.05:1.0;
  FLOOR_ORDER.forEach(f=>{const M=MATS[f];if(M)M.facade.emissiveIntensity=night?1.6:0.15;});
  INTERIOR_MATS.forEach(([m,d,n])=>m.emissiveIntensity=night?n:d);
  FLOOR_ORDER.forEach(f=>{if(floorGroup[f]){floorGroup[f].userData.fade=undefined;setFloorFade(f,fadeOf(f));}});
}

/* ---------- floor layout: floors slide and cross-fade ---------- */
let layoutTween=null,floorMats=null,labelsDirty=true;
function collectFloorMats(){floorMats={};FLOOR_ORDER.forEach(f=>{const set=new Set();
  floorGroup[f].traverse(o=>{if(!o.material)return;(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>set.add(m));});
  floorMats[f]=[...set];floorMats[f].forEach(m=>{hookFade(m,f);if(m.userData.baseOpacity===undefined){m.userData.baseOpacity=m.opacity;m.userData.baseTransparent=m.transparent;m.userData.baseDepthWrite=m.depthWrite;}});});}
function fadeOf(f){const g=floorGroup[f];return g&&g.userData.fade!==undefined?g.userData.fade:(f===cur?1:0);}
/* ghost=true: real transparency (the steady "all floors" view); otherwise the dither (floor changes) */
function setFloorFade(f,v,ghost){const g=floorGroup[f];if(!g||!floorMats)return;g.visible=v>0.004;
  const mode=ghost&&v<0.999&&v>0.004?'g':'d';if(g.userData.fade===v&&g.userData.fadeMode===mode)return;g.userData.fade=v;
  const part=v<0.999;
  if(mode==='d'){FADEU[f].value=v;
    if(g.userData.fadeMode!=='d')floorMats[f].forEach(m=>{if(m.isShaderMaterial)return;m.transparent=m.userData.baseTransparent;m.opacity=m.userData.baseOpacity;m.depthWrite=m.userData.baseDepthWrite;});
    floorMats[f].forEach(m=>{if(m.userData.shade)m.uniforms.strength.value=shadeStrength()*v;});}
  else{FADEU[f].value=1;
    floorMats[f].forEach(m=>{if(m.userData.shade){m.uniforms.strength.value=shadeStrength()*v*0.45;return;}
      if(m.isShaderMaterial)return;
      m.transparent=part||m.userData.baseTransparent;m.opacity=m.userData.baseOpacity*v;m.depthWrite=!part&&m.userData.baseDepthWrite;});}
  g.userData.fadeMode=mode;
  const sh=v>0.5;if(g.userData.shadowOn!==sh){g.userData.shadowOn=sh;                   // a half-gone floor casts no shadow
    g.traverse(o=>{if(!o.isMesh)return;if(o.userData.castShadow0===undefined)o.userData.castShadow0=o.castShadow;o.castShadow=o.userData.castShadow0&&sh;});}}
const below=f=>FLOORS[f].idx<FLOORS[cur].idx;
function targetFade(f){return stackMode?(f===cur?1:0.22):(f===cur||below(f)?1:0);}
function targetDisp(){if(stackMode)return{G:0,F:STACK_GAP,S:2*STACK_GAP};const o={};FLOOR_ORDER.forEach(f=>{const d=FLOORS[f].idx-FLOORS[cur].idx;o[f]=d*(d<0?STOREY:GAP);});return o;}
/* a soft layer of the page colour under each upper floor: the floors below read as further away and the floor on show stays crisp */
const HAZE={};
function haze(f){if(!HAZE[f]){const m=new THREE.Mesh(new THREE.PlaneGeometry(760,760),new THREE.MeshBasicMaterial({color:scene.background||0xF4F5F8,transparent:true,opacity:0.36,depthWrite:false}));
    m.rotation.x=-Math.PI/2;m.renderOrder=2;m.frustumCulled=false;m.visible=false;scene.add(m);HAZE[f]=m;}return HAZE[f];}
/* the haze under a floor fades with that floor, so nothing pops in or out during a floor change */
function placeHaze(){FLOOR_ORDER.forEach(f=>{if(!FLOORS[f].idx)return;const h=haze(f);const k=(stackMode||(FLOORS[f].idx>FLOORS[cur].idx&&!layoutTween))?0:Math.max(0,Math.min(1,(fadeOf(f)-0.15)/0.85));
  h.material.opacity=0.36*k;h.visible=k>0.01;h.position.set(0,disp[f]-SLAB-0.3,0);});}
const easeIO=k=>k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
function stepLayout(now){if(!layoutTween)return;const L=layoutTween;const k=L.ms?Math.min(1,(now-L.t0)/L.ms):1;const e=easeIO(k);
  FLOOR_ORDER.forEach(f=>{disp[f]=L.from[f]+(L.tgt[f]-L.from[f])*e;if(floorGroup[f])floorGroup[f].position.y=disp[f];
    const a=L.fFrom[f],b=L.fTgt[f];const kk=b<a?easeIO(Math.min(1,k*1.6)):easeIO(Math.max(0,Math.min(1,(k-0.18)/0.82)));   // leave early, arrive late
    setFloorFade(f,a+(b-a)*kk,L.ghost);});
  if(k>=1)layoutTween=null;
  placeHaze();positionDynamic();labelsDirty=true;}
function applyFloorLayout(animate,ms){
  const ghost=stackMode||FLOOR_ORDER.some(f=>floorGroup[f]&&floorGroup[f].userData.fadeMode==='g');   // into, or out of, the ghosted view
  layoutTween={from:{...disp},tgt:targetDisp(),fFrom:{G:fadeOf('G'),F:fadeOf('F'),S:fadeOf('S')},fTgt:{G:targetFade('G'),F:targetFade('F'),S:targetFade('S')},ghost,
    t0:performance.now(),ms:(animate&&!reduce)?(ms||820):0};
  stepLayout(performance.now());
  routeGroup.children.forEach(o=>{o.visible=o.userData.floor==='*'?stackMode:(stackMode||o.userData.floor===cur);});
  markerGroup.children.forEach(o=>{o.visible=stackMode||o.userData.floor===cur;});
}

/* ---------- camera: arcs round the target and eases out on long moves ---------- */
let camTween=null,idleOrbit=false;
function viewAspect(){return (wrap.clientWidth||1)/(wrap.clientHeight||1);}
function startCam(endT,endP,ms){labelsDirty=true;
  if(!ms||reduce){camTween=null;controls.target.copy(endT);camera.position.copy(endP);controls.update();return;}
  const sT=controls.target.clone(),sO=new THREE.Spherical().setFromVector3(camera.position.clone().sub(sT)),eO=new THREE.Spherical().setFromVector3(endP.clone().sub(endT));
  let dTh=eO.theta-sO.theta;while(dTh>Math.PI)dTh-=2*Math.PI;while(dTh<-Math.PI)dTh+=2*Math.PI;
  const lift=Math.min(0.4,sT.distanceTo(endT)/Math.max(80,sO.radius+eO.radius));
  camTween={sT,eT:endT.clone(),sO,eO,dTh,lift,t0:performance.now(),ms};}
function stepCam(now){if(!camTween)return;const c=camTween;const k=Math.min(1,(now-c.t0)/c.ms),e=k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;
  controls.target.lerpVectors(c.sT,c.eT,e);
  const r=(c.sO.radius+(c.eO.radius-c.sO.radius)*e)*(1+c.lift*Math.sin(Math.PI*e));
  camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(r,c.sO.phi+(c.eO.phi-c.sO.phi)*e,c.sO.theta+c.dTh*e)));
  labelsDirty=true;if(k>=1)camTween=null;}
function flyTo(center,radius,ms,polar,azim){
  const sph=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const P=polar==null?Math.min(Math.max(sph.phi,0.55),1.05):polar;const A=azim==null?sph.theta:azim;
  const fov=camera.fov*Math.PI/180,a=viewAspect();
  const d=Math.min(controls.maxDistance,Math.max(controls.minDistance,Math.max(radius/Math.tan(fov/2),radius/(Math.tan(fov/2)*a))*1.05));
  startCam(center,center.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(d,P,A))),ms);
}
function planBoxToView(f,b,ms,polar,azim){const c=W3(f,(b[0]+b[2])/2,(b[1]+b[3])/2,0);const w=(b[2]-b[0])*SC,h=(b[3]-b[1])*SC;flyTo(c,Math.max(w/2*0.95,h/2*0.8),ms,polar,azim);}
const VB=[110,45,735,1250];
function fitFloor(ms){if(stackMode){flyTo(new THREE.Vector3(0,STACK_GAP,0),104,ms,1.13,HEADING-0.72);return;}planBoxToView(cur,VB,ms,0.82,HEADING);}
function dolly(k){const off=camera.position.clone().sub(controls.target);const len=Math.min(controls.maxDistance,Math.max(controls.minDistance,off.length()*k));startCam(controls.target.clone(),controls.target.clone().add(off.setLength(len)),300);}
function orbit(a){const sph=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));startCam(controls.target.clone(),controls.target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(sph.radius,sph.phi,sph.theta+a))),450);}
function toggleTilt(){const sph=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));const flat=sph.phi<0.3;
  startCam(controls.target.clone(),controls.target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(sph.radius,flat?0.85:0.04,sph.theta))),450);return flat?'2D':'3D';}
function faceKiosk(){const sph=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  startCam(controls.target.clone(),controls.target.clone().add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(sph.radius,sph.phi,HEADING))),520);}
function toggleStack(){stackMode=!stackMode;syncStackUI();applyFloorLayout(true);if(state.route)showRouteOnFloor(true);else fitFloor(750);}
function setFloor(f,refit,opts){const prev=cur;cur=f;syncFloorUI();if(!built)return;
  applyFloorLayout(prev!==f,opts&&opts.ms);labelsDirty=true;
  if(refit){if(state.route&&state.route.legs.some(l=>l.f===f))showRouteOnFloor(true);else fitFloor(650);}}

/* ---------- HTML labels & icons ---------- */
const LBL=[];
/* html: the label's markup, or a function that makes it (words that change with the language; relabel() redoes them) */
function addLabel(html,f,x,y,h,prio,kind,extra){const el=document.createElement('div');el.className='lb '+kind;const txt=typeof html==='function'?html:null;el.innerHTML=txt?txt():html;labelsEl.appendChild(el);
  const L=Object.assign({el,f,x,y,h,prio,kind,w:0,hgt:0,shown:false,txt},extra||{});LBL.push(L);labelsDirty=true;return L;}
function relabel(){LBL.forEach(L=>{if(L.txt){L.el.innerHTML=L.txt();L.w=0;}});labelsDirty=true;}
function iconSVG(k,bg){return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11.5" fill="${bg}"/><use href="#i-${k}" x="4.5" y="4.5" width="15" height="15"/></svg>`;}
function storeLabels(f){const F=FLOORS[f];const brands=new Set(F.units.filter(u=>u.b&&BRANDS[u.b]).map(u=>u.b));
  brands.forEach(b=>brandClusters(f,b).forEach(c=>{let area=0;c.forEach(u=>area+=(u.bb[2]-u.bb[0])*(u.bb[3]-u.bb[1]));
    const [cx,cy]=c.length===1?c[0].c:ctr(bbox(c.flatMap(u=>u.pts)));
    addLabel(escapeHtml(BRANDS[b].name),f,cx,cy,SHOP_H+0.6,300+Math.min(400,area/20),'brand',{brand:b,cat:BRANDS[b].cat,bw:badgeFit(c)/Math.hypot(1,0.36)});}));
  F.units.forEach(u=>{if(!u.b)addLabel(escapeHtml(u.id),f,u.c[0],u.c[1],SHOP_H+0.4,40,'uid',{unit:u});});}
/* a store added in the admin hub: new roof colour and name label on its unit, without rebuilding the scene */
function refreshStores(){Object.values(unitEls).forEach(e=>{const cat=e.unit.b&&BRANDS[e.unit.b]?BRANDS[e.unit.b].cat:null;
    const c=roofTint(cat);e.base.copy(c);e.roof.color.copy(c);});
  clearBadges();FLOOR_ORDER.forEach(f=>buildBadges(f,floorGroup[f]));badgeTheta=null;badgeRot=null;FLOOR_ORDER.forEach(f=>{const g=floorGroup[f];if(g){const v=g.userData.fade;g.userData.fade=-1;setFloorFade(f,v===undefined?1:v,g.userData.fadeMode==='g');}});
  for(let i=LBL.length-1;i>=0;i--){const L=LBL[i];if(L.kind==='brand'||L.kind==='uid'){L.el.remove();LBL.splice(i,1);}}
  FLOOR_ORDER.forEach(storeLabels);applyHighlights();}
function buildLabels(){
  FLOOR_ORDER.forEach(f=>{const F=FLOORS[f];
    storeLabels(f);
    F.toilets.forEach(t=>addLabel(()=>iconSVG('wc','#1F5F6E')+`<span>${T(t.g==='f'?'Women':t.g==='m'?'Men':'Toilets')}</span>`,f,t.c[0],t.c[1],SHOP_H+0.6,520,'icon wc'));
    F.cores.forEach(c=>(c.icons||[]).forEach(([k,x,y])=>addLabel(iconSVG(k,'#2E4756'),f,x,y,CORE_H+0.6,k==='lift'?220:110,'icon')));
    (F.esc||[]).forEach(r=>{const c=ctr(r);addLabel(iconSVG('esc','#4C6473'),f,c[0],c[1],5.2,120,'icon');});
    (F.areaLabels||[]).forEach(([t,x,y])=>addLabel(()=>escapeHtml(tr(t)),f,x,y,0.6,30,'area'));
    (F.terraces||[]).forEach(t=>{if(t.n)addLabel(()=>escapeHtml(tr(t.n)),f,t.lp[0],t.lp[1],0.4,25,'area');});
    if(f==='G')addLabel(()=>T('Main entrance'),f,ENTRANCE.x,ENTRANCE.y,10,950,'gate');
  });
}
const tmpV=new THREE.Vector3();let labelKey='';
function hideLabel(L){if(L.shown){L.el.style.display='none';L.shown=false;}}
function layoutLabels(){
  const W=wrap.clientWidth,H=wrap.clientHeight;if(!W||!H)return;const placed=[];const camDist=camera.position.distanceTo(controls.target);const sphNow=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  const items=LBL.filter(L=>{
    const on=stackMode?true:L.f===cur;if(!on){hideLabel(L);return false;}
    if(stackMode&&L.f!==cur&&L.prio<900){hideLabel(L);return false;}
    if((L.kind==='uid'||L.kind==='area')&&camDist>150){hideLabel(L);return false;}
    if(L.kind==='brand'&&L.bw&&!(state.brand&&L.brand===state.brand)){const d=camera.position.distanceTo(W3(L.f,L.x,L.y,SHOP_H));   // the rooftop plaque is readable: no label needed
      if(L.bw/(2*d*Math.tan(camera.fov*Math.PI/360))*H*(0.55+0.45*Math.cos(sphNow.phi))>62){hideLabel(L);return false;}}
    if(L.kind==='icon'&&L.prio<200&&camDist>200){hideLabel(L);return false;}
    return true;});
  items.forEach(L=>{L._p=(state.brand&&L.brand===state.brand)?2000:L.prio;});items.sort((a,b)=>b._p-a._p);
  let pinLabelled=false;const pinTop=pin&&pin.visible&&pin.userData.body?pin.userData.body.localToWorld(new THREE.Vector3(0,PIN_H+PIN_R+1.3,0)):null;
  for(const L of items){let pos=L.pos?L.pos():W3(L.f,L.x,L.y,L.h);
    if(pinTop&&L.kind==='brand'&&L.brand===state.brand&&L.f===cur){if(pinLabelled){hideLabel(L);continue;}pinLabelled=true;pos=pinTop;}   // the chosen store's name rides on its pin
    tmpV.copy(pos).project(camera);
    if(tmpV.z>1||tmpV.x<-1.1||tmpV.x>1.1||tmpV.y<-1.1||tmpV.y>1.1){hideLabel(L);continue;}
    const sx=(tmpV.x+1)/2*W,sy=(1-tmpV.y)/2*H;if(!L.w){L.el.style.display='block';L.shown=true;L.w=L.el.offsetWidth;L.hgt=L.el.offsetHeight;}
    const r=[sx-L.w/2-3,sy-L.hgt/2-2,sx+L.w/2+3,sy+L.hgt/2+2];let hit=false;
    if(L._p<1500)for(const q of placed){if(r[0]<q[2]&&r[2]>q[0]&&r[1]<q[3]&&r[3]>q[1]){hit=true;break;}}
    if(hit){hideLabel(L);continue;}placed.push(r);if(!L.shown){L.el.style.display='block';L.shown=true;}
    L.el.style.transform=`translate(${(sx-L.w/2).toFixed(1)}px,${(sy-L.hgt/2).toFixed(1)}px)`;
    const dim=(state.brand&&L.kind==='brand'&&L.brand!==state.brand)||(state.cat&&L.kind==='brand'&&!catMatch(L.cat));
    L.el.classList.toggle('dim',!!dim);L.el.classList.toggle('sel',!!(state.brand&&L.brand===state.brand));}
}
/* re-place labels only when the camera, floors or labels changed: saves a lot of layout work per frame */
function maybeLayoutLabels(){const e=camera.matrixWorld.elements;
  const key=e[0].toFixed(4)+e[2].toFixed(4)+e[8].toFixed(4)+e[12].toFixed(2)+e[13].toFixed(2)+e[14].toFixed(2)+'|'+wrap.clientWidth+'x'+wrap.clientHeight+'|'+cur+stackMode+state.brand+state.cat+LBL.length;
  if(!labelsDirty&&key===labelKey)return;labelKey=key;labelsDirty=false;layoutLabels();}

/* ---------- you are here (the route's start) ---------- */
let kioskRing=null,hereLabel=null;
function buildKioskMarker(){
  const g=new THREE.Group();
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,3.2,10),new THREE.MeshStandardMaterial({color:0x1D2B36}));pole.position.y=1.6;
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.9,24,16),new THREE.MeshStandardMaterial({color:0xD4342C,emissive:0x7a1410,emissiveIntensity:0.6}));head.position.y=3.6;
  const disc=new THREE.Mesh(new THREE.CircleGeometry(1.4,32),new THREE.MeshBasicMaterial({color:0xD4342C,transparent:true,opacity:0.45,depthWrite:false}));disc.rotation.x=-Math.PI/2;disc.position.y=0.12;
  const ring=new THREE.Mesh(new THREE.RingGeometry(1.6,2.3,48),new THREE.MeshBasicMaterial({color:0xE0564E,transparent:true,opacity:0.6,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=0.14;kioskRing=ring;
  // facing wedge: which way the kiosk looks (only meaningful at the kiosk itself)
  const wedge=new THREE.Mesh(new THREE.CircleGeometry(4.5,24,-Math.PI/2-0.45,0.9),new THREE.MeshBasicMaterial({color:0xE0564E,transparent:true,opacity:0.16,depthWrite:false}));
  wedge.rotation.x=-Math.PI/2;wedge.rotation.z=-HEADING;wedge.position.y=0.13;g.userData.wedge=wedge;
  g.add(pole,head,disc,ring,wedge);markerGroup.add(g);
  const o=originPoint();g.userData.floor=o.f;
  hereLabel=addLabel(()=>escapeHtml(originPoint().label),o.f,o.x,o.y,5.4,1800,'here');
}
function setOrigin(){const o=originPoint();const g=markerGroup.children[0];if(!g)return;g.userData.floor=o.f;g.userData.wedge.visible=o.id==='kiosk';
  hereLabel.f=o.f;hereLabel.x=o.x;hereLabel.y=o.y;hereLabel.el.textContent=o.label;hereLabel.w=0;positionDynamic();applyFloorLayout(false);labelsDirty=true;}

/* ---------- route: draws itself in, then chevrons flow towards the destination ---------- */
const routeLabels=[];let movers=[],pin=null,destRing=null,legAnims=[];
const routeMat=new THREE.MeshBasicMaterial({color:0xC8261E,toneMapped:false});            // flat brand red, unaffected by lighting
const caseMat=new THREE.MeshBasicMaterial({color:0xFFFFFF});
const dotMat=new THREE.MeshBasicMaterial({color:0xffffff});
/* the destination pin: a teardrop lathed from a circle and its two tangents from the tip, in the app's green,
   with a gold collar and a round badge (the store's logo, or its initials) that always faces the viewer */
const PIN_R=1.3,PIN_H=3.2,PIN_BASE=SHOP_H+0.9;                   // head radius, tip to head centre, tip height above the floor
const PIN_GEO=(()=>{const R=PIN_R,H=PIN_H,phi=Math.acos(R/H),T=[R*Math.sin(phi),H-R*Math.cos(phi)],pts=[];
  for(let i=0;i<=8;i++){const t=i/8;pts.push(new THREE.Vector2(Math.max(0.0001,T[0]*t),T[1]*t));}
  for(let i=1;i<=24;i++){const a=phi+(Math.PI-phi)*i/24;pts.push(new THREE.Vector2(Math.max(0.0001,R*Math.sin(a)),H-R*Math.cos(a)));}
  const g=new THREE.LatheGeometry(pts,48);g.computeVertexNormals();g.userData.keep=true;return g;})();
const PIN_COLLAR=(()=>{const g=new THREE.TorusGeometry(PIN_R*1.01,0.1,10,48);g.userData.keep=true;return g;})();
const pinMat=new THREE.MeshStandardMaterial({color:0x1E2551,roughness:0.28,metalness:0.15,emissive:0x1E2551,emissiveIntensity:0.12});
const pinGoldMat=new THREE.MeshStandardMaterial({color:0xE8413B,roughness:0.3,metalness:0.75});
function pinBadgeMat(b,name){const c=document.createElement('canvas');c.width=c.height=256;
  const draw=img=>{const g=c.getContext('2d');g.clearRect(0,0,256,256);
    g.fillStyle='#E8413B';g.beginPath();g.arc(128,128,126,0,Math.PI*2);g.fill();
    g.fillStyle='#FFFFFF';g.beginPath();g.arc(128,128,114,0,Math.PI*2);g.fill();
    if(img){const k=Math.min(150/img.width,150/img.height);g.drawImage(img,128-img.width*k/2,128-img.height*k/2,img.width*k,img.height*k);return;}
    const t=state.toilet,words=String(name||'').replace(/[^A-Za-z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);
    let txt=b?(words.length>1?words[0][0]+words[1][0]:(words[0]||'?')[0]).toUpperCase():t&&t.kind==='wc'?'WC':t&&t.kind==='lift'?'LIFT':t&&t.kind==='entrance'?'EXIT':t&&t.unit?t.unit.id:'•';
    let fs=txt.length<=2?112:txt.length<=4?70:48;g.font=`700 ${fs}px Inter, "Segoe UI", system-ui, sans-serif`;
    while(g.measureText(txt).width>170&&fs>24){fs-=4;g.font=`700 ${fs}px Inter, "Segoe UI", system-ui, sans-serif`;}
    g.fillStyle='#1E2551';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,128,134);};
  draw(null);
  const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;tex.anisotropy=4;
  const m=new THREE.SpriteMaterial({map:tex,depthTest:false,depthWrite:false,toneMapped:false});m.userData.disposable=true;
  const l=b&&logoOf(b);if(l){const img=new Image();img.onload=()=>{draw(img);tex.needsUpdate=true;};img.src=l;}
  return m;}
const beamMat=new THREE.MeshBasicMaterial({color:0xD6B274,transparent:true,opacity:0.5,side:THREE.DoubleSide,depthWrite:false});
const destRingMat=new THREE.MeshBasicMaterial({color:0xC49C5B,transparent:true,opacity:0.7,side:THREE.DoubleSide,depthWrite:false});
const CHEVRON=(()=>{const s=new THREE.Shape();s.moveTo(0,0.5);s.lineTo(0.46,-0.02);s.lineTo(0.24,-0.02);s.lineTo(0,0.24);s.lineTo(-0.24,-0.02);s.lineTo(-0.46,-0.02);s.closePath();
  const g=new THREE.ShapeGeometry(s);g.rotateX(-Math.PI/2);g.userData.keep=true;return g;})();
const RADIAL=10,RADIAL_CASE=8;
function legCurve(leg){const path=new THREE.CurvePath();const P=leg.pts;for(let i=0;i<P.length-1;i++){const a=new THREE.Vector3((P[i][0]-CX)*SC,0,(P[i][1]-CY)*SC),b=new THREE.Vector3((P[i+1][0]-CX)*SC,0,(P[i+1][1]-CY)*SC);if(a.distanceTo(b)>0.01)path.add(new THREE.LineCurve3(a,b));}return path;}
function setDraw(a){const k=Math.floor(Math.max(0,Math.min(1,a.prog))*a.segs);a.tube.geometry.setDrawRange(0,k*RADIAL*6);a.cas.geometry.setDrawRange(0,k*RADIAL_CASE*6);}
function clearRoute(){stopGuide();doorHold=false;
  while(routeGroup.children.length){const o=routeGroup.children.pop();o.traverse(m=>{if(m.geometry&&!m.isSprite&&!m.geometry.userData.keep)m.geometry.dispose();   // sprites share one geometry
    if(m.material&&m.material.userData&&m.material.userData.disposable){if(m.material.map)m.material.map.dispose();m.material.dispose();}});}
  movers=[];pin=null;destRing=null;legAnims=[];
  routeLabels.forEach(L=>{L.el.remove();const i=LBL.indexOf(L);if(i>=0)LBL.splice(i,1);});routeLabels.length=0;
  FLOOR_ORDER.forEach(f=>floorBtns[f]&&floorBtns[f].classList.remove('onroute'));labelsDirty=true;
  const gb=document.getElementById('guidebar');if(gb)gb.hidden=true;}
function drawRoute(route){
  clearRoute();
  route.legs.forEach((leg,i)=>{if(floorBtns[leg.f])floorBtns[leg.f].classList.add('onroute');const g=new THREE.Group();g.userData.floor=leg.f;const path=legCurve(leg);leg.path=path;
    if(path.curves.length){const L=path.getLength(),segs=Math.max(8,Math.min(500,Math.round(L*2)));
      const tube=new THREE.Mesh(new THREE.TubeGeometry(path,segs,0.45,RADIAL,false),routeMat);tube.position.y=0.7;
      const cas=new THREE.Mesh(new THREE.TubeGeometry(path,segs,0.7,RADIAL_CASE,false),caseMat);cas.position.y=0.45;cas.scale.y=0.3;g.add(cas,tube);
      const anim={leg:i,f:leg.f,tube,cas,segs,g,prog:reduce?1:0,dur:Math.min(1.7,Math.max(0.55,L/42))};legAnims.push(anim);setDraw(anim);
      const n=Math.max(2,Math.round(L/6));for(let k=0;k<n;k++){const s=new THREE.Mesh(CHEVRON,dotMat);s.position.y=1.17;s.visible=false;g.add(s);movers.push({m:s,path,L,off:k/n,anim});}}
    const s=leg.pts[0],e=leg.pts[leg.pts.length-1];
    if(i<route.legs.length-1){const nf=route.legs[i+1];const up=FLOORS[nf.f].idx>FLOORS[leg.f].idx;
      const bc=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,5,24,1,true),beamMat);bc.position.set((e[0]-CX)*SC,2.5,(e[1]-CY)*SC);g.add(bc);const c=nf.ride.conn;
      routeLabels.push(addLabel(()=>T(c.type==='lift'?'{arrow} Lift to {fl}':'{arrow} Escalator to {fl}',{arrow:up?'▲':'▼',fl:flShort(nf.f)}),leg.f,e[0],e[1],6,1700,'rt'));
    }else{pin=new THREE.Group();
      const tu=state.brand&&state.targetUnit&&state.targetUnit.f===leg.f?state.targetUnit:null;
      const cl=tu&&(brandClusters(leg.f,state.brand).find(c=>c.some(u=>u.key===tu.key))||[tu]),spot=cl?plaqueSpot(cl):null,pp=spot?[spot.x,spot.y]:e;
      const body=new THREE.Group();body.position.y=PIN_BASE;                     // a map pin: brand-green teardrop, gold collar, the store's badge
      const drop=new THREE.Mesh(PIN_GEO,pinMat);drop.castShadow=true;
      const collar=new THREE.Mesh(PIN_COLLAR,pinGoldMat);collar.position.y=PIN_H;collar.rotation.x=Math.PI/2;
      const badge=new THREE.Sprite(pinBadgeMat(state.brand,destName()));badge.scale.set(PIN_R*1.62,PIN_R*1.62,1);badge.position.y=PIN_H;badge.renderOrder=6;
      body.add(drop,collar,badge);pin.add(body);pin.userData.body=body;
      pin.position.set((pp[0]-CX)*SC,0,(pp[1]-CY)*SC);pin.visible=!!reduce;pin.userData.t0=reduce?1:0;g.add(pin);
      destRing=new THREE.Mesh(new THREE.RingGeometry(1.4,1.9,48),destRingMat);destRing.rotation.x=-Math.PI/2;destRing.position.set((e[0]-CX)*SC,0.16,(e[1]-CY)*SC);destRing.visible=false;g.add(destRing);}
    if(i>0){const d=new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,0.5,20),routeMat);d.position.set((s[0]-CX)*SC,0.6,(s[1]-CY)*SC);g.add(d);}
    routeGroup.add(g);});
  route.legs.forEach((leg,i)=>{if(i===route.legs.length-1)return;const nf=route.legs[i+1];const e=leg.pts[leg.pts.length-1],s=nf.pts[0];
    const g=new THREE.Group();g.userData.floor='*';g.userData.link={a:[leg.f,e],b:[nf.f,s]};g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.3,1,10),routeMat));routeGroup.add(g);});
  positionDynamic();applyFloorLayout(false);labelsDirty=true;
}
/* the pin drops in once the route has drawn itself, or straight away when the walk starts before that */
function dropPin(){if(pin&&!pin.userData.t0){pin.userData.t0=performance.now();pin.visible=true;}}
function stepRouteAnim(dt,now){
  let first=true;
  for(const a of legAnims){if(a.prog>=1)continue;if(stackMode){if(!first)break;}else if(a.f!==cur)continue;
    a.prog=Math.min(1,a.prog+dt/a.dur);setDraw(a);first=false;
    if(a.prog>=1&&a.leg===legAnims.length-1&&pin&&!pin.userData.t0){pin.userData.t0=now;pin.visible=true;}}
  if(pin&&pin.userData.t0){const k=reduce?1:Math.min(1,(now-pin.userData.t0)/750);
    const b=k<1/2.75?7.5625*k*k:k<2/2.75?7.5625*(k-1.5/2.75)**2+0.75:k<2.5/2.75?7.5625*(k-2.25/2.75)**2+0.9375:7.5625*(k-2.625/2.75)**2+0.984375;   // bounce
    const bob=k>=1&&!reduce?Math.sin(now/1000*2.4)*0.35:0;const y=(1-b)*14+bob;
    pin.userData.body.position.y=PIN_BASE+y;pin.scale.setScalar(0.6+0.4*Math.min(1,k*3));if(k<1)labelsDirty=true;   // its name tag rides on it
    if(destRing){destRing.visible=k>=0.6;if(!reduce){const q=((now/1000)%1.8)/1.8;destRing.scale.setScalar(0.8+q*2.2);destRingMat.opacity=0.75*(1-q);}}}
  movers.forEach(o=>{if(o.anim.prog<1){o.m.visible=false;return;}o.m.visible=true;const u=reduce?o.off:((now/1000*6/o.L)+o.off)%1;
    const p=o.path.getPointAt(u),t=o.path.getTangentAt(u);o.m.position.x=p.x;o.m.position.z=p.z;o.m.rotation.y=Math.atan2(-t.x,-t.z);});
}
function positionDynamic(){
  routeGroup.children.forEach(g=>{if(g.userData.link){const {a,b}=g.userData.link;const A=W3(a[0],a[1][0],a[1][1],0.7),B=W3(b[0],b[1][0],b[1][1],0.7);
      const m=g.children[0];m.position.copy(A.clone().add(B).multiplyScalar(0.5));m.scale.set(1,Math.max(0.01,A.distanceTo(B)),1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),B.clone().sub(A).normalize());g.visible=stackMode;}
    else g.position.y=disp[g.userData.floor]||0;});
  const o=originPoint();markerGroup.children.forEach(g=>{const p=W3(o.f,o.x,o.y,0);g.position.set(p.x,disp[o.f],p.z);});
}
function showRouteOnFloor(animate){
  const r=state.route;if(!r)return;if(stackMode){fitFloor(animate?750:0);return;}
  const leg=r.legs.find(l=>l.f===cur);if(!leg){fitFloor(animate?650:0);return;}
  let pts=leg.pts.slice();if(leg===r.legs[r.legs.length-1]&&state.targetUnit&&state.targetUnit.f===cur)pts=pts.concat(state.targetUnit.pts);
  const b=bbox(pts);const pad=60;let rr=[b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad];
  const minS=430;if(rr[2]-rr[0]<minS){const c=(rr[0]+rr[2])/2;rr[0]=c-minS/2;rr[2]=c+minS/2;}if(rr[3]-rr[1]<minS){const c=(rr[1]+rr[3])/2;rr[1]=c-minS/2;rr[3]=c+minS/2;}
  planBoxToView(cur,rr,animate?850:0,0.78,HEADING);
}

/* ---------- guided walk: a follow camera; rides lifts and escalators between floors ---------- */
let SPEED=9;                                      // metres per second of preview (route mode slows it while the voice speaks)
function startGuide(){
  const r=state.route;if(!r)return;stopGuide();
  if(stackMode){stackMode=false;syncStackUI();}
  if(reduce){setFloor(r.legs[0].f,false);applyFloorLayout(false);showRouteOnFloor(false);return;}   // no motion: show the first leg
  legAnims.forEach(a=>{a.prog=1;setDraw(a);});dropPin();
  guide={legIdx:0,d:0,pause:0,heading:null,r,ride:null,hold:false};setFloor(r.legs[0].f,false);applyFloorLayout(false);
  document.getElementById('guidebar').hidden=false;updateGuideText();labelsDirty=true;
}
function stopGuide(){if(!guide)return;guide=null;const gb=document.getElementById('guidebar');if(gb)gb.hidden=true;if(guideDot)guideDot.visible=false;}
function updateGuideText(){if(!guide)return;const r=guide.r,leg=r.legs[guide.legIdx];const last=guide.legIdx===r.legs.length-1;
  const dest=destName()||T('your destination');let t;
  const fw=f=>LANG==='hi'?floorName(f):FLOORS[f].name.toLowerCase();
  if(guide.ride){const c=leg.ride.conn,up=FLOORS[leg.f].idx>FLOORS[r.legs[guide.legIdx-1].f].idx;t=T(`${c.type==='lift'?'Taking the lift':'Riding the escalator'} ${up?'up':'down'} to the {floor}`,{floor:fw(leg.f)});}
  else if(last)t=T('Walk to {dest}',{dest});
  else{const nx=r.legs[guide.legIdx+1],c=nx.ride.conn,up=FLOORS[nx.f].idx>FLOORS[leg.f].idx;t=T(`Walk to the ${c.type==='lift'?'lift':'escalator'}, then go ${up?'up':'down'} to the {floor}`,{floor:fw(nx.f)});}
  document.getElementById('guidetext').textContent=t;}
function followCam(p,dt){const target=new THREE.Vector3(p.x,p.y-0.1,p.z);const dist=VIEW==='app'?66:58;
  const off=new THREE.Vector3().setFromSpherical(new THREE.Spherical(dist,0.95,guide.heading??0));
  controls.target.lerp(target,Math.min(1,dt*4));camera.position.lerp(target.clone().add(off),Math.min(1,dt*3));labelsDirty=true;}
function placeDot(p){if(!guideDot)return;guideDot.visible=true;guideDot.position.copy(p);guideDot.rotation.y=(guide.heading??0);}
/* hold the walker where it is, camera still following (pause, or a step picked by hand) */
function holdGuide(dt){const r=guide.r,leg=r.legs[guide.legIdx],path=leg.path;const L=path&&path.curves.length?path.getLength():0;
  const u=L?Math.min(1,guide.d/L):1,p=L?path.getPointAt(u):W3(leg.f,leg.pts[0][0],leg.pts[0][1],0);
  if(guide.heading===null&&L){const t=path.getTangentAt(Math.min(0.999,u));guide.heading=Math.atan2(-t.x,-t.z);}
  const pos=new THREE.Vector3(p.x,disp[leg.f]+0.9,p.z);followCam(pos,dt);placeDot(pos);}
function guideJump(leg,m,play){const r=state.route;if(!r)return;
  if(!guide){guide={legIdx:0,d:0,pause:0,heading:null,r,ride:null};legAnims.forEach(a=>{a.prog=1;setDraw(a);});dropPin();}
  if(stackMode){stackMode=false;syncStackUI();}
  leg=Math.max(0,Math.min(r.legs.length-1,leg));const path=r.legs[leg].path;const L=path&&path.curves.length?path.getLength():0;
  Object.assign(guide,{legIdx:leg,d:Math.min(Math.max(0,m),L),ride:null,pause:0,heading:null,hold:!play});
  if(cur!==r.legs[leg].f)setFloor(r.legs[leg].f,false,{ms:700});}
function guideHold(on){if(guide)guide.hold=!!on;}
function stepGuide(dt){
  if(!guide)return;const r=guide.r;
  if(guide.hold){holdGuide(dt);return;}
  if(guide.ride){const R=guide.ride;R.t+=dt;const k=Math.min(1,R.t/R.dur),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
    const x=R.a[0]+(R.b[0]-R.a[0])*e,z=R.a[1]+(R.b[1]-R.a[1])*e,y=disp[R.fa]+(disp[R.fb]-disp[R.fa])*e;   // the floors slide past the rider
    const p=new THREE.Vector3((x-CX)*SC,y+0.9,(z-CY)*SC);followCam(p,dt);placeDot(p);
    if(k>=1){guide.ride=null;guide.d=0;updateGuideText();}return;}
  if(guide.pause>0){guide.pause-=dt;if(guide.pause<=0){
      if(guide.legIdx<r.legs.length-1){const a=r.legs[guide.legIdx],b=r.legs[guide.legIdx+1];guide.legIdx++;
        const lift=b.ride&&b.ride.type==='lift';const dur=lift?1.8:1.5;
        guide.ride={t:0,dur,a:a.pts[a.pts.length-1],b:b.pts[0],fa:a.f,fb:b.f};
        setFloor(b.f,false,{ms:dur*1000});updateGuideText();}
      else{stopGuide();showRouteOnFloor(true);}}
    return;}
  const leg=r.legs[guide.legIdx];const path=leg.path;
  const L=path&&path.curves.length?path.getLength():0;guide.d+=SPEED*dt;
  const u=L?Math.min(1,guide.d/L):1;
  const p=L?path.getPointAt(u):W3(leg.f,leg.pts[0][0],leg.pts[0][1],0);
  const ahead=L?path.getPointAt(Math.min(1,u+Math.min(0.15,6/L))):p.clone().add(new THREE.Vector3(0,0,-1));
  const dir=ahead.clone().sub(p);dir.y=0;
  let hd=guide.heading;if(dir.lengthSq()>1e-4){const want=Math.atan2(-dir.x,-dir.z);if(hd===null)hd=want;let dA=want-hd;while(dA>Math.PI)dA-=2*Math.PI;while(dA<-Math.PI)dA+=2*Math.PI;hd+=dA*Math.min(1,dt*2.2);}
  guide.heading=hd;
  const pos=new THREE.Vector3(p.x,disp[leg.f]+0.9,p.z);followCam(pos,dt);placeDot(pos);
  if(u>=1){const last=guide.legIdx===r.legs.length-1;guide.pause=last?1.4:0.5;if(last)doorHold=true;}
}
let guideDot=null;
function buildGuideDot(){const s=new THREE.Shape();s.moveTo(0,1.3);s.lineTo(0.95,-0.9);s.lineTo(0,-0.4);s.lineTo(-0.95,-0.9);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:0.3,bevelEnabled:false});g.rotateX(-Math.PI/2);g.scale(1.3,1,1.3);
  guideDot=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0xffffff}));const ring=new THREE.Mesh(new THREE.CircleGeometry(1.9,32),new THREE.MeshBasicMaterial({color:0x2F80ED}));ring.rotation.x=-Math.PI/2;ring.position.y=-0.05;
  guideDot.add(ring);guideDot.visible=false;scene.add(guideDot);}

/* ---------- highlight ---------- */
const DIM=new THREE.Color(0x9DA2A5),GOLD=new THREE.Color(0xF07A74);
function clearHighlights(){Object.values(unitEls).forEach(({roof,base})=>{roof.color.copy(base);roof.emissive.setHex(0);});}
function applyHighlights(){clearHighlights();labelsDirty=true;
  if(state.brand){Object.values(unitEls).forEach(({roof,unit})=>{if(unit.b===state.brand){roof.color.copy(GOLD);roof.emissive.copy(GOLD).multiplyScalar(0.45);}else roof.color.lerp(DIM,0.55);});}
  else if(state.cat){Object.values(unitEls).forEach(({roof,unit})=>{if(!unit.b||!catMatch(BRANDS[unit.b].cat))roof.color.lerp(DIM,0.55);else roof.color.set(0xE3C992);});}
  styleBadges();}
/* the chosen store's plaque lifts and grows; the others step back */
function styleBadges(){const night=MODE==='evening';
  BADGES.forEach(B=>{const sel=!!state.brand&&B.b===state.brand;const dim=(!!state.brand&&!sel)||(!!state.cat&&!(BRANDS[B.b]&&catMatch(BRANDS[B.b].cat)));
    B.target={s:sel?1.25:1,y:SHOP_H+(sel?1.1:0.5)};B.top.color.setScalar(dim?0.66:1);B.top.emissiveIntensity=(night?0.8:0.3)*(dim?0.45:sel?1.4:1);});}
function stepBadges(dt){const k=Math.min(1,dt*7);BADGES.forEach(B=>{const t=B.target;if(!t)return;const m=B.mesh;
  if(Math.abs(m.scale.x-t.s)>1e-3){m.scale.setScalar(m.scale.x+(t.s-m.scale.x)*k);labelsDirty=true;}if(Math.abs(m.position.y-t.y)>1e-3)m.position.y+=(t.y-m.position.y)*k;});}
function pulseHighlight(t){if(!state.brand||reduce)return;const k=0.32+0.16*Math.sin(t*3.2);
  (UNITS_BY_BRAND[state.brand]||[]).forEach(u=>{const e=unitEls[u.key];if(e)e.roof.emissive.copy(GOLD).multiplyScalar(k);});}
function markUnit(u){const e=unitEls[u.key];if(e)e.roof.color.set(0xE6E0D2);}

/* ---------- picking ---------- */
const ray=new THREE.Raycaster();let downAt=null;
renderer.domElement.addEventListener('pointerdown',e=>{downAt=[e.clientX,e.clientY];camTween=null;idleOrbit=false;if(guide){if(typeof RM!=='undefined'&&RM.on){RM.userHold=true;guide.hold=true;}else stopGuide();}poke();});
renderer.domElement.addEventListener('pointerup',e=>{if(!downAt)return;const moved=Math.hypot(e.clientX-downAt[0],e.clientY-downAt[1]);downAt=null;if(moved>7)return;
  const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1),camera);
  const targets=[];Object.values(unitEls).forEach(({mesh})=>{if(mesh.parent===floorGroup[cur])targets.push(mesh);});
  Object.values(wcMesh).forEach(m=>{if(m.parent===floorGroup[cur])targets.push(m);});
  const hits=ray.intersectObjects(targets,false);if(!hits.length)return;const o=hits[0].object;
  if(o.userData.unit)onUnitTap(o.userData.unit);else if(o.userData.toilet)selectToilet(o.userData.toilet,o.userData.floor);});
controls.addEventListener('change',()=>{labelsDirty=true;});

/* ---------- store logos on the 3D signs (uploaded in the admin hub) ---------- */
function refreshSigns(){BADGES.forEach(B=>{const l=logoOf(B.b);if(l!==B.logo)badgeLogo(B,l);});SIGNS.forEach(sg=>{const l=logoOf(sg.b);if(sg.logo===l)return;sg.logo=l;const old=sg.mat.map;
  const swap=t=>{sg.mat.map=t;sg.mat.emissiveMap=t;sg.mat.needsUpdate=true;if(old&&old!==t)old.dispose();};
  if(!l){swap(signTexture(BRANDS[sg.b].name,sg.w));sg.mat.emissiveIntensity=0.9;return;}
  const img=new Image();img.onload=()=>{if(sg.logo!==l)return;const Wp=Math.min(2048,Math.max(256,Math.round(sg.w*120))),Hp=Math.round(Wp*sg.hS/sg.w);const c=document.createElement('canvas');c.width=Wp;c.height=Hp;const g=c.getContext('2d');
    g.fillStyle='#FFFFFF';g.fillRect(0,0,Wp,Hp);g.fillStyle='#E8413B';g.fillRect(0,Hp-6,Wp,6);const pad=Hp*0.13,bw=Wp-pad*2,bh=Hp-pad*2-6;const k=Math.min(bw/img.width,bh/img.height);
    g.drawImage(img,(Wp-img.width*k)/2,(Hp-6-img.height*k)/2,img.width*k,img.height*k);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=8;
    swap(t);sg.mat.emissiveIntensity=0.5;};img.onerror=()=>{sg.logo='';};img.src=l;});}

/* ---------- loop ---------- */
function resize(){const w=wrap.clientWidth,h=wrap.clientHeight;if(!w||!h)return;renderer.setPixelRatio(fitPixelRatio(w,h));renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();LBL.forEach(L=>L.w=0);labelsDirty=true;}
new ResizeObserver(resize).observe(wrap);resize();
const clock3=new THREE.Clock();let paused=false,skip=0,loopErrors=0,built=false,shadowKey='';
function frame(){
  const dt=Math.min(0.25,clock3.getDelta()),t=clock3.elapsedTime,now=performance.now();   // capped so a stall never jumps the walk
  U.time.value=t;if(layoutTween)DITHER_T.value=(DITHER_T.value+1)%64;stepLayout(now);stepCam(now);stepGuide(dt);stepDoors(dt);stepRouteAnim(dt,now);pulseHighlight(t);stepBadges(dt);
  if(idleOrbit&&!camTween&&!guide){const off=camera.position.clone().sub(controls.target);off.applyAxisAngle(new THREE.Vector3(0,1,0),dt*0.07);camera.position.copy(controls.target).add(off);labelsDirty=true;}
  controls.update();turnBadges(dt);
  if(kioskRing&&!reduce){const k=(t%2.2)/2.2;kioskRing.scale.setScalar(0.8+k*1.8);kioskRing.material.opacity=0.6*(1-k);}
  if(!reduce)escSteps.forEach(tx=>{tx.offset.x=-(t*0.9)%1;});
  sun.position.set(controls.target.x-70,controls.target.y+130,controls.target.z+60);sun.target.position.copy(controls.target);WU.sunDir.value.copy(sun.position).sub(sun.target.position).normalize();
  {const t=controls.target,k=t.x.toFixed(1)+','+t.y.toFixed(1)+','+t.z.toFixed(1)+'|'+disp.F.toFixed(2)+disp.S.toFixed(2)+disp.G.toFixed(2)+'|'+(layoutTween?now:0)+(guide?now:0)+'|'+DOORS.reduce((a,d)=>a+d.open,0).toFixed(2)+'|'+MODE;
    if(k!==shadowKey){shadowKey=k;renderer.shadowMap.needsUpdate=true;}}
  const sph=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));if(compassNeedle)compassNeedle.style.transform=`rotate(${(-sph.theta)*180/Math.PI}deg)`;
  renderer.render(scene,camera);maybeLayoutLabels();
}
const compassNeedle=document.getElementById('needle');
/* frame-time watch: below ~30 fps drop the supersampling a notch, above ~55 fps for a while bring it back */
let ftEma=16,ftLast=0,ftCheck=0,ftGood=0;
function adaptQuality(now){if(ftLast){const d=Math.min(200,now-ftLast);ftEma+=(d-ftEma)*0.08;}ftLast=now;
  if(HIGHQ||now<ftCheck)return;ftCheck=now+2000;
  if(ftEma>34&&pixelRatio>PR_MIN){pixelRatio=Math.max(PR_MIN,pixelRatio-0.25);ftGood=0;resize();}
  else if(ftEma<18&&pixelRatio<PR_MAX){if(++ftGood>=4){pixelRatio=Math.min(PR_MAX,pixelRatio+0.25);ftGood=0;resize();}}else ftGood=0;}
/* drawn only while someone can see it: not behind another phone tab, scrolled away or folded up (phone batteries) */
let onScreen=true;
if(typeof IntersectionObserver==='function')new IntersectionObserver(es=>{const was=onScreen;onScreen=es[es.length-1].isIntersecting;
  if(onScreen&&!was){clock3.getDelta();labelsDirty=true;ftLast=0;}}).observe(wrap);
/* 60 fps while the camera moves; 30 once it has been still for a moment (the water and fountains look the same) */
let lastActive=0,half=false;const active=()=>{lastActive=performance.now();};
controls.addEventListener('change',active);renderer.domElement.addEventListener('pointerdown',active);renderer.domElement.addEventListener('wheel',active,{passive:true});
function loop(){requestAnimationFrame(loop);
  if(paused||contextLost||!onScreen||document.hidden||document.body.classList.contains('view-admin'))return;
  if(LOWPOWER&&(skip=(skip+1)%2))return;                         // ~30 fps on weak kiosk hardware
  const now=performance.now();if(camTween||layoutTween||(guide&&!guide.hold))lastActive=now;
  if(!LOWPOWER&&!HIGHQ&&now-lastActive>1500&&(half=!half)){ftLast=0;return;}   // (no frame-time sample across a skipped frame)
  try{adaptQuality(now);frame();loopErrors=0;}catch(e){loopErrors++;if(loopErrors===1)reportError(e,'map frame');if(loopErrors>20){paused=true;onFail&&onFail(e);}}}

/* ---------- init ---------- */
const fontsReady=document.fonts&&document.fonts.ready?Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,2500))]):Promise.resolve();
/* after the next frame is on screen (or 100 ms, when the page is in the background and frames stop) */
const nextFrame=()=>new Promise(r=>{let done=false;const go=()=>{if(!done){done=true;setTimeout(r,0);}};requestAnimationFrame(go);setTimeout(go,100);});
/* Every floor's shaders before the first frame (not on the first floor change), but a slice per frame: whatever
   fits in ~40 ms. A new shader takes ~150 ms on a cold Windows start and there are ~45, so in one go the page froze
   for seconds; now taps, the intro and the panels keep running while the map builds. three r147's compile() finds
   the materials through scene.traverse, so the scene lends it one slice of its objects at a time. */
async function compileInSlices(){const objs=[];scene.traverse(o=>{if(o.material)objs.push(o);});let i=0;
  while(i<objs.length){const t0=performance.now();
    scene.traverse=cb=>{for(;i<objs.length&&performance.now()-t0<40;i++)cb(objs[i]);};
    try{renderer.compile(scene,camera);}finally{delete scene.traverse;}
    await nextFrame();}}
Promise.all([fontsReady,loadKit()]).then(async([,kit])=>{KIT=kit;
  try{
    FLOOR_ORDER.forEach(buildFloor);collectFloorMats();
    buildLabels();buildKioskMarker();buildGuideDot();applyMode();
    FLOOR_ORDER.forEach(f=>{floorGroup[f].visible=true;});await nextFrame();await compileInSlices();
    {const rt=new THREE.WebGLRenderTarget(8,8),culled=[];scene.traverse(o=>{if(o.frustumCulled){o.frustumCulled=false;culled.push(o);}});   // and its textures and buffers
      /* three r147 gives any off-screen target linear output and no tone mapping, i.e. a second set of every shader
         (24 standard ones alone, ~10 s on a cold Windows start). Marked like an XR target with the screen's encoding,
         this warm-up draw uses the very programs compiled for the screen just above. */
      rt.isXRRenderTarget=true;rt.texture.encoding=renderer.outputEncoding;
      renderer.setRenderTarget(rt);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);renderer.setRenderTarget(null);rt.dispose();culled.forEach(o=>{o.frustumCulled=true;});}
    FLOOR_ORDER.forEach(f=>setFloorFade(f,targetFade(f)));built=true;
    setFloor(cur,false);applyFloorLayout(false);fitFloor(0);
    if(!reduce){const endT=controls.target.clone(),endP=camera.position.clone();   // intro: sweep in from high above
      camera.position.copy(endT).add(new THREE.Vector3().setFromSpherical(new THREE.Spherical(Math.min(controls.maxDistance,endP.distanceTo(endT)*1.7),0.3,HEADING+0.9)));
      controls.update();startCam(endT,endP,2200);}
    renderer.compile(scene,camera);loop();onReady&&onReady();
    if(QS.get('debug')==='1')window.MAPDBG={THREE,scene,camera,controls,renderer,floorGroup,startCam,W3,frame};   // inspection only
  }catch(e){onFail&&onFail(e);}
});

return {kind:'3d',setFloor,fitFloor:ms=>fitFloor(ms),drawRoute,clearRoute,showRouteOnFloor,startGuide,stopGuide,guideJump,guideHold,setGuideSpeed(v){SPEED=v;},applyHighlights,markUnit,applyMode,refreshSigns,refreshStores,relabel,
  toggleStack,zoom:k=>dolly(k),rotate:a=>orbit(a),toggleTilt,faceKiosk,resize,setOrigin,
  setIdle(on){idleOrbit=!!on&&!reduce;if(on){stopGuide();}},pause(on){paused=!!on;if(!on)clock3.getDelta();},
  isReady:()=>built,
  dispose(){paused=true;try{renderer.dispose();renderer.forceContextLoss();}catch(e){}renderer.domElement.remove();LBL.forEach(L=>L.el.remove());LBL.length=0;}};
}
