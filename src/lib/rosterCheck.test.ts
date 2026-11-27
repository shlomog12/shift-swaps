import { describe, expect, it } from 'vitest';
import { checkName } from './rosterCheck';

const roster = ['דניאלי', 'יהושע', 'Avi Cohen'];

describe('checkName', () => {
  it('accepts roster names, also with other spacing or case', () => {
    expect(checkName('דניאלי', roster)).toEqual({ status: 'known', name: 'דניאלי' });
    expect(checkName('  דניאלי ', roster)).toEqual({ status: 'known', name: 'דניאלי' });
    expect(checkName('avi  cohen', roster)).toEqual({ status: 'known', name: 'Avi Cohen' });
  });

  it('flags a typo with the close roster name', () => {
    expect(checkName('דנאלי', roster)).toEqual({ status: 'new', suggestion: 'דניאלי' });
  });

  it('flags a new name with no suggestion', () => {
    expect(checkName('מישהו אחר לגמרי', roster)).toEqual({ status: 'new', suggestion: null });
  });

  it('treats empty as empty', () => {
    expect(checkName('  ', roster)).toEqual({ status: 'empty' });
    expect(checkName(null, roster)).toEqual({ status: 'empty' });
  });
});
