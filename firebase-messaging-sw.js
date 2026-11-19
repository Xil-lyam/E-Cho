/* U&I – service worker des notifications push (FCM)
   À placer à la racine du site, à côté de index.html, en remplaçant l'ancien firebase-messaging-sw.js.
   Il n'a pas besoin de la bibliothèque Firebase : il lit directement le message push. */

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/* réglages de notifications écrits par la page (IndexedDB « uandi-np ») */
function readNp() {
  return new Promise(function (res) {
    try {
      var rq = indexedDB.open('uandi-np', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onerror = function () { res({}); };
      rq.onsuccess = function () {
        try {
          var g = rq.result.transaction('kv').objectStore('kv').get('np');
          g.onsuccess = function () { try { res(JSON.parse(g.result || '{}') || {}); } catch (e) { res({}); } };
          g.onerror = function () { res({}); };
        } catch (e) { res({}); }
      };
    } catch (e) { res({}); }
  });
}

function mins(t) { var m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : 0; }

function isQuiet(p) {
  if ((p.muteUntil || 0) > Date.now()) return true;
  if (!p.quiet) return false;
  var d = new Date(), n = d.getHours() * 60 + d.getMinutes(), a = mins(p.qFrom || '22:00'), b = mins(p.qTo || '07:00');
  if (a === b) return false;
  return a < b ? (n >= a && n < b) : (n >= a || n < b);
}

self.addEventListener('push', function (event) {
  event.waitUntil((async function () {
    var payload = {};
    try { payload = event.data ? event.data.json() : {}; }
    catch (e) { try { payload = { data: { body: event.data.text() } }; } catch (e2) { payload = {}; } }

    var n = payload.notification || {}, d = payload.data || {};
    var title = n.title || d.title || 'X’enify';
    var body = n.body || d.body || '';
    var chat = d.chat || '';

    /* appli ouverte et visible : elle affiche déjà sa propre alerte, on évite le doublon */
    var wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(function (w) { return w.visibilityState === 'visible'; })) return;

    var p = await readNp();
    var kind = chat === 'news' ? 'news' : (d.kind === 'friend' ? 'friends' : 'msg');
    var off = p[kind] === 0 || p[kind] === false;     /* type désactivé par la personne */
    var silent = off || isQuiet(p);                   /* désactivé ou heures calmes : pas de son */
    var tag = 'uandi-' + (chat || 'msg');

    var opt = {
      body: body, tag: tag, renotify: !silent, silent: silent,
      icon: 'icon-192.png', badge: 'badge-96.png', data: { chat: chat }
    };
    if (!silent && p.vib !== 0 && p.vib !== false) opt.vibrate = [120, 60, 120];

    /* Chrome exige qu'une notification soit affichée pour chaque push */
    await self.registration.showNotification(title, opt);

    /* type désactivé : on la retire aussitôt (elle ne sonne ni ne reste affichée) */
    if (off) {
      await new Promise(function (r) { setTimeout(r, 1500); });
      var list = await self.registration.getNotifications({ tag: tag });
      list.forEach(function (x) { x.close(); });
    }
  })());
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var chat = (event.notification.data && event.notification.data.chat) || '';
  event.waitUntil((async function () {
    var wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < wins.length; i++) {
      if ('focus' in wins[i]) {
        await wins[i].focus();
        wins[i].postMessage({ type: 'uandi-open', chat: chat });
        return;
      }
    }
    var base = self.registration.scope;
    await self.clients.openWindow(chat && chat !== 'news' && chat !== 'friends' ? base + '?chat=' + encodeURIComponent(chat) : base);
  })());
});
