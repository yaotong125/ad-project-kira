import { CircleHelp } from "lucide-react";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { AccountsClient } from "./accounts-client";
import { loadChartAccounts } from "./load";

/** /{slug}/accounts: lejar.ai's Chart of accounts (observed 2026-11-22). */
export async function AccountsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const accounts = await loadChartAccounts(supabase, ctx.org.id);
  const canEdit = ctx.role !== "viewer";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            Chart of accounts
          </h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} ·{" "}
            <abbr
              title="Malaysian Private Entities Reporting Standard, the accounting framework used by Malaysian SMEs."
              className="cursor-help no-underline underline decoration-dotted underline-offset-2"
            >
              MPERS
            </abbr>
            -aligned · <span className="num text-ink">{accounts.length}</span> accounts
          </div>
          <details className="mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={12} aria-hidden="true" /> Learn about this page
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              <p className="m-0">
                Your chart of accounts is the list of categories Kira posts every transaction into. It starts from the
                standard Malaysian MPERS chart for your entity type.
              </p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                <li>Add custom accounts for revenue streams, expenses, or extra bank accounts.</li>
                <li>Mark an asset account as cash so it appears in bank import, reconcile, and payment selectors.</li>
                <li>
                  Accounts with existing entries cannot be deleted — disable them to keep historical reports intact.
                </li>
              </ul>
            </div>
          </details>
        </div>
      </div>

      <AccountsClient orgSlug={ctx.org.slug} accounts={accounts} canEdit={canEdit} />
    </div>
  );
}
