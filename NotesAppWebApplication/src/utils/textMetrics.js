//
// Lightweight text metrics utilities: HTML stripping, word and char counts,
// and helper to compute metrics from HTML content.
//
// Counting rules:
// - Words: sequences of non-whitespace characters separated by whitespace.
// - Characters: visible text length after stripping tags (no HTML markup).
//
// PUBLIC_INTERFACE
export function stripHtml(input) {
  /** Remove HTML tags from a string and return only the visible text. */
  if (input == null) return "";
  // Fast path for plain text
  if (typeof input !== "string") return String(input || "");
  // Use a simple tag stripper; DOM approach would require DOM, this works for our allowed tags
  const noTags = input.replace(/<[^>]*>/g, "");
  // Decode some common entities minimally to approximate visible text length
  // We keep it lightweight; DOMParser could be heavier for frequent calls.
  return noTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

// PUBLIC_INTERFACE
export function countWords(text) {
  /** Count words in a plain text string (whitespace-delimited tokens). */
  if (!text) return 0;
  const t = String(text).trim();
  if (!t) return 0;
  // Match sequences of non-whitespace characters
  const tokens = t.split(/\s+/g);
  return tokens.filter(Boolean).length;
}

// PUBLIC_INTERFACE
export function countChars(text) {
  /** Count visible characters in a plain text string. */
  if (!text) return 0;
  return String(text).length;
}

// PUBLIC_INTERFACE
export function getTextMetricsFromHtml(html) {
  /**
   * Compute { words, chars, plain } from an HTML string:
   * - strips tags
   * - words: sequences of non-whitespace characters
   * - chars: visible text characters
   */
  const plain = stripHtml(String(html || ""));
  return {
    words: countWords(plain),
    chars: countChars(plain),
    plain,
  };
}

/**
 * Throttle helper for metrics announcement to screen readers.
 * Returns a function that, when called with a string, will only invoke cb
 * at most once per 'intervalMs'. Subsequent calls within the window will
 * replace the pending message but not exceed the rate.
 */
export function throttleAnnouncements(cb, intervalMs = 1000) {
  let lastTs = 0;
  let queued = null;
  let timer = null;

  function flush() {
    timer = null;
    if (queued == null) return;
    cb(queued);
    lastTs = Date.now();
    queued = null;
  }

  return function announce(msg) {
    const now = Date.now();
    const delta = now - lastTs;

    if (delta >= intervalMs && !timer) {
      cb(msg);
      lastTs = now;
      queued = null;
      return;
    }

    // Queue latest and ensure a timer will flush it
    queued = msg;
    if (!timer) {
      const wait = Math.max(0, intervalMs - delta);
      timer = setTimeout(flush, wait);
    }
  };
}
