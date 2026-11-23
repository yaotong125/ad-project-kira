import { NextResponse } from "next/server";
import { BUCKET, EXTENSION, MAX_FILE_BYTES, MAX_FILES, fileType, isSha256 } from "@/features/inbox/limits";
import { editableOrg } from "@/features/inbox/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type FileMeta = { sha256: unknown; name: unknown; size: unknown; contentType: unknown };

/**
 * Step 1 of an AI Inbox upload (lejar.ai: POST /api/inbox/uploads). For each file: refuse bad
 * ones, answer "stored" when the entity already has these bytes, else hand out a signed upload URL
 * for `{org_id}/{sha256}.{ext}` in the private `source-documents` bucket.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const files: FileMeta[] = Array.isArray(body?.files) ? body.files : [];
  if (files.length === 0) return NextResponse.json({ error: "no_files" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ code: "too_many_files" }, { status: 413 });

  const supabase = await createSupabaseServerClient();
  const org = await editableOrg(supabase, body?.orgSlug);
  if (!org) return NextResponse.json({ error: "not_allowed" }, { status: 403 });

  const shas = files.map((f) => f.sha256).filter(isSha256);
  const { data: known } = await supabase.from("source_documents").select("sha256").eq("org_id", org.id).in("sha256", shas);
  const have = new Set((known ?? []).map((d) => d.sha256));

  const out = [];
  for (const f of files) {
    const name = typeof f.name === "string" ? f.name : "";
    const size = typeof f.size === "number" ? f.size : 0;
    const type = typeof f.contentType === "string" ? fileType(name, f.contentType) : null;
    if (!isSha256(f.sha256) || !name) out.push({ status: "refused", code: "missing" });
    else if (size <= 0) out.push({ sha256: f.sha256, status: "refused", code: "empty" });
    else if (!type) out.push({ sha256: f.sha256, status: "refused", code: "wrong_type" });
    else if (size > MAX_FILE_BYTES) out.push({ sha256: f.sha256, status: "refused", code: "file_too_large" });
    else if (have.has(f.sha256)) out.push({ sha256: f.sha256, status: "stored" });
    else {
      const path = `${org.id}/${f.sha256}.${EXTENSION[type]}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (data) out.push({ sha256: f.sha256, path, status: "upload", signedUrl: data.signedUrl, token: data.token });
      // The bytes are already in Storage from an upload that never completed: skip straight to step 3.
      else if (/exist/i.test(error?.message ?? "")) out.push({ sha256: f.sha256, path, status: "stored" });
      else {
        console.warn("[inbox] signed upload url failed:", error?.message);
        out.push({ sha256: f.sha256, status: "refused", code: "unavailable" });
      }
    }
  }
  return NextResponse.json({ files: out });
}
