import { Controller } from '../controller';
import { criteria } from '../index';
import { combinations, unique } from '../lib';
import type { FactorsType, PairByKeyType, PairType, ScalarType } from '../types';

describe('profile 20x10 greedy no constraints', () => {
  const makeFactors = () => {
    const factors: Record<string, number[]> = {};
    for (let i = 0; i < 20; i++) {
      factors[`f${i}`] = Array.from({ length: 10 }, (_, j) => j);
    }
    return factors;
  };

  it('instruments key methods (setPair, close, consumePairs, etc.)', () => {
    const factors = makeFactors();

    let setPairCalls = 0;
    let closeCalls = 0;
    let closeTime = 0;
    let setPairTime = 0;
    let consumePairsTime = 0;
    let recordCompletionsTime = 0;
    let closeSuccesses = 0;
    let closeFailures = 0;

    const origSetPair = (Controller.prototype as any).setPair;
    (Controller.prototype as any).setPair = function (...args: any[]) {
      setPairCalls++;
      const t0 = Date.now();
      const result = origSetPair.apply(this, args);
      setPairTime += Date.now() - t0;
      return result;
    };

    const origClose = (Controller.prototype as any).close;
    (Controller.prototype as any).close = function (...args: any[]) {
      closeCalls++;
      const t0 = Date.now();
      const result = origClose.apply(this, args);
      closeTime += Date.now() - t0;
      if (result === true) closeSuccesses++;
      else closeFailures++;
      return result;
    };

    const origConsumePairs = (Controller.prototype as any).consumePairs;
    (Controller.prototype as any).consumePairs = function (...args: any[]) {
      const t0 = Date.now();
      const result = origConsumePairs.apply(this, args);
      consumePairsTime += Date.now() - t0;
      return result;
    };

    const origRecordCompletions = (Controller.prototype as any).recordCompletions;
    (Controller.prototype as any).recordCompletions = function (...args: any[]) {
      const t0 = Date.now();
      const result = origRecordCompletions.apply(this, args);
      recordCompletionsTime += Date.now() - t0;
      return result;
    };

    const totalStart = Date.now();
    const ctrl = new Controller(factors, { criterion: criteria.greedy });
    const ctorTime = Date.now() - totalStart;

    const makeStart = Date.now();
    const rows = ctrl.make();
    const totalMakeTime = Date.now() - makeStart;

    const greedyEstimate = totalMakeTime - closeTime - setPairTime - consumePairsTime - recordCompletionsTime;

    // Restore
    (Controller.prototype as any).setPair = origSetPair;
    (Controller.prototype as any).close = origClose;
    (Controller.prototype as any).consumePairs = origConsumePairs;
    (Controller.prototype as any).recordCompletions = origRecordCompletions;

    console.log('=== PROFILE RESULTS ===');
    console.log(`Constructor time:        ${ctorTime}ms`);
    console.log(`Total make() time:       ${totalMakeTime}ms`);
    console.log(`Rows produced:           ${rows.length}`);
    console.log(`Incomplete pairs left:   ${ctrl.incomplete.size}`);
    console.log('');
    console.log(`setPair calls:           ${setPairCalls}`);
    console.log(`setPair total time:      ${setPairTime}ms`);
    console.log(`close() calls:           ${closeCalls}`);
    console.log(`close() total time:      ${closeTime}ms`);
    console.log(`close() successes:       ${closeSuccesses}`);
    console.log(`close() failures:        ${closeFailures}`);
    console.log(`consumePairs time:       ${consumePairsTime}ms`);
    console.log(`recordCompletions time:  ${recordCompletionsTime}ms`);
    console.log(`Greedy+other (residual): ${greedyEstimate}ms`);
  });

  it('per-row iteration timing', () => {
    const factors = makeFactors();
    const ctrl = new Controller(factors, { criterion: criteria.greedy });

    const iterTimes: number[] = [];
    const gen = ctrl.makeAsync();
    let iterStart = Date.now();
    for (const row of gen) {
      iterTimes.push(Date.now() - iterStart);
      iterStart = Date.now();
    }
    const totalTime = iterTimes.reduce((a, b) => a + b, 0);

    const sorted = [...iterTimes].sort((a, b) => b - a);
    console.log(`\n=== ITERATION PROFILE ===`);
    console.log(`Total rows: ${iterTimes.length}, Total time: ${totalTime}ms`);
    console.log(`Avg per row: ${(totalTime / iterTimes.length).toFixed(1)}ms`);
    console.log(`Slowest 10: ${sorted.slice(0, 10).join(', ')}ms`);
    console.log(`Fastest 10: ${sorted.slice(-10).join(', ')}ms`);

    const buckets = [0, 10, 50, 100, 200, 500, Infinity];
    for (let i = 0; i < buckets.length - 1; i++) {
      const count = iterTimes.filter(t => t >= buckets[i] && t < buckets[i + 1]).length;
      if (count > 0) console.log(`  ${buckets[i]}-${buckets[i + 1]}ms: ${count} rows`);
    }
    console.log(`First 10: ${iterTimes.slice(0, 10).join(', ')}ms`);
    console.log(`Last 10:  ${iterTimes.slice(-10).join(', ')}ms`);
  });

  it('profiles greedy internals with inlined instrumented criterion', () => {
    const factors = makeFactors();

    // Counters for greedy internals
    let rowCoveredTime = 0;
    let rowCoveredCalls = 0;
    let innerLoopIterations = 0;
    let isCompatibleCalls = 0;
    let getNumRemovablePairsCalls = 0;
    let getNumRemovablePairsTime = 0;
    let outerWhileIterations = 0;
    let pairsYielded = 0;
    let earlyBreakCount = 0;
    let rowCoveredSkips = 0;
    let invalidPairSkips = 0;
    let incompatibleSkips = 0;
    let compatZeroSkips = 0;

    // Inline the greedy criterion with instrumentation
    const getNumRemovablePairs = (indexes: Set<number>, incomplete: PairByKeyType, strengths: number[], exclude?: Set<ScalarType>) => {
      getNumRemovablePairsCalls++;
      const t0 = Date.now();
      let num = 0;
      for (const s of strengths) {
        for (let pair of combinations([...indexes], s)) {
          const key = unique(pair);
          if (incomplete.has(key) && (!exclude || !exclude.has(key))) {
            num++;
          }
        }
      }
      getNumRemovablePairsTime += Date.now() - t0;
      return num;
    };

    const instrumentedGreedy = function* <T extends FactorsType>(ctrl: Controller<T>): Generator<PairType> {
      while (true) {
        outerWhileIterations++;
        let maxNumPairs: number | null = null;
        let efficientPair: PairType | null = null;

        const rcStart = Date.now();
        rowCoveredCalls++;
        const rowCovered = new Set<ScalarType>();
        if (ctrl.row.size > 0) {
          for (const s of ctrl.allStrengths) {
            for (const p of combinations([...ctrl.row.values()], s)) {
              rowCovered.add(unique(p));
            }
          }
        }
        rowCoveredTime += Date.now() - rcStart;

        for (const [pairKey, pair] of ctrl.incomplete.entries()) {
          innerLoopIterations++;
          const rowSize = ctrl.row.size;
          if (ctrl.isFilled(ctrl.row)) break;

          if (rowCovered.has(pairKey)) { rowCoveredSkips++; continue; }
          if (ctrl.row.invalidPairs.has(pairKey)) { invalidPairSkips++; continue; }

          const compat = rowSize === 0 ? pair.length : ctrl.isCompatible(pair);
          isCompatibleCalls++;
          if (compat === null) { incompatibleSkips++; continue; }
          if (compat === 0) { compatZeroSkips++; continue; }

          let storable = compat;
          const storableAbs = Math.abs(storable);
          const { tolerance = 0 } = ctrl.options!;

          const numPairs = getNumRemovablePairs(
            new Set([...ctrl.row.values(), ...pair]),
            ctrl.incomplete,
            ctrl.allStrengths,
            rowCovered,
          );

          if (numPairs + tolerance > rowSize * storableAbs) {
            efficientPair = pair;
            earlyBreakCount++;
            break;
          }
          if (maxNumPairs === null || maxNumPairs < numPairs) {
            maxNumPairs = numPairs;
            efficientPair = pair;
          }
        }
        if (efficientPair === null) break;
        pairsYielded++;
        yield efficientPair;
      }
    };

    const ctrl = new Controller(factors, { criterion: instrumentedGreedy as any });
    const t0 = Date.now();
    const rows = ctrl.make();
    const elapsed = Date.now() - t0;

    console.log(`\n=== GREEDY INTERNALS (instrumented) ===`);
    console.log(`Total time:                  ${elapsed}ms`);
    console.log(`Rows:                        ${rows.length}`);
    console.log(`Outer while iterations:      ${outerWhileIterations}`);
    console.log(`Pairs yielded:               ${pairsYielded}`);
    console.log(`Inner loop iterations:       ${innerLoopIterations}`);
    console.log('');
    console.log(`rowCovered computation:      ${rowCoveredTime}ms (${rowCoveredCalls} calls)`);
    console.log(`getNumRemovablePairs:        ${getNumRemovablePairsTime}ms (${getNumRemovablePairsCalls} calls)`);
    console.log('');
    console.log(`isCompatible calls:          ${isCompatibleCalls}`);
    console.log(`rowCovered skips:            ${rowCoveredSkips}`);
    console.log(`invalidPair skips:           ${invalidPairSkips}`);
    console.log(`incompatible skips:          ${incompatibleSkips}`);
    console.log(`compat=0 skips:              ${compatZeroSkips}`);
    console.log(`early breaks (efficient):    ${earlyBreakCount}`);
    console.log('');
    console.log(`Avg inner iterations/outer:  ${(innerLoopIterations / outerWhileIterations).toFixed(0)}`);
    console.log(`Avg getNumRemovable/outer:   ${(getNumRemovablePairsCalls / outerWhileIterations).toFixed(0)}`);

    // Estimate time NOT in getNumRemovablePairs or rowCovered
    const otherTime = elapsed - getNumRemovablePairsTime - rowCoveredTime;
    console.log(`\nTime breakdown:`);
    console.log(`  getNumRemovablePairs:      ${getNumRemovablePairsTime}ms (${(getNumRemovablePairsTime / elapsed * 100).toFixed(1)}%)`);
    console.log(`  rowCovered computation:    ${rowCoveredTime}ms (${(rowCoveredTime / elapsed * 100).toFixed(1)}%)`);
    console.log(`  other (iteration, compat): ${otherTime}ms (${(otherTime / elapsed * 100).toFixed(1)}%)`);
  });
});
