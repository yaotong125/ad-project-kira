import "server-only";
import type { createSupabaseServerClient } from "@/shared/supabase/server";
import type {
  ChecklistItem,
  MyInvoisEnv,
  MyInvoisInvoiceRow,
  MyInvoisStatus,
  SubmissionSnapshot,
  SupplierSetup,
} from "./types";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
const sen = (v: unknown) => Math.round(Number(v ?? 0) * 100);
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function loadSupplierSetup(supabase: Supabase, orgId: string): Promise<SupplierSetup> {
  const { data: o } = await supabase
    .from("organizations")
    .select(
      "legal_name, registration_type, registration_number, tin, phone, msic_code, business_activity_description, address, postcode, city, state, myinvois_mandate_effective_on, myinvois_enabled, myinvois_environment, myinvois_verified_at",
    )
    .eq("id", orgId)
    .single();

  const addrComplete = Boolean(o?.address && o?.postcode && o?.city && o?.state);
  const addrDisplay = addrComplete ? `${o?.address}, ${o?.postcode} ${o?.city}, ${o?.state}` : null;

  const checklist: ChecklistItem[] = [
    { key: "legal_name", label: "Legal name", value: o?.legal_name ?? null, ok: Boolean(o?.legal_name) },
    {
      key: "brn",
      label: "SSM / Registration number",
      value: o?.registration_number ? `${o.registration_type ?? "BRN"} ${o.registration_number}` : null,
      ok: Boolean(o?.registration_number),
    },
    { key: "tin", label: "LHDN TIN", value: o?.tin ?? null, ok: Boolean(o?.tin) },
    { key: "phone", label: "Phone number", value: o?.phone ?? null, ok: Boolean(o?.phone) },
    {
      key: "msic",
      label: "MSIC code & business activity",
      value: o?.msic_code && o?.business_activity_description ? `${o.msic_code} · ${o.business_activity_description}` : null,
      ok: Boolean(o?.msic_code && o?.business_activity_description),
    },
    { key: "address", label: "Business address", value: addrDisplay, ok: addrComplete },
  ];

  return {
    enabled: Boolean(o?.myinvois_enabled),
    environment: o?.myinvois_environment === "production" ? "production" : "sandbox",
    verifiedAt: o?.myinvois_verified_at ?? null,
    mandateStart: o?.myinvois_mandate_effective_on ?? null,
    checklist,
    profileComplete: checklist.every((c) => c.ok),
  };
}

function mapSubmission(s: Record<string, unknown>): SubmissionSnapshot {
  return {
    id: String(s.id),
    status: s.status as Exclude<MyInvoisStatus, "not_submitted">,
    environment: s.environment === "production" ? "production" : "sandbox",
    lhdnUuid: s.lhdn_uuid ? String(s.lhdn_uuid) : null,
    longId: s.long_id ? String(s.long_id) : null,
    submissionUid: s.submission_uid ? String(s.submission_uid) : null,
    rejectionReason: s.rejection_reason ? String(s.rejection_reason) : null,
    cancelReason: s.cancel_reason ? String(s.cancel_reason) : null,
    submittedAt: String(s.submitted_at),
    validatedAt: s.validated_at ? String(s.validated_at) : null,
    cancelledAt: s.cancelled_at ? String(s.cancelled_at) : null,
    payload: (s.payload as Record<string, unknown>) ?? {},
  };
}

export async function loadMyInvoisPageData(supabase: Supabase, orgId: string) {
  const [setup, { data: invs }, { data: subs }] = await Promise.all([
    loadSupplierSetup(supabase, orgId),
    supabase
      .from("invoices")
      .select("id, invoice_number, invoice_date, status, total, contact_id, contacts(id, name, tin, registration_number)")
      .eq("org_id", orgId)
      .in("status", ["open", "paid"])
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("myinvois_submissions")
      .select(
        "id, document_id, status, environment, lhdn_uuid, long_id, submission_uid, rejection_reason, cancel_reason, submitted_at, validated_at, cancelled_at, payload",
      )
      .eq("org_id", orgId)
      .eq("document_type", "invoice")
      .order("submitted_at", { ascending: false })
      .limit(400),
  ]);

  const latestByDoc = new Map<string, SubmissionSnapshot>();
  for (const s of subs ?? []) {
    if (!latestByDoc.has(s.document_id)) {
      latestByDoc.set(s.document_id, mapSubmission(s as Record<string, unknown>));
    }
  }

  type ContactRow = { id: string; name: string; tin: string | null; registration_number: string | null };
  const rows: MyInvoisInvoiceRow[] = (invs ?? []).map((inv) => {
    const c = one(inv.contacts as ContactRow | ContactRow[] | null);
    const buyerIssues: string[] = [];
    if (!c?.tin) buyerIssues.push("Missing buyer TIN");
    if (!c?.registration_number && c?.tin !== "EI00000000010") buyerIssues.push("Missing buyer BRN / NRIC");
    const latest = latestByDoc.get(inv.id) ?? null;
    const status: MyInvoisStatus = latest ? latest.status : "not_submitted";
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      invoiceStatus: inv.status,
      totalSen: sen(inv.total),
      contactId: inv.contact_id,
      customerName: c?.name ?? "–",
      buyerIssues,
      status,
      latest,
    };
  });

  const counts = {
    all: rows.length,
    toSubmit: rows.filter((r) => r.status === "not_submitted" || r.status === "cancelled").length,
    valid: rows.filter((r) => r.status === "valid").length,
    pending: rows.filter((r) => r.status === "pending").length,
    attention: rows.filter((r) => r.status === "rejected" || (r.status === "not_submitted" && r.buyerIssues.length > 0)).length,
  };

  return { setup, rows, counts };
}

export async function loadInvoiceMyInvois(
  supabase: Supabase,
  orgId: string,
  invoiceId: string,
): Promise<{ enabled: boolean; environment: MyInvoisEnv; latest: SubmissionSnapshot | null }> {
  const [{ data: o }, { data: subs }] = await Promise.all([
    supabase.from("organizations").select("myinvois_enabled, myinvois_environment").eq("id", orgId).single(),
    supabase
      .from("myinvois_submissions")
      .select(
        "id, status, environment, lhdn_uuid, long_id, submission_uid, rejection_reason, cancel_reason, submitted_at, validated_at, cancelled_at, payload",
      )
      .eq("org_id", orgId)
      .eq("document_type", "invoice")
      .eq("document_id", invoiceId)
      .order("submitted_at", { ascending: false })
      .limit(1),
  ]);
  const first = subs?.[0];
  return {
    enabled: Boolean(o?.myinvois_enabled),
    environment: o?.myinvois_environment === "production" ? "production" : "sandbox",
    latest: first ? mapSubmission(first as Record<string, unknown>) : null,
  };
}
