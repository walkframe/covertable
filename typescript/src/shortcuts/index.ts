import type {
  Expression,
  Operand,
  ArithmeticExpression,
  ArrayObjectType,
} from '../types';

type ArithOp = 'add' | 'sub' | 'mul' | 'div' | 'mod' | 'pow';
type CompOp = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte';

/** A field reference or arithmetic expression (resolves to an Operand). */
type FieldOrExpr<T> = `$${string & keyof T}` | ArithmeticExpression;

/** A literal value (preserves template literal autocomplete via `string & {}`). */
type Literal = (string & {}) | number | boolean | null;

/** Wrapper to force a value to be treated as a literal, not a field reference. */
type ValWrapper = { __val: true; value: any };

/** Right-hand operand: field reference, expression, literal, or val-wrapped. */
type RightOperand<T> = FieldOrExpr<T> | Literal | ValWrapper;

function resolveOperand<T>(x: RightOperand<T>): { operand: Operand } | { value: any } {
  if (typeof x === 'object' && x !== null) {
    if ('__val' in x) return { value: (x as ValWrapper).value };
    if ('operator' in x) return { operand: x as ArithmeticExpression };
  }
  if (typeof x === 'string' && x.startsWith('$')) {
    return { operand: x.slice(1) };
  }
  return { value: x };
}

function buildComparison<T>(operator: CompOp, left: FieldOrExpr<T>, right: any): Expression {
  const l = resolveOperand<T>(left);
  const r = resolveOperand<T>(right);
  const leftOp = 'operand' in l ? l.operand : l.value;
  if ('operand' in r) {
    return { operator, left: leftOp, right: r.operand } as Expression;
  }
  return { operator, left: leftOp, value: r.value } as Expression;
}

function buildArithmetic<T>(operator: ArithOp, left: FieldOrExpr<T> | RightOperand<T>, right: FieldOrExpr<T> | RightOperand<T>): ArithmeticExpression {
  const l = resolveOperand<T>(left);
  const r = resolveOperand<T>(right);
  const leftOp = 'operand' in l ? l.operand : l.value;
  if ('operand' in r) {
    return { operator, left: leftOp, right: r.operand };
  }
  return { operator, left: leftOp, value: r.value };
}

function foldArithmetic<T>(operator: ArithOp, args: (FieldOrExpr<T> | RightOperand<T>)[]): ArithmeticExpression {
  let acc = buildArithmetic<T>(operator, args[0], args[1]);
  for (let i = 2; i < args.length; i++) {
    const r = resolveOperand<T>(args[i]);
    if ('operand' in r) {
      acc = { operator, left: acc, right: r.operand };
    } else {
      acc = { operator, left: acc, value: r.value };
    }
  }
  return acc;
}

/**
 * Constraint builder with `$`-prefixed field references and type-safe
 * autocompletion via template literal types.
 *
 * ```typescript
 * const c = new Constraint<typeof factors>();
 * c.eq("$OS", "Mac")
 * c.gt(c.mul("$Price", "$Qty"), 10000)
 * c.sum("$A", "$B", "$C")
 * ```
 */
export class Constraint<T extends Record<string, readonly any[]> = ArrayObjectType> {
  // -- comparison --
  eq(left: FieldOrExpr<T>, right: FieldOrExpr<T> | RightOperand<T>): Expression {
    return buildComparison<T>('eq', left, right);
  }
  ne(left: FieldOrExpr<T>, right: FieldOrExpr<T> | RightOperand<T>): Expression {
    return buildComparison<T>('ne', left, right);
  }
  gt(left: FieldOrExpr<T>, right: FieldOrExpr<T> | RightOperand<T>): Expression {
    return buildComparison<T>('gt', left, right);
  }
  lt(left: FieldOrExpr<T>, right: FieldOrExpr<T> | RightOperand<T>): Expression {
    return buildComparison<T>('lt', left, right);
  }
  gte(left: FieldOrExpr<T>, right: FieldOrExpr<T> | RightOperand<T>): Expression {
    return buildComparison<T>('gte', left, right);
  }
  lte(left: FieldOrExpr<T>, right: FieldOrExpr<T> | RightOperand<T>): Expression {
    return buildComparison<T>('lte', left, right);
  }
  in(left: FieldOrExpr<T>, values: any[]): Expression {
    const l = resolveOperand<T>(left);
    const leftOp = 'operand' in l ? l.operand : l.value;
    return { operator: 'in', left: leftOp, values } as Expression;
  }

  // -- logical --
  and(...conditions: Expression[]): Expression {
    return { operator: 'and', conditions };
  }
  or(...conditions: Expression[]): Expression {
    return { operator: 'or', conditions };
  }
  not(condition: Expression): Expression {
    return { operator: 'not', condition };
  }

  // -- binary arithmetic --
  add(left: FieldOrExpr<T> | RightOperand<T>, right: FieldOrExpr<T> | RightOperand<T>): ArithmeticExpression {
    return buildArithmetic<T>('add', left, right);
  }
  sub(left: FieldOrExpr<T> | RightOperand<T>, right: FieldOrExpr<T> | RightOperand<T>): ArithmeticExpression {
    return buildArithmetic<T>('sub', left, right);
  }
  mul(left: FieldOrExpr<T> | RightOperand<T>, right: FieldOrExpr<T> | RightOperand<T>): ArithmeticExpression {
    return buildArithmetic<T>('mul', left, right);
  }
  div(left: FieldOrExpr<T> | RightOperand<T>, right: FieldOrExpr<T> | RightOperand<T>): ArithmeticExpression {
    return buildArithmetic<T>('div', left, right);
  }
  mod(left: FieldOrExpr<T> | RightOperand<T>, right: FieldOrExpr<T> | RightOperand<T>): ArithmeticExpression {
    return buildArithmetic<T>('mod', left, right);
  }
  pow(left: FieldOrExpr<T> | RightOperand<T>, right: FieldOrExpr<T> | RightOperand<T>): ArithmeticExpression {
    return buildArithmetic<T>('pow', left, right);
  }

  // -- variadic arithmetic --
  sum(...args: (FieldOrExpr<T> | RightOperand<T>)[]): ArithmeticExpression {
    if (args.length < 2) throw new Error('sum() requires at least 2 arguments');
    return foldArithmetic<T>('add', args);
  }
  product(...args: (FieldOrExpr<T> | RightOperand<T>)[]): ArithmeticExpression {
    if (args.length < 2) throw new Error('product() requires at least 2 arguments');
    return foldArithmetic<T>('mul', args);
  }

  // -- fn --
  fn(requires: (string & keyof T)[], evaluate: (row: { [K in keyof T]: any }) => boolean): Expression {
    return { operator: 'fn', requires, evaluate } as Expression;
  }

  // -- literal --
  val(value: any): ValWrapper {
    return { __val: true, value };
  }
}
