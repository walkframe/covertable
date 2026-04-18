import greedy from "./criteria/greedy";
import hash from "./sorters/hash";
import {
  range,
  product,
  combinations,
  len,
  getItems,
  getCandidate,
  ascOrder,
  primeGenerator,
  unique,
} from "./lib";

import {
  IndicesType,
  FactorsType,
  SerialsType,
  ScalarType,
  DictType,
  PairByKeyType,
  ParentsType,
  CandidateType,
  RowType,
  OptionsType,
  PairType,
  SuggestRowType,
  Expression,
  Comparer,
} from "./types";
import { evaluate, extractKeys, TriState } from "./evaluate";
import { NeverMatch, UncoveredPair } from "./exceptions";

export class Row extends Map<ScalarType, number> implements RowType {
  /** Pair keys that failed constraint checks for this row attempt. */
  public invalidPairs: Set<ScalarType> = new Set();

  constructor(row: CandidateType) {
    super();
    for (const [k, v] of row) {
      this.set(k, v);
    }
  }
  getPairKey(...newPair: number[]) {
    const pair = [...this.values(), ...newPair];
    return unique(pair);
  }
  copy(row: Row) {
    for (let [k, v] of row.entries()) {
      this.set(k, v);
    }
  }
}

interface ResolvedConstraint {
  condition: Expression;
  keys: ReadonlySet<string>;
}

export interface ControllerStats {
  /** Total pairs before any pruning. */
  totalPairs: number;
  /** Number of pairs pruned by constraints (infeasible). */
  prunedPairs: number;
  /** Number of pairs consumed so far. */
  coveredPairs: number;
  /** Coverage ratio: coveredPairs / (totalPairs - prunedPairs). */
  progress: number;
  /** Number of generated rows. */
  rowCount: number;
  /** Pairs that could not be covered. Populated after make/makeAsync completes. */
  uncoveredPairs: UncoveredPair[];
  /** Counts of values filled by close() (completion), keyed by factor then value. */
  completions: Record<string, Record<string, number>>;
}

export class Controller<T extends FactorsType> {
  public factorLength: number;
  public factorIsArray: Boolean;

  private serials: SerialsType = new Map();
  private parents: ParentsType = new Map();
  private indices: IndicesType = new Map();
  public incomplete: PairByKeyType = new Map();

  private rejected: Set<ScalarType> = new Set();
  public row: Row;

  private _totalPairs: number = 0;
  private _prunedPairs: number = 0;
  private _rowCount: number = 0;
  private _uncoveredPairs: UncoveredPair[] = [];
  private _completions: Record<string, Record<string, number>> = {};

  get stats(): ControllerStats {
    return {
      totalPairs: this._totalPairs,
      prunedPairs: this._prunedPairs,
      coveredPairs: this._totalPairs - this._prunedPairs - this.incomplete.size,
      progress: this._totalPairs === 0 ? 0 : 1 - this.incomplete.size / this._totalPairs,
      rowCount: this._rowCount,
      uncoveredPairs: this._uncoveredPairs,
      completions: this._completions,
    };
  }

  private constraints: ResolvedConstraint[] = [];
  private constraintsByKey: Map<string, Set<number>> = new Map();
  private comparer: Comparer;

  /**
   * Indices into `constraints` that have already evaluated to `true`
   * against the **current** row. Cleared whenever the row is reset or
   * yielded. Safe because the row only grows and each condition is
   * deterministic over its declared keys.
   */
  private passedIndexes: Set<number> = new Set();

  constructor(public factors: FactorsType, public options: OptionsType<T> = {}) {
    this.comparer = options.comparer ?? {};
    this.serialize(factors);
    this.factorLength = len(factors);
    this.factorIsArray = factors instanceof Array;
    this.resolveConstraints();
    this.setIncomplete();
    this._totalPairs = this.incomplete.size;
    this.row = new Row([]);

    // Delete initial pairs that cannot possibly satisfy the constraints.
    // Two-pass: first check direct violations, then use forward checking
    // to detect pairs made impossible by constraint chains.
    for (const [pairKey, pair] of this.incomplete.entries()) {
      const cand = this.getCandidate(pair);
      if (this.storableCheck(cand) === false) {
        this.incomplete.delete(pairKey);
      } else if (this.constraints.length > 0) {
        const snapshot = new Row(cand);
        if (!this.forwardCheck(snapshot)) {
          this.incomplete.delete(pairKey);
        }
      }
    }
    this._prunedPairs = this._totalPairs - this.incomplete.size;

  }

  private resolveConstraints() {
    const constraints = this.options.constraints ?? [];
    for (let i = 0; i < constraints.length; i++) {
      const keys = extractKeys(constraints[i]);
      this.constraints.push({ condition: constraints[i], keys });
      for (const k of keys) {
        let set = this.constraintsByKey.get(k);
        if (!set) {
          set = new Set();
          this.constraintsByKey.set(k, set);
        }
        set.add(i);
      }
    }
  }

  private serialize(factors: FactorsType) {
    let origin = 0;
    const primer = primeGenerator();
    getItems(factors).map(([subscript, elements]) => {
      const lenElements = len(elements);
      const serialList: number[] = [];
      range(origin, origin + lenElements).map((index) => {
        const serial = primer.next().value;
        serialList.push(serial);
        this.parents.set(serial, subscript);
        this.indices.set(serial, index);
      });
      this.serials.set(subscript, serialList);
      origin += lenElements;
    });
  };

  private setIncomplete() {
    const { sorter = hash, salt = "" } = this.options;
    const pairs: PairType[] = [];
    const allKeys = getItems(this.serials).map(([k, _]) => k);
    const subModels = this.options.subModels ?? [];
    const subModelKeySets = subModels.map(sm => new Set(sm.fields));

    const isWithinSubModel = (keys: ScalarType[]) =>
      subModelKeySets.some(ks => keys.every(k => ks.has(k)));

    for (const keys of combinations(allKeys, this.strength)) {
      if (isWithinSubModel(keys)) continue;
      const comb = range(0, this.strength).map((i) => this.serials.get(keys[i]) as PairType);
      for (let pair of product(...comb)) {
        pairs.push(pair.sort(ascOrder));
      }
    }

    for (const sub of subModels) {
      for (const keys of combinations(sub.fields, sub.strength)) {
        const comb = range(0, sub.strength).map((i) => this.serials.get(keys[i]) as PairType);
        for (let pair of product(...comb)) {
          pairs.push(pair.sort(ascOrder));
        }
      }
    }

    for (let pair of sorter(pairs, { salt, indices: this.indices })) {
      this.incomplete.set(unique(pair), pair);
    }
  }

  /**
   * Try to add a candidate pair to the current row. Evaluates constraints
   * against a snapshot (row + pair) without mutating `this.row`. If all
   * constraints pass (or are unknown), the pair is committed to `this.row`
   * and `true` is returned. If any constraint definitively fails, `this.row`
   * is unchanged and `false` is returned.
   */
  private setPair(pair: PairType): boolean {
    const candidate = this.getCandidate(pair);
    // Build a snapshot to evaluate constraints against.
    const snapshot = new Row([...this.row.entries(), ...candidate]);
    const snapshotObj = this.toObject(snapshot);

    // Evaluate all non-passed constraints on the snapshot.
    for (let i = 0; i < this.constraints.length; i++) {
      if (this.passedIndexes.has(i)) continue;
      const result = evaluate(this.constraints[i].condition, snapshotObj, this.comparer);
      if (result === false) return false;
    }

    // All constraints pass or unknown — run forward check before committing.
    if (!this.forwardCheck(snapshot)) return false;

    // Forward check passed — commit the pair.
    for (const [key, value] of candidate) {
      this.row.set(key, value);
    }
    this.markPassedConstraints(this.row);
    return true;
  }

  private consumePairs(row: Row) {
    for (const s of this.allStrengths) {
      for (let pair of combinations([...row.values()], s)) {
        const pairKey = unique(pair);
        this.incomplete.delete(pairKey);
      }
    }
  }

  public getCandidate(pair: PairType) {
    return getCandidate(pair, this.parents);
  }

  public isCompatible(pair: PairType): number | null {
    let num = 0;
    for (const serial of pair) {
      const key = this.parents.get(serial)!;
      const existing = this.row.get(key);
      if (typeof existing === "undefined") {
        num++;
      } else if (existing !== serial) {
        return null;
      }
    }
    return num;
  }

  /**
   * Check whether adding `candidate` to `row` would violate any constraint.
   * Returns `true` (OK), `false` (definitively violated), or `null`
   * (some dependency is still missing — defer).
   *
   * Constraints already in `passedIndexes` are skipped.
   */
  private storableCheck(candidate: CandidateType, row: Row = this.row): TriState {
    if (this.constraints.length === 0) return true;
    let nxtObject: DictType | null = null;
    for (let i = 0; i < this.constraints.length; i++) {
      if (this.passedIndexes.has(i)) continue;
      if (nxtObject === null) {
        const nxt = new Row([...row.entries(), ...candidate]);
        nxtObject = this.toObject(nxt);
      }
      const result = evaluate(this.constraints[i].condition, nxtObject, this.comparer);
      if (result === false) return false;
      // true or unknown → continue checking other constraints
    }
    return true;
  }

  /**
   * Returns the number of new keys this candidate would add to `row`, or
   * `null` if the candidate is incompatible or would definitively violate a
   * constraint. `null` results from three-valued evaluation are treated
   * as "OK for now" — they will be rechecked once more keys are known.
   */
  public storable(candidate: CandidateType, row: Row = this.row): number | null {
    let num = 0;
    for (let [key, el] of candidate) {
      let existing: number | undefined = row.get(key);
      if (typeof existing === "undefined") {
        num++;
      } else if (existing != el) {
        return null;
      }
    }
    const check = this.storableCheck(candidate, row);
    if (check === false) return null;
    return num;
  }

  /**
   * Evaluate constraints against `row` and mark those that pass as done.
   * Returns `false` if any constraint definitively fails (= the row is
   * unsalvageable and should be abandoned), `true` otherwise.
   */
  private markPassedConstraints(row: Row): boolean {
    if (this.constraints.length === 0) return true;
    let obj: DictType | null = null;
    for (let i = 0; i < this.constraints.length; i++) {
      if (this.passedIndexes.has(i)) continue;
      if (obj === null) obj = this.toObject(row);
      const result = evaluate(this.constraints[i].condition, obj, this.comparer);
      if (result === true) {
        this.passedIndexes.add(i);
      } else if (result === false) {
        return false;
      }
    }
    return true;
  }

  /**
   * Forward checking: given a snapshot row, propagate constraints to prune
   * domains of unfilled factors. If any factor's domain becomes empty, the
   * current assignment is unsolvable — return false.
   *
   * This is read-only: it does NOT modify this.row. It builds a temporary
   * domain map and iteratively narrows it by evaluating constraints with
   * each candidate value.
   */
  private forwardCheck(snapshot: Row): boolean {
    if (this.constraints.length === 0) return true;

    // Build initial domains for unfilled factors.
    const domains = new Map<ScalarType, number[]>();
    for (const [key, serials] of this.serials.entries()) {
      if (!snapshot.has(key)) {
        domains.set(key, [...serials]);
      }
    }
    if (domains.size === 0) return true;

    // Start with all constraints as potentially relevant.
    // Restricting to only snapshot-key constraints would miss constraints
    // that solely reference unfilled factors (e.g. a constant constraint
    // like `machine=WindowsPhone` when machine is unfilled).
    const relevantSet = new Set<number>(this.constraints.map((_, i) => i));

    // Iterative arc-consistency: prune domains, and when a domain shrinks
    // to 1 value (forced), "assign" it in the temp row and re-propagate.
    // For multi-value domains, after pruning, check what peer factor values
    // survive under ALL remaining candidates (intersection). If a peer
    // value doesn't survive under some candidate, it can be pruned.
    const tempRow = new Row([...snapshot.entries()]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [key, domain] of domains.entries()) {
        if (domain.length === 0) return false;
        const keyConstraints = this.constraintsByKey.get(key as string);
        if (!keyConstraints) continue;
        let hasRelevant = false;
        for (const ci of keyConstraints) {
          if (relevantSet.has(ci)) { hasRelevant = true; break; }
        }
        if (!hasRelevant) continue;

        const surviving: number[] = [];
        for (const serial of domain) {
          tempRow.set(key, serial);
          const obj = this.toObject(tempRow);
          let viable = true;
          for (const ci of keyConstraints) {
            if (this.passedIndexes.has(ci)) continue;
            if (evaluate(this.constraints[ci].condition, obj, this.comparer) === false) {
              viable = false;
              break;
            }
          }
          if (viable) surviving.push(serial);
        }
        tempRow.delete(key);

        if (surviving.length === 0) return false;
        if (surviving.length < domain.length) {
          domains.set(key, surviving);
          changed = true;
          if (surviving.length === 1) {
            tempRow.set(key, surviving[0]);
            domains.delete(key);
            const nc = this.constraintsByKey.get(key as string);
            if (nc) { for (const ci of nc) relevantSet.add(ci); }
          }
        }

        // For multi-value surviving domains, check peer factors.
        // For each peer, compute which values survive under EVERY candidate
        // of this factor (intersection). Values that fail under any candidate
        // can be pruned from the peer's domain.
        if (surviving.length > 1) {
          for (const [peerKey, peerDomain] of domains.entries()) {
            if (peerKey === key) continue;
            const peerConstraints = this.constraintsByKey.get(peerKey as string);
            if (!peerConstraints) continue;
            // Check if any peer constraint shares keys with this factor.
            let shares = false;
            for (const ci of peerConstraints) {
              if (keyConstraints.has(ci)) { shares = true; break; }
            }
            if (!shares) continue;

            // Union across all candidates of `key`: a peer value is viable
            // if it works with at least one candidate.
            const peerViable = new Set<number>();
            for (const serial of surviving) {
              tempRow.set(key, serial);
              for (const ps of peerDomain) {
                if (peerViable.has(ps)) continue;
                tempRow.set(peerKey, ps);
                const obj = this.toObject(tempRow);
                let ok = true;
                for (const ci of peerConstraints) {
                  if (this.passedIndexes.has(ci)) continue;
                  if (evaluate(this.constraints[ci].condition, obj, this.comparer) === false) {
                    ok = false;
                    break;
                  }
                }
                if (ok) peerViable.add(ps);
              }
              tempRow.delete(peerKey);
            }
            tempRow.delete(key);

            const narrowed = peerDomain.filter(v => peerViable.has(v));
            if (narrowed.length === 0) return false;
            if (narrowed.length < peerDomain.length) {
              domains.set(peerKey, narrowed);
              changed = true;
              if (narrowed.length === 1) {
                tempRow.set(peerKey, narrowed[0]);
                domains.delete(peerKey);
                const nc = this.constraintsByKey.get(peerKey as string);
                if (nc) { for (const ci of nc) relevantSet.add(ci); }
              }
            }
          }
        }
      }
    }
    return true;
  }

  public isFilled(row: Row): boolean {
    return row.size === this.factorLength;
  }

  private toMap(row: Row): Map<ScalarType, number[]> {
    const result: Map<ScalarType, number[]> = new Map();
    for (let [key, serial] of row.entries()) {
      const index = this.indices.get(serial) as number;
      const first = this.indices.get((this.serials.get(key) as PairType)[0]);
      // @ts-ignore TS7015
      result.set(key, this.factors[key][index - first]);
    }
    return result;
  }

  private toObject(row: Row) {
    const obj: DictType = {};
    for (let [key, value] of this.toMap(row).entries()) {
      obj[key] = value;
    }
    return obj as SuggestRowType<T>;
  }

  private reset() {
    this.row = new Row([]);
    this.passedIndexes.clear();
  }

  private restore() {
    const row = this.row;
    this.row = new Row([]);
    this.passedIndexes.clear();
    if (this.factorIsArray) {
      const map = this.toMap(row);
      return getItems(map)
        .sort((a, b) => (a[0] > b[0] ? 1 : -1))
        .map(([_, v]) => v);
    }
    return this.toObject(row);
  }

  /**
   * Fill the remaining unfilled factors of `this.row` and check constraints.
   * Uses depth-first backtracking: each unfilled factor tries its values in
   * order (weight-sorted on the first pass). When a value causes a
   * constraint to evaluate to `false` (via three-valued `storable`), the
   * next candidate is tried; if all candidates are exhausted, the previous
   * factor is backtracked.
   *
   * Returns `true` when a valid completion is found (the row is updated in
   * place), or `false` when no valid completion exists.
   */
  /**
   * Result of close(): `true` = valid completion found; `false` = failed;
   * or an object with the conflict keys from the first failing constraint.
   */
  private close(): true | { conflictKeys: ReadonlySet<string> | null } {
    const kvs = getItems(this.serials);

    const unfilled: { key: ScalarType; values: PairType }[] = [];
    for (const [k, vs] of kvs) {
      if (!this.row.has(k)) {
        unfilled.push({ key: k, values: this.orderByWeight(k, vs) });
      }
    }

    if (unfilled.length === 0) {
      this.passedIndexes.clear();
      this.markPassedConstraints(this.row);
      if (this.isComplete) return true;
      return { conflictKeys: this.findConflictKeys() };
    }

    const trier = new Row([...this.row.entries()]);
    const depth = unfilled.length;
    const indices = new Array<number>(depth).fill(0);
    let d = 0;
    let lastConflictKeys: ReadonlySet<string> | null = null;

    trier.set(unfilled[0].key, unfilled[0].values[0]);

    while (true) {
      const entry = unfilled[d];
      const v = entry.values[indices[d]];
      const cand: CandidateType = [[entry.key, v]];
      const s = this.storable(cand, trier);

      if (s !== null) {
        if (d === depth - 1) {
          this.row.copy(trier);
          this.passedIndexes.clear();
          this.markPassedConstraints(this.row);
          if (this.isComplete) return true;
          // Record which constraint failed for reporting to the caller.
          lastConflictKeys = this.findConflictKeys();
        } else {
          d++;
          indices[d] = 0;
          trier.set(unfilled[d].key, unfilled[d].values[0]);
          continue;
        }
      }

      while (true) {
        indices[d]++;
        if (indices[d] < unfilled[d].values.length) {
          trier.set(unfilled[d].key, unfilled[d].values[indices[d]]);
          break;
        }
        trier.delete(unfilled[d].key);
        d--;
        if (d < 0) {
          this.reset();
          return { conflictKeys: lastConflictKeys };
        }
      }
    }
  }

  get strength() {
    return this.options.strength || 2;
  }

  get allStrengths(): number[] {
    const strengths = new Set([this.strength]);
    for (const sub of this.options.subModels ?? []) {
      strengths.add(sub.strength);
    }
    return [...strengths];
  }

  private valueToSerial(key: ScalarType, value: any): number | null {
    const factorValues = (this.factors as any)[key];
    if (!factorValues) return null;
    const idx = factorValues.indexOf(value);
    if (idx === -1) return null;
    const serialList = this.serials.get(key);
    if (!serialList) return null;
    return serialList[idx];
  }

  private applyPreset(preset: any): boolean {
    const entries: [ScalarType, number][] = [];
    for (const [key, value] of getItems(preset)) {
      const serial = this.valueToSerial(key, value);
      if (serial === null) return false;
      entries.push([key, serial]);
    }
    if (entries.length === 0) return false;
    for (const [key, serial] of entries) {
      this.row.set(key, serial);
    }
    return true;
  }

  private orderByWeight(key: ScalarType, serials: PairType): PairType {
    const weights = this.options.weights;
    if (!weights) return serials;
    const factorWeights = weights[key as string];
    if (!factorWeights) return serials;
    const first = this.indices.get(serials[0]) as number;
    return [...serials].sort((a, b) => {
      const wa = factorWeights[(this.indices.get(a) as number) - first] ?? 1;
      const wb = factorWeights[(this.indices.get(b) as number) - first] ?? 1;
      return wb - wa;
    });
  }

  get isComplete() {
    if (!this.isFilled(this.row)) return false;
    if (this.constraints.length === 0) return true;
    const obj = this.toObject(this.row);
    for (let i = 0; i < this.constraints.length; i++) {
      if (this.passedIndexes.has(i)) continue;
      const result = evaluate(this.constraints[i].condition, obj, this.comparer);
      // false = definitively violated. null (unknown) means a referenced key
      // doesn't exist in the factors — treat as satisfied (constraint is
      // vacuously true when it can never be evaluated).
      if (result === false) return false;
    }
    return true;
  }

  /**
   * Find the keys of the first failing constraint on the current row.
   * Returns the set of factor keys that participate in the conflict,
   * or null if the row passes all constraints.
   */
  private findConflictKeys(): ReadonlySet<string> | null {
    if (!this.isFilled(this.row)) return null;
    const obj = this.toObject(this.row);
    for (let i = 0; i < this.constraints.length; i++) {
      if (this.passedIndexes.has(i)) continue;
      if (evaluate(this.constraints[i].condition, obj, this.comparer) === false) {
        return this.constraints[i].keys;
      }
    }
    return null;
  }

  /**
   * Analyse remaining incomplete pairs and identify which constraint(s)
   * make each pair infeasible. Used to build a diagnostic when throwing
   * NeverMatch.
   */
  private diagnoseUncoveredPairs(): UncoveredPair[] {
    const result: UncoveredPair[] = [];
    for (const [, pair] of this.incomplete.entries()) {
      const cand = this.getCandidate(pair);
      // Convert serial-based candidate to human-readable key→value.
      const pairObj: Record<string, any> = {};
      for (const [key, serial] of cand) {
        const idx = this.indices.get(serial) as number;
        const serials = this.serials.get(key) as PairType;
        const first = this.indices.get(serials[0]) as number;
        // @ts-ignore TS7015
        pairObj[key as string] = this.factors[key][idx - first];
      }

      // Find which constraints fail or are unsatisfiable via forward check.
      const snapshot = new Row(cand);
      const snapshotObj = this.toObject(snapshot);
      const failingConstraints: number[] = [];
      for (let i = 0; i < this.constraints.length; i++) {
        const r = evaluate(this.constraints[i].condition, snapshotObj, this.comparer);
        if (r === false) {
          failingConstraints.push(i);
        }
      }
      // If no direct failure, the pair fails due to forward-check chain.
      // Report all constraints that share keys with the pair.
      if (failingConstraints.length === 0) {
        const pairKeys = new Set(Object.keys(pairObj));
        for (let i = 0; i < this.constraints.length; i++) {
          for (const k of this.constraints[i].keys) {
            if (pairKeys.has(k)) {
              failingConstraints.push(i);
              break;
            }
          }
        }
      }
      result.push({ pair: pairObj, constraints: failingConstraints });
    }
    return result;
  }

  /**
   * Record which factor values were filled by close() (completion) rather
   * than by greedy. `greedyKeys` are the keys that were already in the row
   * before close() ran.
   */
  private recordCompletions(row: Row, greedyKeys: Set<ScalarType>) {
    for (const [key, serial] of row.entries()) {
      if (greedyKeys.has(key)) continue;
      const idx = this.indices.get(serial) as number;
      const serials = this.serials.get(key) as PairType;
      const first = this.indices.get(serials[0]) as number;
      // @ts-ignore TS7015
      const value = String(this.factors[key][idx - first]);
      const keyStr = String(key);
      if (!this._completions[keyStr]) {
        this._completions[keyStr] = {};
      }
      this._completions[keyStr][value] = (this._completions[keyStr][value] ?? 0) + 1;
    }
  }


  get progress() {
    return this.stats.progress;
  }

  public make<T extends FactorsType>(): SuggestRowType<T>[] {
    return [...this.makeAsync<T>()];
  }

  public *makeAsync<T extends FactorsType>() {
    const {criterion = greedy, presets = []} = this.options;

    for (const preset of presets) {
      if (!this.applyPreset(preset)) continue;
      const presetKeys = new Set(this.row.keys());
      try {
        const result = this.close();
        if (result === true) {
          this.recordCompletions(this.row, presetKeys);
          this.consumePairs(this.row);
          this._rowCount++;
          yield this.restore() as SuggestRowType<T>;
        }
      } catch (e) {
        if (e instanceof NeverMatch) {
          this.row = new Row([]);
          this.passedIndexes.clear();
        } else {
          throw e;
        }
      }
    }

    let consecutiveFailures = 0;
    while (this.incomplete.size) {
      // Phase 1: greedy selects pairs and setPair validates via snapshot.
      // Pairs that fail are added to row.invalidPairs and skipped.
      for (let pair of criterion(this)) {
        if (this.isFilled(this.row)) break;
        const pk = unique(pair);
        if (this.row.invalidPairs.has(pk)) continue;
        if (!this.setPair(pair)) {
          this.row.invalidPairs.add(pk);
        }
      }

      // Remember which keys greedy filled, so we can identify completions.
      const greedyKeys = new Set(this.row.keys());

      // Phase 2: If no valid pairs remain (incomplete - invalidPairs is
      // empty), or the row is filled, proceed to close (completion).
      try {
        const result = this.close();
        if (result === true) {
          this.recordCompletions(this.row, greedyKeys);
          this.consumePairs(this.row);
          this._rowCount++;
          yield this.restore() as SuggestRowType<T>;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          if (consecutiveFailures > this.incomplete.size) {
            break;
          }
          // Carry the invalidPairs from this failed row into the next
          // attempt so greedy avoids the same pairs.
          const failedPairs = this.row.invalidPairs;
          // Also mark pairs that were in the row (greedy selected them
          // but close couldn't complete them).
          for (const s of this.allStrengths) {
            for (let p of combinations([...this.row.values()], s)) {
              failedPairs.add(unique(p));
            }
          }
          this.reset();
          this.rejected.clear();
          // Transfer to the new row.
          for (const pk of failedPairs) {
            this.row.invalidPairs.add(pk);
          }
        }
      } catch (e) {
        if (e instanceof NeverMatch) {
          this.reset();
          this.rejected.clear();
          continue;
        }
        throw e;
      }
    }

    // Phase 3 (rescue): greedy couldn't cover remaining pairs. Try each
    // one individually — set just that pair, then close(). This trades
    // row-efficiency for coverage completeness.
    for (const [, pair] of [...this.incomplete.entries()]) {
      this.reset();
      if (!this.setPair(pair)) continue;
      const rescueKeys = new Set(this.row.keys());
      const result = this.close();
      if (result === true) {
        this.recordCompletions(this.row, rescueKeys);
        this.consumePairs(this.row);
        this._rowCount++;
        yield this.restore() as SuggestRowType<T>;
      } else {
        this.reset();
      }
    }

    if (this.incomplete.size > 0) {
      this._uncoveredPairs = this.diagnoseUncoveredPairs();
    }

  }
}
