import {PairType} from '../types';


export default function (
  incompleted: Map<string, PairType>,
  sortArgs: any,
) {
  return [... incompleted.values()];
};
