// ─────────────────────────────────────────────────────────
// EndGit — Email Notification Service (Spacemail SMTP)
// ─────────────────────────────────────────────────────────

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mail.spacemail.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: true, // SSL
  auth: {
    user: process.env.SMTP_USER || "notifications@endgit.dev",
    pass: process.env.SMTP_PASS || "",
  },
});

const FROM_ADDRESS = process.env.SMTP_FROM || "EndGit <notifications@endgit.dev>";
const SITE_URL = process.env.SITE_URL || "https://endgit.dev";

/**
 * Send plugin rejection email to the author
 */
export async function sendRejectionEmail(opts: {
  to: string;
  authorUsername: string;
  pluginName: string;
  pluginSlug: string;
  version: string;
  submittedAt: string;
  reviewerUsername: string;
  reason: string;
}) {
  if (!process.env.SMTP_PASS) {
    console.warn("[Mailer] SMTP_PASS not configured — skipping rejection email");
    return;
  }

  const pluginUrl = `${SITE_URL}/plugins/${opts.pluginSlug}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: sans-serif; color: #333; line-height: 1.6;">
  <p>Dear <strong>@${opts.authorUsername}</strong>,</p>
  
  <p>I regret to inform you that your plugin "<strong>${opts.pluginName}</strong>" (v${opts.version} submitted on ${opts.submittedAt}) has been rejected.</p>
  
  <div style="margin: 20px 0;">
    ${formatReasonHtml(opts.reason)}
  </div>
  
  <p>Please resolve these issues and submit the plugin again.</p>
  
  <p><a href="${pluginUrl}">View Plugin Details</a></p>
  
  <hr style="border: none; border-top: 1px solid #ccc; margin-top: 30px;" />
  <p style="font-size: 12px; color: #666;">
    Reviewed by @${opts.reviewerUsername}<br>
    EndGit (${SITE_URL})
  </p>
</body>
</html>`;

  const text = `Dear @${opts.authorUsername},

I regret to inform you that your plugin "${opts.pluginName}" (v${opts.version} submitted on ${opts.submittedAt}) has been rejected.

${opts.reason}

Please resolve these issues and submit the plugin again.

View plugin: ${pluginUrl}

— Reviewed by @${opts.reviewerUsername}
EndGit (${SITE_URL})`;

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: `[EndGit] Your plugin "${opts.pluginName}" v${opts.version} has been rejected`,
      text,
      html,
    });
    console.log(`[Mailer] Rejection email sent to ${opts.to} for ${opts.pluginSlug}`);
  } catch (error) {
    console.error("[Mailer] Failed to send rejection email:", error);
  }
}

/**
 * Send plugin approval email to the author
 */
export async function sendApprovalEmail(opts: {
  to: string;
  authorUsername: string;
  pluginName: string;
  pluginSlug: string;
  version: string;
  reviewerUsername: string;
}) {
  if (!process.env.SMTP_PASS) {
    console.warn("[Mailer] SMTP_PASS not configured — skipping approval email");
    return;
  }

  const pluginUrl = `${SITE_URL}/plugins/${opts.pluginSlug}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: sans-serif; color: #333; line-height: 1.6;">
  <p>Dear <strong>@${opts.authorUsername}</strong>,</p>
  
  <p>Congratulations! Your plugin "<strong>${opts.pluginName}</strong>" v${opts.version} has been approved and is now live on the EndGit marketplace!</p>
  
  <p><a href="${pluginUrl}">View Your Plugin</a></p>
  
  <hr style="border: none; border-top: 1px solid #ccc; margin-top: 30px;" />
  <p style="font-size: 12px; color: #666;">
    Reviewed by @${opts.reviewerUsername}<br>
    EndGit (${SITE_URL})
  </p>
</body>
</html>`;

  const text = `Dear @${opts.authorUsername},

Congratulations! Your plugin "${opts.pluginName}" v${opts.version} has been approved and is now live on the EndGit marketplace!

View plugin: ${pluginUrl}

— Reviewed by @${opts.reviewerUsername}
EndGit (${SITE_URL})`;

  try {
    await transporter.sendMail({
      from: FROM_ADDRESS,
      to: opts.to,
      subject: `[EndGit] Your plugin "${opts.pluginName}" v${opts.version} has been approved! 🎉`,
      text,
      html,
    });
    console.log(`[Mailer] Approval email sent to ${opts.to} for ${opts.pluginSlug}`);
  } catch (error) {
    console.error("[Mailer] Failed to send approval email:", error);
  }
}

/**
 * Format reason text into HTML with basic markdown-like support
 * Converts lines starting with blockquote-style markers, bold markers, etc.
 */
function formatReasonHtml(reason: string): string {
  return reason
    .split("\n")
    .map(line => {
      // Blockquote lines (starting with >)
      if (line.trim().startsWith(">")) {
        const content = line.trim().slice(1).trim();
        return `<blockquote style="border-left: 3px solid #ccc; padding-left: 10px; margin-left: 0; color: #555;">${content}</blockquote>`;
      }
      // Bold (**text**)
      const boldified = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      return boldified;
    })
    .join("<br>");
}
