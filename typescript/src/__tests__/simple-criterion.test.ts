import { Controller } from '../controller';
import { criteria } from '../index';
import type { Condition } from '../types';

const runWithSimple = (factors: any, constraints: Condition[]) => {
  const ctrl = new Controller(factors, { constraints, criterion: criteria.simple });
  const rows = ctrl.make();
  return { rows, stats: ctrl.stats };
};

describe('simple criterion with constraints', () => {

  it('3-level chain', () => {
    const factors = {
      A: [1, 2, 3],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: [1000, 2000, 3000],
    };
    const constraints: Condition[] = [
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'A', value: 1 },
        { operator: 'eq', field: 'B', value: 10 },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'B', value: 10 },
        { operator: 'eq', field: 'C', value: 100 },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'C', value: 100 },
        { operator: 'eq', field: 'D', value: 1000 },
      ]},
    ];
    const { rows, stats } = runWithSimple(factors, constraints);
    console.log('3-level simple:', { rowCount: stats.rowCount, progress: stats.progress, pruned: stats.prunedPairs });
    for (const r of rows as any[]) {
      if (r.A === 1) expect(r.B).toBe(10);
      if (r.B === 10) expect(r.C).toBe(100);
      if (r.C === 100) expect(r.D).toBe(1000);
    }
    expect(stats.progress).toBe(1);
  });

  it('6-level deep chain', () => {
    const factors = {
      A: [1, 2, 3],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: [1000, 2000, 3000],
      E: ['α', 'β', 'γ'],
      F: ['X', 'Y', 'Z'],
    };
    const constraints: Condition[] = [
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'A', value: 1 },
        { operator: 'in', field: 'B', values: [10, 20] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'in', field: 'B', values: [30] },
        { operator: 'in', field: 'C', values: [100, 200] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'in', field: 'C', values: [300] },
        { operator: 'eq', field: 'D', value: 1000 },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'D', value: 1000 },
        { operator: 'in', field: 'E', values: ['α', 'β'] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'in', field: 'E', values: ['γ'] },
        { operator: 'eq', field: 'F', value: 'X' },
      ]},
    ];
    const { rows, stats } = runWithSimple(factors, constraints);
    console.log('6-level simple:', { rowCount: stats.rowCount, progress: stats.progress, pruned: stats.prunedPairs });
    for (const r of rows as any[]) {
      if (r.A === 1) expect([10, 20]).toContain(r.B);
      if ([10, 20].includes(r.B)) expect([100, 200]).toContain(r.C);
      if ([100, 200].includes(r.C)) expect(r.D).toBe(1000);
      if (r.D === 1000) expect(['α', 'β']).toContain(r.E);
      if (['α', 'β'].includes(r.E)) expect(r.F).toBe('X');
    }
    expect(stats.progress).toBe(1);
  });

  it('all-different', () => {
    const vals = [1, 2, 3, 4];
    const factors = { A: vals, B: vals, C: vals, D: vals };
    const constraints: Condition[] = [
      { operator: 'ne', field: 'A', target: 'B' },
      { operator: 'ne', field: 'A', target: 'C' },
      { operator: 'ne', field: 'A', target: 'D' },
      { operator: 'ne', field: 'B', target: 'C' },
      { operator: 'ne', field: 'B', target: 'D' },
      { operator: 'ne', field: 'C', target: 'D' },
    ];
    const { rows, stats } = runWithSimple(factors, constraints);
    console.log('all-different simple:', { rowCount: stats.rowCount, progress: stats.progress, pruned: stats.prunedPairs });
    for (const r of rows as any[]) {
      expect(new Set([r.A, r.B, r.C, r.D]).size).toBe(4);
    }
    expect(stats.progress).toBe(1);
  });

  it('mixed chains and field comparisons', () => {
    const factors = {
      Priority: ['low', 'medium', 'high', 'critical'],
      Assignee: ['alice', 'bob', 'carol'],
      Reviewer: ['alice', 'bob', 'carol'],
      Environment: ['dev', 'staging', 'prod'],
      Approval: ['none', 'lead', 'director'],
    };
    const constraints: Condition[] = [
      { operator: 'ne', field: 'Assignee', target: 'Reviewer' },
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Priority', value: 'critical' },
        { operator: 'eq', field: 'Environment', value: 'prod' },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Environment', value: 'prod' },
        { operator: 'eq', field: 'Approval', value: 'director' },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Priority', value: 'high' },
        { operator: 'in', field: 'Environment', values: ['staging', 'prod'] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Environment', value: 'staging' },
        { operator: 'in', field: 'Approval', values: ['lead', 'director'] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Priority', value: 'low' },
        { operator: 'eq', field: 'Approval', value: 'none' },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Priority', value: 'low' },
        { operator: 'eq', field: 'Environment', value: 'dev' },
      ]},
    ];
    const { rows, stats } = runWithSimple(factors, constraints);
    console.log('mixed simple:', { rowCount: stats.rowCount, progress: stats.progress, pruned: stats.prunedPairs });
    for (const r of rows as any[]) {
      expect(r.Assignee).not.toBe(r.Reviewer);
      if (r.Priority === 'critical') expect(r.Environment).toBe('prod');
      if (r.Environment === 'prod') expect(r.Approval).toBe('director');
      if (r.Priority === 'low') { expect(r.Approval).toBe('none'); expect(r.Environment).toBe('dev'); }
    }
    expect(stats.progress).toBe(1);
  });

  it('heavy.pict', () => {
    const fs = require('fs');
    const path = require('path');
    const { PictModel } = require('../pict');
    const modelText = fs.readFileSync(
      path.resolve(__dirname, '../../../heavy.pict'), 'utf-8',
    );
    const model = new PictModel(modelText);
    const ctrl = new Controller(model.parameters, {
      ...model._buildOptions(),
      criterion: criteria.simple,
    } as any);
    const rows = ctrl.make();
    console.log('heavy.pict simple:', {
      rowCount: ctrl.stats.rowCount,
      progress: ctrl.stats.progress,
      pruned: ctrl.stats.prunedPairs,
      uncovered: ctrl.stats.uncoveredPairs.length,
    });
    for (const r of rows) {
      expect(model.filter(r)).toBe(true);
    }
    expect(ctrl.stats.progress).toBe(1);
  }, 120000);
});
