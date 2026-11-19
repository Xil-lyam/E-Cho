/* X’enify — choix du style du statut « en ligne » : X vert ou cœur rose (mémorisé sur cet appareil) */
(function () {
  var KEY = 'xenify-statut-style';
  function get() { try { return localStorage.getItem(KEY) === 'heart' ? 'heart' : 'x'; } catch (e) { return 'x'; } }
  function apply(v) {
    if (v === 'heart') document.documentElement.setAttribute('data-xstatus', 'heart');
    else document.documentElement.removeAttribute('data-xstatus');
  }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} apply(v); refresh(); }
  apply(get());

  var box;
  function refresh() {
    if (!box) return;
    var cur = get();
    box.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === cur ? 'true' : 'false'); });
  }
  function make(v, label, cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.dataset.v = v;
    b.innerHTML = '<span class="xon-box ' + cls + '"><i class="pf-xon"></i></span><span>' + label + '</span>';
    b.addEventListener('click', function () { set(v); });
    return b;
  }
  function build() {
    var sec = document.getElementById('privSec');
    if (!sec || document.getElementById('xonPick')) return !!sec;
    var lbl = document.createElement('p');
    lbl.className = 'lbl'; lbl.style.marginTop = '16px'; lbl.textContent = 'Style du statut en ligne';
    box = document.createElement('div');
    box.id = 'xonPick'; box.className = 'xon-pick';
    box.appendChild(make('x', 'X vert', 'xon-x-prev'));
    box.appendChild(make('heart', 'Cœur rose', 'xon-heart-prev'));
    var hint = document.createElement('p');
    hint.className = 'hint'; hint.style.marginTop = '8px';
    hint.textContent = 'Choisis comment s’affiche le statut « en ligne » des gens sur ton appareil.';
    sec.appendChild(lbl); sec.appendChild(box); sec.appendChild(hint);
    refresh();
    return true;
  }
  var n = 0;
  function start() { if (!build() && n++ < 40) setTimeout(start, 150); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
