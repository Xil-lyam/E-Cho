-- X'enify : SQL du bloc 10 (a lancer apres le bloc 9) — appels/live reserves aux membres de la discussion.
-- Relancable sans risque. Remplace seulement la fonction de regles xdoc_ok (le reste du bloc 9 ne change pas).
create or replace function public.xdoc_ok(p_path text, p_data jsonb, p_act text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  me text := auth.uid()::text;
  segs text[] := string_to_array(p_path, '/');
  top text := segs[1];
  seg int := array_length(segs, 1);
  lid text; ok boolean;
begin
  if me is null then return false; end if;
  if top in ('letters', 'lettersN') then
    if p_act in ('r', 'i', 'u', 'uw') then return true; end if;
    lid := segs[seg];
    return public.xen_is_creator()
        or exists (select 1 from public.xdocs o where o.path = 'letterOwners/' || lid and o.data ->> 'uid' = me);
  elsif top = 'letterOwners' then
    return coalesce(p_data ->> 'uid', '') = me;
  elsif top = 'anonThreads' then
    if seg = 2 then return (p_data -> 'members') ? me;
    else
      select (t.data -> 'members') ? me into ok from public.xdocs t where t.path = 'anonThreads/' || segs[2];
      return coalesce(ok, false);
    end if;
  elsif top = 'anonRequests' then
    return true;
  elsif top = 'truthDareRooms' then
    return true;
  elsif top = 'chats' then                                  -- appels : il faut etre membre de la discussion
    if seg = 2 then return (p_data -> 'members') ? me;
    else
      select (t.data -> 'members') ? me into ok from public.xdocs t where t.path = 'chats/' || segs[2];
      return coalesce(ok, false);
    end if;
  end if;
  return false;
end $$;
grant execute on function public.xdoc_ok(text, jsonb, text) to authenticated;

-- ============ Outils createur : validation des comptes et certification ============
-- Le createur peut aussi creer/ecrire des approbations pour d'autres comptes (migration « approuver les comptes existants »)
drop policy if exists apr_ins on public.account_approvals;
create policy apr_ins on public.account_approvals for insert to authenticated
  with check ((uid = auth.uid() and status = 'pending') or public.xen_is_creator());

-- Certifier un compte (coche bleue) : reserve au createur
create or replace function public.creator_set_verified(p_uid uuid, p_val boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.xen_is_creator() then raise exception 'forbidden'; end if;
  update public.profiles set verified = p_val where id = p_uid;
end $$;
grant execute on function public.creator_set_verified(uuid, boolean) to authenticated;

-- Temps reel pour ces deux tables (sans effet si deja fait)
do $$
declare t text;
begin
  foreach t in array array['app_settings', 'account_approvals'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;
