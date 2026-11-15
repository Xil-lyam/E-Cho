// bot/bot.js — publie une lettre anonyme écrite par une IA (Groq) dans Firestore
// Version « REST » : pas de SDK Firestore, juste un jeton Google + l'API HTTP de Firestore.
const admin = require("firebase-admin");
const crypto = require("crypto");

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
const masquer = (t) => String(t).replace(/[\w.+-]+@[\w.-]+/g, "<email>").slice(0, 300);

// ---------- Clé Firebase ----------

// Répare la clé privée si elle a été abîmée au copier-coller (retours à la ligne,
// pied de clé modifié ou texte en trop). Le corps de la clé ne contient jamais de « - ».
function reparerCle(cle) {
  const sansEntete = String(cle)
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\s+/g, "");
  const corps = (sansEntete.match(/^[A-Za-z0-9+\/]+={0,2}/) || [""])[0];
  return `-----BEGIN PRIVATE KEY-----\n${corps.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
}

// L'e-mail du compte et le projet se retrouvent dans l'URL du certificat. Si le copier-coller
// a abîmé « client_email » ou « project_id », on les reconstruit à partir de là.
function reparerIdentite(compte) {
  const fin = String(compte.client_x509_cert_url || "").split("/").pop();
  let email = "";
  try { email = decodeURIComponent(fin); } catch (e) { /* on garde l'ancien */ }
  const m = email.match(/^[\w.+-]+@([\w-]+)\.iam\.gserviceaccount\.com$/);
  if (!m) return console.log("Identite : impossible de la reconstruire depuis l'URL du certificat.");
  console.log(`Identite : client_email ${compte.client_email === email ? "deja bon" : "CORRIGE"}, project_id ${compte.project_id === m[1] ? "deja bon" : "CORRIGE"}`);
  compte.client_email = email;
  compte.project_id = m[1];
}

// Compare ta clé privée à la clé publique que Google a enregistrée (affiche seulement OUI/NON).
async function verifierContreGoogle(compte) {
  try {
    const certs = await (await fetch(compte.client_x509_cert_url)).json();
    const cert = certs[compte.private_key_id];
    if (!cert) return console.log("VERDICT : Google ne connait PAS cette cle (supprimee/desactivee). Genere une nouvelle cle.");
    const donnees = Buffer.from("test");
    const signature = crypto.sign("RSA-SHA256", donnees, crypto.createPrivateKey(compte.private_key));
    const ok = crypto.verify("RSA-SHA256", donnees, new crypto.X509Certificate(cert).publicKey, signature);
    console.log(ok ? "VERDICT : la cle privee correspond a Google." : "VERDICT : la cle privee ne correspond PAS a Google (cle abimee).");
  } catch (e) {
    console.log("Verification aupres de Google impossible :", masquer(e.message));
  }
}

// ---------- Firestore (API REST) ----------

let BASE;      // https://firestore.googleapis.com/v1/projects/<projet>/databases/(default)/documents
let JETON;

async function appelFirestore(chemin, corps) {
  const res = await fetch(BASE + chemin, {
    method: "POST",
    headers: { Authorization: `Bearer ${JETON}`, "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
  const data = await res.json().catch(() => ({}));
  const err = Array.isArray(data) ? data[0]?.error : data.error;
  if (!res.ok || err) {
    throw new Error(`Firestore HTTP ${res.status} - ${err?.status || ""} - ${masquer(err?.message || "")}`);
  }
  return data;
}

async function derniersMessages() {
  try {
    const data = await appelFirestore(":runQuery", {
      structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 15,
      },
    });
    return data.map((r) => r.document?.fields?.text?.stringValue).filter(Boolean);
  } catch (e) {
    console.log("Impossible de lire les derniers messages :", e.message);
    return [];
  }
}

async function publier(text, name) {
  // ⚠️ À ADAPTER : mêmes noms de champs que dans ton site.
  await appelFirestore("/" + COLLECTION, {
    fields: {
      text: { stringValue: text },
      authorName: { stringValue: name },
      anon: { booleanValue: true },
      uid: { stringValue: "u_" + Math.random().toString(36).slice(2, 12) }, // faux identifiant
      createdAt: { timestampValue: new Date().toISOString() },
      likes: { integerValue: "0" },
    },
  });
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
  const compte = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  compte.private_key = reparerCle(compte.private_key);
  reparerIdentite(compte);
  await verifierContreGoogle(compte);

  // Jeton d'accès Google (pas besoin de SDK Firestore)
  try {
    JETON = (await admin.credential.cert(compte).getAccessToken()).access_token;
    console.log("Jeton Google : obtenu");
  } catch (e) {
    console.log("Jeton Google : ECHEC -", masquer(e.message));
    process.exit(1);
  }
  BASE = `https://firestore.googleapis.com/v1/projects/${compte.project_id}/databases/(default)/documents`;

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

  const name = `${pick(ANIMAUX)} ${pick(ADJ)} ${Math.floor(1000 + Math.random() * 9000)}`;
  await publier(text, name);
  console.log("Lettre publiée par", name, ":", text);
}

main().then(() => process.exit(0)).catch((e) => { console.error("ERREUR :", masquer(e.message)); process.exit(1); });
