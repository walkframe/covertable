import type { PictFactorsType } from './types';

/**
 * Convert value-keyed weights to index-keyed weights for use with `OptionsType.weights`.
 * Useful when you want to specify weights by value rather than by index position.
 *
 * @example
 *   weightsByValue(
 *     { Browser: ["Chrome", "Firefox", "Safari"] },
 *     { Browser: { Chrome: 10, Safari: 5 } },
 *   )
 *   // → { Browser: { 0: 10, 2: 5 } }
 */
export function weightsByValue<T extends PictFactorsType>(
  factors: T,
  valueWeights: { [factorKey: string]: { [value: string]: number } },
): { [factorKey: string]: { [index: number]: number } } {
  const result: { [factorKey: string]: { [index: number]: number } } = {};
  for (const [key, vw] of Object.entries(valueWeights)) {
    const values = factors[key];
    if (!values) continue;
    const indexWeights: { [index: number]: number } = {};
    for (const [valueStr, weight] of Object.entries(vw)) {
      const idx = values.findIndex(v => String(v) === valueStr);
      if (idx >= 0) indexWeights[idx] = weight;
    }
    if (Object.keys(indexWeights).length > 0) {
      result[key] = indexWeights;
    }
  }
  return result;
}
