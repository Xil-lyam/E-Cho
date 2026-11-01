/* U&I — config.js : clés Firebase, push, récupération (à modifier ici) */

/* U&I — js/boot/vibrate-guard.js
   Protège navigator.vibrate (évite les erreurs sur les navigateurs qui le bloquent) */
try{var _v=navigator.vibrate;if(_v)navigator.vibrate=function(){try{return _v.apply(navigator,arguments)}catch(e){return false}}}catch(e){}

/* U&I — js/config.js
   Configuration : Firebase, domaine des comptes, push (VAPID + Worker) */
window.APP_CONFIG = {
  // numéro de version : à augmenter à chaque mise à jour (évite le vieux cache de GitHub Pages)
  version: '15',
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
  }
};
