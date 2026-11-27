import { addDays, formatDateRange, israelToday, monthKey, monthTitle } from '../lib/dates';
import { useRoster } from '../lib/hooks';
import { rosterText } from '../lib/rosterText';
import { appLink } from '../lib/share';
import type { Shift } from '../lib/types';
import { ShareMenuButton, type ShareOption } from './ShareDialog';

/** The calendar's share button: the coming week or the month on screen, in a dialog. */
export function RosterShare({ month, shifts }: { month: string; shifts: Shift[] | undefined }) {
  const today = israelToday();
  const weekEnd = addDays(today, 6);
  const week = (useRoster().upcoming.data ?? []).filter((s) => s.night >= today && s.night <= weekEnd);
  const inMonth = (shifts ?? []).filter((s) => monthKey(s.night) === month);

  const options: ShareOption[] = [];
  if (week.length > 0) {
    options.push({
      label: 'השבוע הקרוב',
      detail: formatDateRange(today, weekEnd),
      text: rosterText(`שבצ"ק ${formatDateRange(today, weekEnd)}`, week, appLink()),
    });
  }
  if (inMonth.length > 0) {
    options.push({
      label: `כל ${monthTitle(month)}`,
      text: rosterText(`שבצ"ק ${monthTitle(month)}`, inMonth, appLink()),
    });
  }
  if (options.length === 0) return null;

  return (
    <div className="roster-share">
      <ShareMenuButton label='שיתוף השבצ"ק' title='שיתוף השבצ"ק בוואטסאפ' options={options} />
    </div>
  );
}
