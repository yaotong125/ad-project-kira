import { ArrowLeft, ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { rm } from "@/features/books/money";
import type { SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { loadQuickInvoiceDetail, loadQuickInvoiceFormDeps, loadQuickInvoicesList } from "./load";
import { QuickInvoiceDetailActions, QuickInvoiceForm } from "./quick-invoices-client";
import type { QuickInvoiceFormInput, QuickInvoiceStatus } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

const STATUS_CHIP: Record<QuickInvoiceStatus, [string, string]> = {
  draft: ["chip", "Draft"],
  sent: ["chip pos", "Sent"],
};

/** /{slug}/quick-invoices: list of quick invoices with All / Drafts tabs. */
export async function QuickInvoicesListPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadQuickInvoicesList(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const ms = ctx.lang === "ms";
  const tab = sp.tab === "drafts" ? "drafts" : "all";
  const rows = tab === "drafts" ? data.items.filter((i) => i.status === "draft") : data.items;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {ms ? "Invois pantas" : "Quick invoices"}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · invoice a customer in under a minute ·{" "}
            <span className="num text-ink">{data.items.length}</span>{" "}
            {data.items.length === 1 ? "invoice" : "invoices"}
          </div>
        </div>
        {canEdit && (
          <Link href={`${base}/quick-invoices/new`} className={buttonClass("primary", "sm")}>
            <Plus size={14} aria-hidden="true" /> New quick invoice
          </Link>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-muted">
          Your viewer role is read-only. Ask an owner or admin to make changes.
        </div>
      )}

      <div className="flex gap-1 border-b border-border">
        {[
          { key: "all", label: `All (${data.items.length})`, href: `${base}/quick-invoices` },
          { key: "drafts", label: `Drafts (${data.draftCount})`, href: `${base}/quick-invoices?tab=drafts` },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors",
              tab === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-12 text-center">
          <p className="m-0 text-[14px] font-semibold text-ink">
            {tab === "drafts" && data.items.length > 0 ? "No quick invoices in this view" : "No quick invoices yet"}
          </p>
          <p className="m-0 max-w-md text-[12.5px] text-muted">
            {canEdit
              ? "Bill a customer without touching the ledger. Sending one adds a draft invoice to your books automatically."
              : "No quick invoices have been created yet."}
          </p>
          {canEdit && tab === "all" && (
            <div className="mt-2">
              <Link href={`${base}/quick-invoices/new`} className={buttonClass("primary", "sm")}>
                <Plus size={14} aria-hidden="true" /> New quick invoice
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="qi-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>Invoice no.</th>
                <th className={cn(TH, "text-left")}>Customer</th>
                <th className={cn(TH, "text-left")}>Invoice date</th>
                <th className={cn(TH, "text-left")}>Due</th>
                <th className={cn(TH, "text-left")}>Status</th>
                <th className={cn(TH, "text-right")}>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [chip, label] = STATUS_CHIP[r.status];
                return (
                  <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <Link href={`${base}/quick-invoices/${r.id}`} className="num font-medium text-ink hover:underline">
                        {r.invoiceNumber}
                      </Link>
                    </td>
                    <td className={cn(TD, "py-2")}>
                      <div className="font-medium text-ink">{r.customerName}</div>
                      {r.linkedInvoiceNumber && (
                        <div className="text-[11.5px] text-muted">Books: {r.linkedInvoiceNumber}</div>
                      )}
                    </td>
                    <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{r.invoiceDate}</td>
                    <td className={cn(TD, "num whitespace-nowrap text-ink-2")}>{r.dueDate ?? "–"}</td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <span className={chip}>{label}</span>
                    </td>
                    <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-ink")}>
                      {rm(r.totalSen)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** /{slug}/quick-invoices/new & /[id]/edit: create or edit a quick invoice draft. */
export async function QuickInvoiceFormPage({ ctx, editId }: { ctx: OrgContext; editId?: string }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const deps = await loadQuickInvoiceFormDeps(supabase, ctx.org.id);

  let initial: QuickInvoiceFormInput = {
    id: null,
    customerContactId: null,
    customerName: "",
    customerEmail: "",
    saveCustomer: true,
    invoiceNumber: "",
    invoiceDate: deps.today,
    dueDate: "",
    pricingMode: deps.profile.defaultPricingMode,
    incomeAccountCode: deps.profile.defaultIncomeAccountCode,
    notes: "",
    lines: [],
  };

  let editNumber: string | null = null;
  if (editId) {
    const existing = await loadQuickInvoiceDetail(supabase, ctx.org.id, editId);
    if (!existing || existing.status !== "draft") notFound();
    initial = existing.formInitial;
    editNumber = existing.invoiceNumber;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={editId ? `${base}/quick-invoices/${editId}` : `${base}/quick-invoices`}
          className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink"
        >
          <ArrowLeft size={13} aria-hidden="true" /> {editId ? `Back to ${editNumber}` : "Back to quick invoices"}
        </Link>
        <h1 className="m-0 mt-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          {editNumber ? `Edit ${editNumber}` : "New quick invoice"}
        </h1>
        <div className="mt-1 text-[12.5px] text-muted">
          {editNumber ? `${ctx.org.legal_name} · draft · changes apply when you save` : `${ctx.org.legal_name} · invoice a customer in under a minute`}
        </div>
      </div>

      <QuickInvoiceForm
        orgSlug={ctx.org.slug}
        initial={initial}
        customers={deps.customers}
        revenueAccounts={deps.revenueAccounts}
        profile={deps.profile}
        isEdit={Boolean(editId)}
      />
    </div>
  );
}

/** /{slug}/quick-invoices/[id]: preview PDF, download, edit draft, or Mark Sent into Books. */
export async function QuickInvoiceDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const qi = await loadQuickInvoiceDetail(supabase, ctx.org.id, id);
  if (!qi) notFound();
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const [chip, label] = STATUS_CHIP[qi.status];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/quick-invoices`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" /> Back to quick invoices
        </Link>
        <h1 className="m-0 mt-2 flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          <span>Invoice {qi.invoiceNumber}</span>
          <span className={chip} data-testid="qi-status">
            {label}
          </span>
        </h1>
        <div className="mt-1 text-[12.5px] text-muted">
          {qi.customerName}
          {qi.customerEmail ? ` · ${qi.customerEmail}` : ""} ·{" "}
          <span className="num text-ink">{qi.invoiceDate}</span> ·{" "}
          <span className="num-sans font-medium text-ink">{rm(qi.totalSen)}</span>
        </div>
      </div>

      <QuickInvoiceDetailActions
        orgSlug={ctx.org.slug}
        id={qi.id}
        invoiceNumber={qi.invoiceNumber}
        customerEmail={qi.customerEmail ?? ""}
        status={qi.status}
        canEdit={canEdit}
        linkedInvoiceId={qi.linkedInvoiceId}
        linkedInvoiceNumber={qi.linkedInvoiceNumber}
      />

      {qi.status === "sent" && (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3 text-[12.5px] text-ink-2">
          Marked as sent
          {qi.linkedInvoiceId ? (
            <>
              {" "}and added to your books as draft invoice{" "}
              <Link href={`${base}/invoices/${qi.linkedInvoiceId}`} className="num font-medium text-brand hover:underline">
                {qi.linkedInvoiceNumber ?? "Open invoice"}
              </Link>
              . Review and record it in Books when ready.
            </>
          ) : (
            "."
          )}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[12.5px]">
          <span className="font-medium text-ink">PDF preview</span>
          <a
            href={`${base}/quick-invoices/${qi.id}/pdf?inline=1`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand hover:underline"
          >
            Not showing? Open the PDF in a new tab <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2">
          <iframe
            key={qi.status}
            title={`Invoice ${qi.invoiceNumber} preview`}
            src={`${base}/quick-invoices/${qi.id}/pdf?inline=1&v=${qi.status}`}
            className="h-[760px] w-full border-0"
          />
        </div>
      </section>
    </div>
  );
}
