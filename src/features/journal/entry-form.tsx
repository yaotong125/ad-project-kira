"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { AccountCombobox } from "@/features/books/account-combobox";
import type { AccountOption, SourcePreview } from "@/features/books/load";
import { fromSen, toSen } from "@/features/books/money";
import { SourceDocument } from "@/features/books/source-preview";
import { Button } from "@/shared/ui/button";
import { FormField, Input } from "@/shared/ui/form-controls";
import { postEntryAction } from "./actions";

export type EntryLine = { accountCode: string; debit: string; credit: string };
type Line = EntryLine & { key: number };

const COL_HEAD = "text-[11.5px] font-medium uppercase tracking-[0.06em] text-muted";

/**
 * lejar.ai's "Post a journal entry" form (chunk 0mw62597hoaq6), observed pre-filled from an AI Inbox
 * payment on 2026-11-22: date, reference (JV-YYYYMM-NNN), memo, debit/credit lines, a balance row,
 * and the source document beside it.
 */
export function EntryForm({
  orgSlug,
  accounts,
  suggestedReference,
  initial,
  draft,
}: {
  orgSlug: string;
  accounts: AccountOption[];
  suggestedReference: string;
  initial: { occurredOn: string; memo: string; lines: EntryLine[] };
  draft: { id: string; sourceDocumentId: string; source: SourcePreview | null } | null;
}) {
  const router = useRouter();
  const ids = useId();
  const [occurredOn, setOccurredOn] = useState(initial.occurredOn);
  const [reference, setReference] = useState(suggestedReference);
  const [referenceEdited, setReferenceEdited] = useState(false);
  const [memo, setMemo] = useState(initial.memo);
  const [seq, setSeq] = useState(initial.lines.length);
  const [lines, setLines] = useState<Line[]>(initial.lines.map((l, i) => ({ ...l, key: i })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dr = lines.reduce((s, l) => s + (toSen(l.debit) ?? 0), 0);
  const cr = lines.reduce((s, l) => s + (toSen(l.credit) ?? 0), 0);
  const balanced = dr === cr && dr > 0;
  const update = (key: number, patch: Partial<EntryLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = () => {
    setError(null);
    if (lines.some((l) => toSen(l.debit) === null || toSen(l.credit) === null)) return setError("Amounts must be numbers with up to 2 decimals.");
    if (lines.some((l) => (toSen(l.debit) ?? 0) > 0 && (toSen(l.credit) ?? 0) > 0)) return setError("A line posts either a debit or a credit, not both.");
    if (lines.some((l) => ((toSen(l.debit) ?? 0) > 0 || (toSen(l.credit) ?? 0) > 0) && !l.accountCode)) return setError("Pick an account from your chart for every line.");
    if (!balanced) return setError("The Debit and Credit columns have to add up to the same total.");
    start(async () => {
      const r = await postEntryAction({
        orgSlug,
        occurredOn,
        reference,
        referenceEdited,
        memo,
        aiDraftId: draft?.id ?? null,
        sourceDocumentId: draft?.sourceDocumentId ?? null,
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          debit: ((toSen(l.debit) ?? 0) / 100).toFixed(2),
          credit: ((toSen(l.credit) ?? 0) / 100).toFixed(2),
        })),
      });
      if (r.ok) router.push(`/${orgSlug}/journal-entries?posted=${encodeURIComponent(r.number)}`);
      else setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {draft && (
        <div className="rounded border border-ai-soft bg-ai-soft/40 px-3 py-2 text-[12.5px] text-ink-2">
          <span className="font-medium text-ink">Kira drafted this entry.</span> Review every line + account, then post it the normal way. Nothing is posted until you submit.
        </div>
      )}
      <div className={draft?.source ? "grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_20rem]" : "contents"}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[180px_180px_1fr]">
            <FormField label="Date" htmlFor={`${ids}-date`}>
              <Input type="date" required value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
            </FormField>
            <FormField label="Reference" htmlFor={`${ids}-ref`}>
              <Input
                type="text"
                placeholder="JV-..."
                value={reference}
                onChange={(e) => {
                  setReference(e.target.value);
                  setReferenceEdited(true);
                }}
              />
            </FormField>
            <FormField label="Memo" htmlFor={`${ids}-memo`}>
              <Input type="text" placeholder="e.g. October consulting invoice" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </FormField>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium text-ink-2">Lines</span>
            <p className="-mt-1 max-w-prose text-[12px] leading-[1.5] text-muted">
              Each line posts an amount to one account. The Debit and Credit columns have to add up to the same total before you can post.
            </p>
            <div className="hidden gap-2 md:grid md:grid-cols-12">
              <span className={`md:col-span-6 ${COL_HEAD}`}>Account</span>
              <span className={`text-right md:col-span-2 ${COL_HEAD}`}>Debit RM</span>
              <span className={`text-right md:col-span-2 ${COL_HEAD}`}>Credit RM</span>
              <span className="md:col-span-2" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-4 md:gap-2">
              {lines.map((l, i) => (
                <div key={l.key} className="grid grid-cols-2 gap-2 md:grid-cols-12 md:items-start">
                  <div className="col-span-2 md:col-span-6">
                    <AccountCombobox ariaLabel={`Line ${i + 1} account`} accounts={accounts} value={l.accountCode} onChange={(code) => update(l.key, { accountCode: code })} placeholder="Find account by code or name..." />
                  </div>
                  <div className="md:col-span-2">
                    <Input inputMode="decimal" placeholder="Debit 0.00" aria-label={`Line ${i + 1} debit RM`} className="text-right" value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <Input inputMode="decimal" placeholder="Credit 0.00" aria-label={`Line ${i + 1} credit RM`} className="text-right" value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value })} />
                  </div>
                  <div className="col-span-2 flex justify-end md:col-span-2 md:block md:text-right">
                    <Button variant="ghost" size="sm" disabled={lines.length <= 2} aria-label={`Remove line ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setLines((ls) => [...ls, { key: seq, accountCode: "", debit: "", credit: "" }]);
                  setSeq((s) => s + 1);
                }}
              >
                Add line
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-[13px] md:grid-cols-12 md:items-center">
              <span className="col-span-2 md:col-span-6">
                {balanced ? <span className="font-medium text-ink">Balanced</span> : <span className="font-medium text-negative">Off by {fromSen(Math.abs(dr - cr))}</span>}
              </span>
              <span className="num text-right font-medium text-ink md:col-span-2">{fromSen(dr)}</span>
              <span className="num text-right font-medium text-ink md:col-span-2">{fromSen(cr)}</span>
            </div>
          </div>
        </div>
        {draft?.source && (
          <aside className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-2">Source document</span>
            <div className="md:sticky md:top-4">
              <SourceDocument source={draft.source} label="Source document" />
            </div>
          </aside>
        )}
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      )}
      <div>
        <Button variant="primary" disabled={pending} onClick={submit}>
          {pending ? "Posting..." : "Post entry"}
        </Button>
      </div>
    </div>
  );
}
