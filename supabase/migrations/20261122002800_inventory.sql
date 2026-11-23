-- Kira slice 30: Inventory (/{slug}/inventory, /locations, /stocktakes, /stocktakes/[id], /transfers, /writedowns, /opening-import).
-- Reverse engineered from lejar.ai's "saved-items-and-stock" help article & inventory.ui.* / inventory.reports.* keys.

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in (
    'manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal',
    'note', 'sst', 'credit', 'official_receipt', 'payment_voucher', 'transfer',
    'depreciation', 'disposal', 'amortisation', 'opening_balance', 'inventory'
  ));

alter table public.organizations
  add column if not exists inventory_enabled boolean not null default false;

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index inventory_locations_org_name_idx on public.inventory_locations (org_id, lower(name));

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 150),
  sku text check (sku is null or char_length(sku) <= 60),
  uom text not null default 'unit' check (char_length(uom) between 1 and 30),
  costing_method text not null default 'moving_average' check (costing_method in ('fifo', 'moving_average')),
  reorder_point numeric(14, 4) check (reorder_point is null or reorder_point >= 0),
  reorder_quantity numeric(14, 4) check (reorder_quantity is null or reorder_quantity >= 0),
  created_at timestamptz not null default now()
);
create unique index inventory_items_org_name_idx on public.inventory_items (org_id, lower(name));

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  location_id uuid not null references public.inventory_locations (id),
  occurred_on date not null,
  kind text not null check (kind in ('opening', 'transfer_out', 'transfer_in', 'stocktake_adjustment', 'writedown')),
  quantity_delta numeric(14, 4) not null default 0,
  value_delta numeric(14, 2) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  reference_id uuid,
  memo text,
  journal_entry_id uuid references public.journal_entries (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_org_item_idx on public.inventory_movements (org_id, item_id, occurred_on desc, created_at desc);
create index inventory_movements_org_loc_idx on public.inventory_movements (org_id, location_id);

create table public.inventory_stocktakes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null references public.inventory_locations (id),
  opened_on date not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'cancelled')),
  memo text check (memo is null or char_length(memo) <= 300),
  confirmed_on date,
  journal_entry_id uuid references public.journal_entries (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index inventory_stocktakes_one_open_per_loc
  on public.inventory_stocktakes (org_id, location_id)
  where status = 'open';

create table public.inventory_stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  stocktake_id uuid not null references public.inventory_stocktakes (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  book_quantity numeric(14, 4) not null default 0,
  unit_cost numeric(14, 4) not null default 0,
  counted_quantity numeric(14, 4) check (counted_quantity is null or counted_quantity >= 0),
  unique (stocktake_id, item_id)
);

create table public.inventory_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  from_location_id uuid not null references public.inventory_locations (id),
  to_location_id uuid not null references public.inventory_locations (id),
  occurred_on date not null,
  memo text check (memo is null or char_length(memo) <= 300),
  line_count integer not null default 1,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_location_id <> to_location_id)
);

create table public.inventory_writedowns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  occurred_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  value_before numeric(14, 2) not null,
  value_after numeric(14, 2) not null,
  reason text not null check (char_length(reason) between 2 and 300),
  journal_entry_id uuid not null references public.journal_entries (id),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.inventory_locations enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_stocktakes enable row level security;
alter table public.inventory_stocktake_lines enable row level security;
alter table public.inventory_transfers enable row level security;
alter table public.inventory_writedowns enable row level security;

create policy inv_locations_read on public.inventory_locations for select to authenticated using (public.is_org_member(org_id));
create policy inv_items_read on public.inventory_items for select to authenticated using (public.is_org_member(org_id));
create policy inv_movements_read on public.inventory_movements for select to authenticated using (public.is_org_member(org_id));
create policy inv_stocktakes_read on public.inventory_stocktakes for select to authenticated using (public.is_org_member(org_id));
create policy inv_stocktake_lines_read on public.inventory_stocktake_lines for select to authenticated using (public.is_org_member(org_id));
create policy inv_transfers_read on public.inventory_transfers for select to authenticated using (public.is_org_member(org_id));
create policy inv_writedowns_read on public.inventory_writedowns for select to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------------------------
-- Helper: resolve Stock Asset (300-0100) and Stock Adjustments (700-0400).
create function public.inventory_account_ids(p_org uuid, out stock_acct uuid, out adj_acct uuid)
language plpgsql security definer set search_path = public as $$
begin
  select id into stock_acct from public.accounts
  where org_id = p_org and status = 'active' and (code = '300-0100' or lower(name) = 'inventory')
  order by case when code = '300-0100' then 0 else 1 end, code limit 1;
  if stock_acct is null then raise exception 'no_stock_account' using errcode = '22023'; end if;

  select id into adj_acct from public.accounts
  where org_id = p_org and status = 'active' and (code = '700-0400' or lower(name) like '%stock adjustment%')
  order by case when code = '700-0400' then 0 else 1 end, code limit 1;
  if adj_acct is null then
    insert into public.accounts (org_id, code, name, type, section, normal_balance, is_cash, status)
    values (p_org, '700-0400', 'Stock Adjustments and Write-downs', 'expense', 'cost_of_sales', 'debit', false, 'active')
    on conflict (org_id, code) do update set status = 'active'
    returning id into adj_acct;
  end if;
end;
$$;
revoke all on function public.inventory_account_ids(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Enable stock tracking (Owner / Admin).
create function public.enable_inventory(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_stock uuid;
  v_adj uuid;
begin
  update public.organizations set inventory_enabled = true where id = v_org;
  select stock_acct, adj_acct into v_stock, v_adj from public.inventory_account_ids(v_org);

  if not exists (select 1 from public.inventory_locations where org_id = v_org) then
    insert into public.inventory_locations (org_id, name, is_default)
    values (v_org, 'Main store', true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Locations CRUD.
create function public.create_inventory_location(p_slug text, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_name text := btrim(coalesce(p_name, ''));
  v_first boolean;
  v_id uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 120 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if exists (select 1 from public.inventory_locations where org_id = v_org and lower(name) = lower(v_name)) then
    raise exception 'duplicate_location' using errcode = '22023';
  end if;
  v_first := not exists (select 1 from public.inventory_locations where org_id = v_org and archived_at is null);
  insert into public.inventory_locations (org_id, name, is_default)
  values (v_org, v_name, v_first) returning id into v_id;
  return v_id;
end;
$$;

create function public.set_default_inventory_location(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
begin
  if not exists (select 1 from public.inventory_locations where id = p_id and org_id = v_org and archived_at is null) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  update public.inventory_locations set is_default = (id = p_id) where org_id = v_org;
end;
$$;

create function public.archive_inventory_location(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_held numeric;
begin
  if not exists (select 1 from public.inventory_locations where id = p_id and org_id = v_org and archived_at is null) then
    raise exception 'not_found' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_stocktakes where org_id = v_org and location_id = p_id and status = 'open') then
    raise exception 'location_frozen' using errcode = '22023';
  end if;
  select coalesce(sum(quantity_delta), 0) into v_held from public.inventory_movements where org_id = v_org and location_id = p_id;
  if v_held <> 0 then raise exception 'location_not_empty' using errcode = '22023'; end if;
  update public.inventory_locations set archived_at = now(), is_default = false where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Stock items CRUD.
create function public.create_inventory_item(p_slug text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_name text := btrim(coalesce(p->>'name', ''));
  v_sku text := nullif(btrim(coalesce(p->>'sku', '')), '');
  v_uom text := coalesce(nullif(btrim(coalesce(p->>'uom', '')), ''), 'unit');
  v_costing text := coalesce(nullif(p->>'costingMethod', ''), 'moving_average');
  v_rp numeric := nullif(p->>'reorderPoint', '')::numeric;
  v_rq numeric := nullif(p->>'reorderQuantity', '')::numeric;
  v_id uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 150 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if v_costing not in ('fifo', 'moving_average') then v_costing := 'moving_average'; end if;
  if v_rp is not null and v_rp < 0 then raise exception 'invalid_qty' using errcode = '22023'; end if;
  if v_rq is not null and v_rq < 0 then raise exception 'invalid_qty' using errcode = '22023'; end if;
  if exists (select 1 from public.inventory_items where org_id = v_org and lower(name) = lower(v_name)) then
    raise exception 'duplicate_item' using errcode = '22023';
  end if;

  insert into public.inventory_items (org_id, name, sku, uom, costing_method, reorder_point, reorder_quantity)
  values (v_org, v_name, left(v_sku, 60), left(v_uom, 30), v_costing, v_rp, v_rq)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.update_inventory_item(p_slug text, p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  it public.inventory_items;
  v_uom text := coalesce(nullif(btrim(coalesce(p->>'uom', '')), ''), 'unit');
  v_costing text := coalesce(nullif(p->>'costingMethod', ''), 'moving_average');
  v_rp numeric := nullif(p->>'reorderPoint', '')::numeric;
  v_rq numeric := nullif(p->>'reorderQuantity', '')::numeric;
  v_has_moves boolean;
begin
  select * into it from public.inventory_items where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  v_has_moves := exists (select 1 from public.inventory_movements where item_id = it.id);
  if v_has_moves and v_costing <> it.costing_method then
    raise exception 'costing_locked' using errcode = '22023';
  end if;
  update public.inventory_items
  set uom = left(v_uom, 30),
      costing_method = case when v_has_moves then it.costing_method else v_costing end,
      reorder_point = v_rp,
      reorder_quantity = v_rq
  where id = it.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Opening stock import (creates items if needed, records opening movements, posts 1 balanced journal).
create function public.import_opening_stock(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_date date := nullif(p->>'openingDate', '')::date;
  v_counter uuid := nullif(p->>'counterAccountId', '')::uuid;
  v_def_costing text := coalesce(nullif(p->>'defaultCosting', ''), 'moving_average');
  v_rows jsonb := coalesce(p->'rows', '[]'::jsonb);
  v_row jsonb;
  v_item_name text;
  v_loc_name text;
  v_qty numeric;
  v_unit_cost numeric;
  v_uom text;
  v_costing text;
  v_item_id uuid;
  v_loc_id uuid;
  v_val numeric;
  v_total numeric := 0;
  v_items_created int := 0;
  v_moves int := 0;
  v_stock_acct uuid;
  v_adj_acct uuid;
  v_je_id uuid := null;
  v_batch_id uuid := gen_random_uuid();
begin
  if v_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts where id = v_counter and org_id = v_org and type = 'equity' and status = 'active') then
    raise exception 'invalid_counter_account' using errcode = '22023';
  end if;
  if jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) = 0 then
    raise exception 'no_rows' using errcode = '22023';
  end if;

  select stock_acct, adj_acct into v_stock_acct, v_adj_acct from public.inventory_account_ids(v_org);

  for v_row in select * from jsonb_array_elements(v_rows) loop
    v_item_name := btrim(coalesce(v_row->>'item', ''));
    v_loc_name := btrim(coalesce(v_row->>'location', ''));
    v_qty := nullif(v_row->>'quantity', '')::numeric;
    v_unit_cost := nullif(v_row->>'unitCost', '')::numeric;
    v_uom := coalesce(nullif(btrim(coalesce(v_row->>'uom', '')), ''), 'unit');
    v_costing := coalesce(nullif(v_row->>'costingMethod', ''), v_def_costing);
    if v_costing not in ('fifo', 'moving_average') then v_costing := v_def_costing; end if;

    if char_length(v_item_name) < 1 then raise exception 'invalid_item' using errcode = '22023'; end if;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_qty' using errcode = '22023'; end if;
    if v_unit_cost is null or v_unit_cost < 0 then raise exception 'invalid_cost' using errcode = '22023'; end if;

    select id into v_loc_id from public.inventory_locations
    where org_id = v_org and archived_at is null and lower(name) = lower(v_loc_name) limit 1;
    if v_loc_id is null then raise exception 'unknown_location' using errcode = '22023', detail = v_loc_name; end if;

    if exists (select 1 from public.inventory_stocktakes where org_id = v_org and location_id = v_loc_id and status = 'open') then
      raise exception 'location_frozen' using errcode = '22023';
    end if;

    select id into v_item_id from public.inventory_items where org_id = v_org and lower(name) = lower(v_item_name) limit 1;
    if v_item_id is null then
      insert into public.inventory_items (org_id, name, uom, costing_method)
      values (v_org, left(v_item_name, 150), left(v_uom, 30), v_costing)
      returning id into v_item_id;
      v_items_created := v_items_created + 1;
    end if;

    v_val := round(v_qty * v_unit_cost, 2);
    insert into public.inventory_movements (
      org_id, item_id, location_id, occurred_on, kind, quantity_delta, value_delta, unit_cost, reference_id, memo, created_by
    ) values (
      v_org, v_item_id, v_loc_id, v_date, 'opening', v_qty, v_val, v_unit_cost, v_batch_id, 'Opening stock import', auth.uid()
    );
    v_total := v_total + v_val;
    v_moves := v_moves + 1;
  end loop;

  if v_total > 0 then
    v_je_id := public.insert_journal(
      v_org, null, v_date,
      'Opening stock import (' || v_moves || ' movements)',
      'inventory', v_batch_id, null, null,
      jsonb_build_array(
        jsonb_build_object('accountId', v_stock_acct, 'debit', v_total, 'credit', 0, 'description', 'Opening stock'),
        jsonb_build_object('accountId', v_counter, 'debit', 0, 'credit', v_total, 'description', 'Opening stock equity offset')
      )
    );
    update public.inventory_movements set journal_entry_id = v_je_id where reference_id = v_batch_id;
  end if;

  return jsonb_build_object('itemsCreated', v_items_created, 'movements', v_moves, 'totalCost', v_total, 'journalEntryId', v_je_id);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Stock transfers (quantity moves between two locations; total stock value unchanged).
create function public.record_stock_transfer(p_slug text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_from uuid := nullif(p->>'fromLocationId', '')::uuid;
  v_to uuid := nullif(p->>'toLocationId', '')::uuid;
  v_date date := nullif(p->>'occurredOn', '')::date;
  v_memo text := nullif(btrim(coalesce(p->>'memo', '')), '');
  v_lines jsonb := coalesce(p->'lines', '[]'::jsonb);
  v_line jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_avail numeric;
  v_tot_qty numeric;
  v_tot_val numeric;
  v_avg numeric;
  v_val numeric;
  v_trf_id uuid;
  v_count int := 0;
begin
  if v_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_from is null or v_to is null or v_from = v_to then raise exception 'different_locations' using errcode = '22023'; end if;
  if not exists (select 1 from public.inventory_locations where id = v_from and org_id = v_org and archived_at is null)
     or not exists (select 1 from public.inventory_locations where id = v_to and org_id = v_org and archived_at is null) then
    raise exception 'unknown_location' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_stocktakes where org_id = v_org and location_id in (v_from, v_to) and status = 'open') then
    raise exception 'location_frozen' using errcode = '22023';
  end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'no_lines' using errcode = '22023';
  end if;

  insert into public.inventory_transfers (org_id, from_location_id, to_location_id, occurred_on, memo, line_count, created_by)
  values (v_org, v_from, v_to, v_date, left(v_memo, 300), jsonb_array_length(v_lines), auth.uid())
  returning id into v_trf_id;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_item_id := nullif(v_line->>'itemId', '')::uuid;
    v_qty := nullif(v_line->>'quantity', '')::numeric;
    if v_item_id is null or not exists (select 1 from public.inventory_items where id = v_item_id and org_id = v_org) then
      raise exception 'unknown_item' using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 then raise exception 'invalid_qty' using errcode = '22023'; end if;

    select coalesce(sum(quantity_delta), 0) into v_avail
    from public.inventory_movements where org_id = v_org and item_id = v_item_id and location_id = v_from;
    if v_avail < v_qty then raise exception 'insufficient_stock' using errcode = '22023'; end if;

    select coalesce(sum(quantity_delta), 0), coalesce(sum(value_delta), 0) into v_tot_qty, v_tot_val
    from public.inventory_movements where org_id = v_org and item_id = v_item_id;
    v_avg := case when v_tot_qty > 0 then round(v_tot_val / v_tot_qty, 4) else 0 end;
    v_val := round(v_qty * v_avg, 2);

    insert into public.inventory_movements (org_id, item_id, location_id, occurred_on, kind, quantity_delta, value_delta, unit_cost, reference_id, memo, created_by)
    values
      (v_org, v_item_id, v_from, v_date, 'transfer_out', -v_qty, -v_val, v_avg, v_trf_id, coalesce(v_memo, 'Stock transfer'), auth.uid()),
      (v_org, v_item_id, v_to, v_date, 'transfer_in', v_qty, v_val, v_avg, v_trf_id, coalesce(v_memo, 'Stock transfer'), auth.uid());
    v_count := v_count + 1;
  end loop;

  update public.inventory_transfers set line_count = v_count where id = v_trf_id;
  return v_trf_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Stocktakes (open freezes location, save counts, confirm books variance journal, cancel unfreezes).
create function public.open_stocktake(p_slug text, p_location_id uuid, p_on date, p_memo text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_st_id uuid;
  r record;
  v_book numeric;
  v_tot_qty numeric;
  v_tot_val numeric;
  v_avg numeric;
begin
  if p_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.inventory_locations where id = p_location_id and org_id = v_org and archived_at is null) then
    raise exception 'unknown_location' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_stocktakes where org_id = v_org and location_id = p_location_id and status = 'open') then
    raise exception 'already_open' using errcode = '22023';
  end if;

  insert into public.inventory_stocktakes (org_id, location_id, opened_on, status, memo, created_by)
  values (v_org, p_location_id, p_on, 'open', left(nullif(btrim(coalesce(p_memo, '')), ''), 300), auth.uid())
  returning id into v_st_id;

  for r in select id from public.inventory_items where org_id = v_org order by name loop
    select coalesce(sum(quantity_delta), 0) into v_book
    from public.inventory_movements where org_id = v_org and item_id = r.id and location_id = p_location_id;

    select coalesce(sum(quantity_delta), 0), coalesce(sum(value_delta), 0) into v_tot_qty, v_tot_val
    from public.inventory_movements where org_id = v_org and item_id = r.id;
    v_avg := case when v_tot_qty > 0 then round(v_tot_val / v_tot_qty, 4) else 0 end;

    insert into public.inventory_stocktake_lines (stocktake_id, org_id, item_id, book_quantity, unit_cost)
    values (v_st_id, v_org, r.id, v_book, v_avg);
  end loop;

  return v_st_id;
end;
$$;

create function public.save_stocktake_counts(p_slug text, p_id uuid, p_counts jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  st public.inventory_stocktakes;
  v_row jsonb;
  v_line_id uuid;
  v_cnt numeric;
begin
  select * into st from public.inventory_stocktakes where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if st.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;

  for v_row in select * from jsonb_array_elements(coalesce(p_counts, '[]'::jsonb)) loop
    v_line_id := nullif(v_row->>'lineId', '')::uuid;
    v_cnt := nullif(btrim(coalesce(v_row->>'counted', '')), '')::numeric;
    if v_cnt is not null and v_cnt < 0 then raise exception 'invalid_qty' using errcode = '22023'; end if;
    update public.inventory_stocktake_lines
    set counted_quantity = v_cnt
    where id = v_line_id and stocktake_id = st.id;
  end loop;
end;
$$;

create function public.confirm_stocktake(p_slug text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  st public.inventory_stocktakes;
  l public.inventory_stocktake_lines;
  v_var numeric;
  v_val numeric;
  v_net_val numeric := 0;
  v_adj_count int := 0;
  v_stock_acct uuid;
  v_adj_acct uuid;
  v_je_id uuid := null;
begin
  select * into st from public.inventory_stocktakes where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if st.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;

  select stock_acct, adj_acct into v_stock_acct, v_adj_acct from public.inventory_account_ids(v_org);

  for l in select * from public.inventory_stocktake_lines where stocktake_id = st.id loop
    continue when l.counted_quantity is null;
    v_var := l.counted_quantity - l.book_quantity;
    continue when v_var = 0;
    v_val := round(v_var * l.unit_cost, 2);
    insert into public.inventory_movements (
      org_id, item_id, location_id, occurred_on, kind, quantity_delta, value_delta, unit_cost, reference_id, memo, created_by
    ) values (
      v_org, l.item_id, st.location_id, st.opened_on, 'stocktake_adjustment', v_var, v_val, l.unit_cost, st.id,
      coalesce(st.memo, 'Stocktake variance'), auth.uid()
    );
    v_net_val := v_net_val + v_val;
    v_adj_count := v_adj_count + 1;
  end loop;

  if v_net_val <> 0 then
    if v_net_val > 0 then
      v_je_id := public.insert_journal(
        v_org, null, st.opened_on,
        'Stocktake surplus' || coalesce(' · ' || st.memo, ''),
        'inventory', st.id, null, null,
        jsonb_build_array(
          jsonb_build_object('accountId', v_stock_acct, 'debit', v_net_val, 'credit', 0, 'description', 'Stocktake surplus'),
          jsonb_build_object('accountId', v_adj_acct, 'debit', 0, 'credit', v_net_val, 'description', 'Stocktake adjustment')
        )
      );
    else
      v_je_id := public.insert_journal(
        v_org, null, st.opened_on,
        'Stocktake shortage' || coalesce(' · ' || st.memo, ''),
        'inventory', st.id, null, null,
        jsonb_build_array(
          jsonb_build_object('accountId', v_adj_acct, 'debit', -v_net_val, 'credit', 0, 'description', 'Stocktake shortage'),
          jsonb_build_object('accountId', v_stock_acct, 'debit', 0, 'credit', -v_net_val, 'description', 'Stocktake adjustment')
        )
      );
    end if;
    update public.inventory_movements set journal_entry_id = v_je_id where reference_id = st.id;
  end if;

  update public.inventory_stocktakes
  set status = 'confirmed', confirmed_on = (now() at time zone 'Asia/Kuala_Lumpur')::date, journal_entry_id = v_je_id
  where id = st.id;

  return jsonb_build_object('adjustments', v_adj_count, 'netValue', v_net_val, 'journalEntryId', v_je_id);
end;
$$;

create function public.cancel_stocktake(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  st public.inventory_stocktakes;
begin
  select * into st from public.inventory_stocktakes where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if st.status <> 'open' then raise exception 'not_open' using errcode = '22023'; end if;
  update public.inventory_stocktakes set status = 'cancelled' where id = st.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Stock write-downs (lowers carrying value; quantity stays unchanged; posts Dr 700-0400, Cr 300-0100).
create function public.record_stock_writedown(p_slug text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_item_id uuid := nullif(p->>'itemId', '')::uuid;
  v_date date := nullif(p->>'occurredOn', '')::date;
  v_amount numeric := round(nullif(p->>'amount', '')::numeric, 2);
  v_reason text := btrim(coalesce(p->>'reason', ''));
  it public.inventory_items;
  v_carrying numeric;
  v_loc_id uuid;
  v_stock_acct uuid;
  v_adj_acct uuid;
  v_je_id uuid;
  v_wd_id uuid;
begin
  if v_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  if char_length(v_reason) < 2 then raise exception 'reason_required' using errcode = '22023'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;

  select * into it from public.inventory_items where id = v_item_id and org_id = v_org;
  if not found then raise exception 'unknown_item' using errcode = '22023'; end if;

  select coalesce(sum(value_delta), 0) into v_carrying from public.inventory_movements where org_id = v_org and item_id = it.id;
  if v_amount > v_carrying then raise exception 'exceeds_carrying' using errcode = '22023'; end if;

  select location_id into v_loc_id from public.inventory_movements
  where org_id = v_org and item_id = it.id
  group by location_id order by sum(quantity_delta) desc limit 1;
  if v_loc_id is null then
    select id into v_loc_id from public.inventory_locations where org_id = v_org and archived_at is null order by is_default desc, created_at asc limit 1;
  end if;

  select stock_acct, adj_acct into v_stock_acct, v_adj_acct from public.inventory_account_ids(v_org);

  v_je_id := public.insert_journal(
    v_org, null, v_date,
    left('Stock write-down · ' || it.name || ' (' || v_reason || ')', 250),
    'inventory', it.id, null, null,
    jsonb_build_array(
      jsonb_build_object('accountId', v_adj_acct, 'debit', v_amount, 'credit', 0, 'description', it.name || ' · ' || v_reason),
      jsonb_build_object('accountId', v_stock_acct, 'debit', 0, 'credit', v_amount, 'description', it.name || ' · ' || v_reason)
    )
  );

  insert into public.inventory_writedowns (org_id, item_id, occurred_on, amount, value_before, value_after, reason, journal_entry_id, created_by)
  values (v_org, it.id, v_date, v_amount, v_carrying, v_carrying - v_amount, left(v_reason, 300), v_je_id, auth.uid())
  returning id into v_wd_id;

  insert into public.inventory_movements (org_id, item_id, location_id, occurred_on, kind, quantity_delta, value_delta, unit_cost, reference_id, memo, journal_entry_id, created_by)
  values (v_org, it.id, v_loc_id, v_date, 'writedown', 0, -v_amount, 0, v_wd_id, left(v_reason, 300), v_je_id, auth.uid());

  return v_wd_id;
end;
$$;

revoke all on function public.enable_inventory(text) from public, anon;
grant execute on function public.enable_inventory(text) to authenticated;
revoke all on function public.create_inventory_location(text, text) from public, anon;
grant execute on function public.create_inventory_location(text, text) to authenticated;
revoke all on function public.set_default_inventory_location(text, uuid) from public, anon;
grant execute on function public.set_default_inventory_location(text, uuid) to authenticated;
revoke all on function public.archive_inventory_location(text, uuid) from public, anon;
grant execute on function public.archive_inventory_location(text, uuid) to authenticated;
revoke all on function public.create_inventory_item(text, jsonb) from public, anon;
grant execute on function public.create_inventory_item(text, jsonb) to authenticated;
revoke all on function public.update_inventory_item(text, uuid, jsonb) from public, anon;
grant execute on function public.update_inventory_item(text, uuid, jsonb) to authenticated;
revoke all on function public.import_opening_stock(text, jsonb) from public, anon;
grant execute on function public.import_opening_stock(text, jsonb) to authenticated;
revoke all on function public.record_stock_transfer(text, jsonb) from public, anon;
grant execute on function public.record_stock_transfer(text, jsonb) to authenticated;
revoke all on function public.open_stocktake(text, uuid, date, text) from public, anon;
grant execute on function public.open_stocktake(text, uuid, date, text) to authenticated;
revoke all on function public.save_stocktake_counts(text, uuid, jsonb) from public, anon;
grant execute on function public.save_stocktake_counts(text, uuid, jsonb) to authenticated;
revoke all on function public.confirm_stocktake(text, uuid) from public, anon;
grant execute on function public.confirm_stocktake(text, uuid) to authenticated;
revoke all on function public.cancel_stocktake(text, uuid) from public, anon;
grant execute on function public.cancel_stocktake(text, uuid) to authenticated;
revoke all on function public.record_stock_writedown(text, jsonb) from public, anon;
grant execute on function public.record_stock_writedown(text, jsonb) to authenticated;
