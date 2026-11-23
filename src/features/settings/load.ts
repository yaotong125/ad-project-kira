import "server-only";
import type { Cadence } from "@/features/new-org/fiscal";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type { OrgProfile } from "./constants";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function loadOrgProfile(supabase: Supabase, orgId: string): Promise<OrgProfile | null> {
  const [{ data: o }, { data: years }, { count: entries }, { count: closed }] = await Promise.all([
    supabase
      .from("organizations")
      .select(
        "id, slug, legal_name, entity_type, fiscal_year_end, cadence, books_start, registration_type, registration_number, sst_number, tin, address, postcode, city, state, default_pricing_mode, phone, msic_code, business_activity_description, default_classification_code, myinvois_mandate_effective_on, bank_name, bank_account_name, bank_account_number, duitnow_id, payment_note, logo_path, payment_qr_path",
      )
      .eq("id", orgId)
      .single(),
    supabase.from("fiscal_years").select("starts_on").eq("org_id", orgId).order("starts_on").limit(1),
    supabase.from("journal_entries").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    supabase.from("accounting_periods").select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "open"),
  ]);
  if (!o) return null;

  const [logoSigned, qrSigned] = await Promise.all([
    o.logo_path ? supabase.storage.from("org-assets").createSignedUrl(o.logo_path, 3600) : Promise.resolve({ data: null }),
    o.payment_qr_path ? supabase.storage.from("org-assets").createSignedUrl(o.payment_qr_path, 3600) : Promise.resolve({ data: null }),
  ]);

  return {
    id: o.id,
    slug: o.slug,
    legalName: o.legal_name,
    entityType: o.entity_type,
    fiscalYearEnd: o.fiscal_year_end,
    cadence: (o.cadence as Cadence) ?? "bimonthly",
    booksStart: o.books_start,
    registrationType: o.registration_type ?? "BRN",
    ssmNumber: o.registration_number ?? "",
    sstNumber: o.sst_number ?? "",
    tin: o.tin ?? "",
    address: o.address ?? "",
    postcode: o.postcode ?? "",
    city: o.city ?? "",
    state: o.state ?? "",
    defaultPricingMode: (o.default_pricing_mode as "exclusive" | "inclusive") ?? "exclusive",
    phone: o.phone ?? "",
    msicCode: o.msic_code ?? "",
    businessActivityDescription: o.business_activity_description ?? "",
    defaultClassificationCode: o.default_classification_code ?? "",
    myinvoisMandateEffectiveOn: o.myinvois_mandate_effective_on ?? "",
    bankName: o.bank_name ?? "",
    bankAccountName: o.bank_account_name ?? "",
    bankAccountNumber: o.bank_account_number ?? "",
    duitnowId: o.duitnow_id ?? "",
    paymentNote: o.payment_note ?? "",
    logoPath: o.logo_path ?? null,
    logoUrl: logoSigned.data?.signedUrl ?? null,
    paymentQrPath: o.payment_qr_path ?? null,
    paymentQrUrl: qrSigned.data?.signedUrl ?? null,
    firstYearStart: years?.[0]?.starts_on ?? o.books_start,
    canChangeFye: (entries ?? 0) === 0 && (closed ?? 0) === 0,
  };
}
