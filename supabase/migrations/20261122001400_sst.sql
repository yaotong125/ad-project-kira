-- Slice 16: SST-02 returns (lejar.ai /sst, /sst/deemed and Settings → Tax & e-Invois → SST filing, observed
-- 2026-11-22, docs/re/16-sst.md): SST filing cadence and registration date, deemed payments (service tax
-- still unpaid 12 months after the invoice date moves to SST output on the next day), and the tax lock date.

alter table public.organizations
  add column sst_cadence text check (sst_cadence in ('bimonthly', 'monthly', 'quarterly')),
  add column sst_registered_on date,
  add column sst_locked_until date;

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal', 'sst'));

/**
 * One deemed payment: the invoice's unreleased service tax moved from 400-1700 Deferred SST to 400-1300 SST
 * Output Tax. legal_on = the day after 12 months from the invoice date (later if a receipt void put tax back
 * after that day); counts_on = the day the SST-02 return counts it (legal_on, or the recording day when the
 * legal day was already inside a filed, locked return). A void of the invoice takes the tax back on its date.
 */
create table public.sst_deemed_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  legal_on date not null,
  counts_on date not null,
  recorded_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  entry_id uuid not null references public.journal_entries (id),
  reversed_on date,
  created_at timestamptz not null default now()
);
create index sst_deemed_moves_org_idx on public.sst_deemed_moves (org_id, counts_on);
create index sst_deemed_moves_invoice_idx on public.sst_deemed_moves (invoice_id);
alter table public.sst_deemed_moves enable row level security;
create policy "sst_deemed_moves: members read" on public.sst_deemed_moves for select to authenticated using (public.is_org_member(org_id));

/** Malaysia's date today (the books run on MYT). */
create function public.today_my() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kuala_Lumpur')::date; $$;

/**
 * Records the deemed payments that are due: every open invoice whose service tax is not all released and
 * whose 12 months ended before today. Posts on the legal day when that day is in an open period and after
 * the tax lock, else today. Returns how many invoices moved. Safe to call on every SST page load.
 */
create function public.record_deemed_sst(p_slug text) returns int
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
    if (v_lock is not null and v_on <= v_lock) or not exists (
      select 1 from public.accounting_periods p where p.org_id = v_org and v_on between p.starts_on and p.ends_on and p.status = 'open') then
      v_on := v_today;
    end if;
    if not exists (select 1 from public.accounting_periods p where p.org_id = v_org and v_on between p.starts_on and p.ends_on and p.status = 'open') then
      continue; -- today's period is closed too: wait until it opens
    end if;
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

/**
 * void_invoice as in 20261122001000, plus: a deemed payment's tax goes back from 400-1300 to 400-1700 so the
 * reversal of the invoice entry leaves both accounts clean (lejar.ai: "The SST-02 return for the period of the
 * void date takes the deemed tax back").
 */
create or replace function public.void_invoice(p_slug text, p_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  inv public.invoices;
  v_lines jsonb;
  v_je uuid;
  v_deemed numeric;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  if p_on is null then raise exception 'void_date' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = p_id and org_id = v_org for update;
  if inv.id is null or inv.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;
  if inv.paid_amount > 0 then raise exception 'has_receipts' using errcode = '22023'; end if;
  if p_on < inv.invoice_date then raise exception 'void_date' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = inv.journal_entry_id;
  select coalesce(sum(amount), 0) into v_deemed from public.sst_deemed_moves where invoice_id = p_id and reversed_on is null;
  if v_deemed > 0 then
    v_lines := v_lines
      || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1300'), 'debit', v_deemed, 'description', 'Deemed SST taken back')
      || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1700'), 'credit', v_deemed, 'description', 'Deemed SST taken back');
    update public.sst_deemed_moves set reversed_on = p_on where invoice_id = p_id and reversed_on is null;
  end if;
  v_je := public.insert_journal(v_org, null, p_on, 'Void invoice ' || inv.invoice_number || ': ' || left(btrim(p_reason), 200),
                                'void', p_id, null, null, v_lines);
  update public.invoices set status = 'void', void_entry_id = v_je, voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    sst_released = 0, updated_at = now() where id = p_id;
end;
$$;

/**
 * lejar.ai's tax lock and deferred-SST rules, enforced where every posting lands:
 * - 400-1700 Deferred SST only takes invoices, receipts, their voids and deemed moves ("a manual journal is refused");
 * - after an SST-02 is filed and locked, nothing that changes what the return reads (invoices, receipts, their
 *   voids, deemed moves touching 400-1300 / 400-1700) may be dated on or before the lock. Bills, manual journals
 *   (such as the payment to Customs) and other entries still post on any open date.
 */
create function public.guard_sst_lines() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  e record;
begin
  select code into v_code from public.accounts where id = new.account_id;
  if v_code is null or v_code not in ('400-1300', '400-1700') then return new; end if;
  select je.occurred_on, je.source, o.sst_locked_until into e
  from public.journal_entries je join public.organizations o on o.id = je.org_id where je.id = new.entry_id;
  if v_code = '400-1700' and e.source not in ('invoice', 'receipt', 'void', 'sst') then
    raise exception 'deferred_sst_account' using errcode = '22023';
  end if;
  if e.source in ('invoice', 'receipt', 'void', 'sst') and e.sst_locked_until is not null and e.occurred_on <= e.sst_locked_until then
    raise exception 'tax_locked' using errcode = '22023', detail = to_char(e.sst_locked_until, 'YYYY-MM-DD');
  end if;
  return new;
end;
$$;
create trigger journal_lines_guard_sst before insert on public.journal_lines
  for each row execute function public.guard_sst_lines();

/** Settings → Tax & e-Invois → SST filing: cadence (null = group by bookkeeping periods) and registration date. */
create function public.set_sst_filing(p_slug text, p_cadence text, p_registered_on date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
begin
  if p_cadence is not null and p_cadence not in ('bimonthly', 'monthly', 'quarterly') then
    raise exception 'bad_cadence' using errcode = '22023';
  end if;
  if p_registered_on is not null and p_registered_on > public.today_my() + 366 then
    raise exception 'bad_registration_date' using errcode = '22023';
  end if;
  update public.organizations set sst_cadence = p_cadence, sst_registered_on = p_registered_on where id = v_org;
end;
$$;

/** Settings → Tax lock date. Null clears it. The lock cannot be later than today. */
create function public.set_sst_lock(p_slug text, p_until date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
begin
  if p_until is not null and p_until > public.today_my() then
    raise exception 'lock_in_future' using errcode = '22023';
  end if;
  update public.organizations set sst_locked_until = p_until where id = v_org;
end;
$$;

revoke all on function public.guard_sst_lines() from public, anon, authenticated;
revoke all on function public.record_deemed_sst(text) from public, anon;
revoke all on function public.set_sst_filing(text, text, date) from public, anon;
revoke all on function public.set_sst_lock(text, date) from public, anon;
grant execute on function public.record_deemed_sst(text) to authenticated;
grant execute on function public.set_sst_filing(text, text, date) to authenticated;
grant execute on function public.set_sst_lock(text, date) to authenticated;
grant execute on function public.today_my() to authenticated;
