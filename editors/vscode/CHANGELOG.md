# Change Log

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
