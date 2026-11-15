/* Met les vidéos des lettres en pause automatiquement :
   - quand on quitte l'onglet Lettres (Messages, Musique, Profil, autre écran…),
   - quand la vidéo sort de l'écran en faisant défiler le fil,
   - quand l'appli passe en arrière-plan. */
(function () {
  'use strict';
  var feed = null, io = null;

  function pauseAll() {
    [].forEach.call(document.querySelectorAll('#viewNews video'), function (v) { if (!v.paused) v.pause(); });
  }

  function watch(v) { if (io) io.observe(v); }

  function scan() {
    if (!feed) return;
    [].forEach.call(feed.querySelectorAll('video'), watch);
  }

  function init() {
    feed = document.getElementById('nwFeed');
    if (!feed) { setTimeout(init, 800); return; }
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          /* écran caché (display:none) ou vidéo presque sortie de l'écran => pause */
          if (e.intersectionRatio < 0.35 && !e.target.paused) e.target.pause();
        });
      }, { threshold: [0, 0.35, 1] });
    }
    scan();
    new MutationObserver(scan).observe(feed, { childList: true, subtree: true });
  }

  /* filet de sécurité : tout appui sur un autre onglet coupe aussitôt les vidéos */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#tabbar .tab');
    if (t && t.getAttribute('data-t') !== 'news') pauseAll();
  }, true);
  document.addEventListener('visibilitychange', function () { if (document.hidden) pauseAll(); });
  window.addEventListener('pagehide', pauseAll);

  /* écran Lettres masqué par un autre moyen (retour, balayage, menu…) */
  function watchView() {
    var vn = document.getElementById('viewNews');
    if (!vn) { setTimeout(watchView, 800); return; }
    new MutationObserver(function () { if (vn.hidden) pauseAll(); }).observe(vn, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }

  init(); watchView();
})();
