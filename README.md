[![CI](https://github.com/waitsfornone/dbt-formatter/actions/workflows/ci.yml/badge.svg)](https://github.com/waitsfornone/dbt-formatter/actions/workflows/ci.yml)

# DBT Formatter

### About this fork

Fork of [henriblancke/dbt-formatter](https://github.com/henriblancke/dbt-formatter), maintained for the dbt projects at Strata Decision. Differences from upstream 1.3.0:

- Names built from Jinja stay intact. `{{ a }}_{{ b }}` and `prefix_{{ x }}` used to get a space or a newline inserted, which changes the rendered SQL.
- A `{% %}` tag written directly against a word (`a{% if x %}_b{% endif %}`) leaves the query untouched instead of being re-indented.
- `--` comments are preserved in files with Windows (CRLF) line endings. They used to be formatted as SQL.
- Large files are much faster: no quadratic `trimEnd` (lodash before 4.17.21) and no per-token scan of the rest of the file.

### Use with pre-commit

[pre-commit](https://pre-commit.com) runs the formatter on staged `.sql` files before each commit. Nothing needs to be installed from npm; pre-commit fetches this repository and sets up Node itself.

1. Install pre-commit once per machine (`pip install pre-commit` or `brew install pre-commit`).
2. Add this to `.pre-commit-config.yaml` at the root of your dbt project (create the file if it does not exist):

   ```yaml
   repos:
     - repo: https://github.com/waitsfornone/dbt-formatter
       rev: <commit sha>
       hooks:
         - id: dbt-formatter          # formats in place
         # - id: dbt-formatter-check  # report only, changes nothing
   ```

   There are no release tags for the hook yet, so pin `rev` to a commit SHA from `master` (`git ls-remote https://github.com/waitsfornone/dbt-formatter master`). Avoid a branch name as `rev`: pre-commit warns that it is a mutable reference, and it will not update on its own.
3. Register the git hook in your clone: `pre-commit install`. Every contributor does this once per clone.
4. Optionally format everything that is already committed: `pre-commit run dbt-formatter --all-files`. On an existing project this may rewrite many files, so do it in its own commit. If any file was changed the run exits 1; running it again should then pass with no changes. If nothing needed formatting, it exits 0.

To move to a newer version, edit `rev` to a newer commit SHA, or run `pre-commit autoupdate --bleeding-edge` to move it to the latest commit on `master`. Plain `pre-commit autoupdate` will not work yet: it picks the latest tag (`v1.3.0`), which predates the hook definitions, and fails with `dbt-formatter` missing from that revision. It will work once a release is tagged that includes `.pre-commit-hooks.yaml`. To limit the hook to part of a repository, add `files: ^models/` or `exclude: ^target/` to the hook entry.

The hook runs `hook/dbt-formatter-hook.js`, a single bundled file with no dependencies. pre-commit downloads Node for it if none is installed.

- A file is only rewritten if the result differs from the original in whitespace and case alone. Strings, quoted identifiers, `$$` blocks, comments and Jinja expressions must come out identical, and whitespace next to a Jinja tag must keep touching (or not touching) its neighbouring word. Anything else is left unchanged and reported as `unsafe`. A file that does not format to itself (formatting the result again changes it) is left unchanged and reported as `unstable`, so the hook can never fail forever on a file it keeps rewriting.
- Exit code is 1 if a file was changed (as for other formatters), so the commit stops and you re-stage. Errors also exit 1. `--strict` makes `unsafe` and `unstable` files fail too.
- Put `dbt-formatter-ignore` on the first line of a file to skip it. Files over 500 KB are skipped (`--max-bytes`).
- Defaults match the VS Code extension: `--indent 4`, upper-case keywords, lower-case identifiers, camelCase kept. Pass `args: [--indent, "2"]` etc. to change them.
- `hook/` is built from `src/hook` with `npm run build:hook` and committed, because pre-commit installs straight from the repository. A test fails if it is out of date.

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
