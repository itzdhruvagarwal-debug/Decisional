"use client";

import { Suspense } from "react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { ToastContainer } from "@/components/ui/toast";
import { useMessages } from "@/components/dashboard/messages/useMessages";
import { ConversationsSidebar } from "@/components/dashboard/messages/ConversationsSidebar";
import { ChatPanel, ReportUserModal } from "@/components/dashboard/messages/ChatPanel";

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
        className="card flex overflow-hidden p-0 bg-primary"
        style={{ height: "calc(100vh - 120px)" }}
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
