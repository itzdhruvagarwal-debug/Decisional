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

  const renderMessageContent = (msg: Message) => {
    if (msg.isBlocked) {
      return (
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
      );
    }

    if (msg.messageType === "FILE" && msg.fileUrl) {
      const fileName = msg.metadata?.fileName || "Shared File";
      const isImg = msg.metadata?.fileType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.fileUrl);
      return (
        <div className="flex flex-col gap-2 min-w-200">
          <div className="flex items-center gap-2 font-semibold text-sm">
            📎 File Shared
          </div>
          {isImg ? (
            <div className="relative w-full max-w-240 h-160 rounded-md overflow-hidden bg-dark-80 border-card mb-1">
              <img src={msg.fileUrl} alt={fileName} className="object-cover w-full h-full" />
            </div>
          ) : null}
          <a
            href={msg.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full block"
          >
            <Button
              variant="secondary"
              size="sm"
              className="w-full flex items-center justify-center gap-2 text-xs cursor-pointer"
            >
              📥 Download {fileName.slice(0, 20)}{fileName.length > 20 ? "..." : ""}
            </Button>
          </a>
        </div>
      );
    }

    if (msg.messageType === "OFFER") {
      const offer = msg.metadata || {};
      const amount = Number(offer.amount || 0);
      const isPending = offer.status === "PENDING";
      const isAccepted = offer.status === "ACCEPTED";
      const isDeclined = offer.status === "DECLINED";

      return (
        <div className="offer-card flex flex-col gap-3 p-4 rounded-lg bg-dark-80 border-card text-left max-w-320">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="font-bold text-sm text-gradient">Custom Offer</span>
            <span className={`text-2xs font-extrabold px-2 py-0.5 rounded-full ${
              isAccepted ? "bg-emerald-500/20 text-emerald-400" :
              isDeclined ? "bg-rose-500/20 text-rose-400" :
              "bg-amber-500/20 text-amber-400"
            }`}>
              {offer.status || "PENDING"}
            </span>
          </div>
          <div className="text-sm font-bold">{offer.title || "Custom Deal"}</div>
          <div className="text-xs text-secondary leading-relaxed line-clamp-3">
            {offer.description || "No description provided."}
          </div>
          {offer.deliverables ? (
            <div className="text-2xs text-muted">
              <strong>Deliverables:</strong> {offer.deliverables}
            </div>
          ) : null}
          <div className="flex justify-between items-center bg-dark-90 p-2 rounded text-xs">
            <span>Proposed Rate:</span>
            <strong className="text-white">₹{(amount / 100).toLocaleString()}</strong>
          </div>
          {isPending && !msg.isMe ? (
            <div className="flex gap-2 mt-1 w-full">
              <Button
                variant="primary"
                size="sm"
                onClick={() => state.handleUpdateOfferStatus?.(msg.id, "ACCEPTED")}
                className="flex-1 text-2xs py-1 cursor-pointer"
              >
                Accept
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => state.handleUpdateOfferStatus?.(msg.id, "DECLINED")}
                className="flex-1 text-2xs py-1 cursor-pointer"
              >
                Decline
              </Button>
            </div>
          ) : null}
        </div>
      );
    }

    return <p className="text-sm leading-normal">{msg.content}</p>;
  };

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
              {renderMessageContent(msg)}
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
    handleSendFile,
    handleSendOffer,
  } = state;

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = React.useState(false);

  // Offer fields
  const [offerTitle, setOfferTitle] = React.useState("");
  const [offerAmount, setOfferAmount] = React.useState("");
  const [offerDescription, setOfferDescription] = React.useState("");
  const [offerDeliverables, setOfferDeliverables] = React.useState("");
  const [offerContentDeadline, setOfferContentDeadline] = React.useState("");
  const [offerPostingDeadline, setOfferPostingDeadline] = React.useState("");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "chat");

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || "Failed to upload file");
      }

      await handleSendFile?.(data.data.url, file.name, file.type);
      showToast("success", "File shared successfully!");
    } catch (err) {
      console.error("[chat] File upload failed:", err);
      showToast("error", err instanceof Error ? err.message : "File sharing failed");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreateOfferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offerTitle.trim()) {
      showToast("error", "Offer title is required");
      return;
    }
    const amountVal = Number(offerAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      showToast("error", "Please enter a valid amount");
      return;
    }
    
    try {
      await handleSendOffer?.({
        title: offerTitle,
        amount: Math.round(amountVal * 100), // convert to paise
        description: offerDescription,
        deliverables: offerDeliverables,
        contentDeadline: offerContentDeadline,
        postingDeadline: offerPostingDeadline,
      });
      showToast("success", "Offer sent successfully!");
      setIsOfferModalOpen(false);
      // Reset form
      setOfferTitle("");
      setOfferAmount("");
      setOfferDescription("");
      setOfferDeliverables("");
      setOfferContentDeadline("");
      setOfferPostingDeadline("");
    } catch (err) {
      showToast("error", "Failed to send offer");
    }
  };

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
        <div className="flex gap-3 items-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: "none" }}
            id="chat-file-upload-input"
          />
          <Button
            variant="ghost"
            title="Share File"
            aria-label="Share a file"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-lg cursor-pointer font-extrabold"
          >
            {isUploading ? "⏳" : "📎"}
          </Button>
          <Button
            variant="ghost"
            title="Create Offer"
            aria-label="Create an offer"
            onClick={() => setIsOfferModalOpen(true)}
            className="text-lg cursor-pointer font-extrabold"
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

      {/* Direct Custom Offer Creation Modal */}
      <Modal
        open={isOfferModalOpen}
        onClose={() => setIsOfferModalOpen(false)}
        title="Create Custom Offer"
        maxWidth="500px"
      >
        <form onSubmit={handleCreateOfferSubmit} className="flex flex-col gap-4">
          <Input
            label="Offer Title"
            id="offer-title-input"
            value={offerTitle}
            onChange={(e) => setOfferTitle(e.target.value)}
            placeholder="e.g. 2 Dedicated YouTube Shorts + 1 Instagram Reel"
            fullWidth
            required
          />
          <Input
            label="Proposed Rate (in INR)"
            type="number"
            id="offer-amount-input"
            value={offerAmount}
            onChange={(e) => setOfferAmount(e.target.value)}
            placeholder="e.g. 15000"
            fullWidth
            required
          />
          <Textarea
            label="Description"
            id="offer-description-textarea"
            value={offerDescription}
            onChange={(e) => setOfferDescription(e.target.value)}
            placeholder="Describe the collaboration details, terms, requirements..."
            rows={3}
            fullWidth
          />
          <Input
            label="Deliverables"
            id="offer-deliverables-input"
            value={offerDeliverables}
            onChange={(e) => setOfferDeliverables(e.target.value)}
            placeholder="e.g. 2 Shorts, 1 Reel"
            fullWidth
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Content Deadline"
              type="date"
              id="offer-content-deadline-input"
              value={offerContentDeadline}
              onChange={(e) => setOfferContentDeadline(e.target.value)}
              fullWidth
            />
            <Input
              label="Posting Deadline"
              type="date"
              id="offer-posting-deadline-input"
              value={offerPostingDeadline}
              onChange={(e) => setOfferPostingDeadline(e.target.value)}
              fullWidth
            />
          </div>
          <div className="flex justify-end gap-3 mt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsOfferModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Send Offer
            </Button>
          </div>
        </form>
      </Modal>
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
