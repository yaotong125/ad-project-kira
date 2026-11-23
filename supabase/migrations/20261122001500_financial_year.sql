-- Slice 17: Financial year (lejar.ai /periods) and Settings → Accounting → Control accounts
-- (lejar.ai /settings/control-accounts), observed 2026-11-22, docs/re/17-financial-year.md.

-- ---------------------------------------------------------------------------------------------
-- Control accounts: the receivable / payable accounts Kira posts to automatically.
alter table public.organizations
  add column ar_account_id uuid references public.accounts (id),
  add column ap_account_id uuid references public.accounts (id),
  add column non_trade_ar_account_id uuid references public.accounts (id),
  add column non_trade_ap_account_id uuid references public.accounts (id);

-- Kira's behaviour so far: trade 300-0200, non-trade 300-0400, payables 400-0100.
update public.organizations o set
  ar_account_id = (select id from public.accounts a where a.org_id = o.id and a.code = '300-0200'),
  ap_account_id = (select id from public.accounts a where a.org_id = o.id and a.code = '400-0100'),
  non_trade_ar_account_id = (select id from public.accounts a where a.org_id = o.id and a.code = '300-0400');

/** New entities: point the control accounts at the seeded chart once it exists. */
create function public.default_control_accounts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.code = '300-0200' then
    update public.organizations set ar_account_id = new.id where id = new.org_id and ar_account_id is null;
  elsif new.code = '400-0100' then
    update public.organizations set ap_account_id = new.id where id = new.org_id and ap_account_id is null;
  elsif new.code = '300-0400' then
    update public.organizations set non_trade_ar_account_id = new.id where id = new.org_id and non_trade_ar_account_id is null;
  end if;
  return new;
end;
$$;
create trigger accounts_default_control after insert on public.accounts
  for each row execute function public.default_control_accounts();

/** The org's control account of a kind (ar | ap | non_trade_ar | non_trade_ap); raises when not set or disabled. */
create function public.control_account(p_org uuid, p_kind text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select case p_kind when 'ar' then ar_account_id when 'ap' then ap_account_id
                     when 'non_trade_ar' then non_trade_ar_account_id when 'non_trade_ap' then non_trade_ap_account_id end
    into v_id from public.organizations where id = p_org;
  if v_id is null or not exists (select 1 from public.accounts where id = v_id and status = 'active') then
    raise exception 'control_account_missing' using errcode = '22023', detail = p_kind;
  end if;
  return v_id;
end;
$$;
revoke all on function public.control_account(uuid, text) from public, anon, authenticated;

/** Accounts Kira posts to by itself: the fixed SST / bank-charge codes plus the org's control accounts. */
create function public.is_system_account(p_org uuid, p_id uuid, p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select p_code = any (array['300-1100', '400-1300', '400-1400', '400-1700', '900-0600'])
      or exists (select 1 from public.organizations o where o.id = p_org
                 and p_id in (o.ar_account_id, o.ap_account_id, o.non_trade_ar_account_id, o.non_trade_ap_account_id));
$$;
grant execute on function public.is_system_account(uuid, uuid, text) to authenticated;

create or replace function public.guard_system_account() returns trigger
language plpgsql as $$
begin
  if public.is_system_account(old.org_id, old.id, old.code)
     and (new.code is distinct from old.code or new.type is distinct from old.type or new.is_cash is distinct from old.is_cash
          or (old.status = 'active' and new.status is distinct from 'active')) then
    raise exception 'system_account' using errcode = '22023', detail = old.code;
  end if;
  return new;
end;
$$;

create or replace function public.delete_account(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_a public.accounts;
begin
  select * into v_a from public.accounts where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if public.is_system_account(v_org, v_a.id, v_a.code) then
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

/** Posts a draft invoice, debiting the trade or non-trade AR control account (as in 20261122000600 otherwise). */
create or replace function public.post_invoice(p_org uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  inv public.invoices;
  v_ar uuid;
  v_lines jsonb := '[]';
  r record;
  v_je uuid;
begin
  select * into inv from public.invoices where id = p_id and org_id = p_org for update;
  if inv.id is null or inv.status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
  select public.control_account(p_org, case when c.trade_classification = 'non_trade' then 'non_trade_ar' else 'ar' end)
    into v_ar from public.contacts c where c.id = inv.contact_id;
  v_lines := v_lines || jsonb_build_object('accountId', v_ar, 'debit', inv.total, 'description', inv.invoice_number);
  for r in select account_id, sum(net) net from public.invoice_lines where invoice_id = p_id group by account_id loop
    v_lines := v_lines || jsonb_build_object('accountId', r.account_id, 'credit', r.net, 'description', inv.invoice_number);
  end loop;
  for r in select case when tax_code in ('sst_6', 'sst_8') then '400-1700' else '400-1300' end code, sum(tax_amount) tax
           from public.invoice_lines where invoice_id = p_id and tax_amount > 0 group by 1 loop
    v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(p_org, r.code), 'credit', r.tax, 'description', 'SST');
  end loop;
  v_je := public.insert_journal(p_org, null, inv.invoice_date, 'Invoice ' || inv.invoice_number, 'invoice', p_id,
                                inv.source_document_id, inv.ai_draft_id, v_lines);
  update public.invoices set status = 'open', receivable_account_id = v_ar, journal_entry_id = v_je, recorded_at = now(),
    updated_at = now() where id = p_id;
  if inv.ai_draft_id is not null then
    perform public.inbox_mark_recorded(p_org, inv.ai_draft_id, 'invoice', p_id);
  end if;
  perform public.check_learn_section(p_org, 'send-invoice');
end;
$$;
revoke all on function public.post_invoice(uuid, uuid) from public, anon, authenticated;

/**
 * lejar.ai's Control accounts form (owner-only). p: {arAccountId, apAccountId, nonTradeArAccountId,
 * nonTradeApAccountId}; AR must be an asset or contra-asset, AP a liability or contra-liability; neither a
 * cash account. AR and AP are required, the non-trade ones optional.
 */
create function public.set_control_accounts(p_slug text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
  v_ar uuid := nullif(p->>'arAccountId', '')::uuid;
  v_ap uuid := nullif(p->>'apAccountId', '')::uuid;
  v_ntar uuid := nullif(p->>'nonTradeArAccountId', '')::uuid;
  v_ntap uuid := nullif(p->>'nonTradeApAccountId', '')::uuid;
  k text;
  v_id uuid;
  v_side text;
begin
  if v_ar is null then raise exception 'ar_required' using errcode = '22023'; end if;
  if v_ap is null then raise exception 'ap_required' using errcode = '22023'; end if;
  foreach k in array array['ar', 'ap', 'non_trade_ar', 'non_trade_ap'] loop
    v_id := case k when 'ar' then v_ar when 'ap' then v_ap when 'non_trade_ar' then v_ntar else v_ntap end;
    if v_id is null then continue; end if;
    v_side := case when k like '%ar' then 'asset' else 'liability' end;
    if not exists (select 1 from public.accounts where id = v_id and org_id = v_org and status = 'active' and not is_cash
                   and type in (v_side, 'contra_' || v_side)) then
      raise exception 'bad_control_account' using errcode = '22023', detail = k;
    end if;
  end loop;
  if v_ar = v_ntar or v_ap = v_ntap then raise exception 'same_control_account' using errcode = '22023'; end if;
  update public.organizations set ar_account_id = v_ar, ap_account_id = v_ap,
    non_trade_ar_account_id = v_ntar, non_trade_ap_account_id = v_ntap where id = v_org;
end;
$$;
revoke all on function public.set_control_accounts(text, jsonb) from public, anon;
grant execute on function public.set_control_accounts(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Financial years: lock a year, add an earlier year.

/** True when p_on is in an open period of a year that is not locked. */
create function public.period_postable(p_org uuid, p_on date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.accounting_periods p join public.fiscal_years y on y.id = p.fiscal_year_id
    where p.org_id = p_org and p_on between p.starts_on and p.ends_on and p.status = 'open' and not y.locked);
$$;
revoke all on function public.period_postable(uuid, date) from public, anon, authenticated;

/** As before, plus lejar.ai's year lock ("Locking a year blocks new transactions (and voids)"). */
create or replace function public.assert_open_period(p_org uuid, p_on date) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.accounting_periods p join public.fiscal_years y on y.id = p.fiscal_year_id
    where p.org_id = p_org and p_on between p.starts_on and p.ends_on and p.status = 'open' and y.locked) then
    raise exception 'year_locked' using errcode = '22023';
  end if;
  if not public.period_postable(p_org, p_on) then
    raise exception 'period_closed' using errcode = '22023';
  end if;
end;
$$;

/** record_deemed_sst as in 20261122001400, with "open" meaning open and not in a locked year. */
create or replace function public.record_deemed_sst(p_slug text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_today date := public.today_my();
  v_lock date;
  r record;
  v_legal date;
  v_on date;
  v_je uuid;
  v_n int := 0;
begin
  select sst_locked_until into v_lock from public.organizations where id = v_org;
  for r in
    select i.id, i.invoice_number, i.invoice_date, i.sst_released,
           (select coalesce(sum(l.tax_amount), 0) from public.invoice_lines l where l.invoice_id = i.id and l.tax_code in ('sst_6', 'sst_8')) service,
           (select max(rc.voided_on) from public.receipt_allocations ra join public.receipts rc on rc.id = ra.receipt_id
             where ra.invoice_id = i.id and ra.sst_moved > 0 and rc.status = 'void') last_receipt_void
    from public.invoices i
    where i.org_id = v_org and i.status = 'open' and i.journal_entry_id is not null
      and (i.invoice_date + interval '12 months')::date + 1 <= v_today
    for update of i
  loop
    if r.service - r.sst_released <= 0 then continue; end if;
    v_legal := greatest((r.invoice_date + interval '12 months')::date + 1, coalesce(r.last_receipt_void, r.invoice_date));
    if v_legal > v_today then continue; end if;
    v_on := v_legal;
    if (v_lock is not null and v_on <= v_lock) or not public.period_postable(v_org, v_on) then
      v_on := v_today;
    end if;
    if not public.period_postable(v_org, v_on) then continue; end if;
    v_je := public.insert_journal(v_org, null, v_on, 'Deemed payment: service tax on ' || r.invoice_number, 'sst', r.id, null, null,
      jsonb_build_array(
        jsonb_build_object('accountId', public.account_id_for(v_org, '400-1700'), 'debit', r.service - r.sst_released, 'description', 'SST deemed paid'),
        jsonb_build_object('accountId', public.account_id_for(v_org, '400-1300'), 'credit', r.service - r.sst_released, 'description', 'SST deemed paid')));
    insert into public.sst_deemed_moves (org_id, invoice_id, legal_on, counts_on, recorded_on, amount, entry_id)
    values (v_org, r.id, v_legal, case when v_lock is not null and v_legal <= v_lock then v_on else v_legal end, v_on, r.service - r.sst_released, v_je);
    update public.invoices set sst_released = r.service, updated_at = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

/** "Lock year" / "Unlock year" (owner or admin). */
create function public.set_fiscal_year_locked(p_slug text, p_year uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
begin
  update public.fiscal_years set locked = coalesce(p_locked, false) where id = p_year and org_id = v_org;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end;
$$;

/**
 * "Add this year": adds the 12-month financial year before the books start, split by the entity's cadence,
 * and moves the books start back (lejar.ai's earlierYears errors: too_far, long_first_year, year_locked,
 * leap_year_end). Up to 6 financial years before the current one.
 */
create function public.add_earlier_year(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  o public.organizations;
  v_first public.fiscal_years;
  v_current date;
  v_start date;
  v_end date;
  v_year uuid;
  v_step int;
  v_p date;
begin
  select * into o from public.organizations where id = v_org for update;
  select * into v_first from public.fiscal_years where org_id = v_org order by starts_on limit 1;
  if to_char(o.fiscal_year_end, 'MM-DD') = '02-29' or to_char(v_first.ends_on, 'MM-DD') = '02-29' then
    raise exception 'leap_year_end' using errcode = '22023';
  end if;
  if (v_first.starts_on + interval '12 months')::date <> v_first.ends_on + 1 then
    raise exception 'long_first_year' using errcode = '22023';
  end if;
  if v_first.locked or exists (select 1 from public.accounting_periods where fiscal_year_id = v_first.id and status <> 'open') then
    raise exception 'year_locked' using errcode = '22023';
  end if;
  select starts_on into v_current from public.fiscal_years
    where org_id = v_org and starts_on <= public.today_my() order by starts_on desc limit 1;
  v_start := (v_first.starts_on - interval '12 months')::date;
  v_end := v_first.starts_on - 1;
  if v_start < (coalesce(v_current, v_first.starts_on) - interval '6 years')::date then
    raise exception 'too_far' using errcode = '22023';
  end if;
  insert into public.fiscal_years (org_id, starts_on, ends_on) values (v_org, v_start, v_end) returning id into v_year;
  v_step := case o.cadence when 'monthly' then 1 when 'quarterly' then 3 else 2 end;
  v_p := v_start;
  while v_p <= v_end loop
    insert into public.accounting_periods (org_id, fiscal_year_id, starts_on, ends_on)
    values (v_org, v_year, v_p, least((v_p + make_interval(months => v_step))::date - 1, v_end));
    v_p := (v_p + make_interval(months => v_step))::date;
  end loop;
  update public.organizations set books_start = v_start where id = v_org;
  return jsonb_build_object('startsOn', v_start, 'endsOn', v_end);
end;
$$;

revoke all on function public.set_fiscal_year_locked(text, uuid, boolean) from public, anon;
revoke all on function public.add_earlier_year(text) from public, anon;
grant execute on function public.set_fiscal_year_locked(text, uuid, boolean) to authenticated;
grant execute on function public.add_earlier_year(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Close events: a fingerprint of the books at the period end (lejar.ai shows a 12-character hash per event;
-- closing twice over unchanged books gives the same hash).
alter table public.period_events add column digest text;

create function public.period_event_digest() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_end date;
  v_snap text;
begin
  select ends_on into v_end from public.accounting_periods where id = new.period_id;
  select coalesce(string_agg(account_id::text || '=' || net::text, ';' order by account_id), '') into v_snap
  from (select l.account_id, sum(l.debit - l.credit) net
        from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
        where l.org_id = new.org_id and e.occurred_on <= v_end group by l.account_id) s;
  new.digest := encode(sha256(convert_to(new.action || ':' || new.period_id::text || ':' || v_snap, 'UTF8')), 'hex');
  return new;
end;
$$;
create trigger period_events_digest before insert on public.period_events
  for each row execute function public.period_event_digest();
