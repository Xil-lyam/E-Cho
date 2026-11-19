/* X'enify : envoie une notification push aux destinataires d'un message (version Supabase).
   Variables Netlify à définir : SUPABASE_URL, SUPABASE_SERVICE_KEY (clé « service_role », secrète),
   VAPID_PUBLIC, VAPID_PRIVATE, et facultatif ALLOW_ORIGIN. */
const webpush = require('web-push');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
webpush.setVapidDetails('mailto:contact@u-and-i.app', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
const SYS = '⁣';

async function rest(path, opt) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, Object.assign({
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' }
  }, opt || {}));
  if (!r.ok) throw new Error('supabase ' + r.status);
  return r.status === 204 ? null : r.json();
}

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: '' };
  if (!SB_URL || !SB_KEY) return { statusCode: 500, headers: cors, body: 'not configured' };

  try {
    const { token, chatId } = JSON.parse(event.body || '{}');
    if (!token || !chatId || !/^[0-9a-f-]{36}$/i.test(chatId)) return { statusCode: 400, headers: cors, body: 'bad request' };

    /* qui appelle ? on demande à Supabase de vérifier le jeton */
    const ur = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + token } });
    if (!ur.ok) return { statusCode: 401, headers: cors, body: 'error' };
    const uid = (await ur.json()).id;

    const members = (await rest('conversation_members?select=user_id&conversation_id=eq.' + chatId)).map((m) => m.user_id);
    if (!members.includes(uid)) return { statusCode: 403, headers: cors, body: 'forbidden' };

    /* dernier message : doit être récent et venir de l'appelant */
    const last = (await rest('messages?select=*&conversation_id=eq.' + chatId + '&order=id.desc&limit=1'))[0];
    if (!last) return { statusCode: 200, headers: cors, body: 'none' };
    const from = last.sender_id || last.user_id || last.uid || last.from_uid;
    const ts = Date.parse(last.created_at || last.ts || '') || 0;
    if ((from && from !== uid) || (ts && Date.now() - ts > 120000)) return { statusCode: 200, headers: cors, body: 'stale' };
    const raw = String(last.body || '');
    if (raw.charAt(0) === SYS) return { statusCode: 200, headers: cors, body: 'system' };

    const conv = (await rest('conversations?select=*&id=eq.' + chatId))[0] || {};
    const isGroup = conv.kind === 'group';
    const prof = (await rest('profiles?select=username,name,nick&id=eq.' + uid))[0] || {};
    const sender = prof.username || prof.name || 'X’enify';
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const text = (raw || (last.audio ? '🎤 Message vocal' : last.img ? '📷 Photo' : last.file ? '📎 Fichier' : 'Nouveau message')).slice(0, 120);
    const title = isGroup ? (conv.title || conv.name || 'Groupe') : cap(sender);
    const body = isGroup ? sender + ' : ' + text : text;
    const payload = JSON.stringify({ title, body, tag: chatId, url: './' });

    const others = members.filter((m) => m !== uid);
    let sent = 0;
    if (others.length) {
      const subs = await rest('push_subs?select=uid,token,data&uid=in.(' + others.join(',') + ')');
      for (const s of subs) {
        try {
          await webpush.sendNotification(s.data.sub, payload, { TTL: 3600, urgency: 'high' });
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await rest('push_subs?uid=eq.' + s.uid + '&token=eq.' + encodeURIComponent(s.token), { method: 'DELETE' }).catch(() => {});
          }
        }
      }
    }
    return { statusCode: 200, headers: cors, body: 'ok ' + sent };
  } catch (e) {
    return { statusCode: 401, headers: cors, body: 'error' };
  }
};
