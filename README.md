[![CircleCI](https://circleci.com/gh/henriblancke/dbt-formatter/tree/master.svg?style=svg)](https://circleci.com/gh/henriblancke/dbt-formatter/tree/master)

# DBT Formatter

### About this fork

Fork of [henriblancke/dbt-formatter](https://github.com/henriblancke/dbt-formatter), maintained for the dbt projects at Strata Decision. Differences from upstream 1.3.0:

- Names built from Jinja stay intact. `{{ a }}_{{ b }}` and `prefix_{{ x }}` used to get a space or a newline inserted, which changes the rendered SQL.
- A `{% %}` tag written directly against a word (`a{% if x %}_b{% endif %}`) leaves the query untouched instead of being re-indented.
- `--` comments are preserved in files with Windows (CRLF) line endings. They used to be formatted as SQL.
- Large files are much faster: no quadratic `trimEnd` (lodash before 4.17.21) and no per-token scan of the rest of the file.

### Install

```bash
npm install -s dbt-formatter
```

### Usage

```javascript
import formatter from 'dbt-formatter';

const mySql = "SELECT * FROM {{ ref('myTableRef') }}";
const myOpts = { sql: 'default', indent: 2, upper: false };

formatter.format(mySql, myOpts);
```

This will result in:

```sql
SELECT
  *
FROM
  {{ ref('myTableRef') }}
```

### Usage options

Fine tune `dbt-formatter` behavior with the following options:

| Option         | Default   | Description                                                            |
| -------------- | --------- | ---------------------------------------------------------------------- |
| sql            | `default` | The sql dialect you want to use, currently only `default` is available |
| indent         | `2`       | How many spaces you want an indentation to be                          |
| upper          | `false`   | Formats sql reserved words to be uppercase when set to `true`          |
| newline        | `false`   | Appends a new line at the end of the formatted sql string              |
| lowerWords     | `false`   | Lowercases all `words` as identified by the tokenizer                  |
| allowCamelcase | `true`    | Allows column names to be camelcased                                   |

## Development

### NPM scripts

- `npm test`: Run test suite
- `npm start`: Run `npm run build` in watch mode
- `npm run build`: Generate bundles and typings, create docs
- `npm run lint`: Lints code
- `npm run package`: Package dbt-formatter as a binary

## Roadmap

- Add more sql dialects:
  - [x] snowflake
  - [ ] redshift
  - [ ] bigquery
  - [ ] postgres
  - [ ] presto
