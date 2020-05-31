import {PairType, SortArgsType} from '../types';

const comparer = (a: any, b: any) => {
  return Math.random() > 0.5 ? 1 : -1;
};

export default function (
  incompleted: Map<string, PairType>,
  sortArgs: SortArgsType,
) {
  return [... incompleted.values()].sort(comparer);
};
