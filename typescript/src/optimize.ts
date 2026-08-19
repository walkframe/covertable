import { getItems, combinations, range } from "./lib";
import { evaluate } from "./evaluate";
import type { Controller } from "./controller";
import type {
  FactorsType,
  SuggestRowType,
  Expression,
  Comparer,
  ScalarType,
  OptimizeTuning,
  OptimizeParallelTuning,
} from "./types";

// ---------------------------------------------------------------------------
// PRNG (mulberry32)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

// ---------------------------------------------------------------------------
// Constraint normalization (mirrors Controller.normalizeCondition):
// `in` conditions carry a `values` array from the public API but `evaluate`
// expects a Set for O(1) membership. We normalize a private copy here so the
// same constraints object works for both `make` and `optimize`.
// ---------------------------------------------------------------------------

function normalizeCondition(c: Expression): Expression {
  if (c.operator === "in" && Array.isArray((c as any).values)) {
    return { ...c, values: new Set((c as any).values) } as any;
  }
  if (c.operator === "and" || c.operator === "or") {
    return { ...c, conditions: c.conditions.map(normalizeCondition) } as any;
  }
  if (c.operator === "not") {
    return { ...c, condition: normalizeCondition(c.condition) } as any;
  }
  return c;
}

// ---------------------------------------------------------------------------
// SA core — general t. State is an integer-encoded number[][] where each cell
// holds the index of the chosen value within its factor's value list.
//
// A "t-tuple" is a choice of t columns plus one value per column. Every tuple
// is assigned a dense integer id (mixed-radix per column-combination). `cov`
// counts how many rows currently realize each tuple. `isTarget` marks the
// tuples that the ORIGINAL input covered — the invariant we must preserve.
// `uncList` is an O(1) swap-remove list of currently-uncovered target tuples;
// its length is the energy the annealer minimizes.
// ---------------------------------------------------------------------------

/** Shared-state accessors a cooperative worker uses to coordinate with the fleet. */
export interface CoopChannel {
  /** Scouts never merge — they keep exploring independently, preserving diversity. */
  readonly isScout: boolean;
  /** Merge only after spending `patience × (leader's cost for this stage)`. */
  readonly patience: number;
  /** Current global-best row count. */
  bestRows(): number;
  /** Leader's iteration cost to crack `n -> n-1` (0 if no worker has done it yet). */
  stageCost(n: number): number;
  /** Whether the fleet has been asked to stop. */
  shouldStop(): boolean;
  /** Snapshot of the current global-best array (null if none). */
  adopt(): number[][] | null;
  /** Publish a freshly cracked array (`fromN -> rows`) as a global-best candidate. */
  publish(rows: number, data: number[][], stageIters: number, fromN: number): void;
}

class SAOptimizer {
  readonly K: number;
  readonly t: number;
  readonly levels: number[];
  private rng: () => number;

  private readonly hasConstraints: boolean;
  private readonly constraints: Expression[];
  private readonly comparer: Comparer;
  private readonly keys: ScalarType[];
  private readonly valuesPerFactor: any[][];

  // combination geometry
  private readonly M: number; // number of column-combinations
  private readonly comboCols: Int32Array; // M * t
  private readonly comboStride: Int32Array; // M * t
  private readonly comboBase: Int32Array; // M
  private readonly tupleCombo: Int32Array; // T -> combo index
  private readonly colCombos: Int32Array[]; // per column: combo indices touching it
  private readonly colPos: Int32Array[]; // per column: position of the column inside each combo
  private readonly T: number;

  private readonly isTarget: Uint8Array;
  private cov: Int32Array;
  private uncList: Int32Array;
  private uncPos: Int32Array;
  private uncLen = 0;

  // t=2 fast path (pair encoding — mirrors the verified reference core).
  // For a column-pair (i<j): id = pairBase[i*K+j] + vi*levels[j] + vj.
  private readonly t2: boolean;
  private pairBase!: Int32Array;
  private decI!: Int32Array;
  private decJ!: Int32Array;
  private decVi!: Int32Array;
  private decVj!: Int32Array;

  // reusable object buffer for constraint checks
  private readonly objBuf: { [k: string]: any } = {};

  /** Min-collateral sampling width for targeted moves (1 = plain random row). */
  minCollateralSamples = 1;
  /**
   * Reheat: if an anneal run goes `reheatStuck` iterations without improving on
   * its best energy, jump the temperature back up to `startTemperature * reheatFrac`
   * (optionally restoring the best config first) instead of freezing at the cooled
   * temperature. This is what lets the hard endgame (last row) actually crack;
   * without it a long cool-down freezes into a local minimum. `reheatStuck = 0`
   * disables it.
   */
  reheatStuck = 200000;
  reheatFrac = 0.3;
  reheatRestore = true;
  /**
   * Reheat only engages while the array is at or below this many rows. It rescues
   * the tight endgame of small arrays (where plain cooling freezes and reheat is
   * the only way to shed the last rows) but stays out of the bulk descent of large
   * arrays — there cooling still cracks fine and reheat's restore-to-best would
   * only stall progress (an early experiment removed reheat entirely over exactly
   * that regression). Row counts this small are the norm; only extreme high-level
   * models (e.g. 10^20 ≈ 180 rows) sit above it.
   */
  reheatMaxRows = 96;
  /** Set by the reduce loops before each anneal call once reheat should engage. */
  reheatArmed = false;
  /** Optional cooperative-cancellation signal (single-thread paths check it). */
  signal?: AbortSignal;
  /** Set during a cooperative run so the annealer can honor the shared stop flag. */
  coopChannel?: CoopChannel;

  constructor(
    keys: ScalarType[],
    valuesPerFactor: any[][],
    intRows: number[][],
    strength: number,
    constraints: Expression[],
    comparer: Comparer,
    seed: number,
  ) {
    this.keys = keys;
    this.valuesPerFactor = valuesPerFactor;
    this.levels = valuesPerFactor.map((v) => v.length);
    this.K = keys.length;
    this.t = strength;
    this.t2 = strength === 2;
    this.rng = mulberry32(seed);
    this.constraints = constraints;
    this.hasConstraints = constraints.length > 0;
    this.comparer = comparer;

    // --- build column-combinations and dense tuple ids ---
    const combos = combinations(range(0, this.K), this.t);
    this.M = combos.length;
    this.comboCols = new Int32Array(this.M * this.t);
    this.comboStride = new Int32Array(this.M * this.t);
    this.comboBase = new Int32Array(this.M);

    const colCombosTmp: number[][] = Array.from({ length: this.K }, () => []);
    const colPosTmp: number[][] = Array.from({ length: this.K }, () => []);

    let offset = 0;
    for (let m = 0; m < this.M; m++) {
      const cols = combos[m];
      // mixed-radix strides, rightmost column has stride 1
      let acc = 1;
      for (let pos = this.t - 1; pos >= 0; pos--) {
        const col = cols[pos];
        this.comboCols[m * this.t + pos] = col;
        this.comboStride[m * this.t + pos] = acc;
        acc *= this.levels[col];
        colCombosTmp[col].push(m);
        colPosTmp[col].push(pos);
      }
      this.comboBase[m] = offset;
      offset += acc; // acc == product of levels of this combo's columns
    }
    this.T = offset;

    this.tupleCombo = new Int32Array(this.T);
    for (let m = 0; m < this.M; m++) {
      const base = this.comboBase[m];
      const end = m + 1 < this.M ? this.comboBase[m + 1] : this.T;
      for (let id = base; id < end; id++) this.tupleCombo[id] = m;
    }

    this.colCombos = colCombosTmp.map((a) => Int32Array.from(a));
    this.colPos = colPosTmp.map((a) => Int32Array.from(a));

    // --- t=2 fast-path tables: direct pair id + O(1) tuple decode ---
    if (this.t2) {
      this.pairBase = new Int32Array(this.K * this.K);
      this.decI = new Int32Array(this.T);
      this.decJ = new Int32Array(this.T);
      this.decVi = new Int32Array(this.T);
      this.decVj = new Int32Array(this.T);
      for (let m = 0; m < this.M; m++) {
        const i = this.comboCols[m * 2];
        const j = this.comboCols[m * 2 + 1]; // i < j
        const base = this.comboBase[m];
        this.pairBase[i * this.K + j] = base;
        let id = base;
        for (let vi = 0; vi < this.levels[i]; vi++) {
          for (let vj = 0; vj < this.levels[j]; vj++) {
            this.decI[id] = i;
            this.decJ[id] = j;
            this.decVi[id] = vi;
            this.decVj[id] = vj;
            id++;
          }
        }
      }
    }

    // --- target set: every t-tuple realized by the original input ---
    this.isTarget = new Uint8Array(this.T);
    for (const row of intRows) {
      for (let m = 0; m < this.M; m++) {
        this.isTarget[this.comboId(row, m)] = 1;
      }
    }

    this.cov = new Int32Array(this.T);
    this.uncList = new Int32Array(this.T);
    this.uncPos = new Int32Array(this.T);
  }

  /** Dense id of the tuple that `row` realizes for column-combination `m`. */
  private comboId(row: number[], m: number): number {
    const off = m * this.t;
    let id = this.comboBase[m];
    for (let pos = 0; pos < this.t; pos++) {
      id += row[this.comboCols[off + pos]] * this.comboStride[off + pos];
    }
    return id;
  }

  private addUnc(id: number) {
    this.uncPos[id] = this.uncLen;
    this.uncList[this.uncLen++] = id;
  }

  private delUnc(id: number) {
    const p = this.uncPos[id];
    const last = this.uncList[--this.uncLen];
    this.uncList[p] = last;
    this.uncPos[last] = p;
    this.uncPos[id] = -1;
  }

  /** Recompute cov and the uncovered-target list from scratch for `rows`. */
  private build(rows: number[][]) {
    this.cov.fill(0);
    for (const row of rows) {
      for (let m = 0; m < this.M; m++) this.cov[this.comboId(row, m)]++;
    }
    this.uncLen = 0;
    for (let id = 0; id < this.T; id++) {
      if (this.isTarget[id] && this.cov[id] === 0) this.addUnc(id);
    }
  }

  /** Change one cell, keeping cov and the uncovered-target list in sync. */
  private setCell(rows: number[][], r: number, k: number, w: number) {
    const row = rows[r];
    const v = row[k];
    if (v === w) return;

    // t=2 fast path: direct pair id, no per-combo comboId() recompute.
    if (this.t2) {
      const K = this.K;
      const pb = this.pairBase;
      const lv = this.levels;
      const cov = this.cov;
      const isT = this.isTarget;
      for (let j = 0; j < K; j++) {
        if (j === k) continue;
        let oldId: number;
        let newId: number;
        if (k < j) {
          const b = pb[k * K + j] + row[j];
          const lj = lv[j];
          oldId = b + v * lj;
          newId = b + w * lj;
        } else {
          const b = pb[j * K + k] + row[j] * lv[k];
          oldId = b + v;
          newId = b + w;
        }
        if (--cov[oldId] === 0 && isT[oldId]) this.addUnc(oldId);
        if (cov[newId]++ === 0 && isT[newId]) this.delUnc(newId);
      }
      row[k] = w;
      return;
    }

    const combos = this.colCombos[k];
    const poss = this.colPos[k];
    const t = this.t;
    for (let x = 0; x < combos.length; x++) {
      const m = combos[x];
      const stride = this.comboStride[m * t + poss[x]];
      const oldId = this.comboId(row, m); // row[k] still == v here
      const newId = oldId - v * stride + w * stride;
      if (--this.cov[oldId] === 0 && this.isTarget[oldId]) this.addUnc(oldId);
      if (this.cov[newId]++ === 0 && this.isTarget[newId]) this.delUnc(newId);
    }
    row[k] = w;
  }

  /** Build a {key: value} object for `row` into the reusable buffer. */
  private toObj(row: number[]) {
    const obj = this.objBuf;
    for (let k = 0; k < this.K; k++) {
      obj[this.keys[k] as any] = this.valuesPerFactor[k][row[k]];
    }
    return obj;
  }

  /** A row is valid when no constraint evaluates to a definitive `false`. */
  isValidRow(row: number[]): boolean {
    if (!this.hasConstraints) return true;
    const obj = this.toObj(row);
    for (let i = 0; i < this.constraints.length; i++) {
      if (evaluate(this.constraints[i], obj, this.comparer) === false) return false;
    }
    return true;
  }

  /**
   * Simulated annealing: try to drive energy (uncovered target tuples) to 0
   * for the given `rows`, which are mutated in place. Constraint-violating
   * moves are always rejected. Returns the remaining energy (0 = success).
   */
  /**
   * Force the tuple `id` into row `r`, recording each changed cell into the undo
   * buffers from index 0. Returns the number of cells changed. Handles the t=2
   * fast decode and the general path. Consumes no RNG.
   */
  private forceTuple(
    rows: number[][],
    r: number,
    id: number,
    uR: Int32Array,
    uK: Int32Array,
    uV: Int32Array,
  ): number {
    let n = 0;
    if (this.t2) {
      const i = this.decI[id];
      const j = this.decJ[id];
      const vi = this.decVi[id];
      const vj = this.decVj[id];
      if (rows[r][i] !== vi) { uR[n] = r; uK[n] = i; uV[n] = rows[r][i]; n++; this.setCell(rows, r, i, vi); }
      if (rows[r][j] !== vj) { uR[n] = r; uK[n] = j; uV[n] = rows[r][j]; n++; this.setCell(rows, r, j, vj); }
    } else {
      const t = this.t;
      const lv = this.levels;
      const m = this.tupleCombo[id];
      const base = this.comboBase[m];
      for (let pos = 0; pos < t; pos++) {
        const col = this.comboCols[m * t + pos];
        const stride = this.comboStride[m * t + pos];
        const val = Math.floor((id - base) / stride) % lv[col];
        if (rows[r][col] !== val) { uR[n] = r; uK[n] = col; uV[n] = rows[r][col]; n++; this.setCell(rows, r, col, val); }
      }
    }
    return n;
  }

  private anneal(
    rows: number[][],
    iters: number,
    startTemperature: number,
    cool: number,
    targetedMoveRate: number,
    deadline: number,
  ): number {
    this.build(rows);
    let energy = this.uncLen;
    let T = startTemperature;
    const K = this.K;
    const t = this.t;
    const rng = this.rng;
    const lv = this.levels;
    const cap = Math.max(t, 1);
    const uR = new Int32Array(cap);
    const uK = new Int32Array(cap);
    const uV = new Int32Array(cap);
    // Reheat state: escape a frozen cool-down by jumping T back up when stuck.
    // Gated on `iters` so it only engages once cooling has repeatedly failed.
    const reheatStuck = this.reheatStuck > 0 && this.reheatArmed ? this.reheatStuck : 0;
    const reheatTemp = startTemperature * this.reheatFrac;
    let bestEnergy = energy;
    let sinceImprove = 0;
    const bestSnap: number[][] | null =
      reheatStuck > 0 && this.reheatRestore ? rows.map((row) => row.slice()) : null;

    for (let it = 0; it < iters; it++) {
      if (energy === 0) return 0;
      if ((it & 8191) === 0 && (now() > deadline || this.signal?.aborted || this.coopChannel?.shouldStop())) break;

      let n = 0;
      let r: number;

      if (this.uncLen > 0 && rng() < targetedMoveRate) {
        // targeted: force an uncovered target tuple into a row
        const id = this.uncList[(rng() * this.uncLen) | 0];
        if (this.minCollateralSamples > 1) {
          // min-collateral: probe several rows, keep the one whose forcing adds
          // the fewest uncovered tuples (preferring a constraint-valid row).
          let bestR = -1;
          let bestDE = Infinity;
          let bestValid = false;
          for (let s = 0; s < this.minCollateralSamples; s++) {
            const rr = (rng() * rows.length) | 0;
            const nn = this.forceTuple(rows, rr, id, uR, uK, uV);
            const de = this.uncLen - energy;
            const valid = !this.hasConstraints || this.isValidRow(rows[rr]);
            for (let x = nn - 1; x >= 0; x--) this.setCell(rows, uR[x], uK[x], uV[x]);
            if (bestR < 0 || (valid && !bestValid) || (valid === bestValid && de < bestDE)) {
              bestR = rr;
              bestDE = de;
              bestValid = valid;
            }
          }
          r = bestR;
        } else {
          r = (rng() * rows.length) | 0;
        }
        n = this.forceTuple(rows, r, id, uR, uK, uV);
        if (n === 0) {
          r = (rng() * rows.length) | 0;
          const k = (rng() * K) | 0;
          const w = (rng() * lv[k]) | 0;
          uR[n] = r;
          uK[n] = k;
          uV[n] = rows[r][k];
          n++;
          this.setCell(rows, r, k, w);
        }
      } else {
        // random: flip a single cell
        r = (rng() * rows.length) | 0;
        const k = (rng() * K) | 0;
        const w = (rng() * lv[k]) | 0;
        uR[n] = r;
        uK[n] = k;
        uV[n] = rows[r][k];
        n++;
        this.setCell(rows, r, k, w);
      }

      // reject moves that make the touched row (always row r) invalid
      if (this.hasConstraints && !this.isValidRow(rows[r])) {
        for (let x = n - 1; x >= 0; x--) this.setCell(rows, uR[x], uK[x], uV[x]);
        T *= cool;
        continue;
      }

      const after = this.uncLen;
      const dE = after - energy;
      if (dE <= 0 || rng() < Math.exp(-dE / T)) {
        energy = after;
      } else {
        for (let x = n - 1; x >= 0; x--) this.setCell(rows, uR[x], uK[x], uV[x]);
      }
      // Reheat: track the best energy; if stuck too long, restore the best config
      // and jump the temperature back up so the search can escape the basin.
      if (reheatStuck > 0) {
        if (energy < bestEnergy) {
          bestEnergy = energy;
          sinceImprove = 0;
          if (bestSnap) {
            for (let rr = 0; rr < rows.length; rr++) {
              const a = bestSnap[rr];
              const b = rows[rr];
              for (let k = 0; k < K; k++) a[k] = b[k];
            }
          }
        } else if (++sinceImprove >= reheatStuck) {
          if (bestSnap) {
            for (let rr = 0; rr < rows.length; rr++) {
              const a = rows[rr];
              const b = bestSnap[rr];
              for (let k = 0; k < K; k++) a[k] = b[k];
            }
            this.build(rows);
            energy = this.uncLen;
          }
          T = reheatTemp;
          sinceImprove = 0;
        }
      }
      T *= cool;
    }
    return this.uncLen;
  }

  /**
   * Async twin of {@link anneal} for the single-thread MAIN-thread path: it is a
   * faithful copy of the loop above that additionally awaits a macrotask roughly
   * every 12ms so the host event loop keeps breathing — progress paints, the
   * ticker advances, and `signal` cancellation can actually fire. Worker/`reduce`
   * paths stay on the tight synchronous `anneal`. KEEP THE TWO BODIES IN SYNC.
   */
  private async annealAsync(
    rows: number[][],
    iters: number,
    startTemperature: number,
    cool: number,
    targetedMoveRate: number,
    deadline: number,
  ): Promise<number> {
    this.build(rows);
    let energy = this.uncLen;
    let T = startTemperature;
    const K = this.K;
    const t = this.t;
    const rng = this.rng;
    const lv = this.levels;
    const cap = Math.max(t, 1);
    const uR = new Int32Array(cap);
    const uK = new Int32Array(cap);
    const uV = new Int32Array(cap);
    let lastYield = now();
    // Reheat state (mirrors anneal()).
    const reheatStuck = this.reheatStuck;
    const reheatTemp = startTemperature * this.reheatFrac;
    let bestEnergy = energy;
    let sinceImprove = 0;
    const bestSnap: number[][] | null =
      reheatStuck > 0 && this.reheatRestore ? rows.map((row) => row.slice()) : null;

    for (let it = 0; it < iters; it++) {
      if (energy === 0) return 0;
      if ((it & 8191) === 0) {
        if (now() > deadline || this.signal?.aborted || this.coopChannel?.shouldStop()) break;
        if (now() - lastYield > 12) {
          await new Promise<void>((resolve) => setTimeout(resolve));
          lastYield = now();
        }
      }

      let n = 0;
      let r: number;

      if (this.uncLen > 0 && rng() < targetedMoveRate) {
        const id = this.uncList[(rng() * this.uncLen) | 0];
        if (this.minCollateralSamples > 1) {
          let bestR = -1;
          let bestDE = Infinity;
          let bestValid = false;
          for (let s = 0; s < this.minCollateralSamples; s++) {
            const rr = (rng() * rows.length) | 0;
            const nn = this.forceTuple(rows, rr, id, uR, uK, uV);
            const de = this.uncLen - energy;
            const valid = !this.hasConstraints || this.isValidRow(rows[rr]);
            for (let x = nn - 1; x >= 0; x--) this.setCell(rows, uR[x], uK[x], uV[x]);
            if (bestR < 0 || (valid && !bestValid) || (valid === bestValid && de < bestDE)) {
              bestR = rr;
              bestDE = de;
              bestValid = valid;
            }
          }
          r = bestR;
        } else {
          r = (rng() * rows.length) | 0;
        }
        n = this.forceTuple(rows, r, id, uR, uK, uV);
        if (n === 0) {
          r = (rng() * rows.length) | 0;
          const k = (rng() * K) | 0;
          const w = (rng() * lv[k]) | 0;
          uR[n] = r;
          uK[n] = k;
          uV[n] = rows[r][k];
          n++;
          this.setCell(rows, r, k, w);
        }
      } else {
        r = (rng() * rows.length) | 0;
        const k = (rng() * K) | 0;
        const w = (rng() * lv[k]) | 0;
        uR[n] = r;
        uK[n] = k;
        uV[n] = rows[r][k];
        n++;
        this.setCell(rows, r, k, w);
      }

      if (this.hasConstraints && !this.isValidRow(rows[r])) {
        for (let x = n - 1; x >= 0; x--) this.setCell(rows, uR[x], uK[x], uV[x]);
        T *= cool;
        continue;
      }

      const after = this.uncLen;
      const dE = after - energy;
      if (dE <= 0 || rng() < Math.exp(-dE / T)) {
        energy = after;
      } else {
        for (let x = n - 1; x >= 0; x--) this.setCell(rows, uR[x], uK[x], uV[x]);
      }
      if (reheatStuck > 0) {
        if (energy < bestEnergy) {
          bestEnergy = energy;
          sinceImprove = 0;
          if (bestSnap) {
            for (let rr = 0; rr < rows.length; rr++) {
              const a = bestSnap[rr];
              const b = rows[rr];
              for (let k = 0; k < K; k++) a[k] = b[k];
            }
          }
        } else if (++sinceImprove >= reheatStuck) {
          if (bestSnap) {
            for (let rr = 0; rr < rows.length; rr++) {
              const a = rows[rr];
              const b = bestSnap[rr];
              for (let k = 0; k < K; k++) a[k] = b[k];
            }
            this.build(rows);
            energy = this.uncLen;
          }
          T = reheatTemp;
          sinceImprove = 0;
        }
      }
      T *= cool;
    }
    return this.uncLen;
  }

  /** Drop the row that covers the fewest target tuples uniquely (cov === 1). */
  private seed(rows: number[][]): number[][] {
    this.build(rows);
    let bestI = 0;
    let bestS = Infinity;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let s = 0;
      for (let m = 0; m < this.M; m++) {
        const id = this.comboId(row, m);
        if (this.isTarget[id] && this.cov[id] === 1) s++;
      }
      if (s < bestS) {
        bestS = s;
        bestI = r;
      }
    }
    return rows.filter((_, i) => i !== bestI).map((row) => row.slice());
  }

  /**
   * Anytime reduction: repeatedly attempt N -> N-1 by annealing. On success,
   * adopt the smaller array and try again; on failure grow the iteration
   * budget and retry until the time budget is spent.
   */
  reduce(
    rows: number[][],
    budgetMs: number,
    initialIterations: number,
    iterationGrowth: number,
    startTemperature: number,
    endTemperature: number,
    targetedMoveRate: number,
    onProgress?: (info: { rows: number; elapsedMs: number }) => void,
  ): number[][] {
    const start = now();
    const deadline = start + budgetMs;
    let cur = rows.map((row) => row.slice());
    let best = cur;

    while (cur.length > 1 && now() < deadline && !this.signal?.aborted) {
      let cracked: number[][] | null = null;
      let iters = initialIterations;
      this.reheatArmed = cur.length <= this.reheatMaxRows;
      while (now() < deadline && !this.signal?.aborted) {
        const cool = Math.pow(endTemperature / startTemperature, 1 / Math.max(1, iters));
        const trial = this.seed(cur);
        if (this.anneal(trial, iters, startTemperature, cool, targetedMoveRate, deadline) === 0) {
          cracked = trial;
          break;
        }
        iters = Math.floor(iters * iterationGrowth);
      }
      if (!cracked) break;
      cur = cracked;
      best = cur;
      onProgress?.({ rows: cur.length, elapsedMs: now() - start });
    }
    return best;
  }

  /**
   * Async twin of {@link reduce} for the single-thread MAIN-thread path (used
   * when the run can't be parallelized — e.g. `fn` constraints can't cross a
   * worker). Identical anytime loop, but it anneals via {@link annealAsync} so
   * the event loop stays responsive (live progress, working Cancel).
   */
  async reduceAsync(
    rows: number[][],
    budgetMs: number,
    initialIterations: number,
    iterationGrowth: number,
    startTemperature: number,
    endTemperature: number,
    targetedMoveRate: number,
    onProgress?: (info: { rows: number; elapsedMs: number }) => void,
  ): Promise<number[][]> {
    const start = now();
    const deadline = start + budgetMs;
    let cur = rows.map((row) => row.slice());
    let best = cur;

    while (cur.length > 1 && now() < deadline && !this.signal?.aborted) {
      let cracked: number[][] | null = null;
      let iters = initialIterations;
      this.reheatArmed = cur.length <= this.reheatMaxRows;
      while (now() < deadline && !this.signal?.aborted) {
        const cool = Math.pow(endTemperature / startTemperature, 1 / Math.max(1, iters));
        const trial = this.seed(cur);
        if ((await this.annealAsync(trial, iters, startTemperature, cool, targetedMoveRate, deadline)) === 0) {
          cracked = trial;
          break;
        }
        iters = Math.floor(iters * iterationGrowth);
      }
      if (!cracked) break;
      cur = cracked;
      best = cur;
      onProgress?.({ rows: cur.length, elapsedMs: now() - start });
    }
    return best;
  }

  /**
   * Cooperative (island-model) reduction. Same anytime loop as `reduce`, but the
   * worker consults a shared `CoopChannel`: when it falls behind the global best
   * AND stalls past `patience × (the leader's cost for this stage)`, it adopts
   * the global-best array and continues from there (unless it is a scout).
   * Successful row reductions are published back so other workers can catch up.
   * This removes the redundant re-descent of independent best-of-K and lets the
   * whole fleet concentrate on the frontier, while scouts preserve diversity.
   */
  reduceCooperative(
    rows: number[][],
    budgetMs: number,
    initialIterations: number,
    iterationGrowth: number,
    startTemperature: number,
    endTemperature: number,
    targetedMoveRate: number,
    ch: CoopChannel,
    onCrack?: (rows: number, elapsedMs: number) => void,
  ): number[][] {
    const start = now();
    const deadline = start + budgetMs;
    // Let anneal() honor the shared stop flag so a cancel interrupts a running
    // attempt promptly, not only between attempts.
    this.coopChannel = ch;
    let cur = rows.map((row) => row.slice());
    let localN = cur.length;
    let stageIters = 0;
    let curIters = initialIterations;

    while (localN > 1 && now() < deadline && !ch.shouldStop()) {
      // merge: behind the leader AND stalled past patience × leader's stage cost
      if (!ch.isScout && localN > ch.bestRows()) {
        const sc = ch.stageCost(localN); // leader's iters to crack localN -> localN-1
        if (sc > 0 && stageIters > ch.patience * sc) {
          const adopted = ch.adopt();
          if (adopted && adopted.length < localN) {
            cur = adopted;
            localN = adopted.length;
            stageIters = 0;
            curIters = initialIterations;
            continue;
          }
        }
      }
      this.reheatArmed = localN <= this.reheatMaxRows;
      const cool = Math.pow(endTemperature / startTemperature, 1 / Math.max(1, curIters));
      const trial = this.seed(cur);
      const e = this.anneal(trial, curIters, startTemperature, cool, targetedMoveRate, deadline);
      stageIters += curIters;
      if (e === 0) {
        cur = trial;
        const newN = localN - 1;
        ch.publish(newN, cur, stageIters, localN);
        onCrack?.(newN, now() - start);
        localN = newN;
        stageIters = 0;
        curIters = initialIterations;
      } else {
        curIters = Math.floor(curIters * iterationGrowth);
      }
    }
    return cur;
  }

  /**
   * Independent safety valve: recompute coverage from scratch and confirm
   * every original target tuple is still covered and every row is valid.
   * Does not touch the annealer's incremental state.
   */
  verify(rows: number[][]): boolean {
    for (const row of rows) {
      if (!this.isValidRow(row)) return false;
    }
    const covered = new Uint8Array(this.T);
    for (const row of rows) {
      for (let m = 0; m < this.M; m++) covered[this.comboId(row, m)] = 1;
    }
    for (let id = 0; id < this.T; id++) {
      if (this.isTarget[id] && !covered[id]) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Post-process a covering array produced by `make` with simulated annealing,
 * returning an array with the same shape but (usually) fewer rows.
 *
 * The result is guaranteed to preserve every t-tuple the input covered and to
 * satisfy every constraint — verified independently before returning. If the
 * optimizer cannot improve on the input (or would break the invariant), the
 * input is returned unchanged. Construction and optimization stay decoupled:
 * `optimize` never mutates its arguments.
 */
interface OptimizeContext<T extends FactorsType> {
  keys: ScalarType[];
  valuesPerFactor: any[][];
  K: number;
  intRows: number[][];
  decode: (intRow: number[]) => SuggestRowType<T>;
}

/** Encode input rows to integer indices and build the decode closure. Shared by `optimize`/`optimizeParallel`. */
function prepareOptimize<T extends FactorsType>(
  rows: SuggestRowType<T>[],
  factors: T,
): OptimizeContext<T> {
  const factorIsArray = Array.isArray(factors);
  const items = getItems(factors);
  const keys = items.map(([k]) => k);
  const valuesPerFactor = items.map(([, v]) => v);
  const K = keys.length;

  const decode = (intRow: number[]): SuggestRowType<T> => {
    if (factorIsArray) {
      return intRow.map((idx, k) => valuesPerFactor[k][idx]) as SuggestRowType<T>;
    }
    const obj: { [k: string]: any } = {};
    for (let k = 0; k < K; k++) obj[keys[k] as any] = valuesPerFactor[k][intRow[k]];
    return obj as SuggestRowType<T>;
  };

  // encode the input rows to integer indices (same equality as `make`: indexOf)
  const intRows: number[][] = rows.map((row) => {
    const encoded = new Array<number>(K);
    for (let k = 0; k < K; k++) {
      const value = factorIsArray ? (row as any)[k] : (row as any)[keys[k]];
      const idx = valuesPerFactor[k].indexOf(value);
      if (idx === -1) {
        throw new Error(
          `optimize: value ${JSON.stringify(value)} for factor ${String(
            keys[k],
          )} is not one of the declared factor values`,
        );
      }
      encoded[k] = idx;
    }
    return encoded;
  });

  return { keys, valuesPerFactor, K, intRows, decode };
}

export function optimize<T extends FactorsType>(
  ctrl: Controller<T>,
  rows: SuggestRowType<T>[],
  tuning: OptimizeTuning = {},
): SuggestRowType<T>[] {
  const {
    budgetMs = 1000,
    seed = 0x9e3779b9,
    onProgress,
    signal,
    initialIterations = 400000,
    iterationGrowth = 1.6,
    startTemperature = 2.5,
    endTemperature = 0.02,
    targetedMoveRate = 0.5,
    minCollateralSamples = 1,
  } = tuning;
  // strength / constraints / comparer come from the Controller — a single source
  // of truth, so they can never drift out of sync with the `make` run.
  const strength = ctrl.strength;
  const constraints = ctrl.options.constraints ?? [];
  const comparer = ctrl.options.comparer ?? {};

  const { keys, valuesPerFactor, K, intRows, decode } = prepareOptimize(rows, ctrl.factors as T);

  // nothing to optimize: fewer than 2 rows, or t exceeds the factor count
  if (intRows.length <= 1 || K < strength) {
    return intRows.map(decode);
  }

  const normConstraints = constraints.map(normalizeCondition);
  const sa = new SAOptimizer(
    keys,
    valuesPerFactor,
    intRows,
    strength,
    normConstraints,
    comparer,
    seed,
  );
  sa.minCollateralSamples = Math.max(1, Math.floor(minCollateralSamples));
  sa.signal = signal;

  const best = sa.reduce(
    intRows, budgetMs, initialIterations, iterationGrowth, startTemperature, endTemperature, targetedMoveRate, onProgress,
  );

  // safety valve: never return an array that fails the invariant
  const chosen = sa.verify(best) ? best : intRows;
  return chosen.map(decode);
}

// ---------------------------------------------------------------------------
// Parallel (cooperative island-model portfolio) — `optimizeParallel`
// ---------------------------------------------------------------------------

/** Clonable parameter bundle handed to a worker. Never contains functions. */
export interface WorkerReduceParams {
  levels: number[];
  keys?: ScalarType[];
  valuesPerFactor?: any[][];
  intRows: number[][];
  strength: number;
  constraints: Expression[];
  seed: number;
  budgetMs: number;
  initialIterations: number;
  iterationGrowth: number;
  startTemperature: number;
  endTemperature: number;
  targetedMoveRate: number;
  minCollateralSamples?: number;
  /** Present in cooperative runs: shared island-model state (SharedArrayBuffer-backed). */
  coop?: CoopShared;
}

/** SharedArrayBuffer-backed state shared by all cooperative workers. */
export interface CoopShared {
  ctrl: Int32Array; // [0]=bestN, [1]=lock, [2]=stop, [3+n]=stageCost[n]
  best: Uint8Array; // maxN * K, row-major, first bestN rows valid
  maxN: number;
  K: number;
  patience: number;
  isScout: boolean;
}

const COOP_LOCK = 1;
const COOP_STOP = 2;
const COOP_STAGE = 3;

/** Build a `CoopChannel` over SharedArrayBuffer-backed state (Atomics + a spinlock). */
function makeCoopChannel(s: CoopShared): CoopChannel {
  const { ctrl, best, K, patience, isScout } = s;
  const lock = () => { while (Atomics.compareExchange(ctrl, COOP_LOCK, 0, 1) !== 0) { /* spin */ } };
  const unlock = () => { Atomics.store(ctrl, COOP_LOCK, 0); };
  return {
    isScout,
    patience,
    bestRows: () => Atomics.load(ctrl, 0),
    stageCost: (n) => Atomics.load(ctrl, COOP_STAGE + n),
    shouldStop: () => Atomics.load(ctrl, COOP_STOP) !== 0,
    adopt: () => {
      lock();
      const bn = Atomics.load(ctrl, 0);
      const rows: number[][] = [];
      for (let r = 0; r < bn; r++) {
        const off = r * K;
        const row = new Array<number>(K);
        for (let k = 0; k < K; k++) row[k] = best[off + k];
        rows.push(row);
      }
      unlock();
      return rows.length ? rows : null;
    },
    publish: (rows, data, stageIters, fromN) => {
      lock();
      if (Atomics.load(ctrl, COOP_STAGE + fromN) === 0) {
        Atomics.store(ctrl, COOP_STAGE + fromN, Math.min(stageIters, 0x7fffffff));
      }
      if (rows < Atomics.load(ctrl, 0)) {
        for (let r = 0; r < rows; r++) {
          const off = r * K;
          const row = data[r];
          for (let k = 0; k < K; k++) best[off + k] = row[k];
        }
        Atomics.store(ctrl, 0, rows);
      }
      unlock();
    },
  };
}

/**
 * Worker entry point: rebuild an `SAOptimizer` from a clonable param bundle and
 * run the reduction (cooperative when `coop` is present, else independent).
 * Exported so a worker thread can import this same module and call it. Not part
 * of the stable public API (prefixed `__`).
 */
export function __workerReduce(
  p: WorkerReduceParams,
  onProgress?: (rows: number, elapsedMs: number) => void,
): { rows: number; data: number[][] } {
  const keys = p.keys ?? p.levels.map((_, i) => i);
  const valuesPerFactor =
    p.valuesPerFactor ?? p.levels.map((l) => Array.from({ length: l }, (_, i) => i));
  const normConstraints = p.constraints.map(normalizeCondition);
  const sa = new SAOptimizer(keys, valuesPerFactor, p.intRows, p.strength, normConstraints, {}, p.seed);
  sa.minCollateralSamples = Math.max(1, Math.floor(p.minCollateralSamples ?? 1));
  const best = p.coop
    ? sa.reduceCooperative(
        p.intRows, p.budgetMs, p.initialIterations, p.iterationGrowth, p.startTemperature, p.endTemperature, p.targetedMoveRate,
        makeCoopChannel(p.coop), onProgress,
      )
    : sa.reduce(
        p.intRows, p.budgetMs, p.initialIterations, p.iterationGrowth, p.startTemperature, p.endTemperature, p.targetedMoveRate,
        onProgress ? (info) => onProgress(info.rows, info.elapsedMs) : undefined,
      );
  return { rows: best.length, data: best };
}

/** True when any custom comparer function or `fn`-constraint is present (not clonable). */
function usesFunctions(comparer: Comparer, constraints: Expression[]): boolean {
  if (comparer && Object.keys(comparer).length > 0) return true;
  const walk = (c: Expression): boolean => {
    if (c.operator === "fn") return true;
    if (c.operator === "and" || c.operator === "or") return c.conditions.some(walk);
    if (c.operator === "not") return walk(c.condition);
    return false;
  };
  return constraints.some(walk);
}

/** One worker's strategy: distinct seed plus a point in the move-strategy space. */
export interface WorkerVariant {
  seed: number;
  minCollateralSamples: number;
  targetedMoveRate: number;
  /** Scouts never merge with the fleet — they keep exploring independently. */
  isScout?: boolean;
}

/**
 * Default strategy portfolio for `optimizeParallel`. Mixes plain moves (scouts,
 * `minCollateralSamples: 1` — never worse than uniform best-of-K) with min-collateral
 * moves and a couple of `targetedMoveRate` variations, so that whichever strategy suits
 * the instance is present and wins the best-of-K. Cycled if there are more
 * workers than entries.
 */
const DEFAULT_PORTFOLIO: readonly Omit<WorkerVariant, "seed">[] = [
  { minCollateralSamples: 1, targetedMoveRate: 0.5 },
  { minCollateralSamples: 4, targetedMoveRate: 0.5 },
  { minCollateralSamples: 1, targetedMoveRate: 0.5 },
  { minCollateralSamples: 8, targetedMoveRate: 0.5 },
  { minCollateralSamples: 4, targetedMoveRate: 0.7 },
  { minCollateralSamples: 1, targetedMoveRate: 0.3 },
  { minCollateralSamples: 2, targetedMoveRate: 0.6 },
  { minCollateralSamples: 4, targetedMoveRate: 0.5 },
];

type CoopBackend = {
  runCooperative: (
    base: Omit<WorkerReduceParams, "seed" | "minCollateralSamples" | "targetedMoveRate" | "coop">,
    variants: WorkerVariant[],
    maxN: number,
    K: number,
    patience: number,
    onProgress?: (info: { rows: number; elapsedMs: number }) => void,
    signal?: AbortSignal,
    workerUrl?: string,
  ) => Promise<number[][]>;
};

/**
 * Run the cooperative portfolio on whichever worker backend the runtime offers,
 * chosen by **capability**, not by a runtime allow-list: Node/Bun expose
 * `worker_threads`; browsers/Deno/Electron-renderer expose the global `Worker`.
 * Cooperation needs `SharedArrayBuffer` (cross-origin isolation in the browser).
 * Returns `null` if no backend works, so the caller falls back to one thread.
 */
async function runParallelBackend(
  base: Omit<WorkerReduceParams, "seed" | "minCollateralSamples" | "targetedMoveRate" | "coop">,
  variants: WorkerVariant[],
  maxN: number,
  K: number,
  patience: number,
  onProgress?: (info: { rows: number; elapsedMs: number }) => void,
  signal?: AbortSignal,
  workerUrl?: string,
): Promise<number[][] | null> {
  if (typeof SharedArrayBuffer === "undefined") return null;
  const g = globalThis as any;
  const isDeno = typeof g.Deno !== "undefined";
  const nodeLike =
    !isDeno &&
    typeof process !== "undefined" &&
    !!(process as any).versions &&
    (!!(process as any).versions.node || !!(process as any).versions.bun);
  // Prefer worker_threads on Node/Bun (proven), else the web Worker backend.
  const loaders: Array<() => Promise<CoopBackend>> = [];
  if (nodeLike) loaders.push(() => import("./optimize-parallel-node") as Promise<CoopBackend>);
  if (typeof g.Worker !== "undefined") loaders.push(() => import("./optimize-parallel-web") as Promise<CoopBackend>);
  for (const load of loaders) {
    try {
      const backend = await load();
      return await backend.runCooperative(base, variants, maxN, K, patience, onProgress, signal, workerUrl);
    } catch {
      // backend unavailable at runtime — try the next one
    }
  }
  return null;
}

/**
 * Parallel variant of `optimize` (`workers` > 1). Runs a **cooperative island
 * model** on worker threads: a portfolio of strategies × seeds shares a
 * global-best array, laggards adopt it once they stall while scouts keep
 * exploring, and the smallest verified result is returned. Semantics and
 * guarantees match `optimize` exactly — the chosen array is independently
 * verified in the main thread. Falls back to a single in-process run when
 * workers/SharedArrayBuffer are unavailable or the run uses a custom
 * `comparer`/`fn`-constraint.
 */
export async function optimizeParallel<T extends FactorsType>(
  ctrl: Controller<T>,
  rows: SuggestRowType<T>[],
  tuning: OptimizeParallelTuning = {},
): Promise<SuggestRowType<T>[]> {
  const {
    budgetMs = 1000,
    seed = 0x9e3779b9,
    onProgress,
    signal,
    initialIterations = 400000,
    iterationGrowth = 1.6,
    startTemperature = 2.5,
    endTemperature = 0.02,
    targetedMoveRate = 0.5,
    workers = 1,
    workerUrl,
  } = tuning;
  const strength = ctrl.strength;
  const constraints = ctrl.options.constraints ?? [];
  const comparer = ctrl.options.comparer ?? {};

  const { keys, valuesPerFactor, K, intRows, decode } = prepareOptimize(rows, ctrl.factors as T);
  if (intRows.length <= 1 || K < strength) {
    return intRows.map(decode);
  }

  const normConstraints = constraints.map(normalizeCondition);
  // Main-thread optimizer: used both for the single-thread path and as the
  // independent safety valve for parallel results.
  const sa = new SAOptimizer(keys, valuesPerFactor, intRows, strength, normConstraints, comparer, seed);
  sa.signal = signal;

  const wantWorkers = Math.max(1, Math.floor(workers));
  const canParallel = wantWorkers > 1 && !usesFunctions(comparer, constraints);

  let bestData: number[][];
  if (!canParallel) {
    // Single thread on the main thread: anneal asynchronously so the caller's
    // event loop stays responsive (live progress + working cancellation).
    bestData = await sa.reduceAsync(
      intRows, budgetMs, initialIterations, iterationGrowth, startTemperature, endTemperature, targetedMoveRate, onProgress,
    );
  } else {
    const levels = valuesPerFactor.map((v) => v.length);
    const hasConstraints = constraints.length > 0;
    const base: Omit<WorkerReduceParams, "seed" | "minCollateralSamples" | "targetedMoveRate"> = {
      levels,
      // only ship keys/values when constraints actually need them (values may be non-clonable)
      keys: hasConstraints ? keys : undefined,
      valuesPerFactor: hasConstraints ? valuesPerFactor : undefined,
      intRows,
      strength,
      constraints,
      budgetMs,
      initialIterations,
      iterationGrowth,
      startTemperature,
      endTemperature,
    };
    // Cooperative island-model portfolio: each worker gets a distinct seed and a
    // strategy from the mix; a couple of scouts never merge (preserving
    // diversity) while the rest converge on the shared frontier.
    const numScouts = wantWorkers >= 4 ? 2 : wantWorkers >= 2 ? 1 : 0;
    const variants: WorkerVariant[] = Array.from({ length: wantWorkers }, (_, i) => ({
      seed: (seed + i) | 0,
      ...DEFAULT_PORTFOLIO[i % DEFAULT_PORTFOLIO.length],
      isScout: i < numScouts,
    }));
    // Pick a worker backend by capability (Node worker_threads or Web Worker);
    // fall back to a single in-process run when none is available.
    const cooperativeResult = await runParallelBackend(base, variants, intRows.length, K, 3, onProgress, signal, workerUrl);
    bestData =
      cooperativeResult ??
      sa.reduce(
        intRows, budgetMs, initialIterations, iterationGrowth, startTemperature, endTemperature, targetedMoveRate, onProgress,
      );
  }

  // safety valve: verify the chosen array in-process with the real comparer/constraints
  const chosen = sa.verify(bestData) ? bestData : intRows;
  return chosen.map(decode);
}
