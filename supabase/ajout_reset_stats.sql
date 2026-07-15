-- ============================================================
-- CACTUS — Ajout : réinitialisation des stats par un admin
-- À exécuter dans : Supabase Dashboard → SQL Editor → Run
-- (base existante — les nouvelles installations l'ont via schema_complet.sql)
-- ============================================================

create or replace function public.reset_stats(target_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Accès refusé : réservé aux administrateurs';
  end if;
  update stats
     set games_played = 0,
         wins = 0,
         total_score = 0,
         perfect_cactus_count = 0
   where user_id = target_user;
end $$;

revoke execute on function public.reset_stats(uuid) from public, anon;
grant  execute on function public.reset_stats(uuid) to authenticated;
