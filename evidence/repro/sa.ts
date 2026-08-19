// Targeted-move simulated-annealing row reduction (speed port for bun/node).
// energy = number of uncovered pair-tuples, tracked with an O(1) swap-remove list.

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SA {
  K: number;
  levels: number[];
  rng: () => number;
  // pair encoding
  pairBase: Int32Array;         // index by i*K+j (i<j) -> base offset
  T: number;                    // total tuples
  decI: Int32Array; decJ: Int32Array; decVi: Int32Array; decVj: Int32Array;
  // coverage state (allocated per run)
  cov!: Int32Array;
  uncList!: Int32Array; uncPos!: Int32Array; uncLen = 0;

  constructor(levels: number[], seed: number) {
    this.levels = levels;
    this.K = levels.length;
    this.rng = mulberry32(seed);
    this.pairBase = new Int32Array(this.K * this.K).fill(-1);
    let off = 0;
    const decI: number[] = [], decJ: number[] = [], decVi: number[] = [], decVj: number[] = [];
    for (let i = 0; i < this.K; i++) {
      for (let j = i + 1; j < this.K; j++) {
        this.pairBase[i * this.K + j] = off;
        for (let vi = 0; vi < levels[i]; vi++)
          for (let vj = 0; vj < levels[j]; vj++) {
            decI.push(i); decJ.push(j); decVi.push(vi); decVj.push(vj);
          }
        off += levels[i] * levels[j];
      }
    }
    this.T = off;
    this.decI = Int32Array.from(decI); this.decJ = Int32Array.from(decJ);
    this.decVi = Int32Array.from(decVi); this.decVj = Int32Array.from(decVj);
  }

  private tid(i: number, j: number, vi: number, vj: number): number {
    // requires i<j
    return this.pairBase[i * this.K + j] + vi * this.levels[j] + vj;
  }

  private build(rows: number[][]) {
    this.cov = new Int32Array(this.T);
    for (const row of rows)
      for (let i = 0; i < this.K; i++)
        for (let j = i + 1; j < this.K; j++)
          this.cov[this.tid(i, j, row[i], row[j])]++;
    this.uncList = new Int32Array(this.T);
    this.uncPos = new Int32Array(this.T).fill(-1);
    this.uncLen = 0;
    for (let id = 0; id < this.T; id++)
      if (this.cov[id] === 0) { this.uncPos[id] = this.uncLen; this.uncList[this.uncLen++] = id; }
  }

  private addUnc(id: number) { this.uncPos[id] = this.uncLen; this.uncList[this.uncLen++] = id; }
  private delUnc(id: number) {
    const p = this.uncPos[id]; const last = this.uncList[--this.uncLen];
    this.uncList[p] = last; this.uncPos[last] = p; this.uncPos[id] = -1;
  }

  // change rows[r][k] -> w (k as column). maintains cov + uncovered list.
  private setCell(rows: number[][], r: number, k: number, w: number) {
    const row = rows[r]; const v = row[k]; if (v === w) return;
    const K = this.K;
    for (let j = 0; j < K; j++) {
      if (j === k) continue;
      let oldId: number, newId: number;
      if (k < j) { oldId = this.tid(k, j, v, row[j]); newId = this.tid(k, j, w, row[j]); }
      else { oldId = this.tid(j, k, row[j], v); newId = this.tid(j, k, row[j], w); }
      if (--this.cov[oldId] === 0) this.addUnc(oldId);
      if (this.cov[newId]++ === 0) this.delUnc(newId);
    }
    row[k] = w;
  }

  anneal(rows: number[][], iters: number, T0: number, cool: number, pTarget: number): number {
    this.build(rows);
    let energy = this.uncLen;
    let T = T0;
    const K = this.K, rng = this.rng, levels = this.levels;
    // scratch for undo (max 2 cells per move)
    const uR = new Int32Array(2), uK = new Int32Array(2), uV = new Int32Array(2);
    for (let it = 0; it < iters; it++) {
      if (energy === 0) return 0;
      let n = 0;
      if (this.uncLen > 0 && rng() < pTarget) {
        const id = this.uncList[(rng() * this.uncLen) | 0];
        const i = this.decI[id], j = this.decJ[id], vi = this.decVi[id], vj = this.decVj[id];
        const r = (rng() * rows.length) | 0;
        if (rows[r][i] !== vi) { uR[n] = r; uK[n] = i; uV[n] = rows[r][i]; n++; this.setCell(rows, r, i, vi); }
        if (rows[r][j] !== vj) { uR[n] = r; uK[n] = j; uV[n] = rows[r][j]; n++; this.setCell(rows, r, j, vj); }
        if (n === 0) { const r2 = (rng() * rows.length) | 0, k = (rng() * K) | 0, w = (rng() * levels[k]) | 0; uR[n] = r2; uK[n] = k; uV[n] = rows[r2][k]; n++; this.setCell(rows, r2, k, w); }
      } else {
        const r = (rng() * rows.length) | 0, k = (rng() * K) | 0, w = (rng() * levels[k]) | 0;
        uR[n] = r; uK[n] = k; uV[n] = rows[r][k]; n++; this.setCell(rows, r, k, w);
      }
      const after = this.uncLen;
      const dE = after - energy;
      if (dE <= 0 || rng() < Math.exp(-dE / T)) energy = after;
      else for (let x = n - 1; x >= 0; x--) this.setCell(rows, uR[x], uK[x], uV[x]);
      T *= cool;
    }
    return this.uncLen;
  }

  private seed(rows: number[][]): number[][] {
    // drop the row with the fewest unique tuples
    this.build(rows);
    let bestI = 0, bestS = Infinity;
    for (let r = 0; r < rows.length; r++) {
      let s = 0; const row = rows[r];
      for (let i = 0; i < this.K; i++)
        for (let j = i + 1; j < this.K; j++)
          if (this.cov[this.tid(i, j, row[i], row[j])] === 1) s++;
      if (s < bestS) { bestS = s; bestI = r; }
    }
    return rows.filter((_, idx) => idx !== bestI).map(r => r.slice());
  }

  reduceBudget(rows: number[][], budgetMs: number, iters0: number, growth: number,
               T0: number, Tend: number, pTarget: number,
               log: (m: string) => void, stopAt = 0): number[][] {
    const start = performance.now();
    let cur = rows.map(r => r.slice());
    let best = cur;
    let totalIters = 0;
    while (cur.length > 1 && cur.length > stopAt && performance.now() - start < budgetMs) {
      const target = cur.length - 1;
      let cracked: number[][] | null = null;
      let iters = iters0;
      while (performance.now() - start < budgetMs) {
        const cool = Math.pow(Tend / T0, 1 / Math.max(1, iters));
        const trial = this.seed(cur);
        const e = this.anneal(trial, iters, T0, cool, pTarget);
        totalIters += iters;
        if (e === 0) { cracked = trial; break; }
        iters = Math.floor(iters * growth);
      }
      if (!cracked) { log(`  stop at ${cur.length} rows (budget exhausted for N=${target}, iters=${iters})`); break; }
      cur = cracked; best = cur;
      log(`  reduced to ${cur.length} rows  [${((performance.now() - start) / 1000).toFixed(0)}s, iters=${iters}]`);
    }
    const secs = (performance.now() - start) / 1000;
    log(`  ~${(totalIters / secs / 1e6).toFixed(2)}M iters/sec`);
    return best;
  }
}

export function verify(rows: number[][], levels: number[]): boolean {
  const K = levels.length;
  for (let i = 0; i < K; i++)
    for (let j = i + 1; j < K; j++) {
      const seen = new Set<number>();
      for (const row of rows) seen.add(row[i] * levels[j] + row[j]);
      if (seen.size !== levels[i] * levels[j]) return false;
    }
  return true;
}

// ---- main ----
import { readFileSync, writeFileSync } from "node:fs";
if (import.meta.main) {
  const path = process.argv[3] ?? "./starts/start_10_20.json";
  const dumpPath = process.argv[4];   // optional: write the final array here
  const data = JSON.parse(readFileSync(path, "utf8")) as { levels: number[]; rows: number[][] };
  const budgetMs = Number(process.argv[2] ?? 120) * 1000;
  const engine = (globalThis as any).Bun ? "bun " + process.versions.bun : "node " + process.version;
  console.log(`start: ${data.rows.length} rows; budget=${budgetMs / 1000}s  [${engine}]`);
  const sa = new SA(data.levels, 7);
  const t0 = performance.now();
  const out = sa.reduceBudget(data.rows, budgetMs, 400000, 1.6, 2.5, 0.02, 0.5, m => console.log(m));
  const ok = verify(out, data.levels);
  console.log(`RESULT: ${out.length} rows  valid=${ok}  [${((performance.now() - t0) / 1000).toFixed(0)}s]`);
  if (dumpPath) {
    writeFileSync(dumpPath, JSON.stringify({ levels: data.levels, rows: out, internalVerify: ok }, null, 0));
    console.log(`dumped ${out.length}-row array -> ${dumpPath}`);
  }
}
