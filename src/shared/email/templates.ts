function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapHtml(title: string, innerHtml: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f5f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#223358;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #eaedf2;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:20px 24px;border-bottom:1px solid #eaedf2;">
          <strong style="font-size:16px;color:#223358;letter-spacing:-0.02em;">Kira</strong>
          <span style="font-size:12px;color:#5f6f96;margin-left:8px;">${esc(title)}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;font-size:14px;line-height:1.6;color:#32497f;">
          ${innerHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:14px 24px;background:#f5f6f9;font-size:12px;color:#5f6f96;">
          Sent via Kira · Accounting for Malaysian companies
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function teamInviteEmail(p: {
  orgName: string;
  inviterEmail: string;
  roleLabel: string;
  inviteUrl: string;
}) {
  const subject = `You're invited to join ${p.orgName} on Kira`;
  const html = wrapHtml(
    "Team invitation",
    `<h1 style="margin:0 0 12px;font-size:18px;color:#223358;">Join ${esc(p.orgName)}</h1>
     <p style="margin:0 0 14px;"><strong>${esc(p.inviterEmail)}</strong> invited you to access <strong>${esc(p.orgName)}</strong> as <strong>${esc(p.roleLabel)}</strong>.</p>
     <p style="margin:20px 0;">
       <a href="${esc(p.inviteUrl)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#00d3c7;color:#223358;font-weight:600;text-decoration:none;">Accept invitation</a>
     </p>
     <p style="margin:0;font-size:12.5px;color:#5f6f96;">Or copy this link into your browser:<br /><a href="${esc(p.inviteUrl)}" style="color:#00a69c;">${esc(p.inviteUrl)}</a></p>`,
  );
  const text = `${p.inviterEmail} invited you to join ${p.orgName} on Kira as ${p.roleLabel}.\n\nAccept invitation: ${p.inviteUrl}`;
  return { subject, html, text };
}

export function documentEmail(p: {
  orgName: string;
  docLabel: string;
  docNumber: string;
  customerName: string;
  amountDisplay: string;
  dueDate: string | null;
  note?: string;
}) {
  const subject = `${p.docLabel} ${p.docNumber} from ${p.orgName}`;
  const noteBlock = p.note?.trim()
    ? `<p style="margin:14px 0;padding:12px 14px;border-radius:8px;background:#f5f6f9;color:#223358;white-space:pre-line;">${esc(p.note.trim())}</p>`
    : "";
  const dueRow = p.dueDate
    ? `<tr><td style="padding:4px 0;color:#5f6f96;">Due / valid until</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#223358;">${esc(p.dueDate)}</td></tr>`
    : "";

  const html = wrapHtml(
    `${p.docLabel} ${p.docNumber}`,
    `<p style="margin:0 0 12px;">Hi ${esc(p.customerName)},</p>
     <p style="margin:0 0 14px;">Please find attached <strong>${esc(p.docLabel)} ${esc(p.docNumber)}</strong> from <strong>${esc(p.orgName)}</strong>.</p>
     <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0;border-top:1px solid #eaedf2;border-bottom:1px solid #eaedf2;padding:8px 0;font-size:13.5px;">
       <tr><td style="padding:4px 0;color:#5f6f96;">Document</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#223358;">${esc(p.docNumber)}</td></tr>
       <tr><td style="padding:4px 0;color:#5f6f96;">Total</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#223358;">${esc(p.amountDisplay)}</td></tr>
       ${dueRow}
     </table>
     ${noteBlock}
     <p style="margin:14px 0 0;font-size:13px;color:#5f6f96;">The PDF is attached to this email.</p>`,
  );

  const text = [
    `Hi ${p.customerName},`,
    "",
    `Please find attached ${p.docLabel} ${p.docNumber} from ${p.orgName}.`,
    `Total: ${p.amountDisplay}`,
    p.dueDate ? `Due / valid until: ${p.dueDate}` : "",
    p.note?.trim() ? `\n${p.note.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
