import { make } from '../index';
import { Constraint } from '../shortcuts';

const factors = {
  OS: ['Win', 'Mac', 'Linux'],
  Browser: ['Chrome', 'Firefox', 'Safari'],
  Price: [100, 500, 1000],
  Qty: [1, 2, 5],
};

const c = new Constraint<typeof factors>();

describe('Constraint shortcut', () => {
  describe('comparison', () => {
    it('eq with literal', () => {
      const cond = c.eq('$OS', 'Mac');
      expect(cond).toEqual({ operator: 'eq', left: 'OS', value: 'Mac' });
    });

    it('ne with field reference', () => {
      const cond = c.ne('$OS', '$Browser');
      expect(cond).toEqual({ operator: 'ne', left: 'OS', right: 'Browser' });
    });

    it('gt with number', () => {
      const cond = c.gt('$Price', 500);
      expect(cond).toEqual({ operator: 'gt', left: 'Price', value: 500 });
    });

    it('in with values', () => {
      const cond = c.in('$OS', ['Win', 'Mac']);
      expect(cond).toEqual({ operator: 'in', left: 'OS', values: ['Win', 'Mac'] });
    });
  });

  describe('logical', () => {
    it('and', () => {
      const cond = c.and(c.eq('$OS', '$Browser'), c.eq('$Browser', 'Safari'));
      expect(cond.operator).toBe('and');
      expect((cond as any).conditions).toHaveLength(2);
    });

    it('or', () => {
      const cond = c.or(c.eq('$OS', 'Mac'), c.eq('$OS', 'Win'));
      expect(cond.operator).toBe('or');
    });

    it('not', () => {
      const cond = c.not(c.eq('$OS', 'Linux'));
      expect(cond).toEqual({ operator: 'not', condition: { operator: 'eq', left: 'OS', value: 'Linux' } });
    });
  });

  describe('arithmetic', () => {
    it('mul builds expression', () => {
      const expr = c.mul('$Price', '$Qty');
      expect(expr).toEqual({ operator: 'mul', left: 'Price', right: 'Qty' });
    });

    it('add with literal', () => {
      const expr = c.add('$Price', 100);
      expect(expr).toEqual({ operator: 'add', left: 'Price', value: 100 });
    });

    it('nested arithmetic in comparison', () => {
      const cond = c.gt(c.mul('$Price', '$Qty'), 10000);
      expect(cond).toEqual({
        operator: 'gt',
        left: { operator: 'mul', left: 'Price', right: 'Qty' },
        value: 10000,
      });
    });

    it('sum folds left', () => {
      const expr = c.sum('$Price', '$Qty', 100);
      expect(expr).toEqual({
        operator: 'add',
        left: { operator: 'add', left: 'Price', right: 'Qty' },
        value: 100,
      });
    });

    it('product folds left', () => {
      const expr = c.product('$Price', '$Qty', 2);
      expect(expr).toEqual({
        operator: 'mul',
        left: { operator: 'mul', left: 'Price', right: 'Qty' },
        value: 2,
      });
    });

    it('sum requires at least 2 args', () => {
      expect(() => c.sum('$Price')).toThrow();
    });
  });

  describe('fn (custom)', () => {
    it('builds custom condition', () => {
      const evalFn = (row: any) => row.OS !== row.Browser;
      const cond = c.fn(['OS', 'Browser'], evalFn);
      expect(cond).toEqual({ operator: 'fn', requires: ['OS', 'Browser'], evaluate: evalFn });
    });
  });

  describe('integration with make()', () => {
    it('Safari only on Mac + Price*Qty <= 2500', () => {
      const rows = make(factors, {
        constraints: [
          c.or(c.ne('$Browser', 'Safari'), c.eq('$OS', 'Mac')),
          c.lte(c.mul('$Price', '$Qty'), 2500),
        ],
      });
      for (const row of rows) {
        const r = row as any;
        if (r.Browser === 'Safari') expect(r.OS).toBe('Mac');
        expect(r.Price * r.Qty).toBeLessThanOrEqual(2500);
      }
    });

    it('sum constraint', () => {
      const f2 = { A: [1, 2, 3], B: [1, 2, 3], C: [1, 2, 3] };
      const c2 = new Constraint<typeof f2>();
      const rows = make(f2, {
        constraints: [c2.lte(c2.sum('$A', '$B', '$C'), 6)],
      });
      for (const row of rows) {
        const r = row as any;
        expect(r.A + r.B + r.C).toBeLessThanOrEqual(6);
      }
    });
  });
});
