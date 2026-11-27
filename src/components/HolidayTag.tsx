import { hebrewDate, holidayOn } from '../lib/hebrewDate';
import { useHebrewDates } from '../lib/hebrewSetting';

/** A small tag naming the holiday, fast or memorial day on that night, if any. */
export function HolidayTag({ night }: { night: string }) {
  const holiday = holidayOn(night);
  if (!holiday) return null;
  return <span className={holiday.major ? 'tag holiday-tag major' : 'tag holiday-tag'}>{holiday.name}</span>;
}

/** The Hebrew date (when the user shows Hebrew dates) and any holiday, under a night's heading. */
export function HebrewLine({ night }: { night: string }) {
  const [hebrew] = useHebrewDates();
  if (!hebrew && !holidayOn(night)) return null;
  return (
    <p className="hebrew-line">
      {hebrew && <span className="muted small">{hebrewDate(night)}</span>}
      <HolidayTag night={night} />
    </p>
  );
}
