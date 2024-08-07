import type {PairType, SortArgsType} from '../types';

const comparer = (a: any, b: any) => {
  return Math.random() > 0.5 ? 1 : -1;
};

export default function (
  pairs: PairType[],
  sortArgs: SortArgsType,
) {
  return pairs.sort(comparer);
};
