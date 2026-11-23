/**
 * Financial-year arithmetic for /new-org. Dates are ISO strings ("2026-12-31") handled in UTC.
 *
 * `earlierYearOptions` is ported from lejar.ai's NewOrgForm (chunk 606412, 2026-11-22): up to six
 * financial years before the first one, but none starting before the record-keeping cut-off
 * (the year-end anniversary on or after today, minus 7 years, plus 1 day).
 * Period and year generation is Kira's (Lejar's server code is not visible); it matches what
 * lejar.ai showed for a 31 Dec year-end with bimonthly cadence: 1 Jan–31 Dec, six 2-month periods.
 */

export const CADENCE_MONTHS = { bimonthly: 2, monthly: 1, quarterly: 3 } as const;
export type Cadence = keyof typeof CADENCE_MONTHS;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);
const addYears = (d: Date, n: number) => {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() + n);
  return r;
};
const addDays = (d: Date, n: number) => new Date(d.getTime() + 864e5 * n);
/** Adds months, clamping the day to the target month's length (31 Jan + 1 month = 28/29 Feb). */
const addMonths = (d: Date, n: number) => {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last)));
};

export function isIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = toDate(s);
  return !Number.isNaN(d.getTime()) && toIso(d) === s;
}

/** Today in Malaysia (lejar.ai uses Asia/Kuala_Lumpur for the commencement date's `max`). */
export function todayInMalaysia(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(now);
}

export function defaultYearEnd(now = new Date()): string {
  return `${now.getFullYear()}-12-31`;
}

/** First day of a normal 12-month year ending on `yearEnd`. */
export function normalYearStart(yearEnd: string): string {
  return toIso(addDays(addYears(toDate(yearEnd), -1), 1));
}

export type YearRange = { startsOn: string; endsOn: string };

/** Lejar's list of earlier financial years for "Yes, from …" (newest first). */
export function earlierYearOptions(yearEnd: string, today = todayInMalaysia()): YearRange[] {
  if (!isIsoDate(yearEnd) || yearEnd.endsWith("-02-29")) return [];
  const first = addDays(addYears(toDate(yearEnd), -1), 1);
  const [, month = 12, day = 31] = yearEnd.split("-").map(Number);
  const anniversary = (y: number) =>
    new Date(Date.UTC(y, month - 1, Math.min(day, new Date(Date.UTC(y, month, 0)).getUTCDate())));
  const thisYear = Number(today.slice(0, 4));
  const next = anniversary(thisYear) >= toDate(today) ? anniversary(thisYear) : anniversary(thisYear + 1);
  const cutoff = toIso(addDays(anniversary(next.getUTCFullYear() - 7), 1));
  return Array.from({ length: 6 }, (_, i) => {
    const start = addYears(first, -(i + 1));
    return { startsOn: toIso(start), endsOn: toIso(addDays(addYears(start, 1), -1)) };
  }).filter((y) => y.startsOn >= cutoff);
}

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ms: ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogos", "Sep", "Okt", "Nov", "Dis"],
} as const;

/** "2025" for a calendar year, otherwise "Jul 2024 - Jun 2025" (Lejar's option labels). */
export function yearLabel(y: YearRange, lang: "en" | "ms"): string {
  const [sy, sm] = y.startsOn.split("-").map(Number);
  const [ey, em, ed] = y.endsOn.split("-").map(Number);
  if (sm === 1 && em === 12 && ed === 31) return String(sy);
  return `${MONTHS[lang][sm - 1]} ${sy} - ${MONTHS[lang][em - 1]} ${ey}`;
}

/** Splits a financial year into periods of 1, 2 or 3 months from its first day; the last ends on the year-end. */
export function periodsFor(year: YearRange, cadence: Cadence): YearRange[] {
  const step = CADENCE_MONTHS[cadence];
  const end = toDate(year.endsOn);
  const out: YearRange[] = [];
  let start = toDate(year.startsOn);
  while (start <= end) {
    const next = addMonths(start, step);
    const periodEnd = addDays(next, -1) < end ? addDays(next, -1) : end;
    out.push({ startsOn: toIso(start), endsOn: toIso(periodEnd) });
    start = next;
  }
  return out;
}

/**
 * Financial years to create, oldest first: earlier years (from `earliestStart`, each 12 months) and
 * the first year (12 months ending on `yearEnd`, or from `commencement` when the first year is long).
 */
export function yearsToCreate(opts: {
  yearEnd: string;
  commencement?: string;
  earliestStart?: string;
}): YearRange[] {
  const first: YearRange = { startsOn: opts.commencement || normalYearStart(opts.yearEnd), endsOn: opts.yearEnd };
  const years: YearRange[] = [first];
  if (opts.earliestStart) {
    let end = addDays(toDate(first.startsOn), -1);
    for (let i = 0; i < 6; i++) {
      const start = addDays(addYears(end, -1), 1);
      if (toIso(start) < opts.earliestStart) break;
      years.unshift({ startsOn: toIso(start), endsOn: toIso(end) });
      end = addDays(start, -1);
    }
  }
  return years;
}

/** Earliest allowed commencement date: no more than 18 months before the year-end. */
export function earliestCommencement(yearEnd: string): string {
  return toIso(addDays(addMonths(toDate(yearEnd), -18), 1));
}
