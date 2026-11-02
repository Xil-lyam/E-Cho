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
  /* Icônes SVG au trait (remplacent les emojis) */
  var IC = {
    music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.500"/><circle cx="17.500" cy="16" r="2.500"/>',
    volume: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.500 9a4 4 0 0 1 0 6M19 6.500a8 8 0 0 1 0 11"/>',
    volumeOff: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 9.500l4 5M21 9.500l-4 5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    eye: '<path d="M2 12s3.500-7 10-7 10 7 10 7-3.500 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.500" r="3.500"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10.500l6-3.500v10l-6-3.500"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.500 0 2-1 1.500-2.200-.5-1.200.3-2.300 1.700-2.300H17a4 4 0 0 0 4-4c0-5-4-9.500-9-9.500z"/><circle cx="7.500" cy="11" r="1"/><circle cx="11" cy="7.500" r="1"/><circle cx="16" cy="8.500" r="1"/>',
    phone: '<rect x="7" y="2.500" width="10" height="19" rx="2"/><path d="M11 18.500h2"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.500 6.500l4 4"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    more: '<circle cx="5" cy="12" r="1.600" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.600" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.600" fill="currentColor" stroke="none"/>',
    star: '<path d="M12 3l2.700 5.600 6.100.9-4.400 4.300 1 6.100L12 17l-5.400 2.900 1-6.100L3.200 9.500l6.100-.9z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    bookmark: '<path d="M7 4h10v17l-5-4-5 4z"/>',
    users: '<circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c0-3.500 3-5.500 6.500-5.500s6.500 2 6.500 5.500"/><path d="M16 4.700a3.500 3.500 0 0 1 0 6.600M18 14.800c2.300.7 3.500 2.500 3.500 5.200"/>',
    send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    heart: '<path d="M12 20s-7-4.500-7-10a4 4 0 0 1 7-2.500A4 4 0 0 1 19 10c0 5.500-7 10-7 10z"/>',
    flame: '<path d="M12 3c1 3.500 5 5.500 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .3 1.500 1 2 2 2 0-3-1-5 1-8z"/>',
    laugh: '<circle cx="12" cy="12" r="9"/><path d="M8.500 10h.01M15.500 10h.01"/><path d="M7.500 13.500h9a4.500 4.500 0 0 1-9 0z"/>',
    surprise: '<circle cx="12" cy="12" r="9"/><path d="M8.500 10h.01M15.500 10h.01"/><circle cx="12" cy="16" r="2"/>',
    sad: '<circle cx="12" cy="12" r="9"/><path d="M8.500 10h.01M15.500 10h.01"/><path d="M8.500 16.500c1-1.200 2.200-1.800 3.500-1.800s2.500.6 3.500 1.800"/>',
    thumb: '<path d="M7 11v9H4v-9z"/><path d="M7 11l4-7c1.500 0 2.500 1 2.500 2.500V9H19a2 2 0 0 1 2 2.300l-1 7a2 2 0 0 1-2 1.700H7"/>'
  };
  function ic(n, sz, gap) {
    return '<svg viewBox="0 0 24 24" width="' + (sz || 16) + '" height="' + (sz || 16) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;flex:none' + (gap ? ';margin-right:' + gap + 'px' : '') + '">' + (IC[n] || '') + '</svg>';
  }
  /* setIc(el, 'music', 'Titre') : icône + texte (le texte reste du texte brut) */
  function setIc(el, n, t, sz) { el.innerHTML = ic(n, sz || 15, t ? 6 : 0); if (t) el.appendChild(document.createTextNode(t)); return el; }
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
    if (m < 1440) return 'il y a ' + Math.floor(m / 60) + ' h';
    return 'il y a ' + Math.floor(m / 1440) + ' j';
  }

  /* amis proches, signalements, visibilité */
  function closeIds() { try { var u = me(); return JSON.parse(localStorage.getItem('uandi-close-' + (u ? u.uid : '')) || '[]') || []; } catch (e) { return []; } }
  function repKey() { var u = me(); return 'uandi-streported-' + (u ? u.uid : ''); }
  function repIds() { try { return JSON.parse(localStorage.getItem(repKey()) || '[]') || []; } catch (e) { return []; } }
  function repAdd(id) { var l = repIds(); if (l.indexOf(id) < 0) l.push(id); try { localStorage.setItem(repKey(), JSON.stringify(l.slice(-200))); } catch (e) {} }
  function visible(v) {
    var u = me(); if (!u) return false;
    if (v.uid === u.uid) return true;
    if (Array.isArray(v.to) && v.to.indexOf(u.uid) < 0) return false;
    if (v.reports && typeof v.reports === 'object' && Object.keys(v.reports).length >= 3) return false;
    if (repIds().indexOf(v.id) >= 0) return false;
    return true;
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
        if (now - v.ts > TTL) return; /* plus de 24 h : reste dans l'archive (privée) */
        v.id = d.id; if (visible(v)) out.push(v);
      });
      out.sort(function (a, b) { return a.ts - b.ts; });
      cache[uid] = { t: now, list: out };
      return out;
    }).catch(function () { return []; });
  }
  /* stories « À la une » (gardées au-delà de 24 h) */
  function fetchHl(uid) {
    return db().collection('stories').where('uid', '==', uid).where('hl', '==', true).get().then(function (sn) {
      var out = []; sn.forEach(function (d) { var v = d.data() || {}; if (typeof v.ts !== 'number') return; v.id = d.id; if (visible(v)) out.push(v); });
      out.sort(function (a, b) { return a.ts - b.ts; }); return out;
    }).catch(function () { return []; });
  }
  function thumbCss(sv) {
    if (sv.url && cldOk(sv.url)) return 'center / cover no-repeat url("' + sv.url.replace('/upload/', '/upload/w_160,h_160,c_fill,q_auto/').replace(/"/g, '%22') + '")';
    if (sv.vid && cldOk(sv.vid)) return 'center / cover no-repeat url("' + sv.vid.replace('/upload/', '/upload/so_' + (+sv.vS || 0) + ',w_160,h_160,c_fill/').replace(/\.[a-z0-9]+$/i, '.jpg').replace(/"/g, '%22') + '")';
    return BGS[(+sv.bg || 0) % BGS.length];
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
          v.id = d.id; if (visible(v)) tmp[v.uid].push(v);
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
      '#stView::after{content:"";position:absolute;left:0;right:0;top:0;height:130px;background:linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,0));z-index:1;pointer-events:none}',
      '.st-head{position:absolute;z-index:4;top:calc(20px + env(safe-area-inset-top,0px));left:12px;right:6px;display:flex;align-items:center;gap:10px}',
      '.st-av{flex:none;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;font-weight:700;background-size:cover!important}',
      '.st-who{flex:1;min-width:0}.st-l1{display:flex;align-items:baseline;gap:8px;min-width:0}',
      '.st-who b{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.92rem;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.6)}',
      '.st-who small{flex:none;font-size:.78rem;opacity:.8;text-shadow:0 1px 4px rgba(0,0,0,.6)}',
      '.st-eye{display:inline-flex;align-items:center;height:44px;padding:0 16px;border-radius:999px;background:rgba(0,0,0,.5);font-size:.9rem;font-weight:600}',
      '.st-b{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:transparent;color:#fff;cursor:pointer;padding:0;display:grid;place-items:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,.55))}',
      '.st-eye{border:0;color:#fff;font:inherit;font-size:.9rem;font-weight:600;cursor:pointer}',
      '#stView,.st-tap{touch-action:none}',
      '#stVw{position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;justify-content:flex-end;background:rgba(0,0,0,.5)}#stVw[hidden]{display:none}',
      '#stVw>div{max-height:68%;overflow-y:auto;touch-action:pan-y;background:#1c1c1f;border-radius:18px 18px 0 0;padding:10px 16px calc(18px + env(safe-area-inset-bottom,0px))}',
      '.st-grab{display:block;width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.3);margin:0 auto 12px}',
      '#stVw h3{margin:0 0 8px;font-size:1rem;font-weight:700}',
      '.st-vrow{display:flex;align-items:center;gap:12px;padding:7px 0}.st-vrow .st-av{width:40px;height:40px}.st-vrow b{font-size:.92rem;font-weight:600}',
      '.st-vrow b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.st-rxb{flex:none;font-size:1.6rem;line-height:1;margin-left:auto}',
      '.st-rx button[aria-pressed="true"]{background:rgba(0,0,0,.1);transform:translateY(-3px) scale(1.15)}',
      '.st-nb{position:absolute;z-index:4;left:14px;top:calc(68px + env(safe-area-inset-top,0px));max-width:min(260px,calc(100% - 90px));padding:7px 14px 8px;border-radius:18px;background:#fff;color:#111;box-shadow:0 4px 16px rgba(0,0,0,.4);pointer-events:none}',
      '.st-nb[hidden]{display:none}',
      '.st-nb::before{content:"";position:absolute;left:16px;top:-6px;width:14px;height:14px;background:#fff;border-radius:3px;transform:rotate(45deg)}',
      '.st-nb small{position:relative;display:flex;align-items:center;gap:4px;font-size:.62rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7a7a85;margin-bottom:2px}',
      '.st-nb span{position:relative;display:block;font-size:.92rem;font-weight:600;line-height:1.25;overflow-wrap:anywhere}',
      '.st-vempty{margin:8px 0 4px;color:rgba(255,255,255,.65);font-size:.9rem}',
      '.st-cf{flex:none;display:inline-flex;align-self:center;color:#2ecc71}.st-cf[hidden]{display:none}',
      '#stMenuW{position:absolute;inset:0;z-index:8}#stMenuW[hidden]{display:none}',
      '#stMenu{position:absolute;top:calc(64px + env(safe-area-inset-top,0px));right:10px;min-width:220px;background:#1c1c1f;border-radius:14px;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.5)}',
      '#stMenu button{display:flex;align-items:center;gap:12px;width:100%;padding:12px;border:0;border-radius:10px;background:none;color:#fff;font:inherit;font-size:.92rem;text-align:left;cursor:pointer}#stMenu button:active{background:rgba(255,255,255,.1)}#stMenu .dg{color:#ff6b6b}',
      '.st-reply{position:absolute;z-index:4;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px))}.st-reply[hidden]{display:none}',
      '.st-rx{display:flex;justify-content:space-between;align-items:center;gap:2px;margin:0 0 12px;padding:6px 8px;border-radius:999px;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.35);animation:stRxBar .22s ease-out both}.st-rx[hidden]{display:none}',
      '@keyframes stRxBar{from{opacity:0;transform:translateY(12px) scale(.85)}to{opacity:1;transform:none}}@keyframes stRxIn{from{opacity:0;transform:translateY(22px) scale(.2)}to{opacity:1;transform:none}}@keyframes stFly{0%{opacity:0;transform:translate(-50%,0) scale(.4)}20%{opacity:1}100%{opacity:0;transform:translate(-50%,-190px) scale(1.7)}}',
      '.st-fly{position:absolute;z-index:9;left:50%;bottom:calc(120px + env(safe-area-inset-bottom,0px));font-size:3rem;line-height:1;pointer-events:none;animation:stFly 1s ease-out forwards}',
      '.st-rx button{flex:1;max-width:54px;height:48px;border:0;border-radius:50%;background:none;font-size:2rem;line-height:1;cursor:pointer;padding:0;display:grid;place-items:center;transition:transform .16s cubic-bezier(.34,1.56,.64,1);animation:stRxIn .4s cubic-bezier(.34,1.56,.64,1) both;animation-delay:calc(var(--i) * 45ms);-webkit-tap-highlight-color:transparent}.st-rx button:active{transform:translateY(-10px) scale(1.5)}',
      '.st-rrow{display:flex;align-items:center;gap:8px}',
      '.st-rrow input{flex:1;min-width:0;height:46px;border-radius:999px;border:1.5px solid rgba(255,255,255,.55);background:rgba(0,0,0,.25);color:#fff;font:inherit;font-size:16px;padding:0 18px}.st-rrow input::placeholder{color:rgba(255,255,255,.75)}',
      '.st-rrow button{flex:none;width:46px;height:46px;border:0;border-radius:50%;background:#fff;color:#000;display:grid;place-items:center;padding:0;cursor:pointer}.st-rrow button[hidden]{display:none}',
      '#stView.other .st-cap{bottom:calc(84px + env(safe-area-inset-bottom,0px))}',
      '.st-note{position:absolute;z-index:9;left:50%;top:calc(76px + env(safe-area-inset-top,0px));transform:translateX(-50%);padding:8px 16px;border-radius:999px;background:rgba(0,0,0,.72);font-size:.85rem;white-space:nowrap}.st-note[hidden]{display:none}',
      '#stBar .stb.cf:not(.seen) .ring{background:linear-gradient(135deg,#2ecc71,#17a35a)}',
      '.st-aud{display:flex;gap:8px;margin:8px 0 4px}.st-aud button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px}',
      '#stComp .st-aud button[aria-pressed="true"]{background:var(--accent);color:var(--accent-ink,#fff);border-color:var(--accent)}',
      '.st-foot{position:absolute;z-index:4;left:12px;right:12px;bottom:calc(16px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:10px}',
      '.st-foot[hidden]{display:none}.st-foot .sp{flex:1}',
      '.st-foot .st-b{width:44px;height:44px;background:rgba(0,0,0,.5);filter:none}',
      '#stView.mine .st-cap{bottom:calc(76px + env(safe-area-inset-bottom,0px))}',
      '.st-tap{position:absolute;z-index:2;top:80px;bottom:90px;border:0;background:none;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
      '.st-tap.l{left:0;width:35%}.st-tap.r{right:0;width:65%}',
      '.st-cap{position:absolute;z-index:3;left:16px;right:16px;bottom:calc(26px + env(safe-area-inset-bottom,0px));padding:10px 14px;border-radius:14px;background:rgba(0,0,0,.45);text-align:center;font-size:1.02rem;overflow-wrap:anywhere}',
      '.st-vid{max-width:100%;max-height:100%;object-fit:contain;display:block;background:#000}',
      '.st-song{display:block;margin-top:1px;font-size:.78rem;opacity:.95;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 4px rgba(0,0,0,.6)}',
      '.st-song[hidden]{display:none}',
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
      '.st-pt{position:relative;z-index:1;padding:16px;color:#fff;font-weight:800;font-size:1.3rem;text-align:center;overflow-wrap:anywhere;text-shadow:0 1px 8px rgba(0,0,0,.6)}',
      '.st-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:10px 0}',
      '.st-tile{position:relative;aspect-ratio:9/14;border:0;border-radius:10px;overflow:hidden;padding:0;cursor:pointer;color:#fff;-webkit-tap-highlight-color:transparent}',
      '.st-tile .st-tt{position:absolute;inset:0;display:grid;place-items:center;padding:6px;font-size:.78rem;font-weight:800;line-height:1.2;overflow:hidden;overflow-wrap:anywhere;text-shadow:0 1px 6px rgba(0,0,0,.5)}',
      '.st-tile .st-td{position:absolute;left:6px;bottom:5px;font-size:.7rem;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.8)}',
      '.st-tile .st-hb{position:absolute;left:6px;top:6px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))}',
      '.st-tile .st-ck{position:absolute;top:6px;right:6px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;background:rgba(0,0,0,.3);display:none;place-items:center;box-sizing:border-box}',
      '.st-sel .st-tile .st-ck{display:grid}.st-tile.on .st-ck{background:var(--accent);border-color:var(--accent);color:var(--accent-ink,#fff)}',
      '.st-tile.on::after{content:\"\";position:absolute;inset:0;background:rgba(0,0,0,.28);pointer-events:none}',
      '#stArc,#stAlb,#stMng{width:min(26rem,calc(100vw - 20px));max-height:calc(100dvh - 20px);overflow-y:auto}',
      '.st-act{position:sticky;bottom:-1px;display:flex;gap:8px;padding:10px 0 2px;background:var(--surface,#1c1c1f)}.st-act[hidden]{display:none}.st-act button{flex:1}',
      '.st-arow{display:flex;align-items:center;gap:12px;width:100%;padding:8px;margin:0 0 6px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink);font:inherit;font-size:.9rem;cursor:pointer;text-align:left}',
      '.st-arow b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.st-arow small{color:var(--muted);flex:none}',
      '.st-acv{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:var(--muted);font-size:1.4rem}',
      '.st-strip{display:flex;gap:8px;overflow-x:auto;padding:4px 0 8px;scrollbar-width:none}.st-strip .st-tile{flex:none;width:64px;aspect-ratio:1/1;border-radius:50%}.st-strip .st-tile.cv{outline:3px solid var(--accent);outline-offset:-3px}',
      '.st-card{margin:0 0 12px;padding:10px;border:1px solid var(--line);border-radius:14px}.st-card .pfrow{margin-top:8px}.st-card .ghost{padding:8px 10px;font-size:.82rem}',
      '.st-chead{display:flex;align-items:center;gap:12px}.st-chead b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ====== Visionneuse ====== */
  var view = null, V = { q: [], qi: 0, si: 0, timer: null, tok: 0, muted: false, paused: false, run: false, ms: 0, rem: 0, t0: 0, cur: null, mus: false, held: false };
  var A = new Audio(); A.preload = 'auto';
  function paintMute() { var b = $('stMute'); if (b) { b.innerHTML = ic(V.muted ? 'volumeOff' : 'volume', 24); b.setAttribute('aria-label', V.muted ? 'Activer le son' : 'Couper le son'); } }
  /* pause / reprise de la story en cours */
  function pauseV() {
    if (V.paused) return; V.paused = true;
    if (!V.run || !V.cur) return;
    clearTimeout(V.timer);
    V.rem = Math.max(0, V.ms - (Date.now() - V.t0));
    var w = V.cur.getBoundingClientRect().width; V.cur.style.transition = 'none'; V.cur.style.width = w + 'px';
    try { A.pause(); } catch (e) {}
    var v = $('stStage') && $('stStage').querySelector('video'); if (v) { try { v.pause(); } catch (e) {} }
  }
  function resumeV() {
    if (!V.paused) return; V.paused = false;
    if (!V.run || !V.cur) return;
    V.ms = V.rem; V.t0 = Date.now();
    V.cur.style.transition = 'width ' + V.rem + 'ms linear'; void V.cur.offsetWidth; V.cur.style.width = '100%';
    V.timer = setTimeout(next, V.rem);
    var v = $('stStage') && $('stStage').querySelector('video');
    if (v) playEl(v); else if (V.mus) playEl(A);
  }
  var PR = {};
  function presOf(uid) {
    if (!PR[uid]) PR[uid] = db().collection('presence').doc(uid).get().then(function (d) { return d.exists ? (d.data() || {}) : {}; }).catch(function () { return {}; });
    return PR[uid];
  }
  /* note de la personne (champs note / noteTs / noteTo de sa fiche presence), valable 24 h */
  var NC = {};
  function noteOf(uid) {
    var c = NC[uid]; if (c && Date.now() - c.t < 60000) return Promise.resolve(c.n);
    return db().collection('presence').doc(uid).get().then(function (d) {
      var v = d.exists ? (d.data() || {}) : {}, m = me(), n = null;
      if (m && typeof v.note === 'string' && v.note.trim() && typeof v.noteTs === 'number' && Date.now() - v.noteTs < TTL &&
          (uid === m.uid || !Array.isArray(v.noteTo) || v.noteTo.indexOf(m.uid) >= 0)) n = { text: v.note.trim().slice(0, 60), ts: v.noteTs };
      NC[uid] = { t: Date.now(), n: n }; return n;
    }).catch(function () { return null; });
  }
  function rxEmoji(k) { var x = RX.filter(function (y) { return y[0] === k; })[0]; return x ? x[1] : ''; }
  function openViewers() {
    var u = V.q[V.qi], s = u && u.list[V.si], box = $('stVw'); if (!s || !box || u.uid !== me().uid) return;
    pauseV();
    var body = $('stVwBody');
    function draw() {
      var rx = s.reactions && typeof s.reactions === 'object' ? s.reactions : {};
      var ids = (Array.isArray(s.viewers) ? s.viewers : []).slice();
      Object.keys(rx).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
      ids = ids.filter(function (x) { return x !== me().uid; }).reverse();
      body.textContent = '';
      $('stVwT').textContent = ids.length ? ids.length + (ids.length > 1 ? ' vues' : ' vue') : 'Aucune vue';
      if (!ids.length) body.appendChild(mk('p', 'st-vempty', 'Personne n’a encore vu cette story.'));
      ids.forEach(function (id) {
        var row = mk('div', 'st-vrow'), av = mk('span', 'st-av'), nm = mk('b', '', '…');
        row.appendChild(av); row.appendChild(nm);
        var em = rxEmoji(rx[id]); if (em) row.appendChild(mk('span', 'st-rxb', em));
        body.appendChild(row);
        av.style.background = 'hsl(' + hue(id) + ' 38% 42%)';
        presOf(id).then(function (p) {
          var name = p.nick || p.name || id.slice(0, 6);
          nm.textContent = cap(name); av.textContent = cap(name).charAt(0); av.style.background = 'hsl(' + hue(name) + ' 38% 42%)';
          var ph = typeof p.photo === 'string' && /^(https?:|data:image\/)/.test(p.photo) ? p.photo : '';
          if (ph) { av.style.background = 'center / cover no-repeat url("' + ph.replace(/"/g, '%22') + '")'; av.textContent = ''; }
        });
      });
    }
    draw(); box.hidden = false;
    /* données fraîches : nouvelles vues et nouvelles réactions depuis l'ouverture de la story */
    db().collection('stories').doc(s.id).get().then(function (d) {
      if (!d.exists) return; var v = d.data() || {};
      if (Array.isArray(v.viewers)) s.viewers = v.viewers;
      s.reactions = v.reactions && typeof v.reactions === 'object' ? v.reactions : {};
      if (!box.hidden) draw();
      setIc($('stEye'), 'eye', String((s.viewers || []).filter(function (x) { return x !== me().uid; }).length), 18);
    }).catch(function () {});
  }
  function closeViewers() { var box = $('stVw'); if (box && !box.hidden) { box.hidden = true; resumeV(); } }
  function holdBind(btn, fn) {
    var t = null;
    btn.addEventListener('pointerdown', function () { V.held = false; clearTimeout(t); t = setTimeout(function () { V.held = true; pauseV(); }, 220); });
    function end() { clearTimeout(t); if (V.held) { resumeV(); setTimeout(function () { V.held = false; }, 400); } }
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end); btn.addEventListener('pointerleave', end);
    btn.addEventListener('click', function () { if (V.held) { V.held = false; return; } var ri = $('stRIn'); if (ri && document.activeElement === ri) { ri.blur(); return; } fn(); });
  }
  function swipeBind() {
    var sx = 0, sy = 0, dy = 0, drag = false, on = false;
    view.addEventListener('touchstart', function (e) {
      on = !(e.target.closest && e.target.closest('#stVw, #stMenuW, .st-reply')); if (!on) return;
      var t = e.touches[0]; sx = t.clientX; sy = t.clientY; dy = 0; drag = false; view.style.transition = 'none';
    }, { passive: true });
    view.addEventListener('touchmove', function (e) {
      if (!on) return;
      var t = e.touches[0], mx = t.clientX - sx; dy = t.clientY - sy;
      if (!drag && dy > 14 && dy > Math.abs(mx) * 1.3) { drag = true; pauseV(); }
      if (drag) { var k = Math.max(0, dy); view.style.transform = 'translateY(' + k + 'px) scale(' + (1 - Math.min(k, 400) / 2400) + ')'; view.style.opacity = String(1 - Math.min(k, 400) / 700); }
    }, { passive: true });
    function endSw() {
      if (!on || !drag) { on = false; return; }
      on = false; drag = false;
      if (dy > 110) { view.close(); return; }
      view.style.transition = 'transform .2s ease, opacity .2s ease'; view.style.transform = ''; view.style.opacity = '';
      resumeV();
    }
    view.addEventListener('touchend', endSw, { passive: true }); view.addEventListener('touchcancel', endSw, { passive: true });
  }
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
  var RX = [['heart', '❤️', 'Cœur'], ['flame', '🔥', 'Feu'], ['laugh', '😂', 'Rire'], ['surprise', '😮', 'Surpris'], ['sad', '😢', 'Triste'], ['thumb', '👍', 'Pouce']];
  var noteT = null;
  function note(t) { var n = $('stNote'); if (!n) return; n.textContent = t; n.hidden = false; clearTimeout(noteT); noteT = setTimeout(function () { n.hidden = true; }, 2000); }
  function curStory() { var u = V.q[V.qi]; return u ? { u: u, s: u.list[V.si] } : null; }
  function closeMenu() { var w = $('stMenuW'); if (w && !w.hidden) { w.hidden = true; resumeV(); } }
  function openMenu() {
    var c = curStory(); if (!c || !c.s) return;
    var mineS = c.u.uid === me().uid, m = $('stMenu'); m.textContent = '';
    function item(icon, label, fn, dg) {
      var b = mk('button', dg ? 'dg' : ''); b.type = 'button'; b.innerHTML = ic(icon, 20); b.appendChild(document.createTextNode(label));
      b.addEventListener('click', function () { closeMenu(); fn(); }); m.appendChild(b);
    }
    if (mineS) {
      item('bookmark', c.s.hl ? 'Retirer de la une' : 'Ajouter à la une', toggleHl);
      item('trash', 'Supprimer la story', delCurrent, true);
    } else item('flag', 'Signaler la story', reportCurrent, true);
    pauseV(); $('stMenuW').hidden = false;
  }
  function toggleHl() {
    var c = curStory(); if (!c || !c.s) return; var sv = c.s;
    if (sv.hl) {
      unalbum([sv]).then(function () { note('Retirée de la une'); }).catch(function () { note('Action impossible pour le moment'); });
    } else { view.close(); addToAlbum([sv]); }
  }
  function reportCurrent() {
    var c = curStory(); if (!c || !c.s || !confirm('Signaler cette story ?')) return;
    var p = {}; p['reports.' + me().uid] = true;
    db().collection('stories').doc(c.s.id).update(p).catch(function () {});
    repAdd(c.s.id); clearTimeout(V.timer);
    c.u.list.splice(V.si, 1); delete cache[c.u.uid];
    if (!c.u.list.length || V.si >= c.u.list.length) nextUser(); else show();
    note('Merci, story signalée');
  }
  function sendReply(text) {
    var c = curStory(); if (!c || !c.s || !window.UIChat || !text) return;
    var q = { id: String(c.s.id), uid: c.u.uid, t: ('Story' + (c.s.cap ? ' · ' + c.s.cap : '')).slice(0, 90) };
    return window.UIChat.sendTo(c.u.uid, c.u.name, text, q).then(function () { note('Envoyé'); return true; })
      .catch(function (e) { note(e && e.inv ? e.inv : 'Message non envoyé'); return false; });
  }
  /* réaction rapide : enregistrée sur la story, visible uniquement dans la liste des vues de l’auteur */
  function paintRx() {
    var c = curStory(), mine = c && c.s && c.s.reactions && me() ? c.s.reactions[me().uid] : '';
    Array.prototype.forEach.call($('stRx').children, function (b) { b.setAttribute('aria-pressed', b.dataset.r === mine ? 'true' : 'false'); });
  }
  function sendReaction(key) {
    var c = curStory(); if (!c || !c.s || !me()) return Promise.resolve(false);
    var uid = me().uid, s = c.s, cur = s.reactions && s.reactions[uid], on = cur !== key, p = {};
    p['reactions.' + uid] = on ? key : firebase.firestore.FieldValue.delete();
    return db().collection('stories').doc(s.id).update(p).then(function () {
      if (!s.reactions || typeof s.reactions !== 'object') s.reactions = {};
      if (on) s.reactions[uid] = key; else delete s.reactions[uid];
      paintRx(); note(on ? 'Réaction envoyée' : 'Réaction retirée');
      if (on) { var f = mk('span', 'st-fly', rxEmoji(key)); view.appendChild(f); setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1100); }
      return true;
    }).catch(function () { note('Réaction impossible pour le moment'); return false; });
  }
  function bindReply() {
    var inp = $('stRIn'), go = $('stRSend'), rx = $('stRx'), blurT = null;
    function done() { inp.value = ''; go.hidden = true; inp.blur(); }
    inp.addEventListener('focus', function () { clearTimeout(blurT); rx.hidden = false; pauseV(); });
    inp.addEventListener('blur', function () { blurT = setTimeout(function () { rx.hidden = true; if ($('stMenuW').hidden && $('stVw').hidden) resumeV(); }, 120); });
    inp.addEventListener('input', function () { go.hidden = !inp.value.trim(); });
    function submit() { var t = inp.value.trim(); if (!t) return; go.disabled = true; sendReply(t).then(function (ok) { go.disabled = false; if (ok) done(); }); }
    go.addEventListener('click', submit);
    go.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    rx.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    rx.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button[data-r]'); if (!b) return;
      var x = RX.filter(function (y) { return y[0] === b.dataset.r; })[0]; if (!x) return;
      sendReaction(x[0]).then(function (ok) { if (ok) done(); });
    });
  }
  function ensureView() {
    if (view) return;
    css();
    view = document.createElement('dialog'); view.id = 'stView';
    view.innerHTML = '<div class="st-stage" id="stStage"></div><div class="st-bars" id="stBars"></div>' +
      '<div class="st-head"><span class="st-av" id="stAv"></span><div class="st-who"><div class="st-l1"><b id="stName"></b><small id="stTime"></small><span class="st-cf" id="stCf" hidden title="Amis proches">' + ic('star', 15) + '</span></div><div class="st-song" id="stSong" hidden></div></div>' +
      '<button type="button" class="st-b" id="stMute" hidden aria-label="Son"></button>' +
      '<button type="button" class="st-b" id="stMore" aria-label="Plus d’options">' + ic('more', 24) + '</button>' +
      '<button type="button" class="st-b" id="stX" aria-label="Fermer">' + ic('x', 24) + '</button></div>' +
      '<div class="st-nb" id="stNb" hidden><small id="stNbL"></small><span id="stNbT"></span></div>' +
      '<button type="button" class="st-tap l" id="stBack" aria-label="Précédent"></button>' +
      '<button type="button" class="st-tap r" id="stFwd" aria-label="Suivant"></button>' +
      '<div class="st-foot" id="stFoot" hidden><button type="button" class="st-eye" id="stEye" aria-label="Voir qui a vu ta story"></button><span class="sp"></span>' +
      '<button type="button" class="st-b" id="stAdd" aria-label="Ajouter une story">' + ic('plus', 22) + '</button></div>' +
      '<div class="st-reply" id="stReply" hidden><div class="st-rx" id="stRx" hidden>' + RX.map(function (x, i) { return '<button type="button" data-r="' + x[0] + '" aria-label="' + x[2] + '" style="--i:' + i + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<div class="st-rrow"><input type="text" id="stRIn" maxlength="500" placeholder="Envoyer un message" autocomplete="off" enterkeyhint="send" aria-label="Répondre à la story"><button type="button" id="stRSend" hidden aria-label="Envoyer">' + ic('send', 22) + '</button></div></div>' +
      '<div id="stMenuW" hidden><div id="stMenu"></div></div><div class="st-note" id="stNote" hidden></div>' +
      '<div class="st-cap" id="stCap" hidden></div>' +
      '<div id="stVw" hidden><div><span class="st-grab"></span><h3 id="stVwT"></h3><div id="stVwBody"></div></div></div>';
    document.body.appendChild(view);
    $('stX').addEventListener('click', function () { view.close(); });
    holdBind($('stBack'), prev); holdBind($('stFwd'), next);
    $('stEye').addEventListener('click', openViewers);
    $('stVw').addEventListener('click', function (e) { if (e.target === $('stVw')) closeViewers(); });
    swipeBind();
    $('stAdd').addEventListener('click', function () { view.close(); compose(); });
    $('stMore').addEventListener('click', openMenu);
    $('stMenuW').addEventListener('click', function (e) { if (e.target === $('stMenuW')) closeMenu(); });
    bindReply();
    $('stMute').addEventListener('click', function () {
      V.muted = !V.muted; A.muted = V.muted;
      var v = $('stStage').querySelector('video'); if (v) v.muted = V.muted;
      paintMute();
    });
    view.addEventListener('close', function () { clearTimeout(V.timer); V.tok++; V.paused = false; V.run = false; V.held = false; var vw = $('stVw'); if (vw) vw.hidden = true; var mw = $('stMenuW'); if (mw) mw.hidden = true; var rxe = $('stRx'); if (rxe) rxe.hidden = true; var rin = $('stRIn'); if (rin) { rin.value = ''; rin.blur(); } var rsd = $('stRSend'); if (rsd) rsd.hidden = true; view.style.transition = ''; view.style.transform = ''; view.style.opacity = ''; stopMedia(); renderBar(); });
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
    $('stName').textContent = cap(u.name) + (u.title ? ' · ' + u.title : ''); $('stTime').textContent = ago(s.ts);
    $('stFoot').hidden = !mineS; view.classList.toggle('mine', mineS); view.classList.toggle('other', !mineS);
    $('stReply').hidden = mineS || !window.UIChat; $('stCf').hidden = !Array.isArray(s.to); paintRx(); closeMenu();
    setIc($('stEye'), 'eye', String(Array.isArray(s.viewers) ? s.viewers.filter(function (v) { return v !== me().uid; }).length : 0), 18);

    var st = $('stStage'), capEl = $('stCap'), cur = bars.children[V.si].firstChild;
    V.cur = cur; V.run = false; V.ms = 0; V.rem = 0; V.paused = false; V.mus = false; closeViewers();
    st.textContent = ''; st.style.background = '';
    var hasMusic = !!(s.mUrl && cldOk(s.mUrl)), hasVid = !!(s.vid && cldOk(s.vid)), ran = false;
    function run(ms) {
      if (tok !== V.tok || ran) return; ran = true; ms = ms || DUR;
      V.run = true; V.ms = ms; V.t0 = Date.now();
      if (V.paused) { V.rem = ms; cur.style.transition = 'none'; cur.style.width = '0'; return; }
      cur.style.transition = 'none'; cur.style.width = '0'; void cur.offsetWidth;
      cur.style.transition = 'width ' + ms + 'ms linear'; cur.style.width = '100%';
      V.timer = setTimeout(next, ms);
    }
    V.mus = hasMusic; $('stSong').hidden = !hasMusic; if (hasMusic) setIc($('stSong'), 'music', s.mT || 'Musique', 13);
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
    var nb = $('stNb'); nb.hidden = true;
    noteOf(u.uid).then(function (n) {
      if (tok !== V.tok || !n) return;
      setIc($('stNbL'), 'pencil', 'Note · ' + ago(n.ts), 11); $('stNbT').textContent = n.text; nb.hidden = false;
    });
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
  var comp = null, C = { file: null, blob: '', kind: '', vD: 0, vS: 0, bg: 0, busy: false, mus: null, aud: 'all' };
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
    if (C.mus) setIc($('stChipT'), 'music', C.mus.title + ' · ' + fmt(C.mus.s) + ' → ' + fmt(C.mus.s + Math.min(CLIP, C.mus.D || CLIP)), 14);
    $('stTxtN').textContent = $('stText').value.length + ' / ' + CAP_MAX;
  }
  function ensureComp() {
    if (comp) return;
    css();
    comp = document.createElement('dialog'); comp.id = 'stComp'; comp.className = 'sheet';
    comp.innerHTML = '<h2>Nouvelle story</h2>' +
      '<div class="st-preview" id="stPreview"><div class="st-pt" id="stPrevTxt"></div></div>' +
      '<div class="pfrow"><button class="ghost" id="stPick" type="button">' + ic('camera') + 'Photo</button><button class="ghost" id="stVid" type="button">' + ic('video') + 'Vidéo</button><button class="ghost" id="stBg" type="button">' + ic('palette') + 'Fond</button><button class="ghost" id="stNoPh" type="button" hidden>Retirer</button></div>' +
      '<input type="file" id="stPhFile" accept="image/*" hidden><input type="file" id="stVFile" accept="video/*" hidden>' +
      '<div class="st-rng" id="stVR" hidden><label for="stVRi">Début (30 s)</label><input type="range" id="stVRi" min="0" max="0" step="1" value="0"><span id="stVRv">0:00</span></div>' +
      '<div class="pfrow"><button class="ghost" id="stMusBtn" type="button">' + ic('music') + 'Musique (30 s)</button></div>' +
      '<div class="st-aud" id="stAud"><button type="button" class="ghost" data-a="all" aria-pressed="true">' + ic('users') + 'Amis</button><button type="button" class="ghost" data-a="close" aria-pressed="false">' + ic('star') + 'Amis proches</button></div><p class="st-ps" id="stAudH"></p>' +
      '<div class="st-mchip" id="stChip" hidden><span id="stChipT"></span><button type="button" id="stChipE" aria-label="Changer le passage">' + ic('pencil', 14) + '</button><button type="button" id="stChipX" aria-label="Retirer la musique">' + ic('x', 14) + '</button></div>' +
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
    $('stAud').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-a]'); if (!b) return; C.aud = b.dataset.a; paintAud(); });
    $('stBg').addEventListener('click', function () { C.bg = (C.bg + 1) % BGS.length; paintComp(); });
    $('stText').addEventListener('input', paintComp);
    $('stMusBtn').addEventListener('click', function () { if (!C.busy) openMusic(function (m) { C.mus = m; paintComp(); }); });
    $('stChipE').addEventListener('click', function () { if (!C.busy) openMusic(function (m) { C.mus = m; paintComp(); }); });
    $('stChipX').addEventListener('click', function () { C.mus = null; paintComp(); });
    $('stCancel').addEventListener('click', function () { if (!C.busy) comp.close(); });
    $('stGo').addEventListener('click', publish);
    comp.addEventListener('close', function () { clearMedia(); C.mus = null; var v = $('stPreview').querySelector('video'); if (v) { try { v.pause(); } catch (e) {} } });
  }
  function paintAud() {
    var a = $('stAud'); if (!a) return;
    Array.prototype.forEach.call(a.children, function (b) { b.setAttribute('aria-pressed', b.dataset.a === C.aud ? 'true' : 'false'); });
    var n = closeIds().length;
    $('stAudH').textContent = C.aud === 'close' ? (n ? n + (n > 1 ? ' amis proches verront' : ' ami proche verra') + ' cette story.' : 'Ta liste d’amis proches est vide : ajoute-en depuis la fiche d’un ami.') : '';
  }
  function compose() {
    if (!me()) return;
    ensureComp();
    clearMedia(); C.mus = null; C.bg = Math.floor(Math.random() * BGS.length); C.busy = false;
    $('stText').value = ''; cErr(''); $('stGo').disabled = false; $('stGo').textContent = 'Publier';
    C.aud = 'all'; paintAud(); paintComp();
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
      if (C.aud === 'close') { var ids = closeIds().filter(function (x) { return x !== u.uid; }); if (!ids.length) { cErr('Ta liste d’amis proches est vide.'); C.busy = false; $('stGo').disabled = false; $('stGo').textContent = 'Publier'; return; } data.to = ids; }
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
  function stopPrev() { clearInterval(MS.iv); if (MS.pa) { try { MS.pa.pause(); } catch (e) {} } $('stMusPlay') && setIc($('stMusPlay'), 'play', 'Écouter le passage'); }
  function musPane(n) { $('stMusList').hidden = n !== 1; $('stMusCut').hidden = n !== 2; }
  function ensureMus() {
    if (mus) return;
    css();
    mus = document.createElement('dialog'); mus.id = 'stMus'; mus.className = 'sheet';
    mus.innerHTML = '<h2>Musique de la story</h2>' +
      '<div id="stMusList"></div>' +
      '<div id="stMusCut" hidden><p class="trinfo" id="stMusT"></p><p class="hint" id="stMusI"></p>' +
        '<div class="st-rng" id="stMusRw"><label for="stMusR">Début</label><input type="range" id="stMusR" min="0" max="0" step="1" value="0" disabled><span id="stMusV">0:00</span></div>' +
        '<button class="ghost" id="stMusPlay" type="button" disabled>' + ic('play') + 'Écouter le passage</button>' +
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
    setIc($('stMusPlay'), 'pause', 'Arrêter');
    var end = MS.s + Math.min(CLIP, MS.D || CLIP);
    MS.iv = setInterval(function () { if (a.paused || a.currentTime >= end) stopPrev(); }, 100);
  }
  function pickTrack(t) {
    MS.sel = t; MS.s = 0; MS.D = 0;
    setIc($('stMusT'), 'music', t.title); $('stMusI').textContent = 'Chargement…';
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
    var imp = mk('button', 'ghost'); setIc(imp, 'phone', 'Importer depuis mon téléphone', 16); imp.type = 'button';
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


  /* ====== Archive + albums « À la une » ======
     Une story de plus de 24 h reste dans l'archive (visible par toi seul).
     Quand tu l'ajoutes à la une, elle reçoit : hl:true, alb (id de l'album), albT (titre), albTs (date de création), albC (true = couverture). */
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dayLbl(ts) { var d = new Date(ts); return d.getDate() + ' ' + MOIS[d.getMonth()]; }
  function byTs(a, b) { return a.ts - b.ts; }
  function stCol() { return db().collection('stories'); }
  function bumpAll() { var u = me(); if (u) delete cache[u.uid]; document.dispatchEvent(new CustomEvent('ui-profile-saved')); }

  function albums(uid) {
    return fetchHl(uid).then(function (l) {
      var map = {}, out = [];
      l.forEach(function (sv) {
        var id = typeof sv.alb === 'string' && sv.alb ? sv.alb : 'old', a = map[id];
        if (!a) { a = map[id] = { id: id, title: String(sv.albT || 'À la une').slice(0, 24), ts: +sv.albTs || sv.ts, list: [], cover: null }; out.push(a); }
        a.list.push(sv); if (sv.albC) a.cover = sv;
      });
      out.forEach(function (a) { a.list.sort(byTs); if (!a.cover) a.cover = a.list[0]; });
      out.sort(function (x, y) { return y.ts - x.ts; });
      return out;
    });
  }
  function fetchArchive() {
    var u = me(); if (!u) return Promise.resolve([]);
    return stCol().where('uid', '==', u.uid).get().then(function (sn) {
      var out = []; sn.forEach(function (d) { var v = d.data() || {}; if (typeof v.ts !== 'number') return; v.id = d.id; out.push(v); });
      out.sort(function (a, b) { return b.ts - a.ts; }); return out;
    });
  }
  function unalbum(list) {
    var D = firebase.firestore.FieldValue.delete(), b = db().batch();
    list.forEach(function (sv) { b.update(stCol().doc(sv.id), { hl: false, alb: D, albT: D, albTs: D, albC: D }); });
    return b.commit().then(function () {
      list.forEach(function (sv) { sv.hl = false; delete sv.alb; delete sv.albT; delete sv.albTs; delete sv.albC; });
      bumpAll();
    });
  }
  function tile(sv) {
    var b = mk('button', 'st-tile'); b.type = 'button'; b.style.background = thumbCss(sv);
    if (!sv.url && !sv.vid && sv.cap) b.appendChild(mk('span', 'st-tt', sv.cap));
    if (sv.hl) { var h = mk('span', 'st-hb'); h.innerHTML = ic('bookmark', 16); b.appendChild(h); }
    var ck = mk('span', 'st-ck'); ck.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.500 4.500L19 7.500"/></svg>'; b.appendChild(ck);
    b.appendChild(mk('small', 'st-td', dayLbl(sv.ts)));
    return b;
  }

  /* — Ajouter à une une : choisir un album existant ou en créer un — */
  var alb = null, AL = { st: [], cover: '', cb: null };
  function albErr(t) { var e = $('stAlbErr'); e.textContent = t || ''; e.hidden = !t; }
  function albPane(n) { $('stAlbP1').hidden = n !== 1; $('stAlbP2').hidden = n !== 2; albErr(''); }
  function ensureAlb() {
    if (alb) return; css();
    alb = mk('dialog'); alb.id = 'stAlb'; alb.className = 'sheet';
    alb.innerHTML = '<h2>Ajouter à la une</h2>' +
      '<div id="stAlbP1"><p class="hint" id="stAlbN"></p><div id="stAlbList"></div><button class="ghost" id="stAlbNew" type="button">+ Nouvel album</button></div>' +
      '<div id="stAlbP2" hidden><input class="field" id="stAlbName" type="text" maxlength="24" placeholder="Nom de l’album" autocomplete="off"><p class="hint" style="margin:10px 0 2px">Couverture</p><div class="st-strip" id="stAlbCov"></div></div>' +
      '<p class="err" id="stAlbErr" hidden></p>' +
      '<div class="pfrow" style="margin-top:10px"><button class="ghost" id="stAlbOk" type="button" hidden>Créer</button><button class="ghost" id="stAlbBack" type="button" hidden>Retour</button><button class="ghost" id="stAlbX" type="button">Annuler</button></div>';
    document.body.appendChild(alb);
    $('stAlbX').addEventListener('click', function () { alb.close(); });
    $('stAlbNew').addEventListener('click', function () { albPane(2); $('stAlbOk').hidden = false; $('stAlbBack').hidden = false; $('stAlbX').hidden = true; $('stAlbName').focus(); });
    $('stAlbBack').addEventListener('click', function () { albPane(1); $('stAlbOk').hidden = true; $('stAlbBack').hidden = true; $('stAlbX').hidden = false; });
    $('stAlbOk').addEventListener('click', function () {
      var t = $('stAlbName').value.trim().slice(0, 24);
      if (!t) { albErr('Donne un nom à ton album.'); return; }
      saveAlb('a' + Date.now().toString(36), t, Date.now(), AL.cover);
    });
  }
  function saveAlb(id, title, ts, coverId) {
    var b = db().batch(), done = AL.cb;
    AL.st.forEach(function (sv) { b.update(stCol().doc(sv.id), { hl: true, alb: id, albT: title, albTs: ts, albC: !!coverId && sv.id === coverId }); });
    $('stAlbOk').disabled = true;
    b.commit().then(function () {
      AL.st.forEach(function (sv) { sv.hl = true; sv.alb = id; sv.albT = title; sv.albTs = ts; sv.albC = !!coverId && sv.id === coverId; });
      $('stAlbOk').disabled = false; alb.close(); bumpAll(); if (done) done();
    }).catch(function () { $('stAlbOk').disabled = false; albErr('Impossible pour le moment. Vérifie les règles Firestore « stories ».'); });
  }
  function addToAlbum(stories, done) {
    if (!me() || !stories || !stories.length) return;
    ensureAlb(); AL.st = stories.slice().sort(byTs); AL.cb = done || null; AL.cover = AL.st[0].id;
    $('stAlbName').value = ''; $('stAlbOk').hidden = true; $('stAlbBack').hidden = true; $('stAlbX').hidden = false; albPane(1);
    $('stAlbN').textContent = AL.st.length + (AL.st.length > 1 ? ' stories à ajouter.' : ' story à ajouter.');
    var cov = $('stAlbCov'); cov.textContent = '';
    AL.st.forEach(function (sv) {
      var t = tile(sv); t.classList.toggle('cv', sv.id === AL.cover);
      t.addEventListener('click', function () { AL.cover = sv.id; Array.prototype.forEach.call(cov.children, function (x) { x.classList.remove('cv'); }); t.classList.add('cv'); });
      cov.appendChild(t);
    });
    var box = $('stAlbList'); box.textContent = ''; box.appendChild(mk('p', 'hint', 'Chargement…'));
    alb.showModal();
    albums(me().uid).then(function (al) {
      box.textContent = '';
      al.forEach(function (a) {
        var r = mk('button', 'st-arow'); r.type = 'button';
        var cv = mk('span', 'st-acv'); cv.style.background = thumbCss(a.cover); r.appendChild(cv);
        r.appendChild(mk('b', '', a.title)); r.appendChild(mk('small', '', String(a.list.length)));
        r.addEventListener('click', function () { saveAlb(a.id, a.title, a.ts, ''); });
        box.appendChild(r);
      });
    });
  }

  /* — Archive — */
  var arc = null, AR = { list: [], sel: {}, mode: false };
  function arcCount() { return Object.keys(AR.sel).length; }
  function paintArc() {
    var g = $('stArcGrid'); g.textContent = '';
    arc.classList.toggle('st-sel', AR.mode);
    $('stArcSel').textContent = AR.mode ? 'Terminer' : 'Sélectionner';
    if (!AR.list.length) g.appendChild(mk('p', 'hint', 'Aucune story pour l’instant.'));
    AR.list.forEach(function (sv) {
      var t = tile(sv); if (AR.sel[sv.id]) t.classList.add('on');
      t.addEventListener('click', function () {
        if (AR.mode) { if (AR.sel[sv.id]) delete AR.sel[sv.id]; else AR.sel[sv.id] = sv; t.classList.toggle('on', !!AR.sel[sv.id]); paintAct(); return; }
        openQueue([{ uid: me().uid, name: uname(), list: [sv] }], 0);
      });
      g.appendChild(t);
    });
    paintAct();
  }
  function paintAct() {
    var n = arcCount(); $('stArcAct').hidden = !AR.mode || !n;
    $('stArcAdd').textContent = 'Ajouter à la une (' + n + ')'; $('stArcDel').textContent = 'Supprimer (' + n + ')';
  }
  function loadArc() {
    fetchArchive().then(function (l) {
      AR.list = l; var keep = {}; l.forEach(function (sv) { if (AR.sel[sv.id]) keep[sv.id] = sv; }); AR.sel = keep;
      paintArc();
    }).catch(function () { $('stArcGrid').textContent = ''; $('stArcGrid').appendChild(mk('p', 'hint', 'Archive indisponible pour le moment.')); });
  }
  function ensureArc() {
    if (arc) return; css();
    arc = mk('dialog'); arc.id = 'stArc'; arc.className = 'sheet';
    arc.innerHTML = '<h2>Archive</h2><p class="hint">Tes stories de plus de 24 h restent ici. Toi seul les vois, sauf celles que tu ajoutes à la une.</p>' +
      '<div class="pfrow"><button class="ghost" id="stArcSel" type="button">Sélectionner</button><button class="ghost" id="stArcX" type="button">Fermer</button></div>' +
      '<div class="st-grid" id="stArcGrid"></div>' +
      '<div class="st-act" id="stArcAct" hidden><button class="ghost" id="stArcAdd" type="button"></button><button class="ghost" id="stArcDel" type="button"></button></div>';
    document.body.appendChild(arc);
    $('stArcX').addEventListener('click', function () { arc.close(); });
    $('stArcSel').addEventListener('click', function () { AR.mode = !AR.mode; if (!AR.mode) AR.sel = {}; paintArc(); });
    $('stArcAdd').addEventListener('click', function () {
      var l = Object.keys(AR.sel).map(function (k) { return AR.sel[k]; });
      addToAlbum(l, function () { AR.sel = {}; AR.mode = false; loadArc(); });
    });
    $('stArcDel').addEventListener('click', function () {
      var l = Object.keys(AR.sel).map(function (k) { return AR.sel[k]; });
      if (!l.length || !confirm('Supprimer définitivement ' + l.length + (l.length > 1 ? ' stories' : ' story') + ' ?')) return;
      var b = db().batch(); l.forEach(function (sv) { b.delete(stCol().doc(sv.id)); });
      b.commit().then(function () { AR.sel = {}; bumpAll(); loadArc(); }).catch(function () { alert('Suppression impossible pour le moment.'); });
    });
    document.addEventListener('ui-profile-saved', function () { if (arc && arc.open) loadArc(); });
  }
  function archive() {
    if (!me()) return; ensureArc(); AR.mode = false; AR.sel = {}; AR.list = []; paintArc(); loadArc();
    if (!arc.open) arc.showModal();
  }

  /* — Modifier les albums (renommer, couverture, supprimer) — */
  var mng = null;
  function batchAlb(a, fn) {
    var b = db().batch(); a.list.forEach(function (sv) { b.update(stCol().doc(sv.id), fn(sv)); });
    return b.commit().then(bumpAll).then(drawMng);
  }
  function drawMng() {
    var box = $('stMngList'); box.textContent = ''; box.appendChild(mk('p', 'hint', 'Chargement…'));
    albums(me().uid).then(function (al) {
      box.textContent = '';
      if (!al.length) box.appendChild(mk('p', 'hint', 'Aucun album pour l’instant. Ajoute des stories depuis l’archive.'));
      al.forEach(function (a) {
        var card = mk('div', 'st-card'), head = mk('div', 'st-chead'), cv = mk('span', 'st-acv');
        cv.style.background = thumbCss(a.cover); head.appendChild(cv); head.appendChild(mk('b', '', a.title)); head.appendChild(mk('small', '', String(a.list.length)));
        card.appendChild(head);
        var strip = mk('div', 'st-strip'); strip.hidden = true;
        a.list.forEach(function (sv) {
          var t = tile(sv); if (a.cover && a.cover.id === sv.id) t.classList.add('cv');
          t.addEventListener('click', function () { batchAlb(a, function (x) { return { albC: x.id === sv.id }; }); });
          strip.appendChild(t);
        });
        var row = mk('div', 'pfrow');
        var bR = mk('button', 'ghost', 'Renommer'), bC = mk('button', 'ghost', 'Couverture'), bD = mk('button', 'ghost', 'Supprimer');
        bR.type = bC.type = bD.type = 'button';
        bR.addEventListener('click', function () {
          var t = prompt('Nom de l’album', a.title); if (t === null) return; t = t.trim().slice(0, 24); if (!t) return;
          var id = a.id === 'old' ? 'a' + Date.now().toString(36) : a.id;
          batchAlb(a, function () { return { albT: t, alb: id, albTs: a.ts }; }).catch(function () { alert('Impossible pour le moment.'); });
        });
        bC.addEventListener('click', function () { strip.hidden = !strip.hidden; });
        bD.addEventListener('click', function () {
          if (!confirm('Retirer l’album « ' + a.title + ' » de ta une ? Les stories restent dans ton archive.')) return;
          unalbum(a.list).then(drawMng).catch(function () { alert('Impossible pour le moment.'); });
        });
        row.appendChild(bR); row.appendChild(bC); row.appendChild(bD); card.appendChild(row); card.appendChild(strip);
        box.appendChild(card);
      });
    }).catch(function () { box.textContent = ''; box.appendChild(mk('p', 'hint', 'Albums indisponibles pour le moment.')); });
  }
  function manage() {
    if (!me()) return;
    if (!mng) {
      css(); mng = mk('dialog'); mng.id = 'stMng'; mng.className = 'sheet';
      mng.innerHTML = '<h2>À la une</h2><div id="stMngList"></div><div class="pfrow" style="margin-top:10px"><button class="ghost" id="stMngArc" type="button">Ouvrir l’archive</button><button class="ghost" id="stMngX" type="button">Fermer</button></div>';
      document.body.appendChild(mng);
      $('stMngX').addEventListener('click', function () { mng.close(); });
      $('stMngArc').addEventListener('click', function () { mng.close(); archive(); });
    }
    drawMng(); mng.showModal();
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
    var b = mk('button', 'stb' + (list.length ? ((isMine || isNew(uid, list)) ? '' : ' seen') : ' none') + (list.some(function (x) { return Array.isArray(x.to); }) ? ' cf' : '')); b.type = 'button';
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
    hl: fetchHl,
    albums: albums,
    archive: archive,
    manage: manage,
    thumb: thumbCss,
    openList: function (uid, name, list, idx, title) { if (list && list.length) openQueue([{ uid: uid, name: name || '', list: list, title: title || '' }], idx || 0); },
    open: function (uid, name) {
      fetchUser(uid, true).then(function (list) {
        if (!list.length) { if (me() && uid === me().uid) compose(); return; }
        openQueue([{ uid: uid, name: name || '', list: list }], 0);
      });
    }
  };
})();
