/* E'cho — script.js : petit chargeur.
   Le code de l'appli est rangé en 2 fichiers (script-a.js puis script-b.js) pour qu'ils soient légers à envoyer.
   Ce chargeur les lit dans l'ordre, les recolle et les exécute comme UN SEUL script : le fonctionnement est
   identique à l'ancien script.js. Il reste synchrone, donc l'ordre avec script-2.js ne change pas. */
(function () {
  var V = '3';                                        /* à augmenter à chaque mise à jour des parties */
  var PARTS = ['js/script-a.js', 'js/script-b.js'];
  var code = '';
  for (var i = 0; i < PARTS.length; i++) {
    var x = new XMLHttpRequest();
    x.open('GET', PARTS[i] + '?v=' + V, false);       /* lecture directe (le navigateur la garde en cache) */
    try { x.send(); } catch (e) { x = null; }
    if (!x || x.status < 200 || x.status >= 300 || !x.responseText) {
      var m = document.getElementById('splashMsg');
      if (m) m.textContent = 'Chargement impossible. Vérifie ta connexion puis recharge la page.';
      return;
    }
    code += x.responseText;
  }
  var s = document.createElement('script');
  s.text = code + '\n//# sourceURL=echo-script.js';
  document.head.appendChild(s);
  document.head.removeChild(s);
})();
