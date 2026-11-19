/* U&I : envoie une notification push aux destinataires d'un message. */
const admin = require('firebase-admin');
const webpush = require('web-push');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
webpush.setVapidDetails('mailto:contact@u-and-i.app', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
const db = admin.firestore();
const SYS = '\u2063';

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: cors, body: '' };

  try {
    const { token, chatId } = JSON.parse(event.body || '{}');
    if (!token || !chatId) return { statusCode: 400, headers: cors, body: 'bad request' };
    const uid = (await admin.auth().verifyIdToken(token)).uid;

    const snap = await db.collection('chats').doc(chatId).get();
    if (!snap.exists) return { statusCode: 404, headers: cors, body: 'no chat' };
    const c = snap.data();
    if (!(c.members || []).includes(uid)) return { statusCode: 403, headers: cors, body: 'forbidden' };
    if (c.lastUid !== uid || Date.now() - (c.lastTs || 0) > 120000) return { statusCode: 200, headers: cors, body: 'stale' };
    if (String(c.lastText || '').charAt(0) === SYS) return { statusCode: 200, headers: cors, body: 'system' };

    const sender = (c.names && c.names[uid]) || 'X’enify';
    const title = c.group ? (c.title || 'Groupe') : sender.charAt(0).toUpperCase() + sender.slice(1);
    const text = String(c.lastText || '').slice(0, 120);
    const body = c.group ? sender + ' : ' + text : text;
    const payload = JSON.stringify({ title, body, tag: chatId, url: './' });

    let sent = 0;
    for (const to of (c.members || []).filter((m) => m !== uid)) {
      const ref = db.collection('pushSubs').doc(to);
      const d = await ref.get();
      if (!d.exists) continue;
      const subs = d.data().subs || {};
      for (const key of Object.keys(subs)) {
        try {
          await webpush.sendNotification(JSON.parse(subs[key]), payload, { TTL: 3600, urgency: 'high' });
          sent++;
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await ref.update({ ['subs.' + key]: admin.firestore.FieldValue.delete() }).catch(() => {});
          }
        }
      }
    }
    return { statusCode: 200, headers: cors, body: 'ok ' + sent };
  } catch (e) {
    return { statusCode: 401, headers: cors, body: 'error' };
  }
};
