import "server-only";
import { BUCKET } from "@/features/inbox/limits";
import type { Proposal } from "@/features/inbox/proposal";
import type { createSupabaseServerClient } from "@/shared/supabase/server";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type AccountOption = { code: string; name: string; type: string; isCash: boolean };

export async function accountOptions(supabase: Supabase, orgId: string): Promise<AccountOption[]> {
  const { data } = await supabase
    .from("accounts")
    .select("code, name, type, is_cash")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("code");
  return (data ?? []).map((a) => ({ code: a.code, name: a.name, type: a.type, isCash: a.is_cash }));
}

export type SourcePreview = { url: string; isImage: boolean; name: string };

export type ReviewDraft = {
  id: string;
  draftType: string;
  aiSummary: string | null;
  confidence: number | null;
  proposal: Proposal;
  sourceDocumentId: string;
  source: SourcePreview | null;
};

/** A drafted inbox document waiting for review (`?aiDraft=`), with a 1-hour link to the file. Null when gone or already handled. */
export async function reviewDraft(supabase: Supabase, orgId: string, draftId: string | undefined): Promise<ReviewDraft | null> {
  if (!draftId || !/^[0-9a-f-]{36}$/.test(draftId)) return null;
  const { data } = await supabase
    .from("ai_drafts")
    .select("id, status, draft_type, ai_summary, confidence, proposal, source_document_id, source_documents(path, original_name, content_type)")
    .eq("id", draftId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data || data.status !== "pending" || !data.proposal || !data.draft_type) return null;
  const doc = Array.isArray(data.source_documents) ? data.source_documents[0] : data.source_documents;
  const signed = doc ? await supabase.storage.from(BUCKET).createSignedUrl(doc.path, 3600) : null;
  return {
    id: data.id,
    draftType: data.draft_type,
    aiSummary: data.ai_summary,
    confidence: data.confidence === null ? null : Number(data.confidence),
    proposal: data.proposal as Proposal,
    sourceDocumentId: data.source_document_id,
    source:
      doc && signed?.data
        ? { url: signed.data.signedUrl, isImage: doc.content_type.startsWith("image/"), name: doc.original_name }
        : null,
  };
}

/** Today in Malaysia (UTC+8), as YYYY-MM-DD. */
export function todayMY(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

export type ControlAccounts = { ar: string | null; ap: string | null; nonTradeAr: string | null; nonTradeAp: string | null };

/** The entity's control accounts (Settings → Accounting) as ids and codes. */
export async function controlAccounts(supabase: Supabase, orgId: string): Promise<{ ids: ControlAccounts; codes: ControlAccounts }> {
  const { data: o } = await supabase.from("organizations").select("ar_account_id, ap_account_id, non_trade_ar_account_id, non_trade_ap_account_id").eq("id", orgId).single();
  const ids: ControlAccounts = { ar: o?.ar_account_id ?? null, ap: o?.ap_account_id ?? null, nonTradeAr: o?.non_trade_ar_account_id ?? null, nonTradeAp: o?.non_trade_ap_account_id ?? null };
  const wanted = Object.values(ids).filter((v): v is string => !!v);
  const { data: accts } = wanted.length ? await supabase.from("accounts").select("id, code").in("id", wanted) : { data: [] };
  const code = (id: string | null) => (id ? (accts ?? []).find((a) => a.id === id)?.code ?? null : null);
  return { ids, codes: { ar: code(ids.ar), ap: code(ids.ap), nonTradeAr: code(ids.nonTradeAr), nonTradeAp: code(ids.nonTradeAp) } };
}
