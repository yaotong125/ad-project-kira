-- Slice 14: Ledger (lejar.ai /ledger, observed 2026-11-22, docs/re/14-ledger.md): close / reopen periods
-- with a sub-ledger tie-out, reverse an entry, void a manual entry.

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal'));

alter table public.journal_entries
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users (id),
  add column void_reason text,
  add column reversal_of uuid references public.journal_entries (id),
  add column reversed_by uuid references public.journal_entries (id);

-- lejar.ai: "Voiding removes this entry from all books and reports" but it stays visible for audit.
-- The lines move here, so every query over journal_lines leaves them out without a filter.
create table public.voided_journal_lines (
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  line_no int not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  description text,
  debit numeric(14, 2) not null default 0,
  credit numeric(14, 2) not null default 0,
  primary key (entry_id, line_no)
);
alter table public.voided_journal_lines enable row level security;
create policy "members read voided lines" on public.voided_journal_lines
  for select to authenticated using (org_id in (select org_id from public.organization_members where user_id = auth.uid()));

create table public.period_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  period_id uuid not null references public.accounting_periods (id) on delete cascade,
  action text not null check (action in ('close', 'reopen')),
  reason text,
  overridden boolean not null default false,
  tie_out jsonb,
  acted_by uuid references auth.users (id),
  acted_at timestamptz not null default now()
);
alter table public.period_events enable row level security;
create policy "members read period events" on public.period_events
  for select to authenticated using (org_id in (select org_id from public.organization_members where user_id = auth.uid()));

/** Owners and admins close and reopen periods (Kira's choice; members post entries). */
create function public.org_for_admin(p_slug text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select o.id into v_org from public.organizations o
  join public.organization_members m on m.org_id = o.id and m.user_id = auth.uid()
  where o.slug = p_slug and m.role in ('owner', 'admin');
  if v_org is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  return v_org;
end;
$$;

/**
 * lejar.ai's sub-ledger check: each receivable / payable account's ledger balance against what open
 * invoices / bills still owe, as of a date. Amounts in sen (minor units) like Lejar's tieOut.
 */
create function public.ledger_tie_out(p_org uuid, p_as_of date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lines jsonb := '[]';
  r record;
begin
  for r in
    with ar_accounts as (
      select id from public.accounts where org_id = p_org and code in ('300-0200', '300-0400')
      union select receivable_account_id from public.invoices where org_id = p_org
    ), ap_accounts as (
      select id from public.accounts where org_id = p_org and code = '400-0100'
      union select payable_account_id from public.bills where org_id = p_org
    ), ledger as (
      select l.account_id, sum(l.debit - l.credit) as net
      from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
      where l.org_id = p_org and e.occurred_on <= p_as_of group by l.account_id
    ), ar_sub as (
      select i.receivable_account_id as account_id,
             sum(i.total - coalesce((
               select sum(ra.amount) from public.receipt_allocations ra join public.receipts rc on rc.id = ra.receipt_id
               where ra.invoice_id = i.id and rc.receipt_date <= p_as_of
                 and not (rc.status = 'void' and rc.voided_on <= p_as_of)), 0)) as owed
      from public.invoices i
      where i.org_id = p_org and i.status <> 'draft' and i.invoice_date <= p_as_of
        and not (i.status = 'void' and i.voided_on <= p_as_of)
      group by i.receivable_account_id
    ), ap_sub as (
      select b.payable_account_id as account_id,
             sum(b.total - coalesce((
               select sum(pa.amount) from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
               where pa.bill_id = b.id and p.payment_date <= p_as_of
                 and not (p.status = 'void' and p.voided_on <= p_as_of)), 0)) as owed
      from public.bills b
      where b.org_id = p_org and b.status <> 'void' and b.bill_date <= p_as_of
      group by b.payable_account_id
    )
    select 'ar' as kind, a.code, a.name, a.id, coalesce(lg.net, 0) as ledger, coalesce(s.owed, 0) as sub
    from public.accounts a join ar_accounts x on x.id = a.id
    left join ledger lg on lg.account_id = a.id left join ar_sub s on s.account_id = a.id
    union all
    select 'ap', a.code, a.name, a.id, -coalesce(lg.net, 0), coalesce(s.owed, 0)
    from public.accounts a join ap_accounts x on x.id = a.id
    left join ledger lg on lg.account_id = a.id left join ap_sub s on s.account_id = a.id
    order by 1, 2
  loop
    v_lines := v_lines || jsonb_build_object(
      'kind', r.kind, 'account_id', r.id, 'account_code', r.code, 'account_name', r.name,
      'ledger_minor', round(r.ledger * 100)::bigint::text, 'sub_ledger_minor', round(r.sub * 100)::bigint::text,
      'difference_minor', round((r.ledger - r.sub) * 100)::bigint::text);
  end loop;
  return jsonb_build_object('as_of', p_as_of, 'lines', v_lines, 'flags', '[]'::jsonb);
end;
$$;

/**
 * lejar.ai's closePeriodWithRevaluationAction (no FX in Kira yet): runs the tie-out; differences stop the
 * close unless a reason to "Close anyway" is given. Kira also closes periods in order (earlier first).
 * Returns {ok, tieOut?, canOverride?, error?}.
 */
create function public.close_period(p_slug text, p_period uuid, p_override_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_p public.accounting_periods;
  v_earlier public.accounting_periods;
  v_tie jsonb;
  v_diff boolean;
  v_reason text := nullif(btrim(coalesce(p_override_reason, '')), '');
begin
  select * into v_p from public.accounting_periods where id = p_period and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_p.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;
  select * into v_earlier from public.accounting_periods
  where org_id = v_org and starts_on < v_p.starts_on and status <> 'closed' order by starts_on limit 1;
  if found then
    raise exception 'earlier_open' using errcode = '22023', detail = to_char(v_earlier.starts_on, 'DD/MM/YYYY') || ' to ' || to_char(v_earlier.ends_on, 'DD/MM/YYYY');
  end if;
  v_tie := public.ledger_tie_out(v_org, v_p.ends_on);
  v_diff := exists (select 1 from jsonb_array_elements(v_tie->'lines') l where l->>'difference_minor' <> '0');
  if v_diff and v_reason is null then
    return jsonb_build_object('ok', false, 'tieOut', v_tie, 'canOverride', true);
  end if;
  update public.accounting_periods set status = 'closed' where id = v_p.id;
  insert into public.period_events (org_id, period_id, action, reason, overridden, tie_out, acted_by)
  values (v_org, v_p.id, 'close', left(v_reason, 500), v_diff, v_tie, auth.uid());
  return jsonb_build_object('ok', true, 'tieOut', case when v_diff then v_tie end);
end;
$$;

/** lejar.ai's reopenPeriodAction: a reason is required. Kira reopens in order (latest closed first). */
create function public.reopen_period(p_slug text, p_period uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_p public.accounting_periods;
  v_later public.accounting_periods;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_p from public.accounting_periods where id = p_period and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_p.status <> 'closed' then raise exception 'not_closed' using errcode = '22023'; end if;
  if exists (select 1 from public.fiscal_years where id = v_p.fiscal_year_id and locked) then
    raise exception 'year_locked' using errcode = '22023';
  end if;
  select * into v_later from public.accounting_periods
  where org_id = v_org and starts_on > v_p.starts_on and status = 'closed' order by starts_on desc limit 1;
  if found then
    raise exception 'later_closed' using errcode = '22023', detail = to_char(v_later.starts_on, 'DD/MM/YYYY') || ' to ' || to_char(v_later.ends_on, 'DD/MM/YYYY');
  end if;
  update public.accounting_periods set status = 'open' where id = v_p.id;
  insert into public.period_events (org_id, period_id, action, reason, acted_by)
  values (v_org, v_p.id, 'reopen', left(btrim(p_reason), 500), auth.uid());
end;
$$;

/**
 * lejar.ai's reverseEntryAction: posts the opposite entry on the chosen date. Kira reverses manual
 * journal entries here; documents (invoices, bills, receipts, payments) are voided from their own pages
 * so their status stays right.
 */
create function public.reverse_journal_entry(p_slug text, p_entry uuid, p_on date, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_e public.journal_entries;
  v_lines jsonb;
  v_number text;
  v_id uuid;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_e from public.journal_entries where id = p_entry and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_e.source <> 'manual' then raise exception 'use_document' using errcode = '22023', detail = v_e.source; end if;
  if v_e.voided_at is not null then raise exception 'voided' using errcode = '22023'; end if;
  if v_e.reversed_by is not null then raise exception 'already_reversed' using errcode = '22023'; end if;
  if p_on is null or p_on < v_e.occurred_on then raise exception 'reverse_date' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'description', description, 'debit', credit, 'credit', debit) order by line_no)
  into v_lines from public.journal_lines where entry_id = v_e.id;
  v_number := public.next_doc_number(v_org, 'JV', p_on);
  v_id := public.insert_journal(v_org, v_number, p_on,
    left('Reversal of ' || coalesce(v_e.entry_number, 'entry') || ': ' || btrim(p_reason), 500), 'reversal', v_e.id, null, null, v_lines);
  update public.journal_entries set reversal_of = v_e.id where id = v_id;
  update public.journal_entries set reversed_by = v_id where id = v_e.id;
  return jsonb_build_object('entryId', v_id, 'occurredOn', p_on, 'number', v_number);
end;
$$;

/** lejar.ai's voidEntryAction for manual entries: only in an open period, never once reconciled or reversed. */
create function public.void_journal_entry(p_slug text, p_entry uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_e public.journal_entries;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into v_e from public.journal_entries where id = p_entry and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v_e.source <> 'manual' then raise exception 'use_document' using errcode = '22023', detail = v_e.source; end if;
  if v_e.voided_at is not null then raise exception 'voided' using errcode = '22023'; end if;
  if v_e.reversed_by is not null then raise exception 'has_reversal' using errcode = '22023'; end if;
  perform public.assert_open_period(v_org, v_e.occurred_on);
  if exists (select 1 from public.journal_lines where entry_id = v_e.id and reconciled_on is not null) then
    raise exception 'reconciled' using errcode = '22023';
  end if;
  insert into public.voided_journal_lines (entry_id, line_no, org_id, account_id, description, debit, credit)
  select entry_id, line_no, org_id, account_id, description, debit, credit from public.journal_lines where entry_id = v_e.id;
  delete from public.journal_lines where entry_id = v_e.id;
  update public.journal_entries set voided_at = now(), voided_by = auth.uid(), void_reason = left(btrim(p_reason), 500) where id = v_e.id;
end;
$$;

revoke all on function public.org_for_admin(text) from public, anon, authenticated;
revoke all on function public.ledger_tie_out(uuid, date) from public, anon, authenticated;
revoke all on function public.close_period(text, uuid, text) from public, anon;
revoke all on function public.reopen_period(text, uuid, text) from public, anon;
revoke all on function public.reverse_journal_entry(text, uuid, date, text) from public, anon;
revoke all on function public.void_journal_entry(text, uuid, text) from public, anon;
grant execute on function public.close_period(text, uuid, text) to authenticated;
grant execute on function public.reopen_period(text, uuid, text) to authenticated;
grant execute on function public.reverse_journal_entry(text, uuid, date, text) to authenticated;
grant execute on function public.void_journal_entry(text, uuid, text) to authenticated;
