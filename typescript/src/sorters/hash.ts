import {md5} from '../utils';
import {
  PairType,
  SortArgsType,
} from '../types';

export default function (
  incompleted: Map<string, PairType>,
  sortArgs: SortArgsType,
): PairType[] {
  const {seed, md5Cache, useCache} = sortArgs;
  const comparer = (a: [string, PairType], b: [string, PairType]) => {
    const aKey = `${a[0]} ${seed}`;
    const bKey = `${b[0]} ${seed}`;

    if (!useCache) {
      return md5(aKey) > md5(bKey) ? 1 : -1;
    }

    let aValue = md5Cache.get(aKey);
    if (typeof aValue === 'undefined') {
      aValue = md5(aKey);
      md5Cache.set(aKey, aValue);
    }

    let bValue = md5Cache.get(bKey);
    if (typeof bValue === 'undefined') {
      bValue = md5(bKey);
      md5Cache.set(bKey, bValue);
    }
    return aValue > bValue ? 1 : -1;
  }
  const pairs: PairType[] = [];
  for (let [_, pair] of [... incompleted.entries()].sort(comparer)) {
    pairs.push(pair);
  }
  return pairs;
};
