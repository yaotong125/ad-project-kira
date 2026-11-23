import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountOptions, todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";
import { DraftBillControls, RecordSnButton, VoidBillControl, VoidSnControl } from "./controls";
import { st } from "./copy";
import { listSupplierNotes, loadBill, loadSupplierNote, type SnKind, type SnStatus } from "./load";
import { SnForm } from "./sn-form";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const FIELD = "text-[12.5px] text-muted";
const VALUE = "mt-0.5 text-[13px] text-ink";
const CHIP: Record<SnStatus, string> = { draft: "chip", recorded: "chip pos", void: "chip neg" };
const statusLabel = (s: SnStatus, ms: boolean) => ({ draft: ms ? "Draf" : "Draft", recorded: ms ? "Direkodkan" : "Recorded", void: ms ? "Batal" : "Void" })[s];
const BILL_STATUS: Record<string, [string, string, string]> = {
  open: ["chip brand", "Awaiting payment", "Menunggu pembayaran"],
  paid: ["chip pos", "Paid", "Dibayar"],
  void: ["chip neg", "Void", "Batal"],
  draft: ["chip", "Draft", "Draf"],
};
const TAX: Record<string, string> = { none: "No tax", sst_6: "SST 6%", sst_8: "SST 8%", sales_5: "Sales tax 5%", sales_10: "Sales tax 10%", exempt: "Exempt" };

/** /{slug}/bills/notes: lejar.ai's "Supplier credit / debit notes" list (observed 2026-11-23). */
export async function SnListPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const ms = lang === "ms";
  const notes = await listSupplierNotes(supabase, ctx.org.id);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={st(lang, "supplierNotes.list.title")} sub={`${ctx.org.legal_name} · ${notes.length} ${st(lang, notes.length === 1 ? "supplierNotes.list.countOne" : "supplierNotes.list.countMany")}`} />
      {notes.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-10 text-center">
          <p className="text-[13.5px] font-medium text-ink">{st(lang, "supplierNotes.list.emptyTitle")}</p>
          <p className="mt-1 text-[12.5px] text-muted">{st(lang, "supplierNotes.list.emptyBody")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="sn-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.list.kind")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.list.number")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.list.date")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.list.bill")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.list.status")}</th>
                <th className={cn(TH, "text-right")}>{st(lang, "supplierNotes.list.total")}</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className={cn(TD, "text-ink-2")}>{st(lang, `supplierNotes.kind.${n.kind}`)}</td>
                  <td className={TD}>
                    <Link href={`${base}/bills/notes/${n.id}`} className="num font-medium text-ink underline-offset-2 hover:underline">
                      {n.number}
                    </Link>
                  </td>
                  <td className={cn(TD, "num text-ink-2")}>{n.date}</td>
                  <td className={TD}>
                    <Link href={`${base}/bills/${n.billId}`} className="num text-ink-2 underline-offset-2 hover:underline">
                      {n.billNumber}
                    </Link>
                  </td>
                  <td className={TD}>
                    <span className={CHIP[n.status]}>{statusLabel(n.status, ms)}</span>
                  </td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(n.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** /{slug}/bills/notes/new?billId=&kind=: "Record a supplier credit / debit note". */
export async function SnNewPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const billId = first(sp.billId) ?? "";
  const kind: SnKind = first(sp.kind) === "debit" ? "debit" : "credit";
  const bill = /^[0-9a-f-]{36}$/.test(billId) ? await loadBill(supabase, ctx.org.id, billId) : null;
  if (!bill || ctx.role === "viewer" || !["open", "paid"].includes(bill.status)) notFound();
  const today = todayMY();
  const [accounts, cn1, dn1] = await Promise.all([
    accountOptions(supabase, ctx.org.id),
    supabase.rpc("next_supplier_note_number", { p_org: ctx.org.id, p_kind: "credit", p_on: today }),
    supabase.rpc("next_supplier_note_number", { p_org: ctx.org.id, p_kind: "debit", p_on: today }),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/bills/${bill.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline">
          <ArrowLeft size={13} aria-hidden="true" />
          {st(lang, "supplierNotes.new.backToBill", { bill: bill.number })}
        </Link>
      </div>
      <PageHeader title={st(lang, kind === "credit" ? "supplierNotes.new.title.credit" : "supplierNotes.new.title.debit")} sub={st(lang, "supplierNotes.new.againstBill", { bill: bill.number })} />
      <SnForm
        slug={ctx.org.slug}
        lang={lang}
        kind={kind}
        today={today}
        accounts={accounts}
        nextNumbers={{ credit: (cn1.data as string) ?? "", debit: (dn1.data as string) ?? "" }}
        bill={{ id: bill.id, number: bill.number, date: bill.date, creditable: bill.creditable, firstAccount: bill.lines[0]?.accountCode ?? "", firstTax: bill.lines[0]?.taxCode ?? "none" }}
      />
    </div>
  );
}

/** /{slug}/bills/notes/[id]: the supplier note (Record on a draft, Void). */
export async function SnDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const ms = lang === "ms";
  const n = /^[0-9a-f-]{36}$/.test(id) ? await loadSupplierNote(supabase, ctx.org.id, id) : null;
  if (!n) notFound();
  const canEdit = ctx.role !== "viewer";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/bills/notes`} className="text-[12.5px] text-brand hover:underline">
          {st(lang, "supplierNotes.detail.back")}
        </Link>
      </div>
      <div>
        <h1 className="m-0 flex flex-wrap items-center gap-2.5 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          {st(lang, `supplierNotes.detail.kind.${n.kind}`)} {n.number}
          <span className={CHIP[n.status]} data-testid="sn-status">
            {statusLabel(n.status, ms)}
          </span>
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {st(lang, "supplierNotes.detail.againstBill")}{" "}
          <Link href={`${base}/bills/${n.billId}`} className="text-brand hover:underline">
            {n.billNumber}
          </Link>
        </p>
      </div>
      <div className="card flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className={FIELD}>{st(lang, "supplierNotes.detail.noteDate")}</div>
            <div className={cn(VALUE, "num")}>{n.date}</div>
          </div>
          <div>
            <div className={FIELD}>{st(lang, "supplierNotes.detail.currency")}</div>
            <div className={VALUE}>MYR</div>
          </div>
          <div>
            <div className={FIELD}>{st(lang, "supplierNotes.detail.total")}</div>
            <div className={cn(VALUE, "num")}>{rm(n.total)}</div>
          </div>
        </div>
        <div>
          <div className={FIELD}>{st(lang, "supplierNotes.detail.reason")}</div>
          <div className={VALUE}>{n.reason}</div>
        </div>
        {n.journalEntryId && (
          <div>
            <div className={FIELD}>{st(lang, "supplierNotes.detail.journalEntry")}</div>
            <Link href={`${base}/ledger/entries/${n.journalEntryId}`} className="mt-0.5 inline-block text-[13px] text-brand hover:underline">
              {st(lang, "supplierNotes.detail.viewEntry")}
            </Link>
          </div>
        )}
        {n.status === "void" && (
          <p className="text-[12.5px] text-muted">
            {ms ? "Dibatalkan pada" : "Voided on"} {n.voidedOn}: {n.voidReason}
          </p>
        )}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">{st(lang, "supplierNotes.detail.lines")}</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="sn-lines">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>#</th>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.detail.description")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.detail.account")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "supplierNotes.detail.tax")}</th>
                <th className={cn(TH, "text-right")}>{st(lang, "supplierNotes.detail.amount")}</th>
                <th className={cn(TH, "text-right")}>{st(lang, "supplierNotes.detail.tax")}</th>
              </tr>
            </thead>
            <tbody>
              {n.lines.map((l) => (
                <tr key={l.no} className="border-t border-border">
                  <td className={cn(TD, "text-ink-2")}>{l.no}</td>
                  <td className={cn(TD, "text-ink")}>{l.description}</td>
                  <td className={cn(TD, "num text-ink-2")}>{l.account}</td>
                  <td className={cn(TD, "text-ink-2")}>{TAX[l.taxCode] ?? l.taxCode}</td>
                  <td className={cn(TD, "num text-right text-ink")}>{(l.amount / 100).toFixed(2)}</td>
                  <td className={cn(TD, "num text-right text-ink")}>{(l.tax / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {canEdit && n.status !== "void" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {n.status === "draft" && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[13.5px] font-semibold text-ink">{st(lang, "supplierNotes.detail.recordTitle")}</h2>
              <p className="text-[12.5px] text-muted">
                {st(lang, "supplierNotes.detail.recordLead")} {st(lang, n.kind === "credit" ? "supplierNotes.detail.recordCredit" : "supplierNotes.detail.recordDebit")}
              </p>
              <RecordSnButton slug={ctx.org.slug} id={n.id} billId={n.billId} lang={lang} />
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="text-[13.5px] font-semibold text-ink">{st(lang, "supplierNotes.detail.voidTitle")}</h2>
            {n.status === "recorded" && <p className="text-[12.5px] text-muted">{st(lang, "supplierNotes.detail.voidLead")}</p>}
            <VoidSnControl slug={ctx.org.slug} id={n.id} billId={n.billId} lang={lang} recorded={n.status === "recorded"} noteDate={n.date} today={todayMY()} />
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * /{slug}/bills/[id]: lejar.ai's bill page (observed 2026-11-23 on the demo's RB-MAINT-2026-11-19): status, supplier,
 * Bill date, Due date, Currency, Total, Paid, Outstanding, Journal entry, Notes, Lines, Supplier credit / debit notes
 * (with "Record supplier credit / debit note"), Payments and Void.
 */
export async function BillDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const ms = lang === "ms";
  const b = /^[0-9a-f-]{36}$/.test(id) ? await loadBill(supabase, ctx.org.id, id) : null;
  if (!b) notFound();
  const notes = await listSupplierNotes(supabase, ctx.org.id, b.id);
  const canEdit = ctx.role !== "viewer";
  const [chip, en, msLabel] = BILL_STATUS[b.status] ?? ["chip", b.status, b.status];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/bills`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" />
          {st(lang, "bills.detail.back")}
        </Link>
      </div>
      <PageHeader
        title={st(lang, "bills.detail.title", { number: b.number })}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={chip} data-testid="bill-status">
              {ms ? msLabel : en}
            </span>
            <span>{b.supplier}</span>
          </span>
        }
      />
      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4" data-testid="bill-summary">
        <div>
          <div className={FIELD}>{st(lang, "bills.detail.billDate")}</div>
          <div className={cn(VALUE, "num")}>{b.date}</div>
        </div>
        <div>
          <div className={FIELD}>{st(lang, "bills.detail.dueDate")}</div>
          <div className={cn(VALUE, "num")}>{b.dueDate ?? "-"}</div>
        </div>
        <div>
          <div className={FIELD}>{st(lang, "bills.detail.currency")}</div>
          <div className={VALUE}>MYR</div>
        </div>
        <div>
          <div className={FIELD}>{st(lang, "bills.detail.totalBase")}</div>
          <div className={cn(VALUE, "num-sans font-semibold")}>{rm(b.total)}</div>
        </div>
        <div>
          <div className={FIELD}>{st(lang, "bills.detail.paid")}</div>
          <div className={cn(VALUE, "num-sans")}>{rm(b.paid)}</div>
        </div>
        <div>
          <div className={FIELD}>{st(lang, "bills.detail.outstanding")}</div>
          <div className={cn(VALUE, "num-sans font-semibold")} data-testid="bill-outstanding">
            {rm(Math.max(b.due, 0))}
          </div>
        </div>
        {b.journalEntryId && (
          <div>
            <div className={FIELD}>{st(lang, "bills.detail.journalEntry")}</div>
            <Link href={`${base}/ledger/entries/${b.journalEntryId}`} className="mt-0.5 inline-block text-[13px] text-brand hover:underline">
              {ms ? "Lihat catatan" : "View entry"}
            </Link>
          </div>
        )}
      </div>
      {b.due < 0 && <p className="text-[12.5px] text-warning">{st(lang, "bills.detail.overCredit", { amount: rm(-b.due) })}</p>}
      {b.status === "void" && (
        <p className="text-[12.5px] text-muted">
          {ms ? "Dibatalkan pada" : "Voided on"} {b.voidedOn}: {b.voidReason}
        </p>
      )}
      {b.notes && (
        <div>
          <div className={FIELD}>{st(lang, "bills.detail.notes")}</div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{b.notes}</p>
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">{st(lang, "bills.detail.lines")}</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="bill-lines">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>#</th>
                <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.description")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.account")}</th>
                <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.tax")}</th>
                <th className={cn(TH, "text-right")}>{st(lang, "bills.detail.th.amountIn", { currency: "MYR" })}</th>
                <th className={cn(TH, "text-right")}>{st(lang, "bills.detail.th.taxIn", { currency: "MYR" })}</th>
              </tr>
            </thead>
            <tbody>
              {b.lines.map((l) => (
                <tr key={l.no} className="border-t border-border">
                  <td className={cn(TD, "text-ink-2")}>{l.no}</td>
                  <td className={cn(TD, "text-ink")}>{l.description}</td>
                  <td className={cn(TD, "num text-ink-2")}>{l.account}</td>
                  <td className={cn(TD, "text-ink-2")}>{TAX[l.taxCode] ?? l.taxCode}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(l.amount)}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(l.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {b.status !== "draft" && (
        <section className="flex flex-col gap-2" data-testid="bill-notes">
          <h2 className="text-[13.5px] font-semibold text-ink">{st(lang, "bills.detail.supplierNotes")}</h2>
          {notes.length > 0 && (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-surface">
                  <tr>
                    <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.kind")}</th>
                    <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.number")}</th>
                    <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.status")}</th>
                    <th className={cn(TH, "text-right")}>{st(lang, "bills.detail.th.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n) => (
                    <tr key={n.id} className="border-t border-border">
                      <td className={cn(TD, "text-ink-2")}>{st(lang, `bills.detail.note.${n.kind}`)}</td>
                      <td className={TD}>
                        <Link href={`${base}/bills/notes/${n.id}`} className="num text-ink underline-offset-2 hover:underline">
                          {n.number}
                        </Link>
                      </td>
                      <td className={TD}>
                        <span className={CHIP[n.status]}>{statusLabel(n.status, ms)}</span>
                      </td>
                      <td className={cn(TD, "num-sans text-right text-ink")}>{rm(n.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && (b.status === "open" || b.status === "paid") && (
            <div className="flex flex-wrap gap-3 text-[12.5px]">
              <Link href={`${base}/bills/notes/new?billId=${b.id}&kind=credit`} className="font-medium text-brand hover:underline">
                {st(lang, "bills.detail.recordCreditNote")}
              </Link>
              <Link href={`${base}/bills/notes/new?billId=${b.id}&kind=debit`} className="font-medium text-brand hover:underline">
                {st(lang, "bills.detail.recordDebitNote")}
              </Link>
            </div>
          )}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13.5px] font-semibold text-ink">{st(lang, "bills.detail.payments")}</h2>
          {canEdit && b.status === "open" && (
            <Link href={`${base}/payments-made?bill=${b.id}`} className="text-[12.5px] font-medium text-brand hover:underline">
              {ms ? "Rekod bayaran" : "Record payment"}
            </Link>
          )}
        </div>
        {b.payments.length === 0 ? (
          <p className="text-[12.5px] text-muted">{st(lang, "bills.detail.noPayments")}</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr>
                  <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.date")}</th>
                  <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.reference")}</th>
                  <th className={cn(TH, "text-left")}>{st(lang, "bills.detail.th.status")}</th>
                  <th className={cn(TH, "text-right")}>{st(lang, "bills.detail.th.applied")}</th>
                </tr>
              </thead>
              <tbody>
                {b.payments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className={cn(TD, "num text-ink-2")}>{p.date}</td>
                    <td className={cn(TD, "text-ink-2")}>{p.reference ?? "-"}</td>
                    <td className={TD}>
                      <span className={p.status === "void" ? "chip neg" : "chip pos"}>{p.status === "void" ? st(lang, "bills.detail.void") : st(lang, "bills.detail.recorded")}</span>
                    </td>
                    <td className={cn(TD, "num-sans text-right text-ink")}>{rm(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {canEdit && b.status === "draft" && (
        <section className="flex flex-col gap-2">
          <DraftBillControls slug={ctx.org.slug} id={b.id} lang={lang} />
        </section>
      )}
      {canEdit && b.status === "open" && (
        <section className="flex max-w-md flex-col gap-2">
          <h2 className="text-[13.5px] font-semibold text-ink">{st(lang, "bills.void.button")}</h2>
          <VoidBillControl slug={ctx.org.slug} id={b.id} lang={lang} billDate={b.date} today={todayMY()} />
        </section>
      )}
    </div>
  );
}
