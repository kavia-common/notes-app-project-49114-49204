import React, { useEffect, useRef, useState } from "react";

/**
 * PUBLIC_INTERFACE
 * FontSizeSelector renders a labeled, accessible select control to choose text size.
 * - Options: small, medium, large
 * - Persists preference to localStorage
 * - Applies data-font-size attribute on document.documentElement
 * - Announces changes via a polite ARIA live region
 */
export default function FontSizeSelector({ id = "font-size-select" }) {
  const validSizes = ["small", "medium", "large"];
  const STORAGE_KEY = "notesapp.fontSize";
  const envDefault = (process.env.REACT_APP_DEFAULT_FONT_SIZE || "").toLowerCase();
  const envDefaultValidated = validSizes.includes(envDefault) ? envDefault : "medium";

  const [size, setSize] = useState(envDefaultValidated);
  const liveRef = useRef(null);

  // Restore from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && validSizes.includes(saved)) {
        setSize(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  // Apply to :root and persist
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-font-size", size);
    try {
      localStorage.setItem(STORAGE_KEY, size);
    } catch {
      // ignore
    }
    if (liveRef.current) {
      liveRef.current.textContent = `Text size set to ${size}`;
    }
  }, [size]);

  return (
    <div className="font-size-control" role="group" aria-label="Text size">
      <label htmlFor={id}>Text size</label>
      <select
        id={id}
        value={size}
        onChange={(e) => {
          const next = e.target.value;
          if (validSizes.includes(next)) setSize(next);
        }}
        aria-label="Select text size"
      >
        <option value="small">Small</option>
        <option value="medium">Medium (default)</option>
        <option value="large">Large</option>
      </select>
      <div ref={liveRef} className="visually-hidden" aria-live="polite" aria-atomic="true" />
    </div>
  );
}
