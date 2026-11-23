-- Slice 19: customer credit and deposits (lejar.ai: receipts.form.extraCredit / creditKept, contacts.prepay.*,
-- invoices.detail.applyCredit / creditApplied / undone; docs/re/19-customer-credit.md). Customer credit is held in
-- 400-1600 Customer Deposits (Kira's choice; Lejar's account was not observed).

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal', 'sst', 'note', 'credit'));

alter table public.receipts
  add column contact_id uuid references public.contacts (id),
  add column credit_amount numeric(14, 2) not null default 0;
update public.receipts r set contact_id = (
  select i.contact_id from public.receipt_allocations ra join public.invoices i on i.id = ra.invoice_id where ra.receipt_id = r.id limit 1);

alter table public.sales_notes add column to_customer_credit numeric(14, 2) not null default 0;

-- amount_due now also nets customer credit applied, and the part of a credit note that became customer credit.
alter table public.invoices drop column amount_due;
alter table public.invoices
  add column credit_applied numeric(14, 2) not null default 0,
  add column notes_credit_excess numeric(14, 2) not null default 0;
alter table public.invoices
  add column amount_due numeric(14, 2) generated always as
    (total + notes_debit - notes_credit + notes_credit_excess - paid_amount - credit_applied) stored;

/** Every change to a customer's credit: + when kept (receipt excess, prepayment, credit note), - when applied. */
create table public.customer_credit_moves (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id),
  kind text not null check (kind in ('receipt', 'note', 'apply')),
  amount numeric(14, 2) not null check (amount <> 0),
  on_date date not null,
  receipt_id uuid references public.receipts (id) on delete cascade,
  note_id uuid references public.sales_notes (id) on delete cascade,
  invoice_id uuid references public.invoices (id) on delete cascade,
  sst_moved numeric(14, 2) not null default 0,
  entry_id uuid references public.journal_entries (id),
  status text not null default 'active' check (status in ('active', 'undone', 'void')),
  undone_on date,
  undo_entry_id uuid references public.journal_entries (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index customer_credit_moves_contact_idx on public.customer_credit_moves (org_id, contact_id);
create index customer_credit_moves_invoice_idx on public.customer_credit_moves (invoice_id);
alter table public.customer_credit_moves enable row level security;
create policy "customer_credit_moves: members read" on public.customer_credit_moves for select to authenticated using (public.is_org_member(org_id));

create function public.customer_credit_balance(p_org uuid, p_contact uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(amount), 0) from public.customer_credit_moves where org_id = p_org and contact_id = p_contact and status = 'active';
$$;
revoke all on function public.customer_credit_balance(uuid, uuid) from public, anon, authenticated;

/** Service tax a settlement of p_amt on the invoice releases (receipts and credit applied alike). */
create function public.service_release_for(inv public.invoices, p_amt numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select case when p_amt >= inv.amount_due then greatest(public.invoice_service_tax(inv.id) - inv.sst_released, 0)
              else least(greatest(public.invoice_service_tax(inv.id) - inv.sst_released, 0),
                         round(public.invoice_service_tax(inv.id) * p_amt / nullif(inv.total + inv.notes_debit - inv.notes_credit + inv.notes_credit_excess, 0), 2)) end;
$$;
revoke all on function public.service_release_for(public.invoices, numeric) from public, anon, authenticated;

/**
 * record_receipt_core: as in 20261122001600, plus customer credit (lejar.ai receipts.form.extraCredit):
 * an allocation above what the invoice owes keeps the extra as the customer's credit, and p_r.creditAmount with
 * p_r.contactId records money with no invoice (a prepayment / deposit). Credit posts Cr 400-1600 with no SST.
 */
create or replace function public.record_receipt_core(p_org uuid, p_r jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_on date := (p_r->>'receiptDate')::date;
  v_bank uuid;
  v_charges numeric := round(coalesce(nullif(p_r->>'bankCharges', '')::numeric, 0), 2);
  v_contact uuid := nullif(p_r->>'contactId', '')::uuid;
  v_credit numeric := round(coalesce(nullif(p_r->>'creditAmount', '')::numeric, 0), 2);
  v_total numeric := 0;
  v_id uuid;
  a jsonb;
  inv public.invoices;
  v_amt numeric;
  v_move numeric;
  v_lines jsonb := '[]';
  v_moved_total numeric := 0;
  v_je uuid;
begin
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_credit < 0 then raise exception 'amount_format' using errcode = '22023'; end if;
  select id into v_bank from public.accounts where org_id = p_org and code = p_r->>'bankAccountCode' and is_cash and status = 'active';
  if v_bank is null then raise exception 'not_cash_account' using errcode = '22023'; end if;
  insert into public.receipts (org_id, receipt_date, bank_account_id, reference, amount, bank_charges, statement_line_id, created_by)
  values (p_org, v_on, v_bank, nullif(btrim(coalesce(p_r->>'reference', '')), ''), 0.01, 0, nullif(p_r->>'statementLineId', '')::uuid, auth.uid())
  returning id into v_id;
  for a in select * from jsonb_array_elements(coalesce(p_r->'allocations', '[]')) loop
    v_amt := round(coalesce(nullif(a->>'amount', '')::numeric, 0), 2);
    if v_amt = 0 then continue; end if;
    if v_amt < 0 then raise exception 'amount_format' using errcode = '22023'; end if;
    select * into inv from public.invoices where id = (a->>'invoiceId')::uuid and org_id = p_org for update;
    if inv.id is null or inv.status <> 'open' then raise exception 'invoice_not_open' using errcode = '22023'; end if;
    if v_on < inv.invoice_date then raise exception 'before_invoice' using errcode = '22023', detail = inv.invoice_number; end if;
    if v_contact is not null and v_contact <> inv.contact_id then raise exception 'one_customer' using errcode = '22023'; end if;
    v_contact := inv.contact_id;
    if v_amt > inv.amount_due then
      v_credit := v_credit + (v_amt - inv.amount_due);
      v_amt := inv.amount_due;
    end if;
    v_move := public.service_release_for(inv, v_amt);
    insert into public.receipt_allocations (receipt_id, invoice_id, org_id, amount, sst_moved) values (v_id, inv.id, p_org, v_amt, v_move);
    update public.invoices set paid_amount = paid_amount + v_amt, sst_released = sst_released + v_move, updated_at = now() where id = inv.id;
    perform public.refresh_invoice_status(inv.id);
    v_lines := v_lines || jsonb_build_object('accountId', inv.receivable_account_id, 'credit', v_amt, 'description', inv.invoice_number);
    v_total := v_total + v_amt;
    v_moved_total := v_moved_total + v_move;
  end loop;
  if v_credit > 0 then
    if v_contact is null then raise exception 'name_customer' using errcode = '22023'; end if;
    if not exists (select 1 from public.contacts where id = v_contact and org_id = p_org and kind in ('customer', 'both')) then
      raise exception 'name_customer' using errcode = '22023';
    end if;
    v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(p_org, '400-1600'), 'credit', v_credit, 'description', 'Customer credit');
    v_total := v_total + v_credit;
  end if;
  if v_total = 0 then raise exception 'no_allocation' using errcode = '22023'; end if;
  if v_charges >= v_total then raise exception 'charges_too_high' using errcode = '22023'; end if;
  v_lines := jsonb_build_array(jsonb_build_object('accountId', v_bank, 'debit', v_total - v_charges, 'description', coalesce(p_r->>'reference', 'Receipt'))) || v_lines;
  if v_charges > 0 then
    v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(p_org, '900-0600'), 'debit', v_charges, 'description', 'Bank charges');
  end if;
  if v_moved_total > 0 then
    v_lines := v_lines
      || jsonb_build_object('accountId', public.account_id_for(p_org, '400-1700'), 'debit', v_moved_total, 'description', 'SST due on payment')
      || jsonb_build_object('accountId', public.account_id_for(p_org, '400-1300'), 'credit', v_moved_total, 'description', 'SST due on payment');
  end if;
  v_je := public.insert_journal(p_org, null, v_on, 'Receipt' || coalesce(' ' || nullif(btrim(coalesce(p_r->>'reference', '')), ''), ''), 'receipt', v_id, null, null, v_lines);
  update public.receipts set amount = v_total, bank_charges = v_charges, journal_entry_id = v_je, contact_id = v_contact, credit_amount = v_credit where id = v_id;
  if v_credit > 0 then
    insert into public.customer_credit_moves (org_id, contact_id, kind, amount, on_date, receipt_id, entry_id, created_by)
    values (p_org, v_contact, 'receipt', v_credit, v_on, v_id, v_je, auth.uid());
  end if;
  return v_id;
end;
$$;

/** void_receipt as in 20261122001600, refusing when the credit it kept has been used. */
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
  if r.credit_amount > 0 and public.customer_credit_balance(v_org, r.contact_id) < r.credit_amount then
    raise exception 'credit_used' using errcode = '22023';
  end if;
  for a in select * from public.receipt_allocations where receipt_id = p_id loop
    if exists (select 1 from public.invoices where id = a.invoice_id and paid_amount - a.amount < notes_refund) then
      raise exception 'has_refund' using errcode = '22023';
    end if;
    update public.invoices set paid_amount = paid_amount - a.amount, sst_released = sst_released - a.sst_moved, updated_at = now()
    where id = a.invoice_id;
    perform public.refresh_invoice_status(a.invoice_id);
  end loop;
  update public.customer_credit_moves set status = 'void' where receipt_id = p_id and status = 'active';
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = r.journal_entry_id;
  update public.receipts set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void receipt: ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
end;
$$;

/**
 * lejar.ai's "Apply credit ({amount} available)" on an invoice: Dr 400-1600, Cr the invoice's receivable account,
 * and the invoice's service tax share moves to SST output like a payment ("A deposit carries no SST: its share
 * counts when you apply the credit to an invoice"). p_amount null = as much as possible.
 */
create function public.apply_customer_credit(p_slug text, p_invoice uuid, p_amount numeric, p_on date) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  inv public.invoices;
  v_bal numeric;
  v_amt numeric;
  v_move numeric;
  v_lines jsonb;
  v_je uuid;
begin
  select * into inv from public.invoices where id = p_invoice and org_id = v_org for update;
  if inv.id is null or inv.status <> 'open' then raise exception 'invoice_not_open' using errcode = '22023'; end if;
  if p_on is null or p_on < inv.invoice_date then raise exception 'before_invoice' using errcode = '22023', detail = inv.invoice_number; end if;
  perform 1 from public.contacts where id = inv.contact_id for update;
  v_bal := public.customer_credit_balance(v_org, inv.contact_id);
  v_amt := round(coalesce(p_amount, least(v_bal, inv.amount_due)), 2);
  if v_amt <= 0 or v_bal <= 0 then raise exception 'no_credit' using errcode = '22023'; end if;
  if v_amt > v_bal then raise exception 'credit_exceeds_balance' using errcode = '22023', detail = v_bal::text; end if;
  if v_amt > inv.amount_due then raise exception 'over_allocated' using errcode = '22023', detail = inv.invoice_number; end if;
  v_move := public.service_release_for(inv, v_amt);
  v_lines := jsonb_build_array(
    jsonb_build_object('accountId', public.account_id_for(v_org, '400-1600'), 'debit', v_amt, 'description', 'Customer credit applied'),
    jsonb_build_object('accountId', inv.receivable_account_id, 'credit', v_amt, 'description', inv.invoice_number));
  if v_move > 0 then
    v_lines := v_lines
      || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1700'), 'debit', v_move, 'description', 'SST due on credit applied')
      || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1300'), 'credit', v_move, 'description', 'SST due on credit applied');
  end if;
  v_je := public.insert_journal(v_org, null, p_on, 'Customer credit applied to ' || inv.invoice_number, 'credit', inv.id, null, null, v_lines);
  update public.invoices set credit_applied = credit_applied + v_amt, sst_released = sst_released + v_move, updated_at = now() where id = inv.id;
  perform public.refresh_invoice_status(inv.id);
  insert into public.customer_credit_moves (org_id, contact_id, kind, amount, on_date, invoice_id, sst_moved, entry_id, created_by)
  values (v_org, inv.contact_id, 'apply', -v_amt, p_on, inv.id, v_move, v_je, auth.uid());
  return v_amt;
end;
$$;

/** "undone": reverses a credit application on p_on (not before it); the credit goes back to the customer. */
create function public.undo_credit_application(p_slug text, p_move uuid, p_on date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  m public.customer_credit_moves;
  v_lines jsonb;
  v_je uuid;
begin
  select * into m from public.customer_credit_moves where id = p_move and org_id = v_org and kind = 'apply' for update;
  if m.id is null or m.status <> 'active' then raise exception 'not_found' using errcode = '22023'; end if;
  if p_on is null or p_on < m.on_date then raise exception 'void_date' using errcode = '22023'; end if;
  perform 1 from public.invoices where id = m.invoice_id for update;
  if exists (select 1 from public.invoices where id = m.invoice_id and paid_amount + credit_applied + m.amount < notes_refund) then
    raise exception 'has_refund' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = m.entry_id;
  v_je := public.insert_journal(v_org, null, p_on, 'Undo customer credit applied', 'void', m.invoice_id, null, null, v_lines);
  update public.invoices set credit_applied = credit_applied + m.amount, sst_released = sst_released - m.sst_moved, updated_at = now() where id = m.invoice_id;
  perform public.refresh_invoice_status(m.invoice_id);
  update public.customer_credit_moves set status = 'undone', undone_on = p_on, undo_entry_id = v_je where id = p_move;
end;
$$;

/** Lejar's creditable balance: total + debit notes - credit notes - refund notes. */
create or replace function public.check_note_limits(p_inv public.invoices, p_kind text, p_total numeric) returns void
language plpgsql stable as $$
declare
  v_creditable numeric := p_inv.total + p_inv.notes_debit - p_inv.notes_credit - p_inv.notes_refund;
begin
  if p_kind in ('credit', 'refund') and p_total > v_creditable then
    raise exception 'exceeds' using errcode = '22023', detail = v_creditable::text;
  end if;
  if p_kind = 'refund' and p_total > p_inv.paid_amount + p_inv.credit_applied - p_inv.notes_refund then
    raise exception 'refund_exceeds_paid' using errcode = '22023', detail = (p_inv.paid_amount + p_inv.credit_applied - p_inv.notes_refund)::text;
  end if;
end;
$$;

/**
 * record_sales_note as in 20261122001600; a credit note larger than what is still owed keeps the rest as the
 * customer's credit (Cr 400-1600), as lejar.ai's "Customer credit RM318.00" on a paid invoice shows.
 */
create or replace function public.record_sales_note(p_slug text, p_id uuid) returns void
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
  v_ar numeric;
  v_excess numeric := 0;
  v_je uuid;
begin
  select * into n from public.sales_notes where id = p_id and org_id = v_org for update;
  if n.id is null or n.status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
  select * into inv from public.invoices where id = n.invoice_id for update;
  if inv.status not in ('open', 'paid') then raise exception 'select_invoice' using errcode = '22023'; end if;
  perform public.check_note_limits(inv, n.kind, n.total);

  v_dir := case when n.kind = 'debit' then 'credit' else 'debit' end;
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
  if n.kind = 'refund' then
    v_lines := v_lines || jsonb_build_object('accountId', n.bank_account_id, 'credit', n.total, 'description', n.note_number);
  elsif n.kind = 'debit' then
    v_lines := v_lines || jsonb_build_object('accountId', inv.receivable_account_id, 'debit', n.total, 'description', n.note_number);
  else
    v_ar := least(n.total, greatest(inv.amount_due, 0));
    v_excess := n.total - v_ar;
    if v_ar > 0 then
      v_lines := v_lines || jsonb_build_object('accountId', inv.receivable_account_id, 'credit', v_ar, 'description', n.note_number);
    end if;
    if v_excess > 0 then
      v_lines := v_lines || jsonb_build_object('accountId', public.account_id_for(v_org, '400-1600'), 'credit', v_excess, 'description', 'Customer credit');
    end if;
  end if;
  v_je := public.insert_journal(v_org, null, n.note_date,
    case n.kind when 'credit' then 'Credit note ' when 'debit' then 'Debit note ' else 'Refund note ' end || n.note_number || ' on ' || inv.invoice_number,
    'note', p_id, null, null, v_lines);

  update public.invoices set
    notes_credit = notes_credit + case when n.kind = 'credit' then n.total else 0 end,
    notes_credit_excess = notes_credit_excess + v_excess,
    notes_debit = notes_debit + case when n.kind = 'debit' then n.total else 0 end,
    notes_refund = notes_refund + case when n.kind = 'refund' then n.total else 0 end,
    service_adjust = service_adjust + case when n.kind = 'debit' then n.service_tax else -n.service_tax end,
    sst_released = sst_released - v_from_out
  where id = inv.id;
  perform public.refresh_invoice_status(inv.id);
  update public.sales_notes set status = 'recorded', journal_entry_id = v_je, recorded_at = now(),
    sst_from_output = v_from_out, sst_from_deferred = v_from_def, to_customer_credit = v_excess where id = p_id;
  if v_excess > 0 then
    insert into public.customer_credit_moves (org_id, contact_id, kind, amount, on_date, note_id, entry_id, created_by)
    values (v_org, inv.contact_id, 'note', v_excess, n.note_date, p_id, v_je, auth.uid());
  end if;
end;
$$;

/** void_sales_note as in 20261122001600; a credit note whose customer credit was used cannot be voided. */
create or replace function public.void_sales_note(p_slug text, p_id uuid, p_on date, p_reason text) returns void
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
  if n.to_customer_credit > 0 and public.customer_credit_balance(v_org, inv.contact_id) < n.to_customer_credit then
    raise exception 'credit_used' using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = n.journal_entry_id;
  update public.sales_notes set status = 'void', voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    void_entry_id = public.insert_journal(v_org, null, p_on, 'Void ' || n.note_number || ': ' || left(btrim(p_reason), 200), 'void', p_id, null, null, v_lines)
  where id = p_id;
  update public.customer_credit_moves set status = 'void' where note_id = p_id and status = 'active';
  update public.invoices set
    notes_credit = notes_credit - case when n.kind = 'credit' then n.total else 0 end,
    notes_credit_excess = notes_credit_excess - n.to_customer_credit,
    notes_debit = notes_debit - case when n.kind = 'debit' then n.total else 0 end,
    notes_refund = notes_refund - case when n.kind = 'refund' then n.total else 0 end,
    service_adjust = service_adjust - case when n.kind = 'debit' then n.service_tax else -n.service_tax end,
    sst_released = sst_released + n.sst_from_output
  where id = inv.id;
  perform public.refresh_invoice_status(inv.id);
end;
$$;

/** void_invoice: as in 20261122001600, also refusing invoices with customer credit applied. */
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
  if inv.paid_amount > 0 or inv.credit_applied > 0 then raise exception 'has_receipts' using errcode = '22023'; end if;
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

/** guard_sst_lines: as in 20261122001600, with customer credit applications among SST postings. */
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
  if v_code = '400-1700' and e.source not in ('invoice', 'receipt', 'void', 'sst', 'note', 'credit') then
    raise exception 'deferred_sst_account' using errcode = '22023';
  end if;
  if e.source in ('invoice', 'receipt', 'void', 'sst', 'note', 'credit') and e.sst_locked_until is not null and e.occurred_on <= e.sst_locked_until then
    raise exception 'tax_locked' using errcode = '22023', detail = to_char(e.sst_locked_until, 'YYYY-MM-DD');
  end if;
  return new;
end;
$$;

/** ledger_tie_out: AR owed now nets credit-note parts that became customer credit, and credit applied. */
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

do $$
declare f text;
begin
  foreach f in array array['apply_customer_credit(text, uuid, numeric, date)', 'undo_credit_application(text, uuid, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
