import type { AdminRole } from "@prisma/client";

export type AdminCapability =
  | "auth"
  | "dashboard"
  | "users:read"
  | "users:manage"
  | "admins:manage"
  | "property:read"
  | "property:verify"
  | "digipin:read"
  | "digipin:status"
  | "business:read"
  | "business:verify"
  | "category:manage"
  | "plan:manage"
  | "finance:view"
  | "notify:broadcast";

const roleCapabilities: Record<AdminRole, AdminCapability[]> = {
  SUPER_ADMIN: [
    "auth",
    "dashboard",
    "users:read",
    "users:manage",
    "admins:manage",
    "property:read",
    "property:verify",
    "digipin:read",
    "digipin:status",
    "business:read",
    "business:verify",
    "category:manage",
    "plan:manage",
    "finance:view",
    "notify:broadcast",
  ],
  ADMIN: [
    "auth",
    "dashboard",
    "users:read",
    "users:manage",
    "property:read",
    "digipin:read",
    "digipin:status",
    "business:read",
    "notify:broadcast",
  ],
  VERIFICATION_ADMIN: [
    "auth",
    "dashboard",
    "users:read",
    "property:read",
    "property:verify",
    "digipin:read",
    "business:read",
    "business:verify",
  ],
  CONTENT_ADMIN: [
    "auth",
    "dashboard",
    "category:manage",
    "notify:broadcast",
  ],
  FINANCE_ADMIN: [
    "auth",
    "dashboard",
    "plan:manage",
    "finance:view",
  ],
};

export function getCapabilitiesForRole(role: AdminRole): AdminCapability[] {
  return roleCapabilities[role] ?? [];
}

export function roleHasCapability(role: AdminRole, capability: AdminCapability): boolean {
  return getCapabilitiesForRole(role).includes(capability);
}

export function assertAdminCapability(role: AdminRole, capability: AdminCapability): void {
  if (!roleHasCapability(role, capability)) {
    throw new Error(`Role ${role} lacks capability ${capability}`);
  }
}