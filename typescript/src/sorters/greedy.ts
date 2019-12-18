import {zip, combinations, md5} from '../utils'
import {Scalar, IncompletedType} from '../types'


interface sortArgsType {
  row: any,
  parents: Map<number, Scalar>,
  length: number,
  seed: any,
}

const ascendant = (a: number, b: number) => a > b ? 1 : -1

const getNumRemovablePairs = (
  indexes: number[],
  incompletedKeys: Set<string>, length: number
) => {
  let num = 0
  for (let vs of combinations(indexes, length)) {
    const key = vs.sort(ascendant).toString()
    if (incompletedKeys.has(key)) {
      num ++
    }
  }
  return num
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
    let maxNumPairs: number | null = null
    let efficientPair: number[] | null = null
    for (let [_, pair] of [... incompleted].sort(comparer)) {
      const keys = pair.map(p => parents.get(p) || 0)
      const candidate = zip(keys, pair)
      if (!row.storable(candidate)) {
        continue
      }
      const incompletedKeys = new Set(incompleted.keys())
      const numPairs = getNumRemovablePairs([... row.values(), ...pair], incompletedKeys, length)
      if (maxNumPairs === null || maxNumPairs < numPairs) {
        maxNumPairs = numPairs
        efficientPair = pair
      }
    }
    if (efficientPair === null) {
      break
    }
    yield efficientPair
  }
}
