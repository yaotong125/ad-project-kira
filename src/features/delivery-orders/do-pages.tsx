import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountOptions, todayMY } from "@/features/books/load";
import { fromSen, rm } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";
import { DoActions } from "./controls";
import { DO_CHIP, dot } from "./copy";
import { DoForm } from "./do-form";
import { listDeliveryOrders, loadDeliveryOrder } from "./load";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const TAB = "-mb-px border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors";
const TAX: Record<string, string> = { none: "No SST", sst_6: "SST 6%", sst_8: "SST 8%", sales_5: "Sales tax 5%", sales_10: "Sales tax 10%", exempt: "Exempt" };

async function customers(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, orgId: string) {
  const { data } = await supabase.from("contacts").select("name").eq("org_id", orgId).eq("is_active", true).in("kind", ["customer", "both"]).order("name");
  return (data ?? []).map((c) => c.name);
}

/**
 * /{slug}/delivery-orders: lejar.ai's Delivery orders (observed 2026-11-23): "Create a delivery order" form on
 * the page for writers, tabs All / Open / Converted / Void, columns DO no., Customer, DO date, Status, Original, MYR base.
 */
export async function DoListPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const canEdit = ctx.role !== "viewer";
  const tab = (["open", "converted", "void"] as const).find((k) => k === first(sp.tab)) ?? "all";
  const today = todayMY();
  const [rows, accounts, names, { data: next }] = await Promise.all([
    listDeliveryOrders(supabase, ctx.org.id),
    canEdit ? accountOptions(supabase, ctx.org.id) : Promise.resolve([]),
    canEdit ? customers(supabase, ctx.org.id) : Promise.resolve([]),
    canEdit ? supabase.rpc("next_do_number", { p_org: ctx.org.id, p_on: today }) : Promise.resolve({ data: null }),
  ]);
  const count = (k: string) => (k === "all" ? rows.length : rows.filter((r) => r.status === k).length);
  const visible = rows.filter((r) => tab === "all" || r.status === tab);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={dot(lang, "deliveryOrders.list.title")}
        sub={
          <>
            {ctx.org.legal_name} ·{" "}
            <abbr title={lang === "ms" ? "Barang yang diserahkan kepada pelanggan; tiada apa direkodkan ke lejar sehingga ditukar menjadi invois." : "Goods handed to a customer; nothing posts to the ledger until the DO is converted to an invoice."} className="cursor-help no-underline underline decoration-dotted underline-offset-2">
              {dot(lang, "deliveryOrders.list.term")}
            </abbr>{" "}
            · {rows.length} {dot(lang, rows.length === 1 ? "deliveryOrders.list.countOne" : "deliveryOrders.list.countMany")}
          </>
        }
      />
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-[13.5px] font-semibold text-ink">{dot(lang, "deliveryOrders.list.createTitle")}</h2>
        {canEdit ? (
          <DoForm slug={ctx.org.slug} lang={lang} accounts={accounts} customers={names} nextNumber={(next as string) ?? ""} initial={{ customer: "", number: "", date: today, notes: "", lines: [] }} />
        ) : (
          <p className="text-[12.5px] text-muted">{dot(lang, "deliveryOrders.list.readOnly")}</p>
        )}
      </section>
      <nav className="flex gap-1 border-b border-border">
        {(["all", "open", "converted", "void"] as const).map((k) => (
          <Link key={k} href={`${base}/delivery-orders${k === "all" ? "" : `?tab=${k}`}`} className={cn(TAB, tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2")}>
            {dot(lang, `deliveryOrders.list.tab.${k}`)} <span className="ml-1 text-muted">{count(k)}</span>
          </Link>
        ))}
      </nav>
      {visible.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-10 text-center">
          <p className="text-[13.5px] font-medium text-ink">{rows.length === 0 ? dot(lang, "deliveryOrders.list.empty.title") : dot(lang, "deliveryOrders.list.empty.view")}</p>
          {rows.length === 0 && canEdit && <p className="mt-1 text-[12.5px] text-muted">{dot(lang, "deliveryOrders.list.empty.body")}</p>}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="do-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>{dot(lang, "deliveryOrders.list.th.number")}</th>
                <th className={cn(TH, "text-left")}>{dot(lang, "deliveryOrders.list.th.customer")}</th>
                <th className={cn(TH, "text-left")}>{dot(lang, "deliveryOrders.list.th.date")}</th>
                <th className={cn(TH, "text-left")}>{dot(lang, "deliveryOrders.list.th.status")}</th>
                <th className={cn(TH, "text-right")}>{dot(lang, "deliveryOrders.list.th.original")}</th>
                <th className={cn(TH, "text-right")}>{dot(lang, "deliveryOrders.list.th.myrBase")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className={TD}>
                    <Link href={`${base}/delivery-orders/${r.id}`} className="num font-medium text-ink underline-offset-2 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className={cn(TD, "text-ink")}>{r.customer}</td>
                  <td className={cn(TD, "num text-ink-2")}>{r.date}</td>
                  <td className={TD}>
                    <span className={DO_CHIP[r.status]}>{dot(lang, `status.${r.status}`)}</span>
                  </td>
                  <td className={cn(TD, "text-right text-muted")}>–</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** /{slug}/delivery-orders/[id]: lejar.ai's DO page (observed on the demo's open and converted DOs). */
export async function DoDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const d = /^[0-9a-f-]{36}$/.test(id) ? await loadDeliveryOrder(supabase, ctx.org.id, id) : null;
  if (!d) notFound();
  const today = todayMY();
  const { data: nextInv } = d.status === "open" ? await supabase.rpc("next_doc_number", { p_org: ctx.org.id, p_prefix: "INV", p_on: today }) : { data: null };
  const FIELD = "text-[12.5px] text-muted";
  const VALUE = "mt-0.5 text-[13px] text-ink";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/delivery-orders`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" />
          {dot(lang, "deliveryOrders.detail.back")}
        </Link>
      </div>
      <PageHeader
        title={dot(lang, "deliveryOrders.detail.title", { number: d.number })}
        sub={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className={DO_CHIP[d.status]} data-testid="do-status">
              {dot(lang, `status.${d.status}`)}
            </span>
            <span>{d.customer}</span>
          </span>
        }
      />
      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4" data-testid="do-summary">
        <div>
          <div className={FIELD}>{dot(lang, "deliveryOrders.detail.date")}</div>
          <div className={cn(VALUE, "num")}>{d.date}</div>
        </div>
        <div>
          <div className={FIELD}>{dot(lang, "deliveryOrders.detail.currency")}</div>
          <div className={VALUE}>MYR</div>
        </div>
        <div>
          <div className={FIELD}>{dot(lang, "deliveryOrders.detail.totalBase")}</div>
          <div className={cn(VALUE, "num-sans font-semibold")}>{rm(d.total)}</div>
        </div>
        {d.invoiceId && (
          <div>
            <div className={FIELD}>{dot(lang, "deliveryOrders.detail.convertedTo")}</div>
            <Link href={`${base}/invoices/${d.invoiceId}`} className="mt-0.5 inline-block text-[13px] text-brand hover:underline">
              {d.invoiceNumber ?? d.invoiceId}
            </Link>
          </div>
        )}
      </div>
      {d.notes && (
        <div>
          <div className={FIELD}>{dot(lang, "deliveryOrders.detail.notes")}</div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-ink-2">{d.notes}</p>
        </div>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">{dot(lang, "deliveryOrders.detail.lines")}</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="do-lines">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>#</th>
                <th className={cn(TH, "text-left")}>{dot(lang, "deliveryOrders.detail.th.description")}</th>
                <th className={cn(TH, "text-right")}>{dot(lang, "deliveryOrders.detail.th.quantity")}</th>
                <th className={cn(TH, "text-left")}>{dot(lang, "deliveryOrders.detail.th.account")}</th>
                <th className={cn(TH, "text-left")}>{dot(lang, "deliveryOrders.detail.th.tax")}</th>
                <th className={cn(TH, "text-right")}>{dot(lang, "deliveryOrders.detail.th.amountMyr")}</th>
                <th className={cn(TH, "text-right")}>{dot(lang, "deliveryOrders.detail.th.taxMyr")}</th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.no} className="border-t border-border">
                  <td className={cn(TD, "text-ink-2")}>{l.no}</td>
                  <td className={cn(TD, "text-ink")}>{l.description}</td>
                  <td className={cn(TD, "num text-right text-ink-2")}>{l.quantity}</td>
                  <td className={cn(TD, "num text-ink-2")}>{l.accountCode}</td>
                  <td className={cn(TD, "text-ink-2")}>{TAX[l.taxCode] ?? l.taxCode}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(l.amount)}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(l.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {ctx.role !== "viewer" && <DoActions slug={ctx.org.slug} id={d.id} status={d.status} invoiceVoid={d.invoiceVoid} lang={lang} today={today} nextInvoiceNumber={(nextInv as string) ?? ""} />}
    </div>
  );
}

/** /{slug}/delivery-orders/[id]/edit: "Edit delivery order {number}" (open DOs). */
export async function DoEditPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const lang = ctx.lang;
  const d = /^[0-9a-f-]{36}$/.test(id) ? await loadDeliveryOrder(supabase, ctx.org.id, id) : null;
  if (!d || ctx.role === "viewer" || d.status !== "open") notFound();
  const [accounts, names] = await Promise.all([accountOptions(supabase, ctx.org.id), customers(supabase, ctx.org.id)]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/${ctx.org.slug}/delivery-orders/${d.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" />
          {dot(lang, "deliveryOrders.detail.title", { number: d.number })}
        </Link>
      </div>
      <PageHeader title={dot(lang, "deliveryOrders.edit.title", { number: d.number })} sub={dot(lang, "deliveryOrders.edit.sub")} />
      <div className="card p-4">
        <DoForm
          slug={ctx.org.slug}
          lang={lang}
          accounts={accounts}
          customers={names}
          nextNumber={d.number}
          initial={{
            id: d.id,
            customer: d.customer,
            number: d.number,
            date: d.date,
            notes: d.notes ?? "",
            lines: d.lines.map((l) => ({ description: l.description, accountCode: l.accountCode, quantity: String(l.quantity), amount: fromSen(l.unit).replace(/,/g, ""), taxCode: l.taxCode })),
          }}
        />
      </div>
    </div>
  );
}
