// Standalone worker entry for the covertable SA optimizer.
//
// Built as a SEPARATE bundle (`dist/optimize-worker.mjs`) that does NOT import
// `vscode`, so covertable's Node worker-thread backend can `import()` it from a
// worker and call `__workerReduce`. The main extension bundle can't serve this
// role: inside it `import.meta.url` is empty and importing it pulls in the
// host-only `vscode` module. The path to this file is handed to the optimizer
// via `OptimizeParallelTuning.workerUrl`.
export { __workerReduce } from 'covertable';
