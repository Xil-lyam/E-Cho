/* X'enify — config.js : clés Supabase, push, récupération (à modifier ici) */

/* js/boot/vibrate-guard.js
   Protège navigator.vibrate (évite les erreurs sur les navigateurs qui le bloquent) */
try{var _v=navigator.vibrate;if(_v)navigator.vibrate=function(){try{return _v.apply(navigator,arguments)}catch(e){return false}}}catch(e){}

/* js/config.js
   Configuration : Supabase, domaine des comptes, push (VAPID + Worker) */
window.APP_CONFIG = {
  // numéro de version : à augmenter à chaque mise à jour (évite le vieux cache de GitHub Pages)
  version: '728',
  // Supabase : l'URL et la clé « publishable » sont faites pour être publiques (jamais la clé secrète)
   supabase: { url: 'https://jqcwykwsqdzmnfhimpzp.supabase.co', key: 'sb_publishable_2OItoG575qZR2LE0TKM7lw_AYRVISQv' },
  // Nom d'utilisateur "sophie" => compte interne sophie@u-and-i.app (aucun e-mail n'est envoyé)
  emailDomain: "u-and-i.app",
  // Notifications push : clé VAPID + adresse du Worker Cloudflare « ui-push »
  push: {
    vapidKey: "BORjAzHpM7sxRGFM89KMXNp178Kubyt-Jd9zTjPNbcGxbvZvgGXLpbb5BcHG_F5HcxpfMTaQtiblEVxG5_WoTpM",
    workerUrl: "https://ui-push.lyamsr-14-02.workers.dev"
  },
  // E-mail de récupération + mot de passe oublié par code : adresse du Worker Cloudflare « ui-recovery »
  recovery: {
    workerUrl: "https://ui-recovery.lyamsr-14-02.workers.dev"
  },
  // Accueil = Shorts YouTube. Clé « YouTube Data API v3 », à restreindre au domaine xil-lyam.github.io.
  shorts: {
    apiKey: "AIzaSyA3FOLp1yfchRnM7UxYxbnU9HnxxEFkaxE",
    channels: ["@Squeezie", "@NormanFaitDesVideos", "@Amixem", "@B4CInstitution", "@sciencetrash", "@GauthierDm_Science", "@MisterV", "@TiboInShape", "@Natoo", "@cocktaildefruits", "@theomcx", "@higumanga", "@Jaysko261gasy", "@alvinlecomedien", "@ComedieMADA", "@Levinho", "@etreetudiant", "@histoiresdefruits2026", "@FruitStory_off", "@Rnboi", "@TKS2G", "@NyRabe", "@ricoanimations0", "@Paulygones", "@AnimeSenpaiVf", "@NBA", "@MSHTVOfficial", "@GDsHighlights", "@BestDuSport", "@LeFooteuxxx", "@MFZ6HD", "@xrrftbl", "@jt_editzx1", "@heisty710", "@LétoileNoire-x9f", "@galagade.studio", "@Noctigme"],
    playlists: [],
    queries: [],
    maxSeconds: 120,
    region: "FR",
    lang: "fr"
  }
};
