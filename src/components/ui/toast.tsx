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

export function getToastIcon(type: ToastType): string {
  if (type === "success") return "✓ ";
  if (type === "error") return "✕ ";
  return "ℹ ";
}

export function Toast({ toast, onClose }: Readonly<ToastProps>) {
  const icon = getToastIcon(toast.type);

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`app-toast app-toast-${toast.type} text-sm font-medium flex items-center justify-between w-full rounded-lg text-white`}
    >
      <span>
        {icon}
        {toast.message}
      </span>
      <button
        type="button"
        onClick={() => onClose(toast.id)}
        aria-label={`Dismiss ${toast.type} notification`}
        className="app-toast-close cursor-pointer text-sm border-none leading-none bg-none text-white ml-2 opacity-70"
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
      className="app-toast-container fixed flex flex-col gap-2"
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
