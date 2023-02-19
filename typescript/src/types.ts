export type Scalar = number | string;
export type Dict = { [s: string]: any };
export type List = { [index: number]: any[] };

export type SerialsType = Map<Scalar, PairType>;
export type ParentsType = Map<number, Scalar>;
export type IndicesType = Map<number, number>;

export type MappingTypes = {
  serials: SerialsType;
  parents: ParentsType;
  indices: IndicesType;
};

export type FilterType = (row: {
  [key: string]: any;
  [index: number]: any;
}) => boolean;

export type PairType = number[];

export type IncompleteType = Map<Scalar, PairType>;


export type CandidateType = [Scalar, number][];

export interface RowType {
  size: number;
  isArray: Boolean;
  filled: () => Boolean;
  values: () => IterableIterator<number>;
  storable: (candidate: CandidateType) => number | null;
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

export interface OptionsType {
  length?: number;
  sorter?: SorterType;
  criterion?: (incomplete: IncompleteType, options: CriterionArgsType) => IterableIterator<PairType>;
  seed?: Scalar;
  tolerance?: number;
  preFilter?: FilterType;
  postFilter?: FilterType;
};

export type ArrayTuple = any[][];
export type ArrayObject = { [s: string]: any[] };
export type FactorsType = ArrayTuple | ArrayObject;

export type SuggestRowType<T extends FactorsType> = T extends ArrayTuple
  ? T[number][number][]
  : T extends ArrayObject ? { [K in keyof T]: T[K][number] }
  : unknown;
