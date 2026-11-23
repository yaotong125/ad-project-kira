import { NextResponse } from "next/server";
import { BUCKET, MAX_FILE_BYTES, isSha256 } from "@/features/inbox/limits";
import { editableOrg } from "@/features/inbox/server";
import { STATEMENT_TYPES, statementType } from "@/features/import/files";
import { createSupabaseServerClient } from "@/shared/supabase/server";

/**
 * Step 1 of a statement upload: a signed Storage URL per file, like the AI Inbox's
 * /api/inbox/uploads but also taking CSV. Step 3 is analyseUploadAction.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const files: { sha256: unknown; name: unknown; size: unknown; contentType: unknown }[] = Array.isArray(body?.files) ? body.files.slice(0, 20) : [];
  if (files.length === 0) return NextResponse.json({ error: "no_files" }, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const org = await editableOrg(supabase, body?.orgSlug);
  if (!org) return NextResponse.json({ error: "not_allowed" }, { status: 403 });

  const out = [];
  for (const f of files) {
    const name = typeof f.name === "string" ? f.name : "";
    const type = statementType(name, typeof f.contentType === "string" ? f.contentType : "");
    const size = typeof f.size === "number" ? f.size : 0;
    if (!isSha256(f.sha256) || !name) out.push({ status: "refused", code: "missing" });
    else if (size <= 0) out.push({ status: "refused", code: "empty" });
    else if (!type) out.push({ status: "refused", code: "wrong_type" });
    else if (size > MAX_FILE_BYTES) out.push({ status: "refused", code: "file_too_large" });
    else {
      const path = `${org.id}/${f.sha256}.${STATEMENT_TYPES[type]}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (data) out.push({ status: "upload", path, token: data.token });
      else if (/exist/i.test(error?.message ?? "")) out.push({ status: "stored", path });
      else out.push({ status: "refused", code: "unavailable" });
    }
  }
  return NextResponse.json({ files: out });
}
