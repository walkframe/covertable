
// @ts-ignore 2307
export {hex as md5} from 'js-md5'
import {FactorsType, Scalar, ParentsType, CandidateType} from './types'

export const all = (values: any[]) => {
  for (let value of values) {
    if (!value) {
      return false
    }
  }
  return true
}

export const zip = (... lists: [... any[]]): [... any[]] => {
  const length = lists[0].length
  return range(0, length).map(i => lists.map(l => l[i]))
}

export const copy = (obj: any[] | object) => {
  if (Array.isArray(obj)) {
    return [... obj]
  }
  return {... obj}
}

export const len = (obj: any[] | object): number => {
  if (Array.isArray(obj)) {
    return obj.length
  }
  return Object.keys(obj).length
}

export const getItems = (container: FactorsType | Map<Scalar, any[]>): [Scalar, any[]][] => {
  if (Array.isArray(container)) {
    return container.map((v, i) => [i, v])
  }
  if (container instanceof Map) {
    return [... container.entries()]
  }
  return [... Object.entries(container)];
}

export const range = (start: number, stop: number, step: number=1) => {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/from#Sequence_generator_(range)
  return Array.from({ length: (stop - start - 1) / step + 1}, (_, i) => start + (i * step))
}

export const combinations = (list: Iterable<any>, length: number): number[][] => {
  const pairs: Map<string, number[]> = new Map()
  const set = (remains: any[], pair: any[]) => {
    if (pair.length == length) {
      const key = pair.sort().toString()
      pairs.set(key, pair)
      return
    }
    for (let i of remains) {
      if (pair.length < length) {
        set(remains.filter(j => j !== i), pair.concat(i))
      }
    }
  }
  set([... list], [])
  return [... pairs.values()]
}

export const product = (... list: number[][]): number[][] => {
  const pairs: number[][] = []
  const set = (pair: number[], index: number) => {
    if (pair.length === list.length) {
      pairs.push(pair)
      return
    }
    for (let i of list[index]) {
      set(pair.concat(i), index + 1)
    }
  }
  set([], 0)
  return pairs
}

export const getCandidate = (pair: number[], parents: ParentsType): CandidateType => {
  const keys: Scalar[] = pair.map(p => parents.get(p) || 0);
  return zip(keys, pair);
}

export const ascOrder = (a:number, b:number) => a > b ? 1 : -1;
