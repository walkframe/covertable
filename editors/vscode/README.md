# PICT Pairwise Testing with CoverTable

Syntax highlighting, live diagnostics, and covering-array generation for
[Microsoft PICT](https://github.com/microsoft/pict) model files, powered by the
[CoverTable](https://covertable.walkframe.com) engine — no external binary
required.

## Features

- **Syntax highlighting** for `.pict` files: parameters, values, weights `(N)`,
  negatives `~`, aliases `a|b`, parameter references `<Name>`, sub-models
  `{ A, B } @ N`, the constraint language (`IF/THEN/ELSE`, `AND/OR/NOT`,
  `IN/LIKE`, `[Field]` refs, sets, strings, arithmetic), and **formula columns**
  (a value starting with `=`, with its function names, strings, and `[Column]`
  references highlighted).
- **Diagnostics**: unknown references, malformed constraints, and other parse
  errors are surfaced inline with line numbers, as you type. A `[Field]`
  reference that names no existing parameter — whether in a constraint or a
  formula column — is flagged right on that `[…]` token.
- **Generate Covering Array**: run the model and open the result as a TSV/CSV
  table (always with a header row). You are prompted for the output file name,
  pre-filled with the default extension `<model>.pict.tsv` — with the base name
  pre-selected, so it is easy to change to anything you like. The format follows
  the extension you give: `.csv` → CSV, anything else → TSV. The file is written
  next to the model, **overwriting** any existing file with that name, and
  opened. Command: `PICT: Generate Covering Array` (also on the editor context
  menu).
- **Progress & cancel**: generation runs in time slices with a determinate
  progress notification (`<rows> rows · <pct>% · ~<n>s left`) that stays
  responsive and can be **cancelled** mid-run. On completion you get a summary
  (row count, order, elapsed time) and a warning if any pairs were left
  uncovered by the constraints.
- **Optimize (off by default)**: an optional simulated-annealing post-process
  that shrinks the array further — same coverage, fewer rows. It is **disabled
  by default**; to use it, turn on **`pict.optimize.enable`** in settings (see
  below). It is *anytime* — cancel to keep the best result found so far — but it
  **ignores `weights`** (it rewrites cell values freely), so leave it off if you
  rely on a weighted value distribution.
- **Formula (computed) columns**: a parameter line whose value begins with `=`
  is not a combinatorial factor but a spreadsheet formula emitted on every output
  row. Any `[ColumnName]` reference inside it is rewritten to the cell that column
  occupies on that row — the column letter comes from the column's position in the
  output header (1st = `A`, 2nd = `B`, …; formula columns count too) and the row
  number is the 1-based data-row index. For example, with columns `Type, Size, …`:

  ```pict
  Type: Single, Span
  Size: 10, 100, 1000
  AI:   =AI("summarize this config", [Size])
  ```

  emits an `AI` column of `=AI("summarize this config", B1)`,
  `=AI("summarize this config", B2)`, … — ready to evaluate when opened in a
  spreadsheet grid (e.g. GridSheet). Unknown `[…]` names are flagged as diagnostics.
  The result always carries a header row, so a grid that treats row 1 as labels
  places the first data row at `A1` and these references line up with the data.
- **Status-bar footer**: while a `.pict` file is active, the bottom bar shows
  **Strength · Criterion · Sorter · Case · ▷ Generate**. Click any option to
  change it (persisted to settings); click **Generate** to run.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `pict.strength` | `2` | Combinatorial order (`/o`). 2 = pairwise, 3 = triple-wise. |
| `pict.criterion` | `greedy` | Row-construction criterion: `greedy` (fewest rows) or `simple`. |
| `pict.sorter` | `random` | Candidate ordering: `random` (varies) or `hash` (deterministic). |
| `pict.caseSensitive` | `false` | Case-sensitive comparisons/aliases. Off = case-insensitive. |
| `pict.optimize.enable` | `false` | **Off by default.** Run the simulated-annealing optimizer after generating to shrink the array. Ignores `weights`. |
| `pict.optimize.budgetMs` | `5000` | Time budget (ms) for the optimizer (anytime). Only used when `pict.optimize.enable` is on. |
| `pict.optimize.workers` | `4` | Parallel worker threads for the optimizer (cooperative island model). Only used when `pict.optimize.enable` is on. |
| `pict.output.promptFileName` | `true` | Ask for the output file name before generating. |
| `pict.diagnostics.enable` | `true` | Toggle inline parse diagnostics. |

The status-bar footer edits `pict.strength`, `pict.criterion`, `pict.sorter`,
and `pict.caseSensitive` directly, so it stays in sync with these settings.
The output format follows the file name: `.csv` → CSV, anything else → TSV.

Per-file `{ ... } @ N` sub-models still override `pict.strength` for their factors.

## Development

```bash
pnpm install          # or npm install
pnpm run compile      # bundle once to dist/extension.js
pnpm run watch        # rebuild on change
```

Then press <kbd>F5</kbd> in VS Code to launch an Extension Development Host.

The extension imports the engine by package name — `covertable` and
`covertable/pict` — resolved to the in-repo source via `tsconfig.json` `paths`
(the same convention `docs/` uses). esbuild honours those `paths`, so the engine
is bundled straight from source and stays in lock-step with the library shipped
in this repository. No build of `typescript/` is required first.
