
// @ts-ignore 2307
export {hex as md5} from 'js-md5';
import {FactorsType, Scalar, ParentsType, CandidateType} from './types';

// https://gist.github.com/righ/71e32be8e33f74bde516c06f80c941e8

export const range = (start: number, stop: number, step: number=1) => {
  return Array.from({ length: (stop - start - 1) / step + 1}, (_, i) => start + (i * step));
}

export const all = (values: any[]) => {
  for (let value of values) {
    if (!value) {
      return false;
    }
  }
  return true;
}

export const zip = (... lists: [... any[]]): [... any[]] => {
  const length = lists[0].length;
  return range(0, length).map(i => lists.map(l => l[i]));
}

export const combinations = <T>(list: T[], length: number): T[][] => {
  const last = length - 1;
  const pairs: T[][] = [];
  const indices = range(0, length);
  while (indices[0] < list.length - last) {
    pairs.push(indices.map((i) => list[i]));
    indices[last]++;

    // <- carry-up loop
    for (let i=last; i>0; i--) {
      if (indices[i] >= list.length - (last - i)) {
        indices[i-1]++;
      }
    }
    // -> reset loop
    for (let i=1; i<=last; i++) {
      if (indices[i] >= list.length - (last - i)) {
        indices[i] = indices[i-1] + 1;
      }
    }
  }
  return pairs;
}

export const product = <T>(... list: T[][]): T[][] => {
  const pairs: T[][] = [];
  const set = (pair: T[], index: number) => {
    if (pair.length === list.length) {
      pairs.push(pair);
      return;
    }
    for (let i of list[index]) {
      set([... pair, i], index + 1);
    }
  }
  set([], 0);
  return pairs;
}

export const copy = (obj: any[] | object) => {
  if (Array.isArray(obj)) {
    return [... obj];
  }
  return {... obj};
}

export const len = (obj: any[] | object): number => {
  if (Array.isArray(obj)) {
    return obj.length;
  }
  return Object.keys(obj).length;
}

export const getItems = (container: FactorsType | Map<Scalar, any[]>): [Scalar, any[]][] => {
  if (Array.isArray(container)) {
    return container.map((v, i) => [i, v]);
  }
  if (container instanceof Map) {
    return [... container.entries()];
  }
  return [... Object.entries(container)];
}

export const getCandidate = (pair: number[], parents: ParentsType): CandidateType => {
  const keys: Scalar[] = pair.map(p => parents.get(p) || 0);
  return zip(keys, pair);
}

export const ascOrder = (a:number, b:number) => a > b ? 1 : -1;
