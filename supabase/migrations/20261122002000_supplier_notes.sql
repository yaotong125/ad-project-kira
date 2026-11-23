-- Slice 22: supplier credit / debit notes on a bill (lejar.ai /bills/notes, "Record supplier credit note" on the bill
-- page, observed 2026-11-23; docs/re/22-supplier-notes.md), plus the bill page's Void.

alter table public.bills
  add column notes_credit numeric(14, 2) not null default 0,
  add column notes_debit numeric(14, 2) not null default 0,
  add column voided_on date,
  add column void_reason text,
  add column void_entry_id uuid references public.journal_entries (id),
  add column amount_due numeric(14, 2) generated always as (total + notes_debit - notes_credit - paid_amount) stored;

create table public.supplier_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  bill_id uuid not null references public.bills (id) on delete cascade,
  kind text not null check (kind in ('credit', 'debit')),
  note_number text not null check (char_length(note_number) between 1 and 50),
  note_date date not null,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'draft' check (status in ('draft', 'recorded', 'void')),
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_on date,
  void_reason text,
  recorded_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, note_number)
);
create index supplier_notes_bill_idx on public.supplier_notes (bill_id);

create table public.supplier_note_lines (
  note_id uuid not null references public.supplier_notes (id) on delete cascade,
  line_no integer not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 500),
  account_id uuid not null references public.accounts (id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_amount numeric(14, 2) not null check (unit_amount > 0),
  amount numeric(14, 2) not null,
  tax_code text not null check (tax_code in ('none', 'sst_6', 'sst_8', 'sales_5', 'sales_10', 'exempt')),
  tax_amount numeric(14, 2) not null,
  primary key (note_id, line_no)
);

do $$
declare t text;
begin
  foreach t in array array['supplier_notes', 'supplier_note_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

/** SCN-202611-001 / SDN-…, per kind and month (lejar.ai: "Assigned when saved"). */
create function public.next_supplier_note_number(p_org uuid, p_kind text, p_on date) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_stem text := case p_kind when 'debit' then 'SDN' else 'SCN' end || '-' || to_char(p_on, 'YYYYMM') || '-';
  v_max int;
begin
  if not public.is_org_member(p_org) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select max(substring(note_number from char_length(v_stem) + 1)::int) into v_max
  from public.supplier_notes where org_id = p_org and note_number ~ ('^' || v_stem || '[0-9]+$');
  return v_stem || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;
grant execute on function public.next_supplier_note_number(uuid, text, date) to authenticated;

create function public.refresh_bill_status(p_bill uuid) returns void
language sql security definer set search_path = public as $$
  update public.bills set status = case when amount_due <= 0 then 'paid' else 'open' end
  where id = p_bill and status in ('open', 'paid');
$$;
revoke all on function public.refresh_bill_status(uuid) from public, anon, authenticated;

/**
 * "Save note" (a draft). p: {noteId?, billId, kind, noteNumber (empty = auto), noteDate, reason, lines: [{description,
 * accountCode, quantity, amount (per unit, before tax), taxCode}]}. lejar.ai: "A credit note cannot be larger than
 * the bill it is against" (its creditable balance: total + debit notes - credit notes).
 */
create function public.save_supplier_note(p_slug text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  b public.bills;
  v_id uuid := nullif(p->>'noteId', '')::uuid;
  v_kind text := p->>'kind';
  v_on date := nullif(p->>'noteDate', '')::date;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_number text := nullif(btrim(coalesce(p->>'noteNumber', '')), '');
  v_line jsonb;
  v_n int := 0;
  v_acct uuid;
  v_qty numeric; v_unit numeric; v_net numeric; v_tax numeric; v_code text;
  v_sub numeric := 0; v_tax_total numeric := 0;
begin
  if v_kind not in ('credit', 'debit') or v_on is null then raise exception 'kind_and_date' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'reason' using errcode = '22023'; end if;
  select * into b from public.bills where id = (p->>'billId')::uuid and org_id = v_org;
  if b.id is null or b.status not in ('open', 'paid') then raise exception 'select_bill' using errcode = '22023'; end if;
  if v_on < b.bill_date then raise exception 'before_bill' using errcode = '22023'; end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'at_least_one_line' using errcode = '22023'; end if;
  if v_id is null then
    v_number := coalesce(v_number, public.next_supplier_note_number(v_org, v_kind, v_on));
    insert into public.supplier_notes (org_id, bill_id, kind, note_number, note_date, reason, created_by)
    values (v_org, b.id, v_kind, v_number, v_on, left(v_reason, 500), auth.uid()) returning id into v_id;
  else
    update public.supplier_notes set kind = v_kind, note_date = v_on, reason = left(v_reason, 500), note_number = coalesce(v_number, note_number)
    where id = v_id and org_id = v_org and status = 'draft';
    if not found then raise exception 'not_draft' using errcode = '22023'; end if;
    delete from public.supplier_note_lines where note_id = v_id;
  end if;
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_n := v_n + 1;
    if nullif(btrim(coalesce(v_line->>'description', '')), '') is null then raise exception 'line_description' using errcode = '22023'; end if;
    select id into v_acct from public.accounts where org_id = v_org and code = v_line->>'accountCode' and status = 'active' and not is_cash;
    if v_acct is null then raise exception 'line_account' using errcode = '22023'; end if;
    v_qty := nullif(v_line->>'quantity', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_positive' using errcode = '22023'; end if;
    v_unit := round(nullif(v_line->>'amount', '')::numeric, 2);
    if v_unit is null or v_unit <= 0 then raise exception 'line_positive' using errcode = '22023'; end if;
    v_code := coalesce(nullif(v_line->>'taxCode', ''), 'none');
    v_net := round(v_qty * v_unit, 2);
    v_tax := round(v_net * public.tax_rate(v_code), 2);
    insert into public.supplier_note_lines (note_id, line_no, org_id, description, account_id, quantity, unit_amount, amount, tax_code, tax_amount)
    values (v_id, v_n, v_org, left(btrim(v_line->>'description'), 500), v_acct, v_qty, v_unit, v_net, v_code, v_tax);
    v_sub := v_sub + v_net;
    v_tax_total := v_tax_total + v_tax;
  end loop;
  if v_kind = 'credit' and v_sub + v_tax_total > b.total + b.notes_debit - b.notes_credit then
    raise exception 'exceeds' using errcode = '22023', detail = (b.total + b.notes_debit - b.notes_credit)::text;
  end if;
  update public.supplier_notes set subtotal = v_sub, tax_total = v_tax_total, total = v_sub + v_tax_total where id = v_id;
  return v_id;
exception
  when unique_violation then raise exception 'note_number_taken' using errcode = '22023';
end;
$$;

/**
 * "Record note". Mirrors the bill's posting: a credit note posts Dr the bill's payable account, Cr each line
 * account and the SST (400-1400, as the bill took it); a debit note posts the other way round.
 */
create function public.record_supplier_note(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  n public.supplier_notes;
  b public.bills;
  v_side text;
  v_lines jsonb := '[]';
  r record;
  v_tax_acct uuid;
  v_je uuid;
begin
  select * into n from public.supplier_notes where id = p_id and org_id = v_org for update;
  if n.id is null or n.status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
  select * into b from public.bills where id = n.bill_id for update;
  if b.status not in ('open', 'paid') then raise exception 'select_bill' using errcode = '22023'; end if;
  if n.kind = 'credit' and n.total > b.total + b.notes_debit - b.notes_credit then
    raise exception 'exceeds' using errcode = '22023', detail = (b.total + b.notes_debit - b.notes_credit)::text;
  end if;
  v_side := case when n.kind = 'credit' then 'credit' else 'debit' end;
  for r in select account_id, sum(amount) amt from public.supplier_note_lines where note_id = p_id group by account_id loop
    v_lines := v_lines || jsonb_build_object('accountId', r.account_id, v_side, r.amt, 'description', n.note_number);
  end loop;
  if n.tax_total > 0 then
    select id into v_tax_acct from public.accounts where org_id = v_org and code = '400-1400' and status = 'active';
    v_lines := v_lines || jsonb_build_object('accountId', coalesce(v_tax_acct, (v_lines->0->>'accountId')::uuid), v_side, n.tax_total, 'description', 'SST');
  end if;
  v_lines := v_lines || jsonb_build_object('accountId', b.payable_account_id, case when n.kind = 'credit' then 'debit' else 'credit' end, n.total, 'description', b.bill_number);
  v_je := public.insert_journal(v_org, null, n.note_date,
    case n.kind when 'credit' then 'Supplier credit note ' else 'Supplier debit note ' end || n.note_number || ' on ' || b.bill_number,
    'note', p_id, null, null, v_lines);
  update public.bills set notes_credit = notes_credit + case when n.kind = 'credit' then n.total else 0 end,
    notes_debit = notes_debit + case when n.kind = 'debit' then n.total else 0 end where id = b.id;
  perform public.refresh_bill_status(b.id);
  update public.supplier_notes set status = 'recorded', journal_entry_id = v_je, recorded_at = now() where id = p_id;
end;
$$;

/** Void: a draft just closes; a recorded note is reversed on the void date ("Earlier months stay as they are"). */
create function public.void_supplier_note(p_slug text, p_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  n public.supplier_notes;
  b public.bills;
  v_lines jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  select * into n from public.supplier_notes where id = p_id and org_id = v_org for update;
  if n.id is null or n.status = 'void' then raise exception 'not_found' using errcode = '22023'; end if;
  if n.status = 'draft' then
    update public.supplier_notes set status = 'void', voided_on = public.today_my(), void_reason = left(btrim(p_reason), 500) where id = p_id;
    return;
  end if;
  if p_on is null or p_on < n.note_date then raise exception 'void_date' using errcode = '22023'; end if;
  select * into b from public.bills where id = n.bill_id for update;
  if n.kind = 'debit' and b.amount_due < n.total then raise exception 'note_paid' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = n.journal_entry_id;
  update public.supplier_notes set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void ' || n.note_number || ': ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
  update public.bills set notes_credit = notes_credit - case when n.kind = 'credit' then n.total else 0 end,
    notes_debit = notes_debit - case when n.kind = 'debit' then n.total else 0 end where id = b.id;
  perform public.refresh_bill_status(b.id);
end;
$$;

/** lejar.ai's bill Void: a recorded bill with no payments and no notes is reversed on the void date. */
create function public.void_bill(p_slug text, p_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  b public.bills;
  v_lines jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  select * into b from public.bills where id = p_id and org_id = v_org for update;
  if b.id is null or b.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;
  if b.paid_amount > 0 then raise exception 'has_payments' using errcode = '22023'; end if;
  if exists (select 1 from public.supplier_notes where bill_id = p_id and status <> 'void') then raise exception 'has_notes' using errcode = '22023'; end if;
  if p_on is null or p_on < b.bill_date then raise exception 'void_date' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = b.journal_entry_id;
  update public.bills set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void bill ' || b.bill_number || ': ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
end;
$$;

/** record_payment_core as in 20261122001000, against what the bill still owes after notes. */
create or replace function public.record_payment_core(p_org uuid, p_p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_on date := (p_p->>'paymentDate')::date;
  v_owner boolean := coalesce((p_p->>'paidByOwner')::boolean, false);
  v_from uuid;
  v_from_type text;
  v_charges numeric := round(coalesce(nullif(p_p->>'bankCharges', '')::numeric, 0), 2);
  v_total numeric := 0;
  v_id uuid;
  a jsonb;
  b public.bills;
  v_amt numeric;
  v_lines jsonb := '[]';
  v_je uuid;
begin
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  select id, type into v_from, v_from_type from public.accounts where org_id = p_org and code = p_p->>'paidFromCode' and status = 'active';
  if v_from is null then raise exception 'not_cash_account' using errcode = '22023'; end if;
  if not v_owner and not exists (select 1 from public.accounts where id = v_from and is_cash) then raise exception 'not_cash_account' using errcode = '22023'; end if;
  if v_owner and v_from_type not in ('equity', 'liability') then raise exception 'owner_account' using errcode = '22023'; end if;
  insert into public.payments (org_id, payment_date, paid_from_account_id, paid_by_owner, reference, amount, bank_charges, statement_line_id, created_by)
  values (p_org, v_on, v_from, v_owner, nullif(btrim(coalesce(p_p->>'reference', '')), ''), 0.01, 0, nullif(p_p->>'statementLineId', '')::uuid, auth.uid())
  returning id into v_id;
  for a in select * from jsonb_array_elements(p_p->'allocations') loop
    v_amt := round(coalesce(nullif(a->>'amount', '')::numeric, 0), 2);
    if v_amt = 0 then continue; end if;
    if v_amt < 0 then raise exception 'amount_format' using errcode = '22023'; end if;
    select * into b from public.bills where id = (a->>'billId')::uuid and org_id = p_org for update;
    if b.id is null or b.status <> 'open' then raise exception 'bill_not_open' using errcode = '22023'; end if;
    if v_amt > b.amount_due then raise exception 'over_allocated' using errcode = '22023', detail = b.bill_number; end if;
    if v_on < b.bill_date then raise exception 'before_bill' using errcode = '22023', detail = b.bill_number; end if;
    insert into public.payment_allocations (payment_id, bill_id, org_id, amount) values (v_id, b.id, p_org, v_amt);
    update public.bills set paid_amount = paid_amount + v_amt where id = b.id;
    perform public.refresh_bill_status(b.id);
    v_lines := v_lines || jsonb_build_object('accountId', b.payable_account_id, 'debit', v_amt, 'description', b.bill_number);
    v_total := v_total + v_amt;
  end loop;
  if v_total = 0 then raise exception 'no_allocation' using errcode = '22023'; end if;
  if v_charges > 0 then
    v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(p_org, '900-0600'), 'debit', v_charges, 'description', 'Bank charges');
  end if;
  v_lines := v_lines || jsonb_build_object('accountId', v_from, 'credit', v_total + v_charges, 'description', coalesce(p_p->>'reference', 'Payment'));
  v_je := public.insert_journal(p_org, null, v_on, 'Payment' || coalesce(' ' || nullif(btrim(coalesce(p_p->>'reference', '')), ''), ''), 'payment', v_id, null, null, v_lines);
  update public.payments set amount = v_total, bank_charges = v_charges, journal_entry_id = v_je where id = v_id;
  return v_id;
end;
$$;

/** void_payment as in 20261122001000, with the bill's status following what it owes. */
create or replace function public.void_payment(p_slug text, p_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  p public.payments;
  a record;
  v_lines jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  select * into p from public.payments where id = p_id and org_id = v_org for update;
  if p.id is null or p.status <> 'recorded' then raise exception 'not_found' using errcode = '22023'; end if;
  if p_on is null or p_on < p.payment_date then raise exception 'void_date' using errcode = '22023'; end if;
  for a in select * from public.payment_allocations where payment_id = p_id loop
    update public.bills set paid_amount = paid_amount - a.amount where id = a.bill_id;
    perform public.refresh_bill_status(a.bill_id);
  end loop;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = p.journal_entry_id;
  update public.payments set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void payment: ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
end;
$$;

/** ledger_tie_out as in 20261122001700; AP owed now counts supplier notes and leaves out voided bills from their void date. */
create or replace function public.ledger_tie_out(p_org uuid, p_as_of date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_lines jsonb := '[]';
  r record;
begin
  for r in
    with ar_accounts as (
      select id from public.accounts where org_id = p_org and code in ('300-0200', '300-0400')
      union select receivable_account_id from public.invoices where org_id = p_org
      union select x from public.organizations o, unnest(array[o.ar_account_id, o.non_trade_ar_account_id]) x where o.id = p_org and x is not null
    ), ap_accounts as (
      select id from public.accounts where org_id = p_org and code = '400-0100'
      union select payable_account_id from public.bills where org_id = p_org
      union select x from public.organizations o, unnest(array[o.ap_account_id, o.non_trade_ap_account_id]) x where o.id = p_org and x is not null
    ), ledger as (
      select l.account_id, sum(l.debit - l.credit) as net
      from public.journal_lines l join public.journal_entries e on e.id = l.entry_id
      where l.org_id = p_org and e.occurred_on <= p_as_of group by l.account_id
    ), ar_sub as (
      select i.receivable_account_id as account_id,
             sum(i.total
               - coalesce((
                 select sum(ra.amount) from public.receipt_allocations ra join public.receipts rc on rc.id = ra.receipt_id
                 where ra.invoice_id = i.id and rc.receipt_date <= p_as_of
                   and not (rc.status = 'void' and rc.voided_on <= p_as_of)), 0)
               + coalesce((
                 select sum(case n.kind when 'debit' then n.total when 'credit' then -(n.total - n.to_customer_credit) else 0 end)
                 from public.sales_notes n
                 where n.invoice_id = i.id and n.journal_entry_id is not null and n.note_date <= p_as_of
                   and not (n.status = 'void' and n.voided_on <= p_as_of)), 0)
               + coalesce((
                 select sum(m.amount) from public.customer_credit_moves m
                 where m.invoice_id = i.id and m.kind = 'apply' and m.on_date <= p_as_of
                   and not (m.status = 'undone' and m.undone_on <= p_as_of)), 0)) as owed
      from public.invoices i
      where i.org_id = p_org and i.status <> 'draft' and i.invoice_date <= p_as_of
        and not (i.status = 'void' and i.voided_on <= p_as_of)
      group by i.receivable_account_id
    ), ap_sub as (
      select b.payable_account_id as account_id,
             sum(b.total
               - coalesce((
                 select sum(pa.amount) from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
                 where pa.bill_id = b.id and p.payment_date <= p_as_of
                   and not (p.status = 'void' and p.voided_on <= p_as_of)), 0)
               + coalesce((
                 select sum(case n.kind when 'debit' then n.total else -n.total end) from public.supplier_notes n
                 where n.bill_id = b.id and n.journal_entry_id is not null and n.note_date <= p_as_of
                   and not (n.status = 'void' and n.voided_on <= p_as_of)), 0)) as owed
      from public.bills b
      where b.org_id = p_org and b.status <> 'draft' and b.bill_date <= p_as_of
        and not (b.status = 'void' and (b.voided_on is null or b.voided_on <= p_as_of))
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

do $$
declare f text;
begin
  foreach f in array array['save_supplier_note(text, jsonb)', 'record_supplier_note(text, uuid)', 'void_supplier_note(text, uuid, date, text)',
                           'void_bill(text, uuid, date, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
