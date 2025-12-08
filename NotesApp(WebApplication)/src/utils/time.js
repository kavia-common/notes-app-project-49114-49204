//
// Time utilities for formatting and parsing dates consistently across the app.
//
// PUBLIC_INTERFACE
export function formatRelative(input) {
  /** Returns a concise relative time string like "just now", "2m ago", "3h ago", "yesterday", "3d ago" */
  const date = parseDate(input);
  if (!date) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const absMs = Math.abs(diffMs);

  const sec = 1000;
  const min = 60 * sec;
  const hour = 60 * min;
  const day = 24 * hour;

  if (absMs < 30 * sec) return "just now";
  if (absMs < min) return `${Math.round(absMs / sec)}s ago`;
  if (absMs < hour) return `${Math.round(absMs / min)}m ago`;
  if (absMs < day) return `${Math.round(absMs / hour)}h ago`;

  // Handle yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDate(date, yesterday)) return "yesterday";

  const days = Math.round(absMs / day);
  return `${days}d ago`;
}

// PUBLIC_INTERFACE
export function formatExact(input) {
  /** Returns ISO 8601 string for tooltip or logs, or empty string if invalid */
  const d = parseDate(input);
  return d ? d.toISOString() : "";
}

// PUBLIC_INTERFACE
export function parseDate(input) {
  /** Parses input (Date|string|number) to a Date object, or null if invalid */
  if (!input && input !== 0) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input === "number") {
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof input === "string") {
    // Allow ISO or other Date-parsable formats
    const d = new Date(input);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function sameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
