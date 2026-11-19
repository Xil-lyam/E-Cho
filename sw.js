/* X’enify : service worker pour les notifications en arrière-plan */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      /* l'appli est ouverte et visible : elle gère déjà son alerte (son + bulle) */
      if (list.some(function (c) { return c.visibilityState === 'visible' && c.focused; })) return;
      return self.registration.showNotification(d.title || 'X’enify', {
        body: d.body || '',
        tag: d.tag || 'uandi-msg',
        renotify: true,
        vibrate: [120, 60, 120],
        data: { url: d.url || './' }
      });
    })
  );
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
