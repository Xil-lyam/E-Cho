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
    pill.style.cssText = 'border-radius:' + look.br;   /* couleurs : voir echo-v7.css (suivent le thème) */
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
    var login = document.getElementById('login'), W = Math.max(window.innerWidth, 360) + 80;
    var OUT = 420, IN = 480, r = form.getBoundingClientRect(), h0 = form.offsetHeight;
    if (login) login.style.overflowX = 'hidden';
    document.documentElement.style.overflowX = 'hidden';

    /* 1) l'ancien côté (copie) part entièrement sur le côté */
    var ghost = form.cloneNode(true);
    [].forEach.call(ghost.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
    [].forEach.call(ghost.querySelectorAll('[name]'), function (n) { n.removeAttribute('name'); });
    ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('inert', '');
    ghost.style.cssText = 'position:fixed;margin:0;z-index:5;pointer-events:none;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;overflow:hidden';
    form.parentNode.insertBefore(ghost, form.nextSibling);
    var out = ghost.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-dir * W) + 'px)' }],
      { duration: OUT, easing: 'cubic-bezier(.55,0,.8,.4)', fill: 'forwards' });
    out.onfinish = function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); };

    /* 2) le nouveau côté attend hors écran, puis arrive de l'autre côté */
    setTimeout(function () {
      var h1 = form.offsetHeight;
      form.style.overflow = 'hidden';
      var done = function () {
        form.style.overflow = '';
        if (login) login.style.overflowX = '';
        document.documentElement.style.overflowX = '';
      };
      if (h1 !== h0) form.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: OUT + IN - 120, easing: EASE });
      var inn = form.animate([{ transform: 'translateX(' + (dir * W) + 'px)' }, { transform: 'translateX(0)' }],
        { duration: IN, delay: OUT - 140, easing: EASE, fill: 'backwards' });
      inn.onfinish = inn.oncancel = done;
    }, 0);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#tabLogin, #tabSignup');
    if (!b || !form || b.getAttribute('aria-selected') === 'true') return;
    swap(b.id === 'tabSignup' ? 1 : -1);
  }, true);

  /* clavier ouvert : le champ touché reste visible */
  document.addEventListener('focusin', function (e) {
    var t = e.target, lg = document.getElementById('login');
    if (!lg || !t || !lg.contains(t) || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
    setTimeout(function () { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (x) {} }, 320);
  });

  /* quand un formulaire ou une étape apparaît (mot de passe oublié, code de récupération…),
     on fait défiler pour que tous ses boutons soient visibles */
  function watchReveal() {
    var lg = document.getElementById('login');
    if (!lg) { setTimeout(watchReveal, 600); return; }
    var t = 0;
    new MutationObserver(function (list) {
      var shown = list.some(function (m) { return m.attributeName === 'hidden' && !m.target.hidden && m.target !== lg; });
      if (!shown) return;
      clearTimeout(t);
      t = setTimeout(function () {
        var vis = [].filter.call(lg.querySelectorAll('button'), function (b) { return b.offsetParent !== null; });
        var last = vis[vis.length - 1];
        if (last) { try { last.scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (x) {} }
      }, 450);
    }).observe(lg, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
  }

  init(); watchReveal();
})();
