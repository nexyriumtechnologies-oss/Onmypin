import { z } from "zod";
import {
  pageParamSchema,
  pageSizeParamSchema,
} from "@/modules/search/search.validation";

/** `filter` narrows the notification list to read / unread (default: all). */
export const notificationsListQuerySchema = z
  .object({
    filter: z.enum(["all", "read", "unread"]).default("all"),
    page: pageParamSchema,
    pageSize: pageSizeParamSchema,
  })
  .strict();

/** POST /api/notifications/device-token — body. */
export const registerDeviceTokenSchema = z
  .object({
    fcmToken: z.string().trim().min(1).max(512),
    platform: z.enum(["ANDROID", "IOS", "WEB"]),
  })
  .strict();

/** DELETE /api/notifications/device-token — fcmToken is passed as a query param. */
export const deviceTokenQuerySchema = z
  .object({
    fcmToken: z.string().trim().min(1).max(512),
  })
  .strict();