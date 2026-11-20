-- X'enify : SQL du bloc 9 (a lancer apres les blocs 7 et 8, dans Supabase > SQL Editor)
-- Reste de la migration : lettres, anonymes, Action ou verite, appels/live.
-- Une seule table generique « xdocs » (un document = une ligne) + des regles d'acces par module.
-- Traduction automatique du navigateur coupee avant de copier. Relancable sans risque.
-- Ce bloc ne modifie aucune table existante, sauf la lecture de anon_profiles (rendue privee).

-- ============ Table generique ============
create table if not exists public.xdocs (
  path text primary key,                    -- ex. letters/abc  ou  anonThreads/t1/messages/m1
  coll text not null,                       -- chemin de la collection parente (ex. anonThreads/t1/messages)
  id text not null,
  data jsonb not null default '{}'::jsonb,
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists xdocs_coll_idx on public.xdocs (coll);
-- Pas de colonne « auteur » : les lettres anonymes le restent. Qui a ecrit quoi est dans letterOwners (prive).

-- ============ Regles d'acces ============
-- p_act : r = lire, i = creer, u = modifier (avant), uw = modifier (apres), d = supprimer
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

  if top in ('letters', 'lettersN') then                    -- lettres et commentaires
    if p_act in ('r', 'i', 'u', 'uw') then return true; end if;
    lid := segs[seg];                                       -- supprimer : le createur, ou l'auteur (via letterOwners)
    return public.xen_is_creator()
        or exists (select 1 from public.xdocs o where o.path = 'letterOwners/' || lid and o.data ->> 'uid' = me);

  elsif top = 'letterOwners' then                           -- prive : seulement la personne concernee
    return coalesce(p_data ->> 'uid', '') = me;

  elsif top = 'anonThreads' then
    if seg = 2 then                                         -- la discussion elle-meme
      return (p_data -> 'members') ? me;                    -- lire, creer, modifier, supprimer : il faut en etre membre (rejoindre : anon_join)
    else                                                    -- les messages : il faut etre membre de la discussion
      select (t.data -> 'members') ? me into ok from public.xdocs t where t.path = 'anonThreads/' || segs[2];
      return coalesce(ok, false);
    end if;

  elsif top = 'anonRequests' then
    return true;

  elsif top in ('truthDareRooms', 'chats') then             -- jeux et appels : tout compte connecte
    return true;
  end if;
  return false;
end $$;

grant execute on function public.xdoc_ok(text, jsonb, text) to authenticated;

alter table public.xdocs enable row level security;
drop policy if exists xdocs_r on public.xdocs;
create policy xdocs_r on public.xdocs for select to authenticated using (public.xdoc_ok(path, data, 'r'));
drop policy if exists xdocs_i on public.xdocs;
create policy xdocs_i on public.xdocs for insert to authenticated with check (public.xdoc_ok(path, data, 'i'));
drop policy if exists xdocs_u on public.xdocs;
create policy xdocs_u on public.xdocs for update to authenticated
  using (public.xdoc_ok(path, data, 'u')) with check (public.xdoc_ok(path, data, 'uw'));
drop policy if exists xdocs_d on public.xdocs;
create policy xdocs_d on public.xdocs for delete to authenticated using (public.xdoc_ok(path, data, 'd'));
grant select, insert, update, delete on public.xdocs to authenticated;

-- ============ Modification atomique d'un document (evite que deux personnes s'ecrasent) ============
-- ops : [{o:'set'|'del'|'union'|'remove'|'inc', p:['champ','sous-champ'], v:valeur}]
create or replace function public.xdoc_set_path(d jsonb, p text[], v jsonb) returns jsonb
language plpgsql immutable as $$
declare i int; cur jsonb;
begin
  for i in 1 .. coalesce(array_length(p, 1), 0) - 1 loop
    cur := d #> p[1:i];
    if cur is null or jsonb_typeof(cur) <> 'object' then d := jsonb_set(d, p[1:i], '{}'::jsonb, true); end if;
  end loop;
  return jsonb_set(d, p, v, true);
end $$;

create or replace function public.xdoc_apply(p_path text, p_ops jsonb, p_upsert boolean default false) returns void
language plpgsql security invoker set search_path = public as $$
declare
  r public.xdocs; d jsonb; op jsonb; p text[]; cur jsonb; segs text[] := string_to_array(p_path, '/');
begin
  select * into r from public.xdocs where path = p_path for update;
  if not found then
    if not p_upsert then raise exception 'not_found' using errcode = 'P0002'; end if;
    insert into public.xdocs(path, coll, id, data)
    values (p_path, array_to_string(segs[1:array_length(segs, 1) - 1], '/'), segs[array_length(segs, 1)], '{}'::jsonb)
    returning * into r;
  end if;
  d := coalesce(r.data, '{}'::jsonb);
  for op in select * from jsonb_array_elements(p_ops) loop
    p := array(select jsonb_array_elements_text(op -> 'p'));
    if coalesce(array_length(p, 1), 0) = 0 then continue; end if;
    cur := d #> p;
    case op ->> 'o'
      when 'set' then d := public.xdoc_set_path(d, p, coalesce(op -> 'v', 'null'::jsonb));
      when 'del' then d := d #- p;
      when 'inc' then d := public.xdoc_set_path(d, p, to_jsonb(coalesce((cur #>> '{}')::numeric, 0) + coalesce((op ->> 'v')::numeric, 0)));
      when 'union' then      -- ajoute les valeurs absentes, en gardant l'ordre existant
        if cur is null or jsonb_typeof(cur) <> 'array' then cur := '[]'::jsonb; end if;
        select coalesce(jsonb_agg(u.x order by u.o), '[]'::jsonb) into cur from (
          select e.x, e.o from jsonb_array_elements(cur) with ordinality e(x, o)
          union all
          select n.x, 1000000 + n.o from jsonb_array_elements(case when jsonb_typeof(op -> 'v') = 'array' then op -> 'v' else jsonb_build_array(op -> 'v') end) with ordinality n(x, o)
          where not exists (select 1 from jsonb_array_elements(cur) c(x) where c.x = n.x)
        ) u;
        d := public.xdoc_set_path(d, p, cur);
      when 'remove' then
        if jsonb_typeof(cur) = 'array' then
          select coalesce(jsonb_agg(e.x order by e.o), '[]'::jsonb) into cur from jsonb_array_elements(cur) with ordinality e(x, o)
          where not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(op -> 'v') = 'array' then op -> 'v' else jsonb_build_array(op -> 'v') end) rm(x) where rm.x = e.x);
          d := public.xdoc_set_path(d, p, cur);
        end if;
      else null;
    end case;
  end loop;
  update public.xdocs set data = d where path = p_path;
end $$;
grant execute on function public.xdoc_set_path(jsonb, text[], jsonb) to authenticated;
grant execute on function public.xdoc_apply(text, jsonb, boolean) to authenticated;

-- ============ Anonymes : identite privee + « accepte les messages anonymes ? » ============
-- L'identite anonyme (anon_profiles) ne doit etre lisible que par la personne elle-meme.
drop policy if exists anonp_read on public.anon_profiles;
drop policy if exists anonp_own on public.anon_profiles;
create policy anonp_own on public.anon_profiles for select to authenticated using (uid = auth.uid());

create or replace function public.anon_accepts(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not no_anon from public.anon_profiles where uid = p_uid), true)
$$;
grant execute on function public.anon_accepts(uuid) to authenticated;

-- Rejoindre une discussion anonyme dont on est le destinataire (le fil n'est pas lisible avant, pour cacher l'expediteur)
create or replace function public.anon_join(p_tid text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.xdocs; rq public.xdocs; addr text;
begin
  if me is null then raise exception 'forbidden'; end if;
  select * into t from public.xdocs where path = 'anonThreads/' || p_tid;
  if not found then raise exception 'not_found'; end if;
  addr := t.data ->> 'addr';
  select * into rq from public.xdocs where path = 'anonRequests/' || p_tid;
  if not found or rq.data ->> 'addr' is distinct from addr then raise exception 'forbidden'; end if;
  if addr like 'u:%' and addr <> 'u:' || me::text then raise exception 'forbidden'; end if;
  if coalesce(t.data ->> 'b', '') <> '' and t.data ->> 'b' <> me::text then raise exception 'forbidden'; end if;
  update public.xdocs
  set data = jsonb_set(jsonb_set(t.data, '{b}', to_jsonb(me::text), true), '{members}',
        case when (t.data -> 'members') ? me::text then t.data -> 'members' else (t.data -> 'members') || to_jsonb(me::text) end, true)
  where path = t.path;
end $$;
grant execute on function public.anon_join(text) to authenticated;

-- Recherche d'un identifiant (@nom) pour taquiner quelqu'un : renvoie son uid, ou rien
create or replace function public.uid_of_username(p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.profiles where lower(username) = lower(p_name) limit 1
$$;
grant execute on function public.uid_of_username(text) to authenticated;

-- ============ Temps reel ============
do $$
begin
  begin
    alter publication supabase_realtime add table public.xdocs;
  exception when duplicate_object then null;
            when undefined_object then null;
  end;
end $$;

-- ============ Facultatif : les tables du bloc 7 devenues inutiles ============
-- (lettres, anonymes, jeux et appels passent par xdocs). Decommente pour les supprimer si tu veux faire le menage :
-- drop table if exists public.letter_comments, public.letter_owners, public.letters,
--   public.anon_messages, public.anon_requests, public.anon_threads,
--   public.td_rooms, public.live_signals, public.live_sessions cascade;
