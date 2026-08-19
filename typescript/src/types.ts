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
  fields: ScalarType[];
  /** Combinatory order. When omitted, the global order (`/o`, default 2) is used. */
  strength?: number;
};

export type WeightsType = { [factorKey: string]: { [index: number]: number } };

export type PresetRowType = { [key: string]: any; [index: number]: any };

// ---------------------------------------------------------------------------
// Declarative constraints
// ---------------------------------------------------------------------------

/**
 * An operand is either a field reference (string, supports dot notation
 * like `"payment.method"`) or an arithmetic expression.
 */
export type Operand = string | ArithmeticExpression;

/**
 * Arithmetic expressions compute a value from two operands.
 * Both `left` and `right` can be field references or nested expressions.
 * When `right` is omitted, `value` provides a literal operand.
 */
export type ArithmeticExpression =
  | { operator: 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow'; left: Operand; right: Operand }
  | { operator: 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow'; left: Operand; value: any };

/**
 * A comparison condition. `left` is the first operand (field reference or
 * expression). The second operand is either `right` (another field/expression)
 * or `value` (a literal). For `in`, use `values` (an array of literals).
 */
export type ComparisonExpression =
  | { operator: 'eq'; left: Operand; value: any }
  | { operator: 'eq'; left: Operand; right: Operand }
  | { operator: 'ne'; left: Operand; value: any }
  | { operator: 'ne'; left: Operand; right: Operand }
  | { operator: 'gt'; left: Operand; value: any }
  | { operator: 'gt'; left: Operand; right: Operand }
  | { operator: 'lt'; left: Operand; value: any }
  | { operator: 'lt'; left: Operand; right: Operand }
  | { operator: 'gte'; left: Operand; value: any }
  | { operator: 'gte'; left: Operand; right: Operand }
  | { operator: 'lte'; left: Operand; value: any }
  | { operator: 'lte'; left: Operand; right: Operand }
  | { operator: 'in'; left: Operand; values: any[] };

export type LogicalExpression =
  | { operator: 'not'; condition: Expression }
  | { operator: 'and'; conditions: Expression[] }
  | { operator: 'or'; conditions: Expression[] };

/**
 * Escape hatch for constraints that cannot be expressed declaratively.
 * The engine cannot perform three-valued reasoning on these — when a
 * dependency key is missing the condition is treated as `null`.
 * Provide `requires` so the engine knows when it is safe to call `evaluate`.
 */
export type FnExpression = {
  operator: 'fn';
  requires: string[];
  evaluate: (row: { [key: string]: any }) => boolean;
};

export type Expression = ComparisonExpression | LogicalExpression | FnExpression;

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
  in?: (value: any, values: Set<any>) => boolean;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Tuning knobs for the SA post-processor, passed to `Controller.optimize()` /
 * `Controller.optimizeParallel()`. It carries only the annealing knobs;
 * `strength`, `constraints`, and `comparer` come from the Controller itself, so
 * they can never drift out of sync with the `make` run.
 */
export interface OptimizeTuning {
  /** Anytime budget in milliseconds — the main knob. Default 1000. */
  budgetMs?: number;
  /** Seed for the internal PRNG, for reproducible runs. Default 0x9e3779b9. */
  seed?: number;
  /** Progress callback, fired whenever a smaller array is accepted. */
  onProgress?: (info: { rows: number; elapsedMs: number }) => void;
  /**
   * Abort signal for early, cooperative cancellation. Because optimization is
   * *anytime*, aborting simply returns the smallest array found so far — the
   * result is always a valid covering array.
   */
  signal?: AbortSignal;

  // -- advanced annealing knobs (sensible defaults; usually leave untouched) --

  /**
   * Iteration budget for the first annealing attempt at removing a row. If that
   * attempt fails, the budget grows (see `iterationGrowth`) and it retries.
   * Default 400000.
   */
  initialIterations?: number;
  /**
   * Multiplier applied to the iteration budget after a failed attempt, so harder
   * rows automatically get more iterations (400k → 640k → …). Default 1.6.
   */
  iterationGrowth?: number;
  /**
   * Starting temperature of the cooling schedule. Higher = more "uphill" (worse)
   * moves accepted early, i.e. broader exploration before settling. Default 2.5.
   */
  startTemperature?: number;
  /**
   * Ending temperature. Lower = the search freezes into near-only-improving
   * moves by the end. The temperature cools geometrically from
   * `startTemperature` to here across an attempt. Default 0.02.
   */
  endTemperature?: number;
  /**
   * Probability that an iteration makes a *targeted* move (force an uncovered
   * tuple into a row) rather than a *random* cell flip. Higher = more direct
   * hole-filling, lower = more random exploration. Default 0.5.
   */
  targetedMoveRate?: number;
  /**
   * Min-collateral move: when a targeted move forces an uncovered tuple into a
   * row, sample this many candidate rows and keep the one that adds the fewest
   * uncovered tuples ("collateral"), preferring constraint-valid rows. `1`
   * (default) is the plain single-random-row move. Higher values cost more per
   * iteration but can crack hard endgames faster; the effect is case-dependent,
   * so the default stays `1`. `optimizeParallel` mixes several values across its
   * workers automatically.
   */
  minCollateralSamples?: number;
}

/**
 * Tuning for `Controller.optimizeParallel()` — the {@link OptimizeTuning} knobs
 * plus the parallel-only `workers` count.
 */
export interface OptimizeParallelTuning extends OptimizeTuning {
  /**
   * Number of parallel workers. Runs this many annealing searches concurrently
   * as a **cooperative island model**: each worker uses a distinct seed and move
   * strategy, shares a global-best array, and a lagging worker adopts the shared
   * best once it stalls (a couple of "scout" workers never merge, to preserve
   * diversity). The smallest verified result is returned. Default 1 (no
   * workers). Falls back to a single thread when workers or `SharedArrayBuffer`
   * are unavailable, or the run uses a custom `comparer`/`fn`-constraint
   * (functions cannot cross the worker boundary).
   */
  workers?: number;
  /**
   * URL (or path) of a standalone module that re-exports `__workerReduce`, used
   * as the worker entry on the Node/Web parallel backends. Needed only in
   * **bundled** environments (e.g. a VS Code extension) where `import.meta.url`
   * cannot locate the library inside the bundle and the bundle itself isn't
   * importable from a worker. Normal Node/browser ESM usage leaves this unset
   * and the backend resolves its own module URL automatically.
   */
  workerUrl?: string;
}

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
  constraints?: Expression[];
  /**
   * Custom comparison functions. See `Comparer` for details.
   */
  comparer?: Comparer;
};
