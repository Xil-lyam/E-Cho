// X'enify : fonction Supabase « push » — envoie une notification push aux destinataires d'un message.
// Secrets à définir (Supabase > Edge Functions > Secrets) : VAPID_PUBLIC, VAPID_PRIVATE.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import webpush from "npm:web-push@3.6.7";

const SB_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
webpush.setVapidDetails("mailto:contact@u-and-i.app", Deno.env.get("VAPID_PUBLIC") || "", Deno.env.get("VAPID_PRIVATE") || "");
const SYS = "\u2063";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (code: number, txt = "") => new Response(txt, { status: code, headers: CORS });

// deno-lint-ignore no-explicit-any
async function rest(path: string, opt: any = {}): Promise<any> {
  const r = await fetch(SB_URL + "/rest/v1/" + path, {
    ...opt, headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error("supabase " + r.status);
  return r.status === 204 ? null : r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return out(204);
  if (req.method !== "POST") return out(405);
  if (!SB_URL || !SB_KEY) return out(500, "not configured");
  try {
    const { token, chatId } = await req.json();
    if (!token || !chatId || !/^[0-9a-f-]{36}$/i.test(chatId)) return out(400, "bad request");
    const ur = await fetch(SB_URL + "/auth/v1/user", { headers: { apikey: SB_KEY, Authorization: "Bearer " + token } });
    if (!ur.ok) return out(401, "error");
    const uid = (await ur.json()).id;

    // deno-lint-ignore no-explicit-any
    const members = (await rest("conversation_members?select=user_id&conversation_id=eq." + chatId)).map((m: any) => m.user_id);
    if (!members.includes(uid)) return out(403, "forbidden");

    const last = (await rest("messages?select=*&conversation_id=eq." + chatId + "&order=id.desc&limit=1"))[0];
    if (!last) return out(200, "none");
    const from = last.sender_id || last.user_id || last.uid || last.from_uid;
    const ts = Date.parse(last.created_at || last.ts || "") || 0;
    if ((from && from !== uid) || (ts && Date.now() - ts > 120000)) return out(200, "stale");
    const raw = String(last.body || "");
    if (raw.charAt(0) === SYS) return out(200, "system");

    const conv = (await rest("conversations?select=*&id=eq." + chatId))[0] || {};
    const isGroup = conv.kind === "group";
    const prof = (await rest("profiles?select=username,name,nick&id=eq." + uid))[0] || {};
    const sender = prof.username || prof.name || "X\u2019enify";
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    const text = (raw || (last.audio ? "\u{1F3A4} Message vocal" : last.img ? "\u{1F4F7} Photo" : last.file ? "\u{1F4CE} Fichier" : "Nouveau message")).slice(0, 120);
    const title = isGroup ? (conv.title || conv.name || "Groupe") : cap(sender);
    const bodyTxt = isGroup ? sender + " : " + text : text;
    const payload = JSON.stringify({ title, body: bodyTxt, tag: chatId, url: "./" });

    const others = members.filter((m: string) => m !== uid);
    let sent = 0;
    if (others.length) {
      const subs = await rest("push_subs?select=uid,token,data&uid=in.(" + others.join(",") + ")");
      for (const s of subs) {
        try {
          await webpush.sendNotification(s.data.sub, payload, { TTL: 3600, urgency: "high" });
          sent++;
        } catch (e) {
          // deno-lint-ignore no-explicit-any
          const sc = (e as any).statusCode;
          if (sc === 404 || sc === 410) {
            await rest("push_subs?uid=eq." + s.uid + "&token=eq." + encodeURIComponent(s.token), { method: "DELETE" }).catch(() => {});
          }
        }
      }
    }
    return out(200, "ok " + sent);
  } catch (_e) {
    return out(401, "error");
  }
});
