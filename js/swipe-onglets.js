/* E'cho — js/swipe-onglets.js
   Glisser vers la gauche / la droite pour passer d'un onglet à l'autre : Musique ⇄ Messages ⇄ Accueil.
   Fichier indépendant : ne modifie aucun autre script. Pour le retirer, supprime sa ligne dans index.html. */
(function () {
  'use strict';
  var ORDER = ['music', 'chats', 'news'];          /* ordre des onglets, de gauche à droite */
  var MIN_X = 70, MAX_Y = 45, MAX_MS = 650, EDGE = 24;
  var nav = document.getElementById('tabbar'), app = document.getElementById('app');
  if (!nav || !app) return;
  var sx = 0, sy = 0, st = 0, ok = false, t0 = null;

  function current() {
    var c = nav.querySelector('.tab[aria-current="page"]');
    return c ? c.getAttribute('data-t') : null;
  }
  function tabBtn(t) {
    var b = nav.querySelector('.tab[data-t="' + t + '"]');
    return b && !b.hidden && b.offsetParent !== null ? b : null;
  }
  /* on ne déclenche pas le balayage sur ce qui défile ou se glisse déjà */
  function blocked(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.matches && el.matches('input, textarea, select, canvas, audio, video, [contenteditable="true"], [data-noswipe], dialog, .mksheet')) return true;
      var cs = getComputedStyle(el);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 4) return true;
    }
    return false;
  }

  document.addEventListener('touchstart', function (e) {
    ok = false;
    if (e.touches.length !== 1 || nav.hidden || app.hidden) return;
    if (document.querySelector('dialog[open]')) return;
    var t = e.touches[0];
    if (t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;      /* bords : geste « retour » du téléphone */
    if (blocked(e.target)) return;
    if (!current() || ORDER.indexOf(current()) < 0) return;
    sx = t.clientX; sy = t.clientY; st = Date.now(); ok = true;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!ok) return; ok = false;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Date.now() - st > MAX_MS || Math.abs(dx) < MIN_X || Math.abs(dy) > MAX_Y || Math.abs(dx) < Math.abs(dy) * 2) return;
    var sel = window.getSelection && String(window.getSelection());
    if (sel) return;
    var i = ORDER.indexOf(current());
    /* glisser vers la gauche → onglet de droite ; vers la droite → onglet de gauche */
    for (var j = i + (dx < 0 ? 1 : -1); j >= 0 && j < ORDER.length; j += (dx < 0 ? 1 : -1)) {
      var b = tabBtn(ORDER[j]);
      if (b) {
        document.body.setAttribute('data-swipe', dx < 0 ? 'l' : 'r');
        clearTimeout(t0); t0 = setTimeout(function () { document.body.removeAttribute('data-swipe'); }, 500);
        if (navigator.vibrate) { try { navigator.vibrate(8); } catch (x) {} }
        b.click();
        return;
      }
    }
  }, { passive: true });
})();
