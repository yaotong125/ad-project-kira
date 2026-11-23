-- Slice 9: Bank reconciliation, modelled on lejar.ai's /reconcile (observed 2026-11-22, docs/re/09-reconcile.md).
-- Each bank-side journal line can be marked cleared (reconciled_on = the statement date it cleared on).
-- Lines recorded or matched through bank import are cleared automatically (source "import").

alter table public.journal_lines
  add column id uuid not null default gen_random_uuid(),
  add column reconciled_on date,
  add column reconcile_source text check (reconcile_source in ('manual', 'import')),
  add column reconciled_by uuid references auth.users (id);
alter table public.journal_lines add constraint journal_lines_id_key unique (id);

/** Bank import: a recorded line clears its bank-side journal line; a confirmed match clears the matched one. */
create function public.statement_line_clears() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_account uuid;
begin
  select account_id into v_account from public.bank_statements where id = new.statement_id;
  if new.status = 'recorded' and old.status is distinct from 'recorded' and new.journal_entry_id is not null then
    update public.journal_lines set reconciled_on = new.txn_date, reconcile_source = 'import', reconciled_by = auth.uid()
    where entry_id = new.journal_entry_id and account_id = v_account and reconciled_on is null;
  elsif new.status = 'matched' and old.status is distinct from 'matched' and new.matched_entry_id is not null then
    update public.journal_lines set reconciled_on = new.txn_date, reconcile_source = 'import', reconciled_by = auth.uid()
    where entry_id = new.matched_entry_id and account_id = v_account and reconciled_on is null;
    -- lejar.ai: "Lejar marked the matched lines as reconciled." (Learn section 5)
    perform public.check_learn_section(new.org_id, 'match-bank');
  end if;
  return new;
end;
$$;
create trigger bank_statement_lines_clear after update of status on public.bank_statement_lines
  for each row execute function public.statement_line_clears();

create table public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  account_id uuid not null references public.accounts (id),
  statement_date date not null,
  closing_balance numeric(14, 2) not null,
  gl_balance numeric(14, 2) not null,
  cleared_balance numeric(14, 2) not null,
  difference numeric(14, 2) not null,
  status text not null check (status in ('reconciled', 'not_reconciled')),
  saved_by uuid not null references auth.users (id),
  saved_at timestamptz not null default now()
);
create index reconciliations_org_idx on public.reconciliations (org_id, statement_date desc);
alter table public.reconciliations enable row level security;
create policy "reconciliations: members read" on public.reconciliations for select to authenticated using (public.is_org_member(org_id));

/** lejar.ai's markLineReconciledAction: tick a bank line as on the statement dated p_date. Checks Learn section 5. */
create function public.mark_line_reconciled(p_slug text, p_line uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  if p_date is null then raise exception 'date_required' using errcode = '22023'; end if;
  update public.journal_lines jl set reconciled_on = greatest(p_date, je.occurred_on), reconcile_source = 'manual', reconciled_by = auth.uid()
  from public.journal_entries je, public.accounts a
  where jl.id = p_line and jl.org_id = v_org and je.id = jl.entry_id and a.id = jl.account_id and a.is_cash
    and je.occurred_on <= p_date and jl.reconciled_on is null;
  if not found then raise exception 'line_required' using errcode = '22023'; end if;
  perform public.check_learn_section(v_org, 'match-bank');
end;
$$;

/** lejar.ai's unmarkLineReconciledAction ("Undo"). */
create function public.unmark_line_reconciled(p_slug text, p_line uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.learn_org_for_editor(p_slug);
begin
  update public.journal_lines set reconciled_on = null, reconcile_source = null, reconciled_by = null
  where id = p_line and org_id = v_org and reconciled_on is not null;
  if not found then raise exception 'line_required' using errcode = '22023'; end if;
end;
$$;

/** lejar.ai's saveReconciliationAction: a dated record of the tie-out (reconciled when the difference is zero). */
create function public.save_reconciliation(p_slug text, p_account text, p_date date, p_balance numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_account uuid;
  v_gl numeric;
  v_cleared numeric;
  v_diff numeric;
  v_id uuid;
begin
  if p_date is null or p_balance is null then raise exception 'save_required' using errcode = '22023'; end if;
  select id into v_account from public.accounts where org_id = v_org and code = p_account and is_cash;
  if v_account is null then raise exception 'account_not_found' using errcode = '22023'; end if;
  select coalesce(sum(jl.debit - jl.credit), 0),
         coalesce(sum(jl.debit - jl.credit) filter (where jl.reconciled_on is not null and jl.reconciled_on <= p_date), 0)
    into v_gl, v_cleared
  from public.journal_lines jl join public.journal_entries je on je.id = jl.entry_id
  where jl.account_id = v_account and je.occurred_on <= p_date;
  v_diff := round(p_balance, 2) - v_cleared;
  insert into public.reconciliations (org_id, account_id, statement_date, closing_balance, gl_balance, cleared_balance, difference, status, saved_by)
  values (v_org, v_account, p_date, round(p_balance, 2), v_gl, v_cleared, v_diff,
          case when v_diff = 0 then 'reconciled' else 'not_reconciled' end, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', case when v_diff = 0 then 'reconciled' else 'not_reconciled' end);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['mark_line_reconciled(text, uuid, date)', 'unmark_line_reconciled(text, uuid)', 'save_reconciliation(text, text, date, numeric)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public.statement_line_clears() from public, anon, authenticated;
