-- Kira slice 28: Migrate (/{slug}/migrate) — opening balances from CSV / Excel, Xero, Sage UBS, or manual entry.
-- Reverse engineered from lejar.ai's "migrating-to-lejar" help article & pageTitle.migrate.* keys (2026-11-23).

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in (
    'manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal',
    'note', 'sst', 'credit', 'official_receipt', 'payment_voucher', 'transfer',
    'depreciation', 'disposal', 'amortisation', 'opening_balance'
  ));

create table public.opening_migrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  source_system text not null check (source_system in ('csv', 'xero', 'ubs', 'manual')),
  cutover_date date not null,
  folded_pnl boolean not null default true,
  line_count integer not null check (line_count >= 2),
  total_amount numeric(14, 2) not null check (total_amount > 0),
  status text not null default 'committed' check (status in ('committed', 'reversed')),
  journal_entry_id uuid not null references public.journal_entries (id),
  reversal_entry_id uuid references public.journal_entries (id),
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index opening_migrations_org_idx on public.opening_migrations (org_id, created_at desc);

alter table public.opening_migrations enable row level security;
create policy opening_migrations_read on public.opening_migrations
  for select to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------------------------
-- Commit opening balances as one balanced journal entry (Owner / Admin only).
create function public.commit_opening_balances(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_source text := coalesce(nullif(p->>'sourceSystem', ''), 'csv');
  v_date date := nullif(p->>'cutoverDate', '')::date;
  v_fold boolean := coalesce((p->>'foldPnl')::boolean, true);
  v_notes text := nullif(btrim(coalesce(p->>'notes', '')), '');
  v_lines jsonb := coalesce(p->'lines', '[]'::jsonb);
  v_line jsonb;
  v_acct public.accounts;
  v_dr numeric;
  v_cr numeric;
  v_desc text;
  v_pnl_net numeric := 0;
  v_re_acct uuid;
  v_out jsonb := '[]'::jsonb;
  v_tot_dr numeric := 0;
  v_tot_cr numeric := 0;
  v_count int := 0;
  v_mig_id uuid := gen_random_uuid();
  v_je_id uuid;
  v_actor_email text;
  v_source_label text;
begin
  if v_source not in ('csv', 'xero', 'ubs', 'manual') then v_source := 'csv'; end if;
  if v_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'no_lines' using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_dr := round(coalesce(nullif(v_line->>'debit', '')::numeric, 0), 2);
    v_cr := round(coalesce(nullif(v_line->>'credit', '')::numeric, 0), 2);
    if v_dr < 0 or v_cr < 0 then raise exception 'negative_amount' using errcode = '22023'; end if;
    if v_dr > 0 and v_cr > 0 then raise exception 'both_sides' using errcode = '22023'; end if;
    continue when v_dr = 0 and v_cr = 0;

    select * into v_acct from public.accounts
    where id = nullif(v_line->>'accountId', '')::uuid and org_id = v_org and status = 'active';
    if not found then raise exception 'unknown_account' using errcode = '22023'; end if;

    v_desc := nullif(btrim(coalesce(v_line->>'description', '')), '');

    if v_fold and v_acct.type in ('revenue', 'expense') then
      v_pnl_net := v_pnl_net + v_dr - v_cr;
    else
      v_out := v_out || jsonb_build_object(
        'accountId', v_acct.id,
        'debit', v_dr,
        'credit', v_cr,
        'description', coalesce(v_desc, 'Opening balance · ' || v_acct.code)
      );
      v_tot_dr := v_tot_dr + v_dr;
      v_tot_cr := v_tot_cr + v_cr;
      v_count := v_count + 1;
    end if;
  end loop;

  if v_fold and v_pnl_net <> 0 then
    select id into v_re_acct from public.accounts
    where org_id = v_org and status = 'active' and (section = 'retained_earnings' or type = 'equity')
    order by case when section = 'retained_earnings' then 0 else 1 end, code
    limit 1;
    if v_re_acct is null then raise exception 'no_retained_earnings' using errcode = '22023'; end if;

    if v_pnl_net > 0 then
      v_out := v_out || jsonb_build_object(
        'accountId', v_re_acct, 'debit', v_pnl_net, 'credit', 0,
        'description', 'Prior YTD income & expenses folded into retained earnings'
      );
      v_tot_dr := v_tot_dr + v_pnl_net;
    else
      v_out := v_out || jsonb_build_object(
        'accountId', v_re_acct, 'debit', 0, 'credit', -v_pnl_net,
        'description', 'Prior YTD income & expenses folded into retained earnings'
      );
      v_tot_cr := v_tot_cr + (-v_pnl_net);
    end if;
    v_count := v_count + 1;
  end if;

  if v_count < 2 or v_tot_dr <= 0 then raise exception 'no_lines' using errcode = '22023'; end if;
  if v_tot_dr <> v_tot_cr then raise exception 'unbalanced' using errcode = '22023'; end if;

  v_source_label := case v_source
    when 'xero' then 'Xero'
    when 'ubs' then 'Sage UBS'
    when 'manual' then 'Manual entry'
    else 'CSV / Excel'
  end;

  v_je_id := public.insert_journal(
    v_org, null, v_date,
    left('Opening balances (' || v_source_label || ')' || coalesce(' · ' || v_notes, ''), 250),
    'opening_balance', v_mig_id, null, null, v_out
  );

  insert into public.opening_migrations (
    id, org_id, source_system, cutover_date, folded_pnl, line_count, total_amount,
    status, journal_entry_id, notes, created_by
  ) values (
    v_mig_id, v_org, v_source, v_date, v_fold, v_count, v_tot_dr,
    'committed', v_je_id, left(v_notes, 500), auth.uid()
  );

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'migration.committed',
    'Imported opening balances (' || v_source_label || ', ' || v_count || ' lines, RM' || to_char(v_tot_dr, 'FM999,999,990.00') || ')',
    jsonb_build_object('migration_id', v_mig_id, 'source', v_source, 'cutover_date', v_date, 'lines', v_count)
  );

  return jsonb_build_object(
    'id', v_mig_id,
    'journalEntryId', v_je_id,
    'lineCount', v_count,
    'totalAmount', v_tot_dr
  );
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reverse a committed opening balance migration (Owner / Admin only).
create function public.reverse_opening_migration(p_slug text, p_id uuid, p_on date default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  m public.opening_migrations;
  v_rev_date date;
  v_lines jsonb;
  v_rev_id uuid;
  v_actor_email text;
begin
  select * into m from public.opening_migrations where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if m.status <> 'committed' then raise exception 'already_reversed' using errcode = '22023'; end if;

  v_rev_date := greatest(coalesce(p_on, m.cutover_date), m.cutover_date);

  select jsonb_agg(
    jsonb_build_object(
      'accountId', jl.account_id,
      'debit', jl.credit,
      'credit', jl.debit,
      'description', coalesce('Reversal · ' || jl.description, 'Reversal of opening balance')
    ) order by jl.line_no
  ) into v_lines
  from public.journal_lines jl
  where jl.entry_id = m.journal_entry_id;

  v_rev_id := public.insert_journal(
    v_org, null, v_rev_date,
    'Reversal of opening balances (' || m.cutover_date || ')',
    'reversal', m.journal_entry_id, null, null, v_lines
  );

  update public.journal_entries set reversal_of = m.journal_entry_id where id = v_rev_id;
  update public.journal_entries set reversed_by = v_rev_id where id = m.journal_entry_id;
  update public.opening_migrations set status = 'reversed', reversal_entry_id = v_rev_id where id = m.id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'migration.reversed',
    'Reversed opening balances (' || m.cutover_date || ')',
    jsonb_build_object('migration_id', m.id, 'reversal_entry_id', v_rev_id)
  );

  return v_rev_id;
end;
$$;

revoke all on function public.commit_opening_balances(text, jsonb) from public, anon;
grant execute on function public.commit_opening_balances(text, jsonb) to authenticated;
revoke all on function public.reverse_opening_migration(text, uuid, date) from public, anon;
grant execute on function public.reverse_opening_migration(text, uuid, date) to authenticated;
