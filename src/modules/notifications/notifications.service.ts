import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ApiError } from "@/middleware/errorHandler";
import { getPushProvider, type PushProvider } from "./push.provider";

export const NOTIFICATION_TYPES = [
  "BUSINESS_VERIFICATION",
  "PROPERTY_VERIFICATION",
  "SUBSCRIPTION",
  "SYSTEM",
  "ADMIN",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationFilter = "all" | "read" | "unread";

const NOTIFICATION_SELECT = {
  id: true,
  title: true,
  message: true,
  type: true,
  readStatus: true,
  createdAt: true,
} as const;

function assertNotificationType(type: string): asserts type is NotificationType {
  if (!(NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    throw new ApiError(500, "INVALID_NOTIFICATION_TYPE", `Unknown notification type: ${type}`);
  }
}

/**
 * Internal helper — writes a notification row for a user. PUSH is NOT sent
 * here (see notifyUser); module 5/7 call this for the DB record first.
 */
export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
) {
  assertNotificationType(type);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  return prisma.notification.create({
    data: { userId, title, message, type },
    select: NOTIFICATION_SELECT,
  });
}

/** The owning user's notifications — newest first, with an unread tally. */
export async function listNotifications(
  userId: string,
  page: number,
  pageSize: number,
  filter: NotificationFilter = "all",
) {
  const where: Record<string, unknown> = { userId };
  if (filter === "read") where.readStatus = true;
  if (filter === "unread") where.readStatus = false;

  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readStatus: false } }),
  ]);
  return { items, total, unread, page, pageSize };
}

/**
 * Marks ONE notification read — owner-only. A foreign or missing id returns
 * the identical 404 (no existence leak). Idempotent: re-reading an already
 * read notification still succeeds.
 */
export async function markNotificationRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true },
  });
  if (!notification || notification.userId !== userId) {
    throw new ApiError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  }
  return prisma.notification.update({
    where: { id: notificationId },
    data: { readStatus: true },
    select: NOTIFICATION_SELECT,
  });
}

/** Marks every unread notification of the caller as read. */
export async function markAllNotificationsRead(userId: string) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readStatus: false },
    data: { readStatus: true },
  });
  return { updatedCount: count };
}

/** Registers a device token for push — upserted on the (userId, fcmToken) key. */
export async function registerDeviceToken(
  userId: string,
  fcmToken: string,
  platform: "ANDROID" | "IOS" | "WEB",
) {
  return prisma.deviceToken.upsert({
    where: { userId_fcmToken: { userId, fcmToken } },
    update: { platform },
    create: { userId, fcmToken, platform },
    select: { id: true, fcmToken: true, platform: true, createdAt: true },
  });
}

/** Removes a device token belonging to the caller. */
export async function removeDeviceToken(userId: string, fcmToken: string) {
  const { count } = await prisma.deviceToken.deleteMany({ where: { userId, fcmToken } });
  if (count === 0) {
    throw new ApiError(404, "DEVICE_TOKEN_NOT_FOUND", "Device token not found");
  }
}

/**
 * Invalid-token removal helper. Today the console provider never reports
 * invalidity, so detection is stubbed to return []. When an FCM-backed
 * provider is wired, detect the expired tokens (e.g. 200-issued-token
 * error codes) and prune them from the SDK cache + database.
 */
export async function detectInvalidDeviceTokens(): Promise<string[]> {
  return [];
}

/** Deletes exactly the listed invalid tokens (scoped to the user). */
export async function removeInvalidTokens(userId: string, invalidTokens: string[]) {
  if (invalidTokens.length === 0) return { removed: 0 };
  const { count } = await prisma.deviceToken.deleteMany({
    where: { userId, fcmToken: { in: invalidTokens } },
  });
  return { removed: count };
}

/**
 * Combined sweep: detect invalid tokens (stubbed today) and prune them for a
 * user. Returns how many were removed. Reused by the admin layer later.
 */
export async function pruneInvalidDeviceTokens(userId: string) {
  const invalid = await detectInvalidDeviceTokens();
  return removeInvalidTokens(userId, invalid);
}

/** Best-effort push sweep to the caller's devices; failures are returned. */
export async function sendDevicePush(
  userId: string,
  notification: { title: string; message: string; type: string },
  data?: Record<string, unknown>,
  provider: PushProvider = getPushProvider(),
) {
  const tokens = await prisma.deviceToken.findMany({
    where: { userId },
    select: { fcmToken: true },
  });
  if (tokens.length === 0) return { sent: 0, failed: [] };

  const failed: string[] = [];
  let sent = 0;
  for (const { fcmToken } of tokens) {
    const result = await provider.send({
      token: fcmToken,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      data,
    });
    if (result.success) sent += 1;
    else failed.push(fcmToken);
  }
  return { sent, failed };
}

/**
 * Combined helper for modules 5/7: persists the notification record FIRST,
 * then best-effort dispatches pushes. A push failure never fails the event —
 * the in-app notification row is the source of truth and has already been saved.
 */
export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
  data?: Record<string, unknown>,
  provider: PushProvider = getPushProvider(),
) {
  const created = await createNotification(userId, title, message, type);
  try {
    await sendDevicePush(userId, created, data, provider);
  } catch (err) {
    logger.warn(`push dispatch failed for user ${userId} (in-app notification saved)`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return created;
}