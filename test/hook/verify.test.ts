import { verify } from '../../src/hook/verify';

describe('verify', () => {
  it('accepts identical text', () => {
    expect(verify('select 1', 'select 1')).toBeNull();
  });

  it('accepts whitespace and case changes', () => {
    expect(verify('select a,b from t', 'SELECT\n    a,\n    B\nFROM\n    t\n')).toBeNull();
  });

  it('rejects a changed string literal, including its case', () => {
    expect(verify("select 'Abc' from t", "select 'abc' from t")).toMatch(/literal altered/);
  });

  it('rejects a changed quoted identifier', () => {
    expect(verify('select "Col" from t', 'select "col" from t')).toMatch(/literal altered/);
  });

  it('rejects whitespace inserted inside a multi-character operator', () => {
    expect(verify('select a::int', 'select a : : int')).toMatch(/sql token/);
    expect(verify('select a <= b', 'select a < = b')).toMatch(/sql token/);
  });

  it('rejects whitespace inside a number', () => {
    expect(verify('select 1.5', 'select 1 . 5')).toMatch(/sql token/);
  });

  it('rejects a changed comment but allows re-wrapped whitespace in one', () => {
    expect(verify('select 1 -- Keep THIS', 'select 1 -- keep this')).toMatch(/comment altered/);
    expect(verify('/* a\n   b */ select 1', '/* a b */ select 1')).toBeNull();
  });

  it('rejects a changed jinja expression or string', () => {
    expect(verify("{{ ref('A') }}", "{{ ref('a') }}")).toMatch(/jinja/);
    expect(verify('{{ x }}', '{{ y }}')).toMatch(/jinja altered/);
  });

  it('accepts whitespace changes inside a jinja tag', () => {
    expect(verify("{{config(materialized='table')}}", "{{ config(materialized='table') }}")).toBeNull();
  });

  it('rejects a space inserted between a word and a jinja variable', () => {
    expect(verify('select a_{{ x }} from t', 'select a_ {{ x }} from t')).toMatch(/next to jinja/);
  });

  it('rejects a newline inserted between a jinja variable and a word', () => {
    expect(verify('select {{ x }}_id from t', 'select {{ x }}\n_id from t')).toMatch(/next to jinja/);
  });

  it('rejects a jinja variable that gets glued to a word', () => {
    expect(verify('select a {{ x }} from t', 'select a{{ x }} from t')).toMatch(/next to jinja/);
  });

  it('allows whitespace changes around jinja tags that touch no word', () => {
    expect(verify('select\n{% if x %} a {% endif %}\nfrom t', 'select\n    {% if x %}\n  a\n{% endif %}\nfrom t')).toBeNull();
    expect(verify("select a,{{ b }}", 'select\n    a,\n    {{ b }}')).toBeNull();
  });

  it('rejects a changed token count', () => {
    expect(verify('select a from t', 'select a, from t')).toMatch(/sql token count/);
  });
});
