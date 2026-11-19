-- X'enify : SQL du bloc 8 (a lancer apres le bloc 7, dans Supabase > SQL Editor)
-- Fonctions qui modifient UNE PARTIE d'un document sans ecraser le reste
-- (evite que deux joueurs qui jouent en meme temps s'ecrasent mutuellement).
-- Traduction automatique du navigateur coupee avant de copier. Relancable sans risque.

-- Pierre-feuille-ciseaux : fusionne les champs envoyes dans la partie (code)
create or replace function public.rps_patch(p_code text, p_patch jsonb) returns void
language sql security invoker set search_path = public as $$
  update public.rps_rooms
  set data = data || p_patch, updated_at = now()
  where code = p_code
$$;
grant execute on function public.rps_patch(text, jsonb) to authenticated;
