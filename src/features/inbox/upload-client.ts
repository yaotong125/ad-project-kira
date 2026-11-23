"use client";

import { supabaseBrowser } from "@/shared/supabase/browser";
import { BUCKET, MAX_FILE_BYTES, MAX_FILES, fileType, type UploadFailure } from "./limits";

/**
 * lejar.ai's three-step upload (module 977778, observed 2026-11-22):
 * 1. POST /api/inbox/uploads with each file's SHA-256, name, size and type → a signed Storage URL per file
 *    (or "stored" when the entity already has those bytes);
 * 2. PUT the bytes straight to Storage (no size limit on the app server);
 * 3. POST /api/inbox/uploads/complete → the server checks the bytes and queues one draft per document.
 */
export type UploadedDraft = { draftId: string; originalName: string };
export type UploadOutcome =
  | {
      ok: true;
      created: UploadedDraft[];
      failed: { file: File; reason: UploadFailure; draftId?: string }[];
    }
  | { ok: false; error: string };

type RequestFile = { sha256: string; name: string; size: number; contentType: string };

async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

/**
 * Photos bigger than the AI can read in one go are re-encoded as JPEG (lejar.ai does the same and
 * marks the row "Made smaller to fit the AI read."). PDFs are sent as they are.
 */
const IMAGE_TARGET_BYTES = 3_500_000;
const MAX_SIDE = 2400;
export async function prepareFile(file: File): Promise<{ kind: "ok" | "compressed"; file: File } | { kind: "failed" | "unreadable" }> {
  const type = fileType(file.name, file.type);
  if (!type?.startsWith("image/") || file.size <= IMAGE_TARGET_BYTES) return { kind: "ok", file };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { kind: "unreadable" };
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    if (blob && blob.size <= IMAGE_TARGET_BYTES) {
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return { kind: "compressed", file: new File([blob], name, { type: "image/jpeg" }) };
    }
  }
  return { kind: "failed" };
}

export async function uploadInboxFiles(orgSlug: string, files: File[], note: string | null): Promise<UploadOutcome> {
  const failed: { file: File; reason: UploadFailure; draftId?: string }[] = [];
  const ready: { file: File; meta: RequestFile }[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    const type = fileType(file.name, file.type);
    if (file.size === 0) failed.push({ file, reason: "empty" });
    else if (!type) failed.push({ file, reason: "wrong_type" });
    else if (file.size > MAX_FILE_BYTES) failed.push({ file, reason: "file_too_large" });
    else ready.push({ file, meta: { sha256: await sha256Hex(file), name: file.name, size: file.size, contentType: type } });
  }
  if (ready.length === 0) return { ok: true, created: [], failed };

  const req = await postJson("/api/inbox/uploads", { orgSlug, files: ready.map((r) => r.meta) }, 45_000);
  if (req.status !== 200) return { ok: false, error: req.body?.error ?? "upload_failed" };

  const storage = supabaseBrowser().storage.from(BUCKET);
  const toComplete: { file: File; meta: RequestFile }[] = [];
  for (const [i, r] of ready.entries()) {
    const slot = req.body.files?.[i];
    if (!slot || slot.status === "refused") {
      failed.push({ file: r.file, reason: slot?.code ?? "network" });
      continue;
    }
    if (slot.status === "upload") {
      const { error } = await storage.uploadToSignedUrl(slot.path, slot.token, r.file, { contentType: r.meta.contentType });
      if (error) {
        failed.push({ file: r.file, reason: "network" });
        continue;
      }
    }
    toComplete.push(r);
  }
  if (toComplete.length === 0) return { ok: true, created: [], failed };

  const done = await postJson(
    "/api/inbox/uploads/complete",
    { orgSlug, files: toComplete.map((r) => r.meta), ...(note ? { userNote: note } : {}) },
    135_000,
  );
  if (done.status !== 200) return { ok: false, error: done.body?.error ?? "upload_failed" };
  for (const [i, r] of toComplete.entries()) {
    const slot = done.body.files?.[i];
    if (slot?.status !== "stored") failed.push({ file: r.file, reason: slot?.code ?? "network" });
  }
  for (const d of done.body.duplicates ?? []) {
    const r = toComplete.find((x) => x.meta.name === d.originalName);
    if (r) failed.push({ file: r.file, reason: "exists_in_inbox", draftId: d.draftId });
  }
  return { ok: true, created: done.body.created ?? [], failed };
}
