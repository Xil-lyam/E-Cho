/* E'cho — js/lark-music.js (v3)
   Écran Musique façon Lark Player, SANS toucher à ton moteur (script.js).
   Lit window.uandiMusic.tracks() et pilote tes boutons existants (#mPlay, #mNext, #mPrev, #mRepeat, #mShuffle, #mAdd, #mClear). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var info = new Map(), queue = [], busy = false, waveKey = '', curKey = '';
  var LY = { key: '', lines: null, plain: '', idx: -2, cache: new Map() };

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
      var dec = function (e, u) { return new TextDecoder(e === 1 ? 'utf-16' : e === 2 ? 'utf-16be' : e === 3 ? 'utf-8' : 'iso-8859-1').decode(u).replace(/\0/g, '').trim(); };
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
  function want(t) { if (!t || !t.url || info.has(t.url)) return; info.set(t.url, {}); queue.push(t); pump(); }
  async function pump() {
    if (busy) return; busy = true;
    while (queue.length) {
      var t = queue.shift(), o = info.get(t.url);
      try { var g = await readTags(await (await fetch(t.url)).blob()); o.cover = g.cover; o.artist = g.artist; } catch (e) {}
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
    var d = 'M0 40';
    for (var x = 0; x <= 300; x += 3) {
      var h = 0.06;
      bumps.forEach(function (b) { h += b[2] * Math.exp(-Math.pow((x - b[0]) / b[1], 2)); });
      d += 'L' + x + ' ' + (40 - Math.min(h, 1) * 30).toFixed(1);
    }
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
    var T = tracks(), play = isPlaying();
    document.querySelectorAll('#mList .mrow').forEach(function (row, i) {
      var t = T[i]; if (!t) return; want(t);
      var o = info.get(t.url) || {}, cv = row.querySelector('.lkcv');
      if (!cv) {
        cv = document.createElement('span'); cv.className = 'lkcv'; cv.textContent = '♪';
        cv.innerHTML = '♪<span class="lkeq"><i></i><i></i><i></i></span>'; row.insertBefore(cv, row.firstChild);
      }
      cv.style.backgroundImage = o.cover ? 'url(' + o.cover + ')' : grad(t.name || t.title);
      cv.classList.toggle('img', !!o.cover);
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

    if (t && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: label(t), artist: o.artist || 'E\'cho', artwork: o.cover ? [{ src: o.cover, sizes: '512x512' }] : [] }); } catch (e) {}
    }
  }
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
    bot.innerHTML = '<button type="button" id="lkAdd" aria-label="Ajouter des musiques">' + svg(IC.plus) + '</button><button type="button" class="lbl" id="lkLbl">Ma musique</button><button type="button" id="lkOpenQ" aria-label="File d\'attente">' + svg(IC.queue) + '</button>';
    document.querySelector('#viewMusic .nowplaying').after(bot);

    /* mini-lecteur du haut */
    var mini = document.createElement('div'); mini.id = 'lkMini'; mini.className = 'lkmini';
    mini.innerHTML = '<span class="lkcv" id="lkMiniCv">♪</span><div class="lkmt"><div class="lkmtt" id="lkMiniT"></div><div class="lkb"><i id="lkMiniBar"></i></div></div><button type="button" id="lkMiniPP" aria-label="Lecture / pause"><svg class="i-play" viewBox="0 0 24 24">' + IC.play + '</svg><svg class="i-pause" viewBox="0 0 24 24">' + IC.pause + '</svg></button>';
    view.appendChild(mini);

    /* feuille « File d'attente » */
    var sheet = document.createElement('div'); sheet.id = 'lkSheet'; sheet.className = 'lksheet';
    sheet.innerHTML = '<button type="button" class="lkhandle" id="lkClose" aria-label="Fermer">' + svg(IC.down) + '</button>' +
      '<div class="lkqh"><h2>File d\'attente</h2><div class="lkqi"><button type="button" id="lkFocus" aria-label="Aller au titre en cours">' + svg(IC.focus) + '</button><button type="button" id="lkAdd2" aria-label="Ajouter des musiques">' + svg(IC.plus) + '</button><button type="button" id="lkClear" aria-label="Tout retirer">' + svg(IC.broom) + '</button></div></div>' +
      '<div class="lkqbody" id="lkQBody"></div>' +
      '<div class="lkpills"><button type="button" id="lkP1" aria-label="Répéter ce titre">' + svg(IC.rep1) + '</button><button type="button" id="lkP2" aria-label="Répéter la liste">' + svg(IC.rep) + '</button><button type="button" id="lkP3" aria-label="Aléatoire">' + svg(IC.shuf) + '</button></div>';
    view.appendChild(sheet);

    var ly = document.createElement('div'); ly.id = 'lkLy'; ly.className = 'lkly';
    ly.innerHTML = '<button type="button" class="lkhandle" id="lkLyClose" aria-label="Fermer">' + svg(IC.down) + '</button><h2 id="lkLyT"></h2><div class="lkly-body" id="lkLyBody"></div>';
    view.appendChild(ly);
    $('lkLbl').onclick = function () { if (!LY.has) return; ly.classList.add('open'); var e = ly.querySelector('.on'); if (e) setTimeout(function () { e.scrollIntoView({ block: 'center' }); }, 60); };
    $('lkLyClose').onclick = function () { ly.classList.remove('open'); };
    $('lkLyBody').onclick = function (e) {
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
  async function findLyrics(title, artist) {
    var qs = [];
    if (artist) qs.push(title + ' ' + artist);
    qs.push(title);
    for (var i = 0; i < qs.length; i++) {
      try {
        var r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(qs[i]));
        var a = await r.json();
        if (!Array.isArray(a) || !a.length) continue;
        var s = a.filter(function (x) { return x.syncedLyrics; })[0] || a.filter(function (x) { return x.plainLyrics; })[0];
        if (s) return { lines: s.syncedLyrics ? parseLrc(s.syncedLyrics) : null, plain: s.plainLyrics || '' };
      } catch (e) {}
    }
    return null;
  }
  function loadLyrics(t, o) {
    LY.key = t.url; setLy(null);
    if (LY.cache.has(t.url)) { setLy(LY.cache.get(t.url)); return; }
    findLyrics(clean(label(t)), o.artist || '').then(function (res) {
      LY.cache.set(t.url, res);
      if (LY.key === t.url) setLy(res);
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
    lblSet(LY.has ? 'Paroles' : (curKey ? '' : 'Ma musique'));
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

  function start() {
    var list = $('mList'), view = $('viewMusic');
    if (!list || !view || !window.uandiMusic || !$('mSeek') || !$('mPlay')) return false;
    build(view);
    new MutationObserver(paint).observe(list, { childList: true });
    new MutationObserver(paint).observe($('mPlay'), { attributes: true, attributeFilter: ['class'] });
    $('mSeek').addEventListener('input', fill);
    setInterval(function () { if (view.hidden) { view.classList.remove('lkq'); $('lkLy').classList.remove('open'); return; } fill(); lyricTick(); }, 300);
    paint(); fill();
    return true;
  }
  var tries = 0, iv = setInterval(function () { if (start() || ++tries > 80) clearInterval(iv); }, 250);
})();
