import type { Metadata } from "next";
import { nt } from "@/features/notes/copy";
import { listNotes } from "@/features/notes/load";
import { ct as creditText } from "@/features/credit/copy";
import { ApplyCreditButton, UndoCreditButton } from "@/features/credit/controls";
import { invoiceCreditApplications } from "@/features/credit/load";
import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountOptions, todayMY } from "@/features/books/load";
import { fromSen, rm, toSen } from "@/features/books/money";
import { STATUS_CHIP, vt } from "@/features/invoices/copy";
import { InvoiceActions } from "@/features/invoices/invoice-actions";
import { InvoiceForm } from "@/features/invoices/invoice-form";
import type { FormLine } from "@/features/invoices/lines";
import { loadInvoice } from "@/features/invoices/load";
import { loadInvoiceMyInvois } from "@/features/myinvois/load";
import { InvoiceMyInvoisPanel } from "@/features/myinvois/myinvois-client";
import { EmailDocumentButton } from "@/shared/email/email-document-button";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Invoice", robots: { index: false } };

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "border-b border-border px-[var(--pad-x)] py-2 align-top";
const TAX_LABEL: Record<string, "invoices.form.tax.none" | "invoices.form.tax.sst_6" | "invoices.form.tax.sst_8" | "invoices.form.tax.sales_5" | "invoices.form.tax.sales_10"> = {
  none: "invoices.form.tax.none",
  sst_6: "invoices.form.tax.sst_6",
  sst_8: "invoices.form.tax.sst_8",
  sales_5: "invoices.form.tax.sales_5",
  sales_10: "invoices.form.tax.sales_10",
};

/**
 * /{slug}/invoices/{id}: Kira's invoice page. lejar.ai's texts ("Back to invoices", "Invoice {number}",
 * Download PDF, Record invoice, Delete, Void, Journal entry); its layout was not observed (no invoice
 * was created on Lejar), so the arrangement is Kira's. Receipts, notes, MyInvois and history come later.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string; id: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org, id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const { lang } = ctx;
  const t = (k: Parameters<typeof vt>[1], v?: Record<string, string | number>) => vt(lang, k, v);
  const supabase = await createSupabaseServerClient();
  const inv = await loadInvoice(supabase, ctx.org.id, id);
  if (!inv) notFound();
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const saved = first(sp.saved);
  const [chip, label] = STATUS_CHIP[inv.status];

  if (canEdit && inv.status === "draft" && first(sp.edit) === "1") {
    const [accounts, { data: customers }] = await Promise.all([
      accountOptions(supabase, ctx.org.id),
      supabase.from("contacts").select("id, name, default_payment_terms_days").eq("org_id", ctx.org.id).eq("is_active", true).in("kind", ["customer", "both"]).order("name"),
    ]);
    const lines: FormLine[] = inv.invoice_lines.map((l) => ({
      description: l.description,
      accountCode: l.accounts?.code ?? "",
      quantity: String(Number(l.quantity)),
      unitPrice: Number(l.unit_price).toFixed(2),
      discountMode: (l.discount_mode ?? "") as FormLine["discountMode"],
      discountPercent: l.discount_percent ? String(Number(l.discount_percent)) : "",
      discountAmount: l.discount_mode ? (Number(l.unit_price) - Number(l.discounted_unit_price)).toFixed(2) : "",
      discountedUnitPrice: l.discount_mode ? Number(l.discounted_unit_price).toFixed(2) : "",
      taxCode: l.tax_code,
      classificationCode: l.classification_code ?? "",
    }));
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("invoices.edit.title", { number: inv.invoice_number })} sub={t("invoices.edit.subDraft")} />
        <InvoiceForm
          orgSlug={ctx.org.slug}
          lang={lang}
          accounts={accounts}
          customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, terms: c.default_payment_terms_days }))}
          suggestedNumber={inv.invoice_number}
          initial={{
            invoiceId: inv.id,
            customerName: inv.contacts.name,
            invoiceNumber: inv.invoice_number,
            invoiceDate: inv.invoice_date,
            dueDate: inv.due_date ?? "",
            pricingMode: inv.pricing_mode,
            notes: inv.notes ?? "",
            lines,
          }}
          draft={null}
          closeHref={`${base}/invoices/${inv.id}`}
          title={t("invoices.edit.title", { number: inv.invoice_number })}
        />
      </div>
    );
  }

  const c = inv.contacts;
  const { data: allocs } = await supabase
    .from("receipt_allocations")
    .select("amount, receipts!inner(id, receipt_date, reference, status)")
    .eq("invoice_id", inv.id);
  const receipts = (allocs ?? []).map((a) => {
    const r = (Array.isArray(a.receipts) ? a.receipts[0] : a.receipts) as { id: string; receipt_date: string; reference: string | null; status: string };
    return { ...r, amount: toSen(String(a.amount)) ?? 0 };
  });
  const received = receipts.filter((r) => r.status === "recorded").reduce((s, r) => s + r.amount, 0);
  const [{ data: due }, notes, applications] = await Promise.all([
    supabase.from("invoices").select("amount_due, notes_credit, contact_id").eq("id", inv.id).single(),
    listNotes(supabase, ctx.org.id, inv.id),
    invoiceCreditApplications(supabase, ctx.org.id, inv.id),
  ]);
  const { data: creditBal } = due?.contact_id
    ? await supabase.from("customer_credit_moves").select("amount").eq("org_id", ctx.org.id).eq("contact_id", due.contact_id).eq("status", "active")
    : { data: [] };
  const [{ data: fromDo }, { data: fromQuote }, myInvois] = await Promise.all([
    supabase.from("delivery_orders").select("id, do_number").eq("org_id", ctx.org.id).eq("invoice_id", inv.id).maybeSingle(),
    supabase.from("quotes").select("id, quote_number").eq("org_id", ctx.org.id).eq("invoice_id", inv.id).maybeSingle(),
    loadInvoiceMyInvois(supabase, ctx.org.id, inv.id),
  ]);
  const available = (creditBal ?? []).reduce((s2, m) => s2 + (toSen(String(m.amount)) ?? 0), 0);
  const owed = toSen(String(due?.amount_due ?? inv.total)) ?? 0;
  const credited = Number(due?.notes_credit ?? 0) > 0;
  const address = [c.address, [c.postcode, c.city].filter(Boolean).join(" "), c.state].filter(Boolean).join(", ");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/invoices`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" />
          {t("invoices.detail.back")}
        </Link>
      </div>
      <PageHeader
        title={t("invoices.detail.title", { number: inv.invoice_number })}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={chip}>{t(label)}</span>
            {credited && <span className="chip warn">{lang === "ms" ? "Dikreditkan" : "Credited"}</span>}
            <span>
              {c.name} · {inv.invoice_date}
              {inv.due_date ? ` · ${t("invoices.list.due", { date: inv.due_date })}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            <a href={`${base}/invoices/${inv.id}/pdf`} className={buttonClass("secondary")}>
              <Download size={14} aria-hidden="true" />
              {t("invoices.detail.downloadPdf")}
            </a>
            {canEdit && inv.status !== "void" && (
              <EmailDocumentButton
                orgSlug={ctx.org.slug}
                docType="invoice"
                docId={inv.id}
                docNumber={inv.invoice_number}
                defaultEmail={c.email ?? ""}
              />
            )}
            {canEdit && inv.status === "draft" && (
              <Link href={`${base}/invoices/${inv.id}?edit=1`} className={buttonClass("secondary")}>
                {t("invoices.detail.edit")}
              </Link>
            )}
          </>
        }
      />
      {saved && (
        <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          {inv.status === "draft" ? t("invoices.form.created", { number: inv.invoice_number }) : t("invoices.post.success")}
        </p>
      )}
      {inv.status === "void" && (
        <p className="rounded border border-border bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
          {t("invoices.detail.reversed", { date: inv.voided_on ?? "" })}. {inv.void_reason}
        </p>
      )}

      <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{t("invoices.form.customer")}</div>
          <Link href={`${base}/contacts/${c.id}`} className="mt-1 block text-[14px] font-medium text-ink hover:underline">
            {c.name}
          </Link>
          {address && <p className="m-0 mt-0.5 text-[12.5px] text-muted">{address}</p>}
          {(c.tin || c.registration_number) && <p className="m-0 mt-0.5 text-[12.5px] text-muted">{[c.tin && `TIN ${c.tin}`, c.registration_number].filter(Boolean).join(" · ")}</p>}
        </div>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12.5px]">
          <dt className="text-muted">{t("invoices.form.invoiceDate")}</dt>
          <dd className="num-sans m-0 text-ink">{inv.invoice_date}</dd>
          <dt className="text-muted">{t("invoices.form.dueDate")}</dt>
          <dd className="num-sans m-0 text-ink">{inv.due_date ?? t("invoices.list.noDue")}</dd>
          <dt className="text-muted">{t("shared.pricingMode.label")}</dt>
          <dd className="m-0 text-ink">{t(`shared.pricingMode.${inv.pricing_mode}`)}</dd>
          {inv.journal_entry_id && (
            <>
              <dt className="text-muted">{t("invoices.detail.journalEntry")}</dt>
              <dd className="m-0 text-ink">{t("invoices.detail.recorded")}</dd>
            </>
          )}
        </dl>
      </div>

      <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead className="bg-surface">
            <tr className="border-t border-border">
              <th className={cn(TH, "text-left")}>{t("invoices.form.description")}</th>
              <th className={cn(TH, "text-left")}>{t("invoices.form.revenueAccount")}</th>
              <th className={cn(TH, "text-right")}>{t("invoices.form.qty")}</th>
              <th className={cn(TH, "text-right")}>{t("invoices.form.unitPrice")}</th>
              <th className={cn(TH, "text-right")}>{t("invoices.form.newPrice")}</th>
              <th className={cn(TH, "text-left")}>{t("invoices.form.tax")}</th>
              <th className={cn(TH, "text-right")}>{t("invoices.detail.amountIn", { currency: "MYR" })}</th>
            </tr>
          </thead>
          <tbody>
            {inv.invoice_lines.map((l) => (
              <tr key={l.line_no} className="border-t border-border">
                <td className={cn(TD, "text-ink")}>
                  {l.description}
                  {l.classification_code && <div className="text-[11.5px] text-muted">e-Invoice {l.classification_code}</div>}
                </td>
                <td className={cn(TD, "text-ink-2")}>{l.accounts ? `${l.accounts.code} · ${l.accounts.name}` : "-"}</td>
                <td className={cn(TD, "num text-right text-ink-2")}>{Number(l.quantity)}</td>
                <td className={cn(TD, "num text-right text-ink-2")}>{fromSen(toSen(String(l.unit_price)) ?? 0)}</td>
                <td className={cn(TD, "num text-right text-ink-2")}>{l.discount_mode ? `${fromSen(toSen(String(l.discounted_unit_price)) ?? 0)}${l.discount_percent ? ` (−${Number(l.discount_percent)}%)` : ""}` : "-"}</td>
                <td className={cn(TD, "text-ink-2")}>
                  {t(TAX_LABEL[l.tax_code] ?? "invoices.form.tax.none")}
                  {Number(l.tax_amount) > 0 && <span className="num text-muted"> {fromSen(toSen(String(l.tax_amount)) ?? 0)}</span>}
                </td>
                <td className={cn(TD, "num text-right text-ink")}>{fromSen(toSen(String(l.amount)) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="m-0 ml-auto grid min-w-[260px] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[13px]">
        <dt className="text-muted">{inv.pricing_mode === "inclusive" ? t("shared.pricingMode.totalExcludingTax") : t("invoices.form.subtotal")}</dt>
        <dd className="num m-0 text-right text-ink">{rm(toSen(String(inv.subtotal)) ?? 0)}</dd>
        <dt className="text-muted">{inv.pricing_mode === "inclusive" ? t("shared.pricingMode.includedTax") : "SST"}</dt>
        <dd className="num m-0 text-right text-ink">{rm(toSen(String(inv.tax_total)) ?? 0)}</dd>
        <dt className="font-medium text-ink">{t("invoices.form.total")}</dt>
        <dd className="num m-0 text-right font-semibold text-ink">{rm(toSen(String(inv.total)) ?? 0)}</dd>
      </dl>
      {inv.notes && (
        <div className="card px-4 py-3">
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{t("invoices.form.notes")}</div>
          <p className="m-0 mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{inv.notes}</p>
        </div>
      )}
      {(fromDo || fromQuote) && (
        <p className="text-[12.5px] text-muted" data-testid="invoice-source">
          {fromDo && (
            <>
              {lang === "ms" ? "Daripada pesanan penghantaran" : "From delivery order"}{" "}
              <Link href={`${base}/delivery-orders/${fromDo.id}`} className="text-brand hover:underline">
                {fromDo.do_number}
              </Link>
            </>
          )}
          {fromQuote && (
            <>
              {lang === "ms" ? "Daripada sebut harga" : "From quote"}{" "}
              <Link href={`${base}/quotes/${fromQuote.id}`} className="text-brand hover:underline">
                {fromQuote.quote_number}
              </Link>
            </>
          )}
        </p>
      )}
      {inv.status !== "draft" && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[13.5px] font-semibold text-ink">
              {lang === "ms" ? "Resit" : "Receipts"}{" "}
              <span className="text-[12.5px] font-normal text-muted">
                · received {rm(received)} · owed {rm(owed)}
              </span>
            </h2>
            {canEdit && inv.status === "open" && (
              <Link href={`${base}/payments-received?invoice=${inv.id}`} className={buttonClass("primary", "sm")}>
                {t("invoices.detail.recordPayment")}
              </Link>
            )}
          </div>
          {(applications.length > 0 || (canEdit && inv.status === "open" && available > 0)) && (
            <div className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-border px-3 py-2.5" data-testid="credit-applied">
              {applications.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
                  <span className="text-ink-2">
                    {creditText(lang, "invoices.detail.creditApplied.on", { date: a.date })}{" "}
                    <span className={a.status === "active" ? "chip pos" : "chip"}>{creditText(lang, a.status === "active" ? "invoices.detail.applied" : "invoices.detail.undone")}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="num text-ink">{rm(a.amount)}</span>
                    {canEdit && a.status === "active" && <UndoCreditButton slug={ctx.org.slug} moveId={a.id} lang={lang} today={todayMY()} />}
                  </span>
                </div>
              ))}
              {canEdit && inv.status === "open" && available > 0 && (
                <ApplyCreditButton slug={ctx.org.slug} invoiceId={inv.id} today={todayMY()} label={creditText(lang, "invoices.detail.applyCredit", { amount: rm(available) })} />
              )}
            </div>
          )}
          {receipts.length === 0 ? (
            <p className="rounded-[var(--radius)] border border-dashed border-border px-3 py-2 text-[12.5px] text-muted">{lang === "ms" ? "Tiada resit direkodkan bagi invois ini." : "No receipts recorded against this invoice."}</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-surface">
                  <tr className="border-t border-border">
                    <th className={cn(TH, "text-left")}>{t("invoices.detail.th.date")}</th>
                    <th className={cn(TH, "text-left")}>{t("invoices.detail.th.reference")}</th>
                    <th className={cn(TH, "text-left")}>Status</th>
                    <th className={cn(TH, "text-right")}>{lang === "ms" ? "Digunakan pada invois ini" : "Applied to this invoice"}</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className={cn(TD, "num-sans text-ink-2")}>{r.receipt_date}</td>
                      <td className={cn(TD, "text-ink-2")}>{r.reference ?? "-"}</td>
                      <td className={TD}>
                        <span className={r.status === "void" ? "chip" : "chip pos"}>{r.status === "void" ? t("invoices.detail.void") : t("invoices.detail.recorded")}</span>
                      </td>
                      <td className={cn(TD, "num text-right text-ink")}>{rm(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
      {inv.status !== "draft" && (
        <section className="flex flex-col gap-2" data-testid="invoice-notes">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">{lang === "ms" ? "Nota kredit / debit / bayaran balik" : "Credit / debit / refund notes"}</h2>
          {notes.length > 0 && (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead className="bg-surface">
                  <tr className="border-t border-border">
                    <th className={cn(TH, "text-left")}>{nt(lang, "notes.list.kind")}</th>
                    <th className={cn(TH, "text-left")}>{nt(lang, "notes.list.number")}</th>
                    <th className={cn(TH, "text-left")}>Status</th>
                    <th className={cn(TH, "text-right")}>{nt(lang, "notes.list.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {notes.map((n) => (
                    <tr key={n.id} className="border-t border-border">
                      <td className={cn(TD, "text-ink-2")}>{nt(lang, `notes.kind.${n.kind}`)}</td>
                      <td className={TD}>
                        <Link href={`${base}/notes/${n.id}`} className="num text-ink underline-offset-2 hover:underline">
                          {n.number}
                        </Link>
                      </td>
                      <td className={TD}>
                        <span className={n.status === "recorded" ? "chip pos" : n.status === "void" ? "chip neg" : "chip"}>{n.status}</span>
                      </td>
                      <td className={cn(TD, "num text-right text-ink")}>{rm(n.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && inv.status !== "void" && (
            <div className="flex flex-wrap gap-3 text-[12.5px]">
              {(["credit", "debit", "refund"] as const).map((k) => (
                <Link key={k} href={`${base}/notes/new?invoiceId=${inv.id}&kind=${k}`} className="font-medium text-brand hover:underline">
                  {lang === "ms" ? `Keluarkan ${nt(lang, `notes.kind.${k}`).toLowerCase()}` : `Issue ${nt(lang, `notes.kind.${k}`).toLowerCase()}`}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
      {(inv.status === "open" || inv.status === "paid") && (
        <InvoiceMyInvoisPanel
          orgSlug={ctx.org.slug}
          invoiceId={inv.id}
          invoiceNumber={inv.invoice_number}
          enabled={myInvois.enabled}
          environment={myInvois.environment}
          canEdit={canEdit}
          latest={myInvois.latest}
        />
      )}
      {canEdit && <InvoiceActions orgSlug={ctx.org.slug} id={inv.id} status={inv.status} lang={lang} today={todayMY()} invoiceDate={inv.invoice_date} />}
    </div>
  );
}
