
import hash from "./sorters/hash";
import random from "./sorters/random";

import greedy from "./criteria/greedy";
import simple from "./criteria/simple";

import { FactorsType, OptionsType, SuggestRowType, DictType, ListType, Expression, ComparisonExpression, LogicalExpression, Comparer, OptimizeTuning, OptimizeParallelTuning } from "./types";
import { Controller, ControllerStats } from "./controller";
import { NeverMatch, UncoveredPair } from "./exceptions";

const makeAsync = function* <T extends FactorsType>(
  factors: T,
  options: OptionsType<T> = {}
): Generator<SuggestRowType<T>, void, unknown> {
  const ctrl = new Controller(factors, options);
  yield* ctrl.makeAsync();
};

// SA post-processing is exposed as `Controller.optimize()` /
// `Controller.optimizeParallel()`, which read `strength`/`constraints`/`comparer`
// from the Controller itself so they can never drift out of sync. To optimize:
//   const ctrl = new Controller(factors, options);
//   const rows = ctrl.make();
//   const smaller = ctrl.optimize(rows);          // or await ctrl.optimizeParallel(rows, { workers })
const make = <T extends FactorsType>(factors: T, options: OptionsType<T> = {}) => {
  const ctrl = new Controller(factors, options);
  const rows = ctrl.make<T>();
  if (ctrl.stats.uncoveredPairs.length > 0) {
    throw new NeverMatch(
      `Unable to cover ${ctrl.stats.uncoveredPairs.length} remaining pair(s) without violating constraints`,
      ctrl.stats.uncoveredPairs,
    );
  }
  return rows;
};

const sorters = { hash, random };
const criteria = { greedy, simple };

export {
  make,
  makeAsync,
  sorters,
  criteria,
  Controller,
  NeverMatch,
};

// Internal: the single-reduction entry a worker thread runs. Exported so a
// bundler-produced standalone worker module (see `OptimizeParallelTuning.workerUrl`)
// can import it — not part of the stable public API.
export { __workerReduce } from "./optimize";

export type {
  OptionsType,
  SuggestRowType,
  DictType,
  ListType,
  Expression,
  ComparisonExpression,
  LogicalExpression,
  Comparer,
  UncoveredPair,
  ControllerStats,
  OptimizeTuning,
  OptimizeParallelTuning,
}

