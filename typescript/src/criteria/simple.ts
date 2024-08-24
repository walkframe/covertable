import type {FactorsType, PairType} from '../types';
import { Controller } from '../controller';

export default function*<T extends FactorsType> (ctrl: Controller<T>): Generator<PairType> {
  const incomplete = ctrl.incomplete;
  for (let pair of incomplete.values()) {
    const cand = ctrl.getCandidate(pair);
    const storable = ctrl.storable(cand);
    if (storable === null || storable === 0) {
      continue;
    }
    yield pair;
  }
};
