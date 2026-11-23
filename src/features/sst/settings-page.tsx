import Link from "next/link";
import { todayMY } from "@/features/books/load";
import { SettingsHeader } from "@/features/settings/settings-header";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { cn } from "@/shared/ui/cn";
import { loadSstPeriods } from "./load";
import { SstSettingsForm } from "./settings-form";

const SUB = "shrink-0 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[12px] font-medium transition-colors";

/** /{slug}/settings/sst: lejar.ai's Settings → Tax & e-Invois → SST filing (observed 2026-11-22). */
export async function SstSettingsPage({ ctx }: { ctx: OrgContext }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const info = await loadSstPeriods(supabase, ctx.org.id);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col">
        <SettingsHeader base={base} legalName={info.legalName} sub="SST filing periods" active="tax" />
        <div className="flex gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link aria-current="page" href={`${base}/settings/sst`} className={cn(SUB, "bg-surface-2 text-ink")}>
            SST filing
          </Link>
          <Link href={`${base}/settings/e-invoice`} className={cn(SUB, "text-muted hover:bg-surface-2 hover:text-ink-2")}>
            e-Invois
          </Link>
        </div>
      </div>
      <SstSettingsForm
        slug={ctx.org.slug}
        canEdit={ctx.role === "owner"}
        fyeMonth={Number(info.fiscalYearEnd.slice(5, 7)) || 12}
        today={todayMY()}
        cadence={info.cadence}
        registeredOn={info.registeredOn ?? ""}
        lockedUntil={info.lockedUntil ?? ""}
      />
    </div>
  );
}
