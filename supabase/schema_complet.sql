-- ============================================================
-- CACTUS — Création complète de la base (nouveau projet Supabase)
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query → Run
-- Remplace l'ancien setup_securite.sql : ce script crée les tables
-- ET applique toute la sécurité (RLS, fonctions, realtime).
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABLES
-- ------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  games_played integer not null default 0,
  wins integer not null default 0,
  total_score integer not null default 0,
  perfect_cactus_count integer not null default 0
);

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null default 'multiplayer',
  state text not null default 'waiting',
  config jsonb not null default '{}',
  game_state jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) INSCRIPTION AUTOMATIQUE : le profil et les stats sont créés
--    par trigger à la création du compte (robuste même si la
--    confirmation d'email est activée). Le frontend passe le pseudo
--    via options.data.username lors du signUp.
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'Joueur-' || left(new.id::text, 6)),
    false
  );
  insert into public.stats (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3) ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.stats      enable row level security;
alter table public.game_rooms enable row level security;

-- PROFILES : lecture ouverte (le login par pseudo cherche le profil
-- avant connexion) ; modification de sa propre ligne uniquement,
-- et la colonne is_admin est verrouillée pour les clients.
create policy "profiles_select" on public.profiles
  for select to anon, authenticated using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

revoke insert, update, delete on table public.profiles from anon, authenticated;
grant  update (username) on table public.profiles to authenticated;

-- STATS : chacun n'écrit que sa propre ligne
-- (lecture ouverte aux connectés : le panneau admin liste tout le monde)
create policy "stats_select" on public.stats
  for select to authenticated using (true);

create policy "stats_insert_own" on public.stats
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "stats_update_own" on public.stats
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- GAME_ROOMS : lecture/création pour les connectés ; modification par
-- le créateur, un joueur de la partie, ou n'importe quel connecté tant
-- que la salle est en attente (nécessaire pour la rejoindre).
create policy "game_rooms_select" on public.game_rooms
  for select to authenticated using (true);

create policy "game_rooms_insert" on public.game_rooms
  for insert to authenticated
  with check (creator_id = auth.uid());

create policy "game_rooms_update" on public.game_rooms
  for update to authenticated
  using (
    state = 'waiting'
    or creator_id = auth.uid()
    or game_state->'players' @> jsonb_build_array(jsonb_build_object('user_id', auth.uid()::text))
  );

-- ------------------------------------------------------------
-- 4) PROMOTION ADMIN : uniquement via cette fonction, réservée aux admins
--    (le frontend appelle supabase.rpc('set_admin', ...))
-- ------------------------------------------------------------
create or replace function public.set_admin(target_user uuid, make_admin boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Accès refusé : réservé aux administrateurs';
  end if;
  update profiles set is_admin = make_admin where id = target_user;
end $$;

revoke execute on function public.set_admin(uuid, boolean) from public, anon;
grant  execute on function public.set_admin(uuid, boolean) to authenticated;

-- ------------------------------------------------------------
-- 5) LOGIN PAR PSEUDO (requis par Login.js — accessible avant connexion)
-- ------------------------------------------------------------
create or replace function public.get_email_by_username(p_username text)
returns text
language sql security definer set search_path = public as $$
  select u.email::text
  from auth.users u
  join profiles p on p.id = u.id
  where p.username = p_username
  limit 1;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6) REALTIME sur game_rooms (indispensable à la synchro des parties)
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.game_rooms;

-- ============================================================
-- APRÈS EXÉCUTION :
--   1. Crée ton compte via le site, puis rends-le admin (une seule fois) :
--        update profiles set is_admin = true where username = 'TonPseudo';
--   2. Vérifications : inscription, connexion par email ET pseudo,
--      partie contre le bot, panneau admin.
-- ============================================================
