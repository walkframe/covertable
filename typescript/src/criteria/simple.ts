import {CriterionArgsType, PairType} from '../types';
import {getCandidate} from '../utils';


export default function* (
  sortedIncompleted: PairType[],
  criterionArgs: CriterionArgsType,
) {
  const {row, parents} = criterionArgs;
  for (let pair of sortedIncompleted) {
    const storable = row.storable(getCandidate(pair, parents));
    if (storable === null || storable === 0) {
      continue;
    }
    yield pair;
  }
};
