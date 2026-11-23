import type { Metadata } from "next";
import Link from "next/link";
import { accountOptions, reviewDraft, todayMY } from "@/features/books/load";
import { rm, toSen } from "@/features/books/money";
import { STATUS_CHIP, vt } from "@/features/invoices/copy";
import { InvoiceForm } from "@/features/invoices/invoice-form";
import { blankLine, type FormLine } from "@/features/invoices/lines";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Invoices", robots: { index: false } };

const PAGE_SIZE = 50;
const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const TAB = "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors max-sm:mb-0";
const TABS = ["all", "draft", "open", "paid", "void"] as const;

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
 * /{slug}/invoices: lejar.ai's Invoices page (observed 2026-11-22): receivable totals, "Raise an
 * invoice" (open with ?new=1, pre-filled from the AI Inbox with ?aiDraft=, and on its own while the
 * entity has no invoices), tabs, search and the list.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const { lang } = ctx;
  const t = (k: Parameters<typeof vt>[1], v?: Record<string, string | number>) => vt(lang, k, v);
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const today = todayMY();
  const canEdit = ctx.role !== "viewer";
  const tab = (TABS as readonly string[]).includes(first(sp.tab) ?? "") ? (first(sp.tab) as (typeof TABS)[number]) : "all";
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  const showVoid = first(sp.showVoid) === "1";
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const aiDraftId = first(sp.aiDraft);

  const [{ data: all }, rawDraft] = await Promise.all([
    supabase.from("invoices").select("id, status, total, paid_amount, amount_due, due_date").eq("org_id", ctx.org.id),
    canEdit ? reviewDraft(supabase, ctx.org.id, aiDraftId) : Promise.resolve(null),
  ]);
  const draft = rawDraft?.draftType === "invoice" ? rawDraft : null;
  const rowsAll = all ?? [];
  const sen = (v: unknown) => toSen(String(v)) ?? 0;
  const open = rowsAll.filter((r) => r.status === "open");
  const owed = (r: { amount_due: unknown }) => sen(r.amount_due);
  const outstanding = open.reduce((s, r) => s + owed(r), 0);
  const overdue = open.filter((r) => r.due_date && r.due_date < today).reduce((s, r) => s + owed(r), 0);
  const counts = Object.fromEntries(TABS.map((k) => [k, k === "all" ? rowsAll.filter((r) => showVoid || r.status !== "void").length : rowsAll.filter((r) => r.status === k).length]));

  let query = supabase
    .from("invoices")
    .select("id, invoice_number, invoice_date, due_date, status, total, contacts(name)", { count: "exact" })
    .eq("org_id", ctx.org.id);
  if (tab !== "all") query = query.eq("status", tab);
  else if (!showVoid) query = query.neq("status", "void");
  if (q) {
    const { data: hits } = await supabase.from("contacts").select("id").eq("org_id", ctx.org.id).ilike("name", `%${q}%`);
    const ids = (hits ?? []).map((h) => h.id);
    const esc = q.replace(/[,()%]/g, " ");
    query = query.or([`invoice_number.ilike.%${esc}%`, ...(ids.length ? [`contact_id.in.(${ids.join(",")})`] : [])].join(","));
  }
  const { data: list, count } = await query
    .order("invoice_date", { ascending: false })
    .order("invoice_number", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const formOpen = canEdit && (first(sp.new) === "1" || Boolean(aiDraftId) || rowsAll.length === 0);
  let form = null;
  if (formOpen) {
    const date = draft?.proposal.documentDate ?? today;
    const [accounts, { data: customers }, { data: suggested }, { data: orgPrefs }] = await Promise.all([
      accountOptions(supabase, ctx.org.id),
      supabase.from("contacts").select("id, name, default_payment_terms_days").eq("org_id", ctx.org.id).eq("is_active", true).in("kind", ["customer", "both"]).order("name"),
      supabase.rpc("next_doc_number", { p_org: ctx.org.id, p_prefix: "INV", p_on: date }),
      supabase.from("organizations").select("default_pricing_mode").eq("id", ctx.org.id).single(),
    ]);
    const revenue = new Set(accounts.filter((a) => a.type === "revenue").map((a) => a.code));
    const lines: FormLine[] = draft
      ? draft.proposal.lines.map((l) => ({
          ...blankLine(revenue.has(l.accountCode) ? l.accountCode : "600-0000"),
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxCode: ["none", "sst_6", "sst_8", "sales_5", "sales_10"].includes(l.taxCode) ? l.taxCode : "none",
        }))
      : [];
    form = (
      <>
        {aiDraftId && !draft && (
          <p role="status" className="rounded border border-warning/40 bg-warning-soft px-3 py-2 text-[13px] text-ink-2">
            This inbox document was already recorded or dismissed, or is not a sales invoice. <Link className="underline" href={`${base}/inbox`}>Back to the AI Inbox</Link>
          </p>
        )}
        <InvoiceForm
          key={draft?.id ?? "new"}
          orgSlug={ctx.org.slug}
          lang={lang}
          accounts={accounts}
          customers={(customers ?? []).map((c) => ({ id: c.id, name: c.name, terms: c.default_payment_terms_days }))}
          suggestedNumber={suggested ?? ""}
          initial={{
            invoiceId: null,
            customerName: draft?.proposal.counterparty?.name ?? "",
            invoiceNumber: draft?.proposal.documentNumber ?? null,
            invoiceDate: date,
            dueDate: draft?.proposal.dueDate ?? "",
            pricingMode: orgPrefs?.default_pricing_mode === "inclusive" ? "inclusive" : "exclusive",
            notes: "",
            lines,
          }}
          draft={draft ? { id: draft.id, confidence: draft.confidence, printedTotal: draft.proposal.total, sourceDocumentId: draft.sourceDocumentId, source: draft.source } : null}
          closeHref={draft ? `${base}/inbox` : `${base}/invoices`}
        />
      </>
    );
  }

  const href = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const merged = { tab: tab === "all" ? undefined : tab, q: q || undefined, showVoid: showVoid ? "1" : undefined, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) s.set(k, v);
    const str = s.toString();
    return `${base}/invoices${str ? `?${str}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("invoices.list.title")}
        sub={
          <>
            {ctx.org.legal_name} · {t("invoices.list.term")} · <span className="text-ink">{rowsAll.length}</span>{" "}
            {rowsAll.length === 1 ? t("invoices.list.countOne") : t("invoices.list.countMany")}
          </>
        }
      />
      <div className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label={t("invoices.list.stat.outstanding")} value={rm(outstanding)} note="Net of receipts" />
        <Stat label={t("invoices.list.stat.overdue")} value={rm(overdue)} note="Past the due date" />
        <Stat label={t("invoices.list.stat.current")} value={rm(outstanding - overdue)} note={t("invoices.list.stat.currentSub")} />
      </div>
      {!canEdit && <p className="card px-4 py-3.5 text-[13px] text-muted">{t("invoices.list.readOnly")}</p>}
      {first(sp.deleted) === "1" && (
        <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          Draft deleted.
        </p>
      )}
      {form ??
        (canEdit && (
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Link href={`${base}/inbox`} className={buttonClass("secondary")}>
              {t("invoices.new.uploadToInbox")}
            </Link>
            <Link href={`${base}/invoices?new=1`} className={buttonClass("primary")}>
              {t("invoices.new.button")}
            </Link>
          </div>
        ))}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 border-b border-border max-sm:max-w-full max-sm:overflow-x-auto max-sm:border-b-0 max-sm:shadow-[inset_0_-1px_0_var(--color-border)]">
            {TABS.map((k) => (
              <Link key={k} href={href({ tab: k === "all" ? undefined : k, page: undefined })} className={cn(TAB, tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2")}>
                {t(`invoices.list.tab.${k}`)}
                <span className="num rounded-full bg-surface-2 px-1.5 py-px text-[11.5px] font-semibold text-muted">{counts[k]}</span>
              </Link>
            ))}
          </div>
          <form method="get" action={`${base}/invoices`} className="flex items-center gap-2">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            <input
              type="search"
              name="q"
              defaultValue={q}
              aria-label={t("invoices.list.search.aria")}
              placeholder={`${t("invoices.list.search.lead")} — ${t("invoices.list.search.tail")}`}
              className="h-[30px] w-[260px] rounded-[var(--radius)] border border-border-strong bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-ink"
            />
          </form>
        </div>
        <Link href={href({ showVoid: showVoid ? undefined : "1", page: undefined })} className="flex items-center gap-2 self-end text-[12.5px] text-ink-2">
          <input type="checkbox" readOnly checked={!showVoid} className="accent-brand" tabIndex={-1} aria-hidden="true" />
          Do not display voided transactions
        </Link>
        {(list ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-12 text-center">
            {q ? (
              <>
                <p className="text-sm font-medium text-ink">{t("invoices.list.empty.search", { q })}</p>
                <div className="text-[13px] text-muted">{t("invoices.list.empty.searchHint")}</div>
              </>
            ) : rowsAll.length === 0 ? (
              <>
                <p className="text-sm font-medium text-ink">{t("invoices.list.empty.title")}</p>
                <div className="text-[13px] text-muted">{canEdit ? t("invoices.list.empty.writer") : t("invoices.list.empty.reader")}</div>
                {canEdit && (
                  <div className="mt-3">
                    <Link href={`${base}/contacts?type=customer&new=1`} className={buttonClass("secondary", "sm")}>
                      {t("invoices.list.empty.addCustomer")}
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm font-medium text-ink">{t("invoices.list.empty.view")}</p>
            )}
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr className="border-t border-border">
                  <th className={cn(TH, "text-left")}>{t("invoices.list.th.number")}</th>
                  <th className={cn(TH, "text-left")}>{t("invoices.form.customer")}</th>
                  <th className={cn(TH, "text-left")}>{t("invoices.form.invoiceDate")}</th>
                  <th className={cn(TH, "text-left")}>{t("invoices.form.dueDate")}</th>
                  <th className={cn(TH, "text-left")}>{t("invoices.list.th.status")}</th>
                  <th className={cn(TH, "text-right")}>{t("invoices.form.total")}</th>
                </tr>
              </thead>
              <tbody>
                {(list ?? []).map((r) => {
                  const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
                  const [chip, label] = STATUS_CHIP[r.status] ?? ["chip", "invoices.list.tab.all"];
                  const late = r.status === "open" && r.due_date && r.due_date < today;
                  return (
                    <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                      <td className={cn(TD, "num text-ink")}>
                        <Link href={`${base}/invoices/${r.id}`} className="hover:underline">
                          {r.invoice_number}
                        </Link>
                      </td>
                      <td className={cn(TD, "text-ink-2")}>{c?.name ?? "-"}</td>
                      <td className={cn(TD, "num-sans text-ink-2")}>{r.invoice_date}</td>
                      <td className={cn(TD, "num-sans", late ? "text-negative" : "text-ink-2")}>{r.due_date ? t("invoices.list.due", { date: r.due_date }) : t("invoices.list.noDue")}</td>
                      <td className={TD}>
                        <span className={chip}>{t(label)}</span>
                      </td>
                      <td className={cn(TD, "num text-right text-ink", r.status === "void" && "text-muted line-through")}>{rm(sen(r.total))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav aria-label={t("invoices.list.pagination")} className="flex items-center justify-end gap-2 text-[12.5px] text-muted">
            {page > 1 && (
              <Link className={buttonClass("secondary", "sm")} href={href({ page: String(page - 1) })}>
                ‹
              </Link>
            )}
            <span className="num-sans">
              {page} / {pages}
            </span>
            {page < pages && (
              <Link className={buttonClass("secondary", "sm")} href={href({ page: String(page + 1) })}>
                ›
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
