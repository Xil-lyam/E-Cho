/* U&I — js/stories.js
   Stories de 24 h : photo, vidéo (30 s) ou texte sur fond coloré, + légende, + musique (passage de 30 s).
   - Barre de stories au-dessus de la liste des discussions (« Ma story » + celles de tes amis).
   - Visionneuse plein écran : touche à droite = suivant, à gauche = précédent.
   - Anneau autour de la photo sur les profils (js/profil.js).
   À charger APRÈS js/profil.js et js/profil-edition.js (avec « defer »). */
(function () {
  'use strict';
  if (window.UIStories) return;

  var CLOUD = 'hjnf54dr', PRESET = 'uandi_upload', BASE = 'https://res.cloudinary.com/' + CLOUD + '/';
  var TTL = 24 * 3600 * 1000, DUR = 5000, CAP_MAX = 120, MAXPX = 1080, CLIP = 30, MAXV = 30 * 1048576, MAXA = 25 * 1048576, CLIP_MS = CLIP * 1000;
  var BGS = [
    'linear-gradient(135deg,#8a2f55,#c2305f)', 'linear-gradient(135deg,#0b3d63,#0b7fc0)',
    'linear-gradient(135deg,#0f4a38,#3f9a70)', 'linear-gradient(135deg,#3b2a85,#7c5ce0)',
    'linear-gradient(135deg,#7a3a06,#d97706)', 'linear-gradient(135deg,#0a0c10,#1d2a4a)',
    'linear-gradient(135deg,#4a0f1c,#a8213a)', 'linear-gradient(135deg,#252b36,#586174)'
  ];

  /* ====== Outils ====== */
  var $ = function (id) { return document.getElementById(id); };
  function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function db() { return firebase.firestore(); }
  function me() { try { return firebase.auth().currentUser; } catch (e) { return null; } }
  function uname() { var u = me(); return u ? String(u.email || '').split('@')[0] : ''; }
  function cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '?'; }
  function hue(name) { var h = 0, s = String(name || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function cldOk(u) { return typeof u === 'string' && u.indexOf(BASE) === 0; }
  function fmt(sec) { sec = Math.max(0, Math.floor(sec || 0)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return 'il y a ' + m + ' min';
    return 'il y a ' + Math.floor(m / 60) + ' h';
  }

  /* photos de profil (cache) */
  var PH = {};
  function photoOf(uid) {
    if (!PH[uid]) PH[uid] = db().collection('presence').doc(uid).get().then(function (d) {
      var p = d.exists ? d.data().photo : '';
      return typeof p === 'string' && /^(https?:|data:image\/)/.test(p) ? p : '';
    }).catch(function () { return ''; });
    return PH[uid];
  }
  function paintAv(node, uid, name) {
    node.style.background = 'hsl(' + hue(name) + ' 38% 42%)'; node.textContent = cap(name).charAt(0);
    photoOf(uid).then(function (u) {
      if (u) { node.style.background = 'center / cover no-repeat url("' + u.replace(/"/g, '%22') + '")'; node.textContent = ''; }
    });
  }

  /* stories déjà vues (sur cet appareil) */
  function seenKey() { var u = me(); return 'uandi-stseen-' + (u ? u.uid : ''); }
  function getSeen() { try { return JSON.parse(localStorage.getItem(seenKey()) || '{}') || {}; } catch (e) { return {}; } }
  function markSeen(uid, ts) {
    var s = getSeen(); if ((s[uid] || 0) >= ts) return; s[uid] = ts;
    try { localStorage.setItem(seenKey(), JSON.stringify(s)); } catch (e) {}
  }
  function isNew(uid, list) { return !!(list && list.length && list[list.length - 1].ts > (getSeen()[uid] || 0)); }

  /* ====== Lecture des stories ====== */
  var cache = {};   /* uid -> { t, list } */
  function fetchUser(uid, force) {
    var c = cache[uid];
    if (!force && c && Date.now() - c.t < 30000) return Promise.resolve(c.list);
    return db().collection('stories').where('uid', '==', uid).get().then(function (sn) {
      var now = Date.now(), out = [], mine = me() && me().uid === uid;
      sn.forEach(function (d) {
        var v = d.data() || {}; if (typeof v.ts !== 'number') return;
        if (now - v.ts > TTL) { if (mine) d.ref.delete().catch(function () {}); return; }
        v.id = d.id; out.push(v);
      });
      out.sort(function (a, b) { return a.ts - b.ts; });
      cache[uid] = { t: now, list: out };
      return out;
    }).catch(function () { return []; });
  }
  function fetchMany(uids, force) {
    var out = {}, need = [], jobs = [];
    uids.forEach(function (u) { var c = cache[u]; if (!force && c && Date.now() - c.t < 30000) out[u] = c.list; else need.push(u); });
    for (var i = 0; i < need.length; i += 10) (function (chunk) {
      jobs.push(db().collection('stories').where('uid', 'in', chunk).get().then(function (sn) {
        var now = Date.now(), tmp = {};
        chunk.forEach(function (u) { tmp[u] = []; });
        sn.forEach(function (d) {
          var v = d.data() || {};
          if (typeof v.ts !== 'number' || typeof v.uid !== 'string' || !tmp[v.uid] || now - v.ts > TTL) return;
          v.id = d.id; tmp[v.uid].push(v);
        });
        chunk.forEach(function (u) { tmp[u].sort(function (a, b) { return a.ts - b.ts; }); cache[u] = { t: now, list: tmp[u] }; out[u] = tmp[u]; });
      }).catch(function () { chunk.forEach(function (u) { out[u] = out[u] || []; }); }));
    })(need.slice(i, i + 10));
    return Promise.all(jobs).then(function () { return out; });
  }

  /* ====== Styles ====== */
  function css() {
    if ($('stStyle')) return;
    var s = mk('style'); s.id = 'stStyle';
    s.textContent = [
      '#stBar{display:flex;gap:12px;overflow-x:auto;padding:8px 14px 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch}',
      '#stBar::-webkit-scrollbar{display:none}',
      '#stBar .stb{flex:none;width:66px;margin:0;border:0;background:none;color:var(--ink);font:inherit;font-size:.72rem;text-align:center;cursor:pointer;padding:0}',
      '#stBar .stb .ring{position:relative;width:62px;height:62px;border-radius:50%;padding:3px;margin:0 auto 4px;background:linear-gradient(135deg,#ff9a3c,#ff3d77,#a03cff);box-sizing:border-box}',
      '#stBar .stb.seen .ring{background:#6b7280}',
      '#stBar .stb.none .ring{background:transparent;border:2px dashed var(--muted)}',
      '#stBar .stb .ph{width:100%;height:100%;border-radius:50%;border:2px solid var(--bg);box-sizing:border-box;display:grid;place-items:center;color:#fff;font-weight:700;font-size:1.2rem}',
      '#stBar .stb .plus{position:absolute;right:-3px;bottom:-3px;width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--accent-ink,#fff);display:grid;place-items:center;font-style:normal;font-weight:700;font-size:.95rem;border:2px solid var(--bg)}',
      '#stBar .stb .n{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#stView{width:100vw;max-width:100vw;height:100vh;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:#000;color:#fff;overflow:hidden}',
      '#stView::backdrop{background:#000}',
      '.st-stage{position:absolute;inset:0;display:grid;place-items:center}',
      '.st-stage img{max-width:100%;max-height:100%;object-fit:contain;display:block}',
      '.st-bigtxt{padding:0 28px;text-align:center;font-size:1.7rem;font-weight:800;line-height:1.25;overflow-wrap:anywhere;text-shadow:0 2px 10px rgba(0,0,0,.35)}',
      '.st-bars{position:absolute;z-index:3;top:calc(8px + env(safe-area-inset-top,0px));left:8px;right:8px;display:flex;gap:4px}',
      '.st-bars i{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.35);overflow:hidden}',
      '.st-bars b{display:block;height:100%;width:0;background:#fff}',
      '.st-head{position:absolute;z-index:4;top:calc(20px + env(safe-area-inset-top,0px));left:12px;right:12px;display:flex;align-items:center;gap:10px}',
      '.st-av{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-weight:700;background-size:cover!important}',
      '.st-who{flex:1;min-width:0}.st-who b{display:block;font-size:.95rem;text-shadow:0 1px 4px rgba(0,0,0,.6)}.st-who small{font-size:.75rem;opacity:.85;text-shadow:0 1px 4px rgba(0,0,0,.6)}',
      '.st-eye{font-size:.8rem;padding:4px 8px;border-radius:999px;background:rgba(0,0,0,.45)}',
      '.st-b{flex:none;width:38px;height:38px;border-radius:50%;border:0;background:rgba(0,0,0,.5);color:#fff;font-size:1rem;cursor:pointer;padding:0}',
      '.st-tap{position:absolute;z-index:2;top:80px;bottom:90px;border:0;background:none;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.st-tap.l{left:0;width:35%}.st-tap.r{right:0;width:65%}',
      '.st-cap{position:absolute;z-index:3;left:16px;right:16px;bottom:calc(26px + env(safe-area-inset-bottom,0px));padding:10px 14px;border-radius:14px;background:rgba(0,0,0,.45);text-align:center;font-size:1.02rem;overflow-wrap:anywhere}',
      '.st-vid{max-width:100%;max-height:100%;object-fit:contain;display:block;background:#000}',
      '.st-song{position:absolute;z-index:3;top:calc(68px + env(safe-area-inset-top,0px));left:12px;max-width:calc(100% - 24px);padding:5px 11px;border-radius:999px;background:rgba(0,0,0,.5);font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#stComp{width:min(24rem,calc(100vw - 20px));max-height:calc(100dvh - 20px)}',
      '.st-preview{position:relative}',
      '.st-preview video,.st-preview .st-pimg{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}',
      '.st-rng{display:flex;align-items:center;gap:10px;margin:8px 0;font-size:.82rem}.st-rng input{flex:1;min-width:0;accent-color:var(--accent)}.st-rng span{min-width:3em;text-align:right}',
      '.st-mchip{display:flex;align-items:center;gap:8px;margin:8px 0;padding:8px 12px;border-radius:14px;background:var(--soft);font-size:.85rem}',
      '.st-mchip span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.st-mchip button{flex:none;width:30px;height:30px;border:0;border-radius:50%;background:var(--surface);color:var(--ink);cursor:pointer;padding:0}',
      '#stMus{width:min(24rem,calc(100vw - 20px));max-height:calc(100dvh - 20px);overflow-y:auto}',
      '.st-mh{margin:14px 0 6px;color:var(--muted);font-size:.8rem}',
      '.st-trk{display:block;width:100%;text-align:left;padding:11px 12px;margin:0 0 6px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font:inherit;font-size:.88rem;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.st-preview{width:100%;height:44dvh;border-radius:16px;overflow:hidden;display:grid;place-items:center;margin:0 0 10px;box-sizing:border-box}',
      '.st-pt{position:relative;z-index:1;padding:16px;color:#fff;font-weight:800;font-size:1.3rem;text-align:center;overflow-wrap:anywhere;text-shadow:0 1px 8px rgba(0,0,0,.6)}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ====== Visionneuse ====== */
  var view = null, V = { q: [], qi: 0, si: 0, timer: null, tok: 0, muted: false };
  var A = new Audio(); A.preload = 'auto';
  function paintMute() { var b = $('stMute'); if (b) b.textContent = V.muted ? '🔇' : '🔊'; }
  function stopMedia() {
    try { A.pause(); } catch (e) {}
    A.onerror = A.onloadedmetadata = A.ontimeupdate = null;
    var st = $('stStage'), v = st && st.querySelector('video');
    if (v) { try { v.pause(); } catch (e) {} v.onerror = v.onloadedmetadata = v.ontimeupdate = null; }
  }
  function playEl(el) {
    var p = el.play();
    if (p && p.catch) p.catch(function () { if (!el.muted) { el.muted = true; V.muted = true; paintMute(); el.play().catch(function () {}); } });
  }
  function musicSrc(s) {
    if (s.mCut || s.mUrl.indexOf('/upload/') < 0) return s.mUrl;
    var a = +s.mS || 0;
    return s.mUrl.replace('/upload/', '/upload/so_' + a + ',eo_' + (a + CLIP) + '/').replace(/\.[a-z0-9]+$/i, '.mp3');
  }
  function vidSrc(s) {
    var a = +s.vS || 0;
    return s.vid.replace('/upload/', '/upload/so_' + a + ',eo_' + (a + CLIP) + ',w_720,c_limit,q_auto,vc_h264/').replace(/\.[a-z0-9]+$/i, '.mp4');
  }
  function ensureView() {
    if (view) return;
    css();
    view = document.createElement('dialog'); view.id = 'stView';
    view.innerHTML = '<div class="st-stage" id="stStage"></div><div class="st-bars" id="stBars"></div>' +
      '<div class="st-head"><span class="st-av" id="stAv"></span><div class="st-who"><b id="stName"></b><small id="stTime"></small></div>' +
      '<span class="st-eye" id="stEye" hidden></span>' +
      '<button type="button" class="st-b" id="stMute" hidden aria-label="Son">🔊</button>' +
      '<button type="button" class="st-b" id="stAdd" hidden aria-label="Ajouter une story">＋</button>' +
      '<button type="button" class="st-b" id="stDel" hidden aria-label="Supprimer cette story">🗑</button>' +
      '<button type="button" class="st-b" id="stX" aria-label="Fermer">✕</button></div>' +
      '<button type="button" class="st-tap l" id="stBack" aria-label="Précédent"></button>' +
      '<button type="button" class="st-tap r" id="stFwd" aria-label="Suivant"></button>' +
      '<div class="st-song" id="stSong" hidden></div><div class="st-cap" id="stCap" hidden></div>';
    document.body.appendChild(view);
    $('stX').addEventListener('click', function () { view.close(); });
    $('stBack').addEventListener('click', prev);
    $('stFwd').addEventListener('click', next);
    $('stAdd').addEventListener('click', function () { view.close(); compose(); });
    $('stDel').addEventListener('click', delCurrent);
    $('stMute').addEventListener('click', function () {
      V.muted = !V.muted; A.muted = V.muted;
      var v = $('stStage').querySelector('video'); if (v) v.muted = V.muted;
      paintMute();
    });
    view.addEventListener('close', function () { clearTimeout(V.timer); V.tok++; stopMedia(); renderBar(); });
  }
  function openQueue(q, start) {
    if (!q.length || !me()) return;
    ensureView();
    V.q = q; V.qi = start || 0; V.si = 0;
    if (!view.open) view.showModal();
    show();
  }
  function show() {
    clearTimeout(V.timer); stopMedia();
    var u = V.q[V.qi]; if (!u) { view.close(); return; }
    var s = u.list[V.si]; if (!s) { nextUser(); return; }
    var mineS = u.uid === me().uid, tok = ++V.tok;
    var bars = $('stBars'); bars.textContent = '';
    u.list.forEach(function (x, i) { var t = mk('i'), f = mk('b'); if (i < V.si) f.style.width = '100%'; t.appendChild(f); bars.appendChild(t); });
    paintAv($('stAv'), u.uid, u.name);
    $('stName').textContent = cap(u.name); $('stTime').textContent = ago(s.ts);
    $('stDel').hidden = !mineS; $('stAdd').hidden = !mineS;
    var eye = $('stEye'); eye.hidden = !mineS;
    eye.textContent = '👁 ' + (Array.isArray(s.viewers) ? s.viewers.filter(function (v) { return v !== me().uid; }).length : 0);

    var st = $('stStage'), capEl = $('stCap'), cur = bars.children[V.si].firstChild;
    st.textContent = ''; st.style.background = '';
    var hasMusic = !!(s.mUrl && cldOk(s.mUrl)), hasVid = !!(s.vid && cldOk(s.vid)), ran = false;
    function run(ms) {
      if (tok !== V.tok || ran) return; ran = true; ms = ms || DUR;
      cur.style.transition = 'none'; cur.style.width = '0'; void cur.offsetWidth;
      cur.style.transition = 'width ' + ms + 'ms linear'; cur.style.width = '100%';
      V.timer = setTimeout(next, ms);
    }
    $('stSong').hidden = !hasMusic; if (hasMusic) $('stSong').textContent = '🎵 ' + (s.mT || 'Musique');
    $('stMute').hidden = !(hasMusic || hasVid); paintMute();
    capEl.textContent = s.cap || ''; capEl.hidden = !s.cap;
    if (hasVid) {
      var vd = document.createElement('video'), fb = false, a0 = 0;
      vd.className = 'st-vid'; vd.playsInline = true; vd.setAttribute('playsinline', ''); vd.preload = 'auto'; vd.muted = V.muted;
      vd.onloadedmetadata = function () { run(Math.min(CLIP, isFinite(vd.duration) && vd.duration > 0 ? vd.duration : CLIP) * 1000); };
      vd.onerror = function () {
        if (fb) { run(DUR); return; }
        fb = true; a0 = +s.vS || 0;
        vd.onloadedmetadata = function () { try { vd.currentTime = a0; } catch (e) {} run(Math.min(CLIP, isFinite(vd.duration) && vd.duration > 0 ? vd.duration - a0 : CLIP) * 1000); };
        vd.ontimeupdate = function () { if (vd.currentTime >= a0 + CLIP) vd.pause(); };
        vd.src = s.vid; playEl(vd);
      };
      vd.src = vidSrc(s); st.appendChild(vd); playEl(vd);
    } else {
      if (s.url && cldOk(s.url)) {
        var im = document.createElement('img'); im.alt = '';
        im.onload = function () { run(hasMusic ? CLIP_MS : DUR); }; im.onerror = function () { run(hasMusic ? CLIP_MS : DUR); };
        im.src = s.url; st.appendChild(im);
      } else {
        st.style.background = BGS[(+s.bg || 0) % BGS.length];
        st.appendChild(mk('div', 'st-bigtxt', s.cap || ''));
        capEl.hidden = true; run(hasMusic ? CLIP_MS : DUR);
      }
      if (hasMusic) {
        var tried = false;
        A.muted = V.muted;
        A.onerror = function () {
          if (tried || s.mCut) return; tried = true; A.onerror = null;
          A.onloadedmetadata = function () { try { A.currentTime = +s.mS || 0; } catch (e) {} };
          A.ontimeupdate = function () { if (A.currentTime >= (+s.mS || 0) + CLIP) A.pause(); };
          A.src = s.mUrl; playEl(A);
        };
        A.src = musicSrc(s); playEl(A);
      }
    }
    if (!mineS) {
      if (!(Array.isArray(s.viewers) && s.viewers.indexOf(me().uid) >= 0)) {
        db().collection('stories').doc(s.id).update({ viewers: firebase.firestore.FieldValue.arrayUnion(me().uid) }).catch(function () {});
        s.viewers = (s.viewers || []).concat([me().uid]);
      }
    }
    markSeen(u.uid, s.ts);
  }
  function next() {
    var u = V.q[V.qi]; if (!u) return;
    if (V.si < u.list.length - 1) { V.si++; show(); } else nextUser();
  }
  function prev() {
    if (V.si > 0) { V.si--; show(); }
    else if (V.qi > 0) { V.qi--; V.si = 0; show(); }
    else show();
  }
  function nextUser() {
    if (V.qi < V.q.length - 1) { V.qi++; V.si = 0; show(); } else view.close();
  }
  function delCurrent() {
    var u = V.q[V.qi], s = u && u.list[V.si];
    if (!s || !confirm('Supprimer cette story ?')) return;
    clearTimeout(V.timer);
    db().collection('stories').doc(s.id).delete().then(function () {
      u.list.splice(V.si, 1); delete cache[u.uid];
      if (!u.list.length) view.close();
      else { if (V.si >= u.list.length) V.si = u.list.length - 1; show(); }
      refresh(true); document.dispatchEvent(new CustomEvent('ui-profile-saved'));
    }).catch(function () { alert('Suppression impossible pour le moment.'); show(); });
  }

  /* ====== Publier une story ====== */
  var comp = null, C = { file: null, blob: '', kind: '', vD: 0, vS: 0, bg: 0, busy: false, mus: null };
  function shrink(file) {
    return new Promise(function (ok, ko) {
      var im = new Image(), url = URL.createObjectURL(file);
      im.onload = function () {
        var k = Math.min(1, MAXPX / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        var g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); c.toBlob(function (b) { if (b) ok(b); else ko(new Error('image')); }, 'image/jpeg', 0.82);
      };
      im.onerror = function () { URL.revokeObjectURL(url); ko(new Error('image')); };
      im.src = url;
    });
  }
  function upload(blob, kind, onProg, fname) {
    return new Promise(function (ok, ko) {
      var fd = new FormData(); if (fname) fd.append('file', blob, fname); else fd.append('file', blob); fd.append('upload_preset', PRESET);
      var x = new XMLHttpRequest(); x.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUD + '/' + (kind || 'image') + '/upload');
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProg) onProg(e.loaded / e.total); };
      x.onload = function () {
        try { var j = JSON.parse(x.responseText); if (j.secure_url && cldOk(j.secure_url)) ok(j.secure_url); else ko(new Error((j.error && j.error.message) || 'refusé')); }
        catch (e) { ko(e); }
      };
      x.onerror = function () { ko(new Error('réseau')); };
      x.timeout = 300000; x.ontimeout = function () { ko(new Error('délai dépassé')); };
      x.send(fd);
    });
  }
  /* coupe 30 s d'un morceau de ton téléphone et le transforme en petit fichier WAV (mono) */
  async function cutWav(blob, start, len) {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('noac');
    var ctx = new AC(), buf;
    try { buf = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { try { ctx.close(); } catch (e) {} }
    var sr = buf.sampleRate, from = Math.floor(start * sr), n = Math.min(buf.length - from, Math.floor(len * sr));
    if (n <= 0) throw new Error('range');
    var c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    var step = Math.max(1, Math.round(sr / 22050)), outSr = Math.round(sr / step), m = Math.floor(n / step);
    var pcm = new Int16Array(m);
    for (var i = 0; i < m; i++) {
      var sum = 0;
      for (var j = 0; j < step; j++) { var k = from + i * step + j; sum += c1 ? (c0[k] + c1[k]) / 2 : c0[k]; }
      var x = Math.max(-1, Math.min(1, sum / step)); pcm[i] = x < 0 ? x * 0x8000 : x * 0x7FFF;
    }
    var out = new ArrayBuffer(44 + m * 2), v = new DataView(out);
    function w(o, t) { for (var q = 0; q < t.length; q++) v.setUint8(o + q, t.charCodeAt(q)); }
    w(0, 'RIFF'); v.setUint32(4, 36 + m * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, outSr, true); v.setUint32(28, outSr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, m * 2, true);
    new Int16Array(out, 44).set(pcm);
    return new Blob([out], { type: 'audio/wav' });
  }
  /* envoie la musique choisie et renvoie les champs à enregistrer dans la story */
  async function prepareMusic(m, onProg) {
    if (m.remote && cldOk(m.url)) return { mUrl: m.url, mS: m.s, mCut: false, mT: m.title };   /* déjà sur Cloudinary : coupé à la lecture */
    var blob = m.file || await (await fetch(m.url)).blob();
    try {
      var wav = await cutWav(blob, m.s, CLIP);
      return { mUrl: await upload(wav, 'video', onProg, 'story.wav'), mS: 0, mCut: true, mT: m.title };
    } catch (e) {
      if (blob.size > MAXA) throw new Error('musique trop lourde');
      return { mUrl: await upload(blob, 'video', onProg, (m.title || 'musique').slice(0, 40).replace(/[^\w.-]+/g, '_') + '.mp3'), mS: m.s, mCut: false, mT: m.title };
    }
  }

  function cErr(t) { var e = $('stErr'); e.textContent = t || ''; e.hidden = !t; }
  function clearMedia() { if (C.blob) { try { URL.revokeObjectURL(C.blob); } catch (e) {} } C.blob = ''; C.file = null; C.kind = ''; C.vD = 0; C.vS = 0; }
  function paintComp() {
    var p = $('stPreview');
    var oldV = p.querySelector('video'); if (oldV) { try { oldV.pause(); } catch (e) {} oldV.remove(); }
    var oldI = p.querySelector('.st-pimg'); if (oldI) oldI.remove();
    p.style.background = '';
    if (C.kind === 'image') {
      p.style.background = '#000';
      var pi = document.createElement('img'); pi.className = 'st-pimg'; pi.alt = ''; pi.src = C.blob;
      p.insertBefore(pi, p.firstChild);
    } else if (C.kind === 'video') {
      p.style.background = '#000';
      var v = document.createElement('video'); v.muted = true; v.loop = false; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.src = C.blob;
      v.addEventListener('loadedmetadata', function () { try { v.currentTime = C.vS; } catch (e) {} });
      v.addEventListener('timeupdate', function () { if (v.currentTime >= C.vS + CLIP || v.ended) { v.currentTime = C.vS; v.play().catch(function () {}); } });
      v.addEventListener('ended', function () { v.currentTime = C.vS; v.play().catch(function () {}); });
      p.insertBefore(v, p.firstChild); v.play().catch(function () {});
    } else {
      p.style.background = BGS[C.bg];
    }
    $('stPrevTxt').textContent = $('stText').value;
    $('stBg').hidden = !!C.kind; $('stNoPh').hidden = !C.kind;
    $('stMusBtn').hidden = C.kind === 'video';
    var over = C.kind === 'video' && C.vD > CLIP + 1, mx = Math.max(0, Math.floor(C.vD - CLIP));
    $('stVR').hidden = !over; if (over) { $('stVRi').max = mx; $('stVRi').value = Math.min(C.vS, mx); $('stVRv').textContent = fmt(C.vS); }
    $('stChip').hidden = !C.mus || C.kind === 'video';
    if (C.mus) $('stChipT').textContent = '🎵 ' + C.mus.title + ' · ' + fmt(C.mus.s) + ' → ' + fmt(C.mus.s + Math.min(CLIP, C.mus.D || CLIP));
    $('stTxtN').textContent = $('stText').value.length + ' / ' + CAP_MAX;
  }
  function ensureComp() {
    if (comp) return;
    css();
    comp = document.createElement('dialog'); comp.id = 'stComp'; comp.className = 'sheet';
    comp.innerHTML = '<h2>Nouvelle story</h2>' +
      '<div class="st-preview" id="stPreview"><div class="st-pt" id="stPrevTxt"></div></div>' +
      '<div class="pfrow"><button class="ghost" id="stPick" type="button">📷 Photo</button><button class="ghost" id="stVid" type="button">🎬 Vidéo</button><button class="ghost" id="stBg" type="button">🎨 Fond</button><button class="ghost" id="stNoPh" type="button" hidden>Retirer</button></div>' +
      '<input type="file" id="stPhFile" accept="image/*" hidden><input type="file" id="stVFile" accept="video/*" hidden>' +
      '<div class="st-rng" id="stVR" hidden><label for="stVRi">Début (30 s)</label><input type="range" id="stVRi" min="0" max="0" step="1" value="0"><span id="stVRv">0:00</span></div>' +
      '<div class="pfrow"><button class="ghost" id="stMusBtn" type="button">🎵 Musique (30 s)</button></div>' +
      '<div class="st-mchip" id="stChip" hidden><span id="stChipT"></span><button type="button" id="stChipE" aria-label="Changer le passage">✎</button><button type="button" id="stChipX" aria-label="Retirer la musique">✕</button></div>' +
      '<textarea class="field" id="stText" rows="2" maxlength="' + CAP_MAX + '" placeholder="Écris quelque chose…"></textarea>' +
      '<p class="hint" id="stTxtN" style="text-align:right">0 / ' + CAP_MAX + '</p>' +
      '<p class="hint">Visible 24 h par tes amis. Vidéo : 30 s maximum, 30 Mo.</p><p class="err" id="stErr" hidden></p>' +
      '<div class="pfrow"><button class="ghost" id="stGo" type="button">Publier</button><button class="ghost" id="stCancel" type="button">Annuler</button></div>';
    document.body.appendChild(comp);
    $('stPick').addEventListener('click', function () { if (!C.busy) $('stPhFile').click(); });
    $('stVid').addEventListener('click', function () { if (!C.busy) $('stVFile').click(); });
    $('stPhFile').addEventListener('change', function () {
      var f = this.files && this.files[0]; this.value = '';
      if (!f) return;
      if (f.type && !/^image\//.test(f.type)) { cErr('Choisis une image.'); return; }
      clearMedia(); C.file = f; C.kind = 'image'; C.blob = URL.createObjectURL(f); cErr(''); paintComp();
    });
    $('stVFile').addEventListener('change', function () {
      var f = this.files && this.files[0]; this.value = '';
      if (!f) return;
      if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name || '')) { cErr('Choisis un fichier vidéo.'); return; }
      if (f.size > MAXV) { cErr('Vidéo trop lourde : 30 Mo maximum (coupe-la ou réduis sa qualité).'); return; }
      clearMedia(); C.file = f; C.kind = 'video'; C.blob = URL.createObjectURL(f); C.mus = null; cErr('');
      var pr = document.createElement('video'); pr.preload = 'metadata'; pr.muted = true;
      pr.onloadedmetadata = function () { C.vD = isFinite(pr.duration) ? pr.duration : 0; paintComp(); };
      pr.onerror = function () { C.vD = 0; paintComp(); };
      pr.src = C.blob; paintComp();
    });
    $('stVRi').addEventListener('input', function () { C.vS = +this.value; $('stVRv').textContent = fmt(C.vS); var v = $('stPreview').querySelector('video'); if (v) { try { v.currentTime = C.vS; } catch (e) {} } });
    $('stNoPh').addEventListener('click', function () { clearMedia(); paintComp(); });
    $('stBg').addEventListener('click', function () { C.bg = (C.bg + 1) % BGS.length; paintComp(); });
    $('stText').addEventListener('input', paintComp);
    $('stMusBtn').addEventListener('click', function () { if (!C.busy) openMusic(function (m) { C.mus = m; paintComp(); }); });
    $('stChipE').addEventListener('click', function () { if (!C.busy) openMusic(function (m) { C.mus = m; paintComp(); }); });
    $('stChipX').addEventListener('click', function () { C.mus = null; paintComp(); });
    $('stCancel').addEventListener('click', function () { if (!C.busy) comp.close(); });
    $('stGo').addEventListener('click', publish);
    comp.addEventListener('close', function () { clearMedia(); C.mus = null; var v = $('stPreview').querySelector('video'); if (v) { try { v.pause(); } catch (e) {} } });
  }
  function compose() {
    if (!me()) return;
    ensureComp();
    clearMedia(); C.mus = null; C.bg = Math.floor(Math.random() * BGS.length); C.busy = false;
    $('stText').value = ''; cErr(''); $('stGo').disabled = false; $('stGo').textContent = 'Publier';
    paintComp();
    comp.showModal();
  }
  async function publish() {
    var u = me(); if (!u || C.busy) return;
    var text = $('stText').value.trim().slice(0, CAP_MAX);
    if (!C.file && !text && !C.mus) { cErr('Ajoute une photo, une vidéo, un texte ou une musique.'); return; }
    C.busy = true; cErr(''); $('stGo').disabled = true; $('stGo').textContent = 'Envoi…';
    function prog(label) { return function (p) { $('stGo').textContent = label + ' ' + Math.round(p * 100) + ' %'; }; }
    try {
      var data = { uid: u.uid, name: uname(), ts: Date.now(), cap: text, viewers: [] };
      if (C.kind === 'video') { data.vid = await upload(C.file, 'video', prog('Vidéo'), null); data.vS = Math.round(C.vS); }
      else {
        if (C.kind === 'image') { var b = await shrink(C.file); data.url = await upload(b, 'image'); } else data.bg = C.bg;
        if (C.mus) { $('stGo').textContent = 'Musique…'; var mm = await prepareMusic(C.mus, prog('Musique')); data.mUrl = mm.mUrl; data.mS = Math.round(mm.mS); data.mCut = mm.mCut; data.mT = String(mm.mT || '').slice(0, 100); }
      }
      await db().collection('stories').add(data);
      delete cache[u.uid];
      comp.close();
      refresh(true);
      document.dispatchEvent(new CustomEvent('ui-profile-saved'));
    } catch (e) {
      cErr('Publication impossible (' + ((e && e.message) || 'connexion') + '). Vérifie aussi les règles Firestore « stories ».');
    }
    C.busy = false; $('stGo').disabled = false; $('stGo').textContent = 'Publier';
  }

  /* ====== Choisir une musique + le passage de 30 s ====== */
  var mus = null, MS = { cb: null, pa: null, iv: null, sel: null, s: 0, D: 0 };
  function stopPrev() { clearInterval(MS.iv); if (MS.pa) { try { MS.pa.pause(); } catch (e) {} } $('stMusPlay') && ($('stMusPlay').textContent = '▶ Écouter le passage'); }
  function musPane(n) { $('stMusList').hidden = n !== 1; $('stMusCut').hidden = n !== 2; }
  function ensureMus() {
    if (mus) return;
    css();
    mus = document.createElement('dialog'); mus.id = 'stMus'; mus.className = 'sheet';
    mus.innerHTML = '<h2>Musique de la story</h2>' +
      '<div id="stMusList"></div>' +
      '<div id="stMusCut" hidden><p class="trinfo" id="stMusT"></p><p class="hint" id="stMusI"></p>' +
        '<div class="st-rng" id="stMusRw"><label for="stMusR">Début</label><input type="range" id="stMusR" min="0" max="0" step="1" value="0" disabled><span id="stMusV">0:00</span></div>' +
        '<button class="ghost" id="stMusPlay" type="button" disabled>▶ Écouter le passage</button>' +
        '<div class="pfrow"><button class="ghost" id="stMusOk" type="button" disabled>Valider</button><button class="ghost" id="stMusBack" type="button">Retour</button></div></div>' +
      '<button class="ghost" id="stMusX" type="button" style="margin-top:10px">Annuler</button>';
    document.body.appendChild(mus);
    $('stMusX').addEventListener('click', function () { stopPrev(); mus.close(); });
    $('stMusBack').addEventListener('click', function () { stopPrev(); musPane(1); });
    mus.addEventListener('close', stopPrev);
    $('stMusR').addEventListener('input', function () { MS.s = +this.value; paintCut(); if (!MS.pa.paused) playCut(); });
    $('stMusPlay').addEventListener('click', function () { if (MS.pa && !MS.pa.paused) stopPrev(); else playCut(); });
    $('stMusOk').addEventListener('click', function () {
      stopPrev();
      var t = MS.sel, cb = MS.cb;
      mus.close();
      if (t && cb) cb({ title: t.title, url: t.url, file: t.file || null, remote: !!t.remote, D: MS.D, s: MS.s });
    });
  }
  function paintCut() {
    $('stMusV').textContent = fmt(MS.s);
    $('stMusI').textContent = MS.D > CLIP ? 'Passage de 30 s : ' + fmt(MS.s) + ' → ' + fmt(MS.s + CLIP) : 'Ce morceau dure ' + fmt(MS.D) + ' : il sera pris en entier.';
  }
  function playCut() {
    var a = MS.pa; if (!a) return;
    clearInterval(MS.iv);
    try { a.currentTime = MS.s; } catch (e) {}
    a.play().catch(function () {});
    $('stMusPlay').textContent = '❚❚ Arrêter';
    var end = MS.s + Math.min(CLIP, MS.D || CLIP);
    MS.iv = setInterval(function () { if (a.paused || a.currentTime >= end) stopPrev(); }, 100);
  }
  function pickTrack(t) {
    MS.sel = t; MS.s = 0; MS.D = 0;
    $('stMusT').textContent = '🎵 ' + t.title; $('stMusI').textContent = 'Chargement…';
    var r = $('stMusR'); r.disabled = true; r.max = 0; r.value = 0; $('stMusPlay').disabled = true; $('stMusOk').disabled = true;
    $('stMusRw').hidden = true;
    stopPrev();
    var a = new Audio(); a.preload = 'metadata'; MS.pa = a;
    a.onloadedmetadata = function () {
      MS.D = isFinite(a.duration) ? Math.floor(a.duration) : 0;
      if (!MS.D) { $('stMusI').textContent = 'Impossible de lire la durée de ce morceau.'; return; }
      var mx = Math.max(0, MS.D - CLIP);
      r.max = mx; r.value = 0; r.disabled = mx < 1; $('stMusRw').hidden = mx < 1;
      $('stMusPlay').disabled = false; $('stMusOk').disabled = false; paintCut();
    };
    a.onerror = function () { $('stMusI').textContent = 'Impossible de lire ce morceau.'; };
    a.src = t.url;
    musPane(2);
  }
  function trkBtn(t) {
    var b = mk('button', 'st-trk', t.title); b.type = 'button';
    b.addEventListener('click', function () { pickTrack(t); });
    return b;
  }
  function buildMusicList() {
    var box = $('stMusList'); box.textContent = '';
    var imp = mk('button', 'ghost', '📱 Importer depuis mon téléphone'); imp.type = 'button';
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac'; inp.hidden = true;
    imp.addEventListener('click', function () { inp.click(); });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.value = ''; if (!f) return;
      pickTrack({ title: String(f.name || 'Musique').replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f), file: f, remote: false });
    });
    box.appendChild(imp); box.appendChild(inp);

    /* ma musique (section Musique de l'appli) */
    var h1 = mk('p', 'st-mh', 'Ma musique'), l1 = mk('div'); box.appendChild(h1); box.appendChild(l1);
    l1.appendChild(mk('p', 'hint', 'Chargement…'));
    var seen = {};
    var loadMine = window.uandiMusic ? uandiMusic.load() : Promise.resolve();
    Promise.resolve(loadMine).then(function () {
      var tr = window.uandiMusic ? uandiMusic.tracks() : [];
      l1.textContent = '';
      tr.forEach(function (t) {
        if (!t || !t.url) return;
        if (t.cid) seen[t.cid] = 1;
        l1.appendChild(trkBtn({ title: (uandiMusic.label ? uandiMusic.label(t) : t.title || t.name) || 'Musique', url: t.url, remote: !!t.remote && cldOk(t.url), file: null }));
      });
      if (!tr.length) l1.appendChild(mk('p', 'hint', 'Aucune musique dans ta section Musique.'));
    }).catch(function () { l1.textContent = ''; l1.appendChild(mk('p', 'hint', 'Ta musique est indisponible.')); });

    /* musiques partagées (collection sharedMusic) */
    var h2 = mk('p', 'st-mh', 'Musiques partagées'), l2 = mk('div'); box.appendChild(h2); box.appendChild(l2);
    l2.appendChild(mk('p', 'hint', 'Chargement…'));
    db().collection('sharedMusic').where('pub', '==', true).limit(60).get().then(function (sn) {
      var rows = [];
      sn.forEach(function (d) { var v = d.data() || {}; if (cldOk(v.url) && !seen[d.id]) rows.push({ ts: v.ts || 0, t: { title: (v.title || v.name || 'Musique') + (v.uname ? ' · ' + cap(v.uname) : ''), url: v.url, remote: true, file: null } }); });
      rows.sort(function (a, b) { return b.ts - a.ts; });
      l2.textContent = '';
      rows.forEach(function (r) { l2.appendChild(trkBtn(r.t)); });
      if (!rows.length) l2.appendChild(mk('p', 'hint', 'Aucune musique partagée pour l’instant.'));
    }).catch(function () { l2.textContent = ''; l2.appendChild(mk('p', 'hint', 'Musiques partagées indisponibles.')); });
  }
  function openMusic(cb) {
    ensureMus(); MS.cb = cb; stopPrev(); musPane(1); buildMusicList(); mus.showModal();
  }

  /* ====== Barre de stories ====== */
  var bar = null, items = [], FR = null, FRt = 0, lastRef = 0;
  function ensureBar() {
    if (bar && document.body.contains(bar)) return true;
    var tb = document.querySelector('.tbar'); if (!tb || !tb.parentNode) return false;
    css();
    bar = mk('div'); bar.id = 'stBar'; bar.setAttribute('aria-label', 'Stories');
    tb.parentNode.insertBefore(bar, tb);
    return true;
  }
  function barItem(uid, label, nm, list, isMine, idx) {
    var b = mk('button', 'stb' + (list.length ? ((isMine || isNew(uid, list)) ? '' : ' seen') : ' none')); b.type = 'button';
    var ring = mk('div', 'ring'), ph = mk('div', 'ph'); paintAv(ph, uid, nm); ring.appendChild(ph);
    if (isMine && !list.length) ring.appendChild(mk('i', 'plus', '+'));
    b.appendChild(ring); b.appendChild(mk('span', 'n', cap(label)));
    b.addEventListener('click', function () {
      if (isMine) { if (list.length) openQueue([{ uid: uid, name: nm, list: list }], 0); else compose(); return; }
      openQueue(items.map(function (i) { return { uid: i.uid, name: i.name, list: i.list }; }), idx);
    });
    return b;
  }
  function renderBar() {
    if (!ensureBar()) return;
    var u = me(); bar.textContent = '';
    if (!u) return;
    var mine = (cache[u.uid] && cache[u.uid].list) || [];
    bar.appendChild(barItem(u.uid, 'Ma story', uname(), mine, true, 0));
    items.forEach(function (it, i) { bar.appendChild(barItem(it.uid, it.name, it.name, it.list, false, i)); });
  }
  async function refresh(force) {
    var u = me(); if (!u) return;
    lastRef = Date.now();
    try {
      if (!FR || force || Date.now() - FRt > 300000) {
        var l = window.UIProfile && UIProfile.friendsOf ? await UIProfile.friendsOf(u.uid) : null;
        if (l) { FR = l; FRt = Date.now(); }
      }
      var names = {}, uids = [];
      (FR || []).forEach(function (f) { if (f.uid !== u.uid && !names[f.uid]) { uids.push(f.uid); names[f.uid] = f.name; } });
      await fetchUser(u.uid, force);
      var map = await fetchMany(uids, force);
      items = uids.filter(function (id) { return map[id] && map[id].length; }).map(function (id) {
        return { uid: id, name: names[id], list: map[id], nw: isNew(id, map[id]) };
      }).sort(function (a, b) {
        if (a.nw !== b.nw) return a.nw ? -1 : 1;
        return b.list[b.list.length - 1].ts - a.list[a.list.length - 1].ts;
      });
    } catch (e) {}
    renderBar();
  }

  /* ====== Démarrage ====== */
  function start() {
    css();
    firebase.auth().onAuthStateChanged(function (u) {
      if (!u) { items = []; FR = null; renderBar(); return; }
      setTimeout(function () { refresh(true); }, 2500);
    });
    setInterval(function () { if (!document.hidden && me()) refresh(false); }, 120000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && me() && Date.now() - lastRef > 60000) refresh(false); });
  }
  (function wait(n) {
    if (window.firebase && firebase.apps && firebase.apps.length && window.UIProfile) { try { start(); } catch (e) { console.warn('Stories :', e); } return; }
    if (n < 400) setTimeout(function () { wait(n + 1); }, 300);
  })(0);

  window.UIStories = {
    fetch: fetchUser,
    isNew: isNew,
    compose: compose,
    refresh: refresh,
    open: function (uid, name) {
      fetchUser(uid, true).then(function (list) {
        if (!list.length) { if (me() && uid === me().uid) compose(); return; }
        openQueue([{ uid: uid, name: name || '', list: list }], 0);
      });
    }
  };
})();
