import { useState } from 'react';
import { addDays, formatDateRange, israelToday, monthKey, monthTitle } from '../lib/dates';
import { useRoster } from '../lib/hooks';
import { rosterText } from '../lib/rosterText';
import { appLink } from '../lib/share';
import type { Shift } from '../lib/types';
import { WhatsAppButton } from './SwapRequests';
import { WhatsAppIcon } from './WhatsAppIcon';

/** A share button next to the month title; opens the choice of sharing the coming week or the month. */
export function RosterShare({ month, shifts }: { month: string; shifts: Shift[] | undefined }) {
  const [open, setOpen] = useState(false);
  const today = israelToday();
  const weekEnd = addDays(today, 6);
  const week = (useRoster().upcoming.data ?? []).filter((s) => s.night >= today && s.night <= weekEnd);
  const inMonth = (shifts ?? []).filter((s) => monthKey(s.night) === month);

  if (week.length === 0 && inMonth.length === 0) return null;

  return (
    <div className="roster-share">
      <button
        className={open ? 'share-toggle selected' : 'share-toggle'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <WhatsAppIcon />
        שיתוף השבצ"ק
      </button>
      {open && (
        <div className="roster-share-menu">
          {week.length > 0 && (
            <WhatsAppButton
              className="small"
              label={`שיתוף השבוע הקרוב (${formatDateRange(today, weekEnd)})`}
              text={rosterText(`שבצ"ק ${formatDateRange(today, weekEnd)}`, week, appLink())}
            />
          )}
          {inMonth.length > 0 && (
            <WhatsAppButton
              className="small"
              label={`שיתוף כל ${monthTitle(month)}`}
              text={rosterText(`שבצ"ק ${monthTitle(month)}`, inMonth, appLink())}
            />
          )}
        </div>
      )}
    </div>
  );
}
