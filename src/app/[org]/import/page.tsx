import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountOptions } from "@/features/books/load";
import { BANKS, bt } from "@/features/import/banks";
import { DeleteStatementButton } from "@/features/import/delete-statement";
import { loadStatement } from "@/features/import/load";
import { ReviewFlow } from "@/features/import/review-flow";
import { UploadFlow } from "@/features/import/upload-flow";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Import bank statements", robots: { index: false } };

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";

/**
 * /{slug}/import: lejar.ai's "Import bank statements" (observed 2026-11-22): upload one or several
 * statements, review the categorised drafts, record each in one batch. `?statement=` opens a statement's
 * review; `&queue=` holds the rest of a multi-file upload.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const { lang } = ctx;
  const t = (k: Parameters<typeof bt>[1], v?: Record<string, string | number>) => bt(lang, k, v);
  const supabase = await createSupabaseServerClient();
  const canEdit = ctx.role !== "viewer";
  const accounts = await accountOptions(supabase, ctx.org.id);
  const header = <PageHeader title={t("bankImport.page.title")} sub={t("bankImport.page.sub", { org: ctx.org.legal_name })} />;

  const statementId = first(sp.statement);
  if (statementId) {
    const loaded = await loadStatement(supabase, ctx.org.id, statementId);
    if (!loaded) notFound();
    const queue = (first(sp.queue) ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/.test(x));
    const pos = Number(first(sp.pos)) || 1;
    const total = Number(first(sp.total)) || queue.length + 1;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ReviewFlow key={loaded.info.id} orgSlug={ctx.org.slug} lang={lang} info={loaded.info} lines={loaded.lines} matches={loaded.matches} settles={loaded.settles} accounts={accounts} queue={queue} position={pos} total={total} canEdit={canEdit} />
      </div>
    );
  }

  const { data: recent } = await supabase
    .from("bank_statements")
    .select("id, file_name, bank, period_start, period_end, created_at, accounts(code, name), bank_statement_lines(status)")
    .eq("org_id", ctx.org.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const cash = accounts.filter((a) => a.isCash).map((a) => ({ code: a.code, name: a.name }));

  return (
    <div className="flex flex-col gap-6">
      {header}
      {canEdit && <UploadFlow orgSlug={ctx.org.slug} lang={lang} cashAccounts={cash} />}
      {(recent ?? []).length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-[13.5px] font-semibold text-ink">{t("bankImport.page.recent.title")}</h2>
          <p className="m-0 text-[12.5px] text-muted">{t("bankImport.page.recent.sub")}</p>
          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr>
                  <th className={TH}>{t("bankImport.page.recent.statement")}</th>
                  <th className={TH}>{t("bankImport.flow.upload.thBank")}</th>
                  <th className={TH}>{t("bankImport.flow.upload.thAccount")}</th>
                  <th className={TH}>Lines</th>
                  <th className={TH}>{t("bankImport.flow.th.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {(recent ?? []).map((s) => {
                  const a = Array.isArray(s.accounts) ? s.accounts[0] : s.accounts;
                  const ls = (s.bank_statement_lines ?? []) as { status: string }[];
                  const left = ls.filter((l) => l.status === "draft").length;
                  const recorded = ls.filter((l) => l.status === "recorded" || l.status === "matched").length;
                  return (
                    <tr key={s.id} className="border-t border-border">
                      <td className={cn(TD, "text-ink")}>
                        {s.file_name}
                        <div className="text-[11.5px] text-muted">
                          {s.period_start ? `${s.period_start} – ${s.period_end}` : s.created_at.slice(0, 10)}
                        </div>
                      </td>
                      <td className={cn(TD, "text-ink-2")}>{BANKS.find((b) => b.value === s.bank)?.label.replace(/ \(.*\)$/, "") ?? s.bank}</td>
                      <td className={cn(TD, "text-ink-2")}>{a ? `${a.code} · ${a.name}` : "-"}</td>
                      <td className={cn(TD, "num-sans text-ink-2")}>
                        {recorded} / {ls.length}
                      </td>
                      <td className={TD}>
                        <div className="flex items-center gap-1">
                          <Link href={`/${ctx.org.slug}/import?statement=${s.id}`} className={buttonClass("secondary", "sm")}>
                            {left > 0 ? t("bankImport.flow.queue.rerun", { count: left }) : t("bankImport.page.recent.rerun")}
                          </Link>
                          {canEdit && recorded === 0 && <DeleteStatementButton orgSlug={ctx.org.slug} id={s.id} lang={lang} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
