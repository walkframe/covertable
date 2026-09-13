#!/usr/bin/env node
// CoverTable CLI — a thin, dependency-free front end over the typed library.
// All generation logic lives in the (typed) package; this only parses argv,
// formats the table, and fills formula (computed) columns per row.
//
//   covertable pict <model.pict> [options]
//
// Options:
//   -o, --output <file>    Write to <file> (default: stdout). Format follows the
//                          extension (.csv → CSV) unless --format overrides it.
//   -s, --strength <n>     Combinatorial order (2 = pairwise, default 2).
//       --criterion <c>    greedy | simple (default greedy).
//       --sorter <s>       random | hash (default random).
//       --case-sensitive   Case-sensitive constraint/alias matching (default off).
//       --no-formula       Parse `=`-lines as ordinary parameters, not formulas.
//       --optimize         SA post-process to shrink the array (same coverage).
//       --budget <ms>      Optimize time budget in ms (default 5000).
//       --format <fmt>     tsv | csv. Overrides the output-extension guess.
//   -h, --help             Show this help.
//
// `<model.pict>` may be `-` to read the model from stdin.

import { readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { PictModel } from '../dist/pict.js';
import { sorters, criteria } from '../dist/index.js';

const HELP = `covertable — pairwise / N-wise covering arrays from a PICT model

Usage:
  covertable pict <model.pict> [options]

Options:
  -o, --output <file>    Write to <file> (default: stdout). .csv → CSV, else TSV.
  -s, --strength <n>     Combinatorial order (default 2 = pairwise).
      --criterion <c>    greedy | simple (default greedy).
      --sorter <s>       random | hash (default random).
      --case-sensitive   Case-sensitive matching (default: insensitive).
      --no-formula       Parse "=" lines as ordinary parameters, not formulas.
      --optimize         SA post-process to shrink the array (same coverage).
      --budget <ms>      Optimize time budget in ms (default 5000).
      --format <fmt>     tsv | csv (overrides the -o extension guess).
  -h, --help             Show this help.

Read the model from stdin by passing "-" as the file.`;

function fail(msg) {
  process.stderr.write(`covertable: ${msg}\n`);
  process.exit(2);
}

/** Escape a CSV field per RFC 4180 when it contains a quote, comma, or newline. */
function csvField(value) {
  return /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

function formatTable(header, rows, format) {
  const sep = format === 'csv' ? ',' : '\t';
  const cell = (v) => {
    const s = String(v ?? '');
    return format === 'csv' ? csvField(s) : s.replace(/\t/g, ' ');
  };
  const lines = [header.map(cell).join(sep)];
  for (const row of rows) lines.push(header.map((k) => cell(row[k])).join(sep));
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const opts = {
    strength: 2,
    criterion: 'greedy',
    sorter: 'random',
    caseSensitive: false,
    formula: true,
    optimize: false,
    budgetMs: 5000,
    output: null,
    format: null,
    file: null,
  };
  const next = (i, name) => {
    if (i + 1 >= argv.length) fail(`missing value for ${name}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': process.stdout.write(HELP + '\n'); process.exit(0); break;
      case '-o': case '--output': opts.output = next(i, a); i++; break;
      case '-s': case '--strength': opts.strength = parseInt(next(i, a), 10); i++; break;
      case '--criterion': opts.criterion = next(i, a); i++; break;
      case '--sorter': opts.sorter = next(i, a); i++; break;
      case '--case-sensitive': opts.caseSensitive = true; break;
      case '--no-formula': opts.formula = false; break;
      case '--optimize': opts.optimize = true; break;
      case '--budget': opts.budgetMs = parseInt(next(i, a), 10); i++; break;
      case '--format': opts.format = next(i, a); i++; break;
      default:
        if (a.startsWith('-') && a !== '-') fail(`unknown option: ${a}`);
        else if (opts.file == null) opts.file = a;
        else fail(`unexpected argument: ${a}`);
    }
  }
  return opts;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    process.stdout.write(HELP + '\n');
    process.exit(0);
  }
  if (argv[0] === '-v' || argv[0] === '--version') {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    process.stdout.write(`${pkg.version}\n`);
    process.exit(0);
  }

  const command = argv[0];
  if (command !== 'pict') {
    fail(`unknown command "${command}" (only "pict" is supported)`);
  }

  const opts = parseArgs(argv.slice(1));
  if (opts.file == null) fail('no model file given (use "-" to read from stdin)');
  if (opts.criterion !== 'greedy' && opts.criterion !== 'simple') fail(`--criterion must be greedy|simple`);
  if (opts.sorter !== 'random' && opts.sorter !== 'hash') fail(`--sorter must be random|hash`);
  if (opts.format != null && opts.format !== 'tsv' && opts.format !== 'csv') fail(`--format must be tsv|csv`);
  if (!Number.isFinite(opts.strength) || opts.strength < 1) fail('--strength must be a positive integer');

  const source = opts.file === '-'
    ? readFileSync(0, 'utf8')
    : readFileSync(opts.file, 'utf8');

  const model = new PictModel(source, {
    caseInsensitive: !opts.caseSensitive,
    formula: opts.formula,
  });

  // Surface model errors on stderr and stop — a broken model should fail loudly
  // rather than emit a half-formed table.
  const errors = model.issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`covertable: ${opts.file}:${e.line ?? '?'}: ${e.message}\n`);
    process.exit(1);
  }

  const makeOpts = {
    strength: opts.strength,
    criterion: opts.criterion === 'greedy' ? criteria.greedy : criteria.simple,
    sorter: opts.sorter === 'random' ? sorters.random : sorters.hash,
  };

  let rows = model.make(makeOpts);
  if (opts.optimize && rows.length > 1) {
    try {
      rows = model.optimize({ budgetMs: opts.budgetMs });
    } catch (err) {
      process.stderr.write(`covertable: optimize failed (${err?.message ?? err}); using the greedy result\n`);
    }
  }

  // Fill formula (computed) columns after any optimize pass so row indices match
  // the final output order (see PictModel.renderFormula).
  const header = model.columnOrder;
  for (const fc of model.formulaColumns) {
    for (let i = 0; i < rows.length; i++) rows[i][fc.name] = model.renderFormula(fc.name, i);
  }

  const format = opts.format
    ?? (opts.output && opts.output.toLowerCase().endsWith('.csv') ? 'csv' : 'tsv');
  const content = formatTable(header, rows, format);

  if (opts.output) {
    writeFileSync(opts.output, content);
    process.stderr.write(`covertable: wrote ${rows.length} row(s) to ${opts.output}\n`);
  } else {
    process.stdout.write(content);
  }
}

main();
