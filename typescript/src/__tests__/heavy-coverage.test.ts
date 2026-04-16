import { PictModel } from '../pict';
import * as fs from 'fs';
import * as path from 'path';

const HEAVY_PICT = path.resolve(__dirname, '../../../heavy.pict');

describe('heavy.pict coverage check', () => {
  it('checks pairwise coverage of generated output', () => {
    const modelText = fs.readFileSync(HEAVY_PICT, 'utf-8');
    const model = new PictModel(modelText);
    const factors = model.parameters;
    const keys = Object.keys(factors);

    const rows = model.make();
    console.log(`Rows: ${rows.length}`);

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
    console.log(`Total possible pairs: ${totalPossible}`);
    console.log(`Covered pairs: ${coveredCount}`);
    console.log(`Raw coverage: ${(rawCoverage * 100).toFixed(1)}%`);
    console.log(`Uncovered: ${totalPossible - coveredCount}`);

    expect(violations).toBe(0);
    expect(rawCoverage).toBeGreaterThan(0.5);
  }, 120000);
});
