// X'enify : fonction Supabase « turn » — donne les serveurs relais d'appel aux personnes connectées.
// Secrets : TURN_USERNAME, TURN_CREDENTIAL, facultatif TURN_HOST (défaut global.relay.metered.ca).
const SB_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const user = Deno.env.get("TURN_USERNAME"), cred = Deno.env.get("TURN_CREDENTIAL");
  const J = (o: unknown, code = 200) => new Response(JSON.stringify(o), { status: code, headers: { ...CORS, "Content-Type": "application/json" } });
  if (!user || !cred) return J({ iceServers: [] });
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!tok) return J({}, 401);
  try {
    const r = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + tok } });
    if (!r.ok) return J({}, 401);
  } catch (_e) { return J({}, 502); }
  const h = Deno.env.get("TURN_HOST") || "global.relay.metered.ca";
  return J({ iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    { urls: ["turn:" + h + ":80", "turn:" + h + ":80?transport=tcp", "turn:" + h + ":443", "turns:" + h + ":443?transport=tcp"], username: user, credential: cred },
  ] });
});
