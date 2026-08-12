import { prisma } from "@/lib/prisma";
import { ApiError } from "@/middleware/errorHandler";
import { recalculateTrustScore } from "@/modules/trust-score/trust-score.service";
import { notifyUser, type NotificationType } from "@/modules/notifications/notifications.service";
import { revokeAllUserSessions } from "@/modules/auth/session.service";
import { Prisma } from "@prisma/client";
import type { AccountStatus, VerificationStatus, BusinessVerificationStatus, SubscriptionStatus, TransactionStatus } from "@prisma/client";

// ---------------------------------------------------------------- Dashboard

export async function getAdminDashboardStats() {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    deactivatedUsers,
    newUsersThisWeek,
    newUsersThisMonth,
    totalDigipins,
    verifiedDigipins,
    pendingDigipins,
    totalBusinesses,
    verifiedBusinesses,
    pendingBusinesses,
    recentUsers,
    recentTransactions,
    recentBroadcasts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { accountStatus: "ACTIVE" } }),
    prisma.user.count({ where: { accountStatus: "DEACTIVATED" } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.digiPin.count(),
    prisma.digiPin.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.digiPin.count({ where: { verificationStatus: "SUBMITTED" } }),
    prisma.business.count(),
    prisma.business.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.business.count({ where: { verificationStatus: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.user.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, mobile: true, email: true, createdAt: true, accountStatus: true },
    }),
    prisma.transaction.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      select: { id: true, userId: true, amount: true, status: true, paymentReference: true, createdAt: true },
    }),
    prisma.broadcast.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      deactivated: deactivatedUsers,
      newThisWeek: newUsersThisWeek,
      newThisMonth: newUsersThisMonth,
    },
    digipins: {
      total: totalDigipins,
      verified: verifiedDigipins,
      pending: pendingDigipins,
    },
    businesses: {
      total: totalBusinesses,
      verified: verifiedBusinesses,
      pending: pendingBusinesses,
    },
    subscriptions: {
      activeCount: 0,
      allTimeRevenue: 0,
      thisMonthRevenue: 0,
    },
    recentActivity: {
      registrations: recentUsers,
      transactions: recentTransactions,
      broadcasts: recentBroadcasts,
    },
  };
}

// ---------------------------------------------------------------- Users

export async function listAdminUsers(query: {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const where: Prisma.UserWhereInput = {};
  if (query.status) {
    where.accountStatus = query.status as AccountStatus;
  }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { mobile: { contains: query.search } },
      { email: { contains: query.search } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      select: {
        id: true,
        name: true,
        mobile: true,
        email: true,
        profileImage: true,
        accountStatus: true,
        trustScore: true,
        trustScoreUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAdminUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      properties: {
        include: {
          digiPin: true,
        },
      },
      businesses: true,
      notifications: {
        take: 10,
        orderBy: { createdAt: "desc" },
      },
      subscriptions: {
        include: { plan: true },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  }

  const hasVerifiedProperty = user.properties.some((p) => p.verificationStatus === "VERIFIED");
  const hasVerifiedBusiness = user.businesses.some((b) => b.verificationStatus === "VERIFIED");

  const badges = [
    { code: "VERIFIED_INDIVIDUAL", name: "Verified Individual", active: hasVerifiedProperty, color: "green" },
    { code: "VERIFIED_BUSINESS", name: "Verified Business", active: hasVerifiedBusiness, color: "green" },
  ];

  return { ...user, badges };
}

export async function updateAdminUserStatus(userId: string, accountStatus: "ACTIVE" | "DEACTIVATED") {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new ApiError(404, "USER_NOT_FOUND", "User not found");
  }

  if (user.accountStatus === "DELETED") {
    throw new ApiError(400, "ACCOUNT_DELETED", "Cannot modify status of deleted user");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { accountStatus },
  });

  if (accountStatus === "DEACTIVATED") {
    await revokeAllUserSessions(userId);
  }

  return updated;
}

// ---------------------------------------------------------------- Properties & DigiPins

export async function listAdminProperties(query: {
  page?: number;
  pageSize?: number;
  verificationStatus?: string;
  city?: string;
  state?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const where: Prisma.PropertyWhereInput = {};
  if (query.verificationStatus) {
    where.verificationStatus = query.verificationStatus as VerificationStatus;
  }
  if (query.city) {
    where.city = { contains: query.city };
  }
  if (query.state) {
    where.state = { contains: query.state };
  }
  if (query.search) {
    where.OR = [
      { ownerName: { contains: query.search } },
      { address: { contains: query.search } },
      { digiPin: { digipinNumber: { contains: query.search } } },
    ];
  }

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        digiPin: true,
        user: {
          select: { id: true, name: true, mobile: true, email: true },
        },
      },
    }),
    prisma.property.count({ where }),
  ]);

  return { properties, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAdminPropertyDetail(propertyId: string) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      digiPin: {
        include: { qr: true },
      },
      user: {
        select: { id: true, name: true, mobile: true, email: true, profileImage: true },
      },
    },
  });

  if (!property) {
    throw new ApiError(404, "PROPERTY_NOT_FOUND", "Property not found");
  }

  const mediaFiles = await prisma.mediaFile.findMany({
    where: { userId: property.userId, purpose: { in: ["PROPERTY_IMAGE", "SELFIE"] } },
    orderBy: { createdAt: "desc" },
  });

  return { property, mediaFiles };
}

export async function verifyAdminProperty(
  propertyId: string,
  action: "APPROVE" | "REJECT",
  reason?: string,
) {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { digiPin: true },
  });

  if (!property) {
    throw new ApiError(404, "PROPERTY_NOT_FOUND", "Property not found");
  }

  if (action === "APPROVE" && property.verificationStatus === "VERIFIED") {
    throw new ApiError(400, "INVALID_STATUS_TRANSITION", "Property is already verified");
  }

  if (action === "REJECT" && !reason) {
    throw new ApiError(400, "REASON_REQUIRED", "Reason is required for rejection");
  }

  const newStatus = action === "APPROVE" ? "VERIFIED" : "REJECTED";

  const updatedProperty = await prisma.property.update({
    where: { id: propertyId },
    data: { verificationStatus: newStatus },
    include: { digiPin: true },
  });

  if (property.digiPin) {
    await prisma.digiPin.update({
      where: { id: property.digiPin.id },
      data: { verificationStatus: newStatus },
    });
  }

  await recalculateTrustScore(property.userId);

  const title = action === "APPROVE" ? "Property Verification Approved" : "Property Verification Rejected";
  const message =
    action === "APPROVE"
      ? `Your property address "${property.address ?? ""}" has been verified.`
      : `Your property verification request was rejected: ${reason}`;

  await notifyUser(property.userId, title, message, "PROPERTY_VERIFICATION");

  return updatedProperty;
}

export async function listAdminDigipins(query: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const where: Prisma.DigiPinWhereInput = {};
  if (query.search) {
    where.OR = [
      { digipinNumber: { contains: query.search } },
      { property: { ownerName: { contains: query.search } } },
      { property: { city: { contains: query.search } } },
      { property: { state: { contains: query.search } } },
    ];
  }

  const [digipins, total] = await Promise.all([
    prisma.digiPin.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        property: {
          select: { id: true, ownerName: true, address: true, city: true, state: true, userId: true },
        },
        qr: true,
      },
    }),
    prisma.digiPin.count({ where }),
  ]);

  return { digipins, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function updateAdminDigipinStatus(digipinId: string, status: "ACTIVE" | "INACTIVE") {
  const digipin = await prisma.digiPin.findUnique({ where: { id: digipinId } });
  if (!digipin) {
    throw new ApiError(404, "DIGIPIN_NOT_FOUND", "DigiPin not found");
  }

  const updated = await prisma.digiPin.update({
    where: { id: digipinId },
    data: { status },
  });

  return updated;
}

// ---------------------------------------------------------------- Businesses & Categories

export async function listAdminBusinesses(query: {
  page?: number;
  pageSize?: number;
  verificationStatus?: string;
  categoryId?: string;
  city?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const where: Prisma.BusinessWhereInput = {};
  if (query.verificationStatus) {
    where.verificationStatus = query.verificationStatus as BusinessVerificationStatus;
  }
  if (query.categoryId) {
    where.categoryId = query.categoryId;
  }
  if (query.city) {
    where.city = { contains: query.city };
  }

  const [businesses, total] = await Promise.all([
    prisma.business.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        category: true,
        subcategory: true,
        owner: {
          select: { id: true, name: true, mobile: true, email: true },
        },
      },
    }),
    prisma.business.count({ where }),
  ]);

  return { businesses, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getAdminBusinessDetail(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      category: true,
      subcategory: true,
      images: true,
      owner: {
        select: { id: true, name: true, mobile: true, email: true, profileImage: true },
      },
    },
  });

  if (!business) {
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }

  return business;
}

export async function verifyAdminBusiness(
  businessId: string,
  action: "APPROVE" | "REJECT" | "SUSPEND",
  reason?: string,
) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new ApiError(404, "BUSINESS_NOT_FOUND", "Business not found");
  }

  if (action === "APPROVE" && business.verificationStatus === "VERIFIED") {
    throw new ApiError(400, "INVALID_STATUS_TRANSITION", "Business is already verified");
  }

  if ((action === "REJECT" || action === "SUSPEND") && !reason) {
    throw new ApiError(400, "REASON_REQUIRED", `Reason is required for ${action.toLowerCase()}`);
  }

  const newStatus = action === "APPROVE" ? "VERIFIED" : action === "REJECT" ? "REJECTED" : "SUSPENDED";

  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { verificationStatus: newStatus },
  });

  await recalculateTrustScore(business.ownerUserId);

  const title = `Business Verification ${action.charAt(0) + action.slice(1).toLowerCase()}`;
  const message =
    action === "APPROVE"
      ? `Your business "${business.name}" has been verified.`
      : `Your business verification status was updated to ${newStatus}: ${reason}`;

  await notifyUser(business.ownerUserId, title, message, "BUSINESS_VERIFICATION");

  return updated;
}

export async function listAdminCategories() {
  const categories = await prisma.businessCategory.findMany({
    where: { parentId: null },
    include: {
      children: {
        orderBy: { order: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });
  return categories;
}

export async function createAdminCategory(data: { name: string; parentId?: string; order?: number }) {
  if (data.parentId) {
    const parent = await prisma.businessCategory.findUnique({ where: { id: data.parentId } });
    if (!parent) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Parent category not found");
  }

  const category = await prisma.businessCategory.create({
    data: {
      name: data.name,
      parentId: data.parentId ?? null,
      order: data.order ?? 0,
      isActive: true,
    },
  });
  return category;
}

export async function updateAdminCategory(
  id: string,
  data: { name?: string; order?: number; isActive?: boolean },
) {
  const category = await prisma.businessCategory.findUnique({ where: { id } });
  if (!category) throw new ApiError(404, "CATEGORY_NOT_FOUND", "Category not found");

  const updated = await prisma.businessCategory.update({
    where: { id },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.order != null && { order: data.order }),
      ...(data.isActive != null && { isActive: data.isActive }),
    },
  });
  return updated;
}

// ---------------------------------------------------------------- Subscription Plans & Transactions

export async function listAdminSubscriptionPlans() {
  return prisma.subscriptionPlan.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function createAdminSubscriptionPlan(data: {
  name: string;
  tier: "FREE" | "BASIC" | "PREMIUM";
  price: number;
  durationDays: number;
  features?: Record<string, unknown>;
  isActive?: boolean;
}) {
  return prisma.subscriptionPlan.create({
    data: {
      name: data.name,
      tier: data.tier,
      price: data.price,
      durationDays: data.durationDays,
      features: data.features != null ? (data.features as Prisma.InputJsonValue) : Prisma.JsonNull,
      isActive: data.isActive ?? true,
    },
  });
}

export async function updateAdminSubscriptionPlan(
  id: string,
  data: {
    name?: string;
    tier?: "FREE" | "BASIC" | "PREMIUM";
    price?: number;
    durationDays?: number;
    features?: Record<string, unknown>;
    isActive?: boolean;
  },
) {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id } });
  if (!plan) throw new ApiError(404, "PLAN_NOT_FOUND", "Subscription plan not found");

  return prisma.subscriptionPlan.update({
    where: { id },
    data: {
      ...(data.name != null && { name: data.name }),
      ...(data.tier != null && { tier: data.tier }),
      ...(data.price != null && { price: data.price }),
      ...(data.durationDays != null && { durationDays: data.durationDays }),
      ...(data.features != null && { features: data.features as Prisma.InputJsonValue }),
      ...(data.isActive != null && { isActive: data.isActive }),
    },
  });
}

export async function listAdminSubscriptions(query: {
  page?: number;
  pageSize?: number;
  status?: string;
  planId?: string;
  userId?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const where: Prisma.SubscriptionWhereInput = {};
  if (query.status) where.status = query.status as SubscriptionStatus;
  if (query.planId) where.planId = query.planId;
  if (query.userId) where.userId = query.userId;

  const [subscriptions, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        plan: true,
        user: { select: { id: true, name: true, mobile: true, email: true } },
      },
    }),
    prisma.subscription.count({ where }),
  ]);

  return { subscriptions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function listAdminTransactions(query: {
  page?: number;
  pageSize?: number;
  status?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const sortBy = query.sortBy ?? "createdAt";
  const sortOrder = query.sortOrder === "asc" ? "asc" : "desc";

  const where: Prisma.TransactionWhereInput = {};
  if (query.status) where.status = query.status as TransactionStatus;
  if (query.userId) where.userId = query.userId;
  if (query.dateFrom || query.dateTo) {
    where.createdAt = {
      ...(query.dateFrom && { gte: new Date(query.dateFrom) }),
      ...(query.dateTo && { lte: new Date(query.dateTo) }),
    };
  }
  if (query.search) {
    where.paymentReference = { contains: query.search };
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
      include: {
        user: { select: { id: true, name: true, mobile: true, email: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ---------------------------------------------------------------- Broadcast Notifications

export async function sendAdminBroadcast(data: {
  target: "ALL" | "USER" | "SEGMENT";
  userId?: string;
  segment?: "BUSINESS_OWNERS" | "VERIFIED_USERS";
  title: string;
  message: string;
  type: string;
}) {
  let targetUserIds: string[] = [];

  if (data.target === "USER") {
    if (!data.userId) throw new ApiError(400, "USER_ID_REQUIRED", "userId required for USER target");
    const targetUser = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!targetUser) throw new ApiError(404, "USER_NOT_FOUND", "Target user not found");
    targetUserIds = [data.userId];
  } else if (data.target === "SEGMENT") {
    if (data.segment === "BUSINESS_OWNERS") {
      const rows = await prisma.business.findMany({ select: { ownerUserId: true }, distinct: ["ownerUserId"] });
      targetUserIds = rows.map((r) => r.ownerUserId);
    } else if (data.segment === "VERIFIED_USERS") {
      const [propUsers, bizUsers] = await Promise.all([
        prisma.property.findMany({ where: { verificationStatus: "VERIFIED" }, select: { userId: true }, distinct: ["userId"] }),
        prisma.business.findMany({ where: { verificationStatus: "VERIFIED" }, select: { ownerUserId: true }, distinct: ["ownerUserId"] }),
      ]);
      const set = new Set([...propUsers.map((r) => r.userId), ...bizUsers.map((r) => r.ownerUserId)]);
      targetUserIds = Array.from(set);
    }
  } else {
    // ALL
    const rows = await prisma.user.findMany({ where: { accountStatus: "ACTIVE" }, select: { id: true } });
    targetUserIds = rows.map((r) => r.id);
  }

  const broadcast = await prisma.broadcast.create({
    data: {
      target: data.target,
      userId: data.userId ?? null,
      segment: data.segment ?? null,
      title: data.title,
      message: data.message,
      type: data.type,
      sentCount: targetUserIds.length,
    },
  });

  for (const uId of targetUserIds) {
    await notifyUser(uId, data.title, data.message, data.type as NotificationType).catch(() => {});
  }

  return broadcast;
}

export async function listAdminBroadcasts(page = 1, pageSize = 20) {
  const [broadcasts, total] = await Promise.all([
    prisma.broadcast.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.broadcast.count(),
  ]);

  return { broadcasts, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
