/* X'enify : notifications push (client) — version Supabase.
   - Abonne cet appareil : l'abonnement est rangé dans la table push_subs.
   - Quand JE envoie un message, l'appli prévient la fonction Supabase « push » (supabase/functions/push) qui notifie les autres membres.
   À configurer : VAPID_PUBLIC ci-dessous + déployer la fonction (voir sql/LISEZMOI-FONCTIONS.md). */
(function () {
  var VAPID_PUBLIC = 'BBv4r2KLPOrJc_yBwXTuE738T9YHDVDSZQzrE1uoDfYigyHExsuJDTobUskU3HN_y-In5hd1gi4KUHul486vwTw';
  function fnUrl() { return String(window.__sb.supabaseUrl).replace(/\/$/, '') + '/functions/v1/push'; }

  if (VAPID_PUBLIC.indexOf('COLLE') === 0) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

  var regP = null, lastPing = {};

  function u8(b64) {
    var p = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, function (c) { return c.charCodeAt(0); });
  }
  function sha(t) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function reg() {
    if (!regP) regP = navigator.serviceWorker.register('sw.js').then(function () { return navigator.serviceWorker.ready; });
    return regP;
  }
  function me() { return window.__xenUser || null; }

  /* abonnement existant seulement s'il utilise la clé actuelle (sinon on le remplace : la clé a changé) */
  function getSub(r) {
    var key = u8(VAPID_PUBLIC);
    return r.pushManager.getSubscription().then(function (s) {
      var same = false;
      try {
        var k = s && s.options && s.options.applicationServerKey;
        if (k) { var a = new Uint8Array(k); same = a.length === key.length && a.every(function (v, i) { return v === key[i]; }); }
        else same = !!s;
      } catch (e) { same = !!s; }
      if (s && !same) return s.unsubscribe().then(function () { return null; });
      return s;
    }).then(function (s) { return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); });
  }

  function subscribe(user) {
    if (!window.__sb || Notification.permission !== 'granted') return Promise.resolve();
    return reg().then(function (r) {
      return getSub(r);
    }).then(function (sub) {
      return sha(sub.endpoint).then(function (h) {
        return window.__sb.from('push_subs').upsert({ uid: user.uid, token: h, data: { sub: sub.toJSON() }, updated_at: new Date().toISOString() });
      });
    }).catch(function () {});
  }

  /* demande l'autorisation au premier appui, puis abonne cet appareil */
  document.addEventListener('click', function ask() {
    var u = me(); if (!u || Notification.permission !== 'default') return;
    document.removeEventListener('click', ask);
    Notification.requestPermission().then(function () { subscribe(u); });
  });

  /* utilisé par l'écran « Notifications » : active et enregistre cet appareil, renvoie '' si OK ou la cause de l'échec */
  window.__xenPushSetup = function () {
    var u = me(); if (!u) return Promise.resolve('pas connecté');
    var go = function () {
      if (Notification.permission !== 'granted') return Promise.resolve('permission notifications = ' + Notification.permission);
      return reg().then(function (r) {
        return getSub(r);
      }).then(function (sub) {
        return sha(sub.endpoint).then(function (h) {
          return window.__sb.from('push_subs').upsert({ uid: u.uid, token: h, data: { sub: sub.toJSON() }, updated_at: new Date().toISOString() });
        });
      }).then(function (r) { return r && r.error ? 'enregistrement refusé (' + (r.error.message || r.error.code) + ')' : ''; })
        .catch(function (e) { return (e && (e.message || e.name)) || 'erreur'; });
    };
    return Notification.permission === 'default' ? Notification.requestPermission().then(go, go) : go();
  };
  /* notification locale de test (vérifie que le téléphone sait afficher les notifications de l'appli) */
  window.__xenPushTest = function () {
    return reg().then(function (r) { return r.showNotification("X'enify", { body: 'Test réussi \u2705', icon: 'icon-192.png', badge: 'badge-96.png', tag: 'xen-test' }); });
  };

  /* appelé par l'appli juste après l'envoi d'un message (cid = identifiant de la discussion) */
  window.__xenPing = function (cid) {
    if (!cid || !window.__sb) return;
    var now = Date.now(); if (lastPing[cid] && now - lastPing[cid] < 800) return; lastPing[cid] = now;
    window.__sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session; if (!s) return;
      return fetch(fnUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.access_token }, body: JSON.stringify({ token: s.access_token, chatId: cid }) });
    }).catch(function () {});
  };

  /* abonne l'appareil dès qu'on est connecté (le client Supabase est créé par l'appli) */
  (function wait(n) {
    if (window.__sb && window.__sb.auth) {
      var done = null;
      window.__sb.auth.onAuthStateChange(function (ev, session) {
        var u = session && session.user; if (!u || done === u.id) return;
        done = u.id; subscribe({ uid: u.id });
      });
      return;
    }
    if (n < 200) setTimeout(function () { wait(n + 1); }, 300);
  })(0);
})();
