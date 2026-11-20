/* X'enify - js/signalement.js
   Ajoute « Signaler » dans le menu ⋯ d'une discussion (privée ou groupe).
   Utilise window.__sb et window.__xenUser. Table : public.reports. */
(function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var REASONS = [
    ['spam', 'Spam ou publicité'],
    ['harcelement', 'Harcèlement ou menaces'],
    ['contenu_inapproprie', 'Contenu inapproprié'],
    ['usurpation', 'Usurpation d’identité'],
    ['autre', 'Autre']
  ];
  var btn = null, dlg = null, cur = null;

  function me() { var u = window.__xenUser; return (u && u.uid) || null; }
  function title() { var n = document.getElementById('chatName'); return (n && n.textContent.trim()) || ''; }

  /* cible de la discussion ouverte : personne (discussion privée « uuidA_uuidB ») ou groupe (un seul uuid) */
  function target() {
    var m = me(), c = history.state && history.state.chat;
    if (!m || typeof c !== 'string') return null;
    var p = c.split('_');
    if (p.length === 2 && UUID.test(p[0]) && UUID.test(p[1])) {
      var o = p[0] === m ? p[1] : (p[1] === m ? p[0] : null);
      return o ? { kind: 'profile', id: o, user: o, name: title() } : null;
    }
    if (p.length === 1 && UUID.test(c)) return { kind: 'group', id: c, user: null, name: title() };
    return null;
  }

  function build() {
    dlg = document.createElement('dialog'); dlg.className = 'sheet'; dlg.id = 'reportDlg';
    dlg.setAttribute('aria-label', 'Signaler');
    var lbl = document.createElement('p'); lbl.className = 'lbl'; lbl.id = 'rpTitle';
    var sel = document.createElement('select'); sel.className = 'field'; sel.id = 'rpReason'; sel.setAttribute('aria-label', 'Motif');
    REASONS.forEach(function (r) { var o = document.createElement('option'); o.value = r[0]; o.textContent = r[1]; sel.appendChild(o); });
    var ta = document.createElement('textarea'); ta.className = 'field'; ta.id = 'rpDetails'; ta.maxLength = 500; ta.rows = 3;
    ta.placeholder = 'Détails (facultatif)'; ta.setAttribute('aria-label', 'Détails');
    var err = document.createElement('p'); err.className = 'err'; err.id = 'rpErr'; err.hidden = true;
    var row = document.createElement('div'); row.className = 'pfrow';
    var send = document.createElement('button'); send.type = 'button'; send.className = 'ghost'; send.id = 'rpSend'; send.textContent = 'Envoyer';
    var cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ghost'; cancel.id = 'rpCancel'; cancel.textContent = 'Annuler';
    row.appendChild(send); row.appendChild(cancel);
    [lbl, sel, ta, err, row].forEach(function (x) { dlg.appendChild(x); });
    document.body.appendChild(dlg);
    cancel.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    send.addEventListener('click', submit);
  }

  function open() {
    var t = target(); if (!t) return;
    cur = t;
    if (!dlg) build();
    document.getElementById('rpTitle').textContent = t.kind === 'group' ? 'Signaler ce groupe' : 'Signaler ' + (t.name || 'cette personne');
    document.getElementById('rpReason').value = 'spam';
    document.getElementById('rpDetails').value = '';
    var e = document.getElementById('rpErr'); e.hidden = true; e.textContent = '';
    var menu = document.getElementById('chatMenu'); if (menu) menu.hidden = true;
    dlg.showModal();
  }

  function submit() {
    var sb = window.__sb, e = document.getElementById('rpErr'), send = document.getElementById('rpSend');
    if (!sb || !cur) return;
    var row = { target_kind: cur.kind, target_id: cur.id, target_user: cur.user,
      reason: document.getElementById('rpReason').value,
      details: document.getElementById('rpDetails').value.trim().slice(0, 500) || null };
    send.disabled = true; e.hidden = true;
    sb.from('reports').insert(row).then(function (r) {
      if (r.error) {
        e.textContent = (r.error.code === '23505') ? 'Tu as déjà signalé cet élément. Merci, nous allons l’examiner.' : 'Signalement impossible (connexion ou règles Supabase « reports »).';
        e.hidden = false; return;
      }
      dlg.close(); alert('Merci. Ton signalement a été envoyé.');
    }, function () { e.textContent = 'Pas de connexion. Réessaie.'; e.hidden = false; })
      .then(function () { send.disabled = false; });
  }

  function init() {
    var menu = document.getElementById('chatMenu');
    if (!menu || document.getElementById('reportChat')) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'reportChat'; btn.className = 'ghost'; btn.hidden = true; btn.textContent = 'Signaler';
    menu.insertBefore(btn, document.getElementById('delChat') || null);
    btn.addEventListener('click', open);
    document.addEventListener('click', function (ev) {
      if (ev.target.closest && ev.target.closest('#moreBtn')) setTimeout(function () { btn.hidden = !target(); }, 0);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
