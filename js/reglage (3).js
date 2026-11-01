/* U&I — js/reglage.js
   Réglages façon Facebook : carte de profil, raccourcis, catégories en liste,
   et chaque réglage s’ouvre dans sa propre page (flèche ← pour revenir).
   À charger APRÈS script.js. Ne change aucune fonction : il réorganise seulement l’affichage. */
(function () {
  var tries = 0;
  function start() {
    var dlg = document.getElementById('settings');
    var ready = dlg && dlg.querySelector(':scope > .sec.sx');
    if (!ready) { if (tries++ < 40) setTimeout(start, 150); return; }
    try { build(dlg); } catch (e) { console.warn('Réglages (style Facebook) :', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  function build(dlg) {
    if (dlg.dataset.fb) return;
    dlg.dataset.fb = '1';

    /* ---------- icônes ---------- */
    var IC = {
      back: '<path d="M15 6l-6 6 6 6"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
      chev: '<path d="M9 6l6 6-6 6"/>',
      out: '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9"/>'
    };
    function svg(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + '</svg>'; }

    /* ---------- styles ---------- */
    var css = [
      '#settings.fb{width:100vw;max-width:100vw;height:100vh;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;border-radius:0;',
      'background:var(--bg);overflow-y:auto;overscroll-behavior:contain}',
      '@media (min-width:700px){#settings.fb{width:min(30rem,100vw);height:min(46rem,100dvh);margin:auto;border-radius:20px;border:1px solid var(--line)}}',
      '#settings.fb > :not(#fbTop){margin-left:14px;margin-right:14px}',
      '#fbTop{position:sticky;top:0;z-index:6;display:flex;align-items:center;gap:10px;margin:0;',
      'padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:var(--surface);border-bottom:1px solid var(--line)}',
      '#fbTop h2{flex:1;margin:0;font-size:1.3rem;font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#fbBack{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--soft);color:var(--ink);display:grid;place-items:center;cursor:pointer;padding:0}',
      '#fbBack:focus:not(:focus-visible),#fbTop h2:focus{outline:none}',
      '#fbBack svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}',
      '#settings.fb .sxs{margin-top:12px;margin-bottom:6px}',
      '#settings.fb #sxSearch{min-height:44px;border-radius:999px;border:0;background:var(--soft);padding:0 18px;font-size:.95rem}',
      /* carte de profil */
      '#fbProfile{display:flex;align-items:center;gap:14px;width:calc(100% - 28px);box-sizing:border-box;margin-top:12px;margin-bottom:0;padding:14px;',
      'border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--ink);font:inherit;text-align:left;cursor:pointer}',
      '#fbProfile .avatar{width:64px;height:64px;font-size:1.5rem;flex:none}',
      '#fbProfile .fbn{flex:1;min-width:0}',
      '#fbProfile .fbn b{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:1.05rem;font-weight:700;overflow:hidden;overflow-wrap:anywhere}',
      '#fbProfile .fbn small{display:block;margin-top:2px;color:var(--muted);font-size:.82rem}',
      '#fbProfile .fbc{flex:none;color:var(--muted)}',
      '#fbProfile .fbc svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      /* raccourcis */
      '#fbShort{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;margin-bottom:2px}',
      '#fbShort button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 4px 10px;border:1px solid var(--line);border-radius:16px;',
      'background:var(--surface);color:var(--ink);font:inherit;font-size:.74rem;font-weight:600;cursor:pointer}',
      '#fbShort .fbi{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--soft);color:var(--accent)}',
      '#fbShort .fbi svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
      /* groupes */
      '#fbList .fbg{margin-top:20px}',
      '#fbList .fbg[hidden]{display:none !important}',
      '#fbList .fbgt{margin:0 6px 8px;font-size:.78rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}',
      '#fbList .fbgc{background:var(--surface);border:1px solid var(--line);border-radius:18px;overflow:hidden}',
      '#fbList .fbgc > .sec.sx{padding:0 14px;border-bottom:1px solid var(--line)}',
      '#fbList .fbgc > .sec.sx:last-child{border-bottom:0}',
      '#fbList .sxh{min-height:62px;padding:10px 0}',
      '#fbList .sxi{width:42px;height:42px}',
      '#fbList .sxt b{font-size:.98rem}',
      '#fbList .sxt small{font-size:.8rem}',
      '#settings.fb .sec.sx.dg .sxt b{color:var(--danger,#e5484d)}',
      /* page d’un réglage */
      '#settings.fbp > :not(#fbTop):not(#fbList){display:none !important}',
      '#settings.fbp #fbList .fbg{margin-top:14px}',
      '#settings.fbp #fbList .fbg:not(.fbcur){display:none}',
      '#settings.fbp #fbList .fbgt{display:none}',
      '#settings.fbp #fbList .fbgc{border-radius:18px}',
      '#settings.fbp .fbgc > .sec.sx:not(.fbcur){display:none !important}',
      '#settings.fbp .sec.sx.fbcur{display:block !important}',
      '#settings.fbp .fbgc > .sec.sx.fbcur{padding:0;border-bottom:0}',
      '#settings.fbp .sec.sx.fbcur > .sxh{display:none}',
      '#settings.fbp .sec.sx.fbcur > .sxb{display:block;padding:16px 14px 18px}',
      '#settings.fbp #fbList{animation:fbIn .22s ease-out}',
      '@keyframes fbIn{from{opacity:0;transform:translateX(22px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion:reduce){#settings.fbp #fbList{animation:none}}',
      /* recherche en cours */
      '#settings.fbq #fbProfile,#settings.fbq #fbShort{display:none}',
      /* déconnexion + pied de page */
      '#settings.fb #setLogout{width:100%;min-height:50px;border-radius:16px;font-weight:700}',
      '#settings.fb > .sec:not(.sx){background:transparent;border:0;padding:0}',
      '#settings.fb > .sec:not(.sx){margin-top:20px}',
      '#settings.fbq > .sec:not(.sx){display:none}',
      '#settings.fb{padding-bottom:28px}'
    ].join('');
    var st = document.createElement('style');
    st.id = 'fbStyle';
    st.textContent = css;
    document.head.appendChild(st);
    dlg.classList.add('fb');

    /* ---------- barre du haut : ← et titre ---------- */
    var h2 = dlg.querySelector('h2');
    var listTitle = h2 ? h2.textContent : 'Réglages';
    var top = document.createElement('div');
    top.id = 'fbTop';
    var back = document.createElement('button');
    back.id = 'fbBack';
    back.type = 'button';
    back.setAttribute('aria-label', 'Retour');
    back.innerHTML = svg('back');
    h2.tabIndex = -1;
    h2.setAttribute('autofocus', '');
    h2.parentNode.insertBefore(top, h2);
    top.appendChild(back);
    top.appendChild(h2);

    /* ---------- regroupement des lignes en catégories ---------- */
    var rows = Array.prototype.slice.call(dlg.querySelectorAll(':scope > .sec.sx'));
    function titleOf(s) { var b = s.querySelector(':scope > .sxh b'); return b ? b.textContent.trim() : ''; }
    var GROUPS = [
      ['Compte', ['Photo de profil', 'Mon nom', 'Mon anniversaire']],
      ['Préférences', ['Style', 'Apparence', 'Notifications']],
      ['Confidentialité et sécurité', ['Confidentialité', 'Verrouillage', 'Mot de passe', 'E-mail de récupération']],
      ['Fonctionnalités', ['Fonctionnalités']],
      ['Créateur', ['Badge créateur', 'Outils créateur']],
      ['Application', ['Application', 'Espace']],
      ['Zone sensible', ['Compte']]
    ];
    // l’e-mail de récupération n’avait pas d’icône : on lui en donne une
    rows.forEach(function (s) {
      if (titleOf(s).indexOf('E-mail') === 0) {
        var i = s.querySelector('.sxi'), sm = s.querySelector('.sxt small');
        if (i) i.innerHTML = svg('mail');
        if (sm && !sm.textContent) sm.textContent = 'Pour retrouver ton compte';
      }
    });

    var list = document.createElement('div');
    list.id = 'fbList';
    var used = [];
    var groupEls = [];
    function makeGroup(name, members) {
      var g = document.createElement('section');
      g.className = 'fbg';
      var t = document.createElement('p');
      t.className = 'fbgt';
      t.textContent = name;
      var c = document.createElement('div');
      c.className = 'fbgc';
      g.appendChild(t);
      g.appendChild(c);
      members.forEach(function (s) { c.appendChild(s); used.push(s); });
      groupEls.push(g);
      return g;
    }
    GROUPS.forEach(function (G) {
      var m = rows.filter(function (s) {
        var t = titleOf(s);
        return G[1].some(function (n) { return t.indexOf(n) === 0; });
      });
      if (m.length) list.appendChild(makeGroup(G[0], m));
    });
    var rest = rows.filter(function (s) { return used.indexOf(s) === -1; });
    if (rest.length) list.appendChild(makeGroup('Autres', rest));

    /* ---------- carte de profil + raccourcis ---------- */
    var profile = document.createElement('button');
    profile.id = 'fbProfile';
    profile.type = 'button';
    profile.innerHTML = '<span class="avatar" id="fbAv"></span><span class="fbn"><b id="fbName"></b><small>Voir et modifier ton profil</small></span><span class="fbc">' + svg('chev') + '</span>';

    var shortcuts = document.createElement('div');
    shortcuts.id = 'fbShort';
    [['Profil', 'Photo de profil'], ['Thème', 'Style'], ['Notifs', 'Notifications'], ['Options', 'Fonctionnalités'], ['Sécurité', 'Mot de passe'], ['Badge', 'Badge créateur']].forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-go', p[1]);
      var src = rows.filter(function (s) { return titleOf(s).indexOf(p[1]) === 0; })[0];
      var ico = src && src.querySelector('.sxi') ? src.querySelector('.sxi').innerHTML : '';
      b.innerHTML = '<span class="fbi">' + ico + '</span><span>' + p[0] + '</span>';
      shortcuts.appendChild(b);
    });

    var wrapSearch = dlg.querySelector('.sxs');
    var anchor = wrapSearch || top;
    anchor.after(profile);
    profile.after(shortcuts);
    shortcuts.after(list);

    var inp = document.getElementById('sxSearch');

    /* ---------- bas de la fenêtre ---------- */
    var lo = document.getElementById('setLogout');
    var lastBlock = lo ? lo.closest('.sec') : null;
    // le bouton « Fermer » du bas n’est plus utile : la flèche ← du haut le remplace
    var closeBtn = document.getElementById('setClose');
    if (closeBtn) closeBtn.style.display = 'none';
    // la ligne « Se déconnecter » passe avant le pied de page, juste sous la liste
    if (lastBlock) list.after(lastBlock);

    /* ---------- ouverture / fermeture d’une page ---------- */
    var cur = null;
    function openPage(sec) {
      var h = sec.querySelector(':scope > .sxh'), b = sec.querySelector(':scope > .sxb');
      if (!h || !b) return;
      cur = sec;
      dlg.classList.add('fbp');
      sec.classList.add('fbcur', 'open');
      var g = sec.closest('.fbg');
      if (g) { g.hidden = false; g.classList.add('fbcur'); }
      b.hidden = false;
      h.setAttribute('aria-expanded', 'true');
      if (h2) { h2.textContent = ''; var cr = document.createElement('small'); cr.textContent = 'Réglages ›'; h2.appendChild(cr); h2.appendChild(document.createTextNode(titleOf(sec))); }
      remember(titleOf(sec));
      pagerUpdate();
      dlg.scrollTop = 0;
    }
    function closePage(chain) {
      if (!cur) return;
      var sec = cur, h = sec.querySelector(':scope > .sxh'), b = sec.querySelector(':scope > .sxb');
      cur = null;
      dlg.classList.remove('fbp');
      sec.classList.remove('fbcur', 'open');
      var g = sec.closest('.fbg');
      if (g) g.classList.remove('fbcur');
      if (b) b.hidden = true;
      if (h) h.setAttribute('aria-expanded', 'false');
      if (h2) h2.textContent = listTitle;
      dlg.scrollTop = 0;
      if (!chain) refresh();
    }
    function goTo(name) {
      var s = rows.filter(function (x) { return titleOf(x).indexOf(name) === 0; })[0];
      if (s) openPage(s);
    }

    // on prend la main sur le clic des lignes (l’ancien dépliage est remplacé par une page)
    dlg.addEventListener('click', function (e) {
      var h = e.target.closest ? e.target.closest('.sxh') : null;
      if (!h || !dlg.contains(h)) return;
      e.stopPropagation();
      e.preventDefault();
      if (!e.isTrusted) return; // clic automatique de la recherche : on n’ouvre rien
      var sec = h.closest('.sec.sx');
      if (sec) openPage(sec);
    }, true);

    back.addEventListener('click', function () { if (cur) closePage(); else dlg.close(); });
    profile.addEventListener('click', function () { goTo('Photo de profil'); });
    shortcuts.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-go]') : null;
      if (b) goTo(b.getAttribute('data-go'));
    });
    dlg.addEventListener('cancel', function (e) { if (cur) { e.preventDefault(); closePage(); } });
    dlg.addEventListener('close', function () { closePage(); });


    /* ---------- navigation : récents, compteur de résultats, page précédente / suivante, glisser pour revenir ---------- */
    var recent = document.createElement('div');
    recent.id = 'fbRecent'; recent.hidden = true;
    shortcuts.after(recent);
    var RK = 'uandi-set-recent';
    function getRecent() { try { return JSON.parse(localStorage.getItem(RK) || '[]') || []; } catch (e) { return []; } }
    function remember(t) {
      if (!t) return;
      var a = getRecent().filter(function (x) { return x !== t; });
      a.unshift(t);
      try { localStorage.setItem(RK, JSON.stringify(a.slice(0, 3))); } catch (e) {}
    }
    function paintRecent() {
      var a = getRecent().filter(function (t) {
        return rows.some(function (s) { return titleOf(s) === t && !s.hidden && !s.classList.contains('sx-off'); });
      });
      recent.textContent = '';
      recent.hidden = !a.length;
      if (!a.length) return;
      var l = document.createElement('span');
      l.textContent = 'Récemment';
      recent.appendChild(l);
      a.forEach(function (t) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = t;
        b.addEventListener('click', function () { goTo(t); });
        recent.appendChild(b);
      });
    }
    var count = document.createElement('p');
    count.id = 'fbCount'; count.hidden = true; count.setAttribute('role', 'status');
    (dlg.querySelector('.sxs') || top).after(count);
    function paintCount() {
      var q = inp && inp.value.trim();
      if (!q) { count.hidden = true; return; }
      var n = rows.filter(function (s) { return !s.hidden && !s.classList.contains('sx-off'); }).length;
      count.hidden = false;
      count.textContent = n ? n + ' réglage' + (n > 1 ? 's' : '') + ' trouvé' + (n > 1 ? 's' : '') : '';
    }
    var pager = document.createElement('div');
    pager.id = 'fbPager';
    var pv = document.createElement('button'), nx = document.createElement('button');
    pv.type = nx.type = 'button'; nx.className = 'nx';
    pager.appendChild(pv); pager.appendChild(nx);
    list.appendChild(pager);
    function visibleRows() { return rows.filter(function (s) { return !s.hidden && !s.classList.contains('sx-off') || s === cur; }); }
    function pagerUpdate() {
      var v = visibleRows(), i = v.indexOf(cur), p = v[i - 1], n = v[i + 1];
      pv.disabled = !p; nx.disabled = !n;
      pv.innerHTML = '<small>← Précédent</small><span></span>'; pv.lastChild.textContent = p ? titleOf(p) : '';
      nx.innerHTML = '<small>Suivant →</small><span></span>'; nx.lastChild.textContent = n ? titleOf(n) : '';
      pv.onclick = function () { if (p) { closePage(true); openPage(p); } };
      nx.onclick = function () { if (n) { closePage(true); openPage(n); } };
    }
    var tx = 0, ty = 0;
    dlg.addEventListener('touchstart', function (e) { var t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
    dlg.addEventListener('touchend', function (e) {
      if (!cur) return;
      var t = e.changedTouches[0];
      if (tx < 36 && t.clientX - tx > 80 && Math.abs(t.clientY - ty) < 60) closePage();
    }, { passive: true });

    /* ---------- rafraîchissements ---------- */
    function refreshProfile() {
      var av = document.getElementById('setAvatar'), mine = document.getElementById('fbAv');
      if (av && mine) {
        mine.className = 'avatar';
        mine.textContent = av.textContent;
        mine.setAttribute('style', av.getAttribute('style') || '');
      }
      var me = document.getElementById('meName'), nm = document.getElementById('fbName');
      if (me && nm) nm.innerHTML = me.innerHTML || '';
    }
    function refreshEmail() {
      var stat = document.getElementById('emStat');
      rows.forEach(function (s) {
        if (titleOf(s).indexOf('E-mail') === 0) {
          var sm = s.querySelector('.sxt small');
          if (sm && stat && stat.textContent && stat.textContent.indexOf('Vérification') !== 0) {
            sm.textContent = stat.textContent.replace(/^E-mail enregistré : /, '');
          }
        }
      });
    }
    function refresh() {
      if (cur) return;
      groupEls.forEach(function (g) {
        var any = Array.prototype.some.call(g.querySelectorAll('.sec.sx'), function (s) {
          return !s.hidden && !s.classList.contains('sx-off');
        });
        g.hidden = !any;
      });
      refreshProfile();
      refreshEmail();
      paintRecent();
      paintCount();
    }
    new MutationObserver(function () {
      if (dlg.open) {
        setTimeout(refresh, 60);
        setTimeout(refresh, 700);
      }
    }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
    dlg.addEventListener('click', function () { setTimeout(refresh, 120); });

    if (inp) inp.addEventListener('input', function () {
      dlg.classList.toggle('fbq', !!inp.value.trim());
      refresh();
    });

    refresh();
  }
})();
