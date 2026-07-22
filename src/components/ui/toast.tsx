import React from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export interface ToastProps {
  toast: ToastItem;
  onClose: (id: string) => void;
}

export function getToastBg(type: ToastType): string {
  if (type === "success") return "linear-gradient(135deg, #059669, #10b981)";
  if (type === "error") return "linear-gradient(135deg, #dc2626, #ef4444)";
  return "linear-gradient(135deg, #2563eb, #3b82f6)";
}

export function getToastIcon(type: ToastType): string {
  if (type === "success") return "✓ ";
  if (type === "error") return "✕ ";
  return "ℹ ";
}

export function Toast({ toast, onClose }: Readonly<ToastProps>) {
  const bg = getToastBg(toast.type);
  const icon = getToastIcon(toast.type);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="text-sm font-medium flex items-center justify-between w-full" style={{ padding: "12px 20px", borderRadius: "10px", color: "#fff", background: bg, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", animation: "slideInRight 0.3s ease-out" }}
    >
      <span>
        {icon}
        {toast.message}
      </span>
      <button
        onClick={() => onClose(toast.id)}
        aria-label={`Dismiss ${toast.type} notification`}
        className="cursor-pointer text-sm border-none leading-none" style={{ background: "none", color: "#fff", marginLeft: "8px", opacity: 0.7, padding: "0 4px" }}
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onClose }: Readonly<{ toasts: ToastItem[]; onClose: (id: string) => void }>) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-label="Notifications"
      className="fixed flex flex-col gap-2" style={{ top: 24, right: 24, zIndex: 9999, maxWidth: "400px" }}
    >
      {toasts.map(t => (
        <Toast key={t.id} toast={t} onClose={onClose} />
      ))}
    </div>
  );
}

export function useToasts() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = React.useCallback((type: ToastType, message: string) => {
    const id = typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Date.now() % 10000}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), 5000);
  }, [removeToast]);

  return { toasts, showToast, removeToast };
}
