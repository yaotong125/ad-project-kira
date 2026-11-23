import type { Lang } from "@/shared/i18n";
import { t, type NewOrgKey } from "./copy";
import {
  CADENCE_MONTHS,
  earlierYearOptions,
  earliestCommencement,
  isIsoDate,
  periodsFor,
  todayInMalaysia,
  yearsToCreate,
  type Cadence,
} from "./fiscal";

export const ENTITY_TYPES = ["sole_prop", "partnership", "llp", "sdn_bhd"] as const;
export const CHANNELS = [
  "google_search", "ai_assistant", "online_ad", "facebook", "instagram", "tiktok", "threads",
  "x", "linkedin", "youtube", "friend", "accountant", "article", "event", "other",
] as const;
export const REGISTRATION_TYPES = ["BRN", "NRIC", "PASSPORT", "ARMY"] as const;
export const CHART_MODES = ["standard", "migrating"] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type ChartMode = (typeof CHART_MODES)[number];

export type NewOrgInput = {
  legal_name: string;
  entity_type: EntityType;
  fiscal_year_end: string;
  cadence: Cadence;
  chart_mode: ChartMode;
  books_start: string;
  registration_type: (typeof REGISTRATION_TYPES)[number];
  registration_number: string;
  sst_number: string;
  tin: string;
  acquisition_channel: string;
  acquisition_detail: string;
};

export type YearsPayload = { starts_on: string; ends_on: string; periods: { starts_on: string; ends_on: string }[] }[];

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};
const oneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * Validates the /new-org form. Messages are lejar.ai's (neworg.* validation keys); the order of
 * checks is Kira's (Lejar's server code is not visible).
 */
export function validateNewOrg(
  form: FormData,
  lang: Lang,
  today = todayInMalaysia(),
): { ok: true; org: NewOrgInput; years: YearsPayload } | { ok: false; error: string } {
  const fail = (key: NewOrgKey) => ({ ok: false as const, error: t(lang, key) });

  const legalName = str(form, "legalName").replace(/\s+/g, " ");
  if (!legalName) return fail("neworg.legalName.required");
  if (legalName.length < 2) return fail("neworg.legalName.tooShort");
  if (legalName.length > 200) return fail("neworg.legalName.tooLong");

  const entityType = str(form, "entityType");
  if (!oneOf(ENTITY_TYPES, entityType)) return fail("neworg.entityType.required");

  const yearEnd = str(form, "fiscalYearEnd");
  if (!isIsoDate(yearEnd)) return fail("neworg.fiscalYearEnd.required");

  const cadence = str(form, "cadence") || "bimonthly";
  if (!(cadence in CADENCE_MONTHS)) return fail("neworg.cadence.required");

  const chartMode = str(form, "chartMode");
  if (!oneOf(CHART_MODES, chartMode)) return fail("neworg.chartMode.required");

  // "none", or the first day of one of the offered earlier years. Migrating always sends "none".
  const pastFrom = str(form, "pastRecordsFrom");
  let earliestStart: string | undefined;
  if (pastFrom !== "none") {
    if (!pastFrom || !earlierYearOptions(yearEnd, today).some((y) => y.startsOn === pastFrom)) {
      return fail("neworg.pastRecords.required");
    }
    earliestStart = pastFrom;
  }

  const commencement = str(form, "fiscalYearStart");
  if (commencement) {
    if (!isIsoDate(commencement)) return fail("neworg.fiscalYearStart.invalid");
    if (commencement > today) return fail("neworg.fiscalYearStart.future");
    if (commencement >= yearEnd || commencement < earliestCommencement(yearEnd)) {
      return fail("neworg.fiscalYearStart.outOfRange");
    }
  }

  const channel = str(form, "acquisitionChannel");
  if (!oneOf(CHANNELS, channel)) return fail("neworg.acquisitionChannel.required");
  const detail = str(form, "acquisitionDetail").slice(0, 200);
  if (channel === "other" && !detail) return fail("neworg.acquisitionDetail.requiredForOther");

  const registrationType = str(form, "registrationType") || "BRN";
  if (!oneOf(REGISTRATION_TYPES, registrationType)) return fail("neworg.registrationType.required");
  const registrationNumber = str(form, "ssmNumber");
  if (registrationType === "NRIC" && registrationNumber && !/^\d{12}$/.test(registrationNumber)) {
    return fail("neworg.ssmNumber.invalidNric");
  }

  const years = yearsToCreate({ yearEnd, commencement: commencement || undefined, earliestStart });
  return {
    ok: true,
    org: {
      legal_name: legalName,
      entity_type: entityType,
      fiscal_year_end: yearEnd,
      cadence: cadence as Cadence,
      chart_mode: chartMode,
      books_start: years[0].startsOn,
      registration_type: registrationType,
      registration_number: registrationNumber,
      sst_number: str(form, "sstNumber"),
      tin: str(form, "tin"),
      acquisition_channel: channel,
      acquisition_detail: detail,
    },
    years: years.map((y) => ({
      starts_on: y.startsOn,
      ends_on: y.endsOn,
      periods: periodsFor(y, cadence as Cadence).map((p) => ({ starts_on: p.startsOn, ends_on: p.endsOn })),
    })),
  };
}
