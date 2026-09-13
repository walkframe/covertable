# Change Log

## 0.3.0

- **GridSheet integration** (`pict.output.openInGridsheet`, default on): when the
  GridSheet viewer (`walkframe.csv-gridsheet`) is installed, open the generated
  covering array as an editable spreadsheet grid instead of plain text.
- **Formula (computed) columns** (`pict.formula.enable`, default on): a parameter
  line whose value starts with `=` (e.g. `AI: =AI("summarize", [Size])`) is
  emitted on every row as a formula, with each `[Column]` reference rewritten to
  that row's cell — ready to evaluate in a spreadsheet grid. A trailing `;`
  (mirroring the constraint-line terminator) is dropped so the cell stays a valid
  formula. Turn the setting off to parse such lines as ordinary parameters.
- **Field-reference diagnostics**: a `[Field]` that names no existing parameter —
  in a constraint or a formula column — is flagged right on that `[…]` token.
- **Output naming**: the result always carries a header row; the default name is
  `<model>.pict.tsv` (fully editable), and the format follows the extension you
  give (`.csv` → CSV, anything else → TSV). Removed the `pict.output.format` and
  `pict.output.includeHeader` settings.
- **Regenerate updates in place**: regenerating to a file already open (e.g. in a
  GridSheet grid) replaces its content so the open view re-syncs. When that grid
  has unsaved changes, you are asked before overwriting (requires GridSheet
  0.3.0+; silently skipped with older versions).

## 0.2.0

- **Optimize** (`pict.optimize.enable`): after generation, run the covertable
  SA post-processor in worker threads to shrink the covering array further,
  with configurable time budget (`pict.optimize.budgetMs`) and worker count
  (`pict.optimize.workers`). Coverage and constraints are preserved; value
  weights are ignored while optimizing.

## 0.1.0

Initial release.

- Syntax highlighting for `.pict` model files (parameters, values, weights,
  negatives, aliases, references, sub-models, and the constraint language).
- Live diagnostics for parse errors, reported with line numbers.
- **Generate Covering Array**: run the model with the bundled covertable engine
  and write the result as a TSV/CSV file next to the model.
- Status-bar footer to set Strength / Criterion / Sorter / Case sensitivity and
  run generation, with a cancellable progress indicator.
