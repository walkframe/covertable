import type { SubModelType } from '../types';
import type { PictFactorsType, PictModelIssue, SourceLine } from './types';
import { isParameterLine, parseParameters } from './parameters';
import { parseSubModel, subModelPattern } from './subModels';
import { PictConstraintsLexer } from './constraints';

export interface ParseOptions {
  /** Match constraint comparisons and alias lookups case-insensitively. Default: true. */
  caseInsensitive?: boolean;
}

export interface ParseResult {
  factors: PictFactorsType;
  aliases: Map<string, string>;
  negatives: Map<string, Set<string | number>>;
  weights: { [factorKey: string]: { [index: number]: number } };
  subModels: SubModelType[];
  lexer: PictConstraintsLexer | null;
  issues: PictModelIssue[];
}

interface SplitSections {
  parameterLines: SourceLine[];
  subModelLines: SourceLine[];
  constraintText: string;
  constraintStartLine: number;
}

function splitSections(input: string): SplitSections {
  const lines = input.split('\n');
  const parameterLines: SourceLine[] = [];
  const subModelLines: SourceLine[] = [];
  let constraintStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const trimmed = text.trim();
    const lineNum = i + 1; // 1-based
    if (trimmed === '' || trimmed.startsWith('#')) {
      parameterLines.push({ text, line: lineNum });
      continue;
    }
    if (isParameterLine(trimmed)) {
      parameterLines.push({ text, line: lineNum });
    } else if (subModelPattern.test(trimmed)) {
      subModelLines.push({ text: trimmed, line: lineNum });
    } else {
      constraintStart = i;
      break;
    }
  }

  return {
    parameterLines,
    subModelLines,
    constraintText: lines.slice(constraintStart)
      .map(l => l.trim().startsWith('#') ? '' : l)
      .join('\n'),
    constraintStartLine: constraintStart + 1,
  };
}

/**
 * Parse a PICT-format model string into its constituent parts: parameters,
 * sub-models, and constraints. Issues are collected rather than thrown so the
 * caller can decide how to handle them.
 */
export function parse(input: string, options: ParseOptions = {}): ParseResult {
  const { caseInsensitive = true } = options;
  const sections = splitSections(input);
  const issues: PictModelIssue[] = [];

  // Parameters
  const { factors, aliases, negatives, weights, issues: paramIssues } =
    parseParameters(sections.parameterLines);
  issues.push(...paramIssues);

  // Normalize alias keys for case-insensitive lookup
  const lexerAliases = caseInsensitive
    ? new Map(Array.from(aliases, ([k, v]) => [k.toLowerCase(), v]))
    : aliases;

  // Sub-models
  const subModels: SubModelType[] = [];
  sections.subModelLines.forEach(({ text, line }, subIndex) => {
    const sub = parseSubModel(text);
    if (sub) {
      subModels.push(sub);
    } else {
      issues.push({
        severity: "error",
        source: "subModel",
        index: subIndex,
        line,
        message: `Invalid sub-model definition: ${text}`,
      });
    }
  });

  // Constraints
  let lexer: PictConstraintsLexer | null = null;
  if (sections.constraintText.trim()) {
    lexer = new PictConstraintsLexer(
      sections.constraintText,
      false,
      lexerAliases,
      caseInsensitive,
      sections.constraintStartLine,
    );
    lexer.errors.forEach((err, constraintIndex) => {
      if (err == null) return;
      const line = lexer!.filterLines[constraintIndex] ?? sections.constraintStartLine;
      issues.push({
        severity: "error",
        source: "constraint",
        index: constraintIndex,
        line,
        message: err,
      });
    });
  }

  return { factors, aliases, negatives, weights, subModels, lexer, issues };
}
