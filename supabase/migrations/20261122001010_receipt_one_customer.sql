-- lejar.ai: "A receipt for one customer cannot settle another customer's invoice. Record a separate receipt
-- per customer." (receipts.error.oneCustomer). Enforced when an allocation is added.
create function public.receipt_one_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.receipt_allocations ra
    join public.invoices i on i.id = ra.invoice_id
    where ra.receipt_id = new.receipt_id
      and i.contact_id <> (select contact_id from public.invoices where id = new.invoice_id)) then
    raise exception 'one_customer' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.receipt_one_customer() from public, anon, authenticated;
create trigger receipt_allocations_one_customer before insert on public.receipt_allocations
  for each row execute function public.receipt_one_customer();
