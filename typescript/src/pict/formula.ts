/**
 * Formula (computed) columns.
 *
 * A parameter line whose value part begins with `=` is not a combinatorial
 * factor but a *formula column*: a spreadsheet formula that is emitted verbatim
 * on every output row, except that each `[ColumnName]` reference is rewritten to
 * the cell that column occupies on that row.
 *
 * The column letter comes from the column's 1-based position in the output
 * header (1st column = A, 2nd = B, …; formula columns count too). The row number
 * is the 1-based data-row index — the header row is intentionally NOT counted,
 * so the first data row is row 1 (`[Size]` → `B1`), the second row 2, and so on.
 *
 * Example: with header `Type, Size, …` the template `=AI("prompt", [Size])`
 * expands to `=AI("prompt", B1)`, `=AI("prompt", B2)`, … down the rows.
 */

/** A formula column parsed from the model, keyed by its declared name. */
export interface FormulaColumn {
  name: string;
  /** The raw template including the leading `=`. */
  template: string;
  /** 1-based source line, for diagnostics. */
  line: number;
  /** 0-based column in the original source line where `template` begins. */
  templateCol: number;
}

/** A single `[Column Name]` reference with its position inside a template. */
export interface FormulaRef {
  /** The referenced column name, trimmed. */
  name: string;
  /** 0-based index of the `[` within the template. */
  index: number;
  /** Length of the whole `[...]` token. */
  length: number;
}

/** Matches `[Column Name]` references inside a template. */
const REF_RE = /\[([^\]]+)\]/g;

/** True when a parameter line's value part is a formula (starts with `=`). */
export function isFormulaValue(rhs: string): boolean {
  return rhs.trim().startsWith('=');
}

/** Every `[...]` reference in a template, in order, with positions (duplicates kept). */
export function iterRefs(template: string): FormulaRef[] {
  const out: FormulaRef[] = [];
  let m: RegExpExecArray | null;
  REF_RE.lastIndex = 0;
  while ((m = REF_RE.exec(template)) !== null) {
    out.push({ name: m[1].trim(), index: m.index, length: m[0].length });
  }
  return out;
}

/** 1-based column index → spreadsheet letter (1→A, 26→Z, 27→AA). */
export function numToColLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** The distinct `[...]` column names referenced by a template, trimmed. */
export function extractRefs(template: string): string[] {
  return [...new Set(iterRefs(template).map((r) => r.name))];
}

/**
 * Rewrite `[ColumnName]` references in `template` to their cell for the given
 * 0-based data-row index. `letterOf` maps a (case-insensitive) column name to
 * its column letter; a reference whose name is unknown is left untouched.
 */
export function rewriteFormula(
  template: string,
  dataRowIndex: number,
  letterOf: (name: string) => string | undefined,
): string {
  const rowNum = dataRowIndex + 1; // header row is not counted
  return template.replace(REF_RE, (whole, rawName: string) => {
    const letter = letterOf(rawName.trim());
    return letter == null ? whole : `${letter}${rowNum}`;
  });
}
