# PICT Pairwise Testing with CoverTable

Syntax highlighting, live diagnostics, and covering-array generation for
[Microsoft PICT](https://github.com/microsoft/pict) model files, powered by the
[CoverTable](https://covertable.walkframe.com) engine — no external binary
required.

## Features

- **Syntax highlighting** for `.pict` files: parameters, values, weights `(N)`,
  negatives `~`, aliases `a|b`, parameter references `<Name>`, sub-models
  `{ A, B } @ N`, and the constraint language (`IF/THEN/ELSE`, `AND/OR/NOT`,
  `IN/LIKE`, `[Field]` refs, sets, strings, arithmetic).
- **Diagnostics**: unknown references, malformed constraints, and other parse
  errors are surfaced inline with line numbers, as you type.
- **Generate Covering Array**: run the model and open the result as a TSV/CSV
  table. You are prompted for the output file name, pre-filled with
  `<model>.tsv` / `<model>.csv`; the file is written next to the model,
  **overwriting** any existing file with that name, and opened. Command:
  `PICT: Generate Covering Array` (also on the editor context menu).
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
| `pict.output.format` | `tsv` | Result separator: `tsv` or `csv`. |
| `pict.output.includeHeader` | `true` | Emit a header row of parameter names. |
| `pict.output.promptFileName` | `true` | Ask for the output file name before generating. |
| `pict.diagnostics.enable` | `true` | Toggle inline parse diagnostics. |

The status-bar footer edits `pict.strength`, `pict.criterion`, `pict.sorter`,
and `pict.caseSensitive` directly, so it stays in sync with these settings.
A file name ending in `.csv`/`.tsv` overrides `pict.output.format` for that run.

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
