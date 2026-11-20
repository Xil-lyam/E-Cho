/* X'enify - js/moderation.js
   Écran des créateurs : lire et traiter les signalements (table public.reports).
   Ajoute un bouton « Signalements » à côté de « Comptes » (#accList) dans la zone créateur.
   Utilise window.__sb et window.__xenUser. */
(function () {
  'use strict';
  var KINDS = { profile: 'Personne', message: 'Message', announcement: 'Annonce', anon_thread: 'Fil anonyme', group: 'Groupe' };
  var REASONS = { spam: 'Spam ou publicité', harcelement: 'Harcèlement ou menaces', contenu_inapproprie: 'Contenu inapproprié', usurpation: 'Usurpation d’identité', autre: 'Autre' };
  var TABS = [['open', 'Ouverts'], ['done', 'Traités'], ['dismissed', 'Rejetés']];
  var dlg = null, tabsEl, boxEl, errEl, rows = [], names = {}, tab = 'open';

  function me() { var u = window.__xenUser; return (u && u.uid) || null; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function nm(uid) { return uid ? (names[uid] ? cap(names[uid]) : String(uid).slice(0, 8) + '…') : '—'; }
  function ts(r) { var t = Date.parse(r.created_at); return isNaN(t) ? 0 : t; }
  function when(t) { return t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; }
  function showErr(t) { errEl.textContent = t || ''; errEl.hidden = !t; }

  function build() {
    dlg = el('dialog', 'sheet'); dlg.id = 'repDlg'; dlg.setAttribute('aria-label', 'Signalements');
    dlg.appendChild(el('p', 'lbl', 'Signalements'));
    tabsEl = el('div', 'pfrow');
    errEl = el('p', 'err'); errEl.hidden = true;
    boxEl = el('div'); boxEl.style.cssText = 'max-height:65vh;overflow:auto';
    var close = el('button', 'ghost', 'Fermer'); close.type = 'button';
    close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    [tabsEl, errEl, boxEl, close].forEach(function (x) { dlg.appendChild(x); });
    document.body.appendChild(dlg);
  }

  function load() {
    var sb = window.__sb; if (!sb) return;
    showErr(''); boxEl.replaceChildren(el('p', 'hint', 'Chargement…'));
    Promise.all([sb.from('reports').select('*').limit(300), sb.from('profiles').select('id,username')]).then(function (res) {
      if (res[0].error) throw res[0].error;
      rows = res[0].data || []; names = {};
      (res[1].data || []).forEach(function (p) { names[p.id] = p.username || ''; });
      rows.sort(function (a, b) { return ts(b) - ts(a); });
      paint();
    }).catch(function () { boxEl.replaceChildren(); showErr('Chargement impossible.'); });
  }

  /* change le statut ; handled_by / handled_at forment le journal (si ces colonnes existent) */
  function setStatus(r, st, then) {
    var sb = window.__sb; showErr('');
    function run(patch) {
      var q = sb.from('reports').update(patch);
      q = (r.id !== undefined) ? q.eq('id', r.id) : q.eq('reporter', r.reporter).eq('target_kind', r.target_kind).eq('target_id', r.target_id);
      return q.select();
    }
    var full = { status: st, handled_by: me(), handled_at: new Date().toISOString() };
    run(full).then(function (x) {
      if (x.error && (x.error.code === '42703' || x.error.code === 'PGRST204')) return run({ status: st });
      return x;
    }).then(function (x) {
      if (x.error || !x.data || !x.data.length) throw x.error || new Error('none');
      r.status = st; r.handled_by = full.handled_by; r.handled_at = full.handled_at;
      if (then) then();
      paint();
    }).catch(function () { showErr('Action impossible.'); paint(); });
  }

  function suspend(r) {
    var uid = r.target_user || (r.target_kind === 'profile' ? r.target_id : null);
    if (!uid || !window.__sb) return;
    if (!confirm('Suspendre ' + nm(uid) + ' pendant 7 jours ?')) return;
    window.__sb.rpc('creator_ban', { p_uid: uid, p_days: 7 }).then(function (x) {
      if (x.error) throw x.error;
      setStatus(r, 'done');
    }).catch(function () { showErr('Suspension impossible.'); });
  }

  function targetText(r) {
    var k = r.target_kind, lab = KINDS[k] || k || 'Cible';
    if (k === 'profile') return lab + ' : ' + nm(r.target_user || r.target_id);
    if (k === 'message') return lab + (r.target_user ? ' de ' + nm(r.target_user) : '');
    return lab + ' (' + String(r.target_id || '').slice(0, 8) + '…)';
  }

  function item(r) {
    var d = el('div'); d.style.cssText = 'padding:10px 0;border-bottom:1px solid rgba(128,128,128,.25)';
    var l1 = el('p', 'lbl', targetText(r) + ' · ' + (REASONS[r.reason] || r.reason || ''));
    var l2 = el('p', 'hint', 'Par ' + nm(r.reporter) + (ts(r) ? ' · ' + when(ts(r)) : ''));
    d.appendChild(l1); d.appendChild(l2);
    if (r.details) { var p = el('p', '', r.details); p.style.whiteSpace = 'pre-wrap'; d.appendChild(p); }
    if (r.status === 'open') {
      var row = el('div', 'pfrow');
      var ok = el('button', 'ghost', 'Traité'); ok.type = 'button';
      ok.addEventListener('click', function () { ok.disabled = true; setStatus(r, 'done'); });
      var no = el('button', 'ghost', 'Rejeter'); no.type = 'button';
      no.addEventListener('click', function () { no.disabled = true; setStatus(r, 'dismissed'); });
      row.appendChild(ok); row.appendChild(no);
      if (r.target_user || r.target_kind === 'profile') {
        var bn = el('button', 'ghost', 'Suspendre 7 j'); bn.type = 'button';
        bn.addEventListener('click', function () { suspend(r); });
        row.appendChild(bn);
      }
      d.appendChild(row);
    } else if (r.handled_by) {
      var h = Date.parse(r.handled_at);
      d.appendChild(el('p', 'hint', (r.status === 'done' ? 'Traité' : 'Rejeté') + ' par ' + nm(r.handled_by) + (isNaN(h) ? '' : ' · ' + when(h))));
    }
    return d;
  }

  function paint() {
    tabsEl.replaceChildren();
    TABS.forEach(function (t) {
      var n = rows.filter(function (r) { return r.status === t[0]; }).length;
      var b = el('button', 'ghost', t[1] + ' (' + n + ')'); b.type = 'button';
      b.setAttribute('aria-pressed', tab === t[0] ? 'true' : 'false');
      if (tab === t[0]) b.style.fontWeight = '700';
      b.addEventListener('click', function () { tab = t[0]; paint(); });
      tabsEl.appendChild(b);
    });
    var list = rows.filter(function (r) { return r.status === tab; });
    boxEl.replaceChildren();
    if (!list.length) { boxEl.appendChild(el('p', 'hint', 'Aucun signalement.')); return; }
    list.forEach(function (r) { boxEl.appendChild(item(r)); });
  }

  function open() { if (!dlg) build(); tab = 'open'; dlg.showModal(); load(); }

  function init() {
    var acc = document.getElementById('accList');
    if (!acc || document.getElementById('repList')) return;
    var b = el('button', acc.className, 'Signalements'); b.type = 'button'; b.id = 'repList';
    acc.parentNode.insertBefore(b, acc.nextSibling);
    b.addEventListener('click', open);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
