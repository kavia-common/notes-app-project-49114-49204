import React, { useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';

/**
 * PUBLIC_INTERFACE
 * NoteCount component
 * Displays total notes count and, if a filter is active, the filtered count.
 * It listens to provided notes and optionally to a refreshKey to re-compute counts reactively.
 */
export default function NoteCount({ notes = [], currentFilter = 'all', ariaLabelId = 'notes-count', refreshKey }) {
  // Local state to compute counts whenever notes change or refreshKey ticks
  const [counts, setCounts] = useState({ total: 0, active: 0, archived: 0, trashed: 0 });

  const computeCounts = useMemo(
    () => () => {
      const total = notes.length;
      let active = 0;
      let archived = 0;
      let trashed = 0;

      // We infer state from common fields used in the app (archived, trashed, deleted)
      for (const n of notes) {
        const isTrashed = Boolean(n.trashed || n.inTrash || n.deleted);
        const isArchived = Boolean(!isTrashed && (n.archived || n.isArchived));
        if (isTrashed) trashed += 1;
        else if (isArchived) archived += 1;
        else active += 1;
      }
      return { total, active, archived, trashed };
    },
    [notes]
  );

  useEffect(() => {
    setCounts(computeCounts());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, computeCounts, refreshKey]);

  const getFilteredCount = () => {
    switch (String(currentFilter).toLowerCase()) {
      case 'active':
      case 'all':
      case 'notes':
      case 'home':
        return counts.active;
      case 'archived':
      case 'archive':
        return counts.archived;
      case 'trash':
      case 'trashed':
      case 'deleted':
        return counts.trashed;
      default:
        // Unknown filter -> just use total
        return counts.total;
    }
  };

  const showFiltered =
    currentFilter &&
    !['all', 'notes', 'home'].includes(String(currentFilter).toLowerCase());

  return (
    <div className="note-count" role="status" aria-live="polite" aria-atomic="true" aria-labelledby={ariaLabelId}>
      <span id={ariaLabelId} className="visually-hidden">Notes counter</span>
      <span className="note-count__total" title="Total notes" aria-label={`Total notes: ${counts.total}`}>
        Total: {counts.total}
      </span>
      {showFiltered && (
        <span
          className="note-count__filtered"
          title={`Notes in ${currentFilter}`}
          aria-label={`Notes in ${currentFilter}: ${getFilteredCount()}`}
        >
          • {currentFilter[0]?.toUpperCase() + currentFilter.slice(1)}: {getFilteredCount()}
        </span>
      )}
    </div>
  );
}

NoteCount.propTypes = {
  // Array of note objects used to compute counts
  notes: PropTypes.array,
  // Current filter string (e.g., 'all' | 'active' | 'archived' | 'trash')
  currentFilter: PropTypes.string,
  // Optional id used for aria-labelledby
  ariaLabelId: PropTypes.string,
  // Optional key that can be updated by the parent to force recomputation
  refreshKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
