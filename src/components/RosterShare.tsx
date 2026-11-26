import { addDays, formatShortDate, israelToday, monthKey, monthTitle } from '../lib/dates';
import { useRoster } from '../lib/hooks';
import { rosterText } from '../lib/rosterText';
import { appLink } from '../lib/share';
import type { Shift } from '../lib/types';
import { WhatsAppButton } from './SwapRequests';

/** Buttons that share the roster of the coming week, or of the month on screen, on WhatsApp. */
export function RosterShare({ month, shifts }: { month: string; shifts: Shift[] }) {
  const today = israelToday();
  const weekEnd = addDays(today, 6);
  const week = (useRoster().upcoming.data ?? []).filter((s) => s.night >= today && s.night <= weekEnd);
  const inMonth = shifts.filter((s) => monthKey(s.night) === month);

  return (
    <div className="roster-share">
      <span className="muted small">שיתוף השבצ"ק בוואטסאפ:</span>
      {week.length > 0 && (
        <WhatsAppButton
          className="small"
          label="השבוע הקרוב"
          text={rosterText(`שבצ"ק ${formatShortDate(today)}–${formatShortDate(weekEnd)}`, week, appLink())}
        />
      )}
      {inMonth.length > 0 && (
        <WhatsAppButton
          className="small"
          label={monthTitle(month)}
          text={rosterText(`שבצ"ק ${monthTitle(month)}`, inMonth, appLink())}
        />
      )}
    </div>
  );
}
