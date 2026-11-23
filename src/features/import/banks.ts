import type { Lang } from "@/shared/i18n";
import { IMPORT_TEXT, type ImportTextKey } from "./copy-data";

/** lejar.ai's bank picker (ImportFlow, chunk 41vyteosd4-yz), plus "Other" for Kira's generic readers. */
export const BANKS = [
  { value: "MAYBANK", label: "Maybank (CSV/PDF)", match: /maybank|m2u|malayan banking/i },
  { value: "CIMB", label: "CIMB (CSV/PDF)", match: /cimb/i },
  { value: "PUBLIC_BANK", label: "Public Bank (CSV/PDF)", match: /public ?bank|pbe|pbb/i },
  { value: "AMBANK", label: "AmBank (PDF)", match: /ambank|am ?bank/i },
  { value: "RHB", label: "RHB (PDF)", match: /rhb/i },
  { value: "OCBC", label: "OCBC (PDF)", match: /ocbc/i },
  { value: "HONG_LEONG", label: "Hong Leong (PDF)", match: /hong ?leong|hlb/i },
  { value: "ALLIANCE", label: "Alliance Bank (PDF)", match: /alliance/i },
  { value: "BANK_ISLAM", label: "Bank Islam (PDF)", match: /bank ?islam|bimb/i },
  { value: "OTHER", label: "Other bank (CSV/PDF)", match: /$^/ },
] as const;
export type BankCode = (typeof BANKS)[number]["value"];

/** "Detecting banks…": the bank named in the file name or the first lines of the file. */
export function detectBank(fileName: string, head: string): BankCode | "" {
  const hay = `${fileName}\n${head}`;
  return BANKS.find((b) => b.match.test(hay))?.value ?? "";
}

export const STATEMENT_ACCEPT = ".csv,text/csv,.pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg,.webp,image/webp";

export function bt(lang: Lang, key: ImportTextKey, vars?: Record<string, string | number>): string {
  const s: string = IMPORT_TEXT[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
}

export type StatementLine = { date: string; description: string; reference: string | null; amount: string; direction: "in" | "out"; balance: string | null };
