import Link from "next/link";
import { controlAccounts } from "@/features/books/load";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { ControlAccountsForm } from "./control-accounts-form";
import { SettingsHeader } from "./settings-header";

const SUB = "shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors";
const SUB_TABS = [
  { href: "settings/control-accounts", label: "Control accounts" },
  { href: "settings/document-numbering", label: "Numbering" },
  { href: "settings/price-book", label: "Price book" },
  { href: "settings/exchange-rates", label: "Exchange rates" },
];

/**
 * /{slug}/settings/control-accounts: lejar.ai's Settings → Accounting → Control accounts (observed 2026-11-22).
 * Kira keeps AP, AR and the non-trade pair; FX gain/loss and withholding tax accounts are left out (Kira is
 * MYR-only and has no withholding tax yet).
 */
export async function ControlAccountsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const [{ data: accts }, control] = await Promise.all([
    supabase.from("accounts").select("id, code, name, type, is_cash").eq("org_id", ctx.org.id).eq("status", "active").order("code"),
    controlAccounts(supabase, ctx.org.id),
  ]);
  const accounts = (accts ?? []).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, isCash: Boolean(a.is_cash) }));
  const name = (code: string | null) => (code ? `${code} · ${accounts.find((a) => a.code === code)?.name ?? ""}` : null);
  const summary: [string, string | null][] = [
    ["Accounts Payable", name(control.codes.ap)],
    ["Accounts Receivable", name(control.codes.ar)],
    ["Non-trade Accounts Receivable", name(control.codes.nonTradeAr)],
    ["Non-trade Accounts Payable", name(control.codes.nonTradeAp)],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SettingsHeader base={base} legalName={ctx.org.legal_name} sub="Control accounts" active="accounting" />
        <div className="flex gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUB_TABS.map((t, i) => (
            <Link
              key={t.href}
              aria-current={i === 0 ? "page" : undefined}
              href={`${base}/${t.href}`}
              className={cn(SUB, i === 0 ? "bg-surface-2 text-ink" : "text-muted hover:bg-surface-2 hover:text-ink-2")}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[13.5px] font-semibold text-ink">Control accounts</h2>
          <p className="mt-1 max-w-prose text-[12.5px] leading-[1.55] text-muted">
            Control accounts are the ledger accounts Kira posts to automatically when you record bills, invoices, and payments: what you owe suppliers (Accounts
            Payable) and what customers owe you (Accounts Receivable). Kira picks these for you. If one was set wrong when this entity was created or migrated from
            another system, the books will not reconcile. Correct it here.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-[12.5px]" data-testid="control-summary">
            {summary.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="num text-ink">{value ?? <span className="chip warn">Not set</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
        <ControlAccountsForm
          slug={ctx.org.slug}
          accounts={accounts}
          canEdit={ctx.role === "owner"}
          initial={{ ap: control.codes.ap ?? "", ar: control.codes.ar ?? "", nonTradeAr: control.codes.nonTradeAr ?? "", nonTradeAp: control.codes.nonTradeAp ?? "" }}
        />
      </section>
    </div>
  );
}
