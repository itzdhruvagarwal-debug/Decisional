"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Modal, Button, Input, Select, Textarea } from "@/components/ui";
import { useMessages } from "./useMessages";
import { Message, formatMessageDateDivider } from "./MessagesHelpers";
import { formatCurrency, formatDateTime } from "@/lib/utils-client";
import { formatUserError, USER_SUCCESS_MESSAGES } from "@/lib/user-messages";
import { useWallet } from "@/hooks/api/useWallet";
import { checkOfferAcceptanceEligibility } from "@/lib/action-eligibility";
import { DealContextMiniCard } from "./DealContextMiniCard";
import { ContactLeakWarningBanner } from "./ContactLeakWarningBanner";
import {
  ChevronLeft,
  Shield,
  ShieldAlert,
  Flag,
  Ban,
  Unlock,
  Paperclip,
  Handshake,
  Send,
  Download,
  FileText,
  AlertTriangle,
  Check,
  CheckCheck,
  Lock,
  MessageSquare,
} from "lucide-react";

interface ChatPanelProps {
  readonly state: ReturnType<typeof useMessages>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Animated 3-dot typing bubble (Instagram DM style with peer avatar)
// ─────────────────────────────────────────────────────────────────────────────
function TypingBubble({ avatarSrc, name }: { avatarSrc?: string | null | undefined; name?: string | undefined }) {
  return (
    <div className="flex items-end gap-2 justify-start">
      {/* Peer mini-avatar */}
      <div className="w-6 h-6 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">
        {avatarSrc ? (
          <Image src={avatarSrc} alt={name || "User"} fill unoptimized className="object-cover" />
        ) : (
          (name || "U").charAt(0).toUpperCase()
        )}
      </div>
      <div className="flex items-center gap-1 bg-card border border-border rounded-2xl rounded-bl-sm px-3.5 py-3 shadow-sm">
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload progress bar
// ─────────────────────────────────────────────────────────────────────────────
function UploadProgressBar({ progress }: { progress: number }) {
  return (
    <div className="px-4 py-2 border-t border-border bg-card/80">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
        <span className="font-semibold">Uploading file…</span>
        <span className="font-mono tabular-nums">{progress}%</span>
      </div>
      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Header — with deal context chip when active (Collabr pattern)
// ─────────────────────────────────────────────────────────────────────────────
function ChatHeader({ state }: Readonly<ChatPanelProps>) {
  const {
    setSelectedConversation,
    isPeerTyping,
    isChatUserBlocked,
    setIsReportModalOpen,
    handleBlockUser,
    handleUnblockUser,
    selectedChat,
    dealDetails,
  } = state;

  if (!selectedChat) return null;

  const isBrand = selectedChat.userType?.toUpperCase() === "BRAND";

  return (
    <div className="border-b border-border bg-card shrink-0">
      {/* Main header row */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3">
        {/* Left: back + avatar + name */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile back */}
          <button
            type="button"
            onClick={() => setSelectedConversation(null)}
            aria-label="Back to conversations"
            className="sm:hidden w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Avatar with online dot */}
          <div className="relative shrink-0">
            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center text-foreground font-bold text-sm">
              {selectedChat.avatar ? (
                <Image
                  src={selectedChat.avatar}
                  alt={selectedChat.name || "User avatar"}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span
                  className={`w-full h-full flex items-center justify-center text-sm font-black ${
                    isBrand ? "bg-primary/15 text-primary" : "bg-verified-muted text-verified"
                  }`}
                >
                  {(selectedChat.name || "U").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-verified rounded-full border-2 border-card" />
          </div>

          {/* Name + status row */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-foreground truncate max-w-[160px] sm:max-w-xs">
                {selectedChat.name}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide shrink-0 ${
                  isBrand ? "bg-primary/10 text-primary" : "bg-verified-muted text-verified"
                }`}
              >
                {isBrand ? "Brand" : "Creator"}
              </span>
            </div>

            {/* Typing / deal context subtitle */}
            <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
              {isPeerTyping ? (
                <span className="text-primary font-semibold italic flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                  Typing…
                </span>
              ) : dealDetails ? (
                <span className="inline-flex items-center gap-1 text-escrow font-semibold">
                  <Lock className="w-3 h-3" />
                  {dealDetails.title}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-verified" />
                  Verified Workspace Member
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="secondary"
            onClick={() => setIsReportModalOpen(true)}
            aria-label={`Report ${selectedChat?.name ?? "this user"}`}
            className="text-xs min-h-[44px] px-3 py-2 flex items-center gap-1"
          >
            <Flag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Report</span>
          </Button>

          <Button
            variant={isChatUserBlocked ? "secondary" : "ghost"}
            onClick={isChatUserBlocked ? handleUnblockUser : handleBlockUser}
            aria-label={
              isChatUserBlocked
                ? `Unblock ${selectedChat?.name ?? "user"}`
                : `Block ${selectedChat?.name ?? "user"}`
            }
            className={`text-xs min-h-[44px] px-3 py-2 flex items-center gap-1 ${
              isChatUserBlocked
                ? "text-verified border border-verified-border bg-verified-muted"
                : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            }`}
          >
            {isChatUserBlocked ? (
              <Unlock className="w-3.5 h-3.5" />
            ) : (
              <Ban className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {isChatUserBlocked ? "Unblock" : "Block"}
            </span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Content Renderers
// ─────────────────────────────────────────────────────────────────────────────
function BlockedMessageBubble() {
  return (
    <div className="flex flex-col gap-1.5 p-3 bg-disputed-muted border border-disputed-border rounded-2xl max-w-sm">
      <div className="flex items-center gap-1.5 text-xs font-bold text-disputed">
        <ShieldAlert className="w-4 h-4" />
        Message Content Filtered
      </div>
      <p className="text-xs text-foreground/80 italic leading-relaxed">
        Sharing personal contact details (phone, email, WhatsApp, UPI) prior to deal signing is
        blocked for escrow safety.
      </p>
    </div>
  );
}

function FileMessageBubble({ msg }: { msg: Message }) {
  const fileName = String(msg.metadata?.fileName || "Shared File");
  const fileType = String(msg.metadata?.fileType || "");
  const isImg =
    fileType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(msg.fileUrl || "");
  const isVideo =
    fileType.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(msg.fileUrl || "");

  return (
    <div className="flex flex-col gap-2 min-w-[200px] max-w-[280px]">
      <div className="flex items-center gap-1.5 text-xs font-bold opacity-80">
        <FileText className="w-3.5 h-3.5" />
        Attachment
      </div>

      {/* Image preview */}
      {isImg && msg.fileUrl && (
        <div className="relative w-full max-w-[260px] h-44 rounded-xl overflow-hidden bg-muted border border-border/30 shadow-sm group">
          <Image
            src={msg.fileUrl}
            alt={fileName}
            fill
            sizes="260px"
            className="object-cover transition-transform group-hover:scale-105"
            unoptimized={!/\.(jpg|jpeg|png|webp|gif)$/i.test(msg.fileUrl)}
          />
          {/* Overlay download on hover */}
          <a
            href={msg.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label={`Open ${fileName}`}
          >
            <Download className="w-6 h-6 text-foreground" />
          </a>
        </div>
      )}

      {/* Video preview */}
      {isVideo && msg.fileUrl && (
        <div className="relative w-full max-w-[260px] rounded-xl overflow-hidden bg-muted border border-border/30 shadow-sm">
          <video
            src={msg.fileUrl}
            controls
            className="w-full max-h-44 object-cover rounded-xl"
            preload="metadata"
          />
        </div>
      )}

      {/* Download button */}
      {msg.fileUrl && (
        <a
          href={msg.fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full block"
          aria-label={`Download ${fileName}`}
        >
          <Button
            variant="secondary"
            size="sm"
            className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            {fileName.length > 20 ? `${fileName.slice(0, 20)}…` : fileName}
          </Button>
        </a>
      )}
    </div>
  );
}

function OfferMessageBubble({
  msg,
  onAccept,
  onDecline,
  walletBalance,
  isWalletFrozen,
  userType,
}: {
  msg: Message;
  onAccept: () => void;
  onDecline: () => void;
  walletBalance?: number | null | undefined;
  isWalletFrozen?: boolean | null | undefined;
  userType?: string | null | undefined;
}) {
  const offer = msg.metadata || {};
  const amount = Number(offer.amount || 0);
  const isPending = offer.status === "PENDING";
  const isAccepted = offer.status === "ACCEPTED";
  const isDeclined = offer.status === "DECLINED";

  const eligibility = checkOfferAcceptanceEligibility({
    offerAmount: amount,
    userType,
    walletBalance,
    isWalletFrozen,
    offerStatus: offer.status as string | undefined,
  });

  const statusBadge = isAccepted ? (
    <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-verified-muted text-verified border border-verified-border">
      Accepted
    </span>
  ) : isDeclined ? (
    <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-disputed-muted text-disputed border border-disputed-border">
      Declined
    </span>
  ) : (
    <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full bg-pending-muted text-pending border border-pending-border">
      Pending
    </span>
  );

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-card border border-border text-left max-w-sm shadow-md">
      <div className="flex items-center justify-between border-b border-border pb-2.5">
        <div className="flex items-center gap-1.5">
          <Handshake className="w-4 h-4 text-primary" />
          <span className="font-extrabold text-sm text-foreground">Custom Proposal</span>
        </div>
        {statusBadge}
      </div>

      <div>
        <div className="text-sm font-bold text-foreground mb-1">
          {offer.title || "Custom Deal Offer"}
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {offer.description || "Direct collaboration proposal with platform escrow protection."}
        </div>
      </div>

      {offer.deliverables && (
        <div className="text-xs bg-muted/60 p-2.5 rounded-xl border border-border/50">
          <span className="text-muted-foreground font-bold block mb-0.5">Deliverables:</span>
          <span className="text-foreground">{String(offer.deliverables)}</span>
        </div>
      )}

      <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded-xl border border-border/50">
        <span className="text-xs text-muted-foreground">Proposed Rate:</span>
        <strong className="text-base font-extrabold font-mono tabular-nums text-foreground">
          {formatCurrency(amount)}
        </strong>
      </div>

      {isPending && !msg.isMe && (
        <div className="flex flex-col gap-2 mt-1 w-full">
          <div className="flex gap-2 w-full">
            <Button
              variant="primary"
              size="sm"
              onClick={onAccept}
              disabled={!eligibility.allowed}
              className="flex-1 text-xs py-2 font-bold"
            >
              ✓ Accept Offer
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onDecline}
              disabled={false}
              className="flex-1 text-xs py-2 text-destructive hover:bg-destructive/10"
            >
              ✕ Decline
            </Button>
          </div>

          {!eligibility.allowed && eligibility.reason && (
            <div className="flex flex-col gap-1 p-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-[11px]">
              <div className="flex items-center gap-1 font-semibold">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                <span>{eligibility.reason}</span>
              </div>
              {eligibility.ctaText && eligibility.ctaHref && (
                <Link
                  href={eligibility.ctaHref}
                  className="text-primary underline font-bold hover:text-primary/80 mt-0.5 inline-block"
                >
                  {eligibility.ctaText} →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {isAccepted && (offer.dealId || msg.metadata?.dealId) && (
        <Link
          href={`/dashboard/deals/${String(offer.dealId || msg.metadata?.dealId)}`}
          className="w-full block mt-1"
        >
          <Button
            variant="secondary"
            size="sm"
            className="w-full flex items-center justify-center gap-1.5 text-xs py-2 bg-verified-muted text-verified border border-verified-border font-bold"
          >
            <Shield className="w-3.5 h-3.5" />
            View Deal Room
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message List — scroll area with date dividers and all bubble types
// ─────────────────────────────────────────────────────────────────────────────
function MessageList({ state }: Readonly<ChatPanelProps>) {
  const { walletData } = useWallet();
  const {
    messages,
    isPeerTyping,
    loadingMessages,
    messagesEndRef,
    scrollContainerRef,
    selectedChat,
  } = state;

  const renderMessageContent = (msg: Message) => {
    if (msg.isBlocked) return <BlockedMessageBubble />;
    if (msg.messageType === "FILE" && msg.fileUrl) return <FileMessageBubble msg={msg} />;
    if (msg.messageType === "OFFER") {
      return (
        <OfferMessageBubble
          msg={msg}
          onAccept={() => state.handleUpdateOfferStatus?.(msg.id, "ACCEPTED")}
          onDecline={() => state.handleUpdateOfferStatus?.(msg.id, "DECLINED")}
          walletBalance={walletData?.balance}
          isWalletFrozen={walletData?.isFrozen}
          userType={state.session?.user?.userType}
        />
      );
    }
    return <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>;
  };

  return (
    <div
      ref={scrollContainerRef}
      aria-label="Chat messages"
      aria-live="polite"
      aria-relevant="additions"
      className="flex-1 px-4 sm:px-5 py-4 flex flex-col gap-2.5 overflow-y-auto bg-background/50 dark:bg-background/30"
    >
      {/* Loading spinner */}
      {loadingMessages && (
        <div className="flex flex-col items-center justify-center gap-2 my-auto py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-muted-foreground">Loading messages…</span>
        </div>
      )}

      {/* Empty state */}
      {!loadingMessages && messages.length === 0 && (
        <div className="my-auto flex flex-col items-center justify-center gap-3 py-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center shadow-sm">
            <MessageSquare className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <div className="font-bold text-sm text-foreground mb-1">No messages yet</div>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              Start the conversation — discuss deliverables, share drafts, or propose custom
              milestone terms.
            </p>
          </div>
        </div>
      )}

      {/* Message bubbles */}
      {!loadingMessages &&
        messages.length > 0 &&
        messages.map((msg: Message, index: number) => {
          const prevMsg = index > 0 ? messages[index - 1] : null;
          const currDate = msg.rawCreatedAt ? new Date(msg.rawCreatedAt).toDateString() : "";
          const prevDate = prevMsg?.rawCreatedAt
            ? new Date(prevMsg.rawCreatedAt).toDateString()
            : "";
          const showDateDivider = !prevMsg || (currDate && prevDate && currDate !== prevDate);
          const dateLabel = formatMessageDateDivider(msg.rawCreatedAt || msg.createdAt);

          // Instagram-style radius: sent = rounded-2xl rounded-br-sm, received = rounded-2xl rounded-bl-sm
          const bubbleRadius = msg.isMe
            ? "rounded-2xl rounded-br-sm"
            : "rounded-2xl rounded-bl-sm";

          const bubbleColors = msg.isMe
            ? "bg-primary text-primary-foreground"
            : "bg-card text-foreground border border-border/80";

          return (
            <React.Fragment key={msg.id}>
              {/* Date divider */}
              {showDateDivider && dateLabel && (
                <div className="flex items-center justify-center my-3 select-none">
                  <span className="px-3 py-1 text-[10px] font-bold rounded-full bg-card border border-border text-muted-foreground shadow-sm">
                    {dateLabel}
                  </span>
                </div>
              )}

              {/* Bubble row */}
              <div className={`flex ${msg.isMe ? "justify-end" : "justify-start"}`}>
                <div
                  className={`${bubbleRadius} ${bubbleColors} px-3.5 py-2.5 max-w-[85%] sm:max-w-[70%] shadow-sm`}
                  data-me={msg.isMe}
                >
                  {renderMessageContent(msg)}

                  {/* Timestamp + read receipt */}
                  <div
                    className={`mt-1.5 flex items-center justify-end gap-1 text-[10px] font-medium ${
                      msg.isMe ? "text-primary-foreground/70" : "text-muted-foreground"
                    }`}
                    title={msg.rawCreatedAt ? formatDateTime(msg.rawCreatedAt) : msg.createdAt}
                  >
                    {msg.status === "sending" && (
                      <span className="italic opacity-70">Sending…</span>
                    )}
                    <span>{msg.createdAt}</span>
                    {/* Read receipts — only on sent messages */}
                    {msg.isMe && msg.status !== "failed" && (
                      <span aria-hidden="true">
                        {msg.isRead ? (
                          <CheckCheck className="w-3 h-3 text-cyan-300 inline" />
                        ) : (
                          <Check className="w-3 h-3 inline opacity-70" />
                        )}
                      </span>
                    )}
                  </div>

                  {/* Retry CTA on failed send */}
                  {msg.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => state.handleRetryMessage(msg.id)}
                      className="block w-full text-right text-[10px] text-destructive hover:underline mt-1 font-semibold"
                    >
                      <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                      Failed — tap to retry
                    </button>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}

      {/* Typing bubble — Instagram DM style with peer avatar */}
      {isPeerTyping && (
        <TypingBubble
          avatarSrc={selectedChat?.avatar ?? null}
          name={selectedChat?.name}
        />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Input Area — file attach, offer modal, contact-leak warning
// ─────────────────────────────────────────────────────────────────────────────
function ChatInputArea({ state }: Readonly<ChatPanelProps>) {
  const { walletData } = useWallet();
  const {
    newMessage,
    isChatUserBlocked,
    handleInputChange,
    handleSend,
    showToast,
    handleSendFile,
    handleSendOffer,
    hasActiveDeal,
    uploadProgress,
  } = state;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isOfferModalOpen, setIsOfferModalOpen] = useState(false);
  const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);

  const [offerTitle, setOfferTitle] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerDeliverables, setOfferDeliverables] = useState("");
  const [offerContentDeadline, setOfferContentDeadline] = useState("");
  const [offerPostingDeadline, setOfferPostingDeadline] = useState("");

  const amountVal = Number(offerAmount);
  const isInvalidAmount = Number.isNaN(amountVal) || amountVal < 100 || amountVal > 1000000;
  const isBrand = state.session?.user?.userType === "BRAND";
  const amountPaise = Math.round((amountVal || 0) * 100);

  const sendEligibility = checkOfferAcceptanceEligibility({
    offerAmount: amountPaise,
    userType: isBrand ? "BRAND" : "INFLUENCER",
    walletBalance: walletData?.balance,
    isWalletFrozen: walletData?.isFrozen,
    offerStatus: "PENDING",
  });

  const canSendOffer =
    offerTitle.trim().length > 0 &&
    !isInvalidAmount &&
    !isSubmittingOffer &&
    (isBrand ? sendEligibility.allowed : true);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
    const isVideo = file.type.startsWith("video/");
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
      showToast(
        "error",
        `File too large. Max ${isVideo ? "50 MB" : "5 MB"} for ${isVideo ? "videos" : "images"}.`
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    try {
      const fileUrl = await state.uploadFileWithProgress(file);
      await handleSendFile?.(fileUrl, file.name, file.type);
      showToast("success", "File shared successfully!");
    } catch (err) {
      showToast("error", formatUserError(err, "File sharing failed. Please try again."));
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
    if (Number.isNaN(amountVal) || amountVal <= 0) {
      showToast("error", "Please enter a valid amount");
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    if (offerContentDeadline && offerContentDeadline < todayStr) {
      showToast("error", "Draft submission deadline cannot be in the past");
      return;
    }
    if (offerPostingDeadline && offerPostingDeadline < todayStr) {
      showToast("error", "Live posting deadline cannot be in the past");
      return;
    }
    if (offerContentDeadline && offerPostingDeadline && offerPostingDeadline < offerContentDeadline) {
      showToast("error", "Live posting deadline must be on or after draft submission deadline");
      return;
    }
    setIsSubmittingOffer(true);
    try {
      await handleSendOffer?.({
        title: offerTitle,
        amount: Math.round(amountVal * 100),
        description: offerDescription,
        deliverables: offerDeliverables,
        contentDeadline: offerContentDeadline,
        postingDeadline: offerPostingDeadline,
      });
      showToast("success", USER_SUCCESS_MESSAGES.OFFER_SENT);
      setIsOfferModalOpen(false);
      setOfferTitle("");
      setOfferAmount("");
      setOfferDescription("");
      setOfferDeliverables("");
      setOfferContentDeadline("");
      setOfferPostingDeadline("");
    } catch (err) {
      showToast("error", formatUserError(err, "Failed to send offer. Please try again."));
    } finally {
      setIsSubmittingOffer(false);
    }
  };

  // Blocked state
  if (isChatUserBlocked) {
    return (
      <div className="p-4 border-t border-border bg-card shrink-0">
        <div className="font-bold text-xs text-destructive px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-xl text-center">
          🚫 Messaging disabled — a block relationship exists with this account.
        </div>
      </div>
    );
  }

  // No active deal state
  if (!hasActiveDeal) {
    return (
      <div className="p-4 border-t border-border bg-card shrink-0">
        <div className="font-semibold text-xs text-pending px-4 py-3 bg-pending-muted border border-pending-border rounded-xl text-center flex items-center justify-center gap-2">
          <Lock className="w-3.5 h-3.5" />
          Messaging is enabled once an application or campaign deal is initiated.
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border bg-card shrink-0">
      {/* Upload progress bar — rendered when upload is in progress */}
      {uploadProgress !== null && uploadProgress > 0 && (
        <UploadProgressBar progress={uploadProgress} />
      )}

      {/* Contact leak warning */}
      <ContactLeakWarningBanner leakResult={state.contactLeakResult} />

      {/* Input row */}
      <div className="p-3.5 sm:p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,application/pdf"
            onChange={handleFileChange}
            className="hidden"
            id="chat-file-upload"
            disabled={isUploading}
          />

          {/* Attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={`w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors shrink-0 cursor-pointer ${
              isUploading
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
            aria-label="Attach file or image"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Custom offer button */}
          <button
            type="button"
            onClick={() => setIsOfferModalOpen(true)}
            className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0 cursor-pointer"
            aria-label="Create custom offer"
            title="Send Custom Collaboration Proposal"
          >
            <Handshake className="w-4 h-4" />
          </button>

          {/* Text input */}
          <input
            type="text"
            value={newMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message… (Enter to send)"
            className="flex-1 min-h-[44px] py-2.5 px-4 rounded-2xl border border-input bg-muted/40 text-foreground placeholder:text-muted-foreground text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:bg-card transition-all"
            aria-label="Type a message"
          />

          {/* Send button */}
          <Button
            type="submit"
            variant="primary"
            disabled={!newMessage.trim()}
            className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center shrink-0 shadow-sm disabled:opacity-40 p-0 cursor-pointer"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {/* Offer creation modal */}
      {isOfferModalOpen && (
        <Modal
          open={isOfferModalOpen}
          onClose={() => setIsOfferModalOpen(false)}
          title="Create Custom Collaboration Proposal"
          maxWidth="540px"
        >
          <form onSubmit={handleCreateOfferSubmit} className="space-y-4 pt-2">
            <Input
              id="offer-title"
              label="Proposal Title"
              value={offerTitle}
              onChange={(e) => setOfferTitle(e.target.value)}
              placeholder="e.g. Festive Campaign Reel + 2 Stories"
              required
              fullWidth
            />
            <Input
              id="offer-amount"
              label="Proposed Amount (₹ INR)"
              type="number"
              value={offerAmount}
              onChange={(e) => setOfferAmount(e.target.value)}
              placeholder="e.g. 25000"
              required
              fullWidth
            />
            <Textarea
              id="offer-description"
              label="Scope & Details"
              value={offerDescription}
              onChange={(e) => setOfferDescription(e.target.value)}
              placeholder="Detail the scope of work, content tone, and requirements…"
              fullWidth
            />
            <Input
              id="offer-deliverables"
              label="Deliverables Summary"
              value={offerDeliverables}
              onChange={(e) => setOfferDeliverables(e.target.value)}
              placeholder="e.g. 1 Reel (60s), 2 Stories with link stickers"
              fullWidth
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                id="offer-draft-deadline"
                label="Draft Submission Due"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                max={offerPostingDeadline || undefined}
                value={offerContentDeadline}
                onChange={(e) => setOfferContentDeadline(e.target.value)}
                fullWidth
              />
              <Input
                id="offer-post-deadline"
                label="Live Posting Due"
                type="date"
                min={offerContentDeadline || new Date().toISOString().slice(0, 10)}
                value={offerPostingDeadline}
                onChange={(e) => setOfferPostingDeadline(e.target.value)}
                fullWidth
              />
            </div>
            {isBrand && !sendEligibility.allowed && sendEligibility.reason && (
              <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex flex-col gap-1">
                <span className="font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {sendEligibility.reason}
                </span>
                {sendEligibility.ctaText && sendEligibility.ctaHref && (
                  <Link href={sendEligibility.ctaHref} className="text-primary underline font-bold">
                    {sendEligibility.ctaText} →
                  </Link>
                )}
              </div>
            )}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setIsOfferModalOpen(false)}
                className="w-full sm:w-auto min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!canSendOffer}
                className="w-full sm:w-auto min-h-[44px] font-bold"
              >
                {isSubmittingOffer ? "Sending..." : "Send Proposal"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report User Modal — unchanged behavior, refreshed layout
// ─────────────────────────────────────────────────────────────────────────────
export function ReportUserModal({ state }: Readonly<ChatPanelProps>) {
  const {
    isReportModalOpen,
    setIsReportModalOpen,
    reportReason,
    setReportReason,
    reportDescription,
    setReportDescription,
    handleReportSubmit,
    submittingReport,
    selectedChat,
  } = state;

  return (
    <Modal
      open={isReportModalOpen}
      onClose={() => setIsReportModalOpen(false)}
      title={`Report ${selectedChat?.name || "User"}`}
    >
      <form onSubmit={handleReportSubmit} className="space-y-4 pt-2">
        <Select
          id="report-reason"
          label="Reason for Report"
          value={reportReason}
          onChange={(e) => setReportReason(e.target.value)}
          required
          fullWidth
        >
          <option value="SPAM">Spam or Unsolicited Commercial Messaging</option>
          <option value="CONTACT_LEAK">Attempting Off-Platform Payment or Contact Leak</option>
          <option value="HARASSMENT">Harassment or Inappropriate Behavior</option>
          <option value="FRAUD">Fraudulent Offer or Fake Deliverables</option>
          <option value="OTHER">Other Terms Violation</option>
        </Select>

        <Textarea
          id="report-details"
          label="Additional Details (Optional)"
          value={reportDescription}
          onChange={(e) => setReportDescription(e.target.value)}
          placeholder="Please provide specific context to help our Trust & Safety team investigate…"
          fullWidth
        />

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-border">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setIsReportModalOpen(false)}
            className="w-full sm:w-auto min-h-[44px]"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={submittingReport || !reportReason.trim()}
            className="w-full sm:w-auto min-h-[44px] font-bold"
          >
            {submittingReport ? "Submitting..." : "Submit Report"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChatPanel — root component
// Layout: DealContextMiniCard (sticky pinned) → ChatHeader → MessageList → ChatInputArea
// ─────────────────────────────────────────────────────────────────────────────
export function ChatPanel({ state }: Readonly<ChatPanelProps>) {
  const { selectedConversation, dealDetails } = state;

  if (!selectedConversation) {
    return (
      <main
        aria-label="Select a conversation"
        className="hidden sm:flex flex-1 flex-col items-center justify-center p-8 bg-card text-center"
      >
        <div className="flex flex-col items-center gap-4 max-w-xs">
          {/* Premium empty state icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-3xl bg-muted/60 border border-border flex items-center justify-center shadow-sm">
              <MessageSquare className="w-9 h-9 text-muted-foreground/60" />
            </div>
            <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-sm">
              <Lock className="w-3 h-3 text-primary-foreground" />
            </span>
          </div>
          <div>
            <h3 className="text-base font-extrabold text-foreground mb-1">
              Messages & Proposals
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Select a conversation to discuss deliverables, review content, or send escrow-backed
              collaboration proposals.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      aria-label="Active conversation"
      className="flex flex-1 flex-col h-full bg-card min-w-0 overflow-hidden"
    >
      {/* 1. Collabr-style sticky deal context banner — ABOVE the header */}
      {dealDetails && <DealContextMiniCard deal={dealDetails} />}

      {/* 2. Chat header with deal chip in subtitle */}
      <ChatHeader state={state} />

      {/* 3. Message scroll area */}
      <MessageList state={state} />

      {/* 4. Input area (includes upload progress + contact leak warning) */}
      <ChatInputArea state={state} />
    </main>
  );
}
