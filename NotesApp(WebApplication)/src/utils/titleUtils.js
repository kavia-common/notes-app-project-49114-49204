//
// Utilities for title normalization, derivation and duplicate detection
//
import { stripHtml } from "./textMetrics";

// PUBLIC_INTERFACE
export function normalizeTitle(raw) {
  /** Normalize a title: trim, collapse internal whitespace, and lowercase (unless overridden by env). */
  const allowCaseSensitive = String(process.env.REACT_APP_TITLE_MATCH_CASE_SENSITIVE || "").toLowerCase() === "true";
  if (typeof raw !== "string") return "";
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return allowCaseSensitive ? collapsed : collapsed.toLowerCase();
}

// PUBLIC_INTERFACE
export function hasDuplicateTitle({ title, notes, excludeId = null }) {
  /**
   * Returns true if another note exists with the same normalized title.
   * - Excludes trashed notes from duplicate consideration.
   * - Excludes the same note by id (for edit scenarios).
   */
  const target = normalizeTitle(title);
  if (!target) return false;
  const allowDupEnv = String(process.env.REACT_APP_ALLOW_DUPLICATE_TITLES || "").toLowerCase() === "true";
  if (allowDupEnv) return false;

  for (const n of Array.isArray(notes) ? notes : []) {
    if (!n || n.trashed) continue;
    if (excludeId != null && String(n.id) === String(excludeId)) continue;
    const nt = normalizeTitle(n.title || "");
    if (nt && nt === target) return true;
  }
  return false;
}

// PUBLIC_INTERFACE
export function deriveTitleFromContent(html, { maxLength = 80 } = {}) {
  /** Derive a title from the first non-empty line of sanitized content (HTML stripped). */
  const plain = stripHtml(String(html || ""));
  const lines = plain.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const line = (lines[0] || "").replace(/\s+/g, " ").trim();
  if (!line) return "";
  const truncated = line.length > maxLength ? `${line.slice(0, maxLength)}…` : line;
  return truncated;
}

// PUBLIC_INTERFACE
export function isUserProvidedTitle(titleState) {
  /** Returns true if the current title input is non-empty after trimming. */
  return String(titleState || "").trim().length > 0;
}
