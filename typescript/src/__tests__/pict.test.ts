import { PictModel, PictModelError, weightsByValue } from "../pict";
import { make } from "../index";

// Helper: extract just the messages so existing tests can keep using string-based matchers.
const errorMessages = (m: PictModel) => m.issues.map(i => i.message);

describe('PictModel issues', () => {
  it('records source/index/line for parameter errors', () => {
    const model = new PictModel(`
A: 1, 2, 3
Empty:
B: x, y
`);
    const factorIssues = model.issues.filter(i => i.source === 'factor');
    expect(factorIssues).toHaveLength(1);
    expect(factorIssues[0].severity).toBe('error');
    expect(factorIssues[0].source).toBe('factor');
    expect(factorIssues[0].index).toBe(1); // 0-based: A is 0, Empty is 1, B is 2
    expect(factorIssues[0].line).toBe(3); // leading newline → "A:" is line 2, "Empty:" is line 3
    expect(factorIssues[0].message).toMatch(/No values for parameter "Empty"/);
  });

  it('records line for parameter reference errors', () => {
    const model = new PictModel(`
A: 1, 2
B: <Unknown>, 3
`);
    const factorIssues = model.issues.filter(i => i.source === 'factor');
    expect(factorIssues).toHaveLength(1);
    expect(factorIssues[0].index).toBe(1); // B is the second factor (index 1)
    expect(factorIssues[0].line).toBe(3);
    expect(factorIssues[0].message).toMatch(/Unknown parameter reference/);
  });

  it('records source/index/line for constraint errors', () => {
    const model = new PictModel(`
A: 1, 2
B: 3, 4

IF [A] = 1 THEN [B] = 3;
IF [A] @ 2 THEN [B] = 4;
`);
    const constraintIssues = model.issues.filter(i => i.source === 'constraint');
    expect(constraintIssues).toHaveLength(1);
    expect(constraintIssues[0].source).toBe('constraint');
    // The bad constraint is the second filter (index 1)
    expect(constraintIssues[0].index).toBe(1);
    expect(constraintIssues[0].line).toBe(6);
    expect(constraintIssues[0].message).toMatch(/Unknown comparison operator: @/);
  });

  it('strict mode throws PictModelError on errors', () => {
    expect(() => new PictModel('broken line', { strict: true })).toThrow(PictModelError);
  });

  it('strict mode does not throw when there are no errors', () => {
    expect(() => new PictModel('A: 1, 2\nB: 3, 4', { strict: true })).not.toThrow();
  });

  it('PictModelError exposes the issues array', () => {
    try {
      new PictModel('broken line', { strict: true });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PictModelError);
      expect((e as PictModelError).issues.length).toBeGreaterThan(0);
      expect((e as PictModelError).issues[0].severity).toBe('error');
    }
  });

  it('non-strict mode collects issues without throwing', () => {
    const model = new PictModel('broken line');
    expect(model.issues.length).toBeGreaterThan(0);
  });
});

describe('PictModel parameters', () => {
  it('parses basic PICT model definition', () => {
    const model = new PictModel(`
Type:          Single, Span, Stripe, Mirror, RAID-5
Size:          10, 100, 500, 1000, 5000, 10000, 40000
Format method: Quick, Slow
File system:   FAT, FAT32, NTFS
Cluster size:  512, 1024, 2048, 4096, 8192, 16384, 32768, 65536
Compression:   On, Off
    `);
    expect(model.parameters).toEqual({
      "Type": ["Single", "Span", "Stripe", "Mirror", "RAID-5"],
      "Size": [10, 100, 500, 1000, 5000, 10000, 40000],
      "Format method": ["Quick", "Slow"],
      "File system": ["FAT", "FAT32", "NTFS"],
      "Cluster size": [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536],
      "Compression": ["On", "Off"],
    });
  });

  it('skips empty lines and comments', () => {
    const model = new PictModel(`
# This is a comment
A: 1, 2, 3

# Another comment
B: x, y
    `);
    expect(model.parameters).toEqual({
      "A": [1, 2, 3],
      "B": ["x", "y"],
    });
  });

  it('line without colon is treated as constraint and produces error', () => {
    const model = new PictModel('No colon here');
    expect(Object.keys(model.parameters)).toHaveLength(0);
    expect(errorMessages(model).length).toBeGreaterThan(0);
  });

  it('line with empty name is treated as constraint and produces error', () => {
    const model = new PictModel(': a, b');
    expect(Object.keys(model.parameters)).toHaveLength(0);
    expect(errorMessages(model).length).toBeGreaterThan(0);
  });

  it('collects error for no values', () => {
    const model = new PictModel('Key:');
    expect(errorMessages(model)).toContainEqual(expect.stringContaining('No values for parameter "Key"'));
  });

  it('handles quoted strings with commas', () => {
    const model = new PictModel(`Msg: "hello, world", "foo, bar", normal`);
    expect(model.parameters).toEqual({ "Msg": ["hello, world", "foo, bar", "normal"] });
  });

  it('handles negative prefix ~', () => {
    const model = new PictModel(`Type: Valid, ~Invalid, ~Bad`);
    expect(model.parameters).toEqual({ "Type": ["Valid", "Invalid", "Bad"] });
  });

  it('handles weight suffix (N)', () => {
    const model = new PictModel(`Size: 10, 100 (10), 500`);
    expect(model.parameters).toEqual({ "Size": [10, 100, 500] });
  });

  it('handles aliases with |', () => {
    const model = new PictModel(`OS: Windows | Win, Linux | GNU/Linux`);
    expect(model.parameters).toEqual({ "OS": ["Windows", "Linux"] });
  });

  it('handles parameter reference <Name>', () => {
    const model = new PictModel(`A: 1, 2, 3\nB: <A>, 4`);
    expect(model.parameters).toEqual({ "A": [1, 2, 3], "B": [1, 2, 3, 4] });
  });

  it('collects error for unknown parameter reference', () => {
    const model = new PictModel(`A: <Unknown>`);
    expect(errorMessages(model)).toContainEqual(expect.stringContaining('Unknown parameter reference: "Unknown"'));
  });

  it('handles combined features', () => {
    const model = new PictModel(`OS: "Windows 10" | Win10, ~"Bad OS" (5), Linux`);
    expect(model.parameters).toEqual({ "OS": ["Windows 10", "Bad OS", "Linux"] });
  });
});

describe('PictModel with parameters and constraints', () => {
  it('parses parameters and constraints together', () => {
    const model = new PictModel(`
Type: Single, Span, Stripe
Size: 10, 100, 500

IF [Type] = "Single" THEN [Size] > 10;
    `);
    expect(model.parameters).toEqual({
      "Type": ["Single", "Span", "Stripe"],
      "Size": [10, 100, 500],
    });
    expect(model.constraints).toHaveLength(1);
    expect(errorMessages(model)).toEqual([]);
  });

  it('filter checks constraint', () => {
    const model = new PictModel(`
Type: A, B
Size: 10, 100

IF [Type] = "A" THEN [Size] = 100;
    `);
    expect(model.filter({ Type: 'A', Size: 100 })).toBe(true);
    expect(model.filter({ Type: 'A', Size: 10 })).toBe(false);
    expect(model.filter({ Type: 'B', Size: 10 })).toBe(true);
  });

  it('filter returns true when no constraints', () => {
    const model = new PictModel(`X: 1, 2\nY: a, b`);
    expect(model.filter({ X: 1, Y: 'a' })).toBe(true);
  });

  it('make generates rows satisfying constraints', () => {
    const model = new PictModel(`
Type: A, B
Size: 10, 100
Flag: On, Off

IF [Type] = "A" THEN [Size] = 100;
    `);
    const rows = model.make();
    for (const row of rows) {
      if ((row as any).Type === 'A') {
        expect((row as any).Size).toBe(100);
      }
    }
  });

  it('make accepts additional options', () => {
    const model = new PictModel(`
Type: A, B, C
Size: 10, 100, 500
    `);
    const rows = model.make({ strength: 2, salt: 42 });
    expect(rows.length).toBeGreaterThan(0);
  });

  it('makeAsync yields rows', () => {
    const model = new PictModel(`
Type: A, B
Size: 10, 100
    `);
    const rows = [...model.makeAsync()];
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('PictModel weights', () => {
  it('parses weight from (N) syntax', () => {
    const model = new PictModel(`
Browser: Chrome (10), Firefox, Safari (5)
    `);
    expect(errorMessages(model)).toEqual([]);
    expect(model.weights).toEqual({
      Browser: { 0: 10, 2: 5 },
    });
  });

  it('no weights when none specified', () => {
    const model = new PictModel(`Browser: Chrome, Firefox`);
    expect(model.weights).toEqual({});
  });

  it('weighted value is preferred during completion', () => {
    // With heavy weight on a specific value, that value should appear more often
    const factors = {
      A: ['a1', 'a2', 'a3'],
      B: ['b1', 'b2', 'b3'],
      C: ['c1', 'c2', 'c3'],
    };
    const rowsNoWeight = make(factors, { salt: 1 });
    const rowsWithWeight = make(factors, {
      salt: 1,
      weights: { C: { 0: 100 } }, // c1 prioritized
    });
    const c1CountNoWeight = rowsNoWeight.filter((r: any) => r.C === 'c1').length;
    const c1CountWithWeight = rowsWithWeight.filter((r: any) => r.C === 'c1').length;
    // c1 should appear at least as often (typically more often) when weighted
    expect(c1CountWithWeight).toBeGreaterThanOrEqual(c1CountNoWeight);
  });

  it('PictModel with weight syntax produces rows', () => {
    const model = new PictModel(`
A: a1, a2, a3
B: b1 (10), b2, b3
    `);
    const rows = model.make({ salt: 1 });
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('weightsByValue utility', () => {
  it('converts value-keyed weights to index-keyed', () => {
    const factors = {
      Browser: ['Chrome', 'Firefox', 'Safari'],
    };
    const result = weightsByValue(factors, {
      Browser: { Chrome: 10, Safari: 5 },
    });
    expect(result).toEqual({
      Browser: { 0: 10, 2: 5 },
    });
  });

  it('skips unknown factor keys', () => {
    const result = weightsByValue(
      { A: ['x', 'y'] },
      { A: { x: 10 }, Unknown: { foo: 5 } },
    );
    expect(result).toEqual({ A: { 0: 10 } });
  });

  it('skips unknown values', () => {
    const result = weightsByValue(
      { A: ['x', 'y'] },
      { A: { x: 10, z: 99 } },
    );
    expect(result).toEqual({ A: { 0: 10 } });
  });

  it('matches numeric values via string conversion', () => {
    const result = weightsByValue(
      { Size: [10, 100, 1000] },
      { Size: { '100': 5 } },
    );
    expect(result).toEqual({ Size: { 1: 5 } });
  });

  it('returns empty object when no matches', () => {
    const result = weightsByValue(
      { A: ['x', 'y'] },
      { A: { z: 10 } },
    );
    expect(result).toEqual({});
  });
});

describe('PictModel invalid values (~)', () => {
  it('records invalid values from ~ prefix', () => {
    const model = new PictModel(`
Age:  20, 30, ~-1, ~999
Country: Japan, USA, ~"Mars"
    `);
    expect(errorMessages(model)).toEqual([]);
    expect(model.negatives.get('Age')).toEqual(new Set([-1, 999]));
    expect(model.negatives.get('Country')).toEqual(new Set(['Mars']));
  });

  it('filter allows rows with no invalid values', () => {
    const model = new PictModel(`
Age: 20, ~-1
Country: Japan, ~"Mars"
    `);
    expect(model.filter({ Age: 20, Country: 'Japan' })).toBe(true);
  });

  it('filter allows rows with exactly one invalid value', () => {
    const model = new PictModel(`
Age: 20, ~-1
Country: Japan, ~"Mars"
    `);
    expect(model.filter({ Age: -1, Country: 'Japan' })).toBe(true);
    expect(model.filter({ Age: 20, Country: 'Mars' })).toBe(true);
  });

  it('filter rejects rows with two or more invalid values', () => {
    const model = new PictModel(`
Age: 20, ~-1
Country: Japan, ~"Mars"
    `);
    expect(model.filter({ Age: -1, Country: 'Mars' })).toBe(false);
  });

  it('make generates rows that never combine two invalid values', () => {
    const model = new PictModel(`
Age: 20, 30, ~-1, ~999
Country: Japan, USA, ~"Mars"
    `);
    const rows = model.make();
    for (const row of rows) {
      const ageInvalid = (row as any).Age === '~-1' || (row as any).Age === '~999';
      const countryInvalid = (row as any).Country === '~Mars';
      expect(ageInvalid && countryInvalid).toBe(false);
    }
    // Verify ~ prefix appears in output
    const allAges = rows.map((r: any) => r.Age);
    expect(allAges).toContain('~-1');
    expect(allAges).toContain('~999');
    const allCountries = rows.map((r: any) => r.Country);
    expect(allCountries).toContain('~Mars');
  });

  it('invalid values combined with aliases', () => {
    const model = new PictModel(`
OS: Linux, ~"Bad OS" | Bad
Result: pass, ~fail
    `);
    expect(model.negatives.get('OS')).toEqual(new Set(['Bad OS']));
    expect(model.negatives.get('Result')).toEqual(new Set(['fail']));
  });

  it('invalid values work alongside constraints', () => {
    const model = new PictModel(`
Age: 20, 30, ~-1
Country: Japan, USA

IF [Country] = "USA" THEN [Age] > 18;
    `);
    expect(errorMessages(model)).toEqual([]);
    // Valid normal row
    expect(model.filter({ Age: 30, Country: 'USA' })).toBe(true);
    // Single invalid value is allowed (constraint still applies though)
    expect(model.filter({ Age: -1, Country: 'Japan' })).toBe(true);
    // Constraint violated
    expect(model.filter({ Age: 10, Country: 'USA' })).toBe(false);
  });
});

describe('PictModel caseInsensitive', () => {
  it('case-insensitive equality', () => {
    const model = new PictModel(
      `OS: iOS, Android
Browser: Chrome, Firefox

IF [OS] = "ios" THEN [Browser] = "chrome";
      `,
      { caseInsensitive: true }
    );
    expect(errorMessages(model)).toEqual([]);
    expect(model.filter({ OS: 'iOS', Browser: 'Chrome' })).toBe(true);
    expect(model.filter({ OS: 'iOS', Browser: 'Firefox' })).toBe(false);
    expect(model.filter({ OS: 'Android', Browser: 'Firefox' })).toBe(true);
  });

  it('case-insensitive IN clause', () => {
    const model = new PictModel(
      `Color: Red, Blue, Green, Yellow
Category: Primary, Secondary

IF [Color] IN {"red", "blue"} THEN [Category] = "Primary";
      `,
      { caseInsensitive: true }
    );
    expect(model.filter({ Color: 'Red', Category: 'Primary' })).toBe(true);
    expect(model.filter({ Color: 'Blue', Category: 'Primary' })).toBe(true);
    expect(model.filter({ Color: 'Green', Category: 'Secondary' })).toBe(true);
    expect(model.filter({ Color: 'Red', Category: 'Secondary' })).toBe(false);
  });

  it('case-insensitive LIKE clause', () => {
    const model = new PictModel(
      `Name: Alice, alice, Bob
Status: Active, Inactive

IF [Name] LIKE "ALIC*" THEN [Status] = "Active";
      `,
      { caseInsensitive: true }
    );
    expect(model.filter({ Name: 'Alice', Status: 'Active' })).toBe(true);
    expect(model.filter({ Name: 'alice', Status: 'Active' })).toBe(true);
    expect(model.filter({ Name: 'Alice', Status: 'Inactive' })).toBe(false);
    expect(model.filter({ Name: 'Bob', Status: 'Inactive' })).toBe(true);
  });

  it('case-insensitive alias lookup', () => {
    const model = new PictModel(
      `OS: Windows | Win, Linux

IF [OS] = "WIN" THEN [OS] <> "Linux";
      `,
      { caseInsensitive: true }
    );
    expect(errorMessages(model)).toEqual([]);
    expect(model.filter({ OS: 'Windows' })).toBe(true);
  });

  it('case-insensitive by default (PICT compatible)', () => {
    const model = new PictModel(`
OS: iOS, Android
Browser: Chrome, Firefox

IF [OS] = "ios" THEN [Browser] = "chrome";
    `);
    // Default is case-insensitive, so "ios" matches "iOS"
    expect(model.filter({ OS: 'iOS', Browser: 'Chrome' })).toBe(true);
    expect(model.filter({ OS: 'iOS', Browser: 'Firefox' })).toBe(false);
  });

  it('case-sensitive when explicitly disabled', () => {
    const model = new PictModel(
      `OS: iOS, Android
Browser: Chrome, Firefox

IF [OS] = "ios" THEN [Browser] = "chrome";
      `,
      { caseInsensitive: false }
    );
    // No row matches "ios" because comparison is case-sensitive
    expect(model.filter({ OS: 'iOS', Browser: 'Firefox' })).toBe(true);
  });
});

describe('PictModel aliases in constraints', () => {
  it('alias in constraint resolves to canonical value', () => {
    const model = new PictModel(`
OS: Windows | Win, Linux
Browser: Chrome, Firefox

IF [OS] = "Win" THEN [Browser] = "Chrome";
    `);
    expect(errorMessages(model)).toEqual([]);
    // Row with canonical "Windows" value should match the constraint
    expect(model.filter({ OS: 'Windows', Browser: 'Chrome' })).toBe(true);
    expect(model.filter({ OS: 'Windows', Browser: 'Firefox' })).toBe(false);
    expect(model.filter({ OS: 'Linux', Browser: 'Firefox' })).toBe(true);
  });

  it('alias in IN clause resolves to canonical value', () => {
    const model = new PictModel(`
OS: "Windows 10" | Win10, "Mac OS" | Mac, Linux
Result: pass, fail

IF [OS] IN {"Win10", "Mac"} THEN [Result] = "pass";
    `);
    expect(errorMessages(model)).toEqual([]);
    expect(model.filter({ OS: 'Windows 10', Result: 'pass' })).toBe(true);
    expect(model.filter({ OS: 'Windows 10', Result: 'fail' })).toBe(false);
    expect(model.filter({ OS: 'Mac OS', Result: 'pass' })).toBe(true);
    expect(model.filter({ OS: 'Linux', Result: 'fail' })).toBe(true);
  });

  it('multiple aliases per value', () => {
    const model = new PictModel(`
OS: Windows | Win | Microsoft, Linux | GNU/Linux

IF [OS] = "Microsoft" THEN [OS] <> "GNU/Linux";
    `);
    expect(errorMessages(model)).toEqual([]);
    expect(model.filter({ OS: 'Windows' })).toBe(true);
    expect(model.filter({ OS: 'Linux' })).toBe(true);
  });

  it('parameters use canonical value only', () => {
    const model = new PictModel(`OS: Windows | Win, Linux`);
    expect(model.parameters).toEqual({ OS: ['Windows', 'Linux'] });
  });
});

describe('PictModel sub-models', () => {
  it('parses sub-model definition', () => {
    const model = new PictModel(`
A: 1, 2, 3
B: 4, 5, 6
C: 7, 8, 9

{ A, B, C } @ 3
    `);
    expect(model.subModels).toEqual([{ keys: ['A', 'B', 'C'], strength: 3 }]);
    expect(errorMessages(model)).toEqual([]);
  });

  it('sub-model increases coverage for group', () => {
    const model = new PictModel(`
A: a1, a2, a3
B: b1, b2, b3
C: c1, c2, c3
D: d1, d2

{ A, B, C } @ 3
    `);
    const rows = model.make();
    // All 3-wise combinations of A, B, C must be covered
    const abc = ['A', 'B', 'C'] as const;
    const abcValues = {
      A: ['a1', 'a2', 'a3'],
      B: ['b1', 'b2', 'b3'],
      C: ['c1', 'c2', 'c3'],
    };
    for (const a of abcValues.A) {
      for (const b of abcValues.B) {
        for (const c of abcValues.C) {
          const found = rows.some((row: any) => row.A === a && row.B === b && row.C === c);
          expect(found).toBe(true);
        }
      }
    }
  });

  it('default strength still applies cross-group', () => {
    const model = new PictModel(`
A: a1, a2
B: b1, b2
C: c1, c2
D: d1, d2

{ A, B } @ 2
    `);
    // Default strength 2 applies to cross-group pairs (e.g. A-C, A-D, B-C, B-D, C-D)
    const rows = model.make();
    // Check that all 2-wise pairs of C and D are covered
    for (const c of ['c1', 'c2']) {
      for (const d of ['d1', 'd2']) {
        const found = rows.some((row: any) => row.C === c && row.D === d);
        expect(found).toBe(true);
      }
    }
  });

  it('multiple sub-models', () => {
    const model = new PictModel(`
A: a1, a2
B: b1, b2
C: c1, c2
D: d1, d2

{ A, B } @ 2
{ C, D } @ 2
    `);
    expect(model.subModels).toHaveLength(2);
    const rows = model.make();
    expect(rows.length).toBeGreaterThan(0);
  });

  it('sub-model via options API', () => {
    const rows = new PictModel(`
A: a1, a2, a3
B: b1, b2, b3
C: c1, c2, c3
    `).make({ subModels: [{ keys: ['A', 'B', 'C'], strength: 3 }] });
    // All 3-wise must be covered
    for (const a of ['a1', 'a2', 'a3']) {
      for (const b of ['b1', 'b2', 'b3']) {
        for (const c of ['c1', 'c2', 'c3']) {
          const found = rows.some((row: any) => row.A === a && row.B === b && row.C === c);
          expect(found).toBe(true);
        }
      }
    }
  });

  it('invalid sub-model line produces error', () => {
    const model = new PictModel(`
A: 1, 2
B: 3, 4

{ A, B }
    `);
    // "{ A, B }" without @ is not a valid sub-model, treated as constraint
    expect(errorMessages(model).length).toBeGreaterThan(0);
  });
});

describe('PictModel unconditional constraints', () => {
  it('simple unconditional constraint', () => {
    const model = new PictModel(`
A: x, y
B: x, y
[A] <> [B];
    `);
    expect(errorMessages(model)).toEqual([]);
    expect(model.constraints).toHaveLength(1);
    expect(model.filter({ A: 'x', B: 'y' })).toBe(true);
    expect(model.filter({ A: 'x', B: 'x' })).toBe(false);
  });

  it('unconditional constraint with AND', () => {
    const model = new PictModel(`
A: x, y
B: x, y
C: yes, no
[A] <> [B] AND [C] = "yes";
    `);
    expect(errorMessages(model)).toEqual([]);
    expect(model.filter({ A: 'x', B: 'y', C: 'yes' })).toBe(true);
    expect(model.filter({ A: 'x', B: 'x', C: 'yes' })).toBe(false);
    expect(model.filter({ A: 'x', B: 'y', C: 'no' })).toBe(false);
  });

  it('mixed conditional and unconditional constraints', () => {
    const model = new PictModel(`
A: 1, 2
B: 2, 3
C: x, y
D: x, y
IF [A] = 1 THEN [B] = 2;
[C] <> [D];
    `);
    expect(errorMessages(model)).toEqual([]);
    expect(model.constraints).toHaveLength(2);
    expect(model.filter({ A: 1, B: 2, C: 'x', D: 'y' })).toBe(true);
    expect(model.filter({ A: 1, B: 3, C: 'x', D: 'y' })).toBe(false);
    expect(model.filter({ A: 0, B: 3, C: 'x', D: 'x' })).toBe(false);
  });
});

describe('PictModel single constraints', () => {
  it('Blank', () => {
    const model = new PictModel(``);
    expect(model.constraints.length).toBe(0);
    expect(errorMessages(model).length).toBe(0);

    const row1 = { PRICE: 150, DISCOUNT: 'YES' };
    expect(model.filter(row1)).toBe(true);
  });

  it('should filter correctly with LIKE and IN conditions', () => {
    const model = new PictModel(`
NAME: Alice, Bob
STATUS: Active, Pending, Inactive
AGE: 15, 25
COUNTRY: USA, UK

IF [NAME] LIKE "Alic?" THEN [STATUS] IN {"Active", "Pending"} ELSE [AGE] > 20 OR [COUNTRY] = "USA";
    `);
    const row1 = { NAME: 'Alice', STATUS: 'Active' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', STATUS: 'Inactive' };
    expect(model.filter(row2)).toBe(false);
  });

  it('should filter correctly with numeric conditions', () => {
    const model = new PictModel(`
PRICE: 90, 150
DISCOUNT: YES, NO

IF [PRICE] > 100 THEN [DISCOUNT] = "YES" ELSE [DISCOUNT] = "NO";
    `);
    const row1 = { PRICE: 150, DISCOUNT: 'YES' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { PRICE: 90, DISCOUNT: 'NO' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { PRICE: 90, DISCOUNT: 'YES' };
    expect(model.filter(row3)).toBe(false);
  });

  it('should handle NOT conditions correctly', () => {
    const model = new PictModel(`
PRODUCT: Book, Pen
AVAILABLE: Yes, No

IF NOT [PRODUCT] = "Book" THEN [AVAILABLE] <> "No" ELSE [AVAILABLE] = "No";
    `);
    const row1 = { PRODUCT: 'Pen', AVAILABLE: 'Yes' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { PRODUCT: 'Book', AVAILABLE: 'No' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { PRODUCT: 'Pen', AVAILABLE: 'No' };
    expect(model.filter(row3)).toBe(false);
  });

  it('should filter with AND conditions', () => {
    const model = new PictModel(`
CATEGORY: Electronics, Furniture
BRAND: Sony, "General Electric Company"
WARRANTY: Included, "Not Included"

IF [CATEGORY] = "Electronics" AND [BRAND] = "Sony" THEN [WARRANTY] = "Included" ELSE [WARRANTY] = "Not Included";
    `);
    const row1 = { CATEGORY: 'Electronics', BRAND: 'Sony', WARRANTY: 'Included' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { CATEGORY: 'Electronics', BRAND: 'General Electric Company', WARRANTY: 'Not Included' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { CATEGORY: 'Electronics', BRAND: 'Sony', WARRANTY: 'Not Included' };
    expect(model.filter(row3)).toBe(false);
  });

  it('should handle nested conditions with parentheses', () => {
    const model = new PictModel(`
CATEGORY: Electronics, Furniture
BRAND: Sony, Apple, Samsung, IKEA
WARRANTY: Included, "Not Included"

IF ([CATEGORY] = "Electronics" AND [BRAND] = "Sony") OR [BRAND] = "Apple" THEN [WARRANTY] = "Included" ELSE [WARRANTY] = "Not Included";
    `);
    const row1 = { CATEGORY: 'Electronics', BRAND: 'Sony', WARRANTY: 'Included' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { CATEGORY: 'Electronics', BRAND: 'Apple', WARRANTY: 'Included' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { CATEGORY: 'Furniture', BRAND: 'IKEA', WARRANTY: 'Not Included' };
    expect(model.filter(row3)).toBe(true);

    const row4 = { CATEGORY: 'Electronics', BRAND: 'Samsung', WARRANTY: 'Included' };
    expect(model.filter(row4)).toBe(false);
  });

  it('should handle fields containing spaces', () => {
    const model = new PictModel(`
PRODUCT NAME: Laptop, Desktop
PRICE: 400, 500, 600

IF [PRODUCT NAME] = "Laptop" THEN [PRICE] > 500 ELSE [PRICE] <= 500;
    `);
    const row1 = { 'PRODUCT NAME': 'Laptop', PRICE: 600 };
    expect(model.filter(row1)).toBe(true);

    const row2 = { 'PRODUCT NAME': 'Laptop', PRICE: 400 };
    expect(model.filter(row2)).toBe(false);

    const row3 = { 'PRODUCT NAME': 'Desktop', PRICE: 600 };
    expect(model.filter(row3)).toBe(false);
  });

  it('should handle IN conditions', () => {
    const model = new PictModel(`
COLOR: Red, Blue, Green, Yellow
CATEGORY: Primary, Secondary

IF [COLOR] IN {"Red", "Blue", "Green"} THEN [CATEGORY] = "Primary" ELSE [CATEGORY] = "Secondary";
    `);
    const row1 = { COLOR: 'Red', CATEGORY: 'Primary' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { COLOR: 'Yellow', CATEGORY: 'Secondary' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { COLOR: 'Red', CATEGORY: 'Secondary' };
    expect(model.filter(row3)).toBe(false);
  });

  it('should handle complex conditions with nested parentheses', () => {
    const model = new PictModel(`
AGE: 18, 25
COUNTRY: USA, Canada, UK
STATUS: Allowed, Denied

IF ([AGE] > 20 AND ([COUNTRY] = "USA" OR [COUNTRY] = "Canada")) THEN [STATUS] = "Allowed" ELSE [STATUS] = "Denied";
    `);
    const row1 = { AGE: 25, COUNTRY: 'USA', STATUS: 'Allowed' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { AGE: 18, COUNTRY: 'USA', STATUS: 'Denied' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { AGE: 25, COUNTRY: 'UK', STATUS: 'Denied' };
    expect(model.filter(row3)).toBe(true);

    const row4 = { AGE: 25, COUNTRY: 'Canada', STATUS: 'Allowed' };
    expect(model.filter(row4)).toBe(true);

    const row5 = { AGE: 25, COUNTRY: 'Canada', STATUS: 'Denied' };
    expect(model.filter(row5)).toBe(false);
  });

  it('should handle false in ELSE condition', () => {
    const model = new PictModel(`
NAME: Bob, Alice
STATUS: Active, Inactive

IF [NAME] = "Bob" THEN [STATUS] = "Inactive" ELSE FALSE;
    `);
    const row1 = { NAME: 'Bob', STATUS: 'Inactive' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', STATUS: 'Active' };
    expect(model.filter(row2)).toBe(false);
  });

  it('should handle true in ELSE condition', () => {
    const model = new PictModel(`
NAME: Bob, Alice
STATUS: Active, Inactive

IF [NAME] = "Bob" THEN [STATUS] = "Inactive" ELSE true;
    `);
    const row1 = { NAME: 'Bob', STATUS: 'Inactive' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', STATUS: 'Active' };
    expect(model.filter(row2)).toBe(true);
  });

  it('Compare with other fields', () => {
    const model = new PictModel(`
NAME: Bob, Alice, Shohei
ALIAS: Bob, Lissie, Shohei
AGE: 18, 25, 30

IF [NAME] = [ALIAS] THEN [AGE] <= 26;
    `);
    const row1 = { NAME: 'Bob', ALIAS: 'Bob', AGE: 18 };
    expect(model.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', ALIAS: 'Lissie', AGE: 25 };
    expect(model.filter(row2)).toBe(true);

    const row3 = { NAME: 'Shohei', ALIAS: 'Shohei', AGE: 30 };
    expect(model.filter(row3)).toBe(false);
  });
});

describe('PictModel multiple constraints', () => {
  it('should handle multiple constraints correctly (Test Case 1)', () => {
    const model = new PictModel(`
NAME: Alice, Bob
AGE: 15, 18, 25
COUNTRY: USA, Canada
STATUS: Active, Inactive

IF [NAME] = "Alice" THEN [AGE] > 20 ELSE [AGE] < 20;
IF [COUNTRY] = "USA" THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive";
    `);

    const row1 = { NAME: 'Alice', AGE: 25, COUNTRY: 'USA', STATUS: 'Active' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', AGE: 25, COUNTRY: 'Canada', STATUS: 'Inactive' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { NAME: 'Alice', AGE: 18, COUNTRY: 'USA', STATUS: 'Active' };
    expect(model.filter(row3)).toBe(false);

    const row4 = { NAME: 'Bob', AGE: 15, COUNTRY: 'USA', STATUS: 'Inactive' };
    expect(model.filter(row4)).toBe(false);
  });

  it('should handle multiple constraints correctly (Test Case 2)', () => {
    const model = new PictModel(`
SCORE: 85, 95
GRADE: A, B
MEMBER: YES, NO
DISCOUNT: "10%", "20%"

IF [SCORE] >= 90 THEN [GRADE] = "A" ELSE [GRADE] = "B";
IF [MEMBER] = "YES" THEN [DISCOUNT] = "20%" ELSE [DISCOUNT] = "10%";
    `);

    const row1 = { SCORE: 95, GRADE: 'A', MEMBER: 'YES', DISCOUNT: '20%' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { SCORE: 85, GRADE: 'B', MEMBER: 'NO', DISCOUNT: '10%' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { SCORE: 85, GRADE: 'B', MEMBER: 'YES', DISCOUNT: '20%' };
    expect(model.filter(row3)).toBe(true);

    const row4 = { SCORE: 85, GRADE: 'A', MEMBER: 'YES', DISCOUNT: '10%' };
    expect(model.filter(row4)).toBe(false);
  });

  it('should handle multiple constraints correctly (Test Case 3)', () => {
    const model = new PictModel(`
TEMP: 25, 35
STATE: HOT, COLD
HUMIDITY: 45, 55
COMFORT: DRY, HUMID

IF [TEMP] > 30 THEN [STATE] = "HOT" ELSE [STATE] = "COLD";
IF [HUMIDITY] < 50 THEN [COMFORT] = "DRY" ELSE [COMFORT] = "HUMID";
    `);

    const row1 = { TEMP: 35, STATE: 'HOT', HUMIDITY: 45, COMFORT: 'DRY' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { TEMP: 25, STATE: 'COLD', HUMIDITY: 55, COMFORT: 'HUMID' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { TEMP: 25, STATE: 'HOT', HUMIDITY: 55, COMFORT: 'DRY' };
    expect(model.filter(row3)).toBe(false);

    const row4 = { TEMP: 35, STATE: 'HOT', HUMIDITY: 55, COMFORT: 'HUMID' };
    expect(model.filter(row4)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 4)', () => {
    const model = new PictModel(`
CATEGORY: Electronics, Furniture
WARRANTY: Included, "Not Included"
PRICE: 90, 150
DISCOUNT: YES, NO

IF [CATEGORY] = "Electronics" THEN [WARRANTY] = "Included" ELSE [WARRANTY] = "Not Included";
IF [PRICE] > 100 THEN [DISCOUNT] = "YES" ELSE [DISCOUNT] = "NO";
    `);

    const row1 = { CATEGORY: 'Electronics', WARRANTY: 'Included', PRICE: 150, DISCOUNT: 'YES' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { CATEGORY: 'Furniture', WARRANTY: 'Not Included', PRICE: 90, DISCOUNT: 'NO' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { CATEGORY: 'Electronics', WARRANTY: 'Not Included', PRICE: 150, DISCOUNT: 'NO' };
    expect(model.filter(row3)).toBe(false);

    const row4 = { CATEGORY: 'Furniture', WARRANTY: 'Not Included', PRICE: 150, DISCOUNT: 'YES' };
    expect(model.filter(row4)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 5)', () => {
    const model = new PictModel(`
COLOR: Red, Blue
CATEGORY: Primary, Secondary
QUANTITY: 5, 20
STOCK: Low, High

IF [COLOR] = "Red" THEN [CATEGORY] = "Primary" ELSE [CATEGORY] = "Secondary";
IF [QUANTITY] < 10 THEN [STOCK] = "Low" ELSE [STOCK] = "High";
    `);

    const row1 = { COLOR: 'Red', CATEGORY: 'Primary', QUANTITY: 5, STOCK: 'Low' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { COLOR: 'Blue', CATEGORY: 'Secondary', QUANTITY: 20, STOCK: 'High' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { COLOR: 'Red', CATEGORY: 'Secondary', QUANTITY: 5, STOCK: 'High' };
    expect(model.filter(row3)).toBe(false);

    const row4 = { COLOR: 'Red', CATEGORY: 'Primary', QUANTITY: 20, STOCK: 'High' };
    expect(model.filter(row4)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 6)', () => {
    const model = new PictModel(`
SIZE: Large, Medium
AVAILABILITY: "In Stock", "Out of Stock"
DISCOUNT: YES, NO
MEMBER: YES, NO
PRICE: 90, 110, 120

IF [SIZE] = "Large" THEN [AVAILABILITY] = "In Stock" ELSE [AVAILABILITY] = "Out of Stock";
IF ([DISCOUNT] = "YES" AND [MEMBER] = "YES") THEN [PRICE] < 100 ELSE [PRICE] >= 100;
    `);

    const row1 = { SIZE: 'Large', AVAILABILITY: 'In Stock', DISCOUNT: 'YES', MEMBER: 'YES', PRICE: 90 };
    expect(model.filter(row1)).toBe(true);

    const row2 = { SIZE: 'Medium', AVAILABILITY: 'Out of Stock', DISCOUNT: 'NO', MEMBER: 'NO', PRICE: 120 };
    expect(model.filter(row2)).toBe(true);

    const row3 = { SIZE: 'Large', AVAILABILITY: 'In Stock', DISCOUNT: 'YES', MEMBER: 'NO', PRICE: 110 };
    expect(model.filter(row3)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 7)', () => {
    const model = new PictModel(`
SEASON: Winter, Summer
CLOTHING: Coat, Shirt
TEMP: -5, 5, 25
WEATHER: Snowy, Sunny
ACTIVITY: Skiing, Running

IF [SEASON] = "Winter" THEN [CLOTHING] = "Coat" ELSE [CLOTHING] = "Shirt";
IF ([TEMP] < 0 AND [WEATHER] = "Snowy") THEN [ACTIVITY] = "Skiing" ELSE [ACTIVITY] = "Running";
    `);

    const row1 = { SEASON: 'Winter', CLOTHING: 'Coat', TEMP: -5, WEATHER: 'Snowy', ACTIVITY: 'Skiing' };
    expect(model.filter(row1)).toBe(true);

    const row2 = { SEASON: 'Summer', CLOTHING: 'Shirt', TEMP: 25, WEATHER: 'Sunny', ACTIVITY: 'Running' };
    expect(model.filter(row2)).toBe(true);

    const row3 = { SEASON: 'Winter', CLOTHING: 'Coat', TEMP: 5, WEATHER: 'Sunny', ACTIVITY: 'Running' };
    expect(model.filter(row3)).toBe(true);
  });
});

describe('PictModel invalid constraints', () => {
  it('Unknown comparer', () => {
    const model = new PictModel(`
NAME: Alice
STATUS: Active, Inactive

IF [NAME] @ "Alice" THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Unknown comparison operator: @');
  });

  it('Comparison operator missing, got a value', () => {
    const model = new PictModel(`
NAME: Alice
STATUS: Active, Inactive

IF [NAME] "Alice" THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Expected comparison operator but found value: "Alice"');
  });

  it('Comparison operator missing, got an operator', () => {
    const model = new PictModel(`
NAME: Alice
STATUS: Active, Inactive

IF [NAME] AND TRUE THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Expected comparison operator but found operator: AND');
  });

  it('Comparison operator and value missing, got then', () => {
    const model = new PictModel(`
NAME: Summer
STATUS: Active, Inactive

IF [NAME] THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive"
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('A comparison operator and value are required after the field.');
  });

  it('Nothing after IF', () => {
    const model = new PictModel(`
STATUS: Active, Inactive

IF THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive"
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Expected field or value after "IF", "THEN", "ELSE"');
  });

  it('Nothing after THEN', () => {
    const model = new PictModel(`
NAME: Summer
STATUS: Active

IF [NAME] = "Summer" THEN ELSE [STATUS] = "Active"
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Expected field or value after "IF", "THEN", "ELSE"');
  });

  it('Nothing after ELSE', () => {
    const model = new PictModel(`
NAME: Summer
STATUS: Active

IF [NAME] = "Summer" THEN [STATUS] = "Active" ELSE
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Expected field or value after "IF", "THEN", "ELSE"');
  });

  it('IF is missing, typo', () => {
    const model = new PictModel(`
NAME: Summer
STATUS: Active

F [NAME] = "Summer" THEN [STATUS] = "Active"
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Unknown token: F');
  });

  it('IF is nothing', () => {
    // Without IF, `[NAME] = "Summer"` is parsed as an unconditional constraint,
    // then `THEN` is unexpected and causes an error.
    const model = new PictModel(`
NAME: Summer
STATUS: Active

[NAME] = "Summer" THEN [STATUS] = "Active"
    `);
    // 1 valid unconditional constraint + 1 error (THEN is unexpected)
    expect(model.constraints).toHaveLength(1);
    expect(errorMessages(model)).toHaveLength(1);
    expect(errorMessages(model)[0]).toMatch(/Expected/); // THEN is unexpected
  });

  it('Multiple invalid expressions', () => {
    const model = new PictModel(`
NAME: Summer
STATUS: Active

IF [NAME] THEN [STATUS] = "Active";
IF [NAME] = "Summer" THEN [STATUS] = "Active";
IF [NAME] = "Summer" THEN [STATUS] = "Active" ELSE;
IF [NAME] = "Summer" THEN [STATUS] = "Active";
IF [NAME] @ "Summer" THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive";
    `);

    expect(errorMessages(model)).toEqual([
      'A comparison operator and value are required after the field.',
      'Expected field or value after "IF", "THEN", "ELSE"',
      'Unknown comparison operator: @',
    ]);

    // Only valid constraints are returned (nulls filtered out)
    expect(model.constraints).toHaveLength(2);
  });

  it('Unterminated string literal', () => {
    const model = new PictModel(`
NAME: Alice
STATUS: Active

IF [NAME] = "Alice THEN [STATUS] = "Active";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toMatch(/Unterminated string literal/);
  });

  it('Unterminated field reference', () => {
    const model = new PictModel(`
NAME: Alice

IF [NAME
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toMatch(/Unterminated field reference/);
  });

  it('Unterminated set (missing closing brace)', () => {
    const model = new PictModel(`
COLOR: Red, Blue
CATEGORY: Primary

IF [COLOR] IN {"Red", "Blue" THEN [CATEGORY] = "Primary";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toMatch(/Unterminated set/);
  });

  it('Empty IN set', () => {
    const model = new PictModel(`
COLOR: Red
CATEGORY: Primary

IF [COLOR] IN {} THEN [CATEGORY] = "Primary";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toBe('Empty set in IN clause');
  });

  it('!= operator suggests <>', () => {
    const model = new PictModel(`
NAME: Alice
STATUS: Active

IF [NAME] != "Alice" THEN [STATUS] = "Active";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toMatch(/Use "<>" for inequality/);
  });

  it('IF without THEN', () => {
    const model = new PictModel(`
NAME: Alice
STATUS: Active

IF [NAME] = "Alice" [STATUS] = "Active";
    `);
    expect(errorMessages(model).length).toBe(1);
    expect(errorMessages(model)[0]).toMatch(/Expected "THEN" but found/);
  });
});
