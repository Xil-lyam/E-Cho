/* U&I — js/profil.js
   Page de profil (À propos / Amis / Photos), badges de réussite et couverture animée.
   - Ouvre le profil depuis la fiche d’une personne (« Voir le profil ») et depuis la carte de profil des Réglages.
   - Calcule tes badges et les publie sur ton profil (champ « awards » de ta fiche presence).
   À charger APRÈS script.js (avec « defer »), puis js/profil-edition.js. */
(function () {
  'use strict';
  if (window.UIProfile) return;

  /* ====== Réglages faciles à changer ====== */
  var CLOUD = 'hjnf54dr', BASE = 'https://res.cloudinary.com/' + CLOUD + '/';
  var LOOP = 8;                          /* durée (s) de la boucle de la couverture vidéo */
  var PIONEER_BEFORE = '2026-12-01';     /* comptes créés avant cette date = badge Pionnier */
  var EVENTS = { citrouille: [1024, 1102], flocon: [1201, 106] };   /* MMJJ début, MMJJ fin (inclus) */
  var THRESH = { streak: 3, photo: 5, vocal: 5, live: 3, letters: 3, likes: 10 };

  var COVERS = {
    rose: 'linear-gradient(135deg,#8a2f55,#c2305f)', ocean: 'linear-gradient(135deg,#0b3d63,#0b7fc0)',
    foret: 'linear-gradient(135deg,#0f4a38,#3f9a70)', violet: 'linear-gradient(135deg,#3b2a85,#7c5ce0)',
    ambre: 'linear-gradient(135deg,#7a3a06,#d97706)', nuit: 'linear-gradient(135deg,#0a0c10,#1d2a4a)',
    grenat: 'linear-gradient(135deg,#4a0f1c,#a8213a)', ardoise: 'linear-gradient(135deg,#252b36,#586174)'
  };

  /* ====== Outils ====== */
  var $ = function (id) { return document.getElementById(id); };
  function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  /* ====== Icônes (SVG au trait, remplacent les emojis) ====== */
  var IC = {
    cake: '<path d="M4 20h16v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z"/><path d="M12 12V8M12 4v1M8 12V9M16 12V9"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2.300.7 3.500 2.500 3.500 5.200"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.500 6.500l4 4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.500" r="3.500"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.700 7L4 20.500l1.500-4.600A8 8 0 1 1 21 12z"/>',
    check: '<path d="M5 12.500l4.500 4.500L19 7.500"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    video: '<rect x="3" y="6" width="12" height="12" rx="2"/><path d="M15 10.500l6-3.500v10l-6-3.500"/>',
    bolt: '<path d="M13 3L5 13.500h6L10 21l8-10.500h-6z"/>',
    dotOn: '<circle cx="12" cy="12" r="6" fill="#2ecc71" stroke="none"/>',
    dotOff: '<circle cx="12" cy="12" r="6" fill="#8a8a93" stroke="none"/>',
    dotRed: '<circle cx="12" cy="12" r="6" fill="#e5484d" stroke="none"/>'
  };
  function svg(n, s, gap) {
    return '<svg viewBox="0 0 24 24" width="' + (s || 18) + '" height="' + (s || 18) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;flex:none' + (gap ? ';margin-right:' + gap + 'px' : '') + '">' + (IC[n] || '') + '</svg>';
  }
  /* lab(el, '{lock}Texte') : met l’icône « lock » devant le texte */
  function lab(el, t) {
    var m = /^\{(\w+)\}([\s\S]*)$/.exec(t);
    if (m && IC[m[1]]) { el.innerHTML = svg(m[1], 16, m[2] ? 6 : 0); if (m[2]) el.appendChild(document.createTextNode(m[2])); }
    else el.textContent = t;
    return el;
  }
  window.UIIco = { svg: svg, lab: lab };
  function cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : '?'; }
  function db() { return firebase.firestore(); }
  function me() { try { return firebase.auth().currentUser; } catch (e) { return null; } }
  function myUname() { var u = me(); return u ? String(u.email || '').split('@')[0] : ''; }
  function hue(name) { var h = 0, s = String(name || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function ago(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return 'il y a ' + m + ' min';
    return 'il y a ' + Math.floor(m / 60) + ' h';
  }
  function reduceMotion() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function cldOk(u) { return typeof u === 'string' && u.indexOf(BASE) === 0; }
  function coverSrc(u, s) { s = +s || 0; return u.replace('/upload/', '/upload/so_' + s + ',eo_' + (s + LOOP) + ',w_720,c_limit,q_auto,vc_h264/').replace(/\.[a-z0-9]+$/i, '.mp4'); }
  function coverPoster(u, s) { s = +s || 0; return u.replace('/upload/', '/upload/so_' + s + ',w_720,c_limit,q_auto/').replace(/\.[a-z0-9]+$/i, '.jpg'); }
  function thumb(u) { return u.replace('/upload/', '/upload/w_320,h_320,c_fill,q_auto/'); }

  /* ====== Catalogue des badges ====== */
  var SV = {
    flag: '<path d="M6 3v18" stroke="#2f7de1" stroke-width="2.4" stroke-linecap="round"/><path d="M7 4h12l-3 4 3 4H7z" fill="#2f7de1"/>',
    flame: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4-1-6 1-10z" fill="#e5533d"/><path d="M12 14c1 1.5 2 2 2 3.5a2 2 0 0 1-4 0c0-1 1-2 2-3.5z" fill="#ffd9c9"/>',
    book: '<path d="M3 5c3-1.5 6-1.5 9 0v15c-3-1.5-6-1.5-9 0zM12 5c3-1.5 6-1.5 9 0v15c-3-1.5-6-1.5-9 0z" fill="#1fa36b"/><path d="M12 5v15" stroke="#fff" stroke-width="1.5"/>',
    heart: '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#e5457b"/>',
    inf: '<path d="M12 12c-2-3-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1 5.5-4s3.5-4 5.5-4a4 4 0 0 1 0 8c-2 0-3.5-1-5.5-4z" fill="none" stroke="#8b6bd9" stroke-width="2.6" stroke-linecap="round"/>',
    mail: '<rect x="2.5" y="5" width="19" height="14" rx="2" fill="#f5a03a"/><path d="M3 7l9 6 9-6" fill="none" stroke="#fff" stroke-width="1.6"/>',
    note: '<path d="M9 18V5l10-2v13" fill="none" stroke="#d94a76" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="#d94a76"/><circle cx="16.5" cy="16" r="2.5" fill="#d94a76"/>',
    cam: '<rect x="2.5" y="6.5" width="19" height="13" rx="3" fill="#3a82e0"/><path d="M8 6.5l1.5-2.5h5L16 6.5z" fill="#3a82e0"/><circle cx="12" cy="13" r="3.6" fill="#fff"/><circle cx="12" cy="13" r="1.8" fill="#3a82e0"/>',
    mic: '<rect x="9" y="2.5" width="6" height="12" rx="3" fill="#f0a030"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5" fill="none" stroke="#f0a030" stroke-width="2.2" stroke-linecap="round"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4.5" fill="#1fa36b"/><g fill="#fff"><circle cx="8" cy="8" r="1.6"/><circle cx="16" cy="8" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="8" cy="16" r="1.6"/><circle cx="16" cy="16" r="1.6"/></g>',
    pump: '<path d="M12 6.5c-5.5 0-9 2.8-9 6.8s3.5 6.7 9 6.7 9-2.7 9-6.7-3.5-6.8-9-6.8z" fill="#f07a1e"/><path d="M12 6.5c0-1.8.8-3 2.5-3.8" fill="none" stroke="#3b8a3b" stroke-width="2" stroke-linecap="round"/><path d="M7.5 11l2 2.5h-4zM16.5 11l2 2.5h-4zM8 16.5l1.5 1.3 1.2-1.3 1.3 1.3 1.2-1.3 1.3 1.3 1.5-1.3" fill="#3a1d05" stroke="#3a1d05" stroke-width=".8" stroke-linejoin="round"/>',
    snow: '<g stroke="#8db8f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/></g>'
  };
  var CAT = [
    ['Ancienneté', [['pionnier', 'Pionnier', 'Parmi les premiers inscrits', 'flag']]],
    ['Activité', [['flamme', 'Flamme', 'Plusieurs jours de suite', 'flame'], ['studieux', 'Studieux', 'Utilise le module Étudier', 'book']]],
    ['Social', [['adore', 'Adoré·e', 'Beaucoup de likes sur le profil', 'heart'], ['inseparables', 'Inséparables', 'Deux personnes très proches', 'inf'], ['facteur', 'Facteur', 'Écrit des lettres anonymes', 'mail']]],
    ['Loisirs', [['melomane', 'Mélomane', 'Écoute de musique ensemble', 'note'], ['photographe', 'Photographe', 'Envoie des photos', 'cam'], ['voix', 'Voix d’or', 'Envoie des vocaux', 'mic'], ['joueur', 'Joueur', 'Action ou vérité', 'dice']]],
    ['Événements (temporaires)', [['citrouille', 'Citrouille', 'Halloween', 'pump'], ['flocon', 'Flocon', 'Noël et hiver', 'snow']]]
  ];
  var KNOWN = {}; CAT.forEach(function (c) { c[1].forEach(function (b) { KNOWN[b[0]] = 1; }); });
  function badgeSvg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (SV[n] || '') + '</svg>'; }

  /* ====== Compteurs d’activité (sur cet appareil) ====== */
  function sk(uid) { return 'uandi-pst-' + uid; }
  function getSt(uid) { try { return JSON.parse(localStorage.getItem(sk(uid)) || '{}') || {}; } catch (e) { return {}; } }
  function setSt(uid, s) { try { localStorage.setItem(sk(uid), JSON.stringify(s)); } catch (e) {} }
  function inc(name) { var u = me(); if (!u) return; var s = getSt(u.uid); s[name] = (s[name] || 0) + 1; setSt(u.uid, s); }
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'picFile' && e.target.files && e.target.files.length) inc('photo'); }, true);
  document.addEventListener('click', function (e) { var m = e.target.closest && e.target.closest('#mic'); if (m && m.classList.contains('on')) inc('vocal'); }, true);
  function watchShow(id, name) {
    var n = $(id); if (!n) return;
    var was = !n.hidden;
    new MutationObserver(function () { var now = !n.hidden; if (now && !was) inc(name); was = now; }).observe(n, { attributes: true, attributeFilter: ['hidden'] });
  }
  watchShow('livebar', 'live'); watchShow('tdRoom', 'tod');

  function dayKey(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function streakOf(st) { var n = 0, d = new Date(); while (st.days && st.days.indexOf(dayKey(d)) >= 0) { n++; d.setDate(d.getDate() - 1); } return n; }
  function inRange(md, r) { return r[0] <= r[1] ? (md >= r[0] && md <= r[1]) : (md >= r[0] || md <= r[1]); }

  async function evalMine(u) {
    var st = getSt(u.uid), got = {}, now = new Date(), md = (now.getMonth() + 1) * 100 + now.getDate();
    st.days = st.days || []; var k = dayKey(now); if (st.days.indexOf(k) < 0) st.days.push(k); st.days = st.days.slice(-40);
    st.ev = st.ev || {};
    Object.keys(EVENTS).forEach(function (e) { if (inRange(md, EVENTS[e])) st.ev[e] = now.getFullYear(); });
    setSt(u.uid, st);
    try { if (new Date(u.metadata.creationTime) < new Date(PIONEER_BEFORE)) got.pionnier = 1; } catch (e) {}
    if (streakOf(st) >= THRESH.streak) got.flamme = 1;
    try { if (window.uandiStudy && uandiStudy.list().length > 0) got.studieux = 1; } catch (e) {}
    try { var am = JSON.parse(localStorage.getItem('uandi-ai-mem') || 'null'); if (am && ((am.msgs && am.msgs.length) || (am.chats && am.chats.length))) got.studieux = 1; } catch (e) {}
    try { var cl = JSON.parse(localStorage.getItem('uandi-close-' + u.uid) || '[]'); if (cl && cl.length) got.inseparables = 1; } catch (e) {}
    if ((st.live || 0) >= THRESH.live) got.melomane = 1;
    if ((st.photo || 0) >= THRESH.photo) got.photographe = 1;
    if ((st.vocal || 0) >= THRESH.vocal) got.voix = 1;
    if ((st.tod || 0) >= 1) got.joueur = 1;
    if (st.ev.citrouille) got.citrouille = 1;
    if (st.ev.flocon) got.flocon = 1;
    try {
      var q = await db().collection('letterOwners').where('uid', '==', u.uid).get(), n = 0;
      q.forEach(function (d) { if (!(d.data() || {}).letter) n++; });
      if (n >= THRESH.letters) got.facteur = 1;
    } catch (e) {}
    return Object.keys(got);
  }
  function publishMine(uid, ids) {
    ids = ids.slice().sort();
    var key = 'uandi-aw-' + uid, prev = ''; try { prev = localStorage.getItem(key) || ''; } catch (e) {}
    if (prev === ids.join(',')) return;
    db().collection('presence').doc(uid).set({ awards: ids.length ? ids : firebase.firestore.FieldValue.delete() }, { merge: true })
      .then(function () { try { localStorage.setItem(key, ids.join(',')); } catch (e) {} }).catch(function () {});
  }

  /* ====== Chargement d’un profil ====== */
  function frRef(uid) { return db().collection('friendships').doc([me().uid, uid].sort().join('_')); }
  async function friendsOf(uid) {
    var out = {}, ok = false;
    try {
      var sn = await db().collection('friendships').where('members', 'array-contains', uid).limit(300).get();
      sn.forEach(function (d) {
        var v = d.data(); if (!v || v.status !== 'accepted') return;
        var o = (v.members || []).filter(function (x) { return x !== uid; })[0];
        if (o) out[o] = { uid: o, name: (v.names && v.names[o]) || 'Inconnu', ats: v.ats || 0 };
      });
      ok = true;
    } catch (e) {}
    var u = me();
    if (u && u.uid === uid) {
      try {
        var cs = await db().collection('chats').where('members', 'array-contains', uid).get();
        cs.forEach(function (d) {
          var c = d.data() || {}; if (c.group || c.invite) return;
          var o = (c.members || []).filter(function (x) { return x !== uid; })[0];
          if (o && !out[o]) out[o] = { uid: o, name: (c.names && c.names[o]) || 'Inconnu', ats: 0 };
        });
        ok = true;
      } catch (e) {}
    }
    return ok ? Object.keys(out).map(function (k) { return out[k]; }) : null;
  }
  var VISL = { public: 'Tout le monde', friends: 'Mes amis', me: 'Moi uniquement' };
  /* amis d’UNE AUTRE personne : on lit la fiche qu’elle publie (friendLists), soumise à sa confidentialité */
  async function friendListOf(uid) {
    try {
      var d = await db().collection('friendLists').doc(uid).get();
      if (!d.exists) return { list: null, state: 'none' };
      var v = d.data() || {};
      return { list: (Array.isArray(v.list) ? v.list : []).filter(function (x) { return x && typeof x.uid === 'string'; }).map(function (x) { return { uid: x.uid, name: String(x.name || 'Inconnu'), ats: +x.ats || 0 }; }), state: 'ok' };
    } catch (e) { return { list: null, state: 'locked' }; }
  }
  function myVis() {
    var u = me();
    return db().collection('friendLists').doc(u.uid).get().then(function (d) { var v = d.exists ? d.data().vis : ''; return v === 'public' || v === 'me' ? v : 'friends'; }).catch(function () { return 'friends'; });
  }
  var lastPub = '';
  async function publishFriends(uid, list) {
    if (!list) return;
    var sig = list.map(function (f) { return f.uid; }).sort().join(',');
    if (sig === lastPub) return;
    try {
      var ref = db().collection('friendLists').doc(uid), d = await ref.get(), v = d.exists ? d.data() : {};
      var data = { list: list.slice(0, 300).map(function (f) { return { uid: f.uid, name: f.name, ats: f.ats || 0 }; }), n: list.length, ts: Date.now() };
      if (v.vis !== 'public' && v.vis !== 'friends' && v.vis !== 'me') data.vis = 'friends';
      await ref.set(data, { merge: true });
      lastPub = sig;
    } catch (e) {}
  }
  async function build(uid, name) {
    var u = me(), self = !!u && u.uid === uid;
    var r = await Promise.all([
      db().collection('presence').doc(uid).get().then(function (d) { return d.exists ? d.data() : {}; }).catch(function () { return {}; }),
      self ? friendsOf(uid).then(function (l) { return { list: l, state: l ? 'ok' : 'none' }; }) : friendListOf(uid),
      self ? Promise.resolve(null) : friendsOf(u.uid),
      db().collection('profileLikes').where('to', '==', uid).get().then(function (s) { return s.size; }).catch(function () { return 0; }),
      self ? Promise.resolve(null) : frRef(uid).get().then(function (d) { return d.exists ? d.data() : null; }).catch(function () { return null; }),
      self ? evalMine(u) : Promise.resolve(null),
      self ? myVis() : Promise.resolve(null)
    ]);
    var pres = r[0] || {}, fl = r[1] || { list: null, state: 'none' }, friends = fl.list, mine = r[2], likes = r[3], fr = r[4];
    var awards = self ? r[5] : (Array.isArray(pres.awards) ? pres.awards.filter(function (a) { return KNOWN[a]; }) : []);
    if (likes >= THRESH.likes && awards.indexOf('adore') < 0) awards = awards.concat(['adore']);
    if (self) { publishMine(uid, awards); publishFriends(uid, friends); }
    var mutual = 0, since = 0, isFriend = false;
    if (!self && mine) {
      var ms = {}; mine.forEach(function (f) { ms[f.uid] = f; });
      if (ms[uid]) { isFriend = true; since = ms[uid].ats; }
      if (friends) friends.forEach(function (f) { if (ms[f.uid]) mutual++; });
    }
    var uname = self ? myUname() : String(name || '').toLowerCase();
    return { uid: uid, self: self, uname: uname, disp: pres.nick || pres.name || name || uname, pres: pres, friends: friends, fstate: fl.state, vis: r[6], mutual: mutual, likes: likes, fr: fr, isFriend: isFriend, since: since, awards: awards };
  }

  /* ====== Styles ====== */
  function injectCss() {
    if ($('pfStyle')) return;
    var st = mk('style'); st.id = 'pfStyle';
    st.textContent = [
      '#profDlg{width:min(30rem,100vw);max-width:100vw;height:100vh;height:100dvh;max-height:100dvh;margin:0 auto;padding:0;border:0;background:var(--bg);color:var(--ink);overflow-y:auto;overscroll-behavior:contain}',
      '@media (min-width:700px){#profDlg{height:min(52rem,96dvh);margin:auto;border-radius:22px;border:1px solid var(--line)}}',
      '#profDlg::backdrop{background:rgba(4,6,16,.6)}',
      '.pf-top{position:sticky;top:0;height:0;z-index:5}',
      '.pf-back{margin:calc(10px + env(safe-area-inset-top,0px)) 0 0 10px;width:40px;height:40px;border-radius:50%;border:0;background:rgba(0,0,0,.7);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}',
      '.pf-back svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}',
      '.pf-cover{position:relative;height:150px;overflow:hidden;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 55%,#000),color-mix(in srgb,var(--accent2,var(--accent)) 45%,#000))}',
      '.pf-cover video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
      '.pf-cover .c1,.pf-cover .c2{position:absolute;border-radius:50%;background:rgba(255,255,255,.14)}',
      '.pf-cover .c1{width:190px;height:190px;left:-40px;top:-70px}.pf-cover .c2{width:110px;height:110px;right:30px;top:20px}',
      '.pf-cedit{position:absolute;right:12px;bottom:12px;padding:6px 12px;border:0;border-radius:999px;background:rgba(0,0,0,.5);color:#fff;font:inherit;font-size:.75rem;font-weight:600;cursor:pointer}',
      '.pf-head{position:relative;padding:0 16px;margin-top:-50px}',
      '.pf-avw{position:relative;width:100px;height:100px}',
      '.pf-av{width:100px;height:100px;border-radius:50%;border:4px solid var(--bg);display:grid;place-items:center;font-size:2.4rem;font-weight:700;color:#fff;background-size:cover!important;background-position:center!important}',
      '.pf-dot{position:absolute;right:6px;bottom:8px;width:18px;height:18px;border-radius:50%;background:#2fbf71;border:3px solid var(--bg)}',
      '.pf-name{display:flex;align-items:center;gap:4px;margin:12px 0 2px;font-size:1.5rem;font-weight:800;letter-spacing:-.02em;overflow-wrap:anywhere}',
      '.pf-sub{margin:0;color:var(--muted);font-size:.88rem}',
      '.pf-bio{margin:12px 0 0;line-height:1.45;overflow-wrap:anywhere;white-space:pre-wrap}',
      '.pf-cnt{display:flex;gap:16px;margin:12px 0 0;color:var(--muted);font-size:.85rem}.pf-cnt b{color:var(--ink)}',
      '.pf-acts{display:flex;gap:8px;margin:16px 0 0}',
      '.pf-btn{flex:1;min-height:44px;border:0;border-radius:12px;background:var(--surface);color:var(--ink);border:1px solid var(--line);font:inherit;font-weight:600;font-size:.9rem;cursor:pointer}',
      '.pf-btn.main{background:var(--accent);color:var(--accent-ink);border-color:transparent}',
      '.pf-btn.sm{flex:none;width:52px}',
      '.pf-msg{margin:8px 16px 0;font-size:.82rem;color:var(--muted)}.pf-msg.err{color:var(--danger)}',
      '.pf-tabs{display:flex;margin-top:14px;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:4;background:var(--bg);padding:env(safe-area-inset-top,0px) 0 0 56px}',
      '.pf-tab{flex:1;padding:13px 0;border:0;background:none;color:var(--muted);font:inherit;font-weight:600;cursor:pointer}',
      '.pf-tab[aria-selected="true"]{color:var(--accent);box-shadow:inset 0 -2px var(--accent)}',
      '.pf-sec{padding:16px}.pf-sec + .pf-sec{border-top:8px solid color-mix(in srgb,var(--ink) 5%,transparent)}',
      '.pf-h{margin:0 0 12px;font-weight:700;font-size:1rem}',
      '.pf-row{display:flex;align-items:center;gap:12px;padding:8px 0}',
      '.pf-ico{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--soft);font-size:1.1rem}',
      '.pf-rt{flex:1;min-width:0}.pf-rt b{display:block;font-size:.92rem}.pf-rt small{color:var(--muted);font-size:.78rem}',
      '.pf-tag{flex:none;padding:3px 10px;border-radius:999px;background:var(--soft);color:var(--muted);font-size:.7rem}',
      '.pf-note{margin-top:10px;padding:14px;border-radius:16px;background:var(--surface);border:1px solid var(--line)}',
      '.pf-note small{display:block;color:var(--muted);font-size:.78rem;margin-bottom:6px}',
      '.pf-fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}',
      '.pf-fi{border:0;background:none;color:var(--ink);font:inherit;font-size:.78rem;cursor:pointer;padding:0;text-align:center}',
      '.pf-fsq{aspect-ratio:1;border-radius:50%;display:grid;place-items:center;font-size:1.8rem;font-weight:700;color:#fff;margin:0 auto 6px;width:100%;max-width:104px;overflow:hidden}',
      '.pf-more{margin-top:12px;width:100%}',
      '.pf-bcat{margin:14px 0 8px;color:var(--muted);font-size:.8rem}',
      '.pf-bgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px 6px;text-align:center}',
      '.pf-b svg{width:46px;height:46px;display:block;margin:0 auto 6px}',
      '.pf-b b{display:block;font-size:.82rem}.pf-b small{display:block;color:var(--muted);font-size:.7rem;line-height:1.25;margin-top:2px}',
      '.pf-b.off{opacity:.28;filter:grayscale(1)}',
      '.pf-pgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}',
      '.pf-pgrid button{padding:0;border:0;border-radius:12px;overflow:hidden;aspect-ratio:1;background:var(--soft);cursor:pointer}',
      '.pf-pgrid img{width:100%;height:100%;object-fit:cover;display:block}',
      '.pf-empty{color:var(--muted);font-size:.88rem;text-align:center;padding:24px 0}',
      '.pf-avw.st .pf-av{box-shadow:0 0 0 3px #ff3d77}.pf-avw.st.seen .pf-av{box-shadow:0 0 0 3px #6b7280}',
      '.pf-brow{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border-radius:16px;background:var(--surface);border:1px solid var(--line);color:var(--ink);font:inherit;text-align:left;cursor:pointer}',
      '.pf-brt{flex:1;min-width:0}.pf-brt b{display:block;font-size:.95rem}.pf-brt small{color:var(--muted);font-size:.78rem}',
      '.pf-bprev{display:flex;gap:4px}.pf-bprev svg{width:26px;height:26px}.pf-chev{color:var(--muted);font-size:1.4rem}',
      '#pfBadgeDlg{width:min(24rem,calc(100vw - 24px));max-height:78dvh;margin:auto;padding:0;border:1px solid var(--line);border-radius:22px;background:var(--bg);color:var(--ink);overflow:hidden}',
      '#pfBadgeDlg::backdrop{background:rgba(4,6,16,.6)}',
      '.pf-bhead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);font-weight:700}',
      '.pf-bx{width:32px;height:32px;border-radius:50%;border:0;background:var(--soft);color:var(--ink);cursor:pointer;font-size:.9rem}',
      '.pf-bbody{padding:0 16px 16px;overflow-y:auto;max-height:calc(78dvh - 58px)}',
      '#ucProf{width:100%}'
    ].join('');
    document.head.appendChild(st);
  }

  /* ====== Affichage ====== */
  var dlg = null, S = { uid: null, name: '', tab: 'about', data: null };
  function ensureDlg() {
    if (dlg) return;
    injectCss();
    dlg = document.createElement('dialog'); dlg.id = 'profDlg';
    dlg.innerHTML = '<div class="pf-top"><button class="pf-back" id="pfBack" type="button" aria-label="Retour"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button></div><div id="pfBody"></div>';
    document.body.appendChild(dlg);
    $('pfBack').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { var v = dlg.querySelector('video'); if (v) { try { v.pause(); } catch (e) {} } });
  }
  function msg(t, err) { var m = $('pfMsg'); if (!m) return; m.textContent = t || ''; m.className = 'pf-msg' + (err ? ' err' : ''); m.hidden = !t; }
  function edit(section) { document.dispatchEvent(new CustomEvent('ui-profile-edit', { detail: { section: section } })); }

  function coverNode(P) {
    var p = P.pres, c = mk('div', 'pf-cover'), u = cldOk(p.coverU) ? p.coverU : '';
    if (COVERS[p.coverC]) c.style.background = COVERS[p.coverC];
    if (u) {
      var s = +p.coverS || 0, v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = 'metadata';
      v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
      v.poster = coverPoster(u, s); v.src = coverSrc(u, s);
      v.addEventListener('error', function () {
        if (v.dataset.fb) return; v.dataset.fb = '1'; v.src = u;
        v.addEventListener('loadedmetadata', function () { try { v.currentTime = s; } catch (e) {} });
        v.addEventListener('timeupdate', function () { if (v.currentTime >= s + LOOP) v.currentTime = s; });
        if (!reduceMotion()) v.play().catch(function () {});
      });
      c.appendChild(v);
      if (!reduceMotion()) { v.autoplay = true; v.play().catch(function () {}); }
    } else if (!COVERS[p.coverC]) { c.appendChild(mk('i', 'c1')); c.appendChild(mk('i', 'c2')); }
    if (P.self) {
      var b = mk('button', 'pf-cedit', 'Modifier la couverture'); b.type = 'button';
      b.addEventListener('click', function () { edit('cover'); });
      c.appendChild(b);
    }
    return c;
  }
  function roleBadge(p) {
    var k = p.badge === true ? 'fnd' : p.assistant === true ? 'ast' : p.verified === true ? 'cert' : '';
    if (!k) return null;
    var b = mk('span', 'ubadge st ' + k);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon class="sl" stroke-width="1.6" stroke-linejoin="round" points="12.00,1.80 14.25,3.60 17.10,3.17 18.15,5.85 20.83,6.90 20.40,9.75 22.20,12.00 20.40,14.25 20.83,17.10 18.15,18.15 17.10,20.83 14.25,20.40 12.00,22.20 9.75,20.40 6.90,20.83 5.85,18.15 3.17,17.10 3.60,14.25 1.80,12.00 3.60,9.75 3.17,6.90 5.85,5.85 6.90,3.17 9.75,3.60"/><path class="ck" d="M7 12.6l3.3 3.3L17 8.9" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="bt">' + (k === 'fnd' ? 'Fondateur' : k === 'ast' ? 'Assistant' : 'Certifié') + '</span>';
    return b;
  }
  function frAction(P, kind) {
    var u = me(), ref = frRef(P.uid), p;
    if (kind === 'add') { var nm = {}; nm[u.uid] = myUname(); nm[P.uid] = P.uname; p = ref.set({ members: [u.uid, P.uid], names: nm, from: u.uid, status: 'pending', ts: Date.now() }); }
    else if (kind === 'acc') p = ref.update({ status: 'accepted', ats: Date.now() });
    else { if (kind === 'rm' && !confirm('Retirer ' + cap(P.disp) + ' de tes amis ?')) return; p = ref.delete(); }
    p.then(reload).catch(function () { msg('Action impossible (connexion ou règles Firestore « friendships »).', true); });
  }
  function reload() { var id = S.uid; build(id, S.name).then(function (d) { if (S.uid === id) { S.data = d; render(); } }); }

  function openMessage(P) {
    dlg.close();
    ['userCard', 'settings', 'frDlg'].forEach(function (i) { var d = $(i); if (d && d.open) d.close(); });
    setTimeout(function () {
      var tb = document.querySelector('.tab[data-t="chats"]'); if (tb) tb.click();
      setTimeout(function () {
        var row = document.querySelector('#chats .chatrow[data-uid="' + P.uid + '"]');
        if (row) { row.click(); return; }
        var inp = $('who'), f = $('newChat'); if (!inp || !f) return;
        f.hidden = false; inp.value = P.uname;
        if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        var n = 0, iv = setInterval(function () {
          var uc = $('userCard');
          if (uc && uc.open) {
            clearInterval(iv);
            var o = $('ucOpen'), m = $('ucMsg');
            if (o && !o.hidden) o.click(); else if (m && !m.hidden) m.click();
          } else if (++n > 24) clearInterval(iv);
        }, 150);
      }, 350);
    }, 120);
  }

  function render() {
    var P = S.data, body = $('pfBody'); if (!P) return;
    var p = P.pres; body.textContent = '';
    body.appendChild(coverNode(P));
    var head = mk('div', 'pf-head'), avw = mk('div', 'pf-avw'), av = mk('div', 'pf-av');
    if (typeof p.photo === 'string' && p.photo) av.style.background = 'center / cover no-repeat url("' + p.photo + '")';
    else { av.style.background = 'hsl(' + hue(P.disp) + ' 38% 42%)'; av.textContent = cap(P.disp).charAt(0); }
    avw.appendChild(av);
    if (window.UIStories && (P.self || P.isFriend)) UIStories.fetch(P.uid).then(function (l) {
      if (S.data !== P || !l.length) return;
      avw.classList.add('st'); if (!P.self && !UIStories.isNew(P.uid, l)) avw.classList.add('seen');
      avw.style.cursor = 'pointer'; avw.addEventListener('click', function () { UIStories.open(P.uid, P.disp); });
    });
    var online = !P.self ? (p.seen && Date.now() - p.seen < 150000 && p.hideOn !== true) : true;
    if (online) avw.appendChild(mk('i', 'pf-dot'));
    head.appendChild(avw);
    var nm = mk('h2', 'pf-name'); nm.style.margin = '12px 0 2px'; nm.appendChild(document.createTextNode(cap(P.disp)));
    var rb = roleBadge(p); if (rb) nm.appendChild(rb);
    head.appendChild(nm);
    head.appendChild(mk('p', 'pf-sub', '@' + P.uname + ' · ' + (online ? 'En ligne' : 'Hors ligne')));
    if (typeof p.bio === 'string' && p.bio.trim()) head.appendChild(mk('p', 'pf-bio', p.bio));
    var cnt = mk('div', 'pf-cnt'), nf = P.friends ? P.friends.length : null;
    var a = mk('span'); if (nf === null) { if (P.fstate === 'locked') lab(a, '{lock}Amis privés'); else a.textContent = '– ami'; } else { a.innerHTML = '<b></b> ami' + (nf > 1 ? 's' : ''); a.firstChild.textContent = nf; } cnt.appendChild(a);
    if (!P.self && P.friends) { var c2 = mk('span'); c2.innerHTML = '<b></b> en commun'; c2.firstChild.textContent = P.mutual; cnt.appendChild(c2); }
    head.appendChild(cnt);

    var acts = mk('div', 'pf-acts');
    function btn(label, cls, fn) { var b = lab(mk('button', 'pf-btn ' + (cls || '')), label); b.type = 'button'; b.addEventListener('click', fn); acts.appendChild(b); return b; }
    if (P.self) {
      btn('{pencil}Modifier le profil', 'main', function () { edit('info'); });
      if (window.UIStories) { var sb = btn('{camera}', 'sm', function () { UIStories.compose(); }); sb.title = 'Ajouter une story'; sb.setAttribute('aria-label', 'Ajouter une story'); }
    } else {
      var fr = P.fr;
      if (P.isFriend) { var fb = btn('{check}Amis', 'main', function () { frAction(P, 'rm'); }); if (!fr) fb.disabled = true; }
      else if (fr && fr.status === 'pending') {
        if (fr.from === me().uid) btn('Demande envoyée', '', function () { frAction(P, 'cancel'); });
        else btn('{check}Accepter', 'main', function () { frAction(P, 'acc'); });
      } else btn('{plus}Ajouter', 'main', function () { frAction(P, 'add'); });
      btn('{chat}Message', '', function () { openMessage(P); });
      btn('···', 'sm', function () {
        try { navigator.clipboard.writeText('@' + P.uname); msg('Identifiant @' + P.uname + ' copié.'); } catch (e) { msg('@' + P.uname); }
      });
    }
    head.appendChild(acts);
    body.appendChild(head);
    var m = mk('p', 'pf-msg'); m.id = 'pfMsg'; m.hidden = true; body.appendChild(m);

    var tabs = mk('div', 'pf-tabs'); tabs.setAttribute('role', 'tablist');
    [['about', 'À propos'], ['friends', 'Amis'], ['photos', 'Photos']].forEach(function (t) {
      var b = mk('button', 'pf-tab', t[1]); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', S.tab === t[0] ? 'true' : 'false');
      b.addEventListener('click', function () { S.tab = t[0]; render(); });
      tabs.appendChild(b);
    });
    body.appendChild(tabs);
    if (S.tab === 'about') paneAbout(body, P); else if (S.tab === 'friends') paneFriends(body, P); else panePhotos(body, P);
  }

  function infoRow(ico, t, s, tag) {
    var r = mk('div', 'pf-row'), i = mk('span', 'pf-ico'), x = mk('div', 'pf-rt');
    i.innerHTML = svg(ico, 20); if (ico.indexOf('dot') !== 0) i.style.color = 'var(--accent)';
    x.appendChild(mk('b', '', t)); x.appendChild(mk('small', '', s)); r.appendChild(i); r.appendChild(x);
    if (tag) r.appendChild(mk('span', 'pf-tag', tag));
    return r;
  }
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var PH = {};   /* cache des photos de profil : uid -> url ('' = pas de photo) */
  function okPhoto(u) { return typeof u === 'string' && /^(https?:|data:image\/)/.test(u); }
  function applyPhoto(node, u) {
    node.style.background = 'center / cover no-repeat url("' + u.replace(/"/g, '%22') + '")';
    node.textContent = '';
  }
  function friendPhoto(uid, node) {
    if (uid in PH) { if (PH[uid]) applyPhoto(node, PH[uid]); return; }
    db().collection('presence').doc(uid).get().then(function (d) {
      var u = d.exists ? d.data().photo : '';
      PH[uid] = okPhoto(u) ? u : '';
      if (PH[uid]) applyPhoto(node, PH[uid]);
    }).catch(function () {});
  }
  function friendSq(f) {
    var b = mk('button', 'pf-fi'); b.type = 'button';
    var q = mk('div', 'pf-fsq', cap(f.name).charAt(0)); q.style.background = 'hsl(' + hue(f.name) + ' 42% 34%)';
    friendPhoto(f.uid, q);
    b.appendChild(q); b.appendChild(mk('span', '', cap(f.name)));
    b.addEventListener('click', function () { openProfile(f.uid, f.name); });
    return b;
  }
  function friendsMsg(P) { return P.fstate === 'locked' ? '{lock}Cette personne garde sa liste d’amis privée.' : P.friends ? 'Aucun ami pour l’instant.' : 'La liste d’amis n’est pas disponible.'; }
  function openBadges(P) {
    var d = $('pfBadgeDlg');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'pfBadgeDlg';
      d.innerHTML = '<div class="pf-bhead"><span id="pfBTitle"></span><button type="button" class="pf-bx" id="pfBX" aria-label="Fermer">✕</button></div><div class="pf-bbody" id="pfBBody"></div>';
      document.body.appendChild(d);
      $('pfBX').addEventListener('click', function () { d.close(); });
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    }
    $('pfBTitle').textContent = 'Badges · ' + P.awards.length + '/' + Object.keys(KNOWN).length;
    var bd = $('pfBBody'); bd.textContent = '';
    var have = {}; P.awards.forEach(function (a) { have[a] = 1; });
    CAT.forEach(function (c) {
      bd.appendChild(mk('p', 'pf-bcat', c[0]));
      var g = mk('div', 'pf-bgrid');
      c[1].forEach(function (b) {
        var it = mk('div', 'pf-b' + (have[b[0]] ? '' : ' off')); it.innerHTML = badgeSvg(b[3]);
        it.appendChild(mk('b', '', b[1])); it.appendChild(mk('small', '', b[2]));
        g.appendChild(it);
      });
      bd.appendChild(g);
    });
    d.showModal();
  }
  function paneAbout(body, P) {
    var p = P.pres, s1 = mk('div', 'pf-sec');
    s1.appendChild(mk('h3', 'pf-h', 'Informations'));
    if (/^\d\d-\d\d$/.test(p.bday || '')) s1.appendChild(infoRow('cake', 'Anniversaire', (+p.bday.slice(3, 5)) + ' ' + MOIS[(+p.bday.slice(0, 2)) - 1], 'Public'));
    if (!P.self && P.since) s1.appendChild(infoRow('users', 'Ami depuis', MOIS[new Date(P.since).getMonth()] + ' ' + new Date(P.since).getFullYear()));
    var on = P.self || (p.seen && Date.now() - p.seen < 150000 && p.hideOn !== true);
    s1.appendChild(infoRow(on ? 'dotOn' : 'dotOff', 'Statut', on ? 'En ligne maintenant' : 'Hors ligne'));
    var okNote = typeof p.note === 'string' && p.note.trim() && typeof p.noteTs === 'number' && Date.now() - p.noteTs < 864e5 && (P.self || !Array.isArray(p.noteTo) || p.noteTo.indexOf(me().uid) !== -1);
    if (okNote) { var nt = mk('div', 'pf-note'); nt.appendChild(mk('small', '', 'Note du jour · ' + ago(p.noteTs))); nt.appendChild(mk('div', '', p.note)); s1.appendChild(nt); }
    body.appendChild(s1);

    var s2 = mk('div', 'pf-sec');
    s2.appendChild(mk('h3', 'pf-h', 'Amis' + (P.friends ? ' · ' + P.friends.length : '')));
    if (!P.friends) s2.appendChild(lab(mk('p', 'pf-empty'), friendsMsg(P)));
    else if (!P.friends.length) s2.appendChild(mk('p', 'pf-empty', 'Aucun ami pour l’instant.'));
    else {
      var g = mk('div', 'pf-fgrid'); P.friends.slice(0, 6).forEach(function (f) { g.appendChild(friendSq(f)); }); s2.appendChild(g);
      if (P.friends.length > 6) { var mo = mk('button', 'pf-btn pf-more', 'Voir tous les amis'); mo.type = 'button'; mo.addEventListener('click', function () { S.tab = 'friends'; render(); }); s2.appendChild(mo); }
    }
    body.appendChild(s2);

    var s3 = mk('div', 'pf-sec'), have = {}; P.awards.forEach(function (a) { have[a] = 1; });
    var br = mk('button', 'pf-brow'); br.type = 'button'; br.setAttribute('aria-label', 'Voir les badges');
    var bt = mk('div', 'pf-brt'); bt.appendChild(mk('b', '', 'Badges')); bt.appendChild(mk('small', '', P.awards.length + ' / ' + Object.keys(KNOWN).length + ' débloqués'));
    br.appendChild(bt);
    var pv = mk('span', 'pf-bprev'), shown = 0;
    CAT.forEach(function (c) { c[1].forEach(function (b) { if (have[b[0]] && shown < 5) { shown++; pv.insertAdjacentHTML('beforeend', badgeSvg(b[3])); } }); });
    br.appendChild(pv); br.appendChild(mk('span', 'pf-chev', '›'));
    br.addEventListener('click', function () { openBadges(P); });
    s3.appendChild(br);
    body.appendChild(s3);
  }
  function paneFriends(body, P) {
    var s = mk('div', 'pf-sec');
    s.appendChild(mk('h3', 'pf-h', 'Amis' + (P.friends ? ' · ' + P.friends.length : '')));
    if (!P.friends || !P.friends.length) s.appendChild(lab(mk('p', 'pf-empty'), friendsMsg(P)));
    else { var g = mk('div', 'pf-fgrid'); P.friends.slice(0, 90).forEach(function (f) { g.appendChild(friendSq(f)); }); s.appendChild(g); }
    if (P.self) { var pr = lab(mk('button', 'pf-btn pf-more'), '{lock}Confidentialité : ' + (VISL[P.vis] || VISL.friends)); pr.type = 'button'; pr.addEventListener('click', function () { edit('privacy'); }); s.appendChild(pr); }
    body.appendChild(s);
  }
  function panePhotos(body, P) {
    var s = mk('div', 'pf-sec'), al = Array.isArray(P.pres.album) ? P.pres.album.filter(cldOk) : [];
    s.appendChild(mk('h3', 'pf-h', 'Photos' + (al.length ? ' · ' + al.length : '')));
    if (!al.length) s.appendChild(mk('p', 'pf-empty', P.self ? 'Ajoute tes premières photos.' : 'Aucune photo pour l’instant.'));
    else {
      var g = mk('div', 'pf-pgrid');
      al.forEach(function (u) {
        var b = mk('button'); b.type = 'button'; var im = mk('img'); im.src = thumb(u); im.loading = 'lazy'; im.alt = 'Photo'; b.appendChild(im);
        b.addEventListener('click', function () { var v = $('viewer'), vi = $('viewerImg'); if (v && vi) { vi.src = u; v.showModal(); } });
        g.appendChild(b);
      });
      s.appendChild(g);
    }
    if (P.self) { var ad = mk('button', 'pf-btn pf-more', '＋ Ajouter des photos'); ad.type = 'button'; ad.addEventListener('click', function () { edit('photos'); }); s.appendChild(ad); }
    body.appendChild(s);
  }

  function openProfile(uid, name) {
    if (!uid || !me()) return;
    ensureDlg();
    S.uid = uid; S.name = name || ''; S.tab = 'about'; S.data = null;
    $('pfBody').textContent = ''; var l = mk('p', 'pf-empty', 'Chargement du profil…'); l.style.paddingTop = '80px'; $('pfBody').appendChild(l);
    if (!dlg.open) dlg.showModal();
    build(uid, name).then(function (d) { if (S.uid === uid) { S.data = d; render(); } })
      .catch(function () { if (S.uid === uid) { $('pfBody').textContent = ''; $('pfBody').appendChild(mk('p', 'pf-empty', 'Profil indisponible pour le moment.')); } });
  }

  /* ====== Points d’entrée ====== */
  function start() {
    injectCss();
    /* 1) fiche d’une personne : bouton « Voir le profil » */
    var box = document.querySelector('#userCard .ucbtns');
    if (box && !$('ucProf')) {
      var b = lab(mk('button', 'ghost'), '{user}Voir le profil'); b.id = 'ucProf'; b.type = 'button';
      box.insertBefore(b, box.firstChild);
      b.addEventListener('click', function () {
        var n = $('ucName'), nm = n && n.firstChild ? n.firstChild.textContent.trim().toLowerCase() : '';
        if (!nm) return;
        db().collection('usernames').doc(nm).get().then(function (d) {
          if (d.exists && d.data().uid) openProfile(d.data().uid, nm);
          else { var e = $('ucErr'); if (e) { e.textContent = 'Profil introuvable.'; e.hidden = false; } }
        }).catch(function () { var e = $('ucErr'); if (e) { e.textContent = 'Profil indisponible (connexion).'; e.hidden = false; } });
      });
    }
    /* 2) carte de profil des Réglages = mon profil */
    document.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('#fbProfile'); if (!c) return;
      e.stopPropagation(); e.preventDefault();
      var sd = $('settings'); if (sd && sd.open) sd.close();
      var u = me(); if (u) openProfile(u.uid, myUname());
    }, true);
    /* 2b) bouton « Mon profil » dans l’en-tête (sans passer par les Réglages) */
    var hb = document.querySelector('.hbtns');
    if (hb && !$('myProfBtn')) {
      var mb = mk('button', 'ghost', null); mb.id = 'myProfBtn'; mb.type = 'button'; mb.title = 'Mon profil'; mb.setAttribute('aria-label', 'Mon profil');
      mb.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
      mb.style.cssText = 'width:38px;height:38px;min-width:38px;padding:0;border-radius:50%;display:grid;place-items:center;flex:none';
      mb.addEventListener('click', function () { var u = me(); if (u) openProfile(u.uid, myUname()); });
      hb.insertBefore(mb, hb.firstChild);
    }
    /* 3) après modification : on rafraîchit */
    document.addEventListener('ui-profile-saved', function () { var u = me(); if (dlg && dlg.open && u && S.uid === u.uid) reload(); });
    /* 4) calcul et publication des badges à l’ouverture de l’appli */
    firebase.auth().onAuthStateChanged(function (u) {
      if (!u) return;
      setTimeout(function () { evalMine(u).then(function (ids) { publishMine(u.uid, ids); }).catch(function () {}); friendsOf(u.uid).then(function (l) { publishFriends(u.uid, l); }).catch(function () {}); }, 6000);
    });
  }
  (function wait(n) {
    if (window.firebase && firebase.apps && firebase.apps.length && $('userCard')) { try { start(); } catch (e) { console.warn('Profil :', e); } return; }
    if (n < 400) setTimeout(function () { wait(n + 1); }, 300);
  })(0);

  window.UIProfile = { open: openProfile, COVERS: COVERS, BASE: BASE, LOOP: LOOP, coverSrc: coverSrc, coverPoster: coverPoster, thumb: thumb, catalog: CAT, friendsOf: friendsOf, myUname: myUname };
})();
