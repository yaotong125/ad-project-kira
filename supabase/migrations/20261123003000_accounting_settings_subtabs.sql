-- Slice 32: Accounting settings sub-tabs (Document numbering, Price book, Exchange rates).
-- Strictly modeled on lejar.ai's Settings -> Accounting sub-tabs.

create table if not exists public.org_document_numbering (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'invoice', 'quote', 'delivery_order', 'credit_note', 'debit_note',
    'refund_note', 'bill', 'official_receipt', 'payment_voucher',
    'quick_invoice', 'transfer'
  )),
  prefix text not null,
  pattern text not null default '{PREFIX}-{YYYY}{MM}-{SEQ}' check (pattern in (
    '{PREFIX}-{YYYY}{MM}-{SEQ}',
    '{PREFIX}-{YYYY}-{SEQ}',
    '{PREFIX}-{SEQ}'
  )),
  pad_width integer not null default 3 check (pad_width between 2 and 6),
  next_number integer not null default 1 check (next_number >= 1),
  updated_at timestamptz not null default now(),
  unique (org_id, doc_type)
);

create index if not exists idx_org_doc_numbering_org on public.org_document_numbering (org_id);

create table if not exists public.price_book_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sku text,
  category text not null default 'service' check (category in ('service', 'product', 'digital', 'other')),
  description text,
  unit_price_cents bigint not null default 0 check (unit_price_cents >= 0),
  tax_code text not null default 'NONE' check (tax_code in ('NONE', 'ST_8', 'ST_6', 'ST_5', 'ST_10', 'EXEMPT')),
  revenue_account_id uuid references public.accounts(id) on delete set null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_price_book_org on public.price_book_items (org_id, active, name);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$' and currency_code <> 'MYR'),
  rate_date date not null,
  rate numeric(18, 6) not null check (rate > 0),
  source text not null default 'bank' check (source in ('bank', 'bnm', 'manual')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, currency_code, rate_date)
);

create index if not exists idx_exchange_rates_org on public.exchange_rates (org_id, currency_code, rate_date desc);

-- RLS: org members read; writes go strictly through security definer RPCs.
alter table public.org_document_numbering enable row level security;
alter table public.price_book_items enable row level security;
alter table public.exchange_rates enable row level security;

drop policy if exists "org_doc_numbering_select_member" on public.org_document_numbering;
create policy "org_doc_numbering_select_member" on public.org_document_numbering
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists "price_book_select_member" on public.price_book_items;
create policy "price_book_select_member" on public.price_book_items
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists "exchange_rates_select_member" on public.exchange_rates;
create policy "exchange_rates_select_member" on public.exchange_rates
  for select to authenticated using (public.is_org_member(org_id));

-- 1. Document numbering RPC (Owner / Admin)
create or replace function public.upsert_document_numbering(
  p_slug text,
  p_doc_type text,
  p_prefix text,
  p_pattern text,
  p_pad_width integer,
  p_next_number integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.org_for_admin(p_slug);
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
  v_id uuid;
  v_actor_email text;
begin
  if v_prefix = '' or char_length(v_prefix) > 12 then
    raise exception 'Prefix must be between 1 and 12 characters.';
  end if;
  if p_doc_type not in ('invoice','quote','delivery_order','credit_note','debit_note','refund_note','bill','official_receipt','payment_voucher','quick_invoice','transfer') then
    raise exception 'Invalid document type.';
  end if;
  if p_pattern not in ('{PREFIX}-{YYYY}{MM}-{SEQ}','{PREFIX}-{YYYY}-{SEQ}','{PREFIX}-{SEQ}') then
    raise exception 'Invalid numbering pattern.';
  end if;
  if p_pad_width < 2 or p_pad_width > 6 then
    raise exception 'Padding width must be between 2 and 6 digits.';
  end if;
  if p_next_number < 1 then
    raise exception 'Next number must be at least 1.';
  end if;

  insert into public.org_document_numbering (org_id, doc_type, prefix, pattern, pad_width, next_number, updated_at)
  values (v_org_id, p_doc_type, v_prefix, p_pattern, p_pad_width, p_next_number, now())
  on conflict (org_id, doc_type) do update
    set prefix = excluded.prefix,
        pattern = excluded.pattern,
        pad_width = excluded.pad_width,
        next_number = excluded.next_number,
        updated_at = now()
  returning id into v_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org_id, auth.uid(), v_actor_email, 'numbering.updated', 'Updated ' || p_doc_type || ' numbering (' || v_prefix || ', next #' || p_next_number || ')', jsonb_build_object('doc_type', p_doc_type, 'prefix', v_prefix, 'pattern', p_pattern));

  return v_id;
end;
$$;

-- 2. Price book RPCs (Owner / Admin / Bookkeeper via learn_org_for_editor)
create or replace function public.create_price_book_item(
  p_slug text,
  p_name text,
  p_sku text,
  p_category text,
  p_description text,
  p_unit_price_cents bigint,
  p_tax_code text,
  p_revenue_account_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.learn_org_for_editor(p_slug);
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_actor_email text;
begin
  if v_name = '' then
    raise exception 'Item name is required.';
  end if;
  if p_category not in ('service', 'product', 'digital', 'other') then
    raise exception 'Invalid item category.';
  end if;
  if p_unit_price_cents < 0 then
    raise exception 'Default price cannot be negative.';
  end if;
  if p_tax_code not in ('NONE', 'ST_8', 'ST_6', 'ST_5', 'ST_10', 'EXEMPT') then
    raise exception 'Invalid SST treatment.';
  end if;
  if p_revenue_account_id is not null and not exists (
    select 1 from public.accounts where id = p_revenue_account_id and org_id = v_org_id
  ) then
    raise exception 'Revenue account not found in this organisation.';
  end if;

  insert into public.price_book_items (
    org_id, name, sku, category, description, unit_price_cents, tax_code, revenue_account_id, created_by
  ) values (
    v_org_id, v_name, nullif(btrim(coalesce(p_sku, '')), ''), p_category,
    nullif(btrim(coalesce(p_description, '')), ''), p_unit_price_cents, p_tax_code,
    p_revenue_account_id, auth.uid()
  )
  returning id into v_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org_id, auth.uid(), v_actor_email, 'price_book.created', 'Added price book item "' || v_name || '"', jsonb_build_object('item_id', v_id, 'category', p_category));

  return v_id;
end;
$$;

create or replace function public.update_price_book_item(
  p_slug text,
  p_id uuid,
  p_name text,
  p_sku text,
  p_category text,
  p_description text,
  p_unit_price_cents bigint,
  p_tax_code text,
  p_revenue_account_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.learn_org_for_editor(p_slug);
  v_name text := btrim(coalesce(p_name, ''));
  v_actor_email text;
begin
  if v_name = '' then
    raise exception 'Item name is required.';
  end if;
  if p_unit_price_cents < 0 then
    raise exception 'Default price cannot be negative.';
  end if;
  if p_revenue_account_id is not null and not exists (
    select 1 from public.accounts where id = p_revenue_account_id and org_id = v_org_id
  ) then
    raise exception 'Revenue account not found in this organisation.';
  end if;

  update public.price_book_items
  set name = v_name,
      sku = nullif(btrim(coalesce(p_sku, '')), ''),
      category = p_category,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      unit_price_cents = p_unit_price_cents,
      tax_code = p_tax_code,
      revenue_account_id = p_revenue_account_id,
      updated_at = now()
  where id = p_id and org_id = v_org_id;

  if not found then
    raise exception 'Price book item not found.';
  end if;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org_id, auth.uid(), v_actor_email, 'price_book.updated', 'Updated price book item "' || v_name || '"', jsonb_build_object('item_id', p_id));
end;
$$;

create or replace function public.toggle_price_book_item(
  p_slug text,
  p_id uuid,
  p_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.learn_org_for_editor(p_slug);
  v_name text;
  v_actor_email text;
begin
  update public.price_book_items
  set active = p_active, updated_at = now()
  where id = p_id and org_id = v_org_id
  returning name into v_name;

  if not found then
    raise exception 'Price book item not found.';
  end if;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org_id, auth.uid(), v_actor_email, 'price_book.toggled', (case when p_active then 'Restored' else 'Archived' end) || ' price book item "' || v_name || '"', jsonb_build_object('item_id', p_id, 'active', p_active));
end;
$$;

create or replace function public.delete_price_book_item(
  p_slug text,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.learn_org_for_editor(p_slug);
  v_name text;
  v_actor_email text;
begin
  delete from public.price_book_items
  where id = p_id and org_id = v_org_id
  returning name into v_name;

  if not found then
    raise exception 'Price book item not found.';
  end if;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org_id, auth.uid(), v_actor_email, 'price_book.deleted', 'Deleted price book item "' || v_name || '"', jsonb_build_object('item_id', p_id));
end;
$$;

-- 3. Exchange rates RPCs (Owner / Admin / Bookkeeper via learn_org_for_editor)
create or replace function public.upsert_exchange_rate(
  p_slug text,
  p_currency_code text,
  p_rate_date date,
  p_rate numeric,
  p_source text,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.learn_org_for_editor(p_slug);
  v_ccy text := upper(btrim(coalesce(p_currency_code, '')));
  v_id uuid;
  v_actor_email text;
begin
  if v_ccy !~ '^[A-Z]{3}$' or v_ccy = 'MYR' then
    raise exception 'Enter a valid 3-letter foreign currency code (not MYR).';
  end if;
  if p_rate_date is null then
    raise exception 'Rate date is required.';
  end if;
  if p_rate is null or p_rate <= 0 then
    raise exception 'Exchange rate must be greater than zero.';
  end if;
  if p_source not in ('bank', 'bnm', 'manual') then
    raise exception 'Invalid rate source.';
  end if;

  insert into public.exchange_rates (org_id, currency_code, rate_date, rate, source, note, created_by, updated_at)
  values (v_org_id, v_ccy, p_rate_date, p_rate, p_source, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), now())
  on conflict (org_id, currency_code, rate_date) do update
    set rate = excluded.rate,
        source = excluded.source,
        note = excluded.note,
        updated_at = now()
  returning id into v_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org_id, auth.uid(), v_actor_email, 'exchange_rate.saved', 'Saved ' || v_ccy || '/MYR rate ' || p_rate::text || ' for ' || p_rate_date::text, jsonb_build_object('rate_id', v_id, 'currency', v_ccy, 'rate', p_rate));

  return v_id;
end;
$$;

create or replace function public.delete_exchange_rate(
  p_slug text,
  p_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.learn_org_for_editor(p_slug);
  v_ccy text;
  v_dt date;
  v_actor_email text;
begin
  delete from public.exchange_rates
  where id = p_id and org_id = v_org_id
  returning currency_code, rate_date into v_ccy, v_dt;

  if not found then
    raise exception 'Exchange rate not found.';
  end if;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org_id, auth.uid(), v_actor_email, 'exchange_rate.deleted', 'Deleted ' || v_ccy || '/MYR rate for ' || v_dt::text, jsonb_build_object('rate_id', p_id, 'currency', v_ccy));
end;
$$;

revoke all on function public.upsert_document_numbering(text, text, text, text, integer, integer) from public, anon;
grant execute on function public.upsert_document_numbering(text, text, text, text, integer, integer) to authenticated;

revoke all on function public.create_price_book_item(text, text, text, text, text, bigint, text, uuid) from public, anon;
grant execute on function public.create_price_book_item(text, text, text, text, text, bigint, text, uuid) to authenticated;

revoke all on function public.update_price_book_item(text, uuid, text, text, text, text, bigint, text, uuid) from public, anon;
grant execute on function public.update_price_book_item(text, uuid, text, text, text, text, bigint, text, uuid) to authenticated;

revoke all on function public.toggle_price_book_item(text, uuid, boolean) from public, anon;
grant execute on function public.toggle_price_book_item(text, uuid, boolean) to authenticated;

revoke all on function public.delete_price_book_item(text, uuid) from public, anon;
grant execute on function public.delete_price_book_item(text, uuid) to authenticated;

revoke all on function public.upsert_exchange_rate(text, text, date, numeric, text, text) from public, anon;
grant execute on function public.upsert_exchange_rate(text, text, date, numeric, text, text) to authenticated;

revoke all on function public.delete_exchange_rate(text, uuid) from public, anon;
grant execute on function public.delete_exchange_rate(text, uuid) to authenticated;
