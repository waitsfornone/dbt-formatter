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

export default [
  {
    input: `src/${libName}.ts`,
    output: {
      name: camelCase(libName),
      file: pkg.browser,
      format: 'umd',
    },
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      typescript(),
    ],
  },
  {
    input: `src/${libName}.ts`,
    external: ['fs'],
    output: [
      { file: pkg.main, format: 'cjs' },
      { file: pkg.module, format: 'es' },
    ],
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      typescript(),
    ],
  },
  {
    input: `src/${cmdName}.ts`,
    external: builtinModules,
    output: [{ file: cliFile, format: 'cjs', banner: '#!/usr/bin/env node' }],
    plugins: [
      resolve(), // so Rollup can find `ms`
      commonjs(), // so Rollup can convert `ms` to an ES module
      typescript(),
    ],
  },
];
