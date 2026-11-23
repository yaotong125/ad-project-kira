-- Slice 18: credit / debit / refund notes against a recorded sales invoice (lejar.ai /notes, observed
-- 2026-11-22/23 on the user's test entity and Lejar's demo company, docs/re/18-sales-notes.md).

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal', 'sst', 'note'));

-- What recorded notes did to the invoice. amount_due = what the customer still owes.
alter table public.invoices
  add column notes_credit numeric(14, 2) not null default 0,
  add column notes_debit numeric(14, 2) not null default 0,
  add column notes_refund numeric(14, 2) not null default 0,
  add column service_adjust numeric(14, 2) not null default 0,
  add column amount_due numeric(14, 2) generated always as (total + notes_debit - notes_credit - paid_amount) stored;

create table public.sales_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  kind text not null check (kind in ('credit', 'debit', 'refund')),
  note_number text not null check (char_length(note_number) between 1 and 50),
  note_date date not null,
  reason text not null check (char_length(reason) between 1 and 500),
  bank_account_id uuid references public.accounts (id),
  status text not null default 'draft' check (status in ('draft', 'recorded', 'void')),
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  sales_tax numeric(14, 2) not null default 0,
  service_tax numeric(14, 2) not null default 0,
  sst_from_output numeric(14, 2) not null default 0,
  sst_from_deferred numeric(14, 2) not null default 0,
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_on date,
  void_reason text,
  recorded_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, note_number),
  check (kind <> 'refund' or bank_account_id is not null)
);
create index sales_notes_invoice_idx on public.sales_notes (invoice_id);
create index sales_notes_org_date_idx on public.sales_notes (org_id, note_date desc);

create table public.sales_note_lines (
  note_id uuid not null references public.sales_notes (id) on delete cascade,
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

alter table public.sales_notes enable row level security;
alter table public.sales_note_lines enable row level security;
create policy "sales_notes: members read" on public.sales_notes for select to authenticated using (public.is_org_member(org_id));
create policy "sales_note_lines: members read" on public.sales_note_lines for select to authenticated using (public.is_org_member(org_id));

/** CN-202611-001 / DN-… / RN-…, per kind and month (lejar.ai's "Assigned when saved"). */
create function public.next_note_number(p_org uuid, p_kind text, p_on date) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_stem text := case p_kind when 'debit' then 'DN' when 'refund' then 'RN' else 'CN' end || '-' || to_char(p_on, 'YYYYMM') || '-';
  v_max int;
begin
  if not public.is_org_member(p_org) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select max(substring(note_number from char_length(v_stem) + 1)::int) into v_max
  from public.sales_notes where org_id = p_org and note_number ~ ('^' || v_stem || '[0-9]+$');
  return v_stem || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;
grant execute on function public.next_note_number(uuid, text, date) to authenticated;

/** The invoice's service tax after notes (lines plus what debit / credit / refund notes added or took). */
create function public.invoice_service_tax(p_invoice uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(tax_amount) from public.invoice_lines where invoice_id = p_invoice and tax_code in ('sst_6', 'sst_8')), 0)
       + coalesce((select service_adjust from public.invoices where id = p_invoice), 0);
$$;
revoke all on function public.invoice_service_tax(uuid) from public, anon, authenticated;

/**
 * Limits a note must keep (lejar.ai's "creditable balance"; Kira has no customer credit, so a credit note can
 * only take what is still owed and a refund note only what was paid).
 */
create function public.check_note_limits(p_inv public.invoices, p_kind text, p_total numeric) returns void
language plpgsql stable as $$
declare
  v_creditable numeric := p_inv.total + p_inv.notes_debit - p_inv.notes_credit - p_inv.notes_refund;
begin
  if p_kind in ('credit', 'refund') and p_total > v_creditable then
    raise exception 'exceeds' using errcode = '22023', detail = v_creditable::text;
  end if;
  if p_kind = 'credit' and p_total > p_inv.amount_due then
    raise exception 'credit_exceeds_due' using errcode = '22023', detail = p_inv.amount_due::text;
  end if;
  if p_kind = 'refund' and p_total > p_inv.paid_amount - p_inv.notes_refund then
    raise exception 'refund_exceeds_paid' using errcode = '22023', detail = (p_inv.paid_amount - p_inv.notes_refund)::text;
  end if;
end;
$$;

/**
 * lejar.ai's "Save note": creates a draft (or replaces a draft's content). p: {noteId?, invoiceId, kind,
 * noteNumber (empty = auto), noteDate, reason, bankAccountCode, lines: [{description, accountCode, quantity,
 * amount, taxCode}]}. Amounts are before tax; tax is worked out per line.
 */
create function public.save_sales_note(p_slug text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  inv public.invoices;
  v_id uuid := nullif(p->>'noteId', '')::uuid;
  v_kind text := p->>'kind';
  v_on date := nullif(p->>'noteDate', '')::date;
  v_reason text := nullif(btrim(coalesce(p->>'reason', '')), '');
  v_number text := nullif(btrim(coalesce(p->>'noteNumber', '')), '');
  v_bank uuid;
  v_line jsonb;
  v_n int := 0;
  v_acct uuid;
  v_qty numeric; v_amt numeric; v_net numeric; v_tax numeric; v_code text;
  v_sub numeric := 0; v_tax_total numeric := 0; v_sales numeric := 0; v_service numeric := 0;
begin
  if v_kind not in ('credit', 'debit', 'refund') or v_on is null then raise exception 'kind_and_date' using errcode = '22023'; end if;
  if v_reason is null then raise exception 'reason' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = (p->>'invoiceId')::uuid and org_id = v_org;
  if inv.id is null or inv.status not in ('open', 'paid') then raise exception 'select_invoice' using errcode = '22023'; end if;
  if v_on < inv.invoice_date then raise exception 'before_invoice' using errcode = '22023'; end if;
  if v_kind = 'refund' then
    select id into v_bank from public.accounts where org_id = v_org and code = p->>'bankAccountCode' and is_cash and status = 'active';
    if v_bank is null then raise exception 'refund_bank' using errcode = '22023'; end if;
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'at_least_one_line' using errcode = '22023'; end if;

  if v_id is null then
    v_number := coalesce(v_number, public.next_note_number(v_org, v_kind, v_on));
    insert into public.sales_notes (org_id, invoice_id, kind, note_number, note_date, reason, bank_account_id, created_by)
    values (v_org, inv.id, v_kind, v_number, v_on, left(v_reason, 500), v_bank, auth.uid()) returning id into v_id;
  else
    update public.sales_notes set kind = v_kind, note_date = v_on, reason = left(v_reason, 500), bank_account_id = v_bank,
      note_number = coalesce(v_number, note_number)
    where id = v_id and org_id = v_org and status = 'draft';
    if not found then raise exception 'not_draft' using errcode = '22023'; end if;
    delete from public.sales_note_lines where note_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_n := v_n + 1;
    if nullif(btrim(coalesce(v_line->>'description', '')), '') is null then raise exception 'line_description' using errcode = '22023'; end if;
    select id into v_acct from public.accounts where org_id = v_org and code = v_line->>'accountCode' and status = 'active' and not is_cash;
    if v_acct is null then raise exception 'line_account' using errcode = '22023'; end if;
    v_qty := nullif(v_line->>'quantity', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_positive' using errcode = '22023'; end if;
    v_amt := round(nullif(v_line->>'amount', '')::numeric, 2);
    if v_amt is null or v_amt <= 0 then raise exception 'line_positive' using errcode = '22023'; end if;
    v_code := coalesce(nullif(v_line->>'taxCode', ''), 'none');
    if v_code = 'sst_8' and v_on < date '2024-03-01' then v_code := 'sst_6'; end if;
    v_net := round(v_qty * v_amt, 2);
    v_tax := round(v_net * public.tax_rate(v_code), 2);
    insert into public.sales_note_lines (note_id, line_no, org_id, description, account_id, quantity, unit_amount, amount, tax_code, tax_amount)
    values (v_id, v_n, v_org, left(btrim(v_line->>'description'), 500), v_acct, v_qty, v_amt, v_net, v_code, v_tax);
    v_sub := v_sub + v_net;
    v_tax_total := v_tax_total + v_tax;
    if v_code in ('sst_6', 'sst_8') then v_service := v_service + v_tax; elsif v_code in ('sales_5', 'sales_10') then v_sales := v_sales + v_tax; end if;
  end loop;
  perform public.check_note_limits(inv, v_kind, v_sub + v_tax_total);
  update public.sales_notes set subtotal = v_sub, tax_total = v_tax_total, total = v_sub + v_tax_total,
    sales_tax = v_sales, service_tax = v_service where id = v_id;
  return v_id;
exception
  when unique_violation then raise exception 'note_number_taken' using errcode = '22023';
end;
$$;

/** Sets the invoice's status from what is still owed. */
create function public.refresh_invoice_status(p_invoice uuid) returns void
language sql security definer set search_path = public as $$
  update public.invoices set status = case when amount_due <= 0 then 'paid' else 'open' end, updated_at = now()
  where id = p_invoice and status in ('open', 'paid');
$$;
revoke all on function public.refresh_invoice_status(uuid) from public, anon, authenticated;

/**
 * lejar.ai's "Record note": posts the journal entry and locks the lines.
 * - credit: Dr each line account, Dr tax, Cr the invoice's receivable account;
 * - debit: Dr the receivable account, Cr each line account, Cr 400-1300 (sales tax) / 400-1700 (service tax,
 *   due when paid, like the invoice's);
 * - refund: Dr each line account, Dr tax, Cr the bank account.
 * Service tax a credit or refund note takes back comes out of 400-1700 while the invoice's service tax is still
 * deferred, and out of 400-1300 (the SST-02 output) for the part already released.
 */
create function public.record_sales_note(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  n public.sales_notes;
  inv public.invoices;
  v_lines jsonb := '[]';
  r record;
  v_unreleased numeric;
  v_from_def numeric := 0;
  v_from_out numeric := 0;
  v_dir text;
  v_je uuid;
begin
  select * into n from public.sales_notes where id = p_id and org_id = v_org for update;
  if n.id is null or n.status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = n.invoice_id for update;
  if inv.status not in ('open', 'paid') then raise exception 'select_invoice' using errcode = '22023'; end if;
  perform public.check_note_limits(inv, n.kind, n.total);

  v_dir := case when n.kind = 'debit' then 'credit' else 'debit' end; -- side of the line accounts and tax
  for r in select account_id, sum(amount) amt from public.sales_note_lines where note_id = p_id group by account_id loop
    v_lines := v_lines || jsonb_build_object('accountId', r.account_id, v_dir, r.amt, 'description', n.note_number);
  end loop;
  if n.sales_tax > 0 then
    v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1300'), v_dir, n.sales_tax, 'description', 'SST');
  end if;
  if n.service_tax > 0 then
    if n.kind = 'debit' then
      v_from_def := n.service_tax;
    else
      v_unreleased := greatest(public.invoice_service_tax(inv.id) - inv.sst_released, 0);
      v_from_def := least(n.service_tax, v_unreleased);
      v_from_out := n.service_tax - v_from_def;
    end if;
    if v_from_def > 0 then
      v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1700'), v_dir, v_from_def, 'description', 'SST');
    end if;
    if v_from_out > 0 then
      v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1300'), v_dir, v_from_out, 'description', 'SST');
    end if;
  end if;
  v_lines := v_lines || jsonb_build_object(
    'accountId', case when n.kind = 'refund' then n.bank_account_id else inv.receivable_account_id end,
    case when n.kind = 'debit' then 'debit' else 'credit' end, n.total, 'description', n.note_number);
  v_je := public.insert_journal(v_org, null, n.note_date,
    case n.kind when 'credit' then 'Credit note ' when 'debit' then 'Debit note ' else 'Refund note ' end || n.note_number || ' on ' || inv.invoice_number,
    'note', p_id, null, null, v_lines);

  update public.invoices set
    notes_credit = notes_credit + case when n.kind = 'credit' then n.total else 0 end,
    notes_debit = notes_debit + case when n.kind = 'debit' then n.total else 0 end,
    notes_refund = notes_refund + case when n.kind = 'refund' then n.total else 0 end,
    service_adjust = service_adjust + case when n.kind = 'debit' then n.service_tax else -n.service_tax end,
    sst_released = sst_released - v_from_out
  where id = inv.id;
  perform public.refresh_invoice_status(inv.id);
  update public.sales_notes set status = 'recorded', journal_entry_id = v_je, recorded_at = now(),
    sst_from_output = v_from_out, sst_from_deferred = v_from_def where id = p_id;
end;
$$;

/**
 * lejar.ai's note void: a draft just becomes void; a recorded note is reversed on the void date and the
 * invoice gets its balance back. A debit note that has been paid cannot be voided (void the receipt first).
 */
create function public.void_sales_note(p_slug text, p_id uuid, p_on date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  n public.sales_notes;
  inv public.invoices;
  v_lines jsonb;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  select * into n from public.sales_notes where id = p_id and org_id = v_org for update;
  if n.id is null or n.status = 'void' then raise exception 'not_found' using errcode = '22023'; end if;
  if n.status = 'draft' then
    update public.sales_notes set status = 'void', voided_on = public.today_my(), void_reason = left(btrim(p_reason), 500) where id = p_id;
    return;
  end if;
  if p_on is null or p_on < n.note_date then raise exception 'void_date' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = n.invoice_id for update;
  if n.kind = 'debit' and inv.amount_due < n.total then raise exception 'note_paid' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = n.journal_entry_id;
  update public.sales_notes set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void ' || n.note_number || ': ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
  update public.invoices set
    notes_credit = notes_credit - case when n.kind = 'credit' then n.total else 0 end,
    notes_debit = notes_debit - case when n.kind = 'debit' then n.total else 0 end,
    notes_refund = notes_refund - case when n.kind = 'refund' then n.total else 0 end,
    service_adjust = service_adjust - case when n.kind = 'debit' then n.service_tax else -n.service_tax end,
    sst_released = sst_released + n.sst_from_output
  where id = inv.id;
  perform public.refresh_invoice_status(inv.id);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['save_sales_note(text, jsonb)', 'record_sales_note(text, uuid)', 'void_sales_note(text, uuid, date, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Receipts, invoice voids, deemed SST and the AR tie-out now count the notes.

/** record_receipt_core as in 20261122001000, against amount_due and the invoice's service tax after notes. */
create or replace function public.record_receipt_core(p_org uuid, p_r jsonb) returns uuid
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
  v_base numeric;
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
    if v_amt > inv.amount_due then raise exception 'over_allocated' using errcode = '22023', detail = inv.invoice_number; end if;
    if v_on < inv.invoice_date then raise exception 'before_invoice' using errcode = '22023', detail = inv.invoice_number; end if;
    v_service := public.invoice_service_tax(inv.id);
    v_base := inv.total + inv.notes_debit - inv.notes_credit;
    v_move := case when v_amt >= inv.amount_due then greatest(v_service - inv.sst_released, 0)
                   else least(greatest(v_service - inv.sst_released, 0), round(v_service * v_amt / nullif(v_base, 0), 2)) end;
    insert into public.receipt_allocations (receipt_id, invoice_id, org_id, amount, sst_moved) values (v_id, inv.id, p_org, v_amt, v_move);
    update public.invoices set paid_amount = paid_amount + v_amt, sst_released = sst_released + v_move, updated_at = now() where id = inv.id;
    perform public.refresh_invoice_status(inv.id);
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

/** void_receipt as before; the invoice's status follows what is owed (notes included). */
create or replace function public.void_receipt(p_slug text, p_id uuid, p_on date, p_reason text) returns void
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
    if exists (select 1 from public.invoices where id = a.invoice_id and paid_amount - a.amount < notes_refund) then
      raise exception 'has_refund' using errcode = '22023';
    end if;
    update public.invoices set paid_amount = paid_amount - a.amount, sst_released = sst_released - a.sst_moved, updated_at = now()
    where id = a.invoice_id;
    perform public.refresh_invoice_status(a.invoice_id);
  end loop;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = r.journal_entry_id;
  update public.receipts set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void receipt: ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
end;
$$;

/** void_invoice as in 20261122001400, refusing invoices that carry notes (void the notes first). */
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
  if exists (select 1 from public.sales_notes where invoice_id = p_id and status <> 'void') then
    raise exception 'has_notes' using errcode = '22023';
  end if;
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

/** record_deemed_sst as in 20261122001500, with the service tax after notes. */
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
    select i.id, i.invoice_number, i.invoice_date, i.sst_released, public.invoice_service_tax(i.id) service,
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

/** guard_sst_lines as in 20261122001400, with notes among the documents that post SST. */
create or replace function public.guard_sst_lines() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  e record;
begin
  select code into v_code from public.accounts where id = new.account_id;
  if v_code is null or v_code not in ('400-1300', '400-1700') then return new; end if;
  select je.occurred_on, je.source, o.sst_locked_until into e
  from public.journal_entries je join public.organizations o on o.id = je.org_id where je.id = new.entry_id;
  if v_code = '400-1700' and e.source not in ('invoice', 'receipt', 'void', 'sst', 'note') then
    raise exception 'deferred_sst_account' using errcode = '22023';
  end if;
  if e.source in ('invoice', 'receipt', 'void', 'sst', 'note') and e.sst_locked_until is not null and e.occurred_on <= e.sst_locked_until then
    raise exception 'tax_locked' using errcode = '22023', detail = to_char(e.sst_locked_until, 'YYYY-MM-DD');
  end if;
  return new;
end;
$$;

/** ledger_tie_out as in 20261122001200, with credit / debit notes in what invoices still owe. */
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
                 select sum(case n.kind when 'debit' then n.total when 'credit' then -n.total else 0 end) from public.sales_notes n
                 where n.invoice_id = i.id and n.journal_entry_id is not null and n.note_date <= p_as_of
                   and not (n.status = 'void' and n.voided_on <= p_as_of)), 0)) as owed
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
