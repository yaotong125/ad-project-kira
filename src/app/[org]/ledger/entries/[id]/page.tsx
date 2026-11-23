import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { documentInfo } from "@/features/books/doc-info";
import { todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import { ReverseEntryButton, VoidEntryButton } from "@/features/ledger/controls";
import { SOURCE_LABEL, sourceHref } from "@/features/ledger/load";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Journal entry", robots: { index: false } };

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const sen = (v: unknown) => Math.round(Number(v) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** /{slug}/ledger/entries/{id}: one journal entry with its lines (lejar.ai links here from "View the reversal"). */
export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: e } = await supabase
    .from("journal_entries")
    .select(
      "id, entry_number, occurred_on, memo, source, source_id, created_at, voided_at, void_reason, reversal_of, reversed_by, journal_lines(line_no, description, debit, credit, reconciled_on, accounts(code, name)), voided_journal_lines(line_no, description, debit, credit, accounts(code, name))",
    )
    .eq("org_id", ctx.org.id)
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();
  const base = `/${ctx.org.slug}`;
  const ms = ctx.lang === "ms";
  type L = { line_no: number; description: string | null; debit: unknown; credit: unknown; reconciled_on?: string | null; accounts: unknown };
  const lines = (((e.voided_at ? e.voided_journal_lines : e.journal_lines) ?? []) as L[]).sort((a, b) => a.line_no - b.line_no);
  const dr = lines.reduce((s, l) => s + sen(l.debit), 0);
  const cr = lines.reduce((s, l) => s + sen(l.credit), 0);
  const info = (await documentInfo(supabase, [e.source_id])).get(e.source_id ?? "");
  const [rev, revOf] = await Promise.all([
    e.reversed_by ? supabase.from("journal_entries").select("id, entry_number, occurred_on").eq("id", e.reversed_by).maybeSingle() : Promise.resolve({ data: null }),
    e.reversal_of ? supabase.from("journal_entries").select("id, entry_number, occurred_on").eq("id", e.reversal_of).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const doc = sourceHref(ctx.org.slug, { source: e.source, sourceId: e.source_id });
  const manual = e.source === "manual" && !e.voided_at && !e.reversed_by && ctx.role !== "viewer";
  const today = todayMY();
  const status = e.voided_at ? ["Void", "chip"] : e.reversed_by ? ["Reversed", "chip warn"] : ["Posted", "chip pos"];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <Link href={`${base}/ledger`} className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
            <ArrowLeft size={12} aria-hidden="true" /> {ms ? "Lejar" : "Ledger"}
          </Link>
          <h1 className="m-0 flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            <span className="num">{e.entry_number ?? info?.docs ?? "Journal entry"}</span>
            <span className={status[1]}>{status[0]}</span>
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · <span className="num text-ink">{e.occurred_on}</span> · <span className="chip">{SOURCE_LABEL[e.source]?.[ms ? 1 : 0] ?? e.source}</span>
          </div>
        </div>
        {manual && (
          <div className="flex flex-wrap items-start gap-1">
            <ReverseEntryButton orgSlug={ctx.org.slug} entryId={e.id} defaultOn={today < e.occurred_on ? e.occurred_on : today} minOn={e.occurred_on} />
            <VoidEntryButton orgSlug={ctx.org.slug} entryId={e.id} />
          </div>
        )}
      </div>

      <dl className="card m-0 grid grid-cols-1 gap-x-6 gap-y-3 px-4 py-3.5 text-[13px] sm:grid-cols-2">
        {info?.party && (
          <div>
            <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">
              {e.source === "bill" || e.source === "payment"
                ? "Supplier"
                : e.source === "payment_voucher"
                  ? "Payee"
                  : e.source === "depreciation" || e.source === "disposal"
                    ? "Asset"
                    : e.source === "amortisation"
                      ? "Schedule"
                      : e.source === "transfer"
                        ? "Reference"
                        : "Customer"}
            </dt>
            <dd className="m-0 mt-0.5 text-ink">{info.party}</dd>
          </div>
        )}
        {(info?.docs || doc) && (
          <div>
            <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Source document</dt>
            <dd className="m-0 mt-0.5">
              {doc ? (
                <Link href={doc} className="num font-medium text-brand hover:underline">
                  {info?.docs ?? (e.source === "reversal" ? (revOf.data?.entry_number ?? "Original entry") : "Open")}
                </Link>
              ) : (
                <span className="num text-ink">{info?.docs}</span>
              )}
            </dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Memo</dt>
          <dd className="m-0 mt-0.5 text-ink">{e.memo ?? "-"}</dd>
        </div>
        {rev.data && (
          <div className="sm:col-span-2">
            <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Reversed by</dt>
            <dd className="m-0 mt-0.5">
              <Link href={`${base}/ledger/entries/${rev.data.id}`} className="num font-medium text-brand hover:underline">
                {rev.data.entry_number}
              </Link>{" "}
              <span className="text-muted">on {rev.data.occurred_on}</span>
            </dd>
          </div>
        )}
        {e.voided_at && (
          <div className="sm:col-span-2">
            <dt className="text-[11.5px] uppercase tracking-[0.06em] text-muted">Voided</dt>
            <dd className="m-0 mt-0.5 text-ink">
              {e.voided_at.slice(0, 10)} · {e.void_reason}
              <span className="block text-[12px] text-muted">Removed from all books and reports; kept here for audit.</span>
            </dd>
          </div>
        )}
      </dl>

      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full border-collapse text-[13px]" data-testid="entry-lines">
          <thead className="bg-surface">
            <tr>
              <th className={cn(TH, "text-left")}>Account</th>
              <th className={cn(TH, "text-left")}>Description</th>
              <th className={cn(TH, "text-right")}>Debit</th>
              <th className={cn(TH, "text-right")}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const a = one(l.accounts as { code: string; name: string } | null);
              return (
                <tr key={l.line_no} className={cn("transition-colors hover:bg-surface-2", e.voided_at && "text-muted line-through")}>
                  <td className={TD}>
                    <span className="num text-ink-2">{a?.code}</span> <span className={e.voided_at ? "" : "text-ink"}>{a?.name}</span>
                    {l.reconciled_on && <span className="chip pos ml-2">Reconciled</span>}
                  </td>
                  <td className={cn(TD, "text-ink-2")}>{l.description ?? ""}</td>
                  <td className={cn(TD, "num-sans text-right")}>{sen(l.debit) ? rm(sen(l.debit)) : ""}</td>
                  <td className={cn(TD, "num-sans text-right")}>{sen(l.credit) ? rm(sen(l.credit)) : ""}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border-strong">
              <td className={cn(TD, "font-semibold text-ink")} colSpan={2}>
                Totals
              </td>
              <td className={cn(TD, "num-sans text-right font-semibold text-ink")}>{rm(dr)}</td>
              <td className={cn(TD, "num-sans text-right font-semibold text-ink")}>{rm(cr)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div>
        <Link href={`${base}/ledger`} className={buttonClass("secondary", "sm")}>
          {ms ? "Kembali ke lejar" : "Back to the ledger"}
        </Link>
      </div>
    </div>
  );
}
