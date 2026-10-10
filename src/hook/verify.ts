/**
 * Safety check for the pre-commit hook. A formatted file is only written if it differs from the original in
 * whitespace and keyword/identifier case alone.
 */

// Jinja lexes quoted strings inside {{ }} and {% %}, so a closing delimiter within quotes doesn't end the tag
// (e.g. `{{ config(pre_hook="{{ f(this) }}") }}`). A regex can't do this in linear time when a quote never closes,
// so the tag is scanned by hand; a quote with no partner is an ordinary character and the tag ends at the first
// delimiter after it.
const findTagEnd = (text: string, start: number): number => {
  const close = text.charAt(start + 1) === '{' ? '}}' : '%}';
  const unclosed: { [quote: string]: boolean } = {};
  let i = start + 2;
  while (i < text.length) {
    const c = text.charAt(i);
    if ((c === "'" || c === '"') && !unclosed[c]) {
      let j = i + 1;
      while (j < text.length && text.charAt(j) !== c) {
        j += text.charAt(j) === '\\' ? 2 : 1;
      }
      if (j < text.length) {
        i = j + 1;
        continue;
      }
      unclosed[c] = true; // nothing later can close it either, so later quotes of this kind aren't rescanned
    } else if (text.startsWith(close, i)) {
      return i + 2;
    }
    i++;
  }
  return -1;
};

// Order matters: the earliest opener in the text wins, so quotes inside comments (and vice versa) are handled.
// Quoted forms are the ones the formatter's tokenizer treats as one unit (Tokenizer.createStringPattern): '..' and
// ".." with backslash or doubled-quote escapes, `..`, and [..] (SQL Server style).
// Each opener is matched against its full form with a regex. When that fails (an unterminated quote or
// comment), no later opener of the same kind can succeed either, so it is remembered and skipped. That keeps
// scanning linear on malformed files instead of rescanning the rest of the text from every opener.
const OPENER_RE = /\{#|\{\{|\{%|--|\/\/|\/\*|\$\$|'|"|`|\[/g;
const sticky = (re: RegExp): RegExp => new RegExp(re.source, 'y');
// Sticky, so a failed attempt at an opener never searches ahead for a later match.
const FORMS: { [opener: string]: RegExp } = {
  '{#': sticky(/\{#[\s\S]*?#\}/),
  '--': sticky(/--[^\n]*/),
  '//': sticky(/\/\/[^\n]*/),
  '/*': sticky(/\/\*[\s\S]*?\*\//),
  $$: sticky(/\$\$[\s\S]*?\$\$/),
  "'": sticky(/'(?:[^'\\]|\\[\s\S]|'')*'/),
  '"': sticky(/"(?:[^"\\]|\\[\s\S]|"")*"/),
  '`': sticky(/`[^`]*`/),
  '[': sticky(/\[[^\]]*\]/),
};

/** End offset of the token opening at `start`, or -1 if it never closes. */
const findTokenEnd = (text: string, start: number, opener: string): number => {
  if (opener === '{{' || opener === '{%') {
    return findTagEnd(text, start);
  }
  const form = FORMS[opener];
  form.lastIndex = start;
  const m = form.exec(text);
  return m ? start + m[0].length : -1;
};
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
  const unterminated: { [opener: string]: boolean } = {};
  let skeleton = '';
  let last = 0;
  OPENER_RE.lastIndex = 0;
  for (let m = OPENER_RE.exec(text); m; m = OPENER_RE.exec(text)) {
    const offset = m.index;
    const opener = m[0];
    if (unterminated[opener]) {
      continue;
    }
    const end = findTokenEnd(text, offset, opener);
    if (end < 0) {
      unterminated[opener] = true; // left as plain text
      continue;
    }
    tokens.push(text.slice(offset, end));
    const before = offset > 0 ? text.charAt(offset - 1) : '';
    const after = end < text.length ? text.charAt(end) : '';
    glue.push([WORD_CHAR.test(before), WORD_CHAR.test(after)]);
    skeleton += text.slice(last, offset) + '\u0000';
    last = end;
    OPENER_RE.lastIndex = end;
  }
  return { tokens, glue, skeleton: skeleton + text.slice(last) };
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
