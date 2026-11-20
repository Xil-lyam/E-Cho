/* X'enify - js/blocage.js
   Ajoute « Bloquer / Débloquer » dans le menu ⋯ d'une discussion privée.
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
      alert('Action impossible (connexion ou règles Supabase « blocks »).');
    }).then(function () { busy = false; btn.disabled = false; });
  }

  function init() {
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
