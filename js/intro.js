/* ============================================================
   INTRO: the Wayezy logo sting (3.4 s, like a streaming service's opening) when the kiosk or the phone app
   opens, and when the admin hub is entered. Loaded at the top of <body>, right after #intro, so it covers the
   page from the first paint while the rest loads underneath.
   - the film fits the screen: media/intro-landscape.mp4 (16:9) or media/intro-portrait.mp4 (9:16)
   - once per view per page: switching to a view seen already does not replay it; a sign-in always does
   - sound when the browser allows it (a kiosk started with --autoplay-policy=no-user-gesture-required, or after
     the sign-in click), otherwise muted
   - a touch, a click or a key skips it; it gives up quietly if the film cannot start within 4 s
   ?intro=0 turns it off (the tests and the launch-film recorder use it).
   ============================================================ */
const Intro=(()=>{
  const qs=new URLSearchParams(location.search);
  const box=document.getElementById('intro'),vid=box&&box.querySelector('video'),skip=box&&box.querySelector('button');
  const off=!box||!vid||qs.get('intro')==='0';
  const seen=new Set();let on=false,timer=0,after=[];
  const firstView=['kiosk','app','admin'].includes(qs.get('view'))?qs.get('view'):(matchMedia('(max-width:700px)').matches?'app':'kiosk');
  const portrait=()=>innerHeight>innerWidth*1.05;
  function finish(){if(!on)return;on=false;clearTimeout(timer);
    box.classList.add('out');box.setAttribute('aria-hidden','true');
    document.removeEventListener('keydown',onKey,true);
    setTimeout(()=>{if(on)return;box.classList.remove('show','out','playing');try{vid.pause();vid.removeAttribute('src');vid.load();}catch(e){}},520);
    const fns=after;after=[];fns.forEach(f=>{try{f();}catch(e){console.error(e);}});}
  function onKey(e){e.preventDefault();e.stopPropagation();finish();}
  /* play now (kind: 'kiosk', 'app' or 'admin'); returns false when it was not played */
  function play(kind,again){
    if(off||on||(!again&&seen.has(kind)))return false;seen.add(kind);on=true;
    vid.src='media/intro-'+(portrait()?'portrait':'landscape')+'.mp4';
    box.classList.remove('out','playing');box.classList.add('show');box.setAttribute('aria-hidden','false');
    document.addEventListener('keydown',onKey,true);
    vid.muted=false;vid.volume=.9;
    /* the page may be busy loading under it, so every timer here checks the film itself, not the clock */
    const started=()=>{if(!on)return;box.classList.add('playing');clearTimeout(timer);
      const left=(isFinite(vid.duration)&&vid.duration?vid.duration:3.4)-(vid.currentTime||0);
      timer=setTimeout(()=>{if(on&&!vid.paused&&!vid.ended&&vid.currentTime<(vid.duration||9))started();else finish();},Math.max(0,left)*1000+1500);};
    const muted=()=>{if(!on)return;vid.muted=true;const q=vid.play();if(q&&q.then)q.then(started).catch(finish);else started();};
    /* a machine with no sound device can hold a film with sound at its first frame: then it plays muted */
    const stuck=()=>setTimeout(()=>{if(on&&!vid.muted&&vid.currentTime===0){vid.pause();try{vid.currentTime=0;}catch(e){}muted();}},900);
    const go=()=>{const p=vid.play();
      if(p&&p.then)p.then(()=>{started();stuck();}).catch(muted);else started();};   // no sound allowed yet: play it muted
    timer=setTimeout(()=>{if(vid.currentTime>0&&!vid.paused)started();else finish();},4000);   // could not start (a slow network): show the page
    go();
    return true;}
  if(!off){
    vid.addEventListener('ended',finish);vid.addEventListener('error',finish);
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
    /* resolves once the film is visibly under way (or there is none): heavy start-up work waits for it, so the
       film starts smoothly and the page builds behind it */
    rolling(){return new Promise(res=>{const t0=Date.now();const chk=()=>{if(!on||vid.currentTime>=.3||Date.now()-t0>2500)res();else setTimeout(chk,80);};chk();});}};
})();
