import {CriterionArgsType} from '../types'
import {getCandidate} from '../utils'



export default function* (
  sortedIncompleted: number[][],
  criterionArgs: CriterionArgsType,
) {
  const {row, parents} = criterionArgs;
  for (let pair of sortedIncompleted) {
    const storable = row.storable(getCandidate(pair, parents));
    if (!storable) {
      continue;
    }
    yield pair
  }
}
