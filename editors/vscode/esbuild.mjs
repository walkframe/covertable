import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

// Separate, vscode-free ESM bundle the optimizer's worker threads import to
// reach `__workerReduce` (see src/optimize-worker.ts). Kept out of the main
// bundle because that one can't be imported from a worker.
/** @type {import('esbuild').BuildOptions} */
const workerOptions = {
  entryPoints: ['src/optimize-worker.ts'],
  bundle: true,
  outfile: 'dist/optimize-worker.mjs',
  format: 'esm',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  const wctx = await esbuild.context(workerOptions);
  await Promise.all([ctx.watch(), wctx.watch()]);
  console.log('esbuild: watching…');
} else {
  await Promise.all([esbuild.build(options), esbuild.build(workerOptions)]);
}
