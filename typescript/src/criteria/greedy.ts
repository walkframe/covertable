import type {CriterionArgsType, IncompleteType, PairType} from '../types';
import {getCandidate, combinations, ascOrder, unique} from '../lib';

const getNumRemovablePairs = (indexes: Set<number>, incomplete: IncompleteType, length: number) => {
  let num = 0;
  const removingKeys = combinations([... indexes], length);
  for (let pair of removingKeys) {
    const key = unique(pair);
    if (incomplete.has(key)) {
      num++;
    }
  }
  return num;
};

export default function* (
  incomplete: IncompleteType,
  criterionArgs: CriterionArgsType,
): Generator<PairType> {
  let {row, parents, length, tolerance} = criterionArgs;

  while (true) {
    let maxNumPairs: number | null = null;
    let efficientPair: PairType | null = null;

    for (let [pairKey, pair] of incomplete.entries()) {
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
        incomplete.delete(pairKey);
        continue;
      }
      
      const numPairs = getNumRemovablePairs(
        new Set([... row.values(), ...pair]), incomplete, length
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
