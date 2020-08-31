export type Scalar = number | string
export type Dict = {[s: string]: any}
export type List = {[index: number]: any[]}

export type FactorsType = {
  [key: string]: any[];
  [index: number]: any[];
} | any[][]

export type SerialsType = Map<Scalar, PairType>;
export type ParentsType = Map<number, Scalar>;
export type IndicesType = Map<number, number>;

export type MappingTypes = {
  serials: SerialsType;
  parents: ParentsType;
  indices: IndicesType;
}

export type FilterType = (row: {
  [key: string]: any;
  [index: number]: any;
}) => boolean;

export type PairType = number[];

export type IncompletedType = Map<Scalar, PairType>;


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
  criterion?: (incompleted: IncompletedType, options: CriterionArgsType) => IterableIterator<PairType>;
  seed?: Scalar;
  tolerance?: number;
  preFilter?: FilterType;
  postFilter?: FilterType;
};

