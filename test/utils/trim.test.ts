import { trimEnd, trimSpaces } from '../../src/utils/normalize';

describe('trimEnd', () => {
  it('removes all trailing whitespace', () => {
    expect(trimEnd('abc \n\t \r\n')).toBe('abc');
  });
  it('keeps leading and inner whitespace', () => {
    expect(trimEnd('  a b  ')).toBe('  a b');
  });
  it('handles empty and all-whitespace input', () => {
    expect(trimEnd('')).toBe('');
    expect(trimEnd(' \n ')).toBe('');
  });
});

describe('trimSpaces', () => {
  it('removes trailing spaces only', () => {
    expect(trimSpaces('abc  ')).toBe('abc');
    expect(trimSpaces('abc \n')).toBe('abc \n');
  });
});
