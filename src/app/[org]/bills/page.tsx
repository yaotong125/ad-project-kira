import type { Metadata } from "next";
import Link from "next/link";
import { BillForm } from "@/features/bills/bill-form";
import { accountOptions, controlAccounts, reviewDraft, todayMY } from "@/features/books/load";
import { rm, toSen } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Bills", robots: { index: false } };

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const STATUS_CHIP: Record<string, [string, string]> = {
  draft: ["chip", "Draft"],
  open: ["chip brand", "Open"],
  paid: ["chip pos", "Paid"],
  void: ["chip", "Void"],
};

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5">
      <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className="num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink max-sm:ml-auto max-sm:text-right">{value}</div>
      <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">{note}</div>
    </div>
  );
}

/**
 * /{slug}/bills: lejar.ai's Bills page (observed 2026-11-22): payable totals, the "Record a bill"
 * form (open with ?new=1, or pre-filled from the AI Inbox with ?aiDraft=), then the bill list.
 * Editing, payments, drafts and voiding come with the Bills slice.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const today = todayMY();
  const aiDraftId = first(sp.aiDraft);
  const saved = first(sp.saved);
  const canEdit = ctx.role !== "viewer";
  const formOpen = canEdit && (first(sp.new) === "1" || Boolean(aiDraftId));

  const [{ data: bills }, draft] = await Promise.all([
    supabase
      .from("bills")
      .select("id, bill_number, bill_date, due_date, status, total, paid_amount, amount_due, contacts(name)")
      .eq("org_id", ctx.org.id)
      .order("bill_date", { ascending: false })
      .order("bill_number", { ascending: false }),
    formOpen ? reviewDraft(supabase, ctx.org.id, aiDraftId) : Promise.resolve(null),
  ]);
  const rows = bills ?? [];
  const open = rows.filter((b) => b.status === "open");
  const sen = (v: unknown) => toSen(String(v)) ?? 0;
  const owed = (b: { amount_due: unknown }) => sen(b.amount_due);
  const outstanding = open.reduce((s, b) => s + owed(b), 0);
  const overdue = open.filter((b) => b.due_date && b.due_date < today).reduce((s, b) => s + owed(b), 0);

  let form = null;
  if (formOpen) {
    const [accounts, { data: suppliers }, { data: suggested }, control] = await Promise.all([
      accountOptions(supabase, ctx.org.id),
      supabase.from("contacts").select("id, name").eq("org_id", ctx.org.id).eq("is_active", true).in("kind", ["supplier", "both"]).order("name"),
      supabase.rpc("next_doc_number", { p_org: ctx.org.id, p_prefix: "BILL", p_on: draft?.proposal.documentDate ?? today }),
      controlAccounts(supabase, ctx.org.id),
    ]);
    form = (
      <>
        {aiDraftId && !draft && (
          <p role="status" className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-ink-2">
            This inbox document was already recorded or dismissed, or is not a bill. <Link className="underline" href={`${base}/inbox`}>Back to the AI Inbox</Link>
          </p>
        )}
        <BillForm
          key={draft?.id ?? "new"}
          orgSlug={ctx.org.slug}
          lang={ctx.lang}
          accounts={accounts}
          suppliers={suppliers ?? []}
          suggestedNumber={suggested ?? ""}
          today={today}
          draft={draft && draft.draftType === "bill" ? draft : null}
          closeHref={draft ? `${base}/inbox` : `${base}/bills`}
          defaultPayable={control.codes.ap}
        />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bills"
        sub={
          <>
            {ctx.org.legal_name} · accounts payable · <span className="text-ink">{rows.length}</span> bills
          </>
        }
      />
      <div className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Outstanding" value={rm(outstanding)} note="Net of payments" />
        <Stat label="Overdue" value={rm(overdue)} note="Past the due date" />
        <Stat label="Current" value={rm(outstanding - overdue)} note="Not yet due" />
      </div>
      {saved && (
        <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          Bill saved. {saved} is recorded in your books.
        </p>
      )}
      {form ?? (canEdit && (
        <div className="flex justify-end">
          <Link href={`${base}/bills?new=1`} className={buttonClass("primary")}>
            New bill
          </Link>
        </div>
      ))}

      <section className="flex flex-col gap-3">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm font-medium text-ink">No bills yet</p>
            <div className="text-[13px] text-muted">Record a supplier bill above, or let Kira draft one from a photo.</div>
            <div className="mt-3">
              <Link href={`${base}/inbox`} className={buttonClass("secondary", "sm")}>
                Upload to AI Inbox
              </Link>
            </div>
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr className="border-t border-border">
                  <th className={cn(TH, "text-left")}>Bill</th>
                  <th className={cn(TH, "text-left")}>Supplier</th>
                  <th className={cn(TH, "text-left")}>Bill date</th>
                  <th className={cn(TH, "text-left")}>Due date</th>
                  <th className={cn(TH, "text-left")}>Status</th>
                  <th className={cn(TH, "text-right")}>Total</th>
                  <th className={cn(TH, "text-right")}>Owed</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const contact = Array.isArray(b.contacts) ? b.contacts[0] : b.contacts;
                  const [chip, label] = STATUS_CHIP[b.status] ?? ["chip", b.status];
                  return (
                    <tr key={b.id} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "num text-ink")}>
                        <Link href={`${base}/bills/${b.id}`} className="underline-offset-2 hover:underline">
                          {b.bill_number}
                        </Link>
                      </td>
                      <td className={cn(TD, "text-ink-2")}>{contact?.name ?? "-"}</td>
                      <td className={cn(TD, "num-sans text-ink-2")}>{b.bill_date}</td>
                      <td className={cn(TD, "num-sans text-ink-2")}>{b.due_date ?? "-"}</td>
                      <td className={TD}>
                        <span className={chip}>{label}</span>
                      </td>
                      <td className={cn(TD, "num text-right text-ink")}>{rm(sen(b.total))}</td>
                      <td className={cn(TD, "num text-right text-ink-2")}>{b.status === "open" ? rm(owed(b)) : "-"}</td>
                      <td className={TD}>
                        {canEdit && b.status === "open" && (
                          <Link href={`${base}/payments-made?bill=${b.id}`} className={buttonClass("ghost", "sm")}>
                            Pay
                          </Link>
                        )}
                      </td>
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
