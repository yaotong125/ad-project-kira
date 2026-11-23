-- lejar.ai dashboard "Finish setup" card: "I'm all set, hide this" (per entity, editors only).
alter table public.organizations add column setup_hidden boolean not null default false;

create function public.set_setup_hidden(p_slug text, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.organizations set setup_hidden = p_hidden where id = public.learn_org_for_editor(p_slug);
end;
$$;
revoke all on function public.set_setup_hidden(text, boolean) from public, anon;
grant execute on function public.set_setup_hidden(text, boolean) to authenticated;
