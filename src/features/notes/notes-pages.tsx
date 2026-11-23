import { ArrowLeft, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { accountOptions, todayMY } from "@/features/books/load";
import { rm } from "@/features/books/money";
import { first, type SearchParams } from "@/shared/i18n";
import type { OrgContext } from "@/shared/org-context";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { PageHeader } from "@/shared/ui/page-header";
import { nt } from "./copy";
import { listNotes, loadNote, noteInvoices, type NoteKind, type NoteStatus } from "./load";
import { NotePicker, RecordNoteButton, VoidNoteControl } from "./note-controls";
import { NoteForm } from "./note-form";

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const STATUS_CHIP: Record<NoteStatus, string> = { draft: "chip", recorded: "chip pos", void: "chip neg" };
const statusLabel = (s: NoteStatus, ms: boolean) => ({ draft: ms ? "Draf" : "Draft", recorded: ms ? "Direkodkan" : "Recorded", void: ms ? "Batal" : "Void" })[s];
const kindKey = (k: NoteKind) => `notes.kind.${k}` as const;

/** /{slug}/notes: lejar.ai's Credit / debit notes list (observed 2026-11-23). */
export async function NotesListPage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const ms = lang === "ms";
  const canEdit = ctx.role !== "viewer";
  const open = first(sp.new) === "1";
  const [notes, invoices] = await Promise.all([listNotes(supabase, ctx.org.id), canEdit ? noteInvoices(supabase, ctx.org.id) : Promise.resolve([])]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={nt(lang, "notes.list.title")}
        sub={nt(lang, "notes.list.sub", { org: ctx.org.legal_name, count: notes.length, noun: nt(lang, notes.length === 1 ? "notes.list.countOne" : "notes.list.countMany") })}
        actions={
          canEdit && !open ? (
            <Link href={`${base}/notes?new=1`} className={buttonClass("primary")}>
              {nt(lang, "notes.list.newButton")}
            </Link>
          ) : null
        }
      />
      {!canEdit && <p className="text-[12.5px] text-muted">{nt(lang, "notes.list.readOnly")}</p>}
      {canEdit && open && (
        <section className="card flex flex-col gap-3 p-4" data-testid="note-picker">
          <div className="flex items-center justify-between">
            <h2 className="text-[13.5px] font-semibold text-ink">{nt(lang, "notes.list.issueTitle")}</h2>
            <Link href={`${base}/notes`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-ink">
              <X size={13} aria-hidden="true" /> {ms ? "Tutup" : "Close"}
            </Link>
          </div>
          {invoices.length === 0 ? <p className="text-[13px] text-muted">{nt(lang, "notes.list.noInvoices")}</p> : <NotePicker slug={ctx.org.slug} lang={lang} invoices={invoices} />}
        </section>
      )}
      {notes.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border px-4 py-10 text-center">
          <p className="text-[13.5px] font-medium text-ink">{nt(lang, "notes.list.emptyTitle")}</p>
          <p className="mt-1 text-[12.5px] text-muted">{nt(lang, canEdit ? "notes.list.emptyWrite" : "notes.list.emptyRead")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="notes-table">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.list.kind")}</th>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.list.number")}</th>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.list.date")}</th>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.list.invoice")}</th>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.list.status")}</th>
                <th className={cn(TH, "text-left")}>MyInvois</th>
                <th className={cn(TH, "text-right")}>{nt(lang, "notes.list.total")}</th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id} className="border-t border-border transition-colors hover:bg-surface-2">
                  <td className={cn(TD, "text-ink-2")}>{nt(lang, kindKey(n.kind))}</td>
                  <td className={TD}>
                    <Link href={`${base}/notes/${n.id}`} className="num font-medium text-ink underline-offset-2 hover:underline">
                      {n.number}
                    </Link>
                  </td>
                  <td className={cn(TD, "num text-ink-2")}>{n.date}</td>
                  <td className={TD}>
                    <Link href={`${base}/invoices/${n.invoiceId}`} className="num text-ink-2 underline-offset-2 hover:underline">
                      {n.invoiceNumber}
                    </Link>
                  </td>
                  <td className={TD}>
                    <span className={STATUS_CHIP[n.status]}>{statusLabel(n.status, ms)}</span>
                  </td>
                  <td className={cn(TD, "text-muted")}>{nt(lang, "notes.list.notSubmitted")}</td>
                  <td className={cn(TD, "num-sans text-right text-ink")}>{rm(n.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** /{slug}/notes/new?invoiceId=&kind=: lejar.ai's "Issue a note" against one invoice. */
export async function NewNotePage({ ctx, sp }: { ctx: OrgContext; sp: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const invoiceId = first(sp.invoiceId) ?? "";
  const kindParam = first(sp.kind);
  const kind: NoteKind = kindParam === "debit" || kindParam === "refund" ? kindParam : "credit";
  const [invoice] = /^[0-9a-f-]{36}$/.test(invoiceId) ? await noteInvoices(supabase, ctx.org.id, invoiceId) : [];
  if (!invoice || ctx.role === "viewer") notFound();
  const today = todayMY();
  const [accounts, ...numbers] = await Promise.all([
    accountOptions(supabase, ctx.org.id),
    ...(["credit", "debit", "refund"] as const).map((k) => supabase.rpc("next_note_number", { p_org: ctx.org.id, p_kind: k, p_on: today })),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/invoices/${invoice.id}`} className="inline-flex items-center gap-1 text-[12.5px] text-brand hover:underline">
          <ArrowLeft size={13} aria-hidden="true" />
          {nt(lang, "notes.new.back", { number: invoice.number })}
        </Link>
      </div>
      <PageHeader title={nt(lang, "notes.new.title")} sub={nt(lang, "notes.new.sub", { number: invoice.number })} />
      <NoteForm
        slug={ctx.org.slug}
        lang={lang}
        invoice={invoice}
        kind={kind}
        today={today < invoice.date ? invoice.date : today}
        accounts={accounts}
        banks={accounts.filter((a) => a.isCash)}
        nextNumbers={{ credit: (numbers[0].data as string) ?? "", debit: (numbers[1].data as string) ?? "", refund: (numbers[2].data as string) ?? "" }}
      />
    </div>
  );
}

/** /{slug}/notes/[id]: lejar.ai's note detail (observed on the demo company's CN / DN / RN, 2026-11-23). */
export async function NoteDetailPage({ ctx, id }: { ctx: OrgContext; id: string }) {
  const supabase = await createSupabaseServerClient();
  const base = `/${ctx.org.slug}`;
  const lang = ctx.lang;
  const ms = lang === "ms";
  const n = /^[0-9a-f-]{36}$/.test(id) ? await loadNote(supabase, ctx.org.id, id) : null;
  if (!n) notFound();
  const canEdit = ctx.role !== "viewer";
  const FIELD = "text-[12.5px] text-muted";
  const VALUE = "mt-0.5 text-[13px] text-ink";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`${base}/notes`} className="text-[12.5px] text-brand hover:underline">
          {nt(lang, "notes.detail.back")}
        </Link>
      </div>
      <div>
        <h1 className="m-0 flex flex-wrap items-center gap-2.5 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
          {nt(lang, kindKey(n.kind))} {n.number}
          <span className={STATUS_CHIP[n.status]} data-testid="note-status">
            {statusLabel(n.status, ms)}
          </span>
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {nt(lang, "notes.detail.against")}{" "}
          <Link href={`${base}/invoices/${n.invoiceId}`} className="text-brand hover:underline">
            {n.invoiceNumber}
          </Link>
        </p>
      </div>

      <div className="card flex flex-col gap-4 p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <div className={FIELD}>{nt(lang, "notes.detail.noteDate")}</div>
            <div className={cn(VALUE, "num")}>{n.date}</div>
          </div>
          <div>
            <div className={FIELD}>{nt(lang, "notes.detail.currency")}</div>
            <div className={VALUE}>MYR</div>
          </div>
          <div>
            <div className={FIELD}>{nt(lang, "notes.detail.total")}</div>
            <div className={cn(VALUE, "num")} data-testid="note-total">
              {rm(n.total)}
            </div>
          </div>
        </div>
        <div>
          <div className={FIELD}>{nt(lang, "notes.detail.reason")}</div>
          <div className={VALUE}>{n.reason}</div>
        </div>
        {n.bank && (
          <div>
            <div className={FIELD}>{nt(lang, "notes.detail.bankAccount")}</div>
            <div className={cn(VALUE, "num")}>{n.bank}</div>
          </div>
        )}
        {n.journalEntryId && (
          <div>
            <div className={FIELD}>{nt(lang, "notes.detail.journalEntry")}</div>
            <Link href={`${base}/ledger/entries/${n.journalEntryId}`} className="mt-0.5 inline-block text-[13px] text-brand hover:underline">
              {nt(lang, "notes.detail.viewEntry")}
            </Link>
          </div>
        )}
        {n.status === "void" && (
          <p className="text-[12.5px] text-muted">
            {ms ? "Dibatalkan pada" : "Voided on"} {n.voidedOn}: {n.voidReason}
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13.5px] font-semibold text-ink">{nt(lang, "notes.detail.lines")}</h2>
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full border-collapse text-[13px]" data-testid="note-lines">
            <thead className="bg-surface">
              <tr>
                <th className={cn(TH, "text-left")}>#</th>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.detail.description")}</th>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.detail.account")}</th>
                <th className={cn(TH, "text-left")}>{nt(lang, "notes.detail.tax")}</th>
                <th className={cn(TH, "text-right")}>{nt(lang, "notes.detail.amount")}</th>
                <th className={cn(TH, "text-right")}>{nt(lang, "notes.detail.tax")}</th>
              </tr>
            </thead>
            <tbody>
              {n.lines.map((l) => (
                <tr key={l.no} className="border-t border-border">
                  <td className={cn(TD, "text-ink-2")}>{l.no}</td>
                  <td className={cn(TD, "text-ink")}>{l.description}</td>
                  <td className={cn(TD, "num text-ink-2")}>{l.account}</td>
                  <td className={cn(TD, "text-ink-2")}>{nt(lang, `notes.tax.${l.taxCode as "none"}`)}</td>
                  <td className={cn(TD, "num text-right text-ink")}>{(l.amount / 100).toFixed(2)}</td>
                  <td className={cn(TD, "num text-right text-ink")}>{(l.tax / 100).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="text-[13.5px] font-semibold text-ink">MyInvois</h2>
          <span className="rounded-[var(--radius)] bg-surface-2 px-2.5 py-1 text-[12px] text-ink-2">{ms ? "Lejar sahaja" : "Ledger only"}</span>
          <p className="text-[12.5px] text-muted">
            {ms
              ? "e-Invois belum tersedia dalam Kira. Nota ini ialah dokumen perakaunan yang sah tetapi tidak dihantar kepada LHDN."
              : "e-Invois is not in Kira yet. This note is a valid accounting document but is not submitted to LHDN."}
          </p>
        </section>
        {canEdit && n.status !== "void" && (
          <section className="flex flex-col gap-2">
            {n.status === "draft" && (
              <>
                <h2 className="text-[13.5px] font-semibold text-ink">{nt(lang, "notes.detail.recordTitle")}</h2>
                <p className="text-[12.5px] text-muted">{nt(lang, "notes.detail.recordLead")}</p>
                <RecordNoteButton slug={ctx.org.slug} id={n.id} invoiceId={n.invoiceId} lang={lang} />
              </>
            )}
            <h2 className="text-[13.5px] font-semibold text-ink">{nt(lang, "notes.detail.voidTitle")}</h2>
            <VoidNoteControl slug={ctx.org.slug} id={n.id} invoiceId={n.invoiceId} lang={lang} recorded={n.status === "recorded"} noteDate={n.date} today={todayMY()} />
          </section>
        )}
      </div>
    </div>
  );
}
