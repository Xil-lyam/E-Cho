/* E'cho — js/echo-dock.js
   Le dernier bouton de la barre du bas (avant « Créer ») devient « Stories » :
   au lieu d'ouvrir le menu Créer, il ramène sur la rangée des stories, en haut de Messages. */
(function () {
  var bar = document.getElementById('tabbar');
  if (!bar) return;
  bar.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.tab[data-t="create"]');
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var list = document.getElementById('viewList');
    var chats = bar.querySelector('.tab[data-t="chats"]');
    if (chats && (!list || list.hidden)) chats.click();
    setTimeout(function () {
      var st = document.getElementById('stBar');
      if (!st) return;
      try { st.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (x) { st.scrollIntoView(); }
      st.classList.remove('echo-pulse'); void st.offsetWidth; st.classList.add('echo-pulse');
      setTimeout(function () { st.classList.remove('echo-pulse'); }, 900);
    }, 80);
  }, true);
})();
