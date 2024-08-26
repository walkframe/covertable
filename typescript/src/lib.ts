// @ts-ignore 2307
export { hex as md5 } from 'js-md5';
import { NotReady } from './exceptions';
import type { 
  FactorsType, Scalar, ParentsType, CandidateType, PairType,
  Dict,
} from './types';

// https://gist.github.com/righ/71e32be8e33f74bde516c06f80c941e8

export const range = (start: number, stop: number, step: number = 1) => {
  return Array.from({ length: (stop - start - 1) / step + 1 }, (_, i) => start + (i * step));
}

export const all = (values: any[]) => {
  for (let value of values) {
    if (!value) {
      return false;
    }
  }
  return true;
}

export const zip = (...lists: [... any[]]): [... any[]] => {
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
    for (let i = last; i > 0; i--) {
      if (indices[i] >= list.length - (last - i)) {
        indices[i - 1]++;
      }
    }
    // -> reset loop
    for (let i = 1; i <= last; i++) {
      if (indices[i] >= list.length - (last - i)) {
        indices[i] = indices[i - 1] + 1;
      }
    }
  }
  return pairs;
}

export const product = <T extends any>(...list: T[][]): T[][] => {
  const pairs: T[][] = [];
  const set = (pair: T[], index: number) => {
    if (pair.length === list.length) {
      pairs.push(pair);
      return;
    }
    for (let i of list[index]) {
      set([...pair, i], index + 1);
    }
  }
  set([], 0);
  return pairs;
}

export const copy = (obj: any[] | object) => {
  if (Array.isArray(obj)) {
    return [...obj];
  }
  return { ...obj };
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
    return [...container.entries()];
  }
  return [...Object.entries(container)];
}

export const getCandidate = (pair: number[], parents: ParentsType): CandidateType => {
  const keys: Scalar[] = pair.map(p => parents.get(p) || 0);
  return zip(keys, pair);
}

export const ascOrder = (a: number, b: number) => a > b ? 1 : -1;

export const unique = (pair: PairType): Scalar => {
  const total = pair.reduce((a, b) => a * b);
  if (Number.isSafeInteger(total)) {
    return total;
  }
  return pair.sort(ascOrder).toString();
}

const isPrime = (n: number) => {
  if (n % 2 === 0) {
    return false;
  }
  let dividers = range(3, Math.sqrt(n) + 1, 2);
  while (dividers.length > 0) {
    const div = dividers[0];
    if (n % div === 0) {
      return false;
    }
    dividers = dividers.filter((n) => n % div !== 0);
  }
  return true;
};

export function* primeGenerator(): Generator<number> {
  yield 2;
  for (let cand = 3; true; cand += 2) {
    if (isPrime(cand)) {
      yield cand;
    }
  }
}



export const proxyHandler = {
  get(obj: Dict, key: string, receiver: any) {
    if (key in obj) {
      return obj[key];
    }
    throw new NotReady(key);
  },
};

