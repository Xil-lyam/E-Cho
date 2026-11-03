/* X'Unity — config.js : clés Firebase, push, récupération (à modifier ici) */

/* X'Unity — js/boot/vibrate-guard.js
   Protège navigator.vibrate (évite les erreurs sur les navigateurs qui le bloquent) */
try{var _v=navigator.vibrate;if(_v)navigator.vibrate=function(){try{return _v.apply(navigator,arguments)}catch(e){return false}}}catch(e){}

/* X'Unity — js/config.js
   Configuration : Firebase, domaine des comptes, push (VAPID + Worker) */
window.APP_CONFIG = {
  // numéro de version : à augmenter à chaque mise à jour (évite le vieux cache de GitHub Pages)
  version: '218',
  // Supabase : l'URL (sans /rest/v1/) et la clé « publishable » (jamais la clé secret)
  firebase: {
    url: "https://ycpcvogpagnseyzwsvwb.supabase.co",
    key: "sb_publishable_6E2gyuWttwC8DNB8bCmxIQ_1PIioQV3",
    apiKey: "sb_publishable_6E2gyuWttwC8DNB8bCmxIQ_1PIioQV3"
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
    workerUrl: "" /* ancien système par code : désactivé */, old: "https://ui-recovery.lyamsr-14-02.workers.dev"
  }
};
