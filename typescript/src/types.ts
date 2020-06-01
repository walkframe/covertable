export type Scalar = number | string
export type Dict = {[s: string]: any}
export type List = {[index: number]: any[]}

export type FactorsType = {
  [key: string]: any[];
  [index: number]: any[];
} | any[][]

export interface SerialsType {
  [key: string]: number[];
  [index: number]: number[];
}

export type FilterType = (row: {
  [key: string]: any;
  [index: number]: any;
}) => boolean;

export type PairType = number[];

export type IncompletedType = Map<string, PairType>
export type MD5CacheType = Map<string, string>
export type ParentsType =  Map<number, Scalar>;

export type CandidateType = [Scalar, number][];

export interface RowType {
  size: number;
  isArray: Boolean;
  filled: () => Boolean;
  values: () => IterableIterator<number>;
  storable: (candidate: CandidateType) => number | null;
};

export interface SortArgsType {
  row: RowType;
  parents: ParentsType;
  length: number;
  seed?: Scalar;
  md5Cache: MD5CacheType;
};

export interface CriterionArgsType {
  row: RowType;
  parents: ParentsType;
  length: number;
  incompleted: IncompletedType;
  tolerance: number;
};

export interface OptionsType {
  length?: number,
  sorter?: (incompleted: IncompletedType, options: SortArgsType) => PairType[],
  criterion?: (sortedIncompleted: PairType[], options: CriterionArgsType) => IterableIterator<PairType>,
  seed?: Scalar,
  tolerance?: number,
  preFilter?: FilterType,
  postFilter?: FilterType,
};