import { isoDate } from './dates';

export interface ImportRow {
  night: string;
  slot1: string | null;
  slot2: string | null;
}

export interface ImportResult {
  rows: ImportRow[];
  /** Non-empty lines that did not start with a recognizable date (titles, headers, notes). */
  skipped: string[];
  /** Dates that appeared more than once; the last occurrence wins. */
  duplicates: string[];
}

const DATE_PATTERN = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/;
const DAY_LABEL_PATTERN = /ליל|בלילה|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת/;

function parseDate(cell: string): string | null {
  const match = DATE_PATTERN.exec(cell.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  return isoDate(year, month, day);
}

function cleanName(cell: string | undefined): string | null {
  const name = (cell ?? '').replace(/\s+/g, ' ').trim();
  return name === '' ? null : name;
}

/**
 * Splits delimited text into rows of cells. Handles quoted fields ("a, b", doubled "" quotes and line
 * breaks inside quotes), as produced by Google Sheets for both CSV downloads and copied cells.
 */
export function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Parses a table pasted from Google Sheets (tab separated) or a CSV file downloaded from it.
 * Expected columns: date, optional day label ("ליל חמישי- רביעי בלילה"), first shift, second shift.
 * Columns before the date are ignored.
 */
export function parseSheet(text: string): ImportResult {
  const byNight = new Map<string, ImportRow>();
  const skipped: string[] = [];
  const duplicates = new Set<string>();

  const delimiter = text.includes('\t') ? '\t' : ',';
  for (const cells of splitRows(text.replace(/^\uFEFF/, ''), delimiter)) {
    if (cells.every((cell) => cell.trim() === '')) continue;

    const dateIndex = cells.findIndex((cell) => parseDate(cell) !== null);
    if (dateIndex === -1) {
      skipped.push(cells.join(delimiter).trim());
      continue;
    }

    const night = parseDate(cells[dateIndex])!;
    let next = dateIndex + 1;
    if (DAY_LABEL_PATTERN.test(cells[next] ?? '')) next += 1;

    if (byNight.has(night)) duplicates.add(night);
    byNight.set(night, { night, slot1: cleanName(cells[next]), slot2: cleanName(cells[next + 1]) });
  }

  const rows = [...byNight.values()].sort((a, b) => a.night.localeCompare(b.night));
  return { rows, skipped, duplicates: [...duplicates].sort() };
}
