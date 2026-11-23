"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Lang } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/form-controls";
import { deleteDraftBillAction, recordDraftBillAction, recordSnAction, voidBillAction, voidSnAction } from "./actions";
import { st } from "./copy";

/** "Record note" on a draft supplier note. */
export function RecordSnButton({ slug, id, billId, lang }: { slug: string; id: string; billId: string; lang: Lang }) {
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
            const r = await recordSnAction(slug, id, billId);
            if (r.ok) router.refresh();
            else setError(r.error);
          })
        }
      >
        {pending ? st(lang, "supplierNotes.post.recording") : st(lang, "supplierNotes.post.button")}
      </Button>
      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

/** Void panel shared by supplier notes and bills: reason, void date (recorded documents), Confirm void. */
export function VoidPanel(props: { lead: string; lang: Lang; askDate: boolean; minDate: string; today: string; onVoid: (on: string, reason: string) => Promise<{ ok: boolean; error?: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(props.today < props.minDate ? props.minDate : props.today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        {st(props.lang, "supplierNotes.void.button")}
      </Button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border p-3" data-testid="void-panel">
      <p className="text-[12.5px] text-ink-2">{props.lead}</p>
      <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
        {st(props.lang, "supplierNotes.void.reason")}
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {props.askDate && (
        <label className="flex flex-col gap-1 text-[12.5px] text-ink-2">
          {props.lang === "ms" ? "Tarikh batal" : "Void date"}
          <Input type="date" min={props.minDate} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      )}
      {error && (
        <p role="alert" className="text-[12.5px] text-negative">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {st(props.lang, "supplierNotes.void.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await props.onVoid(date, reason);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              } else setError(r.error ?? null);
            })
          }
        >
          {pending ? st(props.lang, "supplierNotes.void.voiding") : st(props.lang, "supplierNotes.void.confirm")}
        </Button>
      </div>
    </div>
  );
}

export function VoidSnControl(props: { slug: string; id: string; billId: string; lang: Lang; recorded: boolean; noteDate: string; today: string }) {
  return (
    <VoidPanel
      lang={props.lang}
      askDate={props.recorded}
      minDate={props.noteDate}
      today={props.today}
      lead={st(props.lang, props.recorded ? "supplierNotes.void.postedNote" : "supplierNotes.void.draftNote")}
      onVoid={(on, reason) => voidSnAction(props.slug, props.id, props.billId, on, reason)}
    />
  );
}

export function VoidBillControl(props: { slug: string; id: string; lang: Lang; billDate: string; today: string }) {
  return (
    <VoidPanel
      lang={props.lang}
      askDate
      minDate={props.billDate}
      today={props.today}
      lead={props.lang === "ms" ? "Membatalkan merekod pembalikan bil ini pada tarikh batal dan menyimpan rekodnya." : "Voiding records a reversal of this bill on the void date and keeps the record."}
      onVoid={(on, reason) => voidBillAction(props.slug, props.id, on, reason)}
    />
  );
}

/** Record or delete a draft bill (e.g. generated from a recurring bill template with auto-record off). */
export function DraftBillControls({ slug, id, lang }: { slug: string; id: string; lang: Lang }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ms = lang === "ms";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await recordDraftBillAction(slug, id);
              if (r.ok) router.refresh();
              else setError(r.error);
            })
          }
        >
          {pending ? (ms ? "Merekod..." : "Recording...") : ms ? "Rekod bil" : "Record bill"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await deleteDraftBillAction(slug, id);
              if (r.ok) router.push(`/${slug}/bills`);
              else setError(r.error);
            })
          }
        >
          {ms ? "Padam draf" : "Delete draft"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="m-0 text-[12.5px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
