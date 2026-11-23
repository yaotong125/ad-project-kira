-- Slice 6: Contacts (customers and suppliers), modelled on lejar.ai's /contacts (observed 2026-11-22,
-- docs/re/06-contacts.md). Extends the contacts table from slice 5 with Lejar's fields.

alter table public.contacts
  add column trade_classification text not null default 'trade' check (trade_classification in ('trade', 'non_trade')),
  add column tax_residency text not null default 'resident' check (tax_residency in ('resident', 'non_resident')),
  add column email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column address text check (address is null or char_length(address) <= 500),
  add column postcode text check (postcode is null or char_length(postcode) <= 10),
  add column state text check (state is null or state in (
    'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
    'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'W.P. Kuala Lumpur', 'W.P. Labuan', 'W.P. Putrajaya')),
  add column city text check (city is null or char_length(city) <= 100),
  add column sst_number text check (sst_number is null or char_length(sst_number) <= 40),
  add column registration_type text check (registration_type in ('BRN', 'NRIC', 'PASSPORT', 'ARMY')),
  add column default_payment_terms_days integer check (default_payment_terms_days is null or default_payment_terms_days between 0 and 3650),
  add column is_active boolean not null default true,
  add column updated_at timestamptz not null default now(),
  add constraint contacts_registration_pair check (
    (registration_type is null) = (registration_number is null)
    and (registration_type is distinct from 'NRIC' or registration_number ~ '^[0-9]{12}$'));

/** Normalises the contact fields from the form (blank → null). Raises Lejar's error codes. */
create function public.contact_fields(p jsonb) returns jsonb
language plpgsql immutable as $$
declare
  v_name text := btrim(coalesce(p->>'name', ''));
  v_terms text := nullif(btrim(coalesce(p->>'defaultPaymentTermsDays', '')), '');
  v_regtype text := nullif(btrim(coalesce(p->>'registrationType', '')), '');
  v_regno text := nullif(btrim(coalesce(p->>'registrationNumber', '')), '');
begin
  if char_length(v_name) < 2 then raise exception 'name_min' using errcode = '22023'; end if;
  if v_terms is not null and v_terms !~ '^[0-9]+$' then raise exception 'terms_whole' using errcode = '22023'; end if;
  if v_regtype is not null and v_regno is null then raise exception 'registration_number' using errcode = '22023'; end if;
  if v_regtype = 'NRIC' and v_regno !~ '^[0-9]{12}$' then raise exception 'nric' using errcode = '22023'; end if;
  return jsonb_build_object(
    'name', left(v_name, 200),
    'kind', coalesce(nullif(p->>'contactType', ''), 'customer'),
    'trade_classification', coalesce(nullif(p->>'tradeClassification', ''), 'trade'),
    'tax_residency', coalesce(nullif(p->>'taxResidency', ''), 'resident'),
    'tin', nullif(btrim(coalesce(p->>'taxIdentificationNumber', '')), ''),
    'email', nullif(btrim(coalesce(p->>'email', '')), ''),
    'phone', nullif(btrim(coalesce(p->>'phone', '')), ''),
    'address', nullif(btrim(coalesce(p->>'address', '')), ''),
    'postcode', nullif(btrim(coalesce(p->>'postcode', '')), ''),
    'state', nullif(btrim(coalesce(p->>'state', '')), ''),
    'city', nullif(btrim(coalesce(p->>'city', '')), ''),
    'sst_number', nullif(btrim(coalesce(p->>'sstNumber', '')), ''),
    'registration_type', case when v_regno is null then null else v_regtype end,
    'registration_number', case when v_regtype is null then null else v_regno end,
    'default_payment_terms_days', v_terms::int);
end;
$$;

/** lejar.ai's createContactAction. Saving a contact checks Learn section 2 ("add-contact"). */
create function public.create_contact(p_slug text, p_contact jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  f jsonb := public.contact_fields(p_contact);
  v_id uuid;
begin
  if exists (select 1 from public.contacts where org_id = v_org and lower(name) = lower(f->>'name')) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  insert into public.contacts (org_id, name, kind, trade_classification, tax_residency, tin, email, phone, address,
                               postcode, state, city, sst_number, registration_type, registration_number,
                               default_payment_terms_days)
  values (v_org, f->>'name', f->>'kind', f->>'trade_classification', f->>'tax_residency', f->>'tin', f->>'email',
          f->>'phone', f->>'address', f->>'postcode', f->>'state', f->>'city', f->>'sst_number',
          f->>'registration_type', f->>'registration_number', (f->>'default_payment_terms_days')::int)
  returning id into v_id;
  perform public.check_learn_section(v_org, 'add-contact');
  return v_id;
end;
$$;

/** lejar.ai's updateContactAction ("Save changes" on the contact page). */
create function public.update_contact(p_slug text, p_id uuid, p_contact jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  f jsonb := public.contact_fields(p_contact);
begin
  if exists (select 1 from public.contacts where org_id = v_org and lower(name) = lower(f->>'name') and id <> p_id) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  update public.contacts set
    name = f->>'name', kind = f->>'kind', trade_classification = f->>'trade_classification',
    tax_residency = f->>'tax_residency', tin = f->>'tin', email = f->>'email', phone = f->>'phone',
    address = f->>'address', postcode = f->>'postcode', state = f->>'state', city = f->>'city',
    sst_number = f->>'sst_number', registration_type = f->>'registration_type',
    registration_number = f->>'registration_number',
    default_payment_terms_days = (f->>'default_payment_terms_days')::int, updated_at = now()
  where id = p_id and org_id = v_org;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end;
$$;

/** lejar.ai's toggleContactActiveAction (Disable / Enable in the list). */
create function public.set_contact_active(p_slug text, p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  update public.contacts set is_active = p_active, updated_at = now() where id = p_id and org_id = v_org;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.create_contact(text, jsonb) from public, anon;
revoke all on function public.update_contact(text, uuid, jsonb) from public, anon;
revoke all on function public.set_contact_active(text, uuid, boolean) from public, anon;
grant execute on function public.create_contact(text, jsonb) to authenticated;
grant execute on function public.update_contact(text, uuid, jsonb) to authenticated;
grant execute on function public.set_contact_active(text, uuid, boolean) to authenticated;
