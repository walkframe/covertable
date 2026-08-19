---
name: covertable-usage
description: How to use the CoverTable library (this repo) to generate pairwise / N-wise covering arrays in TypeScript or Python — the make() API and its options, declarative constraints and the Constraint builder, PICT-format models via PictModel, weights/presets/subModels, and the SA post-processor (Controller.optimize / optimizeParallel). Load when writing or reviewing code that calls covertable, builds PICT models, generates test-case tables, or tunes covering-array size.
---

# CoverTable usage

CoverTable generates **pairwise (N-wise) covering arrays** with a one-test-at-a-time greedy (AETG-style) algorithm, plus an optional simulated-annealing post-processor that shrinks the array further. TypeScript is the primary implementation; Python mirrors it.

This skill is the fast path to writing *correct* CoverTable code. For prose docs see `docs/contents/` (rendered at https://covertable.walkframe.com ) and the package READMEs.

## Entry points (TypeScript)

The npm package (`covertable`, currently v3.x) has three export paths — pick the smallest one you need:

```ts
import { make, makeAsync, Controller, sorters, criteria, NeverMatch } from "covertable";
import { PictModel } from "covertable/pict";        // PICT-format model parser
import { Constraint } from "covertable/shortcuts";   // concise constraint builder
```

Inside this repo the sources live under `typescript/src/` (`index.ts`, `controller.ts`, `types.ts`, `pict/`, `shortcuts/`). Python lives under `python/`.

## `make(factors, options)`

`factors` is either an **array of value-lists** (rows come back as arrays, same order) or an **object** keyed by factor name (rows come back as objects). Prefer the object form when constraints are involved — constraints reference factors by key.

```ts
// array form
make([["iPhone","Pixel"], ["iOS","Android"], ["Chrome","Safari"]]);

// object form
make({
  machine: ["iPhone", "Pixel", "XPERIA"],
  os:      ["iOS", "Android"],
  browser: ["Chrome", "Safari"],
});
```

`make` throws `NeverMatch` (with `.uncoveredPairs`) if constraints make some required tuple impossible to cover. `makeAsync` is the generator form (yields rows as they are produced); it does **not** throw NeverMatch — check `ctrl.stats.uncoveredPairs` yourself.

### Options (`OptionsType`, see `typescript/src/types.ts`)

| Option | Type | Default | Notes |
|---|---|---|---|
| `strength` | `number` | `2` | N-wise. Cost grows **exponentially** with strength — use >2 only when required. (Renamed from `length` pre-v3.) |
| `subModels` | `SubModelType[]` | — | `{ fields, strength? }`. Apply a different strength to a group of factors; cross-model pairs stay at the global `strength`. |
| `weights` | `WeightsType` | — | **Index-keyed**: `{ Browser: { 0: 10 } }` weights value index 0. Only biases the completion phase — never changes the minimum row count. Use `weightsByValue` from `covertable/pict` to key by value. |
| `presets` | `PresetRowType[]` | — | Rows that must appear (PICT "seeding"). Partial rows are completed; rows that violate constraints or contain unknown values are **silently dropped**. |
| `constraints` | `Expression[]` | — | Declarative; top-level array is an implicit AND. See below. |
| `comparer` | `Comparer` | — | Custom `eq/ne/gt/lt/gte/lte/in` functions for constraint evaluation. Disables parallel optimize (functions can't cross the worker boundary). |
| `sorter` | `sorters.hash \| sorters.random` | `hash` | `hash` is reproducible (honors `salt`); `random` differs each run and is fastest. |
| `criterion` | `criteria.greedy \| criteria.simple` | `greedy` | `greedy` minimizes rows (slower); `simple` is fast but yields more rows (needed for very wide cases like `2^100`). |
| `salt` | `string \| number` | `""` | Mixed into `hash` ordering. Same factors + same salt ⇒ identical output. (Renamed from `seed` pre-v3.) |
| `tolerance` | `number` | `0` | `greedy` only. Higher = faster but more rows. |

## Constraints

Constraints are evaluated under **Kleene three-valued logic**: while a referenced factor is not yet set in the row, the condition is `null` (deferred), not `false` — so the generator prunes early without discarding viable rows. Model "IF A THEN B" as `A → B` ≡ `¬A ∨ B` (an `or`).

Raw object form:

```ts
make(factors, {
  constraints: [
    // IF machine = iPhone THEN os = iOS
    { operator: "or", conditions: [
      { operator: "ne", left: "machine", value: "iPhone" },
      { operator: "eq", left: "os", value: "iOS" },
    ]},
  ],
});
```

Prefer the **`Constraint` builder** (`covertable/shortcuts`) — pass `typeof factors` for `$`-field autocomplete. `$name` = field reference, anything else = literal:

```ts
import { Constraint } from "covertable/shortcuts";
const c = new Constraint<typeof factors>();

make(factors, {
  constraints: [
    c.or(c.ne("$machine", "iPhone"), c.eq("$os", "iOS")),   // IF iPhone THEN iOS
    c.lte(c.mul("$Price", "$Qty"), 5000),                    // arithmetic operands
    c.not(c.eq("$OS", "Linux")),
  ],
});
```

- Comparisons: `eq ne gt lt gte lte in`. Logical: `and or not`. Arithmetic (as operands): `add sub mul div mod pow`, plus variadic `sum`/`product`.
- **`fn` escape hatch** for logic that can't be expressed declaratively. You MUST list the fields it depends on so three-valued logic knows when to evaluate — a missing dependency makes the condition `null`:
  ```ts
  c.fn(["OS", "Browser"], (row) => row.OS !== "Linux" || row.Browser !== "Safari");
  ```
- Python: `and_() or_() not_()` (trailing underscore); `fn` takes a `lambda row: ...`.

## PICT models (`covertable/pict`)

CoverTable reads **PICT-format** model text (a *superset* of Microsoft PICT — adds arithmetic in constraints, `#` comments, and the `~` negative-value prefix; those extensions won't run in the original PICT tool).

```ts
import { PictModel } from "covertable/pict";

const model = new PictModel(`
Type:          Single, Span, Stripe, Mirror, RAID-5
Size:          10, 100, 500, 1000, 5000, 10000
File system:   FAT, FAT32, NTFS

IF [File system] = "FAT"   THEN [Size] <= 4096;
IF [File system] = "FAT32" THEN [Size] <= 32000;
`, { caseInsensitive: true, strict: false });

const rows = model.make();          // options can be passed and merge with the model's
model.issues;                       // parse issues; with strict:true the ctor throws PictModelError on errors
```

- Sections: **Parameters** (`Name: v1, v2`), **Sub-models** (`{ A, B } @ N`), **Constraints** (`IF … THEN …;`). Also supports weights `(N)`, negatives `~value`, and aliases.
- `strict: true` throws `PictModelError` if any error-severity issue is found; otherwise inspect `model.issues`.
- Negative (`~`) values are re-prefixed with `~` in the output rows for display.
- `model.make(options)` merges the model's own constraints/subModels/weights with any you pass.

## Shrinking the array: `Controller.optimize` (SA post-process)

The greedy `make` result can be shrunk further with simulated annealing. Build a `Controller` (so `strength`/`constraints`/`comparer` are shared and can't drift), `make`, then `optimize`:

```ts
import { Controller } from "covertable";

const ctrl = new Controller(factors, { strength: 2, constraints });
const rows = ctrl.make();
const smaller = ctrl.optimize(rows, { budgetMs: 60_000 });               // single-thread
// const smaller = await ctrl.optimizeParallel(rows, { budgetMs: 60_000, workers: 8 });
```

`PictModel` has the same `optimize()` / `optimizeParallel()` (call `make()`/`makeAsync()` first).

Key facts about optimize (`OptimizeTuning` in `types.ts`):

- **Anytime**: returns the smallest array found within `budgetMs` (default 1000). Aborting via `signal` still returns a valid covering array. `onProgress` fires when a smaller array is accepted.
- Every result is **re-verified** to still cover all required tuples (see `evidence/repro/` for independent verification).
- The main knob is `budgetMs`. The annealing knobs (`startTemperature`, `endTemperature`, `targetedMoveRate`, `minCollateralSamples`, `initialIterations`, `iterationGrowth`) have sensible defaults — usually leave them.
- `seed` makes a run reproducible.

### `optimizeParallel({ workers: N })`

Cooperative **island model**: N workers with distinct seeds and move strategies share a global-best array; laggards adopt it, a couple of scouts keep exploring. The win is **variance/robustness** — a faster, more reproducible path to a given size — **not a smaller array** (it does not push past the combinatorial wall). Falls back to single-thread when workers/`SharedArrayBuffer` are unavailable or the run uses a custom `comparer` or `fn`-constraint. In **bundled** environments (e.g. the VS Code extension) set `workerUrl` to a standalone module that re-exports `__workerReduce`.

## Gotchas checklist

- `weights` keys are **value indices**, not values — use `weightsByValue` to key by value.
- `presets` that violate constraints or use unknown values are **dropped silently**, not errored.
- `make` throws `NeverMatch`; `makeAsync` does not — read `ctrl.stats.uncoveredPairs`.
- High `strength` and wide factor sets blow up combinatorially. For very wide low-strength cases, `criteria.simple` may be required.
- `optimizeParallel` won't beat single-thread on final *size*; it buys speed/reproducibility. Don't promise a smaller array from more workers.
- Reproducibility comes from `sorters.hash` + fixed `salt` (generation) and a fixed `seed` (optimize).
