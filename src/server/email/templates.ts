// Email templates: a small branded HTML shell + the notification → email
// mapping. All dynamic content is HTML-escaped (notifications embed user text).

import type { EmailMessage } from "./sender";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const ACCENT = "#4f46e5";

export function renderEmailHtml(opts: {
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
}): string {
  const heading = escapeHtml(opts.heading);
  const paras = opts.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">${escapeHtml(p)}</p>`)
    .join("");
  const action = opts.action
    ? `<p style="margin:24px 0;text-align:center;">
        <a href="${escapeHtml(opts.action.url)}" style="background:${ACCENT};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block;">${escapeHtml(opts.action.label)}</a>
      </p>
      <p style="margin:0 0 16px;font-size:12px;color:#94a3b8;word-break:break-all;">${escapeHtml(opts.action.url)}</p>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
      <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${ACCENT};">Gigify <span style="font-weight:400;font-size:13px;color:#64748b;">· musicians × churches &amp; events</span></p>
        <h1 style="margin:0 0 16px;font-size:18px;line-height:1.4;color:#0f172a;">${heading}</h1>
        ${paras}
        ${action}
      </div>
      <p style="text-align:center;font-size:12px;color:#94a3b8;margin:16px 0 0;">
        You're receiving this because you have a Gigify account.
      </p>
    </div>
  </body>
</html>`;
}

function appUrl(link?: string): string | undefined {
  if (!link) return undefined;
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${link.startsWith("/") ? "" : "/"}${link}`;
}

/** Maps an in-app notification to its branded email. */
export function notificationEmail(
  recipient: { name: string; email: string },
  notification: { title: string; body: string; link?: string | null },
): EmailMessage {
  const url = appUrl(notification.link ?? undefined);
  const html = renderEmailHtml({
    heading: notification.title,
    paragraphs: [notification.body],
    ...(url ? { action: { label: "Open Gigify", url } } : {}),
  });
  const text = [
    notification.title,
    "",
    notification.body,
    ...(url ? ["", url] : []),
  ].join("\n");
  return {
    to: recipient.email,
    subject: `Gigify · ${notification.title}`,
    html,
    text,
  };
}
