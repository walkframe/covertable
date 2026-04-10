import type { Condition, Comparer, DictType } from './types';

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

/**
 * Extract the set of top-level factor keys that a condition depends on.
 * For dot-separated paths, only the first segment is returned (that is the
 * factor key; deeper segments are properties within the factor value).
 */
export function extractKeys(c: Condition): Set<string> {
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
    case 'custom':
      return new Set(c.keys);
    default: {
      const keys = new Set<string>();
      keys.add(c.field.split('.')[0]);
      if ('target' in c && typeof c.target === 'string') {
        keys.add(c.target.split('.')[0]);
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
  in: (value, values) => values.includes(value),
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
  c: Condition,
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
    case 'custom': {
      for (const k of c.keys) {
        if (resolve(row, k) === undefined) return null;
      }
      return c.evaluate(row);
    }

    // -- in --
    case 'in': {
      const v = resolve(row, c.field);
      if (v === undefined) return null;
      return (comparer.in ?? DEFAULT_COMPARER.in)(v, c.values);
    }

    // -- comparison --
    default: {
      const v = resolve(row, c.field);
      if (v === undefined) return null;

      let target: any;
      if ('target' in c) {
        target = resolve(row, c.target);
        if (target === undefined) return null;
      } else {
        target = (c as any).value;
      }

      const fn = comparer[c.operator] ?? DEFAULT_COMPARER[c.operator];
      return fn(v, target);
    }
  }
}
