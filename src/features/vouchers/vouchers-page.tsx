import { CircleHelp } from "lucide-react";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { loadVouchersData } from "./load";
import type { VoucherKind } from "./types";
import { VouchersClient } from "./vouchers-client";

/** /{slug}/official-receipts and /{slug}/expenses (Payment vouchers), modelled on lejar.ai. */
export async function VouchersPage({
  ctx,
  kind,
  sp,
}: {
  ctx: OrgContext;
  kind: VoucherKind;
  sp: SearchParams;
}) {
  const supabase = await createSupabaseServerClient();
  const data = await loadVouchersData(supabase, ctx.org.id, kind);
  const isOr = kind === "official_receipt";
  const ms = ctx.lang === "ms";
  const canEdit = ctx.role !== "viewer";
  const count = data.vouchers.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            {isOr ? (ms ? "Resit rasmi" : "Official receipts") : ms ? "Baucar bayaran" : "Payment vouchers"}
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · {isOr ? "record money received directly" : "pay cash or bank directly"} ·{" "}
            <span className="num text-ink">{count}</span>{" "}
            {isOr ? (count === 1 ? "receipt" : "receipts") : count === 1 ? "voucher" : "vouchers"}
          </div>
          <details className="mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={12} aria-hidden="true" />{" "}
              {ms ? "Ketahui tentang halaman ini" : "Learn about this page"}
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              {isOr ? (
                <>
                  <p className="m-0">
                    Record cash or bank deposits with no customer invoice behind them, like a walk-in cash sale.
                  </p>
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                    <li>Pick who paid you and the cash or bank account the money went into.</li>
                    <li>Add one line per item with the account it should be credited to.</li>
                    <li>
                      Recording debits the cash or bank account and credits the accounts on your lines. If a customer is
                      paying off an existing invoice, use Payments received instead.
                    </li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="m-0">
                    Record cash or bank payments with no supplier bill behind them, like petrol, parking, tolls, a Grab
                    ride, or a small on-the-spot purchase.
                  </p>
                  <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                    <li>Pick who you paid and the account you paid from, for example Bank or Petty cash.</li>
                    <li>Add one line per item with the account it belongs to. Lines can hit any account, not just expenses.</li>
                    <li>
                      Recording debits the accounts on your lines and credits the cash or bank account. If a supplier
                      sent an invoice to pay later, record a bill instead.
                    </li>
                  </ul>
                </>
              )}
            </div>
          </details>
        </div>
      </div>

      {!canEdit && (
        <p className="card m-0 px-4 py-3 text-[13px] text-muted">
          Your viewer role is read-only. Ask an owner or admin to make changes.
        </p>
      )}

      <VouchersClient
        orgSlug={ctx.org.slug}
        kind={kind}
        lang={ctx.lang}
        today={data.today}
        suggestedNumber={data.suggestedNumber}
        canEdit={canEdit}
        initialOpen={first(sp.new) === "1"}
        cashAccounts={data.cashAccounts}
        accounts={data.accounts}
        vouchers={data.vouchers}
      />
    </div>
  );
}
