import type { PictFactorsType, PictModelIssue, SourceLine } from './types';

// Split comma-separated values respecting quoted strings
export function splitValues(input: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of input) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === ',' && !inQuotes) {
      if (current.trim()) values.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) values.push(current.trim());
  return values;
}

export function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

// Parse a single value token, handling ~, (weight), |aliases, <ref>, "quotes"
export function parseValue(
  raw: string,
  existing: Record<string, (string | number)[]>,
  aliases: Map<string, string>,
): { values: (string | number)[]; isNegative: boolean; weight: number } {
  const trimmed = raw.trim();

  // Parameter reference: <ParamName>
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    const refName = trimmed.slice(1, -1);
    if (!(refName in existing)) {
      throw new Error(`Unknown parameter reference: "${refName}"`);
    }
    return { values: [...existing[refName]], isNegative: false, weight: 1 };
  }

  let token = trimmed;
  let isNegative = false;
  let weight = 1;

  // Negative prefix: ~
  if (token.startsWith('~')) {
    token = token.slice(1);
    isNegative = true;
  }

  // Weight suffix: (N)
  const weightMatch = token.match(/\s*\((\d+)\)\s*$/);
  if (weightMatch) {
    weight = parseInt(weightMatch[1], 10);
    token = token.slice(0, token.lastIndexOf('(')).trim();
  }

  // Aliases: take canonical (first) value, record the rest
  if (token.includes('|')) {
    const parts = token.split('|').map(s => s.trim());
    const canonical = stripQuotes(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      const aliasValue = stripQuotes(parts[i]);
      aliases.set(aliasValue, canonical);
    }
    token = parts[0];
  }

  // Quoted string
  if (token.startsWith('"') && token.endsWith('"')) {
    return { values: [token.slice(1, -1)], isNegative, weight };
  }

  // Number or string
  const n = Number(token);
  return {
    values: [token !== '' && !isNaN(n) ? n : token],
    isNegative,
    weight,
  };
}

export function isParameterLine(trimmed: string): boolean {
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx <= 0) return false;
  // Constraint lines start with [ or IF
  if (trimmed.startsWith('[')) return false;
  if (/^IF\s/i.test(trimmed)) return false;
  return true;
}

export function parseParameters(lines: SourceLine[]): {
  factors: PictFactorsType;
  aliases: Map<string, string>;
  negatives: Map<string, Set<string | number>>;
  weights: { [factorKey: string]: { [index: number]: number } };
  issues: PictModelIssue[];
} {
  const factors: PictFactorsType = {};
  const aliases = new Map<string, string>();
  const negatives = new Map<string, Set<string | number>>();
  const weights: { [factorKey: string]: { [index: number]: number } } = {};
  const issues: PictModelIssue[] = [];
  let factorIndex = 0;

  const addIssue = (line: number, message: string) => {
    issues.push({
      severity: "error",
      source: "factor",
      index: factorIndex,
      line,
      message,
    });
  };

  for (const { text, line } of lines) {
    const trimmed = text.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      addIssue(line, `Invalid line (missing ":"): ${trimmed}`);
      factorIndex++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    if (key === '') {
      addIssue(line, `Empty parameter name in line: ${trimmed}`);
      factorIndex++;
      continue;
    }

    try {
      const rawValues = splitValues(trimmed.slice(colonIndex + 1));
      const values: (string | number)[] = [];
      const negativeSet = new Set<string | number>();
      const factorWeights: { [index: number]: number } = {};
      for (const raw of rawValues) {
        const parsed = parseValue(raw, factors, aliases);
        const startIndex = values.length;
        values.push(...parsed.values);
        if (parsed.isNegative) {
          for (const v of parsed.values) negativeSet.add(v);
        }
        if (parsed.weight !== 1) {
          for (let i = 0; i < parsed.values.length; i++) {
            factorWeights[startIndex + i] = parsed.weight;
          }
        }
      }

      if (values.length === 0) {
        addIssue(line, `No values for parameter "${key}"`);
        factorIndex++;
        continue;
      }

      factors[key] = values;
      if (negativeSet.size > 0) {
        negatives.set(key, negativeSet);
      }
      if (Object.keys(factorWeights).length > 0) {
        weights[key] = factorWeights;
      }
    } catch (e: any) {
      addIssue(line, e.message);
    }
    factorIndex++;
  }
  return { factors, aliases, negatives, weights, issues };
}
