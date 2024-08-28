import type { Controller } from "./controller";

export type ScalarType = number | string;
export type DictType = { [s: string]: any };
export type ListType = { [index: number]: any[] };

export type SerialsType = Map<ScalarType, PairType>;
export type ParentsType = Map<number, ScalarType>;
export type IndicesType = Map<number, number>;

export type FilterRowType = {
  [key: string]: any;
  [index: number]: any;
}

export type ArrayTupleType = any[][];
export type ArrayObjectType = { [s: string]: any[] };
export type FactorsType = ArrayTupleType | ArrayObjectType;

export type SuggestRowType<T extends FactorsType> = T extends ArrayTupleType
  ? T[number][number][]
  : T extends ArrayObjectType ? { [K in keyof T]: T[K][number] }
  : unknown;

export type FilterType = (row: FilterRowType) => boolean;
export type SuggestFilterType<T extends FactorsType> = (row: SuggestRowType<T>) => boolean;

export type PairType = number[];

export type PairByKeyType = Map<ScalarType, PairType>;

export type CandidateType = [ScalarType, number][];

export interface RowType {
  consumed: PairByKeyType;
};

export type SorterType = (
  pairs: PairType[],
  sortArgs: SortArgsType,
) => PairType[];

export interface SortArgsType {
  seed: ScalarType;
  indices: IndicesType;
};

export interface CriterionArgsType {
  row: RowType;
  parents: ParentsType;
  length: number;
  tolerance: number;
};

export interface OptionsType<T extends FactorsType> {
  length?: number;
  sorter?: SorterType;
  criterion?: (ctrl: Controller<T>) => IterableIterator<PairType>;
  seed?: ScalarType;
  tolerance?: number;
  preFilter?: FilterType | SuggestFilterType<T>;
  postFilter?: FilterType | SuggestFilterType<T>;
};
