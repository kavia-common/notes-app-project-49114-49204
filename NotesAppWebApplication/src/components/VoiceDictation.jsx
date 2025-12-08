import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createRecognition,
  getSpeechRecognitionCtor,
  parseRecognitionResult,
  VoiceInsertMode,
} from '../services/voiceToText';

/**
 * PUBLIC_INTERFACE
 * VoiceDictation component
 * A self-contained UI for voice-to-text dictation with:
 * - Microphone start/stop
 * - Language selection
 * - Append/Replace insertion mode
 * - Live status and interim transcript preview
 * - Error handling and permission prompts
 * - Optional Quick Create Note action via onQuickCreate
 *
 * Props:
 * - language: default language tag (default 'en-US')
 * - insertMode: 'append' | 'replace' (default 'append')
 * - onText: function({ text, mode }) called when final text is ready (chunked as recognition returns finals)
 * - onListeningChange: function(boolean) optional, called when listening state changes
 * - onError: function(error) optional
 * - onQuickCreate: function({ text, language }) optional, quick-create flow using last captured final text
 */
export default function VoiceDictation({
  language = 'en-US',
  insertMode = VoiceInsertMode.APPEND,
  onText,
  onListeningChange,
  onError,
  onQuickCreate,
}) {
  const supported = !!getSpeechRecognitionCtor();
  const [lang, setLang] = useState(language);
  const [mode, setMode] = useState(insertMode);
  const [listening, setListening] = useState(false);
  const [permissionHint, setPermissionHint] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [interimPreview, setInterimPreview] = useState('');
  const [lastFinal, setLastFinal] = useState('');
  const recognitionRef = useRef(null);

  const languageOptions = useMemo(
    () => [
      { code: 'en-US', label: 'English (US)' },
      { code: 'en-GB', label: 'English (UK)' },
      { code: 'es-ES', label: 'Español (ES)' },
      { code: 'fr-FR', label: 'Français (FR)' },
      { code: 'de-DE', label: 'Deutsch (DE)' },
      { code: 'hi-IN', label: 'हिन्दी (IN)' },
      { code: 'ja-JP', label: '日本語 (JP)' },
      { code: 'pt-BR', label: 'Português (BR)' },
      { code: 'zh-CN', label: '简体中文 (CN)' },
    ],
    []
  );

  const cleanupRecognition = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.onresult = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onstart = null;
        rec.stop();
      } catch (_) { /* ignore */ }
    }
    recognitionRef.current = null;
  }, []);

  useEffect(() => () => cleanupRecognition(), [cleanupRecognition]);

  const handleStart = useCallback(() => {
    setErrorMsg('');
    setPermissionHint('');
    if (!supported) {
      setErrorMsg('Voice dictation is not supported in this browser. Please try Chrome, Edge, or a Chromium-based browser.');
      onError && onError(new Error('unsupported'));
      return;
    }
    try {
      const rec = createRecognition({ lang, interimResults: true, continuous: true });
      if (!rec) {
        setErrorMsg('Failed to initialize speech recognition. Browser may not support it.');
        onError && onError(new Error('init_failed'));
        return;
      }
      recognitionRef.current = rec;

      rec.onstart = () => {
        setListening(true);
        onListeningChange && onListeningChange(true);
      };

      rec.onresult = (event) => {
        const { finalText, interimText } = parseRecognitionResult(event);
        setInterimPreview(interimText);
        if (finalText) {
          setLastFinal(finalText);
          onText && onText({ text: finalText, mode: mode });
        }
      };

      rec.onerror = (e) => {
        setListening(false);
        onListeningChange && onListeningChange(false);
        setInterimPreview('');
        let msg = e?.error || 'unknown_error';
        if (msg === 'not-allowed') {
          setPermissionHint('Microphone permission denied. Please allow mic access in your browser settings.');
        }
        if (msg === 'service-not-allowed') {
          setPermissionHint('Speech recognition service not allowed. Check site permissions or try a different browser.');
        }
        setErrorMsg(`Voice error: ${msg}`);
        onError && onError(e);
      };

      rec.onend = () => {
        setListening(false);
        onListeningChange && onListeningChange(false);
        setInterimPreview('');
      };

      rec.start();
    } catch (err) {
      setErrorMsg('Could not start dictation. Check microphone permissions and try again.');
      onError && onError(err);
    }
  }, [lang, mode, onText, onListeningChange, onError, supported]);

  const handleStop = useCallback(() => {
    try {
      recognitionRef.current && recognitionRef.current.stop();
    } catch (_) { /* ignore */ }
  }, []);

  const handleToggle = useCallback(() => {
    if (listening) {
      handleStop();
    } else {
      handleStart();
    }
  }, [listening, handleStart, handleStop]);

  const handleQuickCreate = useCallback(() => {
    if (onQuickCreate && lastFinal?.trim()) {
      onQuickCreate({ text: lastFinal.trim(), language: lang });
    }
  }, [onQuickCreate, lastFinal, lang]);

  return (
    <div className="voice-dictation" aria-live="polite">
      <div className="voice-controls">
        <button
          type="button"
          className={`mic-btn ${listening ? 'listening' : ''}`}
          onClick={handleToggle}
          aria-pressed={listening}
          aria-label={listening ? 'Stop dictation' : 'Start dictation'}
          title={listening ? 'Stop dictation' : 'Start dictation'}
        >
          {listening ? '⏹ Stop' : '🎤 Dictate'}
        </button>

        <label className="sr-only" htmlFor="voice-language">Language</label>
        <select
          id="voice-language"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          disabled={listening}
          aria-label="Dictation language"
          title="Dictation language"
        >
          {languageOptions.map((opt) => (
            <option key={opt.code} value={opt.code}>{opt.label}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="voice-insert-mode">Insert mode</label>
        <select
          id="voice-insert-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={listening}
          aria-label="Insert mode"
          title="Insert mode"
        >
          <option value={VoiceInsertMode.APPEND}>Append to note</option>
          <option value={VoiceInsertMode.REPLACE}>Replace note content</option>
        </select>

        {onQuickCreate && (
          <button
            type="button"
            className="quick-create-btn"
            onClick={handleQuickCreate}
            disabled={!lastFinal}
            title="Quick create note from last captured speech"
          >
            ➕ Quick Create
          </button>
        )}
      </div>

      <div className="voice-status">
        {!supported && (
          <div role="alert" className="voice-alert">
            Voice dictation is not supported in this browser. Try Chrome, Edge, or another Chromium-based browser.
          </div>
        )}
        {permissionHint && <div role="status" className="voice-hint">{permissionHint}</div>}
        {errorMsg && <div role="alert" className="voice-error">{errorMsg}</div>}
        {listening && (
          <div className="voice-listening">
            <span className="pulse-dot" aria-hidden="true" /> Listening...
          </div>
        )}
        {interimPreview && (
          <div className="voice-interim">
            <em>Heard:</em> {interimPreview}
          </div>
        )}
      </div>

      <style>{`
        .voice-dictation {
          margin: 0.5rem 0 0.75rem;
          border: 1px solid #e4e4e7;
          border-radius: 8px;
          padding: 0.5rem;
          background: #fafafa;
        }
        .voice-controls {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .mic-btn {
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          cursor: pointer;
        }
        .mic-btn.listening {
          background: #dc2626;
        }
        .quick-create-btn {
          background: #16a34a;
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          cursor: pointer;
        }
        select {
          padding: 0.4rem 0.5rem;
          border-radius: 6px;
          border: 1px solid #d4d4d8;
          background: white;
        }
        .voice-status {
          margin-top: 0.4rem;
          display: grid;
          gap: 0.25rem;
        }
        .voice-listening {
          color: #065f46;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-weight: 600;
        }
        .pulse-dot {
          width: 10px;
          height: 10px;
          background: #10b981;
          border-radius: 50%;
          display: inline-block;
          animation: pulse 1.2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.4); opacity: 0.5; }
          100% { transform: scale(1); opacity: 0.9; }
        }
        .voice-interim {
          color: #334155;
          font-size: 0.95rem;
          background: #f1f5f9;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
        }
        .voice-error {
          color: #b91c1c;
          background: #fee2e2;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
        }
        .voice-alert, .voice-hint {
          color: #6b7280;
          background: #f3f4f6;
          padding: 0.35rem 0.5rem;
          border-radius: 6px;
        }
        .sr-only {
          position: absolute !important;
          height: 1px; width: 1px;
          overflow: hidden;
          clip: rect(1px, 1px, 1px, 1px);
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
