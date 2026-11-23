-- Slice 37: Malaysian Withholding Tax (Form CP37 / CP37A / CP37D / CP107D) & Foreign Currency Revaluation.

create table if not exists public.wht_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  wht_number text not null,
  payee_name text not null,
  payee_tin text,
  payee_country text not null default 'Non-resident',
  contact_id uuid references public.contacts(id) on delete set null,
  section_code text not null check (section_code in ('s109_royalty', 's109_interest', 's109b_special', 's107a_contract', 's109f_other', 's107d_commission')),
  form_code text not null check (form_code in ('CP37', 'CP37A', 'CP37D', 'CP37F', 'CP107D')),
  payment_date date not null,
  due_date date not null, -- payment_date + 30 days (LHDN statutory remittance window)
  currency_code text not null default 'MYR',
  exchange_rate numeric(18, 6) not null default 1 check (exchange_rate > 0),
  gross_foreign numeric(14, 2) not null check (gross_foreign > 0),
  gross_myr numeric(14, 2) not null check (gross_myr > 0),
  wht_rate numeric(6, 2) not null check (wht_rate > 0 and wht_rate <= 50),
  wht_myr numeric(14, 2) not null check (wht_myr > 0),
  net_paid_myr numeric(14, 2) not null check (net_paid_myr >= 0),
  expense_account_id uuid not null references public.accounts(id),
  bank_account_id uuid not null references public.accounts(id),
  memo text,
  status text not null default 'unremitted' check (status in ('unremitted', 'remitted', 'void')),
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  remitted_on date,
  remittance_ref text,
  remittance_journal_id uuid references public.journal_entries(id) on delete set null,
  void_journal_id uuid references public.journal_entries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, wht_number)
);

create index if not exists idx_wht_entries_org on public.wht_entries (org_id, status, due_date);

create table if not exists public.fx_revaluations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  reval_date date not null,
  account_id uuid not null references public.accounts(id),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$' and currency_code <> 'MYR'),
  foreign_balance numeric(14, 2) not null,
  closing_rate numeric(18, 6) not null check (closing_rate > 0),
  carrying_myr numeric(14, 2) not null,
  revalued_myr numeric(14, 2) not null,
  gain_loss_myr numeric(14, 2) not null, -- positive = unrealised FX gain, negative = unrealised FX loss
  memo text,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  reversal_journal_id uuid references public.journal_entries(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_fx_revaluations_org on public.fx_revaluations (org_id, reval_date desc);

alter table public.wht_entries enable row level security;
alter table public.fx_revaluations enable row level security;

drop policy if exists "wht_entries_select_member" on public.wht_entries;
create policy "wht_entries_select_member" on public.wht_entries
  for select to authenticated using (public.is_org_member(org_id));

drop policy if exists "fx_revaluations_select_member" on public.fx_revaluations;
create policy "fx_revaluations_select_member" on public.fx_revaluations
  for select to authenticated using (public.is_org_member(org_id));

-- Helper: ensure 400-1100 Withholding Tax Payable exists and return its ID.
create or replace function public.ensure_wht_payable_account(p_org uuid) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.accounts where org_id = p_org and code = '400-1100' limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash, sort_order, is_system)
  values (p_org, '400-1100', 'Withholding Tax Payable', 'liability', 'current', 'current_liability', 'credit', false, 410, true)
  on conflict (org_id, code) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.accounts where org_id = p_org and code = '400-1100' limit 1;
  end if;
  return v_id;
end;
$$;

-- Helper: ensure 900-0500 Unrealised FX Gain / 800-9500 Unrealised FX Loss accounts exist.
create or replace function public.ensure_fx_account(p_org uuid, p_gain boolean) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := case when p_gain then '900-0500' else '800-9500' end;
  v_id uuid;
begin
  select id into v_id from public.accounts where org_id = p_org and code = v_code limit 1;
  if v_id is not null then return v_id; end if;

  if p_gain then
    insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash, sort_order, is_system)
    values (p_org, '900-0500', 'Unrealised Foreign Exchange Gain', 'revenue', null, 'other_income', 'credit', false, 680, true)
    on conflict (org_id, code) do nothing
    returning id into v_id;
  else
    insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash, sort_order, is_system)
    values (p_org, '800-9500', 'Unrealised Foreign Exchange Loss', 'expense', null, 'operating_expense', 'debit', false, 950, true)
    on conflict (org_id, code) do nothing
    returning id into v_id;
  end if;

  if v_id is null then
    select id into v_id from public.accounts where org_id = p_org and code = v_code limit 1;
  end if;
  return v_id;
end;
$$;

-- 1. Record a Malaysian Withholding Tax deduction & post balanced double-entry journal.
create or replace function public.record_wht_entry(p_slug text, p jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_payee text := btrim(coalesce(p->>'payeeName', ''));
  v_section text := coalesce(p->>'sectionCode', 's109b_special');
  v_form text;
  v_date date := (p->>'paymentDate')::date;
  v_due date := v_date + 30;
  v_ccy text := upper(btrim(coalesce(p->>'currencyCode', 'MYR')));
  v_fx numeric := coalesce((p->>'exchangeRate')::numeric, 1);
  v_gross_foreign numeric := round((p->>'grossForeign')::numeric, 2);
  v_gross_myr numeric := round(v_gross_foreign * v_fx, 2);
  v_rate numeric := round((p->>'whtRate')::numeric, 2);
  v_wht_myr numeric := round(v_gross_myr * v_rate / 100.0, 2);
  v_net_myr numeric := v_gross_myr - v_wht_myr;
  v_exp_acct uuid := (p->>'expenseAccountId')::uuid;
  v_bank_acct uuid := (p->>'bankAccountId')::uuid;
  v_wht_acct uuid := public.ensure_wht_payable_account(v_org);
  v_contact_id uuid := nullif(btrim(coalesce(p->>'contactId', '')), '')::uuid;
  v_memo text := nullif(btrim(coalesce(p->>'memo', '')), '');
  v_num text;
  v_id uuid;
  v_je uuid;
  v_lines jsonb;
  v_actor_email text;
begin
  if v_payee = '' then raise exception 'Payee name is required.'; end if;
  if v_date is null then raise exception 'Payment date is required.'; end if;
  if v_gross_foreign <= 0 or v_fx <= 0 then raise exception 'Gross amount and exchange rate must be positive.'; end if;
  if v_rate <= 0 or v_rate > 50 then raise exception 'WHT rate must be between 0.01% and 50%.'; end if;
  if v_wht_myr <= 0 then raise exception 'Calculated WHT amount must be at least RM 0.01.'; end if;

  v_form := case v_section
    when 's109_royalty' then 'CP37'
    when 's109_interest' then 'CP37'
    when 's109b_special' then 'CP37D'
    when 's107a_contract' then 'CP37A'
    when 's109f_other' then 'CP37F'
    when 's107d_commission' then 'CP107D'
    else null
  end;
  if v_form is null then raise exception 'Invalid Malaysian WHT section.'; end if;

  v_num := public.next_doc_number(v_org, 'WHT', v_date);

  v_lines := jsonb_build_array(
    jsonb_build_object('accountId', v_exp_acct, 'debit', v_gross_myr, 'description', v_form || ' WHT gross · ' || v_payee),
    jsonb_build_object('accountId', v_wht_acct, 'credit', v_wht_myr, 'description', v_form || ' (' || v_rate || '%) payable to LHDN · ' || v_payee)
  );
  if v_net_myr > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('accountId', v_bank_acct, 'credit', v_net_myr, 'description', 'Net payment after WHT · ' || v_payee)
    );
  end if;

  v_je := public.insert_journal(
    v_org, null, v_date,
    left(v_num || ' · ' || v_form || ' WHT (' || v_rate || '%) · ' || v_payee || coalesce(' · ' || v_memo, ''), 250),
    'wht_deduction', null, v_contact_id, null, v_lines
  );

  insert into public.wht_entries (
    org_id, wht_number, payee_name, payee_tin, payee_country, contact_id,
    section_code, form_code, payment_date, due_date,
    currency_code, exchange_rate, gross_foreign, gross_myr, wht_rate, wht_myr, net_paid_myr,
    expense_account_id, bank_account_id, memo, status, journal_entry_id, created_by
  ) values (
    v_org, v_num, v_payee, nullif(btrim(coalesce(p->>'payeeTin', '')), ''),
    coalesce(nullif(btrim(coalesce(p->>'payeeCountry', '')), ''), 'Non-resident'), v_contact_id,
    v_section, v_form, v_date, v_due,
    v_ccy, v_fx, v_gross_foreign, v_gross_myr, v_rate, v_wht_myr, v_net_myr,
    v_exp_acct, v_bank_acct, v_memo, 'unremitted', v_je, auth.uid()
  )
  returning id into v_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'wht.recorded', 'Recorded ' || v_num || ' (' || v_form || ' RM ' || v_wht_myr::text || ' for ' || v_payee || ')', jsonb_build_object('wht_id', v_id, 'form', v_form));

  return v_id;
end;
$$;

-- 2. Remit WHT to LHDN: Dr 400-1100 WHT Payable / Cr Bank.
create or replace function public.remit_wht_entry(
  p_slug text,
  p_id uuid,
  p_remitted_on date,
  p_bank_account_id uuid,
  p_reference text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  r public.wht_entries;
  v_wht_acct uuid := public.ensure_wht_payable_account(v_org);
  v_je uuid;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_actor_email text;
begin
  select * into r from public.wht_entries where id = p_id and org_id = v_org for update;
  if not found then raise exception 'WHT entry not found.'; end if;
  if r.status <> 'unremitted' then raise exception 'Only unremitted WHT entries can be remitted.'; end if;

  v_je := public.insert_journal(
    v_org, null, coalesce(p_remitted_on, (now() at time zone 'Asia/Kuala_Lumpur')::date),
    left('LHDN WHT remittance · ' || r.wht_number || ' (' || r.form_code || ')' || coalesce(' · Ref ' || v_ref, ''), 250),
    'wht_remittance', r.id, r.contact_id, null,
    jsonb_build_array(
      jsonb_build_object('accountId', v_wht_acct, 'debit', r.wht_myr, 'description', 'Remit ' || r.form_code || ' to LHDN · ' || r.payee_name),
      jsonb_build_object('accountId', coalesce(p_bank_account_id, r.bank_account_id), 'credit', r.wht_myr, 'description', 'LHDN e-WHT payment' || coalesce(' · ' || v_ref, ''))
    )
  );

  update public.wht_entries
  set status = 'remitted',
      remitted_on = coalesce(p_remitted_on, (now() at time zone 'Asia/Kuala_Lumpur')::date),
      remittance_ref = v_ref,
      remittance_journal_id = v_je
  where id = r.id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'wht.remitted', 'Remitted ' || r.wht_number || ' (' || r.form_code || ' RM ' || r.wht_myr::text || ') to LHDN', jsonb_build_object('wht_id', r.id, 'ref', v_ref));

  return v_je;
end;
$$;

-- 3. Void an unremitted WHT entry with an exact reversing journal entry.
create or replace function public.void_wht_entry(p_slug text, p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  r public.wht_entries;
  v_wht_acct uuid := public.ensure_wht_payable_account(v_org);
  v_lines jsonb;
  v_je uuid;
  v_actor_email text;
begin
  select * into r from public.wht_entries where id = p_id and org_id = v_org for update;
  if not found then raise exception 'WHT entry not found.'; end if;
  if r.status <> 'unremitted' then raise exception 'Only unremitted WHT entries can be voided.'; end if;

  v_lines := jsonb_build_array(
    jsonb_build_object('accountId', v_wht_acct, 'debit', r.wht_myr, 'description', 'Void ' || r.wht_number),
    jsonb_build_object('accountId', r.expense_account_id, 'credit', r.gross_myr, 'description', 'Void ' || r.wht_number)
  );
  if r.net_paid_myr > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('accountId', r.bank_account_id, 'debit', r.net_paid_myr, 'description', 'Void ' || r.wht_number)
    );
  end if;

  v_je := public.insert_journal(
    v_org, null, (now() at time zone 'Asia/Kuala_Lumpur')::date,
    left('Void ' || r.wht_number || ' · ' || r.payee_name, 250),
    'wht_void', r.id, r.contact_id, null, v_lines
  );

  update public.wht_entries set status = 'void', void_journal_id = v_je where id = r.id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'wht.voided', 'Voided WHT entry ' || r.wht_number, jsonb_build_object('wht_id', r.id));
end;
$$;

-- 4. Post a Month-End Foreign Currency Revaluation journal entry.
create or replace function public.post_fx_revaluation(
  p_slug text,
  p_reval_date date,
  p_account_id uuid,
  p_currency_code text,
  p_foreign_balance numeric,
  p_closing_rate numeric,
  p_carrying_myr numeric,
  p_memo text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_ccy text := upper(btrim(coalesce(p_currency_code, '')));
  v_revalued numeric := round(p_foreign_balance * p_closing_rate, 2);
  v_diff numeric := round(v_revalued - p_carrying_myr, 2);
  v_abs numeric := abs(v_diff);
  v_acct_name text;
  v_fx_acct uuid;
  v_lines jsonb;
  v_je uuid;
  v_id uuid;
  v_actor_email text;
begin
  if v_ccy !~ '^[A-Z]{3}$' or v_ccy = 'MYR' then raise exception 'Enter a valid 3-letter foreign currency code.'; end if;
  if p_reval_date is null then raise exception 'Revaluation date is required.'; end if;
  if p_closing_rate is null or p_closing_rate <= 0 then raise exception 'Closing exchange rate must be positive.'; end if;
  if v_diff = 0 then raise exception 'Revalued MYR matches carrying MYR (zero unrealised difference).'; end if;

  select code || ' ' || name into v_acct_name from public.accounts where id = p_account_id and org_id = v_org;
  if v_acct_name is null then raise exception 'Account not found in this organisation.'; end if;

  v_fx_acct := public.ensure_fx_account(v_org, v_diff > 0);
  if v_diff > 0 then
    -- Unrealised FX Gain: Dr Balance Sheet Account / Cr 900-0500 Unrealised FX Gain
    v_lines := jsonb_build_array(
      jsonb_build_object('accountId', p_account_id, 'debit', v_abs, 'description', 'FX reval ' || v_ccy || ' @ ' || p_closing_rate::text),
      jsonb_build_object('accountId', v_fx_acct, 'credit', v_abs, 'description', 'Unrealised FX gain · ' || v_acct_name)
    );
  else
    -- Unrealised FX Loss: Dr 800-9500 Unrealised FX Loss / Cr Balance Sheet Account
    v_lines := jsonb_build_array(
      jsonb_build_object('accountId', v_fx_acct, 'debit', v_abs, 'description', 'Unrealised FX loss · ' || v_acct_name),
      jsonb_build_object('accountId', p_account_id, 'credit', v_abs, 'description', 'FX reval ' || v_ccy || ' @ ' || p_closing_rate::text)
    );
  end if;

  v_je := public.insert_journal(
    v_org, null, p_reval_date,
    left('FX Revaluation · ' || v_ccy || ' ' || p_foreign_balance::text || ' @ ' || p_closing_rate::text || ' · ' || v_acct_name, 250),
    'fx_revaluation', null, null, null, v_lines
  );

  insert into public.fx_revaluations (
    org_id, reval_date, account_id, currency_code, foreign_balance, closing_rate,
    carrying_myr, revalued_myr, gain_loss_myr, memo, status, journal_entry_id, created_by
  ) values (
    v_org, p_reval_date, p_account_id, v_ccy, p_foreign_balance, p_closing_rate,
    p_carrying_myr, v_revalued, v_diff, nullif(btrim(coalesce(p_memo, '')), ''), 'posted', v_je, auth.uid()
  )
  returning id into v_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'fx.revalued', 'Posted FX revaluation (' || v_ccy || ', ' || (case when v_diff > 0 then '+RM ' else '-RM ' end) || v_abs::text || ')', jsonb_build_object('reval_id', v_id));

  return v_id;
end;
$$;

-- 5. Reverse an FX Revaluation (e.g. 1st day of next month auto-reversal).
create or replace function public.reverse_fx_revaluation(p_slug text, p_id uuid, p_reversal_date date default null) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  r public.fx_revaluations;
  v_abs numeric;
  v_fx_acct uuid;
  v_lines jsonb;
  v_dt date;
  v_je uuid;
  v_actor_email text;
begin
  select * into r from public.fx_revaluations where id = p_id and org_id = v_org for update;
  if not found then raise exception 'FX revaluation not found.'; end if;
  if r.status <> 'posted' then raise exception 'This revaluation has already been reversed.'; end if;

  v_abs := abs(r.gain_loss_myr);
  v_fx_acct := public.ensure_fx_account(v_org, r.gain_loss_myr > 0);
  v_dt := coalesce(p_reversal_date, (r.reval_date + 1));

  if r.gain_loss_myr > 0 then
    v_lines := jsonb_build_array(
      jsonb_build_object('accountId', v_fx_acct, 'debit', v_abs, 'description', 'Reverse unrealised FX gain'),
      jsonb_build_object('accountId', r.account_id, 'credit', v_abs, 'description', 'Reverse FX reval ' || r.currency_code)
    );
  else
    v_lines := jsonb_build_array(
      jsonb_build_object('accountId', r.account_id, 'debit', v_abs, 'description', 'Reverse FX reval ' || r.currency_code),
      jsonb_build_object('accountId', v_fx_acct, 'credit', v_abs, 'description', 'Reverse unrealised FX loss')
    );
  end if;

  v_je := public.insert_journal(
    v_org, null, v_dt,
    left('Reverse FX Revaluation · ' || r.currency_code || ' (' || r.reval_date::text || ')', 250),
    'fx_revaluation_reversal', r.id, null, null, v_lines
  );

  update public.fx_revaluations set status = 'reversed', reversal_journal_id = v_je where id = r.id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (v_org, auth.uid(), v_actor_email, 'fx.reversed', 'Reversed FX revaluation (' || r.currency_code || ') on ' || v_dt::text, jsonb_build_object('reval_id', r.id));

  return v_je;
end;
$$;

revoke all on function public.ensure_wht_payable_account(uuid) from public, anon, authenticated;
revoke all on function public.ensure_fx_account(uuid, boolean) from public, anon, authenticated;

revoke all on function public.record_wht_entry(text, jsonb) from public, anon;
grant execute on function public.record_wht_entry(text, jsonb) to authenticated;

revoke all on function public.remit_wht_entry(text, uuid, date, uuid, text) from public, anon;
grant execute on function public.remit_wht_entry(text, uuid, date, uuid, text) to authenticated;

revoke all on function public.void_wht_entry(text, uuid) from public, anon;
grant execute on function public.void_wht_entry(text, uuid) to authenticated;

revoke all on function public.post_fx_revaluation(text, date, uuid, text, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.post_fx_revaluation(text, date, uuid, text, numeric, numeric, numeric, text) to authenticated;

revoke all on function public.reverse_fx_revaluation(text, uuid, date) from public, anon;
grant execute on function public.reverse_fx_revaluation(text, uuid, date) to authenticated;
