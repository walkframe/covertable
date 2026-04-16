import { make, sorters, criteria } from '../index';
import { product, combinations, range, len, all, getItems } from '../lib';
import { FactorsType, ScalarType, DictType, PairType } from '../types';

const getPairs = function* (factors: FactorsType, strength = 2) {
  const allKeys = getItems(factors).map(([k, _]) => k);
  for (let keys of combinations(allKeys, strength)) {
    // @ts-ignore TS7015
    const factorsList = range(0, strength).map(i => factors[keys[i]]);
    for (let pair of product(...factorsList)) {
      yield pair as string[];
    }
  }
};

test('2pair', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e"],
    ["f"],
    ["g", "h"],
    ["i", "j"],
    ["k", "l", "m", "n"],
  ];
  const strength = 2;
  const rows = make(factors, { strength, criterion: criteria.simple });
  for (let pair of getPairs(factors, strength)) {
    let final = true;
    for (let row of rows) {
      if (all(pair.map(p => row.indexOf(p) !== -1))) {
        final = false;
        break;
      }
    }
    if (final) {
      throw `${pair} is not in any rows`;
    }
  }
});

test('3pair', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e"],
    ["f"],
    ["g", "h"],
    ["i", "j"],
    ["k", "l", "m", "n"],
  ];
  const strength = 3;
  const rows = make(factors, { strength });
  for (let pair of getPairs(factors, strength)) {
    let final = true;
    for (let row of rows) {
      if (all(pair.map(p => row.indexOf(p) !== -1))) {
        final = false;
        break;
      }
    }
    if (final) {
      throw `${pair} is not in any rows`;
    }
  }
});

test('constraints exclude specified pairs before', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e"],
    ["f"],
  ];
  const rows = make(factors, {
    constraints: [
      // NOT (0="a" AND 1="d")
      { operator: 'not', condition: { operator: 'and', conditions: [
        { operator: 'eq', field: '0', value: 'a' },
        { operator: 'eq', field: '1', value: 'd' },
      ]}},
      // NOT (0="b" AND 1="e")
      { operator: 'not', condition: { operator: 'and', conditions: [
        { operator: 'eq', field: '0', value: 'b' },
        { operator: 'eq', field: '1', value: 'e' },
      ]}},
    ],
  });
  const unexpectedPairs = [["a", "d"], ["b", "e"]];
  for (let pair of unexpectedPairs) {
    for (let row of rows) {
      if (all(pair.map(p => row.indexOf(p) !== -1))) {
        throw `${pair} is in a row: ${row}`;
      }
    }
  }
});

test("greedy sorter should make rows less than seed's one with 2", () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i"],
    ["j", "k", "l"],
    ["m", "n", "o"],
  ];
  let len1 = 0, len2 = 0;
  const strength = 2;
  for (let i of range(0, 10)) {
    const rows1 = make(factors, { strength, salt: Math.random(), sorter: sorters.hash, criterion: criteria.greedy });
    const rows2 = make(factors, { strength, salt: Math.random(), sorter: sorters.hash, criterion: criteria.simple });
    len1 += len(rows1);
    len2 += len(rows2);
  }
  expect(len1).toBeLessThan(len2);
});

test("greedy sorter should make rows less than seed's one with 3", () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i"],
    ["j", "k", "l"],
    ["m", "n", "o"],
  ];
  let len1 = 0, len2 = 0;
  const strength = 3;
  for (let i of range(0, 10)) {
    const rows1 = make(factors, { strength, salt: Math.random(), sorter: sorters.hash, criterion: criteria.greedy });
    const rows2 = make(factors, { strength, salt: Math.random(), sorter: sorters.hash, criterion: criteria.simple });
    len1 += len(rows1);
    len2 += len(rows2);
  }
  expect(len1).toBeLessThan(len2);
});

test('random sorter makes different rows everytime', () => {
  const factors = [
    ["a", "b", "c"],
    ["d", "e", "f"],
    ["g", "h", "i"],
    ["j", "k", "l"],
    ["m", "n", "o"],
  ];
  for (let _ of range(0, 10)) {
    const rows1 = make(factors, { sorter: sorters.random });
    const rows2 = make(factors, { sorter: sorters.random });
    expect(JSON.stringify(rows1) === JSON.stringify(rows2)).toBe(false);
  }
});

test('presets are included in the output (full row)', () => {
  const factors = {
    A: ['a1', 'a2', 'a3'],
    B: ['b1', 'b2', 'b3'],
    C: ['c1', 'c2'],
  };
  const rows = make(factors, {
    presets: [
      { A: 'a1', B: 'b1', C: 'c1' },
    ],
  });
  // The full preset row must appear in the output
  const found = rows.some((r: any) => r.A === 'a1' && r.B === 'b1' && r.C === 'c1');
  expect(found).toBe(true);
});

test('presets are completed when partial', () => {
  const factors = {
    A: ['a1', 'a2'],
    B: ['b1', 'b2'],
    C: ['c1', 'c2'],
  };
  const rows = make(factors, {
    presets: [
      { A: 'a1' }, // partial: B and C will be filled in
    ],
  });
  // First row should have A === 'a1' and B/C filled in
  expect(rows[0]).toBeDefined();
  expect((rows[0] as any).A).toBe('a1');
  expect((rows[0] as any).B).toBeDefined();
  expect((rows[0] as any).C).toBeDefined();
});

test('presets violating constraints are silently dropped', () => {
  const factors = {
    OS: ['iOS', 'Android'],
    Browser: ['Safari', 'Chrome'],
  };
  const rows = make(factors, {
    constraints: [
      // NOT (OS=iOS AND Browser=Chrome)
      { operator: 'not' as const, condition: { operator: 'and' as const, conditions: [
        { operator: 'eq' as const, field: 'OS', value: 'iOS' },
        { operator: 'eq' as const, field: 'Browser', value: 'Chrome' },
      ]}},
    ],
    presets: [
      { OS: 'iOS', Browser: 'Chrome' }, // violates constraint — must be dropped
      { OS: 'Android', Browser: 'Safari' }, // valid — must appear
    ],
  });
  // Bad preset should not appear
  const bad = rows.some((r: any) => r.OS === 'iOS' && r.Browser === 'Chrome');
  expect(bad).toBe(false);
  // Good preset should appear
  const good = rows.some((r: any) => r.OS === 'Android' && r.Browser === 'Safari');
  expect(good).toBe(true);
  // All output rows must satisfy the constraint
  for (const r of rows) {
    expect((r as any).OS === 'iOS' && (r as any).Browser === 'Chrome').toBe(false);
  }
});

test('presets with unknown values are ignored', () => {
  const factors = {
    A: ['a1', 'a2'],
    B: ['b1', 'b2'],
  };
  const rows = make(factors, {
    presets: [
      { A: 'unknown', B: 'b1' },
    ],
  });
  // Pairwise coverage should still be satisfied for known values
  for (const a of ['a1', 'a2']) {
    for (const b of ['b1', 'b2']) {
      const found = rows.some((r: any) => r.A === a && r.B === b);
      expect(found).toBe(true);
    }
  }
});

test('presets with array factors use numeric keys', () => {
  const factors = [
    ['a1', 'a2'],
    ['b1', 'b2'],
  ];
  const rows = make(factors, {
    presets: [
      { 0: 'a1', 1: 'b1' } as any,
    ],
  });
  // The preset should appear
  const found = rows.some((r: any[]) => r[0] === 'a1' && r[1] === 'b1');
  expect(found).toBe(true);
});

test('presets cover pairs and reduce generated rows', () => {
  const factors = {
    A: ['a1', 'a2', 'a3'],
    B: ['b1', 'b2', 'b3'],
  };
  const baseRows = make(factors);
  const presetRows = make(factors, {
    presets: [
      { A: 'a1', B: 'b1' },
      { A: 'a2', B: 'b2' },
    ],
  });
  // Total row count should still cover the same pairs
  const allPairs = new Set<string>();
  for (const r of presetRows) {
    allPairs.add(`${(r as any).A}|${(r as any).B}`);
  }
  // All 9 pairs covered
  expect(allPairs.size).toBe(9);
  // Same total count (or close to it) — presets shouldn't bloat the output
  expect(presetRows.length).toBe(baseRows.length);
});

test('dict type factors make dict row', () => {
  const factors = {
    'key1': ["a", "b", "c"],
    'key2': ["d", "e", "f"],
    'key3': ["g", "h", "i"],
    'key4': ["j", "k", "l"],
    'key5': ["m", "n", "o"],
  };
  const rows = make(factors);
  const sorter = (a: ScalarType, b: ScalarType) => a > b ? 1 : -1;
  for (let row of rows) {
    const keys1 = Object.keys(row).sort(sorter);
    const keys2 = Object.keys(factors).sort(sorter);
    expect(keys1.toString()).toBe(keys2.toString());
  }
});
