export type Scalar = number | string
export type Dict = {[s: string]: any}
export type List = {[index: number]: any[]}

export type FactorsType = {
  [key: string]: any[];
  [index: number]: any[];
} | any[][]

export type SerialsType = {
  [key: string]: number[];
  [index: number]: number[];
} | any[][]

export type IncompletedType = Map<string, number[]>
export type MD5CacheType = Map<string, string>
export type ParentsType =  Map<number, Scalar>;

export type CandidateType = [Scalar, number][];

export interface RowType {
  isArray: Boolean;
  filled: () => Boolean;
  values: () => IterableIterator<number>;
  storable: (candidate: CandidateType) => number | null;
  size: number;
};

export interface SortArgsType {
  row: RowType;
  parents: ParentsType;
  seed?: Scalar;
};

export interface CriterionArgsType {
  row: RowType;
  parents: ParentsType;
  length: number;
  incompleted: IncompletedType;
  tolerance?: number;
};
