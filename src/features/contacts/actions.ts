"use server";

import { revalidatePath } from "next/cache";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { contactErrors, ct, type ContactValues } from "./copy";

/** lejar.ai's contact Server Actions (chunk 3-otq6om7hscp): createContactAction, updateContactAction, toggleContactActiveAction. */
export type ContactResult = { ok: true; id: string } | { ok: false; error: string; fields?: Partial<Record<keyof ContactValues, string>> };

async function messageFor(code: string | undefined) {
  const lang = await appLang();
  switch (code) {
    case "name_min":
      return ct(lang, "contacts.error.nameMin");
    case "terms_whole":
      return ct(lang, "contacts.error.termsWhole");
    case "registration_number":
      return ct(lang, "contacts.error.registrationNumber");
    case "nric":
      return ct(lang, "contacts.error.nric");
    case "not_found":
      return ct(lang, "contacts.error.notFound");
    case "name_taken":
      return lang === "ms" ? "Kenalan dengan nama ini sudah wujud." : "A contact with this name already exists.";
    case "not_allowed":
      return ct(lang, "contacts.list.readOnly");
    default:
      return lang === "ms" ? "Kenalan tidak dapat disimpan. Cuba lagi." : "The contact could not be saved. Try again.";
  }
}

export async function createContactAction(orgSlug: string, values: ContactValues): Promise<ContactResult> {
  const fields = contactErrors(values, await appLang());
  if (Object.keys(fields).length > 0) return { ok: false, error: Object.values(fields)[0]!, fields };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_contact", { p_slug: orgSlug, p_contact: values });
  if (error) {
    console.warn("[contacts] create failed:", error.code, error.message);
    return { ok: false, error: await messageFor(error.message) };
  }
  revalidatePath(`/${orgSlug}/contacts`);
  revalidatePath(`/${orgSlug}/learn`);
  return { ok: true, id: data as string };
}

export async function updateContactAction(orgSlug: string, contactId: string, values: ContactValues): Promise<ContactResult> {
  const lang = await appLang();
  if (!contactId) return { ok: false, error: ct(lang, "contacts.error.contactIdRequired") };
  const fields = contactErrors(values, lang);
  if (Object.keys(fields).length > 0) return { ok: false, error: Object.values(fields)[0]!, fields };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_contact", { p_slug: orgSlug, p_id: contactId, p_contact: values });
  if (error) {
    console.warn("[contacts] update failed:", error.code, error.message);
    return { ok: false, error: await messageFor(error.message) };
  }
  revalidatePath(`/${orgSlug}/contacts`);
  return { ok: true, id: contactId };
}

export async function toggleContactActiveAction(orgSlug: string, contactId: string, active: boolean): Promise<ContactResult> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_contact_active", { p_slug: orgSlug, p_id: contactId, p_active: active });
  if (error) {
    console.warn("[contacts] toggle failed:", error.code, error.message);
    return { ok: false, error: await messageFor(error.message) };
  }
  revalidatePath(`/${orgSlug}/contacts`);
  return { ok: true, id: contactId };
}
