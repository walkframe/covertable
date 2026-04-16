import type { SubModelType } from '../types';

// Parse sub-model line: { P1, P2, P3 } @ N
export const subModelPattern = /^\{\s*(.+?)\s*\}\s*@\s*(\d+)\s*$/;

export function parseSubModel(line: string): SubModelType | null {
  const match = line.match(subModelPattern);
  if (!match) return null;
  const keys = match[1].split(',').map(k => k.trim()).filter(k => k !== '');
  const strength = parseInt(match[2], 10);
  return { keys, strength };
}
