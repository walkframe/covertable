
import hash from "./sorters/hash";
import random from "./sorters/random";

import greedy from "./criteria/greedy";
import simple from "./criteria/simple";

import {PictConstraintsLexer} from "./utils/pict";
import { FactorsType, OptionsType, SuggestRowType, DictType, ListType } from "./types";
import { Controller } from "./controller";

const makeAsync = function* <T extends FactorsType>(
  factors: T,
  options: OptionsType<T> = {}
): Generator<SuggestRowType<T>, void, unknown> {
  const ctrl = new Controller(factors, options);
  yield* ctrl.makeAsync();
};

const make = <T extends FactorsType>(factors: T, options: OptionsType<T> = {}) => {
  return [...makeAsync(factors, options)];
};

const sorters = { hash, random };
const criteria = { greedy, simple };

export { 
  make,
  makeAsync,
  sorters,
  criteria,
  PictConstraintsLexer,
  Controller,
};

export type {
  OptionsType,
  SuggestRowType,
  DictType,
  ListType,
}

export default make;
