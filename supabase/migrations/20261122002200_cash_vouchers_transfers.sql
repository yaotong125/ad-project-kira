-- Slice 24: Official receipts (/{slug}/official-receipts), Payment vouchers (/{slug}/expenses),
-- and Bank transfers (/{slug}/banking/transfers), modelled on lejar.ai (docs/re/24-cash-vouchers-transfers.md).

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in (
    'manual', 'bill', 'invoice', 'void', 'bank', 'receipt', 'payment', 'reversal',
    'sst', 'note', 'credit', 'official_receipt', 'payment_voucher', 'transfer'
  ));

-- ---------------------------------------------------------------------------------------------
-- Cash vouchers: shared table for Official receipts (kind = 'official_receipt') and Payment vouchers (kind = 'payment_voucher').
create table public.cash_vouchers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('official_receipt', 'payment_voucher')),
  voucher_number text not null check (char_length(voucher_number) between 1 and 50),
  voucher_date date not null,
  party_name text check (party_name is null or char_length(party_name) <= 200),
  cash_account_id uuid not null references public.accounts (id),
  notes text check (notes is null or char_length(notes) <= 500),
  total numeric(14, 2) not null check (total > 0),
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_on date,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  replaces_id uuid references public.cash_vouchers (id) on delete set null,
  replaced_by_id uuid references public.cash_vouchers (id) on delete set null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, kind, voucher_number)
);
create index cash_vouchers_org_kind_idx on public.cash_vouchers (org_id, kind, voucher_date desc, created_at desc);

create table public.cash_voucher_lines (
  voucher_id uuid not null references public.cash_vouchers (id) on delete cascade,
  line_no integer not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  description text check (description is null or char_length(description) <= 300),
  amount numeric(14, 2) not null check (amount > 0),
  primary key (voucher_id, line_no)
);

-- ---------------------------------------------------------------------------------------------
-- Bank transfers between two active bank or cash accounts (with optional Bank Charges fee).
create table public.bank_transfers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  transfer_number text not null check (char_length(transfer_number) between 1 and 50),
  transfer_date date not null,
  from_account_id uuid not null references public.accounts (id),
  to_account_id uuid not null references public.accounts (id),
  amount numeric(14, 2) not null check (amount > 0),
  fee numeric(14, 2) not null default 0 check (fee >= 0),
  fee_account_id uuid references public.accounts (id),
  reference text check (reference is null or char_length(reference) <= 200),
  status text not null default 'recorded' check (status in ('recorded', 'void')),
  journal_entry_id uuid references public.journal_entries (id),
  void_entry_id uuid references public.journal_entries (id),
  voided_on date,
  void_reason text check (void_reason is null or char_length(void_reason) <= 500),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, transfer_number),
  check (from_account_id <> to_account_id)
);
create index bank_transfers_org_date_idx on public.bank_transfers (org_id, transfer_date desc, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['cash_vouchers', 'cash_voucher_lines', 'bank_transfers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Auto-numbering: OR-YYYYMM-NNN, PV-YYYYMM-NNN, TRF-YYYYMM-NNN.
create function public.next_cash_doc_number(p_org uuid, p_prefix text, p_on date) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_stem text := p_prefix || '-' || to_char(p_on, 'YYYYMM') || '-';
  v_max int;
begin
  if not public.is_org_member(p_org) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_prefix = 'OR' then
    select max(substring(voucher_number from char_length(v_stem) + 1)::int) into v_max
    from public.cash_vouchers where org_id = p_org and kind = 'official_receipt' and voucher_number ~ ('^' || v_stem || '[0-9]+$');
  elsif p_prefix = 'PV' then
    select max(substring(voucher_number from char_length(v_stem) + 1)::int) into v_max
    from public.cash_vouchers where org_id = p_org and kind = 'payment_voucher' and voucher_number ~ ('^' || v_stem || '[0-9]+$');
  elsif p_prefix = 'TRF' then
    select max(substring(transfer_number from char_length(v_stem) + 1)::int) into v_max
    from public.bank_transfers where org_id = p_org and transfer_number ~ ('^' || v_stem || '[0-9]+$');
  else
    raise exception 'invalid_prefix' using errcode = '22023';
  end if;
  return v_stem || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;
grant execute on function public.next_cash_doc_number(uuid, text, date) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Internal helper to void a recorded cash voucher (posts reversal on p_on >= voucher_date).
create function public.void_cash_voucher_internal(p_org uuid, p_id uuid, p_on date, p_reason text) returns date
language plpgsql security definer set search_path = public as $$
declare
  v public.cash_vouchers;
  v_rev_on date;
  v_lines jsonb;
  v_je uuid;
  v_label text;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'void_reason' using errcode = '22023'; end if;
  select * into v from public.cash_vouchers where id = p_id and org_id = p_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if v.status <> 'recorded' then raise exception 'already_void' using errcode = '22023'; end if;
  v_rev_on := greatest(coalesce(p_on, v.voucher_date), v.voucher_date);
  perform public.assert_open_period(p_org, v_rev_on);

  select jsonb_agg(jsonb_build_object(
    'accountId', account_id, 'debit', credit, 'credit', debit, 'description', description
  ) order by line_no)
  into v_lines from public.journal_lines where entry_id = v.journal_entry_id;

  v_label := case when v.kind = 'official_receipt' then 'Void official receipt ' else 'Void payment voucher ' end;
  v_je := public.insert_journal(p_org, null, v_rev_on, left(v_label || v.voucher_number || ': ' || btrim(p_reason), 250), 'void', v.id, null, null, v_lines);

  update public.cash_vouchers
  set status = 'void', void_entry_id = v_je, voided_on = v_rev_on, void_reason = left(btrim(p_reason), 500)
  where id = v.id;
  return v_rev_on;
end;
$$;
revoke all on function public.void_cash_voucher_internal(uuid, uuid, date, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Record (or edit = void original + post new) an Official receipt or Payment voucher.
create function public.record_cash_voucher(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_kind text := coalesce(p->>'kind', '');
  v_edit_id uuid := nullif(p->>'editId', '')::uuid;
  v_orig public.cash_vouchers;
  v_on date := nullif(p->>'date', '')::date;
  v_number text := nullif(btrim(coalesce(p->>'number', '')), '');
  v_party text := nullif(btrim(coalesce(p->>'partyName', '')), '');
  v_notes text := nullif(btrim(coalesce(p->>'notes', '')), '');
  v_cash_id uuid := nullif(p->>'cashAccountId', '')::uuid;
  v_cash record;
  v_line jsonb;
  v_n int := 0;
  v_acct record;
  v_amt numeric;
  v_total numeric := 0;
  v_je_lines jsonb := '[]';
  v_id uuid;
  v_je uuid;
  v_prefix text;
  v_memo text;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if v_kind not in ('official_receipt', 'payment_voucher') then raise exception 'invalid_kind' using errcode = '22023'; end if;
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_cash_id is null then raise exception 'choose_cash' using errcode = '22023'; end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'at_least_one_line' using errcode = '22023';
  end if;

  select id, code, name, is_cash, status into v_cash from public.accounts where id = v_cash_id and org_id = v_org;
  if v_cash.id is null or not v_cash.is_cash or v_cash.status <> 'active' then
    raise exception 'choose_cash' using errcode = '22023';
  end if;

  -- If editing an existing voucher: lejar.ai voids the original and posts a new entry.
  if v_edit_id is not null then
    select * into v_orig from public.cash_vouchers where id = v_edit_id and org_id = v_org for update;
    if not found then raise exception 'not_found' using errcode = '22023'; end if;
    if v_orig.kind <> v_kind then raise exception 'wrong_kind' using errcode = '22023'; end if;
    if v_orig.status <> 'recorded' then raise exception 'already_void' using errcode = '22023'; end if;
    -- Free up the number if the user kept the same voucher number by tagging the voided original?
    -- Better: keep original number untouched on audit record; auto-assign new number when editing if unchanged.
    perform public.void_cash_voucher_internal(v_org, v_orig.id, greatest(v_today, v_orig.voucher_date), 'Amended');
    if v_number is null or v_number = v_orig.voucher_number then
      v_number := null;
    end if;
  end if;

  perform public.assert_open_period(v_org, v_on);

  v_prefix := case when v_kind = 'official_receipt' then 'OR' else 'PV' end;
  if v_number is null then
    v_number := public.next_cash_doc_number(v_org, v_prefix, v_on);
  end if;

  -- Validate lines first and build journal lines
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_n := v_n + 1;
    select id, code, name, status into v_acct
    from public.accounts where org_id = v_org and code = btrim(coalesce(v_line->>'accountCode', ''));
    if v_acct.id is null or v_acct.status <> 'active' then
      raise exception 'choose_account' using errcode = '22023';
    end if;
    if v_acct.id = v_cash.id then
      raise exception 'same_account' using errcode = '22023';
    end if;
    v_amt := round(nullif(v_line->>'amount', '')::numeric, 2);
    if v_amt is null or v_amt <= 0 then
      raise exception 'amount_positive' using errcode = '22023';
    end if;
    v_total := v_total + v_amt;
    if v_kind = 'official_receipt' then
      v_je_lines := v_je_lines || jsonb_build_object(
        'accountId', v_acct.id, 'credit', v_amt,
        'description', left(coalesce(nullif(btrim(coalesce(v_line->>'description', '')), ''), v_number), 200));
    else
      v_je_lines := v_je_lines || jsonb_build_object(
        'accountId', v_acct.id, 'debit', v_amt,
        'description', left(coalesce(nullif(btrim(coalesce(v_line->>'description', '')), ''), v_number), 200));
    end if;
  end loop;

  if v_kind = 'official_receipt' then
    v_je_lines := jsonb_build_array(jsonb_build_object('accountId', v_cash.id, 'debit', v_total, 'description', v_number)) || v_je_lines;
    v_memo := left('Official receipt ' || v_number || coalesce(' · ' || v_party, '') || coalesce(' · ' || v_notes, ''), 250);
  else
    v_je_lines := v_je_lines || jsonb_build_object('accountId', v_cash.id, 'credit', v_total, 'description', v_number);
    v_memo := left('Payment voucher ' || v_number || coalesce(' · ' || v_party, '') || coalesce(' · ' || v_notes, ''), 250);
  end if;

  insert into public.cash_vouchers (
    org_id, kind, voucher_number, voucher_date, party_name, cash_account_id, notes, total, replaces_id, created_by
  )
  values (
    v_org, v_kind, v_number, v_on, left(v_party, 200), v_cash.id, left(v_notes, 500), v_total, v_edit_id, auth.uid()
  )
  returning id into v_id;

  v_n := 0;
  for v_line in select * from jsonb_array_elements(p->'lines') loop
    v_n := v_n + 1;
    select id into v_acct from public.accounts where org_id = v_org and code = btrim(coalesce(v_line->>'accountCode', ''));
    v_amt := round((v_line->>'amount')::numeric, 2);
    insert into public.cash_voucher_lines (voucher_id, line_no, org_id, account_id, description, amount)
    values (v_id, v_n, v_org, v_acct.id, left(nullif(btrim(coalesce(v_line->>'description', '')), ''), 300), v_amt);
  end loop;

  v_je := public.insert_journal(v_org, null, v_on, v_memo, v_kind, v_id, null, null, v_je_lines);
  update public.cash_vouchers set journal_entry_id = v_je where id = v_id;

  if v_edit_id is not null then
    update public.cash_vouchers set replaced_by_id = v_id where id = v_edit_id;
  end if;

  return jsonb_build_object('id', v_id, 'number', v_number, 'entryId', v_je);
exception
  when unique_violation then
    raise exception 'number_taken' using errcode = '23505';
end;
$$;

create function public.void_cash_voucher(p_slug text, p_id uuid, p_on date, p_reason text) returns date
language plpgsql security definer set search_path = public as $$
begin
  return public.void_cash_voucher_internal(public.learn_org_for_editor(p_slug), p_id, p_on, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Bank transfers: record and void.
create function public.record_bank_transfer(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_from_id uuid := nullif(p->>'fromAccountId', '')::uuid;
  v_to_id uuid := nullif(p->>'toAccountId', '')::uuid;
  v_on date := nullif(p->>'transferDate', '')::date;
  v_amt numeric := round(nullif(p->>'amount', '')::numeric, 2);
  v_fee numeric := coalesce(round(nullif(p->>'fee', '')::numeric, 2), 0);
  v_ref text := nullif(btrim(coalesce(p->>'reference', '')), '');
  v_from record;
  v_to record;
  v_fee_acct uuid;
  v_num text;
  v_id uuid;
  v_je uuid;
  v_je_lines jsonb := '[]';
  v_memo text;
begin
  if v_on is null then raise exception 'bad_date' using errcode = '22023'; end if;
  if v_from_id is null or v_to_id is null then raise exception 'pick_accounts' using errcode = '22023'; end if;
  if v_from_id = v_to_id then raise exception 'same_account' using errcode = '22023'; end if;
  if v_amt is null or v_amt <= 0 then raise exception 'amount_not_positive' using errcode = '22023'; end if;
  if v_fee < 0 then raise exception 'fee_negative' using errcode = '22023'; end if;

  select id, code, name, is_cash, status into v_from from public.accounts where id = v_from_id and org_id = v_org;
  if v_from.id is null then raise exception 'account_not_found' using errcode = '22023'; end if;
  if not v_from.is_cash then raise exception 'not_bank_or_cash' using errcode = '22023', detail = v_from.code || ' ' || v_from.name; end if;
  if v_from.status <> 'active' then raise exception 'inactive_account' using errcode = '22023', detail = v_from.code || ' ' || v_from.name; end if;

  select id, code, name, is_cash, status into v_to from public.accounts where id = v_to_id and org_id = v_org;
  if v_to.id is null then raise exception 'account_not_found' using errcode = '22023'; end if;
  if not v_to.is_cash then raise exception 'not_bank_or_cash' using errcode = '22023', detail = v_to.code || ' ' || v_to.name; end if;
  if v_to.status <> 'active' then raise exception 'inactive_account' using errcode = '22023', detail = v_to.code || ' ' || v_to.name; end if;

  if v_fee > 0 then
    select id into v_fee_acct
    from public.accounts
    where org_id = v_org and status = 'active' and type = 'expense'
      and (code = '900-0600' or lower(name) like '%bank charge%')
    order by case when code = '900-0600' then 0 else 1 end, code
    limit 1;
    if v_fee_acct is null then
      raise exception 'no_bank_charges_account' using errcode = '22023';
    end if;
  end if;

  perform public.assert_open_period(v_org, v_on);
  v_num := public.next_cash_doc_number(v_org, 'TRF', v_on);

  insert into public.bank_transfers (
    org_id, transfer_number, transfer_date, from_account_id, to_account_id, amount, fee, fee_account_id, reference, created_by
  )
  values (
    v_org, v_num, v_on, v_from.id, v_to.id, v_amt, v_fee, v_fee_acct, left(v_ref, 200), auth.uid()
  )
  returning id into v_id;

  v_je_lines := jsonb_build_array(
    jsonb_build_object('accountId', v_to.id, 'debit', v_amt, 'description', 'Transfer from ' || v_from.name)
  );
  if v_fee > 0 then
    v_je_lines := v_je_lines || jsonb_build_object('accountId', v_fee_acct, 'debit', v_fee, 'description', 'Bank transfer fee (' || v_num || ')');
  end if;
  v_je_lines := v_je_lines || jsonb_build_object('accountId', v_from.id, 'credit', v_amt + v_fee, 'description', 'Transfer to ' || v_to.name);

  v_memo := left('Bank transfer ' || v_num || ': ' || v_from.name || ' -> ' || v_to.name || coalesce(' · ' || v_ref, ''), 250);
  v_je := public.insert_journal(v_org, null, v_on, v_memo, 'transfer', v_id, null, null, v_je_lines);
  update public.bank_transfers set journal_entry_id = v_je where id = v_id;

  return jsonb_build_object('id', v_id, 'number', v_num, 'entryId', v_je);
end;
$$;

create function public.void_bank_transfer(p_slug text, p_id uuid, p_on date, p_reason text) returns date
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  t public.bank_transfers;
  v_rev_on date;
  v_lines jsonb;
  v_je uuid;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'need_reason' using errcode = '22023'; end if;
  select * into t from public.bank_transfers where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if t.status <> 'recorded' then raise exception 'already_void' using errcode = '22023', detail = t.transfer_number; end if;
  if p_on is null then raise exception 'bad_date' using errcode = '22023'; end if;

  -- lejar.ai: "The reversal is dated on the void date, or on the transfer date if that is later."
  v_rev_on := greatest(p_on, t.transfer_date);
  perform public.assert_open_period(v_org, v_rev_on);

  select jsonb_agg(jsonb_build_object(
    'accountId', account_id, 'debit', credit, 'credit', debit, 'description', description
  ) order by line_no)
  into v_lines from public.journal_lines where entry_id = t.journal_entry_id;

  v_je := public.insert_journal(v_org, null, v_rev_on, left('Void transfer ' || t.transfer_number || ': ' || btrim(p_reason), 250), 'void', t.id, null, null, v_lines);
  update public.bank_transfers
  set status = 'void', void_entry_id = v_je, voided_on = v_rev_on, void_reason = left(btrim(p_reason), 500)
  where id = t.id;
  return v_rev_on;
end;
$$;

revoke all on function public.record_cash_voucher(text, jsonb) from public, anon;
revoke all on function public.void_cash_voucher(text, uuid, date, text) from public, anon;
revoke all on function public.record_bank_transfer(text, jsonb) from public, anon;
revoke all on function public.void_bank_transfer(text, uuid, date, text) from public, anon;

grant execute on function public.record_cash_voucher(text, jsonb) to authenticated;
grant execute on function public.void_cash_voucher(text, uuid, date, text) to authenticated;
grant execute on function public.record_bank_transfer(text, jsonb) to authenticated;
grant execute on function public.void_bank_transfer(text, uuid, date, text) to authenticated;
