import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { parseArgs, run } from '../../src/hook/cli';

const makeDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'dbt-hook-'));
const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
};

describe('parseArgs', () => {
  it('has the defaults used for dbt projects', () => {
    const o = parseArgs(['a.sql']);
    expect(o).toMatchObject({ check: false, strict: false, indent: 4, upper: true, lowerWords: true, camelCase: true, newline: true });
    expect(o.files).toEqual(['a.sql']);
  });

  it('reads flags and values', () => {
    const o = parseArgs(['--check', '--strict', '--indent', '2', '--max-bytes', '0', '--no-upper', 'a.sql', 'b.sql']);
    expect(o).toMatchObject({ check: true, strict: true, indent: 2, maxBytes: 0, upper: false });
    expect(o.files).toEqual(['a.sql', 'b.sql']);
  });

  it('rejects unknown flags and bad numbers', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/unknown option/);
    expect(() => parseArgs(['--indent', 'x'])).toThrow(/non-negative integer/);
    expect(() => parseArgs(['--indent'])).toThrow(/non-negative integer/);
  });
});

describe('run', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeDir();
  });
  afterEach(() => {
    fs.rmdirSync(dir, { recursive: true } as any);
  });
  const write = (name: string, text: string): string => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, text);
    return p;
  };

  it('rewrites a file and exits 1, then exits 0 once it is formatted', () => {
    const f = write('a.sql', 'select a_{{ x }} as y from t');
    const first = capture();
    expect(run([f], first.io)).toBe(1);
    expect(first.out[0]).toBe(`changed\t${f}`);
    expect(fs.readFileSync(f, 'utf8')).toContain('a_{{ x }} AS y');
    const second = capture();
    expect(run([f], second.io)).toBe(0);
    expect(second.out).toEqual([]);
  });

  it('writes nothing with --check but still reports a change', () => {
    const text = 'select a from t';
    const f = write('a.sql', text);
    const c = capture();
    expect(run(['--check', f], c.io)).toBe(1);
    expect(fs.readFileSync(f, 'utf8')).toBe(text);
  });

  it('skips files marked dbt-formatter-ignore on the first line', () => {
    const text = '-- dbt-formatter-ignore\nselect a from t';
    const f = write('a.sql', text);
    const c = capture();
    expect(run([f], c.io)).toBe(0);
    expect(c.out[0]).toBe(`ignored\t${f}`);
    expect(fs.readFileSync(f, 'utf8')).toBe(text);
  });

  it('skips files larger than --max-bytes', () => {
    const f = write('a.sql', 'select a from t');
    const c = capture();
    expect(run(['--max-bytes', '5', f], c.io)).toBe(0);
    expect(c.out[0]).toMatch(/^skipped\t/);
  });

  it('does not let a directory or a missing file abort the batch', () => {
    const d = path.join(dir, 'dir.sql');
    fs.mkdirSync(d);
    const good = write('good.sql', 'select a from t');
    const c = capture();
    const code = run([d, path.join(dir, 'missing.sql'), good], c.io);
    expect(code).toBe(1);
    expect(c.out.some(l => l.startsWith('skipped\t') && l.includes('not a regular file'))).toBe(true);
    expect(c.out.some(l => l.startsWith('error\t'))).toBe(true);
    expect(fs.readFileSync(good, 'utf8')).toContain('SELECT');
  });

  it('leaves a file untouched when the tag sits against a word', () => {
    const text = 'select a{% if x %}_b{% endif %} from t\n';
    const f = write('a.sql', text);
    const c = capture();
    expect(run([f], c.io)).toBe(0);
    expect(fs.readFileSync(f, 'utf8')).toBe(text);
  });

  it('keeps repeated runs stable on a file with an indented multi-line block comment', () => {
    const f = write('a.sql', 'select\n    a,\n    b /* one\n       two */,\n    c\nfrom t\n');
    run([f], capture().io);
    const afterFirst = fs.readFileSync(f, 'utf8');
    expect(run([f], capture().io)).toBe(0);
    expect(fs.readFileSync(f, 'utf8')).toBe(afterFirst);
  });

  it('preserves the file mode', () => {
    const f = write('a.sql', 'select a from t');
    fs.chmodSync(f, 0o640);
    run([f], capture().io);
    expect(fs.statSync(f).mode & 0o777).toBe(0o640);
  });
});

describe('built bundle (hook/dbt-formatter-hook.js)', () => {
  const bundle = path.resolve(__dirname, '../../hook/dbt-formatter-hook.js');

  it('exists and formats a file end to end', () => {
    const dir = makeDir();
    const f = path.join(dir, 'm.sql');
    fs.writeFileSync(f, "select {{ col }}_id, 'Keep' as k from {{ ref('a') }}_hist");
    const r = spawnSync('node', [bundle, f], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    const out = fs.readFileSync(f, 'utf8');
    expect(out).toContain('{{ col }}_id');
    expect(out).toContain("{{ ref('a') }}_hist");
    expect(out).toContain("'Keep'");
    expect(spawnSync('node', [bundle, f], { encoding: 'utf8' }).status).toBe(0);
  });

  it('exits 2 on a bad option', () => {
    expect(spawnSync('node', [bundle, '--nope'], { encoding: 'utf8' }).status).toBe(2);
  });

  it('is up to date with the source (run `npm run build:hook`)', () => {
    const tmp = path.join(makeDir(), 'out.js');
    execFileSync(
      path.resolve(__dirname, '../../node_modules/.bin/esbuild'),
      ['src/hook/main.ts', '--bundle', '--platform=node', '--target=node10', '--tsconfig=tsconfig.json', '--banner:js=#!/usr/bin/env node', `--outfile=${tmp}`],
      { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore' },
    );
    expect(fs.readFileSync(tmp, 'utf8')).toBe(fs.readFileSync(bundle, 'utf8'));
  });
});
