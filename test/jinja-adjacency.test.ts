import formatter from '../src/dbt-formatter';

const options = { sql: 'default', indent: 4, upper: true, lowerWords: true, allowCamelcase: true };

describe('jinja variables written against neighbouring words', () => {
  it('keeps a prefix attached', () => {
    const out = formatter('select measure_value_percentile_{{ percentile }} as x from t', options);
    expect(out).toContain('measure_value_percentile_{{ percentile }} AS x');
  });

  it('keeps a suffix attached', () => {
    const out = formatter('select {{ col }}_id as x from t', options);
    expect(out).toContain('{{ col }}_id AS x');
  });

  it('keeps a prefix and a suffix attached', () => {
    expect(formatter('select a_{{ x }}_b from t', options)).toContain('a_{{ x }}_b');
  });

  it('keeps two variables attached', () => {
    expect(formatter('select {{ schema }}{{ model }} from t', options)).toContain('{{ schema }}{{ model }}');
  });

  it('keeps a suffix attached to a ref in a from clause', () => {
    expect(formatter("select * from {{ ref('a') }}_hist", options)).toContain("{{ ref('a') }}_hist");
  });

  it('still separates a variable from a following keyword', () => {
    const out = formatter('select {{ col }} as x from t', options);
    expect(out).toContain('{{ col }} AS x');
  });

  it('leaves dotted and call-style neighbours alone', () => {
    expect(formatter('select {{ alias }}.col from t', options)).toContain('{{ alias }}.col');
    expect(formatter('select {{ fn }}(a) from t', options)).toContain('{{ fn }}(');
  });
});

describe('jinja tags written against a word', () => {
  it('returns the query unchanged, since re-indenting could change the rendered SQL', () => {
    const query = 'select a{% if x %}_b{% endif %} from t';
    expect(formatter(query, options)).toBe(query);
  });

  it('formats a normal tag as before', () => {
    const out = formatter('select a {% if x %} , b {% endif %} from t', options);
    expect(out).not.toBe('select a {% if x %} , b {% endif %} from t');
  });
});

describe('line comments', () => {
  it('are preserved verbatim in files with Windows line endings', () => {
    const query = 'select\r\n    a,\r\n    --ds.x      as y,\r\n    b\r\nfrom t\r\n';
    const out = formatter(query, options);
    expect(out).toContain('--ds.x      as y,');
    expect(out).not.toContain('AS y');
  });

  it('are preserved verbatim with Unix line endings', () => {
    const out = formatter('select\n    a,\n    --ds.x      as y,\n    b\nfrom t\n', options);
    expect(out).toContain('--ds.x      as y,');
  });
});

describe('performance', () => {
  it('formats a query with long whitespace runs in linear time', () => {
    const body = Array.from({ length: 400 }, (_, i) => `col_${i}  ${' '.repeat(300)}  as c${i},`).join('\n');
    const started = Date.now();
    formatter(`select\n${body}\n z from t`, options);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
