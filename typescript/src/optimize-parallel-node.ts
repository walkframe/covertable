// Node worker-thread backend for `optimizeParallel` (cooperative island model).
//
// Kept SEPARATE from `optimize.ts` and loaded only via a dynamic `import()` on
// the parallel path: it is the sole place that uses `import.meta.url` (so a
// worker can import this same module and call `__workerReduce`) and the
// Node-specific `worker_threads`. Isolating both keeps `optimize.ts` compilable
// by the CommonJS test transform (which rejects `import.meta`) and free of
// Node-only imports, leaving room for a future `optimize-parallel-web.ts`.

import type { CoopShared, WorkerReduceParams, WorkerVariant } from "./optimize";

// Re-exported so a worker that imports THIS module by URL can reach it.
export { __workerReduce } from "./optimize";

const WORKER_SRC = `
  const { parentPort, workerData } = require('worker_threads');
  (async () => {
    try {
      const mod = await import(workerData.modulePath);
      const res = mod.__workerReduce(workerData.params,
        (rows, elapsedMs) => parentPort.postMessage({ t: 'p', rows, elapsedMs }));
      parentPort.postMessage({ t: 'd', res });
    } catch (e) {
      parentPort.postMessage({ t: 'e', e: String((e && e.stack) || e) });
    }
  })();
`;

/**
 * Cooperative multi-start: run one worker per variant over a shared
 * SharedArrayBuffer-backed blackboard (global-best array + per-stage leader
 * cost). Workers that fall behind and stall adopt the global best; scouts keep
 * exploring. Forwards global-best improvements to `onProgress` and returns the
 * final shared-best array. Never rejects; throws only if worker threads or
 * SharedArrayBuffer are unavailable (the caller then falls back to 1 thread).
 */
export async function runCooperative(
  base: Omit<WorkerReduceParams, "seed" | "minCollateralSamples" | "targetedMoveRate" | "coop">,
  variants: WorkerVariant[],
  maxN: number,
  K: number,
  patience: number,
  onProgress?: (info: { rows: number; elapsedMs: number }) => void,
  signal?: AbortSignal,
  workerUrl?: string,
): Promise<number[][]> {
  const { Worker } = await import("node:worker_threads");
  // In a bundle, `import.meta.url` can't locate this library (and the bundle may
  // pull in host-only deps), so the caller can point us at a standalone worker
  // module that re-exports `__workerReduce`.
  const modulePath = workerUrl ?? import.meta.url;

  // Shared blackboard. ctrl: [0]=bestN, [1]=lock, [2]=stop, [3+n]=stageCost[n].
  const ctrl = new Int32Array(new SharedArrayBuffer((3 + maxN + 1) * 4));
  const best = new Uint8Array(new SharedArrayBuffer(maxN * K));
  Atomics.store(ctrl, 0, maxN); // best starts as the (unreduced) input
  for (let r = 0; r < maxN; r++) {
    const off = r * K;
    const row = base.intRows[r];
    for (let k = 0; k < K; k++) best[off + k] = row[k];
  }
  // Cooperative cancellation: on abort, raise the shared stop flag so every
  // worker halts and we return the current global best.
  if (signal) {
    if (signal.aborted) Atomics.store(ctrl, 2, 1);
    else signal.addEventListener("abort", () => Atomics.store(ctrl, 2, 1), { once: true });
  }

  let globalBest = Infinity;
  await Promise.all(
    variants.map(
      (variant) =>
        new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
            w.terminate();
          };
          const coop: CoopShared = {
            ctrl,
            best,
            maxN,
            K,
            patience,
            isScout: variant.isScout === true,
          };
          const params: WorkerReduceParams = {
            ...base,
            seed: variant.seed,
            minCollateralSamples: variant.minCollateralSamples,
            targetedMoveRate: variant.targetedMoveRate,
            coop,
          };
          const w = new Worker(WORKER_SRC, { eval: true, workerData: { modulePath, params } });
          w.on("message", (msg: any) => {
            if (msg.t === "p") {
              if (msg.rows < globalBest) {
                globalBest = msg.rows;
                onProgress?.({ rows: msg.rows, elapsedMs: msg.elapsedMs });
              }
            } else if (msg.t === "d" || msg.t === "e") {
              done();
            }
          });
          w.on("error", () => done());
          w.on("exit", () => done());
        }),
    ),
  );

  // Read the final global-best array out of the shared buffer.
  const bn = Atomics.load(ctrl, 0);
  const out: number[][] = [];
  for (let r = 0; r < bn; r++) {
    const off = r * K;
    const row = new Array<number>(K);
    for (let k = 0; k < K; k++) row[k] = best[off + k];
    out.push(row);
  }
  return out;
}
