import * as sorters from './sorters/index'
import * as exceptions from './exceptions'
import {zip, range, product, combinations, copy, len, getItems} from './utils'
import {FactorsType, SerialsType, Scalar, Dict, IncompletedType} from './types'

const ascOrder = (a:number, b:number) => a > b ? 1 : -1

const convertFactorsToSerials = (factors: FactorsType): [SerialsType, Map<number, Scalar>] => {
  let origin = 0
  const serials: SerialsType = copy(factors)
  const parents: Map<number, Scalar> = new Map()
  getItems(factors).map(([subscript, factorList]) => {
    const length = len(factorList)
    const serialList: number[] = []
    range(origin, origin + length).map((serial) => {
      serialList.push(serial)
      parents.set(serial, subscript)
    })
    serials[subscript] = serialList
    origin += length
  })
  return [serials, parents]
}

const makeIncompleted = (serials: SerialsType, length: number): IncompletedType => {
  const incompleted: IncompletedType = new Map()
  const allKeys = getItems(serials).map(([k, _]) => k)
  for (let keys of combinations(allKeys, length)) {
    const comb = range(0, length).map(i => serials[keys[i]])
    for (let pair of product(... comb)) {
      pair = pair.sort(ascOrder)
      incompleted.set(pair.toString(), pair)
    }
  }
  return incompleted
}

class Row extends Map implements Map<Scalar, number[]> {
  private length: number
  public isArray: Boolean
  constructor (
    row: number[][], 
    public factors: FactorsType,
    public serials: SerialsType,
    public preFilter?: Function,
  ) {
    super()
    for (let [k, v] of row) {
      this.set(k, v)
    }
    this.length= len(factors)
    this.isArray = factors instanceof Array
  }

  filled (): boolean {
    return this.size === this.length
  }

  New (row?: number[][]) {
    return new Row(row || [], this.factors, this.serials, this.preFilter)
  }

  storable (candidate: [Scalar, number][]) {
    for (let [key, el] of candidate) {
      let existing = this.get(key)
      if (!(existing === undefined || existing === el)) {
        return false
      }
    }
    if (!this.preFilter) {
      return true
    }
    const nxt: Row = this.New([... this.entries()].concat(candidate))
    return this.preFilter(nxt.toObject())
  }

  toObject () {
    const obj: Dict = {}
    for (let [key, value] of this.restore().entries()) {
      obj[key] = value
    }
    return obj
  }

  complement (): Row {
    getItems(this.serials).map(([k, vs]) => {
      for (let v of vs) {
        if (this.storable([[k, v]])) {
          this.set(k, v)
          break
        }
      }
    })
    if (!this.filled()) {
      throw new exceptions.InvalidCondition()
    }
    return this
  }

  restore (): Map<number, number[]> {
    const result: Map<number, number[]> = new Map()
    for (let [key, index] of this.entries()) {
      result.set(key, this.factors[key][index - this.serials[key][0]])
    }
    return result
  }
}

interface makeOptions {
  length?: number,
  sorter?: Function,
  sortArgs?: object,
  preFilter?: Function,
  postFilter?: Function,
}


const make = (factors: FactorsType, options: makeOptions = {}) => {
  let {length, sorter} = options
  if (!length) {
    length = 2
  }
  if (!sorter) {
    sorter = sorters.sequential
  }
  const {sortArgs, preFilter, postFilter} = options
  const [indexes, parents] = convertFactorsToSerials(factors)
  const incompleted = makeIncompleted(indexes, length)

  const getCandidate = (pair: number[]) => {
    const keys: Scalar[] = pair.map(p => parents.get(p) || 0)
    return zip(keys, pair)
  }

  const rows: Row[] = []
  let row: Row = new Row([], factors, indexes, preFilter)

  for (let [pairStr, pair] of incompleted.entries()) {
    if (!row.storable(getCandidate(pair))) {
      incompleted.delete(pairStr)
    }
  }
  while (incompleted.size) {
    if (row.filled()) {
      rows.push(row)
      for (let vs of combinations([... row.values()], length)) {
        incompleted.delete(vs.sort(ascOrder).toString())
      }
      row = row.New([])
    }
    let finished = true
    for (let pair of sorter(incompleted, {... sortArgs, row, parents, length})) {
      if (row.filled()) {
        finished = false
        break
      }
      const candidate: [number, number][] = getCandidate(pair)
      if (!row.storable(candidate)) {
        continue
      }
      for (let [key, value] of candidate) {
        row.set(key, value)
      }
      incompleted.delete(pair.toString())
    }
    if (finished) {
      row.complement()
    }
  }
  if (row.size) {
    rows.push(row.complement())
  }
  const result: any[] = []
  for (let row of rows) {
    const restored = row.restore()
    const restoredObject = row.toObject()
    if (postFilter && !postFilter(restoredObject)) {
      continue
    }
    if (row.isArray) {
      result.push(getItems(restored).sort().map(([_, v]) => v))
    } else {
      result.push(restoredObject)
    }
  }
  return result
}

export {make as default, sorters}
