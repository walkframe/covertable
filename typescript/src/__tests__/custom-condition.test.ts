import { make } from '../index';
import { evaluate, extractKeys } from '../evaluate';
import type { Expression } from '../types';

describe('CustomExpression', () => {
  describe('evaluate()', () => {
    it('returns the result of the evaluate function when all fields are present', () => {
      const condition: Expression = {
        operator: 'fn',
        requires: ['A', 'B'],
        evaluate: (row) => row.A + row.B > 5,
      };
      expect(evaluate(condition, { A: 3, B: 4 })).toBe(true);
      expect(evaluate(condition, { A: 1, B: 2 })).toBe(false);
    });

    it('returns null when a referenced field is missing', () => {
      const condition: Expression = {
        operator: 'fn',
        requires: ['A', 'B'],
        evaluate: (row) => row.A !== row.B,
      };
      expect(evaluate(condition, { A: 1 })).toBeNull();
      expect(evaluate(condition, {})).toBeNull();
    });

    it('returns null when only some fields are present', () => {
      const condition: Expression = {
        operator: 'fn',
        requires: ['X', 'Y', 'Z'],
        evaluate: (row) => row.X + row.Y + row.Z === 6,
      };
      expect(evaluate(condition, { X: 1, Y: 2 })).toBeNull();
    });

    it('works with empty fields array (always evaluates)', () => {
      const condition: Expression = {
        operator: 'fn',
        requires: [],
        evaluate: () => true,
      };
      expect(evaluate(condition, {})).toBe(true);
    });
  });

  describe('extractKeys()', () => {
    it('extracts fields from a custom condition', () => {
      const condition: Expression = {
        operator: 'fn',
        requires: ['OS', 'Browser', 'Device'],
        evaluate: () => true,
      };
      expect(extractKeys(condition)).toEqual(new Set(['OS', 'Browser', 'Device']));
    });
  });

  describe('make() with custom constraints', () => {
    it('filters rows using a custom evaluate function', () => {
      const factors = {
        A: [1, 2, 3],
        B: [10, 20, 30],
      };
      const rows = make(factors, {
        constraints: [{
          operator: 'fn',
          requires: ['A', 'B'],
          evaluate: (row) => row.A * 10 === row.B,
        }],
      });
      for (const row of rows) {
        expect((row as any).A * 10).toBe((row as any).B);
      }
    });

    it('prunes infeasible pairs during initial pruning', () => {
      const factors = {
        X: ['a', 'b'],
        Y: ['c', 'd'],
        Z: ['e', 'f'],
      };
      const rows = make(factors, {
        constraints: [{
          operator: 'fn',
          requires: ['X', 'Y'],
          evaluate: (row) => !(row.X === 'a' && row.Y === 'c'),
        }],
      });
      for (const row of rows) {
        expect(!((row as any).X === 'a' && (row as any).Y === 'c')).toBe(true);
      }
    });

    it('works alongside declarative conditions', () => {
      const factors = {
        OS: ['Win', 'Mac', 'Linux'],
        Browser: ['Chrome', 'Firefox', 'Safari'],
        Lang: ['en', 'ja'],
      };
      const rows = make(factors, {
        constraints: [
          // Safari only on Mac (declarative)
          { operator: 'or', conditions: [
            { operator: 'ne', left: 'Browser', value: 'Safari' },
            { operator: 'eq', left: 'OS', value: 'Mac' },
          ]},
          // Custom: ja only with Chrome
          {
            operator: 'fn',
            requires: ['Browser', 'Lang'],
            evaluate: (row) => row.Lang !== 'ja' || row.Browser === 'Chrome',
          },
        ],
      });
      for (const row of rows) {
        const r = row as any;
        if (r.Browser === 'Safari') expect(r.OS).toBe('Mac');
        if (r.Lang === 'ja') expect(r.Browser).toBe('Chrome');
      }
    });

    it('custom condition inside logical operators', () => {
      const factors = {
        A: [1, 2, 3],
        B: [1, 2, 3],
      };
      const rows = make(factors, {
        constraints: [{
          operator: 'or',
          conditions: [
            { operator: 'eq', left: 'A', value: 1 },
            {
              operator: 'fn',
              requires: ['B'],
              evaluate: (row) => row.B >= 2,
            },
          ],
        }],
      });
      for (const row of rows) {
        const r = row as any;
        expect(r.A === 1 || r.B >= 2).toBe(true);
      }
    });
  });
});
