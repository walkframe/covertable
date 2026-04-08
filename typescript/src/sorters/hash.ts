import {fnv1a32} from '../lib';
import type {
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
    return fnv1a32(aKey) > fnv1a32(bKey) ? 1 : -1;
  }
  return pairs.sort(comparer);
};
