-- Slice 21: Delivery orders (lejar.ai /delivery-orders, observed 2026-11-23 on Lejar's demo company and the
-- user's test entity; docs/re/21-delivery-orders.md). "Each delivery order converts to exactly one invoice";
-- nothing posts to the ledger until that invoice is recorded.

create table public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id),
  do_number text not null check (char_length(do_number) between 1 and 50),
  do_date date not null,
  status text not null default 'open' check (status in ('open', 'converted', 'void')),
  notes text check (notes is null or char_length(notes) <= 1000),
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  invoice_id uuid references public.invoices (id) on delete set null,
  voided_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, do_number)
);
create index delivery_orders_org_date_idx on public.delivery_orders (org_id, do_date desc);

create table public.delivery_order_lines (
  delivery_order_id uuid not null references public.delivery_orders (id) on delete cascade,
  line_no integer not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 500),
  account_id uuid not null references public.accounts (id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_amount numeric(14, 2) not null check (unit_amount > 0),
  amount numeric(14, 2) not null,
  tax_code text not null check (tax_code in ('none', 'sst_6', 'sst_8', 'sales_5', 'sales_10', 'exempt')),
  tax_amount numeric(14, 2) not null,
  primary key (delivery_order_id, line_no)
);

do $$
declare t text;
begin
  foreach t in array array['delivery_orders', 'delivery_order_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

/** DO-202611-001, per month (lejar.ai: "Assigned when saved"). */
create function public.next_do_number(p_org uuid, p_on date) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_stem text := 'DO-' || to_char(p_on, 'YYYYMM') || '-';
  v_max int;
begin
  if not public.is_org_member(p_org) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select max(substring(do_number from char_length(v_stem) + 1)::int) into v_max
  from public.delivery_orders where org_id = p_org and do_number ~ ('^' || v_stem || '[0-9]+$');
  return v_stem || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;
grant execute on function public.next_do_number(uuid, date) to authenticated;

/**
 * "Save delivery order" / "Save changes" (open DOs only: "Changes replace the saved delivery order"). p: {doId?,
 * customerContactId?, customerName, doNumber (empty = auto), doDate, notes, lines: [{description, accountCode,
 * quantity, amount (per unit, before tax), taxCode}]}.
 */
create function public.save_delivery_order(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_id uuid := nullif(p->>'doId', '')::uuid;
  v_on date := nullif(p->>'doDate', '')::date;
  v_contact uuid := nullif(p->>'customerContactId', '')::uuid;
  v_name text := nullif(btrim(coalesce(p->>'customerName', '')), '');
  v_number text := nullif(btrim(coalesce(p->>'doNumber', '')), '');
  d public.delivery_orders;
  v_line jsonb;
  v_n int := 0;
  v_acct uuid;
  v_qty numeric; v_unit numeric; v_net numeric; v_tax numeric; v_code text;
  v_sub numeric := 0; v_tax_total numeric := 0;
begin
  if v_on is null then raise exception 'pick_do_date' using errcode = '22023'; end if;
  if v_contact is not null then
    if not exists (select 1 from public.contacts where id = v_contact and org_id = v_org) then raise exception 'select_customer' using errcode = '22023'; end if;
  elsif v_name is not null then
    select id into v_contact from public.contacts where org_id = v_org and lower(name) = lower(v_name);
    if v_contact is null then
      insert into public.contacts (org_id, name, kind) values (v_org, left(v_name, 200), 'customer') returning id into v_contact;
    end if;
  else
    raise exception 'select_customer' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'at_least_one_line' using errcode = '22023'; end if;

  if v_id is null then
    v_number := coalesce(v_number, public.next_do_number(v_org, v_on));
    insert into public.delivery_orders (org_id, contact_id, do_number, do_date, notes, created_by)
    values (v_org, v_contact, v_number, v_on, nullif(btrim(coalesce(p->>'notes', '')), ''), auth.uid()) returning * into d;
  else
    update public.delivery_orders set contact_id = v_contact, do_date = v_on, do_number = coalesce(v_number, do_number),
      notes = nullif(btrim(coalesce(p->>'notes', '')), ''), updated_at = now()
    where id = v_id and org_id = v_org and status = 'open' returning * into d;
    if d.id is null then raise exception 'transition' using errcode = '22023'; end if;
    delete from public.delivery_order_lines where delivery_order_id = v_id;
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
    v_code := public.tax_code_on(coalesce(nullif(v_line->>'taxCode', ''), 'none'), v_on);
    v_net := round(v_qty * v_unit, 2);
    v_tax := round(v_net * public.tax_rate(v_code), 2);
    insert into public.delivery_order_lines (delivery_order_id, line_no, org_id, description, account_id, quantity, unit_amount, amount, tax_code, tax_amount)
    values (d.id, v_n, v_org, left(btrim(v_line->>'description'), 500), v_acct, v_qty, v_unit, v_net, v_code, v_tax);
    v_sub := v_sub + v_net;
    v_tax_total := v_tax_total + v_tax;
  end loop;
  update public.delivery_orders set subtotal = v_sub, tax_total = v_tax_total, total = v_sub + v_tax_total where id = d.id;
  return jsonb_build_object('id', d.id, 'number', d.do_number);
exception
  when unique_violation then raise exception 'duplicate_number' using errcode = '22023', detail = coalesce(v_number, '');
end;
$$;

/** "Void without converting" (open DOs). */
create function public.void_delivery_order(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  update public.delivery_orders set status = 'void', voided_at = now(), updated_at = now() where id = p_id and org_id = v_org and status = 'open';
  if not found then raise exception 'transition' using errcode = '22023'; end if;
end;
$$;

/** "Delete" ("Only open delivery orders can be deleted. Void the delivery order instead."). */
create function public.delete_delivery_order(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  delete from public.delivery_orders where id = p_id and org_id = v_org and status = 'open';
  if not found then raise exception 'delete_open_only' using errcode = '22023'; end if;
end;
$$;

/** "Convert to invoice": a DRAFT invoice with the DO's lines (quantity and unit amount kept, tax-exclusive). */
create function public.convert_delivery_order(p_slug text, p_id uuid, p_invoice_number text, p_invoice_date date, p_due date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  d public.delivery_orders;
  v_lines jsonb;
  v_inv uuid;
begin
  select * into d from public.delivery_orders where id = p_id and org_id = v_org for update;
  if d.id is null or d.status <> 'open' then raise exception 'transition' using errcode = '22023'; end if;
  if p_invoice_date is null then raise exception 'pick_invoice_date' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('description', l.description, 'accountCode', a.code, 'quantity', l.quantity, 'unitPrice', l.unit_amount,
           'taxCode', case when l.tax_code = 'exempt' then 'none' else l.tax_code end) order by l.line_no)
    into v_lines from public.delivery_order_lines l join public.accounts a on a.id = l.account_id where l.delivery_order_id = p_id;
  v_inv := public.save_invoice_draft(v_org, jsonb_build_object(
    'customerContactId', d.contact_id, 'invoiceNumber', nullif(btrim(coalesce(p_invoice_number, '')), ''),
    'invoiceDate', p_invoice_date, 'dueDate', p_due, 'pricingMode', 'exclusive',
    'notes', coalesce(d.notes, 'From delivery order ' || d.do_number), 'lines', v_lines));
  update public.delivery_orders set status = 'converted', invoice_id = v_inv, updated_at = now() where id = p_id;
  return v_inv;
end;
$$;

/** "Reopen delivery order": once the invoice it became is voided (or the draft deleted). */
create function public.reopen_delivery_order(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  d public.delivery_orders;
begin
  select * into d from public.delivery_orders where id = p_id and org_id = v_org for update;
  if d.id is null or d.status <> 'converted'
     or (d.invoice_id is not null and not exists (select 1 from public.invoices where id = d.invoice_id and status = 'void')) then
    raise exception 'transition' using errcode = '22023';
  end if;
  update public.delivery_orders set status = 'open', invoice_id = null, updated_at = now() where id = p_id;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['save_delivery_order(text, jsonb)', 'void_delivery_order(text, uuid)', 'delete_delivery_order(text, uuid)',
                           'convert_delivery_order(text, uuid, text, date, date)', 'reopen_delivery_order(text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
