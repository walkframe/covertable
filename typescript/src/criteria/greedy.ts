import {CriterionArgsType, IncompletedType, PairType} from '../types';
import {getCandidate, combinations, ascOrder, unique} from '../utils';

const getNumRemovablePairs = (indexes: Set<number>, incompleted: IncompletedType, length: number) => {
  let num = 0;
  const removingKeys = combinations([... indexes], length);
  for (let pair of removingKeys) {
    const key = unique(pair);
    if (incompleted.has(key)) {
      num++;
    }
  }
  return num;
};

export default function* (
  incompleted: IncompletedType,
  criterionArgs: CriterionArgsType,
): Generator<PairType> {
  let {row, parents, length, tolerance} = criterionArgs;

  while (true) {
    let maxNumPairs: number | null = null;
    let efficientPair: PairType | null = null;

    for (let [pairKey, pair] of incompleted.entries()) {
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
        incompleted.delete(pairKey);
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
