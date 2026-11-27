import { hasStarted, plural } from '../lib/dates';
import { useMe } from '../lib/hooks';
import { differsFromPlan } from '../lib/plan';
import type { Shift } from '../lib/types';

export function shiftClasses(shift: Shift, isMine: boolean): string {
  const classes = ['shift-cell'];
  if (differsFromPlan(shift)) classes.push('differs');
  if (hasStarted(shift.night, shift.slot)) classes.push('past');
  if (!shift.assignee) classes.push('open');
  if (isMine) classes.push('mine');
  if (shift.swap_requested) classes.push('swap');
  return classes.join(' ');
}

export function ShiftCell({ shift, offers = 0 }: { shift: Shift; offers?: number }) {
  const me = useMe();
  const mine = me.isMine(shift.assignee);
  return (
    <button className={shiftClasses(shift, mine)} onClick={() => me.openShift(shift.night, shift.slot)}>
      <span className="name">{shift.assignee ?? 'פנוי'}</span>
      {differsFromPlan(shift) && <span className="badge differs-badge">בפועל: {shift.actual ?? 'פנוי'}</span>}
      {shift.swap_requested && (
        <span className="badge">{offers > 0 ? `חילוף · ${plural(offers, 'מתנדב אחד', 'מתנדבים')}` : 'בקשת חילוף'}</span>
      )}
    </button>
  );
}
