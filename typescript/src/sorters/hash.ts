import {fnv1a32} from '../lib';
import type {
  PairType,
  SortArgsType,
} from '../types';

export default function (
  pairs: PairType[],
  sortArgs: SortArgsType,
): PairType[] {
  const {salt, indices} = sortArgs;
  const comparer = (a: PairType, b: PairType) => {
    const aKey = `${a.map((n) => indices.get(n) as number)} ${salt}`;
    const bKey = `${b.map((n) => indices.get(n) as number)} ${salt}`;
    return fnv1a32(aKey) > fnv1a32(bKey) ? 1 : -1;
  }
  return pairs.sort(comparer);
};
