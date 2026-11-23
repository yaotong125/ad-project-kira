"use server";

import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import {
  earliestCommencement,
  isIsoDate,
  normalYearStart,
  periodsFor,
  yearsToCreate,
  type Cadence,
} from "@/features/new-org/fiscal";
import { createSupabaseServerClient } from "@/shared/supabase/server";

export type ProfilePayload = {
  legalName: string;
  ssmNumber: string;
  sstNumber: string;
  registrationType: string;
  tin: string;
  address: string;
  postcode: string;
  city: string;
  state: string;
  defaultPricingMode: "exclusive" | "inclusive";
  phone: string;
  msicCode: string;
  businessActivityDescription: string;
  defaultClassificationCode: string;
  myinvoisMandateEffectiveOn: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  duitnowId: string;
  paymentNote: string;
};

type Res = { ok: true } | { ok: false; error: string };

const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

function message(e: { message?: string; code?: string } | null): string {
  switch (e?.message ?? "") {
    case "owner_only":
      return "Only the entity owner can change settings.";
    case "invalid_legal_name":
      return "Legal name must be between 2 and 200 characters.";
    case "invalid_registration_type":
      return "Choose a valid registration type.";
    case "invalid_pricing_mode":
      return "Choose a valid default pricing mode.";
    case "invalid_msic":
      return "MSIC code must be 5 digits (for example, 62010).";
    case "invalid_phone":
      return "Phone number must be 8–20 digits (optional leading +).";
    case "invalid_classification":
      return "Select a valid classification code.";
    case "invalid_mandate_date":
      return "e-Invoice mandate start must be on or after 2024-08-01.";
    case "invalid_fiscal_dates":
      return "Enter a valid fiscal year-end after the commencement date.";
    case "has_transactions":
      return "Fiscal year-end cannot be changed after transactions have been posted.";
    case "has_closed_periods":
      return "Fiscal year-end cannot be changed while any period is closed.";
    default:
      return booksError(e);
  }
}

function refresh(slug: string) {
  for (const p of ["", "settings/profile", "ledger", "invoices", "reports", "accounts"]) {
    revalidatePath(p ? `/${slug}/${p}` : `/${slug}`);
  }
}

export async function updateProfileAction(orgSlug: string, data: ProfilePayload): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_org_profile", {
    p_slug: orgSlug,
    p_data: {
      ...data,
      registrationType: data.registrationType || "BRN",
    },
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true };
}

export async function uploadOrgAssetAction(formData: FormData): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const orgSlug = String(formData.get("orgSlug") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const file = formData.get("file");
  if (!orgSlug || (kind !== "logo" && kind !== "payment_qr")) {
    return { ok: false, error: "Invalid upload request." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PNG or JPEG image to upload." };
  }
  const ext = ALLOWED_MIME[file.type];
  if (!ext) return { ok: false, error: "Only PNG or JPEG images are supported." };
  if (file.size > MAX_ASSET_BYTES) return { ok: false, error: "File must be 2 MB or smaller." };

  const supabase = await createSupabaseServerClient();
  const { data: org } = await supabase.from("organizations").select("id, logo_path, payment_qr_path").eq("slug", orgSlug).maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };

  const path = `${org.id}/${kind}-${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error: upErr } = await supabase.storage.from("org-assets").upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (upErr) return { ok: false, error: /row-level security|policy|denied/i.test(upErr.message) ? "Only the entity owner can upload assets." : upErr.message };

  const prev = kind === "logo" ? org.logo_path : org.payment_qr_path;
  const { error: rpcErr } = await supabase.rpc("set_org_asset", { p_slug: orgSlug, p_kind: kind, p_path: path });
  if (rpcErr) {
    await supabase.storage.from("org-assets").remove([path]);
    return { ok: false, error: message(rpcErr) };
  }
  if (prev && prev !== path) {
    await supabase.storage.from("org-assets").remove([prev]);
  }
  const { data: signed } = await supabase.storage.from("org-assets").createSignedUrl(path, 3600);
  refresh(orgSlug);
  return { ok: true, url: signed?.signedUrl ?? null };
}

export async function removeOrgAssetAction(orgSlug: string, kind: "logo" | "payment_qr"): Promise<Res> {
  const supabase = await createSupabaseServerClient();
  const { data: org } = await supabase.from("organizations").select("logo_path, payment_qr_path").eq("slug", orgSlug).maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };
  const prev = kind === "logo" ? org.logo_path : org.payment_qr_path;
  const { error } = await supabase.rpc("set_org_asset", { p_slug: orgSlug, p_kind: kind, p_path: null });
  if (error) return { ok: false, error: message(error) };
  if (prev) await supabase.storage.from("org-assets").remove([prev]);
  refresh(orgSlug);
  return { ok: true };
}

export async function changeFiscalYearEndAction(
  orgSlug: string,
  fiscalYearEnd: string,
  fiscalYearStart: string,
): Promise<Res> {
  if (!isIsoDate(fiscalYearEnd)) return { ok: false, error: "Enter a valid fiscal year-end date." };
  const start = fiscalYearStart.trim();
  if (start && !isIsoDate(start)) return { ok: false, error: "Enter a valid commencement date." };
  if (start) {
    if (start >= fiscalYearEnd) return { ok: false, error: "Commencement date must be before the fiscal year-end." };
    const earliest = earliestCommencement(fiscalYearEnd);
    if (start < earliest) return { ok: false, error: `Commencement date cannot be more than 18 months before ${fiscalYearEnd}.` };
  }

  const supabase = await createSupabaseServerClient();
  const { data: org } = await supabase.from("organizations").select("cadence").eq("slug", orgSlug).maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };

  const cadence = (org.cadence as Cadence) ?? "bimonthly";
  const years = yearsToCreate({ yearEnd: fiscalYearEnd, commencement: start || undefined }).map((y) => ({
    starts_on: y.startsOn,
    ends_on: y.endsOn,
    periods: periodsFor(y, cadence).map((p) => ({ starts_on: p.startsOn, ends_on: p.endsOn })),
  }));
  const booksStart = start || normalYearStart(fiscalYearEnd);

  const { error } = await supabase.rpc("change_fiscal_year_end", {
    p_slug: orgSlug,
    p_fiscal_year_end: fiscalYearEnd,
    p_books_start: booksStart,
    p_years: years,
  });
  if (error) return { ok: false, error: message(error) };
  refresh(orgSlug);
  return { ok: true };
}
