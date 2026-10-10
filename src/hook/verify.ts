/**
 * Safety check for the pre-commit hook. A formatted file is only written if it differs from the original in
 * whitespace and keyword/identifier case alone.
 */

// Jinja lexes quoted strings inside {{ }} and {% %}, so a closing delimiter within quotes doesn't end the tag
// (e.g. `{{ config(pre_hook="{{ f(this) }}") }}`). Falls back to the first delimiter if a quote never closes.
const JINJA_STR = /'(?:[^'\\]|\\[\s\S])*'|"(?:[^"\\]|\\[\s\S])*"/.source;
const JINJA_EXPR = new RegExp(`\\{\\{(?:${JINJA_STR}|[^}'"]|\\}(?!\\})|['"])*?\\}\\}`);
const JINJA_STMT = new RegExp(`\\{%(?:${JINJA_STR}|[^%'"]|%(?!\\})|['"])*?%\\}`);
// Order matters: the earliest match in the text wins, so quotes inside comments (and vice versa) are handled.
// Quoted forms are the ones the formatter's tokenizer treats as one unit (Tokenizer.createStringPattern): '..' and
// ".." with backslash or doubled-quote escapes, `..`, and [..] (SQL Server style).
const TOKEN_RE = new RegExp(
  [
    /\{#[\s\S]*?#\}/,
    JINJA_EXPR,
    JINJA_STMT,
    /--[^\n]*/,
    /\/\/[^\n]*/,
    /\/\*[\s\S]*?\*\//,
    /\$\$[\s\S]*?\$\$/,
    /'(?:[^'\\]|\\[\s\S]|'')*'/,
    /"(?:[^"\\]|\\[\s\S]|"")*"/,
    /`[^`]*`/,
    /\[[^\]]*\]/,
  ]
    .map(r => r.source)
    .join('|'),
  'g'
);
const STRING_RE = /'(?:[^']|'')*'|"(?:[^"]|"")*"/g;
// Words, numbers and multi-char operators are atomic: whitespace appearing inside one (`: :`, `< =`, `1 . 5`)
// is a real change.
const SQL_TOKEN_RE = /\u0000|[A-Za-z_][A-Za-z0-9_$]*|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|::|<=|>=|<>|!=|\|\||->>|->|=>|:=|\S/g;
const WORD_CHAR = /\w/;

type Kind = 'jinja-comment' | 'jinja' | 'comment' | 'literal';

interface Tokenized {
  tokens: string[];
  /** For each token, whether a word character touches it on the left and on the right. */
  glue: Array<[boolean, boolean]>;
  skeleton: string;
}

const squash = (s: string): string => s.replace(/\s+/g, '');
const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
const sqlTokens = (skeleton: string): string[] => (skeleton.match(SQL_TOKEN_RE) || []).map(t => t.toLowerCase());

const tokenize = (text: string): Tokenized => {
  const tokens: string[] = [];
  const glue: Array<[boolean, boolean]> = [];
  const skeleton = text.replace(TOKEN_RE, (match: string, offset: number) => {
    tokens.push(match);
    const before = offset > 0 ? text.charAt(offset - 1) : '';
    const after = offset + match.length < text.length ? text.charAt(offset + match.length) : '';
    glue.push([WORD_CHAR.test(before), WORD_CHAR.test(after)]);
    return '\u0000';
  });
  return { tokens, glue, skeleton };
};

const kind = (tok: string): Kind => {
  if (tok.startsWith('{#')) {
    return 'jinja-comment';
  }
  if (tok.startsWith('{{') || tok.startsWith('{%')) {
    return 'jinja';
  }
  if (tok.startsWith('--') || tok.startsWith('//') || tok.startsWith('/*')) {
    return 'comment';
  }
  return 'literal'; // quoted strings, quoted identifiers, $$ blocks
};

const preview = (s: string, n: number = 60): string => JSON.stringify(s.slice(0, n));

/** Returns null when `after` differs from `before` only in whitespace and case, otherwise a reason. */
export const verify = (before: string, after: string): string | null => {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.tokens.length !== b.tokens.length) {
    return `literal/comment/jinja count changed (${a.tokens.length} -> ${b.tokens.length})`;
  }
  for (let i = 0; i < a.tokens.length; i++) {
    const x = a.tokens[i];
    const y = b.tokens[i];
    const k = kind(x);
    if (k !== kind(y)) {
      return `token kind changed near ${preview(x, 40)}`;
    }
    if (k === 'literal' && x !== y) {
      return `literal altered: ${preview(x)} -> ${preview(y)}`;
    }
    if ((k === 'comment' || k === 'jinja-comment') && collapse(x) !== collapse(y)) {
      return `comment altered: ${preview(x)}`;
    }
    if (k === 'jinja') {
      if (squash(x) !== squash(y)) {
        return `jinja altered: ${preview(x)} -> ${preview(y)}`;
      }
      const sx = x.match(STRING_RE) || [];
      const sy = y.match(STRING_RE) || [];
      if (sx.length !== sy.length || sx.some((s, j) => s !== sy[j])) {
        return `jinja string altered in ${preview(x)}`;
      }
      // `prefix_{{ x }}` -> `prefix_ {{ x }}` changes what the template renders.
      if (a.glue[i][0] !== b.glue[i][0] || a.glue[i][1] !== b.glue[i][1]) {
        return `whitespace next to jinja changed near ${preview(x, 40)}`;
      }
    }
  }
  const ta = sqlTokens(a.skeleton);
  const tb = sqlTokens(b.skeleton);
  if (ta.length !== tb.length) {
    return `sql token count changed (${ta.length} -> ${tb.length})`;
  }
  for (let i = 0; i < ta.length; i++) {
    if (ta[i] !== tb[i]) {
      return `sql token changed: ${JSON.stringify(ta[i])} -> ${JSON.stringify(tb[i])} (token ${i})`;
    }
  }
  return null;
};
