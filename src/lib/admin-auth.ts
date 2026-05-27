import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

export type AdminSessionUser = {
  id?: string | null;
  email?: string | null;
  userType?: string | null;
};

export type ActiveAdminIdentity = {
  id: string;
  email: string;
};

export async function requireActiveAdmin(
  input: AdminSessionUser | null | undefined,
): Promise<ActiveAdminIdentity> {
  const email = input?.email?.trim().toLowerCase();

  if (input?.userType !== "ADMIN" || !input?.id || !email) {
    logger.warn("Unauthorized admin token rejected", { email });
    throw new Error("Unauthorized: Admin access required");
  }

  const dbAdmin = await prisma.user.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      email: true,
      userType: true,
      status: true,
      deletedAt: true,
    },
  });

  if (
    !dbAdmin ||
    dbAdmin.deletedAt ||
    dbAdmin.userType !== "ADMIN" ||
    dbAdmin.status !== "ACTIVE" ||
    dbAdmin.email.toLowerCase() !== email
  ) {
    logger.warn("Unauthorized admin database check rejected", {
      sessionUserId: input.id,
      sessionEmail: email,
      dbUserType: dbAdmin?.userType,
      dbStatus: dbAdmin?.status,
    });
    throw new Error("Unauthorized: Admin access required");
  }

  return { id: dbAdmin.id, email: dbAdmin.email };
}
