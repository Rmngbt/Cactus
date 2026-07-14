-- ============================================================
-- CACTUS — Sécurisation Supabase (RLS + fonctions)
-- À exécuter dans : Supabase Dashboard → SQL Editor → New query
-- Correspond aux points 2, 3 et 4 de AUDIT.md
-- ============================================================

-- ------------------------------------------------------------
-- 0) Unicité du pseudo (évite la race condition de Register.js)
--    NB : échoue si des doublons existent déjà — les corriger d'abord.
-- ------------------------------------------------------------
alter table public.profiles
  add constraint profiles_username_unique unique (username);

-- ------------------------------------------------------------
-- 1) Activer RLS sur les 3 tables
-- ------------------------------------------------------------
alter table public.profiles   enable row level security;
alter table public.stats      enable row level security;
alter table public.game_rooms enable row level security;

-- Nettoyage d'éventuelles policies existantes du même nom
drop policy if exists "profiles_select"      on public.profiles;
drop policy if exists "profiles_insert_own"  on public.profiles;
drop policy if exists "profiles_update_own"  on public.profiles;
drop policy if exists "stats_select"         on public.stats;
drop policy if exists "stats_insert_own"     on public.stats;
drop policy if exists "stats_update_own"     on public.stats;
drop policy if exists "game_rooms_select"    on public.game_rooms;
drop policy if exists "game_rooms_insert"    on public.game_rooms;
drop policy if exists "game_rooms_update"    on public.game_rooms;

-- ------------------------------------------------------------
-- 2) PROFILES
--    - lecture : ouverte (le login par pseudo cherche le profil AVANT connexion)
--    - insert  : uniquement sa propre ligne, jamais admin
--    - update  : uniquement sa propre ligne, et la colonne is_admin
--                est interdite aux clients (révocation colonne)
-- ------------------------------------------------------------
create policy "profiles_select" on public.profiles
  for select to anon, authenticated using (true);

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and is_admin = false);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Personne ne peut toucher is_admin depuis le navigateur,
-- même avec la policy ci-dessus (seul username reste modifiable) :
revoke update on table public.profiles from anon, authenticated;
grant  update (username) on table public.profiles to authenticated;

-- ------------------------------------------------------------
-- 3) Promotion admin : uniquement via cette fonction, réservée aux admins
--    (le frontend appelle désormais supabase.rpc('set_admin', ...))
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
-- 4) STATS : chacun n'écrit que sa propre ligne
--    (lecture ouverte aux connectés : le panneau admin liste tout le monde)
-- ------------------------------------------------------------
create policy "stats_select" on public.stats
  for select to authenticated using (true);

create policy "stats_insert_own" on public.stats
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "stats_update_own" on public.stats
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5) GAME_ROOMS
--    - lecture/création : utilisateurs connectés
--    - modification : le créateur, un joueur déjà dans la partie,
--      ou n'importe quel connecté tant que la salle est en attente
--      (nécessaire pour pouvoir la rejoindre)
--    NB : cela n'empêche PAS un joueur de la partie de tricher en
--    modifiant game_state — limite du design actuel (cf. AUDIT.md
--    point 12, refonte serveur-autoritaire).
-- ------------------------------------------------------------
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
-- 6) RPC login par pseudo (requise par Login.js — accessible avant connexion)
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
-- 7) Realtime sur game_rooms (indispensable à la synchro des parties)
--    Si erreur « already member of publication » : c'est déjà bon, ignorer.
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.game_rooms;

-- ============================================================
-- VÉRIFICATIONS APRÈS EXÉCUTION (à tester dans l'application) :
--   1. Connexion par email ET par pseudo
--   2. Inscription d'un nouveau compte
--   3. Création + partie contre le bot
--   4. Le panneau admin fonctionne (promotion via le nouveau bouton)
--   5. Dans la console navigateur d'un compte NON admin :
--        await supabase.from('profiles').update({ is_admin: true }).eq('id', '<mon id>')
--      → doit être rejeté (0 ligne modifiée)
-- ============================================================
