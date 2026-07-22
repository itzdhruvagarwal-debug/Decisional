"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { checkMessageForContacts } from "@/lib/contact-filter";
import { ToastContainer, type ToastItem, type ToastType } from "@/components/ui/toast";
import EmptyState from "@/components/ui/EmptyState";
import Modal from "@/components/ui/Modal";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { logger } from "@/lib/logger-client";
import { z } from "zod";

export const reportUserSchema = z.object({
  reason: z.string().min(5, "Please select a valid report reason"),
  description: z.string().min(10, "Please describe the issue in at least 10 characters").max(1000),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty").max(2000, "Message cannot exceed 2000 characters"),
});



interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: string;
  isMe?: boolean;
  isBlocked?: boolean;
  hasWarning?: boolean;
  isRead?: boolean;
  readAt?: string | null;
}

interface Conversation {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  userType: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
  isTyping?: boolean;
}

type RawConversation = Record<string, unknown> & {
  userId?: string;
  id?: string;
  name?: string;
  avatar?: string | null;
  userType?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unread?: number;
  unreadCount?: number;
  latestMessage?: {
    content?: string;
    createdAt?: string;
  };
  presence?: {
    isTyping?: boolean;
  };
  user?: {
    userType?: string;
    influencerProfile?: {
      displayName?: string;
      avatar?: string | null;
    } | null;
    brandProfile?: {
      companyName?: string;
      logo?: string | null;
    } | null;
  } | null;
};

function normalizeConversation(raw: RawConversation): Conversation | null {
  const userId = raw.userId || raw.id;
  if (!userId) return null;

  const fallbackName =
    raw.user?.influencerProfile?.displayName ||
    raw.user?.brandProfile?.companyName ||
    "Unknown User";

  return {
    id: raw.id || userId,
    userId,
    name: raw.name || fallbackName,
    avatar:
      raw.avatar ??
      raw.user?.influencerProfile?.avatar ??
      raw.user?.brandProfile?.logo ??
      null,
    userType: raw.userType || raw.user?.userType || "USER",
    lastMessage: raw.lastMessage || raw.latestMessage?.content || "",
    lastMessageTime: raw.lastMessageTime || raw.latestMessage?.createdAt || "",
    unread: Number(raw.unread ?? raw.unreadCount ?? 0),
    isTyping: Boolean(raw.presence?.isTyping),
  };
}

function useMessages() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const dealIdParam = searchParams?.get("deal");
  const processedDealRef = useRef<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<
    string | null
  >(null);
  // selectedChat is derived later using find()
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingRefreshRef = useRef<number>(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isChatUserBlocked, setIsChatUserBlocked] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const removeToast = (toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  };
  const showToast = (type: ToastType, message: string) => {
    const toastId = String(Date.now());
    setToasts(prev => [...prev, { id: toastId, type, message }]);
    setTimeout(() => removeToast(toastId), 5000);
  };

  const getKeepIfStillExists = useCallback((convs: Conversation[]) => {
    return (prev: string | null) => {
      if (!prev) return null;
      return convs.some((c) => c.userId === prev) ? prev : null;
    };
  }, []);

  const { data: messagesData, isLoading: loadingConversations } = useSWR<RawConversation[] | { conversations?: RawConversation[] }>(
    session ? "/api/messages" : null,
    fetcher
  );

  useEffect(() => {
    if (!messagesData) return;
    const convsRaw = Array.isArray(messagesData) ? messagesData : messagesData.conversations || [];
    const convs: Conversation[] = convsRaw
      .map((raw: RawConversation) => normalizeConversation(raw))
      .filter((conv: Conversation | null): conv is Conversation => Boolean(conv));
    setConversations(convs);
    setSelectedConversation(getKeepIfStillExists(convs));
  }, [messagesData, getKeepIfStillExists]);

  const addConversationStub = useCallback((partner: { userId: string; name: string; avatar?: string; userType: string }) => {
    setConversations((prev) => {
      const exists = prev.some((c) => c.userId === partner.userId);
      if (exists) return prev;

      const stubConv: Conversation = {
        id: partner.userId,
        userId: partner.userId,
        name: partner.name,
        avatar: partner.avatar || null,
        userType: partner.userType,
        lastMessage: "",
        lastMessageTime: "",
        unread: 0,
      };
      return [stubConv, ...prev];
    });
  }, []);

  // Load conversation from deal if query parameter is present
  useEffect(() => {
    if (!dealIdParam || !session || loadingConversations) return;
    if (processedDealRef.current === dealIdParam) return;

    const currentUserId = session?.user?.id;
    if (!currentUserId) return;

    processedDealRef.current = dealIdParam;

    fetch(`/api/deals/${dealIdParam}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to fetch deal details");
        return res.json();
      })
      .then((data) => {
        const deal = data.deal;
        if (!deal) return;

        const isInfluencer = deal.influencer?.userId === currentUserId;
        const partner = isInfluencer
          ? {
              userId: deal.brand?.userId,
              name: deal.brand?.companyName || "Brand",
              avatar: deal.brand?.logo,
              userType: "BRAND",
            }
          : {
              userId: deal.influencer?.userId,
              name: deal.influencer?.displayName || "Influencer",
              avatar: deal.influencer?.avatar,
              userType: "INFLUENCER",
            };

        if (!partner.userId) return;

        setSelectedConversation(partner.userId);
        addConversationStub(partner);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          logger.error("[messages] Error loading deal for messaging:", err);
        }
      });
  }, [dealIdParam, session, loadingConversations, addConversationStub]);

  const fetchMessages = useCallback(
    async (showLoading = false) => {
      if (!selectedConversation || !session) return;

      if (showLoading) setLoadingMessages(true);
      try {
        const response = await fetch(`/api/messages?with=${selectedConversation}`, {
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || "Failed to load messages");
        }

        try {
          const blockRes = await fetch(`/api/users/block?checkUserId=${selectedConversation}`);
          if (blockRes.ok) {
            const blockData = await blockRes.json();
            setIsChatUserBlocked(blockData.data?.isBlocked || false);
          }
        } catch (blockErr) {
          logger.error("[messages] Failed to fetch block status:", blockErr);
        }

        const mappedMessages = (data.messages || []).map((m: { id: string; senderId: string; content: string; createdAt: string; isRead?: boolean; isBlocked?: boolean; hasWarning?: boolean; readAt?: string | null }) => ({
          id: m.id,
          senderId: m.senderId,
          content: m.content,
          createdAt: new Date(m.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          isMe: m.senderId === session?.user?.id,
          isBlocked: m.isBlocked,
          hasWarning: m.hasWarning,
          isRead: Boolean(m.isRead),
          readAt: m.readAt || null,
        }));
        setMessages(mappedMessages);
        setIsPeerTyping(Boolean(data.presence?.isTyping));
      } catch (err) {
        logger.error("[messages] Failed to fetch messages:", err);
        setMessages([]);
        setIsPeerTyping(false);
      } finally {
        if (showLoading) setLoadingMessages(false);
      }
    },
    [selectedConversation, session],
  );

  useEffect(() => {
    if (!selectedConversation || !session) return;

    fetchMessages(true);
    const interval = globalThis.setInterval(() => {
      fetchMessages(false);
    }, 10000);

    return () => globalThis.clearInterval(interval);
  }, [fetchMessages, selectedConversation, session]);

  useEffect(() => {
    setIsChatUserBlocked(false);
    setReportReason("");
    setReportDescription("");
  }, [selectedConversation]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const publishTyping = useCallback(
    async (isTyping: boolean) => {
      if (!selectedConversation) return;

      try {
        await fetch("/api/messages", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            with: selectedConversation,
            isTyping,
          }),
        });
      } catch {
        // Typing presence is best-effort; messages still work without Redis.
      }
    },
    [selectedConversation],
  );

  const handleInputChange = (value: string) => {
    setNewMessage(value);
    if (!selectedConversation) return;

    const now = Date.now();
    if (value.trim() && now - typingRefreshRef.current > 3000) {
      typingRefreshRef.current = now;
      publishTyping(true);
    }

    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
    }
    typingStopTimerRef.current = setTimeout(() => {
      publishTyping(false);
    }, 2500);
  };

  useEffect(() => {
    setIsPeerTyping(false);
    typingRefreshRef.current = 0;

    return () => {
      if (typingStopTimerRef.current) {
        clearTimeout(typingStopTimerRef.current);
      }
      publishTyping(false);
    };
  }, [publishTyping, selectedConversation]);

  const handleSend = async () => {
    if (!selectedConversation) return;

    const validation = sendMessageSchema.safeParse({ content: newMessage });
    if (!validation.success) {
      showToast("error", validation.error.issues[0]?.message || "Message cannot be empty");
      return;
    }

    const trimmedMessage = validation.data.content.trim();

    // Front-end filter check
    const filterResult = checkMessageForContacts(trimmedMessage);
    if (filterResult.hasContactInfo) {
      showToast("error", "Warning: Contact details detected. You cannot share emails, phone numbers, links, or social handles before a contract is finalized.");
      return; // Block message sending completely from frontend.
    }

    const tempId = `temp-${Date.now()}`;

    // Optimistic update
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        senderId: session?.user?.id || "me",
        content: trimmedMessage,
        createdAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        isMe: true,
      },
    ]);

    const messageCopy = trimmedMessage;
    setNewMessage("");
    publishTyping(false);

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverId: selectedConversation,
          content: messageCopy,
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || payload?.message || "Failed to send message");
      }

      if (payload?.message) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempId
              ? {
                  ...msg,
                  id: payload.message.id || msg.id,
                  createdAt: payload.message.createdAt
                    ? new Date(payload.message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : msg.createdAt,
                  isBlocked: Boolean(payload.message.isBlocked),
                  hasWarning: Boolean(payload.message.hasWarning),
                  isRead: Boolean(payload.message.isRead),
                  readAt: payload.message.readAt || null,
                }
              : msg,
          ),
        );
      }
      fetchMessages(false);
    } catch (err) {
      logger.error("[messages] Failed to send message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(messageCopy);
      showToast("error", "Message send failed. Please try again.");
    }
  };

  const handleBlockUser = async () => {
    if (!selectedConversation) return;
    const confirmBlock = window.confirm("Are you sure you want to block this user? You will not be able to send or receive messages from them.");
    if (!confirmBlock) return;

    try {
      const res = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockedUserId: selectedConversation,
          action: "block",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to block user");
      }

      showToast("success", "User blocked successfully");
      setIsChatUserBlocked(true);
      setConversations((prev) => prev.filter((c) => c.userId !== selectedConversation));
      setSelectedConversation(null);
    } catch (err) {
      logger.error("[messages] Block error:", err);
      showToast("error", err instanceof Error ? err.message : "Failed to block user");
    }
  };

  const handleUnblockUser = async () => {
    if (!selectedConversation) return;

    try {
      const res = await fetch("/api/users/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockedUserId: selectedConversation,
          action: "unblock",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to unblock user");
      }

      showToast("success", "User unblocked successfully");
      setIsChatUserBlocked(false);
      fetchMessages(true);
    } catch (err) {
      logger.error("[messages] Unblock error:", err);
      showToast("error", err instanceof Error ? err.message : "Failed to unblock user");
    }
  };

  const handleReportUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConversation) return;

    const validation = reportUserSchema.safeParse({
      reason: reportReason,
      description: reportDescription,
    });

    if (!validation.success) {
      showToast("error", validation.error.issues[0]?.message || "Invalid report details");
      return;
    }

    setSubmittingReport(true);
    try {
      const res = await fetch("/api/users/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportedUserId: selectedConversation,
          reason: reportReason,
          description: reportDescription,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to submit report");
      }

      showToast("success", "User reported successfully. Our team will review this report.");
      setIsReportModalOpen(false);
      setReportReason("");
      setReportDescription("");
    } catch (err) {
      logger.error("[messages] Report error:", err);
      showToast("error", err instanceof Error ? err.message : "Failed to report user");
    } finally {
      setSubmittingReport(false);
    }
  };

  const selectedChat = conversations.find(
    (c) => c.userId === selectedConversation,
  );

  return {
    session,
    status,
    conversations,
    selectedConversation,
    setSelectedConversation,
    messages,
    newMessage,
    setNewMessage,
    isPeerTyping,
    loadingConversations,
    loadingMessages,
    messagesEndRef,
    isChatUserBlocked,
    isReportModalOpen,
    setIsReportModalOpen,
    reportReason,
    setReportReason,
    reportDescription,
    setReportDescription,
    submittingReport,
    toasts,
    removeToast,
    handleInputChange,
    handleSend,
    handleBlockUser,
    handleUnblockUser,
    handleReportUserSubmit,
    selectedChat,
    showToast,
    publishTyping,
  };
}

interface ConversationsSidebarProps {
  readonly state: ReturnType<typeof useMessages>;
}

function ConversationsSidebar({ state }: ConversationsSidebarProps) {
  const {
    selectedConversation,
    setSelectedConversation,
    conversations,
    loadingConversations,
  } = state;

  return (
    <div className={`messages-list ${selectedConversation ? "hide-mobile" : ""}`}>
      <div
        className="border-b-card" style={{ padding: "20px" }}
      >
        <h1 className="text-xl font-extrabold">Messages</h1>
      </div>
      <div className="flex-1" style={{ overflowY: "auto" }}>
        {(() => {
          if (loadingConversations) {
            return (
              <div className="text-center" style={{ padding: "20px" }}>
                <span
                  className="loading"
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
            );
          }
          if (conversations.length === 0) {
            return (
              <EmptyState
                emoji="💬"
                title="No Conversations"
                description="Your inbox is empty. Start a deal to chat with creators or brands!"
                compact
              />
            );
          }
          return conversations.map((conv) => (
            <Button
              key={conv.userId}
              onClick={() => setSelectedConversation(conv.userId)}
              type="button"
              aria-label={`Chat with ${conv.name}${conv.unread > 0 ? `, ${conv.unread} unread message${conv.unread === 1 ? "" : "s"}` : ""}`}
              {...(selectedConversation === conv.userId ? { "aria-current": "true" as const } : {})}
              className="conversation-item"
              style={{
                background:
                  selectedConversation === conv.userId
                    ? "rgba(99, 102, 241, 0.1)"
                    : "transparent",
              }}
            >
              <div
                className="flex items-center justify-center font-bold flex-shrink-0" style={{ width: "48px", height: "48px", background: "var(--gradient-card)", borderRadius: "var(--radius-full)", color: "white" }}
              >
                {conv.avatar ? (
                  <Image
                    src={conv.avatar}
                    alt={conv.name || "User avatar"}
                    fill
                    unoptimized
                    className="object-cover" style={{ borderRadius: "50%" }}
                  />
                ) : (
                  (conv.name || "U").charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 text-left" style={{ minWidth: 0 }}>
                <div
                  className="flex justify-between mb-1" style={{ alignItems: "baseline" }}
                >
                  <span
                    className="font-extrabold text-sm overflow-hidden" style={{ color: "var(--color-text-primary)", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}
                  >
                    {conv.name}
                  </span>
                  <span
                    className="text-muted" style={{ fontSize: "11px" }}
                  >
                    {conv.lastMessageTime
                      ? new Date(conv.lastMessageTime).toLocaleDateString()
                      : ""}
                  </span>
                </div>
                <div
                  className="flex justify-between items-center"
                >
                  <span
                    className="text-sm overflow-hidden" style={{ color:
                        conv.unread > 0
                          ? "var(--color-text-primary)"
                          : "var(--color-text-muted)", fontWeight: conv.unread > 0 ? 600 : 400, textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}
                  >
                    {conv.isTyping ? "Typing..." : conv.lastMessage || "Start a conversation"}
                  </span>
                  {conv.unread > 0 && (
                    <span
                      className="font-bold" style={{ background: "var(--color-primary)", color: "white", fontSize: "10px", borderRadius: "var(--radius-full)", padding: "2px 6px" }}
                    >
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            </Button>
          ));
        })()}
      </div>
    </div>
  );
}

interface ChatPanelProps {
  readonly state: ReturnType<typeof useMessages>;
}

function ChatHeader({ state }: ChatPanelProps) {
  const {
    setSelectedConversation,
    isPeerTyping,
    isChatUserBlocked,
    setIsReportModalOpen,
    handleBlockUser,
    handleUnblockUser,
    selectedChat,
  } = state;

  if (!selectedChat) return null;

  return (
    <div
      className="border-b-card flex items-center gap-3" style={{ padding: "16px 24px", background: "rgba(18, 18, 31, 0.8)", backdropFilter: "blur(20px)" }}
    >
      <Button
        variant="ghost"
        onClick={() => setSelectedConversation(null)}
        
        aria-label="Back to conversations list"
         className="show-mobile text-lg" style={{ marginRight: "8px" }}
      >
        ←
      </Button>
      <div
        className="flex items-center justify-center font-bold" style={{ width: "40px", height: "40px", background: "var(--gradient-card)", borderRadius: "var(--radius-full)", color: "white" }}
      >
        {selectedChat.avatar ? (
          <Image
            src={selectedChat.avatar}
            alt={selectedChat.name || "User avatar"}
            fill
            unoptimized
            className="object-cover" style={{ borderRadius: "50%" }}
          />
        ) : (
          (selectedChat.name || "U").charAt(0)
        )}
      </div>
      <div>
        <div className="font-semibold">{selectedChat.name}</div>
        <div
          className="text-xs text-secondary"
        >
          {isPeerTyping ? "Typing..." : selectedChat.userType}
        </div>
      </div>
      <div className="flex gap-2 items-center" style={{ marginLeft: "auto" }}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsReportModalOpen(true)}
          aria-label={`Report ${selectedChat?.name ?? "this user"}`}
        >
          ⚠️ Report
        </Button>
        <Button
          variant={isChatUserBlocked ? "secondary" : "danger"}
          size="sm"
          onClick={isChatUserBlocked ? handleUnblockUser : handleBlockUser}
          aria-label={isChatUserBlocked ? `Unblock ${selectedChat?.name ?? "user"}` : `Block ${selectedChat?.name ?? "user"}`}
        >
          {isChatUserBlocked ? "Unblock" : "Block"}
        </Button>
      </div>
    </div>
  );
}

function MessageList({ state }: ChatPanelProps) {
  const {
    messages,
    isPeerTyping,
    loadingMessages,
    messagesEndRef,
  } = state;

  return (
    <div
      aria-label="Chat messages"
      aria-live="polite"
      aria-relevant="additions"
      className="flex-1 p-6 flex flex-col gap-4" style={{ overflowY: "auto", background: "var(--color-bg-tertiary)" }}
    >
      {loadingMessages ? (
        <div className="text-center" style={{ padding: "20px" }}>
          <span className="loading" />
        </div>
      ) : (
        messages.map((msg, i) => (
          <div
            key={msg.id || i}
            className="flex" style={{ justifyContent: msg.isMe ? "flex-end" : "flex-start" }}
          >
            <div
              style={{
                maxWidth: "75%",
                padding: "12px 16px",
                borderRadius: msg.isMe
                  ? "16px 16px 4px 16px"
                  : "16px 16px 16px 4px",
                background: msg.isMe
                  ? "var(--color-primary)"
                  : "var(--color-bg-secondary)",
                color: msg.isMe
                  ? "white"
                  : "var(--color-text-primary)",
                boxShadow: "var(--shadow-sm)",
                border: msg.isMe
                  ? "none"
                  : "1px solid var(--color-border)",
                opacity: msg.isBlocked ? 0.9 : 1,
              }}
            >
              {msg.isBlocked ? (
                <div
                  className="flex flex-col gap-2"
                >
                  <div
                    className="flex items-center gap-2 text-xs font-semibold" style={{ color: msg.isMe ? "#ffcccc" : "#ff4444" }}
                  >
                    ⚠️ Warning: Message Blocked
                  </div>
                  <p
                    className="text-sm" style={{ lineHeight: 1.5, filter: "blur(5px)", userSelect: "none", opacity: 0.5 }}
                  >
                    {msg.content}
                  </p>
                  <div
                    className="text-center" style={{ fontSize: "10px", color: msg.isMe
                        ? "rgba(255,255,255,0.7)"
                        : "var(--color-text-muted)" }}
                  >
                    Sharing contact details before a contract is
                    against our terms.
                  </div>
                </div>
              ) : (
                <p className="text-sm" style={{ lineHeight: 1.5 }}>
                  {msg.content}
                </p>
              )}
              <div
                className="mt-1 text-right" style={{ fontSize: "10px", color: msg.isMe
                    ? "rgba(255,255,255,0.7)"
                    : "var(--color-text-muted)" }}
              >
                {msg.createdAt}
                {msg.isMe && msg.isRead ? " - Seen" : ""}
              </div>
            </div>
          </div>
        ))
      )}
      {isPeerTyping && (
        <div className="flex justify-start">
          <div
            className="text-secondary text-sm" style={{ padding: "10px 14px", borderRadius: "16px", background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)", boxShadow: "var(--shadow-sm)" }}
          >
            Typing...
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

function ChatInputArea({ state }: ChatPanelProps) {
  const {
    newMessage,
    isChatUserBlocked,
    handleInputChange,
    handleSend,
    showToast,
    publishTyping,
  } = state;

  return (
    <div
      className="flex flex-col gap-2" style={{ padding: "16px 24px", borderTop: "1px solid var(--color-border)", background: "var(--color-bg-primary)", alignItems: isChatUserBlocked ? "center" : "stretch", justifyContent: isChatUserBlocked ? "center" : "initial" }}
    >
      {isChatUserBlocked ? (
        <div
          className="font-semibold text-sm" style={{ color: "#ef4444", padding: "8px 16px", background: "rgba(239, 68, 68, 0.1)", borderRadius: "6px", border: "1px solid rgba(239, 68, 68, 0.2)" }}
        >
          🚫 You cannot message this user because a block relationship exists.
        </div>
      ) : (
        <div className="flex gap-3">
          <Button
            variant="ghost"
            title="Share File"
            aria-label="Share a file (coming soon)"
            onClick={() => showToast("info", "File sharing will be available in the next phase.")}
            className="text-lg"
          >
            📎
          </Button>
          <Button
            variant="ghost"
            title="Create Offer"
            aria-label="Create an offer (coming soon)"
            onClick={() => showToast("info", "Offer creation will be available in the next phase.")}
            className="text-lg"
          >
            📄
          </Button>
          <Input
            type="text"
            id="chat-message-input"
            aria-label="Type your message"
            placeholder="Type your message..."
            value={newMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            onBlur={() => publishTyping(false)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1"
          />
          <Button
            variant="primary"
            aria-label="Send message"
            onClick={handleSend}
            disabled={!newMessage.trim()}
          >
            Send
          </Button>
        </div>
      )}
    </div>
  );
}

function ChatPanel({ state }: ChatPanelProps) {
  const { selectedConversation, selectedChat } = state;

  return (
    <div
      className={`flex-1 flex flex-col ${!selectedConversation ? "hide-mobile" : ""}`}
    >
      {selectedChat ? (
        <>
          <ChatHeader state={state} />
          <MessageList state={state} />
          <ChatInputArea state={state} />
        </>
      ) : (
        <div
          className="flex-1 flex items-center justify-center flex-col gap-4 text-secondary" style={{ background: "var(--color-bg-tertiary)" }}
        >
          <div style={{ fontSize: "48px", opacity: 0.5 }}>💬</div>
          <p>Select a conversation to start messaging</p>
        </div>
      )}
    </div>
  );
}

interface ReportUserModalProps {
  readonly state: ReturnType<typeof useMessages>;
}

function ReportUserModal({ state }: ReportUserModalProps) {
  const {
    isReportModalOpen,
    setIsReportModalOpen,
    reportReason,
    setReportReason,
    reportDescription,
    setReportDescription,
    submittingReport,
    handleReportUserSubmit,
  } = state;

  return (
    <Modal
      open={isReportModalOpen}
      onClose={() => {
        setIsReportModalOpen(false);
        setReportReason("");
        setReportDescription("");
      }}
      title="Report User"
      maxWidth="450px"
    >
      <form onSubmit={handleReportUserSubmit}>
        <Select
          label="Reason"
          id="report-reason-select"
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          className="mb-4"
          fullWidth
          required
        >
          <option value="">Select a reason...</option>
          <option value="SPAM">Spam or advertising</option>
          <option value="HARASSMENT">Harassment or abusive language</option>
          <option value="FRAUD">Fraudulent activity or scam</option>
          <option value="INAPPROPRIATE">Inappropriate content or profile</option>
          <option value="OFF_PLATFORM_PAYMENT">Asking for off-platform payment</option>
          <option value="OTHER">Other reason</option>
        </Select>
        <Textarea
          label="Details (optional)"
          id="report-details-textarea"
          value={reportDescription}
          onChange={(e) => setReportDescription(e.target.value)}
          placeholder="Provide additional details to help our moderation team understand..."
          rows={4}
          className="mb-4"
          fullWidth
        />
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsReportModalOpen(false);
              setReportReason("");
              setReportDescription("");
            }}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submittingReport}>
            {submittingReport ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MessagesContent() {
  const state = useMessages();
  const { status, session, toasts, removeToast } = state;

  if (status === "loading") {
    return <div className="p-8 text-center text-muted">Loading session...</div>;
  }

  if (!session) {
    return <div className="p-8 text-center text-muted">Loading session...</div>;
  }

  return (
    <DashboardShell user={session.user}>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <div
        className="card flex overflow-hidden" style={{ height: "calc(100vh - 120px)", padding: 0, background: "var(--color-bg-primary)" }}
      >
        <ConversationsSidebar state={state} />
        <ChatPanel state={state} />
      </div>
      <ReportUserModal state={state} />
    </DashboardShell>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading messages...</div>}>
      <MessagesContent />
    </Suspense>
  );
}
