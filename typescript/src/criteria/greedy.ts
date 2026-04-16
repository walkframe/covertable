import type {FactorsType, PairByKeyType, PairType, ScalarType} from '../types';
import { combinations, unique } from '../lib';
import { Controller } from '../controller';

const getNumRemovablePairs = (indexes: Set<number>, incomplete: PairByKeyType, strengths: number[], exclude?: Set<ScalarType>) => {
  let num = 0;
  for (const s of strengths) {
    if (s === 2) {
      // Fast path for pairwise: avoid combinations/unique overhead.
      const arr = [...indexes];
      const len = arr.length;
      for (let i = 0; i < len - 1; i++) {
        const ai = arr[i];
        for (let j = i + 1; j < len; j++) {
          const key = ai * arr[j];
          if (incomplete.has(key) && (!exclude || !exclude.has(key))) {
            num++;
          }
        }
      }
    } else {
      for (let pair of combinations([...indexes], s)) {
        const key = unique(pair);
        if (incomplete.has(key) && (!exclude || !exclude.has(key))) {
          num++;
        }
      }
    }
  }
  return num;
};

export default function*<T extends FactorsType> (ctrl: Controller<T>): Generator<PairType> {
  const hasConstraints = (ctrl.options?.constraints?.length ?? 0) > 0;
  while (true) {
    let maxNumPairs: number | null = null;
    let efficientPair: PairType | null = null;

    // Compute the set of pairs already covered by the current row so
    // getNumRemovablePairs can exclude them. These pairs are still in
    // `incomplete` (consumption happens at yield time) but should not be
    // counted as "removable" — they are already guaranteed to be covered
    // by this row if it succeeds.
    const rowCovered = new Set<ScalarType>();
    if (ctrl.row.size > 0) {
      for (const s of ctrl.allStrengths) {
        for (const p of combinations([...ctrl.row.values()], s)) {
          rowCovered.add(unique(p));
        }
      }
    }

    for (const [pairKey, pair] of ctrl.incomplete.entries()) {
      const rowSize = ctrl.row.size;
      if (ctrl.isFilled(ctrl.row)) {
        break;
      }

      // Skip pairs already covered by the current row.
      if (rowCovered.has(pairKey)) continue;

      // Skip pairs that have been tried and failed for this row.
      if (ctrl.row.invalidPairs.has(pairKey)) continue;

      // Fast path: check compatibility without allocations
      const compat = rowSize === 0 ? pair.length : ctrl.isCompatible(pair);
      if (compat === null) {
        continue;
      }
      if (compat === 0) {
        continue;
      }

      // If constraints exist, do full storable check
      let storable = compat;
      if (hasConstraints) {
        const fullStorable = ctrl.storable(ctrl.getCandidate(pair));
        if (fullStorable === null) {
          continue;
        }
        if (fullStorable === 0) {
          continue;
        }
        storable = fullStorable;
      }

      const storableAbs = Math.abs(storable);
      const { tolerance = 0 } = ctrl.options!;

      const numPairs = getNumRemovablePairs(
        new Set([...ctrl.row.values(), ...pair]),
        ctrl.incomplete,
        ctrl.allStrengths,
        rowCovered,
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
