import { run } from './cli';

process.exitCode = run(process.argv.slice(2), {
  out: line => process.stdout.write(`${line}\n`),
  err: line => process.stderr.write(`${line}\n`),
});
