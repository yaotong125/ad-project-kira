"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { Input } from "@/shared/ui/form-controls";
import { convertQuoteAction, deleteQuoteAction, quoteStepAction } from "./actions";
import { qt, type QuoteStatus } from "./copy";

/**
 * The quote's actions by status (lejar.ai quotes.detail.*): draft → Edit, Send to customer, Delete;
 * sent → Edit, Mark accepted, Mark declined, Expire, Void; accepted → Convert to invoice, Edit, Void without
 * converting; declined / expired → Void.
 */
export function QuoteActions(props: { slug: string; id: string; status: QuoteStatus; lang: Lang; today: string; nextInvoiceNumber: string }) {
  const t = (k: Parameters<typeof qt>[1], v?: Record<string, string | number>) => qt(props.lang, k, v);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [invNumber, setInvNumber] = useState("");
  const [invDate, setInvDate] = useState(props.today);
  const [due, setDue] = useState("");
  const [pending, start] = useTransition();
  const base = `/${props.slug}/quotes/${props.id}`;
  const step = (to: "sent" | "accepted" | "declined" | "expired" | "void") =>
    start(async () => {
      setError(null);
      const r = await quoteStepAction(props.slug, props.id, to);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  const s = props.status;

  return (
    <div className="flex flex-col gap-4" data-testid="quote-actions">
      {s === "accepted" && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="text-[13.5px] font-semibold text-ink">{t("quotes.detail.convertTitle")}</h2>
          <p className="text-[12.5px] text-muted">{t("quotes.actions.convert.hint")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              {t("quotes.actions.convert.invoiceNumber")}
              <Input placeholder={props.nextInvoiceNumber} value={invNumber} onChange={(e) => setInvNumber(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              {t("quotes.actions.convert.invoiceDate")}
              <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              {t("quotes.actions.convert.dueDate")}
              <Input type="date" min={invDate} value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
          </div>
          <div>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await convertQuoteAction(props.slug, props.id, { invoiceNumber: invNumber, invoiceDate: invDate, dueDate: due });
                  if (r.ok) router.push(`/${props.slug}/invoices/${r.data}`);
                  else setError(r.error);
                })
              }
            >
              {pending ? t("quotes.actions.convert.converting") : t("quotes.actions.convert.submit")}
            </Button>
          </div>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(s === "draft" || s === "sent" || s === "accepted") && (
          <Link href={`${base}/edit`} className={buttonClass("secondary", "sm")}>
            {t("quotes.detail.edit")}
          </Link>
        )}
        {s === "draft" && (
          <Button size="sm" disabled={pending} onClick={() => step("sent")}>
            {t("quotes.detail.send")}
          </Button>
        )}
        {s === "sent" && (
          <>
            <Button size="sm" disabled={pending} onClick={() => step("accepted")}>
              {t("quotes.detail.accept")}
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => step("declined")}>
              {t("quotes.detail.decline")}
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => step("expired")}>
              {t("quotes.detail.expire")}
            </Button>
          </>
        )}
        {(s === "sent" || s === "declined" || s === "expired" || s === "accepted") && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => step("void")}>
            {s === "accepted" ? t("quotes.detail.voidWithoutConverting") : t("quotes.detail.void")}
          </Button>
        )}
        {s === "draft" &&
          (confirmDelete ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
              {t("quotes.actions.delete.confirmText")}
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                {t("quotes.actions.delete.cancel")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await deleteQuoteAction(props.slug, props.id);
                    if (r.ok) router.push(`/${props.slug}/quotes`);
                    else setError(r.error);
                  })
                }
              >
                {pending ? t("quotes.actions.delete.deleting") : t("quotes.actions.delete.confirm")}
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              {t("quotes.actions.delete")}
            </Button>
          ))}
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
