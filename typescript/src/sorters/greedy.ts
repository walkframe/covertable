import {zip, combinations, md5} from '../utils'
import {Scala, IncompletedType} from '../types'


interface sortArgsType {
  row: any,
  parents: Map<number, Scala>,
  length: number,
  seed: any,
}

const ascendant = (a: number, b: number) => a > b ? 1 : -1

const getNumRemaining = (
  indexes: number[],
  incompletedKeys: Set<string>, length: number
) => {
  for (let vs of combinations(indexes, length)) {
    incompletedKeys.delete(vs.sort(ascendant).toString())
  }
  return incompletedKeys.size
}


export default function* (
  incompleted: IncompletedType,
  sortArgs: sortArgsType
) {
  const {row, parents, length} = sortArgs
  const seed = sortArgs.seed || ''
  const comparer = (a: [string, number[]], b: [string, number[]]) => {
    return md5(`${a[0]} ${seed}`) > md5(`${b[0]} ${seed}`) ? 1 : -1
  }

  while (true) {
    let minRemaining: number | null = null
    let efficientPair: number[] | null = null
    for (let [_, pair] of [... incompleted].sort(comparer)) {
      const keys = pair.map(p => parents.get(p) || 0)
      const candidate = zip(keys, pair)
      if (!row.storable(candidate)) {
        continue
      }
      const incompletedKeys = new Set(incompleted.keys())
      const remaining = getNumRemaining([... row.values(), ...pair], incompletedKeys, length)
      if (minRemaining === null || remaining < minRemaining) {
        minRemaining = remaining
        efficientPair = pair
      }
    }
    if (efficientPair === null) {
      break
    }
    yield efficientPair
  }
}
