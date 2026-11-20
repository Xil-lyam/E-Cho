/* X'enify : donne les serveurs relais (TURN) aux personnes connectées, sans mettre les identifiants dans le code.
   Variables Netlify : SUPABASE_URL, SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_KEY), TURN_USERNAME, TURN_CREDENTIAL,
   facultatif TURN_HOST (défaut global.relay.metered.ca) et ALLOW_ORIGIN. */
exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': process.env.ALLOW_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };
  const base = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const user = process.env.TURN_USERNAME, cred = process.env.TURN_CREDENTIAL;
  if (!base || !key || !user || !cred) return { statusCode: 200, headers: cors, body: JSON.stringify({ iceServers: [] }) };
  const tok = ((event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')) || '';
  if (!tok) return { statusCode: 401, headers: cors, body: '' };
  try {
    const r = await fetch(base + '/auth/v1/user', { headers: { apikey: key, Authorization: 'Bearer ' + tok } });
    if (!r.ok) return { statusCode: 401, headers: cors, body: '' };
  } catch (e) { return { statusCode: 502, headers: cors, body: '' }; }
  const h = process.env.TURN_HOST || 'global.relay.metered.ca';
  return { statusCode: 200, headers: cors, body: JSON.stringify({ iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: ['turn:' + h + ':80', 'turn:' + h + ':80?transport=tcp', 'turn:' + h + ':443', 'turns:' + h + ':443?transport=tcp'], username: user, credential: cred }
  ] }) };
};
