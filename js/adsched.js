/* ============================================================
   AD SCHEDULER: kiosk ad slots, airtime and allowances.
   Pure logic (no DOM) shared by the kiosk player, the master admin and the store portal,
   and tested under Node (tests/adsched.test.js).

   Model
   - kiosk:    {id, name, loopSecs}           loopSecs = seconds of ads in one rotation of that screen
   - rule:     per store (adrules/<store>): {enabled, kiosks:['*'|ids], freeAds, maxAds, extraPrice,
               autoApprove, slots:[{id, from:'14:00', to:'17:00', secs, days:[0..6]}]}
               A slot = "this store gets `secs` seconds in every rotation, between `from` and `to`".
   - creative: adcreatives/<id>: {brand, title, kind:'image'|'card', media|photo, slots:[slot ids] (empty = all),
               status:'pending'|'live'|'rejected'|'paused', chargeable, price}
   ============================================================ */
const AdSched = (function () {
  const DAY = 1440;
  const toMin = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? Math.min(DAY, (+m[1]) * 60 + (+m[2])) : null; };
  const toHHMM = m => { m = ((m % DAY) + DAY) % DAY; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
  const label = t => { const m = toMin(t); if (m === null) return ''; const h = Math.floor(m / 60) % 24, mm = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; return ((h % 12) || 12) + (mm ? ':' + String(mm).padStart(2, '0') : '') + ' ' + ap; };
  const minutesOf = d => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const allDays = [0, 1, 2, 3, 4, 5, 6];
  /* is minute-of-day m inside [from,to)? windows may run past midnight (22:00-02:00) */
  function inRange(m, from, to) { const a = toMin(from), b = toMin(to); if (a === null || b === null || a === b) return false; return a < b ? (m >= a && m < b) : (m >= a || m < b); }
  function slotLive(slot, d) {
    const days = slot.days && slot.days.length ? slot.days : allDays; const m = minutesOf(d);
    const a = toMin(slot.from), b = toMin(slot.to);
    // an overnight window that started yesterday belongs to yesterday's day-of-week
    const day = (a !== null && b !== null && a > b && m < b) ? (d.getDay() + 6) % 7 : d.getDay();
    return days.includes(day) && inRange(m, slot.from, slot.to);
  }
  const onKiosk = (rule, kioskId) => { const k = rule.kiosks && rule.kiosks.length ? rule.kiosks : ['*']; return k.includes('*') || k.includes(kioskId); };
  const slotOnKiosk = (rule, slot, kioskId) => (slot.kiosks && slot.kiosks.length ? (slot.kiosks.includes('*') || slot.kiosks.includes(kioskId)) : onKiosk(rule, kioskId));

  /* the slots running on a kiosk at a moment: [{brand, slot}] */
  function activeSlots(rules, kioskId, d) {
    const out = [];
    for (const brand in rules) {
      const r = rules[brand]; if (!r || r.enabled === false) continue;
      (r.slots || []).forEach(s => { if (s.secs > 0 && slotOnKiosk(r, s, kioskId) && slotLive(s, d)) out.push({ brand, slot: s }); });
    }
    return out.sort((x, y) => x.brand.localeCompare(y.brand));
  }
  /* live creatives a store can show in one of its slots */
  function creativesFor(creatives, brand, slotId) {
    return Object.entries(creatives || {}).map(([id, c]) => Object.assign({ id }, c))
      .filter(c => c.brand === brand && c.status === 'live' && (!c.slots || !c.slots.length || c.slots.includes(slotId)))
      .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
  }
  /* One rotation of the screen. Each running slot plays one of its store's ads for the slot's seconds;
     the store's ads take turns from one rotation to the next (loopIndex), so airtime stays what was sold. */
  function playlist(rules, creatives, kioskId, d, loopIndex, loopSecs) {
    const items = [];
    for (const { brand, slot } of activeSlots(rules, kioskId, d)) {
      const cs = creativesFor(creatives, brand, slot.id); if (!cs.length) continue;
      const c = cs[(loopIndex || 0) % cs.length];
      items.push({ brand, slotId: slot.id, creativeId: c.id, secs: slot.secs, creative: c });
    }
    if (loopSecs) { let t = 0; return items.filter(i => (t += i.secs) <= loopSecs); }   // never overrun the screen's capacity
    return items;
  }
  /* when the line-up next changes on this kiosk (a slot starts or ends), so the player can refresh right then */
  function nextChange(rules, kioskId, d) {
    const now = minutesOf(d); let best = null;
    for (const brand in rules) {
      const r = rules[brand]; if (!r || r.enabled === false) continue;
      (r.slots || []).forEach(s => {
        if (!slotOnKiosk(r, s, kioskId)) return;
        [toMin(s.from), toMin(s.to)].forEach(t => { if (t === null) return; let dt = t - now; if (dt <= 0) dt += DAY; if (best === null || dt < best) best = dt; });
      });
    }
    return best === null ? null : new Date(d.getTime() + best * 60000);
  }
  /* seconds per rotation already sold on a kiosk, in blocks of `step` minutes, for a given weekday */
  function usage(rules, kiosk, day, step, exceptBrand) {
    step = step || 30; const blocks = [];
    for (let m = 0; m < DAY; m += step) {
      let used = 0; const who = [];
      for (const brand in rules) {
        if (brand === exceptBrand) continue; const r = rules[brand]; if (!r || r.enabled === false) continue;
        (r.slots || []).forEach(s => {
          const days = s.days && s.days.length ? s.days : allDays;
          if (!days.includes(day) || !slotOnKiosk(r, s, kiosk.id)) return;
          if (inRange(m + step / 2, s.from, s.to)) { used += s.secs || 0; who.push(brand); }
        });
      }
      blocks.push({ from: m, to: m + step, used, cap: kiosk.loopSecs || 60, free: Math.max(0, (kiosk.loopSecs || 60) - used), who });
    }
    return blocks;
  }
  /* free seconds per rotation across a window on every chosen kiosk (the tightest block counts) */
  function freeIn(rules, kiosks, from, to, days, exceptBrand) {
    let min = Infinity; const a = toMin(from), b = toMin(to); if (a === null || b === null || a === b) return 0;
    for (const k of kiosks) for (const day of (days && days.length ? days : allDays)) {
      usage(rules, k, day, 30, exceptBrand).forEach(bl => { const mid = bl.from + 15; if (inRange(mid, from, to)) min = Math.min(min, bl.free); });
    }
    return min === Infinity ? 0 : min;
  }
  /* Estimated footfall through the day (0..1) for an Indian high street: quiet mornings, lunch and a strong evening.
     An assumption for ranking suggestions, shown to the admin as "estimated". */
  const FOOTFALL = { 10: .25, 11: .35, 12: .55, 13: .65, 14: .55, 15: .45, 16: .5, 17: .65, 18: .8, 19: .95, 20: 1, 21: .85, 22: .55 };
  const footfallAt = m => FOOTFALL[Math.floor(m / 60) % 24] || 0.1;
  /* Best windows for a new or extra slot: every window of `hours` between opening and closing that still has
     `secs` free on all chosen kiosks, ranked by estimated footfall; plus the window with the most spare time. */
  function suggest(rules, kiosks, opts) {
    const secs = opts.secs || 6, len = Math.round((opts.hours || 3) * 60), open = toMin(opts.open || '10:00'), close = toMin(opts.close || '23:00');
    const out = [];
    for (let a = open; a + len <= close; a += 30) {
      const from = toHHMM(a), to = toHHMM(a + len); const free = freeIn(rules, kiosks, from, to, opts.days, opts.exceptBrand);
      let ff = 0; for (let m = a; m < a + len; m += 30) ff += footfallAt(m + 15); ff /= Math.max(1, len / 30);
      out.push({ from, to, free, footfall: ff, fits: free >= secs });
    }
    const fits = out.filter(o => o.fits);
    const byFootfall = fits.slice().sort((x, y) => y.footfall - x.footfall || y.free - x.free);
    const byFree = fits.slice().sort((x, y) => y.free - x.free || y.footfall - x.footfall);
    return { best: byFootfall[0] || null, roomiest: byFree[0] || null, options: byFootfall.slice(0, 6), all: out };
  }
  /* would this slot overbook any kiosk? returns the tightest free seconds (negative = overbooked) */
  function checkSlot(rules, kiosks, brand, slot) {
    const free = freeIn(rules, kiosks.filter(k => slotOnKiosk(rules[brand] || { kiosks: ['*'] }, slot, k.id)), slot.from, slot.to, slot.days, null);
    return free;   // the slot itself is already inside `rules` when editing, so this is what remains
  }
  /* how many ads a store has, and which one would be paid */
  function allowance(rule, creatives, brand) {
    const mine = Object.values(creatives || {}).filter(c => c.brand === brand && c.status !== 'rejected');
    const free = rule && rule.freeAds != null ? rule.freeAds : 3, max = rule && rule.maxAds != null ? rule.maxAds : free;
    const count = mine.length;
    return { count, free, max, freeLeft: Math.max(0, free - count), canAdd: count < max, nextIsPaid: count >= free, price: (rule && rule.extraPrice) || 0,
      paid: mine.filter(c => c.chargeable).length };
  }
  /* seconds of airtime per day a store's slots buy on one kiosk */
  function dailyAirtime(rule, kiosk) {
    if (!rule || rule.enabled === false) return 0; let s = 0;
    (rule.slots || []).forEach(sl => { if (!slotOnKiosk(rule, sl, kiosk.id)) return; const a = toMin(sl.from), b = toMin(sl.to); if (a === null || b === null) return;
      const mins = a < b ? b - a : DAY - a + b; s += (mins * 60 / (kiosk.loopSecs || 60)) * sl.secs; });
    return Math.round(s);
  }
  const plays = (rule, kiosk) => { if (!rule || rule.enabled === false) return 0; let n = 0;
    (rule.slots || []).forEach(sl => { if (!slotOnKiosk(rule, sl, kiosk.id)) return; const a = toMin(sl.from), b = toMin(sl.to); if (a === null || b === null) return;
      const mins = a < b ? b - a : DAY - a + b; n += mins * 60 / (kiosk.loopSecs || 60); }); return Math.round(n); };
  return { toMin, toHHMM, label, slotLive, activeSlots, creativesFor, playlist, nextChange, usage, freeIn, suggest, checkSlot, allowance, dailyAirtime, plays, footfallAt, FOOTFALL };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = AdSched;
