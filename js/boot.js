/* Start-up: runs last, once every module has loaded. */
startMap();
setView(VIEW);
window.APP_READY=true;onInfo();          // live data may have arrived while the page was still loading
/* deep link: ?to=<store key> opens straight to the route (QR codes on posters, shared links) */
(function(){const to=QS.get('to');if(isBrand(to)){selectBrand(to);if(VIEW==='kiosk')poke();}})();
startLive();                             // the phone's live position (livepos.js): the native shell's beacons, or ?sim=1
/* sw.js: instant repeat visits, and the app still opens when the connection drops. Not for a file on disk, the
   one-file build (an .html page), or ?sw=0 */
if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&QS.get('sw')!=='0'&&!/\.html$/.test(location.pathname))
  addEventListener('load',()=>{navigator.serviceWorker.register('sw.js').catch(e=>console.warn('sw:',e&&e.message));
    navigator.serviceWorker.ready.then(r=>{const page=location.href.split('#')[0];   // what this visit loaded, for the worker to keep
      if(r.active)r.active.postMessage({page,keep:[page,...performance.getEntriesByType('resource').map(x=>x.name)]});}).catch(()=>{});});
/* the kiosk opens on its idle screen: the ads and the film, with English / हिन्दी to start in */
if(VIEW==='kiosk'&&QS.get('attract')!=='0'&&!QS.get('lang')&&!isBrand(QS.get('to')))startAttract();
