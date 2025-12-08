import React, { useEffect, useRef } from "react";

/**
 * PUBLIC_INTERFACE
 * SuccessToast - A minimal, non-intrusive success toast/banner.
 * - Accessible via ARIA live region (polite).
 * - Auto-hides after `duration` ms.
 * - Debounces/coalesces rapid updates by resetting the timer on same message.
 */
export default function SuccessToast({
  message,
  visible,
  duration = Number(process.env.REACT_APP_SAVE_SUCCESS_TOAST_MS || 2000),
  onHide,
}) {
  /** This component renders a subtle success banner/toast. It auto-dismisses after `duration`. */
  const timerRef = useRef(null);
  const lastMessageRef = useRef("");

  useEffect(() => {
    // Clear previous timer on prop changes
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (visible && message) {
      // Remember last message so subsequent identical messages coalesce by resetting timer
      if (lastMessageRef.current !== message) {
        lastMessageRef.current = message;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onHide && onHide();
      }, duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible, message, duration, onHide]);

  if (!visible || !message) return null;

  return (
    <div
      className="success-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="success-toast__icon" aria-hidden="true">✓</span>
      <span className="success-toast__msg">{message}</span>
    </div>
  );
}
