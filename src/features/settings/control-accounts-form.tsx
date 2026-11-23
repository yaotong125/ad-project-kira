"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import { Button } from "@/shared/ui/button";
import { saveControlAccountsAction } from "./control-accounts-actions";

export type ControlOption = { id: string; code: string; name: string; type: string; isCash: boolean };
type Key = "ap" | "ar" | "nonTradeAr" | "nonTradeAp";

const FIELDS: { key: Key; id: string; label: string; hint: string; side: "asset" | "liability"; required: boolean }[] = [
  { key: "ap", id: "apAccountId", label: "Accounts Payable control account", hint: "Liability or contra-liability. Posted bills credit this account.", side: "liability", required: true },
  { key: "ar", id: "arAccountId", label: "Accounts Receivable control account", hint: "Asset or contra-asset. Posted invoices debit this account.", side: "asset", required: true },
  {
    key: "nonTradeAr",
    id: "nonTradeArAccountId",
    label: "Non-trade Accounts Receivable",
    hint: "Asset or contra-asset. Invoices for a non-trade customer debit this account (e.g. director loans, advances). Required before posting to a non-trade customer.",
    side: "asset",
    required: false,
  },
  {
    key: "nonTradeAp",
    id: "nonTradeApAccountId",
    label: "Non-trade Accounts Payable",
    hint: "Liability or contra-liability. Bills from a non-trade supplier credit this account.",
    side: "liability",
    required: false,
  },
];

/** lejar.ai's control accounts form: account pickers with the rule under each, owner-only Save. */
export function ControlAccountsForm({ slug, accounts, initial, canEdit }: { slug: string; accounts: ControlOption[]; initial: Record<Key, string>; canEdit: boolean }) {
  const router = useRouter();
  const [codes, setCodes] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [, start] = useTransition();
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const options = (side: "asset" | "liability") => accounts.filter((a) => !a.isCash && (a.type === side || a.type === `contra_${side}`));
  const idOf = (code: string) => byCode.get(code)?.id ?? "";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          setPending(true);
          void (async () => {
            const r = await saveControlAccountsAction(slug, {
              apAccountId: idOf(codes.ap),
              arAccountId: idOf(codes.ar),
              nonTradeArAccountId: idOf(codes.nonTradeAr),
              nonTradeApAccountId: idOf(codes.nonTradeAp),
            });
            setPending(false);
            setMsg(r.ok ? { ok: true, text: "Control accounts saved." } : { ok: false, text: r.error });
            if (r.ok) start(() => router.refresh());
          })();
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className="flex flex-col gap-1.5">
              <label htmlFor={f.id} className="text-[13px] font-medium text-ink-2">
                {f.label}
                {f.required && (
                  <span className="ml-0.5 text-negative" aria-hidden="true">
                    *
                  </span>
                )}
              </label>
              {canEdit ? (
                <AccountCombobox id={f.id} accounts={options(f.side)} value={codes[f.key]} onChange={(c) => setCodes((s) => ({ ...s, [f.key]: c }))} placeholder="Find an account..." />
              ) : (
                <p className="text-[13px] text-ink">{byCode.get(codes[f.key]) ? `${codes[f.key]} · ${byCode.get(codes[f.key])!.name}` : "Not set"}</p>
              )}
              <p className="text-[13px] text-muted">{f.hint}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3">
          <span className="text-[12px] text-muted">Owner-only. Changes apply immediately.</span>
          <span role="status" className={msg ? (msg.ok ? "text-[12.5px] text-ink-2" : "text-[12.5px] text-negative") : "sr-only"}>
            {msg?.text}
          </span>
          {canEdit && (
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
