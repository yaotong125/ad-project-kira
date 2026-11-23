-- Kira slice 3: company setup (/new-org).
-- Reverse engineered from lejar.ai/new-org (2026-11-22): see docs/re/03-new-org.md.
-- Creates organisations (entities), memberships, financial years, accounting periods and the
-- chart of accounts, plus create_organization(), which does it all in one transaction.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  legal_name text not null check (char_length(legal_name) between 2 and 200),
  entity_type text not null check (entity_type in ('sole_prop', 'partnership', 'llp', 'sdn_bhd')),
  fiscal_year_end date not null,
  cadence text not null check (cadence in ('bimonthly', 'monthly', 'quarterly')),
  chart_mode text not null check (chart_mode in ('standard', 'migrating')),
  books_start date not null,
  registration_type text not null default 'BRN' check (registration_type in ('BRN', 'NRIC', 'PASSPORT', 'ARMY')),
  registration_number text,
  sst_number text,
  tin text,
  acquisition_channel text,
  acquisition_detail text check (acquisition_detail is null or char_length(acquisition_detail) <= 200),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.organization_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

create table public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  locked boolean not null default false,
  check (starts_on < ends_on),
  unique (org_id, starts_on)
);

create table public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  fiscal_year_id uuid not null references public.fiscal_years (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closing', 'closed')),
  check (starts_on <= ends_on),
  unique (org_id, starts_on)
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_liability')),
  subtype text check (subtype in ('current', 'non_current', 'cash')),
  section text not null,
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  is_cash boolean not null default false,
  parent_id uuid references public.accounts (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

-- Lejar's "Standard Malaysian chart of accounts" (MPERS-aligned). Rows with entity_types = null
-- apply to every business type. observed = recorded from lejar.ai (one test entity per business type, 2026-11-22).
create table public.chart_template (
  entity_types text[],
  code text not null,
  name text not null,
  type text not null,
  subtype text,
  section text not null,
  normal_balance text not null,
  is_cash boolean not null,
  parent_code text,
  sort_order int not null,
  observed boolean not null
);

insert into public.chart_template
  (entity_types, code, name, type, subtype, section, normal_balance, is_cash, parent_code, sort_order, observed)
values
  (null, '1000', 'Assets', 'asset', null, 'current_asset', 'debit', false, null, 10, true),
  (null, '200-0000', 'Property, Plant and Equipment', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 20, true),
  (null, '200-0100', 'Land and Buildings', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 30, true),
  (null, '200-0105', 'Accumulated Depreciation - Land and Buildings', 'asset', 'non_current', 'fixed_asset', 'credit', false, '200-0100', 40, true),
  (null, '200-0200', 'Furniture, Fittings and Office Equipment', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 50, true),
  (null, '200-0205', 'Accumulated Depreciation - Furniture, Fittings and Office Equipment', 'asset', 'non_current', 'fixed_asset', 'credit', false, '200-0200', 60, true),
  (null, '200-0300', 'Computer Equipment', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 70, true),
  (null, '200-0305', 'Accumulated Depreciation - Computer Equipment', 'asset', 'non_current', 'fixed_asset', 'credit', false, '200-0300', 80, true),
  (null, '200-0400', 'Motor Vehicles', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 90, true),
  (null, '200-0405', 'Accumulated Depreciation - Motor Vehicles', 'asset', 'non_current', 'fixed_asset', 'credit', false, '200-0400', 100, true),
  (null, '200-0500', 'Renovation and Leasehold Improvements', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 110, true),
  (null, '200-0505', 'Accumulated Depreciation - Renovation and Leasehold Improvements', 'asset', 'non_current', 'fixed_asset', 'credit', false, '200-0500', 120, true),
  (null, '200-0700', 'Other Non-Current Assets', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 130, true),
  (null, '200-0800', 'Director Loan Receivable', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 140, true),
  (null, '200-0900', 'Deferred Tax Asset', 'asset', 'non_current', 'fixed_asset', 'debit', false, null, 150, true),
  (null, '300-0000', 'Current Assets', 'asset', 'current', 'current_asset', 'debit', false, null, 160, true),
  (null, '300-0100', 'Inventory', 'asset', 'current', 'current_asset', 'debit', false, null, 170, true),
  (null, '300-0200', 'Trade Receivables', 'asset', 'current', 'current_asset', 'debit', false, null, 180, true),
  (null, '300-0400', 'Other Receivables', 'asset', 'current', 'current_asset', 'debit', false, null, 190, true),
  (null, '300-0500', 'Prepayments', 'asset', 'current', 'current_asset', 'debit', false, null, 200, true),
  (null, '300-0600', 'Deposits', 'asset', 'current', 'current_asset', 'debit', false, null, 210, true),
  (null, '300-0700', 'Amount Due from Directors', 'asset', 'current', 'current_asset', 'debit', false, null, 220, true),
  (null, '300-0800', 'Tax Recoverable', 'asset', 'current', 'current_asset', 'debit', false, null, 230, true),
  (null, '300-0900', 'Cash and Bank Balances', 'asset', 'cash', 'current_asset', 'debit', true, null, 240, true),
  (null, '300-1000', 'Cash in Hand and Petty Cash', 'asset', 'cash', 'current_asset', 'debit', true, null, 250, true),
  (null, '300-1100', 'Current and Savings Accounts', 'asset', 'cash', 'current_asset', 'debit', true, null, 260, true),
  (null, '300-1200', 'Fixed Deposits', 'asset', 'current', 'current_asset', 'debit', false, null, 270, true),
  (null, '300-0305', 'Allowance for Doubtful Debts', 'contra_asset', 'current', 'current_asset', 'credit', false, null, 280, true),
  (null, '2000', 'Liabilities', 'liability', null, 'current_liability', 'credit', false, null, 290, true),
  (null, '400-0000', 'Current Liabilities', 'liability', 'current', 'current_liability', 'credit', false, null, 300, true),
  (null, '400-0100', 'Trade Payables', 'liability', 'current', 'current_liability', 'credit', false, null, 310, true),
  (null, '400-0200', 'Other Payables', 'liability', 'current', 'current_liability', 'credit', false, null, 320, true),
  (null, '400-0300', 'Accruals', 'liability', 'current', 'current_liability', 'credit', false, null, 330, true),
  (null, '400-0400', 'Amount Due to Directors', 'liability', 'current', 'current_liability', 'credit', false, null, 340, true),
  (null, '400-0500', 'Statutory Payables', 'liability', 'current', 'current_liability', 'credit', false, null, 350, true),
  (null, '400-0600', 'EPF Payable', 'liability', 'current', 'current_liability', 'credit', false, null, 360, true),
  (null, '400-0700', 'SOCSO Payable', 'liability', 'current', 'current_liability', 'credit', false, null, 370, true),
  (null, '400-0800', 'EIS Payable', 'liability', 'current', 'current_liability', 'credit', false, null, 380, true),
  (null, '400-0900', 'PCB / MTD Payable', 'liability', 'current', 'current_liability', 'credit', false, null, 390, true),
  (null, '400-1000', 'HRDF Payable', 'liability', 'current', 'current_liability', 'credit', false, null, 400, true),
  (null, '400-1100', 'Withholding Tax Payable', 'liability', 'current', 'current_liability', 'credit', false, null, 410, true),
  (null, '400-1200', 'SST Payable', 'liability', 'current', 'current_liability', 'credit', false, null, 420, true),
  (null, '400-1300', 'SST Output Tax', 'liability', 'current', 'current_liability', 'credit', false, null, 430, true),
  (null, '400-1500', 'Provision for Income Tax', 'liability', 'current', 'current_liability', 'credit', false, null, 440, true),
  (null, '400-1600', 'Customer Deposits', 'liability', 'current', 'current_liability', 'credit', false, null, 450, true),
  (null, '400-1700', 'Deferred SST on unpaid invoices', 'liability', 'current', 'current_liability', 'credit', false, null, 460, true),
  (null, '500-0000', 'Non-Current Liabilities', 'liability', 'non_current', 'long_term_liability', 'credit', false, null, 470, true),
  (null, '500-0100', 'Hire Purchase Payable', 'liability', 'non_current', 'long_term_liability', 'credit', false, null, 480, true),
  (null, '500-0200', 'Bank Term Loans', 'liability', 'non_current', 'long_term_liability', 'credit', false, null, 490, true),
  (null, '500-0300', 'Director Loan Payable', 'liability', 'non_current', 'long_term_liability', 'credit', false, null, 500, true),
  (null, '500-0400', 'Deferred Tax Liability', 'liability', 'non_current', 'long_term_liability', 'credit', false, null, 510, true),
  (null, '400-1400', 'SST Input Tax', 'contra_liability', 'current', 'current_liability', 'debit', false, null, 520, true),
  (array['sdn_bhd']::text[], '100-0000', 'Equity', 'equity', null, 'equity', 'credit', false, null, 530, true),
  (array['sdn_bhd']::text[], '100-0100', 'Share Capital', 'equity', null, 'equity', 'credit', false, null, 540, true),
  (array['sdn_bhd']::text[], '100-0200', 'Ordinary Share Capital', 'equity', null, 'equity', 'credit', false, null, 550, true),
  (array['sdn_bhd']::text[], '100-0300', 'Reserves', 'equity', null, 'equity', 'credit', false, null, 560, true),
  (array['sdn_bhd']::text[], '100-0400', 'Retained Earnings', 'equity', null, 'retained_earnings', 'credit', false, null, 570, true),
  (array['sdn_bhd']::text[], '100-0500', 'Dividends Declared', 'equity', null, 'equity', 'debit', false, null, 580, true),
  (null, '600-0000', 'Revenue', 'revenue', null, 'sales', 'credit', false, null, 590, true),
  (null, '600-0100', 'Sales of Goods', 'revenue', null, 'sales', 'credit', false, null, 600, true),
  (null, '600-0200', 'Service Revenue', 'revenue', null, 'sales', 'credit', false, null, 610, true),
  (null, '600-0300', 'Project and Contract Revenue', 'revenue', null, 'sales', 'credit', false, null, 620, true),
  (null, '600-0400', 'Sales Returns and Discounts', 'revenue', null, 'sales', 'debit', false, null, 630, true),
  (null, '900-0100', 'Other Income', 'revenue', null, 'other_income', 'credit', false, null, 640, true),
  (null, '900-0200', 'Interest Income', 'revenue', null, 'other_income', 'credit', false, null, 650, true),
  (null, '900-0300', 'Rental Income', 'revenue', null, 'other_income', 'credit', false, null, 660, true),
  (null, '900-0400', 'Gain on Disposal of Assets', 'revenue', null, 'other_income', 'credit', false, null, 670, true),
  (null, '700-0000', 'Cost of Sales', 'expense', null, 'cost_of_sales', 'debit', false, null, 680, true),
  (null, '700-0100', 'Purchases', 'expense', null, 'cost_of_sales', 'debit', false, null, 690, true),
  (null, '700-0200', 'Purchase Returns and Discounts', 'expense', null, 'cost_of_sales', 'credit', false, null, 700, true),
  (null, '700-0300', 'Subcontractor Costs', 'expense', null, 'cost_of_sales', 'debit', false, null, 710, true),
  (null, '800-0000', 'Operating Expenses', 'expense', null, 'operating_expense', 'debit', false, null, 720, true),
  (null, '800-0100', 'Staff Costs', 'expense', null, 'operating_expense', 'debit', false, null, 730, true),
  (null, '800-0200', 'Salaries and Wages', 'expense', null, 'operating_expense', 'debit', false, null, 740, true),
  (null, '800-0300', 'Directors Remuneration', 'expense', null, 'operating_expense', 'debit', false, null, 750, true),
  (null, '800-0400', 'EPF - Employer Contribution', 'expense', null, 'operating_expense', 'debit', false, null, 760, true),
  (null, '800-0500', 'SOCSO and EIS - Employer Contribution', 'expense', null, 'operating_expense', 'debit', false, null, 770, true),
  (null, '800-0600', 'HRDF Levy', 'expense', null, 'operating_expense', 'debit', false, null, 780, true),
  (null, '800-0700', 'Premises Costs', 'expense', null, 'operating_expense', 'debit', false, null, 790, true),
  (null, '800-0800', 'Rental of Premises', 'expense', null, 'operating_expense', 'debit', false, null, 800, true),
  (null, '800-0900', 'Utilities', 'expense', null, 'operating_expense', 'debit', false, null, 810, true),
  (null, '800-1000', 'Repairs and Maintenance', 'expense', null, 'operating_expense', 'debit', false, null, 820, true),
  (null, '800-1100', 'Administrative Expenses', 'expense', null, 'operating_expense', 'debit', false, null, 830, true),
  (null, '800-1200', 'Office Supplies and Printing', 'expense', null, 'operating_expense', 'debit', false, null, 840, true),
  (null, '800-1300', 'Telephone and Internet', 'expense', null, 'operating_expense', 'debit', false, null, 850, true),
  (null, '800-1400', 'Travelling and Accommodation', 'expense', null, 'operating_expense', 'debit', false, null, 860, true),
  (null, '800-1500', 'Motor Vehicle Running Expenses', 'expense', null, 'operating_expense', 'debit', false, null, 870, true),
  (null, '800-1600', 'Professional and Compliance Fees', 'expense', null, 'operating_expense', 'debit', false, null, 880, true),
  (null, '800-1700', 'Audit Fees', 'expense', null, 'operating_expense', 'debit', false, null, 890, true),
  (null, '800-1800', 'Tax Agent Fees', 'expense', null, 'operating_expense', 'debit', false, null, 900, true),
  (null, '800-1900', 'Accounting and Secretarial Fees', 'expense', null, 'operating_expense', 'debit', false, null, 910, true),
  (null, '800-2000', 'Selling and Marketing Expenses', 'expense', null, 'operating_expense', 'debit', false, null, 920, true),
  (null, '800-2100', 'Advertising and Promotion', 'expense', null, 'operating_expense', 'debit', false, null, 930, true),
  (null, '800-2200', 'Commission Paid', 'expense', null, 'operating_expense', 'debit', false, null, 940, true),
  (null, '800-2300', 'Depreciation', 'expense', null, 'operating_expense', 'debit', false, null, 950, true),
  (null, '800-2400', 'Depreciation of Property, Plant and Equipment', 'expense', null, 'operating_expense', 'debit', false, null, 960, true),
  (null, '800-2500', 'Other Operating Expenses', 'expense', null, 'operating_expense', 'debit', false, null, 970, true),
  (null, '800-2600', 'Bad Debts Written Off', 'expense', null, 'operating_expense', 'debit', false, null, 980, true),
  (null, '800-2700', 'Allowance for Doubtful Debts', 'expense', null, 'operating_expense', 'debit', false, null, 990, true),
  (null, '800-2800', 'Withholding Tax Expense', 'expense', null, 'operating_expense', 'debit', false, null, 1000, true),
  (null, '900-0000', 'Other Income, Finance Costs and Taxation', 'expense', null, 'operating_expense', 'debit', false, null, 1010, true),
  (null, '900-0500', 'Finance Costs', 'expense', null, 'operating_expense', 'debit', false, null, 1020, true),
  (null, '900-0600', 'Bank Charges', 'expense', null, 'operating_expense', 'debit', false, null, 1030, true),
  (null, '900-0700', 'Interest on Borrowings', 'expense', null, 'operating_expense', 'debit', false, null, 1040, true),
  (null, '900-0800', 'Taxation', 'expense', null, 'operating_expense', 'debit', false, null, 1050, true),
  (null, '900-0900', 'Income Tax Expense - Current', 'expense', null, 'operating_expense', 'debit', false, null, 1060, true),
  (null, '900-1000', 'Income Tax Expense - Deferred', 'expense', null, 'operating_expense', 'debit', false, null, 1070, true),
  (array['sole_prop']::text[], '100-0000', 'Owner''s Equity', 'equity', null, 'equity', 'credit', false, null, 1080, true),
  (array['sole_prop']::text[], '100-0100', 'Owner''s Capital', 'equity', null, 'equity', 'credit', false, null, 1090, true),
  (array['sole_prop']::text[], '100-0200', 'Accumulated Profits', 'equity', null, 'retained_earnings', 'credit', false, null, 1100, true),
  (array['sole_prop']::text[], '100-0300', 'Owner''s Drawings', 'equity', null, 'equity', 'debit', false, null, 1110, true),
  (array['partnership']::text[], '100-0000', 'Partners'' Equity', 'equity', null, 'equity', 'credit', false, null, 1120, true),
  (array['partnership']::text[], '100-0100', 'Partners'' Capital Accounts', 'equity', null, 'equity', 'credit', false, null, 1130, true),
  (array['partnership']::text[], '100-0200', 'Partners'' Current Accounts', 'equity', null, 'equity', 'credit', false, null, 1140, true),
  (array['partnership']::text[], '100-0300', 'Undistributed Profits', 'equity', null, 'retained_earnings', 'credit', false, null, 1150, true),
  (array['partnership']::text[], '100-0400', 'Partners'' Drawings', 'equity', null, 'equity', 'debit', false, null, 1160, true),
  (array['llp']::text[], '100-0000', 'Partners'' Equity', 'equity', null, 'equity', 'credit', false, null, 1170, true),
  (array['llp']::text[], '100-0100', 'Partners'' Capital Contributions', 'equity', null, 'equity', 'credit', false, null, 1180, true),
  (array['llp']::text[], '100-0200', 'Partners'' Current Accounts', 'equity', null, 'equity', 'credit', false, null, 1190, true),
  (array['llp']::text[], '100-0300', 'Undistributed Profits', 'equity', null, 'retained_earnings', 'credit', false, null, 1200, true),
  (array['llp']::text[], '100-0400', 'Partners'' Drawings', 'equity', null, 'equity', 'debit', false, null, 1210, true);

-- ---------------------------------------------------------------- row-level security
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.fiscal_years enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.accounts enable row level security;
alter table public.chart_template enable row level security;

create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.organization_members m where m.org_id = p_org and m.user_id = auth.uid());
$$;

create policy "members read their organisations" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "members read memberships of their organisations" on public.organization_members
  for select to authenticated using (user_id = auth.uid() or public.is_org_member(org_id));
create policy "members read fiscal years" on public.fiscal_years
  for select to authenticated using (public.is_org_member(org_id));
create policy "members read periods" on public.accounting_periods
  for select to authenticated using (public.is_org_member(org_id));
create policy "members read accounts" on public.accounts
  for select to authenticated using (public.is_org_member(org_id));
create policy "anyone signed in reads the chart template" on public.chart_template
  for select to authenticated using (true);
-- No insert/update/delete policies: writes go through create_organization() below.

-- ---------------------------------------------------------------- slugs
create function public.slugify(p text) returns text
language sql immutable as $$
  select coalesce(nullif(trim(both '-' from regexp_replace(lower(p), '[^a-z0-9]+', '-', 'g')), ''), 'entity');
$$;

-- ---------------------------------------------------------------- create_organization
-- p_org: legal_name, entity_type, fiscal_year_end, cadence, chart_mode, books_start,
--        registration_type, registration_number, sst_number, tin, acquisition_channel, acquisition_detail
-- p_years: [{ starts_on, ends_on, periods: [{ starts_on, ends_on }] }] (validated and computed by the app)
create function public.create_organization(p_org jsonb, p_years jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_base text;
  v_slug text;
  v_n int := 1;
  v_year jsonb;
  v_year_id uuid;
  v_period jsonb;
  v_type text := p_org->>'entity_type';
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  v_base := left(public.slugify(p_org->>'legal_name'), 60);
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into public.organizations (
    slug, legal_name, entity_type, fiscal_year_end, cadence, chart_mode, books_start,
    registration_type, registration_number, sst_number, tin, acquisition_channel, acquisition_detail, created_by)
  values (
    v_slug, p_org->>'legal_name', v_type, (p_org->>'fiscal_year_end')::date, p_org->>'cadence',
    p_org->>'chart_mode', (p_org->>'books_start')::date,
    coalesce(p_org->>'registration_type', 'BRN'), nullif(p_org->>'registration_number', ''),
    nullif(p_org->>'sst_number', ''), nullif(p_org->>'tin', ''),
    p_org->>'acquisition_channel', nullif(p_org->>'acquisition_detail', ''), v_user)
  returning id into v_org;

  insert into public.organization_members (org_id, user_id, role) values (v_org, v_user, 'owner');

  for v_year in select * from jsonb_array_elements(p_years) loop
    insert into public.fiscal_years (org_id, starts_on, ends_on)
    values (v_org, (v_year->>'starts_on')::date, (v_year->>'ends_on')::date)
    returning id into v_year_id;
    for v_period in select * from jsonb_array_elements(v_year->'periods') loop
      insert into public.accounting_periods (org_id, fiscal_year_id, starts_on, ends_on)
      values (v_org, v_year_id, (v_period->>'starts_on')::date, (v_period->>'ends_on')::date);
    end loop;
  end loop;

  if p_org->>'chart_mode' = 'standard' then
    insert into public.accounts (org_id, code, name, type, subtype, section, normal_balance, is_cash)
    select v_org, t.code, t.name, t.type, t.subtype, t.section, t.normal_balance, t.is_cash
    from public.chart_template t
    where t.entity_types is null or v_type = any (t.entity_types)
    order by t.sort_order;

    update public.accounts a set parent_id = p.id
    from public.chart_template t, public.accounts p
    where a.org_id = v_org and p.org_id = v_org
      and t.code = a.code and t.parent_code is not null and p.code = t.parent_code
      and (t.entity_types is null or v_type = any (t.entity_types));
  end if;

  return jsonb_build_object('id', v_org, 'slug', v_slug);
end;
$$;

revoke all on function public.create_organization(jsonb, jsonb) from public, anon;
grant execute on function public.create_organization(jsonb, jsonb) to authenticated;
