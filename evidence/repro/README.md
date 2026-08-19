# Reproduction & verification code

This directory contains everything needed to **reproduce and independently
audit** the covering arrays in `evidence/`.

## Execution environment

- **Apple M4 Mac**, **bun 1.3.x (JavaScriptCore)**.
- The SA uses a deterministic PRNG (`mulberry32`), so the iteration trajectory is
  reproducible for a given seed and code; the row count reached still depends on
  the wall-clock budget.

## Files

| File | Role |
|---|---|
| `sa.ts` | The simulated-annealing row-reducer that produced the arrays (pairwise-specialised prototype). The shipped library equivalent is `typescript/src/optimize.ts` — `optimize` / `optimizeAsync`. |
| `verify_ca.py` | **Independent** verifier. Re-checks, from scratch and with `itertools` only, that every required t-way tuple is present. Shares **no code** with the SA generator, so it catches generator-side bugs. |
| `starts/` | The greedy `make()` output for each case — the SA's input (starting) array. |

## Reproduce

Generate a reduced array (`<budgetSec>` = anytime budget in seconds):

```sh
bun sa.ts <budgetSec> starts/start_10_20.json out_10_20.json
```

Independently verify any dumped `{levels, rows}` array:

```sh
python verify_ca.py out_10_20.json 2      # 2 = strength (pairwise)
```

`verify_ca.py` reports the required-tuple count, missing count (must be `0`), and
duplicate rows.

## About a Python port

The measurements here were run on **bun (JavaScriptCore)**. A Python port of the
same algorithm is planned, but **Python is expected to be roughly ~15× slower**
(measured throughput: Python ≈ 0.27M iterations/s vs bun ≈ 4.3M iterations/s on
the same code). Under an identical time budget, the Python port would therefore
likely reach **larger** (worse) row counts than the numbers recorded here.
