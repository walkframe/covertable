import { Controller } from "./src/index";
import { optimize } from "./src/optimize";

// 4^1 3^39 2^35
const levels = [4, ...Array(39).fill(3), ...Array(35).fill(2)];
const factors: { [k: string]: number[] } = {};
levels.forEach((lv, i) => (factors[`p${i}`] = Array.from({ length: lv }, (_, x) => x)));

const ctrl = new Controller(factors, { strength: 2 });
const rows = ctrl.make();
console.log(`make: ${rows.length} rows`);

const t0 = performance.now();
const out = optimize(ctrl, rows, {
  budgetMs: 250_000,
  onProgress: ({ rows, elapsedMs }) =>
    console.log(`  -> ${rows} rows  [${(elapsedMs / 1000).toFixed(0)}s]`),
});
console.log(`optimize: ${out.length} rows  [${((performance.now() - t0) / 1000).toFixed(0)}s]`);

// independent coverage check (every column-pair fully covered)
const keys = Object.keys(factors);
let missing = 0;
for (let i = 0; i < keys.length; i++)
  for (let j = i + 1; j < keys.length; j++) {
    const seen = new Set<string>();
    for (const r of out) seen.add(`${(r as any)[keys[i]]},${(r as any)[keys[j]]}`);
    missing += factors[keys[i]].length * factors[keys[j]].length - seen.size;
  }
console.log(`independent verify: missing pairs = ${missing} => ${missing === 0 ? "PASS" : "FAIL"}`);
