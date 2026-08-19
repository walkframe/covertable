"""Independent pairwise (t-way) covering-array verifier.

Loads a dumped {levels: [...], rows: [[...], ...]} JSON and checks, from scratch,
that EVERY t-way column combination has all value-tuples present.
Deliberately shares NO code with the SA generator, to catch generator-side bugs.

Usage: python verify_ca.py <array.json> [strength]
"""
import sys, json
from itertools import combinations, product


def verify(levels, rows, t=2):
    K = len(levels)
    # structural sanity
    for r, row in enumerate(rows):
        if len(row) != K:
            return {"pass": False, "reason": f"row {r} has {len(row)} cells, expected {K}"}
        for c, v in enumerate(row):
            if not (0 <= v < levels[c]):
                return {"pass": False, "reason": f"row {r} col {c} value {v} out of range [0,{levels[c]})"}

    total_required = 0
    total_missing = 0
    missing_samples = []
    for combo in combinations(range(K), t):
        seen = set()
        for row in rows:
            seen.add(tuple(row[c] for c in combo))
        need = 1
        for c in combo:
            need *= levels[c]
        total_required += need
        for vals in product(*[range(levels[c]) for c in combo]):
            if vals not in seen:
                total_missing += 1
                if len(missing_samples) < 10:
                    missing_samples.append({"cols": combo, "values": vals})

    dup = len(rows) - len({tuple(r) for r in rows})
    return {
        "pass": total_missing == 0,
        "rows": len(rows),
        "factors": K,
        "levels_summary": summarize(levels),
        "strength": t,
        "required_tuples": total_required,
        "missing_tuples": total_missing,
        "missing_samples": missing_samples,
        "duplicate_rows": dup,
    }


def summarize(levels):
    from collections import Counter
    c = Counter(levels)
    return " ".join(f"{lvl}^{cnt}" for lvl, cnt in sorted(c.items(), reverse=True))


if __name__ == "__main__":
    path = sys.argv[1]
    t = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    with open(path) as fh:
        data = json.load(fh)
    # array key: "matrix" (evidence schema) or "rows" (raw dump schema)
    matrix = data.get("matrix")
    if not isinstance(matrix, list):
        matrix = data["rows"]
    res = verify(data["levels"], matrix, t)
    print(json.dumps(res, indent=2))
    print("\n=> " + ("PASS ✅  valid covering array" if res["pass"]
                     else f"FAIL ❌  {res['missing_tuples']} tuples uncovered"))
    sys.exit(0 if res["pass"] else 1)
