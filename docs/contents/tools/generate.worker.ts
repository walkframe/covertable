import { sorters, criteria } from "covertable";
import { PictModel } from "covertable/pict";

interface GenerateRequest {
  input: string;
  strength: number;
  criterion: "greedy" | "simple";
  sorter: "random" | "hash";
  caseSensitive: boolean;
}

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<GenerateRequest>) => {
  const { input, strength, criterion, sorter, caseSensitive } = e.data;

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

    const step = () => {
      const deadline = Date.now() + 100;
      while (Date.now() < deadline) {
        const { value, done } = iter.next();
        if (done) {
          ctx.postMessage({
            type: "done",
            rows,
            progress: 1,
            stats: m.stats,
          });
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
