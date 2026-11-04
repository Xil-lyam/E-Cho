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
  (CFG.channels || []).forEach(function (c) { if (/^UC[\w-]{22}$/.test(c)) sources.push({ t: 'c', v: c }); });
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
  function fetchSource(s) {
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
      '<div class="sh-rail"><button class="sh-b sh-like" type="button" aria-label="J’aime">' + (prof.likes[v.id] ? '❤️' : '🤍') + '</button>' +
      '<button class="sh-b sh-snd" type="button" aria-label="Son">' + (muted ? '🔇' : '🔊') + '</button>' +
      '<button class="sh-b sh-ban" type="button" aria-label="Ne plus voir cette chaîne">🚫</button></div>' +
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
  function flash(card, t) { var f = card.querySelector('.sh-flash'); if (!f) return; f.textContent = t; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  function toggleLike(card, force) {
    var id = card.dataset.id, on = force === true ? true : !prof.likes[id];
    if (!!prof.likes[id] === on) return;
    if (on) { prof.likes[id] = 1; bump(card.dataset.ch, 3); } else { delete prof.likes[id]; bump(card.dataset.ch, -3); }
    card.querySelector('.sh-like').textContent = on ? '❤️' : '🤍'; saveProf();
  }
  function setMuted(m) {
    muted = m;
    if (!m) { try { doc.querySelectorAll('audio').forEach(function (a) { a.pause(); }); } catch (e) {} }
    try { if (player) { if (m) player.mute(); else player.unMute(); } } catch (e) {}
    ov.querySelectorAll('.sh-snd').forEach(function (b) { b.textContent = m ? '🔇' : '🔊'; });
    ov.classList.toggle('muted', m);
  }
  var lastTap = 0;
  function onClick(e) {
    var card = e.target.closest('.sh-card'); if (!card) return;
    if (e.target.closest('.sh-like')) { toggleLike(card); return; }
    if (e.target.closest('.sh-snd')) { setMuted(!muted); return; }
    if (e.target.closest('.sh-ban')) {
      var ch = card.dataset.ch; prof.ban[ch] = 1; bump(ch, -5); saveProf();
      var nx = card.nextElementSibling;
      feed.querySelectorAll('.sh-card[data-ch="' + ch + '"]').forEach(function (c) { if (c !== card) c.remove(); });
      if (nx) nx.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (e.target.closest('.sh-shield')) {
      var now = Date.now();
      if (now - lastTap < 320) { toggleLike(card, true); flash(card, '❤️'); lastTap = 0; return; }
      lastTap = now;
      var tapAt = now;
      setTimeout(function () {
        if (lastTap !== tapAt || !player || active !== card) return;
        try { if (player.getPlayerState() === 1) { player.pauseVideo(); flash(card, '⏸'); } else { player.playVideo(); flash(card, '▶'); } } catch (x) {}
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
    isOpen = true; ov.hidden = false; ov.classList.toggle('muted', muted);
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
    isOpen = false; endWatch(); killPlayer();
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
