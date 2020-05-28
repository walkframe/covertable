import {CriterionArgsType, IncompletedType} from '../types'
import {getCandidate, combinations} from '../utils'

const ascendant = (a: number, b: number) => a > b ? 1 : -1

const getNumRemovablePairs = (indexes: number[], incompleted: IncompletedType, length: number) => {
  let num = 0;
  const removingKeys = combinations(indexes, length);
  for (let vs of removingKeys) {
    const key = vs.sort(ascendant).toString();
    if (incompleted.has(key)) {
      num++;
    }
  }
  return num
}


export default function* (
  sortedIncompleted: number[][],
  criterionArgs: CriterionArgsType,
) {
  let {row, parents, incompleted, length, tolerance} = criterionArgs;
  if (typeof tolerance === 'undefined') {
    tolerance = 0;
  }

  while (true) {
    let maxNumPairs: number | null = null;
    let efficientPair: number[] | null = null;
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
      if (!storable) {
        continue;
      }
      
      const numPairs = getNumRemovablePairs(
        [... row.values(), ...pair], incompleted, length
      )
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
}
