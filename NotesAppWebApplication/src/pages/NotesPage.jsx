import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import DOMPurify from "dompurify";
import {
  listNotes,
  listCategories,
  createNote,
  deleteNote,
  updateNote,
  searchNotes,
  applySearchHighlight,
  SEARCH_STORAGE_KEY,
  _internal,
  uploadAttachment,
  deleteAttachment,

  clearReminder,
  listDueReminders,
  markDueAsFired,
  dismissReminder,
  snoozeReminder,
  togglePin,
  toggleFavorite,
  archiveNote,
  unarchiveNote,
  unlockNoteForSession,
  relockNoteInSession,
  isNoteLocked,
} from "../services/notesService";
import { debounce } from "../utils/debounce";
import { hasDuplicateTitle, normalizeTitle } from "../utils/titleUtils";
import { isOnline, subscribeConnectivity, backgroundSync } from "../services/offlineSyncService";
import "./notes.css";
import VoiceDictation from "../components/VoiceDictation";
import ConnectivityStatus from "../components/ConnectivityStatus";
import HandwritingCanvas from "../components/HandwritingCanvas";
import NoteCount from "../components/NoteCount";
import SuccessToast from "../components/SuccessToast";
import QuickAddNote from "../components/QuickAddNote";
import { NOTE_TEMPLATES, getTemplateById } from "../templates/templates";
import {
  exportAllNotesAsTXT,
  exportAllNotesAsPDF,
  exportAllNotesAsJSON,
  exportNotesAsZIP,
  exportNoteAsTXT,
  exportNoteAsPDF,
} from "../services/exportService";
import { VoiceInsertMode, appendWithSpace } from "../services/voiceToText";
import {
  listBackups,
  getLatestBackupMeta,
  backupNow as backupNowSvc,
  restoreFromLatest as restoreFromLatestSvc,

  scheduleAutomaticBackupsDaily,
  exportLatestBackupToFile,
  importBackupFromFile,
} from "../services/backupService";
import {
  listNoteVersions,
  getNoteVersion,
  diffNoteVersion,
  revertNoteToVersion,
} from "../services/notesService";

// PUBLIC_INTERFACE
export default function NotesPage() {
  /** NotesPage renders a notes list with create/edit, sorting, category organization, attachments, and reminders. */
  const [notes, setNotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [newNoteCatsInput, setNewNoteCatsInput] = useState("");
  const [newNoteAttachments, setNewNoteAttachments] = useState([]); // local unsaved attachments (data URLs)
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [creating, setCreating] = useState(false);

  // Auto-save state for Create form
  const [autoSaveStatus, setAutoSaveStatus] = useState(""); // "", "saving", "saved", "offline"
  const [autoSavedNoteId, setAutoSavedNoteId] = useState(null); // after first create
  const autoSaveDebouncerRef = useRef(null);
  const autoSaveOnlineUnsubRef = useRef(null);
  const DEBOUNCE_MS = (() => {
    const raw = process.env.REACT_APP_AUTOSAVE_DEBOUNCE_MS;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 1000;
  })();

  // Handwriting UI state
  const [showHandwriting, setShowHandwriting] = useState(false);
  const handwritingRef = useRef(null);

  // Reminders form state for create
  const [reminderDate, setReminderDate] = useState(""); // yyyy-mm-dd
  const [reminderTime, setReminderTime] = useState(""); // HH:mm
  const [reminderRepeat, setReminderRepeat] = useState("none"); // none|daily|weekly
  // Reminders form state for edit
  const [editReminderDate, setEditReminderDate] = useState("");
  const [editReminderTime, setEditReminderTime] = useState("");
  const [editReminderRepeat, setEditReminderRepeat] = useState("none");

  // Toast notifications queue (in-app)
  const [toasts, setToasts] = useState([]);

  // Success toast state (for save success)
  const [saveSuccessToast, setSaveSuccessToast] = useState({
    visible: false,
    message: "",
  });
  const showSaveSuccess = useCallback((msg = "Note saved successfully") => {
    // Coalesce: if already visible with same message, just refresh visibility to reset timer.
    setSaveSuccessToast((prev) => ({
      visible: true,
      message: msg || prev.message || "Note saved successfully",
    }));
  }, []);
  const hideSaveSuccess = useCallback(() => {
    setSaveSuccessToast({ visible: false, message: "" });
  }, []);

  // Sorting and filter state (persist to URL)
  const [sortBy, setSortBy] = useState(() => getParamOrDefault("sort", _internal.DEFAULT_SORT));
  const [selectedCategory, setSelectedCategory] = useState(() =>
    getParamOrDefault("cat", "all")
  );
  // pin/favorite filters: "all" | "pinned" | "favorites"
  const [flagFilter, setFlagFilter] = useState(() =>
    getParamOrDefault("flag", "all")
  );
  const [archivedMode, setArchivedMode] = useState(() =>
    getParamOrDefault("arch", "active")
  );
  const [searchInput, setSearchInput] = useState(() => {
    const fromUrl = getParamOrDefault("q", "");
    if (fromUrl) return fromUrl;
    try {
      return localStorage.getItem(SEARCH_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [debouncedQuery, setDebouncedQuery] = useState(searchInput);

  // Edit modal state
  const [editingNote, setEditingNote] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCatsInput, setEditCatsInput] = useState("");
  const [editAttachments, setEditAttachments] = useState([]); // working copy for modal
  const [savingEdit, setSavingEdit] = useState(false);

  // Lock UI state
  const NOTELOCK_ENABLED = String(process.env.REACT_APP_NOTELOCK_ENABLED ?? "true") !== "false";
  const [lockSetForNote, setLockSetForNote] = useState(null); // note or "__create__"
  const [lockRemoveForNote, setLockRemoveForNote] = useState(null);
  const [unlockForNote, setUnlockForNote] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const pinInputRef = useRef(null);
  const lockAriaLiveRef = useRef(null);

  // Duplicate title detection state
  const [dupCreate, setDupCreate] = useState({ isDup: false, msg: "" });
  const [dupEdit, setDupEdit] = useState({ isDup: false, msg: "" });
  const ariaLiveRef = useRef(null);

  // Debounced checkers
  const debouncedCheckCreateTitleRef = useRef(null);
  const debouncedCheckEditTitleRef = useRef(null);

  // Quick Add popup state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAddMaxLength = (() => {
    const raw = process.env.REACT_APP_QUICK_ADD_MAX_LENGTH || process.env.REACT_APP_QUICK_ADD_CHAR_LIMIT || "280";
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 280;
  })();

  // Voice dictation UI state
  const [isListeningCreate, setIsListeningCreate] = useState(false);
  const [isListeningEdit, setIsListeningEdit] = useState(false);

  // Rich-text editor refs
  const createEditorRef = useRef(null);
  const editEditorRef = useRef(null);

  // Initialize editor contents from state when opening/typing
  useEffect(() => {
    // Set sanitized HTML when content state changes (Create)
    if (createEditorRef.current && typeof content === "string") {
      // Avoid resetting caret if already same
      const sanitized = sanitizeHtml(content);
      if (createEditorRef.current.innerHTML !== sanitized) {
        createEditorRef.current.innerHTML = sanitized || "";
      }
    }
  }, [content]);

  useEffect(() => {
    // For Edit modal
    if (editEditorRef.current && typeof editContent === "string") {
      const sanitized = sanitizeHtml(editContent);
      if (editEditorRef.current.innerHTML !== sanitized) {
        editEditorRef.current.innerHTML = sanitized || "";
      }
    }
  }, [editContent, editingNote]);

  // Template insertion helpers
  function insertTemplateIntoEditor({ templateId, isEdit = false }) {
    const tmpl = getTemplateById(templateId);
    if (!tmpl) return;

    // sanitize via existing sanitizer
    const safeTemplate = sanitizeHtml(tmpl.contentHtml);

    // choose editor/context
    const ref = isEdit ? editEditorRef : createEditorRef;
    if (!ref.current) return;

    const currentHtml = sanitizeHtml(ref.current.innerHTML || "");
    const isEmpty = !currentHtml || currentHtml.replace(/<br\s*\/?>/gi, "").replace(/<div>\s*<\/div>/gi, "").trim() === "";

    let newHtml = "";
    if (isEmpty) {
      newHtml = safeTemplate;
    } else {
      // append with a visual divider
      newHtml = `${currentHtml}<div><br></div><div><span class="muted">---</span></div><div><br></div>${safeTemplate}`;
    }

    // set DOM then state
    ref.current.innerHTML = newHtml;

    if (isEdit) {
      handleEditEditorInput();
    } else {
      handleCreateEditorInput();
    }

    // place caret at top of inserted content (start of editor)
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      const node = ref.current.firstChild || ref.current;
      range.setStart(node, 0);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}

    // trigger autosave by nudging state (create mode)
    if (!isEdit) {
      autoSaveDebouncerRef.current?.({ title, content: sanitizeHtml(ref.current.innerHTML) });
      setAutoSaveStatus(isOnline() ? "saving" : "offline");
    }
  }

  // Handle formatting buttons
  function execFormat(cmd, isEditMode = false) {
    try {
      document.execCommand(cmd, false, null);
    } catch {}
    // Sync state after formatting
    if (isEditMode) {
      handleEditEditorInput();
    } else {
      handleCreateEditorInput();
    }
  }

  // Inline code using <code> wrapper around selection
  function wrapSelectionWithCode(isEditMode = false) {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    // If selection inside code, toggle by unwrapping
    const common = range.commonAncestorContainer;
    const codeAncestor = findAncestorTag(common, "CODE");
    if (codeAncestor) {
      // unwrap
      const parent = codeAncestor.parentNode;
      while (codeAncestor.firstChild) parent.insertBefore(codeAncestor.firstChild, codeAncestor);
      parent.removeChild(codeAncestor);
    } else {
      const code = document.createElement("code");
      try {
        range.surroundContents(code);
      } catch {
        // If can't surround (partial selection across nodes), fallback to execCommand
        document.execCommand("insertHTML", false, `<code>${range.toString()}</code>`);
      }
    }
    if (isEditMode) handleEditEditorInput();
    else handleCreateEditorInput();
  }

  function findAncestorTag(node, tagName) {
    let n = node?.nodeType === 1 ? node : node?.parentNode;
    while (n) {
      if (n.nodeType === 1 && n.tagName === tagName) return n;
      n = n.parentNode;
    }
    return null;
  }

  // Keyboard shortcuts
  // Also listen globally for Quick Add: Ctrl/Cmd+Shift+N
  useEffect(() => {
    function onGlobalKey(e) {
      const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.shiftKey && (e.key === "N" || e.key === "n")) {
        e.preventDefault();
        setQuickAddOpen(true);
      }
    }
    window.addEventListener("keydown", onGlobalKey);
    return () => window.removeEventListener("keydown", onGlobalKey);
  }, []);

  function handleEditorKeyDown(e, isEditMode = false) {
    const isMac = /(Mac|iPhone|iPod|iPad)/i.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod) {
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        execFormat("bold", isEditMode);
      } else if (e.key.toLowerCase() === "i") {
        e.preventDefault();
        execFormat("italic", isEditMode);
      } else if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        execFormat("underline", isEditMode);
      }
    }
  }

  // Editor input handlers sync innerHTML -> state with sanitization and autosave
  function handleCreateEditorInput() {
    if (!createEditorRef.current) return;
    const raw = createEditorRef.current.innerHTML;
    const safe = sanitizeHtml(raw);
    setContent(safe);
    autoSaveDebouncerRef.current?.({ title, content: safe });
    if (!isOnline()) saveDraftToLocal(autoSavedNoteId, { title, content: safe });
    setAutoSaveStatus(isOnline() ? "saving" : "offline");
  }

  function handleEditEditorInput() {
    if (!editEditorRef.current) return;
    const raw = editEditorRef.current.innerHTML;
    const safe = sanitizeHtml(raw);
    setEditContent(safe);
  }

  // HTML sanitization
  function sanitizeHtml(html) {
    try {
      return DOMPurify.sanitize(String(html || ""), {
        ALLOWED_TAGS: ["b", "strong", "i", "em", "u", "code", "br", "p", "div", "span"],
        ALLOWED_ATTR: [],
      });
    } catch {
      return String(html || "");
    }
  }

  // Render with search highlight applied after sanitization
  function renderNoteHtml(html, query) {
    const safe = sanitizeHtml(html);
    return applySearchHighlight(safe, query);
  }

  // PUBLIC_INTERFACE
  const handleDictationTextCreate = useCallback(({ text, mode }) => {
    /** Inserts dictated text into the Create form content field. */
    if (!text || !text.trim()) return;
    if (mode === VoiceInsertMode.REPLACE) {
      setContent(text.trim());
    } else {
      setContent((prev) => appendWithSpace(prev, text));
    }
  }, []);

  // Debounced duplicate checkers (mounted once)
  useEffect(() => {
    const checkCreate = ({ value, notesList }) => {
      const isDup = hasDuplicateTitle({ title: value, notes: notesList, excludeId: null });
      const msg = isDup ? "Warning: A note with this title already exists." : "";
      setDupCreate({ isDup, msg });
      // ARIA live polite
      if (ariaLiveRef.current) ariaLiveRef.current.textContent = msg || "";
    };
    const checkEdit = ({ value, notesList, currentId }) => {
      const isDup = hasDuplicateTitle({ title: value, notes: notesList, excludeId: currentId });
      const msg = isDup ? "Warning: A note with this title already exists." : "";
      setDupEdit({ isDup, msg });
      if (ariaLiveRef.current) ariaLiveRef.current.textContent = msg || "";
    };
    debouncedCheckCreateTitleRef.current = debounce(checkCreate, 150);
    debouncedCheckEditTitleRef.current = debounce(checkEdit, 150);
    return () => {
      try { debouncedCheckCreateTitleRef.current?.cancel?.(); } catch {}
      try { debouncedCheckEditTitleRef.current?.cancel?.(); } catch {}
    };
  }, []);

  // Auto-save debounced function for Create form
  useEffect(() => {
    // Define the actual save routine
    async function performAutoSave(payload) {
      const { title: t, content: c } = payload;
      // validation: prevent empty notes being persisted
      if (!t.trim() && !c.trim()) {
        setAutoSaveStatus("");
        return;
      }

      // Skip create-on-first-save if duplicate title detected for "new" note (no id yet)
      if (!autoSavedNoteId) {
        const dup = hasDuplicateTitle({ title: t, notes, excludeId: null });
        if (dup) {
          setAutoSaveStatus("");
          return; // do not create or save while duplicate exists
        }
      }

      const nowPatch = { updated_at: new Date().toISOString() };

      // If we already have an id, update; else create
      try {
        setAutoSaveStatus("saving");

        // If offline or request likely to fail, cache and show offline
        const online = isOnline();
        if (!online) {
          saveDraftToLocal(autoSavedNoteId, { ...payload, ...nowPatch });
          setAutoSaveStatus("offline");
          return;
        }

        if (autoSavedNoteId) {
          const updated = await updateNote(autoSavedNoteId, { ...payload, ...nowPatch });
          // Reflect latest updated_at in the list if present
          setNotes((prev) =>
            prev.map((n) => (String(n.id) === String(autoSavedNoteId) ? { ...n, ...updated } : n))
          );
          setAutoSaveStatus("saved");
          clearDraftFromLocal(autoSavedNoteId);
          // Show success toast for autosave update
          showSaveSuccess("Note saved successfully");
        } else {
          // First create only when both have some content (title or content non-empty)
          const created = await createNote({ ...payload });
          setAutoSavedNoteId(created.id);
          // Insert into list immediately so user sees it
          setNotes((prev) =>
            _internal.applySortFilter([created, ...prev], {
              sortBy,
              category: selectedCategory,
              query: debouncedQuery,
              archivedMode,
            })
          );
          setAutoSaveStatus("saved");
          clearDraftFromLocal(null);
          // Show success toast for first autosave create
          showSaveSuccess("Note saved successfully");
        }
      } catch (e) {
        // Network/server error -> cache offline and show offline status
        saveDraftToLocal(autoSavedNoteId, { ...payload, ...nowPatch });
        setAutoSaveStatus("offline");
      }
    }

    autoSaveDebouncerRef.current = debounce(performAutoSave, DEBOUNCE_MS);

    // Listen to online to retry sync of cached draft
    autoSaveOnlineUnsubRef.current = subscribeConnectivity(async ({ online }) => {
      if (!online) return;
      // Try to sync cached draft if exists
      const cached = readDraftFromLocal(autoSavedNoteId);
      if (cached) {
        try {
          if (autoSavedNoteId) {
            const updated = await updateNote(autoSavedNoteId, cached);
            setNotes((prev) =>
              prev.map((n) => (String(n.id) === String(autoSavedNoteId) ? { ...n, ...updated } : n))
            );
          } else if (cached.title?.trim() || cached.content?.trim()) {
            const created = await createNote({ title: cached.title || "", content: cached.content || "" });
            setAutoSavedNoteId(created.id);
            setNotes((prev) =>
              _internal.applySortFilter([created, ...prev], {
                sortBy,
                category: selectedCategory,
                query: debouncedQuery,
                archivedMode,
              })
            );
          }
          clearDraftFromLocal(autoSavedNoteId);
          setAutoSaveStatus("saved");
          // Success on background sync of cached autosave
          showSaveSuccess("Note saved successfully");
          await backgroundSync();
        } catch {
          // keep offline status; will retry later
          setAutoSaveStatus("offline");
        }
      }
    });

    return () => {
      // Flush best-effort before unmount
      try {
        autoSaveDebouncerRef.current?.flush?.();
      } catch {}
      autoSaveDebouncerRef.current?.cancel?.();
      if (autoSaveOnlineUnsubRef.current) {
        try { autoSaveOnlineUnsubRef.current(); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [DEBOUNCE_MS, autoSavedNoteId, sortBy, selectedCategory, debouncedQuery, archivedMode]);

  // PUBLIC_INTERFACE
  const handleDictationTextEdit = useCallback(({ text, mode }) => {
    /** Inserts dictated text into the Edit modal content field. */
    if (!text || !text.trim()) return;
    if (mode === VoiceInsertMode.REPLACE) {
      setEditContent(text.trim());
    } else {
      setEditContent((prev) => appendWithSpace(prev, text));
    }
  }, []);

  const handleDictationListeningCreate = useCallback((listening) => setIsListeningCreate(!!listening), []);
  const handleDictationListeningEdit = useCallback((listening) => setIsListeningEdit(!!listening), []);
  const handleDictationError = useCallback((err) => {
    // Keep UX simple; can be replaced by toast system later.
    // eslint-disable-next-line no-alert
    alert(`Voice error: ${err?.error || err?.message || "Unknown error"}`);
  }, []);

  // Versions UI state
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState([]);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [versionPreview, setVersionPreview] = useState(null); // snapshot data
  const [versionDiff, setVersionDiff] = useState(null);
  const [reverting, setReverting] = useState(false);

  // Backup & restore UI state
  const [backups, setBackups] = useState([]);
  const [latestBackup, setLatestBackup] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const backupIntervalRef = useRef(null);
  const [confirmRestoreOpen, setConfirmRestoreOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const createSubmitRef = useRef(null);
  const newAttachInputRef = useRef(null);
  const editAttachInputRef = useRef(null);
  const reminderIntervalRef = useRef(null);

  // URL helpers
  function getParamOrDefault(key, def) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(key) || def;
    } catch {
      return def;
    }
  }
  function setUrlParams(next) {
    try {
      const u = new URL(window.location.href);
      Object.entries(next).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "" || v === "all") {
          u.searchParams.delete(k);
        } else {
          u.searchParams.set(k, v);
        }
      });
      window.history.replaceState({}, "", u.toString());
    } catch {
      // no-op
    }
  }

  // Auto-save draft cache keys
  function getDraftKey(noteId) {
    const idPart = noteId ? String(noteId) : "new";
    return `autosave_note_${idPart}`;
  }
  function saveDraftToLocal(noteId, draft) {
    try {
      localStorage.setItem(getDraftKey(noteId), JSON.stringify(draft));
    } catch {
      // ignore quota errors
    }
  }
  function readDraftFromLocal(noteId) {
    try {
      const raw = localStorage.getItem(getDraftKey(noteId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function clearDraftFromLocal(noteId) {
    try {
      localStorage.removeItem(getDraftKey(noteId));
    } catch {
      // ignore
    }
  }

  // Load notes and categories
  async function loadData(options) {
    setLoading(true);
    try {
      const [list, cats] = await Promise.all([
        searchNotes({
          sortBy: options?.sortBy ?? sortBy,
          category: options?.category ?? selectedCategory,
          query: options?.query ?? debouncedQuery,
          archivedMode: options?.archivedMode ?? archivedMode,
        }),
        listCategories(),
      ]);
      setNotes(Array.isArray(list) ? list : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (e) {
      setFeedback({ type: "error", message: "Failed to load notes." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadData();
      if (!mounted) return;
      // initialize backups state
      try {
        setBackups(listBackups());
        setLatestBackup(getLatestBackupMeta());
      } catch {}
      // run daily auto-backup once on load
      try {
        scheduleAutomaticBackupsDaily();
        setBackups(listBackups());
        setLatestBackup(getLatestBackupMeta());
      } catch {}
    })();
    // refresh latest backup metadata every 60s and run daily check
    backupIntervalRef.current = window.setInterval(() => {
      try {
        scheduleAutomaticBackupsDaily();
        setBackups(listBackups());
        setLatestBackup(getLatestBackupMeta());
      } catch {}
    }, 60_000);
    return () => {
      mounted = false;
      if (backupIntervalRef.current) {
        clearInterval(backupIntervalRef.current);
        backupIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist sort and category filter into URL and reload notes when changed
  useEffect(() => {
    setUrlParams({ sort: sortBy, cat: selectedCategory, q: debouncedQuery, flag: flagFilter, arch: archivedMode });
    loadData({ sortBy, category: selectedCategory, query: debouncedQuery, archivedMode });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, selectedCategory, debouncedQuery]);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Persist search to localStorage
  useEffect(() => {
    try {
      if (searchInput?.trim()) {
        localStorage.setItem(SEARCH_STORAGE_KEY, searchInput);
      } else {
        localStorage.removeItem(SEARCH_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }, [searchInput]);

  // In-app scheduler for local reminders (every 30s)
  useEffect(() => {
    function startInterval() {
      if (reminderIntervalRef.current) return;
      reminderIntervalRef.current = window.setInterval(async () => {
        try {
          const due = await listDueReminders();
          if (due.length) {
            // Mark as fired/advance repeats first
            await markDueAsFired();
            // Show toasts for each due reminder
            due.forEach(({ note }) => {
              enqueueToast({
                id: `toast_${Date.now()}_${note.id}`,
                noteId: note.id,
                title: note.title,
                message: "Reminder due",
              });
            });
            // Refresh notes so statuses reflect
            await loadData();
          }
        } catch {
          // ignore
        }
      }, 30_000);
    }

    startInterval();
    return () => {
      if (reminderIntervalRef.current) {
        clearInterval(reminderIntervalRef.current);
        reminderIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function enqueueToast(t) {
    setToasts((prev) => [t, ...prev].slice(0, 5));
    // auto-remove after 8s
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 8000);
  }

  function resetFeedbackSoon() {
    window.clearTimeout(resetFeedbackSoon._t);
    resetFeedbackSoon._t = window.setTimeout(() => setFeedback(null), 2500);
  }



  async function handleBackupNow() {
    try {
      setBackingUp(true);
      const meta = backupNowSvc({ source: "manual" });
      setBackups(listBackups());
      setLatestBackup(getLatestBackupMeta());
      setFeedback({ type: "success", message: `Backup created (${meta.count} notes).` });
      resetFeedbackSoon();
    } catch (e) {
      setFeedback({ type: "error", message: e?.message || "Failed to create backup." });
      resetFeedbackSoon();
    } finally {
      setBackingUp(false);
    }
  }

  async function handleRestoreLatestConfirmed() {
    try {
      setRestoring(true);
      const result = restoreFromLatestSvc();
      // reload notes/categories from restored state
      await loadData();
      setBackups(listBackups());
      setLatestBackup(getLatestBackupMeta());
      setFeedback({ type: "success", message: `Restored ${result.restored} notes.` });
      resetFeedbackSoon();
      setConfirmRestoreOpen(false);
    } catch (e) {
      setFeedback({ type: "error", message: e?.message || "Failed to restore backup." });
      resetFeedbackSoon();
    } finally {
      setRestoring(false);
    }
  }

  function handleDownloadBackup() {
    try {
      const meta = exportLatestBackupToFile();
      setBackups(listBackups());
      setLatestBackup(getLatestBackupMeta());
      setFeedback({ type: "success", message: `Backup downloaded (${meta.count} notes).` });
      resetFeedbackSoon();
    } catch (e) {
      setFeedback({ type: "error", message: e?.message || "Failed to download backup." });
      resetFeedbackSoon();
    }
  }

  async function handleUploadBackup(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      setImporting(true);
      const meta = await importBackupFromFile(file);
      setBackups(listBackups());
      setLatestBackup(getLatestBackupMeta());
      setFeedback({ type: "success", message: `Backup imported (${meta.count} notes). You can now Restore from latest.` });
      resetFeedbackSoon();
      e.target.value = "";
    } catch (err) {
      setFeedback({ type: "error", message: err?.message || "Invalid backup file." });
      resetFeedbackSoon();
      e.target.value = "";
    } finally {
      setImporting(false);
    }
  }

  const parsedNewNoteCategories = useMemo(() => {
    return splitCategories(newNoteCatsInput);
  }, [newNoteCatsInput]);

  const parsedEditCategories = useMemo(() => {
    return splitCategories(editCatsInput);
  }, [editCatsInput]);

  function splitCategories(input) {
    if (!input) return [];
    return Array.from(
      new Set(
        input
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
  }

  function validateFilesBeforeAdd(files, currentLength) {
    const limit = _internal.ATTACHMENTS_LIMIT_PER_NOTE;
    const maxSize = _internal.ATTACHMENT_MAX_SIZE_BYTES;
    const arr = Array.from(files || []);
    const errors = [];
    const accepted = [];
    for (const f of arr) {
      if (f.size > maxSize) {
        errors.push(`${f.name} is too large (max 10MB)`);
        continue;
      }
      if (currentLength + accepted.length + 1 > limit) {
        errors.push(`Attachment limit reached (${limit})`);
        break;
      }
      accepted.push(f);
    }
    return { accepted, errors };
  }

  async function handleCreateAttachmentsChange(e) {
    const files = e.target.files;
    const { accepted, errors } = validateFilesBeforeAdd(files, newNoteAttachments.length);
    if (errors.length) {
      setFeedback({ type: "error", message: errors[0] });
      resetFeedbackSoon();
    }
    if (accepted.length === 0) return;

    // locally convert to data URL attachment records
    const newOnes = [];
    for (const f of accepted) {
      const url = await fileToDataUrl(f);
      newOnes.push({
        // temporary id, will be persisted on note create
        id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: getTypeFromMime(f.type),
        name: f.name,
        size: f.size,
        mime: f.type || "application/octet-stream",
        url,
        createdAt: new Date().toISOString(),
      });
    }
    setNewNoteAttachments((prev) => [...newOnes, ...prev]);
    // reset input value to allow re-select same files if needed
    if (newAttachInputRef.current) newAttachInputRef.current.value = "";
  }

  function removeNewAttachment(tmpId) {
    setNewNoteAttachments((prev) => prev.filter((a) => String(a.id) !== String(tmpId)));
  }

  function composeReminderISO(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const ts = new Date(`${dateStr}T${timeStr}:00`);
    if (isNaN(ts.getTime())) return null;
    return ts.toISOString();
  }

  // PUBLIC_INTERFACE
  const handleQuickCreateFromSpeech = useCallback(async ({ text }) => {
    /** Creates a new note directly from the captured speech. */
    if (!text?.trim()) return;
    const trimmed = text.trim();
    const autoTitle = trimmed.length > 40 ? `${trimmed.slice(0, 40)}...` : trimmed;
    try {
      const note = await createNote({
        title: autoTitle,
        content: trimmed,
        categories: [],
        attachments: [],
      });
      setNotes((prev) =>
        _internal.applySortFilter([note, ...prev], {
          sortBy,
          category: selectedCategory,
          query: debouncedQuery,
        })
      );
      setFeedback({ type: "success", message: "Note created from speech." });
      resetFeedbackSoon();
    } catch (e) {
      setFeedback({ type: "error", message: e?.message || "Failed to create note from speech." });
      resetFeedbackSoon();
    }
  }, [debouncedQuery, selectedCategory, sortBy, resetFeedbackSoon]);
  
  async function handleCreate(e) {
    e.preventDefault();
    const t = title.trim();
    const c = content.trim();

    // Duplicate block
    if (hasDuplicateTitle({ title: t, notes, excludeId: null })) {
      setDupCreate({ isDup: true, msg: "A note with this title already exists." });
      if (ariaLiveRef.current) ariaLiveRef.current.textContent = "A note with this title already exists.";
      setFeedback({ type: "error", message: "A note with this title already exists" });
      resetFeedbackSoon();
      return;
    }

    if (!t || !c) {
      setFeedback({ type: "error", message: "Title and content are required." });
      resetFeedbackSoon();
      return;
    }
    // Validate future reminder if set
    let reminderPayload;
    if (reminderDate && reminderTime) {
      const iso = composeReminderISO(reminderDate, reminderTime);
      if (!iso || new Date(iso).getTime() <= Date.now()) {
        setFeedback({ type: "error", message: "Reminder time must be in the future." });
        resetFeedbackSoon();
        return;
      }
      reminderPayload = {
        reminderAt: iso,
        repeat: reminderRepeat,
        reminderStatus: "pending",
      };
    }
    try {
      setCreating(true);
      const note = await createNote({
        title: t,
        content: c,
        categories: parsedNewNoteCategories,
        attachments: newNoteAttachments, // local mode persists
        reminder: reminderPayload,
      });
      setNotes((prev) =>
        _internal.applySortFilter([note, ...prev], {
          sortBy,
          category: selectedCategory,
          query: debouncedQuery,
        })
      );
      setTitle("");
      setContent("");
      setNewNoteCatsInput("");
      setNewNoteAttachments([]);
      setReminderDate("");
      setReminderTime("");
      setReminderRepeat("none");
      setFeedback({ type: "success", message: "Note created." });
      // Also show success toast for manual create
      showSaveSuccess("Note saved successfully");
      // refresh categories list
      const cats = await listCategories();
      setCategories(cats);
      resetFeedbackSoon();
      // clear autosave state for a fresh new note
      try { autoSaveDebouncerRef.current?.cancel?.(); } catch {}
      clearDraftFromLocal(autoSavedNoteId);
      setAutoSavedNoteId(null);
      setAutoSaveStatus("");
    } catch (e) {
      setFeedback({ type: "error", message: e?.message || "Failed to create note." });
      resetFeedbackSoon();
    } finally {
      setCreating(false);
    }
  }

  async function loadVersions(noteId) {
    try {
      const list = await listNoteVersions(noteId);
      setVersions(list);
    } catch {
      setVersions([]);
    }
  }

  function resetVersionsUI() {
    setShowVersions(false);
    setVersions([]);
    setSelectedVersionId(null);
    setVersionPreview(null);
    setVersionDiff(null);
    setReverting(false);
  }

  function openEdit(note) {
    setEditingNote(note);
    setEditTitle(note.title || "");
    setEditContent(note.content || "");
    setEditCatsInput(Array.isArray(note.categories) ? note.categories.join(", ") : "");
    setEditAttachments(Array.isArray(note.attachments) ? [...note.attachments] : []);
    // preload reminder fields
    const r = note.reminder;
    if (r?.reminderAt) {
      const d = new Date(r.reminderAt);
      if (!isNaN(d.getTime())) {
        setEditReminderDate(d.toISOString().slice(0, 10));
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        setEditReminderTime(`${hh}:${mm}`);
      } else {
        setEditReminderDate("");
        setEditReminderTime("");
      }
    } else {
      setEditReminderDate("");
      setEditReminderTime("");
    }
    setEditReminderRepeat(r?.repeat || "none");
  }

  function closeEdit() {
    setEditingNote(null);
    setEditTitle("");
    setEditContent("");
    setEditCatsInput("");
    setEditAttachments([]);
    setEditReminderDate("");
    setEditReminderTime("");
    setEditReminderRepeat("none");
    resetVersionsUI();
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingNote) return;
    const t = editTitle.trim();
    const c = editContent.trim();

    // Duplicate block (exclude same note id)
    if (hasDuplicateTitle({ title: t, notes, excludeId: editingNote.id })) {
      setDupEdit({ isDup: true, msg: "A note with this title already exists." });
      if (ariaLiveRef.current) ariaLiveRef.current.textContent = "A note with this title already exists.";
      setFeedback({ type: "error", message: "A note with this title already exists" });
      resetFeedbackSoon();
      return;
    }

    if (!t || !c) {
      setFeedback({ type: "error", message: "Title and content are required." });
      resetFeedbackSoon();
      return;
    }

    // compute reminder update
    let reminderPatch = editingNote.reminder;
    const hasDateTime = editReminderDate && editReminderTime;
    if (hasDateTime) {
      const iso = composeReminderISO(editReminderDate, editReminderTime);
      if (!iso || new Date(iso).getTime() <= Date.now()) {
        setFeedback({ type: "error", message: "Reminder time must be in the future." });
        resetFeedbackSoon();
        return;
      }
      reminderPatch = {
        ...(editingNote.reminder || {}),
        reminderAt: iso,
        repeat: editReminderRepeat || "none",
        reminderStatus: "pending",
      };
    } else {
      reminderPatch = undefined; // clear reminder if either field is empty
    }

    try {
      if (NOTELOCK_ENABLED && editingNote?.lock?.isLocked && isNoteLocked(editingNote)) {
        setFeedback({ type: "error", message: "Unlock this note before saving edits." });
        resetFeedbackSoon();
        return;
      }
      setSavingEdit(true);
      const updated = await updateNote(editingNote.id, {
        title: t,
        content: c,
        categories: parsedEditCategories,
        attachments: editAttachments, // local mode only
        reminder: reminderPatch,
      });
      // Optimistically update list with resort/filter
      setNotes((prev) => {
        const next = prev.map((n) =>
          String(n.id) === String(editingNote.id) ? { ...n, ...updated } : n
        );
        return _internal.applySortFilter(next, {
          sortBy,
          category: selectedCategory,
          query: debouncedQuery,
        });
      });
      setFeedback({ type: "success", message: "Note updated." });
      // Also show success toast for manual update
      showSaveSuccess("Note saved successfully");
      resetFeedbackSoon();
      closeEdit();
      const cats = await listCategories();
      setCategories(cats);
    } catch (e) {
      setFeedback({ type: "error", message: e?.message || "Failed to update note." });
      resetFeedbackSoon();
    } finally {
      setSavingEdit(false);
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    try {
      await deleteNote(confirmDeleteId);
      setNotes((prev) =>
        prev.filter((n) => String(n.id) !== String(confirmDeleteId))
      );
      setFeedback({ type: "success", message: "Note deleted." });
    } catch {
      setFeedback({ type: "error", message: "Failed to delete note." });
    } finally {
      setConfirmDeleteId(null);
      resetFeedbackSoon();
    }
  }

  const createDisabled = creating || !title.trim() || !content.trim();

  const sortOptions = [
    { value: "updated_desc", label: "Updated (newest)" },
    { value: "updated_asc", label: "Updated (oldest)" },
    { value: "created_desc", label: "Created (newest)" },
    { value: "created_asc", label: "Created (oldest)" },
    { value: "title_asc", label: "Title (A→Z)" },
    { value: "title_desc", label: "Title (Z→A)" },
  ];

  const visibleCategories = useMemo(() => ["all", ...categories], [categories]);

  function getTypeFromMime(mime = "") {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("audio/")) return "audio";
    return "file";
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function handleEditAttachmentsChange(e) {
    const files = e.target.files;
    const { accepted, errors } = validateFilesBeforeAdd(files, editAttachments.length);
    if (errors.length) {
      setFeedback({ type: "error", message: errors[0] });
      resetFeedbackSoon();
    }
    if (accepted.length === 0) return;

    // In API mode, attempt upload; local mode convert to dataURL
    if (_internal.useApi && editingNote) {
      try {
        for (const f of accepted) {
          const att = await uploadAttachment(editingNote.id, f);
          setEditAttachments((prev) => [att, ...prev]);
        }
      } catch (err) {
        setFeedback({ type: "error", message: "Attachment upload failed; using local storage." });
        resetFeedbackSoon();
        // fallback to local
        const newOnes = [];
        for (const f of accepted) {
          const url = await fileToDataUrl(f);
          newOnes.push({
            id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: getTypeFromMime(f.type),
            name: f.name,
            size: f.size,
            mime: f.type || "application/octet-stream",
            url,
            createdAt: new Date().toISOString(),
          });
        }
        setEditAttachments((prev) => [...newOnes, ...prev]);
      }
    } else {
      const newOnes = [];
      for (const f of accepted) {
        const url = await fileToDataUrl(f);
        newOnes.push({
          id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: getTypeFromMime(f.type),
          name: f.name,
          size: f.size,
          mime: f.type || "application/octet-stream",
          url,
          createdAt: new Date().toISOString(),
        });
      }
      setEditAttachments((prev) => [...newOnes, ...prev]);
    }
    if (editAttachInputRef.current) editAttachInputRef.current.value = "";
  }

  function removeEditAttachmentLocal(attId) {
    setEditAttachments((prev) => prev.filter((a) => String(a.id) !== String(attId)));
  }

  async function handleRemovePersistedAttachment(noteId, attId) {
    try {
      await deleteAttachment(noteId, attId);
      setEditAttachments((prev) => prev.filter((a) => String(a.id) !== String(attId)));
    } catch {
      setFeedback({ type: "error", message: "Failed to remove attachment." });
      resetFeedbackSoon();
    }
  }

  function renderAttachmentsPreview(list, removable, onRemove) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return (
      <div className="attachments">
        {list.map((a) => (
          <div key={a.id} className="attachment-card">
            {a.type === "image" ? (
              <img src={a.url} alt={a.name} className="attachment-thumb" />
            ) : a.type === "audio" ? (
              <audio controls src={a.url} className="attachment-audio" />
            ) : (
              <div className="attachment-chip" title={a.name}>
                <span className="attachment-name">{a.name}</span>
                <span className="attachment-size">{formatSize(a.size)}</span>
              </div>
            )}
            <div className="attachment-meta">
              <span className="muted">{a.name}</span>
            </div>
            {removable && (
              <button
                type="button"
                className="btn btn-danger attachment-remove"
                aria-label={`Remove attachment ${a.name}`}
                onClick={() => onRemove(a.id)}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let u = 0;
    while (size >= 1024 && u < units.length - 1) {
      size /= 1024;
      u++;
    }
    return `${size.toFixed(size < 10 && u > 0 ? 1 : 0)} ${units[u]}`;
  }

  // Reminder actions on toast
  async function handleToastDismiss(noteId, toastId) {
    try {
      await dismissReminder(noteId);
      await loadData();
    } finally {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }
  }
  async function handleToastSnooze(noteId, toastId, minutes) {
    try {
      await snoozeReminder(noteId, minutes);
      await loadData();
      setFeedback({ type: "success", message: `Snoozed for ${minutes} minutes.` });
      resetFeedbackSoon();
    } catch (e) {
      setFeedback({ type: "error", message: e?.message || "Failed to snooze." });
      resetFeedbackSoon();
    } finally {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }
  }

  function reminderChip(note) {
    const r = note.reminder;
    if (!r?.reminderAt) return null;
    const when = new Date(r.reminderAt);
    if (isNaN(when.getTime())) return null;
    return (
      <span className={`chip chip-reminder status-${r.reminderStatus || "pending"}`} title="Reminder">
        ⏰ {when.toLocaleString()} {r.repeat && r.repeat !== "none" ? `• ${r.repeat}` : ""}
      </span>
    );
  }

  return (
    <div className="notes-app">
      <header className="navbar">
        <div className="brand">Notes <ConnectivityStatus /></div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">Folders</div>
            <ul className="category-list" aria-label="Category filter">
              {visibleCategories.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className={`category-item ${selectedCategory === c ? "active" : ""}`}
                    onClick={() => setSelectedCategory(c)}
                    aria-pressed={selectedCategory === c}
                  >
                    {c === "all" ? "All Notes" : c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="container main">
          <section className="card">
            <div className="toolbar">
              <h2 className="title" style={{ marginBottom: 0 }}>Create a Note</h2>
              <div className="sort-control">
                <label htmlFor="sort-select" className="sr-only">Sort notes</label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort notes"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <form onSubmit={handleCreate} className="note-form" aria-label="Create note form">
              <div className="form-row">
                <div className="template-picker">
                  <label htmlFor="template-select" className="sr-only">Insert template</label>
                  <select
                    id="template-select"
                    defaultValue=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      insertTemplateIntoEditor({ templateId: id, isEdit: false });
                      // reset selection so user can re-insert same template again if desired
                      e.target.value = "";
                    }}
                    aria-label="Insert template"
                  >
                    <option value="" disabled>Insert template…</option>
                    {NOTE_TEMPLATES.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <label htmlFor="note-title">Title</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    id="note-title"
                    type="text"
                    value={title}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTitle(v);
                      // duplicate check (debounced)
                      debouncedCheckCreateTitleRef.current?.({ value: v, notesList: notes });
                      // schedule autosave
                      autoSaveDebouncerRef.current?.({ title: v, content });
                      if (!isOnline()) saveDraftToLocal(autoSavedNoteId, { title: v, content });
                      setAutoSaveStatus(isOnline() ? "saving" : "offline");
                    }}
                    placeholder="Your note title"
                    required
                    aria-required="true"
                    aria-describedby="create-title-help"
                  />
                  {dupCreate.isDup ? (
                    <span className="chip" title="Duplicate title detected" aria-hidden="true">⚠️</span>
                  ) : null}
                  {NOTELOCK_ENABLED && (
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => { setLockSetForNote("__create__"); setPinInput(""); setPinError(""); setTimeout(() => pinInputRef.current?.focus(), 0); }}
                      title="Set a 4-digit PIN for this new note"
                      aria-label="Set a 4-digit PIN for this new note"
                    >
                      🔒 Set PIN
                    </button>
                  )}
                </div>
                <div id="create-title-help" className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {dupCreate.isDup ? "A note with this title already exists." : " "}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="note-content">Content</label>

                <VoiceDictation
                  language="en-US"
                  insertMode={VoiceInsertMode.APPEND}
                  onText={handleDictationTextCreate}
                  onListeningChange={handleDictationListeningCreate}
                  onError={handleDictationError}
                  onQuickCreate={handleQuickCreateFromSpeech}
                />

                {/* Rich text toolbar */}
                <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
                  <button type="button" className="icon-btn" onClick={() => execFormat('bold')} title="Bold (Ctrl/Cmd+B)"><strong>B</strong></button>
                  <button type="button" className="icon-btn" onClick={() => execFormat('italic')} title="Italic (Ctrl/Cmd+I)"><em>I</em></button>
                  <button type="button" className="icon-btn" onClick={() => execFormat('underline')} title="Underline (Ctrl/Cmd+U)"><u>U</u></button>
                  <button type="button" className="icon-btn" onClick={() => wrapSelectionWithCode()} title="Inline code (`)"><code>{`</>`}</code></button>
                </div>

                {/* Contenteditable editor */}
                <div
                  id="note-content"
                  className="rte-editor"
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Note content editor"
                  contentEditable
                  ref={createEditorRef}
                  onInput={handleCreateEditorInput}
                  onKeyDown={handleEditorKeyDown}
                  data-placeholder={isListeningCreate ? "Listening… speak now. Your words will appear here." : "Write something..."}
                />

              </div>
              <div className="form-row">
                <label htmlFor="note-categories">Categories (comma-separated)</label>
                <input
                  id="note-categories"
                  type="text"
                  value={newNoteCatsInput}
                  onChange={(e) => setNewNoteCatsInput(e.target.value)}
                  placeholder="e.g., Work, Ideas"
                  aria-describedby="cats-help"
                />
                <div id="cats-help" className="muted" style={{ fontSize: 12 }}>
                  Assign multiple categories by separating with commas.
                </div>
              </div>

              <div className="form-row">
                <label>Reminder</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <label htmlFor="rem-date" className="sr-only">Reminder date</label>
                    <input
                      id="rem-date"
                      type="date"
                      value={reminderDate}
                      onChange={(e) => setReminderDate(e.target.value)}
                      aria-label="Reminder date"
                    />
                  </div>
                  <div>
                    <label htmlFor="rem-time" className="sr-only">Reminder time</label>
                    <input
                      id="rem-time"
                      type="time"
                      value={reminderTime}
                      onChange={(e) => setReminderTime(e.target.value)}
                      aria-label="Reminder time"
                    />
                  </div>
                  <div>
                    <label htmlFor="rem-repeat" className="sr-only">Repeat</label>
                    <select
                      id="rem-repeat"
                      value={reminderRepeat}
                      onChange={(e) => setReminderRepeat(e.target.value)}
                      aria-label="Reminder repeat"
                    >
                      <option value="none">No repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Reminder must be in the future. Repeat reschedules automatically when it fires.
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="new-attachments">Add attachments</label>
                <input
                  id="new-attachments"
                  ref={newAttachInputRef}
                  type="file"
                  multiple
                  accept="image/*,audio/*,*/*"
                  onChange={handleCreateAttachmentsChange}
                  aria-describedby="attach-help"
                />
                <div id="attach-help" className="muted" style={{ fontSize: 12 }}>
                  Up to {_internal.ATTACHMENTS_LIMIT_PER_NOTE} files, max 10MB each.
                </div>
                {renderAttachmentsPreview(newNoteAttachments, true, removeNewAttachment)}
              </div>

              <div className="actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span
                  role="status"
                  aria-live="polite"
                  className="muted"
                  style={{ minWidth: 140 }}
                  title={
                    autoSaveStatus === "saving"
                      ? "Saving…"
                      : autoSaveStatus === "saved"
                      ? "All changes saved"
                      : autoSaveStatus === "offline"
                      ? "Offline - changes will sync"
                      : ""
                  }
                >
                  {autoSaveStatus === "saving"
                    ? "Saving…"
                    : autoSaveStatus === "saved"
                    ? "Saved"
                    : autoSaveStatus === "offline"
                    ? "Offline - changes will sync"
                    : ""}
                </span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setShowHandwriting(true)}
                  title="Open handwriting canvas"
                >
                  ✍️ Handwriting
                </button>
                <button
                  ref={createSubmitRef}
                  className="btn"
                  type="submit"
                  disabled={createDisabled || dupCreate.isDup}
                  aria-disabled={createDisabled || dupCreate.isDup}
                >
                  {creating ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
            {feedback && (
              <div
                role="status"
                aria-description="feedback"
                className={`feedback ${feedback.type === "error" ? "error" : "success"}`}
              >
                {feedback.message}
              </div>
            )}
            {/* ARIA live region for duplicate title warnings */}
            <div ref={ariaLiveRef} className="visually-hidden" aria-live="polite" role="status" />
          </section>

          <section className="card">
            <div className="toolbar toolbar-wrap">
              <h2 className="title" style={{ marginBottom: 0 }}>Your Notes</h2>
              <NoteCount
                notes={notes}
                currentFilter={
                  archivedMode === "archived"
                    ? "archived"
                    : archivedMode === "active"
                    ? "active"
                    : "all"
                }
                ariaLabelId="notes-counter-label"
              />
              <div className="toolbar-right">
                <div className="search-control">
                  <label htmlFor="search-notes" className="sr-only">Search notes</label>
                  <input
                    id="search-notes"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search notes…"
                    aria-label="Search notes"
                  />
                </div>
                <div className="sort-control">
                  <label htmlFor="sort-select-2" className="sr-only">Sort notes</label>
                  <select
                    id="sort-select-2"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    aria-label="Sort notes"
                  >
                    {sortOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="export-toolbar" role="group" aria-label="Export">
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => exportAllNotesAsTXT(notes, "all-notes.txt")}
                    title="Export all notes as a single TXT"
                    disabled={!notes.length}
                  >
                    Export TXT
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => exportAllNotesAsPDF(notes, "all-notes.pdf")}
                    title="Export all notes as a single PDF"
                    disabled={!notes.length}
                  >
                    Export PDF
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => exportAllNotesAsJSON(notes, "notes-backup.json")}
                    title="Download JSON backup"
                  >
                    Backup JSON
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => exportNotesAsZIP({ notes, formats: ["txt"], fileName: "notes-txt.zip" })}
                    title="ZIP each note as TXT"
                    disabled={!notes.length}
                  >
                    ZIP TXT
                  </button>
                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => exportNotesAsZIP({ notes, formats: ["pdf"], fileName: "notes-pdf.zip" })}
                    title="ZIP each note as PDF"
                    disabled={!notes.length}
                  >
                    ZIP PDF
                  </button>
                </div>
              </div>
            </div>

            {debouncedQuery?.trim() && (
              <div className="muted" style={{ marginBottom: 8 }}>
                Showing results for “{debouncedQuery}”
              </div>
            )}

            {Array.isArray(categories) && categories.length > 0 && (
              <div className="chip-row" aria-label="Quick tag filters">
                {categories.slice(0, 8).map((c) => (
                  <button
                    key={`chip-${c}`}
                    type="button"
                    className={`chip chip-action ${selectedCategory === c ? "active" : ""}`}
                    onClick={() => setSelectedCategory(selectedCategory === c ? "all" : c)}
                    aria-pressed={selectedCategory === c}
                    aria-label={`Filter by tag ${c}`}
                    title={`Filter by tag ${c}`}
                  >
                    #{c}
                  </button>
                ))}
              </div>
            )}

            {/* Flag filter toolbar */}
            <div className="chip-row" role="toolbar" aria-label="Pinned/Favorites filter">
              <button
                type="button"
                className={`chip chip-action ${flagFilter === "all" ? "active" : ""}`}
                onClick={() => setFlagFilter("all")}
                aria-pressed={flagFilter === "all"}
                title="Show all notes"
              >
                All
              </button>
              <button
                type="button"
                className={`chip chip-action ${flagFilter === "pinned" ? "active" : ""}`}
                onClick={() => setFlagFilter("pinned")}
                aria-pressed={flagFilter === "pinned"}
                title="Show pinned notes"
              >
                📌 Pinned
              </button>
              <button
                type="button"
                className={`chip chip-action ${flagFilter === "favorites" ? "active" : ""}`}
                onClick={() => setFlagFilter("favorites")}
                aria-pressed={flagFilter === "favorites"}
                title="Show favorite notes"
              >
                ★ Favorites
              </button>
            </div>

            {/* Archived filter toolbar */}
            <div className="chip-row" role="toolbar" aria-label="Archived filter">
              <button
                type="button"
                className={`chip chip-action ${archivedMode === "active" ? "active" : ""}`}
                onClick={() => setArchivedMode("active")}
                aria-pressed={archivedMode === "active"}
                title="Show active notes"
              >
                Active
              </button>
              <button
                type="button"
                className={`chip chip-action ${archivedMode === "archived" ? "active" : ""}`}
                onClick={() => setArchivedMode("archived")}
                aria-pressed={archivedMode === "archived"}
                title="Show archived notes only"
              >
                Archived
              </button>
              <button
                type="button"
                className={`chip chip-action ${archivedMode === "all" ? "active" : ""}`}
                onClick={() => setArchivedMode("all")}
                aria-pressed={archivedMode === "all"}
                title="Show all notes (active + archived)"
              >
                All
              </button>
            </div>

            {loading ? (
              <div className="muted">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="muted">No notes. Try different filters or create one above.</div>
            ) : (
              <ul className="notes-list">
                {notes
                  .filter((n) =>
                    flagFilter === "all"
                      ? true
                      : flagFilter === "pinned"
                      ? !!n.pinned
                      : !!n.favorite
                  )
                  .map((n) => (
                  <li key={n.id} className="note-item">
                    <div className="note-meta">
                      <div className="note-title">
                        <span
                          dangerouslySetInnerHTML={{ __html: applySearchHighlight(n.title, debouncedQuery) }}
                        />
                        {n.lock?.isLocked ? <span className="chip chip-locked" title="Locked" aria-label="Locked">🔒</span> : null}
                        {n.archived ? <span className="chip" style={{ marginLeft: 6 }}>Archived</span> : null}
                      </div>
                      <div className="note-date">
                        {n.updated_at ? new Date(n.updated_at).toLocaleString() : ""}
                      </div>
                    </div>
                    <div className="note-content">
                      {n.lock?.isLocked && isNoteLocked(n) ? (
                        <div className="lock-placeholder" role="status" aria-live="polite">
                          <span className="lock-icon" aria-hidden="true">🔒</span>
                          <span className="lock-text">This note is locked.</span>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => { setUnlockForNote(n); setPinInput(""); setPinError(""); setTimeout(() => pinInputRef.current?.focus(), 0); }}
                            aria-label={`Unlock note ${n.title}`}
                          >
                            Unlock
                          </button>
                        </div>
                      ) : (
                        <div
                          dangerouslySetInnerHTML={{ __html: renderNoteHtml(n.content, debouncedQuery) }}
                        />
                      )}
                    </div>

                    {/* attachments listing */}
                    {Array.isArray(n.attachments) && n.attachments.length > 0 && (
                      <div className="attachments attachments-readonly" aria-label="Attachments">
                        {n.attachments.map((a) => (
                          <div key={a.id} className="attachment-card">
                            {a.type === "image" ? (
                              <img src={a.url} alt={a.name} className="attachment-thumb" />
                            ) : a.type === "audio" ? (
                              <audio controls src={a.url} className="attachment-audio" />
                            ) : (
                              <div className="attachment-chip" title={a.name}>
                                <span className="attachment-name">{a.name}</span>
                                <span className="attachment-size">{formatSize(a.size)}</span>
                              </div>
                            )}
                            <div className="attachment-meta">
                              <span className="muted">{a.name}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* reminder chip */}
                    <div className="note-categories" style={{ gap: 6, flexWrap: "wrap" }}>
                      {Array.isArray(n.categories) && n.categories.length > 0 &&
                        n.categories.map((c) => (
                          <span key={c} className="chip" aria-label={`Category ${c}`}>
                            {c}
                          </span>
                        ))}
                      {reminderChip(n)}
                    </div>

                    <div className="note-actions" style={{ gap: 6, flexWrap: "wrap" }}>
                      <button
                        className={`icon-btn ${n.pinned ? "active" : ""}`}
                        onClick={async () => {
                          try {
                            await togglePin(n.id);
                            await loadData({ sortBy, category: selectedCategory, query: debouncedQuery, archivedMode });
                          } catch {}
                        }}
                        aria-label={n.pinned ? `Unpin note ${n.title}` : `Pin note ${n.title}`}
                        title={n.pinned ? "Unpin" : "Pin"}
                        type="button"
                      >
                        {n.pinned ? "📌 Unpin" : "📌 Pin"}
                      </button>
                      <button
                        className={`icon-btn ${n.favorite ? "active" : ""}`}
                        onClick={async () => {
                          try {
                            await toggleFavorite(n.id);
                            await loadData({ sortBy, category: selectedCategory, query: debouncedQuery });
                          } catch {}
                        }}
                        aria-label={n.favorite ? `Remove favorite from ${n.title}` : `Mark ${n.title} as favorite`}
                        title={n.favorite ? "Unfavorite" : "Favorite"}
                        type="button"
                      >
                        {n.favorite ? "★ Favorited" : "☆ Favorite"}
                      </button>
                      <button
                        className="btn"
                        onClick={() => openEdit(n)}
                        aria-label={`Edit note ${n.title}`}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        onClick={async () => {
                          try {
                            if (n.archived) {
                              await unarchiveNote(n.id);
                            } else {
                              await archiveNote(n.id);
                            }
                            await loadData({ sortBy, category: selectedCategory, query: debouncedQuery, archivedMode });
                            setFeedback({ type: "success", message: n.archived ? "Note unarchived." : "Note archived." });
                            resetFeedbackSoon();
                          } catch (e) {
                            setFeedback({ type: "error", message: e?.message || "Failed to change archive state." });
                            resetFeedbackSoon();
                          }
                        }}
                        aria-label={n.archived ? `Unarchive note ${n.title}` : `Archive note ${n.title}`}
                        type="button"
                        title={n.archived ? "Unarchive" : "Archive"}
                      >
                        {n.archived ? "Unarchive" : "Archive"}
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => setConfirmDeleteId(n.id)}
                        aria-label={`Delete note ${n.title}`}
                        type="button"
                      >
                        Delete
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => exportNoteAsTXT(n)}
                        aria-label={`Export ${n.title} as TXT`}
                        type="button"
                        title="Export TXT"
                      >
                        TXT
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => exportNoteAsPDF(n)}
                        aria-label={`Export ${n.title} as PDF`}
                        type="button"
                        title="Export PDF"
                      >
                        PDF
                      </button>
                      <button
                        className="icon-btn"
                        onClick={async () => {
                          try {
                            const { shareNoteToClipboard } = await import("../services/exportService");
                            const ok = await shareNoteToClipboard(n);
                            if (!ok) alert("Copy to clipboard failed.");
                          } catch {
                            alert("Copy to clipboard failed.");
                          }
                        }}
                        aria-label={`Copy ${n.title} to clipboard`}
                        type="button"
                        title="Copy to clipboard"
                      >
                        Share
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>

      {/* Floating Action Button for Quick Add */}
      <button
        type="button"
        className="fab-quickadd"
        aria-label="Quick add note"
        title="Quick add note (Ctrl/Cmd+Shift+N)"
        onClick={() => setQuickAddOpen(true)}
      >
        +
      </button>

      {/* Quick Add Modal */}
      <QuickAddNote
        isOpen={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        maxLength={quickAddMaxLength}
        successToast={showSaveSuccess}
        notes={notes}
        onCreate={async ({ title: t, content: c }) => {
          // Use existing notesService createNote; sanitize content is handled upstream and in component
          const note = await createNote({
            title: t || "",
            content: c || "",
            categories: [],
            attachments: [],
          });
          // Insert at top and apply current sort/filter pipeline
          setNotes((prev) =>
            _internal.applySortFilter([note, ...prev], {
              sortBy,
              category: selectedCategory,
              query: debouncedQuery,
              archivedMode,
            })
          );
          // refresh categories in case (not required for quick add since categories not used)
          try {
            const cats = await listCategories();
            setCategories(cats);
          } catch {}
          return note;
        }}
        sanitize={(html) => {
          // Reuse same sanitization as this page
          return sanitizeHtml(html);
        }}
      />

      {/* Toast notifications */}
      <div className="toast-container" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <div className="toast-title">⏰ {t.title}</div>
            <div className="toast-message">{t.message}</div>
            <div className="toast-actions">
              <button className="btn" onClick={() => handleToastSnooze(t.noteId, t.id, 5)}>Snooze +5m</button>
              <button className="btn" onClick={() => handleToastSnooze(t.noteId, t.id, 15)}>Snooze +15m</button>
              <button className="btn" onClick={() => handleToastDismiss(t.noteId, t.id)}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>

      {/* Lightweight success toast (separate from reminder toasts to avoid conflicts) */}
      <SuccessToast
        message={saveSuccessToast.message}
        visible={saveSuccessToast.visible}
        onHide={hideSaveSuccess}
      />

      {confirmDeleteId !== null && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">Confirm Deletion</div>
            <div className="modal-body">Are you sure you want to delete this note?</div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRestoreOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">Restore from latest backup</div>
            <div className="modal-body">
              This will replace your current notes with the latest backup snapshot. This action cannot be undone. Proceed?
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmRestoreOpen(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleRestoreLatestConfirmed} disabled={restoring} aria-disabled={restoring}>
                {restoring ? "Restoring…" : "Restore"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHandwriting && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setShowHandwriting(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">Handwriting</div>
            <div className="form-row">
              <HandwritingCanvas
                ref={handwritingRef}
                width={Math.min(900, typeof window !== "undefined" ? window.innerWidth - 80 : 600)}
                height={400}
                onChange={() => {}}
              />
            </div>
            <div className="modal-actions" style={{ justifyContent: "space-between" }}>
              <div />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    if (!handwritingRef.current) return;
                    try {
                      const dataUrl = handwritingRef.current.getImageDataURL();
                      if (!dataUrl) return;
                      // 1) embed in content (markdown-like image)
                      const embed = `\n![handwriting](${dataUrl})\n`;
                      setContent((prev) => (prev || "") + embed);
                      // 2) add to new attachments list for create form
                      const now = new Date().toISOString();
                      const name = `handwriting_${now.replace(/[:.]/g, "-")}.png`;
                      setNewNoteAttachments((prev) => [
                        {
                          id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                          type: "image",
                          name,
                          size: Math.ceil((dataUrl.length * 3) / 4), // rough size estimate
                          mime: "image/png",
                          url: dataUrl,
                          createdAt: now,
                        },
                        ...prev,
                      ]);
                      setShowHandwriting(false);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Insert & Save
                </button>
                <button type="button" className="btn btn-danger" onClick={() => setShowHandwriting(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingNote && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">Edit Note</div>
            <form onSubmit={handleSaveEdit} aria-label="Edit note form">
              <div className="form-row">
                <label htmlFor="edit-title">Title</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    id="edit-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditTitle(v);
                      debouncedCheckEditTitleRef.current?.({ value: v, notesList: notes, currentId: editingNote?.id });
                    }}
                    required
                    aria-required="true"
                    autoFocus
                    aria-describedby="edit-title-help"
                  />
                  {dupEdit.isDup ? (
                    <span className="chip" title="Duplicate title detected" aria-hidden="true">⚠️</span>
                  ) : null}
                </div>
                <div id="edit-title-help" className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {dupEdit.isDup ? "A note with this title already exists." : " "}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="edit-content">Content</label>

                <VoiceDictation
                  language="en-US"
                  insertMode={VoiceInsertMode.APPEND}
                  onText={handleDictationTextEdit}
                  onListeningChange={handleDictationListeningEdit}
                  onError={handleDictationError}
                />

                {/* Rich text toolbar for Edit */}
                <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
                  <div className="template-picker-inline">
                    <label htmlFor="edit-template-select" className="sr-only">Insert template</label>
                    <select
                      id="edit-template-select"
                      defaultValue=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        insertTemplateIntoEditor({ templateId: id, isEdit: true });
                        e.target.value = "";
                      }}
                      aria-label="Insert template"
                    >
                      <option value="" disabled>Insert template…</option>
                      {NOTE_TEMPLATES.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => execFormat('bold', true)} title="Bold (Ctrl/Cmd+B)"><strong>B</strong></button>
                  <button type="button" className="icon-btn" onClick={() => execFormat('italic', true)} title="Italic (Ctrl/Cmd+I)"><em>I</em></button>
                  <button type="button" className="icon-btn" onClick={() => execFormat('underline', true)} title="Underline (Ctrl/Cmd+U)"><u>U</u></button>
                  <button type="button" className="icon-btn" onClick={() => wrapSelectionWithCode(true)} title="Inline code (`)"><code>{`</>`}</code></button>
                </div>

                <div
                  id="edit-content"
                  className="rte-editor"
                  role="textbox"
                  aria-multiline="true"
                  aria-label="Note content editor"
                  contentEditable
                  ref={editEditorRef}
                  onInput={handleEditEditorInput}
                  onKeyDown={(e) => handleEditorKeyDown(e, true)}
                  data-placeholder={isListeningEdit ? "Listening… speak now. Your words will appear here." : "Write something..."}
                />
              </div>
              <div className="form-row">
                <label htmlFor="edit-categories">Categories (comma-separated)</label>
                <input
                  id="edit-categories"
                  type="text"
                  value={editCatsInput}
                  onChange={(e) => setEditCatsInput(e.target.value)}
                  placeholder="e.g., Personal, Ideas"
                />
              </div>

              <div className="form-row">
                <label>Reminder</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div>
                    <label htmlFor="edit-rem-date" className="sr-only">Reminder date</label>
                    <input
                      id="edit-rem-date"
                      type="date"
                      value={editReminderDate}
                      onChange={(e) => setEditReminderDate(e.target.value)}
                      aria-label="Reminder date"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-rem-time" className="sr-only">Reminder time</label>
                    <input
                      id="edit-rem-time"
                      type="time"
                      value={editReminderTime}
                      onChange={(e) => setEditReminderTime(e.target.value)}
                      aria-label="Reminder time"
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-rem-repeat" className="sr-only">Repeat</label>
                    <select
                      id="edit-rem-repeat"
                      value={editReminderRepeat}
                      onChange={(e) => setEditReminderRepeat(e.target.value)}
                      aria-label="Reminder repeat"
                    >
                      <option value="none">No repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  {editingNote?.reminder && (
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={async () => {
                        try {
                          await clearReminder(editingNote.id);
                          setEditReminderDate("");
                          setEditReminderTime("");
                          setEditReminderRepeat("none");
                          await loadData();
                        } catch {}
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Reminder must be in the future. Repeat reschedules automatically when it fires.
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="edit-attachments">Add attachments</label>
                <input
                  id="edit-attachments"
                  ref={editAttachInputRef}
                  type="file"
                  multiple
                  accept="image/*,audio/*,*/*"
                  onChange={handleEditAttachmentsChange}
                  aria-describedby="edit-attach-help"
                />
                <div id="edit-attach-help" className="muted" style={{ fontSize: 12 }}>
                  Up to {_internal.ATTACHMENTS_LIMIT_PER_NOTE} files, max 10MB each.
                </div>
                {renderAttachmentsPreview(
                  editAttachments,
                  true,
                  (attId) => {
                    // If it looks like persisted (numeric id) and API is used, use API deletion; else remove locally
                    if (_internal.useApi && editingNote && String(attId).match(/^\d+$/)) {
                      handleRemovePersistedAttachment(editingNote.id, attId);
                    } else {
                      removeEditAttachmentLocal(attId);
                    }
                  }
                )}
              </div>

              {/* Versions panel toggle */}
              <div className="form-row">
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    setShowVersions((v) => !v);
                    if (!showVersions && editingNote) {
                      await loadVersions(editingNote.id);
                    }
                  }}
                  aria-expanded={showVersions}
                  aria-controls="versions-panel"
                >
                  {showVersions ? "Hide Version History" : "Show Version History"}
                </button>
              </div>

              {showVersions && (
                <div id="versions-panel" className="versions-panel">
                  <div className="versions-header">Version History</div>
                  {versions.length === 0 ? (
                    <div className="muted">No previous versions yet. Save edits to create versions.</div>
                  ) : (
                    <ul className="versions-list" role="list">
                      {versions.map((v) => (
                        <li key={v.versionId} className={`version-item ${selectedVersionId === v.versionId ? "active" : ""}`}>
                          <div className="version-meta">
                            <div className="version-title">
                              {new Date(v.created_at).toLocaleString()}
                            </div>
                            <div className="version-summary muted">{v.summary || "changes"}</div>
                          </div>
                          <div className="version-actions">
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={async () => {
                                setSelectedVersionId(v.versionId);
                                try {
                                  const snap = await getNoteVersion(editingNote.id, v.versionId);
                                  setVersionPreview(snap);
                                  const d = await diffNoteVersion(editingNote.id, v.versionId);
                                  setVersionDiff(d);
                                } catch {
                                  setVersionPreview(null);
                                  setVersionDiff(null);
                                }
                              }}
                              aria-label="View diff"
                              title="View diff"
                            >
                              View Diff
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={async () => {
                                if (!window.confirm("Revert to this version? Current state will be saved in history.")) return;
                                try {
                                  setReverting(true);
                                  await revertNoteToVersion(editingNote.id, v.versionId);
                                  // refresh UI states
                                  await loadData();
                                  await loadVersions(editingNote.id);
                                  // update modal fields to reverted content
                                  const noteNow = (await listNotes({ sortBy, category: selectedCategory, query: debouncedQuery }))
                                    .find((n) => String(n.id) === String(editingNote.id));
                                  if (noteNow) {
                                    setEditTitle(noteNow.title || "");
                                    setEditContent(noteNow.content || "");
                                    setEditCatsInput(Array.isArray(noteNow.categories) ? noteNow.categories.join(", ") : "");
                                    setEditAttachments(Array.isArray(noteNow.attachments) ? [...noteNow.attachments] : []);
                                    const r = noteNow.reminder;
                                    if (r?.reminderAt) {
                                      const d = new Date(r.reminderAt);
                                      if (!isNaN(d.getTime())) {
                                        setEditReminderDate(d.toISOString().slice(0, 10));
                                        const hh = String(d.getHours()).padStart(2, "0");
                                        const mm = String(d.getMinutes()).padStart(2, "0");
                                        setEditReminderTime(`${hh}:${mm}`);
                                      } else {
                                        setEditReminderDate("");
                                        setEditReminderTime("");
                                      }
                                    } else {
                                      setEditReminderDate("");
                                      setEditReminderTime("");
                                    }
                                    setEditReminderRepeat(r?.repeat || "none");
                                    setEditingNote(noteNow);
                                  }
                                  setFeedback({ type: "success", message: "Reverted to selected version." });
                                  resetFeedbackSoon();
                                } catch (e) {
                                  setFeedback({ type: "error", message: e?.message || "Failed to revert." });
                                  resetFeedbackSoon();
                                } finally {
                                  setReverting(false);
                                }
                              }}
                              disabled={reverting}
                              aria-disabled={reverting}
                              title="Revert to this version"
                            >
                              {reverting ? "Reverting…" : "Revert"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {versionPreview && versionDiff && (
                    <div className="version-preview">
                      <div className="version-preview-title">Selected Version vs Current</div>
                      <div className="version-preview-section">
                        <div className="version-field-label">Title:</div>
                        <div className="version-field-value">
                          <span className="muted">Version:</span> {versionPreview.data.title}
                          <br />
                          <span className="muted">Current:</span> {editingNote?.title}
                        </div>
                      </div>
                      <div className="version-preview-section">
                        <div className="version-field-label">Content diff:</div>
                        <pre className="diff-block" aria-label="Content diff">
                          {versionDiff.contentDiff.map((ln, i) => (
                            <div key={i} className={`diff-line diff-${ln.type}`}>
                              {ln.type === "add" ? "+ " : ln.type === "del" ? "- " : "  "}
                              {ln.text}
                            </div>
                          ))}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="modal-actions" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className={`icon-btn ${editingNote?.pinned ? "active" : ""}`}
                    onClick={async () => {
                      try {
                        await togglePin(editingNote.id);
                        const refreshed = await listNotes({ sortBy, category: selectedCategory, query: debouncedQuery, archivedMode });
                        setNotes(refreshed);
                        setEditingNote((prev) => prev ? { ...prev, pinned: !prev.pinned, pinnedAt: !prev.pinned ? new Date().toISOString() : null } : prev);
                      } catch {}
                    }}
                    aria-label={editingNote?.pinned ? "Unpin note" : "Pin note"}
                    title={editingNote?.pinned ? "Unpin" : "Pin"}
                  >
                    {editingNote?.pinned ? "📌 Unpin" : "📌 Pin"}
                  </button>
                  <button
                    type="button"
                    className={`icon-btn ${editingNote?.favorite ? "active" : ""}`}
                    onClick={async () => {
                      try {
                        await toggleFavorite(editingNote.id);
                        const refreshed = await listNotes({ sortBy, category: selectedCategory, query: debouncedQuery });
                        setNotes(refreshed);
                        setEditingNote((prev) => prev ? { ...prev, favorite: !prev.favorite } : prev);
                      } catch {}
                    }}
                    aria-label={editingNote?.favorite ? "Unfavorite note" : "Favorite note"}
                    title={editingNote?.favorite ? "Unfavorite" : "Favorite"}
                  >
                    {editingNote?.favorite ? "★ Favorited" : "☆ Favorite"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {NOTELOCK_ENABLED && editingNote && (
                    <>
                      {editingNote.lock?.isLocked && isNoteLocked(editingNote) ? (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => { setUnlockForNote(editingNote); setPinInput(""); setPinError(""); setTimeout(() => pinInputRef.current?.focus(), 0); }}
                          title="Unlock to edit"
                          aria-label="Unlock to edit"
                        >
                          🔓 Unlock to edit
                        </button>
                      ) : null}
                      {!editingNote.lock?.isLocked ? (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => { setLockSetForNote(editingNote); setPinInput(""); setPinError(""); setTimeout(() => pinInputRef.current?.focus(), 0); }}
                          title="Set 4-digit PIN lock"
                          aria-label="Set 4-digit PIN lock"
                        >
                          🔒 Set PIN
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => setLockRemoveForNote(editingNote)}
                          title="Remove PIN lock"
                          aria-label="Remove PIN lock"
                        >
                          🗝️ Remove PIN
                        </button>
                      )}
                    </>
                  )}
                  <button type="button" className="btn" onClick={closeEdit}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn"
                    disabled={savingEdit || !editTitle.trim() || !editContent.trim()}
                    aria-disabled={savingEdit || !editTitle.trim() || !editContent.trim()}
                  >
                    {savingEdit ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Lock/Unlock Modals */}
      {(lockSetForNote || unlockForNote || lockRemoveForNote) && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => { setLockSetForNote(null); setUnlockForNote(null); setLockRemoveForNote(null); setPinError(""); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div ref={lockAriaLiveRef} className="visually-hidden" role="status" aria-live="polite" />
            {lockSetForNote && (
              <>
                <div className="modal-header">Set PIN Lock</div>
                <div className="form-row">
                  <label htmlFor="pin-input">Enter a 4-digit PIN</label>
                  <input
                    id="pin-input"
                    ref={pinInputRef}
                    type="password"
                    inputMode="numeric"
                    pattern="\\d{4}"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                      setPinInput(v);
                      setPinError("");
                    }}
                    aria-invalid={!!pinError}
                    aria-describedby="pin-error"
                    placeholder="••••"
                  />
                  <div id="pin-error" className="muted" style={{ color: pinError ? "#dc2626" : "var(--muted)" }}>
                    {pinError || "PIN is used to encrypt this note on this device. Do not forget it."}
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-danger" type="button" onClick={() => { setLockSetForNote(null); setPinError(""); }}>
                    Cancel
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={async () => {
                      if (!/^\d{4}$/.test(pinInput)) {
                        setPinError("Enter a valid 4-digit PIN.");
                        if (lockAriaLiveRef.current) lockAriaLiveRef.current.textContent = "PIN must be 4 digits.";
                        return;
                      }
                      try {
                        if (lockSetForNote === "__create__") {
                          // For new note, we store lock intent in autosave by saving content with encryption on first save:
                          const payload = { title, content, categories: parsedNewNoteCategories, attachments: newNoteAttachments, lockPin: pinInput };
                          // Trigger immediate save using existing create handler path
                          const created = await createNote(payload);
                          setAutoSavedNoteId(created.id);
                          setNotes((prev) =>
                            _internal.applySortFilter([created, ...prev], { sortBy, category: selectedCategory, query: debouncedQuery, archivedMode })
                          );
                          setFeedback({ type: "success", message: "PIN set. Note locked." });
                          resetFeedbackSoon();
                        } else if (lockSetForNote?.id) {
                          await updateNote(lockSetForNote.id, { lockPin: pinInput, content: editContent });
                          await loadData({ sortBy, category: selectedCategory, query: debouncedQuery, archivedMode });
                          setFeedback({ type: "success", message: "PIN set. Note locked." });
                          resetFeedbackSoon();
                        }
                      } catch (e) {
                        setPinError(e?.message || "Failed to set PIN.");
                      } finally {
                        setLockSetForNote(null);
                        setPinInput("");
                      }
                    }}
                  >
                    Set PIN
                  </button>
                </div>
              </>
            )}

            {unlockForNote && (
              <>
                <div className="modal-header">Unlock Note</div>
                <div className="form-row">
                  <label htmlFor="pin-unlock">Enter your 4-digit PIN</label>
                  <input
                    id="pin-unlock"
                    ref={pinInputRef}
                    type="password"
                    inputMode="numeric"
                    pattern="\\d{4}"
                    maxLength={4}
                    value={pinInput}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 4);
                      setPinInput(v);
                      setPinError("");
                    }}
                    aria-invalid={!!pinError}
                    aria-describedby="pin-unlock-error"
                    placeholder="••••"
                  />
                  <div id="pin-unlock-error" className="muted" style={{ color: pinError ? "#dc2626" : "var(--muted)" }}>
                    {pinError || "Enter PIN to view and edit this note. Session auto-locks after inactivity."}
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-danger" type="button" onClick={() => { setUnlockForNote(null); setPinError(""); }}>
                    Cancel
                  </button>
                  <button
                    className="btn"
                    type="button"
                    onClick={async () => {
                      if (!/^\d{4}$/.test(pinInput)) {
                        setPinError("Enter a valid 4-digit PIN.");
                        return;
                      }
                      const ok = await unlockNoteForSession(unlockForNote.id, pinInput);
                      if (!ok) {
                        setPinError("Incorrect PIN.");
                        if (lockAriaLiveRef.current) lockAriaLiveRef.current.textContent = "Incorrect PIN.";
                        return;
                      }
                      // refresh list with decrypted content for this note
                      await loadData({ sortBy, category: selectedCategory, query: debouncedQuery, archivedMode });
                      setUnlockForNote(null);
                      setPinInput("");
                      setFeedback({ type: "success", message: "Note unlocked for this session." });
                      resetFeedbackSoon();
                    }}
                  >
                    Unlock
                  </button>
                </div>
              </>
            )}

            {lockRemoveForNote && (
              <>
                <div className="modal-header">Remove PIN Lock</div>
                <div className="modal-body">This will remove the PIN lock from this note. You will store content in plaintext. Continue?</div>
                <div className="modal-actions">
                  <button className="btn" type="button" onClick={() => setLockRemoveForNote(null)}>Cancel</button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={async () => {
                      try {
                        await updateNote(lockRemoveForNote.id, { removeLock: true, content: editContent });
                        relockNoteInSession(lockRemoveForNote.id);
                        await loadData({ sortBy, category: selectedCategory, query: debouncedQuery, archivedMode });
                        setFeedback({ type: "success", message: "Lock removed." });
                        resetFeedbackSoon();
                      } catch (e) {
                        setFeedback({ type: "error", message: e?.message || "Failed to remove lock." });
                        resetFeedbackSoon();
                      } finally {
                        setLockRemoveForNote(null);
                      }
                    }}
                  >
                    Remove Lock
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getTypeFromMime(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}
