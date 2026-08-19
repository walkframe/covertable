import { sorters, criteria } from "covertable";
import { PictModel } from "covertable/pict";

interface GenerateRequest {
  input: string;
  strength: number;
  criterion: "greedy" | "simple";
  sorter: "random" | "hash";
  caseSensitive: boolean;
  optimize: boolean;
  optimizeBudgetMs: number;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { input, strength, criterion, sorter, caseSensitive, optimize, optimizeBudgetMs } = e.data;

  try {
    const m = new PictModel(input, { caseInsensitive: !caseSensitive });
    const keys = Object.keys(m.parameters);

    ctx.postMessage({ type: "parsed", keys, issues: m.issues });
    ctx.postMessage({ type: "status", message: "Preparing..." });

    const makeOpts = {
      sorter: sorter === "random" ? sorters.random : sorters.hash,
      criterion: criterion === "greedy" ? criteria.greedy : criteria.simple,
      strength,
    };

    const iter = m.makeAsync(makeOpts);

    // After first next() call, the constructor has run (pairs built, pruned).
    ctx.postMessage({ type: "status", message: null });
    ctx.postMessage({ type: "progress", rows: [], progress: m.progress });

    const rows: any[] = [];
    const genStart = Date.now();

    // Optional SA post-process: shrink the greedy array. Runs single-threaded in
    // this worker (the worker itself keeps the page responsive), reusing the
    // model's strength/constraints. Cancelling from the UI terminates the worker.
    const finish = () => {
      if (optimize && rows.length > 1) {
        ctx.postMessage({
          type: "status",
          message: `Optimizing… ${rows.length} rows`,
        });
        // Yield once so the "Optimizing…" status paints before the blocking
        // annealing loop takes over the worker thread.
        setTimeout(() => {
          let optimized = rows;
          try {
            optimized = m.optimize({
              budgetMs: optimizeBudgetMs,
              onProgress: ({ rows: n }) => {
                ctx.postMessage({
                  type: "status",
                  message: `Optimizing… ${n} rows`,
                });
              },
            });
          } catch {
            // Optimizer unavailable/failed — fall back to the greedy result.
            optimized = rows;
          }
          ctx.postMessage({
            type: "done",
            rows: optimized,
            progress: 1,
            stats: m.stats,
          });
        }, 0);
        return;
      }
      ctx.postMessage({
        type: "done",
        rows,
        progress: 1,
        stats: m.stats,
      });
    };

    const step = () => {
      const deadline = Date.now() + 100;
      while (Date.now() < deadline) {
        const { value, done } = iter.next();
        if (done) {
          finish();
          return;
        }
        rows.push(value);
      }
      const p = m.progress;
      const elapsed = Date.now() - genStart;
      const eta = p > 0.01 ? Math.round((elapsed / p) * (1 - p) / 1000) : null;
      ctx.postMessage({
        type: "progress",
        rows: rows.slice(),
        progress: p,
        eta,
      });
      setTimeout(step, 0);
    };
    step();
  } catch (err: any) {
    ctx.postMessage({
      type: "error",
      message: err?.message ?? String(err),
    });
  }
};
