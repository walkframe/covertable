import { make } from '../index';
import type { Condition } from '../types';

describe('forward checking (constraint chain propagation)', () => {
  it('respects transitive constraint chain: Language=de → Region=EU → Currency∈{EUR,GBP}', () => {
    const factors = {
      Language: ['de', 'en', 'ja', 'fr', 'es'],
      Region: ['EU', 'NA', 'AP', 'SA'],
      Currency: ['EUR', 'USD', 'GBP', 'JPY', 'BRL'],
      OS: ['Windows', 'macOS', 'Linux'],
      Browser: ['Chrome', 'Firefox', 'Safari', 'Edge'],
    };

    const constraints: Condition[] = [
      // IF Language=de THEN Region=EU
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Language', value: 'de' },
        { operator: 'eq', field: 'Region', value: 'EU' },
      ]},
      // IF Region=EU THEN Currency IN {EUR, GBP}
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'Region', value: 'EU' },
        { operator: 'in', field: 'Currency', values: ['EUR', 'GBP'] },
      ]},
    ];

    const rows = make(factors, { constraints });

    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      if (r.Language === 'de') {
        expect(r.Region).toBe('EU');
      }
      if (r.Region === 'EU') {
        expect(['EUR', 'GBP']).toContain(r.Currency);
      }
    }
  });

  it('handles 3-level chain: A→B→C→D', () => {
    const factors = {
      A: [1, 2, 3],
      B: [10, 20, 30],
      C: [100, 200, 300],
      D: [1000, 2000, 3000],
    };

    const constraints: Condition[] = [
      // IF A=1 THEN B=10
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'A', value: 1 },
        { operator: 'eq', field: 'B', value: 10 },
      ]},
      // IF B=10 THEN C=100
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'B', value: 10 },
        { operator: 'eq', field: 'C', value: 100 },
      ]},
      // IF C=100 THEN D=1000
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'C', value: 100 },
        { operator: 'eq', field: 'D', value: 1000 },
      ]},
    ];

    const rows = make(factors, { constraints });
    expect(rows.length).toBeGreaterThan(0);

    for (const r of rows) {
      if (r.A === 1) expect(r.B).toBe(10);
      if (r.B === 10) expect(r.C).toBe(100);
      if (r.C === 100) expect(r.D).toBe(1000);
    }
  });

  it('does not over-prune: unconstrained combinations remain valid', () => {
    const factors = {
      A: [1, 2],
      B: [10, 20],
      C: [100, 200],
    };

    const constraints: Condition[] = [
      // IF A=1 THEN B=10
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'A', value: 1 },
        { operator: 'eq', field: 'B', value: 10 },
      ]},
    ];

    const rows = make(factors, { constraints });

    // A=2 should still pair freely with B=20 and any C
    const a2b20 = rows.some(r => r.A === 2 && r.B === 20);
    expect(a2b20).toBe(true);

    // A=1 must always have B=10
    for (const r of rows) {
      if (r.A === 1) expect(r.B).toBe(10);
    }
  });
});
