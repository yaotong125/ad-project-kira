import type { Metadata } from "next";
import { InboxFlow, type DraftRow } from "@/features/inbox/inbox-flow";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "AI Inbox", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: orgRow }] = await Promise.all([
    supabase
      .from("ai_drafts")
      .select("id, status, draft_type, ai_summary, original_name, confidence, error, document_date, created_at")
      .eq("org_id", ctx.org.id)
      .neq("status", "confirmed")
      .order("created_at"),
    supabase.from("organizations").select("books_start").eq("id", ctx.org.id).single(),
  ]);
  const drafts: DraftRow[] = (data ?? []).map((d) => ({
    id: d.id,
    status: d.status,
    draftType: d.draft_type,
    aiSummary: d.ai_summary,
    originalName: d.original_name,
    confidence: d.confidence === null ? null : Number(d.confidence),
    error: d.error,
    documentDate: d.document_date,
    outOfPeriod: d.document_date !== null && orgRow?.books_start ? d.document_date < orgRow.books_start : false,
    createdAt: d.created_at,
  }));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI Inbox"
        sub={`${ctx.org.legal_name} · drop documents, photos or receipts; the AI drafts the transaction, you confirm`}
      />
      <InboxFlow orgSlug={ctx.org.slug} lang={ctx.lang} canEdit={ctx.role !== "viewer"} initialDrafts={drafts} />
    </div>
  );
}
