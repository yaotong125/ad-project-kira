import type { Metadata } from "next";
import Link from "next/link";
import { accountOptions, reviewDraft, todayMY, type ReviewDraft } from "@/features/books/load";
import { fromSen, lineSen, toQuantity, toSen } from "@/features/books/money";
import { EntryForm, type EntryLine } from "@/features/journal/entry-form";
import { DEFAULT_CASH_ACCOUNT } from "@/features/inbox/proposal";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Journal entries", robots: { index: false } };

const SST_INPUT = "400-1400";
const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

/**
 * Debit lines for what was bought (grouped by account, tax to SST Input Tax), one credit to the cash
 * account it was paid from. lejar.ai drafted a single debit and a credit to 300-0900 for a cash receipt.
 */
function linesFromDraft(draft: ReviewDraft, hasSstInput: boolean): EntryLine[] {
  const p = draft.proposal;
  const byAccount = new Map<string, number>();
  let tax = 0;
  for (const l of p.lines) {
    const q = toQuantity(l.quantity) ?? 1;
    const s = lineSen(q, toSen(l.unitPrice) ?? 0, l.taxCode);
    byAccount.set(l.accountCode, (byAccount.get(l.accountCode) ?? 0) + s.net);
    tax += s.tax;
  }
  if (tax > 0) {
    const code = hasSstInput ? SST_INPUT : [...byAccount.keys()][0];
    byAccount.set(code, (byAccount.get(code) ?? 0) + tax);
  }
  const debits = [...byAccount.entries()].filter(([, v]) => v !== 0);
  const total = debits.reduce((s, [, v]) => s + v, 0);
  const out: EntryLine[] = debits.map(([code, v]) =>
    v > 0 ? { accountCode: code, debit: fromSen(v).replace(/,/g, ""), credit: "" } : { accountCode: code, debit: "", credit: fromSen(-v).replace(/,/g, "") },
  );
  if (draft.draftType === "payment") {
    out.push({ accountCode: p.paidFromAccountCode ?? DEFAULT_CASH_ACCOUNT, debit: "", credit: fromSen(total).replace(/,/g, "") });
  } else {
    out.push({ accountCode: "", debit: "", credit: fromSen(total).replace(/,/g, "") });
  }
  return out;
}

/**
 * /{slug}/journal-entries: lejar.ai's manual journal page (observed 2026-11-22): "Post a journal
 * entry" form (pre-filled from the AI Inbox with ?aiDraft=) and the posted entries below.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const today = todayMY();
  const aiDraftId = first(sp.aiDraft);
  const posted = first(sp.posted);
  const canEdit = ctx.role !== "viewer";

  const [accounts, rawDraft, { data: entries }] = await Promise.all([
    accountOptions(supabase, ctx.org.id),
    canEdit ? reviewDraft(supabase, ctx.org.id, aiDraftId) : Promise.resolve(null),
    supabase
      .from("journal_entries")
      .select("id, entry_number, occurred_on, memo, source, voided_at, reversed_by, journal_lines(debit), voided_journal_lines(debit)")
      .eq("org_id", ctx.org.id)
      .in("source", ["manual", "reversal"])
      .order("occurred_on", { ascending: false })
      .order("entry_number", { ascending: false })
      .limit(100),
  ]);
  const draft = rawDraft && (rawDraft.draftType === "payment" || rawDraft.draftType === "journal") ? rawDraft : null;
  const occurredOn = draft?.proposal.documentDate ?? today;
  const { data: suggested } = await supabase.rpc("next_doc_number", { p_org: ctx.org.id, p_prefix: "JV", p_on: occurredOn });

  const initial = draft
    ? { occurredOn, memo: draft.aiSummary ?? "", lines: linesFromDraft(draft, accounts.some((a) => a.code === SST_INPUT)) }
    : { occurredOn, memo: "", lines: [{ accountCode: "", debit: "", credit: "" }, { accountCode: "", debit: "", credit: "" }] };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Journal entries" sub={`${ctx.org.legal_name} · manual journal entries, newest first · reverse or void them on the Ledger`} />
      {posted && (
        <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          Entry {posted} is posted.
        </p>
      )}
      {aiDraftId && !draft && canEdit && (
        <p role="status" className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-ink-2">
          This inbox document was already recorded or dismissed. <Link className="underline" href={`${base}/inbox`}>Back to the AI Inbox</Link>
        </p>
      )}
      {canEdit && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[13.5px] font-semibold text-ink">Post a journal entry</h2>
          <EntryForm
            key={draft?.id ?? "new"}
            orgSlug={ctx.org.slug}
            accounts={accounts}
            suggestedReference={suggested ?? ""}
            initial={initial}
            draft={draft ? { id: draft.id, sourceDocumentId: draft.sourceDocumentId, source: draft.source } : null}
          />
        </section>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">Posted journal entries</h2>
        {(entries ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm font-medium text-ink">No manual journal entries yet</p>
            <div className="text-[13px] text-muted">Post a manual journal entry using the form above.</div>
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr className="border-t border-border">
                  <th className={cn(TH, "text-left")}>Date</th>
                  <th className={cn(TH, "text-left")}>Reference</th>
                  <th className={cn(TH, "text-left")}>Memo</th>
                  <th className={cn(TH, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(entries ?? []).map((e) => {
                  const total = ((e.voided_at ? e.voided_journal_lines : e.journal_lines) ?? []).reduce((s: number, l: { debit: unknown }) => s + (toSen(String(l.debit)) ?? 0), 0);
                  return (
                    <tr key={e.id} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "num-sans text-ink-2")}>{e.occurred_on}</td>
                      <td className={cn(TD, "num text-ink")}>
                        <Link href={`${base}/ledger/entries/${e.id}`} className="hover:underline">
                          {e.entry_number}
                        </Link>
                        {e.voided_at ? <span className="chip ml-2">Void</span> : e.reversed_by ? <span className="chip warn ml-2">Reversed</span> : e.source === "reversal" ? <span className="chip ml-2">Reversal</span> : null}
                      </td>
                      <td className={cn(TD, "max-w-[520px] truncate text-ink-2")}>{e.memo ?? "-"}</td>
                      <td className={cn(TD, "num text-right", e.voided_at ? "text-muted line-through" : "text-ink")}>{fromSen(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
