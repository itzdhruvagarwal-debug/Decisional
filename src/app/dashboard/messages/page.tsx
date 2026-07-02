"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { checkMessageForContacts } from "@/lib/contact-filter";

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

function MessagesContent() {
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
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingRefreshRef = useRef<number>(0);
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toasts, setToasts] = useState<Array<{id: number; type: "success" | "error" | "info"; message: string}>>([]);
  const showToast = (type: "success" | "error" | "info", message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  // Fetch conversations list
  useEffect(() => {
    if (!session) return;

    fetch("/api/messages", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load conversations");
        }
        return data;
      })
      .then((data) => {
        const convsRaw = Array.isArray(data) ? data : data.conversations || [];
        const convs: Conversation[] = convsRaw
          .map((raw: RawConversation) => normalizeConversation(raw))
          .filter((conv: Conversation | null): conv is Conversation => Boolean(conv));
        setConversations(convs);
        setSelectedConversation((prev) =>
          prev && convs.some((c) => c.userId === prev) ? prev : null,
        );
        setLoadingConversations(false);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") {
          console.error("[messages] Failed to fetch conversations:", err);
          setConversations([]);
          setSelectedConversation(null);
        }
        setLoadingConversations(false);
      });
  }, [session]);

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
          console.error("[messages] Error loading deal for messaging:", err);
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
        console.error("[messages] Failed to fetch messages:", err);
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
    const interval = window.setInterval(() => {
      fetchMessages(false);
    }, 10000);

    return () => window.clearInterval(interval);
  }, [fetchMessages, selectedConversation, session]);

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
    const trimmedMessage = newMessage.trim();
    if (!trimmedMessage || !selectedConversation) return;

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
      console.error("[messages] Failed to send message:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(messageCopy);
      showToast("error", "Message send failed. Please try again.");
    }
  };

  const selectedChat = conversations.find(
    (c) => c.userId === selectedConversation,
  );

  if (status === "loading") {
    return <div className="p-8 text-center text-muted">Loading session...</div>;
  }

  if (!session) {
    return <div className="p-8 text-center text-muted">Loading session...</div>;
  }

  return (
    <DashboardShell user={session.user}>
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", maxWidth: "400px" }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: "12px 20px",
              borderRadius: "10px",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 500,
              background: t.type === "success" ? "linear-gradient(135deg, #059669, #10b981)" : t.type === "error" ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #2563eb, #3b82f6)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.1)",
              animation: "slideInRight 0.3s ease-out",
              cursor: "pointer",
            }} onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}>
              {t.type === "success" ? "✓ " : t.type === "error" ? "✕ " : "ℹ "}{t.message}
            </div>
          ))}
        </div>
      )}
      <div
        className="card"
        style={{
          height: "calc(100vh - 120px)",
          display: "flex",
          padding: 0,
          overflow: "hidden",
          background: "var(--color-bg-primary)",
        }}
      >
        {/* List */}
        <div
          className={`messages-list ${selectedConversation ? "hide-mobile" : ""}`}
        >
          <div
            style={{
              padding: "20px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <h1 style={{ fontSize: "20px", fontWeight: 800 }}>Messages</h1>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loadingConversations ? (
              <div style={{ padding: "20px", textAlign: "center" }}>
                <span
                  className="loading"
                  style={{ width: "24px", height: "24px" }}
                />
              </div>
            ) : conversations.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                }}
              >
                No conversations
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.userId}
                  onClick={() => setSelectedConversation(conv.userId)}
                  style={{
                    display: "flex",
                    gap: "12px",
                    padding: "16px 20px",
                    cursor: "pointer",
                    background:
                      selectedConversation === conv.userId
                        ? "rgba(99, 102, 241, 0.1)"
                        : "transparent",
                    borderBottom: "1px solid var(--color-border)",
                    transition: "background 0.2s",
                  }}
                >
                  <div
                    style={{
                      width: "48px",
                      height: "48px",
                      background: "var(--gradient-card)",
                      borderRadius: "var(--radius-full)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      flexShrink: 0,
                      color: "white",
                    }}
                  >
                    {conv.avatar ? (
                      <img
                        src={conv.avatar}
                        alt={conv.name || "User avatar"}
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      (conv.name || "U").charAt(0)
                    )}
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "4px",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "14px" }}>
                        {conv.name}
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {conv.lastMessageTime
                          ? new Date(conv.lastMessageTime).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "13px",
                          color:
                            conv.unread > 0
                              ? "var(--color-text-primary)"
                              : "var(--color-text-muted)",
                          fontWeight: conv.unread > 0 ? 600 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "160px",
                        }}
                      >
                        {conv.isTyping ? "Typing..." : conv.lastMessage || "Start a conversation"}
                      </span>
                      {conv.unread > 0 && (
                        <span
                          style={{
                            background: "var(--color-primary)",
                            color: "white",
                            fontSize: "10px",
                            fontWeight: 700,
                            borderRadius: "var(--radius-full)",
                            padding: "2px 6px",
                          }}
                        >
                          {conv.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
          }}
          className={!selectedConversation ? "hide-mobile" : ""}
        >
          {selectedChat ? (
            <>
              <div
                style={{
                  padding: "16px 24px",
                  borderBottom: "1px solid var(--color-border)",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: "rgba(18, 18, 31, 0.8)",
                  backdropFilter: "blur(20px)",
                }}
              >
                <button
                  onClick={() => setSelectedConversation(null)}
                  className="show-mobile btn btn-ghost"
                  style={{
                    padding: "8px",
                    marginRight: "8px",
                    fontSize: "18px",
                  }}
                >
                  ←
                </button>
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    background: "var(--gradient-card)",
                    borderRadius: "var(--radius-full)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    color: "white",
                  }}
                >
                  {selectedChat.avatar ? (
                    <img
                      src={selectedChat.avatar}
                      alt={selectedChat.name || "User avatar"}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                      }}
                    />
                  ) : (
                    (selectedChat.name || "U").charAt(0)
                  )}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{selectedChat.name}</div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {isPeerTyping ? "Typing..." : selectedChat.userType}
                  </div>
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "24px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  background: "var(--color-bg-tertiary)",
                }}
              >
                {loadingMessages ? (
                  <div style={{ textAlign: "center", padding: "20px" }}>
                    <span className="loading" />
                  </div>
                ) : (
                  messages.map((msg, i) => (
                    <div
                      key={msg.id || i}
                      style={{
                        display: "flex",
                        justifyContent: msg.isMe ? "flex-end" : "flex-start",
                      }}
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
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                color: msg.isMe ? "#ffcccc" : "#ff4444",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              ⚠️ Warning: Message Blocked
                            </div>
                            <p
                              style={{
                                fontSize: "14px",
                                lineHeight: 1.5,
                                filter: "blur(5px)",
                                userSelect: "none",
                                opacity: 0.5,
                              }}
                            >
                              {msg.content}
                            </p>
                            <div
                              style={{
                                fontSize: "10px",
                                color: msg.isMe
                                  ? "rgba(255,255,255,0.7)"
                                  : "var(--color-text-muted)",
                                textAlign: "center",
                              }}
                            >
                              Sharing contact details before a contract is
                              against our terms.
                            </div>
                          </div>
                        ) : (
                          <p style={{ fontSize: "14px", lineHeight: 1.5 }}>
                            {msg.content}
                          </p>
                        )}
                        <div
                          style={{
                            fontSize: "10px",
                            color: msg.isMe
                              ? "rgba(255,255,255,0.7)"
                              : "var(--color-text-muted)",
                            marginTop: "4px",
                            textAlign: "right",
                          }}
                        >
                          {msg.createdAt}
                          {msg.isMe && msg.isRead ? " - Seen" : ""}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                {isPeerTyping && (
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "16px",
                        background: "var(--color-bg-secondary)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text-secondary)",
                        fontSize: "13px",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      Typing...
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div
                style={{
                  padding: "16px 24px",
                  borderTop: "1px solid var(--color-border)",
                  background: "var(--color-bg-primary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    className="btn btn-ghost"
                    title="Share File"
                    onClick={() =>
                      showToast("info", "File sharing will be available in the next phase.")
                    }
                    style={{ padding: "8px", fontSize: "18px" }}
                  >
                    📎
                  </button>
                  <button
                    className="btn btn-ghost"
                    title="Create Offer"
                    onClick={() =>
                      showToast("info", "Offer creation will be available in the next phase.")
                    }
                    style={{ padding: "8px", fontSize: "18px" }}
                  >
                    📄
                  </button>
                  <input
                    type="text"
                    className="input"
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => handleInputChange(e.target.value)}
                    onBlur={() => publishTyping(false)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={!newMessage.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "16px",
                color: "var(--color-text-secondary)",
                background: "var(--color-bg-tertiary)",
              }}
            >
              <div style={{ fontSize: "48px", opacity: 0.5 }}>💬</div>
              <p>Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      </div>
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
