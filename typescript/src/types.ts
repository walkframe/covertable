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

export type PairType = number[];

export type PairByKeyType = Map<ScalarType, PairType>;

export type CandidateType = [ScalarType, number][];

export interface RowType {};

export type SorterType = (
  pairs: PairType[],
  sortArgs: SortArgsType,
) => PairType[];

export interface SortArgsType {
  salt: ScalarType;
  indices: IndicesType;
};

export interface CriterionArgsType {
  row: RowType;
  parents: ParentsType;
  strength: number;
  tolerance: number;
};

export interface SubModelType {
  keys: ScalarType[];
  strength: number;
};

export type WeightsType = { [factorKey: string]: { [index: number]: number } };

export type PresetRowType = { [key: string]: any; [index: number]: any };

// ---------------------------------------------------------------------------
// Declarative constraints
// ---------------------------------------------------------------------------

/**
 * A comparison condition. `field` supports dot notation for nested access
 * (e.g. `"payment.method"`). `target` references another field for
 * field-to-field comparisons.
 */
export type ComparisonCondition =
  | { operator: 'eq'; field: string; value: any }
  | { operator: 'eq'; field: string; target: string }
  | { operator: 'ne'; field: string; value: any }
  | { operator: 'ne'; field: string; target: string }
  | { operator: 'gt'; field: string; value: any }
  | { operator: 'gt'; field: string; target: string }
  | { operator: 'lt'; field: string; value: any }
  | { operator: 'lt'; field: string; target: string }
  | { operator: 'gte'; field: string; value: any }
  | { operator: 'gte'; field: string; target: string }
  | { operator: 'lte'; field: string; value: any }
  | { operator: 'lte'; field: string; target: string }
  | { operator: 'in'; field: string; values: any[] };

export type LogicalCondition =
  | { operator: 'not'; condition: Condition }
  | { operator: 'and'; conditions: Condition[] }
  | { operator: 'or'; conditions: Condition[] };

/**
 * Escape hatch for constraints that cannot be expressed declaratively.
 * The engine cannot perform three-valued reasoning on these — when a
 * dependency key is missing the condition is treated as `null`.
 * Provide `keys` so the engine knows when it is safe to call `evaluate`.
 */
export type CustomCondition = {
  operator: 'custom';
  keys: string[];
  evaluate: (row: { [key: string]: any }) => boolean;
};

export type Condition = ComparisonCondition | LogicalCondition | CustomCondition;

/**
 * Custom comparison functions. Each key matches a comparison operator name.
 * When provided, the corresponding function is called instead of the default
 * JS comparison. The function receives two resolved (non-undefined) values
 * and must return a boolean.
 *
 * The `in` comparer receives the field value and the values array.
 *
 * `undefined` values (= field not yet set in the row) are **never** passed
 * to a comparer — the engine returns `null` before reaching the
 * comparer in that case.
 */
export interface Comparer {
  eq?: (a: any, b: any) => boolean;
  ne?: (a: any, b: any) => boolean;
  gt?: (a: any, b: any) => boolean;
  lt?: (a: any, b: any) => boolean;
  gte?: (a: any, b: any) => boolean;
  lte?: (a: any, b: any) => boolean;
  in?: (value: any, values: any[]) => boolean;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface OptionsType<T extends FactorsType> {
  strength?: number;
  subModels?: SubModelType[];
  weights?: WeightsType;
  presets?: PresetRowType[];
  sorter?: SorterType;
  criterion?: (ctrl: Controller<T>) => IterableIterator<PairType>;
  salt?: ScalarType;
  tolerance?: number;
  /**
   * Declarative constraints. Each entry is a `Condition` tree that the
   * generator evaluates under Kleene three-valued logic: when a referenced
   * field is not yet present in the row the result is `null` (deferred)
   * rather than `false`, so the generator can prune early without
   * discarding viable combinations.
   *
   * The top-level array is an implicit AND: every condition must be
   * satisfied for a row to be accepted.
   */
  constraints?: Condition[];
  /**
   * Custom comparison functions. See `Comparer` for details.
   */
  comparer?: Comparer;
};
