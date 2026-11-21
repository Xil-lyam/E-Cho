# Fonctions serveur (Supabase Edge Functions) — remplace Netlify

Deux fonctions dans `supabase/functions/` : `push` (notifications) et `turn` (relais d'appels).

## Depuis le site Supabase (sans rien installer)
1. Supabase > **Edge Functions** > **Deploy a new function** > « Via Editor ».
2. Nom : `push` → colle le contenu de `supabase/functions/push/index.ts` → **Deploy**.
   Dans les réglages de la fonction, désactive **Verify JWT** (la fonction vérifie elle-même la connexion).
3. Pareil avec le nom `turn` et `supabase/functions/turn/index.ts` (Verify JWT désactivé).
4. **Edge Functions > Secrets** : ajoute
   - `VAPID_PUBLIC` et `VAPID_PRIVATE` (tes clés push)
   - `TURN_USERNAME` et `TURN_CREDENTIAL` (nouveaux identifiants Metered)
   `SUPABASE_URL` et la clé service sont déjà fournis.
