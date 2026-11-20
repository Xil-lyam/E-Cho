
/* ===== X'enify : couche Supabase (démarrage, discussions, amis en temps réel) ===== */
  /* ===== Couche « comme Firestore » au-dessus de Supabase (table xdocs, bloc 9) =====
     Gère : lettres (letters, lettersN, letterOwners), anonymes (anonThreads, anonRequests, anonProfiles),
     Action ou vérité (truthDareRooms), appels et direct (chats/…).
     Les autres collections (usernames, presence, approvals…) restent « non converties » et échouent proprement. */
  var FV_DEL = { __fv: 'del' };
  var firebase = { firestore: { FieldValue: {
      delete: function () { return FV_DEL; },
      arrayUnion: function () { return { __fv: 'union', v: Array.prototype.slice.call(arguments) }; },
      arrayRemove: function () { return { __fv: 'remove', v: Array.prototype.slice.call(arguments) }; },
      increment: function (n) { return { __fv: 'inc', v: n }; } } },
    auth: { EmailAuthProvider: { credential: function () { return null; } } } };
  var fs = (function () {
    var XD = ['letters', 'lettersN', 'letterOwners', 'anonThreads', 'anonRequests', 'truthDareRooms', 'chats'];
    var dead = function () { return Promise.reject(new Error('non converti')); };
    function node() {
      return new Proxy(function () {}, {
        get: function (t, k) {
          if (k === 'then') return undefined;
          if (k === 'onSnapshot') return function (ok, err) { if (typeof err === 'function') setTimeout(function () { try { err(new Error('non converti')); } catch (e) {} }, 0); return function () {}; };
          if (k === 'get' || k === 'set' || k === 'add' || k === 'update' || k === 'delete' || k === 'commit') return dead;
          return node();
        },
        apply: function () { return node(); }
      });
    }
    function T() { return SB.from('xdocs'); }
    function chk(r) { if (r && r.error) { var e = new Error(r.error.message || 'erreur'); e.code = r.error.code; throw e; } return r; }
    function rid() { var a = new Uint8Array(15); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
    function clean(o) { return JSON.parse(JSON.stringify(o, function (k, v) { return v === undefined ? null : v; })); }
    function isFV(v) { return v && typeof v === 'object' && typeof v.__fv === 'string'; }
    function opsOf(patch) {
      var ops = [];
      Object.keys(patch).forEach(function (k) {
        var v = patch[k], p = k.split('.');
        if (isFV(v)) ops.push(v.__fv === 'del' ? { o: 'del', p: p } : { o: v.__fv, p: p, v: v.v });
        else ops.push({ o: 'set', p: p, v: v === undefined ? null : clean({ x: v }).x });
      });
      return ops;
    }
    function stripFV(o) { var r = {}; Object.keys(o).forEach(function (k) { if (!isFV(o[k])) r[k] = o[k]; }); return r; }
    function mkSnap(path, data) {
      var segs = path.split('/');
      return { id: segs[segs.length - 1], exists: !!data, ref: docRef(path), data: function () { return data ? JSON.parse(JSON.stringify(data)) : undefined; } };
    }
    function cmp(a, b) { if (a === b) return 0; if (a === undefined || a === null) return -1; if (b === undefined || b === null) return 1; return a < b ? -1 : 1; }
    function sameDoc(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

    function docRef(path) {
      var segs = path.split('/');
      var ref = {
        id: segs[segs.length - 1], path: path,
        parent: { path: segs.slice(0, -1).join('/') },
        collection: function (n) { return colRef(path + '/' + n); },
        get: function () {
          return T().select('data').eq('path', path).maybeSingle().then(function (r) { chk(r); return mkSnap(path, r.data ? r.data.data : null); });
        },
        set: function (data, opt) {
          if (opt && opt.merge) {
            return SB.rpc('xdoc_apply', { p_path: path, p_ops: opsOf(data), p_upsert: true }).then(chk).then(function () {});
          }
          var coll = segs.slice(0, -1).join('/');
          return T().upsert({ path: path, coll: coll, id: ref.id, data: clean(stripFV(data)) }).then(chk).then(function () {});
        },
        update: function (patch) {
          var keys = Object.keys(patch);
          if (/^anonThreads\/[^/]+$/.test(path) && keys.length === 2 && keys.indexOf('b') > -1 && keys.indexOf('members') > -1) {
            return SB.rpc('anon_join', { p_tid: ref.id }).then(chk).then(function () {});     /* rejoindre une discussion anonyme */
          }
          return SB.rpc('xdoc_apply', { p_path: path, p_ops: opsOf(patch), p_upsert: false }).then(chk).then(function () {});
        },
        delete: function () { return T().delete().eq('path', path).then(chk).then(function () {}); },
        onSnapshot: function (ok, err) {
          var alive = true, ch = null, tmr = null;
          function load() {
            ref.get().then(function (s) { if (alive) ok(s); }, function (e) { if (alive && err) err(e); });
          }
          load();
          try {
            ch = SB.channel('xd-' + rid())
              .on('postgres_changes', { event: '*', schema: 'public', table: 'xdocs', filter: 'path=eq.' + path }, function () { clearTimeout(tmr); tmr = setTimeout(load, 60); })
              .subscribe();
          } catch (e) {}
          return function () { alive = false; clearTimeout(tmr); if (ch) { try { SB.removeChannel(ch); } catch (e) {} ch = null; } };
        }
      };
      return ref;
    }

    function colRef(path) {
      var f = [], ord = [], lim = 0;
      var q = {
        path: path,
        doc: function (id) { return docRef(path + '/' + (id === undefined ? rid() : String(id))); },
        add: function (data) { var d = q.doc(); return d.set(data).then(function () { return d; }); },
        where: function (k, op, v) { f.push([k, op, v]); return q; },
        orderBy: function (k, dir) { ord.push([k, dir === 'desc' ? -1 : 1]); return q; },
        limit: function (n) { lim = n; return q; },
        get: function () { return run(); },
        onSnapshot: function (ok, err) {
          var alive = true, ch = null, tmr = null, prev = null;
          function load() {
            run().then(function (s) {
              if (!alive) return;
              var before = prev; prev = {};
              s.docs.forEach(function (d) { prev[d.id] = d.data(); });
              s.docChanges = function () {
                var out = [];
                s.docs.forEach(function (d) {
                  if (!before || !(d.id in before)) out.push({ type: 'added', doc: d });
                  else if (!sameDoc(before[d.id], d.data())) out.push({ type: 'modified', doc: d });
                });
                if (before) Object.keys(before).forEach(function (id) { if (!(id in prev)) out.push({ type: 'removed', doc: mkSnap(path + '/' + id, before[id]) }); });
                return out;
              };
              ok(s);
            }, function (e) { if (alive && err) err(e); });
          }
          load();
          try {
            ch = SB.channel('xc-' + rid())
              .on('postgres_changes', { event: '*', schema: 'public', table: 'xdocs', filter: 'coll=eq.' + path }, function () { clearTimeout(tmr); tmr = setTimeout(load, 60); })
              .subscribe();
          } catch (e) {}
          return function () { alive = false; clearTimeout(tmr); if (ch) { try { SB.removeChannel(ch); } catch (e) {} ch = null; } };
        }
      };
      function run() {
        var b = T().select('path,data').eq('coll', path);
        f.forEach(function (c) {
          var k = c[0], op = c[1], v = c[2];
          if (op === '==' && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) b = b.eq('data->>' + k, String(v));
          else if (op === 'in' && Array.isArray(v) && v.length && v.every(function (x) { return typeof x === 'string'; })) b = b.in('data->>' + k, v);
        });
        return b.limit(1000).then(function (r) {
          chk(r);
          var docs = (r.data || []).map(function (x) { return mkSnap(x.path, x.data); });
          docs = docs.filter(function (d) {
            var v0 = d.data();
            return f.every(function (c) {
              var x = v0[c[0]], op = c[1], v = c[2];
              if (op === '==') return x === v;
              if (op === 'in') return Array.isArray(v) && v.indexOf(x) > -1;
              if (op === 'array-contains') return Array.isArray(x) && x.indexOf(v) > -1;
              if (op === '!=') return x !== v;
              if (op === '>') return x > v; if (op === '>=') return x >= v;
              if (op === '<') return x < v; if (op === '<=') return x <= v;
              return true;
            });
          });
          if (ord.length) docs.sort(function (a, b) {
            var da = a.data(), db = b.data();
            for (var i = 0; i < ord.length; i++) { var c = cmp(da[ord[i][0]], db[ord[i][0]]) * ord[i][1]; if (c) return c; }
            return 0;
          });
          if (lim) docs = docs.slice(0, lim);
          return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (cb) { docs.forEach(cb); }, docChanges: function () { return docs.map(function (d) { return { type: 'added', doc: d }; }); } };
        });
      }
      return q;
    }

    /* cas particuliers : annuaire des identifiants et option « accepte les messages anonymes » */
    function usernameDoc(name) {
      return { get: function () {
        return SB.rpc('uid_of_username', { p_name: name }).then(chk).then(function (r) { return { exists: !!r.data, data: function () { return { uid: r.data }; } }; });
      } };
    }
    function presenceDoc(uid) {
      return {
        get: function () { return SB.rpc('anon_accepts', { p_uid: uid }).then(chk).then(function (r) { return { exists: r.data === false, data: function () { return r.data === false ? { noAnon: true } : {}; } }; }); },
        set: function (data) {
          if (!('noAnon' in data)) return Promise.reject(new Error('non converti'));
          return SB.from('anon_profiles').upsert({ uid: uid, no_anon: !isFV(data.noAnon) }).then(chk).then(function () {});
        }
      };
    }
    function anonProfDoc(uid) {
      return {
        get: function () {
          return SB.from('anon_profiles').select('data').eq('uid', uid).maybeSingle().then(chk).then(function (r) {
            var d = r.data && r.data.data && Object.keys(r.data.data).length ? r.data.data : null;
            return { exists: !!d, data: function () { return d; } };
          });
        },
        set: function (data) { return SB.from('anon_profiles').upsert({ uid: uid, name: data && data.name || null, data: clean(data) }).then(chk).then(function () {}); }
      };
    }
    var api = {
      collection: function (n) {
        if (n === 'anonProfiles') return { doc: anonProfDoc, get: dead };
        if (XD.indexOf(n) > -1) return colRef(n);
        if (n === 'usernames') return { doc: usernameDoc, get: dead };
        if (n === 'presence') return { doc: presenceDoc, where: function () { return { get: dead }; }, get: dead };
        return node().collection(n);
      },
      batch: function () {
        var jobs = [];
        var b = {
          set: function (ref, d, o) { jobs.push(function () { return ref.set(d, o); }); return b; },
          update: function (ref, d) { jobs.push(function () { return ref.update(d); }); return b; },
          delete: function (ref) { jobs.push(function () { return ref.delete(); }); return b; },
          commit: function () { return jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve()); }
        };
        return b;
      },
      runTransaction: function (fn) {
        var jobs = [];
        var tx = {
          get: function (ref) { return ref.get(); },
          set: function (ref, d, o) { jobs.push(function () { return ref.set(d, o); }); return tx; },
          update: function (ref, d) { jobs.push(function () { return ref.update(d); }); return tx; },
          delete: function (ref) { jobs.push(function () { return ref.delete(); }); return tx; }
        };
        return Promise.resolve(fn(tx)).then(function (res) {
          return jobs.reduce(function (p, j) { return p.then(j); }, Promise.resolve()).then(function () { return res; });
        });
      }
    };
    return api;
  })();
  var auth = { currentUser: null, _ready: false, _cbs: [], _uid: undefined,
    signOut: function () { return SB.auth.signOut(); },
    onAuthStateChanged: function (cb) { auth._cbs.push(cb); if (auth._ready) setTimeout(function () { cb(auth.currentUser); }, 0); } };
  function mkUser(u) {
    if (!u) return null;
    return { uid: u.id, id: u.id, email: u.email, user_metadata: u.user_metadata || {},
      getIdToken: function () { return SB.auth.getSession().then(function (r) { var s = r && r.data && r.data.session; if (!s) throw new Error('session'); return s.access_token; }); } };
  }
  SB.auth.onAuthStateChange(function (ev, session) {
    var u = mkUser(session && session.user), uid = u ? u.uid : null;
    auth.currentUser = u; window.__xenUser = u;
    if (auth._ready && auth._uid === uid) return;   /* même compte (jeton renouvelé, retour sur l'onglet…) : rien à relancer */
    auth._uid = uid;
    setTimeout(function () { auth._ready = true; auth._cbs.slice().forEach(function (cb) { try { cb(auth.currentUser); } catch (e) { try { console.error(e); } catch (x) {} } }); }, 0);
  });
  async function namesOf(uids) {
    var out = {};
    if (!uids.length) return out;
    var r = await SB.from('profiles').select('id,username,name').in('id', uids);
    if (r.error) throw r.error;
    (r.data || []).forEach(function (p) { out[p.id] = p.name || p.username; });
    return out;
  }
  async function pullChats(me) {
    var r1 = await SB.from('conversation_members').select('conversation_id').eq('user_id', me);
    if (r1.error) throw r1.error;
    var ids = (r1.data || []).map(function (x) { return x.conversation_id; });
    if (!ids.length) return [];
    var rs = await Promise.all([SB.from('conversations').select('*').in('id', ids), SB.from('conversation_members').select('*').in('conversation_id', ids)]);
    if (rs[0].error) throw rs[0].error; if (rs[1].error) throw rs[1].error;
    var by = {}, uu = {};
    (rs[1].data || []).forEach(function (m) { (by[m.conversation_id] = by[m.conversation_id] || []).push(m); uu[m.user_id] = 1; });
    var names = await namesOf(Object.keys(uu));
    return (rs[0].data || []).map(function (c) {
      var mem = by[c.id] || [], nm = {};
      mem.forEach(function (m) { if (names[m.user_id]) nm[m.user_id] = names[m.user_id]; });
      return convToChat(c, mem, nm);
    });
  }
  async function pullFriends(me) {
    var r = await SB.from('friendships').select('*').or('requester_id.eq.' + me + ',addressee_id.eq.' + me);
    if (r.error) throw r.error;
    var rows = r.data || [], uu = {};
    rows.forEach(function (x) { uu[x.requester_id] = 1; uu[x.addressee_id] = 1; });
    var nm = await namesOf(Object.keys(uu));
    return rows.map(function (x) { return frFromRow(x, nm); });
  }
  var RT = { gen: 0, ch: null, t1: 0, t2: 0, poll: 0, sc: 0, ac: 0, sf: 0, af: 0 };
  function rtStart() {
    rtStop();
    var gen = RT.gen;
    var kc = function () { clearTimeout(RT.t1); RT.t1 = setTimeout(rtChats, 250); };
    var kf = function () { clearTimeout(RT.t2); RT.t2 = setTimeout(rtFriends, 250); };
    RT.ch = SB.channel('rt-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, kc)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, kc)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, kf)
      .subscribe();
    RT.poll = setInterval(function () { if (gen === RT.gen && !document.hidden) { kc(); kf(); } }, 45000);
    rtChats(); rtFriends();
  }
  function rtStop() {
    RT.gen++;
    clearTimeout(RT.t1); clearTimeout(RT.t2); clearInterval(RT.poll);
    if (RT.ch) { try { SB.removeChannel(RT.ch); } catch (e) {} RT.ch = null; }
  }
  function rtChats() {
    var gen = RT.gen, me = state.me, sq = ++RT.sc; if (!me) return;
    pullChats(me).then(function (list) {
      if (gen !== RT.gen || state.me !== me || sq < RT.ac) return; RT.ac = sq;
      applyChats(list);
    }, function () {
      if (gen !== RT.gen || state.me !== me) return;
      if (!state.chatsLoaded) { state.chatsLoaded = true; state.chats = []; renderList(); showNewErr('Impossible de charger les discussions. Vérifie ta connexion.'); }
    });
  }
  function rtFriends() {
    var gen = RT.gen, me = state.me, sq = ++RT.sf; if (!me) return;
    pullFriends(me).then(function (list) {
      if (gen !== RT.gen || state.me !== me || sq < RT.af) return; RT.af = sq;
      applyFriends(list);
    }, function () {});
  }
  function applyFriends(list) {
    var firstFr = !FR.loaded; FR.loaded = true;
    if (!firstFr) {
      var had = {}; FR.list.forEach(function (f) { had[f.id] = 1; });
      list.forEach(function (v) { if (!had[v.id] && v.status === 'pending' && v.from !== state.me) notifyFriendReq(v); });
    }
    FR.list = list;
    frWatchPres(); frBadge(); bdayPaint();
    if (frDlg.open) frRender();
    if (ucDlg.open) ucRender();
  }
/* ===== fin de la couche Supabase ===== */

/* E'cho — js/app/18-compte.js
   Likes de profil, mot de passe, suppression du compte
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- likes de profil ---------- */
  var likeUnsub = null, likeState = { uid: null, n: 0, mine: false };
  function paintLike() {
    var b = $('#nvLike');
    b.classList.toggle('on', likeState.mine);
    b.setAttribute('aria-pressed', likeState.mine ? 'true' : 'false');
    b.firstChild.textContent = likeState.mine ? '♥' : '♡';
    $('#nvLikeN').textContent = likeState.n;
    b.disabled = likeState.uid === state.me;
  }
  function stopLikes() { if (likeUnsub) { likeUnsub(); likeUnsub = null; } }
  function watchLikes(uid) {
    stopLikes();
    likeState = { uid: uid, n: 0, mine: false };
    $('#nvLikeErr').hidden = true;
    paintLike();
    var alive = true, ch = null;
    function failed() {
      if (!alive) return;
      var e = $('#nvLikeErr');
      e.textContent = 'Les likes de profil ne sont pas encore disponibles.';
      e.hidden = false;
    }
    function refresh() {
      SB.from('profile_likes').select('from_uid').eq('to_uid', uid).then(function (r) {
        if (!alive) return;
        if (r.error) { failed(); return; }
        var rows = r.data || [];
        likeState.n = rows.length;
        likeState.mine = rows.some(function (d) { return d.from_uid === state.me; });
        paintLike();
      }, failed);
    }
    refresh();
    try {
      ch = SB.channel('likes-' + uid + '-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profile_likes', filter: 'to_uid=eq.' + uid }, refresh)
        .subscribe();
    } catch (e) {}
    likeUnsub = function () { alive = false; if (ch) { try { SB.removeChannel(ch); } catch (e) {} ch = null; } };
  }
  $('#nvLike').addEventListener('click', function () {
    var uid = likeState.uid;
    if (!uid || uid === state.me) return;
    var err = $('#nvLikeErr'); err.hidden = true;
    var wasMine = likeState.mine;
    var p = wasMine
      ? SB.from('profile_likes').delete().eq('to_uid', uid).eq('from_uid', state.me)
      : SB.from('profile_likes').insert({ to_uid: uid, from_uid: state.me });
    /* affichage immédiat, le temps réel confirme ensuite */
    likeState.mine = !wasMine; likeState.n = Math.max(0, likeState.n + (wasMine ? -1 : 1)); paintLike();
    Promise.resolve(p).then(function (r) { if (r && r.error) throw r.error; }).catch(function () {
      likeState.mine = wasMine; likeState.n = Math.max(0, likeState.n + (wasMine ? 1 : -1)); paintLike();
      err.textContent = 'Le like n’a pas pu être enregistré (connexion ou règles Supabase « profile_likes »).';
      err.hidden = false;
    });
  });
  nvDlg.addEventListener('close', stopLikes);

  /* ---------- blocage d'une personne (table blocks) ---------- */
  var BLK = { set: {}, loaded: false };
  function blkLoad() {
    var me = state.me; if (!me) return;
    SB.from('blocks').select('blocked').then(function (r) {
      if (r.error || state.me !== me) return;
      BLK.set = {}; (r.data || []).forEach(function (x) { BLK.set[x.blocked] = true; });
      BLK.loaded = true; renderList();
    }, function () {});
  }
  window.__blkReload = blkLoad;
  function isBlockedChat(c) {
    if (!c || c.group || !BLK || !BLK.set) return false;
    var o = (c.members || []).filter(function (x) { return x !== state.me; })[0];
    return !!(o && BLK.set[o]);
  }
  function blkPaint(uid, name) {
    var like = $('#nvLike'), b = $('#nvBlock');
    if (!like) return;
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.id = 'nvBlock'; b.className = 'ghost';
      var cl = $('#nvClose');
      if (cl && cl.parentNode) cl.parentNode.insertBefore(b, cl); else like.parentNode.appendChild(b);
      b.addEventListener('click', function () {
        var u = b.dataset.uid, nm = b.dataset.name || 'cette personne';
        if (!u || u === state.me) return;
        var on = !!BLK.set[u];
        if (!on && !confirm('Bloquer ' + nm + ' ? Elle ne pourra plus t’écrire et vos discussions seront masquées. Tu peux la débloquer à tout moment.')) return;
        b.disabled = true;
        var q = on ? SB.from('blocks').delete().eq('blocker', state.me).eq('blocked', u)
                   : SB.from('blocks').insert({ blocked: u });
        q.then(function (r) {
          if (r.error) throw r.error;
          if (on) delete BLK.set[u]; else BLK.set[u] = true;
          blkPaint(u, nm); renderList();
        }).catch(function () { alert('Action impossible (connexion ou règles Supabase « blocks »).'); })
          .then(function () { b.disabled = false; });
      });
    }
    b.dataset.uid = uid || ''; b.dataset.name = name || '';
    b.hidden = !uid || uid === state.me;
    b.textContent = BLK.set[uid] ? 'Débloquer' : 'Bloquer';
  }
  [neDlg, nvDlg].forEach(function (d) {
    d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
  });

  /* ---------- mot de passe : changer, code de récupération, mot de passe oublié ---------- */
  var TE = new TextEncoder(), TD = new TextDecoder();
  function b64(u) { return btoa(String.fromCharCode.apply(null, u)); }
  function unb64(t) { return Uint8Array.from(atob(t), function (c) { return c.charCodeAt(0); }); }
  function rcKey(code, salt) {
    var raw = TE.encode(code.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
    return crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function rcSave(uname, code, pass) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return rcKey(code, salt).then(function (k) { return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, TE.encode(pass)); }).then(function (ct) {
      return SB.from('recovery').upsert({ username: uname, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)), uid: auth.currentUser.uid }).then(function (r) { if (r.error) throw r.error; });
    });
  }
  function rcOpen(uname, code) {
    return SB.from('recovery').select('salt,iv,ct').eq('username', uname).maybeSingle().then(function (d) {
      if (d.error) throw d.error;
      if (!d.data) throw new Error('none');
      var v = d.data;
      return rcKey(code, unb64(v.salt)).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, k, unb64(v.ct)); });
    }).then(function (b) { return TD.decode(b); });
  }
  function newCode() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(20)), s = '', i;
    for (i = 0; i < 20; i++) { s += A[r[i] % 32]; if (i % 5 === 4 && i < 19) s += '-'; }
    return s;
  }
  function pwErr(t) { var e = $('#pwErr'); e.textContent = t || ''; e.hidden = !t; }
  function pwReauth() {
    var u = auth.currentUser, p = $('#pwCur').value;
    if (!u || !p) { pwErr('Entre ton mot de passe actuel.'); return Promise.reject(null); }
    return SB.auth.signInWithPassword({ email: u.email, password: p }).then(function (r) { if (r.error) throw r.error; }).catch(function (e) {
      pwErr(e && e.status === 429 ? 'Trop d’essais. Réessaie dans quelques minutes.' : 'Mot de passe actuel incorrect.'); throw null;
    });
  }
  $('#pwChange').addEventListener('click', function () {
    var np = $('#pwNew').value; pwErr(''); $('#pwCode').hidden = true;
    if (np.length < 6) { pwErr('Le nouveau mot de passe doit faire au moins 6 caractères.'); return; }
    pwReauth().then(function () { return SB.auth.updateUser({ password: np }).then(function (r) { if (r.error) throw r.error; }); })
      .then(function () { return Promise.resolve(SB.from('recovery').delete().eq('username', state.username)).catch(function () {}); })
      .then(function () { $('#pwCur').value = ''; $('#pwNew').value = ''; pwErr('Mot de passe changé. Crée un nouveau code de récupération.'); })
      .catch(function (e) { if (e) pwErr('Changement impossible.'); });
  });
  $('#pwRec').addEventListener('click', function () {
    var p = $('#pwCur').value, c = newCode(); pwErr('');
    if (!(window.crypto && crypto.subtle)) { pwErr('Ouvre le site en https.'); return; }
    pwReauth().then(function () { return rcSave(state.username, c, p); })
      .then(function () { var h = $('#pwCode'); h.textContent = 'Ton code (note-le, il ne sera plus affiché) : ' + c; h.hidden = false; $('#pwCur').value = ''; })
      .catch(function (e) { if (e) pwErr('Code impossible : vérifie les règles Firestore (recovery).'); });
  });
  function forgotErr(t) { var e = $('#forgotErr'); e.textContent = t || ''; e.hidden = !t; }
  function forgotShow(mode) {   /* mode : 'mail', 'code' ou null (retour à la connexion) */
    authForm.hidden = !!mode;
    $('#forgotMail').hidden = mode !== 'mail';
    $('#forgotForm').hidden = mode !== 'code';
    $('#forgotLink').textContent = mode ? '← Retour' : 'Mot de passe oublié ?';
    forgotErr(''); fmErr('');
  }
  $('#forgotLink').addEventListener('click', function () {
    forgotShow(authForm.hidden ? null : (emUrl() ? 'mail' : 'code'));
  });
  $('#fmSwap').addEventListener('click', function () { forgotShow('code'); });
  $('#fcSwap').addEventListener('click', function () { if (emUrl()) forgotShow('mail'); else forgotErr('Les codes par e-mail ne sont pas encore activés.'); });
  $('#forgotForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = $('#fu').value.trim().toLowerCase().replace(/\s+/g, ''), c = $('#fc').value.trim(), np = $('#fp').value, b = $('#forgotBtn');
    forgotErr('');
    if (!n || !c) { forgotErr('Entre ton nom d’utilisateur et ton code.'); return; }
    if (np && np.length < 6) { forgotErr('Le nouveau mot de passe doit faire au moins 6 caractères.'); return; }
    if (!(window.crypto && crypto.subtle)) { forgotErr('Ouvre le site en https.'); return; }
    b.disabled = true;
    rcOpen(n, c).then(function (pass) {
      return SB.auth.signInWithPassword({ email: n + '@' + CFG.emailDomain, password: pass }).then(function (r) {
        if (r.error) throw r.error;
        if (!np) return;
        return SB.auth.updateUser({ password: np }).then(function (r2) { if (r2.error) throw r2.error; return rcSave(n, c, np); });
      });
    }).catch(function () { forgotErr('Code ou nom d’utilisateur incorrect.'); }).then(function () { b.disabled = false; });
  });

  /* ---------- supprimer mon compte ---------- */
  function accErr(t) { var e = $('#accErr'); e.textContent = t || ''; e.hidden = !t; }
  function resetAcc() {
    $('#accConfirm').hidden = true; $('#accDel').hidden = false;
    $('#accPass').value = ''; $('#accGo').disabled = false; accErr('');
  }
  async function deleteAccount() {
    var user = auth.currentUser, pass = $('#accPass').value;
    if (!user || !state.me) return;
    if (!pass) { accErr('Entre ton mot de passe pour confirmer.'); return; }
    var go = $('#accGo'); go.disabled = true; accErr('');
    var uid = state.me;
    try {
      var rr = await SB.auth.signInWithPassword({ email: user.email, password: pass });
      if (rr.error) throw rr.error;
    } catch (e) {
      go.disabled = false;
      accErr(e && e.status === 429 ? 'Trop d’essais. Réessaie dans quelques minutes.' :
        (e && /failed to fetch|network/i.test(String(e.message || ''))) ? 'Pas de connexion internet.' : 'Mot de passe incorrect.');
      return;
    }
    state.deleting = true;
    try {
      var rd = await SB.rpc('delete_my_account');
      if (rd.error) throw rd.error;
    } catch (e) {
      state.deleting = false; go.disabled = false;
      accErr('Le compte n’a pas pu être supprimé. Vérifie ta connexion puis réessaie.');
      return;
    }
    try { await SB.auth.signOut({ scope: 'local' }); } catch (e) {}
    store('uandi-nseen-' + uid, null); store('uandi-hidden-' + uid, null);
    setDlg.close();
    setMode('signup');
    setAuthErr('Ton compte a été supprimé. Tu peux en créer un nouveau.');
  }
  $('#accDel').addEventListener('click', function () {
    $('#accConfirm').hidden = false; $('#accDel').hidden = true; accErr('');
    $('#accPass').focus();
  });
  $('#accCancel').addEventListener('click', resetAcc);
  $('#accGo').addEventListener('click', deleteAccount);
  setDlg.addEventListener('close', resetAcc);




/* E'cho — js/app/19-musique.js
   Musique, musiques partagées, partage dans une discussion
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- musique (fichiers de ton appareil) ---------- */
  var viewMusic = $('#viewMusic'), mAu = new Audio(), mDbP = null, mMsgT = null, mClearT = null;
  var M = { tracks: [], cur: -1, shuffle: false, repeat: 'off', loaded: false, seekAt: 0, edit: -1, draft: '', focusEdit: false };
  mAu.preload = 'auto';

  /* ---------- ordre de la file (glisser-déposer) : gardé dans ce navigateur ---------- */
  function mOrderKey() { return 'uandi-music-order-' + state.me; }
  function mOrderSave() {
    try { localStorage.setItem(mOrderKey(), JSON.stringify(M.tracks.map(function (t) { return t.id; }).filter(function (id) { return typeof id === 'number'; }))); } catch (e) {}
  }
  function mOrderApply() {
    var ord = []; try { ord = JSON.parse(localStorage.getItem(mOrderKey()) || '[]') || []; } catch (e) {}
    if (!ord.length) return;
    var pos = {}; ord.forEach(function (id, i) { pos[id] = i; });
    var big = 1e9;
    M.tracks.sort(function (a, b) { return (pos[a.id] === undefined ? big : pos[a.id]) - (pos[b.id] === undefined ? big : pos[b.id]); });
  }
  function mMove(from, to) {
    var n = M.tracks.length;
    if (from === to || from < 0 || to < 0 || from >= n || to >= n) return;
    var curT = M.tracks[M.cur], t = M.tracks.splice(from, 1)[0];
    M.tracks.splice(to, 0, t);
    M.cur = curT ? M.tracks.indexOf(curT) : -1;
    M.edit = -1;
    mOrderSave(); mRender();
  }

  /* ---------- égaliseur graves / aigus (seulement pour les musiques locales) ----------
     Un seul graphe Web Audio sur l'élément audio (partagé avec l'écoute en direct) : musique → graves → aigus → sortie.
     Il n'est créé que si l'égaliseur est réglé (et jamais pendant une musique du cloud, qui pourrait être coupée par le navigateur). */
  var MG = null, EQ = { bass: 0, treble: 0 };
  function eqClamp(v) { v = +v || 0; return Math.max(-12, Math.min(12, Math.round(v))); }
  try { var _eq = JSON.parse(localStorage.getItem('lk_eq') || 'null'); if (_eq) { EQ.bass = eqClamp(_eq.bass); EQ.treble = eqClamp(_eq.treble); } } catch (e) {}
  function mEqOn() { var t = M.tracks[M.cur]; return !!t && !t.remote; }
  function mEqApply() {
    if (!MG) return;
    var on = mEqOn(), b = on ? EQ.bass : 0, tr = on ? EQ.treble : 0, now = MG.ac.currentTime;
    try { MG.bass.gain.setTargetAtTime(b, now, 0.05); MG.tre.gain.setTargetAtTime(tr, now, 0.05); }
    catch (e) { MG.bass.gain.value = b; MG.tre.gain.value = tr; }
  }
  function mGraph() {
    if (MG) return MG;
    var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
    var src = ac.createMediaElementSource(mAu), bass = ac.createBiquadFilter(), tre = ac.createBiquadFilter();
    bass.type = 'lowshelf'; bass.frequency.value = 200;
    tre.type = 'highshelf'; tre.frequency.value = 3500;
    src.connect(bass); bass.connect(tre); tre.connect(ac.destination);
    MG = { ac: ac, src: src, bass: bass, tre: tre };
    mEqApply();
    return MG;
  }
  function mEqSet(b, t) {
    EQ.bass = eqClamp(b); EQ.treble = eqClamp(t);
    try { localStorage.setItem('lk_eq', JSON.stringify(EQ)); } catch (e) {}
    if ((EQ.bass || EQ.treble) && !MG && mEqOn()) { try { mGraph(); } catch (e) {} }
    mEqApply();
    return { bass: EQ.bass, treble: EQ.treble, active: mEqOn(), ready: !!MG };
  }

  /* ---------- vrai fondu enchaîné : la fin du titre qui s'arrête continue sur un 2e lecteur « fantôme »
     qui baisse pendant que le titre suivant (sur le lecteur principal) monte. Durée = réglage « Fondu » de l'écran Musique. ---------- */
  var XF = { g: null, iv: 0, done: '' };
  function xfKill() {
    clearInterval(XF.iv); XF.iv = 0;
    var g = XF.g; XF.g = null;
    if (g) { try { g.pause(); g.removeAttribute('src'); g.load(); } catch (e) {} }
  }
  function xfFade() { var v = 0; try { v = +localStorage.getItem('lk_fade') || 0; } catch (e) {} return v; }
  function xfCheck() {
    var fd = xfFade();
    if (!fd || mAu.paused || M.cur < 0 || M.repeat === 'one' || M.sharing) return;
    try { if (L.role === 'host') return; } catch (e) {}
    var n = M.tracks.length, d = mAu.duration, c = mAu.currentTime;
    if (n < 2 || !isFinite(d) || d < fd * 2 + 2) return;
    var left = d - c;
    if (left > fd || left < 0.3) return;
    if (!M.shuffle && M.cur + 1 >= n && M.repeat !== 'all') return;
    var key = M.cur + '|' + mAu.src;
    if (XF.done === key) return;
    XF.done = key;
    xfKill();
    var g = new Audio(), v0 = mAu.volume;
    g._ghost = true; g.preload = 'auto';
    try { g.src = mAu.currentSrc || mAu.src; g.currentTime = c; g.playbackRate = mAu.playbackRate; g.volume = v0; } catch (e) { return; }
    XF.g = g;
    var p = g.play(); if (p && p.catch) p.catch(function () { if (XF.g === g) xfKill(); });
    var t0 = Date.now(), dur = Math.max(400, left * 1000);
    XF.iv = setInterval(function () {
      var k = (Date.now() - t0) / dur;
      if (k >= 1 || g.ended) { if (XF.g === g) xfKill(); return; }
      try { g.volume = Math.max(0, v0 * (1 - k)); } catch (e) {}
    }, 60);
    try { mAu.volume = 0; } catch (e) {}   /* le titre suivant démarre à 0 puis monte (courbe gérée par le réglage Fondu) */
    mNext(true);
  }

  function mDb() {
    if (mDbP) return mDbP;
    mDbP = new Promise(function (ok, ko) {
      if (!window.indexedDB) { ko(new Error('noidb')); return; }
      var r = indexedDB.open('uandi-music-' + state.me, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { ko(r.error); };
    });
    return mDbP;
  }
  function mTx(mode, fn) {
    return mDb().then(function (db) {
      return new Promise(function (ok, ko) {
        var tx = db.transaction('tracks', mode), res = fn(tx.objectStore('tracks'));
        tx.oncomplete = function () { ok(res ? res.result : undefined); };
        tx.onerror = tx.onabort = function () { ko(tx.error); };
      });
    });
  }
  function mName(n) { return String(n || '').replace(/\.[^.]+$/, ''); }
  function mLabel(t) { return (t && (t.title || mName(t.name))) || ''; }
  function mDecode(b) {
    var enc = b[0], body = b.subarray(1), s = '';
    try {
      if (enc === 1 || enc === 2) {
        var le = enc === 1;
        if (body.length >= 2 && body[0] === 0xFE && body[1] === 0xFF) { le = false; body = body.subarray(2); }
        else if (body.length >= 2 && body[0] === 0xFF && body[1] === 0xFE) { le = true; body = body.subarray(2); }
        s = new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(body);
      } else s = new TextDecoder(enc === 3 ? 'utf-8' : 'iso-8859-1').decode(body);
    } catch (e) { s = ''; }
    return s.replace(/\u0000/g, '').trim();
  }
  function mSync(u8, p) { return ((u8[p] & 0x7f) << 21) | ((u8[p + 1] & 0x7f) << 14) | ((u8[p + 2] & 0x7f) << 7) | (u8[p + 3] & 0x7f); }
  function mReadTitle(file) {
    if (/^audio\/(wav|x-wav|ogg|flac|webm)/.test(file.type || '')) return Promise.resolve('');
    return file.slice(0, 262144).arrayBuffer().then(function (buf) {
      var u8 = new Uint8Array(buf), d = new DataView(buf);
      if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return '';
      var ver = u8[3], end = Math.min(10 + mSync(u8, 6), u8.length), pos = 10, title = '', artist = '';
      if (u8[5] & 0x40) pos += ver === 4 ? mSync(u8, 10) : d.getUint32(10) + 4;
      while (pos + 10 <= end) {
        var id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
        if (!/^[A-Z0-9]{4}$/.test(id)) break;
        var size = ver === 4 ? mSync(u8, pos + 4) : d.getUint32(pos + 4), start = pos + 10;
        if (size <= 0 || start + size > u8.length) break;
        if (id === 'TIT2') title = mDecode(u8.subarray(start, start + size));
        else if (id === 'TPE1') artist = mDecode(u8.subarray(start, start + size));
        pos = start + size;
      }
      return title ? (artist ? artist + ' - ' + title : title) : '';
    }).catch(function () { return ''; });
  }
  function mIsAudio(f) {
    var t = f.type || '';
    if (t.indexOf('audio/') === 0 || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|amr|3gp)$/i.test(f.name || '')) return true;
    /* Android donne souvent un fichier sans extension et sans type : le sélecteur n'a déjà proposé que de l'audio */
    return !/^(image|text)\//.test(t) && !/^application\/(pdf|zip|json|x-zip|msword|vnd)/.test(t);
  }
  function mType(f) {
    if (f.type && f.type.indexOf('audio/') === 0) return Promise.resolve(f.type);
    return f.slice(0, 12).arrayBuffer().then(function (b) {
      var u = new Uint8Array(b), s = String.fromCharCode.apply(null, Array.prototype.slice.call(u));
      if (s.slice(0, 4) === 'OggS') return 'audio/ogg';
      if (s.slice(0, 4) === 'fLaC') return 'audio/flac';
      if (s.slice(0, 4) === 'RIFF' && s.slice(8, 12) === 'WAVE') return 'audio/wav';
      if (s.slice(4, 8) === 'ftyp') return 'audio/mp4';
      if (u[0] === 0x1A && u[1] === 0x45 && u[2] === 0xDF && u[3] === 0xA3) return 'audio/webm';
      return 'audio/mpeg';
    }).catch(function () { return 'audio/mpeg'; });
  }
  function mMsg(t) {
    $('#mMsg').textContent = t || '';
    clearTimeout(mMsgT);
    if (t) mMsgT = setTimeout(function () { $('#mMsg').textContent = ''; }, 4500);
  }
  function mMeta() {
    try {
      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      var t = M.tracks[M.cur];
      navigator.mediaSession.metadata = t ? new MediaMetadata({ title: mLabel(t), artist: 'X\'enify' }) : null;
    } catch (e) {}
  }
  function mRender() {
    var list = $('#mList');
    list.replaceChildren();
    if (!M.tracks.length) {
      var li0 = el('li', 'empty');
      li0.appendChild(el('strong', '', 'Aucune musique'));
      li0.appendChild(document.createTextNode('Ajoute des fichiers audio de ton appareil pour les écouter ici.'));
      list.appendChild(li0);
    }
    var playing = !mAu.paused && M.cur >= 0;
    M.tracks.forEach(function (t, i) {
      var li = el('li'), row = el('div', 'mrow' + (i === M.cur ? ' on' : ''));
      if (i === M.edit) {
        var inp = el('input', 'field mfield');
        inp.type = 'text'; inp.maxLength = 80; inp.value = M.draft;
        inp.setAttribute('aria-label', 'Nom de la musique');
        var ok = el('button', 'ghost mok', 'OK');
        ok.type = 'button'; ok.dataset.i = i;
        row.appendChild(inp); row.appendChild(ok);
      } else {
        var b = el('button', 'mname', (i === M.cur && playing ? '▶ ' : '') + mLabel(t));
        b.type = 'button'; b.dataset.i = i;
        var r = el('button', 'mren', '✎');
        r.type = 'button'; r.dataset.i = i; r.setAttribute('aria-label', 'Renommer ' + mLabel(t));
        var d = el('button', 'mdel', '✕');
        d.type = 'button'; d.dataset.i = i; d.setAttribute('aria-label', 'Retirer ' + mLabel(t));
        var sh = el('button', 'mshare', '↗');
        sh.type = 'button'; sh.dataset.i = i; sh.disabled = !!M.sharing;
        sh.setAttribute('aria-label', 'Partager ' + mLabel(t) + ' dans une discussion');
        row.appendChild(b); try { mCloudBtn(row, t); } catch (e) {} row.appendChild(sh); row.appendChild(r); row.appendChild(d);
      }
      li.appendChild(row); list.appendChild(li);
    });
    if (M.focusEdit) {
      M.focusEdit = false;
      var fi = list.querySelector('.mfield');
      if (fi) { fi.focus(); fi.select(); }
    }
    var cur = M.tracks[M.cur];
    $('#mTitle').textContent = cur ? mLabel(cur) : 'Aucune musique sélectionnée';
    $('#mClear').hidden = !M.tracks.length;
    $('#mShuffle').setAttribute('aria-pressed', M.shuffle ? 'true' : 'false');
    var rp = $('#mRepeat');
    rp.setAttribute('aria-pressed', M.repeat !== 'off' ? 'true' : 'false');
    rp.innerHTML = '<svg class="ln" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>' + (M.repeat === 'one' ? '<b class="r1">1</b>' : '');
    $('#mPlay').classList.toggle('playing', playing);
    $('#mPlay').setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
    $('#mDisc').classList.toggle('playing', playing);
    $('#openMusic').classList.toggle('playing', playing);
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch (e) {}
    try { mShRender(); } catch (e) {}
  }
  function mTime() {
    var d = mAu.duration, c = mAu.currentTime || 0, ok = isFinite(d) && d > 0;
    $('#mCur').textContent = fmtDur(c);
    $('#mDur').textContent = ok ? fmtDur(d) : '0:00';
    if (Date.now() - M.seekAt > 500) $('#mSeek').value = ok ? Math.round(c / d * 1000) : 0;
  }
  function mLoad() {
    if (M.loaded) return M.loading;
    M.loaded = true;
    M.loading = mTx('readonly', function (st) { return st.getAll(); }).then(function (rows) {
      (rows || []).sort(function (a, b) { return a.id - b.id; }).forEach(function (r) {
        M.tracks.push({ id: r.id, name: r.name, title: r.title || '', cid: r.cid || '', url: URL.createObjectURL(r.blob) });
      });
      mOrderApply();
    }).catch(function () {
      mMsg('Ton navigateur ne peut pas garder la liste : elle sera perdue au rechargement.');
    }).then(function () { mRender(); });
    return M.loading;
  }
  async function mAdd(files) {
    files = files.filter(mIsAudio);
    if (!files.length) { mMsg('Choisis des fichiers audio (mp3, m4a, wav…).'); return; }
    var added = 0, lost = false;
    for (var i = 0; i < files.length; i++) {
      var f0 = files[i], id, title = await mReadTitle(f0), ty = await mType(f0);
      var f = f0.type === ty ? f0 : f0.slice(0, f0.size, ty);
      try {
        id = await mTx('readwrite', function (st) { return st.add({ name: f0.name, title: title, type: ty, blob: f }); });
      } catch (e) { lost = true; id = 'tmp' + Date.now() + '-' + i; }
      M.tracks.push({ id: id, name: f0.name, title: title, cid: '', url: URL.createObjectURL(f) });
      added++;
    }
    mMsg(added + (added > 1 ? ' musiques ajoutées.' : ' musique ajoutée.') + (lost ? ' Certaines ne seront pas gardées après un rechargement.' : ''));
    mRender();
  }
  function mPlay(i) {
    if (i < 0 || i >= M.tracks.length) return;
    M.cur = i; XF.done = '';
    var tr = M.tracks[i];
    try {
      if (!MG && (EQ.bass || EQ.treble) && !tr.remote) mGraph();
      if (MG) { if (tr.remote) mAu.crossOrigin = 'anonymous'; else mAu.removeAttribute('crossorigin'); mEqApply(); }
    } catch (e) {}
    mAu.src = tr.url;
    var p = mAu.play();
    if (p && p.catch) p.catch(function () { mMsg('Appuie sur lecture pour démarrer.'); });
    mMeta(); mRender();
  }
  function mToggle() {
    if (M.cur < 0) { if (M.tracks.length) mPlay(0); return; }
    if (mAu.paused) { var p = mAu.play(); if (p && p.catch) p.catch(function () {}); } else mAu.pause();
  }
  function mNext(auto) {
    var n = M.tracks.length;
    if (!n) return;
    if (auto && M.repeat === 'one') { mAu.currentTime = 0; mAu.play(); return; }
    if (auto && M.nextPick) { try { var qn = M.nextPick(); if (typeof qn === 'number' && qn >= 0 && qn < n) { mPlay(qn); return; } } catch (e) {} }
    var nx;
    if (M.shuffle && n > 1) { do { nx = Math.floor(Math.random() * n); } while (nx === M.cur); }
    else {
      nx = M.cur + 1;
      if (nx >= n) {
        if (M.repeat === 'all' || !auto) nx = 0;
        else { mAu.pause(); mAu.currentTime = 0; return; }
      }
    }
    mPlay(nx);
  }
  function mPrev() {
    var n = M.tracks.length;
    if (!n) return;
    if (mAu.currentTime > 3 || M.cur < 0) { mAu.currentTime = 0; return; }
    mPlay(M.cur <= 0 ? n - 1 : M.cur - 1);
  }
  function mRemove(i) {
    var t = M.tracks[i];
    if (!t) return;
    M.edit = -1;
    if (typeof t.id === 'number') mTx('readwrite', function (st) { return st.delete(t.id); }).catch(function () {});
    try { URL.revokeObjectURL(t.url); } catch (e) {}
    M.tracks.splice(i, 1);
    if (M.cur === i) { mAu.pause(); mAu.removeAttribute('src'); mAu.load(); M.cur = -1; mTime(); }
    else if (M.cur > i) M.cur--;
    mMeta(); mRender();
  }
  function resetMClear() {
    clearTimeout(mClearT);
    var b = $('#mClear'); b.classList.remove('sure'); b.textContent = 'Tout retirer';
  }
  function resetMusic() {
    try { mShStop(); } catch (e) {}
    try { mAu.pause(); mAu.removeAttribute('src'); mAu.load(); } catch (e) {}
    M.tracks.forEach(function (t) { try { URL.revokeObjectURL(t.url); } catch (e) {} });
    M.tracks = []; M.cur = -1; M.loaded = false; M.edit = -1;
    if (mDbP) { mDbP.then(function (db) { db.close(); }, function () {}); mDbP = null; }
    mMeta(); mRender(); mTime();
  }
  /* ---------- musiques partagées : sauvegardées sur Cloudinary, liste dans Firestore (collection « sharedMusic ») ---------- */
  var SH = { pub: {}, mine: {}, unsubs: [] };
  /* ===== Supabase : musique partagée (table shared_music) et code de récupération (table recovery) ===== */
  function smDoc(r) { var d = Object.assign({}, r.data || {}); d.uid = r.uid; d.pub = !!r.pub; if (typeof d.ts !== 'number') d.ts = Date.parse(r.created_at) || 0; return d; }
  function smAdd(data) {
    return SB.from('shared_music').insert({ uid: data.uid, pub: !!data.pub, data: data }).select('id').single()
      .then(function (r) { if (r.error) throw r.error; return { id: r.data.id }; });
  }
  function smSetPub(id, want) { return SB.from('shared_music').update({ pub: !!want }).eq('id', id).then(function (r) { if (r.error) throw r.error; }); }
  function smRemove(id) { return SB.from('shared_music').delete().eq('id', id).then(function (r) { if (r.error) throw r.error; }); }
  /* suit une liste (mes musiques, ou les musiques partagées) et la rafraîchit à chaque changement */
  function smWatch(mode, cb, onErr) {
    var alive = true, ch = null;
    function load() {
      var b = SB.from('shared_music').select('*');
      b = mode === 'mine' ? b.eq('uid', state.me) : b.eq('pub', true).order('created_at', { ascending: false }).limit(300);
      b.then(function (r) {
        if (!alive) return;
        if (r.error) { onErr(r.error); return; }
        cb((r.data || []).map(function (x) { return { id: x.id, data: function () { return smDoc(x); } }; }));
      }, function (e) { if (alive) onErr(e); });
    }
    load();
    try {
      ch = SB.channel('sm-' + mode + '-' + Math.random().toString(36).slice(2))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_music' }, load).subscribe();
    } catch (e) {}
    return function () { alive = false; if (ch) { try { SB.removeChannel(ch); } catch (e) {} ch = null; } };
  }

  async function mCloudPush(t, file, title, pub) {
    try {
      if (!state.me || navigator.onLine === false || !file) { mMsg('Connecte-toi à internet pour partager.'); return; }
      if (file.size > 40 * 1048576) { mMsg('Fichier trop gros pour le cloud (40 Mo maximum).'); return; }
      var up = file;
      try {
        var nm0 = String(t.name || title || 'musique');
        if (!/\.[a-z0-9]{2,5}$/i.test(nm0)) nm0 += '.mp3';
        up = new File([file], nm0, { type: (file.type && file.type.indexOf('audio/') === 0) ? file.type : 'audio/mpeg' });
      } catch (e0) { up = file; }
      var url = await cloudUp(up, 'video');
      if (!url) { mMsg('Envoi vers le cloud impossible (' + (CLD_ERR || 'erreur') + ').'); return; }
      var data = { uid: state.me, uname: myName() || '', title: String(title || mName(t.name)).slice(0, 100), name: String(t.name || '').slice(0, 120), url: url, size: file.size, ts: Date.now(), pub: !!pub && musicShared() };
      var ref = await smAdd(data);
      t.cid = ref.id; SH.mine[ref.id] = data;
      if (typeof t.id === 'number') mTx('readwrite', function (st) { var g = st.get(t.id); g.onsuccess = function () { if (g.result) { g.result.cid = ref.id; st.put(g.result); } }; return g; }).catch(function () {});
      mMsg(data.pub ? 'Musique partagée avec tout le monde ☁' : 'Musique sauvegardée sur ton cloud ☁');
    } catch (e) { mMsg('Partage impossible (table Supabase « shared_music » : bloc 7 lancé ?).'); }
  }
  /* bouton ☁ de chaque musique : partager / ne plus partager */
  function mCloudBtn(row, t) {
    if (!musicShared() || t.remote || (t.cid && !SH.mine[t.cid])) return;
    var on = !!(t.cid && SH.mine[t.cid] && SH.mine[t.cid].pub === true);
    var c = el('button', 'mcloud' + (on ? ' on' : ''), '☁'); c.type = 'button';
    c.title = on ? 'Partagée : appuie pour ne plus partager' : 'Appuie pour partager cette musique';
    c.setAttribute('aria-label', c.title); c.setAttribute('aria-pressed', on ? 'true' : 'false');
    c.disabled = !!t.up;
    c.addEventListener('click', function (e) { e.stopPropagation(); mShToggle(t); });
    row.appendChild(c);
  }
  async function mShToggle(t) {
    if (t.up || !state.me) return;
    var cur = t.cid && SH.mine[t.cid], want = !(cur && cur.pub === true);
    if (want && !musicShared()) { mMsg('Ton compte n’a pas accès au partage de musiques.'); return; }
    if (navigator.onLine === false) { mMsg('Connecte-toi à internet pour changer le partage.'); return; }
    if (!t.cid) {
      t.up = true; mRender(); mMsg('Envoi de la musique sur le cloud…');
      try { var r = await fetch(t.url), blob = await r.blob(); await mCloudPush(t, blob, mLabel(t), true); }
      catch (e) { mMsg('Envoi impossible.'); }
      t.up = false; mRender(); return;
    }
    try {
      await smSetPub(t.cid, want);
      if (SH.mine[t.cid]) SH.mine[t.cid].pub = want;
      mMsg(want ? 'Musique partagée avec tout le monde ☁' : 'Musique non partagée (elle reste dans ton cloud).');
    } catch (e) { mMsg('Changement impossible (table Supabase « shared_music » : bloc 7 lancé ?).'); }
    mRender();
  }
  function mShStop() { SH.unsubs.forEach(function (u) { try { u(); } catch (e) {} }); SH.unsubs = []; SH.pub = {}; SH.mine = {}; }
  function mShFail() { SH.err = true; try { mShRender(); } catch (e) {} mShMsg('Chargement impossible : table Supabase « shared_music » (lance le bloc 7).'); }
  function mShStart() {
    mShStop(); SH.err = false;
    if (!state.me) { mShRender(); return; }
    try {
      SH.unsubs.push(smWatch('mine', function (q) { SH.mine = {}; q.forEach(function (d) { SH.mine[d.id] = d.data(); }); mRender(); }, function () { mShFail(); }));
      if (musicShared()) SH.unsubs.push(smWatch('pub', function (q) { SH.pub = {}; q.forEach(function (d) { SH.pub[d.id] = d.data(); }); mRender(); }, function () { mShFail(); }));
    } catch (e) {}
    mShRender();
  }
  window.mShRefresh = function () { if (!viewMusic.hidden) mShStart(); };
  window.addEventListener('online', function () { if (!viewMusic.hidden) mShStart(); });
  window.addEventListener('offline', function () { try { mShRender(); } catch (e) {} });
  function mShMsg(t) { var n = $('#mShMsg'); if (n) { n.textContent = t || ''; setTimeout(function () { if (n.textContent === t) n.textContent = ''; }, 4500); } }
  function mShRender() {
    var box = $('#mShared'), ul = $('#mShList'); if (!box || !ul) return;
    var all = {};
    Object.keys(SH.pub).forEach(function (k) { all[k] = SH.pub[k]; });
    Object.keys(SH.mine).forEach(function (k) { all[k] = SH.mine[k]; });
    var have = {}; M.tracks.forEach(function (t, i) { if (t.cid && !t.remote) have[t.cid] = i; });
    var ids = Object.keys(all).sort(function (a, b) { return (all[b].ts || 0) - (all[a].ts || 0); });
    var online = navigator.onLine !== false;
    if (!online) ids = ids.filter(function (k) { return k in have; });
    var can = musicShared();
    box.hidden = !state.me || (!can && !Object.keys(SH.mine).length);
    $('#mShTitle').textContent = can ? '☁ Musiques partagées' : '☁ Mon cloud';
    ul.replaceChildren();
    if (!ids.length) { var e0 = el('li', 'empty'); e0.appendChild(document.createTextNode(SH.err ? 'Impossible de charger les musiques partagées (règles Firestore « sharedMusic » : autorise la lecture).' : online ? 'Aucune musique partagée pour le moment.' : 'Hors connexion : seules les musiques téléchargées sont disponibles.')); ul.appendChild(e0); return; }
    ids.forEach(function (k) {
      var it = all[k], mine = it.uid === state.me, li = el('li'), row = el('div', 'mrow');
      var b = el('button', 'mname', (mine ? (it.pub === true ? '☁ ' : '🔒 ') : '') + (it.title || it.name || 'Musique') + (mine ? '' : ' · ' + cap(it.uname || '?')));
      b.type = 'button';
      b.addEventListener('click', function () {
        if (k in have) { mPlay(have[k]); return; }
        if (!online) { mShMsg('Hors connexion : télécharge-la d’abord.'); return; }
        var j = -1; M.tracks.forEach(function (t, n) { if (t.remote && t.cid === k) j = n; });
        if (j < 0) { M.tracks.push({ id: 'sh' + k, name: it.name || it.title, title: it.title || '', cid: k, remote: true, url: it.url }); j = M.tracks.length - 1; }
        mPlay(j);
      });
      var dl = el('button', 'mshare', k in have ? '✓' : '⬇'); dl.type = 'button';
      dl.setAttribute('aria-label', k in have ? 'Déjà sur ton appareil' : 'Télécharger sur ton appareil');
      dl.disabled = (k in have) || !online;
      dl.addEventListener('click', function () { mShSave(k, it, dl); });
      row.appendChild(b); row.appendChild(dl);
      if (mine) {
        var rm = el('button', 'mdel', '✕'); rm.type = 'button'; rm.setAttribute('aria-label', 'Retirer du cloud');
        rm.addEventListener('click', function () { if (!confirm('Retirer cette musique du cloud et du partage ? (elle reste sur ton appareil si tu l’as téléchargée)')) return; smRemove(k).catch(function () { mShMsg('Suppression impossible.'); }); });
        row.appendChild(rm);
      }
      li.appendChild(row); ul.appendChild(li);
    });
  }
  /* lien de secours : Cloudinary convertit en mp3 à la volée si l'original n'est pas lisible tel quel */
  function mAltUrl(u) { return (typeof u === 'string' && u.indexOf('/upload/') > 0 && u.indexOf('/upload/f_mp3/') < 0) ? u.replace('/upload/', '/upload/f_mp3/') : ''; }
  async function mGetBlob(u) {
    var list = [u], alt = mAltUrl(u); if (alt) list.push(alt);
    for (var i = 0; i < list.length; i++) {
      try { var r = await fetch(list[i]); if (r.ok) { var b = await r.blob(); if (b && b.size > 0) return b; } } catch (e) {}
    }
    return null;
  }
  async function mShSave(k, it, btn) {
    btn.disabled = true; mShMsg('Téléchargement…');
    try {
      var blob = await mGetBlob(it.url); if (!blob) throw new Error('http');
      var ty = blob.type && blob.type.indexOf('audio/') === 0 ? blob.type : 'audio/mpeg';
      var f = blob.type === ty ? blob : blob.slice(0, blob.size, ty), id;
      try { id = await mTx('readwrite', function (st) { return st.add({ name: it.name || (it.title + '.mp3'), title: it.title || '', type: ty, blob: f, cid: k }); }); } catch (e) { id = 'tmp' + Date.now(); }
      var tr = { id: id, name: it.name || it.title, title: it.title || '', cid: k, url: URL.createObjectURL(f) }, j = -1;
      M.tracks.forEach(function (t, n) { if (t.remote && t.cid === k) j = n; });
      if (j >= 0) M.tracks[j] = tr; else M.tracks.push(tr);
      mShMsg('Téléchargée : disponible sans connexion ✓'); mRender();
    } catch (e) { btn.disabled = false; mShMsg('Téléchargement impossible.'); }
  }
  /* ---------- partager une musique dans une discussion (envoyée comme un vocal) ---------- */
  var SHARE_MAX = 120, SHARE_BYTES = 650000;
  function mStatus(t) { clearTimeout(mMsgT); $('#mMsg').textContent = t || ''; if (M.sharing && M.cancelBtn) $('#mMsg').appendChild(M.cancelBtn); }
  function mShareClose() { var s = document.querySelector('.sheetbg'); if (s) s.remove(); }
  function mShareAsk(i) {
    var t = M.tracks[i];
    if (!t || M.sharing) return;
    mShareClose();
    var hid = hiddenChats();
    var chats = state.chats.slice().sort(function (a, b) { return (b.lastTs || 0) - (a.lastTs || 0); })
      .filter(function (c) { return !(hid[c.id] && (c.lastTs || 0) <= hid[c.id]); });
    var bg = el('div', 'sheetbg'), sheet = el('div', 'sheet');
    var pv = new Audio(), pvStop = null, D = 0, st = 0, en = 0;
    function close() { try { pv.pause(); } catch (e) {} clearInterval(pvStop); mShareClose(); }
    sheet.appendChild(el('h3', '', 'Partager « ' + mLabel(t) + ' »'));
    sheet.appendChild(el('p', '', 'Choisis le passage à envoyer (120 s maximum).'));
    var info = el('p', 'trinfo', 'Chargement…');
    var l1 = el('label', 'trlab', 'Début'), r1 = el('input'), v1 = el('span', 'trval', '0:00');
    var l2 = el('label', 'trlab', 'Fin'), r2 = el('input'), v2 = el('span', 'trval', '0:00');
    [r1, r2].forEach(function (r) { r.type = 'range'; r.min = 0; r.max = 1; r.step = 1; r.value = 0; r.disabled = true; });
    r1.setAttribute('aria-label', 'Début de l’extrait'); r2.setAttribute('aria-label', 'Fin de l’extrait');
    l1.appendChild(r1); l1.appendChild(v1); l2.appendChild(r2); l2.appendChild(v2);
    var prev = el('button', 'ghost', '▶ Écouter l’extrait');
    prev.type = 'button'; prev.disabled = true;
    function paint() {
      v1.textContent = fmtDur(st); v2.textContent = fmtDur(en);
      info.textContent = 'Extrait : ' + fmtDur(st) + ' → ' + fmtDur(en) + ' (' + Math.round(en - st) + ' s)';
    }
    r1.addEventListener('input', function () {
      st = +r1.value;
      if (st > en - 1) en = Math.min(D, st + 1);
      if (en - st > SHARE_MAX) en = st + SHARE_MAX;
      r2.value = en; paint();
    });
    r2.addEventListener('input', function () {
      en = +r2.value;
      if (en < st + 1) st = Math.max(0, en - 1);
      if (en - st > SHARE_MAX) st = en - SHARE_MAX;
      r1.value = st; paint();
    });
    prev.addEventListener('click', function () {
      if (!pv.paused) { pv.pause(); clearInterval(pvStop); prev.textContent = '▶ Écouter l’extrait'; return; }
      if (!mAu.paused) mAu.pause();
      pv.currentTime = st;
      pv.play().catch(function () {});
      prev.textContent = '❚❚ Arrêter';
      clearInterval(pvStop);
      pvStop = setInterval(function () {
        if (pv.paused || pv.currentTime >= en) { pv.pause(); clearInterval(pvStop); prev.textContent = '▶ Écouter l’extrait'; }
      }, 100);
    });
    pv.preload = 'metadata'; pv.src = t.url;
    mDuration(t.url).then(function (d) {
      D = Math.floor(d);
      if (!D) { info.textContent = 'Impossible de lire la durée de ce morceau.'; return; }
      st = 0; en = Math.min(D, SHARE_MAX);
      [r1, r2].forEach(function (r) { r.max = D; r.disabled = false; });
      r1.value = st; r2.value = en; prev.disabled = false; paint();
    });
    sheet.appendChild(info); sheet.appendChild(l1); sheet.appendChild(l2); sheet.appendChild(prev);
    sheet.appendChild(el('p', 'trsend', 'Envoyer à :'));
    if (!chats.length) sheet.appendChild(el('p', '', 'Aucune discussion pour l’instant. Écris d’abord à quelqu’un.'));
    chats.forEach(function (c) {
      if (c.group) return;
      var other = (c.members || []).filter(function (x) { return x !== state.me; })[0];
      var name = nickOf(c, other) || (c.names && c.names[other]) || 'Inconnu';
      var b = el('button', 'pick', cap(name));
      b.type = 'button';
      b.addEventListener('click', function () {
        if (!D) return;
        var s0 = st, e0 = en;
        close();
        mShareGo(t, { id: c.id, other: other, name: name }, s0, e0, D);
      });
      sheet.appendChild(b);
    });
    var cn = el('button', 'ghost', 'Annuler');
    cn.type = 'button'; cn.style.marginTop = '10px';
    cn.addEventListener('click', close);
    sheet.appendChild(cn);
    bg.appendChild(sheet);
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    document.body.appendChild(bg);
  }
  function mBlobToUrl(blob) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result)); };
      fr.onerror = function () { ko(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function mDuration(url) {
    return new Promise(function (ok) {
      var a = new Audio(); a.preload = 'metadata';
      a.onloadedmetadata = function () { ok(isFinite(a.duration) ? a.duration : 0); };
      a.onerror = function () { ok(0); };
      a.src = url;
    });
  }
  function mCapture(t, start, end) {
    return new Promise(function (ok, ko) {
      var AC = window.AudioContext || window.webkitAudioContext, mime = pickMime();
      if (!AC || mime === null) { ko(new Error('unsupported')); return; }
      var ac = new AC(), au = new Audio(), chunks = [], t0 = 0, timer = null, done = false;
      var opts = { audioBitsPerSecond: 32000 };
      if (mime) opts.mimeType = mime;
      var mr;
      try {
        au.preload = 'auto';
        au.src = t.url;
        var src = ac.createMediaElementSource(au), dest = ac.createMediaStreamDestination();
        var quiet = ac.createGain(); quiet.gain.value = 0;
        src.connect(dest);
        src.connect(quiet); quiet.connect(ac.destination);
        mr = new MediaRecorder(dest.stream, opts);
      } catch (e) { try { ac.close(); } catch (x) {} ko(e); return; }
      var finish = function (cancel) {
        if (done) return; done = true;
        var why = cancel instanceof Error ? cancel : new Error('cancel');
        clearInterval(timer);
        try { au.pause(); } catch (e) {}
        M.shareStop = null;
        mr.onstop = function () {
          try { ac.close(); } catch (e) {}
          if (cancel) { ko(why); return; }
          ok({ blob: new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), dur: (Date.now() - t0) / 1000 });
        };
        try { if (mr.state !== 'inactive') mr.stop(); else mr.onstop(); } catch (e) { mr.onstop(); }
      };
      M.shareStop = finish;
      mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      au.onended = function () { finish(false); };
      au.onerror = function () { finish(new Error('media:' + (au.error ? au.error.code : '?'))); };
      var seek = function () {
        if (!start) return Promise.resolve();
        return new Promise(function (res) {
          var go = function () { au.addEventListener('seeked', function () { res(); }, { once: true }); au.currentTime = start; };
          if (au.readyState >= 1) go(); else au.addEventListener('loadedmetadata', go, { once: true });
        });
      };
      ac.resume().then(seek).then(function () { return au.play(); }).then(function () {
        t0 = Date.now(); mr.start(1000);
        timer = setInterval(function () {
          var s = au.currentTime - start;
          mStatus('Préparation du partage… ' + fmtDur(Math.max(0, s)) + ' / ' + fmtDur(end - start) + ' ');
          if (au.currentTime >= end || s >= SHARE_MAX) finish(false);
        }, 150);
      }).catch(function (e) { finish(new Error('play:' + ((e && e.name) || 'erreur'))); });
    });
  }
  async function mShareSend(chat, audio, dur, title) {
    var label = '🎵 ' + title.slice(0, 100), orig = audio;
    var upa = await mediaUp(audio); if (upa) audio = upa;
    async function put(val) {
      await postMsg(chat, { text: label, audio: val, dur: Math.round(dur), music: title.slice(0, 100) });
    }
    try { await put(audio); }
    catch (e) { if (audio !== orig) await put(orig); else throw e; }
  }
  async function mShareGo(t, chat, start, end, total) {
    if (M.sharing) return;
    M.sharing = true; mRender();
    var cancelBtn = el('button', 'ghost', 'Annuler');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', function () { if (M.shareStop) M.shareStop(true); else M.shareAbort = true; });
    M.cancelBtn = cancelBtn;
    var failMsg = '';
    try {
      mStatus('Préparation du partage…');
      var blob = null, dur = 0, raw = null;
      var whole = !start && end >= total;
      if (whole) { try { raw = await (await fetch(t.url)).blob(); } catch (e) {} }
      if (raw && raw.size <= SHARE_BYTES) { blob = raw; dur = await mDuration(t.url); }
      else {
        if (!mAu.paused) mAu.pause();
        var r = await mCapture(t, start || 0, end);
        blob = r.blob; dur = r.dur;
      }
      if (M.shareAbort) throw new Error('cancel');
      if (!blob || !blob.size) throw new Error('empty');
      if (blob.size > SHARE_BYTES) throw new Error('big');
      var data = await mBlobToUrl(blob);
      if (data.length > 900000) throw new Error('big');
      await mShareSend(chat, data, dur || 1, mLabel(t));
      mStatus('Envoyée à ' + cap(chat.name) + ' ✓');
      mMsgT = setTimeout(function () { $('#mMsg').textContent = ''; }, 4500);
    } catch (e) {
      var em = (e && e.message) || '';
      failMsg = em === 'cancel' ? 'Partage annulé.'
        : em === 'unsupported' ? 'Ton navigateur ne permet pas ce partage.'
        : em.indexOf('play:') === 0 ? 'Lecture bloquée par le navigateur (' + em.slice(5) + '). Touche d’abord ▶ sur un morceau puis réessaie.'
        : em.indexOf('media:') === 0 ? 'Ce fichier audio ne peut pas être lu pour le partage (code ' + em.slice(6) + ').'
        : 'Partage impossible. Vérifie ta connexion (ou les règles Firestore) et réessaie.';
    }
    M.sharing = false; M.shareAbort = false; M.shareStop = null; M.cancelBtn = null; mRender();
    if (failMsg) mMsg(failMsg);
  }



/* E'cho — js/app/20-ecoute-ensemble.js
   Écouter ensemble en direct (WebRTC)
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- écouter ensemble en direct (WebRTC, signalisation via Firestore) ---------- */
  /* Serveurs relais (TURN) : nécessaires quand les deux téléphones sont en 4G/5G ou derrière un réseau strict.
     Les identifiants « openrelayproject » sont un service public gratuit (limité). Pour un direct fiable,
     crée un compte gratuit sur metered.ca (Open Relay) puis colle tes propres serveurs dans LIVE_TURN_EXTRA, par ex. :
     { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: 'TON_USER', credential: 'TON_MOT_DE_PASSE' } */
  var LIVE_TURN_EXTRA = [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp', 'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp'],
      username: '945203f5cdfa5f8655fe4730', credential: 'xvoDPMhJQP9TnTML' }
  ];
  var ICE = {
    iceServers: LIVE_TURN_EXTRA.concat([
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'],
        username: 'openrelayproject', credential: 'openrelayproject' }
    ]),
    iceCandidatePoolSize: 2
  };
  var L = { role: null, chat: null, sid: '', jid: '', pc: null, rem: null, g: null, sigUnsub: null, beatT: null, gUnsub: null, gT: null, joinT: null,
            watch: null, watchT: null, sess: null, pend: [], title: '', state: 'wait', needTap: false, gAt: 0, peers: {}, n: 0, hname: '' };
  var LIVE_MAX = 8; /* auditeurs simultanés max par écoute de groupe (le téléphone de l’hôte envoie le son à chacun) */
  function liveRef(id) { return fs.collection('chats').doc(id).collection('live').doc('session'); }
  function liveCol(id) { return fs.collection('chats').doc(id).collection('liveSig'); }
  function liveId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function liveFresh(s) { return !!(s && s.host && Math.abs(Date.now() - (s.beat || 0)) < 120000); }
  function liveSdp(sdp) {
    var m = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp);
    if (!m) return sdp;
    var re = new RegExp('a=fmtp:' + m[1] + ' ([^\\r\\n]*)');
    return sdp.replace(re, function (all, rest) {
      return /stereo=1/.test(rest) ? all : 'a=fmtp:' + m[1] + ' ' + rest + ';stereo=1;sprop-stereo=1;maxaveragebitrate=128000';
    });
  }
  function liveGraph() {
    if (L.g) return L.g;
    var g = mGraph();
    L.g = { ac: g.ac, src: g.src, dest: g.ac.createMediaStreamDestination() };
    return L.g;
  }
  mAu.addEventListener('play', function () {
    if (L.g && L.g.ac.state === 'suspended') L.g.ac.resume().catch(function () {});
    if (L.role === 'host') liveBeat();
  });
  function liveName() { return L.chat ? cap(L.role === 'guest' && L.chat.group && L.hname ? L.hname : L.chat.name) : ''; }
  function liveHostName(chat, sess) {
    if (!chat || !chat.group) return cap(chat && chat.name);
    var gc = chatOf(chat.id), u = sess && sess.host;
    return cap(nickOf(gc, u) || (gc && gc.names && gc.names[u]) || 'Un membre');
  }
  function liveCount() { return Object.keys(L.peers).filter(function (k) { return L.peers[k].ok; }).length; }
  var liveClamp = null;
  function liveBar() {
    var b = $('#livebar');
    if (!L.role) { b.hidden = true; b.replaceChildren(); return; }
    var host = L.role === 'host', txt;
    if (host && L.chat && L.chat.group) {
      var gn = liveCount();
      txt = gn ? '🎧 ' + gn + (gn > 1 ? ' auditeurs' : ' auditeur') + (L.title ? ' · ' + L.title : '') : 'En attente d’auditeurs dans le groupe…';
    }
    else if (L.state === 'live') txt = 'Avec ' + liveName() + (L.title ? ' · ' + L.title : '');
    else if (L.state === 'lost') txt = 'Connexion instable…';
    else if (host && L.state === 'wait') txt = 'En attente de ' + liveName() + '…';
    else txt = 'Connexion…';
    b.replaceChildren();
    var grip = el('span', 'lbgrip', '🎧');
    grip.setAttribute('aria-label', txt + ' (touche pour afficher le titre, glisse pour déplacer)');
    b.appendChild(grip);
    if (L.exp) b.appendChild(el('span', 'lbtxt', txt));
    var mk = function (label, aria, fn) {
      var x = el('button', '', label); x.type = 'button'; x.setAttribute('aria-label', aria); x.addEventListener('click', fn); b.appendChild(x);
    };
    if (host) {
      mk('⏯', 'Lecture / pause', function () { mToggle(); });
      mk('⏭', 'Morceau suivant', function () { mNext(false); });
    } else if (L.needTap) mk('🔊', 'Activer le son', function () { if (L.rem) L.rem.play().then(function () { L.needTap = false; liveBar(); }).catch(function () {}); });
    mk('✕', host ? 'Arrêter' : 'Quitter', function () { liveStop(); });
    b.hidden = false;
    if (liveClamp) liveClamp();
  }
  /* la petite barre se déplace partout sur l'écran : on la tient par 🎧 (ou le titre) et on glisse ; un simple appui affiche/masque le titre */
  (function () {
    var bar = $('#livebar'), drag = null;
    function clamp() {
      if (bar.hidden || (!bar.style.left && !bar.style.top)) return;
      var r = bar.getBoundingClientRect();
      bar.style.left = Math.max(4, Math.min(window.innerWidth - r.width - 4, r.left)) + 'px';
      bar.style.top = Math.max(4, Math.min(window.innerHeight - r.height - 4, r.top)) + 'px';
    }
    liveClamp = clamp;
    window.addEventListener('resize', clamp);
    bar.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('button')) return;
      var r = bar.getBoundingClientRect();
      drag = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top, moved: false };
      try { bar.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    bar.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
      drag.moved = true;
      var w = bar.offsetWidth, h = bar.offsetHeight;
      bar.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, drag.left + dx)) + 'px';
      bar.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, drag.top + dy)) + 'px';
    });
    bar.addEventListener('pointerup', function () {
      var d = drag; drag = null;
      if (d && !d.moved) { L.exp = !L.exp; liveBar(); }
    });
    bar.addEventListener('pointercancel', function () { drag = null; });
  })();
  function liveBanner() {
    var b = $('#liveBanner'), s = L.sess, chat = state.chat;
    if (!b) return;
    var ok = !!(chat && s && s.host !== state.me && !L.role && liveFresh(s));
    b.hidden = !ok;
    if (!ok) { b.replaceChildren(); return; }
    b.replaceChildren();
    b.appendChild(el('span', '', '🎧 ' + liveHostName(chat, s) + ' écoute « ' + (s.title || 'une musique') + ' »' + (chat.group ? ' avec le groupe' : '')));
    var j = el('button', 'ghost', 'Rejoindre'); j.type = 'button';
    j.addEventListener('click', function () { liveJoin({ id: chat.id, other: chat.other, name: chat.name, group: !!chat.group }, s); });
    b.appendChild(j);
  }
  function liveWatch(chat) {
    liveUnwatch();
    if (!chat) return;
    L.watch = liveRef(chat.id).onSnapshot(function (d) { L.sess = d.exists ? d.data() : null; liveBanner(); }, function () {});
    L.watchT = setInterval(liveBanner, 10000);
  }
  function liveUnwatch() {
    if (L.watch) { try { L.watch(); } catch (e) {} }
    L.watch = null; clearInterval(L.watchT); L.sess = null;
    liveBanner();
  }
  function liveStatus(st) { L.state = st; liveBar(); }
  function liveBeat() {
    if (L.role !== 'host' || !L.chat) return;
    var t = M.tracks[M.cur];
    liveRef(L.chat.id).update({ beat: Date.now(), title: t ? mLabel(t) : '' }).catch(function () {});
  }
  function liveSig(kind, extra) {
    if (!L.chat) return;
    var d = { sid: L.sid, jid: L.jid, from: state.me, kind: kind, ts: Date.now() };
    for (var k in extra) d[k] = extra[k];
    if (L.role === 'host' && !d.jid) d.jid = '';
    liveCol(L.chat.id).add(d).catch(function () {});
  }
  function liveIce(c) {
    if (L.pc && L.pc.remoteDescription) L.pc.addIceCandidate(c).catch(function () {}); else L.pend.push(c);
  }
  function liveFlush() {
    var pc = L.pc;
    L.pend.splice(0).forEach(function (c) { if (pc) pc.addIceCandidate(c).catch(function () {}); });
  }
  function liveNewPc() {
    if (L.pc) { try { L.pc.close(); } catch (e) {} }
    var pc = new RTCPeerConnection(ICE);
    L.pc = pc;
    L.cand = { host: 0, srflx: 0, relay: 0 };
    pc.onicecandidate = function (e) {
      if (!e.candidate || L.pc !== pc) return;
      var m = / typ (host|srflx|relay)/.exec(e.candidate.candidate || '');
      if (m) L.cand[m[1]]++;
      liveSig('ice', { data: JSON.stringify(e.candidate) });
    };
    pc.onconnectionstatechange = function () {
      if (L.pc !== pc) return;
      var s = pc.connectionState;
      if (s === 'connected') { clearTimeout(L.joinT); liveStatus('live'); }
      else if (s === 'disconnected') liveStatus('lost');
      else if (s === 'failed') {
        var why = L.cand && !L.cand.relay ? 'Serveur relais injoignable : ajoute tes identifiants TURN (metered.ca).' : 'La connexion directe a échoué (réseau).';
        if (L.role === 'guest') {
          if ((L.retry || 0) < 1) {
            L.retry = (L.retry || 0) + 1;
            try { pc.close(); } catch (e) {}
            L.pc = null; L.jid = liveId(); L.pend = [];
            liveStatus('connecting');
            clearTimeout(L.joinT);
            L.joinT = setTimeout(function () { if (L.role === 'guest' && L.state !== 'live') liveStop(why); }, 25000);
            liveSig('join');
          } else liveStop(why);
        } else { try { pc.close(); } catch (e) {} L.pc = null; liveStatus('wait'); }
      }
    };
    return pc;
  }
  /* hôte : une connexion WebRTC par auditeur (clé = jid de l’auditeur) */
  function liveDropPeer(jid) {
    var pr = L.peers[jid];
    if (!pr) return;
    delete L.peers[jid];
    try { pr.pc.close(); } catch (e) {}
    if (L.role !== 'host') return;
    if (L.chat && L.chat.group) liveBar();
    else if (!Object.keys(L.peers).length) liveStatus('wait');
  }
  function liveHostPeer(jid, from) {
    var pc = new RTCPeerConnection(ICE), pr = { pc: pc, pend: [], from: from, ok: false, cand: { host: 0, srflx: 0, relay: 0 } };
    L.peers[jid] = pr;
    pc.onicecandidate = function (e) {
      if (!e.candidate || L.peers[jid] !== pr) return;
      var m = / typ (host|srflx|relay)/.exec(e.candidate.candidate || '');
      if (m) pr.cand[m[1]]++;
      liveSig('ice', { data: JSON.stringify(e.candidate), jid: jid });
    };
    pc.onconnectionstatechange = function () {
      if (L.peers[jid] !== pr) return;
      var st = pc.connectionState;
      if (st === 'connected') { pr.ok = true; clearTimeout(pr.t); if (L.chat && L.chat.group) liveBar(); else liveStatus('live'); }
      else if (st === 'disconnected') { pr.ok = false; if (L.chat && L.chat.group) liveBar(); else liveStatus('lost'); }
      else if (st === 'failed' || st === 'closed') liveDropPeer(jid);
    };
    /* un auditeur qui n’aboutit jamais ne doit pas rester dans la liste */
    pr.t = setTimeout(function () { if (L.peers[jid] === pr && !pr.ok) liveDropPeer(jid); }, 45000);
    return pr;
  }
  async function liveSignal(d) {
    try {
      if (L.role === 'host') {
        if (d.kind === 'join') {
          var old = Object.keys(L.peers).filter(function (k) { return L.peers[k].from === d.from; });
          old.forEach(liveDropPeer);
          var isGroup = !!(L.chat && L.chat.group);
          if (isGroup && Object.keys(L.peers).length >= LIVE_MAX) { liveSig('full', { jid: d.jid }); return; }
          var pr = liveHostPeer(d.jid, d.from), pc = pr.pc;
          if (!isGroup) liveStatus('connecting');
          var g = L.g;
          g.dest.stream.getAudioTracks().forEach(function (tr) { pc.addTrack(tr, g.dest.stream); });
          var off = await pc.createOffer();
          off.sdp = liveSdp(off.sdp);
          await pc.setLocalDescription(off);
          liveSig('offer', { data: JSON.stringify({ type: off.type, sdp: off.sdp }), jid: d.jid });
        } else if (d.kind === 'leave') {
          liveDropPeer(d.jid);
        } else if (L.peers[d.jid]) {
          var pe = L.peers[d.jid];
          if (d.kind === 'answer') {
            await pe.pc.setRemoteDescription(JSON.parse(d.data));
            pe.pend.splice(0).forEach(function (c) { pe.pc.addIceCandidate(c).catch(function () {}); });
          } else if (d.kind === 'ice') {
            var cd = JSON.parse(d.data);
            if (pe.pc.remoteDescription) pe.pc.addIceCandidate(cd).catch(function () {}); else pe.pend.push(cd);
          }
        }
      } else if (L.role === 'guest' && d.jid === L.jid) {
        if (d.kind === 'full') { liveStop('Le salon d’écoute est complet (' + LIVE_MAX + ' personnes max).'); return; }
        if (d.kind === 'offer') {
          clearTimeout(L.joinT);
          var pc2 = liveNewPc();
          pc2.ontrack = function (ev) {
            if (!L.rem) { L.rem = new Audio(); L.rem.autoplay = true; }
            L.rem.srcObject = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
            L.rem.play().then(function () { L.needTap = false; liveBar(); }).catch(function () { L.needTap = true; liveBar(); });
          };
          await pc2.setRemoteDescription(JSON.parse(d.data));
          liveFlush();
          var ans = await pc2.createAnswer();
          ans.sdp = liveSdp(ans.sdp);
          await pc2.setLocalDescription(ans);
          liveSig('answer', { data: JSON.stringify({ type: ans.type, sdp: ans.sdp }) });
        } else if (d.kind === 'ice') liveIce(JSON.parse(d.data));
      }
    } catch (e) {}
  }
  function liveListenSig() {
    var seen = {};
    L.sigUnsub = liveCol(L.chat.id).where('sid', '==', L.sid).onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        if (ch.type !== 'added' || seen[ch.doc.id]) return;
        seen[ch.doc.id] = 1;
        var d = ch.doc.data();
        if (d && d.from !== state.me) liveSignal(d);
      });
    }, function () { liveStop('Le direct n’a pas pu démarrer (règles Firestore ?).'); });
  }
  async function liveNotice(chat, text) {
    try { await postMsg(chat, { text: text }); } catch (e) {}
  }
  async function liveStart(chat, i) {
    var t = M.tracks[i];
    if (!t || L.role) return;
    if (!window.RTCPeerConnection || !(window.AudioContext || window.webkitAudioContext)) { showErr('Ton navigateur ne permet pas l’écoute en direct.'); return; }
    var g;
    try { g = liveGraph(); g.ac.resume().catch(function () {}); g.src.connect(g.dest); }
    catch (e) { showErr('Ton navigateur ne permet pas l’écoute en direct.'); return; }
    if (chat.group && L.sess && L.sess.host !== state.me && liveFresh(L.sess)) { showErr('Une écoute est déjà en cours dans ce groupe : rejoins-la.'); return; }
    L.role = 'host'; L.chat = chat; L.sid = liveId(); L.jid = ''; L.title = mLabel(t); L.pend = []; L.peers = {};
    liveStatus('wait');
    mPlay(i);
    await liveNotice(chat, chat.group ? '🎧 J’écoute « ' + mLabel(t) + ' » : rejoignez-moi avec le bandeau 🎧 (max ' + LIVE_MAX + ' personnes).' : '🎧 Écoutons « ' + mLabel(t) + ' » ensemble : appuie sur 🎧 pour me rejoindre.');
    try {
      await liveRef(chat.id).set({ host: state.me, sid: L.sid, title: mLabel(t), beat: Date.now(), ts: Date.now() });
    } catch (e) {
      liveStop();
      showErr('Direct impossible (connexion ou règles Firestore).');
      return;
    }
    L.beatT = setInterval(liveBeat, 15000);
    liveListenSig();
  }
  function liveJoin(chat, sess) {
    if (L.role) return;
    if (!window.RTCPeerConnection) { showErr('Ton navigateur ne permet pas l’écoute en direct.'); return; }
    L.retry = 0;
    L.role = 'guest'; L.chat = chat; L.hname = chat.group ? liveHostName(chat, sess) : ''; L.sid = sess.sid; L.jid = liveId(); L.title = sess.title || ''; L.pend = []; L.needTap = false;
    L.rem = new Audio(); L.rem.autoplay = true;
    liveStatus('connecting');
    liveListenSig();
    L.gAt = Date.now();
    L.gUnsub = liveRef(chat.id).onSnapshot(function (d) {
      var v = d.exists ? d.data() : null;
      if (!v || v.sid !== L.sid) { liveStop('L’écoute est terminée.'); return; }
      L.gAt = Date.now();
      if ((v.title || '') !== L.title) { L.title = v.title || ''; liveBar(); }
    }, function () {});
    L.gT = setInterval(function () { if (Date.now() - L.gAt > 60000) liveStop('L’écoute est terminée.'); }, 10000);
    L.joinT = setTimeout(function () { if (L.role === 'guest' && L.state !== 'live') liveStop(L.cand && !L.cand.relay ? 'Serveur relais injoignable : ajoute tes identifiants TURN (metered.ca).' : 'Impossible de te connecter (réseau ou la personne est partie).'); }, 25000);
    liveSig('join');
  }
  function liveStop(msg) {
    var chat = L.chat, role = L.role, sid = L.sid;
    if (role === 'guest') liveSig('leave');
    Object.keys(L.peers).forEach(function (k) { try { L.peers[k].pc.close(); } catch (e) {} clearTimeout(L.peers[k].t); });
    L.peers = {}; L.hname = '';
    clearInterval(L.beatT); clearInterval(L.gT); clearTimeout(L.joinT);
    if (L.sigUnsub) { try { L.sigUnsub(); } catch (e) {} }
    if (L.gUnsub) { try { L.gUnsub(); } catch (e) {} }
    if (L.pc) { try { L.pc.close(); } catch (e) {} }
    if (L.rem) { try { L.rem.pause(); L.rem.srcObject = null; } catch (e) {} }
    if (L.g) { try { L.g.src.disconnect(L.g.dest); } catch (e) {} }
    L.role = null; L.chat = null; L.sid = ''; L.jid = ''; L.pc = null; L.rem = null; L.sigUnsub = null; L.gUnsub = null;
    L.beatT = null; L.gT = null; L.joinT = null; L.pend = []; L.title = ''; L.needTap = false; L.state = 'wait';
    if (role === 'host' && chat) {
      liveRef(chat.id).delete().catch(function () {});
      liveCol(chat.id).where('sid', '==', sid).get().then(function (sn) {
        var b = fs.batch(); sn.forEach(function (d) { b.delete(d.ref); }); return b.commit();
      }).catch(function () {});
    }
    liveBar();
    if (msg) {
      var bar = $('#livebar');
      bar.replaceChildren(el('span', 'lbtxt', '🎧 ' + msg));
      bar.hidden = false;
      setTimeout(function () { if (!L.role) bar.hidden = true; }, 4500);
    }
  }
  function liveOpen() {
    var chat = state.chat;
    if (!chat) return;
    mShareClose();
    var bg = el('div', 'sheetbg'), sheet = el('div', 'sheet'), nm = cap(chat.name), s = L.sess, hn = liveHostName(chat, s);
    var stopB = function (label) {
      var b = el('button', 'ghost', label); b.type = 'button'; b.style.marginTop = '10px';
      b.addEventListener('click', function () { mShareClose(); liveStop(); });
      return b;
    };
    if (L.role && L.chat.id !== chat.id) {
      sheet.appendChild(el('h3', '', 'Écoute en cours avec ' + liveName()));
      sheet.appendChild(stopB(L.role === 'host' ? 'Arrêter' : 'Quitter'));
    } else if (L.role === 'guest') {
      sheet.appendChild(el('h3', '', 'Tu écoutes avec ' + (chat.group ? hn : nm)));
      if (L.title) sheet.appendChild(el('p', '', '« ' + L.title + ' »'));
      sheet.appendChild(stopB('Quitter'));
    } else if (!L.role && s && s.host !== state.me && liveFresh(s)) {
      sheet.appendChild(el('h3', '', hn + ' écoute « ' + (s.title || 'une musique') + ' »'));
      var jb = el('button', 'pick', '🎧 Rejoindre'); jb.type = 'button';
      jb.addEventListener('click', function () { mShareClose(); liveJoin({ id: chat.id, other: chat.other, name: chat.name, group: !!chat.group }, s); });
      sheet.appendChild(jb);
    } else {
      sheet.appendChild(el('h3', '', L.role === 'host' ? 'Changer de morceau' : 'Écouter ensemble avec ' + (chat.group ? 'le groupe' : nm)));
      sheet.appendChild(el('p', '', chat.group ? 'Choisis un morceau de ta bibliothèque : les membres du groupe pourront l’écouter en même temps que toi (' + LIVE_MAX + ' max).' : 'Choisis un morceau de ta bibliothèque : ' + nm + ' l’entendra en même temps que toi.'));
      var box = el('div');
      sheet.appendChild(box);
      Promise.resolve(mLoad()).then(function () {
        if (!M.tracks.length) { box.appendChild(el('p', '', 'Ajoute d’abord des musiques dans ♪ Musique.')); return; }
        M.tracks.forEach(function (t, i) {
          var b = el('button', 'pick', mLabel(t)); b.type = 'button';
          b.addEventListener('click', function () {
            mShareClose();
            if (L.role === 'host') mPlay(i); else liveStart({ id: chat.id, other: chat.other, name: chat.name, group: !!chat.group }, i);
          });
          box.appendChild(b);
        });
      });
      if (L.role === 'host') sheet.appendChild(stopB('Arrêter l’écoute'));
    }
    var cn = el('button', 'ghost', 'Fermer');
    cn.type = 'button'; cn.style.marginTop = '10px';
    cn.addEventListener('click', mShareClose);
    sheet.appendChild(cn);
    bg.appendChild(sheet);
    bg.addEventListener('click', function (e) { if (e.target === bg) mShareClose(); });
    document.body.appendChild(bg);
  }
  window.uandiMusic = { load: function () { return Promise.resolve(mLoad()); }, tracks: function () { return M.tracks; }, label: mLabel, add: mAdd,
    pause: function () { if (L.role !== 'host') { try { mAu.pause(); } catch (e) {} } },
    move: mMove, audio: function () { return mAu; },
    eq: function () { return { bass: EQ.bass, treble: EQ.treble, active: mEqOn(), ready: !!MG }; }, setEq: mEqSet,
    setNextPick: function (f) { M.nextPick = f; } };
  $('#liveBtn').addEventListener('click', liveOpen);
  window.addEventListener('pagehide', function () { if (L.role === 'host' && L.chat) { try { liveRef(L.chat.id).delete(); } catch (e) {} } });




/* E'cho — js/app/21-appel-vocal.js
   Appel vocal 1-à-1 (WebRTC)
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- appel vocal 1-à-1 (WebRTC, signalisation via Firestore) ---------- */
  var C = { role: null, chat: null, sid: '', pc: null, stream: null, rem: null, pend: [], sigUnsub: null, st: '', t0: 0,
            tickT: null, ringT: null, discT: null, tone: null, toneI: null, muted: false, ui: null, seen: {}, needTap: false,
            dbg: { off: 0, ans: 0, ice: 0, h: 0, s: 0, r: 0, ic: '-' } };
  function callWhy(base) { return base + (C.dbg.r === 0 ? ' · aucun relais TURN joignable (identifiants à renouveler)' : ''); }
  var CALL_PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1z"/></svg>';
  var CALL_MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 003-3V5a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.92V21h2v-3.08A7 7 0 0019 11z"/></svg>';
  var CALL_MUTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11h-2c0 .9-.2 1.7-.55 2.4l1.46 1.46A6.9 6.9 0 0019 11zm-4 .17V5a3 3 0 00-5.9-.75L15 11.17zM4.27 3L3 4.27l6 6V11a3 3 0 004.1 2.8l1.7 1.7A5 5 0 017 11H5a7 7 0 006 6.92V21h2v-3.08c.9-.12 1.75-.43 2.5-.87L19.73 21 21 19.73 4.27 3z"/></svg>';

  var CALL_SPK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
  var CALL_EAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9v6h4l5 5V4l-5 5H7z"/></svg>';
  var EAR_RE = /earpiece|ear piece|receiver|handset|écouteur|ecouteur|combiné|combine/i, SPK_RE = /speaker|haut-parleur|haut parleur|loud/i;
  function callSpk() { return store('uandi-spk') === '1'; }
  function callRouteNote() {}
  /* sortie du son de l'appel : écouteur (discret) ou haut-parleur */
  function callRoute() {
    var a = C.rem, spk = !!C.speaker;
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
    if (!a) return;
    if (!a.setSinkId || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      callRouteNote('Ton navigateur ne permet pas de choisir la sortie audio : le son suit le réglage du téléphone.');
      return;
    }
    navigator.mediaDevices.enumerateDevices().then(function (ds) {
      var outs = ds.filter(function (d) { return d.kind === 'audiooutput'; }), pick = null, i;
      for (i = 0; i < outs.length && !pick; i++) {
        var lb = outs[i].label || '';
        if (spk ? SPK_RE.test(lb) : (EAR_RE.test(lb) && !SPK_RE.test(lb))) pick = outs[i];
      }
      if (!pick && !spk) for (i = 0; i < outs.length && !pick; i++) if (outs[i].deviceId === 'communications') pick = outs[i];
      if (!pick && spk) for (i = 0; i < outs.length && !pick; i++) if (outs[i].deviceId === 'default') pick = outs[i];
      if (!pick) {
        callRouteNote(spk ? '' : 'Écouteur introuvable sur cet appareil : branche un casque ou baisse le volume pour plus de discrétion.');
        return a.setSinkId('').catch(function () {});
      }
      return a.setSinkId(pick.deviceId).then(function () { callRouteNote(''); });
    }).catch(function () { callRouteNote('Impossible de changer la sortie audio sur ce navigateur.'); });
  }
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', function () { if (C.role && C.rem) callRoute(); });

  function callRef(id) { return fs.collection('chats').doc(id); }
  function callDur(sec) {
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function callDurText(sec) {
    var m = Math.floor(sec / 60), r = sec % 60;
    return m ? m + ' min' + (r ? ' ' + r + ' s' : '') : r + ' s';
  }
  /* sonnerie (générée, aucun fichier) */
  function ringStop() {
    clearInterval(C.toneI); C.toneI = null;
    if (C.tone) { try { C.tone.close(); } catch (e) {} C.tone = null; }
    if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
  }
  function ringStart(incoming) {
    ringStop();
    try {
      var AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
      C.tone = ac;
      var beep = function () {
        try {
          if (ac.state === 'suspended') ac.resume().catch(function () {});
          var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
          o.type = 'sine'; o.frequency.value = incoming ? 880 : 425;
          o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(incoming ? 0.3 : 0.15, t + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
          o.start(t); o.stop(t + 0.75);
          if (incoming && navigator.vibrate) navigator.vibrate([350, 150, 350]);
        } catch (e) {}
      };
      beep(); C.toneI = setInterval(beep, 2200);
    } catch (e) {}
  }
  /* notification média « Appel vocal » : aide le navigateur à garder l'appel actif écran éteint */
  function callMedia(on) {
    try {
      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      if (on) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: C.video ? 'Appel vidéo' : 'Appel vocal', artist: cap(C.chat.name) });
        navigator.mediaSession.playbackState = 'playing';
        try { navigator.mediaSession.setActionHandler('hangup', function () { callFinish('hang'); }); } catch (e) {}
      } else {
        try { navigator.mediaSession.setActionHandler('hangup', null); } catch (e) {}
        mMeta();
        navigator.mediaSession.playbackState = mAu.paused ? 'paused' : 'playing';
      }
    } catch (e) {}
  }
  function callWake(on) {
    try {
      if (!on) { if (C.wake) { C.wake.release(); C.wake = null; } return; }
      if (navigator.wakeLock && !C.wake) navigator.wakeLock.request('screen').then(function (w) { C.wake = w; w.addEventListener('release', function () { if (C.wake === w) C.wake = null; }); }).catch(function () {});
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && C.role && C.st === 'live') callWake(true); });
  /* messages d'appel dans le chat (« 📞 … » / « 📹 … ») : l'emoji est remplacé par une icône */
  function callNoticeEl(text) {
    var m = /^(📞|📹)\s*([\s\S]*)$/.exec(String(text || ''));
    if (!m) return null;
    var w = el('span', 'callnote'), ic = el('span', 'callnote-ic');
    ic.innerHTML = m[1] === '📹' ? CALL_CAM : CALL_PHONE;
    var sv = ic.firstChild;
    if (sv) { sv.setAttribute('width', '16'); sv.setAttribute('height', '16'); sv.setAttribute('fill', 'currentColor'); }
    ic.style.cssText = 'display:inline-flex;vertical-align:-3px;margin-right:6px';
    w.appendChild(ic); w.appendChild(document.createTextNode(m[2]));
    return w;
  }
  /* ---------- appel vidéo 1-à-1 ---------- */
  var CALL_CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>';
  var CALL_CAMOFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6.5l-4 4V7a1 1 0 00-1-1H9.8l11.2 11.2V6.5zM3.3 2.7L2 4l2.1 2.1A1 1 0 003 7v10a1 1 0 001 1h12c.2 0 .4-.1.6-.2L20 21.3l1.3-1.3L3.3 2.7z"/></svg>';
  var CALL_FLIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6V3L8 7l4 4V8a4 4 0 014 4c0 .7-.2 1.4-.5 2l1.5 1.5A6 6 0 0012 6zm0 10a4 4 0 01-4-4c0-.7.2-1.4.5-2L7 8.5A6 6 0 0012 18v3l4-4-4-4v3z"/></svg>';
  (function () {
    var st = document.createElement('style');
    st.textContent = '.callui .vstage{display:none}' +
      '.callui.vid{overflow:hidden}' +
      '.callui.vid .vstage{display:block;position:absolute;inset:0;z-index:0;background:#000}' +
      '.callui .vrem{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}' +
      '.callui .vloc{position:absolute;object-fit:cover;background:#222;z-index:2}' +
      '.callui .vloc.mir{transform:scaleX(-1)}' +
      '.callui.vid:not(.vlive) .vrem{display:none}' +
      '.callui.vid:not(.vlive) .vloc{inset:0;width:100%;height:100%;opacity:.55}' +
      '.callui.vid.vlive .vloc{top:max(env(safe-area-inset-top,0px),12px);right:12px;width:96px;height:132px;border-radius:14px;border:2px solid rgba(255,255,255,.5);box-shadow:0 4px 14px rgba(0,0,0,.45)}' +
      '.callui.vid .cwho,.callui.vid .cbtns{position:relative;z-index:3}' +
      '.callui.vid.vlive .cwho .avatar{display:none}' +
      '.callui.vid.vlive .cwho{text-shadow:0 1px 4px rgba(0,0,0,.8)}' +
      '.callui.vid .cbtns{flex-wrap:wrap;justify-content:center;gap:10px}' +
      '.callui.vid .cb{width:54px;height:54px}';
    document.head.appendChild(st);
  })();
  /* contraintes micro (+ caméra pour un appel vidéo) */
  function callCons(video) {
    var c = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
    if (video) c.video = { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
    return c;
  }
  function callVidEl() {
    var v = document.createElement('video');
    v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
    return v;
  }
  /* zone vidéo : l'autre en grand, soi en petit (re-créée à chaque rafraîchissement de l'écran d'appel) */
  function callStage() {
    var st = el('div', 'vstage');
    if (!C.rem) { C.rem = callVidEl(); C.rem.autoplay = true; }
    C.rem.className = 'vrem';
    if (!C.lv) { C.lv = callVidEl(); C.lv.muted = true; C.lv.setAttribute('muted', ''); }
    C.lv.className = 'vloc' + (C.facing === 'environment' ? '' : ' mir');
    if (C.stream && !C.lv.srcObject) C.lv.srcObject = new MediaStream(C.stream.getVideoTracks());
    st.appendChild(C.rem); st.appendChild(C.lv);
    try { C.rem.play().catch(function () {}); C.lv.play().catch(function () {}); } catch (e) {}
    return st;
  }
  /* limite le débit vidéo envoyé (ménage la data et le relais) */
  function callCap(pc) {
    if (!C.video) return;
    try {
      pc.getSenders().forEach(function (sd) {
        if (!sd.track || sd.track.kind !== 'video' || !sd.getParameters) return;
        var pr = sd.getParameters();
        if (!pr.encodings || !pr.encodings.length) pr.encodings = [{}];
        pr.encodings[0].maxBitrate = 900000;
        sd.setParameters(pr).catch(function () {});
      });
    } catch (e) {}
  }
  /* caméra avant / arrière */
  async function callFlip() {
    if (!C.video || !C.stream || C.flipping) return;
    C.flipping = true;
    var want = C.facing === 'environment' ? 'user' : 'environment', old = C.stream.getVideoTracks()[0];
    var open = function (face) {
      return getMic({ video: { facingMode: { ideal: face }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } } }).then(function (ns) { return ns.getVideoTracks()[0]; });
    };
    var apply = async function (nt, face) {
      nt.enabled = !C.camOff;
      if (old) C.stream.removeTrack(old);
      C.stream.addTrack(nt);
      var sd = C.pc && C.pc.getSenders().filter(function (x) { return x.track && x.track.kind === 'video'; })[0];
      if (sd) await sd.replaceTrack(nt);
      C.facing = face;
      if (C.lv) { C.lv.srcObject = new MediaStream([nt]); C.lv.className = 'vloc' + (face === 'environment' ? '' : ' mir'); C.lv.play().catch(function () {}); }
    };
    try {
      if (old) old.stop();
      await apply(await open(want), want);
    } catch (e) {
      try { await apply(await open(C.facing), C.facing); } catch (e2) { showErr('Impossible de changer de caméra.'); }
    }
    C.flipping = false;
  }
  function callUi() {
    var role = C.role;
    if (!role) return;
    if (!C.ui) {
      var ui = el('div', 'callui');
      ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-modal', 'true'); ui.setAttribute('aria-label', C.video ? 'Appel vidéo' : 'Appel vocal');
      document.body.appendChild(ui);
      C.ui = ui;
    }
    var ui2 = C.ui, other = C.chat.other, name = cap(C.chat.name);
    ui2.className = 'callui' + (C.st === 'ring' ? ' ringing' : '') + (C.video ? ' vid' + (C.st === 'live' || C.st === 'lost' ? ' vlive' : '') : '');
    ui2.replaceChildren();
    if (C.video) ui2.appendChild(callStage());
    var who = el('div', 'cwho'), av = el('span', 'avatar');
    paintPhoto(av, other, C.chat.name); loadPhoto(other);
    who.appendChild(av);
    who.appendChild(el('div', 'cname', name));
    var st = el('div', 'cst'); st.id = 'callSt'; st.setAttribute('aria-live', 'polite');
    who.appendChild(st);
        var dbgE = el('div', 'cdbg'); dbgE.id = 'callDbg'; who.appendChild(dbgE);
    ui2.appendChild(who);
    var row = el('div', 'cbtns');
    var mk = function (cls, svg, label, fn) {
      var w = el('div', 'cbw'), b = el('button', 'cb ' + cls); b.type = 'button'; b.innerHTML = svg; b.setAttribute('aria-label', label);
      b.addEventListener('click', fn); w.appendChild(b); w.appendChild(el('span', '', label)); row.appendChild(w); return b;
    };
    if (role === 'callee' && C.st === 'ring') {
      mk('end', CALL_PHONE, 'Refuser', function () { callFinish('declined'); });
      mk('ok', CALL_PHONE, 'Décrocher', function () { callAccept(); });
    } else {
      var mb = mk('', C.muted ? CALL_MUTE : CALL_MIC, C.muted ? 'Micro coupé' : 'Micro', function () {
        C.muted = !C.muted;
        if (C.stream) C.stream.getAudioTracks().forEach(function (t) { t.enabled = !C.muted; });
        callUi();
      });
      if (C.muted) mb.classList.add('on');
      if (C.video) {
        var cmb = mk('', C.camOff ? CALL_CAMOFF : CALL_CAM, C.camOff ? 'Caméra coupée' : 'Caméra', function () {
          C.camOff = !C.camOff;
          if (C.stream) C.stream.getVideoTracks().forEach(function (t) { t.enabled = !C.camOff; });
          callUi();
        });
        if (C.camOff) cmb.classList.add('on');
        mk('', CALL_FLIP, 'Retourner', callFlip);
      }
      var sb = mk('', C.speaker ? CALL_SPK : CALL_EAR, C.speaker ? 'Haut-parleur' : 'Écouteur', function () {
        C.speaker = !C.speaker; store('uandi-spk', C.speaker ? '1' : '0');
        callRouteNote(''); callRoute(); callUi();
      });
      if (C.speaker) sb.classList.add('on');
      mk('end', CALL_PHONE, 'Raccrocher', function () { callFinish('hang'); });
    }
    ui2.appendChild(row);
    callStatus();
  }
  function callStatus(txt) {
    var e = document.getElementById('callSt'), g = document.getElementById('callDbg');
    if (g) g.textContent = C.st === 'live' ? '' : 'offre ' + (C.dbg.off ? '✓' : '…') + ' · réponse ' + (C.dbg.ans ? '✓' : '…') + ' · ice reçus ' + C.dbg.ice + ' · ICE ' + C.dbg.ic + ' · candidats h' + C.dbg.h + ' s' + C.dbg.s + ' r' + C.dbg.r + (C.dbg.err ? ' · erreur ' + C.dbg.err : '') + ' · envoyés ' + (C.dbg.sent || 0) + (C.dbg.werr ? ' ✗ ' + C.dbg.werr : '');
    if (!e) return;
    if (txt) { e.textContent = txt; return; }
    if (C.st === 'ring') e.textContent = C.role === 'caller' ? 'Ça sonne…' : (C.video ? 'Appel vidéo entrant…' : 'Appel vocal entrant…');
    else if (C.st === 'conn') e.textContent = 'Connexion…';
    else if (C.st === 'lost') e.textContent = 'Connexion instable…';
    else if (C.st === 'live') e.textContent = (C.needTap ? 'Touche pour activer le son · ' : '') + callDur(Math.max(0, Math.round((Date.now() - C.t0) / 1000)));
  }
  function callPc() {
    if (C.pc) { try { C.pc.close(); } catch (e) {} }
    var pc = new RTCPeerConnection(ICE);
    C.pc = pc;
    pc.onicecandidate = function (e) {
      if (!e.candidate || C.pc !== pc) return;
      var m = / typ (host|srflx|relay)/.exec(e.candidate.candidate || '');
      if (m) C.dbg[m[1] === 'host' ? 'h' : m[1] === 'srflx' ? 's' : 'r']++;
      callStatus();
      callSig('cice', { data: JSON.stringify(e.candidate) });
    };
    pc.onicecandidateerror = function (e) { if (C.pc === pc && e && e.errorCode) { C.dbg.err = e.errorCode + (e.url ? ' ' + String(e.url).replace(/^(turns?|stuns?):/, '$1:').slice(0, 40) : ''); callStatus(); } };
    pc.oniceconnectionstatechange = function () { if (C.pc === pc) { C.dbg.ic = pc.iceConnectionState; callStatus(); } };
    pc.ontrack = function (ev) {
      if (!C.rem) { C.rem = C.video ? callVidEl() : new Audio(); C.rem.autoplay = true; }
      var rs = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
      if (C.rem.srcObject !== rs) C.rem.srcObject = rs;
      C.rem.play().then(function () { C.needTap = false; }).catch(function () { C.needTap = true; callStatus(); });
      callRoute();
    };
    pc.onconnectionstatechange = function () {
      if (C.pc !== pc) return;
      var s = pc.connectionState;
      if (s === 'connected') {
        clearTimeout(C.discT); clearTimeout(C.ringT); clearTimeout(C.rsT);
        if (C.st !== 'live') {
          C.st = 'live'; C.t0 = Date.now(); ringStop(); callWake(true); callMedia(true);
          if (C.video && C.ui) C.ui.classList.add('vlive');
          if (C.ui) C.ui.classList.remove('ringing');
          clearInterval(C.tickT); C.tickT = setInterval(callStatus, 1000);
        } else C.st = 'live';
        callStatus();
      } else if (s === 'disconnected') {
        if (C.st === 'live') { C.st = 'lost'; callStatus(); }
        clearTimeout(C.discT);
        C.discT = setTimeout(function () { if (C.pc === pc && C.st !== 'live') callFinish('ended', 'Appel coupé : connexion perdue'); }, 60000);
        clearTimeout(C.rsT);
        C.rsT = setTimeout(function () { if (C.pc === pc && pc.connectionState !== 'connected') callRestartIce(pc); }, 4000);
      } else if (s === 'failed') {
        if ((C.st === 'live' || C.st === 'lost') && (C.role === 'callee' || callRestartIce(pc))) {
          C.st = 'lost'; callStatus();
          clearTimeout(C.discT);
          C.discT = setTimeout(function () { if (C.pc === pc && C.st !== 'live') callFinish('ended', callWhy('Connexion échouée')); }, 30000);
        } else callFinish('ended', callWhy('Connexion échouée'));
      }
    };
    return pc;
  }
  /* relance la recherche de chemin réseau (ICE) sans couper l'appel : changement Wi-Fi / 4G, coupure brève.
     Seul l'appelant relance (3 essais max) ; l'autre côté répond avec le code de réponse existant. */
  function callRestartIce(pc) {
    if (C.role !== 'caller' || C.pc !== pc) return false;
    if (pc.signalingState !== 'stable') return true;   /* une relance est déjà en cours */
    pc._rs = (pc._rs || 0) + 1;
    if (pc._rs > 3) return false;
    pc.createOffer({ iceRestart: true }).then(function (off) {
      return pc.setLocalDescription(off).then(function () {
        return callSig('coffer', { data: JSON.stringify({ type: off.type, sdp: off.sdp }) });
      });
    }).catch(function () {});
    return true;
  }
  window.addEventListener('online', function () { if (C.role === 'caller' && C.pc && C.st === 'lost') callRestartIce(C.pc); });
  function callSig(kind, extra) {
    if (!C.chat) return Promise.resolve();
    var d = { sid: C.sid, jid: '', from: state.me, kind: kind, ts: Date.now() };
    for (var k in extra) d[k] = extra[k];
    C.dbg.sent = (C.dbg.sent || 0) + 1;
    return liveCol(C.chat.id).add(d).catch(function (e) { C.dbg.werr = kind + ':' + ((e && e.code) || 'erreur'); callStatus(); });
  }
  function callIce(c) {
    if (C.pc && C.pc.remoteDescription) C.pc.addIceCandidate(c).catch(function () {}); else C.pend.push(c);
  }
  function callFlush() {
    var pc = C.pc;
    C.pend.splice(0).forEach(function (c) { if (pc) pc.addIceCandidate(c).catch(function () {}); });
  }
  async function callSignal(d) {
    try {
      if (d.kind === 'cice') { C.dbg.ice++; callStatus(); callIce(JSON.parse(d.data)); return; }
      if (d.kind === 'canswer' && C.role === 'caller' && C.pc) {
        C.dbg.ans = 1; callStatus();
        await C.pc.setRemoteDescription(JSON.parse(d.data)); callFlush();
      } else if (d.kind === 'coffer' && C.role === 'callee' && C.pc) {
        C.dbg.off = 1; callStatus();
        await C.pc.setRemoteDescription(JSON.parse(d.data)); callFlush();
        var ans = await C.pc.createAnswer();
        await C.pc.setLocalDescription(ans);
        C.dbg.ans = 1; callStatus();
        callSig('canswer', { data: JSON.stringify({ type: ans.type, sdp: ans.sdp }) });
      }
    } catch (e) {}
  }
  function callListenSig() {
    var sid = C.sid, seen = {};
    C.sigUnsub = liveCol(C.chat.id).where('sid', '==', sid).onSnapshot(function (snap) {
      snap.docChanges().forEach(function (ch) {
        if (ch.type !== 'added' || seen[ch.doc.id] || C.sid !== sid) return;
        seen[ch.doc.id] = 1;
        var d = ch.doc.data();
        if (d && d.from !== state.me && /^c/.test(d.kind || '')) callSignal(d);
      });
    }, function () { showErr('Appel impossible (règles Firestore : autorise « liveSig »).'); callFinish('ended'); });
  }
  async function callEnsure(chat) {
    var ref = callRef(chat.id);
    /* les discussions vivent maintenant en SQL : le document d'appel (xdocs « chats/… ») doit être créé ici, même si la discussion existe */
    var snap = await ref.get();
    if (snap.exists) return ref;
    var names = {}; names[state.me] = myName(); names[chat.other] = chat.name;
    var seen = {}; seen[state.me] = Date.now();
    await ref.set({ members: [state.me, chat.other], names: names, lastText: C.video ? '📹 Appel vidéo' : '📞 Appel vocal', lastTs: Date.now(), lastUid: state.me, seen: seen });
    return ref;
  }
  async function callStart(chat, video) {
    if (C.role) return;
    if (!window.RTCPeerConnection || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showErr('Ton navigateur ne permet pas les appels vocaux.'); return; }
    var stream;
    try { stream = await getMic(callCons(video)); }
    catch (e) { showErr((video ? 'Caméra ou micro inaccessible : autorise-les pour passer un appel vidéo. ' : 'Micro inaccessible : autorise le micro pour passer un appel. ') + MIC_HELP); return; }
    if (C.role) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    C.dbg = { off: 0, ans: 0, ice: 0, h: 0, s: 0, r: 0, ic: '-' };
    C.speaker = callSpk(); C.routeMsg = '';
    C.video = !!video; C.camOff = false; C.facing = 'user'; C.lv = null; if (C.video) C.speaker = true;
    C.role = 'caller'; C.chat = chat; C.sid = liveId(); C.stream = stream; C.pend = []; C.st = 'ring'; C.muted = false; C.needTap = false; C.t0 = 0;
    callUi(); ringStart(false);
    var sid = C.sid;
    try {
      var ref = await callEnsure(chat);
      var pc = callPc();
      stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
      callCap(pc);
      callListenSig();
      var off = await pc.createOffer();
      await pc.setLocalDescription(off);
      C.dbg.off = 1;
      await liveCol(chat.id).add({ sid: sid, jid: '', from: state.me, kind: 'coffer', ts: Date.now(), data: JSON.stringify({ type: off.type, sdp: off.sdp }) });
      await ref.update({ call: { sid: sid, from: state.me, to: chat.other, ts: Date.now(), st: 'ring', video: !!video } });
    } catch (e) {
      if (C.sid === sid) { showErr('Appel impossible (' + ((e && (e.code || e.message)) || 'erreur') + ') : vérifie les règles Firestore de « chats ».'); callClose(); }
      return;
    }
    C.ringT = setTimeout(function () { if (C.sid === sid && C.role === 'caller' && C.st === 'ring') callFinish('missed'); }, 45000);
  }
  async function callAccept() {
    if (C.role !== 'callee' || C.st !== 'ring') return;
    var sid = C.sid, chat = C.chat;
    C.st = 'conn'; ringStop(); callUi();
    var stream;
    try { stream = await getMic(callCons(C.video)); }
    catch (e) {
      if (C.sid === sid && C.role === 'callee') { C.st = 'ring'; ringStart(true); callUi(); callStatus('Micro bloqué : ferme les bulles et fenêtres flottantes, puis appuie sur Répondre'); }
      showErr('Micro inaccessible : impossible de répondre pour l’instant. ' + MIC_HELP + ' Tu peux appuyer de nouveau sur Répondre.');
      return;
    }
    if (C.sid !== sid || C.role !== 'callee') { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    C.stream = stream;
    if (C.video) callUi();
    try {
      await fs.runTransaction(function (tx) {
        var r = callRef(chat.id);
        return tx.get(r).then(function (d) {
          var k = d.exists && d.data().call;
          if (!k || k.sid !== sid || k.st !== 'ring') throw new Error('gone');
          tx.update(r, { 'call.st': 'on', 'call.ts': Date.now() });
        });
      });
    } catch (e) { if (C.sid === sid) callClose('Appel terminé'); return; }
    if (C.sid !== sid) return;
    var pc = callPc();
    stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
      callCap(pc);
    callListenSig();
    C.ringT = setTimeout(function () { if (C.sid === sid && C.st === 'conn') callFinish('ended', callWhy('Connexion impossible')); }, 25000);
  }
  /* l'autre personne a changé l'état de l'appel */
  function callSync(k) {
    if (!C.role || k.sid !== C.sid) return;
    if (k.st === 'on' && C.role === 'caller' && C.st === 'ring') {
      C.st = 'conn'; clearTimeout(C.ringT); ringStop(); if (C.ui) C.ui.classList.remove('ringing'); callStatus();
      var sid = C.sid;
      C.ringT = setTimeout(function () { if (C.sid === sid && C.st === 'conn') callFinish('ended', callWhy('Connexion impossible')); }, 25000);
    } else if (k.st === 'declined' && C.role === 'caller') {
      var ch = C.chat; callClose('Appel refusé'); liveNotice(ch, '📞 Appel refusé');
    } else if (k.st === 'ended' || k.st === 'cancelled' || k.st === 'missed' || k.st === 'declined') {
      callClose(C.st === 'ring' ? 'Appel manqué' : 'Appel terminé');
    }
  }
  /* l'état d'un appel (sonnerie, réponse, refus, fin) vit dans xdocs « chats/… » : on l'écoute ici et on le donne à callWatch */
  var callSub = null, callSubUid = '';
  function callListen() {
    var me = state.me;
    if (!me || (callSub && callSubUid === me)) return;
    callUnlisten();
    callSubUid = me;
    callSub = fs.collection('chats').where('members', 'array-contains', me).onSnapshot(function (snap) {
      var list = [];
      snap.forEach(function (d) { var v = d.data() || {}; v.id = d.id; list.push(v); });
      callWatch(list);
    }, function () {});
  }
  function callUnlisten() { if (callSub) { try { callSub(); } catch (e) {} } callSub = null; callSubUid = ''; }
  function callWatch(list) {
    if (!state.me) return;
    list.forEach(function (c) {
      var k = c.call;
      if (!k || !k.sid) return;
      if (C.role && C.sid === k.sid) { callSync(k); return; }
      if (k.st === 'ring' && k.from !== state.me && !C.seen[k.sid] && Math.abs(Date.now() - (k.ts || 0)) < 60000) {
        C.seen[k.sid] = 1;
        if (C.role) { callRef(c.id).update({ 'call.st': 'declined' }).catch(function () {}); return; }
        callIncoming(c, k);
      }
    });
  }
  function callIncoming(c, k) {
    C.dbg = { off: 0, ans: 0, ice: 0, h: 0, s: 0, r: 0, ic: '-' };
    C.speaker = callSpk(); C.routeMsg = '';
    C.video = k.video === true; C.camOff = false; C.facing = 'user'; C.lv = null; if (C.video) C.speaker = true;
    C.role = 'callee'; C.sid = k.sid; C.st = 'ring'; C.muted = false; C.needTap = false; C.t0 = 0; C.pend = [];
    C.chat = { id: c.id, other: k.from, name: nickOf(c, k.from) || (c.names && c.names[k.from]) || 'Appel' };
    callUi(); ringStart(true);
    var sid = k.sid;
    C.ringT = setTimeout(function () { if (C.sid === sid && C.role === 'callee' && C.st === 'ring') callClose('Appel manqué'); }, 50000);
  }
  /* nous terminons l'appel : st = 'hang' | 'declined' | 'missed' | 'ended' */
  function callFinish(st, why) {
    if (!C.role) return;
    var chat = C.chat, sid = C.sid, role = C.role, was = C.st;
    var dur = C.t0 ? Math.round((Date.now() - C.t0) / 1000) : 0;
    if (st === 'hang') st = (was === 'live' || was === 'lost') ? 'ended' : (role === 'caller' ? 'cancelled' : 'declined');
    callRef(chat.id).update({ call: { sid: sid, from: role === 'caller' ? state.me : chat.other, to: role === 'caller' ? chat.other : state.me, ts: Date.now(), st: st, dur: dur, by: state.me } }).catch(function () {});
    if (st === 'ended' && dur > 0) liveNotice(chat, (C.video ? '📹 Appel vidéo · ' : '📞 Appel vocal · ') + callDurText(dur));
    else if (role === 'caller' && (st === 'cancelled' || st === 'missed')) liveNotice(chat, C.video ? '📹 Appel vidéo manqué' : '📞 Appel manqué');
    callClose(why || (st === 'ended' ? 'Appel terminé' : ''), why ? 10000 : 1600);
  }
  function callClose(msg, ms) {
    var chat = C.chat, sid = C.sid, role = C.role, ui = C.ui;
    clearTimeout(C.ringT); clearTimeout(C.discT); clearInterval(C.tickT);
    ringStop(); callWake(false); if (role) callMedia(false);
    if (C.sigUnsub) { try { C.sigUnsub(); } catch (e) {} }
    if (C.pc) { try { C.pc.close(); } catch (e) {} }
    if (C.stream) C.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
    if (C.rem) { try { C.rem.pause(); C.rem.srcObject = null; } catch (e) {} }
    if (C.lv) { try { C.lv.pause(); C.lv.srcObject = null; } catch (e) {} }
    C.role = null; C.chat = null; C.sid = ''; C.pc = null; C.stream = null; C.rem = null; C.sigUnsub = null; C.pend = [];
    C.st = ''; C.t0 = 0; C.ui = null; C.needTap = false; C.video = false; C.camOff = false; C.facing = 'user'; C.lv = null; C.flipping = false;
    if (role === 'caller' && chat) {
      liveCol(chat.id).where('sid', '==', sid).get().then(function (sn) {
        var b = fs.batch(); sn.forEach(function (d) { b.delete(d.ref); }); return b.commit();
      }).catch(function () {});
    }
    if (ui) {
      if (msg) {
        var e = ui.querySelector('#callSt'); if (e) e.textContent = msg;
        ui.className = 'callui'; var bt = ui.querySelector('.cbtns'); if (bt) bt.remove(); var vs = ui.querySelector('.vstage'); if (vs) vs.remove();
        setTimeout(function () { ui.remove(); }, ms || 1600);
      } else ui.remove();
    }
  }
  $('#callBtn').addEventListener('click', function () {
    var c = state.chat;
    if (c && !c.group) callStart({ id: c.id, other: c.other, name: c.name }, false);
  });
  /* bouton « Appel vidéo » (1-à-1 seulement) */
  (function () {
    var cb = $('#callBtn'); if (!cb || $('#vcallBtn')) return;
    var vb = document.createElement('button');
    vb.className = cb.className; vb.id = 'vcallBtn'; vb.type = 'button'; vb.setAttribute('aria-label', 'Appel vidéo'); vb.hidden = cb.hidden;
    vb.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>';
    cb.parentNode.insertBefore(vb, cb.nextSibling);
    vb.addEventListener('click', function () {
      var c = state.chat;
      if (c && !c.group) callStart({ id: c.id, other: c.other, name: c.name }, true);
    });
  })();
  document.addEventListener('click', function (e) {
    if (C.needTap && C.rem && e.target.closest && e.target.closest('.callui')) C.rem.play().then(function () { C.needTap = false; callStatus(); }).catch(function () {});
  });
  window.addEventListener('pagehide', function () {
    if (C.role && C.chat) { try { callRef(C.chat.id).update({ 'call.st': C.role === 'caller' && C.st === 'ring' ? 'cancelled' : 'ended' }); } catch (e) {} }
  });




/* E'cho — js/app/22-action-verite.js
   Action ou vérité multijoueur
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- Action ou vérité multijoueur ---------- */
  (function () {
    var $td = function (id) { return document.getElementById(id); };
    var td = { unsub: null, roomUnsub: null, rooms: [], roomId: null, room: null, chosenType: '', spinning: false };
    var defaults = {
      action: ['Fais une imitation amusante pendant 10 secondes.', 'Raconte une blague ou invente-en une.', 'Chante quelques secondes d’une chanson que tu connais.', 'Fais un compliment sincère à un joueur.', 'Décris ton humeur avec trois emojis.', 'Fais une pose drôle pendant cinq secondes.'],
      truth: ['Quel est un petit objectif que tu veux atteindre ?', 'Quelle chanson écoutes-tu en boucle en ce moment ?', 'Quel est un souvenir qui te fait sourire ?', 'Quelle qualité apprécies-tu chez un ami ?', 'Quel talent aimerais-tu apprendre ?', 'Quelle est une chose amusante que peu de gens savent sur toi ?']
    };
    function tdSafeName(p) { return (p && p.name) ? String(p.name).slice(0, 32) : 'Joueur'; }
    function tdMyName() {
      var mode = $td('tdNameMode').value;
      if (mode === 'anon') return '🎭 Anonyme';
      if (mode === 'pseudo') return ($td('tdPseudo').value.trim() || 'Joueur mystère').slice(0, 24);
      return (typeof myName === 'function' ? myName() : state.username) || 'Joueur';
    }
    function tdMsg(s) { $td('tdStatus').textContent = s || ''; }
    /* certifié, assistant ou créateur : peut rejoindre / créer une partie réservée aux certifiés */
    function tdCanCert() {
      try { return !!state.me && ((typeof badges !== 'undefined' && !!badges[state.me]) || (typeof isCertMe === 'function' && isCertMe())); } catch (e) { return false; }
    }
    function tdLocked(r) { return !!(r && r.certOnly && !tdCanCert() && !(r.players || []).some(function (p) { return p.uid === state.me; })); }
    function tdCertUi() { var w = $td('tdCertWrap'); if (w) w.hidden = !tdCanCert(); }
    function tdShowPanel(show) { $td('tdPanel').hidden = !show; $td('tdEntry').hidden = show; var b=document.querySelector('#nwPaneFeed .nwbox'), f=$td('nwFeed'), a=$td('nwAud'); if(b)b.hidden=show; if(f)f.hidden=show; if(a)a.hidden=show; if(show)tdCertUi(); }
    function tdInRoom(on) {
      var c=document.querySelector('#tdPanel .td-create'), l=$td('tdRooms');
      if (c) c.hidden=!!on; if (l) l.hidden=!!on;
      if (on) { var rm=$td('tdRoom'); if (rm && rm.scrollIntoView) setTimeout(function(){ rm.scrollIntoView({behavior:'smooth',block:'start'}); },50); }
    }
    function tdListenRooms() {
      if (td.unsub) td.unsub();
      if (!state.me || !fs) return;
      td.unsub = fs.collection('truthDareRooms').orderBy('createdAt', 'desc').limit(15).onSnapshot(function (snap) {
        td.rooms = []; snap.forEach(function (d) { var x=d.data(); if (x && (x.status === 'waiting' || x.status === 'playing') && (x.players || []).length > 0 && Date.now() - (x.createdAt || 0) < 86400000) td.rooms.push(Object.assign({id:d.id},x)); });
        tdRenderRooms(); tdRenderPosts();
        if (td.roomId && !td.roomUnsub) { var found=td.rooms.filter(function(r){return r.id===td.roomId;})[0]; if(found) tdRenderRoom(found); }
      }, function (e) { tdMsg('Impossible de charger les parties. Vérifie les règles Firestore de truthDareRooms.'); });
    }
    function tdAgo(ts) {
      var m = Math.max(0, Math.floor((Date.now() - (ts || 0)) / 60000));
      return m < 1 ? 'à l’instant' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h';
    }
    function tdRenderPosts() {
      var feed = $td('nwFeed'); if (!feed) return;
      var box = $td('tdPosts');
      if (!box) { box = document.createElement('div'); box.id = 'tdPosts'; box.className = 'td-posts'; }
      if (feed.firstChild !== box) feed.insertBefore(box, feed.firstChild);
      var keep = feed.scrollTop;
      box.textContent = '';
      td.rooms.forEach(function (r) {
        var ps = r.players || [], host = ps[0], mine = ps.some(function (p) { return p.uid === state.me; });
        var card = document.createElement('article'); card.className = 'td-post';
        var head = document.createElement('div'); head.className = 'td-post-head';
        var av = document.createElement('span'); av.className = 'td-post-av'; av.textContent = '🎲';
        var who = document.createElement('div'); who.className = 'td-post-who';
        var b = document.createElement('b'); b.textContent = tdSafeName(host) + ' lance une partie';
        var sm = document.createElement('small'); sm.textContent = 'Action ou vérité · ' + (r.certOnly ? '🔒 certifiés · ' : '') + tdAgo(r.createdAt);
        who.appendChild(b); who.appendChild(sm);
        var pill = document.createElement('span'); pill.className = 'td-pill' + (r.status === 'playing' ? ' on' : ''); pill.textContent = r.status === 'playing' ? 'En cours' : 'Ouverte';
        head.appendChild(av); head.appendChild(who); head.appendChild(pill);
        var info = document.createElement('p'); info.className = 'td-post-info';
        info.textContent = ps.length + ' joueur' + (ps.length > 1 ? 's' : '') + ' · ' + (r.startAt && r.startAt > Date.now() ? 'début prévu le ' + new Date(r.startAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'prête à jouer');
        var chips = document.createElement('div'); chips.className = 'td-post-players';
        ps.slice(0, 5).forEach(function (p) { var c = document.createElement('span'); c.className = 'td-player'; var i = document.createElement('i'); i.textContent = (tdSafeName(p).trim().charAt(0) || '?').toUpperCase(); var n = document.createElement('span'); n.textContent = tdSafeName(p); c.appendChild(i); c.appendChild(n); chips.appendChild(c); });
        if (ps.length > 5) { var more = document.createElement('span'); more.className = 'td-player'; more.textContent = '+' + (ps.length - 5); chips.appendChild(more); }
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'nwpost td-post-btn'; btn.textContent = mine ? 'Retourner dans la partie' : 'Rejoindre la partie';
        if (tdLocked(r)) { btn.disabled = true; btn.textContent = '🔒 Réservée aux certifiés'; }
        btn.addEventListener('click', function () { if (tdLocked(r)) { tdMsg('Cette partie est réservée aux certifiés.'); return; } tdShowPanel(true); tdJoin(r.id); });
        card.appendChild(head); card.appendChild(info); card.appendChild(chips); card.appendChild(btn);
        box.appendChild(card);
      });
      box.hidden = !td.rooms.length;
      feed.scrollTop = keep;
    }
    window.__tdPosts = function () { try { tdRenderPosts(); } catch (e) {} };
    window.__tdStart = function () { if (!td.unsub) tdListenRooms(); };
    window.__tdStop = function () { if (td.unsub) { td.unsub(); td.unsub = null; } td.rooms = []; var b = $td('tdPosts'); if (b) b.remove(); };
    function tdRenderRooms() {
      var box=$td('tdRooms'); box.textContent='';
      if (!td.rooms.length) { var p=document.createElement('p'); p.className='td-muted'; p.textContent='Aucune partie ouverte pour le moment. Crée la première !'; box.appendChild(p); return; }
      td.rooms.forEach(function(r){
        var card=document.createElement('div'); card.className='td-room-item';
        var title=document.createElement('b'); title.textContent='🎲 '+(r.title || 'Action ou vérité')+(r.certOnly?' 🔒':''); card.appendChild(title);
        var meta=document.createElement('span'); meta.className='td-room-meta'; meta.textContent=(r.players||[]).length+' joueur(s) · '+(r.startAt && r.startAt>Date.now()?'Début prévu : '+new Date(r.startAt).toLocaleString():'Prête à jouer'); card.appendChild(meta);
        var btn=document.createElement('button'); btn.type='button'; btn.className='nwpost'; btn.textContent='Rejoindre'; if(tdLocked(r)){btn.disabled=true;btn.textContent='🔒 Réservée aux certifiés';} btn.addEventListener('click',function(){tdJoin(r.id);}); card.appendChild(btn); box.appendChild(card);
      });
    }
    function tdCreate() {
      if (!state.me) { tdMsg('Connecte-toi pour créer une partie.'); return; }
      var startRaw=$td('tdStart').value, startAt=startRaw ? new Date(startRaw).getTime() : Date.now();
      if (!Number.isFinite(startAt) || startAt < Date.now()-60000) { tdMsg('Choisis une heure future, ou laisse le champ vide pour commencer maintenant.'); return; }
      tdMsg('Création de la partie…');
      var player={uid:state.me,name:tdMyName(),joinedAt:Date.now()};
      fs.collection('truthDareRooms').add({title:'Action ou vérité',creator:state.me,createdAt:Date.now(),startAt:startAt,status:'waiting',players:[player],turn:null,history:[],certOnly:!!($td('tdCertOnly')&&$td('tdCertOnly').checked&&tdCanCert())})
      .then(function(ref){tdMsg('Partie créée ! Les autres peuvent la rejoindre.');return tdJoin(ref.id);})
      .catch(function(e){tdMsg('Création impossible : '+(e.message||'vérifie les règles Firestore.'));});
    }
    function tdJoin(id) {
      if (!state.me) { tdMsg('Connecte-toi pour rejoindre une partie.'); return; }
      var ref=fs.collection('truthDareRooms').doc(id);
      ref.get().then(function(doc){
        if(!doc.exists) throw new Error('Cette partie n’existe plus.');
        var r=doc.data(); if(r.status==='finished') throw new Error('Cette partie est terminée.');
        if((r.kicked||[]).indexOf(state.me)>=0) throw new Error('L’hôte t’a retiré de cette partie.');
        if(tdLocked(r)) throw new Error('Cette partie est réservée aux certifiés.');
        if(!fs.runTransaction) throw new Error('Rejoindre indisponible sur cet appareil.');
        /* transaction : deux joueurs qui rejoignent en même temps ne s’écrasent plus */
        return fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
          if(!d.exists) throw new Error('Cette partie n’existe plus.');
          var room=d.data();
          if(room.status==='finished') throw new Error('Cette partie est terminée.');
          if((room.kicked||[]).indexOf(state.me)>=0) throw new Error('L’hôte t’a retiré de cette partie.');
          var players=(room.players||[]).slice();
          if(players.some(function(p){return p.uid===state.me;})) return;
          if(room.certOnly && !tdCanCert()) throw new Error('Cette partie est réservée aux certifiés.');
          players.push({uid:state.me,name:tdMyName(),joinedAt:Date.now()});
          tx.update(ref,{players:players});
        });}).then(function(){
          if(td.roomUnsub) td.roomUnsub(); tdGvStop(); td.spinSeen=null; td.firstSnap=true; td.spinning=false; td.roomId=id; tdShowPanel(true); $td('tdRoom').hidden=false; tdInRoom(true); tdMsg('Tu as rejoint la partie.');
          td.roomUnsub=ref.onSnapshot(function(d){if(!d.exists){tdMsg('Cette partie a été supprimée.');$td('tdRoom').hidden=true;tdInRoom(false);return;}td.room=Object.assign({id:d.id},d.data());tdRenderRoom(td.room);td.firstSnap=false;},function(){tdMsg('Connexion à la partie interrompue.');});
        });
      }).catch(function(e){tdMsg(e.message||'Impossible de rejoindre cette partie.');});
    }
    function tdExit(msg) {
      tdVoiceStopAll(); tdGvStop();
      if(td.roomUnsub)td.roomUnsub();td.roomUnsub=null;td.roomId=null;td.room=null;
      $td('tdRoom').hidden=true;tdInRoom(false);tdMsg(msg||'');
    }
    function tdStop() {
      var r=td.room;if(!r||!td.roomId||r.creator!==state.me)return;
      if(!window.confirm('Arrêter la partie pour tous les joueurs ?'))return;
      fs.collection('truthDareRooms').doc(td.roomId).update({status:'finished',turn:null,finishedAt:Date.now()})
      .then(function(){tdExit('Partie arrêtée.');}).catch(function(){tdMsg('Impossible d’arrêter la partie.');});
    }
    function tdRenderRoom(r) {
      if(!r)return;
      if(r.status==='finished'){ if(td.roomId===r.id) tdExit('La partie a été arrêtée.'); return; }
      if(td.roomId===r.id && (r.kicked||[]).indexOf(state.me)>=0){ tdExit('L’hôte t’a retiré de la partie.'); return; }
      td.room=r;
      var stopBtn=$td('tdStop'); if(stopBtn) stopBtn.hidden=r.creator!==state.me;
      $td('tdRoomTitle').textContent='Action ou vérité';
      $td('tdRoomState').textContent=r.status==='playing'?'● En cours':'● En attente';$td('tdRoomState').className='td-pill'+(r.status==='playing'?' on':'');
      $td('tdRoomInfo').textContent=(r.startAt>Date.now()?'Début prévu le '+new Date(r.startAt).toLocaleString():'La partie peut commencer')+' · '+(r.players||[]).length+' joueur(s)';
      var ps=r.players||[], n=ps.length, turn=r.turn, isCreator=r.creator===state.me;
      tdSyncBottle(r);
      var reveal=!!turn && turn.phase!=='spin' && !td.spinning;
      var wheel=$td('tdPlayers'); wheel.textContent='';
      ps.forEach(function(p,k){
        var ang=k*2*Math.PI/n, seat=document.createElement('div');
        var live=reveal && turn.phase!=='done';
        seat.className='td-seat'+(p.uid===state.me?' itsme':'')+(live&&turn.targetUid===p.uid?' target':'')+(live&&turn.pickerUid===p.uid?' picker':'');
        seat.style.left=(50+39*Math.sin(ang)).toFixed(2)+'%'; seat.style.top=(50-39*Math.cos(ang)).toFixed(2)+'%';
        var av=document.createElement('i'); av.textContent=(tdSafeName(p).trim().charAt(0)||'?').toUpperCase();
        var nm=document.createElement('span'); nm.textContent=tdSafeName(p);if(p.uid===state.me)seat.title='Toi';
        seat.appendChild(av); seat.appendChild(nm); wheel.appendChild(seat);
      });
      var started=!r.startAt || Date.now()>=r.startAt;
      var tgt=turn?ps.filter(function(p){return p.uid===turn.targetUid;})[0]:null, pck=turn?ps.filter(function(p){return p.uid===turn.pickerUid;})[0]:null;
      var orphan=!!turn && turn.phase!=='done' && turn.phase!=='spin' && (!tgt||!pck);
      var idle=!turn || turn.phase==='done' || orphan;
      var canSpin=isCreator && n>=2 && started && !td.spinning && !td.busy && idle;
      $td('tdSpin').disabled=!canSpin;
      $td('tdSpin').textContent=n<2?'En attente d’un autre joueur…':!started?'Début programmé':!isCreator?'Seul le créateur lance la bouteille':(!idle||td.spinning)?'Tour en cours…':'🌀 Faire tourner la bouteille';
      ['tdChooseControls','tdPickerControls','tdTargetControls','tdPromptBox','tdAnswerText','tdVoteBox','tdVoteBtns'].forEach(function(id){$td(id).hidden=true;});
      $td('tdTurn').hidden=!reveal;
      if(reveal){
        var tn=tdSafeName(tgt), pn=tdSafeName(pck), me=state.me, isT=turn.targetUid===me, isP=turn.pickerUid===me;
        var kind=turn.type==='action'?'une action':'une question';
        var key=turn.phase+':'+turn.at+':'+(turn.attempt||0), fresh=td.lastPhase!==key;
        var voters=ps.filter(function(p){return p.uid!==turn.targetUid;}), votes=turn.votes||{}, vOk=0, vNo=0;
        voters.forEach(function(p){if(votes[p.uid]==='ok')vOk++;else if(votes[p.uid]==='no')vNo++;});
        var ansEl=$td('tdAnswerText'); ansEl.classList.remove('bad');
        if(orphan){
          $td('tdTurnText').textContent='Un joueur a quitté le tour. Le créateur peut relancer la bouteille.';
        } else if(turn.phase==='choose'){
          $td('tdTurnText').textContent=isT?'La bouteille t’a désigné(e) ! Action ou vérité ?':tn+' a été désigné(e) par la bouteille et choisit : action ou vérité ?';
          $td('tdChooseControls').hidden=!isT;
          if(isT&&fresh)tdMsg('C’est à toi de choisir : Action ou Vérité ?');
        } else if(turn.phase==='ask'){
          $td('tdTurnText').textContent=tn+' a choisi '+(turn.type==='action'?'🔥 ACTION':'💬 VÉRITÉ')+'. '+(isP?'À toi de lui proposer ':pn+' doit lui proposer ')+kind+'.';
          $td('tdPickerControls').hidden=!isP;
          $td('tdPromptLabel').textContent=turn.type==='action'?'Quelle action doit-'+'il/elle faire ?':'Quelle question lui poses-tu ?';
          if(isP&&fresh)tdMsg('Écris '+kind+' pour '+tn+'.');
        } else if(turn.phase==='answer'){
          $td('tdTurnText').textContent=isT?'À toi de répondre !':tn+' doit répondre.';
          $td('tdPromptBox').hidden=false; $td('tdPromptText').textContent=(turn.type==='action'?'🔥 ACTION : ':'💬 VÉRITÉ : ')+turn.prompt;
          $td('tdTargetControls').hidden=!isT;
          if(turn.rejected){ansEl.hidden=false;ansEl.classList.add('bad');ansEl.textContent='❌ Le groupe n’est pas satisfait de : « '+turn.rejected+' »'+(isT?'\nRecommence ta réponse.':'\n'+tn+' doit refaire sa réponse.');}
          if(isT&&fresh)tdMsg(turn.rejected?'Réponse refusée par le groupe : refais-la.':'Écris ta réponse. Les autres devront l’approuver.');
        } else if(turn.phase==='vote'){
          $td('tdTurnText').textContent=isT?'Ta réponse est envoyée : les autres votent…':tn+' a répondu. Approuves-tu sa réponse ?';
          $td('tdPromptBox').hidden=false; $td('tdPromptText').textContent=(turn.type==='action'?'🔥 ACTION : ':'💬 VÉRITÉ : ')+turn.prompt;
          ansEl.hidden=false; ansEl.textContent='✍️ '+tn+' : '+turn.answer;
          $td('tdVoteBox').hidden=false;
          var mine=votes[me], canVote=!isT&&!mine&&voters.some(function(p){return p.uid===me;});
          $td('tdVoteBtns').hidden=!canVote;
          $td('tdVoteInfo').textContent='✅ '+vOk+' · ❌ '+vNo+' · en attente : '+(voters.length-vOk-vNo)+(mine?' — ton vote : '+(mine==='ok'?'✅':'❌'):'');
          if(canVote&&fresh)tdMsg('Vote : approuves-tu la réponse de '+tn+' ?');
          tdVoteTick();
          if(isCreator&&!td.voting&&(voters.length===0||vOk*2>voters.length||vNo*2>=voters.length))tdVote(null);
        } else if(turn.phase==='done'){
          $td('tdTurnText').textContent='✅ Réponse approuvée par le groupe ! Vous pouvez tourner à nouveau.';
          $td('tdPromptBox').hidden=false; $td('tdPromptText').textContent=(turn.type==='action'?'🔥 ACTION : ':'💬 VÉRITÉ : ')+(turn.prompt||'');
          if(turn.answer){ansEl.hidden=false;ansEl.textContent='✍️ '+tn+' : '+turn.answer+'\n(✅ '+vOk+' · ❌ '+vNo+')';}
        }
        td.lastPhase=key;
      }
      tdChatRender(r,reveal);
      tdHostRender(r);
      tdGvSync(r);
      tdVoiceSync(r,reveal);
    }
    /* ---------- vocal du salon : seul celui qui doit parler a le micro, tout le monde écoute ----------
       Signalisation WebRTC dans le document de la partie (champs voice / vc) : aucune nouvelle règle Firestore. */
    function tdIce(){ return (typeof ICE!=='undefined'&&ICE)||{iceServers:[{urls:'stun:stun.l.google.com:19302'}]}; }
    function tdRef(){ return fs.collection('truthDareRooms').doc(td.roomId); }
    function tdGather(pc){
      return new Promise(function(ok){
        if(pc.iceGatheringState==='complete')return ok();
        var done=false;
        function fin(){ if(done)return; done=true; pc.removeEventListener('icegatheringstatechange',chk); ok(); }
        function chk(){ if(pc.iceGatheringState==='complete')fin(); }
        pc.addEventListener('icegatheringstatechange',chk); setTimeout(fin,3000);
      });
    }
    function tdVoiceStopAll(){ tdGvStop(); }
    /* rappel pour le joueur dont c'est le tour de parler (le vocal du salon, lui, écoute en continu) */
    function tdVoiceSync(r,reveal){
      var t=r.turn, me=state.me, spk=null;
      if(reveal&&t&&!td.spinning){ if(t.phase==='ask')spk=t.pickerUid; else if(t.phase==='answer')spk=t.targetUid; }
      var box=$td('tdVoice'), mic=$td('tdMicBtn'), info=$td('tdVoiceInfo'), G=td.gv;
      if(!spk||!G){ box.hidden=true; return; }
      var sp=(r.players||[]).filter(function(p){return p.uid===spk;})[0], nm=tdSafeName(sp);
      box.hidden=false;
      if(spk===me){
        mic.hidden=false; mic.textContent=G.talk?'⏹ Couper le micro':'🎙️ Parler'; mic.classList.toggle('on',!!G.talk);
        info.textContent=G.talk?'🎙️ Micro actif : le salon t’entend.':(t.phase==='ask'?'🎙️ À toi : appuie sur « Parler » pour dire ta proposition (puis écris-la pour l’envoyer).':'🎙️ À toi : appuie sur « Parler » pour répondre (puis écris ta réponse pour la faire voter).');
      } else {
        mic.hidden=true;
        var live=tdGvPeers(r).some(function(x){return x.u===spk&&x.k;});
        info.textContent=live?'🔊 '+nm+' parle… (tu l’entends automatiquement)':'🔇 '+nm+' n’a pas encore activé son micro. Tu l’entendras dès qu’elle ou il parlera.';
      }
    }
    /* ---------- vocal du salon : tout le monde écoute en continu, on appuie sur « Parler » pour parler ----------
       Maillage WebRTC (8 max). Signalisation dans le document de la partie (champs gvp = présence, gv = offres/réponses) : aucune nouvelle règle Firestore.
       Chaque liaison est ouverte dès l'arrivée dans le salon (écoute seule) ; le micro n'est branché (replaceTrack) que pour ceux qui ont le droit de t'entendre. */
    var GV_MAX=8, GV_HB=20000, GV_STALE=150000;
    function tdGvLsKey(){ return 'tdGvPrefs_'+(state.me||''); }
    function tdGvSave(){ var G=td.gv; if(!G)return; try{ localStorage.setItem(tdGvLsKey(),JSON.stringify({allow:G.allow,allowAll:G.allowAll,hush:G.hush,deaf:G.deaf})); }catch(e){} }
    function tdGvLoad(G){ try{ var p=JSON.parse(localStorage.getItem(tdGvLsKey())||'null'); if(p){ G.allow=p.allow||{}; G.allowAll=p.allowAll!==false; G.hush=p.hush||{}; G.deaf=!!p.deaf; } }catch(e){} }
    document.addEventListener('pointerdown',function(){ var b=document.getElementById('tdGvAudios'); if(!td.gvNeedTap||!b)return; td.gvNeedTap=false; var as=b.querySelectorAll('audio'); for(var i=0;i<as.length;i++){ try{ var pr=as[i].play(); if(pr&&pr.catch)pr.catch(function(){ td.gvNeedTap=true; }); }catch(e){} } if(td.gv)tdGvUi(true); },true);
    function tdK(u){ return String(u).replace(/[^A-Za-z0-9_-]/g,'_'); }
    function tdGvKey(off,ans){ return tdK(off)+'__'+tdK(ans); }
    function tdGvPeers(r){
      var P=(r&&r.gvp)||{}, now=Date.now(), ps=(r&&r.players)||[], out=[];
      Object.keys(P).forEach(function(k){ var x=P[k]; if(!x||!x.u||!x.s||!x.t||now-x.t>GV_STALE)return; if(!ps.some(function(p){return p.uid===x.u;}))return; out.push(x); });
      out.sort(function(a,b){ return (Number(a.s)-Number(b.s))||(a.u<b.u?-1:1); });
      return out;
    }
    function tdGvAllowed(u){ var G=td.gv; if(!G)return false; return G.allow[u]!==undefined?G.allow[u]:G.allowAll; }
    function tdGvPresence(){
      var G=td.gv; if(!G||!td.roomId)return Promise.resolve();
      var o={}; o['gvp.'+tdK(state.me)]={u:state.me,s:G.sid,t:Date.now(),k:G.talk?1:0};
      return tdRef().update(o);
    }
    function tdGvApplyAudio(){
      var G=td.gv, box=$td('tdGvAudios'); if(!G||!box)return;
      var as=box.querySelectorAll('audio');
      for(var i=0;i<as.length;i++){ var u=as[i].getAttribute('data-u'); as[i].muted=!!(G.deaf||G.hush[u]); }
    }
    function tdGvAudioFor(uid,stream){
      var box=$td('tdGvAudios'), id='tdGvA_'+tdK(uid), a=document.getElementById(id);
      if(!a){ a=document.createElement('audio'); a.id=id; a.setAttribute('data-u',uid); a.autoplay=true; a.setAttribute('playsinline',''); box.appendChild(a); }
      a.srcObject=stream; tdGvApplyAudio();
      var pr=a.play(); if(pr&&pr.catch)pr.catch(function(){ td.gvNeedTap=true; tdGvUi(); });
    }
    function tdGvWatch(uid,stream){
      var G=td.gv; if(!G)return;
      try{
        var AC=window.AudioContext||window.webkitAudioContext; if(!AC)return; if(!G.ac)G.ac=new AC();
        var src=G.ac.createMediaStreamSource(stream), an=G.ac.createAnalyser(); an.fftSize=256; src.connect(an);
        G.an[uid]={an:an,buf:new Uint8Array(an.fftSize)};
      }catch(e){}
    }
    /* branche / débranche le micro sur chaque liaison selon « qui m'entend » */
    function tdGvApplyTracks(){
      var G=td.gv; if(!G)return;
      Object.keys(G.pcs).forEach(function(u){
        var rec=G.pcs[u]; if(!rec.sender)return;
        var want=(G.talk&&G.track&&tdGvAllowed(u))?G.track:null;
        if(rec.cur!==want){ rec.cur=want; try{ rec.sender.replaceTrack(want).catch(function(){}); }catch(e){} }
      });
    }
    function tdGvDrop(uid){
      var G=td.gv; if(!G)return;
      var rec=G.pcs[uid];
      if(rec){
        if(!rec.conn){ G.fails[uid]=(G.fails[uid]||0)+1; G.next[uid]=Date.now()+Math.min(60000,4000*Math.pow(2,G.fails[uid]-1)); }
        try{rec.pc.close();}catch(e){} delete G.pcs[uid];
      }
      delete G.an[uid];
      var a=document.getElementById('tdGvA_'+tdK(uid)); if(a&&a.parentNode)a.parentNode.removeChild(a);
    }
    function tdGvPc(uid,sa,offerer){
      var G=td.gv, pc=new RTCPeerConnection(tdIce()), rec={pc:pc,sa:sa,t:Date.now(),conn:false,ans:false,sender:null,cur:null};
      if(offerer){ var tr=pc.addTransceiver('audio',{direction:'sendrecv'}); rec.sender=tr.sender; }
      pc.ontrack=function(e){ var st=(e.streams&&e.streams[0])||new MediaStream([e.track]); tdGvAudioFor(uid,st); tdGvWatch(uid,st); };
      pc.onconnectionstatechange=function(){
        if(td.gv!==G||G.pcs[uid]!==rec)return; var st=pc.connectionState;
        if(st==='connected'){
          rec.conn=true; G.fails[uid]=0;
          if(rec.off&&rec.key){ var o={}; o['gv.'+rec.key]=firebase.firestore.FieldValue.delete(); tdRef().update(o).catch(function(){}); }
          tdGvApplyTracks(); tdGvUi();
        } else if(st==='failed'||st==='closed'){ tdGvDrop(uid); }
      };
      G.pcs[uid]=rec; return rec;
    }
    function tdGvOffer(peer){
      var G=td.gv, rec=tdGvPc(peer.u,peer.s,true), key=tdGvKey(state.me,peer.u), n=String(Date.now());
      rec.key=key; rec.n=n; rec.off=true;
      rec.pc.createOffer().then(function(o){return rec.pc.setLocalDescription(o);}).then(function(){return tdGather(rec.pc);}).then(function(){
        if(td.gv!==G||G.pcs[peer.u]!==rec)return;
        var o={}; o['gv.'+key]={so:G.sid,sa:peer.s,n:n,o:rec.pc.localDescription.sdp}; return tdRef().update(o);
      }).catch(function(){ if(td.gv===G&&G.pcs[peer.u]===rec)tdGvDrop(peer.u); });
    }
    function tdGvAnswer(peer,key,x){
      var G=td.gv; tdGvDrop(peer.u);
      var rec=tdGvPc(peer.u,peer.s,false); rec.key=key; rec.n=x.n;
      rec.pc.setRemoteDescription({type:'offer',sdp:x.o}).then(function(){
        var tr=rec.pc.getTransceivers().filter(function(t){return t.receiver&&t.receiver.track&&t.receiver.track.kind==='audio';})[0];
        if(tr){ tr.direction='sendrecv'; rec.sender=tr.sender; }
        return rec.pc.createAnswer();
      }).then(function(a){return rec.pc.setLocalDescription(a);}).then(function(){return tdGather(rec.pc);}).then(function(){
        if(td.gv!==G||G.pcs[peer.u]!==rec)return;
        tdGvApplyTracks();
        var o={}; o['gv.'+key+'.a']=rec.pc.localDescription.sdp; o['gv.'+key+'.an']=x.n; return tdRef().update(o);
      }).catch(function(){ if(td.gv===G&&G.pcs[peer.u]===rec)tdGvDrop(peer.u); });
    }
    function tdGvStart(){
      var G=td.gv={sid:String(Date.now()),stream:null,track:null,talk:false,pcs:{},handled:{},an:{},allow:{},allowAll:true,hush:{},deaf:false,n:0,full:false,fails:{},next:{}};
      tdGvLoad(G);
      G.hb=setInterval(function(){ if(td.gv===G)tdGvPresence().catch(function(){}); },GV_HB);
      G.tick=setInterval(tdGvTick,250);
      tdGvPresence().catch(function(){});
    }
    function tdGvSync(r){
      var G=td.gv, me=state.me;
      if(!G&&r&&td.roomId&&r.id===td.roomId&&r.status!=='finished'&&window.RTCPeerConnection&&(r.players||[]).some(function(p){return p.uid===me;})){ tdGvStart(); G=td.gv; }
      if(G&&r&&td.roomId){
        var all=tdGvPeers(r), ranked=all.slice(0,GV_MAX), mine=all.some(function(x){return x.u===me;});
        G.full=mine&&!ranked.some(function(x){return x.u===me;});
        var peers=G.full?[]:ranked.filter(function(x){return x.u!==me;}), P={};
        peers.forEach(function(x){P[x.u]=x;});
        Object.keys(G.pcs).forEach(function(u){ var rec=G.pcs[u], p=P[u]; if(!p||p.s!==rec.sa||(!rec.conn&&Date.now()-rec.t>20000))tdGvDrop(u); });
        peers.forEach(function(p){
          var rec=G.pcs[p.u];
          if(me<p.u){
            if(!rec){ if(!G.next[p.u]||Date.now()>=G.next[p.u])tdGvOffer(p); }
            else if(!rec.ans){ var x=r.gv&&r.gv[rec.key]; if(x&&x.a&&x.an===rec.n&&x.so===G.sid){ rec.ans=true; rec.pc.setRemoteDescription({type:'answer',sdp:x.a}).catch(function(){ tdGvDrop(p.u); }); } }
          } else {
            var key=tdGvKey(p.u,me), y=r.gv&&r.gv[key];
            if(y&&y.o&&y.n&&y.sa===G.sid&&y.so===p.s&&!G.handled[key+':'+y.n]&&(!rec||rec.n!==y.n)){ G.handled[key+':'+y.n]=1; tdGvAnswer(p,key,y); }
          }
        });
      }
      tdGvUi();
    }
    function tdGvTog(on,fn){
      var b=document.createElement('button'); b.type='button'; b.className='td-gv-tog '+(on?'on':'off'); b.textContent=on?'Oui':'Non'; b.setAttribute('aria-pressed',on?'true':'false');
      b.addEventListener('click',fn); return b;
    }
    function tdGvUi(force){
      var r=td.room, box=$td('tdGv'); if(!box)return;
      var G=td.gv, me=state.me, ps=(r&&r.players)||[];
      box.hidden=!(r&&td.roomId&&window.RTCPeerConnection&&ps.some(function(p){return p.uid===me;})&&G);
      if(box.hidden)return;
      var peers=tdGvPeers(r).filter(function(x){return x.u!==me;}), list=[{u:me,k:G.talk?1:0,self:1,conn:1}];
      peers.forEach(function(x){ list.push({u:x.u,k:x.k,conn:!!(G.pcs[x.u]&&G.pcs[x.u].conn)}); });
      var sig=list.map(function(x){return x.u+':'+(x.k?1:0)+':'+(x.conn?1:0);}).join(',');
      if(force||td.gvSig!==sig){
        td.gvSig=sig; var pb=$td('tdGvPeople'); pb.textContent='';
        list.forEach(function(x){
          var pl=ps.filter(function(p){return p.uid===x.u;})[0], full=tdSafeName(pl);
          var c=document.createElement('span'); c.className='td-gv-chip'; c.setAttribute('data-u',x.u);
          var i=document.createElement('i'); i.textContent=(full.trim().charAt(0)||'?').toUpperCase();
          var n=document.createElement('span'); n.textContent=(x.self?'Toi':full)+(x.k?' 🎙️':'')+((!x.self&&!x.conn)?' ⏳':'');
          c.appendChild(i); c.appendChild(n); pb.appendChild(c);
        });
      }
      var others=ps.filter(function(p){return p.uid!==me;}), nAllowed=others.filter(function(p){return tdGvAllowed(p.uid);}).length, txt;
      if(G.full) txt='Vocal complet ('+GV_MAX+' personnes max).';
      else if(G.talk) txt=!others.length?'Micro actif. Personne d’autre dans le salon pour l’instant.':(nAllowed===others.length?'Micro actif : tout le salon t’entend.':(nAllowed===0?'Micro actif, mais personne ne t’entend (voir Réglages).':'Micro actif : '+nAllowed+' personne'+(nAllowed>1?'s':'')+' sur '+others.length+' t’entend'+(nAllowed>1?'ent':'')+'.'));
      else txt='Tu entends tout le salon. Appuie sur « Parler » pour te faire entendre.';
      $td('tdGvInfo').textContent=txt;
      var tk=$td('tdGvTalk'); tk.textContent=G.talk?'⏹ Couper le micro':'🎙️ Parler'; tk.classList.toggle('on',!!G.talk); tk.disabled=!!td.gvBusy||G.full;
      $td('tdGvSpk').textContent=td.gvNeedTap?'🔊 Touche pour écouter':(G.deaf?'🔇 Son coupé':'🔊 Son actif');
      $td('tdGvCfg').textContent=td.gvCfg?'✖ Fermer':'⚙️ Réglages';
      $td('tdGvSet').hidden=!td.gvCfg;
      if(td.gvCfg){
        var onl={}; peers.forEach(function(x){onl[x.u]=1;});
        var rsig=others.map(function(p){return p.uid+':'+(tdGvAllowed(p.uid)?1:0)+(G.hush[p.uid]?1:0)+(onl[p.uid]?1:0);}).join(',');
        if(force||td.gvRowSig!==rsig){
          td.gvRowSig=rsig; var rows=$td('tdGvRows'); rows.textContent='';
          if(!others.length){ var e=document.createElement('p'); e.className='td-muted'; e.textContent='Personne d’autre dans le salon.'; rows.appendChild(e); }
          else {
            var h=document.createElement('div'); h.className='td-gv-row head'; ['','M’entend','Je l’entends'].forEach(function(t){ var sp=document.createElement('span'); sp.textContent=t; h.appendChild(sp); }); rows.appendChild(h);
            others.forEach(function(p){
              var row=document.createElement('div'); row.className='td-gv-row';
              var nm=document.createElement('span'); nm.className='nm'; nm.textContent=tdSafeName(p)+(onl[p.uid]?'':' (hors ligne)'); row.appendChild(nm);
              row.appendChild(tdGvTog(tdGvAllowed(p.uid),function(){ G.allow[p.uid]=!tdGvAllowed(p.uid); tdGvSave(); tdGvApplyTracks(); tdGvUi(true); }));
              row.appendChild(tdGvTog(!G.hush[p.uid],function(){ G.hush[p.uid]=!G.hush[p.uid]; tdGvSave(); tdGvApplyAudio(); tdGvUi(true); }));
              rows.appendChild(row);
            });
          }
        }
      }
    }
    function tdGvTick(){
      var G=td.gv; if(!G)return; G.n=(G.n||0)+1;
      if(G.ac&&G.ac.state==='suspended'){ try{G.ac.resume();}catch(e){} }
      var chips=$td('tdGvPeople').children;
      Object.keys(G.an).forEach(function(u){
        var o=G.an[u], dev=0; try{ o.an.getByteTimeDomainData(o.buf); }catch(e){ return; }
        for(var i=0;i<o.buf.length;i++){ var v=Math.abs(o.buf[i]-128); if(v>dev)dev=v; }
        var sp=dev>12;
        for(var k=0;k<chips.length;k++) if(chips[k].getAttribute('data-u')===u) chips[k].classList.toggle('speaking',sp);
      });
      if(G.n%16===0&&td.room)tdGvSync(td.room);
    }
    function tdGvTalkStop(){
      var G=td.gv; if(!G||!G.talk)return; G.talk=false;
      tdGvApplyTracks();
      try{ if(G.stream)G.stream.getTracks().forEach(function(t){t.stop();}); }catch(e){}
      G.stream=null; G.track=null; delete G.an[state.me];
      tdGvPresence().catch(function(){}); tdGvUi(true); if(td.room)tdVoiceSync(td.room,!!td.room.turn);
    }
    function tdGvTalkStart(){
      var G=td.gv; if(!G||G.talk||td.gvBusy)return;
      if(!navigator.mediaDevices||!window.RTCPeerConnection){ tdMsg('Ton navigateur ne permet pas le micro : écris plutôt.'); return; }
      td.gvBusy=true; tdGvUi();
      var gm=(typeof getMic==='function')?getMic:function(c){return navigator.mediaDevices.getUserMedia(c);};
      gm({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(st){
        if(td.gv!==G){ try{st.getTracks().forEach(function(t){t.stop();});}catch(e){} return; }
        G.stream=st; G.track=st.getAudioTracks()[0]; G.talk=true;
        tdGvWatch(state.me,st); tdGvApplyTracks();
        return tdGvPresence();
      }).catch(function(){ tdMsg('Micro indisponible : autorise le micro dans ton navigateur, ou écris.'); })
      .then(function(){ td.gvBusy=false; tdGvUi(true); if(td.room)tdVoiceSync(td.room,!!td.room.turn); });
    }
    function tdGvTalkToggle(){ var G=td.gv; if(!G)return; if(G.talk)tdGvTalkStop(); else tdGvTalkStart(); }
    function tdGvStop(){
      var G=td.gv; if(!G)return; td.gv=null; td.gvSig=null; td.gvRowSig=null; td.gvCfg=false; td.gvNeedTap=false;
      var _rw=$td('tdGvRows'), _pp=$td('tdGvPeople'); if(_rw)_rw.textContent=''; if(_pp)_pp.textContent='';
      clearInterval(G.hb); clearInterval(G.tick);
      Object.keys(G.pcs).forEach(function(u){ try{G.pcs[u].pc.close();}catch(e){} });
      try{if(G.stream)G.stream.getTracks().forEach(function(t){t.stop();});}catch(e){}
      try{if(G.ac)G.ac.close();}catch(e){}
      var ab=$td('tdGvAudios'); if(ab)ab.textContent='';
      var r=td.room;
      if(r&&td.roomId){
        var me=tdK(state.me), o={}; o['gvp.'+me]=firebase.firestore.FieldValue.delete();
        Object.keys(r.gv||{}).forEach(function(k){ if(k.indexOf(me+'__')===0||k.slice(-(me.length+2))==='__'+me)o['gv.'+k]=firebase.firestore.FieldValue.delete(); });
        try{ tdRef().update(o).catch(function(){}); }catch(e){}
      }
      td.gvNeedTap=false; var bx=$td('tdGv'); if(bx)bx.hidden=true;
    }
    /* ---- bouteille synchronisée : tout le monde voit le même tour, le créateur seul le lance ---- */
    var TD_SPIN_MS=3600;
    function tdBadge(txt,ms){ var b=$td('tdSpinBadge'); if(!b)return; clearTimeout(td.badgeT); b.textContent=txt||''; b.classList.toggle('on',!!txt); if(txt&&ms)td.badgeT=setTimeout(function(){b.classList.remove('on');},ms); }
    function tdAng(r,uid){var ps=r.players||[];for(var k=0;k<ps.length;k++)if(ps[k].uid===uid)return k*360/ps.length;return null;}
    function tdSetRot(deg,anim){var b=$td('tdBottle');b.style.transition=anim?'transform '+TD_SPIN_MS+'ms cubic-bezier(.17,.67,.12,1)':'none';b.style.transform='rotate('+deg+'deg)';if(!anim)void b.offsetWidth;td.rot=deg;}
    function tdEndSpin(){
      var r=td.room;
      if(!r||r.creator!==state.me||!r.turn||r.turn.phase!=='spin'||td.ending||!td.roomId)return;
      td.ending=true;
      fs.collection('truthDareRooms').doc(td.roomId).update({turn:Object.assign({},r.turn,{phase:'choose'})}).catch(function(){}).finally(function(){td.ending=false;});
    }
    function tdSyncBottle(r){
      if(td.spinning)return;
      var t=r.turn, base=td.rot||0;
      if(!t){var m=((base%360)+360)%360; if(m>.01&&m<359.99)tdSetRot(base+360-m,false); return;}
      var ang=tdAng(r,t.targetUid); if(ang===null)return;
      var fwd=(((ang-base)%360)+360)%360;
      if(t.phase==='spin' && t.spinId && t.spinId!==td.spinSeen){
        td.spinSeen=t.spinId;
        var age=Date.now()-t.spinId;
        if(!td.firstSnap || (age>-12000 && age<12000)){
          td.spinning=true; tdMsg('La bouteille tourne…');
          var hp=(r.players||[]).filter(function(p){return p.uid===r.creator;})[0];
          tdBadge('🌀 '+tdSafeName(hp)+' fait tourner la bouteille…'); $td('tdWheel').classList.add('spinning');
          tdSetRot(base+(t.spins||4)*360+fwd,true);
          var sid=t.spinId;
          setTimeout(function(){
            td.spinning=false; $td('tdWheel').classList.remove('spinning');
            var cr=td.room; if(!cr)return;
            if(cr.turn&&cr.turn.spinId===sid){ var tp=(cr.players||[]).filter(function(p){return p.uid===cr.turn.targetUid;})[0]; if(tp)tdBadge('🎯 '+tdSafeName(tp)+(cr.turn.targetUid===state.me?' : c’est toi !':' est désigné(e) !'),4500); }
            if(cr.creator===state.me && cr.turn && cr.turn.spinId===sid && cr.turn.phase==='spin') tdEndSpin();
            tdRenderRoom(cr);
          },TD_SPIN_MS+150);
          return;
        }
        tdSetRot(base+fwd,false);
        if(r.creator===state.me)tdEndSpin();
        return;
      }
      if(t.phase==='spin' && t.spinId && Date.now()-t.spinId>TD_SPIN_MS+2500 && r.creator===state.me)tdEndSpin();
      if(fwd>.01&&fwd<359.99)tdSetRot(base+fwd,false);
    }
    /* ---------- mini-chat : réservé aux joueurs NON désignés par la bouteille ----------
       Stocké dans le champ tchat du document de la partie, rattaché au tour (turnAt) et vidé à chaque tirage.
       Le joueur désigné ne reçoit aucun rendu : son DOM est vidé et le champ n'est jamais lu pour lui. */
    function tdChatRender(r,reveal){
      var box=$td('tdChat'), list=$td('tdChatList'), t=r.turn, me=state.me, ps=r.players||[];
      var inGame=ps.some(function(p){return p.uid===me;});
      var tOk=!!t&&ps.some(function(p){return p.uid===t.targetUid;}), pOk=!!t&&ps.some(function(p){return p.uid===t.pickerUid;});
      var can=!!reveal&&!!t&&t.phase!=='spin'&&t.targetUid!==me&&inGame&&tOk&&pOk;
      if(!can){ box.hidden=true; list.textContent=''; td.chatSig=''; return; }
      var tgt=ps.filter(function(p){return p.uid===t.targetUid;})[0], pck=ps.filter(function(p){return p.uid===t.pickerUid;})[0];
      var isP=t.pickerUid===me, done=t.phase==='done';
      var msgs=(r.tchat||[]).filter(function(m){return m&&m.turnAt===t.at&&typeof m.text==='string';}).sort(function(a,b){return a.at-b.at;}).slice(-60);
      box.hidden=false; $td('tdChatForm').hidden=done;
      $td('tdChatHint').textContent=(isP?'Les autres te soufflent des idées. ':'Souffle des idées à '+tdSafeName(pck)+'. ')+'🙈 '+tdSafeName(tgt)+' ne voit rien. Le chat se vide au prochain tour.';
      var sig=r.id+'|'+t.at+'|'+t.phase+'|'+t.pickerUid+'|'+me+'|'+msgs.length+'|'+(msgs.length?msgs[msgs.length-1].at:0);
      if(td.chatSig===sig) return;
      var first=!td.chatSig, atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<40;
      td.chatSig=sig; list.textContent='';
      if(!msgs.length){ var e=document.createElement('div'); e.className='td-chat-empty'; e.textContent='Aucune idée pour l’instant.'; list.appendChild(e); }
      msgs.forEach(function(m){
        var d=document.createElement('div'); d.className='td-chat-msg'+(m.uid===me?' mine':'');
        var b=document.createElement('b'); b.textContent=String(m.name||'Joueur').slice(0,32)+(m.uid===t.pickerUid?' · 🎯':''); d.appendChild(b);
        var x=document.createElement('span'); x.textContent=m.text; d.appendChild(x);
        if(isP&&t.phase==='ask'&&m.uid!==me){
          var u=document.createElement('button'); u.type='button'; u.className='td-chat-use'; u.textContent='↗ Utiliser';
          u.addEventListener('click',function(){ var ta=$td('tdPrompt'); ta.value=m.text; try{ta.focus();}catch(e){} });
          d.appendChild(u);
        }
        list.appendChild(d);
      });
      if(first||atBottom) list.scrollTop=list.scrollHeight;
    }
    function tdChatSend(){
      var r=td.room, t=r&&r.turn, inp=$td('tdChatInput'), txt=inp.value.trim();
      if(!txt||!t||!td.roomId||!state.me) return;
      if(t.phase==='spin'||t.phase==='done'||t.targetUid===state.me) return;
      var ps=r.players||[], mine=ps.filter(function(p){return p.uid===state.me;})[0]; if(!mine) return;
      var now=Date.now(); if(td.chatLast&&now-td.chatLast<500) return; td.chatLast=now;
      var m={uid:state.me,name:tdSafeName(mine),text:txt.slice(0,140),at:now,turnAt:t.at};
      inp.value='';
      fs.collection('truthDareRooms').doc(td.roomId).update({tchat:firebase.firestore.FieldValue.arrayUnion(m)})
      .catch(function(){ tdMsg('Message non envoyé.'); if(!inp.value) inp.value=txt; });
    }
    function tdSpin() {
      var r=td.room;if(!r||td.spinning||td.busy)return;
      if(r.creator!==state.me){tdMsg('Seul le créateur de la partie peut faire tourner la bouteille.');return;}
      var ps=(r.players||[]); if(ps.length<2){tdMsg('Il faut au moins deux joueurs.');return;}
      if(r.startAt>Date.now()){tdMsg('La partie commencera à l’heure prévue.');return;}
      if(r.turn && r.turn.phase!=='done'){var _t=ps.some(function(p){return p.uid===r.turn.targetUid;}),_p=ps.some(function(p){return p.uid===r.turn.pickerUid;});if(_t&&_p){tdMsg('Terminez le tour actuel avant de tourner la bouteille.');return;}}
      td.busy=true; $td('tdSpin').disabled=true;
      var target=ps[Math.floor(Math.random()*ps.length)];
      var others=ps.filter(function(p){return p.uid!==target.uid;}); var picker=others[Math.floor(Math.random()*others.length)];
      var id=Date.now(), ref=fs.collection('truthDareRooms').doc(td.roomId);
      ref.update({status:'playing',turn:{phase:'spin',spinId:id,spins:4+Math.floor(Math.random()*3),targetUid:target.uid,pickerUid:picker.uid,type:'',prompt:'',answer:'',at:id},voice:null,vc:{},tchat:[],history:(r.history||[]).concat([{targetUid:target.uid,pickerUid:picker.uid,at:id}]).slice(-30)})
      .catch(function(e){tdMsg('Erreur pendant le tirage : '+(e.message||''));})
      .finally(function(){td.busy=false; if(td.room)tdRenderRoom(td.room);});
    }
    function tdUpd(turn,extra,okMsg,errMsg){
      var o=Object.assign({turn:turn},extra||{});
      return fs.collection('truthDareRooms').doc(td.roomId).update(o).then(function(){if(okMsg)tdMsg(okMsg);}).catch(function(e){tdMsg(errMsg+(e&&e.message?' ('+e.message+')':''));});
    }
    function tdChoose(type) {
      var r=td.room; if(!r||!r.turn||r.turn.phase!=='choose'||r.turn.targetUid!==state.me)return;
      tdUpd(Object.assign({},r.turn,{phase:'ask',type:type}),null,type==='action'?'Action choisie !':'Vérité choisie !','Choix impossible');
    }
    function tdSendPrompt() {
      var r=td.room; if(!r||!r.turn||r.turn.phase!=='ask'||r.turn.pickerUid!==state.me)return;
      var type=r.turn.type||'truth', prompt=$td('tdPrompt').value.trim();
      if(!prompt){var list=defaults[type]||defaults.truth;prompt=list[Math.floor(Math.random()*list.length)];}
      tdUpd(Object.assign({},r.turn,{phase:'answer',prompt:prompt.slice(0,240),by:state.me}),null,'Proposition envoyée !','Envoi impossible').then(function(){$td('tdPrompt').value='';});
    }
    function tdFinish() {
      var r=td.room; if(!r||!r.turn||r.turn.phase!=='answer'||r.turn.targetUid!==state.me)return;
      var ans=$td('tdAnswer').value.trim();
      if(!ans){tdMsg('Écris ta réponse avant de l’envoyer.');return;}
      tdUpd(Object.assign({},r.turn,{phase:'vote',answer:ans.slice(0,500),votes:{},voteAt:Date.now()}),null,'Réponse envoyée : les autres votent.','Impossible d’envoyer la réponse').then(function(){$td('tdAnswer').value='';});
    }
    /* vote : approuvé si la majorité approuve ; sinon (égalité comprise) le joueur doit refaire */
    function tdVote(v,timedOut) {
      if(!td.roomId||td.voting||!fs.runTransaction)return;
      td.voting=true;
      var ref=fs.collection('truthDareRooms').doc(td.roomId);
      fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
        if(!d.exists)return;
        var room=d.data(), t=room.turn; if(!t||t.phase!=='vote')return;
        var voters=(room.players||[]).filter(function(p){return p.uid!==t.targetUid;});
        var votes=Object.assign({},t.votes||{});
        if(v){ if(t.targetUid===state.me||votes[state.me]||!voters.some(function(p){return p.uid===state.me;}))return; votes[state.me]=v; }
        if(timedOut){ if(!t.voteAt||Date.now()<t.voteAt+TD_VOTE_MS)return; voters.forEach(function(p){ if(!votes[p.uid])votes[p.uid]='ok'; }); }
        var ok=0,no=0; voters.forEach(function(p){if(votes[p.uid]==='ok')ok++;else if(votes[p.uid]==='no')no++;});
        var V=voters.length, nt;
        if(V===0||ok*2>V) nt=Object.assign({},t,{votes:votes,phase:'done',result:'done'});
        else if(no*2>=V) nt=Object.assign({},t,{votes:{},phase:'answer',attempt:(t.attempt||0)+1,rejected:t.answer,answer:''});
        else nt=Object.assign({},t,{votes:votes});
        if(!v&&nt.phase==='vote')return;
        var upd={turn:nt};
        if(nt.phase==='done')upd.history=(room.history||[]).concat([{targetUid:t.targetUid,pickerUid:t.pickerUid,type:t.type,prompt:t.prompt,answer:t.answer,approve:ok,reject:no,result:'done',at:Date.now()}]).slice(-50);
        tx.update(ref,upd);
      });}).catch(function(e){tdMsg('Vote impossible'+(e&&e.message?' ('+e.message+')':''));}).then(function(){td.voting=false;},function(){td.voting=false;});
    }
    /* ---------- compte à rebours du vote : 20 s, puis les absents comptent comme « approuvé » ---------- */
    var TD_VOTE_MS=20000;
    function tdVoteTick(){
      var r=td.room, t=r&&r.turn, box=$td('tdVoteTimer');
      if(!t||t.phase!=='vote'||!t.voteAt||$td('tdRoom').hidden||td.spinning){ if(box)box.hidden=true; return; }
      var me=state.me, ps=r.players||[], left=t.voteAt+TD_VOTE_MS-Date.now(), sec=Math.max(0,Math.ceil(left/1000));
      var isVoter=t.targetUid!==me&&ps.some(function(p){return p.uid===me;}), mine=(t.votes||{})[me];
      box.hidden=false;
      $td('tdTimerBar').style.width=Math.max(0,Math.min(100,left/TD_VOTE_MS*100)).toFixed(1)+'%';
      var tx=$td('tdTimerTxt'); tx.classList.toggle('low',left>0&&left<=6000);
      tx.textContent=left<=0?'⏱ Temps écoulé…':'⏱ '+sec+' s'+(isVoter&&!mine?' · sans vote, tu comptes comme ✅':' avant la fin du vote');
      if(left<=0&&!td.voting&&(!td.voteTry||Date.now()-td.voteTry>1500)&&(r.creator===me||left<=-3000)){ td.voteTry=Date.now(); tdVote(null,true); }
    }
    /* ---------- l'hôte peut retirer des joueurs ---------- */
    function tdHostRender(r){
      var box=$td('tdHost'), list=$td('tdHostList'), me=state.me;
      var others=(r.players||[]).filter(function(p){return p.uid!==me;});
      if(r.creator!==me||!others.length){ box.hidden=true; list.textContent=''; td.hostSig=''; return; }
      box.hidden=false;
      var sig=r.id+'|'+others.map(function(p){return p.uid+':'+tdSafeName(p);}).join(',');
      if(td.hostSig===sig)return; td.hostSig=sig; list.textContent='';
      others.forEach(function(p){
        var row=document.createElement('div'); row.className='td-host-row';
        var n=document.createElement('span'); n.textContent=tdSafeName(p);
        var b=document.createElement('button'); b.type='button'; b.className='td-host-kick'; b.textContent='Retirer';
        b.addEventListener('click',function(){ tdKick(p.uid); });
        row.appendChild(n); row.appendChild(b); list.appendChild(row);
      });
    }
    function tdKick(uid){
      var r=td.room; if(!r||!td.roomId||r.creator!==state.me||uid===state.me||td.kicking||!fs.runTransaction)return;
      var p=(r.players||[]).filter(function(x){return x.uid===uid;})[0]; if(!p)return;
      var name=tdSafeName(p);
      if(!window.confirm('Retirer '+name+' du salon ? Cette personne ne pourra pas revenir.'))return;
      td.kicking=true; var ref=fs.collection('truthDareRooms').doc(td.roomId);
      fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
        if(!d.exists)return; var room=d.data(); if(room.creator!==state.me)return;
        var ps=(room.players||[]).filter(function(x){return x.uid!==uid;});
        var kicked=(room.kicked||[]).filter(function(x){return x!==uid;}).concat([uid]);
        tx.update(ref,{players:ps,kicked:kicked});
      });}).then(function(){tdMsg(name+' a été retiré(e) du salon.');},function(){tdMsg('Impossible de retirer ce joueur.');}).then(function(){td.kicking=false;});
    }
    function tdLeave() {
      tdVoiceStopAll(); tdGvStop();
      var rid=td.roomId, r=td.room;
      if(rid&&r){
        var ref=fs.collection('truthDareRooms').doc(rid), me=state.me;
        var apply=function(withHost){
          return fs.runTransaction(function(tx){return tx.get(ref).then(function(d){
            if(!d.exists)return;
            var room=d.data(), ps=(room.players||[]).filter(function(p){return p.uid!==me;});
            var upd={players:ps};
            /* si l’hôte part, la partie passe au joueur suivant (sinon plus personne ne peut lancer la bouteille) */
            if(withHost&&room.creator===me&&ps.length)upd.creator=ps[0].uid;
            if(!ps.length){upd.status='finished';upd.turn=null;}
            tx.update(ref,upd);
          });});
        };
        if(fs.runTransaction)apply(true).catch(function(){return apply(false);}).catch(function(){});
        else ref.update({players:(r.players||[]).filter(function(p){return p.uid!==me;})}).catch(function(){});
      }
      if(td.roomUnsub)td.roomUnsub();td.roomUnsub=null;td.roomId=null;td.room=null;$td('tdRoom').hidden=true;tdInRoom(false);tdMsg('Tu as quitté la partie.');
    }
    $td('tdOpen').addEventListener('click',function(){tdShowPanel(true);tdListenRooms();tdMsg('Choisis une partie ou crée la tienne.');});
    $td('tdClose').addEventListener('click',function(){tdShowPanel(false);});
    document.addEventListener('newsaccess',function(){tdCertUi();try{tdRenderRooms();tdRenderPosts();}catch(e){}});
    $td('tdCreate').addEventListener('click',tdCreate);
    $td('tdNameMode').addEventListener('change',function(){$td('tdPseudo').hidden=this.value!=='pseudo';});
    $td('tdSpin').addEventListener('click',tdSpin);
    $td('tdStop').addEventListener('click',tdStop);
    $td('tdAction').addEventListener('click',function(){tdChoose('action');});
    $td('tdTruth').addEventListener('click',function(){tdChoose('truth');});
    $td('tdSendPrompt').addEventListener('click',tdSendPrompt);
    $td('tdDone').addEventListener('click',function(){tdFinish();});
    $td('tdMicBtn').addEventListener('click',function(){ var G=td.gv; if(G&&!G.talk){ G.allow={}; G.allowAll=true; } tdGvTalkToggle(); });
    $td('tdApprove').addEventListener('click',function(){tdVote('ok');});
    $td('tdReject').addEventListener('click',function(){tdVote('no');});
    $td('tdLeave').addEventListener('click',tdLeave);
    $td('tdChatSend').addEventListener('click',tdChatSend);
    window.setInterval(tdVoteTick,500);
    $td('tdGvTalk').addEventListener('click',function(){ tdGvTalkToggle(); });
    $td('tdGvSpk').addEventListener('click',function(){
      var G=td.gv; if(!G)return;
      if(td.gvNeedTap){ td.gvNeedTap=false; var as=$td('tdGvAudios').querySelectorAll('audio'); for(var i=0;i<as.length;i++){ try{as[i].play();}catch(e){} } }
      else { G.deaf=!G.deaf; tdGvSave(); tdGvApplyAudio(); }
      tdGvUi();
    });
    $td('tdGvCfg').addEventListener('click',function(){ td.gvCfg=!td.gvCfg; tdGvUi(true); });
    $td('tdGvAll').addEventListener('click',function(){ var G=td.gv; if(!G)return; G.allow={}; G.allowAll=true; tdGvSave(); tdGvApplyTracks(); tdGvUi(true); });
    $td('tdGvNone').addEventListener('click',function(){ var G=td.gv; if(!G)return; G.allow={}; G.allowAll=false; tdGvSave(); tdGvApplyTracks(); tdGvUi(true); });
    window.addEventListener('pagehide',function(){tdVoiceStopAll();tdGvStop();if(td.unsub)td.unsub();if(td.roomUnsub)td.roomUnsub();});
  })();




/* E'cho — js/app/23-actualites-lettres.js
   Actualités : lettres anonymes
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- Actualités : lettres anonymes ---------- */
  var viewNews = $('#viewNews'), nwFeed = $('#nwFeed');
  var NWH = { shown: null, t0: 0, down: false, slide: false, key: '', hot: null }, NWSIG = {};
  var NW = { items: [], unsub: null, mineUnsub: null, mine: {}, id: null, uid: null, loaded: false, failed: false, last: 0, busy: false, open: {}, cm: {}, draft: {}, replyTo: {}, as: 'anon', pubAs: 'anon', video: null, cmLast: 0, pick: '', limit: 20 };
  var NW_ADJ = ['Discret', 'Curieux', 'Rêveur', 'Malin', 'Sauvage', 'Tranquille', 'Espiègle', 'Mystérieux', 'Rusé', 'Timide', 'Brave', 'Lunaire', 'Farouche', 'Sage', 'Fantasque', 'Nocturne', 'Pensif', 'Joyeux'];
  var NW_ANI = [['Renard', '🦊'], ['Hibou', '🦉'], ['Panda', '🐼'], ['Loup', '🐺'], ['Chat', '🐱'], ['Lynx', '🐆'], ['Dauphin', '🐬'], ['Koala', '🐨'], ['Faucon', '🦅'], ['Lapin', '🐰'], ['Cerf', '🦌'], ['Papillon', '🦋'], ['Tigre', '🐯'], ['Hérisson', '🦔'], ['Moineau', '🐦'], ['Lama', '🦙'], ['Castor', '🦫']];
  function nwRand(n) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  function nwMake() {
    var an = NW_ANI[nwRand(NW_ANI.length)];
    return { name: an[0] + ' ' + NW_ADJ[nwRand(NW_ADJ.length)] + ' ' + (10 + nwRand(90)), emoji: an[1], hue: nwRand(360) };
  }
  function nwAv(node, o) {
    node.textContent = o.emoji || '👤';
    node.style.background = 'hsl(' + (o.hue || 0) + ' 65% 55% / .28)';
  }
  function nwErr(t) { var e = $('#nwErr'); e.textContent = t || ''; e.hidden = !t; }
  function nwSaveId() {
    try { localStorage.setItem('uandi-anon:' + state.me, JSON.stringify(NW.id)); } catch (e) {}
    fs.collection('anonProfiles').doc(state.me).set(NW.id).catch(function () {});
  }
  function nwIdentity() {
    if (NW.id) return Promise.resolve(NW.id);
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('uandi-anon:' + state.me) || 'null'); } catch (e) {}
    if (raw && raw.name && raw.emoji) { NW.id = raw; return Promise.resolve(raw); }
    return fs.collection('anonProfiles').doc(state.me).get()
      .then(function (d) { return d.exists && d.data().name ? d.data() : null; }, function () { return null; })
      .then(function (x) { NW.id = x || nwMake(); nwSaveId(); return NW.id; });
  }
  function nwPaintId() {
    if (!NW.id) return;
    nwAv($('#nwIdAv'), NW.id);
    $('#nwIdName').textContent = NW.id.name;
  }
  function nwStop() {
    if (NW.unsub) NW.unsub();
    if (NW.mineUnsub) NW.mineUnsub();
    NW.unsub = null; NW.mineUnsub = null; NW.items = []; NW.mine = {}; NW.id = null; NW.uid = null;
    NW.loaded = false; NW.failed = false; NW.last = 0;
    Object.keys(NW.cm).forEach(function (k) { if (NW.cm[k].unsub) NW.cm[k].unsub(); }); NW.cm = {}; NW.open = {};
    atStop(); nwFloatClose(true);
    if (window.__tdStop) window.__tdStop();
    if (nwFeed) nwFeed.textContent = '';
  }
  function nwAgo(ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    return Math.floor(s / 86400) + ' j';
  }
  function nwCount(o) { var n = 0, k; o = o || {}; for (k in o) { if (o[k]) n++; } return n; }
  /* réactions (plusieurs emojis) sur les lettres et les commentaires */
  var NWRX = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
  function nwRxOf(o) {
    var out = {}, l = o.likes, r = o.reacts;
    if (l && typeof l === 'object') Object.keys(l).forEach(function (k) { if (l[k] === true) out[k] = NWRX[0]; });
    if (r && typeof r === 'object') Object.keys(r).forEach(function (k) { if (typeof r[k] === 'string' && r[k]) out[k] = r[k]; });
    return out;
  }
  function nwRxBtn(o, key, ref) {
    var rx = nwRxOf(o), n = Object.keys(rx).length, mineR = rx[state.me] || '';
    var sg = n ? rxSummary(rx) : '';
    var b = el('button', 'vact rxbtn' + (NWSIG[key] !== undefined && NWSIG[key] !== sg ? ' pop' : ''), n ? sg : '♡ J’aime'); NWSIG[key] = sg; b.type = 'button';
    b.setAttribute('aria-pressed', mineR ? 'true' : 'false'); b.setAttribute('aria-label', 'Réagir (maintenir pour choisir)');
    b.style.cssText = '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation';
    /* maintenir = choisir une réaction ; simple appui = ❤️ (ou retirer ma réaction) */
    var t = null, fired = false, x0 = 0, y0 = 0;
    function cancel() { clearTimeout(t); t = null; b.classList.remove('pressing'); }
    b.addEventListener('pointerdown', function (ev) {
      fired = false; cancel();
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      x0 = ev.clientX; y0 = ev.clientY; b.classList.add('pressing');
      t = setTimeout(function () {
        t = null; fired = true;
        try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
        b.classList.remove('pressing'); NWH.slide = NWH.down; NWH.key = key;
        nwFloatOpen(b, key, o, ref);
      }, 380);
    });
    b.addEventListener('pointermove', function (ev) { if (t && (Math.abs(ev.clientX - x0) > 10 || Math.abs(ev.clientY - y0) > 10)) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (nm) { b.addEventListener(nm, cancel); });
    b.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    b.addEventListener('click', function () {
      if (fired) { fired = false; return; }
      if (NWF.el) { nwFloatClose(); return; }
      if (!ref) return;
      nwReact(ref, o, mineR ? mineR : NWRX[0]);
    });
    return b;
  }
  function nwReact(ref, o, e) {
    var cur = nwRxOf(o)[state.me] || '', p = {};
    p['reacts.' + state.me] = cur === e ? firebase.firestore.FieldValue.delete() : e;
    if (o.likes && o.likes[state.me]) p['likes.' + state.me] = false;
    ref.update(p).catch(function () { nwErr('Réaction impossible (connexion ou règles Firestore).'); });
  }
  /* bulles d'emojis flottantes : montent au-dessus du bouton, directement sur la vidéo.
     Aucun nwRender() : la vidéo n'est pas touchée pendant le choix. */
  var NWF = { el: null }, NWV = {};
  function nwFloatClose(now) {
    var f = NWF.el; if (!f) return;
    NWF.el = null; nwSetHot(null); NWH.slide = false;
    if (now) { if (f.parentNode) f.parentNode.removeChild(f); return; }
    f.classList.add('out');
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 300);
  }
  function nwFloatOpen(btn, key, o, ref) {
    nwFloatClose(true);
    if (!document.getElementById('nwfStyle')) { var st = document.createElement('style'); st.id = 'nwfStyle'; st.textContent = 'html body .nwfloat { position: fixed !important; z-index: 99999; display: flex !important; flex-direction: row !important; gap: 8px; pointer-events: none; width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; background: none !important; border: 0 !important; } html body .nwfloat .nwfb { flex: none !important; min-width: 0 !important; max-width: none !important; margin: 0 !important; pointer-events: auto; width: 42px !important; height: 42px !important; padding: 0; border-radius: 50% !important; display: grid; place-items: center;   font-size: 1.45rem; line-height: 1; border: 1px solid rgba(255,255,255,.2); background: rgba(22,14,16,.9);    box-shadow: 0 6px 18px rgba(0,0,0,.35);   touch-action: none; -webkit-user-select: none; user-select: none; transition: scale .15s;   animation: nwfRise .4s cubic-bezier(.34,1.56,.64,1) both, nwfBob 2.6s ease-in-out infinite;   animation-delay: calc(var(--i) * 45ms), calc(.45s + var(--i) * 140ms); } html body .nwfloat .nwfb[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 30%, rgba(22,14,16,.74)); } html body .nwfloat .nwfb.hot { scale: 1.35; } html body .nwfloat .nwfb.chosen { scale: 1.55; } html body .nwfloat.out { pointer-events: none; } html body .nwfloat.out .nwfb { animation: nwfFall .25s ease-in both; animation-delay: calc(var(--i) * 20ms); } @keyframes nwfRise { from { opacity: 0; transform: translateY(50px) scale(.3); } to { opacity: 1; transform: none; } } @keyframes nwfBob  { 0%, 100% { translate: 0 0; } 50% { translate: 0 -7px; } } @keyframes nwfFall { to { opacity: 0; transform: translateY(46px) scale(.3); } } @media (prefers-reduced-motion: reduce) { html body .nwfloat .nwfb, html body .nwfloat.out .nwfb { animation: none; } } '; document.head.appendChild(st); }
    var box = el('div', 'nwfloat'), cur = nwRxOf(o)[state.me] || '';
    NWRX.forEach(function (e, i) {
      var b = el('button', 'nwfb', e); b.type = 'button'; b.style.setProperty('--i', i);
      b.setAttribute('aria-pressed', cur === e ? 'true' : 'false'); b.setAttribute('aria-label', 'Réagir ' + e);
      b._go = function () {
        if (box.dataset.busy) return; box.dataset.busy = '1';
        b.classList.add('chosen');
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (x) {}
        nwReact(ref, o, e);
        setTimeout(function () { if (NWF.el === box) nwFloatClose(); }, 150);
      };
      b.addEventListener('click', b._go);
      box.appendChild(b);
    });
    document.body.appendChild(box);
    var r = btn.getBoundingClientRect(), w = box.offsetWidth;
    box.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    box.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    NWF.el = box;
  }
  document.addEventListener('pointerdown', function (ev) {
    if (NWF.el && !(ev.target.closest && ev.target.closest('.nwfloat, .rxbtn'))) nwFloatClose();
  }, true);
  nwFeed.addEventListener('scroll', function () { if (NWF.el) nwFloatClose(true); }, { passive: true });
  function nwPickEl(o, ref) {
    var box = el('div', 'nwpick'), cur = nwRxOf(o)[state.me] || '';
    NWRX.forEach(function (e) {
      var b = el('button', 'vact', e); b.type = 'button'; b.setAttribute('aria-pressed', cur === e ? 'true' : 'false');
      b._pick = function () { NW.pick = ''; nwReact(ref, o, e); nwRender(); };
      b._go = function () {
        if (box.dataset.busy) return; box.dataset.busy = '1';
        b.classList.add('chosen'); box.classList.remove('fresh'); box.classList.add('out');
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (x) {}
        setTimeout(b._pick, 190);
      };
      b.addEventListener('click', b._go);
      box.appendChild(b);
    });
    return box;
  }
  function nwFresh(box, key) {
    var n = Date.now();
    if (NWH.shown !== key) { NWH.shown = key; NWH.t0 = n; }
    var age = n - NWH.t0;
    if (age < 450) {
      box.classList.add('fresh'); box.style.setProperty('--el', age + 'ms');
      for (var i = 0; i < box.children.length; i++) box.children[i].style.setProperty('--k', i);
    }
    return box;
  }
  function nwSetHot(b) {
    if (NWH.hot === b) return;
    if (NWH.hot) NWH.hot.classList.remove('hot');
    NWH.hot = b;
    if (b) { b.classList.add('hot'); try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) {} }
  }
  function nwHotAt(x, y) {
    if (NWF.el) {
      var fb = NWF.el.children, fbest = null, fd = 46, j;
      for (j = 0; j < fb.length; j++) {
        var fq = fb[j].getBoundingClientRect(), dd = Math.hypot(x - (fq.left + fq.width / 2), y - (fq.top + fq.height / 2));
        if (dd < fd) { fd = dd; fbest = fb[j]; }
      }
      return fbest;
    }
    var box = nwFeed.querySelector('.nwpick');
    if (!box) return null;
    var r = box.getBoundingClientRect();
    if (x < r.left - 14 || x > r.right + 14 || y < r.top - 46 || y > r.bottom + 46) return null;
    var best = null, bd = 1e9, bs = box.children;
    for (var i = 0; i < bs.length; i++) {
      var q = bs[i].getBoundingClientRect(), d = Math.abs(x - (q.left + q.width / 2));
      if (d < bd && y > q.top - 46 && y < q.bottom + 46) { bd = d; best = bs[i]; }
    }
    return best;
  }
  document.addEventListener('pointerdown', function (ev) { NWH.down = !!(ev.target.closest && ev.target.closest('#nwFeed')); }, true);
  document.addEventListener('pointermove', function (ev) { if (NWH.slide) nwSetHot(nwHotAt(ev.clientX, ev.clientY)); }, { passive: true });
  function nwEndSlide(cancel) {
    NWH.down = false;
    if (!NWH.slide) return;
    NWH.slide = false;
    var b = NWH.hot; nwSetHot(null);
    if (b && !cancel && b._go) b._go();
  }
  document.addEventListener('pointerup', function () { nwEndSlide(false); }, true);
  document.addEventListener('pointercancel', function () { nwEndSlide(true); }, true);
  nwFeed.addEventListener('touchmove', function (ev) { if (NWH.slide && ev.cancelable) ev.preventDefault(); }, { passive: false });
  var nwRaf = 0;
  function nwRender() {
    if (nwRaf) return;
    nwRaf = requestAnimationFrame(function () { nwRaf = 0; nwRenderNow(); });
  }
  function nwRenderNow() {
    if (!nwFeed) return;
    var fo = document.activeElement, foId = fo && fo.dataset && fo.dataset.lid;
    var keepTop = nwFeed.scrollTop; /* on garde la position : vider le fil la remettait tout en haut */
    if (!NW.pick) NWH.shown = null;
    var keepV = {};
    [].forEach.call(nwFeed.querySelectorAll('.nwcard'), function (c) {
      var v = c.querySelector('.nwvid');
      if (v && c.dataset.id) keepV[c.dataset.id] = { el: v, play: !v.paused && !v.ended };
    });
    NWV = keepV;
    var nwResume = [];
    nwFeed.textContent = '';
    if (!NW.loaded) { nwFeed.appendChild(el('p', 'hint', 'Chargement…')); return; }
    if (NW.failed) { nwFeed.appendChild(el('p', 'hint', 'Impossible de charger les lettres (règles Firestore : autorise la collection « letters »).')); return; }
    var creator = creatorOn();
    var list = NW.items.filter(function (it) { return creator || NW.mine[it.id] || nwCount(it.reports) < 3; });
    list = list.slice().sort(function (a, b) { return (b.pin === true) - (a.pin === true); });
    if (typeof crDlg !== 'undefined' && crDlg.open && CR.mode === 'mod') crRender();
    if (!list.length) { nwFeed.appendChild(el('p', 'hint', 'Aucune lettre pour l’instant. Écris la première !')); return; }
    var nwTotal = list.length, nwLim = NW.limit || 20;
    list = list.slice(0, nwLim);
    list.forEach(function (it) {
      var mine = !!NW.mine[it.id], nrep = nwCount(it.reports), likes = it.likes || {}, liked = !!likes[state.me], nl = nwCount(likes);
      var card = el('article', 'nwcard' + (nrep >= 3 ? ' nwflag' : '')); card.dataset.id = it.id;
      var head = el('div', 'nwhead'), av = el('span', 'nwav'), who = el('div', 'nwwho');
      if (!(it.kind === 'real' && it.uid)) nwAv(av, it);
      var isReal = it.kind === 'real' && it.uid;
      if (isReal) { paintPhoto(av, it.uid, it.name); loadPhoto(it.uid); }
      var lnm = el('b', null, isReal ? cap(it.name) : (it.alias || 'Anonyme'));
      if (isReal) { withBadge(lnm, it.uid); ensureBadge(it.uid); head.style.cursor = 'pointer'; head.addEventListener('click', function () { if (window.UIProfile && UIProfile.open) UIProfile.open(it.uid, it.name); }); }
      who.appendChild(lnm);
      who.appendChild(el('small', null, nwAgo(it.ts || 0) + (isReal ? ' · Profil' : '')));
      if (it.pin === true) who.appendChild(el('small', 'nwpin', '📌 Épinglée'));
      head.appendChild(av); head.appendChild(who);
      card.appendChild(head);
      if (!((it.img && it.text === '📷 Photo') || (it.vid && it.text === '🎬 Vidéo'))) card.appendChild(el('p', 'nwtext', it.text || ''));
      if (typeof it.img === 'string' && isCld(it.img)) {
        var pim = el('img', 'nwimg'); pim.src = it.img; pim.loading = 'lazy'; pim.alt = 'Photo anonyme'; pim.referrerPolicy = 'no-referrer';
        pim.addEventListener('click', function () {
          var lb = el('div', 'nw-lb'), li = el('img'), lx = el('button', null, '✖'); li.src = it.img; li.alt = 'Photo anonyme'; lx.type = 'button'; lx.setAttribute('aria-label', 'Fermer');
          lb.appendChild(li); lb.appendChild(lx); lb.addEventListener('click', function () { lb.remove(); }); document.body.appendChild(lb);
        });
        card.appendChild(pim);
      }
      if (typeof it.vid === 'string' && isCld(it.vid)) {
        var kv = NWV[it.id], pv;
        if (kv && kv.el && kv.el.getAttribute('src') === it.vid) { pv = kv.el; if (kv.play) nwResume.push(pv); }
        else { pv = el('video', 'nwvid'); pv.src = it.vid; pv.controls = true; pv.playsInline = true; pv.preload = 'metadata'; pv.setAttribute('playsinline', ''); pv.setAttribute('controlslist', 'nodownload'); }
        card.appendChild(pv);
      }
      if (nrep >= 3) card.appendChild(el('small', 'nwflagtxt', 'Masquée pour les autres : signalée ' + nrep + ' fois'));
      var acts = el('div', 'nwacts'), sec = el('div', 'nwsec');
      acts.appendChild(nwRxBtn(it, 'l:' + it.id, LC().doc(it.id)));
      if (!mine) {
        var done = !!(it.reports && it.reports[state.me]);
        var rp = el('button', 'vact', done ? 'Signalée' : 'Signaler');
        rp.type = 'button'; rp.disabled = done;
        rp.addEventListener('click', function () { nwReport(it); });
        sec.appendChild(rp);
      }
      if (mine || creator) {
        var dl = el('button', 'vact vd', 'Supprimer');
        dl.type = 'button';
        dl.addEventListener('click', function () { nwDelete(it); });
        sec.appendChild(dl);
      }
      if (creator) {
        var pb = el('button', 'vact', it.pin === true ? 'Désépingler' : 'Épingler'); pb.type = 'button';
        pb.addEventListener('click', function () {
          LC().doc(it.id).update({ pin: it.pin === true ? firebase.firestore.FieldValue.delete() : true })
            .catch(function () { nwErr('Épinglage impossible (règles Firestore : le créateur doit pouvoir modifier « letters »).'); });
        });
        sec.appendChild(pb);
      }
      var cmb = el('button', 'vact', '💬 Commenter' + (nwNb(it) ? ' (' + nwNb(it) + ')' : ''));
      cmb.type = 'button'; cmb.setAttribute('aria-pressed', NW.open[it.id] ? 'true' : 'false');
      cmb.addEventListener('click', function () { nwCmToggle(it); });
      acts.appendChild(cmb);
      if (!mine && !isReal) {
        var dc = el('button', 'vact', '🎭 Discuter');
        dc.type = 'button';
        dc.addEventListener('click', function () { atStart(it.id, { name: it.alias, emoji: it.emoji, hue: it.hue }); });
        acts.appendChild(dc);
      }
      if (NW.pick === 'l:' + it.id) acts.appendChild(nwFresh(nwPickEl(it, LC().doc(it.id)), 'l:' + it.id));
      card.appendChild(acts);
      if (sec.childNodes.length) card.appendChild(sec);
      if (NW.open[it.id] && NW.cm[it.id]) card.appendChild(nwCmBox(it));
      nwFeed.appendChild(card);
    });
    nwResume.forEach(function (v) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} });
    if (nwTotal > list.length) {
      var more = el('button', 'nwpost nwmore', 'Afficher plus (' + Math.min(20, nwTotal - list.length) + ' de plus)'); more.type = 'button';
      more.addEventListener('click', function () { NW.limit = (NW.limit || 20) + 20; nwRender(); });
      nwFeed.appendChild(more);
    }
    nwFeed.scrollTop = keepTop;
    if (foId) { var nf = nwFeed.querySelector('input[data-lid="' + foId + '"]'); if (nf) { nf.focus(); try { nf.setSelectionRange(nf.value.length, nf.value.length); } catch (e) {} } }
  }
  var _nwRenderNow0 = nwRenderNow;
  nwRenderNow = function () {
    var t = nwFeed ? nwFeed.scrollTop : 0;
    _nwRenderNow0();
    if (window.__tdPosts) window.__tdPosts();
    if (nwFeed) nwFeed.scrollTop = t;
  };
  function nwListen() {
    if (window.__tdStart) window.__tdStart();
    var col = nwColFor();
    if (NW.unsub && NW.col !== col) { /* le rôle ou le fil choisi a changé : on repart sur le bon fil */
      NW.unsub(); NW.unsub = null; if (NW.mineUnsub) { NW.mineUnsub(); NW.mineUnsub = null; }
      NW.items = []; NW.loaded = false; NW.failed = false; NW.pick = '';
      Object.keys(NW.cm).forEach(function (k) { if (NW.cm[k].unsub) NW.cm[k].unsub(); }); NW.cm = {}; NW.open = {};
    }
    if (NW.unsub) return;
    NW.col = col;
    NW.unsub = fs.collection(col).orderBy('ts', 'desc').limit(100).onSnapshot(function (snap) {
      NW.items = snap.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; });
      NW.loaded = true; NW.failed = false; nwRender();
      try { var nt = 0, mine = NW.mine || {}; NW.items.forEach(function (v) { if (!mine[v.id] && v.uid !== state.me && v.ts > nt) nt = v.ts; }); document.dispatchEvent(new CustomEvent('newsnew', { detail: { ts: nt } })); } catch (e) {}
    }, function () { NW.loaded = true; NW.failed = true; nwRender(); });
    NW.mineUnsub = fs.collection('letterOwners').where('uid', '==', state.me).onSnapshot(function (snap) {
      NW.mine = {}; snap.forEach(function (d) { NW.mine[d.id] = true; }); nwRender(); atWatch();
    }, function () {});
  }
  /* deux fils séparés : « letters » = comptes certifiés (et anciennes lettres), « lettersN » = comptes non certifiés.
     Le créateur lit et publie dans celui qu'il choisit avec les deux boutons au-dessus du fil. */
  function nwColFor() {
    if (badges[state.me]) return NW.fnd === 'N' ? 'lettersN' : 'letters';
    return isCertMe() ? 'letters' : 'lettersN';
  }
  function LC() { return fs.collection(NW.col || nwColFor()); }
  function nwAudPaint() {
    var t = $('#nwAudTxt'), sw = $('#nwAudSw'); if (!t || !sw) return;
    var col = nwColFor();
    t.textContent = col === 'letters' ? 'Fil des comptes certifiés' : 'Fil des comptes non certifiés';
    sw.hidden = !badges[state.me];
    [].forEach.call(sw.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String((b.dataset.a === 'N') === (col === 'lettersN'))); });
  }
  $('#nwAudSw').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button'); if (!b || !badges[state.me]) return;
    NW.fnd = b.dataset.a === 'N' ? 'N' : 'C'; nwListen(); nwRender(); nwAudPaint();
  });
  document.addEventListener('newsaccess', function () { if (state.view === 'news' && NW.unsub) { nwListen(); nwRender(); } nwAudPaint(); });
  document.addEventListener('newsaccess', function () { nwPubPaint(); });
  document.addEventListener('newsnew', function () { nwPubPaint(); });
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('#openNews, .tab[data-t="news"]')) setTimeout(nwPubPaint, 200); });
  function nwLike(it) {
    var p = {}; p['likes.' + state.me] = !(it.likes && it.likes[state.me]);
    LC().doc(it.id).update(p).catch(function () { nwErr('Action impossible (connexion ou règles Firestore).'); });
  }
  function nwReport(it) {
    if (!confirm('Signaler cette lettre ? Elle sera masquée après plusieurs signalements.')) return;
    var p = {}; p['reports.' + state.me] = true;
    LC().doc(it.id).update(p).catch(function () { nwErr('Signalement impossible (connexion ou règles Firestore).'); });
  }
  function nwDelete(it) {
    if (!confirm('Supprimer cette lettre ?')) return;
    LC().doc(it.id).delete()
      .then(function () { fs.collection('letterOwners').doc(it.id).delete().catch(function () {}); })
      .catch(function () { nwErr('Suppression impossible (connexion ou règles Firestore).'); });
  }
  /* photo anonyme : redimensionnée et ré-encodée dans un canvas (supprime les métadonnées EXIF : position GPS, appareil…) */
  function nwPhotoClear() {
    NW.photo = null; NW.video = null;
    var p = $('#nwPrev'); if (p) p.hidden = true;
    var pv = $('#nwPrevVid'); if (pv) { try { pv.pause(); } catch (e) {} if (pv.dataset.u) { URL.revokeObjectURL(pv.dataset.u); pv.dataset.u = ''; } pv.removeAttribute('src'); pv.hidden = true; }
    var pi = $('#nwPrevImg'); if (pi) { pi.hidden = false; pi.removeAttribute('src'); }
    var f = $('#nwFile'); if (f) f.value = '';
  }
  var NW_VID_MAX = 30 * 1024 * 1024; /* 30 Mo : au-delà, l'envoi est trop long et peut être refusé */
  /* « Anonyme » ou « Mon profil » pour publier */
  function nwPubPaint() {
    var real = NW.pubAs === 'real', box = $('#nwBox');
    if (box) box.classList.toggle('asreal', real);
    [].forEach.call(document.querySelectorAll('#nwAs button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.as === NW.pubAs)); });
    var rb = document.querySelector('#nwAs button[data-as="real"]'); if (rb) rb.textContent = '👤 ' + cap(myName());
    var t = $('#nwText'); if (t) t.placeholder = real ? 'Quoi de neuf ? Partage avec ton profil…' : 'Quoi de neuf ? Écris ta lettre anonyme…';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#nwAs button'); if (!b) return;
    NW.pubAs = b.dataset.as === 'real' ? 'real' : 'anon';
    nwErr('');
    nwPubPaint();
  });
  nwPubPaint();
  function nwPhotoPick(file) {
    nwErr('');
    if (!file) return;
    if (/^video\//.test(file.type)) {
      if (file.size > NW_VID_MAX) { nwErr('Vidéo trop lourde (30 Mo maximum).'); $('#nwFile').value = ''; return; }
      nwPhotoClear();
      NW.video = file;
      var pv = $('#nwPrevVid'), u = URL.createObjectURL(file); pv.dataset.u = u; pv.src = u; pv.hidden = false; $('#nwPrevImg').hidden = true; $('#nwPrev').hidden = false;
      return;
    }
    if (!/^image\//.test(file.type)) { nwErr('Choisis une photo ou une vidéo.'); return; }
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      try {
        var M = 1280, sc = Math.min(1, M / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        nwPhotoClear();
        NW.photo = c.toDataURL('image/jpeg', 0.82);
        $('#nwPrevImg').src = NW.photo; $('#nwPrev').hidden = false;
      } catch (e) { nwErr('Photo illisible.'); }
      URL.revokeObjectURL(url);
    };
    im.onerror = function () { URL.revokeObjectURL(url); nwErr('Photo illisible.'); };
    im.src = url;
  }
  async function nwPublish() {
    var ta = $('#nwText'), text = ta.value.trim(), btn = $('#nwPost'), real = NW.pubAs === 'real', label0 = btn.textContent;
    nwErr('');
    if (banGuard()) return;
    if (NW.busy) return;
    if (text.length < 3 && !NW.photo && !NW.video) { nwErr('Écris au moins quelques mots ou ajoute une photo ou une vidéo.'); return; }
    if (Date.now() - NW.last < 30000) { nwErr('Patiente quelques secondes avant de publier autre chose.'); return; }
    NW.busy = true; btn.disabled = true;
    try {
      var id = real ? null : await nwIdentity();
      var imgUrl = '', vidUrl = '';
      if (NW.photo) {
        btn.textContent = 'Envoi…';
        var up = await cloudUp(NW.photo, 'image');
        if (!up) { nwErr('Envoi de la photo impossible' + (CLD_ERR ? ' (' + CLD_ERR + ')' : '') + '. Réessaie.'); NW.busy = false; btn.disabled = false; btn.textContent = label0; return; }
        imgUrl = up;
      }
      if (NW.video) {
        btn.textContent = 'Envoi de la vidéo…';
        var uv = await cloudUp(NW.video, 'video', NW.video.name);
        if (!uv) { nwErr('Envoi de la vidéo impossible' + (CLD_ERR ? ' (' + CLD_ERR + ')' : '') + '. Réessaie.'); NW.busy = false; btn.disabled = false; btn.textContent = label0; return; }
        vidUrl = uv;
      }
      var ref = LC().doc(), b = fs.batch(), ts = Date.now(), noText = imgUrl ? '📷 Photo' : '🎬 Vidéo';
      var ldata = real
        ? { kind: 'real', uid: state.me, name: myName(), alias: cap(myName()), text: (text || noText).slice(0, 600), ts: ts, likes: {}, reports: {} }
        : { alias: id.name, emoji: id.emoji, hue: id.hue, text: (text || noText).slice(0, 600), ts: ts, likes: {}, reports: {} };
      if (imgUrl) ldata.img = imgUrl;
      if (vidUrl) ldata.vid = vidUrl;
      b.set(ref, ldata);
      b.set(fs.collection('letterOwners').doc(ref.id), { uid: state.me, ts: ts });
      await b.commit();
      ta.value = ''; $('#nwCount').textContent = '0 / 600'; NW.last = ts; nwPhotoClear(); pushNews(text || (vidUrl ? '🎬 Vidéo' : '📷 Photo'));
    } catch (e) { nwErr('Publication impossible (règles Firestore : voir « letters » et « letterOwners »).'); }
    NW.busy = false; btn.disabled = false; btn.textContent = label0;
  }




/* E'cho — js/app/24-actualites-commentaires.js
   Commentaires (réels et anonymes), commentaire vocal
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- commentaires (profils réels + anonymes) ---------- */
  function nwNb(it) { var c = NW.cm[it.id]; return c && c.loaded && !c.failed ? c.items.length : (it.cc || 0); }
  function nwCmToggle(it) {
    var c = NW.cm[it.id];
    if (NW.open[it.id]) { NW.open[it.id] = false; if (c && c.unsub) c.unsub(); delete NW.cm[it.id]; nwRender(); return; }
    NW.open[it.id] = true;
    c = NW.cm[it.id] = { items: [], loaded: false, failed: false, unsub: null };
    c.unsub = LC().doc(it.id).collection('comments').orderBy('ts', 'asc').limit(100).onSnapshot(function (sn) {
      c.items = sn.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; }); c.loaded = true; c.failed = false; nwRender();
    }, function () { c.loaded = true; c.failed = true; nwRender(); });
    nwRender();
  }
  function nwCmBox(it) {
    var c = NW.cm[it.id], creator = creatorOn(), box = el('div', 'nwcm');
    if (!c.loaded) box.appendChild(el('small', 'hint', 'Chargement…'));
    else if (c.failed) box.appendChild(el('small', 'hint', 'Commentaires indisponibles (règles Firestore : sous-collection « comments »).'));
    else if (!c.items.length) box.appendChild(el('small', 'hint', 'Aucun commentaire. Sois le premier !'));
    c.items.forEach(function (cm) {
      var real = cm.kind === 'real', mine = real ? cm.uid === state.me : !!NW.mine[cm.id];
      var row = el('div', 'nwc' + (cm.re && cm.re.id ? ' nwre' : '')), av = el('span', 'nwav'), body = el('div', 'nwcb'), top = el('div', 'nwct');
      row.dataset.cid = cm.id;
      if (real) { paintPhoto(av, cm.uid, cm.name); loadPhoto(cm.uid); } else nwAv(av, cm);
      var nmb = el('b', null, real ? cap(cm.name) : (cm.alias || 'Anonyme'));
      if (real) { withBadge(nmb, cm.uid); ensureBadge(cm.uid); }
      top.appendChild(nmb);
      top.appendChild(el('span', 'nwtag' + (real ? ' real' : ''), real ? 'Profil' : 'Anonyme'));
      top.appendChild(el('small', null, nwAgo(cm.ts || 0)));
      body.appendChild(top);
      if (cm.re && cm.re.id) {
        var rf = el('button', 'nwrefrom', '↪ en réponse à @' + (cm.re.n || '?')); rf.type = 'button';
        rf.addEventListener('click', function () {
          var rows = box.querySelectorAll('.nwc'), tg = null;
          for (var i = 0; i < rows.length; i++) if (rows[i].dataset.cid === cm.re.id) { tg = rows[i]; break; }
          if (!tg) return;
          tg.scrollIntoView({ block: 'center', behavior: 'smooth' });
          tg.classList.add('flash'); setTimeout(function () { tg.classList.remove('flash'); }, 1400);
        });
        body.appendChild(rf);
      }
      if (typeof cm.audio === 'string' && (isCld(cm.audio) || cm.audio.indexOf('data:audio/') === 0)) body.appendChild(voiceUI(cm));
      else body.appendChild(el('p', 'nwtext', cm.text || ''));
      var ac = el('div', 'nwacts');
      ac.appendChild(nwRxBtn(cm, 'c:' + cm.id, LC().doc(it.id).collection('comments').doc(cm.id)));
      var rb = el('button', 'vact', '↩ Répondre'); rb.type = 'button';
      rb.addEventListener('click', function () {
        var h = real ? cm.name : (cm.alias || 'Anonyme');
        NW.replyTo[it.id] = { id: cm.id, n: h };
        var d = NW.draft[it.id] || '';
        NW.draft[it.id] = '@' + h + ' ' + d.replace(/^@\S+\s*/, '');
        nwRender();
        var f = nwFeed.querySelector('input[data-lid="' + it.id + '"]');
        if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} }
      });
      ac.appendChild(rb);
      if (!real && !mine) {
        var d = el('button', 'vact', '🎭 Discuter'); d.type = 'button';
        d.addEventListener('click', function () { atStart(cm.id, { name: cm.alias, emoji: cm.emoji, hue: cm.hue }); });
        ac.appendChild(d);
      }
      if (real && !mine) {
        var tz = el('button', 'vact', '🎭 Taquiner'); tz.type = 'button';
        tz.title = 'Lui écrire en anonyme';
        tz.addEventListener('click', function () { atStart('u:' + cm.uid, { name: cm.name, emoji: atInitial(cm.name), hue: atHue(cm.name) }, cm.uid); });
        ac.appendChild(tz);
      }
      if (mine || creator) {
        var x = el('button', 'vact vd', 'Supprimer'); x.type = 'button';
        x.addEventListener('click', function () { nwCmDelete(it, cm); });
        ac.appendChild(x);
      }
      if (NW.pick === 'c:' + cm.id) ac.appendChild(nwFresh(nwPickEl(cm, LC().doc(it.id).collection('comments').doc(cm.id)), 'c:' + cm.id));
      if (ac.children.length) body.appendChild(ac);
      row.appendChild(av); row.appendChild(body); box.appendChild(row);
    });
    var as = el('div', 'nwas');
    [['anon', '🎭 Anonyme'], ['real', '👤 ' + cap(myName())]].forEach(function (o) {
      var b = el('button', 'vact', o[1]); b.type = 'button'; b.setAttribute('aria-pressed', NW.as === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () { NW.as = o[0]; nwRender(); });
      as.appendChild(b);
    });
    box.appendChild(as);
    var rt = NW.replyTo[it.id];
    if (rt && c.items.some(function (x) { return x.id === rt.id; })) {
      var rbar = el('div', 'nwrebar'), rsp = el('span', '', '↪ Réponse à @' + rt.n), rx = el('button', '', '✕');
      rx.type = 'button'; rx.setAttribute('aria-label', 'Annuler la réponse');
      rx.addEventListener('click', function () {
        delete NW.replyTo[it.id];
        NW.draft[it.id] = (NW.draft[it.id] || '').replace(/^@\S+\s*/, '');
        nwRender();
      });
      rbar.appendChild(rsp); rbar.appendChild(rx); box.appendChild(rbar);
    } else if (rt) delete NW.replyTo[it.id];
    var line = el('div', 'nwcin'), inp = el('input', 'nwcinput'), go = el('button', 'nwpost', 'Envoyer');
    var mk = el('button', 'vact nwcmic'); mk.type = 'button'; mk.dataset.nwrec = it.id;
    mk.setAttribute('aria-label', 'Commentaire vocal');
    mk.textContent = (NW.rec && NW.rec.lid === it.id) ? '⏹ ' + fmtDur((Date.now() - NW.rec.t0) / 1000) : '🎙️';
    mk.classList.toggle('on', !!(NW.rec && NW.rec.lid === it.id));
    mk.addEventListener('click', function () { nwRecToggle(it); });
    inp.type = 'text'; inp.maxLength = 300; inp.placeholder = NW.as === 'real' ? 'Commenter avec ton profil…' : 'Commenter en anonyme…';
    inp.value = NW.draft[it.id] || ''; inp.dataset.lid = it.id; go.type = 'button';
    inp.addEventListener('input', function () { NW.draft[it.id] = inp.value; });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nwCmSend(it, inp); } });
    go.addEventListener('click', function () { nwCmSend(it, inp); });
    line.appendChild(inp); line.appendChild(mk); line.appendChild(go); box.appendChild(line);
    return box;
  }
  /* ---------- commentaire vocal : on appuie pour enregistrer, on rappuie pour envoyer (45 s max) ---------- */
  var NW_REC_MAX = 45;
  function nwRecTick() {
    var r = NW.rec; if (!r) return;
    var sec = (Date.now() - r.t0) / 1000;
    var bs = document.querySelectorAll('button[data-nwrec="' + r.lid + '"]');
    for (var i = 0; i < bs.length; i++) bs[i].textContent = '⏹ ' + fmtDur(sec);
    if (sec >= NW_REC_MAX) nwRecStop(false);
  }
  function nwRecStop(cancel) {
    var r = NW.rec; if (!r) return;
    r.cancelled = !!cancel; clearInterval(r.timer);
    try { if (r.mr.state !== 'inactive') r.mr.stop(); else nwRecDone(r); } catch (e) { nwRecDone(r); }
  }
  function nwRecDone(r) {
    clearInterval(r.timer);
    try { r.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    if (NW.rec === r) NW.rec = null;
    nwRender();
    if (r.cancelled) return;
    var dur = (Date.now() - r.t0) / 1000;
    if (dur < 0.7 || !r.chunks.length) { nwErr('Vocal trop court.'); return; }
    var blob = new Blob(r.chunks, { type: (r.mr && r.mr.mimeType) || 'audio/webm' });
    if (blob.size > 650000) { nwErr('Vocal trop long.'); return; }
    var fr = new FileReader();
    fr.onload = function () { nwCmSend(r.it, null, { data: String(fr.result), dur: dur }); };
    fr.readAsDataURL(blob);
  }
  async function nwRecToggle(it) {
    nwErr('');
    if (NW.rec) { if (NW.rec.lid === it.id) nwRecStop(false); return; }
    if (NW.busy || banGuard()) return;
    var mime = pickMime();
    if (mime === null || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { nwErr('Ton navigateur ne permet pas d’enregistrer un vocal.'); return; }
    var stream;
    try { stream = await getMic({ audio: true }); } catch (e) { nwErr('Micro refusé. Autorise le micro pour ce site dans le navigateur.'); return; }
    var opts = { audioBitsPerSecond: 24000 }; if (mime) opts.mimeType = mime;
    var mr;
    try { mr = new MediaRecorder(stream, opts); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); nwErr('L’enregistrement n’a pas pu démarrer.'); return; }
    var r = { mr: mr, chunks: [], stream: stream, t0: Date.now(), cancelled: false, lid: it.id, it: it, timer: null };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) r.chunks.push(e.data); };
    mr.onstop = function () { nwRecDone(r); };
    mr.start(); NW.rec = r; r.timer = setInterval(nwRecTick, 250);
    nwRender();
  }
  async function nwCmSend(it, inp, voice) {
    var text = voice ? '🎤 Commentaire vocal' : inp.value.trim();
    nwErr('');
    if (!text || NW.busy) return;
    if (banGuard()) return;
    if (Date.now() - NW.cmLast < 4000) { nwErr('Patiente quelques secondes entre deux commentaires.'); return; }
    NW.busy = true;
    try {
      var real = NW.as === 'real', id = real ? null : await nwIdentity(), ts = Date.now();
      var ref = LC().doc(it.id).collection('comments').doc(), b = fs.batch();
      var rt = NW.replyTo[it.id], data = real ? { kind: 'real', uid: state.me, name: myName(), text: text.slice(0, 300), ts: ts }
                      : { kind: 'anon', alias: id.name, emoji: id.emoji, hue: id.hue, text: text.slice(0, 300), ts: ts };
      if (rt) data.re = { id: rt.id, n: String(rt.n).slice(0, 40) };
      if (voice) {
        var aud = await cloudUp(voice.data, 'auto');
        if (!aud) { if (voice.data.length > 600000) throw new Error('upload'); aud = voice.data; }
        data.audio = aud; data.dur = Math.round(voice.dur);
      }
      b.set(ref, data);
      if (!real) b.set(fs.collection('letterOwners').doc(ref.id), { uid: state.me, ts: ts, letter: it.id });
      await b.commit();
      if (!voice) NW.draft[it.id] = ''; delete NW.replyTo[it.id]; NW.cmLast = ts;
      LC().doc(it.id).update({ cc: firebase.firestore.FieldValue.increment(1) }).catch(function () {});
    } catch (e) { nwErr('Commentaire impossible (règles Firestore : voir « comments » dans les règles).'); }
    NW.busy = false; nwRender();
  }
  function nwCmDelete(it, cm) {
    if (!confirm('Supprimer ce commentaire ?')) return;
    LC().doc(it.id).collection('comments').doc(cm.id).delete()
      .then(function () {
        if (cm.kind !== 'real') fs.collection('letterOwners').doc(cm.id).delete().catch(function () {});
        LC().doc(it.id).update({ cc: firebase.firestore.FieldValue.increment(-1) }).catch(function () {});
      }).catch(function () { nwErr('Suppression impossible (connexion ou règles Firestore).'); });
  }




/* E'cho — js/app/25-discussions-anonymes.js
   Discussions entre profils anonymes
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- discussions entre profils anonymes ---------- */
  var AT = { items: [], unsub: null, reqU: [], sig: '', cur: null, msgU: null, pane: 'feed', failed: false, selfU: null };
  /* les profils réels peuvent recevoir des messages d'anonymes (taquineries) ; on peut le refuser */
  function atOptKey() { return 'uandi-noanon-' + state.me; }
  function atOptIn() { try { return localStorage.getItem(atOptKey()) !== '1'; } catch (e) { return true; } }
  function atOptPaint() {
    var b = $('#atOptBtn'); if (!b) return;
    var on = atOptIn();
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? '🎭 Les anonymes peuvent me taquiner ✓' : '🚫 Les anonymes ne peuvent pas m’écrire';
  }
  function atTErr(t) { var e = $('#atTErr'); if (!e) return; e.textContent = t || ''; e.hidden = !t; }
  function atInitial(name) { return String(name || '?').trim().charAt(0).toUpperCase() || '?'; }
  function atHue(name) { var h = 0, i; name = String(name || ''); for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return h; }
  function atSeenKey(id) { return 'uandi-atseen:' + state.me + ':' + id; }
  function atSeen(id) { try { return +localStorage.getItem(atSeenKey(id)) || 0; } catch (e) { return 0; } }
  function atMark(id, ts) { try { localStorage.setItem(atSeenKey(id), String(ts || Date.now())); } catch (e) {} }
  function atUnread(t) { return !!t.lastUid && t.lastUid !== state.me && (t.lastTs || 0) > atSeen(t.id); }
  function atOther(t) { return (t.a === state.me ? t.bAlias : t.aAlias) || { name: 'Anonyme', emoji: '👤', hue: 0 }; }
  function atStop() {
    [AT.unsub, AT.msgU, AT.selfU].concat(AT.reqU).forEach(function (u) { if (u) { try { u(); } catch (e) {} } });
    AT.unsub = null; AT.msgU = null; AT.selfU = null; AT.reqU = []; AT.sig = ''; AT.items = []; AT.cur = null; AT.pane = 'feed';
  }
  /* demandes adressées à mon profil réel : 'u:' + mon uid */
  function atSelfWatch() {
    if (AT.selfU) return;
    AT.selfU = fs.collection('anonRequests').where('addr', '==', 'u:' + state.me).onSnapshot(function (sn) {
      sn.docs.forEach(function (d) {
        if (!atOptIn()) { d.ref.delete().catch(function () {}); return; }
        fs.collection('anonThreads').doc(d.id).update({ b: state.me, members: firebase.firestore.FieldValue.arrayUnion(state.me) })
          .then(function () { return d.ref.delete(); }).catch(function () {});
      });
    }, function () {});
  }
  function atListen() {
    if (newsBlocked()) return;
    atSelfWatch();
    if (AT.unsub) return;
    AT.unsub = fs.collection('anonThreads').where('members', 'array-contains', state.me).onSnapshot(function (sn) {
      AT.failed = false;
      AT.items = sn.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; }).sort(function (a, b) { return (b.lastTs || 0) - (a.lastTs || 0); });
      atPaint();
    }, function () { AT.failed = true; atPaint(); });
  }
  /* le propriétaire d'une lettre/commentaire reçoit les demandes de discussion et les accepte */
  function atWatch() {
    if (newsBlocked()) return;
    var ret = atRetired(), ids = Object.keys(NW.mine).filter(function (k) { return ret.indexOf(k) === -1; }).sort(), sig = ids.join(',');
    if (sig === AT.sig) return;
    AT.sig = sig;
    AT.reqU.forEach(function (u) { try { u(); } catch (e) {} }); AT.reqU = [];
    for (var i = 0; i < ids.length; i += 10) (function (ch) {
      AT.reqU.push(fs.collection('anonRequests').where('addr', 'in', ch).onSnapshot(function (sn) {
        sn.docs.forEach(function (d) {
          fs.collection('anonThreads').doc(d.id).update({ b: state.me, members: firebase.firestore.FieldValue.arrayUnion(state.me) })
            .then(function () { return d.ref.delete(); }).catch(function () {});
        });
      }, function () {}));
    })(ids.slice(i, i + 10));
  }
  function atPaint() {
    var dot = $('#atDot'), any = AT.items.some(atUnread);
    if (dot) dot.hidden = !any || AT.pane === 'threads';
    var list = $('#atList');
    if (!list) return;
    list.textContent = '';
    if (AT.failed) { list.appendChild(el('p', 'hint', 'Discussions indisponibles (règles Firestore : « anonThreads » et « anonRequests »).')); return; }
    atOptPaint();
    if (!AT.items.length) { list.appendChild(el('p', 'hint', 'Aucune discussion. Touche « 🎭 Discuter » sur une lettre anonyme, ou « 🎭 Taquiner » sur le commentaire d’un profil (ou tape son identifiant ci-dessus).')); return; }
    AT.items.forEach(function (t) {
      var o = atOther(t), row = el('button', 'atrow' + (atUnread(t) ? ' unread' : '')), av = el('span', 'nwav'), box = el('div');
      row.type = 'button'; nwAv(av, o);
      box.appendChild(el('b', null, o.name)); box.appendChild(el('small', null, t.lastText || (t.b ? 'Dis bonjour !' : 'En attente de réponse…')));
      row.appendChild(av); row.appendChild(box);
      row.addEventListener('click', function () { atOpen(t.id); });
      list.appendChild(row);
    });
    if (AT.cur) atHead();
  }
  function atHead() {
    var t = AT.items.filter(function (x) { return x.id === AT.cur; })[0];
    if (!t) return;
    var o = atOther(t); nwAv($('#atAv'), o); $('#atName').textContent = o.name;
  }
  function nwPane(p) {
    AT.pane = p;
    ['Feed', 'Threads', 'Thread'].forEach(function (k) { $('#nwPane' + k).hidden = k.toLowerCase() !== p; });
    document.querySelectorAll('.nwtab').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.p === (p === 'thread' ? 'threads' : p) ? 'true' : 'false'); });
    if (p !== 'thread' && AT.msgU) { AT.msgU(); AT.msgU = null; AT.cur = null; }
    if (p !== 'feed') { atListen(); atPaint(); }
  }
  function atOpen(tid) {
    if (AT.msgU) { AT.msgU(); AT.msgU = null; }
    AT.cur = tid; $('#atErr').hidden = true; $('#atMsgs').textContent = '';
    nwPane('thread'); atHead();
    AT.msgU = fs.collection('anonThreads').doc(tid).collection('messages').orderBy('ts', 'asc').limit(200).onSnapshot(function (sn) {
      var box = $('#atMsgs'), last = 0;
      box.textContent = '';
      sn.docs.forEach(function (d) {
        var m = d.data(); last = Math.max(last, m.ts || 0);
        box.appendChild(el('div', 'atm' + (m.uid === state.me ? ' me' : ''), m.text || ''));
      });
      if (!sn.docs.length) {
        var tt = AT.items.filter(function (x) { return x.id === tid; })[0], tease = !!(tt && String(tt.addr || '').indexOf('u:') === 0);
        box.appendChild(el('p', 'hint', !tease ? 'Personne ne connaît ton identité. Écris le premier message !'
          : (tt.a === state.me ? 'Tu es anonyme : ' + atOther(tt).name + ' ne sait pas qui tu es. Taquine gentiment 😄' : 'Un anonyme veut te taquiner. Reste cool, tu peux ne pas répondre.')));
      }
      box.scrollTop = box.scrollHeight;
      atMark(tid, Math.max(last, Date.now()));
    }, function () { var e = $('#atErr'); e.textContent = 'Messages indisponibles (règles Firestore).'; e.hidden = false; });
  }
  async function atStart(addr, alias, realUid) {
    nwErr(''); atTErr('');
    var me0 = null;
    try { me0 = await nwIdentity(); } catch (e) {}
    /* une discussion = une adresse + une identité anonyme : si tu as changé de nom, on en ouvre une nouvelle */
    var ex = AT.items.filter(function (t) { return t.addr === addr && t.a === state.me && (!me0 || !t.aAlias || t.aAlias.name === me0.name); })[0];
    if (ex) { atOpen(ex.id); return; }
    if (realUid) {
      if (banGuard()) { atTErr($('#nwErr').textContent); return; }
      if (realUid === state.me) { atTErr('Tu ne peux pas te taquiner toi-même.'); return; }
      try {
        var pd = await fs.collection('presence').doc(realUid).get();
        if (pd.exists && pd.data().noAnon === true) { var m1 = 'Cette personne n’accepte pas les messages anonymes.'; atTErr(m1); nwErr(m1); return; }
      } catch (e) {}
    }
    try {
      var id = await nwIdentity(), ref = fs.collection('anonThreads').doc(), ts = Date.now(), b = fs.batch();
      b.set(ref, { addr: addr, a: state.me, b: null, members: [state.me], ts: ts, lastText: '', lastTs: ts, lastUid: '',
        aAlias: { name: id.name, emoji: id.emoji, hue: id.hue },
        bAlias: { name: alias.name || 'Anonyme', emoji: alias.emoji || '👤', hue: alias.hue || 0 } });
      b.set(fs.collection('anonRequests').doc(ref.id), { addr: addr, ts: ts });
      await b.commit();
      atListen(); atOpen(ref.id);
    } catch (e) { var m2 = 'Discussion impossible (règles Firestore : « anonThreads » et « anonRequests »).'; nwErr(m2); atTErr(m2); }
  }
  /* taquiner un profil réel depuis son identifiant */
  $('#atTeaseForm').addEventListener('submit', async function (ev) {
    ev.preventDefault();
    var inp = $('#atTeaseWho'), name = inp.value.trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
    atTErr('');
    if (!name) return;
    if (name === state.username) { atTErr('C’est ton propre identifiant.'); return; }
    if (!NAME_RE.test(name)) { atTErr('Cet identifiant n’est pas valide.'); return; }
    try {
      var snap = await fs.collection('usernames').doc(name).get();
      if (!snap.exists) { atTErr('Aucun utilisateur ne s’appelle « ' + name + ' ».'); return; }
      inp.value = '';
      var uid = snap.data().uid;
      await atStart('u:' + uid, { name: name, emoji: atInitial(name), hue: atHue(name) }, uid);
    } catch (e) { atTErr('Recherche impossible. Vérifie ta connexion et les règles Firestore.'); }
  });
  $('#atOptBtn').addEventListener('click', function () {
    var on = !atOptIn();
    try { if (on) localStorage.removeItem(atOptKey()); else localStorage.setItem(atOptKey(), '1'); } catch (e) {}
    fs.collection('presence').doc(state.me).set({ noAnon: on ? firebase.firestore.FieldValue.delete() : true }, { merge: true }).catch(function () {});
    atOptPaint();
  });
  async function atSend() {
    var inp = $('#atText'), text = inp.value.trim();
    if (!text || !AT.cur) return;
    inp.value = '';
    var ref = fs.collection('anonThreads').doc(AT.cur), ts = Date.now(), b = fs.batch();
    b.set(ref.collection('messages').doc(), { uid: state.me, text: text.slice(0, 600), ts: ts });
    b.update(ref, { lastText: text.slice(0, 60), lastTs: ts, lastUid: state.me });
    try { await b.commit(); }
    catch (e) { inp.value = text; var er = $('#atErr'); er.textContent = 'Envoi impossible (connexion ou règles Firestore).'; er.hidden = false; }
  }
  document.addEventListener('click', function (e) {
    var tb = e.target.closest && e.target.closest('.nwtab');
    if (tb) nwPane(tb.dataset.p);
  });
  $('#atSend').addEventListener('click', atSend);
  $('#atText').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); atSend(); } });

  function openNews() {
    if (newsBlocked()) return;
    leaveChat(); stopGame();
    pushView({ news: true });
    state.view = 'news';
    if (NW.uid !== state.me) { nwStop(); NW.uid = state.me; }
    viewList.hidden = true; viewChat.hidden = true; viewGame.hidden = true; viewMusic.hidden = true; viewNews.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    nwErr('');
    nwListen(); nwRender(); nwAudPaint(); atListen(); nwPane('feed');
    nwIdentity().then(nwPaintId);
  }
  $('#openNews').addEventListener('click', openNews);
  $('#nwBack').addEventListener('click', function () {
    var forced = this.dataset.force; delete this.dataset.force;
    if (!forced && AT.pane === 'thread') { nwPane('threads'); return; }
    if (!forced && AT.pane === 'threads') { nwPane('feed'); return; }
    if (history.state && history.state.news) history.back(); else showList();
  });
  $('#nwPost').addEventListener('click', nwPublish);
  $('#nwPhoto').addEventListener('click', function () { $('#nwFile').click(); });
  $('#nwFile').addEventListener('change', function () { nwPhotoPick(this.files && this.files[0]); });
  $('#nwPrevX').addEventListener('click', nwPhotoClear);
  (function () {
    var box = document.querySelector('#nwPaneFeed .nwid'), tg = $('#nwIdToggle');
    if (!box || !tg) return;
    function set(min) {
      box.classList.toggle('min', min);
      tg.textContent = min ? '👁️' : '🙈';
      tg.setAttribute('aria-pressed', min ? 'true' : 'false');
      tg.setAttribute('aria-label', min ? 'Afficher le nom et le bouton Changer' : 'Masquer le nom et le bouton Changer');
    }
    var on = false; try { on = localStorage.getItem('uandi-nwid-min') === '1'; } catch (e) {}
    set(on);
    tg.addEventListener('click', function () {
      var min = !box.classList.contains('min'); set(min);
      try { localStorage.setItem('uandi-nwid-min', min ? '1' : '0'); } catch (e) {}
    });
  })();
  $('#nwText').addEventListener('input', function () { $('#nwCount').textContent = this.value.length + ' / 600'; });
  /* changement d'identité : on efface les discussions anonymes lancées avec l'ancien nom et tes messages dans les autres ; les lettres et commentaires restent */
  function atRetKey() { return 'uandi-anonret-' + state.me; }
  function atRetired() { try { return JSON.parse(localStorage.getItem(atRetKey()) || '[]'); } catch (e) { return []; } }
  /* les anciennes lettres/commentaires ne sont plus reliés à toi : on ne reçoit plus de discussions dessus */
  function atRetire() {
    var all = atRetired();
    Object.keys(NW.mine).forEach(function (k) { if (all.indexOf(k) === -1) all.push(k); });
    try { localStorage.setItem(atRetKey(), JSON.stringify(all)); } catch (e) {}
    AT.sig = '';
  }
  async function atWipe() {
    var sn = await fs.collection('anonThreads').where('members', 'array-contains', state.me).get(), ops = [];
    for (var i = 0; i < sn.docs.length; i++) {
      var d = sn.docs[i], ms = await d.ref.collection('messages').get();
      ms.forEach(function (m) { ops.push(m.ref); });
      ops.push(d.ref); ops.push(fs.collection('anonRequests').doc(d.id));
      try { localStorage.removeItem(atSeenKey(d.id)); } catch (e) {}
    }
    for (var j = 0; j < ops.length; j += 400) {
      var b = fs.batch();
      ops.slice(j, j + 400).forEach(function (r) { b.delete(r); });
      try { await b.commit(); } catch (e) { for (var k = j; k < Math.min(j + 400, ops.length); k++) { try { await ops[k].delete(); } catch (e2) {} } }
    }
  }
  $('#nwReroll').addEventListener('click', async function () {
    if (!confirm('Changer d’identité anonyme ? Tu repars comme une autre personne : toutes tes discussions anonymes sont effacées et tu ne recevras plus de discussions sur tes anciennes lettres. Elles restent publiées avec l’ancien nom.')) return;
    var btn = this; btn.disabled = true;
    try {
      if (AT.msgU) { AT.msgU(); AT.msgU = null; }
      if (AT.pane === 'thread') nwPane('threads');
      await atWipe();
    } catch (e) { nwErr('Certains messages n’ont pas pu être effacés (règles Firestore : autorise la suppression dans « anonThreads »).'); }
    atRetire(); NW.id = nwMake(); nwSaveId(); nwPaintId(); atWatch();
    btn.disabled = false;
  });

  function openMusic() {
    leaveChat(); stopGame();
    pushView({ music: true });
    state.view = 'music';
    viewList.hidden = true; viewChat.hidden = true; viewGame.hidden = true; viewMusic.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    mLoad(); mRender(); try { mShStart(); } catch (e) {}
  }
  $('#openMusic').addEventListener('click', openMusic);
  $('#musicBack').addEventListener('click', function () {
    if (history.state && history.state.music) history.back(); else showList();
  });
  $('#mAdd').addEventListener('click', function () { $('#mFiles').click(); });
  $('#mFiles').addEventListener('change', function (e) {
    var fl = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (fl.length) mAdd(fl);
  });
  $('#mPlay').addEventListener('click', mToggle);
  $('#mNext').addEventListener('click', function () { mNext(false); });
  $('#mPrev').addEventListener('click', mPrev);
  $('#mShuffle').addEventListener('click', function () { M.shuffle = !M.shuffle; mRender(); });
  $('#mRepeat').addEventListener('click', function () {
    M.repeat = M.repeat === 'off' ? 'all' : M.repeat === 'all' ? 'one' : 'off';
    mRender();
  });
  $('#mSeek').addEventListener('input', function () {
    var d = mAu.duration;
    if (isFinite(d) && d > 0) { M.seekAt = Date.now(); mAu.currentTime = this.value / 1000 * d; }
  });
  function mSaveEdit() {
    var t = M.tracks[M.edit];
    M.edit = -1;
    if (t) {
      t.title = M.draft.trim().slice(0, 80);
      if (typeof t.id === 'number') {
        mTx('readwrite', function (st) {
          var r = st.get(t.id);
          r.onsuccess = function () { var v = r.result; if (v) { v.title = t.title; st.put(v); } };
          return r;
        }).catch(function () {});
      }
      mMeta();
    }
    mRender();
  }
  $('#mList').addEventListener('input', function (e) {
    if (e.target.classList.contains('mfield')) M.draft = e.target.value;
  });
  $('#mList').addEventListener('keydown', function (e) {
    if (!e.target.classList.contains('mfield')) return;
    if (e.key === 'Enter') { e.preventDefault(); mSaveEdit(); }
    else if (e.key === 'Escape') { M.edit = -1; mRender(); }
  });
  $('#mList').addEventListener('click', function (e) {
    if (e.target.closest('.mok')) { mSaveEdit(); return; }
    var rn = e.target.closest('.mren');
    if (rn) {
      var k = +rn.dataset.i;
      M.edit = k; M.draft = mLabel(M.tracks[k]); M.focusEdit = true;
      mRender();
      return;
    }
    var shb = e.target.closest('.mshare');
    if (shb) { mShareAsk(+shb.dataset.i); return; }
    var d = e.target.closest('.mdel');
    if (d) { mRemove(+d.dataset.i); return; }
    var b = e.target.closest('.mname');
    if (b) { var i = +b.dataset.i; if (i === M.cur) mToggle(); else mPlay(i); }
  });
  $('#mClear').addEventListener('click', function () {
    var b = this;
    if (!b.classList.contains('sure')) {
      b.classList.add('sure'); b.textContent = 'Confirmer ?';
      mClearT = setTimeout(resetMClear, 3000);
      return;
    }
    resetMClear();
    M.tracks.forEach(function (t) { try { URL.revokeObjectURL(t.url); } catch (e) {} });
    M.tracks = []; M.cur = -1; M.edit = -1;
    mAu.pause(); mAu.removeAttribute('src'); mAu.load();
    mTx('readwrite', function (st) { return st.clear(); }).catch(function () {});
    mMeta(); mRender(); mTime();
  });
  ['timeupdate', 'loadedmetadata', 'durationchange'].forEach(function (ev) { mAu.addEventListener(ev, mTime); });
  ['play', 'pause'].forEach(function (ev) { mAu.addEventListener(ev, mRender); });
  mAu.addEventListener('ended', function () { mNext(true); });
  mAu.addEventListener('timeupdate', xfCheck);
  mAu.addEventListener('pause', function () { if (mAu.paused) xfKill(); });
  mAu.addEventListener('play', function () { if (MG && MG.ac.state === 'suspended') MG.ac.resume().catch(function () {}); });
  mAu.addEventListener('error', function () {
    var t = M.tracks[M.cur];
    if (!t) return;
    if (t.remote && !t.fb) {
      t.fb = true; mMsg('Chargement de « ' + mLabel(t) + ' »…');
      mGetBlob(t.url).then(function (b) {
        if (!b) { mMsg('Impossible de lire « ' + mLabel(t) + ' » : le lien du cloud ne répond pas.'); return; }
        var f = (b.type && b.type.indexOf('audio/') === 0) ? b : b.slice(0, b.size, 'audio/mpeg');
        t.url = URL.createObjectURL(f);
        if (M.tracks[M.cur] === t) { mAu.src = t.url; var p = mAu.play(); if (p && p.catch) p.catch(function () {}); }
      });
      return;
    }
    mMsg('Impossible de lire « ' + mLabel(t) + ' ».');
  });
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', mToggle);
      navigator.mediaSession.setActionHandler('pause', mToggle);
      navigator.mediaSession.setActionHandler('previoustrack', mPrev);
      navigator.mediaSession.setActionHandler('nexttrack', function () { mNext(false); });
    }
  } catch (e) {}




/* E'cho — js/app/26-session-approbation.js
   Installation (PWA), session, approbation des nouveaux comptes
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- installation de l'appli (PWA) ---------- */
  var installEv = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEv = e;
    $('#installSec').hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    installEv = null;
    $('#installSec').hidden = true;
  });
  var isStandalone = false; try { isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) {}
  if (!isStandalone) $('#installSec').hidden = false;
  function doInstall() {
    var ev = installEv;
    if (!ev) {
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      alert(ios ? 'Sur iPhone : touche le bouton Partager de Safari, puis « Sur l’écran d’accueil ». L’icône choisie sera utilisée.' : 'Ouvre le menu ⋮ de ton navigateur puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »). L’icône choisie sera utilisée.');
      return;
    }
    ev.prompt();
    ev.userChoice.then(function () {}, function () {}).then(function () {
      installEv = null;
    });
  }
  /* « Installer » ouvre d'abord le choix de l'icône, puis lance l'installation */
  var ipDlg = $('#iconPick'), ipSel = 'violet';
  function ipMark(c) {
    ipSel = c;
    ipDlg.querySelectorAll('.ip-grid [data-i]').forEach(function (b) { b.setAttribute('aria-checked', b.dataset.i === c ? 'true' : 'false'); });
  }
  $('#installBtn').addEventListener('click', function () {
    ipMark(window.__echoIconChoice ? window.__echoIconChoice() : 'violet');
    try { ipDlg.showModal(); } catch (e) { doInstall(); }
  });
  ipDlg.querySelectorAll('.ip-grid [data-i]').forEach(function (b) { b.addEventListener('click', function () { ipMark(b.dataset.i); }); });
  $('#ipNo').addEventListener('click', function () { ipDlg.close(); });
  $('#ipGo').addEventListener('click', function () {
    if (window.__echoSetIcon) window.__echoSetIcon(ipSel);
    ipDlg.close();
    doInstall();
  });

  /* ---------- session ---------- */
  async function ensureDirectory(uid, username) { return; /* le profil est créé automatiquement par Supabase */
    try {
      var ref = fs.collection('usernames').doc(username);
      var s = await ref.get();
      if (!s.exists) await ref.set({ uid: uid });
    } catch (e) {}
  }

  function startSession(user) {
    stopSession();
    state.me = user.uid;
    blkLoad();
    state.deleting = false;
    state.username = String(user.email || '').split('@')[0];
    state.nick = ''; state.nickAt = 0; state.nickLog = [];
    try { var nk = JSON.parse(store('uandi-nick-' + user.uid) || 'null'); if (nk) { state.nick = String(nk.n || ''); state.nickAt = +nk.t || 0; state.nickLog = Array.isArray(nk.l) ? nk.l.map(Number).filter(Boolean) : (nk.t ? [+nk.t] : []); } } catch (e) {}
    state.chats = []; state.chatsById = {}; state.chatsLoaded = false; knownTs = {};
    loginEl.hidden = true;
    appEl.hidden = false;
    state.view = 'list';
    viewChat.hidden = true;
    viewList.hidden = false;
    renderList();
    /* Accueil = Actualités : s'ouvre au démarrage (sauf mode discret, où l'onglet est masqué) */
    /* démarrage : on reste directement sur les Messages (plus d'ouverture automatique de l'accueil / des Shorts) */
    ensureDirectory(user.uid, state.username);
    lkCheck();

    rtStart();
    unsubChats = function () {}; FR.unsub = function () { rtStop(); };

    annStart();
    beat();
    hbTimer = setInterval(beat, 120000);
    stTimer = setInterval(function () { if (!document.hidden) renderStatus(); }, 2000);
    clearInterval(noteTimer);
    noteTimer = setInterval(function () { if (!document.hidden && state.view === 'list') renderList(); }, 60000);
  }


  function applyChats(list) {
    var byId = {}, firstSnap = !state.chatsLoaded;
    list.forEach(function (v) {
      var id = v.id, prev = knownTs[id] || 0;
      knownTs[id] = v.lastTs || 0;
      if (firstSnap || !v.lastUid || v.lastUid === state.me || !(v.lastTs > prev)) return;
      if (((v.seen && v.seen[state.me]) || 0) >= v.lastTs) return;
      if (state.chat && state.chat.id === id) return;
      incomingElsewhere(id, v);
    });
    state.chats = list.map(function (v) { byId[v.id] = true; return v; });
    state.chatsById = byId;
    state.chatsLoaded = true;
      if (PENDING_CHAT && openChatById(PENDING_CHAT)) { PENDING_CHAT = ''; try { history.replaceState(history.state, '', location.pathname); } catch (e) {} }
      callWatch(state.chats);
      callListen();
      if (state.chat) {
        var cc = state.chats.filter(function (x) { return x.id === state.chat.id; })[0];
        if (state.chat.group) {
          if (cc) {
            state.chat.name = cc.title || 'Groupe'; $('#chatName').textContent = cap(state.chat.name);
            paintPhoto($('#chatAvatar'), '', state.chat.name); renderStatus();
            if (giDlg.open) renderGroupInfo();
          }
        } else {
        var nn = cc && (nickOf(cc, state.chat.other) || (cc.names && cc.names[state.chat.other]));
        if (nn && nn !== state.chat.name) { state.chat.name = nn; $('#chatName').textContent = cap(nn); paintPhoto($('#chatAvatar'), state.chat.other, nn); }
        }
      }
      watchNotes();
      frWatchPres();
      if (state.view === 'list') renderList();
      updateTitle();
  }

  function stopSession() {
    leaveChat();
    stopGame();
    hideToast();
    viewMusic.hidden = true;
    nwStop();
    liveStop();
    callClose();
    callUnlisten();
    resetMusic();
    viewGame.hidden = true;
    if (unsubChats) unsubChats(); unsubChats = null;
    if (FR.unsub) FR.unsub(); FR.unsub = null; annStop(); FR.loaded = false;
    Object.keys(FR.presU).forEach(function (u) { try { FR.presU[u](); } catch (e) {} });
    FR.presU = {}; FR.pres = {}; FR.list = [];
    clearInterval(hbTimer); clearInterval(stTimer); clearInterval(noteTimer);
    Object.keys(noteSubs).forEach(function (k) { try { noteSubs[k](); } catch (e) {} });
    noteSubs = {}; notePres = {};
    if (AP.unsub) { try { AP.unsub(); } catch (e) {} AP.unsub = null; } AP.items = []; AP.first = true;
    state.me = null;
    BLK.set = {}; BLK.loaded = false;
  }

  /* ---------- approbation des nouveaux comptes par le créateur ---------- */
  var apNew = false, AP = { items: [], unsub: null, first: true, auto: false, since: 0, setU: null, done: {} }, AG = { unsub: null };
  var AP_FN = 'https://dazzling-horse-f6d13a.netlify.app/.netlify/functions/push';
  function apPaint() {
    var b = $('#apBtn'); if (!b) return;
    b.textContent = 'Comptes à approuver' + (AP.items.length ? ' (' + AP.items.length + ')' : '');
  }
  /* approbation automatique : les comptes créés pendant la période activée sont acceptés tout seuls */
  function apAutoPaint() {
    var b = $('#apAuto'); if (!b) return;
    b.setAttribute('aria-pressed', AP.auto ? 'true' : 'false');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><path d="M13 3L5 13.500h6L10 21l8-10.500h-6z"/></svg>'; b.appendChild(document.createTextNode(AP.auto ? 'Approbation automatique : activée (touche pour arrêter)' : 'Approbation automatique : désactivée'));
  }
  function apStrictPaint() {
    var b = $('#apStrict'); if (!b) return;
    b.setAttribute('aria-pressed', AP.strict ? 'true' : 'false');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'; b.appendChild(document.createTextNode(AP.strict ? 'Mode strict : activé (touche pour désactiver)' : 'Mode strict : désactivé'));
  }
  $('#apStrict').addEventListener('click', function () {
    if (!creatorOn()) return;
    var on = !AP.strict, b = this;
    if (on && !confirm('Activer le mode strict ? Tout compte SANS approbation enregistrée sera bloqué. Lance d’abord « Approuver les comptes existants ».')) return;
    b.disabled = true;
    fs.collection('settings').doc('approval').set({ strict: on, strictBy: state.me, strictAt: Date.now() }, { merge: true })
      .catch(function () { showToast(null, 'Mode strict', 'Impossible : règles Firestore (écriture de « settings/approval »).'); })
      .then(function () { b.disabled = false; });
  });
  $('#apMig').addEventListener('click', async function () {
    if (!creatorOn()) return;
    var b = this, lbl = b.textContent; b.disabled = true; b.textContent = 'Migration…';
    try {
      var r = await Promise.all([fs.collection('usernames').get(), fs.collection('approvals').get()]);
      var have = {}, todo = [], seen = {};
      r[1].forEach(function (d) { have[d.id] = 1; });
      r[0].forEach(function (d) {
        var u = (d.data() || {}).uid;
        if (u && !have[u] && !seen[u]) { seen[u] = 1; todo.push({ uid: u, name: String(d.id).slice(0, 20) }); }
      });
      if (!have[state.me] && !seen[state.me]) todo.push({ uid: state.me, name: String(state.username || 'createur').slice(0, 20) });
      for (var i = 0; i < todo.length; i += 400) {
        var bt = fs.batch(), now = Date.now();
        todo.slice(i, i + 400).forEach(function (t) {
          bt.set(fs.collection('approvals').doc(t.uid), { name: t.name, status: 'approved', ts: now, by: state.me, ats: now, legacy: true });
        });
        await bt.commit();
      }
      b.textContent = todo.length + ' compte(s) approuvé(s) ✓';
    } catch (e) {
      b.textContent = 'Échec : publie d’abord les nouvelles règles Firestore';
    }
    setTimeout(function () { b.textContent = lbl; b.disabled = false; }, 4000);
  });
  function apAutoRun() {
    if (!AP.auto) return;
    AP.items.forEach(function (it) {
      if ((it.ts || 0) >= (AP.since || 0) && !AP.done[it.id]) { AP.done[it.id] = 1; apDecide(it.id, 'approved'); }
    });
  }
  $('#apAuto').addEventListener('click', function () {
    if (!creatorOn()) return;
    var on = !AP.auto, b = this; b.disabled = true;
    fs.collection('settings').doc('approval').set({ auto: on, since: Date.now(), by: state.me }, { merge: true })
      .catch(function () { showToast(null, 'Approbation auto', 'Impossible : règles Firestore (écriture de « settings/approval »).'); })
      .then(function () { b.disabled = false; });
  });
  function apCheck() {
    if (!state.me) return;
    if (!creatorOn()) {
      if (AP.unsub) { AP.unsub(); AP.unsub = null; }
      if (AP.setU) { AP.setU(); AP.setU = null; }
      AP.items = []; AP.auto = false; AP.done = {}; apPaint(); apAutoPaint(); return;
    }
    if (!AP.setU) {
      AP.setU = fs.collection('settings').doc('approval').onSnapshot(function (d) {
        var v = d.exists ? d.data() : {}, was = AP.auto;
        AP.auto = v.auto === true; AP.since = v.since || 0; AP.strict = v.strict === true; apStrictPaint();
        if (!AP.auto || !was) AP.done = {};
        apAutoPaint(); apAutoRun();
      }, function () {});
    }
    if (AP.unsub) return;
    AP.first = true;
    AP.unsub = fs.collection('approvals').where('status', '==', 'pending').onSnapshot(function (sn) {
      AP.items = sn.docs.map(function (d) { var v = d.data(); v.id = d.id; return v; }).sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      if (AP.first) { if (AP.items.length) showToast(null, 'Approbation', AP.items.length + ' compte' + (AP.items.length > 1 ? 's' : '') + ' en attente'); }
      else sn.docChanges().forEach(function (ch) {
        if (ch.type !== 'added') return;
        try { beep(); if (navigator.vibrate) navigator.vibrate(120); } catch (e) {}
        if (AP.auto && (ch.doc.data().ts || 0) >= (AP.since || 0)) return;
        showToast(null, 'Nouveau compte', cap(ch.doc.data().name || '') + ' attend ton approbation');
      });
      AP.first = false;
      apPaint(); apAutoRun();
      if (crDlg.open && CR.mode === 'ap') apRender();
    }, function () {});
  }
  function apDecide(id, st) {
    fs.collection('approvals').doc(id).update({ status: st, by: state.me, ats: Date.now() }).catch(function () { crErr('Action impossible (règles Firestore).'); });
  }
  function apRender() {
    var box = $('#crBody'); box.replaceChildren();
    if (!AP.items.length) { box.appendChild(el('p', 'hint', 'Aucun compte en attente.')); return; }
    AP.items.forEach(function (it) {
      var r = el('div', 'frrow aprow'), mid = el('div', 'frmid'), bx = el('div', 'frbtns');
      mid.appendChild(el('b', '', cap(it.name || '?')));
      mid.appendChild(el('small', '', it.ts ? new Date(it.ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''));
      var ok = el('button', 'ghost', 'Approuver'), okc = el('button', 'ghost', 'Approuver + certifier'), no = el('button', 'ghost', 'Refuser'); ok.type = okc.type = no.type = 'button';
      ok.addEventListener('click', function () { apDecide(it.id, 'approved'); });
      okc.addEventListener('click', function () {
        fs.collection('presence').doc(it.id).set({ verified: true }, { merge: true })
          .then(function () { apDecide(it.id, 'approved'); })
          .catch(function () { crErr('Certification impossible (règles Firestore).'); });
      });
      no.addEventListener('click', function () { apDecide(it.id, 'rejected'); });
      bx.appendChild(ok); bx.appendChild(okc); bx.appendChild(no); r.appendChild(mid); r.appendChild(bx); box.appendChild(r);
    });
  }
  function apStop() { if (AG.unsub) { AG.unsub(); AG.unsub = null; } var w = $('#apWait'); if (w) w.hidden = true; }
  function apStrict() { return Promise.resolve(false); }
  function apShow(user) { apStop(); startSession(user); }
  function approvalGate(user) {
    apStop(); apNew = false;
    if (!auth.currentUser || auth.currentUser.uid !== user.uid) return;
    startSession(user);
  }
  $('#apRetry').addEventListener('click', function () { if (auth.currentUser) approvalGate(auth.currentUser); });
  $('#apOut').addEventListener('click', function () { auth.signOut(); });

  var AUTH_SEEN = false;
  setTimeout(function () {
    if (AUTH_SEEN) return;
    var tried = false;
    try { tried = sessionStorage.getItem('uandi-authretry') === '1'; sessionStorage.setItem('uandi-authretry', '1'); } catch (e) {}
    if (!tried) { location.reload(); return; }
    loginEl.hidden = false;
    setAuthErr('Connexion impossible : le navigateur bloque le stockage du site. Quitte la navigation privée, ferme l’onglet puis rouvre le site.');
  }, 7000);



/* E'cho — js/app/27-push.js
   Notifications push (FCM via le Worker ui-push)
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- notifications push (FCM via le Worker « ui-push ») ---------- */
  var PUSH = { url: ((CFG.push || {}).workerUrl || '').replace(/\/+$/, ''), key: (CFG.push || {}).vapidKey || '', token: null };
  if (PUSH.url.indexOf('COLLE') !== -1) PUSH.url = '';
  function pushCall(path, body) {
    return auth.currentUser.getIdToken().then(function (tok) {
      return fetch(PUSH.url + path, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    });
  }
  function pushLoadMsg() {
    if (window.firebase && firebase.messaging) return Promise.resolve(true);
    return new Promise(function (ok) {
      var s = document.createElement('script');
      s.src = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js';
      s.onload = function () { ok(true); }; s.onerror = function () { ok(false); };
      setTimeout(function () { ok(false); }, 10000);
      document.head.appendChild(s);
    });
  }
  async function pushSetup() {
    PUSH.err = '';
    try {
      if (!PUSH.url || !PUSH.key) { PUSH.err = 'adresse du Worker ou clé VAPID manquante'; return; }
      if (!auth.currentUser) { PUSH.err = 'pas connecté'; return; }
      if (!('serviceWorker' in navigator) || !('Notification' in window)) { PUSH.err = 'navigateur sans notifications (ouvre dans Chrome / appli installée)'; return; }
      if (Notification.permission !== 'granted') { PUSH.err = 'permission notifications = ' + Notification.permission + ' (à autoriser dans les réglages du site)'; return; }
      if (!(await pushLoadMsg()) || !firebase.messaging.isSupported || !(await firebase.messaging.isSupported())) { PUSH.err = 'Firebase Messaging indisponible'; return; }
      var reg = await navigator.serviceWorker.register('firebase-messaging-sw.js');
      await navigator.serviceWorker.ready;
      var t = await firebase.messaging().getToken({ vapidKey: PUSH.key, serviceWorkerRegistration: reg });
      if (!t) { PUSH.err = 'jeton FCM vide'; return; }
      var r = await pushCall('/register', { token: t });
      if (!r.ok) { PUSH.err = 'le Worker a refusé l’enregistrement (HTTP ' + r.status + ')'; return; }
      PUSH.token = t;
    } catch (e) { PUSH.err = (e && (e.code || e.message)) || String(e); }
    finally { try { npPaint(); } catch (e2) {} }
  }
  function pushReport() {
    try { showToast(null, 'X\'enify', (PUSH.token ? 'Push OK ✅ jeton enregistré' : 'Push KO ❌ ' + PUSH.err) + (PUSH.lastSend ? ' · dernier envoi : ' + PUSH.lastSend : '')); } catch (e) {}
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('firebase-messaging-sw.js').catch(function () {});
  function pushUnreg() {
    if (!PUSH.token || !auth.currentUser) return Promise.resolve();
    var t = PUSH.token; PUSH.token = null;
    return Promise.race([pushCall('/unregister', { token: t }), new Promise(function (ok) { setTimeout(ok, 2500); })]).catch(function () {});
  }
  function pushNotify(chat, text) {
    try {
      if (!PUSH.url || !chat) return;
      var c = chatOf(chat.id) || {};
      var to = (c.members || [state.me, chat.other]).filter(function (u) { return u && u !== state.me; });
      if (!to.length) return;
      pushCall('/notify', { to: to, title: NOTIF_TITLE, body: cap(myName()) + ' : ' + text, chat: chat.id }).then(function (r) { PUSH.lastSend = 'message HTTP ' + r.status; }).catch(function (e) { PUSH.lastSend = 'message erreur ' + ((e && (e.code || e.message)) || e); });
    } catch (e) {}
  }
  function pushNews(text) {
    try {
      if (!PUSH.url || !auth.currentUser) return;
      /* fil certifiés : on prévient les comptes certifiés / assistants / créateur ; fil non certifiés : tous les autres */
      var certFeed = NW.col !== 'lettersN';
      var cq = ['verified', 'assistant', 'badge'].map(function (f) { return fs.collection('presence').where(f, '==', true).get().catch(function () { return null; }); });
      Promise.all([fs.collection('usernames').get()].concat(cq)).then(function (r) {
        if (r.slice(1).some(function (x) { return !x; })) return;
        var cert = {}; r.slice(1).forEach(function (sn) { sn.forEach(function (d) { cert[d.id] = 1; }); });
        var to = []; r[0].forEach(function (d) { var v = d.data(); if (v && typeof v.uid === 'string' && v.uid !== state.me && (!!cert[v.uid] === certFeed)) to.push(v.uid); });
        if (!to.length) return;
        return pushCall('/notify', { to: to, title: 'X\'enify \uD83D\uDCF0', body: 'Nouvelle lettre dans l\u2019actualit\u00e9 : ' + String(text || '').slice(0, 80), chat: 'news' })
          .then(function (r) { PUSH.lastSend = 'actualit\u00e9 HTTP ' + r.status; });
      }).catch(function (e) { PUSH.lastSend = 'actualit\u00e9 erreur ' + ((e && (e.code || e.message)) || e); });
    } catch (e) {}
  }
  auth.onAuthStateChanged(function (user) {
    AUTH_SEEN = true;
    if (user) setTimeout(pushSetup, 3000);
    try { sessionStorage.removeItem('uandi-authretry'); } catch (e) {}
    if (user) {
      approvalGate(user);
    } else {
      apStop();
      stopSession();
      appEl.hidden = true;
      loginEl.hidden = false;
      $('#p').value = ''; $('#p2').value = '';
      document.title = BASE_TITLE;
    }
  });



/* E'cho — js/app/28-recuperation-email.js
   E-mail de récupération (demande + confirmation par code) et « mot de passe oublié » par code envoyé par e-mail
   (fait partie de l’appli : assemblée par js/boot/loader.js dans une seule fermeture) */
  /* ---------- adresse du Worker « ui-recovery » ---------- */
  function emUrl() {
    var u = String(((CFG.recovery || {}).workerUrl) || '').replace(/\/+$/, '');
    return (!u || u.indexOf('COLLE') !== -1) ? '' : u;
  }
  function emCall(path, body, authed) {
    var url = emUrl();
    if (!url) return Promise.reject({ off: true });
    function go(tok) {
      var h = { 'Content-Type': 'application/json' };
      if (tok) h.Authorization = 'Bearer ' + tok;
      return fetch(url + path, { method: body === undefined ? 'GET' : 'POST', headers: h, body: body === undefined ? undefined : JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j._ok = r.ok; return j; }); });
    }
    return authed ? auth.currentUser.getIdToken().then(go) : go(null);
  }
  function emMsg(j) {
    var e = j && j.error;
    return e === 'wait' ? 'Attends une minute avant de demander un nouveau code.' :
      e === 'bad-email' ? 'Cette adresse e-mail n’est pas valide.' :
      e === 'taken' ? 'Cette adresse e-mail est déjà utilisée par un compte. Connecte-toi avec.' :
      e === 'rate' ? 'Trop d’essais. Réessaie dans quelques minutes.' :
      e === 'mail' ? 'Le message n’a pas pu être envoyé. Réessaie dans un instant.' :
      e === 'bad-code' ? 'Code incorrect ou expiré.' :
      e === 'weak' ? 'Le mot de passe doit faire au moins 6 caractères.' :
      e === 'auth' ? 'Session expirée : reconnecte-toi puis réessaie.' :
      'Une erreur est survenue. Vérifie ta connexion et réessaie.';
  }
  function emFail(e) { return (e && e.off) ? 'Cette fonction n’est pas encore activée.' : 'Pas de connexion au serveur. Réessaie.'; }

  /* ---------- mot de passe oublié : code par e-mail ---------- */
  function fmErr(t) { var e = $('#fmErr'); e.textContent = t || ''; e.hidden = !t; }
  function fmName() { return $('#fmU').value.trim().toLowerCase().replace(/\s+/g, ''); }
  function fmSendCode(resend) {
    var raw0 = $('#fmU').value.trim().toLowerCase();
    if (raw0.indexOf('@') > -1) {          /* e-mail saisi : on retrouve le compte, puis on envoie le code */
      fmErr(''); $('#fmSend').disabled = true;
      emCall('/login/resolve', { email: raw0 }, false).then(function (j) {
        if (j && j._ok && j.username) { $('#fmU').value = j.username; fmSendCode2(resend); }
        else fmErr(j && j.error === 'rate' ? 'Trop d’essais. Réessaie dans quelques minutes.' : 'Aucun compte avec cet e-mail.');
      }).catch(function (e) { fmErr(emFail(e)); }).then(function () { $('#fmSend').disabled = false; });
      return;
    }
    fmSendCode2(resend);
  }
  function fmSendCode2(resend) {
    var n = fmName(), b = resend ? $('#fmResend') : $('#fmSend');
    fmErr('');
    if (!NAME_RE.test(n)) { fmErr('Entre ton nom d’utilisateur.'); return; }
    b.disabled = true;
    emCall('/forgot/start', { username: n }, false).then(function (j) {
      if (!j._ok) { fmErr(emMsg(j)); return; }
      $('#fmInfo').textContent = 'Si ce compte a un e-mail de récupération, un code à 6 chiffres vient d’y être envoyé. Il est valable 10 minutes.';
      $('#fmStep2').hidden = false; $('#fmSend').hidden = true; $('#fmU').readOnly = true;
      $('#fmNone').hidden = false;
      setTimeout(function () { $('#fmC').focus(); }, 50);
    }).catch(function (e) { fmErr(emFail(e)); }).then(function () { b.disabled = false; });
  }
  $('#fmSend').addEventListener('click', function () { fmSendCode(false); });
  $('#fmResend').addEventListener('click', function () { fmSendCode(true); });
  $('#forgotMail').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var n = fmName(), code = $('#fmC').value.replace(/\D/g, ''), p1 = $('#fmP').value, p2 = $('#fmP2').value, b = $('#fmGo');
    fmErr('');
    if ($('#fmStep2').hidden) { fmSendCode(false); return; }
    if (code.length !== 6) { fmErr('Entre le code à 6 chiffres reçu par e-mail.'); return; }
    if (p1.length < 6) { fmErr('Le mot de passe doit faire au moins 6 caractères.'); return; }
    if (p1 !== p2) { fmErr('Les deux mots de passe ne sont pas identiques.'); return; }
    b.disabled = true;
    emCall('/forgot/reset', { username: n, code: code, password: p1 }, false).then(function (j) {
      if (!j._ok) { fmErr(emMsg(j)); return; }
      /* mot de passe changé : on connecte directement la personne avec le nouveau */
      return SB.auth.signInWithPassword({ email: n + '@' + CFG.emailDomain, password: p1 }).then(function (r) { if (r.error) throw r.error; }).then(function () {
        /* l’ancien code de récupération (qui contenait l’ancien mot de passe) n’est plus valable */
        Promise.resolve(SB.from('recovery').delete().eq('username', n)).catch(function () {});
        fmReset();
      }).catch(function () {
        fmReset(); forgotShow(null); setAuthErr('Mot de passe changé. Connecte-toi avec le nouveau.');
      });
    }).catch(function (e) { fmErr(emFail(e)); }).then(function () { b.disabled = false; });
  });
  function fmReset() {
    ['#fmU', '#fmC', '#fmP', '#fmP2'].forEach(function (s) { $(s).value = ''; });
    $('#fmU').readOnly = false; $('#fmStep2').hidden = true; $('#fmSend').hidden = false; $('#fmNone').hidden = true; fmErr('');
  }

  /* ---------- e-mail de récupération : ajout + confirmation par code ---------- */
  var emDlg = $('#emDlg'), emStep = 1, emPending = '';
  function emErr(t) { var e = $('#emErr'); e.textContent = t || ''; e.hidden = !t; }
  function emOpen() {
    emStep = 1; emPending = '';
    $('#emStep1').hidden = false; $('#emStep2').hidden = true;
    $('#emInput').value = ''; $('#emCode').value = ''; $('#emGo').textContent = 'Envoyer le code'; $('#emGo').disabled = false;
    emErr('');
    if (!emDlg.open) emDlg.showModal();
    setTimeout(function () { $('#emInput').focus(); }, 60);
  }
  function emSkipSet() { try { store('uandi-emskip-' + state.me, String(Date.now())); } catch (e) {} }
  $('#emOpen').addEventListener('click', emOpen);
  $('#emLater').addEventListener('click', function () { emSkipSet(); emDlg.close(); });
  emDlg.addEventListener('click', function (e) { if (e.target === emDlg) { emSkipSet(); emDlg.close(); } });
  $('#emGo').addEventListener('click', function () {
    var b = $('#emGo'); emErr('');
    if (emStep === 1) {
      var mail = $('#emInput').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { emErr('Entre une adresse e-mail valide.'); return; }
      b.disabled = true;
      emCall('/email/start', { email: mail }, true).then(function (j) {
        if (!j._ok) { emErr(emMsg(j)); return; }
        emStep = 2; emPending = mail;
        $('#emStep1').hidden = true; $('#emStep2').hidden = false;
        $('#emSent').textContent = 'Un code à 6 chiffres vient d’être envoyé à ' + mail + '. Regarde aussi dans les courriers indésirables.';
        b.textContent = 'Confirmer';
        setTimeout(function () { $('#emCode').focus(); }, 60);
      }).catch(function (e) { emErr(emFail(e)); }).then(function () { b.disabled = false; });
    } else {
      var code = $('#emCode').value.replace(/\D/g, '');
      if (code.length !== 6) { emErr('Entre le code à 6 chiffres.'); return; }
      b.disabled = true;
      emCall('/email/confirm', { code: code }, true).then(function (j) {
        if (!j._ok) { emErr(emMsg(j)); return; }
        emDlg.close(); emRefresh();
        try { showToast(null, 'X\'enify', 'E-mail de récupération enregistré ✅'); } catch (e) {}
      }).catch(function (e) { emErr(emFail(e)); }).then(function () { b.disabled = false; });
    }
  });
  $('#emDel').addEventListener('click', function () {
    if (!window.confirm('Retirer ton e-mail de récupération ? Tu ne pourras plus recevoir de code par e-mail.')) return;
    emCall('/email/remove', {}, true).then(function () { emRefresh(); }).catch(function () {});
  });

  /* section des réglages */
  function emRefresh() {
    var sec = $('#emSec');
    if (!emUrl()) { sec.hidden = true; return Promise.resolve(null); }
    sec.hidden = false;
    if (!auth.currentUser) return Promise.resolve(null);
    return emCall('/email/status', undefined, true).then(function (j) {
      if (!j._ok) { $('#emStat').textContent = 'Indisponible pour le moment.'; return null; }
      $('#emStat').textContent = j.has ? 'E-mail enregistré : ' + j.masked : 'Aucun e-mail de récupération.';
      $('#emOpen').textContent = j.has ? 'Changer l’e-mail' : 'Ajouter un e-mail';
      $('#emDel').hidden = !j.has;
      return j;
    }).catch(function () { $('#emStat').textContent = 'Indisponible pour le moment.'; return null; });
  }

  /* demande automatique après la connexion (pas plus d’une fois tous les 3 jours si « Plus tard ») */
  auth.onAuthStateChanged(function (user) {
    if (!user) return;
    setTimeout(function () {
      if (!emUrl() || appEl.hidden || !auth.currentUser || auth.currentUser.uid !== user.uid) return;
      emRefresh().then(function (j) {
        if (!j || j.has || document.querySelector('dialog[open]')) return;
        var last = +(store('uandi-emskip-' + user.uid) || 0);
        if (Date.now() - last < 3 * 24 * 3600 * 1000) return;
        emOpen();
      });
    }, 4500);
  });



};
