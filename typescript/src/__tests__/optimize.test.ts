import { make, Controller } from "../index";
import { combinations, range, getItems, product, all } from "../lib";
import type { FactorsType, Expression } from "../types";

// -- helpers ---------------------------------------------------------------

/** Enumerate every t-tuple ([key,value][]) realizable from `factors`. */
function* allTuples(factors: FactorsType, strength: number) {
  const items = getItems(factors);
  const keys = items.map(([k]) => k);
  for (const combo of combinations(range(0, keys.length), strength)) {
    const lists = combo.map((ci) => items[ci][1]);
    for (const values of product(...lists)) {
      yield combo.map((ci, i) => [keys[ci], values[i]] as [any, any]);
    }
  }
}

function get(row: any, key: any) {
  return row[key];
}

/** Every t-tuple that appears in `rows`, as a Set of stable string keys. */
function coveredSet(rows: any[], factors: FactorsType, strength: number): Set<string> {
  const items = getItems(factors);
  const keys = items.map(([k]) => k);
  const set = new Set<string>();
  for (const row of rows) {
    for (const combo of combinations(range(0, keys.length), strength)) {
      const parts = combo.map((ci) => `${String(keys[ci])}=${JSON.stringify(get(row, keys[ci]))}`);
      set.add(parts.join("|"));
    }
  }
  return set;
}

/** Assert full t-wise coverage: every realizable t-tuple appears in some row. */
function expectFullCoverage(rows: any[], factors: FactorsType, strength: number) {
  for (const tuple of allTuples(factors, strength)) {
    const found = rows.some((row) => tuple.every(([k, v]) => get(row, k) === v));
    if (!found) {
      throw new Error(`tuple ${JSON.stringify(tuple)} is not covered`);
    }
  }
}

// -- correctness -----------------------------------------------------------

describe("optimize correctness", () => {
  it("keeps full pairwise coverage and never grows the array", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2", "c3"],
      D: ["d1", "d2"],
      E: ["e1", "e2"],
    };
    const rows = make(factors);
    const smaller = new Controller(factors).optimize(rows, { budgetMs: 1500, seed: 1 });

    expect(smaller.length).toBeLessThanOrEqual(rows.length);
    expectFullCoverage(smaller, factors, 2);
  });

  it("preserves exactly the tuples the input covered", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2"],
      D: ["d1", "d2", "d3"],
    };
    const rows = make(factors);
    const before = coveredSet(rows, factors, 2);
    const after = new Controller(factors).optimize(rows, { budgetMs: 1000, seed: 7 });
    const afterSet = coveredSet(after, factors, 2);
    for (const tuple of before) {
      expect(afterSet.has(tuple)).toBe(true);
    }
  });

  it("works with array-form factors and returns array rows", () => {
    const factors = [
      ["a", "b", "c"],
      ["d", "e", "f"],
      ["g", "h", "i"],
      ["j", "k"],
    ];
    const rows = make(factors);
    const smaller = new Controller(factors).optimize(rows, { budgetMs: 1000, seed: 3 });
    expect(Array.isArray(smaller[0])).toBe(true);
    expect(smaller.length).toBeLessThanOrEqual(rows.length);
    expectFullCoverage(smaller, factors, 2);
  });

  it("is reproducible for a given seed", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2", "c3"],
      D: ["d1", "d2", "d3"],
    };
    const rows = make(factors);
    const r1 = new Controller(factors).optimize(rows, { budgetMs: 800, seed: 42 });
    const r2 = new Controller(factors).optimize(rows, { budgetMs: 800, seed: 42 });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it("does not mutate the input rows", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2"],
    };
    const rows = make(factors);
    const snapshot = JSON.stringify(rows);
    new Controller(factors).optimize(rows, { budgetMs: 500, seed: 5 });
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  it("handles trivially small inputs", () => {
    const factors = { A: ["a1", "a2"], B: ["b1"] };
    const rows = make(factors);
    const out = new Controller(factors).optimize(rows, { budgetMs: 200 });
    expectFullCoverage(out, factors, 2);
    expect(out.length).toBeLessThanOrEqual(rows.length);
  });
});

// -- Controller.make() + Controller.optimize() integration ----------------

describe("Controller make + optimize", () => {
  it("post-processes make output and stays fully covered", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2", "c3"],
      D: ["d1", "d2"],
      E: ["e1", "e2"],
    };
    const ctrl = new Controller(factors);
    const plain = ctrl.make();
    const optimized = ctrl.optimize(plain, { budgetMs: 1500, seed: 1 });

    expect(optimized.length).toBeLessThanOrEqual(plain.length);
    expectFullCoverage(optimized, factors, 2);
  });

  it("optimizes the last make() output by default", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2"],
    };
    const ctrl = new Controller(factors);
    const plain = ctrl.make();
    const optimized = ctrl.optimize(undefined, { budgetMs: 500, seed: 2 }); // no rows -> uses make() output
    expect(optimized.length).toBeLessThanOrEqual(plain.length);
    expectFullCoverage(optimized, factors, 2);
  });

  it("reuses strength from the Controller (no drift)", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2", "c3"],
      D: ["d1", "d2"],
      E: ["e1", "e2"],
    };
    const strength = 3;
    // strength is given only once, to the Controller — optimize reuses it
    const ctrl = new Controller(factors, { strength });
    const optimized = ctrl.optimize(ctrl.make(), { budgetMs: 2000, seed: 3 });
    expectFullCoverage(optimized, factors, strength);
  });

  it("reuses constraints from the Controller and keeps rows valid", () => {
    const factors = {
      OS: ["Win", "Mac", "Linux"],
      Browser: ["Chrome", "Firefox", "Safari"],
      Lang: ["en", "ja", "de"],
    };
    const constraints: Expression[] = [
      {
        operator: "or",
        conditions: [
          { operator: "ne", left: "Browser", value: "Safari" },
          { operator: "eq", left: "OS", value: "Mac" },
        ],
      },
    ];
    const ctrl = new Controller(factors, { constraints });
    const plain = ctrl.make();
    const optimized = ctrl.optimize(plain, { budgetMs: 1500, seed: 9 });
    for (const row of optimized) {
      if ((row as any).Browser === "Safari") expect((row as any).OS).toBe("Mac");
    }
    // optimize preserves exactly the tuples the constrained make covered
    const before = coveredSet(plain, factors, 2);
    const after = coveredSet(optimized, factors, 2);
    for (const tuple of before) expect(after.has(tuple)).toBe(true);
  });
});

// -- constraints -----------------------------------------------------------

describe("optimize with constraints", () => {
  it("keeps every row valid and preserves coverage (declarative)", () => {
    const factors = {
      OS: ["Win", "Mac", "Linux"],
      Browser: ["Chrome", "Firefox", "Safari"],
      Lang: ["en", "ja", "de"],
    };
    const constraints: Expression[] = [
      // Safari only on Mac
      {
        operator: "or",
        conditions: [
          { operator: "ne", left: "Browser", value: "Safari" },
          { operator: "eq", left: "OS", value: "Mac" },
        ],
      },
    ];
    const rows = make(factors, { constraints });
    const before = coveredSet(rows, factors, 2);
    const smaller = new Controller(factors, { constraints }).optimize(rows, { budgetMs: 1500, seed: 11 });

    expect(smaller.length).toBeLessThanOrEqual(rows.length);
    for (const row of smaller) {
      if ((row as any).Browser === "Safari") expect((row as any).OS).toBe("Mac");
    }
    const after = coveredSet(smaller, factors, 2);
    for (const tuple of before) expect(after.has(tuple)).toBe(true);
  });

  it("respects fn constraints", () => {
    const factors = {
      A: [1, 2, 3, 4],
      B: [10, 20, 30, 40],
      C: ["x", "y"],
    };
    const constraints: Expression[] = [
      {
        operator: "fn",
        requires: ["A", "B"],
        evaluate: (row) => row.A + row.B / 10 !== 5, // forbid A + B/10 == 5
      },
    ];
    const rows = make(factors, { constraints });
    const before = coveredSet(rows, factors, 2);
    const smaller = new Controller(factors, { constraints }).optimize(rows, { budgetMs: 1500, seed: 13 });

    for (const row of smaller) {
      expect((row as any).A + (row as any).B / 10).not.toBe(5);
    }
    const after = coveredSet(smaller, factors, 2);
    for (const tuple of before) expect(after.has(tuple)).toBe(true);
  });
});

// -- strength 3 ------------------------------------------------------------

describe("optimize with strength 3", () => {
  it("reduces and preserves 3-wise coverage", () => {
    const factors = {
      A: ["a1", "a2", "a3"],
      B: ["b1", "b2", "b3"],
      C: ["c1", "c2", "c3"],
      D: ["d1", "d2"],
      E: ["e1", "e2"],
    };
    const strength = 3;
    const rows = make(factors, { strength });
    const smaller = new Controller(factors, { strength }).optimize(rows, { budgetMs: 2000, seed: 17 });

    expect(smaller.length).toBeLessThanOrEqual(rows.length);
    expectFullCoverage(smaller, factors, strength);
  });
});

// -- benchmarks (short budgets) -------------------------------------------

describe("optimize benchmarks", () => {
  const buildFactors = (spec: [number, number][]) => {
    // spec: [level, count][] -> object factors
    const factors: { [k: string]: any[] } = {};
    let f = 0;
    for (const [level, count] of spec) {
      for (let c = 0; c < count; c++) {
        factors[`f${f++}`] = range(0, level).map((v) => `v${v}`);
      }
    }
    return factors;
  };

  const cases: { name: string; spec: [number, number][]; budgetMs: number; target: number }[] = [
    { name: "3^4", spec: [[3, 4]], budgetMs: 2000, target: 12 },
    { name: "3^13", spec: [[3, 13]], budgetMs: 3000, target: 20 },
    { name: "2^100", spec: [[2, 100]], budgetMs: 3000, target: 14 },
  ];

  for (const { name, spec, budgetMs, target } of cases) {
    it(`${name}: reduces toward best-known and stays fully covered`, () => {
      const factors = buildFactors(spec);
      const rows = make(factors);
      const smaller = new Controller(factors).optimize(rows, { budgetMs, seed: 1 });

      expect(smaller.length).toBeLessThanOrEqual(rows.length);
      // every value pair present for each column pair
      expectFullCoverage(smaller, factors, 2);
      // should at least not exceed a loose upper bound near best-known
      expect(smaller.length).toBeLessThanOrEqual(target);
    });
  }
});
