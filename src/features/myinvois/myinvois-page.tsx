import { CheckCircle2, CircleAlert, CircleHelp, Settings } from "lucide-react";
import Link from "next/link";
import { rm } from "@/features/books/money";
import { SettingsHeader } from "@/features/settings/settings-header";
import type { SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { loadMyInvoisPageData, loadSupplierSetup } from "./load";
import { MyInvoisRowActions, MyInvoisSetupControls } from "./myinvois-client";
import { MYINVOIS_CHIP } from "./types";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "border-b border-border px-[var(--pad-x)] py-2.5 align-top";
const STAT =
  "flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5";
const STAT_V =
  "num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink max-sm:ml-auto max-sm:text-right";
const SUB = "shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors";

/** /{slug}/myinvois: LHDN MyInvois submission tracker & pre-flight compliance check. */
export async function MyInvoisPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const { setup, rows, counts } = await loadMyInvoisPageData(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canEdit = ctx.role !== "viewer";
  const tab =
    sp.tab === "to-submit" || sp.tab === "valid" || sp.tab === "attention" ? sp.tab : "all";

  const filtered =
    tab === "to-submit"
      ? rows.filter((r) => r.status === "not_submitted" || r.status === "cancelled")
      : tab === "valid"
        ? rows.filter((r) => r.status === "valid")
        : tab === "attention"
          ? rows.filter((r) => r.status === "rejected" || (r.status === "not_submitted" && r.buyerIssues.length > 0))
          : rows;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            <span>e-Invois</span>
            {setup.enabled ? (
              <span className="chip pos" data-testid="mi-ready-chip">
                {setup.environment === "production" ? "Production" : "Sandbox"} ready
              </span>
            ) : (
              <span className="chip warn" data-testid="mi-ready-chip">
                Not set up
              </span>
            )}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · LHDN MyInvois submissions &amp; compliance check
            {setup.mandateStart ? ` · mandate from ${setup.mandateStart}` : ""}
          </div>
          <details className="mt-1.5 max-w-[660px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] text-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <CircleHelp size={13} aria-hidden="true" /> Learn about this page
            </summary>
            <div className="mt-2 space-y-1.5 rounded-[var(--radius)] border border-border bg-surface p-3.5 text-[12.5px] leading-relaxed text-ink-2">
              <p className="m-0">
                Complete your supplier profile and verify your MyInvois setup once under Settings, e-Invois. After that,
                submit recorded sales invoices straight from this page or from each invoice.
              </p>
              <p className="m-0">
                Kira checks LHDN&apos;s required TIN, BRN/NRIC, MSIC, and classification fields, builds the UBL-JSON v1.1
                document, and tracks every validation UUID and cancellation within LHDN&apos;s 72-hour window.
              </p>
            </div>
          </details>
        </div>
        <Link href={`${base}/settings/e-invoice`} className={buttonClass("secondary", "sm")}>
          <Settings size={13} aria-hidden="true" /> e-Invois settings
        </Link>
      </div>

      {!setup.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3.5 text-[13px]">
          <div className="text-ink-2">
            <strong className="text-ink">MyInvois is not configured yet.</strong> Complete your supplier e-Invoice
            profile and verify setup in Settings to enable submissions.
          </div>
          <Link href={`${base}/settings/e-invoice`} className={buttonClass("primary", "sm")}>
            Set up e-Invois
          </Link>
        </div>
      )}

      <div className="card grid grid-cols-1 divide-y divide-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">To submit</div>
          <div className={STAT_V}>{counts.toSubmit}</div>
          <div className="text-[11.5px] text-muted">Recorded invoices</div>
        </div>
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Valid</div>
          <div className={STAT_V}>{counts.valid}</div>
          <div className="text-[11.5px] text-muted">Validated by LHDN</div>
        </div>
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Pending</div>
          <div className={STAT_V}>{counts.pending}</div>
          <div className="text-[11.5px] text-muted">Awaiting LHDN</div>
        </div>
        <div className={STAT}>
          <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">Needs attention</div>
          <div className={STAT_V}>{counts.attention}</div>
          <div className="text-[11.5px] text-muted">Rejected or missing TIN</div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {[
          { key: "all", label: `All (${counts.all})`, href: `${base}/myinvois` },
          { key: "to-submit", label: `To submit (${counts.toSubmit})`, href: `${base}/myinvois?tab=to-submit` },
          { key: "valid", label: `Valid (${counts.valid})`, href: `${base}/myinvois?tab=valid` },
          { key: "attention", label: `Needs attention (${counts.attention})`, href: `${base}/myinvois?tab=attention` },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors",
              tab === t.key ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-12 text-center">
          <p className="m-0 text-[14px] font-semibold text-ink">
            {rows.length === 0 ? "No recorded sales invoices yet" : "No invoices in this view"}
          </p>
          <p className="m-0 max-w-md text-[12.5px] text-muted">
            {rows.length === 0
              ? "Record a sales invoice first — recorded invoices appear here automatically for MyInvois submission."
              : "Switch tabs above to view other e-Invois statuses."}
          </p>
          {rows.length === 0 && (
            <div className="mt-2">
              <Link href={`${base}/invoices`} className={buttonClass("secondary", "sm")}>
                Open Invoices
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="myinvois-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>Invoice</th>
                <th className={cn(TH, "text-left")}>Customer &amp; LHDN check</th>
                <th className={cn(TH, "text-right")}>Total</th>
                <th className={cn(TH, "text-left")}>Status</th>
                <th className={cn(TH, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const [chip, label] = MYINVOIS_CHIP[r.status];
                return (
                  <tr key={r.invoiceId} className="border-t border-border transition-colors hover:bg-surface-2">
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <Link href={`${base}/invoices/${r.invoiceId}`} className="num font-medium text-ink hover:underline">
                        {r.invoiceNumber}
                      </Link>
                      <div className="num text-[11.5px] text-muted">{r.invoiceDate}</div>
                    </td>
                    <td className={TD}>
                      <Link href={`${base}/contacts/${r.contactId}`} className="font-medium text-ink hover:underline">
                        {r.customerName}
                      </Link>
                      {r.status === "rejected" && r.latest?.rejectionReason ? (
                        <div className="mt-0.5 text-[11.5px] text-negative">{r.latest.rejectionReason}</div>
                      ) : r.status === "valid" && r.latest?.lhdnUuid ? (
                        <div className="num mt-0.5 text-[11.5px] text-muted">
                          UUID {r.latest.lhdnUuid.slice(0, 18)}…
                        </div>
                      ) : r.buyerIssues.length > 0 ? (
                        <div className="mt-0.5 text-[11.5px] text-negative">
                          {r.buyerIssues.join(" · ")}{" "}
                          <Link href={`${base}/contacts/${r.contactId}`} className="text-brand underline">
                            Fix contact
                          </Link>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[11.5px] text-positive">Buyer profile ready</div>
                      )}
                    </td>
                    <td className={cn(TD, "num-sans whitespace-nowrap text-right font-medium text-ink")}>
                      {rm(r.totalSen)}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap")}>
                      <span className={chip}>{label}</span>
                    </td>
                    <td className={cn(TD, "text-right")}>
                      <MyInvoisRowActions
                        orgSlug={ctx.org.slug}
                        invoiceId={r.invoiceId}
                        invoiceNumber={r.invoiceNumber}
                        status={r.status}
                        enabled={setup.enabled}
                        canEdit={canEdit}
                        latest={r.latest}
                      />
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

/** /{slug}/settings/e-invoice: Settings -> Tax & e-Invois -> e-Invois setup & intermediary checklist. */
export async function MyInvoisSettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const setup = await loadSupplierSetup(supabase, ctx.org.id);
  const base = `/${ctx.org.slug}`;
  const canAdmin = ctx.role === "owner" || ctx.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SettingsHeader base={base} legalName={ctx.org.legal_name} sub="e-Invois (MyInvois)" active="tax" />
        <div className="flex gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link href={`${base}/settings/sst`} className={cn(SUB, "text-muted hover:bg-surface-2 hover:text-ink-2")}>
            SST filing
          </Link>
          <Link aria-current="page" href={`${base}/settings/e-invoice`} className={cn(SUB, "bg-surface-2 text-ink")}>
            e-Invois
          </Link>
        </div>
      </div>

      {/* 1. Supplier profile checklist */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-[14px] font-semibold text-ink">1. Supplier e-Invoice profile</h2>
            <p className="m-0 mt-1 text-[12.5px] text-muted">
              LHDN requires every field below on submitted e-Invoices.
            </p>
          </div>
          <Link href={`${base}/settings/profile`} className={buttonClass("secondary", "sm")}>
            Edit in Profile
          </Link>
        </div>

        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0 text-[13px]" data-testid="mi-checklist">
          {setup.checklist.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex items-center gap-2.5">
                {item.ok ? (
                  <CheckCircle2 size={15} className="shrink-0 text-positive" aria-hidden="true" />
                ) : (
                  <CircleAlert size={15} className="shrink-0 text-negative" aria-hidden="true" />
                )}
                <span className="font-medium text-ink">{item.label}</span>
              </div>
              <span className={cn("text-right text-[12.5px]", item.ok ? "text-ink-2" : "text-negative")}>
                {item.value ?? "Missing"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* 2. Intermediary appointment & verification */}
      <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="m-0 text-[14px] font-semibold text-ink">2. Appoint intermediary &amp; verify</h2>
            <p className="m-0 mt-1 text-[12.5px] text-muted">
              Follow these steps in LHDN&apos;s MyTax portal, then click Verify appointment to turn on e-Invoicing.
            </p>
          </div>
          <span className={setup.enabled ? "chip pos" : "chip"} data-testid="mi-settings-badge">
            {setup.enabled ? `Active (${setup.environment})` : "Not verified"}
          </span>
        </div>

        <ol className="m-0 list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-ink-2">
          <li>Sign in to the LHDN MyTax portal and open MyInvois → Taxpayer Profile → Representatives / Intermediaries.</li>
          <li>Add Kira&apos;s intermediary TIN and BRN with permission to submit and cancel e-Invoices on your behalf.</li>
          <li>Confirm your company&apos;s TIN, BRN, and registered legal name match your Kira Profile exactly.</li>
          <li>Choose Sandbox (for testing) or Production below and click Verify appointment.</li>
        </ol>

        <MyInvoisSetupControls
          orgSlug={ctx.org.slug}
          enabled={setup.enabled}
          initialEnv={setup.environment}
          verifiedAt={setup.verifiedAt}
          canAdmin={canAdmin}
        />
      </section>
    </div>
  );
}
