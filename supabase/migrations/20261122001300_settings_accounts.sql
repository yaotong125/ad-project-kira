-- Slice 15: Settings (Business profile, /{slug}/settings/profile) + Chart of accounts (/{slug}/accounts).
-- Reverse engineered from lejar.ai (2026-11-22, docs/re/15-settings-accounts.md).

-- ---------------------------------------------------------------------------------------------
-- Storage: private org-assets bucket for invoice logos and payment QR images (PNG/JPEG, 2 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('org-assets', 'org-assets', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

create function public.is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org and m.user_id = auth.uid() and m.role = 'owner');
$$;
revoke all on function public.is_org_owner(uuid) from public, anon;
grant execute on function public.is_org_owner(uuid) to authenticated;

create policy "org assets: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'org-assets' and public.is_org_member(public.storage_org_folder(name)));
create policy "org assets: owners insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'org-assets' and public.is_org_owner(public.storage_org_folder(name)));
create policy "org assets: owners update" on storage.objects
  for update to authenticated
  using (bucket_id = 'org-assets' and public.is_org_owner(public.storage_org_folder(name)));
create policy "org assets: owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'org-assets' and public.is_org_owner(public.storage_org_folder(name)));

-- ---------------------------------------------------------------------------------------------
-- Organization profile columns (observed on lejar.ai /settings/profile)
alter table public.organizations
  add column address text check (address is null or char_length(address) <= 500),
  add column postcode text check (postcode is null or char_length(postcode) <= 20),
  add column city text check (city is null or char_length(city) <= 100),
  add column state text check (state is null or char_length(state) <= 80),
  add column default_pricing_mode text not null default 'exclusive' check (default_pricing_mode in ('exclusive', 'inclusive')),
  add column phone text check (phone is null or char_length(phone) <= 30),
  add column msic_code text check (msic_code is null or msic_code ~ '^\d{5}$'),
  add column business_activity_description text check (business_activity_description is null or char_length(business_activity_description) <= 200),
  add column default_classification_code text check (default_classification_code is null or default_classification_code ~ '^\d{3}$'),
  add column myinvois_mandate_effective_on date,
  add column bank_name text check (bank_name is null or char_length(bank_name) <= 100),
  add column bank_account_name text check (bank_account_name is null or char_length(bank_account_name) <= 150),
  add column bank_account_number text check (bank_account_number is null or char_length(bank_account_number) <= 50),
  add column duitnow_id text check (duitnow_id is null or char_length(duitnow_id) <= 100),
  add column payment_note text check (payment_note is null or char_length(payment_note) <= 200),
  add column logo_path text,
  add column payment_qr_path text;

create function public.org_for_owner(p_slug text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select o.id into v_org from public.organizations o
  join public.organization_members m on m.org_id = o.id and m.user_id = auth.uid()
  where o.slug = p_slug and m.role = 'owner';
  if v_org is null then raise exception 'owner_only' using errcode = '42501'; end if;
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Settings RPCs (owner-only)
create function public.update_org_profile(p_slug text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
  v_legal text := btrim(coalesce(p_data->>'legalName', ''));
  v_reg_type text := coalesce(nullif(btrim(coalesce(p_data->>'registrationType', '')), ''), 'BRN');
  v_pricing text := coalesce(nullif(btrim(coalesce(p_data->>'defaultPricingMode', '')), ''), 'exclusive');
  v_msic text := nullif(btrim(coalesce(p_data->>'msicCode', '')), '');
  v_phone text := nullif(btrim(coalesce(p_data->>'phone', '')), '');
  v_phone_clean text := regexp_replace(coalesce(v_phone, ''), '[\s-]+', '', 'g');
  v_cls text := nullif(btrim(coalesce(p_data->>'defaultClassificationCode', '')), '');
  v_mandate_raw text := nullif(btrim(coalesce(p_data->>'myinvoisMandateEffectiveOn', '')), '');
  v_mandate date;
begin
  if char_length(v_legal) < 2 or char_length(v_legal) > 200 then
    raise exception 'invalid_legal_name' using errcode = '22023';
  end if;
  if v_reg_type not in ('BRN', 'NRIC', 'PASSPORT', 'ARMY') then
    raise exception 'invalid_registration_type' using errcode = '22023';
  end if;
  if v_pricing not in ('exclusive', 'inclusive') then
    raise exception 'invalid_pricing_mode' using errcode = '22023';
  end if;
  if v_msic is not null and v_msic !~ '^\d{5}$' then
    raise exception 'invalid_msic' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone_clean !~ '^\+?\d{8,20}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if v_cls is not null and v_cls !~ '^\d{3}$' then
    raise exception 'invalid_classification' using errcode = '22023';
  end if;
  if v_mandate_raw is not null then
    v_mandate := v_mandate_raw::date;
    if v_mandate < date '2024-08-01' then
      raise exception 'invalid_mandate_date' using errcode = '22023';
    end if;
  end if;

  update public.organizations set
    legal_name = v_legal,
    registration_type = v_reg_type,
    registration_number = nullif(btrim(coalesce(p_data->>'ssmNumber', '')), ''),
    sst_number = nullif(btrim(coalesce(p_data->>'sstNumber', '')), ''),
    tin = nullif(btrim(coalesce(p_data->>'tin', '')), ''),
    address = left(nullif(btrim(coalesce(p_data->>'address', '')), ''), 500),
    postcode = left(nullif(btrim(coalesce(p_data->>'postcode', '')), ''), 20),
    city = left(nullif(btrim(coalesce(p_data->>'city', '')), ''), 100),
    state = left(nullif(btrim(coalesce(p_data->>'state', '')), ''), 80),
    default_pricing_mode = v_pricing,
    phone = v_phone,
    msic_code = v_msic,
    business_activity_description = left(nullif(btrim(coalesce(p_data->>'businessActivityDescription', '')), ''), 200),
    default_classification_code = v_cls,
    myinvois_mandate_effective_on = v_mandate,
    bank_name = left(nullif(btrim(coalesce(p_data->>'bankName', '')), ''), 100),
    bank_account_name = left(nullif(btrim(coalesce(p_data->>'bankAccountName', '')), ''), 150),
    bank_account_number = left(nullif(btrim(coalesce(p_data->>'bankAccountNumber', '')), ''), 50),
    duitnow_id = left(nullif(btrim(coalesce(p_data->>'duitnowId', '')), ''), 100),
    payment_note = left(nullif(btrim(coalesce(p_data->>'paymentNote', '')), ''), 200)
  where id = v_org;
end;
$$;

create function public.set_org_asset(p_slug text, p_kind text, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
  v_clean text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if p_kind not in ('logo', 'payment_qr') then
    raise exception 'invalid_asset_kind' using errcode = '22023';
  end if;
  if v_clean is not null and left(v_clean, char_length(v_org::text) + 1) <> v_org::text || '/' then
    raise exception 'invalid_asset_path' using errcode = '22023';
  end if;
  if p_kind = 'logo' then
    update public.organizations set logo_path = v_clean where id = v_org;
  else
    update public.organizations set payment_qr_path = v_clean where id = v_org;
  end if;
end;
$$;

create function public.change_fiscal_year_end(p_slug text, p_fiscal_year_end date, p_books_start date, p_years jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_owner(p_slug);
  v_year jsonb;
  v_year_id uuid;
  v_period jsonb;
begin
  if p_fiscal_year_end is null or p_books_start is null or p_books_start >= p_fiscal_year_end then
    raise exception 'invalid_fiscal_dates' using errcode = '22023';
  end if;
  if exists (select 1 from public.journal_entries where org_id = v_org) then
    raise exception 'has_transactions' using errcode = '22023';
  end if;
  if exists (select 1 from public.accounting_periods where org_id = v_org and status <> 'open') then
    raise exception 'has_closed_periods' using errcode = '22023';
  end if;

  delete from public.fiscal_years where org_id = v_org;

  for v_year in select * from jsonb_array_elements(p_years) loop
    insert into public.fiscal_years (org_id, starts_on, ends_on)
    values (v_org, (v_year->>'starts_on')::date, (v_year->>'ends_on')::date)
    returning id into v_year_id;
    for v_period in select * from jsonb_array_elements(v_year->'periods') loop
      insert into public.accounting_periods (org_id, fiscal_year_id, starts_on, ends_on)
      values (v_org, v_year_id, (v_period->>'starts_on')::date, (v_period->>'ends_on')::date);
    end loop;
  end loop;

  update public.organizations
  set fiscal_year_end = p_fiscal_year_end, books_start = p_books_start
  where id = v_org;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Chart of Accounts helpers & RPCs
create function public.default_account_section(p_type text, p_subtype text) returns text
language sql immutable as $$
  select case
    when p_type in ('asset', 'contra_asset') and p_subtype = 'non_current' then 'fixed_asset'
    when p_type in ('asset', 'contra_asset') then 'current_asset'
    when p_type in ('liability', 'contra_liability') and p_subtype = 'non_current' then 'long_term_liability'
    when p_type in ('liability', 'contra_liability') then 'current_liability'
    when p_type = 'equity' then 'equity'
    when p_type = 'revenue' then 'sales'
    else 'operating_expense'
  end;
$$;

create function public.default_normal_balance(p_type text) returns text
language sql immutable as $$
  select case
    when p_type in ('asset', 'expense', 'contra_liability') then 'debit'
    else 'credit'
  end;
$$;

create function public.create_account(
  p_slug text, p_code text, p_name text, p_type text, p_subtype text, p_section text, p_normal_balance text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_code text := btrim(coalesce(p_code, ''));
  v_name text := btrim(coalesce(p_name, ''));
  v_sub text := nullif(btrim(coalesce(p_subtype, '')), '');
  v_sec text := nullif(btrim(coalesce(p_section, '')), '');
  v_nb text := nullif(btrim(coalesce(p_normal_balance, '')), '');
  v_id uuid;
begin
  if char_length(v_code) < 1 or char_length(v_code) > 30 then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_type not in ('asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_liability') then
    raise exception 'invalid_type' using errcode = '22023';
  end if;
  if p_type in ('asset', 'liability', 'contra_asset', 'contra_liability') then
    if v_sub is not null and v_sub not in ('current', 'non_current', 'cash') then
      raise exception 'invalid_subtype' using errcode = '22023';
    end if;
    if v_sub = 'cash' and p_type <> 'asset' then
      v_sub := 'current';
    end if;
  else
    v_sub := null;
  end if;
  if v_sec is null then
    v_sec := public.default_account_section(p_type, v_sub);
  end if;
  if v_nb is null or v_nb not in ('debit', 'credit') then
    v_nb := public.default_normal_balance(p_type);
  end if;

  insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash)
  values (v_org, v_code, v_name, p_type, v_sub, v_sec, v_nb, (p_type = 'asset' and v_sub = 'cash'))
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'duplicate_code' using errcode = '23505';
end;
$$;

create function public.create_fixed_asset_pair(p_slug text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_name text := btrim(coalesce(p_name, ''));
  v_i int;
  v_asset_code text;
  v_dep_code text;
  v_asset_id uuid;
  v_dep_id uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 100 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  for v_i in 1..99 loop
    v_asset_code := '200-' || lpad(v_i::text, 2, '0') || '00';
    v_dep_code := '200-' || lpad(v_i::text, 2, '0') || '05';
    if not exists (
      select 1 from public.accounts where org_id = v_org and code in (v_asset_code, v_dep_code)
    ) then
      exit;
    end if;
    v_asset_code := null;
  end loop;
  if v_asset_code is null then
    raise exception 'no_free_fa_code' using errcode = '22023';
  end if;

  insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash)
  values (v_org, v_asset_code, v_name, 'asset', 'non_current', 'fixed_asset', 'debit', false)
  returning id into v_asset_id;

  insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash, parent_id)
  values (v_org, v_dep_code, 'Accumulated Depreciation - ' || v_name, 'asset', 'non_current', 'fixed_asset', 'credit', false, v_asset_id)
  returning id into v_dep_id;

  return jsonb_build_object('assetId', v_asset_id, 'assetCode', v_asset_code, 'depId', v_dep_id, 'depCode', v_dep_code);
end;
$$;

create function public.update_account(p_slug text, p_id uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_a public.accounts;
  v_code text;
  v_name text;
  v_type text;
  v_sub text;
  v_sec text;
  v_nb text;
  v_cash boolean;
  v_status text;
begin
  select * into v_a from public.accounts where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;

  v_code := v_a.code;
  v_name := v_a.name;
  v_type := v_a.type;
  v_sub := v_a.subtype;
  v_sec := v_a.section;
  v_nb := v_a.normal_balance;
  v_cash := v_a.is_cash;
  v_status := v_a.status;

  if p_patch ? 'code' then
    v_code := btrim(coalesce(p_patch->>'code', ''));
    if char_length(v_code) < 1 or char_length(v_code) > 30 then
      raise exception 'invalid_code' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'name' then
    v_name := btrim(coalesce(p_patch->>'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'invalid_name' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'type' then
    v_type := p_patch->>'type';
    if v_type not in ('asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_liability') then
      raise exception 'invalid_type' using errcode = '22023';
    end if;
    if p_patch ? 'subtype' then
      v_sub := nullif(btrim(coalesce(p_patch->>'subtype', '')), '');
    elsif v_type not in ('asset', 'liability', 'contra_asset', 'contra_liability') then
      v_sub := null;
    end if;
    if v_type not in ('asset', 'liability', 'contra_asset', 'contra_liability') then
      v_sub := null;
    elsif v_sub = 'cash' and v_type <> 'asset' then
      v_sub := 'current';
    end if;
    v_cash := (v_type = 'asset' and v_sub = 'cash');
    if p_patch ? 'normalBalance' and (p_patch->>'normalBalance') in ('debit', 'credit') then
      v_nb := p_patch->>'normalBalance';
    else
      v_nb := public.default_normal_balance(v_type);
    end if;
    v_sec := public.default_account_section(v_type, v_sub);
  elsif p_patch ? 'subtype' then
    v_sub := nullif(btrim(coalesce(p_patch->>'subtype', '')), '');
    if v_type in ('asset', 'liability', 'contra_asset', 'contra_liability') then
      if v_sub is not null and v_sub not in ('current', 'non_current', 'cash') then
        raise exception 'invalid_subtype' using errcode = '22023';
      end if;
      v_cash := (v_type = 'asset' and v_sub = 'cash');
    else
      v_sub := null;
      v_cash := false;
    end if;
  end if;

  if p_patch ? 'section' then
    v_sec := nullif(btrim(coalesce(p_patch->>'section', '')), '');
    if v_sec is null then
      v_sec := public.default_account_section(v_type, v_sub);
    elsif v_sec not in ('fixed_asset', 'current_asset', 'current_liability', 'long_term_liability', 'equity', 'retained_earnings', 'sales', 'other_income', 'cost_of_sales', 'operating_expense', 'other_expense') then
      raise exception 'invalid_section' using errcode = '22023';
    end if;
  end if;

  if p_patch ? 'isCash' then
    if v_type <> 'asset' then raise exception 'cash_assets_only' using errcode = '22023'; end if;
    v_cash := (p_patch->>'isCash')::boolean;
    v_sub := case when v_cash then 'cash' else 'current' end;
  end if;

  if p_patch ? 'status' then
    v_status := p_patch->>'status';
    if v_status not in ('active', 'disabled') then raise exception 'invalid_status' using errcode = '22023'; end if;
  end if;

  update public.accounts set
    code = v_code,
    name = v_name,
    type = v_type,
    subtype = v_sub,
    section = v_sec,
    normal_balance = v_nb,
    is_cash = v_cash,
    status = v_status
  where id = v_a.id;
exception
  when unique_violation then
    raise exception 'duplicate_code' using errcode = '23505';
end;
$$;

create function public.delete_account(p_slug text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_a public.accounts;
begin
  select * into v_a from public.accounts where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if exists (select 1 from public.accounts where org_id = v_org and parent_id = v_a.id) then
    raise exception 'has_children' using errcode = '22023';
  end if;
  delete from public.accounts where id = v_a.id;
exception
  when foreign_key_violation then
    raise exception 'in_use' using errcode = '23503';
end;
$$;

revoke all on function public.org_for_owner(text) from public, anon, authenticated;
revoke all on function public.update_org_profile(text, jsonb) from public, anon;
revoke all on function public.set_org_asset(text, text, text) from public, anon;
revoke all on function public.change_fiscal_year_end(text, date, date, jsonb) from public, anon;
revoke all on function public.create_account(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.create_fixed_asset_pair(text, text) from public, anon;
revoke all on function public.update_account(text, uuid, jsonb) from public, anon;
revoke all on function public.delete_account(text, uuid) from public, anon;

grant execute on function public.update_org_profile(text, jsonb) to authenticated;
grant execute on function public.set_org_asset(text, text, text) to authenticated;
grant execute on function public.change_fiscal_year_end(text, date, date, jsonb) to authenticated;
grant execute on function public.create_account(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.create_fixed_asset_pair(text, text) to authenticated;
grant execute on function public.update_account(text, uuid, jsonb) to authenticated;
grant execute on function public.delete_account(text, uuid) to authenticated;
