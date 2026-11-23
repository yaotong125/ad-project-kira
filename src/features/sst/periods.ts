/**
 * SST-02 taxable periods (lejar.ai Settings → SST filing, observed 2026-11-22). A configured cadence splits
 * the books into periods that end on the financial year end ("Which two months pair together follows your
 * financial year end"), bounded by the SST registration date. Unconfigured, returns follow the bookkeeping
 * periods. Pure functions, shared by the SST page, the settings preview and Ask Kira.
 */

export type SstCadence = "bimonthly" | "monthly" | "quarterly";
export type SstPeriod = { id: string; startsOn: string; endsOn: string; label: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_MS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ogo", "Sep", "Okt", "Nov", "Dis"];
export const CADENCE_MONTHS: Record<SstCadence, number> = { monthly: 1, bimonthly: 2, quarterly: 3 };

const pad = (n: number) => String(n).padStart(2, "0");
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const firstOf = (idx: number) => `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}-01`;
const lastOf = (idx: number) => {
  const y = Math.floor(idx / 12);
  const m = idx % 12;
  return `${y}-${pad(m + 1)}-${pad(new Date(Date.UTC(y, m + 1, 0)).getUTCDate())}`;
};

/** "Nov-Dec 2026", "Nov 2026", "Dec 2026-Feb 2027". */
export function periodLabel(startsOn: string, endsOn: string, lang: "en" | "ms" = "en"): string {
  const names = lang === "ms" ? MONTHS_MS : MONTHS;
  const a = monthIndex(startsOn);
  const b = monthIndex(endsOn);
  const ya = Math.floor(a / 12);
  const yb = Math.floor(b / 12);
  if (a === b) return `${names[a % 12]} ${ya}`;
  return ya === yb ? `${names[a % 12]}-${names[b % 12]} ${yb}` : `${names[a % 12]} ${ya}-${names[b % 12]} ${yb}`;
}

export const periodId = (startsOn: string, endsOn: string) => `${startsOn}_${endsOn}`;

/**
 * Periods of `cadence` months whose ends line up with the financial year end month, covering
 * [rangeStart, rangeEnd], newest first. The registration date drops earlier periods and starts the first one.
 */
export function cadencePeriods(opts: { fyeMonth: number; cadence: SstCadence; rangeStart: string; rangeEnd: string; registeredOn?: string | null; lang?: "en" | "ms" }): SstPeriod[] {
  const n = CADENCE_MONTHS[opts.cadence];
  const anchor = opts.fyeMonth - 1; // month index (mod 12) of a period end
  const startIdx = monthIndex(opts.rangeStart);
  const endIdx = monthIndex(opts.rangeEnd);
  let e = startIdx;
  while ((((e - anchor) % n) + n) % n !== 0) e++;
  const out: SstPeriod[] = [];
  for (; e - n + 1 <= endIdx; e += n) {
    let startsOn = firstOf(e - n + 1);
    const endsOn = lastOf(e);
    if (startsOn < opts.rangeStart) startsOn = opts.rangeStart;
    if (opts.registeredOn) {
      if (endsOn < opts.registeredOn) continue;
      if (startsOn < opts.registeredOn) startsOn = opts.registeredOn;
    }
    out.push({ id: periodId(startsOn, endsOn), startsOn, endsOn, label: periodLabel(startsOn, endsOn, opts.lang) });
  }
  return out.reverse();
}

/** Unconfigured: the bookkeeping periods, labelled like lejar.ai's "2026-11 → 2026-12". */
export function bookkeepingPeriods(periods: { startsOn: string; endsOn: string }[], registeredOn?: string | null): SstPeriod[] {
  return periods
    .filter((p) => !registeredOn || p.endsOn >= registeredOn)
    .map((p) => {
      const startsOn = registeredOn && p.startsOn < registeredOn ? registeredOn : p.startsOn;
      const label = startsOn.slice(0, 7) === p.endsOn.slice(0, 7) ? startsOn.slice(0, 7) : `${startsOn.slice(0, 7)} → ${p.endsOn.slice(0, 7)}`;
      return { id: periodId(startsOn, p.endsOn), startsOn, endsOn: p.endsOn, label };
    })
    .reverse();
}

/** The period holding today, else the latest one that has ended, else the earliest. */
export function currentPeriod(periods: SstPeriod[], today: string): SstPeriod | undefined {
  return periods.find((p) => p.startsOn <= today && today <= p.endsOn) ?? periods.find((p) => p.endsOn < today) ?? periods.at(-1);
}

/** Filing due: the last day of the month following period end (Service Tax Regulations 2018, Reg 12). */
export function filingDue(endsOn: string): string {
  return lastOf(monthIndex(endsOn) + 1);
}

/** The settings preview: "Jan-Feb 2026, Mar-Apr 2026, …" for the financial year holding `today`. */
export function previewYear(fyeMonth: number, cadence: SstCadence, today: string, lang: "en" | "ms" = "en"): string {
  const t = monthIndex(today);
  let end = t;
  while (end % 12 !== fyeMonth - 1) end++;
  const periods = cadencePeriods({ fyeMonth, cadence, rangeStart: firstOf(end - 11), rangeEnd: lastOf(end), lang });
  return periods.reverse().map((p) => p.label).join(", ");
}
