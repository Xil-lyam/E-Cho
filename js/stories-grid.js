/* Page « Stories » : grille de rectangles 4×6.
   Lit la rangée #stBar déjà remplie par stories.js et la remet en grille.
   Toucher une carte = toucher la pastille d'origine (même comportement qu'avant). */
(function () {
  'use strict';
  var panel, grid, empty, open = false;

  function build() {
    panel = document.createElement('section');
    panel.id = 'stGrid'; panel.hidden = true;
    panel.innerHTML = '<h2>Stories</h2><div class="stg-grid"></div><p class="stg-empty" hidden>Aucune story pour le moment</p>';
    document.body.appendChild(panel);
    grid = panel.querySelector('.stg-grid');
    empty = panel.querySelector('.stg-empty');
    var tb = document.getElementById('tabbar');
    if (tb) panel.style.setProperty('--stg-bottom', tb.offsetHeight + 'px');
  }

  function bgOf(el) {
    if (!el) return '';
    var img = el.querySelector && el.querySelector('img');
    if (img && img.src) return 'url("' + img.src + '")';
    var all = [el].concat([].slice.call(el.querySelectorAll('*')));
    for (var i = 0; i < all.length; i++) {
      var b = getComputedStyle(all[i]).backgroundImage;
      if (b && b !== 'none' && b.indexOf('url(') > -1) return b;
    }
    return '';
  }

  function card(src, isMe, hasStory) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'stg-card' + (isMe ? ' stg-me' : '');
    var av = bgOf(src.querySelector('.ring') || src);
    var name = (src.querySelector('.n') || {}).textContent || '';
    if (isMe) {
      b.innerHTML = '<span class="stg-plus">+</span><span class="stg-name"></span>';
      b.querySelector('.stg-name').textContent = hasStory ? 'Votre story' : 'Ajouter une story';
    } else {
      b.innerHTML = '<span class="stg-bg stg-blur"></span><span class="stg-av"></span><span class="stg-name"></span>';
      if (av) { b.querySelector('.stg-bg').style.backgroundImage = av; b.querySelector('.stg-av').style.backgroundImage = av; }
      b.querySelector('.stg-name').textContent = name.trim();
    }
    b.addEventListener('click', function () { close(); src.click(); });
    return b;
  }

  function render() {
    if (!panel) return;
    grid.textContent = '';
    var items = [].slice.call(document.querySelectorAll('#stBar .stb'));
    var mine = items[0] || null, others = items.slice(1);
    if (mine) {
      var ring = mine.querySelector('.ring');
      var has = !!(ring && /\b(has|new|seen|unseen|live)\b/.test(ring.className + ' ' + mine.className));
      grid.appendChild(card(mine, true, has));
    } else {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'stg-card stg-me';
      b.innerHTML = '<span class="stg-plus">+</span><span class="stg-name">Ajouter une story</span>';
      b.addEventListener('click', function () { close(); var m = document.getElementById('myNote'); if (m) m.click(); });
      grid.appendChild(b);
    }
    others.forEach(function (o) { grid.appendChild(card(o, false)); });
    empty.hidden = others.length > 0;
  }

  function show() { if (!panel) build(); open = true; render(); panel.hidden = false; panel.scrollTop = 0; setActive(true); }
  function close() { open = false; if (panel) panel.hidden = true; setActive(false); }
  function setActive(on) {
    var t = document.querySelector('#tabbar .tab[data-t="create"]');
    if (t) { if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); }
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('#tabbar .tab');
    if (!t) return;
    if (t.getAttribute('data-t') === 'create') {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      open ? close() : show();
    } else if (open) { close(); }
  }, true);

  var t0;
  function watch() {
    var bar = document.getElementById('stBar');
    if (!bar) { setTimeout(watch, 1500); return; }
    new MutationObserver(function () { if (open) { clearTimeout(t0); t0 = setTimeout(render, 150); } })
      .observe(bar, { childList: true, subtree: true });
  }
  watch();
})();
