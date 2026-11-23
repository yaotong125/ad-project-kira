import { CircleHelp } from "lucide-react";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { recurringCopy } from "./copy";
import { loadRecurringData } from "./load";
import { RecurringClient } from "./recurring-client";
import type { RecurringKind } from "./types";

const STAT =
  "flex flex-col gap-2.5 px-4 py-4 max-sm:flex-row max-sm:flex-wrap max-sm:items-baseline max-sm:justify-between max-sm:gap-x-3 max-sm:gap-y-0.5 max-sm:px-3.5 max-sm:py-2.5";
const STAT_V =
  "num-sans text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink max-sm:ml-auto max-sm:text-right";

/** /{slug}/recurring-invoices and /{slug}/recurring-bills (lejar.ai i18n + help articles). */
export async function RecurringPage({ ctx, kind }: { ctx: OrgContext; kind: RecurringKind }) {
  const supabase = await createSupabaseServerClient();
  const data = await loadRecurringData(supabase, ctx.org.id, kind);
  const c = recurringCopy(kind, ctx.lang);
  const canEdit = ctx.role !== "viewer";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{c.title}</h1>
          <div className="mt-1.5 text-[12.5px] text-muted">
            {ctx.org.legal_name} · {c.subHint}
          </div>
          <details className="mt-1.5 max-w-[620px]">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink">
              <CircleHelp size={12} aria-hidden="true" /> {c.learnToggle}
            </summary>
            <div className="mt-2 flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 text-[12.5px] leading-[1.6] text-ink-2">
              <p className="m-0">{c.helpLead}</p>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
                {c.helpBullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </div>

      <div
        className="card grid grid-cols-1 divide-y divide-border p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
        data-testid="recurring-stats"
      >
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{c.statActive}</div>
          <div className={STAT_V}>{data.stats.activeCount}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">
            {data.templates.length} {ctx.lang === "ms" ? "jumlah" : "total"}
          </div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{c.statNextRun}</div>
          <div className={cn(STAT_V, !data.stats.nextRun && "text-muted")}>
            {data.stats.nextRun ?? c.statNoneScheduled}
          </div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">
            {ctx.lang === "ms" ? "Tarikh jadual paling awal" : "Earliest scheduled date"}
          </div>
        </div>
        <div className={STAT}>
          <div className="text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">{c.statGenerated}</div>
          <div className={STAT_V}>{data.stats.generatedThisMonth}</div>
          <div className="text-[11.5px] text-muted max-sm:order-last max-sm:w-full">{c.statGeneratedSub}</div>
        </div>
      </div>

      <RecurringClient
        orgSlug={ctx.org.slug}
        kind={kind}
        lang={ctx.lang}
        today={data.today}
        canEdit={canEdit}
        contacts={data.contacts}
        accounts={data.accounts}
        templates={data.templates}
        runs={data.runs}
      />
    </div>
  );
}
