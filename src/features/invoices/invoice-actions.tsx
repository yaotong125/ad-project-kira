"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/form-controls";
import { deleteInvoiceDraftAction, recordInvoiceAction, voidInvoiceAction } from "./actions";
import { vt } from "./copy";

/**
 * The action row on an invoice's page (lejar.ai texts): Record invoice / Delete for drafts, Void
 * with a reason and date for recorded invoices.
 */
export function InvoiceActions({ orgSlug, id, status, lang, today, invoiceDate }: { orgSlug: string; id: string; status: string; lang: Lang; today: string; invoiceDate: string }) {
  const t = (k: Parameters<typeof vt>[1], v?: Record<string, string | number>) => vt(lang, k, v);
  const router = useRouter();
  const [open, setOpen] = useState<"delete" | "void" | null>(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today < invoiceDate ? invoiceDate : today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const run = (what: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after: () => void) => {
    setBusy(what);
    setError(null);
    start(async () => {
      const r = await fn();
      setBusy(null);
      if (r.ok) after();
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && (
          <>
            <Button variant="primary" disabled={pending} onClick={() => run("record", () => recordInvoiceAction(orgSlug, id), () => router.refresh())}>
              {busy === "record" ? t("invoices.post.recording") : t("invoices.post.button")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(open === "delete" ? null : "delete")}>
              {t("invoices.delete.button")}
            </Button>
          </>
        )}
        {status === "open" && (
          <Button variant="secondary" disabled={pending} onClick={() => setOpen(open === "void" ? null : "void")}>
            {t("invoices.void.button")}
          </Button>
        )}
      </div>
      {open === "delete" && (
        <div className="card flex flex-col gap-3 px-4 py-3">
          <p className="m-0 text-[13px] text-ink-2">{t("invoices.delete.confirmText")}</p>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={pending} onClick={() => run("delete", () => deleteInvoiceDraftAction(orgSlug, id), () => router.push(`/${orgSlug}/invoices?deleted=1`))}>
              {busy === "delete" ? t("invoices.delete.deleting") : t("invoices.delete.confirm")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
              {t("invoices.form.cancel")}
            </Button>
          </div>
        </div>
      )}
      {open === "void" && (
        <div className="card flex flex-col gap-3 px-4 py-3">
          <p className="m-0 text-[13px] text-ink-2">{t("invoices.void.recordedNote")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              {t("invoices.void.reason")}
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Void date
              <Input type="date" min={invoiceDate} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="danger" size="sm" disabled={pending} onClick={() => run("void", () => voidInvoiceAction(orgSlug, id, date, reason), () => { setOpen(null); router.refresh(); })}>
              {busy === "void" ? t("invoices.void.voiding") : t("invoices.void.confirm")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(null)}>
              {t("invoices.form.cancel")}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
