"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { fromSen, toSen } from "@/features/books/money";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { Input, Select } from "@/shared/ui/form-controls";
import { recordPaymentAction, recordReceiptAction } from "./actions";
import { ct as creditText } from "@/features/credit/copy";
import { pt } from "./copy";

export type OpenDoc = { id: string; number: string; partyId: string; party: string; date: string; dueDate: string | null; due: number };
type Account = { code: string; name: string };

const plain = (sen: number) => (sen / 100).toFixed(2);

/**
 * lejar.ai's "Record a receipt" / "Record a payment" forms (observed texts, chunks 1hl7z1604qdt4 /
 * 3p44g4fs486ds): account received into / paid from (or paid personally by an owner), date, reference,
 * an amount per open invoice / bill, bank charges, and the total into / out of the bank. A receipt is for
 * one customer; MYR only in this slice.
 */
export function SettleForm({
  mode,
  orgSlug,
  lang,
  cash,
  ownerAccounts,
  docs,
  today,
  preselect,
}: {
  mode: "receipt" | "payment";
  orgSlug: string;
  lang: Lang;
  cash: Account[];
  ownerAccounts: Account[];
  docs: OpenDoc[];
  today: string;
  preselect: string | null;
}) {
  const t = (k: Parameters<typeof pt>[1], v?: Record<string, string | number>) => pt(lang, k, v);
  const router = useRouter();
  const R = mode === "receipt";
  const pre = docs.find((d) => d.id === preselect);
  const parties = useMemo(() => [...new Map(docs.map((d) => [d.partyId, d.party])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [docs]);
  const [party, setParty] = useState(pre?.partyId ?? (R && parties.length === 1 ? parties[0][0] : ""));
  const [account, setAccount] = useState(cash.find((a) => a.code === "300-0900")?.code ?? cash[0]?.code ?? "");
  const [byOwner, setByOwner] = useState(false);
  const [owner, setOwner] = useState(ownerAccounts.find((a) => a.code === "400-0400")?.code ?? ownerAccounts[0]?.code ?? "");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [charges, setCharges] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>(pre ? { [pre.id]: plain(pre.due) } : {});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = R ? docs.filter((d) => d.partyId === party) : docs;
  const total = shown.reduce((s, d) => s + Math.max(0, toSen(amounts[d.id] ?? "") ?? 0), 0);
  const chargeSen = toSen(charges) ?? 0;
  const extra = R ? shown.reduce((s, d) => s + Math.max(0, (toSen(amounts[d.id] ?? "") ?? 0) - d.due), 0) : 0;
  const bank = R ? total - chargeSen : total + chargeSen;

  if (cash.length === 0) return <p className="text-[13px] text-muted">{R ? t("receipts.form.noCash") : t("payments.form.noBank")}</p>;
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="m-0 text-[13px] text-muted">{R ? t("receipts.form.noOpen") : t("payments.form.noOpen")}</p>
        <Link href={`/${orgSlug}/${R ? "invoices?new=1" : "bills?new=1"}`} className={buttonClass("secondary", "sm")}>
          {R ? t("receipts.form.raiseInvoice") : t("payments.form.recordBill")}
        </Link>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    const allocations = shown.filter((d) => (toSen(amounts[d.id] ?? "") ?? 0) > 0).map((d) => ({ id: d.id, amount: plain(toSen(amounts[d.id])!) }));
    if (allocations.length === 0) return setError(t("payments.error.noAllocation"));
    // Receipts: anything above what an invoice owes is kept as customer credit (lejar.ai receipts.form.extraCredit).
    const bad = R ? undefined : shown.find((d) => (toSen(amounts[d.id] ?? "") ?? 0) > d.due);
    if (bad) return setError(`${bad.number}: the amount is more than it still owes (RM${fromSen(bad.due)}).`);
    if (R && chargeSen >= total) return setError(t("receipts.form.chargesTooHigh"));
    start(async () => {
      const r = R
        ? await recordReceiptAction(orgSlug, { receiptDate: date, bankAccountCode: account, reference, bankCharges: plain(chargeSen), allocations })
        : await recordPaymentAction(orgSlug, { paymentDate: date, paidFromCode: byOwner ? owner : account, paidByOwner: byOwner, reference, bankCharges: plain(chargeSen), allocations });
      if (r.ok) router.push(`/${orgSlug}/${R ? "payments-received" : "payments-made"}?recorded=1${R && extra > 0 ? `&credit=${plain(extra)}` : ""}`);
      else setError(r.error);
    });
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13.5px] font-semibold text-ink">{R ? t("receipts.list.record") : t("payments.list.record")}</h2>
        <Link href={`/${orgSlug}/${R ? "payments-received" : "payments-made"}`} className={buttonClass("ghost", "sm")}>
          <X size={13} aria-hidden="true" />
          {R ? t("receipts.void.cancel") : t("payments.void.cancel")}
        </Link>
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {R && (
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              Customer
              <Select value={party} onChange={(e) => { setParty(e.target.value); setAmounts({}); }}>
                <option value="">Pick the customer…</option>
                {parties.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {!byOwner && (
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              {R ? t("receipts.form.receivedInto") : t("payments.form.paidFrom")}
              <Select value={account} onChange={(e) => setAccount(e.target.value)}>
                {cash.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {byOwner && (
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
              {t("payments.form.ownerAccount")}
              <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
                {ownerAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            {R ? t("receipts.form.receiptDate") : t("payments.form.paymentDate")}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            {R ? t("receipts.form.reference") : t("payments.form.reference")}
            <Input placeholder={R ? t("receipts.form.referencePlaceholder") : t("payments.form.referencePlaceholder")} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} />
          </label>
        </div>
        {!R && (
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={byOwner} onChange={(e) => setByOwner(e.target.checked)} />
            {t("payments.form.paidByOwner")}
          </label>
        )}
        {!R && byOwner && (
          <p className="-mt-2 text-[12.5px] text-muted">{ownerAccounts.find((a) => a.code === owner)?.code.startsWith("1") ? t("payments.form.ownerHint.equity") : t("payments.form.ownerHint.liability")}</p>
        )}

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink-2">
            {R ? t("receipts.form.allocate") : t("payments.form.allocate")} <span className="font-normal text-muted">{R ? t("receipts.form.toInvoices") : t("payments.form.toBills")}</span>
          </span>
          {R && !party ? (
            <p className="rounded-[var(--radius)] border border-dashed border-border px-3 py-2 text-[12.5px] text-muted">Pick the customer to see their open invoices.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  {shown.map((d) => {
                    const v = amounts[d.id] ?? "";
                    const s = toSen(v) ?? 0;
                    return (
                      <tr key={d.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">
                          <div className="num text-ink">{d.number}</div>
                          <div className="text-[11.5px] text-muted">
                            {!R && `${d.party} · `}
                            {d.date}
                            {d.dueDate ? ` · due ${d.dueDate}` : ""}
                          </div>
                        </td>
                        <td className="num-sans px-3 py-2 text-right text-ink-2">{t(R ? "receipts.form.due" : "payments.form.due", { amount: `RM${fromSen(d.due)}` })}</td>
                        <td className="w-[220px] px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <Input
                              inputMode="decimal"
                              className={cn("text-right", !R && s > d.due && "border-negative")}
                              aria-label={t(R ? "receipts.form.aria.amount" : "payments.form.aria.amount", { label: d.number })}
                              placeholder="0.00"
                              value={v}
                              onChange={(e) => setAmounts((a) => ({ ...a, [d.id]: e.target.value }))}
                            />
                            <Button size="sm" variant="ghost" onClick={() => setAmounts((a) => ({ ...a, [d.id]: plain(d.due) }))}>
                              Full
                            </Button>
                          </div>
                          {!R && s > 0 && s < d.due && <p className="m-0 mt-1 text-[11.5px] text-muted">{t("payments.form.short", { amount: fromSen(d.due - s) })}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            {R ? t("receipts.form.bankCharges") : t("payments.form.bankCharges")}
            <Input className="w-[180px] text-right" inputMode="decimal" placeholder="0.00" value={charges} onChange={(e) => setCharges(e.target.value)} />
            <span className="text-[12px] font-normal text-muted">{R ? t("receipts.form.bankChargesHint") : t("payments.form.bankChargesHint")}</span>
          </label>
          <dl className="m-0 grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-[13px]">
            <dt className="text-muted">{R ? "Received from the customer" : "Paid to suppliers"}</dt>
            <dd className="num-sans m-0 text-right text-ink">RM{fromSen(total)}</dd>
            <dt className="font-medium text-ink">{byOwner ? "Owed to / put in by the owner" : R ? "Into bank" : "Out of bank"}</dt>
            <dd className="num-sans m-0 text-right font-semibold text-ink">RM{fromSen(bank)}</dd>
          </dl>
        </div>
        {extra > 0 && (
          <p className="text-[12.5px] text-ink-2" data-testid="extra-credit">
            {creditText(lang, "receipts.form.extraCreditFor", { amount: fromSen(extra), name: shown[0]?.party ?? "" })} {t("receipts.form.sstNote")}
          </p>
        )}
        {error && <p role="alert" className="text-[13px] text-negative">{error}</p>}
        <div className="flex justify-end">
          <Button variant="primary" disabled={pending || total === 0} onClick={submit}>
            {pending ? (R ? t("receipts.form.recording") : t("payments.form.recording")) : R ? t("receipts.form.record") : t("payments.form.record")}
          </Button>
        </div>
      </div>
    </div>
  );
}
