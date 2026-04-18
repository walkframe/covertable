import { Controller } from '../controller';
import type { Expression } from '../types';

describe('forward check complex cases', () => {

  // Case 1: Deep chain (6 levels) with mixed narrowing.
  // A=1→B∈{10,20}→C∈{100,200}→D∈{1000}→E∈{α,β}→F=X
  // Many intermediate 2-value domains.
  it('6-level deep chain with mixed narrowing', () => {
    const factors = {
      A: [1, 2, 3],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: [1000, 2000, 3000],
      E: ['α', 'β', 'γ'],
      F: ['X', 'Y', 'Z'],
    };

    const constraints: Expression[] = [
      // A=1 → B∈{10,20}
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'in', left: 'B', values: [10, 20] },
      ]},
      // B∈{10,20} → C∈{100,200}
      { operator: 'or', conditions: [
        { operator: 'in', left: 'B', values: [30] },
        { operator: 'in', left: 'C', values: [100, 200] },
      ]},
      // C∈{100,200} → D=1000
      { operator: 'or', conditions: [
        { operator: 'in', left: 'C', values: [300] },
        { operator: 'eq', left: 'D', value: 1000 },
      ]},
      // D=1000 → E∈{α,β}
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'D', value: 1000 },
        { operator: 'in', left: 'E', values: ['α', 'β'] },
      ]},
      // E∈{α,β} → F=X
      { operator: 'or', conditions: [
        { operator: 'in', left: 'E', values: ['γ'] },
        { operator: 'eq', left: 'F', value: 'X' },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();
    console.log('Case 1 - 6-level:', JSON.stringify({
      ...ctrl.stats, completions: undefined,
    }));

    for (const r of rows as any[]) {
      if (r.A === 1) expect([10, 20]).toContain(r.B);
      if ([10, 20].includes(r.B)) expect([100, 200]).toContain(r.C);
      if ([100, 200].includes(r.C)) expect(r.D).toBe(1000);
      if (r.D === 1000) expect(['α', 'β']).toContain(r.E);
      if (['α', 'β'].includes(r.E)) expect(r.F).toBe('X');
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    }
    expect(ctrl.stats.progress).toBe(1);
  });

  // Case 2: Multiple independent constraint chains crossing the same factors.
  // Chain 1: A=1→B=10→C=100
  // Chain 2: D=α→B=20→E=X
  // B is shared: A=1 forces B=10, D=α forces B=20. (A=1, D=α) is infeasible.
  it('crossing chains sharing a factor', () => {
    const factors = {
      A: [1, 2, 3],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: ['α', 'β', 'γ'],
      E: ['X', 'Y', 'Z'],
    };

    const constraints: Expression[] = [
      // A=1 → B=10
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'eq', left: 'B', value: 10 },
      ]},
      // B=10 → C=100
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'B', value: 10 },
        { operator: 'eq', left: 'C', value: 100 },
      ]},
      // D=α → B=20
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'D', value: 'α' },
        { operator: 'eq', left: 'B', value: 20 },
      ]},
      // B=20 → E=X
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'B', value: 20 },
        { operator: 'eq', left: 'E', value: 'X' },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();
    console.log('Case 2 - crossing chains:', JSON.stringify({
      ...ctrl.stats, completions: undefined,
    }));

    for (const r of rows as any[]) {
      if (r.A === 1) expect(r.B).toBe(10);
      if (r.B === 10) expect(r.C).toBe(100);
      if (r.D === 'α') expect(r.B).toBe(20);
      if (r.B === 20) expect(r.E).toBe('X');
      // A=1 and D=α can't coexist
      expect(!(r.A === 1 && r.D === 'α')).toBe(true);
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    }
    expect(ctrl.stats.progress).toBe(1);
  });

  // Case 3: Web of mutual exclusions creating a Sudoku-like constraint.
  // 4 factors, each with values {1,2,3,4}. No two factors may have the same value.
  it('all-different: 4 factors must have distinct values', () => {
    const vals = [1, 2, 3, 4];
    const factors = { A: vals, B: vals, C: vals, D: vals };

    const constraints: Expression[] = [
      { operator: 'ne', left: 'A', right: 'B' },
      { operator: 'ne', left: 'A', right: 'C' },
      { operator: 'ne', left: 'A', right: 'D' },
      { operator: 'ne', left: 'B', right: 'C' },
      { operator: 'ne', left: 'B', right: 'D' },
      { operator: 'ne', left: 'C', right: 'D' },
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();
    console.log('Case 3 - all-different:', JSON.stringify({
      ...ctrl.stats, completions: undefined,
    }));

    for (const r of rows as any[]) {
      const vs = [r.A, r.B, r.C, r.D];
      expect(new Set(vs).size).toBe(4);
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    }
    expect(ctrl.stats.progress).toBe(1);
  });

  // Case 4: Bidirectional implications creating equivalence classes.
  // A=1↔B=10, B=10↔C=100, forming equivalence: {A=1, B=10, C=100} or none.
  // Plus D and E as free factors to make pairs interesting.
  it('bidirectional equivalence class', () => {
    const factors = {
      A: [1, 2, 3],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: ['x', 'y'],
      E: ['p', 'q'],
    };

    const constraints: Expression[] = [
      // A=1 → B=10
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'A', value: 1 },
        { operator: 'eq', left: 'B', value: 10 },
      ]},
      // B=10 → A=1
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'B', value: 10 },
        { operator: 'eq', left: 'A', value: 1 },
      ]},
      // B=10 → C=100
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'B', value: 10 },
        { operator: 'eq', left: 'C', value: 100 },
      ]},
      // C=100 → B=10
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'C', value: 100 },
        { operator: 'eq', left: 'B', value: 10 },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();
    console.log('Case 4 - bidirectional:', JSON.stringify({
      ...ctrl.stats, completions: undefined,
    }));

    for (const r of rows as any[]) {
      // Equivalence: A=1 ↔ B=10 ↔ C=100
      if (r.A === 1) { expect(r.B).toBe(10); expect(r.C).toBe(100); }
      if (r.B === 10) { expect(r.A).toBe(1); expect(r.C).toBe(100); }
      if (r.C === 100) { expect(r.A).toBe(1); expect(r.B).toBe(10); }
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    }
    expect(ctrl.stats.progress).toBe(1);
  });

  // Case 5: Cascading exclusions — each factor value excludes multiple
  // values from the next factor, creating a narrowing funnel.
  // 5 factors with 5 values each. Heavy constraint web.
  it('cascading exclusion funnel (5x5)', () => {
    const factors = {
      A: [1, 2, 3, 4, 5],
      B: [1, 2, 3, 4, 5],
      C: [1, 2, 3, 4, 5],
      D: [1, 2, 3, 4, 5],
      E: [1, 2, 3, 4, 5],
    };

    const constraints: Expression[] = [
      // A excludes its own value from B
      { operator: 'ne', left: 'A', right: 'B' },
      // B excludes its own value from C
      { operator: 'ne', left: 'B', right: 'C' },
      // C excludes its own value from D
      { operator: 'ne', left: 'C', right: 'D' },
      // D excludes its own value from E
      { operator: 'ne', left: 'D', right: 'E' },
      // Additionally: A value also can't equal C (skip one)
      { operator: 'ne', left: 'A', right: 'C' },
      // B value also can't equal D
      { operator: 'ne', left: 'B', right: 'D' },
      // C value also can't equal E
      { operator: 'ne', left: 'C', right: 'E' },
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();
    console.log('Case 5 - cascading exclusion:', JSON.stringify({
      ...ctrl.stats, completions: undefined,
    }));

    for (const r of rows as any[]) {
      expect(r.A).not.toBe(r.B);
      expect(r.B).not.toBe(r.C);
      expect(r.C).not.toBe(r.D);
      expect(r.D).not.toBe(r.E);
      expect(r.A).not.toBe(r.C);
      expect(r.B).not.toBe(r.D);
      expect(r.C).not.toBe(r.E);
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    }
    expect(ctrl.stats.progress).toBe(1);
  });

  // Case 6: Mix of IF-THEN chains and field-to-field comparisons.
  // Simulates a realistic scenario with both kinds.
  it('mixed chains and field comparisons', () => {
    const factors = {
      Priority: ['low', 'medium', 'high', 'critical'],
      Assignee: ['alice', 'bob', 'carol'],
      Reviewer: ['alice', 'bob', 'carol'],
      Environment: ['dev', 'staging', 'prod'],
      Approval: ['none', 'lead', 'director'],
    };

    const constraints: Expression[] = [
      // Assignee != Reviewer
      { operator: 'ne', left: 'Assignee', right: 'Reviewer' },
      // critical → prod
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Priority', value: 'critical' },
        { operator: 'eq', left: 'Environment', value: 'prod' },
      ]},
      // prod → director approval
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Environment', value: 'prod' },
        { operator: 'eq', left: 'Approval', value: 'director' },
      ]},
      // high → staging or prod
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Priority', value: 'high' },
        { operator: 'in', left: 'Environment', values: ['staging', 'prod'] },
      ]},
      // staging → lead or director approval
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Environment', value: 'staging' },
        { operator: 'in', left: 'Approval', values: ['lead', 'director'] },
      ]},
      // low → no approval needed
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Priority', value: 'low' },
        { operator: 'eq', left: 'Approval', value: 'none' },
      ]},
      // low → dev only
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Priority', value: 'low' },
        { operator: 'eq', left: 'Environment', value: 'dev' },
      ]},
    ];

    const ctrl = new Controller(factors, { constraints });
    const rows = ctrl.make();
    console.log('Case 6 - mixed:', JSON.stringify({
      ...ctrl.stats, completions: undefined,
    }));

    for (const r of rows as any[]) {
      expect(r.Assignee).not.toBe(r.Reviewer);
      if (r.Priority === 'critical') expect(r.Environment).toBe('prod');
      if (r.Environment === 'prod') expect(r.Approval).toBe('director');
      if (r.Priority === 'high') expect(['staging', 'prod']).toContain(r.Environment);
      if (r.Environment === 'staging') expect(['lead', 'director']).toContain(r.Approval);
      if (r.Priority === 'low') { expect(r.Approval).toBe('none'); expect(r.Environment).toBe('dev'); }
    }

    if (ctrl.stats.uncoveredPairs.length > 0) {
      console.log('  uncovered:', ctrl.stats.uncoveredPairs);
    }
    expect(ctrl.stats.progress).toBe(1);
  });
});
