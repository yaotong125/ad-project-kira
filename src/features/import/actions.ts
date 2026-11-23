"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { booksError } from "@/features/books/db-errors";
import { AiNotConfiguredError, AiReadError, type ChartAccount } from "@/features/inbox/ai/read-document";
import { BUCKET, isSha256 } from "@/features/inbox/limits";
import { editableOrg } from "@/features/inbox/server";
import { appLang } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { categoriseLines, readStatement } from "./ai";
import { BANKS, bt, detectBank, type StatementLine } from "./banks";
import { CsvError, parseDate, readCsv } from "./csv";
import { STATEMENT_TYPES, statementType } from "./files";

/** lejar.ai's ImportFlow Server Actions (chunk 41vyteosd4-yz), as Kira builds them. */
type Fail = { ok: false; error: string; notConfigured?: boolean };
const NOT_CONFIGURED = "The AI is not set up for this Kira yet: add ANTHROPIC_API_KEY to .env.local and restart the server.";

function refresh(slug: string) {
  revalidatePath(`/${slug}/import`);
  revalidatePath(`/${slug}/learn`);
}

/** "Add a bank account": a new cash account the statement can land in. */
export async function createBankAccountAction(orgSlug: string, name: string): Promise<{ ok: true; code: string; name: string } | Fail> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_bank_account", { p_slug: orgSlug, p_name: name });
  if (error) return { ok: false, error: error.message === "name_min" ? "Name the account, e.g. Maybank · 1234." : booksError(error) };
  refresh(orgSlug);
  return { ok: true, code: data.code, name: data.name };
}

/** "Detecting banks…": the first bytes of an uploaded file plus its name. */
export async function detectStatementBankAction(fileName: string, head: string): Promise<string> {
  return detectBank(fileName, head.slice(0, 4000));
}

export type AnalyseInput = { sha256: string; name: string; size: number; contentType: string; bank: string; accountCode: string };
export type AnalyseResult =
  | { ok: true; statementId: string; lines: number; duplicates: number; warnings: string[]; alreadyImportedOn: string | null }
  | Fail;

/** lejar.ai's analyseUploadAction: check the stored bytes, read the statement (CSV parser or AI), save its lines as drafts. */
export async function analyseUploadAction(orgSlug: string, file: AnalyseInput): Promise<AnalyseResult> {
  const lang = await appLang();
  const supabase = await createSupabaseServerClient();
  const org = await editableOrg(supabase, orgSlug);
  if (!org) return { ok: false, error: "You cannot change this entity's books." };
  const type = statementType(file.name, file.contentType);
  if (!isSha256(file.sha256) || !type) return { ok: false, error: bt(lang, "bankImport.error.noFile") };
  if (!BANKS.some((b) => b.value === file.bank)) return { ok: false, error: "Select the bank for this statement." };
  const path = `${org.id}/${file.sha256}.${STATEMENT_TYPES[type]}`;
  const { data: blob } = await supabase.storage.from(BUCKET).download(path);
  if (!blob) return { ok: false, error: bt(lang, "bankImport.flow.error.sendFailed") };
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length === 0) return { ok: false, error: bt(lang, "bankImport.error.emptyFile") };
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) return { ok: false, error: bt(lang, "bankImport.flow.error.sendFailed") };

  const { data: docId, error: docError } = await supabase.rpc("register_source_document", {
    p_slug: org.slug,
    p_file: { sha256: file.sha256, path, name: file.name, contentType: type, size: bytes.length },
  });
  if (docError) return { ok: false, error: booksError(docError) };

  const bank = BANKS.find((b) => b.value === file.bank)!.label.replace(/ \(.*\)$/, "");
  let lines: StatementLine[] = [];
  let warnings: string[] = [];
  let meta = { periodStart: null as string | null, periodEnd: null as string | null, opening: null as number | null, closing: null as number | null };
  let reader: "csv" | "ai" = "csv";
  try {
    if (type === "text/csv") {
      const r = readCsv(bytes.toString("utf8"));
      lines = r.lines;
      warnings = r.warnings;
    } else {
      reader = "ai";
      const r = await readStatement(bytes, type);
      if (!r.readable) {
        return { ok: false, error: `${r.problem ?? bt(lang, "bankImport.error.scanUnreadable")} Nothing was imported. Upload the bank-generated PDF e-statement or a CSV export for an exact read.` };
      }
      lines = r.lines
        .map((l) => ({ date: parseDate(l.date) ?? "", description: l.description.trim(), reference: l.reference, amount: Math.abs(l.amount).toFixed(2), direction: l.direction, balance: l.balance === null ? null : l.balance.toFixed(2) }))
        .filter((l) => l.date && Number(l.amount) > 0);
      const dropped = r.lines.length - lines.length;
      if (dropped > 0) warnings.push(`${dropped} line(s) without a valid date or amount were left out.`);
      meta = { periodStart: parseDate(r.period_start ?? ""), periodEnd: parseDate(r.period_end ?? ""), opening: r.opening_balance, closing: r.closing_balance };
    }
  } catch (error) {
    if (error instanceof CsvError) {
      return { ok: false, error: error.code === "csvEmpty" ? bt(lang, "bankImport.error.csvEmpty", { bank }) : bt(lang, "bankImport.error.csvHeader", { bank, header: error.header }) };
    }
    if (error instanceof AiNotConfiguredError) return { ok: false, error: NOT_CONFIGURED, notConfigured: true };
    if (error instanceof AiReadError) return { ok: false, error: error.message };
    console.error("[import] analyse failed:", error);
    return { ok: false, error: bt(lang, "bankImport.error.invalidStatement") };
  }
  if (lines.length === 0) return { ok: false, error: bt(lang, "bankImport.error.csvEmpty", { bank }) };

  const { data: earlier } = await supabase
    .from("bank_statements")
    .select("created_at")
    .eq("org_id", org.id)
    .eq("source_document_id", docId)
    .order("created_at")
    .limit(1);
  const dates = lines.map((l) => l.date).sort();
  const { data: id, error } = await supabase.rpc("save_bank_statement", {
    p_slug: org.slug,
    p_stmt: {
      sourceDocumentId: docId,
      bank: file.bank,
      accountCode: file.accountCode,
      fileName: file.name,
      reader,
      periodStart: meta.periodStart ?? dates[0],
      periodEnd: meta.periodEnd ?? dates[dates.length - 1],
      openingBalance: meta.opening,
      closingBalance: meta.closing,
      warnings,
      lines,
    },
  });
  if (error) {
    console.warn("[import] save failed:", error.code, error.message);
    return { ok: false, error: booksError(error) };
  }
  const { count } = await supabase.from("bank_statement_lines").select("id", { count: "exact", head: true }).eq("statement_id", id).eq("status", "duplicate");
  refresh(org.slug);
  return { ok: true, statementId: id, lines: lines.length, duplicates: count ?? 0, warnings, alreadyImportedOn: earlier?.[0]?.created_at?.slice(0, 10) ?? null };
}

/** lejar.ai's categoriseChunkAction: AI suggestions for up to 40 draft lines of a statement. */
export async function categoriseChunkAction(orgSlug: string, statementId: string, positions: number[]): Promise<{ ok: true } | Fail> {
  const supabase = await createSupabaseServerClient();
  const org = await editableOrg(supabase, orgSlug);
  if (!org) return { ok: false, error: "You cannot change this entity's books." };
  const [{ data: rows }, { data: chart }, { data: orgRow }] = await Promise.all([
    supabase.from("bank_statement_lines").select("position, txn_date, description, amount, direction").eq("statement_id", statementId).eq("org_id", org.id).eq("status", "draft").in("position", positions.slice(0, 40)),
    supabase.from("accounts").select("code, name, type, is_cash").eq("org_id", org.id).eq("status", "active"),
    supabase.from("organizations").select("legal_name").eq("id", org.id).single(),
  ]);
  if (!rows || rows.length === 0) return { ok: true };
  try {
    const out = await categoriseLines(
      orgRow?.legal_name ?? "",
      (chart ?? []) as ChartAccount[],
      rows.map((r) => ({ position: r.position, date: r.txn_date, description: r.description, amount: String(r.amount), direction: r.direction })),
    );
    const { error } = await supabase.rpc("save_line_suggestions", { p_slug: org.slug, p_statement: statementId, p_rows: out });
    if (error) return { ok: false, error: booksError(error) };
    return { ok: true };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { ok: false, error: NOT_CONFIGURED, notConfigured: true };
    if (error instanceof AiReadError) return { ok: false, error: error.message };
    console.error("[import] categorise failed:", error);
    return { ok: false, error: "The AI could not categorise these lines. Try again." };
  }
}

export type LinePatch = { date?: string; description?: string; amount?: string; direction?: "in" | "out"; accountCode?: string; status?: "draft" | "skipped" };

/** Edit a draft line (date, description, amount, direction, category) or skip / restore it. */
export async function updateLineAction(orgSlug: string, lineId: string, patch: LinePatch): Promise<{ ok: true } | Fail> {
  const lang = await appLang();
  if (patch.amount !== undefined && !/^\d+(\.\d{1,2})?$/.test(patch.amount.replace(/,/g, ""))) return { ok: false, error: bt(lang, "bankImport.flow.row.amountError") };
  if (patch.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) return { ok: false, error: bt(lang, "bankImport.flow.row.dateError") };
  if (patch.description !== undefined && !patch.description.trim()) return { ok: false, error: bt(lang, "bankImport.flow.row.descriptionError") };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_statement_line", { p_slug: orgSlug, p_line: lineId, p_patch: { ...patch, ...(patch.amount ? { amount: patch.amount.replace(/,/g, "") } : {}) } });
  if (error) return { ok: false, error: booksError(error) };
  refresh(orgSlug);
  return { ok: true };
}

/** lejar.ai's bulkApproveAction ("Record N entries"). */
export async function recordLinesAction(orgSlug: string, lineIds: string[]): Promise<{ ok: true; recorded: number; failed: { position: number; error: string }[] } | Fail> {
  const lang = await appLang();
  if (lineIds.length === 0) return { ok: false, error: bt(lang, "bankImport.flow.error.pickDraft") };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_statement_lines", { p_slug: orgSlug, p_lines: lineIds });
  if (error) return { ok: false, error: booksError(error) };
  refresh(orgSlug);
  return {
    ok: true,
    recorded: data.recorded,
    failed: (data.failed as { position: number; error: string }[]).map((f) => ({ position: f.position, error: f.error === "no_account" ? bt(lang, "bankImport.flow.row.pickFirst") : booksError({ message: f.error }) })),
  };
}

/** lejar.ai's confirmMatchesAction: link lines to entries already in the books (nothing new is recorded). */
export async function confirmMatchesAction(orgSlug: string, pairs: { lineId: string; entryId: string }[]): Promise<{ ok: true; confirmed: number } | Fail> {
  const lang = await appLang();
  if (pairs.length === 0) return { ok: false, error: bt(lang, "bankImport.flow.error.pickMatch") };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("confirm_statement_matches", { p_slug: orgSlug, p_pairs: pairs });
  if (error) return { ok: false, error: booksError(error) };
  refresh(orgSlug);
  return { ok: true, confirmed: data as number };
}

/** lejar.ai's deleteStatementUploadAction. */
export async function deleteStatementAction(orgSlug: string, id: string): Promise<{ ok: true } | Fail> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_bank_statement", { p_slug: orgSlug, p_id: id });
  if (error) return { ok: false, error: bt(await appLang(), "bankImport.delete.failed") };
  refresh(orgSlug);
  return { ok: true };
}
