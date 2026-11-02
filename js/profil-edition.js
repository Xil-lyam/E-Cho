/* U&I — js/profil-edition.js
   Modifier mon profil : bio, couverture animée (TA vidéo), couleur de couverture, photos du profil.
   - La vidéo est envoyée sur Cloudinary, coupée à 8 s en boucle, muette.
   - S’ouvre depuis « Modifier le profil » / « Modifier la couverture » (js/profil.js)
     et depuis Réglages > Photo de profil.
   À charger APRÈS js/profil.js (avec « defer »). */
(function () {
  'use strict';
  if (window.UIProfileEdit) return;

  var CLOUD = 'hjnf54dr', PRESET = 'uandi_upload', BASE = 'https://res.cloudinary.com/' + CLOUD + '/';
  var LOOP = 8, MAXV = 30 * 1048576, MAXA = 12, BIO_MAX = 120;
  var $ = function (id) { return document.getElementById(id); };
  function ic(n) { return window.UIIco ? window.UIIco.svg(n, 16, 6) : ''; }
  function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function db() { return firebase.firestore(); }
  function me() { try { return firebase.auth().currentUser; } catch (e) { return null; } }
  function P() { return window.UIProfile || {}; }
  function cldOk(u) { return typeof u === 'string' && u.indexOf(BASE) === 0; }
  function covers() { return P().COVERS || {}; }
  function srcOf(u, s) { return P().coverSrc ? P().coverSrc(u, s) : u; }

  var E = { vis: 'friends', bio: '', coverU: '', coverS: 0, coverD: 0, coverC: '', album: [], blob: '', busy: 0 };
  var dlg = null;

  function css() {
    if ($('pfeStyle')) return;
    var s = mk('style'); s.id = 'pfeStyle';
    s.textContent = [
      '#profEditDlg{width:min(26rem,calc(100vw - 20px));max-height:calc(100dvh - 20px)}',
      '#profEditDlg .sec{margin:0 0 20px}',
      '.pfe-prev{position:relative;height:150px;border-radius:16px;overflow:hidden;margin-bottom:10px;display:grid;place-items:center;color:#fff;font-size:.85rem;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 55%,#000),color-mix(in srgb,var(--accent2,var(--accent)) 45%,#000))}',
      '.pfe-prev video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
      '.pfe-prev span{position:relative;z-index:1;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.45)}',
      '.pfe-rng{display:flex;align-items:center;gap:10px;margin:12px 0 4px;font-size:.82rem}',
      '.pfe-rng input{flex:1;min-width:0;accent-color:var(--accent)}',
      '.pfe-rng span{min-width:3em;text-align:right;font-variant-numeric:tabular-nums}',
      '.pfe-bar{height:6px;border-radius:99px;background:var(--soft);overflow:hidden;margin:8px 0 0}',
      '.pfe-bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}',
      '.pfe-cols{display:flex;flex-wrap:wrap;gap:10px;margin-top:6px}',
      '.pfe-col{width:34px;height:34px;border-radius:50%;border:2px solid transparent;padding:0;cursor:pointer}',
      '.pfe-col[aria-pressed="true"]{border-color:var(--ink);box-shadow:inset 0 0 0 2px var(--bg)}',
      '.pfe-cnt{text-align:right;margin:4px 0 0}',
      '.pfe-alb{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:8px 0}',
      '.pfe-alb div{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;background:var(--soft)}',
      '.pfe-alb img{width:100%;height:100%;object-fit:cover;display:block}',
      '.pfe-alb button{position:absolute;top:3px;right:3px;width:22px;height:22px;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:.7rem;cursor:pointer;padding:0}'
    ].join('');
    document.head.appendChild(s);
  }

  function build() {
    if (dlg) return;
    css();
    dlg = document.createElement('dialog'); dlg.id = 'profEditDlg'; dlg.className = 'sheet';
    dlg.innerHTML =
      '<h2>Modifier le profil</h2>' +
      '<div class="sec" id="pfeCoverSec"><p class="lbl">Couverture animée</p>' +
        '<div class="pfe-prev" id="pfePrev"></div>' +
        '<div class="pfrow"><button class="ghost" id="pfeVid" type="button">' + ic('video') + 'Choisir une vidéo</button><button class="ghost" id="pfeVidDel" type="button">Retirer</button></div>' +
        '<input type="file" id="pfeVidFile" accept="video/*" hidden>' +
        '<div class="pfe-rng" id="pfeRng" hidden><label for="pfeStart">Début de la boucle</label><input type="range" id="pfeStart" min="0" max="0" step="1" value="0"><span id="pfeStartV">0 s</span></div>' +
        '<div class="pfe-bar" id="pfeBarW" hidden><i id="pfeBar"></i></div>' +
        '<p class="hint" id="pfeVidMsg">La vidéo tourne en boucle (' + LOOP + ' s), sans son. 30 Mo maximum.</p>' +
        '<p class="lbl" style="margin-top:14px">Ou une couleur</p><div class="pfe-cols" id="pfeCols"></div>' +
      '</div>' +
      '<div class="sec" id="pfeInfoSec"><p class="lbl">Bio</p>' +
        '<textarea class="field" id="pfeBio" rows="3" maxlength="' + BIO_MAX + '" placeholder="Quelques mots sur toi…"></textarea>' +
        '<p class="hint pfe-cnt" id="pfeBioN">0 / ' + BIO_MAX + '</p></div>' +
      '<div class="sec" id="pfePhSec"><p class="lbl">Photos du profil</p>' +
        '<div class="pfe-alb" id="pfeAlb"></div>' +
        '<button class="ghost" id="pfeAddPh" type="button">＋ Ajouter une photo</button>' +
        '<input type="file" id="pfePhFile" accept="image/*" multiple hidden>' +
        '<p class="hint" id="pfePhMsg"></p></div>' +
      '<div class="sec" id="pfeVisSec"><p class="lbl">Confidentialité</p>' +
        '<label class="hint" for="pfeVis" style="display:block;margin-bottom:6px">Qui peut voir ma liste d’amis ?</label>' +
        '<select class="field" id="pfeVis"><option value="public">Tout le monde</option><option value="friends">Mes amis uniquement</option><option value="me">Moi uniquement</option></select></div>' +
      '<p class="err" id="pfeErr" hidden></p>' +
      '<div class="pfrow"><button class="ghost" id="pfeSave" type="button">Enregistrer</button><button class="ghost" id="pfeCancel" type="button">Annuler</button></div>';
    document.body.appendChild(dlg);

    var cols = $('pfeCols');
    Object.keys(covers()).forEach(function (k) {
      var b = mk('button', 'pfe-col'); b.type = 'button'; b.dataset.k = k; b.style.background = covers()[k]; b.setAttribute('aria-label', 'Couleur ' + k);
      b.addEventListener('click', function () { E.coverC = E.coverC === k ? '' : k; paintCols(); paintPrev(); });
      cols.appendChild(b);
    });
    $('pfeVid').addEventListener('click', function () { if (!E.busy) $('pfeVidFile').click(); });
    $('pfeVidFile').addEventListener('change', function () { var f = this.files && this.files[0]; this.value = ''; if (f) pickVideo(f); });
    $('pfeVidDel').addEventListener('click', function () { clearBlob(); E.coverU = ''; E.coverS = 0; E.coverD = 0; vidMsg(''); paintPrev(); paintRange(); });
    $('pfeStart').addEventListener('input', function () { E.coverS = +this.value; $('pfeStartV').textContent = E.coverS + ' s'; seekPrev(); });
    $('pfeBio').addEventListener('input', function () { E.bio = this.value; $('pfeBioN').textContent = this.value.length + ' / ' + BIO_MAX; });
    $('pfeVis').addEventListener('change', function () { E.vis = this.value; });
    $('pfeAddPh').addEventListener('click', function () { if (!E.busy) $('pfePhFile').click(); });
    $('pfePhFile').addEventListener('change', function () { var fs = Array.prototype.slice.call(this.files || []); this.value = ''; addPhotos(fs); });
    $('pfeCancel').addEventListener('click', function () { dlg.close(); });
    $('pfeSave').addEventListener('click', save);
    dlg.addEventListener('close', function () { clearBlob(); var v = $('pfePrev').querySelector('video'); if (v) { try { v.pause(); } catch (e) {} } });
  }

  function err(t) { var e = $('pfeErr'); e.textContent = t || ''; e.hidden = !t; }
  function vidMsg(t) { $('pfeVidMsg').textContent = t || ('La vidéo tourne en boucle (' + LOOP + ' s), sans son. 30 Mo maximum.'); }
  function clearBlob() { if (E.blob) { try { URL.revokeObjectURL(E.blob); } catch (e) {} E.blob = ''; } }
  function paintCols() { [].forEach.call($('pfeCols').children, function (b) { b.setAttribute('aria-pressed', b.dataset.k === E.coverC ? 'true' : 'false'); }); }

  /* aperçu : la vidéo choisie (en local) ou la vidéo déjà enregistrée */
  function paintPrev() {
    var box = $('pfePrev'); box.textContent = ''; box.style.background = '';
    var u = E.blob || (cldOk(E.coverU) ? srcOf(E.coverU, E.coverS) : '');
    if (u) {
      var v = document.createElement('video'); v.muted = true; v.defaultMuted = true; v.loop = !E.blob; v.playsInline = true; v.autoplay = true;
      v.setAttribute('playsinline', ''); v.setAttribute('muted', ''); v.src = u;
      if (E.blob) {
        v.addEventListener('loadedmetadata', function () { try { v.currentTime = E.coverS; } catch (e) {} });
        v.addEventListener('timeupdate', function () { if (v.currentTime >= E.coverS + LOOP || v.ended) v.currentTime = E.coverS; });
        v.addEventListener('ended', function () { v.currentTime = E.coverS; v.play().catch(function () {}); });
      }
      box.appendChild(v); v.play().catch(function () {});
    } else if (covers()[E.coverC]) { box.style.background = covers()[E.coverC]; box.appendChild(mk('span', '', 'Couleur de couverture')); }
    else box.appendChild(mk('span', '', 'Aucune couverture'));
  }
  function seekPrev() {
    var v = $('pfePrev').querySelector('video'); if (!v) return;
    if (E.blob) { try { v.currentTime = E.coverS; } catch (e) {} v.play().catch(function () {}); }
    else if (cldOk(E.coverU)) { v.src = srcOf(E.coverU, E.coverS); v.play().catch(function () {}); }
  }
  function paintRange() {
    var r = $('pfeStart'), has = !!(E.blob || cldOk(E.coverU)), max = Math.max(0, Math.floor((E.coverD || 0) - LOOP));
    $('pfeRng').hidden = !has || max < 1;
    r.max = max; r.value = Math.min(E.coverS, max); E.coverS = +r.value; $('pfeStartV').textContent = E.coverS + ' s';
    $('pfeVidDel').hidden = !has;
  }

  function upload(file, kind, onProg) {
    return new Promise(function (ok, ko) {
      var fd = new FormData(); fd.append('file', file); fd.append('upload_preset', PRESET);
      var x = new XMLHttpRequest(); x.open('POST', 'https://api.cloudinary.com/v1_1/' + CLOUD + '/' + kind + '/upload');
      x.upload.onprogress = function (e) { if (e.lengthComputable && onProg) onProg(e.loaded / e.total); };
      x.onload = function () {
        try { var j = JSON.parse(x.responseText); if (j.secure_url && cldOk(j.secure_url)) ok(j.secure_url); else ko(new Error((j.error && j.error.message) || 'refusé')); }
        catch (e) { ko(e); }
      };
      x.onerror = function () { ko(new Error('réseau')); };
      x.timeout = 240000; x.ontimeout = function () { ko(new Error('délai dépassé')); };
      x.send(fd);
    });
  }
  function setBusy(b) { E.busy = b ? 1 : 0; $('pfeSave').disabled = !!b; $('pfeVid').disabled = !!b; $('pfeAddPh').disabled = !!b; }

  function pickVideo(f) {
    err('');
    if (!/^video\//.test(f.type) && !/\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name || '')) { vidMsg('Choisis un fichier vidéo.'); return; }
    if (f.size > MAXV) { vidMsg('Vidéo trop lourde : 30 Mo maximum (coupe-la ou réduis sa qualité).'); return; }
    clearBlob(); E.blob = URL.createObjectURL(f); E.coverS = 0; E.coverD = 0;
    var probe = document.createElement('video'); probe.preload = 'metadata'; probe.muted = true;
    probe.onloadedmetadata = function () { E.coverD = isFinite(probe.duration) ? probe.duration : 0; paintRange(); };
    probe.onerror = function () { E.coverD = 0; paintRange(); };
    probe.src = E.blob;
    paintPrev(); paintRange();
    setBusy(true); $('pfeBarW').hidden = false; $('pfeBar').style.width = '0%'; vidMsg('Envoi de la vidéo… 0 %');
    upload(f, 'video', function (p) { $('pfeBar').style.width = Math.round(p * 100) + '%'; vidMsg('Envoi de la vidéo… ' + Math.round(p * 100) + ' %'); })
      .then(function (u) { E.coverU = u; E.coverC = ''; paintCols(); vidMsg('Vidéo prête ✓ Choisis le début de la boucle, puis enregistre.'); })
      .catch(function (e) { clearBlob(); E.coverU = ''; vidMsg('Envoi impossible (' + ((e && e.message) || 'erreur') + ').'); paintPrev(); paintRange(); })
      .then(function () { setBusy(false); $('pfeBarW').hidden = true; });
  }

  /* photos : réduites à 1000 px avant l’envoi */
  function shrink(file) {
    return new Promise(function (ok, ko) {
      var im = new Image(), u = URL.createObjectURL(file);
      im.onload = function () {
        var k = Math.min(1, 1000 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); c.toBlob(function (b) { if (b) ok(b); else ko(); }, 'image/jpeg', 0.82);
      };
      im.onerror = function () { URL.revokeObjectURL(u); ko(); };
      im.src = u;
    });
  }
  function paintAlbum() {
    var box = $('pfeAlb'); box.textContent = '';
    E.album.forEach(function (u, i) {
      var d = mk('div'), im = mk('img'), x = mk('button', '', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Retirer la photo');
      im.src = P().thumb ? P().thumb(u) : u; im.alt = 'Photo';
      x.addEventListener('click', function () { E.album.splice(i, 1); paintAlbum(); });
      d.appendChild(im); d.appendChild(x); box.appendChild(d);
    });
    $('pfeAddPh').hidden = E.album.length >= MAXA;
    $('pfePhMsg').textContent = E.album.length + ' / ' + MAXA + ' photos';
  }
  async function addPhotos(files) {
    err('');
    files = files.filter(function (f) { return /^image\//.test(f.type); }).slice(0, MAXA - E.album.length);
    if (!files.length) return;
    setBusy(true);
    for (var i = 0; i < files.length; i++) {
      $('pfePhMsg').textContent = 'Envoi de la photo ' + (i + 1) + ' / ' + files.length + '…';
      try { var b = await shrink(files[i]); var u = await upload(b, 'image'); E.album.push(u); paintAlbum(); }
      catch (e) { $('pfePhMsg').textContent = 'Une photo n’a pas pu être envoyée.'; }
    }
    setBusy(false); paintAlbum();
  }

  async function save() {
    var u = me(); if (!u || E.busy) return;
    err(''); setBusy(true);
    var D = firebase.firestore.FieldValue.delete(), bio = (E.bio || '').trim().slice(0, BIO_MAX), hasV = cldOk(E.coverU);
    var data = {
      bio: bio ? bio : D,
      coverU: hasV ? E.coverU : D, coverS: hasV ? E.coverS : D, coverD: hasV && E.coverD ? Math.round(E.coverD) : D,
      coverC: E.coverC ? E.coverC : D,
      album: E.album.length ? E.album : D
    };
    try {
      await db().collection('presence').doc(u.uid).set(data, { merge: true });
      await db().collection('friendLists').doc(u.uid).set({ vis: E.vis }, { merge: true });
      document.dispatchEvent(new CustomEvent('ui-profile-saved'));
      dlg.close();
    } catch (e) {
      err('Enregistrement refusé : les règles Firestore doivent autoriser ces champs sur ta fiche « presence » : bio, coverU, coverS, coverD, coverC, album, awards, et la collection « friendLists ».');
    }
    setBusy(false);
  }

  async function open(section) {
    var u = me(); if (!u) return;
    build(); err('');
    var p = {};
    try { var d = await db().collection('presence').doc(u.uid).get(); p = d.exists ? d.data() : {}; } catch (e) {}
    var vis = 'friends';
    try { var fd = await db().collection('friendLists').doc(u.uid).get(); var fv = fd.exists ? fd.data().vis : ''; if (fv === 'public' || fv === 'me' || fv === 'friends') vis = fv; } catch (e) {}
    E.vis = vis; $('pfeVis').value = vis;
    clearBlob();
    E.bio = typeof p.bio === 'string' ? p.bio : ''; E.coverU = cldOk(p.coverU) ? p.coverU : ''; E.coverS = +p.coverS || 0; E.coverD = +p.coverD || 0;
    E.coverC = covers()[p.coverC] ? p.coverC : ''; E.album = Array.isArray(p.album) ? p.album.filter(cldOk).slice(0, MAXA) : [];
    $('pfeBio').value = E.bio; $('pfeBioN').textContent = E.bio.length + ' / ' + BIO_MAX;
    $('pfeBarW').hidden = true; vidMsg('');
    paintCols(); paintPrev(); paintRange(); paintAlbum();
    if (!dlg.open) dlg.showModal();
    var tgt = section === 'photos' ? 'pfePhSec' : section === 'info' ? 'pfeInfoSec' : section === 'privacy' ? 'pfeVisSec' : 'pfeCoverSec';
    setTimeout(function () { var n = $(tgt); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'start' }); }, 80);
  }

  /* entrée dans Réglages > Photo de profil */
  function settingsBtn() {
    var pe = $('photoErr'); if (!pe || $('pfeOpenBtn')) return !!$('pfeOpenBtn');
    var b = mk('button', 'ghost'); if (window.UIIco) window.UIIco.lab(b, '{pencil}Modifier mon profil (bio, couverture, photos)'); else b.textContent = 'Modifier mon profil (bio, couverture, photos)'; b.id = 'pfeOpenBtn'; b.type = 'button'; b.style.marginTop = '10px';
    b.addEventListener('click', function () { var sd = $('settings'); if (sd && sd.open) sd.close(); open('info'); });
    pe.parentNode.insertBefore(b, pe.nextSibling);
    return true;
  }

  document.addEventListener('ui-profile-edit', function (e) { open(e.detail && e.detail.section); });
  (function wait(n) {
    if (window.firebase && firebase.apps && firebase.apps.length && window.UIProfile) { settingsBtn(); return; }
    if (n < 400) setTimeout(function () { wait(n + 1); }, 300);
  })(0);

  window.UIProfileEdit = { open: open };
})();
