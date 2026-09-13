# CoverTable — instructions for Claude Code

Guidance for this repo lives in **@AGENTS.md** (kept as the single source of truth
shared with Codex, Cursor, Antigravity, and other agents). Read it for:

- the library API (`make`, `Controller`, SA `optimize`) in TypeScript and Python,
- **PICT models** — parameters, constraints, sub-models, weights, negatives, and
  **formula (computed) columns** (`=`-prefixed values with `[Field]` references,
  e.g. `Expected: =CLAUDE("…?", [Size], [Cluster])`),
- generating a table **headlessly from the terminal** with the `covertable` CLI
  (`npx covertable pict model.pict -o out.pict.tsv`), and
- repository layout and dev commands.
