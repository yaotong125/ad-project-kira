import { ArrowLeft, Download, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountOptions, todayMY } from "@/features/books/load";
import { fromSen, rm } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";
import { QuoteActions } from "./controls";
import { QUOTE_CHIP, qt } from "./copy";
import { listQuotes, loadQuote, TAB_STATUSES } from "./load";
import { QuoteForm } from "./quote-form";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const TAB = "-mb-px border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors";
const stamp = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

async function customers(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, orgId: string) {
  const { data } = await supabase.from("contacts").select("name").eq("org_id", orgId).eq("is_active", true).in("kind", ["customer", "both"]).order("name");
  return (data ?? []).map((c) => c.name);
}

/** /{slug}/quotes: lejar.ai's Quotes (observed 2026-11-23): New quote panel, tabs, "Do not display voided transactions". */
export async function QuotesListPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const canEdit = ctx.role !== "viewer";
  const open = canEdit && first(sp.new) === "1";
  const tab = (["draft", "open", "closed", "converted"] as const).find((k) => k === first(sp.tab)) ?? "all";
  const showVoid = first(sp.showVoid) === "1";
  const quotes = await listQuotes(supabase, ctx.org.id);
  // Like lejar.ai's demo (All 9 of 10, Closed = expired + declined), voided quotes are left out of the counts.
  const count = (k: string) => quotes.filter((q) => q.status !== "void" && (k === "all" || TAB_STATUSES[k].includes(q.status))).length;
  const visible = quotes.filter((q) => (tab === "all" || TAB_STATUSES[tab].includes(q.status)) && (showVoid || q.status !== "void"));
  const href = (o: { tab?: string; showVoid?: boolean }) => {
    const p = new URLSearchParams();
    const tb = o.tab ?? tab;
    if (tb !== "all") p.set("tab", tb);
    if (o.showVoid ?? showVoid) p.set("showVoid", "1");
    const s = p.toString();
    return `${base}/quotes${s ? `?${s}` : ""}`;
  };

  let form = null;
  if (open) {
    const today = todayMY();
    const [accounts, names, { data: next }] = await Promise.all([accountOptions(supabase, ctx.org.id), customers(supabase, ctx.org.id), supabase.rpc("next_quote_number", { p_org: ctx.org.id, p_on: today })]);
    form = (
      <section className="card flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[13.5px] font-semibold text-ink">{qt(lang, "quotes.new.title")}</h2>
          <Link href={`${base}/quotes`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
            <X size={13} aria-hidden="true" /> {lang === "ms" ? "Tutup" : "Close"}
          </Link>
        </div>
        <QuoteForm slug={ctx.org.slug} lang={lang} accounts={accounts} customers={names} nextNumber={(next as string) ?? ""} initial={{ customer: "", number: "", date: today, expires: "", notes: "", lines: [] }} />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={qt(lang, "quotes.list.title")}
        sub={
          <>
            {ctx.org.legal_name} ·{" "}
            <abbr title={lang === "ms" ? "Tawaran harga sebelum kerja bermula; tiada apa direkodkan ke lejar sehingga ditukar menjadi invois." : "Price offers before work starts; nothing posts to the ledger until one is converted to an invoice."} className="cursor-help no-underline underline decoration-dotted underline-offset-2">
              {qt(lang, "quotes.list.term")}
            </abbr>{" "}
            · {quotes.length} {qt(lang, quotes.length === 1 ? "quotes.list.countOne" : "quotes.list.countMany")}
          </>
        }
        actions={
          canEdit && !open ? (
            <Link href={`${base}/quotes?new=1`} className={buttonClass("primary")}>
              {qt(lang, "quotes.new.button")}
            </Link>
          ) : null
        }
      />
      {!canEdit && <p className="text-[12.5px] text-muted">{qt(lang, "quotes.list.readOnly")}</p>}
      {form}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <nav className="flex gap-1">
          {(["all", "draft", "open", "closed", "converted"] as const).map((k) => (
            <Link key={k} href={href({ tab: k })} className={cn(TAB, tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2")}>
              {qt(lang, `quotes.list.tab.${k}`)} <span className="ml-1 text-muted">{count(k)}</span>
            </Link>
          ))}
        </nav>
        <Link href={href({ showVoid: !showVoid })} className="mb-2 flex items-center gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" readOnly checked={!showVoid} className="accent-brand" tabIndex={-1} aria-hidden="true" />
          {lang === "ms" ? "Jangan paparkan transaksi yang dibatalkan" : "Do not display voided transactions"}
        </Link>
      </div>
      {visible.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-10 text-center">
          <p className="text-[13.5px] font-medium text-ink">{quotes.length === 0 ? qt(lang, "quotes.list.empty.title") : qt(lang, "quotes.list.empty.view")}</p>
          {quotes.length === 0 && <p className="mt-1 text-[12.5px] text-muted">{qt(lang, canEdit ? "quotes.list.empty.writer" : "quotes.list.empty.reader")}</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="quotes-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.list.th.number")}</th>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.list.th.customer")}</th>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.list.th.date")}</th>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.list.th.expires")}</th>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.list.th.status")}</th>
                <th className={cn(TH, "text-right")}>{qt(lang, "quotes.list.th.original")}</th>
                <th className={cn(TH, "text-right")}>{qt(lang, "quotes.list.th.myrBase")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((q) => (
                <tr key={q.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className={TD}>
                    <Link href={`${base}/quotes/${q.id}`} className="num font-medium text-ink underline-offset-2 hover:underline">
                      {q.number}
                    </Link>
                  </td>
                  <td className={cn(TD, "text-ink")}>{q.customer}</td>
                  <td className={cn(TD, "num text-ink-2")}>{q.date}</td>
                  <td className={cn(TD, "num text-ink-2")}>{q.expires ?? "-"}</td>
                  <td className={TD}>
                    <span className={QUOTE_CHIP[q.status]}>{qt(lang, `status.${q.status}`)}</span>
                  </td>
                  <td className={cn(TD, "text-right text-muted")}>–</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(q.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** /{slug}/quotes/[id]: lejar.ai's quote page (observed on the demo's draft, converted, expired and declined quotes). */
export async function QuoteDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const ms = lang === "ms";
  const q = /^[0-9a-f-]{36}$/.test(id) ? await loadQuote(supabase, ctx.org.id, id) : null;
  if (!q) notFound();
  const today = todayMY();
  const { data: nextInv } = q.status === "accepted" ? await supabase.rpc("next_doc_number", { p_org: ctx.org.id, p_prefix: "INV", p_on: today }) : { data: null };
  const FIELD = "text-[12.5px] text-muted";
  const VALUE = "mt-0.5 text-[13px] text-ink";
  const pastExpiry = q.status === "sent" && q.expires && q.expires < today;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/quotes`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" />
          {qt(lang, "quotes.detail.back")}
        </Link>
      </div>
      <PageHeader
        title={qt(lang, "quotes.detail.title", { number: q.number })}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={QUOTE_CHIP[q.status]} data-testid="quote-status">
              {qt(lang, `status.${q.status}`)}
            </span>
            <span>{q.customer}</span>
          </span>
        }
        actions={
          <a href={`${base}/quotes/${q.id}/pdf`} className={buttonClass("secondary")}>
            <Download size={14} aria-hidden="true" />
            {qt(lang, "quotes.detail.downloadPdf")}
          </a>
        }
      />
      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4" data-testid="quote-summary">
        <div>
          <div className={FIELD}>{qt(lang, "quotes.detail.quoteDate")}</div>
          <div className={cn(VALUE, "num")}>{q.date}</div>
        </div>
        <div>
          <div className={FIELD}>{qt(lang, "quotes.detail.expires")}</div>
          <div className={cn(VALUE, "num")}>
            {q.expires ?? qt(lang, "quotes.detail.noExpiry")}
            {pastExpiry && <span className="ml-1.5 text-warning">{qt(lang, "quotes.detail.pastExpiry")}</span>}
          </div>
        </div>
        <div>
          <div className={FIELD}>{qt(lang, "quotes.detail.currency")}</div>
          <div className={VALUE}>MYR</div>
        </div>
        <div>
          <div className={FIELD}>{qt(lang, "quotes.detail.totalBase")}</div>
          <div className={cn(VALUE, "num-sans font-semibold")}>{rm(q.total)}</div>
        </div>
        {q.sentAt && (
          <div>
            <div className={FIELD}>{qt(lang, "quotes.detail.sent")}</div>
            <div className={cn(VALUE, "num")}>{stamp(q.sentAt)}</div>
          </div>
        )}
        {q.respondedAt && (
          <div>
            <div className={FIELD}>{qt(lang, "quotes.detail.responded")}</div>
            <div className={cn(VALUE, "num")}>{stamp(q.respondedAt)}</div>
          </div>
        )}
        {q.invoiceId && (
          <div>
            <div className={FIELD}>{qt(lang, "quotes.detail.convertedTo")}</div>
            <Link href={`${base}/invoices/${q.invoiceId}`} className="mt-0.5 inline-block text-[13px] text-brand hover:underline">
              {q.invoiceNumber ?? q.invoiceId}
            </Link>
          </div>
        )}
      </div>
      {q.notes && (
        <div>
          <div className={FIELD}>{qt(lang, "quotes.detail.notes")}</div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{q.notes}</p>
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">{qt(lang, "quotes.detail.lines")}</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="quote-lines">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>#</th>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.detail.th.description")}</th>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.detail.th.account")}</th>
                <th className={cn(TH, "text-left")}>{qt(lang, "quotes.detail.th.tax")}</th>
                <th className={cn(TH, "text-right")}>{qt(lang, "quotes.detail.th.amountMyr")}</th>
                <th className={cn(TH, "text-right")}>{qt(lang, "quotes.detail.th.taxMyr")}</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l) => (
                <tr key={l.no} className="border-t border-border">
                  <td className={cn(TD, "text-ink-2")}>{l.no}</td>
                  <td className={cn(TD, "text-ink")}>{l.description}</td>
                  <td className={cn(TD, "num text-ink-2")}>{l.accountCode}</td>
                  <td className={cn(TD, "text-ink-2")}>{qt(lang, `quotes.form.tax.${l.taxCode as "none"}`)}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(l.amount)}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(l.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {ctx.role !== "viewer" && <QuoteActions slug={ctx.org.slug} id={q.id} status={q.status} lang={lang} today={today} nextInvoiceNumber={(nextInv as string) ?? ""} />}
      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">{qt(lang, "quotes.detail.history")}</h2>
        {q.events.length === 0 ? (
          <p className="text-[12.5px] text-muted">{ms ? "Belum ada perubahan direkodkan." : "No changes recorded yet."}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-[12.5px]" data-testid="quote-history">
            {q.events.map((e, i) => (
              <li key={i} className="text-ink-2">
                <span className="num text-muted">{stamp(e.at)}</span> · <span className="font-medium text-ink">{e.action}</span>
                {e.detail ? ` · ${e.detail}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** /{slug}/quotes/[id]/edit: lejar.ai's "Edit quote {number}". */
export async function QuoteEditPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const lang = ctx.lang;
  const q = /^[0-9a-f-]{36}$/.test(id) ? await loadQuote(supabase, ctx.org.id, id) : null;
  if (!q || ctx.role === "viewer" || !["draft", "sent", "accepted"].includes(q.status)) notFound();
  const [accounts, names] = await Promise.all([accountOptions(supabase, ctx.org.id), customers(supabase, ctx.org.id)]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/${ctx.org.slug}/quotes/${q.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" />
          {qt(lang, "quotes.detail.title", { number: q.number })}
        </Link>
      </div>
      <PageHeader title={qt(lang, "quotes.edit.title", { number: q.number })} sub={qt(lang, q.status === "draft" ? "quotes.edit.subDraft" : "quotes.edit.subPosted")} />
      <div className="card p-4">
        <QuoteForm
          slug={ctx.org.slug}
          lang={lang}
          accounts={accounts}
          customers={names}
          nextNumber={q.number}
          editingPosted={q.status !== "draft"}
          initial={{ id: q.id, customer: q.customer, number: q.number, date: q.date, expires: q.expires ?? "", notes: q.notes ?? "", lines: q.lines.map((l) => ({ description: l.description, accountCode: l.accountCode, amount: fromSen(l.amount).replace(/,/g, ""), taxCode: l.taxCode })) }}
        />
      </div>
    </div>
  );
}
