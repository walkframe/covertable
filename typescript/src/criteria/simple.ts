import {CriterionArgsType, IncompletedType, PairType} from '../types';
import {getCandidate} from '../utils';

export default function* (
  incompleted: IncompletedType,
  criterionArgs: CriterionArgsType,
): Generator<PairType> {
  const {row, parents} = criterionArgs;
  for (let pair of incompleted.values()) {
    const storable = row.storable(getCandidate(pair, parents));
    if (storable === null || storable === 0) {
      continue;
    }
    yield pair;
  }
};
