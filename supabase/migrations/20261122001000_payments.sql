-- Slice 12: Payments received (receipts against invoices) and payments made (against bills), modelled on
-- lejar.ai's /payments-received and /payments-made (observed 2026-11-22, docs/re/12-payments.md).

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment'));

alter table public.invoices add column paid_amount numeric(14, 2) not null default 0, add column sst_released numeric(14, 2) not null default 0;
alter table public.bills add column paid_amount numeric(14, 2) not null default 0;

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  receipt_date date not null,
  bank_account_id uuid not null references public.accounts (id),
  reference text check (reference is null or char_length(reference) <= 100),
  amount numeric(14, 2) not null check (amount > 0),
  bank_charges numeric(14, 2) not null default 0 check (bank_charges >= 0),
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_on date,
  void_reason text,
  statement_line_id uuid references public.bank_statement_lines (id) on delete set null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  check (bank_charges < amount)
);
create table public.receipt_allocations (
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id),
  org_id uuid not null references public.organizations (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  sst_moved numeric(14, 2) not null default 0,
  primary key (receipt_id, invoice_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  payment_date date not null,
  paid_from_account_id uuid not null references public.accounts (id),
  paid_by_owner boolean not null default false,
  reference text check (reference is null or char_length(reference) <= 100),
  amount numeric(14, 2) not null check (amount > 0),
  bank_charges numeric(14, 2) not null default 0 check (bank_charges >= 0),
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_on date,
  void_reason text,
  statement_line_id uuid references public.bank_statement_lines (id) on delete set null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create table public.payment_allocations (
  payment_id uuid not null references public.payments (id) on delete cascade,
  bill_id uuid not null references public.bills (id),
  org_id uuid not null references public.organizations (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  primary key (payment_id, bill_id)
);

do $$
declare t text;
begin
  foreach t in array array['receipts', 'receipt_allocations', 'payments', 'payment_allocations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------

/**
 * Records a receipt. p_r: {receiptDate, bankAccountCode, reference, bankCharges, statementLineId?,
 * allocations: [{invoiceId, amount}]}. Posts Dr bank (received - charges), Dr 900-0600 Bank Charges,
 * Cr each invoice's receivable account; and moves the invoice's service tax from 400-1700 Deferred SST
 * to 400-1300 SST Output Tax in proportion to what was paid (all of it once the invoice is paid).
 */
create function public.record_receipt_core(p_org uuid, p_r jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_on date := (p_r->>'receiptDate')::date;
  v_bank uuid;
  v_charges numeric := round(coalesce(nullif(p_r->>'bankCharges', '')::numeric, 0), 2);
  v_total numeric := 0;
  v_id uuid;
  a jsonb;
  inv public.invoices;
  v_amt numeric;
  v_service numeric;
  v_move numeric;
  v_lines jsonb := '[]';
  v_moved_total numeric := 0;
  v_je uuid;
  v_charge_acct uuid;
begin
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  select id into v_bank from public.accounts where org_id = p_org and code = p_r->>'bankAccountCode' and is_cash and status = 'active';
  if v_bank is null then raise exception 'not_cash_account' using errcode = '22023'; end if;
  insert into public.receipts (org_id, receipt_date, bank_account_id, reference, amount, bank_charges, statement_line_id, created_by)
  values (p_org, v_on, v_bank, nullif(btrim(coalesce(p_r->>'reference', '')), ''), 0.01, 0, nullif(p_r->>'statementLineId', '')::uuid, auth.uid())
  returning id into v_id;
  for a in select * from jsonb_array_elements(p_r->'allocations') loop
    v_amt := round(coalesce(nullif(a->>'amount', '')::numeric, 0), 2);
    if v_amt = 0 then continue; end if;
    if v_amt < 0 then raise exception 'amount_format' using errcode = '22023'; end if;
    select * into inv from public.invoices where id = (a->>'invoiceId')::uuid and org_id = p_org for update;
    if inv.id is null or inv.status <> 'open' then raise exception 'invoice_not_open' using errcode = '22023'; end if;
    if v_amt > inv.total - inv.paid_amount then raise exception 'over_allocated' using errcode = '22023', detail = inv.invoice_number; end if;
    if v_on < inv.invoice_date then raise exception 'before_invoice' using errcode = '22023', detail = inv.invoice_number; end if;
    select coalesce(sum(tax_amount), 0) into v_service from public.invoice_lines where invoice_id = inv.id and tax_code in ('sst_6', 'sst_8');
    v_move := case when inv.paid_amount + v_amt >= inv.total then v_service - inv.sst_released
                   else least(v_service - inv.sst_released, round(v_service * v_amt / inv.total, 2)) end;
    insert into public.receipt_allocations (receipt_id, invoice_id, org_id, amount, sst_moved) values (v_id, inv.id, p_org, v_amt, v_move);
    update public.invoices set paid_amount = paid_amount + v_amt, sst_released = sst_released + v_move,
      status = case when paid_amount + v_amt >= total then 'paid' else status end, updated_at = now()
    where id = inv.id;
    v_lines := v_lines || jsonb_build_object('accountId', inv.receivable_account_id, 'credit', v_amt, 'description', inv.invoice_number);
    v_total := v_total + v_amt;
    v_moved_total := v_moved_total + v_move;
  end loop;
  if v_total = 0 then raise exception 'no_allocation' using errcode = '22023'; end if;
  if v_charges >= v_total then raise exception 'charges_too_high' using errcode = '22023'; end if;
  v_lines := jsonb_build_array(jsonb_build_object('accountId', v_bank, 'debit', v_total - v_charges, 'description', coalesce(p_r->>'reference', 'Receipt'))) || v_lines;
  if v_charges > 0 then
    v_charge_acct := public.account_id_for(p_org, '900-0600');
    v_lines := v_lines || jsonb_build_object('accountId', v_charge_acct, 'debit', v_charges, 'description', 'Bank charges');
  end if;
  if v_moved_total > 0 then
    v_lines := v_lines
      || jsonb_build_object('accountId', public.account_id_for(p_org, '400-1700'), 'debit', v_moved_total, 'description', 'SST due on payment')
      || jsonb_build_object('accountId', public.account_id_for(p_org, '400-1300'), 'credit', v_moved_total, 'description', 'SST due on payment');
  end if;
  v_je := public.insert_journal(p_org, null, v_on, 'Receipt' || coalesce(' ' || nullif(btrim(coalesce(p_r->>'reference', '')), ''), ''), 'receipt', v_id, null, null, v_lines);
  update public.receipts set amount = v_total, bank_charges = v_charges, journal_entry_id = v_je where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.record_receipt_core(uuid, jsonb) from public, anon, authenticated;

create function public.record_receipt(p_slug text, p_r jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return public.record_receipt_core(public.learn_org_for_editor(p_slug), p_r);
end;
$$;

/** Voids a receipt: reverses its entry on the void date and gives the invoices their balance back. */
create function public.void_receipt(p_slug text, p_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  r public.receipts;
  a record;
  v_lines jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  select * into r from public.receipts where id = p_id and org_id = v_org for update;
  if r.id is null or r.status <> 'recorded' then raise exception 'not_found' using errcode = '22023'; end if;
  if p_on is null or p_on < r.receipt_date then raise exception 'void_date' using errcode = '22023'; end if;
  for a in select * from public.receipt_allocations where receipt_id = p_id loop
    update public.invoices set paid_amount = paid_amount - a.amount, sst_released = sst_released - a.sst_moved,
      status = case when status = 'paid' then 'open' else status end, updated_at = now()
    where id = a.invoice_id;
  end loop;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = r.journal_entry_id;
  update public.receipts set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void receipt: ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
end;
$$;

/**
 * Records a payment. p_p: {paymentDate, paidFromCode, paidByOwner, reference, bankCharges, statementLineId?,
 * allocations: [{billId, amount}]}. Posts Dr each bill's payable account, Dr 900-0600 Bank Charges,
 * Cr the bank (or the owner's account when paid personally) for the total.
 */
create function public.record_payment_core(p_org uuid, p_p jsonb) returns uuid
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
    if v_amt > b.total - b.paid_amount then raise exception 'over_allocated' using errcode = '22023', detail = b.bill_number; end if;
    if v_on < b.bill_date then raise exception 'before_bill' using errcode = '22023', detail = b.bill_number; end if;
    insert into public.payment_allocations (payment_id, bill_id, org_id, amount) values (v_id, b.id, p_org, v_amt);
    update public.bills set paid_amount = paid_amount + v_amt, status = case when paid_amount + v_amt >= total then 'paid' else status end where id = b.id;
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

revoke all on function public.record_payment_core(uuid, jsonb) from public, anon, authenticated;

create function public.record_payment(p_slug text, p_p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return public.record_payment_core(public.learn_org_for_editor(p_slug), p_p);
end;
$$;

create function public.void_payment(p_slug text, p_id uuid, p_on date, p_reason text) returns void
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
    update public.bills set paid_amount = paid_amount - a.amount, status = case when status = 'paid' then 'open' else status end where id = a.bill_id;
  end loop;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = p.journal_entry_id;
  update public.payments set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void payment: ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
end;
$$;

/**
 * lejar.ai's settleStatementLineAction: "Record as receipt against INV…" / "Record as payment against BILL…"
 * on a bank import line. Records the receipt or payment for the line's full amount on its date and bank
 * account, and marks the line recorded (which clears it for reconciliation). Checks Learn section 4.
 */
create function public.settle_statement_line(p_slug text, p_line uuid, p_doc uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  l record;
  v_id uuid;
  v_je uuid;
begin
  select bl.*, s.account_id bank_account, a.code bank_code into l
  from public.bank_statement_lines bl join public.bank_statements s on s.id = bl.statement_id join public.accounts a on a.id = s.account_id
  where bl.id = p_line and bl.org_id = v_org and bl.status = 'draft';
  if l.id is null then raise exception 'line_not_draft' using errcode = '22023'; end if;
  if l.direction = 'in' then
    v_id := public.record_receipt_core(v_org, jsonb_build_object('receiptDate', l.txn_date, 'bankAccountCode', l.bank_code, 'reference', left(l.description, 100),
      'statementLineId', l.id, 'allocations', jsonb_build_array(jsonb_build_object('invoiceId', p_doc, 'amount', l.amount))));
    select journal_entry_id into v_je from public.receipts where id = v_id;
  else
    v_id := public.record_payment_core(v_org, jsonb_build_object('paymentDate', l.txn_date, 'paidFromCode', l.bank_code, 'reference', left(l.description, 100),
      'statementLineId', l.id, 'allocations', jsonb_build_array(jsonb_build_object('billId', p_doc, 'amount', l.amount))));
    select journal_entry_id into v_je from public.payments where id = v_id;
  end if;
  update public.bank_statement_lines set status = 'recorded', journal_entry_id = v_je where id = l.id;
  perform public.check_learn_section(v_org, 'import-bank');
  return jsonb_build_object('id', v_id, 'kind', case when l.direction = 'in' then 'receipt' else 'payment' end);
end;
$$;

/** Recorded invoices with receipts cannot be voided (lejar.ai offers a credit note instead). */
create or replace function public.void_invoice(p_slug text, p_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  inv public.invoices;
  v_lines jsonb;
  v_je uuid;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  if p_on is null then raise exception 'void_date' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = p_id and org_id = v_org for update;
  if inv.id is null or inv.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;
  if inv.paid_amount > 0 then raise exception 'has_receipts' using errcode = '22023'; end if;
  if p_on < inv.invoice_date then raise exception 'void_date' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = inv.journal_entry_id;
  v_je := public.insert_journal(v_org, null, p_on, 'Void invoice ' || inv.invoice_number || ': ' || left(btrim(p_reason), 200),
                                'void', p_id, null, null, v_lines);
  update public.invoices set status = 'void', void_entry_id = v_je, voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    updated_at = now() where id = p_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['record_receipt(text, jsonb)', 'void_receipt(text, uuid, date, text)', 'record_payment(text, jsonb)',
    'void_payment(text, uuid, date, text)', 'settle_statement_line(text, uuid, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
