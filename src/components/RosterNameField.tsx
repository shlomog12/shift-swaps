import { checkName } from '../lib/rosterCheck';

/**
 * A name input that checks the value against the roster: a roster name passes quietly; anything else is
 * marked "not on the roster", with "did you mean…?" when a roster name is close. `listId` is a <datalist> of
 * roster names rendered once by the caller;
 * names that are expected to be new (people joining) belong in `roster` too.
 */
export function RosterNameField({
  value,
  onChange,
  roster,
  listId,
  placeholder,
  label,
  compact = false,
  newNote = 'שם שלא ברשימה',
  expectNew = false,
}: {
  value: string;
  onChange: (value: string) => void;
  roster: string[];
  listId: string;
  placeholder?: string;
  label: string;
  /** In a table cell: a shorter hint. */
  compact?: boolean;
  /** What to say about a new name, e.g. "שם חדש: יתווסף לרשימה". */
  newNote?: string;
  /** A new name is expected here (someone joining): say so quietly instead of marking an error. */
  expectNew?: boolean;
}) {
  const check = checkName(value, roster);
  const isNew = check.status === 'new';
  const flagged = isNew && !expectNew;
  return (
    <span className={compact ? 'roster-field compact' : 'roster-field'}>
      <input
        list={listId}
        value={value}
        placeholder={placeholder}
        aria-label={label}
        aria-invalid={flagged}
        className={flagged ? 'name-new' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {isNew && (
        <span className={flagged ? 'name-hint small' : 'muted small'} role="status">
          {newNote}
          {check.suggestion && (
            <>
              {compact ? ' · ' : '. '}
              <button type="button" className="link small" onClick={() => onChange(check.suggestion!)}>
                אולי {check.suggestion}?
              </button>
            </>
          )}
        </span>
      )}
    </span>
  );
}
