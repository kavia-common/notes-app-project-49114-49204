//
// Utilities for title normalization and duplicate detection
//

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
