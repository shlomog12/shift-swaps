import { describe, expect, it } from 'vitest';
import { parseSheet } from './importSheet';

describe('parseSheet', () => {
  it('reads the Google Sheets layout and skips titles and headers', () => {
    const text = [
      'שבצ"ק שמירת תושבים\t\t\t',
      '\t\t\t',
      'תאריך\tיום בשבוע\t00:00-3:00\t3:00-6:00',
      '1.10.2026\tליל חמישי- רביעי בלילה\tיהושע\tדניאלי',
      '2.10.2026\tליל שישי- חמישי בלילה\tאהרוני  יהונתן \tבוסי',
      '3.10.2026\tליל שבת- שישי בלילה\t\tדהן',
    ].join('\n');

    const result = parseSheet(text);

    expect(result.rows).toEqual([
      { night: '2026-10-01', slot1: 'יהושע', slot2: 'דניאלי' },
      { night: '2026-10-02', slot1: 'אהרוני יהונתן', slot2: 'בוסי' },
      { night: '2026-10-03', slot1: null, slot2: 'דהן' },
    ]);
    expect(result.skipped).toHaveLength(2);
    expect(result.duplicates).toEqual([]);
  });

  it('works without the day label column and with other date formats', () => {
    const result = parseSheet('05/11/26\tחסן\tלוי\n6-11-2026,כהן,');
    expect(result.rows).toEqual([
      { night: '2026-11-05', slot1: 'חסן', slot2: 'לוי' },
      { night: '2026-11-06', slot1: 'כהן', slot2: null },
    ]);
  });

  it('rejects impossible dates and reports duplicates', () => {
    const result = parseSheet('31.2.2026\tא\tב\n1.3.2026\tא\tב\n1.3.2026\tג\tד');
    expect(result.rows).toEqual([{ night: '2026-03-01', slot1: 'ג', slot2: 'ד' }]);
    expect(result.duplicates).toEqual(['2026-03-01']);
    expect(result.skipped).toEqual(['31.2.2026\tא\tב']);
  });

  it('ignores columns before the date', () => {
    const result = parseSheet('x\t7.10.2026\tליל רביעי- שלישי בלילה\tאהרוני נעם\tגדליוביץ');
    expect(result.rows).toEqual([{ night: '2026-10-07', slot1: 'אהרוני נעם', slot2: 'גדליוביץ' }]);
  });
});
