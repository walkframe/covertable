import { Controller } from '../controller';
import { criteria } from '../index';

describe('salt sweep', () => {
  it('20x10 greedy salt 0-50', () => {
    const factors: Record<string, number[]> = {};
    for (let i = 0; i < 20; i++) {
      factors[`f${i}`] = Array.from({ length: 10 }, (_, j) => j);
    }

    let bestRows = Infinity;
    let bestSalt = 0;
    let bestTime = 0;

    for (let salt = 0; salt <= 50; salt++) {
      const t0 = Date.now();
      const ctrl = new Controller(factors, { criterion: criteria.greedy, salt });
      const rows = ctrl.make();
      const t1 = Date.now();
      if (rows.length < bestRows) {
        bestRows = rows.length;
        bestSalt = salt;
        bestTime = t1 - t0;
      }
    }

    console.log(`Best: salt=${bestSalt} rows=${bestRows} time=${bestTime}ms`);
  }, 300000);
});
