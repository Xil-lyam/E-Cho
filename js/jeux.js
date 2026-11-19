/* E'cho — js/jeux.js
   Pierre · Feuille · Ciseaux (contre l'ordi OU avec un pote en ligne) + Piano.
   Fichier autonome : il ajoute ses boutons dans « Jeux », crée ses fenêtres et ses styles.
   Il retire aussi Beat Rush. Aucun autre fichier à modifier à part une ligne <script> dans index. */
(function () {
  'use strict';
  var $ = function (i) { return document.getElementById(i); };
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function mk(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  /* ================= styles ================= */
  var css = [
    '.gseg{display:flex;gap:6px;margin:8px 0}',
    '.gseg button{flex:1;padding:9px 6px;border-radius:12px;border:1.5px solid rgba(127,127,127,.3);background:transparent;color:inherit;font:inherit;font-weight:600;font-size:.85rem}',
    '.gseg button[aria-pressed="true"]{background:var(--accent,#ff3d5a);border-color:transparent;color:#fff}',
    '.grow{display:flex;gap:8px;align-items:center;margin:8px 0}',
    '.grow .field{flex:1;min-width:0}',
    '.gbig{width:100%;margin:6px 0}',
    '.gcode{flex:1;font-size:1.5rem;letter-spacing:.3em;text-align:center}',
    '.rpstop{display:flex;gap:10px;justify-content:center;margin:6px 0 4px}',
    '.rpsarena{display:flex;align-items:center;justify-content:center;gap:14px;margin:12px 0 4px}',
    '.rpshand{width:96px;height:96px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(127,127,127,.14);border:2px solid rgba(127,127,127,.25);transition:border-color .18s,background .18s,opacity .18s}',
    '.rpshand svg{width:58px;height:58px}',
    '.rpshand.win{border-color:#06b88a;background:rgba(6,184,138,.18)}',
    '.rpshand.lose{border-color:#ff5d8f;background:rgba(255,93,143,.16);opacity:.75}',
    '.rpshand.shake{animation:rpsShake .28s ease-in-out 0s 3}',
    '@keyframes rpsShake{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-14px) rotate(-8deg)}}',
    '.rpsvs{font-weight:800;opacity:.55;letter-spacing:.08em}',
    '.rpspicks{display:flex;gap:10px;justify-content:center;margin:10px 0 2px}',
    '.rpspick{flex:1;max-width:110px;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 6px;font-size:.8rem}',
    '.rpspick svg{width:38px;height:38px}',
    '.rpspick:disabled{opacity:.45}',
    '.rpstot{text-align:center;margin:8px 0 0}',
    '.pctl{display:flex;gap:8px;align-items:center;justify-content:center;flex-wrap:wrap;margin:8px 0}',
    '.pctl .field{width:auto}',
    '.pkeys{position:relative;display:flex;height:200px;margin:10px 0;touch-action:none;user-select:none;-webkit-user-select:none;border-radius:0 0 10px 10px;overflow:hidden}',
    '.pkey{touch-action:none}',
    '.pkey.w{flex:1;position:relative;background:#fafafa;border:1px solid #9aa0aa;border-top:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:8px;color:#555;font-size:.62rem;font-weight:600;transition:background .06s}',
    '.pkey.w.on{background:linear-gradient(#ffd1dc,#ff9bb5)}',
    '.pkey.b{position:absolute;top:0;width:6.6%;height:62%;background:linear-gradient(#2b2f38,#0c0e12);border-radius:0 0 6px 6px;z-index:2;box-shadow:0 2px 3px rgba(0,0,0,.5)}',
    '.pkey.b.on{background:linear-gradient(#ff5d8f,#b0123f)}',
    '.pkeys.nolab .pkey.w{font-size:0}',
    '.plearn{margin:6px 0}',
    '.pnext{text-align:center;font-weight:800;font-size:1.25rem;margin:4px 0}',
    '.pstrip{display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin:6px 0}',
    '.pstrip span{padding:4px 8px;border-radius:8px;background:rgba(127,127,127,.15);font-weight:600;font-size:.8rem}',
    '.pstrip span.cur{background:var(--accent,#ff3d5a);color:#fff}',
    '.pbar{height:6px;border-radius:3px;background:rgba(127,127,127,.2);overflow:hidden;margin:8px 0}',
    '.pbar i{display:block;height:100%;width:0;background:var(--accent,#ff3d5a);transition:width .2s}',
    '.pkey.w.hint{background:#ffe3ea;box-shadow:inset 0 0 0 3px var(--accent,#ff3d5a);animation:pnHint 1s ease-in-out infinite}',
    '.pkey.b.hint{background:linear-gradient(#ff5d8f,#b0123f);animation:pnHint 1s ease-in-out infinite}',
    '@keyframes pnHint{50%{filter:brightness(.82)}}',
    '.gtop{display:flex;align-items:center;gap:10px;padding:6px 0 12px;font-size:1.1rem;font-weight:800}',
    '.gback{width:40px;height:40px;border-radius:50%;border:0;background:rgba(127,127,127,.28);color:inherit;font-size:1.3rem;line-height:1;flex:none}',
    '.gpage{position:fixed;inset:0;z-index:9000;display:flex;flex-direction:column;padding:max(10px,env(safe-area-inset-top)) 14px 0}',
    '.gpage[hidden]{display:none}',
    '.gbody{flex:1;overflow:auto;padding:4px 0 40px}',
    'dialog.sheet.gfull,.gpage{box-sizing:border-box}',
    'dialog.sheet.gfull{position:fixed;inset:0;width:100vw;max-width:none;height:100dvh;max-height:none;margin:0;border:0;border-radius:0!important;padding:max(10px,env(safe-area-inset-top)) 14px 22px;overflow:auto;transform:none!important}',
    'dialog.sheet.gfull::backdrop{background:#000}',
    '.gamewrap>:not(#gHub){display:none!important}',
    '#gHub{padding:4px 2px 90px}',
    '.ghubtop{display:flex;align-items:center;justify-content:space-between;margin:2px 2px 12px;opacity:.85;font-size:.9rem}',
    '.ghubgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
    '.gcard{position:relative;border:0;border-radius:22px;padding:12px;min-height:158px;color:#fff;text-align:left;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;box-shadow:0 8px 18px rgba(0,0,0,.3);font:inherit;transition:transform .12s}',
    '.gcard:active{transform:scale(.96)}',
    '.gcard::after{content:"";position:absolute;inset:0;background:linear-gradient(160deg,rgba(255,255,255,.28),rgba(255,255,255,0) 45%);pointer-events:none}',
    '.gcard .gico{position:absolute;top:12px;right:10px;width:74px;height:74px;filter:drop-shadow(0 4px 6px rgba(0,0,0,.35))}',
    '.gcard .gico3{position:absolute;top:14px;right:8px;display:flex;gap:0}',
    '.gcard .gico3 svg{width:34px;height:34px;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}',
    '.gcard .gtag{position:absolute;top:10px;left:10px;font-size:.62rem;font-weight:700;padding:3px 8px;border-radius:99px;background:rgba(0,0,0,.3);letter-spacing:.04em}',
    '.gcard b{font-size:1.08rem;line-height:1.1;text-shadow:0 1px 3px rgba(0,0,0,.35)}',
    '.gcard small{opacity:.92;font-size:.74rem;margin-top:3px;text-shadow:0 1px 2px rgba(0,0,0,.3)}',
    'dialog.gtheme-rps,dialog.gtheme-piano,dialog.gtheme-candy{color:#fff!important}',
    'dialog.gtheme-rps{background:radial-gradient(circle at 50% -10%,#7b3ff2 0%,#2b1466 45%,#120a2e 100%)!important}',
    'dialog.gtheme-piano{background:linear-gradient(#2d1a12,#120907)!important;color:#f5e9dc!important}',
    'dialog.gtheme-candy{background:linear-gradient(180deg,#ff8ad0,#9a7bff 55%,#6ad0ff)!important}',
    '.gtheme-rps .ghost,.gtheme-piano .ghost,.gtheme-candy .ghost{background:rgba(255,255,255,.18)!important;color:#fff!important;border:1px solid rgba(255,255,255,.35)!important;border-radius:14px}',
    '.gtheme-rps .field,.gtheme-piano .field,.gtheme-piano select{background:rgba(255,255,255,.14)!important;color:#fff!important;border:1px solid rgba(255,255,255,.3)!important;border-radius:12px}',
    '.gtheme-rps .hint,.gtheme-piano .hint,.gtheme-candy .hint{color:rgba(255,255,255,.75)!important}',
    '.gtheme-rps .wstat,.gtheme-candy .wstat{background:rgba(255,255,255,.16);border-radius:14px;padding:6px 16px;color:#fff;text-align:center}',
    '.gtheme-rps .gseg button{color:#fff}',
    '.gtheme-rps .rpsvs{color:#ffd23f;opacity:1;font-size:1.3rem;text-shadow:0 0 10px #ffd23f}',
    '.rpsarena{position:relative;margin:22px 0 8px;gap:10px}',
    '.rpscol{display:flex;flex-direction:column;align-items:center}',
    '.gtheme-rps .rpshand{width:118px;height:118px;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.4),rgba(255,255,255,.08));border:3px solid rgba(255,255,255,.45);box-shadow:0 0 26px rgba(160,120,255,.55)}',
    '.gtheme-rps .rpshand svg{width:70px;height:70px}',
    '.gtheme-rps .rpshand.win{border-color:#2dffb0;box-shadow:0 0 30px #2dffb0}',
    '.gtheme-rps .rpshand.lose{border-color:#ff5d8f;box-shadow:0 0 20px rgba(255,93,143,.6)}',
    '.rpspips{display:flex;gap:7px;justify-content:center;margin-top:12px}',
    '.rpspips i{width:15px;height:15px;border-radius:50%;background:rgba(255,255,255,.2)}',
    '.rpspips i.on{background:#ffd23f;box-shadow:0 0 9px #ffd23f}',
    '.rpsban{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 22px;border-radius:14px;font-weight:900;font-size:1.35rem;letter-spacing:.06em;white-space:nowrap;z-index:3;color:#fff;animation:rpsPop .5s cubic-bezier(.2,1.4,.4,1) both;box-shadow:0 6px 18px rgba(0,0,0,.4)}',
    '.rpsban[hidden]{display:none}',
    '.rpsban.win{background:#06b88a}.rpsban.lose{background:#ff3d6e}.rpsban.draw{background:#6b7694}',
    '@keyframes rpsPop{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}',
    '.gtheme-rps .rpspick{background:rgba(255,255,255,.16)!important;border-radius:18px!important;padding:12px 6px}',
    '.gtheme-piano .pkeys{height:min(46vh,340px);border-radius:6px 6px 12px 12px;border-top:16px solid #8c1c2c;background:#000;gap:2px;box-shadow:0 10px 24px rgba(0,0,0,.6)}',
    '.gtheme-piano .pkey.w{background:linear-gradient(#fff,#f4f1ea 88%,#cfc9bc);border:0;border-radius:0 0 7px 7px;color:#6b6457;box-shadow:inset 0 -6px 0 rgba(0,0,0,.08)}',
    '.gtheme-piano .pkey.w.on{background:linear-gradient(#ffdce6,#ff9bb5);transform:translateY(2px)}',
    '.gtheme-piano .pkey.w.hint{background:#ffe3ea;box-shadow:inset 0 0 0 3px var(--accent,#ff3d5a)}',
    '.gtheme-piano .pkey.b{background:linear-gradient(#444 0%,#111 12%,#000 100%);box-shadow:0 5px 6px rgba(0,0,0,.6),inset 0 -4px 0 #222,inset 2px 0 2px rgba(255,255,255,.15)}',
    '.gtheme-piano .pkey.b.on{background:linear-gradient(#ff5d8f,#b0123f);transform:translateY(2px)}',
    '.gtheme-piano .pkey.b.hint{background:linear-gradient(#ff5d8f,#b0123f)}',
    '.pled{margin-left:auto;font-family:ui-monospace,monospace;font-weight:700;font-size:1rem;background:#0b1a10;color:#6dff9b;padding:6px 12px;border-radius:8px;text-shadow:0 0 8px #3dff7a;min-width:70px;text-align:center}',
    '#m3Dlg .m3grid{background:rgba(255,255,255,.35)!important;border-radius:20px!important;padding:8px!important;gap:4px!important;box-shadow:0 8px 22px rgba(80,30,120,.35)}',
    '#m3Dlg .m3c{font-size:0!important;position:relative;background:transparent!important;border:0!important;box-shadow:none!important}',
    '#m3Dlg .m3c::before{content:"";position:absolute;inset:11%;background:var(--c);border-radius:50%;box-shadow:inset -4px -6px 0 rgba(0,0,0,.2),inset 3px 4px 0 rgba(255,255,255,.55),0 3px 4px rgba(0,0,0,.28);transition:transform .12s}',
    '#m3Dlg .m3c::after{content:"";position:absolute;left:26%;top:20%;width:22%;height:14%;border-radius:50%;background:rgba(255,255,255,.75);transform:rotate(-30deg)}',
    '#m3Dlg .m3c[data-t="0"]{--c:#ff3b5c}',
    '#m3Dlg .m3c[data-t="1"]{--c:#ff9f1a}#m3Dlg .m3c[data-t="1"]::before{border-radius:32%}',
    '#m3Dlg .m3c[data-t="2"]{--c:#ffe14d}#m3Dlg .m3c[data-t="2"]::before{border-radius:50% 50% 50% 8%;transform:rotate(-45deg)}',
    '#m3Dlg .m3c[data-t="3"]{--c:#34d17a}#m3Dlg .m3c[data-t="3"]::before{border-radius:14%}',
    '#m3Dlg .m3c[data-t="4"]{--c:#3aa0ff}#m3Dlg .m3c[data-t="4"]::before{border-radius:0;clip-path:polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0 50%)}',
    '#m3Dlg .m3c[data-t="5"]{--c:#b45cff}#m3Dlg .m3c[data-t="5"]::before{border-radius:50%/68% 68% 32% 32%}',
    '#m3Dlg .m3c.sel::before{transform:scale(1.18)}',
    '#m3Dlg h2{text-align:center;font-size:1.5rem;text-shadow:0 2px 0 rgba(0,0,0,.25)}'
  ].join('');
  var st = mk('style'); st.textContent = css; document.head.appendChild(st);

  /* ================= icônes (SVG) ================= */
  var IC = {
    0: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M12 42 8 28 18 14 36 8 52 16 58 32 50 50 28 56z" fill="#a8b0bf" stroke="#3f4756" stroke-width="3" stroke-linejoin="round"/><path d="M18 14l10 12 8-18M28 26l-6 16M28 26l18 4M46 30l-4 18M46 30l12 2" fill="none" stroke="#3f4756" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><path d="M20 20l6-4" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".65"/></svg>',
    1: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 6h26l12 12v40H14z" fill="#fff" stroke="#3f4756" stroke-width="3" stroke-linejoin="round"/><path d="M40 6v12h12" fill="#e5e7eb" stroke="#3f4756" stroke-width="3" stroke-linejoin="round"/><path d="M22 30h22M22 38h22M22 46h14" stroke="#4f8ff0" stroke-width="3" stroke-linecap="round"/></svg>',
    2: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M22 6 41 40" stroke="#3f4756" stroke-width="9" stroke-linecap="round"/><path d="M42 6 23 40" stroke="#3f4756" stroke-width="9" stroke-linecap="round"/><path d="M22 6 41 40" stroke="#cfd6e2" stroke-width="5" stroke-linecap="round"/><path d="M42 6 23 40" stroke="#e6ebf3" stroke-width="5" stroke-linecap="round"/><circle cx="42" cy="49" r="9" fill="none" stroke="#3f4756" stroke-width="8"/><circle cx="22" cy="49" r="9" fill="none" stroke="#3f4756" stroke-width="8"/><circle cx="42" cy="49" r="9" fill="none" stroke="#ff5d8f" stroke-width="4.5"/><circle cx="22" cy="49" r="9" fill="none" stroke="#ff5d8f" stroke-width="4.5"/><circle cx="32" cy="24" r="2.6" fill="#3f4756"/></svg>',
    q: '<svg viewBox="0 0 64 64" aria-hidden="true"><text x="32" y="46" text-anchor="middle" font-size="44" font-weight="800" fill="currentColor" opacity=".5" font-family="system-ui,sans-serif">?</text></svg>'
  };
  var NAMES = ['Pierre', 'Feuille', 'Ciseaux'];
  /* 0 pierre, 1 feuille, 2 ciseaux : 1 = a gagne, -1 = a perd, 0 = égalité */
  function outcome(a, b) { return a === b ? 0 : ((a - b + 3) % 3 === 1 ? 1 : -1); }
  function sfx(n, a) { try { if (window.SFX && SFX[n]) SFX[n](a); } catch (e) {} }

  /* ================= Pierre · Feuille · Ciseaux ================= */
  var rps = (function () {
    var KEY = 'ui_rps_v1', GOAL = 3, NKEY = 'ui_rps_name';
    var dlg = mk('dialog', 'sheet gfull gtheme-rps'); dlg.id = 'rpsDlg'; dlg.setAttribute('aria-label', 'Pierre Feuille Ciseaux');
    dlg.innerHTML =
      '<div class="gtop"><button class="gback" id="rpsBack" type="button" aria-label="Retour aux jeux">←</button><b>Pierre · Feuille · Ciseaux</b></div>' +
      '<div class="gseg" id="rpsMode"><button type="button" data-m="cpu" aria-pressed="true">🤖 Contre l’ordi</button><button type="button" data-m="net" aria-pressed="false">👥 Avec un pote</button></div>' +
      '<div id="rpsLobby" hidden>' +
        '<input class="field" id="rpsName" maxlength="16" placeholder="Ton nom" autocomplete="off">' +
        '<button class="ghost gbig" id="rpsCreate" type="button">➕ Créer une partie</button>' +
        '<div class="grow"><input class="field" id="rpsCode" maxlength="4" placeholder="CODE" autocapitalize="characters" autocomplete="off"><button class="ghost" id="rpsJoin" type="button">Rejoindre</button></div>' +
        '<p class="hint" id="rpsLobMsg">Crée une partie et envoie le code à ton pote, ou entre son code.</p>' +
      '</div>' +
      '<div id="rpsRoom" hidden><div class="grow"><b class="gcode" id="rpsRoomCode"></b><button class="ghost" id="rpsShare" type="button">Partager</button><button class="ghost" id="rpsLeave" type="button">Quitter</button></div></div>' +
      '<div id="rpsGame">' +
        '<div class="rpstop"><div class="wstat"><b id="rpsA">0</b><span id="rpsAL">Toi</span></div><div class="wstat"><b id="rpsB">0</b><span id="rpsBL">Ordi</span></div><div class="wstat"><b id="rpsC">0</b><span id="rpsCL">Série</span></div></div>' +
        '<div class="rpsarena"><div class="rpscol"><div class="rpshand" id="rpsYouH"></div><div class="rpspips" id="rpsPA"></div></div><span class="rpsvs">VS</span><div class="rpscol"><div class="rpshand" id="rpsOppH"></div><div class="rpspips" id="rpsPB"></div></div><div class="rpsban" id="rpsBan" hidden></div></div>' +
        '<p class="wmsg" id="rpsMsg" role="status" aria-live="polite"></p>' +
        '<div class="rpspicks" id="rpsPicks">' +
          '<button class="ghost rpspick" type="button" data-m="0">' + IC[0] + 'Pierre</button>' +
          '<button class="ghost rpspick" type="button" data-m="1">' + IC[1] + 'Feuille</button>' +
          '<button class="ghost rpspick" type="button" data-m="2">' + IC[2] + 'Ciseaux</button>' +
        '</div>' +
        '<p class="hint rpstot" id="rpsTot"></p>' +
      '</div>' +
      '<div class="pfrow" style="margin-top:14px"><button class="ghost" id="rpsAgain" type="button">Remettre à zéro</button><button class="ghost" type="button" data-sfx="short" aria-label="Sons">🔊</button><button class="ghost" id="rpsClose" type="button">Fermer</button></div>';
    document.body.appendChild(dlg);

    var S = (function () { try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && typeof v.w === 'number') return v; } catch (e) {} return { w: 0, l: 0, d: 0, st: 0, best: 0 }; })();
    var mode = 'cpu', busy = false, you = 0, cpu = 0, over = false;
    var yh = $('rpsYouH'), oh = $('rpsOppH');
    function saveS() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
    function msg(t) { $('rpsMsg').textContent = t; }
    function lob(t) { $('rpsLobMsg').textContent = t; }
    function setHand(el, k, cls) { el.className = 'rpshand' + (cls ? ' ' + cls : ''); el.innerHTML = IC[k]; }
    function picks(on) { var b = $('rpsPicks').children; for (var i = 0; i < b.length; i++) b[i].disabled = !on; }
    function scores(a, b, c, al, bl, cl) {
      $('rpsA').textContent = a; $('rpsB').textContent = b; $('rpsC').textContent = c;
      $('rpsAL').textContent = al; $('rpsBL').textContent = bl; $('rpsCL').textContent = cl;
      pips($('rpsPA'), a); pips($('rpsPB'), b);
    }
    function pips(el, n) { var h = ''; for (var i = 0; i < GOAL; i++) h += '<i' + (i < n ? ' class="on"' : '') + '></i>'; el.innerHTML = h; }
    var banT = 0;
    function banner(text, cls, ms) {
      var b = $('rpsBan'); clearTimeout(banT); b.textContent = text; b.className = 'rpsban ' + cls; b.hidden = false;
      banT = setTimeout(function () { b.hidden = true; }, ms || 1300);
    }
    async function shake() {
      setHand(yh, 0); setHand(oh, 0);
      if (reduce) return;
      yh.classList.add('shake'); oh.classList.add('shake'); sfx('tap'); await wait(850);
      yh.classList.remove('shake'); oh.classList.remove('shake');
    }
    function show(mine, theirs, r) {
      setHand(yh, mine, r === 1 ? 'win' : r === -1 ? 'lose' : '');
      setHand(oh, theirs, r === -1 ? 'win' : r === 1 ? 'lose' : '');
    }

    /* ---------- vue ---------- */
    function view() {
      var net = mode === 'net', inRoom = !!N.code;
      var b = $('rpsMode').children; for (var i = 0; i < b.length; i++) b[i].setAttribute('aria-pressed', String(b[i].dataset.m === mode));
      $('rpsLobby').hidden = !(net && !inRoom);
      $('rpsRoom').hidden = !(net && inRoom);
      $('rpsGame').hidden = net && !inRoom;
      $('rpsTot').hidden = net;
      $('rpsAgain').hidden = net; $('rpsAgain').textContent = net ? 'Rejouer' : 'Remettre à zéro';
    }
    function paintCpu() {
      scores(you, cpu, S.st, 'Toi', 'Ordi', 'Série');
      $('rpsTot').textContent = S.w + ' victoires · ' + S.d + ' nuls · ' + S.l + ' défaites · record de série ' + S.best;
    }
    function startCpuView() {
      if (!busy && over) { you = cpu = 0; over = false; }
      setHand(yh, 0); setHand(oh, 0); msg('Premier à ' + GOAL + ' manches. Choisis ton coup !'); paintCpu(); picks(true);
    }

    /* ---------- contre l'ordi ---------- */
    async function playCpu(m) {
      if (busy) return;
      if (over) { you = cpu = 0; over = false; }
      busy = true; picks(false); msg('Pierre… feuille… ciseaux…');
      var c = rand(3); await shake();
      var r = outcome(m, c); show(m, c, r);
      if (r === 1) {
        you++; S.st++; if (S.st > S.best) S.best = S.st;
        msg(NAMES[m] + ' bat ' + NAMES[c].toLowerCase() + ' : manche pour toi ! 🎉'); sfx('pop', 1); banner('MANCHE GAGNÉE', 'win');
      } else if (r === -1) {
        cpu++; S.st = 0;
        msg(NAMES[c] + ' bat ' + NAMES[m].toLowerCase() + ' : manche pour l’ordi 😅'); sfx('error'); banner('MANCHE PERDUE', 'lose');
        try { if (window.FX && FX.shake) FX.shake(yh); } catch (e) {}
      } else { S.d++; msg('Égalité, ' + NAMES[m].toLowerCase() + ' partout !'); sfx('tap'); banner('ÉGALITÉ', 'draw'); }
      if (you >= GOAL || cpu >= GOAL) {
        over = true;
        if (you > cpu) {
          S.w++; msg('🏆 Tu gagnes la série ' + you + ' à ' + cpu + ' ! Choisis pour rejouer.'); sfx('win'); banner('VICTOIRE !', 'win', 2200);
          try { if (window.FX && FX.confetti) { var rc = yh.getBoundingClientRect(); FX.confetti(rc.left + rc.width / 2, rc.top); } } catch (e) {}
        } else { S.l++; msg('Perdu ' + you + ' à ' + cpu + '… Choisis pour ta revanche !'); sfx('lose'); banner('DÉFAITE', 'lose', 2200); }
      }
      saveS(); paintCpu(); busy = false; picks(true);
    }
    function resetCpu() {
      if (busy) return;
      S = { w: 0, l: 0, d: 0, st: 0, best: 0 }; you = cpu = 0; over = false; saveS(); startCpuView();
      msg('Scores remis à zéro. Choisis ton coup !');
    }

    /* ---------- avec un pote (Supabase : table « rps_rooms ») ---------- */
    var N = { code: '', role: '', unsub: null, doc: null, seen: -1, resolving: false, note: '' };
    function user() { return window.__xenUser || null; }
    /* petite couche « comme Firestore » au-dessus de la table Supabase rps_rooms (colonne data = la partie) */
    function ref(code) {
      code = code || N.code;
      var T = function () { return window.__sb.from('rps_rooms'); };
      var snapOf = function (row) { return { exists: !!row, data: function () { return row ? row.data : null; } }; };
      return {
        get: function () { return T().select('data').eq('code', code).maybeSingle().then(function (r) { if (r.error) throw r.error; return snapOf(r.data); }); },
        set: function (d) { return T().upsert({ code: code, data: d, updated_at: new Date().toISOString() }).then(function (r) { if (r.error) throw r.error; }); },
        update: function (patch) { return window.__sb.rpc('rps_patch', { p_code: code, p_patch: patch }).then(function (r) { if (r.error) throw r.error; }); },
        delete: function () { return T().delete().eq('code', code).then(function (r) { if (r.error) throw r.error; }); },
        onSnapshot: function (ok, err) {
          var alive = true, ch = null;
          T().select('data').eq('code', code).maybeSingle().then(function (r) {
            if (!alive) return; if (r.error) { if (err) err(r.error); return; } ok(snapOf(r.data));
          }, function (e) { if (alive && err) err(e); });
          try {
            ch = window.__sb.channel('rps-' + code + '-' + Math.random().toString(36).slice(2))
              .on('postgres_changes', { event: '*', schema: 'public', table: 'rps_rooms', filter: 'code=eq.' + code }, function (pl) {
                if (alive && pl.new && pl.new.data) ok(snapOf(pl.new));
              })
              .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'rps_rooms' }, function (pl) {
                if (alive && pl.old && pl.old.code === code) ok(snapOf(null));
              })
              .subscribe();
          } catch (e) {}
          return function () { alive = false; if (ch) { try { window.__sb.removeChannel(ch); } catch (e) {} ch = null; } };
        }
      };
    }
    function myName() {
      var n = ($('rpsName').value || '').trim().slice(0, 16);
      if (!n) { var u = user(); n = (u && (u.displayName || String(u.email || '').split('@')[0])) || 'Joueur'; }
      try { localStorage.setItem(NKEY, n); } catch (e) {}
      return n;
    }
    function errMsg(e) {
      if (e && (e.code === '42501' || e.code === '42P01' || e.code === 'PGRST202')) return 'Table ou fonction Supabase manquante : lance les blocs 7 et 8 (rps_rooms, rps_patch).';
      return 'Erreur : ' + String((e && e.message) || e).slice(0, 90);
    }
    function genCode() { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < 4; i++) s += a[rand(a.length)]; return s; }

    async function create() {
      var u = user(); if (!u) { lob('Connecte-toi d’abord.'); return; }
      var name = myName(); lob('Création…');
      try {
        var code, tries = 0, snap;
        do { code = genCode(); snap = await ref(code).get(); tries++; } while (snap.exists && tries < 6);
        await ref(code).set({ host: u.uid, hostName: name, guest: '', guestName: '', state: 'wait', hp: -1, gp: -1, hs: 0, gs: 0, round: 1, last: null, goal: GOAL, ts: Date.now() });
        enter(code, 'h');
      } catch (e) { lob(errMsg(e)); }
    }
    async function join() {
      var u = user(); if (!u) { lob('Connecte-toi d’abord.'); return; }
      var code = ($('rpsCode').value || '').trim().toUpperCase();
      if (code.length < 4) { lob('Entre le code à 4 caractères.'); return; }
      var name = myName(); lob('Connexion…');
      try {
        var snap = await ref(code).get();
        if (!snap.exists) { lob('Code introuvable.'); return; }
        var d = snap.data();
        if (d.host === u.uid) { enter(code, 'h'); return; }
        if (d.guest && d.guest !== u.uid) { lob('Cette partie est déjà complète.'); return; }
        if (d.guest !== u.uid) await ref(code).update({ guest: u.uid, guestName: name, state: 'play', hp: -1, gp: -1, hs: 0, gs: 0, round: 1, last: null });
        enter(code, 'g');
      } catch (e) { lob(errMsg(e)); }
    }
    function enter(code, role) {
      N.code = code; N.role = role; N.doc = null; N.seen = -1; N.note = ''; N.resolving = false;
      $('rpsRoomCode').textContent = code; view();
      setHand(yh, 'q'); setHand(oh, 'q'); picks(false); msg('Connexion à la partie…');
      N.unsub = ref(code).onSnapshot(onSnap, function (e) { leaveLocal(errMsg(e)); });
    }
    function onSnap(snap) {
      if (!N.code) return;
      if (!snap.exists) { leaveLocal('La partie a été fermée.'); return; }
      var d = snap.data(); N.doc = d;
      if (N.seen < 0) N.seen = d.last ? d.last.n : 0; else if (!d.last) N.seen = 0;
      if (N.role === 'h' && d.state === 'play' && d.hp >= 0 && d.gp >= 0 && !N.resolving) resolveRound(d);
      pump();
    }
    async function resolveRound(d) {
      N.resolving = true;
      var r = outcome(d.hp, d.gp), hs = d.hs + (r === 1 ? 1 : 0), gs = d.gs + (r === -1 ? 1 : 0);
      try {
        await ref().update({ hs: hs, gs: gs, round: d.round + 1, hp: -1, gp: -1,
          last: { n: (d.last ? d.last.n : 0) + 1, hp: d.hp, gp: d.gp, r: r },
          state: (hs >= d.goal || gs >= d.goal) ? 'over' : 'play' });
      } catch (e) { msg(errMsg(e)); }
      N.resolving = false;
    }
    function pump() {
      if (busy || !N.doc) return;
      var d = N.doc;
      if (d.last && d.last.n > N.seen) { N.seen = d.last.n; revealNet(d.last); } else applyNet();
    }
    async function revealNet(l) {
      busy = true; picks(false); msg('Pierre… feuille… ciseaux…');
      var h = N.role === 'h', mine = h ? l.hp : l.gp, theirs = h ? l.gp : l.hp, r = h ? l.r : -l.r;
      await shake(); show(mine, theirs, r);
      var opp = oppName();
      if (r === 1) { N.note = NAMES[mine] + ' bat ' + NAMES[theirs].toLowerCase() + ' : point pour toi ! 🎉'; sfx('pop', 1); banner('POINT POUR TOI', 'win'); }
      else if (r === -1) { N.note = NAMES[theirs] + ' bat ' + NAMES[mine].toLowerCase() + ' : point pour ' + opp + ' 😅'; sfx('error'); banner('POINT POUR ' + opp.toUpperCase(), 'lose'); }
      else { N.note = 'Égalité, ' + NAMES[mine].toLowerCase() + ' partout !'; sfx('tap'); banner('ÉGALITÉ', 'draw'); }
      var d = N.doc;
      if (d && d.state === 'over') {
        var win = (h ? d.hs : d.gs) > (h ? d.gs : d.hs); sfx(win ? 'win' : 'lose'); banner(win ? 'VICTOIRE !' : 'DÉFAITE', win ? 'win' : 'lose', 2200);
        if (win) { try { if (window.FX && FX.confetti) { var rc = yh.getBoundingClientRect(); FX.confetti(rc.left + rc.width / 2, rc.top); } } catch (e) {} }
      }
      busy = false; N.shown = true; pump();
    }
    function oppName() { var d = N.doc; if (!d) return 'ton pote'; return (N.role === 'h' ? d.guestName : d.hostName) || 'ton pote'; }
    function applyNet() {
      var d = N.doc; if (!d) return;
      var h = N.role === 'h', a = h ? d.hs : d.gs, b = h ? d.gs : d.hs, me = h ? d.hp : d.gp, opp = oppName();
      scores(a, b, d.round, 'Toi', opp, 'Manche');
      $('rpsAgain').hidden = d.state !== 'over';
      if (d.state === 'wait') {
        setHand(yh, 'q'); setHand(oh, 'q'); picks(false); msg('En attente d’un pote… Partage le code ' + N.code);
      } else if (d.state === 'over') {
        picks(false);
        msg(a > b ? '🏆 Tu gagnes ' + a + ' à ' + b + ' ! Appuie sur « Rejouer ».' : 'Perdu ' + a + ' à ' + b + '… Appuie sur « Rejouer » pour la revanche.');
      } else if (me >= 0) {
        setHand(yh, me); setHand(oh, 'q'); picks(false); msg('Choix fait ! ' + opp + ' réfléchit…');
      } else {
        var oppPicked = (h ? d.gp : d.hp) >= 0;
        if (!N.shown && !d.last) { setHand(yh, 'q'); setHand(oh, 'q'); }
        picks(true); msg((N.note ? N.note + ' ' : '') + (oppPicked ? opp + ' a joué, à toi !' : 'Choisis ton coup !'));
      }
    }
    async function playNet(m) {
      var d = N.doc; if (busy || !d || d.state !== 'play') return;
      var f = N.role === 'h' ? 'hp' : 'gp'; if (d[f] >= 0) return;
      picks(false); setHand(yh, m); setHand(oh, 'q'); N.note = '';
      var o = {}; o[f] = m;
      try { await ref().update(o); sfx('tap'); } catch (e) { msg(errMsg(e)); picks(true); }
    }
    async function again() {
      var d = N.doc; if (!d || d.state !== 'over') return;
      try { await ref().update({ hs: 0, gs: 0, hp: -1, gp: -1, round: 1, last: null, state: 'play' }); N.note = ''; N.shown = false; sfx('tap'); } catch (e) { msg(errMsg(e)); }
    }
    function leaveLocal(text) {
      if (N.unsub) { try { N.unsub(); } catch (e) {} }
      N.unsub = null; N.code = ''; N.role = ''; N.doc = null; N.seen = -1; N.note = ''; N.shown = false; busy = false;
      view(); if (text) lob(text);
    }
    async function leave(text) {
      var code = N.code, role = N.role, u = N.unsub; N.unsub = null;
      if (u) { try { u(); } catch (e) {} }
      if (code) {
        try {
          if (role === 'h') await ref(code).delete();
          else await ref(code).update({ guest: '', guestName: '', state: 'wait', hp: -1, gp: -1, hs: 0, gs: 0, round: 1, last: null });
        } catch (e) {}
      }
      leaveLocal(text || 'Crée une partie et envoie le code à ton pote, ou entre son code.');
    }
    async function share() {
      var t = 'Viens jouer à Pierre · Feuille · Ciseaux avec moi sur X’enify ! Code de la partie : ' + N.code;
      try { if (navigator.share) { await navigator.share({ text: t }); return; } } catch (e) { return; }
      try { await navigator.clipboard.writeText(t); msg('Code copié ! Envoie-le à ton pote.'); } catch (e) { msg('Code : ' + N.code); }
    }

    /* ---------- événements ---------- */
    $('rpsMode').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || busy || b.dataset.m === mode) return;
      if (b.dataset.m === 'cpu') { if (N.code) leave(); mode = 'cpu'; view(); startCpuView(); }
      else { mode = 'net'; view(); lob('Crée une partie et envoie le code à ton pote, ou entre son code.'); }
    });
    $('rpsPicks').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (mode === 'cpu') playCpu(+b.dataset.m); else playNet(+b.dataset.m);
    });
    $('rpsAgain').addEventListener('click', function () { if (mode === 'cpu') resetCpu(); else again(); });
    $('rpsCreate').addEventListener('click', create);
    $('rpsJoin').addEventListener('click', join);
    $('rpsCode').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    $('rpsShare').addEventListener('click', share);
    $('rpsLeave').addEventListener('click', function () { leave(); });
    $('rpsClose').addEventListener('click', function () { dlg.close(); });
    $('rpsBack').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { if (N.code) leave(); });
    document.addEventListener('keydown', function (e) {
      if (!dlg.open || e.ctrlKey || e.metaKey || e.altKey || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
      var k = e.key.toLowerCase(), m = (k === '1' || k === 'p') ? 0 : (k === '2' || k === 'f') ? 1 : (k === '3' || k === 'c') ? 2 : -1;
      if (m < 0 || $('rpsGame').hidden) return;
      var btn = $('rpsPicks').children[m]; if (btn && !btn.disabled) btn.click();
    });

    return {
      open: function () {
        try { $('rpsName').value = localStorage.getItem(NKEY) || ''; } catch (e) {}
        view(); if (mode === 'cpu') startCpuView(); else if (!N.code) lob('Crée une partie et envoie le code à ton pote, ou entre son code.');
        dlg.showModal();
      }
    };
  })();

  /* ================= Piano ================= */
  var piano = (function () {
    var dlg = mk('dialog', 'sheet gfull gtheme-piano'); dlg.id = 'pianoDlg'; dlg.setAttribute('aria-label', 'Piano');
    dlg.innerHTML =
      '<div class="gtop"><button class="gback" id="pnBack" type="button" aria-label="Retour aux jeux">←</button><b>Piano 🎹</b><span class="pled" id="pnLed">— —</span></div>' +
      '<div class="pctl"><select class="field" id="pnInst" aria-label="Instrument"><option value="piano">Piano</option><option value="orgue">Orgue</option><option value="synthe">Synthé</option></select>' +
        '<button class="ghost" id="pnDn" type="button" aria-label="Octave plus grave">−</button><span id="pnOct">Octave 4</span><button class="ghost" id="pnUp" type="button" aria-label="Octave plus aiguë">+</button>' +
        '<button class="ghost" id="pnLab" type="button" aria-pressed="true">Do Ré Mi</button></div>' +
      '<div class="pctl"><select class="field" id="pnSong" aria-label="Morceau à apprendre"></select><button class="ghost" id="pnLearn" type="button">🎓 Apprendre</button><button class="ghost" id="pnDemo" type="button">👂 Écouter le morceau</button></div>' +
      '<div class="pctl"><button class="ghost" id="pnAdd" type="button">➕ Mon morceau</button><button class="ghost" id="pnKeep" type="button">Garder mon enregistrement</button><button class="ghost" id="pnDel" type="button" hidden>Supprimer ce morceau</button></div>' +
      '<div class="plearn" id="pnEdit" hidden><input class="field" id="pnEdT" maxlength="40" placeholder="Titre du morceau" autocomplete="off"><textarea class="field" id="pnEdN" rows="4" placeholder="Do Ré Mi Fa# Sol La+ …" autocapitalize="none" autocorrect="off" spellcheck="false"></textarea><p class="hint" id="pnEdH">Joue les notes sur le clavier : elles s’écrivent toutes seules, dans l’ordre. Tu peux aussi les taper : Do Ré Mi Fa Sol La Si · dièse : Fa# · bémol : Si♭ · plus aigu : Do+ (jusqu’à Mi+).</p><div class="pfrow"><button class="ghost" id="pnEdS" type="button">Enregistrer le morceau</button><button class="ghost" id="pnEdX" type="button">Annuler</button></div></div>' +
      '<div class="plearn" id="pnLearnBox" hidden><div class="pnext" id="pnNext"></div><div class="pstrip" id="pnStrip"></div><div class="pbar"><i id="pnBar"></i></div><p class="hint" id="pnTip" style="text-align:center"></p></div>' +
      '<div class="pkeys" id="pnKeys"></div>' +
      '<div class="pctl"><button class="ghost" id="pnRec" type="button">● Enregistrer</button><button class="ghost" id="pnPlay" type="button" disabled>▶ Réécouter</button></div>' +
      '<p class="hint" id="pnHint" style="text-align:center">Touche les notes (plusieurs en même temps, ou glisse le doigt). Pour apprendre : choisis un morceau puis « Apprendre ». Clavier : rangée A S D F G H J K L ;</p>' +
      '<div class="pfrow" style="margin-top:10px"><button class="ghost" id="pnClose" type="button">Fermer</button></div>';
    document.body.appendChild(dlg);

    var W = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16], FR = ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do', 'Ré', 'Mi'];
    var B = [[0, 1], [1, 3], [3, 6], [4, 8], [5, 10], [7, 13], [8, 15]];
    var WK = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
    var BK = ['KeyW', 'KeyE', 'KeyT', 'KeyY', 'KeyU', 'KeyO', 'KeyP'];
    var oct = 4, keys = $('pnKeys'), kmap = {};
    var ctx = null, master = null, voices = {}, edOpen = false;
    var rec = { on: false, ev: [], t0: 0 }, pbTimers = [], demoTimers = [], L = { on: false, song: null, i: 0 };

    function ac() {
      try {
        if (ctx && ctx.state === 'closed') { ctx = null; master = null; }
        if (!ctx) {
          var A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
          ctx = new A(); master = ctx.createGain(); master.gain.value = 0.7;
          var comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
          /* son quasi muet en continu : empêche le téléphone d'endormir la sortie audio (sinon la 1re note est perdue) */
          var ka = ctx.createOscillator(), kg = ctx.createGain(); kg.gain.value = 0.0001; ka.frequency.value = 40;
          ka.connect(kg); kg.connect(ctx.destination); ka.start();
          /* si le navigateur coupe le son (appli en arrière-plan, appel…), on le relance dès que possible */
          ctx.onstatechange = function () { if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') { try { var q = ctx.resume(); if (q && q.catch) q.catch(function () {}); } catch (e) {} } };
        }
        if (ctx.state !== 'running') { var p = ctx.resume(); if (p && p.catch) p.catch(function () {}); }
        return ctx;
      } catch (e) { return null; }
    }
    document.addEventListener('visibilitychange', function () { if (!document.hidden && ctx && ctx.state !== 'running' && ctx.state !== 'closed') { try { var q = ctx.resume(); if (q && q.catch) q.catch(function () {}); } catch (e) {} } });
    var pend = {};
    function startVoice(id, midi) {
      var c = ac(); if (!c) return; stopVoice(id, true);
      if (c.state === 'running') { playVoice(c, id, midi); return; }
      /* le son n'est pas encore réveillé : on attend qu'il soit prêt avant de jouer la note (si le doigt est encore posé) */
      pend[id] = 1;
      var go = function () { if (pend[id]) { delete pend[id]; playVoice(c, id, midi); } };
      var r = c.resume(); if (r && r.then) r.then(go, go); else go();
    }
    function playVoice(c, id, midi) {
      var ids = Object.keys(voices); if (ids.length > 14) stopVoice(ids[0], true);
      var f = 440 * Math.pow(2, (midi - 69) / 12), t = c.currentTime + 0.02, inst = $('pnInst').value;
      var g = c.createGain(), out = g, oscs = [], flt = null;
      g.connect(master);
      if (inst === 'synthe') { flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 2200; flt.Q.value = 3; flt.connect(g); out = flt; }
      function osc(type, mult, gain) {
        var o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = f * mult; og.gain.value = gain;
        o.connect(og); og.connect(out); o.start(t); oscs.push(o);
      }
      g.gain.setValueAtTime(0.0001, t);
      if (inst === 'piano') {
        osc('triangle', 1, 0.8); osc('sine', 2, 0.25); osc('sine', 3, 0.08);
        g.gain.exponentialRampToValueAtTime(0.6, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      } else if (inst === 'orgue') {
        osc('sine', 1, 0.6); osc('sine', 2, 0.3); osc('sine', 4, 0.15);
        g.gain.exponentialRampToValueAtTime(0.4, t + 0.03);
      } else {
        osc('sawtooth', 1, 0.35); osc('square', 0.5, 0.15);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      }
      voices[id] = { g: g, oscs: oscs, inst: inst };
    }
    function stopVoice(id, quick) {
      delete pend[id];
      var v = voices[id]; if (!v || !ctx) return; delete voices[id];
      var t = ctx.currentTime, rel = quick ? 0.03 : (v.inst === 'piano' ? 0.3 : 0.15);
      try {
        if (v.g.gain.cancelAndHoldAtTime) v.g.gain.cancelAndHoldAtTime(t); else v.g.gain.cancelScheduledValues(t);
        v.g.gain.setTargetAtTime(0.0001, t, rel / 3);
      } catch (e) {}
      v.oscs.forEach(function (o) { try { o.stop(t + rel + 0.1); } catch (e) {} });
    }
    function lightKey(midi, on) { var k = kmap[midi]; if (k) k.classList.toggle('on', on); }
    function noteOn(id, midi, fromRec) {
      startVoice(id, midi); lightKey(midi, true);
      try { $('pnLed').textContent = NN[midi % 12] + (Math.floor(midi / 12) - 1); } catch (e) {}
      if (!fromRec && L.on) lessonHit(midi);
      if (!fromRec && edOpen) edAppend(midi);
      if (rec.on && !fromRec) rec.ev.push({ t: performance.now() - rec.t0, on: 1, m: midi });
    }
    function noteOff(id, midi, fromRec) {
      stopVoice(id); lightKey(midi, false);
      if (rec.on && !fromRec) rec.ev.push({ t: performance.now() - rec.t0, on: 0, m: midi });
    }

    function build() {
      keys.replaceChildren(); kmap = {};
      var base = 12 * (oct + 1), n = W.length;
      W.forEach(function (s, i) {
        var k = mk('div', 'pkey w', '<span>' + FR[i] + '</span>'); k.dataset.midi = base + s; keys.appendChild(k); kmap[base + s] = k;
      });
      B.forEach(function (b) {
        var k = mk('div', 'pkey b'); k.dataset.midi = base + b[1]; k.style.left = ((b[0] + 1) * 100 / n - 3.3) + '%'; keys.appendChild(k); kmap[base + b[1]] = k;
      });
      $('pnOct').textContent = 'Octave ' + oct;
      if (L.on) paintLesson();
    }
    function stopAll() { Object.keys(voices).forEach(function (id) { stopVoice(id); }); Object.keys(kmap).forEach(function (m) { kmap[m].classList.remove('on'); }); held = {}; }

    var held = {};
    keys.addEventListener('pointerdown', function (e) {
      var k = e.target.closest('.pkey'); if (!k) return; e.preventDefault();
      held[e.pointerId] = +k.dataset.midi; noteOn('p' + e.pointerId, held[e.pointerId]);
    });
    keys.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in held)) return;
      var el = document.elementFromPoint(e.clientX, e.clientY), k = el && el.closest && el.closest('.pkey');
      if (k && +k.dataset.midi !== held[e.pointerId]) {
        noteOff('p' + e.pointerId, held[e.pointerId]); held[e.pointerId] = +k.dataset.midi; noteOn('p' + e.pointerId, held[e.pointerId]);
      }
    });
    function up(e) { if (e.pointerId in held) { noteOff('p' + e.pointerId, held[e.pointerId]); delete held[e.pointerId]; } }
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);

    var down = {};
    function midiOfCode(c) {
      var base = 12 * (oct + 1), i = WK.indexOf(c); if (i >= 0) return base + W[i];
      i = BK.indexOf(c); if (i >= 0) return base + B[i][1]; return -1;
    }
    document.addEventListener('keydown', function (e) {
      if (!dlg.open || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      var m = midiOfCode(e.code); if (m < 0 || down[e.code]) return;
      e.preventDefault(); down[e.code] = m; noteOn('k' + e.code, m);
    });
    document.addEventListener('keyup', function (e) {
      if (e.code in down) { noteOff('k' + e.code, down[e.code]); delete down[e.code]; }
    });

    $('pnDn').addEventListener('click', function () { if (oct > 1) { stopAll(); oct--; build(); } });
    $('pnUp').addEventListener('click', function () { if (oct < 6) { stopAll(); oct++; build(); } });
    $('pnLab').addEventListener('click', function () {
      var on = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', String(on)); keys.classList.toggle('nolab', !on);
    });
    function stopPlayback() { pbTimers.forEach(clearTimeout); pbTimers = []; Object.keys(voices).forEach(function (id) { if (id.charAt(0) === 'r') { var m = +id.slice(1); stopVoice(id); lightKey(m, false); } }); $('pnPlay').textContent = '▶ Réécouter'; }
    $('pnRec').addEventListener('click', function () {
      stopPlayback();
      if (!rec.on) { rec.on = true; rec.ev = []; rec.t0 = performance.now(); this.textContent = '■ Arrêter'; $('pnPlay').disabled = true; }
      else { rec.on = false; this.textContent = '● Enregistrer'; $('pnPlay').disabled = !rec.ev.length; }
    });
    $('pnPlay').addEventListener('click', function () {
      if (pbTimers.length) { stopPlayback(); return; }
      if (!rec.ev.length) return;
      var last = 0; $('pnPlay').textContent = '■ Stop';
      rec.ev.forEach(function (ev) {
        last = Math.max(last, ev.t);
        pbTimers.push(setTimeout(function () { if (ev.on) noteOn('r' + ev.m, ev.m, true); else noteOff('r' + ev.m, ev.m, true); }, ev.t));
      });
      pbTimers.push(setTimeout(function () { stopPlayback(); }, last + 1500));
    });
    $('pnClose').addEventListener('click', function () { dlg.close(); });
    $('pnBack').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { try { edOpenSet(false); } catch (e) {} stopDemo(); if (L.on) stopLesson(); stopPlayback(); if (rec.on) { rec.on = false; $('pnRec').textContent = '● Enregistrer'; $('pnPlay').disabled = !rec.ev.length; } stopAll(); });

    /* ----- apprendre un morceau : la touche à jouer clignote, on avance quand c'est la bonne ----- */
    /* notes en demi-tons depuis le Do de l'octave de base (0 = Do, 2 = Ré, 4 = Mi, 5 = Fa, 7 = Sol, 9 = La, 10 = Si♭, 12 = Do aigu…) */
    var BASE = [
      { id: 'anniv', t: 'Joyeux anniversaire (facile)', n: [0,0,2,0,5,4, 0,0,2,0,7,5, 0,0,12,9,5,4,2, 10,10,9,5,7,5] },
      { id: 'lune', t: 'Au clair de la lune (facile)', n: [0,0,0,2,4,2, 0,4,2,2,0, 0,0,0,2,4,2, 0,4,2,2,0] },
      { id: 'jacques', t: 'Frère Jacques (facile)', n: [0,2,4,0, 0,2,4,0, 4,5,7, 4,5,7, 7,9,7,5,4,0, 7,9,7,5,4,0, 0,7,0, 0,7,0] },
      { id: 'ode', t: 'Ode à la joie (moyen)', n: [4,4,5,7, 7,5,4,2, 0,0,2,4, 4,2,2, 4,4,5,7, 7,5,4,2, 0,0,2,4, 2,0,0] },
      { id: 'vent', t: 'Vive le vent / Jingle Bells (moyen)', n: [4,4,4, 4,4,4, 4,7,0,2,4, 5,5,5,5, 5,4,4,4,4, 4,2,2,4,2,7] },
      { id: 'elise', t: 'Pour Élise (difficile)', n: [16,15,16,15,16,11,14,12,9, 0,4,9,11, 4,8,11,12, 4,16,15,16,15,16,11,14,12,9, 0,4,9,11, 4,12,11,9] }
    ];
    var NN = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'Si♭', 'Si'], BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
    function nname(s) { return NN[s % 12] + (s >= 12 ? ' aigu' : ''); }
    /* ----- Mes morceaux : saisis par la personne, gardés sur son téléphone ----- */
    var MKEY = 'echo-piano-mine';
    function loadMine() { try { var a = JSON.parse(localStorage.getItem(MKEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.id && Array.isArray(x.n); }) : []; } catch (e) { return []; } }
    function saveMine() { try { localStorage.setItem(MKEY, JSON.stringify(MINE)); } catch (e) {} }
    var MINE = loadMine(), SONGS = BASE.concat(MINE);
    var sel = $('pnSong');
    function curSong() { var id = sel.value; for (var i = 0; i < SONGS.length; i++) if (SONGS[i].id === id) return SONGS[i]; return null; }
    function fillSongs(keep) {
      SONGS = BASE.concat(MINE);
      sel.innerHTML = '<option value="">Choisis un morceau…</option>';
      BASE.forEach(function (sg) { var o = document.createElement('option'); o.value = sg.id; o.textContent = sg.t; sel.appendChild(o); });
      if (MINE.length) {
        var g = document.createElement('optgroup'); g.label = 'Mes morceaux';
        MINE.forEach(function (sg) { var o = document.createElement('option'); o.value = sg.id; o.textContent = sg.t; g.appendChild(o); });
        sel.appendChild(g);
      }
      if (keep) sel.value = keep;
      var cs = curSong(); $('pnDel').hidden = !(cs && cs.mine);
    }
    fillSongs();
    var NOTE_RE = /^(do|r[eé]|mi|fa|sol|la|si)([#♯b♭]?)(\+|'|↑|aigu)?$/, BASEN = { 'do': 0, 're': 2, 'ré': 2, 'mi': 4, 'fa': 5, 'sol': 7, 'la': 9, 'si': 11 };
    function parseNotes(str) {
      var toks = String(str || '').replace(/[,;\n]+/g, ' ').split(/\s+/).filter(Boolean), out = [];
      for (var i = 0; i < toks.length; i++) {
        var m = NOTE_RE.exec(toks[i].toLowerCase());
        if (!m) return { err: '« ' + toks[i] + ' » n’est pas une note (exemples : Do, Ré, Fa#, Si♭, Do+).' };
        var v = BASEN[m[1]] + (m[2] === '#' || m[2] === '♯' ? 1 : (m[2] === 'b' || m[2] === '♭' ? -1 : 0)) + (m[3] ? 12 : 0);
        if (v < 0 || v > 16) return { err: '« ' + toks[i] + ' » est hors du clavier (de Do jusqu’à Mi+).' };
        out.push(v);
      }
      if (!out.length) return { err: 'Ajoute au moins une note.' };
      if (out.length > 300) return { err: 'Morceau trop long (300 notes maximum).' };
      return { n: out };
    }
    function tokOf(s) { return NN[s % 12].replace('♯', '#').replace('♭', 'b') + (s >= 12 ? '+' : ''); }
    function edAppend(midi) {
      var s = midi - 12 * (oct + 1); if (s < 0 || s > 16) return;
      var ta = $('pnEdN'); ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + ' ' : '') + tokOf(s); ta.scrollTop = ta.scrollHeight;
    }
    function edOpenSet(on, notes, title) {
      edOpen = !!on; $('pnEdit').hidden = !on;
      if (on) {
        stopDemo(); if (L.on) stopLesson();
        $('pnEdN').value = notes || ''; $('pnEdT').value = title || '';
        $('pnEdH').textContent = 'Joue les notes sur le clavier : elles s’écrivent toutes seules, dans l’ordre. Tu peux aussi les taper : Do Ré Mi Fa Sol La Si · dièse : Fa# · bémol : Si♭ · plus aigu : Do+ (jusqu’à Mi+).';
      }
    }
    $('pnAdd').addEventListener('click', function () { edOpenSet(!edOpen); });
    $('pnEdX').addEventListener('click', function () { edOpenSet(false); });
    $('pnEdS').addEventListener('click', function () {
      var t = $('pnEdT').value.trim(), r = parseNotes($('pnEdN').value);
      if (!t) { $('pnEdH').textContent = 'Donne un titre à ton morceau.'; return; }
      if (r.err) { $('pnEdH').textContent = r.err; return; }
      if (MINE.length >= 30) { $('pnEdH').textContent = 'Tu as déjà 30 morceaux : supprime-en un d’abord.'; return; }
      var sg = { id: 'm' + Date.now().toString(36), t: t, n: r.n, mine: true };
      MINE.push(sg); saveMine(); fillSongs(sg.id); edOpenSet(false); sfx('win');
    });
    $('pnDel').addEventListener('click', function () {
      var cs = curSong(); if (!cs || !cs.mine) return;
      if (!window.confirm('Supprimer « ' + cs.t + ' » ?')) return;
      if (L.on) stopLesson(); stopDemo();
      MINE = MINE.filter(function (x) { return x.id !== cs.id; }); saveMine(); fillSongs();
    });
    /* garde l'enregistrement fait avec « Enregistrer » : les notes jouées deviennent un morceau à apprendre */
    $('pnKeep').addEventListener('click', function () {
      var base = 12 * (oct + 1), ns = [];
      rec.ev.forEach(function (e) { if (e.on) { var s = e.m - base; if (s >= 0 && s <= 16) ns.push(s); } });
      if (!ns.length) { edOpenSet(true); $('pnEdH').textContent = 'Aucun enregistrement dans cette octave : appuie sur « Enregistrer », joue ta mélodie, arrête, puis reviens ici.'; return; }
      edOpenSet(true, ns.map(tokOf).join(' '), '');
      $('pnEdH').textContent = 'Voici les notes que tu viens de jouer. Donne un titre puis enregistre le morceau.';
    });
    sel.addEventListener('change', function () { var cs = curSong(); $('pnDel').hidden = !(cs && cs.mine); });
    function paintLesson() {
      Object.keys(kmap).forEach(function (m) { kmap[m].classList.remove('hint'); });
      var box = $('pnLearnBox'); box.hidden = !L.on; if (!L.on) return;
      var n = L.song.n, base = 12 * (oct + 1), strip = $('pnStrip');
      $('pnBar').style.width = (L.i / n.length * 100) + '%';
      if (L.i >= n.length) {
        $('pnNext').textContent = '🎉 Bravo, morceau terminé !'; strip.textContent = '';
        $('pnTip').textContent = 'Tu peux recommencer avec « Apprendre » ou choisir un autre morceau.'; return;
      }
      var s0 = n[L.i], k = kmap[base + s0]; if (k) k.classList.add('hint');
      $('pnNext').textContent = 'Joue : ' + nname(s0) + (BLACK[s0 % 12] ? ' (touche noire)' : '');
      strip.textContent = '';
      for (var j = L.i; j < Math.min(n.length, L.i + 8); j++) { var sp = document.createElement('span'); sp.textContent = nname(n[j]).replace(' aigu', '↑'); if (j === L.i) sp.className = 'cur'; strip.appendChild(sp); }
      $('pnTip').textContent = 'Note ' + (L.i + 1) + ' sur ' + n.length + ' · appuie sur la touche qui clignote. Les notes sont dans l’ordre, le rythme est libre.';
    }
    function lessonHit(midi) {
      if (!L.song || L.i >= L.song.n.length) return;
      var target = 12 * (oct + 1) + L.song.n[L.i];
      if (midi === target) {
        L.i++; paintLesson();
        if (L.i >= L.song.n.length) {
          sfx('win'); $('pnLearn').textContent = '🎓 Recommencer';
          try { if (window.FX && FX.confetti) { var r = keys.getBoundingClientRect(); FX.confetti(r.left + r.width / 2, r.top); } } catch (e) {}
        }
      } else {
        $('pnTip').textContent = 'Oups ! Cherche la touche qui clignote : ' + nname(L.song.n[L.i]) + '.';
      }
    }
    function stopDemo() {
      demoTimers.forEach(clearTimeout); demoTimers = [];
      Object.keys(voices).forEach(function (id) { if (id.charAt(0) === 'd') { stopVoice(id); } });
      Object.keys(kmap).forEach(function (m) { if (!Object.keys(held).some(function (h) { return held[h] === +m; })) kmap[m].classList.remove('on'); });
      $('pnDemo').textContent = '👂 Écouter le morceau';
    }
    function startLesson() {
      var sg = curSong(); if (!sg) { $('pnLearnBox').hidden = false; $('pnNext').textContent = 'Choisis un morceau d’abord 🙂'; $('pnStrip').textContent = ''; $('pnTip').textContent = ''; return; }
      stopDemo(); stopAll();
      L.on = true; L.song = sg; L.i = 0; oct = 4; build(); $('pnLearn').textContent = '■ Arrêter';
    }
    function stopLesson() { L.on = false; L.song = null; L.i = 0; $('pnLearn').textContent = '🎓 Apprendre'; paintLesson(); }
    $('pnLearn').addEventListener('click', function () { if (L.on && L.song && L.i < L.song.n.length) stopLesson(); else startLesson(); });
    sel.addEventListener('change', function () { stopDemo(); if (L.on) stopLesson(); });
    $('pnDemo').addEventListener('click', function () {
      if (demoTimers.length) { stopDemo(); return; }
      var sg = curSong(); if (!sg) { $('pnLearnBox').hidden = false; $('pnNext').textContent = 'Choisis un morceau d’abord 🙂'; return; }
      var base = 12 * (oct + 1); $('pnDemo').textContent = '■ Stop';
      sg.n.forEach(function (s, i) {
        demoTimers.push(setTimeout(function () { noteOn('d' + i, base + s, true); }, i * 520));
        demoTimers.push(setTimeout(function () { noteOff('d' + i, base + s, true); }, i * 520 + 430));
      });
      demoTimers.push(setTimeout(stopDemo, sg.n.length * 520 + 300));
    });
    build();
    return { open: function () { dlg.showModal(); ac(); } };
  })();

  /* ================= Hub « Jeux » : un emplacement (page) par jeu ================= */
  var GAMES = [
    { id: 'candy', n: 'Candy Rush', sub: 'Match-3 · 50 niveaux', tag: 'SOLO', bg: 'linear-gradient(135deg,#ff5fa2,#ff9a3c)',
      ico: '<svg class="gico" viewBox="0 0 64 64" aria-hidden="true"><circle cx="22" cy="24" r="14" fill="#ff3b5c"/><circle cx="17" cy="18" r="4" fill="#fff" opacity=".65"/><rect x="30" y="30" width="26" height="26" rx="8" fill="#3aa0ff"/><rect x="34" y="34" width="9" height="6" rx="3" fill="#fff" opacity=".65"/><path d="M44 6l10 15H34z" fill="#ffe14d"/></svg>' },
    { id: 'aov', n: 'Action ou vérité', sub: 'La bouteille tourne, en direct', tag: 'EN LIGNE', bg: 'linear-gradient(135deg,#7b2ff7,#f107a3)',
      ico: '<svg class="gico" viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(35 32 32)"><rect x="26" y="3" width="12" height="10" rx="3" fill="#ffd23f"/><path d="M27 13h10v13c0 6 8 8 8 18v8a4 4 0 0 1-4 4H23a4 4 0 0 1-4-4v-8c0-10 8-12 8-18z" fill="#ff3d6e" fill-opacity=".9" stroke="#fff" stroke-width="2"/></g></svg>' },
    { id: 'rps', n: 'Pierre · Feuille · Ciseaux', sub: 'Contre l’ordi ou un pote', tag: '2 MODES', bg: 'linear-gradient(135deg,#1e90ff,#6a11cb)',
      ico: '<div class="gico3">' + IC[0] + IC[1] + IC[2] + '</div>' },
    { id: 'piano', n: 'Piano', sub: 'Joue et apprends des morceaux', tag: 'MUSIQUE', bg: 'linear-gradient(135deg,#3a2a22,#12100f)',
      ico: '<svg class="gico" viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="14" width="52" height="38" rx="5" fill="#fff"/><path d="M19 14v38M32 14v38M45 14v38" stroke="#aaa" stroke-width="1.5"/><rect x="14" y="14" width="9" height="23" rx="2" fill="#111"/><rect x="28" y="14" width="9" height="23" rx="2" fill="#111"/><rect x="41" y="14" width="9" height="23" rx="2" fill="#111"/></svg>' },
    { id: 'words', n: 'Mots mélangés', sub: 'Retrouve le mot caché', tag: 'SOLO', bg: 'linear-gradient(135deg,#11998e,#38ef7d)',
      ico: '<svg class="gico" viewBox="0 0 64 64" aria-hidden="true"><rect x="4" y="12" width="28" height="28" rx="7" fill="#fff"/><text x="18" y="33" text-anchor="middle" font-size="20" font-weight="800" fill="#11998e" font-family="system-ui,sans-serif">A</text><rect x="32" y="26" width="28" height="28" rx="7" fill="#fff" opacity=".92"/><text x="46" y="47" text-anchor="middle" font-size="20" font-weight="800" fill="#0b6e66" font-family="system-ui,sans-serif">Z</text></svg>' }
  ];
  function bgOf() {
    var list = [document.body, $('app'), $('viewGame'), document.documentElement];
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      var c = getComputedStyle(list[i]).backgroundColor;
      if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') return c;
    }
    return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? '#101014' : '#ffffff';
  }
  function mkPage(id, title, onBack) {
    var el = mk('section', 'gpage', '<div class="gtop"><button class="gback" type="button" aria-label="Retour aux jeux">←</button><b>' + title + '</b></div><div class="gbody"></div>');
    el.id = 'gp-' + id; el.hidden = true; document.body.appendChild(el);
    var P = { el: el, body: el.querySelector('.gbody'), isOpen: false };
    P.open = function () {
      el.style.background = bgOf(); el.style.color = getComputedStyle(document.body).color;
      el.hidden = false; P.isOpen = true;
    };
    P.close = function () { el.hidden = true; P.isOpen = false; };
    el.querySelector('.gback').addEventListener('click', function () { if (onBack) onBack(); P.close(); });
    return P;
  }
  var done = false;
  function buildHub() {
    if (done) return true;
    var wrap = document.querySelector('#viewGame .gamewrap'); if (!wrap) return false;
    var br = $('brOpen'); if (br) br.remove();
    var bd = $('brDlg'); if (bd) bd.remove();
    var sub = document.querySelector('#viewGame .titlebox .me'); if (sub) sub.textContent = 'Choisis ton jeu';

    /* Mots mélangés : on déplace ses éléments dans sa propre page */
    var words = mkPage('words', 'Mots mélangés');
    wrap.querySelectorAll(':scope > .wstats, :scope > .gameinfo, :scope > .wslots, :scope > .wmsg, :scope > .wtiles, :scope > .wbtns').forEach(function (n) { words.body.appendChild(n); });

    /* Action ou vérité : on déplace sa carte et son panneau depuis les actualités */
    var aov = null, tdPanel = $('tdPanel'), tdEntry = $('tdEntry');
    if (tdPanel && tdEntry) {
      aov = mkPage('aov', 'Action ou vérité', function () { var c = $('tdClose'); if (c && !tdPanel.hidden) c.click(); });
      aov.body.appendChild(tdEntry); aov.body.appendChild(tdPanel);
      var sty = mk('style'); sty.textContent = '#gp-aov #tdEntry{display:none!important}'; document.head.appendChild(sty);
      var tc = $('tdClose'); if (tc) tc.textContent = '← Jeux';
      new MutationObserver(function () { setTimeout(function () { if (aov.isOpen && tdPanel.hidden) aov.close(); }, 60); }).observe(tdPanel, { attributes: true, attributeFilter: ['hidden'] });
    }

    /* Candy Rush : la fenêtre existante passe en plein écran avec un look « bonbons » */
    var m3 = $('m3Dlg');
    if (m3) {
      m3.classList.add('gfull', 'gtheme-candy');
      var top = mk('div', 'gtop', '<button class="gback" type="button" aria-label="Retour aux jeux">←</button><b>Candy Rush 🍬</b>');
      m3.insertBefore(top, m3.firstChild);
      top.querySelector('.gback').addEventListener('click', function () { var c = $('m3Close'); if (c) c.click(); else m3.close(); });
    }

    var open = {
      candy: function () { var o = $('m3Open'); if (o) o.click(); },
      aov: function () {
        if (!aov) return;
        aov.open(); var o = $('tdOpen'); if (o) o.click();
        setTimeout(function () { if (tdPanel.hidden && aov.isOpen) tdPanel.hidden = false; }, 500);
      },
      rps: rps.open, piano: piano.open, words: words.open
    };

    var hub = mk('div'); hub.id = 'gHub';
    hub.innerHTML = '<div class="ghubtop"><span>Touche un jeu pour y jouer</span><button class="ghost" type="button" data-sfx aria-label="Sons">🔊</button></div><div class="ghubgrid"></div>';
    var grid = hub.querySelector('.ghubgrid');
    GAMES.forEach(function (g) {
      if (g.id === 'aov' && !aov) return;
      var c = mk('button', 'gcard', g.ico + '<span class="gtag">' + g.tag + '</span><b>' + g.n + '</b><small>' + g.sub + '</small>');
      c.type = 'button'; c.style.background = g.bg;
      c.addEventListener('click', function () { sfx('tap'); open[g.id](); });
      grid.appendChild(c);
    });
    wrap.insertBefore(hub, wrap.firstChild);
    done = true; return true;
  }
  /* on attend que l'appli ait construit sa page Jeux (.ghub), sinon on s'installe après 20 s */
  var t0 = Date.now();
  (function wait4() {
    if (document.querySelector('#viewGame .ghub') || Date.now() - t0 > 20000) { buildHub(); return; }
    setTimeout(wait4, 250);
  })();
})();


/* ===== Icônes à la place des emojis (section Jeux uniquement) =====
   Tout emoji écrit dans un jeu (Piano, Pierre-Feuille-Ciseaux, Candy Rush, Action ou vérité, Mots mélangés…)
   est remplacé automatiquement par une petite icône. Les autres écrans de l'appli ne sont pas touchés. */
(function () {
  'use strict';
  var SEL = '#viewGame, .gpage, #gHub, #rpsDlg, #pianoDlg, #m3Dlg, #brDlg, #tdPanel, #tdEntry';
  function L(d) { return '<svg class="ei" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; }
  function C(d) { return '<svg class="ei" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>'; }
  var VOL = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19"/>';
  var FACE = '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/>';
  var ICONS = {
    '🤖': L('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="3.5" r="1"/><path d="M9 14h.01M15 14h.01M2 13v3M22 13v3"/>'),
    '👥': L('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.2c2.6.2 4.5 2.2 4.5 5.3"/>'),
    '👤': L('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>'),
    '➕': L('<path d="M12 5v14M5 12h14"/>'),
    '🔊': L(VOL + '<path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>'),
    '🔇': L(VOL + '<path d="M16 9l6 6M22 9l-6 6"/>'),
    '🎉': L('<path d="M4 21l5-13 8 8z"/><path d="M14 4v3M19 9h3M17 3.5l1.5 1.5M20 14l1.5 1.5"/>'),
    '😅': L(FACE), '🙂': L(FACE),
    '🏆': L('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>'),
    '🎹': L('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 13v6M15 13v6"/><rect x="7" y="5" width="4" height="8" fill="currentColor"/><rect x="13" y="5" width="4" height="8" fill="currentColor"/>'),
    '🎓': L('<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5M22 10v6"/>'),
    '👂': L('<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>'),
    '🎧': L('<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>'),
    '🎵': L('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    '📁': L('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>'),
    '🔥': L('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
    '🎲': L('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01" stroke-width="2.6"/>'),
    '🌀': L('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
    '🎙': L('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>'),
    '🎭': L('<path d="M4 4h16v7a8 8 0 0 1-16 0z"/><path d="M9 10h.01M15 10h.01M9 14c1.5 1.5 4.5 1.5 6 0"/>'),
    '🙈': L('<path d="M9.9 4.2A10 10 0 0 1 12 4c6 0 10 8 10 8a17 17 0 0 1-2.2 3.1M6.6 6.6A16.5 16.5 0 0 0 2 12s4 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M10 10a3 3 0 0 0 4 4"/>'),
    '👁': L('<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/>'),
    '💬': L('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    '✅': L('<circle cx="12" cy="12" r="9" stroke="#22c55e"/><path d="M8 12l3 3 5-6" stroke="#22c55e"/>'),
    '❌': L('<circle cx="12" cy="12" r="9" stroke="#ef4444"/><path d="M9 9l6 6M15 9l-6 6" stroke="#ef4444"/>'),
    '👑': L('<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>'),
    '🤫': L('<circle cx="12" cy="12" r="9"/><path d="M9 9.5h.01M15 9.5h.01M12 13v6"/>'),
    '⚙': L('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    '⏹': L('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>'),
    '⏱': L('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
    '🔒': L('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    '🎯': L('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
    '✍': L('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    '✏': L('<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    '⭐': L('<polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9" fill="currentColor"/>'),
    '★': L('<polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9" fill="currentColor"/>'),
    '☆': L('<polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9"/>'),
    '🍬': C('<path d="M6 12 2 9v6zM18 12l4-3v6z" fill="#ff9bc0"/><ellipse cx="12" cy="12" rx="6.5" ry="5.2" fill="#ff4d8d"/><path d="M9 9.5c2-1 4-1 6 0" stroke="#fff" stroke-width="1.4" stroke-linecap="round" fill="none"/>'),
    '🍪': C('<circle cx="12" cy="12" r="9.5" fill="#d9a066"/><g fill="#6b3e1f"><circle cx="8" cy="9" r="1.5"/><circle cx="14.5" cy="8" r="1.3"/><circle cx="15.5" cy="14.5" r="1.6"/><circle cx="9" cy="15" r="1.4"/><circle cx="12" cy="11.5" r="1"/></g>'),
    '🍩': C('<path fill="#e8a35c" fill-rule="evenodd" d="M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19zm0 6.7a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"/><path fill="#ff7eb6" fill-rule="evenodd" d="M12 4.6a7.4 7.4 0 1 0 0 14.8 7.4 7.4 0 0 0 0-14.8zm0 4.6a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z"/><g stroke="#fff" stroke-width="1.3" stroke-linecap="round"><path d="M7.5 8.5l1 .7M15.5 7.5l.8 1M17 13l-1 .5M8 16l1-.6M12 18l.1-1.1"/></g>'),
    '🍓': C('<path d="M12 22C6 19 4 13 5 9c1-3 4-3 7-2 3-1 6-1 7 2 1 4-1 10-7 13z" fill="#ff3b57"/><path d="M7.5 7 12 3.5 16.5 7 12 8.2z" fill="#3bb54a"/><g fill="#ffe08a"><circle cx="9" cy="12" r=".9"/><circle cx="14.5" cy="12" r=".9"/><circle cx="12" cy="15" r=".9"/><circle cx="10" cy="17.5" r=".9"/><circle cx="14" cy="17.5" r=".9"/></g>'),
    '🍇': C('<path d="M12 7V3.5" stroke="#3a7d2c" stroke-width="2" stroke-linecap="round"/><path d="M12 5c2-2 4-2 6-1-1 2-3 3-6 1z" fill="#3bb54a"/><g fill="#8e44ad"><circle cx="8" cy="10.5" r="2.7"/><circle cx="12" cy="10.5" r="2.7"/><circle cx="16" cy="10.5" r="2.7"/><circle cx="10" cy="15" r="2.7"/><circle cx="14" cy="15" r="2.7"/><circle cx="12" cy="19.4" r="2.7"/></g>'),
    '🍋': C('<ellipse cx="12" cy="12" rx="9.5" ry="6.5" fill="#ffe14d" transform="rotate(-30 12 12)"/><path d="M7 14c1-3 3-5 6-6" stroke="#fff6a8" stroke-width="1.6" stroke-linecap="round" fill="none" opacity=".8"/>')
  };
  /* un emoji (avec ses variantes) → on retrouve sa clé sans le sélecteur FE0F */
  var RE = /(?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)|[★☆]/gu;
  function key(s) { return s.replace(/\uFE0F/g, ''); }

  var css = document.createElement('style');
  css.textContent = '.ei{display:inline-block;width:1.15em;height:1.15em;vertical-align:-.2em;flex:none}';
  document.head.appendChild(css);

  function convertText(node) {
    var t = node.nodeValue; if (!t || !RE.test(t)) { RE.lastIndex = 0; return; } RE.lastIndex = 0;
    var p = node.parentNode; if (!p) return;
    var tag = p.nodeName; if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'OPTION' || tag === 'TITLE') return;
    if (!p.closest || !p.closest(SEL)) return;
    var frag = document.createDocumentFragment(), last = 0, m, hit = false;
    while ((m = RE.exec(t))) {
      var svg = ICONS[key(m[0])]; if (!svg) continue;
      hit = true;
      if (m.index > last) frag.appendChild(document.createTextNode(t.slice(last, m.index)));
      var w = document.createElement('span'); w.className = 'eiw'; w.style.display = 'inline-flex'; w.innerHTML = svg; frag.appendChild(w.firstChild);
      last = m.index + m[0].length;
    }
    RE.lastIndex = 0;
    if (!hit) return;
    if (last < t.length) frag.appendChild(document.createTextNode(t.slice(last)));
    p.replaceChild(frag, node);
  }
  function scan(root) {
    if (!root) return;
    if (root.nodeType === 3) { convertText(root); return; }
    if (root.nodeType !== 1) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(convertText);
  }
  function scanAll() { document.querySelectorAll(SEL).forEach(scan); }

  var queued = false;
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      if (m.type === 'characterData') convertText(m.target);
      else m.addedNodes.forEach(function (n) { scan(n); });
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  scanAll();
  /* rattrape ce qui est ajouté tout au début (page Jeux construite après le chargement) */
  setTimeout(scanAll, 600); setTimeout(scanAll, 2500);
})();
