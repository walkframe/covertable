import type { Controller } from "./controller";

export type Scalar = number | string;
export type Dict = { [s: string]: any };
export type List = { [index: number]: any[] };

export type SerialsType = Map<Scalar, PairType>;
export type ParentsType = Map<number, Scalar>;
export type IndicesType = Map<number, number>;

export type FilterRowType = {
  [key: string]: any;
  [index: number]: any;
}

export type ArrayTuple = any[][];
export type ArrayObject = { [s: string]: any[] };
export type FactorsType = ArrayTuple | ArrayObject;

export type SuggestRowType<T extends FactorsType> = T extends ArrayTuple
  ? T[number][number][]
  : T extends ArrayObject ? { [K in keyof T]: T[K][number] }
  : unknown;

export type FilterType = (row: FilterRowType) => boolean;
export type SuggestFilterType<T extends FactorsType> = (row: SuggestRowType<T>) => boolean;

export type PairType = number[];

export type PairByKey = Map<Scalar, PairType>;

export type CandidateType = [Scalar, number][];

export interface RowType {
  consumed: PairByKey;
};

export type SorterType = (
  pairs: PairType[],
  sortArgs: SortArgsType,
) => PairType[];

export interface SortArgsType {
  seed: Scalar;
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
  seed?: Scalar;
  tolerance?: number;
  preFilter?: FilterType | SuggestFilterType<T>;
  postFilter?: FilterType | SuggestFilterType<T>;
};
