import { SLOT_HOURS, addDays, dayName, formatShortDate } from './dates';
import type { Shift } from './types';

/**
 * The roster as a WhatsApp message, one line per night, naming both days so a midnight shift is not
 * read as the night after: "3.12 · בין רביעי לחמישי: 00:00–03:00 דני · 03:00–06:00 יוסי"
 */
export function rosterText(title: string, shifts: Shift[], link: string): string {
  const nights = new Map<string, Shift[]>();
  for (const s of [...shifts].sort((a, b) => a.night.localeCompare(b.night) || a.slot - b.slot)) {
    nights.set(s.night, [...(nights.get(s.night) ?? []), s]);
  }
  const lines = [...nights].map(([night, list]) => {
    const slots = list.map((s) => `${SLOT_HOURS[s.slot]} ${s.assignee ?? 'פנוי'}`).join(' · ');
    return `${formatShortDate(night)} · בין ${dayName(addDays(night, -1))} ל${dayName(night)}: ${slots}`;
  });
  return `${title}\n\n${lines.join('\n')}\n\nלחילופים ולפרטים:\n${link}`;
}

/**
 * My own shifts as a personal WhatsApp message (e.g. to family): one line per shift, both days of the night
 * named, no link, since the reader may not use the app.
 */
export function myShiftsText(title: string, shifts: Shift[]): string {
  const lines = [...shifts]
    .sort((a, b) => a.night.localeCompare(b.night) || a.slot - b.slot)
    .map((s) => `• ${formatShortDate(s.night)} · הלילה שבין ${dayName(addDays(s.night, -1))} ל${dayName(s.night)} · ${SLOT_HOURS[s.slot]}`);
  return lines.length > 0 ? `${title}\n${lines.join('\n')}` : `${title}\nאין משמרות.`;
}
