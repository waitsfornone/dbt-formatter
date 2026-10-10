import camelCase from 'lodash.camelcase';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

const pkg = require('./package.json');
const { builtinModules } = require('module');

const cmdName = 'dbt-command';
// `bin` also lists the pre-commit hook, which is built separately by `npm run build:hook`.
const cliFile = pkg.bin['dbt-formatter'];
const libName = 'dbt-formatter';

const path = require('path');

// @rollup/plugin-typescript 4+ requires `output.dir` whenever the TypeScript `outDir` is set (tsconfig.json sets it for
// the editor and tsc), and looks up emitted files by path. So each build below writes into `dir` with an explicit
// file name, and gets a matching `outDir` and an explicit `rootDir`; without the latter the plugin's lookup (repo
// root) and TypeScript's emit (src) disagree and the .ts files reach rollup untranspiled. TypeScript's output is kept
// in memory by the plugin, and declarations are not published, so nothing but the bundles is written.
const tsFor = dir => typescript({ rootDir: path.resolve('src'), outDir: path.resolve(dir), declaration: false });
const output = (file, format, extra = {}) => ({
  dir: path.dirname(file),
  entryFileNames: path.basename(file),
  format,
  ...extra,
});

export default [
  {
    input: `src/${libName}.ts`,
    output: output(pkg.browser, 'umd', { name: camelCase(libName) }),
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      tsFor(path.dirname(pkg.browser)),
    ],
  },
  {
    input: `src/${libName}.ts`,
    external: builtinModules,
    output: [output(pkg.main, 'cjs'), output(pkg.module, 'es')],
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      tsFor(path.dirname(pkg.main)),
    ],
  },
  {
    input: `src/${cmdName}.ts`,
    external: builtinModules,
    output: [output(cliFile, 'cjs', { banner: '#!/usr/bin/env node' })],
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      tsFor(path.dirname(cliFile)),
    ],
  },
];
