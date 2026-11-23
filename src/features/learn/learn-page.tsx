import type { OrgContext } from "@/shared/org-context";
import { cn } from "@/shared/ui/cn";
import { LearnVisibilityButton, SkipSectionButton, StartSectionLink } from "./learn-buttons";
import { SECTIONS, lt, sectionStates, type SectionId, type ShownState, type StoredState } from "./sections";

const CHIP: Record<ShownState, string> = {
  locked: "chip",
  open: "chip brand",
  inProgress: "chip brand",
  checked: "chip pos",
  skipped: "chip warn",
};

/**
 * /{slug}/learn: layout and classes follow lejar.ai's Learn page (REA captures 2026-11-22: fresh,
 * skipped, in progress, hidden). "Use the sample" (practice copy) is not built yet, so its button
 * and hint are left out. Checked sections show no buttons (inferred: not observed on lejar.ai).
 */
export function LearnPage({ ctx, progress }: { ctx: OrgContext; progress: Partial<Record<SectionId, StoredState>> }) {
  const { lang, org } = ctx;
  const states = sectionStates(progress);
  const done = states.filter((s) => s === "checked").length;
  const canEdit = ctx.role !== "viewer";
  const base = `/${org.slug}`;

  return (
    <div lang={lang} className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 py-1 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="m-0 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">{lt(lang, "learn.page.title")}</h1>
          <div className="mt-1.5 text-[12.5px] text-muted">{lt(lang, "learn.page.sub")}</div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <span className="chip">
            <span data-testid="learn-progress">{lt(lang, "learn.page.progress", { done, total: SECTIONS.length })}</span>
          </span>
          {canEdit && <LearnVisibilityButton orgSlug={org.slug} hidden={org.learn_hidden} lang={lang} />}
        </div>
      </div>

      {org.learn_hidden && (
        <div className="card px-4 py-3.5">
          <p className="m-0 text-[13px] text-muted">{lt(lang, "learn.page.hiddenNotice")}</p>
        </div>
      )}
      {!canEdit && (
        <div className="card px-4 py-3.5">
          <p className="m-0 text-[13px] text-muted">{lt(lang, "learn.page.viewerNotice")}</p>
        </div>
      )}
      {done === SECTIONS.length && (
        <div className="card px-4 py-3.5">
          <p className="m-0 text-[13px] text-ink">{lt(lang, "learn.page.allChecked")}</p>
        </div>
      )}

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {SECTIONS.map((s, i) => {
          const state = states[i];
          const href = `${base}/${s.path}`;
          const actionable = canEdit && (state === "open" || state === "inProgress" || state === "skipped");
          return (
            <li key={s.id} className={cn("card flex flex-col gap-3 p-4 sm:flex-row sm:items-center", state === "locked" && "opacity-70")}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted">
                    {lt(lang, "learn.page.sectionNumber", { n: i + 1 })}
                  </span>
                  <span className={CHIP[state]}>{lt(lang, `learn.state.${state}`)}</span>
                </div>
                <h2 className="m-0 text-[14px] font-medium text-ink">{lt(lang, `learn.section.${s.key}.title`)}</h2>
                <p className="m-0 text-[12.5px] text-muted">{lt(lang, `learn.section.${s.key}.body`)}</p>
              </div>
              {actionable && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {state !== "skipped" && <SkipSectionButton orgSlug={org.slug} section={s.id} lang={lang} />}
                  <StartSectionLink
                    orgSlug={org.slug}
                    section={s.id}
                    href={href}
                    label={lt(lang, "learn.action.start")}
                    variant={state === "skipped" ? "secondary" : "primary"}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
