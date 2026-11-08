/* E'cho — script.js : toute la logique de l'appli (démarrage, appli, jeux, modules, assistant) */


/* E'cho — js/boot/splash.js
   Écran de démarrage : le retire dès que l’appli est affichée */
(function () {
  var t0 = Date.now();
  function done() { var s = document.getElementById('splash'); if (!s) return; s.style.opacity = '0'; setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 300); }
  var iv = setInterval(function () {
    function vis(id) { var n = document.getElementById(id); return n && !n.hidden; }
    if (vis('login') || vis('app') || vis('apWait') || document.getElementById('blank-msg')) { clearInterval(iv); done(); return; }
    var m = document.getElementById('splashMsg');
    if (m && !document.getElementById('splashRetry') && Date.now() - t0 > 6000) m.textContent = 'Connexion lente… un instant';
  }, 150);
})();


/* ===== Appli principale (28 parties, une seule fermeture) ===== */
window.__uandiApp = function () {

/* E'cho — js/app/01-base.js
   Config, constantes, utilitaires, envoi de fichiers (Cloudinary)
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  var CFG = window.APP_CONFIG;
  var HEART = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  var NAME_RE = /^[a-z0-9._-]{3,20}$/;

  var $ = function (s) { return document.querySelector(s); };
  var loginEl = $('#login'), appEl = $('#app'), viewList = $('#viewList'), viewChat = $('#viewChat');
  var authForm = $('#authForm'), authBtn = $('#authBtn'), authErr = $('#authErr');
  var tabLogin = $('#tabLogin'), tabSignup = $('#tabSignup');
  var logEl = $('#log'), ta = $('#msg'), sendBtn = $('#send'), form = $('#composer');
  var jumpBtn = $('#jump'), errEl = $('#err');
  var chatsEl = $('#chats'), newErr = $('#newErr');
  var HOLD = { shown: null, t0: 0, down: false, slide: false, hot: null, id: null }, RXSIG = {};
  var statusEl = $('#status'), statusText = $('#statusText');
  var BASE_TITLE = document.title;

  function setAuthErr(t) { authErr.textContent = t; authErr.hidden = !t; }

  var configured = CFG && CFG.firebase && CFG.firebase.apiKey && CFG.firebase.apiKey.indexOf('COLLE') !== 0;
  if (!configured) {
    loginEl.hidden = false;
    authBtn.disabled = true;
    setAuthErr('Configuration manquante : ouvre index.html et remplace les valeurs « COLLE_ICI » par celles de ton projet Firebase (voir LISEZMOI.md).');
    return;
  }

  firebase.initializeApp(CFG.firebase);
  var auth = firebase.auth();
  var fs = firebase.firestore();
  var IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!IS_IOS) { try { fs.enablePersistence({ synchronizeTabs: true }).catch(function () {}); } catch (e) {} }

  var state = {
    me: null, username: '', nick: '', mode: 'login', view: 'list',
    chats: [], chatsById: {}, chatsLoaded: false,
    chat: null, msgs: [], loaded: false, dead: null,
    open: new Set(), confirm: null, picker: null, editing: null, editDraft: '', otherPres: null, stick: true, unread: 0
  };
  var unsubChats = null, unsubMsgs = null, unsubPres = null, hbTimer = null, stTimer = null;
  var busy = new Set();

  /* ---------- utilitaires ---------- */
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) {}
    return null;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function chatOf(id) { return state.chats.filter(function (x) { return x.id === id; })[0] || null; }
  function nickOf(c, uid) { return (c && c.nicks && typeof c.nicks[uid] === 'string' && c.nicks[uid]) || ''; }
  function myName() { return state.nick || state.username; }
  /* ---------- Cloudinary : vocaux, musiques et photos sont envoy\u00e9s l\u00e0-bas, Firestore ne garde que le lien ---------- */
  var CLD_NAME = 'hjnf54dr', CLD_PRESET = 'uandi_upload', CLD_BASE = 'https://res.cloudinary.com/' + CLD_NAME + '/';
  /* 2e compte Cloudinary (secours si le 1er est plein ou refuse) */
  var CLD2_NAME = 't5vq1eap', CLD2_BASE = 'https://res.cloudinary.com/' + CLD2_NAME + '/';
  /* ---------- ImageKit (stockage principal) ----------
     IK_URL      : « URL endpoint » de ton compte ImageKit (Developer options)
     IK_PUBLIC   : clé publique ImageKit (la clé privée ne va JAMAIS ici : elle reste dans le Worker)
     IK_AUTH     : adresse du Worker qui signe les envois (voir ik-worker.js)
     Tant que ces 3 valeurs contiennent « COLLE_ICI », l'app continue d'utiliser Cloudinary. */
  var IK_URL = 'https://ik.imagekit.io/Xillaem/';
  var IK_PUBLIC = 'public_5aVvnN22gAj1kaYd3BXOVc1CP2o=';
  var IK_AUTH = 'https://u-ifichier.lyamsr-14-02.workers.dev/auth';
  var IK_FOLDER = '/uandi';
  var IK_ON = (IK_URL + IK_PUBLIC + IK_AUTH).indexOf('COLLE_ICI') < 0;
  /* un lien est « du cloud » s'il vient d'ImageKit ou de l'ancien Cloudinary (les anciens messages restent lisibles) */
  function isCld(u) { return typeof u === 'string' && (u.indexOf(CLD_BASE) === 0 || u.indexOf(CLD2_BASE) === 0 || (IK_ON && u.indexOf(IK_URL) === 0)); }
  /* Si les règles Firestore refusent le lien, l'app renvoie automatiquement la version intégrée (data:). */
  var CLD_MEDIA = true;
  function mediaUp(x) { return CLD_MEDIA ? cloudUp(x) : Promise.resolve(null); }
  var CLD_ERR = '';
  var IK_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'application/json': 'json', 'application/pdf': 'pdf' };
  async function ikUp(x, name) {
    var size = x && (x.size || x.length) || 0;
    var ms = Math.max(30000, Math.round(size / 25000) * 1000);
    var blob = (typeof x === 'string') ? await (await fetch(x)).blob() : x;
    var fname = String(name || x.name || '').replace(/[^\w.\-]+/g, '_');
    if (!fname) fname = 'f' + Date.now().toString(36) + '.' + (IK_EXT[(blob.type || '').split(';')[0]] || 'bin');
    for (var att = 0; att < 3; att++) {
      var ctl = window.AbortController ? new AbortController() : null, tm = ctl ? setTimeout(function () { ctl.abort(); }, ms) : 0;
      try {
        var ra = await fetch(IK_AUTH, { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
        var a = await ra.json();
        if (!a || !a.token || !a.signature || !a.expire) { CLD_ERR = 'signature'; clearTimeout(tm); break; }
        var fd = new FormData();
        fd.append('file', blob, fname);
        fd.append('fileName', fname);
        fd.append('publicKey', IK_PUBLIC);
        fd.append('signature', a.signature);
        fd.append('expire', String(a.expire));
        fd.append('token', a.token);
        fd.append('folder', IK_FOLDER);
        fd.append('useUniqueFileName', 'true');
        var r = await fetch('https://upload.imagekit.io/api/v1/files/upload', { method: 'POST', body: fd, signal: ctl ? ctl.signal : undefined });
        var j = await r.json();
        clearTimeout(tm);
        if (j && typeof j.url === 'string' && j.url.indexOf(IK_URL) === 0) return j.url;
        CLD_ERR = (j && j.message) || ('HTTP ' + r.status);
        if (r.status >= 400 && r.status < 500) break;
      } catch (e) {
        clearTimeout(tm);
        CLD_ERR = (e && e.name === 'AbortError') ? 'délai dépassé' : 'réseau';
      }
      if (att < 2) await new Promise(function (ok) { setTimeout(ok, 1200 * (att + 1)); });
    }
    return null;
  }
  async function cldTry(cname, cbase, dataUrl, kind) {
    var size = dataUrl && (dataUrl.size || dataUrl.length) || 0;
    var ms = Math.max(30000, Math.round(size / 25000) * 1000);
    for (var att = 0; att < 3; att++) {
      var ctl = window.AbortController ? new AbortController() : null, tm = ctl ? setTimeout(function () { ctl.abort(); }, ms) : 0;
      try {
        var fd = new FormData();
        fd.append('file', dataUrl);
        fd.append('upload_preset', CLD_PRESET);
        var r = await fetch('https://api.cloudinary.com/v1_1/' + cname + '/' + (kind || 'auto') + '/upload', { method: 'POST', body: fd, signal: ctl ? ctl.signal : undefined });
        var j = await r.json();
        clearTimeout(tm);
        if (j && typeof j.secure_url === 'string' && j.secure_url.indexOf(cbase) === 0) return j.secure_url;
        CLD_ERR = (j && j.error && j.error.message) || ('HTTP ' + r.status);
        if (r.status >= 400 && r.status < 500) break;   /* refus définitif : inutile de réessayer */
      } catch (e) {
        clearTimeout(tm);
        CLD_ERR = (e && e.name === 'AbortError') ? 'délai dépassé' : 'réseau';
      }
      if (att < 2) await new Promise(function (ok) { setTimeout(ok, 1200 * (att + 1)); });
    }
    return null;
  }
  /* Cloudinary : compte 1, puis compte 2 en secours */
  async function cldOnly(dataUrl, kind) {
    CLD_ERR = '';
    var u = await cldTry(CLD_NAME, CLD_BASE, dataUrl, kind);
    if (u) return u;
    return cldTry(CLD2_NAME, CLD2_BASE, dataUrl, kind);
  }
  /* envoi : ImageKit d'abord, puis Cloudinary 1, puis Cloudinary 2 */
  async function cloudUp(x, kind, name) {
    CLD_ERR = '';
    if (IK_ON) {
      var u = await ikUp(x, name);
      if (u) return u;
    }
    return cldOnly(x, kind);
  }
  window.uiCloudUp = cloudUp; window.uiIsCld = isCld;
  var SYS = '\u2063';
  function isSys(m) { return !!m && typeof m.text === 'string' && m.text.charAt(0) === SYS; }
  function cap(n) { n = String(n || ''); return n ? n.charAt(0).toUpperCase() + n.slice(1) : '?'; }
  function paintAvatar(node, name) {
    var h = 0, s = String(name || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    node.style.background = 'hsl(' + h + ' 38% 42%)';
    node.textContent = cap(s).charAt(0);
  }
  var timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  var dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  var shortFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
  function dayLabel(ts) {
    var d = new Date(ts), now = new Date();
    var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Aujourd’hui';
    if (d.toDateString() === y.toDateString()) return 'Hier';
    return dayFmt.format(d);
  }
  function listTime(ts) {
    var d = new Date(ts), now = new Date();
    var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return timeFmt.format(d);
    if (d.toDateString() === y.toDateString()) return 'Hier';
    return shortFmt.format(d);
  }
  function nearBottom() { return logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 90; }
  var SCROLL_WARM = false;
  function scrollBottom() {
    var d = logEl.scrollHeight - logEl.clientHeight - logEl.scrollTop;
    var rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (SCROLL_WARM && !rm && d > 2 && d < 700 && logEl.scrollTo) logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
    else logEl.scrollTop = logEl.scrollHeight;
    jumpBtn.hidden = true;
  }
  function showErr(t) { errEl.textContent = t; errEl.hidden = !t; }
  var MIC_HELP = 'Micro bloqué. Si Android affiche « Ce site ne peut pas demander votre autorisation », ferme les bulles et fenêtres flottantes (Messenger, enregistreur d’écran, filtre de lumière bleue, fenêtre flottante du navigateur), puis réessaie.';
  function getMic(constraints) {
    return navigator.mediaDevices.getUserMedia(constraints).catch(function (e) {
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError' || e.name === 'AbortError')) {
        return new Promise(function (r) { setTimeout(r, 700); }).then(function () { return navigator.mediaDevices.getUserMedia(constraints); });
      }
      throw e;
    });
  }
  function showNewErr(t) { newErr.textContent = t; newErr.hidden = !t; }
  function likedBy(m) {
    var l = m.likes;
    if (!l || typeof l !== 'object') return [];
    return Object.keys(l).filter(function (k) { return l[k] === true; });
  }
  function SV() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function chatIdFor(a, b) { return [a, b].sort().join('_'); }




/* E'cho — js/app/02-connexion-presence.js
   Connexion / inscription, présence
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- connexion / inscription ---------- */
  /* ---------- limite des essais de mot de passe (par appareil) ---------- */
  function lkGet(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function lkSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function lkLeft(name) {
    var now = Date.now(), r = 0;
    ['uandi-lk-' + name, 'uandi-lk-all'].forEach(function (k) { var o = lkGet(k); if (o.until && o.until > now) r = Math.max(r, o.until - now); });
    return r;
  }
  function lkFail(name) {
    var now = Date.now();
    [['uandi-lk-' + name, 5], ['uandi-lk-all', 12]].forEach(function (a) {
      var o = lkGet(a[0]); if (!o.t || now - o.t > 24 * 3600 * 1000) o = { n: 0 };
      o.n++; o.t = now;
      if (o.n >= a[1]) o.until = now + Math.min(30, Math.pow(2, o.n - a[1])) * 60000;
      lkSet(a[0], o);
    });
  }
  function lkOk(name) { try { localStorage.removeItem('uandi-lk-' + name); localStorage.removeItem('uandi-lk-all'); } catch (e) {} }
  function lkText(ms) { var m = Math.ceil(ms / 60000); return m <= 1 ? '1 minute' : m + ' minutes'; }

  function setMode(mode) {
    state.mode = mode;
    var signup = mode === 'signup';
    tabLogin.setAttribute('aria-selected', signup ? 'false' : 'true');
    tabSignup.setAttribute('aria-selected', signup ? 'true' : 'false');
    $('#p2').hidden = !signup;
    $('#p2Label').hidden = !signup;
    $('#uHint').hidden = !signup;
    $('#p').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    authBtn.textContent = signup ? 'Créer mon compte' : 'Entrer';
    setAuthErr('');
  }
  tabLogin.addEventListener('click', function () { setMode('login'); });
  tabSignup.addEventListener('click', function () { setMode('signup'); });

  authForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var name = $('#u').value.trim().toLowerCase().replace(/\s+/g, '');
    var pass = $('#p').value;
    var signup = state.mode === 'signup';
    setAuthErr('');
    if (signup) {
      if (!NAME_RE.test(name)) { setAuthErr('Nom d’utilisateur : 3 à 20 caractères, avec lettres, chiffres, point, tiret ou souligné.'); return; }
      if (pass.length < 6) { setAuthErr('Le mot de passe doit faire au moins 6 caractères.'); return; }
      if (pass !== $('#p2').value) { setAuthErr('Les deux mots de passe ne sont pas identiques.'); return; }
    } else {
      if (!name || !pass) return;
      var wait = lkLeft(name);
      if (wait > 0) { setAuthErr('Trop d’essais. Réessaie dans ' + lkText(wait) + '.'); return; }
    }

    authBtn.disabled = true;
    var email = name + '@' + CFG.emailDomain;
    apNew = signup;
    var p = signup ? auth.createUserWithEmailAndPassword(email, pass) : auth.signInWithEmailAndPassword(email, pass).then(function (cr) { lkOk(name); return cr; });
    p.catch(function (e) {
      var c = e && e.code;
      if (!signup && /^auth\/(wrong-password|invalid-credential|invalid-login-credentials|user-not-found)$/.test(c || '')) {
        lkFail(name);
        var w = lkLeft(name);
        if (w > 0) { setAuthErr('Trop d’essais. Réessaie dans ' + lkText(w) + '.'); return; }
      }
      setAuthErr(
        c === 'auth/email-already-in-use' ? 'Ce nom d’utilisateur est déjà pris.' :
        c === 'auth/weak-password' ? 'Le mot de passe doit faire au moins 6 caractères.' :
        c === 'auth/too-many-requests' ? 'Trop d’essais. Réessaie dans quelques minutes.' :
        c === 'auth/network-request-failed' ? 'Pas de connexion internet.' :
        c === 'auth/operation-not-allowed' ? 'La connexion par e-mail et mot de passe n’est pas activée dans Firebase.' :
        signup ? 'Le compte n’a pas pu être créé.' : 'Nom d’utilisateur ou mot de passe incorrect.');
    }).then(function () { authBtn.disabled = false; });
  });

  /* ---------- présence ---------- */
  var typingChat = null, typingTimer = null, lastTypingWrite = 0;
  function writePresence(extra) {
    if (!state.me || state.deleting) return;
    var data = { name: myName(), seen: hideOn() ? 0 : Date.now() };
    for (var k in extra) data[k] = extra[k];
    fs.collection('presence').doc(state.me).set(data, { merge: true }).catch(function () {});
  }
  function beat() { if (!document.hidden) writePresence({ typingIn: typingChat, typingAt: Date.now() }); }
  function setTyping(v) {
    if (!state.me || !state.chat) return;
    var now = Date.now(), id = state.chat.id;
    if (v) {
      clearTimeout(typingTimer);
      typingTimer = setTimeout(function () { setTyping(false); }, 3000);
      if (typingChat === id && now - lastTypingWrite < 4000) return;
      typingChat = id;
    } else {
      if (!typingChat) return;
      typingChat = null;
    }
    lastTypingWrite = now;
    writePresence({ typingIn: typingChat, typingAt: now });
  }
  function renderStatus() {
    if (!state.chat) return;
    if (state.chat.group) {
      var gcd = chatOf(state.chat.id);
      statusEl.classList.remove('on');
      statusText.textContent = ((gcd && gcd.members) ? gcd.members.length : '') + ' membres';
      document.getElementById('typingLine').hidden = true;
      return;
    }
    var p = state.otherPres, now = Date.now();
    var online = p && now - (p.seen || 0) < 150000;
    statusEl.classList.toggle('on', !!online);
    if (!online) { statusText.textContent = 'Hors ligne'; document.getElementById('typingLine').hidden = true; return; }
    var isTyping = p.typingIn === state.chat.id && now - (p.typingAt || 0) < 8000;
    statusText.textContent = isTyping ? 'écrit…' : 'En ligne';
    var tl = document.getElementById('typingLine');
    if (isTyping) {
      if (!tl.dataset.on) {
        tl.innerHTML = '<span class="tbub" aria-hidden="true"><i></i><i></i><i></i></span><span class="tnm"></span>';
        tl.dataset.on = '1';
      }
      tl.querySelector('.tnm').textContent = cap(state.chat.name) + ' écrit…';
      tl.hidden = false;
    } else { tl.hidden = true; delete tl.dataset.on; }
  }




/* E'cho — js/app/03-liste-discussions.js
   Liste des discussions
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- liste des discussions ---------- */
  function unreadCount() {
    return state.chats.filter(isUnread).length;
  }
  function isUnread(c) {
    var seen = (c.seen && c.seen[state.me]) || 0;
    return c.lastUid && c.lastUid !== state.me && c.lastTs > seen;
  }
  function updateTitle() {
    var n = document.hidden ? unreadCount() : 0;
    document.title = n > 0 ? '(' + n + ') ' + BASE_TITLE : BASE_TITLE;
  }

  var rlRaf = 0;
  function renderList() {
    if (rlRaf) return;
    rlRaf = requestAnimationFrame(function () { rlRaf = 0; renderListNow(); });
  }
  function renderListNow() {
    $('#meName').textContent = (state.nick ? state.nick + ' · ' : '') + '@' + state.username;
    withBadge($('#meName'), state.me);
    updateMyNote();
    frBadge();
    onSig = onlineSig();
    var nUn = state.chats.filter(function (c) { return !inviteIn(c) && isUnread(c); }).length;
    $('#unreadN').textContent = nUn; $('#unreadN').hidden = !nUn;
    $('#unreadBtn').setAttribute('aria-pressed', state.onlyUnread ? 'true' : 'false');
    chatsEl.replaceChildren();
    var q = ($('#search').value || '').trim().toLowerCase();
    var sorted = state.chats.slice().sort(function (a, b) { return (b.lastTs || 0) - (a.lastTs || 0); });
    sorted = sorted.filter(function (c) { return isPinned(c.id); }).concat(sorted.filter(function (c) { return !isPinned(c.id); }));
    var hid = hiddenChats();
    sorted = sorted.filter(function (c) { return !(hid[c.id] && (c.lastTs || 0) <= hid[c.id]) && !inviteIn(c); });
    if (state.onlyUnread) sorted = sorted.filter(function (c) { return isUnread(c); });
    if (q) sorted = sorted.filter(function (c) {
      if (c.group) return String(c.title || '').toLowerCase().indexOf(q) !== -1;
      var o = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      return String(nickOf(c, o) || (c.names && c.names[o]) || '').toLowerCase().indexOf(q) !== -1 || String((c.names && c.names[o]) || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!state.chatsLoaded) { chatsEl.appendChild(el('li', 'loading', 'Chargement des discussions…')); return; }
    if (!sorted.length && state.onlyUnread) { chatsEl.appendChild(el('li', 'empty', 'Aucun message non lu.')); return; }
    if (!sorted.length) {
      var li = el('li', 'empty');
      li.appendChild(el('strong', '', 'Aucune discussion'));
      li.appendChild(document.createTextNode('Tape le nom d’utilisateur de quelqu’un dans le champ ci-dessus pour lui écrire.'));
      chatsEl.appendChild(li);
      return;
    }
    sorted.forEach(function (c) {
      if (c.group) {
        var gb = el('button', 'chatrow' + (isUnread(c) ? ' unread' : '') + (isPinned(c.id) ? ' pinned' : '')); gb.type = 'button'; gb.dataset.gid = c.id;
        var gav = el('span', 'avatar'); paintGroupAv(gav, c);
        var gi = el('span'); gi.appendChild(el('span', 'nm', c.title || 'Groupe'));
        var who = c.lastUid === state.me ? 'Toi : ' : ((nickOf(c, c.lastUid) || (c.names && c.names[c.lastUid])) ? cap(nickOf(c, c.lastUid) || c.names[c.lastUid]) + ' : ' : '');
        gi.appendChild(el('span', 'pv', who + (c.lastText || '')));
        var gs = el('span', 'side'); gs.appendChild(el('span', '', c.lastTs ? listTime(c.lastTs) : ''));
        if (isUnread(c)) gs.appendChild(el('span', 'pip'));
        gb.appendChild(gav); gb.appendChild(gi); gb.appendChild(gs);
        var gli = el('li'); gli.appendChild(gb); chatsEl.appendChild(gli);
        return;
      }
      var other = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      var name = nickOf(c, other) || (c.names && c.names[other]) || 'Inconnu';
      var li = el('li');
      var b = el('button', 'chatrow' + (isUnread(c) ? ' unread' : '') + (isPinned(c.id) ? ' pinned' : ''));
      b.type = 'button';
      b.dataset.uid = other;
      b.dataset.name = name;
      var av = el('span', 'avatar' + ringClass(other)); paintPhoto(av, other, name); loadPhoto(other);
      var info = el('span');
      info.appendChild(withBadge(el('span', 'nm', cap(name)), other));
      info.appendChild(el('span', 'pv', (c.lastUid === state.me ? 'Toi : ' : '') + (c.lastText || '')));
      var side = el('span', 'side');
      side.appendChild(el('span', '', c.lastTs ? listTime(c.lastTs) : ''));
      if (isUnread(c)) side.appendChild(el('span', 'pip'));
      var avw = el('span', 'avw'); avw.appendChild(av); if (isOnline(other)) avw.appendChild(el('i', 'ondot'));
      b.appendChild(avw); b.appendChild(info); b.appendChild(side);
      li.appendChild(b);
      chatsEl.appendChild(li);
    });
  }

  $('#search').addEventListener('input', function () { if (state.view === 'list') renderList(); });

  chatsEl.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.chatrow');
    if (!b) return;
    if (b.dataset.gid) { var gcl = chatOf(b.dataset.gid); if (gcl) openChat('', gcl.title || 'Groupe', gcl); return; }
    if (ev.target.closest('.avatar')) { avatarTap(b.dataset.uid, b.dataset.name); return; }
    openChat(b.dataset.uid, b.dataset.name);
  });

  $('#newChat').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var name = $('#who').value.trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
    showNewErr('');
    if (!name) return;
    if (name === state.username) { showNewErr('C’est ton propre nom d’utilisateur.'); return; }
    if (!NAME_RE.test(name)) { showNewErr('Ce nom d’utilisateur n’est pas valide.'); return; }
    try {
      var snap = await fs.collection('usernames').doc(name).get();
      if (!snap.exists) { showNewErr('Aucun utilisateur ne s’appelle « ' + name + ' ».'); return; }
      var uid = snap.data().uid;
      if (uid === state.me) { showNewErr('C’est ton propre nom d’utilisateur.'); return; }
      $('#who').value = ''; $('#newChat').hidden = true;
      openUserCard(uid, name);
    } catch (e) {
      showNewErr('Recherche impossible. Vérifie ta connexion et les règles Firestore.');
    }
  });




/* E'cho — js/app/04-amis.js
   Amis, demandes, invitations par message
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- amis, demandes, invitations par message ---------- */
  var FR = { list: [], unsub: null, pres: {}, presU: {}, tab: 'req', sug: { items: [], t: 0, busy: false } };
  var INV_MAX = 5, ONLINE_MS = 150000;
  var frDlg = $('#frDlg'), ucDlg = $('#userCard'), ucT = null;
  function frDoc(uid) { return fs.collection('friendships').doc(chatIdFor(state.me, uid)); }
  function frOther(f) { return (f.members || []).filter(function (x) { return x !== state.me; })[0]; }
  function frNameOf(f) { return (f.names && f.names[frOther(f)]) || 'Inconnu'; }
  /* amis = demandes acceptées + toutes les personnes avec qui une discussion existe déjà (hors invitations en attente) */
  function frAll() {
    var m = {};
    state.chats.forEach(function (c) {
      if (c.group || c.invite) return;
      var o = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      if (!o) return;
      var nm = {}; nm[o] = (c.names && c.names[o]) || 'Inconnu';
      m[o] = { members: [state.me, o], names: nm, status: 'accepted', implicit: true };
    });
    FR.list.forEach(function (f) { if (f.status === 'accepted') m[frOther(f)] = f; });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function frWith(uid) {
    var im = frAll().filter(function (f) { return frOther(f) === uid; })[0];
    return im || FR.list.filter(function (f) { return frOther(f) === uid; })[0] || null;
  }
  function inviteIn(c) { return !!(c && !c.group && c.invite && c.invite.from && c.invite.from !== state.me); }
  function invitePending(c) { return inviteIn(c) && c.invite.st !== 'declined'; }
  function frIncoming() { return FR.list.filter(function (f) { return f.status === 'pending' && f.from !== state.me; }); }
  function frCount() { return frIncoming().length + state.chats.filter(invitePending).length; }
  function frBadge() { var b = $('#frN'), n = frCount(); b.textContent = n; b.hidden = !n; var d = $('#menuDot'); if (d) d.hidden = !n; }
  function frWatchPres() {
    var want = {};
    frAll().forEach(function (f) { want[frOther(f)] = 1; });
    Object.keys(FR.presU).forEach(function (u) { if (!want[u]) { FR.presU[u](); delete FR.presU[u]; delete FR.pres[u]; } });
    Object.keys(want).forEach(function (u) {
      if (FR.presU[u]) return;
      FR.presU[u] = fs.collection('presence').doc(u).onSnapshot(function (d) {
        FR.pres[u] = { seen: d.exists ? (d.data().seen || 0) : 0, bday: d.exists && typeof d.data().bday === 'string' ? d.data().bday : null }; bdayPaint();
        if (frDlg.open) frRender();
        if (ucDlg.open) ucRender();
      }, function () {});
    });
  }
  var seenAt = {}, onSig = '';
  function isOnline(u) { var t = Math.max(seenAt[u] || 0, (FR.pres[u] && FR.pres[u].seen) || 0); return !!t && Date.now() - t < ONLINE_MS; }
  function onlineSig() {
    return state.chats.map(function (c) {
      if (c.group) return '';
      var o = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      return o && isOnline(o) ? o : '';
    }).join(',');
  }
  setInterval(function () { if (!document.hidden && state.view === 'list' && onlineSig() !== onSig) renderList(); }, 15000);
  function frFail() { var e = $('#frErr'); e.textContent = 'Action impossible (connexion ou règles Firestore : « friendships »).'; e.hidden = false; }
  function frRow(uid, name, sub, subCls, online, btns, onOpen) {
    var r = el('div', 'frrow'), wrap = el('span', 'frav'), a = el('span', 'avatar sm');
    paintPhoto(a, uid, name); loadPhoto(uid); ensureBadge(uid); wrap.appendChild(a);
    if (online) wrap.appendChild(el('i', 'frdot'));
    wrap.addEventListener('click', function () { frDlg.close(); openUserCard(uid, name); });
    var mid = el('div', 'frmid');
    mid.appendChild(withBadge(el('b', '', cap(name)), uid));
    mid.appendChild(el('small', subCls || '', sub || ''));
    mid.addEventListener('click', onOpen);
    var bx = el('div', 'frbtns');
    (btns || []).forEach(function (o) { var b = el('button', 'ghost', o[0]); b.type = 'button'; b.addEventListener('click', o[1]); bx.appendChild(b); });
    r.appendChild(wrap); r.appendChild(mid); r.appendChild(bx);
    return r;
  }
  /* suggestions d'amis : comptes certifiés récemment actifs, sans les amis ni les demandes en cours ; les comptes non certifiés n'en voient pas */
  function frIsCertMe() { /* vrai = compte restreint (ni certifié ni créateur) */
    try {
      if (!state.me) return false;
      if (typeof badges !== 'undefined' && badges[state.me]) return false;
      return typeof isCertMe === 'function' ? !isCertMe() : localStorage.getItem('uandi-cert-' + state.me) !== '1';
    } catch (e) { return false; }
  }
  function frSuggest() {
    if (frIsCertMe()) return;
    if (FR.sug.busy || (FR.sug.t && Date.now() - FR.sug.t < 60000)) return;
    FR.sug.busy = true;
    fs.collection('presence').orderBy('seen', 'desc').limit(40).get().then(function (sn) {
      var out = [];
      sn.forEach(function (d) {
        var v = d.data(), u = d.id;
        if (u === state.me || (v.verified !== true && v.assistant !== true) || typeof v.name !== 'string' || !v.name || frWith(u)) return;
        if (typeof v.photo === 'string') { photos[u] = v.photo; photoReq[u] = 1; }
        out.push({ uid: u, name: v.name });
      });
      var mine = {}; frAll().forEach(function (f) { mine[frOther(f)] = 1; });
      /* suggestion seulement avec au moins 5 amis en commun */
      return Promise.all(out.map(function (x) {
        return fs.collection('friendships').where('members', 'array-contains', x.uid).limit(300).get().then(function (q) {
          var n = 0; q.forEach(function (d) { var v = d.data(); if (!v || v.status !== 'accepted') return; var o = (v.members || []).filter(function (m) { return m !== x.uid; })[0]; if (o && o !== state.me && mine[o]) n++; });
          x.mutual = n; return x;
        }).catch(function () { x.mutual = 0; return x; });
      })).then(function (all) {
        var ok = all.filter(function (x) { return x.mutual >= 5; });
        ok.sort(function (a, b) { return b.mutual - a.mutual; });
        FR.sug.items = ok.slice(0, 8); FR.sug.t = Date.now(); FR.sug.busy = false;
        if (frDlg.open) frRender();
      });
    }).catch(function () { FR.sug.busy = false; FR.sug.t = Date.now(); });
  }
  function frRender() {
    var box = $('#frBody'); box.replaceChildren();
    var inc = frIncoming(), out = FR.list.filter(function (f) { return f.status === 'pending' && f.from === state.me; });
    var inv = state.chats.filter(invitePending).sort(function (a, b) { return (b.lastTs || 0) - (a.lastTs || 0); });
    var friends = frAll();
    $('#frTabReq').textContent = 'Demandes' + (frCount() ? ' (' + frCount() + ')' : '');
    $('#frTabFr').textContent = 'Amis (' + friends.length + ')';
    $('#frTabReq').setAttribute('aria-pressed', FR.tab === 'req' ? 'true' : 'false');
    $('#frTabFr').setAttribute('aria-pressed', FR.tab === 'fr' ? 'true' : 'false');
    if (FR.tab === 'req') {
      box.appendChild(el('p', 'frh', 'Demandes d’amis'));
      if (!inc.length && !out.length) box.appendChild(el('p', 'frempty', 'Aucune demande d’ami.'));
      inc.forEach(function (f) {
        var u = frOther(f), nm = frNameOf(f);
        box.appendChild(frRow(u, nm, 'veut devenir ton ami', '', false, [
          ['Accepter', function () { frDoc(u).update({ status: 'accepted', ats: Date.now() }).catch(frFail); }],
          ['Refuser', function () { frDoc(u).delete().catch(frFail); }]
        ], function () { frDlg.close(); openUserCard(u, nm); }));
      });
      out.forEach(function (f) {
        var u = frOther(f), nm = frNameOf(f);
        box.appendChild(frRow(u, nm, 'Demande envoyée', '', false, [['Annuler', function () { frDoc(u).delete().catch(frFail); }]], function () { frDlg.close(); openUserCard(u, nm); }));
      });
      box.appendChild(el('p', 'frh', 'Invitations par message'));
      if (!inv.length) box.appendChild(el('p', 'frempty', 'Aucune invitation par message.'));
      inv.forEach(function (c) {
        var u = c.invite.from, nm = (c.names && c.names[u]) || 'Inconnu', n = c.invite.n || 1;
        var row = frRow(u, nm, 'Invitation par message · ' + n + ' message' + (n > 1 ? 's' : ''), 'inv', false, [
          ['Accepter', function () { fs.collection('chats').doc(c.id).update({ invite: firebase.firestore.FieldValue.delete() }).catch(frFail); }],
          ['Refuser', function () { fs.collection('chats').doc(c.id).update({ 'invite.st': 'declined' }).catch(frFail); }]
        ], function () { frDlg.close(); openChat(u, nm); });
        if (c.lastText) row.querySelector('.frmid').appendChild(el('small', '', '« ' + c.lastText + ' »'));
        box.appendChild(row);
      });
    } else {
      frSuggest();
      var on = friends.filter(function (f) { return isOnline(frOther(f)); }), off = friends.filter(function (f) { return !isOnline(frOther(f)); });
      if (!friends.length) box.appendChild(el('p', 'frempty', 'Aucun ami pour l’instant. Cherche un nom d’utilisateur pour en ajouter.'));
      function add(f, o) { var u = frOther(f), nm = frNameOf(f); box.appendChild(frRow(u, nm, (isClose(u) ? '⭐ Ami proche · ' : '') + (o ? 'En ligne' : 'Hors ligne'), '', o, [], function () { frDlg.close(); openChat(u, nm); })); }
      var bds = bdayList();
      var bt = bds.filter(function (x) { return x.days === 0; }), bn = bds.filter(function (x) { return x.days > 0 && x.days <= 30; });
      if (bt.length) { box.appendChild(el('p', 'frh', 'Anniversaires aujourd’hui')); bt.forEach(function (x) { box.appendChild(frRow(x.u, x.nm, '🎂 Aujourd’hui', '', false, [], function () { frDlg.close(); openChat(x.u, x.nm); })); }); }
      if (bn.length) { box.appendChild(el('p', 'frh', 'Prochains anniversaires')); bn.forEach(function (x) { box.appendChild(frRow(x.u, x.nm, bdayLabel(x.md) + ' · dans ' + x.days + ' j', '', false, [], function () { frDlg.close(); openChat(x.u, x.nm); })); }); }
      if (on.length) { box.appendChild(el('p', 'frh', 'Connectés (' + on.length + ')')); on.forEach(function (f) { add(f, true); }); }
      if (off.length) { box.appendChild(el('p', 'frh', on.length ? 'Hors ligne' : 'Tous les amis')); off.forEach(function (f) { add(f, false); }); }
      var sg = frIsCertMe() ? [] : FR.sug.items.filter(function (x) { return !frWith(x.uid); });
      if (sg.length) {
        box.appendChild(el('p', 'frh', 'Suggestions'));
        sg.forEach(function (x) {
          box.appendChild(frRow(x.uid, x.name, x.mutual + ' amis en commun', '', false, [['Ajouter', function () {
            var names = {}; names[state.me] = state.username; names[x.uid] = x.name;
            frDoc(x.uid).set({ members: [state.me, x.uid], names: names, from: state.me, status: 'pending', ts: Date.now() }).catch(frFail);
          }]], function () { frDlg.close(); openUserCard(x.uid, x.name); }));
        });
      }
    }
  }
  function frOpen(tab) { FR.tab = tab; $('#frErr').hidden = true; frRender(); frDlg.showModal(); }
  $('#openFriends').addEventListener('click', function () { frOpen('fr'); });
  $('#openReqs').addEventListener('click', function () { frOpen('req'); });
  $('#frTabReq').addEventListener('click', function () { FR.tab = 'req'; frRender(); });
  $('#frTabFr').addEventListener('click', function () { FR.tab = 'fr'; frRender(); });
  $('#frClose').addEventListener('click', function () { frDlg.close(); });
  setInterval(function () { if (!document.hidden && frDlg.open) frRender(); }, 20000);

  /* barre d'outils : menu ⋮, filtre « non lus », recherche d'une personne */
  var kmenu = $('#kmenu'), menuBtn = $('#menuBtn');
  function menuClose() { kmenu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', function (e) { e.stopPropagation(); var o = kmenu.hidden; kmenu.hidden = !o; menuBtn.setAttribute('aria-expanded', o ? 'true' : 'false'); });
  kmenu.addEventListener('click', menuClose);
  document.addEventListener('click', function (e) { if (!kmenu.hidden && !e.target.closest('#kmenu') && !e.target.closest('#menuBtn')) menuClose(); });
  $('#unreadBtn').addEventListener('click', function () { state.onlyUnread = !state.onlyUnread; renderList(); });
  $('#searchBtn').addEventListener('click', function () {
    var f = $('#newChat'); f.hidden = !f.hidden;
    if (!f.hidden) $('#who').focus(); else showNewErr('');
  });
  $('#openDSearch').addEventListener('click', function () { var i = $('#search'); i.hidden = false; setTimeout(function () { i.focus(); }, 0); });
  $('#search').addEventListener('blur', function () { if (!this.value.trim()) this.hidden = true; });




/* E'cho — js/app/05-outils-createur.js
   Statut masqué, annonce, suspension, outils du créateur
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- statut en ligne masqué, annonce, suspension, outils créateur ---------- */
  var BANS = {};
  function hideOn() { try { return !!state.me && localStorage.getItem('uandi-hide-' + state.me) === '1'; } catch (e) { return false; } }
  function paintHide() {
    var b = $('#hideOnBtn'); if (!b) return;
    b.setAttribute('aria-pressed', hideOn() ? 'true' : 'false'); b.textContent = hideOn() ? 'Statut en ligne masqué ✓' : 'Masquer mon statut en ligne';
    var h = $('#hideSeenBtn'); h.setAttribute('aria-pressed', hideSeenOn() ? 'true' : 'false'); h.textContent = hideSeenOn() ? 'Mes « Vu » sont masqués ✓' : 'Masquer mes « Vu »';
  }
  function hideSeenOn() { try { return !!state.me && localStorage.getItem('uandi-hs-' + state.me) === '1'; } catch (e) { return false; } }
  $('#hideSeenBtn').addEventListener('click', function () {
    var on = !hideSeenOn();
    try { localStorage.setItem('uandi-hs-' + state.me, on ? '1' : '0'); } catch (e) {}
    paintHide();
    fs.collection('presence').doc(state.me).set({ hideSeen: on ? true : firebase.firestore.FieldValue.delete() }, { merge: true }).catch(function () {});
  });
  $('#hideOnBtn').addEventListener('click', function () {
    var on = !hideOn();
    try { localStorage.setItem('uandi-hide-' + state.me, on ? '1' : '0'); } catch (e) {}
    paintHide();
    var FV = firebase.firestore.FieldValue;
    fs.collection('presence').doc(state.me).set(on ? { seen: 0, hideOn: true } : { seen: Date.now(), hideOn: FV.delete() }, { merge: true }).catch(function () {});
  });
  $('#openSet').addEventListener('click', function () { paintHide(); lkPaint(); bdPaint(); });
  function banGuard() {
    if (state.banUntil && Date.now() < state.banUntil) { nwErr('Tu es suspendu(e) des publications jusqu’au ' + new Date(state.banUntil).toLocaleString('fr-FR') + '.'); return true; }
    return false;
  }
  /* annonce du créateur : bandeau pour tout le monde */
  var ANN = { unsub: null, ban: null, data: null };
  function annPaint() {
    var d = ANN.data, bar = $('#annBar'), x = null;
    try { x = localStorage.getItem('uandi-annx'); } catch (e) {}
    var show = !!(d && d.text && String(d.ts) !== x);
    bar.hidden = !show; if (show) $('#annTxt').textContent = d.text;
  }
  $('#annX').addEventListener('click', function () { try { localStorage.setItem('uandi-annx', String(ANN.data && ANN.data.ts)); } catch (e) {} annPaint(); });
  function annStart() {
    ANN.unsub = fs.collection('announce').doc('main').onSnapshot(function (d) { ANN.data = d.exists ? d.data() : null; annPaint(); }, function () {});
    ANN.ban = fs.collection('bans').doc(state.me).onSnapshot(function (d) { state.banUntil = d.exists ? ((d.data() || {}).until || 0) : 0; }, function () {});
  }
  function annStop() { if (ANN.unsub) ANN.unsub(); if (ANN.ban) ANN.ban(); ANN.unsub = ANN.ban = null; ANN.data = null; state.banUntil = 0; annPaint(); }
  /* fenêtre des outils créateur */
  var crDlg = $('#crDlg'), CR = { mode: '' };
  function crErr(t) { var e = $('#crErr'); e.textContent = t || ''; e.hidden = !t; }
  function crRender() {
    var box = $('#crBody'); box.replaceChildren();
    if (CR.mode === 'ap') { apRender(); return; }
    if (CR.mode === 'mod') {
      var fl = NW.items.filter(function (it) { return nwCount(it.reports) > 0; }).sort(function (a, b) { return nwCount(b.reports) - nwCount(a.reports); });
      if (!NW.loaded) { box.appendChild(el('p', 'hint', 'Chargement…')); return; }
      if (!fl.length) { box.appendChild(el('p', 'hint', 'Aucune lettre signalée.')); return; }
      fl.forEach(function (it) {
        var n = nwCount(it.reports), r = el('div', 'frrow'), mid = el('div', 'frmid'), bx = el('div', 'frbtns');
        mid.appendChild(el('b', '', (it.alias || 'Anonyme') + ' · ' + n + ' signalement' + (n > 1 ? 's' : '') + (n >= 3 ? ' · masquée' : '')));
        mid.appendChild(el('small', '', String(it.text || '').slice(0, 140)));
        var ok = el('button', 'ghost', 'Rétablir'); ok.type = 'button';
        ok.addEventListener('click', function () { LC().doc(it.id).update({ reports: {} }).catch(function () { crErr('Action impossible (règles Firestore).'); }); });
        var dl = el('button', 'ghost', 'Supprimer'); dl.type = 'button';
        dl.addEventListener('click', function () { nwDelete(it); });
        bx.appendChild(ok); bx.appendChild(dl); r.appendChild(mid); r.appendChild(bx); box.appendChild(r);
      });
    }
  }
  function crOpen(mode, title) { CR.mode = mode; $('#crTitle').textContent = title; crErr(''); $('#crBody').replaceChildren(); crDlg.showModal(); }
  $('#crClose').addEventListener('click', function () { crDlg.close(); });
  crDlg.addEventListener('click', function (e) { if (e.target === crDlg) crDlg.close(); });
  $('#apBtn').addEventListener('click', function () { if (!creatorOn()) return; crOpen('ap', 'Comptes à approuver'); apRender(); });
  $('#modBtn').addEventListener('click', function () { if (!creatorOn()) return; crOpen('mod', 'Lettres signalées'); nwListen(); crRender(); });
  $('#annBtn').addEventListener('click', function () {
    if (!creatorOn()) return;
    crOpen('ann', 'Annonce à tous');
    var box = $('#crBody'), ta = el('textarea', 'crtxt'); ta.maxLength = 300; ta.placeholder = 'Ton message, affiché en haut de la liste de tout le monde…';
    ta.value = (ANN.data && ANN.data.text) || '';
    var row = el('div', 'pfrow'), go = el('button', 'ghost', 'Publier'), off = el('button', 'ghost', 'Retirer l’annonce');
    go.type = off.type = 'button';
    go.addEventListener('click', function () {
      var t = ta.value.trim(); if (!t) { crErr('Écris un message.'); return; }
      fs.collection('announce').doc('main').set({ text: t.slice(0, 300), ts: Date.now() }).then(function () { crDlg.close(); }).catch(function () { crErr('Impossible : ajoute la règle Firestore « announce ».'); });
    });
    off.addEventListener('click', function () { fs.collection('announce').doc('main').delete().then(function () { crDlg.close(); }).catch(function () { crErr('Impossible (règles Firestore).'); }); });
    row.appendChild(go); row.appendChild(off); box.appendChild(ta); box.appendChild(row);
  });
  $('#statsBtn').addEventListener('click', function () {
    if (!creatorOn()) return;
    crOpen('stats', 'Statistiques'); nwListen();
    var box = $('#crBody'); box.appendChild(el('p', 'hint', 'Chargement…'));
    fs.collection('usernames').get().then(function (sn) {
      var uids = []; sn.forEach(function (d) { var v = d.data(); if (v && typeof v.uid === 'string') uids.push(v.uid); });
      return Promise.all(uids.map(function (u) { return fs.collection('presence').doc(u).get().then(function (d) { return d.exists ? d.data() : {}; }).catch(function () { return {}; }); })).then(function (ps) {
        var on = ps.filter(function (v) { return v.seen && Date.now() - v.seen < 150000; }).length;
        var cert = ps.filter(function (v) { return v.verified === true; }).length;
        var hid = ps.filter(function (v) { return v.hideOn === true; }).length;
        var items = NW.items || [], cm = items.reduce(function (n, it) { return n + (it.cc || 0); }, 0);
        var rows = [['Comptes', uids.length], ['En ligne maintenant', on], ['Comptes certifiés', cert], ['Statut masqué', hid], ['Lettres (100 dernières)', items.length], ['Commentaires dessus', cm], ['Lettres signalées', items.filter(function (it) { return nwCount(it.reports) > 0; }).length]];
        box.replaceChildren();
        rows.forEach(function (r) { var d = el('div', 'crstat'); d.appendChild(el('span', '', r[0])); d.appendChild(el('b', '', String(r[1]))); box.appendChild(d); });
      });
    }).catch(function () { box.replaceChildren(); crErr('Lecture refusée : les règles Firestore doivent autoriser le créateur à lire « usernames » et « presence ».'); });
  });




/* E'cho — js/app/06-epingles-anniversaires-code.js
   Épingler, amis proches, anniversaires, verrouillage par code
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- épingler, amis proches, anniversaires, notification d'ami, verrouillage ---------- */
  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function pinList() { return lsGet('uandi-pin-' + state.me, []); }
  function isPinned(id) { return pinList().indexOf(id) !== -1; }
  function paintPin() { var b = $('#pinChat'); if (b && state.chat) b.textContent = isPinned(state.chat.id) ? 'Désépingler' : 'Épingler'; }
  $('#pinChat').addEventListener('click', function () {
    if (!state.chat) return;
    var l = pinList(), i = l.indexOf(state.chat.id);
    if (i === -1) l.push(state.chat.id); else l.splice(i, 1);
    lsSet('uandi-pin-' + state.me, l); $('#chatMenu').hidden = true; paintPin();
  });
  function closeList() { return lsGet('uandi-close-' + state.me, []); }
  function isClose(u) { return closeList().indexOf(u) !== -1; }
  $('#ucStar').addEventListener('click', function () {
    if (!ucT) return;
    var l = closeList(), i = l.indexOf(ucT.uid);
    if (i === -1) l.push(ucT.uid); else l.splice(i, 1);
    lsSet('uandi-close-' + state.me, l); ucRender();
  });
  ['❤️', '😂', '😮', '😢', '👍', '🔥'].forEach(function (e) {
    var b = el('button', '', e); b.type = 'button'; b.setAttribute('aria-label', 'Réagir ' + e);
    b.addEventListener('click', function () { sendNoteReply(e); });
    $('#nvReacts').appendChild(b);
  });
  function notifyFriendReq(v) {
    var nm = (v.names && v.names[v.from]) || 'Quelqu’un';
    if (!npOn('friends')) return;
    var loud = fx();
    if (document.hidden) sysNotify(nm, 'veut devenir ton ami', 'friends', !loud); else { showToast(null, nm, 'veut devenir ton ami'); toastFr = true; }
  }
  /* anniversaires */
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function bdayDays(md) {
    var m = +md.slice(0, 2), d = +md.slice(3, 5), now = new Date(), t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var n = new Date(now.getFullYear(), m - 1, d); if (n < t0) n = new Date(now.getFullYear() + 1, m - 1, d);
    return Math.round((n - t0) / 864e5);
  }
  function bdayLabel(md) { return 'le ' + (+md.slice(3, 5)) + ' ' + MOIS[(+md.slice(0, 2)) - 1]; }
  function bdayList() {
    var out = [];
    frAll().forEach(function (f) {
      var u = frOther(f), md = FR.pres[u] && FR.pres[u].bday;
      if (md && /^\d\d-\d\d$/.test(md)) out.push({ u: u, nm: frNameOf(f), md: md, days: bdayDays(md) });
    });
    return out.sort(function (a, b) { return a.days - b.days; });
  }
  function bdayPaint() {
    var bar = $('#bdayBar'); if (!bar) return;
    var t = bdayList().filter(function (x) { return x.days === 0; });
    var done = ''; try { done = localStorage.getItem('uandi-bdx') || ''; } catch (e) {}
    bar.hidden = !t.length || done === new Date().toDateString();
    if (t.length) $('#bdayTxt').textContent = '🎂 Aujourd’hui, c’est l’anniversaire de ' + t.map(function (x) { return cap(x.nm); }).join(', ') + ' !';
  }
  $('#bdayX').addEventListener('click', function () { try { localStorage.setItem('uandi-bdx', new Date().toDateString()); } catch (e) {} bdayPaint(); });
  (function () {
    var d = $('#bdD'), m = $('#bdM'), i;
    d.appendChild(new Option('Jour', ''));
    for (i = 1; i <= 31; i++) d.appendChild(new Option(String(i), String(i)));
    m.appendChild(new Option('Mois', ''));
    MOIS.forEach(function (n, k) { m.appendChild(new Option(n, String(k + 1))); });
  })();
  function bdPaint() {
    var md = notePres[state.me] && notePres[state.me].bday;
    $('#bdD').value = md ? String(+md.slice(3, 5)) : ''; $('#bdM').value = md ? String(+md.slice(0, 2)) : '';
  }
  $('#bdSave').addEventListener('click', function () {
    var d = +$('#bdD').value, m = +$('#bdM').value; if (!d || !m) return;
    fs.collection('presence').doc(state.me).set({ bday: ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2) }, { merge: true }).catch(function () {});
  });
  $('#bdDel').addEventListener('click', function () {
    $('#bdD').value = ''; $('#bdM').value = '';
    fs.collection('presence').doc(state.me).set({ bday: firebase.firestore.FieldValue.delete() }, { merge: true }).catch(function () {});
  });
  /* verrouillage : code à 4 chiffres + empreinte (WebAuthn) */
  var LK = { mode: '', buf: '', first: '', cb: null, hiddenAt: 0 }, lockDlg = $('#lockDlg');
  function lkData() { return lsGet('uandi-lock-' + state.me, null); }
  function lkOn() { return !!state.me && !!lkData(); }
  function lkBioId() { try { return localStorage.getItem('uandi-lockbio-' + state.me); } catch (e) { return null; } }
  function lkBioOk() { return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext); }
  function lkErr(t) { var e = $('#lkErr'); e.textContent = t || ''; e.hidden = !t; }
  function lkDraw() { var d = $('#lkDots'); d.replaceChildren(); for (var i = 0; i < 4; i++) d.appendChild(el('i', i < LK.buf.length ? 'on' : '')); }
  function lkOpen(mode, cb) {
    LK.mode = mode; LK.buf = ''; LK.cb = cb || null; lkErr('');
    var T = { unlock: ['Verrouillé', 'Entre ton code'], new1: ['Nouveau code', 'Choisis un code à 4 chiffres'], new2: ['Confirme', 'Entre le même code'], verify: ['Code actuel', 'Entre ton code pour continuer'] }[mode];
    $('#lkTitle').textContent = T[0]; $('#lkSub').textContent = T[1];
    $('#lkCancel').hidden = mode === 'unlock'; $('#lkForgot').hidden = mode !== 'unlock';
    $('#lkBio').hidden = !(mode === 'unlock' && lkBioId() && lkBioOk());
    lkDraw();
    if (!lockDlg.open) lockDlg.showModal();
    if (mode === 'unlock' && lkBioId() && lkBioOk()) setTimeout(lkBio, 350);
  }
  function lkCheck() { if (lkOn() && LK.mode !== 'unlock') lkOpen('unlock'); }
  function lkClose() { LK.mode = ''; if (lockDlg.open) lockDlg.close(); lkPaint(); }
  async function lkDone() {
    var pin = LK.buf, md = LK.mode, dat = lkData();
    if (md === 'unlock' || md === 'verify') {
      var h = dat ? await sha256(dat.salt + ':' + pin) : '';
      if (dat && h === dat.hash) { var cb = LK.cb; LK.cb = null; if (md === 'verify' && cb) cb(); else lkClose(); }
      else { LK.buf = ''; lkDraw(); lkErr('Code incorrect.'); try { if (navigator.vibrate) navigator.vibrate(200); } catch (e) {} }
    } else if (md === 'new1') { LK.first = pin; lkOpen('new2'); }
    else if (md === 'new2') {
      if (pin !== LK.first) { lkOpen('new1'); lkErr('Les deux codes sont différents.'); return; }
      var salt = Math.random().toString(36).slice(2) + Date.now().toString(36);
      lsSet('uandi-lock-' + state.me, { salt: salt, hash: await sha256(salt + ':' + pin) });
      lkClose();
    }
  }
  function lkPress(k) {
    if (k === 'del') LK.buf = LK.buf.slice(0, -1);
    else if (LK.buf.length < 4) LK.buf += k;
    lkErr(''); lkDraw();
    if (LK.buf.length === 4) setTimeout(lkDone, 120);
  }
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].forEach(function (k) {
    var b = el('button', '', k === 'del' ? '⌫' : k); b.type = 'button';
    if (k) b.addEventListener('click', function () { lkPress(k); });
    $('#lkPad').appendChild(b);
  });
  lockDlg.addEventListener('keydown', function (e) { if (/^\d$/.test(e.key)) lkPress(e.key); else if (e.key === 'Backspace') lkPress('del'); });
  lockDlg.addEventListener('cancel', function (e) { if (LK.mode === 'unlock') e.preventDefault(); else LK.mode = ''; });
  $('#lkCancel').addEventListener('click', lkClose);
  $('#lkForgot').addEventListener('click', function () {
    if (!confirm('Se déconnecter et retirer le verrou ? Tu devras te reconnecter avec ton mot de passe.')) return;
    try { localStorage.removeItem('uandi-lock-' + state.me); localStorage.removeItem('uandi-lockbio-' + state.me); } catch (e) {}
    lkClose(); auth.signOut();
  });
  async function lkBio() {
    var raw = lkBioId(); if (!raw || !lkBioOk()) return;
    try {
      await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: 'public-key', id: unb64(raw) }], userVerification: 'preferred', timeout: 60000 } });
      if (LK.mode === 'unlock') lkClose();
    } catch (e) {}
  }
  $('#lkBio').addEventListener('click', lkBio);
  function lkPaint() {
    var on = lkOn(), bio = !!lkBioId();
    $('#lockState').textContent = on ? 'Code activé' + (bio ? ' · empreinte activée' : '') + '. L’appli se verrouille après 30 s en arrière-plan.' : 'Désactivé. Protège l’appli avec un code (et l’empreinte si ton téléphone le permet).';
    $('#lockSet').textContent = on ? 'Changer le code' : 'Définir un code';
    $('#lockOff').hidden = !on; $('#lockBio').hidden = !(on && !bio && lkBioOk());
  }
  $('#lockSet').addEventListener('click', function () { $('#lockErr').hidden = true; if (lkOn()) lkOpen('verify', function () { lkOpen('new1'); }); else lkOpen('new1'); });
  $('#lockOff').addEventListener('click', function () {
    lkOpen('verify', function () {
      try { localStorage.removeItem('uandi-lock-' + state.me); localStorage.removeItem('uandi-lockbio-' + state.me); } catch (e) {}
      lkClose();
    });
  });
  $('#lockBio').addEventListener('click', async function () {
    var err = $('#lockErr'); err.hidden = true;
    try {
      if (window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable && !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) {
        err.textContent = 'Aucune empreinte ni verrouillage d’écran détecté sur ce téléphone. Active-en un dans les réglages du téléphone, puis réessaie.'; err.hidden = false; return;
      }
    } catch (x) {}
    try {
      var cred = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'E\'cho' }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: state.username, displayName: state.username }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'preferred', residentKey: 'discouraged' }, attestation: 'none', timeout: 60000 } });
      localStorage.setItem('uandi-lockbio-' + state.me, b64(new Uint8Array(cred.rawId)));
      lkPaint();
    } catch (e) {
      var nm = (e && e.name) || '';
      err.textContent = nm === 'NotAllowedError' ? 'Empreinte refusée ou annulée. Vérifie que ton téléphone a une empreinte ou un verrouillage d’écran activé, puis réessaie.'
        : (nm === 'NotSupportedError' || nm === 'SecurityError') ? 'Non disponible ici : ouvre le site directement dans Chrome (https), pas dans une fenêtre intégrée ou une autre appli.'
        : 'Empreinte non activée (' + (nm || 'erreur') + ').';
      err.hidden = false;
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (!state.me) return;
    if (document.hidden) LK.hiddenAt = Date.now();
    else if (lkOn() && LK.hiddenAt && Date.now() - LK.hiddenAt > 30000 && LK.mode !== 'unlock') lkOpen('unlock');
  });

  /* fiche d'une personne trouvée : ami, invitation par message, discussion */
  function ucChat(uid) { return state.chats.filter(function (x) { return !x.group && (x.members || []).indexOf(uid) !== -1; })[0] || null; }
  function openUserCard(uid, name) {
    ucT = { uid: uid, name: name };
    $('#ucErr').hidden = true; $('#ucMsgBox').hidden = true; $('#ucMsgIn').value = '';
    ucRender(); ucDlg.showModal();
  }
  function ucRender() {
    if (!ucT) return;
    var uid = ucT.uid, name = ucT.name, f = frWith(uid), c = ucChat(uid);
    paintPhoto($('#ucAv'), uid, name); loadPhoto(uid);
    $('#ucName').textContent = cap(name); ensureBadge(uid); withBadge($('#ucName'), uid);
    var fb = $('#ucFriend'), ob = $('#ucOpen'), mb = $('#ucMsg');
    fb.disabled = !!(f && f.implicit);
    if (!f) { fb.textContent = '➕ Ajouter en ami'; fb.dataset.a = 'add'; }
    else if (f.implicit) { fb.textContent = '✓ Amis'; fb.dataset.a = 'none'; }
    else if (f.status === 'accepted') { fb.textContent = '✓ Amis · Retirer'; fb.dataset.a = 'rm'; }
    else if (f.from === state.me) { fb.textContent = 'Demande envoyée · Annuler'; fb.dataset.a = 'rm'; }
    else { fb.textContent = '✓ Accepter sa demande d’ami'; fb.dataset.a = 'acc'; }
    $('#ucSub').textContent = f && f.status === 'accepted' ? (isOnline(uid) ? '● En ligne' : 'Ami · hors ligne') : '';
    var sb = $('#ucStar'); sb.hidden = !(f && f.status === 'accepted'); sb.textContent = isClose(uid) ? '⭐ Retirer des amis proches' : '⭐ Ajouter aux amis proches';
    var showOpen = (f && f.status === 'accepted') || !!c;
    ob.hidden = !showOpen; mb.hidden = showOpen; if (showOpen) $('#ucMsgBox').hidden = true;
    if (c && invitePending(c)) { ob.textContent = '✉️ Voir son invitation'; ob.dataset.a = 'inv'; }
    else { ob.textContent = c && c.invite ? '💬 Ouvrir (invitation en attente)' : '💬 Écrire'; ob.dataset.a = 'chat'; }
  }
  function ucFail() { var e = $('#ucErr'); e.textContent = 'Impossible : ajoute la règle Firestore « friendships » (connexion à vérifier aussi).'; e.hidden = false; }
  $('#ucFriend').addEventListener('click', function () {
    var t = ucT; if (!t) return;
    var a = this.dataset.a, f = frWith(t.uid);
    if (a === 'add') {
      var names = {}; names[state.me] = state.username; names[t.uid] = t.name;
      frDoc(t.uid).set({ members: [state.me, t.uid], names: names, from: state.me, status: 'pending', ts: Date.now() }).catch(ucFail);
    } else if (a === 'acc') frDoc(t.uid).update({ status: 'accepted', ats: Date.now() }).catch(ucFail);
    else if (a === 'rm') {
      if (f && f.status === 'accepted' && !confirm('Retirer ' + cap(t.name) + ' de tes amis ?')) return;
      frDoc(t.uid).delete().catch(ucFail);
    }
  });
  $('#ucOpen').addEventListener('click', function () {
    var t = ucT; if (!t) return;
    ucDlg.close();
    if (this.dataset.a === 'inv') frOpen('req'); else openChat(t.uid, t.name);
  });
  $('#ucMsg').addEventListener('click', function () { $('#ucMsgBox').hidden = false; $('#ucMsgIn').focus(); });
  async function ucInvite() {
    var t = ucT, inp = $('#ucMsgIn'), text = inp.value.trim(), err = $('#ucErr'), btn = $('#ucMsgSend');
    if (!t || !text) return;
    err.hidden = true; btn.disabled = true;
    try {
      var cid = chatIdFor(state.me, t.uid), ref = fs.collection('chats').doc(cid), ts = Date.now();
      if (!(await ref.get()).exists) {
        var names = {}; names[state.me] = myName(); names[t.uid] = t.name;
        var seen = {}; seen[state.me] = ts;
        var b = fs.batch();
        b.set(ref, { members: [state.me, t.uid], names: names, lastText: text.slice(0, 120), lastTs: ts, lastUid: state.me, seen: seen, invite: { from: state.me, n: 1, st: 'pending' } });
        b.set(ref.collection('messages').doc(), { uid: state.me, sts: SV(), text: text.slice(0, 2000), ts: ts });
        await b.commit();
        state.chatsById[cid] = true;
      }
      inp.value = ''; ucDlg.close(); openChat(t.uid, t.name);
    } catch (e) { err.textContent = 'Invitation non envoyée (connexion ou règles Firestore).'; err.hidden = false; }
    btn.disabled = false;
  }
  $('#ucMsgSend').addEventListener('click', ucInvite);
  $('#ucMsgIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ucInvite(); } });
  $('#ucClose').addEventListener('click', function () { ucDlg.close(); });
  [frDlg, ucDlg].forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); });




/* E'cho — js/app/07-groupes.js
   Groupes (30 max) et infos du groupe
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- groupes (30 personnes max) ---------- */
  var gnDlg = $('#groupNew');
  function gnErr(t) { var e = $('#gnErr'); e.textContent = t || ''; e.hidden = !t; }
  $('#newGroup').addEventListener('click', function () { $('#gnTitle').value = ''; $('#gnNames').value = ''; gnErr(''); gnDlg.showModal(); });
  $('#gnCancel').addEventListener('click', function () { gnDlg.close(); });
  $('#gnGo').addEventListener('click', async function () {
    var btn = this, title = $('#gnTitle').value.trim().slice(0, 40), names = [];
    $('#gnNames').value.toLowerCase().split(/[\s,;]+/).forEach(function (n) {
      n = n.replace(/^@/, ''); if (n && n !== state.username && names.indexOf(n) === -1) names.push(n);
    });
    if (!title) { gnErr('Donne un nom au groupe.'); return; }
    if (!names.length) { gnErr('Ajoute au moins une personne.'); return; }
    if (names.length > 29) { gnErr('30 personnes maximum, toi compris.'); return; }
    var bad = names.filter(function (n) { return !NAME_RE.test(n); });
    if (bad.length) { gnErr('Nom d’utilisateur invalide : ' + bad[0]); return; }
    btn.disabled = true; gnErr('');
    try {
      var snaps = await Promise.all(names.map(function (n) { return fs.collection('usernames').doc(n).get(); }));
      var members = [state.me], nm = {}; nm[state.me] = myName();
      for (var i = 0; i < snaps.length; i++) {
        if (!snaps[i].exists) { gnErr('Aucun utilisateur ne s’appelle « ' + names[i] + ' ».'); btn.disabled = false; return; }
        var u = snaps[i].data().uid;
        if (members.indexOf(u) === -1) { members.push(u); nm[u] = names[i]; }
      }
      var id = 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), now = Date.now(), seen = {}; seen[state.me] = now;
      var doc = { members: members, group: true, owner: state.me, title: title, names: nm, lastText: 'Groupe créé', lastTs: now, lastUid: state.me, seen: seen };
      await fs.collection('chats').doc(id).set(doc);
      state.chatsById[id] = true;
      gnDlg.close();
      openChat('', title, Object.assign({ id: id }, doc));
    } catch (e) { gnErr('Création impossible (connexion ou règles Firestore).'); }
    btn.disabled = false;
  });

  /* ---------- infos du groupe : nom, photo, membres ---------- */
  var giDlg = $('#groupInfo');
  function curGroup() { return state.chat && state.chat.group ? chatOf(state.chat.id) : null; }
  function giErr(t) { var e = $('#giErr'); e.textContent = t || ''; e.hidden = !t; }
  function editNick(g, u, real, row) {
    var nx = row.nextSibling;
    if (nx && nx.classList && nx.classList.contains('gimform')) { nx.remove(); return; }
    var f = el('form', 'gimform'), inp = el('input', 'field'), ok = el('button', 'ghost', 'OK');
    inp.maxLength = 24; inp.placeholder = 'Pseudo dans ce groupe'; inp.value = nickOf(g, u); ok.type = 'submit';
    f.appendChild(inp); f.appendChild(ok); row.after(f); inp.focus();
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var raw = inp.value.replace(/\s+/g, ' ').trim(), old = nickOf(g, u);
      if (raw === old) { f.remove(); return; }
      var note = raw ? cap(myName()) + ' a défini le pseudo de ' + cap(real) + ' : ' + raw : cap(myName()) + ' a retiré le pseudo de ' + cap(old || real);
      var ts = Date.now(), ref = fs.collection('chats').doc(g.id), upd = {};
      upd['nicks.' + u] = raw ? raw : firebase.firestore.FieldValue.delete();
      upd.lastText = note; upd.lastTs = ts; upd.lastUid = state.me; upd['seen.' + state.me] = ts;
      giErr('');
      var batch = fs.batch(); batch.update(ref, upd);
      batch.set(ref.collection('messages').doc(), { uid: state.me, sts: SV(), text: SYS + note, ts: ts });
      batch.commit().then(function () { f.remove(); }).catch(function () { giErr('Pseudo impossible (connexion ou règles Firestore).'); });
    });
  }
  function renderGroupInfo() {
    var g = curGroup(); if (!g) return;
    if (document.querySelector('.gimform input:focus')) return;
    var owner = g.owner === state.me;
    paintGroupAv($('#giAv'), g);
    if (document.activeElement !== $('#giTitle')) $('#giTitle').value = g.title || '';
    $('#giTitle').disabled = !owner; $('#giSave').hidden = !owner; $('#giPick').hidden = !owner;
    $('#giDel').hidden = !owner || !g.photo; $('#giAddSec').hidden = !owner; $('#giHint').hidden = owner;
    var ms = (g.members || []).slice().sort(function (a, b) { return (b === g.owner) - (a === g.owner); });
    $('#giCount').textContent = 'Membres (' + ms.length + ' / 30)';
    var box = $('#giMembers'); box.replaceChildren();
    ms.forEach(function (u) {
      var real = u === state.me ? myName() : ((g.names && g.names[u]) || 'Membre'), nick = nickOf(g, u), nm = nick || real;
      var row = el('div', 'gimrow');
      var b = el('button', 'gimem'); b.type = 'button';
      var av = el('span', 'avatar sm'); paintPhoto(av, u, nm); loadPhoto(u);
      b.appendChild(av); b.appendChild(el('span', '', cap(nm) + (nick ? ' (' + cap(real) + ')' : '') + (u === state.me ? ' · toi' : '')));
      if (u === g.owner) b.appendChild(el('small', '', 'créateur'));
      if (u !== state.me) b.addEventListener('click', function () { avatarTap(u, nm); });
      var ed = el('button', 'gimedit', '✏️'); ed.type = 'button'; ed.title = 'Pseudo'; ed.setAttribute('aria-label', 'Pseudo de ' + real);
      ed.addEventListener('click', function () { editNick(g, u, real, row); });
      row.appendChild(b); row.appendChild(ed);
      box.appendChild(row);
    });
  }
  function openGroupInfo() { if (!curGroup()) return; giErr(''); renderGroupInfo(); giDlg.showModal(); }
  function giUpdate(obj) {
    var g = curGroup(); if (!g) return Promise.resolve();
    giErr('');
    return fs.collection('chats').doc(g.id).update(obj).catch(function () { giErr('Modification impossible (connexion ou règles Firestore).'); });
  }
  $('#giBtn').addEventListener('click', function () { $('#chatMenu').hidden = true; openGroupInfo(); });
  $('#chatName').addEventListener('click', function () { if (state.chat && state.chat.group) openGroupInfo(); });
  $('#giClose').addEventListener('click', function () { giDlg.close(); });
  giDlg.addEventListener('click', function (e) { if (e.target === giDlg) giDlg.close(); });
  $('#giSave').addEventListener('click', function () {
    var t = $('#giTitle').value.trim().slice(0, 40);
    if (!t) { giErr('Le nom ne peut pas être vide.'); return; }
    giUpdate({ title: t });
  });
  $('#giPick').addEventListener('click', function () { $('#giFile').click(); });
  $('#giDel').addEventListener('click', function () { giUpdate({ photo: firebase.firestore.FieldValue.delete() }); });
  $('#giFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    fileToPhoto(f).then(function (d) { giUpdate({ photo: d }); }, function () { giErr('Image illisible.'); });
  });
  $('#gaGo').addEventListener('click', async function () {
    var g = curGroup(); if (!g) return;
    var btn = this, names = [];
    $('#gaNames').value.toLowerCase().split(/[\s,;]+/).forEach(function (n) {
      n = n.replace(/^@/, ''); if (n && n !== state.username && names.indexOf(n) === -1) names.push(n);
    });
    if (!names.length) { giErr('Écris au moins un nom d’utilisateur.'); return; }
    var bad = names.filter(function (n) { return !NAME_RE.test(n); });
    if (bad.length) { giErr('Nom d’utilisateur invalide : ' + bad[0]); return; }
    btn.disabled = true; giErr('');
    try {
      var snaps = await Promise.all(names.map(function (n) { return fs.collection('usernames').doc(n).get(); }));
      var upd = {}, add = [], cur = g.members || [];
      for (var i = 0; i < snaps.length; i++) {
        if (!snaps[i].exists) { giErr('Aucun utilisateur ne s’appelle « ' + names[i] + ' ».'); btn.disabled = false; return; }
        var u = snaps[i].data().uid;
        if (cur.indexOf(u) === -1 && add.indexOf(u) === -1) { add.push(u); upd['names.' + u] = names[i]; }
      }
      if (!add.length) { giErr('Ces personnes sont déjà dans le groupe.'); btn.disabled = false; return; }
      if (cur.length + add.length > 30) { giErr('30 personnes maximum : il reste ' + (30 - cur.length) + ' place(s).'); btn.disabled = false; return; }
      upd.members = firebase.firestore.FieldValue.arrayUnion.apply(null, add);
      await fs.collection('chats').doc(g.id).update(upd);
      $('#gaNames').value = '';
    } catch (e) { giErr('Ajout impossible (connexion ou règles Firestore).'); }
    btn.disabled = false;
  });




/* E'cho — js/app/08-discussion.js
   Une discussion
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- une discussion ---------- */
  function pushView(st) {
    var v = state.view;
    if (v === 'music' || v === 'game' || v === 'news') history.replaceState(st, ''); else history.pushState(st, '');
  }
  function showList() {
    leaveChat();
    stopGame();
    state.view = 'list';
    viewGame.hidden = true;
    viewMusic.hidden = true;
    viewChat.hidden = true;
    viewList.hidden = false;
    renderList();
  }

  function paintGroupAv(node, g) {
    if (g && g.photo) { node.textContent = ''; node.style.background = 'center / cover no-repeat url("' + g.photo + '")'; }
    else { node.textContent = '👥'; node.style.background = GROUPBG; }
  }
  var GROUPBG = 'linear-gradient(135deg, var(--accent), var(--accent2, var(--accent)))';
  function openChat(otherUid, otherName, gc) {
    leaveChat();
    var id = gc ? gc.id : chatIdFor(state.me, otherUid);
    state.chat = { id: id, other: gc ? '' : otherUid, name: gc ? (gc.title || 'Groupe') : (nickOf(chatOf(id), otherUid) || otherName), group: !!gc };
    $('#liveBtn').hidden = false; $('#callBtn').hidden = !!gc; $('#giBtn').hidden = !gc; $('#nickBtn').hidden = !!gc; $('#nickForm').hidden = true;
    stopVoices(); RXSIG = {}; HOLD.shown = null; SCROLL_WARM = false; state.msgs = []; state.loaded = false; state.dead = null; state.lim = 20; state.paging = false;
    state.open = new Set(); state.confirm = null; state.otherPres = null;
    state.reply = null; $('#replybar').hidden = true;
    state.stick = true;
    state.view = 'chat';
    history.pushState({ chat: id }, '');
    viewList.hidden = true;
    viewChat.hidden = false;
    $('#chatName').textContent = cap(otherName);
    paintPhoto($('#chatAvatar'), otherUid, otherName); loadPhoto(otherUid);
    updateChatRing(); watchNotes(otherUid); updateChatBadge(); paintPin();
    showErr('');
    showNewErr('');
    resetDelBtn();
    ta.disabled = false; sendBtn.disabled = false;
    ta.value = store('uandi-draft-' + id) || '';
    applyChatTheme(id); applyBg(id); $('#themes').hidden = true;
    autosize();
    renderStatus();
    render();

    var chatRef = fs.collection('chats').doc(id);
    function subMsgs() {
    unsubMsgs = chatRef.collection('messages').orderBy('ts', 'desc').limit(state.lim).onSnapshot(function (snap) {
      var before = new Set(state.msgs.map(function (m) { return m.id; }));
      var firstLoad = !state.loaded;
      var paging = state.paging; state.paging = false;
      var list = [];
      snap.docs.forEach(function (d) {
        var v = d.data({ serverTimestamps: 'estimate' });
        if (v && typeof v.text === 'string' && typeof v.ts === 'number' && typeof v.uid === 'string' && !(typeof v.g === 'string' && typeof v.i === 'number')) {
          list.push({ id: d.id, uid: v.uid, text: v.text, ts: (v.sts && typeof v.sts.toMillis === 'function') ? v.sts.toMillis() : v.ts, likes: v.likes, reacts: v.reacts, edited: v.edited === true, delAt: typeof v.delAt === 'number' ? v.delAt : 0,
            audio: (typeof v.audio === 'string' && (v.audio.slice(0, 5) === 'data:' || isCld(v.audio))) ? v.audio : null,
            dur: typeof v.dur === 'number' ? v.dur : 0,
            music: typeof v.music === 'string' ? v.music : '',
            img: (typeof v.img === 'string' && (v.img.slice(0, 11) === 'data:image/' || isCld(v.img))) ? v.img : null,
            file: (v.file && typeof v.file.n === 'string' && ((typeof v.file.d === 'string' && v.file.d.slice(0, 5) === 'data:') || typeof v.file.g === 'string' || (typeof v.file.u === 'string' && isCld(v.file.u)))) ? { u: (typeof v.file.u === 'string' && isCld(v.file.u)) ? v.file.u : '', n: String(v.file.n || 'fichier').slice(0, 120), s: +v.file.s || 0, d: typeof v.file.d === 'string' ? v.file.d : '', g: String(v.file.g || ''), p: +v.file.p || 0, loc: v.file.loc === 'm' ? 'm' : 'f', mt: String(v.file.mt || '').slice(0, 80) } : null,
            reply: (v.reply && typeof v.reply.t === 'string') ? { id: String(v.reply.id || ''), uid: String(v.reply.uid || ''), t: v.reply.t } : null });
        }
      });
      list.sort(function (a, b) { return a.ts - b.ts || (a.id < b.id ? -1 : 1); });
      cleanOld(id, list);
      state.more = snap.size >= state.lim;
      var fresh = (firstLoad || paging) ? [] : list.filter(function (m) { return !before.has(m.id) && m.uid !== state.me; });
      var away = !nearBottom();
      state.msgs = list;
      state.loaded = true;
      if (firstLoad) state.stick = true;
      var h0 = logEl.scrollHeight, t0 = logEl.scrollTop;
      render();
      if (paging) { logEl.scrollTop = t0 + (logEl.scrollHeight - h0); return; }
      if (fresh.length && away) jumpBtn.hidden = false;
      if (fresh.length) notifyIncoming(fresh[fresh.length - 1]);
      if (firstLoad || fresh.length) markSeen();
    }, function (err) {
      state.dead = err && err.code === 'permission-denied'
        ? 'Accès refusé. Vérifie que les règles Firestore de LISEZMOI.md sont publiées.'
        : 'La connexion a été interrompue. Recharge la page pour reprendre.';
      state.loaded = true;
      ta.disabled = true; sendBtn.disabled = true;
      render();
    });
    }
    subMsgs();
    state.loadOlder = function () {
      if (!state.more || state.paging) return;
      state.paging = true; state.lim += 20;
      if (unsubMsgs) unsubMsgs(); unsubMsgs = null;
      subMsgs();
    };

    unsubPres = state.chat.group ? null : fs.collection('presence').doc(otherUid).onSnapshot(function (d) {
      state.otherPres = d.exists ? d.data() : null;
      var ph = state.otherPres && typeof state.otherPres.photo === 'string' ? state.otherPres.photo : null;
      if (photos[otherUid] !== ph) { photos[otherUid] = ph; paintPhoto($('#chatAvatar'), otherUid, otherName); }
      var pn = state.otherPres && typeof state.otherPres.name === 'string' && state.otherPres.name;
      if (pn && state.chat && state.chat.other === otherUid && !nickOf(chatOf(state.chat.id), otherUid) && pn !== state.chat.name) { state.chat.name = pn; $('#chatName').textContent = cap(pn); paintPhoto($('#chatAvatar'), otherUid, pn); }
      renderStatus();
    }, function () {});
    liveWatch(state.chat);
  }

  function leaveChat() {
    var vnw = document.getElementById('viewNews'); if (vnw) vnw.hidden = true;
    applyBg(null); delete document.documentElement.dataset.ct;
    cancelEdit(); state.picker = null;
    setTyping(false);
    stopRec(true);
    if (unsubMsgs) unsubMsgs(); unsubMsgs = null;
    if (unsubPres) unsubPres(); unsubPres = null;
    liveUnwatch();
    stopVoices(); state.chat = null; state.msgs = []; state.otherPres = null;
  }




/* E'cho — js/app/09-notifications.js
   Alertes, préférences de notifications, panneau des réglages, ouverture depuis une notification
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- alertes : son, vibration, notification ---------- */
  var audioCtx = null;
  function beep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.08, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.25);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.25);
    } catch (e) {}
  }
  var NOTIF_TITLE = 'Vous avez un nouveau message E\'cho \u2764\uFE0F\u200D\uD83E\uDE79';
  /* ---------- préférences de notifications (propres à cet appareil) ---------- */
  var NP_DEF = { msg: 1, friends: 1, news: 1, sound: 1, vib: 1, quiet: 0, qFrom: '22:00', qTo: '07:00', muteUntil: 0 };
  function npGet() {
    var o = {}; try { o = JSON.parse(store('uandi-np') || '{}') || {}; } catch (e) {}
    var r = {}; for (var k in NP_DEF) r[k] = (k in o) ? o[k] : NP_DEF[k];
    return r;
  }
  function npSet(k, v) { var p = npGet(); p[k] = v; store('uandi-np', JSON.stringify(p)); npSync(); }
  function npMin(t) { var m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
  function npQuiet() {
    var p = npGet(); if (p.muteUntil > Date.now()) return true;
    if (!p.quiet) return false;
    var d = new Date(), n = d.getHours() * 60 + d.getMinutes(), a = npMin(p.qFrom), b = npMin(p.qTo);
    if (a === b) return false;
    return a < b ? (n >= a && n < b) : (n >= a || n < b);
  }
  function npOn(kind) { return !!npGet()[kind]; }
  /* le service worker lit ces réglages (IndexedDB) : pendant « ne pas déranger », les push arrivent sans son */
  function npSync() {
    try {
      var p = JSON.stringify(npGet()), rq = indexedDB.open('uandi-np', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () { try { rq.result.transaction('kv', 'readwrite').objectStore('kv').put(p, 'np'); } catch (e) {} };
    } catch (e) {}
  }
  /* son + vibration selon les réglages ; renvoie false si l'appareil doit rester silencieux */
  function fx() {
    if (npQuiet()) return false;
    if (npOn('sound')) beep();
    if (npOn('vib')) { try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {} }
    return true;
  }
  function voiceOn() { return store('uandi-voice') !== '0'; }
  var speakU = null, frVoice = null, speechOk = false;
  function pickVoice() {
    try {
      var vs = speechSynthesis.getVoices() || [];
      frVoice = vs.filter(function (v) { return /^fr/i.test(v.lang); })[0] || null;
    } catch (e) {}
  }
  try {
    if (window.speechSynthesis) {
      pickVoice();
      if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', pickVoice);
    }
  } catch (e) {}
  /* les navigateurs n'autorisent la voix qu'après un premier geste : on la « débloque » au premier appui */
  function unlockSpeech() {
    if (speechOk) return; speechOk = true;
    try {
      var u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'fr-FR';
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  var lastUnlock = 0;
  function reUnlock() {
    var now = Date.now();
    if (!window.speechSynthesis || now - lastUnlock < 30000) return;
    lastUnlock = now;
    try {
      var ss = window.speechSynthesis;
      if (ss.paused) ss.resume();
      if (!ss.speaking && !ss.pending) { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'fr-FR'; ss.speak(u); }
    } catch (e) {}
    if (!frVoice) pickVoice();
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, unlockSpeech, { once: true, passive: true }); document.addEventListener(ev, reUnlock, { passive: true }); });
  function speakNew(force, onFail) {
    try {
      var ss = window.speechSynthesis;
      if (!ss) { if (onFail) onFail('non pris en charge par ce navigateur'); return; }
      var inCall = false; try { inCall = typeof C !== 'undefined' && !!C.role; } catch (e) {}
      if (!force && (!voiceOn() || inCall)) return;
      if (!frVoice) pickVoice();
      var attempt = 0;
      function say(useVoice) {
        var u = new SpeechSynthesisUtterance('Vous avez un nouveau message'), started = false, failed = false;
        u.lang = 'fr-FR'; u.volume = 1; u.rate = 1; u.pitch = 1;
        if (useVoice && frVoice) u.voice = frVoice;
        u.onstart = function () { started = true; };
        u.onerror = function (ev) {
          var er = ev && ev.error;
          if (er === 'canceled' || er === 'interrupted') return;
          failed = true;
          if (attempt++ < 1) { try { ss.cancel(); } catch (x) {} setTimeout(function () { say(false); }, 200); }
          else if (onFail) onFail(er || 'erreur');
        };
        speakU = u;
        try { ss.speak(u); } catch (e) { if (onFail) onFail('lecture impossible'); return; }
        /* certains téléphones laissent la voix en attente sans rien dire : on relance une fois, sans voix imposée */
        setTimeout(function () {
          if (started || failed || ss.speaking) return;
          if (attempt++ < 1) { try { ss.cancel(); } catch (x) {} setTimeout(function () { say(false); }, 200); }
          else if (onFail) onFail('aucune voix française installée ou volume média à zéro');
        }, 1600);
      }
      try { if (ss.paused) ss.resume(); } catch (e) {}
      if (ss.speaking || ss.pending) { ss.cancel(); setTimeout(function () { say(true); }, 200); }
      else say(true);
    } catch (e) { if (onFail) onFail('erreur'); }
  }
  function voiceFail(why) {
    try { showToast(null, 'Voix indisponible', 'Cause : ' + why + '. Sur Android : Réglages \u2192 Synthèse vocale \u2192 installe ou choisis le français, puis vérifie le volume média.'); } catch (e) {}
  }
  function paintVoiceSeg() {
    var on = voiceOn() ? '1' : '0';
    document.querySelectorAll('#voiceSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === on ? 'true' : 'false'); });
  }
  $('#voiceSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    store('uandi-voice', b.dataset.v); paintVoiceSeg();
    if (b.dataset.v === '1') speakNew(true, voiceFail); else { try { speechSynthesis.cancel(); } catch (x) {} }
  });
  paintVoiceSeg();
  function sysNotify(name, text, chatId, silent) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      var opt = { body: (name ? cap(name) + ' : ' : '') + (text || ''), tag: 'uandi-' + (chatId || 'msg'), renotify: !silent && !(PUSH && PUSH.token), icon: 'icon-192.png', badge: 'icon-192.png', data: { chat: chatId || '' } };
      if (silent) opt.silent = true; else if (npOn('vib')) opt.vibrate = [120, 60, 120];
      var plain = function () { try { new Notification(NOTIF_TITLE, opt); } catch (e) {} };
      if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(function (r) { if (r) r.showNotification(NOTIF_TITLE, opt); else plain(); }).catch(plain); else plain();
    } catch (e) {}
  }
  function notifyIncoming(m) {
    if (!npOn('msg')) return;
    var loud = fx();
    if (document.hidden && !(PUSH && PUSH.token)) sysNotify(state.chat ? state.chat.name : '', m.text, state.chat ? state.chat.id : '', !loud);
    if (loud) speakNew();
  }
  $('#notifTest').addEventListener('click', function () {
    /* la voix part tout de suite, dans le geste du doigt (sinon le navigateur la bloque) */
    if (voiceOn()) speakNew(true, voiceFail);
    var go = function () {
      beep(); try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
      sysNotify('E\'cho', 'Ceci est un test de notification.'); showToast(null, 'E\'cho', 'Ceci est un test de notification.');
    };
    try {
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(function () { go(); pushSetup().then(pushReport); }, go); else { go(); pushSetup().then(pushReport); }
    } catch (e) { go(); }
  });
  document.addEventListener('click', function askNotif() {
    document.removeEventListener('click', askNotif);
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(function () { pushSetup(); }); } catch (e) {}
  });

  /* ---------- panneau Notifications des réglages ---------- */
  function npMsg(t) { var m = $('#nMsg'); if (m) m.textContent = t || ''; }
  function npPaint() {
    var st = $('#nStat'); if (!st) return;
    var perm = ('Notification' in window) ? Notification.permission : 'unsupported', t, sub, k;
    if (perm === 'unsupported') { k = 'bad'; t = 'Non pris en charge'; sub = 'Ouvre E\'cho dans Chrome ou installe l’appli sur l’écran d’accueil.'; }
    else if (perm === 'denied') { k = 'bad'; t = 'Bloquées'; sub = 'Autorise-les dans les réglages du téléphone : Applis › E\'cho › Notifications (ou Chrome › Paramètres du site).'; }
    else if (perm === 'default') { k = 'warn'; t = 'Pas encore activées'; sub = 'Appuie sur « Activer » pour recevoir les messages même appli fermée.'; }
    else if (PUSH.token) { k = 'ok'; t = 'Actives, même appli fermée'; sub = npQuiet() ? 'Mode silencieux en ce moment.' : 'Cet appareil est enregistré.'; }
    else { k = 'warn'; t = 'Autorisées, push non enregistré'; sub = PUSH.err ? 'Cause : ' + PUSH.err : 'Enregistrement en cours…'; }
    if (PUSH.lastSend) sub += ' Dernier envoi : ' + PUSH.lastSend + '.';
    st.setAttribute('data-s', k); $('#nStatT').textContent = t; $('#nStatS').textContent = sub;
    var en = $('#nEnable'); en.hidden = !(perm === 'default' || (perm === 'granted' && !PUSH.token));
    en.textContent = perm === 'granted' ? 'Réessayer l’enregistrement' : 'Activer les notifications';
    $('#pushTest').hidden = !PUSH.token;
    var p = npGet();
    document.querySelectorAll('#notifSec [data-np]').forEach(function (i) { i.checked = !!p[i.getAttribute('data-np')]; });
    $('#npFrom').value = p.qFrom; $('#npTo').value = p.qTo; $('#npTimes').hidden = !p.quiet;
    $('#npMuteInfo').textContent = p.muteUntil > Date.now() ? 'Sourdine jusqu’à ' + new Date(p.muteUntil).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '.' : '';
    var sm = document.querySelector('#notifSec .sxh small');
    if (sm) sm.textContent = k === 'ok' ? (npQuiet() ? 'Actives · mode silencieux' : 'Actives, même appli fermée') : t;
  }
  document.querySelectorAll('#notifSec [data-np]').forEach(function (i) {
    i.addEventListener('change', function () { npSet(i.getAttribute('data-np'), i.checked ? 1 : 0); npPaint(); });
  });
  $('#npFrom').addEventListener('change', function () { npSet('qFrom', this.value || '22:00'); npPaint(); });
  $('#npTo').addEventListener('change', function () { npSet('qTo', this.value || '07:00'); npPaint(); });
  $('#npMute').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var m = b.dataset.m, t = 0, d = new Date();
    if (m === '1') t = Date.now() + 36e5; else if (m === '8') t = Date.now() + 288e5;
    else if (m === 'tom') { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); t = d.getTime(); }
    npSet('muteUntil', t); npPaint();
  });
  $('#nEnable').addEventListener('click', function () {
    npMsg('Activation…');
    var go = function () { return pushSetup().then(function () { npPaint(); npMsg(PUSH.token ? 'Notifications activées sur cet appareil ✓' : 'Échec : ' + (PUSH.err || 'inconnu')); }); };
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().then(go, go); else go(); } catch (e) { go(); }
  });
  /* test réel : le message part quand tu quittes l'appli, donc la notification arrive appli en arrière-plan ou fermée */
  $('#pushTest').addEventListener('click', function () {
    if (!PUSH.url || !PUSH.token || !auth.currentUser) { npMsg('Active d’abord les notifications.'); return; }
    auth.currentUser.getIdToken().then(function (tok) {
      npMsg('Prêt. Quitte maintenant l’appli (écran d’accueil) : le test part tout seul et la notification arrive en quelques secondes.');
      var done = false, fire = function () {
        if (!document.hidden || done) return;
        done = true; document.removeEventListener('visibilitychange', fire);
        try {
          fetch(PUSH.url + '/notify', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ to: [state.me], title: NOTIF_TITLE, body: 'Test réussi ✅ : les notifications marchent appli fermée.', chat: '' }) })
            .then(function (r) { PUSH.lastSend = 'test HTTP ' + r.status; }).catch(function () {});
        } catch (e) {}
      };
      document.addEventListener('visibilitychange', fire);
      setTimeout(function () { document.removeEventListener('visibilitychange', fire); if (!done) { npMsg('Test annulé : tu n’as pas quitté l’appli. Réessaie.'); } }, 60000);
    }).catch(function (e) { npMsg('Erreur : ' + ((e && (e.code || e.message)) || e)); });
  });
  new MutationObserver(function () { if ($('#settings').open) npPaint(); }).observe($('#settings'), { attributes: true, attributeFilter: ['open'] });
  npSync();
  /* toucher une notification ouvre la bonne discussion (appli fermée : ?chat=… ; appli ouverte : message du service worker) */
  var PENDING_CHAT = ''; try { PENDING_CHAT = new URLSearchParams(location.search).get('chat') || ''; } catch (e) {}
  function openChatById(id) {
    if (!id || id === 'news' || id === 'friends') return false;
    var c = chatOf(id); if (!c) return false;
    if (c.group) { openChat('', c.title || 'Groupe', c); return true; }
    var other = (c.members || []).filter(function (x) { return x !== state.me; })[0];
    if (!other) return false;
    openChat(other, (c.names && c.names[other]) || ''); return true;
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'uandi-open' && d.chat && !openChatById(d.chat)) PENDING_CHAT = d.chat;
  });

  var lastSeenWrite = 0;
  function markSeen() {
    if (!state.chat || document.hidden || !state.chatsById[state.chat.id]) return;
    var now = Date.now();
    if (now - lastSeenWrite < 1500) return;
    lastSeenWrite = now;
    var patch = {}; patch['seen.' + state.me] = now;
    fs.collection('chats').doc(state.chat.id).update(patch).catch(function () {});
  }

  /* rendu incrémental : une ligne n'est reconstruite que si ce qui l'affecte a changé (plus de clignotement, scroll et lecteurs vocaux conservés) */
  var RC = {}, RCchat = '', RCready = false;
  function buildRow(m, next, joinPrev, joinNext, mine, rx, rxN, myRx) {
    var row = el('div', 'row ' + (mine ? 'mine' : 'theirs') +
      (joinPrev ? '' : ' first') + (joinNext ? '' : ' last') +
      (state.open.has(m.id) ? ' open' : '') + (rxN ? ' liked' : '') + (RCready ? ' in' : ''));
    row.dataset.id = m.id;
    if (!mine && !joinPrev) {
      var gcc = chatOf(state.chat.id), sn = gcc && gcc.names && gcc.names[m.uid];
      row.appendChild(withBadge(el('div', 'sname', cap(nickOf(gcc, m.uid) || sn || (!state.chat.group && state.chat.name) || 'Membre')), m.uid));
    }
    var wrap = el('div', 'bwrap');
    if (!mine) {
      row.classList.add('gav');
      if (!joinNext) {
        var gc2 = chatOf(state.chat.id), gnm = nickOf(gc2, m.uid) || (gc2 && gc2.names && gc2.names[m.uid]) || (!state.chat.group && state.chat.name) || 'Membre';
        var gav = el('div', 'avatar gavatar'); paintPhoto(gav, m.uid, gnm); loadPhoto(m.uid);
        wrap.appendChild(gav);
      }
    }
    var scEl = (!m.audio && !m.img && !m.file) ? shortCardEl(m.text) : null;
    var bub = el('div', 'bubble' + (m.audio ? ' voice' : '') + (m.img ? ' photo' : '') + (m.file ? ' filemsg' : '') + (scEl ? ' shortmsg' : ''));
    if (m.audio) {
      if (m.music) bub.appendChild(el('div', 'mtag', '♪ ' + m.music));
      bub.appendChild(voiceUI(m));
    }
    else if (m.img) {
      var pim = PIMG[m.id];
      if (!pim) { pim = PIMG[m.id] = el('img', 'pimg'); pim.alt = 'Photo'; pim.decoding = 'async'; pim.src = m.img; }
      bub.appendChild(pim);
    } else if (m.file) { bub.appendChild(fileCard(m)); } else if (scEl) { bub.appendChild(scEl); } else bub.textContent = m.text;
    if (m.reply && typeof m.reply.t === 'string') bub.insertBefore(quoteEl(m.reply), bub.firstChild);
    wrap.appendChild(bub);
    var rxs = rxN ? rxSummary(rx) : '';
    if (rxN) wrap.appendChild(el('span', 'badge rx' + (RXSIG[m.id] !== undefined && RXSIG[m.id] !== rxs ? ' pop' : ''), rxs));
    RXSIG[m.id] = rxs;
    row.appendChild(wrap);
    if (state.picker === m.id) row.appendChild(freshPicker(pickerEl(myRx, mine && !m.audio && !m.img && !m.file), m.id)); else if (HOLD.shown === m.id) HOLD.shown = null;

    var meta = el('div', 'meta');
    meta.appendChild(el('span', '', timeFmt.format(new Date(m.ts)) + (m.edited ? ' · modifié' : '')));
    if (!isSys(m)) { var rp = el('button', 'rpl', 'Répondre'); rp.type = 'button'; meta.appendChild(rp); }
    if (!m.audio && !m.img && !m.file) {
      var cp = el('button', 'copy', 'Copier');
      cp.type = 'button';
      meta.appendChild(cp);
    }
    if (mine && (!next || isSys(next))) {
      var cs = state.chat && state.chats.filter(function (c) { return c.id === state.chat.id; })[0];
      var otherSeen = (cs && cs.seen && cs.seen[state.chat.other]) || 0;
      var opr = notePres[state.chat.other];
      if (otherSeen >= m.ts && !hideSeenOn() && !(opr && opr.hideSeen)) meta.appendChild(el('span', 'seenmark', '· Vu ' + timeFmt.format(new Date(otherSeen))));
    }
    var del = el('button', 'del', 'Supprimer');
    del.type = 'button';
    meta.appendChild(del);
    row.appendChild(meta);
    return row;
  }
  function rowSig(m, next, joinPrev, joinNext, mine, rx, myRx) {
    var gcc = chatOf(state.chat.id), sn = gcc && gcc.names && gcc.names[m.uid];
    var nm = nickOf(gcc, m.uid) || sn || (!state.chat.group && state.chat.name) || '';
    var seen = '';
    if (mine && (!next || isSys(next))) {
      var cs = state.chats.filter(function (c) { return c.id === state.chat.id; })[0];
      var opr = notePres[state.chat.other];
      seen = ((cs && cs.seen && cs.seen[state.chat.other]) || 0) + (hideSeenOn() ? 'h' : '') + (opr && opr.hideSeen ? 'o' : '');
    }
    var ph = photos[m.uid]; ph = ph ? ph.length : 0;
    var bd = ''; try { bd = JSON.stringify([badges[m.uid] || 0, verifs[m.uid] || 0, assists[m.uid] || 0]); } catch (e) {}
    return [m.id, m.uid, m.text, m.ts, m.edited ? 1 : 0, m.audio ? m.audio.length : 0, m.dur, m.music, m.img ? m.img.length : 0, m.file ? m.file.d.length + '|' + m.file.g : 0,
      m.reply ? m.reply.id + '|' + m.reply.uid + '|' + m.reply.t : '', JSON.stringify(rx), myRx, mine ? 1 : 0, joinPrev ? 1 : 0, joinNext ? 1 : 0,
      state.open.has(m.id) ? 1 : 0, state.picker === m.id ? 1 : 0, (next && !isSys(next)) ? 1 : 0, nm, ph, bd, seen, state.chat.group ? 1 : 0].join('\u0001');
  }
  function render() {
    var wasNear = nearBottom();
    var want = [];
    var cid = state.chat ? state.chat.id : '';
    if (cid !== RCchat) { RC = {}; RCchat = cid; RCready = false; }
    var used = {};
    function cached(key, sig, build) {
      used[key] = 1;
      var c = RC[key];
      if (c && c.sig === sig) return c.node;
      var node = build();
      RC[key] = { sig: sig, node: node };
      return node;
    }
    if (state.dead) {
      var d = el('div', 'empty');
      d.appendChild(el('strong', '', 'Discussion indisponible'));
      d.appendChild(document.createTextNode(state.dead));
      want.push(d);
    } else if (!state.loaded) {
      want.push(el('div', 'loading', 'Chargement des messages…'));
    } else if (!visibleMsgs().length) {
      var e = el('div', 'empty');
      e.appendChild(el('strong', '', 'Dis bonjour à ' + cap(state.chat ? state.chat.name : '')));
      e.appendChild(document.createTextNode('Votre premier message apparaîtra ici, en direct.'));
      want.push(e);
    } else {
      var FIVE = 5 * 60 * 1000, msgs = visibleMsgs();
      if (state.more) {
        want.push(cached('more', '1', function () {
          var ob = el('button', 'ghost', 'Charger les messages précédents');
          ob.type = 'button'; ob.style.cssText = 'align-self:center;margin:8px 0';
          ob.addEventListener('click', function () { if (state.loadOlder) state.loadOlder(); });
          return ob;
        }));
      }
      for (var i = 0; i < msgs.length; i++) {
        var m = msgs[i], prev = msgs[i - 1], next = msgs[i + 1];
        var newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
        if (newDay) {
          var dl = dayLabel(m.ts);
          want.push(cached('d' + m.id, dl, function () { return el('div', 'day', dl); }));
        }
        if (isSys(m)) { var stx = m.text.slice(1); want.push(cached('s' + m.id, stx, function () { return el('div', 'sysnote', stx); })); continue; }
        var joinPrev = prev && !isSys(prev) && !newDay && prev.uid === m.uid && m.ts - prev.ts < FIVE;
        var joinNext = next && !isSys(next) && next.uid === m.uid &&
          new Date(next.ts).toDateString() === new Date(m.ts).toDateString() && next.ts - m.ts < FIVE;
        var mine = m.uid === state.me;
        var rx = reactionsOf(m), rxN = Object.keys(rx).length, myRx = rx[state.me] || '';
        (function (m, next, joinPrev, joinNext, mine, rx, rxN, myRx) {
          want.push(cached('r' + m.id, rowSig(m, next, joinPrev, joinNext, mine, rx, myRx), function () {
            return buildRow(m, next, joinPrev, joinNext, mine, rx, rxN, myRx);
          }));
        })(m, next, joinPrev, joinNext, mine, rx, rxN, myRx);
      }
    }
    Object.keys(RC).forEach(function (k) { if (!used[k]) delete RC[k]; });
    if (state.loaded && !state.dead) RCready = true;
    /* mise à jour minimale du DOM : on ne déplace/retire que ce qui diffère */
    var cur = logEl.firstChild;
    for (var j = 0; j < want.length; j++) {
      var nd = want[j];
      if (cur === nd) cur = cur.nextSibling;
      else logEl.insertBefore(nd, cur);
    }
    while (cur) { var nx = cur.nextSibling; logEl.removeChild(cur); cur = nx; }
    if (state.stick || wasNear) { scrollBottom(); state.stick = false; }
    if (state.loaded && !state.dead) SCROLL_WARM = true;
  }

  function autosize() {
    var prevH = ta.offsetHeight;
    ta.style.height = 'auto';
    var nextH = Math.min(ta.scrollHeight, 152);
    if (prevH && prevH !== nextH) { ta.style.height = prevH + 'px'; ta.getBoundingClientRect(); }
    ta.style.height = nextH + 'px';
    var c = $('#count'), n = ta.value.length;
    c.hidden = n < 1500;
    c.textContent = n + ' / 2000';
    c.classList.toggle('warn', n >= 1900);
  }

  /* Short YouTube partagé : le message contient un lien ?short=ID, affiché comme une carte cliquable */
  function shortCardEl(text) {
    var m = /(https?:\/\/[^\s]+?[?&]short=([\w-]{11}))/.exec(String(text || ''));
    if (!m) return null;
    var id = m[2], cap = String(text).replace(m[1], '').replace(/\s+/g, ' ').trim();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'shcard';
    var th = document.createElement('span'); th.className = 'shthumb';
    var im = document.createElement('img'); im.alt = ''; im.loading = 'lazy'; im.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; th.appendChild(im);
    var pl = document.createElement('i'); pl.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>'; th.appendChild(pl);
    var tx = document.createElement('span'); tx.className = 'shcap';
    var t1 = document.createElement('b'); t1.textContent = 'Short'; tx.appendChild(t1);
    var t2 = document.createElement('small'); t2.textContent = cap || 'Appuie pour regarder'; tx.appendChild(t2);
    b.appendChild(th); b.appendChild(tx);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (window.EchoShorts && window.EchoShorts.openVideo) window.EchoShorts.openVideo(id);
      else window.open(m[1], '_blank', 'noopener');
    });
    return b;
  }

  async function send() {
    var text = ta.value.trim();
    var chat = state.chat;
    if (!text || !state.me || !chat || ta.disabled) return;
    if (state.editing) { saveEdit(text); return; }
    ta.value = '';
    autosize();
    store('uandi-draft-' + chat.id, null);
    setTyping(false);
    showErr('');
    state.stick = true;
    try {
      var chatRef = fs.collection('chats').doc(chat.id);
      var msgRef = chatRef.collection('messages').doc();
      var ts = Date.now();
      var exists = !!state.chatsById[chat.id];
      if (!exists) { exists = (await chatRef.get()).exists; }
      var batch = fs.batch();
      batch.set(msgRef, withReply({ uid: state.me, sts: SV(), text: text, ts: ts }));
      var last = { lastText: text.slice(0, 120), lastTs: ts, lastUid: state.me };
      if (exists) {
        last['seen.' + state.me] = ts;
        var inv0 = (chatOf(chat.id) || {}).invite;
        if (inv0) {
          if (inv0.from === state.me) {
            if (inv0.st === 'declined') { var e1 = new Error('inv'); e1.inv = 'Cette personne a refusé ton invitation.'; throw e1; }
            if ((inv0.n || 0) >= INV_MAX) { var e2 = new Error('inv'); e2.inv = 'Invitation : ' + INV_MAX + ' messages maximum tant qu’elle n’est pas acceptée.'; throw e2; }
            last['invite.n'] = firebase.firestore.FieldValue.increment(1);
          } else last.invite = firebase.firestore.FieldValue.delete();
        }
        batch.update(chatRef, last);
      } else {
        var names = {}; names[state.me] = myName(); names[chat.other] = chat.name;
        var seen = {}; seen[state.me] = ts;
        batch.set(chatRef, {
          members: [state.me, chat.other], names: names,
          lastText: last.lastText, lastTs: ts, lastUid: state.me, seen: seen
        });
      }
      await batch.commit();
      state.chatsById[chat.id] = true;
      pushNotify(chat, text);
    } catch (e) {
      ta.value = text;
      autosize();
      showErr(e && e.inv ? e.inv : 'Message non envoyé. Vérifie ta connexion et réessaie.');
    }
  }

  /* Envoi d'un message depuis une autre partie de l'appli (réponse à une story, réaction) */
  window.UIChat = {
    sendTo: async function (uid, name, text, reply) {
      if (!state.me || !uid || !text) { var e0 = new Error('x'); e0.inv = 'Message non envoyé'; throw e0; }
      var cid = chatIdFor(state.me, uid), chatRef = fs.collection('chats').doc(cid), msgRef = chatRef.collection('messages').doc(), ts = Date.now();
      var exists = !!state.chatsById[cid]; if (!exists) exists = (await chatRef.get()).exists;
      var m = { uid: state.me, sts: SV(), text: String(text).slice(0, 2000), ts: ts };
      if (reply && typeof reply.t === 'string') m.reply = { id: String(reply.id || ''), uid: String(reply.uid || ''), t: reply.t };
      var batch = fs.batch(); batch.set(msgRef, m);
      var last = { lastText: m.text.slice(0, 120), lastTs: ts, lastUid: state.me };
      if (exists) {
        last['seen.' + state.me] = ts;
        var inv0 = (chatOf(cid) || {}).invite;
        if (inv0) {
          if (inv0.from === state.me) {
            if (inv0.st === 'declined') { var e1 = new Error('inv'); e1.inv = 'Cette personne a refusé ton invitation.'; throw e1; }
            if ((inv0.n || 0) >= INV_MAX) { var e2 = new Error('inv'); e2.inv = 'Invitation : ' + INV_MAX + ' messages maximum tant qu’elle n’est pas acceptée.'; throw e2; }
            last['invite.n'] = firebase.firestore.FieldValue.increment(1);
          } else last.invite = firebase.firestore.FieldValue.delete();
        }
        batch.update(chatRef, last);
      } else {
        var names = {}; names[state.me] = myName(); names[uid] = name || '';
        var seen = {}; seen[state.me] = ts;
        batch.set(chatRef, { members: [state.me, uid], names: names, lastText: last.lastText, lastTs: ts, lastUid: state.me, seen: seen });
      }
      await batch.commit();
      state.chatsById[cid] = true;
      pushNotify({ id: cid, other: uid, name: name || '' }, m.text);
    },
    list: function () {
      return state.chats.filter(function (c) { return !(c.invite && c.invite.st === 'declined'); }).map(function (c) {
        var other = (c.members || []).filter(function (x) { return x !== state.me; })[0] || '';
        var name = c.group ? (c.title || 'Groupe') : (nickOf(c, other) || (c.names && c.names[other]) || 'Discussion');
        return { id: c.id, uid: c.group ? '' : other, name: name, group: !!c.group, ts: c.lastTs || 0 };
      }).sort(function (a, b) { return b.ts - a.ts; });
    },
    paint: function (node, uid, name) { try { paintPhoto(node, uid, name); if (uid) loadPhoto(uid); } catch (e) {} },
    sendToChat: async function (cid, text) {
      var c = chatOf(cid);
      if (!c || !state.me) { var e0 = new Error('x'); e0.inv = 'Discussion introuvable'; throw e0; }
      if (!c.group) {
        var other = (c.members || []).filter(function (x) { return x !== state.me; })[0];
        return window.UIChat.sendTo(other, (c.names && c.names[other]) || '', text);
      }
      var chatRef = fs.collection('chats').doc(cid), msgRef = chatRef.collection('messages').doc(), ts = Date.now();
      var t = String(text).slice(0, 2000), batch = fs.batch();
      batch.set(msgRef, { uid: state.me, sts: SV(), text: t, ts: ts });
      var last = { lastText: t.slice(0, 120), lastTs: ts, lastUid: state.me }; last['seen.' + state.me] = ts;
      batch.update(chatRef, last);
      await batch.commit();
      pushNotify({ id: cid, group: true, name: c.title || 'Groupe' }, t);
    }
  };

  async function toggleLike(id) {
    if (!state.chat || busy.has(id)) return;
    var m = state.msgs.find(function (x) { return x.id === id; });
    var now = !(m && m.likes && m.likes[state.me] === true);
    busy.add(id);
    try {
      var patch = {}; patch['likes.' + state.me] = now;
      await fs.collection('chats').doc(state.chat.id).collection('messages').doc(id).update(patch);
    } catch (e) {
      showErr('Le cœur n’a pas pu être enregistré.');
    } finally { busy.delete(id); }
  }




/* E'cho — js/app/10-actions-messages.js
   Supprimer et répondre à un message
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- supprimer un message : pour tout le monde (laisse « Message effacé ») ou pour moi seulement ---------- */
  function hmKey() { return 'uandi-hm-' + state.me + '-' + (state.chat ? state.chat.id : ''); }
  function hiddenMsgs() { try { return JSON.parse(store(hmKey()) || '[]') || []; } catch (e) { return []; } }
  function visibleMsgs() {
    var h = hiddenMsgs();
    return h.length ? state.msgs.filter(function (m) { return h.indexOf(m.id) === -1; }) : state.msgs;
  }
  function hideMsgForMe(id) {
    var h = hiddenMsgs();
    if (h.indexOf(id) === -1) h.push(id);
    store(hmKey(), JSON.stringify(h.slice(-500)));
    state.open.delete(id); if (state.picker === id) state.picker = null;
    render();
  }
  /* nettoyage automatique (mes propres messages) : vocaux intégrés (data:) > 20 jours — ceux sur Cloudinary sont gardés —, messages effac\u00e9s > 5 jours */
  var CLEANED = {};
  function cleanPhotos(chatId, list, manual) {
    var cut = Date.now() - 7 * 86400000, n = 0, FV = firebase.firestore.FieldValue;
    list.forEach(function (m) {
      if (m.uid !== state.me || !m.img || String(m.img).slice(0, 11) !== 'data:image/' || m.ts >= cut || (CLEANED[m.id] && !manual)) return;
      CLEANED[m.id] = 1; n++;
      fs.collection('chats').doc(chatId).collection('messages').doc(m.id)
        .update({ img: FV.delete(), text: '\uD83D\uDCF7 Photo retir\u00e9e' }).catch(function () {});
    });
    return n;
  }
  function cleanOld(chatId, list) {
    var now = Date.now(), D = 86400000;
    list.forEach(function (m) {
      if (m.uid !== state.me || CLEANED[m.id]) return;
      var ref = fs.collection('chats').doc(chatId).collection('messages').doc(m.id);
      if (m.text === SYS + 'Message effac\u00e9' && now - (m.delAt || m.ts) > 5 * D) {
        CLEANED[m.id] = 1; ref.delete().catch(function () {});
      } else if (m.audio && !isCld(String(m.audio)) && now - m.ts > 20 * D) {
        CLEANED[m.id] = 1;
        var del = firebase.firestore.FieldValue.delete();
        ref.update({ audio: del, dur: del, music: del, text: SYS + 'Message effac\u00e9', delAt: now }).catch(function () {});
      }
    });
  }
  async function eraseForAll(id) {
    var chat = state.chat, m = state.msgs.find(function (x) { return x.id === id; });
    if (!chat || !m || m.uid !== state.me) return;
    var del = firebase.firestore.FieldValue.delete();
    var ref = fs.collection('chats').doc(chat.id), mref = ref.collection('messages').doc(id);
    var newest = state.msgs.reduce(function (a, x) { return Math.max(a, x.ts); }, 0);
    try {
      try { await mref.update({ text: SYS + 'Message effac\u00e9', delAt: Date.now(), edited: false, audio: del, img: del, file: del, reply: del, dur: del, music: del, likes: del, reacts: del }); }
      catch (e) { await mref.update({ text: SYS + 'Message effac\u00e9' }); }
      if (m.ts === newest) ref.update({ lastText: 'Message effac\u00e9' }).catch(function () {});
    } catch (e) { showErr('Le message n\u2019a pas pu \u00eatre effac\u00e9.'); }
  }
  function delChoose(id) {
    var m = state.msgs.find(function (x) { return x.id === id; });
    if (!m) return;
    var old = document.querySelector('.sheetbg'); if (old) old.remove();
    var bg = el('div', 'sheetbg'), sh = el('div', 'sheet');
    var close = function () { if (bg.classList.contains('out')) return; bg.classList.add('out'); setTimeout(function () { bg.remove(); }, 210); };
    sh.appendChild(el('h3', '', 'Supprimer ce message ?'));
    var mkb = function (label, fn) {
      var b = el('button', 'pick', label); b.type = 'button';
      b.addEventListener('click', function () { close(); fn(); }); sh.appendChild(b);
    };
    if (m.uid === state.me) mkb('Supprimer pour tout le monde', function () { eraseForAll(id); });
    mkb('Supprimer pour moi seulement', function () { hideMsgForMe(id); });
    sh.appendChild(el('p', '', m.uid === state.me ? 'Pour tout le monde : il reste \u00ab Message effac\u00e9 \u00bb dans la discussion.' : 'Le message dispara\u00eet seulement chez toi.'));
    var cn = el('button', 'ghost', 'Annuler'); cn.type = 'button'; cn.style.marginTop = '10px'; cn.addEventListener('click', close);
    sh.appendChild(cn); bg.appendChild(sh);
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.body.appendChild(bg);
  }
  async function removeMsg(id) {
    if (!state.chat) return;
    try { await fs.collection('chats').doc(state.chat.id).collection('messages').doc(id).delete(); }
    catch (e) { showErr('Le message n’a pas pu être supprimé.'); }
  }

  /* ---------- répondre à un message ---------- */
  function replyText(m) {
    if (m.img) return '📷 Photo';
    if (m.file) return '📎 ' + m.file.n;
    if (m.audio) return m.music ? '♪ ' + m.music : '🎤 Message vocal';
    return String(m.text || '').slice(0, 120);
  }
  function clearReply() { state.reply = null; $('#replybar').hidden = true; }
  function withReply(o) {
    var r = state.reply;
    if (r) { o.reply = { id: r.id, uid: r.uid, t: r.t }; clearReply(); }
    return o;
  }
  function setReply(id) {
    var m = state.msgs.find(function (x) { return x.id === id; });
    if (!m || isSys(m) || ta.disabled || state.editing) return;
    state.reply = { id: m.id, uid: m.uid, t: replyText(m) };
    $('#replyWho').textContent = m.uid === state.me ? 'Toi' : cap(state.chat ? state.chat.name : '');
    $('#replyTxt').textContent = state.reply.t;
    $('#replybar').hidden = false;
    ta.focus();
  }
  $('#replyCancel').addEventListener('click', clearReply);
  function quoteEl(r) {
    var q = el('div', 'quote');
    q.dataset.q = r.id;
    q.appendChild(el('b', '', r.uid === state.me ? 'Toi' : cap(state.chat ? state.chat.name : '')));
    q.appendChild(el('span', '', r.t));
    return q;
  }
  function jumpTo(id) {
    var rows = logEl.querySelectorAll('.row'), row = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].dataset.id === id) { row = rows[i]; break; }
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('flash');
    setTimeout(function () { row.classList.remove('flash'); }, 1400);
  }
  /* tirer un message vers la droite = répondre (comme WhatsApp) */
  var SW = { row: null, bw: null, ico: null, x: 0, y: 0, active: false, armed: false, done: false };
  function swReset(animate) {
    if (SW.bw) {
      if (animate) SW.bw.style.transition = 'transform .5s var(--spring-soft)';
      SW.bw.style.transform = '';
      var bw = SW.bw, ico = SW.ico;
      setTimeout(function () { bw.style.transition = ''; if (ico && ico.parentNode) ico.remove(); }, 520);
    }
    SW.row = SW.bw = SW.ico = null; SW.active = SW.armed = false;
  }
  logEl.addEventListener('pointerdown', function (ev) {
    SW.done = false; swReset(false);
    var t = ev.target, bw = t.closest && t.closest('.bwrap');
    if (!bw || t.closest('button, input') || ta.disabled || state.editing) return;
    SW.row = bw.closest('.row'); SW.bw = bw; SW.x = ev.clientX; SW.y = ev.clientY;
  });
  logEl.addEventListener('pointermove', function (ev) {
    if (!SW.row || HOLD.slide) return;
    var dx = ev.clientX - SW.x, dy = ev.clientY - SW.y;
    if (!SW.active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { SW.row = SW.bw = null; return; }
      if (dx < 16 || dx < Math.abs(dy) * 1.5) return;
      SW.active = true; lpCancel();
      SW.ico = el('span', 'swipeico', '↩'); SW.bw.appendChild(SW.ico);
      try { logEl.setPointerCapture(ev.pointerId); } catch (e) {}
    }
    var x = Math.min(dx, 56 + Math.max(0, dx - 56) * 0.25, 90);
    SW.bw.style.transform = 'translateX(' + x + 'px)';
    SW.ico.style.opacity = Math.min(1, x / 56);
    var armed = dx >= 56;
    SW.ico.style.scale = armed ? '1.2' : String(0.5 + Math.min(1, x / 56) * 0.5);
    if (armed && !SW.armed) { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }
    SW.armed = armed;
  });
  ['pointerup', 'pointercancel'].forEach(function (n) {
    logEl.addEventListener(n, function () {
      if (!SW.row && !SW.active) return;
      var go = SW.active && SW.armed && n === 'pointerup', id = SW.row && SW.row.dataset.id, was = SW.active;
      swReset(true);
      if (was) SW.done = true;
      if (go) setReply(id);
    });
  });
  /* appui long (maintenir) sur un message : réactions emoji + modifier */
  var LP = { t: null, x: 0, y: 0, fired: false, row: null };
  function rowById(id) { var rs = logEl.children; for (var i = 0; i < rs.length; i++) if (rs[i].dataset && rs[i].dataset.id === id) return rs[i]; return null; }
  function freshPicker(box, id) {
    var n = Date.now();
    if (HOLD.shown !== id) { HOLD.shown = id; HOLD.t0 = n; }
    var age = n - HOLD.t0;
    if (age < 450) {
      box.classList.add('fresh'); box.style.setProperty('--el', age + 'ms');
      for (var i = 0; i < box.children.length; i++) box.children[i].style.setProperty('--k', i);
    }
    return box;
  }
  function closePickerAnim(id, chosen, done) {
    var row = rowById(id), pk = row && row.querySelector('.picker');
    if (!pk || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { done(); return; }
    pk.classList.remove('fresh');
    if (chosen) [].forEach.call(pk.querySelectorAll('.rxb'), function (b) { if (b.dataset.e === chosen) b.classList.add('chosen'); });
    pk.classList.add('out');
    setTimeout(function () {
      if (pk.parentNode) pk.parentNode.removeChild(pk);
      delete RC['r' + id];
      done();
    }, chosen ? 200 : 160);
  }
  function setHot(b) {
    if (HOLD.hot === b) return;
    if (HOLD.hot) HOLD.hot.classList.remove('hot');
    HOLD.hot = b;
    if (b) { b.classList.add('hot'); try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {} }
  }
  function hotAt(x, y) {
    var row = HOLD.id && rowById(HOLD.id), pk = row && row.querySelector('.picker');
    if (!pk) return null;
    var r = pk.getBoundingClientRect();
    if (x < r.left - 14 || x > r.right + 14 || y < r.top - 46 || y > r.bottom + 46) return null;
    var best = null, bd = 1e9, bs = pk.querySelectorAll('.rxb');
    for (var i = 0; i < bs.length; i++) {
      var q = bs[i].getBoundingClientRect(), d = Math.abs(x - (q.left + q.width / 2));
      if (d < bd && (y > q.top - 46 && y < q.bottom + 46)) { bd = d; best = bs[i]; }
    }
    return best;
  }
  document.addEventListener('pointerdown', function (ev) { HOLD.down = logEl.contains(ev.target); }, true);
  document.addEventListener('pointermove', function (ev) { if (HOLD.slide) setHot(hotAt(ev.clientX, ev.clientY)); }, { passive: true });
  function endSlide(cancel) {
    HOLD.down = false;
    if (!HOLD.slide) return;
    HOLD.slide = false;
    var b = HOLD.hot, id = HOLD.id; setHot(null);
    if (b && !cancel && id) setReaction(id, b.dataset.e);
  }
  document.addEventListener('pointerup', function () { endSlide(false); }, true);
  document.addEventListener('pointercancel', function () { endSlide(true); }, true);
  logEl.addEventListener('touchmove', function (ev) { if (HOLD.slide && ev.cancelable) ev.preventDefault(); }, { passive: false });
  function msgHold(id) {
    var m = state.msgs.find(function (x) { return x.id === id; });
    if (!m) return;
    state.confirm = null; state.open.add(id); state.picker = id;
    var row = rowById(id);
    if (row && !row.querySelector('.picker')) {
      var near = nearBottom(), mine = m.uid === state.me;
      var pk = freshPicker(pickerEl(reactionsOf(m)[state.me] || '', mine && !m.audio && !m.img && !m.file), id);
      row.classList.add('open');
      row.insertBefore(pk, row.querySelector('.meta'));
      if (near && logEl.scrollTo) logEl.scrollTo({ top: logEl.scrollHeight, behavior: 'smooth' });
    } else render();
    if (HOLD.down) { HOLD.slide = true; HOLD.id = id; SW.row = SW.bw = null; }
  }
  function lpCancel() { clearTimeout(LP.t); LP.t = null; if (LP.row) { LP.row.classList.remove('pressing'); LP.row = null; } }
  logEl.addEventListener('pointerdown', function (ev) {
    LP.fired = false; lpCancel();
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    var t = ev.target, b = t.closest && t.closest('.bubble');
    if (!b || (t.closest('button, input') && !t.closest('.fcard'))) return;
    var row = b.closest('.row');
    if (!row) return;
    LP.x = ev.clientX; LP.y = ev.clientY; LP.row = row; row.classList.add('pressing');
    LP.t = setTimeout(function () {
      LP.t = null; LP.fired = true;
      if (LP.row) { LP.row.classList.remove('pressing'); LP.row = null; }
      try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
      msgHold(row.dataset.id);
    }, 380);
  });
  logEl.addEventListener('pointermove', function (ev) {
    if (LP.t && (Math.abs(ev.clientX - LP.x) > 10 || Math.abs(ev.clientY - LP.y) > 10)) lpCancel();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { logEl.addEventListener(n, lpCancel); });
  logEl.addEventListener('scroll', lpCancel, { passive: true });
  logEl.addEventListener('contextmenu', function (ev) {
    if (ev.target.closest && ev.target.closest('.bubble')) ev.preventDefault();
  });
  function closeMsgTools() {
    if (state.picker || state.open.size) {
      var pid = state.picker; state.picker = null; state.open.clear();
      if (pid) closePickerAnim(pid, '', render); else render();
    }
  }
  logEl.addEventListener('click', function (ev) {
    if (LP.fired) { LP.fired = false; return; }
    if (SW.done) { SW.done = false; return; }
    var t = ev.target;
    var qq = t.closest && t.closest('.quote');
    if (qq) { jumpTo(qq.dataset.q); return; }
    var row = t.closest && t.closest('.row');
    if (!row) { closeMsgTools(); return; }
    var id = row.dataset.id;
    if (t.closest('.vplay')) return;
    if (t.closest('.pimg')) { openPhoto(t.closest('.pimg').src); return; }
    var rb = t.closest('.rxb');
    if (rb) { setReaction(id, rb.dataset.e); return; }
    if (t.closest('.like')) { state.picker = state.picker === id ? null : id; render(); return; }
    if (t.closest('.edit')) { startEdit(id); return; }
    if (t.closest('.rpl')) { closeMsgTools(); setReply(id); return; }
    if (t.closest('.copy')) {
      var mm = state.msgs.find(function (x) { return x.id === id; });
      var btn = t.closest('.copy');
      if (mm && navigator.clipboard) {
        navigator.clipboard.writeText(mm.text).then(function () {
          btn.textContent = 'Copié ✓'; btn.classList.add('ok');
          setTimeout(function () { btn.textContent = 'Copier'; btn.classList.remove('ok'); }, 1500);
        }, function () {});
      }
      return;
    }
    if (t.closest('.del')) { delChoose(id); return; }
    closeMsgTools();
  });



/* E'cho — js/app/11-apparence-profil.js
   Mode sombre, thèmes de chat, photos de profil, surnom, changer mon nom
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- mode sombre, thèmes de chat, photos de profil ---------- */
  var modeMq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var SKIN_EFF = { nuit: 'dark', foret: 'dark', clair: 'light', rose: 'light', neant: 'dark' };
  var SKIN_FONT = { nuit: 'Roboto:wght@400;500;700', clair: 'Roboto:wght@400;500;700', foret: 'Roboto:wght@400;500;700', rose: 'Roboto:wght@400;500;700', neant: 'Roboto:wght@400;500;700' };
  var SKIN_BAR = { nuit: '#0A0C10', clair: '#FFFFFF', foret: '#0C1613', rose: '#FFE9F1', neant: '#070304' };
  var ICON_GLYPH = { w: 862.27, h: 1000.00, d: 'M843.1 5.1 L840.6 4.5 L838.0 6.2 L827.8 23.1 L821.1 31.2 L814.7 37.7 L806.7 43.6 L790.6 51.9 L783.3 58.3 L777.1 66.0 L771.0 75.2 L766.6 83.3 L763.6 91.4 L762.1 99.5 L761.6 108.8 L761.8 122.7 L763.1 131.9 L765.6 141.2 L770.9 156.2 L786.3 192.1 L792.7 210.6 L795.9 225.7 L797.0 245.4 L796.0 260.4 L794.6 269.7 L790.8 282.4 L786.7 292.8 L780.2 304.4 L771.2 317.1 L762.4 327.4 L754.6 334.0 L750.0 336.3 L746.5 336.9 L743.1 336.3 L739.6 334.8 L733.8 330.6 L716.4 314.5 L704.9 305.2 L692.1 297.2 L667.8 284.0 L655.1 278.8 L610.0 264.6 L593.8 261.9 L542.8 259.3 L526.6 259.8 L476.9 264.1 L436.3 271.4 L391.2 281.8 L370.4 289.5 L312.5 314.5 L302.1 320.4 L280.1 334.7 L248.8 356.4 L207.2 392.7 L197.1 402.8 L187.9 413.2 L156.9 451.4 L146.8 465.3 L125.0 503.5 L112.8 526.6 L106.2 542.8 L87.6 600.7 L79.4 643.5 L78.0 655.1 L76.7 675.9 L76.4 697.9 L76.9 716.4 L79.5 743.1 L88.7 782.4 L98.7 809.0 L113.2 840.3 L114.6 846.0 L114.0 850.6 L111.1 856.1 L106.2 861.3 L72.9 889.5 L46.3 914.4 L24.7 936.3 L9.8 953.7 L3.7 964.1 L1.8 969.9 L0.9 975.7 L1.0 981.5 L2.1 987.1 L4.0 991.2 L6.9 994.6 L11.8 997.3 L17.4 998.5 L55.6 1000.0 L68.3 999.7 L77.5 998.7 L83.1 997.3 L88.0 994.5 L91.0 991.2 L93.5 986.0 L97.1 965.3 L101.6 947.9 L105.3 937.5 L112.1 923.6 L119.9 910.9 L129.1 899.4 L137.8 891.2 L141.2 889.1 L144.7 887.9 L150.5 888.1 L156.2 890.7 L187.5 913.5 L201.4 921.8 L216.4 929.6 L241.9 940.0 L266.2 948.2 L275.5 950.7 L314.8 958.4 L344.9 960.5 L392.4 960.5 L447.9 957.3 L458.3 955.7 L483.8 949.8 L527.8 938.6 L550.9 929.4 L599.5 907.0 L627.3 890.8 L662.0 868.0 L695.6 839.6 L712.0 822.9 L739.7 785.9 L747.5 774.3 L754.2 761.6 L769.5 728.0 L775.0 713.0 L783.2 677.1 L785.8 660.9 L786.9 645.8 L785.5 626.2 L782.7 613.4 L776.7 599.5 L768.3 587.1 L763.4 582.0 L758.0 577.6 L743.1 568.9 L729.2 563.1 L713.0 558.8 L703.7 557.3 L695.6 556.8 L675.9 558.1 L660.9 561.3 L638.9 569.0 L623.8 577.9 L609.2 589.8 L597.5 603.0 L588.4 616.9 L582.1 630.8 L578.7 642.4 L577.6 653.9 L577.9 675.9 L579.8 687.5 L585.3 706.0 L599.6 743.1 L603.4 756.9 L604.8 767.4 L605.1 777.8 L604.0 791.7 L602.0 804.4 L598.3 818.3 L592.9 832.2 L587.2 842.6 L578.9 854.1 L570.1 863.7 L560.2 872.1 L546.3 881.6 L533.6 888.6 L512.7 897.0 L487.3 903.8 L471.1 906.6 L454.9 907.4 L437.5 906.4 L421.3 902.7 L406.2 897.2 L391.2 888.3 L377.4 877.0 L364.7 863.4 L355.0 849.5 L346.0 832.2 L337.2 809.0 L333.8 797.5 L326.7 761.6 L325.6 751.2 L326.0 743.1 L327.7 737.3 L330.3 732.8 L333.9 728.5 L340.3 722.5 L574.1 531.9 L589.1 520.5 L604.2 511.6 L629.6 498.4 L644.7 492.2 L669.0 484.0 L684.0 480.4 L721.1 476.4 L733.8 472.9 L739.5 470.3 L745.0 466.8 L750.0 462.3 L754.3 457.0 L758.4 450.2 L761.5 443.3 L765.8 428.2 L766.9 416.7 L765.9 386.6 L767.0 380.8 L769.3 376.3 L773.6 370.7 L780.1 364.5 L835.6 318.1 L847.1 307.7 L852.2 302.0 L856.3 296.3 L858.6 291.7 L860.2 285.9 L861.1 275.5 L861.2 221.1 L862.3 192.1 L862.2 171.3 L861.3 152.8 L861.7 137.7 L860.9 64.8 L859.3 55.6 L851.7 37.0 L846.6 11.8 L845.1 7.8Z M524.2 306.1 L529.5 309.6 L534.2 314.2 L538.7 320.7 L542.6 328.7 L545.1 335.6 L547.1 343.8 L549.6 366.9 L549.6 403.9 L548.1 427.1 L546.0 447.9 L543.1 467.6 L537.0 497.7 L534.8 505.8 L532.3 511.5 L529.4 516.0 L524.9 521.4 L509.3 535.3 L343.8 669.2 L338.1 672.7 L333.8 674.1 L330.1 673.6 L327.6 671.2 L326.4 667.5 L326.2 662.0 L327.0 653.9 L334.9 603.0 L344.3 557.9 L353.0 524.3 L362.3 491.9 L372.1 461.8 L388.1 421.3 L400.7 394.7 L415.1 369.2 L430.8 347.2 L444.5 332.7 L463.0 318.0 L478.0 308.6 L485.0 305.8 L491.9 304.0 L502.3 302.6 L510.4 302.5 L517.4 303.5Z' };
  var ICON_COL = {"": ["#060914", ["#B8F4FF", "#5CE1FF", "#8B5CFF"]], "nuit": ["#0A0C10", ["#C4DBFF", "#6EA8FF", "#4F86F0"]], "clair": ["#E6F4F2", ["#34D6C2", "#14958A", "#0F766E"]], "foret": ["#0C1613", ["#B5F5DA", "#4FD1A1", "#33B88A"]], "rose": ["#FFE9F1", ["#FF9EC4", "#E0457B", "#B02A63"]], "neant": ["#070304", ["#FFC2C8", "#FF3B4E", "#B3122A"]]};
  function drawIcon(size, k, rounded) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var x = c.getContext('2d'), col = ICON_COL[k] || ICON_COL[''];
    x.fillStyle = col[0];
    if (rounded && x.roundRect) { x.beginPath(); x.roundRect(0, 0, size, size, size * 0.225); x.fill(); } else x.fillRect(0, 0, size, size);
    var h = size * 0.6, sc = h / ICON_GLYPH.h, w = ICON_GLYPH.w * sc, ox = (size - w) / 2, oy = (size - h) / 2;
    var g = x.createLinearGradient(ox, oy, ox + w, oy + h);
    g.addColorStop(0, col[1][0]); g.addColorStop(0.5, col[1][1]); g.addColorStop(1, col[1][2]);
    x.save(); x.translate(ox, oy); x.scale(sc, sc); x.fillStyle = g;
    x.fill(new Path2D(ICON_GLYPH.d), 'evenodd'); x.restore();
    return c.toDataURL('image/png');
  }
  var iconSkin = null;
  function setIcons(k) {
    k = ICON_COL[k] ? k : '';
    if (iconSkin === k) return;
    try {
      /* une seule icône pour tous les thèmes (E-bulle sombre) */
      var abs = function (f) { return new URL(f, location.href).href; };
      var i192 = abs('icon-192.png?v=124'), i512 = abs('icon-512.png?v=124');
      var m192 = abs('icon-maskable-192.png?v=124'), m512 = abs('icon-maskable-512.png?v=124');
      var fav = document.querySelector('link[rel="icon"]'), ap = document.querySelector('link[rel="apple-touch-icon"]'), mf = document.querySelector('link[rel="manifest"]');
      if (fav) fav.href = i192;
      if (ap) ap.href = abs('apple-touch-icon.png?v=124');
      if (mf) {
        var mj = JSON.stringify({
          name: 'E\'cho', short_name: 'E\'cho', start_url: location.pathname + location.search, scope: location.pathname.replace(/[^\/]*$/, ''),
          display: 'standalone', background_color: '#1a090d', theme_color: '#1a090d',
          icons: [{ src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: m192, sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: m512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
        });
        mf.href = 'data:application/manifest+json;base64,' + btoa(unescape(encodeURIComponent(mj)));
      }
      iconSkin = k;
    } catch (e) {}
  }

  function applyMode() {
    var m = store('uandi-mode') || 'dark', k = store('uandi-skin');
    if (!SKIN_EFF[k]) k = '';
    var root = document.documentElement;
    root.dataset.eff = k ? SKIN_EFF[k] : (m === 'auto' ? (modeMq && modeMq.matches ? 'dark' : 'light') : m);
    if (k) root.dataset.skin = k; else delete root.dataset.skin;
    if (k && !document.getElementById('skinfont-' + k)) {
      var lk = document.createElement('link');
      lk.id = 'skinfont-' + k; lk.rel = 'stylesheet';
      lk.href = 'https://fonts.googleapis.com/css2?family=' + SKIN_FONT[k] + '&display=swap';
      document.head.appendChild(lk);
    }
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', k ? SKIN_BAR[k] : '#1a090d');
    (window.requestIdleCallback || function (fn) { setTimeout(fn, 400); })(function () { setIcons(k); });
    document.querySelectorAll('#modeSeg button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.m === m ? 'true' : 'false');
    });
    document.querySelectorAll('#skinSeg button').forEach(function (b) {
      b.setAttribute('aria-pressed', (b.dataset.k || '') === k ? 'true' : 'false');
    });
    var ms = document.getElementById('modeSec');
    if (ms) ms.hidden = !!k;
  }
  if (modeMq && modeMq.addEventListener) modeMq.addEventListener('change', applyMode);
  $('#modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    store('uandi-mode', b.dataset.m);
    applyMode();
  });
  $('#skinSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    store('uandi-skin', b.dataset.k || null);
    applyMode();
  });
  applyMode();

  function applyChatTheme(id) {
    var t = id ? store('uandi-ct-' + id) : null;
    viewChat.dataset.ct = t || ''; document.documentElement.dataset.ct = t || '';
    document.querySelectorAll('#themes .sw').forEach(function (b) {
      b.setAttribute('aria-pressed', (b.dataset.ct || '') === (t || '') ? 'true' : 'false');
    });
  }
  /* ---------- surnom (comme Messenger) ---------- */
  $('#nickBtn').addEventListener('click', function () {
    var f = $('#nickForm');
    f.hidden = !f.hidden; $('#nickErr').hidden = true;
    if (!f.hidden && state.chat) { $('#nickIn').value = nickOf(chatOf(state.chat.id), state.chat.other); $('#nickIn').focus(); }
  });
  $('#nickForm').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var chat = state.chat, err = $('#nickErr'), btn = $('#nickSave');
    if (!chat) return;
    err.hidden = true;
    var raw = $('#nickIn').value.replace(/\s+/g, ' ').trim();
    var cur = chatOf(chat.id), old = nickOf(cur, chat.other);
    if (raw === old) { $('#nickForm').hidden = true; return; }
    var real = (cur && cur.names && cur.names[chat.other]) || chat.name;
    var who = cap(old || real);
    var note = raw ? cap(myName()) + ' a défini le surnom de ' + cap(real) + ' : ' + raw
                   : cap(myName()) + ' a retiré le surnom de ' + who;
    btn.disabled = true;
    try {
      var ts = Date.now(), ref = fs.collection('chats').doc(chat.id), upd = {};
      upd['nicks.' + chat.other] = raw ? raw : firebase.firestore.FieldValue.delete();
      upd.lastText = note; upd.lastTs = ts; upd.lastUid = state.me; upd['seen.' + state.me] = ts;
      var batch = fs.batch();
      batch.update(ref, upd);
      batch.set(ref.collection('messages').doc(), { uid: state.me, sts: SV(), text: SYS + note, ts: ts });
      await batch.commit();
      chat.name = raw || real; $('#chatName').textContent = cap(chat.name);
      paintPhoto($('#chatAvatar'), chat.other, chat.name);
      $('#nickForm').hidden = true;
    } catch (e) {
      var code = (e && e.code) || '';
      err.textContent = code === 'not-found' ? 'La discussion n’existe pas encore : envoie d’abord un message, puis reviens mettre le surnom.'
        : code === 'permission-denied' ? 'Refusé par les règles Firestore (permission-denied) : les règles publiées ne sont pas à jour.'
        : 'Le surnom n’a pas pu être enregistré (' + (code || (e && e.message) || 'erreur inconnue') + ').';
      err.hidden = false;
    } finally { btn.disabled = false; }
  });

  $('#moreBtn').addEventListener('click', function () { var m = $('#chatMenu'); m.hidden = !m.hidden; this.setAttribute('aria-expanded', String(!m.hidden)); });
  $('#themeBtn').addEventListener('click', function () { var t = $('#themes'); t.hidden = !t.hidden; });
  function applyBg(id) {
    var v = id ? store('uandi-bg-' + id) : null;
    if (v) document.documentElement.dataset.bg = v; else delete document.documentElement.dataset.bg;
    document.querySelectorAll('#themes .bgsw').forEach(function (b) {
      b.setAttribute('aria-pressed', (b.dataset.bg || '') === (v || '') ? 'true' : 'false');
    });
  }
  $('#themes').addEventListener('click', function (e) {
    var b = e.target.closest('.bgsw'); if (!b || !state.chat) return;
    store('uandi-bg-' + state.chat.id, b.dataset.bg || null);
    applyBg(state.chat.id);
  });
  $('#themes').addEventListener('click', function (e) {
    var b = e.target.closest('.sw'); if (!b || !state.chat) return;
    store('uandi-ct-' + state.chat.id, b.dataset.ct || null);
    applyChatTheme(state.chat.id);
  });

  var photos = {}, photoReq = {}, setDlg = $('#settings');
  function paintPhoto(node, uid, name) {
    if (node.id === 'chatAvatar' && state.chat && state.chat.group) { paintGroupAv(node, chatOf(state.chat.id)); return; }
    paintAvatar(node, name);
    var p = photos[uid];
    if (p) { node.textContent = ''; node.style.background = 'center / cover no-repeat url("' + p + '")'; }
  }
  function loadPhoto(uid) {
    if (!uid || photoReq[uid]) return;
    photoReq[uid] = 1;
    fs.collection('presence').doc(uid).get().then(function (d) {
      var v = d.exists ? d.data().photo : null;
      photos[uid] = typeof v === 'string' ? v : null;
      if (state.view === 'list') renderList();
      if (state.view === 'chat' && state.chat) render();
      if (state.chat && state.chat.other === uid) paintPhoto($('#chatAvatar'), uid, state.chat.name);
      if (setDlg.open && uid === state.me) paintPhoto($('#setAvatar'), uid, state.username);
      if (giDlg.open) renderGroupInfo();
      if (typeof frDlg !== 'undefined' && frDlg && frDlg.open) frRender();
      if (typeof ucDlg !== 'undefined' && ucDlg && ucDlg.open) ucRender();
      if (typeof nwRender === 'function' && NW && NW.cm && Object.keys(NW.open || {}).some(function (k) { return NW.open[k]; })) nwRender();
    }).catch(function () { photoReq[uid] = 0; });
  }
  function fileToPhoto(file) {
    return new Promise(function (ok, ko) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var S = 160, c = document.createElement('canvas'), m = Math.min(img.width, img.height);
        c.width = c.height = S;
        c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(); };
      img.src = url;
    });
  }
  async function savePhoto(data) {
    var err = $('#photoErr'); err.hidden = true;
    try {
      await fs.collection('presence').doc(state.me).set({
        name: myName(), seen: hideOn() ? 0 : Date.now(),
        photo: data || firebase.firestore.FieldValue.delete()
      }, { merge: true });
      photos[state.me] = data || null;
      paintPhoto($('#setAvatar'), state.me, state.username);
      updateMyNote();
      if (state.view === 'list') renderList();
    } catch (e) {
      err.textContent = 'La photo n’a pas pu être enregistrée (connexion ou règles Firestore).';
      err.hidden = false;
    }
  }
  $('#openSet').addEventListener('click', function () {
    $('#photoErr').hidden = true;
    paintPhoto($('#setAvatar'), state.me, state.username);
    loadPhoto(state.me);
    applyMode();
    paintNick();
    setDlg.showModal();
  });
  $('#setClose').addEventListener('click', function () { setDlg.close(); });

  /* ---------- changer mon nom : 1 fois / 7 jours, assistant 2 fois / 7 jours, créateur à volonté ---------- */
  var NICK_WAIT = 7 * 86400000;
  function isFnd() { try { if (state.me in badges) return badges[state.me] === true; return localStorage.getItem('uandi-fnd-' + state.me) === '1'; } catch (e) { return false; } }
  function nickMax() { return isFnd() ? Infinity : assists[state.me] ? 2 : 1; }
  function nickRecent() { var cut = Date.now() - NICK_WAIT; return (state.nickLog || []).filter(function (t) { return t > cut; }).sort(function (x, y) { return x - y; }); }
  function nickLeft() {
    var r = nickRecent(), mx = nickMax();
    if (r.length < mx) return 0;
    return Math.max(0, r[r.length - mx] + NICK_WAIT - Date.now());
  }
  function paintNick() {
    var left = nickLeft(), h = $('#myNickHint'), b = $('#myNickGo'), i = $('#myNickIn');
    if (!h || !b || !i) return;
    i.placeholder = cap(myName());
    if (left > 0) {
      var d = Math.ceil(left / 86400000);
      h.textContent = 'Prochain changement possible dans ' + d + ' jour' + (d > 1 ? 's' : '') + '.';
      b.disabled = true; i.disabled = true;
    } else {
      var mx = nickMax();
      h.textContent = mx === Infinity ? 'Tu peux changer ton nom quand tu veux.' : mx === 2 ? 'Assistant : tu peux changer ton nom 2 fois par semaine.' : 'Tu peux changer ton nom une fois tous les 7 jours.';
      b.disabled = false; i.disabled = false;
    }
  }
  $('#myNickGo').addEventListener('click', function () {
    var err = $('#myNickErr'), n = $('#myNickIn').value.replace(/\s+/g, ' ').trim();
    err.hidden = true;
    if (nickLeft() > 0) { paintNick(); return; }
    if (n.length < 2 || n.length > 24) { err.textContent = 'Le nom doit faire entre 2 et 24 caractères.'; err.hidden = false; return; }
    if (n.toLowerCase() === String(myName()).toLowerCase()) { err.textContent = 'C’est déjà ton nom.'; err.hidden = false; return; }
    var now = Date.now();
    state.nick = n; state.nickAt = now;
    state.nickLog = nickRecent().concat([now]);
    store('uandi-nick-' + state.me, JSON.stringify({ n: n, t: now, l: state.nickLog }));
    writePresence({ nick: n, nickAt: now });
    /* met à jour mon nom dans mes discussions (écritures seulement, aucune lecture) */
    state.chats.forEach(function (c) {
      var upd = {}; upd['names.' + state.me] = n;
      fs.collection('chats').doc(c.id).update(upd).catch(function () {});
    });
    $('#myNickIn').value = '';
    renderList(); paintNick();
  });
  $('#photoPick').addEventListener('click', function () { $('#photoFile').click(); });
  $('#photoDel').addEventListener('click', function () { savePhoto(null); });
  $('#photoFile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    fileToPhoto(f).then(savePhoto, function () {
      var err = $('#photoErr'); err.textContent = 'Image illisible.'; err.hidden = false;
    });
  });




/* E'cho — js/app/12-reactions-photos.js
   Réactions, modification de messages, photos
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- réactions et modification de messages ---------- */
  var RX = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
  function reactionsOf(m) {
    var out = {}, l = m.likes, r = m.reacts;
    if (l && typeof l === 'object') Object.keys(l).forEach(function (k) { if (l[k] === true) out[k] = RX[0]; });
    if (r && typeof r === 'object') Object.keys(r).forEach(function (k) { if (typeof r[k] === 'string' && r[k]) out[k] = r[k]; });
    return out;
  }
  function rxSummary(rx) {
    var counts = {}, order = [], n = Object.keys(rx).length;
    Object.keys(rx).forEach(function (k) {
      var e = rx[k];
      if (!counts[e]) { counts[e] = 0; order.push(e); }
      counts[e]++;
    });
    order.sort(function (a, b) { return counts[b] - counts[a]; });
    return order.slice(0, 3).join('') + (n > 1 ? ' ' + n : '');
  }
  function pickerEl(mine, canEdit) {
    var box = el('div', 'picker');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Choisir une réaction');
    RX.forEach(function (e) {
      var b = el('button', 'rxb', e);
      b.type = 'button'; b.dataset.e = e;
      b.setAttribute('aria-pressed', mine === e ? 'true' : 'false');
      box.appendChild(b);
    });
    if (canEdit) {
      var eb = el('button', 'edit pedit', '✏️ Modifier');
      eb.type = 'button';
      box.appendChild(eb);
    }
    return box;
  }
  async function setReaction(id, emoji) {
    if (!state.chat || busy.has(id)) return;
    var m = state.msgs.find(function (x) { return x.id === id; });
    if (!m) return;
    var del = firebase.firestore.FieldValue.delete();
    var next = (reactionsOf(m)[state.me] === emoji) ? '' : emoji;
    var hadHeart = !!(m.likes && m.likes[state.me] === true);
    var hadOther = !!(m.reacts && typeof m.reacts[state.me] === 'string');
    var patch = {};
    if (next === RX[0]) {
      patch['likes.' + state.me] = true;
      if (hadOther) patch['reacts.' + state.me] = del;
    } else if (next) {
      patch['reacts.' + state.me] = next;
      if (hadHeart) patch['likes.' + state.me] = false;
    } else {
      if (hadHeart) patch['likes.' + state.me] = false;
      if (hadOther) patch['reacts.' + state.me] = del;
    }
    state.picker = null;
    closePickerAnim(id, next, render);
    if (!Object.keys(patch).length) return;
    busy.add(id);
    try {
      await fs.collection('chats').doc(state.chat.id).collection('messages').doc(id).update(patch);
    } catch (e) {
      showErr('La réaction n’a pas pu être enregistrée (connexion ou règles Firestore).');
    } finally { busy.delete(id); }
  }
  function startEdit(id) {
    var m = state.msgs.find(function (x) { return x.id === id; });
    if (!m || m.uid !== state.me || m.audio || m.img || m.file || ta.disabled) return;
    clearReply();
    if (!state.editing) state.editDraft = ta.value;
    state.editing = id;
    state.picker = null;
    ta.value = m.text;
    autosize();
    $('#editbar').hidden = false;
    render();
    ta.focus();
  }
  function cancelEdit() {
    if (!state.editing) return;
    state.editing = null;
    ta.value = state.editDraft || '';
    state.editDraft = '';
    $('#editbar').hidden = true;
    autosize();
  }
  async function saveEdit(text) {
    var id = state.editing, chat = state.chat;
    var m = state.msgs.find(function (x) { return x.id === id; });
    if (!m || m.uid !== state.me || !chat) { cancelEdit(); return; }
    if (text === m.text) { cancelEdit(); return; }
    var newest = state.msgs.reduce(function (a, x) { return Math.max(a, x.ts); }, 0);
    showErr('');
    try {
      var chatRef = fs.collection('chats').doc(chat.id);
      await chatRef.collection('messages').doc(id).update({ text: text, edited: true });
      if (m.ts === newest) chatRef.update({ lastText: text.slice(0, 120) }).catch(function () {});
    } catch (e) {
      showErr('La modification n’a pas pu être enregistrée (connexion ou règles Firestore).');
      return;
    }
    cancelEdit();
  }
  $('#editCancel').addEventListener('click', cancelEdit);

  /* ---------- photos (compressées avant l'envoi) ---------- */
  var PIMG = {}, VEMB = {}, picBtn = $('#pic'), picFile = $('#picFile'), viewer = $('#viewer');
  function openPhoto(src) { $('#viewerImg').src = src; viewer.showModal(); }
  viewer.addEventListener('click', function () { viewer.close(); });
  function compressImage(file) {
    return new Promise(function (ok, ko) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var max = 960, q = 0.6, out = '';
        for (var n = 0; n < 6; n++) {
          var k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          var g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', q);
          if (out.length <= 110000) break;
          max = Math.round(max * 0.8); q = Math.max(0.4, q - 0.05);
        }
        if (out.length <= 600000) ok(out); else ko();
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(); };
      img.src = url;
    });
  }
  async function sendPhoto(img) {
    var chat = state.chat;
    if (!state.me || !chat || ta.disabled) return;
    showErr('');
    state.stick = true;
    var label = '📷 Photo', orig = img;
    async function put(val) {
      var chatRef = fs.collection('chats').doc(chat.id);
      var msgRef = chatRef.collection('messages').doc();
      var ts = Date.now();
      var exists = !!state.chatsById[chat.id];
      if (!exists) { exists = (await chatRef.get()).exists; }
      var batch = fs.batch();
      batch.set(msgRef, withReply({ uid: state.me, sts: SV(), text: label, ts: ts, img: val }));
      var last = { lastText: label, lastTs: ts, lastUid: state.me };
      if (exists) {
        last['seen.' + state.me] = ts;
        batch.update(chatRef, last);
      } else {
        var names = {}; names[state.me] = myName(); names[chat.other] = chat.name;
        var seen = {}; seen[state.me] = ts;
        batch.set(chatRef, {
          members: [state.me, chat.other], names: names,
          lastText: label, lastTs: ts, lastUid: state.me, seen: seen
        });
      }
      await batch.commit();
      state.chatsById[chat.id] = true;
    }
    try {
      if (cntEl) { cntEl.hidden = false; cntEl.textContent = 'Envoi de la photo…'; }
      var upi = await mediaUp(img);
      if (upi) img = upi;
      else if (CLD_MEDIA && img.length > 140000) {
        showErr('Photo non envoyée : le téléversement a échoué (' + (CLD_ERR || 'connexion') + '). Réessaie quand la connexion est meilleure.');
        return;
      }
      try { await put(img); }
      catch (e1) {
        /* règles Firestore qui refusent le lien : on retente avec la photo intégrée (petite version compressée) */
        if (e1 && e1.code === 'permission-denied' && img !== orig && orig.length <= 600000) await put(orig);
        else throw e1;
      }
    } catch (e) {
      var code = e && e.code ? String(e.code) : '';
      showErr(code === 'permission-denied'
        ? 'Photo refusée par les règles Firestore (le lien Cloudinary et la photo intégrée sont refusés). À corriger dans Firebase > Firestore > Règles. [' + code + ']'
        : 'Photo non envoyée. Vérifie ta connexion et réessaie.' + (code ? ' [' + code + ']' : ''));
    } finally { if (cntEl) cntEl.hidden = true; }
  }
  picBtn.addEventListener('click', function () {
    if (state.chat && !ta.disabled && !picBtn.disabled) picFile.click();
  });
  picFile.addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    var chatId = state.chat && state.chat.id;
    picBtn.disabled = true;
    compressImage(f).then(function (d) {
      if (state.chat && state.chat.id === chatId) return sendPhoto(d);
    }, function () { showErr('Image illisible ou trop lourde.'); })
      .then(function () { picBtn.disabled = false; });
  });




/* E'cho — js/app/13-fichiers-vocaux.js
   Fichiers et musiques partagés, lecteur et messages vocaux
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- fichiers et musiques partagés (discussions et groupes) ---------- */
  var FILE_MAX = 640 * 1024, BIG_MAX = 20 * 1024 * 1024, FS_MAX = 8 * 1024 * 1024, CHUNK = 600000, LF = {}, fileBusy = false;
  var docBtn = $('#docBtn'), docFile = $('#docFile'), musBtn = $('#musBtn'), musFile = $('#musFile'), cntEl = $('#count');
  function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko'; }
  function isAudioFile(fl) { return /^audio\//.test(fl.mt || '') || /\.(mp3|m4a|aac|wav|ogg|opus|flac|weba)$/i.test(fl.n || ''); }
  var MIMES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', doc: 'application/msword', ppt: 'application/vnd.ms-powerpoint', xls: 'application/vnd.ms-excel', odt: 'application/vnd.oasis.opendocument.text', zip: 'application/zip', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown', json: 'application/json', html: 'text/html', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4' };
  function extOf(n) { var m = /\.([A-Za-z0-9]{1,6})$/.exec(String(n || '')); return m ? m[1].toLowerCase() : ''; }
  function guessMime(name, mt) { return (mt && mt !== 'application/octet-stream') ? mt : (MIMES[extOf(name)] || mt || 'application/octet-stream'); }
  function safeName(n, mt) {
    n = String(n || 'fichier').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim() || 'fichier';
    if (!extOf(n)) { for (var k in MIMES) if (MIMES[k] === mt) { n += '.' + k; break; } }
    return n;
  }
  function saveBlob(bl, name) {
    var nm = safeName(name, bl.type), u = URL.createObjectURL(bl), a = document.createElement('a');
    a.href = u; a.download = nm; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  /* vérifie que le contenu reçu est bien le fichier annoncé (et pas une page d'erreur enregistrée sous le même nom) */
  function sniff(bl, name) {
    return bl.slice(0, 16).arrayBuffer().then(function (b) {
      var u = new Uint8Array(b), s = String.fromCharCode.apply(null, Array.prototype.slice.call(u)), e = extOf(name);
      if (!u.length) return false;
      if (e === 'pdf') return s.indexOf('%PDF') === 0;
      if (/^(docx|pptx|xlsx|zip|odt|ods|odp|epub|apk)$/.test(e)) return s.slice(0, 2) === 'PK';
      if (e === 'png') return s.slice(1, 4) === 'PNG';
      if (/^jpe?g$/.test(e)) return u[0] === 0xFF && u[1] === 0xD8;
      if (e === 'gif') return s.slice(0, 3) === 'GIF';
      if (/^(html?|json|txt|md|csv|xml|svg)$/.test(e)) return true;
      return !/^\s*(<!doctype|<html|\{"error")/i.test(s);
    });
  }
  function fileErr(why, extra) { var e = new Error(why); e.why = why; if (extra) e.code = extra; return e; }
  function fileErrMsg(e) {
    var w = e && e.why;
    if (w === 'bloque') return 'Le stockage (Cloudinary) refuse de livrer ce fichier : les PDF et ZIP y sont bloqués par défaut. Active « PDF and ZIP files delivery » dans Cloudinary > Settings > Security (ou renvoie le fichier : les nouveaux envois n’utilisent plus ce chemin).';
    if (w === 'invalide' || w === 'incomplet') return 'Ce fichier est incomplet ou abîmé : demande à l’expéditeur de le renvoyer.';
    if (e && e.code === 'permission-denied') return 'Lecture refusée par les règles Firestore (collection fchunks). À corriger dans Firebase > Firestore > Règles.';
    return 'Impossible de récupérer le fichier : vérifie ta connexion et réessaie.';
  }
  function fileBlob(m, cid) {
    if (LF[m.id]) return Promise.resolve(LF[m.id]);
    var mt = guessMime(m.file.n, m.file.mt), p, exact = false;
    var typed = function (bl) { return new Blob([bl], { type: mt }); };
    if (m.file.u) {
      p = fetch(m.file.u, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw fileErr(r.status === 401 || r.status === 403 || r.status === 404 ? 'bloque' : 'reseau');
        return r.blob();
      }, function () { throw fileErr('reseau'); }).then(typed);
    } else if (m.file.d) {
      exact = true;
      p = fetch(m.file.d).then(function (r) { return r.blob(); }).then(typed);
    } else {
      exact = true;
      p = fs.collection('chats').doc(cid).collection(m.file.loc === 'm' ? 'messages' : 'fchunks').where('g', '==', m.file.g).get().then(function (snap) {
        var parts = [];
        snap.forEach(function (d) { var v = d.data(); if (typeof v.i === 'number' && typeof v.d === 'string') parts[v.i] = v.d; });
        for (var i = 0; i < m.file.p; i++) if (typeof parts[i] !== 'string') throw fileErr('incomplet');
        return fetch('data:' + mt + ';base64,' + parts.join('')).then(function (r) { return r.blob(); }).then(typed);
      });
    }
    return p.then(function (bl) {
      if (exact && m.file.s && bl.size !== m.file.s) throw fileErr('incomplet');
      return sniff(bl, m.file.n).then(function (ok) {
        if (!ok) throw fileErr(m.file.u ? 'bloque' : 'invalide');
        LF[m.id] = bl; return bl;
      });
    });
  }
  function fmtT(t) { if (!isFinite(t) || t < 0) t = 0; var mn = Math.floor(t / 60), r = Math.floor(t % 60); return mn + ':' + (r < 10 ? '0' : '') + r; }
  function audioPlayer(a, bl, m, sub) {
    var PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor"/></svg>';
    var PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.4" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4" fill="currentColor"/></svg>';
    var w = el('div', 'fpl'), pb = el('button', 'fpp'), main = el('div', 'fpm'), bar = el('div', 'fwv'), bars = [];
    var meta = el('div', 'fpt'), tm = el('span', 'ftm', '0:00'), sp = el('button', 'fsp', '1×'), dl = el('button', 'fdl2');
    pb.type = sp.type = dl.type = 'button'; pb.setAttribute('aria-label', 'Lecture / pause'); sp.setAttribute('aria-label', 'Vitesse'); dl.setAttribute('aria-label', 'Enregistrer');
    pb.innerHTML = PLAY;
    dl.innerHTML = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    waveFor(m.id || m.file.n).forEach(function (h) { var i = document.createElement('i'); i.style.height = Math.round(h * 100) + '%'; bar.appendChild(i); bars.push(i); });
    meta.appendChild(tm); meta.appendChild(el('span', 'fsc')); meta.appendChild(sp); meta.appendChild(dl);
    main.appendChild(bar); main.appendChild(meta); w.appendChild(pb); w.appendChild(main);
    function paint() {
      var d = a.duration, c = a.currentTime || 0, pc = (isFinite(d) && d > 0) ? Math.min(100, c / d * 100) : 0;
      var on = Math.round(pc / 100 * bars.length);
      for (var k = 0; k < bars.length; k++) bars[k].classList.toggle('on', k < on);
      tm.textContent = fmtT(c) + (isFinite(d) && d > 0 ? ' / ' + fmtT(d) : '');
    }
    a.addEventListener('timeupdate', paint); a.addEventListener('loadedmetadata', paint); a.addEventListener('durationchange', paint);
    a.addEventListener('play', function () { pb.innerHTML = PAUSE; w.classList.add('on'); });
    a.addEventListener('pause', function () { pb.innerHTML = PLAY; w.classList.remove('on'); });
    a.addEventListener('ended', function () { pb.innerHTML = PLAY; w.classList.remove('on'); a.currentTime = 0; paint(); });
    pb.addEventListener('click', function (e) { e.stopPropagation(); if (a.paused) a.play().catch(function () {}); else a.pause(); });
    var rates = [1, 1.5, 2], ri = 0;
    sp.addEventListener('click', function (e) { e.stopPropagation(); ri = (ri + 1) % rates.length; a.playbackRate = rates[ri]; sp.textContent = (rates[ri] === 1.5 ? '1,5' : rates[ri]) + '×'; });
    dl.addEventListener('click', function (e) { e.stopPropagation(); saveBlob(bl, m.file.n); });
    var drag = false;
    function seek(e) {
      var r = bar.getBoundingClientRect(), d = a.duration;
      if (!isFinite(d) || d <= 0 || !r.width) return;
      a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d; paint();
    }
    bar.addEventListener('pointerdown', function (e) { e.stopPropagation(); drag = true; try { bar.setPointerCapture(e.pointerId); } catch (x) {} seek(e); });
    bar.addEventListener('pointermove', function (e) { if (drag) seek(e); });
    bar.addEventListener('pointerup', function () { drag = false; });
    bar.addEventListener('pointercancel', function () { drag = false; });
    w.addEventListener('click', function (e) { e.stopPropagation(); });
    paint();
    return w;
  }
  function fileCard(m) {
    var cid = state.chat.id, aud = isAudioFile(m.file), box = el('div', 'fbox'), b = el('button', 'fcard'); b.type = 'button';
    var ico = el('span', 'fico');
    ico.innerHTML = aud
      ? '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 18V6l10-2v12" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" stroke="currentColor" stroke-width="1.9" fill="none"/><circle cx="16.5" cy="16" r="2.5" stroke="currentColor" stroke-width="1.9" fill="none"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9.5 14.5 12 17l2.5-2.5" stroke="currentColor" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var sub = el('span', 'fsz', fmtSize(m.file.s) + (aud ? ' · Écouter' : ' · Télécharger')), tx = el('span', 'ftx');
    tx.appendChild(el('span', 'fnm', m.file.n)); tx.appendChild(sub);
    b.appendChild(ico); b.appendChild(tx); box.appendChild(b);
    b.addEventListener('click', function (ev) {
      ev.stopPropagation();
      if (LP.fired) { LP.fired = false; return; }
      var au = box.querySelector('audio');
      if (au) { if (au.paused) au.play().catch(function () {}); else au.pause(); return; }
      sub.textContent = 'Chargement…';
      fileBlob(m, cid).then(function (bl) {
        if (aud) {
          var a = document.createElement('audio'); a.className = 'faud'; a.preload = 'metadata'; a.src = URL.createObjectURL(bl);
          box.appendChild(a); box.appendChild(audioPlayer(a, bl, m, sub)); a.play().catch(function () {});
          sub.textContent = fmtSize(m.file.s) + ' · Lecture';
        } else { saveBlob(bl, m.file.n); sub.textContent = fmtSize(m.file.s) + ' · Télécharger'; }
      }).catch(function (e) { sub.textContent = 'Échec · réessayer'; showErr(fileErrMsg(e)); });
    });
    return box;
  }
  function readB64(f) {
    return new Promise(function (ok, ko) {
      var rd = new FileReader();
      rd.onload = function () { var r = String(rd.result), i = r.indexOf(','); ok(r.slice(i + 1)); };
      rd.onerror = function () { ko(rd.error); };
      rd.readAsDataURL(f);
    });
  }
  function readUrl(f) {
    return new Promise(function (ok, ko) {
      var rd = new FileReader(); rd.onload = function () { ok(String(rd.result)); }; rd.onerror = function () { ko(rd.error); }; rd.readAsDataURL(f);
    });
  }
  async function urlIntact(u, size, name) {
    try {
      var r = await fetch(u, { cache: 'no-store' });
      if (!r.ok) return false;
      var bl = await r.blob();
      if (size && bl.size !== size) return false;
      return await sniff(bl, name);
    } catch (e) { return false; }
  }
  async function sendFileMsg(f) {
    var chat = state.chat;
    if (!state.me || !chat || ta.disabled) return;
    showErr(''); state.stick = true;
    if (cntEl) { cntEl.hidden = false; cntEl.textContent = 'Envoi du fichier…'; }
    var name = String(f.name || 'fichier').slice(0, 120), mt = guessMime(name, f.type || '');
    var aud = isAudioFile({ n: name, mt: mt }), label = (aud ? '🎵 ' : '📎 ') + name;
    var chatRef = fs.collection('chats').doc(chat.id), file;
    try {
      var exists = !!state.chatsById[chat.id];
      if (!exists) { exists = (await chatRef.get()).exists; }
      var upf = null;
      if (aud || /^image\//.test(mt)) upf = await cloudUp(f);
      else {
        /* documents : on n'utilise Cloudinary que si le fichier en ressort intact (PDF/ZIP souvent bloqués) ; sinon Firestore */
        upf = await cloudUp(f, 'raw');
        if (upf && !(await urlIntact(upf, f.size, name))) upf = null;
      }
      if (upf) {
        file = { n: name, s: f.size || 0, u: upf, mt: mt };
      } else if (f.size <= FILE_MAX) {
        file = { n: name, s: f.size || 0, d: await readUrl(f), mt: mt };
      } else if (f.size > FS_MAX) {
        /* au-delà de 8 Mo, Firestore (par morceaux) serait trop lourd : le cloud est obligatoire */
        showErr('Envoi impossible (' + (CLD_ERR || 'connexion') + '). Les fichiers de plus de ' + fmtSize(FS_MAX) + ' passent par le cloud : réessaie.'); return;
      } else {
        if (!exists) { showErr('Envoie d’abord un message dans cette discussion, puis réessaie.'); return; }
        var b64 = await readB64(f), gid = state.me.slice(0, 6) + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var parts = Math.ceil(b64.length / CHUNK), loc = 'f', cts = Date.now();
        for (var i = 0; i < parts; i++) {
          if (cntEl) { cntEl.hidden = false; cntEl.textContent = 'Envoi du fichier… ' + (i + 1) + ' / ' + parts; }
          var data = { uid: state.me, g: gid, i: i, d: b64.slice(i * CHUNK, (i + 1) * CHUNK), text: '📎', ts: cts, sts: SV() }, id = gid + '-' + i;
          try { await chatRef.collection(loc === 'f' ? 'fchunks' : 'messages').doc(id).set(data); }
          catch (e) {
            if (i === 0 && loc === 'f') { loc = 'm'; await chatRef.collection('messages').doc(id).set(data); } else throw e;
          }
        }
        file = { n: name, s: f.size, g: gid, p: parts, loc: loc, mt: mt };
      }
      var msgRef = chatRef.collection('messages').doc(), ts = Date.now(), batch = fs.batch();
      batch.set(msgRef, withReply({ uid: state.me, sts: SV(), text: label, ts: ts, file: file }));
      var last = { lastText: label, lastTs: ts, lastUid: state.me };
      if (exists) {
        last['seen.' + state.me] = ts;
        batch.update(chatRef, last);
      } else {
        var names = {}; names[state.me] = myName(); names[chat.other] = chat.name;
        var seen = {}; seen[state.me] = ts;
        batch.set(chatRef, { members: [state.me, chat.other], names: names, lastText: label, lastTs: ts, lastUid: state.me, seen: seen });
      }
      await batch.commit();
      state.chatsById[chat.id] = true;
    } catch (e) {
      showErr('Fichier non envoyé. Vérifie ta connexion (ou les règles Firestore) et réessaie.');
    } finally { if (cntEl) cntEl.hidden = true; }
  }
  function onPick(e) {
    var f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f || fileBusy) return;
    if (f.size > BIG_MAX) { showErr('Fichier trop lourd : ' + fmtSize(BIG_MAX) + ' maximum.'); return; }
    fileBusy = true; docBtn.disabled = true; musBtn.disabled = true;
    sendFileMsg(f).then(function () { fileBusy = false; docBtn.disabled = false; musBtn.disabled = false; });
  }
  docBtn.addEventListener('click', function () { if (state.chat && !ta.disabled && !fileBusy) docFile.click(); });
  musBtn.addEventListener('click', function () { if (state.chat && !ta.disabled && !fileBusy) musFile.click(); });
  docFile.addEventListener('change', onPick);
  musFile.addEventListener('change', onPick);

  /* ---------- lecteur vocal ---------- */
  var VP = {}, VBARS = 30;
  var ICON_PLAY = '<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  var ICON_PAUSE = '<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5h3.5v15H7zM13.5 4.5H17v15h-3.5z"/></svg>';
  function waveFor(id) {
    var s = 2166136261, i;
    for (i = 0; i < id.length; i++) { s ^= id.charCodeAt(i); s = Math.imul(s, 16777619); }
    var ph = (s >>> 0) % 628 / 100, out = [];
    for (i = 0; i < VBARS; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      out.push(0.2 + 0.8 * (0.6 * Math.abs(Math.sin(i * 0.5 + ph)) + 0.4 * ((s >>> 8) / 16777216)));
    }
    return out;
  }
  function stopVoices() {
    PIMG = {}; VEMB = {};
    Object.keys(VP).forEach(function (k) { try { VP[k].au.pause(); } catch (e) {} });
    VP = {};
  }
  function paintVoice(p) {
    var u = p.ui, au = p.au, playing = !au.paused;
    var total = p.dur || (isFinite(au.duration) ? au.duration : 0);
    var cur = au.currentTime || 0;
    var on = total ? Math.round(Math.min(1, cur / total) * u.bars.length) : 0;
    for (var i = 0; i < u.bars.length; i++) u.bars[i].classList.toggle('on', i < on);
    u.root.classList.toggle('playing', playing);
    u.btn.setAttribute('aria-label', playing ? 'Mettre en pause' : 'Écouter le message vocal');
    u.time.textContent = fmtDur(playing || cur > 0.1 ? cur : total);
  }
  function voiceUI(m) {
    var p = VP[m.id];
    if (!p) {
      p = VP[m.id] = { au: new Audio(), ui: null, dur: 0 };
      p.au.preload = 'metadata';
      p.au.src = m.audio;
      var sync = function () { if (p.ui && p.ui.root.isConnected) paintVoice(p); };
      ['timeupdate', 'play', 'pause'].forEach(function (ev) { p.au.addEventListener(ev, sync); });
      p.au.addEventListener('play', function () {
        Object.keys(VP).forEach(function (k) { if (VP[k] !== p) VP[k].au.pause(); });
      });
      p.au.addEventListener('ended', function () { p.au.currentTime = 0; sync(); });
    }
    p.dur = m.dur || p.dur;
    var root = el('div', 'vox'), btn = el('button', 'vplay');
    btn.type = 'button';
    btn.innerHTML = ICON_PLAY + ICON_PAUSE;
    btn.addEventListener('click', function () {
      if (p.au.paused) p.au.play().catch(function () {}); else p.au.pause();
    });
    var wave = el('div', 'vwave'), bars = [];
    waveFor(m.id).forEach(function (h) {
      var b = document.createElement('i');
      b.style.height = Math.round(h * 100) + '%';
      wave.appendChild(b); bars.push(b);
    });
    var seeking = false;
    function vseek(e) {
      var r = wave.getBoundingClientRect(), d = isFinite(p.au.duration) && p.au.duration > 0 ? p.au.duration : p.dur;
      if (!d || !r.width) return;
      try { p.au.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d; } catch (x) {}
      paintVoice(p);
    }
    wave.style.touchAction = 'none'; wave.style.cursor = 'pointer';
    wave.addEventListener('pointerdown', function (e) { e.stopPropagation(); seeking = true; try { wave.setPointerCapture(e.pointerId); } catch (x) {} vseek(e); });
    wave.addEventListener('pointermove', function (e) { if (seeking) vseek(e); });
    wave.addEventListener('pointerup', function () { seeking = false; });
    wave.addEventListener('pointercancel', function () { seeking = false; });
    var time = el('span', 'vtime');
    root.appendChild(btn); root.appendChild(wave); root.appendChild(time);
    p.ui = { root: root, btn: btn, bars: bars, time: time };
    paintVoice(p);
    return root;
  }
  /* ---------- messages vocaux (stockés dans Firestore, 60 s max) ---------- */
  var micBtn = $('#mic'), recBar = $('#recbar'), recTimeEl = $('#rectime');
  var rec = null, MAX_REC = 60;
  function pickMime() {
    if (!window.MediaRecorder) return null;
    var c = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < c.length; i++) {
      try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {}
    }
    return '';
  }
  function fmtDur(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function recTick() {
    if (!rec) return;
    var s = (Date.now() - rec.t0) / 1000;
    recTimeEl.textContent = fmtDur(s);
    if (s >= MAX_REC) stopRec(false);
  }
  async function startRec() {
    if (rec || !state.chat || ta.disabled) return;
    var mime = pickMime();
    if (mime === null || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showErr('Ton navigateur ne permet pas d’enregistrer un vocal.');
      return;
    }
    var stream;
    try { stream = await getMic({ audio: true }); }
    catch (e) { showErr('Micro refusé. Autorise le micro pour ce site dans le navigateur. ' + MIC_HELP); return; }
    if (!state.chat) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    var opts = { audioBitsPerSecond: 24000 };
    if (mime) opts.mimeType = mime;
    var mr;
    try { mr = new MediaRecorder(stream, opts); }
    catch (e) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      showErr('L’enregistrement n’a pas pu démarrer.');
      return;
    }
    var r = { mr: mr, chunks: [], stream: stream, t0: Date.now(), cancelled: false, chatId: state.chat.id, timer: null };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = function () { finishRec(r); };
    showErr('');
    mr.start();
    rec = r;
    r.timer = setInterval(recTick, 250);
    recBar.hidden = false;
    micBtn.classList.add('on');
    micBtn.setAttribute('aria-label', 'Envoyer le vocal');
    startMeter(r);
    recTick();
  }
  function stopRec(cancel) {
    if (!rec) return;
    var r = rec;
    r.cancelled = !!cancel;
    clearInterval(r.timer);
    try { if (r.mr.state !== 'inactive') r.mr.stop(); else finishRec(r); } catch (e) { finishRec(r); }
  }
  function finishRec(r) {
    clearInterval(r.timer);
    try { r.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    if (rec === r) rec = null;
    recBar.hidden = true;
    micBtn.classList.remove('on');
    micBtn.setAttribute('aria-label', 'Message vocal');
    stopMeter(r);
    if (r.cancelled) return;
    var dur = (Date.now() - r.t0) / 1000;
    if (dur < 0.7 || !r.chunks.length) return;
    var blob = new Blob(r.chunks, { type: (r.mr && r.mr.mimeType) || 'audio/webm' });
    if (blob.size > 650000) { showErr('Vocal trop long.'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      if (!state.chat || state.chat.id !== r.chatId) return;
      sendVoice(String(fr.result), dur);
    };
    fr.readAsDataURL(blob);
  }
  async function sendVoice(audio, dur, noCloud) {
    var chat = state.chat;
    if (!state.me || !chat || ta.disabled) return;
    if (audio.length > 900000) { showErr('Vocal trop long.'); return; }
    showErr('');
    var orig = audio, up = noCloud ? null : await mediaUp(audio); if (up) audio = up;
    state.stick = true;
    var label = '🎤 Message vocal';
    try {
      var chatRef = fs.collection('chats').doc(chat.id);
      var msgRef = chatRef.collection('messages').doc();
      var ts = Date.now();
      var exists = !!state.chatsById[chat.id];
      if (!exists) { exists = (await chatRef.get()).exists; }
      var batch = fs.batch();
      batch.set(msgRef, withReply({ uid: state.me, sts: SV(), text: label, ts: ts, audio: audio, dur: Math.round(dur) }));
      var last = { lastText: label, lastTs: ts, lastUid: state.me };
      if (exists) {
        last['seen.' + state.me] = ts;
        batch.update(chatRef, last);
      } else {
        var names = {}; names[state.me] = myName(); names[chat.other] = chat.name;
        var seen = {}; seen[state.me] = ts;
        batch.set(chatRef, {
          members: [state.me, chat.other], names: names,
          lastText: label, lastTs: ts, lastUid: state.me, seen: seen
        });
      }
      await batch.commit();
      state.chatsById[chat.id] = true;
    } catch (e) {
      if (e && e.code === 'permission-denied' && audio !== orig) { return sendVoice(orig, dur, true); }
      showErr('Vocal non envoyé. Vérifie ta connexion (ou les règles Firestore) et réessaie.' + (e && e.code ? ' [' + e.code + ']' : ''));
    }
  }
  var recMeterEl = $('#recmeter'), meterBars = [];
  for (var mi = 0; mi < 30; mi++) { var mb = document.createElement('i'); recMeterEl.appendChild(mb); meterBars.push(mb); }
  function startMeter(r) {
    r.lv = meterBars.map(function () { return 0; });
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      r.ac = new AC();
      if (r.ac.resume) r.ac.resume();
      r.an = r.ac.createAnalyser(); r.an.fftSize = 256;
      r.ac.createMediaStreamSource(r.stream).connect(r.an);
      r.buf = new Uint8Array(r.an.fftSize);
    } catch (e) { r.an = null; return; }
    r.lastM = 0;
    (function loop(now) {
      if (rec !== r || !r.an) return;
      if (now - r.lastM > 70) {
        r.lastM = now;
        r.an.getByteTimeDomainData(r.buf);
        var sum = 0;
        for (var i = 0; i < r.buf.length; i++) { var v = (r.buf[i] - 128) / 128; sum += v * v; }
        r.lv.shift(); r.lv.push(Math.min(1, Math.sqrt(sum / r.buf.length) * 4));
        for (var k = 0; k < meterBars.length; k++) meterBars[k].style.height = (3 + r.lv[k] * 26) + 'px';
      }
      requestAnimationFrame(loop);
    })(0);
  }
  function stopMeter(r) {
    r.an = null;
    try { if (r.ac) r.ac.close(); } catch (e) {}
    meterBars.forEach(function (b) { b.style.height = ''; });
  }
  micBtn.addEventListener('click', function () { if (rec) stopRec(false); else startRec(); });
  $('#recCancel').addEventListener('click', function () { stopRec(true); });




/* E'cho — js/app/14-nettoyage.js
   Libérer de l’espace, supprimer une discussion
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- libérer de l'espace : retire mes anciennes photos intégrées (data:) ---------- */
  var freeBtn = $('#freeSpace'), freeMsg = $('#freeMsg'), freeBusy = false;
  function freeSpace() {
    /* aucune lecture Firestore en plus : on ne travaille que sur les messages déjà chargés de la discussion ouverte */
    if (freeBusy || !state.me) return;
    if (!state.chat || !state.msgs.length) { freeMsg.textContent = 'Ouvre une discussion, puis reviens ici : seuls les messages déjà chargés sont nettoyés (aucune lecture en plus).'; return; }
    var n = cleanPhotos(state.chat.id, state.msgs, true);
    freeMsg.textContent = n ? n + ' ancienne(s) photo(s) retirée(s) de tes messages dans cette discussion.' : 'Rien à nettoyer ici : aucune photo intégrée de plus de 7 jours dans tes messages chargés.';
  }
  freeBtn.addEventListener('click', freeSpace);

  /* ---------- supprimer une discussion ---------- */
  var delBtn = $('#delChat'), delTimer = null;
  function hiddenChats() {
    try { return JSON.parse(store('uandi-hidden-' + state.me) || '{}'); } catch (e) { return {}; }
  }
  function hideChatLocally(id) {
    var h = hiddenChats(); h[id] = Date.now();
    store('uandi-hidden-' + state.me, JSON.stringify(h));
  }
  function resetDelBtn() {
    clearTimeout(delTimer);
    delBtn.classList.remove('sure');
    delBtn.textContent = (state.chat && state.chat.group && (chatOf(state.chat.id) || {}).owner !== state.me) ? 'Quitter' : 'Supprimer';
    delBtn.disabled = false;
  }
  async function deleteChat() {
    var chat = state.chat;
    if (!chat) return;
    delBtn.disabled = true;
    delBtn.textContent = 'Suppression…';
    var chatRef = fs.collection('chats').doc(chat.id);
    var leaving = !!(chat.group && (chatOf(chat.id) || {}).owner !== state.me);
    var ok = true;
    try {
      if (leaving) {
        var FV = firebase.firestore.FieldValue, upd = { members: FV.arrayRemove(state.me) };
        upd['names.' + state.me] = FV.delete(); upd['nicks.' + state.me] = FV.delete();
        await chatRef.update(upd);
      } else {
        for (var guard = 0; guard < 50; guard++) {
          var snap = await chatRef.collection('messages').limit(400).get();
          if (snap.empty) break;
          var batch = fs.batch();
          snap.docs.forEach(function (d) { batch.delete(d.ref); });
          await batch.commit();
        }
        await chatRef.delete();
      }
    } catch (e) { ok = false; }
    if (!ok && !leaving) hideChatLocally(chat.id);
    resetDelBtn();
    state.chatsById[chat.id] = false;
    if (history.state && history.state.chat) history.back(); else showList();
    if (!ok) showNewErr(leaving ? 'Impossible de quitter le groupe pour le moment : réessaie.' : 'Suppression complète refusée : la discussion est masquée sur cet appareil seulement.');
  }
  delBtn.addEventListener('click', function () {
    if (delBtn.classList.contains('sure')) { deleteChat(); return; }
    delBtn.classList.add('sure');
    delBtn.textContent = 'Confirmer ?';
    delTimer = setTimeout(resetDelBtn, 3500);
  });

  logEl.addEventListener('scroll', function () { if (nearBottom()) jumpBtn.hidden = true; }, { passive: true });
  jumpBtn.addEventListener('click', scrollBottom);
  form.addEventListener('submit', function (ev) { ev.preventDefault(); send(); });
  ta.addEventListener('input', function () {
    autosize();
    if (state.chat && !state.editing) store('uandi-draft-' + state.chat.id, ta.value || null);
    setTyping(ta.value.trim().length > 0);
  });
  ta.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing &&
        window.matchMedia && matchMedia('(pointer: fine)').matches) {
      ev.preventDefault();
      send();
    }
  });
  ta.addEventListener('blur', function () { setTyping(false); });

  $('#back').addEventListener('click', function () {
    if (history.state && history.state.chat) history.back(); else showList();
  });
  window.addEventListener('popstate', function () { if (state.view === 'chat' || state.view === 'game' || state.view === 'music' || state.view === 'news') showList(); });

  document.addEventListener('visibilitychange', function () {
    if (!state.me) return;
    if (document.hidden) { typingChat = null; writePresence({ typingIn: null, seen: 0 }); }
    else { beat(); markSeen(); }
    updateTitle();
  });

  $('#logout').addEventListener('click', function () {
    var done0 = function () { auth.signOut(); };
    var done = function () { pushUnreg().then(done0, done0); };
    if (state.me) {
      fs.collection('presence').doc(state.me).set({ seen: 0, typingIn: null }, { merge: true }).then(done, done);
    } else done();
  });




/* E'cho — js/app/15-jeu-mots.js
   Jeu : mots mélangés
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- jeux : mots mélangés ---------- */
  var viewGame = $('#viewGame');
  var WORDS = [
    ['lune', 'rose', 'chat', 'pain', 'sable', 'nuit', 'jour', 'miel', 'amour', 'livre', 'table', 'fleur', 'plage', 'neige', 'image', 'sucre', 'tigre', 'zèbre', 'poule', 'herbe', 'monde', 'verre', 'porte', 'pomme', 'fruit', 'glace', 'ciel', 'vent', 'pluie', 'étang', 'lapin', 'nuage', 'radio', 'avion', 'forêt'],
    ['jardin', 'soleil', 'maison', 'voiture', 'cuisine', 'fenêtre', 'musique', 'amitié', 'bonheur', 'chemin', 'oiseau', 'poisson', 'orange', 'banane', 'citron', 'cerise', 'panier', 'mystère', 'étoile', 'bateau', 'cheval', 'souris', 'gâteau', 'lumière', 'baleine', 'dauphin'],
    ['chocolat', 'ordinateur', 'téléphone', 'papillon', 'champion', 'aventure', 'dinosaure', 'croissant', 'parapluie', 'tournesol', 'chaussure', 'hirondelle', 'escargot', 'montagne', 'souvenir', 'vacances', 'chandelle', 'éléphant', 'crocodile', 'amoureux']
  ];
  var ALLN = {};
  function wNorm(s) { return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
  WORDS.forEach(function (t) { t.forEach(function (w) { ALLN[wNorm(w)] = true; }); });

  var W = {
    target: '', tn: '', tiles: [], order: [], ans: [], hints: 0, lock: false, win: false, msg: '', timer: 0,
    score: 0, streak: 0, solved: 0, seen: {}, hintsLeft: 3,
    best: parseInt(store('uandi-mots-best') || '0', 10) || 0
  };
  function wShuffleArr(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function wPick() {
    var cur = W.solved < 4 ? 0 : W.solved < 10 ? 1 : 2;
    for (var tries = 0; tries < 3; tries++) {
      var ti = Math.random() < 0.65 ? cur : Math.floor(Math.random() * (cur + 1));
      var pool = WORDS[ti].filter(function (w) { return !W.seen[w]; });
      if (pool.length) { var w = pool[Math.floor(Math.random() * pool.length)]; W.seen[w] = 1; return w; }
    }
    W.seen = {};
    var all = WORDS[cur], w2 = all[Math.floor(Math.random() * all.length)];
    W.seen[w2] = 1;
    return w2;
  }
  function wNewRound() {
    clearTimeout(W.timer);
    var w = wPick();
    W.target = w; W.tn = wNorm(w);
    W.tiles = w.split('').map(function (ch, i) { return { id: i, ch: ch, n: wNorm(ch) }; });
    var ids = W.tiles.map(function (t) { return t.id; });
    for (var k = 0; k < 20; k++) {
      wShuffleArr(ids);
      if (ids.map(function (i) { return W.tiles[i].n; }).join('') !== W.tn) break;
    }
    W.order = ids; W.ans = []; W.hints = 0; W.lock = false; W.win = false; W.msg = '';
    wRender();
  }
  function wRender() {
    $('#wScore').textContent = W.score;
    $('#wStreak').textContent = W.streak;
    $('#wBest').textContent = W.best;
    $('#wHint').textContent = 'Indice (' + W.hintsLeft + ')';
    $('#wHint').disabled = W.hintsLeft <= 0;
    var slots = $('#wSlots'), tiles = $('#wTiles'), n = W.tiles.length;
    slots.replaceChildren(); tiles.replaceChildren();
    for (var i = 0; i < n; i++) {
      var filled = i < W.ans.length;
      var s = el('button', 'wslot' + (filled ? ' fill' : '') + (W.win ? ' ok' : '') + (filled && i === W.ans.length - 1 && W.ans.length > (W.prevLen || 0) ? ' pop' : ''), filled ? W.tiles[W.ans[i]].ch : '');
      s.type = 'button'; s.dataset.i = i; s.style.setProperty('--i', i);
      s.setAttribute('aria-label', filled ? 'Retirer la lettre ' + W.tiles[W.ans[i]].ch : 'Case vide');
      slots.appendChild(s);
    }
    W.order.forEach(function (id) {
      var b = el('button', 'wtile', W.tiles[id].ch);
      b.type = 'button'; b.dataset.id = id;
      b.disabled = W.ans.indexOf(id) !== -1;
      tiles.appendChild(b);
    });
    $('#wMsg').textContent = W.msg;
    W.prevLen = W.ans.length;
  }
  function fxWin(pts) {
    if (window.SFX) SFX.win();
    if (!window.FX) return;
    var r = $('#wSlots').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    FX.confetti(x, y); FX.float('+' + pts + (W.streak >= 3 ? ' \uD83D\uDD25 x' + W.streak : ''), x, y - 24);
  }
  function wCheck() {
    var n = W.tiles.length;
    if (W.ans.length !== n) return;
    var g = W.ans.map(function (id) { return W.tiles[id].n; }).join('');
    if (g === W.tn || ALLN[g]) {
      var pts = Math.max(2, 5 + n * 2 + Math.min(W.streak, 5) - W.hints * 4);
      W.streak++; W.solved++; W.score += pts;
      if (W.score > W.best) { W.best = W.score; store('uandi-mots-best', String(W.best)); }
      W.lock = true; W.win = true; W.msg = 'Bravo ! +' + pts;
      wRender(); fxWin(pts);
      W.timer = setTimeout(wNewRound, 1100);
    } else {
      W.msg = 'Ce n’est pas ça, essaie encore.';
      wRender();
      var sl = $('#wSlots'); sl.classList.remove('shake'); void sl.offsetWidth; sl.classList.add('shake');
      if (window.SFX) SFX.error();
    }
  }
  function wHint() {
    if (W.lock || W.hintsLeft <= 0) return;
    var k = 0;
    while (k < W.ans.length && W.tiles[W.ans[k]].n === W.tn.charAt(k)) k++;
    W.ans = W.ans.slice(0, k);
    var want = W.tn.charAt(k), pick = -1;
    for (var i = 0; i < W.order.length; i++) {
      var id = W.order[i];
      if (W.ans.indexOf(id) === -1 && W.tiles[id].n === want) { pick = id; break; }
    }
    if (pick === -1) return;
    W.hintsLeft--; if (window.SFX) SFX.hint();
    W.ans.push(pick); W.hints++;
    W.msg = 'Indice utilisé (−4 points)' + (W.hintsLeft > 0 ? ' · il t’en reste ' + W.hintsLeft : ' · plus d’indice dans cette série');
    wRender(); wCheck();
  }
  function wSkip() {
    if (W.lock) return;
    if (window.SFX) SFX.lose();
    W.lock = true; W.streak = 0; W.hintsLeft = 3; W.ans = []; W.msg = 'C’était : ' + W.target.toUpperCase();
    wRender();
    W.timer = setTimeout(wNewRound, 1800);
  }
  function startGame() {
    W.score = 0; W.streak = 0; W.solved = 0; W.seen = {}; W.hintsLeft = 3;
    wNewRound();
  }
  function stopGame() {
    clearTimeout(W.timer);
  }
  function openGame() {
    leaveChat();
    pushView({ game: true });
    state.view = 'game';
    viewList.hidden = true;
    viewChat.hidden = true;
    viewMusic.hidden = true;
    viewGame.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    startGame();
  }
  $('#openGame').addEventListener('click', openGame);
  $('#gameBack').addEventListener('click', function () {
    if (history.state && history.state.game) history.back(); else showList();
  });
  $('#wTiles').addEventListener('click', function (e) {
    var b = e.target.closest('.wtile');
    if (!b || W.lock) return;
    var id = +b.dataset.id;
    if (W.ans.indexOf(id) !== -1) return;
    W.ans.push(id); W.msg = ''; if (window.SFX) SFX.tap();
    wRender(); wCheck();
  });
  $('#wSlots').addEventListener('click', function (e) {
    var b = e.target.closest('.wslot');
    if (!b || W.lock) return;
    var i = +b.dataset.i;
    if (i < W.ans.length) { W.ans.splice(i, 1); W.msg = ''; if (window.SFX) SFX.back(); wRender(); }
  });
  $('#wShuffle').addEventListener('click', function () { if (!W.lock) { wShuffleArr(W.order); if (window.SFX) SFX.swap(); wRender(); } });
  $('#wClear').addEventListener('click', function () { if (!W.lock) { W.ans = []; W.msg = ''; if (window.SFX) SFX.back(); wRender(); } });
  $('#wHint').addEventListener('click', wHint);
  $('#wSkip').addEventListener('click', wSkip);
  document.addEventListener('keydown', function (e) {
    if (state.view !== 'game' || W.lock || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') { e.preventDefault(); W.ans.pop(); W.msg = ''; if (window.SFX) SFX.back(); wRender(); return; }
    if (e.key.length !== 1) return;
    var n = wNorm(e.key);
    if (!/^[a-z]$/.test(n)) return;
    for (var i = 0; i < W.order.length; i++) {
      var id = W.order[i];
      if (W.ans.indexOf(id) === -1 && W.tiles[id].n === n) {
        e.preventDefault(); W.ans.push(id); W.msg = ''; if (window.SFX) SFX.tap();
        wRender(); wCheck();
        return;
      }
    }
  });




/* E'cho — js/app/16-alerte-notes-badges.js
   Alerte dans le site, notes, badge créateur
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- notification dans le site ---------- */
  var toastEl = $('#toast'), toastTimer = null, toastHideT = null, toastTarget = null, knownTs = {};
  function hideToast() {
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
    clearTimeout(toastHideT);
    toastHideT = setTimeout(function () { toastEl.hidden = true; }, 320);
  }
  var toastFr = false;
  function showToast(uid, name, text) {
    toastFr = false;
    clearTimeout(toastTimer); clearTimeout(toastHideT);
    toastTarget = uid ? { uid: uid, name: name } : null;
    toastEl.replaceChildren(el('span', 'tn', NOTIF_TITLE), el('span', 'tm', (name ? cap(name) + ' : ' : '') + (text || '')));
    toastEl.hidden = false;
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    toastTimer = setTimeout(hideToast, Math.min(15000, 5000 + String(text || '').length * 40));
  }
  function incomingElsewhere(id, c) {
    var other = (c.members || []).filter(function (x) { return x !== state.me; })[0];
    if (!other) return;
    var name = c.group ? (c.title || 'Groupe') : ((c.names && c.names[other]) || 'Nouveau message');
    var text = c.lastText || '';
    if (!npOn('msg')) return;
    var loud = fx();
    if (loud) speakNew();
    var show = function (full) { if (document.hidden) sysNotify(name, full, id, !loud); else showToast(other, name, full); };
    fs.collection('chats').doc(id).collection('messages').orderBy('ts', 'desc').limit(1).get()
      .then(function (q) { var d = q.docs[0] && q.docs[0].data(); show(d && typeof d.text === 'string' && d.text.charAt(0) !== SYS ? d.text : text); })
      .catch(function () { show(text); });
  }
  toastEl.addEventListener('click', function () {
    if (toastFr) { toastFr = false; hideToast(); frOpen('req'); return; }
    var t = toastTarget; hideToast();
    if (!t) return;
    if (state.view === 'game') { stopGame(); viewGame.hidden = true; }
    if (state.view === 'music') viewMusic.hidden = true;
    openChat(t.uid, t.name);
  });

  /* ---------- notes (visibles 24 h dans la liste) ---------- */
  /* ---------- badge créateur (activé avec une clé dans les réglages) ---------- */
  var BADGE_HASH = '6edc33a2368bb74356032f1ec792d2dd5c0e6d67a677a4e32732bbc7878dfec3', badges = {};
  var BADGE_TXT = '\u2713 Cr\u00e9ateur', verifs = {}, assists = {}, CERT_TXT = '\u2713 Certifi\u00e9';
  var SEAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon class="sl" stroke-width="1.6" stroke-linejoin="round" points="12.00,1.80 14.25,3.60 17.10,3.17 18.15,5.85 20.83,6.90 20.40,9.75 22.20,12.00 20.40,14.25 20.83,17.10 18.15,18.15 17.10,20.83 14.25,20.40 12.00,22.20 9.75,20.40 6.90,20.83 5.85,18.15 3.17,17.10 3.60,14.25 1.80,12.00 3.60,9.75 3.17,6.90 5.85,5.85 6.90,3.17 9.75,3.60"/><path class="ck" d="M7 12.6l3.3 3.3L17 8.9" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function badgeKind(uid) { return badges[uid] ? 'fnd' : assists[uid] ? 'ast' : verifs[uid] ? 'cert' : ''; }
  var BADGE_INFO = { fnd: ['Fondateur', 'Fondateur de E\'cho'], ast: ['Assistant', 'Assistant de E\'cho'], cert: ['Certifi\u00e9', 'Compte certifi\u00e9'] };
  /* badge pilule animé : icône (check qui pop) + mot toujours visible, reflet et halo décalés par badge */
  /* réglages d'affichage de CHAQUE badge : bpill = avec le mot, bhide = masqué. Chacun ne règle que le sien (champs de sa fiche presence). */
  var bprefs = {}, badgeSeen = {};
  /* couleurs de badge au choix (champ bcol de la fiche presence) ; '' = couleur du rôle */
  var BADGE_COLS = ['rose', 'rouge', 'orange', 'or', 'vert', 'turquoise', 'violet', 'indigo', 'noir', 'argent', 'coucher', 'ocean'];
  function colOk(c) { return BADGE_COLS.indexOf(c) > -1 ? c : ''; }
  function setBc(n, col) { if (col) n.dataset.bc = col; else delete n.dataset.bc; }
  function badgePrefs(uid) {
    var p = bprefs[uid];
    if (!p && uid && uid === state.me) { try { p = JSON.parse(localStorage.getItem('uandi-bp-' + uid) || 'null'); } catch (e) { p = null; } if (p) bprefs[uid] = p; }
    return { pill: !!(p && p.pill), hide: !!(p && p.hide), col: colOk(p && p.col) };
  }
  function uidHash(t) { var h = 0; t = String(t || ''); for (var k = 0; k < t.length; k++) h = (h * 31 + t.charCodeAt(k)) % 6000; return h; }
  /* met à jour tous les badges déjà à l'écran d'une personne, sans rien redessiner (pas de clignotement) */
  function badgePrefApply(uid) {
    var p = badgePrefs(uid), n = document.querySelectorAll('.ubadge[data-uid]');
    for (var k = 0; k < n.length; k++) if (n[k].dataset.uid === uid) { n[k].classList.toggle('pill', p.pill); n[k].classList.toggle('bh', p.hide); setBc(n[k], p.col); }
  }
  function badgeMeSync() {
    var p = badgePrefs(state.me); window.UI_BADGE_ME = { pill: p.pill, show: !p.hide, col: p.col };
    document.dispatchEvent(new CustomEvent('ui-badgeprefs'));
  }
  /* appelé par fonctions.js : { pill, hide } — uniquement pour MON badge */
  window.uiSetBadgePref = function (patch) {
    if (!state.me) return Promise.resolve();
    var old = badgePrefs(state.me), np = { pill: 'pill' in patch ? !!patch.pill : old.pill, hide: 'hide' in patch ? !!patch.hide : old.hide, col: 'col' in patch ? colOk(patch.col) : old.col };
    function put(v) { bprefs[state.me] = v; try { localStorage.setItem('uandi-bp-' + state.me, JSON.stringify(v)); } catch (e) {} badgePrefApply(state.me); badgeMeSync(); }
    put(np);
    var D = firebase.firestore.FieldValue.delete();
    return fs.collection('presence').doc(state.me).set({ bpill: np.pill ? true : D, bhide: np.hide ? true : D, bcol: np.col ? np.col : D }, { merge: true }).catch(function () { put(old); });
  };
  function paintBadge(b, kind, uid) {
    var i = BADGE_INFO[kind] || BADGE_INFO.cert, p = badgePrefs(uid), key = (uid || '') + ':' + kind;
    /* l'animation d'apparition ne joue qu'une fois par badge (les redessins de liste ne la rejouent plus) */
    b.className = 'ubadge ' + kind + (p.pill ? ' pill' : '') + (p.hide ? ' bh' : '') + (badgeSeen[key] ? ' st' : '');
    badgeSeen[key] = 1; b.dataset.uid = uid || ''; setBc(b, p.col);
    b.innerHTML = SEAL + '<span class="bt">' + i[0] + '</span>';
    /* phase calée sur l'horloge (toutes les animations durent 6 s ou un diviseur de 6 s) : aucun saut quand le badge est recréé */
    b.style.setProperty('--sd', '-' + ((Date.now() + uidHash(uid)) % 6000) + 'ms');
    b.title = i[1]; b.setAttribute('aria-label', b.title);
  }
  /* rôle de la personne connectée, partagé avec js/fonctions.js */
  function roleSync() {
    try {
      var r = { fnd: !!badges[state.me], ast: !!assists[state.me], cert: !!verifs[state.me] }, k = JSON.stringify(r);
      try { localStorage.setItem('uandi-fnd-' + state.me, r.fnd ? '1' : '0'); } catch (e) {}
      try { localStorage.setItem('uandi-ast-' + state.me, r.ast ? '1' : '0'); } catch (e) {}
      try { paintNick(); } catch (e) {}
      if (window.UI_ROLE_K === k) return;
      window.UI_ROLE_K = k; window.UI_ROLE = r;
      try { if (typeof stealthApply === 'function') stealthApply(); } catch (e) {}
      document.dispatchEvent(new CustomEvent('ui-role', { detail: r }));
    } catch (e) {}
  }
  /* musiques partagées : les certifiés y ont accès ; les comptes non certifiés seulement si le créateur les autorise */
  var musicOks = {};
  function musicShared() {
    try {
      if (!state.me) return false;
      if (badges[state.me]) return true;
      if (isCertMe()) return true;
      return (state.me in musicOks) ? musicOks[state.me] === true : localStorage.getItem('uandi-musicok-' + state.me) === '1';
    } catch (e) { return false; }
  }
  function badgeEl(uid) { var b = el('span', 'ubadge'); paintBadge(b, badgeKind(uid) || 'cert', uid); return b; }
  function isCertMe() { try { if (!state.me) return false; if (state.me in verifs || state.me in assists) return verifs[state.me] === true || assists[state.me] === true; return localStorage.getItem('uandi-cert-' + state.me) === '1'; } catch (e) { return false; } }
  /* Actualités : visibles par tous ; chacun peut masquer l'onglet pour son compte avec le champ caché des réglages */
  var NEWS_KEY = 'uandi-news-off-';
  /* onglet Actualités ouvert à tous ; seul le champ caché des réglages le masque pour son propre compte (les fils certifiés / non certifiés sont séparés plus bas) */
  function newsBlocked() {
    try {
      if (!state.me) return false;
      /* assistants (non créateurs) : lettres anonymes masquées, comme le mode discret du créateur */
      var ast = (state.me in assists) ? assists[state.me] === true : localStorage.getItem('uandi-ast-' + state.me) === '1';
      if (ast && badges[state.me] !== true) return true;
      return localStorage.getItem(NEWS_KEY + state.me) === '1';
    } catch (e) { return false; }
  }
  window.newsBlocked = newsBlocked;
  /* mode discret (code secret) : masque les outils créateur et les discussions anonymes */
  function stealthOn() { try { return !!state.me && localStorage.getItem(NEWS_KEY + state.me) === '1'; } catch (e) { return false; } }
  function creatorOn() { return !!badges[state.me] && !stealthOn(); }
  function newsAccess() { document.dispatchEvent(new Event('newsaccess')); }
  function newsCodeCheck(force) {
    var f = $('#newsCode'); if (!f) return;
    var v = f.value.trim().normalize('NFC').replace('\u2714', '\u2713');
    if (v !== 'Xil.lyam\u2713') { if (force) f.value = ''; return; }
    f.value = '';
    try {
      if (newsBlocked()) localStorage.removeItem(NEWS_KEY + state.me); else localStorage.setItem(NEWS_KEY + state.me, '1');
    } catch (e) {}
    stealthApply();
    newsAccess();
  }
  /* applique le mode discret tout de suite : ferme les fenêtres créateur, coupe les écoutes, vide les discussions anonymes */
  function stealthApply() {
    var hide = stealthOn();
    paintBadgeSec();
    try { if (crDlg.open) crDlg.close(); if (accDlg.open) accDlg.close(); } catch (e) {}
    if (typeof apCheck === 'function') apCheck();
    if (newsBlocked()) { try { atStop(); } catch (e) {} }
    if (typeof nwRender === 'function') nwRender();
    if (hide && state.view === 'news') { var nb = $('#nwBack'); if (nb) { nb.dataset.force = '1'; nb.click(); } }
  }
  var badgeReq = {};
  function ensureBadge(uid) {
    if (!uid || badgeReq[uid] || uid === state.me || (typeof noteSubs !== 'undefined' && noteSubs[uid])) return;
    badgeReq[uid] = 1;
    fs.collection('presence').doc(uid).get().then(function (d) {
      var v = d.exists ? d.data() : {}, b = v.badge === true, c = v.verified === true, as = v.assistant === true;
      bprefs[uid] = { pill: v.bpill === true, hide: v.bhide === true, col: colOk(v.bcol) };
      if (!!badges[uid] === b && !!verifs[uid] === c && !!assists[uid] === as) { badgePrefApply(uid); return; }
      badges[uid] = b; verifs[uid] = c; assists[uid] = as;
      if (!(b || c || as)) return;
      if (state.view === 'list') renderList();
      if (typeof nwRender === 'function' && NW && Object.keys(NW.open || {}).some(function (k) { return NW.open[k]; })) nwRender();
      if (frDlg.open) frRender();
      if (ucDlg.open) ucRender();
      if (nvDlg.open && nvTarget && nvTarget.uid === uid) { $('#nvName').textContent = cap(nvTarget.name); withBadge($('#nvName'), uid); }
    }).catch(function () { badgeReq[uid] = 0; });
  }
  function withBadge(node, uid) { if (badges[uid] || verifs[uid] || assists[uid]) node.appendChild(badgeEl(uid)); return node; }
  function updateChatBadge() {
    var b = $('#chatBadge'); if (!b) return;
    var o = state.chat && !state.chat.group ? state.chat.other : null, on = !!(o && (badges[o] || verifs[o] || assists[o]));
    b.hidden = !on; b.textContent = ''; b.className = 'ubadge'; if (on) paintBadge(b, badgeKind(o), o);
  }
  function sha256(t) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)).then(function (b) {
      return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    });
  }
  function paintBadgeSec() {
    var on = !!badges[state.me];
    $('#badgeState').textContent = on ? 'Badge actif : il s\u2019affiche \u00e0 c\u00f4t\u00e9 de ton nom pour tout le monde.' : 'Entre ta cl\u00e9 pour afficher le badge \u00ab Cr\u00e9ateur \u00bb \u00e0 c\u00f4t\u00e9 de ton nom.';
    $('#badgeKey').hidden = on; $('#badgeGo').hidden = on; $('#badgeOff').hidden = !on;
    $('#creatorSec').hidden = !on || stealthOn(); $('#badgeSec').hidden = on && stealthOn(); $('#myUid').textContent = state.me || '';
  }
  function badgeErr(t) { var e = $('#badgeErr'); e.textContent = t || ''; e.hidden = !t; }
  function badgeRefresh() {
    paintBadgeSec(); newsAccess(); roleSync();
    if (state.view === 'list') renderList();
    else if (state.view === 'chat') { updateChatBadge(); if (state.chat && state.chat.group) render(); }
  }
  function setBadge(on) {
    badgeErr('');
    return fs.collection('presence').doc(state.me).set({ name: myName(), badge: on ? true : firebase.firestore.FieldValue.delete() }, { merge: true })
      .then(function () { badges[state.me] = on; badgeRefresh(); })
      .catch(function () { badgeErr('Impossible d\u2019enregistrer le badge (connexion ou r\u00e8gles Firestore).'); });
  }
  $('#badgeGo').addEventListener('click', function () {
    var k = $('#badgeKey').value.trim().normalize('NFC');
    if (!k) { badgeErr('Entre ta cl\u00e9.'); return; }
    if (!(window.crypto && crypto.subtle)) { badgeErr('V\u00e9rification impossible : ouvre le site en https.'); return; }
    sha256(k).then(function (h) {
      if (h !== BADGE_HASH) { badgeErr('Cl\u00e9 incorrecte.'); return; }
      $('#badgeKey').value = ''; setBadge(true);
    });
  });
  $('#badgeOff').addEventListener('click', function () { setBadge(false); });
  $('#openSet').addEventListener('click', function () { badgeErr(''); paintBadgeSec(); });
  $('#newsCode').addEventListener('input', function () { newsCodeCheck(false); });
  $('#newsCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); newsCodeCheck(true); } });



/* E'cho — js/app/17-comptes-createur.js
   Outil créateur : liste des comptes
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- outil créateur : liste des comptes ---------- */
  var accDlg = $('#accDlg'), ACC = [];
  function accRender() {
    var q = ($('#accSearch').value || '').trim().toLowerCase(), box = $('#accRows');
    box.replaceChildren();
    ACC.filter(function (a) { return !q || a.name.indexOf(q) !== -1; }).forEach(function (a) {
      var row = el('div', 'accrow'); var acts = el('div', 'accacts');
      var b = el('button', 'gimem'); b.type = 'button';
      var av = el('span', 'avatar sm'); paintAvatar(av, a.name);
      b.appendChild(av); b.appendChild(withBadge(el('span', '', cap(a.name) + (a.uid === state.me ? ' \u00b7 toi' : '')), a.uid));
      if (a.uid !== state.me) b.addEventListener('click', function () {
        accDlg.close(); setDlg.close();
        if (state.view !== 'list') showList();
        openChat(a.uid, a.name);
      });
      row.appendChild(b);
      if (a.uid !== state.me) {
        var t = el('button', 'ghost', badges[a.uid] ? '\u2212 Cr\u00e9ateur' : '+ Cr\u00e9ateur'); t.type = 'button';
        t.addEventListener('click', function (e) { e.stopPropagation(); accBadge(a, t); });
        var ct = el('button', 'ghost', verifs[a.uid] ? '\u2212 Certifi\u00e9' : '+ Certifi\u00e9'); ct.type = 'button';
        ct.addEventListener('click', function (e) { e.stopPropagation(); accCert(a, ct); });
        acts.appendChild(ct);
        var as = el('button', 'ghost', assists[a.uid] ? '\u2212 Assistant' : '+ Assistant'); as.type = 'button';
        as.addEventListener('click', function (e) { e.stopPropagation(); accAssist(a, as); });
        acts.appendChild(as);
        if (!verifs[a.uid] && !assists[a.uid] && !badges[a.uid]) {
          var mu = el('button', 'ghost', musicOks[a.uid] ? '\u2212 Musique partag\u00e9e' : '+ Musique partag\u00e9e'); mu.type = 'button';
          mu.addEventListener('click', function (e) { e.stopPropagation(); accMusic(a, mu); });
          acts.appendChild(mu);
        }
        acts.appendChild(t);
        var bu = BANS[a.uid] || 0, on = bu > Date.now();
        var bn = el('button', 'ghost', on ? 'Lever la suspension' : 'Suspendre 7 j'); bn.type = 'button';
        bn.addEventListener('click', function (e) {
          e.stopPropagation();
          var ref = fs.collection('bans').doc(a.uid);
          (on ? ref.delete() : ref.set({ until: Date.now() + 7 * 864e5, ts: Date.now() }))
            .then(function () { if (on) delete BANS[a.uid]; else BANS[a.uid] = Date.now() + 7 * 864e5; accRender(); })
            .catch(function () { var er = $('#accListErr'); er.textContent = 'Suspension impossible : ajoute la règle Firestore « bans ».'; er.hidden = false; });
        });
        acts.appendChild(bn);
        var x = el('button', 'ghost del', 'Supprimer'); x.type = 'button';
        x.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!confirm('Supprimer d\u00e9finitivement le compte \u00ab ' + cap(a.name) + ' \u00bb et ses conversations ?')) return;
          x.disabled = true;
          purgeAccount(a.uid, a.name).then(function (ok) {
            if (ok) { ACC = ACC.filter(function (z) { return z.uid !== a.uid; }); $('#accTitle').textContent = ACC.length + ' compte' + (ACC.length > 1 ? 's' : ''); accRender(); }
            else x.disabled = false;
          });
        });
        acts.appendChild(x);
        row.appendChild(acts);
      }
      box.appendChild(row);
    });
  }
  async function purgeAccount(uid, name) {
    var err = $('#accListErr'); err.hidden = true;
    if (!uid || uid === state.me) return false;
    if (name) { try { await fs.collection('recovery').doc(name).delete(); } catch (e) {} }
    var FV = firebase.firestore.FieldValue, bad = false, i, j;
    try {
      var un = await fs.collection('usernames').where('uid', '==', uid).get();
      for (i = 0; i < un.docs.length; i++) await un.docs[i].ref.delete();
      if (name) { try { await fs.collection('usernames').doc(name).delete(); } catch (e) {} }
    } catch (e) { bad = true; }
    try { await fs.collection('presence').doc(uid).delete(); } catch (e) { bad = true; }
    try {
      var lk = await fs.collection('profileLikes').where('to', '==', uid).get();
      for (i = 0; i < lk.docs.length; i++) await lk.docs[i].ref.delete();
    } catch (e) {}
    try {
      var cs = await fs.collection('chats').where('members', 'array-contains', uid).get();
      for (i = 0; i < cs.docs.length; i++) {
        var ref = cs.docs[i].ref, cd = cs.docs[i].data() || {};
        if (cd.group) {
          var upd = { members: FV.arrayRemove(uid) };
          upd['names.' + uid] = FV.delete(); upd['nicks.' + uid] = FV.delete();
          await ref.update(upd);
        } else {
          for (j = 0; j < 50; j++) {
            var ms = await ref.collection('messages').limit(400).get();
            if (ms.empty) break;
            var bt = fs.batch();
            ms.docs.forEach(function (d) { bt.delete(d.ref); });
            await bt.commit();
          }
          await ref.delete();
        }
      }
    } catch (e) { bad = true; }
    if (bad) {
      err.textContent = 'Suppression incompl\u00e8te : les r\u00e8gles Firestore doivent autoriser le cr\u00e9ateur \u00e0 lire/supprimer usernames, chats et messages.'; err.hidden = false;
      return false;
    }
    return true;
  }
  $('#accPurgeGo').addEventListener('click', function () {
    var uid = ($('#accPurgeUid').value || '').trim(), err = $('#accListErr');
    if (!uid) { err.textContent = 'Colle l\u2019identifiant (uid) du compte \u00e0 nettoyer.'; err.hidden = false; return; }
    if (uid === state.me) { err.textContent = 'Tu ne peux pas nettoyer ton propre compte ici.'; err.hidden = false; return; }
    if (!confirm('Nettoyer tout ce qui reste de cet identifiant (pseudo, profil, conversations) ?')) return;
    var b = this; b.disabled = true;
    purgeAccount(uid, '').then(function (ok) {
      b.disabled = false;
      if (ok) { $('#accPurgeUid').value = ''; err.textContent = 'Nettoy\u00e9.'; err.hidden = false; }
    });
  });
  function accMusic(a, btn) {
    var on = !musicOks[a.uid], err = $('#accListErr'); err.hidden = true; btn.disabled = true;
    fs.collection('presence').doc(a.uid).set({ musicOk: on ? true : firebase.firestore.FieldValue.delete() }, { merge: true })
      .then(function () { musicOks[a.uid] = on; accRender(); })
      .catch(function () { btn.disabled = false; err.textContent = 'Impossible : les r\u00e8gles Firestore doivent autoriser les cr\u00e9ateurs \u00e0 modifier \u00ab musicOk \u00bb.'; err.hidden = false; });
  }
  function accCert(a, btn) {
    var on = !verifs[a.uid], err = $('#accListErr'); err.hidden = true; btn.disabled = true;
    fs.collection('presence').doc(a.uid).set({ verified: on ? true : firebase.firestore.FieldValue.delete() }, { merge: true })
      .then(function () { verifs[a.uid] = on; accRender(); })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'Certification impossible : les r\u00e8gles Firestore doivent autoriser les cr\u00e9ateurs \u00e0 modifier \u00ab verified \u00bb.'; err.hidden = false;
      });
  }
  function accAssist(a, btn) {
    var on = !assists[a.uid], err = $('#accListErr'); err.hidden = true; btn.disabled = true;
    fs.collection('presence').doc(a.uid).set({ assistant: on ? true : firebase.firestore.FieldValue.delete() }, { merge: true })
      .then(function () { assists[a.uid] = on; accRender(); })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'Impossible : les r\u00e8gles Firestore doivent autoriser les cr\u00e9ateurs \u00e0 modifier \u00ab assistant \u00bb.'; err.hidden = false;
      });
  }
  function accBadge(a, btn) {
    var on = !badges[a.uid], err = $('#accListErr'); err.hidden = true; btn.disabled = true;
    fs.collection('presence').doc(a.uid).set({ badge: on ? true : firebase.firestore.FieldValue.delete() }, { merge: true })
      .then(function () { badges[a.uid] = on; accRender(); })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'Badge impossible : les regles Firestore doivent autoriser les createurs a modifier le badge des autres.'; err.hidden = false;
      });
  }
  $('#accSearch').addEventListener('input', accRender);
  $('#accClose').addEventListener('click', function () { accDlg.close(); });
  accDlg.addEventListener('click', function (e) { if (e.target === accDlg) accDlg.close(); });
  $('#accList').addEventListener('click', function () {
    if (!creatorOn()) return;
    var err = $('#accListErr'); err.hidden = true; ACC = [];
    $('#accTitle').textContent = 'Comptes'; $('#accRows').replaceChildren(el('p', 'hint', 'Chargement\u2026'));
    $('#accSearch').value = ''; BANS = {};
    fs.collection('bans').get().then(function (sn) { sn.forEach(function (d) { BANS[d.id] = (d.data() || {}).until || 0; }); accRender(); }).catch(function () {});
    accDlg.showModal();
    fs.collection('usernames').get().then(function (sn) {
      sn.forEach(function (d) { var v = d.data(); if (v && typeof v.uid === 'string') ACC.push({ name: d.id, uid: v.uid }); });
      ACC.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      $('#accTitle').textContent = ACC.length + ' compte' + (ACC.length > 1 ? 's' : '');
      accRender();
      Promise.all(ACC.map(function (a) {
        return fs.collection('presence').doc(a.uid).get().then(function (d) { badges[a.uid] = !!(d.exists && d.data().badge === true); verifs[a.uid] = !!(d.exists && d.data().verified === true); assists[a.uid] = !!(d.exists && d.data().assistant === true); musicOks[a.uid] = !!(d.exists && d.data().musicOk === true); }).catch(function () {});
      })).then(accRender);
    }).catch(function () {
      $('#accRows').replaceChildren();
      err.textContent = 'Lecture refus\u00e9e : autorise \u00ab list \u00bb sur usernames pour les cr\u00e9ateurs dans les r\u00e8gles Firestore.'; err.hidden = false;
    });
  });
  var NOTE_TTL = 24 * 60 * 60 * 1000;
  var notePres = {}, noteSubs = {}, noteTimer = null;
  var neDlg = $('#noteEdit'), nvDlg = $('#noteView'), nvTarget = null;
  function activeNote(uid) {
    var p = notePres[uid];
    if (!p || typeof p.note !== 'string' || !p.note.trim() || typeof p.noteTs !== 'number') return null;
    if (Date.now() - p.noteTs > NOTE_TTL) return null;
    if (uid !== state.me && Array.isArray(p.noteTo) && p.noteTo.indexOf(state.me) === -1) return null;
    return { text: p.note, ts: p.noteTs };
  }
  function seenNotes() {
    try { return JSON.parse(store('uandi-nseen-' + state.me) || '{}') || {}; } catch (e) { return {}; }
  }
  function ringClass(uid) {
    var a = activeNote(uid);
    if (!a) return '';
    if (uid === state.me) return ' ring';
    return (seenNotes()[uid] || 0) >= a.ts ? ' ring seen' : ' ring';
  }
  function updateMyNote() {
    var av = $('#myNoteAv'), a = activeNote(state.me);
    paintPhoto(av, state.me, state.username);
    loadPhoto(state.me);
    av.className = 'avatar' + (a ? ' ring' : '');
    var nb = $('#myNote');
    nb.classList.toggle('has', !!a);
    nb.title = a ? 'Ma note : ' + a.text : 'Ajouter une note';
  }
  function updateChatRing() {
    if (!state.chat) return;
    $('#chatAvatar').className = 'avatar sm' + ringClass(state.chat.other);
  }
  function watchNotes(extra) {
    var uids = [state.me];
    if (extra && extra !== state.me) uids.push(extra);
    state.chats.forEach(function (c) {
      (c.members || []).forEach(function (u) { if (uids.indexOf(u) === -1) uids.push(u); });
    });
    uids.forEach(function (uid) {
      if (noteSubs[uid]) return;
      noteSubs[uid] = fs.collection('presence').doc(uid).onSnapshot(function (d) {
        var v = d.exists ? d.data() : null;
        var wasOn = isOnline(uid); seenAt[uid] = (v && v.seen) || 0; var flip = wasOn !== isOnline(uid);
        var before = JSON.stringify(notePres[uid] || null);
        notePres[uid] = v ? { note: v.note, noteTs: v.noteTs, badge: v.badge === true, verified: v.verified === true, assistant: v.assistant === true, hideSeen: v.hideSeen === true, noteTo: Array.isArray(v.noteTo) ? v.noteTo : null, bday: typeof v.bday === 'string' ? v.bday : null } : null;
        badges[uid] = !!(v && v.badge === true); verifs[uid] = !!(v && v.verified === true); assists[uid] = !!(v && v.assistant === true);
        var bpo = badgePrefs(uid), bpn = { pill: !!(v && v.bpill === true), hide: !!(v && v.bhide === true), col: colOk(v && v.bcol) };
        if (!(uid in bprefs) || bpo.pill !== bpn.pill || bpo.hide !== bpn.hide || bpo.col !== bpn.col) {
          bprefs[uid] = bpn; badgePrefApply(uid);
          if (uid === state.me) { try { localStorage.setItem('uandi-bp-' + uid, JSON.stringify(bpn)); } catch (e) {} }
        }
        if (uid === state.me) { var bm = window.UI_BADGE_ME || {}; if (bm.pill !== bpn.pill || bm.show !== !bpn.hide || (bm.col || '') !== bpn.col) badgeMeSync(); }
        if (uid === state.me) roleSync();
        musicOks[uid] = !!(v && v.musicOk === true); if (uid === state.me) { try { localStorage.setItem('uandi-musicok-' + state.me, musicOks[uid] ? '1' : '0'); } catch (e) {} if (window.mShRefresh) mShRefresh(); }
        if (uid === state.me) { try { localStorage.setItem('uandi-cert-' + state.me, v && (v.verified === true || v.assistant === true) ? '1' : '0'); } catch (e) {} newsAccess(); try { paintNick(); } catch (e) {} apCheck(); try { localStorage.setItem('uandi-hide-' + state.me, v && v.hideOn === true ? '1' : '0'); localStorage.setItem('uandi-hs-' + state.me, v && v.hideSeen === true ? '1' : '0'); } catch (e) {} paintHide(); }
        var ph = v && typeof v.photo === 'string' ? v.photo : null;
        var photoChanged = (photos[uid] || null) !== ph;
        if (photoChanged) photos[uid] = ph;
        if (uid === state.me && photoChanged) updateMyNote();
        if (JSON.stringify(notePres[uid]) === before && !photoChanged && !flip) return;
        if (state.view === 'list') renderList();
        else if (state.view === 'chat') {
          updateChatRing(); updateChatBadge(); if (state.chat && state.chat.group) render();
          if (photoChanged && state.chat && state.chat.other === uid) paintPhoto($('#chatAvatar'), uid, state.chat.name);
        }
      }, function () {});
    });
  }
  function noteAgo(ts) {
    var m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return 'il y a ' + m + ' min';
    return 'il y a ' + Math.floor(m / 60) + ' h';
  }
  function showNote(uid, name) {
    var a = activeNote(uid);
    if (a) {
      var seen = seenNotes(); seen[uid] = a.ts;
      store('uandi-nseen-' + state.me, JSON.stringify(seen));
    }
    nvTarget = { uid: uid, name: name };
    paintPhoto($('#nvAv'), uid, name);
    loadPhoto(uid);
    $('#nvName').textContent = cap(name);
    ensureBadge(uid); withBadge($('#nvName'), uid);
    $('#nvTime').textContent = a ? noteAgo(a.ts) : '';
    $('#nvText').textContent = a ? a.text : '';
    $('#nvText').hidden = !a;
    watchLikes(uid);
    $('#nvWrite').hidden = state.view === 'chat';
    $('#nvReplyBox').hidden = !(a && uid !== state.me);
    $('#nvReacts').hidden = !(a && uid !== state.me);
    $('#nvReplyIn').value = ''; $('#nvReplyErr').hidden = true;
    if (state.view === 'list') renderList(); else updateChatRing();
    nvDlg.showModal();
  }
  /* tap sur un avatar : s'il y a une note -> on voit d'abord la note ; sinon -> directement le profil */
  function avatarTap(uid, name) {
    if (uid !== state.me && activeNote(uid)) { showNote(uid, name); return; }
    if (window.UIProfile && UIProfile.open) UIProfile.open(uid, name); else showNote(uid, name);
  }
  /* depuis la note : re-taper l'avatar / le nom / le bouton ouvre le profil */
  function noteToProfile() {
    var t = nvTarget; if (!t) return;
    nvDlg.close();
    if (window.UIProfile && UIProfile.open) UIProfile.open(t.uid, t.name);
  }
  (function () {
    var av = $('#nvAv'), nm = $('#nvName'), w = $('#nvWrite');
    [av, nm].forEach(function (n) { if (n) { n.style.cursor = 'pointer'; n.addEventListener('click', noteToProfile); } });
    if (w && w.parentNode && !$('#nvProf')) {
      var b = el('button', 'ghost', '👤 Voir le profil'); b.id = 'nvProf'; b.type = 'button';
      b.addEventListener('click', noteToProfile);
      w.parentNode.insertBefore(b, w);
    }
  })();
  function noteCount() { $('#noteCount').textContent = $('#noteInput').value.length + ' / 60'; }
  function noteErr(t) { var e = $('#noteErr'); e.textContent = t || ''; e.hidden = !t; }
  $('#myNote').addEventListener('click', function () {
    var a = activeNote(state.me);
    $('#noteInput').value = a ? a.text : '';
    $('#noteDel').hidden = !a;
    $('#noteCloseOnly').checked = !!(notePres[state.me] && Array.isArray(notePres[state.me].noteTo));
    noteErr('');
    noteCount();
    neDlg.showModal();
    $('#noteInput').focus();
  });
  $('#noteInput').addEventListener('input', noteCount);
  $('#chatAvatar').addEventListener('click', function () {
    if (!state.chat) return;
    if (state.chat.group) openGroupInfo(); else avatarTap(state.chat.other, state.chat.name);
  });
  $('#noteCancel').addEventListener('click', function () { neDlg.close(); });
  $('#noteSave').addEventListener('click', function () {
    var text = $('#noteInput').value.trim();
    if (!text) { noteErr('Écris quelque chose avant de partager.'); return; }
    noteErr('');
    var only = $('#noteCloseOnly').checked;
    if (only && !closeList().length) { noteErr('Ajoute d’abord des amis proches (fiche d’un ami).'); return; }
    fs.collection('presence').doc(state.me).set({ name: myName(), note: text.slice(0, 60), noteTs: Date.now(), noteTo: only ? closeList() : firebase.firestore.FieldValue.delete() }, { merge: true })
      .then(function () { neDlg.close(); })
      .catch(function () { noteErr('La note n’a pas pu être publiée (connexion ou règles Firestore).'); });
  });
  $('#noteDel').addEventListener('click', function () {
    var del = firebase.firestore.FieldValue.delete();
    noteErr('');
    fs.collection('presence').doc(state.me).set({ note: del, noteTs: del }, { merge: true })
      .then(function () { neDlg.close(); })
      .catch(function () { noteErr('La note n’a pas pu être supprimée.'); });
  });
  $('#nvClose').addEventListener('click', function () { nvDlg.close(); });
  /* répondre directement à la note de quelqu'un : message dans leur discussion, avec la note citée */
  async function sendNoteReply(forced) {
    var t = nvTarget, inp = $('#nvReplyIn'), err = $('#nvReplyErr'), text = typeof forced === 'string' ? forced : inp.value.trim(), a = t && activeNote(t.uid);
    if (!t || !text || !a || t.uid === state.me) return;
    err.hidden = true;
    var btn = $('#nvReplySend'); btn.disabled = true;
    try {
      var cid = chatIdFor(state.me, t.uid), chatRef = fs.collection('chats').doc(cid), msgRef = chatRef.collection('messages').doc(), ts = Date.now();
      var exists = !!state.chatsById[cid];
      if (!exists) exists = (await chatRef.get()).exists;
      var batch = fs.batch();
      batch.set(msgRef, { uid: state.me, sts: SV(), text: text.slice(0, 2000), ts: ts, reply: { id: 'note:' + t.uid + ':' + a.ts, uid: t.uid, t: '📝 Note : ' + a.text.slice(0, 100) } });
      var last = { lastText: text.slice(0, 120), lastTs: ts, lastUid: state.me };
      if (exists) { last['seen.' + state.me] = ts; batch.update(chatRef, last); }
      else {
        var names = {}; names[state.me] = myName(); names[t.uid] = t.name;
        var seen = {}; seen[state.me] = ts;
        batch.set(chatRef, { members: [state.me, t.uid], names: names, lastText: last.lastText, lastTs: ts, lastUid: state.me, seen: seen });
      }
      await batch.commit();
      state.chatsById[cid] = true;
      inp.value = ''; nvDlg.close();
      if (!(state.view === 'chat' && state.chat && !state.chat.group && state.chat.other === t.uid)) openChat(t.uid, t.name);
    } catch (e) {
      err.textContent = 'Réponse non envoyée (connexion ou règles Firestore).'; err.hidden = false;
    }
    btn.disabled = false;
  }
  $('#nvReplySend').addEventListener('click', sendNoteReply);
  $('#nvReplyIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendNoteReply(); } });
  $('#nvWrite').addEventListener('click', function () {
    var t = nvTarget; nvDlg.close();
    if (t) openChat(t.uid, t.name);
  });




/* E'cho — js/app/18-compte.js
   Likes de profil, mot de passe, suppression du compte
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- likes de profil ---------- */
  var likeUnsub = null, likeState = { uid: null, n: 0, mine: false };
  function paintLike() {
    var b = $('#nvLike');
    b.classList.toggle('on', likeState.mine);
    b.setAttribute('aria-pressed', likeState.mine ? 'true' : 'false');
    b.firstChild.textContent = likeState.mine ? '♥' : '♡';
    $('#nvLikeN').textContent = likeState.n;
    b.disabled = likeState.uid === state.me;
  }
  function stopLikes() { if (likeUnsub) { likeUnsub(); likeUnsub = null; } }
  function watchLikes(uid) {
    stopLikes();
    likeState = { uid: uid, n: 0, mine: false };
    $('#nvLikeErr').hidden = true;
    paintLike();
    likeUnsub = fs.collection('profileLikes').where('to', '==', uid).onSnapshot(function (s) {
      likeState.n = s.size;
      likeState.mine = s.docs.some(function (d) { return d.data().from === state.me; });
      paintLike();
    }, function () {
      var e = $('#nvLikeErr');
      e.textContent = 'Likes indisponibles : ajoute la règle « profileLikes » dans les règles Firestore.';
      e.hidden = false;
    });
  }
  $('#nvLike').addEventListener('click', function () {
    var uid = likeState.uid;
    if (!uid || uid === state.me) return;
    var ref = fs.collection('profileLikes').doc(uid + '_' + state.me);
    var err = $('#nvLikeErr'); err.hidden = true;
    var p = likeState.mine ? ref.delete() : ref.set({ to: uid, from: state.me, ts: Date.now() });
    p.catch(function () {
      err.textContent = 'Le like n’a pas pu être enregistré (connexion ou règles Firestore).';
      err.hidden = false;
    });
  });
  nvDlg.addEventListener('close', stopLikes);
  [neDlg, nvDlg].forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
  });

  /* ---------- mot de passe : changer, code de récupération, mot de passe oublié ---------- */
  var TE = new TextEncoder(), TD = new TextDecoder();
  function b64(u) { return btoa(String.fromCharCode.apply(null, u)); }
  function unb64(t) { return Uint8Array.from(atob(t), function (c) { return c.charCodeAt(0); }); }
  function rcKey(code, salt) {
    var raw = TE.encode(code.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
    return crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function rcSave(uname, code, pass) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return rcKey(code, salt).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, TE.encode(pass)); }).then(function (ct) {
      return fs.collection('recovery').doc(uname).set({ salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)), uid: auth.currentUser.uid });
    });
  }
  function rcOpen(uname, code) {
    return fs.collection('recovery').doc(uname).get().then(function (d) {
      if (!d.exists) throw new Error('none');
      var v = d.data();
      return rcKey(code, unb64(v.salt)).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, k, unb64(v.ct)); });
    }).then(function (b) { return TD.decode(b); });
  }
  function newCode() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(20)), s = '', i;
    for (i = 0; i < 20; i++) { s += A[r[i] % 32]; if (i % 5 === 4 && i < 19) s += '-'; }
    return s;
  }
  function pwErr(t) { var e = $('#pwErr'); e.textContent = t || ''; e.hidden = !t; }
  function pwReauth() {
    var u = auth.currentUser, p = $('#pwCur').value;
    if (!u || !p) { pwErr('Entre ton mot de passe actuel.'); return Promise.reject(null); }
    return u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, p)).catch(function (e) {
      pwErr(e && e.code === 'auth/too-many-requests' ? 'Trop d’essais. Réessaie dans quelques minutes.' : 'Mot de passe actuel incorrect.'); throw null;
    });
  }
  $('#pwChange').addEventListener('click', function () {
    var np = $('#pwNew').value; pwErr(''); $('#pwCode').hidden = true;
    if (np.length < 6) { pwErr('Le nouveau mot de passe doit faire au moins 6 caractères.'); return; }
    pwReauth().then(function () { return auth.currentUser.updatePassword(np); })
      .then(function () { return fs.collection('recovery').doc(state.username).delete().catch(function () {}); })
      .then(function () { $('#pwCur').value = ''; $('#pwNew').value = ''; pwErr('Mot de passe changé. Crée un nouveau code de récupération.'); })
      .catch(function (e) { if (e) pwErr('Changement impossible.'); });
  });
  $('#pwRec').addEventListener('click', function () {
    var p = $('#pwCur').value, c = newCode(); pwErr('');
    if (!(window.crypto && crypto.subtle)) { pwErr('Ouvre le site en https.'); return; }
    pwReauth().then(function () { return rcSave(state.username, c, p); })
      .then(function () { var h = $('#pwCode'); h.textContent = 'Ton code (note-le, il ne sera plus affiché) : ' + c; h.hidden = false; $('#pwCur').value = ''; })
      .catch(function (e) { if (e) pwErr('Code impossible : vérifie les règles Firestore (recovery).'); });
  });
  function forgotErr(t) { var e = $('#forgotErr'); e.textContent = t || ''; e.hidden = !t; }
  function forgotShow(mode) {   /* mode : 'mail', 'code' ou null (retour à la connexion) */
    authForm.hidden = !!mode;
    $('#forgotMail').hidden = mode !== 'mail';
    $('#forgotForm').hidden = mode !== 'code';
    $('#forgotLink').textContent = mode ? '← Retour' : 'Mot de passe oublié ?';
    forgotErr(''); fmErr('');
  }
  $('#forgotLink').addEventListener('click', function () {
    forgotShow(authForm.hidden ? null : (emUrl() ? 'mail' : 'code'));
  });
  $('#fmSwap').addEventListener('click', function () { forgotShow('code'); });
  $('#fcSwap').addEventListener('click', function () { if (emUrl()) forgotShow('mail'); else forgotErr('Les codes par e-mail ne sont pas encore activés.'); });
  $('#forgotForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = $('#fu').value.trim().toLowerCase().replace(/\s+/g, ''), c = $('#fc').value.trim(), np = $('#fp').value, b = $('#forgotBtn');
    forgotErr('');
    if (!n || !c) { forgotErr('Entre ton nom d’utilisateur et ton code.'); return; }
    if (np && np.length < 6) { forgotErr('Le nouveau mot de passe doit faire au moins 6 caractères.'); return; }
    if (!(window.crypto && crypto.subtle)) { forgotErr('Ouvre le site en https.'); return; }
    b.disabled = true;
    rcOpen(n, c).then(function (pass) {
      return auth.signInWithEmailAndPassword(n + '@' + CFG.emailDomain, pass).then(function (cred) {
        if (!np) return;
        return cred.user.updatePassword(np).then(function () { return rcSave(n, c, np); });
      });
    }).catch(function () { forgotErr('Code ou nom d’utilisateur incorrect.'); }).then(function () { b.disabled = false; });
  });

  /* ---------- supprimer mon compte ---------- */
  function accErr(t) { var e = $('#accErr'); e.textContent = t || ''; e.hidden = !t; }
  function resetAcc() {
    $('#accConfirm').hidden = true; $('#accDel').hidden = false;
    $('#accPass').value = ''; $('#accGo').disabled = false; accErr('');
  }
  async function purgeBatch(q) {
    for (var g = 0; g < 50; g++) {
      var sn = await q.limit(400).get();
      if (sn.empty) return;
      var bt = fs.batch();
      sn.docs.forEach(function (d) { bt.delete(d.ref); });
      await bt.commit();
    }
  }
  async function delIfExists(ref) {
    var d = await ref.get();
    if (d.exists) await ref.delete();
  }
  async function deleteAccount() {
    var user = auth.currentUser, pass = $('#accPass').value;
    if (!user || !state.me) return;
    if (!pass) { accErr('Entre ton mot de passe pour confirmer.'); return; }
    var go = $('#accGo'); go.disabled = true; accErr('');
    var uid = state.me, uname = state.username;
    try {
      await user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email, pass));
    } catch (e) {
      go.disabled = false;
      var c = e && e.code;
      accErr(c === 'auth/too-many-requests' ? 'Trop d’essais. Réessaie dans quelques minutes.' :
        c === 'auth/network-request-failed' ? 'Pas de connexion internet.' : 'Mot de passe incorrect.');
      return;
    }
    state.deleting = true;
    var FV = firebase.firestore.FieldValue, i;
    try {
      // discussions : les messages privés sont effacés ; un groupe survit sans toi
      var cs = await fs.collection('chats').where('members', 'array-contains', uid).get();
      for (i = 0; i < cs.docs.length; i++) {
        var ref = cs.docs[i].ref, cd = cs.docs[i].data() || {};
        var others = (cd.members || []).filter(function (m) { return m !== uid; });
        if (cd.group && others.length) {
          var upd = { members: FV.arrayRemove(uid) };
          upd['names.' + uid] = FV.delete(); upd['nicks.' + uid] = FV.delete();
          if (cd.owner === uid) upd.owner = others[0];
          await ref.update(upd);
        } else {
          await purgeBatch(ref.collection('messages'));
          await ref.delete();
        }
      }
      // discussions anonymes
      var ats = await fs.collection('anonThreads').where('members', 'array-contains', uid).get();
      for (i = 0; i < ats.docs.length; i++) {
        await purgeBatch(ats.docs[i].ref.collection('messages'));
        await ats.docs[i].ref.delete();
      }
      // lettres et commentaires anonymes écrits par ce compte
      var lo = await fs.collection('letterOwners').where('uid', '==', uid).get();
      for (i = 0; i < lo.docs.length; i++) {
        var ov = lo.docs[i].data() || {};
        var lcs = ['letters', 'lettersN'];
        for (var lk = 0; lk < lcs.length; lk++) {
          try {
            if (ov.letter) await fs.collection(lcs[lk]).doc(ov.letter).collection('comments').doc(lo.docs[i].id).delete();
            else await fs.collection(lcs[lk]).doc(lo.docs[i].id).delete();
          } catch (e) {}
        }
        await lo.docs[i].ref.delete();
      }
      // amis, likes de profil, abonnement push, profil anonyme, présence, récupération, nom
      await purgeBatch(fs.collection('friendships').where('members', 'array-contains', uid));
      await purgeBatch(fs.collection('profileLikes').where('from', '==', uid));
      await purgeBatch(fs.collection('profileLikes').where('to', '==', uid));
      await delIfExists(fs.collection('pushSubs').doc(uid));
      await delIfExists(fs.collection('anonProfiles').doc(uid));
      await delIfExists(fs.collection('presence').doc(uid));
      if (uname) {
        await delIfExists(fs.collection('recovery').doc(uname));
        await delIfExists(fs.collection('usernames').doc(uname));
      }
      try { await delIfExists(fs.collection('approvals').doc(uid)); } catch (e) {}
    } catch (e) {
      state.deleting = false; go.disabled = false;
      accErr('Suppression interrompue : certaines données n’ont pas pu être effacées (vérifie la connexion et que les règles Firestore à jour sont publiées). Ton compte n’a pas été supprimé : réessaie.');
      return;
    }
    try {
      await user.delete();
    } catch (e) {
      state.deleting = false; go.disabled = false;
      accErr('Le compte n’a pas pu être supprimé. Reconnecte-toi puis réessaie.');
      return;
    }
    store('uandi-nseen-' + uid, null); store('uandi-hidden-' + uid, null);
    setDlg.close();
    setMode('signup');
    setAuthErr('Ton compte a été supprimé. Tu peux en créer un nouveau.');
  }
  $('#accDel').addEventListener('click', function () {
    $('#accConfirm').hidden = false; $('#accDel').hidden = true; accErr('');
    $('#accPass').focus();
  });
  $('#accCancel').addEventListener('click', resetAcc);
  $('#accGo').addEventListener('click', deleteAccount);
  setDlg.addEventListener('close', resetAcc);




/* E'cho — js/app/19-musique.js
   Musique, musiques partagées, partage dans une discussion
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- musique (fichiers de ton appareil) ---------- */
  var viewMusic = $('#viewMusic'), mAu = new Audio(), mDbP = null, mMsgT = null, mClearT = null;
  var M = { tracks: [], cur: -1, shuffle: false, repeat: 'off', loaded: false, seekAt: 0, edit: -1, draft: '', focusEdit: false };
  mAu.preload = 'auto';

  function mDb() {
    if (mDbP) return mDbP;
    mDbP = new Promise(function (ok, ko) {
      if (!window.indexedDB) { ko(new Error('noidb')); return; }
      var r = indexedDB.open('uandi-music-' + state.me, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
    return mDbP;
  }
  function mTx(mode, fn) {
    return mDb().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction('tracks', mode), res = fn(tx.objectStore('tracks'));
        tx.oncomplete = function () { ok(res ? res.result : undefined); };
        tx.onerror = tx.onabort = function () { ko(tx.error); };
      });
    });
  }
  function mName(n) { return String(n || '').replace(/\.[^.]+$/, ''); }
  function mLabel(t) { return (t && (t.title || mName(t.name))) || ''; }
  function mDecode(b) {
    var enc = b[0], body = b.subarray(1), s = '';
    try {
      if (enc === 1 || enc === 2) {
        var le = enc === 1;
        if (body.length >= 2 && body[0] === 0xFE && body[1] === 0xFF) { le = false; body = body.subarray(2); }
        else if (body.length >= 2 && body[0] === 0xFF && body[1] === 0xFE) { le = true; body = body.subarray(2); }
        s = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body);
      } else s = new TextDecoder(enc === 3 ? 'utf-8' : 'iso-8859-1').decode(body);
    } catch (e) { s = ''; }
    return s.replace(/\u0000/g, '').trim();
  }
  function mSync(u8, p) { return ((u8[p] & 0x7f) << 21) | ((u8[p + 1] & 0x7f) << 14) | ((u8[p + 2] & 0x7f) << 7) | (u8[p + 3] & 0x7f); }
  function mReadTitle(file) {
    if (/^audio\/(wav|x-wav|ogg|flac|webm)/.test(file.type || '')) return Promise.resolve('');
    return file.slice(0, 262144).arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf), d = new DataView(buf);
      if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return '';
      var ver = u8[3], end = Math.min(10 + mSync(u8, 6), u8.length), pos = 10, title = '', artist = '';
      if (u8[5] & 0x40) pos += ver === 4 ? mSync(u8, 10) : d.getUint32(10) + 4;
      while (pos + 10 <= end) {
        var id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        var size = ver === 4 ? mSync(u8, pos + 4) : d.getUint32(pos + 4), start = pos + 10;
        if (size <= 0 || start + size > u8.length) break;
        if (id === 'TIT2') title = mDecode(u8.subarray(start, start + size));
        else if (id === 'TPE1') artist = mDecode(u8.subarray(start, start + size));
        pos = start + size;
      }
      return title ? (artist ? artist + ' - ' + title : title) : '';
    }).catch(function () { return ''; });
  }
  function mIsAudio(f) {
    var t = f.type || '';
    if (t.indexOf('audio/') === 0 || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|amr|3gp)$/i.test(f.name || '')) return true;
    /* Android donne souvent un fichier sans extension et sans type : le sélecteur n'a déjà proposé que de l'audio */
    return !/^(image|text)\//.test(t) && !/^application\/(pdf|zip|json|x-zip|msword|vnd)/.test(t);
  }
  function mType(f) {
    if (f.type && f.type.indexOf('audio/') === 0) return Promise.resolve(f.type);
    return f.slice(0, 12).arrayBuffer().then(function (b) {
      var u = new Uint8Array(b), s = String.fromCharCode.apply(null, Array.prototype.slice.call(u));
      if (s.slice(0, 4) === 'OggS') return 'audio/ogg';
      if (s.slice(0, 4) === 'fLaC') return 'audio/flac';
      if (s.slice(0, 4) === 'RIFF' && s.slice(8, 12) === 'WAVE') return 'audio/wav';
      if (s.slice(4, 8) === 'ftyp') return 'audio/mp4';
      if (u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3) return 'audio/webm';
      return 'audio/mpeg';
    }).catch(function () { return 'audio/mpeg'; });
  }
  function mMsg(t) {
    $('#mMsg').textContent = t || '';
    clearTimeout(mMsgT);
    if (t) mMsgT = setTimeout(function () { $('#mMsg').textContent = ''; }, 4500);
  }
  function mMeta() {
    try {
      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      var t = M.tracks[M.cur];
      navigator.mediaSession.metadata = t ? new MediaMetadata({ title: mLabel(t), artist: 'E\'cho' }) : null;
    } catch (e) {}
  }
  function mRender() {
    var list = $('#mList');
    list.replaceChildren();
    if (!M.tracks.length) {
      var li0 = el('li', 'empty');
      li0.appendChild(el('strong', '', 'Aucune musique'));
      li0.appendChild(document.createTextNode('Ajoute des fichiers audio de ton appareil pour les écouter ici.'));
      list.appendChild(li0);
    }
    var playing = !mAu.paused && M.cur >= 0;
    M.tracks.forEach(function (t, i) {
      var li = el('li'), row = el('div', 'mrow' + (i === M.cur ? ' on' : ''));
      if (i === M.edit) {
        var inp = el('input', 'field mfield');
        inp.type = 'text'; inp.maxLength = 80; inp.value = M.draft;
        inp.setAttribute('aria-label', 'Nom de la musique');
        var ok = el('button', 'ghost mok', 'OK');
        ok.type = 'button'; ok.dataset.i = i;
        row.appendChild(inp); row.appendChild(ok);
      } else {
        var b = el('button', 'mname', (i === M.cur && playing ? '▶ ' : '') + mLabel(t));
        b.type = 'button'; b.dataset.i = i;
        var r = el('button', 'mren', '✎');
        r.type = 'button'; r.dataset.i = i; r.setAttribute('aria-label', 'Renommer ' + mLabel(t));
        var d = el('button', 'mdel', '✕');
        d.type = 'button'; d.dataset.i = i; d.setAttribute('aria-label', 'Retirer ' + mLabel(t));
        var sh = el('button', 'mshare', '↗');
        sh.type = 'button'; sh.dataset.i = i; sh.disabled = !!M.sharing;
        sh.setAttribute('aria-label', 'Partager ' + mLabel(t) + ' dans une discussion');
        row.appendChild(b); try { mCloudBtn(row, t); } catch (e) {} row.appendChild(sh); row.appendChild(r); row.appendChild(d);
      }
      li.appendChild(row); list.appendChild(li);
    });
    if (M.focusEdit) {
      M.focusEdit = false;
      var fi = list.querySelector('.mfield');
      if (fi) { fi.focus(); fi.select(); }
    }
    var cur = M.tracks[M.cur];
    $('#mTitle').textContent = cur ? mLabel(cur) : 'Aucune musique sélectionnée';
    $('#mClear').hidden = !M.tracks.length;
    $('#mShuffle').setAttribute('aria-pressed', M.shuffle ? 'true' : 'false');
    var rp = $('#mRepeat');
    rp.setAttribute('aria-pressed', M.repeat !== 'off' ? 'true' : 'false');
    rp.innerHTML = '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>' + (M.repeat === 'one' ? '<b class="r1">1</b>' : '');
    $('#mPlay').classList.toggle('playing', playing);
    $('#mPlay').setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
    $('#mDisc').classList.toggle('playing', playing);
    $('#openMusic').classList.toggle('playing', playing);
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
    try { mShRender(); } catch (e) {}
  }
  function mTime() {
    var d = mAu.duration, c = mAu.currentTime || 0, ok = isFinite(d) && d > 0;
    $('#mCur').textContent = fmtDur(c);
    $('#mDur').textContent = ok ? fmtDur(d) : '0:00';
    if (Date.now() - M.seekAt > 500) $('#mSeek').value = ok ? Math.round(c / d * 1000) : 0;
  }
  function mLoad() {
    if (M.loaded) return M.loading;
    M.loaded = true;
    M.loading = mTx('readonly', function (st) { return st.getAll(); }).then(function (rows) {
      (rows || []).sort(function (a, b) { return a.id - b.id; }).forEach(function (r) {
        M.tracks.push({ id: r.id, name: r.name, title: r.title || '', cid: r.cid || '', url: URL.createObjectURL(r.blob) });
      });
    }).catch(function () {
      mMsg('Ton navigateur ne peut pas garder la liste : elle sera perdue au rechargement.');
    }).then(function () { mRender(); });
    return M.loading;
  }
  async function mAdd(files) {
    files = files.filter(mIsAudio);
    if (!files.length) { mMsg('Choisis des fichiers audio (mp3, m4a, wav…).'); return; }
    var added = 0, lost = false;
    for (var i = 0; i < files.length; i++) {
      var f0 = files[i], id, title = await mReadTitle(f0), ty = await mType(f0);
      var f = f0.type === ty ? f0 : f0.slice(0, f0.size, ty);
      try {
        id = await mTx('readwrite', function (st) { return st.add({ name: f0.name, title: title, type: ty, blob: f }); });
      } catch (e) { lost = true; id = 'tmp' + Date.now() + '-' + i; }
      M.tracks.push({ id: id, name: f0.name, title: title, cid: '', url: URL.createObjectURL(f) });
      added++;
    }
    mMsg(added + (added > 1 ? ' musiques ajoutées.' : ' musique ajoutée.') + (lost ? ' Certaines ne seront pas gardées après un rechargement.' : ''));
    mRender();
  }
  function mPlay(i) {
    if (i < 0 || i >= M.tracks.length) return;
    M.cur = i;
    mAu.src = M.tracks[i].url;
    var p = mAu.play();
    if (p && p.catch) p.catch(function () { mMsg('Appuie sur lecture pour démarrer.'); });
    mMeta(); mRender();
  }
  function mToggle() {
    if (M.cur < 0) { if (M.tracks.length) mPlay(0); return; }
    if (mAu.paused) { var p = mAu.play(); if (p && p.catch) p.catch(function () {}); } else mAu.pause();
  }
  function mNext(auto) {
    var n = M.tracks.length;
    if (!n) return;
    if (auto && M.repeat === 'one') { mAu.currentTime = 0; mAu.play(); return; }
    var nx;
    if (M.shuffle && n > 1) { do { nx = Math.floor(Math.random() * n); } while (nx === M.cur); }
    else {
      nx = M.cur + 1;
      if (nx >= n) {
        if (M.repeat === 'all' || !auto) nx = 0;
        else { mAu.pause(); mAu.currentTime = 0; return; }
      }
    }
    mPlay(nx);
  }
  function mPrev() {
    var n = M.tracks.length;
    if (!n) return;
    if (mAu.currentTime > 3 || M.cur < 0) { mAu.currentTime = 0; return; }
    mPlay(M.cur <= 0 ? n - 1 : M.cur - 1);
  }
  function mRemove(i) {
    var t = M.tracks[i];
    if (!t) return;
    M.edit = -1;
    if (typeof t.id === 'number') mTx('readwrite', function (st) { return st.delete(t.id); }).catch(function () {});
    try { URL.revokeObjectURL(t.url); } catch (e) {}
    M.tracks.splice(i, 1);
    if (M.cur === i) { mAu.pause(); mAu.removeAttribute('src'); mAu.load(); M.cur = -1; mTime(); }
    else if (M.cur > i) M.cur--;
    mMeta(); mRender();
  }
  function resetMClear() {
    clearTimeout(mClearT);
    var b = $('#mClear'); b.classList.remove('sure'); b.textContent = 'Tout retirer';
  }
  function resetMusic() {
    try { mShStop(); } catch (e) {}
    try { mAu.pause(); mAu.removeAttribute('src'); mAu.load(); } catch (e) {}
    M.tracks.forEach(function (t) { try { URL.revokeObjectURL(t.url); } catch (e) {} });
    M.tracks = []; M.cur = -1; M.loaded = false; M.edit = -1;
    if (mDbP) { mDbP.then(function (db) { db.close(); }, function () {}); mDbP = null; }
    mMeta(); mRender(); mTime();
  }
  /* ---------- musiques partagées : sauvegardées sur Cloudinary, liste dans Firestore (collection « sharedMusic ») ---------- */
  var SH = { pub: {}, mine: {}, unsubs: [] };
  async function mCloudPush(t, file, title, pub) {
    try {
      if (!state.me || navigator.onLine === false || !file) { mMsg('Connecte-toi à internet pour partager.'); return; }
      if (file.size > 40 * 1048576) { mMsg('Fichier trop gros pour le cloud (40 Mo maximum).'); return; }
      var up = file;
      try {
        var nm0 = String(t.name || title || 'musique');
        if (!/\.[a-z0-9]{2,5}$/i.test(nm0)) nm0 += '.mp3';
        up = new File([file], nm0, { type: (file.type && file.type.indexOf('audio/') === 0) ? file.type : 'audio/mpeg' });
      } catch (e0) { up = file; }
      var url = await cloudUp(up, 'video');
      if (!url) { mMsg('Envoi vers le cloud impossible (' + (CLD_ERR || 'erreur') + ').'); return; }
      var data = { uid: state.me, uname: myName() || '', title: String(title || mName(t.name)).slice(0, 100), name: String(t.name || '').slice(0, 120), url: url, size: file.size, ts: Date.now(), pub: !!pub && musicShared() };
      var ref = await fs.collection('sharedMusic').add(data);
      t.cid = ref.id; SH.mine[ref.id] = data;
      if (typeof t.id === 'number') mTx('readwrite', function (st) { var g = st.get(t.id); g.onsuccess = function () { if (g.result) { g.result.cid = ref.id; st.put(g.result); } }; return g; }).catch(function () {});
      mMsg(data.pub ? 'Musique partagée avec tout le monde ☁' : 'Musique sauvegardée sur ton cloud ☁');
    } catch (e) { mMsg('Partage impossible (règles Firestore « sharedMusic » ?).'); }
  }
  /* bouton ☁ de chaque musique : partager / ne plus partager */
  function mCloudBtn(row, t) {
    if (!musicShared() || t.remote || (t.cid && !SH.mine[t.cid])) return;
    var on = !!(t.cid && SH.mine[t.cid] && SH.mine[t.cid].pub === true);
    var c = el('button', 'mcloud' + (on ? ' on' : ''), '☁'); c.type = 'button';
    c.title = on ? 'Partagée : appuie pour ne plus partager' : 'Appuie pour partager cette musique';
    c.setAttribute('aria-label', c.title); c.setAttribute('aria-pressed', on ? 'true' : 'false');
    c.disabled = !!t.up;
    c.addEventListener('click', function (e) { e.stopPropagation(); mShToggle(t); });
    row.appendChild(c);
  }
  async function mShToggle(t) {
    if (t.up || !state.me) return;
    var cur = t.cid && SH.mine[t.cid], want = !(cur && cur.pub === true);
    if (want && !musicShared()) { mMsg('Ton compte n’a pas accès au partage de musiques.'); return; }
    if (navigator.onLine === false) { mMsg('Connecte-toi à internet pour changer le partage.'); return; }
    if (!t.cid) {
      t.up = true; mRender(); mMsg('Envoi de la musique sur le cloud…');
      try { var r = await fetch(t.url), blob = await r.blob(); await mCloudPush(t, blob, mLabel(t), true); }
      catch (e) { mMsg('Envoi impossible.'); }
      t.up = false; mRender(); return;
    }
    try {
      await fs.collection('sharedMusic').doc(t.cid).update({ pub: want });
      if (SH.mine[t.cid]) SH.mine[t.cid].pub = want;
      mMsg(want ? 'Musique partagée avec tout le monde ☁' : 'Musique non partagée (elle reste dans ton cloud).');
    } catch (e) { mMsg('Changement impossible (règles Firestore « sharedMusic » ?).'); }
    mRender();
  }
  function mShStop() { SH.unsubs.forEach(function (u) { try { u(); } catch (e) {} }); SH.unsubs = []; SH.pub = {}; SH.mine = {}; }
  function mShFail() { SH.err = true; try { mShRender(); } catch (e) {} mShMsg('Chargement impossible : les règles Firestore doivent autoriser la lecture de « sharedMusic ».'); }
  function mShStart() {
    mShStop(); SH.err = false;
    if (!state.me) { mShRender(); return; }
    try {
      SH.unsubs.push(fs.collection('sharedMusic').where('uid', '==', state.me).onSnapshot(function (q) { SH.mine = {}; q.forEach(function (d) { SH.mine[d.id] = d.data(); }); mRender(); }, function () { mShFail(); }));
      if (musicShared()) SH.unsubs.push(fs.collection('sharedMusic').where('pub', '==', true).limit(300).onSnapshot(function (q) { SH.pub = {}; q.forEach(function (d) { SH.pub[d.id] = d.data(); }); mRender(); }, function () { mShFail(); }));
    } catch (e) {}
    mShRender();
  }
  window.mShRefresh = function () { if (!viewMusic.hidden) mShStart(); };
  window.addEventListener('online', function () { if (!viewMusic.hidden) mShStart(); });
  window.addEventListener('offline', function () { try { mShRender(); } catch (e) {} });
  function mShMsg(t) { var n = $('#mShMsg'); if (n) { n.textContent = t || ''; setTimeout(function () { if (n.textContent === t) n.textContent = ''; }, 4500); } }
  function mShRender() {
    var box = $('#mShared'), ul = $('#mShList'); if (!box || !ul) return;
    var all = {};
    Object.keys(SH.pub).forEach(function (k) { all[k] = SH.pub[k]; });
    Object.keys(SH.mine).forEach(function (k) { all[k] = SH.mine[k]; });
    var have = {}; M.tracks.forEach(function (t, i) { if (t.cid && !t.remote) have[t.cid] = i; });
    var ids = Object.keys(all).sort(function (a, b) { return (all[b].ts || 0) - (all[a].ts || 0); });
    var online = navigator.onLine !== false;
    if (!online) ids = ids.filter(function (k) { return k in have; });
    var can = musicShared();
    box.hidden = !state.me || (!can && !Object.keys(SH.mine).length);
    $('#mShTitle').textContent = can ? '☁ Musiques partagées' : '☁ Mon cloud';
    ul.replaceChildren();
    if (!ids.length) { var e0 = el('li', 'empty'); e0.appendChild(document.createTextNode(SH.err ? 'Impossible de charger les musiques partagées (règles Firestore « sharedMusic » : autorise la lecture).' : online ? 'Aucune musique partagée pour le moment.' : 'Hors connexion : seules les musiques téléchargées sont disponibles.')); ul.appendChild(e0); return; }
    ids.forEach(function (k) {
      var it = all[k], mine = it.uid === state.me, li = el('li'), row = el('div', 'mrow');
      var b = el('button', 'mname', (mine ? (it.pub === true ? '☁ ' : '🔒 ') : '') + (it.title || it.name || 'Musique') + (mine ? '' : ' · ' + cap(it.uname || '?')));
      b.type = 'button';
      b.addEventListener('click', function () {
        if (k in have) { mPlay(have[k]); return; }
        if (!online) { mShMsg('Hors connexion : télécharge-la d’abord.'); return; }
        var j = -1; M.tracks.forEach(function (t, n) { if (t.remote && t.cid === k) j = n; });
        if (j < 0) { M.tracks.push({ id: 'sh' + k, name: it.name || it.title, title: it.title || '', cid: k, remote: true, url: it.url }); j = M.tracks.length - 1; }
        mPlay(j);
      });
      var dl = el('button', 'mshare', k in have ? '✓' : '⬇'); dl.type = 'button';
      dl.setAttribute('aria-label', k in have ? 'Déjà sur ton appareil' : 'Télécharger sur ton appareil');
      dl.disabled = (k in have) || !online;
      dl.addEventListener('click', function () { mShSave(k, it, dl); });
      row.appendChild(b); row.appendChild(dl);
      if (mine) {
        var rm = el('button', 'mdel', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', 'Retirer du cloud');
        rm.addEventListener('click', function () { if (!confirm('Retirer cette musique du cloud et du partage ? (elle reste sur ton appareil si tu l’as téléchargée)')) return; fs.collection('sharedMusic').doc(k).delete().catch(function () { mShMsg('Suppression impossible.'); }); });
        row.appendChild(rm);
      }
      li.appendChild(row); ul.appendChild(li);
    });
  }
  /* lien de secours : Cloudinary convertit en mp3 à la volée si l'original n'est pas lisible tel quel */
  function mAltUrl(u) { return (typeof u === 'string' && u.indexOf('/upload/') > 0 && u.indexOf('/upload/f_mp3/') < 0) ? u.replace('/upload/', '/upload/f_mp3/') : ''; }
  async function mGetBlob(u) {
    var list = [u], alt = mAltUrl(u); if (alt) list.push(alt);
    for (var i = 0; i < list.length; i++) {
      try { var r = await fetch(list[i]); if (r.ok) { var b = await r.blob(); if (b && b.size > 0) return b; } } catch (e) {}
    }
    return null;
  }
  async function mShSave(k, it, btn) {
    btn.disabled = true; mShMsg('Téléchargement…');
    try {
      var blob = await mGetBlob(it.url); if (!blob) throw new Error('http');
      var ty = blob.type && blob.type.indexOf('audio/') === 0 ? blob.type : 'audio/mpeg';
      var f = blob.type === ty ? blob : blob.slice(0, blob.size, ty), id;
      try { id = await mTx('readwrite', function (st) { return st.add({ name: it.name || (it.title + '.mp3'), title: it.title || '', type: ty, blob: f, cid: k }); }); } catch (e) { id = 'tmp' + Date.now(); }
      var tr = { id: id, name: it.name || it.title, title: it.title || '', cid: k, url: URL.createObjectURL(f) }, j = -1;
      M.tracks.forEach(function (t, n) { if (t.remote && t.cid === k) j = n; });
      if (j >= 0) M.tracks[j] = tr; else M.tracks.push(tr);
      mShMsg('Téléchargée : disponible sans connexion ✓'); mRender();
    } catch (e) { btn.disabled = false; mShMsg('Téléchargement impossible.'); }
  }
  /* ---------- partager une musique dans une discussion (envoyée comme un vocal) ---------- */
  var SHARE_MAX = 120, SHARE_BYTES = 650000;
  function mStatus(t) { clearTimeout(mMsgT); $('#mMsg').textContent = t || ''; if (M.sharing && M.cancelBtn) $('#mMsg').appendChild(M.cancelBtn); }
  function mShareClose() { var s = document.querySelector('.sheetbg'); if (s) s.remove(); }
  function mShareAsk(i) {
    var t = M.tracks[i];
    if (!t || M.sharing) return;
    mShareClose();
    var hid = hiddenChats();
    var chats = state.chats.slice().sort(function (a, b) { return (b.lastTs || 0) - (a.lastTs || 0); })
      .filter(function (c) { return !(hid[c.id] && (c.lastTs || 0) <= hid[c.id]); });
    var bg = el('div', 'sheetbg'), sheet = el('div', 'sheet');
    var pv = new Audio(), pvStop = null, D = 0, st = 0, en = 0;
    function close() { try { pv.pause(); } catch (e) {} clearInterval(pvStop); mShareClose(); }
    sheet.appendChild(el('h3', '', 'Partager « ' + mLabel(t) + ' »'));
    sheet.appendChild(el('p', '', 'Choisis le passage à envoyer (120 s maximum).'));
    var info = el('p', 'trinfo', 'Chargement…');
    var l1 = el('label', 'trlab', 'Début'), r1 = el('input'), v1 = el('span', 'trval', '0:00');
    var l2 = el('label', 'trlab', 'Fin'), r2 = el('input'), v2 = el('span', 'trval', '0:00');
    [r1, r2].forEach(function (r) { r.type = 'range'; r.min = 0; r.max = 1; r.step = 1; r.value = 0; r.disabled = true; });
    r1.setAttribute('aria-label', 'Début de l’extrait'); r2.setAttribute('aria-label', 'Fin de l’extrait');
    l1.appendChild(r1); l1.appendChild(v1); l2.appendChild(r2); l2.appendChild(v2);
    var prev = el('button', 'ghost', '▶ Écouter l’extrait');
    prev.type = 'button'; prev.disabled = true;
    function paint() {
      v1.textContent = fmtDur(st); v2.textContent = fmtDur(en);
      info.textContent = 'Extrait : ' + fmtDur(st) + ' → ' + fmtDur(en) + ' (' + Math.round(en - st) + ' s)';
    }
    r1.addEventListener('input', function () {
      st = +r1.value;
      if (st > en - 1) en = Math.min(D, st + 1);
      if (en - st > SHARE_MAX) en = st + SHARE_MAX;
      r2.value = en; paint();
    });
    r2.addEventListener('input', function () {
      en = +r2.value;
      if (en < st + 1) st = Math.max(0, en - 1);
      if (en - st > SHARE_MAX) st = en - SHARE_MAX;
      r1.value = st; paint();
    });
    prev.addEventListener('click', function () {
      if (!pv.paused) { pv.pause(); clearInterval(pvStop); prev.textContent = '▶ Écouter l’extrait'; return; }
      if (!mAu.paused) mAu.pause();
      pv.currentTime = st;
      pv.play().catch(function () {});
      prev.textContent = '❚❚ Arrêter';
      clearInterval(pvStop);
      pvStop = setInterval(function () {
        if (pv.paused || pv.currentTime >= en) { pv.pause(); clearInterval(pvStop); prev.textContent = '▶ Écouter l’extrait'; }
      }, 100);
    });
    pv.preload = 'metadata'; pv.src = t.url;
    mDuration(t.url).then(function (d) {
      D = Math.floor(d);
      if (!D) { info.textContent = 'Impossible de lire la durée de ce morceau.'; return; }
      st = 0; en = Math.min(D, SHARE_MAX);
      [r1, r2].forEach(function (r) { r.max = D; r.disabled = false; });
      r1.value = st; r2.value = en; prev.disabled = false; paint();
    });
    sheet.appendChild(info); sheet.appendChild(l1); sheet.appendChild(l2); sheet.appendChild(prev);
    sheet.appendChild(el('p', 'trsend', 'Envoyer à :'));
    if (!chats.length) sheet.appendChild(el('p', '', 'Aucune discussion pour l’instant. Écris d’abord à quelqu’un.'));
    chats.forEach(function (c) {
      if (c.group) return;
      var other = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      var name = nickOf(c, other) || (c.names && c.names[other]) || 'Inconnu';
      var b = el('button', 'pick', cap(name));
      b.type = 'button';
      b.addEventListener('click', function () {
        if (!D) return;
        var s0 = st, e0 = en;
        close();
        mShareGo(t, { id: c.id, other: other, name: name }, s0, e0, D);
      });
      sheet.appendChild(b);
    });
    var cn = el('button', 'ghost', 'Annuler');
    cn.type = 'button'; cn.style.marginTop = '10px';
    cn.addEventListener('click', close);
    sheet.appendChild(cn);
    bg.appendChild(sheet);
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.body.appendChild(bg);
  }
  function mBlobToUrl(blob) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result)); };
      fr.onerror = function () { ko(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function mDuration(url) {
    return new Promise(function (ok) {
      var a = new Audio(); a.preload = 'metadata';
      a.onloadedmetadata = function () { ok(isFinite(a.duration) ? a.duration : 0); };
      a.onerror = function () { ok(0); };
      a.src = url;
    });
  }
  function mCapture(t, start, end) {
    return new Promise(function (ok, ko) {
      var AC = window.AudioContext || window.webkitAudioContext, mime = pickMime();
      if (!AC || mime === null) { ko(new Error('unsupported')); return; }
      var ac = new AC(), au = new Audio(), chunks = [], t0 = 0, timer = null, done = false;
      var opts = { audioBitsPerSecond: 32000 };
      if (mime) opts.mimeType = mime;
      var mr;
      try {
        au.preload = 'auto';
        au.src = t.url;
        var src = ac.createMediaElementSource(au), dest = ac.createMediaStreamDestination();
        var quiet = ac.createGain(); quiet.gain.value = 0;
        src.connect(dest);
        src.connect(quiet); quiet.connect(ac.destination);
        mr = new MediaRecorder(dest.stream, opts);
      } catch (e) { try { ac.close(); } catch (x) {} ko(e); return; }
      var finish = function (cancel) {
        if (done) return; done = true;
        var why = cancel instanceof Error ? cancel : new Error('cancel');
        clearInterval(timer);
        try { au.pause(); } catch (e) {}
        M.shareStop = null;
        mr.onstop = function () {
          try { ac.close(); } catch (e) {}
          if (cancel) { ko(why); return; }
          ok({ blob: new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), dur: (Date.now() - t0) / 1000 });
        };
        try { if (mr.state !== 'inactive') mr.stop(); else mr.onstop(); } catch (e) { mr.onstop(); }
      };
      M.shareStop = finish;
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      au.onended = function () { finish(false); };
      au.onerror = function () { finish(new Error('media:' + (au.error ? au.error.code : '?'))); };
      var seek = function () {
        if (!start) return Promise.resolve();
        return new Promise(function (res) {
          var go = function () { au.addEventListener('seeked', function () { res(); }, { once: true }); au.currentTime = start; };
          if (au.readyState >= 1) go(); else au.addEventListener('loadedmetadata', go, { once: true });
        });
      };
      ac.resume().then(seek).then(function () { return au.play(); }).then(function () {
        t0 = Date.now(); mr.start(1000);
        timer = setInterval(function () {
          var s = au.currentTime - start;
          mStatus('Préparation du partage… ' + fmtDur(Math.max(0, s)) + ' / ' + fmtDur(end - start) + ' ');
          if (au.currentTime >= end || s >= SHARE_MAX) finish(false);
        }, 150);
      }).catch(function (e) { finish(new Error('play:' + ((e && e.name) || 'erreur'))); });
    });
  }
  async function mShareSend(chat, audio, dur, title) {
    var label = '🎵 ' + title.slice(0, 100), orig = audio;
    var upa = await mediaUp(audio); if (upa) audio = upa;
    async function put(val) {
      var chatRef = fs.collection('chats').doc(chat.id), msgRef = chatRef.collection('messages').doc(), ts = Date.now();
      var batch = fs.batch();
      batch.set(msgRef, { uid: state.me, sts: SV(), text: label, ts: ts, audio: val, dur: Math.round(dur), music: title.slice(0, 100) });
      var last = { lastText: label, lastTs: ts, lastUid: state.me };
      last['seen.' + state.me] = ts;
      batch.update(chatRef, last);
      await batch.commit();
    }
    try { await put(audio); }
    catch (e) { if (e && e.code === 'permission-denied' && audio !== orig) await put(orig); else throw e; }
  }
  async function mShareGo(t, chat, start, end, total) {
    if (M.sharing) return;
    M.sharing = true; mRender();
    var cancelBtn = el('button', 'ghost', 'Annuler');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', function () { if (M.shareStop) M.shareStop(true); else M.shareAbort = true; });
    M.cancelBtn = cancelBtn;
    var failMsg = '';
    try {
      mStatus('Préparation du partage…');
      var blob = null, dur = 0, raw = null;
      var whole = !start && end >= total;
      if (whole) { try { raw = await (await fetch(t.url)).blob(); } catch (e) {} }
      if (raw && raw.size <= SHARE_BYTES) { blob = raw; dur = await mDuration(t.url); }
      else {
        if (!mAu.paused) mAu.pause();
        var r = await mCapture(t, start || 0, end);
        blob = r.blob; dur = r.dur;
      }
      if (M.shareAbort) throw new Error('cancel');
      if (!blob || !blob.size) throw new Error('empty');
      if (blob.size > SHARE_BYTES) throw new Error('big');
      var data = await mBlobToUrl(blob);
      if (data.length > 900000) throw new Error('big');
      await mShareSend(chat, data, dur || 1, mLabel(t));
      mStatus('Envoyée à ' + cap(chat.name) + ' ✓');
      mMsgT = setTimeout(function () { $('#mMsg').textContent = ''; }, 4500);
    } catch (e) {
      var em = (e && e.message) || '';
      failMsg = em === 'cancel' ? 'Partage annulé.'
        : em === 'unsupported' ? 'Ton navigateur ne permet pas ce partage.'
        : em.indexOf('play:') === 0 ? 'Lecture bloquée par le navigateur (' + em.slice(5) + '). Touche d’abord ▶ sur un morceau puis réessaie.'
        : em.indexOf('media:') === 0 ? 'Ce fichier audio ne peut pas être lu pour le partage (code ' + em.slice(6) + ').'
        : 'Partage impossible. Vérifie ta connexion (ou les règles Firestore) et réessaie.';
    }
    M.sharing = false; M.shareAbort = false; M.shareStop = null; M.cancelBtn = null; mRender();
    if (failMsg) mMsg(failMsg);
  }



/* E'cho — js/app/20-ecoute-ensemble.js
   Écouter ensemble en direct (WebRTC)
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- écouter ensemble en direct (WebRTC, signalisation via Firestore) ---------- */
  /* Serveurs relais (TURN) : nécessaires quand les deux téléphones sont en 4G/5G ou derrière un réseau strict.
     Les identifiants « openrelayproject » sont un service public gratuit (limité). Pour un direct fiable,
     crée un compte gratuit sur metered.ca (Open Relay) puis colle tes propres serveurs dans LIVE_TURN_EXTRA, par ex. :
     { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: 'TON_USER', credential: 'TON_MOT_DE_PASSE' } */
  var LIVE_TURN_EXTRA = [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp', 'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp'],
      username: '945203f5cdfa5f8655fe4730', credential: 'xvoDPMhJQP9TnTML' }
  ];
  var ICE = {
    iceServers: LIVE_TURN_EXTRA.concat([
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'],
        username: 'openrelayproject', credential: 'openrelayproject' }
    ]),
    iceCandidatePoolSize: 2
  };
  var L = { role: null, chat: null, sid: '', jid: '', pc: null, rem: null, g: null, sigUnsub: null, beatT: null, gUnsub: null, gT: null, joinT: null,
            watch: null, watchT: null, sess: null, pend: [], title: '', state: 'wait', needTap: false, gAt: 0, peers: {}, n: 0, hname: '' };
  var LIVE_MAX = 8; /* auditeurs simultanés max par écoute de groupe (le téléphone de l’hôte envoie le son à chacun) */
  function liveRef(id) { return fs.collection('chats').doc(id).collection('live').doc('session'); }
  function liveCol(id) { return fs.collection('chats').doc(id).collection('liveSig'); }
  function liveId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function liveFresh(s) { return !!(s && s.host && Math.abs(Date.now() - (s.beat || 0)) < 120000); }
  function liveSdp(sdp) {
    var m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
    if (!m) return sdp;
    var re = new RegExp('a=fmtp:' + m[1] + ' ([^\\r\\n]*)');
    return sdp.replace(re, function (all, rest) {
      return /stereo=1/.test(rest) ? all : 'a=fmtp:' + m[1] + ' ' + rest + ';stereo=1;sprop-stereo=1;maxaveragebitrate=128000';
    });
  }
  function liveGraph() {
    if (L.g) return L.g;
    var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
    var src = ac.createMediaElementSource(mAu), dest = ac.createMediaStreamDestination();
    src.connect(ac.destination);
    L.g = { ac: ac, src: src, dest: dest };
    return L.g;
  }
  mAu.addEventListener('play', function () {
    if (L.g && L.g.ac.state === 'suspended') L.g.ac.resume().catch(function () {});
    if (L.role === 'host') liveBeat();
  });
  function liveName() { return L.chat ? cap(L.role === 'guest' && L.chat.group && L.hname ? L.hname : L.chat.name) : ''; }
  function liveHostName(chat, sess) {
    if (!chat || !chat.group) return cap(chat && chat.name);
    var gc = chatOf(chat.id), u = sess && sess.host;
    return cap(nickOf(gc, u) || (gc && gc.names && gc.names[u]) || 'Un membre');
  }
  function liveCount() { return Object.keys(L.peers).filter(function (k) { return L.peers[k].ok; }).length; }
  var liveClamp = null;
  function liveBar() {
    var b = $('#livebar');
    if (!L.role) { b.hidden = true; b.replaceChildren(); return; }
    var host = L.role === 'host', txt;
    if (host && L.chat && L.chat.group) {
      var gn = liveCount();
      txt = gn ? '🎧 ' + gn + (gn > 1 ? ' auditeurs' : ' auditeur') + (L.title ? ' · ' + L.title : '') : 'En attente d’auditeurs dans le groupe…';
    }
    else if (L.state === 'live') txt = 'Avec ' + liveName() + (L.title ? ' · ' + L.title : '');
    else if (L.state === 'lost') txt = 'Connexion instable…';
    else if (host && L.state === 'wait') txt = 'En attente de ' + liveName() + '…';
    else txt = 'Connexion…';
    b.replaceChildren();
    var grip = el('span', 'lbgrip', '🎧');
    grip.setAttribute('aria-label', txt + ' (touche pour afficher le titre, glisse pour déplacer)');
    b.appendChild(grip);
    if (L.exp) b.appendChild(el('span', 'lbtxt', txt));
    var mk = function (label, aria, fn) {
      var x = el('button', '', label); x.type = 'button'; x.setAttribute('aria-label', aria); x.addEventListener('click', fn); b.appendChild(x);
    };
    if (host) {
      mk('⏯', 'Lecture / pause', function () { mToggle(); });
      mk('⏭', 'Morceau suivant', function () { mNext(false); });
    } else if (L.needTap) mk('🔊', 'Activer le son', function () { if (L.rem) L.rem.play().then(function () { L.needTap = false; liveBar(); }).catch(function () {}); });
    mk('✕', host ? 'Arrêter' : 'Quitter', function () { liveStop(); });
    b.hidden = false;
    if (liveClamp) liveClamp();
  }
  /* la petite barre se déplace partout sur l'écran : on la tient par 🎧 (ou le titre) et on glisse ; un simple appui affiche/masque le titre */
  (function () {
    var bar = $('#livebar'), drag = null;
    function clamp() {
      if (bar.hidden || (!bar.style.left && !bar.style.top)) return;
      var r = bar.getBoundingClientRect();
      bar.style.left = Math.max(4, Math.min(window.innerWidth - r.width - 4, r.left)) + 'px';
      bar.style.top = Math.max(4, Math.min(window.innerHeight - r.height - 4, r.top)) + 'px';
    }
    liveClamp = clamp;
    window.addEventListener('resize', clamp);
    bar.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button')) return;
      var r = bar.getBoundingClientRect();
      drag = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top, moved: false };
      try { bar.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    bar.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      drag.moved = true;
      var w = bar.offsetWidth, h = bar.offsetHeight;
      bar.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, drag.left + dx)) + 'px';
      bar.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, drag.top + dy)) + 'px';
    });
    bar.addEventListener('pointerup', function () {
      var d = drag; drag = null;
      if (d && !d.moved) { L.exp = !L.exp; liveBar(); }
    });
    bar.addEventListener('pointercancel', function () { drag = null; });
  })();
  function liveBanner() {
    var b = $('#liveBanner'), s = L.sess, chat = state.chat;
    if (!b) return;
    var ok = !!(chat && s && s.host !== state.me && !L.role && liveFresh(s));
    b.hidden = !ok;
    if (!ok) { b.replaceChildren(); return; }
    b.replaceChildren();
    b.appendChild(el('span', '', '🎧 ' + liveHostName(chat, s) + ' écoute « ' + (s.title || 'une musique') + ' »' + (chat.group ? ' avec le groupe' : '')));
    var j = el('button', 'ghost', 'Rejoindre'); j.type = 'button';
    j.addEventListener('click', function () { liveJoin({ id: chat.id, other: chat.other, name: chat.name, group: !!chat.group }, s); });
    b.appendChild(j);
  }
  function liveWatch(chat) {
    liveUnwatch();
    if (!chat) return;
    L.watch = liveRef(chat.id).onSnapshot(function (d) { L.sess = d.exists ? d.data() : null; liveBanner(); }, function () {});
    L.watchT = setInterval(liveBanner, 10000);
  }
  function liveUnwatch() {
    if (L.watch) { try { L.watch(); } catch (e) {} }
    L.watch = null; clearInterval(L.watchT); L.sess = null;
    liveBanner();
  }
  function liveStatus(st) { L.state = st; liveBar(); }
  function liveBeat() {
    if (L.role !== 'host' || !L.chat) return;
    var t = M.tracks[M.cur];
    liveRef(L.chat.id).update({ beat: Date.now(), title: t ? mLabel(t) : '' }).catch(function () {});
  }
  function liveSig(kind, extra) {
    if (!L.chat) return;
    var d = { sid: L.sid, jid: L.jid, from: state.me, kind: kind, ts: Date.now() };
    for (var k in extra) d[k] = extra[k];
    if (L.role === 'host' && !d.jid) d.jid = '';
    liveCol(L.chat.id).add(d).catch(function () {});
  }
  function liveIce(c) {
    if (L.pc && L.pc.remoteDescription) L.pc.addIceCandidate(c).catch(function () {}); else L.pend.push(c);
  }
  function liveFlush() {
    var pc = L.pc;
    L.pend.splice(0).forEach(function (c) { if (pc) pc.addIceCandidate(c).catch(function () {}); });
  }
  function liveNewPc() {
    if (L.pc) { try { L.pc.close(); } catch (e) {} }
    var pc = new RTCPeerConnection(ICE);
    L.pc = pc;
    L.cand = { host: 0, srflx: 0, relay: 0 };
    pc.onicecandidate = function (e) {
      if (!e.candidate || L.pc !== pc) return;
      var m = / typ (host|srflx|relay)/.exec(e.candidate.candidate || '');
      if (m) L.cand[m[1]]++;
      liveSig('ice', { data: JSON.stringify(e.candidate) });
    };
    pc.onconnectionstatechange = function () {
      if (L.pc !== pc) return;
      var s = pc.connectionState;
      if (s === 'connected') { clearTimeout(L.joinT); liveStatus('live'); }
      else if (s === 'disconnected') liveStatus('lost');
      else if (s === 'failed') {
        var why = L.cand && !L.cand.relay ? 'Serveur relais injoignable : ajoute tes identifiants TURN (metered.ca).' : 'La connexion directe a échoué (réseau).';
        if (L.role === 'guest') {
          if ((L.retry || 0) < 1) {
            L.retry = (L.retry || 0) + 1;
            try { pc.close(); } catch (e) {}
            L.pc = null; L.jid = liveId(); L.pend = [];
            liveStatus('connecting');
            clearTimeout(L.joinT);
            L.joinT = setTimeout(function () { if (L.role === 'guest' && L.state !== 'live') liveStop(why); }, 25000);
            liveSig('join');
          } else liveStop(why);
        } else { try { pc.close(); } catch (e) {} L.pc = null; liveStatus('wait'); }
      }
    };
    return pc;
  }
  /* hôte : une connexion WebRTC par auditeur (clé = jid de l’auditeur) */
  function liveDropPeer(jid) {
    var pr = L.peers[jid];
    if (!pr) return;
    delete L.peers[jid];
    try { pr.pc.close(); } catch (e) {}
    if (L.role !== 'host') return;
    if (L.chat && L.chat.group) liveBar();
    else if (!Object.keys(L.peers).length) liveStatus('wait');
  }
  function liveHostPeer(jid, from) {
    var pc = new RTCPeerConnection(ICE), pr = { pc: pc, pend: [], from: from, ok: false, cand: { host: 0, srflx: 0, relay: 0 } };
    L.peers[jid] = pr;
    pc.onicecandidate = function (e) {
      if (!e.candidate || L.peers[jid] !== pr) return;
      var m = / typ (host|srflx|relay)/.exec(e.candidate.candidate || '');
      if (m) pr.cand[m[1]]++;
      liveSig('ice', { data: JSON.stringify(e.candidate), jid: jid });
    };
    pc.onconnectionstatechange = function () {
      if (L.peers[jid] !== pr) return;
      var st = pc.connectionState;
      if (st === 'connected') { pr.ok = true; clearTimeout(pr.t); if (L.chat && L.chat.group) liveBar(); else liveStatus('live'); }
      else if (st === 'disconnected') { pr.ok = false; if (L.chat && L.chat.group) liveBar(); else liveStatus('lost'); }
      else if (st === 'failed' || st === 'closed') liveDropPeer(jid);
    };
    /* un auditeur qui n’aboutit jamais ne doit pas rester dans la liste */
    pr.t = setTimeout(function () { if (L.peers[jid] === pr && !pr.ok) liveDropPeer(jid); }, 45000);
    return pr;
  }
  async function liveSignal(d) {
    try {
      if (L.role === 'host') {
        if (d.kind === 'join') {
          var old = Object.keys(L.peers).filter(function (k) { return L.peers[k].from === d.from; });
          old.forEach(liveDropPeer);
          var isGroup = !!(L.chat && L.chat.group);
          if (isGroup && Object.keys(L.peers).length >= LIVE_MAX) { liveSig('full', { jid: d.jid }); return; }
          var pr = liveHostPeer(d.jid, d.from), pc = pr.pc;
          if (!isGroup) liveStatus('connecting');
          var g = L.g;
          g.dest.stream.getAudioTracks().forEach(function (tr) { pc.addTrack(tr, g.dest.stream); });
          var off = await pc.createOffer();
          off.sdp = liveSdp(off.sdp);
          await pc.setLocalDescription(off);
          liveSig('offer', { data: JSON.stringify({ type: off.type, sdp: off.sdp }), jid: d.jid });
        } else if (d.kind === 'leave') {
          liveDropPeer(d.jid);
        } else if (L.peers[d.jid]) {
          var pe = L.peers[d.jid];
          if (d.kind === 'answer') {
            await pe.pc.setRemoteDescription(JSON.parse(d.data));
            pe.pend.splice(0).forEach(function (c) { pe.pc.addIceCandidate(c).catch(function () {}); });
          } else if (d.kind === 'ice') {
            var cd = JSON.parse(d.data);
            if (pe.pc.remoteDescription) pe.pc.addIceCandidate(cd).catch(function () {}); else pe.pend.push(cd);
          }
        }
      } else if (L.role === 'guest' && d.jid === L.jid) {
        if (d.kind === 'full') { liveStop('Le salon d’écoute est complet (' + LIVE_MAX + ' personnes max).'); return; }
        if (d.kind === 'offer') {
          clearTimeout(L.joinT);
          var pc2 = liveNewPc();
          pc2.ontrack = function (ev) {
            if (!L.rem) { L.rem = new Audio(); L.rem.autoplay = true; }
            L.rem.srcObject = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
            L.rem.play().then(function () { L.needTap = false; liveBar(); }).catch(function () { L.needTap = true; liveBar(); });
          };
          await pc2.setRemoteDescription(JSON.parse(d.data));
          liveFlush();
          var ans = await pc2.createAnswer();
          ans.sdp = liveSdp(ans.sdp);
          await pc2.setLocalDescription(ans);
          liveSig('answer', { data: JSON.stringify({ type: ans.type, sdp: ans.sdp }) });
        } else if (d.kind === 'ice') liveIce(JSON.parse(d.data));
      }
    } catch (e) {}
  }
  function liveListenSig() {
    var seen = {};
    L.sigUnsub = liveCol(L.chat.id).where('sid', '==', L.sid).onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        if (ch.type !== 'added' || seen[ch.doc.id]) return;
        seen[ch.doc.id] = 1;
        var d = ch.doc.data();
        if (d && d.from !== state.me) liveSignal(d);
      });
    }, function () { liveStop('Le direct n’a pas pu démarrer (règles Firestore ?).'); });
  }
  async function liveNotice(chat, text) {
    try {
      var chatRef = fs.collection('chats').doc(chat.id), msgRef = chatRef.collection('messages').doc(), ts = Date.now();
      var exists = !!state.chatsById[chat.id] || !!chat.group;
      if (!exists) exists = (await chatRef.get()).exists;
      var batch = fs.batch();
      batch.set(msgRef, { uid: state.me, sts: SV(), text: text, ts: ts });
      var last = { lastText: text.slice(0, 120), lastTs: ts, lastUid: state.me };
      if (exists) { last['seen.' + state.me] = ts; batch.update(chatRef, last); }
      else {
        var names = {}; names[state.me] = myName(); names[chat.other] = chat.name;
        var seen = {}; seen[state.me] = ts;
        batch.set(chatRef, { members: [state.me, chat.other], names: names, lastText: last.lastText, lastTs: ts, lastUid: state.me, seen: seen });
      }
      await batch.commit();
      state.chatsById[chat.id] = true;
    } catch (e) {}
  }
  async function liveStart(chat, i) {
    var t = M.tracks[i];
    if (!t || L.role) return;
    if (!window.RTCPeerConnection || !(window.AudioContext || window.webkitAudioContext)) { showErr('Ton navigateur ne permet pas l’écoute en direct.'); return; }
    var g;
    try { g = liveGraph(); g.ac.resume().catch(function () {}); g.src.connect(g.dest); }
    catch (e) { showErr('Ton navigateur ne permet pas l’écoute en direct.'); return; }
    if (chat.group && L.sess && L.sess.host !== state.me && liveFresh(L.sess)) { showErr('Une écoute est déjà en cours dans ce groupe : rejoins-la.'); return; }
    L.role = 'host'; L.chat = chat; L.sid = liveId(); L.jid = ''; L.title = mLabel(t); L.pend = []; L.peers = {};
    liveStatus('wait');
    mPlay(i);
    await liveNotice(chat, chat.group ? '🎧 J’écoute « ' + mLabel(t) + ' » : rejoignez-moi avec le bandeau 🎧 (max ' + LIVE_MAX + ' personnes).' : '🎧 Écoutons « ' + mLabel(t) + ' » ensemble : appuie sur 🎧 pour me rejoindre.');
    try {
      await liveRef(chat.id).set({ host: state.me, sid: L.sid, title: mLabel(t), beat: Date.now(), ts: Date.now() });
    } catch (e) {
      liveStop();
      showErr('Direct impossible (connexion ou règles Firestore).');
      return;
    }
    L.beatT = setInterval(liveBeat, 15000);
    liveListenSig();
  }
  function liveJoin(chat, sess) {
    if (L.role) return;
    if (!window.RTCPeerConnection) { showErr('Ton navigateur ne permet pas l’écoute en direct.'); return; }
    L.retry = 0;
    L.role = 'guest'; L.chat = chat; L.hname = chat.group ? liveHostName(chat, sess) : ''; L.sid = sess.sid; L.jid = liveId(); L.title = sess.title || ''; L.pend = []; L.needTap = false;
    L.rem = new Audio(); L.rem.autoplay = true;
    liveStatus('connecting');
    liveListenSig();
    L.gAt = Date.now();
    L.gUnsub = liveRef(chat.id).onSnapshot(function (d) {
      var v = d.exists ? d.data() : null;
      if (!v || v.sid !== L.sid) { liveStop('L’écoute est terminée.'); return; }
      L.gAt = Date.now();
      if ((v.title || '') !== L.title) { L.title = v.title || ''; liveBar(); }
    }, function () {});
    L.gT = setInterval(function () { if (Date.now() - L.gAt > 60000) liveStop('L’écoute est terminée.'); }, 10000);
    L.joinT = setTimeout(function () { if (L.role === 'guest' && L.state !== 'live') liveStop(L.cand && !L.cand.relay ? 'Serveur relais injoignable : ajoute tes identifiants TURN (metered.ca).' : 'Impossible de te connecter (réseau ou la personne est partie).'); }, 25000);
    liveSig('join');
  }
  function liveStop(msg) {
    var chat = L.chat, role = L.role, sid = L.sid;
    if (role === 'guest') liveSig('leave');
    Object.keys(L.peers).forEach(function (k) { try { L.peers[k].pc.close(); } catch (e) {} clearTimeout(L.peers[k].t); });
    L.peers = {}; L.hname = '';
    clearInterval(L.beatT); clearInterval(L.gT); clearTimeout(L.joinT);
    if (L.sigUnsub) { try { L.sigUnsub(); } catch (e) {} }
    if (L.gUnsub) { try { L.gUnsub(); } catch (e) {} }
    if (L.pc) { try { L.pc.close(); } catch (e) {} }
    if (L.rem) { try { L.rem.pause(); L.rem.srcObject = null; } catch (e) {} }
    if (L.g) { try { L.g.src.disconnect(L.g.dest); } catch (e) {} }
    L.role = null; L.chat = null; L.sid = ''; L.jid = ''; L.pc = null; L.rem = null; L.sigUnsub = null; L.gUnsub = null;
    L.beatT = null; L.gT = null; L.joinT = null; L.pend = []; L.title = ''; L.needTap = false; L.state = 'wait';
    if (role === 'host' && chat) {
      liveRef(chat.id).delete().catch(function () {});
      liveCol(chat.id).where('sid', '==', sid).get().then(function (sn) {
        var b = fs.batch(); sn.forEach(function (d) { b.delete(d.ref); }); return b.commit();
      }).catch(function () {});
    }
    liveBar();
    if (msg) {
      var bar = $('#livebar');
      bar.replaceChildren(el('span', 'lbtxt', '🎧 ' + msg));
      bar.hidden = false;
      setTimeout(function () { if (!L.role) bar.hidden = true; }, 4500);
    }
  }
  function liveOpen() {
    var chat = state.chat;
    if (!chat) return;
    mShareClose();
    var bg = el('div', 'sheetbg'), sheet = el('div', 'sheet'), nm = cap(chat.name), s = L.sess, hn = liveHostName(chat, s);
    var stopB = function (label) {
      var b = el('button', 'ghost', label); b.type = 'button'; b.style.marginTop = '10px';
      b.addEventListener('click', function () { mShareClose(); liveStop(); });
      return b;
    };
    if (L.role && L.chat.id !== chat.id) {
      sheet.appendChild(el('h3', '', 'Écoute en cours avec ' + liveName()));
      sheet.appendChild(stopB(L.role === 'host' ? 'Arrêter' : 'Quitter'));
    } else if (L.role === 'guest') {
      sheet.appendChild(el('h3', '', 'Tu écoutes avec ' + (chat.group ? hn : nm)));
      if (L.title) sheet.appendChild(el('p', '', '« ' + L.title + ' »'));
      sheet.appendChild(stopB('Quitter'));
    } else if (!L.role && s && s.host !== state.me && liveFresh(s)) {
      sheet.appendChild(el('h3', '', hn + ' écoute « ' + (s.title || 'une musique') + ' »'));
      var jb = el('button', 'pick', '🎧 Rejoindre'); jb.type = 'button';
      jb.addEventListener('click', function () { mShareClose(); liveJoin({ id: chat.id, other: chat.other, name: chat.name, group: !!chat.group }, s); });
      sheet.appendChild(jb);
    } else {
      sheet.appendChild(el('h3', '', L.role === 'host' ? 'Changer de morceau' : 'Écouter ensemble avec ' + (chat.group ? 'le groupe' : nm)));
      sheet.appendChild(el('p', '', chat.group ? 'Choisis un morceau de ta bibliothèque : les membres du groupe pourront l’écouter en même temps que toi (' + LIVE_MAX + ' max).' : 'Choisis un morceau de ta bibliothèque : ' + nm + ' l’entendra en même temps que toi.'));
      var box = el('div');
      sheet.appendChild(box);
      Promise.resolve(mLoad()).then(function () {
        if (!M.tracks.length) { box.appendChild(el('p', '', 'Ajoute d’abord des musiques dans ♪ Musique.')); return; }
        M.tracks.forEach(function (t, i) {
          var b = el('button', 'pick', mLabel(t)); b.type = 'button';
          b.addEventListener('click', function () {
            mShareClose();
            if (L.role === 'host') mPlay(i); else liveStart({ id: chat.id, other: chat.other, name: chat.name, group: !!chat.group }, i);
          });
          box.appendChild(b);
        });
      });
      if (L.role === 'host') sheet.appendChild(stopB('Arrêter l’écoute'));
    }
    var cn = el('button', 'ghost', 'Fermer');
    cn.type = 'button'; cn.style.marginTop = '10px';
    cn.addEventListener('click', mShareClose);
    sheet.appendChild(cn);
    bg.appendChild(sheet);
    bg.addEventListener('click', function (e) { if (e.target === bg) mShareClose(); });
    document.body.appendChild(bg);
  }
  window.uandiMusic = { load: function () { return Promise.resolve(mLoad()); }, tracks: function () { return M.tracks; }, label: mLabel, add: mAdd,
    pause: function () { if (L.role !== 'host') { try { mAu.pause(); } catch (e) {} } } };
  $('#liveBtn').addEventListener('click', liveOpen);
  window.addEventListener('pagehide', function () { if (L.role === 'host' && L.chat) { try { liveRef(L.chat.id).delete(); } catch (e) {} } });




/* E'cho — js/app/21-appel-vocal.js
   Appel vocal 1-à-1 (WebRTC)
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- appel vocal 1-à-1 (WebRTC, signalisation via Firestore) ---------- */
  var C = { role: null, chat: null, sid: '', pc: null, stream: null, rem: null, pend: [], sigUnsub: null, st: '', t0: 0,
            tickT: null, ringT: null, discT: null, tone: null, toneI: null, muted: false, ui: null, seen: {}, needTap: false,
            dbg: { off: 0, ans: 0, ice: 0, h: 0, s: 0, r: 0, ic: '-' } };
  function callWhy(base) { return base + (C.dbg.r === 0 ? ' · aucun relais TURN joignable (identifiants à renouveler)' : ''); }
  var CALL_PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1z"/></svg>';
  var CALL_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11z"/></svg>';
  var CALL_MUTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11h-2c0 .9-.2 1.7-.55 2.4l1.46 1.46A6.9 6.9 0 0019 11zm-4 .17V5a3 3 0 00-5.9-.75L15 11.17zM4.27 3L3 4.27l6 6V11a3 3 0 004.1 2.8l1.7 1.7A5 5 0 017 11H5a7 7 0 006 6.92V21h2v-3.08c.9-.12 1.75-.43 2.5-.87L19.73 21 21 19.73 4.27 3z"/></svg>';

  var CALL_SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  var CALL_EAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9v6h4l5 5V4l-5 5H7z"/></svg>';
  var EAR_RE = /earpiece|ear piece|receiver|handset|écouteur|ecouteur|combiné|combine/i, SPK_RE = /speaker|haut-parleur|haut parleur|loud/i;
  function callSpk() { return store('uandi-spk') === '1'; }
  function callRouteNote() {}
  /* sortie du son de l'appel : écouteur (discret) ou haut-parleur */
  function callRoute() {
    var a = C.rem, spk = !!C.speaker;
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
    if (!a) return;
    if (!a.setSinkId || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      callRouteNote('Ton navigateur ne permet pas de choisir la sortie audio : le son suit le réglage du téléphone.');
      return;
    }
    navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var outs = ds.filter(function (d) { return d.kind === 'audiooutput'; }), pick = null, i;
      for (i = 0; i < outs.length && !pick; i++) {
        var lb = outs[i].label || '';
        if (spk ? SPK_RE.test(lb) : (EAR_RE.test(lb) && !SPK_RE.test(lb))) pick = outs[i];
      }
      if (!pick && !spk) for (i = 0; i < outs.length && !pick; i++) if (outs[i].deviceId === 'communications') pick = outs[i];
      if (!pick && spk) for (i = 0; i < outs.length && !pick; i++) if (outs[i].deviceId === 'default') pick = outs[i];
      if (!pick) {
        callRouteNote(spk ? '' : 'Écouteur introuvable sur cet appareil : branche un casque ou baisse le volume pour plus de discrétion.');
        return a.setSinkId('').catch(function () {});
      }
      return a.setSinkId(pick.deviceId).then(function () { callRouteNote(''); });
    }).catch(function () { callRouteNote('Impossible de changer la sortie audio sur ce navigateur.'); });
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', function () { if (C.role && C.rem) callRoute(); });

  function callRef(id) { return fs.collection('chats').doc(id); }
  function callDur(sec) {
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function callDurText(sec) {
    var m = Math.floor(sec / 60), r = sec % 60;
    return m ? m + ' min' + (r ? ' ' + r + ' s' : '') : r + ' s';
  }
  /* sonnerie (générée, aucun fichier) */
  function ringStop() {
    clearInterval(C.toneI); C.toneI = null;
    if (C.tone) { try { C.tone.close(); } catch (e) {} C.tone = null; }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }
  function ringStart(incoming) {
    ringStop();
    try {
      var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
      C.tone = ac;
      var beep = function () {
        try {
          if (ac.state === 'suspended') ac.resume().catch(function () {});
          var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
          o.type = 'sine'; o.frequency.value = incoming ? 880 : 425;
          o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(incoming ? 0.3 : 0.15, t + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
          o.start(t); o.stop(t + 0.75);
          if (incoming && navigator.vibrate) navigator.vibrate([350, 150, 350]);
        } catch (e) {}
      };
      beep(); C.toneI = setInterval(beep, 2200);
    } catch (e) {}
  }
  /* notification média « Appel vocal » : aide le navigateur à garder l'appel actif écran éteint */
  function callMedia(on) {
    try {
      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      if (on) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: 'Appel vocal', artist: cap(C.chat.name) });
        navigator.mediaSession.playbackState = 'playing';
        try { navigator.mediaSession.setActionHandler('hangup', function () { callFinish('hang'); }); } catch (e) {}
      } else {
        try { navigator.mediaSession.setActionHandler('hangup', null); } catch (e) {}
        mMeta();
        navigator.mediaSession.playbackState = mAu.paused ? 'paused' : 'playing';
      }
    } catch (e) {}
  }
  function callWake(on) {
    try {
      if (!on) { if (C.wake) { C.wake.release(); C.wake = null; } return; }
      if (navigator.wakeLock && !C.wake) navigator.wakeLock.request('screen').then(function (w) { C.wake = w; w.addEventListener('release', function () { if (C.wake === w) C.wake = null; }); }).catch(function () {});
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && C.role && C.st === 'live') callWake(true); });
  function callUi() {
    var role = C.role;
    if (!role) return;
    if (!C.ui) {
      var ui = el('div', 'callui');
      ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-modal', 'true'); ui.setAttribute('aria-label', 'Appel vocal');
      document.body.appendChild(ui);
      C.ui = ui;
    }
    var ui2 = C.ui, other = C.chat.other, name = cap(C.chat.name);
    ui2.className = 'callui' + (C.st === 'ring' ? ' ringing' : '');
    ui2.replaceChildren();
    var who = el('div', 'cwho'), av = el('span', 'avatar');
    paintPhoto(av, other, C.chat.name); loadPhoto(other);
    who.appendChild(av);
    who.appendChild(el('div', 'cname', name));
    var st = el('div', 'cst'); st.id = 'callSt'; st.setAttribute('aria-live', 'polite');
    who.appendChild(st);
        var dbgE = el('div', 'cdbg'); dbgE.id = 'callDbg'; who.appendChild(dbgE);
    ui2.appendChild(who);
    var row = el('div', 'cbtns');
    var mk = function (cls, svg, label, fn) {
      var w = el('div', 'cbw'), b = el('button', 'cb ' + cls); b.type = 'button'; b.innerHTML = svg; b.setAttribute('aria-label', label);
      b.addEventListener('click', fn); w.appendChild(b); w.appendChild(el('span', '', label)); row.appendChild(w); return b;
    };
    if (role === 'callee' && C.st === 'ring') {
      mk('end', CALL_PHONE, 'Refuser', function () { callFinish('declined'); });
      mk('ok', CALL_PHONE, 'Décrocher', function () { callAccept(); });
    } else {
      var mb = mk('', C.muted ? CALL_MUTE : CALL_MIC, C.muted ? 'Micro coupé' : 'Micro', function () {
        C.muted = !C.muted;
        if (C.stream) C.stream.getAudioTracks().forEach(function (t) { t.enabled = !C.muted; });
        callUi();
      });
      if (C.muted) mb.classList.add('on');
      var sb = mk('', C.speaker ? CALL_SPK : CALL_EAR, C.speaker ? 'Haut-parleur' : 'Écouteur', function () {
        C.speaker = !C.speaker; store('uandi-spk', C.speaker ? '1' : '0');
        callRouteNote(''); callRoute(); callUi();
      });
      if (C.speaker) sb.classList.add('on');
      mk('end', CALL_PHONE, 'Raccrocher', function () { callFinish('hang'); });
    }
    ui2.appendChild(row);
    callStatus();
  }
  function callStatus(txt) {
    var e = document.getElementById('callSt'), g = document.getElementById('callDbg');
    if (g) g.textContent = C.st === 'live' ? '' : 'offre ' + (C.dbg.off ? '✓' : '…') + ' · réponse ' + (C.dbg.ans ? '✓' : '…') + ' · ice reçus ' + C.dbg.ice + ' · ICE ' + C.dbg.ic + ' · candidats h' + C.dbg.h + ' s' + C.dbg.s + ' r' + C.dbg.r + (C.dbg.err ? ' · erreur ' + C.dbg.err : '') + ' · envoyés ' + (C.dbg.sent || 0) + (C.dbg.werr ? ' ✗ ' + C.dbg.werr : '');
    if (!e) return;
    if (txt) { e.textContent = txt; return; }
    if (C.st === 'ring') e.textContent = C.role === 'caller' ? 'Ça sonne…' : 'Appel vocal entrant…';
    else if (C.st === 'conn') e.textContent = 'Connexion…';
    else if (C.st === 'lost') e.textContent = 'Connexion instable…';
    else if (C.st === 'live') e.textContent = (C.needTap ? 'Touche pour activer le son · ' : '') + callDur(Math.max(0, Math.round((Date.now() - C.t0) / 1000)));
  }
  function callPc() {
    if (C.pc) { try { C.pc.close(); } catch (e) {} }
    var pc = new RTCPeerConnection(ICE);
    C.pc = pc;
    pc.onicecandidate = function (e) {
      if (!e.candidate || C.pc !== pc) return;
      var m = / typ (host|srflx|relay)/.exec(e.candidate.candidate || '');
      if (m) C.dbg[m[1] === 'host' ? 'h' : m[1] === 'srflx' ? 's' : 'r']++;
      callStatus();
      callSig('cice', { data: JSON.stringify(e.candidate) });
    };
    pc.onicecandidateerror = function (e) { if (C.pc === pc && e && e.errorCode) { C.dbg.err = e.errorCode + (e.url ? ' ' + String(e.url).replace(/^(turns?|stuns?):/, '$1:').slice(0, 40) : ''); callStatus(); } };
    pc.oniceconnectionstatechange = function () { if (C.pc === pc) { C.dbg.ic = pc.iceConnectionState; callStatus(); } };
    pc.ontrack = function (ev) {
      if (!C.rem) { C.rem = new Audio(); C.rem.autoplay = true; }
      C.rem.srcObject = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
      C.rem.play().then(function () { C.needTap = false; }).catch(function () { C.needTap = true; callStatus(); });
      callRoute();
    };
    pc.onconnectionstatechange = function () {
      if (C.pc !== pc) return;
      var s = pc.connectionState;
      if (s === 'connected') {
        clearTimeout(C.discT); clearTimeout(C.ringT);
        if (C.st !== 'live') {
          C.st = 'live'; C.t0 = Date.now(); ringStop(); callWake(true); callMedia(true);
          if (C.ui) C.ui.classList.remove('ringing');
          clearInterval(C.tickT); C.tickT = setInterval(callStatus, 1000);
        } else C.st = 'live';
        callStatus();
      } else if (s === 'disconnected') {
        if (C.st === 'live') { C.st = 'lost'; callStatus(); }
        clearTimeout(C.discT);
        C.discT = setTimeout(function () { if (C.pc === pc && C.st !== 'live') callFinish('ended', 'Appel coupé : connexion perdue'); }, 60000);
      } else if (s === 'failed') {
        callFinish('ended', callWhy('Connexion échouée'));
      }
    };
    return pc;
  }
  function callSig(kind, extra) {
    if (!C.chat) return Promise.resolve();
    var d = { sid: C.sid, jid: '', from: state.me, kind: kind, ts: Date.now() };
    for (var k in extra) d[k] = extra[k];
    C.dbg.sent = (C.dbg.sent || 0) + 1;
    return liveCol(C.chat.id).add(d).catch(function (e) { C.dbg.werr = kind + ':' + ((e && e.code) || 'erreur'); callStatus(); });
  }
  function callIce(c) {
    if (C.pc && C.pc.remoteDescription) C.pc.addIceCandidate(c).catch(function () {}); else C.pend.push(c);
  }
  function callFlush() {
    var pc = C.pc;
    C.pend.splice(0).forEach(function (c) { if (pc) pc.addIceCandidate(c).catch(function () {}); });
  }
  async function callSignal(d) {
    try {
      if (d.kind === 'cice') { C.dbg.ice++; callStatus(); callIce(JSON.parse(d.data)); return; }
      if (d.kind === 'canswer' && C.role === 'caller' && C.pc) {
        C.dbg.ans = 1; callStatus();
        await C.pc.setRemoteDescription(JSON.parse(d.data)); callFlush();
      } else if (d.kind === 'coffer' && C.role === 'callee' && C.pc) {
        C.dbg.off = 1; callStatus();
        await C.pc.setRemoteDescription(JSON.parse(d.data)); callFlush();
        var ans = await C.pc.createAnswer();
        await C.pc.setLocalDescription(ans);
        C.dbg.ans = 1; callStatus();
        callSig('canswer', { data: JSON.stringify({ type: ans.type, sdp: ans.sdp }) });
      }
    } catch (e) {}
  }
  function callListenSig() {
    var sid = C.sid, seen = {};
    C.sigUnsub = liveCol(C.chat.id).where('sid', '==', sid).onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        if (ch.type !== 'added' || seen[ch.doc.id] || C.sid !== sid) return;
        seen[ch.doc.id] = 1;
        var d = ch.doc.data();
        if (d && d.from !== state.me && /^c/.test(d.kind || '')) callSignal(d);
      });
    }, function () { showErr('Appel impossible (règles Firestore : autorise « liveSig »).'); callFinish('ended'); });
  }
  async function callEnsure(chat) {
    var ref = callRef(chat.id);
    if (state.chatsById[chat.id]) return ref;
    var snap = await ref.get();
    if (snap.exists) return ref;
    var names = {}; names[state.me] = myName(); names[chat.other] = chat.name;
    var seen = {}; seen[state.me] = Date.now();
    await ref.set({ members: [state.me, chat.other], names: names, lastText: '📞 Appel vocal', lastTs: Date.now(), lastUid: state.me, seen: seen });
    return ref;
  }
  async function callStart(chat) {
    if (C.role) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showErr('Ton navigateur ne permet pas les appels vocaux.'); return; }
    var stream;
    try { stream = await getMic({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { showErr('Micro inaccessible : autorise le micro pour passer un appel. ' + MIC_HELP); return; }
    if (C.role) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    C.dbg = { off: 0, ans: 0, ice: 0, h: 0, s: 0, r: 0, ic: '-' };
    C.speaker = callSpk(); C.routeMsg = '';
    C.role = 'caller'; C.chat = chat; C.sid = liveId(); C.stream = stream; C.pend = []; C.st = 'ring'; C.muted = false; C.needTap = false; C.t0 = 0;
    callUi(); ringStart(false);
    var sid = C.sid;
    try {
      var ref = await callEnsure(chat);
      var pc = callPc();
      stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
      callListenSig();
      var off = await pc.createOffer();
      await pc.setLocalDescription(off);
      C.dbg.off = 1;
      await liveCol(chat.id).add({ sid: sid, jid: '', from: state.me, kind: 'coffer', ts: Date.now(), data: JSON.stringify({ type: off.type, sdp: off.sdp }) });
      await ref.update({ call: { sid: sid, from: state.me, to: chat.other, ts: Date.now(), st: 'ring' } });
    } catch (e) {
      if (C.sid === sid) { showErr('Appel impossible (' + ((e && (e.code || e.message)) || 'erreur') + ') : vérifie les règles Firestore de « chats ».'); callClose(); }
      return;
    }
    C.ringT = setTimeout(function () { if (C.sid === sid && C.role === 'caller' && C.st === 'ring') callFinish('missed'); }, 45000);
  }
  async function callAccept() {
    if (C.role !== 'callee' || C.st !== 'ring') return;
    var sid = C.sid, chat = C.chat;
    C.st = 'conn'; ringStop(); callUi();
    var stream;
    try { stream = await getMic({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) {
      if (C.sid === sid && C.role === 'callee') { C.st = 'ring'; ringStart(true); callUi(); callStatus('Micro bloqué : ferme les bulles et fenêtres flottantes, puis appuie sur Répondre'); }
      showErr('Micro inaccessible : impossible de répondre pour l’instant. ' + MIC_HELP + ' Tu peux appuyer de nouveau sur Répondre.');
      return;
    }
    if (C.sid !== sid || C.role !== 'callee') { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    C.stream = stream;
    try {
      await fs.runTransaction(function (tx) {
        var r = callRef(chat.id);
        return tx.get(r).then(function (d) {
          var k = d.exists && d.data().call;
          if (!k || k.sid !== sid || k.st !== 'ring') throw new Error('gone');
          tx.update(r, { 'call.st': 'on', 'call.ts': Date.now() });
        });
      });
    } catch (e) { if (C.sid === sid) callClose('Appel terminé'); return; }
    if (C.sid !== sid) return;
    var pc = callPc();
    stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
    callListenSig();
    C.ringT = setTimeout(function () { if (C.sid === sid && C.st === 'conn') callFinish('ended', callWhy('Connexion impossible')); }, 25000);
  }
  /* l'autre personne a changé l'état de l'appel */
  function callSync(k) {
    if (!C.role || k.sid !== C.sid) return;
    if (k.st === 'on' && C.role === 'caller' && C.st === 'ring') {
      C.st = 'conn'; clearTimeout(C.ringT); ringStop(); if (C.ui) C.ui.classList.remove('ringing'); callStatus();
      var sid = C.sid;
      C.ringT = setTimeout(function () { if (C.sid === sid && C.st === 'conn') callFinish('ended', callWhy('Connexion impossible')); }, 25000);
    } else if (k.st === 'declined' && C.role === 'caller') {
      var ch = C.chat; callClose('Appel refusé'); liveNotice(ch, '📞 Appel refusé');
    } else if (k.st === 'ended' || k.st === 'cancelled' || k.st === 'missed' || k.st === 'declined') {
      callClose(C.st === 'ring' ? 'Appel manqué' : 'Appel terminé');
    }
  }
  function callWatch(list) {
    if (!state.me) return;
    list.forEach(function (c) {
      var k = c.call;
      if (!k || !k.sid) return;
      if (C.role && C.sid === k.sid) { callSync(k); return; }
      if (k.st === 'ring' && k.from !== state.me && !C.seen[k.sid] && Math.abs(Date.now() - (k.ts || 0)) < 60000) {
        C.seen[k.sid] = 1;
        if (C.role) { callRef(c.id).update({ 'call.st': 'declined' }).catch(function () {}); return; }
        callIncoming(c, k);
      }
    });
  }
  function callIncoming(c, k) {
    C.dbg = { off: 0, ans: 0, ice: 0, h: 0, s: 0, r: 0, ic: '-' };
    C.speaker = callSpk(); C.routeMsg = '';
    C.role = 'callee'; C.sid = k.sid; C.st = 'ring'; C.muted = false; C.needTap = false; C.t0 = 0; C.pend = [];
    C.chat = { id: c.id, other: k.from, name: nickOf(c, k.from) || (c.names && c.names[k.from]) || 'Appel' };
    callUi(); ringStart(true);
    var sid = k.sid;
    C.ringT = setTimeout(function () { if (C.sid === sid && C.role === 'callee' && C.st === 'ring') callClose('Appel manqué'); }, 50000);
  }
  /* nous terminons l'appel : st = 'hang' | 'declined' | 'missed' | 'ended' */
  function callFinish(st, why) {
    if (!C.role) return;
    var chat = C.chat, sid = C.sid, role = C.role, was = C.st;
    var dur = C.t0 ? Math.round((Date.now() - C.t0) / 1000) : 0;
    if (st === 'hang') st = (was === 'live' || was === 'lost') ? 'ended' : (role === 'caller' ? 'cancelled' : 'declined');
    callRef(chat.id).update({ call: { sid: sid, from: role === 'caller' ? state.me : chat.other, to: role === 'caller' ? chat.other : state.me, ts: Date.now(), st: st, dur: dur, by: state.me } }).catch(function () {});
    if (st === 'ended' && dur > 0) liveNotice(chat, '📞 Appel vocal · ' + callDurText(dur));
    else if (role === 'caller' && (st === 'cancelled' || st === 'missed')) liveNotice(chat, '📞 Appel manqué');
    callClose(why || (st === 'ended' ? 'Appel terminé' : ''), why ? 10000 : 1600);
  }
  function callClose(msg, ms) {
    var chat = C.chat, sid = C.sid, role = C.role, ui = C.ui;
    clearTimeout(C.ringT); clearTimeout(C.discT); clearInterval(C.tickT);
    ringStop(); callWake(false); if (role) callMedia(false);
    if (C.sigUnsub) { try { C.sigUnsub(); } catch (e) {} }
    if (C.pc) { try { C.pc.close(); } catch (e) {} }
    if (C.stream) C.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    if (C.rem) { try { C.rem.pause(); C.rem.srcObject = null; } catch (e) {} }
    C.role = null; C.chat = null; C.sid = ''; C.pc = null; C.stream = null; C.rem = null; C.sigUnsub = null; C.pend = [];
    C.st = ''; C.t0 = 0; C.ui = null; C.needTap = false;
    if (role === 'caller' && chat) {
      liveCol(chat.id).where('sid', '==', sid).get().then(function (sn) {
        var b = fs.batch(); sn.forEach(function (d) { b.delete(d.ref); }); return b.commit();
      }).catch(function () {});
    }
    if (ui) {
      if (msg) {
        var e = ui.querySelector('#callSt'); if (e) e.textContent = msg;
        ui.className = 'callui'; var bt = ui.querySelector('.cbtns'); if (bt) bt.remove();
        setTimeout(function () { ui.remove(); }, ms || 1600);
      } else ui.remove();
    }
  }
  $('#callBtn').addEventListener('click', function () {
    var c = state.chat;
    if (c && !c.group) callStart({ id: c.id, other: c.other, name: c.name });
  });
  document.addEventListener('click', function (e) {
    if (C.needTap && C.rem && e.target.closest && e.target.closest('.callui')) C.rem.play().then(function () { C.needTap = false; callStatus(); }).catch(function () {});
  });
  window.addEventListener('pagehide', function () {
    if (C.role && C.chat) { try { callRef(C.chat.id).update({ 'call.st': C.role === 'caller' && C.st === 'ring' ? 'cancelled' : 'ended' }); } catch (e) {} }
  });




/* E'cho — js/app/22-action-verite.js
   Action ou vérité multijoueur
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- Action ou vérité multijoueur ---------- */
  (function () {
    var $td = function (id) { return document.getElementById(id); };
    var td = { unsub: null, roomUnsub: null, rooms: [], roomId: null, room: null, chosenType: '', spinning: false };
    var defaults = {
      action: ['Fais une imitation amusante pendant 10 secondes.', 'Raconte une blague ou invente-en une.', 'Chante quelques secondes d’une chanson que tu connais.', 'Fais un compliment sincère à un joueur.', 'Décris ton humeur avec trois emojis.', 'Fais une pose drôle pendant cinq secondes.'],
      truth: ['Quel est un petit objectif que tu veux atteindre ?', 'Quelle chanson écoutes-tu en boucle en ce moment ?', 'Quel est un souvenir qui te fait sourire ?', 'Quelle qualité apprécies-tu chez un ami ?', 'Quel talent aimerais-tu apprendre ?', 'Quelle est une chose amusante que peu de gens savent sur toi ?']
    };
    function tdSafeName(p) { return (p && p.name) ? String(p.name).slice(0, 32) : 'Joueur'; }
    function tdMyName() {
      var mode = $td('tdNameMode').value;
      if (mode === 'anon') return '🎭 Anonyme';
      if (mode === 'pseudo') return ($td('tdPseudo').value.trim() || 'Joueur mystère').slice(0, 24);
      return (typeof myName === 'function' ? myName() : state.username) || 'Joueur';
    }
    function tdMsg(s) { $td('tdStatus').textContent = s || ''; }
    /* certifié, assistant ou créateur : peut rejoindre / créer une partie réservée aux certifiés */
    function tdCanCert() {
      try { return !!state.me && ((typeof badges !== 'undefined' && !!badges[state.me]) || (typeof isCertMe === 'function' && isCertMe())); } catch (e) { return false; }
    }
    function tdLocked(r) { return !!(r && r.certOnly && !tdCanCert() && !(r.players || []).some(function (p) { return p.uid === state.me; })); }
    function tdCertUi() { var w = $td('tdCertWrap'); if (w) w.hidden = !tdCanCert(); }
    function tdShowPanel(show) { $td('tdPanel').hidden = !show; $td('tdEntry').hidden = show; var b=document.querySelector('#nwPaneFeed .nwbox'), f=$td('nwFeed'), a=$td('nwAud'); if(b)b.hidden=show; if(f)f.hidden=show; if(a)a.hidden=show; if(show)tdCertUi(); }
    function tdInRoom(on) {
      var c=document.querySelector('#tdPanel .td-create'), l=$td('tdRooms');
      if (c) c.hidden=!!on; if (l) l.hidden=!!on;
      if (on) { var rm=$td('tdRoom'); if (rm && rm.scrollIntoView) setTimeout(function(){ rm.scrollIntoView({behavior:'smooth',block:'start'}); },50); }
    }
    function tdListenRooms() {
      if (td.unsub) td.unsub();
      if (!state.me || !fs) return;
      td.unsub = fs.collection('truthDareRooms').orderBy('createdAt', 'desc').limit(15).onSnapshot(function (snap) {
        td.rooms = []; snap.forEach(function (d) { var x=d.data(); if (x && (x.status === 'waiting' || x.status === 'playing') && (x.players || []).length > 0 && Date.now() - (x.createdAt || 0) < 86400000) td.rooms.push(Object.assign({id:d.id},x)); });
        tdRenderRooms(); tdRenderPosts();
        if (td.roomId && !td.roomUnsub) { var found=td.rooms.filter(function(r){return r.id===td.roomId;})[0]; if(found) tdRenderRoom(found); }
      }, function (e) { tdMsg('Impossible de charger les parties. Vérifie les règles Firestore de truthDareRooms.'); });
    }
    function tdAgo(ts) {
      var m = Math.max(0, Math.floor((Date.now() - (ts || 0)) / 60000));
      return m < 1 ? 'à l’instant' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h';
    }
    function tdRenderPosts() {
      var feed = $td('nwFeed'); if (!feed) return;
      var box = $td('tdPosts');
      if (!box) { box = document.createElement('div'); box.id = 'tdPosts'; box.className = 'td-posts'; }
      if (feed.firstChild !== box) feed.insertBefore(box, feed.firstChild);
      var keep = feed.scrollTop;
      box.textContent = '';
      td.rooms.forEach(function (r) {
        var ps = r.players || [], host = ps[0], mine = ps.some(function (p) { return p.uid === state.me; });
        var card = document.createElement('article'); card.className = 'td-post';
        var head = document.createElement('div'); head.className = 'td-post-head';
        var av = document.createElement('span'); av.className = 'td-post-av'; av.textContent = '🎲';
        var who = document.createElement('div'); who.className = 'td-post-who';
        var b = document.createElement('b'); b.textContent = tdSafeName(host) + ' lance une partie';
        var sm = document.createElement('small'); sm.textContent = 'Action ou vérité · ' + (r.certOnly ? '🔒 certifiés · ' : '') + tdAgo(r.createdAt);
        who.appendChild(b); who.appendChild(sm);
        var pill = document.createElement('span'); pill.className = 'td-pill' + (r.status === 'playing' ? ' on' : ''); pill.textContent = r.status === 'playing' ? 'En cours' : 'Ouverte';
        head.appendChild(av); head.appendChild(who); head.appendChild(pill);
        var info = document.createElement('p'); info.className = 'td-post-info';
        info.textContent = ps.length + ' joueur' + (ps.length > 1 ? 's' : '') + ' · ' + (r.startAt && r.startAt > Date.now() ? 'début prévu le ' + new Date(r.startAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'prête à jouer');
        var chips = document.createElement('div'); chips.className = 'td-post-players';
        ps.slice(0, 5).forEach(function (p) { var c = document.createElement('span'); c.className = 'td-player'; var i = document.createElement('i'); i.textContent = (tdSafeName(p).trim().charAt(0) || '?').toUpperCase(); var n = document.createElement('span'); n.textContent = tdSafeName(p); c.appendChild(i); c.appendChild(n); chips.appendChild(c); });
        if (ps.length > 5) { var more = document.createElement('span'); more.className = 'td-player'; more.textContent = '+' + (ps.length - 5); chips.appendChild(more); }
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'nwpost td-post-btn'; btn.textContent = mine ? 'Retourner dans la partie' : 'Rejoindre la partie';
        if (tdLocked(r)) { btn.disabled = true; btn.textContent = '🔒 Réservée aux certifiés'; }
        btn.addEventListener('click', function () { if (tdLocked(r)) { tdMsg('Cette partie est réservée aux certifiés.'); return; } tdShowPanel(true); tdJoin(r.id); });
        card.appendChild(head); card.appendChild(info); card.appendChild(chips); card.appendChild(btn);
        box.appendChild(card);
      });
      box.hidden = !td.rooms.length;
      feed.scrollTop = keep;
    }
    window.__tdPosts = function () { try { tdRenderPosts(); } catch (e) {} };
    window.__tdStart = function () { if (!td.unsub) tdListenRooms(); };
    window.__tdStop = function () { if (td.unsub) { td.unsub(); td.unsub = null; } td.rooms = []; var b = $td('tdPosts'); if (b) b.remove(); };
    function tdRenderRooms() {
      var box=$td('tdRooms'); box.textContent='';
      if (!td.rooms.length) { var p=document.createElement('p'); p.className='td-muted'; p.textContent='Aucune partie ouverte pour le moment. Crée la première !'; box.appendChild(p); return; }
      td.rooms.forEach(function(r){
        var card=document.createElement('div'); card.className='td-room-item';
        var title=document.createElement('b'); title.textContent='🎲 '+(r.title || 'Action ou vérité')+(r.certOnly?' 🔒':''); card.appendChild(title);
        var meta=document.createElement('span'); meta.className='td-room-meta'; meta.textContent=(r.players||[]).length+' joueur(s) · '+(r.startAt && r.startAt>Date.now()?'Début prévu : '+new Date(r.startAt).toLocaleString():'Prête à jouer'); card.appendChild(meta);
        var btn=document.createElement('button'); btn.type='button'; btn.className='nwpost'; btn.textContent='Rejoindre'; if(tdLocked(r)){btn.disabled=true;btn.textContent='🔒 Réservée aux certifiés';} btn.addEventListener('click',function(){tdJoin(r.id);}); card.appendChild(btn); box.appendChild(card);
      });
    }
    function tdCreate() {
      if (!state.me) { tdMsg('Connecte-toi pour créer une partie.'); return; }
      var startRaw=$td('tdStart').value, startAt=startRaw ? new Date(startRaw).getTime() : Date.now();
      if (!Number.isFinite(startAt) || startAt < Date.now()-60000) { tdMsg('Choisis une heure future, ou laisse le champ vide pour commencer maintenant.'); return; }
      tdMsg('Création de la partie…');
      var player={uid:state.me,name:tdMyName(),joinedAt:Date.now()};
      fs.collection('truthDareRooms').add({title:'Action ou vérité',creator:state.me,createdAt:Date.now(),startAt:startAt,status:'waiting',players:[player],turn:null,history:[],certOnly:!!($td('tdCertOnly')&&$td('tdCertOnly').checked&&tdCanCert())})
      .then(function(ref){tdMsg('Partie créée ! Les autres peuvent la rejoindre.');return tdJoin(ref.id);})
      .catch(function(e){tdMsg('Création impossible : '+(e.message||'vérifie les règles Firestore.'));});
    }
    function tdJoin(id) {
      if (!state.me) { tdMsg('Connecte-toi pour rejoindre une partie.'); return; }
      var ref=fs.collection('truthDareRooms').doc(id);
      ref.get().then(function(doc){
        if(!doc.exists) throw new Error('Cette partie n’existe plus.');
        var r=doc.data(); if(r.status==='finished') throw new Error('Cette partie est terminée.');
        if((r.kicked||[]).indexOf(state.me)>=0) throw new Error('L’hôte t’a retiré de cette partie.');
        if(tdLocked(r)) throw new Error('Cette partie est réservée aux certifiés.');
        if(!fs.runTransaction) throw new Error('Rejoindre indisponible sur cet appareil.');
        /* transaction : deux joueurs qui rejoignent en même temps ne s’écrasent plus */
        return fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
          if(!d.exists) throw new Error('Cette partie n’existe plus.');
          var room=d.data();
          if(room.status==='finished') throw new Error('Cette partie est terminée.');
          if((room.kicked||[]).indexOf(state.me)>=0) throw new Error('L’hôte t’a retiré de cette partie.');
          var players=(room.players||[]).slice();
          if(players.some(function(p){return p.uid===state.me;})) return;
          if(room.certOnly && !tdCanCert()) throw new Error('Cette partie est réservée aux certifiés.');
          players.push({uid:state.me,name:tdMyName(),joinedAt:Date.now()});
          tx.update(ref,{players:players});
        });}).then(function(){
          if(td.roomUnsub) td.roomUnsub(); tdGvStop(); td.spinSeen=null; td.firstSnap=true; td.spinning=false; td.roomId=id; tdShowPanel(true); $td('tdRoom').hidden=false; tdInRoom(true); tdMsg('Tu as rejoint la partie.');
          td.roomUnsub=ref.onSnapshot(function(d){if(!d.exists){tdMsg('Cette partie a été supprimée.');$td('tdRoom').hidden=true;tdInRoom(false);return;}td.room=Object.assign({id:d.id},d.data());tdRenderRoom(td.room);td.firstSnap=false;},function(){tdMsg('Connexion à la partie interrompue.');});
        });
      }).catch(function(e){tdMsg(e.message||'Impossible de rejoindre cette partie.');});
    }
    function tdExit(msg) {
      tdVoiceStopAll(); tdGvStop();
      if(td.roomUnsub)td.roomUnsub();td.roomUnsub=null;td.roomId=null;td.room=null;
      $td('tdRoom').hidden=true;tdInRoom(false);tdMsg(msg||'');
    }
    function tdStop() {
      var r=td.room;if(!r||!td.roomId||r.creator!==state.me)return;
      if(!window.confirm('Arrêter la partie pour tous les joueurs ?'))return;
      fs.collection('truthDareRooms').doc(td.roomId).update({status:'finished',turn:null,finishedAt:Date.now()})
      .then(function(){tdExit('Partie arrêtée.');}).catch(function(){tdMsg('Impossible d’arrêter la partie.');});
    }
    function tdRenderRoom(r) {
      if(!r)return;
      if(r.status==='finished'){ if(td.roomId===r.id) tdExit('La partie a été arrêtée.'); return; }
      if(td.roomId===r.id && (r.kicked||[]).indexOf(state.me)>=0){ tdExit('L’hôte t’a retiré de la partie.'); return; }
      td.room=r;
      var stopBtn=$td('tdStop'); if(stopBtn) stopBtn.hidden=r.creator!==state.me;
      $td('tdRoomTitle').textContent='Action ou vérité';
      $td('tdRoomState').textContent=r.status==='playing'?'● En cours':'● En attente';$td('tdRoomState').className='td-pill'+(r.status==='playing'?' on':'');
      $td('tdRoomInfo').textContent=(r.startAt>Date.now()?'Début prévu le '+new Date(r.startAt).toLocaleString():'La partie peut commencer')+' · '+(r.players||[]).length+' joueur(s)';
      var ps=r.players||[], n=ps.length, turn=r.turn, isCreator=r.creator===state.me;
      tdSyncBottle(r);
      var reveal=!!turn && turn.phase!=='spin' && !td.spinning;
      var wheel=$td('tdPlayers'); wheel.textContent='';
      ps.forEach(function(p,k){
        var ang=k*2*Math.PI/n, seat=document.createElement('div');
        var live=reveal && turn.phase!=='done';
        seat.className='td-seat'+(p.uid===state.me?' itsme':'')+(live&&turn.targetUid===p.uid?' target':'')+(live&&turn.pickerUid===p.uid?' picker':'');
        seat.style.left=(50+39*Math.sin(ang)).toFixed(2)+'%'; seat.style.top=(50-39*Math.cos(ang)).toFixed(2)+'%';
        var av=document.createElement('i'); av.textContent=(tdSafeName(p).trim().charAt(0)||'?').toUpperCase();
        var nm=document.createElement('span'); nm.textContent=tdSafeName(p);if(p.uid===state.me)seat.title='Toi';
        seat.appendChild(av); seat.appendChild(nm); wheel.appendChild(seat);
      });
      var started=!r.startAt || Date.now()>=r.startAt;
      var tgt=turn?ps.filter(function(p){return p.uid===turn.targetUid;})[0]:null, pck=turn?ps.filter(function(p){return p.uid===turn.pickerUid;})[0]:null;
      var orphan=!!turn && turn.phase!=='done' && turn.phase!=='spin' && (!tgt||!pck);
      var idle=!turn || turn.phase==='done' || orphan;
      var canSpin=isCreator && n>=2 && started && !td.spinning && !td.busy && idle;
      $td('tdSpin').disabled=!canSpin;
      $td('tdSpin').textContent=n<2?'En attente d’un autre joueur…':!started?'Début programmé':!isCreator?'Seul le créateur lance la bouteille':(!idle||td.spinning)?'Tour en cours…':'🌀 Faire tourner la bouteille';
      ['tdChooseControls','tdPickerControls','tdTargetControls','tdPromptBox','tdAnswerText','tdVoteBox','tdVoteBtns'].forEach(function(id){$td(id).hidden=true;});
      $td('tdTurn').hidden=!reveal;
      if(reveal){
        var tn=tdSafeName(tgt), pn=tdSafeName(pck), me=state.me, isT=turn.targetUid===me, isP=turn.pickerUid===me;
        var kind=turn.type==='action'?'une action':'une question';
        var key=turn.phase+':'+turn.at+':'+(turn.attempt||0), fresh=td.lastPhase!==key;
        var voters=ps.filter(function(p){return p.uid!==turn.targetUid;}), votes=turn.votes||{}, vOk=0, vNo=0;
        voters.forEach(function(p){if(votes[p.uid]==='ok')vOk++;else if(votes[p.uid]==='no')vNo++;});
        var ansEl=$td('tdAnswerText'); ansEl.classList.remove('bad');
        if(orphan){
          $td('tdTurnText').textContent='Un joueur a quitté le tour. Le créateur peut relancer la bouteille.';
        } else if(turn.phase==='choose'){
          $td('tdTurnText').textContent=isT?'La bouteille t’a désigné(e) ! Action ou vérité ?':tn+' a été désigné(e) par la bouteille et choisit : action ou vérité ?';
          $td('tdChooseControls').hidden=!isT;
          if(isT&&fresh)tdMsg('C’est à toi de choisir : Action ou Vérité ?');
        } else if(turn.phase==='ask'){
          $td('tdTurnText').textContent=tn+' a choisi '+(turn.type==='action'?'🔥 ACTION':'💬 VÉRITÉ')+'. '+(isP?'À toi de lui proposer ':pn+' doit lui proposer ')+kind+'.';
          $td('tdPickerControls').hidden=!isP;
          $td('tdPromptLabel').textContent=turn.type==='action'?'Quelle action doit-'+'il/elle faire ?':'Quelle question lui poses-tu ?';
          if(isP&&fresh)tdMsg('Écris '+kind+' pour '+tn+'.');
        } else if(turn.phase==='answer'){
          $td('tdTurnText').textContent=isT?'À toi de répondre !':tn+' doit répondre.';
          $td('tdPromptBox').hidden=false; $td('tdPromptText').textContent=(turn.type==='action'?'🔥 ACTION : ':'💬 VÉRITÉ : ')+turn.prompt;
          $td('tdTargetControls').hidden=!isT;
          if(turn.rejected){ansEl.hidden=false;ansEl.classList.add('bad');ansEl.textContent='❌ Le groupe n’est pas satisfait de : « '+turn.rejected+' »'+(isT?'\nRecommence ta réponse.':'\n'+tn+' doit refaire sa réponse.');}
          if(isT&&fresh)tdMsg(turn.rejected?'Réponse refusée par le groupe : refais-la.':'Écris ta réponse. Les autres devront l’approuver.');
        } else if(turn.phase==='vote'){
          $td('tdTurnText').textContent=isT?'Ta réponse est envoyée : les autres votent…':tn+' a répondu. Approuves-tu sa réponse ?';
          $td('tdPromptBox').hidden=false; $td('tdPromptText').textContent=(turn.type==='action'?'🔥 ACTION : ':'💬 VÉRITÉ : ')+turn.prompt;
          ansEl.hidden=false; ansEl.textContent='✍️ '+tn+' : '+turn.answer;
          $td('tdVoteBox').hidden=false;
          var mine=votes[me], canVote=!isT&&!mine&&voters.some(function(p){return p.uid===me;});
          $td('tdVoteBtns').hidden=!canVote;
          $td('tdVoteInfo').textContent='✅ '+vOk+' · ❌ '+vNo+' · en attente : '+(voters.length-vOk-vNo)+(mine?' — ton vote : '+(mine==='ok'?'✅':'❌'):'');
          if(canVote&&fresh)tdMsg('Vote : approuves-tu la réponse de '+tn+' ?');
          tdVoteTick();
          if(isCreator&&!td.voting&&(voters.length===0||vOk*2>voters.length||vNo*2>=voters.length))tdVote(null);
        } else if(turn.phase==='done'){
          $td('tdTurnText').textContent='✅ Réponse approuvée par le groupe ! Vous pouvez tourner à nouveau.';
          $td('tdPromptBox').hidden=false; $td('tdPromptText').textContent=(turn.type==='action'?'🔥 ACTION : ':'💬 VÉRITÉ : ')+(turn.prompt||'');
          if(turn.answer){ansEl.hidden=false;ansEl.textContent='✍️ '+tn+' : '+turn.answer+'\n(✅ '+vOk+' · ❌ '+vNo+')';}
        }
        td.lastPhase=key;
      }
      tdChatRender(r,reveal);
      tdHostRender(r);
      tdGvSync(r);
      tdVoiceSync(r,reveal);
    }
    /* ---------- vocal du salon : seul celui qui doit parler a le micro, tout le monde écoute ----------
       Signalisation WebRTC dans le document de la partie (champs voice / vc) : aucune nouvelle règle Firestore. */
    function tdIce(){ return (typeof ICE!=='undefined'&&ICE)||{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}; }
    function tdRef(){ return fs.collection('truthDareRooms').doc(td.roomId); }
    function tdGather(pc){
      return new Promise(function(ok){
        if(pc.iceGatheringState==='complete')return ok();
        var done=false;
        function fin(){ if(done)return; done=true; pc.removeEventListener('icegatheringstatechange',chk); ok(); }
        function chk(){ if(pc.iceGatheringState==='complete')fin(); }
        pc.addEventListener('icegatheringstatechange',chk); setTimeout(fin,3000);
      });
    }
    function tdVoiceStopAll(){ tdGvStop(); }
    /* rappel pour le joueur dont c'est le tour de parler (le vocal du salon, lui, écoute en continu) */
    function tdVoiceSync(r,reveal){
      var t=r.turn, me=state.me, spk=null;
      if(reveal&&t&&!td.spinning){ if(t.phase==='ask')spk=t.pickerUid; else if(t.phase==='answer')spk=t.targetUid; }
      var box=$td('tdVoice'), mic=$td('tdMicBtn'), info=$td('tdVoiceInfo'), G=td.gv;
      if(!spk||!G){ box.hidden=true; return; }
      var sp=(r.players||[]).filter(function(p){return p.uid===spk;})[0], nm=tdSafeName(sp);
      box.hidden=false;
      if(spk===me){
        mic.hidden=false; mic.textContent=G.talk?'⏹ Couper le micro':'🎙️ Parler'; mic.classList.toggle('on',!!G.talk);
        info.textContent=G.talk?'🎙️ Micro actif : le salon t’entend.':(t.phase==='ask'?'🎙️ À toi : appuie sur « Parler » pour dire ta proposition (puis écris-la pour l’envoyer).':'🎙️ À toi : appuie sur « Parler » pour répondre (puis écris ta réponse pour la faire voter).');
      } else {
        mic.hidden=true;
        var live=tdGvPeers(r).some(function(x){return x.u===spk&&x.k;});
        info.textContent=live?'🔊 '+nm+' parle… (tu l’entends automatiquement)':'🔇 '+nm+' n’a pas encore activé son micro. Tu l’entendras dès qu’elle ou il parlera.';
      }
    }
    /* ---------- vocal du salon : tout le monde écoute en continu, on appuie sur « Parler » pour parler ----------
       Maillage WebRTC (8 max). Signalisation dans le document de la partie (champs gvp = présence, gv = offres/réponses) : aucune nouvelle règle Firestore.
       Chaque liaison est ouverte dès l'arrivée dans le salon (écoute seule) ; le micro n'est branché (replaceTrack) que pour ceux qui ont le droit de t'entendre. */
    var GV_MAX=8, GV_HB=20000, GV_STALE=150000;
    function tdGvLsKey(){ return 'tdGvPrefs_'+(state.me||''); }
    function tdGvSave(){ var G=td.gv; if(!G)return; try{ localStorage.setItem(tdGvLsKey(),JSON.stringify({allow:G.allow,allowAll:G.allowAll,hush:G.hush,deaf:G.deaf})); }catch(e){} }
    function tdGvLoad(G){ try{ var p=JSON.parse(localStorage.getItem(tdGvLsKey())||'null'); if(p){ G.allow=p.allow||{}; G.allowAll=p.allowAll!==false; G.hush=p.hush||{}; G.deaf=!!p.deaf; } }catch(e){} }
    document.addEventListener('pointerdown',function(){ var b=document.getElementById('tdGvAudios'); if(!td.gvNeedTap||!b)return; td.gvNeedTap=false; var as=b.querySelectorAll('audio'); for(var i=0;i<as.length;i++){ try{ var pr=as[i].play(); if(pr&&pr.catch)pr.catch(function(){ td.gvNeedTap=true; }); }catch(e){} } if(td.gv)tdGvUi(true); },true);
    function tdK(u){ return String(u).replace(/[^A-Za-z0-9_-]/g,'_'); }
    function tdGvKey(off,ans){ return tdK(off)+'__'+tdK(ans); }
    function tdGvPeers(r){
      var P=(r&&r.gvp)||{}, now=Date.now(), ps=(r&&r.players)||[], out=[];
      Object.keys(P).forEach(function(k){ var x=P[k]; if(!x||!x.u||!x.s||!x.t||now-x.t>GV_STALE)return; if(!ps.some(function(p){return p.uid===x.u;}))return; out.push(x); });
      out.sort(function(a,b){ return (Number(a.s)-Number(b.s))||(a.u<b.u?-1:1); });
      return out;
    }
    function tdGvAllowed(u){ var G=td.gv; if(!G)return false; return G.allow[u]!==undefined?G.allow[u]:G.allowAll; }
    function tdGvPresence(){
      var G=td.gv; if(!G||!td.roomId)return Promise.resolve();
      var o={}; o['gvp.'+tdK(state.me)]={u:state.me,s:G.sid,t:Date.now(),k:G.talk?1:0};
      return tdRef().update(o);
    }
    function tdGvApplyAudio(){
      var G=td.gv, box=$td('tdGvAudios'); if(!G||!box)return;
      var as=box.querySelectorAll('audio');
      for(var i=0;i<as.length;i++){ var u=as[i].getAttribute('data-u'); as[i].muted=!!(G.deaf||G.hush[u]); }
    }
    function tdGvAudioFor(uid,stream){
      var box=$td('tdGvAudios'), id='tdGvA_'+tdK(uid), a=document.getElementById(id);
      if(!a){ a=document.createElement('audio'); a.id=id; a.setAttribute('data-u',uid); a.autoplay=true; a.setAttribute('playsinline',''); box.appendChild(a); }
      a.srcObject=stream; tdGvApplyAudio();
      var pr=a.play(); if(pr&&pr.catch)pr.catch(function(){ td.gvNeedTap=true; tdGvUi(); });
    }
    function tdGvWatch(uid,stream){
      var G=td.gv; if(!G)return;
      try{
        var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return; if(!G.ac)G.ac=new AC();
        var src=G.ac.createMediaStreamSource(stream), an=G.ac.createAnalyser(); an.fftSize=256; src.connect(an);
        G.an[uid]={an:an,buf:new Uint8Array(an.fftSize)};
      }catch(e){}
    }
    /* branche / débranche le micro sur chaque liaison selon « qui m'entend » */
    function tdGvApplyTracks(){
      var G=td.gv; if(!G)return;
      Object.keys(G.pcs).forEach(function(u){
        var rec=G.pcs[u]; if(!rec.sender)return;
        var want=(G.talk&&G.track&&tdGvAllowed(u))?G.track:null;
        if(rec.cur!==want){ rec.cur=want; try{ rec.sender.replaceTrack(want).catch(function(){}); }catch(e){} }
      });
    }
    function tdGvDrop(uid){
      var G=td.gv; if(!G)return;
      var rec=G.pcs[uid];
      if(rec){
        if(!rec.conn){ G.fails[uid]=(G.fails[uid]||0)+1; G.next[uid]=Date.now()+Math.min(60000,4000*Math.pow(2,G.fails[uid]-1)); }
        try{rec.pc.close();}catch(e){} delete G.pcs[uid];
      }
      delete G.an[uid];
      var a=document.getElementById('tdGvA_'+tdK(uid)); if(a&&a.parentNode)a.parentNode.removeChild(a);
    }
    function tdGvPc(uid,sa,offerer){
      var G=td.gv, pc=new RTCPeerConnection(tdIce()), rec={pc:pc,sa:sa,t:Date.now(),conn:false,ans:false,sender:null,cur:null};
      if(offerer){ var tr=pc.addTransceiver('audio',{direction:'sendrecv'}); rec.sender=tr.sender; }
      pc.ontrack=function(e){ var st=(e.streams&&e.streams[0])||new MediaStream([e.track]); tdGvAudioFor(uid,st); tdGvWatch(uid,st); };
      pc.onconnectionstatechange=function(){
        if(td.gv!==G||G.pcs[uid]!==rec)return; var st=pc.connectionState;
        if(st==='connected'){
          rec.conn=true; G.fails[uid]=0;
          if(rec.off&&rec.key){ var o={}; o['gv.'+rec.key]=firebase.firestore.FieldValue.delete(); tdRef().update(o).catch(function(){}); }
          tdGvApplyTracks(); tdGvUi();
        } else if(st==='failed'||st==='closed'){ tdGvDrop(uid); }
      };
      G.pcs[uid]=rec; return rec;
    }
    function tdGvOffer(peer){
      var G=td.gv, rec=tdGvPc(peer.u,peer.s,true), key=tdGvKey(state.me,peer.u), n=String(Date.now());
      rec.key=key; rec.n=n; rec.off=true;
      rec.pc.createOffer().then(function(o){return rec.pc.setLocalDescription(o);}).then(function(){return tdGather(rec.pc);}).then(function(){
        if(td.gv!==G||G.pcs[peer.u]!==rec)return;
        var o={}; o['gv.'+key]={so:G.sid,sa:peer.s,n:n,o:rec.pc.localDescription.sdp}; return tdRef().update(o);
      }).catch(function(){ if(td.gv===G&&G.pcs[peer.u]===rec)tdGvDrop(peer.u); });
    }
    function tdGvAnswer(peer,key,x){
      var G=td.gv; tdGvDrop(peer.u);
      var rec=tdGvPc(peer.u,peer.s,false); rec.key=key; rec.n=x.n;
      rec.pc.setRemoteDescription({type:'offer',sdp:x.o}).then(function(){
        var tr=rec.pc.getTransceivers().filter(function(t){return t.receiver&&t.receiver.track&&t.receiver.track.kind==='audio';})[0];
        if(tr){ tr.direction='sendrecv'; rec.sender=tr.sender; }
        return rec.pc.createAnswer();
      }).then(function(a){return rec.pc.setLocalDescription(a);}).then(function(){return tdGather(rec.pc);}).then(function(){
        if(td.gv!==G||G.pcs[peer.u]!==rec)return;
        tdGvApplyTracks();
        var o={}; o['gv.'+key+'.a']=rec.pc.localDescription.sdp; o['gv.'+key+'.an']=x.n; return tdRef().update(o);
      }).catch(function(){ if(td.gv===G&&G.pcs[peer.u]===rec)tdGvDrop(peer.u); });
    }
    function tdGvStart(){
      var G=td.gv={sid:String(Date.now()),stream:null,track:null,talk:false,pcs:{},handled:{},an:{},allow:{},allowAll:true,hush:{},deaf:false,n:0,full:false,fails:{},next:{}};
      tdGvLoad(G);
      G.hb=setInterval(function(){ if(td.gv===G)tdGvPresence().catch(function(){}); },GV_HB);
      G.tick=setInterval(tdGvTick,250);
      tdGvPresence().catch(function(){});
    }
    function tdGvSync(r){
      var G=td.gv, me=state.me;
      if(!G&&r&&td.roomId&&r.id===td.roomId&&r.status!=='finished'&&window.RTCPeerConnection&&(r.players||[]).some(function(p){return p.uid===me;})){ tdGvStart(); G=td.gv; }
      if(G&&r&&td.roomId){
        var all=tdGvPeers(r), ranked=all.slice(0,GV_MAX), mine=all.some(function(x){return x.u===me;});
        G.full=mine&&!ranked.some(function(x){return x.u===me;});
        var peers=G.full?[]:ranked.filter(function(x){return x.u!==me;}), P={};
        peers.forEach(function(x){P[x.u]=x;});
        Object.keys(G.pcs).forEach(function(u){ var rec=G.pcs[u], p=P[u]; if(!p||p.s!==rec.sa||(!rec.conn&&Date.now()-rec.t>20000))tdGvDrop(u); });
        peers.forEach(function(p){
          var rec=G.pcs[p.u];
          if(me<p.u){
            if(!rec){ if(!G.next[p.u]||Date.now()>=G.next[p.u])tdGvOffer(p); }
            else if(!rec.ans){ var x=r.gv&&r.gv[rec.key]; if(x&&x.a&&x.an===rec.n&&x.so===G.sid){ rec.ans=true; rec.pc.setRemoteDescription({type:'answer',sdp:x.a}).catch(function(){ tdGvDrop(p.u); }); } }
          } else {
            var key=tdGvKey(p.u,me), y=r.gv&&r.gv[key];
            if(y&&y.o&&y.n&&y.sa===G.sid&&y.so===p.s&&!G.handled[key+':'+y.n]&&(!rec||rec.n!==y.n)){ G.handled[key+':'+y.n]=1; tdGvAnswer(p,key,y); }
          }
        });
      }
      tdGvUi();
    }
    function tdGvTog(on,fn){
      var b=document.createElement('button'); b.type='button'; b.className='td-gv-tog '+(on?'on':'off'); b.textContent=on?'Oui':'Non'; b.setAttribute('aria-pressed',on?'true':'false');
      b.addEventListener('click',fn); return b;
    }
    function tdGvUi(force){
      var r=td.room, box=$td('tdGv'); if(!box)return;
      var G=td.gv, me=state.me, ps=(r&&r.players)||[];
      box.hidden=!(r&&td.roomId&&window.RTCPeerConnection&&ps.some(function(p){return p.uid===me;})&&G);
      if(box.hidden)return;
      var peers=tdGvPeers(r).filter(function(x){return x.u!==me;}), list=[{u:me,k:G.talk?1:0,self:1,conn:1}];
      peers.forEach(function(x){ list.push({u:x.u,k:x.k,conn:!!(G.pcs[x.u]&&G.pcs[x.u].conn)}); });
      var sig=list.map(function(x){return x.u+':'+(x.k?1:0)+':'+(x.conn?1:0);}).join(',');
      if(force||td.gvSig!==sig){
        td.gvSig=sig; var pb=$td('tdGvPeople'); pb.textContent='';
        list.forEach(function(x){
          var pl=ps.filter(function(p){return p.uid===x.u;})[0], full=tdSafeName(pl);
          var c=document.createElement('span'); c.className='td-gv-chip'; c.setAttribute('data-u',x.u);
          var i=document.createElement('i'); i.textContent=(full.trim().charAt(0)||'?').toUpperCase();
          var n=document.createElement('span'); n.textContent=(x.self?'Toi':full)+(x.k?' 🎙️':'')+((!x.self&&!x.conn)?' ⏳':'');
          c.appendChild(i); c.appendChild(n); pb.appendChild(c);
        });
      }
      var others=ps.filter(function(p){return p.uid!==me;}), nAllowed=others.filter(function(p){return tdGvAllowed(p.uid);}).length, txt;
      if(G.full) txt='Vocal complet ('+GV_MAX+' personnes max).';
      else if(G.talk) txt=!others.length?'Micro actif. Personne d’autre dans le salon pour l’instant.':(nAllowed===others.length?'Micro actif : tout le salon t’entend.':(nAllowed===0?'Micro actif, mais personne ne t’entend (voir Réglages).':'Micro actif : '+nAllowed+' personne'+(nAllowed>1?'s':'')+' sur '+others.length+' t’entend'+(nAllowed>1?'ent':'')+'.'));
      else txt='Tu entends tout le salon. Appuie sur « Parler » pour te faire entendre.';
      $td('tdGvInfo').textContent=txt;
      var tk=$td('tdGvTalk'); tk.textContent=G.talk?'⏹ Couper le micro':'🎙️ Parler'; tk.classList.toggle('on',!!G.talk); tk.disabled=!!td.gvBusy||G.full;
      $td('tdGvSpk').textContent=td.gvNeedTap?'🔊 Touche pour écouter':(G.deaf?'🔇 Son coupé':'🔊 Son actif');
      $td('tdGvCfg').textContent=td.gvCfg?'✖ Fermer':'⚙️ Réglages';
      $td('tdGvSet').hidden=!td.gvCfg;
      if(td.gvCfg){
        var onl={}; peers.forEach(function(x){onl[x.u]=1;});
        var rsig=others.map(function(p){return p.uid+':'+(tdGvAllowed(p.uid)?1:0)+(G.hush[p.uid]?1:0)+(onl[p.uid]?1:0);}).join(',');
        if(force||td.gvRowSig!==rsig){
          td.gvRowSig=rsig; var rows=$td('tdGvRows'); rows.textContent='';
          if(!others.length){ var e=document.createElement('p'); e.className='td-muted'; e.textContent='Personne d’autre dans le salon.'; rows.appendChild(e); }
          else {
            var h=document.createElement('div'); h.className='td-gv-row head'; ['','M’entend','Je l’entends'].forEach(function(t){ var sp=document.createElement('span'); sp.textContent=t; h.appendChild(sp); }); rows.appendChild(h);
            others.forEach(function(p){
              var row=document.createElement('div'); row.className='td-gv-row';
              var nm=document.createElement('span'); nm.className='nm'; nm.textContent=tdSafeName(p)+(onl[p.uid]?'':' (hors ligne)'); row.appendChild(nm);
              row.appendChild(tdGvTog(tdGvAllowed(p.uid),function(){ G.allow[p.uid]=!tdGvAllowed(p.uid); tdGvSave(); tdGvApplyTracks(); tdGvUi(true); }));
              row.appendChild(tdGvTog(!G.hush[p.uid],function(){ G.hush[p.uid]=!G.hush[p.uid]; tdGvSave(); tdGvApplyAudio(); tdGvUi(true); }));
              rows.appendChild(row);
            });
          }
        }
      }
    }
    function tdGvTick(){
      var G=td.gv; if(!G)return; G.n=(G.n||0)+1;
      if(G.ac&&G.ac.state==='suspended'){ try{G.ac.resume();}catch(e){} }
      var chips=$td('tdGvPeople').children;
      Object.keys(G.an).forEach(function(u){
        var o=G.an[u], dev=0; try{ o.an.getByteTimeDomainData(o.buf); }catch(e){ return; }
        for(var i=0;i<o.buf.length;i++){ var v=Math.abs(o.buf[i]-128); if(v>dev)dev=v; }
        var sp=dev>12;
        for(var k=0;k<chips.length;k++) if(chips[k].getAttribute('data-u')===u) chips[k].classList.toggle('speaking',sp);
      });
      if(G.n%16===0&&td.room)tdGvSync(td.room);
    }
    function tdGvTalkStop(){
      var G=td.gv; if(!G||!G.talk)return; G.talk=false;
      tdGvApplyTracks();
      try{ if(G.stream)G.stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
      G.stream=null; G.track=null; delete G.an[state.me];
      tdGvPresence().catch(function(){}); tdGvUi(true); if(td.room)tdVoiceSync(td.room,!!td.room.turn);
    }
    function tdGvTalkStart(){
      var G=td.gv; if(!G||G.talk||td.gvBusy)return;
      if(!navigator.mediaDevices||!window.RTCPeerConnection){ tdMsg('Ton navigateur ne permet pas le micro : écris plutôt.'); return; }
      td.gvBusy=true; tdGvUi();
      var gm=(typeof getMic==='function')?getMic:function(c){return navigator.mediaDevices.getUserMedia(c);};
      gm({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(st){
        if(td.gv!==G){ try{st.getTracks().forEach(function(t){t.stop();});}catch(e){} return; }
        G.stream=st; G.track=st.getAudioTracks()[0]; G.talk=true;
        tdGvWatch(state.me,st); tdGvApplyTracks();
        return tdGvPresence();
      }).catch(function(){ tdMsg('Micro indisponible : autorise le micro dans ton navigateur, ou écris.'); })
      .then(function(){ td.gvBusy=false; tdGvUi(true); if(td.room)tdVoiceSync(td.room,!!td.room.turn); });
    }
    function tdGvTalkToggle(){ var G=td.gv; if(!G)return; if(G.talk)tdGvTalkStop(); else tdGvTalkStart(); }
    function tdGvStop(){
      var G=td.gv; if(!G)return; td.gv=null; td.gvSig=null; td.gvRowSig=null; td.gvCfg=false; td.gvNeedTap=false;
      var _rw=$td('tdGvRows'), _pp=$td('tdGvPeople'); if(_rw)_rw.textContent=''; if(_pp)_pp.textContent='';
      clearInterval(G.hb); clearInterval(G.tick);
      Object.keys(G.pcs).forEach(function(u){ try{G.pcs[u].pc.close();}catch(e){} });
      try{if(G.stream)G.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
      try{if(G.ac)G.ac.close();}catch(e){}
      var ab=$td('tdGvAudios'); if(ab)ab.textContent='';
      var r=td.room;
      if(r&&td.roomId){
        var me=tdK(state.me), o={}; o['gvp.'+me]=firebase.firestore.FieldValue.delete();
        Object.keys(r.gv||{}).forEach(function(k){ if(k.indexOf(me+'__')===0||k.slice(-(me.length+2))==='__'+me)o['gv.'+k]=firebase.firestore.FieldValue.delete(); });
        try{ tdRef().update(o).catch(function(){}); }catch(e){}
      }
      td.gvNeedTap=false; var bx=$td('tdGv'); if(bx)bx.hidden=true;
    }
    /* ---- bouteille synchronisée : tout le monde voit le même tour, le créateur seul le lance ---- */
    var TD_SPIN_MS=3600;
    function tdBadge(txt,ms){ var b=$td('tdSpinBadge'); if(!b)return; clearTimeout(td.badgeT); b.textContent=txt||''; b.classList.toggle('on',!!txt); if(txt&&ms)td.badgeT=setTimeout(function(){b.classList.remove('on');},ms); }
    function tdAng(r,uid){var ps=r.players||[];for(var k=0;k<ps.length;k++)if(ps[k].uid===uid)return k*360/ps.length;return null;}
    function tdSetRot(deg,anim){var b=$td('tdBottle');b.style.transition=anim?'transform '+TD_SPIN_MS+'ms cubic-bezier(.17,.67,.12,1)':'none';b.style.transform='rotate('+deg+'deg)';if(!anim)void b.offsetWidth;td.rot=deg;}
    function tdEndSpin(){
      var r=td.room;
      if(!r||r.creator!==state.me||!r.turn||r.turn.phase!=='spin'||td.ending||!td.roomId)return;
      td.ending=true;
      fs.collection('truthDareRooms').doc(td.roomId).update({turn:Object.assign({},r.turn,{phase:'choose'})}).catch(function(){}).finally(function(){td.ending=false;});
    }
    function tdSyncBottle(r){
      if(td.spinning)return;
      var t=r.turn, base=td.rot||0;
      if(!t){var m=((base%360)+360)%360; if(m>.01&&m<359.99)tdSetRot(base+360-m,false); return;}
      var ang=tdAng(r,t.targetUid); if(ang===null)return;
      var fwd=(((ang-base)%360)+360)%360;
      if(t.phase==='spin' && t.spinId && t.spinId!==td.spinSeen){
        td.spinSeen=t.spinId;
        var age=Date.now()-t.spinId;
        if(!td.firstSnap || (age>-12000 && age<12000)){
          td.spinning=true; tdMsg('La bouteille tourne…');
          var hp=(r.players||[]).filter(function(p){return p.uid===r.creator;})[0];
          tdBadge('🌀 '+tdSafeName(hp)+' fait tourner la bouteille…'); $td('tdWheel').classList.add('spinning');
          tdSetRot(base+(t.spins||4)*360+fwd,true);
          var sid=t.spinId;
          setTimeout(function(){
            td.spinning=false; $td('tdWheel').classList.remove('spinning');
            var cr=td.room; if(!cr)return;
            if(cr.turn&&cr.turn.spinId===sid){ var tp=(cr.players||[]).filter(function(p){return p.uid===cr.turn.targetUid;})[0]; if(tp)tdBadge('🎯 '+tdSafeName(tp)+(cr.turn.targetUid===state.me?' : c’est toi !':' est désigné(e) !'),4500); }
            if(cr.creator===state.me && cr.turn && cr.turn.spinId===sid && cr.turn.phase==='spin') tdEndSpin();
            tdRenderRoom(cr);
          },TD_SPIN_MS+150);
          return;
        }
        tdSetRot(base+fwd,false);
        if(r.creator===state.me)tdEndSpin();
        return;
      }
      if(t.phase==='spin' && t.spinId && Date.now()-t.spinId>TD_SPIN_MS+2500 && r.creator===state.me)tdEndSpin();
      if(fwd>.01&&fwd<359.99)tdSetRot(base+fwd,false);
    }
    /* ---------- mini-chat : réservé aux joueurs NON désignés par la bouteille ----------
       Stocké dans le champ tchat du document de la partie, rattaché au tour (turnAt) et vidé à chaque tirage.
       Le joueur désigné ne reçoit aucun rendu : son DOM est vidé et le champ n'est jamais lu pour lui. */
    function tdChatRender(r,reveal){
      var box=$td('tdChat'), list=$td('tdChatList'), t=r.turn, me=state.me, ps=r.players||[];
      var inGame=ps.some(function(p){return p.uid===me;});
      var tOk=!!t&&ps.some(function(p){return p.uid===t.targetUid;}), pOk=!!t&&ps.some(function(p){return p.uid===t.pickerUid;});
      var can=!!reveal&&!!t&&t.phase!=='spin'&&t.targetUid!==me&&inGame&&tOk&&pOk;
      if(!can){ box.hidden=true; list.textContent=''; td.chatSig=''; return; }
      var tgt=ps.filter(function(p){return p.uid===t.targetUid;})[0], pck=ps.filter(function(p){return p.uid===t.pickerUid;})[0];
      var isP=t.pickerUid===me, done=t.phase==='done';
      var msgs=(r.tchat||[]).filter(function(m){return m&&m.turnAt===t.at&&typeof m.text==='string';}).sort(function(a,b){return a.at-b.at;}).slice(-60);
      box.hidden=false; $td('tdChatForm').hidden=done;
      $td('tdChatHint').textContent=(isP?'Les autres te soufflent des idées. ':'Souffle des idées à '+tdSafeName(pck)+'. ')+'🙈 '+tdSafeName(tgt)+' ne voit rien. Le chat se vide au prochain tour.';
      var sig=r.id+'|'+t.at+'|'+t.phase+'|'+t.pickerUid+'|'+me+'|'+msgs.length+'|'+(msgs.length?msgs[msgs.length-1].at:0);
      if(td.chatSig===sig) return;
      var first=!td.chatSig, atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<40;
      td.chatSig=sig; list.textContent='';
      if(!msgs.length){ var e=document.createElement('div'); e.className='td-chat-empty'; e.textContent='Aucune idée pour l’instant.'; list.appendChild(e); }
      msgs.forEach(function(m){
        var d=document.createElement('div'); d.className='td-chat-msg'+(m.uid===me?' mine':'');
        var b=document.createElement('b'); b.textContent=String(m.name||'Joueur').slice(0,32)+(m.uid===t.pickerUid?' · 🎯':''); d.appendChild(b);
        var x=document.createElement('span'); x.textContent=m.text; d.appendChild(x);
        if(isP&&t.phase==='ask'&&m.uid!==me){
          var u=document.createElement('button'); u.type='button'; u.className='td-chat-use'; u.textContent='↗ Utiliser';
          u.addEventListener('click',function(){ var ta=$td('tdPrompt'); ta.value=m.text; try{ta.focus();}catch(e){} });
          d.appendChild(u);
        }
        list.appendChild(d);
      });
      if(first||atBottom) list.scrollTop=list.scrollHeight;
    }
    function tdChatSend(){
      var r=td.room, t=r&&r.turn, inp=$td('tdChatInput'), txt=inp.value.trim();
      if(!txt||!t||!td.roomId||!state.me) return;
      if(t.phase==='spin'||t.phase==='done'||t.targetUid===state.me) return;
      var ps=r.players||[], mine=ps.filter(function(p){return p.uid===state.me;})[0]; if(!mine) return;
      var now=Date.now(); if(td.chatLast&&now-td.chatLast<500) return; td.chatLast=now;
      var m={uid:state.me,name:tdSafeName(mine),text:txt.slice(0,140),at:now,turnAt:t.at};
      inp.value='';
      fs.collection('truthDareRooms').doc(td.roomId).update({tchat:firebase.firestore.FieldValue.arrayUnion(m)})
      .catch(function(){ tdMsg('Message non envoyé.'); if(!inp.value) inp.value=txt; });
    }
    function tdSpin() {
      var r=td.room;if(!r||td.spinning||td.busy)return;
      if(r.creator!==state.me){tdMsg('Seul le créateur de la partie peut faire tourner la bouteille.');return;}
      var ps=(r.players||[]); if(ps.length<2){tdMsg('Il faut au moins deux joueurs.');return;}
      if(r.startAt>Date.now()){tdMsg('La partie commencera à l’heure prévue.');return;}
      if(r.turn && r.turn.phase!=='done'){var _t=ps.some(function(p){return p.uid===r.turn.targetUid;}),_p=ps.some(function(p){return p.uid===r.turn.pickerUid;});if(_t&&_p){tdMsg('Terminez le tour actuel avant de tourner la bouteille.');return;}}
      td.busy=true; $td('tdSpin').disabled=true;
      var target=ps[Math.floor(Math.random()*ps.length)];
      var others=ps.filter(function(p){return p.uid!==target.uid;}); var picker=others[Math.floor(Math.random()*others.length)];
      var id=Date.now(), ref=fs.collection('truthDareRooms').doc(td.roomId);
      ref.update({status:'playing',turn:{phase:'spin',spinId:id,spins:4+Math.floor(Math.random()*3),targetUid:target.uid,pickerUid:picker.uid,type:'',prompt:'',answer:'',at:id},voice:null,vc:{},tchat:[],history:(r.history||[]).concat([{targetUid:target.uid,pickerUid:picker.uid,at:id}]).slice(-30)})
      .catch(function(e){tdMsg('Erreur pendant le tirage : '+(e.message||''));})
      .finally(function(){td.busy=false; if(td.room)tdRenderRoom(td.room);});
    }
    function tdUpd(turn,extra,okMsg,errMsg){
      var o=Object.assign({turn:turn},extra||{});
      return fs.collection('truthDareRooms').doc(td.roomId).update(o).then(function(){if(okMsg)tdMsg(okMsg);}).catch(function(e){tdMsg(errMsg+(e&&e.message?' ('+e.message+')':''));});
    }
    function tdChoose(type) {
      var r=td.room; if(!r||!r.turn||r.turn.phase!=='choose'||r.turn.targetUid!==state.me)return;
      tdUpd(Object.assign({},r.turn,{phase:'ask',type:type}),null,type==='action'?'Action choisie !':'Vérité choisie !','Choix impossible');
    }
    function tdSendPrompt() {
      var r=td.room; if(!r||!r.turn||r.turn.phase!=='ask'||r.turn.pickerUid!==state.me)return;
      var type=r.turn.type||'truth', prompt=$td('tdPrompt').value.trim();
      if(!prompt){var list=defaults[type]||defaults.truth;prompt=list[Math.floor(Math.random()*list.length)];}
      tdUpd(Object.assign({},r.turn,{phase:'answer',prompt:prompt.slice(0,240),by:state.me}),null,'Proposition envoyée !','Envoi impossible').then(function(){$td('tdPrompt').value='';});
    }
    function tdFinish() {
      var r=td.room; if(!r||!r.turn||r.turn.phase!=='answer'||r.turn.targetUid!==state.me)return;
      var ans=$td('tdAnswer').value.trim();
      if(!ans){tdMsg('Écris ta réponse avant de l’envoyer.');return;}
      tdUpd(Object.assign({},r.turn,{phase:'vote',answer:ans.slice(0,500),votes:{},voteAt:Date.now()}),null,'Réponse envoyée : les autres votent.','Impossible d’envoyer la réponse').then(function(){$td('tdAnswer').value='';});
    }
    /* vote : approuvé si la majorité approuve ; sinon (égalité comprise) le joueur doit refaire */
    function tdVote(v,timedOut) {
      if(!td.roomId||td.voting||!fs.runTransaction)return;
      td.voting=true;
      var ref=fs.collection('truthDareRooms').doc(td.roomId);
      fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
        if(!d.exists)return;
        var room=d.data(), t=room.turn; if(!t||t.phase!=='vote')return;
        var voters=(room.players||[]).filter(function(p){return p.uid!==t.targetUid;});
        var votes=Object.assign({},t.votes||{});
        if(v){ if(t.targetUid===state.me||votes[state.me]||!voters.some(function(p){return p.uid===state.me;}))return; votes[state.me]=v; }
        if(timedOut){ if(!t.voteAt||Date.now()<t.voteAt+TD_VOTE_MS)return; voters.forEach(function(p){ if(!votes[p.uid])votes[p.uid]='ok'; }); }
        var ok=0,no=0; voters.forEach(function(p){if(votes[p.uid]==='ok')ok++;else if(votes[p.uid]==='no')no++;});
        var V=voters.length, nt;
        if(V===0||ok*2>V) nt=Object.assign({},t,{votes:votes,phase:'done',result:'done'});
        else if(no*2>=V) nt=Object.assign({},t,{votes:{},phase:'answer',attempt:(t.attempt||0)+1,rejected:t.answer,answer:''});
        else nt=Object.assign({},t,{votes:votes});
        if(!v&&nt.phase==='vote')return;
        var upd={turn:nt};
        if(nt.phase==='done')upd.history=(room.history||[]).concat([{targetUid:t.targetUid,pickerUid:t.pickerUid,type:t.type,prompt:t.prompt,answer:t.answer,approve:ok,reject:no,result:'done',at:Date.now()}]).slice(-50);
        tx.update(ref,upd);
      });}).catch(function(e){tdMsg('Vote impossible'+(e&&e.message?' ('+e.message+')':''));}).then(function(){td.voting=false;},function(){td.voting=false;});
    }
    /* ---------- compte à rebours du vote : 20 s, puis les absents comptent comme « approuvé » ---------- */
    var TD_VOTE_MS=20000;
    function tdVoteTick(){
      var r=td.room, t=r&&r.turn, box=$td('tdVoteTimer');
      if(!t||t.phase!=='vote'||!t.voteAt||$td('tdRoom').hidden||td.spinning){ if(box)box.hidden=true; return; }
      var me=state.me, ps=r.players||[], left=t.voteAt+TD_VOTE_MS-Date.now(), sec=Math.max(0,Math.ceil(left/1000));
      var isVoter=t.targetUid!==me&&ps.some(function(p){return p.uid===me;}), mine=(t.votes||{})[me];
      box.hidden=false;
      $td('tdTimerBar').style.width=Math.max(0,Math.min(100,left/TD_VOTE_MS*100)).toFixed(1)+'%';
      var tx=$td('tdTimerTxt'); tx.classList.toggle('low',left>0&&left<=6000);
      tx.textContent=left<=0?'⏱ Temps écoulé…':'⏱ '+sec+' s'+(isVoter&&!mine?' · sans vote, tu comptes comme ✅':' avant la fin du vote');
      if(left<=0&&!td.voting&&(!td.voteTry||Date.now()-td.voteTry>1500)&&(r.creator===me||left<=-3000)){ td.voteTry=Date.now(); tdVote(null,true); }
    }
    /* ---------- l'hôte peut retirer des joueurs ---------- */
    function tdHostRender(r){
      var box=$td('tdHost'), list=$td('tdHostList'), me=state.me;
      var others=(r.players||[]).filter(function(p){return p.uid!==me;});
      if(r.creator!==me||!others.length){ box.hidden=true; list.textContent=''; td.hostSig=''; return; }
      box.hidden=false;
      var sig=r.id+'|'+others.map(function(p){return p.uid+':'+tdSafeName(p);}).join(',');
      if(td.hostSig===sig)return; td.hostSig=sig; list.textContent='';
      others.forEach(function(p){
        var row=document.createElement('div'); row.className='td-host-row';
        var n=document.createElement('span'); n.textContent=tdSafeName(p);
        var b=document.createElement('button'); b.type='button'; b.className='td-host-kick'; b.textContent='Retirer';
        b.addEventListener('click',function(){ tdKick(p.uid); });
        row.appendChild(n); row.appendChild(b); list.appendChild(row);
      });
    }
    function tdKick(uid){
      var r=td.room; if(!r||!td.roomId||r.creator!==state.me||uid===state.me||td.kicking||!fs.runTransaction)return;
      var p=(r.players||[]).filter(function(x){return x.uid===uid;})[0]; if(!p)return;
      var name=tdSafeName(p);
      if(!window.confirm('Retirer '+name+' du salon ? Cette personne ne pourra pas revenir.'))return;
      td.kicking=true; var ref=fs.collection('truthDareRooms').doc(td.roomId);
      fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
        if(!d.exists)return; var room=d.data(); if(room.creator!==state.me)return;
        var ps=(room.players||[]).filter(function(x){return x.uid!==uid;});
        var kicked=(room.kicked||[]).filter(function(x){return x!==uid;}).concat([uid]);
        tx.update(ref,{players:ps,kicked:kicked});
      });}).then(function(){tdMsg(name+' a été retiré(e) du salon.');},function(){tdMsg('Impossible de retirer ce joueur.');}).then(function(){td.kicking=false;});
    }
    function tdLeave() {
      tdVoiceStopAll(); tdGvStop();
      var rid=td.roomId, r=td.room;
      if(rid&&r){
        var ref=fs.collection('truthDareRooms').doc(rid), me=state.me;
        var apply=function(withHost){
          return fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
            if(!d.exists)return;
            var room=d.data(), ps=(room.players||[]).filter(function(p){return p.uid!==me;});
            var upd={players:ps};
            /* si l’hôte part, la partie passe au joueur suivant (sinon plus personne ne peut lancer la bouteille) */
            if(withHost&&room.creator===me&&ps.length)upd.creator=ps[0].uid;
            if(!ps.length){upd.status='finished';upd.turn=null;}
            tx.update(ref,upd);
          });});
        };
        if(fs.runTransaction)apply(true).catch(function(){return apply(false);}).catch(function(){});
        else ref.update({players:(r.players||[]).filter(function(p){return p.uid!==me;})}).catch(function(){});
      }
      if(td.roomUnsub)td.roomUnsub();td.roomUnsub=null;td.roomId=null;td.room=null;$td('tdRoom').hidden=true;tdInRoom(false);tdMsg('Tu as quitté la partie.');
    }
    $td('tdOpen').addEventListener('click',function(){tdShowPanel(true);tdListenRooms();tdMsg('Choisis une partie ou crée la tienne.');});
    $td('tdClose').addEventListener('click',function(){tdShowPanel(false);});
    document.addEventListener('newsaccess',function(){tdCertUi();try{tdRenderRooms();tdRenderPosts();}catch(e){}});
    $td('tdCreate').addEventListener('click',tdCreate);
    $td('tdNameMode').addEventListener('change',function(){$td('tdPseudo').hidden=this.value!=='pseudo';});
    $td('tdSpin').addEventListener('click',tdSpin);
    $td('tdStop').addEventListener('click',tdStop);
    $td('tdAction').addEventListener('click',function(){tdChoose('action');});
    $td('tdTruth').addEventListener('click',function(){tdChoose('truth');});
    $td('tdSendPrompt').addEventListener('click',tdSendPrompt);
    $td('tdDone').addEventListener('click',function(){tdFinish();});
    $td('tdMicBtn').addEventListener('click',function(){ var G=td.gv; if(G&&!G.talk){ G.allow={}; G.allowAll=true; } tdGvTalkToggle(); });
    $td('tdApprove').addEventListener('click',function(){tdVote('ok');});
    $td('tdReject').addEventListener('click',function(){tdVote('no');});
    $td('tdLeave').addEventListener('click',tdLeave);
    $td('tdChatSend').addEventListener('click',tdChatSend);
    window.setInterval(tdVoteTick,500);
    $td('tdGvTalk').addEventListener('click',function(){ tdGvTalkToggle(); });
    $td('tdGvSpk').addEventListener('click',function(){
      var G=td.gv; if(!G)return;
      if(td.gvNeedTap){ td.gvNeedTap=false; var as=$td('tdGvAudios').querySelectorAll('audio'); for(var i=0;i<as.length;i++){ try{as[i].play();}catch(e){} } }
      else { G.deaf=!G.deaf; tdGvSave(); tdGvApplyAudio(); }
      tdGvUi();
    });
    $td('tdGvCfg').addEventListener('click',function(){ td.gvCfg=!td.gvCfg; tdGvUi(true); });
    $td('tdGvAll').addEventListener('click',function(){ var G=td.gv; if(!G)return; G.allow={}; G.allowAll=true; tdGvSave(); tdGvApplyTracks(); tdGvUi(true); });
    $td('tdGvNone').addEventListener('click',function(){ var G=td.gv; if(!G)return; G.allow={}; G.allowAll=false; tdGvSave(); tdGvApplyTracks(); tdGvUi(true); });
    window.addEventListener('pagehide',function(){tdVoiceStopAll();tdGvStop();if(td.unsub)td.unsub();if(td.roomUnsub)td.roomUnsub();});
  })();




/* E'cho — js/app/23-actualites-lettres.js
   Actualités : lettres anonymes
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- Actualités : lettres anonymes ---------- */
  var viewNews = $('#viewNews'), nwFeed = $('#nwFeed');
  var NWH = { shown: null, t0: 0, down: false, slide: false, key: '', hot: null }, NWSIG = {};
  var NW = { items: [], unsub: null, mineUnsub: null, mine: {}, id: null, uid: null, loaded: false, failed: false, last: 0, busy: false, open: {}, cm: {}, draft: {}, replyTo: {}, as: 'anon', pubAs: 'anon', video: null, cmLast: 0, pick: '', limit: 20 };
  var NW_ADJ = ['Discret', 'Curieux', 'Rêveur', 'Malin', 'Sauvage', 'Tranquille', 'Espiègle', 'Mystérieux', 'Rusé', 'Timide', 'Brave', 'Lunaire', 'Farouche', 'Sage', 'Fantasque', 'Nocturne', 'Pensif', 'Joyeux'];
  var NW_ANI = [['Renard', '🦊'], ['Hibou', '🦉'], ['Panda', '🐼'], ['Loup', '🐺'], ['Chat', '🐱'], ['Lynx', '🐆'], ['Dauphin', '🐬'], ['Koala', '🐨'], ['Faucon', '🦅'], ['Lapin', '🐰'], ['Cerf', '🦌'], ['Papillon', '🦋'], ['Tigre', '🐯'], ['Hérisson', '🦔'], ['Moineau', '🐦'], ['Lama', '🦙'], ['Castor', '🦫']];
  function nwRand(n) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  function nwMake() {
    var an = NW_ANI[nwRand(NW_ANI.length)];
    return { name: an[0] + ' ' + NW_ADJ[nwRand(NW_ADJ.length)] + ' ' + (10 + nwRand(90)), emoji: an[1], hue: nwRand(360) };
  }
  function nwAv(node, o) {
    node.textContent = o.emoji || '👤';
    node.style.background = 'hsl(' + (o.hue || 0) + ' 65% 55% / .28)';
  }
  function nwErr(t) { var e = $('#nwErr'); e.textContent = t || ''; e.hidden = !t; }
  function nwSaveId() {
    try { localStorage.setItem('uandi-anon:' + state.me, JSON.stringify(NW.id)); } catch (e) {}
    fs.collection('anonProfiles').doc(state.me).set(NW.id).catch(function () {});
  }
  function nwIdentity() {
    if (NW.id) return Promise.resolve(NW.id);
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('uandi-anon:' + state.me) || 'null'); } catch (e) {}
    if (raw && raw.name && raw.emoji) { NW.id = raw; return Promise.resolve(raw); }
    return fs.collection('anonProfiles').doc(state.me).get()
      .then(function (d) { return d.exists && d.data().name ? d.data() : null; }, function () { return null; })
      .then(function (x) { NW.id = x || nwMake(); nwSaveId(); return NW.id; });
  }
  function nwPaintId() {
    if (!NW.id) return;
    nwAv($('#nwIdAv'), NW.id);
    $('#nwIdName').textContent = NW.id.name;
  }
  function nwStop() {
    if (NW.unsub) NW.unsub();
    if (NW.mineUnsub) NW.mineUnsub();
    NW.unsub = null; NW.mineUnsub = null; NW.items = []; NW.mine = {}; NW.id = null; NW.uid = null;
    NW.loaded = false; NW.failed = false; NW.last = 0;
    Object.keys(NW.cm).forEach(function (k) { if (NW.cm[k].unsub) NW.cm[k].unsub(); }); NW.cm = {}; NW.open = {};
    atStop();
    if (window.__tdStop) window.__tdStop();
    if (nwFeed) nwFeed.textContent = '';
  }
  function nwAgo(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    return Math.floor(s / 86400) + ' j';
  }
  function nwCount(o) { var n = 0, k; o = o || {}; for (k in o) { if (o[k]) n++; } return n; }
  /* réactions (plusieurs emojis) sur les lettres et les commentaires */
  var NWRX = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
  function nwRxOf(o) {
    var out = {}, l = o.likes, r = o.reacts;
    if (l && typeof l === 'object') Object.keys(l).forEach(function (k) { if (l[k] === true) out[k] = NWRX[0]; });
    if (r && typeof r === 'object') Object.keys(r).forEach(function (k) { if (typeof r[k] === 'string' && r[k]) out[k] = r[k]; });
    return out;
  }
  function nwRxBtn(o, key, ref) {
    var rx = nwRxOf(o), n = Object.keys(rx).length, mineR = rx[state.me] || '';
    var sg = n ? rxSummary(rx) : '';
    var b = el('button', 'vact rxbtn' + (NWSIG[key] !== undefined && NWSIG[key] !== sg ? ' pop' : ''), n ? sg : '♡ J’aime'); NWSIG[key] = sg; b.type = 'button';
    b.setAttribute('aria-pressed', mineR ? 'true' : 'false'); b.setAttribute('aria-label', 'Réagir (maintenir pour choisir)');
    b.style.cssText = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation';
    /* maintenir = choisir une réaction ; simple appui = ❤️ (ou retirer ma réaction) */
    var t = null, fired = false, x0 = 0, y0 = 0;
    function cancel() { clearTimeout(t); t = null; b.classList.remove('pressing'); }
    b.addEventListener('pointerdown', function (ev) {
      fired = false; cancel();
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      x0 = ev.clientX; y0 = ev.clientY; b.classList.add('pressing');
      t = setTimeout(function () {
        t = null; fired = true;
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
        b.classList.remove('pressing'); NWH.slide = NWH.down; NWH.key = key;
        NW.pick = key; nwRender();
      }, 380);
    });
    b.addEventListener('pointermove', function (ev) { if (t && (Math.abs(ev.clientX - x0) > 10 || Math.abs(ev.clientY - y0) > 10)) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (nm) { b.addEventListener(nm, cancel); });
    b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    b.addEventListener('click', function () {
      if (fired) { fired = false; return; }
      if (NW.pick === key) { NW.pick = ''; nwRender(); return; }
      if (!ref) return;
      nwReact(ref, o, mineR ? mineR : NWRX[0]);
    });
    return b;
  }
  function nwReact(ref, o, e) {
    var cur = nwRxOf(o)[state.me] || '', p = {};
    p['reacts.' + state.me] = cur === e ? firebase.firestore.FieldValue.delete() : e;
    if (o.likes && o.likes[state.me]) p['likes.' + state.me] = false;
    ref.update(p).catch(function () { nwErr('Réaction impossible (connexion ou règles Firestore).'); });
  }
  function nwPickEl(o, ref) {
    var box = el('div', 'nwpick'), cur = nwRxOf(o)[state.me] || '';
    NWRX.forEach(function (e) {
      var b = el('button', 'vact', e); b.type = 'button'; b.setAttribute('aria-pressed', cur === e ? 'true' : 'false');
      b._pick = function () { NW.pick = ''; nwReact(ref, o, e); nwRender(); };
      b._go = function () {
        if (box.dataset.busy) return; box.dataset.busy = '1';
        b.classList.add('chosen'); box.classList.remove('fresh'); box.classList.add('out');
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (x) {}
        setTimeout(b._pick, 190);
      };
      b.addEventListener('click', b._go);
      box.appendChild(b);
    });
    return box;
  }
  function nwFresh(box, key) {
    var n = Date.now();
    if (NWH.shown !== key) { NWH.shown = key; NWH.t0 = n; }
    var age = n - NWH.t0;
    if (age < 450) {
      box.classList.add('fresh'); box.style.setProperty('--el', age + 'ms');
      for (var i = 0; i < box.children.length; i++) box.children[i].style.setProperty('--k', i);
    }
    return box;
  }
  function nwSetHot(b) {
    if (NWH.hot === b) return;
    if (NWH.hot) NWH.hot.classList.remove('hot');
    NWH.hot = b;
    if (b) { b.classList.add('hot'); try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {} }
  }
  function nwHotAt(x, y) {
    var box = nwFeed.querySelector('.nwpick');
    if (!box) return null;
    var r = box.getBoundingClientRect();
    if (x < r.left - 14 || x > r.right + 14 || y < r.top - 46 || y > r.bottom + 46) return null;
    var best = null, bd = 1e9, bs = box.children;
    for (var i = 0; i < bs.length; i++) {
      var q = bs[i].getBoundingClientRect(), d = Math.abs(x - (q.left + q.width / 2));
      if (d < bd && y > q.top - 46 && y < q.bottom + 46) { bd = d; best = bs[i]; }
    }
    return best;
  }
  document.addEventListener('pointerdown', function (ev) { NWH.down = !!(ev.target.closest && ev.target.closest('#nwFeed')); }, true);
  document.addEventListener('pointermove', function (ev) { if (NWH.slide) nwSetHot(nwHotAt(ev.clientX, ev.clientY)); }, { passive: true });
  function nwEndSlide(cancel) {
    NWH.down = false;
    if (!NWH.slide) return;
    NWH.slide = false;
    var b = NWH.hot; nwSetHot(null);
    if (b && !cancel && b._go) b._go();
  }
  document.addEventListener('pointerup', function () { nwEndSlide(false); }, true);
  document.addEventListener('pointercancel', function () { nwEndSlide(true); }, true);
  nwFeed.addEventListener('touchmove', function (ev) { if (NWH.slide && ev.cancelable) ev.preventDefault(); }, { passive: false });
  var nwRaf = 0;
  function nwRender() {
    if (nwRaf) return;
    nwRaf = requestAnimationFrame(function () { nwRaf = 0; nwRenderNow(); });
  }
  function nwRenderNow() {
    if (!nwFeed) return;
    var fo = document.activeElement, foId = fo && fo.dataset && fo.dataset.lid;
    var keepTop = nwFeed.scrollTop; /* on garde la position : vider le fil la remettait tout en haut */
    if (!NW.pick) NWH.shown = null;
    nwFeed.textContent = '';
    if (!NW.loaded) { nwFeed.appendChild(el('p', 'hint', 'Chargement…')); return; }
    if (NW.failed) { nwFeed.appendChild(el('p', 'hint', 'Impossible de charger les lettres (règles Firestore : autorise la collection « letters »).')); return; }
    var creator = creatorOn();
    var list = NW.items.filter(function (it) { return creator || NW.mine[it.id] || nwCount(it.reports) < 3; });
    list = list.slice().sort(function (a, b) { return (b.pin === true) - (a.pin === true); });
    if (typeof crDlg !== 'undefined' && crDlg.open && CR.mode === 'mod') crRender();
    if (!list.length) { nwFeed.appendChild(el('p', 'hint', 'Aucune lettre pour l’instant. Écris la première !')); return; }
    var nwTotal = list.length, nwLim = NW.limit || 20;
    list = list.slice(0, nwLim);
    list.forEach(function (it) {
      var mine = !!NW.mine[it.id], nrep = nwCount(it.reports), likes = it.likes || {}, liked = !!likes[state.me], nl = nwCount(likes);
      var card = el('article', 'nwcard' + (nrep >= 3 ? ' nwflag' : '')); card.dataset.id = it.id;
      var head = el('div', 'nwhead'), av = el('span', 'nwav'), who = el('div', 'nwwho');
      if (!(it.kind === 'real' && it.uid)) nwAv(av, it);
      var isReal = it.kind === 'real' && it.uid;
      if (isReal) { paintPhoto(av, it.uid, it.name); loadPhoto(it.uid); }
      var lnm = el('b', null, isReal ? cap(it.name) : (it.alias || 'Anonyme'));
      if (isReal) { withBadge(lnm, it.uid); ensureBadge(it.uid); head.style.cursor = 'pointer'; head.addEventListener('click', function () { if (window.UIProfile && UIProfile.open) UIProfile.open(it.uid, it.name); }); }
      who.appendChild(lnm);
      who.appendChild(el('small', null, nwAgo(it.ts || 0) + (isReal ? ' · Profil' : '')));
      if (it.pin === true) who.appendChild(el('small', 'nwpin', '📌 Épinglée'));
      head.appendChild(av); head.appendChild(who);
      card.appendChild(head);
      if (!((it.img && it.text === '📷 Photo') || (it.vid && it.text === '🎬 Vidéo'))) card.appendChild(el('p', 'nwtext', it.text || ''));
      if (typeof it.img === 'string' && isCld(it.img)) {
        var pim = el('img', 'nwimg'); pim.src = it.img; pim.loading = 'lazy'; pim.alt = 'Photo anonyme'; pim.referrerPolicy = 'no-referrer';
        pim.addEventListener('click', function () {
          var lb = el('div', 'nw-lb'), li = el('img'), lx = el('button', null, '✖'); li.src = it.img; li.alt = 'Photo anonyme'; lx.type = 'button'; lx.setAttribute('aria-label', 'Fermer');
          lb.appendChild(li); lb.appendChild(lx); lb.addEventListener('click', function () { lb.remove(); }); document.body.appendChild(lb);
        });
        card.appendChild(pim);
      }
      if (typeof it.vid === 'string' && isCld(it.vid)) {
        var pv = el('video', 'nwvid'); pv.src = it.vid; pv.controls = true; pv.playsInline = true; pv.preload = 'metadata'; pv.setAttribute('playsinline', ''); pv.setAttribute('controlslist', 'nodownload');
        card.appendChild(pv);
      }
      if (nrep >= 3) card.appendChild(el('small', 'nwflagtxt', 'Masquée pour les autres : signalée ' + nrep + ' fois'));
      var acts = el('div', 'nwacts'), sec = el('div', 'nwsec');
      acts.appendChild(nwRxBtn(it, 'l:' + it.id, LC().doc(it.id)));
      if (!mine) {
        var done = !!(it.reports && it.reports[state.me]);
        var rp = el('button', 'vact', done ? 'Signalée' : 'Signaler');
        rp.type = 'button'; rp.disabled = done;
        rp.addEventListener('click', function () { nwReport(it); });
        sec.appendChild(rp);
      }
      if (mine || creator) {
        var dl = el('button', 'vact vd', 'Supprimer');
        dl.type = 'button';
        dl.addEventListener('click', function () { nwDelete(it); });
        sec.appendChild(dl);
      }
      if (creator) {
        var pb = el('button', 'vact', it.pin === true ? 'Désépingler' : 'Épingler'); pb.type = 'button';
        pb.addEventListener('click', function () {
          LC().doc(it.id).update({ pin: it.pin === true ? firebase.firestore.FieldValue.delete() : true })
            .catch(function () { nwErr('Épinglage impossible (règles Firestore : le créateur doit pouvoir modifier « letters »).'); });
        });
        sec.appendChild(pb);
      }
      var cmb = el('button', 'vact', '💬 Commenter' + (nwNb(it) ? ' (' + nwNb(it) + ')' : ''));
      cmb.type = 'button'; cmb.setAttribute('aria-pressed', NW.open[it.id] ? 'true' : 'false');
      cmb.addEventListener('click', function () { nwCmToggle(it); });
      acts.appendChild(cmb);
      if (!mine && !isReal) {
        var dc = el('button', 'vact', '🎭 Discuter');
        dc.type = 'button';
        dc.addEventListener('click', function () { atStart(it.id, { name: it.alias, emoji: it.emoji, hue: it.hue }); });
        acts.appendChild(dc);
      }
      if (NW.pick === 'l:' + it.id) acts.appendChild(nwFresh(nwPickEl(it, LC().doc(it.id)), 'l:' + it.id));
      card.appendChild(acts);
      if (sec.childNodes.length) card.appendChild(sec);
      if (NW.open[it.id] && NW.cm[it.id]) card.appendChild(nwCmBox(it));
      nwFeed.appendChild(card);
    });
    if (nwTotal > list.length) {
      var more = el('button', 'nwpost nwmore', 'Afficher plus (' + Math.min(20, nwTotal - list.length) + ' de plus)'); more.type = 'button';
      more.addEventListener('click', function () { NW.limit = (NW.limit || 20) + 20; nwRender(); });
      nwFeed.appendChild(more);
    }
    nwFeed.scrollTop = keepTop;
    if (foId) { var nf = nwFeed.querySelector('input[data-lid="' + foId + '"]'); if (nf) { nf.focus(); try { nf.setSelectionRange(nf.value.length, nf.value.length); } catch (e) {} } }
  }
  var _nwRenderNow0 = nwRenderNow;
  nwRenderNow = function () {
    var t = nwFeed ? nwFeed.scrollTop : 0;
    _nwRenderNow0();
    if (window.__tdPosts) window.__tdPosts();
    if (nwFeed) nwFeed.scrollTop = t;
  };
  function nwListen() {
    if (window.__tdStart) window.__tdStart();
    var col = nwColFor();
    if (NW.unsub && NW.col !== col) { /* le rôle ou le fil choisi a changé : on repart sur le bon fil */
      NW.unsub(); NW.unsub = null; if (NW.mineUnsub) { NW.mineUnsub(); NW.mineUnsub = null; }
      NW.items = []; NW.loaded = false; NW.failed = false; NW.pick = '';
      Object.keys(NW.cm).forEach(function (k) { if (NW.cm[k].unsub) NW.cm[k].unsub(); }); NW.cm = {}; NW.open = {};
    }
    if (NW.unsub) return;
    NW.col = col;
    NW.unsub = fs.collection(col).orderBy('ts', 'desc').limit(100).onSnapshot(function (snap) {
      NW.items = snap.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; });
      NW.loaded = true; NW.failed = false; nwRender();
      try { var nt = 0, mine = NW.mine || {}; NW.items.forEach(function (v) { if (!mine[v.id] && v.uid !== state.me && v.ts > nt) nt = v.ts; }); document.dispatchEvent(new CustomEvent('newsnew', { detail: { ts: nt } })); } catch (e) {}
    }, function () { NW.loaded = true; NW.failed = true; nwRender(); });
    NW.mineUnsub = fs.collection('letterOwners').where('uid', '==', state.me).onSnapshot(function (snap) {
      NW.mine = {}; snap.forEach(function (d) { NW.mine[d.id] = true; }); nwRender(); atWatch();
    }, function () {});
  }
  /* deux fils séparés : « letters » = comptes certifiés (et anciennes lettres), « lettersN » = comptes non certifiés.
     Le créateur lit et publie dans celui qu'il choisit avec les deux boutons au-dessus du fil. */
  function nwColFor() {
    if (badges[state.me]) return NW.fnd === 'N' ? 'lettersN' : 'letters';
    return isCertMe() ? 'letters' : 'lettersN';
  }
  function LC() { return fs.collection(NW.col || nwColFor()); }
  function nwAudPaint() {
    var t = $('#nwAudTxt'), sw = $('#nwAudSw'); if (!t || !sw) return;
    var col = nwColFor();
    t.textContent = col === 'letters' ? 'Fil des comptes certifiés' : 'Fil des comptes non certifiés';
    sw.hidden = !badges[state.me];
    [].forEach.call(sw.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String((b.dataset.a === 'N') === (col === 'lettersN'))); });
  }
  $('#nwAudSw').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b || !badges[state.me]) return;
    NW.fnd = b.dataset.a === 'N' ? 'N' : 'C'; nwListen(); nwRender(); nwAudPaint();
  });
  document.addEventListener('newsaccess', function () { if (state.view === 'news' && NW.unsub) { nwListen(); nwRender(); } nwAudPaint(); });
  document.addEventListener('newsaccess', function () { nwPubPaint(); });
  document.addEventListener('newsnew', function () { nwPubPaint(); });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#openNews, .tab[data-t="news"]')) setTimeout(nwPubPaint, 200); });
  function nwLike(it) {
    var p = {}; p['likes.' + state.me] = !(it.likes && it.likes[state.me]);
    LC().doc(it.id).update(p).catch(function () { nwErr('Action impossible (connexion ou règles Firestore).'); });
  }
  function nwReport(it) {
    if (!confirm('Signaler cette lettre ? Elle sera masquée après plusieurs signalements.')) return;
    var p = {}; p['reports.' + state.me] = true;
    LC().doc(it.id).update(p).catch(function () { nwErr('Signalement impossible (connexion ou règles Firestore).'); });
  }
  function nwDelete(it) {
    if (!confirm('Supprimer cette lettre ?')) return;
    LC().doc(it.id).delete()
      .then(function () { fs.collection('letterOwners').doc(it.id).delete().catch(function () {}); })
      .catch(function () { nwErr('Suppression impossible (connexion ou règles Firestore).'); });
  }
  /* photo anonyme : redimensionnée et ré-encodée dans un canvas (supprime les métadonnées EXIF : position GPS, appareil…) */
  function nwPhotoClear() {
    NW.photo = null; NW.video = null;
    var p = $('#nwPrev'); if (p) p.hidden = true;
    var pv = $('#nwPrevVid'); if (pv) { try { pv.pause(); } catch (e) {} if (pv.dataset.u) { URL.revokeObjectURL(pv.dataset.u); pv.dataset.u = ''; } pv.removeAttribute('src'); pv.hidden = true; }
    var pi = $('#nwPrevImg'); if (pi) { pi.hidden = false; pi.removeAttribute('src'); }
    var f = $('#nwFile'); if (f) f.value = '';
  }
  var NW_VID_MAX = 30 * 1024 * 1024; /* 30 Mo : au-delà, l'envoi est trop long et peut être refusé */
  /* « Anonyme » ou « Mon profil » pour publier */
  function nwPubPaint() {
    var real = NW.pubAs === 'real', box = $('#nwBox');
    if (box) box.classList.toggle('asreal', real);
    [].forEach.call(document.querySelectorAll('#nwAs button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.as === NW.pubAs)); });
    var rb = document.querySelector('#nwAs button[data-as="real"]'); if (rb) rb.textContent = '👤 ' + cap(myName());
    var t = $('#nwText'); if (t) t.placeholder = real ? 'Quoi de neuf ? Partage avec ton profil…' : 'Quoi de neuf ? Écris ta lettre anonyme…';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#nwAs button'); if (!b) return;
    NW.pubAs = b.dataset.as === 'real' ? 'real' : 'anon';
    nwErr('');
    nwPubPaint();
  });
  nwPubPaint();
  function nwPhotoPick(file) {
    nwErr('');
    if (!file) return;
    if (/^video\//.test(file.type)) {
      if (file.size > NW_VID_MAX) { nwErr('Vidéo trop lourde (30 Mo maximum).'); $('#nwFile').value = ''; return; }
      nwPhotoClear();
      NW.video = file;
      var pv = $('#nwPrevVid'), u = URL.createObjectURL(file); pv.dataset.u = u; pv.src = u; pv.hidden = false; $('#nwPrevImg').hidden = true; $('#nwPrev').hidden = false;
      return;
    }
    if (!/^image\//.test(file.type)) { nwErr('Choisis une photo ou une vidéo.'); return; }
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      try {
        var M = 1280, sc = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        nwPhotoClear();
        NW.photo = c.toDataURL('image/jpeg', 0.82);
        $('#nwPrevImg').src = NW.photo; $('#nwPrev').hidden = false;
      } catch (e) { nwErr('Photo illisible.'); }
      URL.revokeObjectURL(url);
    };
    im.onerror = function () { URL.revokeObjectURL(url); nwErr('Photo illisible.'); };
    im.src = url;
  }
  async function nwPublish() {
    var ta = $('#nwText'), text = ta.value.trim(), btn = $('#nwPost'), real = NW.pubAs === 'real', label0 = btn.textContent;
    nwErr('');
    if (banGuard()) return;
    if (NW.busy) return;
    if (text.length < 3 && !NW.photo && !NW.video) { nwErr('Écris au moins quelques mots ou ajoute une photo ou une vidéo.'); return; }
    if (Date.now() - NW.last < 30000) { nwErr('Patiente quelques secondes avant de publier autre chose.'); return; }
    NW.busy = true; btn.disabled = true;
    try {
      var id = real ? null : await nwIdentity();
      var imgUrl = '', vidUrl = '';
      if (NW.photo) {
        btn.textContent = 'Envoi…';
        var up = await cloudUp(NW.photo, 'image');
        if (!up) { nwErr('Envoi de la photo impossible' + (CLD_ERR ? ' (' + CLD_ERR + ')' : '') + '. Réessaie.'); NW.busy = false; btn.disabled = false; btn.textContent = label0; return; }
        imgUrl = up;
      }
      if (NW.video) {
        btn.textContent = 'Envoi de la vidéo…';
        var uv = await cloudUp(NW.video, 'video', NW.video.name);
        if (!uv) { nwErr('Envoi de la vidéo impossible' + (CLD_ERR ? ' (' + CLD_ERR + ')' : '') + '. Réessaie.'); NW.busy = false; btn.disabled = false; btn.textContent = label0; return; }
        vidUrl = uv;
      }
      var ref = LC().doc(), b = fs.batch(), ts = Date.now(), noText = imgUrl ? '📷 Photo' : '🎬 Vidéo';
      var ldata = real
        ? { kind: 'real', uid: state.me, name: myName(), alias: cap(myName()), text: (text || noText).slice(0, 600), ts: ts, likes: {}, reports: {} }
        : { alias: id.name, emoji: id.emoji, hue: id.hue, text: (text || noText).slice(0, 600), ts: ts, likes: {}, reports: {} };
      if (imgUrl) ldata.img = imgUrl;
      if (vidUrl) ldata.vid = vidUrl;
      b.set(ref, ldata);
      b.set(fs.collection('letterOwners').doc(ref.id), { uid: state.me, ts: ts });
      await b.commit();
      ta.value = ''; $('#nwCount').textContent = '0 / 600'; NW.last = ts; nwPhotoClear(); pushNews(text || (vidUrl ? '🎬 Vidéo' : '📷 Photo'));
    } catch (e) { nwErr('Publication impossible (règles Firestore : voir « letters » et « letterOwners »).'); }
    NW.busy = false; btn.disabled = false; btn.textContent = label0;
  }




/* E'cho — js/app/24-actualites-commentaires.js
   Commentaires (réels et anonymes), commentaire vocal
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- commentaires (profils réels + anonymes) ---------- */
  function nwNb(it) { var c = NW.cm[it.id]; return c && c.loaded && !c.failed ? c.items.length : (it.cc || 0); }
  function nwCmToggle(it) {
    var c = NW.cm[it.id];
    if (NW.open[it.id]) { NW.open[it.id] = false; if (c && c.unsub) c.unsub(); delete NW.cm[it.id]; nwRender(); return; }
    NW.open[it.id] = true;
    c = NW.cm[it.id] = { items: [], loaded: false, failed: false, unsub: null };
    c.unsub = LC().doc(it.id).collection('comments').orderBy('ts', 'asc').limit(100).onSnapshot(function (sn) {
      c.items = sn.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; }); c.loaded = true; c.failed = false; nwRender();
    }, function () { c.loaded = true; c.failed = true; nwRender(); });
    nwRender();
  }
  function nwCmBox(it) {
    var c = NW.cm[it.id], creator = creatorOn(), box = el('div', 'nwcm');
    if (!c.loaded) box.appendChild(el('small', 'hint', 'Chargement…'));
    else if (c.failed) box.appendChild(el('small', 'hint', 'Commentaires indisponibles (règles Firestore : sous-collection « comments »).'));
    else if (!c.items.length) box.appendChild(el('small', 'hint', 'Aucun commentaire. Sois le premier !'));
    c.items.forEach(function (cm) {
      var real = cm.kind === 'real', mine = real ? cm.uid === state.me : !!NW.mine[cm.id];
      var row = el('div', 'nwc' + (cm.re && cm.re.id ? ' nwre' : '')), av = el('span', 'nwav'), body = el('div', 'nwcb'), top = el('div', 'nwct');
      row.dataset.cid = cm.id;
      if (real) { paintPhoto(av, cm.uid, cm.name); loadPhoto(cm.uid); } else nwAv(av, cm);
      var nmb = el('b', null, real ? cap(cm.name) : (cm.alias || 'Anonyme'));
      if (real) { withBadge(nmb, cm.uid); ensureBadge(cm.uid); }
      top.appendChild(nmb);
      top.appendChild(el('span', 'nwtag' + (real ? ' real' : ''), real ? 'Profil' : 'Anonyme'));
      top.appendChild(el('small', null, nwAgo(cm.ts || 0)));
      body.appendChild(top);
      if (cm.re && cm.re.id) {
        var rf = el('button', 'nwrefrom', '↪ en réponse à @' + (cm.re.n || '?')); rf.type = 'button';
        rf.addEventListener('click', function () {
          var rows = box.querySelectorAll('.nwc'), tg = null;
          for (var i = 0; i < rows.length; i++) if (rows[i].dataset.cid === cm.re.id) { tg = rows[i]; break; }
          if (!tg) return;
          tg.scrollIntoView({ block: 'center', behavior: 'smooth' });
          tg.classList.add('flash'); setTimeout(function () { tg.classList.remove('flash'); }, 1400);
        });
        body.appendChild(rf);
      }
      if (typeof cm.audio === 'string' && (isCld(cm.audio) || cm.audio.indexOf('data:audio/') === 0)) body.appendChild(voiceUI(cm));
      else body.appendChild(el('p', 'nwtext', cm.text || ''));
      var ac = el('div', 'nwacts');
      ac.appendChild(nwRxBtn(cm, 'c:' + cm.id, LC().doc(it.id).collection('comments').doc(cm.id)));
      var rb = el('button', 'vact', '↩ Répondre'); rb.type = 'button';
      rb.addEventListener('click', function () {
        var h = real ? cm.name : (cm.alias || 'Anonyme');
        NW.replyTo[it.id] = { id: cm.id, n: h };
        var d = NW.draft[it.id] || '';
        NW.draft[it.id] = '@' + h + ' ' + d.replace(/^@\S+\s*/, '');
        nwRender();
        var f = nwFeed.querySelector('input[data-lid="' + it.id + '"]');
        if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} }
      });
      ac.appendChild(rb);
      if (!real && !mine) {
        var d = el('button', 'vact', '🎭 Discuter'); d.type = 'button';
        d.addEventListener('click', function () { atStart(cm.id, { name: cm.alias, emoji: cm.emoji, hue: cm.hue }); });
        ac.appendChild(d);
      }
      if (real && !mine) {
        var tz = el('button', 'vact', '🎭 Taquiner'); tz.type = 'button';
        tz.title = 'Lui écrire en anonyme';
        tz.addEventListener('click', function () { atStart('u:' + cm.uid, { name: cm.name, emoji: atInitial(cm.name), hue: atHue(cm.name) }, cm.uid); });
        ac.appendChild(tz);
      }
      if (mine || creator) {
        var x = el('button', 'vact vd', 'Supprimer'); x.type = 'button';
        x.addEventListener('click', function () { nwCmDelete(it, cm); });
        ac.appendChild(x);
      }
      if (NW.pick === 'c:' + cm.id) ac.appendChild(nwFresh(nwPickEl(cm, LC().doc(it.id).collection('comments').doc(cm.id)), 'c:' + cm.id));
      if (ac.children.length) body.appendChild(ac);
      row.appendChild(av); row.appendChild(body); box.appendChild(row);
    });
    var as = el('div', 'nwas');
    [['anon', '🎭 Anonyme'], ['real', '👤 ' + cap(myName())]].forEach(function (o) {
      var b = el('button', 'vact', o[1]); b.type = 'button'; b.setAttribute('aria-pressed', NW.as === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { NW.as = o[0]; nwRender(); });
      as.appendChild(b);
    });
    box.appendChild(as);
    var rt = NW.replyTo[it.id];
    if (rt && c.items.some(function (x) { return x.id === rt.id; })) {
      var rbar = el('div', 'nwrebar'), rsp = el('span', '', '↪ Réponse à @' + rt.n), rx = el('button', '', '✕');
      rx.type = 'button'; rx.setAttribute('aria-label', 'Annuler la réponse');
      rx.addEventListener('click', function () {
        delete NW.replyTo[it.id];
        NW.draft[it.id] = (NW.draft[it.id] || '').replace(/^@\S+\s*/, '');
        nwRender();
      });
      rbar.appendChild(rsp); rbar.appendChild(rx); box.appendChild(rbar);
    } else if (rt) delete NW.replyTo[it.id];
    var line = el('div', 'nwcin'), inp = el('input', 'nwcinput'), go = el('button', 'nwpost', 'Envoyer');
    var mk = el('button', 'vact nwcmic'); mk.type = 'button'; mk.dataset.nwrec = it.id;
    mk.setAttribute('aria-label', 'Commentaire vocal');
    mk.textContent = (NW.rec && NW.rec.lid === it.id) ? '⏹ ' + fmtDur((Date.now() - NW.rec.t0) / 1000) : '🎙️';
    mk.classList.toggle('on', !!(NW.rec && NW.rec.lid === it.id));
    mk.addEventListener('click', function () { nwRecToggle(it); });
    inp.type = 'text'; inp.maxLength = 300; inp.placeholder = NW.as === 'real' ? 'Commenter avec ton profil…' : 'Commenter en anonyme…';
    inp.value = NW.draft[it.id] || ''; inp.dataset.lid = it.id; go.type = 'button';
    inp.addEventListener('input', function () { NW.draft[it.id] = inp.value; });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nwCmSend(it, inp); } });
    go.addEventListener('click', function () { nwCmSend(it, inp); });
    line.appendChild(inp); line.appendChild(mk); line.appendChild(go); box.appendChild(line);
    return box;
  }
  /* ---------- commentaire vocal : on appuie pour enregistrer, on rappuie pour envoyer (45 s max) ---------- */
  var NW_REC_MAX = 45;
  function nwRecTick() {
    var r = NW.rec; if (!r) return;
    var sec = (Date.now() - r.t0) / 1000;
    var bs = document.querySelectorAll('button[data-nwrec="' + r.lid + '"]');
    for (var i = 0; i < bs.length; i++) bs[i].textContent = '⏹ ' + fmtDur(sec);
    if (sec >= NW_REC_MAX) nwRecStop(false);
  }
  function nwRecStop(cancel) {
    var r = NW.rec; if (!r) return;
    r.cancelled = !!cancel; clearInterval(r.timer);
    try { if (r.mr.state !== 'inactive') r.mr.stop(); else nwRecDone(r); } catch (e) { nwRecDone(r); }
  }
  function nwRecDone(r) {
    clearInterval(r.timer);
    try { r.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    if (NW.rec === r) NW.rec = null;
    nwRender();
    if (r.cancelled) return;
    var dur = (Date.now() - r.t0) / 1000;
    if (dur < 0.7 || !r.chunks.length) { nwErr('Vocal trop court.'); return; }
    var blob = new Blob(r.chunks, { type: (r.mr && r.mr.mimeType) || 'audio/webm' });
    if (blob.size > 650000) { nwErr('Vocal trop long.'); return; }
    var fr = new FileReader();
    fr.onload = function () { nwCmSend(r.it, null, { data: String(fr.result), dur: dur }); };
    fr.readAsDataURL(blob);
  }
  async function nwRecToggle(it) {
    nwErr('');
    if (NW.rec) { if (NW.rec.lid === it.id) nwRecStop(false); return; }
    if (NW.busy || banGuard()) return;
    var mime = pickMime();
    if (mime === null || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { nwErr('Ton navigateur ne permet pas d’enregistrer un vocal.'); return; }
    var stream;
    try { stream = await getMic({ audio: true }); } catch (e) { nwErr('Micro refusé. Autorise le micro pour ce site dans le navigateur.'); return; }
    var opts = { audioBitsPerSecond: 24000 }; if (mime) opts.mimeType = mime;
    var mr;
    try { mr = new MediaRecorder(stream, opts); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); nwErr('L’enregistrement n’a pas pu démarrer.'); return; }
    var r = { mr: mr, chunks: [], stream: stream, t0: Date.now(), cancelled: false, lid: it.id, it: it, timer: null };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = function () { nwRecDone(r); };
    mr.start(); NW.rec = r; r.timer = setInterval(nwRecTick, 250);
    nwRender();
  }
  async function nwCmSend(it, inp, voice) {
    var text = voice ? '🎤 Commentaire vocal' : inp.value.trim();
    nwErr('');
    if (!text || NW.busy) return;
    if (banGuard()) return;
    if (Date.now() - NW.cmLast < 4000) { nwErr('Patiente quelques secondes entre deux commentaires.'); return; }
    NW.busy = true;
    try {
      var real = NW.as === 'real', id = real ? null : await nwIdentity(), ts = Date.now();
      var ref = LC().doc(it.id).collection('comments').doc(), b = fs.batch();
      var rt = NW.replyTo[it.id], data = real ? { kind: 'real', uid: state.me, name: myName(), text: text.slice(0, 300), ts: ts }
                      : { kind: 'anon', alias: id.name, emoji: id.emoji, hue: id.hue, text: text.slice(0, 300), ts: ts };
      if (rt) data.re = { id: rt.id, n: String(rt.n).slice(0, 40) };
      if (voice) {
        var aud = await cloudUp(voice.data, 'auto');
        if (!aud) { if (voice.data.length > 600000) throw new Error('upload'); aud = voice.data; }
        data.audio = aud; data.dur = Math.round(voice.dur);
      }
      b.set(ref, data);
      if (!real) b.set(fs.collection('letterOwners').doc(ref.id), { uid: state.me, ts: ts, letter: it.id });
      await b.commit();
      if (!voice) NW.draft[it.id] = ''; delete NW.replyTo[it.id]; NW.cmLast = ts;
      LC().doc(it.id).update({ cc: firebase.firestore.FieldValue.increment(1) }).catch(function () {});
    } catch (e) { nwErr('Commentaire impossible (règles Firestore : voir « comments » dans les règles).'); }
    NW.busy = false; nwRender();
  }
  function nwCmDelete(it, cm) {
    if (!confirm('Supprimer ce commentaire ?')) return;
    LC().doc(it.id).collection('comments').doc(cm.id).delete()
      .then(function () {
        if (cm.kind !== 'real') fs.collection('letterOwners').doc(cm.id).delete().catch(function () {});
        LC().doc(it.id).update({ cc: firebase.firestore.FieldValue.increment(-1) }).catch(function () {});
      }).catch(function () { nwErr('Suppression impossible (connexion ou règles Firestore).'); });
  }




/* E'cho — js/app/25-discussions-anonymes.js
   Discussions entre profils anonymes
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- discussions entre profils anonymes ---------- */
  var AT = { items: [], unsub: null, reqU: [], sig: '', cur: null, msgU: null, pane: 'feed', failed: false, selfU: null };
  /* les profils réels peuvent recevoir des messages d'anonymes (taquineries) ; on peut le refuser */
  function atOptKey() { return 'uandi-noanon-' + state.me; }
  function atOptIn() { try { return localStorage.getItem(atOptKey()) !== '1'; } catch (e) { return true; } }
  function atOptPaint() {
    var b = $('#atOptBtn'); if (!b) return;
    var on = atOptIn();
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? '🎭 Les anonymes peuvent me taquiner ✓' : '🚫 Les anonymes ne peuvent pas m’écrire';
  }
  function atTErr(t) { var e = $('#atTErr'); if (!e) return; e.textContent = t || ''; e.hidden = !t; }
  function atInitial(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }
  function atHue(name) { var h = 0, i; name = String(name || ''); for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }
  function atSeenKey(id) { return 'uandi-atseen:' + state.me + ':' + id; }
  function atSeen(id) { try { return +localStorage.getItem(atSeenKey(id)) || 0; } catch (e) { return 0; } }
  function atMark(id, ts) { try { localStorage.setItem(atSeenKey(id), String(ts || Date.now())); } catch (e) {} }
  function atUnread(t) { return !!t.lastUid && t.lastUid !== state.me && (t.lastTs || 0) > atSeen(t.id); }
  function atOther(t) { return (t.a === state.me ? t.bAlias : t.aAlias) || { name: 'Anonyme', emoji: '👤', hue: 0 }; }
  function atStop() {
    [AT.unsub, AT.msgU, AT.selfU].concat(AT.reqU).forEach(function (u) { if (u) { try { u(); } catch (e) {} } });
    AT.unsub = null; AT.msgU = null; AT.selfU = null; AT.reqU = []; AT.sig = ''; AT.items = []; AT.cur = null; AT.pane = 'feed';
  }
  /* demandes adressées à mon profil réel : 'u:' + mon uid */
  function atSelfWatch() {
    if (AT.selfU) return;
    AT.selfU = fs.collection('anonRequests').where('addr', '==', 'u:' + state.me).onSnapshot(function (sn) {
      sn.docs.forEach(function (d) {
        if (!atOptIn()) { d.ref.delete().catch(function () {}); return; }
        fs.collection('anonThreads').doc(d.id).update({ b: state.me, members: firebase.firestore.FieldValue.arrayUnion(state.me) })
          .then(function () { return d.ref.delete(); }).catch(function () {});
      });
    }, function () {});
  }
  function atListen() {
    if (newsBlocked()) return;
    atSelfWatch();
    if (AT.unsub) return;
    AT.unsub = fs.collection('anonThreads').where('members', 'array-contains', state.me).onSnapshot(function (sn) {
      AT.failed = false;
      AT.items = sn.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; }).sort(function (a, b) { return (b.lastTs || 0) - (a.lastTs || 0); });
      atPaint();
    }, function () { AT.failed = true; atPaint(); });
  }
  /* le propriétaire d'une lettre/commentaire reçoit les demandes de discussion et les accepte */
  function atWatch() {
    if (newsBlocked()) return;
    var ret = atRetired(), ids = Object.keys(NW.mine).filter(function (k) { return ret.indexOf(k) === -1; }).sort(), sig = ids.join(',');
    if (sig === AT.sig) return;
    AT.sig = sig;
    AT.reqU.forEach(function (u) { try { u(); } catch (e) {} }); AT.reqU = [];
    for (var i = 0; i < ids.length; i += 10) (function (ch) {
      AT.reqU.push(fs.collection('anonRequests').where('addr', 'in', ch).onSnapshot(function (sn) {
        sn.docs.forEach(function (d) {
          fs.collection('anonThreads').doc(d.id).update({ b: state.me, members: firebase.firestore.FieldValue.arrayUnion(state.me) })
            .then(function () { return d.ref.delete(); }).catch(function () {});
        });
      }, function () {}));
    })(ids.slice(i, i + 10));
  }
  function atPaint() {
    var dot = $('#atDot'), any = AT.items.some(atUnread);
    if (dot) dot.hidden = !any || AT.pane === 'threads';
    var list = $('#atList');
    if (!list) return;
    list.textContent = '';
    if (AT.failed) { list.appendChild(el('p', 'hint', 'Discussions indisponibles (règles Firestore : « anonThreads » et « anonRequests »).')); return; }
    atOptPaint();
    if (!AT.items.length) { list.appendChild(el('p', 'hint', 'Aucune discussion. Touche « 🎭 Discuter » sur une lettre anonyme, ou « 🎭 Taquiner » sur le commentaire d’un profil (ou tape son identifiant ci-dessus).')); return; }
    AT.items.forEach(function (t) {
      var o = atOther(t), row = el('button', 'atrow' + (atUnread(t) ? ' unread' : '')), av = el('span', 'nwav'), box = el('div');
      row.type = 'button'; nwAv(av, o);
      box.appendChild(el('b', null, o.name)); box.appendChild(el('small', null, t.lastText || (t.b ? 'Dis bonjour !' : 'En attente de réponse…')));
      row.appendChild(av); row.appendChild(box);
      row.addEventListener('click', function () { atOpen(t.id); });
      list.appendChild(row);
    });
    if (AT.cur) atHead();
  }
  function atHead() {
    var t = AT.items.filter(function (x) { return x.id === AT.cur; })[0];
    if (!t) return;
    var o = atOther(t); nwAv($('#atAv'), o); $('#atName').textContent = o.name;
  }
  function nwPane(p) {
    AT.pane = p;
    ['Feed', 'Threads', 'Thread'].forEach(function (k) { $('#nwPane' + k).hidden = k.toLowerCase() !== p; });
    document.querySelectorAll('.nwtab').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.p === (p === 'thread' ? 'threads' : p) ? 'true' : 'false'); });
    if (p !== 'thread' && AT.msgU) { AT.msgU(); AT.msgU = null; AT.cur = null; }
    if (p !== 'feed') { atListen(); atPaint(); }
  }
  function atOpen(tid) {
    if (AT.msgU) { AT.msgU(); AT.msgU = null; }
    AT.cur = tid; $('#atErr').hidden = true; $('#atMsgs').textContent = '';
    nwPane('thread'); atHead();
    AT.msgU = fs.collection('anonThreads').doc(tid).collection('messages').orderBy('ts', 'asc').limit(200).onSnapshot(function (sn) {
      var box = $('#atMsgs'), last = 0;
      box.textContent = '';
      sn.docs.forEach(function (d) {
        var m = d.data(); last = Math.max(last, m.ts || 0);
        box.appendChild(el('div', 'atm' + (m.uid === state.me ? ' me' : ''), m.text || ''));
      });
      if (!sn.docs.length) {
        var tt = AT.items.filter(function (x) { return x.id === tid; })[0], tease = !!(tt && String(tt.addr || '').indexOf('u:') === 0);
        box.appendChild(el('p', 'hint', !tease ? 'Personne ne connaît ton identité. Écris le premier message !'
          : (tt.a === state.me ? 'Tu es anonyme : ' + atOther(tt).name + ' ne sait pas qui tu es. Taquine gentiment 😄' : 'Un anonyme veut te taquiner. Reste cool, tu peux ne pas répondre.')));
      }
      box.scrollTop = box.scrollHeight;
      atMark(tid, Math.max(last, Date.now()));
    }, function () { var e = $('#atErr'); e.textContent = 'Messages indisponibles (règles Firestore).'; e.hidden = false; });
  }
  async function atStart(addr, alias, realUid) {
    nwErr(''); atTErr('');
    var me0 = null;
    try { me0 = await nwIdentity(); } catch (e) {}
    /* une discussion = une adresse + une identité anonyme : si tu as changé de nom, on en ouvre une nouvelle */
    var ex = AT.items.filter(function (t) { return t.addr === addr && t.a === state.me && (!me0 || !t.aAlias || t.aAlias.name === me0.name); })[0];
    if (ex) { atOpen(ex.id); return; }
    if (realUid) {
      if (banGuard()) { atTErr($('#nwErr').textContent); return; }
      if (realUid === state.me) { atTErr('Tu ne peux pas te taquiner toi-même.'); return; }
      try {
        var pd = await fs.collection('presence').doc(realUid).get();
        if (pd.exists && pd.data().noAnon === true) { var m1 = 'Cette personne n’accepte pas les messages anonymes.'; atTErr(m1); nwErr(m1); return; }
      } catch (e) {}
    }
    try {
      var id = await nwIdentity(), ref = fs.collection('anonThreads').doc(), ts = Date.now(), b = fs.batch();
      b.set(ref, { addr: addr, a: state.me, b: null, members: [state.me], ts: ts, lastText: '', lastTs: ts, lastUid: '',
        aAlias: { name: id.name, emoji: id.emoji, hue: id.hue },
        bAlias: { name: alias.name || 'Anonyme', emoji: alias.emoji || '👤', hue: alias.hue || 0 } });
      b.set(fs.collection('anonRequests').doc(ref.id), { addr: addr, ts: ts });
      await b.commit();
      atListen(); atOpen(ref.id);
    } catch (e) { var m2 = 'Discussion impossible (règles Firestore : « anonThreads » et « anonRequests »).'; nwErr(m2); atTErr(m2); }
  }
  /* taquiner un profil réel depuis son identifiant */
  $('#atTeaseForm').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var inp = $('#atTeaseWho'), name = inp.value.trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
    atTErr('');
    if (!name) return;
    if (name === state.username) { atTErr('C’est ton propre identifiant.'); return; }
    if (!NAME_RE.test(name)) { atTErr('Cet identifiant n’est pas valide.'); return; }
    try {
      var snap = await fs.collection('usernames').doc(name).get();
      if (!snap.exists) { atTErr('Aucun utilisateur ne s’appelle « ' + name + ' ».'); return; }
      inp.value = '';
      var uid = snap.data().uid;
      await atStart('u:' + uid, { name: name, emoji: atInitial(name), hue: atHue(name) }, uid);
    } catch (e) { atTErr('Recherche impossible. Vérifie ta connexion et les règles Firestore.'); }
  });
  $('#atOptBtn').addEventListener('click', function () {
    var on = !atOptIn();
    try { if (on) localStorage.removeItem(atOptKey()); else localStorage.setItem(atOptKey(), '1'); } catch (e) {}
    fs.collection('presence').doc(state.me).set({ noAnon: on ? firebase.firestore.FieldValue.delete() : true }, { merge: true }).catch(function () {});
    atOptPaint();
  });
  async function atSend() {
    var inp = $('#atText'), text = inp.value.trim();
    if (!text || !AT.cur) return;
    inp.value = '';
    var ref = fs.collection('anonThreads').doc(AT.cur), ts = Date.now(), b = fs.batch();
    b.set(ref.collection('messages').doc(), { uid: state.me, text: text.slice(0, 600), ts: ts });
    b.update(ref, { lastText: text.slice(0, 60), lastTs: ts, lastUid: state.me });
    try { await b.commit(); }
    catch (e) { inp.value = text; var er = $('#atErr'); er.textContent = 'Envoi impossible (connexion ou règles Firestore).'; er.hidden = false; }
  }
  document.addEventListener('click', function (e) {
    var tb = e.target.closest && e.target.closest('.nwtab');
    if (tb) nwPane(tb.dataset.p);
  });
  $('#atSend').addEventListener('click', atSend);
  $('#atText').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); atSend(); } });

  function openNews() {
    if (newsBlocked()) return;
    leaveChat(); stopGame();
    pushView({ news: true });
    state.view = 'news';
    if (NW.uid !== state.me) { nwStop(); NW.uid = state.me; }
    viewList.hidden = true; viewChat.hidden = true; viewGame.hidden = true; viewMusic.hidden = true; viewNews.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    nwErr('');
    nwListen(); nwRender(); nwAudPaint(); atListen(); nwPane('feed');
    nwIdentity().then(nwPaintId);
  }
  $('#openNews').addEventListener('click', openNews);
  $('#nwBack').addEventListener('click', function () {
    var forced = this.dataset.force; delete this.dataset.force;
    if (!forced && AT.pane === 'thread') { nwPane('threads'); return; }
    if (!forced && AT.pane === 'threads') { nwPane('feed'); return; }
    if (history.state && history.state.news) history.back(); else showList();
  });
  $('#nwPost').addEventListener('click', nwPublish);
  $('#nwPhoto').addEventListener('click', function () { $('#nwFile').click(); });
  $('#nwFile').addEventListener('change', function () { nwPhotoPick(this.files && this.files[0]); });
  $('#nwPrevX').addEventListener('click', nwPhotoClear);
  (function () {
    var box = document.querySelector('#nwPaneFeed .nwid'), tg = $('#nwIdToggle');
    if (!box || !tg) return;
    function set(min) {
      box.classList.toggle('min', min);
      tg.textContent = min ? '👁️' : '🙈';
      tg.setAttribute('aria-pressed', min ? 'true' : 'false');
      tg.setAttribute('aria-label', min ? 'Afficher le nom et le bouton Changer' : 'Masquer le nom et le bouton Changer');
    }
    var on = false; try { on = localStorage.getItem('uandi-nwid-min') === '1'; } catch (e) {}
    set(on);
    tg.addEventListener('click', function () {
      var min = !box.classList.contains('min'); set(min);
      try { localStorage.setItem('uandi-nwid-min', min ? '1' : '0'); } catch (e) {}
    });
  })();
  $('#nwText').addEventListener('input', function () { $('#nwCount').textContent = this.value.length + ' / 600'; });
  /* changement d'identité : on efface les discussions anonymes lancées avec l'ancien nom et tes messages dans les autres ; les lettres et commentaires restent */
  function atRetKey() { return 'uandi-anonret-' + state.me; }
  function atRetired() { try { return JSON.parse(localStorage.getItem(atRetKey()) || '[]'); } catch (e) { return []; } }
  /* les anciennes lettres/commentaires ne sont plus reliés à toi : on ne reçoit plus de discussions dessus */
  function atRetire() {
    var all = atRetired();
    Object.keys(NW.mine).forEach(function (k) { if (all.indexOf(k) === -1) all.push(k); });
    try { localStorage.setItem(atRetKey(), JSON.stringify(all)); } catch (e) {}
    AT.sig = '';
  }
  async function atWipe() {
    var sn = await fs.collection('anonThreads').where('members', 'array-contains', state.me).get(), ops = [];
    for (var i = 0; i < sn.docs.length; i++) {
      var d = sn.docs[i], ms = await d.ref.collection('messages').get();
      ms.forEach(function (m) { ops.push(m.ref); });
      ops.push(d.ref); ops.push(fs.collection('anonRequests').doc(d.id));
      try { localStorage.removeItem(atSeenKey(d.id)); } catch (e) {}
    }
    for (var j = 0; j < ops.length; j += 400) {
      var b = fs.batch();
      ops.slice(j, j + 400).forEach(function (r) { b.delete(r); });
      try { await b.commit(); } catch (e) { for (var k = j; k < Math.min(j + 400, ops.length); k++) { try { await ops[k].delete(); } catch (e2) {} } }
    }
  }
  $('#nwReroll').addEventListener('click', async function () {
    if (!confirm('Changer d’identité anonyme ? Tu repars comme une autre personne : toutes tes discussions anonymes sont effacées et tu ne recevras plus de discussions sur tes anciennes lettres. Elles restent publiées avec l’ancien nom.')) return;
    var btn = this; btn.disabled = true;
    try {
      if (AT.msgU) { AT.msgU(); AT.msgU = null; }
      if (AT.pane === 'thread') nwPane('threads');
      await atWipe();
    } catch (e) { nwErr('Certains messages n’ont pas pu être effacés (règles Firestore : autorise la suppression dans « anonThreads »).'); }
    atRetire(); NW.id = nwMake(); nwSaveId(); nwPaintId(); atWatch();
    btn.disabled = false;
  });

  function openMusic() {
    leaveChat(); stopGame();
    pushView({ music: true });
    state.view = 'music';
    viewList.hidden = true; viewChat.hidden = true; viewGame.hidden = true; viewMusic.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    mLoad(); mRender(); try { mShStart(); } catch (e) {}
  }
  $('#openMusic').addEventListener('click', openMusic);
  $('#musicBack').addEventListener('click', function () {
    if (history.state && history.state.music) history.back(); else showList();
  });
  $('#mAdd').addEventListener('click', function () { $('#mFiles').click(); });
  $('#mFiles').addEventListener('change', function (e) {
    var fl = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (fl.length) mAdd(fl);
  });
  $('#mPlay').addEventListener('click', mToggle);
  $('#mNext').addEventListener('click', function () { mNext(false); });
  $('#mPrev').addEventListener('click', mPrev);
  $('#mShuffle').addEventListener('click', function () { M.shuffle = !M.shuffle; mRender(); });
  $('#mRepeat').addEventListener('click', function () {
    M.repeat = M.repeat === 'off' ? 'all' : M.repeat === 'all' ? 'one' : 'off';
    mRender();
  });
  $('#mSeek').addEventListener('input', function () {
    var d = mAu.duration;
    if (isFinite(d) && d > 0) { M.seekAt = Date.now(); mAu.currentTime = this.value / 1000 * d; }
  });
  function mSaveEdit() {
    var t = M.tracks[M.edit];
    M.edit = -1;
    if (t) {
      t.title = M.draft.trim().slice(0, 80);
      if (typeof t.id === 'number') {
        mTx('readwrite', function (st) {
          var r = st.get(t.id);
          r.onsuccess = function () { var v = r.result; if (v) { v.title = t.title; st.put(v); } };
          return r;
        }).catch(function () {});
      }
      mMeta();
    }
    mRender();
  }
  $('#mList').addEventListener('input', function (e) {
    if (e.target.classList.contains('mfield')) M.draft = e.target.value;
  });
  $('#mList').addEventListener('keydown', function (e) {
    if (!e.target.classList.contains('mfield')) return;
    if (e.key === 'Enter') { e.preventDefault(); mSaveEdit(); }
    else if (e.key === 'Escape') { M.edit = -1; mRender(); }
  });
  $('#mList').addEventListener('click', function (e) {
    if (e.target.closest('.mok')) { mSaveEdit(); return; }
    var rn = e.target.closest('.mren');
    if (rn) {
      var k = +rn.dataset.i;
      M.edit = k; M.draft = mLabel(M.tracks[k]); M.focusEdit = true;
      mRender();
      return;
    }
    var shb = e.target.closest('.mshare');
    if (shb) { mShareAsk(+shb.dataset.i); return; }
    var d = e.target.closest('.mdel');
    if (d) { mRemove(+d.dataset.i); return; }
    var b = e.target.closest('.mname');
    if (b) { var i = +b.dataset.i; if (i === M.cur) mToggle(); else mPlay(i); }
  });
  $('#mClear').addEventListener('click', function () {
    var b = this;
    if (!b.classList.contains('sure')) {
      b.classList.add('sure'); b.textContent = 'Confirmer ?';
      mClearT = setTimeout(resetMClear, 3000);
      return;
    }
    resetMClear();
    M.tracks.forEach(function (t) { try { URL.revokeObjectURL(t.url); } catch (e) {} });
    M.tracks = []; M.cur = -1; M.edit = -1;
    mAu.pause(); mAu.removeAttribute('src'); mAu.load();
    mTx('readwrite', function (st) { return st.clear(); }).catch(function () {});
    mMeta(); mRender(); mTime();
  });
  ['timeupdate', 'loadedmetadata', 'durationchange'].forEach(function (ev) { mAu.addEventListener(ev, mTime); });
  ['play', 'pause'].forEach(function (ev) { mAu.addEventListener(ev, mRender); });
  mAu.addEventListener('ended', function () { mNext(true); });
  mAu.addEventListener('error', function () {
    var t = M.tracks[M.cur];
    if (!t) return;
    if (t.remote && !t.fb) {
      t.fb = true; mMsg('Chargement de « ' + mLabel(t) + ' »…');
      mGetBlob(t.url).then(function (b) {
        if (!b) { mMsg('Impossible de lire « ' + mLabel(t) + ' » : le lien du cloud ne répond pas.'); return; }
        var f = (b.type && b.type.indexOf('audio/') === 0) ? b : b.slice(0, b.size, 'audio/mpeg');
        t.url = URL.createObjectURL(f);
        if (M.tracks[M.cur] === t) { mAu.src = t.url; var p = mAu.play(); if (p && p.catch) p.catch(function () {}); }
      });
      return;
    }
    mMsg('Impossible de lire « ' + mLabel(t) + ' ».');
  });
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', mToggle);
      navigator.mediaSession.setActionHandler('pause', mToggle);
      navigator.mediaSession.setActionHandler('previoustrack', mPrev);
      navigator.mediaSession.setActionHandler('nexttrack', function () { mNext(false); });
    }
  } catch (e) {}




/* E'cho — js/app/26-session-approbation.js
   Installation (PWA), session, approbation des nouveaux comptes
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- installation de l'appli (PWA) ---------- */
  var installEv = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEv = e;
    $('#installSec').hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    installEv = null;
    $('#installSec').hidden = true;
  });
  var isStandalone = false; try { isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) {}
  if (!isStandalone) $('#installSec').hidden = false;
  $('#installBtn').addEventListener('click', function () {
    var ev = installEv;
    if (!ev) {
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      alert(ios ? 'Sur iPhone : touche le bouton Partager de Safari, puis « Sur l’écran d’accueil ».' : 'Ouvre le menu ⋮ de ton navigateur puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).');
      return;
    }
    ev.prompt();
    ev.userChoice.then(function () {}, function () {}).then(function () {
      installEv = null;
    });
  });

  /* ---------- session ---------- */
  async function ensureDirectory(uid, username) {
    try {
      var ref = fs.collection('usernames').doc(username);
      var s = await ref.get();
      if (!s.exists) await ref.set({ uid: uid });
    } catch (e) {}
  }

  function startSession(user) {
    stopSession();
    state.me = user.uid;
    state.deleting = false;
    state.username = String(user.email || '').split('@')[0];
    state.nick = ''; state.nickAt = 0; state.nickLog = [];
    try { var nk = JSON.parse(store('uandi-nick-' + user.uid) || 'null'); if (nk) { state.nick = String(nk.n || ''); state.nickAt = +nk.t || 0; state.nickLog = Array.isArray(nk.l) ? nk.l.map(Number).filter(Boolean) : (nk.t ? [+nk.t] : []); } } catch (e) {}
    state.chats = []; state.chatsById = {}; state.chatsLoaded = false; knownTs = {};
    loginEl.hidden = true;
    appEl.hidden = false;
    state.view = 'list';
    viewChat.hidden = true;
    viewList.hidden = false;
    renderList();
    /* Accueil = Actualités : s'ouvre au démarrage (sauf mode discret, où l'onglet est masqué) */
    try { var hn = document.getElementById('openNews'); if (!(window.EchoShorts && window.EchoShorts.open())) { if (hn && !(window.newsBlocked && window.newsBlocked())) hn.click(); } } catch (e) {}
    ensureDirectory(user.uid, state.username);
    lkCheck();

    unsubChats = fs.collection('chats').where('members', 'array-contains', state.me).onSnapshot(function (snap) {
      var byId = {};
      var firstSnap = !state.chatsLoaded;
      snap.docChanges().forEach(function (ch) {
        if (ch.type === 'removed') return;
        var v = ch.doc.data(), id = ch.doc.id, prev = knownTs[id] || 0;
        knownTs[id] = v.lastTs || 0;
        if (firstSnap || !v.lastUid || v.lastUid === state.me || !(v.lastTs > prev)) return;
        if (((v.seen && v.seen[state.me]) || 0) >= v.lastTs) return;
        if (state.chat && state.chat.id === id) return;
        incomingElsewhere(id, v);
      });
      state.chats = snap.docs.map(function (d) {
        var v = d.data(); v.id = d.id; byId[d.id] = true; return v;
      });
      state.chatsById = byId;
      state.chatsLoaded = true;
      if (PENDING_CHAT && openChatById(PENDING_CHAT)) { PENDING_CHAT = ''; try { history.replaceState(history.state, '', location.pathname); } catch (e) {} }
      callWatch(state.chats);
      if (state.chat) {
        var cc = state.chats.filter(function (x) { return x.id === state.chat.id; })[0];
        if (state.chat.group) {
          if (cc) {
            state.chat.name = cc.title || 'Groupe'; $('#chatName').textContent = cap(state.chat.name);
            paintPhoto($('#chatAvatar'), '', state.chat.name); renderStatus();
            if (giDlg.open) renderGroupInfo();
          }
        } else {
        var nn = cc && (nickOf(cc, state.chat.other) || (cc.names && cc.names[state.chat.other]));
        if (nn && nn !== state.chat.name) { state.chat.name = nn; $('#chatName').textContent = cap(nn); paintPhoto($('#chatAvatar'), state.chat.other, nn); }
        }
      }
      watchNotes();
      frWatchPres();
      if (state.view === 'list') renderList();
      updateTitle();
    }, function () {
      state.chatsLoaded = true;
      state.chats = [];
      renderList();
      showNewErr('Impossible de charger les discussions. Vérifie que les règles Firestore sont publiées.');
    });

    FR.unsub = fs.collection('friendships').where('members', 'array-contains', state.me).onSnapshot(function (sn) {
      var firstFr = !FR.loaded; FR.loaded = true;
      if (!firstFr) sn.docChanges().forEach(function (ch) {
        var v = ch.doc.data();
        if (ch.type === 'added' && v.status === 'pending' && v.from !== state.me) notifyFriendReq(v);
      });
      FR.list = sn.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; });
      frWatchPres(); frBadge(); bdayPaint();
      if (frDlg.open) frRender();
      if (ucDlg.open) ucRender();
    }, function () {});

    annStart();
    beat();
    hbTimer = setInterval(beat, 120000);
    stTimer = setInterval(function () { if (!document.hidden) renderStatus(); }, 2000);
    clearInterval(noteTimer);
    noteTimer = setInterval(function () { if (!document.hidden && state.view === 'list') renderList(); }, 60000);
  }

  function stopSession() {
    leaveChat();
    stopGame();
    hideToast();
    viewMusic.hidden = true;
    nwStop();
    liveStop();
    callClose();
    resetMusic();
    viewGame.hidden = true;
    if (unsubChats) unsubChats(); unsubChats = null;
    if (FR.unsub) FR.unsub(); FR.unsub = null; annStop(); FR.loaded = false;
    Object.keys(FR.presU).forEach(function (u) { try { FR.presU[u](); } catch (e) {} });
    FR.presU = {}; FR.pres = {}; FR.list = [];
    clearInterval(hbTimer); clearInterval(stTimer); clearInterval(noteTimer);
    Object.keys(noteSubs).forEach(function (k) { try { noteSubs[k](); } catch (e) {} });
    noteSubs = {}; notePres = {};
    if (AP.unsub) { try { AP.unsub(); } catch (e) {} AP.unsub = null; } AP.items = []; AP.first = true;
    state.me = null;
  }

  /* ---------- approbation des nouveaux comptes par le créateur ---------- */
  var apNew = false, AP = { items: [], unsub: null, first: true, auto: false, since: 0, setU: null, done: {} }, AG = { unsub: null };
  var AP_FN = 'https://dazzling-horse-f6d13a.netlify.app/.netlify/functions/push';
  function apPaint() {
    var b = $('#apBtn'); if (!b) return;
    b.textContent = 'Comptes à approuver' + (AP.items.length ? ' (' + AP.items.length + ')' : '');
  }
  /* approbation automatique : les comptes créés pendant la période activée sont acceptés tout seuls */
  function apAutoPaint() {
    var b = $('#apAuto'); if (!b) return;
    b.setAttribute('aria-pressed', AP.auto ? 'true' : 'false');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><path d="M13 3L5 13.500h6L10 21l8-10.500h-6z"/></svg>'; b.appendChild(document.createTextNode(AP.auto ? 'Approbation automatique : activée (touche pour arrêter)' : 'Approbation automatique : désactivée'));
  }
  function apStrictPaint() {
    var b = $('#apStrict'); if (!b) return;
    b.setAttribute('aria-pressed', AP.strict ? 'true' : 'false');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'; b.appendChild(document.createTextNode(AP.strict ? 'Mode strict : activé (touche pour désactiver)' : 'Mode strict : désactivé'));
  }
  $('#apStrict').addEventListener('click', function () {
    if (!creatorOn()) return;
    var on = !AP.strict, b = this;
    if (on && !confirm('Activer le mode strict ? Tout compte SANS approbation enregistrée sera bloqué. Lance d’abord « Approuver les comptes existants ».')) return;
    b.disabled = true;
    fs.collection('settings').doc('approval').set({ strict: on, strictBy: state.me, strictAt: Date.now() }, { merge: true })
      .catch(function () { showToast(null, 'Mode strict', 'Impossible : règles Firestore (écriture de « settings/approval »).'); })
      .then(function () { b.disabled = false; });
  });
  $('#apMig').addEventListener('click', async function () {
    if (!creatorOn()) return;
    var b = this, lbl = b.textContent; b.disabled = true; b.textContent = 'Migration…';
    try {
      var r = await Promise.all([fs.collection('usernames').get(), fs.collection('approvals').get()]);
      var have = {}, todo = [], seen = {};
      r[1].forEach(function (d) { have[d.id] = 1; });
      r[0].forEach(function (d) {
        var u = (d.data() || {}).uid;
        if (u && !have[u] && !seen[u]) { seen[u] = 1; todo.push({ uid: u, name: String(d.id).slice(0, 20) }); }
      });
      if (!have[state.me] && !seen[state.me]) todo.push({ uid: state.me, name: String(state.username || 'createur').slice(0, 20) });
      for (var i = 0; i < todo.length; i += 400) {
        var bt = fs.batch(), now = Date.now();
        todo.slice(i, i + 400).forEach(function (t) {
          bt.set(fs.collection('approvals').doc(t.uid), { name: t.name, status: 'approved', ts: now, by: state.me, ats: now, legacy: true });
        });
        await bt.commit();
      }
      b.textContent = todo.length + ' compte(s) approuvé(s) ✓';
    } catch (e) {
      b.textContent = 'Échec : publie d’abord les nouvelles règles Firestore';
    }
    setTimeout(function () { b.textContent = lbl; b.disabled = false; }, 4000);
  });
  function apAutoRun() {
    if (!AP.auto) return;
    AP.items.forEach(function (it) {
      if ((it.ts || 0) >= (AP.since || 0) && !AP.done[it.id]) { AP.done[it.id] = 1; apDecide(it.id, 'approved'); }
    });
  }
  $('#apAuto').addEventListener('click', function () {
    if (!creatorOn()) return;
    var on = !AP.auto, b = this; b.disabled = true;
    fs.collection('settings').doc('approval').set({ auto: on, since: Date.now(), by: state.me }, { merge: true })
      .catch(function () { showToast(null, 'Approbation auto', 'Impossible : règles Firestore (écriture de « settings/approval »).'); })
      .then(function () { b.disabled = false; });
  });
  function apCheck() {
    if (!state.me) return;
    if (!creatorOn()) {
      if (AP.unsub) { AP.unsub(); AP.unsub = null; }
      if (AP.setU) { AP.setU(); AP.setU = null; }
      AP.items = []; AP.auto = false; AP.done = {}; apPaint(); apAutoPaint(); return;
    }
    if (!AP.setU) {
      AP.setU = fs.collection('settings').doc('approval').onSnapshot(function (d) {
        var v = d.exists ? d.data() : {}, was = AP.auto;
        AP.auto = v.auto === true; AP.since = v.since || 0; AP.strict = v.strict === true; apStrictPaint();
        if (!AP.auto || !was) AP.done = {};
        apAutoPaint(); apAutoRun();
      }, function () {});
    }
    if (AP.unsub) return;
    AP.first = true;
    AP.unsub = fs.collection('approvals').where('status', '==', 'pending').onSnapshot(function (sn) {
      AP.items = sn.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; }).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      if (AP.first) { if (AP.items.length) showToast(null, 'Approbation', AP.items.length + ' compte' + (AP.items.length > 1 ? 's' : '') + ' en attente'); }
      else sn.docChanges().forEach(function (ch) {
        if (ch.type !== 'added') return;
        try { beep(); if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
        if (AP.auto && (ch.doc.data().ts || 0) >= (AP.since || 0)) return;
        showToast(null, 'Nouveau compte', cap(ch.doc.data().name || '') + ' attend ton approbation');
      });
      AP.first = false;
      apPaint(); apAutoRun();
      if (crDlg.open && CR.mode === 'ap') apRender();
    }, function () {});
  }
  function apDecide(id, st) {
    fs.collection('approvals').doc(id).update({ status: st, by: state.me, ats: Date.now() }).catch(function () { crErr('Action impossible (règles Firestore).'); });
  }
  function apRender() {
    var box = $('#crBody'); box.replaceChildren();
    if (!AP.items.length) { box.appendChild(el('p', 'hint', 'Aucun compte en attente.')); return; }
    AP.items.forEach(function (it) {
      var r = el('div', 'frrow aprow'), mid = el('div', 'frmid'), bx = el('div', 'frbtns');
      mid.appendChild(el('b', '', cap(it.name || '?')));
      mid.appendChild(el('small', '', it.ts ? new Date(it.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''));
      var ok = el('button', 'ghost', 'Approuver'), okc = el('button', 'ghost', 'Approuver + certifier'), no = el('button', 'ghost', 'Refuser'); ok.type = okc.type = no.type = 'button';
      ok.addEventListener('click', function () { apDecide(it.id, 'approved'); });
      okc.addEventListener('click', function () {
        fs.collection('presence').doc(it.id).set({ verified: true }, { merge: true })
          .then(function () { apDecide(it.id, 'approved'); })
          .catch(function () { crErr('Certification impossible (règles Firestore).'); });
      });
      no.addEventListener('click', function () { apDecide(it.id, 'rejected'); });
      bx.appendChild(ok); bx.appendChild(okc); bx.appendChild(no); r.appendChild(mid); r.appendChild(bx); box.appendChild(r);
    });
  }
  function apStop() { if (AG.unsub) { AG.unsub(); AG.unsub = null; } $('#apWait').hidden = true; }
  function apStrict() {
    return fs.collection('settings').doc('approval').get().then(function (d) { return d.exists && d.data().strict === true; });
  }
  function apShow(user, st) {
    stopSession();
    loginEl.hidden = true; appEl.hidden = true; $('#apWait').hidden = false;
    var rt = $('#apRetry');
    var paint = function (s) {
      $('#apMsg').textContent = s === 'rejected' ? 'Ton compte n’a pas été accepté par le créateur.'
        : s === 'error' ? 'Impossible de vérifier ton compte pour le moment. Vérifie ta connexion puis réessaie.'
        : 'Approbation par le créateur. Attends un instant…';
      rt.hidden = s !== 'error';
    };
    paint(st);
    if (st === 'error') return;
    var ref = fs.collection('approvals').doc(user.uid), creating = false;
    AG.unsub = ref.onSnapshot(function (d) {
      if (d.exists) {
        var s = d.data().status;
        if (s === 'approved') { apStop(); startSession(user); } else paint(s);
        return;
      }
      if (creating) return;
      creating = true;
      apStrict().then(function (strict) {
        if (!strict) { apStop(); startSession(user); return; }
        return ref.set({ name: String(user.email || '').split('@')[0].slice(0, 20), status: 'pending', ts: Date.now() }).then(function () { paint('pending'); });
      }).catch(function () { creating = false; paint('error'); });
    }, function () { paint('error'); });
  }
  function approvalGate(user) {
    apStop();
    var fresh = apNew; apNew = false;
    var ref = fs.collection('approvals').doc(user.uid);
    var nm = String(user.email || '').split('@')[0].slice(0, 20);
    var first = fresh
      ? fs.collection('settings').doc('approval').get()
          .then(function (d) { return d.exists && d.data().auto === true; }).catch(function () { return false; })
          .then(function (auto) {
            if (!auto) return ref.set({ name: nm, status: 'pending', ts: Date.now() }).then(function () { return 'pending'; });
            return ref.set({ name: nm, status: 'approved', auto: true, ts: Date.now() }).then(function () { return 'approved'; })
              .catch(function () { return ref.set({ name: nm, status: 'pending', ts: Date.now() }).then(function () { return 'pending'; }); });
          })
      : ref.get().then(function (d) {
          if (d.exists) return d.data().status;
          return apStrict().then(function (strict) {
            if (!strict) return 'approved';
            return ref.set({ name: nm, status: 'pending', ts: Date.now() }).then(function () { return 'pending'; });
          });
        });
    first.catch(function () { return 'error'; }).then(function (st) {
      if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
      if (st === 'approved') { startSession(user); return; }
      apShow(user, st);
      if (fresh && st === 'pending') {
        user.getIdToken().then(function (t) {
          return fetch(AP_FN, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t, type: 'approval' }) });
        }).catch(function () {});
      }
    });
  }
  $('#apRetry').addEventListener('click', function () { if (auth.currentUser) approvalGate(auth.currentUser); });
  $('#apOut').addEventListener('click', function () { auth.signOut(); });

  var AUTH_SEEN = false;
  setTimeout(function () {
    if (AUTH_SEEN) return;
    var tried = false;
    try { tried = sessionStorage.getItem('uandi-authretry') === '1'; sessionStorage.setItem('uandi-authretry', '1'); } catch (e) {}
    if (!tried) { location.reload(); return; }
    loginEl.hidden = false;
    setAuthErr('Connexion impossible : le navigateur bloque le stockage du site. Quitte la navigation privée, ferme l’onglet puis rouvre le site.');
  }, 7000);



/* E'cho — js/app/27-push.js
   Notifications push (FCM via le Worker ui-push)
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- notifications push (FCM via le Worker « ui-push ») ---------- */
  var PUSH = { url: ((CFG.push || {}).workerUrl || '').replace(/\/+$/, ''), key: (CFG.push || {}).vapidKey || '', token: null };
  if (PUSH.url.indexOf('COLLE') !== -1) PUSH.url = '';
  function pushCall(path, body) {
    return auth.currentUser.getIdToken().then(function (tok) {
      return fetch(PUSH.url + path, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    });
  }
  function pushLoadMsg() {
    if (window.firebase && firebase.messaging) return Promise.resolve(true);
    return new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js';
      s.onload = function () { ok(true); }; s.onerror = function () { ok(false); };
      setTimeout(function () { ok(false); }, 10000);
      document.head.appendChild(s);
    });
  }
  async function pushSetup() {
    PUSH.err = '';
    try {
      if (!PUSH.url || !PUSH.key) { PUSH.err = 'adresse du Worker ou clé VAPID manquante'; return; }
      if (!auth.currentUser) { PUSH.err = 'pas connecté'; return; }
      if (!('serviceWorker' in navigator) || !('Notification' in window)) { PUSH.err = 'navigateur sans notifications (ouvre dans Chrome / appli installée)'; return; }
      if (Notification.permission !== 'granted') { PUSH.err = 'permission notifications = ' + Notification.permission + ' (à autoriser dans les réglages du site)'; return; }
      if (!(await pushLoadMsg()) || !firebase.messaging.isSupported || !(await firebase.messaging.isSupported())) { PUSH.err = 'Firebase Messaging indisponible'; return; }
      var reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
      await navigator.serviceWorker.ready;
      var t = await firebase.messaging().getToken({ vapidKey: PUSH.key, serviceWorkerRegistration: reg });
      if (!t) { PUSH.err = 'jeton FCM vide'; return; }
      var r = await pushCall('/register', { token: t });
      if (!r.ok) { PUSH.err = 'le Worker a refusé l’enregistrement (HTTP ' + r.status + ')'; return; }
      PUSH.token = t;
    } catch (e) { PUSH.err = (e && (e.code || e.message)) || String(e); }
    finally { try { npPaint(); } catch (e2) {} }
  }
  function pushReport() {
    try { showToast(null, 'E\'cho', (PUSH.token ? 'Push OK ✅ jeton enregistré' : 'Push KO ❌ ' + PUSH.err) + (PUSH.lastSend ? ' · dernier envoi : ' + PUSH.lastSend : '')); } catch (e) {}
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('firebase-messaging-sw.js').catch(function () {});
  function pushUnreg() {
    if (!PUSH.token || !auth.currentUser) return Promise.resolve();
    var t = PUSH.token; PUSH.token = null;
    return Promise.race([pushCall('/unregister', { token: t }), new Promise(function (ok) { setTimeout(ok, 2500); })]).catch(function () {});
  }
  function pushNotify(chat, text) {
    try {
      if (!PUSH.url || !chat) return;
      var c = chatOf(chat.id) || {};
      var to = (c.members || [state.me, chat.other]).filter(function (u) { return u && u !== state.me; });
      if (!to.length) return;
      pushCall('/notify', { to: to, title: NOTIF_TITLE, body: cap(myName()) + ' : ' + text, chat: chat.id }).then(function (r) { PUSH.lastSend = 'message HTTP ' + r.status; }).catch(function (e) { PUSH.lastSend = 'message erreur ' + ((e && (e.code || e.message)) || e); });
    } catch (e) {}
  }
  function pushNews(text) {
    try {
      if (!PUSH.url || !auth.currentUser) return;
      /* fil certifiés : on prévient les comptes certifiés / assistants / créateur ; fil non certifiés : tous les autres */
      var certFeed = NW.col !== 'lettersN';
      var cq = ['verified', 'assistant', 'badge'].map(function (f) { return fs.collection('presence').where(f, '==', true).get().catch(function () { return null; }); });
      Promise.all([fs.collection('usernames').get()].concat(cq)).then(function (r) {
        if (r.slice(1).some(function (x) { return !x; })) return;
        var cert = {}; r.slice(1).forEach(function (sn) { sn.forEach(function (d) { cert[d.id] = 1; }); });
        var to = []; r[0].forEach(function (d) { var v = d.data(); if (v && typeof v.uid === 'string' && v.uid !== state.me && (!!cert[v.uid] === certFeed)) to.push(v.uid); });
        if (!to.length) return;
        return pushCall('/notify', { to: to, title: 'E\'cho \uD83D\uDCF0', body: 'Nouvelle lettre dans l\u2019actualit\u00e9 : ' + String(text || '').slice(0, 80), chat: 'news' })
          .then(function (r) { PUSH.lastSend = 'actualit\u00e9 HTTP ' + r.status; });
      }).catch(function (e) { PUSH.lastSend = 'actualit\u00e9 erreur ' + ((e && (e.code || e.message)) || e); });
    } catch (e) {}
  }
  auth.onAuthStateChanged(function (user) {
    AUTH_SEEN = true;
    if (user) setTimeout(pushSetup, 3000);
    try { sessionStorage.removeItem('uandi-authretry'); } catch (e) {}
    if (user) {
      approvalGate(user);
    } else {
      apStop();
      stopSession();
      appEl.hidden = true;
      loginEl.hidden = false;
      $('#p').value = ''; $('#p2').value = '';
      document.title = BASE_TITLE;
    }
  });



/* E'cho — js/app/28-recuperation-email.js
   E-mail de récupération (demande + confirmation par code) et « mot de passe oublié » par code envoyé par e-mail
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- adresse du Worker « ui-recovery » ---------- */
  function emUrl() {
    var u = String(((CFG.recovery || {}).workerUrl) || '').replace(/\/+$/, '');
    return (!u || u.indexOf('COLLE') !== -1) ? '' : u;
  }
  function emCall(path, body, authed) {
    var url = emUrl();
    if (!url) return Promise.reject({ off: true });
    function go(tok) {
      var h = { 'Content-Type': 'application/json' };
      if (tok) h.Authorization = 'Bearer ' + tok;
      return fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._ok = r.ok; return j; }); });
    }
    return authed ? auth.currentUser.getIdToken().then(go) : go(null);
  }
  function emMsg(j) {
    var e = j && j.error;
    return e === 'wait' ? 'Attends une minute avant de demander un nouveau code.' :
      e === 'bad-email' ? 'Cette adresse e-mail n’est pas valide.' :
      e === 'mail' ? 'Le message n’a pas pu être envoyé. Réessaie dans un instant.' :
      e === 'bad-code' ? 'Code incorrect ou expiré.' :
      e === 'weak' ? 'Le mot de passe doit faire au moins 6 caractères.' :
      e === 'auth' ? 'Session expirée : reconnecte-toi puis réessaie.' :
      'Une erreur est survenue. Vérifie ta connexion et réessaie.';
  }
  function emFail(e) { return (e && e.off) ? 'Cette fonction n’est pas encore activée.' : 'Pas de connexion au serveur. Réessaie.'; }

  /* ---------- mot de passe oublié : code par e-mail ---------- */
  function fmErr(t) { var e = $('#fmErr'); e.textContent = t || ''; e.hidden = !t; }
  function fmName() { return $('#fmU').value.trim().toLowerCase().replace(/\s+/g, ''); }
  function fmSendCode(resend) {
    var n = fmName(), b = resend ? $('#fmResend') : $('#fmSend');
    fmErr('');
    if (!NAME_RE.test(n)) { fmErr('Entre ton nom d’utilisateur.'); return; }
    b.disabled = true;
    emCall('/forgot/start', { username: n }, false).then(function (j) {
      if (!j._ok) { fmErr(emMsg(j)); return; }
      $('#fmInfo').textContent = 'Si ce compte a un e-mail de récupération, un code à 6 chiffres vient d’y être envoyé. Il est valable 10 minutes.';
      $('#fmStep2').hidden = false; $('#fmSend').hidden = true; $('#fmU').readOnly = true;
      $('#fmNone').hidden = false;
      setTimeout(function () { $('#fmC').focus(); }, 50);
    }).catch(function (e) { fmErr(emFail(e)); }).then(function () { b.disabled = false; });
  }
  $('#fmSend').addEventListener('click', function () { fmSendCode(false); });
  $('#fmResend').addEventListener('click', function () { fmSendCode(true); });
  $('#forgotMail').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = fmName(), code = $('#fmC').value.replace(/\D/g, ''), p1 = $('#fmP').value, p2 = $('#fmP2').value, b = $('#fmGo');
    fmErr('');
    if ($('#fmStep2').hidden) { fmSendCode(false); return; }
    if (code.length !== 6) { fmErr('Entre le code à 6 chiffres reçu par e-mail.'); return; }
    if (p1.length < 6) { fmErr('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (p1 !== p2) { fmErr('Les deux mots de passe ne sont pas identiques.'); return; }
    b.disabled = true;
    emCall('/forgot/reset', { username: n, code: code, password: p1 }, false).then(function (j) {
      if (!j._ok) { fmErr(emMsg(j)); return; }
      /* mot de passe changé : on connecte directement la personne avec le nouveau */
      return auth.signInWithEmailAndPassword(n + '@' + CFG.emailDomain, p1).then(function () {
        /* l’ancien code de récupération (qui contenait l’ancien mot de passe) n’est plus valable */
        fs.collection('recovery').doc(n).delete().catch(function () {});
        fmReset();
      }).catch(function () {
        fmReset(); forgotShow(null); setAuthErr('Mot de passe changé. Connecte-toi avec le nouveau.');
      });
    }).catch(function (e) { fmErr(emFail(e)); }).then(function () { b.disabled = false; });
  });
  function fmReset() {
    ['#fmU', '#fmC', '#fmP', '#fmP2'].forEach(function (s) { $(s).value = ''; });
    $('#fmU').readOnly = false; $('#fmStep2').hidden = true; $('#fmSend').hidden = false; $('#fmNone').hidden = true; fmErr('');
  }

  /* ---------- e-mail de récupération : ajout + confirmation par code ---------- */
  var emDlg = $('#emDlg'), emStep = 1, emPending = '';
  function emErr(t) { var e = $('#emErr'); e.textContent = t || ''; e.hidden = !t; }
  function emOpen() {
    emStep = 1; emPending = '';
    $('#emStep1').hidden = false; $('#emStep2').hidden = true;
    $('#emInput').value = ''; $('#emCode').value = ''; $('#emGo').textContent = 'Envoyer le code'; $('#emGo').disabled = false;
    emErr('');
    if (!emDlg.open) emDlg.showModal();
    setTimeout(function () { $('#emInput').focus(); }, 60);
  }
  function emSkipSet() { try { store('uandi-emskip-' + state.me, String(Date.now())); } catch (e) {} }
  $('#emOpen').addEventListener('click', emOpen);
  $('#emLater').addEventListener('click', function () { emSkipSet(); emDlg.close(); });
  emDlg.addEventListener('click', function (e) { if (e.target === emDlg) { emSkipSet(); emDlg.close(); } });
  $('#emGo').addEventListener('click', function () {
    var b = $('#emGo'); emErr('');
    if (emStep === 1) {
      var mail = $('#emInput').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { emErr('Entre une adresse e-mail valide.'); return; }
      b.disabled = true;
      emCall('/email/start', { email: mail }, true).then(function (j) {
        if (!j._ok) { emErr(emMsg(j)); return; }
        emStep = 2; emPending = mail;
        $('#emStep1').hidden = true; $('#emStep2').hidden = false;
        $('#emSent').textContent = 'Un code à 6 chiffres vient d’être envoyé à ' + mail + '. Regarde aussi dans les courriers indésirables.';
        b.textContent = 'Confirmer';
        setTimeout(function () { $('#emCode').focus(); }, 60);
      }).catch(function (e) { emErr(emFail(e)); }).then(function () { b.disabled = false; });
    } else {
      var code = $('#emCode').value.replace(/\D/g, '');
      if (code.length !== 6) { emErr('Entre le code à 6 chiffres.'); return; }
      b.disabled = true;
      emCall('/email/confirm', { code: code }, true).then(function (j) {
        if (!j._ok) { emErr(emMsg(j)); return; }
        emDlg.close(); emRefresh();
        try { showToast(null, 'E\'cho', 'E-mail de récupération enregistré ✅'); } catch (e) {}
      }).catch(function (e) { emErr(emFail(e)); }).then(function () { b.disabled = false; });
    }
  });
  $('#emDel').addEventListener('click', function () {
    if (!window.confirm('Retirer ton e-mail de récupération ? Tu ne pourras plus recevoir de code par e-mail.')) return;
    emCall('/email/remove', {}, true).then(function () { emRefresh(); }).catch(function () {});
  });

  /* section des réglages */
  function emRefresh() {
    var sec = $('#emSec');
    if (!emUrl()) { sec.hidden = true; return Promise.resolve(null); }
    sec.hidden = false;
    if (!auth.currentUser) return Promise.resolve(null);
    return emCall('/email/status', undefined, true).then(function (j) {
      if (!j._ok) { $('#emStat').textContent = 'Indisponible pour le moment.'; return null; }
      $('#emStat').textContent = j.has ? 'E-mail enregistré : ' + j.masked : 'Aucun e-mail de récupération.';
      $('#emOpen').textContent = j.has ? 'Changer l’e-mail' : 'Ajouter un e-mail';
      $('#emDel').hidden = !j.has;
      return j;
    }).catch(function () { $('#emStat').textContent = 'Indisponible pour le moment.'; return null; });
  }

  /* demande automatique après la connexion (pas plus d’une fois tous les 3 jours si « Plus tard ») */
  auth.onAuthStateChanged(function (user) {
    if (!user) return;
    setTimeout(function () {
      if (!emUrl() || appEl.hidden || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
      emRefresh().then(function (j) {
        if (!j || j.has || document.querySelector('dialog[open]')) return;
        var last = +(store('uandi-emskip-' + user.uid) || 0);
        if (Date.now() - last < 3 * 24 * 3600 * 1000) return;
        emOpen();
      });
    }, 4500);
  });



};
