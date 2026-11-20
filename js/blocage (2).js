/* X'enify - js/blocage.js
   Ajoute « Bloquer / Débloquer » dans le menu ⋯ d'une discussion privée,
   et « Comptes bloqués » (liste + Débloquer) dans les réglages.
   Utilise window.__sb (client Supabase) et window.__xenUser (compte connecté).
   Table : public.blocks (blocker, blocked). */
(function () {
  'use strict';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var btn = null, busy = false;

  function me() { var u = window.__xenUser; return (u && u.uid) || null; }

  /* L'identifiant d'une discussion privée est « uuidA_uuidB » (triés) : on en tire l'autre personne. */
  function other() {
    var m = me(), c = history.state && history.state.chat;
    if (!m || typeof c !== 'string') return null;
    var p = c.split('_');
    if (p.length !== 2 || !UUID.test(p[0]) || !UUID.test(p[1])) return null;
    return p[0] === m ? p[1] : (p[1] === m ? p[0] : null);
  }

  function chatTitle() {
    var n = document.getElementById('chatName');
    return (n && n.textContent.trim()) || 'cette personne';
  }

  function label(isBlocked) { btn.textContent = isBlocked ? 'Débloquer' : 'Bloquer'; btn.dataset.on = isBlocked ? '1' : ''; }

  /* à chaque ouverture du menu : on relit l'état réel dans la base */
  function paint() {
    var o = other(), sb = window.__sb;
    if (!btn) return;
    btn.hidden = !o;           /* caché dans les groupes */
    if (!o || !sb) return;
    label(false);
    sb.from('blocks').select('blocked').eq('blocked', o).maybeSingle().then(function (r) {
      if (other() !== o || r.error) return;
      label(!!r.data);
    }, function () {});
  }

  function onClick() {
    var o = other(), sb = window.__sb, m = me();
    if (!o || !sb || !m || busy) return;
    var on = btn.dataset.on === '1', nm = chatTitle();
    if (!on && !confirm('Bloquer ' + nm + ' ? Elle ne pourra plus t’écrire et cette discussion sera masquée. Tu pourras la débloquer à tout moment.')) return;
    busy = true; btn.disabled = true;
    var q = on ? sb.from('blocks').delete().eq('blocker', m).eq('blocked', o)
               : sb.from('blocks').insert({ blocked: o });
    q.then(function (r) {
      if (r.error) throw r.error;
      var menu = document.getElementById('chatMenu'); if (menu) menu.hidden = true;
      try { if (window.__blkReload) window.__blkReload(); } catch (e) {}
      if (!on) { try { history.back(); } catch (e) {} }   /* retour à la liste : la discussion bloquée y est masquée */
    }).catch(function () {
      alert('Action impossible.');
    }).then(function () { busy = false; btn.disabled = false; });
  }

  /* ---------- liste des comptes bloqués (réglages) ---------- */
  var ldlg = null, lbox = null, lerr = null;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function cap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }

  function openList() {
    var sb = window.__sb, m = me(); if (!sb || !m) return;
    if (!ldlg) {
      ldlg = el('dialog', 'sheet'); ldlg.setAttribute('aria-label', 'Comptes bloqués');
      ldlg.appendChild(el('p', 'lbl', 'Comptes bloqués'));
      lerr = el('p', 'err'); lerr.hidden = true;
      lbox = el('div'); lbox.style.cssText = 'max-height:60vh;overflow:auto';
      var close = el('button', 'ghost', 'Fermer'); close.type = 'button';
      close.addEventListener('click', function () { ldlg.close(); });
      ldlg.addEventListener('click', function (e) { if (e.target === ldlg) ldlg.close(); });
      [lerr, lbox, close].forEach(function (x) { ldlg.appendChild(x); });
      document.body.appendChild(ldlg);
    }
    lerr.hidden = true; lbox.replaceChildren(el('p', 'hint', 'Chargement…'));
    ldlg.showModal();
    sb.from('blocks').select('blocked,created_at').then(function (r) {
      if (r.error) throw r.error;
      var list = (r.data || []).sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); });
      if (!list.length) { lbox.replaceChildren(el('p', 'hint', 'Aucun compte bloqué.')); return; }
      return sb.from('profiles').select('id,username').in('id', list.map(function (x) { return x.blocked; })).then(function (p) {
        var nm = {}; (p.data || []).forEach(function (v) { nm[v.id] = v.username || ''; });
        lbox.replaceChildren();
        list.forEach(function (x) {
          var row = el('div'); row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid rgba(128,128,128,.25)';
          var d = Date.parse(x.created_at);
          var txt = el('div'); txt.appendChild(el('p', 'lbl', nm[x.blocked] ? cap(nm[x.blocked]) : 'Compte supprimé'));
          if (!isNaN(d)) txt.appendChild(el('p', 'hint', 'Bloqué le ' + new Date(d).toLocaleDateString('fr-FR')));
          var b = el('button', 'ghost', 'Débloquer'); b.type = 'button';
          b.addEventListener('click', function () {
            b.disabled = true; lerr.hidden = true;
            sb.from('blocks').delete().eq('blocker', m).eq('blocked', x.blocked).then(function (q) {
              if (q.error) throw q.error;
              row.remove();
              if (!lbox.children.length) lbox.appendChild(el('p', 'hint', 'Aucun compte bloqué.'));
              try { if (window.__blkReload) window.__blkReload(); } catch (e) {}
            }).catch(function () { b.disabled = false; lerr.textContent = 'Action impossible.'; lerr.hidden = false; });
          });
          row.appendChild(txt); row.appendChild(b); lbox.appendChild(row);
        });
      });
    }).catch(function () { lbox.replaceChildren(); lerr.textContent = 'Chargement impossible.'; lerr.hidden = false; });
  }

  function initList() {
    var set = document.getElementById('settings');
    if (!set || document.getElementById('blockedList')) return;
    var lb = el('button', 'ghost', 'Comptes bloqués'); lb.type = 'button'; lb.id = 'blockedList';
    var ref = document.getElementById('badgeSec');
    if (ref && ref.parentNode) ref.parentNode.insertBefore(lb, ref); else set.appendChild(lb);
    lb.addEventListener('click', openList);
  }

  function init() {
    initList();
    var menu = document.getElementById('chatMenu');
    if (!menu || document.getElementById('blockChat')) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'blockChat'; btn.className = 'ghost'; btn.hidden = true;
    btn.textContent = 'Bloquer';
    var del = document.getElementById('delChat');
    menu.insertBefore(btn, del || null);
    btn.addEventListener('click', onClick);
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('#moreBtn')) setTimeout(paint, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
