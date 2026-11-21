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

  var configured = !!(CFG && CFG.supabase && CFG.supabase.url && CFG.supabase.key
    && String(CFG.supabase.url).indexOf('COLLE') !== 0 && window.supabase);
  if (!configured) {
    loginEl.hidden = false;
    authBtn.disabled = true;
    setAuthErr('Configuration manquante : vérifie config.js (url et clé Supabase).');
    return;
  }

  var SB = window.supabase.createClient(CFG.supabase.url, CFG.supabase.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  window.__sb = SB;   /* partagé avec profil.js, stories, jeux… (un seul client = une seule session) */
  var IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

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
  function SV() { return new Date().toISOString(); }
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
    var mailOn = !!emUrl();
    $('#sgMail').hidden = !(signup && mailOn); $('#sgMailLabel').hidden = !(signup && mailOn);
    $('#uLabel').textContent = signup ? 'Nom d’utilisateur' : (mailOn ? 'E-mail ou nom d’utilisateur' : 'Nom d’utilisateur');
    sgReset();
    authBtn.textContent = signup ? (mailOn ? 'Recevoir le code par e-mail' : 'Créer mon compte') : 'Entrer';
    setAuthErr('');
  }
  tabLogin.addEventListener('click', function () { setMode('login'); });
  tabSignup.addEventListener('click', function () { setMode('signup'); });

  /* ---------- inscription avec e-mail (code de vérification) + connexion par e-mail ou nom ---------- */
  var sg = { stage: 1, mail: '', ticket: '' };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function sgReset() {
    sg.stage = 1; sg.mail = ''; sg.ticket = '';
    var s2 = $('#sgStep2'); if (s2) { s2.hidden = true; $('#sgCode').value = ''; }
    var m = $('#sgMail'); if (m) m.readOnly = false;
  }
  function sgSend() {
    var mail = $('#sgMail').value.trim().toLowerCase();
    authBtn.disabled = true;
    emCall('/signup/start', { email: mail }, false).then(function (j) {
      if (!j._ok) { setAuthErr(emMsg(j)); return; }
      sg.stage = 2; sg.mail = mail; sg.ticket = '';
      $('#sgInfo').textContent = 'Un code à 6 chiffres vient d’être envoyé à ' + mail + '. Il est valable 10 minutes. Regarde aussi dans les indésirables.';
      $('#sgStep2').hidden = false; $('#sgMail').readOnly = true;
      authBtn.textContent = 'Valider et créer mon compte';
      setTimeout(function () { $('#sgCode').focus(); }, 50);
    }).catch(function (e) { setAuthErr(emFail(e)); }).then(function () { authBtn.disabled = false; });
  }
  $('#sgEdit').addEventListener('click', function () {
    var mail = $('#sgMail').value.trim().toLowerCase();
    setAuthErr('');
    if (!sg.ticket && sg.stage === 2 && mail === sg.mail) { sgSend(); return; }   /* renvoie le code */
    sgReset(); authBtn.textContent = 'Recevoir le code par e-mail'; $('#sgMail').focus();   /* sinon on change d’e-mail */
  });

  function authGo(name, pass, signup, ticket) {
    if (!signup) {
      var wait = lkLeft(name);
      if (wait > 0) { setAuthErr('Trop d’essais. Réessaie dans ' + lkText(wait) + '.'); return; }
    }
    authBtn.disabled = true;
    var email = name + '@' + CFG.emailDomain;
    apNew = signup;
    var p = signup
      ? SB.auth.signUp({ email: email, password: pass, options: { data: { username: name } } }).then(function (r) {
          if (r.error) throw r.error;
          if (ticket) emCall('/email/attach', { ticket: ticket }, true).then(function (j) { if (j && j._ok) sgReset(); }).catch(function () {});
          return r;
        })
      : SB.auth.signInWithPassword({ email: email, password: pass }).then(function (r) {
          if (r.error) throw r.error;
          lkOk(name);
          return r;
        });
    p.catch(function (e) {
      var c = (e && e.code) || '';
      var net = !!e && (e.status === 0 || e.name === 'AuthRetryableFetchError' || /failed to fetch|network/i.test(String(e.message || '')));
      if (!signup && /^(invalid_credentials|user_not_found)$/.test(c)) {
        lkFail(name);
        var w = lkLeft(name);
        if (w > 0) { setAuthErr('Trop d’essais. Réessaie dans ' + lkText(w) + '.'); return; }
      }
      setAuthErr(
        /^(user_already_exists|email_exists)$/.test(c) ? 'Ce nom d’utilisateur est déjà pris. Change-le : ton e-mail est déjà vérifié.' :
        c === 'weak_password' ? 'Le mot de passe doit faire au moins 6 caractères.' :
        /^over_(request|email_send)_rate_limit$/.test(c) ? 'Trop d’essais. Réessaie dans quelques minutes.' :
        net ? 'Pas de connexion internet.' :
        /^(signup_disabled|email_provider_disabled)$/.test(c) ? 'La connexion par e-mail et mot de passe n’est pas activée dans Supabase.' :
        c === 'email_address_invalid' ? 'Nom d’utilisateur refusé : Supabase n’accepte pas le domaine e-mail (change emailDomain dans config.js).' :
        signup ? 'Le compte n’a pas pu être créé.' : (emUrl() ? 'Identifiant ou mot de passe incorrect.' : 'Nom d’utilisateur ou mot de passe incorrect.'));
    }).then(function () { authBtn.disabled = false; });
  }


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
      if (!emUrl()) { authGo(name, pass, true, ''); return; }     /* service e-mail non activé : comme avant */
      var mail = $('#sgMail').value.trim().toLowerCase();
      if (!EMAIL_RE.test(mail) || mail.length > 120) { setAuthErr('Entre une adresse e-mail valide.'); return; }
      if (sg.ticket && sg.mail === mail) { authGo(name, pass, true, sg.ticket); return; }   /* e-mail déjà vérifié : on retente avec un autre nom */
      if (sg.stage !== 2 || sg.mail !== mail) { sgSend(); return; }
      var code = $('#sgCode').value.replace(/\D/g, '');
      if (code.length !== 6) { setAuthErr('Entre le code à 6 chiffres reçu par e-mail.'); return; }
      authBtn.disabled = true;
      emCall('/signup/verify', { email: mail, code: code }, false).then(function (j) {
        authBtn.disabled = false;
        if (!j._ok || !j.ticket) { setAuthErr(emMsg(j)); return; }
        sg.ticket = j.ticket;
        authGo(name, pass, true, j.ticket);
      }).catch(function (e) { authBtn.disabled = false; setAuthErr(emFail(e)); });
      return;
    }
    /* connexion : e-mail ou nom d’utilisateur */
    if (!name || !pass) return;
    if (name.indexOf('@') > -1) {
      if (!emUrl()) { setAuthErr('La connexion par e-mail n’est pas encore activée.'); return; }
      authBtn.disabled = true;
      emCall('/login/resolve', { email: name }, false).then(function (j) {
        authBtn.disabled = false;
        if (j && j._ok && j.username) { authGo(j.username, pass, false, ''); return; }
        setAuthErr(j && j.error === 'rate' ? 'Trop d’essais. Réessaie dans quelques minutes.' : 'Identifiant ou mot de passe incorrect.');
      }).catch(function (e) { authBtn.disabled = false; setAuthErr(emFail(e)); });
      return;
    }
    authGo(name, pass, false, '');
  });

  /* fiche presence = ligne de public.profiles */
  var PCOL = { name:'name', seen:'seen', xst:'xst', typingIn:'typing_in', typingAt:'typing_at', hideSeen:'hide_seen', hideOn:'hide_on', bday:'bday', photo:'photo', nick:'nick', nickAt:'nick_at', badge:'badge', bpill:'bpill', bhide:'bhide', bcol:'badge_color', verified:'verified', assistant:'assistant', musicOk:'music_ok', note:'note', noteTs:'note_ts', noteTo:'note_to' };
  var PKEY = {}; Object.keys(PCOL).forEach(function (k) { PKEY[PCOL[k]] = k; });
  var PDEL = null;   /* remplace FieldValue.delete() */
  function presRow(o) { var r = {}; for (var k in o) { if (PCOL[k]) r[PCOL[k]] = o[k] === undefined ? null : o[k]; } return r; }
  function presObj(r) {
    if (!r) return null;
    var o = { uid: r.id, username: r.username };
    Object.keys(PKEY).forEach(function (c) { if (r[c] !== null && r[c] !== undefined) o[PKEY[c]] = r[c]; });
    if (typeof o.name !== 'string' || !o.name) o.name = r.username;
    return o;
  }
  function presSet(uid, o) {
    return SB.from('profiles').update(presRow(o)).eq('id', uid).then(function (r) { if (r.error) throw r.error; return r; });
  }
  function presGet(uid) {
    return SB.from('profiles').select('*').eq('id', uid).maybeSingle().then(function (r) { if (r.error) throw r.error; return presObj(r.data); });
  }
  function presSub(uid, cb) {
    var dead = false;
    presGet(uid).then(function (o) { if (!dead) cb(o); }).catch(function () {});
    var ch = SB.channel('pres-' + uid + '-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.' + uid }, function (p) { if (!dead && p.new) cb(presObj(p.new)); })
      .subscribe();
    return function () { dead = true; SB.removeChannel(ch); };
  }

  /* ---------- pont discussions (Supabase) ---------- */
  var CUID = {};   /* id appli ('uid1_uid2' ou uuid de groupe) -> uuid interne */
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function convUuid(chatId) {
    if (CUID[chatId]) return CUID[chatId];
    if (UUID_RE.test(String(chatId || ''))) { CUID[chatId] = chatId; return chatId; }
    var r = await SB.from('conversations').select('id').eq('dm_key', chatId).maybeSingle();
    if (r.error) throw r.error;
    if (r.data) { CUID[chatId] = r.data.id; return r.data.id; }
    return null;
  }
  /* ligne SQL (conversations + conversation_members) -> ancienne forme de discussion utilisée par l'appli */
  function convToChat(c, mem, nm) {
    var group = c.kind === 'group', id = group ? c.id : c.dm_key, seen = {}, owner = '';
    if (!group && c.dm_key) CUID[c.dm_key] = c.id;
    mem.forEach(function (m) { if (m.last_read_at) seen[m.user_id] = Date.parse(m.last_read_at); if (m.role === 'owner') owner = m.user_id; });
    var o = { id: id, uuid: c.id, group: group, members: mem.map(function (m) { return m.user_id; }), names: nm || {}, seen: seen, owner: owner,
      lastText: c.last_text || '', lastTs: c.last_at ? Date.parse(c.last_at) : 0, lastUid: c.last_sender || '', nicks: c.nicks || {} };
    if (group) { o.group = true; o.title = c.name || ''; if (c.photo_path) o.photo = c.photo_path; }
    if (c.invite_from && c.invite_status) o.invite = { from: c.invite_from, n: c.invite_count || 0, st: c.invite_status };
    return o;
  }
  /* ligne messages (+ réactions) -> ancien format de message */
  function msgFromRow(r, rx) {
    var likes = {}, reacts = {}, f = r.file, a = r.audio, im = r.img;
    (rx || []).forEach(function (x) { if (x.emoji === '\u2764\uFE0F') likes[x.user_id] = true; else reacts[x.user_id] = x.emoji; });
    return { id: String(r.id), uid: r.sender_id, text: r.body || '', ts: Date.parse(r.created_at), likes: likes, reacts: reacts,
      edited: r.edited === true, delAt: r.deleted_at ? Date.parse(r.deleted_at) : 0,
      audio: (typeof a === 'string' && (a.slice(0, 5) === 'data:' || isCld(a))) ? a : null,
      dur: typeof r.dur === 'number' ? r.dur : 0,
      music: typeof r.music === 'string' ? r.music : '',
      img: (typeof im === 'string' && (im.slice(0, 11) === 'data:image/' || isCld(im))) ? im : null,
      file: (f && typeof f.n === 'string' && ((typeof f.d === 'string' && f.d.slice(0, 5) === 'data:') || (typeof f.u === 'string' && isCld(f.u))))
        ? { u: (typeof f.u === 'string' && isCld(f.u)) ? f.u : '', n: String(f.n || 'fichier').slice(0, 120), s: +f.s || 0, d: typeof f.d === 'string' ? f.d : '', g: '', p: 0, loc: 'f', mt: String(f.mt || '').slice(0, 80) } : null,
      reply: (r.reply && typeof r.reply.t === 'string') ? { id: String(r.reply.id || ''), uid: String(r.reply.uid || ''), t: r.reply.t } : null };
  }
  function sbErr(e) {
    var m = String((e && e.message) || ''), x = new Error(m);
    x.code = m;
    if (m.indexOf('invite_declined') > -1) x.inv = 'Cette personne a refusé ton invitation.';
    else if (m.indexOf('invite_max') > -1) x.inv = 'Invitation : ' + INV_MAX + ' messages maximum tant qu\u2019elle n\u2019est pas acceptée.';
    else if (m.indexOf('banned') > -1) x.inv = 'Ton compte est suspendu pour le moment.';
    else if (m.indexOf('blocked') > -1) x.inv = 'Tu ne peux pas écrire à cette personne.';
    return x;
  }
  /* envoi unique pour texte, photo, vocal, fichier : o = { text, img, audio, dur, music, file, reply } */
  async function postMsg(chat, o) {
    var args = { p_body: o.text || '', p_img: o.img || null, p_audio: o.audio || null, p_dur: o.dur == null ? null : o.dur,
      p_music: o.music || null, p_file: o.file || null, p_reply: o.reply || null };
    var r;
    if (chat.group) { args.p_cid = chat.id; r = await SB.rpc('send_message', args); }
    else { args.p_other = chat.other; r = await SB.rpc('send_dm', args); }
    if (r.error) throw sbErr(r.error);
    if (!chat.group && r.data && r.data.conversation_id) CUID[chat.id] = r.data.conversation_id;
    state.chatsById[chat.id] = true;
    if (state.chat && state.chat.id === chat.id && state.kick) state.kick(800);
    try { var pcid = chat.group ? chat.id : (r.data && r.data.conversation_id); if (pcid && window.__xenPing && String(o.text || '').charAt(0) !== SYS) window.__xenPing(pcid); } catch (e) {}
    return r.data;
  }
  /* nettoyage automatique de mes anciens messages (côté serveur, au plus toutes les 10 min) */
  async function idsOf(names) {
    var out = {};
    if (!names.length) return out;
    var r = await SB.from('profiles').select('id,username').in('username', names);
    if (r.error) throw r.error;
    (r.data || []).forEach(function (x) { out[x.username] = x.id; });
    return out;
  }
  function frFromRow(r, nm) { return { id: r.id, members: [r.requester_id, r.addressee_id], names: nm || {}, status: r.status, from: r.requester_id, ts: Date.parse(r.created_at) }; }
  function creatorFlag(uid, flag, on) {
    return SB.rpc('creator_set_flag', { p_uid: uid, p_flag: flag, p_val: !!on }).then(function (r) { if (r.error) throw r.error; });
  }
  var cleanAt = 0;
  function cleanMine() { var n = Date.now(); if (n - cleanAt < 600000) return; cleanAt = n; SB.rpc('cleanup_my_messages').then(function () {}, function () {}); }

  /* ---------- présence ---------- */
  var typingChat = null, typingTimer = null, lastTypingWrite = 0;
  /* style du statut en ligne choisi (X vert / cœur rose) : publié dans la fiche presence pour que les autres le voient */
  function myXs() { try { return localStorage.getItem('xenify-statut-style') === 'heart'; } catch (e) { return false; } }
  window.xenifyStyleChanged = function () { writePresence({}); };
  function writePresence(extra) {
    if (!state.me || state.deleting) return;
    var data = { name: myName(), seen: hideOn() ? 0 : Date.now(), xst: myXs() ? 'heart' : null };
    for (var k in extra) data[k] = extra[k];
    presSet(state.me, data).catch(function () {});
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
    if (p && p.xst === 'heart') statusEl.setAttribute('data-xs', 'heart'); else statusEl.removeAttribute('data-xs');
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
    var mnEl = $('#meName'), mnTxt = (state.nick ? state.nick + ' · ' : '') + '@' + state.username;
    mnEl.textContent = '';
    var mnSp = document.createElement('span'); mnSp.className = 'mn'; mnSp.textContent = mnTxt; mnEl.appendChild(mnSp);
    withBadge(mnEl, state.me);   /* le badge reste hors du texte : c'est le nom qui est raccourci (…), jamais le badge */
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
    sorted = sorted.filter(function (c) { return !(hid[c.id] && (c.lastTs || 0) <= hid[c.id]) && !inviteIn(c) && !isBlockedChat(c); });
    if (state.onlyUnread) sorted = sorted.filter(function (c) { return isUnread(c); });
    if (q) sorted = sorted.filter(function (c) {
      if (c.group) return String(c.title || '').toLowerCase().indexOf(q) !== -1;
      var o = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      return String(nickOf(c, o) || (c.names && c.names[o]) || '').toLowerCase().indexOf(q) !== -1 || String((c.names && c.names[o]) || '').toLowerCase().indexOf(q) !== -1;
    });
    if (!state.chatsLoaded && !sorted.length) { chatsEl.appendChild(el('li', 'loading', 'Chargement des discussions…')); return; }
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
      var avw = el('span', 'avw'); avw.appendChild(av); if (isOnline(other)) { var od = el('i', 'ondot'); if (xsMap[other]) od.setAttribute('data-xs', 'heart'); avw.appendChild(od); }
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
      var r = await SB.from('profiles').select('id').eq('username', name).maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) { showNewErr('Aucun utilisateur ne s’appelle « ' + name + ' ».'); return; }
      var uid = r.data.id;
      if (uid === state.me) { showNewErr('C’est ton propre nom d’utilisateur.'); return; }
      $('#who').value = ''; $('#newChat').hidden = true;
      openUserCard(uid, name);
    } catch (e) {
      showNewErr('Recherche impossible. Vérifie ta connexion et les règles Supabase.');
    }
  });




/* E'cho — js/app/04-amis.js
   Amis, demandes, invitations par message
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- amis, demandes, invitations par message ---------- */
  var FR = { list: [], unsub: null, pres: {}, presU: {}, tab: 'req', sug: { items: [], t: 0, busy: false } };
  var INV_MAX = 5, ONLINE_MS = 150000;
  var frDlg = $('#frDlg'), ucDlg = $('#userCard'), ucT = null;
  function frDoc(uid) {
    var me = state.me, ck = function (r) { if (r.error) throw r.error; return r; };
    return {
      update: function () { return SB.from('friendships').update({ status: 'accepted' }).eq('requester_id', uid).eq('addressee_id', me).then(ck); },
      delete: function () { return SB.from('friendships').delete().or('and(requester_id.eq.' + me + ',addressee_id.eq.' + uid + '),and(requester_id.eq.' + uid + ',addressee_id.eq.' + me + ')').then(ck); },
      set: function () { return SB.from('friendships').insert({ requester_id: me, addressee_id: uid, status: 'pending' }).then(ck); }
    };
  }
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
      FR.presU[u] = presSub(u, function (o) {
        FR.pres[u] = { seen: o ? (o.seen || 0) : 0, bday: o && typeof o.bday === 'string' ? o.bday : null }; bdayPaint();
        if (frDlg.open) frRender();
        if (ucDlg.open) ucRender();
      });
    });
  }
  var seenAt = {}, xsMap = {}, onSig = '';
  function isOnline(u) { var t = Math.max(seenAt[u] || 0, (FR.pres[u] && FR.pres[u].seen) || 0); return !!t && Date.now() - t < ONLINE_MS; }
  function onlineSig() {
    return state.chats.map(function (c) {
      if (c.group) return '';
      var o = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      return o && isOnline(o) ? o + (xsMap[o] ? 'h' : '') : '';
    }).join(',');
  }
  setInterval(function () { if (!document.hidden && state.view === 'list' && onlineSig() !== onSig) renderList(); }, 15000);
  function frFail() { var e = $('#frErr'); e.textContent = 'Action impossible (connexion à vérifier).'; e.hidden = false; }
  function respondInv(c, yes) {
    convUuid(c.id).then(function (u) { if (!u) throw new Error('x'); return SB.rpc('respond_invite', { p_cid: u, p_accept: yes }); })
      .then(function (r) { if (r && r.error) throw r.error; }).catch(frFail);
  }
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
    SB.from('profiles').select('id,name,username,photo').or('verified.eq.true,assistant.eq.true').order('seen', { ascending: false, nullsFirst: false }).limit(40).then(function (r) {
      if (r.error) throw r.error;
      var out = [];
      (r.data || []).forEach(function (v) {
        var u = v.id, nm = v.name || v.username;
        if (u === state.me || !nm || frWith(u)) return;
        if (typeof v.photo === 'string') { photos[u] = v.photo; photoReq[u] = 1; }
        out.push({ uid: u, name: nm });
      });
      if (!out.length) return [];
      /* suggestion seulement avec au moins 5 amis en commun (calculé côté serveur) */
      return SB.rpc('mutual_friend_counts', { p_uids: out.map(function (x) { return x.uid; }) }).then(function (q) {
        var m = {}; (q.data || []).forEach(function (z) { m[z.uid] = z.n; });
        out.forEach(function (x) { x.mutual = m[x.uid] || 0; });
        return out;
      });
    }).then(function (all) {
      var ok = all.filter(function (x) { return x.mutual >= 5; });
      ok.sort(function (a, b) { return b.mutual - a.mutual; });
      FR.sug.items = ok.slice(0, 8); FR.sug.t = Date.now(); FR.sug.busy = false;
      if (frDlg.open) frRender();
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
          ['Accepter', function () { respondInv(c, true); }],
          ['Refuser', function () { respondInv(c, false); }]
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
    presSet(state.me, { hideSeen: on ? true : null }).catch(function () {});
  });
  $('#hideOnBtn').addEventListener('click', function () {
    var on = !hideOn();
    try { localStorage.setItem('uandi-hide-' + state.me, on ? '1' : '0'); } catch (e) {}
    paintHide();
    presSet(state.me, on ? { seen: 0, hideOn: true } : { seen: Date.now(), hideOn: null }).catch(function () {});
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
    function pullA() {
      SB.from('announcements').select('body,ts').eq('id', 'main').maybeSingle().then(function (r) { ANN.data = r.data ? { text: r.data.body, ts: r.data.ts } : null; annPaint(); }, function () {});
      SB.from('bans').select('until_at').eq('user_id', state.me).maybeSingle().then(function (r) { state.banUntil = r.data ? Date.parse(r.data.until_at) : 0; }, function () {});
    }
    pullA();
    var ach = SB.channel('ann-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, pullA)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bans' }, pullA).subscribe();
    ANN.unsub = function () { SB.removeChannel(ach); }; ANN.ban = null;
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
        ok.addEventListener('click', function () { LC().doc(it.id).update({ reports: {} }).catch(function () { crErr('Action impossible (connexion ou droits à vérifier).'); }); });
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
      SB.rpc('creator_set_announcement', { p_text: t.slice(0, 300) }).then(function (r) { if (r.error) throw r.error; crDlg.close(); }).catch(function () { crErr('Impossible de publier (droits ou connexion).'); });
    });
    off.addEventListener('click', function () { SB.rpc('creator_clear_announcement').then(function (r) { if (r.error) throw r.error; crDlg.close(); }).catch(function () { crErr('Impossible (droits ou connexion).'); }); });
    row.appendChild(go); row.appendChild(off); box.appendChild(ta); box.appendChild(row);
  });
  $('#statsBtn').addEventListener('click', function () {
    if (!creatorOn()) return;
    crOpen('stats', 'Statistiques'); nwListen();
    var box = $('#crBody'); box.appendChild(el('p', 'hint', 'Chargement…'));
    SB.from('profiles').select('seen,verified,hide_on').limit(5000).then(function (r0) {
      if (r0.error) throw r0.error;
      var uids = r0.data || [];
      return Promise.resolve(uids.map(function (v) { return { seen: v.seen, verified: v.verified === true, hideOn: v.hide_on === true }; })).then(function (ps) {
        var on = ps.filter(function (v) { return v.seen && Date.now() - v.seen < 150000; }).length;
        var cert = ps.filter(function (v) { return v.verified === true; }).length;
        var hid = ps.filter(function (v) { return v.hideOn === true; }).length;
        var items = NW.items || [], cm = items.reduce(function (n, it) { return n + (it.cc || 0); }, 0);
        var rows = [['Comptes', uids.length], ['En ligne maintenant', on], ['Comptes certifiés', cert], ['Statut masqué', hid], ['Lettres (100 dernières)', items.length], ['Commentaires dessus', cm], ['Lettres signalées', items.filter(function (it) { return nwCount(it.reports) > 0; }).length]];
        box.replaceChildren();
        rows.forEach(function (r) { var d = el('div', 'crstat'); d.appendChild(el('span', '', r[0])); d.appendChild(el('b', '', String(r[1]))); box.appendChild(d); });
      });
    }).catch(function () { box.replaceChildren(); crErr('Lecture impossible (droits ou connexion).'); });
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
    presSet(state.me, { bday: ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2) }).catch(function () {});
  });
  $('#bdDel').addEventListener('click', function () {
    $('#bdD').value = ''; $('#bdM').value = '';
    presSet(state.me, { bday: null }).catch(function () {});
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
    lkClose(); try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf("xen-chats-") === 0) localStorage.removeItem(k); }); } catch (e) {} SB.auth.signOut();
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
      var cred = await navigator.credentials.create({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: 'X\'enify' }, user: { id: crypto.getRandomValues(new Uint8Array(16)), name: state.username, displayName: state.username }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }], authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'preferred', residentKey: 'discouraged' }, attestation: 'none', timeout: 60000 } });
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
  function ucFail() { var e = $('#ucErr'); e.textContent = 'Action impossible (connexion ou droits à vérifier).'; e.hidden = false; }
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
      var cid = chatIdFor(state.me, t.uid);
      await postMsg({ id: cid, other: t.uid, group: false }, { text: text.slice(0, 2000) });
      inp.value = ''; ucDlg.close(); openChat(t.uid, t.name);
    } catch (e) { err.textContent = e && e.inv ? e.inv : 'Invitation non envoyée (connexion à vérifier).'; err.hidden = false; }
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
      var ids = await idsOf(names), mem = [];
      for (var i = 0; i < names.length; i++) {
        if (!ids[names[i]]) { gnErr('Aucun utilisateur ne s’appelle « ' + names[i] + ' ».'); btn.disabled = false; return; }
        mem.push(ids[names[i]]);
      }
      var rg = await SB.rpc('create_group', { p_name: title, p_photo: null, p_members: mem });
      if (rg.error) throw rg.error;
      var id = rg.data;
      SB.rpc('send_message', { p_cid: id, p_body: SYS + 'Groupe créé' }).then(function () {}, function () {});
      state.chatsById[id] = true;
      gnDlg.close();
      openChat('', title, { id: id, title: title, group: true, owner: state.me, members: [state.me].concat(mem) });
    } catch (e) { gnErr('Création impossible (connexion à vérifier).'); }
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
      giErr('');
      SB.rpc('set_nick', { p_cid: g.id, p_target: u, p_nick: raw, p_note: note })
        .then(function (r) { if (r.error) throw r.error; f.remove(); })
        .catch(function () { giErr('Pseudo impossible (connexion à vérifier).'); });
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
    return SB.rpc('update_group', { p_cid: g.id, p_name: obj.title === undefined ? null : obj.title,
      p_photo: typeof obj.photo === 'string' ? obj.photo : null, p_clear_photo: obj.photo === null })
      .then(function (r) { if (r.error) throw r.error; })
      .catch(function () { giErr('Modification impossible (connexion à vérifier).'); });
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
  $('#giDel').addEventListener('click', function () { giUpdate({ photo: null }); });
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
      var ids = await idsOf(names), add = [], cur = g.members || [];
      for (var i = 0; i < names.length; i++) {
        var u = ids[names[i]];
        if (!u) { giErr('Aucun utilisateur ne s’appelle « ' + names[i] + ' ».'); btn.disabled = false; return; }
        if (cur.indexOf(u) === -1 && add.indexOf(u) === -1) add.push(u);
      }
      if (!add.length) { giErr('Ces personnes sont déjà dans le groupe.'); btn.disabled = false; return; }
      if (cur.length + add.length > 30) { giErr('30 personnes maximum : il reste ' + (30 - cur.length) + ' place(s).'); btn.disabled = false; return; }
      var ra = await SB.rpc('add_group_members', { p_cid: g.id, p_members: add });
      if (ra.error) throw ra.error;
      $('#gaNames').value = '';
    } catch (e) { giErr('Ajout impossible (connexion à vérifier).'); }
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
    $('#liveBtn').hidden = false; $('#callBtn').hidden = !!gc; (function () { var vb = $('#vcallBtn'); if (vb) vb.hidden = !!gc; })(); $('#giBtn').hidden = !gc; $('#nickBtn').hidden = !!gc; $('#nickForm').hidden = true;
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

    var subbed = false, mdead = false, mchs = [], mtimer = null, mbusy = false, mAgain = false, mfail = 0;
    var curIds = null;   /* identifiants des messages affichés (pour filtrer les réactions) */
    /* retour du réseau ou de l'appli au premier plan : on relit les messages (rien ne se perd pendant une coupure) */
    function mwake() { if (!mdead && !document.hidden) mkick(); }
    window.addEventListener('online', mwake); document.addEventListener('visibilitychange', mwake);
    unsubMsgs = function () { mdead = true; clearTimeout(mtimer); window.removeEventListener('online', mwake); document.removeEventListener('visibilitychange', mwake); mchs.forEach(function (c) { try { SB.removeChannel(c); } catch (e) {} }); mchs = []; };
    function mshow(list, size) {
      var before = new Set(state.msgs.map(function (m) { return m.id; }));
      var firstLoad = !state.loaded;
      var paging = state.paging; state.paging = false;
      list.sort(function (a, b) { return a.ts - b.ts || ((+a.id) || 0) - ((+b.id) || 0); });
      cleanMine();
      state.more = size >= state.lim;
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
    }
    function mkick(ms) { clearTimeout(mtimer); mtimer = setTimeout(mpull, typeof ms === 'number' ? ms : 120); }
    /* message reçu / modifié / supprimé : on l'applique tout de suite (sans relire le serveur), puis on vérifie un peu plus tard */
    function mpatch(pl) {
      try {
        if (!state.loaded || !pl || mdead) { mkick(); return; }
        var list;
        if (pl.eventType === 'DELETE') {
          var oid = pl.old && pl.old.id;
          if (oid == null) { mkick(); return; }
          list = state.msgs.filter(function (x) { return x.id !== String(oid); });
        } else {
          var row = pl.new;
          if (!row || row.id == null || (!row.body && !row.img && !row.audio && !row.file)) { mkick(); return; }
          var nm = msgFromRow(row, null);
          var old = state.msgs.find(function (x) { return x.id === nm.id; });
          if (old) { nm.likes = old.likes; nm.reacts = old.reacts; }
          list = state.msgs.filter(function (x) {
            return x.id !== nm.id && !(String(x.id).indexOf('tmp') === 0 && x.uid === nm.uid && x.text === nm.text);
          });
          list.push(nm);
          if (curIds) curIds.add(nm.id);
        }
        mshow(list, state.more ? state.lim : Math.min(list.length, state.lim - 1));
        mkick(1500);
      } catch (e) { mkick(); }
    }
    function mlisten(cu) {
      var seenSub = false;
      mchs.push(SB.channel('msg-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + cu }, mpatch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, function (pl) {
          /* pas de filtre possible côté serveur (la table n'a pas la discussion) : on ignore les réactions d'autres discussions */
          var rec = (pl && pl.new && pl.new.message_id != null) ? pl.new : (pl && pl.old);
          if (rec && rec.message_id != null && curIds && !curIds.has(String(rec.message_id))) return;
          mkick();
        })
        .subscribe(function (st) { if (st === 'SUBSCRIBED') { if (seenSub) mkick(); seenSub = true; } }));
    }
    async function mpull() {
      if (mdead) return;
      if (mbusy) { mAgain = true; return; }
      mbusy = true;
      try {
        var cu = await convUuid(id);
        if (mdead) return;
        if (!cu) { mshow([], 0); return; }
        if (!mchs.length) mlisten(cu);
        var r = await SB.from('messages').select('*').eq('conversation_id', cu).order('id', { ascending: false }).limit(state.lim);
        if (r.error) throw r.error;
        var rows = r.data || [], ids = rows.map(function (x) { return x.id; }), rx = {};
        curIds = new Set(ids.map(String));
        if (ids.length) {
          var q = await SB.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids);
          (q.data || []).forEach(function (x) { (rx[x.message_id] = rx[x.message_id] || []).push(x); });
        }
        if (mdead) return;
        mfail = 0;
        if (state.dead) { state.dead = null; ta.disabled = false; sendBtn.disabled = false; }
        mshow(rows.map(function (x) { return msgFromRow(x, rx[x.id]); }), rows.length);
      } catch (e) {
        if (mdead) return;
        mfail++;
        clearTimeout(mtimer);
        if (mfail <= 3) mtimer = setTimeout(mpull, 1000 * Math.pow(2, mfail));   /* 2 s, 4 s, 8 s */
        else {
          state.dead = 'Connexion interrompue. Nouvelle tentative automatique…';
          state.loaded = true;
          ta.disabled = true; sendBtn.disabled = true;
          render();
          mtimer = setTimeout(mpull, 10000);
        }
      } finally { mbusy = false; if (mAgain && !mdead) { mAgain = false; mpull(); } }
    }
    function subMsgs() { subbed = true; mpull(); }
    subMsgs();
    state.kick = function (ms) { if (!subbed) subMsgs(); else mkick(ms); };
    state.loadOlder = function () {
      if (!state.more || state.paging) return;
      state.paging = true; state.lim += 20;
      mpull();
    };

    unsubPres = state.chat.group ? null : presSub(otherUid, function (o) {
      state.otherPres = o || null;
      var ph = state.otherPres && typeof state.otherPres.photo === 'string' ? state.otherPres.photo : null;
      if (photos[otherUid] !== ph) { photos[otherUid] = ph; paintPhoto($('#chatAvatar'), otherUid, otherName); }
      var pn = state.otherPres && typeof state.otherPres.name === 'string' && state.otherPres.name;
      if (pn && state.chat && state.chat.other === otherUid && !nickOf(chatOf(state.chat.id), otherUid) && pn !== state.chat.name) { state.chat.name = pn; $('#chatName').textContent = cap(pn); paintPhoto($('#chatAvatar'), otherUid, pn); }
      renderStatus();
    });
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
    state.kick = null;
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
  var NOTIF_TITLE = 'Vous avez un nouveau message X\'enify \u2764\uFE0F\u200D\uD83E\uDE79';
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
      var opt = { body: (name ? cap(name) + ' : ' : '') + (text || ''), tag: 'uandi-' + (chatId || 'msg'), renotify: !silent && !(PUSH && PUSH.token), icon: 'icon-192.png', badge: 'badge-96.png', data: { chat: chatId || '' } };
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
      sysNotify('X\'enify', 'Ceci est un test de notification.'); showToast(null, 'X\'enify', 'Ceci est un test de notification.');
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
    if (perm === 'unsupported') { k = 'bad'; t = 'Non pris en charge'; sub = 'Ouvre X\'enify dans Chrome ou installe l’appli sur l’écran d’accueil.'; }
    else if (perm === 'denied') { k = 'bad'; t = 'Bloquées'; sub = 'Autorise-les dans les réglages du téléphone : Applis › X\'enify › Notifications (ou Chrome › Paramètres du site).'; }
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
    if (!PUSH.token || !state.me || !window.__xenPushTest) { npMsg('Active d’abord les notifications.'); return; }
    window.__xenPushTest().then(function () { npMsg('Notification de test envoyée : regarde le haut de ton écran.'); PUSH.lastSend = 'test local'; npPaint(); })
      .catch(function (e) { npMsg('Erreur : ' + ((e && (e.code || e.message)) || e)); });
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
    convUuid(state.chat.id).then(function (u) { if (u) return SB.rpc('mark_read', { p_cid: u }); }).catch(function () {});
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
    } else if (m.file) { bub.appendChild(fileCard(m)); } else if (scEl) { bub.appendChild(scEl); } else { var cnEl = callNoticeEl(m.text); if (cnEl) bub.appendChild(cnEl); else bub.textContent = m.text; }
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
    var o = withReply({ text: text });
    var tmp = { id: 'tmp' + Date.now(), uid: state.me, text: text, ts: Date.now(), likes: {}, reacts: {}, edited: false, delAt: 0,
      audio: null, dur: 0, music: '', img: null, file: null, reply: (o.reply && typeof o.reply.t === 'string') ? o.reply : null };
    var shown = state.loaded && state.chat === chat;
    if (shown) { state.msgs.push(tmp); render(); }
    var dropTmp = function () {
      var i = state.msgs.indexOf(tmp);
      if (i > -1) { state.msgs.splice(i, 1); if (state.chat === chat) render(); }
    };
    try {
      await postMsg(chat, o);
      setTimeout(dropTmp, 4000);
      pushNotify(chat, text);
    } catch (e) {
      dropTmp();
      ta.value = text;
      autosize();
      showErr(e && e.inv ? e.inv : 'Message non envoyé. Vérifie ta connexion et réessaie.');
    }
  }

  /* Envoi d'un message depuis une autre partie de l'appli (réponse à une story, réaction) */
  window.UIChat = {
    sendTo: async function (uid, name, text, reply) {
      if (!state.me || !uid || !text) { var e0 = new Error('x'); e0.inv = 'Message non envoyé'; throw e0; }
      var cid = chatIdFor(state.me, uid), m = { text: String(text).slice(0, 2000) };
      if (reply && typeof reply.t === 'string') m.reply = { id: String(reply.id || ''), uid: String(reply.uid || ''), t: reply.t };
      await postMsg({ id: cid, other: uid, group: false }, m);
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
      var t = String(text).slice(0, 2000);
      await postMsg({ id: cid, group: true }, { text: t });
      pushNotify({ id: cid, group: true, name: c.title || 'Groupe' }, t);
    }
  };

  async function toggleLike(id) {
    if (!state.chat || busy.has(id) || String(id).indexOf('tmp') === 0) return;
    var m = state.msgs.find(function (x) { return x.id === id; });
    var now = !(m && m.likes && m.likes[state.me] === true);
    var oldL = m && m.likes, oldR = m && m.reacts;
    if (m) {   /* affichage immédiat du cœur */
      m.likes = Object.assign({}, m.likes); m.reacts = Object.assign({}, m.reacts); delete m.reacts[state.me];
      if (now) m.likes[state.me] = true; else delete m.likes[state.me];
      render();
    }
    busy.add(id);
    try {
      var rl = await SB.rpc('react_message', { p_id: +id, p_emoji: now ? RX[0] : null });
      if (rl.error) throw rl.error;
    } catch (e) {
      if (m) { m.likes = oldL; m.reacts = oldR; render(); }
      if (state.kick) state.kick();
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
    SB.rpc('hide_message', { p_id: +id }).then(function () {}, function () {});
    state.open.delete(id); if (state.picker === id) state.picker = null;
    render();
  }
  /* nettoyage : fait côté serveur par cleanup_my_messages (voir cleanMine) */
  var CLEANED = {};
  function cleanPhotos(chatId, list, manual) {
    var n = 0, cut = Date.now() - 7 * 86400000;
    list.forEach(function (m) { if (m.uid === state.me && m.img && String(m.img).slice(0, 11) === 'data:image/' && m.ts < cut) n++; });
    SB.rpc('cleanup_my_messages').then(function () { if (state.kick) state.kick(); }, function () {});
    return n;
  }
  async function eraseForAll(id) {
    var chat = state.chat, m = state.msgs.find(function (x) { return x.id === id; });
    if (!chat || !m || m.uid !== state.me || String(id).indexOf('tmp') === 0) return;
    try {
      var re = await SB.rpc('erase_message', { p_id: +id });
      if (re.error) throw re.error;
      if (state.kick) state.kick();
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
    try { var rd = await SB.rpc('erase_message', { p_id: +id }); if (rd.error) throw rd.error; }
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
  var SKIN_EFF = { nuit: 'dark', foret: 'dark', clair: 'light', rose: 'light', neant: 'dark', noir: 'dark', blanc: 'light' };
  var SKIN_FONT = { nuit: 'Roboto:wght@400;500;700', clair: 'Roboto:wght@400;500;700', foret: 'Roboto:wght@400;500;700', rose: 'Roboto:wght@400;500;700', neant: 'Roboto:wght@400;500;700', noir: 'Roboto:wght@400;500;700', blanc: 'Roboto:wght@400;500;700' };
  var SKIN_BAR = { nuit: '#0A0C10', clair: '#FFFFFF', foret: '#0C1613', rose: '#FFE9F1', neant: '#070304', noir: '#000000', blanc: '#FFFFFF' };
  var ICON_GLYPH = { w: 862.27, h: 1000.00, d: 'M843.1 5.1 L840.6 4.5 L838.0 6.2 L827.8 23.1 L821.1 31.2 L814.7 37.7 L806.7 43.6 L790.6 51.9 L783.3 58.3 L777.1 66.0 L771.0 75.2 L766.6 83.3 L763.6 91.4 L762.1 99.5 L761.6 108.8 L761.8 122.7 L763.1 131.9 L765.6 141.2 L770.9 156.2 L786.3 192.1 L792.7 210.6 L795.9 225.7 L797.0 245.4 L796.0 260.4 L794.6 269.7 L790.8 282.4 L786.7 292.8 L780.2 304.4 L771.2 317.1 L762.4 327.4 L754.6 334.0 L750.0 336.3 L746.5 336.9 L743.1 336.3 L739.6 334.8 L733.8 330.6 L716.4 314.5 L704.9 305.2 L692.1 297.2 L667.8 284.0 L655.1 278.8 L610.0 264.6 L593.8 261.9 L542.8 259.3 L526.6 259.8 L476.9 264.1 L436.3 271.4 L391.2 281.8 L370.4 289.5 L312.5 314.5 L302.1 320.4 L280.1 334.7 L248.8 356.4 L207.2 392.7 L197.1 402.8 L187.9 413.2 L156.9 451.4 L146.8 465.3 L125.0 503.5 L112.8 526.6 L106.2 542.8 L87.6 600.7 L79.4 643.5 L78.0 655.1 L76.7 675.9 L76.4 697.9 L76.9 716.4 L79.5 743.1 L88.7 782.4 L98.7 809.0 L113.2 840.3 L114.6 846.0 L114.0 850.6 L111.1 856.1 L106.2 861.3 L72.9 889.5 L46.3 914.4 L24.7 936.3 L9.8 953.7 L3.7 964.1 L1.8 969.9 L0.9 975.7 L1.0 981.5 L2.1 987.1 L4.0 991.2 L6.9 994.6 L11.8 997.3 L17.4 998.5 L55.6 1000.0 L68.3 999.7 L77.5 998.7 L83.1 997.3 L88.0 994.5 L91.0 991.2 L93.5 986.0 L97.1 965.3 L101.6 947.9 L105.3 937.5 L112.1 923.6 L119.9 910.9 L129.1 899.4 L137.8 891.2 L141.2 889.1 L144.7 887.9 L150.5 888.1 L156.2 890.7 L187.5 913.5 L201.4 921.8 L216.4 929.6 L241.9 940.0 L266.2 948.2 L275.5 950.7 L314.8 958.4 L344.9 960.5 L392.4 960.5 L447.9 957.3 L458.3 955.7 L483.8 949.8 L527.8 938.6 L550.9 929.4 L599.5 907.0 L627.3 890.8 L662.0 868.0 L695.6 839.6 L712.0 822.9 L739.7 785.9 L747.5 774.3 L754.2 761.6 L769.5 728.0 L775.0 713.0 L783.2 677.1 L785.8 660.9 L786.9 645.8 L785.5 626.2 L782.7 613.4 L776.7 599.5 L768.3 587.1 L763.4 582.0 L758.0 577.6 L743.1 568.9 L729.2 563.1 L713.0 558.8 L703.7 557.3 L695.6 556.8 L675.9 558.1 L660.9 561.3 L638.9 569.0 L623.8 577.9 L609.2 589.8 L597.5 603.0 L588.4 616.9 L582.1 630.8 L578.7 642.4 L577.6 653.9 L577.9 675.9 L579.8 687.5 L585.3 706.0 L599.6 743.1 L603.4 756.9 L604.8 767.4 L605.1 777.8 L604.0 791.7 L602.0 804.4 L598.3 818.3 L592.9 832.2 L587.2 842.6 L578.9 854.1 L570.1 863.7 L560.2 872.1 L546.3 881.6 L533.6 888.6 L512.7 897.0 L487.3 903.8 L471.1 906.6 L454.9 907.4 L437.5 906.4 L421.3 902.7 L406.2 897.2 L391.2 888.3 L377.4 877.0 L364.7 863.4 L355.0 849.5 L346.0 832.2 L337.2 809.0 L333.8 797.5 L326.7 761.6 L325.6 751.2 L326.0 743.1 L327.7 737.3 L330.3 732.8 L333.9 728.5 L340.3 722.5 L574.1 531.9 L589.1 520.5 L604.2 511.6 L629.6 498.4 L644.7 492.2 L669.0 484.0 L684.0 480.4 L721.1 476.4 L733.8 472.9 L739.5 470.3 L745.0 466.8 L750.0 462.3 L754.3 457.0 L758.4 450.2 L761.5 443.3 L765.8 428.2 L766.9 416.7 L765.9 386.6 L767.0 380.8 L769.3 376.3 L773.6 370.7 L780.1 364.5 L835.6 318.1 L847.1 307.7 L852.2 302.0 L856.3 296.3 L858.6 291.7 L860.2 285.9 L861.1 275.5 L861.2 221.1 L862.3 192.1 L862.2 171.3 L861.3 152.8 L861.7 137.7 L860.9 64.8 L859.3 55.6 L851.7 37.0 L846.6 11.8 L845.1 7.8Z M524.2 306.1 L529.5 309.6 L534.2 314.2 L538.7 320.7 L542.6 328.7 L545.1 335.6 L547.1 343.8 L549.6 366.9 L549.6 403.9 L548.1 427.1 L546.0 447.9 L543.1 467.6 L537.0 497.7 L534.8 505.8 L532.3 511.5 L529.4 516.0 L524.9 521.4 L509.3 535.3 L343.8 669.2 L338.1 672.7 L333.8 674.1 L330.1 673.6 L327.6 671.2 L326.4 667.5 L326.2 662.0 L327.0 653.9 L334.9 603.0 L344.3 557.9 L353.0 524.3 L362.3 491.9 L372.1 461.8 L388.1 421.3 L400.7 394.7 L415.1 369.2 L430.8 347.2 L444.5 332.7 L463.0 318.0 L478.0 308.6 L485.0 305.8 L491.9 304.0 L502.3 302.6 L510.4 302.5 L517.4 303.5Z' };
  var ICON_COL = {"": ["#060914", ["#B8F4FF", "#5CE1FF", "#8B5CFF"]], "nuit": ["#0A0C10", ["#C4DBFF", "#6EA8FF", "#4F86F0"]], "clair": ["#E6F4F2", ["#34D6C2", "#14958A", "#0F766E"]], "foret": ["#0C1613", ["#B5F5DA", "#4FD1A1", "#33B88A"]], "rose": ["#FFE9F1", ["#FF9EC4", "#E0457B", "#B02A63"]], "neant": ["#070304", ["#FFC2C8", "#FF3B4E", "#B3122A"]], "noir": ["#000000", ["#FFFFFF", "#D6D6D6", "#9E9E9E"]], "blanc": ["#FFFFFF", ["#555555", "#222222", "#000000"]]};
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
  /* icône de l'appli : au choix (Violet / Noir / Blanc) via « Installer l'appli » ; sans choix : violet en thème sombre, blanc en thème clair */
  var ICON_SETS = {
    violet: { a: ['icon-192', 'icon-512'], m: ['icon-maskable-192', 'icon-maskable-512'], ap: 'apple-touch-icon' },
    noir: { a: ['icon-noir-192', 'icon-noir-512'], m: ['icon-maskable-noir-192', 'icon-maskable-noir-512'], ap: 'apple-touch-icon-noir' },
    blanc: { a: ['icon-blanc-192', 'icon-blanc-512'], m: ['icon-maskable-blanc-192', 'icon-maskable-blanc-512'], ap: 'apple-touch-icon-blanc' }
  };
  function iconChoice() {
    var c = null; try { c = localStorage.getItem('uandi-icon'); } catch (e) {}
    return ICON_SETS[c] ? c : (document.documentElement.dataset.eff === 'light' ? 'blanc' : 'violet');
  }
  function setIcons() {
    var key = iconChoice();
    if (iconSkin === key) return;
    try {
      var V = '?v=210', abs = function (f) { return new URL(f + '.png' + V, location.href).href; }, S = ICON_SETS[key];
      var i192 = abs(S.a[0]), i512 = abs(S.a[1]), m192 = abs(S.m[0]), m512 = abs(S.m[1]);
      var fav = document.querySelector('link[rel="icon"]'), ap = document.querySelector('link[rel="apple-touch-icon"]'), mf = document.querySelector('link[rel="manifest"]');
      if (fav) fav.href = i192;
      if (ap) ap.href = abs(S.ap);
      if (mf) {
        var mj = JSON.stringify({
          name: 'X\'enify', short_name: 'X\'enify', start_url: location.pathname + location.search, scope: location.pathname.replace(/[^\/]*$/, ''),
          display: 'standalone', background_color: '#050309', theme_color: '#050309',
          icons: [{ src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: m192, sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: m512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
        });
        mf.href = 'data:application/manifest+json;base64,' + btoa(unescape(encodeURIComponent(mj)));
      }
      iconSkin = key;
    } catch (e) {}
  }
  window.__echoIconChoice = iconChoice;
  window.__echoSetIcon = function (c) { try { localStorage.setItem('uandi-icon', c); } catch (e) {} iconSkin = null; setIcons(); };

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
    if (tc) tc.setAttribute('content', k ? SKIN_BAR[k] : '#050309');
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
      var cu = await convUuid(chat.id);
      if (!cu) { var e0 = new Error('not-found'); e0.code = 'not-found'; throw e0; }
      var rn = await SB.rpc('set_nick', { p_cid: cu, p_target: chat.other, p_nick: raw, p_note: note });
      if (rn.error) throw rn.error;
      chat.name = raw || real; $('#chatName').textContent = cap(chat.name);
      paintPhoto($('#chatAvatar'), chat.other, chat.name);
      $('#nickForm').hidden = true;
    } catch (e) {
      var code = (e && e.code) || '';
      err.textContent = code === 'not-found' ? 'La discussion n’existe pas encore : envoie d’abord un message, puis reviens mettre le surnom.'
        : code === 'permission-denied' ? 'Accès refusé (permission-denied) : vérifie que les blocs SQL Supabase ont bien été lancés.'
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
    presGet(uid).then(function (d) {
      var v = d ? d.photo : null;
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
      await presSet(state.me, { name: myName(), seen: hideOn() ? 0 : Date.now(), photo: data || null });
      photos[state.me] = data || null;
      paintPhoto($('#setAvatar'), state.me, state.username);
      updateMyNote();
      if (state.view === 'list') renderList();
    } catch (e) {
      err.textContent = 'Action impossible (connexion ou droits à vérifier).';
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
    /* le nom affiché vient de profiles : rien à mettre à jour dans les discussions */
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
    if (String(id).indexOf('tmp') === 0) return;
    var next = (reactionsOf(m)[state.me] === emoji) ? '' : emoji;
    var oldL = m.likes, oldR = m.reacts;
    /* affichage immédiat : la réaction apparaît tout de suite, le serveur confirme ensuite */
    m.likes = Object.assign({}, m.likes); delete m.likes[state.me];
    m.reacts = Object.assign({}, m.reacts); delete m.reacts[state.me];
    if (next) { if (next === '\u2764\uFE0F') m.likes[state.me] = true; else m.reacts[state.me] = next; }
    state.picker = null;
    closePickerAnim(id, next, render);
    busy.add(id);
    try {
      var rr = await SB.rpc('react_message', { p_id: +id, p_emoji: next || null });
      if (rr.error) throw rr.error;
    } catch (e) {
      m.likes = oldL; m.reacts = oldR; render();
      if (state.kick) state.kick();
      showErr('La réaction n’a pas pu être enregistrée (connexion à vérifier).');
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
      var re = await SB.rpc('edit_message', { p_id: +id, p_body: text });
      if (re.error) throw re.error;
      if (state.kick) state.kick();
    } catch (e) {
      showErr('La modification n’a pas pu être enregistrée (connexion à vérifier).');
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
    async function put(val) { await postMsg(chat, withReply({ text: label, img: val })); }
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
      showErr(e && e.inv ? e.inv : 'Photo non envoyée. Vérifie ta connexion et réessaie.');
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
    if (e && e.code === 'permission-denied') return 'Lecture refusée : vérifie les blocs SQL Supabase.';
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
      p = Promise.reject(fileErr('incomplet'));
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
    var file;
    try {
      var upf = null;
      if (aud || /^image\//.test(mt)) upf = await cloudUp(f);
      else {
        /* documents : on n'utilise le cloud que si le fichier en ressort intact (PDF/ZIP souvent bloqués) */
        upf = await cloudUp(f, 'raw');
        if (upf && !(await urlIntact(upf, f.size, name))) upf = null;
      }
      if (upf) file = { n: name, s: f.size || 0, u: upf, mt: mt };
      else if (f.size <= FILE_MAX) file = { n: name, s: f.size || 0, d: await readUrl(f), mt: mt };
      else { showErr('Envoi impossible (' + (CLD_ERR || 'connexion') + '). Les fichiers de plus de ' + fmtSize(FILE_MAX) + ' passent par le cloud : réessaie.'); return; }
      await postMsg(chat, withReply({ text: label, file: file }));
    } catch (e) {
      showErr(e && e.inv ? e.inv : 'Fichier non envoyé. Vérifie ta connexion et réessaie.');
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
      await postMsg(chat, withReply({ text: label, audio: audio, dur: Math.round(dur) }));
    } catch (e) {
      showErr(e && e.inv ? e.inv : 'Vocal non envoyé. Vérifie ta connexion et réessaie.');
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
    var leaving = !!(chat.group && (chatOf(chat.id) || {}).owner !== state.me);
    var ok = true;
    try {
      var cu = await convUuid(chat.id);
      if (cu) { var rl = await SB.rpc('leave_conversation', { p_cid: cu }); if (rl.error) throw rl.error; }
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
    var done0 = function () { SB.auth.signOut(); };
    var done = function () { pushUnreg().then(done0, done0); };
    if (state.me) {
      presSet(state.me, { seen: 0, typingIn: null }).then(done, done);
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
    convUuid(id).then(function (u) { return u ? SB.from('messages').select('body').eq('conversation_id', u).order('id', { ascending: false }).limit(1) : { data: [] }; })
      .then(function (q) { var d = q && q.data && q.data[0]; show(d && typeof d.body === 'string' && d.body.charAt(0) !== SYS ? d.body : text); })
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
  var BADGE_INFO = { fnd: ['Fondateur', 'Fondateur de X\'enify'], ast: ['Assistant', 'Assistant de X\'enify'], cert: ['Certifi\u00e9', 'Compte certifi\u00e9'] };
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
    return presSet(state.me, { bpill: np.pill ? true : null, bhide: np.hide ? true : null, bcol: np.col ? np.col : null }).catch(function () { put(old); });
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
    presGet(uid).then(function (o) {
      var v = o || {}, b = v.badge === true, c = v.verified === true, as = v.assistant === true;
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
    return creatorFlag(state.me, 'badge', on)
      .then(function () { badges[state.me] = on; badgeRefresh(); })
      .catch(function () { badgeErr('Action impossible (connexion ou droits à vérifier).'); });
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
          (on ? SB.rpc('creator_unban', { p_uid: a.uid }) : SB.rpc('creator_ban', { p_uid: a.uid, p_days: 7 }))
            .then(function (r) { if (r.error) throw r.error; })
            .then(function () { if (on) delete BANS[a.uid]; else BANS[a.uid] = Date.now() + 7 * 864e5; accRender(); })
            .catch(function () { var er = $('#accListErr'); er.textContent = 'Suspension impossible (droits ou connexion).'; er.hidden = false; });
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
    try {
      var r = await SB.rpc('creator_delete_account', { p_uid: uid });
      if (r.error) throw r.error;
      return true;
    } catch (e) {
      err.textContent = 'Suppression impossible (droits ou connexion).'; err.hidden = false;
      return false;
    }
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
    creatorFlag(a.uid, 'music_ok', on)
      .then(function () { musicOks[a.uid] = on; accRender(); })
      .catch(function () { btn.disabled = false; err.textContent = 'Action impossible (connexion ou droits à vérifier).'; err.hidden = false; });
  }
  function accCert(a, btn) {
    var on = !verifs[a.uid], err = $('#accListErr'); err.hidden = true; btn.disabled = true;
    creatorFlag(a.uid, 'verified', on)
      .then(function () { verifs[a.uid] = on; accRender(); })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'Action impossible (connexion ou droits à vérifier).'; err.hidden = false;
      });
  }
  function accAssist(a, btn) {
    var on = !assists[a.uid], err = $('#accListErr'); err.hidden = true; btn.disabled = true;
    creatorFlag(a.uid, 'assistant', on)
      .then(function () { assists[a.uid] = on; accRender(); })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'Action impossible (connexion ou droits à vérifier).'; err.hidden = false;
      });
  }
  function accBadge(a, btn) {
    var on = !badges[a.uid], err = $('#accListErr'); err.hidden = true; btn.disabled = true;
    creatorFlag(a.uid, 'badge', on)
      .then(function () { badges[a.uid] = on; accRender(); })
      .catch(function () {
        btn.disabled = false;
        err.textContent = 'Action impossible (connexion ou droits à vérifier).'; err.hidden = false;
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
    SB.from('bans').select('user_id,until_at').then(function (r) { (r.data || []).forEach(function (x) { BANS[x.user_id] = Date.parse(x.until_at); }); accRender(); }, function () {});
    accDlg.showModal();
    SB.from('profiles').select('id,username,badge,verified,assistant,music_ok').then(function (r) {
      if (r.error) throw r.error;
      (r.data || []).forEach(function (v) {
        ACC.push({ name: v.username || '', uid: v.id });
        badges[v.id] = v.badge === true; verifs[v.id] = v.verified === true; assists[v.id] = v.assistant === true; musicOks[v.id] = v.music_ok === true;
      });
      ACC.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
      $('#accTitle').textContent = ACC.length + ' compte' + (ACC.length > 1 ? 's' : '');
      accRender();
    }).catch(function () {
      $('#accRows').replaceChildren();
      err.textContent = 'Action impossible (connexion ou droits à vérifier).'; err.hidden = false;
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
      noteSubs[uid] = presSub(uid, function (v) {
        var wasOn = isOnline(uid), wasXs = !!xsMap[uid]; seenAt[uid] = (v && v.seen) || 0; xsMap[uid] = !!(v && v.xst === 'heart'); var flip = wasOn !== isOnline(uid) || (isOnline(uid) && wasXs !== xsMap[uid]);
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
      });
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
    blkPaint(uid, name);
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
  function openNoteEditor() {
    var a = activeNote(state.me);
    $('#noteInput').value = a ? a.text : '';
    $('#noteDel').hidden = !a;
    $('#noteCloseOnly').checked = !!(notePres[state.me] && Array.isArray(notePres[state.me].noteTo));
    noteErr('');
    noteCount();
    neDlg.showModal();
    $('#noteInput').focus();
  }
  window.__echoOpenNote = openNoteEditor;
  /* l'avatar de l'en-tête ouvre mon profil (la note se crée avec le + de « Ma story ») */
  $('#myNote').addEventListener('click', function () {
    try { if (window.UIProfile && UIProfile.open) { UIProfile.open(state.me, state.username); return; } } catch (e) {}
    openNoteEditor();
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
    presSet(state.me, { note: text.slice(0, 60), noteTs: Date.now(), noteTo: only ? closeList() : null })
      .then(function () { neDlg.close(); })
      .catch(function () { noteErr('Action impossible (connexion ou droits à vérifier).'); });
  });
  $('#noteDel').addEventListener('click', function () {
    noteErr('');
    presSet(state.me, { note: null, noteTs: null })
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
      var cid = chatIdFor(state.me, t.uid);
      await postMsg({ id: cid, other: t.uid, group: false }, { text: text.slice(0, 2000), reply: { id: 'note:' + t.uid + ':' + a.ts, uid: t.uid, t: '\uD83D\uDCDD Note : ' + a.text.slice(0, 100) } });
      inp.value = ''; nvDlg.close();
      if (!(state.view === 'chat' && state.chat && !state.chat.group && state.chat.other === t.uid)) openChat(t.uid, t.name);
    } catch (e) {
      err.textContent = (e && e.inv) || 'Réponse non envoyée (connexion à vérifier).'; err.hidden = false;
    }
    btn.disabled = false;
  }
  $('#nvReplySend').addEventListener('click', sendNoteReply);
  $('#nvReplyIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); sendNoteReply(); } });
  $('#nvWrite').addEventListener('click', function () {
    var t = nvTarget; nvDlg.close();
    if (t) openChat(t.uid, t.name);
  });




