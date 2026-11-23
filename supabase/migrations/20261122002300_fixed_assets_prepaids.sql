-- Slice 25: Fixed assets & depreciation (/{slug}/fixed-assets) and Prepaid amortisation (/{slug}/prepaid-amortisations),
-- modelled on lejar.ai (help articles fixed-assets + prepaid-amortisations, docs/re/25-fixed-assets-prepaids.md).

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in (
    'manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal',
    'sst', 'note', 'credit', 'official_receipt', 'payment_voucher', 'transfer',
    'depreciation', 'disposal', 'amortisation'
  ));

-- ---------------------------------------------------------------------------------------------
-- Helper: last day of the month containing p_d.
create function public.month_end(p_d date) returns date
language sql immutable as $$
  select (date_trunc('month', p_d) + interval '1 month - 1 day')::date;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fixed assets & monthly straight-line depreciation.
create table public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  asset_code text not null check (char_length(asset_code) between 1 and 40),
  name text not null check (char_length(name) between 2 and 150),
  asset_account_id uuid not null references public.accounts (id),
  accum_dep_account_id uuid not null references public.accounts (id),
  dep_expense_account_id uuid not null references public.accounts (id),
  purchase_date date not null,
  depreciation_start date not null,
  cost numeric(14, 2) not null check (cost > 0),
  residual_value numeric(14, 2) not null default 0 check (residual_value >= 0 and residual_value < cost),
  useful_life_months integer not null check (useful_life_months between 1 and 600),
  method text not null default 'straight_line' check (method = 'straight_line'),
  accumulated_depreciation numeric(14, 2) not null default 0 check (accumulated_depreciation >= 0),
  status text not null default 'active' check (status in ('active', 'fully_depreciated', 'disposed')),
  disposed_on date,
  disposal_proceeds numeric(14, 2),
  disposal_entry_id uuid references public.journal_entries (id),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, asset_code)
);
create index fixed_assets_org_idx on public.fixed_assets (org_id, purchase_date desc, created_at desc);

create table public.depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  asset_id uuid not null references public.fixed_assets (id) on delete cascade,
  period_month date not null,
  posted_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  journal_entry_id uuid not null references public.journal_entries (id),
  created_at timestamptz not null default now(),
  unique (asset_id, period_month)
);
create index depreciation_runs_asset_idx on public.depreciation_runs (asset_id, period_month);

-- ---------------------------------------------------------------------------------------------
-- Prepaid amortisation schedules & period lines.
create table public.prepaid_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 150),
  prepaid_account_id uuid not null references public.accounts (id),
  expense_account_id uuid not null references public.accounts (id),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  periods_count integer not null check (periods_count between 2 and 120),
  start_date date not null,
  auto_post boolean not null default false,
  amortised_amount numeric(14, 2) not null default 0 check (amortised_amount >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index prepaid_schedules_org_idx on public.prepaid_schedules (org_id, created_at desc);

create table public.prepaid_schedule_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  schedule_id uuid not null references public.prepaid_schedules (id) on delete cascade,
  period_no integer not null check (period_no >= 1),
  scheduled_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'posted', 'cancelled')),
  journal_entry_id uuid references public.journal_entries (id),
  posted_at timestamptz,
  unique (schedule_id, period_no)
);
create index prepaid_schedule_lines_sched_idx on public.prepaid_schedule_lines (schedule_id, period_no);

do $$
declare t text;
begin
  foreach t in array array['fixed_assets', 'depreciation_runs', 'prepaid_schedules', 'prepaid_schedule_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Fixed asset RPCs.
create function public.next_asset_code(p_org uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_max int;
begin
  select max(substring(asset_code from 4)::int) into v_max
  from public.fixed_assets where org_id = p_org and asset_code ~ '^FA-[0-9]+$';
  return 'FA-' || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;
revoke all on function public.next_asset_code(uuid) from public, anon, authenticated;

create function public.create_fixed_asset(p_slug text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_code text := nullif(btrim(coalesce(p->>'assetCode', '')), '');
  v_name text := btrim(coalesce(p->>'name', ''));
  v_asset_acct uuid := nullif(p->>'assetAccountId', '')::uuid;
  v_accum_acct uuid := nullif(p->>'accumDepAccountId', '')::uuid;
  v_exp_acct uuid := nullif(p->>'depExpenseAccountId', '')::uuid;
  v_purchase date := nullif(p->>'purchaseDate', '')::date;
  v_start date := coalesce(nullif(p->>'depreciationStart', '')::date, v_purchase);
  v_cost numeric := round(nullif(p->>'cost', '')::numeric, 2);
  v_res numeric := coalesce(round(nullif(p->>'residualValue', '')::numeric, 2), 0);
  v_life int := nullif(p->>'usefulLifeMonths', '')::int;
  v_notes text := nullif(btrim(coalesce(p->>'notes', '')), '');
  v_id uuid;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 150 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if v_purchase is null then raise exception 'purchase_date_required' using errcode = '22023'; end if;
  if v_cost is null or v_cost <= 0 then raise exception 'invalid_cost' using errcode = '22023'; end if;
  if v_res < 0 or v_res >= v_cost then raise exception 'invalid_residual' using errcode = '22023'; end if;
  if v_life is null or v_life < 1 or v_life > 600 then raise exception 'invalid_life' using errcode = '22023'; end if;

  if not exists (select 1 from public.accounts where id = v_asset_acct and org_id = v_org and status = 'active' and type = 'asset') then
    raise exception 'invalid_asset_account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = v_accum_acct and org_id = v_org and status = 'active' and type in ('asset', 'contra_asset')) then
    raise exception 'invalid_accum_account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = v_exp_acct and org_id = v_org and status = 'active' and type = 'expense') then
    raise exception 'invalid_expense_account' using errcode = '22023';
  end if;

  if v_code is null then v_code := public.next_asset_code(v_org); end if;

  insert into public.fixed_assets (
    org_id, asset_code, name, asset_account_id, accum_dep_account_id, dep_expense_account_id,
    purchase_date, depreciation_start, cost, residual_value, useful_life_months, notes, created_by
  )
  values (
    v_org, left(v_code, 40), v_name, v_asset_acct, v_accum_acct, v_exp_acct,
    v_purchase, v_start, v_cost, v_res, v_life, left(v_notes, 500), auth.uid()
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'duplicate_asset_code' using errcode = '23505';
end;
$$;

/** Posts monthly straight-line depreciation up to p_as_of without double-posting; retires fully depreciated assets. */
create function public.run_depreciation(p_slug text, p_as_of date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_as_of date := public.month_end(coalesce(p_as_of, (now() at time zone 'Asia/Kuala_Lumpur')::date));
  a public.fixed_assets;
  v_assets int := 0;
  v_posted int := 0;
  v_skipped int := 0;
  v_total_amt numeric := 0;
  v_depreciable numeric;
  v_monthly numeric;
  v_accum numeric;
  v_m int;
  v_p_month date;
  v_p_end date;
  v_amt numeric;
  v_je uuid;
begin
  for a in
    select * from public.fixed_assets
    where org_id = v_org and status = 'active'
    order by asset_code
    for update
  loop
    v_assets := v_assets + 1;
    v_depreciable := a.cost - a.residual_value;
    v_monthly := round(v_depreciable / a.useful_life_months, 2);
    v_accum := a.accumulated_depreciation;

    for v_m in 0..(a.useful_life_months - 1) loop
      exit when v_accum >= v_depreciable;
      v_p_month := (date_trunc('month', a.depreciation_start) + make_interval(months => v_m))::date;
      v_p_end := public.month_end(v_p_month);
      exit when v_p_end > v_as_of;

      if exists (select 1 from public.depreciation_runs where asset_id = a.id and period_month = v_p_month) then
        continue;
      end if;

      -- Final month absorbs any rounding so cumulative depreciation matches depreciable base exactly.
      if v_m = a.useful_life_months - 1 or (v_depreciable - v_accum) <= v_monthly then
        v_amt := v_depreciable - v_accum;
      else
        v_amt := v_monthly;
      end if;
      exit when v_amt <= 0;

      begin
        v_je := public.insert_journal(
          v_org, null, v_p_end,
          left('Depreciation · ' || a.asset_code || ' ' || a.name || ' (' || to_char(v_p_month, 'YYYY-MM') || ')', 250),
          'depreciation', a.id, null, null,
          jsonb_build_array(
            jsonb_build_object('accountId', a.dep_expense_account_id, 'debit', v_amt, 'description', a.asset_code || ' ' || a.name),
            jsonb_build_object('accountId', a.accum_dep_account_id, 'credit', v_amt, 'description', a.asset_code || ' ' || a.name)
          )
        );
        insert into public.depreciation_runs (org_id, asset_id, period_month, posted_on, amount, journal_entry_id)
        values (v_org, a.id, v_p_month, v_p_end, v_amt, v_je);

        v_accum := v_accum + v_amt;
        v_posted := v_posted + 1;
        v_total_amt := v_total_amt + v_amt;
      exception
        when others then
          v_skipped := v_skipped + 1;
      end;
    end loop;

    update public.fixed_assets
    set accumulated_depreciation = v_accum,
        status = case when v_accum >= v_depreciable then 'fully_depreciated' else 'active' end
    where id = a.id;
  end loop;

  return jsonb_build_object('assets', v_assets, 'posted', v_posted, 'skipped', v_skipped, 'amount', v_total_amt);
end;
$$;

/** Disposes an active or fully depreciated asset, clearing cost and accumulated depreciation and recognising gain/loss. */
create function public.dispose_fixed_asset(
  p_slug text, p_id uuid, p_on date, p_proceeds numeric, p_cash_account_id uuid, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  a public.fixed_assets;
  v_proc numeric := coalesce(round(p_proceeds, 2), 0);
  v_nbv numeric;
  v_gain numeric;
  v_gain_acct uuid;
  v_lines jsonb := '[]';
  v_je uuid;
begin
  if p_on is null then raise exception 'disposal_date_required' using errcode = '22023'; end if;
  if v_proc < 0 then raise exception 'invalid_proceeds' using errcode = '22023'; end if;
  select * into a from public.fixed_assets where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if a.status = 'disposed' then raise exception 'already_disposed' using errcode = '22023'; end if;
  if p_on < a.purchase_date then raise exception 'before_purchase' using errcode = '22023'; end if;

  if v_proc > 0 then
    if not exists (select 1 from public.accounts where id = p_cash_account_id and org_id = v_org and is_cash and status = 'active') then
      raise exception 'choose_cash' using errcode = '22023';
    end if;
    v_lines := v_lines || jsonb_build_object('accountId', p_cash_account_id, 'debit', v_proc, 'description', 'Disposal proceeds · ' || a.asset_code);
  end if;

  if a.accumulated_depreciation > 0 then
    v_lines := v_lines || jsonb_build_object('accountId', a.accum_dep_account_id, 'debit', a.accumulated_depreciation, 'description', 'Clear accum. dep · ' || a.asset_code);
  end if;

  v_lines := v_lines || jsonb_build_object('accountId', a.asset_account_id, 'credit', a.cost, 'description', 'Dispose asset · ' || a.asset_code);

  v_nbv := a.cost - a.accumulated_depreciation;
  v_gain := v_proc - v_nbv;
  if v_gain <> 0 then
    select id into v_gain_acct from public.accounts
    where org_id = v_org and status = 'active' and (code = '900-0400' or lower(name) like '%disposal%')
    order by case when code = '900-0400' then 0 else 1 end, code limit 1;
    if v_gain_acct is null then raise exception 'no_disposal_account' using errcode = '22023'; end if;
    if v_gain > 0 then
      v_lines := v_lines || jsonb_build_object('accountId', v_gain_acct, 'credit', v_gain, 'description', 'Gain on disposal · ' || a.asset_code);
    else
      v_lines := v_lines || jsonb_build_object('accountId', v_gain_acct, 'debit', -v_gain, 'description', 'Loss on disposal · ' || a.asset_code);
    end if;
  end if;

  v_je := public.insert_journal(
    v_org, null, p_on,
    left('Dispose fixed asset ' || a.asset_code || ' ' || a.name || coalesce(': ' || nullif(btrim(coalesce(p_notes, '')), ''), ''), 250),
    'disposal', a.id, null, null, v_lines
  );
  update public.fixed_assets
  set status = 'disposed', disposed_on = p_on, disposal_proceeds = v_proc, disposal_entry_id = v_je
  where id = a.id;
  return v_je;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Prepaid amortisation RPCs.
create function public.create_prepaid_schedule(p_slug text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_name text := btrim(coalesce(p->>'name', ''));
  v_prepaid_acct uuid := nullif(p->>'prepaidAccountId', '')::uuid;
  v_exp_acct uuid := nullif(p->>'expenseAccountId', '')::uuid;
  v_total numeric := round(nullif(p->>'totalAmount', '')::numeric, 2);
  v_periods int := nullif(p->>'periodsCount', '')::int;
  v_start date := nullif(p->>'startDate', '')::date;
  v_auto boolean := coalesce((p->>'autoPost')::boolean, false);
  v_notes text := nullif(btrim(coalesce(p->>'notes', '')), '');
  v_id uuid;
  v_base numeric;
  v_running numeric := 0;
  v_i int;
  v_amt numeric;
  v_sched_date date;
begin
  if char_length(v_name) < 2 or char_length(v_name) > 150 then raise exception 'invalid_name' using errcode = '22023'; end if;
  if v_total is null or v_total <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if v_periods is null or v_periods < 2 or v_periods > 120 then raise exception 'invalid_periods' using errcode = '22023'; end if;
  if v_start is null then raise exception 'start_date_required' using errcode = '22023'; end if;
  if not exists (select 1 from public.accounts where id = v_prepaid_acct and org_id = v_org and status = 'active' and type = 'asset') then
    raise exception 'invalid_prepaid_account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.accounts where id = v_exp_acct and org_id = v_org and status = 'active' and type = 'expense') then
    raise exception 'invalid_expense_account' using errcode = '22023';
  end if;

  insert into public.prepaid_schedules (
    org_id, name, prepaid_account_id, expense_account_id, total_amount, periods_count, start_date, auto_post, notes, created_by
  )
  values (
    v_org, v_name, v_prepaid_acct, v_exp_acct, v_total, v_periods, v_start, v_auto, left(v_notes, 500), auth.uid()
  )
  returning id into v_id;

  v_base := round(v_total / v_periods, 2);
  for v_i in 1..v_periods loop
    v_sched_date := public.month_end((date_trunc('month', v_start) + make_interval(months => v_i - 1))::date);
    if v_i = v_periods then
      v_amt := v_total - v_running;
    else
      v_amt := v_base;
      v_running := v_running + v_base;
    end if;
    insert into public.prepaid_schedule_lines (org_id, schedule_id, period_no, scheduled_on, amount)
    values (v_org, v_id, v_i, v_sched_date, v_amt);
  end loop;

  return v_id;
end;
$$;

create function public.post_prepaid_line_internal(p_org uuid, p_line_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l public.prepaid_schedule_lines;
  s public.prepaid_schedules;
  v_je uuid;
  v_posted_sum numeric;
  v_pending_left int;
begin
  select * into l from public.prepaid_schedule_lines where id = p_line_id and org_id = p_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if l.status <> 'pending' then raise exception 'already_posted' using errcode = '22023'; end if;
  select * into s from public.prepaid_schedules where id = l.schedule_id for update;
  if s.status <> 'active' then raise exception 'schedule_not_active' using errcode = '22023'; end if;

  v_je := public.insert_journal(
    p_org, null, l.scheduled_on,
    left('Prepaid amortisation · ' || s.name || ' (' || l.period_no || '/' || s.periods_count || ')', 250),
    'amortisation', s.id, null, null,
    jsonb_build_array(
      jsonb_build_object('accountId', s.expense_account_id, 'debit', l.amount, 'description', s.name),
      jsonb_build_object('accountId', s.prepaid_account_id, 'credit', l.amount, 'description', s.name)
    )
  );
  update public.prepaid_schedule_lines set status = 'posted', journal_entry_id = v_je, posted_at = now() where id = l.id;

  select coalesce(sum(amount), 0), count(*) filter (where status = 'pending')
  into v_posted_sum, v_pending_left
  from public.prepaid_schedule_lines where schedule_id = s.id and status in ('posted', 'pending');

  select coalesce(sum(amount), 0) into v_posted_sum from public.prepaid_schedule_lines where schedule_id = s.id and status = 'posted';
  update public.prepaid_schedules
  set amortised_amount = v_posted_sum,
      status = case when v_pending_left = 0 then 'completed' else 'active' end
  where id = s.id;
  return v_je;
end;
$$;
revoke all on function public.post_prepaid_line_internal(uuid, uuid) from public, anon, authenticated;

create function public.post_prepaid_line(p_slug text, p_line_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return public.post_prepaid_line_internal(public.learn_org_for_editor(p_slug), p_line_id);
end;
$$;

create function public.post_due_prepaids(p_slug text, p_as_of date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_as_of date := public.month_end(coalesce(p_as_of, (now() at time zone 'Asia/Kuala_Lumpur')::date));
  r record;
  v_posted int := 0;
  v_skipped int := 0;
  v_amount numeric := 0;
begin
  for r in
    select l.id, l.amount
    from public.prepaid_schedule_lines l
    join public.prepaid_schedules s on s.id = l.schedule_id
    where l.org_id = v_org and s.status = 'active' and s.auto_post = true
      and l.status = 'pending' and l.scheduled_on <= v_as_of
    order by l.scheduled_on, l.period_no
  loop
    begin
      perform public.post_prepaid_line_internal(v_org, r.id);
      v_posted := v_posted + 1;
      v_amount := v_amount + r.amount;
    exception
      when others then
        v_skipped := v_skipped + 1;
    end;
  end loop;
  return jsonb_build_object('posted', v_posted, 'skipped', v_skipped, 'amount', v_amount);
end;
$$;

create function public.cancel_prepaid_schedule(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  s public.prepaid_schedules;
begin
  select * into s from public.prepaid_schedules where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if s.status <> 'active' then raise exception 'schedule_not_active' using errcode = '22023'; end if;
  update public.prepaid_schedule_lines set status = 'cancelled' where schedule_id = s.id and status = 'pending';
  update public.prepaid_schedules set status = 'cancelled' where id = s.id;
end;
$$;

revoke all on function public.create_fixed_asset(text, jsonb) from public, anon;
revoke all on function public.run_depreciation(text, date) from public, anon;
revoke all on function public.dispose_fixed_asset(text, uuid, date, numeric, uuid, text) from public, anon;
revoke all on function public.create_prepaid_schedule(text, jsonb) from public, anon;
revoke all on function public.post_prepaid_line(text, uuid) from public, anon;
revoke all on function public.post_due_prepaids(text, date) from public, anon;
revoke all on function public.cancel_prepaid_schedule(text, uuid) from public, anon;

grant execute on function public.create_fixed_asset(text, jsonb) to authenticated;
grant execute on function public.run_depreciation(text, date) to authenticated;
grant execute on function public.dispose_fixed_asset(text, uuid, date, numeric, uuid, text) to authenticated;
grant execute on function public.create_prepaid_schedule(text, jsonb) to authenticated;
grant execute on function public.post_prepaid_line(text, uuid) to authenticated;
grant execute on function public.post_due_prepaids(text, date) to authenticated;
grant execute on function public.cancel_prepaid_schedule(text, uuid) to authenticated;
