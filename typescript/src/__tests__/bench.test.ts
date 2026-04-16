import { Controller } from '../controller';
import { criteria, sorters } from '../index';
import { PictModel } from '../pict';
import * as fs from 'fs';
import * as path from 'path';

const bench = (name: string, fn: () => any, iterations = 5) => {
  const times: number[] = [];
  let result: any;
  for (let i = 0; i < iterations; i++) {
    const t0 = Date.now();
    result = fn();
    times.push(Date.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const min = times[0];
  const max = times[times.length - 1];
  console.log(`${name}: median=${median}ms min=${min}ms max=${max}ms`);
  return result;
};

describe('benchmarks', () => {
  it('20x10 no constraints (greedy)', () => {
    const factors: Record<string, number[]> = {};
    for (let i = 0; i < 20; i++) {
      factors[`f${i}`] = Array.from({ length: 10 }, (_, j) => j);
    }
    const result = bench('20x10 greedy', () => {
      const ctrl = new Controller(factors, { criterion: criteria.greedy });
      const rows = ctrl.make();
      return { rows: rows.length, stats: ctrl.stats };
    });
    console.log(`  rows: ${result.rows}`);
  });

  it('20x10 no constraints (simple)', () => {
    const factors: Record<string, number[]> = {};
    for (let i = 0; i < 20; i++) {
      factors[`f${i}`] = Array.from({ length: 10 }, (_, j) => j);
    }
    const result = bench('20x10 simple', () => {
      const ctrl = new Controller(factors, { criterion: criteria.simple });
      const rows = ctrl.make();
      return { rows: rows.length, stats: ctrl.stats };
    });
    console.log(`  rows: ${result.rows}`);
  });

  it('heavy.pict (greedy)', () => {
    const modelText = fs.readFileSync(
      path.resolve(__dirname, '../../../heavy.pict'), 'utf-8',
    );
    const result = bench('heavy.pict greedy', () => {
      const model = new PictModel(modelText);
      const rows = model.make();
      return { rows: rows.length, stats: model.stats };
    });
    console.log(`  rows: ${result.rows}, progress: ${result.stats?.progress}`);
  });

  it('heavy.pict (simple)', () => {
    const modelText = fs.readFileSync(
      path.resolve(__dirname, '../../../heavy.pict'), 'utf-8',
    );
    const result = bench('heavy.pict simple', () => {
      const model = new PictModel(modelText);
      const ctrl = new Controller(model.parameters, {
        ...(model as any)._buildOptions(),
        criterion: criteria.simple,
      });
      const rows = ctrl.make();
      return { rows: rows.length, stats: ctrl.stats };
    });
    console.log(`  rows: ${result.rows}, progress: ${result.stats?.progress}`);
  });

  it('5x5 all-different (greedy)', () => {
    const vals = [1, 2, 3, 4, 5];
    const factors = { A: vals, B: vals, C: vals, D: vals, E: vals };
    const constraints = [
      { operator: 'ne' as const, field: 'A', target: 'B' },
      { operator: 'ne' as const, field: 'A', target: 'C' },
      { operator: 'ne' as const, field: 'A', target: 'D' },
      { operator: 'ne' as const, field: 'A', target: 'E' },
      { operator: 'ne' as const, field: 'B', target: 'C' },
      { operator: 'ne' as const, field: 'B', target: 'D' },
      { operator: 'ne' as const, field: 'B', target: 'E' },
      { operator: 'ne' as const, field: 'C', target: 'D' },
      { operator: 'ne' as const, field: 'C', target: 'E' },
      { operator: 'ne' as const, field: 'D', target: 'E' },
    ];
    const result = bench('5x5 all-diff greedy', () => {
      const ctrl = new Controller(factors, { constraints, criterion: criteria.greedy });
      const rows = ctrl.make();
      return { rows: rows.length, stats: ctrl.stats };
    });
    console.log(`  rows: ${result.rows}, pruned: ${result.stats.prunedPairs}`);
  });
});
