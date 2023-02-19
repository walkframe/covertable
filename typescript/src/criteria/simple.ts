import {CriterionArgsType, IncompleteType, PairType} from '../types';
import {getCandidate} from '../utils';

export default function* (
  incomplete: IncompleteType,
  criterionArgs: CriterionArgsType,
): Generator<PairType> {
  const {row, parents} = criterionArgs;
  for (let pair of incomplete.values()) {
    const storable = row.storable(getCandidate(pair, parents));
    if (storable === null || storable === 0) {
      continue;
    }
    yield pair;
  }
};
