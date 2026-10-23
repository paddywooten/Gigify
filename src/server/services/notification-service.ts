// In-app notifications with best-effort email delivery alongside them (the
// notification record is the durable source of truth either way; email is
// dispatched fire-and-forget and can never fail the user action).

import { prisma } from "@/server/db";
import { deliverEmail } from "@/server/email/sender";
import { notificationEmail } from "@/server/email/templates";
import { toNotificationDTO } from "./serializers";
import type { NotificationDTO } from "@/lib/types";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
};

async function emailRecipients(userIds: string[]): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(userIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true, name: true, email: true },
  });
  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
}

function dispatchEmails(
  recipients: Map<string, { name: string; email: string }>,
  rows: Array<{ userId: string; title: string; body: string; link: string | null }>,
): void {
  for (const row of rows) {
    const recipient = recipients.get(row.userId);
    if (recipient?.email) deliverEmail(notificationEmail(recipient, row));
  }
}

export async function notify(input: NotifyInput): Promise<void> {
  const row = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    },
  });
  dispatchEmails(await emailRecipients([row.userId]), [row]);
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (inputs.length === 0) return;
  // Individual creates (not createMany) so each row is returned for emailing.
  const rows = await prisma.$transaction(inputs.map((data) => prisma.notification.create({ data })));
  dispatchEmails(await emailRecipients(rows.map((r) => r.userId)), rows);
}

export async function listNotifications(userId: string, limit = 30): Promise<NotificationDTO[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(toNotificationDTO);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

export async function notifyAdmins(input: Omit<NotifyInput, "userId">): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
  await notifyMany(admins.map((a) => ({ ...input, userId: a.id })));
}
