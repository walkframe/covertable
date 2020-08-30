import * as sorters from './sorters/index';
import * as criteria from './criteria/index';
import * as exceptions from './exceptions';
import {range, product, combinations, copy, len, getItems, getCandidate, ascOrder, primeGenerator, unique} from './utils';
import {
  IndicesType,
  FactorsType, 
  SerialsType, 
  MappingTypes,
  Scalar, 
  Dict, 
  IncompletedType, 
  ParentsType,
  CandidateType,
  RowType,
  OptionsType,
  FilterType,
  PairType,
  SorterType,
} from './types';

const serialize = (factors: FactorsType): MappingTypes => {
  let origin = 0;
  const serials: SerialsType = new Map();
  const indices: IndicesType = new Map();
  const parents: ParentsType = new Map();

  const primer = primeGenerator();
  getItems(factors).map(([subscript, factorList]) => {
    const length = len(factorList);
    const serialList: number[] = [];
    range(origin, origin + length).map((index) => {
      const serial = primer.next().value;
      serialList.push(serial);
      parents.set(serial, subscript);
      indices.set(serial, index)
    })
    serials.set(subscript, serialList);
    origin += length;
  })
  return {serials, parents, indices};
};

const makeIncompleted = (
  mappings: MappingTypes, 
  length: number, 
  sorter: SorterType, 
  seed: Scalar,
): IncompletedType => {
  const {serials, indices} = mappings;
  const pairs: PairType[] = [];
  const allKeys = getItems(serials).map(([k, _]) => k);
  for (let keys of combinations(allKeys, length)) {
    const comb = range(0, length).map(i => serials.get(keys[i]) as PairType);
    for (let pair of product(... comb)) {
      pair = pair.sort(ascOrder);
      pairs.push(pair);
    }
  }
  const incompleted: IncompletedType = new Map();
  for (let pair of sorter(pairs, {seed, indices})) {
    incompleted.set(unique(pair), pair);
  }
  return incompleted;
};

class Row extends Map<Scalar, number> implements RowType {
  // index: number
  private length: number;
  public isArray: Boolean;
  constructor (
    row: CandidateType,
    private mappings: MappingTypes,
    private factors: FactorsType,
    public preFilter?: FilterType,
  ) {
    super();
    for (let [k, v] of row) {
      this.set(k, v);
    }
    this.length= len(factors);
    this.isArray = factors instanceof Array;
  }

  filled (): boolean {
    return this.size === this.length;
  }

  New (row?: CandidateType) {
    return new Row(row || [], this.mappings, this.factors, this.preFilter);
  }

  storable (candidate: CandidateType) {
    let num = 0;
    for (let [key, el] of candidate) {
      let existing: number | undefined = this.get(key);
      if (typeof existing === 'undefined') {
        num++;
      } else if (existing != el) {
        return null;
      }
    }
    if (!this.preFilter) {
      return num;
    }
    const candidates: CandidateType = [... this.entries()].concat(candidate);
    const nxt: Row = this.New(candidates);
    if (!this.preFilter(nxt.toObject())) {
      return null;
    }
    return num;
  }

  toMap (): Map<Scalar, number[]> {
    const result: Map<Scalar, number[]> = new Map();
    const {indices, serials} = this.mappings;
    for (let [key, serial] of this.entries()) {
      const index = indices.get(serial) as number;
      const first = indices.get((serials.get(key) as PairType)[0]);
      // @ts-ignore TS7015
      result.set(key, this.factors[key][index - first]);
    }
    return result;
  }

  toObject () {
    const obj: Dict = {};
    for (let [key, value] of this.toMap().entries()) {
      obj[key] = value;
    }
    return obj;
  }

  restore() {
    if (this.isArray) {
      const map = this.toMap();
      return getItems(map).sort().map(([_, v]) => v);
    }
    return this.toObject();
  }

  complement (): Row {
    getItems(this.mappings.serials).map(([k, vs]) => {
      for (let v of vs) {
        if (this.storable([[k, v]])) {
          this.set(k, v);
          break;
        }
      }
    })
    if (!this.filled()) {
      throw new exceptions.InvalidCondition();
    }
    return this;
  }
};

const makeAsync = function* (factors: FactorsType, options: OptionsType = {}) {
  let {length=2, sorter=sorters.hash, criterion=criteria.greedy, seed='', tolerance=0} = options;

  const {preFilter, postFilter} = options;
  const mappings = serialize(factors);
  const {parents} = mappings;
  const incompleted = makeIncompleted(mappings, length, sorter, seed); // {"1,2": [1,2], "3,4": [3,4]}

  let row: Row = new Row([], mappings, factors, preFilter);

  for (let [pairKey, pair] of incompleted.entries()) {
    if (!row.storable(getCandidate(pair, parents))) {
      incompleted.delete(pairKey);
    }
  }
  while (incompleted.size) {
    if (row.filled()) {
      if (!postFilter || postFilter(row.toObject())) {
        yield row.restore();
      }
      row = row.New([]);
    }
    let finished = true;
    for (let pair of criterion(incompleted, {row, parents, length, tolerance})) {
      if (row.filled()) {
        finished = false;
        break;
      }

      for (let [key, value] of getCandidate(pair, parents)) {
        row.set(key, value);
      }
      
      for (let p of combinations([... row.values()], length)) {
        incompleted.delete(unique(p));
      }
    }
    if (finished && !row.filled()) {
      row.complement();
    }
  }
  if (row.size) {
    row = row.complement();
    if (!postFilter || postFilter(row.toObject())) {
      yield row.restore();
    }
  }
};

const make = (factors: FactorsType, options: OptionsType = {}) => {
  return [... makeAsync(factors, options)];
}

export {make as default, makeAsync, sorters, criteria};
