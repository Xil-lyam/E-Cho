/* U&I — js/maj.js
   Mise à jour automatique : quand tu changes le numéro ?v=… dans index.html,
   l’appli ouverte le voit toute seule et se recharge (ou propose de le faire si tu es en train d’écrire). */
(function () {
  var s = document.querySelector('script[src*="config.js"]');
  var m = s && /[?&]v=([\w.-]+)/.exec(s.getAttribute('src') || '');
  var cur = m ? m[1] : null;
  if (!cur || !window.fetch) return; // pas de numéro dans index.html : rien à faire

  var base = location.pathname.replace(/[^/]*$/, '');
  var last = 0, shown = false;

  function remoteVersion() {
    return fetch(base + 'index.html?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (t) { var x = /config\.js\?v=([\w.-]+)/.exec(t); return x ? x[1] : null; });
  }

  function busy() { // la personne écrit ou une fenêtre est ouverte : on ne recharge pas de force
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && String(a.value || '').length) return true;
    if (a && a.isContentEditable && String(a.textContent || '').length) return true;
    return !!document.querySelector('dialog[open]');
  }

  function banner() {
    if (shown) return;
    shown = true;
    var b = document.createElement('div');
    b.setAttribute('role', 'status');
    b.setAttribute('style',
      'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:90;' +
      'display:flex;align-items:center;gap:10px;max-width:92vw;padding:10px 12px 10px 16px;border-radius:999px;' +
      'background:#111a3a;color:#fff;font:600 14px/1.2 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)');
    var t = document.createElement('span');
    t.textContent = '✨ Nouvelle version disponible';
    var go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'Mettre à jour';
    go.setAttribute('style', 'all:unset;cursor:pointer;padding:7px 14px;border-radius:999px;background:#6EA8FF;color:#06101F;font-weight:700;font-size:13px');
    go.addEventListener('click', function () { location.reload(); });
    b.appendChild(t);
    b.appendChild(go);
    document.body.appendChild(b);
  }

  function check() {
    last = Date.now();
    remoteVersion().then(function (v) {
      if (!v || v === cur) return;
      var tried = null;
      try { tried = sessionStorage.getItem('uandi-maj'); } catch (e) {}
      if (!busy() && tried !== v) { // 1 seul rechargement automatique par version (évite toute boucle)
        try { sessionStorage.setItem('uandi-maj', v); } catch (e) {}
        location.reload();
      } else {
        banner();
      }
    }).catch(function () {});
  }

  // à l’ouverture (après le démarrage), puis à chaque retour dans l’appli (au plus toutes les 5 min)
  setTimeout(check, 3000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && Date.now() - last > 300000) check();
  });
})();
