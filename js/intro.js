/* ============================================================
   INTRO: the Wayezy logo sting (3.4 s, like a streaming service's opening) when the kiosk or the phone app
   opens, and when the admin hub is entered. Loaded at the top of <body>, right after #intro, so it covers the
   page from the first paint while the rest loads underneath.
   - drawn by the page (styles.css "Intro"): the wordmark is media/wayezy-mark.png, sharp on any screen and in any
     shape; only transform, opacity and filter move, so the graphics chip runs it smoothly. The sound is the intro
     film's, copied out losslessly (media/intro.aac, blender/mp4_audio.py).
   - once per view per page: switching to a view seen already does not replay it; a sign-in always does
   - sound when the browser allows it (a kiosk started with --autoplay-policy=no-user-gesture-required, or after the
     sign-in click); otherwise it plays silently
   - a touch, a click or a key skips it; reduced motion shows the wordmark still, briefly
   - Intro.over() resolves when it has finished: the 3D map waits for it, so its start-up work (shaders on the
     graphics chip) never makes the intro stutter
   ?intro=0 turns it off (the tests and the launch-film recorder use it).
   ============================================================ */
const Intro=(()=>{
  const qs=new URLSearchParams(location.search);
  const box=document.getElementById('intro'),img=box&&box.querySelector('.iz-logo img'),snd=box&&box.querySelector('audio'),skip=box&&box.querySelector('button');
  const off=!box||!img||qs.get('intro')==='0';
  const LEN=3400,CALM=1800;
  const seen=new Set();let on=false,timer=0,startT=0,after=[],waiters=[];
  const calm=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  const firstView=['kiosk','app','admin'].includes(qs.get('view'))?qs.get('view'):(matchMedia('(max-width:700px)').matches?'app':'kiosk');
  /* the light streaks over the wordmark: thin lines in the logo's colours, a little apart in height and timing */
  if(box){const st=box.querySelector('.iz-streaks'),C=['#19C3FF','#2F8BFF','#5B5BFF','#8A3CFF','#C13CF5','#E83CF0','#FF4F9A','#FF6A5C','#FF9A2E','#FFC93C'];
    if(st&&!st.children.length)for(let i=0;i<14;i++){const e=document.createElement('i'),c=C[i%C.length],h=60+((i*37)%40);
      e.style.cssText=`left:${(4+i*92/13).toFixed(1)}%;top:${(100-h)/2}%;bottom:${(100-h)/2}%;background:${c};box-shadow:0 0 6px ${c},0 0 14px ${c};--d:${(i*53)%180}ms`;st.appendChild(e);}}
  function finish(){if(!on)return;on=false;clearTimeout(timer);clearTimeout(startT);
    box.classList.add('out');box.setAttribute('aria-hidden','true');
    document.removeEventListener('keydown',onKey,true);
    setTimeout(()=>{if(on)return;box.classList.remove('show','run','out','calm');try{snd&&snd.pause();}catch(e){}},520);
    const fns=after;after=[];fns.forEach(f=>{try{f();}catch(e){console.error(e);}});
    const ws=waiters;waiters=[];ws.forEach(r=>r());}
  function onKey(e){e.preventDefault();e.stopPropagation();finish();}
  /* play now (kind: 'kiosk', 'app' or 'admin'); returns false when it was not played */
  function play(kind,again){
    if(off||on||(!again&&seen.has(kind)))return false;seen.add(kind);on=true;
    const still=calm();
    box.classList.remove('out','run','calm');if(still)box.classList.add('calm');
    box.classList.add('show');box.setAttribute('aria-hidden','false');
    document.addEventListener('keydown',onKey,true);
    let started=false;
    const go=()=>{if(started||!on)return;started=true;clearTimeout(startT);
      void box.offsetWidth;box.classList.add('run');                          // (re)starts the animations from their first frame
      if(snd&&!still){try{snd.currentTime=0;snd.muted=false;snd.volume=.9;const p=snd.play();if(p&&p.catch)p.catch(()=>{});}catch(e){}}   // no sound allowed yet: silent
      timer=setTimeout(finish,still?CALM:LEN);};
    /* the wordmark has to be there before it is shown; a slow network gets 1.5 s, then it starts anyway */
    if(img.complete&&img.naturalWidth)go();
    else{img.addEventListener('load',go,{once:true});img.addEventListener('error',go,{once:true});startT=setTimeout(go,1500);}
    return true;}
  if(!off){
    box.addEventListener('pointerdown',e=>{e.stopPropagation();e.preventDefault();finish();});   // skip; not a touch on the kiosk
    box.addEventListener('click',e=>e.stopPropagation());
    if(skip)skip.addEventListener('click',e=>{e.stopPropagation();finish();});
    /* the page opens with it, unless it opens on the admin hub's sign-in (the sign-in plays it). A static copy
       (build_static_site.py: no server, no sign-in) or a file on disk opens the hub straight away. */
    let signedIn=false;try{signedIn=!!localStorage.getItem('ireo.adminKey');}catch(e){}
    if(firstView!=='admin'||signedIn||document.documentElement.dataset.host==='static'||location.protocol==='file:')play(firstView);
  }
  return {play,get on(){return on;},
    /* run fn once the intro is over (now if none is playing) */
    then(fn){if(on)after.push(fn);else fn();},
    /* resolves when the intro has finished (at once when there is none) */
    over(){return on?new Promise(r=>waiters.push(r)):Promise.resolve();}};
})();
