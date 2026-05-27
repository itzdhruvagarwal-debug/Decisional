import prisma from "@/lib/db";

export class NotificationService {
  static async listNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { notifications, total, unreadCount };
  }

  static async markAsRead(userId: string, notificationIds?: string[]) {
    const where: any = { userId, isRead: false };

    if (notificationIds && notificationIds.length > 0) {
      where.id = { in: notificationIds };
    }

    await prisma.notification.updateMany({
      where,
      data: { isRead: true },
    });

    return { success: true };
  }

  // Internal use for system events
  static async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: any;
  }) {
    return await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || {},
      },
    });
  }
}
