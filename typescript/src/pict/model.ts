import type {
  Expression,
  FilterRowType,
  OptionsType,
  SubModelType,
} from '../types';
import { Controller } from '../controller';
import type { PictFactorsType, PictModelIssue } from './types';
import { PictModelError } from './types';
import { parse } from './parse';
import type { PictConstraintsLexer } from './constraints';

export interface PictModelOptions {
  caseInsensitive?: boolean;
  strict?: boolean;
}

export class PictModel {
  private _parameters: PictFactorsType;
  private _subModels: SubModelType[];
  private _negatives: Map<string, Set<string | number>>;
  private _weights: { [factorKey: string]: { [index: number]: number } };
  private _lexer: PictConstraintsLexer | null;
  private _controller: Controller<PictFactorsType> | null = null;
  public issues: PictModelIssue[];

  constructor(input: string, options: PictModelOptions = {}) {
    const { caseInsensitive = true, strict = false } = options;
    const result = parse(input, { caseInsensitive });

    this._parameters = result.factors;
    this._subModels = result.subModels;
    this._negatives = result.negatives;
    this._weights = result.weights;
    this._lexer = result.lexer;
    this.issues = result.issues;

    if (strict && this.issues.some(i => i.severity === "error")) {
      throw new PictModelError(this.issues);
    }
  }

  get parameters(): PictFactorsType { return this._parameters; }
  get subModels(): SubModelType[] { return this._subModels; }
  get constraints(): Expression[] { return this._modelConstraints(); }
  get negatives(): Map<string, Set<string | number>> { return this._negatives; }
  get weights(): { [factorKey: string]: { [index: number]: number } } { return this._weights; }
  get progress(): number { return this._controller?.progress ?? 0; }
  get stats() { return this._controller?.stats ?? null; }

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
    return [...this._controller.makeAsync<PictFactorsType>()].map(
      (row) => this._applyNegativePrefix(row)
    );
  }

  *makeAsync(options: OptionsType<PictFactorsType> = {}) {
    this._controller = new Controller(this._parameters, this._buildOptions(options));
    for (const row of this._controller.makeAsync<PictFactorsType>()) {
      yield this._applyNegativePrefix(row);
    }
  }
}
