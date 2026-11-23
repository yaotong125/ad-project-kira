-- Slice 5: AI Inbox (upload → AI draft → review) and the books it records into:
-- source documents in Storage, AI drafts, suppliers, bills, journal entries.
-- Modelled on lejar.ai (observed 2026-11-22, docs/re/05-ai-inbox.md). All writes go through the
-- role-checked functions below; members read their entity's rows through RLS.

-- ---------------------------------------------------------------------------------------------
-- Storage: one private bucket, one folder per entity ({org_id}/{sha256}.{ext}), as on lejar.ai.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('source-documents', 'source-documents', false, 10485760,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create function public.can_write_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role in ('owner', 'admin', 'member'));
$$;
revoke all on function public.can_write_org(uuid) from public, anon;
grant execute on function public.can_write_org(uuid) to authenticated;

create function public.storage_org_folder(p_name text) returns uuid
language plpgsql immutable as $$
begin
  return (storage.foldername(p_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

create policy "source documents: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'source-documents' and public.is_org_member(public.storage_org_folder(name)));
create policy "source documents: editors upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'source-documents' and public.can_write_org(public.storage_org_folder(name)));

-- ---------------------------------------------------------------------------------------------
create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  path text not null,
  original_name text not null check (char_length(original_name) between 1 and 255),
  content_type text not null,
  byte_size integer not null check (byte_size > 0),
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, sha256)
);

-- lejar.ai's draft statuses: analyzing (uploaded, not read yet: "Ready to analyze"), pending ("Ready to
-- review"), confirmed ("Recorded"), dismissed, failed ("Not drafted"), unsupported ("Not for the books").
create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  source_document_id uuid not null references public.source_documents (id) on delete cascade,
  original_name text not null,
  user_note text check (user_note is null or char_length(user_note) <= 500),
  status text not null default 'analyzing'
    check (status in ('analyzing', 'pending', 'confirmed', 'dismissed', 'failed', 'unsupported')),
  draft_type text check (draft_type in ('bill', 'payment', 'invoice', 'journal')),
  document_type text,
  ai_summary text,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  document_date date,
  error text,
  unsupported_kind text,
  proposal jsonb,
  model text,
  recorded_kind text check (recorded_kind in ('bill', 'journal')),
  recorded_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_drafts_org_idx on public.ai_drafts (org_id, created_at);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  kind text not null default 'supplier' check (kind in ('supplier', 'customer', 'both')),
  tin text,
  registration_number text,
  phone text,
  created_at timestamptz not null default now()
);
create unique index contacts_org_name_idx on public.contacts (org_id, lower(name));

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  entry_number text,
  occurred_on date not null,
  memo text,
  source text not null check (source in ('manual', 'bill')),
  source_id uuid,
  source_document_id uuid references public.source_documents (id) on delete set null,
  ai_draft_id uuid references public.ai_drafts (id) on delete set null,
  posted_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create unique index journal_entries_number_idx on public.journal_entries (org_id, entry_number) where entry_number is not null;

create table public.journal_lines (
  entry_id uuid not null references public.journal_entries (id) on delete cascade,
  line_no integer not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  description text,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  check ((debit > 0) <> (credit > 0)),
  primary key (entry_id, line_no)
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.contacts (id),
  bill_number text not null,
  bill_date date not null,
  due_date date,
  currency text not null default 'MYR' check (currency = 'MYR'),
  payable_account_id uuid not null references public.accounts (id),
  status text not null default 'open' check (status in ('draft', 'open', 'paid', 'void')),
  notes text,
  subtotal numeric(14, 2) not null,
  tax_total numeric(14, 2) not null,
  total numeric(14, 2) not null,
  source_document_id uuid references public.source_documents (id) on delete set null,
  ai_draft_id uuid references public.ai_drafts (id) on delete set null,
  journal_entry_id uuid references public.journal_entries (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  unique (org_id, bill_number),
  check (due_date is null or due_date >= bill_date)
);

create table public.bill_lines (
  bill_id uuid not null references public.bills (id) on delete cascade,
  line_no integer not null,
  org_id uuid not null references public.organizations (id) on delete cascade,
  description text not null,
  account_id uuid not null references public.accounts (id),
  quantity numeric(14, 4) not null check (quantity > 0),
  unit_price numeric(14, 2) not null,
  tax_code text not null check (tax_code in ('none', 'sst_6', 'sst_8', 'sales_5', 'sales_10', 'exempt')),
  amount numeric(14, 2) not null,
  tax_amount numeric(14, 2) not null,
  primary key (bill_id, line_no)
);

do $$
declare t text;
begin
  foreach t in array array['source_documents', 'ai_drafts', 'contacts', 'journal_entries', 'journal_lines', 'bills', 'bill_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%s: members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Helpers.

/** Next "{prefix}-YYYYMM-NNN" number for the month of p_on (lejar.ai's BILL-202611-001 / JV-202611-001). */
create function public.next_doc_number(p_org uuid, p_prefix text, p_on date) returns text
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
  else
    select max(substring(entry_number from char_length(v_stem) + 1)::int) into v_max
    from public.journal_entries where org_id = p_org and entry_number ~ ('^' || v_stem || '[0-9]+$');
  end if;
  return v_stem || lpad((coalesce(v_max, 0) + 1)::text, 3, '0');
end;
$$;

/** Raises unless p_on falls in an open accounting period of the entity's books. */
create function public.assert_open_period(p_org uuid, p_on date) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.accounting_periods p
    where p.org_id = p_org and p_on between p.starts_on and p.ends_on and p.status = 'open') then
    raise exception 'period_closed' using errcode = '22023';
  end if;
end;
$$;

create function public.account_id_for(p_org uuid, p_code text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.accounts where org_id = p_org and code = p_code and status = 'active';
  if v_id is null then
    raise exception 'unknown_account' using errcode = '22023', detail = coalesce(p_code, '');
  end if;
  return v_id;
end;
$$;

create function public.tax_rate(p_code text) returns numeric
language sql immutable as $$
  select case p_code when 'sst_6' then 0.06 when 'sst_8' then 0.08 when 'sales_5' then 0.05
                     when 'sales_10' then 0.10 else 0 end;
$$;

-- ---------------------------------------------------------------------------------------------
-- AI Inbox.

/**
 * Registers uploaded files (already in Storage) as source documents and queues one draft each.
 * p_files: [{sha256, name, size, contentType, path}]. A file whose document already has a live draft
 * comes back under "duplicates" (lejar.ai: "exists_in_inbox").
 */
create function public.inbox_register_uploads(p_slug text, p_files jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_file jsonb;
  v_doc uuid;
  v_draft uuid;
  v_created jsonb := '[]';
  v_dupes jsonb := '[]';
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  for v_file in select * from jsonb_array_elements(p_files) loop
    select id into v_doc from public.source_documents where org_id = v_org and sha256 = v_file->>'sha256';
    if v_doc is null then
      insert into public.source_documents (org_id, sha256, path, original_name, content_type, byte_size, uploaded_by)
      values (v_org, v_file->>'sha256', v_file->>'path', left(v_file->>'name', 255), v_file->>'contentType',
              (v_file->>'size')::int, auth.uid())
      returning id into v_doc;
    else
      select id into v_draft from public.ai_drafts
      where source_document_id = v_doc and status <> 'dismissed' order by created_at desc limit 1;
      if v_draft is not null then
        v_dupes := v_dupes || jsonb_build_object('draftId', v_draft, 'originalName', v_file->>'name');
        continue;
      end if;
    end if;
    insert into public.ai_drafts (org_id, source_document_id, original_name, user_note, created_by)
    values (v_org, v_doc, left(v_file->>'name', 255), left(v_note, 500), auth.uid())
    returning id into v_draft;
    v_created := v_created || jsonb_build_object('draftId', v_draft, 'originalName', v_file->>'name',
                                                 'sourceDocumentId', v_doc);
  end loop;
  return jsonb_build_object('created', v_created, 'duplicates', v_dupes);
end;
$$;

/** Stores what the AI read (status pending / failed / unsupported). Only drafts not yet reviewed. */
create function public.inbox_save_analysis(p_slug text, p_draft uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  update public.ai_drafts set
    status = p_result->>'status',
    draft_type = p_result->>'draftType',
    document_type = p_result->>'documentType',
    ai_summary = p_result->>'aiSummary',
    confidence = (p_result->>'confidence')::numeric,
    document_date = (p_result->>'documentDate')::date,
    error = p_result->>'error',
    unsupported_kind = p_result->>'unsupportedKind',
    proposal = p_result->'proposal',
    model = p_result->>'model',
    updated_at = now()
  where id = p_draft and org_id = v_org and status in ('analyzing', 'failed');
  if not found then
    raise exception 'draft_not_waiting' using errcode = '22023';
  end if;
end;
$$;

/** Dismiss (also "Remove" for waiting rows) or restore drafts. Recorded drafts never change. */
create function public.inbox_set_status(p_slug text, p_drafts uuid[], p_action text) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_done uuid[];
begin
  if p_action = 'dismiss' then
    with u as (
      update public.ai_drafts set status = 'dismissed', updated_at = now()
      where org_id = v_org and id = any (p_drafts) and status not in ('confirmed', 'dismissed')
      returning id)
    select coalesce(array_agg(id), '{}') into v_done from u;
  elsif p_action = 'restore' then
    with u as (
      update public.ai_drafts
      set status = case when proposal is not null then 'pending' when error is not null then 'failed' else 'analyzing' end,
          updated_at = now()
      where org_id = v_org and id = any (p_drafts) and status = 'dismissed'
      returning id)
    select coalesce(array_agg(id), '{}') into v_done from u;
  else
    raise exception 'unknown_action' using errcode = '22023';
  end if;
  return v_done;
end;
$$;

/** Marks the inbox draft behind a recorded bill / journal entry and checks Learn section 1. */
create function public.inbox_mark_recorded(p_org uuid, p_draft uuid, p_kind text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_draft is null then return; end if;
  update public.ai_drafts set status = 'confirmed', recorded_kind = p_kind, recorded_id = p_id, updated_at = now()
  where id = p_draft and org_id = p_org and status = 'pending';
  if not found then
    raise exception 'draft_not_pending' using errcode = '22023';
  end if;
  perform public.check_learn_section(p_org, 'receipt-to-bill');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Ledger.

/** Inserts a balanced journal entry. p_lines: [{accountId, debit, credit, description}]. */
create function public.insert_journal(
  p_org uuid, p_number text, p_on date, p_memo text, p_source text, p_source_id uuid,
  p_doc uuid, p_draft uuid, p_lines jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_line jsonb;
  v_n int := 0;
  v_dr numeric := 0;
  v_cr numeric := 0;
begin
  perform public.assert_open_period(p_org, p_on);
  insert into public.journal_entries (org_id, entry_number, occurred_on, memo, source, source_id, source_document_id, ai_draft_id, posted_by)
  values (p_org, p_number, p_on, p_memo, p_source, p_source_id, p_doc, p_draft, auth.uid())
  returning id into v_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_n := v_n + 1;
    insert into public.journal_lines (entry_id, line_no, org_id, account_id, description, debit, credit)
    values (v_id, v_n, p_org, (v_line->>'accountId')::uuid, v_line->>'description',
            coalesce((v_line->>'debit')::numeric, 0), coalesce((v_line->>'credit')::numeric, 0));
    v_dr := v_dr + coalesce((v_line->>'debit')::numeric, 0);
    v_cr := v_cr + coalesce((v_line->>'credit')::numeric, 0);
  end loop;
  if v_n < 2 or v_dr <> v_cr or v_dr = 0 then
    raise exception 'unbalanced' using errcode = '22023';
  end if;
  return v_id;
end;
$$;
revoke all on function public.insert_journal(uuid, text, date, text, text, uuid, uuid, uuid, jsonb) from public, anon, authenticated;

/**
 * lejar.ai's "Post entry" (postEntryAction). p_entry: {occurredOn, reference, referenceEdited, memo,
 * aiDraftId, sourceDocumentId, lines: [{accountCode, debit, credit}]}. Unedited references are
 * re-numbered at posting so two people posting at once never collide.
 */
create function public.post_journal_entry(p_slug text, p_entry jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_on date := (p_entry->>'occurredOn')::date;
  v_number text := nullif(btrim(coalesce(p_entry->>'reference', '')), '');
  v_lines jsonb := '[]';
  v_line jsonb;
  v_draft uuid := nullif(p_entry->>'aiDraftId', '')::uuid;
  v_id uuid;
begin
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_number is null or coalesce((p_entry->>'referenceEdited')::boolean, false) is false then
    v_number := public.next_doc_number(v_org, 'JV', v_on);
  elsif exists (select 1 from public.journal_entries where org_id = v_org and entry_number = v_number) then
    raise exception 'reference_taken' using errcode = '23505';
  end if;
  for v_line in select * from jsonb_array_elements(p_entry->'lines') loop
    if coalesce((v_line->>'debit')::numeric, 0) = 0 and coalesce((v_line->>'credit')::numeric, 0) = 0 then
      continue;
    end if;
    v_lines := v_lines || jsonb_build_object(
      'accountId', public.account_id_for(v_org, v_line->>'accountCode'),
      'debit', round(coalesce((v_line->>'debit')::numeric, 0), 2),
      'credit', round(coalesce((v_line->>'credit')::numeric, 0), 2));
  end loop;
  v_id := public.insert_journal(v_org, v_number, v_on, nullif(btrim(coalesce(p_entry->>'memo', '')), ''), 'manual', null,
                                nullif(p_entry->>'sourceDocumentId', '')::uuid, v_draft, v_lines);
  perform public.inbox_mark_recorded(v_org, v_draft, 'journal', v_id);
  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;

/**
 * lejar.ai's "Save & record" (createBillAction, intent record). p_bill: {supplierContactId, supplierName,
 * billNumber (null = auto), billDate, dueDate, payableAccountCode, notes, aiDraftId, sourceDocumentId,
 * lines: [{description, accountCode, quantity, unitPrice, taxCode}]}. Posts Dr expense lines,
 * Dr SST Input Tax (400-1400) for tax, Cr the payable account.
 */
create function public.record_bill(p_slug text, p_bill jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_on date := (p_bill->>'billDate')::date;
  v_due date := nullif(p_bill->>'dueDate', '')::date;
  v_contact uuid := nullif(p_bill->>'supplierContactId', '')::uuid;
  v_name text := nullif(btrim(coalesce(p_bill->>'supplierName', '')), '');
  v_number text := nullif(btrim(coalesce(p_bill->>'billNumber', '')), '');
  v_payable uuid;
  v_payable_type text;
  v_draft uuid := nullif(p_bill->>'aiDraftId', '')::uuid;
  v_doc uuid := nullif(p_bill->>'sourceDocumentId', '')::uuid;
  v_bill uuid;
  v_line jsonb;
  v_n int := 0;
  v_qty numeric;
  v_price numeric;
  v_net numeric;
  v_tax numeric;
  v_sub numeric := 0;
  v_tax_total numeric := 0;
  v_acct uuid;
  v_je_lines jsonb := '[]';
  v_tax_acct uuid;
  v_je uuid;
begin
  if v_on is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_due is not null and v_due < v_on then raise exception 'due_before_bill' using errcode = '22023'; end if;
  perform public.assert_open_period(v_org, v_on);

  if v_contact is not null then
    if not exists (select 1 from public.contacts where id = v_contact and org_id = v_org) then
      raise exception 'unknown_supplier' using errcode = '22023';
    end if;
  elsif v_name is not null then
    select id into v_contact from public.contacts where org_id = v_org and lower(name) = lower(v_name);
    if v_contact is null then
      insert into public.contacts (org_id, name, kind, tin)
      values (v_org, left(v_name, 200), 'supplier', nullif(btrim(coalesce(p_bill->>'supplierTin', '')), ''))
      returning id into v_contact;
    end if;
  else
    raise exception 'supplier_required' using errcode = '22023';
  end if;

  v_payable := public.account_id_for(v_org, p_bill->>'payableAccountCode');
  select type into v_payable_type from public.accounts where id = v_payable;
  if v_payable_type <> 'liability' then raise exception 'payable_not_liability' using errcode = '22023'; end if;

  if v_number is null then
    v_number := public.next_doc_number(v_org, 'BILL', v_on);
  elsif exists (select 1 from public.bills where org_id = v_org and bill_number = v_number) then
    raise exception 'bill_number_taken' using errcode = '23505';
  end if;

  insert into public.bills (org_id, contact_id, bill_number, bill_date, due_date, payable_account_id, status, notes,
                            subtotal, tax_total, total, source_document_id, ai_draft_id, created_by)
  values (v_org, v_contact, v_number, v_on, v_due, v_payable, 'open', nullif(btrim(coalesce(p_bill->>'notes', '')), ''),
          0, 0, 0, v_doc, v_draft, auth.uid())
  returning id into v_bill;

  for v_line in select * from jsonb_array_elements(p_bill->'lines') loop
    v_qty := (v_line->>'quantity')::numeric;
    v_price := (v_line->>'unitPrice')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'bad_quantity' using errcode = '22023'; end if;
    if v_price is null then raise exception 'bad_price' using errcode = '22023'; end if;
    v_n := v_n + 1;
    v_net := round(v_qty * v_price, 2);
    v_tax := round(v_net * public.tax_rate(v_line->>'taxCode'), 2);
    v_acct := public.account_id_for(v_org, v_line->>'accountCode');
    insert into public.bill_lines (bill_id, line_no, org_id, description, account_id, quantity, unit_price, tax_code, amount, tax_amount)
    values (v_bill, v_n, v_org, coalesce(nullif(btrim(v_line->>'description'), ''), '-'), v_acct, v_qty, v_price,
            coalesce(v_line->>'taxCode', 'none'), v_net, v_tax);
    v_sub := v_sub + v_net;
    v_tax_total := v_tax_total + v_tax;
    if v_net > 0 then
      v_je_lines := v_je_lines || jsonb_build_object('accountId', v_acct, 'debit', v_net,
                                                     'description', v_line->>'description');
    elsif v_net < 0 then
      v_je_lines := v_je_lines || jsonb_build_object('accountId', v_acct, 'credit', -v_net,
                                                     'description', v_line->>'description');
    end if;
  end loop;
  if v_n = 0 then raise exception 'lines_required' using errcode = '22023'; end if;
  if v_sub + v_tax_total <= 0 then raise exception 'total_not_positive' using errcode = '22023'; end if;

  if v_tax_total > 0 then
    select id into v_tax_acct from public.accounts where org_id = v_org and code = '400-1400' and status = 'active';
    v_je_lines := v_je_lines || jsonb_build_object('accountId', coalesce(v_tax_acct, (v_je_lines->0->>'accountId')::uuid),
                                                   'debit', v_tax_total, 'description', 'SST');
  end if;
  v_je_lines := v_je_lines || jsonb_build_object('accountId', v_payable, 'credit', v_sub + v_tax_total,
                                                 'description', v_number);

  v_je := public.insert_journal(v_org, null, v_on, 'Bill ' || v_number, 'bill', v_bill, v_doc, v_draft, v_je_lines);
  update public.bills set subtotal = v_sub, tax_total = v_tax_total, total = v_sub + v_tax_total, journal_entry_id = v_je
  where id = v_bill;
  perform public.inbox_mark_recorded(v_org, v_draft, 'bill', v_bill);
  return jsonb_build_object('id', v_bill, 'number', v_number, 'total', v_sub + v_tax_total);
end;
$$;

revoke all on function public.next_doc_number(uuid, text, date) from public, anon;
revoke all on function public.assert_open_period(uuid, date) from public, anon, authenticated;
revoke all on function public.account_id_for(uuid, text) from public, anon, authenticated;
revoke all on function public.inbox_mark_recorded(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.inbox_register_uploads(text, jsonb, text) from public, anon;
revoke all on function public.inbox_save_analysis(text, uuid, jsonb) from public, anon;
revoke all on function public.inbox_set_status(text, uuid[], text) from public, anon;
revoke all on function public.post_journal_entry(text, jsonb) from public, anon;
revoke all on function public.record_bill(text, jsonb) from public, anon;
grant execute on function public.next_doc_number(uuid, text, date) to authenticated;
grant execute on function public.inbox_register_uploads(text, jsonb, text) to authenticated;
grant execute on function public.inbox_save_analysis(text, uuid, jsonb) to authenticated;
grant execute on function public.inbox_set_status(text, uuid[], text) to authenticated;
grant execute on function public.post_journal_entry(text, jsonb) to authenticated;
grant execute on function public.record_bill(text, jsonb) to authenticated;
