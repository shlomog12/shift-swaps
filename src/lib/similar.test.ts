import { describe, expect, it } from 'vitest';
import { normalizeName, similarNames } from './similar';

const roster = ['דניאלי', 'יהושע', 'דני כהן', 'משה', 'בן חיים', 'אביטל'];

describe('similar names', () => {
  it('normalizes spelling details', () => {
    expect(normalizeName('  בֶּן   חַיִּים ')).toBe('בנ חיימ');
    expect(normalizeName("בן-חיים")).toBe(normalizeName('בן חיים'));
  });

  it('suggests names a typo away', () => {
    expect(similarNames('דנאלי', roster)).toEqual(['דניאלי']);
    expect(similarNames('יהושוע', roster)).toEqual(['יהושע']);
    expect(similarNames('בן-חיים', roster)).toEqual(['בן חיים']);
  });

  it('suggests a name sharing a whole word', () => {
    expect(similarNames('דני', roster)).toContain('דני כהן');
  });

  it('does not suggest unrelated or identical names', () => {
    expect(similarNames('רונית', roster)).toEqual([]);
    expect(similarNames('משה', roster)).toEqual([]);
    expect(similarNames('א', roster)).toEqual([]);
  });

  it('keeps short names strict', () => {
    // One letter apart is a typo for a short name; two letters is a different name.
    expect(similarNames('משי', roster)).toEqual(['משה']);
    expect(similarNames('מאיר', roster)).toEqual([]);
  });
});
