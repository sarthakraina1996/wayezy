/* ============================================================
   QR CODES for the kiosk: "continue on your phone" (the route from this kiosk) and "the map on your phone".
   A small encoder after ISO/IEC 18004: byte mode (UTF-8), error correction level M (15 %), versions 1-10 (up to
   213 bytes, plenty for a link), the best of the eight masks by the standard's penalty rules.
   Pure logic, no DOM: qrMatrix(text) -> {size, dark(x,y)}; qrSVG(text) draws it (flat, with its quiet zone).
   tests/qr.test.js reads codes back with an independent decoder.
   ============================================================ */
const QR=(function(){
  const ECC_PER_BLOCK=[0,10,16,26,18,24,16,18,22,22,26],BLOCKS=[0,1,1,1,2,2,4,4,4,5,5];   // level M, versions 1-10
  const rawModules=v=>{let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36;}return r;};
  const dataCodewords=v=>Math.floor(rawModules(v)/8)-ECC_PER_BLOCK[v]*BLOCKS[v];
  const bit=(x,i)=>((x>>>i)&1)!==0;
  /* GF(256) with the QR polynomial x^8+x^4+x^3+x^2+1 */
  function mul(x,y){let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x;}return z;}
  function rsDivisor(deg){const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;
    for(let i=0;i<deg;i++){for(let j=0;j<r.length;j++){r[j]=mul(r[j],root);if(j+1<r.length)r[j]^=r[j+1];}root=mul(root,2);}return r;}
  function rsRemainder(data,div){const r=div.map(()=>0);for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>{r[i]^=mul(c,f);});}return r;}
  function encodeBytes(bytes){
    let v=1;for(;v<=10;v++){if(4+(v<10?8:16)+bytes.length*8<=dataCodewords(v)*8)break;}
    if(v>10)throw new Error('QR: the text is too long');
    const bits=[];const put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1);};
    put(4,4);put(bytes.length,v<10?8:16);bytes.forEach(b=>put(b,8));
    const cap=dataCodewords(v)*8;put(0,Math.min(4,cap-bits.length));while(bits.length%8)bits.push(0);
    const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=b<<1|bits[i+j];data.push(b);}
    for(let pad=0xEC;data.length<dataCodewords(v);pad^=0xEC^0x11)data.push(pad);
    // split into blocks, add each block's error correction, interleave
    const nb=BLOCKS[v],ecl=ECC_PER_BLOCK[v],raw=Math.floor(rawModules(v)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb),div=rsDivisor(ecl),blocks=[];
    for(let i=0,k=0;i<nb;i++){const d=data.slice(k,k+shortLen-ecl+(i<nShort?0:1));k+=d.length;const e=rsRemainder(d,div);if(i<nShort)d.push(0);blocks.push(d.concat(e));}
    const out=[];for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-ecl||j>=nShort)out.push(b[i]);});
    return {v,codewords:out};}
  function build(v,codewords){
    const n=v*4+17,m=[],fn=[];for(let y=0;y<n;y++){m.push(new Array(n).fill(false));fn.push(new Array(n).fill(false));}
    const set=(x,y,d)=>{m[y][x]=d;fn[y][x]=true;};
    for(let i=0;i<n;i++){set(6,i,i%2===0);set(i,6,i%2===0);}                                           // timing
    const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;if(x>=0&&x<n&&y>=0&&y<n)set(x,y,d!==2&&d!==4);}};
    finder(3,3);finder(n-4,3);finder(3,n-4);
    const pos=[];if(v>1){const na=Math.floor(v/7)+2,step=Math.floor((v*8+na*3+5)/(na*4-4))*2;pos.push(6);for(let p=n-7;pos.length<na;p-=step)pos.splice(1,0,p);}
    pos.forEach((a,i)=>pos.forEach((b,j)=>{if(i===0&&j===0||i===0&&j===pos.length-1||i===pos.length-1&&j===0)return;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(a+dx,b+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}));
    const format=mask=>{const d=0<<3|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=(d<<10|r)^0x5412;   // level M = 00
      for(let i=0;i<=5;i++)set(8,i,bit(b,i));set(8,7,bit(b,6));set(8,8,bit(b,7));set(7,8,bit(b,8));for(let i=9;i<15;i++)set(14-i,8,bit(b,i));
      for(let i=0;i<8;i++)set(n-1-i,8,bit(b,i));for(let i=8;i<15;i++)set(8,n-15+i,bit(b,i));set(8,n-8,true);};
    format(0);
    if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=v<<12|r;
      for(let i=0;i<18;i++){const a=n-11+i%3,c=Math.floor(i/3);set(a,c,bit(b,i));set(c,a,bit(b,i));}}
    let i=0;for(let right=n-1;right>=1;right-=2){if(right===6)right=5;                                      // the data, in the zigzag
      for(let vert=0;vert<n;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?n-1-vert:vert;
        if(!fn[y][x]&&i<codewords.length*8){m[y][x]=bit(codewords[i>>>3],7-(i&7));i++;}}}
    const MASK=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
      (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
    const apply=k=>{for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!fn[y][x]&&MASK[k](x,y))m[y][x]=!m[y][x];};
    const P1=[1,0,1,1,1,0,1,0,0,0,0],P2=[0,0,0,0,1,0,1,1,1,0,1];
    const penalty=()=>{let s=0,dark=0;const at=(x,y,col)=>col?m[x][y]:m[y][x];
      for(const col of [false,true])for(let a=0;a<n;a++){let run=1;
        for(let b=1;b<n;b++){if(at(b,a,col)===at(b-1,a,col)){run++;if(run===5)s+=3;else if(run>5)s++;}else run=1;}
        for(let b=0;b+11<=n;b++){let p1=true,p2=true;for(let k=0;k<11;k++){const d=at(b+k,a,col)?1:0;if(d!==P1[k])p1=false;if(d!==P2[k])p2=false;}if(p1)s+=40;if(p2)s+=40;}}
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){if(m[y][x])dark++;if(x<n-1&&y<n-1){const c=m[y][x];if(c===m[y][x+1]&&c===m[y+1][x]&&c===m[y+1][x+1])s+=3;}}
      return s+10*(Math.ceil(Math.abs(dark*20-n*n*10)/(n*n))-1);};
    let best=0,bestS=Infinity;for(let k=0;k<8;k++){apply(k);format(k);const s=penalty();if(s<bestS){bestS=s;best=k;}apply(k);}
    apply(best);format(best);
    return {size:n,version:v,mask:best,dark:(x,y)=>m[y][x]};}
  function utf8(s){if(typeof TextEncoder!=='undefined')return Array.from(new TextEncoder().encode(s));return Array.from(unescape(encodeURIComponent(s)),c=>c.charCodeAt(0));}
  return {matrix(text){const e=encodeBytes(utf8(String(text)));return build(e.v,e.codewords);}};
})();
function qrMatrix(text){return QR.matrix(text);}
/* the code as SVG: dark modules as one path on a light square with a 4-module quiet zone */
function qrSVG(text,opt){opt=opt||{};const q=qrMatrix(text),Z=4,N=q.size+2*Z;let d='';
  for(let y=0;y<q.size;y++)for(let x=0;x<q.size;x++)if(q.dark(x,y))d+=`M${x+Z} ${y+Z}h1v1h-1z`;
  return `<svg class="${opt.cls||'qr'}" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" role="img" aria-label="${opt.label||'QR code'}"><rect width="${N}" height="${N}" fill="${opt.light||'#fff'}"/><path d="${d}" fill="${opt.dark||'#1E2551'}"/></svg>`;}
if(typeof module!=='undefined')module.exports={qrMatrix,qrSVG};
