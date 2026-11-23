-- Registers an uploaded file (already in Storage, checked by the server) as a source document without
-- queueing an AI Inbox draft. Used by bank statement import. Returns the existing row for the same bytes.
create function public.register_source_document(p_slug text, p_file jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public.learn_org_for_editor(p_slug);
  v_id uuid;
begin
  select id into v_id from public.source_documents where org_id = v_org and sha256 = p_file->>'sha256';
  if v_id is null then
    insert into public.source_documents (org_id, sha256, path, original_name, content_type, byte_size, uploaded_by)
    values (v_org, p_file->>'sha256', p_file->>'path', left(p_file->>'name', 255), p_file->>'contentType',
            (p_file->>'size')::int, auth.uid())
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.register_source_document(text, jsonb) from public, anon;
grant execute on function public.register_source_document(text, jsonb) to authenticated;
