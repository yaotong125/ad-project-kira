import "server-only";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
};

export type SendEmailResult =
  | { status: "sent"; messageId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; error: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function configuredFromAddress(): string {
  return process.env.RESEND_FROM?.trim() || "Kira <onboarding@resend.dev>";
}

/**
 * Sends a transactional email via Resend's REST API (zero extra npm dependencies).
 * When RESEND_API_KEY is unset, returns `{ status: "skipped" }` cleanly so callers can show a clear fallback.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { status: "skipped", reason: "RESEND_API_KEY is not configured." };
  }

  const to = input.to.trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { status: "failed", error: "Enter a valid recipient email address." };
  }

  try {
    const body: Record<string, unknown> = {
      from: configuredFromAddress(),
      to: [to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    };
    if (input.replyTo?.trim()) body.reply_to = input.replyTo.trim();
    if (input.attachments?.length) {
      body.attachments = input.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      }));
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; error?: { message?: string } };
    if (!res.ok) {
      const msg = json.message || json.error?.message || `Resend returned HTTP ${res.status}`;
      return { status: "failed", error: msg };
    }
    return { status: "sent", messageId: json.id ?? "" };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Network error sending email.",
    };
  }
}
