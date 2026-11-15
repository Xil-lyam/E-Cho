/* Animation Connexion <-> Inscription :
   - la pastille des onglets glisse d'un côté à l'autre,
   - la carte du formulaire change de hauteur en douceur,
   - l'ancien côté part (glisse et disparaît) pendant que le nouveau arrive. */
(function () {
  'use strict';
  var EASE = 'cubic-bezier(.22,1,.36,1)';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tabs, tl, ts, form, pill, look = null;

  function init() {
    tl = document.getElementById('tabLogin'); ts = document.getElementById('tabSignup');
    form = document.getElementById('authForm');
    if (!tl || !ts || !form) { setTimeout(init, 500); return; }
    tabs = tl.parentNode;

    /* on copie l'apparence de l'onglet actif sur une pastille qui glisse */
    var sel = tl.getAttribute('aria-selected') === 'true' ? tl : ts, cs = getComputedStyle(sel);
    look = { bg: cs.backgroundColor, bi: cs.backgroundImage, bw: cs.borderTopWidth, bs: cs.borderTopStyle, bc: cs.borderTopColor, br: cs.borderTopLeftRadius, sh: cs.boxShadow };
    pill = document.createElement('span'); pill.className = 'tabpill'; pill.setAttribute('aria-hidden', 'true');
    pill.style.cssText = 'background-color:' + look.bg + ';background-image:' + look.bi + ';border:' + look.bw + ' ' + look.bs + ' ' + look.bc + ';border-radius:' + look.br + ';box-shadow:' + look.sh;
    tabs.insertBefore(pill, tabs.firstChild);
    tabs.classList.add('has-pill');

    place(false);
    if ('ResizeObserver' in window) new ResizeObserver(function () { place(false); }).observe(tabs);
    new MutationObserver(function () { place(true); }).observe(tabs, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
    window.addEventListener('resize', function () { place(false); });
  }

  function place(animate) {
    if (!pill) return;
    var b = ts.getAttribute('aria-selected') === 'true' ? ts : tl;
    if (!b.offsetWidth) return;                       /* écran encore caché */
    pill.style.transition = (animate && !reduce) ? '' : 'none';
    pill.style.width = b.offsetWidth + 'px'; pill.style.height = b.offsetHeight + 'px';
    pill.style.transform = 'translate(' + b.offsetLeft + 'px,' + b.offsetTop + 'px)';
  }

  function swap(dir) {
    if (reduce || !form.animate) return;
    var r = form.getBoundingClientRect(), h0 = form.offsetHeight;
    /* copie de l'ancien côté : elle glisse dehors par-dessus */
    var ghost = form.cloneNode(true);
    [].forEach.call(ghost.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
    [].forEach.call(ghost.querySelectorAll('[name]'), function (n) { n.removeAttribute('name'); });
    ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('inert', '');
    ghost.style.cssText = 'position:fixed;margin:0;z-index:5;pointer-events:none;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;overflow:hidden';
    form.parentNode.insertBefore(ghost, form.nextSibling);
    var out = ghost.animate([{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(' + (-dir * 60) + 'px)' }],
      { duration: 260, easing: 'ease-in', fill: 'forwards' });
    out.onfinish = function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };

    /* après le changement fait par l'appli : nouvelle hauteur + arrivée du nouveau côté */
    setTimeout(function () {
      var h1 = form.offsetHeight;
      if (h1 !== h0) {
        form.style.overflow = 'hidden';
        var a = form.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 360, easing: EASE });
        a.onfinish = a.oncancel = function () { form.style.overflow = ''; };
      }
      var kids = [].filter.call(form.children, function (c) { return c.offsetParent !== null; });
      kids.forEach(function (c, i) {
        c.animate([{ opacity: 0, transform: 'translateX(' + (dir * 46) + 'px)' }, { opacity: 1, transform: 'none' }],
          { duration: 380, delay: 90 + i * 30, easing: EASE, fill: 'backwards' });
      });
    }, 0);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tabLogin, #tabSignup');
    if (!b || !form || b.getAttribute('aria-selected') === 'true') return;
    swap(b.id === 'tabSignup' ? 1 : -1);
  }, true);

  init();
})();
