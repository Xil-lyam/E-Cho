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
    if (/^UC[\w-]{22}$/.test(c)) sources.push({ t: 'c', v: c });                 /* identifiant de chaîne */
    else if (/^@?[\w.\-]{3,}$/.test(c)) sources.push({ t: 'h', v: '@' + c.replace(/^@/, '') }); /* nom d'utilisateur @… */
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
  function emptyProf() { return { seen: [], aff: {}, ban: {}, banN: {}, likes: {} }; }
  function loadProf() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem('echo-shorts-v1-' + uid) || 'null'); } catch (e) {}
    p = p || emptyProf();
    p.seen = p.seen || []; p.aff = p.aff || {}; p.ban = p.ban || {}; p.banN = p.banN || {}; p.likes = p.likes || {};
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
      Object.keys(rp.ban || {}).forEach(function (k) { prof.ban[k] = 1; if (rp.banN && rp.banN[k] && !prof.banN[k]) prof.banN[k] = rp.banN[k]; });
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
      var explore = Math.random() < 0.2;
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
    loading = Promise.all(live.slice(0, 3).map(function (s) {
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

  /* ---------- icônes (SVG) ---------- */
  var IC = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>',
    heartOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    snd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    ban: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 014 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0120 12c0 4.42-3.58 8-8 8z"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.6-1.7"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>'
  };
  (function () {
    var st = doc.createElement('style');
    st.textContent = '.sh-b svg{width:28px;height:28px;fill:#fff;display:block;margin:auto;pointer-events:none}' +
      '.sh-b.liked svg{fill:#ff3b5c}.sh-b.sh-ban svg{fill:#ff5a5f}' +
      '.sh-flash svg{width:84px;height:84px;fill:#fff;display:block;margin:auto}' +
      '.sh-topunb{display:inline-flex;align-items:center;justify-content:center;background:none;border:0;color:inherit;padding:8px;cursor:pointer}' +
      '.sh-topunb svg{width:24px;height:24px;display:block}' +
      '.sh-blk{position:absolute;left:0;right:0;bottom:0;max-height:72%;overflow:auto;background:rgba(18,18,22,.98);color:#fff;border-radius:18px 18px 0 0;padding:16px 16px 100px;z-index:60;box-shadow:0 -8px 30px rgba(0,0,0,.5)}' +
      '.sh-blk[hidden]{display:none}' +
      '.sh-blk h3{margin:0 0 10px;font-size:1.05rem;display:flex;align-items:center;justify-content:space-between;gap:8px}' +
      '.sh-blk-x{background:none;border:0;color:inherit;font-size:1.4rem;line-height:1;padding:4px 8px;cursor:pointer}' +
      '.sh-blk-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(255,255,255,.1)}' +
      '.sh-blk-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sh-blk-row button,.sh-unball{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);border:0;color:#fff;border-radius:999px;padding:7px 12px;cursor:pointer;font:inherit;font-size:.9rem}' +
      '.sh-blk-row button svg,.sh-unball svg{width:18px;height:18px;display:block}' +
      '.sh-blk-empty{opacity:.7;padding:8px 0}' +
      '.sh-unball{margin-top:12px}';
    (doc.head || doc.documentElement).appendChild(st);
  })();

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
  /* ---------- préchargement : on garde un lecteur prêt pour les AHEAD vidéos suivantes ---------- */
  var AHEAD = 3, BEHIND = 1, preT = [];
  function dropPlayer(c) {
    var pl = c.__pl; c.__pl = null;
    if (!pl) return;
    try { pl.p.destroy(); } catch (e) {}
    var m = c.querySelector('.sh-mount'); if (m) m.innerHTML = '';
  }
  function killPlayer() {
    preT.forEach(clearTimeout); preT = [];
    if (feed) feed.querySelectorAll('.sh-card').forEach(dropPlayer);
    player = null;
  }
  function skipBad(card) {
    setTimeout(function () { var n = card.nextElementSibling; if (n && active === card) n.scrollIntoView({ behavior: 'smooth' }); }, 900);
  }
  /* lance la lecture d'une carte (lecteur déjà prêt ou en cours de chargement) */
  function startPlay(card) {
    var pl = card.__pl; if (!pl) return;
    if (!pl.ready) { pl.want = true; return; }
    try {
      if (muted) pl.p.mute(); else pl.p.unMute();
      if (!pl.fresh) pl.p.seekTo(0, true);
      pl.fresh = false;
      pl.p.playVideo();
    } catch (x) {}
  }
  function mkPlayer(card) {
    if (card.__pl) return card.__pl;
    var m = card.querySelector('.sh-mount'); m.innerHTML = '<div></div>';
    var pl = { p: null, ready: false, want: false, fresh: false };
    card.__pl = pl;
    pl.p = new YT.Player(m.firstChild, {
      videoId: card.dataset.id, width: '100%', height: '100%',
      playerVars: { autoplay: card === active ? 1 : 0, controls: 0, playsinline: 1, rel: 0, modestbranding: 1, fs: 0, iv_load_policy: 3, disablekb: 1, mute: 1, origin: location.origin },
      events: {
        onReady: function (e) {
          pl.ready = true;
          if (!isOpen || card.__pl !== pl) return;
          try {
            if (active === card) startPlay(card);
            else { e.target.mute(); e.target.playVideo(); } /* préchargement : lecture muette, mise en pause dès que ça joue */
          } catch (x) {}
        },
        onStateChange: function (e) {
          if (card.__pl !== pl) return;
          if (e.data === 1 && active !== card) { try { e.target.pauseVideo(); e.target.seekTo(0, true); pl.fresh = true; } catch (x) {} return; }
          if (e.data === 0 && active === card) { try { e.target.seekTo(0); e.target.playVideo(); if (W) W.played = Math.max(W.played, W.dur); } catch (x) {} } /* boucle */
        },
        onError: function () { card.classList.add('bad'); if (active === card) skipBad(card); }
      }
    });
    return pl;
  }

  function activate(card) {
    if (!card || active === card) return;
    endWatch();
    preT.forEach(clearTimeout); preT = [];
    if (active) { if (active.__pl) { try { active.__pl.p.pauseVideo(); } catch (e) {} } active.classList.remove('on'); }
    active = card; card.classList.add('on');
    startWatch(card);
    var cards = Array.prototype.slice.call(feed.querySelectorAll('.sh-card')), idx = cards.indexOf(card);
    if (cards.length - idx <= AHEAD + 2) more();
    loadYT().then(function () {
      if (active !== card || !isOpen) return;
      var pl = mkPlayer(card); player = pl.p;
      if (card.classList.contains('bad')) skipBad(card);
      startPlay(card);
      /* on libère les lecteurs trop loin, puis on prépare les suivants un par un */
      cards.forEach(function (c, i) { if (c.__pl && (i < idx - BEHIND || i > idx + AHEAD)) dropPlayer(c); });
      for (var k = 1; k <= AHEAD; k++) (function (c, k) {
        if (!c || c.__pl || c.classList.contains('bad')) return;
        preT.push(setTimeout(function () { if (isOpen && active === card && !c.__pl) mkPlayer(c); }, 700 * k));
      })(cards[idx + k], k);
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
      '<div class="sh-rail"><button class="sh-b sh-like' + (prof.likes[v.id] ? ' liked' : '') + '" type="button" aria-label="J’aime">' + (prof.likes[v.id] ? IC.heartOn : IC.heart) + '</button>' +
      '<button class="sh-b sh-snd" type="button" aria-label="Son">' + (muted ? IC.mute : IC.snd) + '</button>' +
      '<button class="sh-b sh-ban" type="button" aria-label="Ne plus voir cette chaîne">' + IC.ban + '</button></div>' +
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
  function flash(card, t) { var f = card.querySelector('.sh-flash'); if (!f) return; f.innerHTML = t; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  function toggleLike(card, force) {
    var id = card.dataset.id, on = force === true ? true : !prof.likes[id];
    if (!!prof.likes[id] === on) return;
    if (on) { prof.likes[id] = 1; bump(card.dataset.ch, 3); } else { delete prof.likes[id]; bump(card.dataset.ch, -3); }
    var lb = card.querySelector('.sh-like'); lb.innerHTML = on ? IC.heartOn : IC.heart; lb.classList.toggle('liked', on); saveProf();
  }
  function setMuted(m) {
    muted = m;
    if (!m) { try { doc.querySelectorAll('audio').forEach(function (a) { a.pause(); }); } catch (e) {} }
    try { if (player) { if (m) player.mute(); else player.unMute(); } } catch (e) {}
    ov.querySelectorAll('.sh-snd').forEach(function (b) { b.innerHTML = m ? IC.mute : IC.snd; });
    ov.classList.toggle('muted', m);
  }
  /* ---------- chaînes bloquées : liste + débloquer ---------- */
  var blk = null;
  function chName(ch) {
    if (prof.banN && prof.banN[ch]) return prof.banN[ch];
    for (var i = 0; i < pool.length; i++) if (pool[i].ch === ch && pool[i].chn) return pool[i].chn;
    return 'Chaîne ' + String(ch).slice(-6);
  }
  function renderBlk() {
    if (!blk) return;
    var ids = Object.keys(prof.ban || {}), h = '<h3><span>Chaînes bloquées</span><button class="sh-blk-x" type="button" aria-label="Fermer">×</button></h3>';
    if (!ids.length) h += '<div class="sh-blk-empty">Aucune chaîne bloquée.</div>';
    else {
      ids.forEach(function (ch) { h += '<div class="sh-blk-row"><span>' + esc(chName(ch)) + '</span><button type="button" class="sh-unb" data-ch="' + esc(ch) + '">' + IC.unlock + 'Débloquer</button></div>'; });
      h += '<button type="button" class="sh-unball">' + IC.unlock + 'Tout débloquer</button>';
    }
    blk.innerHTML = h;
  }
  function openBlk() { if (!blk) return; renderBlk(); blk.hidden = false; }
  function closeBlk() { if (blk) blk.hidden = true; }
  function unblock(ch) {
    delete prof.ban[ch]; if (prof.banN) delete prof.banN[ch]; prof.aff[ch] = 0;
    try { localStorage.setItem('echo-shorts-v1-' + uid, JSON.stringify(prof)); } catch (e) {}
    lastPush = Date.now(); pushRemote(); /* tout de suite : sinon l'ancien blocage reviendrait de la sauvegarde en ligne */
    renderBlk();
  }
  /* bloque la chaîne de cette vidéo et passe à la suivante */
  function banCard(card) {
    var ch = card.dataset.ch; prof.ban[ch] = 1; bump(ch, -5);
    var nb = card.querySelector('.sh-info b'); if (nb && nb.textContent) prof.banN[ch] = nb.textContent;
    saveProf();
    feed.querySelectorAll('.sh-card[data-ch="' + ch + '"]').forEach(function (c) { if (c !== card) { dropPlayer(c); c.remove(); } });
    var nx = card.nextElementSibling;
    if (nx) nx.scrollIntoView({ behavior: 'smooth' });
  }
  var lastTap = 0;
  function onClick(e) {
    if (e.target.closest('.sh-topunb')) { if (blk && !blk.hidden) closeBlk(); else openBlk(); return; }
    if (e.target.closest('.sh-blk-x')) { closeBlk(); return; }
    var ub = e.target.closest('.sh-unb'); if (ub) { unblock(ub.dataset.ch); return; }
    if (e.target.closest('.sh-unball')) { Object.keys(prof.ban || {}).forEach(function (c) { delete prof.ban[c]; if (prof.banN) delete prof.banN[c]; prof.aff[c] = 0; }); try { localStorage.setItem('echo-shorts-v1-' + uid, JSON.stringify(prof)); } catch (x) {} lastPush = Date.now(); pushRemote(); renderBlk(); return; }
    if (e.target.closest('.sh-blk')) return;
    var card = e.target.closest('.sh-card'); if (!card) return;
    if (e.target.closest('.sh-like')) { toggleLike(card); return; }
    if (e.target.closest('.sh-snd')) { setMuted(!muted); return; }
    if (e.target.closest('.sh-ban')) { banCard(card); return; }
    if (e.target.closest('.sh-shield')) {
      var now = Date.now();
      if (now - lastTap < 320) { toggleLike(card, true); flash(card, IC.heartOn); lastTap = 0; return; }
      lastTap = now;
      var tapAt = now;
      setTimeout(function () {
        if (lastTap !== tapAt || !player || active !== card) return;
        try { if (player.getPlayerState() === 1) { player.pauseVideo(); flash(card, IC.pause); } else { player.playVideo(); flash(card, IC.play); } } catch (x) {}
      }, 330);
    }
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
    ov.innerHTML = '<div class="sh-top"><h2>E<span class="amp">\'</span>cho <small>Shorts</small></h2><div class="hbtns"></div></div><div class="sh-feed" id="shFeed"></div><div class="sh-status" hidden></div>';
    var hb = doc.querySelector('#viewNews .hbtns');
    if (hb) ov.querySelector('.hbtns').innerHTML = hb.innerHTML;
    /* bouton « Chaînes bloquées / Débloquer » en haut (icône) */
    var hbo = ov.querySelector('.hbtns'), fb = hbo.querySelector('button'), tb = doc.createElement('button');
    tb.type = 'button'; tb.className = 'sh-topunb' + (fb && fb.className ? ' ' + fb.className : '');
    tb.setAttribute('aria-label', 'Chaînes bloquées : débloquer'); tb.title = 'Débloquer des chaînes'; tb.innerHTML = IC.unlock;
    hbo.insertBefore(tb, hbo.firstChild);
    blk = doc.createElement('div'); blk.className = 'sh-blk'; blk.hidden = true; ov.appendChild(blk);
    doc.body.appendChild(ov);
    feed = $('shFeed');
    io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting && en.intersectionRatio >= 0.65 && isOpen) activate(en.target); });
    }, { root: feed, threshold: [0.65] });
    ov.addEventListener('click', onClick);
    timer();
  }
  function start() {
    status('<span class="sh-spin"></span>Chargement des Shorts…');
    ensure(8).then(function () {
      var items = pick(8);
      if (!items.length) {
        status('😕 Aucun Short trouvé.' + (lastErr ? '<small>' + esc(lastErr.message) + '</small>' : ''), true);
        return;
      }
      status(''); append(items);
    });
  }
  function open() {
    if (!ready()) return false;
    build();
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
    isOpen = false; closeBlk(); fabsOff(); endWatch(); killPlayer();
    if (active) { var m = active.querySelector('.sh-mount'); if (m) m.innerHTML = ''; active.classList.remove('on'); }
    active = null; if (ov) ov.hidden = true;
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

  window.EchoShorts = { open: open, close: close, ready: ready, isOpen: function () { return isOpen; } };
})();
