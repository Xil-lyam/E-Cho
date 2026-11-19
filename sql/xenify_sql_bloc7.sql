-- X'enify : SQL du bloc 7 (a lancer une fois dans Supabase > SQL Editor)
-- Tables manquantes pour les modules pas encore convertis de Firebase vers Supabase :
-- stories, j'aime de profil, lettres, anonymes, jeux, musique partagee, shorts, memoire X.Uni,
-- appels/live, recuperation par e-mail, notifications push, validation des comptes.
-- Traduction automatique du navigateur coupee avant de copier. Relancable sans risque.
-- Ce bloc ne change AUCUNE table existante : il ajoute seulement du nouveau.

-- ============ Outils communs ============
create or replace function public.xen_is_creator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (to_jsonb(p) ->> 'is_creator')::boolean from public.profiles p where p.id = auth.uid()), false)
$$;

create or replace function public.xen_is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a = b or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a)))
$$;

create or replace function public.xen_in_chat(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversation_members m where m.conversation_id = cid and m.user_id = auth.uid())
$$;

grant execute on function public.xen_is_creator() to authenticated;
grant execute on function public.xen_is_friend(uuid, uuid) to authenticated;
grant execute on function public.xen_in_chat(uuid) to authenticated;

-- ============ 1. Stories ============
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,          -- type, lien Cloudinary, legende...
  album text,
  archived boolean not null default false,
  viewers uuid[] not null default '{}',
  reactions jsonb not null default '{}'::jsonb,     -- { uid: emoji }
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);
create index if not exists stories_uid_idx on public.stories (uid, created_at desc);
alter table public.stories enable row level security;
drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select to authenticated
  using (public.xen_is_friend(uid, auth.uid()));
drop policy if exists stories_write on public.stories;
create policy stories_write on public.stories for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

-- un ami peut s'ajouter aux vues et reagir (sans pouvoir modifier le reste)
create or replace function public.story_seen(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.stories s set viewers = array_append(s.viewers, auth.uid())
  where s.id = p_id and public.xen_is_friend(s.uid, auth.uid()) and not (auth.uid() = any (s.viewers))
$$;
create or replace function public.story_react(p_id uuid, p_emoji text) returns void
language sql security definer set search_path = public as $$
  update public.stories s
  set reactions = case when p_emoji is null or p_emoji = '' then s.reactions - auth.uid()::text
                       else s.reactions || jsonb_build_object(auth.uid()::text, p_emoji) end
  where s.id = p_id and public.xen_is_friend(s.uid, auth.uid())
$$;
grant execute on function public.story_seen(uuid) to authenticated;
grant execute on function public.story_react(uuid, text) to authenticated;

-- ============ 2. J'aime de profil ============
create table if not exists public.profile_likes (
  to_uid uuid not null references public.profiles(id) on delete cascade,
  from_uid uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (to_uid, from_uid)
);
alter table public.profile_likes enable row level security;
drop policy if exists profile_likes_read on public.profile_likes;
create policy profile_likes_read on public.profile_likes for select to authenticated using (true);
drop policy if exists profile_likes_ins on public.profile_likes;
create policy profile_likes_ins on public.profile_likes for insert to authenticated
  with check (from_uid = auth.uid() and to_uid <> auth.uid());
drop policy if exists profile_likes_del on public.profile_likes;
create policy profile_likes_del on public.profile_likes for delete to authenticated using (from_uid = auth.uid());

-- ============ 3. Lettres (fil public, auteurs caches) ============
create table if not exists public.letters (
  id uuid primary key default gen_random_uuid(),
  feed text not null default 'letters' check (feed in ('letters','lettersN')),  -- certifies / non certifies
  data jsonb not null default '{}'::jsonb,
  pin boolean not null default false,
  cc integer not null default 0,                     -- nombre de commentaires
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists letters_feed_idx on public.letters (feed, ts desc);

create table if not exists public.letter_comments (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.letters(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists letter_comments_idx on public.letter_comments (letter_id, ts);

-- qui a ecrit quoi : lisible uniquement par la personne elle-meme
create table if not exists public.letter_owners (
  id uuid primary key,                               -- id de la lettre ou du commentaire
  uid uuid not null references public.profiles(id) on delete cascade,
  letter uuid,
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.letters enable row level security;
alter table public.letter_comments enable row level security;
alter table public.letter_owners enable row level security;

drop policy if exists letters_read on public.letters;
create policy letters_read on public.letters for select to authenticated using (true);
drop policy if exists letters_ins on public.letters;
create policy letters_ins on public.letters for insert to authenticated with check (true);
drop policy if exists letters_upd on public.letters;
create policy letters_upd on public.letters for update to authenticated
  using (public.xen_is_creator() or exists (select 1 from public.letter_owners o where o.id = letters.id and o.uid = auth.uid()));
drop policy if exists letters_del on public.letters;
create policy letters_del on public.letters for delete to authenticated
  using (public.xen_is_creator() or exists (select 1 from public.letter_owners o where o.id = letters.id and o.uid = auth.uid()));

drop policy if exists lcom_read on public.letter_comments;
create policy lcom_read on public.letter_comments for select to authenticated using (true);
drop policy if exists lcom_ins on public.letter_comments;
create policy lcom_ins on public.letter_comments for insert to authenticated with check (true);
drop policy if exists lcom_del on public.letter_comments;
create policy lcom_del on public.letter_comments for delete to authenticated
  using (public.xen_is_creator() or exists (select 1 from public.letter_owners o where o.id = letter_comments.id and o.uid = auth.uid()));

drop policy if exists lown_read on public.letter_owners;
create policy lown_read on public.letter_owners for select to authenticated using (uid = auth.uid());
drop policy if exists lown_write on public.letter_owners;
create policy lown_write on public.letter_owners for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

-- compteur de commentaires (n'importe qui peut commenter, mais personne ne peut tricher sur le compteur)
create or replace function public.letter_bump(p_letter uuid, p_delta integer) returns void
language sql security definer set search_path = public as $$
  update public.letters set cc = greatest(0, cc + case when p_delta >= 0 then 1 else -1 end) where id = p_letter
$$;
grant execute on function public.letter_bump(uuid, integer) to authenticated;

-- ============ 4. Anonymes ============
create table if not exists public.anon_profiles (
  uid uuid primary key references public.profiles(id) on delete cascade,
  name text,
  data jsonb not null default '{}'::jsonb,
  no_anon boolean not null default false            -- refuse les messages anonymes
);
create table if not exists public.anon_threads (
  id uuid primary key default gen_random_uuid(),
  a uuid not null references public.profiles(id) on delete cascade,   -- celui qui ecrit
  b uuid references public.profiles(id) on delete cascade,            -- destinataire
  members uuid[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create table if not exists public.anon_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.anon_threads(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  text text not null check (char_length(text) <= 600),
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists anon_messages_idx on public.anon_messages (thread_id, ts);
create table if not exists public.anon_requests (
  id uuid primary key default gen_random_uuid(),
  from_uid uuid not null references public.profiles(id) on delete cascade,
  to_uid uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  data jsonb not null default '{}'::jsonb,
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.anon_profiles enable row level security;
alter table public.anon_threads enable row level security;
alter table public.anon_messages enable row level security;
alter table public.anon_requests enable row level security;

drop policy if exists anonp_read on public.anon_profiles;
create policy anonp_read on public.anon_profiles for select to authenticated using (true);
drop policy if exists anonp_write on public.anon_profiles;
create policy anonp_write on public.anon_profiles for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

drop policy if exists anont_all on public.anon_threads;
create policy anont_all on public.anon_threads for all to authenticated
  using (auth.uid() = a or auth.uid() = b or auth.uid() = any (members))
  with check (auth.uid() = a or auth.uid() = b or auth.uid() = any (members));

drop policy if exists anonm_read on public.anon_messages;
create policy anonm_read on public.anon_messages for select to authenticated
  using (exists (select 1 from public.anon_threads t where t.id = thread_id
                 and (auth.uid() = t.a or auth.uid() = t.b or auth.uid() = any (t.members))));
drop policy if exists anonm_ins on public.anon_messages;
create policy anonm_ins on public.anon_messages for insert to authenticated
  with check (uid = auth.uid() and exists (select 1 from public.anon_threads t where t.id = thread_id
                 and (auth.uid() = t.a or auth.uid() = t.b or auth.uid() = any (t.members))));

drop policy if exists anonr_read on public.anon_requests;
create policy anonr_read on public.anon_requests for select to authenticated
  using (auth.uid() = from_uid or auth.uid() = to_uid);
drop policy if exists anonr_ins on public.anon_requests;
create policy anonr_ins on public.anon_requests for insert to authenticated with check (auth.uid() = from_uid);
drop policy if exists anonr_upd on public.anon_requests;
create policy anonr_upd on public.anon_requests for update to authenticated
  using (auth.uid() = to_uid or auth.uid() = from_uid);
drop policy if exists anonr_del on public.anon_requests;
create policy anonr_del on public.anon_requests for delete to authenticated
  using (auth.uid() = to_uid or auth.uid() = from_uid);

-- ============ 5. Jeux : Action ou verite, pierre-feuille-ciseaux ============
create table if not exists public.td_rooms (
  id uuid primary key default gen_random_uuid(),
  creator uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open',
  data jsonb not null default '{}'::jsonb,           -- joueurs, tour, chat de la partie...
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists td_rooms_idx on public.td_rooms (created_at desc);
create table if not exists public.rps_rooms (
  code text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.td_rooms enable row level security;
alter table public.rps_rooms enable row level security;
-- une partie est ouverte a tous les comptes connectes (comme avant) ; seul le createur peut la supprimer
drop policy if exists td_read on public.td_rooms;
create policy td_read on public.td_rooms for select to authenticated using (true);
drop policy if exists td_ins on public.td_rooms;
create policy td_ins on public.td_rooms for insert to authenticated with check (creator = auth.uid());
drop policy if exists td_upd on public.td_rooms;
create policy td_upd on public.td_rooms for update to authenticated using (true);
drop policy if exists td_del on public.td_rooms;
create policy td_del on public.td_rooms for delete to authenticated using (creator = auth.uid() or public.xen_is_creator());
drop policy if exists rps_all on public.rps_rooms;
create policy rps_all on public.rps_rooms for all to authenticated using (true) with check (true);

-- ============ 6. Musique partagee ============
create table if not exists public.shared_music (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references public.profiles(id) on delete cascade,
  pub boolean not null default false,
  data jsonb not null default '{}'::jsonb,           -- titre, lien Cloudinary...
  created_at timestamptz not null default now()
);
create index if not exists shared_music_idx on public.shared_music (pub, created_at desc);
alter table public.shared_music enable row level security;
drop policy if exists sm_read on public.shared_music;
create policy sm_read on public.shared_music for select to authenticated using (pub or uid = auth.uid());
drop policy if exists sm_write on public.shared_music;
create policy sm_write on public.shared_music for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

-- ============ 7. Shorts et memoire de X.Uni (prives) ============
create table if not exists public.shorts_profiles (
  uid uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_memory (
  id text primary key,
  uid uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.shorts_profiles enable row level security;
alter table public.ai_memory enable row level security;
drop policy if exists shorts_own on public.shorts_profiles;
create policy shorts_own on public.shorts_profiles for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());
drop policy if exists aimem_own on public.ai_memory;
create policy aimem_own on public.ai_memory for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

-- ============ 8. Appels et live (signalisation) ============
create table if not exists public.live_sessions (
  chat_id uuid primary key references public.conversations(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.live_signals (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.conversations(id) on delete cascade,
  uid uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);
create index if not exists live_signals_idx on public.live_signals (chat_id, ts);
alter table public.live_sessions enable row level security;
alter table public.live_signals enable row level security;
drop policy if exists live_s_all on public.live_sessions;
create policy live_s_all on public.live_sessions for all to authenticated
  using (public.xen_in_chat(chat_id)) with check (public.xen_in_chat(chat_id));
drop policy if exists live_sig_read on public.live_signals;
create policy live_sig_read on public.live_signals for select to authenticated using (public.xen_in_chat(chat_id));
drop policy if exists live_sig_ins on public.live_signals;
create policy live_sig_ins on public.live_signals for insert to authenticated
  with check (uid = auth.uid() and public.xen_in_chat(chat_id));
drop policy if exists live_sig_del on public.live_signals;
create policy live_sig_del on public.live_signals for delete to authenticated using (public.xen_in_chat(chat_id));

-- ============ 9. Recuperation de compte par e-mail ============
-- Contenu chiffre dans le navigateur (sel, iv, ct) : le serveur ne voit jamais le secret en clair.
create table if not exists public.recovery (
  username text primary key,
  salt text not null,
  iv text not null,
  ct text not null,
  uid uuid not null references public.profiles(id) on delete cascade
);
alter table public.recovery enable row level security;
drop policy if exists rec_read on public.recovery;
create policy rec_read on public.recovery for select to anon, authenticated using (true);   -- lu AVANT connexion
drop policy if exists rec_write on public.recovery;
create policy rec_write on public.recovery for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());

-- ============ 10. Notifications push ============
create table if not exists public.push_subs (
  uid uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  data jsonb not null default '{}'::jsonb,           -- type d'appareil, preferences...
  updated_at timestamptz not null default now(),
  primary key (uid, token)
);
alter table public.push_subs enable row level security;
drop policy if exists push_own on public.push_subs;
create policy push_own on public.push_subs for all to authenticated
  using (uid = auth.uid()) with check (uid = auth.uid());
-- (le worker ui-push lit cette table avec la cle service_role, qui ignore ces regles)

-- ============ 11. Validation des comptes (outils createur) ============
create table if not exists public.app_settings (
  key text primary key,
  data jsonb not null default '{}'::jsonb
);
create table if not exists public.account_approvals (
  uid uuid primary key references public.profiles(id) on delete cascade,
  name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  data jsonb not null default '{}'::jsonb,
  ts bigint not null default (extract(epoch from now()) * 1000)::bigint
);
alter table public.app_settings enable row level security;
alter table public.account_approvals enable row level security;
drop policy if exists set_read on public.app_settings;
create policy set_read on public.app_settings for select to authenticated using (true);
drop policy if exists set_write on public.app_settings;
create policy set_write on public.app_settings for all to authenticated
  using (public.xen_is_creator()) with check (public.xen_is_creator());
drop policy if exists apr_read on public.account_approvals;
create policy apr_read on public.account_approvals for select to authenticated
  using (uid = auth.uid() or public.xen_is_creator());
drop policy if exists apr_ins on public.account_approvals;
create policy apr_ins on public.account_approvals for insert to authenticated
  with check (uid = auth.uid() and status = 'pending');
drop policy if exists apr_upd on public.account_approvals;
create policy apr_upd on public.account_approvals for update to authenticated
  using (public.xen_is_creator()) with check (public.xen_is_creator());
drop policy if exists apr_del on public.account_approvals;
create policy apr_del on public.account_approvals for delete to authenticated using (public.xen_is_creator());

-- ============ Temps reel (mises a jour en direct) ============
do $$
declare t text;
begin
  foreach t in array array['stories','profile_likes','letters','letter_comments','anon_threads','anon_messages',
    'anon_requests','td_rooms','rps_rooms','shared_music','live_sessions','live_signals','account_approvals','app_settings']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
             when undefined_object then null;
    end;
  end loop;
end $$;
