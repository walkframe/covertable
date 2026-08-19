// Web Worker backend for `optimizeParallel` (cooperative island model).
//
// Mirrors `optimize-parallel-node.ts` but uses the web-standard `Worker` API
// (browsers, Deno, Electron renderer) instead of Node `worker_threads`. Loaded
// only on the parallel path when a global `Worker` is available and cooperation
// is possible (needs `SharedArrayBuffer`, i.e. cross-origin isolation in the
// browser). Kept separate so `optimize.ts` stays free of `import.meta`.

import type { CoopShared, WorkerReduceParams, WorkerVariant } from "./optimize";

// Re-exported so the worker (which imports THIS module by URL) can reach it.
export { __workerReduce } from "./optimize";

// A module worker that imports this same module and runs one reduction.
const WORKER_SRC = `
  self.onmessage = async (e) => {
    const { modulePath, params } = e.data;
    try {
      const mod = await import(modulePath);
      const res = mod.__workerReduce(params,
        (rows, elapsedMs) => self.postMessage({ t: 'p', rows, elapsedMs }));
      self.postMessage({ t: 'd', res });
    } catch (err) {
      self.postMessage({ t: 'e', e: String((err && err.stack) || err) });
    }
  };
`;

/**
 * Cooperative multi-start over Web Workers. Same contract as the Node backend's
 * `runCooperative`: workers share a `SharedArrayBuffer` blackboard (global-best
 * array + per-stage leader cost); laggards adopt the shared best, scouts keep
 * exploring. Returns the final shared-best array. Throws if Web Workers or
 * `SharedArrayBuffer` are unavailable (the caller falls back to a single thread).
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
  // Web globals (`Worker`, `Blob`, `URL.createObjectURL`) aren't in the project's
  // type libs (it targets Node too), so reach them through `globalThis`.
  const g = globalThis as any;
  // A bundle can override the module the worker imports (see the Node backend).
  const modulePath = workerUrl ?? import.meta.url;
  const blobUrl: string = g.URL.createObjectURL(new g.Blob([WORKER_SRC], { type: "text/javascript" }));

  // Shared blackboard. ctrl: [0]=bestN, [1]=lock, [2]=stop, [3+n]=stageCost[n].
  const ctrl = new Int32Array(new SharedArrayBuffer((3 + maxN + 1) * 4));
  const best = new Uint8Array(new SharedArrayBuffer(maxN * K));
  Atomics.store(ctrl, 0, maxN);
  for (let r = 0; r < maxN; r++) {
    const off = r * K;
    const row = base.intRows[r];
    for (let k = 0; k < K; k++) best[off + k] = row[k];
  }
  // Cooperative cancellation: on abort, raise the shared stop flag.
  if (signal) {
    if (signal.aborted) Atomics.store(ctrl, 2, 1);
    else signal.addEventListener("abort", () => Atomics.store(ctrl, 2, 1), { once: true });
  }

  let globalBest = Infinity;
  try {
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
            const w = new g.Worker(blobUrl, { type: "module" });
            w.onmessage = (e: any) => {
              const msg: any = e.data;
              if (msg.t === "p") {
                if (msg.rows < globalBest) {
                  globalBest = msg.rows;
                  onProgress?.({ rows: msg.rows, elapsedMs: msg.elapsedMs });
                }
              } else if (msg.t === "d" || msg.t === "e") {
                done();
              }
            };
            w.onerror = () => done();
            w.postMessage({ modulePath, params });
          }),
      ),
    );
  } finally {
    g.URL.revokeObjectURL(blobUrl);
  }

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
