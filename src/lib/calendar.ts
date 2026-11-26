import { SLOT_HOURS, nightLabel } from './dates';
import type { Slot } from './types';

const START: Record<Slot, string> = { 1: '000000', 2: '030000' };
const END: Record<Slot, string> = { 1: '030000', 2: '060000' };

/** Opens Google Calendar with the shift filled in, in Israel time. */
export function googleCalendarUrl(night: string, slot: Slot, link: string): string {
  const day = night.replaceAll('-', '');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `שמירה ${SLOT_HOURS[slot].replace(/[⁠⁦⁩]/g, '')}`,
    dates: `${day}T${START[slot]}/${day}T${END[slot]}`,
    ctz: 'Asia/Jerusalem',
    details: `${nightLabel(night)}.\nלחילופים ולפרטים: ${link}`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
