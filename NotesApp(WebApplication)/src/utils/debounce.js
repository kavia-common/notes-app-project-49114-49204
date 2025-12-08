//
// Simple debounce utility with cancel and flush controls
//
// PUBLIC_INTERFACE
export function debounce(fn, wait = 1000) {
  /** Debounce a function, exposing cancel() and flush() helpers. */
  let t = null;
  let lastArgs = null;
  let lastThis = null;
  const debounced = function (...args) {
    lastArgs = args;
    lastThis = this;
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn.apply(lastThis, lastArgs);
      lastArgs = lastThis = null;
    }, Number.isFinite(wait) && wait >= 0 ? wait : 1000);
  };
  debounced.cancel = () => {
    if (t) {
      clearTimeout(t);
      t = null;
    }
    lastArgs = lastThis = null;
  };
  debounced.flush = () => {
    if (t) {
      clearTimeout(t);
      t = null;
      fn.apply(lastThis, lastArgs);
      lastArgs = lastThis = null;
    }
  };
  return debounced;
}
