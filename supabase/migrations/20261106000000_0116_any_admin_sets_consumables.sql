-- Any Admin — Factory Admins included — may tick or untick "Consumable" on a
-- component and "Consumables vendor" on a vendor. Until now only a full Admin
-- could; Rakesh and Prem (Factory Admins) need to as well.

create or replace function public.guard_consumable_flags()
 returns trigger language plpgsql set search_path to 'public'
as $$
declare v_changed boolean;
begin
  if tg_table_name = 'components' then
    v_changed := (tg_op = 'INSERT' and new.is_consumable) or (tg_op = 'UPDATE' and new.is_consumable is distinct from old.is_consumable);
  else
    v_changed := (tg_op = 'INSERT' and new.is_consumables_vendor) or (tg_op = 'UPDATE' and new.is_consumables_vendor is distinct from old.is_consumables_vendor);
  end if;
  if v_changed and auth.uid() is not null
     and coalesce(public.auth_role()::text, '') <> 'admin' then
    raise exception 'Only an Admin can change what counts as a consumable.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
