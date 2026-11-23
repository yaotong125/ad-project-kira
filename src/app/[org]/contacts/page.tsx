import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/features/contacts/contact-form";
import { ct, EMPTY_CONTACT } from "@/features/contacts/copy";
import { ToggleActiveButton } from "@/features/contacts/toggle-active";
import { first, type SearchParams } from "@/shared/i18n";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Contacts", robots: { index: false } };

const PAGE_SIZE = 50;
const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const TAB = "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition-colors max-sm:mb-0";

/**
 * /{slug}/contacts: lejar.ai's Contacts page (observed 2026-11-22). `?type=customer|supplier` is the
 * sidebar's Customers / Suppliers view (title and tab change). The "Add contact" form opens with
 * ?new=1, and on its own while the entity has no contacts (observed).
 */
export default async function Page({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<SearchParams> }) {
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const ctx = await loadOrgContext(org);
  const { lang } = ctx;
  const t = (k: Parameters<typeof ct>[1], v?: Record<string, string | number>) => ct(lang, k, v);
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const type = first(sp.type) === "customer" || first(sp.type) === "supplier" ? (first(sp.type) as "customer" | "supplier") : null;
  const page = Math.max(1, Number(first(sp.page)) || 1);
  const canEdit = ctx.role !== "viewer";

  let query = supabase
    .from("contacts")
    .select("id, name, kind, tin, email, phone, default_payment_terms_days, is_active", { count: "exact" })
    .eq("org_id", ctx.org.id);
  if (type) query = query.in("kind", [type, "both"]);
  const [{ data: rows, count }, { count: total }] = await Promise.all([
    query.order("name").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
  ]);
  const all = total ?? 0;
  const formOpen = canEdit && (first(sp.new) === "1" || all === 0);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const title = type === "customer" ? t("contacts.list.customers") : type === "supplier" ? t("contacts.list.suppliers") : t("contacts.list.title");
  const tabHref = (k: string | null, p?: number) => {
    const q = new URLSearchParams();
    if (k) q.set("type", k);
    if (p && p > 1) q.set("page", String(p));
    const s = q.toString();
    return `${base}/contacts${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        sub={
          <>
            {ctx.org.legal_name} · <span className="text-ink">{all}</span> {all === 1 ? t("contacts.list.countOne") : t("contacts.list.countMany")}
          </>
        }
      />
      {!canEdit && <p className="card px-4 py-3.5 text-[13px] text-muted">{t("contacts.list.readOnly")}</p>}
      {first(sp.added) === "1" && (
        <p role="status" className="rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          {lang === "ms" ? "Kenalan ditambah." : "Contact added."}
        </p>
      )}
      <div data-flow="contact-form">
        {formOpen ? (
          <ContactForm
            orgSlug={ctx.org.slug}
            lang={lang}
            initial={{ ...EMPTY_CONTACT, contactType: type ?? "customer" }}
            closeHref={all > 0 ? tabHref(type) : undefined}
          />
        ) : (
          canEdit && (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Link href={`${tabHref(type)}${type ? "&" : "?"}new=1`} className={buttonClass("primary")}>
                {t("contacts.list.newButton")}
              </Link>
            </div>
          )
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex gap-1 border-b border-border max-sm:max-w-full max-sm:overflow-x-auto max-sm:border-b-0 max-sm:shadow-[inset_0_-1px_0_var(--color-border)]">
          {([
            [null, t("contacts.list.all")],
            ["customer", t("contacts.list.customers")],
            ["supplier", t("contacts.list.suppliers")],
          ] as const).map(([k, label]) => (
            <Link key={label} href={tabHref(k)} className={cn(TAB, type === k ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink-2")}>
              {label}
            </Link>
          ))}
        </div>
        {(rows ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-12 text-center">
            <p className="text-sm font-medium text-ink">{all === 0 ? t("contacts.list.emptyTitle") : t("contacts.list.emptyView")}</p>
            {all === 0 && <div className="text-[13px] text-muted">{t("contacts.list.emptyBody")}</div>}
          </div>
        ) : (
          <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-surface">
                <tr className="border-t border-border">
                  {(["name", "type", "tin", "email", "phone", "terms", "status", "actions"] as const).map((k) => (
                    <th key={k} className={cn(TH, "text-left")}>
                      {t(`contacts.list.th.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((c) => (
                  <tr key={c.id} className={cn("border-t border-border transition-colors hover:bg-surface-2", !c.is_active && "text-muted")}>
                    <td className={cn(TD, "font-medium text-ink")}>
                      <Link href={`${base}/contacts/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className={cn(TD, "text-ink-2")}>{t(`contacts.type.${c.kind as "customer" | "supplier" | "both"}`)}</td>
                    <td className={cn(TD, "num-sans text-ink-2")}>{c.tin ?? "-"}</td>
                    <td className={cn(TD, "text-ink-2")}>{c.email ?? "-"}</td>
                    <td className={cn(TD, "num-sans text-ink-2")}>{c.phone ?? "-"}</td>
                    <td className={cn(TD, "num-sans text-ink-2")}>
                      {c.default_payment_terms_days === null ? "-" : t("contacts.list.termsDays", { days: c.default_payment_terms_days })}
                    </td>
                    <td className={TD}>
                      <span className={c.is_active ? "chip pos" : "chip"}>{c.is_active ? t("contacts.list.active") : t("contacts.list.disabled")}</span>
                    </td>
                    <td className={TD}>{canEdit && <ToggleActiveButton orgSlug={ctx.org.slug} contactId={c.id} active={c.is_active} lang={lang} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav aria-label={t("contacts.list.pagination")} className="flex items-center justify-end gap-2 text-[12.5px] text-muted">
            {page > 1 && (
              <Link className={buttonClass("secondary", "sm")} href={tabHref(type, page - 1)}>
                ‹
              </Link>
            )}
            <span className="num-sans">
              {page} / {pages}
            </span>
            {page < pages && (
              <Link className={buttonClass("secondary", "sm")} href={tabHref(type, page + 1)}>
                ›
              </Link>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
