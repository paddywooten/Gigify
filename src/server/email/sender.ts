// Best-effort transactional email delivery.
//
// The in-app Notification row remains the durable source of truth; email is
// dispatched fire-and-forget and can never fail a user-facing action.
//
// Providers (EMAIL_PROVIDER):
//   console (default) — appends JSONL to logs/outbox/emails.jsonl for local dev
//   resend            — POST https://api.resend.com/emails (RESEND_API_KEY)
//   off               — explicitly disabled

import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailSendOutcome = { queued: boolean; reason?: string };

export interface EmailSender {
  readonly name: string;
  send(msg: EmailMessage): Promise<EmailSendOutcome>;
}

/** Dev/test sender: writes every email to a local JSONL outbox. */
export class ConsoleEmailSender implements EmailSender {
  readonly name = "console";
  private outboxPath: string;

  constructor(outboxPath = process.env.EMAIL_OUTBOX_PATH ?? "logs/outbox/emails.jsonl") {
    this.outboxPath = outboxPath;
  }

  async send(msg: EmailMessage): Promise<EmailSendOutcome> {
    try {
      mkdirSync(path.dirname(this.outboxPath), { recursive: true });
      appendFileSync(
        this.outboxPath,
        `${JSON.stringify({ at: new Date().toISOString(), ...msg })}\n`,
      );
      console.info(`[email] to=${msg.to} subject="${msg.subject}" → ${this.outboxPath}`);
      return { queued: true };
    } catch (err) {
      return { queued: false, reason: err instanceof Error ? err.message : "outbox write failed" };
    }
  }
}

/** Resend (https://resend.com) REST sender — used once RESEND_API_KEY exists. */
export class ResendSender implements EmailSender {
  readonly name = "resend";

  constructor(
    private cfg: {
      apiKey?: string;
      from?: string;
      fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
    },
  ) {}

  async send(msg: EmailMessage): Promise<EmailSendOutcome> {
    if (!this.cfg.apiKey) return { queued: false, reason: "RESEND_API_KEY is not set." };
    try {
      const res = await (this.cfg.fetchFn ?? fetch)("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.cfg.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: this.cfg.from ?? "Gigify <onboarding@resend.dev>",
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) detail += `: ${body.message}`;
        } catch {
          /* non-JSON error body */
        }
        return { queued: false, reason: detail };
      }
      return { queued: true };
    } catch (err) {
      return { queued: false, reason: err instanceof Error ? err.message : "network error" };
    }
  }
}

const DisabledSender: EmailSender = {
  name: "off",
  send: async () => ({ queued: false, reason: "email disabled (EMAIL_PROVIDER=off)" }),
};

export function getEmailSender(): EmailSender {
  const which = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  switch (which) {
    case "off":
    case "none":
      return DisabledSender;
    case "resend":
      return new ResendSender({
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.EMAIL_FROM,
      });
    case "console":
      return new ConsoleEmailSender();
    default:
      throw new Error(`Unknown EMAIL_PROVIDER "${process.env.EMAIL_PROVIDER}". Use "console", "resend" or "off".`);
  }
}

/** Fire-and-forget dispatch: logs failures, never throws, never blocks. */
export function deliverEmail(msg: EmailMessage): void {
  void (async () => {
    try {
      const outcome = await getEmailSender().send(msg);
      if (!outcome.queued) console.warn(`[email] not queued: ${outcome.reason ?? "unknown reason"}`);
    } catch (err) {
      console.error("[email] delivery failed:", err instanceof Error ? err.message : err);
    }
  })();
}
