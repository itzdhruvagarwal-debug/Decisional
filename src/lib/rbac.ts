import { UserType } from "@prisma/client";

export type Permission =
  | "VIEW_DASHBOARD"
  | "MANAGE_USERS"
  | "MANAGE_CAMPAIGNS"
  | "CREATE_CAMPAIGN"
  | "APPLY_CAMPAIGN"
  | "VIEW_ANALYTICS"
  | "MANAGE_DISPUTES"
  | "APPROVE_KYC"
  | "VIEW_OWN_FINANCE"
  | "MANAGE_PLATFORM_FINANCE"
  | "SYSTEM_ADMIN";

export const ROLE_PERMISSIONS: Record<UserType, Permission[]> = {
  ADMIN: [
    "VIEW_DASHBOARD",
    "MANAGE_USERS",
    "MANAGE_CAMPAIGNS",
    "VIEW_ANALYTICS",
    "MANAGE_DISPUTES",
    "APPROVE_KYC",
    "VIEW_OWN_FINANCE",
    "MANAGE_PLATFORM_FINANCE",
    "SYSTEM_ADMIN",
  ],
  BRAND: [
    "VIEW_DASHBOARD",
    "MANAGE_CAMPAIGNS",
    "CREATE_CAMPAIGN",
    "VIEW_ANALYTICS",
    "MANAGE_DISPUTES",
    "VIEW_OWN_FINANCE",
  ],
  INFLUENCER: [
    "VIEW_DASHBOARD",
    "APPLY_CAMPAIGN",
    "VIEW_ANALYTICS",
    "MANAGE_DISPUTES",
    "VIEW_OWN_FINANCE",
  ],
};

export function hasPermission(
  userType: UserType | string,
  permission: Permission,
): boolean {
  if (!userType) return false;
  // Cast string to UserType if needed, though robust code should validate
  const permissions = ROLE_PERMISSIONS[userType as UserType];
  return permissions?.includes(permission) || false;
}

