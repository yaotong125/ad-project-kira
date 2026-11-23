"use client";

import { Mail, X } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/form-controls";
import { sendDocumentEmailAction, type EmailDocType } from "./actions";

export function EmailDocumentButton({
  orgSlug,
  docType,
  docId,
  docNumber,
  defaultEmail = "",
}: {
  orgSlug: string;
  docType: EmailDocType;
  docId: string;
  docNumber: string;
  defaultEmail?: string;
}) {
  const [open, setOpen] = useState(false);
  const [toEmail, setToEmail] = useState(defaultEmail);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<{ kind: "sent" | "skipped" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => { setOpen(true); setStatus(null); }}>
        <Mail size={14} aria-hidden="true" />
        Email customer
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-doc-title"
        >
          <div className="w-full max-w-[440px] rounded-[var(--radius-xl)] border border-border bg-surface p-5 shadow-[var(--shadow-lg)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="email-doc-title" className="m-0 text-[15px] font-semibold text-ink">
                  Email {docNumber}
                </h2>
                <p className="m-0 mt-0.5 text-[12.5px] text-muted">
                  Sends the PDF as an attachment via Resend.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                setStatus(null);
                start(async () => {
                  const r = await sendDocumentEmailAction(orgSlug, {
                    docType,
                    docId,
                    toEmail,
                    note,
                  });
                  if (r.ok) {
                    setStatus({ kind: r.status, text: r.message });
                    if (r.status === "sent") setNote("");
                  } else {
                    setStatus({ kind: "error", text: r.error });
                  }
                });
              }}
            >
              <div className="flex flex-col gap-1">
                <label htmlFor="email-doc-to" className="text-[12.5px] font-medium text-ink-2">
                  Recipient email<span className="ml-0.5 text-negative">*</span>
                </label>
                <Input
                  id="email-doc-to"
                  type="email"
                  required
                  placeholder="billing@customer.com.my"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="email-doc-note" className="text-[12.5px] font-medium text-ink-2">
                  Message (optional)
                </label>
                <textarea
                  id="email-doc-note"
                  rows={3}
                  placeholder="Thank you for your business. Please let us know if you have any questions."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-[var(--radius)] border border-border-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-muted focus:border-ink"
                />
              </div>

              {status && (
                <p
                  role={status.kind === "error" ? "alert" : "status"}
                  data-testid="email-doc-status"
                  className={
                    status.kind === "sent"
                      ? "m-0 rounded border border-positive/30 bg-positive-soft px-3 py-2 text-[12.5px] text-positive"
                      : status.kind === "skipped"
                        ? "m-0 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-warning"
                        : "m-0 rounded border border-negative/30 bg-negative-soft px-3 py-2 text-[12.5px] text-negative"
                  }
                >
                  {status.text}
                </p>
              )}

              <div className="mt-1 flex items-center justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
                  Close
                </Button>
                <Button type="submit" size="sm" className="h-[32px]" disabled={pending}>
                  {pending ? "Sending..." : "Send PDF email"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
