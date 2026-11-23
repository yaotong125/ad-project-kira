-- Slice 7: Sales invoices, modelled on lejar.ai's /invoices (observed 2026-11-22, docs/re/07-invoices.md).
-- Line maths copied from Lejar's client module 779754: discounts round to the sen; SST-inclusive
-- prices take tax out as amount * rate / (100 + rate); exclusive prices add amount * rate / 100.

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'bill', 'invoice', 'void'));
alter table public.ai_drafts drop constraint ai_drafts_recorded_kind_check;
alter table public.ai_drafts add constraint ai_drafts_recorded_kind_check
  check (recorded_kind in ('bill', 'journal', 'invoice'));

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  currency text not null default 'MYR' check (currency = 'MYR'),
  pricing_mode text not null default 'exclusive' check (pricing_mode in ('exclusive', 'inclusive')),
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'void')),
  notes text check (notes is null or char_length(notes) <= 1000),
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  receivable_account_id uuid references public.accounts (id),
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_on date,
  void_reason text,
  recorded_at timestamptz,
  ai_draft_id uuid references public.ai_drafts (id) on delete set null,
  source_document_id uuid references public.source_documents (id) on delete set null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, invoice_number),
  check (due_date is null or due_date >= invoice_date)
);
create index invoices_org_date_idx on public.invoices (org_id, invoice_date desc);

create table public.invoice_lines (
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  line_no integer not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  description text not null,
  account_id uuid not null references public.accounts (id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  discount_mode text check (discount_mode in ('percent', 'amount', 'price')),
  discount_percent numeric(7, 2),
  discounted_unit_price numeric(14, 2) not null check (discounted_unit_price >= 0),
  amount numeric(14, 2) not null,
  net numeric(14, 2) not null,
  tax_code text not null check (tax_code in ('none', 'sst_6', 'sst_8', 'sales_5', 'sales_10')),
  tax_amount numeric(14, 2) not null,
  classification_code text check (classification_code is null or classification_code ~ '^[0-9]{3}$'),
  primary key (invoice_id, line_no)
);

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
create policy "invoices: members read" on public.invoices for select to authenticated using (public.is_org_member(org_id));
create policy "invoice_lines: members read" on public.invoice_lines for select to authenticated using (public.is_org_member(org_id));

create or replace function public.next_doc_number(p_org uuid, p_prefix text, p_on date) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_stem text := p_prefix || '-' || to_char(p_on, 'YYYYMM') || '-';
  v_max int;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_prefix = 'BILL' then
    select max(substring(bill_number from char_length(v_stem) + 1)::int) into v_max
    from public.bills where org_id = p_org and bill_number ~ ('^' || v_stem || '[0-9]+$');
  elsif p_prefix = 'INV' then
    select max(substring(invoice_number from char_length(v_stem) + 1)::int) into v_max
    from public.invoices where org_id = p_org and invoice_number ~ ('^' || v_stem || '[0-9]+$');
  else
    select max(substring(entry_number from char_length(v_stem) + 1)::int) into v_max
    from public.journal_entries where org_id = p_org and entry_number ~ ('^' || v_stem || '[0-9]+$');
  end if;
  return v_stem || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;

/** lejar.ai: SST 8% applies from 2024-03-01; earlier dates fall back to 6%. */
create function public.tax_code_on(p_code text, p_on date) returns text
language sql immutable as $$
  select case when p_code = 'sst_8' and p_on < date '2024-03-01' then 'sst_6' else coalesce(p_code, 'none') end;
$$;

/**
 * Creates or replaces a draft's content. p_inv: {invoiceId?, customerContactId, customerName, invoiceNumber
 * (null = auto), invoiceDate, dueDate, pricingMode, notes, aiDraftId, sourceDocumentId, lines: [{description,
 * accountCode, quantity, unitPrice, discountMode, discountPercent, discountAmount, discountedUnitPrice,
 * taxCode, classificationCode}]}.
 */
create function public.save_invoice_draft(p_org uuid, p_inv jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_inv->>'invoiceId', '')::uuid;
  v_on date := (p_inv->>'invoiceDate')::date;
  v_due date := nullif(p_inv->>'dueDate', '')::date;
  v_contact uuid := nullif(p_inv->>'customerContactId', '')::uuid;
  v_name text := nullif(btrim(coalesce(p_inv->>'customerName', '')), '');
  v_number text := nullif(btrim(coalesce(p_inv->>'invoiceNumber', '')), '');
  v_mode text := coalesce(nullif(p_inv->>'pricingMode', ''), 'exclusive');
  v_line jsonb;
  v_n int := 0;
  v_qty numeric; v_price numeric; v_disc numeric; v_pct numeric; v_amount numeric; v_tax numeric; v_rate numeric;
  v_code text; v_dmode text;
  v_sub numeric := 0; v_tax_total numeric := 0; v_gross numeric := 0;
begin
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_due is not null and v_due < v_on then raise exception 'due_before_date' using errcode = '22023'; end if;

  if v_contact is not null then
    if not exists (select 1 from public.contacts where id = v_contact and org_id = p_org) then
      raise exception 'unknown_customer' using errcode = '22023';
    end if;
  elsif v_name is not null then
    select id into v_contact from public.contacts where org_id = p_org and lower(name) = lower(v_name);
    if v_contact is null then
      insert into public.contacts (org_id, name, kind) values (p_org, left(v_name, 200), 'customer') returning id into v_contact;
    end if;
  else
    raise exception 'customer_required' using errcode = '22023';
  end if;

  if v_id is null then
    if v_number is null then
      v_number := public.next_doc_number(p_org, 'INV', v_on);
    end if;
    if exists (select 1 from public.invoices where org_id = p_org and invoice_number = v_number) then
      raise exception 'duplicate_number' using errcode = '23505', detail = v_number;
    end if;
    insert into public.invoices (org_id, contact_id, invoice_number, invoice_date, due_date, pricing_mode, notes,
                                 ai_draft_id, source_document_id, created_by)
    values (p_org, v_contact, v_number, v_on, v_due, v_mode, nullif(btrim(coalesce(p_inv->>'notes', '')), ''),
            nullif(p_inv->>'aiDraftId', '')::uuid, nullif(p_inv->>'sourceDocumentId', '')::uuid, auth.uid())
    returning id into v_id;
  else
    if not exists (select 1 from public.invoices where id = v_id and org_id = p_org and status = 'draft') then
      raise exception 'not_draft' using errcode = '22023';
    end if;
    if v_number is not null and exists (select 1 from public.invoices where org_id = p_org and invoice_number = v_number and id <> v_id) then
      raise exception 'duplicate_number' using errcode = '23505', detail = v_number;
    end if;
    update public.invoices set contact_id = v_contact, invoice_number = coalesce(v_number, invoice_number),
      invoice_date = v_on, due_date = v_due, pricing_mode = v_mode,
      notes = nullif(btrim(coalesce(p_inv->>'notes', '')), ''), updated_at = now()
    where id = v_id;
    delete from public.invoice_lines where invoice_id = v_id;
  end if;

  for v_line in select * from jsonb_array_elements(p_inv->'lines') loop
    v_qty := (v_line->>'quantity')::numeric;
    v_price := (v_line->>'unitPrice')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_positive' using errcode = '22023'; end if;
    if v_price is null or v_price < 0 then raise exception 'amount_format' using errcode = '22023'; end if;
    if coalesce(btrim(v_line->>'description'), '') = '' then raise exception 'line_description' using errcode = '22023'; end if;
    v_dmode := nullif(v_line->>'discountMode', '');
    v_pct := null;
    if v_dmode = 'percent' then
      v_pct := (v_line->>'discountPercent')::numeric;
      if v_pct is null or v_pct <= 0 or v_pct >= 100 then raise exception 'discount_format' using errcode = '22023'; end if;
      v_disc := round(v_price * (100 - v_pct) / 100, 2);
    elsif v_dmode = 'amount' then
      v_disc := v_price - (v_line->>'discountAmount')::numeric;
    elsif v_dmode = 'price' then
      v_disc := (v_line->>'discountedUnitPrice')::numeric;
    else
      v_dmode := null;
      v_disc := v_price;
    end if;
    if v_disc is null or v_disc < 0 or v_disc > v_price then raise exception 'discount_format' using errcode = '22023'; end if;
    v_amount := round(v_qty * v_disc, 2);
    if v_amount <= 0 then raise exception 'line_positive' using errcode = '22023'; end if;
    v_code := public.tax_code_on(v_line->>'taxCode', v_on);
    v_rate := public.tax_rate(v_code) * 100;
    if v_mode = 'inclusive' then
      v_tax := case when v_rate = 0 then 0 else round(v_amount * v_rate / (100 + v_rate), 2) end;
    else
      v_tax := round(v_amount * v_rate / 100, 2);
    end if;
    v_n := v_n + 1;
    insert into public.invoice_lines (invoice_id, line_no, org_id, description, account_id, quantity, unit_price,
      discount_mode, discount_percent, discounted_unit_price, amount, net, tax_code, tax_amount, classification_code)
    values (v_id, v_n, p_org, left(btrim(v_line->>'description'), 500), public.account_id_for(p_org, v_line->>'accountCode'),
      v_qty, v_price, v_dmode, v_pct, v_disc, v_amount,
      case when v_mode = 'inclusive' then v_amount - v_tax else v_amount end, v_code, v_tax,
      nullif(v_line->>'classificationCode', ''));
    v_sub := v_sub + case when v_mode = 'inclusive' then v_amount - v_tax else v_amount end;
    v_tax_total := v_tax_total + v_tax;
  end loop;
  if v_n = 0 then raise exception 'one_line' using errcode = '22023'; end if;
  update public.invoices set subtotal = v_sub, tax_total = v_tax_total, total = v_sub + v_tax_total where id = v_id;
  return v_id;
end;
$$;
revoke all on function public.save_invoice_draft(uuid, jsonb) from public, anon, authenticated;

/**
 * Posts a draft: Dr receivables (trade 300-0200, or 300-0400 for a non-trade customer) for the total;
 * Cr each line's revenue account; Cr 400-1700 Deferred SST for service tax (due when paid) and
 * 400-1300 SST Output Tax for sales tax. Checks Learn section 3.
 */
create function public.post_invoice(p_org uuid, p_id uuid) returns void
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
  select public.account_id_for(p_org, case when c.trade_classification = 'non_trade' then '300-0400' else '300-0200' end)
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

/** lejar.ai's createInvoiceAction / updateInvoiceAction with intent "draft" or "record". */
create function public.save_invoice(p_slug text, p_inv jsonb, p_intent text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_id uuid;
begin
  v_id := public.save_invoice_draft(v_org, p_inv);
  if p_intent = 'record' then
    perform public.post_invoice(v_org, v_id);
  end if;
  return (select jsonb_build_object('id', id, 'number', invoice_number, 'status', status) from public.invoices where id = v_id);
end;
$$;

/** "Record invoice" on a draft's page. */
create function public.record_invoice(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.post_invoice(public.learn_org_for_editor(p_slug), p_id);
end;
$$;

/** "Delete": drafts only (lejar.ai: "Only draft invoices can be deleted. Void the invoice instead."). */
create function public.delete_invoice_draft(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  delete from public.invoices where id = p_id and org_id = v_org and status = 'draft';
  if not found then raise exception 'only_draft_delete' using errcode = '22023'; end if;
end;
$$;

/** "Void": reverses the journal entry on the void date and keeps the invoice (lejar.ai's recorded-invoice void). */
create function public.void_invoice(p_slug text, p_id uuid, p_on date, p_reason text) returns void
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
  if p_on < inv.invoice_date then raise exception 'void_date' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('accountId', account_id, 'debit', credit, 'credit', debit, 'description', description) order by line_no)
    into v_lines from public.journal_lines where entry_id = inv.journal_entry_id;
  v_je := public.insert_journal(v_org, null, p_on, 'Void invoice ' || inv.invoice_number || ': ' || left(btrim(p_reason), 200),
                                'void', p_id, null, null, v_lines);
  update public.invoices set status = 'void', void_entry_id = v_je, voided_on = p_on, void_reason = left(btrim(p_reason), 500),
    updated_at = now() where id = p_id;
end;
$$;

revoke all on function public.save_invoice(text, jsonb, text) from public, anon;
revoke all on function public.record_invoice(text, uuid) from public, anon;
revoke all on function public.delete_invoice_draft(text, uuid) from public, anon;
revoke all on function public.void_invoice(text, uuid, date, text) from public, anon;
grant execute on function public.save_invoice(text, jsonb, text) to authenticated;
grant execute on function public.record_invoice(text, uuid) to authenticated;
grant execute on function public.delete_invoice_draft(text, uuid) to authenticated;
grant execute on function public.void_invoice(text, uuid, date, text) to authenticated;
