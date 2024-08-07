import {md5} from '../lib';
import {
  PairType,
  SortArgsType,
} from '../types';

export default function (
  pairs: PairType[],
  sortArgs: SortArgsType,
): PairType[] {
  const {seed, indices} = sortArgs;
  const comparer = (a: PairType, b: PairType) => {
    const aKey = `${a.map((n) => indices.get(n) as number)} ${seed}`;
    const bKey = `${b.map((n) => indices.get(n) as number)} ${seed}`;
    return md5(aKey) > md5(bKey) ? 1 : -1;
  }
  return pairs.sort(comparer);
};
