/* ============================================================
   VOICE AND CUES for turn-by-turn guidance.
   Spoken directions (Web Speech API) for visitors who cannot read the screen easily,
   and, for visitors who cannot hear it, every step also arrives as large text, a flash
   on the step card and, on phones, a short vibration.

   Sentences are queued and each one is allowed to finish: route mode waits for the voice
   before moving the walker on to the next step (Voice.busy), so what is said and what is
   shown stay together. Browser quirks handled here: voices that load late, Chrome dropping
   a sentence spoken straight after cancel(), and "end" events that never arrive.
   Languages: English, or Hindi when the visitor chose हिन्दी and this device has a Hindi voice (Chrome's "Google हिन्दी",
   Edge's Microsoft Swara/Madhur, Windows' Kalpana, iOS's Lekha). Without one the steps are spoken in English (sayLang).
   ============================================================ */
const Voice=(function(){
  const synth=typeof speechSynthesis!=='undefined'?speechSynthesis:null;
  let voice=null,on=false,queue=[],current=null,gen=0,watchdog=null,lastCancel=0,want='en',known=false;const best={en:null,hi:null};
  /* best voice first: Indian English, natural/neural voices, then any clear English voice */
  const RANK=[v=>/en[-_]IN/i.test(v.lang)&&/natural|neural|online/i.test(v.name),v=>/en[-_]IN/i.test(v.lang)&&/google/i.test(v.name),v=>/en[-_]IN/i.test(v.lang),
    v=>/^en/i.test(v.lang)&&/natural|neural|online/i.test(v.name),v=>/en[-_]GB/i.test(v.lang)&&/google|sonia|libby|hazel|susan|female/i.test(v.name),
    v=>/^en/i.test(v.lang)&&/google/i.test(v.name),v=>/^en/i.test(v.lang)&&/zira|aria|jenny|samantha|karen|moira|tessa|female/i.test(v.name),v=>/en[-_]GB/i.test(v.lang),v=>/^en/i.test(v.lang)];
  /* Hindi: natural/neural (Edge, Windows 11) first, then Google's, then any hi-IN voice */
  const RANK_HI=[v=>/^hi/i.test(v.lang)&&/natural|neural|online/i.test(v.name),v=>/^hi/i.test(v.lang)&&/google/i.test(v.name),v=>/^hi/i.test(v.lang)];
  const first=(vs,ranks)=>{for(const r of ranks){const v=vs.find(r);if(v)return v;}return null;};
  function pick(){if(!synth)return;const vs=synth.getVoices();if(!vs.length)return;known=true;best.en=first(vs,RANK);best.hi=first(vs,RANK_HI);voice=best[sayLang()];}
  /* the language the steps are actually spoken in (no voice list yet: trust the browser to find one for lang="hi-IN") */
  function sayLang(){return want==='hi'&&(best.hi||!known)?'hi':'en';}
  if(synth){pick();try{synth.addEventListener('voiceschanged',pick);}catch(e){synth.onvoiceschanged=pick;}}
  function load(view){if(view!=='kiosk')try{const v=localStorage.getItem('ireo.voice.'+view);if(v!==null)return v==='1';}catch(e){}   // a kiosk is shared: each visitor starts from the mall's setting
    const m=(typeof INFO!=='undefined'&&INFO.settings&&INFO.settings.mall)||{};return view==='kiosk'?m.kioskVoice!==false:true;}   // on by default; a mall can switch kiosks off in Settings
  function finish(item){if(current!==item)return;clearTimeout(watchdog);current=null;try{item.done&&item.done(false);}catch(e){}next();}
  function next(){if(current||!queue.length||!synth)return;const item=queue.shift();current=item;const my=gen;
    const go=()=>{if(my!==gen||current!==item)return;
      try{const u=new SpeechSynthesisUtterance(item.text);if(voice){u.voice=voice;u.lang=voice.lang;}else u.lang=sayLang()==='hi'?'hi-IN':'en-IN';u.rate=sayLang()==='hi'?0.95:0.98;u.pitch=1;u.volume=1;
        u.onend=()=>finish(item);u.onerror=()=>finish(item);synth.resume();synth.speak(u);}catch(e){finish(item);return;}
      clearTimeout(watchdog);watchdog=setTimeout(()=>finish(item),2500+item.text.length*120);};   // if "end" never comes (slow voices take ~110 ms a character)
    const wait=90-(Date.now()-lastCancel);wait>0?setTimeout(go,wait):go();}
  return {
    supported:!!synth,
    get on(){return on&&!!synth;},
    get busy(){return !!(on&&synth&&(current||queue.length));},
    get name(){return voice?voice.name:'';},
    get sayLang(){return sayLang();},
    get hasHindi(){return !known||!!best.hi;},
    lang(l){l=l==='hi'?'hi':'en';if(want===l)return;want=l;this.stop();voice=best[sayLang()];},
    init(view){on=load(view);},
    set(v,view){on=!!v;if(view!=='kiosk')try{localStorage.setItem('ireo.voice.'+view,on?'1':'0');}catch(e){}if(!on)this.stop();},
    /* opts: {urgent: drop anything queued or being said first, done(cancelled): called once this sentence is over} */
    speak(text,opts){opts=typeof opts==='object'&&opts?opts:{urgent:!!opts};
      if(!this.on||!text){if(opts.done)setTimeout(()=>opts.done(false),0);return;}
      if(opts.urgent)this.stop();queue.push({text:String(text),done:opts.done});next();},
    stop(){gen++;const q=queue.concat(current?[current]:[]);queue=[];current=null;clearTimeout(watchdog);
      try{if(synth&&(synth.speaking||synth.pending))synth.cancel();lastCancel=Date.now();}catch(e){}
      q.forEach(it=>{try{it.done&&it.done(true);}catch(e){}});},   // done(cancelled)
    buzz(pattern){try{if(navigator.vibrate&&matchMedia('(pointer:coarse)').matches)navigator.vibrate(pattern||[60,40,60]);}catch(e){}}
  };
})();
