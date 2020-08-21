import {md5} from '../utils';
import {
  PairType,
  SortArgsType,
} from '../types';

export default function (
  pairs: PairType[],
  sortArgs: SortArgsType,
): PairType[] {
  const {seed} = sortArgs;
  const comparer = (a: PairType, b: PairType) => {
    const aKey = `${a} ${seed}`;
    const bKey = `${b} ${seed}`;
    return md5(aKey) > md5(bKey) ? 1 : -1;
  }
  return pairs.sort(comparer);
};
