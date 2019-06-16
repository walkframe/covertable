import {md5} from '../utils'

interface sortArgsType {
  seed: any,
}

export default function* (
  incompleted: Map<string, number[]>,
  sortArgs: sortArgsType
) {
  const seed = sortArgs.seed || ''
  const comparer = (a: [string, number[]], b: [string, number[]]) => {
    return md5(`${a[0]} ${seed}`) > md5(`${b[0]} ${seed}`) ? 1 : -1
  }

  for (let [_, pair] of [... incompleted.entries()].sort(comparer)) {
    yield pair
  }
}
