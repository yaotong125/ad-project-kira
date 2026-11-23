-- Slice 20: Quotes (lejar.ai /quotes, observed 2026-11-23 on Lejar's demo company and the user's test entity;
-- docs/re/20-quotes.md). Nothing posts to the ledger until a converted invoice is recorded.

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id),
  quote_number text not null check (char_length(quote_number) between 1 and 50),
  quote_date date not null,
  expires_on date,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined', 'expired', 'void', 'converted')),
  notes text check (notes is null or char_length(notes) <= 1000),
  subtotal numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  sent_at timestamptz,
  responded_at timestamptz,
  invoice_id uuid references public.invoices (id) on delete set null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, quote_number),
  check (expires_on is null or expires_on >= quote_date)
);
create index quotes_org_date_idx on public.quotes (org_id, quote_date desc);

create table public.quote_lines (
  quote_id uuid not null references public.quotes (id) on delete cascade,
  line_no integer not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  description text not null check (char_length(description) between 1 and 500),
  account_id uuid not null references public.accounts (id),
  amount numeric(14, 2) not null check (amount > 0),
  tax_code text not null check (tax_code in ('none', 'sst_6', 'sst_8', 'sales_5', 'sales_10', 'exempt')),
  tax_amount numeric(14, 2) not null,
  primary key (quote_id, line_no)
);

/** lejar.ai's quote History: every step and edit after the draft. */
create table public.quote_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  quote_id uuid not null references public.quotes (id) on delete cascade,
  action text not null,
  detail text,
  acted_by uuid references auth.users (id),
  acted_at timestamptz not null default now()
);
create index quote_events_quote_idx on public.quote_events (quote_id, acted_at);

do $$
declare t text;
begin
  foreach t in array array['quotes', 'quote_lines', 'quote_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

/** QUO-202611-001, per month (lejar.ai: "Assigned when saved"). */
create function public.next_quote_number(p_org uuid, p_on date) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_stem text := 'QUO-' || to_char(p_on, 'YYYYMM') || '-';
  v_max int;
begin
  if not public.is_org_member(p_org) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select max(substring(quote_number from char_length(v_stem) + 1)::int) into v_max
  from public.quotes where org_id = p_org and quote_number ~ ('^' || v_stem || '[0-9]+$');
  return v_stem || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;
grant execute on function public.next_quote_number(uuid, date) to authenticated;

/**
 * "Save draft quote" / "Save changes". p: {quoteId?, customerContactId?, customerName, quoteNumber (empty = auto),
 * quoteDate, expiresOn, notes, lines: [{description, accountCode, amount, taxCode}]}. Amounts are before tax.
 * Drafts are replaced; a sent or accepted quote keeps its id and number and the edit goes into its history.
 */
create function public.save_quote(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_id uuid := nullif(p->>'quoteId', '')::uuid;
  v_on date := nullif(p->>'quoteDate', '')::date;
  v_exp date := nullif(p->>'expiresOn', '')::date;
  v_contact uuid := nullif(p->>'customerContactId', '')::uuid;
  v_name text := nullif(btrim(coalesce(p->>'customerName', '')), '');
  v_number text := nullif(btrim(coalesce(p->>'quoteNumber', '')), '');
  q public.quotes;
  v_line jsonb;
  v_n int := 0;
  v_acct uuid;
  v_amt numeric; v_tax numeric; v_code text;
  v_sub numeric := 0; v_tax_total numeric := 0;
begin
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_exp is not null and v_exp < v_on then raise exception 'expiry_before_date' using errcode = '22023'; end if;
  if v_contact is not null then
    if not exists (select 1 from public.contacts where id = v_contact and org_id = v_org) then raise exception 'unknown_customer' using errcode = '22023'; end if;
  elsif v_name is not null then
    select id into v_contact from public.contacts where org_id = v_org and lower(name) = lower(v_name);
    if v_contact is null then
      insert into public.contacts (org_id, name, kind) values (v_org, left(v_name, 200), 'customer') returning id into v_contact;
    end if;
  else
    raise exception 'customer_required' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p->'lines', '[]')) = 0 then raise exception 'one_line' using errcode = '22023'; end if;

  if v_id is null then
    v_number := coalesce(v_number, public.next_quote_number(v_org, v_on));
    insert into public.quotes (org_id, contact_id, quote_number, quote_date, expires_on, notes, created_by)
    values (v_org, v_contact, v_number, v_on, v_exp, nullif(btrim(coalesce(p->>'notes', '')), ''), auth.uid()) returning * into q;
  else
    select * into q from public.quotes where id = v_id and org_id = v_org for update;
    if q.id is null or q.status not in ('draft', 'sent', 'accepted') then raise exception 'not_editable' using errcode = '22023'; end if;
    update public.quotes set contact_id = v_contact, quote_date = v_on, expires_on = v_exp, notes = nullif(btrim(coalesce(p->>'notes', '')), ''),
      quote_number = case when q.status = 'draft' then coalesce(v_number, quote_number) else quote_number end, updated_at = now()
    where id = v_id returning * into q;
    delete from public.quote_lines where quote_id = v_id;
    if q.status <> 'draft' then
      insert into public.quote_events (org_id, quote_id, action, acted_by) values (v_org, v_id, 'edited', auth.uid());
    end if;
  end if;

  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_n := v_n + 1;
    if nullif(btrim(coalesce(v_line->>'description', '')), '') is null then raise exception 'line_description' using errcode = '22023'; end if;
    select id into v_acct from public.accounts where org_id = v_org and code = v_line->>'accountCode' and status = 'active' and not is_cash;
    if v_acct is null then raise exception 'unknown_account' using errcode = '22023'; end if;
    v_amt := round(nullif(v_line->>'amount', '')::numeric, 2);
    if v_amt is null or v_amt <= 0 then raise exception 'line_positive' using errcode = '22023'; end if;
    v_code := public.tax_code_on(coalesce(nullif(v_line->>'taxCode', ''), 'none'), v_on);
    v_tax := round(v_amt * public.tax_rate(v_code), 2);
    insert into public.quote_lines (quote_id, line_no, org_id, description, account_id, amount, tax_code, tax_amount)
    values (q.id, v_n, v_org, left(btrim(v_line->>'description'), 500), v_acct, v_amt, v_code, v_tax);
    v_sub := v_sub + v_amt;
    v_tax_total := v_tax_total + v_tax;
  end loop;
  update public.quotes set subtotal = v_sub, tax_total = v_tax_total, total = v_sub + v_tax_total where id = q.id;
  return jsonb_build_object('id', q.id, 'number', q.quote_number);
exception
  when unique_violation then raise exception 'duplicate_number' using errcode = '22023', detail = coalesce(v_number, '');
end;
$$;

/**
 * lejar.ai's quote steps: send (draft → sent), accept / decline (sent → accepted / declined), expire (sent →
 * expired), void (anything before conversion → void).
 */
create function public.quote_transition(p_slug text, p_id uuid, p_to text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  q public.quotes;
begin
  select * into q from public.quotes where id = p_id and org_id = v_org for update;
  if q.id is null then raise exception 'not_found' using errcode = '22023'; end if;
  if not (
    (p_to = 'sent' and q.status = 'draft')
    or (p_to in ('accepted', 'declined', 'expired') and q.status = 'sent')
    or (p_to = 'void' and q.status in ('draft', 'sent', 'accepted', 'declined', 'expired'))) then
    raise exception 'transition' using errcode = '22023';
  end if;
  update public.quotes set status = p_to, updated_at = now(),
    sent_at = case when p_to = 'sent' then now() else sent_at end,
    responded_at = case when p_to in ('accepted', 'declined', 'expired') then now() else responded_at end
  where id = p_id;
  insert into public.quote_events (org_id, quote_id, action, acted_by) values (v_org, p_id, p_to, auth.uid());
end;
$$;

/** "Lejar also flips a sent quote to expired automatically once its expiry date passes." */
create function public.expire_due_quotes(p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.is_org_member(p_org) then return 0; end if;
  with x as (
    update public.quotes set status = 'expired', responded_at = now(), updated_at = now()
    where org_id = p_org and status = 'sent' and expires_on is not null and expires_on < public.today_my()
    returning id
  ), ev as (
    insert into public.quote_events (org_id, quote_id, action, detail) select p_org, id, 'expired', 'automatic' from x returning 1
  ) select count(*) into v_n from ev;
  return v_n;
end;
$$;

/** "Delete" on a draft. */
create function public.delete_quote_draft(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
begin
  delete from public.quotes where id = p_id and org_id = v_org and status = 'draft';
  if not found then raise exception 'transition' using errcode = '22023'; end if;
end;
$$;

/**
 * "Convert to invoice": "Creates a DRAFT invoice from this quote's lines. Recording it is a separate step."
 * Each quote line becomes one invoice line (quantity 1, the quote amount as the unit price, tax-exclusive).
 */
create function public.convert_quote(p_slug text, p_id uuid, p_invoice_number text, p_invoice_date date, p_due date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  q public.quotes;
  v_lines jsonb;
  v_inv uuid;
begin
  select * into q from public.quotes where id = p_id and org_id = v_org for update;
  if q.id is null or q.status <> 'accepted' then raise exception 'transition' using errcode = '22023'; end if;
  if p_invoice_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  select jsonb_agg(jsonb_build_object('description', l.description, 'accountCode', a.code, 'quantity', 1, 'unitPrice', l.amount,
           'taxCode', case when l.tax_code = 'exempt' then 'none' else l.tax_code end) order by l.line_no)
    into v_lines from public.quote_lines l join public.accounts a on a.id = l.account_id where l.quote_id = p_id;
  v_inv := public.save_invoice_draft(v_org, jsonb_build_object(
    'customerContactId', q.contact_id, 'invoiceNumber', nullif(btrim(coalesce(p_invoice_number, '')), ''),
    'invoiceDate', p_invoice_date, 'dueDate', p_due, 'pricingMode', 'exclusive',
    'notes', coalesce(q.notes, 'From quote ' || q.quote_number), 'lines', v_lines));
  update public.quotes set status = 'converted', invoice_id = v_inv, updated_at = now() where id = p_id;
  insert into public.quote_events (org_id, quote_id, action, detail, acted_by)
  values (v_org, p_id, 'converted', (select invoice_number from public.invoices where id = v_inv), auth.uid());
  return v_inv;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['save_quote(text, jsonb)', 'quote_transition(text, uuid, text)', 'expire_due_quotes(uuid)',
                           'delete_quote_draft(text, uuid)', 'convert_quote(text, uuid, text, date, date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
