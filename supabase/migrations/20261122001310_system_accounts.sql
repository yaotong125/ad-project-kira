-- Fix for slice 15 (chart of accounts): Kira's posting functions find these accounts by code and only
-- when active (account_id_for), so changing their code or type, disabling or deleting them would break
-- invoices, bills, receipts, payments, SST or "Add a bank account". Renaming, statement section and the
-- cash flag stay editable. (lejar.ai maps these roles under Settings → Accounting → control accounts,
-- not built in Kira yet.)
create function public.system_account_codes() returns text[]
language sql immutable as $$
  select array['300-0200', '300-0400', '300-1100', '400-0100', '400-1300', '400-1400', '400-1700', '900-0600'];
$$;
grant execute on function public.system_account_codes() to authenticated;

create function public.guard_system_account() returns trigger
language plpgsql as $$
begin
  if old.code = any (public.system_account_codes())
     and (new.code is distinct from old.code or new.type is distinct from old.type
          or (old.status = 'active' and new.status is distinct from 'active')) then
    raise exception 'system_account' using errcode = '22023', detail = old.code;
  end if;
  return new;
end;
$$;
create trigger accounts_guard_system before update on public.accounts
  for each row execute function public.guard_system_account();

-- delete_account as in 20261122001300, plus the system-account guard (a delete trigger would also block
-- deleting a whole entity, whose accounts go by cascade).
create or replace function public.delete_account(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_a public.accounts;
begin
  select * into v_a from public.accounts where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_a.code = any (public.system_account_codes()) then
    raise exception 'system_account' using errcode = '22023', detail = v_a.code;
  end if;
  if exists (select 1 from public.accounts where org_id = v_org and parent_id = v_a.id) then
    raise exception 'has_children' using errcode = '22023';
  end if;
  delete from public.accounts where id = v_a.id;
exception
  when foreign_key_violation then
    raise exception 'in_use' using errcode = '23503';
end;
$$;
