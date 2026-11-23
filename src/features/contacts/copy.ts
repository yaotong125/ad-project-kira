import type { Lang } from "@/shared/i18n";
import { CONTACT_TEXT, type ContactTextKey } from "./copy-data";

export function ct(lang: Lang, key: ContactTextKey, vars?: Record<string, string | number>): string {
  const s: string = CONTACT_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export const STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang",
  "Sabah", "Sarawak", "Selangor", "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya",
] as const;

export type ContactValues = {
  name: string;
  contactType: "customer" | "supplier" | "both";
  tradeClassification: "trade" | "non_trade";
  taxResidency: "resident" | "non_resident";
  taxIdentificationNumber: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  state: string;
  sstNumber: string;
  city: string;
  registrationNumber: string;
  registrationType: string;
  defaultPaymentTermsDays: string;
};

export const EMPTY_CONTACT: ContactValues = {
  name: "", contactType: "customer", tradeClassification: "trade", taxResidency: "resident", taxIdentificationNumber: "",
  email: "", phone: "", address: "", postcode: "", state: "", sstNumber: "", city: "", registrationNumber: "",
  registrationType: "", defaultPaymentTermsDays: "",
};

/** lejar.ai's contact rules (contacts.error.*), checked in the browser and again in the database. */
export function contactErrors(v: ContactValues, lang: Lang): Partial<Record<keyof ContactValues, string>> {
  const e: Partial<Record<keyof ContactValues, string>> = {};
  if (v.name.trim().length < 2) e.name = ct(lang, "contacts.error.nameMin");
  if (v.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = ct(lang, "contacts.error.email");
  if (v.state && !(STATES as readonly string[]).includes(v.state)) e.state = ct(lang, "contacts.error.state");
  const terms = v.defaultPaymentTermsDays.trim();
  if (terms) {
    if (Number(terms) < 0) e.defaultPaymentTermsDays = ct(lang, "contacts.error.termsNegative");
    else if (!/^\d+$/.test(terms)) e.defaultPaymentTermsDays = ct(lang, "contacts.error.termsWhole");
  }
  if (v.registrationType && !v.registrationNumber.trim()) e.registrationNumber = ct(lang, "contacts.error.registrationNumber");
  else if (v.registrationType === "NRIC" && !/^\d{12}$/.test(v.registrationNumber.trim())) e.registrationNumber = ct(lang, "contacts.error.nric");
  return e;
}
