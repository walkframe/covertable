
import hash from "./sorters/hash";
import random from "./sorters/random";

import greedy from "./criteria/greedy";
import simple from "./criteria/simple";

import { FactorsType, OptionsType, SuggestRowType, DictType, ListType, Condition, ComparisonCondition, LogicalCondition, CustomCondition, Comparer } from "./types";
import { Controller, ControllerStats } from "./controller";
import { NeverMatch, UncoveredPair } from "./exceptions";

const makeAsync = function* <T extends FactorsType>(
  factors: T,
  options: OptionsType<T> = {}
): Generator<SuggestRowType<T>, void, unknown> {
  const ctrl = new Controller(factors, options);
  yield* ctrl.makeAsync();
};

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

export type {
  OptionsType,
  SuggestRowType,
  DictType,
  ListType,
  Condition,
  ComparisonCondition,
  LogicalCondition,
  CustomCondition,
  Comparer,
  UncoveredPair,
  ControllerStats,
}

