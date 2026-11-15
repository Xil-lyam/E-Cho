/* E'cho — script.js : petit chargeur (non bloquant).
   Le code de l'appli est rangé en 2 fichiers (script-a.js puis script-b.js) pour qu'ils soient légers à envoyer.
   Ils sont téléchargés en parallèle (le téléchargement démarre dès <head>, voir index.html), puis recollés dans
   l'ordre et exécutés comme UN SEUL script. La page n'est plus bloquée pendant le téléchargement.
   Le chargeur de script-2.js attend la fin avec window.__uandiAppLoad() avant de lancer l'appli. */
(function () {
  var V = (window.APP_CONFIG && window.APP_CONFIG.version) || '3';                                        /* à augmenter à chaque mise à jour des parties */
  var PARTS = ['js/script-a.js', 'js/script-b.js'];
  var loading = null;

  function fetchParts() {
    return Promise.all(PARTS.map(function (p) {
      return fetch(p + '?v=' + V).then(function (r) {
        if (!r.ok) throw new Error(p + ' : HTTP ' + r.status);
        return r.text();
      });
    }));
  }
  function run(texts) {
    if (!texts[0] || !texts[1]) throw new Error('fichier vide');
    var s = document.createElement('script');
    s.text = texts.join('') + '\n//# sourceURL=echo-script.js';
    document.head.appendChild(s);
    document.head.removeChild(s);
    if (typeof window.__uandiApp !== 'function') throw new Error('script-a/b : appli introuvable');
  }
  /* Renvoie une promesse : résolue quand window.__uandiApp est prête, rejetée en cas d'échec (un nouvel appel réessaie). */
  function load() {
    if (typeof window.__uandiApp === 'function') return Promise.resolve();
    if (loading) return loading;
    var first = window.__echoParts ? Promise.all(window.__echoParts) : fetchParts();
    loading = first.then(run).catch(function (e) {
      window.__echoParts = null;   /* le prochain essai retélécharge */
      loading = null;
      var m = document.getElementById('splashMsg');
      if (m) m.textContent = 'Chargement impossible. Vérifie ta connexion.';
      throw e;
    });
    return loading;
  }
  window.__uandiAppLoad = load;
  load().catch(function () {});   /* démarre tout de suite ; l'erreur éventuelle est montrée par le chargeur de script-2.js (bouton Réessayer) */
})();
