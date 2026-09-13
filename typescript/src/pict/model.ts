import type {
  Expression,
  FilterRowType,
  OptionsType,
  OptimizeTuning,
  OptimizeParallelTuning,
  SubModelType,
  SuggestRowType,
} from '../types';
import { Controller } from '../controller';
import type { ColumnDescriptor, CommentBlock, PictFactorsType, PictModelIssue } from './types';
import { PictModelError } from './types';
import { parse } from './parse';
import { numToColLetter, rewriteFormula, type FormulaColumn } from './formula';
import type { PictConstraintsLexer } from './constraints';

export interface PictModelOptions {
  caseInsensitive?: boolean;
  strict?: boolean;
  /**
   * Treat a parameter line whose value begins with `=` as a formula (computed)
   * column, emitted verbatim per row with `[Col]` refs rewritten. Default: true.
   * Set false to parse such lines as ordinary comma-separated parameters.
   */
  formula?: boolean;
}

export class PictModel {
  private _parameters: PictFactorsType;
  private _subModels: SubModelType[];
  private _negatives: Map<string, Set<string | number>>;
  private _weights: { [factorKey: string]: { [index: number]: number } };
  private _lexer: PictConstraintsLexer | null;
  private _comments: CommentBlock[];
  private _columns: ColumnDescriptor[];
  private _formulaColumns: FormulaColumn[];
  /** Lower-cased column name → spreadsheet letter, for formula rewriting. */
  private _letterByName: Map<string, string>;
  private _controller: Controller<PictFactorsType> | null = null;
  private _rawRows: SuggestRowType<PictFactorsType>[] = [];
  public issues: PictModelIssue[];

  constructor(input: string, options: PictModelOptions = {}) {
    const { caseInsensitive = true, strict = false, formula = true } = options;
    const result = parse(input, { caseInsensitive, formula });

    this._parameters = result.factors;
    this._subModels = result.subModels;
    this._negatives = result.negatives;
    this._weights = result.weights;
    this._lexer = result.lexer;
    this._comments = result.comments;
    this._columns = result.columns;
    this._formulaColumns = result.formulaColumns;
    this.issues = result.issues;

    // Column letters follow the output header position (1st column = A).
    this._letterByName = new Map(
      this._columns.map((c, i) => [c.name.toLowerCase(), numToColLetter(i + 1)]),
    );

    if (strict && this.issues.some(i => i.severity === "error")) {
      throw new PictModelError(this.issues);
    }
  }

  get parameters(): PictFactorsType { return this._parameters; }
  get subModels(): SubModelType[] { return this._subModels; }
  get constraints(): Expression[] { return this._modelConstraints(); }
  get negatives(): Map<string, Set<string | number>> { return this._negatives; }
  get weights(): { [factorKey: string]: { [index: number]: number } } { return this._weights; }
  get comments(): CommentBlock[] { return this._comments; }
  get progress(): number { return this._controller?.progress ?? 0; }
  get stats() { return this._controller?.stats ?? null; }

  /** Output column names in source-declaration order (parameters + formula columns). */
  get columnOrder(): string[] { return this._columns.map((c) => c.name); }
  /** Output columns with their kind, in source-declaration order. */
  get columns(): ColumnDescriptor[] { return this._columns; }
  /** Formula (computed) columns, in source-declaration order. */
  get formulaColumns(): FormulaColumn[] { return this._formulaColumns; }

  /**
   * Render a formula column's template for the given 0-based data-row index,
   * rewriting each `[ColumnName]` to its cell for that row (column letter by the
   * column's output position, row number = index + 1; the header row is not
   * counted). Returns `''` when `columnName` is not a formula column.
   */
  renderFormula(columnName: string, dataRowIndex: number): string {
    const col = this._formulaColumns.find((c) => c.name === columnName);
    if (col == null) return '';
    return rewriteFormula(col.template, dataRowIndex, (name) =>
      this._letterByName.get(name.toLowerCase()),
    );
  }

  /**
   * Evaluate all constraints and the negative-value rule against a
   * (typically complete) row. Returns true if the row passes.
   */
  filter = (row: FilterRowType) => {
    let seenNegative = false;
    for (const [key, negativeSet] of this._negatives) {
      if (key in row && negativeSet.has(row[key])) {
        if (seenNegative) return false;
        seenNegative = true;
      }
    }
    if (this._lexer) {
      for (const f of this._lexer.filters) {
        if (f == null) continue;
        if (!f(row)) return false;
      }
    }
    return true;
  };

  /**
   * Convert this model's constraints into `Expression[]` for the controller.
   * Each lexer filter becomes a `custom` condition with its dependency keys.
   * The negative-value rule also becomes a `custom` condition.
   */
  private _modelConstraints(): Expression[] {
    const list: Expression[] = [];

    if (this._lexer) {
      const filters = this._lexer.filters;
      const filterKeys = this._lexer.filterKeys;
      for (let i = 0; i < filters.length; i++) {
        const f = filters[i];
        if (f == null) continue;
        list.push({
          operator: 'fn',
          requires: [...filterKeys[i]],
          evaluate: f,
        });
      }
    }

    if (this._negatives.size > 0) {
      const negativeKeys = [...this._negatives.keys()] as string[];
      const negatives = this._negatives;
      list.push({
        operator: 'fn',
        requires: negativeKeys,
        evaluate: (row) => {
          let seen = false;
          for (const [key, set] of negatives) {
            if (set.has(row[key])) {
              if (seen) return false;
              seen = true;
            }
          }
          return true;
        },
      });
    }

    return list;
  }

  private _buildOptions(options: OptionsType<PictFactorsType> = {}): OptionsType<PictFactorsType> {
    const {
      constraints: userConstraints,
      subModels: userSubModels,
      weights: userWeights,
      ...rest
    } = options;
    const constraints = [
      ...this._modelConstraints(),
      ...(userConstraints ?? []),
    ];
    const subModels = userSubModels ?? (this._subModels.length > 0 ? this._subModels : undefined);
    const weights = userWeights ?? (Object.keys(this._weights).length > 0 ? this._weights : undefined);
    return { ...rest, constraints, subModels, weights };
  }

  private _applyNegativePrefix(row: any): any {
    if (this._negatives.size === 0) return row;
    const result = { ...row };
    for (const [key, negSet] of this._negatives) {
      if (negSet.has(result[key])) {
        result[key] = `~${result[key]}`;
      }
    }
    return result;
  }

  make(options: OptionsType<PictFactorsType> = {}) {
    this._controller = new Controller(this._parameters, this._buildOptions(options));
    this._rawRows = [...this._controller.makeAsync<PictFactorsType>()];
    return this._rawRows.map((row) => this._applyNegativePrefix(row));
  }

  *makeAsync(options: OptionsType<PictFactorsType> = {}) {
    this._controller = new Controller(this._parameters, this._buildOptions(options));
    this._rawRows = [];
    for (const row of this._controller.makeAsync<PictFactorsType>()) {
      this._rawRows.push(row);
      yield this._applyNegativePrefix(row);
    }
  }

  /**
   * SA post-process the rows from the last `make()`/`makeAsync()` — reusing this
   * model's strength/constraints/comparer via the internal Controller. Returns
   * the smaller array (negative values re-prefixed for display).
   */
  optimize(tuning?: OptimizeTuning): FilterRowType[] {
    if (!this._controller) throw new Error('PictModel.optimize() requires make() or makeAsync() first');
    const optimized = this._controller.optimize(this._rawRows, tuning);
    return optimized.map((row) => this._applyNegativePrefix(row));
  }

  /** Parallel (cooperative) variant of {@link optimize}. */
  async optimizeParallel(tuning?: OptimizeParallelTuning): Promise<FilterRowType[]> {
    if (!this._controller) throw new Error('PictModel.optimizeParallel() requires make() or makeAsync() first');
    const optimized = await this._controller.optimizeParallel(this._rawRows, tuning);
    return optimized.map((row) => this._applyNegativePrefix(row));
  }
}
