/* Tirer vers le bas sur la liste : le trait rouge sous le nom s'étire jusqu'à droite,
   et quand il atteint le bord droit la page se rafraîchit. Le contenu reste affiché. */
(function () {
  'use strict';
  if (window.__tirerRefresh) return; window.__tirerRefresh = true;

  var DIST = 240;          // distance (px) à tirer pour atteindre le bord droit
  var view = null, chats = null;
  var sx = 0, sy = 0, pulling = false, armed = false, done = false;

  function list() { return document.getElementById('viewList'); }
  function visible(v) { return v && !v.hidden && v.offsetParent !== null; }
  function setPull(v, p) { v.style.setProperty('--pull', String(Math.max(0, Math.min(1, p)))); }
  function reset(v) {
    v.classList.remove('pulling');
    v.style.setProperty('--pull', '0');
    pulling = false; armed = false;
  }
  function blocked(t) {
    // pas de tirage depuis les menus, champs de saisie ou fenêtres ouvertes
    return !!(t.closest && (t.closest('dialog[open]') || t.closest('input,textarea,select') || t.closest('.kmenu,.chatmenu,.themes,.sheetbg')));
  }

  document.addEventListener('touchstart', function (e) {
    view = list(); if (!visible(view) || e.touches.length !== 1 || blocked(e.target)) { armed = false; return; }
    chats = document.getElementById('chats');
    var inTop = !!e.target.closest('header, #stBar, .tbar, .annbar');
    var atTop = !chats || chats.scrollTop <= 0;
    armed = inTop || (atTop && !!e.target.closest('#chats'));
    pulling = false; done = false;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!armed || done || !view) return;
    var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (!pulling) {
      if (Math.abs(dx) > Math.abs(dy) || dy < 8) { if (Math.abs(dx) > 10 || dy < -8) armed = false; return; }
      if (chats && chats.scrollTop > 0 && !e.target.closest('header, #stBar, .tbar, .annbar')) { armed = false; return; }
      pulling = true; view.classList.add('pulling');
    }
    if (e.cancelable) e.preventDefault();
    var p = dy / DIST; setPull(view, p);
    if (p >= 1) {
      done = true;
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (x) {}
      setTimeout(function () { location.reload(); }, 120);
    }
  }, { passive: false });

  function end() { if (view && pulling && !done) reset(view); armed = false; }
  document.addEventListener('touchend', end, { passive: true });
  document.addEventListener('touchcancel', end, { passive: true });
})();
