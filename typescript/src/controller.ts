
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
  proxyHandler,
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
} from "./types";
import { NeverMatch, NotReady } from "./exceptions";

export class Row extends Map<ScalarType, number> implements RowType {
  // index: number
  public consumed: PairByKeyType = new Map();

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

export class Controller<T extends FactorsType> {
  public factorLength: number;
  public factorIsArray: Boolean;

  private serials: SerialsType = new Map();
  private parents: ParentsType = new Map();
  private indices: IndicesType = new Map();
  public incomplete: PairByKeyType = new Map();
  
  private rejected: Set<ScalarType> = new Set();
  public row: Row;

  constructor(public factors: FactorsType, public options: OptionsType<T>) {
    this.serialize(factors);
    this.setIncomplete();
    this.row = new Row([]);
    this.factorLength = len(factors);
    this.factorIsArray = factors instanceof Array;

    // Delete initial pairs that do not satisfy preFilter
    for (const [pairKey, pair] of this.incomplete.entries()) {
      const cand = this.getCandidate(pair);
      const storable = this.storable(cand);
      if (storable == null) {
        this.incomplete.delete(pairKey);
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
    const { sorter = hash, seed = "" } = this.options;
    const pairs: PairType[] = [];
    const allKeys = getItems(this.serials).map(([k, _]) => k);
    for (const keys of combinations(allKeys, this.pairwiseCount)) {
      const comb = range(0, this.pairwiseCount).map((i) => this.serials.get(keys[i]) as PairType);
      for (let pair of product(...comb)) {
        pair = pair.sort(ascOrder);
        pairs.push(pair);
      }
    }
    for (let pair of sorter(pairs, { seed, indices: this.indices })) {
      this.incomplete.set(unique(pair), pair);
    }
  }

  setPair(pair: PairType) {
    for (let [key, value] of this.getCandidate(pair)) {
      this.row.set(key, value);
    }
    //this.consume(pair);
    for (let p of combinations([...this.row.values()], this.pairwiseCount)) {
      this.consume(p);
    }
  }

  consume(pair: PairType) {
    const pairKey = unique(pair);
    const deleted = this.incomplete.delete(pairKey);
    if (deleted) {
      this.row.consumed.set(pairKey, pair);
    }
  }

  getCandidate(pair: PairType) {
    return getCandidate(pair, this.parents);
  }

  // Returns a negative value if it is unknown if it can be stored.
  storable(candidate: CandidateType) {
    let num = 0;
    for (let [key, el] of candidate) {
      let existing: number | undefined = this.row.get(key);
      if (typeof existing === "undefined") {
        num++;
      } else if (existing != el) {
        return null;
      }
    }
    if (!this.options.preFilter) {
      return num;
    }
    const candidates: CandidateType = [...this.row.entries()].concat(candidate);
    const nxt = new Row(candidates);
    const proxy = this.toProxy(nxt);
    try {
      const ok = this.options.preFilter(proxy);
      if (!ok) {
        return null;
      }
    } catch (e) {
      if (e instanceof NotReady) {
        return -num;
      }
      throw e
    }
    return num;
  }

  isFilled(row: Row): boolean {
    return row.size === this.factorLength;
  }

  toMap(row: Row): Map<ScalarType, number[]> {
    const result: Map<ScalarType, number[]> = new Map();
    for (let [key, serial] of row.entries()) {
      const index = this.indices.get(serial) as number;
      const first = this.indices.get((this.serials.get(key) as PairType)[0]);
      // @ts-ignore TS7015
      result.set(key, this.factors[key][index - first]);
    }
    return result;
  }

  toProxy(row: Row) {
    const obj: DictType = {};
    for (let [key, value] of this.toMap(row).entries()) {
      obj[key] = value;
    }
    return new Proxy(obj, proxyHandler) as SuggestRowType<T>;
  }

  toObject(row: Row) {
    const obj: DictType = {};
    for (let [key, value] of this.toMap(row).entries()) {
      obj[key] = value;
    }
    return obj as SuggestRowType<T>;
  }

  reset() {
    this.row.consumed.forEach((pair, pairKey) => {
      this.incomplete.set(pairKey, pair);
    });
    this.row = new Row([]);
  }

  discard() {
    this.rejected.add(this.row.getPairKey());
    this.row = new Row([]);
  }

  restore() {
    const row = this.row;
    this.row = new Row([]);
    if (this.factorIsArray) {
      const map = this.toMap(row);
      return getItems(map)
        .sort((a, b) => (a[0] > b[0] ? 1 : -1))
        .map(([_, v]) => v);
    }
    return this.toObject(row);
  }

  close() {
    const trier = new Row([...this.row.entries()]);
    const kvs = getItems(this.serials);
    for (let [k, vs] of kvs) {
      for (let v of vs) {
        const pairKey = trier.getPairKey(v);
        if (this.rejected.has(pairKey)) {
          continue;
        }
        const cand: CandidateType = [[k, v]];
        const storable = this.storable(cand);
        if (storable == null) {
          this.rejected.add(pairKey);
          continue;
        }
        trier.set(k, v);
        break;
      }
    }
    this.row.copy(trier);
    if (this.isComplete) {
      return true;
    }
    if (trier.size === 0) {
      return false;
    }
    const pairKey = trier.getPairKey();
    if (this.rejected.has(pairKey)) {
      throw new NeverMatch();
    }
    this.rejected.add(pairKey);
    this.reset();
    return false;
  }

  get pairwiseCount() {
    return this.options.length || 2;
  }

  get isComplete() {
    const filled = this.isFilled(this.row);
    if (!filled) {
      return false;
    }
    const proxy = this.toProxy(this.row);
    try {
      return this.options.preFilter ? this.options.preFilter(proxy) : true;
    } catch (e) {
      if (e instanceof NotReady) {
        return false;
      }
      throw e;
    }
  }
}
