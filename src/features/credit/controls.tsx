"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import type { AccountOption } from "@/features/books/load";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/form-controls";
import { applyCreditAction, recordPrepaymentAction, undoCreditAction } from "./actions";
import { ct } from "./copy";

const LABEL = "flex flex-col gap-1.5 text-[13px] font-medium text-ink-2";

/** lejar.ai's "Receive a prepayment" on a customer (contacts.prepay.*). */
export function PrepaymentForm({ slug, lang, contactId, banks, today }: { slug: string; lang: Lang; contactId: string; banks: AccountOption[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today);
  const [bank, setBank] = useState(banks[0]?.code ?? "");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (banks.length === 0) return <p className="text-[12.5px] text-muted">{ct(lang, "contacts.prepay.noBank")}</p>;
  if (!open)
    return (
      <div className="flex flex-col items-start gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          {ct(lang, "contacts.prepay.open")}
        </Button>
        {msg?.ok && (
          <p role="status" className="text-[12.5px] text-ink-2">
            {msg.text}
          </p>
        )}
      </div>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border p-3"
      data-testid="prepayment-form"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await recordPrepaymentAction(slug, { contactId, date, bankAccountCode: bank, amount, reference });
          if (r.ok) {
            setOpen(false);
            setAmount("");
            setReference("");
            setMsg({ ok: true, text: ct(lang, "contacts.prepay.done") });
            router.refresh();
          } else setMsg({ ok: false, text: r.error });
        });
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className={LABEL}>
          {ct(lang, "contacts.prepay.date")}
          <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className={LABEL}>
          {ct(lang, "contacts.prepay.receivedInto")}
          <AccountCombobox ariaLabel="Received into" accounts={banks} value={bank} onChange={setBank} placeholder="Find a cash or bank account..." />
        </div>
        <label className={LABEL}>
          {ct(lang, "contacts.prepay.amount")}
          <Input inputMode="decimal" required placeholder="0.00" className="text-right" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className={LABEL}>
          {ct(lang, "contacts.prepay.reference")}
          <Input placeholder={ct(lang, "contacts.prepay.optional")} value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>
      <p className="text-[12px] text-muted">{ct(lang, "contacts.prepay.sstNote")}</p>
      {msg && !msg.ok && (
        <p role="alert" className="text-[12.5px] text-negative">
          {msg.text}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {ct(lang, "contacts.prepay.cancel")}
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? ct(lang, "contacts.prepay.recording") : ct(lang, "contacts.prepay.submit")}
        </Button>
      </div>
    </form>
  );
}

/** "Apply credit ({amount} available)" on an open invoice. */
export function ApplyCreditButton({ slug, invoiceId, label, today }: { slug: string; invoiceId: string; label: string; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        data-testid="apply-credit"
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await applyCreditAction(slug, invoiceId, today);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {label}
      </Button>
      {error && (
        <p role="alert" className="text-[12px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

/** Undo one credit application (dated today). */
export function UndoCreditButton({ slug, moveId, lang, today }: { slug: string; moveId: string; lang: Lang; today: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await undoCreditAction(slug, moveId, today);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {lang === "ms" ? "Batalkan" : "Undo"}
      </Button>
      {error && (
        <span role="alert" className="text-[12px] text-negative">
          {error}
        </span>
      )}
    </span>
  );
}
