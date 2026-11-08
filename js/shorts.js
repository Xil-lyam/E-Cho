/* E'cho — js/shorts.js
   Accueil = fil de Shorts YouTube au hasard, différent pour chaque utilisateur.
   Sources (config.js > shorts) : channels (UC…), playlists, queries (mots-clés).
   Chaque utilisateur a son profil (vus / affinités par chaîne) : ce qu'il regarde jusqu'au bout
   fait remonter des vidéos proches, ce qu'il passe vite les fait disparaître. */
(function () {
  'use strict';
  var CFG = (window.APP_CONFIG && window.APP_CONFIG.shorts) || {};
  var KEY = String(CFG.apiKey || '');
  var MAXS = +CFG.maxSeconds || 60;
  var API = 'https://www.googleapis.com/youtube/v3/';
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ---------- sources ---------- */
  var sources = [];
  (CFG.channels || []).forEach(function (c) {
    c = String(c || '').trim();
    var m = /youtube\.com\/channel\/(UC[\w-]{22})/.exec(c) || /(?:youtube\.com\/|^)(@[^\s\/?#]+)/.exec(c);  /* accepte aussi un lien collé en entier */
    if (m) c = m[1];
    try { c = decodeURIComponent(c); } catch (e) {}
    var key = '';
    if (/^UC[\w-]{22}$/.test(c)) key = 'c:' + c;                                    /* identifiant de chaîne */
    else if (/^@?[^\s\/@?#]{3,}$/.test(c)) key = 'h:@' + c.replace(/^@/, '');       /* nom d'utilisateur @… (accents permis) */
    if (!key || sources.some(function (x) { return (x.t + ':' + x.v).toLowerCase() === key.toLowerCase(); })) return; /* doublons ignorés */
    sources.push({ t: key[0], v: key.slice(2) });
  });
  (CFG.playlists || []).forEach(function (p) { if (/^[\w-]{10,}$/.test(p)) sources.push({ t: 'p', v: p }); });
  (CFG.queries || []).forEach(function (q) { if (q) sources.push({ t: 'q', v: String(q) }); });
  function ready() { return KEY.length > 20 && KEY.indexOf('COLLE') < 0 && sources.length > 0; }

  function api(path, params) {
    params.key = KEY;
    var q = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API + path + '?' + q).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || j.error) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
        return j;
      });
    });
  }
  function isoSec(d) {
    var m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d || '');
    return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
  }
  function details(ids, src) {
    if (!ids.length) return Promise.resolve([]);
    return api('videos', { part: 'contentDetails,status,snippet', id: ids.slice(0, 50).join(','), maxResults: 50 }).then(function (j) {
      return (j.items || []).filter(function (v) {
        var s = isoSec(v.contentDetails && v.contentDetails.duration);
        return v.status && v.status.embeddable && v.status.privacyStatus === 'public' && s > 0 && s <= MAXS;
      }).map(function (v) {
        return { id: v.id, ch: v.snippet.channelId, chn: v.snippet.channelTitle, title: v.snippet.title, dur: isoSec(v.contentDetails.duration), src: src };
      });
    });
  }
  function resolveHandle(h) {
    var ck = 'echo-shorts-h:' + h;
    try { var c = localStorage.getItem(ck); if (c) return Promise.resolve(c); } catch (e) {}
    return api('channels', { part: 'id', forHandle: h }).then(function (j) {
      var id = j.items && j.items[0] && j.items[0].id;
      if (id) { try { localStorage.setItem(ck, id); } catch (e) {} }
      return id || '';
    });
  }
  function fetchSource(s) {
    if (s.t === 'h') {
      return resolveHandle(s.v).then(function (id) {
        if (!id) { s.done = true; return []; }
        s.t = 'c'; s.v = id; return fetchSource(s);
      });
    }
    var key = s.t + ':' + s.v, first = !s.next;
    if (s.t === 'q') {
      var ck = 'echo-shorts-q:' + s.v;
      if (first) {
        try {
          var c = JSON.parse(localStorage.getItem(ck) || 'null');
          if (c && Date.now() - c.t < 6 * 36e5) { s.next = c.n || ''; if (!s.next) s.done = true; return Promise.resolve(c.v.map(function (v) { v.src = key; return v; })); }
        } catch (e) {}
      }
      var p = { part: 'id', type: 'video', videoDuration: 'short', q: s.v, maxResults: 50, safeSearch: 'moderate', regionCode: CFG.region || 'FR', relevanceLanguage: CFG.lang || 'fr' };
      if (s.next) p.pageToken = s.next;
      return api('search', p).then(function (j) {
        s.next = j.nextPageToken || ''; if (!s.next) s.done = true;
        return details((j.items || []).map(function (i) { return i.id && i.id.videoId; }).filter(Boolean), key);
      }).then(function (arr) {
        if (first) { try { localStorage.setItem(ck, JSON.stringify({ t: Date.now(), n: s.next, v: arr })); } catch (e) {} }
        return arr;
      });
    }
    var pl = s.t === 'c' ? 'UU' + s.v.slice(2) : s.v;
    var pp = { part: 'contentDetails', playlistId: pl, maxResults: 50 };
    if (s.next) pp.pageToken = s.next;
    return api('playlistItems', pp).then(function (j) {
      s.next = j.nextPageToken || ''; if (!s.next) s.done = true;
      return details((j.items || []).map(function (i) { return i.contentDetails && i.contentDetails.videoId; }).filter(Boolean), key);
    });
  }

  /* ---------- profil de l'utilisateur ---------- */
  var uid = '', prof = null, seenSet = {}, pool = [], poolIds = {}, inFeed = {}, lastErr = null, loading = null, lastPush = 0;
  function curUid() { try { var u = firebase.auth().currentUser; return u ? u.uid : 'anon'; } catch (e) { return 'anon'; } }
  function emptyProf() { return { seen: [], aff: {}, ban: {}, likes: {} }; }
  function loadProf() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem('echo-shorts-v1-' + uid) || 'null'); } catch (e) {}
    p = p || emptyProf();
    p.seen = p.seen || []; p.aff = p.aff || {}; p.ban = p.ban || {}; p.likes = p.likes || {};
    Object.keys(p.aff).forEach(function (k) { p.aff[k] = Math.round(p.aff[k] * 95) / 100; }); /* les goûts évoluent */
    return p;
  }
  function rebuildSeen() { seenSet = {}; prof.seen.forEach(function (i) { seenSet[i] = 1; }); }
  function saveProf() {
    try { localStorage.setItem('echo-shorts-v1-' + uid, JSON.stringify(prof)); } catch (e) {}
    var now = Date.now(); if (now - lastPush < 30000) return; lastPush = now; pushRemote();
  }
  function remoteRef() { try { return firebase.firestore().collection('shortsProfiles').doc(uid); } catch (e) { return null; } }
  function pushRemote() { var r = remoteRef(); if (r && uid !== 'anon') r.set({ p: JSON.stringify(prof), t: Date.now() }).catch(function () {}); }
  function pullRemote() {
    var r = remoteRef(); if (!r || uid === 'anon') return;
    r.get().then(function (d) {
      if (!d.exists) return;
      var rp = JSON.parse(d.data().p || '{}');
      (rp.seen || []).forEach(function (i) { if (!seenSet[i]) { prof.seen.push(i); seenSet[i] = 1; } });
      Object.keys(rp.aff || {}).forEach(function (k) { if (prof.aff[k] == null) prof.aff[k] = rp.aff[k]; });
      Object.keys(rp.ban || {}).forEach(function (k) { prof.ban[k] = 1; });
      Object.keys(rp.likes || {}).forEach(function (k) { prof.likes[k] = 1; });
      try { localStorage.setItem('echo-shorts-v1-' + uid, JSON.stringify(prof)); } catch (e) {}
    }).catch(function () {});
  }
  function bump(k, d) { if (!k) return; prof.aff[k] = Math.max(-10, Math.min(12, (prof.aff[k] || 0) + d)); }
  function markSeen(id) {
    if (seenSet[id]) return; seenSet[id] = 1; prof.seen.push(id);
    if (prof.seen.length > 800) { var old = prof.seen.shift(); delete seenSet[old]; }
    saveProf();
  }

  /* ---------- choix au hasard, pondéré par les goûts ---------- */
  function avail() { return pool.filter(function (v) { return !seenSet[v.id] && !inFeed[v.id] && !prof.ban[v.ch]; }); }
  function pick(n) {
    var av = shuffle(avail()), out = [];
    while (out.length < n && av.length) {
      var explore = Math.random() < 0.5;
      var ws = av.map(function (v) {
        if (explore) return 1;
        var a = (prof.aff[v.ch] || 0) + 0.5 * (prof.aff[v.src] || 0);
        return Math.exp(0.45 * Math.max(-6, Math.min(8, a)));
      });
      var tot = ws.reduce(function (a, b) { return a + b; }, 0), r = Math.random() * tot, i = 0;
      for (; i < ws.length - 1; i++) { r -= ws[i]; if (r <= 0) break; }
      out.push(av.splice(i, 1)[0]);
    }
    return out;
  }
  function refill() {
    if (loading) return loading;
    var live = shuffle(sources.filter(function (s) { return !s.done; }));
    live.sort(function (a, b) { return ((prof.aff[b.t + ':' + b.v] || 0) - (prof.aff[a.t + ':' + a.v] || 0)) * (Math.random() < 0.5 ? 1 : 0); });
    loading = Promise.all(live.slice(0, 6).map(function (s) {
      return fetchSource(s).catch(function (e) { lastErr = e; s.fail = (s.fail || 0) + 1; if (s.fail > 2) s.done = true; return []; });
    })).then(function (arrs) {
      arrs.forEach(function (a) { a.forEach(function (v) { if (!poolIds[v.id]) { poolIds[v.id] = 1; pool.push(v); } }); });
      loading = null;
    }, function () { loading = null; });
    return loading;
  }
  function ensure(n) {
    return new Promise(function (res) {
      (function loop(tries) {
        if (avail().length >= n || tries > 4) return res();
        if (!sources.some(function (s) { return !s.done; })) {
          if (!avail().length && pool.length) { prof.seen = prof.seen.slice(Math.floor(prof.seen.length / 2)); rebuildSeen(); } /* tout vu : on recycle les plus anciens */
          return res();
        }
        refill().then(function () { loop(tries + 1); });
      })(0);
    });
  }

  /* ---------- lecteur YouTube ---------- */
  var ytP = null;
  function loadYT() {
    if (ytP) return ytP;
    ytP = new Promise(function (res) {
      if (window.YT && YT.Player) return res();
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { try { if (prev) prev(); } catch (e) {} res(); };
      var s = doc.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; doc.head.appendChild(s);
    });
    return ytP;
  }

  /* cache le bouton flottant « Écrire » (et ses ombres) tant qu'on est dans les Shorts */
  var fabHidden = [], fabTimer = 0;
  function scanFabs() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var all = doc.querySelectorAll('#app *, body > *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.offsetParent !== null || el.dataset.shFab || el.id === 'tabbar' || el.id === 'shortsOv' || el.tagName === 'SCRIPT' || el.tagName === 'DIALOG') continue;
      if (el.closest('#shortsOv, #tabbar, .mksheet, dialog')) continue;
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.width < 30 || r.width > 260 || r.height > 140 || r.left < vw * 0.4 || r.top < vh * 0.5) continue;
      el.dataset.shFab = '1'; el.style.setProperty('visibility', 'hidden', 'important'); fabHidden.push(el);
    }
  }
  function fabsOn() { scanFabs(); clearInterval(fabTimer); fabTimer = setInterval(scanFabs, 1200); }
  function fabsOff() {
    clearInterval(fabTimer);
    fabHidden.forEach(function (el) { el.style.removeProperty('visibility'); delete el.dataset.shFab; });
    fabHidden = [];
  }

  var ov = null, feed = null, io = null, player = null, active = null, W = null, isOpen = false, muted = true, tick = 0, busyMore = false;

  function startWatch(card) {
    W = { id: card.dataset.id, ch: card.dataset.ch, src: card.dataset.src, dur: +card.dataset.dur || 30, played: 0 };
    markSeen(W.id);
  }
  function endWatch() {
    if (!W) return;
    var r = W.played / Math.max(W.dur, 5), d = 0;
    if (r >= 0.8) d = 2; else if (r >= 0.5) d = 1; else if (r < 0.25 && W.played < 4) d = -1;
    if (d) { bump(W.ch, d); bump(W.src, d * 0.6); }
    W = null; saveProf();
  }
  function killPlayer() { try { if (player && player.destroy) player.destroy(); } catch (e) {} player = null; }

  function activate(card) {
    if (!card || active === card) return;
    endWatch(); killPlayer();
    if (active) { var om = active.querySelector('.sh-mount'); if (om) om.innerHTML = ''; active.classList.remove('on'); }
    active = card; card.classList.add('on');
    startWatch(card);
    var m = card.querySelector('.sh-mount'); m.innerHTML = '<div></div>';
    var cards = feed.querySelectorAll('.sh-card'), idx = Array.prototype.indexOf.call(cards, card);
    if (cards.length - idx <= 3) more();
    loadYT().then(function () {
      if (active !== card || !isOpen) return;
      player = new YT.Player(m.firstChild, {
        videoId: card.dataset.id, width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, fs: 0, iv_load_policy: 3, disablekb: 1, mute: muted ? 1 : 0, origin: location.origin },
        events: {
          onReady: function (e) { try { if (muted) e.target.mute(); else e.target.unMute(); e.target.playVideo(); } catch (x) {} },
          onStateChange: function (e) {
            if (e.data === 0) { try { e.target.seekTo(0); e.target.playVideo(); if (W) W.played = Math.max(W.played, W.dur); } catch (x) {} } /* boucle */
          },
          onError: function () { card.classList.add('bad'); setTimeout(function () { var n = card.nextElementSibling; if (n && active === card) n.scrollIntoView({ behavior: 'smooth' }); }, 900); }
        }
      });
    });
  }
  function timer() {
    clearInterval(tick);
    tick = setInterval(function () {
      if (!isOpen || !player || !player.getPlayerState) return;
      try {
        if (player.getPlayerState() !== 1) return;
        if (W) W.played += 0.25;
        var d = player.getDuration() || 0, t = player.getCurrentTime() || 0;
        var bar = active && active.querySelector('.sh-prog i'); if (bar && d) bar.style.width = Math.min(100, t / d * 100) + '%';
      } catch (e) {}
    }, 250);
  }

  /* ---------- interface ---------- */
  function cardEl(v) {
    var c = doc.createElement('article');
    c.className = 'sh-card'; c.dataset.id = v.id; c.dataset.ch = v.ch; c.dataset.src = v.src || ''; c.dataset.dur = v.dur;
    c.innerHTML =
      '<div class="sh-stage"><img class="sh-poster" alt="" loading="lazy" src="https://i.ytimg.com/vi/' + esc(v.id) + '/hqdefault.jpg">' +
      '<div class="sh-mount"></div><div class="sh-shield"></div><div class="sh-flash"></div></div>' +
      '<div class="sh-info"><b>' + esc(v.chn || '') + '</b><p>' + esc(v.title || '') + '</p></div>' +
      '<div class="sh-rail"><button class="sh-b sh-like' + (prof.likes[v.id] ? ' on' : '') + '" type="button" aria-label="J’aime">' + ICO.heart + '</button>' +
      '<button class="sh-b sh-send" type="button" aria-label="Partager en message">' + ICO.send + '</button>' +
      '<button class="sh-b sh-snd" type="button" aria-label="Son">' + (muted ? ICO.mute : ICO.vol) + '</button>' +
      '<button class="sh-b sh-ban" type="button" aria-label="Ne plus voir cette chaîne">' + ICO.ban + '</button></div>' +
      '<div class="sh-bad">Vidéo indisponible…</div><div class="sh-prog"><i></i></div>';
    return c;
  }
  function append(items) {
    items.forEach(function (v) { inFeed[v.id] = 1; var c = cardEl(v); feed.appendChild(c); io.observe(c); });
  }
  function more() {
    if (busyMore) return; busyMore = true;
    ensure(8).then(function () { append(pick(8)); busyMore = false; }, function () { busyMore = false; });
  }
  function flash(card, k) { var f = card.querySelector('.sh-flash'); if (!f) return; f.className = 'sh-flash k-' + k; f.innerHTML = ICO[k]; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  function toggleLike(card, force) {
    var id = card.dataset.id, on = force === true ? true : !prof.likes[id];
    if (!!prof.likes[id] === on) return;
    if (on) { prof.likes[id] = 1; bump(card.dataset.ch, 3); } else { delete prof.likes[id]; bump(card.dataset.ch, -3); }
    card.querySelector('.sh-like').classList.toggle('on', on); saveProf();
  }
  function setMuted(m) {
    muted = m;
    if (!m) { try { doc.querySelectorAll('audio').forEach(function (a) { a.pause(); }); } catch (e) {} }
    try { if (player) { if (m) player.mute(); else player.unMute(); } } catch (e) {}
    ov.querySelectorAll('.sh-snd').forEach(function (b) { b.innerHTML = m ? ICO.mute : ICO.vol; });
    ov.classList.toggle('muted', m);
  }
  var SV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICO = {
    heart: SV + '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    vol: SV + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
    mute: SV + '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>',
    ban: SV + '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',
    play: SV + '<polygon points="6 4 20 12 6 20 6 4"/></svg>',
    send: SV + '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    back: SV + '<polyline points="15 18 9 12 15 6"/></svg>',
    pause: SV + '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
  };
  var toastT = 0;
  function toast(msg, undo) {
    var t = ov.querySelector('.sh-toast');
    t.innerHTML = esc(msg) + (undo ? ' <button type="button">Annuler</button>' : '');
    t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 5000);
    var b = t.querySelector('button'); if (b) b.onclick = function () { undo(); t.hidden = true; };
  }
  var lastTap = 0;
  function onClick(e) {
    if (e.target.closest('.sh-back')) { close(); return; }
    if (e.target.closest('.sh-close') || e.target.classList.contains('sh-pick')) { ov.querySelector('.sh-pick').hidden = true; return; }
    if (e.target.closest('.sh-reset')) {
      var n = Object.keys(prof.ban).length;
      if (!n) { toast('Aucune chaîne masquée'); return; }
      if (window.confirm('Réafficher les ' + n + ' chaîne(s) masquée(s) ?')) { prof.ban = {}; saveProf(); pushRemote(); toast('Chaînes réaffichées'); }
      return;
    }
    var card = e.target.closest('.sh-card'); if (!card) return;
    if (e.target.closest('.sh-like')) { toggleLike(card); return; }
    if (e.target.closest('.sh-snd')) { setMuted(!muted); return; }
    if (e.target.closest('.sh-send')) { openPicker(card); return; }
    if (e.target.closest('.sh-ban')) {
      var ch = card.dataset.ch; if (!ch) { toast('Chargement…'); return; }
      prof.ban[ch] = 1; bump(ch, -5); saveProf();
      toast('Chaîne masquée', function () { delete prof.ban[ch]; bump(ch, 5); saveProf(); pushRemote(); });
      var nx = card.nextElementSibling;
      feed.querySelectorAll('.sh-card[data-ch="' + ch + '"]').forEach(function (c) { if (c !== card) c.remove(); });
      if (nx) nx.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (e.target.closest('.sh-shield')) {
      var now = Date.now();
      if (now - lastTap < 320) { toggleLike(card, true); flash(card, 'heart'); lastTap = 0; return; }
      lastTap = now;
      var tapAt = now;
      setTimeout(function () {
        if (lastTap !== tapAt || !player || active !== card) return;
        try { if (player.getPlayerState() === 1) { player.pauseVideo(); flash(card, 'pause'); } else { player.playVideo(); flash(card, 'play'); } } catch (x) {}
      }, 330);
    }
  }
  /* ---------- partage en message ---------- */
  var pickCard = null, pickList = [];
  function renderPick(q) {
    var body = ov.querySelector('.sh-list'); body.innerHTML = '';
    var list = pickList.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) >= 0; });
    if (!list.length) { body.innerHTML = '<p class="sh-empty">Aucune discussion.</p>'; return; }
    list.forEach(function (c) {
      var row = doc.createElement('div'); row.className = 'sh-row';
      row.innerHTML = '<div class="avatar sh-av"></div><span class="sh-nm"></span><button type="button" class="sh-go">Envoyer</button>';
      row.querySelector('.sh-nm').textContent = c.name;
      try { window.UIChat.paint(row.querySelector('.sh-av'), c.uid, c.name); } catch (e) {}
      row.querySelector('.sh-go').addEventListener('click', function (ev) { sendShort(c, ev.currentTarget); });
      body.appendChild(row);
    });
  }
  function openPicker(card) {
    if (!(window.UIChat && window.UIChat.list)) { toast('Partage indisponible'); return; }
    pickCard = card; pickList = window.UIChat.list();
    var box = ov.querySelector('.sh-pick'); box.hidden = false; box.querySelector('input').value = '';
    renderPick('');
  }
  function sendShort(c, btn) {
    var card = pickCard; if (!card) return;
    btn.disabled = true; btn.textContent = '…';
    var title = ((card.querySelector('.sh-info p') || {}).textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    var url = location.origin + location.pathname + '?short=' + card.dataset.id;
    window.UIChat.sendToChat(c.id, (title ? title + '\n' : '') + url).then(function () {
      btn.textContent = 'Envoyé';
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Réessayer';
      toast(e && e.inv ? e.inv : 'Message non envoyé');
    });
  }

  /* ---------- ouvrir un Short précis (lien reçu en message) ---------- */
  var PENDING = '';
  try { PENDING = new URLSearchParams(location.search).get('short') || ''; } catch (e) {}
  function openVideo(id) {
    id = String(id || '');
    if (!/^[\w-]{11}$/.test(id)) return false;
    if (!ready()) { window.open('https://www.youtube.com/shorts/' + id, '_blank', 'noopener'); return true; }
    build();
    var u = curUid();
    if (u !== uid || !prof) { uid = u; prof = loadProf(); rebuildSeen(); pullRemote(); }
    feed.innerHTML = ''; inFeed = {}; active = null; status('');
    ov.querySelector('.sh-pick').hidden = true;
    ov.classList.add('from-link');
    isOpen = true; ov.hidden = false; ov.classList.toggle('muted', muted); fabsOn();
    doc.dispatchEvent(new Event('shortschange'));
    inFeed[id] = 1;
    append([{ id: id, ch: '', chn: '', title: '', dur: 30, src: 'share' }]);
    api('videos', { part: 'snippet,contentDetails', id: id }).then(function (r) {
      var v = r.items && r.items[0]; if (!v) return;
      var c = feed.querySelector('.sh-card[data-id="' + id + '"]'); if (!c) return;
      c.dataset.ch = v.snippet.channelId; c.dataset.dur = isoSec(v.contentDetails.duration) || 30;
      c.querySelector('.sh-info b').textContent = v.snippet.channelTitle || '';
      c.querySelector('.sh-info p').textContent = v.snippet.title || '';
      if (W && W.id === id) { W.ch = v.snippet.channelId; W.dur = +c.dataset.dur; }
    }).catch(function () {});
    more();
    return true;
  }

  function status(html, retry) {
    var s = ov.querySelector('.sh-status');
    s.innerHTML = html + (retry ? '<button class="primary" type="button" id="shRetry">Réessayer</button>' : '');
    s.hidden = !html;
    var b = $('shRetry'); if (b) b.addEventListener('click', function () { feed.innerHTML = ''; inFeed = {}; start(); });
  }
  function build() {
    if (ov) return;
    ov = doc.createElement('section');
    ov.className = 'sh-ov muted'; ov.id = 'shortsOv'; ov.hidden = true; ov.setAttribute('aria-label', 'Shorts');
    ov.innerHTML = '<div class="sh-top"><button class="tico sh-back" type="button" aria-label="Retour">' + ICO.back + '</button><h2>E<span class="amp">\'</span>cho <small>Shorts</small></h2><div class="hbtns"></div></div><div class="sh-feed" id="shFeed"></div><div class="sh-status" hidden></div><div class="sh-toast" hidden></div>' +
      '<div class="sh-pick" hidden><div class="sh-sheet"><h3>Envoyer à…</h3><input type="search" placeholder="Rechercher" autocomplete="off"><div class="sh-list"></div><button type="button" class="sh-close">Fermer</button></div></div>';
    var hb = doc.querySelector('#viewNews .hbtns');
    if (hb) ov.querySelector('.hbtns').innerHTML = hb.innerHTML;
    ov.querySelector('.hbtns').insertAdjacentHTML('afterbegin', '<button class="tico sh-reset" type="button" title="Chaînes masquées" aria-label="Chaînes masquées">' + ICO.ban + '</button>');
    doc.body.appendChild(ov);
    feed = $('shFeed');
    io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio >= 0.65 && isOpen) activate(en.target); });
    }, { root: feed, threshold: [0.65] });
    ov.addEventListener('click', onClick);
    ov.querySelector('.sh-pick input').addEventListener('input', function (e) { renderPick(e.target.value.trim().toLowerCase()); });
    timer();
  }
  function start() {
    status('<span class="sh-spin"></span>Chargement des Shorts…');
    ensure(8).then(function () {
      var items = pick(8);
      if (!items.length) {
        status('Aucun Short trouvé.' + (lastErr ? '<small>' + esc(lastErr.message) + '</small>' : ''), true);
        return;
      }
      status(''); append(items);
    });
  }
  function open() {
    if (!ready()) return false;
    if (PENDING) {
      var p = PENDING; PENDING = '';
      try { history.replaceState(history.state, '', location.pathname); } catch (e) {}
      if (openVideo(p)) return true;
    }
    build(); ov.classList.remove('from-link');
    var u = curUid();
    if (u !== uid || !prof) {
      uid = u; prof = loadProf(); rebuildSeen(); pullRemote();
      feed.innerHTML = ''; inFeed = {}; active = null;
    }
    isOpen = true; ov.hidden = false; ov.classList.toggle('muted', muted); fabsOn();
    doc.dispatchEvent(new Event('shortschange'));
    if (!feed.children.length) start();
    else {
      var cards = feed.querySelectorAll('.sh-card'), i = Math.round(feed.scrollTop / Math.max(1, feed.clientHeight));
      active = null; activate(cards[Math.min(i, cards.length - 1)]);
    }
    return true;
  }
  function close() {
    if (!isOpen) return;
    isOpen = false; fabsOff(); endWatch(); killPlayer();
    if (active) { var m = active.querySelector('.sh-mount'); if (m) m.innerHTML = ''; active.classList.remove('on'); }
    active = null; if (ov) { ov.hidden = true; ov.querySelector('.sh-pick').hidden = true; }
    doc.dispatchEvent(new Event('shortschange'));
  }

  doc.addEventListener('visibilitychange', function () { try { if (isOpen && player) { if (doc.hidden) player.pauseVideo(); else player.playVideo(); } } catch (e) {} });
  /* se ferme si l'app change d'écran (déconnexion, discussion, musique, jeux, lettres) */
  function watchHidden(id, closeWhenShown) {
    var n = $(id); if (!n) return;
    new MutationObserver(function () { if (closeWhenShown ? !n.hidden : n.hidden) close(); }).observe(n, { attributes: true, attributeFilter: ['hidden'] });
  }
  function boot() {
    watchHidden('app', false);
    ['viewChat', 'viewMusic', 'viewGame', 'viewNews'].forEach(function (i) { watchHidden(i, true); });
    /* « Lettres anonymes » dans le menu ⋮ de la fenêtre Messages */
    var mb = $('menuBtn'), lb = $('openLetters');
    if (mb && lb) mb.addEventListener('click', function () { setTimeout(function () { lb.hidden = !!(window.newsBlocked && window.newsBlocked()); }, 0); });
    if (lb) lb.addEventListener('click', function () {
      var km = $('kmenu'); if (km) km.hidden = true;
      close();
      if (!(window.newsBlocked && window.newsBlocked())) $('openNews').click();
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();

  window.EchoShorts = { open: open, openVideo: openVideo, close: close, ready: ready, isOpen: function () { return isOpen; } };
})();
