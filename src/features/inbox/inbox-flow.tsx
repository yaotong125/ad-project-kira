"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { Lang } from "@/shared/i18n";
import { Button, buttonClass } from "@/shared/ui/button";
import { cn } from "@/shared/ui/cn";
import { analyzeDraftAction, dismissDraftAction, removeWaitingDraftsAction, restoreDraftAction } from "./actions";
import { ACCEPT, MAX_FILES, failureText, it, type UploadFailure } from "./limits";
import { prepareFile, uploadInboxFiles } from "./upload-client";

export type DraftRow = {
  id: string;
  status: "analyzing" | "pending" | "confirmed" | "dismissed" | "failed" | "unsupported";
  draftType: string | null;
  aiSummary: string | null;
  originalName: string;
  confidence: number | null;
  error: string | null;
  documentDate: string | null;
  outOfPeriod: boolean;
  createdAt: string;
};

type FailedUpload = { id: string; file: File; reason: UploadFailure; note: string | null };

/** lejar.ai's row labels and chip tones (chunk 1yjjzu71g7hh9). */
const STATUS: Record<string, { tone: string; label: string }> = {
  pending: { tone: "chip ai", label: "Ready to review" },
  confirmed: { tone: "chip pos", label: "Recorded" },
  dismissed: { tone: "chip", label: "Dismissed" },
  failed: { tone: "chip neg", label: "Not drafted" },
  unsupported: { tone: "chip", label: "Not for the books" },
};
const DRAFT_TYPE: Record<string, string> = {
  bill: "Bill",
  invoice: "Sales invoice",
  journal: "Journal entry",
  payment: "Payment",
};

/** Where "Review" goes for each draft type (lejar.ai: bills / invoices / journal-entries ?aiDraft=). */
export function reviewHref(slug: string, d: Pick<DraftRow, "id" | "draftType">) {
  const path = d.draftType === "invoice" ? "invoices" : d.draftType === "journal" || d.draftType === "payment" ? "journal-entries" : "bills";
  return `/${slug}/${path}?aiDraft=${d.id}`;
}

const TH = "border-b border-border px-[var(--pad-x)] py-2 text-[11.5px] font-medium uppercase tracking-[0.04em] text-muted max-sm:text-[12.5px] pointer-coarse:text-[12.5px]";
const TD = "h-[var(--row-h)] border-b border-border px-[var(--pad-x)] align-middle";
const TR = "border-t border-border transition-colors hover:bg-surface-2";

function Table({ children, flow }: { children: ReactNode; flow?: string }) {
  return (
    <div className="relative overflow-x-auto rounded-[var(--radius-lg)] border border-border">
      <table className="w-full border-collapse text-[13px] max-sm:text-[14px] pointer-coarse:text-[14px]" data-flow={flow}>
        {children}
      </table>
    </div>
  );
}

function Empty({ justCleared }: { justCleared: boolean }) {
  return justCleared ? (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-brand-soft bg-brand-soft/30 py-12 text-center" role="status">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-brand">
        <path d="M4.5 12.5 L10 18 L19.5 6.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-sm font-medium text-ink">Inbox clear.</p>
      <p className="text-[13px] text-muted">Every document the AI drafted has been reviewed.</p>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-12 text-center">
      <p className="text-sm font-medium text-ink">Nothing to review</p>
      <div className="text-[13px] text-muted">Drop a document, photo or receipt above. The AI reads it and drafts the transaction for you to confirm.</div>
    </div>
  );
}

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  return f;
};

/** /{slug}/inbox: lejar.ai's InboxFlow, minus document splitting, bank statements, stock proposals and usage limits. */
export function InboxFlow({
  orgSlug,
  lang,
  canEdit,
  initialDrafts,
}: {
  orgSlug: string;
  lang: Lang;
  canEdit: boolean;
  initialDrafts: DraftRow[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [analyzing, setAnalyzing] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [madeSmaller, setMadeSmaller] = useState<Set<string>>(new Set());
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [justCleared, setJustCleared] = useState(false);
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const analyze = useCallback(
    async (id: string) => {
      if (inFlight.current.has(id)) return;
      inFlight.current.add(id);
      setAnalyzing(new Set(inFlight.current));
      let r;
      try {
        r = await analyzeDraftAction(form({ orgSlug, draftId: id }));
      } catch {
        setAlert("Could not reach the server to analyze this document. Check your connection and try again.");
        return;
      } finally {
        inFlight.current.delete(id);
        setAnalyzing(new Set(inFlight.current));
      }
      setAlert(null);
      if (!r.ok) {
        if (r.reason === "not_configured") setNotice(r.error);
        else setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, status: "failed", error: r.error } : d)));
        return;
      }
      setNotice(null);
      setDrafts((ds) => ds.map((d) => (d.id === id && d.status !== "dismissed" ? { ...d, ...r.draft } : d)));
    },
    [orgSlug],
  );

  /** Analyze several rows, three at a time (lejar.ai). */
  const analyzeMany = useCallback(
    async (ids: string[]) => {
      let next = 0;
      const worker = async () => {
        while (next < ids.length) await analyze(ids[next++]);
      };
      await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
    },
    [analyze],
  );

  const upload = useCallback(
    async (list: File[], noteText: string | null) => {
      if (list.length === 0) return;
      setUploadError(null);
      setUploading(true);
      const failures: FailedUpload[] = [];
      const fail = (file: File, reason: UploadFailure) => failures.push({ id: `upload-row-${++seq.current}`, file, reason, note: noteText });
      try {
        const ready: File[] = [];
        const compressed = new Set<string>();
        for (const file of list.slice(0, MAX_FILES)) {
          const p = await prepareFile(file);
          if (p.kind === "failed") fail(file, "compress_failed");
          else if (p.kind === "unreadable") fail(file, "image_unreadable");
          else if (p.kind === "ok" || p.kind === "compressed") {
            ready.push(p.file);
            if (p.kind === "compressed") compressed.add(p.file.name);
          }
        }
        if (list.length > MAX_FILES) setUploadError(it(lang, "chat.upload.tooMany", { max: MAX_FILES }));
        if (ready.length === 0) return;
        const r = await uploadInboxFiles(orgSlug, ready, noteText);
        if (!r.ok) {
          setUploadError(it(lang, "chat.upload.dropFailed"));
          ready.forEach((f) => fail(f, "network"));
          return;
        }
        r.failed.forEach((f) => fail(f.file, f.reason));
        if (r.created.length > 0) {
          setJustCleared(false);
          if (noteText) setNote((n) => (n.trim() === noteText ? "" : n));
          const now = new Date().toISOString();
          setDrafts((ds) => [
            ...ds,
            ...r.created.map((c) => ({
              id: c.draftId, status: "analyzing" as const, draftType: null, aiSummary: null, originalName: c.originalName,
              confidence: null, error: null, documentDate: null, outOfPeriod: false, createdAt: now,
            })),
          ]);
          setMadeSmaller((s) => new Set([...s, ...r.created.filter((c) => compressed.has(c.originalName)).map((c) => c.draftId)]));
        }
      } catch {
        list.forEach((f) => failures.some((x) => x.file === f) || fail(f, "network"));
      } finally {
        if (failures.length > 0) setFailedUploads((rows) => [...failures, ...rows]);
        setUploading(false);
      }
    },
    [orgSlug, lang],
  );

  const takeFiles = (files: FileList | File[]) => {
    const t = note.trim();
    void upload(Array.from(files), t.length > 0 ? t : null);
  };

  const dismiss = async (id: string) => {
    setBusyRow(id);
    try {
      const r = await dismissDraftAction(form({ orgSlug, draftId: id }));
      if (r.ok) {
        setAlert(null);
        setJustCleared(true);
        setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, status: "dismissed" } : d)));
      } else setAlert(r.error);
    } finally {
      setBusyRow(null);
    }
  };

  const removeWaiting = async (id: string) => {
    setBusyRow(id);
    try {
      const r = await removeWaitingDraftsAction(form({ orgSlug, draftId: [id] }));
      if (!r.ok) return setAlert(r.error);
      if (r.removed.length > 0) {
        setJustCleared(true);
        setDrafts((ds) => ds.map((d) => (r.removed.includes(d.id) ? { ...d, status: "dismissed" } : d)));
      }
      setAlert(r.skipped.length === 0 ? null : it(lang, r.skipped.length === 1 ? "inbox.waiting.skipped.one" : "inbox.waiting.skipped.other", { count: r.skipped.length }));
    } finally {
      setBusyRow(null);
    }
  };

  const restore = async (id: string) => {
    setBusyRow(id);
    try {
      const r = await restoreDraftAction(form({ orgSlug, draftId: id }));
      if (r.ok) {
        setAlert(null);
        router.refresh();
        setDrafts((ds) =>
          ds.map((d) =>
            d.id === id ? { ...d, status: d.draftType ? "pending" : d.error ? "failed" : "analyzing" } : d,
          ),
        );
      } else setAlert(r.error);
    } finally {
      setBusyRow(null);
    }
  };

  const live = drafts.filter((d) => d.status !== "dismissed").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const dismissed = drafts.filter((d) => d.status === "dismissed");
  const waiting = live.filter((d) => d.status === "analyzing" && !analyzing.has(d.id));

  return (
    <div className="flex flex-col gap-6">
      {canEdit && (
        <div
          data-flow="inbox-drop"
          className={cn("card p-6", dragging ? "border-ai bg-ai-soft/60" : "border-ai-soft bg-ai-soft/30")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!uploading) takeFiles(e.dataTransfer.files);
          }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-[14px] font-medium text-ink">Drop documents, photos or receipts here</p>
            <p className="text-[12.5px] text-muted">
              Images or PDFs, up to 10 MB each, 20 at a time. The AI reads each one and proposes a draft transaction you can review and record.
            </p>
            <textarea
              aria-label="Describe these documents (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={uploading}
              rows={2}
              maxLength={500}
              placeholder={'Optional: describe these documents to help the AI (e.g. "petrol for the company car", "deposit from a client")'}
              className="w-full max-w-sm resize-none rounded-[var(--radius)] border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition-[border-color,box-shadow] duration-100 placeholder:text-muted disabled:opacity-50 focus:border-ai focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ai)_18%,transparent)]"
            />
            <span className="inline-flex min-w-0 items-center gap-2.5">
              <input
                ref={picker}
                id="inbox-files"
                type="file"
                className="peer sr-only"
                multiple
                accept={ACCEPT}
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files) takeFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <label
                htmlFor="inbox-files"
                className={buttonClass(
                  "secondary",
                  "default",
                  "cursor-pointer peer-focus-visible:border-ai peer-focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-ai)_18%,transparent)] peer-disabled:opacity-50",
                )}
              >
                Choose files
              </label>
            </span>
            {uploading && <p className="text-[12px] text-muted">Uploading…</p>}
            {uploadError && <p className="text-[12px] text-negative">{uploadError}</p>}
          </div>
        </div>
      )}

      <section data-testid="upload-rows" aria-live="polite" aria-relevant="additions text">
        <h2 tabIndex={-1} className={failedUploads.length > 0 ? "mb-2 text-[13px] font-medium text-ink" : "sr-only"}>
          {it(lang, "inbox.uploadRows.heading")}
        </h2>
        {failedUploads.length > 0 && (
          <div className="card flex flex-col divide-y divide-border">
            {failedUploads.map((row) => (
              <div key={row.id} data-testid="upload-row" className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-ink">{row.file.name}</p>
                  <p className="text-[12px] text-negative">{failureText(lang, row.reason)}</p>
                </div>
                {row.reason === "network" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={uploading}
                    onClick={() => {
                      setFailedUploads((rows) => rows.filter((r) => r.id !== row.id));
                      void upload([row.file], row.note);
                    }}
                  >
                    {it(lang, "inbox.uploadRows.retry")}
                  </Button>
                )}
                {row.reason !== "exists_in_inbox" && row.reason !== "network" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={uploading}
                    onClick={() => {
                      setFailedUploads((rows) => rows.filter((r) => r.id !== row.id));
                      picker.current?.click();
                    }}
                  >
                    {it(lang, "inbox.uploadRows.chooseAnother")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={it(lang, "inbox.uploadRows.dismiss", { name: row.file.name })}
                  onClick={() => setFailedUploads((rows) => rows.filter((r) => r.id !== row.id))}
                >
                  {it(lang, "inbox.uploadRows.dismissLabel")}
                </Button>
              </div>
            ))}
            {failedUploads.length > 1 && (
              <div className="px-4 py-2">
                <Button variant="ghost" size="sm" onClick={() => setFailedUploads([])}>
                  {it(lang, "inbox.uploadRows.clearAll")}
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {waiting.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" data-testid="waiting-for-analyze" className="text-[13px] text-muted">
            {waiting.length === 1
              ? "1 document is uploaded and waiting. Tap Analyze on the row to read it."
              : `${waiting.length} documents are uploaded and waiting. Tap Analyze on a row, or Analyze all, to read them.`}{" "}
            Uploading alone costs nothing.
          </p>
          {waiting.length > 1 && canEdit && (
            <Button variant="ai" size="sm" onClick={() => void analyzeMany(waiting.map((d) => d.id))}>
              Analyze all
            </Button>
          )}
        </div>
      )}
      {notice && (
        <p role="status" data-testid="ai-credit-notice" className="text-[13px] text-negative">
          {notice}
        </p>
      )}
      {alert && (
        <span role="alert" className="text-[12px] text-negative">
          {alert}
        </span>
      )}

      {live.length === 0 ? (
        <div data-flow="inbox-queue">
          <Empty justCleared={justCleared} />
        </div>
      ) : (
        <Table flow="inbox-queue">
          <thead className="bg-surface">
            <tr className={TR}>
              <th className={cn(TH, "text-left")}>Status</th>
              <th className={cn(TH, "text-left")}>Document</th>
              <th className={cn(TH, "text-left")}>Suggested</th>
              <th className={cn(TH, "text-right")}>Confidence</th>
              <th className={cn(TH, "text-left")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {live.map((d) => {
              const busy = analyzing.has(d.id);
              const ready = d.status === "analyzing" && !busy;
              const status = ready ? { tone: "chip ai", label: "Ready to analyze" } : (STATUS[d.status] ?? { tone: "chip", label: d.status });
              const pending = d.status === "pending";
              const open = () => pending && router.push(reviewHref(orgSlug, d));
              return (
                <tr
                  key={d.id}
                  className={cn(TR, pending && "cursor-pointer")}
                  onClick={pending ? open : undefined}
                  tabIndex={pending ? 0 : undefined}
                  onKeyDown={
                    pending
                      ? (e) => {
                          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            open();
                          }
                        }
                      : undefined
                  }
                >
                  <td className={cn(TD, "text-left text-ink")}>
                    {busy ? (
                      <div role="status" aria-label="Analyzing" className="flex items-center gap-2 text-[12.5px] text-ai-ink">
                        <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-ai/30 border-t-ai" />
                        Analyzing
                      </div>
                    ) : (
                      <span className={status.tone}>{status.label}</span>
                    )}
                  </td>
                  <td className={cn(TD, "text-left text-ink-2")}>
                    <div className="flex flex-col gap-1 py-1.5">
                      <span>{d.aiSummary ?? d.originalName ?? "-"}</span>
                      {madeSmaller.has(d.id) && <span className="text-[12px] text-muted">{it(lang, "inbox.uploadRows.madeSmaller")}</span>}
                      {d.status === "failed" && d.error && <span className="text-[12px] text-negative">{d.error}</span>}
                      {d.status === "unsupported" && d.error && <span className="text-[12px] text-muted">{d.error}</span>}
                      {d.outOfPeriod && pending && (
                        <span>
                          <span className="chip warn">Outside your books{d.documentDate ? `, dated ${d.documentDate}` : ""}</span>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={cn(TD, "text-left text-ink")}>{d.draftType ? (DRAFT_TYPE[d.draftType] ?? d.draftType) : "-"}</td>
                  <td className={cn(TD, "num-sans num text-right text-ink-2")}>{d.confidence !== null ? `${Math.round(100 * d.confidence)}%` : ""}</td>
                  <td className={cn(TD, "text-left text-ink")} onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <div className="flex gap-2">
                        {ready && (
                          <Button variant="ai" size="sm" onClick={() => void analyze(d.id)}>
                            Analyze
                          </Button>
                        )}
                        {ready && (
                          <Button variant="secondary" size="sm" disabled={busyRow === d.id} aria-busy={busyRow === d.id} onClick={() => void removeWaiting(d.id)}>
                            {busyRow === d.id ? it(lang, "inbox.waiting.removing") : it(lang, "inbox.waiting.remove")}
                          </Button>
                        )}
                        {d.status === "failed" && !busy && (
                          <Button variant="ai" size="sm" onClick={() => void analyze(d.id)}>
                            Try again
                          </Button>
                        )}
                        {pending && (
                          <Link className={buttonClass("ai", "sm")} href={reviewHref(orgSlug, d)}>
                            {d.draftType === "payment" ? "Record as journal entry" : "Review"}
                          </Link>
                        )}
                        {(pending || d.status === "failed" || d.status === "unsupported") && (
                          <Button variant="ghost" size="sm" disabled={busyRow === d.id} onClick={() => void dismiss(d.id)}>
                            {busyRow === d.id ? "Dismissing…" : "Dismiss"}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      {dismissed.length > 0 && (
        <details className="card px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2">Dismissed ({dismissed.length})</summary>
          <p className="mt-1 text-[12px] text-muted">
            These were removed from the inbox. They are not recorded in your books. Restore one to send it back to the review queue.
          </p>
          <div className="mt-3">
            <Table>
              <thead className="bg-surface">
                <tr className={TR}>
                  <th className={cn(TH, "text-left")}>Document</th>
                  <th className={cn(TH, "text-left")}>Suggested</th>
                  <th className={cn(TH, "text-left")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dismissed.map((d) => (
                  <tr key={d.id} className={TR}>
                    <td className={cn(TD, "text-left text-ink-2")}>{d.aiSummary ?? d.originalName ?? "-"}</td>
                    <td className={cn(TD, "text-left text-ink")}>{d.draftType ? (DRAFT_TYPE[d.draftType] ?? d.draftType) : "-"}</td>
                    <td className={cn(TD, "text-left text-ink")}>
                      {canEdit && (
                        <Button variant="secondary" size="sm" disabled={busyRow === d.id} onClick={() => void restore(d.id)}>
                          {busyRow === d.id ? "Restoring…" : "Restore"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </details>
      )}
    </div>
  );
}
