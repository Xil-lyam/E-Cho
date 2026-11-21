/* X'enify — page de recherche (comme TikTok) : s'ouvre en plein écran depuis la loupe de la liste des discussions.
   Récents, personnes les plus aimées, résultats en direct (Tout / Profils / Discussions), like d'un profil en un appui. */
(function () {
  'use strict';
  var root = null, input, body, tabsEl, goBtn, clearBtn;
  var tab = 'all', query = '', timer = 0, seq = 0, popCache = { t: 0, rows: [] };
  var MY = { likes: {} };

  function sb() { return window.__sb; }
  function me() { try { return window.__xenUser ? window.__xenUser.uid : ''; } catch (e) { return ''; } }
  function api() { return window.__xenSearch; }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function svg(path, size) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size || 20); s.setAttribute('height', size || 20);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = path; return s;
  }
  var I = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.8 3.6 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.4 0 5.3 3.3 4.2 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/>',
    msg: '<path d="M4 5h16v11H9l-5 4z"/>'
  };

  /* ---------- récents (gardés sur cet appareil) ---------- */
  function rKey() { return 'xen-recents-' + me(); }
  function recents() { try { var a = JSON.parse(localStorage.getItem(rKey()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveRecents(a) { try { localStorage.setItem(rKey(), JSON.stringify(a.slice(0, 8))); } catch (e) {} }
  function pushRecent(q) {
    q = q.trim(); if (q.length < 2) return;
    saveRecents([q].concat(recents().filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })));
  }

  /* ---------- avatar ---------- */
  var HUES = ['#a0522d', '#7b5cd6', '#2b8a6e', '#c2305f', '#356fb5', '#b7791f', '#0e7490'];
  function avatar(name, photo, uid) {
    var a = el('span', 'xsr-av');
    var nm = String(name || '?');
    var h = 0, k = String(uid || nm); for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    a.style.background = HUES[h % HUES.length];
    a.textContent = nm.charAt(0).toUpperCase();
    if (typeof photo === 'string' && /^(https?:|data:image)/.test(photo)) {
      var im = new Image(); im.alt = ''; im.decoding = 'async'; im.loading = 'lazy';
      im.onload = function () { a.textContent = ''; a.appendChild(im); };
      im.src = photo;
    }
    return a;
  }
  function mark(text, q) {
    var f = document.createDocumentFragment(), t = String(text || ''), i = q ? t.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) { f.appendChild(document.createTextNode(t)); return f; }
    f.appendChild(document.createTextNode(t.slice(0, i)));
    var m = el('mark', '', t.slice(i, i + q.length)); f.appendChild(m);
    f.appendChild(document.createTextNode(t.slice(i + q.length)));
    return f;
  }
  function fmt(n) { return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + ' k' : String(n); }

  /* ---------- données ---------- */
  function clean(q) { return String(q || '').replace(/^@/, '').replace(/[,()*%\\"'<>;:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function likeCounts(ids) {
    if (!ids.length) return Promise.resolve({});
    return sb().from('profile_likes').select('to_uid,from_uid').in('to_uid', ids).then(function (r) {
      var m = {}; ids.forEach(function (i) { m[i] = 0; });
      (r.data || []).forEach(function (d) { m[d.to_uid] = (m[d.to_uid] || 0) + 1; if (d.from_uid === me()) MY.likes[d.to_uid] = true; });
      return m;
    }).catch(function () { return {}; });
  }
  function withLikes(rows) {
    var ids = rows.map(function (r) { return r.id; });
    return likeCounts(ids).then(function (m) { rows.forEach(function (r) { r.likes = m[r.id] || 0; }); return rows; });
  }
  function findProfiles(q) {
    var s = clean(q); if (!s) return Promise.resolve([]);
    return sb().from('profiles').select('id,name,username,photo,badge,verified')
      .or('username.ilike.%' + s + '%,name.ilike.%' + s + '%').neq('id', me()).limit(30)
      .then(function (r) { if (r.error) throw r.error; return withLikes(r.data || []); })
      .then(function (rows) {
        var low = s.toLowerCase();
        function rank(x) { var u = String(x.username || '').toLowerCase(), n = String(x.name || '').toLowerCase(); return u === low ? 0 : (u.indexOf(low) === 0 || n.indexOf(low) === 0) ? 1 : 2; }
        rows.sort(function (a, b) { return rank(a) - rank(b) || b.likes - a.likes; });
        return rows;
      });
  }
  function popular() {
    if (Date.now() - popCache.t < 60000 && popCache.rows.length) return Promise.resolve(popCache.rows);
    return sb().from('profiles').select('id,name,username,photo,badge,verified').neq('id', me()).order('seen', { ascending: false, nullsFirst: false }).limit(40)
      .then(function (r) { if (r.error) throw r.error; return withLikes(r.data || []); })
      .then(function (rows) { rows.sort(function (a, b) { return b.likes - a.likes; }); popCache = { t: Date.now(), rows: rows.slice(0, 8) }; return popCache.rows; });
  }

  /* ---------- like d'un profil ---------- */
  function toggleLike(row, btn) {
    var uid = row.id, was = !!MY.likes[uid];
    MY.likes[uid] = !was; row.likes = Math.max(0, (row.likes || 0) + (was ? -1 : 1)); paintLike(row, btn);
    var p = was ? sb().from('profile_likes').delete().eq('to_uid', uid).eq('from_uid', me())
                : sb().from('profile_likes').insert({ to_uid: uid, from_uid: me() });
    Promise.resolve(p).then(function (r) { if (r && r.error) throw r.error; }).catch(function () {
      MY.likes[uid] = was; row.likes = Math.max(0, row.likes + (was ? 1 : -1)); paintLike(row, btn);
      toast('Le like n’a pas pu être enregistré. Vérifie ta connexion.');
    });
  }
  function paintLike(row, btn) {
    var on = !!MY.likes[row.id];
    btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.querySelector('.n').textContent = fmt(row.likes || 0);
    if (on) { btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop'); }
  }
  var toastT = 0;
  function toast(t) {
    var n = root.querySelector('.xsr-toast'); if (!n) { n = el('div', 'xsr-toast'); n.setAttribute('role', 'status'); root.appendChild(n); }
    n.textContent = t; n.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { n.classList.remove('on'); }, 2600);
  }

  /* ---------- rendu ---------- */
  function profileRow(r) {
    var li = el('li', 'xsr-row'), main = el('button', 'xsr-main'); main.type = 'button';
    main.appendChild(avatar(r.name || r.username, r.photo, r.id));
    var info = el('span', 'xsr-info');
    var nm = el('span', 'xsr-nm'); nm.appendChild(mark(r.name || r.username, query));
    if (r.badge || r.verified) { var b = el('i', 'xsr-cert'); b.title = 'Compte certifié'; b.appendChild(svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 11)); nm.appendChild(b); }
    info.appendChild(nm);
    var un = el('span', 'xsr-un'); un.appendChild(document.createTextNode('@')); un.appendChild(mark(r.username || '', query)); info.appendChild(un);
    main.appendChild(info);
    main.addEventListener('click', function () {
      if (window.UIProfile && UIProfile.open) UIProfile.open(r.id, r.name || r.username);
      pushRecent(query || r.username || '');
    });
    li.appendChild(main);
    var like = el('button', 'xsr-like'); like.type = 'button'; like.setAttribute('aria-label', 'Aimer ce profil');
    like.appendChild(svg(I.heart, 20)); like.appendChild(el('span', 'n', '0'));
    paintLike(r, like); like.classList.remove('pop');
    like.addEventListener('click', function (e) { e.stopPropagation(); toggleLike(r, like); });
    li.appendChild(like);
    var w = el('button', 'xsr-write'); w.type = 'button'; w.setAttribute('aria-label', 'Écrire à ' + (r.name || r.username));
    w.appendChild(svg(I.msg, 18));
    w.addEventListener('click', function (e) {
      e.stopPropagation(); pushRecent(query || r.username || ''); close();
      if (api()) api().openUser(r.id, r.name || r.username);
    });
    li.appendChild(w);
    return li;
  }
  function chatRow(c) {
    var li = el('li', 'xsr-row'), main = el('button', 'xsr-main'); main.type = 'button';
    main.appendChild(avatar(c.name, '', c.uid || c.id));
    var info = el('span', 'xsr-info');
    var nm = el('span', 'xsr-nm'); nm.appendChild(mark(c.name, query)); info.appendChild(nm);
    var pv = el('span', 'xsr-un'); pv.appendChild(mark(c.last.slice(0, 120), query)); info.appendChild(pv);
    main.appendChild(info);
    main.addEventListener('click', function () { pushRecent(query); close(); if (api()) api().openChat(c); });
    li.appendChild(main);
    return li;
  }
  function section(title, rows, more) {
    var s = el('section', 'xsr-sec'), h = el('div', 'xsr-h'); h.appendChild(el('h2', '', title));
    if (more) { var b = el('button', 'xsr-more', 'Voir tout'); b.type = 'button'; b.addEventListener('click', more); h.appendChild(b); }
    s.appendChild(h); var ul = el('ul', 'xsr-list'); rows.forEach(function (r) { ul.appendChild(r); }); s.appendChild(ul); return s;
  }
  function skeleton() {
    body.replaceChildren();
    var ul = el('ul', 'xsr-list xsr-skel'); for (var i = 0; i < 5; i++) { var li = el('li', 'xsr-row'); li.appendChild(el('span', 'xsr-av')); var t = el('span', 'xsr-info'); t.appendChild(el('span', 'xsr-bar')); t.appendChild(el('span', 'xsr-bar s')); li.appendChild(t); ul.appendChild(li); }
    body.appendChild(ul);
  }
  function note(title, text) {
    var d = el('div', 'xsr-empty'); d.appendChild(el('strong', '', title)); d.appendChild(el('p', '', text)); return d;
  }

  function renderHome() {
    var my = ++seq;
    body.replaceChildren();
    var rec = recents();
    if (rec.length) {
      var s = el('section', 'xsr-sec'), h = el('div', 'xsr-h'); h.appendChild(el('h2', '', 'Récents'));
      var all = el('button', 'xsr-more', 'Tout effacer'); all.type = 'button'; all.addEventListener('click', function () { saveRecents([]); renderHome(); }); h.appendChild(all); s.appendChild(h);
      var ul = el('ul', 'xsr-list');
      rec.forEach(function (q) {
        var li = el('li', 'xsr-row slim'), b = el('button', 'xsr-main'); b.type = 'button';
        var ic = el('span', 'xsr-ic'); ic.appendChild(svg(I.clock, 18)); b.appendChild(ic);
        b.appendChild(el('span', 'xsr-nm plain', q));
        b.addEventListener('click', function () { input.value = q; onInput(true); });
        li.appendChild(b);
        var x = el('button', 'xsr-x'); x.type = 'button'; x.setAttribute('aria-label', 'Retirer « ' + q + ' »'); x.appendChild(svg(I.x, 16));
        x.addEventListener('click', function () { saveRecents(recents().filter(function (v) { return v !== q; })); renderHome(); });
        li.appendChild(x); ul.appendChild(li);
      });
      s.appendChild(ul); body.appendChild(s);
    }
    var pop = el('section', 'xsr-sec xsr-pop'); pop.appendChild(el('div', 'xsr-h')).appendChild(el('h2', '', 'Les plus aimés'));
    var pl = el('ul', 'xsr-list'); pop.appendChild(pl); body.appendChild(pop);
    for (var i = 0; i < 3; i++) { var sk = el('li', 'xsr-row xsr-skel'); sk.appendChild(el('span', 'xsr-av')); var t = el('span', 'xsr-info'); t.appendChild(el('span', 'xsr-bar')); t.appendChild(el('span', 'xsr-bar s')); sk.appendChild(t); pl.appendChild(sk); }
    popular().then(function (rows) {
      if (my !== seq) return; pl.replaceChildren();
      if (!rows.length) { pop.remove(); return; }
      rows.forEach(function (r) { pl.appendChild(profileRow(r)); });
    }).catch(function () { if (my === seq) pop.remove(); });
  }

  function renderResults(people, chats) {
    body.replaceChildren();
    var q = query;
    if (tab === 'people') {
      if (!people.length) { body.appendChild(note('Aucune personne trouvée', 'Essaie un autre nom ou cherche par @identifiant.')); return; }
      body.appendChild(section('Profils', people.map(profileRow))); return;
    }
    if (tab === 'chats') {
      if (!chats.length) { body.appendChild(note('Aucune discussion trouvée', 'La recherche porte sur les noms et le dernier message de chaque discussion.')); return; }
      body.appendChild(section('Discussions', chats.map(chatRow))); return;
    }
    if (!people.length && !chats.length) { body.appendChild(note('Aucun résultat pour « ' + q + ' »', 'Vérifie l’orthographe ou cherche par @identifiant.')); return; }
    if (people.length) body.appendChild(section('Profils', people.slice(0, 5).map(profileRow), people.length > 5 ? function () { setTab('people'); } : null));
    if (chats.length) body.appendChild(section('Discussions', chats.slice(0, 4).map(chatRow), chats.length > 4 ? function () { setTab('chats'); } : null));
  }

  var last = { people: [], chats: [] };
  function run() {
    var q = clean(input.value); query = q;
    if (!q) { last = { people: [], chats: [] }; renderHome(); return; }
    var my = ++seq;
    var chats = api() ? api().chats(q) : [];
    last.chats = chats;
    if (tab === 'chats') { renderResults([], chats); return; }
    skeleton();
    findProfiles(q).then(function (rows) { if (my !== seq) return; last.people = rows; renderResults(rows, chats); })
      .catch(function () { if (my !== seq) return; body.replaceChildren(); if (chats.length && tab === 'all') { body.appendChild(section('Discussions', chats.map(chatRow))); } body.appendChild(note('Recherche de profils impossible', 'Vérifie ta connexion et réessaie.')); });
  }
  function setTab(t) {
    tab = t;
    [].forEach.call(tabsEl.children, function (b) { var on = b.dataset.t === t; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    if (clean(input.value)) {
      if (t === 'chats') renderResults([], last.chats); else if (last.people.length || t === 'all') run(); else run();
    }
  }
  function onInput(now) {
    clearBtn.hidden = !input.value; goBtn.hidden = !input.value;
    clearTimeout(timer);
    if (now === true) { run(); return; }
    timer = setTimeout(run, 230);
  }

  /* ---------- ouverture / fermeture ---------- */
  function build() {
    if (root) return;
    root = el('section', 'xsr'); root.id = 'xsr'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Recherche');
    var top = el('div', 'xsr-top');
    var back = el('button', 'xsr-back'); back.type = 'button'; back.setAttribute('aria-label', 'Retour'); back.appendChild(svg(I.back, 24)); back.addEventListener('click', close);
    var form = el('form', 'xsr-field'); form.setAttribute('role', 'search');
    form.appendChild(svg(I.search, 18));
    input = el('input'); input.type = 'search'; input.placeholder = 'Personnes ou discussions'; input.autocomplete = 'off'; input.autocapitalize = 'none'; input.spellcheck = false; input.enterKeyHint = 'search'; input.setAttribute('aria-label', 'Rechercher');
    form.appendChild(input);
    clearBtn = el('button', 'xsr-clear'); clearBtn.type = 'button'; clearBtn.hidden = true; clearBtn.setAttribute('aria-label', 'Effacer'); clearBtn.appendChild(svg(I.x, 14));
    clearBtn.addEventListener('click', function () { input.value = ''; onInput(true); input.focus(); });
    form.appendChild(clearBtn);
    form.addEventListener('submit', function (e) { e.preventDefault(); pushRecent(clean(input.value)); onInput(true); input.blur(); });
    goBtn = el('button', 'xsr-go', 'Rechercher'); goBtn.type = 'button'; goBtn.hidden = true;
    goBtn.addEventListener('click', function () { form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); });
    top.appendChild(back); top.appendChild(form); top.appendChild(goBtn);
    tabsEl = el('div', 'xsr-tabs'); tabsEl.setAttribute('role', 'tablist');
    [['all', 'Tout'], ['people', 'Profils'], ['chats', 'Discussions']].forEach(function (t) {
      var b = el('button', 'xsr-tab', t[1]); b.type = 'button'; b.dataset.t = t[0]; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', t[0] === 'all' ? 'true' : 'false');
      b.addEventListener('click', function () { setTab(t[0]); }); tabsEl.appendChild(b);
    });
    body = el('div', 'xsr-body');
    root.appendChild(top); root.appendChild(tabsEl); root.appendChild(body);
    input.addEventListener('input', function () { onInput(); });
    root.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(root);
  }
  function open() {
    build(); MY.likes = {}; tab = 'all'; setTab('all'); input.value = ''; query = ''; onInput(true);
    root.hidden = false; root.classList.remove('out'); void root.offsetWidth; root.classList.add('in');
    document.documentElement.classList.add('xsr-open');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
  }
  function close() {
    if (!root || root.hidden) return;
    clearTimeout(timer); seq++;
    document.documentElement.classList.remove('xsr-open');
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.classList.remove('in'); root.classList.add('out'); try { input.blur(); } catch (e) {}
    setTimeout(function () { if (root.classList.contains('out')) root.hidden = true; }, reduce ? 0 : 180);
  }

  /* la loupe de la liste ouvre cette page (avant l'ancien champ « nom d'utilisateur ») */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#searchBtn');
    if (!b || !me()) return;
    e.preventDefault(); e.stopImmediatePropagation(); open();
  }, true);
  window.addEventListener('xen-search-close', close);
  window.XenSearch = { open: open, close: close };
})();
