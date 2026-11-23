import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { BUCKET, EXTENSION, MAX_FILES, fileType, isSha256 } from "@/features/inbox/limits";
import { editableOrg } from "@/features/inbox/server";
import { createSupabaseServerClient } from "@/shared/supabase/server";

type FileMeta = { sha256: unknown; name: unknown; size: unknown; contentType: unknown };

/**
 * Step 3 of an AI Inbox upload (lejar.ai: POST /api/inbox/uploads/complete). Checks that the bytes
 * in Storage are the ones announced in step 1 (size and SHA-256), then registers each document and
 * queues a draft ("Ready to analyze"). Reading with the AI is a separate, explicit step.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const files: FileMeta[] = Array.isArray(body?.files) ? body.files.slice(0, MAX_FILES) : [];
  const note = typeof body?.userNote === "string" ? body.userNote.slice(0, 500) : null;
  const supabase = await createSupabaseServerClient();
  const org = await editableOrg(supabase, body?.orgSlug);
  if (!org) return NextResponse.json({ error: "not_allowed" }, { status: 403 });

  const shas = files.map((f) => f.sha256).filter(isSha256);
  const { data: known } = await supabase.from("source_documents").select("id, sha256").eq("org_id", org.id).in("sha256", shas);
  const docBySha = new Map((known ?? []).map((d) => [d.sha256, d.id as string]));

  const results: Record<string, unknown>[] = [];
  const verified: { sha256: string; name: string; size: number; contentType: string; path: string }[] = [];
  for (const f of files) {
    const name = typeof f.name === "string" ? f.name : "";
    const type = typeof f.contentType === "string" ? fileType(name, f.contentType) : null;
    if (!isSha256(f.sha256) || !type || typeof f.size !== "number") {
      results.push({ name, status: "refused", code: "missing" });
      continue;
    }
    const path = `${org.id}/${f.sha256}.${EXTENSION[type]}`;
    if (!docBySha.has(f.sha256)) {
      const { data: blob } = await supabase.storage.from(BUCKET).download(path);
      if (!blob) {
        results.push({ name, status: "refused", code: "missing" });
        continue;
      }
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (bytes.length !== f.size || createHash("sha256").update(bytes).digest("hex") !== f.sha256) {
        results.push({ name, status: "refused", code: "mismatch" });
        continue;
      }
    }
    verified.push({ sha256: f.sha256, name, size: f.size, contentType: type, path });
    results.push({ sha256: f.sha256, name, status: "stored", contentType: type, byteSize: f.size });
  }

  let created: { draftId: string; originalName: string; sourceDocumentId: string }[] = [];
  let duplicates: { draftId: string; originalName: string }[] = [];
  if (verified.length > 0) {
    const { data, error } = await supabase.rpc("inbox_register_uploads", { p_slug: org.slug, p_files: verified, p_note: note });
    if (error) {
      console.warn("[inbox] register failed:", error.code, error.message);
      return NextResponse.json({ error: "unavailable" }, { status: 500 });
    }
    created = data.created;
    duplicates = data.duplicates;
  }
  for (const r of results) {
    const c = created.find((x) => x.originalName === r.name);
    if (c) r.sourceDocumentId = c.sourceDocumentId;
  }
  return NextResponse.json({ files: results, created, duplicates, errors: [], statements: [], splitCandidates: [] });
}
