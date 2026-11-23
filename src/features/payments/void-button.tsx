"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/form-controls";
import { voidPaymentAction, voidReceiptAction } from "./actions";
import { pt } from "./copy";

/** "Void" on a receipt / payment row: reason and date, then the entry is reversed (lejar.ai texts). */
export function VoidButton({ orgSlug, id, kind, lang, minDate, today }: { orgSlug: string; id: string; kind: "receipts" | "payments"; lang: Lang; minDate: string; today: string }) {
  const t = (k: string) => pt(lang, `${kind}.void.${k}` as Parameters<typeof pt>[1]);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today < minDate ? minDate : today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {t("button")}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input className="h-[30px] w-[180px]" aria-label={t("reasonAria")} placeholder={t("reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Input className="h-[30px] w-[150px]" type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Void date" />
        <Button
          size="sm"
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = kind === "receipts" ? await voidReceiptAction(orgSlug, id, date, reason) : await voidPaymentAction(orgSlug, id, date, reason);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
        >
          {pending ? t("voiding") : t("confirm")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
      {error && <span role="alert" className="text-[12px] text-negative">{error}</span>}
    </div>
  );
}
