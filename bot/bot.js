// bot/bot.js — publie une lettre anonyme écrite par une IA (Groq) dans Firestore
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
});
const db = admin.firestore();

// ⚠️ À ADAPTER : le nom de la collection et les champs doivent être
// exactement ceux que ton site utilise pour une vraie lettre anonyme.
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

const ANIMAUX = ["Renard", "Hibou", "Panda", "Loutre", "Lynx", "Colibri", "Koala", "Faucon", "Chat", "Dauphin"];
const ADJ = ["Discret", "Rêveur", "Curieux", "Timide", "Nocturne", "Malicieux", "Calme", "Secret", "Lunaire", "Sauvage"];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function derniersMessages() {
  try {
    const snap = await db.collection(COLLECTION).orderBy("createdAt", "desc").limit(15).get();
    return snap.docs.map((d) => d.data().text).filter(Boolean);
  } catch (e) {
    console.log("Impossible de lire les derniers messages :", e.message);
    return [];
  }
}

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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
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

async function main() {
  // Une fois sur quatre, on ne publie rien : l'horaire paraît moins régulier.
  if (Math.random() < 0.25) {
    console.log("Pas de publication cette fois.");
    return;
  }

  let text;
  try {
    text = await ecrireAvecIA(await derniersMessages());
  } catch (e) {
    console.log("IA indisponible, message de secours :", e.message);
    text = pick(SECOURS);
  }

  const name = `${pick(ANIMAUX)} ${pick(ADJ)} ${Math.floor(1000 + Math.random() * 9000)}`;

  // ⚠️ À ADAPTER : mêmes noms de champs que dans ton site.
  await db.collection(COLLECTION).add({
    text,
    authorName: name,
    anon: true,
    uid: "u_" + Math.random().toString(36).slice(2, 12), // faux identifiant
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    likes: 0,
  });
  console.log("Lettre publiée par", name, ":", text);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
