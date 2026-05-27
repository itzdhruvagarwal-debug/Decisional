import prisma from "@/lib/db";
import { checkMessageForContacts } from "@/lib/contact-filter";
import { redis } from "@/lib/redis";

const TYPING_TTL_SECONDS = 7;
const TYPING_REFRESH_SECONDS = 4;

type ConversationAccess = {
  isAdmin: boolean;
  participantIds: string[];
  conversationKey: string;
};

function conversationKeyForDirect(userA: string, userB: string) {
  return `direct:${[userA, userB].sort().join(":")}`;
}

function typingKey(conversationKey: string, userId: string) {
  return `typing:${conversationKey}:${userId}`;
}

function redactMessage(message: any, isAdmin: boolean) {
  return {
    ...message,
    content:
      message.isBlocked && !isAdmin
        ? "[MESSAGE REDACTED: SENSITIVE CONTACT INFO]"
        : message.content,
    fileUrl: message.isBlocked && !isAdmin ? null : message.fileUrl,
  };
}

async function getUserRole(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { userType: true },
  });
  return { isAdmin: user?.userType === "ADMIN" };
}

async function getConversationAccess(
  userId: string,
  params: { dealId?: string; with?: string },
): Promise<ConversationAccess> {
  const { isAdmin } = await getUserRole(userId);

  if (params.dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: params.dealId },
      include: {
        influencer: { select: { userId: true } },
        brand: { select: { userId: true } },
      },
    });

    if (!deal) throw new Error("Deal not found");

    const participantIds = [deal.influencer.userId, deal.brand?.userId].filter(
      Boolean,
    ) as string[];
    if (!participantIds.includes(userId) && !isAdmin) {
      throw new Error("Unauthorized");
    }

    return {
      isAdmin,
      participantIds,
      conversationKey: `deal:${params.dealId}`,
    };
  }

  if (!params.with) throw new Error("Invalid parameters");
  if (params.with === userId) throw new Error("Cannot message yourself");

  const [existingMessageCount, sharedDeal] = await Promise.all([
    prisma.message.count({
      where: {
        OR: [
          { senderId: userId, receiverId: params.with },
          { senderId: params.with, receiverId: userId },
        ],
      },
    }),
    prisma.deal.findFirst({
      where: {
        OR: [
          { influencer: { userId }, brand: { userId: params.with } },
          { brand: { userId }, influencer: { userId: params.with } },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (!isAdmin && existingMessageCount === 0 && !sharedDeal) {
    throw new Error("You can only message users you have a deal with");
  }

  return {
    isAdmin,
    participantIds: [userId, params.with],
    conversationKey: conversationKeyForDirect(userId, params.with),
  };
}

async function getTypingPresence(access: ConversationAccess, userId: string) {
  const otherParticipantIds = access.participantIds.filter((id) => id !== userId);
  if (otherParticipantIds.length === 0) return { isTyping: false, users: [] };

  try {
    const values = await Promise.all(
      otherParticipantIds.map(async (participantId) => {
        const value = await redis.get(typingKey(access.conversationKey, participantId));
        return value ? participantId : null;
      }),
    );

    const users = values.filter(Boolean) as string[];
    return { isTyping: users.length > 0, users };
  } catch {
    return { isTyping: false, users: [] };
  }
}

export class MessageService {
  static async listMessages(
    userId: string,
    params: { dealId?: string; with?: string; page: number; limit: number },
  ) {
    const access = await getConversationAccess(userId, params);

    if (params.dealId) {
      const rawMessages = await prisma.message.findMany({
        where: { dealId: params.dealId },
        include: {
          sender: {
            select: {
              id: true,
              email: true,
              userType: true,
              influencerProfile: {
                select: { displayName: true, avatar: true },
              },
              brandProfile: { select: { companyName: true, logo: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      });

      if (access.participantIds.includes(userId)) {
        await prisma.message.updateMany({
          where: { dealId: params.dealId, receiverId: userId, isRead: false },
          data: { isRead: true, readAt: new Date() },
        });
      }

      const presence = await getTypingPresence(access, userId);
      return {
        messages: rawMessages.map((message: any) =>
          redactMessage(message, access.isAdmin),
        ),
        dealId: params.dealId,
        presence,
      };
    }

    const rawMessages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: params.with },
          { senderId: params.with, receiverId: userId },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            userType: true,
            influencerProfile: {
              select: { displayName: true, avatar: true },
            },
            brandProfile: { select: { companyName: true, logo: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    });

    await prisma.message.updateMany({
      where: { senderId: params.with, receiverId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    const presence = await getTypingPresence(access, userId);
    return {
      messages: rawMessages.map((message: any) =>
        redactMessage(message, access.isAdmin),
      ),
      presence,
    };
  }

  static async listConversations(userId: string, page: number, limit: number) {
    const { isAdmin } = await getUserRole(userId);

    const sent = await prisma.message.findMany({
      where: { senderId: userId },
      select: { receiverId: true },
      distinct: ["receiverId"],
    });
    const received = await prisma.message.findMany({
      where: { receiverId: userId },
      select: { senderId: true },
      distinct: ["senderId"],
    });

    const allPartnerIds = Array.from(
      new Set([
        ...sent.map((message: any) => message.receiverId),
        ...received.map((message: any) => message.senderId),
      ]),
    );

    const total = allPartnerIds.length;
    const pagePartnerIds = allPartnerIds.slice(
      (page - 1) * limit,
      page * limit,
    );

    if (pagePartnerIds.length === 0) {
      return { conversations: [], total };
    }

    const users = await prisma.user.findMany({
      where: { id: { in: pagePartnerIds } },
      select: {
        id: true,
        userType: true,
        influencerProfile: { select: { displayName: true, avatar: true } },
        brandProfile: { select: { companyName: true, logo: true } },
      },
    });
    const userMap = new Map(users.map((user: any) => [user.id, user]));

    const conversations = await Promise.all(
      pagePartnerIds.map(async (contactId) => {
        const latestMessage = await prisma.message.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: contactId },
              { senderId: contactId, receiverId: userId },
            ],
          },
          orderBy: { createdAt: "desc" },
        });

        const unreadCount = await prisma.message.count({
          where: { senderId: contactId, receiverId: userId, isRead: false },
        });

        const access: ConversationAccess = {
          isAdmin,
          participantIds: [userId, contactId],
          conversationKey: conversationKeyForDirect(userId, contactId),
        };

        return {
          userId: contactId,
          user: userMap.get(contactId) || null,
          latestMessage: latestMessage
            ? redactMessage(latestMessage, isAdmin)
            : null,
          unreadCount,
          presence: await getTypingPresence(access, userId),
        };
      }),
    );

    conversations.sort(
      (a, b) =>
        (b.latestMessage?.createdAt.getTime() || 0) -
        (a.latestMessage?.createdAt.getTime() || 0),
    );

    return { conversations, total };
  }

  static async setTyping(
    userId: string,
    data: { dealId?: string; with?: string; isTyping: boolean },
  ) {
    const access = await getConversationAccess(userId, data);
    const key = typingKey(access.conversationKey, userId);

    try {
      if (data.isTyping) {
        await redis.set(key, "1", "EX", TYPING_TTL_SECONDS);
      } else {
        await redis.del(key);
      }
    } catch {
      return {
        isTyping: false,
        refreshAfterSeconds: TYPING_REFRESH_SECONDS,
      };
    }

    return {
      isTyping: data.isTyping,
      refreshAfterSeconds: TYPING_REFRESH_SECONDS,
    };
  }

  static async sendMessage(
    userId: string,
    data: {
      dealId?: string;
      receiverId: string;
      content: string;
      messageType?: string;
      fileUrl?: string;
      metadata?: any;
    },
  ) {
    if (data.receiverId === userId) throw new Error("Cannot message yourself");

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentCount, dailyCount] = await Promise.all([
      prisma.message.count({
        where: { senderId: userId, createdAt: { gt: oneMinuteAgo } },
      }),
      prisma.message.count({
        where: { senderId: userId, createdAt: { gt: oneDayAgo } },
      }),
    ]);

    if (recentCount >= 20) {
      throw new Error("You are sending messages too fast. Please wait a moment.");
    }
    if (dailyCount >= 500) throw new Error("Daily message limit reached.");

    const receiver = await prisma.user.findUnique({
      where: { id: data.receiverId },
      select: { status: true },
    });
    if (
      !receiver ||
      receiver.status === "BANNED" ||
      receiver.status === "SUSPENDED"
    ) {
      throw new Error("Recipient not found or unavailable");
    }

    const sender = await prisma.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });
    if (!sender || sender.status === "BANNED" || sender.status === "SUSPENDED") {
      throw new Error("Your account is restricted from sending messages");
    }

    if (data.dealId) {
      const access = await getConversationAccess(userId, { dealId: data.dealId });
      if (!access.participantIds.includes(data.receiverId)) {
        throw new Error("Recipient is not part of this deal");
      }
    } else {
      await getConversationAccess(userId, { with: data.receiverId });
    }

    const filterResult = checkMessageForContacts(data.content || "");
    const isBlocked = filterResult.hasContactInfo;
    const hasWarning = filterResult.hasContactInfo;

    const message = await prisma.message.create({
      data: {
        dealId: data.dealId,
        senderId: userId,
        receiverId: data.receiverId,
        content: data.content,
        messageType: data.messageType || "TEXT",
        fileUrl: data.fileUrl,
        isBlocked,
        hasWarning,
        metadata:
          data.metadata ||
          (filterResult.findings.length > 0
            ? { filterReason: filterResult.findings }
            : undefined),
      },
      include: {
        sender: {
          select: {
            id: true,
            userType: true,
            influencerProfile: { select: { displayName: true, avatar: true } },
            brandProfile: { select: { companyName: true, logo: true } },
          },
        },
      },
    });

    await MessageService.setTyping(userId, {
      ...(data.dealId ? { dealId: data.dealId } : { with: data.receiverId }),
      isTyping: false,
    });

    await prisma.notification.create({
      data: {
        userId: data.receiverId,
        type: "new_message",
        title: "New Message",
        message: isBlocked
          ? "A message has been blocked by contact filtering rules."
          : "You have a new message",
        data: { senderId: userId, dealId: data.dealId, messageId: message.id },
      },
    });

    if (isBlocked) {
      await prisma.notification.create({
        data: {
          userId,
          type: "system_warning",
          title: "Message Blocked",
          message:
            "Your message was blocked for containing contact details. Sharing contact details is not allowed before the contract starts.",
          data: { messageId: message.id },
        },
      });

      const adminUsers = await prisma.user.findMany({
        where: { userType: "ADMIN" },
      });
      if (adminUsers.length > 0) {
        await prisma.notification.createMany({
          data: adminUsers.map((admin: any) => ({
            userId: admin.id,
            type: "admin_alert",
            title: "Contact Details Shared",
            message: `User ${userId} attempted to share contact details with ${data.receiverId}.`,
            data: {
              type: "contact_violation",
              senderId: userId,
              receiverId: data.receiverId,
              messageId: message.id,
              findings: filterResult.findings,
            },
          })),
        });
      }
    }

    return message;
  }
}
