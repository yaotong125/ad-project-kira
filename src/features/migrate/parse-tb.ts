import type { AccountOption, TbMappingRow } from "./types";

export const SAMPLE_CSV_TEMPLATE = [
  "account_code,account_name,debit,credit",
  "300-0900,Cash and Bank Balances,25000.00,0.00",
  "300-0200,Trade Receivables,8000.00,0.00",
  "200-0300,Computer Equipment,5000.00,0.00",
  "200-0305,Accumulated Depreciation - Computer Equipment,0.00,1000.00",
  "400-0100,Trade Payables,0.00,4000.00",
  "100-0100,Share Capital,0.00,30000.00",
  "100-0400,Retained Earnings,0.00,3000.00",
].join("\n");

/** RFC-4180 CSV / TSV line splitter handling quotes and escaped quotes. */
function splitDelimited(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const firstLine = clean.split("\n").find((l) => l.trim().length > 0) ?? "";
  const delim = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field.trim());
      field = "";
    } else if (ch === "\n") {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function parseMoney(raw: string | undefined): number {
  if (!raw) return 0;
  let s = raw.trim().replace(/^RM\s*/i, "").replace(/^MYR\s*/i, "").replace(/,/g, "").replace(/\s+/g, "");
  if (!s || s === "-" || s === "–") return 0;
  let neg = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    neg = true;
    s = s.slice(1, -1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round((neg ? -n : n) * 100) / 100;
}

const ALIASES: [RegExp, string][] = [
  [/\b(cash at bank|bank balance|maybank|cimb|public bank|rhb|hong leong|ambank|uob|ocbc|hsbc)\b/i, "300-0900"],
  [/\bpetty cash\b|\bcash in hand\b/i, "300-1000"],
  [/\b(accounts? receivable|trade debtors?|debtors? control)\b/i, "300-0200"],
  [/\b(accounts? payable|trade creditors?|creditors? control)\b/i, "400-0100"],
  [/\b(inventory|closing stock|stock on hand|merchandise)\b/i, "300-0100"],
  [/\bprepayment/i, "300-0500"],
  [/\bdeposits?\b/i, "300-0600"],
  [/\bcomputer|laptop|it equipment\b/i, "200-0300"],
  [/\bfurniture|office equipment|fittings\b/i, "200-0200"],
  [/\bmotor vehicle/i, "200-0400"],
  [/\bshare capital|paid[- ]?up capital|owner.?s? capital\b/i, "100-0100"],
  [/\bretained earnings|accumulated profit|undistributed profit\b/i, "__RETAINED__"],
  [/\bsales?\b|\brevenue\b/i, "600-0100"],
  [/\bservice (revenue|income)\b/i, "600-0200"],
  [/\bpurchases?\b|\bcost of (sales|goods)\b/i, "700-0100"],
  [/\b(salar|wages|payroll)\b/i, "800-0200"],
  [/\brent(al)?\b/i, "800-0800"],
  [/\butilit|electric|water\b/i, "800-0900"],
  [/\btelephone|internet\b/i, "800-1300"],
  [/\bbank charge/i, "900-0600"],
];

export function matchAccount(
  sourceCode: string,
  sourceName: string,
  accounts: AccountOption[],
): { accountId: string; matchedBy: "code" | "name" | "none" } {
  const code = sourceCode.trim().toLowerCase();
  if (code) {
    const byCode = accounts.find((a) => a.code.toLowerCase() === code);
    if (byCode) return { accountId: byCode.id, matchedBy: "code" };
  }

  const name = sourceName.trim().toLowerCase();
  if (name) {
    const exact = accounts.find((a) => a.name.toLowerCase() === name);
    if (exact) return { accountId: exact.id, matchedBy: "name" };

    // Handle accumulated depreciation specifically before PPE aliases
    if (name.includes("accumulated depreciation") || name.includes("accum dep")) {
      const accum = accounts.find(
        (a) =>
          a.name.toLowerCase().includes("accumulated depreciation") &&
          ((name.includes("computer") && a.code === "200-0305") ||
            (name.includes("furniture") && a.code === "200-0205") ||
            (name.includes("motor") && a.code === "200-0405") ||
            (name.includes("land") && a.code === "200-0105") ||
            (name.includes("renovation") && a.code === "200-0505")),
      );
      if (accum) return { accountId: accum.id, matchedBy: "name" };
    }

    for (const [re, targetCode] of ALIASES) {
      if (re.test(name)) {
        const hit =
          targetCode === "__RETAINED__"
            ? accounts.find((a) => a.section === "retained_earnings")
            : accounts.find((a) => a.code === targetCode);
        if (hit) return { accountId: hit.id, matchedBy: "name" };
      }
    }

    // Token overlap fallback
    const tokens = name.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
    let best: AccountOption | null = null;
    let bestScore = 0;
    for (const a of accounts) {
      const aLower = a.name.toLowerCase();
      const score = tokens.reduce((s, tok) => (aLower.includes(tok) ? s + 1 : s), 0);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (best && bestScore >= 2) return { accountId: best.id, matchedBy: "name" };
  }

  return { accountId: "", matchedBy: "none" };
}

/** Parses CSV / Xero / Sage UBS trial balance exports into mappable rows. */
export function parseTrialBalanceCsv(
  text: string,
  accounts: AccountOption[],
): { rows: TbMappingRow[]; error: string | null } {
  const grid = splitDelimited(text);
  if (grid.length < 2) {
    return { rows: [], error: "The file looks empty. Upload a CSV with a header row and at least two balance rows." };
  }

  // Locate header row (Xero & Sage UBS often have 2-4 title lines above the table header).
  let headerIdx = -1;
  let codeCol = -1;
  let nameCol = -1;
  let drCol = -1;
  let crCol = -1;
  let balCol = -1;

  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    const lower = grid[r].map((c) => c.toLowerCase().trim());
    const dr = lower.findIndex((c) => c.startsWith("debit") || c === "dr" || c.includes("debit - year"));
    const cr = lower.findIndex((c) => c.startsWith("credit") || c === "cr" || c.includes("credit - year"));
    const bal = lower.findIndex((c) => c === "balance" || c === "closing balance" || c === "net");
    if ((dr >= 0 && cr >= 0) || bal >= 0) {
      headerIdx = r;
      drCol = dr;
      crCol = cr;
      balCol = bal;
      codeCol = lower.findIndex((c) => c.includes("code") || c.includes("account no") || c === "acc no" || c === "no");
      nameCol = lower.findIndex(
        (c, idx) =>
          idx !== codeCol &&
          (c === "account" || c.includes("account name") || c.includes("description") || c === "name"),
      );
      if (nameCol < 0) {
        nameCol = lower.findIndex((_, idx) => idx !== codeCol && idx !== drCol && idx !== crCol && idx !== balCol);
      }
      break;
    }
  }

  if (headerIdx < 0) {
    return {
      rows: [],
      error: "Could not find Debit and Credit (or Balance) columns. Use the CSV template or export a standard Trial Balance CSV.",
    };
  }

  const out: TbMappingRow[] = [];
  let seq = 0;
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const cells = grid[r];
    const sourceCode = codeCol >= 0 ? (cells[codeCol] ?? "").trim() : "";
    const sourceName = nameCol >= 0 ? (cells[nameCol] ?? "").trim() : "";
    const joined = `${sourceCode} ${sourceName}`.trim().toLowerCase();
    if (!joined || joined === "total" || joined === "totals" || joined.startsWith("total ")) continue;

    let dr = 0;
    let cr = 0;
    if (drCol >= 0 && crCol >= 0) {
      dr = parseMoney(cells[drCol]);
      cr = parseMoney(cells[crCol]);
      if (dr < 0) {
        cr += -dr;
        dr = 0;
      }
      if (cr < 0) {
        dr += -cr;
        cr = 0;
      }
    } else if (balCol >= 0) {
      const b = parseMoney(cells[balCol]);
      if (b > 0) dr = b;
      else if (b < 0) cr = -b;
    }

    if (dr === 0 && cr === 0) continue;
    // Net if both sides somehow appeared
    if (dr > 0 && cr > 0) {
      if (dr >= cr) {
        dr = Math.round((dr - cr) * 100) / 100;
        cr = 0;
      } else {
        cr = Math.round((cr - dr) * 100) / 100;
        dr = 0;
      }
    }

    const match = matchAccount(sourceCode, sourceName, accounts);
    seq += 1;
    out.push({
      key: `tb-${seq}-${Date.now()}`,
      sourceCode,
      sourceName,
      accountId: match.accountId,
      debit: dr > 0 ? dr.toFixed(2) : "",
      credit: cr > 0 ? cr.toFixed(2) : "",
      matchedBy: match.matchedBy,
    });
  }

  if (out.length === 0) {
    return { rows: [], error: "No non-zero balance rows were found in that file." };
  }
  return { rows: out, error: null };
}
