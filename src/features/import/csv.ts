import type { StatementLine } from "./banks";

/**
 * Kira's CSV statement reader. lejar.ai has one parser per bank (Maybank, CIMB, Public Bank); without
 * those banks' real exports to copy, Kira reads any CSV whose header row names a date, a description
 * and either debit/credit columns or one signed amount column. Throws CsvError with lejar.ai's messages.
 */
export class CsvError extends Error {
  constructor(public code: "csvEmpty" | "csvHeader", public header = "") {
    super(code);
  }
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function splitRow(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy, yyyy-mm-dd, dd MMM yyyy, dd-MMM-yy → yyyy-mm-dd (Malaysian day-first order). */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (mt) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else if ((mt = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})/))) [d, m, y] = [Number(mt[1]), MONTHS[mt[2].toLowerCase()] ?? 0, Number(mt[3])];
  else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** "1,234.50", "(1,234.50)", "1234.50 DR", "-12.00", "RM 5.00" → signed number (null when blank). */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/RM|MYR/gi, "").replace(/,/g, "").trim();
  if (!s || s === "-") return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\s*(DR|D)$/i.test(s)) {
    sign = -1;
    s = s.replace(/\s*(DR|D)$/i, "");
  } else s = s.replace(/\s*(CR|C)$/i, "");
  if (s.endsWith("-")) {
    sign = -1;
    s = s.slice(0, -1);
  } else if (s.endsWith("+")) s = s.slice(0, -1);
  const n = Number(s);
  return Number.isFinite(n) ? sign * n : null;
}

const find = (cells: string[], re: RegExp) => cells.findIndex((c) => re.test(c.toLowerCase()));

export function readCsv(text: string): { lines: StatementLine[]; warnings: string[]; header: string } {
  const rows = text.replace(/^﻿/, "").split(/\r?\n/).filter((r) => r.trim() !== "");
  if (rows.length === 0) throw new CsvError("csvEmpty");
  const sep = [",", ";", "\t"].sort((a, b) => rows[0].split(b).length - rows[0].split(a).length)[0];
  const headerAt = rows.slice(0, 20).findIndex((r) => {
    const c = splitRow(r, sep).map((x) => x.toLowerCase());
    return c.some((x) => /date|tarikh/.test(x)) && c.some((x) => /desc|particular|transaction|details|keterangan|narrat/.test(x));
  });
  if (headerAt < 0) throw new CsvError("csvHeader", splitRow(rows[0], sep).slice(0, 6).join(" | "));
  const head = splitRow(rows[headerAt], sep);
  const col = {
    date: find(head, /date|tarikh/),
    desc: find(head, /desc|particular|transaction|details|keterangan|narrat/),
    ref: find(head, /ref|cheque|chq/),
    debit: find(head, /debit|withdraw|out|dr\b|pengeluaran/),
    credit: find(head, /credit|deposit|\bin\b|cr\b|kemasukan/),
    amount: find(head, /^amount|amaun|^amt/),
    balance: find(head, /balance|baki/),
  };
  if (col.date < 0 || col.desc < 0 || (col.amount < 0 && (col.debit < 0 || col.credit < 0))) {
    throw new CsvError("csvHeader", head.join(" | "));
  }
  const lines: StatementLine[] = [];
  const warnings: string[] = [];
  for (const [i, raw] of rows.slice(headerAt + 1).entries()) {
    const c = splitRow(raw, sep);
    const date = parseDate(c[col.date] ?? "");
    if (!date) {
      if ((c[col.desc] ?? "").trim()) warnings.push(`Row ${headerAt + i + 2}: no date, skipped (${(c[col.desc] ?? "").slice(0, 40)})`);
      continue;
    }
    let signed: number | null;
    if (col.amount >= 0) signed = parseAmount(c[col.amount] ?? "");
    else {
      const dr = parseAmount(c[col.debit] ?? "");
      const cr = parseAmount(c[col.credit] ?? "");
      signed = cr ? Math.abs(cr) : dr ? -Math.abs(dr) : null;
    }
    if (signed === null || signed === 0) {
      warnings.push(`Row ${headerAt + i + 2}: no amount, skipped`);
      continue;
    }
    const bal = col.balance >= 0 ? parseAmount(c[col.balance] ?? "") : null;
    lines.push({
      date,
      description: (c[col.desc] ?? "").replace(/\s+/g, " ").trim() || "(no description)",
      reference: col.ref >= 0 && c[col.ref] ? c[col.ref] : null,
      amount: Math.abs(signed).toFixed(2),
      direction: signed > 0 ? "in" : "out",
      balance: bal === null ? null : bal.toFixed(2),
    });
  }
  if (lines.length === 0) throw new CsvError("csvEmpty");
  return { lines, warnings, header: head.join(" | ") };
}
