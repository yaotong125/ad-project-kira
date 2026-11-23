-- Fix contacts insert inside save_quick_invoice and mark_quick_invoice_sent (contacts has no created_by column).

create or replace function public.save_quick_invoice(p_slug text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_contact_id uuid := nullif(p->>'customerContactId', '')::uuid;
  v_customer_name text := btrim(coalesce(p->>'customerName', ''));
  v_customer_email text := nullif(lower(btrim(coalesce(p->>'customerEmail', ''))), '');
  v_save_customer boolean := coalesce((p->>'saveCustomer')::boolean, false);
  v_date date := nullif(p->>'invoiceDate', '')::date;
  v_due date := nullif(p->>'dueDate', '')::date;
  v_mode text := coalesce(nullif(p->>'pricingMode', ''), 'exclusive');
  v_income_code text := btrim(coalesce(nullif(p->>'incomeAccountCode', ''), '600-0100'));
  v_notes text := nullif(btrim(coalesce(p->>'notes', '')), '');
  v_number text := nullif(btrim(coalesce(p->>'invoiceNumber', '')), '');
  v_existing public.quick_invoices;
  v_lines jsonb := coalesce(p->'lines', '[]'::jsonb);
  v_line jsonb;
  v_idx int := 0;
  v_desc text;
  v_qty numeric;
  v_price numeric;
  v_dmode text;
  v_dpct numeric;
  v_damt numeric;
  v_dprice numeric;
  v_eff_price numeric;
  v_amt numeric;
  v_tcode text;
  v_rate numeric;
  v_net numeric;
  v_tax numeric;
  v_sub numeric := 0;
  v_tax_tot numeric := 0;
  v_tot numeric := 0;
begin
  if v_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  if v_due is not null and v_due < v_date then raise exception 'due_before_date' using errcode = '22023'; end if;
  if v_mode not in ('exclusive', 'inclusive') then v_mode := 'exclusive'; end if;
  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then
    raise exception 'one_line' using errcode = '22023';
  end if;

  if v_contact_id is not null then
    select name into v_customer_name from public.contacts where id = v_contact_id and org_id = v_org;
    if not found then raise exception 'unknown_customer' using errcode = '22023'; end if;
  else
    if char_length(v_customer_name) < 1 then raise exception 'customer_required' using errcode = '22023'; end if;
    select id into v_contact_id from public.contacts
    where org_id = v_org and lower(name) = lower(v_customer_name) and kind in ('customer', 'both')
    limit 1;
    if v_contact_id is null and v_save_customer then
      insert into public.contacts (org_id, name, kind, email)
      values (v_org, left(v_customer_name, 200), 'customer', v_customer_email)
      returning id into v_contact_id;
    end if;
  end if;

  if exists (select 1 from public.accounts where org_id = v_org and code = v_income_code and type = 'revenue' and status = 'active') then
    update public.organizations set default_income_account_code = v_income_code where id = v_org;
  else
    select code into v_income_code from public.accounts
    where org_id = v_org and type = 'revenue' and status = 'active'
    order by case when code = '600-0100' then 0 else 1 end, code limit 1;
    if v_income_code is null then raise exception 'unknown_account' using errcode = '22023'; end if;
  end if;

  if v_id is not null then
    select * into v_existing from public.quick_invoices where id = v_id and org_id = v_org for update;
    if not found then raise exception 'not_found' using errcode = '22023'; end if;
    if v_existing.status <> 'draft' then raise exception 'not_draft' using errcode = '22023'; end if;
    v_number := coalesce(v_number, v_existing.invoice_number);
    delete from public.quick_invoice_lines where quick_invoice_id = v_id;
  else
    v_number := coalesce(v_number, public.next_quick_invoice_number(v_org, v_date));
    insert into public.quick_invoices (
      org_id, contact_id, customer_name, customer_email, invoice_number, invoice_date, due_date,
      pricing_mode, income_account_code, notes, created_by
    ) values (
      v_org, v_contact_id, left(v_customer_name, 200), v_customer_email, v_number, v_date, v_due,
      v_mode, v_income_code, left(v_notes, 1000), auth.uid()
    ) returning id into v_id;
  end if;

  for v_line in select * from jsonb_array_elements(v_lines) loop
    v_idx := v_idx + 1;
    v_desc := btrim(coalesce(v_line->>'description', ''));
    if char_length(v_desc) < 1 then raise exception 'line_description' using errcode = '22023'; end if;
    v_qty := nullif(v_line->>'quantity', '')::numeric;
    v_price := nullif(v_line->>'unitPrice', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'quantity_positive' using errcode = '22023'; end if;
    if v_price is null or v_price < 0 then raise exception 'amount_format' using errcode = '22023'; end if;

    v_dmode := nullif(v_line->>'discountMode', '');
    v_dpct := null;
    v_eff_price := round(v_price, 2);
    if v_dmode = 'percent' then
      v_dpct := coalesce(nullif(v_line->>'discountPercent', '')::numeric, 0);
      if v_dpct < 0 or v_dpct > 100 then raise exception 'discount_format' using errcode = '22023'; end if;
      v_eff_price := round(v_price * (1 - v_dpct / 100), 2);
    elsif v_dmode = 'amount' then
      v_damt := coalesce(nullif(v_line->>'discountAmount', '')::numeric, 0);
      if v_damt < 0 or v_damt > v_price then raise exception 'discount_format' using errcode = '22023'; end if;
      v_eff_price := round(v_price - v_damt, 2);
    elsif v_dmode = 'price' then
      v_dprice := coalesce(nullif(v_line->>'discountedUnitPrice', '')::numeric, v_price);
      if v_dprice < 0 or v_dprice > v_price then raise exception 'discount_format' using errcode = '22023'; end if;
      v_eff_price := round(v_dprice, 2);
    else
      v_dmode := null;
    end if;

    v_amt := round(v_qty * v_eff_price, 2);
    v_tcode := coalesce(nullif(v_line->>'taxCode', ''), 'none');
    if v_tcode not in ('none', 'sst_6', 'sst_8', 'sales_5', 'sales_10', 'exempt') then v_tcode := 'none'; end if;
    v_rate := case v_tcode
      when 'sst_6' then 6
      when 'sst_8' then 8
      when 'sales_5' then 5
      when 'sales_10' then 10
      else 0
    end;

    if v_rate = 0 then
      v_net := v_amt;
      v_tax := 0;
    elsif v_mode = 'inclusive' then
      v_tax := round(v_amt * v_rate / (100 + v_rate), 2);
      v_net := v_amt - v_tax;
    else
      v_net := v_amt;
      v_tax := round(v_amt * v_rate / 100, 2);
    end if;

    insert into public.quick_invoice_lines (
      quick_invoice_id, line_no, org_id, description, quantity, unit_price,
      discount_mode, discount_percent, discounted_unit_price, amount, net, tax_code, tax_amount
    ) values (
      v_id, v_idx, v_org, left(v_desc, 300), v_qty, round(v_price, 2),
      v_dmode, v_dpct, v_eff_price, v_amt, v_net, v_tcode, v_tax
    );

    v_sub := v_sub + v_net;
    v_tax_tot := v_tax_tot + v_tax;
    v_tot := v_tot + v_net + v_tax;
  end loop;

  update public.quick_invoices
  set contact_id = v_contact_id,
      customer_name = left(v_customer_name, 200),
      customer_email = v_customer_email,
      invoice_number = v_number,
      invoice_date = v_date,
      due_date = v_due,
      pricing_mode = v_mode,
      income_account_code = v_income_code,
      notes = left(v_notes, 1000),
      subtotal = v_sub,
      tax_total = v_tax_tot,
      total = v_tot,
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('id', v_id, 'number', v_number, 'status', 'draft');
end;
$$;

create or replace function public.mark_quick_invoice_sent(p_slug text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  qi public.quick_invoices;
  v_contact_id uuid;
  v_acct_id uuid;
  v_inv_number text;
  v_inv_id uuid;
  v_l public.quick_invoice_lines;
  v_tax_code text;
begin
  select * into qi from public.quick_invoices where id = p_id and org_id = v_org for update;
  if not found then raise exception 'not_found' using errcode = '22023'; end if;
  if qi.status <> 'draft' then raise exception 'already_sent' using errcode = '22023'; end if;

  v_contact_id := qi.contact_id;
  if v_contact_id is null then
    select id into v_contact_id from public.contacts
    where org_id = v_org and lower(name) = lower(qi.customer_name) and kind in ('customer', 'both')
    limit 1;
  end if;
  if v_contact_id is null then
    insert into public.contacts (org_id, name, kind, email)
    values (v_org, qi.customer_name, 'customer', qi.customer_email)
    returning id into v_contact_id;
  end if;

  select id into v_acct_id from public.accounts
  where org_id = v_org and code = qi.income_account_code and type = 'revenue' and status = 'active'
  limit 1;
  if v_acct_id is null then
    select id into v_acct_id from public.accounts
    where org_id = v_org and type = 'revenue' and status = 'active'
    order by case when code = '600-0100' then 0 else 1 end, code limit 1;
  end if;
  if v_acct_id is null then raise exception 'unknown_account' using errcode = '22023'; end if;

  v_inv_number := public.next_doc_number(v_org, 'INV', qi.invoice_date);

  insert into public.invoices (
    org_id, contact_id, invoice_number, invoice_date, due_date, currency, pricing_mode,
    status, notes, subtotal, tax_total, total, created_by
  ) values (
    v_org, v_contact_id, v_inv_number, qi.invoice_date, qi.due_date, 'MYR', qi.pricing_mode,
    'draft',
    nullif(btrim(coalesce('Quick invoice ' || qi.invoice_number || coalesce(E'\n' || qi.notes, ''), '')), ''),
    qi.subtotal, qi.tax_total, qi.total, auth.uid()
  ) returning id into v_inv_id;

  for v_l in select * from public.quick_invoice_lines where quick_invoice_id = qi.id order by line_no loop
    v_tax_code := case when v_l.tax_code = 'exempt' then 'none' else v_l.tax_code end;
    insert into public.invoice_lines (
      invoice_id, line_no, org_id, description, account_id, quantity, unit_price,
      discount_mode, discount_percent, discounted_unit_price, amount, net, tax_code, tax_amount
    ) values (
      v_inv_id, v_l.line_no, v_org, v_l.description, v_acct_id, v_l.quantity, v_l.unit_price,
      v_l.discount_mode, v_l.discount_percent, v_l.discounted_unit_price, v_l.amount, v_l.net,
      v_tax_code, v_l.tax_amount
    );
  end loop;

  update public.quick_invoices
  set status = 'sent',
      sent_at = now(),
      contact_id = v_contact_id,
      linked_invoice_id = v_inv_id,
      updated_at = now()
  where id = qi.id;

  return jsonb_build_object('id', qi.id, 'invoiceId', v_inv_id, 'invoiceNumber', v_inv_number);
end;
$$;
