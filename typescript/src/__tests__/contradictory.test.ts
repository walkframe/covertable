import { Controller } from '../controller';
import type { Condition } from '../types';

describe('contradictory constraints', () => {

  // The forward check's weakness: two unfilled factors jointly constrained.
  // A=1 → B∈{10,20}, each B value forces a different C,
  // and D has a constraint that depends on both B and C together.
  // IF B+C is odd THEN D=1000 (expressed via custom or structural constraint)
  it('joint dependency: B and C together determine D', () => {
    const factors = {
      A: [1, 2, 3],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: [1000, 2000],
      E: ['x', 'y', 'z'],
    };
    const constraints: Condition[] = [
      // A=1 → B∈{10,20}
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'A', value: 1 },
        { operator: 'in', field: 'B', values: [10, 20] },
      ]},
      // B=10 → C=100
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'B', value: 10 },
        { operator: 'eq', field: 'C', value: 100 },
      ]},
      // B=20 → C=200
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'B', value: 20 },
        { operator: 'eq', field: 'C', value: 200 },
      ]},
      // B=10 AND C=100 → D=1000
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'B', value: 10 },
        { operator: 'ne', field: 'C', value: 100 },
        { operator: 'eq', field: 'D', value: 1000 },
      ]},
      // B=20 AND C=200 → D=1000
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'B', value: 20 },
        { operator: 'ne', field: 'C', value: 200 },
        { operator: 'eq', field: 'D', value: 1000 },
      ]},
      // So when A=1, D must be 1000. Pair (A=1, D=2000) is infeasible.
      // But also add: D=1000 → E='x'
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'D', value: 1000 },
        { operator: 'eq', field: 'E', value: 'x' },
      ]},
      // Now (A=1, E='y') and (A=1, E='z') are also infeasible
      // because A=1 → B∈{10,20} → (B,C) forces D=1000 → E='x'
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();

    console.log('Joint dependency:', JSON.stringify({
      ...ctrl.stats, completions: undefined,
    }));

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs.map(u => u.pair));
    }

    // Verify no constraint violations
    for (const r of rows as any[]) {
      if (r.A === 1) expect([10, 20]).toContain(r.B);
      if (r.B === 10) expect(r.C).toBe(100);
      if (r.B === 20) expect(r.C).toBe(200);
      if (r.B === 10 && r.C === 100) expect(r.D).toBe(1000);
      if (r.B === 20 && r.C === 200) expect(r.D).toBe(1000);
      if (r.D === 1000) expect(r.E).toBe('x');
    }
  });
});
