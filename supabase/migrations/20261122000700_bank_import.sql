-- Slice 8: Bank statement import, modelled on lejar.ai's /import (observed 2026-11-22, docs/re/08-bank-import.md).
-- A statement file is stored like an AI Inbox document; its lines are drafts the user categorises
-- (with AI suggestions) and records in one batch, each line becoming a journal entry.

update storage.buckets set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/csv']
where id = 'source-documents';

alter table public.journal_entries drop constraint journal_entries_source_check;
alter table public.journal_entries add constraint journal_entries_source_check
  check (source in ('manual', 'bill', 'invoice', 'void', 'bank'));

create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  source_document_id uuid not null references public.source_documents (id) on delete cascade,
  bank text not null check (bank in ('MAYBANK', 'CIMB', 'PUBLIC_BANK', 'AMBANK', 'RHB', 'OCBC', 'HONG_LEONG', 'ALLIANCE', 'BANK_ISLAM', 'OTHER')),
  account_id uuid not null references public.accounts (id),
  file_name text not null,
  period_start date,
  period_end date,
  opening_balance numeric(14, 2),
  closing_balance numeric(14, 2),
  reader text not null check (reader in ('csv', 'ai')),
  warnings text[] not null default '{}',
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index bank_statements_org_idx on public.bank_statements (org_id, created_at desc);

create table public.bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.bank_statements (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  position integer not null,
  txn_date date not null,
  description text not null,
  reference text,
  amount numeric(14, 2) not null check (amount > 0),
  direction text not null check (direction in ('in', 'out')),
  balance numeric(14, 2),
  status text not null default 'draft' check (status in ('draft', 'recorded', 'matched', 'skipped', 'duplicate')),
  edited boolean not null default false,
  suggested_account_id uuid references public.accounts (id),
  suggestion_confidence numeric(4, 3),
  suggestion_reason text,
  account_id uuid references public.accounts (id),
  journal_entry_id uuid references public.journal_entries (id),
  matched_entry_id uuid references public.journal_entries (id),
  unique (statement_id, position)
);
create index bank_statement_lines_dedupe_idx on public.bank_statement_lines (org_id, txn_date, amount, direction);

alter table public.bank_statements enable row level security;
alter table public.bank_statement_lines enable row level security;
create policy "bank_statements: members read" on public.bank_statements for select to authenticated using (public.is_org_member(org_id));
create policy "bank_statement_lines: members read" on public.bank_statement_lines for select to authenticated using (public.is_org_member(org_id));

/** "Add a bank account": a new cash account under 300-1100 Current and Savings Accounts (300-1101, 300-1102, …). */
create function public.create_bank_account(p_slug text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_parent public.accounts;
  v_n int;
  v_code text;
  v_id uuid;
begin
  if char_length(btrim(coalesce(p_name, ''))) < 2 then raise exception 'name_min' using errcode = '22023'; end if;
  select * into v_parent from public.accounts where org_id = v_org and code = '300-1100';
  if v_parent.id is null then
    select * into v_parent from public.accounts where org_id = v_org and is_cash order by code limit 1;
  end if;
  if v_parent.id is null then raise exception 'no_cash_group' using errcode = '22023'; end if;
  select coalesce(max(substring(code from 6)::int), 1100) + 1 into v_n
  from public.accounts where org_id = v_org and code ~ '^300-11[0-9]{2}$' and code <> '300-1100';
  v_code := '300-' || lpad(v_n::text, 4, '0');
  insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash, parent_id)
  values (v_org, v_code, left(btrim(p_name), 120), 'asset', 'cash', v_parent.section, 'debit', true, v_parent.id)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'code', v_code, 'name', left(btrim(p_name), 120));
end;
$$;

/**
 * Stores a read statement and its lines. p_stmt: {sourceDocumentId, bank, accountCode, fileName, reader,
 * periodStart, periodEnd, openingBalance, closingBalance, warnings[], lines: [{date, description, reference,
 * amount, direction, balance}]}. Lines already recorded from an earlier upload (same account, date,
 * amount, direction and description) are kept as "duplicate" so nothing is counted twice.
 */
create function public.save_bank_statement(p_slug text, p_stmt jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_account uuid := public.account_id_for(v_org, p_stmt->>'accountCode');
  v_id uuid;
  v_line jsonb;
  v_n int := 0;
  v_dup boolean;
begin
  if not exists (select 1 from public.accounts where id = v_account and is_cash) then
    raise exception 'not_cash_account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.source_documents where id = (p_stmt->>'sourceDocumentId')::uuid and org_id = v_org) then
    raise exception 'statement_not_found' using errcode = '22023';
  end if;
  insert into public.bank_statements (org_id, source_document_id, bank, account_id, file_name, period_start, period_end,
                                      opening_balance, closing_balance, reader, warnings, created_by)
  values (v_org, (p_stmt->>'sourceDocumentId')::uuid, coalesce(nullif(p_stmt->>'bank', ''), 'OTHER'), v_account,
          left(p_stmt->>'fileName', 255), nullif(p_stmt->>'periodStart', '')::date, nullif(p_stmt->>'periodEnd', '')::date,
          nullif(p_stmt->>'openingBalance', '')::numeric, nullif(p_stmt->>'closingBalance', '')::numeric, p_stmt->>'reader',
          coalesce((select array_agg(x) from jsonb_array_elements_text(p_stmt->'warnings') x), '{}'), auth.uid())
  returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_stmt->'lines') loop
    v_n := v_n + 1;
    select exists (
      select 1 from public.bank_statement_lines l join public.bank_statements s on s.id = l.statement_id
      where l.org_id = v_org and s.account_id = v_account and l.status in ('recorded', 'matched')
        and l.txn_date = (v_line->>'date')::date and l.amount = (v_line->>'amount')::numeric
        and l.direction = v_line->>'direction' and lower(l.description) = lower(btrim(v_line->>'description'))) into v_dup;
    insert into public.bank_statement_lines (statement_id, org_id, position, txn_date, description, reference, amount, direction, balance, status)
    values (v_id, v_org, v_n, (v_line->>'date')::date, left(btrim(v_line->>'description'), 500), nullif(btrim(coalesce(v_line->>'reference', '')), ''),
            (v_line->>'amount')::numeric, v_line->>'direction', nullif(v_line->>'balance', '')::numeric,
            case when v_dup then 'duplicate' else 'draft' end);
  end loop;
  if v_n = 0 then raise exception 'no_lines' using errcode = '22023'; end if;
  return v_id;
end;
$$;

/** Stores AI suggestions: p_rows [{position, accountCode, confidence, reasoning}]. Unknown codes are ignored. */
create function public.save_line_suggestions(p_slug text, p_statement uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  r jsonb;
  v_acct uuid;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into v_acct from public.accounts where org_id = v_org and code = r->>'accountCode' and status = 'active' and not is_cash;
    update public.bank_statement_lines set
      suggested_account_id = v_acct,
      account_id = coalesce(account_id, v_acct),
      suggestion_confidence = least(1, greatest(0, coalesce((r->>'confidence')::numeric, 0))),
      suggestion_reason = left(r->>'reasoning', 500)
    where statement_id = p_statement and org_id = v_org and position = (r->>'position')::int and status = 'draft';
  end loop;
end;
$$;

/** Edits one draft line (date, description, amount, direction, chosen account) or skips / restores it. */
create function public.update_statement_line(p_slug text, p_line uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  update public.bank_statement_lines set
    txn_date = coalesce(nullif(p_patch->>'date', '')::date, txn_date),
    description = coalesce(nullif(btrim(coalesce(p_patch->>'description', '')), ''), description),
    amount = coalesce(nullif(p_patch->>'amount', '')::numeric, amount),
    direction = coalesce(nullif(p_patch->>'direction', ''), direction),
    account_id = case when p_patch ? 'accountCode' then
      (select id from public.accounts where org_id = v_org and code = p_patch->>'accountCode' and not is_cash and status = 'active')
      else account_id end,
    status = coalesce(nullif(p_patch->>'status', ''), status),
    edited = edited or p_patch ?| array['date', 'description', 'amount', 'direction']
  where id = p_line and org_id = v_org and status in ('draft', 'skipped');
  if not found then raise exception 'line_not_draft' using errcode = '22023'; end if;
end;
$$;

/**
 * lejar.ai's bulkApproveAction: records each picked draft line as its own journal entry (money in: Dr bank,
 * Cr category; money out: Dr category, Cr bank). Lines in a closed period fail and stay drafts.
 * Checks Learn section 4. Returns {recorded, failed: [{position, error}]}.
 */
create function public.record_statement_lines(p_slug text, p_lines uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  l record;
  v_je uuid;
  v_done int := 0;
  v_failed jsonb := '[]';
begin
  for l in
    select bl.*, s.account_id bank_account, s.source_document_id doc
    from public.bank_statement_lines bl join public.bank_statements s on s.id = bl.statement_id
    where bl.org_id = v_org and bl.id = any (p_lines) and bl.status = 'draft' order by bl.position
  loop
    if l.account_id is null then
      v_failed := v_failed || jsonb_build_object('position', l.position, 'error', 'no_account');
      continue;
    end if;
    begin
      v_je := public.insert_journal(v_org, null, l.txn_date, left(l.description, 200), 'bank', l.id, l.doc, null,
        case when l.direction = 'in' then
          jsonb_build_array(jsonb_build_object('accountId', l.bank_account, 'debit', l.amount, 'description', l.description),
                            jsonb_build_object('accountId', l.account_id, 'credit', l.amount, 'description', l.description))
        else
          jsonb_build_array(jsonb_build_object('accountId', l.account_id, 'debit', l.amount, 'description', l.description),
                            jsonb_build_object('accountId', l.bank_account, 'credit', l.amount, 'description', l.description))
        end);
      update public.bank_statement_lines set status = 'recorded', journal_entry_id = v_je where id = l.id;
      v_done := v_done + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_object('position', l.position, 'error', sqlerrm);
    end;
  end loop;
  if v_done > 0 then
    perform public.check_learn_section(v_org, 'import-bank');
  end if;
  return jsonb_build_object('recorded', v_done, 'failed', v_failed);
end;
$$;

/**
 * lejar.ai's confirmMatchesAction: a statement line that matches an entry already in the books (same bank
 * account, amount and direction within 7 days) is linked to it instead of recording a new entry.
 */
create function public.confirm_statement_matches(p_slug text, p_pairs jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  r jsonb;
  v_n int := 0;
begin
  for r in select * from jsonb_array_elements(p_pairs) loop
    update public.bank_statement_lines bl set status = 'matched', matched_entry_id = (r->>'entryId')::uuid
    from public.bank_statements s
    where bl.id = (r->>'lineId')::uuid and bl.org_id = v_org and bl.status = 'draft' and s.id = bl.statement_id
      and exists (
        select 1 from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
        where je.id = (r->>'entryId')::uuid and je.org_id = v_org and jl.account_id = s.account_id
          and ((bl.direction = 'in' and jl.debit = bl.amount) or (bl.direction = 'out' and jl.credit = bl.amount)));
    if found then v_n := v_n + 1; end if;
  end loop;
  if v_n > 0 then perform public.check_learn_section(v_org, 'import-bank'); end if;
  return v_n;
end;
$$;

/** "Delete" a statement upload that has nothing recorded from it. */
create function public.delete_bank_statement(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  if exists (select 1 from public.bank_statement_lines where statement_id = p_id and status in ('recorded', 'matched')) then
    raise exception 'has_recorded' using errcode = '22023';
  end if;
  delete from public.bank_statements where id = p_id and org_id = v_org;
  if not found then raise exception 'statement_not_found' using errcode = '22023'; end if;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['create_bank_account(text, text)', 'save_bank_statement(text, jsonb)', 'save_line_suggestions(text, uuid, jsonb)',
    'update_statement_line(text, uuid, jsonb)', 'record_statement_lines(text, uuid[])', 'confirm_statement_matches(text, jsonb)',
    'delete_bank_statement(text, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
