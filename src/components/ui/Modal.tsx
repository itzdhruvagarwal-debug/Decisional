"use client";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

export interface ModalProps {
  readonly open?: boolean;
  readonly isOpen?: boolean;
  readonly onClose: () => void;
  readonly title?: React.ReactNode;
  readonly maxWidth?: string | undefined;
  readonly className?: string | undefined;
  readonly bodyClassName?: string | undefined;
  readonly children: React.ReactNode;
}

export function Modal({
  open,
  isOpen,
  onClose,
  title,
  maxWidth = "480px",
  className,
  bodyClassName,
  children,
}: ModalProps) {
  const isVisible = Boolean(open ?? isOpen);
  const shouldReduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const uniqueId = React.useId().replace(/:/g, "");
  const modalClass = `modal-container-${uniqueId}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen for Escape key
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isVisible) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [isVisible]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {isVisible && (
        <div className="modal-overlay">
          {/* Backdrop blur overlay */}
          <motion.button
            type="button"
            aria-label="Close modal"
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            onClick={onClose}
          />

          {/* Modal Container */}
          <style>{`
            .${modalClass} {
              max-width: ${maxWidth};
            }
          `}</style>
          <motion.div
            className={`modal-container ${modalClass} ${className || ""}`.trim()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title-id" : undefined}
            initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95, y: shouldReduceMotion ? 0 : 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95, y: shouldReduceMotion ? 0 : 15 }}
            transition={shouldReduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 26 }}
          >
            {/* Header */}
            {title && (
              <div className="modal-header">
                <span id="modal-title-id" className="modal-title">{title}</span>
                <button
                  type="button"
                  className="modal-close-btn"
                  onClick={onClose}
                  aria-label="Close modal"
                >
                  &times;
                </button>
              </div>
            )}

            {/* Body */}
            <div className={`modal-body ${bodyClassName || ""}`.trim()}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export default Modal;
