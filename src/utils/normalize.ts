// Strip trailing whitespace without a regex. lodash's trimEnd (before 4.17.21) uses /\s+$/, which is quadratic on
// long whitespace runs: a 65 KB macro took ~100 s.
export const trimEnd = (st: string): string => {
  let end = st.length;
  while (end > 0 && /\s/.test(st.charAt(end - 1))) {
    end--;
  }
  return st.slice(0, end);
};

// Strip trailing spaces (not newlines).
export const trimSpaces = (st: string): string => {
  let end = st.length;
  while (end > 0 && st.charCodeAt(end - 1) === 32) {
    end--;
  }
  return st.slice(0, end);
};

// Replace any sequence of whitespace characters with single whitespace
export const equalizeWhitespace = (st: string): string => {
  return st.replace(/\s+/g, ' ');
};

export const addWhitespace = (st: string, pre: boolean = false): string => {
  if (pre) {
    return equalizeWhitespace(' ' + st);
  }

  return equalizeWhitespace(st + ' ');
};

export const removeWhitespace = (st: string): string => {
  return st.replace(/\s+/g, '');
};

export const isCamelCase = (token: string): boolean => {
  let newToken = token;
  const firstLower = token[0] === token[0].toLowerCase();
  const slice = newToken.length > 1 ? token.slice(1, token.length) : newToken;
  const containsUpper = slice.toLowerCase() !== slice;
  return firstLower && containsUpper;
};
