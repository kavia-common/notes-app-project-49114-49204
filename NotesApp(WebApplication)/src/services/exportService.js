//
// Export/Share utilities for notes
//
// Uses client-side libraries to generate files in-browser.
// - TXT export via Blob
// - PDF export via jsPDF
// - JSON export via Blob with trashed metadata and excludeTrashed option
// - ZIP batch export via JSZip (optional)
// - Clipboard helpers via Clipboard API
//

// PUBLIC_INTERFACE
export async function exportNoteAsTXT(note, fileNameOverride) {
  /** Export a single note as a .txt file and trigger browser download. */
  const name = sanitizeFileName(fileNameOverride || `${note.title || 'Note'}-${note.id || 'untitled'}.txt`);
  const content = formatNoteAsText(note);
  triggerDownloadFromText(content, name, 'text/plain;charset=utf-8');
}

// PUBLIC_INTERFACE
export async function exportNoteAsPDF(note, fileNameOverride) {
  /** Export a single note as a .pdf using jsPDF (loaded dynamically). */
  const name = sanitizeFileName(fileNameOverride || `${note.title || 'Note'}-${note.id || 'untitled'}.pdf`);
  const { jsPDF } = await import('jspdf'); // dynamic import to keep initial bundle small
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const maxLineWidth = pageWidth - margin * 2;
  const lineHeight = 18;

  const title = note.title || 'Untitled';
  const body = (note.content || '').toString();
  const meta = [
    note.created_at ? `Created: ${formatDate(note.created_at)}` : null,
    note.updated_at ? `Updated: ${formatDate(note.updated_at)}` : null,
    note.archived ? `Archived: yes` : null,
    note.trashed ? `Trashed: ${note.deletedAt ? formatDate(note.deletedAt) : 'yes'}` : null,
    Array.isArray(note.tags) && note.tags.length ? `Tags: ${note.tags.join(', ')}` : null,
  ].filter(Boolean).join(' | ');

  let cursorY = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  const titleLines = doc.splitTextToSize(title, maxLineWidth);
  doc.text(titleLines, margin, cursorY);
  cursorY += lineHeight * titleLines.length + 8;

  if (meta) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const metaLines = doc.splitTextToSize(meta, maxLineWidth);
    doc.text(metaLines, margin, cursorY);
    cursorY += lineHeight * 0.9 * metaLines.length + 10;
  }

  doc.setDrawColor(200);
  doc.line(margin, cursorY, pageWidth - margin, cursorY);
  cursorY += 16;

  doc.setFont('times', 'normal');
  doc.setFontSize(12);
  const bodyLines = doc.splitTextToSize(body || '', maxLineWidth);

  for (let i = 0; i < bodyLines.length; i++) {
    if (cursorY > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      cursorY = margin;
    }
    doc.text(bodyLines[i], margin, cursorY);
    cursorY += lineHeight;
  }

  doc.save(name);
}

// PUBLIC_INTERFACE
export async function exportAllNotesAsTXT(notes, fileName = 'notes.txt') {
  /** Export all notes concatenated into a single .txt file. */
  const content = notes.map(formatNoteAsText).join('\n\n-----\n\n');
  triggerDownloadFromText(content, sanitizeFileName(fileName), 'text/plain;charset=utf-8');
}

// PUBLIC_INTERFACE
export async function exportAllNotesAsJSON(notes, fileName = 'notes-backup.json', { excludeTrashed = false } = {}) {
  /** Export all notes as a JSON backup file, optionally excluding trashed notes. */
  const filtered = excludeTrashed ? notes.filter(n => !n.trashed) : notes;
  const payload = {
    type: 'notes-app-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    excludeTrashed,
    notes: filtered,
  };
  const json = JSON.stringify(payload, null, 2);
  triggerDownloadFromText(json, sanitizeFileName(fileName), 'application/json;charset=utf-8');
}

// PUBLIC_INTERFACE
export async function exportAllNotesAsPDF(notes, fileName = 'notes.pdf') {
  /** Export all notes into a single PDF file (each note starts on a new page). */
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const maxLineWidth = pageWidth - margin * 2;
  const lineHeight = 18;

  notes.forEach((note, idx) => {
    if (idx !== 0) doc.addPage();

    const title = note.title || 'Untitled';
    const body = (note.content || '').toString();
    const meta = [
      note.created_at ? `Created: ${formatDate(note.created_at)}` : null,
      note.updated_at ? `Updated: ${formatDate(note.updated_at)}` : null,
      note.archived ? `Archived: yes` : null,
      note.trashed ? `Trashed: ${note.deletedAt ? formatDate(note.deletedAt) : 'yes'}` : null,
      Array.isArray(note.tags) && note.tags.length ? `Tags: ${note.tags.join(', ')}` : null,
    ].filter(Boolean).join(' | ');

    let cursorY = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    const titleLines = doc.splitTextToSize(title, maxLineWidth);
    doc.text(titleLines, margin, cursorY);
    cursorY += lineHeight * titleLines.length + 8;

    if (meta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const metaLines = doc.splitTextToSize(meta, maxLineWidth);
      doc.text(metaLines, margin, cursorY);
      cursorY += lineHeight * 0.9 * metaLines.length + 10;
    }

    doc.setDrawColor(200);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 16;

    doc.setFont('times', 'normal');
    doc.setFontSize(12);
    const bodyLines = doc.splitTextToSize(body || '', maxLineWidth);

    for (let i = 0; i < bodyLines.length; i++) {
      if (cursorY > pageHeight - margin) {
        doc.addPage();
        cursorY = margin;
      }
      doc.text(bodyLines[i], margin, cursorY);
      cursorY += lineHeight;
    }
  });

  doc.save(sanitizeFileName(fileName));
}

// PUBLIC_INTERFACE
export async function exportNotesAsZIP(options) {
  /**
   * Export notes as a ZIP archive.
   * options: {
   *   notes: array of note objects,
   *   formats: array of 'txt' | 'pdf' | 'json'
   *   fileName: name of the zip file (default: notes.zip)
   * }
   */
  const { notes, formats = ['txt'], fileName = 'notes.zip' } = options || {};
  if (!Array.isArray(notes)) throw new Error('exportNotesAsZIP: notes must be an array');

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const adders = notes.map(async (note) => {
    const base = sanitizeFileName(`${note.title || 'Note'}-${note.id || 'untitled'}`);
    if (formats.includes('txt')) {
      const txt = formatNoteAsText(note);
      zip.file(`${base}.txt`, txt);
    }
    if (formats.includes('json')) {
      const json = JSON.stringify(note, null, 2);
      zip.file(`${base}.json`, json);
    }
    if (formats.includes('pdf')) {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 40;
      const maxLineWidth = pageWidth - margin * 2;
      const lineHeight = 18;

      const title = note.title || 'Untitled';
      const body = (note.content || '').toString();
      const meta = [
        note.created_at ? `Created: ${formatDate(note.created_at)}` : null,
        note.updated_at ? `Updated: ${formatDate(note.updated_at)}` : null,
        note.archived ? `Archived: yes` : null,
        note.trashed ? `Trashed: ${note.deletedAt ? formatDate(note.deletedAt) : 'yes'}` : null,
        Array.isArray(note.tags) && note.tags.length ? `Tags: ${note.tags.join(', ')}` : null,
      ].filter(Boolean).join(' | ');

      let cursorY = margin;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      const titleLines = doc.splitTextToSize(title, maxLineWidth);
      doc.text(titleLines, margin, cursorY);
      cursorY += lineHeight * titleLines.length + 8;

      if (meta) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const metaLines = doc.splitTextToSize(meta, maxLineWidth);
        doc.text(metaLines, margin, cursorY);
        cursorY += lineHeight * 0.9 * metaLines.length + 10;
      }

      doc.setDrawColor(200);
      doc.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 16;

      doc.setFont('times', 'normal');
      doc.setFontSize(12);
      const bodyLines = doc.splitTextToSize(body || '', maxLineWidth);
      for (let i = 0; i < bodyLines.length; i++) {
        if (cursorY > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          cursorY = margin;
        }
        doc.text(bodyLines[i], margin, cursorY);
        cursorY += lineHeight;
      }

      const pdfBlob = doc.output('blob');
      const pdfArrayBuffer = await pdfBlob.arrayBuffer();
      zip.file(`${base}.pdf`, pdfArrayBuffer);
    }
  });

  await Promise.all(adders);

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownloadFromBlob(content, sanitizeFileName(fileName));
}

// PUBLIC_INTERFACE
export async function shareNoteToClipboard(note) {
  /** Copy note content (with a header) to clipboard, with fallback if needed. */
  const text = formatNoteAsText(note);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback: create a temporary textarea
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      document.body.removeChild(ta);
      return false;
    }
  }
}

// PUBLIC_INTERFACE
export function generateNoteFileName(note, ext) {
  /** Generate a sanitized file name for a note with a given extension. */
  const base = `${note.title || 'Note'}-${note.id || 'untitled'}`;
  return sanitizeFileName(`${base}.${ext}`);
}

// Helpers
function formatNoteAsText(note) {
  const title = note.title || 'Untitled';
  const meta = [
    note.created_at ? `Created: ${formatDate(note.created_at)}` : null,
    note.updated_at ? `Updated: ${formatDate(note.updated_at)}` : null,
    note.archived ? `Archived: yes` : null,
    note.trashed ? `Trashed: ${note.deletedAt ? formatDate(note.deletedAt) : 'yes'}` : null,
    Array.isArray(note.tags) && note.tags.length ? `Tags: ${note.tags.join(', ')}` : null,
  ].filter(Boolean).join(' | ');
  const header = meta ? `${title}\n${meta}\n\n` : `${title}\n\n`;
  return `${header}${(note.content || '').toString()}`;
}

function formatDate(dt) {
  try {
    const d = new Date(dt);
    return d.toLocaleString();
  } catch {
    return dt;
  }
}

function triggerDownloadFromText(text, fileName, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mimeType });
  triggerDownloadFromBlob(blob, fileName);
}

function triggerDownloadFromBlob(blob, fileName) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

function sanitizeFileName(name) {
  return (name || 'file')
    .replace(/[<>:\"/\\|?*\\x00-\\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}
