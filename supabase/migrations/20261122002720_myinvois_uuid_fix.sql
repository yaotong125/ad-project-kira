-- Use built-in gen_random_uuid() instead of extensions.gen_random_bytes() inside search_path = public.

create or replace function public.submit_invoice_myinvois(p_slug text, p_invoice_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  o public.organizations;
  inv public.invoices;
  c public.contacts;
  v_lines jsonb;
  v_payload jsonb;
  v_errors text[] := array[]::text[];
  v_status text;
  v_lhdn_uuid text := null;
  v_long_id text := null;
  v_sub_uid text := 'SUB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
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

  if nullif(btrim(coalesce(o.tin, '')), '') is null then v_errors := array_append(v_errors, 'Supplier TIN is missing in Settings.'); end if;
  if nullif(btrim(coalesce(o.registration_number, '')), '') is null then v_errors := array_append(v_errors, 'Supplier BRN is missing in Settings.'); end if;
  if nullif(btrim(coalesce(c.tin, '')), '') is null then
    v_errors := array_append(v_errors, 'Buyer TIN is missing on customer contact (or use General Public EI00000000010).');
  end if;
  if nullif(btrim(coalesce(c.registration_number, '')), '') is null and coalesce(c.tin, '') <> 'EI00000000010' then
    v_errors := array_append(v_errors, 'Buyer BRN / NRIC is required for B2B e-Invoices.');
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

  if coalesce(array_length(v_errors, 1), 0) > 0 then
    v_status := 'rejected';
    v_rej := array_to_string(v_errors, ' ');
  else
    v_status := 'valid';
    v_lhdn_uuid := gen_random_uuid()::text;
    v_long_id := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 24));
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
