import { PictModel } from '../pict';
import * as fs from 'fs';
import * as path from 'path';

const HEAVY_PICT = path.resolve(__dirname, '../../../heavy.pict');

describe('heavy.pict covertable generation', () => {
  it('generates with forward checking and measures coverage', () => {
    const modelText = fs.readFileSync(HEAVY_PICT, 'utf-8');
    const model = new PictModel(modelText);
    const factors = model.parameters;
    const keys = Object.keys(factors);

    const t0 = Date.now();
    const rows = model.make();
    const t1 = Date.now();

    const stats = model.stats!;
    console.log(`Rows: ${rows.length}`);
    console.log(`Time: ${t1 - t0}ms`);
    console.log(`Stats:`, JSON.stringify({
      totalPairs: stats.totalPairs,
      prunedPairs: stats.prunedPairs,
      coveredPairs: stats.coveredPairs,
      progress: `${(stats.progress * 100).toFixed(1)}%`,
      rowCount: stats.rowCount,
      uncoveredPairs: stats.uncoveredPairs.length,
    }, null, 2));

    // Check constraint violations
    let violations = 0;
    for (const r of rows) {
      if (!model.filter(r)) {
        violations++;
      }
    }

    // Compute pairwise coverage
    const covered = new Set<string>();
    let totalPossible = 0;

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const ki = keys[i];
        const kj = keys[j];
        totalPossible += factors[ki].length * factors[kj].length;
        for (const row of rows) {
          covered.add(`${ki}=${(row as any)[ki]}|${kj}=${(row as any)[kj]}`);
        }
      }
    }

    let coveredCount = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        for (const vi of factors[keys[i]]) {
          for (const vj of factors[keys[j]]) {
            if (covered.has(`${keys[i]}=${vi}|${keys[j]}=${vj}`)) {
              coveredCount++;
            }
          }
        }
      }
    }

    const rawCoverage = coveredCount / totalPossible;
    console.log(`Raw coverage: ${(rawCoverage * 100).toFixed(1)}%`);

    expect(violations).toBe(0);
    expect(stats.progress).toBe(1);
    expect(rawCoverage).toBeGreaterThan(0.5);
  }, 120000);
});
