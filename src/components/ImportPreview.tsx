import { SLOT_HOURS, formatDate, nightLabel } from '../lib/dates';
import type { ImportRow } from '../lib/importSheet';
import type { Shift } from '../lib/types';

export type RowState = 'new' | 'changed' | 'same';

/** Whether a night to import is new, changes the current roster, or is the same. */
export function rowState(row: ImportRow, existing: Map<string, Shift>): RowState {
  const first = existing.get(`${row.night}/1`);
  const second = existing.get(`${row.night}/2`);
  if (!first && !second) return 'new';
  const same = first?.assignee === row.slot1 && second?.assignee === row.slot2;
  return same ? 'same' : 'changed';
}

function PreviewCell({ value, old }: { value: string | null; old: Shift | undefined }) {
  const changed = old !== undefined && old.assignee !== value;
  return (
    <td className={changed ? 'cell-changed' : undefined}>
      {value ?? <span className="muted">פנוי</span>}
      {changed && <div className="muted small">היה: {old.assignee ?? 'פנוי'}</div>}
    </td>
  );
}

/** The nights about to be written, each marked new / changed / same against the current roster. */
export function PreviewTable({ rows, existing }: { rows: ImportRow[]; existing: Map<string, Shift> }) {
  return (
    <div className="table-wrap">
      <table className="preview">
        <thead>
          <tr>
            <th>תאריך</th>
            <th>{SLOT_HOURS[1]}</th>
            <th>{SLOT_HOURS[2]}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = rowState(row, existing);
            return (
              <tr key={row.night} className={`state-${state}`}>
                <td>
                  {formatDate(row.night)}
                  <div className="muted small">{nightLabel(row.night)}</div>
                </td>
                <PreviewCell value={row.slot1} old={existing.get(`${row.night}/1`)} />
                <PreviewCell value={row.slot2} old={existing.get(`${row.night}/2`)} />
                <td className="small">{state === 'new' ? 'חדש' : state === 'changed' ? 'שינוי' : 'זהה'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
