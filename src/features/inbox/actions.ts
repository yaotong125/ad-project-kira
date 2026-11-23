"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { AiNotConfiguredError, AiReadError, readDocument, type ChartAccount } from "./ai/read-document";
import { BUCKET, fileType } from "./limits";
import { toDraft } from "./proposal";
import { editableOrg } from "./server";

/**
 * AI Inbox Server Actions, named after lejar.ai's (chunk 1yjjzu71g7hh9). Each takes FormData with
 * orgSlug and draftId(s) and returns { ok } or { ok: false, error }.
 */
const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export type AnalyzedDraft = {
  id: string;
  status: "pending" | "failed" | "unsupported";
  draftType: string | null;
  aiSummary: string | null;
  confidence: number | null;
  error: string | null;
  documentDate: string | null;
  outOfPeriod: boolean;
};
export type AnalyzeResult =
  | { ok: true; draft: AnalyzedDraft }
  | { ok: false; reason?: "not_configured"; error: string };

/** "Analyze": reads one uploaded document with the AI and stores the draft (lejar.ai: one call per row, 3 at a time). */
export async function analyzeDraftAction(form: FormData): Promise<AnalyzeResult> {
  const supabase = await createSupabaseServerClient();
  const org = await editableOrg(supabase, text(form, "orgSlug"));
  if (!org) return { ok: false, error: "You cannot change this entity's books." };
  const draftId = text(form, "draftId");

  const { data: draft } = await supabase
    .from("ai_drafts")
    .select("id, status, user_note, source_documents(path, content_type, original_name)")
    .eq("id", draftId)
    .eq("org_id", org.id)
    .maybeSingle();
  const doc = Array.isArray(draft?.source_documents) ? draft?.source_documents[0] : draft?.source_documents;
  if (!draft || !doc) return { ok: false, error: "This document is gone. Reload the AI Inbox." };
  if (draft.status !== "analyzing" && draft.status !== "failed") {
    return { ok: false, error: "This document was already read. Reload the AI Inbox." };
  }
  const type = fileType(doc.original_name, doc.content_type);
  const [{ data: blob }, { data: chart }, { data: orgRow }] = await Promise.all([
    supabase.storage.from(BUCKET).download(doc.path),
    supabase.from("accounts").select("code, name, type, is_cash").eq("org_id", org.id).eq("status", "active").order("code"),
    supabase.from("organizations").select("legal_name, entity_type").eq("id", org.id).single(),
  ]);
  if (!blob || !type) return { ok: false, error: "Kira could not open the uploaded file. Upload it again." };

  let saved;
  try {
    const { reading, model } = await readDocument({
      bytes: Buffer.from(await blob.arrayBuffer()),
      contentType: type,
      orgName: orgRow?.legal_name ?? "",
      entityType: orgRow?.entity_type ?? "business",
      chart: (chart ?? []) as ChartAccount[],
      userNote: draft.user_note,
    });
    saved = { ...toDraft(reading, (chart ?? []) as ChartAccount[], org.books_start), model };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      console.warn("[inbox] AI not configured:", error.message);
      return {
        ok: false,
        reason: "not_configured",
        error: "The AI is not set up for this Kira yet: add ANTHROPIC_API_KEY to .env.local and restart the server.",
      };
    }
    const message = error instanceof AiReadError ? error.message : "The AI could not read this document. Try again.";
    if (!(error instanceof AiReadError)) console.error("[inbox] analyze failed:", error);
    saved = {
      status: "failed" as const, draftType: null, documentType: null, aiSummary: null, confidence: null,
      documentDate: null, error: message, unsupportedKind: null, proposal: null, outOfPeriod: false, model: null,
    };
  }

  const { error } = await supabase.rpc("inbox_save_analysis", { p_slug: org.slug, p_draft: draft.id, p_result: saved });
  if (error) {
    console.warn("[inbox] save analysis failed:", error.code, error.message);
    return { ok: false, error: "This document was already handled. Reload the AI Inbox." };
  }
  revalidatePath(`/${org.slug}/inbox`);
  return {
    ok: true,
    draft: {
      id: draft.id,
      status: saved.status,
      draftType: saved.draftType,
      aiSummary: saved.aiSummary,
      confidence: saved.confidence,
      error: saved.error,
      documentDate: saved.documentDate,
      outOfPeriod: saved.outOfPeriod,
    },
  };
}

async function setStatus(form: FormData, action: "dismiss" | "restore") {
  const supabase = await createSupabaseServerClient();
  const slug = text(form, "orgSlug");
  const ids = form.getAll("draftId").filter((v): v is string => typeof v === "string" && v.length > 0);
  const { data, error } = await supabase.rpc("inbox_set_status", { p_slug: slug, p_drafts: ids, p_action: action });
  if (error) {
    console.warn(`[inbox] ${action} failed:`, error.code, error.message);
    return { ok: false as const, error: "Could not save. Reload the page and try again." };
  }
  revalidatePath(`/${slug}/inbox`);
  const done: string[] = data ?? [];
  return { ok: true as const, done, skipped: ids.filter((id) => !done.includes(id)) };
}

/** "Dismiss" a drafted row. */
export async function dismissDraftAction(form: FormData) {
  return setStatus(form, "dismiss");
}

/** "Restore" a dismissed row. */
export async function restoreDraftAction(form: FormData) {
  return setStatus(form, "restore");
}

/** "Remove" rows that were uploaded but not read yet (lejar.ai moves them to Dismissed). */
export async function removeWaitingDraftsAction(form: FormData) {
  const r = await setStatus(form, "dismiss");
  return r.ok ? { ok: true as const, removed: r.done, skipped: r.skipped } : r;
}
