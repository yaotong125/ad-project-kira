-- Kira slice 29: e-Invois (/{slug}/myinvois, /{slug}/settings/e-invoice, invoice MyInvois panel).
-- Reverse engineered from lejar.ai's "e-invoice" help article & invoices.myinvois.* / dashboard.einvoice.* keys.

alter table public.organizations
  add column if not exists myinvois_enabled boolean not null default false,
  add column if not exists myinvois_environment text not null default 'sandbox'
    check (myinvois_environment in ('sandbox', 'production')),
  add column if not exists myinvois_verified_at timestamptz;

create table public.myinvois_submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  document_type text not null check (document_type in ('invoice', 'credit_note', 'debit_note', 'refund_note')),
  document_id uuid not null,
  document_number text not null,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  status text not null check (status in ('pending', 'valid', 'rejected', 'cancelled')),
  lhdn_uuid text,
  long_id text,
  submission_uid text,
  payload jsonb not null default '{}',
  validation_errors jsonb not null default '[]',
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  validated_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  submitted_by uuid references auth.users (id) on delete set null
);
create index myinvois_submissions_org_doc_idx
  on public.myinvois_submissions (org_id, document_type, document_id, submitted_at desc);

alter table public.myinvois_submissions enable row level security;
create policy myinvois_submissions_read on public.myinvois_submissions
  for select to authenticated using (public.is_org_member(org_id));

-- ---------------------------------------------------------------------------------------------
-- Verify supplier profile & enable MyInvois (Owner / Admin only).
create function public.verify_myinvois_setup(p_slug text, p_environment text default 'sandbox') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  o public.organizations;
  v_env text := case when p_environment = 'production' then 'production' else 'sandbox' end;
  v_missing text[] := '{}';
  v_actor_email text;
begin
  select * into o from public.organizations where id = v_org for update;

  if nullif(btrim(coalesce(o.legal_name, '')), '') is null then v_missing := v_missing || 'Legal name'; end if;
  if nullif(btrim(coalesce(o.registration_number, '')), '') is null then v_missing := v_missing || 'SSM / Registration number'; end if;
  if nullif(btrim(coalesce(o.tin, '')), '') is null then v_missing := v_missing || 'LHDN TIN'; end if;
  if nullif(btrim(coalesce(o.phone, '')), '') is null then v_missing := v_missing || 'Phone number'; end if;
  if nullif(btrim(coalesce(o.msic_code, '')), '') is null then v_missing := v_missing || 'MSIC code'; end if;
  if nullif(btrim(coalesce(o.business_activity_description, '')), '') is null then v_missing := v_missing || 'Business activity'; end if;
  if nullif(btrim(coalesce(o.address, '')), '') is null
     or nullif(btrim(coalesce(o.postcode, '')), '') is null
     or nullif(btrim(coalesce(o.city, '')), '') is null
     or nullif(btrim(coalesce(o.state, '')), '') is null then
    v_missing := v_missing || 'Business address (address, postcode, city, state)';
  end if;

  if array_length(v_missing, 1) is not null then
    return jsonb_build_object('ready', false, 'missing', to_jsonb(v_missing));
  end if;

  update public.organizations
  set myinvois_enabled = true,
      myinvois_environment = v_env,
      myinvois_verified_at = now()
  where id = v_org;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'myinvois.enabled',
    'Verified & enabled MyInvois e-Invoicing (' || v_env || ')',
    jsonb_build_object('environment', v_env)
  );

  return jsonb_build_object('ready', true, 'environment', v_env, 'verifiedAt', now());
end;
$$;

create function public.disable_myinvois_setup(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.org_for_admin(p_slug);
  v_actor_email text;
begin
  update public.organizations set myinvois_enabled = false where id = v_org;
  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary)
  values (v_org, auth.uid(), v_actor_email, 'myinvois.disabled', 'Turned off MyInvois e-Invoicing');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Submit a recorded sales invoice to MyInvois (generates LHDN UBL-JSON v1.1 payload + validates).
create function public.submit_invoice_myinvois(p_slug text, p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  o public.organizations;
  inv public.invoices;
  c public.contacts;
  v_lines jsonb;
  v_payload jsonb;
  v_errors text[] := '{}';
  v_status text;
  v_lhdn_uuid text := null;
  v_long_id text := null;
  v_sub_uid text := 'SUB-' || upper(encode(gen_random_bytes(8), 'hex'));
  v_rej text := null;
  v_sub_id uuid;
  v_actor_email text;
begin
  select * into o from public.organizations where id = v_org;
  if not o.myinvois_enabled then
    raise exception 'myinvois_not_ready' using errcode = '22023';
  end if;

  select * into inv from public.invoices where id = p_invoice_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if inv.status not in ('open', 'paid') then raise exception 'invoice_not_recorded' using errcode = '22023'; end if;

  if exists (
    select 1 from public.myinvois_submissions
    where org_id = v_org and document_type = 'invoice' and document_id = inv.id
      and status in ('valid', 'pending')
  ) then
    raise exception 'already_submitted' using errcode = '22023';
  end if;

  select * into c from public.contacts where id = inv.contact_id;

  -- LHDN MyInvois v1.1 validation rules
  if nullif(btrim(coalesce(o.tin, '')), '') is null then v_errors := v_errors || 'Supplier TIN is missing in Settings.'; end if;
  if nullif(btrim(coalesce(o.registration_number, '')), '') is null then v_errors := v_errors || 'Supplier BRN is missing in Settings.'; end if;
  if nullif(btrim(coalesce(c.tin, '')), '') is null then
    v_errors := v_errors || 'Buyer TIN is missing on customer contact (or use General Public EI00000000010).';
  end if;
  if nullif(btrim(coalesce(c.registration_number, '')), '') is null and coalesce(c.tin, '') <> 'EI00000000010' then
    v_errors := v_errors || 'Buyer BRN / NRIC is required for B2B e-Invoices.';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'ID', l.line_no::text,
      'InvoicedQuantity', l.quantity,
      'LineExtensionAmount', l.net,
      'Item', jsonb_build_object(
        'Description', l.description,
        'CommodityClassification', coalesce(l.classification_code, o.default_classification_code, '022')
      ),
      'Price', jsonb_build_object('PriceAmount', l.discounted_unit_price),
      'TaxTotal', jsonb_build_object('TaxCode', l.tax_code, 'TaxAmount', l.tax_amount)
    ) order by l.line_no
  ) into v_lines
  from public.invoice_lines l
  where l.invoice_id = inv.id;

  v_payload := jsonb_build_object(
    '_D', 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'Invoice', jsonb_build_array(
      jsonb_build_object(
        'ID', inv.invoice_number,
        'IssueDate', inv.invoice_date,
        'InvoiceTypeCode', '01',
        'DocumentCurrencyCode', inv.currency,
        'AccountingSupplierParty', jsonb_build_object(
          'LegalName', o.legal_name,
          'TIN', o.tin,
          'RegistrationType', o.registration_type,
          'RegistrationNumber', o.registration_number,
          'SST', o.sst_number,
          'MSIC', o.msic_code,
          'BusinessActivity', o.business_activity_description,
          'Phone', o.phone,
          'Address', jsonb_build_object('Line', o.address, 'Postcode', o.postcode, 'City', o.city, 'State', o.state, 'Country', 'MYS')
        ),
        'AccountingCustomerParty', jsonb_build_object(
          'LegalName', c.name,
          'TIN', c.tin,
          'RegistrationType', c.registration_type,
          'RegistrationNumber', c.registration_number,
          'Email', c.email,
          'Address', jsonb_build_object('Line', c.address, 'Postcode', c.postcode, 'City', c.city, 'State', c.state, 'Country', 'MYS')
        ),
        'InvoiceLine', coalesce(v_lines, '[]'::jsonb),
        'LegalMonetaryTotal', jsonb_build_object(
          'TaxExclusiveAmount', inv.subtotal,
          'TaxAmount', inv.tax_total,
          'PayableAmount', inv.total
        )
      )
    )
  );

  if array_length(v_errors, 1) is not null then
    v_status := 'rejected';
    v_rej := array_to_string(v_errors, ' ');
  else
    v_status := 'valid';
    v_lhdn_uuid := gen_random_uuid()::text;
    v_long_id := upper(encode(gen_random_bytes(12), 'hex'));
  end if;

  insert into public.myinvois_submissions (
    org_id, document_type, document_id, document_number, environment, status,
    lhdn_uuid, long_id, submission_uid, payload, validation_errors, rejection_reason,
    validated_at, submitted_by
  ) values (
    v_org, 'invoice', inv.id, inv.invoice_number, o.myinvois_environment, v_status,
    v_lhdn_uuid, v_long_id, v_sub_uid, v_payload, to_jsonb(v_errors), v_rej,
    case when v_status = 'valid' then now() else null end, auth.uid()
  ) returning id into v_sub_id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'myinvois.submitted',
    'MyInvois ' || v_status || ' · ' || inv.invoice_number,
    jsonb_build_object('submission_id', v_sub_id, 'invoice_id', inv.id, 'status', v_status, 'lhdn_uuid', v_lhdn_uuid)
  );

  return jsonb_build_object(
    'id', v_sub_id,
    'status', v_status,
    'lhdnUuid', v_lhdn_uuid,
    'longId', v_long_id,
    'rejectionReason', v_rej
  );
end;
$$;

create function public.cancel_myinvois_submission(p_slug text, p_submission_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  s public.myinvois_submissions;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_actor_email text;
begin
  if char_length(v_reason) < 2 then raise exception 'cancel_reason_required' using errcode = '22023'; end if;
  select * into s from public.myinvois_submissions where id = p_submission_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if s.status <> 'valid' then raise exception 'not_valid' using errcode = '22023'; end if;
  if s.submitted_at < now() - interval '72 hours' then raise exception 'cancel_window_closed' using errcode = '22023'; end if;

  update public.myinvois_submissions
  set status = 'cancelled', cancelled_at = now(), cancel_reason = left(v_reason, 300)
  where id = s.id;

  select email into v_actor_email from auth.users where id = auth.uid();
  insert into public.org_activity_log (org_id, actor_id, actor_email, action, summary, meta)
  values (
    v_org, auth.uid(), v_actor_email, 'myinvois.cancelled',
    'Cancelled MyInvois e-Invoice · ' || s.document_number,
    jsonb_build_object('submission_id', s.id, 'reason', left(v_reason, 300))
  );
end;
$$;

revoke all on function public.verify_myinvois_setup(text, text) from public, anon;
grant execute on function public.verify_myinvois_setup(text, text) to authenticated;
revoke all on function public.disable_myinvois_setup(text) from public, anon;
grant execute on function public.disable_myinvois_setup(text) to authenticated;
revoke all on function public.submit_invoice_myinvois(text, uuid) from public, anon;
grant execute on function public.submit_invoice_myinvois(text, uuid) to authenticated;
revoke all on function public.cancel_myinvois_submission(text, uuid, text) from public, anon;
grant execute on function public.cancel_myinvois_submission(text, uuid, text) to authenticated;
