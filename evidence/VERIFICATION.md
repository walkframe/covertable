# CoverTable + SA — Covering Arrays: Evidence & Independent Verification

Each case was shrunk with the SA post-process under a **20-minute (1200s) budget**,
and the final array was checked for **full pairwise coverage from scratch** by an
**independent verifier** (`verify_ca.py` — `itertools`-only, sharing no code with
the generator).

- Environment: **Apple M4 Mac / bun 1.3.x (JavaScriptCore)**. `3^4` / `3^13` /
  `2^100` / `4^15 3^17 2^29` reach their final size **within seconds on a single
  core** (no parallelism needed). The two cases with an expensive endgame,
  `10^20` and `4^1 3^39 2^35`, were run with **`optimizeAsync` (workers=8,
  cooperative island model)** — see each case's "Method" line; their reduction
  progressions below are the fleet's global best over time.
- Reproduction and verification code is bundled in [`repro/`](./repro/)
  (generator `sa.ts`, independent verifier `verify_ca.py`, inputs `starts/`).
- Numbers are bun measurements. **A Python port is planned but expected to be
  ~15× slower** on the same algorithm (Python ≈ 0.27M it/s vs bun ≈ 4.3M it/s),
  so under an identical budget it would likely reach larger (worse) row counts.
- Values are 0-based level indices. In the TSV, each column is a factor and each
  row is a test case.

## Summary

| Case | Final rows | Independent verification |
|---|---|---|
| 3^4 | 9 | PASS ✅ |
| 3^13 | 15 | PASS ✅ |
| 2^100 | 10 | PASS ✅ |
| 10^20 | 183 | PASS ✅ |
| 4^15 3^17 2^29 | 28 | PASS ✅ |
| 4^1 3^39 2^35 | 20 | PASS ✅ |

## 3^4
- Final: **9 rows**
- Independent verification: required pairs 54 / missing **0** / duplicate rows 0 → **PASS ✅**
- Evidence files: `ca_3_4_N9.json`, `ca_3_4_N9.tsv`
- Completed: RESULT 9 rows valid=true [1482s]

Reduction progression (rows @ elapsed):

| Rows | Elapsed |
|---|---|
| 12 | 0s |
| 11 | 0s |
| 10 | 0s |
| 9 | 0s |

## 3^13
- Final: **15 rows**
- Independent verification: required pairs 702 / missing **0** / duplicate rows 0 → **PASS ✅**
- Evidence files: `ca_3_13_N15.json`, `ca_3_13_N15.tsv`
- Completed: RESULT 15 rows valid=true [1235s]

Reduction progression (rows @ elapsed):

| Rows | Elapsed |
|---|---|
| 18 | 0s |
| 17 | 0s |
| 16 | 0s |
| 15 | 0s |

## 2^100
- Final: **10 rows**
- Independent verification: required pairs 19800 / missing **0** / duplicate rows 0 → **PASS ✅**
- Evidence files: `ca_2_100_N10.json`, `ca_2_100_N10.tsv`
- Completed: RESULT 10 rows valid=true [1609s]

Reduction progression (rows @ elapsed):

| Rows | Elapsed |
|---|---|
| 14 | 0s |
| 13 | 0s |
| 12 | 0s |
| 11 | 0s |
| 10 | 0s |

## 10^20
- Final: **183 rows**
- Method: **`optimizeAsync` (workers=8, cooperative island model)** on the M4 Mac — 8 threads sharing a global-best blackboard, with 2 non-merging scouts.
- Independent verification: required pairs 19000 / missing **0** / duplicate rows 0 → **PASS ✅**
- Evidence files: `ca_10_20_N183.json`, `ca_10_20_N183.tsv`
- Completed: RESULT 183 rows valid=true. `182` was not reached within the 20-minute budget.

Reduction progression (rows @ elapsed, global best across the fleet):

| Rows | Elapsed |
|---|---|
| 196 | 0.1s |
| 195 | 0.3s |
| 194 | 0.6s |
| 193 | 0.9s |
| 192 | 2.0s |
| 191 | 3.5s |
| 190 | 5.9s |
| 189 | 10.3s |
| 188 | 17.2s |
| 187 | 35.7s |
| 186 | 62.2s |
| 185 | 136.3s |
| 184 | 244.0s |
| 183 | 401.4s |

## 4^15 3^17 2^29
- Final: **28 rows**
- Independent verification: required pairs 14026 / missing **0** / duplicate rows 0 → **PASS ✅**
- Evidence files: `ca_4-15_3-17_2-29_N28.json`, `ca_4-15_3-17_2-29_N28.tsv`
- Completed: RESULT 28 rows valid=true [1290s]

Reduction progression (rows @ elapsed):

| Rows | Elapsed |
|---|---|
| 35 | 0s |
| 34 | 0s |
| 33 | 0s |
| 32 | 0s |
| 31 | 0s |
| 30 | 1s |
| 29 | 1s |
| 28 | 26s |

## 4^1 3^39 2^35
- Final: **20 rows**
- Method: **`optimizeAsync` (workers=8, cooperative island model)** on the M4 Mac.
- Independent verification: required pairs 17987 / missing **0** / duplicate rows 0 → **PASS ✅**
- Evidence files: `ca_4-1_3-39_2-35_N20.json`, `ca_4-1_3-39_2-35_N20.tsv`
- Completed: RESULT 20 rows valid=true. `19` was not reached even under a 20-minute budget.

Reduction progression (rows @ elapsed, global best across the fleet):

| Rows | Elapsed |
|---|---|
| 26 | 0.0s |
| 25 | 0.0s |
| 24 | 0.0s |
| 23 | 0.0s |
| 22 | 0.1s |
| 21 | 0.4s |
| 20 | 8.9s |
