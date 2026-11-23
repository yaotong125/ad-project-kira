-- Slice 10: Ask Kira (chat that answers from the entity's books), modelled on lejar.ai's /chat
-- (observed 2026-11-22, docs/re/10-ask-kira.md). Conversations belong to the member who started them.

create table public.chat_conversations (
  id uuid primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_conversations_user_idx on public.chat_conversations (org_id, user_id, updated_at desc);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  role text not null check (role in ('member', 'assistant')),
  content text not null default '',
  status text not null default 'complete' check (status in ('complete', 'stopped', 'failed')),
  tools text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index chat_messages_conversation_idx on public.chat_messages (conversation_id, created_at);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat_conversations: own" on public.chat_conversations for all to authenticated
  using (user_id = auth.uid() and public.is_org_member(org_id))
  with check (user_id = auth.uid() and public.is_org_member(org_id));
create policy "chat_messages: own conversations" on public.chat_messages for all to authenticated
  using (exists (select 1 from public.chat_conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.chat_conversations c where c.id = conversation_id and c.user_id = auth.uid() and c.org_id = chat_messages.org_id));

/** lejar.ai: "One answer checks the section." Any member (viewers can ask too) checks Learn section 6. */
create function public.check_ask_section(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_member(p_org) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into public.learn_progress (org_id, section, state, updated_by)
  values (p_org, 'ask-lejar', 'checked', auth.uid())
  on conflict (org_id, section) do update set state = 'checked', updated_by = auth.uid(), updated_at = now()
  where public.learn_progress.state <> 'checked';
end;
$$;
revoke all on function public.check_ask_section(uuid) from public, anon;
grant execute on function public.check_ask_section(uuid) to authenticated;
