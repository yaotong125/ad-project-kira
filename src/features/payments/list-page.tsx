import Link from "next/link";
import { accountOptions, todayMY } from "@/features/books/load";
import { rm, toSen } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";
import { ct as creditText } from "@/features/credit/copy";
import { pt } from "./copy";
import { SettleForm, type OpenDoc } from "./settle-form";
import { VoidButton } from "./void-button";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const TAB = "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors max-sm:mb-0";
const sen = (v: unknown) => toSen(String(v)) ?? 0;
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/**
 * /{slug}/payments-received and /{slug}/payments-made: lejar.ai's lists (observed 2026-11-22): header,
 * "Record a receipt / payment" (open with ?new=1, ?invoice= / ?bill= pre-selects one), tabs All / Recorded
 * / Void, "Do not display voided transactions", and the table with Void.
 */
export async function PaymentsListPage({ kind, slug, sp }: { kind: "receipts" | "payments"; slug: string; sp: SearchParams }) {
  const ctx = await loadOrgContext(slug);
  const { lang } = ctx;
  const R = kind === "receipts";
  const t = (k: Parameters<typeof pt>[1], v?: Record<string, string | number>) => pt(lang, k, v);
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const path = R ? "payments-received" : "payments-made";
  const today = todayMY();
  const canEdit = ctx.role !== "viewer";
  const ms = lang === "ms";
  const rmFmt = rm;
  const kept = first(sp.credit);
  const tab = first(sp.tab) === "void" ? "void" : first(sp.tab) === "recorded" ? "recorded" : "all";
  const showVoid = first(sp.showVoid) === "1" || tab === "void";

  const rows = R
    ? (
        await supabase
          .from("receipts")
          .select("id, receipt_date, reference, amount, bank_charges, status, credit_amount, contacts(name), accounts(code, name), receipt_allocations(amount, invoices(invoice_number, contacts(name)))")
          .eq("org_id", ctx.org.id)
          .order("receipt_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200)
      ).data ?? []
    : (
        await supabase
          .from("payments")
          .select("id, payment_date, reference, amount, bank_charges, status, paid_by_owner, accounts(code, name), payment_allocations(amount, bills(bill_number, contacts(name)))")
          .eq("org_id", ctx.org.id)
          .order("payment_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200)
      ).data ?? [];
  type RowT = { id: string; date: string; reference: string | null; amount: number; status: string; bank: string; party: string; docs: string };
  const list: RowT[] = rows.map((r: Record<string, unknown>) => {
    const allocs = ((R ? r.receipt_allocations : r.payment_allocations) as Record<string, unknown>[]) ?? [];
    const docs = allocs.map((a) => one((R ? a.invoices : a.bills) as Record<string, unknown> | Record<string, unknown>[] | null));
    const parties = [...new Set(docs.map((d) => one(d?.contacts as { name: string } | { name: string }[] | null)?.name).filter(Boolean))];
    const acct = one(r.accounts as { code: string; name: string } | { code: string; name: string }[] | null);
    return {
      id: r.id as string,
      date: (R ? r.receipt_date : r.payment_date) as string,
      reference: r.reference as string | null,
      amount: sen(r.amount),
      status: r.status as string,
      bank: acct ? `${acct.code} · ${acct.name}` : "-",
      party: parties.length <= 1 ? (parties[0] ?? one(r.contacts as { name: string } | { name: string }[] | null)?.name ?? "-") : `${parties.length} suppliers`,
      docs: [...docs.map((d) => (R ? d?.invoice_number : d?.bill_number)).filter(Boolean), ...(R && Number(r.credit_amount) > 0 ? [ms ? `Kredit pelanggan ${rmFmt(sen(r.credit_amount))}` : `Customer credit ${rmFmt(sen(r.credit_amount))}`] : [])].join(", "),
    };
  });
  const visible = list.filter((r) => (tab === "void" ? r.status === "void" : tab === "recorded" ? r.status === "recorded" : showVoid || r.status !== "void"));
  const count = list.filter((r) => r.status === "recorded").length;

  const formOpen = canEdit && (first(sp.new) === "1" || Boolean(first(sp.invoice)) || Boolean(first(sp.bill)));
  let form = null;
  if (formOpen) {
    const accounts = await accountOptions(supabase, ctx.org.id);
    const docs: OpenDoc[] = R
      ? ((await supabase.from("invoices").select("id, invoice_number, invoice_date, due_date, total, paid_amount, amount_due, contact_id, contacts(name)").eq("org_id", ctx.org.id).eq("status", "open").order("invoice_date")).data ?? []).map((i) => ({
          id: i.id,
          number: i.invoice_number,
          partyId: i.contact_id,
          party: one(i.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
          date: i.invoice_date,
          dueDate: i.due_date,
          due: sen(i.amount_due),
        }))
      : ((await supabase.from("bills").select("id, bill_number, bill_date, due_date, total, paid_amount, amount_due, contact_id, contacts(name)").eq("org_id", ctx.org.id).eq("status", "open").order("bill_date")).data ?? []).map((b) => ({
          id: b.id,
          number: b.bill_number,
          partyId: b.contact_id,
          party: one(b.contacts as { name: string } | { name: string }[] | null)?.name ?? "",
          date: b.bill_date,
          dueDate: b.due_date,
          due: sen(b.amount_due),
        }));
    form = (
      <SettleForm
        mode={R ? "receipt" : "payment"}
        orgSlug={ctx.org.slug}
        lang={lang}
        cash={accounts.filter((a) => a.isCash).map((a) => ({ code: a.code, name: a.name }))}
        ownerAccounts={accounts.filter((a) => ["400-0400", "500-0300", "400-0200", "100-0200", "100-0100"].includes(a.code) || (a.type === "equity" && /capital/i.test(a.name) && !a.code.endsWith("-0000"))).map((a) => ({ code: a.code, name: a.name }))}
        docs={docs.filter((d) => d.due > 0)}
        today={today}
        preselect={first(sp.invoice) ?? first(sp.bill) ?? null}
      />
    );
  }

  const href = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ tab: tab === "all" ? undefined : tab, showVoid: showVoid && tab !== "void" ? "1" : undefined, ...p })) if (v) s.set(k, v);
    const q = s.toString();
    return `${base}/${path}${q ? `?${q}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={R ? t("receipts.list.title") : t("payments.list.title")}
        sub={
          <>
            {ctx.org.legal_name} · {R ? t("receipts.list.sub") : t("payments.list.sub")}
            {R && (
              <>
                {" "}
                · <span className="text-ink">{count}</span> {count === 1 ? t("receipts.list.countOne") : t("receipts.list.countMany")}
              </>
            )}
          </>
        }
      />
      {!canEdit && <p className="card px-4 py-3.5 text-[13px] text-muted">{R ? t("receipts.list.readOnly") : t("payments.list.readOnly")}</p>}
      {first(sp.recorded) === "1" && (
        <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          {R && kept ? creditText(lang, "receipts.form.creditKept", { amount: kept }) : R ? "Receipt recorded." : "Payment recorded."}
        </p>
      )}
      {form ??
        (canEdit && (
          <div className="flex justify-end">
            <Link href={`${base}/${path}?new=1`} className={buttonClass("primary")}>
              {R ? t("receipts.list.record") : t("payments.list.record")}
            </Link>
          </div>
        ))}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 border-b border-border">
            {(["all", "recorded", "void"] as const).map((k) => (
              <Link key={k} href={href({ tab: k === "all" ? undefined : k })} className={cn(TAB, tab === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2")}>
                {k === "all" ? t("payments.list.tab.all") : k === "recorded" ? t("payments.list.tab.posted") : t("payments.list.tab.void")}
                <span className="num rounded-full bg-surface-2 px-1.5 py-px text-[11.5px] font-semibold text-muted">{k === "all" ? list.length : list.filter((r) => r.status === k).length}</span>
              </Link>
            ))}
          </div>
          {tab === "all" && (
            <Link href={href({ showVoid: showVoid ? undefined : "1" })} className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <input type="checkbox" readOnly checked={!showVoid} className="accent-brand" tabIndex={-1} aria-hidden="true" />
              Do not display voided transactions
            </Link>
          )}
        </div>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm font-medium text-ink">{list.length === 0 ? (R ? t("receipts.list.empty.title") : t("payments.list.empty.title")) : R ? t("receipts.list.empty.view") : t("payments.list.empty.view")}</p>
            {list.length === 0 && <div className="text-[13px] text-muted">{R ? t("receipts.list.empty.body") : t("payments.list.empty.body")}</div>}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr>
                  <th className={TH}>{t("receipts.list.th.date")}</th>
                  <th className={TH}>{R ? t("receipts.list.th.customer") : t("payments.list.th.supplier")}</th>
                  <th className={TH}>{R ? "Invoices" : "Bills"}</th>
                  <th className={TH}>{t("receipts.list.th.reference")}</th>
                  <th className={TH}>{t("receipts.list.th.bank")}</th>
                  <th className={TH}>{t("receipts.list.th.status")}</th>
                  <th className={cn(TH, "text-right")}>Amount</th>
                  <th className={TH}>{t("receipts.list.th.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className={cn("transition-colors hover:bg-surface-2", r.status === "void" && "text-muted")}>
                    <td className={cn(TD, "num-sans text-ink-2")}>{r.date}</td>
                    <td className={cn(TD, "text-ink")}>{r.party}</td>
                    <td className={cn(TD, "num text-ink-2")}>{r.docs}</td>
                    <td className={cn(TD, "text-ink-2")}>{r.reference ?? "-"}</td>
                    <td className={cn(TD, "text-ink-2")}>{r.bank}</td>
                    <td className={TD}>
                      <span className={r.status === "void" ? "chip" : "chip pos"}>{r.status === "void" ? t("payments.list.tab.void") : t("payments.list.tab.posted")}</span>
                    </td>
                    <td className={cn(TD, "num text-right", r.status === "void" ? "line-through" : "text-ink")}>{rm(r.amount)}</td>
                    <td className={TD}>{canEdit && r.status === "recorded" && <VoidButton orgSlug={ctx.org.slug} id={r.id} kind={kind} lang={lang} minDate={r.date} today={today} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
