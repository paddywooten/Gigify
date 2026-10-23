// In-app notifications (email delivery is a roadmap item; the notification
// record is the durable source of truth either way).

import { prisma } from "@/server/db";
import { toNotificationDTO } from "./serializers";
import type { NotificationDTO } from "@/lib/types";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  link?: string;
};

export async function notify(input: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
    },
  });
}

export async function notifyMany(inputs: NotifyInput[]): Promise<void> {
  if (inputs.length === 0) return;
  await prisma.notification.createMany({ data: inputs });
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
