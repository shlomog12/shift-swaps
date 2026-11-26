// Builds an iCalendar (RFC 5545) feed of one person's shifts. Pure code, no Deno APIs, so it is unit-tested
// with the app's tests.

export interface FeedShift {
  night: string; // YYYY-MM-DD: the date the shift hours fall on (it starts at midnight)
  slot: 1 | 2;
  swap_requested: boolean;
  updated_at: string;
}

const TIME_ZONE = 'Asia/Jerusalem';
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HOURS: Record<1 | 2, [number, number]> = { 1: [0, 3], 2: [3, 6] };

function dayName(iso: string, offset = 0): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return DAY_NAMES[d.getUTCDay()];
}

/** The UTC instant of a wall-clock time in Israel (handles summer time). */
export function israelToUtc(iso: string, hour: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  const parts: Record<string, number> = {};
  for (const p of new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour);
  return new Date(guess - (shown - guess));
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Folds a content line at 75 octets, never splitting a UTF-8 character. */
function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function buildIcs(owner: string, shifts: FeedShift[], appUrl: string, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shift-swaps//calendar-feed//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`שמירות – ${owner}`)}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const s of shifts) {
    const [from, to] = HOURS[s.slot];
    const range = `${String(from).padStart(2, '0')}:00–${String(to).padStart(2, '0')}:00`;
    const description = [
      `הלילה שבין ${dayName(s.night, -1)} ל${dayName(s.night)}, ${range}.`,
      s.swap_requested ? 'יש בקשת חילוף פתוחה על המשמרת.' : '',
      appUrl ? `לחילופים ולפרטים: ${appUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      // One event per shift slot; the same shift keeps its UID, so calendar apps update it in place.
      `UID:${s.night}-${s.slot}@shift-swaps`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(new Date(s.updated_at || now))}`,
      `DTSTART:${stamp(israelToUtc(s.night, from))}`,
      `DTEND:${stamp(israelToUtc(s.night, to))}`,
      `SUMMARY:${escapeText(`שמירה ${range}${s.swap_requested ? ' · בקשת חילוף' : ''}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      ...(appUrl ? [`URL:${appUrl}`] : []),
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
