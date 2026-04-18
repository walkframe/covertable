import type { Expression, Comparer, DictType, Operand } from './types';

export type TriState = true | false | null;

/**
 * Resolve a dot-separated field path against a row object.
 * Returns `undefined` if any segment is missing.
 */
export function resolve(row: DictType, field: string): any {
  const parts = field.split('.');
  let current: any = row;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

const ARITHMETIC_OPS: Record<string, (a: number, b: number) => number> = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => a / b,
  mod: (a, b) => a % b,
  pow: (a, b) => a ** b,
};

/**
 * Resolve an operand (field reference or arithmetic expression) against a row.
 * Returns `undefined` if any referenced field is missing.
 */
function resolveOperand(row: DictType, operand: Operand): any {
  if (typeof operand === 'string') {
    return resolve(row, operand);
  }
  // Arithmetic expression
  const left = resolveOperand(row, operand.left);
  if (left === undefined) return undefined;
  const right = 'right' in operand
    ? resolveOperand(row, operand.right)
    : operand.value;
  if (right === undefined) return undefined;
  const fn = ARITHMETIC_OPS[operand.operator];
  return fn(left, right);
}

/**
 * Extract the set of top-level factor keys that an operand depends on.
 */
function extractOperandKeys(operand: Operand): Set<string> {
  if (typeof operand === 'string') {
    return new Set([operand.split('.')[0]]);
  }
  const keys = extractOperandKeys(operand.left);
  if ('right' in operand) {
    for (const k of extractOperandKeys(operand.right)) keys.add(k);
  }
  return keys;
}

/**
 * Extract the set of top-level factor keys that a condition depends on.
 * For dot-separated paths, only the first segment is returned (that is the
 * factor key; deeper segments are properties within the factor value).
 */
export function extractKeys(c: Expression): Set<string> {
  switch (c.operator) {
    case 'not':
      return extractKeys(c.condition);
    case 'and':
    case 'or': {
      const keys = new Set<string>();
      for (const sub of c.conditions) {
        for (const k of extractKeys(sub)) keys.add(k);
      }
      return keys;
    }
    case 'fn':
      return new Set(c.requires);
    default: {
      const keys = extractOperandKeys(c.left);
      if ('right' in c) {
        for (const k of extractOperandKeys(c.right)) keys.add(k);
      }
      return keys;
    }
  }
}

const DEFAULT_COMPARER: Required<Comparer> = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  gt: (a, b) => a > b,
  lt: (a, b) => a < b,
  gte: (a, b) => a >= b,
  lte: (a, b) => a <= b,
  in: (value, values) => values.has(value),
};

/**
 * Evaluate a `Condition` against a (possibly incomplete) row under Kleene
 * three-valued logic.
 *
 * - `true`    — the condition is satisfied
 * - `false`   — the condition is definitively violated
 * - `null` — a referenced field is missing; the result is inconclusive
 *
 * The `comparer` is only called when both operands are resolved (not
 * `undefined`).
 */
export function evaluate(
  c: Expression,
  row: DictType,
  comparer: Comparer = {},
): TriState {
  switch (c.operator) {
    // -- logical --
    case 'not': {
      const r = evaluate(c.condition, row, comparer);
      if (r === null) return null;
      return !r;
    }
    case 'and': {
      let hasUnknown = false;
      for (const sub of c.conditions) {
        const r = evaluate(sub, row, comparer);
        if (r === false) return false;
        if (r === null) hasUnknown = true;
      }
      return hasUnknown ? null : true;
    }
    case 'or': {
      let hasUnknown = false;
      for (const sub of c.conditions) {
        const r = evaluate(sub, row, comparer);
        if (r === true) return true;
        if (r === null) hasUnknown = true;
      }
      return hasUnknown ? null : false;
    }

    // -- custom --
    case 'fn': {
      for (const k of c.requires) {
        if (resolve(row, k) === undefined) return null;
      }
      return c.evaluate(row);
    }

    // -- in --
    case 'in': {
      const v = resolveOperand(row, c.left);
      if (v === undefined) return null;
      return (comparer.in ?? DEFAULT_COMPARER.in)(v, c.values as unknown as Set<any>);
    }

    // -- comparison --
    default: {
      const v = resolveOperand(row, c.left);
      if (v === undefined) return null;

      let target: any;
      if ('right' in c) {
        target = resolveOperand(row, c.right);
        if (target === undefined) return null;
      } else {
        target = (c as any).value;
      }

      const fn = comparer[c.operator] ?? DEFAULT_COMPARER[c.operator];
      return fn(v, target);
    }
  }
}
