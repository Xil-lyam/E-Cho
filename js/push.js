/* X'enify : notifications push (client) — version Supabase.
   - Abonne cet appareil : l'abonnement est rangé dans la table push_subs.
   - Quand JE envoie un message, l'appli prévient la fonction Netlify (push.js) qui notifie les autres membres.
   À configurer : VAPID_PUBLIC et FN_URL ci-dessous (voir LISEZMOI-PUSH.md). */
(function () {
  var VAPID_PUBLIC = 'BKN_ouxQ0NgRLHCT3PkK2xAnaWPBArcnxMskx8Zlj2K1UYkn_1NA3p6EeQCIWwaffuHmyECzz1JrPxQV828ddgE';
  /* Si le site est sur Netlify : laisse tel quel.
     Si le site est sur GitHub Pages : mets l'adresse complète, ex. 'https://ma-fonction.netlify.app/.netlify/functions/push' */
  var FN_URL = 'https://dazzling-horse-f6d13a.netlify.app/.netlify/functions/push';

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

  function subscribe(user) {
    if (!window.__sb || Notification.permission !== 'granted') return Promise.resolve();
    return reg().then(function (r) {
      return r.pushManager.getSubscription().then(function (s) {
        return s || r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID_PUBLIC) });
      });
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

  /* appelé par l'appli juste après l'envoi d'un message (cid = identifiant de la discussion) */
  window.__xenPing = function (cid) {
    if (!cid || !window.__sb) return;
    var now = Date.now(); if (lastPing[cid] && now - lastPing[cid] < 800) return; lastPing[cid] = now;
    window.__sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session; if (!s) return;
      return fetch(FN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: s.access_token, chatId: cid }) });
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
