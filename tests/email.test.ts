// Email delivery: template escaping, notification → outbox dispatch,
// Resend payload shape, and the guarantee that email failures never throw.

import { existsSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { notify, notifyMany } from "@/server/services/notification-service";
import { notificationEmail, renderEmailHtml } from "@/server/email/templates";
import { ConsoleEmailSender, ResendSender, getEmailSender } from "@/server/email/sender";
import { registerUser, type TestUser } from "./helpers/app";

const ENV_KEYS = ["EMAIL_PROVIDER", "EMAIL_OUTBOX_PATH", "RESEND_API_KEY", "EMAIL_FROM", "APP_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};

const outbox = path.join(os.tmpdir(), `gigify-outbox-${process.pid}-${Date.now()}.jsonl`);
/** Lets the fire-and-forget dispatch chain finish (delivery is synchronous under the hood). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const readOutbox = (): Array<Record<string, string>> => {
  if (!existsSync(outbox)) return [];
  return readFileSync(outbox, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, string>);
};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.EMAIL_OUTBOX_PATH = outbox;
  process.env.EMAIL_PROVIDER = "console";
  delete process.env.APP_URL; // deterministic default link: http://localhost:3000
  rmSync(outbox, { force: true });
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(outbox, { force: true });
});

describe("email templates", () => {
  it("escapes HTML in headings, paragraphs and action URLs", () => {
    const html = renderEmailHtml({
      heading: `<script>alert("xss")</script> Heading`,
      paragraphs: [`body <img src=x onerror=alert(1)> & "quotes"`],
      action: { label: "Open <b>app</b>", url: "https://x.test/a?b=1&c=2" },
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("b=1&amp;c=2");
    expect(html).toContain("Gigify"); // brand shell
  });

  it("builds a notification email with subject branding and full action link", () => {
    const msg = notificationEmail(
      { name: "Maya", email: "maya@example.com" },
      { title: "Funds are secured in escrow 💰", body: "Payday coming.", link: "/bookings/bk1" },
    );
    expect(msg.to).toBe("maya@example.com");
    expect(msg.subject).toBe("Gigify · Funds are secured in escrow 💰");
    expect(msg.html).toContain("http://localhost:3000/bookings/bk1");
    expect(msg.text).toContain("Payday coming.");
  });
});

describe("notification dispatch", () => {
  it("writes one JSONL outbox entry per notification, addressed to the recipient", async () => {
    const user: TestUser = await registerUser("MUSICIAN");
    await flush();
    rmSync(outbox, { force: true }); // drop the registration WELCOME email

    await notify({
      userId: user.id,
      type: "WELCOME",
      title: "Welcome to Gigify",
      body: "Your musician profile is live.",
      link: "/dashboard",
    });
    await flush();

    const entries = readOutbox();
    expect(entries).toHaveLength(1);
    expect(entries[0].to).toBe(user.email);
    expect(entries[0].subject).toBe("Gigify · Welcome to Gigify");
    expect(entries[0].html).toContain("Your musician profile is live.");
    expect(entries[0].html).toContain("http://localhost:3000/dashboard");
  });

  it("notifyMany sends an email for each recipient", async () => {
    const a = await registerUser("CLIENT");
    const b = await registerUser("CLIENT");
    await flush();
    rmSync(outbox, { force: true }); // drop the registration WELCOME emails

    await notifyMany([
      { userId: a.id, type: "T", title: "For A", body: "Body A" },
      { userId: b.id, type: "T", title: "For B", body: "Body B" },
    ]);
    await flush();

    const entries = readOutbox();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.to).sort()).toEqual([a.email, b.email].sort());
  });

  it("an unknown EMAIL_PROVIDER never breaks notification creation", async () => {
    process.env.EMAIL_PROVIDER = "carrier-pigeon";
    const user = await registerUser("CLIENT");
    await expect(
      notify({ userId: user.id, type: "T", title: "Still works", body: "..." }),
    ).resolves.toBeUndefined();
    await flush();
    expect(readOutbox()).toHaveLength(0);
  });

  it("EMAIL_PROVIDER=off skips delivery entirely", async () => {
    process.env.EMAIL_PROVIDER = "off";
    const user = await registerUser("CLIENT");
    await notify({ userId: user.id, type: "T", title: "No send", body: "..." });
    await flush();
    expect(existsSync(outbox)).toBe(false);
  });
});

describe("senders", () => {
  const msg = { to: "a@example.com", subject: "S", html: "<p>h</p>", text: "h" };

  it("ConsoleEmailSender lands messages in the outbox file", async () => {
    const sender = new ConsoleEmailSender(outbox);
    const outcome = await sender.send(msg);
    expect(outcome.queued).toBe(true);
    expect(readOutbox()).toHaveLength(1);
  });

  it("ResendSender posts a well-formed payload", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const sender = new ResendSender({
      apiKey: "re_test_key",
      from: "Gigify <onboarding@resend.dev>",
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 200, json: async () => ({ id: "email_1" }) } as Response;
      },
    });

    const outcome = await sender.send(msg);
    expect(outcome.queued).toBe(true);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(calls[0].init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      from: "Gigify <onboarding@resend.dev>",
      to: ["a@example.com"],
      subject: "S",
      html: "<p>h</p>",
      text: "h",
    });
  });

  it("ResendSender reports failures without throwing", async () => {
    const failing = new ResendSender({
      apiKey: "re_bad",
      fetchFn: async () =>
        ({ ok: false, status: 401, json: async () => ({ message: "invalid api key" }) }) as Response,
    });
    const outcome = await failing.send(msg);
    expect(outcome.queued).toBe(false);
    expect(outcome.reason).toContain("401");
    expect(outcome.reason).toContain("invalid api key");

    const offline = new ResendSender({
      apiKey: "re_x",
      fetchFn: async () => {
        throw new Error("network down");
      },
    });
    const outcome2 = await offline.send(msg);
    expect(outcome2).toEqual({ queued: false, reason: "network down" });

    const noKey = new ResendSender({});
    expect((await noKey.send(msg)).queued).toBe(false);
  });

  it("getEmailSender resolves by env and defaults to console", () => {
    delete process.env.EMAIL_PROVIDER;
    expect(getEmailSender().name).toBe("console");
    process.env.EMAIL_PROVIDER = "resend";
    expect(getEmailSender().name).toBe("resend");
    process.env.EMAIL_PROVIDER = "off";
    expect(getEmailSender().name).toBe("off");
  });
});
