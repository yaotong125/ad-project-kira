"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input, Select } from "@/shared/ui/form-controls";
import { recordNoteAction, voidNoteAction } from "./actions";
import { nt } from "./copy";
import type { NoteInvoice, NoteKind } from "./load";

/** "Record note" (lejar.ai's Record panel on a draft). */
export function RecordNoteButton({ slug, id, invoiceId, lang }: { slug: string; id: string; invoiceId: string; lang: Lang }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await recordNoteAction(slug, id, invoiceId);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {pending ? nt(lang, "notes.post.recording") : nt(lang, "notes.post.button")}
      </Button>
      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

/** lejar.ai's Void panel: reason, void date (recorded notes), Confirm void. */
export function VoidNoteControl(props: { slug: string; id: string; invoiceId: string; lang: Lang; recorded: boolean; noteDate: string; today: string }) {
  const t = (k: Parameters<typeof nt>[1], v?: Record<string, string | number>) => nt(props.lang, k, v);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(props.today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        {t("notes.void.button")}
      </Button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border p-3">
      <p className="text-[12.5px] text-ink-2">{props.recorded ? t("notes.void.postedNote") : t("notes.void.draftNote")}</p>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
        {t("notes.void.reason")}
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {props.recorded && (
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
          {props.lang === "ms" ? "Tarikh batal" : "Void date"}
          <Input type="date" min={props.noteDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("notes.void.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await voidNoteAction(props.slug, props.id, props.invoiceId, date, reason);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else setError(r.error);
            })
          }
        >
          {pending ? t("notes.void.voiding") : t("notes.void.confirm")}
        </Button>
      </div>
    </div>
  );
}

/** lejar.ai's "Issue a note" picker on /notes: original invoice, kind, Continue. */
export function NotePicker({ slug, lang, invoices }: { slug: string; lang: Lang; invoices: NoteInvoice[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [kind, setKind] = useState<NoteKind>("credit");
  const [error, setError] = useState<string | null>(null);
  const match = invoices.find((i) => i.number.toLowerCase() === text.trim().split(" ")[0]?.toLowerCase());
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!match) return setError(nt(lang, "notes.error.selectInvoice"));
        router.push(`/${slug}/notes/new?invoiceId=${match.id}&kind=${kind}`);
      }}
    >
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
        {nt(lang, "notes.picker.invoice")}
        <Input list="note-invoices" placeholder={nt(lang, "notes.picker.invoicePlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
        <datalist id="note-invoices">
          {invoices.map((i) => (
            <option key={i.id} value={`${i.number} · ${i.customer}`} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
        {nt(lang, "notes.picker.kind")}
        <Select value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
          <option value="credit">{nt(lang, "notes.kind.credit")}</option>
          <option value="debit">{nt(lang, "notes.kind.debit")}</option>
          <option value="refund">{nt(lang, "notes.kind.refund")}</option>
        </Select>
      </label>
      <Button type="submit">{nt(lang, "notes.picker.continue")}</Button>
      {error && (
        <p role="alert" className="text-[12.5px] text-negative sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
