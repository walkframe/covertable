export type PictFactorsType = { [key: string]: (string | number)[] };

/** A source line tagged with its 1-based line number in the original input. */
export interface SourceLine {
  text: string;
  line: number; // 1-based
}

/**
 * A contiguous block of comment (`#`) lines, classified by what it describes.
 *
 * A block directly above a parameter line, with no blank line between, is a
 * field description (`attachedTo` = that parameter's key). A block separated by
 * a blank line, or sitting above a non-parameter line, is freestanding
 * (`attachedTo` = null) and is treated as documentation only.
 */
export interface CommentBlock {
  /** The comment lines in this block, in source order. */
  lines: SourceLine[];
  /** Comment text with the leading `#` (and one space) stripped, joined by `\n`. */
  text: string;
  /** The parameter key this block describes, or null if freestanding. */
  attachedTo: string | null;
}

export type IssueSeverity = "error" | "warning";
export type IssueSource = "factor" | "subModel" | "constraint";

export interface PictModelIssue {
  severity: IssueSeverity;
  source: IssueSource;
  index: number; // 0-based index within the source
  line: number;  // 1-based line number in the original input
  message: string;
}

export class PictModelError extends Error {
  public readonly issues: PictModelIssue[];
  constructor(issues: PictModelIssue[]) {
    const errs = issues.filter(i => i.severity === "error");
    const summary = errs
      .map(i => `  [${i.source}#${i.index} line ${i.line}] ${i.message}`)
      .join("\n");
    super(`PictModel has ${errs.length} error(s):\n${summary}`);
    this.name = "PictModelError";
    this.issues = issues;
  }
}
