/* ============================================================
   SERVICE WORKER: the app opens instantly the second time, and still opens on a weak or lost connection
   (mall Wi-Fi, a basement car park). Registered by boot.js; scope = this folder (works under /wayezy/ on GitHub
   Pages too). It caches what the page loads, never the live data:
   - pages: network first (always the newest app), the cached copy when offline
   - versioned files (js/…?v=, styles.css?v=…), three.js from the CDN: cache first (a new ?v= is a new URL)
   - media and fonts: the cached copy at once, refreshed in the background
   - never: /api/ (live data, members, admin), videos and other ranged requests, anything not a GET
   Change CACHE when this file's rules change; old caches are dropped on activation.
   ============================================================ */
const CACHE = 'wayezy-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
const VERSIONED = /\?v=/;
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//;
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
async function put(req, res) {
  if (!res || !(res.ok || res.type === 'opaque')) return;
  const c = await caches.open(CACHE);
  if (VERSIONED.test(req.url)) {                        // keep one version of each file: drop the older ?v=
    const base = req.url.split('?')[0];
    for (const k of await c.keys()) if (k.url.split('?')[0] === base && k.url !== req.url) await c.delete(k);
  }
  await c.put(req, res);
}
/* the first visit loads everything before this worker is in charge: the page then lists what it loaded and the
   worker keeps those files too, so the very next visit already works offline */
self.addEventListener('message', e => {
  const urls = e.data && Array.isArray(e.data.keep) ? e.data.keep : null;
  if (!urls) return;
  e.waitUntil((async () => {
    for (const u of urls) {
      let url; try { url = new URL(u, self.location); } catch (_) { continue; }
      const same = url.origin === self.location.origin;
      if (same ? (url.pathname.includes('/api/') || /\.(mp4|webm)$/i.test(url.pathname)) : !(CDN.test(url.href) || FONTS.test(url.href))) continue;
      const page = same && e.data.page && url.href.split('#')[0] === e.data.page;
      const key = page ? new Request(url.origin + url.pathname) : new Request(url.href);
      if (await caches.match(key)) continue;
      try { await put(key, await fetch(new Request(url.href, same ? {} : { mode: 'no-cors' }))); } catch (_) { }
    }
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const same = url.origin === self.location.origin;
  if (same && (url.pathname.includes('/api/') || /\.(mp4|webm)$/i.test(url.pathname))) return;
  if (!same && !CDN.test(req.url) && !FONTS.test(req.url)) return;
  if (req.mode === 'navigate') {                         // the page: newest when online, cached when not
    const page = url.origin + url.pathname;              // ?view=kiosk, ?view=app… are all the same page
    e.respondWith(fetch(req).then(res => { e.waitUntil(put(new Request(page), res.clone())); return res; })
      .catch(async () => (await caches.match(page)) || Response.error()));
    return;
  }
  if ((same && VERSIONED.test(req.url)) || CDN.test(req.url)) {   // never changes under the same URL
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { e.waitUntil(put(req, res.clone())); return res; })));
    return;
  }
  e.respondWith(caches.match(req).then(hit => {          // media, fonts, the manifest: cached at once, refreshed behind
    const net = fetch(req).then(res => { e.waitUntil(put(req, res.clone())); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
