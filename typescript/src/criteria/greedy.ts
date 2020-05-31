import {CriterionArgsType, IncompletedType} from '../types'
import {getCandidate, combinations} from '../utils'

const ascendant = (a: number, b: number) => a > b ? 1 : -1

const getNumRemovablePairs = (indexes: Set<number>, incompleted: IncompletedType, length: number) => {
  let num = 0;
  const removingKeys = combinations([... indexes], length);
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

  let maxNumPairs: number | null = null;
  let efficientPair: number[] | null = null;

  console.log('sortedIncompleted', sortedIncompleted)

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
        //console.log('pair', pair, [... incompleted])
        incompleted.delete(pair.sort(ascendant).toString());
        continue;
      }
      
      const numPairs = getNumRemovablePairs(
        new Set([... row.values(), ...pair]), incompleted, length
      )

      //console.log('debug', incompleted.size, numPairs + tolerance, rowSize * storable)
      if (numPairs + tolerance > rowSize * storable) {
        efficientPair = pair;
        break;
      }
      if (maxNumPairs === null || maxNumPairs < numPairs) {
        maxNumPairs = numPairs;
        efficientPair = pair;
        console.log('pair', pair)
      }
    }
    //console.log("ep", efficientPair)
    if (efficientPair === null) {
      break;
    }
    yield efficientPair;
  }
}
