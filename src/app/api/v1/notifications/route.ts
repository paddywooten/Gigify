import { NextRequest } from "next/server";
import { handle, json } from "@/server/http";
import { requireUser } from "@/server/auth/session";
import { listNotifications, markAllNotificationsRead } from "@/server/services/notification-service";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const user = await requireUser(req);
  return json({ items: await listNotifications(user.id) });
});

/** PATCH: mark every notification as read. */
export const PATCH = handle(async (req: NextRequest) => {
  const user = await requireUser(req);
  await markAllNotificationsRead(user.id);
  return json({ ok: true });
});
