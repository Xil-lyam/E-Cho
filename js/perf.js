/* X'enify — js/perf.js
   Réduit les chargements : les images hors écran ne se téléchargent qu'au moment d'être vues
   (loading="lazy") et se décodent sans bloquer l'affichage (decoding="async").
   Ne touche ni au logo de démarrage ni aux images déjà réglées. */
(function () {
  function tune(img) {
    if (!img || img.nodeType !== 1 || img.tagName !== 'IMG') return;
    if (img.closest && img.closest('#splash')) return;
    if (!img.hasAttribute('decoding')) img.decoding = 'async';
    if (!img.hasAttribute('loading') && !img.complete) img.loading = 'lazy';
  }
  function scan(root) {
    if (!root || root.nodeType !== 1) return;
    if (root.tagName === 'IMG') { tune(root); return; }
    var list = root.querySelectorAll ? root.querySelectorAll('img') : [];
    for (var i = 0; i < list.length; i++) tune(list[i]);
  }
  scan(document.documentElement);
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var add = muts[i].addedNodes;
        for (var j = 0; j < add.length; j++) scan(add[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
})();
