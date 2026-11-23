"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { Input } from "@/shared/ui/form-controls";
import { convertDoAction, doStepAction } from "./actions";
import { dot, type DoStatus } from "./copy";

const plus30 = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);

/**
 * lejar.ai's DO actions: open → Convert to invoice (number, date, due date +30 days), Edit, Void without
 * converting, Delete; converted whose invoice was voided → Reopen delivery order.
 */
export function DoActions(props: { slug: string; id: string; status: DoStatus; invoiceVoid: boolean; lang: Lang; today: string; nextInvoiceNumber: string }) {
  const t = (k: Parameters<typeof dot>[1], v?: Record<string, string | number>) => dot(props.lang, k, v);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ownNumber, setOwnNumber] = useState(false);
  const [invNumber, setInvNumber] = useState("");
  const [invDate, setInvDate] = useState(props.today);
  const [due, setDue] = useState(plus30(props.today));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const run = (step: "void" | "delete" | "reopen") =>
    start(async () => {
      setError(null);
      const r = await doStepAction(props.slug, props.id, step);
      if (!r.ok) return setError(r.error);
      if (step === "delete") router.push(`/${props.slug}/delivery-orders`);
      else router.refresh();
    });

  if (props.status === "converted" && props.invoiceVoid)
    return (
      <section className="card flex flex-col gap-2 p-4" data-testid="do-actions">
        <h2 className="text-[13.5px] font-semibold text-ink">{t("deliveryOrders.detail.reopenTitle")}</h2>
        <p className="text-[12.5px] text-muted">{t("deliveryOrders.detail.reopenText")}</p>
        <div>
          <Button size="sm" disabled={pending} onClick={() => run("reopen")}>
            {t("deliveryOrders.actions.reopen")}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-[12.5px] text-negative">
            {error}
          </p>
        )}
      </section>
    );
  if (props.status !== "open") return null;

  return (
    <div className="flex flex-col gap-4" data-testid="do-actions">
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-[13.5px] font-semibold text-ink">{t("deliveryOrders.detail.convertTitle")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            {t("deliveryOrders.actions.convert.invoiceNumber")}
            <Input value={ownNumber ? invNumber : props.nextInvoiceNumber} readOnly={!ownNumber} className={ownNumber ? "" : "bg-surface-2 text-muted"} onChange={(e) => setInvNumber(e.target.value)} />
            {!ownNumber && (
              <span className="text-[12.5px] font-normal text-muted">
                {props.lang === "ms" ? "Diberikan semasa disimpan." : "Assigned when saved."}{" "}
                <button type="button" className="text-ink underline underline-offset-2" onClick={() => setOwnNumber(true)}>
                  {props.lang === "ms" ? "Guna nombor saya sendiri" : "Use my own number"}
                </button>
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            {t("deliveryOrders.actions.convert.invoiceDate")}
            <Input type="date" required value={invDate} onChange={(e) => setInvDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            {t("deliveryOrders.actions.convert.dueDate")}
            <Input type="date" min={invDate} value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>
        <p className="text-[12.5px] text-muted">{t("deliveryOrders.actions.convert.hint")}</p>
        <div>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await convertDoAction(props.slug, props.id, { invoiceNumber: ownNumber ? invNumber : "", invoiceDate: invDate, dueDate: due });
                if (r.ok) router.push(`/${props.slug}/invoices/${r.data}`);
                else setError(r.error);
              })
            }
          >
            {pending ? t("deliveryOrders.actions.convert.converting") : t("deliveryOrders.actions.convert.submit")}
          </Button>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/${props.slug}/delivery-orders/${props.id}/edit`} className={buttonClass("secondary", "sm")}>
          {t("deliveryOrders.detail.edit")}
        </Link>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("void")}>
          {t("deliveryOrders.actions.voidWithoutConverting")}
        </Button>
        {confirmDelete ? (
          <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
            {t("deliveryOrders.actions.delete.confirmText")}
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t("deliveryOrders.actions.delete.cancel")}
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("delete")}>
              {pending ? t("deliveryOrders.actions.delete.deleting") : t("deliveryOrders.actions.delete.confirm")}
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
            {t("deliveryOrders.actions.delete")}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
