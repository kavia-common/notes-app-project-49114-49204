import React, { useEffect, useRef, useState, useCallback } from "react";
import DOMPurify from "dompurify";
import { debounce } from "../utils/debounce";
import { hasDuplicateTitle, deriveTitleFromContent, isUserProvidedTitle } from "../utils/titleUtils";
import { stripHtml as stripHtmlMetrics, getTextMetricsFromHtml, throttleAnnouncements } from "../utils/textMetrics";

/**
 * PUBLIC_INTERFACE
 * QuickAddNote - Lightweight popup to quickly create a short note.
 * - Opens via FAB click or keyboard shortcut (Ctrl/Cmd+Shift+N when enabled by parent).
 * - Minimal fields: optional title, required content (single textarea).
 * - Character counter with limit (default 280; configurable via prop or env QUICK_ADD_MAX_LENGTH).
 * - Autosaves draft into localStorage while open to prevent accidental loss.
 * - Accessibility: proper dialog semantics, labelledby, aria-modal, Escape to close, focus trap.
 * - Prevents duplicate submissions; disables submit while saving; inline validation for content.
 */
export default function QuickAddNote({
  isOpen,
  onClose,
  onCreate,
  maxLength = getMaxLengthFromEnv(),
  successToast, // function to show existing success toast (optional)
  sanitize = defaultSanitize, // reuse existing sanitization
  notes = [], // parent should pass current notes for duplicate checking
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [metrics, setMetrics] = useState({ words: 0, chars: 0 });
  const countsLiveRef = useRef(null);
  const announceCountsRef = useRef(null);

  // duplicate warning state
  const [dupWarn, setDupWarn] = useState({ isDup: false, msg: "" });
  const debouncedCheckRef = useRef(null);
  const ariaLiveRef = useRef(null);
  const titleRef = useRef(null);
  const modalRef = useRef(null);
  const lastActiveElementRef = useRef(null);

  const DRAFT_KEY = "quick_add_note_draft";

  // setup debounced duplicate checker
  useEffect(() => {
    const fn = ({ value }) => {
      const isDup = hasDuplicateTitle({ title: value, notes, excludeId: null });
      const msg = isDup ? "Warning: A note with this title already exists." : "";
      setDupWarn({ isDup, msg });
      if (ariaLiveRef.current) ariaLiveRef.current.textContent = msg || "";
    };
    debouncedCheckRef.current = debounce(fn, 150);
    return () => {
      try { debouncedCheckRef.current?.cancel?.(); } catch {}
    };
  }, [notes]);

  // Initialize throttled announcer for counters
  useEffect(() => {
    announceCountsRef.current = throttleAnnouncements((msg) => {
      if (countsLiveRef.current) countsLiveRef.current.textContent = msg;
    }, 1000);
    return () => { announceCountsRef.current = null; };
  }, []);

  // Load draft on open; focus first input; remember last active element
  useEffect(() => {
    if (isOpen) {
      lastActiveElementRef.current = document.activeElement;
      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          setTitle(d.title || "");
          setContent(d.content || "");
          const m = getTextMetricsFromHtml(d.content || "");
          setMetrics({ words: m.words, chars: m.chars });
        }
      } catch {
        // ignore
      }
      // focus title; if not available, focus content
      setTimeout(() => {
        if (titleRef.current) titleRef.current.focus();
        else {
          const first = modalRef.current?.querySelector("[data-focus-first]");
          if (first) first.focus();
        }
      }, 0);
    } else {
      // when closing, restore focus
      if (lastActiveElementRef.current && lastActiveElementRef.current.focus) {
        setTimeout(() => {
          try { lastActiveElementRef.current.focus(); } catch {}
        }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Autosave to localStorage while open
  useEffect(() => {
    if (!isOpen) return;
    const draft = { title, content, ts: Date.now() };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore quota
    }
    // update metrics on content changes
    try {
      const m = getTextMetricsFromHtml(content || "");
      setMetrics({ words: m.words, chars: m.chars });
    } catch {}
  }, [isOpen, title, content]);

  // Clear draft on successful submit or explicit close
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  }, []);

  // Close on Escape and trap focus; handle undo/redo keys inside QuickAdd
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e) {
      const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
        return;
      } else if (e.key === "Tab") {
        // focus trap
        const focusable = getFocusable(modalRef.current);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
      // Undo/Redo within textarea: let native handle it but stop bubbling to page
      if (mod) {
        const k = e.key.toLowerCase();
        if (k === "z" || k === "y") {
          e.stopPropagation();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleClose() {
    setError("");
    onClose && onClose();
    // keep draft in storage so user can reopen and continue unless explicitly cleared
  }

  function validate() {
    const trimmed = stripHtml(content).trim();
    if (!trimmed) {
      setError("Content cannot be empty.");
      return false;
    }
    if (maxLength && trimmed.length > maxLength) {
      setError(`Content exceeds limit (${trimmed.length}/${maxLength}).`);
      return false;
    }
    setError("");
    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (saving) return;
    if (!validate()) return;

    // Determine final title (user-provided or derived)
    const provided = (title || "").trim();
    const derived = provided ? provided : deriveTitleFromContent(content);

    // Block on duplicate (final guard) using final title value
    if (hasDuplicateTitle({ title: derived, notes, excludeId: null })) {
      setDupWarn({ isDup: true, msg: "A note with this title already exists." });
      if (ariaLiveRef.current) ariaLiveRef.current.textContent = "A note with this title already exists.";
      setError("A note with this title already exists");
      return;
    }
    try {
      setSaving(true);
      const trimmed = stripHtml(content).trim();
      const safeContent = sanitize(trimmed);
      const note = await onCreate({
        title: derived,
        content: safeContent,
        backgroundColor: backgroundColor || null,
      });
      // Success path
      clearDraft();
      setTitle("");
      setContent("");
      if (successToast) successToast("Note saved successfully");
      setBackgroundColor("");
      onClose && onClose();
      return note;
    } catch (err) {
      setError(err?.message || "Failed to create note.");
    } finally {
      setSaving(false);
    }
  }

  const remaining = maxLength ? Math.max(0, maxLength - stripHtml(content).length) : null;

  if (!isOpen) return null;

  // Live auto-title placeholder and styling
  const autoTitle = !isUserProvidedTitle(title) ? deriveTitleFromContent(content) : "";
  const titlePlaceholder = autoTitle ? `Auto: ${autoTitle}` : "Title (optional)";
  const titleStyle = !isUserProvidedTitle(title) && autoTitle ? { fontStyle: "italic", opacity: 0.8 } : undefined;

  return (
    <div
      className="modal-backdrop quickadd-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickadd-title"
      onClick={handleBackdropClick}
    >
      <div
        className="modal quickadd-modal"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div ref={ariaLiveRef} className="visually-hidden" aria-live="polite" role="status" />
        <div className="modal-header" id="quickadd-title">Quick Add Note</div>
        <form onSubmit={handleSubmit} aria-label="Quick add note form">
          <div className="form-row">
            <label htmlFor="quickadd-input-title">Title (optional)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                id="quickadd-input-title"
                type="text"
                ref={titleRef}
                value={title}
                onChange={(e) => {
                  const v = e.target.value;
                  setTitle(v);
                  const proposal = v.trim() || deriveTitleFromContent(content);
                  debouncedCheckRef.current?.({ value: proposal });
                }}
                placeholder={titlePlaceholder}
                style={titleStyle}
                aria-describedby="quickadd-title-help"
              />
              {dupWarn.isDup ? (
                <span className="chip" title="Duplicate title detected" aria-hidden="true">⚠️</span>
              ) : null}
            </div>
            <div id="quickadd-title-help" className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {dupWarn.isDup ? "A note with this title already exists." : " "}
            </div>
          </div>
          <div className="form-row">
            <label htmlFor="quickadd-input-content">Content</label>
            <div className="rte-toolbar" role="toolbar" aria-label="Quick content tools">
              <button
                type="button"
                className="icon-btn small"
                onClick={() => { try { document.execCommand && document.execCommand("undo"); } catch {} }}
                title="Undo (Ctrl/Cmd+Z)"
                aria-label="Undo (Ctrl/Cmd+Z)"
              >
                ↶ Undo
              </button>
              <button
                type="button"
                className="icon-btn small"
                onClick={() => { try { document.execCommand && document.execCommand("redo"); } catch {} }}
                title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
                aria-label="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
              >
                ↷ Redo
              </button>
            </div>
            <textarea
              id="quickadd-input-content"
              data-focus-first
              value={content}
              onChange={(e) => {
                const v = e.target.value;
                setContent(v);
                const m = getTextMetricsFromHtml(v);
                setMetrics({ words: m.words, chars: m.chars });
                announceCountsRef.current?.(`${m.words} words • ${m.chars} characters`);
                // live duplicate hint based on derived title if user hasn't provided one
                const proposal = isUserProvidedTitle(title) ? title.trim() : deriveTitleFromContent(v);
                debouncedCheckRef.current?.({ value: proposal });
              }}
              placeholder="Write a quick note…"
              rows={4}
              maxLength={undefined /* we enforce manually to allow counter */}
              aria-describedby="quickadd-counter"
              required
            />
            <div id="quickadd-counter" className={`muted quickadd-counter${remaining === 0 ? " limit-reached" : ""}`}>
              {maxLength
                ? `${metrics.chars}/${maxLength} (${metrics.words} words)`
                : `${metrics.words} words • ${metrics.chars} characters`}
            </div>
            <div ref={countsLiveRef} className="visually-hidden" aria-live="polite" role="status" />
            {error ? <div role="alert" className="feedback error" style={{ marginTop: 6 }}>{error}</div> : null}
          </div>
          <div className="modal-actions" style={{ justifyContent: "space-between" }}>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                // close but keep draft (autosave still there)
                handleClose();
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              disabled={saving || dupWarn.isDup}
              aria-disabled={saving || dupWarn.isDup}
            >
              {saving ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Helpers

function getMaxLengthFromEnv() {
  const raw = process.env.REACT_APP_QUICK_ADD_MAX_LENGTH || process.env.REACT_APP_QUICK_ADD_CHAR_LIMIT || "280";
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 280;
}

function defaultSanitize(html) {
  try {
    return DOMPurify.sanitize(String(html || ""), {
      ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "code", "br", "p", "div", "span"],
      ALLOWED_ATTR: [],
    });
  } catch {
    return String(html || "");
  }
}

function stripHtml(s) {
  // Keep legacy callers; delegate to shared util to ensure consistent behavior.
  return stripHtmlMetrics(s);
}

function getFocusable(container) {
  if (!container) return [];
  const selectors = [
    "a[href]",
    "area[href]",
    'input:not([disabled]):not([type="hidden"])',
    "select:not([disabled])",
    "textarea:not([disabled])",
    "button:not([disabled])",
    "iframe",
    "object",
    "embed",
    "[contenteditable]",
    '[tabindex]:not([tabindex="-1"])',
  ];
  return Array.from(container.querySelectorAll(selectors.join(","))).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}
