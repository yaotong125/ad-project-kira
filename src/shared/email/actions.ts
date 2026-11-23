"use server";

import { revalidatePath } from "next/cache";
import { GET as getInvoicePdf } from "@/app/[org]/invoices/[id]/pdf/route";
import { GET as getQuickInvoicePdf } from "@/app/[org]/quick-invoices/[id]/pdf/route";
import { GET as getQuotePdf } from "@/app/[org]/quotes/[id]/pdf/route";
import { rm, toSen } from "@/features/books/money";
import { loadInvoice } from "@/features/invoices/load";
import { loadQuickInvoiceDetail } from "@/features/quick-invoices/load";
import { loadQuote } from "@/features/quotes/load";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { sendEmail } from "./mailer";
import { documentEmail } from "./templates";

export type EmailDocType = "invoice" | "quick_invoice" | "quote";

export async function sendDocumentEmailAction(
  orgSlug: string,
  input: { docType: EmailDocType; docId: string; toEmail: string; note?: string },
): Promise<{ ok: true; status: "sent" | "skipped"; message: string } | { ok: false; error: string }> {
  const to = input.toEmail.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: "Enter a valid customer email address." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const { data: org } = await supabase
    .from("organizations")
    .select("id, legal_name")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (!org) return { ok: false, error: "Organisation not found." };

  let docLabel = "Invoice";
  let docNumber = "";
  let customerName = "Customer";
  let amountDisplay = "RM 0.00";
  let dueDate: string | null = null;
  let pdfRes: Response;

  const dummyReq = new Request(`https://kira.local/${orgSlug}/pdf`);
  const params = Promise.resolve({ org: orgSlug, id: input.docId });

  if (input.docType === "invoice") {
    const inv = await loadInvoice(supabase, org.id, input.docId);
    if (!inv) return { ok: false, error: "Invoice not found." };
    docLabel = "Invoice";
    docNumber = inv.invoice_number;
    customerName = inv.contacts.name;
    amountDisplay = rm(toSen(String(inv.total)) ?? 0);
    dueDate = inv.due_date ?? null;
    pdfRes = await getInvoicePdf(dummyReq, { params });
  } else if (input.docType === "quick_invoice") {
    const qi = await loadQuickInvoiceDetail(supabase, org.id, input.docId);
    if (!qi) return { ok: false, error: "Quick invoice not found." };
    docLabel = "Invoice";
    docNumber = qi.invoiceNumber;
    customerName = qi.customerName;
    amountDisplay = rm(qi.totalSen);
    dueDate = qi.dueDate;
    pdfRes = await getQuickInvoicePdf(dummyReq, { params });
  } else {
    const q = await loadQuote(supabase, org.id, input.docId);
    if (!q) return { ok: false, error: "Quote not found." };
    docLabel = "Quote";
    docNumber = q.number;
    customerName = q.customer;
    amountDisplay = rm(q.total);
    dueDate = q.expires;
    pdfRes = await getQuotePdf(dummyReq, { params });
  }

  if (!pdfRes.ok) return { ok: false, error: "Could not generate the PDF attachment." };
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  const safeFilename = `${docNumber.replace(/[^A-Za-z0-9._-]+/g, "_") || input.docType}.pdf`;

  const tpl = documentEmail({
    orgName: org.legal_name,
    docLabel,
    docNumber,
    customerName,
    amountDisplay,
    dueDate,
    note: input.note,
  });

  const sent = await sendEmail({
    to,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    replyTo: user.email ?? undefined,
    attachments: [{ filename: safeFilename, content: pdfBuf }],
  });

  // Best-effort delivery log (ignores if migration hasn't been applied yet).
  await supabase
    .rpc("log_org_email", {
      p_slug: orgSlug,
      p_doc_type: input.docType,
      p_doc_id: input.docId,
      p_recipient_email: to,
      p_subject: tpl.subject,
      p_provider: "resend",
      p_provider_message_id: sent.status === "sent" ? sent.messageId : null,
      p_status: sent.status,
      p_error_message: sent.status === "failed" ? sent.error : sent.status === "skipped" ? sent.reason : null,
    })
    .then(
      () => {},
      () => {},
    );

  revalidatePath(`/${orgSlug}/settings/data`);

  if (sent.status === "failed") {
    return { ok: false, error: sent.error };
  }
  if (sent.status === "skipped") {
    return {
      ok: true,
      status: "skipped",
      message: `PDF ready (${safeFilename}), but RESEND_API_KEY is not set on this server yet. Add RESEND_API_KEY in .env.local to deliver emails automatically.`,
    };
  }
  return {
    ok: true,
    status: "sent",
    message: `Emailed ${safeFilename} to ${to}.`,
  };
}
