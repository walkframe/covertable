
import hash from "./sorters/hash";
import random from "./sorters/random";

import greedy from "./criteria/greedy";
import simple from "./criteria/simple";

import {PictConstraintsLexer} from "./utils/pict";
import { FactorsType, OptionsType, SuggestRowType } from "./types";
import { Controller } from "./controller";
import { NeverMatch } from "./exceptions";

const makeAsync = function* <T extends FactorsType>(
  factors: T,
  options: OptionsType<T> = {}
) {
  const {
    criterion = greedy,
    postFilter,
  } = options;

  const ctrl = new Controller(factors, options);
  do {
    for (let pair of criterion(ctrl)) {
      if (ctrl.isFilled(ctrl.row)) {
        break;
      }
      ctrl.setPair(pair);
    }
    try {
      const complete = ctrl.close();
      if (complete) {
        if (!postFilter || postFilter(ctrl.toObject(ctrl.row))) {
          yield ctrl.restore() as SuggestRowType<T>;
        } else {
          ctrl.discard();
        }
      }
    } catch (e) {
      if (e instanceof NeverMatch) {
        break;
      }
      throw e;
    }
  } while (ctrl.incomplete.size);
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
};

export default make;
