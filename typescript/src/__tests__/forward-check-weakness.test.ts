import { make, Controller, NeverMatch } from '../index';
import type { Expression } from '../types';

describe('forward check weakness cases', () => {

  // Case 1: Domain stays at 2 values, but both conflict with a third factor.
  // A=1 → B∈{10,20}, B=10 → C=100, B=20 → C=200
  // Pair (A=1, C=300) is infeasible: B must be 10 or 20, but both force C≠300.
  // Forward check can't detect this because B doesn't narrow to 1 value.
  it('two-branch: A=1→B∈{10,20}, B=10→C=100, B=20→C=200', () => {
    const factors = {
      A: [1, 2],
      B: [10, 20, 30],
      C: [100, 200, 300],
    };

    const constraints: Expression[] = [
      // IF A=1 THEN B IN {10, 20}
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'in', left: 'B', values: [10, 20] },
      ]},
      // IF B=10 THEN C=100
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'B', value: 10 },
        { operator: 'eq', left: 'C', value: 100 },
      ]},
      // IF B=20 THEN C=200
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'B', value: 20 },
        { operator: 'eq', left: 'C', value: 200 },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();

    console.log('Case 1 - two-branch:');
    console.log('  stats:', JSON.stringify(ctrl.stats, null, 2));

    // Verify constraints
    for (const r of rows as any[]) {
      if (r.A === 1) expect([10, 20]).toContain(r.B);
      if (r.B === 10) expect(r.C).toBe(100);
      if (r.B === 20) expect(r.C).toBe(200);
    }

    // (A=1, C=300) is infeasible — should be pruned or reported
    // Either progress is 100% or uncoveredPairs reports the infeasible pair
    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
      // The only uncoverable pair should involve A=1,C=300
      for (const up of ctrl.stats.uncoveredPairs) {
        expect(up.pair).toHaveProperty('A');
        expect(up.pair).toHaveProperty('C');
      }
    } else {
      expect(ctrl.stats.progress).toBe(1);
    }
  });

  // Case 2: Two unfilled factors jointly constrained.
  // IF A=1 AND B=10 THEN C=100
  // Pair (A=1, C=200) is feasible (just need B≠10), but forward check
  // might not see the interaction since B is unfilled.
  it('joint condition: IF A=1 AND B=10 THEN C=100', () => {
    const factors = {
      A: [1, 2],
      B: [10, 20],
      C: [100, 200],
    };

    const constraints: Expression[] = [
      // IF A=1 AND B=10 THEN C=100
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'ne', left: 'B', value: 10 },
        { operator: 'eq', left: 'C', value: 100 },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();

    console.log('Case 2 - joint condition:');
    console.log('  stats:', JSON.stringify({
      ...ctrl.stats,
      completions: undefined,
    }));

    for (const r of rows as any[]) {
      if (r.A === 1 && r.B === 10) expect(r.C).toBe(100);
    }

    // (A=1, C=200) IS feasible (with B=20), so it must be covered
    const a1c200 = (rows as any[]).some(r => r.A === 1 && r.C === 200);
    expect(a1c200).toBe(true);
    expect(ctrl.stats.progress).toBe(1);
  });

  // Case 3: Diamond dependency.
  // A=1 → B=10, A=1 → C=100, B=10 AND C=100 → D=1000
  // Pair (A=1, D=2000) is infeasible because A=1 forces B=10 and C=100,
  // which together force D=1000.
  it('diamond: A→B, A→C, B+C→D', () => {
    const factors = {
      A: [1, 2],
      B: [10, 20],
      C: [100, 200],
      D: [1000, 2000],
    };

    const constraints: Expression[] = [
      // IF A=1 THEN B=10
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'eq', left: 'B', value: 10 },
      ]},
      // IF A=1 THEN C=100
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'eq', left: 'C', value: 100 },
      ]},
      // IF B=10 AND C=100 THEN D=1000
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'B', value: 10 },
        { operator: 'ne', left: 'C', value: 100 },
        { operator: 'eq', left: 'D', value: 1000 },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();

    console.log('Case 3 - diamond:');
    console.log('  stats:', JSON.stringify({
      ...ctrl.stats,
      completions: undefined,
    }));

    for (const r of rows as any[]) {
      if (r.A === 1) { expect(r.B).toBe(10); expect(r.C).toBe(100); }
      if (r.B === 10 && r.C === 100) expect(r.D).toBe(1000);
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    } else {
      expect(ctrl.stats.progress).toBe(1);
    }
  });

  // Case 4: Mutual exclusion via separate constraints.
  // IF A=1 THEN B≠10, IF A=1 THEN B≠20 → B must be 30 when A=1.
  // Forward check should narrow B to {30} via elimination.
  it('elimination: A=1 excludes B=10 and B=20, forcing B=30', () => {
    const factors = {
      A: [1, 2],
      B: [10, 20, 30],
      C: [100, 200],
    };

    const constraints: Expression[] = [
      // IF A=1 THEN B<>10
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'ne', left: 'B', value: 10 },
      ]},
      // IF A=1 THEN B<>20
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'ne', left: 'B', value: 20 },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();

    console.log('Case 4 - elimination:');
    console.log('  stats:', JSON.stringify({
      ...ctrl.stats,
      completions: undefined,
    }));

    for (const r of rows as any[]) {
      if (r.A === 1) expect(r.B).toBe(30);
    }

    expect(ctrl.stats.progress).toBe(1);
  });

  // Case 5: Longer chain with 2-value domain at intermediate step.
  // A=1 → B∈{10,20}, B∈{10,20} → C∈{100,200}, C∈{100,200} → D=1000
  // Pair (A=1, D=2000) is infeasible through the chain.
  // B narrows to {10,20} (not 1), so standard forward check can't propagate further.
  it('chain with 2-value bottleneck', () => {
    const factors = {
      A: [1, 2],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: [1000, 2000],
    };

    const constraints: Expression[] = [
      // IF A=1 THEN B IN {10, 20}
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'in', left: 'B', values: [10, 20] },
      ]},
      // IF B IN {10, 20} THEN C IN {100, 200}
      { operator: 'or', conditions: [
        { operator: 'in', left: 'B', values: [30] },
        { operator: 'in', left: 'C', values: [100, 200] },
      ]},
      // IF C IN {100, 200} THEN D=1000
      { operator: 'or', conditions: [
        { operator: 'in', left: 'C', values: [300] },
        { operator: 'eq', left: 'D', value: 1000 },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();

    console.log('Case 5 - chain with bottleneck:');
    console.log('  stats:', JSON.stringify({
      ...ctrl.stats,
      completions: undefined,
    }));

    for (const r of rows as any[]) {
      if (r.A === 1) expect([10, 20]).toContain(r.B);
      if ([10, 20].includes(r.B)) expect([100, 200]).toContain(r.C);
      if ([100, 200].includes(r.C)) expect(r.D).toBe(1000);
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    } else {
      expect(ctrl.stats.progress).toBe(1);
    }
  });
});
