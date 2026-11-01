/* U&I — js/fonctions.js
   Fonctionnalités en plus, avec interrupteurs dans Réglages > Fonctionnalités.
   - tout le monde : badges (animations), copier / lire une réponse de X.Uni, commandes « / », raccourcis, compteur, taille du texte
   - assistants (et fondateur) : régénérer, suites suggérées, dictée, export, recherche, raccourcis clavier
   - fondateur : TOUT est débloqué + tableau de bord créateur + infos techniques
   Le rôle vient de script.js (window.UI_ROLE, événement « ui-role »). À charger APRÈS script.js. */
(function () {
  'use strict';
  var KEY = 'uandi-feat', FSK = 'uandi-ai-fs';
  var R = window.UI_ROLE || { fnd: false, ast: false, cert: false };

  /* tier : all = tout le monde · ast = assistant + fondateur · fnd = fondateur seulement */
  var FEATS = [
    { id: 'badgefx', tier: 'all', grp: 'Badges', name: 'Animations des badges', desc: 'Check qui pop, reflet qui passe, halo qui pulse.' },
    { id: 'badgepill', tier: 'all', grp: 'Badges', def: false, name: 'Badges avec le mot (pilule)', desc: 'Affiche « Certifié », « Assistant » ou « Fondateur » à côté de l’icône.' },
    { id: 'badgeshow', tier: 'all', grp: 'Badges', name: 'Afficher les badges', desc: 'Les pilules Certifié, Assistant et Fondateur à côté des noms.' },
    { id: 'copy', tier: 'all', grp: 'X.Uni', name: 'Copier une réponse', desc: 'Bouton « Copier » sous chaque réponse.' },
    { id: 'speak', tier: 'all', grp: 'X.Uni', name: 'Lire à voix haute', desc: 'Bouton « Lire » pour écouter une réponse.' },
    { id: 'slash', tier: 'all', grp: 'X.Uni', name: 'Commandes rapides « / »', desc: 'Tape / dans X.Uni : /resume, /quiz, /fiches, /corriger…' },
    { id: 'chips', tier: 'all', grp: 'X.Uni', name: 'Raccourcis en plus', desc: 'Fiches, Plan, Corriger, Traduire, Exemples, Simplifier.' },
    { id: 'count', tier: 'all', grp: 'X.Uni', name: 'Compteur de caractères', desc: 'Affiche la longueur de ton message.' },
    { id: 'bottom', tier: 'all', grp: 'X.Uni', name: 'Bouton « descendre »', desc: 'Revenir en bas de la conversation en un geste.' },
    { id: 'size', tier: 'all', grp: 'X.Uni', name: 'Taille du texte', desc: 'Boutons A− et A+ dans X.Uni.' },
    { id: 'dict', tier: 'all', grp: 'X.Uni', name: 'Dictée vocale', desc: 'Parle, X.Uni écrit ta question (leçon incluse).' },
    { id: 'regen', tier: 'ast', grp: 'Assistant', name: 'Reformuler la réponse', desc: 'Demande à X.Uni de répondre autrement.' },
    { id: 'follow', tier: 'ast', grp: 'Assistant', name: 'Suites suggérées', desc: 'Plus simple, Un exemple, En 3 points, Quiz-moi.' },
    { id: 'export', tier: 'ast', grp: 'Assistant', name: 'Exporter la conversation', desc: 'Partager ou enregistrer en texte.' },
    { id: 'find', tier: 'ast', grp: 'Assistant', name: 'Chercher dans la conversation', desc: 'Surligne les mots trouvés.' },
    { id: 'keys', tier: 'ast', grp: 'Assistant', name: 'Raccourcis clavier', desc: 'Ctrl+Entrée envoie · Ctrl+K nouvelle conversation · Échap ferme.' },
    { id: 'dash', tier: 'fnd', grp: 'Fondateur', name: 'Tableau de bord créateur', desc: 'Comptes, approbations, stats et annonces en un tap.' },
    { id: 'meta', tier: 'fnd', grp: 'Fondateur', name: 'Infos techniques X.Uni', desc: 'Nombre de messages et taille de la conversation.' }
  ];
  var BY = {}; FEATS.forEach(function (f) { BY[f.id] = f; });
  var TIERTXT = { all: '', ast: 'Assistant', fnd: 'Fondateur' };
  var LOCKTXT = { ast: '🔒 Réservé aux assistants', fnd: '🔒 Réservé au fondateur' };

  var F = {};
  try { F = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { F = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(F)); } catch (e) {} }
  function tierOk(t) { return t === 'all' || (t === 'ast' && (R.ast || R.fnd)) || (t === 'fnd' && R.fnd); }
  function isOn(f) { return F[f.id] === undefined ? f.def !== false : F[f.id] === true; }
  function on(id) { var f = BY[id]; return !!f && tierOk(f.tier) && isOn(f); }
  function $(s, r) { return (r || document).querySelector(s); }
  function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  var SEAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><polygon class="sl" stroke-width="1.6" stroke-linejoin="round" points="12.00,1.80 14.25,3.60 17.10,3.17 18.15,5.85 20.83,6.90 20.40,9.75 22.20,12.00 20.40,14.25 20.83,17.10 18.15,18.15 17.10,20.83 14.25,20.40 12.00,22.20 9.75,20.40 6.90,20.83 5.85,18.15 3.17,17.10 3.60,14.25 1.80,12.00 3.60,9.75 3.17,6.90 5.85,5.85 6.90,3.17 9.75,3.60"/><path class="ck" d="M7 12.6l3.3 3.3L17 8.9" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function pill(kind, word) { var b = mk('span', 'ubadge pill ' + kind); b.innerHTML = SEAL + '<span class="bt">' + word + '</span>'; return b; }

  /* ================= page Réglages > Fonctionnalités ================= */
  function roleText() {
    if (R.fnd) return ['fnd', 'Fondateur', 'Toutes les fonctionnalités sont débloquées pour toi.'];
    if (R.ast) return ['ast', 'Assistant', 'Tu as les fonctionnalités des assistants en plus de celles de tout le monde.'];
    if (R.cert) return ['cert', 'Certifié', 'Compte certifié : fonctionnalités de base. Les options assistant sont verrouillées.'];
    return null;
  }
  function renderPage() {
    var body = $('#featBody'); if (!body) return;
    body.textContent = '';
    var rt = roleText(), card = mk('div', 'ft-role');
    if (rt) card.appendChild(pill(rt[0], rt[1]));
    card.appendChild(mk('p', '', rt ? rt[2] : 'Compte standard : fonctionnalités de base.'));
    body.appendChild(card);
    var pv = mk('div', 'ft-prev'); [['cert', 'Certifié'], ['ast', 'Assistant'], ['fnd', 'Fondateur']].forEach(function (p) { var w = mk('span', '', p[1] + ' '); w.setAttribute('style', 'font-size:.85rem;font-weight:600'); w.appendChild(pill(p[0], p[1])); pv.appendChild(w); });
    body.appendChild(pv);

    if (on('dash')) {
      body.appendChild(mk('p', 'ft-g', 'Tableau de bord créateur'));
      var d = mk('div', 'ft-dash');
      [['Comptes', '#accList'], ['À approuver', '#apBtn'], ['Statistiques', '#statsBtn'], ['Signalements', '#modBtn'], ['Annonce à tous', '#annBtn']].forEach(function (p) {
        var b = mk('button', p[0] === 'Annonce à tous' ? 'full' : '', p[0]); b.type = 'button';
        b.addEventListener('click', function () { var t = $(p[1]); if (t) t.click(); });
        d.appendChild(b);
      });
      var cp = mk('button', 'full', 'Copier mon identifiant'); cp.type = 'button';
      cp.addEventListener('click', function () {
        var t = ($('#myUid') || {}).textContent || '';
        if (!t) return;
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { cp.textContent = 'Copié ✓'; }, function () { cp.textContent = t; });
        setTimeout(function () { cp.textContent = 'Copier mon identifiant'; }, 1800);
      });
      d.appendChild(cp); body.appendChild(d);
    }

    var bar = mk('div', 'ft-bar');
    [['Tout activer', function () { FEATS.forEach(function (f) { F[f.id] = true; }); }],
     ['Tout couper', function () { FEATS.forEach(function (f) { F[f.id] = false; }); }],
     ['Réinitialiser', function () { F = {}; }]].forEach(function (a) {
      var b = mk('button', '', a[0]); b.type = 'button';
      b.addEventListener('click', function () { a[1](); save(); apply(); renderPage(); });
      bar.appendChild(b);
    });
    body.appendChild(bar);

    var last = '';
    FEATS.forEach(function (f) {
      if (f.grp !== last) { last = f.grp; var g = mk('p', 'ft-g', f.grp); if (TIERTXT[f.tier]) g.appendChild(mk('i', '', TIERTXT[f.tier] + (f.tier === 'ast' ? ' +' : ''))); body.appendChild(g); }
      var ok = tierOk(f.tier), row = mk('label', 'ft-row' + (ok ? '' : ' lock'));
      var t = mk('span', 'ft-t'); t.appendChild(mk('b', '', f.name)); t.appendChild(mk('small', '', ok ? f.desc : LOCKTXT[f.tier]));
      var cb = mk('input'); cb.type = 'checkbox'; cb.checked = ok && isOn(f); cb.disabled = !ok; cb.setAttribute('aria-label', f.name);
      cb.addEventListener('change', function () { F[f.id] = cb.checked; save(); apply(); renderPage(); });
      row.appendChild(t); row.appendChild(cb); body.appendChild(row);
    });
    var sm = $('#featSec .sxh small');
    if (sm) { var n = FEATS.filter(function (f) { return on(f.id); }).length; sm.textContent = n + ' option' + (n > 1 ? 's' : '') + ' active' + (n > 1 ? 's' : ''); }
  }

  /* ================= X.Uni ================= */
  var P, log, inEl, form, sel, tools, dictBtn, countEl, downBtn, slashEl, findIn, meta, rec = null, obsT = 0;
  var CMD = [
    ['/resume', 'Résumé de la leçon', 'Fais un résumé clair de la leçon.', 1],
    ['/quiz', 'Quiz sur la leçon', 'Pose-moi un quiz de 5 questions sur la leçon, une par une.', 1],
    ['/fiches', 'Fiches de révision', 'Fais des fiches de révision courtes et claires de la leçon.', 1],
    ['/plan', 'Plan détaillé', 'Fais le plan détaillé de la leçon.', 1],
    ['/explique', 'Expliquer simplement', 'Explique-moi simplement : '],
    ['/corriger', 'Corriger un texte', 'Corrige l’orthographe et la grammaire de ce texte, puis explique les erreurs : '],
    ['/traduire', 'Traduire en anglais', 'Traduis ce texte en anglais : '],
    ['/exemples', '3 exemples concrets', 'Donne-moi 3 exemples concrets de : '],
    ['/nouveau', 'Nouvelle conversation', null]
  ];
  var EXTRA = [['Fiches', '/fiches'], ['Plan', '/plan'], ['Corriger', '/corriger'], ['Traduire', '/traduire'], ['Exemples', '/exemples'], ['Simplifier', '/explique']];

  function send(text) {
    if (!inEl || !form || !text) return;
    var aiSend = $('#aiSend'); if (aiSend && aiSend.classList.contains('stop')) return;
    inEl.value = text; inEl.dispatchEvent(new Event('input'));
    if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }
  function runCmd(name) {
    var c = CMD.filter(function (x) { return x[0] === name; })[0]; if (!c) return false;
    if (c[2] === null) { var nb = $('#aiNew'); if (nb) nb.click(); inEl.value = ''; return true; }
    var typed = inEl.value.replace(/^\/\S*\s*/, '').trim();
    if (c[3]) { send(c[2] + (typed ? ' ' + typed : '')); return true; }
    if (typed) { send(c[2] + typed); return true; }
    inEl.value = c[2]; inEl.dispatchEvent(new Event('input')); inEl.focus();
    try { inEl.setSelectionRange(inEl.value.length, inEl.value.length); } catch (e) {}
    return true;
  }
  function showSlash() {
    if (!on('slash')) { slashEl.hidden = true; return; }
    var v = inEl.value;
    if (v.charAt(0) !== '/' || /\s/.test(v)) { slashEl.hidden = true; return; }
    var m = CMD.filter(function (c) { return c[0].indexOf(v.toLowerCase()) === 0; });
    slashEl.textContent = '';
    if (!m.length) { slashEl.hidden = true; return; }
    m.forEach(function (c) {
      var b = mk('button'); b.type = 'button'; b.appendChild(mk('b', '', c[0])); b.appendChild(mk('span', '', c[1]));
      b.addEventListener('click', function () { slashEl.hidden = true; inEl.value = c[0]; runCmd(c[0]); });
      slashEl.appendChild(b);
    });
    slashEl.hidden = false;
  }

  function bubText(b) {
    var a = b.querySelector('.ai-act'), fu = b.querySelector('.ai-act.fu'), s = [];
    [].forEach.call(b.querySelectorAll('.ai-act'), function (n) { s.push([n, n.style.display]); n.style.display = 'none'; });
    var t = b.innerText || b.textContent || '';
    s.forEach(function (x) { x[0].style.display = x[1]; });
    return t.trim();
  }
  function flash(btn, txt, back) { btn.textContent = txt; setTimeout(function () { btn.textContent = back; }, 1500); }
  function actBtn(txt, fn) { var b = mk('button', '', txt); b.type = 'button'; b.addEventListener('click', function () { fn(b); }); return b; }

  function decorate() {
    if (!log) return;
    var bs = [].filter.call(log.children, function (n) {
      return n.classList.contains('ai-b') && n.classList.contains('a') && !n.dataset.keep && !n.querySelector('.ai-dots');
    });
    bs.forEach(function (b, i) {
      var last = i === bs.length - 1;
      var sig = [last ? 'L' : 'N', on('copy') ? 1 : 0, on('speak') ? 1 : 0, last && on('regen') ? 1 : 0, last && on('follow') ? 1 : 0].join('');
      if (b.dataset.ax === sig && b.querySelector('.ai-act')) return;
      [].forEach.call(b.querySelectorAll('.ai-act'), function (n) { n.remove(); });
      b.dataset.ax = sig;
      var row = mk('div', 'ai-act');
      if (on('copy')) row.appendChild(actBtn('Copier', function (btn) {
        var t = bubText(b);
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { flash(btn, 'Copié ✓', 'Copier'); }, function () { flash(btn, 'Impossible', 'Copier'); });
      }));
      if (on('speak') && window.speechSynthesis) row.appendChild(actBtn('Lire', function (btn) {
        var ss = window.speechSynthesis;
        if (ss.speaking) { ss.cancel(); btn.textContent = 'Lire'; return; }
        var u = new SpeechSynthesisUtterance(bubText(b)); u.lang = 'fr-FR'; u.onend = u.onerror = function () { btn.textContent = 'Lire'; };
        btn.textContent = 'Stop'; ss.speak(u);
      }));
      if (last && on('regen')) row.appendChild(actBtn('↻ Autrement', function () { send('Reformule ta dernière réponse autrement, avec d’autres mots.'); }));
      if (row.children.length) b.appendChild(row);
      if (last && on('follow')) {
        var fu = mk('div', 'ai-act fu');
        [['Plus simple', 'Explique ta dernière réponse plus simplement.'], ['Un exemple', 'Donne-moi un exemple concret.'], ['En 3 points', 'Résume ta dernière réponse en 3 points.'], ['Quiz-moi', 'Pose-moi 3 questions sur ce sujet, une par une.']].forEach(function (p) {
          fu.appendChild(actBtn(p[0], function () { send(p[1]); }));
        });
        b.appendChild(fu);
      }
    });
    updateMeta(); updateDown();
  }

  function clearMarks() {
    [].forEach.call(log.querySelectorAll('mark'), function (m) { var p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
  }
  function doFind(q) {
    clearMarks(); var n = 0, first = null;
    q = (q || '').trim(); if (q.length < 2) { meta.textContent = ''; return; }
    var rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    [].forEach.call(log.querySelectorAll('.ai-b'), function (b) {
      var w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, { acceptNode: function (t) { return t.parentNode.closest('.ai-act') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } }), nodes = [], t;
      while ((t = w.nextNode())) nodes.push(t);
      nodes.forEach(function (tn) {
        var s = tn.nodeValue; rx.lastIndex = 0; if (!rx.test(s)) return; rx.lastIndex = 0;
        var frag = document.createDocumentFragment(), i = 0, m;
        while ((m = rx.exec(s))) { frag.appendChild(document.createTextNode(s.slice(i, m.index))); var mk2 = document.createElement('mark'); mk2.textContent = m[0]; frag.appendChild(mk2); if (!first) first = mk2; n++; i = m.index + m[0].length; if (!m[0].length) rx.lastIndex++; }
        frag.appendChild(document.createTextNode(s.slice(i))); tn.parentNode.replaceChild(frag, tn);
      });
    });
    meta.textContent = n ? n + ' trouvé' + (n > 1 ? 's' : '') : 'Aucun résultat';
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function convoText() {
    return [].filter.call(log.children, function (n) { return n.classList.contains('ai-b') && (n.classList.contains('u') || n.classList.contains('a')); })
      .map(function (n) { return (n.classList.contains('u') ? 'Moi : ' : 'X.Uni : ') + bubText(n); }).join('\n\n');
  }
  function doExport() {
    var t = convoText(); if (!t) return;
    if (navigator.share) { navigator.share({ title: 'Conversation X.Uni', text: t }).catch(function () {}); return; }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
    a.download = 'conversation-xuni.txt'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function fsGet() { var v = 1; try { v = parseFloat(localStorage.getItem(FSK)) || 1; } catch (e) {} return Math.min(1.5, Math.max(.8, v)); }
  function fsSet(d) { var v = Math.round((fsGet() + d) * 10) / 10; v = Math.min(1.5, Math.max(.8, v)); try { localStorage.setItem(FSK, String(v)); } catch (e) {} P.style.setProperty('--ai-fs', v); }

  function updateMeta() {
    if (!meta || !on('meta')) return;
    var n = [].filter.call(log.children, function (x) { return x.classList.contains('u') || x.classList.contains('a'); }).length, c = convoText().length;
    if (!findIn || findIn.hidden) meta.textContent = n + ' msg · ~' + Math.round(c / 4) + ' tokens';
  }
  function updateDown() { if (downBtn) downBtn.hidden = !on('bottom') || (log.scrollHeight - log.scrollTop - log.clientHeight < 160); }
  function updateCount() { if (!countEl) return; var n = inEl.value.length; countEl.hidden = !on('count') || !n; countEl.textContent = n + ' / 2000'; }

  function startDict() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    if (rec) { try { rec.stop(); } catch (e) {} return; }
    var base = inEl.value ? inEl.value.replace(/\s*$/, ' ') : '';
    rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false;
    rec.onresult = function (e) { var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; inEl.value = base + t; inEl.dispatchEvent(new Event('input')); };
    rec.onend = rec.onerror = function () { rec = null; dictBtn.classList.remove('on'); };
    dictBtn.classList.add('on'); try { rec.start(); } catch (e) { rec = null; dictBtn.classList.remove('on'); }
  }

  function buildAI() {
    P = $('#aiP'); if (!P || P.dataset.ft) return; P.dataset.ft = '1';
    log = $('#aiLog'); inEl = $('#aiIn'); form = $('#aiForm'); sel = $('#aiLes');
    if (!log || !inEl || !form) return;
    P.style.setProperty('--ai-fs', fsGet());

    /* barre d'outils */
    tools = mk('div', 'ai-tools'); tools.id = 'aiTools';
    function tb(id, txt, fn) { var b = mk('button', '', txt); b.type = 'button'; b.id = id; b.addEventListener('click', fn); tools.appendChild(b); return b; }
    tb('aiTFind', '🔍 Chercher', function () { findIn.hidden = !findIn.hidden; if (!findIn.hidden) findIn.focus(); else { findIn.value = ''; doFind(''); updateMeta(); } });
    findIn = mk('input'); findIn.type = 'search'; findIn.hidden = true; findIn.placeholder = 'Mot à chercher…'; findIn.setAttribute('aria-label', 'Chercher dans la conversation');
    findIn.setAttribute('style', 'flex:none;width:150px;height:32px;border:1px solid var(--line);border-radius:999px;padding:0 12px;background:var(--bg);color:var(--ink);font-size:16px');
    findIn.addEventListener('input', function () { doFind(findIn.value); });
    tools.appendChild(findIn);
    tb('aiTExp', '⬇ Exporter', doExport);
    tb('aiTMinus', 'A−', function () { fsSet(-.1); });
    tb('aiTPlus', 'A+', function () { fsSet(.1); });
    meta = mk('span', 'meta'); tools.appendChild(meta);
    var chips = $('#aiChips'); chips.after(tools);

    /* raccourcis en plus */
    EXTRA.forEach(function (x) { var b = mk('button', '', x[0]); b.type = 'button'; b.dataset.x = x[1]; b.className = 'ft-x'; chips.appendChild(b); });
    chips.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button[data-x]'); if (b) { inEl.value = ''; runCmd(b.dataset.x); } });

    /* menu « / », compteur, bouton descendre, dictée */
    slashEl = mk('div'); slashEl.id = 'aiSlash'; slashEl.hidden = true; P.appendChild(slashEl);
    countEl = mk('span'); countEl.id = 'aiCount'; countEl.hidden = true; P.appendChild(countEl);
    downBtn = mk('button'); downBtn.id = 'aiDown'; downBtn.type = 'button'; downBtn.hidden = true; downBtn.setAttribute('aria-label', 'Descendre');
    downBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
    downBtn.addEventListener('click', function () { log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' }); }); P.appendChild(downBtn);
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      dictBtn = mk('button'); dictBtn.id = 'aiDict'; dictBtn.type = 'button'; dictBtn.setAttribute('aria-label', 'Dictée vocale');
      dictBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21"/></svg>';
      dictBtn.addEventListener('click', startDict); form.insertBefore(dictBtn, $('#aiSend'));
    }

    inEl.addEventListener('input', function () { updateCount(); showSlash(); });
    log.addEventListener('scroll', updateDown, { passive: true });
    /* « /commande » envoyée avec Entrée */
    form.addEventListener('submit', function (e) {
      var v = inEl.value.trim();
      if (on('slash') && /^\/\S+$/.test(v) && CMD.some(function (c) { return c[0] === v.toLowerCase(); })) { e.preventDefault(); e.stopImmediatePropagation(); slashEl.hidden = true; runCmd(v.toLowerCase()); }
      else slashEl.hidden = true;
    }, true);
    document.addEventListener('keydown', function (e) {
      if (P.hidden || !on('keys')) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); if (form.requestSubmit) form.requestSubmit(); }
      else if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); var nb = $('#aiNew'); if (nb) nb.click(); }
      else if (e.key === 'Escape') {
        if (!slashEl.hidden) { slashEl.hidden = true; return; }
        var sh = $('#aiSheet'), hs = $('#aiHistSheet'); if ((sh && !sh.hidden) || (hs && !hs.hidden)) return;
        var cl = $('#aiClose'); if (cl) cl.click();
      }
    });
    new MutationObserver(function () { clearTimeout(obsT); obsT = setTimeout(decorate, 120); })
      .observe(log, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-keep'] });
  }

  function applyAI() {
    if (!P || !tools) return;
    var show = { aiTFind: on('find'), aiTExp: on('export'), aiTMinus: on('size'), aiTPlus: on('size') };
    Object.keys(show).forEach(function (k) { var b = $('#' + k); if (b) b.hidden = !show[k]; });
    findIn.hidden = findIn.hidden || !on('find'); if (!on('find')) { findIn.value = ''; try { clearMarks(); } catch (e) {} }
    meta.hidden = !on('meta');
    tools.hidden = !(on('find') || on('export') || on('size') || on('meta'));
    [].forEach.call($('#aiChips').querySelectorAll('.ft-x'), function (b) { b.hidden = !on('chips'); });
    if (dictBtn) dictBtn.hidden = !on('dict');
    [].forEach.call(log.querySelectorAll('.ai-b'), function (b) { delete b.dataset.ax; });
    decorate(); updateCount(); showSlash(); updateDown(); updateMeta();
  }

  /* ================= application globale ================= */
  function apply() {
    var h = document.documentElement;
    h.classList.toggle('fx-badge-off', !on('badgefx'));
    h.classList.toggle('fx-badge-pill', on('badgepill'));
    h.classList.toggle('fx-badge-hide', !on('badgeshow'));
    applyAI();
  }

  document.addEventListener('ui-role', function (e) { R = e.detail || R; apply(); renderPage(); });
  var dlg = $('#settings');
  if (dlg) new MutationObserver(function () { if (dlg.open) renderPage(); }).observe(dlg, { attributes: true, attributeFilter: ['open'] });

  function start() { buildAI(); apply(); renderPage(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
