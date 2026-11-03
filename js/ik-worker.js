/* Cloudflare Worker — signe les envois ImageKit (la clé privée reste ici, jamais dans l'app)
   Variables à créer dans Cloudflare > Worker > Settings > Variables :
     IK_PRIVATE_KEY  (type « Secret »)  = ta clé privée ImageKit
     ALLOW_ORIGIN    (texte)            = l'adresse de ton site, ex. https://ton-site.com  */
export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cache-Control': 'no-store'
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 1800;      // valable 30 min (maximum accepté : 1 h)
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.IK_PRIVATE_KEY),
      { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token + expire));
    const signature = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
    return new Response(JSON.stringify({ token, expire, signature }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
};
