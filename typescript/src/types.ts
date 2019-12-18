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