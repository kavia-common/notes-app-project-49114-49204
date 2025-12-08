//
// Voice-to-Text service using Web Speech API with graceful fallback.
//
// Provides a simple abstraction to create a speech recognition instance,
// manage session, and emit callbacks for results, errors and status.
//
/* eslint-disable no-undef */

// PUBLIC_INTERFACE
export function getSpeechRecognitionCtor() {
  /** Returns the browser's SpeechRecognition constructor or null if unsupported. */
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition || null;
  return SpeechRecognition || null;
}

// PUBLIC_INTERFACE
export function createRecognition(opts = {}) {
  /** Create and configure a SpeechRecognition instance or return null if unsupported. */
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = opts.lang || 'en-US';
  recognition.interimResults = opts.interimResults ?? true;
  recognition.continuous = opts.continuous ?? true;
  recognition.maxAlternatives = 1;
  return recognition;
}

/**
 * Format transcript from a SpeechRecognitionEvent into { finalText, interimText }.
 * @param {SpeechRecognitionEvent} event
 * @returns {{finalText: string, interimText: string}}
 */
export function parseRecognitionResult(event) {
  let interimText = '';
  let finalText = '';
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const res = event.results[i];
    const text = res[0]?.transcript ?? '';
    if (res.isFinal) {
      finalText += text;
    } else {
      interimText += text;
    }
  }
  return { finalText: (finalText || '').trim(), interimText: (interimText || '').trim() };
}

export const VoiceInsertMode = Object.freeze({
  APPEND: 'append',
  REPLACE: 'replace',
});

/**
 * Helper to safely join strings with a space.
 * @param {string} base
 * @param {string} addition
 */
export function appendWithSpace(base, addition) {
  const a = (base || '').trim();
  const b = (addition || '').trim();
  if (!a) return b;
  if (!b) return a;
  return `${a} ${b}`;
}
