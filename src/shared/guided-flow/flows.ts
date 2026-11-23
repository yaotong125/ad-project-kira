import type { FlowTextKey } from "./copy-data";

/**
 * lejar.ai's guided flows (module 963170, observed 2026-11-22). Each step points at an element
 * with `data-flow="{target}"` on a page under /{slug}. Learn's "Start" opens the section's flow.
 */
export type FlowStep = { key: string; target: string; page: string; titleKey: FlowTextKey; bodyKey: FlowTextKey };
export type Flow = { key: string; titleKey: FlowTextKey; steps: FlowStep[] };

const step = (key: string, page: string, titleKey: FlowTextKey, bodyKey: FlowTextKey, target = key): FlowStep => ({
  key,
  target: `[data-flow="${target}"]`,
  page,
  titleKey,
  bodyKey,
});

export const FLOWS: Flow[] = [
  {
    key: "ai-inbox",
    titleKey: "onboarding.flow.aiInbox.title",
    steps: [
      step("inbox-drop", "/inbox", "onboarding.flow.aiInbox.drop.title", "onboarding.flow.aiInbox.drop.body"),
      step("inbox-queue", "/inbox", "onboarding.flow.aiInbox.queue.title", "onboarding.flow.aiInbox.queue.body"),
      step("inbox-review", "/inbox", "onboarding.flow.aiInbox.review.title", "onboarding.flow.aiInbox.review.body", "inbox-queue"),
    ],
  },
  {
    key: "first-invoice",
    titleKey: "onboarding.flow.firstInvoice.title",
    steps: [
      step("invoice-customer", "/invoices", "onboarding.flow.firstInvoice.customer.title", "onboarding.flow.firstInvoice.customer.body"),
      step("invoice-lines", "/invoices", "onboarding.flow.firstInvoice.lines.title", "onboarding.flow.firstInvoice.lines.body"),
      step("invoice-actions", "/invoices", "onboarding.flow.firstInvoice.actions.title", "onboarding.flow.firstInvoice.actions.body"),
    ],
  },
  {
    key: "bank-import",
    titleKey: "onboarding.flow.bankImport.title",
    steps: [
      step("import-upload", "/import", "onboarding.flow.bankImport.upload.title", "onboarding.flow.bankImport.upload.body"),
      step("import-review", "/import", "onboarding.flow.bankImport.review.title", "onboarding.flow.bankImport.review.body"),
      step("import-approve", "/import", "onboarding.flow.bankImport.approve.title", "onboarding.flow.bankImport.approve.body"),
      step("reconcile-setup", "/reconcile", "onboarding.flow.bankImport.reconcile.title", "onboarding.flow.bankImport.reconcile.body"),
    ],
  },
  {
    key: "add-contact",
    titleKey: "onboarding.flow.addContact.title",
    steps: [
      step("contact-form", "/contacts", "onboarding.flow.addContact.form.title", "onboarding.flow.addContact.form.body"),
      step("contact-save", "/contacts", "onboarding.flow.addContact.save.title", "onboarding.flow.addContact.save.body", "contact-form"),
    ],
  },
  {
    key: "match-bank",
    titleKey: "onboarding.flow.matchBank.title",
    steps: [
      step("reconcile-setup", "/reconcile", "onboarding.flow.matchBank.setup.title", "onboarding.flow.matchBank.setup.body"),
      step("reconcile-lines", "/reconcile", "onboarding.flow.matchBank.lines.title", "onboarding.flow.matchBank.lines.body"),
    ],
  },
  {
    key: "ask-lejar",
    titleKey: "onboarding.flow.askLejar.title",
    steps: [step("ask-lejar", "/chat", "onboarding.flow.askLejar.ask.title", "onboarding.flow.askLejar.ask.body")],
  },
  {
    key: "read-pnl",
    titleKey: "onboarding.flow.readPnl.title",
    steps: [step("pnl-report", "/reports", "onboarding.flow.readPnl.report.title", "onboarding.flow.readPnl.report.body")],
  },
];

/** Learn section → flow (lejar.ai). */
export const SECTION_FLOW: Record<string, string> = {
  "receipt-to-bill": "ai-inbox",
  "add-contact": "add-contact",
  "send-invoice": "first-invoice",
  "import-bank": "bank-import",
  "match-bank": "match-bank",
  "ask-lejar": "ask-lejar",
  "read-pnl": "read-pnl",
};

export const flowByKey = (key: string) => FLOWS.find((f) => f.key === key) ?? null;
