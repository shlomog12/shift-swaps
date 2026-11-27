import { dayMarks, hebrewDate } from '../lib/hebrewDate';
import { useHebrewDates } from '../lib/hebrewSetting';

/** Tags for the holiday, the eve of a day of rest, and Shabbat or its eve, on that night; none if plain. */
export function HolidayTag({ night }: { night: string }) {
  const { holiday, eve, shabbat } = dayMarks(night);
  return (
    <>
      {holiday && <span className={holiday.major ? 'tag holiday-tag major' : 'tag holiday-tag'}>{holiday.name}</span>}
      {eve && <span className="tag holiday-tag eve">{eve}</span>}
      {shabbat && <span className="tag shabbat-tag">{shabbat === 'shabbat' ? 'שבת' : 'ערב שבת'}</span>}
    </>
  );
}

/** The Hebrew date (when the user shows Hebrew dates) and the day's tags, under a night's heading. */
export function HebrewLine({ night }: { night: string }) {
  const [hebrew] = useHebrewDates();
  const { holiday, eve, shabbat } = dayMarks(night);
  if (!hebrew && !holiday && !eve && !shabbat) return null;
  return (
    <p className="hebrew-line">
      {hebrew && <span className="muted small">{hebrewDate(night)}</span>}
      <HolidayTag night={night} />
    </p>
  );
}
