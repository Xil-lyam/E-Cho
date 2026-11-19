/* U&I — js/profil.js
   Page de profil (À propos / Amis / Photos), badges de réussite et couverture animée.
   - Ouvre le profil depuis la fiche d’une personne (« Voir le profil ») et depuis la carte de profil des Réglages.
   - Calcule tes badges et les publie sur ton profil (colonne « awards » de public.profiles, Supabase).
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
  /* ====== Supabase (remplace Firebase) ====== */
  var SBC = null, CUR = null;
  function sb() {
    if (SBC) return SBC;
    if (window.__sb) { SBC = window.__sb; return SBC; }
    var C = window.APP_CONFIG || {};
    if (window.supabase && C.supabase && C.supabase.url && C.supabase.key) {
      SBC = window.supabase.createClient(C.supabase.url, C.supabase.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      window.__sb = SBC;
    }
    return SBC;
  }
  function mkCur(u) { return u ? { uid: u.id, id: u.id, email: u.email, created: u.created_at } : null; }
  function me() { return CUR || window.__xenUser || null; }
  function ck(r) { if (r && r.error) throw r.error; return r; }
  /* ligne de public.profiles -> ancienne forme « fiche presence » utilisée par l'affichage */
  function rowToPres(r) {
    if (!r) return {};
    var m = { name: r.name || r.username, nick: r.nick, photo: r.photo, xst: r.xst, seen: r.seen, bio: r.bio, bday: r.bday,
      coverU: r.cover_u, coverP: r.cover_p, coverS: r.cover_s, coverD: r.cover_d, coverC: r.cover_c, album: r.album, awards: r.awards,
      badge: r.badge, bpill: r.bpill, bhide: r.bhide, bcol: r.badge_color, verified: r.verified, assistant: r.assistant,
      hideOn: r.hide_on, hideSeen: r.hide_seen, note: r.note, noteTs: r.note_ts, noteTo: r.note_to, username: r.username };
    var o = {}; Object.keys(m).forEach(function (k) { if (m[k] !== null && m[k] !== undefined) o[k] = m[k]; });
    return o;
  }
  async function getPres(uid) {
    var r = await sb().from('profiles').select('*').eq('id', uid).maybeSingle();
    if (r.error || !r.data) return {};
    return rowToPres(r.data);
  }
  async function namesOf(uids) {
    var out = {};
    if (!uids.length) return out;
    var r = await sb().from('profiles').select('id,username,name').in('id', uids);
    (r.data || []).forEach(function (x) { out[x.id] = x.username || x.name; });
    return out;
  }
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
  function coverImg(u) { return u.replace('/upload/', '/upload/w_1000,c_limit,q_auto/'); }
  function coverPoster(u, s) { s = +s || 0; return u.replace('/upload/', '/upload/so_' + s + ',w_720,c_limit,q_auto/').replace(/\.[a-z0-9]+$/i, '.jpg'); }
  function thumb(u) { return u.replace('/upload/', '/upload/w_320,h_320,c_fill,q_auto/'); }

  /* ====== Catalogue des badges ====== */
  /* ====== Icônes de badges : médaillons dégradés brillants (ids uniques à chaque affichage grâce à {u}) ====== */
  /* o = [anneau clair, anneau milieu, anneau foncé, fond clair, fond foncé, motif clair, motif milieu, motif foncé] */
  function medal(o, glyph) {
    return '<defs>' +
      '<linearGradient id="r{u}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + o[0] + '"/><stop offset=".5" stop-color="' + o[1] + '"/><stop offset="1" stop-color="' + o[2] + '"/></linearGradient>' +
      '<radialGradient id="d{u}" cx=".35" cy=".25" r="1"><stop offset="0" stop-color="' + o[3] + '"/><stop offset="1" stop-color="' + o[4] + '"/></radialGradient>' +
      '<linearGradient id="g{u}" gradientUnits="userSpaceOnUse" x1="14" y1="10" x2="34" y2="38"><stop offset="0" stop-color="' + o[5] + '"/><stop offset=".55" stop-color="' + o[6] + '"/><stop offset="1" stop-color="' + o[7] + '"/></linearGradient>' +
      '<linearGradient id="s{u}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '</defs>' +
      '<circle cx="24" cy="24" r="22.8" fill="url(#r{u})"/>' +
      '<circle cx="24" cy="24" r="19.4" fill="url(#d{u})"/>' +
      '<circle cx="24" cy="24" r="19.4" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width=".7"/>' +
      '<g fill="url(#g{u})">' + glyph + '</g>' +
      '<path d="M8.5 19.5C10.5 11.6 17 7.2 24 7.2s13.5 4.4 15.5 12.3C34.6 16.1 29.6 14.7 24 14.7S13.4 16.1 8.5 19.5z" fill="url(#s{u})"/>';
  }
  function snowArm(r) { return '<g transform="rotate(' + r + ' 24 24)"><path d="M24 10.5v27M21.2 14.2l2.8 2.8 2.8-2.8M21.2 33.8l2.8-2.8 2.8 2.8"/></g>'; }
  var SV = {
    flag: medal(['#a9d6ff', '#3d8bff', '#1a4bb0', '#1f4396', '#081638', '#ffffff', '#c3e2ff', '#5aa7ff'],
      '<rect x="15" y="11" width="2.6" height="27" rx="1.3"/><path d="M17.6 12.2c4.6-2.6 8.2 2.2 13.4-.4v11.6c-5.2 2.6-8.8-2.2-13.4.4z"/><circle cx="16.3" cy="10.8" r="2"/><path d="M17.6 18c4.6-2.6 8.2 2.2 13.4-.4" fill="none" stroke="#2a6fe0" stroke-opacity=".35" stroke-width="1.2"/>'),
    flame: medal(['#ffd98a', '#ff8a1f', '#c2310f', '#5c1608', '#1c0603', '#ffe27a', '#ff8a2a', '#e5321f'],
      '<path d="M24 9.5c1.2 5.2 8.6 8.2 8.6 15.6a8.6 8.6 0 0 1-17.2 0c0-3.4 1.6-5.6 3.6-7.6.5 2.8 1.6 4.2 3.2 4.8C21.6 17.6 21.4 13 24 9.5z"/><path d="M24 22c2.2 2.8 4.4 4.4 4.4 7.6a4.4 4.4 0 0 1-8.8 0c0-2.2 1.4-4 4.4-7.6z" fill="#fff4c9"/>'),
    book: medal(['#aaf6d0', '#25c27f', '#0d6b45', '#0f4d37', '#04170f', '#ffffff', '#b9f5d8', '#3fd69a'],
      '<path d="M9.5 15.6c4.6-2.2 9.2-2 14 1.4v18.6c-4.8-3.4-9.4-3.6-14-1.4z"/><path d="M38.5 15.6c-4.6-2.2-9.2-2-14 1.4v18.6c4.8-3.4 9.4-3.6 14-1.4z"/><path d="M24 17v18.6" fill="none" stroke="#fff" stroke-width="1.4" stroke-opacity=".9"/><g fill="none" stroke="#0e7a4f" stroke-opacity=".45" stroke-width="1.1" stroke-linecap="round"><path d="M12.5 20.5c2.6-.8 5.2-.6 8 .8M12.5 25c2.6-.8 5.2-.6 8 .8M27.5 21.3c2.8-1.4 5.4-1.6 8-.8M27.5 25.8c2.8-1.4 5.4-1.6 8-.8"/></g><path d="M34.5 8.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="#fff"/>'),
    heart: medal(['#ffc4de', '#ff4f8b', '#a3123f', '#5c1030', '#1a0410', '#ffd6e6', '#ff5c93', '#d81b60'],
      '<path d="M24 36.2l-1.9-1.7C15.6 28.7 11.6 25 11.6 20.4c0-3.8 3-6.7 6.8-6.7 2.2 0 4.3 1 5.6 2.7 1.3-1.7 3.4-2.7 5.6-2.7 3.8 0 6.8 2.9 6.8 6.7 0 4.6-4 8.3-10.5 14.1z"/><path d="M16.5 18.2c.8-1.6 2.3-2.4 4-2.3" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.6" stroke-linecap="round"/>'),
    inf: medal(['#dccbff', '#8b5cf6', '#4a1fb8', '#2d1768', '#0d0626', '#ffffff', '#d4c2ff', '#9b6bff'],
      '<path transform="translate(24 24) scale(1.5) translate(-12 -12)" d="M12 12c-2-3-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1 5.5-4s3.5-4 5.5-4a4 4 0 0 1 0 8c-2 0-3.5-1-5.5-4z" fill="none" stroke="url(#g{u})" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="24" cy="24" r="1.7" fill="#fff"/>'),
    mail: medal(['#ffe3a6', '#ffa530', '#b85c06', '#5c3309', '#1d0f02', '#fff4d6', '#ffc766', '#f59a23'],
      '<rect x="9.5" y="15" width="29" height="19" rx="3.6"/><path d="M10.5 17.8c0-1.6 1.3-2.8 2.8-2.8h21.4c1.5 0 2.8 1.2 2.8 2.8L24 27.8z" fill="#fff" fill-opacity=".38"/><path d="M10.5 17.5L24 27.5l13.5-10" fill="none" stroke="#b9650a" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round"/><circle cx="24" cy="27.6" r="3.4" fill="#e23b3b"/><circle cx="23.1" cy="26.7" r="1.1" fill="#fff" fill-opacity=".7"/>'),
    note: medal(['#ffc6e8', '#e24fa8', '#8a1363', '#4b103c', '#150311', '#ffffff', '#ffc3e8', '#ff6cc4'],
      '<path d="M16.5 17.2l15.5-3.8v6.2l-15.5 3.8z"/><rect x="15.8" y="17.2" width="2.2" height="14.6" rx="1.1"/><rect x="30" y="13.4" width="2.2" height="14.4" rx="1.1"/><ellipse cx="14.2" cy="32" rx="4.4" ry="3.4" transform="rotate(-18 14.2 32)"/><ellipse cx="28.4" cy="28.2" rx="4.4" ry="3.4" transform="rotate(-18 28.4 28.2)"/>'),
    cam: medal(['#b8ddff', '#3d8bff', '#1749b0', '#13316f', '#050f2a', '#e8f4ff', '#8bc0ff', '#3a82e0'],
      '<path d="M16.5 16.2l1.8-3.6c.3-.6.9-1 1.6-1h8.2c.7 0 1.3.4 1.6 1l1.8 3.6z"/><rect x="8.8" y="15.8" width="30.4" height="21.4" rx="5.2"/><circle cx="24" cy="26.6" r="8" fill="#0b1f45"/><circle cx="24" cy="26.6" r="6.2" fill="none" stroke="url(#g{u})" stroke-width="1.6"/><circle cx="24" cy="26.6" r="3.6" fill="#3b86ff"/><circle cx="22.5" cy="25.1" r="1.3" fill="#fff" fill-opacity=".85"/><circle cx="34.2" cy="20.2" r="1.5" fill="#ffd45a"/>'),
    mic: medal(['#ffe6a8', '#ffae2b', '#b8680a', '#5c3b09', '#1b1002', '#fff6d8', '#ffd26b', '#ff9d1f'],
      '<rect x="19" y="9.5" width="10" height="18.5" rx="5"/><g stroke="#a85f00" stroke-opacity=".4" stroke-width="1.1" stroke-linecap="round"><path d="M21.5 14.5h5M21.5 18h5M21.5 21.5h5"/></g><path d="M13.6 23.5a10.4 10.4 0 0 0 20.8 0" fill="none" stroke="url(#g{u})" stroke-width="2.6" stroke-linecap="round"/><path d="M24 34v4.2M18.8 38.4h10.4" fill="none" stroke="url(#g{u})" stroke-width="2.6" stroke-linecap="round"/>'),
    dice: medal(['#b9f8d8', '#2ecc8a', '#0b7048', '#0e4b34', '#03140d', '#ffffff', '#c4f8df', '#4fe0a0'],
      '<g transform="rotate(-12 24 24)"><rect x="12" y="12" width="24" height="24" rx="6.4"/><g fill="#0c5a3a"><circle cx="18" cy="18" r="2.1"/><circle cx="30" cy="18" r="2.1"/><circle cx="24" cy="24" r="2.1"/><circle cx="18" cy="30" r="2.1"/><circle cx="30" cy="30" r="2.1"/></g></g>'),
    pump: medal(['#ffd3a0', '#ff8a1f', '#a8420a', '#4c1d05', '#160701', '#ffd89a', '#ff8f2a', '#e3560f'],
      '<ellipse cx="17.4" cy="27.4" rx="7.4" ry="9.4"/><ellipse cx="30.6" cy="27.4" rx="7.4" ry="9.4"/><ellipse cx="24" cy="27.6" rx="7" ry="10.2"/><path d="M20.4 18.8c-1.8 5-1.8 10.8 0 16.6M27.6 18.8c1.8 5 1.8 10.8 0 16.6" fill="none" stroke="#a63d05" stroke-opacity=".4" stroke-width="1.2"/><path d="M22.6 17.6c-.2-2.6.8-4.6 3.2-5.6l1 2.2c-1.4.6-1.8 1.8-1.7 3.4z" fill="#3fae4a"/><path d="M17.8 24.4l3.2 4.4h-6.4zM30.2 24.4l3.2 4.4h-6.4z" fill="#fff0b0"/><path d="M17.4 32.2l2.1 2 1.7-2 1.7 2 1.7-2 1.7 2 2.1-2" fill="none" stroke="#fff0b0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
    snow: medal(['#e4f2ff', '#7db7ff', '#2a5fb8', '#133b7a', '#040c20', '#ffffff', '#d6ecff', '#8cc4ff'],
      '<g fill="none" stroke="url(#g{u})" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + snowArm(0) + snowArm(60) + snowArm(120) + '</g><circle cx="24" cy="24" r="2.4" fill="#fff"/>')
  };
  var CAT = [
    ['Ancienneté', [['pionnier', 'Pionnier', 'Parmi les premiers inscrits', 'flag']]],
    ['Activité', [['flamme', 'Flamme', 'Plusieurs jours de suite', 'flame'], ['studieux', 'Studieux', 'Utilise le module Étudier', 'book']]],
    ['Social', [['adore', 'Adoré·e', 'Beaucoup de likes sur le profil', 'heart'], ['inseparables', 'Inséparables', 'Deux personnes très proches', 'inf'], ['facteur', 'Facteur', 'Écrit des lettres anonymes', 'mail']]],
    ['Loisirs', [['melomane', 'Mélomane', 'Écoute de musique ensemble', 'note'], ['photographe', 'Photographe', 'Envoie des photos', 'cam'], ['voix', 'Voix d’or', 'Envoie des vocaux', 'mic'], ['joueur', 'Joueur', 'Action ou vérité', 'dice']]],
    ['Événements (temporaires)', [['citrouille', 'Citrouille', 'Halloween', 'pump'], ['flocon', 'Flocon', 'Noël et hiver', 'snow']]]
  ];
  var KNOWN = {}; CAT.forEach(function (c) { c[1].forEach(function (b) { KNOWN[b[0]] = 1; }); });
  var bgN = 0;
  function badgeSvg(n) { bgN++; return '<svg viewBox="0 0 48 48" aria-hidden="true">' + (SV[n] || '').replace(/\{u\}/g, bgN) + '</svg>'; }

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
    try { if (u.created && new Date(u.created) < new Date(PIONEER_BEFORE)) got.pionnier = 1; } catch (e) {}
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
    /* badge « Facteur » : les Lettres ne sont pas encore converties vers Supabase */
    return Object.keys(got);
  }
  function publishMine(uid, ids) {
    ids = ids.slice().sort();
    var key = 'uandi-aw-' + uid, prev = ''; try { prev = localStorage.getItem(key) || ''; } catch (e) {}
    if (prev === ids.join(',')) return;
    sb().from('profiles').update({ awards: ids.length ? ids : null }).eq('id', uid)
      .then(function (r) { if (!r.error) { try { localStorage.setItem(key, ids.join(',')); } catch (e) {} } }).catch(function () {});
  }

  /* ====== Chargement d’un profil ====== */
  function frOr(a, b) { return 'and(requester_id.eq.' + a + ',addressee_id.eq.' + b + '),and(requester_id.eq.' + b + ',addressee_id.eq.' + a + ')'; }
  function frGet(uid) {
    return sb().from('friendships').select('requester_id,addressee_id,status').or(frOr(me().uid, uid)).limit(1)
      .then(function (r) { var d = r && r.data && r.data[0]; return d ? { status: d.status, from: d.requester_id } : null; }).catch(function () { return null; });
  }
  async function friendsOf(uid) {
    var out = {}, ok = false;
    try {
      var r = await sb().from('friendships').select('requester_id,addressee_id,status,created_at').or('requester_id.eq.' + uid + ',addressee_id.eq.' + uid).limit(300);
      ck(r);
      (r.data || []).forEach(function (v) {
        if (v.status !== 'accepted') return;
        var o = v.requester_id === uid ? v.addressee_id : v.requester_id;
        if (o) out[o] = { uid: o, name: '', ats: Date.parse(v.created_at) || 0 };
      });
      ok = true;
    } catch (e) {}
    var u = me();
    if (u && u.uid === uid) {
      try {
        var m = ck(await sb().from('conversation_members').select('conversation_id').eq('user_id', uid));
        var ids = (m.data || []).map(function (x) { return x.conversation_id; });
        if (ids.length) {
          var cs = ck(await sb().from('conversations').select('id,invite_status').in('id', ids).neq('kind', 'group'));
          var dm = (cs.data || []).filter(function (c) { return !c.invite_status; }).map(function (c) { return c.id; });
          if (dm.length) {
            var mm = ck(await sb().from('conversation_members').select('user_id').in('conversation_id', dm).neq('user_id', uid));
            (mm.data || []).forEach(function (x) { if (!out[x.user_id]) out[x.user_id] = { uid: x.user_id, name: '', ats: 0 }; });
          }
        }
        ok = true;
      } catch (e) {}
    }
    if (!ok) return null;
    var list = Object.keys(out).map(function (k) { return out[k]; });
    try { var nm = await namesOf(list.map(function (f) { return f.uid; })); list.forEach(function (f) { f.name = nm[f.uid] || 'Inconnu'; }); } catch (e) { list.forEach(function (f) { f.name = 'Inconnu'; }); }
    return list;
  }
  var VISL = { public: 'Tout le monde', friends: 'Mes amis', me: 'Moi uniquement' };
  /* amis d’UNE AUTRE personne : fonction serveur friends_of, qui respecte sa confidentialité */
  async function friendListOf(uid) {
    try {
      var r = await sb().rpc('friends_of', { p_uid: uid }); ck(r);
      var v = r.data || {};
      if (v.state === 'locked') return { list: null, state: 'locked' };
      return { list: (Array.isArray(v.list) ? v.list : []).filter(function (x) { return x && typeof x.uid === 'string'; }).map(function (x) { return { uid: x.uid, name: String(x.name || 'Inconnu'), ats: +x.ats || 0 }; }), state: 'ok' };
    } catch (e) { return { list: null, state: 'none' }; }
  }
  function myVis() {
    var u = me();
    return sb().from('profiles').select('friends_vis').eq('id', u.uid).maybeSingle()
      .then(function (r) { var v = r && r.data ? r.data.friends_vis : ''; return v === 'public' || v === 'me' ? v : 'friends'; }).catch(function () { return 'friends'; });
  }
  /* la liste d'amis n'est plus publiée : friends_of la calcule en direct */
  async function publishFriends() {}
  async function build(uid, name) {
    var u = me(), self = !!u && u.uid === uid;
    var r = await Promise.all([
      getPres(uid).catch(function () { return {}; }),
      self ? friendsOf(uid).then(function (l) { return { list: l, state: l ? 'ok' : 'none' }; }) : friendListOf(uid),
      self ? Promise.resolve(null) : friendsOf(u.uid),
      Promise.resolve(0),   /* « j'aime » de profil : pas encore converti */
      self ? Promise.resolve(null) : frGet(uid),
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
      '.pf-cover video,.pf-cover img.pf-cimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
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
      '.pf-b svg{width:58px;height:58px;display:block;margin:0 auto 8px;overflow:visible}.pf-b:not(.off) svg{filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))}',
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
    var p = P.pres, c = mk('div', 'pf-cover'), u = cldOk(p.coverU) ? p.coverU : '', ph = cldOk(p.coverP) ? p.coverP : '';
    if (COVERS[p.coverC]) c.style.background = COVERS[p.coverC];
    if (ph) {
      var im = document.createElement('img'); im.className = 'pf-cimg'; im.alt = ''; im.decoding = 'async'; im.src = coverImg(ph);
      im.addEventListener('error', function () { if (!im.dataset.fb) { im.dataset.fb = '1'; im.src = ph; } });
      c.appendChild(im);
    } else if (u) {
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
    /* réglages choisis par le propriétaire (champs bpill / bhide / bcol de sa fiche presence), comme partout dans l’appli */
    var cols = ['rose', 'rouge', 'orange', 'or', 'vert', 'turquoise', 'violet', 'indigo', 'noir', 'argent', 'coucher', 'ocean'];
    var b = mk('span', 'ubadge st ' + k + (p.bpill === true ? ' pill' : '') + (p.bhide === true ? ' bh' : ''));
    if (cols.indexOf(p.bcol) > -1) b.dataset.bc = p.bcol;
    b.style.setProperty('--sd', '-' + (Date.now() % 6000) + 'ms');
    b.title = k === 'fnd' ? 'Fondateur de X’enify' : k === 'ast' ? 'Assistant de X’enify' : 'Compte certifié'; b.setAttribute('aria-label', b.title);
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon class="sl" stroke-width="1.6" stroke-linejoin="round" points="12.00,1.80 14.25,3.60 17.10,3.17 18.15,5.85 20.83,6.90 20.40,9.75 22.20,12.00 20.40,14.25 20.83,17.10 18.15,18.15 17.10,20.83 14.25,20.40 12.00,22.20 9.75,20.40 6.90,20.83 5.85,18.15 3.17,17.10 3.60,14.25 1.80,12.00 3.60,9.75 3.17,6.90 5.85,5.85 6.90,3.17 9.75,3.60"/><path class="ck" d="M7 12.6l3.3 3.3L17 8.9" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="bt">' + (k === 'fnd' ? 'Fondateur' : k === 'ast' ? 'Assistant' : 'Certifié') + '</span>';
    return b;
  }
  function frAction(P, kind) {
    var u = me(), p;
    if (kind === 'add') p = sb().from('friendships').insert({ requester_id: u.uid, addressee_id: P.uid, status: 'pending' });
    else if (kind === 'acc') p = sb().from('friendships').update({ status: 'accepted' }).eq('requester_id', P.uid).eq('addressee_id', u.uid);
    else { if (kind === 'rm' && !confirm('Retirer ' + cap(P.disp) + ' de tes amis ?')) return; p = sb().from('friendships').delete().or(frOr(u.uid, P.uid)); }
    Promise.resolve(p).then(ck).then(reload).catch(function () { msg('Action impossible (connexion ou règles Supabase « friendships »).', true); });
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
    if (online) { var pd = mk('i', 'pf-dot'); var heart = P.self ? (function () { try { return localStorage.getItem('xenify-statut-style') === 'heart'; } catch (e) { return false; } })() : p.xst === 'heart'; if (heart) pd.setAttribute('data-xs', 'heart'); avw.appendChild(pd); }
    head.appendChild(avw);
    /* le badge prend l’ancienne place du nom (à droite de l’avatar) ; le nom passe sous l’avatar, sur toute la largeur */
    var nm = mk('h2', 'pf-name'); nm.appendChild(document.createTextNode(cap(P.disp)));
    var rb = roleBadge(p);
    if (rb) { var bw = mk('div', 'pf-bdg'); bw.appendChild(rb); head.appendChild(bw); }
    head.appendChild(mk('p', 'pf-sub', '@' + P.uname + ' · ' + (online ? 'En ligne' : 'Hors ligne')));
    head.appendChild(nm);
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
    if (ico === 'dotOn') { i.appendChild(mk('i', 'pf-xon')); } else { i.innerHTML = svg(ico, 20); } if (ico.indexOf('dot') !== 0) i.style.color = 'var(--accent)';
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
    sb().from('profiles').select('photo').eq('id', uid).maybeSingle().then(function (r) {
      var u = r && r.data ? r.data.photo : '';
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
    /* À la une : albums avec titre (stories gardées depuis l'archive) */
    if (window.UIStories && UIStories.albums && (P.self || P.isFriend)) {
      var hs = mk('div', 'pf-sec'); hs.hidden = true; body.appendChild(hs);
      UIStories.albums(P.uid).then(function (al) {
        if (!hs.parentNode || (!al.length && !P.self)) return;
        var hh = mk('div'); hh.style.cssText = 'display:flex;align-items:center;gap:12px';
        var h3 = mk('h3', 'pf-h', 'À la une'); h3.style.flex = '1'; hh.appendChild(h3);
        function lk(t, fn) { var x = mk('button', '', t); x.type = 'button'; x.style.cssText = 'border:0;background:none;color:var(--accent);font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;padding:4px 0'; x.addEventListener('click', fn); return x; }
        if (P.self) { hh.appendChild(lk('Archive', function () { UIStories.archive(); })); if (al.length) hh.appendChild(lk('Modifier', function () { UIStories.manage(); })); }
        hs.appendChild(hh);
        var row = mk('div'); row.style.cssText = 'display:flex;gap:14px;overflow-x:auto;padding:4px 2px 6px;scrollbar-width:none';
        function item(label, inner, border, fn) {
          var b = mk('button'); b.type = 'button'; b.setAttribute('aria-label', label);
          b.style.cssText = 'flex:none;width:68px;border:0;background:none;color:inherit;font:inherit;font-size:.72rem;text-align:center;cursor:pointer;padding:0';
          var c = mk('span'); c.style.cssText = 'display:block;width:64px;height:64px;border-radius:50%;margin:0 auto 4px;padding:3px;box-sizing:border-box;border:' + border;
          c.appendChild(inner); b.appendChild(c);
          var l = mk('span', '', label); l.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; b.appendChild(l);
          b.addEventListener('click', fn); return b;
        }
        if (P.self) { var pl = mk('span', '', '+'); pl.style.cssText = 'display:grid;place-items:center;width:100%;height:100%;border-radius:50%;font-size:1.6rem;color:var(--muted)'; row.appendChild(item('Nouveau', pl, '2px dashed var(--line,rgba(255,255,255,.35))', function () { UIStories.archive(); })); }
        al.forEach(function (a) {
          var cv = mk('span'); cv.style.cssText = 'display:block;width:100%;height:100%;border-radius:50%;background:' + UIStories.thumb(a.cover || a.list[0]);
          row.appendChild(item(a.title, cv, '2px solid var(--accent)', function () { UIStories.openList(P.uid, P.disp, a.list, 0, a.title); }));
        });
        hs.appendChild(row); hs.hidden = false;
      });
    }
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
        sb().from('profiles').select('id').eq('username', nm).maybeSingle().then(function (r) {
          if (r && r.data && r.data.id) openProfile(r.data.id, nm);
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
    /* 3) après modification : on rafraîchit */
    document.addEventListener('ui-profile-saved', function () { var u = me(); if (dlg && dlg.open && u && S.uid === u.uid) reload(); });
    /* 4) calcul et publication des badges à l’ouverture de l’appli */
    var started = null;
    sb().auth.onAuthStateChange(function (ev, session) {
      CUR = mkCur(session && session.user);
      var u = CUR; if (!u || started === u.uid) return;
      started = u.uid;
      setTimeout(function () { evalMine(u).then(function (ids) { publishMine(u.uid, ids); }).catch(function () {}); }, 6000);
    });
    sb().auth.getSession().then(function (r) { if (!CUR && r && r.data && r.data.session) CUR = mkCur(r.data.session.user); }).catch(function () {});
  }
  (function wait(n) {
    if (sb() && $('userCard')) { try { start(); } catch (e) { console.warn('Profil :', e); } return; }
    if (n < 400) setTimeout(function () { wait(n + 1); }, 300);
  })(0);

  window.UIProfile = { open: openProfile, COVERS: COVERS, BASE: BASE, LOOP: LOOP, coverSrc: coverSrc, coverPoster: coverPoster, thumb: thumb, catalog: CAT, friendsOf: friendsOf, myUname: myUname, getPres: getPres, myVis: myVis, sb: sb, me: me };
})();
