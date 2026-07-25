"use client";

import React from "react";
import Image from "next/image";
import { Button } from "@/components/ui";
import EmptyState from "@/components/ui/EmptyState";
import { useMessages } from "./useMessages";
import { Conversation } from "./MessagesHelpers";

interface ConversationsSidebarProps {
  readonly state: ReturnType<typeof useMessages>;
}

export function ConversationsSidebar({ state }: Readonly<ConversationsSidebarProps>) {
  const {
    selectedConversation,
    setSelectedConversation,
    conversations,
    loadingConversations,
  } = state;

  return (
    <div className={`messages-list ${selectedConversation ? "hide-mobile" : ""}`}>
      <div className="border-b-card p-5">
        <h1 className="text-xl font-extrabold">Messages</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        {(() => {
          if (loadingConversations) {
            return (
              <div className="text-center p-5">
                <span className="loading w-24 h-24" />
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
          return conversations.map((conv: Conversation) => (
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
              <div className="flex items-center justify-center font-bold flex-shrink-0 rounded-full text-white w-48 h-48 bg-gradient-card">
                {conv.avatar ? (
                  <Image
                    src={conv.avatar}
                    alt={conv.name || "User avatar"}
                    fill
                    unoptimized
                    className="object-cover rounded-full"
                  />
                ) : (
                  (conv.name || "U").charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex justify-between mb-1" style={{ alignItems: "baseline" }}>
                  <span className="font-extrabold text-sm overflow-hidden text-primary whitespace-nowrap text-ellipsis max-w-140">
                    {conv.name}
                  </span>
                  <span className="text-muted text-xs">
                    {conv.lastMessageTime
                      ? new Date(conv.lastMessageTime).toLocaleDateString()
                      : ""}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span
                    className="text-sm overflow-hidden whitespace-nowrap"
                    style={{
                      color:
                        conv.unread > 0
                          ? "var(--color-text-primary)"
                          : "var(--color-text-muted)",
                      fontWeight: conv.unread > 0 ? 600 : 400,
                      textOverflow: "ellipsis",
                      maxWidth: "160px",
                    }}
                  >
                    {conv.isTyping ? "Typing..." : conv.lastMessage || "Start a conversation"}
                  </span>
                  {conv.unread > 0 && (
                    <span className="font-bold text-white text-2xs rounded-full px-2 py-0.5 bg-color-primary">
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
