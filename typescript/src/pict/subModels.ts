import type { SubModelType } from '../types';

// Parse sub-model line: { P1, P2, P3 } @ N  — the `@ N` order is optional and,
// when absent, the global order (`/o`) is applied at generation time.
export const subModelPattern = /^\{\s*(.+?)\s*\}\s*(?:@\s*(\d+))?\s*$/;

export function parseSubModel(line: string): SubModelType | null {
  const match = line.match(subModelPattern);
  if (!match) return null;
  const fields = match[1].split(',').map(k => k.trim()).filter(k => k !== '');
  if (match[2] === undefined) {
    return { fields };
  }
  return { fields, strength: parseInt(match[2], 10) };
}
