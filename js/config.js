/* E'cho — config.js : clés Firebase, push, récupération (à modifier ici) */

/* E'cho — js/boot/vibrate-guard.js
   Protège navigator.vibrate (évite les erreurs sur les navigateurs qui le bloquent) */
try{var _v=navigator.vibrate;if(_v)navigator.vibrate=function(){try{return _v.apply(navigator,arguments)}catch(e){return false}}}catch(e){}

/* E'cho — js/config.js
   Configuration : Firebase, domaine des comptes, push (VAPID + Worker) */
window.APP_CONFIG = {
  // numéro de version : à augmenter à chaque mise à jour (évite le vieux cache de GitHub Pages)
  version: '343',
  firebase: {
    apiKey: "AIzaSyCoHtDPfDbogSjRZmBp4uxZg-7LunSSpuw",
    authDomain: "u-i-love.firebaseapp.com",
    projectId: "u-i-love",
    storageBucket: "u-i-love.firebasestorage.app",
    messagingSenderId: "631777729747",
    appId: "1:631777729747:web:597bdd14d49433cfb90826"
  },
  // Nom d'utilisateur "sophie" => compte interne sophie@u-and-i.app (aucun e-mail n'est envoyé)
  emailDomain: "u-and-i.app",
  // Notifications push : clé VAPID (Firebase) + adresse du Worker Cloudflare « ui-push »
  push: {
    vapidKey: "BORjAzHpM7sxRGFM89KMXNp178Kubyt-Jd9zTjPNbcGxbvZvgGXLpbb5BcHG_F5HcxpfMTaQtiblEVxG5_WoTpM",
    workerUrl: "https://ui-push.lyamsr-14-02.workers.dev"
  },
  // E-mail de récupération + mot de passe oublié par code : adresse du Worker Cloudflare « ui-recovery »
  // (voir worker/LISEZ-MOI.md). Tant que COLLE reste ici, la fonction est désactivée.
  recovery: {
    workerUrl: "https://ui-recovery.lyamsr-14-02.workers.dev"
  },
  // Accueil = Shorts YouTube. Clé « YouTube Data API v3 » (console.cloud.google.com), à restreindre au domaine xil-lyam.github.io.
  // Tant que COLLE reste ici, l'Accueil garde les lettres anonymes. Sources tirées au hasard :
  //  - channels : identifiants de chaînes (commencent par UC…) → les plus économiques (1 unité de quota)
  //  - playlists : identifiants de playlists (PL…) → idem
  //  - queries : mots-clés (coûtent 100 unités par recherche, mis en cache 6 h)
  shorts: {
    apiKey: "AIzaSyA3FOLp1yfchRnM7UxYxbnU9HnxxEFkaxE",
    channels: [],
    playlists: [],
    queries: ["shorts madagascar", "shorts humour", "shorts musique", "shorts cuisine", "shorts animaux","shorts fruit"],
    maxSeconds: 60,
    region: "FR",
    lang: "fr"
  }
};
