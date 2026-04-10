import { PictModel } from '../pict';
import * as fs from 'fs';
import * as path from 'path';

describe('heavy.pict covertable generation', () => {
  it('generates with forward checking and measures coverage', () => {
    const modelText = fs.readFileSync(
      path.resolve(__dirname, '../../../heavy.pict'),
      'utf-8',
    );
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
    // Show top completions (factors most filled by close)
    const compEntries = Object.entries(stats.completions)
      .map(([k, v]) => [k, Object.values(v).reduce((a, b) => a + b, 0)] as [string, number])
      .sort((a, b) => b[1] - a[1]);
    console.log(`Top completions:`, compEntries.slice(0, 5));
    console.log(`All completions:`, JSON.stringify(stats.completions, null, 2));

    // Check constraint violations
    let violations = 0;
    for (const r of rows) {
      if (!model.filter(r)) {
        violations++;
      }
    }
    console.log(`Constraint violations: ${violations}`);

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
        const ki = keys[i];
        const kj = keys[j];
        for (const vi of factors[ki]) {
          for (const vj of factors[kj]) {
            if (covered.has(`${ki}=${vi}|${kj}=${vj}`)) {
              coveredCount++;
            }
          }
        }
      }
    }

    const rawCoverage = coveredCount / totalPossible;
    console.log(`Total possible pairs: ${totalPossible}`);
    console.log(`Covered pairs: ${coveredCount}`);
    console.log(`Raw coverage: ${(rawCoverage * 100).toFixed(1)}%`);

    expect(violations).toBe(0);
    expect(rawCoverage).toBeGreaterThan(0.5);
  }, 120000);
});
