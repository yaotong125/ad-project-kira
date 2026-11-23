import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ContactForm } from "@/features/contacts/contact-form";
import { CustomerCreditPanel } from "@/features/credit/credit-panel";
import { ct, type ContactValues } from "@/features/contacts/copy";
import { loadOrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { PageHeader } from "@/shared/ui/page-header";

/** Rendered per request (session, entity). */
export const instant = false;

export const metadata: Metadata = { title: "Contact", robots: { index: false } };

/**
 * /{slug}/contacts/{id}: lejar.ai's contact page ("Back to contacts", "Edit contact", read-only for
 * viewers). Its statement of account, customer credit and prepayments come with the sales slices.
 */
export default async function Page({ params }: { params: Promise<{ org: string; id: string }> }) {
  const { org, id } = await params;
  const ctx = await loadOrgContext(org);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase.from("contacts").select("*").eq("org_id", ctx.org.id).eq("id", id).maybeSingle();
  if (!c) notFound();
  const values: ContactValues = {
    name: c.name,
    contactType: c.kind,
    tradeClassification: c.trade_classification,
    taxResidency: c.tax_residency,
    taxIdentificationNumber: c.tin ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    address: c.address ?? "",
    postcode: c.postcode ?? "",
    state: c.state ?? "",
    sstNumber: c.sst_number ?? "",
    city: c.city ?? "",
    registrationNumber: c.registration_number ?? "",
    registrationType: c.registration_type ?? "",
    defaultPaymentTermsDays: c.default_payment_terms_days === null ? "" : String(c.default_payment_terms_days),
  };
  const readOnly = ctx.role === "viewer";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/${ctx.org.slug}/contacts`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden="true" />
          {ct(ctx.lang, "contacts.detail.back")}
        </Link>
      </div>
      <PageHeader
        title={c.name}
        sub={
          <>
            {ct(ctx.lang, `contacts.type.${c.kind as "customer" | "supplier" | "both"}`)} ·{" "}
            <span className={c.is_active ? "text-ink" : ""}>{c.is_active ? ct(ctx.lang, "contacts.list.active") : ct(ctx.lang, "contacts.list.disabled")}</span>
          </>
        }
      />
      {readOnly && <p className="card px-4 py-3.5 text-[13px] text-muted">{ct(ctx.lang, "contacts.detail.readOnly")}</p>}
      {(c.kind === "customer" || c.kind === "both") && <CustomerCreditPanel ctx={ctx} contactId={c.id} />}
      <ContactForm key={c.updated_at} orgSlug={ctx.org.slug} lang={ctx.lang} initial={values} contactId={c.id} readOnly={readOnly} />
    </div>
  );
}
