import * as fs from 'fs';
import format from '../dbt-formatter';
import { verify } from './verify';

export const IGNORE_MARKER = 'dbt-formatter-ignore';

export interface HookOptions {
  check: boolean;
  strict: boolean;
  maxBytes: number;
  indent: number;
  upper: boolean;
  lowerWords: boolean;
  camelCase: boolean;
  newline: boolean;
  files: string[];
}

export type Status = 'changed' | 'unchanged' | 'unsafe' | 'unstable' | 'ignored' | 'skipped' | 'error';

export interface Result {
  status: Status;
  detail?: string;
}

const USAGE = `usage: dbt-formatter-hook [options] FILE...

Formats dbt SQL files in place. A file is only rewritten if the result differs from the original in whitespace
and case alone, and formatting the result again gives the same text; otherwise it is left untouched and reported
as "unsafe" or "unstable".

  --check             report what would change, write nothing
  --strict            exit 1 for "unsafe" and "unstable" files too
  --max-bytes N       skip files larger than N bytes (default 500000, 0 = no limit)
  --indent N          spaces per indent level (default 4)
  --no-upper          do not uppercase reserved words
  --no-lower-words    do not lowercase identifiers
  --no-camel-case     lowercase camelCase identifiers too
  --no-newline        no trailing newline

A file whose first line contains "${IGNORE_MARKER}" is skipped.`;

export const parseArgs = (argv: string[]): HookOptions => {
  const opts: HookOptions = {
    check: false,
    strict: false,
    maxBytes: 500000,
    indent: 4,
    upper: true,
    lowerWords: true,
    camelCase: true,
    newline: true,
    files: [],
  };
  const integer = (flag: string, value: string | undefined): number => {
    const n = Number(value);
    if (value === undefined || !Number.isInteger(n) || n < 0) {
      throw new Error(`${flag} needs a non-negative integer`);
    }
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') {
      opts.check = true;
    } else if (a === '--strict') {
      opts.strict = true;
    } else if (a === '--no-upper') {
      opts.upper = false;
    } else if (a === '--no-lower-words') {
      opts.lowerWords = false;
    } else if (a === '--no-camel-case') {
      opts.camelCase = false;
    } else if (a === '--no-newline') {
      opts.newline = false;
    } else if (a === '--indent') {
      opts.indent = integer(a, argv[++i]);
    } else if (a === '--max-bytes') {
      opts.maxBytes = integer(a, argv[++i]);
    } else if (a === '-h' || a === '--help') {
      throw new Error(USAGE);
    } else if (a.startsWith('--')) {
      throw new Error(`unknown option ${a}\n${USAGE}`);
    } else {
      opts.files.push(a);
    }
  }
  return opts;
};

export const formatFile = (file: string, opts: HookOptions): Result => {
  const stat = fs.statSync(file);
  if (opts.maxBytes > 0 && stat.size > opts.maxBytes) {
    return { status: 'skipped', detail: 'larger than --max-bytes' };
  }
  const original = fs.readFileSync(file, 'utf8');
  if (original.split('\n', 1)[0].indexOf(IGNORE_MARKER) !== -1) {
    return { status: 'ignored' };
  }
  const formatOptions = {
    sql: 'default',
    indent: opts.indent,
    upper: opts.upper,
    lowerWords: opts.lowerWords,
    allowCamelcase: opts.camelCase,
    newline: opts.newline,
  };
  let formatted: string;
  let again: string;
  try {
    formatted = format(original, formatOptions);
    again = format(formatted, formatOptions);
  } catch (e) {
    return { status: 'error', detail: e.message };
  }
  if (typeof formatted !== 'string' || formatted.trim().length === 0) {
    return { status: 'error', detail: 'formatter returned empty output' };
  }
  if (formatted === original) {
    return { status: 'unchanged' };
  }
  const problem = verify(original, formatted);
  if (problem) {
    return { status: 'unsafe', detail: problem };
  }
  if (again !== formatted) {
    // A hook that rewrites a file differently on every run can never pass.
    return { status: 'unstable', detail: 'formatting the result again changes it' };
  }
  if (!opts.check) {
    const tmp = `${file}.dbtfmt.tmp`;
    fs.writeFileSync(tmp, formatted, { mode: stat.mode });
    fs.renameSync(tmp, file);
  }
  return { status: 'changed' };
};

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

/** Runs the hook and returns the process exit code. */
export const run = (argv: string[], io: Io): number => {
  let opts: HookOptions;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    io.err(e.message);
    return 2;
  }
  let exit = 0;
  for (const file of opts.files) {
    let result: Result;
    const started = Date.now();
    try {
      // A path like `foo.sql/` (a directory) or an unreadable file must not abort the rest of the batch.
      result = fs.statSync(file).isFile()
        ? formatFile(file, opts)
        : { status: 'skipped', detail: 'not a regular file' };
    } catch (e) {
      result = { status: 'error', detail: e.message };
    }
    const ms = Date.now() - started;
    if (ms > 2000) {
      io.err(`slow\t${file}\t${ms}ms`);
    }
    if (result.status !== 'unchanged') {
      io.out(`${result.status}\t${file}${result.detail ? `\t${result.detail}` : ''}`);
    }
    if (result.status === 'changed' || result.status === 'error' || ((result.status === 'unsafe' || result.status === 'unstable') && opts.strict)) {
      exit = 1;
    }
  }
  return exit;
};
