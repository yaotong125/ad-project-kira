"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Lang } from "@/shared/i18n";
import { supabaseBrowser } from "@/shared/supabase/browser";
import { Button, buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { BUCKET, MAX_FILE_BYTES } from "@/features/inbox/limits";
import { analyseUploadAction, createBankAccountAction, detectStatementBankAction } from "./actions";
import { BANKS, STATEMENT_ACCEPT, bt } from "./banks";
import { statementType } from "./files";

type Row = { key: number; file: File; bank: string; account: string; error: string | null; status: "ready" | "working" | "done" | "failed" };
const TH = "border-b border-border px-3 py-2 text-left text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";

async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Step 1 of lejar.ai's ImportFlow: pick one or several statement files, check the detected bank and the
 * cash / bank account each lands in, add a bank account if needed, then "Process N statements".
 * Each file is uploaded to Storage and read on the server; the review opens on the first statement.
 */
export function UploadFlow({ orgSlug, lang, cashAccounts }: { orgSlug: string; lang: Lang; cashAccounts: { code: string; name: string }[] }) {
  const t = (k: Parameters<typeof bt>[1], v?: Record<string, string | number>) => bt(lang, k, v);
  const router = useRouter();
  const [accounts, setAccounts] = useState(cashAccounts);
  const [rows, setRows] = useState<Row[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const seq = useRef(0);
  const defaultAccount = accounts.find((a) => a.code === "300-0900")?.code ?? accounts[0]?.code ?? "";

  const pick = async (files: FileList) => {
    setDetecting(true);
    const next: Row[] = [];
    for (const file of Array.from(files).slice(0, 20)) {
      const head = statementType(file.name, file.type) === "text/csv" ? (await file.slice(0, 4000).text()) : "";
      const bank = await detectStatementBankAction(file.name, head);
      const bad = file.size === 0 ? t("bankImport.error.emptyFile") : file.size > MAX_FILE_BYTES ? t("bankImport.error.tooLarge", { limit: MAX_FILE_BYTES }) : !statementType(file.name, file.type) ? "Use a CSV, PDF or photo of the statement." : null;
      next.push({ key: ++seq.current, file, bank: bank || "", account: defaultAccount, error: bad, status: bad ? "failed" : "ready" });
    }
    setRows(next);
    setDetecting(false);
  };

  const ready = rows.filter((r) => r.status === "ready");

  const process = async () => {
    setBusy(true);
    setNotice(null);
    const ids: string[] = [];
    for (const r of ready) {
      const set = (patch: Partial<Row>) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, ...patch } : x)));
      if (!r.bank) {
        set({ status: "failed", error: "Select the bank for this statement." });
        continue;
      }
      set({ status: "working", error: null });
      try {
        const type = statementType(r.file.name, r.file.type)!;
        const sha256 = await sha256Hex(r.file);
        const res = await fetch("/api/import/uploads", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orgSlug, files: [{ sha256, name: r.file.name, size: r.file.size, contentType: type }] }),
        });
        const slot = (await res.json()).files?.[0];
        if (!res.ok || !slot || slot.status === "refused") throw new Error("upload");
        if (slot.status === "upload") {
          const { error } = await supabaseBrowser().storage.from(BUCKET).uploadToSignedUrl(slot.path, slot.token, r.file, { contentType: type });
          if (error) throw new Error("upload");
        }
        const a = await analyseUploadAction(orgSlug, { sha256, name: r.file.name, size: r.file.size, contentType: type, bank: r.bank, accountCode: r.account });
        if (!a.ok) {
          set({ status: "failed", error: a.error });
          if (a.notConfigured) setNotice(a.error);
          continue;
        }
        set({ status: "done", error: a.alreadyImportedOn ? t("bankImport.flow.alreadyImported.head", { date: a.alreadyImportedOn }) + " " + t("bankImport.flow.alreadyImported.skipped") : null });
        ids.push(a.statementId);
      } catch {
        set({ status: "failed", error: t("bankImport.flow.error.sendFailed") });
      }
    }
    setBusy(false);
    if (ids.length > 0) router.push(`/${orgSlug}/import?statement=${ids[0]}${ids.length > 1 ? `&queue=${ids.slice(1).join(",")}` : ""}`);
  };

  const addAccount = async () => {
    setAddError(null);
    const r = await createBankAccountAction(orgSlug, newName);
    if (!r.ok) return setAddError(r.error);
    const acct = { code: r.code, name: r.name };
    setAccounts((a) => [...a, acct]);
    setRows((rs) => rs.map((x) => ({ ...x, account: acct.code })));
    setAdding(false);
    setNewName("");
  };

  return (
    <div data-flow="import-upload" className="card flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-medium text-ink">{t("bankImport.flow.upload.filesLabel")}</span>
        <span className="inline-flex items-center gap-2.5">
          <input id="statement-files" type="file" multiple accept={STATEMENT_ACCEPT} className="peer sr-only" disabled={busy} onChange={(e) => e.target.files && void pick(e.target.files)} />
          <label htmlFor="statement-files" className={buttonClass("secondary", "default", "cursor-pointer peer-disabled:opacity-50")}>
            {t("bankImport.flow.upload.choose")}
          </label>
          {detecting && <span className="text-[12.5px] text-muted">{t("bankImport.flow.upload.detecting")}</span>}
        </span>
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-surface">
              <tr>
                <th className={TH}>{t("bankImport.flow.upload.thFile")}</th>
                <th className={TH}>{t("bankImport.flow.upload.thBank")}</th>
                <th className={TH}>{t("bankImport.flow.upload.thAccount")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <div className="text-ink">{r.file.name}</div>
                    {r.status === "working" && <div className="text-[12px] text-muted">{t("bankImport.flow.upload.analysing")}</div>}
                    {r.error && <div className={cn("text-[12px]", r.status === "failed" ? "text-negative" : "text-muted")}>{r.error}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <Select aria-label={t("bankImport.flow.upload.bankAria", { file: r.file.name })} value={r.bank} disabled={busy || r.status === "done"} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, bank: e.target.value, ...(x.status === "failed" && !x.error?.startsWith("Use") ? { status: "ready", error: null } : {}) } : x)))}>
                      <option value="">{t("bankImport.flow.upload.selectBank")}</option>
                      {BANKS.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select aria-label={t("bankImport.flow.upload.accountAria", { file: r.file.name })} value={r.account} disabled={busy || r.status === "done"} onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, account: e.target.value } : x)))}>
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={busy || ready.length === 0} onClick={() => void process()}>
            {busy ? t("bankImport.flow.upload.analysing") : ready.length === 1 ? t("bankImport.flow.upload.processOne") : t("bankImport.flow.upload.processMany", { count: ready.length })}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setRows([])}>
            {t("bankImport.flow.upload.clear")}
          </Button>
        </div>
      )}
      {notice && <p role="status" className="text-[13px] text-negative">{notice}</p>}

      <div className="flex flex-col gap-2">
        {adding ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Bank account name
              <Input className="w-[280px]" placeholder="e.g. Maybank · 1234" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </label>
            <Button variant="secondary" size="sm" onClick={() => void addAccount()}>
              {t("bankImport.flow.upload.addBank")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              {t("bankImport.flow.row.cancel")}
            </Button>
          </div>
        ) : (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              {t("bankImport.flow.upload.addBank")}
            </Button>
          </div>
        )}
        {addError && <p role="alert" className="text-[12px] text-negative">{addError}</p>}
        <p className="max-w-[760px] text-[11.5px] text-muted">{t("bankImport.flow.upload.addBankHint")}</p>
      </div>
    </div>
  );
}
