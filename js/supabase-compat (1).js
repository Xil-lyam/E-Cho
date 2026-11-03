/* supabase-compat.js
 * Imite l'API Firebase (auth + firestore, version "compat") au-dessus de Supabase,
 * pour que script.js continue de fonctionner presque sans changement.
 * Nécessite @supabase/supabase-js v2 chargé avant (window.supabase).
 * Limites connues : les batch et transactions ne sont PAS atomiques
 * (écritures envoyées l'une après l'autre) ; les notifications push (firebase.messaging)
 * ne sont pas encore reprises.
 */
(function () {
  'use strict';

  var sb = null, curUser = null;

  /* ---------- utilitaires ---------- */
  function snake(s) { return s.replace(/[A-Z]/g, function (c) { return '_' + c.toLowerCase(); }); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function isPlain(v) { return Object.prototype.toString.call(v) === '[object Object]' && !(v instanceof FV); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }
  function fail(error) {
    var msg = (error && error.message) || String(error), code = (error && error.code) || '', c = 'unknown';
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) c = 'permission-denied';
    else if (code === '23505') c = 'already-exists';
    else if (code === 'PGRST116') c = 'not-found';
    else if (/failed to fetch|network/i.test(msg)) c = 'unavailable';
    var e = new Error(msg); e.code = c; e.pgCode = code; return e;
  }

  /* ---------- sentinelles FieldValue ---------- */
  function FV(kind, arg) { this.kind = kind; this.arg = arg; }
  var DEL = { __del: true };
  var FieldValue = {
    delete: function () { return new FV('delete'); },
    serverTimestamp: function () { return new FV('ts'); },
    increment: function (n) { return new FV('inc', n); },
    arrayUnion: function () { return new FV('union', [].slice.call(arguments)); },
    arrayRemove: function () { return new FV('remove', [].slice.call(arguments)); }
  };
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function applyFV(fv, old) {
    switch (fv.kind) {
      case 'delete': return DEL;
      case 'ts': return Date.now();
      case 'inc': return (typeof old === 'number' ? old : 0) + fv.arg;
      case 'union':
        var u = Array.isArray(old) ? old.slice() : [];
        fv.arg.forEach(function (x) { if (!u.some(function (y) { return same(x, y); })) u.push(x); });
        return u;
      case 'remove':
        return (Array.isArray(old) ? old : []).filter(function (y) { return !fv.arg.some(function (x) { return same(x, y); }); });
    }
  }
  function resolveVal(v, old) {
    if (v instanceof FV) return applyFV(v, old);
    if (Array.isArray(v)) return v.map(function (x) { return resolveVal(x); });
    if (isPlain(v)) {
      var o = {};
      Object.keys(v).forEach(function (k) {
        if (v[k] === undefined) return;
        var r = resolveVal(v[k], old && old[k]);
        if (r !== DEL) o[k] = r;
      });
      return o;
    }
    return v;
  }
  function mergeInto(base, patch) {
    var out = clone(base) || {};
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      if (v === undefined) return;
      if (v instanceof FV) { var r = applyFV(v, out[k]); if (r === DEL) delete out[k]; else out[k] = r; }
      else if (isPlain(v) && isPlain(out[k])) out[k] = mergeInto(out[k], v);
      else out[k] = resolveVal(v, out[k]);
    });
    return out;
  }
  function setPath(obj, parts, v) {
    var o = obj, i;
    for (i = 0; i < parts.length - 1; i++) {
      if (!isPlain(o[parts[i]])) o[parts[i]] = {};
      o = o[parts[i]];
    }
    var last = parts[parts.length - 1], r = resolveVal(v, o[last]);
    if (r === DEL) delete o[last]; else o[last] = r;
  }

  /* ---------- correspondance collections -> tables ---------- */
  var T = {
    settings: { t: 'app_settings', pk: 'id', whole: true },
    announce: { t: 'announcements', pk: 'id', whole: true },
    approvals: { t: 'approvals', pk: 'uid', cols: ['name', 'status', 'ts', 'auto', 'ats', 'legacy', 'by'], alias: { by: 'by_uid' }, nodata: true },
    bans: { t: 'bans', pk: 'uid', cols: ['until'], alias: { until: 'until_ms' } },
    usernames: { t: 'usernames', pk: 'name', cols: ['uid'], nodata: true },
    presence: { t: 'presence', pk: 'uid', cols: ['badge', 'verified', 'assistant', 'photo'] },
    friendships: { t: 'friendships', pk: 'id', cols: ['members', 'from', 'status', 'ats'], alias: { from: 'from_uid' } },
    chats: { t: 'chats', pk: 'id', cols: ['members', 'group', 'owner', 'title', 'photo'], alias: { group: 'is_group' } },
    'chats/messages': { t: 'messages', pk: 'id', parent: 'chat_id', cols: ['uid', 'text', 'ts', 'img', 'audio', 'likes', 'reacts'] },
    'chats/live': { t: 'chat_live', pk: 'id', parent: 'chat_id', cols: [] },
    'chats/liveSig': { t: 'chat_live_sig', pk: 'id', parent: 'chat_id', cols: ['from'], alias: { from: 'from_uid' } },
    recovery: { t: 'recovery', pk: 'uname', cols: ['salt', 'iv', 'ct', 'uid'], nodata: true },
    profileLikes: { t: 'profile_likes', pk: 'id', cols: ['from', 'to'], alias: { from: 'from_uid', to: 'to_uid' } },
    letters: { t: 'letters', pk: 'id', cols: ['text', 'ts', 'likes', 'reports', 'reacts', 'cc', 'pin'] },
    lettersN: { t: 'letters_n', pk: 'id', cols: ['text', 'ts', 'likes', 'reports', 'reacts', 'cc', 'pin'] },
    'letters/comments': { t: 'letter_comments', pk: 'id', parent: 'letter_id', cols: ['text', 'kind', 'uid', 'reacts'] },
    'lettersN/comments': { t: 'letters_n_comments', pk: 'id', parent: 'letter_id', cols: ['text', 'kind', 'uid', 'reacts'] },
    letterOwners: { t: 'letter_owners', pk: 'id', cols: ['uid', 'letter'], alias: { letter: 'letter_id' } },
    anonProfiles: { t: 'anon_profiles', pk: 'uid', cols: [] },
    anonThreads: { t: 'anon_threads', pk: 'id', cols: ['a', 'b', 'members', 'addr', 'lastText', 'lastTs', 'lastUid'] },
    'anonThreads/messages': { t: 'anon_messages', pk: 'id', parent: 'thread_id', cols: ['uid', 'text'] },
    anonRequests: { t: 'anon_requests', pk: 'id', cols: ['addr'] },
    pushSubs: { t: 'push_subs', pk: 'uid', cols: ['subs'], nodata: true },
    aiMemory: { t: 'ai_memory', pk: 'uid', cols: ['url', 't'], nodata: true },
    sharedMusic: { t: 'shared_music', pk: 'id', cols: ['uid', 'url', 'pub'] },
    truthDareRooms: { t: 'truth_dare_rooms', pk: 'id', cols: ['creator', 'status', 'createdAt', 'certOnly'] }
  };
  Object.keys(T).forEach(function (k) {
    var s = T[k]; s.key = k; s.f2c = {}; s.c2f = {};
    (s.cols || []).forEach(function (f) {
      var c = (s.alias && s.alias[f]) || snake(f);
      s.f2c[f] = c; s.c2f[c] = f;
    });
  });
  function spec(key) {
    if (!T[key]) throw new Error('Collection inconnue pour Supabase : ' + key);
    return T[key];
  }
  function colFor(sp, f, forOrder) {
    if (f === 'id' || f === '__name__') return sp.pk;
    if (sp.f2c[f]) return sp.f2c[f];
    return (forOrder ? 'data->' : 'data->>') + f;
  }
  function toRow(sp, view) {
    var row = {}, data = {};
    if (sp.whole) { row.data = view; return row; }
    Object.keys(view).forEach(function (k) {
      var v = view[k];
      if (v === undefined) return;
      if (sp.f2c[k]) row[sp.f2c[k]] = v; else data[k] = v;
    });
    if (!sp.nodata) row.data = data;
    return row;
  }
  function fromRow(sp, row) {
    if (sp.whole) return clone(row.data || {});
    var o = clone(row.data || {});
    Object.keys(sp.c2f).forEach(function (c) {
      if (c in row && row[c] !== null) o[sp.c2f[c]] = row[c];
    });
    return o;
  }

  /* ---------- snapshots ---------- */
  function DocSnap(ref, row) {
    this.id = ref.id; this.ref = ref; this.exists = !!row;
    this._d = row ? fromRow(ref._sp, row) : undefined;
    this.metadata = { fromCache: false, hasPendingWrites: false };
  }
  DocSnap.prototype.data = function () { return this._d === undefined ? undefined : clone(this._d); };
  DocSnap.prototype.get = function (f) {
    var o = this._d; if (!o) return undefined;
    var p = String(f).split('.'), i;
    for (i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; }
    return o;
  };
  function QSnap(docs, prev) {
    this.docs = docs; this.size = docs.length; this.empty = !docs.length;
    this.metadata = { fromCache: false, hasPendingWrites: false };
    var self = this; self._prev = prev || {};
  }
  QSnap.prototype.forEach = function (fn) { this.docs.forEach(fn); };
  QSnap.prototype.docChanges = function () {
    var prev = this._prev, cur = {}, out = [], self = this;
    this.docs.forEach(function (d, i) {
      var j = JSON.stringify(d._d); cur[d.id] = j;
      if (!(d.id in prev)) out.push({ type: 'added', doc: d, newIndex: i, oldIndex: -1 });
      else if (prev[d.id] !== j) out.push({ type: 'modified', doc: d, newIndex: i, oldIndex: i });
    });
    Object.keys(prev).forEach(function (id) {
      if (!(id in cur)) out.push({ type: 'removed', doc: { id: id, exists: false, data: function () { return {}; } }, newIndex: -1, oldIndex: 0 });
    });
    return out;
  };
  function snapKey(snap) {
    var m = {}; snap.docs.forEach(function (d) { m[d.id] = JSON.stringify(d._d); }); return m;
  }

  /* ---------- écoute temps réel (refetch avec anti-rebond) ---------- */
  var listeners = {};
  function bump(table) { (listeners[table] || []).forEach(function (f) { f(); }); }
  function listen(table, rtFilter, fetchFn, onNext, onError) {
    var alive = true, timer = null, running = false, again = false, ch = null, last = null;
    function run() {
      if (!alive) return;
      if (running) { again = true; return; }
      running = true;
      fetchFn(last).then(function (snap) {
        if (!alive) return;
        last = snap;
        onNext(snap);
      }).catch(function (e) { if (alive && onError) onError(e); })
        .then(function () { running = false; if (again) { again = false; run(); } });
    }
    function sched() { clearTimeout(timer); timer = setTimeout(run, 120); }
    function onVis() { if (document.visibilityState === 'visible') sched(); }
    (listeners[table] = listeners[table] || []).push(sched);
    document.addEventListener('visibilitychange', onVis);
    run();
    try {
      var opt = { event: '*', schema: 'public', table: table };
      if (rtFilter) opt.filter = rtFilter;
      ch = sb.channel('rt-' + table + '-' + uuid()).on('postgres_changes', opt, sched);
      if (rtFilter) ch = ch.on('postgres_changes', { event: 'DELETE', schema: 'public', table: table }, sched);
      ch.subscribe();
    } catch (e) { /* sans temps réel : l'écoute se met à jour après chaque écriture locale */ }
    return function () {
      alive = false; clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      listeners[table] = (listeners[table] || []).filter(function (f) { return f !== sched; });
      if (ch) { try { sb.removeChannel(ch); } catch (e) {} }
    };
  }

  /* ---------- références de documents ---------- */
  function DocRef(sp, parentId, id, colName) {
    this._sp = sp; this._pid = parentId; this.id = id; this._col = colName;
    this.path = colName + '/' + id;
  }
  DocRef.prototype.collection = function (sub) {
    var key = this._col + '/' + sub;
    return new Query(spec(key), this.id, [], [], 0, sub);
  };
  DocRef.prototype._q = function (b) {
    b = b.eq(this._sp.pk, this.id);
    if (this._sp.parent) b = b.eq(this._sp.parent, this._pid);
    return b;
  };
  DocRef.prototype._fetch = function () {
    var self = this;
    return this._q(sb.from(this._sp.t).select('*')).limit(1).then(function (r) {
      if (r.error) throw fail(r.error);
      return new DocSnap(self, r.data && r.data[0]);
    });
  };
  DocRef.prototype.get = function () { return this._fetch(); };
  DocRef.prototype.onSnapshot = function (onNext, onError) {
    var self = this, f = this._sp.pk + '=eq.' + this.id;
    if (typeof onNext === 'object' && onNext) { onError = onNext.error; onNext = onNext.next; }
    return listen(this._sp.t, f, function () { return self._fetch(); }, onNext, onError);
  };
  DocRef.prototype._insert = function (view) {
    var sp = this._sp, row = toRow(sp, view);
    row[sp.pk] = this.id;
    if (sp.parent) row[sp.parent] = this._pid;
    return sb.from(sp.t).insert(row).then(function (r) { if (r.error) throw fail(r.error); });
  };
  DocRef.prototype._patch = function (view, onlyCols) {
    var sp = this._sp, row = onlyCols || toRow(sp, view);
    return this._q(sb.from(sp.t).update(row)).select(sp.pk).then(function (r) {
      if (r.error) throw fail(r.error);
      if (!r.data || !r.data.length) { var e = new Error('Mise à jour refusée ou document introuvable'); e.code = 'permission-denied'; throw e; }
    });
  };
  DocRef.prototype.set = function (obj, opts) {
    var self = this, sp = this._sp, p;
    if (opts && opts.merge) {
      p = this._fetch().then(function (s) {
        if (s.exists) return self._patch(mergeInto(s._d, obj));
        return self._insert(mergeInto({}, obj));
      });
    } else {
      var view = resolveVal(obj);
      p = this._insert(view).catch(function (e) {
        if (e.code === 'already-exists') return self._patch(view);
        throw e;
      });
    }
    return p.then(function () { bump(sp.t); });
  };
  DocRef.prototype.update = function (patch) {
    var self = this, sp = this._sp, keys = Object.keys(patch), needRead = !!sp.whole;
    keys.forEach(function (k) {
      var v = patch[k];
      if (k.indexOf('.') >= 0 || !sp.f2c[k]) needRead = true;
      if (v instanceof FV && (v.kind === 'inc' || v.kind === 'union' || v.kind === 'remove')) needRead = true;
    });
    var p;
    if (!needRead) {
      var cols = {};
      keys.forEach(function (k) {
        var r = resolveVal(patch[k]);
        cols[sp.f2c[k]] = (r === DEL ? null : r);
        if (patch[k] instanceof FV && patch[k].kind === 'delete') cols[sp.f2c[k]] = null;
      });
      p = this._patch(null, cols);
    } else {
      p = this._fetch().then(function (s) {
        if (!s.exists) { var e = new Error('Document introuvable'); e.code = 'not-found'; throw e; }
        var nv = clone(s._d);
        keys.forEach(function (k) { setPath(nv, k.split('.'), patch[k]); });
        return self._patch(nv);
      });
    }
    return p.then(function () { bump(sp.t); });
  };
  DocRef.prototype.delete = function () {
    var sp = this._sp;
    return this._q(sb.from(sp.t).delete()).then(function (r) {
      if (r.error) throw fail(r.error);
      bump(sp.t);
    });
  };

  /* ---------- requêtes / collections ---------- */
  function Query(sp, parentId, filters, orders, lim, name) {
    this._sp = sp; this._pid = parentId; this._f = filters; this._o = orders; this._l = lim; this._name = name;
    this.id = name; this.path = name;
  }
  Query.prototype._with = function (f, o, l) { return new Query(this._sp, this._pid, f, o, l, this._name); };
  Query.prototype.where = function (f, op, v) { return this._with(this._f.concat([[f, op, v]]), this._o, this._l); };
  Query.prototype.orderBy = function (f, dir) { return this._with(this._f, this._o.concat([[f, dir || 'asc']]), this._l); };
  Query.prototype.limit = function (n) { return this._with(this._f, this._o, n); };
  Query.prototype.doc = function (id) {
    return new DocRef(this._sp, this._pid, id || uuid(), this._name);
  };
  Query.prototype.add = function (obj) {
    var ref = this.doc(), sp = this._sp;
    return ref._insert(resolveVal(obj)).then(function () { bump(sp.t); return ref; });
  };
  Query.prototype._build = function () {
    var sp = this._sp, b = sb.from(sp.t).select('*');
    if (sp.parent) b = b.eq(sp.parent, this._pid);
    this._f.forEach(function (w) {
      var c = colFor(sp, w[0]), v = w[2], inData = c.indexOf('data->') === 0;
      switch (w[1]) {
        case '==': b = b.eq(c, v); break;
        case '!=': b = b.neq(c, v); break;
        case 'in': b = b.in(c, v); break;
        case 'array-contains': b = inData ? b.filter(c, 'cs', JSON.stringify([v])) : b.contains(c, [v]); break;
        case '>': b = b.gt(c, v); break;
        case '>=': b = b.gte(c, v); break;
        case '<': b = b.lt(c, v); break;
        case '<=': b = b.lte(c, v); break;
        default: throw new Error('Opérateur non pris en charge : ' + w[1]);
      }
    });
    this._o.forEach(function (o) { b = b.order(colFor(sp, o[0], true), { ascending: o[1] !== 'desc' }); });
    if (this._l) b = b.limit(this._l);
    return b;
  };
  Query.prototype._fetch = function (prevSnap) {
    var self = this;
    return this._build().then(function (r) {
      if (r.error) throw fail(r.error);
      var docs = (r.data || []).map(function (row) {
        return new DocSnap(new DocRef(self._sp, self._pid, row[self._sp.pk], self._name), row);
      });
      return new QSnap(docs, prevSnap ? snapKey(prevSnap) : {});
    });
  };
  Query.prototype.get = function () { return this._fetch(null); };
  Query.prototype.onSnapshot = function (onNext, onError) {
    var self = this, sp = this._sp;
    if (typeof onNext === 'object' && onNext) { onError = onNext.error; onNext = onNext.next; }
    var f = sp.parent ? sp.parent + '=eq.' + this._pid : null;
    return listen(sp.t, f, function (prev) { return self._fetch(prev); }, onNext, onError);
  };

  /* ---------- batch et transactions (non atomiques) ---------- */
  function Batch() { this._q = []; }
  Batch.prototype.set = function (r, d, o) { this._q.push(function () { return r.set(d, o); }); return this; };
  Batch.prototype.update = function (r, d) { this._q.push(function () { return r.update(d); }); return this; };
  Batch.prototype.delete = function (r) { this._q.push(function () { return r.delete(); }); return this; };
  Batch.prototype.commit = function () {
    var p = Promise.resolve();
    this._q.forEach(function (fn) { p = p.then(fn); });
    return p;
  };
  function Tx() { Batch.call(this); }
  Tx.prototype = Object.create(Batch.prototype);
  Tx.prototype.get = function (r) { return r.get(); };

  var fsApi = {
    collection: function (name) { return new Query(spec(name), null, [], [], 0, name); },
    batch: function () { return new Batch(); },
    runTransaction: function (fn) {
      var tx = new Tx();
      return Promise.resolve(fn(tx)).then(function (res) {
        return tx.commit().then(function () { return res; });
      });
    },
    enablePersistence: function () { return Promise.resolve(); },
    settings: function () {}
  };

  /* ---------- authentification ---------- */
  function authErr(error) {
    var m = (error && error.message) || '', c = (error && (error.code || error.error_code)) || '', code = 'auth/unknown';
    if (/not confirmed|email_not_confirmed/i.test(m + c)) code = 'auth/email-not-confirmed';
    else if (/invalid login|invalid_credentials|invalid credentials/i.test(m + c)) code = 'auth/invalid-credential';
    else if (/already|exists/i.test(m + c)) code = 'auth/email-already-in-use';
    else if (/weak|at least|password should/i.test(m + c)) code = 'auth/weak-password';
    else if (/rate|too many|over_/i.test(m + c) || (error && error.status === 429)) code = 'auth/too-many-requests';
    else if (/failed to fetch|network/i.test(m)) code = 'auth/network-request-failed';
    else if (/confirm|not allowed|signups/i.test(m)) code = 'auth/operation-not-allowed';
    else if (/invalid/i.test(m) && /email/i.test(m)) code = 'auth/invalid-email';
    var e = new Error(m); e.code = code; return e;
  }
  function wrapUser(u) {
    if (!u) return null;
    return {
      uid: u.id, email: u.email, username: ((u.user_metadata || {}).username || ''),
      getIdToken: function () {
        return sb.auth.getSession().then(function (r) { return r.data.session ? r.data.session.access_token : null; });
      },
      updatePassword: function (p) {
        return sb.auth.updateUser({ password: p }).then(function (r) { if (r.error) throw authErr(r.error); });
      },
      reauthenticateWithCredential: function (cred) {
        return sb.auth.signInWithPassword({ email: u.email, password: cred.password }).then(function (r) {
          if (r.error) throw authErr(r.error);
        });
      },
      delete: function () {
        return sb.rpc('delete_my_account').then(function (r) {
          if (r.error) throw authErr(r.error);
          return sb.auth.signOut();
        });
      }
    };
  }
  var authApi = {
    get currentUser() { return curUser; },
    onAuthStateChanged: function (cb) {
      var lastUid;
      var sub = sb.auth.onAuthStateChange(function (ev, session) {
        if (ev === 'TOKEN_REFRESHED' || ev === 'USER_UPDATED' || ev === 'PASSWORD_RECOVERY') return;
        var u = session && session.user ? session.user : null;
        if (u && (!curUser || curUser.uid !== u.id)) curUser = wrapUser(u);
        if (!u) curUser = null;
        var uid = u ? u.id : null;
        if (ev !== 'INITIAL_SESSION' && uid === lastUid) return;
        lastUid = uid;
        cb(curUser);
      });
      return function () { try { sub.data.subscription.unsubscribe(); } catch (e) {} };
    },
    signInWithEmailAndPassword: function (email, password) {
      return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
        if (r.error) throw authErr(r.error);
        curUser = wrapUser(r.data.user);
        return { user: curUser };
      });
    },
    createUserWithEmailAndPassword: function (email, password, username) {
      return sb.auth.signUp({
        email: email, password: password,
        options: { data: { username: username || '' }, emailRedirectTo: location.origin + location.pathname }
      }).then(function (r) {
        if (r.error) throw authErr(r.error);
        var u = r.data && r.data.user;
        /* e-mail déjà inscrit : Supabase renvoie un faux succès sans identité */
        if (u && u.identities && u.identities.length === 0) {
          var d = new Error('already registered'); d.code = 'auth/email-already-in-use'; throw d;
        }
        if (!r.data.session) return { user: null, pending: true };
        curUser = wrapUser(r.data.user);
        return { user: curUser };
      });
    },
    signOut: function () { return sb.auth.signOut(); },
    sendPasswordResetEmail: function (email) {
      return sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }).then(function (r) {
        if (r.error) throw authErr(r.error);
      });
    },
    usernameAvailable: function (name) {
      return sb.rpc('username_available', { uname: name }).then(function (r) {
        if (r.error) throw authErr(r.error);
        return r.data === true;
      });
    },
    onPasswordRecovery: function (cb) {
      sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') cb(); });
    },
    setNewPassword: function (p) {
      return sb.auth.updateUser({ password: p }).then(function (r) { if (r.error) throw authErr(r.error); });
    }
  };
  authApi.EmailAuthProvider = { credential: function (email, password) { return { email: email, password: password }; } };

  /* ---------- faux objet global "firebase" ---------- */
  function authFn() { return authApi; }
  authFn.EmailAuthProvider = authApi.EmailAuthProvider;
  function fsFn() { return fsApi; }
  fsFn.FieldValue = FieldValue;

  window.firebase = {
    initializeApp: function (cfg) {
      sb = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      window.sb = sb;
      sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session && !curUser) curUser = wrapUser(r.data.session.user);
      });
    },
    auth: authFn,
    firestore: fsFn
    /* firebase.messaging : volontairement absent (push à reprendre à l'étape 4) */
  };
})();
