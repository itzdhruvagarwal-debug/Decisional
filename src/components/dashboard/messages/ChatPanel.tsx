"use client";

import React from "react";
import Image from "next/image";
import { Modal, Button, Input, Select, Textarea } from "@/components/ui";
import { useMessages } from "./useMessages";
import { Message } from "./MessagesHelpers";

interface ChatPanelProps {
  readonly state: ReturnType<typeof useMessages>;
}

export function ChatHeader({ state }: Readonly<ChatPanelProps>) {
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
    <div className="border-b-card flex items-center gap-3 px-6 py-4 backdrop-blur-lg bg-dark-80">
      <Button
        variant="ghost"
        onClick={() => setSelectedConversation(null)}
        aria-label="Back to conversations list"
        className="chat-back-btn show-mobile text-lg"
      >
        ←
      </Button>
      <div className="flex items-center justify-center font-bold rounded-full text-white w-40 h-40 bg-gradient-card">
        {selectedChat.avatar ? (
          <Image
            src={selectedChat.avatar}
            alt={selectedChat.name || "User avatar"}
            fill
            unoptimized
            className="object-cover rounded-full"
          />
        ) : (
          (selectedChat.name || "U").charAt(0)
        )}
      </div>
      <div>
        <div className="font-semibold">{selectedChat.name}</div>
        <div className="text-xs text-secondary">
          {isPeerTyping ? "Typing..." : selectedChat.userType}
        </div>
      </div>
      <div className="flex gap-2 items-center ml-auto">
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

export function MessageList({ state }: Readonly<ChatPanelProps>) {
  const { messages, isPeerTyping, loadingMessages, messagesEndRef } = state;

  return (
    <div
      aria-label="Chat messages"
      aria-live="polite"
      aria-relevant="additions"
      className="flex-1 p-6 flex flex-col gap-4 bg-tertiary overflow-y-auto"
    >
      {loadingMessages ? (
        <div className="text-center p-5">
          <span className="loading w-16 h-16" />
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center text-muted p-5 text-sm">No messages yet. Say hello!</div>
      ) : (
        messages.map((msg: Message) => (
          <div key={msg.id} className={`flex ${msg.isMe ? "justify-end" : "justify-start"}`}>
            <div
              className="chat-bubble rounded-xl px-4 py-2.5"
              data-me={msg.isMe}
              data-blocked={msg.isBlocked}
            >
              {msg.isBlocked ? (
                <div className="flex flex-col gap-2">
                  <div
                    className="chat-block-warning flex items-center gap-2 text-xs font-semibold"
                    data-me={msg.isMe}
                  >
                    ⚠️ Warning: Message Blocked
                  </div>
                  <p className="chat-blocked-content text-sm leading-normal select-none opacity-50">
                    {msg.content}
                  </p>
                  <div
                    className="chat-muted-meta text-center text-2xs"
                    data-me={msg.isMe}
                  >
                    Sharing contact details before a contract is against our terms.
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-normal">{msg.content}</p>
              )}
              <div
                className="chat-muted-meta mt-1 text-right text-2xs"
                data-me={msg.isMe}
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
          <div className="chat-typing text-secondary text-sm rounded-xl bg-secondary border-card px-3 py-2.5">
            Typing...
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}

export function ChatInputArea({ state }: Readonly<ChatPanelProps>) {
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
      className="chat-input-area flex flex-col gap-2 border-top px-6 py-4 bg-primary"
      data-blocked={isChatUserBlocked}
    >
      {isChatUserBlocked ? (
        <div
          className="chat-blocked-banner font-semibold text-sm text-rose px-4 py-2 bg-rose-subtle rounded-md"
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

export function ChatPanel({ state }: Readonly<ChatPanelProps>) {
  const { selectedConversation, selectedChat } = state;

  return (
    <div className={`flex-1 flex flex-col ${!selectedConversation ? "hide-mobile" : ""}`}>
      {selectedChat ? (
        <>
          <ChatHeader state={state} />
          <MessageList state={state} />
          <ChatInputArea state={state} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center flex-col gap-4 text-secondary bg-tertiary">
          <div className="text-3xl opacity-50">💬</div>
          <p>Select a conversation to start messaging</p>
        </div>
      )}
    </div>
  );
}

interface ReportUserModalProps {
  readonly state: ReturnType<typeof useMessages>;
}

export function ReportUserModal({ state }: Readonly<ReportUserModalProps>) {
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
