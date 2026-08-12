import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const adminRefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const adminCreateSchema = z.object({
  email: z.string().email(),
  tempPassword: z.string().min(8),
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "VERIFICATION_ADMIN", "CONTENT_ADMIN", "FINANCE_ADMIN"]),
});

export const adminUpdateSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ADMIN", "VERIFICATION_ADMIN", "CONTENT_ADMIN", "FINANCE_ADMIN"]).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["ACTIVE", "DEACTIVATED", "DELETED"]).optional(),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "name", "mobile", "email"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const adminPropertiesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  verificationStatus: z.enum(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED", "ACTIVE", "INACTIVE"]).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "ownerName", "verificationStatus"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const adminDigipinsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "digipinNumber"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const adminBusinessesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  verificationStatus: z.enum(["PENDING", "UNDER_REVIEW", "VERIFIED", "REJECTED", "SUSPENDED"]).optional(),
  categoryId: z.string().optional(),
  city: z.string().optional(),
  sortBy: z.enum(["createdAt", "name", "verificationStatus"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const propertyVerificationSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().min(1).max(500).optional(),
}).refine((data) => data.action !== "REJECT" || data.reason, { message: "Reason required for REJECT" });

export const businessVerificationSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "SUSPEND"]),
  reason: z.string().min(1).max(500).optional(),
}).refine((data) => data.action === "APPROVE" || data.reason, { message: "Reason required for REJECT and SUSPEND" });

export const digipinStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const userStatusSchema = z.object({
  accountStatus: z.enum(["ACTIVE", "DEACTIVATED"]),
});

export const subscriptionPlanSchema = z.object({
  name: z.string().min(1).max(100),
  tier: z.enum(["FREE", "BASIC", "PREMIUM"]),
  price: z.number().nonnegative(),
  durationDays: z.number().int().positive(),
  features: z.record(z.unknown()).optional(),
  isActive: z.boolean().default(true),
});

export const subscriptionPlanUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  tier: z.enum(["FREE", "BASIC", "PREMIUM"]).optional(),
  price: z.number().nonnegative().optional(),
  durationDays: z.number().int().positive().optional(),
  features: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
}).strict().refine((data) => Object.keys(data).length > 0, { message: "At least one field required" });

export const adminSubscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
  planId: z.string().optional(),
  userId: z.string().optional(),
  sortBy: z.enum(["createdAt", "startDate", "endDate"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const adminTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(["PENDING", "SUCCESS", "FAILED", "REFUNDED"]).optional(),
  userId: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "amount", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const broadcastSendSchema = z.object({
  target: z.enum(["ALL", "USER", "SEGMENT"]),
  userId: z.string().optional(),
  segment: z.enum(["BUSINESS_OWNERS", "VERIFIED_USERS"]).optional(),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  type: z.enum(["BUSINESS_VERIFICATION", "PROPERTY_VERIFICATION", "SUBSCRIPTION", "SYSTEM", "ADMIN"]),
}).refine((data) => data.target !== "USER" || data.userId, { message: "userId required for USER target" })
  .refine((data) => data.target !== "SEGMENT" || data.segment, { message: "segment required for SEGMENT target" });

export const adminNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(["createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});