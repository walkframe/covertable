import {CriterionArgsType, IncompletedType, PairType} from '../types';
import {getCandidate, combinations, ascOrder} from '../utils';

const getNumRemovablePairs = (indexes: Set<number>, incompleted: IncompletedType, length: number) => {
  let num = 0;
  const removingKeys = combinations([... indexes], length);
  for (let vs of removingKeys) {
    const key = vs.sort(ascOrder).toString();
    if (incompleted.has(key)) {
      num++;
    }
  }
  return num;
};


export default function* (
  sortedIncompleted: PairType[],
  criterionArgs: CriterionArgsType,
) {
  let {row, parents, incompleted, length, tolerance} = criterionArgs;
  if (typeof tolerance === 'undefined') {
    tolerance = 0;
  }

  let maxNumPairs: number | null = null;
  let efficientPair: PairType | null = null;

  while (true) {
    maxNumPairs = null;
    efficientPair = null;

    for (let pair of sortedIncompleted) {
      const rowSize = row.size;
      if (rowSize === 0) {
        yield pair;
        continue;
      }
      if (row.filled()) {
        break;
      }

      const storable = row.storable(getCandidate(pair, parents));
      if (storable === null) {
        continue;
      }

      if (storable === 0) {
        incompleted.delete(pair.sort(ascOrder).toString());
        continue;
      }
      
      const numPairs = getNumRemovablePairs(
        new Set([... row.values(), ...pair]), incompleted, length
      );

      if (numPairs + tolerance > rowSize * storable) {
        efficientPair = pair;
        break;
      }
      if (maxNumPairs === null || maxNumPairs < numPairs) {
        maxNumPairs = numPairs;
        efficientPair = pair;
      }
    }
    if (efficientPair === null) {
      break;
    }
    yield efficientPair;
  }
};
