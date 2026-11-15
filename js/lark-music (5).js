/* E'cho — js/lark-music.js (v3)
   Écran Musique façon Lark Player, SANS toucher à ton moteur (script.js).
   Lit window.uandiMusic.tracks() et pilote tes boutons existants (#mPlay, #mNext, #mPrev, #mRepeat, #mShuffle, #mAdd, #mClear). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var info = new Map(), queue = [], busy = false, waveKey = '', curKey = '';
  var LY = { key: '', lines: null, plain: '', idx: -2, cache: new Map() };
  var AUDIO = null, SPD = 1, FAVONLY = false, FD = 0, FADES = [0, 3, 6, 10], lyLong = false, WL = null, WLp = false;
  var AB = { a: -1, b: -1 }, NEXTQ = [], manualAt = 0, rowLong = false, lastIdx, SORT = 0, lastPos = 0;
  /* Mini-lecteur flottant : sur quels écrans il apparaît (true / false). Par défaut : Profil, Actualités (vidéos, stories).
     Mets chat: true pour l'afficher aussi dans les discussions (déconseillé : il peut cacher la saisie). */
  var FLOAT_ON = { news: true, profile: true, list: false, chat: false, game: false };
  var SORTS = ['Tri : normal', 'Tri : A→Z', 'Tri : artiste', 'Tri : favoris'];
  function applyRate() { if (AUDIO && SPD) { try { AUDIO.defaultPlaybackRate = SPD; AUDIO.playbackRate = SPD; } catch (e) {} } }
  /* on repère l'élément audio de ton moteur (pour la vitesse de lecture) sans le modifier */
  try {
    var _pl = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      var E = null; try { E = window.uandiMusic && window.uandiMusic.audio && window.uandiMusic.audio(); } catch (e) {}
      if (E ? this === E : (this instanceof HTMLAudioElement && !this._ghost)) { AUDIO = this; applyRate(); }
      return _pl.apply(this, arguments);
    };
  } catch (e) {}

  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function grad(s) { var m = 28 + hue(s || 'x') % 40; return 'linear-gradient(145deg,color-mix(in srgb,var(--accent) ' + (m + 25) + '%,#000),color-mix(in srgb,var(--accent) ' + m + '%,#000))'; }
  function svg(path, extra) { return '<svg viewBox="0 0 24 24" aria-hidden="true"' + (extra || '') + '>' + path + '</svg>'; }

  /* ---------- icônes ---------- */
  var IC = {
    play: '<path d="M7 4.8v14.4a1.4 1.4 0 0 0 2.1 1.2l11.6-7.2a1.4 1.4 0 0 0 0-2.4L9.1 3.6A1.4 1.4 0 0 0 7 4.8z"/>',
    pause: '<rect x="5.5" y="3.5" width="5" height="17" rx="2.5"/><rect x="13.5" y="3.5" width="5" height="17" rx="2.5"/>',
    prev: '<path d="M11.6 6.4v11.2a1 1 0 0 1-1.6.8l-6.6-5.6a1 1 0 0 1 0-1.6L10 5.6a1 1 0 0 1 1.6.8zM20.6 6.4v11.2a1 1 0 0 1-1.6.8l-6.6-5.6a1 1 0 0 1 0-1.6L19 5.6a1 1 0 0 1 1.6.8z"/>',
    next: '<path d="M12.4 6.4v11.2a1 1 0 0 0 1.6.8l6.6-5.6a1 1 0 0 0 0-1.6L14 5.6a1 1 0 0 0-1.6.8zM3.4 6.4v11.2a1 1 0 0 0 1.6.8l6.6-5.6a1 1 0 0 0 0-1.6L5 5.6a1 1 0 0 0-1.6.8z"/>',
    plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
    queue: '<path d="M3 6h12v2H3zM3 11h12v2H3zM3 16h8v2H3zM17 12a4 4 0 1 1-1.2 7.8l.8-1.8A2 2 0 1 0 17 14v1.5l-2.8-2.3L17 10.9z"/>',
    down: '<path d="M5.4 9 12 15.6 18.6 9 20 10.4l-8 8-8-8z"/>',
    lyr: '<path d="M4 5h16v2H4zM4 9.5h16v2H4zM4 14h10v2H4zM4 18.5h7v2H4z"/>',
    heart: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>',
    moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>',
    focus: '<path d="M4 9V6a2 2 0 0 1 2-2h3v2H6v3zM15 4h3a2 2 0 0 1 2 2v3h-2V6h-3zM20 15v3a2 2 0 0 1-2 2h-3v-2h3v-3zM9 20H6a2 2 0 0 1-2-2v-3h2v3h3zM12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>',
    broom: '<path d="M14 3h-4v6L6 13v8h12v-8l-4-4zm-2 2h0v4.8l3.4 3.2H8.6L12 9.8zM8 15h8v4h-1v-2h-2v2h-2v-2H9v2H8z"/>',
    rep: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
    rep1: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/><text x="12" y="15.4" font-size="8.5" font-weight="800" text-anchor="middle" fill="currentColor" font-family="Lexend,system-ui,sans-serif">1</text>',
    shuf: '<path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M3 7h3.5c2 0 3.2 1 4.2 2.6l2.6 4.8c1 1.6 2.2 2.6 4.2 2.6H21M18 14l3 3-3 3M3 17h3.5c1.3 0 2.3-.4 3.1-1.2M13.4 8.2C14.2 7.4 15.2 7 16.5 7H21M18 4l3 3-3 3"/>'
  };

  /* ---------- lecture de la pochette + artiste (ID3 des MP3) ---------- */
  async function readTags(blob) {
    var r = {};
    try {
      var h = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
      if (String.fromCharCode(h[0], h[1], h[2]) !== 'ID3') return r;
      var ver = h[3], size = ((h[6] & 127) << 21) | ((h[7] & 127) << 14) | ((h[8] & 127) << 7) | (h[9] & 127);
      var b = new Uint8Array(await blob.slice(10, 10 + Math.min(size, 6e6)).arrayBuffer());
      var dec = function (e, u) {
        var s;
        try {
          if (e === 1 || e === 2) {
            var enc = e === 2 ? 'utf-16be' : 'utf-16le';
            if (u[0] === 0xFE && u[1] === 0xFF) { enc = 'utf-16be'; u = u.subarray(2); }
            else if (u[0] === 0xFF && u[1] === 0xFE) { enc = 'utf-16le'; u = u.subarray(2); }
            s = new TextDecoder(enc).decode(u);
          } else s = new TextDecoder(e === 3 ? 'utf-8' : 'iso-8859-1').decode(u);
        } catch (x) { return ''; }
        return s.split('\0').map(function (z) { return z.replace(/\uFEFF/g, '').trim(); }).filter(Boolean).join(', ');
      };
      var p = 0;
      while (p + 10 < b.length) {
        var id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        var sz = ver === 4 ? ((b[p + 4] & 127) << 21) | ((b[p + 5] & 127) << 14) | ((b[p + 6] & 127) << 7) | (b[p + 7] & 127)
                           : ((b[p + 4] << 24) | (b[p + 5] << 16) | (b[p + 6] << 8) | b[p + 7]) >>> 0;
        var d = b.subarray(p + 10, p + 10 + sz);
        if (id === 'TPE1') r.artist = dec(d[0], d.subarray(1));
        else if (id === 'APIC' && !r.cover) {
          var e = d[0], i = 1; while (d[i]) i++;
          var mime = String.fromCharCode.apply(null, d.subarray(1, i)); i += 2;
          if (e === 1 || e === 2) { while (i + 1 < d.length && (d[i] || d[i + 1])) i += 2; i += 2; } else { while (d[i]) i++; i++; }
          r.cover = URL.createObjectURL(new Blob([d.subarray(i)], { type: mime.indexOf('/') > 0 ? mime : 'image/jpeg' }));
        }
        p += 10 + sz;
      }
    } catch (e) {}
    return r;
  }
  /* rejette un nom d'artiste illisible (caractères chinois / carrés quand le tag est mal encodé) */
  var CJK = /[\u1100-\u11FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/;
  function sane(a, t) {
    if (!a) return '';
    if (/[\uFFFD\u0000-\u0008]/.test(a)) return '';
    var lbl = (t && (t.name || t.title)) || '';
    if (CJK.test(a) && !CJK.test(lbl)) return '';
    return a;
  }
  function want(t) { if (!t || !t.url || info.has(t.url)) return; info.set(t.url, {}); queue.push(t); pump(); }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) {
      var t = queue.shift(), o = info.get(t.url);
      try { var g = await readTags(await (await fetch(t.url)).blob()); o.cover = g.cover; o.artist = sane(g.artist, t); } catch (e) {}
      o.done = true; paint();
    }
    busy = false;
  }

  /* ---------- barre « vagues » (forme propre à chaque titre) ---------- */
  function wavePath(seed) {
    var s = hue(seed) * 7919 + seed.length * 104729;
    var rnd = function () { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    var bumps = [], n = 5 + Math.floor(rnd() * 3);
    for (var i = 0; i < n; i++) bumps.push([rnd() * 300, 14 + rnd() * 32, .35 + rnd() * .65]);
    var hs = [], max = 0.01, x;
    for (x = 0; x <= 300; x += 3) {
      var h = 0.06;
      bumps.forEach(function (b) { h += b[2] * Math.exp(-Math.pow((x - b[0]) / b[1], 2)); });
      hs.push(h); if (h > max) max = h;
    }
    /* on normalise (au lieu de couper) : plus de sommets plats */
    var d = 'M0 40';
    hs.forEach(function (h, k) { d += 'L' + (k * 3) + ' ' + (38 - (h / max) * 32).toFixed(1); });
    return d + 'L300 40Z';
  }
  function buildWave(seed) {
    if (seed === waveKey) return; waveKey = seed;
    var p = wavePath(seed), w = document.querySelectorAll('.lkseek svg.w path');
    w.forEach(function (el) { el.setAttribute('d', p); });
  }

  /* ---------- helpers ---------- */
  function tracks() { try { return window.uandiMusic.tracks() || []; } catch (e) { return []; } }
  function label(t) { try { return window.uandiMusic.label(t); } catch (e) { return t.name || ''; } }
  function curIndex() { var k = -1; document.querySelectorAll('#mList .mrow').forEach(function (r, i) { if (r.classList.contains('on')) k = i; }); return k; }
  function isPlaying() { var b = $('mPlay'); return !!(b && b.classList.contains('playing')); }
  function repState() {
    var r = $('mRepeat'); if (!r || r.getAttribute('aria-pressed') !== 'true') return 'off';
    return r.querySelector('.r1') ? 'one' : 'all';
  }
  function setRepeat(target) {
    var want2 = repState() === target ? 'off' : target, r = $('mRepeat');
    for (var i = 0; i < 3 && repState() !== want2; i++) r.click();
  }

  /* ---------- mise à jour de l'écran ---------- */
  function paint() {
    var T = tracks(), play = isPlaying(), FV = favs();
    document.querySelectorAll('#mList .mrow').forEach(function (row, i) {
      var t = T[i]; if (!t) return; want(t);
      var o = info.get(t.url) || {}, cv = row.querySelector('.lkcv');
      if (!cv) {
        cv = document.createElement('span'); cv.className = 'lkcv'; cv.textContent = '♪';
        cv.innerHTML = '♪<span class="lkeq"><i></i><i></i><i></i></span>'; row.insertBefore(cv, row.firstChild);
      }
      if (!row.querySelector('.lkgrip') && !row.querySelector('.mfield')) {
        var gp = document.createElement('span'); gp.className = 'lkgrip'; gp.setAttribute('role', 'button'); gp.setAttribute('aria-label', 'Déplacer ce titre');
        gp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';
        row.insertBefore(gp, row.firstChild);
      }
      cv.style.backgroundImage = o.cover ? 'url(' + o.cover + ')' : grad(t.name || t.title);
      cv.classList.toggle('img', !!o.cover);
      row.dataset.k = i;
      var fb = row.querySelector('.lkfav');
      if (!fb) {
        fb = document.createElement('button'); fb.type = 'button'; fb.className = 'lkfav'; fb.setAttribute('aria-label', 'Favori'); fb.innerHTML = svg(IC.heart);
        fb.onclick = function (e) { e.stopPropagation(); e.preventDefault(); var tt = tracks()[+row.dataset.k]; if (tt) toggleFav(label(tt)); };
        row.insertBefore(fb, row.querySelector('.mshare, .mren, .mdel') || null);
      }
      fb.classList.toggle('on', FV.indexOf(label(t)) >= 0);
      var qi = NEXTQ.indexOf(label(t));
      if (qi >= 0) cv.dataset.nq = qi + 1; else delete cv.dataset.nq;
      var nm = row.querySelector('.mname');
      if (nm) {
        if (nm.firstChild && nm.firstChild.nodeType === 3) nm.firstChild.nodeValue = nm.firstChild.nodeValue.replace(/^▶\s*/, '');
        var a = nm.querySelector('.lkart');
        if (!a) { a = document.createElement('small'); a.className = 'lkart'; nm.appendChild(a); }
        a.textContent = o.artist || '';
      }
    });

    var k = curIndex(), t = T[k], o = (t && info.get(t.url)) || {}, bgi = o.cover ? 'url(' + o.cover + ')' : (t ? grad(t.name || t.title) : '');
    var disc = $('mDisc'), ar = $('lkArtist');
    if (!ar && $('mTitle')) { ar = document.createElement('p'); ar.id = 'lkArtist'; ar.className = 'lkartist'; $('mTitle').after(ar); }
    if (ar) ar.textContent = t ? (o.artist || '') : '';
    if (disc) { disc.style.backgroundImage = bgi; disc.classList.toggle('hascover', !!o.cover); }
    var mc = $('lkMiniCv'); if (mc) { mc.style.backgroundImage = bgi; mc.classList.toggle('img', !!o.cover); }
    if ($('lkMiniT')) $('lkMiniT').textContent = t ? label(t) : 'Aucune musique';
    if ($('lkMini')) $('lkMini').classList.toggle('playing', play);
    if (t) buildWave(t.name || t.title || 'x');

    if (t && o.done && curKey !== t.url) { curKey = t.url; tint(o.cover); loadLyrics(t, o); }
    if (!t && curKey) { curKey = ''; tint(''); setLy(null); }
    var rs = repState(), sh = $('mShuffle') && $('mShuffle').getAttribute('aria-pressed') === 'true';
    $('lkP1').classList.toggle('on', rs === 'one'); $('lkP2').classList.toggle('on', rs === 'all'); $('lkP3').classList.toggle('on', sh);
    applySort(); applyFilter();

    if (t && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: label(t), artist: o.artist || 'E\'cho', artwork: o.cover ? [{ src: o.cover, sizes: '512x512' }] : [] }); } catch (e) {}
    }
  }
  /* progression de l'onde en continu (image par image) tant que ça joue, au lieu de sauter toutes les 300 ms */
  var waveRaf = 0, SEEKING = false;
  function waveStep() {
    waveRaf = 0;
    var view = $('viewMusic'); if (!view || view.hidden || document.hidden || !isPlaying()) return;
    var a = AUDIO;
    if (!SEEKING && a && isFinite(a.duration) && a.duration > 0) {
      var p = Math.min(100, a.currentTime / a.duration * 100) + '%', w = document.querySelector('.lkseek');
      if (w) w.style.setProperty('--p', p);
      var mb = $('lkMiniBar'); if (mb) mb.style.width = p;
    }
    waveRaf = requestAnimationFrame(waveStep);
  }
  var paintQ = 0;
  function paintSoon() { if (paintQ) return; paintQ = requestAnimationFrame(function () { paintQ = 0; paint(); }); }
  function fill() {
    var s = $('mSeek'); if (!s) return;
    var p = ((+s.value || 0) / 10) + '%', w = document.querySelector('.lkseek');
    if (w) w.style.setProperty('--p', p);
    if ($('lkMiniBar')) $('lkMiniBar').style.width = p;
  }

  /* ---------- construction de l'interface ---------- */
  function build(view) {
    /* icônes du lecteur */
    var set = function (sel, html) { var e = view.querySelector(sel); if (e) e.innerHTML = html; };
    set('#mPlay .i-play', IC.play); set('#mPlay .i-pause', IC.pause); set('#mPrev', svg(IC.prev)); set('#mNext', svg(IC.next));

    /* barre à vagues autour de #mSeek */
    var seek = $('mSeek'), w = document.createElement('div'); w.className = 'lkseek';
    w.innerHTML = '<svg class="w w0" viewBox="0 0 300 40" preserveAspectRatio="none"><path/></svg><svg class="w w1" viewBox="0 0 300 40" preserveAspectRatio="none"><path/></svg><div class="ln"><i></i></div>';
    seek.parentNode.insertBefore(w, seek); w.appendChild(seek);

    /* rangée du bas du lecteur */
    var bot = document.createElement('div'); bot.className = 'lkbot';
    bot.innerHTML = '<button type="button" id="lkAdd" aria-label="Ajouter des musiques">' + svg(IC.plus) + '</button><button type="button" class="lbl" id="lkLbl">Ma musique</button><button type="button" id="lkLyBtn" class="off" aria-label="Paroles">' + svg(IC.lyr) + '</button><button type="button" id="lkSleep" aria-label="Minuterie de sommeil">' + svg(IC.moon) + '<b class="bdg"></b></button><button type="button" id="lkOpenQ" aria-label="File d\'attente">' + svg(IC.queue) + '</button>';
    document.querySelector('#viewMusic .nowplaying').after(bot);

    /* mini-lecteur du haut */
    var mini = document.createElement('div'); mini.id = 'lkMini'; mini.className = 'lkmini';
    mini.innerHTML = '<span class="lkcv" id="lkMiniCv">♪</span><div class="lkmt"><div class="lkmtt" id="lkMiniT"></div><div class="lkb"><i id="lkMiniBar"></i></div></div><button type="button" id="lkMiniPP" aria-label="Lecture / pause"><svg class="i-play" viewBox="0 0 24 24">' + IC.play + '</svg><svg class="i-pause" viewBox="0 0 24 24">' + IC.pause + '</svg></button>';
    view.appendChild(mini);

    /* feuille « File d'attente » */
    var sheet = document.createElement('div'); sheet.id = 'lkSheet'; sheet.className = 'lksheet';
    sheet.innerHTML = '<button type="button" class="lkhandle" id="lkClose" aria-label="Fermer">' + svg(IC.down) + '</button>' +
      '<div class="lkqh"><h2>File d\'attente</h2><div class="lkqi"><button type="button" id="lkFocus" aria-label="Aller au titre en cours">' + svg(IC.focus) + '</button><button type="button" id="lkAdd2" aria-label="Ajouter des musiques">' + svg(IC.plus) + '</button><button type="button" id="lkClear" aria-label="Tout retirer">' + svg(IC.broom) + '</button></div></div>' +
      '<div class="lkqs"><input id="lkQSearch" type="search" placeholder="Rechercher un titre…" autocomplete="off"><button type="button" id="lkFavF" aria-label="Favoris seulement">' + svg(IC.heart) + '</button></div><div class="lkqs lkqs2"><button type="button" id="lkSort" class="chip">Tri : normal</button><button type="button" id="lkFade" class="chip">Fondu off</button><button type="button" id="lkEq" class="chip">Égaliseur</button></div>' +
      '<div class="lkqbody" id="lkQBody"></div>' +
      '<div class="lkpills"><button type="button" id="lkP1" aria-label="Répéter ce titre">' + svg(IC.rep1) + '</button><button type="button" id="lkP2" aria-label="Répéter la liste">' + svg(IC.rep) + '</button><button type="button" id="lkP3" aria-label="Aléatoire">' + svg(IC.shuf) + '</button></div>';
    var eqp = document.createElement('div'); eqp.id = 'lkEqP'; eqp.className = 'lkeqp';
    eqp.innerHTML = '<div class="lkeqh"><b>Égaliseur</b><button type="button" id="lkEqX" aria-label="Fermer">✕</button></div>' +
      '<label><span>Graves</span><input type="range" id="lkEqB" min="-12" max="12" step="1" value="0"><output id="lkEqBo">0 dB</output></label>' +
      '<label><span>Aigus</span><input type="range" id="lkEqT" min="-12" max="12" step="1" value="0"><output id="lkEqTo">0 dB</output></label>' +
      '<p id="lkEqN">Réglage pour tes musiques sur cet appareil. Il ne s\'applique pas aux musiques du cloud.</p>' +
      '<button type="button" id="lkEqR" class="chip">Remettre à zéro</button>';
    sheet.appendChild(eqp);
    view.appendChild(sheet);

    var ly = document.createElement('div'); ly.id = 'lkLy'; ly.className = 'lkly';
    ly.innerHTML = '<button type="button" class="lkhandle" id="lkLyClose" aria-label="Fermer">' + svg(IC.down) + '</button><h2 id="lkLyT"></h2><div class="lkly-body" id="lkLyBody"></div>';
    view.appendChild(ly);
    $('lkLbl').onclick = $('lkLyBtn').onclick = function () { if (!LY.has) return; ly.classList.add('open'); var e = ly.querySelector('.on'); if (e) setTimeout(function () { e.scrollIntoView({ block: 'center' }); }, 60); };
    $('lkLyClose').onclick = function () { ly.classList.remove('open'); };
    $('lkLyBody').onclick = function (e) {
      if (lyLong) { lyLong = false; return; }
      var p = e.target.closest('p[data-i]'); if (!p || !LY.lines) return;
      var d = ($('mDur').textContent || '0:00').split(':'), dur = (+d[0]) * 60 + (+d[1] || 0); if (!dur) return;
      $('mSeek').value = Math.round(LY.lines[+p.dataset.i].t / dur * 1000); $('mSeek').dispatchEvent(new Event('input', { bubbles: true }));
    };

    /* on déplace ta liste (avec tous ses boutons) dans la feuille : ses écouteurs restent attachés */
    var body = $('lkQBody');
    ['mMsg', 'mList', 'mShared'].forEach(function (id) { var e = $(id); if (e) body.appendChild(e); });

    var open = function (v) { view.classList.toggle('lkq', v); if (v) setTimeout(function () { var r = body.querySelector('.mrow.on'); if (r) r.scrollIntoView({ block: 'center' }); }, 380); };
    $('lkOpenQ').onclick = function () { open(true); };
    $('lkClose').onclick = function () { open(false); };
    $('lkQSearch').oninput = applyFilter;
    $('lkFavF').onclick = function () { FAVONLY = !FAVONLY; this.classList.toggle('on', FAVONLY); applyFilter(); toast(FAVONLY ? 'Favoris seulement' : 'Tous les titres'); };

    /* glisser vers le bas pour fermer (file d'attente + paroles) */
    function dragClose(el, scrollSel, close) {
      var y0 = 0, dy = 0, drag = false, track = false, sc0 = 0;
      el.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        if (e.target.closest && e.target.closest('.lkgrip, .lkeqp')) return;
        var sc = el.querySelector(scrollSel);
        track = true; drag = false; dy = 0; y0 = e.touches[0].clientY;
        sc0 = sc && sc.contains(e.target) ? sc.scrollTop : 0;
      }, { passive: true });
      el.addEventListener('touchmove', function (e) {
        if (!track) return;
        dy = e.touches[0].clientY - y0;
        if (!drag) {
          if (dy > 10 && sc0 <= 0) { drag = true; el.style.transition = 'none'; } else return;
        }
        if (e.cancelable) e.preventDefault();
        el.style.transform = 'translateY(' + Math.max(0, dy) + 'px)';
      }, { passive: false });
      var end = function () {
        if (!track) return; track = false;
        if (!drag) return; drag = false;
        el.style.transition = ''; el.style.transform = '';
        if (dy > 100) close();
      };
      el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
    }
    dragClose(sheet, '.lkqbody', function () { open(false); });
    dragClose(ly, '.lkly-body', function () { ly.classList.remove('open'); });
    $('lkAdd').onclick = $('lkAdd2').onclick = function () { $('mAdd').click(); };
    $('lkClear').onclick = function () { $('mClear').click(); };
    $('lkFocus').onclick = function () { var r = body.querySelector('.mrow.on'); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    $('lkMiniPP').onclick = function () { $('mPlay').click(); };
    $('lkP1').onclick = function () { setRepeat('one'); };
    $('lkP2').onclick = function () { setRepeat('all'); };
    $('lkP3').onclick = function () { $('mShuffle').click(); };
  }

  /* ---------- couleur dominante de la pochette → teinte du fond ---------- */
  function tint(url) {
    var root = document.documentElement;
    if (!url) { root.style.removeProperty('--lk-cov'); return; }
    var im = new Image();
    im.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = c.height = 12;
        var x = c.getContext('2d'); x.drawImage(im, 0, 0, 12, 12);
        var d = x.getImageData(0, 0, 12, 12).data, r = 0, g = 0, b = 0, w = 0;
        for (var i = 0; i < d.length; i += 4) {
          var mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]), s = (mx - mn) / (mx || 1) + .05;
          r += d[i] * s; g += d[i + 1] * s; b += d[i + 2] * s; w += s;
        }
        root.style.setProperty('--lk-cov', 'rgb(' + Math.round(r / w) + ',' + Math.round(g / w) + ',' + Math.round(b / w) + ')');
      } catch (e) {}
    };
    im.src = url;
  }

  /* ---------- paroles (LRCLIB : gratuit, sans clé) ---------- */
  function clean(s) {
    return (s || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[\(\[][^\)\]]*(official|video|audio|lyrics|clip|paroles|hd|4k|mv|vid[eé]o)[^\)\]]*[\)\]]/ig, '')
      .replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function parseLrc(txt) {
    var out = [];
    (txt || '').split('\n').forEach(function (l) {
      var m = l.match(/^\s*((?:\[\d+:\d+(?:[.:]\d+)?\])+)(.*)$/); if (!m) return;
      var text = m[2].trim();
      m[1].replace(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g, function (_, a, b, c) {
        out.push({ t: (+a) * 60 + (+b) + (c ? (+c) / Math.pow(10, c.length) : 0), text: text }); return '';
      });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function toks(s) { return norm(s).split(' ').filter(Boolean); }
  function frac(need, have) {
    if (!need.length) return 0;
    var n = 0; need.forEach(function (w) { if (have.indexOf(w) >= 0) n++; });
    return n / need.length;
  }
  function getDur(url) {
    return new Promise(function (res) {
      var a = new Audio(), done = false;
      function fin(v) { if (done) return; done = true; try { a.src = ''; } catch (e) {} res(v); }
      a.preload = 'metadata';
      a.onloadedmetadata = function () { fin(isFinite(a.duration) ? a.duration : 0); };
      a.onerror = function () { fin(0); };
      setTimeout(function () { fin(0); }, 5000);
      a.src = url;
    });
  }
  /* choisit les paroles qui correspondent VRAIMENT au titre (titre + artiste + durée), sinon rien */
  async function findLyrics(raw, tagArtist, dur) {
    var parts = raw.split(/\s+[-–—]\s+/), guess = '', title = raw;
    if (parts.length > 1) { guess = parts[0]; title = parts.slice(1).join(' '); }
    title = title.replace(/\b(feat|ft|featuring)\b.*$/i, '').trim() || raw;
    var tT = toks(title), aT = toks(guess + ' ' + (tagArtist || '')).filter(function (w) { return w.length > 1; });
    var urls = [];
    if (guess) urls.push('track_name=' + encodeURIComponent(title) + '&artist_name=' + encodeURIComponent(guess));
    urls.push('q=' + encodeURIComponent((guess ? guess + ' ' : '') + title));
    urls.push('q=' + encodeURIComponent(title));
    var best = null, bestS = 0;
    for (var i = 0; i < urls.length; i++) {
      try {
        var a = await (await fetch('https://lrclib.net/api/search?' + urls[i])).json();
        if (!Array.isArray(a)) continue;
        a.forEach(function (x) {
          if (!x.syncedLyrics && !x.plainLyrics) return;
          var xt = toks(x.trackName), xa = toks(x.artistName);
          var ts = Math.min(frac(tT, xt), frac(xt, tT) + .15);
          if (ts < .6) return;
          var as = aT.length ? frac(aT, xa.concat(xt)) : .5;
          var ds = 0;
          if (dur && x.duration) {
            var df = Math.abs(dur - x.duration);
            if (df > 15) return;
            ds = df <= 2 ? 1 : df <= 5 ? .5 : 0;
          }
          var s = ts * 3 + as * 2 + ds * 1.5 + (x.syncedLyrics ? .3 : 0);
          if (aT.length && as === 0) s -= 2;
          if (s > bestS) { bestS = s; best = x; }
        });
        if (best && bestS >= 5) break;
      } catch (e) {}
    }
    if (!best || bestS < 3) return null;
    return { lines: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null, plain: best.plainLyrics || '' };
  }
  function loadLyrics(t, o) {
    LY.key = t.url; LY.loading = true; setLy(null);
    if (LY.cache.has(t.url)) { LY.loading = false; setLy(LY.cache.get(t.url)); return; }
    getDur(t.url).then(function (dur) {
      if (LY.key !== t.url) return null;
      return findLyrics(clean(label(t)), o.artist || '', dur);
    }).then(function (res) {
      if (res === undefined || LY.key !== t.url) return;
      LY.cache.set(t.url, res); LY.loading = false;
      setLy(res);
    });
  }
  function setLy(res) {
    LY.lines = res && res.lines && res.lines.length ? res.lines : null;
    LY.plain = res ? (res.plain || '') : '';
    LY.has = !!(LY.lines || LY.plain); LY.idx = -2;
    var body = $('lkLyBody'); if (!body) return;
    body.innerHTML = '';
    if (LY.lines) LY.lines.forEach(function (l, i) { var p = document.createElement('p'); p.dataset.i = i; p.textContent = l.text || '♪'; body.appendChild(p); });
    else if (LY.plain) LY.plain.split(/\n\s*\n/).forEach(function (b) { var p = document.createElement('p'); p.className = 'pl'; p.textContent = b; body.appendChild(p); });
    var tt = $('lkLyT'), ti = $('lkMiniT'); if (tt && ti) tt.textContent = ti.textContent;
    var lb = $('lkLyBtn'); if (lb) lb.classList.toggle('off', !LY.has);
    lblSet(LY.has ? 'Paroles' : (!curKey ? 'Ma musique' : (LY.loading ? 'Recherche des paroles…' : 'Pas de paroles')));
  }
  function lblSet(txt) {
    var l = $('lkLbl'); if (!l || l.textContent === txt) return;
    l.classList.remove('sw'); void l.offsetWidth; l.textContent = txt; l.classList.add('sw');
  }
  function lyricTick() {
    if (!LY.lines) return;
    var s = $('mSeek'), d = ($('mDur') ? $('mDur').textContent : '0:00').split(':'), dur = (+d[0]) * 60 + (+d[1] || 0);
    if (!dur) return;
    var cur = (+s.value || 0) / 1000 * dur + .2, i = -1;
    for (var k = 0; k < LY.lines.length; k++) { if (LY.lines[k].t <= cur) i = k; else break; }
    if (i === LY.idx) return; LY.idx = i;
    lblSet(i < 0 ? 'Paroles' : (LY.lines[i].text || '♪'));
    var body = $('lkLyBody'); if (!body) return;
    var old = body.querySelector('.on'); if (old) old.classList.remove('on');
    var el = i >= 0 ? body.querySelector('[data-i="' + i + '"]') : null;
    if (el) { el.classList.add('on'); if ($('lkLy').classList.contains('open')) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  /* ---------- extras : minuterie de sommeil, reprise, double-tap ±10 s ---------- */
  var SL = { end: 0, step: 0 }, SLEEP = [0, 15, 30, 60], toastEl, toastTo, lastSave = 0, offered = false;
  function toast(txt, action, fn, ms) {
    var view = $('viewMusic'); if (!view) return;
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'lktoast'; view.appendChild(toastEl); }
    toastEl.innerHTML = '';
    var s = document.createElement('span'); s.textContent = txt; toastEl.appendChild(s);
    if (action) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = action;
      b.onclick = function () { toastEl.classList.remove('show'); fn(); }; toastEl.appendChild(b);
    }
    toastEl.classList.add('show'); clearTimeout(toastTo);
    toastTo = setTimeout(function () { toastEl.classList.remove('show'); }, ms || (action ? 8000 : 1800));
  }
  function durSec() { var d = ($('mDur') ? $('mDur').textContent : '0:00').split(':'); return (+d[0]) * 60 + (+d[1] || 0); }
  function seekBy(delta) {
    var s = $('mSeek'), dur = durSec(); if (!s || !dur) return;
    var n = Math.max(0, Math.min(dur - 1, (+s.value || 0) / 1000 * dur + delta));
    s.value = Math.round(n / dur * 1000); s.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function sleepTick() {
    var b = $('lkSleep'); if (!b) return;
    if (!SL.end) { b.classList.remove('on'); return; }
    var left = SL.end - Date.now();
    if (left <= 0) { SL.end = 0; SL.step = 0; b.classList.remove('on'); sleepFinish(); return; }
    b.classList.add('on'); b.querySelector('.bdg').textContent = Math.ceil(left / 60000) + ' min';
  }
  /* fin de minuterie : le son baisse doucement pendant 5 s puis pause */
  function sleepFinish() {
    if (!isPlaying()) { toast('Minuterie terminée'); return; }
    if (!AUDIO) { $('mPlay').click(); toast('Minuterie terminée : musique en pause'); return; }
    SL.fading = true;
    var t0 = Date.now(), v0 = AUDIO.volume || 1;
    var iv = setInterval(function () {
      var k = (Date.now() - t0) / 5000;
      if (k >= 1) {
        clearInterval(iv); if (isPlaying()) $('mPlay').click();
        setTimeout(function () { try { AUDIO.volume = 1; } catch (e) {} SL.fading = false; }, 600);
        toast('Minuterie terminée : musique en pause');
      } else { try { AUDIO.volume = v0 * (1 - k); } catch (e) {} }
    }, 100);
  }
  /* fondu au début et à la fin de chaque titre */
  function fadeLoop() {
    if (SL.fading || !AUDIO || !FD || AUDIO.paused) return;
    var d = AUDIO.duration, c = AUDIO.currentTime, f = 1;
    if (isFinite(d) && d > FD * 2) { if (c < FD) f = c / FD; else if (d - c < FD) f = (d - c) / FD; }
    try { AUDIO.volume = Math.max(0, Math.min(1, f)); } catch (e) {}
  }
  /* copier / partager une ligne de paroles (appui long) */
  function copyText(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).catch(function () {}); return; } } catch (e) {}
    try { var a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove(); } catch (e) {}
  }
  function lyricsPress() {
    var body = $('lkLyBody'), tm = 0, sx = 0, sy = 0;
    var stop = function () { clearTimeout(tm); };
    body.addEventListener('pointerdown', function (e) {
      var p = e.target.closest('p'); if (!p) return;
      lyLong = false; sx = e.clientX; sy = e.clientY; stop();
      tm = setTimeout(function () {
        var txt = p.textContent.trim(); if (!txt || txt === '♪') return;
        lyLong = true; copyText(txt);
        var ttl = $('lkMiniT') ? $('lkMiniT').textContent : '';
        toast('Ligne copiée', navigator.share ? 'Partager' : null, function () { navigator.share({ text: '« ' + txt + ' » — ' + ttl }).catch(function () {}); });
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (x) {} }
      }, 550);
    });
    body.addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { body.addEventListener(n, stop); });
    body.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  /* écran qui reste allumé quand les paroles sont ouvertes */
  function wake(on) {
    try {
      if (on && !WL && !WLp && navigator.wakeLock) {
        WLp = true;
        navigator.wakeLock.request('screen').then(function (l) { WL = l; WLp = false; l.addEventListener('release', function () { WL = null; }); }).catch(function () { WLp = false; });
      } else if (!on && WL) { WL.release(); WL = null; }
    } catch (e) { WLp = false; }
  }
  function sleepCycle() {
    SL.step = (SL.step + 1) % SLEEP.length; var m = SLEEP[SL.step];
    SL.end = m ? Date.now() + m * 60000 : 0; sleepTick();
    toast(m ? 'Pause automatique dans ' + m + ' min' : 'Minuterie désactivée');
  }
  function saveResume() {
    if (Date.now() - lastSave < 3000 || !isPlaying() || !curKey) return; lastSave = Date.now();
    var t = tracks()[curIndex()], v = +($('mSeek').value) || 0; if (!t) return;
    try { if (v > 985) localStorage.removeItem('lk_resume'); else localStorage.setItem('lk_resume', JSON.stringify({ l: label(t), v: v })); } catch (e) {}
  }
  function offerResume() {
    if (offered) return; var T = tracks(); if (!T.length) return; offered = true;
    if (curIndex() >= 0) return;
    var r = null; try { r = JSON.parse(localStorage.getItem('lk_resume') || 'null'); } catch (e) {}
    if (!r || r.v < 20) return;
    var i = -1; T.forEach(function (t, k) { if (label(t) === r.l) i = k; }); if (i < 0) return;
    toast('Reprendre « ' + r.l + ' » ?', 'Reprendre', function () {
      var row = document.querySelectorAll('#mList .mrow')[i], b = row && row.querySelector('.mname'); if (!b) return;
      b.click();
      var n = 0, iv = setInterval(function () {
        var dur = durSec();
        if (dur > 0 || ++n > 25) { clearInterval(iv); if (dur > 0) { var s = $('mSeek'); s.value = r.v; s.dispatchEvent(new Event('input', { bubbles: true })); } }
      }, 200);
    });
  }
  /* ---------- boucle A-B ---------- */
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function nowSec() {
    if (AUDIO && AUDIO.duration && isFinite(AUDIO.currentTime)) return AUDIO.currentTime;
    var s = $('mSeek'), d = durSec(); return d ? (+s.value || 0) / 1000 * d : 0;
  }
  function seekAbs(sec) {
    var s = $('mSeek'), dur = durSec(); if (!s || !dur) return;
    s.value = Math.round(Math.max(0, Math.min(dur - 1, sec)) / dur * 1000); s.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function abShow() {
    var b = $('lkAB'); if (!b) return;
    if (AB.a >= 0 && AB.b > 0) { b.textContent = fmt(AB.a) + '–' + fmt(AB.b); b.classList.add('on'); }
    else if (AB.a >= 0) { b.textContent = 'A ' + fmt(AB.a); b.classList.add('on'); }
    else { b.textContent = 'A-B'; b.classList.remove('on'); }
  }
  function abClick() {
    if (AB.a < 0) { AB.a = nowSec(); toast('Début de la boucle : ' + fmt(AB.a) + ' (appuie encore pour la fin)'); }
    else if (AB.b < 0) {
      var n = nowSec(); if (n - AB.a < 1) { toast('Choisis un point B un peu plus loin'); return; }
      AB.b = n; toast('Boucle ' + fmt(AB.a) + ' → ' + fmt(AB.b));
    } else { AB.a = AB.b = -1; toast('Boucle désactivée'); }
    abShow();
  }
  function abTick() { if (AB.a >= 0 && AB.b > 0 && isPlaying() && nowSec() >= AB.b) seekAbs(AB.a); }

  /* ---------- lire ensuite ---------- */
  function playRow(l) {
    var T = tracks();
    for (var i = 0; i < T.length; i++) if (label(T[i]) === l) {
      var row = document.querySelectorAll('#mList .mrow')[i], b = row && row.querySelector('.mname');
      if (b) { manualAt = Date.now(); b.click(); }
      return;
    }
  }
  function toggleNext(k) {
    var t = tracks()[k]; if (!t) return;
    var l = label(t), i = NEXTQ.indexOf(l);
    if (i >= 0) { NEXTQ.splice(i, 1); toast('Retiré de « Lire ensuite »'); }
    else { NEXTQ.push(l); toast('Lire ensuite : n° ' + NEXTQ.length); }
    paint();
  }
  function onTrackChange(idx, prev) {
    AB.a = AB.b = -1; abShow();
    var t = tracks()[idx]; if (!t) return;
    var l = label(t);
    if (Date.now() - manualAt < 1500) { if (NEXTQ[0] === l) NEXTQ.shift(); paint(); return; }
    if (prev < 0 || !NEXTQ.length) return;
    var q = NEXTQ.shift(); if (q !== l) playRow(q);
    paint();
  }
  function trackWatch() {
    var i = curIndex();
    if (lastIdx === undefined) { lastIdx = i; return; }
    if (i !== lastIdx) { var p = lastIdx; lastIdx = i; if (i >= 0) onTrackChange(i, p); }
  }
  function rowPress() {
    var body = $('lkQBody'), tm = 0, sx = 0, sy = 0, stop = function () { clearTimeout(tm); };
    body.addEventListener('pointerdown', function (e) {
      var tg = e.target.closest('.mname, .lkcv'), row = tg && tg.closest('.mrow');
      rowLong = false; if (!row || !row.closest('#mList')) return;
      sx = e.clientX; sy = e.clientY; stop();
      tm = setTimeout(function () {
        rowLong = true; toggleNext(+row.dataset.k);
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (x) {} }
      }, 550);
    });
    body.addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { body.addEventListener(n, stop); });
    body.addEventListener('contextmenu', function (e) { if (e.target.closest('.mrow')) e.preventDefault(); });
    body.addEventListener('click', function (e) {
      if (rowLong) { rowLong = false; e.stopPropagation(); e.preventDefault(); return; }
      manualAt = Date.now();
    }, true);
    var nx = $('mNext'), pv = $('mPrev');
    if (pv) pv.addEventListener('click', function () { manualAt = Date.now(); }, true);
    if (nx) nx.addEventListener('click', function (e) {
      manualAt = Date.now();
      if (NEXTQ.length) { e.stopImmediatePropagation(); e.preventDefault(); playRow(NEXTQ.shift()); paint(); }
    }, true);
  }

  /* ---------- « lire ensuite » : le moteur nous demande quel titre jouer à la fin d'un titre ---------- */
  function pickNext() {
    while (NEXTQ.length) {
      var l = NEXTQ.shift(), T = tracks();
      for (var i = 0; i < T.length; i++) if (label(T[i]) === l) { manualAt = Date.now(); setTimeout(paint, 0); return i; }
    }
    return -1;
  }

  /* ---------- glisser-déposer pour réordonner la file ---------- */
  function dragInit() {
    var body = $('lkQBody'), D = null;
    function offset() { return (D.y - D.y0) + (body.scrollTop - D.sc0); }
    function layout() {
      var dy = offset(), center = D.mids[D.from] + dy, to = 0, j;
      for (j = 0; j < D.lis.length; j++) if (j !== D.from && D.mids[j] < center) to++;
      D.to = to;
      D.lis.forEach(function (li, k) {
        if (k === D.from) { li.style.transform = 'translateY(' + dy + 'px)'; return; }
        var sh = 0;
        if (D.from < D.to && k > D.from && k <= D.to) sh = -D.h;
        else if (D.from > D.to && k < D.from && k >= D.to) sh = D.h;
        li.style.transform = sh ? 'translateY(' + sh + 'px)' : '';
      });
    }
    function step() {
      if (!D) return;
      var r = body.getBoundingClientRect();
      if (D.y < r.top + 70) body.scrollTop -= 9; else if (D.y > r.bottom - 70) body.scrollTop += 9;
      layout(); D.raf = requestAnimationFrame(step);
    }
    function finish(commit) {
      if (!D) return; var d = D; D = null;
      cancelAnimationFrame(d.raf);
      d.lis.forEach(function (li) { li.style.transform = ''; li.classList.remove('lkdragging'); });
      $('mList').classList.remove('lkdrag');
      if (commit && d.to !== d.from) { try { window.uandiMusic.move(d.from, d.to); } catch (e) {} paint(); }
    }
    body.addEventListener('pointerdown', function (e) {
      var g = e.target.closest && e.target.closest('.lkgrip'); if (!g || D || !canDrag() || !window.uandiMusic.move) return;
      var li = g.closest('li'), list = $('mList'); if (!li || li.parentNode !== list) return;
      var lis = Array.prototype.filter.call(list.children, function (x) { return x.querySelector('.mrow'); }), from = lis.indexOf(li);
      if (from < 0) return;
      e.preventDefault(); e.stopPropagation();
      try { g.setPointerCapture(e.pointerId); } catch (x) {}
      D = { id: e.pointerId, lis: lis, from: from, to: from, y0: e.clientY, y: e.clientY, sc0: body.scrollTop, h: li.offsetHeight,
            mids: lis.map(function (x) { return x.offsetTop + x.offsetHeight / 2; }), raf: 0 };
      li.classList.add('lkdragging'); list.classList.add('lkdrag');
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (x) {} }
      D.raf = requestAnimationFrame(step);
    });
    body.addEventListener('pointermove', function (e) { if (D && e.pointerId === D.id) { D.y = e.clientY; if (e.cancelable) e.preventDefault(); } });
    body.addEventListener('pointerup', function (e) { if (D && e.pointerId === D.id) finish(true); });
    body.addEventListener('pointercancel', function () { finish(false); });
    body.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.lkgrip')) { e.stopPropagation(); e.preventDefault(); } }, true);
    body.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('.lkgrip')) e.preventDefault(); });
    applyFilter();
  }

  /* ---------- égaliseur graves / aigus ---------- */
  function eqInit() {
    var P = $('lkEqP'), B = $('lkEqB'), T = $('lkEqT'), chip = $('lkEq'); if (!P || !chip || !window.uandiMusic.setEq) return;
    var txt = function (v) { return (v > 0 ? '+' : '') + v + ' dB'; };
    function show() {
      var st = window.uandiMusic.eq();
      B.value = st.bass; T.value = st.treble; $('lkEqBo').textContent = txt(st.bass); $('lkEqTo').textContent = txt(st.treble);
      chip.classList.toggle('on', !!(st.bass || st.treble));
    }
    function apply() { window.uandiMusic.setEq(+B.value, +T.value); show(); }
    chip.onclick = function () { show(); P.classList.toggle('open'); };
    $('lkEqX').onclick = function () { P.classList.remove('open'); };
    B.oninput = T.oninput = apply;
    $('lkEqR').onclick = function () { B.value = 0; T.value = 0; apply(); toast('Égaliseur remis à zéro', null, null, 1600); };
    show();
  }

  /* ---------- mini-lecteur flottant (Profil, Actualités : vidéos et stories) ---------- */
  /* partout dès qu'un titre est sélectionné, sauf sur l'écran Musique lui-même, l'écran de connexion et le verrouillage */
  function openDlg() { var d = document.querySelectorAll('dialog[open]'); return d.length ? d[d.length - 1] : null; }
  function floatWanted() {
    var v = function (id) { var e = $(id); return !!e && !e.hidden; };
    if (v('viewMusic')) return false;
    var ap = $('app'); if (ap && ap.hidden) return false;
    var d = openDlg(); if (d && d.id === 'lockDlg') return false;
    return true;
  }
  function floatInit() {
    var f = document.createElement('div'); f.id = 'lkFloat'; f.className = 'lkfloat'; f.hidden = true;
    f.innerHTML = '<span class="lkcv" id="lkFCv">♪</span><div class="lkmt"><div class="lkmtt" id="lkFT"></div><div class="lkb"><i id="lkFBar"></i></div></div>' +
      '<button type="button" id="lkFPP" aria-label="Lecture / pause"><svg class="i-play" viewBox="0 0 24 24">' + IC.play + '</svg><svg class="i-pause" viewBox="0 0 24 24">' + IC.pause + '</svg></button>' +
      '<button type="button" id="lkFNx" aria-label="Titre suivant">' + svg(IC.next) + '</button>';
    document.body.appendChild(f);
    $('lkFPP').onclick = function () { $('mPlay').click(); };
    $('lkFNx').onclick = function () { $('mNext').click(); };
    var pos = null; try { pos = JSON.parse(localStorage.getItem('lk_float') || 'null'); } catch (e) {}
    function place(x, y) {
      var w = f.offsetWidth, h = f.offsetHeight;
      x = Math.max(6, Math.min(window.innerWidth - w - 6, x)); y = Math.max(6, Math.min(window.innerHeight - h - 6, y));
      f.style.left = x + 'px'; f.style.top = y + 'px'; f.style.right = 'auto'; f.style.bottom = 'auto';
      return { x: x, y: y };
    }
    var id = null, sx = 0, sy = 0, ox = 0, oy = 0, moved = false;
    f.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      id = e.pointerId; sx = e.clientX; sy = e.clientY; var r = f.getBoundingClientRect(); ox = r.left; oy = r.top; moved = false;
      try { f.setPointerCapture(id); } catch (x) {}
    });
    f.addEventListener('pointermove', function (e) {
      if (id === null || e.pointerId !== id) return;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) moved = true;
      if (moved) pos = place(ox + e.clientX - sx, oy + e.clientY - sy);
    });
    var up = function (e) {
      if (id === null || (e && e.pointerId !== id)) return; id = null;
      if (moved) { if (pos) try { localStorage.setItem('lk_float', JSON.stringify(pos)); } catch (x) {} return; }
      var pr = openDlg(), go = function () { var o = $('openMusic'); if (o) o.click(); };
      if (pr) { pr.close(); setTimeout(go, 260); } else go();
    };
    f.addEventListener('pointerup', up); f.addEventListener('pointercancel', function () { id = null; });
    setInterval(function () {
      if (document.hidden) return;
      var show = curIndex() >= 0 && floatWanted(), pr = $('noteView');
      var host = openDlg() || document.body;
      if (f.parentNode !== host) host.appendChild(f);
      f.hidden = !show; if (!show) return;
      f.classList.toggle('playing', isPlaying());
      var tt = $('lkMiniT'), cv = $('lkMiniCv');
      if ($('lkFT') && tt) $('lkFT').textContent = tt.textContent;
      if (cv) { $('lkFCv').style.backgroundImage = cv.style.backgroundImage; $('lkFCv').classList.toggle('img', cv.classList.contains('img')); }
      var a = AUDIO, pc = a && isFinite(a.duration) && a.duration > 0 ? a.currentTime / a.duration * 100 : 0;
      $('lkFBar').style.width = pc + '%';
      if (pos && !id) place(pos.x, pos.y);
    }, 400);
  }

  /* ---------- tri de la file (affichage) ---------- */
  function applySort() {
    var list = $('mList'); if (!list) return;
    var rows = Array.prototype.slice.call(list.querySelectorAll('.mrow'));
    if (!SORT) { rows.forEach(function (r) { r.style.order = ''; }); return; }
    var T = tracks(), fv = favs();
    var keyed = rows.map(function (r, i) {
      var t = T[+r.dataset.k], o = (t && info.get(t.url)) || {}, l = t ? label(t) : '', k;
      if (SORT === 1) k = norm(l);
      else if (SORT === 2) k = (o.artist ? '0' + norm(o.artist) : '1') + ' ' + norm(l);
      else k = fv.indexOf(l) >= 0 ? '0' : '1';
      return { r: r, k: k, i: i };
    });
    keyed.sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i; });
    keyed.forEach(function (x, n) { x.r.style.order = n; });
  }

  /* ---------- commandes de l'écran verrouillé ---------- */
  function mediaKeys() {
    if (!('mediaSession' in navigator)) return;
    var ms = navigator.mediaSession, set = function (n, f) { try { ms.setActionHandler(n, f); } catch (e) {} };
    set('play', function () { if (!isPlaying()) $('mPlay').click(); });
    set('pause', function () { if (isPlaying()) $('mPlay').click(); });
    set('previoustrack', function () { $('mPrev').click(); });
    set('nexttrack', function () { $('mNext').click(); });
    set('seekbackward', function (d) { seekBy(-((d && d.seekOffset) || 10)); });
    set('seekforward', function (d) { seekBy((d && d.seekOffset) || 10); });
    set('seekto', function (d) { if (d && typeof d.seekTime === 'number') seekAbs(d.seekTime); });
  }
  function posState() {
    if (Date.now() - lastPos < 1000 || !('mediaSession' in navigator)) return; lastPos = Date.now();
    var d = durSec(); if (!d || !curKey) return;
    try {
      navigator.mediaSession.playbackState = isPlaying() ? 'playing' : 'paused';
      navigator.mediaSession.setPositionState({ duration: d, playbackRate: SPD || 1, position: Math.min(d, Math.max(0, nowSec())) });
    } catch (e) {}
  }

  /* favoris + recherche dans la file d'attente */
  function favs() { try { return JSON.parse(localStorage.getItem('lk_fav') || '[]'); } catch (e) { return []; } }
  function toggleFav(l) {
    var f = favs(), i = f.indexOf(l);
    if (i >= 0) f.splice(i, 1); else f.push(l);
    try { localStorage.setItem('lk_fav', JSON.stringify(f)); } catch (e) {}
    paint(); toast(i >= 0 ? 'Retiré des favoris' : 'Ajouté aux favoris');
  }
  function canDrag() { var si = $('lkQSearch'); return !SORT && !FAVONLY && !(si && si.value); }
  function applyFilter() {
    var si = $('lkQSearch'); if (!si) return;
    var qb = $('lkQBody'); if (qb) qb.classList.toggle('nodrag', !canDrag());
    var q = norm(si.value), fv = favs(), T = tracks();
    document.querySelectorAll('#lkQBody .mrow').forEach(function (row) {
      var nm = row.querySelector('.mname'), ok = !q || norm(nm ? nm.textContent : '').indexOf(q) >= 0;
      if (ok && FAVONLY) {
        var t = row.closest('#mList') ? T[+row.dataset.k] : null;
        ok = !!t && fv.indexOf(label(t)) >= 0;
      }
      row.style.display = ok ? '' : 'none';
    });
  }
  function extras() {
    $('lkSleep').onclick = sleepCycle;
    lyricsPress();
    var fdb = $('lkFade');
    try { var fv2 = +localStorage.getItem('lk_fade'); if (FADES.indexOf(fv2) >= 0) FD = fv2; } catch (e) {}
    var showFd = function () { fdb.textContent = FD ? 'Fondu ' + FD + ' s' : 'Fondu off'; fdb.classList.toggle('on', !!FD); };
    fdb.onclick = function () {
      FD = FADES[(FADES.indexOf(FD) + 1) % FADES.length];
      try { localStorage.setItem('lk_fade', FD); } catch (e) {}
      showFd();
      if (!FD && AUDIO && !SL.fading) { try { AUDIO.volume = 1; } catch (e) {} }
      toast(FD ? 'Fondu enchaîné de ' + FD + ' s entre les titres (et début/fin si pas de titre suivant)' : 'Fondu désactivé', null, null, 2600);
    };
    showFd(); setInterval(fadeLoop, 120);
    /* vitesse de lecture : petite pastille entre les deux temps */
    var SPEEDS = [0.75, 1, 1.25, 1.5, 2], dEl = $('mDur'), sp = document.createElement('button');
    try { var sv = +localStorage.getItem('lk_speed'); if (SPEEDS.indexOf(sv) >= 0) SPD = sv; } catch (e) {}
    sp.type = 'button'; sp.id = 'lkSpeed'; sp.className = 'lkspeed';
    var showSpd = function () { sp.textContent = (SPD + 'x').replace('.', ','); sp.classList.toggle('on', SPD !== 1); };
    sp.onclick = function () {
      SPD = SPEEDS[(SPEEDS.indexOf(SPD) + 1) % SPEEDS.length];
      try { localStorage.setItem('lk_speed', SPD); } catch (e) {}
      showSpd(); applyRate();
      toast(AUDIO || document.querySelector('audio') ? 'Vitesse ' + sp.textContent : 'Vitesse : s\'applique au prochain titre lancé');
    };
    showSpd();
    if (dEl && dEl.parentNode) dEl.parentNode.insertBefore(sp, dEl);
    /* boucle A-B : pastille à côté de la vitesse */
    var ab = document.createElement('button'); ab.type = 'button'; ab.id = 'lkAB'; ab.className = 'lkspeed'; ab.textContent = 'A-B';
    ab.onclick = abClick; if (dEl && dEl.parentNode) dEl.parentNode.insertBefore(ab, dEl);
    setInterval(abTick, 200);
    /* lire ensuite (appui long), tri, commandes écran verrouillé */
    rowPress(); mediaKeys();
    try { var so = +localStorage.getItem('lk_sort'); if (so >= 0 && so < SORTS.length) SORT = so; } catch (e) {}
    var sb = $('lkSort'); sb.textContent = SORTS[SORT]; sb.classList.toggle('on', !!SORT);
    sb.onclick = function () {
      SORT = (SORT + 1) % SORTS.length; try { localStorage.setItem('lk_sort', SORT); } catch (e) {}
      sb.textContent = SORTS[SORT]; sb.classList.toggle('on', !!SORT); applySort(); applyFilter();
      toast(SORT ? SORTS[SORT] + ' (affichage seulement, la lecture garde l\'ordre normal)' : 'Ordre normal', null, null, 2600);
    };
    $('lkOpenQ').addEventListener('click', function () {
      try { if (!localStorage.getItem('lk_hint')) { localStorage.setItem('lk_hint', '1'); setTimeout(function () { toast('Astuce : appui long sur un titre = « Lire ensuite »', null, null, 3500); }, 700); } } catch (e) {}
    });
    try { if (window.uandiMusic.audio) AUDIO = window.uandiMusic.audio(); } catch (e) {}
    if (!AUDIO) AUDIO = document.querySelector('audio');
    applyRate();
    try { if (window.uandiMusic.setNextPick) window.uandiMusic.setNextPick(pickNext); } catch (e) {}
    eqInit(); dragInit(); floatInit();
    var disc = $('mDisc'), lastTap = 0, lastSide = 0;
    if (disc) disc.addEventListener('click', function (e) {
      var r = disc.getBoundingClientRect(), side = e.clientX < r.left + r.width / 2 ? -1 : 1, now = Date.now();
      if (now - lastTap < 320 && side === lastSide) { seekBy(side * 10); toast(side < 0 ? '−10 s' : '+10 s'); lastTap = 0; }
      else { lastTap = now; lastSide = side; }
    });
  }

  function start() {
    var list = $('mList'), view = $('viewMusic');
    if (!list || !view || !window.uandiMusic || !$('mSeek') || !$('mPlay')) return false;
    build(view); extras();
    new MutationObserver(paintSoon).observe(list, { childList: true });
    new MutationObserver(paintSoon).observe($('mPlay'), { attributes: true, attributeFilter: ['class'] });
    $('mSeek').addEventListener('input', fill);
    ['pointerdown', 'touchstart'].forEach(function (n) { $('mSeek').addEventListener(n, function () { SEEKING = true; }, { passive: true }); });
    ['pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(function (n) { $('mSeek').addEventListener(n, function () { setTimeout(function () { SEEKING = false; }, 250); }, { passive: true }); });
    setInterval(function () { sleepTick(); saveResume(); trackWatch(); posState(); if (document.hidden) return; wake(!view.hidden && $('lkLy').classList.contains('open')); if (!view.hidden) offerResume(); if (view.hidden) { view.classList.remove('lkq'); $('lkLy').classList.remove('open'); return; }
      /* on garde le lecteur calé en haut (pas de défilement de la page) */
      var se = document.scrollingElement; if (se && se.scrollTop && !view.classList.contains('lkq')) se.scrollTop = 0;
      if (view.scrollTop) view.scrollTop = 0;
      var tb = $('tabbar'); if (tb) { var th = tb.offsetHeight; if (th !== window.__lkTb) { window.__lkTb = th; document.documentElement.style.setProperty('--lk-tab', th + 'px'); } }
      if (!waveRaf && isPlaying()) waveRaf = requestAnimationFrame(waveStep);
      fill(); lyricTick(); }, 300);
    paint(); fill();
    return true;
  }
  var tries = 0, iv = setInterval(function () { if (start() || ++tries > 80) clearInterval(iv); }, 250);
})();
