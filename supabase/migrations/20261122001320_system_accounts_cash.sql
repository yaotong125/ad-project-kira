-- System accounts (20261122001310) also keep their cash flag: marking receivables, payables or SST as a
-- bank / cash account would offer them in "Received into" / "Paid from" pickers.
create or replace function public.guard_system_account() returns trigger
language plpgsql as $$
begin
  if old.code = any (public.system_account_codes())
     and (new.code is distinct from old.code or new.type is distinct from old.type
          or new.is_cash is distinct from old.is_cash
          or (old.status = 'active' and new.status is distinct from 'active')) then
    raise exception 'system_account' using errcode = '22023', detail = old.code;
  end if;
  return new;
end;
$$;
