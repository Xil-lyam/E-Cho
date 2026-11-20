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

-- Stories : modifier une story. Le proprietaire peut tout changer ; un ami peut seulement
-- s'ajouter aux vues (viewers), reagir (reactions.<lui>) ou signaler (reports.<lui>).
create or replace function public.story_update(p_id uuid, p_ops jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.stories; op jsonb; me uuid := auth.uid(); mine boolean;
  path text[]; k text; d jsonb;
begin
  if me is null then raise exception 'forbidden'; end if;
  select * into s from public.stories where id = p_id;
  if not found then return; end if;
  mine := (s.uid = me);
  if not mine and not public.xen_is_friend(s.uid, me) then raise exception 'forbidden'; end if;
  d := coalesce(s.data, '{}'::jsonb);
  for op in select * from jsonb_array_elements(p_ops) loop
    path := array(select jsonb_array_elements_text(op -> 'p'));
    k := path[1];
    if k is null then continue; end if;
    if not mine then
      if k = 'viewers' and op ->> 'o' = 'union' and op -> 'v' = to_jsonb(me::text) then null;
      elsif k in ('reactions', 'reports') and array_length(path, 1) = 2 and path[2] = me::text then null;
      else raise exception 'forbidden'; end if;
    end if;
    if op ->> 'o' = 'set' then
      if array_length(path, 1) = 2 and jsonb_typeof(d -> k) is distinct from 'object' then
        d := jsonb_set(d, array[k], '{}'::jsonb, true);
      end if;
      d := jsonb_set(d, path, coalesce(op -> 'v', 'null'::jsonb), true);
    elsif op ->> 'o' = 'del' then
      d := d #- path;
    elsif op ->> 'o' = 'union' then
      if jsonb_typeof(d -> k) is distinct from 'array' then d := jsonb_set(d, array[k], '[]'::jsonb, true); end if;
      if not ((d -> k) @> jsonb_build_array(op -> 'v')) then
        d := jsonb_set(d, array[k], (d -> k) || jsonb_build_array(op -> 'v'), true);
      end if;
    end if;
  end loop;
  update public.stories set data = d where id = p_id;
end $$;
grant execute on function public.story_update(uuid, jsonb) to authenticated;
