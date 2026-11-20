// bot/bot.js — publie une lettre anonyme écrite par une IA (Groq) dans Supabase (table xdocs, collection « letters »).
// Secrets GitHub nécessaires : SUPABASE_URL, SUPABASE_SERVICE_KEY (clé service_role), GROQ_API_KEY.
const crypto = require("crypto");

// Collection des vraies lettres anonymes du site (vérifiée dans Firestore).
const COLLECTION = "letters";

// Modèle gratuit sur Groq. Si une erreur « model not found » apparaît, copie le
// nom d'un modèle texte depuis console.groq.com (page Models / Limits).
const MODEL = "openai/gpt-oss-120b";

// Plan B si l'IA ne répond pas : une petite liste de messages.
const SECOURS = [
  "Je n'ai jamais osé le dire, mais j'adore quand il pleut et que tout est calme.",
  "À celui qui m'a souri ce matin : tu ne le sais pas, mais ça a changé ma journée.",
  "Quelqu'un d'autre se dit « encore 5 minutes » depuis 3 heures ?",
  "Les meilleures conversations arrivent toujours à 2 h du matin.",
  "Petit rappel : tu fais mieux que ce que tu crois.",
];

const SUJETS = [
  "un petit secret du quotidien", "un crush qu'on n'ose pas avouer", "une amitié qui manque",
  "une pensée random de nuit", "un truc drôle arrivé aujourd'hui", "un regret léger",
  "une confession un peu honteuse mais mignonne", "une envie soudaine", "la fatigue du lundi",
  "un souvenir qui revient", "une chanson qu'on a en boucle", "un message qu'on n'a pas envoyé",
];

// Format des vrais alias du site : « Castor tranquille 20 », avec l'emoji de l'animal.
const ANIMAUX = [
  ["Castor", "🦫"], ["Lapin", "🐰"], ["Tigre", "🐯"], ["Renard", "🦊"], ["Hibou", "🦉"],
  ["Panda", "🐼"], ["Koala", "🐨"], ["Loup", "🐺"], ["Ours", "🐻"], ["Chat", "🐱"],
];
const ADJ = ["tranquille", "timide", "calme", "discret", "paisible", "drôle", "sage", "rapide", "brave", "solitaire"];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const masquer = (t) => String(t).replace(/[\w.+-]+@[\w.-]+/g, "<email>").slice(0, 300);

// ---------- Supabase (API REST, clé service_role : ignore les règles d'accès) ----------

const SB_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || "";

async function sb(chemin, opt) {
  const res = await fetch(SB_URL + "/rest/v1/" + chemin, Object.assign({
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
  }, opt || {}));
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status} - ${masquer(await res.text())}`);
  return res.status === 204 ? null : res.text().then((t) => (t ? JSON.parse(t) : null));
}

async function derniersMessages() {
  try {
    const rows = await sb(`xdocs?select=data&coll=eq.${COLLECTION}&order=ts.desc&limit=15`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    return (rows || []).map((r) => r.data && r.data.text).filter(Boolean);
  } catch (e) {
    console.log("Impossible de lire les derniers messages :", e.message);
    return [];
  }
}

async function publier(text) {
  const [animal, emoji] = pick(ANIMAUX);
  const alias = `${animal} ${pick(ADJ)} ${Math.floor(10 + Math.random() * 90)}`;
  const id = crypto.randomBytes(10).toString("hex");
  // Mêmes champs que les vraies lettres : alias, emoji, hue, likes, reports, text, ts.
  await sb("xdocs", {
    method: "POST",
    body: JSON.stringify({
      path: `${COLLECTION}/${id}`, coll: COLLECTION, id,
      data: { alias, emoji, hue: Math.floor(Math.random() * 360), likes: {}, reports: {}, text, ts: Date.now() },
    }),
  });
  console.log("Lettre créée :", id);
  return alias;
}

// ---------- IA ----------

async function ecrireAvecIA(recents) {
  const prompt =
    `Écris UNE lettre anonyme courte (1 à 3 phrases, 280 caractères maximum) comme en poste un jeune sur une appli sociale. ` +
    `Thème : ${pick(SUJETS)}. Ton naturel, spontané, en français, comme une vraie personne (pas de texte trop parfait). ` +
    `Pas de hashtags, au plus un emoji, aucun nom de personne réelle, ne parle jamais d'IA ni de bot. ` +
    `Rien de haineux, sexuel, violent, ni sur le suicide ou l'automutilation. ` +
    `Réponds uniquement avec le texte de la lettre, sans guillemets. ` +
    (recents.length ? `Ne répète pas et ne ressemble pas à ces lettres récentes :\n- ${recents.join("\n- ")}` : "");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 1.1,
      reasoning_effort: "low",
      max_completion_tokens: 800,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status} : ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Réponse vide");
  return text.replace(/^["«»\s]+|["«»\s]+$/g, "").slice(0, 400);
}

// ---------- Programme principal ----------

async function main() {
  if (!SB_URL || !SB_KEY) { console.error("SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant."); process.exit(1); }

  // Une fois sur quatre, on ne publie rien (seulement en mode automatique, pas en test manuel).
  if (process.env.GITHUB_EVENT_NAME === "schedule" && Math.random() < 0.25) {
    console.log("Pas de publication cette fois.");
    return;
  }

  let text;
  try {
    text = await ecrireAvecIA(await derniersMessages());
  } catch (e) {
    console.log("IA indisponible, message de secours :", masquer(e.message));
    text = pick(SECOURS);
  }

  const alias = await publier(text);
  console.log("Lettre publiée par", alias, ":", text);
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERREUR :", masquer(e.message)); process.exit(1); });
