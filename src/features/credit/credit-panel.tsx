import Link from "next/link";
import { accountOptions, todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { ct } from "./copy";
import { PrepaymentForm } from "./controls";
import { customerCredit } from "./load";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

/** A customer's credit on their contact page: balance, history, and "Receive a prepayment". */
export async function CustomerCreditPanel({ ctx, contactId }: { ctx: OrgContext; contactId: string }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const ms = ctx.lang === "ms";
  const [{ balance, moves }, accounts] = await Promise.all([customerCredit(supabase, ctx.org.id, contactId), accountOptions(supabase, ctx.org.id)]);
  const what = (m: (typeof moves)[number]) => {
    if (m.kind === "apply")
      return (
        <>
          {ct(ctx.lang, "invoices.detail.creditApplied")} ·{" "}
          <Link href={`${base}/invoices/${m.invoiceId}`} className="text-brand hover:underline">
            {m.invoiceNumber}
          </Link>
        </>
      );
    if (m.kind === "note")
      return (
        <>
          {ms ? "Nota kredit" : "Credit note"}{" "}
          <Link href={`${base}/notes/${m.noteId}`} className="text-brand hover:underline">
            {m.noteNumber}
          </Link>
        </>
      );
    return <>{ms ? "Bayaran diterima" : "Payment received"}{m.reference ? ` · ${m.reference}` : ""}</>;
  };
  return (
    <section className="flex flex-col gap-3" data-testid="customer-credit">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">{ct(ctx.lang, "invoices.detail.customerCredit")}</h2>
        <span className="num-sans text-[16px] font-semibold text-ink" data-testid="credit-balance">
          {rm(balance)}
        </span>
      </div>
      {moves.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>{ms ? "Tarikh" : "Date"}</th>
                <th className={cn(TH, "text-left")}>{ms ? "Butiran" : "Details"}</th>
                <th className={cn(TH, "text-left")}>Status</th>
                <th className={cn(TH, "text-right")}>{ms ? "Amaun" : "Amount"}</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className={cn(TD, "num text-ink-2")}>{m.date}</td>
                  <td className={cn(TD, "text-ink")}>{what(m)}</td>
                  <td className={TD}>
                    <span className={m.status === "active" ? "chip pos" : "chip"}>
                      {m.status === "active" ? (m.kind === "apply" ? ct(ctx.lang, "invoices.detail.applied") : ms ? "tersedia" : "kept") : m.status === "undone" ? ct(ctx.lang, "invoices.detail.undone") : ms ? "batal" : "void"}
                    </span>
                  </td>
                  <td className={cn(TD, "num-sans text-right", m.amount < 0 ? "text-ink-2" : "text-ink")}>{rm(m.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ctx.role !== "viewer" && <PrepaymentForm slug={ctx.org.slug} lang={ctx.lang} contactId={contactId} banks={accounts.filter((a) => a.isCash)} today={todayMY()} />}
    </section>
  );
}
