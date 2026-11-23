-- lejar.ai shows Difference = GL balance - adjusted balance (statement 100, GL 0 → -RM100.00, observed 2026-11-22).
-- With adjusted = closing + outstanding, that is cleared - closing.
create or replace function public.save_reconciliation(p_slug text, p_account text, p_date date, p_balance numeric) returns jsonb
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
  v_diff := v_cleared - round(p_balance, 2);
  insert into public.reconciliations (org_id, account_id, statement_date, closing_balance, gl_balance, cleared_balance, difference, status, saved_by)
  values (v_org, v_account, p_date, round(p_balance, 2), v_gl, v_cleared, v_diff,
          case when v_diff = 0 then 'reconciled' else 'not_reconciled' end, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'status', case when v_diff = 0 then 'reconciled' else 'not_reconciled' end);
end;
$$;
