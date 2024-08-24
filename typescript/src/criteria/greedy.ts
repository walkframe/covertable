import type {FactorsType, PairByKey, PairType} from '../types';
import { combinations, unique } from '../lib';
import { Controller } from '../controller';

const getNumRemovablePairs = (indexes: Set<number>, incomplete: PairByKey, length: number) => {
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

export default function*<T extends FactorsType> (ctrl: Controller<T>): Generator<PairType> {
  while (true) {
    let maxNumPairs: number | null = null;
    let efficientPair: PairType | null = null;

    for (const [pairKey, pair] of ctrl.incomplete.entries()) {
      const rowSize = ctrl.row.size;
      if (rowSize === 0) {
        yield pair;
        continue;
      }
      if (ctrl.isFilled(ctrl.row)) {
        break;
      }

      const storable = ctrl.storable(ctrl.getCandidate(pair));
      if (storable === null) {
        continue;
      }

      if (storable === 0) {
        ctrl.consume(pair);
        continue;
      }
      const storableAbs = Math.abs(storable);
      const { tolerance = 0 } = ctrl.options!;
      
      const numPairs = getNumRemovablePairs(
        new Set([...ctrl.row.values(), ...pair]), 
        ctrl.incomplete, 
        ctrl.pairwiseCount,
      );

      if (numPairs + tolerance > rowSize * storableAbs) {
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
