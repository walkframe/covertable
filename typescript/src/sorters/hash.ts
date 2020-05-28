import {md5} from '../utils'
import {Scalar, MD5CacheType} from '../types'

interface sortArgsType {
  seed: Scalar,
  md5Cache: MD5CacheType,
}

export default function (
  incompleted: Map<string, number[]>,
  sortArgs: sortArgsType,
): number[][] {
  const {seed, md5Cache} = sortArgs;
  const comparer = (a: [string, number[]], b: [string, number[]]) => {
    const aKey = `${a[0]} ${seed}`;
    let aValue = md5Cache.get(aKey);
    if (typeof aValue === 'undefined') {
      aValue = md5(aKey);
      // @ts-ignore 2345
      md5Cache.set(aKey, aValue);
    }
    const bKey = `${b[0]} ${seed}`;
    let bValue = md5Cache.get(aKey);
    if (typeof bValue === 'undefined') {
      bValue = md5(bKey);
      // @ts-ignore 2345
      md5Cache.set(bKey, bValue);
    }
    // @ts-ignore 2532
    return aValue > bValue ? 1 : -1;
  }
  const pairs: number[][] = [];
  for (let [_, pair] of [... incompleted.entries()].sort(comparer)) {
    pairs.push(pair)
  }
  return pairs
}
