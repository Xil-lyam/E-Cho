/* U&I — js/halloween.js
   Mise à jour Halloween : disparaît toute seule le 10 novembre 2026 à minuit. */
(function () {
  // Date de fin (heure locale de l'appareil) : 10 novembre 2026, 00:00
  var END = new Date(2026, 10, 10, 0, 0, 0).getTime();
  if (Date.now() >= END) return; // terminé : rien n'est ajouté

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Styles ---------- */
  var css = [
    '#hwBar{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));transform:translateX(-50%);',
    'z-index:50;display:flex;align-items:center;gap:10px;max-width:92vw;padding:8px 10px 8px 14px;',
    'border-radius:999px;background:linear-gradient(90deg,#2a0f3d,#6b2a00);color:#ffd9a0;',
    'border:1px solid #ff8a1f;box-shadow:0 0 18px rgba(255,138,31,.45);font:600 13px/1.2 inherit;}',
    '#hwBar button{all:unset;cursor:pointer;padding:2px 8px;border-radius:999px;color:#ffd9a0;font-size:15px}',
    '#hwFx,#hwBats{position:fixed;inset:0;pointer-events:none;overflow:hidden}',
    '#hwFx{z-index:40}',
    '#hwBats{z-index:41}',
    '#hwFx span{position:absolute;top:-8vh;user-select:none;opacity:.85;',
    'animation:hwFall linear infinite;will-change:transform}',
    '@keyframes hwFall{to{transform:translate3d(var(--dx,0),112vh,0) rotate(var(--rot,360deg))}}',
    /* chauves-souris qui traversent l'écran */
    '.hwBat{position:absolute;left:0;width:var(--w,40px);height:calc(var(--w,40px)*.55);',
    'opacity:.8;will-change:transform;animation:hwFly var(--dur,14s) linear infinite;animation-delay:var(--del,0s)}',
    '.hwBat.rtl{animation-name:hwFlyRtl}',
    '.hwBat .bob{width:100%;height:100%;animation:hwBob var(--bob,2.4s) ease-in-out infinite}',
    '.hwBat svg{width:100%;height:100%;display:block;overflow:visible}',
    '.hwBat .wing{transform-origin:50% 55%;animation:hwFlap var(--flap,.28s) ease-in-out infinite alternate}',
    '.hwBat.rtl svg{transform:scaleX(-1)}',
    '@keyframes hwFly{from{transform:translateX(-16vw)}to{transform:translateX(116vw)}}',
    '@keyframes hwFlyRtl{from{transform:translateX(116vw)}to{transform:translateX(-16vw)}}',
    '@keyframes hwBob{0%,100%{transform:translateY(0) rotate(-4deg)}50%{transform:translateY(var(--amp,34px)) rotate(5deg)}}',
    '@keyframes hwFlap{from{transform:scaleY(1)}to{transform:scaleY(.25)}}',
    '#hwGlow{position:fixed;inset:0;pointer-events:none;z-index:39;',
    'box-shadow:inset 0 0 90px rgba(255,120,0,.22),inset 0 0 220px rgba(120,0,200,.18)}',
    '@media (prefers-reduced-motion:reduce){#hwFx span{animation:none;top:auto}}'
  ].join('');
  var st = document.createElement('style');
  st.id = 'hwStyle';
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- Halo ---------- */
  var glow = document.createElement('div');
  glow.id = 'hwGlow';
  document.body.appendChild(glow);

  /* ---------- Objets qui tombent ---------- */
  if (!reduce) {
    var fx = document.createElement('div');
    fx.id = 'hwFx';
    var icons = ['🎃', '👻', '🕸️', '🍬', '🎃', '👻'];
    for (var i = 0; i < 12; i++) {
      var s = document.createElement('span');
      s.textContent = icons[i % icons.length];
      s.style.left = Math.round(Math.random() * 96) + 'vw';
      s.style.fontSize = (16 + Math.random() * 18).toFixed(0) + 'px';
      s.style.animationDuration = (10 + Math.random() * 12).toFixed(1) + 's';
      s.style.animationDelay = '-' + (Math.random() * 20).toFixed(1) + 's';
      s.style.setProperty('--dx', (Math.random() * 14 - 7).toFixed(1) + 'vw');
      s.style.setProperty('--rot', (Math.random() * 360 - 180).toFixed(0) + 'deg');
      fx.appendChild(s);
    }
    document.body.appendChild(fx);

    /* ---------- Chauves-souris qui volent sur le fond ---------- */
    var BAT = '<svg viewBox="0 0 100 55" aria-hidden="true">' +
      '<g class="wing" fill="#150a22">' +
      '<path d="M50 28 C40 8 20 4 2 14 C12 16 14 24 22 30 C26 24 32 26 36 33 C40 30 45 31 50 36Z"/>' +
      '<path d="M50 28 C60 8 80 4 98 14 C88 16 86 24 78 30 C74 24 68 26 64 33 C60 30 55 31 50 36Z"/>' +
      '</g>' +
      '<ellipse cx="50" cy="31" rx="7" ry="11" fill="#1d0f2e"/>' +
      '<path d="M44 22 L46 12 L50 20 L54 12 L56 22Z" fill="#1d0f2e"/>' +
      '<circle cx="47.5" cy="26" r="1.4" fill="#ff8a1f"/><circle cx="52.5" cy="26" r="1.4" fill="#ff8a1f"/>' +
      '</svg>';

    var bats = document.createElement('div');
    bats.id = 'hwBats';
    for (var b = 0; b < 7; b++) {
      var bat = document.createElement('div');
      bat.className = 'hwBat' + (b % 2 ? ' rtl' : '');
      bat.style.top = (6 + Math.random() * 78).toFixed(0) + 'vh';
      bat.style.setProperty('--w', (30 + Math.random() * 40).toFixed(0) + 'px');
      bat.style.setProperty('--dur', (9 + Math.random() * 10).toFixed(1) + 's');
      bat.style.setProperty('--del', '-' + (Math.random() * 18).toFixed(1) + 's');
      bat.style.setProperty('--bob', (1.8 + Math.random() * 2).toFixed(1) + 's');
      bat.style.setProperty('--amp', (18 + Math.random() * 40).toFixed(0) + 'px');
      bat.style.setProperty('--flap', (0.2 + Math.random() * 0.15).toFixed(2) + 's');
      bat.innerHTML = '<div class="bob">' + BAT + '</div>';
      bats.appendChild(bat);
    }
    document.body.appendChild(bats);
  }

  /* ---------- Bandeau (fermable, le choix est retenu) ---------- */
  var closed = false;
  try { closed = localStorage.getItem('uandi-hw-closed') === '1'; } catch (e) {}
  if (!closed) {
    var bar = document.createElement('div');
    bar.id = 'hwBar';
    var t = document.createElement('span');
    t.textContent = '🎃 Joyeux Halloween sur U&I !';
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fermer');
    x.textContent = '✕';
    x.addEventListener('click', function () {
      bar.remove();
      try { localStorage.setItem('uandi-hw-closed', '1'); } catch (e) {}
    });
    bar.appendChild(t);
    bar.appendChild(x);
    document.body.appendChild(bar);
  }

  /* ---------- Frayeurs aléatoires à chaque ouverture ---------- */
  // Pour couper les frayeurs sur un appareil : localStorage.setItem('uandi-hw-calm','1')
  var calm = false;
  try { calm = localStorage.getItem('uandi-hw-calm') === '1'; } catch (e) {}
  if (!reduce && !calm) {
    var st2 = document.createElement('style');
    st2.id = 'hwStyle2';
    st2.textContent = [
      '.hwScare{position:fixed;pointer-events:none;z-index:60}',
      /* 1. Fantôme qui surgit */
      '.hwGhost{inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.85);',
      'font-size:42vmin;opacity:0;animation:hwGhost 1.7s ease-out forwards}',
      '@keyframes hwGhost{0%{opacity:0;transform:scale(.3)}18%{opacity:1;transform:scale(1.1)}',
      '80%{opacity:1;transform:scale(1.28)}100%{opacity:0;transform:scale(1.45)}}',
      /* 2. Araignée qui descend */
      '.hwSpider{top:-100vh;left:var(--x,50%);display:flex;flex-direction:column;align-items:center;',
      'animation:hwSpider 6s ease-in-out forwards}',
      '.hwSpider i{display:block;width:1px;height:100vh;background:rgba(220,220,220,.7)}',
      '.hwSpider b{font-size:38px;font-weight:400;line-height:1}',
      '@keyframes hwSpider{0%{transform:translateY(0)}14%{transform:translateY(calc(100vh + var(--y,45vh)))}',
      '72%{transform:translateY(calc(100vh + var(--y,45vh) + 8px))}100%{transform:translateY(0)}}',
      /* 3. Lumières qui vacillent (lent : pas de clignotement rapide) */
      '.hwDark{inset:0;background:#000;opacity:0;animation:hwFlick 3s linear forwards}',
      '@keyframes hwFlick{0%{opacity:0}12%{opacity:.88}26%{opacity:.08}44%{opacity:.92}',
      '60%{opacity:.15}78%{opacity:.85}100%{opacity:0}}',
      /* 4. Message qui glace le sang */
      '.hwText{left:0;right:0;top:38%;text-align:center;padding:0 6vw;font:italic 800 9vw/1.1 Georgia,serif;',
      'color:#c00;text-shadow:0 0 14px #f00,0 3px 0 #300;opacity:0;animation:hwTxt 4.2s ease forwards}',
      '@keyframes hwTxt{0%{opacity:0;transform:scale(.9)}15%{opacity:1;transform:scale(1)}',
      '80%{opacity:1;transform:scale(1.04)}100%{opacity:0;transform:scale(1.08)}}',
      /* 5. Yeux dans le noir */
      '.hwEye{font-size:30px;opacity:0;animation:hwEye 3.4s ease-in-out forwards}',
      '@keyframes hwEye{0%,100%{opacity:0}25%,70%{opacity:.95}}',
      /* 6. Écran qui saigne */
      '.hwBlood{inset:0;box-shadow:inset 0 0 120px 45px rgba(190,0,0,.85);opacity:0;',
      'animation:hwBlood 2.8s ease-in-out forwards}',
      '@keyframes hwBlood{0%,100%{opacity:0}30%{opacity:1}50%{opacity:.45}70%{opacity:1}}'
    ].join('');
    document.head.appendChild(st2);

    var touched = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
    window.addEventListener('pointerdown', function () { touched = true; }, { once: true, passive: true });

    function sting() { // petit bruit grave, uniquement si la personne a déjà touché l'écran
      if (!touched) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        var ac = new AC(), o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(38, t + .9);
        g.gain.setValueAtTime(.0001, t);
        g.gain.exponentialRampToValueAtTime(.18, t + .05);
        g.gain.exponentialRampToValueAtTime(.0001, t + .95);
        o.connect(g); g.connect(ac.destination);
        o.start(t); o.stop(t + 1);
        setTimeout(function () { try { ac.close(); } catch (e) {} }, 1400);
      } catch (e) {}
    }
    function buzz(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
    function put(cls, html, ms, style) {
      var d = document.createElement('div');
      d.className = 'hwScare ' + cls;
      if (html) d.innerHTML = html;
      if (style) d.setAttribute('style', style);
      document.body.appendChild(d);
      setTimeout(function () { d.remove(); }, ms);
      return d;
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }

    /* ---------- Monstres 3D (three.js chargé à la demande) ---------- */
    var threeP = null;
    function loadThree() {
      if (window.THREE) return Promise.resolve();
      if (threeP) return threeP;
      threeP = new Promise(function (res, rej) {
        var sc = document.createElement('script');
        sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
        sc.onload = res;
        sc.onerror = function () { threeP = null; rej(new Error('three')); };
        document.head.appendChild(sc);
      });
      return threeP;
    }

    function ghostFlat() { // secours si la 3D n'est pas disponible
      put('hwGhost', '👻', 1800); sting(); buzz([120, 60, 220]);
    }

    var LUNGE_AT = 2.0; // seconde où le monstre se jette sur l'écran
    function zAt(t, lunge) { return t < LUNGE_AT ? -18 + 14 * (t / LUNGE_AT) : -4 + 7.4 * lunge * lunge; }

    function mkBlob(T, g, rx, ry, rz, x, y, z, col, rotZ) {
      var m = new T.Mesh(new T.SphereGeometry(1, 16, 16), new T.MeshBasicMaterial({ color: col }));
      m.scale.set(rx, ry, rz);
      m.position.set(x, y, z);
      m.rotation.z = rotZ || 0;
      g.add(m);
      return m;
    }

    /* ----- 1. Fantôme ----- */
    function buildGhost(T, scene) {
      var pts = [
        new T.Vector2(1.12, -1.25), new T.Vector2(1.08, -.8),
        new T.Vector2(1.04, -.3), new T.Vector2(1.02, .2)
      ];
      var i;
      for (i = 0; i <= 12; i++) {
        var a = (1 - i / 12) * Math.PI / 2;
        pts.push(new T.Vector2(Math.sin(a), .6 + Math.cos(a)));
      }
      var geo = new T.LatheGeometry(pts, 40);
      var pos = geo.attributes.position;
      for (i = 0; i < pos.count; i++) {
        var y = pos.getY(i);
        if (y < -1.2) {
          var ang = Math.atan2(pos.getZ(i), pos.getX(i));
          pos.setY(i, y - (0.5 + 0.5 * Math.sin(ang * 6)) * 0.4);
        }
      }
      geo.computeVertexNormals();
      var mat = new T.MeshPhongMaterial({
        color: 0xdfe8ff, emissive: 0x3a4a7a, shininess: 30,
        transparent: true, opacity: 0.92, side: T.DoubleSide
      });
      var g = new T.Group();
      g.add(new T.Mesh(geo, mat));
      mkBlob(T, g, .2, .34, .12, -.36, .8, .9, 0x000000, .3);
      mkBlob(T, g, .2, .34, .12, .36, .8, .9, 0x000000, -.3);
      mkBlob(T, g, .06, .1, .06, -.36, .78, 1.0, 0xff1010, 0);
      mkBlob(T, g, .06, .1, .06, .36, .78, 1.0, 0xff1010, 0);
      mkBlob(T, g, .26, .5, .14, 0, .15, .98, 0x000000, 0);
      [-1, 1].forEach(function (sd) {
        var arm = new T.Mesh(new T.CylinderGeometry(.14, .24, 1.5, 12), mat);
        arm.position.set(sd * 1.25, .1, .6);
        arm.rotation.set(-1.0, 0, sd * .9);
        g.add(arm);
      });
      var red = new T.PointLight(0xff2020, .9, 14);
      red.position.set(0, -1, 3);
      g.add(red);
      scene.add(g);
      return function (t, lunge) {
        var calmX = t < LUNGE_AT ? 1.8 * (1 - t / LUNGE_AT) : .1;
        g.position.set(Math.sin(t * 1.6) * calmX, Math.sin(t * 3) * .25 - .2, zAt(t, lunge));
        g.rotation.y = Math.sin(t * 2) * .3 * (1 - lunge);
        g.rotation.z = Math.sin(t * 4) * .06;
      };
    }

    /* ----- 2. Citrouille maléfique ----- */
    function buildPumpkin(T, scene) {
      var geo = new T.SphereGeometry(1, 40, 28);
      var pos = geo.attributes.position, i;
      for (i = 0; i < pos.count; i++) {
        var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        var k = 1 + 0.07 * Math.cos(Math.atan2(z, x) * 10); // côtes de la citrouille
        pos.setXYZ(i, x * k, y * .85, z * k);
      }
      geo.computeVertexNormals();
      var g = new T.Group();
      g.add(new T.Mesh(geo, new T.MeshPhongMaterial({ color: 0xff7a00, emissive: 0x7a2a00, shininess: 20 })));
      var stem = new T.Mesh(new T.CylinderGeometry(.12, .18, .4, 10),
        new T.MeshPhongMaterial({ color: 0x2c5a1a, emissive: 0x0f2a08 }));
      stem.position.set(0, .88, 0);
      stem.rotation.z = .2;
      g.add(stem);
      var glow = new T.MeshBasicMaterial({ color: 0xffe14a });
      function spike(x, y, z, tilt, size) { // pyramide lumineuse tournée vers l'avant
        var w = new T.Group();
        var c = new T.Mesh(new T.ConeGeometry(size, size * 1.7, 3), glow);
        c.rotation.x = Math.PI / 2;
        w.add(c);
        w.position.set(x, y, z);
        w.rotation.z = tilt;
        g.add(w);
      }
      spike(-.4, .25, .84, .5, .2);   // yeux en colère
      spike(.4, .25, .84, -.5 + Math.PI, .2);
      spike(0, -.02, .95, Math.PI, .1); // nez
      for (i = 0; i < 9; i++) {         // sourire plein de dents
        var mx = -.62 + i * .155;
        var my = -.36 + .34 * Math.pow(mx / .62, 2) + (i % 2 ? -.07 : .04);
        var mz = Math.sqrt(Math.max(.05, 1 - mx * mx - Math.pow(my / .85, 2)));
        mkBlob(T, g, .09, i % 2 ? .14 : .1, .08, mx, my, mz + .02, 0xffe14a, 0);
      }
      var lamp = new T.PointLight(0xff8a1f, 1.6, 12);
      lamp.position.set(0, 0, 2.2);
      g.add(lamp);
      scene.add(g);
      return function (t, lunge) {
        var calmX = t < LUNGE_AT ? -1.6 * (1 - t / LUNGE_AT) : -.05;
        g.position.set(Math.sin(t * 1.3) * 0.5 + calmX, Math.abs(Math.sin(t * 4)) * .35 - .2, zAt(t, lunge));
        g.rotation.y = Math.sin(t * 2.2) * .5 * (1 - lunge);
        g.rotation.z = Math.sin(t * 9) * .08;   // il rigole
        lamp.intensity = 1.5 + Math.sin(t * 8) * .35;
      };
    }

    /* ----- 3. Crâne qui claque des dents ----- */
    function buildSkull(T, scene) {
      var bone = new T.MeshPhongMaterial({ color: 0xe9e0c9, emissive: 0x4a4333, shininess: 15 });
      var g = new T.Group();
      var cr = new T.Mesh(new T.SphereGeometry(1, 32, 24), bone);
      cr.scale.set(.95, 1, 1.05);
      cr.position.y = .3;
      g.add(cr);
      var face = new T.Mesh(new T.CylinderGeometry(.62, .46, .6, 20), bone);
      face.position.set(0, -.5, .28);
      face.scale.z = .85;
      g.add(face);
      mkBlob(T, g, .27, .3, .13, -.38, .3, .9, 0x000000, 0);   // orbites
      mkBlob(T, g, .27, .3, .13, .38, .3, .9, 0x000000, 0);
      mkBlob(T, g, .07, .07, .06, -.38, .3, 1.0, 0xff1010, 0); // lueur rouge
      mkBlob(T, g, .07, .07, .06, .38, .3, 1.0, 0xff1010, 0);
      mkBlob(T, g, .09, .15, .1, 0, -.05, .93, 0x000000, 0);   // nez
      var tooth = new T.MeshPhongMaterial({ color: 0xfff6dc, emissive: 0x555040 });
      var k;
      for (k = 0; k < 6; k++) {
        var tu = new T.Mesh(new T.BoxGeometry(.12, .2, .1), tooth);
        tu.position.set((k - 2.5) * .15, -.82, .66);
        g.add(tu);
      }
      var jaw = new T.Group();
      jaw.position.set(0, -.8, .05);
      var jb = new T.Mesh(new T.BoxGeometry(.9, .28, .8), bone);
      jb.position.set(0, -.14, .3);
      jaw.add(jb);
      for (k = 0; k < 6; k++) {
        var tl = new T.Mesh(new T.BoxGeometry(.11, .16, .09), tooth);
        tl.position.set((k - 2.5) * .15, .04, .66);
        jaw.add(tl);
      }
      g.add(jaw);
      var red = new T.PointLight(0xff2020, 1.0, 12);
      red.position.set(0, 0, 2.5);
      g.add(red);
      scene.add(g);
      return function (t, lunge) {
        var calmX = t < LUNGE_AT ? 1.5 * (1 - t / LUNGE_AT) : 0;
        g.position.set(Math.sin(t * 1.4) * calmX, Math.sin(t * 2.5) * .25 + .2, zAt(t, lunge));
        g.rotation.y = Math.sin(t * 1.8) * .35 * (1 - lunge);
        g.rotation.x = -.15 * lunge;
        jaw.rotation.x = .12 + (.22 + .3 * lunge) * Math.abs(Math.sin(t * 9)) + .65 * lunge; // claque, puis hurle
      };
    }

    /* ----- 4. Araignée géante qui descend ----- */
    function buildSpider(T, scene) {
      var dark = new T.MeshPhongMaterial({ color: 0x150d1f, emissive: 0x24123a, shininess: 70 });
      var g = new T.Group();
      var body = new T.Mesh(new T.SphereGeometry(1, 24, 18), dark);
      body.scale.set(.8, .65, 1.1);
      g.add(body);
      var head = new T.Mesh(new T.SphereGeometry(.5, 20, 14), dark);
      head.position.set(0, .05, 1.15);
      g.add(head);
      var ex = [[-.2, .22], [.2, .22], [-.34, .08], [.34, .08], [-.12, .08], [.12, .08]];
      ex.forEach(function (e, n) {
        mkBlob(T, g, n < 2 ? .09 : .06, n < 2 ? .09 : .06, .06, e[0], .05 + e[1], 1.6, 0xff1010, 0);
      });
      var fang = new T.MeshPhongMaterial({ color: 0xe8e0d0, emissive: 0x333028 });
      [-.16, .16].forEach(function (fx) {
        var f = new T.Mesh(new T.ConeGeometry(.07, .4, 8), fang);
        f.position.set(fx, -.3, 1.5);
        f.rotation.x = Math.PI;
        g.add(f);
      });
      var joints = [];
      [-1, 1].forEach(function (sd) {
        for (var n = 0; n < 4; n++) {
          var fan = (1.5 - n) * .5;
          var leg = new T.Group();
          leg.position.set(sd * .45, 0, (1.5 - n) * .5);
          leg.rotation.y = sd > 0 ? -fan : Math.PI + fan;
          var joint = new T.Group();
          joint.rotation.z = .7;
          var up = new T.Mesh(new T.CylinderGeometry(.07, .07, 1.4, 8), dark);
          up.rotation.z = Math.PI / 2;
          up.position.x = .7;
          joint.add(up);
          var knee = new T.Group();
          knee.position.x = 1.4;
          knee.rotation.z = -1.9;
          var low = new T.Mesh(new T.CylinderGeometry(.06, .035, 1.8, 8), dark);
          low.rotation.z = Math.PI / 2;
          low.position.x = .9;
          knee.add(low);
          joint.add(knee);
          leg.add(joint);
          g.add(leg);
          joints.push({ j: joint, ph: n * 1.3 + (sd > 0 ? 0 : 1.7) });
        }
      });
      var thread = new T.Mesh(new T.CylinderGeometry(.015, .015, 40, 6), new T.MeshBasicMaterial({ color: 0xdddddd }));
      thread.position.y = 20;
      g.add(thread);
      var red = new T.PointLight(0xff2a2a, 1.0, 14);
      red.position.set(0, .5, 3);
      g.add(red);
      g.scale.set(.85, .85, .85);
      scene.add(g);
      return function (t, lunge) {
        var drop = Math.min(t / LUNGE_AT, 1);
        g.position.set(Math.sin(t * 1.3) * .8 * (1 - drop), 5.5 * (1 - drop) + Math.sin(t * 3) * .2, zAt(t, lunge));
        g.rotation.x = .25 + .2 * lunge;
        g.rotation.z = Math.sin(t * 2) * .08;
        joints.forEach(function (o) { o.j.rotation.z = .7 + Math.sin(t * 9 + o.ph) * .2; });
      };
    }

    /* ----- Lecteur commun ----- */
    function play3d(build) {
      loadThree().then(function () {
        if (Date.now() >= END) return;
        var T = window.THREE, W = window.innerWidth, H = window.innerHeight;
        var cv = document.createElement('canvas');
        cv.className = 'hwScare hwGhost3d';
        cv.setAttribute('style', 'inset:0;width:100%;height:100%;opacity:1;transition:opacity .5s');
        document.body.appendChild(cv);
        var r;
        try {
          r = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
        } catch (e) { cv.remove(); ghostFlat(); return; }
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        r.setSize(W, H, false);

        var dk = put('', '', 4200, 'inset:0;background:#000;opacity:0;transition:opacity .8s');
        requestAnimationFrame(function () { dk.style.opacity = '.78'; });

        var scene = new T.Scene();
        var cam = new T.PerspectiveCamera(60, W / H, 0.1, 60);
        cam.position.z = 6;
        scene.add(new T.AmbientLight(0x8090c0, 0.7));
        var key = new T.PointLight(0xffffff, 1.3, 0);
        key.position.set(2, 3, 6);
        scene.add(key);

        var update = build(T, scene, cam);
        var t0 = performance.now(), stung = false, raf = 0, ended = false;
        function end() {
          if (ended) return;
          ended = true;
          cancelAnimationFrame(raf);
          try {
            scene.traverse(function (o) {
              if (o.geometry) o.geometry.dispose();
              if (o.material) o.material.dispose();
            });
            r.dispose();
          } catch (e) {}
          cv.remove();
        }
        function frame(now) {
          if (ended) return;
          if (!cv.isConnected) { end(); return; }
          var t = (now - t0) / 1000;
          var lunge = t > LUNGE_AT ? Math.min((t - LUNGE_AT) / .35, 1) : 0;
          update(t, lunge);
          if (lunge > 0) {
            cam.position.x = (Math.random() - .5) * .15 * lunge;
            cam.position.y = (Math.random() - .5) * .15 * lunge;
            if (!stung) { stung = true; sting(); buzz([200, 60, 300]); }
          }
          if (t > 3.0) cv.style.opacity = '0';
          r.render(scene, cam);
          if (t > 3.6) { end(); return; }
          raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
      }).catch(ghostFlat);
    }

    var scares = [
      function () { put('hwSpider', '<i></i><b>🕷️</b>', 6200, '--x:' + rnd(10, 85).toFixed(0) + '%;--y:' + rnd(25, 60).toFixed(0) + 'vh'); },
      function () { put('hwDark', '', 3100); sting(); },
      function () {
        var m = ['Il est derrière toi…', 'Ne te retourne pas…', 'Tu n’es pas seul(e)…', 'Je te vois…', 'Ils arrivent…'];
        put('hwText', m[Math.floor(Math.random() * m.length)], 4300);
        buzz([80, 80, 80]);
      },
      function () {
        for (var k = 0; k < 4; k++) {
          put('hwEye', '👀', 3600 + k * 400,
            'left:' + rnd(4, 86).toFixed(0) + '%;top:' + rnd(8, 88).toFixed(0) + '%;animation-delay:' + (k * .4).toFixed(1) + 's');
        }
      },
      function () { put('hwBlood', '', 2900); buzz([200, 80, 200, 80, 300]); sting(); }
    ];

    // À chaque ouverture : 2 monstres 3D différents + 1 frayeur plate, dans un ordre aléatoire
    function shuf(a) { return a.slice().sort(function () { return Math.random() - .5; }); }
    var monsters = shuf([buildGhost, buildPumpkin, buildSkull, buildSpider]);
    var flat = shuf(scares)[0];
    var order = shuf([
      function () { play3d(monsters[0]); },
      function () { play3d(monsters[1]); },
      flat
    ]);
    window.addEventListener('load', function () { setTimeout(function () { loadThree().catch(function () {}); }, 3000); }); // préchargement après le démarrage de l’appli
    var delay = rnd(5000, 9000);
    order.forEach(function (fn) {
      setTimeout(function () {
        if (Date.now() >= END || document.hidden || document.querySelector('.callui')) return;
        fn();
      }, delay);
      delay += rnd(9000, 22000);
    });
  }

  /* ---------- Voix qui font peur, au hasard toutes les ~3 minutes ---------- */
  var vTimer = null, vSubTimer = null;
  var vCalm = false;
  try { vCalm = localStorage.getItem('uandi-hw-calm') === '1'; } catch (e) {}
  if (!vCalm && window.speechSynthesis && window.SpeechSynthesisUtterance) {
    var vTouched = !!(navigator.userActivation && navigator.userActivation.hasBeenActive);
    window.addEventListener('pointerdown', function () { vTouched = true; }, { once: true, passive: true });

    var vLines = [
      'Je suis derrière toi…',
      'Tu ne peux pas t’échapper…',
      'Je te regarde…',
      'Viens avec moi…',
      'Pourquoi tu ne dors pas ?',
      'Ils sont tous là…',
      'Ne te retourne pas…',
      'Tu m’entends ?',
      'Je sais où tu es…',
      'Joyeux Halloween… pour toujours…'
    ];
    var vLast = -1;

    function vFrench() {
      try {
        var all = speechSynthesis.getVoices() || [];
        return all.filter(function (v) { return /^fr/i.test(v.lang); })[0] || null;
      } catch (e) { return null; }
    }

    function vSubtitle(txt) { // le texte s'affiche aussi à l'écran
      var d = document.createElement('div');
      d.className = 'hwVoiceSub';
      d.textContent = txt;
      d.setAttribute('style',
        'position:fixed;left:0;right:0;bottom:14vh;z-index:61;text-align:center;pointer-events:none;' +
        'padding:0 6vw;font:italic 700 6vw/1.2 Georgia,serif;color:#d11;' +
        'text-shadow:0 0 12px #f00,0 2px 0 #300;opacity:.95;transition:opacity 1.2s');
      document.body.appendChild(d);
      clearTimeout(vSubTimer);
      vSubTimer = setTimeout(function () { d.style.opacity = '0'; }, 2600);
      setTimeout(function () { d.remove(); }, 4000);
    }

    function vSpeak() {
      if (Date.now() >= END) return;
      // on attend un moment plus calme : appli visible, pas d'appel, pas de lecture en cours
      if (!vTouched || document.hidden || document.querySelector('.callui') || speechSynthesis.speaking) return;
      var i;
      do { i = Math.floor(Math.random() * vLines.length); } while (i === vLast && vLines.length > 1);
      vLast = i;
      try {
        var u = new SpeechSynthesisUtterance(vLines[i]);
        u.lang = 'fr-FR';
        var v = vFrench();
        if (v) u.voice = v;
        u.pitch = +(0.05 + Math.random() * 0.35).toFixed(2);  // voix très grave
        u.rate = +(0.55 + Math.random() * 0.25).toFixed(2);   // lente
        u.volume = +(0.7 + Math.random() * 0.3).toFixed(2);
        speechSynthesis.speak(u);
        vSubtitle(vLines[i]);
        try { navigator.vibrate && navigator.vibrate([60, 90, 60]); } catch (e) {}
      } catch (e) {}
    }

    function vNext() {
      // environ 3 minutes, avec un peu de hasard (2 min 30 à 3 min 30)
      var wait = 150000 + Math.random() * 60000;
      vTimer = setTimeout(function () {
        vSpeak();
        vNext();
      }, wait);
    }
    vNext();
  }

  /* ---------- Fin automatique (si la page reste ouverte) ---------- */
  var left = END - Date.now();
  if (left > 0 && left < 2147483647) {
    setTimeout(function () {
      ['hwBar', 'hwFx', 'hwBats', 'hwGlow', 'hwStyle', 'hwStyle2'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.remove();
      });
      document.querySelectorAll('.hwScare').forEach(function (el) { el.remove(); });
      document.querySelectorAll('.hwVoiceSub').forEach(function (el) { el.remove(); });
      clearTimeout(vTimer);
      try { speechSynthesis.cancel(); } catch (e) {}
    }, left);
  }
})();
