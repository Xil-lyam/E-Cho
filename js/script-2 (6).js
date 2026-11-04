/* E'cho — script-2.js : modules (interface, jeux), chargeur, étudier, assistant. À charger APRÈS script.js */
/* ===== Modules (interface, jeux) ===== */
window.__uandiMods = {};

window.__uandiMods['js/ui/onglets.js'] = function () {

/* E'cho — js/ui/onglets.js
   Barre d’onglets et navigation entre les écrans */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), nav = $('tabbar');
  var views = { chats: 'viewList', news: 'viewNews', music: 'viewMusic', game: 'viewGame' };
  var openers = { news: 'openNews', music: 'openMusic', game: 'openGame' };
  var backs = { news: 'nwBack', music: 'musicBack', game: 'gameBack' };
  function cur() {
    if (app.hidden) return null;
    for (var k in views) { var v = $(views[k]); if (v && !v.hidden) return k; }
    /* Ordinateur (2 colonnes) : une discussion ouverte garde le menu visible */
    var vc = $('viewChat');
    if (vc && !vc.hidden && window.matchMedia && window.matchMedia('(min-width: 900px)').matches) return 'chats';
    return null;
  }
  function sync() {
    var c = cur();
    nav.hidden = !c;
    var nt = nav.querySelector('.tab[data-t="news"]');
    if (nt) nt.hidden = !!(window.newsBlocked && window.newsBlocked());
    document.body.classList.toggle('hasnav', !!c);
    var shOn = !!(window.EchoShorts && window.EchoShorts.isOpen()), shReady = !!(window.EchoShorts && window.EchoShorts.ready());
    var ct = shOn ? 'news' : (c === 'news' && shReady ? 'chats' : c);
    nav.querySelectorAll('.tab').forEach(function (b) {
      if (b.dataset.t === ct) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var n = document.querySelectorAll('#chats .chatrow.unread').length, bd = nav.querySelector('.tabbadge');
    bd.hidden = !n; bd.textContent = n > 9 ? '9+' : String(n);
    if (c) nav.classList.remove('shrunk');
    if (c === 'news' && typeof newest !== 'undefined' && newest) seenSet(newest);
    if (window.__echoPaintMusic) window.__echoPaintMusic();
    if (typeof paintBell === 'function') paintBell();
    if (window.__echoFitNav) window.__echoFitNav();
  }
  /* ---- menu « Créer » ---- */
  var sheet = $('mkSheet'), createBtn = nav.querySelector('.tab[data-t="create"]');
  function sheetClose() { if (!sheet) return; sheet.hidden = true; if (createBtn) createBtn.setAttribute('aria-expanded', 'false'); }
  function sheetToggle() {
    if (!sheet) return;
    var open = sheet.hidden;
    var lt = sheet.querySelector('[data-mk="letter"]'); if (lt) lt.hidden = !!(window.newsBlocked && window.newsBlocked());
    sheet.hidden = !open; createBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  /* attend que l'écran « Messages » soit affiché (le retour passe par l'historique du navigateur) */
  function whenChats(fn) {
    if (cur() === 'chats') { fn(); return; }
    go('chats');
    var n = 0, iv = setInterval(function () {
      if (cur() === 'chats') { clearInterval(iv); fn(); } else if (++n > 30) clearInterval(iv);
    }, 50);
  }
  function openMe() {
    try {
      var u = window.firebase && firebase.auth && firebase.auth().currentUser;
      if (u && window.UIProfile && UIProfile.open) { UIProfile.open(u.uid, String(u.email || '').split('@')[0]); return; }
    } catch (e) {}
    $('openSet').click();
  }
  function mkAction(k) {
    sheetClose();
    if ((k === 'letter' || k === 'chat') && window.EchoShorts) window.EchoShorts.close();
    if (k === 'note') { $('myNote').click(); return; }
    if (k === 'group') { $('newGroup').click(); return; }
    if (k === 'settings') { $('openSet').click(); return; }
    if (k === 'chat') {
      whenChats(function () { var f = $('newChat'); if (f.hidden) $('searchBtn').click(); else $('who').focus(); });
      return;
    }
    if (k === 'letter') {
      if (window.newsBlocked && window.newsBlocked()) return;
      if (cur() !== 'news') $('openNews').click();
      var ft = document.querySelector('.nwtab[data-p="feed"]');
      if (ft && ft.getAttribute('aria-pressed') !== 'true') ft.click();
      setTimeout(function () { var t = $('nwText'); if (t) { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); t.focus(); } }, 150);
    }
  }
  function go(t) {
    if (t === 'news' && window.EchoShorts && window.EchoShorts.ready()) { sheetClose(); window.EchoShorts.open(); return; }
    if (t === 'create') { sheetToggle(); return; }
    sheetClose();
    if (t === 'set') { $('openSet').click(); return; }
    if (t === 'me') { openMe(); return; }
    if (t === 'search') {
      whenChats(function () { var s = $('search'); if (s.hidden) $('openDSearch').click(); else s.focus(); });
      return;
    }
    var c = cur();
    if (!c || c === t) return;
    if (t === 'chats') { if (c !== 'chats') { var bb = $(backs[c]); bb.dataset.force = '1'; bb.click(); } return; }
    if (openers[t]) $(openers[t]).click();
  }
  nav.addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (b && b.dataset.t !== 'news' && b.dataset.t !== 'create' && window.EchoShorts) window.EchoShorts.close();
    if (b) go(b.dataset.t);
  });
  if (sheet) {
    sheet.addEventListener('click', function (e) { var b = e.target.closest('[data-mk]'); if (b) mkAction(b.dataset.mk); });
    document.addEventListener('click', function (e) { if (!sheet.hidden && !e.target.closest('#mkSheet') && !e.target.closest('.tab[data-t="create"]')) sheetClose(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sheetClose(); });
  }
  /* icônes du haut (Notifications, Amis, Paramètres) et raccourcis de l'accueil */
  document.addEventListener('click', function (e) {
    var h = e.target.closest('[data-hd]');
    if (h) {
      var k = h.dataset.hd;
      if (k === 'bell') { ntToggle(); return; }
      ntClose();
      if (k === 'search') { if (window.EchoShorts) window.EchoShorts.close(); go('search'); return; }
      $(k === 'friends' ? 'openFriends' : 'openSet').click();
      return;
    }
    if (e.target.closest('#homeMusic')) $('openMusic').click();
    else if (e.target.closest('#homeGame')) $('openGame').click();
  });
  /* ---- centre de notifications : regroupe ce que l'appli sait déjà (demandes, non lus, discussions anonymes, nouvelles lettres) ---- */
  var nt = $('ntSheet'), newest = 0;
  function seenKey() { try { var u = firebase.auth().currentUser; return 'echo-home-seen-' + (u ? u.uid : ''); } catch (e) { return 'echo-home-seen-'; } }
  function seenGet() { try { return +localStorage.getItem(seenKey()) || 0; } catch (e) { return 0; } }
  function seenSet(v) { try { localStorage.setItem(seenKey(), String(v)); } catch (e) {} }
  function counts() {
    var fr = $('frN'), atd = $('atDot');
    return {
      req: fr && !fr.hidden ? (parseInt(fr.textContent, 10) || 1) : 0,
      unread: document.querySelectorAll('#chats .chatrow.unread').length,
      anon: atd && !atd.hidden ? 1 : 0,
      letters: (newest > seenGet() && !(window.newsBlocked && window.newsBlocked())) ? 1 : 0
    };
  }
  function paintBell() {
    var c = counts(), n = c.req + c.unread + c.anon + c.letters;
    document.querySelectorAll('[data-hdbadge]').forEach(function (b) { b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); });
    var dot = nav.querySelector('.tab[data-t="news"] .tabdot'); if (dot) dot.hidden = !c.letters || cur() === 'news';
  }
  function ntClose() { if (nt) nt.hidden = true; }
  function ntToggle() {
    if (!nt) return;
    if (!nt.hidden) { nt.hidden = true; return; }
    sheetClose();
    var c = counts(), rows = [];
    if (c.req) rows.push(['req', 'Demandes d’amis', c.req + ' en attente']);
    if (c.unread) rows.push(['unread', 'Messages non lus', c.unread + (c.unread > 1 ? ' discussions' : ' discussion')]);
    if (c.anon) rows.push(['anon', 'Discussions anonymes', 'Un nouveau message']);
    if (c.letters) rows.push(['letters', 'Nouvelles lettres', 'Sur l’accueil']);
    nt.replaceChildren();
    if (!rows.length) {
      var p = document.createElement('p'); p.className = 'ntempty'; p.textContent = 'Rien de nouveau pour le moment.'; nt.appendChild(p);
    }
    rows.forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mkitem'; b.setAttribute('role', 'menuitem'); b.dataset.nt = r[0];
      var w = document.createElement('span'), t1 = document.createElement('b'), t2 = document.createElement('small');
      t1.textContent = r[1]; t2.textContent = r[2]; w.appendChild(t1); w.appendChild(t2); b.appendChild(w); nt.appendChild(b);
    });
    nt.hidden = false;
  }
  if (nt) {
    nt.addEventListener('click', function (e) {
      var b = e.target.closest('[data-nt]'); if (!b) return;
      var k = b.dataset.nt; ntClose();
      if (k === 'req') $('openReqs').click();
      else if (k === 'unread') { go('chats'); }
      else {
        if (cur() !== 'news') $('openNews').click();
        if (k === 'anon') setTimeout(function () { var tb = document.querySelector('.nwtab[data-p="threads"]'); if (tb) tb.click(); }, 120);
      }
    });
    document.addEventListener('click', function (e) { if (!nt.hidden && !e.target.closest('#ntSheet') && !e.target.closest('[data-hd="bell"]')) ntClose(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ntClose(); });
  }
  document.addEventListener('newsnew', function (e) { newest = (e.detail && e.detail.ts) || 0; if (cur() === 'news') seenSet(newest); paintBell(); });
  [['frN', { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true }],
   ['atDot', { attributes: true, attributeFilter: ['hidden'] }]].forEach(function (x) {
    var n = $(x[0]); if (n) new MutationObserver(paintBell).observe(n, x[1]);
  });
  /* bouton « Musique » dans la pilule : seulement quand une musique joue, avec un mini-lecteur (titre, lecture/pause, progression) */
  (function () {
    var om = $('openMusic'), mt = nav.querySelector('.tab[data-t="music"]'); if (!om || !mt) return;
    var tt = document.createElement('span'); tt.className = 'mini-t';
    var pp = document.createElement('em'); pp.className = 'mini-pp'; pp.setAttribute('role', 'button'); pp.tabIndex = 0; pp.setAttribute('aria-label', 'Lecture / pause');
    pp.innerHTML = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg><svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';
    var bar = document.createElement('em'); bar.className = 'mini-bar'; bar.innerHTML = '<i></i>';
    var lab = mt.querySelector('span'); if (lab) { lab.textContent = ''; lab.appendChild(tt); }
    mt.appendChild(pp); mt.appendChild(bar);
    /* si la pilule dépasse de l'écran : d'abord on retire lecture/pause, puis tous les noms (icônes seules) */
    var ft = 0;
    function fit() {
      var on = om.classList.contains('playing');
      nav.classList.toggle('hasmusic', on);
      nav.classList.remove('nopp', 'tight');
      if (!on && !nav.querySelector('.tab[aria-current]')) return;
      if (nav.scrollWidth > nav.clientWidth + 1) nav.classList.add('nopp');
      if (nav.scrollWidth > nav.clientWidth + 1) nav.classList.add('tight');
      clearTimeout(ft); ft = setTimeout(function () {
        nav.classList.remove('nopp', 'tight');
        if (nav.scrollWidth > nav.clientWidth + 1) nav.classList.add('nopp');
        if (nav.scrollWidth > nav.clientWidth + 1) nav.classList.add('tight');
      }, 420);
    }
    window.addEventListener('resize', fit);
    window.__echoFitNav = fit;
    function togglePlay(e) { e.stopPropagation(); e.preventDefault(); var b = $('mPlay'); if (b) b.click(); }
    pp.addEventListener('click', togglePlay);
    pp.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') togglePlay(e); });
    function paintMusic() {
      var playing = om.classList.contains('playing');
      mt.hidden = false;
      mt.classList.toggle('is-playing', playing);
      var t = $('mTitle'); tt.textContent = t && playing && !/^Aucune/.test(t.textContent) ? t.textContent : 'Musique';
      var sk = $('mSeek'), fi = bar.firstChild; if (sk && fi) fi.style.width = ((+sk.value || 0) / 10) + '%';
      fit();
    }
    new MutationObserver(paintMusic).observe(om, { attributes: true, attributeFilter: ['class'] });
    var mti = $('mTitle'); if (mti) new MutationObserver(paintMusic).observe(mti, { childList: true, characterData: true, subtree: true });
    setInterval(function () { paintMusic(); }, 700);
    window.__echoPaintMusic = paintMusic; paintMusic();
  })();
  /* la pilule se réduit quand on fait défiler vers le bas, et revient en remontant */
  (function () {
    var last = new WeakMap(), t = 0, hideLock = 0;
    var vn = $('viewNews');
    if (vn) new MutationObserver(function () { if (vn.hidden) vn.classList.remove('nw-hide'); }).observe(vn, { attributes: true, attributeFilter: ['hidden'] });
    document.addEventListener('scroll', function (e) {
      var el = e.target; if (!el || el === document) el = document.scrollingElement || document.documentElement;
      var y = el.scrollTop || 0, p = last.get(el) || 0, d = y - p;
      if (Math.abs(d) < 6) return;
      last.set(el, y);
      nav.classList.toggle('shrunk', d > 0 && y > 60);
      /* accueil : Musique/Jeux + onglets disparaissent en descendant, reviennent en remontant */
      var nws = $('viewNews');
      if (nws && el.classList && el.classList.contains('nwpane') && Date.now() > hideLock) {
        var has = nws.classList.contains('nw-hide');
        if (!has && d > 0 && y > 80) { nws.classList.add('nw-hide'); hideLock = Date.now() + 400; }
        else if (has && (d < 0 || y < 24)) { nws.classList.remove('nw-hide'); hideLock = Date.now() + 400; }
      }
    }, { capture: true, passive: true });
  })();
  document.addEventListener('newsaccess', function () {
    if (window.newsBlocked && window.newsBlocked() && cur() === 'news') { var nb = $('nwBack'); nb.dataset.force = '1'; nb.click(); }
    sync();
  });
  document.addEventListener('shortschange', sync);
  var mo = new MutationObserver(sync);
  ['app', 'viewList', 'viewChat', 'viewMusic', 'viewNews', 'viewGame', 'login'].forEach(function (id) {
    var n = $(id); if (n) mo.observe(n, { attributes: true, attributeFilter: ['hidden'] });
  });
  mo.observe($('chats'), { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  var lo = $('setLogout');
  if (lo) lo.addEventListener('click', function () { $('settings').close(); $('logout').click(); });
  sync();
})();


};

window.__uandiMods['js/ui/menu-discussion.js'] = function () {

/* E'cho — js/ui/menu-discussion.js
   Menu « ⋯ » de la discussion */
(function () {
  var menu = document.getElementById('chatMenu'), themes = document.getElementById('themes'), more = document.getElementById('moreBtn');
  if (!menu) return;
  function closeMenu() { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('.ghost');
    if (!b || b.id === 'delChat') return;
    setTimeout(closeMenu, 0);
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('#chatMenu, #moreBtn, #themes, #themeBtn')) return;
    if (!menu.hidden) closeMenu();
    if (themes && !themes.hidden) themes.hidden = true;
  });
})();


};

window.__uandiMods['js/games/sons.js'] = function () {

/* E'cho — js/games/sons.js
   Sons des jeux (WebAudio) */
(function () {
  /* ---------- sons des jeux (WebAudio, aucun fichier) ---------- */
  var KEY = 'uandi-sfx', ctx = null, on = true;
  try { on = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function ac() {
    try {
      if (!ctx) { var A = window.AudioContext || window.webkitAudioContext; if (!A) return null; ctx = new A(); }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(f, d, type, v, delay, to) {
    if (!on) return;
    var c = ac(); if (!c) return;
    try {
      var t = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v || 0.1, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d + 0.03);
    } catch (e) {}
  }
  function vib(p) { if (!on) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  var NT = { c: 523.25, e: 659.25, g: 783.99, a: 880, c2: 1046.5, e2: 1318.5 };
  var SFX = {
    tap: function () { tone(660, 0.07, 'triangle', 0.09, 0, 880); },
    back: function () { tone(440, 0.07, 'triangle', 0.08, 0, 330); },
    swap: function () { tone(300, 0.12, 'sine', 0.09, 0, 600); },
    error: function () { tone(190, 0.2, 'sawtooth', 0.06, 0, 110); vib(60); },
    hint: function () { tone(NT.e2, 0.12, 'sine', 0.07); tone(NT.a * 2, 0.18, 'sine', 0.06, 0.09); },
    pop: function (combo) {
      var k = Math.min(combo || 1, 6), f = 520 * Math.pow(1.26, k - 1);
      tone(f, 0.14, 'sine', 0.1, 0, f * 1.5); tone(f * 2, 0.1, 'triangle', 0.04, 0.03);
    },
    win: function () {
      [NT.c, NT.e, NT.g, NT.c2].forEach(function (f, i) { tone(f, 0.22, 'triangle', 0.1, i * 0.09); });
      tone(NT.e2, 0.4, 'sine', 0.07, 0.36); vib([30, 40, 60]);
    },
    lose: function () { [NT.g, NT.e, NT.c].forEach(function (f, i) { tone(f * 0.6, 0.25, 'sine', 0.09, i * 0.14); }); },
    isOn: function () { return on; },
    set: function (v) {
      on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
      paint(); if (on) SFX.tap();
    }
  };
  function paint() {
    document.querySelectorAll('[data-sfx]').forEach(function (b) {
      var short = b.getAttribute('data-sfx') === 'short', ic = on ? '\uD83D\uDD0A' : '\uD83D\uDD07';
      b.textContent = short ? ic : ic + (on ? ' Sons activés' : ' Sons coupés');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-sfx]')) SFX.set(!on); });
  paint();

  /* ---------- effets visuels : particules, texte flottant, confettis ---------- */
  function host() { return document.querySelector('dialog[open]') || document.body; }
  function mk(x, y, cls, text) {
    var h = host(), d = document.createElement('div'), abs = h !== document.body;
    d.className = 'fxp' + (abs ? ' abs' : '') + (cls ? ' ' + cls : '');
    if (text) d.textContent = text;
    var px = x, py = y;
    if (abs) { var r = h.getBoundingClientRect(); px = x - r.left; py = y - r.top; }
    d.style.left = px + 'px'; d.style.top = py + 'px';
    h.appendChild(d);
    return d;
  }
  function go(d, frames, ms) {
    var a = d.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
    a.onfinish = a.oncancel = function () { if (d.parentNode) d.parentNode.removeChild(d); };
  }
  var COLORS = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ff9f43'];
  function burst(x, y, n, big) {
    if (reduce) return;
    for (var i = 0; i < n; i++) {
      var d = mk(x, y, '', ''), s = big ? 7 + Math.random() * 6 : 5 + Math.random() * 4;
      d.style.width = s + 'px'; d.style.height = (big ? s * 1.6 : s) + 'px';
      d.style.background = COLORS[(Math.random() * COLORS.length) | 0];
      d.style.borderRadius = big ? '2px' : '50%'; d.style.marginLeft = d.style.marginTop = (-s / 2) + 'px';
      var ang = Math.random() * Math.PI * 2, dist = (big ? 70 : 28) + Math.random() * (big ? 120 : 32);
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist + (big ? 60 : 0);
      go(d, [{ transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
             { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + ((Math.random() * 540) | 0) + 'deg) scale(.4)', opacity: 0 }],
         (big ? 900 : 520) + Math.random() * 300);
    }
  }
  window.SFX = SFX;
  window.FX = {
    burst: function (x, y, n) { burst(x, y, n || 8, false); },
    confetti: function (x, y) { burst(x, y, 34, true); },
    float: function (text, x, y) {
      if (reduce) return;
      var d = mk(x, y, 'fxt', text); d.style.transform = 'translate(-50%,-50%)';
      go(d, [{ transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 },
             { transform: 'translate(-50%,-90%) scale(1.15)', opacity: 1, offset: .25 },
             { transform: 'translate(-50%,-220%) scale(1)', opacity: 0 }], 950);
    },
    shake: function (el) {
      if (reduce || !el || !el.animate) return;
      el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' },
                  { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: 300 });
    }
  };
})();


};

window.__uandiMods['js/games/beat-rush.js'] = function () {

/* E'cho — js/games/beat-rush.js
   Jeu Beat Rush (rythme) */
(function () {
  /* ---------- Beat Rush : jeu de rythme avec musique générée (WebAudio) ---------- */
  var $ = function (i) { return document.getElementById(i); };
  var dlg = $('brDlg'), cv = $('brCv'), g = cv.getContext('2d');
  var COL = ['#ff5d8f', '#ffd166', '#06d6a0', '#4cc9f0'], FREQ = [440, 523.25, 587.33, 659.25];
  var KEYS = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };
  var LV = [{ n: 'Chill', bpm: 96, p: 0.36, bars: 18 }, { n: 'Pop', bpm: 118, p: 0.5, bars: 22 }, { n: 'Turbo', bpm: 138, p: 0.64, bars: 26 }];
  var CH = [
    { r: 110, t: [220, 261.63, 329.63] }, { r: 87.31, t: [174.61, 220, 261.63] },
    { r: 130.81, t: [261.63, 329.63, 392] }, { r: 98, t: [196, 246.94, 293.66] }
  ];
  var TRAVEL = 1.5, WIN = 0.14, PERF = 0.06;
  var ctx = null, master = null, bassBus = null, noise = null, dpr = 1;
  var fxIn, fxOut, fxLp, fxCl, fxDr, fxWs, fxLp2, fxDi, CU = null, CAP = 240;
  var R = { run: false, lv: 1, t0: 0, ed: 0, notes: [], next: 0, tot: 0, score: 0, combo: 0, max: 0, hp: 100, hit: 0, perf: 0,
            miss: 0, pr: [0, 0, 0, 0], tmr: 0, raf: 0, sched: false, shake: 0, txt: null, lastEnd: 0, cu: 0, src: null, spk: 0 };
  var best = (function () { try { return JSON.parse(localStorage.getItem('uandi-br-best')) || {}; } catch (e) { return {}; } })();

  function ensure() {
    if (!ctx) {
      var A = window.AudioContext || window.webkitAudioContext; if (!A) return false;
      ctx = new A();
      var comp = ctx.createDynamicsCompressor(); master = ctx.createGain(); master.gain.value = 0.9;
      /* chaîne « son détruit » : plus on rate, plus la musique se déforme (filtre + distorsion + coupures) */
      fxIn = ctx.createGain(); fxOut = ctx.createGain(); fxLp = ctx.createBiquadFilter(); fxLp.type = 'lowpass'; fxLp.frequency.value = 20000; fxLp.Q.value = 0.7;
      fxCl = ctx.createGain(); fxDr = ctx.createGain(); fxDr.gain.value = 4; fxWs = ctx.createWaveShaper();
      var cur = new Float32Array(1024), ci; for (ci = 0; ci < 1024; ci++) { var cx = ci / 511.5 - 1; cur[ci] = Math.max(-0.9, Math.min(0.9, Math.round(cx * 5) / 5 * 1.6)); }
      fxWs.curve = cur; fxLp2 = ctx.createBiquadFilter(); fxLp2.type = 'lowpass'; fxLp2.frequency.value = 6000; fxDi = ctx.createGain(); fxDi.gain.value = 0;
      master.connect(fxIn); fxIn.connect(fxLp); fxLp.connect(fxCl); fxCl.connect(fxOut);
      fxIn.connect(fxDr); fxDr.connect(fxWs); fxWs.connect(fxLp2); fxLp2.connect(fxDi); fxDi.connect(fxOut);
      fxOut.connect(comp); comp.connect(ctx.destination);
      bassBus = ctx.createBiquadFilter(); bassBus.type = 'lowpass'; bassBus.frequency.value = 520; bassBus.connect(master);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noise.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function osc(t, f, d, type, v, dest, to) {
    var o = ctx.createOscillator(), a = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    a.gain.setValueAtTime(0.0001, t); a.gain.exponentialRampToValueAtTime(v, t + 0.012); a.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(a); a.connect(dest || master); o.start(t); o.stop(t + d + 0.05);
  }
  function nz(t, d, v, type, f) {
    var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), a = ctx.createGain();
    s.buffer = noise; fl.type = type; fl.frequency.value = f;
    a.gain.setValueAtTime(v, t); a.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(a); a.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
  }
  function kick(t) { osc(t, 150, 0.22, 'sine', 0.9, master, 45); }
  function snare(t) { nz(t, 0.16, 0.35, 'bandpass', 1900); osc(t, 200, 0.1, 'triangle', 0.22, master, 120); }
  function hat(t, open) { nz(t, open ? 0.12 : 0.04, 0.1, 'highpass', 7500); }
  function pluck(f) {
    var t = ctx.currentTime;
    osc(t, f, 0.38, 'triangle', 0.24); osc(t, f * 2, 0.22, 'sine', 0.08); osc(t, f * 1.004, 0.28, 'square', 0.035);
  }
  function sparkle() { var t = ctx.currentTime; [659.25, 880, 1046.5, 1318.5].forEach(function (f, i) { osc(t + i * 0.06, f, 0.2, 'triangle', 0.1); }); }

  function eighth(i, t) {
    var bar = (i / 8) | 0, pos = i % 8, ch = CH[bar % 4], ed = R.ed, last = bar >= LV[R.lv].bars - 1;
    if (pos === 0 || pos === 4) kick(t);
    if (R.lv === 2 && pos === 6 && bar % 2) kick(t);
    if (bar >= 1 && (pos === 2 || pos === 6)) snare(t);
    hat(t, pos === 7);
    if (R.lv > 0 && pos % 2 === 1) hat(t + ed / 2, false);
    if (bar >= 1 && (pos === 0 || pos === 3 || pos === 4 || pos === 6)) osc(t, ch.r * (pos === 6 ? 2 : 1), ed * 1.6, 'sawtooth', 0.22, bassBus);
    if (pos === 0) ch.t.forEach(function (f) { osc(t, f, ed * 7.5, 'triangle', 0.035); });
    if (bar >= 2 && !last) osc(t, ch.t[pos % 3] * 2, ed * 0.9, 'triangle', 0.04);
    if (last && pos === 0) nz(t, 1.4, 0.3, 'highpass', 5000);
  }
  function scheduler() {
    if (!R.sched) return;
    while (R.next < R.tot && R.t0 + R.next * R.ed < ctx.currentTime + 0.25) { eighth(R.next, R.t0 + R.next * R.ed); R.next++; }
    if (R.next >= R.tot) { R.sched = false; clearInterval(R.tmr); }
  }
  function gen() {
    var L = LV[R.lv], notes = [], lane = 1, rep = 0;
    for (var i = 16; i < (L.bars - 2) * 8; i++) {
      var pos = i % 8;
      if (Math.random() >= L.p * (pos % 2 === 0 ? 1.25 : 0.8)) continue;
      var nl = Math.random() < 0.5 ? Math.max(0, Math.min(3, lane + (Math.random() < 0.5 ? -1 : 1))) : Math.floor(Math.random() * 4);
      if (nl === lane) { rep++; if (rep > 1) nl = (lane + 1 + Math.floor(Math.random() * 3)) % 4; } if (nl !== lane) rep = 0;
      lane = nl; notes.push({ t: R.t0 + i * R.ed, l: lane, done: 0 });
    }
    R.lastEnd = notes.length ? notes[notes.length - 1].t : R.t0;
    return notes;
  }

  function size() {
    var r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(200, Math.round(r.width * dpr)); cv.height = Math.max(220, Math.round(r.height * dpr));
  }
  function lanePos(l) { var r = cv.getBoundingClientRect(); return { x: r.left + (l + 0.5) * r.width / 4, y: r.top + r.height * 0.84 }; }
  function rr(x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function draw(now) {
    var W = cv.width, H = cv.height, lw = W / 4, hitY = H * 0.84, i, n;
    var ph = ((now - R.t0) / (2 * R.ed)) % 1; if (ph < 0 || now < R.t0) ph = 1;
    var pulse = Math.pow(1 - ph, 3);
    g.save();
    if (R.shake > now) g.translate((Math.random() - 0.5) * 8 * dpr, (Math.random() - 0.5) * 8 * dpr);
    g.fillStyle = '#0b0d1a'; g.fillRect(-20, -20, W + 40, H + 40);
    var gr = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, W * (0.55 + pulse * 0.12));
    gr.addColorStop(0, 'rgba(130,90,255,' + (0.2 + pulse * 0.16) + ')'); gr.addColorStop(1, 'rgba(130,90,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (i = 0; i < 4; i++) {
      var on = now - R.pr[i] < 0.12;
      g.fillStyle = COL[i]; g.globalAlpha = on ? 0.3 : 0.07; g.fillRect(i * lw, 0, lw, H); g.globalAlpha = 1;
      if (i) { g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = dpr; g.beginPath(); g.moveTo(i * lw, 0); g.lineTo(i * lw, H); g.stroke(); }
    }
    g.strokeStyle = 'rgba(255,255,255,' + (0.45 + pulse * 0.45) + ')'; g.lineWidth = 3 * dpr;
    g.beginPath(); g.moveTo(0, hitY); g.lineTo(W, hitY); g.stroke();
    for (i = 0; i < 4; i++) {
      var cx = (i + 0.5) * lw, hot = now - R.pr[i] < 0.12;
      g.beginPath(); g.arc(cx, hitY, lw * (0.3 + (hot ? 0.06 : pulse * 0.03)), 0, 7);
      g.lineWidth = 3 * dpr; g.strokeStyle = COL[i]; g.shadowColor = COL[i]; g.shadowBlur = (hot ? 22 : 8) * dpr; g.stroke();
      if (hot) { g.fillStyle = COL[i]; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1; }
      g.shadowBlur = 0;
    }
    for (i = 0; i < R.notes.length; i++) {
      n = R.notes[i]; if (n.done) continue;
      var y = hitY - (n.t - now) / TRAVEL * hitY; if (y < -30 || y > H + 30) continue;
      g.fillStyle = COL[n.l]; g.shadowColor = COL[n.l]; g.shadowBlur = 14 * dpr;
      rr(n.l * lw + lw * 0.15, y - 13 * dpr, lw * 0.7, 26 * dpr, 12 * dpr); g.fill();
      g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,.55)'; rr(n.l * lw + lw * 0.22, y - 8 * dpr, lw * 0.56, 7 * dpr, 4 * dpr); g.fill();
    }
    var start = R.t0 + 16 * R.ed;
    if (now < start) {
      var left = Math.ceil((start - now) / (2 * R.ed)); g.fillStyle = '#fff'; g.textAlign = 'center';
      g.font = '800 ' + 26 * dpr + 'px system-ui, sans-serif'; g.globalAlpha = 0.9;
      g.fillText(left > 3 ? 'Prépare-toi…' : String(left), W / 2, H * 0.4); g.globalAlpha = 1;
    }
    g.restore();
  }

  function fxAt(l, text, big) {
    if (!window.FX) return; var p = lanePos(l);
    FX.burst(p.x, p.y, big ? 14 : 8); FX.float(text, p.x, p.y - 34);
  }
  function stats() {
    $('brScore').textContent = R.score; $('brCombo').textContent = R.combo; $('brHp').style.width = Math.max(0, R.hp) + '%';
  }
  function press(l) {
    if (!R.run || !ctx) return;
    var now = ctx.currentTime, bn = null, bd = 1, i, n, d;
    R.pr[l] = now;
    for (i = 0; i < R.notes.length; i++) {
      n = R.notes[i]; if (n.done || n.l !== l) continue;
      d = Math.abs(n.t - now); if (d < bd) { bd = d; bn = n; }
    }
    if (!bn || bd > WIN) { osc(now, 220, 0.05, 'triangle', 0.04); return; }
    bn.done = 1; R.hit++; var perfect = bd <= PERF; if (perfect) R.perf++;
    R.combo++; if (R.combo > R.max) R.max = R.combo;
    R.score += Math.round((perfect ? 100 : 50) * (1 + Math.min(R.combo, 40) / 20));
    R.hp = Math.min(100, R.hp + 3);
    if (R.cu) osc(now, FREQ[l] * 2, 0.06, 'triangle', 0.05); else pluck(FREQ[l]);
    fxAt(l, perfect ? 'Parfait !' : 'Bien', false);
    if (R.combo === 10 || R.combo === 25 || R.combo === 50 || (R.combo > 50 && R.combo % 50 === 0)) {
      sparkle(); var p = lanePos(l);
      if (window.FX) { FX.confetti(p.x, p.y - 60); FX.float('Combo x' + R.combo + ' 🔥', p.x, p.y - 100); }
    }
    stats();
  }
  /* coupure/saccade + craquements quand on rate */
  function glitch(now) {
    var g0 = fxOut.gain, d = 0.04 + Math.random() * 0.05;
    g0.cancelScheduledValues(now); g0.setValueAtTime(g0.value, now);
    g0.setValueAtTime(0.04, now + 0.005); g0.setValueAtTime(1, now + d);
    g0.setValueAtTime(0.12, now + d + 0.04); g0.setValueAtTime(1, now + d + 0.09);
    nz(now, 0.2, 0.22, 'highpass', 2500);
  }
  function damage(now) {
    var D = Math.min(1, Math.max(0, (100 - R.hp) / 55) + R.spk);
    fxLp.frequency.setTargetAtTime(Math.max(380, 20000 * Math.pow(1 - D, 3)), now, 0.05);
    fxCl.gain.setTargetAtTime(1 - 0.75 * D, now, 0.05);
    fxDi.gain.setTargetAtTime(0.55 * D, now, 0.05);
    fxLp2.frequency.setTargetAtTime(6000 - 4200 * D, now, 0.05);
  }
  function damageReset() {
    var t = ctx.currentTime;
    fxLp.frequency.cancelScheduledValues(t); fxLp.frequency.setValueAtTime(20000, t);
    fxCl.gain.cancelScheduledValues(t); fxCl.gain.setValueAtTime(1, t);
    fxDi.gain.cancelScheduledValues(t); fxDi.gain.setValueAtTime(0, t);
    fxLp2.frequency.cancelScheduledValues(t); fxLp2.frequency.setValueAtTime(6000, t);
    fxOut.gain.cancelScheduledValues(t); fxOut.gain.setValueAtTime(1, t);
  }
  function miss(n, now) {
    n.done = 1; R.miss++; R.combo = 0; R.hp -= 12; R.shake = now + 0.18;
    osc(now, 130, 0.14, 'sawtooth', 0.06, master, 80);
    R.spk = 0.4; glitch(now);
    try { if (navigator.vibrate && window.SFX && SFX.isOn()) navigator.vibrate(30); } catch (e) {}
    stats();
  }
  function frame() {
    if (!R.run) return;
    var now = ctx.currentTime, i, n, left = 0;
    master.gain.setTargetAtTime((window.SFX && SFX.isOn()) ? 0.9 : 0, now, 0.03);
    for (i = 0; i < R.notes.length; i++) { n = R.notes[i]; if (n.done) continue; if (now - n.t > WIN) miss(n, now); else left++; }
    R.spk = Math.max(0, R.spk - 0.012); damage(now);
    draw(now);
    if (R.hp <= 0) { finish(false); return; }
    if (!left && now > R.lastEnd + 1.2) { finish(true); return; }
    R.raf = requestAnimationFrame(frame);
  }
  function hush() {
    R.sched = false; clearInterval(R.tmr);
    if (R.src) { try { R.src.stop(); } catch (e) {} try { R.src.disconnect(); } catch (e) {} R.src = null; }
    if (master && ctx) { master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.06); }
  }
  /* la musique ralentit et s'éteint comme une cassette quand on perd */
  function tapeStop() {
    var s0 = R.src, t = ctx.currentTime; R.sched = false; clearInterval(R.tmr);
    if (!s0) return;
    try { s0.playbackRate.cancelScheduledValues(t); s0.playbackRate.setValueAtTime(1, t); s0.playbackRate.exponentialRampToValueAtTime(0.08, t + 0.9); } catch (e) {}
    fxOut.gain.cancelScheduledValues(t); fxOut.gain.setValueAtTime(fxOut.gain.value, t); fxOut.gain.linearRampToValueAtTime(0, t + 0.95);
    setTimeout(function () { try { s0.stop(); } catch (e) {} try { s0.disconnect(); } catch (e) {} if (R.src === s0) R.src = null; }, 1000);
  }
  function finish(win) {
    R.run = false; cancelAnimationFrame(R.raf);
    if (!win) { if (R.src) tapeStop(); else hush(); }
    else if (R.src) { var tf = ctx.currentTime; fxOut.gain.cancelScheduledValues(tf); fxOut.gain.setValueAtTime(fxOut.gain.value, tf); fxOut.gain.linearRampToValueAtTime(0, tf + 1.6); var sw = R.src; setTimeout(function () { try { sw.stop(); } catch (e) {} if (R.src === sw) R.src = null; }, 1800); }
    var tot = R.notes.length || 1, acc = Math.round(R.hit / tot * 100), stars = acc >= 90 ? 3 : acc >= 70 ? 2 : acc >= 40 ? 1 : 0;
    if (win) { stars = Math.max(stars, 1); if (window.SFX) SFX.win(); if (window.FX) { var r = cv.getBoundingClientRect(); FX.confetti(r.left + r.width / 2, r.top + r.height / 3); } }
    else if (window.SFX) SFX.lose();
    var bk = bkey(), isBest = R.score > (best[bk] || 0);
    if (isBest) { best[bk] = R.score; try { localStorage.setItem('uandi-br-best', JSON.stringify(best)); } catch (e) {} }
    $('brOvT').textContent = win ? 'Bravo ! 🎉' : 'Raté… réessaie !';
    $('brStars').textContent = win ? '★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars) : '';
    $('brOvS').textContent = 'Score ' + R.score + (isBest && R.score ? ' · nouveau record !' : '') + ' · Combo max ' + R.max + ' · Précision ' + acc + '%';
    $('brGo').textContent = 'Rejouer'; $('brOv').hidden = false; paintSeg(); stats();
  }
  function bkey() { return CU ? 'c' + R.lv + ':' + CU.name : R.lv; }
  function paintSeg() {
    document.querySelectorAll('#brSeg button').forEach(function (b) { b.setAttribute('aria-pressed', +b.dataset.d === R.lv ? 'true' : 'false'); });
    var b = best[bkey()]; $('brBest').textContent = b ? 'Record ' + LV[R.lv].n + (CU ? ' · ' + CU.name : '') + ' : ' + b : '';
    $('brSong').textContent = CU ? '♪ ' + CU.name : ''; $('brNoSong').hidden = !CU;
  }
  function start() {
    if (!ensure()) { $('brOvS').textContent = 'Le son n’est pas disponible sur cet appareil.'; return; }
    hush(); cancelAnimationFrame(R.raf); size();
    var L = LV[R.lv], raw = null;
    if (CU) {
      raw = analyze(CU.buf, R.lv);
      if (raw.length < 15) { $('brOvS').textContent = 'Pas assez de rythme détecté dans ce morceau. Essaie-en un autre.'; return; }
    }
    R.cu = CU ? 1 : 0; R.spk = 0; damageReset();
    R.score = 0; R.combo = 0; R.max = 0; R.hp = 100; R.hit = 0; R.perf = 0; R.miss = 0; R.pr = [0, 0, 0, 0]; R.shake = 0;
    master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime((window.SFX && SFX.isOn()) ? 0.9 : 0, ctx.currentTime);
    if (window.uandiMusic) uandiMusic.pause();
    if (CU) {
      R.ed = 0.25; R.t0 = ctx.currentTime + 0.35; R.tot = 0; R.next = 0; R.sched = false;
      var mt = R.t0 + 16 * R.ed, src = ctx.createBufferSource();
      src.buffer = CU.buf; src.connect(master); src.start(mt, 0, Math.min(CU.buf.duration, CAP)); R.src = src;
      R.notes = raw.map(function (o) { return { t: mt + o.t, l: o.l, done: 0 }; });
      R.lastEnd = R.notes[R.notes.length - 1].t; R.run = true;
      $('brOv').hidden = true; stats();
    } else {
      R.ed = 60 / L.bpm / 2; R.t0 = ctx.currentTime + 0.35; R.tot = L.bars * 8; R.next = 0; R.sched = true;
      R.notes = gen(); R.run = true;
      $('brOv').hidden = true; stats();
      scheduler(); R.tmr = setInterval(scheduler, 30);
    }
    R.raf = requestAnimationFrame(frame);
  }
  function stopAll() { R.run = false; cancelAnimationFrame(R.raf); hush(); }

  /* ---------- ta musique : détection des temps forts -> notes ---------- */
  function analyze(buf, lv) {
    var sr = buf.sampleRate, c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    var N = Math.min(buf.length, Math.floor(CAP * sr)), H = 1024, F = Math.floor(N / H), E = new Float32Array(F), Z = new Float32Array(F), S = new Float32Array(F), P = new Float64Array(F + 1);
    var i, j, o, x, sum, zc, prev;
    for (i = 0; i < F; i++) {
      sum = 0; zc = 0; prev = 0; o = i * H;
      for (j = 0; j < H; j++) { x = c1 ? (c0[o + j] + c1[o + j]) * 0.5 : c0[o + j]; sum += x * x; if ((x >= 0) !== (prev >= 0)) zc++; prev = x; }
      E[i] = Math.sqrt(sum / H); Z[i] = zc / H;
    }
    for (i = 1; i < F; i++) S[i] = Math.max(0, E[i] - E[i - 1]);
    for (i = 0; i < F; i++) P[i + 1] = P[i] + S[i];
    var W = Math.max(8, Math.round(sr / H * 0.6)), gap = [0.42, 0.3, 0.2][lv] * sr / H, k = [1.7, 1.45, 1.25][lv], picks = [], last = -1e9, lo, hi, mean;
    for (i = 2; i < F - 2; i++) {
      lo = Math.max(0, i - W); hi = Math.min(F - 1, i + W); mean = (P[hi + 1] - P[lo]) / (hi - lo + 1);
      if (S[i] > mean * k + 1e-4 && S[i] >= S[i - 1] && S[i] >= S[i + 1] && i - last >= gap) { picks.push(i); last = i; }
    }
    var zs = picks.map(function (p) { return (Z[p] + Z[p + 1] + Z[p + 2]) / 3; }), sorted = zs.slice().sort(function (a, b) { return a - b; });
    var q1 = sorted[Math.floor(sorted.length * 0.25)], q2 = sorted[Math.floor(sorted.length * 0.5)], q3 = sorted[Math.floor(sorted.length * 0.75)];
    var out = [], l1 = -1, l2 = -1, lane;
    picks.forEach(function (p, n) {
      var z = zs[n]; lane = z <= q1 ? 0 : z <= q2 ? 1 : z <= q3 ? 2 : 3;
      if (lane === l1 && l1 === l2) lane = (lane + 1 + (n % 2)) % 4;
      l2 = l1; l1 = lane; out.push({ t: p * H / sr + 0.01, l: lane });
    });
    return out;
  }
  function decodeBuf(ab) {
    return new Promise(function (ok, err) { var pr = ctx.decodeAudioData(ab, ok, err); if (pr && pr.then) pr.then(ok, err); });
  }
  function pickMsg(t) { $('brPickMsg').textContent = t || ''; }
  function setSong(name, ab) {
    if (!ensure()) { pickMsg('Le son n’est pas disponible sur cet appareil.'); return Promise.resolve(); }
    pickMsg('Chargement…');
    return decodeBuf(ab).then(function (buf) {
      CU = { name: String(name || 'Ma musique').replace(/\.[a-z0-9]{2,5}$/i, '').slice(0, 40), buf: buf };
      $('brPickOv').hidden = true; pickMsg(''); paintSeg();
      $('brOvT').textContent = 'Beat Rush 🎧'; $('brOvS').textContent = 'Les notes suivent ta musique. Chaque erreur la détruit un peu plus !'; $('brGo').textContent = 'Jouer';
    }).catch(function () { pickMsg('Impossible de lire ce fichier. Essaie un mp3, m4a ou wav.'); });
  }
  function pickList() {
    var box = $('brList'); box.replaceChildren();
    if (!window.uandiMusic) return;
    uandiMusic.load().then(function () {
      box.replaceChildren();
      var tr = uandiMusic.tracks();
      if (!tr.length) { var h = document.createElement('span'); h.className = 'hint'; h.textContent = 'Ta bibliothèque ♪ Musique est vide : importe un fichier.'; box.appendChild(h); return; }
      tr.forEach(function (t) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = '♪ ' + (uandiMusic.label(t) || t.name);
        b.addEventListener('click', function () {
          pickMsg('Chargement…');
          fetch(t.url).then(function (r) { return r.arrayBuffer(); }).then(function (ab) { return setSong(uandiMusic.label(t) || t.name, ab); })
            .catch(function () { pickMsg('Impossible de lire ce morceau.'); });
        });
        box.appendChild(b);
      });
    }).catch(function () {});
  }
  $('brMy').addEventListener('click', function () { pickMsg(''); $('brPickOv').hidden = false; pickList(); });
  $('brPickBack').addEventListener('click', function () { $('brPickOv').hidden = true; });
  $('brNoSong').addEventListener('click', function () { CU = null; paintSeg(); $('brOvS').textContent = 'Touche les notes quand elles passent sur la ligne. Chaque note jouée fait la mélodie !'; });
  $('brImport').addEventListener('click', function () { $('brFile').click(); });
  $('brFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!ensure()) { pickMsg('Le son n’est pas disponible sur cet appareil.'); return; }
    f.arrayBuffer().then(function (ab) {
      if (window.uandiMusic) { try { uandiMusic.add([f]); } catch (e2) {} }
      return setSong(f.name, ab);
    }).catch(function () { pickMsg('Impossible de lire ce fichier.'); });
  });

  $('brOpen').addEventListener('click', function () {
    dlg.showModal(); size(); R.run = false; R.notes = []; R.t0 = 0;
    $('brOvT').textContent = 'Beat Rush 🎧'; $('brStars').textContent = '';
    $('brOvS').textContent = 'Touche les notes quand elles passent sur la ligne. Chaque note jouée fait la mélodie !';
    $('brPickOv').hidden = true; $('brGo').textContent = 'Jouer'; $('brOv').hidden = false; paintSeg(); stats();
    g.clearRect(0, 0, cv.width, cv.height); draw(0);
  });
  $('brSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; R.lv = +b.dataset.d; paintSeg(); if (window.SFX) SFX.tap(); });
  $('brGo').addEventListener('click', start);
  $('brClose').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', stopAll);
  document.addEventListener('visibilitychange', function () { if (document.hidden && R.run) { stopAll(); finish(false); } });
  $('brPads').addEventListener('pointerdown', function (e) {
    var b = e.target.closest('.brpad'); if (!b) return; e.preventDefault();
    b.classList.add('on'); setTimeout(function () { b.classList.remove('on'); }, 110); press(+b.dataset.l);
  });
  cv.addEventListener('pointerdown', function (e) {
    if (!R.run) return; e.preventDefault();
    var r = cv.getBoundingClientRect(); press(Math.max(0, Math.min(3, Math.floor((e.clientX - r.left) / r.width * 4))));
  });
  window.addEventListener('keydown', function (e) {
    if (!dlg.open) return;
    var l = KEYS[String(e.key).toLowerCase()];
    if (l === undefined) return;
    e.stopPropagation(); e.preventDefault();
    if (!e.repeat) { var b = document.querySelector('.brpad[data-l="' + l + '"]'); if (b) { b.classList.add('on'); setTimeout(function () { b.classList.remove('on'); }, 110); } press(l); }
  }, true);
})();


};

window.__uandiMods['js/games/match3.js'] = function () {

/* E'cho — js/games/match3.js
   Jeu Cookie Match (match-3) */
(function () {
  var $ = function (i) { return document.getElementById(i); };
  var N = 7, ICONS = ['🍪', '🍩', '🍓', '🍇', '🍋', '🍬'], KEY = 'ui_m3_v1', MAXLV = 50;
  var S = (function () { try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && v.lv) return v; } catch (e) {} return { lv: 1, max: 1, g: null }; })();
  var busy = false, sel = -1, start = null, grid = $('m3Grid');
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function cfg(l) { return { k: l < 4 ? 5 : 6, moves: Math.max(14, 25 - Math.floor(l / 2)), target: 400 + (l - 1) * 250 }; }
  function rnd(k) { return Math.floor(Math.random() * k); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function runs(b) {
    var m = {}, r, c, i;
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      i = r * N + c;
      if (c <= N - 3 && b[i] >= 0 && b[i] === b[i + 1] && b[i] === b[i + 2]) m[i] = m[i + 1] = m[i + 2] = 1;
      if (r <= N - 3 && b[i] >= 0 && b[i] === b[i + N] && b[i] === b[i + 2 * N]) m[i] = m[i + N] = m[i + 2 * N] = 1;
    }
    return Object.keys(m).map(Number);
  }
  function hasMove(b) {
    for (var i = 0; i < N * N; i++) {
      var c = i % N, t;
      if (c < N - 1) { t = b[i]; b[i] = b[i + 1]; b[i + 1] = t; var m = runs(b).length; t = b[i]; b[i] = b[i + 1]; b[i + 1] = t; if (m) return true; }
      if (i + N < N * N) { t = b[i]; b[i] = b[i + N]; b[i + N] = t; var m2 = runs(b).length; t = b[i]; b[i] = b[i + N]; b[i + N] = t; if (m2) return true; }
    }
    return false;
  }
  function newBoard(k) {
    var b;
    do {
      b = [];
      for (var i = 0; i < N * N; i++) {
        var v, c = i % N, tries = 0;
        do { v = rnd(k); tries++; } while (tries < 20 && ((c >= 2 && b[i - 1] === v && b[i - 2] === v) || (i >= 2 * N && b[i - N] === v && b[i - 2 * N] === v)));
        b.push(v);
      }
    } while (runs(b).length || !hasMove(b));
    return b;
  }
  function render(fresh) {
    var g = S.g, c = cfg(g.lv);
    grid.replaceChildren();
    g.b.forEach(function (t, i) {
      var e = document.createElement('button'); e.type = 'button';
      e.className = 'm3c' + (i === sel ? ' sel' : '') + (fresh && fresh[i] ? ' nw' : '');
      e.dataset.i = i; e.dataset.t = t; e.textContent = ICONS[t]; e.setAttribute('aria-label', 'Case ' + (i + 1));
      grid.appendChild(e);
    });
    $('m3Title').textContent = 'Niveau ' + g.lv;
    $('m3Moves').textContent = g.moves; $('m3Score').textContent = g.score;
    $('m3Tgt').textContent = 'Objectif ' + c.target;
    $('m3Bar').style.width = Math.min(100, g.score / c.target * 100) + '%';
  }
  function startLevel(l) {
    var c = cfg(l); S.lv = l; S.g = { lv: l, b: newBoard(c.k), moves: c.moves, score: 0 };
    sel = -1; save(); showPlay(); render();
  }
  function showPlay() { $('m3Levels').hidden = true; $('m3Play').hidden = false; $('m3Ov').hidden = true; }
  function levels() {
    var box = $('m3LvGrid'); box.replaceChildren(); $('m3Title').textContent = 'Niveaux';
    for (var n = 1; n <= MAXLV; n++) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ghost' + (n === S.lv ? ' cur' : '');
      b.textContent = n; b.disabled = n > S.max; b.dataset.l = n; box.appendChild(b);
    }
    $('m3Play').hidden = true; $('m3Levels').hidden = false; $('m3Ov').hidden = true;
  }
  function adj(a, b) { var ar = Math.floor(a / N), br = Math.floor(b / N), ac = a % N, bc = b % N; return Math.abs(ar - br) + Math.abs(ac - bc) === 1; }
  function fx(m, combo) {
    if (!window.FX) return;
    var cells = grid.children, sx = 0, sy = 0, n = 0;
    m.forEach(function (i, k) {
      var c = cells[i]; if (!c) return;
      var r = c.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      sx += x; sy += y; n++;
      if (k < 8) FX.burst(x, y, 6);
    });
    if (n) FX.float('+' + (m.length * 10 * combo) + (combo > 1 ? '  Combo x' + combo : ''), sx / n, sy / n);
  }
  async function resolve() {
    var g = S.g, k = cfg(g.lv).k, combo = 0;
    for (;;) {
      var m = runs(g.b); if (!m.length) break;
      combo++;
      var cells = grid.children; m.forEach(function (i) { if (cells[i]) cells[i].classList.add('pop'); });
      if (window.SFX) SFX.pop(combo);
      fx(m, combo);
      await wait(230);
      m.forEach(function (i) { g.b[i] = -1; });
      g.score += m.length * 10 * combo;
      var fresh = {};
      for (var c = 0; c < N; c++) {
        var col = [], r;
        for (r = N - 1; r >= 0; r--) if (g.b[r * N + c] >= 0) col.push(g.b[r * N + c]);
        for (r = N - 1; r >= 0; r--) { if (col.length) g.b[r * N + c] = col.shift(); else { g.b[r * N + c] = rnd(k); fresh[r * N + c] = 1; } }
      }
      render(fresh); await wait(260);
    }
    if (!hasMove(g.b)) { g.b = newBoard(k); render({}); }
  }
  async function swap(a, b) {
    if (busy || !S.g) return; busy = true; sel = -1;
    var g = S.g, t = g.b[a]; g.b[a] = g.b[b]; g.b[b] = t; render();
    if (!runs(g.b).length) { if (window.SFX) SFX.error(); if (window.FX) FX.shake(grid); await wait(200); t = g.b[a]; g.b[a] = g.b[b]; g.b[b] = t; render(); busy = false; return; }
    g.moves--; if (window.SFX) SFX.swap(); await resolve(); render(); save();
    var c = cfg(g.lv);
    if (g.score >= c.target) {
      if (window.SFX) SFX.win();
      if (window.FX) { var gr = grid.getBoundingClientRect(); FX.confetti(gr.left + gr.width / 2, gr.top + gr.height / 3); }
      S.max = Math.max(S.max, Math.min(MAXLV, g.lv + 1)); S.lv = Math.min(MAXLV, g.lv + 1); S.g = null; save();
      over('Niveau réussi ! 🎉', 'Score : ' + g.score, 'Niveau suivant', function () { startLevel(S.lv); });
    } else if (g.moves <= 0) {
      if (window.SFX) SFX.lose();
      S.g = null; save();
      over('Plus de coups', 'Score : ' + g.score + ' sur ' + c.target, 'Rejouer', function () { startLevel(g.lv); });
    }
    busy = false;
  }
  var ovFn = null;
  function over(t, sub, label, fn) { $('m3OvT').textContent = t; $('m3OvS').textContent = sub; $('m3OvGo').textContent = label; ovFn = fn; $('m3Ov').hidden = false; }
  $('m3OvGo').addEventListener('click', function () { if (ovFn) ovFn(); });
  grid.addEventListener('pointerdown', function (e) {
    var c = e.target.closest('.m3c'); if (!c || busy) return;
    start = { i: +c.dataset.i, x: e.clientX, y: e.clientY };
  });
  grid.addEventListener('pointerup', function (e) {
    if (!start || busy) { start = null; return; }
    var s0 = start, dx = e.clientX - s0.x, dy = e.clientY - s0.y; start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 16) {
      var to = Math.abs(dx) > Math.abs(dy) ? s0.i + (dx > 0 ? 1 : -1) : s0.i + (dy > 0 ? N : -N);
      if (to >= 0 && to < N * N && adj(s0.i, to)) swap(s0.i, to);
      return;
    }
    if (window.SFX) SFX.tap();
    if (sel < 0) sel = s0.i; else if (sel === s0.i) sel = -1; else if (adj(sel, s0.i)) { swap(sel, s0.i); return; } else sel = s0.i;
    render();
  });
  $('m3Open').addEventListener('click', function () {
    $('m3Dlg').showModal();
    if (S.g && S.g.b) { showPlay(); sel = -1; render(); } else startLevel(S.lv);
  });
  $('m3LvBtn').addEventListener('click', function () { if (!busy) levels(); });
  $('m3LvGrid').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) { if (window.SFX) SFX.tap(); startLevel(+b.dataset.l); } });
  $('m3Close').addEventListener('click', function () { $('m3Dlg').close(); });
})();


};

window.__uandiMods['js/ui/animations.js'] = function () {

/* E'cho — js/ui/animations.js
   Fluidité : animations pilotées par le DOM */
/* ============ Fluidité : animations pilotées par le DOM ============ */
(function () {
  'use strict';
  var RMQ = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(RMQ && RMQ.matches); }
  var $ = function (id) { return document.getElementById(id); };
  var SPRING = (getComputedStyle(document.documentElement).getPropertyValue('--spring-soft') || '').trim() || 'cubic-bezier(.3,1.2,.5,1)';
  function anim(el, kf, opt) {
    if (!el.animate || reduced()) return;
    try { opt.easing = SPRING; el.animate(kf, opt); }
    catch (e) { try { opt.easing = 'ease-out'; el.animate(kf, opt); } catch (e2) {} }
  }
  function raf(fn) { var q = 0; return function () { cancelAnimationFrame(q); q = requestAnimationFrame(fn); }; }

  /* 1. Barre d'onglets : pastille qui glisse */
  function tabIndicator() {
    var nav = $('tabbar'); if (!nav) return;
    var ind = document.createElement('i'); ind.className = 'tabind'; ind.setAttribute('aria-hidden', 'true');
    nav.insertBefore(ind, nav.firstChild);
    var placed = false;
    function place() {
      var t = nav.querySelector('.tab[aria-current="page"]');
      if (!t || nav.hidden || !t.offsetWidth) { ind.classList.remove('on'); placed = false; return; }
      if (!placed) ind.style.transition = 'none';
      ind.style.translate = t.offsetLeft + 'px 0'; ind.style.width = t.offsetWidth + 'px';
      ind.classList.add('on');
      if (!placed) { ind.getBoundingClientRect(); ind.style.transition = ''; placed = true; }
    }
    var sched = raf(place);
    new MutationObserver(sched).observe(nav, { attributes: true, subtree: true, attributeFilter: ['aria-current', 'hidden'] });
    window.addEventListener('resize', sched);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sched);
    sched();
  }

  /* 2. Onglets / segments : pastille qui glisse */
  function slideInd() {
    function setup(c) {
      if (c.dataset.si) return; c.dataset.si = '1';
      var ind = document.createElement('i'); ind.className = 'slideind'; ind.setAttribute('aria-hidden', 'true');
      c.insertBefore(ind, c.firstChild);
      var placed = false;
      function place() {
        var a = c.querySelectorAll(':scope > button[aria-selected="true"], :scope > button[aria-pressed="true"]');
        if (a.length !== 1 || !c.offsetWidth || !a[0].offsetWidth) { c.classList.remove('si'); ind.classList.remove('on'); placed = false; return; }
        var b = a[0];
        if (!placed) ind.style.transition = 'none';
        ind.style.translate = b.offsetLeft + 'px ' + b.offsetTop + 'px';
        ind.style.width = b.offsetWidth + 'px'; ind.style.height = b.offsetHeight + 'px';
        ind.style.borderRadius = getComputedStyle(b).borderRadius;
        c.classList.add('si'); ind.classList.add('on');
        if (!placed) { ind.getBoundingClientRect(); ind.style.transition = ''; placed = true; }
      }
      var sched = raf(place);
      new MutationObserver(sched).observe(c, { attributes: true, subtree: true, attributeFilter: ['aria-selected', 'aria-pressed', 'hidden'] });
      if (window.ResizeObserver) new ResizeObserver(sched).observe(c);
      sched();
    }
    function scan() { document.querySelectorAll('.tabs:not([data-si]), .seg:not([data-si])').forEach(setup); }
    scan();
    var t = 0;
    new MutationObserver(function () { clearTimeout(t); t = setTimeout(scan, 250); }).observe(document.body, { childList: true, subtree: true });
  }

  /* 3. Messages : chaque nouveau message arrive en douceur */
  function logAnim() {
    var log = $('log'); if (!log) return;
    var seen = Object.create(null), ent = Object.create(null), cold = true;
    function reset() { seen = Object.create(null); ent = Object.create(null); cold = true; }
    var vc = $('viewChat');
    if (vc) new MutationObserver(reset).observe(vc, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(function () {
      var rows = log.querySelectorAll('.row[data-id]'), now = performance.now(), i, id;
      if (!rows.length) { if (log.querySelector('.empty')) cold = false; return; }
      var first = -1;
      for (i = 0; i < rows.length; i++) if (seen[rows[i].dataset.id]) { first = i; break; }
      if (first < 0 && Object.keys(seen).length) { reset(); }
      var fresh = [];
      for (i = 0; i < rows.length; i++) {
        id = rows[i].dataset.id;
        if (seen[id]) continue;
        seen[id] = 1;
        if (cold) fresh.push(i);
        else if (first < 0 || i > first) ent[id] = now;   /* ajout en bas */
      }
      if (cold) {
        var from = Math.max(0, rows.length - 7);
        fresh.forEach(function (k) { if (k >= from) ent[rows[k].dataset.id] = now + (k - from) * 36; });
        cold = false;
      }
      for (i = 0; i < rows.length; i++) {
        id = rows[i].dataset.id;
        if (ent[id] === undefined) continue;
        var dt = ent[id] - now;
        if (dt > -600) { rows[i].classList.add('enter'); rows[i].style.animationDelay = dt + 'ms'; }
        else delete ent[id];
      }
    }).observe(log, { childList: true });
  }

  /* 4. Liste des discussions : cascade à l'ouverture + déplacements fluides */
  function listAnim() {
    var ul = $('chats'), vl = $('viewList'); if (!ul || !vl) return;
    var intro = true, pos = Object.create(null);
    new MutationObserver(function () { if (!vl.hidden) intro = true; }).observe(vl, { attributes: true, attributeFilter: ['hidden'] });
    function key(li) { var b = li.firstElementChild; if (!b || !b.dataset) return null; return b.dataset.gid ? 'g' + b.dataset.gid : (b.dataset.uid ? 'u' + b.dataset.uid : null); }
    new MutationObserver(function () {
      if (vl.hidden) { pos = Object.create(null); return; }
      var rows = [], i, k, li, items = ul.children;
      for (i = 0; i < items.length; i++) { k = key(items[i]); if (k) rows.push([k, items[i]]); }
      if (!rows.length) return;
      var had = Object.keys(pos).length;
      if (intro) {
        intro = false;
        rows.forEach(function (r, n) { if (n < 12) { r[1].classList.add('rowin'); r[1].style.setProperty('--i', n); } });
      } else if (had) {
        rows.forEach(function (r) {
          if (r[0] in pos) {
            var dy = pos[r[0]] - r[1].offsetTop;
            if (Math.abs(dy) > 3) anim(r[1], [{ translate: '0 ' + dy + 'px' }, { translate: '0 0' }], { duration: 520 });
          } else anim(r[1], [{ opacity: 0, scale: .92, translate: '0 -10px' }, { opacity: 1, scale: 1, translate: '0 0' }], { duration: 480 });
        });
      }
      pos = Object.create(null);
      rows.forEach(function (r) { pos[r[0]] = r[1].offsetTop; });
    }).observe(ul, { childList: true });
  }

  /* 5. Fenêtres : fermeture animée */
  function dialogs() {
    var oClose = HTMLDialogElement.prototype.close, oShow = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.close = function (rv) {
      var d = this;
      if (!d.open || d.id === 'lockDlg' || reduced()) return oClose.call(d, rv);
      if (d.dataset.closing) return;
      d.dataset.closing = '1'; d.classList.add('closing');
      d._ct = setTimeout(function () {
        d.classList.remove('closing'); delete d.dataset.closing; d._ct = 0;
        oClose.call(d, rv);
      }, 190);
    };
    HTMLDialogElement.prototype.showModal = function () {
      var d = this;
      if (d.dataset.closing) { clearTimeout(d._ct); d.classList.remove('closing'); delete d.dataset.closing; d._ct = 0; return; }
      return oShow.call(d);
    };
    document.addEventListener('cancel', function (e) {
      var d = e.target;
      if (d && d.tagName === 'DIALOG' && d.id !== 'lockDlg' && !reduced()) { e.preventDefault(); d.close(); }
    }, true);
  }

  function safe(f) { try { f(); } catch (e) {} }
  function init() { safe(tabIndicator); safe(slideInd); safe(logAnim); safe(listAnim); safe(function () { if (window.HTMLDialogElement) dialogs(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();


};

window.__uandiMods['js/ui/animations-actualites.js'] = function () {

/* E'cho — js/ui/animations-actualites.js
   Fluidité : animations des actualités */
(function () {
  var feed = document.getElementById('nwFeed'), vn = document.getElementById('viewNews');
  if (!feed) return;
  var rm = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  var cards = Object.create(null), cms = Object.create(null), opens = Object.create(null), ent = Object.create(null), cold = true;
  function reset() { cards = Object.create(null); cms = Object.create(null); opens = Object.create(null); ent = Object.create(null); cold = true; }
  if (vn) new MutationObserver(reset).observe(vn, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(function () {
    if (rm && rm.matches) return;
    var now = performance.now(), list = feed.querySelectorAll(':scope > .nwcard[data-id]'), i, id, k = 0;
    for (i = 0; i < list.length; i++) {
      var card = list[i]; id = card.dataset.id;
      if (!cards[id]) { cards[id] = 1; if (cold) { if (k < 6) ent['k' + id] = now + (k++) * 55; } else ent['k' + id] = now; }
      var box = card.querySelector(':scope > .nwcm'), cs = card.querySelectorAll('.nwc[data-cid]'), j;
      if (box) {
        var fresh = !opens[id]; opens[id] = 1;
        if (fresh && !cold) ent['b' + id] = now;
        for (j = 0; j < cs.length; j++) {
          var ck = id + ':' + cs[j].dataset.cid;
          if (!cms[ck]) { cms[ck] = 1; if (fresh) { if (j < 8) ent['c' + ck] = now + 90 + j * 45; } else ent['c' + ck] = now; }
        }
      } else if (opens[id]) { delete opens[id]; Object.keys(cms).forEach(function (q) { if (q.indexOf(id + ':') === 0) delete cms[q]; }); }
    }
    cold = false;
    function apply(el, key) {
      var t = ent[key]; if (t === undefined) return;
      var dt = t - now;
      if (dt > -650) { el.classList.add('fxin'); el.style.animationDelay = dt + 'ms'; } else delete ent[key];
    }
    for (i = 0; i < list.length; i++) {
      id = list[i].dataset.id; apply(list[i], 'k' + id);
      var b2 = list[i].querySelector(':scope > .nwcm'); if (b2) apply(b2, 'b' + id);
      var c2 = list[i].querySelectorAll('.nwc[data-cid]');
      for (var m = 0; m < c2.length; m++) apply(c2[m], 'c' + id + ':' + c2[m].dataset.cid);
    }
  }).observe(feed, { childList: true, subtree: true });
  /* changement de thème / mode : fondu des couleurs */
  var swapT = 0, root = document.documentElement;
  new MutationObserver(function () {
    if (rm && rm.matches) return;
    root.classList.add('themeswap'); clearTimeout(swapT);
    swapT = setTimeout(function () { root.classList.remove('themeswap'); }, 650);
  }).observe(root, { attributes: true, attributeFilter: ['data-skin', 'data-eff', 'data-ct', 'data-bg'] });
})();


};

window.__uandiMods['js/ui/retours-tactiles.js'] = function () {

/* E'cho — js/ui/retours-tactiles.js
   Ondulations et petites vibrations au toucher */
(function () {
  try {
    var RIP = '.ghost,.vact,.nwpost,.primary,.mok,.frbtns button,.send:not(.mic)';
    var HAP = RIP + ',.tab,.nwtab,.chatrow';
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
    function closest(t, sel) { return t && t.closest ? t.closest(sel) : null; }

    /* 1) toucher : ondulation + petite vibration */
    document.addEventListener('pointerdown', function (e) {
      var h = closest(e.target, HAP);
      if (!h || h.disabled) return;
      buzz(6);
      var b = closest(e.target, RIP);
      if (!b || reduce) return;
      var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
      var s = document.createElement('span');
      s.className = 'fx-rip';
      s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
      b.classList.add('fx-rip-host');
      b.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 520);
    }, true);

    /* 2) envoi de message */
    var lastSend = 0;
    function sentFx() {
      var ta = document.getElementById('msg'), sb = document.getElementById('send');
      if (!ta || !sb || ta.disabled || !ta.value.trim() || Date.now() - lastSend < 250) return;
      lastSend = Date.now();
      buzz(12);
      sb.classList.remove('fx-sent'); void sb.offsetWidth; sb.classList.add('fx-sent');
      setTimeout(function () { sb.classList.remove('fx-sent'); }, 450);
    }
    var form = document.getElementById('composer');
    if (form) form.addEventListener('submit', sentFx, true);
    var msg = document.getElementById('msg');
    if (msg) msg.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia && matchMedia('(pointer: fine)').matches) sentFx();
    }, true);

    /* 3) amis : Ajouter / Accepter -> « ✓ », Refuser / Annuler -> la ligne glisse */
    document.addEventListener('click', function (e) {
      var b = closest(e.target, '#frBody .frbtns button');
      if (!b || b.disabled) return;
      var t = (b.textContent || '').trim(), row = closest(b, '.frrow');
      if (t === 'Ajouter' || t === 'Accepter') {
        b.textContent = t === 'Ajouter' ? 'Envoyé' : 'Ami';
        b.classList.add('fx-done'); buzz([10, 40, 14]);
        setTimeout(function () {
          var er = document.getElementById('frErr');
          if (er && !er.hidden && b.isConnected) { b.classList.remove('fx-done'); b.textContent = t; }
        }, 2200);
      } else if ((t === 'Refuser' || t === 'Annuler') && row) {
        row.classList.add('fx-out'); buzz(8);
      }
    });

    /* 4) commentaires : bouton « en cours » puis le nouveau commentaire apparaît en surbrillance */
    var pending = 0, known = {};
    function snap() { known = {}; document.querySelectorAll('.nwc[data-cid]').forEach(function (n) { known[n.dataset.cid] = 1; }); }
    function startCm(btn) {
      var inp = btn && btn.parentNode && btn.parentNode.querySelector('.nwcinput');
      if (!inp || !inp.value.trim()) return;
      snap(); pending = Date.now(); buzz(10);
      btn.classList.add('fx-busy');
      setTimeout(function () { if (btn.isConnected) btn.classList.remove('fx-busy'); }, 4000);
    }
    document.addEventListener('click', function (e) { var b = closest(e.target, '.nwpost'); if (b) startCm(b); }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target || !e.target.classList || !e.target.classList.contains('nwcinput')) return;
      startCm(e.target.parentNode.querySelector('.nwpost'));
    }, true);
    new MutationObserver(function () {
      if (!pending) return;
      if (Date.now() - pending > 6000) { pending = 0; return; }
      var hit = false;
      document.querySelectorAll('.nwc[data-cid]').forEach(function (n) {
        if (!known[n.dataset.cid]) { n.classList.add('fx-new'); hit = true; }
      });
      if (hit) { pending = 0; buzz([8, 30, 8]); }
    }).observe(document.body, { childList: true, subtree: true });
  } catch (err) { /* les retours visuels ne doivent jamais casser l'appli */ }
})();


};

window.__uandiMods['js/ui/bouton-plus.js'] = function () {

/* E'cho — js/ui/bouton-plus.js
   Bouton « + » du champ de message */
(function(){ try {
  var $=function(s){return document.querySelector(s)};
  var plus='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  var pen='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>';
  var comp=$('#composer'), pic=$('#pic');
  if(comp && pic && !$('#plusBtn')){
    var pb=document.createElement('button'); pb.type='button'; pb.id='plusBtn'; pb.className='send mic';
    pb.setAttribute('aria-label','Plus : photo'); pb.setAttribute('aria-expanded','false'); pb.innerHTML=plus;
    comp.insertBefore(pb, comp.firstChild);
    pb.addEventListener('click',function(){ var o=comp.classList.toggle('plus-open'); pb.setAttribute('aria-expanded',o?'true':'false'); });
    pic.addEventListener('click',function(){ comp.classList.remove('plus-open'); pb.setAttribute('aria-expanded','false'); });
    ['docBtn','musBtn'].forEach(function(id){ var db=document.getElementById(id); if(db) db.addEventListener('click',function(){ comp.classList.remove('plus-open'); pb.setAttribute('aria-expanded','false'); }); });
    comp.addEventListener('submit',function(){ comp.classList.remove('plus-open'); });
  }
  var m3=$('#m3Open'), br=$('#brOpen'), sfx=$('#sfxBtn');
  if(m3 && br && sfx && m3.parentNode){
    var hub=document.createElement('div'); hub.className='ghub';
    m3.parentNode.insertBefore(hub,m3); hub.appendChild(m3); hub.appendChild(br); hub.appendChild(sfx);
  }
  function fab(id,label,html,fn){ var b=document.createElement('button'); b.type='button'; b.id=id; b.className='fxfab'; b.setAttribute('aria-label',label); b.innerHTML=html; b.addEventListener('click',fn); document.body.appendChild(b); return b; }
  var SPARK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>';
  var BOOK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 5.5V21.5M8 7h8M8 11h6"/></svg>';
  var fmenu=document.createElement('div'); fmenu.id='fabMenu';
  fmenu.innerHTML='<button type="button" id="fmAi">'+SPARK+'X.Uni</button><button type="button" id="fmSt">'+BOOK+'Étudier</button>';
  document.body.appendChild(fmenu);
  function closeMenu(){ fmenu.classList.remove('on'); var f=$('#fabNew'); if(f){ f.classList.remove('open'); f.setAttribute('aria-expanded','false'); } }
  var fl=fab('fabNew','X.Uni et étude',plus,function(e){ e.stopPropagation(); var o=fmenu.classList.toggle('on'); fl.classList.toggle('open',o); fl.setAttribute('aria-expanded',o?'true':'false'); });
  fl.setAttribute('aria-haspopup','true'); fl.setAttribute('aria-expanded','false');
  fmenu.addEventListener('click',function(e){ var b=e.target.closest('button'); if(!b) return; closeMenu(); if(b.id==='fmAi'&&window.uandiAI) window.uandiAI.open(); if(b.id==='fmSt'&&window.uandiStudy) window.uandiStudy.open(); });
  document.addEventListener('click',function(e){ if(fmenu.classList.contains('on') && !e.target.closest('#fabMenu,#fabNew')) closeMenu(); });
  var fn=fab('fabLetter','Écrire une lettre',pen+'<span>Écrire</span>',function(){
    var p=$('#nwPaneFeed'); if(!p) return; var o=p.classList.toggle('open');
    if(o){ var t=$('#nwText'); if(t) setTimeout(function(){ t.focus(); },120); }
  });
  function sync(){
    var vl=$('#viewList'), vn=$('#viewNews'), pf=$('#nwPaneFeed'), ap=$('#app'), lg=!!ap && !ap.hidden;
    fl.classList.toggle('on', lg && !!vl && !vl.hidden);
    if(!(lg && vl && !vl.hidden)) closeMenu();
    fn.classList.toggle('on', lg && !!vn && !vn.hidden && !!pf && !pf.hidden);
  }
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['hidden'],subtree:true});
  sync();
} catch(e) { /* l'interface ne doit jamais casser l'appli */ } })();


};

window.__uandiMods['js/ui/bande-notes.js'] = function () {

/* E'cho — js/ui/bande-notes.js
   Bande des notes des amis */
(function(){ try {
  var chats=document.getElementById('chats'); if(!chats||!chats.parentNode) return;
  var strip=document.createElement('div'); strip.id='noteStrip'; strip.hidden=true;
  strip.setAttribute('aria-label','Notes de tes amis'); chats.parentNode.insertBefore(strip,chats);
  var raf=0;
  function build(){
    raf=0; strip.textContent='';
    var rings=chats.querySelectorAll('.chatrow .avatar.ring');
    rings.forEach(function(a){
      var row=a.closest('.chatrow'), it=document.createElement('button'), c=a.cloneNode(true), l=document.createElement('span');
      it.type='button'; it.className='nsitem'; c.removeAttribute('id'); l.textContent=(row&&row.dataset.name)||'';
      it.appendChild(c); it.appendChild(l); it.addEventListener('click',function(){ a.click(); }); strip.appendChild(it);
    });
    strip.hidden=!rings.length;
  }
  new MutationObserver(function(){ if(!raf) raf=requestAnimationFrame(build); }).observe(chats,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  build();
} catch(e) { /* ne casse jamais l'appli */ } })();


};


/* ===== Chargeur (Firebase puis appli) ===== */
/* E'cho — js/boot/loader.js
   Chargeur : Firebase (4 miroirs), puis l’appli et ses modules dans l’ordre */
/* Démarrage robuste : charge Firebase depuis plusieurs miroirs, réessaie, et ne bloque jamais l'écran */
(function () {
  /* ---- fichiers chargés après Firebase (l'ordre compte) ---- */
  var VER = (window.APP_CONFIG && window.APP_CONFIG.version) || '1';
  var APP_PARTS = [
    'js/app/01-base.js',
    'js/app/02-connexion-presence.js',
    'js/app/03-liste-discussions.js',
    'js/app/04-amis.js',
    'js/app/05-outils-createur.js',
    'js/app/06-epingles-anniversaires-code.js',
    'js/app/07-groupes.js',
    'js/app/08-discussion.js',
    'js/app/09-notifications.js',
    'js/app/10-actions-messages.js',
    'js/app/11-apparence-profil.js',
    'js/app/12-reactions-photos.js',
    'js/app/13-fichiers-vocaux.js',
    'js/app/14-nettoyage.js',
    'js/app/15-jeu-mots.js',
    'js/app/16-alerte-notes-badges.js',
    'js/app/17-comptes-createur.js',
    'js/app/18-compte.js',
    'js/app/19-musique.js',
    'js/app/20-ecoute-ensemble.js',
    'js/app/21-appel-vocal.js',
    'js/app/22-action-verite.js',
    'js/app/23-actualites-lettres.js',
    'js/app/24-actualites-commentaires.js',
    'js/app/25-discussions-anonymes.js',
    'js/app/26-session-approbation.js',
    'js/app/27-push.js',
    'js/app/28-recuperation-email.js'
  ];
  var APP_MODULES = [
    'js/ui/onglets.js',
    'js/ui/menu-discussion.js',
    'js/games/sons.js',
    'js/games/beat-rush.js',
    'js/games/match3.js',
    'js/ui/animations.js',
    'js/ui/animations-actualites.js',
    'js/ui/retours-tactiles.js',
    'js/ui/bouton-plus.js',
    'js/ui/bande-notes.js'
  ];
  function bust(u) { return u + '?v=' + VER; }
  /* L'appli est une seule fermeture (variables partagées) coupée en parties pour être lisible :
     on charge les parties en parallèle, puis on les assemble dans l'ordre et on les exécute d'un bloc. */
  async function loadApp() { window.__uandiApp(); }
  function loadModules() {
    APP_MODULES.forEach(function (p) {
      try { window.__uandiMods[p](); }
      catch (e) { try { console.error('Module en erreur : ' + p, e); } catch (x) {} }
    });
  }
  /* ---- Firebase ---- */
  var V = '10.12.2', F = ['firebase-app-compat', 'firebase-auth-compat', 'firebase-firestore-compat'];
  var BASES = [
    function (n) { return 'https://www.gstatic.com/firebasejs/' + V + '/' + n + '.js'; },
    function (n) { return 'https://cdn.jsdelivr.net/npm/firebase@' + V + '/' + n + '.js'; },
    function (n) { return 'https://cdnjs.cloudflare.com/ajax/libs/firebase/' + V + '/' + n + '.js'; },
    function (n) { return 'https://unpkg.com/firebase@' + V + '/' + n + '.js'; }
  ];
  function say(t, retry) {
    var m = document.getElementById('splashMsg'); if (m) m.textContent = t;
    var sp = document.getElementById('splash'); if (!sp) return;
    var b = document.getElementById('splashRetry');
    if (retry && !b) {
      b = document.createElement('button'); b.id = 'splashRetry'; b.type = 'button'; b.textContent = 'Réessayer';
      b.style.cssText = 'padding:10px 24px;border:0;border-radius:999px;background:#E0457B;color:#fff;font:600 15px system-ui,sans-serif';
      b.onclick = function () { b.remove(); say('Nouvelle tentative…'); start(); };
      sp.appendChild(b);
    } else if (!retry && b) b.remove();
  }
  function one(src, ms) {
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'), fin = false;
      function end(good) { if (fin) return; fin = true; clearTimeout(t); if (good) ok(); else { s.onload = s.onerror = null; try { s.remove(); } catch (e) {} ko(); } }
      var t = setTimeout(function () { end(false); }, ms);
      s.src = src; s.async = false; s.onload = function () { end(true); }; s.onerror = function () { end(false); };
      document.head.appendChild(s);
    });
  }
  async function lib(n, tryMs) {
    for (var round = 0; round < 2; round++) {
      for (var i = 0; i < BASES.length; i++) {
        try { await one(BASES[i](n), tryMs * (round + 1)); return true; } catch (e) {}
        if (n === F[0] && window.firebase) return true;
      }
    }
    return false;
  }
  async function loadFirebase() {
    if (window.firebase && firebase.auth && firebase.firestore) return true;
    say('Chargement…');
    if (!(await lib(F[0], 9000))) return false;
    say('Connexion au serveur…');
    var r = await Promise.all([lib(F[1], 9000), lib(F[2], 9000)]);
    return r[0] && r[1];
  }
  function ready() { return document.readyState !== 'loading' ? Promise.resolve() : new Promise(function (ok) { document.addEventListener('DOMContentLoaded', ok); }); }
  var started = false;
  async function start() {
    var good = await loadFirebase();
    if (!good) { say('Impossible de joindre le serveur. Vérifie ta connexion.', true); window.addEventListener('online', function () { if (!started) start(); }, { once: true }); return; }
    await ready();
    started = true;
    try { await loadApp(); }
    catch (e) {
      started = false;
      try { console.error(e); } catch (x) {}
      var why = ''; try { why = (typeof window.__uandiApp !== 'function') ? ' [script.js introuvable ou ancien : vérifie js/script.js]' : ' [' + String((e && e.message) || e).slice(0, 90) + ']'; } catch (x) {}
      say('Impossible de charger l’appli. Vérifie ta connexion.' + why, true);
      window.addEventListener('online', function () { if (!started) start(); }, { once: true });
      return;
    }
    loadModules();
  }
  start();
})();

/* E'cho — js/boot/blank-guard.js
   Filet de sécurité : message si le site n’a pas démarré après 60 s */
(function () {
  setTimeout(function () {
    function vis(id) { var n = document.getElementById(id); return n && !n.hidden; }
    if (vis('login') || vis('app') || vis('apWait') || document.getElementById('blank-msg')) return;
    var d = document.createElement('div'); d.id = 'blank-msg';
    d.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;font:500 16px system-ui,sans-serif;color:#5B1035;background:rgba(255,233,241,.92)';
    d.innerHTML = '<div style="font-size:2.4rem">E&#39;cho</div><div>Le site n’a pas pu démarrer.<br>Vérifie ta connexion, puis réessaie.</div>';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Réessayer';
    b.style.cssText = 'padding:12px 26px;border:0;border-radius:999px;background:#E0457B;color:#fff;font:600 16px system-ui,sans-serif';
    b.onclick = function () { location.reload(); };
    d.appendChild(b); document.body.appendChild(d);
  }, 60000);
})();


/* ===== Modules chargés au démarrage ===== */

/* E'cho — js/modules/etudier.js
   Module Étudier : importer, résumer, quiz, devoirs */
(function(){try{
var $=function(s){return document.querySelector(s)},KEY='uandi-study';
var S={lessons:[],cur:null,fs:1.05,pos:{},view:'text',hits:[],hi:-1,reading:false,t:1500,tm:0};
try{var d0=JSON.parse(localStorage.getItem(KEY)||'{}');S.lessons=d0.lessons||[];S.cur=d0.cur||null;S.fs=d0.fs||1.05}catch(e){}
var tt;function toast(m){var t=$('#stToast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2600)}
function lesson(){return S.lessons.filter(function(l){return l.id===S.cur})[0]}

/* ---------- Stockage (IndexedDB : grande capacité, images comprises) ---------- */
var DB=null;
function idbOpen(){return new Promise(function(ok,ko){try{var r=indexedDB.open('uandi-study-db',1);r.onupgradeneeded=function(){r.result.createObjectStore('kv')};r.onsuccess=function(){ok(r.result)};r.onerror=function(){ko(r.error)};r.onblocked=function(){ko(new Error('blocked'))}}catch(e){ko(e)}})}
function kv(mode,fn){return new Promise(function(ok,ko){if(!DB)return ko(new Error('nodb'));var tx=DB.transaction('kv',mode),r=fn(tx.objectStore('kv'));tx.oncomplete=function(){ok(r&&r.result)};tx.onerror=tx.onabort=function(){ko(tx.error||new Error('tx'))}})}
function kvGet(k){return kv('readonly',function(s){return s.get(k)})}
function kvSet(k,v){return kv('readwrite',function(s){return s.put(v,k)})}
function kvDel(k){return kv('readwrite',function(s){return s.delete(k)})}
function lsSave(){try{localStorage.setItem(KEY,JSON.stringify({lessons:S.lessons,cur:S.cur,fs:S.fs}))}catch(e){toast('Mémoire pleine : supprime une leçon')}}
function saveMeta(){if(!DB)return lsSave();return kvSet('meta',{ids:S.lessons.map(function(l){return l.id}),cur:S.cur,fs:S.fs,pos:S.pos}).catch(function(){toast('Sauvegarde impossible')})}
function saveLesson(l){if(!DB){lsSave();return Promise.resolve()}return kvSet('l:'+l.id,l).catch(function(){toast('Mémoire pleine : supprime une leçon')})}
function save(){return saveMeta()}

/* ---------- Outils texte ---------- */
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function unesc(s){return s.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')}
function txt(h){var t=document.createElement('template');t.innerHTML=String(h).replace(/<br>/g,' ');return(t.content.textContent||'').replace(/\s+/g,' ').trim()}
function trimH(h){return h.replace(/^(?:\s|<br>|\u2003|&nbsp;)+|(?:\s|<br>|\u2003|&nbsp;)+$/g,'')}
function okSrc(u){return /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml)/i.test(u)||/^https?:\/\//i.test(u)}
function imgTag(src,alt){return'<img src="'+esc(src)+'"'+(alt?' alt="'+esc(alt)+'"':'')+'>'}
function mkTable(rows){
  var h='<table>',x=[];
  rows.forEach(function(r){h+='<tr>';var xr=[];
    r.forEach(function(c){var tg=c.th?'th':'td';h+='<'+tg+(c.cs>1?' colspan="'+c.cs+'"':'')+(c.rs>1?' rowspan="'+c.rs+'"':'')+'>'+(c.h||'')+'</'+tg+'>';if(c.x)xr.push(c.x)});
    h+='</tr>';if(xr.length)x.push(xr.join(', '))});
  return{t:'tbl',h:h+'</table>',x:x.join('. ')}}
function blocksHtml(bs){return bs.map(function(b){
  if(b.t==='tbl')return b.h;
  if(b.t==='img')return imgTag(b.src);
  if(b.t==='h')return'<b>'+esc(b.x)+'</b>';
  if(b.t==='li')return(b.mk?esc(b.mk)+'&nbsp;':'')+(b.h||esc(b.x));
  return b.h||esc(b.x)}).join('<br>')}

/* ---------- Images : réduction avant stockage ---------- */
function blobToUrl(b){return new Promise(function(ok){var r=new FileReader();r.onload=function(){ok(r.result)};r.onerror=function(){ok(null)};r.readAsDataURL(b)})}
function shrink(blob,max){return new Promise(function(ok){
  max=max||1400;var u=URL.createObjectURL(blob),im=new Image();
  im.onload=function(){try{
    var w=im.naturalWidth,h=im.naturalHeight,k=Math.min(1,max/Math.max(w,h));
    if(k===1&&blob.size<300000){URL.revokeObjectURL(u);blobToUrl(blob).then(ok);return}
    var c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));
    var g=c.getContext('2d'),jpg=blob.type==='image/jpeg';
    if(jpg){g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height)}
    g.drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);
    var out=jpg?c.toDataURL('image/jpeg',.82):c.toDataURL('image/png');
    if(!jpg&&out.length>800000){var c2=document.createElement('canvas');c2.width=c.width;c2.height=c.height;var g2=c2.getContext('2d');g2.fillStyle='#fff';g2.fillRect(0,0,c.width,c.height);g2.drawImage(c,0,0);out=c2.toDataURL('image/jpeg',.82)}
    ok(out)}catch(e){ok(null)}};
  im.onerror=function(){URL.revokeObjectURL(u);ok(null)};im.src=u})}

/* ---------- Texte brut / Markdown / texte collé (tableaux, listes, titres) ---------- */
function mdInline(s){
  var h=esc(s);
  h=h.replace(/`([^`]+)`/g,'<code>$1</code>');
  h=h.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,function(m,a,b){return'<b>'+(a||b)+'</b>'});
  h=h.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g,'$1<i>$2</i>');
  h=h.replace(/~~([^~]+)~~/g,'<s>$1</s>');
  h=h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'$1');
  return h}
function plain(s){return s.replace(/\*\*|__|`/g,'').replace(/(^|\s)\*(\S[^*]*)\*/g,'$1$2')}
function parseCSV(t){
  var first=t.split('\n')[0]||'',dl=[',',';','\t','|'].map(function(c){return[c,first.split(c).length]}).sort(function(a,b){return b[1]-a[1]})[0][0];
  var rows=[],row=[],f='',q=false;
  for(var i=0;i<t.length;i++){var c=t[i];
    if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;
    else if(c===dl){row.push(f);f=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&t[i+1]==='\n')i++;row.push(f);f='';rows.push(row);row=[]}
    else f+=c}
  if(f!==''||row.length){row.push(f);rows.push(row)}
  rows=rows.filter(function(r){return r.join('').trim()!==''});if(!rows.length)return[];
  var n=Math.max.apply(null,rows.map(function(r){return r.length}));
  return[mkTable(rows.map(function(r,ri){var cs=[];for(var k=0;k<n;k++){var v=(r[k]||'').trim();cs.push({h:esc(v),x:v,th:ri===0})}return cs}))]}
function parseText(src){
  var L=src.replace(/\r/g,'').replace(/\u00a0/g,' ').split('\n'),B=[],buf=[],i;
  function flush(){if(!buf.length)return;
    var avg=buf.reduce(function(a,s){return a+s.length},0)/buf.length;
    if(buf.length>1&&avg>=58){var s=buf.join(' ').replace(/\s+/g,' ').trim();B.push({t:'p',x:plain(s),h:mdInline(s)})}
    else B.push({t:'p',x:buf.map(plain).join(' '),h:buf.map(mdInline).join('<br>')});
    buf=[]}
  function tabCells(l){return l.replace(/[ \r]+$/,'').split('\t').map(function(c){return c.trim()})}
  function gapCells(l){return l.trim().split(/ {2,}|\t/)}
  function mdCells(l){return l.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(function(c){return c.trim()})}
  function depth(sp){return Math.min(3,Math.floor(sp.replace(/\t/g,'  ').length/2))}
  function tableFrom(rows,hdr){
    var n=Math.max.apply(null,rows.map(function(r){return r.length}));
    return mkTable(rows.map(function(r,ri){var cs=[];for(var k=0;k<n;k++){var v=r[k]||'';cs.push({h:mdInline(v),x:plain(v),th:hdr&&ri===0})}return cs}))}
  for(i=0;i<L.length;i++){
    var raw=L[i],s=raw.trim(),hasTab=raw.indexOf('\t')>-1;
    if(!s&&!hasTab){flush();continue}
    if(!s)continue;
    if(/^```/.test(s)){flush();var code=[];i++;while(i<L.length&&!/^```/.test(L[i].trim())){code.push(L[i]);i++}
      var ct=code.join('\n');if(ct.trim())B.push({t:'p',c:'pre',x:ct,h:esc(ct)});continue}
    /* tableau Markdown */
    if(s.indexOf('|')>-1&&i+1<L.length&&L[i+1].indexOf('-')>-1&&/^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/.test(L[i+1])){
      flush();var rows=[mdCells(s)];i+=2;
      while(i<L.length&&L[i].trim()&&L[i].indexOf('|')>-1){rows.push(mdCells(L[i]));i++}
      i--;B.push(tableFrom(rows,true));continue}
    /* tableau copié depuis Word / Excel / un site : colonnes séparées par des tabulations */
    if(hasTab){
      var g=[],j=i;
      while(j<L.length){
        if(L[j].indexOf('\t')>-1){g.push(tabCells(L[j]));j++}
        else if(L[j].trim()&&L[j].trim().length<60&&g.length&&j+1<L.length&&L[j+1].indexOf('\t')>-1){g.push([L[j].trim()]);j++}
        else break}
      var mxc=Math.max.apply(null,g.map(function(r){return r.length}));
      if(g.length>=2||mxc>=3){flush();
        var hdr=g.length>1&&g[0].length>=2&&g[0].every(function(c){return c!==''});
        B.push(tableFrom(g,hdr));i=j-1;continue}}
    /* colonnes séparées par plusieurs espaces (3 lignes de suite minimum) */
    var gc=gapCells(raw);
    if(gc.length>=2&&gc.every(function(c){return c.length<45})){
      var j2=i,rr=[];
      while(j2<L.length&&L[j2].trim()&&gapCells(L[j2]).length===gc.length){rr.push(gapCells(L[j2]));j2++}
      if(rr.length>=3){flush();B.push(tableFrom(rr,true));i=j2-1;continue}}
    /* citation */
    if(/^>\s?/.test(s)){flush();var q=[];while(i<L.length&&/^>\s?/.test(L[i].trim())){q.push(L[i].trim().replace(/^>\s?/,''));i++}i--;
      var qs=q.join(' ').trim();if(qs)B.push({t:'p',c:'q',x:plain(qs),h:mdInline(qs)});continue}
    /* image Markdown */
    var im=s.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if(im&&okSrc(im[2])){flush();B.push({t:'img',src:im[2],x:im[1]});continue}
    if(/^(-{3,}|\*{3,}|_{3,})$/.test(s)){flush();continue}
    var m=s.match(/^(#{1,6})\s+(.+)/),lv=0,x=s;
    if(m){lv=m[1].length;x=m[2]}
    else if(s.length<90&&!/[.;,:]$/.test(s)){
      var n=s.match(/^(\d+(?:\.\d+)*|[IVXL]+)[.)]?\s+\S/);
      if(n&&/^\d/.test(n[1]))lv=n[1].split('.').length;
      else if(n)lv=1;
      else if(/^(chapitre|partie|section|le[cç]on|unité|module|titre|introduction|conclusion|résumé|définition|exemple|exercice)\b/i.test(s))lv=1;
      else if(s.length>3&&s===s.toUpperCase()&&/[A-ZÀ-Ý]{3}/.test(s))lv=1;
      else if(s.length<70&&!buf.length&&(!L[i-1]||!L[i-1].trim())&&(!L[i+1]||!L[i+1].trim())&&/^[A-ZÀ-Ý]/.test(s))lv=2}
    if(lv){flush();B.push({t:'h',l:Math.min(lv,4),x:plain(x).trim()});continue}
    var bl=raw.match(/^(\s*)([-*•–·▪●◦])\s+(.+)/);
    if(bl){flush();B.push({t:'li',d:depth(bl[1]),mk:'•',x:plain(bl[3]),h:mdInline(bl[3])});continue}
    var nl=raw.match(/^(\s*)(\d+[.)]|[a-zA-Z][.)])\s+(.+)/);
    if(nl){flush();B.push({t:'li',d:depth(nl[1]),mk:nl[2],x:plain(nl[3]),h:mdInline(nl[3])});continue}
    buf.push(s)}
  flush();return B}

/* ---------- HTML (fichiers .html et contenu riche collé) ---------- */
var SKIP=/^(script|style|noscript|head|template|iframe|object|embed|button|select|input|textarea|audio|video|canvas|map|link|meta)$/;
var BLK=/^(address|article|aside|blockquote|body|caption|center|dd|details|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|html|li|main|nav|ol|p|pre|section|summary|table|tbody|thead|tfoot|tr|ul)$/;
function hidden(n){return n.hidden||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(n.getAttribute('style')||'')}
function svgTag(n){try{var s=new XMLSerializer().serializeToString(n);if(!/xmlns=/.test(s))s=s.replace('<svg','<svg xmlns="http://www.w3.org/2000/svg"');return imgTag('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s))}catch(e){return''}}
function inl(n){
  if(n.nodeType===3)return esc(n.nodeValue.replace(/\s+/g,' '));
  if(n.nodeType!==1)return'';
  var tg=n.tagName.toLowerCase();
  if(SKIP.test(tg)||hidden(n))return'';
  if(tg==='br')return'<br>';
  if(tg==='img'){var s=n.getAttribute('src')||'';return okSrc(s)?imgTag(s,n.getAttribute('alt')):''}
  if(tg==='svg')return svgTag(n);
  var st=(n.getAttribute('style')||'').toLowerCase(),h='';
  for(var c=n.firstChild;c;c=c.nextSibling)h+=inl(c);
  if(!h)return'';
  var w=function(t,s){return'<'+t+'>'+s+'</'+t+'>'};
  if(tg==='sup')h=w('sup',h);else if(tg==='sub')h=w('sub',h);
  if(/^(code|kbd|tt|samp)$/.test(tg))h=w('code',h);
  if(/^(s|strike|del)$/.test(tg)||/line-through/.test(st))h=w('s',h);
  if(tg==='u'||tg==='ins'||/text-decoration[^;]*underline/.test(st))h=w('u',h);
  if(/^(i|em|cite|dfn|var)$/.test(tg)||/font-style\s*:\s*italic/.test(st))h=w('i',h);
  if(/^(b|strong)$/.test(tg)||/font-weight\s*:\s*(bold|[6-9]00)/.test(st))h=w('b',h);
  if(tg==='mark')h='<span class="hl">'+h+'</span>';
  return h}
function cellHtml(c){
  var out='';
  for(var k=c.firstChild;k;k=k.nextSibling){
    if(k.nodeType===1){
      var tg=k.tagName.toLowerCase();
      if(SKIP.test(tg)||hidden(k))continue;
      if(tg==='table'){var tb=tableOf(k);if(tb)out+=tb.h;continue}
      if(/^(p|div|li|ul|ol|h[1-6]|blockquote|pre|section|tr|dd|dt)$/.test(tg)){
        var s=cellHtml(k);if(s){if(tg==='li')s='• '+s;out+=(out&&!/<br>$/.test(out)?'<br>':'')+s+'<br>'}continue}}
    out+=inl(k)}
  return trimH(out)}
function tableOf(t){
  var trs=[];
  for(var c=t.firstElementChild;c;c=c.nextElementSibling){
    var tg=c.tagName.toLowerCase();
    if(tg==='tr')trs.push(c);
    else if(/^(thead|tbody|tfoot)$/.test(tg))for(var r=c.firstElementChild;r;r=r.nextElementSibling)if(r.tagName.toLowerCase()==='tr')trs.push(r)}
  var rows=[];
  trs.forEach(function(tr){var row=[],inHead=tr.parentNode&&tr.parentNode.tagName.toLowerCase()==='thead';
    for(var c=tr.firstElementChild;c;c=c.nextElementSibling){
      var tg=c.tagName.toLowerCase();if(tg!=='td'&&tg!=='th')continue;
      var h=cellHtml(c);
      row.push({h:h,x:txt(h),cs:Math.min(50,+c.getAttribute('colspan')||1),rs:Math.min(200,+c.getAttribute('rowspan')||1),th:tg==='th'||inHead})}
    rows.push(row)});
  return rows.length?mkTable(rows):null}
function parseHTML(html){
  var doc=new DOMParser().parseFromString(html,'text/html'),B=[],buf='',cls='';
  function flush(){var h=trimH(buf);buf='';if(!h)return;var x=txt(h);
    if(x){var b={t:'p',h:h,x:x};if(cls)b.c=cls;B.push(b)}
    else h.replace(/<img [^>]*src="([^"]*)"[^>]*>/g,function(m,s){B.push({t:'img',src:unesc(s),x:''})})}
  function liOf(c,d,mk){
    var h='',subs=[],tabs=[];
    for(var k=c.firstChild;k;k=k.nextSibling){
      if(k.nodeType===1){var tg=k.tagName.toLowerCase();
        if(tg==='ul'||tg==='ol'){subs.push(k);continue}
        if(tg==='table'){var tb=tableOf(k);if(tb)tabs.push(tb);continue}
        if(/^(p|div|section)$/.test(tg)){var s=cellHtml(k);if(s)h+=(h?'<br>':'')+s;continue}}
      h+=inl(k)}
    h=trimH(h);var x=txt(h);
    if(x||/<img/.test(h))B.push({t:'li',d:Math.min(d,4),mk:mk,h:h,x:x});
    tabs.forEach(function(t){B.push(t)});
    subs.forEach(function(s){listOf(s,d+1)})}
  function listOf(l,d){
    var ord=l.tagName.toLowerCase()==='ol',n=+(l.getAttribute('start')||1);
    for(var c=l.firstElementChild;c;c=c.nextElementSibling){
      if(c.tagName.toLowerCase()!=='li'||hidden(c))continue;
      liOf(c,d,ord?(n++)+'.':['•','◦','▪'][d%3])}}
  function walk(n,d){
    for(var c=n.firstChild;c;c=c.nextSibling){
      if(c.nodeType===3){buf+=esc(c.nodeValue.replace(/\s+/g,' '));continue}
      if(c.nodeType!==1)continue;
      var tg=c.tagName.toLowerCase();
      if(SKIP.test(tg)||hidden(c))continue;
      if(tg==='br'){buf+='<br>';continue}
      if(/^h[1-6]$/.test(tg)){flush();var x=txt(inl(c));if(x)B.push({t:'h',l:Math.min(+tg[1],4),x:x});continue}
      if(tg==='table'){flush();var cap=c.querySelector('caption');if(cap){var ct=txt(inl(cap));if(ct)B.push({t:'p',x:ct,h:'<b>'+esc(ct)+'</b>'})}var tb=tableOf(c);if(tb)B.push(tb);continue}
      if(tg==='ul'||tg==='ol'){flush();listOf(c,0);continue}
      if(tg==='pre'){flush();var pt=c.textContent.replace(/\n+$/,'');if(pt.trim())B.push({t:'p',c:'pre',x:pt,h:esc(pt)});continue}
      if(tg==='blockquote'){flush();var sv=cls;cls='q';walk(c);flush();cls=sv;continue}
      if(tg==='svg'){buf+=svgTag(c);continue}
      if(tg==='img'){buf+=inl(c);continue}
      if(tg==='hr'){flush();continue}
      if(tg==='caption')continue;
      if(BLK.test(tg)){flush();walk(c);flush();continue}
      buf+=inl(c)}}
  walk(doc.body||doc.documentElement);flush();
  return B}

/* ---------- ZIP + DOCX (tableaux, listes, images, zones de texte, notes) ---------- */
function zipOpen(buf){
  var v=new DataView(buf),u=new Uint8Array(buf),i=buf.byteLength-22;
  while(i>=0&&v.getUint32(i,true)!==0x06054b50)i--;
  if(i<0)throw new Error('zip');
  var n=v.getUint16(i+10,true),p=v.getUint32(i+16,true),idx={};
  for(var k=0;k<n;k++){
    var nl=v.getUint16(p+28,true),el=v.getUint16(p+30,true),cl=v.getUint16(p+32,true);
    var nm=new TextDecoder().decode(u.subarray(p+46,p+46+nl));
    idx[nm]={m:v.getUint16(p+10,true),cs:v.getUint32(p+20,true),lo:v.getUint32(p+42,true)};
    p+=46+nl+el+cl}
  function bytes(name){var e=idx[name];if(!e)return Promise.resolve(null);
    var st=e.lo+30+v.getUint16(e.lo+26,true)+v.getUint16(e.lo+28,true),data=u.subarray(st,st+e.cs);
    if(e.m===0)return Promise.resolve(data);
    var ds=new DecompressionStream('deflate-raw'),w=ds.writable.getWriter();w.write(data);w.close();
    return new Response(ds.readable).arrayBuffer().then(function(b){return new Uint8Array(b)})}
  return{bytes:bytes,text:function(n){return bytes(n).then(function(b){return b?new TextDecoder().decode(b):null})}}}
function A(n,l){if(!n)return null;var a=n.attributes;for(var i=0;i<a.length;i++)if(a[i].localName===l)return a[i].value;return null}
function W(n,name){if(!n)return null;for(var c=n.firstElementChild;c;c=c.nextElementSibling)if(c.localName===name)return c;return null}
function isOn(rp,n){var e=W(rp,n);if(!e)return false;var v=A(e,'val');return!(v!==null&&/^(0|false|off|none)$/i.test(v))}
function alpha(n){var s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function roman(n){var r=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']],s='';r.forEach(function(p){while(n>=p[0]){s+=p[1];n-=p[0]}});return s}
function fmtNum(n,f){switch(f){case'decimalZero':return(n<10?'0':'')+n;case'lowerLetter':return alpha(n).toLowerCase();case'upperLetter':return alpha(n);case'lowerRoman':return roman(n).toLowerCase();case'upperRoman':return roman(n);default:return''+n}}
function normPath(p){var o=[];p.split('/').forEach(function(s){if(s==='..')o.pop();else if(s&&s!=='.')o.push(s)});return o.join('/')}
function parseDocx(buf){
  var Z=zipOpen(buf);
  return Promise.all(['word/document.xml','word/_rels/document.xml.rels','word/styles.xml','word/numbering.xml','word/footnotes.xml','word/endnotes.xml'].map(function(n){return Z.text(n)})).then(function(r){
    if(!r[0])throw new Error('docx');
    var XP=function(s){return s?new DOMParser().parseFromString(s,'application/xml'):null};
    var D=XP(r[0]),R=XP(r[1]),ST=XP(r[2]),NU=XP(r[3]),FN=XP(r[4]),EN=XP(r[5]);
    var rel={};
    if(R)Array.prototype.forEach.call(R.getElementsByTagName('Relationship'),function(e){
      if(/\/image$/.test(e.getAttribute('Type')||'')&&e.getAttribute('TargetMode')!=='External'){
        var t=e.getAttribute('Target')||'';rel[e.getAttribute('Id')]=t.charAt(0)==='/'?t.slice(1):normPath('word/'+t)}});
    var used={};r[0].replace(/\b\w+:(?:embed|id)="([^"]+)"/g,function(m,id){if(rel[id])used[id]=1});
    var imgs={},MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp'};
    var jobs=Object.keys(used).map(function(id){
      var mime=MIME[(rel[id].split('.').pop()||'').toLowerCase()];
      if(!mime){imgs[id]=null;return Promise.resolve()}
      return Z.bytes(rel[id]).then(function(b){return b?shrink(new Blob([b],{type:mime})):null}).then(function(u){imgs[id]=u},function(){imgs[id]=null})});
    return Promise.all(jobs).then(function(){return buildDocx(D,ST,NU,FN,EN,imgs)})})}
function buildDocx(D,ST,NU,FN,EN,imgs){
  /* styles */
  var sty={},sc={};
  if(ST)Array.prototype.forEach.call(ST.getElementsByTagNameNS('*','style'),function(s){
    var id=A(s,'styleId');if(!id)return;
    var pp=W(s,'pPr'),rp=W(s,'rPr'),ol=pp&&W(pp,'outlineLvl'),np=pp&&W(pp,'numPr'),ni=np&&W(np,'numId'),il=np&&W(np,'ilvl');
    sty[id]={n:A(W(s,'name'),'val')||'',b:A(W(s,'basedOn'),'val'),ol:ol?+A(ol,'val'):null,num:ni?A(ni,'val'):null,il:il?+A(il,'val'):null,r:{b:isOn(rp,'b'),i:isOn(rp,'i'),u:isOn(rp,'u')}}});
  function sInfo(id){
    if(sc[id])return sc[id];
    var o={h:0,num:null,il:0,r:{}},chain=[],k=id,g=0;
    while(k&&sty[k]&&g++<8){chain.push(sty[k]);k=sty[k].b}
    for(var j=chain.length-1;j>=0;j--){var s=chain[j],m=/^(?:heading|titre)\s*(\d)$/i.exec(s.n);
      if(m)o.h=+m[1];else if(/^(title|titre)$/i.test(s.n))o.h=1;else if(/^(subtitle|sous-titre)$/i.test(s.n))o.h=2;
      if(s.ol!==null)o.h=s.ol<9?s.ol+1:0;
      if(s.num!==null){o.num=s.num;if(s.il!==null)o.il=s.il}
      for(var f in s.r)if(s.r[f])o.r[f]=1}
    return sc[id]=o}
  /* numérotation */
  var absN={},numMap={},ctr={};
  if(NU){
    Array.prototype.forEach.call(NU.getElementsByTagNameNS('*','abstractNum'),function(an){
      var lv={};for(var l=an.firstElementChild;l;l=l.nextElementSibling){if(l.localName!=='lvl')continue;
        var st=W(l,'start');lv[+A(l,'ilvl')]={f:A(W(l,'numFmt'),'val')||'decimal',t:A(W(l,'lvlText'),'val')||'',s:st?+A(st,'val'):1}}
      absN[A(an,'abstractNumId')]=lv});
    Array.prototype.forEach.call(NU.getElementsByTagNameNS('*','num'),function(n){
      var ov={};for(var o=n.firstElementChild;o;o=o.nextElementSibling){if(o.localName!=='lvlOverride')continue;var so=W(o,'startOverride');if(so)ov[+A(o,'ilvl')]=+A(so,'val')}
      numMap[A(n,'numId')]={a:A(W(n,'abstractNumId'),'val'),ov:ov}})}
  function marker(numId,il){
    var nm=numMap[numId];if(!nm)return'•';
    var lvs=absN[nm.a]||{},lv=lvs[il];if(!lv)return'•';
    var c=ctr[numId]||(ctr[numId]=[]),st=nm.ov[il]!==undefined?nm.ov[il]:lv.s;
    c[il]=c[il]===undefined?st:c[il]+1;for(var j=il+1;j<10;j++)c[j]=undefined;
    if(lv.f==='bullet')return['•','◦','▪'][il%3];
    if(lv.f==='none')return'';
    var out=lv.t.replace(/%(\d)/g,function(m,d){var k=+d-1,L=lvs[k]||lv,v=c[k]===undefined?L.s:c[k];return fmtNum(v,L.f)});
    return out||(fmtNum(c[il],lv.f)+'.')}
  var fnRefs=[];
  function inTx(el,root){for(var p=el.parentNode;p&&p!==root;p=p.parentNode)if(p.localName==='txbxContent'||p.localName==='Fallback')return true;return false}
  function media(c,out){
    var ids=[],bl=c.getElementsByTagNameNS('*','blip'),im=c.getElementsByTagNameNS('*','imagedata'),i;
    for(i=0;i<bl.length;i++)if(!inTx(bl[i],c))ids.push(A(bl[i],'embed'));
    for(i=0;i<im.length;i++)if(!inTx(im[i],c))ids.push(A(im[i],'id'));
    ids.forEach(function(id){if(!id||imgs[id]===undefined)return;
      if(imgs[id])out.extra.push({t:'img',src:imgs[id],x:''});
      else out.extra.push({t:'p',h:'<i>[image non affichable]</i>',x:'[image non affichable]'})});
    var tb=c.getElementsByTagNameNS('*','txbxContent');
    for(i=0;i<tb.length;i++){if(inTx(tb[i],c))continue;
      var bs=blocksOf(tb[i]);bs.forEach(function(b){out.extra.push(b)})}}
  function runOf(rn,out){
    var rp=W(rn,'rPr'),fl={b:isOn(rp,'b'),i:isOn(rp,'i'),u:isOn(rp,'u')&&!/^none$/i.test(A(W(rp,'u'),'val')||''),s:isOn(rp,'strike')||isOn(rp,'dstrike')};
    var rs=rp&&W(rp,'rStyle');if(rs){var ri=sInfo(A(rs,'val')).r;if(ri.b)fl.b=true;if(ri.i)fl.i=true;if(ri.u)fl.u=true}
    var va=rp&&W(rp,'vertAlign'),vv=va&&A(va,'val'),hl=rp&&W(rp,'highlight'),hv=hl&&A(hl,'val'),s='',t='';
    (function vis(n){
      for(var c=n.firstElementChild;c;c=c.nextElementSibling){var l=c.localName;
        if(l==='t'){s+=esc(c.textContent);t+=c.textContent}
        else if(l==='tab'||l==='ptab'){s+='\u2003';t+=' '}
        else if(l==='br'||l==='cr'){var ty=A(c,'type');if(ty!=='page'&&ty!=='column'){s+='<br>';t+=' '}}
        else if(l==='noBreakHyphen'){s+='\u2011';t+='-'}
        else if(l==='footnoteReference'||l==='endnoteReference'){fnRefs.push({k:l==='endnoteReference'?'e':'f',id:A(c,'id')});var nn=fnRefs.length;s+='<sup>['+nn+']</sup>';t+='['+nn+']'}
        else if(l==='drawing'||l==='pict'||l==='object')media(c,out);
        else if(l==='AlternateContent'){var ch=null,fb=null;for(var k=c.firstElementChild;k;k=k.nextElementSibling){if(k.localName==='Choice')ch=k;else if(k.localName==='Fallback')fb=k}vis(ch||fb||c)}}})(rn);
    if(!s)return;
    if(vv==='superscript')s='<sup>'+s+'</sup>';else if(vv==='subscript')s='<sub>'+s+'</sub>';
    if(fl.s)s='<s>'+s+'</s>';if(fl.u)s='<u>'+s+'</u>';if(fl.i)s='<i>'+s+'</i>';if(fl.b)s='<b>'+s+'</b>';
    if(hv&&hv!=='none')s='<span class="hl">'+s+'</span>';
    out.h+=s;out.x+=t}
  var INL=/^(hyperlink|smartTag|ins|moveTo|fldSimple|sdt|sdtContent|customXml|dir|bdo)$/;
  function inlineKids(n,out){
    for(var c=n.firstElementChild;c;c=c.nextElementSibling){var l=c.localName;
      if(l==='r')runOf(c,out);
      else if(INL.test(l))inlineKids(c,out);
      else if(l==='AlternateContent'){var ch=null,fb=null;for(var k=c.firstElementChild;k;k=k.nextElementSibling){if(k.localName==='Choice')ch=k;else if(k.localName==='Fallback')fb=k}inlineKids(ch||fb||c,out)}
      else if(l==='oMath'||l==='oMathPara'){var tx=c.textContent;out.h+=esc(tx);out.x+=tx}}
    return out}
  function paraBlocks(p,B){
    var pPr=W(p,'pPr'),ps=pPr&&W(pPr,'pStyle'),si=sInfo(ps?A(ps,'val'):'Normal'),np=pPr&&W(pPr,'numPr'),numId=null,il=0;
    if(np){var ni=W(np,'numId'),li=W(np,'ilvl');numId=ni?A(ni,'val'):null;il=li?+A(li,'val'):0;if(numId===null&&si.num){numId=si.num}}
    else if(si.num){numId=si.num;il=si.il||0}
    var mk=(numId&&numId!=='0')?marker(numId,il):null;
    var o=inlineKids(p,{h:'',x:'',extra:[]}),hl=si.h,ol=pPr&&W(pPr,'outlineLvl');
    if(ol){var v=+A(ol,'val');hl=v<9?v+1:0}
    var x=o.x.replace(/\s+/g,' ').trim();
    if(x){
      if(hl)B.push({t:'h',l:Math.min(hl,4),x:(mk?mk+' ':'')+x});
      else if(mk!==null)B.push({t:'li',d:Math.min(il,4),mk:mk,x:x,h:trimH(o.h)});
      else B.push({t:'p',x:x,h:trimH(o.h)})}
    o.extra.forEach(function(b){B.push(b)})}
  function tableBlock(tbl,B){
    var rows=[],open={};
    for(var tr=tbl.firstElementChild;tr;tr=tr.nextElementSibling){
      if(tr.localName!=='tr')continue;
      var trp=W(tr,'trPr'),hdr=!!(trp&&W(trp,'tblHeader')),row=[],col=0,gb=trp&&W(trp,'gridBefore');
      if(gb)col+=+A(gb,'val')||0;
      for(var tc=tr.firstElementChild;tc;tc=tc.nextElementSibling){
        if(tc.localName!=='tc')continue;
        var tp=W(tc,'tcPr'),gs=tp&&W(tp,'gridSpan'),cs=gs?(+A(gs,'val')||1):1,vm=tp&&W(tp,'vMerge');
        if(vm&&A(vm,'val')!=='restart'){var op=open[col];if(op)op.rs++;col+=cs;continue}
        var bs=blocksOf(tc),cell={h:blocksHtml(bs),x:bs.map(function(b){return b.x||''}).join(' ').trim(),cs:cs,rs:1,th:hdr};
        row.push(cell);open[col]=vm?cell:null;col+=cs}
      rows.push(row)}
    if(rows.length)B.push(mkTable(rows))}
  function blocksOf(root){
    var B=[];
    for(var c=root.firstElementChild;c;c=c.nextElementSibling){var l=c.localName;
      if(l==='p')paraBlocks(c,B);
      else if(l==='tbl')tableBlock(c,B);
      else if(l==='sdt'){var sc2=W(c,'sdtContent');if(sc2)blocksOf(sc2).forEach(function(b){B.push(b)})}
      else if(l==='customXml'||l==='ins'||l==='moveTo')blocksOf(c).forEach(function(b){B.push(b)})}
    return B}
  var body=D.getElementsByTagNameNS('*','body')[0];
  var B=blocksOf(body);
  if(fnRefs.length){
    var fm={f:{},e:{}};
    [[FN,'footnote','f'],[EN,'endnote','e']].forEach(function(a){if(!a[0])return;
      Array.prototype.forEach.call(a[0].getElementsByTagNameNS('*',a[1]),function(el){fm[a[2]][A(el,'id')]=blocksOf(el)})});
    var notes=[];
    fnRefs.forEach(function(rf,k){var bs=fm[rf.k][rf.id]||[],h=bs.map(function(b){return b.h||esc(b.x||'')}).join(' '),x=bs.map(function(b){return b.x||''}).join(' ').trim();
      if(x)notes.push({t:'p',x:'['+(k+1)+'] '+x,h:'<sup>['+(k+1)+']</sup> '+h})});
    if(notes.length){B.push({t:'h',l:2,x:'Notes'});notes.forEach(function(b){B.push(b)})}}
  return{blocks:B}}

/* ---------- PowerPoint (.pptx) : diapositives, tableaux, images, puces, notes ---------- */
function parsePptx(buf){
  var Z=zipOpen(buf),XP=function(s){return s?new DOMParser().parseFromString(s,'application/xml'):null};
  function relMap(x){var m={};if(x)Array.prototype.forEach.call(x.getElementsByTagName('Relationship'),function(e){m[e.getAttribute('Id')]={t:e.getAttribute('Type')||'',g:e.getAttribute('Target')||'',ext:e.getAttribute('TargetMode')==='External'}});return m}
  return Promise.all([Z.text('ppt/presentation.xml'),Z.text('ppt/_rels/presentation.xml.rels')]).then(function(r){
    if(!r[0])throw new Error('pptx');
    var P=XP(r[0]),R=relMap(XP(r[1])),paths=[],ids=P.getElementsByTagNameNS('*','sldId');
    for(var i=0;i<ids.length;i++){var at=ids[i].attributes,rid=null;for(var q=0;q<at.length;q++)if(at[q].localName==='id'&&/relationships/.test(at[q].namespaceURI||''))rid=at[q].value;var rl=R[rid];if(rl&&!rl.ext)paths.push(rl.g.charAt(0)==='/'?rl.g.slice(1):normPath('ppt/'+rl.g))}
    if(!paths.length)throw new Error('pptx vide');
    var B=[],chain=Promise.resolve();
    paths.forEach(function(path,idx){chain=chain.then(function(){
      toast('Lecture du PowerPoint… '+(idx+1)+'/'+paths.length);
      var dir=path.replace(/[^/]+$/,''),file=path.split('/').pop();
      return Promise.all([Z.text(path),Z.text(dir+'_rels/'+file+'.rels')]).then(function(s){
        if(!s[0])return;
        var rel=relMap(XP(s[1])),used={},MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',bmp:'image/bmp',webp:'image/webp'},imgs={};
        s[0].replace(/\b\w+:(?:embed|id)="([^"]+)"/g,function(m,id){if(rel[id]&&/\/image$/.test(rel[id].t)&&!rel[id].ext)used[id]=1});
        var jobs=Object.keys(used).map(function(id){
          var pth=rel[id].g.charAt(0)==='/'?rel[id].g.slice(1):normPath(dir+rel[id].g),mime=MIME[(pth.split('.').pop()||'').toLowerCase()];
          if(!mime){imgs[id]=null;return Promise.resolve()}
          return Z.bytes(pth).then(function(b){return b?shrink(new Blob([b],{type:mime})):null}).then(function(u){imgs[id]=u},function(){imgs[id]=null})});
        var notePath=null;for(var k in rel)if(/\/notesSlide$/.test(rel[k].t))notePath=normPath(dir+rel[k].g);
        return Promise.all(jobs.concat([notePath?Z.text(notePath):Promise.resolve(null)])).then(function(res){
          var nx=res[res.length-1];
          slideBlocks(XP(s[0]),imgs,nx?XP(nx):null,idx+1,B)})})})});
    return chain.then(function(){return{blocks:B}})})}
function slideBlocks(D,imgs,N,num,B){
  var ctr;
  function phOf(sp){var ph=sp.getElementsByTagNameNS('*','ph')[0];return ph?{t:A(ph,'type')||'',i:A(ph,'idx')}:null}
  function posOf(n){var x=null,k;
    for(k=n.firstElementChild;k;k=k.nextElementSibling){if(/^(spPr|grpSpPr)$/.test(k.localName)||k.localName==='xfrm'){x=k.localName==='xfrm'?k:W(k,'xfrm');if(x)break}}
    var o=x&&W(x,'off');return o?{y:+A(o,'y')||0,x:+A(o,'x')||0}:{y:0,x:0}}
  function parasOf(tx,isBody,out){
    ctr=[];
    for(var p=tx.firstElementChild;p;p=p.nextElementSibling){
      if(p.localName!=='p')continue;
      var pr=W(p,'pPr'),lvl=pr?(+A(pr,'lvl')||0):0,h='',t='';
      for(var c=p.firstElementChild;c;c=c.nextElementSibling){
        var l=c.localName;
        if(l==='br'){h+='<br>';t+=' '}
        else if(l==='r'||l==='fld'){
          var tn=W(c,'t'),s=tn?tn.textContent:'';if(!s)continue;
          var rp=W(c,'rPr'),e=esc(s);
          if(rp){var bl=+A(rp,'baseline')||0,u=A(rp,'u');
            if(bl>0)e='<sup>'+e+'</sup>';else if(bl<0)e='<sub>'+e+'</sub>';
            if(/strike/i.test(A(rp,'strike')||''))e='<s>'+e+'</s>';
            if(u&&u!=='none')e='<u>'+e+'</u>';
            if(A(rp,'i')==='1')e='<i>'+e+'</i>';
            if(A(rp,'b')==='1')e='<b>'+e+'</b>'}
          h+=e;t+=s}}
      h=trimH(h);var x=t.replace(/\s+/g,' ').trim();if(!x)continue;
      var mk=null;
      if(pr&&!W(pr,'buNone')){
        var bc=W(pr,'buChar'),ba=W(pr,'buAutoNum');
        if(ba){ctr[lvl]=(ctr[lvl]||0)+1;for(var j=lvl+1;j<9;j++)ctr[j]=0;
          var ty=A(ba,'type')||'arabicPeriod',n=ctr[lvl];
          mk=/alpha/i.test(ty)?(/Uc/.test(ty)?alpha(n):alpha(n).toLowerCase()):/roman/i.test(ty)?(/Uc/.test(ty)?roman(n):roman(n).toLowerCase()):''+n;
          mk+=/Paren/.test(ty)?(/Both/.test(ty)?')':')'):'.'}
        else if(bc)mk=['•','◦','▪'][lvl%3];
        else if(isBody)mk=['•','◦','▪'][lvl%3]}
      else if(!pr&&isBody)mk='•';
      out.push(mk!==null?{t:'li',d:Math.min(lvl,4),mk:mk,x:x,h:h}:{t:'p',x:x,h:h})}}
  function tableOfFrame(tbl){
    var rows=[],fr=W(tbl,'tblPr'),first=fr&&A(fr,'firstRow')==='1';
    for(var tr=tbl.firstElementChild;tr;tr=tr.nextElementSibling){
      if(tr.localName!=='tr')continue;var row=[];
      for(var tc=tr.firstElementChild;tc;tc=tc.nextElementSibling){
        if(tc.localName!=='tc')continue;
        if(A(tc,'hMerge')==='1'||A(tc,'vMerge')==='1'){continue}
        var tx=W(tc,'txBody'),ps=[];if(tx)parasOf(tx,false,ps);
        row.push({h:ps.map(function(b){return b.h}).join('<br>'),x:ps.map(function(b){return b.x}).join(' '),cs:+A(tc,'gridSpan')||1,rs:+A(tc,'rowSpan')||1,th:!!first&&rows.length===0})}
      rows.push(row)}
    return rows.length?mkTable(rows):null}
  function items(tree,out){
    for(var c=tree.firstElementChild;c;c=c.nextElementSibling){
      var l=c.localName,pos=posOf(c),bl=[];
      if(l==='sp'){
        var tx=W(c,'txBody'),ph=phOf(c);
        if(ph&&/^(sldNum|dt|ftr|hdr)$/.test(ph.t))continue;
        if(tx){var isT=ph&&/^(title|ctrTitle)$/.test(ph.t),body=ph&&!isT&&(ph.t===''||/^(body|obj)$/.test(ph.t));
          var ps=[];parasOf(tx,!!body,ps);
          if(isT&&ps.length){out.push({y:-1,x:0,title:ps.map(function(b){return b.x}).join(' '),b:[]});continue}
          bl=ps}}
      else if(l==='pic'){
        var bp=c.getElementsByTagNameNS('*','blip')[0],id=bp&&A(bp,'embed');
        if(id&&imgs[id])bl=[{t:'img',src:imgs[id],x:''}];else if(id)bl=[{t:'p',x:'[image non affichable]',h:'<i>[image non affichable]</i>'}]}
      else if(l==='graphicFrame'){
        var xf=W(c,'xfrm'),o=xf&&W(xf,'off');if(o)pos={y:+A(o,'y')||0,x:+A(o,'x')||0};
        var tb=c.getElementsByTagNameNS('*','tbl')[0];
        if(tb){var t=tableOfFrame(tb);if(t)bl=[t]}
        else if(c.getElementsByTagNameNS('*','chart').length)bl=[{t:'p',x:'[graphique non affiché]',h:'<i>[graphique non affiché]</i>'}]
        else if(c.getElementsByTagNameNS('*','relIds').length)bl=[{t:'p',x:'[schéma SmartArt non affiché]',h:'<i>[schéma SmartArt non affiché]</i>'}]}
      else if(l==='grpSp'){var sub=[];items(c,sub);sub.forEach(function(s){s.y=pos.y;s.x=Math.max(pos.x,0)+s.x*0;out.push(s)});continue}
      else if(l==='AlternateContent'){var ch=W(c,'Choice');if(ch)items(ch,out);continue}
      if(bl.length)out.push({y:pos.y,x:pos.x,b:bl})}}
  var tree=D.getElementsByTagNameNS('*','spTree')[0],out=[];
  if(tree)items(tree,out);
  var title='';out.forEach(function(o){if(o.title&&!title)title=o.title});
  var rest=out.filter(function(o){return!o.title&&o.b.length});
  rest.forEach(function(o,i){o.i=i});
  rest.sort(function(a,b){return Math.abs(a.y-b.y)>200000?a.y-b.y:(a.x!==b.x?a.x-b.x:a.i-b.i)});
  if(!title){for(var q=0;q<rest.length;q++){var f0=rest[q].b[0];
    if(f0&&f0.t==='p'&&f0.x.length<90){title=f0.x;rest[q].b.shift();break}
    if(f0&&f0.t!=='p')break}}
  B.push({t:'h',l:1,x:num+'. '+(title||'Diapositive '+num)});
  rest.forEach(function(o){o.b.forEach(function(b){B.push(b)})});
  if(N){var nt=[],sps=N.getElementsByTagNameNS('*','sp');
    for(var i=0;i<sps.length;i++){var ph=phOf(sps[i]);if(ph&&ph.t==='body'){var tx=W(sps[i],'txBody');if(tx){var ps=[];parasOf(tx,false,ps);ps.forEach(function(p){nt.push(p.x)})}}}
    var ntx=nt.join(' ').trim();
    if(ntx)B.push({t:'p',x:'Notes : '+ntx,h:'<i><b>Notes :</b> '+esc(ntx)+'</i>'})}}

/* ---------- PDF : texte + tableaux + schémas/images + pages d'origine ---------- */
function loadPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  return new Promise(function(ok,ko){var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload=function(){pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';ok(pdfjsLib)};
    s.onerror=ko;document.head.appendChild(s)})}
var PDF_MAXG=80;
function cropCv(cv,r,q){var c=document.createElement('canvas');c.width=Math.max(1,r.x1-r.x0);c.height=Math.max(1,r.y1-r.y0);c.getContext('2d').drawImage(cv,r.x0,r.y0,c.width,c.height,0,0,c.width,c.height);var u=c.toDataURL('image/jpeg',q||.86);c.width=c.height=0;return u}
function pdfCellText(its){
  its=its.slice().sort(function(a,b){return Math.abs(a.vy-b.vy)>a.hp*.5?a.vy-b.vy:a.vx-b.vx});
  var lines=[],L=null;
  its.forEach(function(i){
    if(L&&Math.abs(L.vy-i.vy)<=i.hp*.5){L.t+=(i.vx-L.ex>i.hp*.15?' ':'')+i.s;L.ex=i.vx+i.w}
    else{L={vy:i.vy,t:i.s,ex:i.vx+i.w};lines.push(L)}});
  return lines.map(function(l){return l.t.replace(/\s+/g,' ').trim()}).filter(Boolean)}
/* grille d'un tableau à partir des traits dessinés (pixels hors texte) */
function pdfGrid(d,W,H,r,its){
  function dk(x,y){if(x<0||y<0||x>=W||y>=H)return false;var p=(y*W+x)*4;return d[p]<205||d[p+1]<205||d[p+2]<205}
  function cl(a){var o=[];a.sort(function(x,y){return x-y}).forEach(function(v){if(o.length&&v-o[o.length-1]<7)o[o.length-1]=(o[o.length-1]+v)/2;else o.push(v)});return o}
  function scan(horiz,a0,a1,b0,b1,thr){
    var out=[],run=null;
    for(var a=a0;a<a1;a++){var c=0;for(var b=b0;b<b1;b++)if(horiz?dk(b,a):dk(a,b))c++;
      if(c>=thr*(b1-b0)){if(run&&a===run.e+1)run.e=a;else{run={s:a,e:a};out.push(run)}}}
    return out.filter(function(q){return q.e-q.s<8}).map(function(q){return(q.s+q.e)/2})}
  var rw=r.x1-r.x0,rh=r.y1-r.y0,hl=cl(scan(true,r.y0,r.y1,r.x0,r.x1,.55)),vl=cl(scan(false,r.x0,r.x1,r.y0,r.y1,.55));
  if(!hl.length||hl[0]-r.y0>8)hl.unshift(r.y0);if(r.y1-hl[hl.length-1]>8)hl.push(r.y1);
  if(!vl.length||vl[0]-r.x0>8)vl.unshift(r.x0);if(r.x1-vl[vl.length-1]>8)vl.push(r.x1);
  var nr=hl.length-1,nc=vl.length-1;
  if(nr<1||nc<1||nr*nc<2||nr>80||nc>20)return null;
  function frac(x0,y0,x1,y1){var n=0,t=0,i,k;
    if(x0===x1){for(i=Math.ceil(y0);i<=y1;i++){t++;for(k=-2;k<=2;k++)if(dk(Math.round(x0)+k,i)){n++;break}}}
    else{for(i=Math.ceil(x0);i<=x1;i++){t++;for(k=-2;k<=2;k++)if(dk(i,Math.round(y0)+k)){n++;break}}}
    return t?n/t:1}
  var cov=[],cells=[],rr,cc,k;
  for(rr=0;rr<nr;rr++){cov.push([]);for(cc=0;cc<nc;cc++)cov[rr].push(-1)}
  for(rr=0;rr<nr;rr++)for(cc=0;cc<nc;cc++){
    if(cov[rr][cc]>=0)continue;
    var cs=1,rs=1;
    while(cc+cs<nc&&cov[rr][cc+cs]<0&&frac(vl[cc+cs],hl[rr]+3,vl[cc+cs],hl[rr+1]-3)<.4)cs++;
    while(rr+rs<nr){var gap=true;
      for(k=cc;k<cc+cs;k++){if(cov[rr+rs][k]>=0||frac(vl[k]+3,hl[rr+rs],vl[k+1]-3,hl[rr+rs])>=.4){gap=false;break}}
      if(!gap)break;rs++}
    var id=cells.length;cells.push({r:rr,c:cc,cs:cs,rs:rs,its:[]});
    for(var a=rr;a<rr+rs;a++)for(var b=cc;b<cc+cs;b++)cov[a][b]=id}
  its.forEach(function(i){
    var cx=i.vx+i.w/2,cy=i.vy-i.hp*.35,c2=0,r2=0;
    for(k=0;k<nc;k++)if(cx>=vl[k])c2=k;
    for(k=0;k<nr;k++)if(cy>=hl[k])r2=k;
    cells[cov[r2][c2]].its.push(i)});
  var rows=[];for(rr=0;rr<nr;rr++)rows.push([]);
  cells.forEach(function(c){var ls=pdfCellText(c.its);
    rows[c.r].push({c:c.c,h:ls.map(esc).join('<br>'),x:ls.join(' '),cs:c.cs,rs:c.rs})});
  rows.forEach(function(r){r.sort(function(a,b){return a.c-b.c})});
  var hdr=nr>=2&&rows[0].length>=2&&rows[0].every(function(c){return c.x});
  rows[0].forEach(function(c){c.th=hdr});
  return mkTable(rows)}
function pdfAnalyse(cv,it,sc,lines){
  var W=cv.width,H=cv.height,m=document.createElement('canvas');m.width=W;m.height=H;
  var mg=m.getContext('2d',{willReadFrequently:true});mg.drawImage(cv,0,0);mg.fillStyle='#fff';
  it.forEach(function(i){mg.fillRect(Math.floor(i.vx-2),Math.floor(i.vy-i.hp*.98-2),Math.ceil(i.w+4),Math.ceil(i.hp*1.3+4))});
  var d=mg.getImageData(0,0,W,H).data,G=6,gw=Math.ceil(W/G),gh=Math.ceil(H/G),ink=new Uint8Array(gw*gh),x,y;
  for(y=0;y<H;y++){var row=y*W*4,gy=((y/G)|0)*gw;for(x=0;x<W;x++){var p=row+x*4;if(d[p]<205||d[p+1]<205||d[p+2]<205)ink[gy+((x/G)|0)]=1}}
  var D=2,dil=new Uint8Array(gw*gh),gx,dy,dx,yy,xx;
  for(gy=0;gy<gh;gy++)for(gx=0;gx<gw;gx++)if(ink[gy*gw+gx])for(dy=-D;dy<=D;dy++)for(dx=-D;dx<=D;dx++){yy=gy+dy;xx=gx+dx;if(yy>=0&&yy<gh&&xx>=0&&xx<gw)dil[yy*gw+xx]=1}
  var lab=new Int32Array(gw*gh),comps=[],cnt=0,s0;
  for(s0=0;s0<gw*gh;s0++){
    if(!dil[s0]||lab[s0])continue;
    var st=[s0],bx0=1e9,by0=1e9,bx1=-1,by1=-1,n=0;lab[s0]=++cnt;
    while(st.length){var q=st.pop(),qx=q%gw,qy=(q/gw)|0;
      if(ink[q]){n++;if(qx<bx0)bx0=qx;if(qx>bx1)bx1=qx;if(qy<by0)by0=qy;if(qy>by1)by1=qy}
      for(dy=-1;dy<=1;dy++)for(dx=-1;dx<=1;dx++){xx=qx+dx;yy=qy+dy;if(xx<0||yy<0||xx>=gw||yy>=gh)continue;var k=yy*gw+xx;if(dil[k]&&!lab[k]){lab[k]=cnt;st.push(k)}}}
    if(n)comps.push({x0:bx0*G,y0:by0*G,x1:Math.min(W,(bx1+1)*G),y1:Math.min(H,(by1+1)*G),n:n})}
  comps=comps.filter(function(c){var w=c.x1-c.x0,h=c.y1-c.y0;
    return w>=50&&h>=40&&c.n/((w/G)*(h/G))>=.02&&!(w>.92*W&&h>.92*H)});
  comps.sort(function(a,b){return(b.x1-b.x0)*(b.y1-b.y0)-(a.x1-a.x0)*(a.y1-a.y0)});
  comps=comps.slice(0,12).sort(function(a,b){return a.y0-b.y0});
  var regs=comps.map(function(c){
    var its=it.filter(function(i){var cx=i.vx+i.w/2,cy=i.vy-i.hp*.35;return cx>=c.x0-4&&cx<=c.x1+4&&cy>=c.y0-4&&cy<=c.y1+4});
    var pad={x0:Math.max(0,c.x0-8),y0:Math.max(0,c.y0-8),x1:Math.min(W,c.x1+8),y1:Math.min(H,c.y1+8)};
    var url=cropCv(cv,pad),tb=null;
    try{tb=pdfGrid(d,W,H,c,its)}catch(e){tb=null}
    var all=pdfCellText(its).join(' '),b;
    if(tb){tb.o=url;b=tb}else b={t:'img',src:url,x:all};
    return{x0:pad.x0,y0:pad.y0,x1:pad.x1,y1:pad.y1,b:b}});
  lines.forEach(function(L){var cx=(L.items[0].vx+L.items[L.items.length-1].vx+L.items[L.items.length-1].w)/2,cy=L.vy-L.h*sc*.35;
    for(var i=0;i<regs.length;i++){var r=regs[i];if(cx>=r.x0&&cx<=r.x1&&cy>=r.y0&&cy<=r.y1){L.cons=1;break}}});
  var tw=Math.min(1000,W),th=document.createElement('canvas');th.width=tw;th.height=Math.round(H*tw/W);
  var tg=th.getContext('2d');tg.fillStyle='#fff';tg.fillRect(0,0,th.width,th.height);tg.drawImage(cv,0,0,th.width,th.height);
  var pg=th.toDataURL('image/jpeg',.72);th.width=th.height=0;m.width=m.height=0;
  return{regs:regs,pg:pg}}
function pdfPage(pg,n,total){
  var v1=pg.getViewport({scale:1}),sc=Math.min(3,Math.max(1,1200/v1.width)),vp=pg.getViewport({scale:sc});
  return pg.getTextContent().then(function(c){
    var it=c.items.filter(function(i){return i.str&&i.str.trim()}).map(function(i){
      var p=vp.convertToViewportPoint(i.transform[4],i.transform[5]),h=Math.abs(i.transform[3])||i.height||10,w=i.width||i.str.length*h*.5;
      return{s:i.str,x:i.transform[4],y:i.transform[5],h:h,vx:p[0],vy:p[1],w:w*sc,hp:h*sc}});
    it.sort(function(a,b){return Math.abs(a.y-b.y)>2?b.y-a.y:a.x-b.x});
    var lines=[];
    it.forEach(function(i){var L=lines[lines.length-1];
      if(L&&Math.abs(L.y-i.y)<=2.5){L.t+=(i.x-L.ex>1.5?' ':'')+i.s;L.ex=i.x+i.s.length*i.h*.5;L.h=Math.max(L.h,i.h);L.items.push(i)}
      else lines.push({t:i.s,y:i.y,h:i.h,ex:i.x+i.s.length*i.h*.5,items:[i],vy:i.vy})});
    var PD={lines:lines,regs:[],sc:sc,pg:null};
    if(n>PDF_MAXG)return PD;
    var cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);
    var g=cv.getContext('2d',{willReadFrequently:true});g.fillStyle='#fff';g.fillRect(0,0,cv.width,cv.height);
    return pg.render({canvasContext:g,canvas:cv,viewport:vp}).promise.then(function(){
      try{var a=pdfAnalyse(cv,it,sc,lines);PD.regs=a.regs;PD.pg=a.pg}catch(e){console.warn('Analyse PDF :',e)}
      cv.width=cv.height=0;return PD},function(){return PD})})}
function parsePdf(buf){
  return loadPdfJs().then(function(lib){return lib.getDocument({data:buf}).promise}).then(function(pdf){
    var pages=[],chain=Promise.resolve();
    for(var n=1;n<=pdf.numPages;n++)(function(n){chain=chain.then(function(){
      toast('Lecture du PDF… '+n+'/'+pdf.numPages);
      return pdf.getPage(n).then(function(pg){return pdfPage(pg,n,pdf.numPages)}).then(function(pd){pages.push(pd)})})})(n);
    return chain.then(function(){return pages})}).then(function(pages){
    var freq={},rep={};
    pages.forEach(function(P){var seen={};P.lines.forEach(function(L){var k=Math.round(L.h);freq[k]=(freq[k]||0)+L.t.length;
      var key=L.t.replace(/\d+/g,'#').trim();if(!seen[key]){seen[key]=1;rep[key]=(rep[key]||0)+1}})});
    var body=10,mx=0;for(var k in freq)if(freq[k]>mx){mx=freq[k];body=+k}
    var B=[],buf=[],last=null;
    function flush(){if(buf.length){var s=buf.join(' ').replace(/(\w)- (\w)/g,'$1$2').replace(/\s+/g,' ').trim();B.push({t:'p',x:s,h:esc(s)});buf=[]}}
    pages.forEach(function(P){last=null;var regs=P.regs,ri=0;
      function put(lim){while(ri<regs.length&&regs[ri].y0<=lim){flush();B.push(regs[ri].b);last=null;ri++}}
      P.lines.forEach(function(L){
        put(L.vy-L.h*P.sc+3);
        if(L.cons)return;
        var t=L.t.trim(),key=t.replace(/\d+/g,'#');
        if(!t||/^\d{1,3}$/.test(t)||(pages.length>=3&&rep[key]>=pages.length*.5&&t.length<80))return;
        var r=L.h/body,lv=0;
        if(t.length<130&&r>=1.15)lv=r>=1.6?1:r>=1.3?2:3;
        else if(t.length<90&&!/[.;,:]$/.test(t)&&(/^(\d+(\.\d+)*[.)]?\s+\S)/.test(t)||/^(chapitre|partie|section|le[cç]on|unité|module|introduction|conclusion)\b/i.test(t)||(t.length>3&&t===t.toUpperCase()&&/[A-ZÀ-Ý]{3}/.test(t))))lv=/^\d+\.\d+/.test(t)?2:1;
        if(lv){flush();var pv=B[B.length-1];
          if(pv&&pv.t==='h'&&pv.l===lv&&!buf.length&&last&&last.h===L.h&&last.hd)pv.x+=' '+t;else B.push({t:'h',l:lv,x:t});
          last={h:L.h,y:L.y,hd:1};return}
        if(last&&!last.hd&&last.y-L.y>L.h*1.9)flush();
        if(last&&last.hd)flush();
        buf.push(t);last={h:L.h,y:L.y,hd:0}});
      put(1e9);flush()});
    var pg=pages.map(function(p){return p.pg}).filter(Boolean);
    if(!B.length&&pg.length)B=pg.map(function(u,i){return{t:'img',src:u,x:'Page '+(i+1)}});
    return{blocks:B,pg:pg}})}

/* ---------- Import ---------- */
function addLesson(name,B,extra){
  if(!B.length){toast('Aucun contenu trouvé dans ce fichier');return}
  var l={id:'l'+Date.now(),name:name,blocks:B,stars:[],pos:0};
  if(extra&&extra.pg&&extra.pg.length)l.pg=extra.pg;
  S.lessons.unshift(l);S.cur=l.id;S.view='text';
  saveLesson(l).then(saveMeta);render();
  var nh=0,nt=0,ni=0;B.forEach(function(b){if(b.t==='h')nh++;else if(b.t==='tbl')nt++;else if(b.t==='img')ni++});
  toast(nh+' titres, '+nt+' tableau'+(nt>1?'x':'')+', '+ni+' image'+(ni>1?'s':''))}
function addRes(n){return function(r){addLesson(n,r.blocks,r)}}
function importFile(f){
  var n=f.name.replace(/\.[^.]+$/,''),ext=(f.name.split('.').pop()||'').toLowerCase(),bad=function(m){return function(e){console.error(e);toast(m)}};
  if(f.type==='application/pdf')ext='pdf';
  else if(/^image\//.test(f.type)&&!/^(png|jpe?g|webp|gif|bmp)$/.test(ext))ext='png';
  else if(!/^(pdf|docx|pptx|ppt|txt|md|markdown|html|htm|csv|tsv|json|png|jpe?g|webp|gif|bmp)$/.test(ext)&&f.type&&f.type.indexOf('text')!==0){toast('Format non pris en charge : utilise PDF, DOCX, PPTX, TXT, MD, HTML, CSV ou une image');return}
  if(ext==='pptx')f.arrayBuffer().then(parsePptx).then(addRes(n)).catch(bad('Impossible de lire ce .pptx'));
  else if(ext==='ppt')toast('Ancien format .ppt non pris en charge : enregistre-le en .pptx ou en PDF');
  else if(ext==='docx')f.arrayBuffer().then(parseDocx).then(addRes(n)).catch(bad('Impossible de lire ce .docx'));
  else if(ext==='pdf')f.arrayBuffer().then(parsePdf).then(addRes(n)).catch(bad('Impossible de lire ce PDF (connexion requise la 1re fois)'));
  else if(/^(png|jpe?g|webp|gif|bmp)$/.test(ext))shrink(f,1800).then(function(u){if(u)addLesson(n,[{t:'img',src:u,x:n}]);else toast('Image illisible')});
  else f.text().then(function(t){
    var B;
    if(ext==='csv'||ext==='tsv')B=parseCSV(t.replace(/\r/g,''));
    else if(ext==='json'){try{t=JSON.stringify(JSON.parse(t),null,2)}catch(e){}B=[{t:'p',c:'pre',x:t,h:esc(t)}]}
    else if(/^(htm|html)$/.test(ext)||/^\s*<(!doctype|html)/i.test(t))B=parseHTML(t);
    else B=parseText(t);
    addLesson(n,B)})}

/* ---------- Affichage ---------- */
var body=$('#stBody');
function fill(e,b){
  e.textContent='';
  if(b.t==='img'){var im=document.createElement('img');im.alt=b.x||'';im.loading='lazy';im.src=b.src;e.appendChild(im);return}
  if(b.t==='tbl'){e.innerHTML=b.h;
    if(b.o){var bt=document.createElement('button');bt.type='button';bt.className='st-orig';bt.dataset.orig='1';bt.textContent='📷 Voir l’original';e.appendChild(bt);
      var oi=document.createElement('img');oi.className='oimg';oi.loading='lazy';oi.src=b.o;e.appendChild(oi)}
    return}
  if(b.h)e.innerHTML=b.h;else e.textContent=b.x}
function render(){
  var l=lesson();body.textContent='';body.style.fontSize=S.fs+'rem';S.hits=[];S.hi=-1;$('#stCnt').textContent='';
  $('#stTitle').textContent=l?l.name:'Étudier';
  var pb=document.querySelector('.st-chip[data-a="pages"]');if(pb)pb.classList.toggle('on',S.view==='pages');
  if(!l){body.innerHTML='<div class="st-empty"><h3>Importe ta leçon</h3><p>Fichier .pdf, .docx, .pptx, .txt, .md, .html, .csv ou image — ou colle ton texte.<br>Les titres et les tableaux sont détectés automatiquement.</p><button class="st-big" data-a="import">Importer un fichier</button><button class="st-big" data-a="paste">Coller du texte</button></div>';return}
  var f=document.createDocumentFragment();
  if(S.view==='pages'&&l.pg&&l.pg.length){
    l.pg.forEach(function(u,k){var e=document.createElement('div');e.className='stb img pgv';
      var c=document.createElement('div');c.className='pgn';c.textContent='Page '+(k+1)+' / '+l.pg.length;
      var im=document.createElement('img');im.loading='lazy';im.src=u;e.appendChild(c);e.appendChild(im);f.appendChild(e)});
    body.appendChild(f);body.scrollTop=0;return}
  var st={};l.stars.forEach(function(i){st[i]=1});
  l.blocks.forEach(function(b,i){var e=document.createElement('div');e.dataset.i=i;
    var c='stb ';
    if(b.t==='h')c+='h h'+b.l;
    else if(b.t==='tbl')c+='tbl';
    else if(b.t==='img')c+='img';
    else c+='p'+(b.t==='li'?' li':'')+(b.c?' '+b.c:'')+(st[i]?' star':'');
    e.className=c;
    if(b.t==='li'){e.dataset.mk=b.mk||'';e.style.setProperty('--d',b.d||0)}
    fill(e,b);f.appendChild(e)});
  body.appendChild(f);body.scrollTop=S.pos[l.id]||l.pos||0;search()}
function norm(s){var o='';for(var i=0;i<s.length;i++){var c=s[i].normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();o+=c.length===1?c:s[i].toLowerCase()[0]}return o}
function markIn(e,q){
  var w=document.createTreeWalker(e,NodeFilter.SHOW_TEXT,null),ns=[],n;
  while((n=w.nextNode()))ns.push(n);
  ns.forEach(function(t){var s=t.nodeValue,nn=norm(s),at=nn.indexOf(q);if(at<0)return;
    var f=document.createDocumentFragment(),p=0;
    while(at>-1){f.appendChild(document.createTextNode(s.slice(p,at)));var m=document.createElement('mark');m.textContent=s.slice(at,at+q.length);f.appendChild(m);p=at+q.length;at=nn.indexOf(q,p)}
    f.appendChild(document.createTextNode(s.slice(p)));t.parentNode.replaceChild(f,t)})}
function search(){
  var l=lesson();if(!l)return;var q=norm($('#stQ').value.trim());S.hits=[];S.hi=-1;
  Array.prototype.forEach.call(body.children,function(e){
    var b=l.blocks[e.dataset.i];if(!b||b.t==='img')return;
    if(e.querySelector('mark')){var cls=e.className;fill(e,b);e.className=cls}
    if(q)markIn(e,q)});
  S.hits=Array.prototype.filter.call(body.querySelectorAll('mark'),function(m){return m.offsetParent});
  $('#stCnt').textContent=q?(S.hits.length?'0/'+S.hits.length:'0 résultat'):'';
  if(S.hits.length)go(1)}
function go(d){
  if(!S.hits.length)return;if(S.hits[S.hi])S.hits[S.hi].classList.remove('cur');
  S.hi=(S.hi+d+S.hits.length)%S.hits.length;var m=S.hits[S.hi];m.classList.add('cur');
  m.scrollIntoView({block:'center',behavior:'smooth'});$('#stCnt').textContent=(S.hi+1)+'/'+S.hits.length}
function zoom(src){var z=$('#stZoom'),im=z.querySelector('img');im.style.width='';
  im.onload=function(){var vw=window.innerWidth;im.style.width=Math.min(Math.max(vw,im.naturalWidth),vw*3)+'px'};
  im.src=src;z.classList.add('on');z.scrollTop=0;z.scrollLeft=0}
function unzoom(){var z=$('#stZoom');z.classList.remove('on');z.querySelector('img').removeAttribute('src')}

/* ---------- Feuille (sommaire, bibliothèque, coller) ---------- */
function sheet(h){$('#stSheetIn').innerHTML=h;$('#stSheet').hidden=false}
function closeSheet(){$('#stSheet').hidden=true}
function toc(){var l=lesson();if(!l)return toast('Importe d’abord une leçon');
  var h='<h3>Sommaire</h3>',n=0;l.blocks.forEach(function(b,i){if(b.t==='h'){n++;h+='<button class="st-row" data-go="'+i+'" style="padding-left:'+(8+(b.l-1)*16)+'px"><span>'+esc(b.x)+'</span></button>'}});
  sheet(n?h:'<h3>Aucun titre détecté</h3>')}
function lib(){var h='<h3>Mes leçons</h3>';
  if(!S.lessons.length)h+='<p style="color:var(--muted)">Aucune leçon enregistrée.</p>';
  S.lessons.forEach(function(l){h+='<div class="st-row"><span data-open="'+l.id+'" style="cursor:pointer">'+esc(l.name)+'</span><small>'+l.blocks.length+' blocs</small><button class="st-ic" data-del="'+l.id+'" aria-label="Supprimer"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg></button></div>'});
  sheet(h)}
var rich=null;
function paste(){rich=null;sheet('<h3>Coller une leçon</h3><input type="text" id="stPN" placeholder="Nom de la leçon"><textarea id="stPT" placeholder="Colle ton texte ici… (les tableaux copiés depuis Word, Excel, Google Docs ou un site sont conservés)"></textarea><div class="st-ps" id="stPS"></div><button class="st-big" id="stPOk">Ajouter</button>')}
function richStat(){var s=$('#stPS');if(!s)return;
  if(!rich){s.textContent='';return}
  var t=0,i=0;rich.forEach(function(b){if(b.t==='tbl')t++;else if(b.t==='img')i++});
  s.textContent='✓ Mise en forme conservée : '+t+' tableau'+(t>1?'x':'')+', '+i+' image'+(i>1?'s':'')}

/* ---------- Actions ---------- */
function speak(i){
  var l=lesson();if(!S.reading||!l||i>=l.blocks.length){S.reading=false;set('read',false);return}
  var b=l.blocks[i],e=body.children[i];if(!e||!e.offsetParent||!b.x){speak(i+1);return}
  e.scrollIntoView({block:'center',behavior:'smooth'});var u=new SpeechSynthesisUtterance((b.t==='li'&&b.mk?b.mk+' ':'')+b.x);u.lang='fr-FR';u.onend=function(){speak(i+1)};speechSynthesis.speak(u)}
/* lecture vocale de secours (navigateurs sans synthèse vocale) : voix Gemini avec la clé de X.Uni */
var TT={ctx:null,src:null,id:0,mem:{}};
function ttsKey(){try{return (localStorage.getItem('uandi-ai-key')||'').trim()}catch(e){return''}}
function ttsStop(){TT.id++;try{if(TT.src){TT.src.onended=null;TT.src.stop()}}catch(e){}TT.src=null}
function ttsGrp(l,i){var t='',n=i;while(n<l.blocks.length&&t.length<700){var b=l.blocks[n];if(b.x)t+=((b.t==='li'&&b.mk?b.mk+' ':'')+b.x+'. ');n++}return{text:t.trim().slice(0,1500),next:Math.max(n,i+1)}}
function ttsGet(text){
  if(TT.mem[text])return TT.mem[text];
  var key=ttsKey();if(!key)return Promise.reject('key');
  var body=JSON.stringify({contents:[{parts:[{text:'Lis ce texte à voix haute en français, d’un ton naturel et posé : '+text}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:'Kore'}}}}});
  function once(n){return fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:body}).then(function(r){
    if(r.status===429&&n<2)return new Promise(function(ok){setTimeout(ok,7000)}).then(function(){return once(n+1)});
    if(r.status===403||r.status===400)throw 'key';if(!r.ok)throw 'net';return r.json()}).then(function(j){
    var d=j&&j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts&&j.candidates[0].content.parts[0]&&j.candidates[0].content.parts[0].inlineData;
    if(!d||!d.data)throw 'net';var bin=atob(d.data),len=bin.length>>1,f=new Float32Array(len);
    for(var k=0;k<len;k++){var v=bin.charCodeAt(2*k)|(bin.charCodeAt(2*k+1)<<8);if(v>32767)v-=65536;f[k]=v/32768}
    return f})}
  var pr=once(0);TT.mem[text]=pr;pr.catch(function(){delete TT.mem[text]});return pr}
function ttsFail(w){S.reading=false;set('read',false);toast(w==='key'?'Ajoute ta clé Gemini dans les réglages de X.Uni pour activer la voix':'La voix n’a pas pu démarrer, réessaie dans un instant')}
function ttsSpeak(i,id){
  var l=lesson();if(!S.reading||id!==TT.id||!l||i>=l.blocks.length){if(id===TT.id){S.reading=false;set('read',false)}return}
  var g=ttsGrp(l,i);if(!g.text){ttsSpeak(g.next,id);return}
  var e=body.children[i];if(e&&e.scrollIntoView)e.scrollIntoView({block:'center',behavior:'smooth'});
  toast('Chargement de la voix…');
  ttsGet(g.text).then(function(f){
    if(!S.reading||id!==TT.id)return;
    var ab=TT.ctx.createBuffer(1,f.length,24000);ab.getChannelData(0).set(f);
    var src=TT.ctx.createBufferSource();src.buffer=ab;src.connect(TT.ctx.destination);TT.src=src;
    src.onended=function(){ttsSpeak(g.next,id)};src.start();
    var nx=ttsGrp(l,g.next);if(nx.text)ttsGet(nx.text).catch(function(){});
  }).catch(function(w){if(id===TT.id)ttsFail(w)})}
function set(a,on){var b=document.querySelector('.st-chip[data-a="'+a+'"]');if(b)b.classList.toggle('on',on)}
function tick(){S.t--;var m=Math.floor(S.t/60),s=S.t%60,b=document.querySelector('[data-a=timer]');
  if(S.t<=0){clearInterval(S.tm);S.tm=0;S.t=1500;b.classList.remove('on');b.textContent='⏱ 25:00';toast('Pause ! 25 min d’étude terminées');if(navigator.vibrate)navigator.vibrate([200,100,200]);return}
  b.textContent='⏱ '+m+':'+('0'+s).slice(-2)}
var act={
  import:function(){$('#stFile').click()},paste:paste,lib:lib,toc:toc,
  pages:function(){var l=lesson();if(!l)return toast('Importe d’abord une leçon');
    if(!l.pg||!l.pg.length)return toast('Les pages d’origine ne sont disponibles que pour les PDF importés');
    S.view=S.view==='pages'?'text':'pages';render()},
  titles:function(){var o=body.classList.toggle('only-t');set('titles',o);search()},
  stars:function(){var o=body.classList.toggle('only-s');set('stars',o)},
  mask:function(){var o=body.classList.toggle('mask');set('mask',o);if(!o)body.querySelectorAll('.rev').forEach(function(e){e.classList.remove('rev')});toast(o?'Touche un paragraphe pour le révéler':'Mode révision désactivé')},
  read:function(){var native='speechSynthesis' in window;
    if(S.view!=='text')return toast('Repasse en mode texte pour la lecture vocale');
    if(S.reading){S.reading=false;ttsStop();if(native)speechSynthesis.cancel();set('read',false);return}
    if(!lesson())return toast('Importe d’abord une leçon');
    var top=body.getBoundingClientRect().top,i=0;for(;i<body.children.length;i++)if(body.children[i].getBoundingClientRect().bottom>top+10)break;
    if(native){S.reading=true;set('read',true);speak(i);return}
    if(!ttsKey())return toast('Ajoute ta clé Gemini dans les réglages de X.Uni pour activer la voix');
    try{TT.ctx=TT.ctx||new(window.AudioContext||window.webkitAudioContext)();TT.ctx.resume()}catch(e){return toast('Lecture vocale indisponible')}
    S.reading=true;set('read',true);TT.id++;ttsSpeak(i,TT.id)},
  timer:function(){var b=document.querySelector('[data-a=timer]');
    if(S.tm){clearInterval(S.tm);S.tm=0;b.classList.remove('on');toast('Minuteur en pause')}else{S.tm=setInterval(tick,1000);b.classList.add('on');toast('Concentration : 25 min')}},
  fm:function(){S.fs=Math.max(.8,S.fs-.1);body.style.fontSize=S.fs+'rem';save()},
  fp:function(){S.fs=Math.min(2,S.fs+.1);body.style.fontSize=S.fs+'rem';save()}
};
var P=$('#stP');
function open(){P.hidden=false;document.body.style.overflow='hidden';sync();render()}
function close(){P.hidden=true;document.body.style.overflow='';ttsStop();if(window.speechSynthesis)speechSynthesis.cancel();S.reading=false;unzoom();sync()}
/* le bouton n'existe que dans l'écran Discussions, à côté du bouton + */
function sync(){var c=document.getElementById('viewList'),ap=document.getElementById('app'),inChat=!!c&&!c.hidden&&!!ap&&!ap.hidden;
  $('#stFab').classList.toggle('on',inChat&&P.hidden);if(!inChat&&!P.hidden)close()}
new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['hidden'],subtree:true});sync();
$('#stFab').addEventListener('click',open);$('#stClose').addEventListener('click',close);
window.uandiStudy={open:open,
  list:function(){return S.lessons.map(function(l){return{id:l.id,name:l.name}})},
  cur:function(){return S.cur},
  text:function(id){var l=S.lessons.filter(function(x){return x.id===id})[0];if(!l)return null;
    var t=(l.blocks||[]).map(function(b){if(!b||b.t==='img'||!b.x)return'';return(b.t==='h'?'\n'+new Array((b.l||1)+1).join('#')+' ':'')+b.x}).filter(Boolean).join('\n');
    return{name:l.name,text:t}}};

$('#stZClose').addEventListener('click',unzoom);
$('#stSrch').addEventListener('click',function(){var b=$('#stSBar');b.hidden=!b.hidden;$('#stSrch').classList.toggle('on',!b.hidden);if(!b.hidden)$('#stQ').focus();else{$('#stQ').value='';search()}});
$('#stQ').addEventListener('input',search);
$('#stQ').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();go(e.shiftKey?-1:1)}});
$('#stNext').addEventListener('click',function(){go(1)});$('#stPrev').addEventListener('click',function(){go(-1)});
$('#stFile').addEventListener('change',function(e){var f=e.target.files[0];e.target.value='';if(f)importFile(f)});
/* collage : on garde les tableaux / images / mise en forme si le presse-papiers les contient */
P.addEventListener('paste',function(e){
  if(!e.target||e.target.id!=='stPT')return;
  var cd=e.clipboardData;if(!cd)return;
  var h=cd.getData('text/html'),files=cd.files&&cd.files.length?Array.prototype.slice.call(cd.files).filter(function(f){return/^image\//.test(f.type)}):[];
  if(h&&/<(table|img|ul|ol|li|h[1-6])[\s>]|<(b|strong|i|em|u)[\s>]|font-weight\s*:\s*(bold|[6-9]00)|text-decoration[^;"]*underline/i.test(h)){
    var B=parseHTML(h);setTimeout(function(){if(B.length){rich=B;richStat()}},0)}
  else if(files.length){e.preventDefault();
    Promise.all(files.map(function(f){return shrink(f,1800)})).then(function(us){us.forEach(function(u){if(u){rich=(rich||[]).concat([{t:'img',src:u,x:''}])}});richStat()})}});
P.addEventListener('input',function(e){if(e.target&&e.target.id==='stPT'){rich=null;richStat()}});
P.addEventListener('click',function(e){
  var t=e.target,a=t.closest('[data-a]');if(a&&act[a.dataset.a]){act[a.dataset.a]();return}
  if(t.id==='stSheet'){closeSheet();return}
  var g=t.closest('[data-go]');if(g){closeSheet();if(S.view!=='text'){S.view='text';render()}var el=body.children[g.dataset.go];if(el){el.scrollIntoView({block:'start',behavior:'smooth'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}return}
  var o=t.closest('[data-open]');if(o){S.cur=o.dataset.open;S.view='text';save();closeSheet();render();return}
  var dl=t.closest('[data-del]');if(dl){if(confirm('Supprimer cette leçon ?')){var id=dl.dataset.del;S.lessons=S.lessons.filter(function(l){return l.id!==id});if(S.cur===id)S.cur=S.lessons[0]?S.lessons[0].id:null;if(DB)kvDel('l:'+id).catch(function(){});save();closeSheet();render()}return}
  if(t.id==='stPOk'){
    var x=$('#stPT').value,nm=$('#stPN').value.trim(),B=(rich&&rich.length)?rich:(x.trim()?parseText(x):[]);
    if(B.length){closeSheet();rich=null;addLesson(nm||'Leçon '+(S.lessons.length+1),B)}return}
  var ob=t.closest('[data-orig]');if(ob){var tb=ob.closest('.stb');if(tb){tb.classList.toggle('showo');ob.textContent=tb.classList.contains('showo')?'📋 Voir le tableau':'📷 Voir l’original'}return}
  if(t.tagName==='IMG'&&body.contains(t)){zoom(t.src);return}
  var p=t.closest('.stb.p');if(p&&body.contains(p)){var l=lesson();if(!l||window.getSelection().toString())return;
    if(body.classList.contains('mask')){p.classList.toggle('rev');return}
    var i=+p.dataset.i,k=l.stars.indexOf(i);if(k>-1)l.stars.splice(k,1);else l.stars.push(i);p.classList.toggle('star');saveLesson(l)}});
var sv;body.addEventListener('scroll',function(){
  var m=body.scrollHeight-body.clientHeight;$('#stProg').style.width=(m>0?body.scrollTop/m*100:0)+'%';
  clearTimeout(sv);sv=setTimeout(function(){var l=lesson();if(l&&S.view==='text'){S.pos[l.id]=body.scrollTop;save()}},600)},{passive:true});

/* ---------- Démarrage : chargement des leçons enregistrées ---------- */
idbOpen().then(function(db){DB=db;return kvGet('meta')}).then(function(m){
  if(m){
    return Promise.all(m.ids.map(function(id){return kvGet('l:'+id)})).then(function(ls){
      S.lessons=ls.filter(Boolean);S.cur=m.cur;S.fs=m.fs||S.fs;S.pos=m.pos||{};
      if(!lesson())S.cur=S.lessons[0]?S.lessons[0].id:null})}
  if(S.lessons.length){/* migration depuis l'ancien stockage */
    return Promise.all(S.lessons.map(saveLesson)).then(function(){return saveMeta()}).then(function(){try{localStorage.removeItem(KEY)}catch(e){}})}
}).catch(function(e){console.warn('Stockage étude :',e);DB=null}).then(function(){if(!P.hidden)render()});
}catch(e){console.warn('Module étude :',e)}})();

/* E'cho — js/modules/assistant.js
   Assistant X.Uni (Groq puis Gemini) */
(function(){ try {
  /* Relais Cloudflare (optionnel) : adresse du Worker, ex. 'https://assistant.moncompte.workers.dev'. Vide = chaque personne colle sa propre clé Gemini gratuite dans ⚙. */
  var AI_FN = '';
  var MODEL_OPTS = [
    { id: 'auto', short: 'Auto', label: 'X.Uni Auto — le plus adapté', note: 'X.Uni choisit la meilleure version disponible et change tout seul si l’une est en panne.' },
    { id: 'gemini-2.5-flash', short: 'Flash', label: 'X.Uni Flash — équilibré', note: 'Bonne qualité et rapide. Idéal pour les cours et les explications.' },
    { id: 'gemini-2.5-flash-lite', short: 'Lite', label: 'X.Uni Lite — le plus rapide', note: 'Réponses très rapides et plus de questions par jour, un peu moins détaillées.' },
    { id: 'gemini-flash-latest', short: 'Plus', label: 'X.Uni Plus — le plus récent', note: 'Dernière génération de Gemini. Plus intelligent, mais peut être plus lent.' }
  ];
  function chosenModel() { try { var m = localStorage.getItem('uandi-ai-model') || 'auto'; return MODEL_OPTS.some(function (o) { return o.id === m; }) ? m : 'auto'; } catch (e) { return 'auto'; } }
  function modelOrder(id) {
    var base = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest'];
    if (id && id !== 'auto') base = [id].concat(base.filter(function (x) { return x !== id; }));
    return base;
  }
  var MODELS = modelOrder(chosenModel());
  var CLD_NAME = 'hjnf54dr', CLD_PRESET = 'uandi_upload', CLD_BASE = 'https://res.cloudinary.com/' + CLD_NAME + '/';
  function isCld(u) { return window.uiIsCld ? window.uiIsCld(u) : (typeof u === 'string' && u.indexOf(CLD_BASE) === 0); }
  var LK = 'uandi-ai-mem', KK = 'uandi-ai-key';
  var $ = function (s) { return document.querySelector(s); };
  var P = $('#aiP'), logEl = $('#aiLog'), inEl = $('#aiIn'), sendB = $('#aiSend'), sel = $('#aiLes'), sheet = $('#aiSheet');
  var mem = { facts: '', msgs: [], t: 0, chats: [], id: '', act: 0 }, autoNote = false, IDLE_MS = 5 * 60 * 1000, busy = false, turns = 0, dirty = false, saving = false, flushing = false, sync = '';
  function valid(m) { return m && typeof m.t === 'string' && m.t && (m.r === 'user' || m.r === 'assistant'); }
  /* ---------- Plusieurs conversations : la courante est dans mem.msgs, les autres dans mem.chats ---------- */
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function mk(c) {
    c = c || {};
    return {
      facts: String(c.facts || '').slice(0, 2000),
      msgs: (Array.isArray(c.msgs) ? c.msgs : []).filter(valid).slice(-40),
      t: c.t || 0, id: c.id ? String(c.id) : newId(), act: c.act || 0,
      chats: (Array.isArray(c.chats) ? c.chats : []).filter(function (x) { return x && x.id && Array.isArray(x.msgs); }).map(function (x) {
        return { id: String(x.id), title: String(x.title || 'Conversation').slice(0, 60), t: x.t || 0, msgs: x.msgs.filter(valid).slice(-30) };
      }).filter(function (x) { return x.msgs.length; }).slice(0, 15)
    };
  }
  function cTitle(msgs) {
    var f = (msgs || []).filter(function (m) { return m.r === 'user'; })[0]; if (!f) return 'Conversation';
    var L = { resume: 'Résumé', quiz: 'Quiz', devoirs: 'Devoirs', explique: 'Explique-moi' };
    var k = Object.keys(PROMPTS).filter(function (x) { return PROMPTS[x] === f.t; })[0]; if (k) return L[k] + ' de la leçon';
    var t = f.t.replace(/\s+/g, ' ').trim(); return t.length > 42 ? t.slice(0, 42) + '…' : t;
  }
  function archive() {
    if (!mem.msgs.length) return;
    var id = mem.id || newId();
    mem.chats = (mem.chats || []).filter(function (c) { return c.id !== id; });
    mem.chats.unshift({ id: id, title: cTitle(mem.msgs), t: mem.act || mem.t || Date.now(), msgs: mem.msgs.slice(-30) });
    mem.chats = mem.chats.slice(0, 15);
  }
  function fresh() { archive(); mem.msgs = []; mem.id = newId(); mem.act = Date.now(); }
  /* 5 minutes sans toucher à X.Uni : la prochaine fois, on repart sur une nouvelle conversation */
  function idleCheck() {
    if (busy || !mem.msgs.length) return false;
    var last = mem.act || mem.t || 0;
    if (!last || Date.now() - last < IDLE_MS) return false;
    fresh(); autoNote = true; dirty = true; saveLocal(); return true;
  }
  try { var c = JSON.parse(localStorage.getItem(LK) || 'null'); if (c && typeof c === 'object') mem = mk(c); } catch (e) {}
  try { var old = JSON.parse(localStorage.getItem('uandi-ai-chat') || 'null'); if (old && old.length && !mem.msgs.length) mem.msgs = old.filter(valid); } catch (e) {}
  function saveLocal(stamp) { if (stamp !== false) mem.t = Date.now(); try { localStorage.setItem(LK, JSON.stringify(mem)); } catch (e) {} }
  function uid() { try { var u = firebase.auth().currentUser; return u && u.uid; } catch (e) { return null; } }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function md(s) {
    var h = esc(s).replace(/```[a-z]*\n?([\s\S]*?)```/g, function (_, c) { return '<pre>' + c.trim() + '</pre>'; });
    return h.split(/(<pre>[\s\S]*?<\/pre>)/).map(function (seg) {
      if (seg.indexOf('<pre>') === 0) return seg;
      seg = seg.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
      return seg.split('\n').map(function (ln) {
        var m;
        if ((m = ln.match(/^\s*#{1,4}\s+(.*)/))) return '<div class="ai-h">' + m[1] + '</div>';
        if ((m = ln.match(/^\s*[-*•]\s+(.*)/))) return '<div class="ai-li">• ' + m[1] + '</div>';
        if ((m = ln.match(/^\s*(\d+[.)])\s+(.*)/))) return '<div class="ai-li">' + m[1] + ' ' + m[2] + '</div>';
        return ln ? ln + '<br>' : '<br>';
      }).join('');
    }).join('').replace(/(<br>)+$/, '');
  }
  function bubble(r, html, cls) { var d = document.createElement('div'); d.className = 'ai-b ' + (cls || (r === 'user' ? 'u' : 'a')); if (r === 'user') d.textContent = html; else d.innerHTML = html; logEl.appendChild(d); return d; }
  function down() { logEl.scrollTop = logEl.scrollHeight; }
  function paint(force) {
    var keep = force ? [] : Array.prototype.filter.call(logEl.children, function (n) { return n.dataset && n.dataset.keep; });
    logEl.textContent = '';
    if (!mem.msgs.length && !keep.length) {
      var h = document.createElement('div'); h.className = 'ai-hi';
      h.innerHTML = '<h3>Salut, moi c’est X.Uni 👋</h3>Pose-moi une question, ou choisis une leçon puis touche Résumé, Quiz, Devoirs ou Explique-moi.' + (autoNote ? '<p class="ai-note">Nouvelle conversation (5 min d’absence). L’ancienne est dans l’historique 🕘</p>' : '');
      logEl.appendChild(h); return;
    }
    mem.msgs.forEach(function (m) { bubble(m.r, m.r === 'user' ? m.t : md(m.t)); });
    keep.forEach(function (n) { logEl.appendChild(n); });
    down();
  }
  function fillLessons() {
    var st = window.uandiStudy, cur = sel.value, list = st ? st.list() : [];
    sel.textContent = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Aucune (question libre)'; sel.appendChild(o0);
    list.forEach(function (l) { var o = document.createElement('option'); o.value = l.id; o.textContent = l.name; sel.appendChild(o); });
    var want = cur || (st && st.cur()) || '';
    sel.value = list.some(function (l) { return l.id === want; }) ? want : '';
  }

  /* ---------- IA : clé personnelle (direct Gemini) ou relais Cloudflare ---------- */
  var KEYURL = 'https://console.groq.com/keys';
  function fail(text, link, retryText) {
    var d = bubble('assistant', esc(text) + (link ? '<br><a class="ai-link" href="' + KEYURL + '" target="_blank" rel="noopener">👉 Créer ma clé gratuite</a>' : '') + (retryText ? '<br><button type="button" class="ai-retry">↻ Réessayer</button>' : ''), 'e');
    d.dataset.keep = '1';
    var rb = d.querySelector('.ai-retry');
    if (rb) rb.addEventListener('click', function () { d.remove(); ask(retryText, true); });
    down(); return d;
  }
  var SEND_ICO = '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
  var STOP_ICO = '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/></svg>';
  var req = null;
  function setBusy(b) {
    busy = b; sendB.disabled = false; sendB.classList.toggle('stop', b);
    sendB.innerHTML = b ? STOP_ICO : SEND_ICO; sendB.setAttribute('aria-label', b ? 'Arrêter la réponse' : 'Envoyer');
    if (b && P.hidden) pill('busy');
  }
  /* pastille flottante : visible quand X.Uni est fermé mais réfléchit encore */
  var pillEl = null;
  function pill(st) {
    return; /* désactivé : le chargement reste dans la bulle de réponse, même si on ferme puis rouvre X.Uni */
    if (!pillEl) {
      var css = document.createElement('style');
      css.textContent = '#aiPill{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:99999;display:flex;align-items:center;gap:10px;padding:11px 18px;border-radius:999px;border:0;background:#1f1f2b;color:#fff;font:600 14px system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);cursor:pointer}#aiPill[hidden]{display:none}#aiPill .ai-dots{margin:0}#aiPill .ai-dots i{background:#fff}';
      document.head.appendChild(css);
      pillEl = document.createElement('button'); pillEl.id = 'aiPill'; pillEl.type = 'button'; pillEl.hidden = true;
      pillEl.addEventListener('click', function () { open(); });
      document.body.appendChild(pillEl);
    }
    if (st === 'busy') pillEl.innerHTML = 'X.Uni réfléchit <span class="ai-dots"><i></i><i></i><i></i></span>';
    else if (st === 'done') pillEl.innerHTML = '✓ X.Uni a répondu — toucher pour voir';
    pillEl.hidden = !st;
  }
  function stopReq() { if (req) { req.userStop = true; req.abort(); } }
  async function gen(system, messages, maxTok) {
    var key = ''; try { key = (localStorage.getItem(KK) || '').trim(); } catch (e) {}
    var gk0 = groqKey();
    var prov0 = chosenProv();
    if (prov0 !== 'auto' && !provHasKey(prov0)) throw { code: 'noprov', name: (PROVS.filter(function (p) { return p[0] === prov0; })[0] || [])[1] };
    var useG0 = !!key && (prov0 === 'auto' || prov0 === 'gemini');
    if (!key && !AI_FN && !gk0 && !orKey() && !hfKey()) throw { code: 'setup' };
    var msgs = messages.slice(); while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 45000), r, j = {};
    try {
      /* Groq d'abord ; si indisponible, on bascule sur Gemini */
      if (gk0 && (prov0 === 'auto' || prov0 === 'groq')) {
        var GMS = await groqModels(gk0, ctl.signal), gr0 = null;
        for (var gi0 = 0; gi0 < GMS.length; gi0++) {
          try {
            gr0 = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + gk0 },
              body: JSON.stringify({ model: GMS[gi0], temperature: 0.6, max_tokens: (maxTok || 1500) + 800, reasoning_effort: /gpt-oss/.test(GMS[gi0]) ? 'low' : undefined,
                messages: [{ role: 'system', content: system }].concat(msgs.map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }; })) })
            });
          } catch (e0) { if (ctl.signal.aborted) throw e0; gr0 = null; continue; }
          if (gr0.status === 429 || gr0.status >= 500 || gr0.status === 404 || gr0.status === 400) continue;
          break;
        }
        if (gr0 && gr0.ok) {
          var gj0 = {}; try { gj0 = await gr0.json(); } catch (e1) {}
          var gt0 = String((gj0.choices && gj0.choices[0] && gj0.choices[0].message && gj0.choices[0].message.content) || '').trim();
          if (gt0) return gt0;
        }
      }
      var EX0 = extraProviders();
      for (var xi0 = 0; xi0 < EX0.length; xi0++) {
        var xr0 = await oaiStream(EX0[xi0], system, msgs, maxTok, function () {}, ctl);
        if (xr0.text) return xr0.text;
      }
      if (!useG0 && !AI_FN) throw !gr0 ? { code: 'net' } : gr0.status === 429 ? { code: 'rate' } : (gr0.status === 401 || gr0.status === 403) ? { code: 'key' } : { code: 'down', status: gr0.status };
      if (useG0) {
        var gbody = JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: msgs.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }; }),
          generationConfig: { temperature: 0.6, maxOutputTokens: maxTok || 1500 }
        });
        for (var mi = 0; mi < MODELS.length; mi++) {
          r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + MODELS[mi] + ':generateContent', {
            method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: gbody
          });
          if (r.status !== 404 && r.status !== 500 && r.status !== 503) break;
        }
      } else {
        r = await fetch(AI_FN, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: system, messages: msgs, maxTokens: maxTok || 1500 }) });
      }
      try { j = await r.json(); } catch (e) {}
    } catch (e) { if (e && e.code) throw e; throw { code: e && e.name === 'AbortError' ? 'slow' : 'net' }; }
    finally { clearTimeout(to); }
    if (r.status === 429) throw { code: 'rate' };
    var emsg = (j && j.error && j.error.message) || '';
    if (key && (r.status === 403 || (r.status === 400 && /api key/i.test(emsg)))) throw { code: 'key' };
    if (!r.ok) throw { code: 'down', status: r.status, msg: emsg };
    var out = useG0
      ? ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(function (p) { return p.text || ''; }).join('')
      : (j.reply || '');
    return String(out).trim();
  }
  /* réponse en direct : le texte s'affiche au fur et à mesure (beaucoup plus rapide à l'œil) */
  async function genStream(system, messages, maxTok, onText, ctl) {
    var key = ''; try { key = (localStorage.getItem(KK) || '').trim(); } catch (e) {}
    var gk = groqKey();
    var prov = chosenProv();
    if (prov !== 'auto' && !provHasKey(prov)) throw { code: 'noprov', name: (PROVS.filter(function (p) { return p[0] === prov; })[0] || [])[1] };
    var useG = !!key && (prov === 'auto' || prov === 'gemini');
    if (!key && !AI_FN && !gk && !orKey() && !hfKey()) throw { code: 'setup' };
    var msgs = messages.slice(); while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    ctl = ctl || new AbortController(); ctl.last = Date.now();
    var to = setTimeout(function () { ctl.abort(); }, 120000), r, full = '';
    var wd = setInterval(function () { if (Date.now() - ctl.last > (full ? 20000 : 25000)) { ctl.stall = true; ctl.abort(); } }, 3000);
    try {
      /* Groq d'abord (très rapide) ; si indisponible, on bascule sur Gemini sans rien dire */
      var gst = 0, gerr = '';
      if (gk && (prov === 'auto' || prov === 'groq')) {
        var GM = await groqModels(gk, ctl.signal);
        for (var gi = 0; gi < GM.length && !full; gi++) {
          try {
            var gr = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + gk },
              body: JSON.stringify({ model: GM[gi], stream: true, temperature: 0.6, max_tokens: (maxTok || 1500) + 800, reasoning_effort: /gpt-oss/.test(GM[gi]) ? 'low' : undefined,
                messages: [{ role: 'system', content: system }].concat(msgs.map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }; })) })
            });
            gst = gr.status;
            if (!gr.ok) { try { var gej = await gr.clone().json(); gerr += GM[gi] + ': ' + String((gej.error && gej.error.message) || gej.error || gr.status) + ' | '; } catch (e) { gerr += GM[gi] + ': ' + gr.status + ' | '; } }
            if (!gr.ok || !gr.body || !gr.body.getReader) { if (gr.status === 429 || gr.status >= 500 || gr.status === 404 || gr.status === 400) continue; break; }
            var grd = gr.body.getReader(), gdec = new TextDecoder(), gbuf = '';
            for (;;) {
              var gx = await grd.read(); if (gx.done) break;
              ctl.last = Date.now();
              gbuf += gdec.decode(gx.value, { stream: true });
              var gls = gbuf.split('\n'); gbuf = gls.pop();
              for (var gl = 0; gl < gls.length; gl++) {
                var gln = gls[gl]; if (gln.indexOf('data:') !== 0) continue;
                var gt = gln.slice(5).trim(); if (!gt || gt === '[DONE]') continue;
                var go; try { go = JSON.parse(gt); } catch (e) { continue; }
                if (go.error) { gerr = String(go.error.message || go.error); continue; }
                var gch = go.choices && go.choices[0] && go.choices[0].delta && go.choices[0].delta.content;
                if (gch) { full += gch; onText(full); }
              }
            }
            if (full) break;
            continue;
          } catch (ge) {
            if (ctl.signal.aborted) throw ge;
            if (full) break;
          }
        }
        if (full) return full.trim();
        ctl.last = Date.now();
      }
      /* Groq indisponible ou absent : OpenRouter puis Hugging Face, avant Gemini */
      var EX = extraProviders();
      for (var xi = 0; xi < EX.length && !full; xi++) {
        var xr = await oaiStream(EX[xi], system, msgs, maxTok, onText, ctl);
        if (xr.text) return xr.text;
        gst = gst || xr.status;
      }
      ctl.last = Date.now();
      if (!useG && !AI_FN) throw gst === 429 ? { code: 'rate' } : gst === 401 || gst === 403 ? { code: 'key' } : { code: gst ? 'down' : 'net', status: gst, msg: gerr };
      if (useG) {
        for (var att = 0; att < 3; att++) {
        var ML = ctl.models || MODELS;
        for (var mi = 0; mi < ML.length; mi++) {
          var gc = { temperature: 0.6, maxOutputTokens: maxTok || 1500 };
          if (/^gemini-2\.5/.test(ML[mi])) gc.thinkingConfig = { thinkingBudget: 0 };
          r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + ML[mi] + ':streamGenerateContent?alt=sse', {
            method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: msgs.map(function (m) { return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }; }),
              generationConfig: gc
            })
          });
          if (r.status !== 404 && r.status !== 429 && r.status !== 500 && r.status !== 503 && !(r.status === 400 && mi < ML.length - 1)) break;
        }
          if ((r.status === 503 || r.status === 500 || r.status === 429) && att < 2) {
            if (ctl.onRetry) ctl.onRetry(att + 1, r.status);
            ctl.last = Date.now();
            await new Promise(function (ok) { setTimeout(ok, (r.status === 429 ? 6000 : 1500) * (att + 1)); });
            ctl.last = Date.now();
            continue;
          }
          break;
        }
      } else {
        r = await fetch(AI_FN, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system: system, messages: msgs, maxTokens: maxTok || 1500, stream: true }) });
      }
      if (r.status === 429) throw { code: 'rate' };
      if (!r.ok) {
        var j = {}; try { j = await r.json(); } catch (e) {}
        var emsg = (j && j.error && (j.error.message || (typeof j.error === 'string' && j.error))) || '';
        if (key && (r.status === 403 || (r.status === 400 && /api key/i.test(emsg)))) throw { code: 'key' };
        throw { code: 'down', status: r.status, msg: String(emsg) };
      }
      var ct = r.headers.get('content-type') || '';
      if (ct.indexOf('event-stream') < 0 || !r.body || !r.body.getReader) {
        var j2 = {}; try { j2 = await r.json(); } catch (e) {}
        full = (j2.reply || '').trim(); if (full) onText(full); return full;
      }
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
      for (;;) {
        var x = await rd.read(); if (x.done) break;
        ctl.last = Date.now();
        buf += dec.decode(x.value, { stream: true });
        var lines = buf.split('\n'); buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i]; if (ln.indexOf('data:') !== 0) continue;
          var t = ln.slice(5).trim(); if (!t || t === '[DONE]') continue;
          var o; try { o = JSON.parse(t); } catch (e) { continue; }
          var ps = (o.candidates && o.candidates[0] && o.candidates[0].content && o.candidates[0].content.parts) || [];
          var ch = ps.map(function (p) { return p.text || ''; }).join('');
          if (ch) { full += ch; onText(full); }
        }
      }
      return full.trim();
    } catch (e) {
      if (e && e.code) throw e;
      if (full) return full.trim();
      throw { code: ctl.userStop ? 'stop' : ctl.stall ? 'stall' : e && e.name === 'AbortError' ? 'slow' : 'net' };
    } finally { clearTimeout(to); clearInterval(wd); }
  }
  var BASE = 'Tu es X.Uni, l’assistant d’étude de l’application E\'cho, pour des étudiants. Si on te demande ton nom, tu t’appelles X.Uni. Réponds dans la langue de l’élève (français par défaut), de façon claire, chaleureuse et précise. ' +
    'Explique étape par étape avec des exemples simples. Quand tu fais un quiz, pose UNE question à la fois, attends la réponse, corrige gentiment, puis continue. ' +
    'Pour les devoirs, ne donne la correction que si on te la demande. Tu peux aussi aider sur des questions de la vie de tous les jours. Si tu n’es pas sûr, dis-le. ' +
    'N’invente jamais de faits sur le cours : appuie-toi sur la leçon fournie quand il y en a une. Reste concis : va à l’essentiel, listes courtes, gras pour les mots importants.';
  /* ---------- Leçon : on n'envoie à l'IA que les morceaux utiles ---------- */
  var LES_MAX = 6000, CH_LEN = 900;
  var STOP = ' le la les un une des du de et en au aux ce ces cet cette son sa ses mon ma mes ton ta tes que qui quoi dont ou où est sont etre avoir pas pour par sur dans avec sans plus moins tout tous toute toutes mais donc car comme ainsi alors faire fait peux peut veux dis donne moi toi nous vous ils elles il elle je tu on se ne y a ai as va quel quelle quels quelles cette sur sous entre vers chez leur leurs aussi tres bien si oui non explique expliquer exemple '.split(' ');
  function norm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function words(t) { return (norm(t).match(/[a-z0-9_]{3,}/g) || []).filter(function (w) { return STOP.indexOf(w) < 0; }); }
  function chunkLesson(text) {
    var paras = String(text).split(/\n\s*\n/), out = [], cur = '';
    function push() { if (cur.trim()) out.push(cur.trim()); cur = ''; }
    paras.forEach(function (pa) {
      while (pa.length > CH_LEN * 1.5) {
        var cut = pa.lastIndexOf('\n', CH_LEN); if (cut < CH_LEN / 2) cut = pa.lastIndexOf('. ', CH_LEN) + 1; if (cut < CH_LEN / 2) cut = pa.lastIndexOf(' ', CH_LEN); if (cut < CH_LEN / 2) cut = CH_LEN;
        if (cur) push(); out.push(pa.slice(0, cut).trim()); pa = pa.slice(cut);
      }
      if (cur && (cur.length + pa.length) > CH_LEN) push();
      cur += (cur ? '\n\n' : '') + pa;
    });
    push();
    return out.filter(Boolean);
  }
  function pickLesson(text) {
    text = String(text || '');
    if (text.length <= LES_MAX) return text;
    var chunks = chunkLesson(text); if (chunks.length < 2) return text.slice(0, LES_MAX);
    var last = mem.msgs[mem.msgs.length - 1], isChip = !!(last && last.r === 'user' && Object.keys(PROMPTS).some(function (k) { return PROMPTS[k] === last.t; }));
    var q = {};
    if (!isChip) {
      mem.msgs.slice(-4).forEach(function (m, i, a) { var wgt = (m.r === 'user' && i === a.length - 1) ? 4 : 1; words(m.t.slice(0, 600)).forEach(function (w) { q[w] = Math.max(q[w] || 0, wgt); }); });
    }
    var scores = chunks.map(function (c) {
      var n = norm(c), sc = 0; Object.keys(q).forEach(function (w) { if (n.indexOf(w) >= 0) sc += q[w]; }); return sc;
    });
    var chosen = {}, used = 0, N = chunks.length;
    function take(i) { if (chosen[i] || used + chunks[i].length > LES_MAX) return false; chosen[i] = 1; used += chunks[i].length; return true; }
    var anyHit = scores.some(function (x) { return x > 0; });
    if (anyHit) {
      take(0);
      chunks.map(function (c, i) { return i; }).sort(function (a, b) { return scores[b] - scores[a] || a - b; }).forEach(function (i) { if (scores[i] > 0) take(i); });
      /* on ajoute les morceaux voisins pour garder le contexte */
      Object.keys(chosen).map(Number).forEach(function (i) { if (used < LES_MAX * 0.7) { if (i + 1 < N) take(i + 1); if (i > 0) take(i - 1); } });
    } else {
      /* pas de mot-clé (Résumé, Quiz…) : morceaux répartis sur toute la leçon */
      var per = Math.max(2, Math.floor(LES_MAX / (text.length / N))), step = N / Math.min(per, N);
      for (var k = 0; k < Math.min(per, N); k++) take(Math.min(N - 1, Math.floor(k * step)));
      take(N - 1);
    }
    var res = '', prev = -2;
    Object.keys(chosen).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
      res += (i === prev + 1 || !res ? '' : '\n[…]\n') + (res && i === prev + 1 ? '\n\n' : '') + chunks[i]; prev = i;
    });
    return '(Extraits de la leçon choisis pour cette question ; […] marque un passage non envoyé.)\n' + res;
  }
  function sysPrompt(les) {
    var s = BASE;
    if (mem.facts) s += '\n\nCE QUE TU SAIS DÉJÀ DE CET ÉLÈVE (ta mémoire, utilise-la naturellement sans la réciter) :\n' + mem.facts.slice(0, 800);
    if (les && les.text) s += '\n\nLEÇON DE L’ÉLÈVE — « ' + String(les.name || 'Sans titre').slice(0, 120) + ' » :\n' + pickLesson(les.text);
    return s;
  }

  /* ---------- Mémoire : Cloudinary (fichier JSON) + Firestore (pointeur) ---------- */
  function status() {
    var el = $('#aiSync'); if (!el) return;
    el.textContent = !uid() ? 'Mémoire gardée sur ce téléphone seulement (connecte-toi pour la sauvegarder en ligne).'
      : sync === 'ok' ? 'Mémoire sauvegardée en ligne ✓'
      : sync === 'err' ? 'Sauvegarde en ligne impossible pour l’instant (règles Firestore ou réseau). Elle reste sur ce téléphone.'
      : 'Mémoire prête.';
  }
  async function cloudLoad() {
    var id = uid(); if (!id) { status(); return; }
    try {
      var d = await firebase.firestore().collection('aiMemory').doc(id).get();
      if (d.exists) {
        var x = d.data();
        if (x && typeof x.url === 'string' && isCld(x.url) && (x.t || 0) > (mem.t || 0)) {
          var r = await fetch(x.url, { cache: 'no-store' }), j = await r.json();
          if (j && typeof j === 'object') {
            var pa = mem.act || 0; mem = mk(j); mem.t = x.t; mem.act = Math.max(mem.act || 0, pa);
            saveLocal(false); if (!P.hidden) paint();
          }
        } else if ((mem.t || 0) > (x && x.t || 0)) dirty = true;
      } else if (mem.facts || mem.msgs.length) dirty = true;
      sync = 'ok';
    } catch (e) { sync = 'err'; }
    status();
  }
  async function cloudSave() {
    var id = uid(); if (!id || saving) { status(); return; }
    saving = true;
    try {
      var mblob = new Blob([JSON.stringify({ facts: mem.facts, msgs: mem.msgs.slice(-30), t: mem.t, id: mem.id, act: mem.act, chats: (mem.chats || []).slice(0, 10).map(function (c) { return { id: c.id, title: c.title, t: c.t, msgs: c.msgs.slice(-20) }; }) })], { type: 'application/json' });
      var murl = window.uiCloudUp ? await window.uiCloudUp(mblob, 'raw', 'memoire.json') : null;
      if (!murl || !isCld(murl)) throw new Error('cloud');
      await firebase.firestore().collection('aiMemory').doc(id).set({ url: murl, t: mem.t });
      dirty = false; sync = 'ok';
    } catch (e) { sync = 'err'; }
    saving = false; status();
  }
  async function updateFacts() {
    if (!turns) return;
    var recent = mem.msgs.slice(-8).map(function (m) { return (m.r === 'user' ? 'Élève : ' : 'Assistant : ') + m.t.slice(0, 600); }).join('\n');
    var sys = 'Tu tiens la mémoire de X.Uni, un assistant d’étude. À partir de la mémoire actuelle et des derniers échanges, écris la mémoire mise à jour : prénom ou surnom, niveau ou filière, matières et leçons travaillées, points faibles, façon d’expliquer préférée, objectifs, infos utiles sur sa vie. ' +
      'Garde seulement des faits durables, sans détails inutiles ni informations sensibles (mots de passe, adresses, numéros). Maximum 900 caractères, texte brut, une ligne par fait. Réponds uniquement avec la mémoire.';
    try {
      var t = await gen(sys, [{ role: 'user', text: 'MÉMOIRE ACTUELLE :\n' + (mem.facts || '(vide)') + '\n\nDERNIERS ÉCHANGES :\n' + recent }], 500);
      if (t) { mem.facts = t.slice(0, 1200); turns = 0; dirty = true; saveLocal(); }
    } catch (e) {}
  }
  async function flush(force) {
    if (flushing) return; flushing = true;
    try { if (turns >= (force ? 2 : 4)) await updateFacts(); if (dirty) await cloudSave(); } finally { flushing = false; }
  }

  /* ---------- Écran ---------- */
  function verTag() { var m = chosenModel(), o = MODEL_OPTS.filter(function (x) { return x.id === m; })[0]; $('#aiVer').textContent = o ? o.short : ''; }
  var GLIST = null, GLIST_T = 0;
  async function groqModels(k, sig) {
    var pref = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b'];
    if (GLIST && Date.now() - GLIST_T < 600000) return GLIST;
    try {
      var r = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': 'Bearer ' + k }, signal: sig });
      if (!r.ok) return pref;
      var j = await r.json(), ids = (j.data || []).map(function (m) { return m.id; }).filter(function (id) { return id && !/whisper|guard|safeguard|tts|orpheus|embed|allam|compound|prompt/i.test(id); });
      if (!ids.length) return pref;
      var out = pref.filter(function (m) { return ids.indexOf(m) >= 0; });
      ids.forEach(function (id) { if (out.indexOf(id) < 0 && out.length < 5) out.push(id); });
      GLIST = out.length ? out : pref; GLIST_T = Date.now();
      return GLIST;
    } catch (e) { if (sig && sig.aborted) throw e; return pref; }
  }
  function groqKey() { try { return (localStorage.getItem('uandi-groq-key') || '').trim(); } catch (e) { return ''; } }
  /* ---------- OpenRouter + Hugging Face (API compatible OpenAI) ---------- */
  var OR_MODELS = ['openrouter/free', 'openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free'];
  var HF_MODELS = ['openai/gpt-oss-120b', 'meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct'];
  var PROVS = [['auto', 'Auto (secours automatique)'], ['groq', 'Groq'], ['openrouter', 'OpenRouter'], ['huggingface', 'Hugging Face'], ['gemini', 'Gemini']];
  function chosenProv() { try { var v = localStorage.getItem('uandi-ai-prov') || 'auto'; return PROVS.some(function (p) { return p[0] === v; }) ? v : 'auto'; } catch (e) { return 'auto'; } }
  function provHasKey(id) { return id === 'auto' ? !!(groqKey() || orKey() || hfKey() || savedKey()) : id === 'groq' ? !!groqKey() : id === 'openrouter' ? !!orKey() : id === 'huggingface' ? !!hfKey() : !!savedKey(); }
  function fillProv() {
    var s = $('#aiProv'), cur = chosenProv(); s.textContent = '';
    PROVS.forEach(function (p) { var o = document.createElement('option'); o.value = p[0]; o.textContent = p[1] + (p[0] !== 'auto' && !provHasKey(p[0]) ? ' — clé manquante' : ''); s.appendChild(o); });
    s.value = cur;
  }
  function orKey() { try { return (localStorage.getItem('uandi-or-key') || '').trim(); } catch (e) { return ''; } }
  function hfKey() { try { return (localStorage.getItem('uandi-hf-key') || '').trim(); } catch (e) { return ''; } }
  function extraProviders() {
    var a = [], o = orKey(), h = hfKey(), pv = chosenProv();
    if (o && (pv === 'auto' || pv === 'openrouter')) a.push({ name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: o, models: OR_MODELS });
    if (h && (pv === 'auto' || pv === 'huggingface')) a.push({ name: 'huggingface', url: 'https://router.huggingface.co/v1/chat/completions', key: h, models: HF_MODELS });
    return a;
  }
  /* envoie la question à un fournisseur, affiche le texte au fur et à mesure, renvoie { text, status } */
  async function oaiStream(p, system, msgs, maxTok, onText, ctl) {
    var full = '', st = 0;
    for (var i = 0; i < p.models.length && !full; i++) {
      var hd = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + p.key };
      if (p.name === 'openrouter') { hd['HTTP-Referer'] = location.origin; hd['X-Title'] = 'E\'cho'; }
      var r;
      try {
        r = await fetch(p.url, { method: 'POST', signal: ctl.signal, headers: hd,
          body: JSON.stringify({ model: p.models[i], stream: true, temperature: 0.6, max_tokens: (maxTok || 1500) + 800,
            messages: [{ role: 'system', content: system }].concat(msgs.map(function (m) { return { role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }; })) }) });
      } catch (e) { if (ctl.signal.aborted) throw e; continue; }
      st = r.status;
      if (!r.ok || !r.body || !r.body.getReader) { if (r.status === 401 || r.status === 403) break; continue; }
      try {
        var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
        for (;;) {
          var x = await rd.read(); if (x.done) break;
          ctl.last = Date.now();
          buf += dec.decode(x.value, { stream: true });
          var ls = buf.split('\n'); buf = ls.pop();
          for (var k = 0; k < ls.length; k++) {
            var ln = ls[k]; if (ln.indexOf('data:') !== 0) continue;
            var t = ln.slice(5).trim(); if (!t || t === '[DONE]') continue;
            var o; try { o = JSON.parse(t); } catch (e) { continue; }
            var ch = o.choices && o.choices[0] && o.choices[0].delta && o.choices[0].delta.content;
            if (ch) { full += ch; onText(full); }
          }
        }
      } catch (e) { if (ctl.signal.aborted) throw e; if (full) break; }
    }
    return { text: full.trim(), status: st };
  }
  function savedKey() { try { return (localStorage.getItem(KK) || '').trim(); } catch (e) { return ''; } }
  function refreshKeyUI() {
    var v = $('#aiKey').value.trim(), k = savedKey();
    $('#aiKeyHelp').hidden = !!v;
    $('#aiKeyOk').hidden = !(k && v === k);
    $('#aiKey').type = (k && v === k) ? 'password' : 'text';
    var gv = $('#aiGroq').value.trim(), gs = groqKey();
    $('#aiGroqHelp').hidden = !!gv;
    $('#aiGroqOk').hidden = !(gs && gv === gs);
    $('#aiGroq').type = (gs && gv === gs) ? 'password' : 'text';
  }
  function modelNote() { var o = MODEL_OPTS.filter(function (x) { return x.id === $('#aiModel').value; })[0]; $('#aiModelNote').textContent = o ? o.note : ''; }
  function fillModels() {
    var m = $('#aiModel'); m.textContent = '';
    MODEL_OPTS.forEach(function (o) { var op = document.createElement('option'); op.value = o.id; op.textContent = o.label; m.appendChild(op); });
    m.value = chosenModel(); modelNote();
  }
  function open() { pill(''); if (!busy) Array.prototype.forEach.call(logEl.querySelectorAll('.ai-b.e'), function (n) { n.remove(); }); verTag(); fillProv(); fillLessons(); idleCheck(); mem.act = Date.now(); saveLocal(false); P.hidden = false; document.body.style.overflow = 'hidden'; paint(); cloudLoad(); }
  function close() { if (busy) pill('busy'); mem.act = Date.now(); saveLocal(false); P.hidden = true; sheet.hidden = true; histSheet.hidden = true; document.body.style.overflow = ''; flush(true); }
  var PROMPTS = {
    resume: 'Résumé de cette leçon, très court (maximum 150 mots) : idées clés et définitions à retenir, en liste à puces.',
    quiz: 'Quiz sur cette leçon : 5 questions au total, mais pose UNIQUEMENT la question 1 maintenant (une phrase, avec 3 choix A/B/C si utile), sans rien d’autre. J’attends ma réponse.',
    devoirs: 'Donne-moi 5 exercices courts sur cette leçon, de difficulté croissante, une ligne chacun, sans la correction.',
    explique: 'Explique cette leçon simplement, en 150 mots maximum, avec un exemple, puis pose-moi une seule question pour vérifier que j’ai compris.'
  };
  async function ask(text, retry, auto, fast) {
    if (busy || !text) return;
    setBusy(true); autoNote = false; mem.act = Date.now();
    var again = false;
    var lastM = mem.msgs[mem.msgs.length - 1], okDone = false;
    if (!retry && !(lastM && lastM.r === 'user' && lastM.t === text)) { mem.msgs.push({ r: 'user', t: text }); mem.msgs = mem.msgs.slice(-40); saveLocal(); }
    Array.prototype.forEach.call(logEl.querySelectorAll('.ai-b.e'), function (n) { n.remove(); });
    paint();
    var wait = bubble('assistant', '<span class="ai-dots"><i></i><i></i><i></i></span>'); wait.dataset.keep = '1'; down();
    var hint = setTimeout(function () { if (wait.isConnected && wait.querySelector('.ai-dots')) wait.insertAdjacentHTML('beforeend', '<div class="ai-wait">Ça prend du temps… tu peux arrêter avec le bouton ■.</div>'); }, 12000);
    var les = sel.value && window.uandiStudy ? window.uandiStudy.text(sel.value) : null;
    req = new AbortController();
    if (fast && chosenModel() === 'auto') req.models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
    req.onRetry = function (n, st) {
      if (!wait.isConnected || !wait.querySelector('.ai-dots')) return;
      var h = wait.querySelector('.ai-wait');
      if (!h) { wait.insertAdjacentHTML('beforeend', '<div class="ai-wait"></div>'); h = wait.querySelector('.ai-wait'); }
      h.textContent = st === 429 ? 'Beaucoup de demandes en même temps, X.Uni patiente et réessaie tout seul…' : 'Le service est très sollicité en ce moment, X.Uni réessaie…';
    };
    try {
      var raf = 0, curTxt = '';
      var rep = await genStream(sysPrompt(les), mem.msgs.slice(-6).map(function (m) { return { role: m.r, text: m.t.length > 1500 ? m.t.slice(0, 1500) + '…' : m.t }; }), fast ? 800 : 1500, function (txt) {
        curTxt = txt; if (raf) return;
        raf = requestAnimationFrame(function () { raf = 0; wait.innerHTML = md(curTxt); down(); });
      }, req);
      if (raf) cancelAnimationFrame(raf);
      if (!rep) rep = 'Je n’ai pas pu répondre à celle-ci. Reformule ta question ?';
      wait.innerHTML = md(rep); wait.removeAttribute('data-keep'); down(); okDone = true;
      mem.act = Date.now(); mem.msgs.push({ r: 'assistant', t: rep }); saveLocal(); dirty = true; turns++;
      if (turns >= 4) flush(false);
    } catch (e) {
      wait.remove(); var c = e && e.code;
      if (c === 'setup') { fail('Pour activer X.Uni, crée ta clé Groq gratuite (ça prend 1 minute), puis colle-la dans les réglages (bouton en haut).', true); sheet.hidden = false; status(); }
      else if (c === 'noprov') fail('Il manque la clé ' + (e.name || '') + '. Ajoute-la dans les réglages (bouton en haut) ou choisis « Auto » dans la liste « IA ».', false, text);
      else if (c === 'key') fail('Ta clé est refusée. Vérifie ta clé Groq dans les réglages (bouton en haut) ou crées-en une nouvelle.', true);
      else if (c === 'rate') fail('Trop de demandes pour le moment : la version gratuite est limitée. Patiente une minute, puis appuie sur Réessayer.', false, text);
      else if (c === 'stop') fail('Réponse arrêtée.', false, text);
      else if (c === 'stall') { if (!auto) again = true; else fail('La connexion a été coupée (l’appli était peut-être en arrière-plan).', false, text); }
      else if (c === 'slow') fail('Ça prend trop de temps. Réessaie avec une question plus courte.', false, text);
      else if (c === 'net') fail('Pas de connexion à X.Uni. Vérifie ton réseau et réessaie.', false, text);
      else if (e && (e.status === 503 || e.status === 500)) fail('Les serveurs sont très sollicités en ce moment. Réessaie dans quelques secondes.', false, text);
      else fail('X.Uni ne répond pas pour l’instant. Réessaie dans un moment.' + (e && e.status ? ' (erreur ' + e.status + (e.msg ? ' : ' + e.msg.slice(0, 300) : '') + ')' : ''), false, text);
    } finally { clearTimeout(hint); req = null; setBusy(false); if (P.hidden) pill(okDone ? 'done' : ''); }
    if (again) return ask(text, true, true);
  }
  $('#aiForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) { stopReq(); return; }
    var t = inEl.value.trim(); if (!t) return;
    inEl.value = ''; inEl.style.height = 'auto'; ask(t);
  });
  inEl.addEventListener('focus', function () { down(); setTimeout(down, 120); setTimeout(down, 350); setTimeout(down, 700); });
  inEl.addEventListener('click', function () { setTimeout(down, 300); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { if (!P.hidden && document.activeElement === inEl) { down(); setTimeout(down, 80); } });
  inEl.addEventListener('input', function () { inEl.style.height = 'auto'; inEl.style.height = Math.min(120, inEl.scrollHeight) + 'px'; });

  $('#aiChips').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-p]'); if (!b) return;
    if (busy) return;
    if (!sel.value) { mem.msgs.push({ r: 'assistant', t: 'Choisis d’abord une leçon dans la liste « Leçon » ci-dessus. Pour en ajouter une : bouton +, puis Étudier, puis Importer.' }); saveLocal(); paint(); return; }
    ask(PROMPTS[b.dataset.p], false, false, true);
  });
  $('#aiClose').addEventListener('click', close);
  var histSheet = $('#aiHistSheet');
  function newChat() {
    if (busy) return;
    if (!mem.msgs.length) { autoNote = false; paint(true); return; }
    updateFacts(); /* lit la conversation tout de suite, répond en arrière-plan */
    fresh(); autoNote = false; dirty = true; saveLocal(); paint(true); cloudSave();
  }
  function fmtDate(t) { try { return new Date(t).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  var selMode = false, selIds = {};
  function selCount() { return Object.keys(selIds).length; }
  function histUi() {
    $('#aiHistNew').hidden = selMode;
    $('#aiHistSel').textContent = selMode ? 'Annuler la sélection' : 'Choisir des conversations à supprimer';
    var d = $('#aiHistDel'); d.hidden = !selMode; d.disabled = !selCount(); d.textContent = 'Supprimer (' + selCount() + ')';
    histPaint();
  }
  function histPaint() {
    var box = $('#aiHistList'); box.textContent = '';
    var rows = [];
    if (mem.msgs.length) rows.push({ id: mem.id, title: cTitle(mem.msgs), t: mem.act || mem.t, cur: true });
    (mem.chats || []).forEach(function (c) { rows.push({ id: c.id, title: c.title, t: c.t }); });
    $('#aiHistSel').hidden = !rows.length;
    if (!rows.length) { var e = document.createElement('p'); e.className = 'ai-note'; e.textContent = 'Aucune conversation pour l’instant.'; box.appendChild(e); return; }
    rows.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'ai-hrow' + (r.cur ? ' cur' : '') + (selMode && selIds[r.id] ? ' on' : '');
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ai-hmain'; b.dataset.id = r.id;
      if (selMode) { var ck = document.createElement('span'); ck.className = 'ai-hck'; ck.textContent = selIds[r.id] ? '☑' : '☐'; ck.style.flex = 'none'; b.appendChild(ck); }
      var tx = document.createElement('span');
      var bt = document.createElement('b'); bt.textContent = r.title;
      var sm = document.createElement('small'); sm.textContent = (r.cur ? 'En cours · ' : '') + fmtDate(r.t);
      tx.appendChild(bt); tx.appendChild(sm); b.appendChild(tx); row.appendChild(b);
      box.appendChild(row);
    });
  }
  function selDelete() {
    var ids = Object.keys(selIds); if (!ids.length) return;
    if (!confirm('Supprimer ' + ids.length + ' conversation' + (ids.length > 1 ? 's' : '') + ' ? C’est définitif.')) return;
    var cur = !!selIds[mem.id];
    mem.chats = (mem.chats || []).filter(function (c) { return !selIds[c.id]; });
    if (cur) { mem.msgs = []; mem.id = newId(); mem.act = Date.now(); autoNote = false; paint(true); }
    selMode = false; selIds = {}; dirty = true; saveLocal(); histUi(); cloudSave();
  }
  function openChat(id) {
    if (busy) return;
    if (id === mem.id) { histSheet.hidden = true; return; }
    var i = -1; (mem.chats || []).forEach(function (c, k) { if (c.id === id) i = k; });
    if (i < 0) return;
    archive();
    var j = -1; mem.chats.forEach(function (c, k) { if (c.id === id) j = k; });
    var c = mem.chats.splice(j, 1)[0];
    mem.msgs = c.msgs.slice(); mem.id = c.id; mem.act = Date.now(); autoNote = false;
    dirty = true; saveLocal(); histSheet.hidden = true; paint(true); cloudSave();
  }
  $('#aiNew').addEventListener('click', newChat);
  $('#aiHistB').addEventListener('click', function () { selMode = false; selIds = {}; histUi(); histSheet.hidden = false; });
  $('#aiHistSel').addEventListener('click', function () { selMode = !selMode; selIds = {}; histUi(); });
  $('#aiHistDel').addEventListener('click', selDelete);
  $('#aiHistClose').addEventListener('click', function () { histSheet.hidden = true; });
  histSheet.addEventListener('click', function (e) { if (e.target === histSheet) histSheet.hidden = true; });
  $('#aiHistNew').addEventListener('click', function () { histSheet.hidden = true; newChat(); });
  $('#aiHistList').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]'); if (!b) return;
    var id = b.dataset.id;
    if (selMode) {
      if (id === mem.id && busy) return;
      if (selIds[id]) delete selIds[id]; else selIds[id] = 1;
      histUi(); return;
    }
    openChat(id);
  });
  $('#aiCfg').addEventListener('click', function () {
    $('#aiKey').value = savedKey(); $('#aiGroq').value = groqKey(); $('#aiOr').value = orKey(); $('#aiHf').value = hfKey(); refreshKeyUI(); fillModels();
    $('#aiFacts').value = mem.facts; status(); sheet.hidden = false;
  });
  $('#aiProv').addEventListener('change', function () { try { localStorage.setItem('uandi-ai-prov', this.value); } catch (e) {} });
  $('#aiKey').addEventListener('input', refreshKeyUI);
  $('#aiGroq').addEventListener('input', refreshKeyUI);
  $('#aiModel').addEventListener('change', modelNote);
  $('#aiShClose').addEventListener('click', function () { sheet.hidden = true; });
  $('#aiSave').addEventListener('click', function () {
    try { var k = $('#aiKey').value.trim(); if (k) localStorage.setItem(KK, k); else localStorage.removeItem(KK); } catch (e) {}
    try { var gq = $('#aiGroq').value.trim(); if (gq) localStorage.setItem('uandi-groq-key', gq); else localStorage.removeItem('uandi-groq-key'); } catch (e) {}
    try { var ok_ = $('#aiOr').value.trim(); if (ok_) localStorage.setItem('uandi-or-key', ok_); else localStorage.removeItem('uandi-or-key'); } catch (e) {}
    try { var hk_ = $('#aiHf').value.trim(); if (hk_) localStorage.setItem('uandi-hf-key', hk_); else localStorage.removeItem('uandi-hf-key'); } catch (e) {}
    try { localStorage.setItem('uandi-ai-model', $('#aiModel').value); } catch (e) {}
    MODELS = modelOrder(chosenModel()); verTag(); refreshKeyUI(); fillProv();
    var f = $('#aiFacts').value.trim().slice(0, 1200);
    if (f !== mem.facts) { mem.facts = f; dirty = true; saveLocal(); cloudSave(); }
    sheet.hidden = true;
  });
  $('#aiWipe').addEventListener('click', function () {
    if (!confirm('Effacer toute la mémoire de X.Uni et la conversation ?')) return;
    mem = mk({ t: Date.now() }); autoNote = false; turns = 0; dirty = true; saveLocal(false); $('#aiFacts').value = ''; paint(true); cloudSave();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (!P.hidden) { mem.act = Date.now(); saveLocal(false); } if (dirty || turns) flush(true); return; }
    if (!P.hidden && idleCheck()) { histSheet.hidden = true; paint(true); }
    if (busy && req && Date.now() - (req.last || 0) > 4000) { req.stall = true; req.abort(); }
  });
  window.uandiAI = { open: open, close: close };
} catch (e) { console.warn('Assistant IA :', e); } })();

/* E'cho — js/ui/clavier.js
   Suit la hauteur visible quand le clavier s’ouvre */
(function () {
  var vv = window.visualViewport; if (!vv) return;
  var root = document.documentElement;
  function sync() {
    var kb = window.innerHeight - vv.height;
    if (kb > 100) { root.style.setProperty('--vvh', vv.height + 'px'); }
    else { root.style.removeProperty('--vvh'); }
    if (kb > 100) window.scrollTo(0, 0);
    var log = document.getElementById('log');
    if (log && document.activeElement && document.activeElement.id === 'msg') {
      requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; });
    }
  }
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', function () { if (window.innerHeight - vv.height > 100) window.scrollTo(0, 0); });
  document.addEventListener('focusin', function (e) { if (e.target && e.target.id === 'msg') setTimeout(sync, 250); });
})();

/* E'cho — js/ui/reglages-sections.js
   Réglages : regroupe les blocs en sections repliables */
(function () { try {
  var dlg = document.getElementById('settings'); if (!dlg || dlg.dataset.sx) return; dlg.dataset.sx = '1';
  var I = {
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2.2-.5-1.2.3-2.3 1.7-2.3H17a4 4 0 0 0 4-4c0-5-4-9.5-9-9.500z"/><circle cx="7.5" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="16" cy="8.5" r="1"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.500M17.5 17.500L19 19M5 19l1.5-1.500M17.5 6.500L19 5"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    cake: '<path d="M4 20h16v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M12 12V8M12 4v1"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
    badge: '<circle cx="12" cy="9" r="5"/><path d="M9 13.500L8 21l4-2 4 2-1-7.5"/>',
    tools: '<path d="M14 6a4 4 0 0 0 5 5l-9 9a2 2 0 0 1-3-3z"/><path d="M14 6l3-3 3 3-3 3"/>',
    key: '<circle cx="8" cy="14" r="4"/><path d="M11 11l9-8M16 6l3 3"/>',
    bell: '<path d="M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    chev: '<path d="M9 6l6 6-6 6"/>'
  };
  var M = {
    'Fonctionnalités': ['star', 'Active ou coupe chaque option'],
    'Application': ['download', 'Installer sur ce téléphone'],
    'Photo de profil': ['user', 'Changer ou retirer ta photo'],
    'Mon nom': ['pencil', 'Modifier ton nom'],
    'Style': ['palette', 'Défaut, Nuit, Clair, Forêt…'],
    'Apparence': ['sun', 'Auto, clair ou sombre'],
    'Verrouillage': ['lock', 'Code et empreinte'],
    'Mon anniversaire': ['cake', 'Visible par tes amis'],
    'Confidentialité': ['shield', 'Statut en ligne et « Vu »'],
    'Badge créateur': ['badge', 'Activer ton badge'],
    'Outils créateur': ['tools', 'Comptes et statistiques'],
    'Mot de passe': ['key', 'Changer et récupérer'],
    'Notifications': ['bell', 'Push, son et ne pas déranger'],
    'Espace': ['box', 'Libérer de la place'],
    'Compte': ['trash', 'Supprimer mon compte']
  };
  function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + I[n] + '</svg>'; }
  var all = [];
  function closeAll(except) {
    all.forEach(function (x) { if (x.sec !== except) { x.body.hidden = true; x.h.setAttribute('aria-expanded', 'false'); x.sec.classList.remove('open'); } });
  }
  Array.prototype.forEach.call(dlg.children, function (sec) {
    if (!sec.classList || !sec.classList.contains('sec')) return;
    var l = null; Array.prototype.forEach.call(sec.children, function (c) { if (!l && c.classList.contains('lbl')) l = c; });
    if (!l) return;
    var t = l.textContent.trim(), m = null;
    Object.keys(M).forEach(function (k) { if (t.indexOf(k) === 0) m = M[k]; });
    if (!m) m = ['user', ''];
    var body = document.createElement('div'); body.className = 'sxb'; body.hidden = true;
    while (sec.firstChild) body.appendChild(sec.firstChild);
    l.style.display = 'none';
    var h = document.createElement('button'); h.type = 'button'; h.className = 'sxh'; h.setAttribute('aria-expanded', 'false');
    h.innerHTML = '<span class="sxi">' + svg(m[0]) + '</span><span class="sxt"><b></b><small></small></span><span class="sxc">' + svg('chev') + '</span>';
    h.querySelector('b').textContent = t; h.querySelector('small').textContent = m[1];
    sec.appendChild(h); sec.appendChild(body); sec.classList.add('sx');
    if (t.indexOf('Compte') === 0) sec.classList.add('dg');
    all.push({ sec: sec, h: h, body: body });
    h.addEventListener('click', function () {
      var open = body.hidden;
      closeAll(sec);
      body.hidden = !open; h.setAttribute('aria-expanded', open ? 'true' : 'false'); sec.classList.toggle('open', open);
      if (open) setTimeout(function () { try { sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }, 60);
    });
  });
  dlg.addEventListener('close', function () { closeAll(null); });
} catch (e) { console.warn('Réglages :', e); } })();

/* E'cho — js/ui/reglages-recherche.js
   Réglages : recherche et sous-titres en direct */
(function () { try {
  var dlg = document.getElementById('settings'); if (!dlg || dlg.dataset.sxs) return; dlg.dataset.sxs = '1';
  var h2 = dlg.querySelector('h2'); if (!h2) return;
  var wrap = document.createElement('div'); wrap.className = 'sxs';
  wrap.innerHTML = '<input type="search" id="sxSearch" placeholder="Rechercher un réglage…" autocomplete="off" autocapitalize="none" spellcheck="false" aria-label="Rechercher un réglage"><p class="sxe" id="sxEmpty" hidden>Aucun réglage trouvé.</p>';
  h2.after(wrap);
  var KW = {
    'Application': 'installer appli ecran accueil telecharger',
    'Photo de profil': 'photo avatar image',
    'Mon nom': 'pseudo prenom nom changer',
    'Style': 'theme couleur skin nuit clair foret rose neant',
    'Apparence': 'sombre clair auto mode',
    'Verrouillage': 'code pin empreinte securite cadenas',
    'Mon anniversaire': 'date fete',
    'Confidentialité': 'statut en ligne vu lu invisible prive',
    'Badge': 'createur certifie assistant pilule animation',
    'Fonctionnalités': 'options extra xuni assistant raccourcis commandes badge animation createur tableau',
    'Outils': 'comptes statistiques signalements annonce',
    'Mot de passe': 'securite recuperation code',
    'Notifications': 'notification push son vibration voix sourdine silence ne pas deranger alerte calme',
    'Espace': 'stockage photos liberer place',
    'Compte': 'supprimer effacer compte'
  };
  function norm(t) { return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function secs() { return Array.prototype.slice.call(dlg.querySelectorAll('.sec.sx')); }
  function titleOf(sec) { var b = sec.querySelector('.sxh b'); return b ? b.textContent.trim() : ''; }
  function keyOf(sec) { var t = titleOf(sec), k = ''; Object.keys(KW).forEach(function (x) { if (t.indexOf(x) === 0) k = KW[x]; }); return k; }
  var inp = document.getElementById('sxSearch');
  inp.addEventListener('input', function () {
    var q = norm(inp.value), shown = [];
    secs().forEach(function (sec) {
      if (sec.hidden) return;
      var sm = sec.querySelector('.sxh small'), hay = norm(titleOf(sec) + ' ' + (sm ? sm.textContent : '') + ' ' + keyOf(sec));
      var ok = !q || q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
      sec.classList.toggle('sx-off', !ok); if (ok) shown.push(sec);
    });
    document.getElementById('sxEmpty').hidden = !q || shown.length > 0;
    if (q && shown.length === 1 && !shown[0].classList.contains('open')) { var h = shown[0].querySelector('.sxh'); if (h) h.click(); }
  });
  function sub(title, text) {
    secs().forEach(function (sec) { if (titleOf(sec).indexOf(title) === 0) { var sm = sec.querySelector('.sxh small'); if (sm && text) sm.textContent = text; } });
  }
  function pressed(sel) { var b = dlg.querySelector(sel + ' button[aria-pressed="true"]'); return b ? b.textContent.trim() : ''; }
  function live() {
    sub('Style', pressed('#skinSeg'));
    sub('Apparence', pressed('#modeSeg'));
    var off = document.getElementById('lockOff'); sub('Verrouillage', off && !off.hidden ? 'Code actif' : 'Pas de code');
    var a = document.getElementById('hideOnBtn'), v = document.getElementById('hideSeenBtn'), hid = [];
    if (a && a.getAttribute('aria-pressed') === 'true') hid.push('Statut masqué');
    if (v && v.getAttribute('aria-pressed') === 'true') hid.push('« Vu » masqué');
    sub('Confidentialité', hid.length ? hid.join(' · ') : 'Tout visible');
  }
  new MutationObserver(function () { if (dlg.open) { live(); inp.value = ''; inp.dispatchEvent(new Event('input')); } }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
  dlg.addEventListener('click', function () { setTimeout(live, 80); });
  live();
} catch (e) { console.warn('Réglages (recherche) :', e); } })();

/* E'cho — js/ui/actualites-replie.js
   Actualités : l’en-tête se replie quand on fait défiler */
(function(){
  var pane=document.getElementById('nwPaneFeed'),feed=document.getElementById('nwFeed');
  if(!pane||!feed)return;
  var last=0,lock=0,box=pane.querySelector(':scope>.nwbox');
  function set(on){pane.classList.toggle('nw-collapse',on);lock=Date.now()+380;}
  feed.addEventListener('scroll',function(){
    var y=feed.scrollTop,d=y-last,col=pane.classList.contains('nw-collapse');
    last=y;
    if(Date.now()<lock)return;
    if(pane.classList.contains('open')||(box&&box.contains(document.activeElement))){if(col)set(false);return;}
    if(!col&&d>8&&y>40&&feed.scrollHeight-feed.clientHeight>260)set(true);
    else if(col&&y<=2)set(false);
  },{passive:true});
  feed.addEventListener('pointerdown',function(){if(feed.scrollTop<=2&&pane.classList.contains('nw-collapse'))set(false);},true);
})();
