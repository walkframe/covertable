import * as sorters from './sorters/index'
import * as criteria from './criteria/index'
import * as exceptions from './exceptions'
import {range, product, combinations, copy, len, getItems, getCandidate, ascOrder} from './utils'
import {
  FactorsType, 
  SerialsType, 
  Scalar, 
  Dict, 
  IncompletedType, 
  MD5CacheType, 
  ParentsType, 
  CandidateType,
  RowType,
  OptionsType,
  FilterType,
} from './types'

const convertFactorsToSerials = (factors: FactorsType): [SerialsType, ParentsType] => {
  let origin = 0;
  const serials: SerialsType = copy(factors);
  const parents: Map<number, Scalar> = new Map();
  getItems(factors).map(([subscript, factorList]) => {
    const length = len(factorList);
    const serialList: number[] = [];
    range(origin, origin + length).map((serial) => {
      serialList.push(serial);
      parents.set(serial, subscript);
    })
    serials[subscript] = serialList;
    origin += length;
  })
  return [serials, parents];
}

const makeIncompleted = (serials: SerialsType, length: number): IncompletedType => {
  const incompleted: IncompletedType = new Map();
  const allKeys = getItems(serials).map(([k, _]) => k);
  for (let keys of combinations(allKeys, length)) {
    const comb = range(0, length).map(i => serials[keys[i]]);
    for (let pair of product(... comb)) {
      pair = pair.sort(ascOrder);
      incompleted.set(pair.toString(), pair);
    }
  }
  return incompleted;
}

class Row extends Map<Scalar, number> implements RowType {
  // index: number
  private length: number;
  public isArray: Boolean;
  constructor (
    row: CandidateType, 
    private factors: FactorsType,
    private serials: SerialsType,
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
    return new Row(row || [], this.factors, this.serials, this.preFilter);
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

  toObject () {
    const obj: Dict = {};
    for (let [key, value] of this.restore().entries()) {
      obj[key] = value;
    }
    return obj;
  }

  complement (): Row {
    getItems(this.serials).map(([k, vs]) => {
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

  restore (): Map<Scalar, number[]> {
    const result: Map<Scalar, number[]> = new Map();
    for (let [key, index] of this.entries()) {
      // @ts-ignore TS7015
      result.set(key, this.factors[key][index - this.serials[key][0]]);
    }
    return result;
  }
}

const make = (factors: FactorsType, options: OptionsType = {}) => {
  let {length, sorter, criterion, seed, tolerance} = options;
  if (!length) {
    length = 2;
  }
  if (!sorter) {
    sorter = sorters.hash;
  }
  if (!criterion) {
    criterion = criteria.greedy;
  }
  if (typeof seed === 'undefined') {
    seed = '';
  }

  const {preFilter, postFilter} = options;
  const [indexes, parents] = convertFactorsToSerials(factors);
  const incompleted = makeIncompleted(indexes, length); // {"1,2": [1,2], "3,4": [3,4]}
  const md5Cache: MD5CacheType = new Map();

  const rows: Row[] = [];
  let row: Row = new Row([], factors, indexes, preFilter);

  for (let [pairStr, pair] of incompleted.entries()) {
    if (!row.storable(getCandidate(pair, parents))) {
      incompleted.delete(pairStr);
    }
  }
  while (incompleted.size) {
    if (row.filled()) {
      rows.push(row);
      row = row.New([]);
    }
    let finished = true;

    const sortedIncompleted = sorter(incompleted, {row, parents, length, seed, md5Cache});
    for (let pair of criterion(sortedIncompleted, {row, parents, length, incompleted, tolerance})) {
      if (row.filled()) {
        finished = false;
        break;
      }

      for (let [key, value] of getCandidate(pair, parents)) {
        row.set(key, value);
      }
      
      for (let vs of combinations([... row.values()], length)) {
        incompleted.delete(vs.sort(ascOrder).toString());
      }
    }
    if (finished && !row.filled()) {
      row.complement();
    }
  }
  if (row.size) {
    rows.push(row.complement());
  }
  const result: any[] = [];
  for (let row of rows) {
    const restored = row.restore();
    const restoredObject = row.toObject();
    if (postFilter && !postFilter(restoredObject)) {
      continue;
    }
    if (row.isArray) {
      result.push(getItems(restored).sort().map(([_, v]) => v));
    } else {
      result.push(restoredObject);
    }
  }
  return result;
}

export {make as default, sorters, criteria};
