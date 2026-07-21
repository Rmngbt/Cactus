-- ============================================================
-- CACTUS — Ajout : message de victoire personnalisé par joueur
-- À exécuter dans : Supabase Dashboard → SQL Editor → Run
-- (base existante — les nouvelles installations l'ont via schema_complet.sql)
-- ============================================================

alter table public.profiles add column if not exists win_message text;

create or replace function public.set_win_message(target_user uuid, message text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = auth.uid() and is_admin) then
    raise exception 'Accès refusé : réservé aux administrateurs';
  end if;
  update profiles
     set win_message = nullif(trim(message), '')
   where id = target_user;
end $$;

revoke execute on function public.set_win_message(uuid, text) from public, anon;
grant  execute on function public.set_win_message(uuid, text) to authenticated;
