import { make, DictType, SuggestRowType } from "../";

const machine = ["iPhone", "Pixel", "XPERIA", "ZenFone", "Galaxy"];
const os = ["iOS", "Android"];
const browser = ["FireFox", "Chrome", "Safari"];

test('exclude impossible combinations', () => {
  const factors = {machine, os, browser};
  const rows = make(factors, {
    constraints: [
      // machine=iPhone ↔ os=iOS (bidirectional)
      { operator: 'or', conditions: [
        { operator: 'ne', field: 'machine', value: 'iPhone' },
        { operator: 'eq', field: 'os', value: 'iOS' },
      ]},
      { operator: 'or', conditions: [
        { operator: 'eq', field: 'machine', value: 'iPhone' },
        { operator: 'ne', field: 'os', value: 'iOS' },
      ]},
    ],
  });
  expect(rows.filter(row => row.machine === 'iPhone' && row.os === 'iOS').length).toBe(browser.length);
  expect(rows.filter(row => row.machine === 'iPhone' && row.os !== 'iOS').length).toBe(0);
  expect(rows.filter(row => row.machine !== 'iPhone' && row.os === 'iOS').length).toBe(0);

  expect(rows.filter(row => row.machine === 'Pixel' && row.os === 'Android').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.machine === 'XPERIA' && row.os === 'Android').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.machine === 'ZenFone' && row.os === 'Android').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.machine === 'Galaxy' && row.os === 'Android').length).toBeGreaterThanOrEqual(1);

  expect(rows.filter(row => row.machine === 'iPhone' && row.browser === 'FireFox').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.machine === 'iPhone' && row.browser === 'Chrome').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.machine === 'iPhone' && row.browser === 'Safari').length).toBeGreaterThanOrEqual(1);

  expect(rows.filter(row => row.machine === 'Pixel' && row.browser === 'FireFox').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.machine === 'Pixel' && row.browser === 'Chrome').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.machine === 'Pixel' && row.browser === 'Safari').length).toBeGreaterThanOrEqual(1);

  expect(rows.filter(row => row.os === 'iOS' && row.browser === 'FireFox').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.os === 'iOS' && row.browser === 'Chrome').length).toBeGreaterThanOrEqual(1);
  expect(rows.filter(row => row.os === 'iOS' && row.browser === 'Safari').length).toBeGreaterThanOrEqual(1);
});

test('Limited to iphone and iOS combinations only.', () => {
  const factors = {machine, os, browser};
  const rows = make(factors, {
    constraints: [
      { operator: 'eq', field: 'machine', value: 'iPhone' },
      { operator: 'eq', field: 'os', value: 'iOS' },
    ],
  });
  expect(rows.length).toBe(browser.length);
  expect(rows.filter(row => row.machine === 'iPhone' && row.os === 'iOS').length).toBe(browser.length);
  expect(rows.filter(row => row.machine === 'Pixel').length).toBe(0);
  expect(rows.filter(row => row.os == 'Android').length).toBe(0);
});


test('Use a constant-false constraint', () => {
  const factors = {machine, os, browser};
  const rows = make(factors, {
    constraints: [
      // No machine value equals 'WindowsPhone', so this rejects everything
      { operator: 'eq', field: 'machine', value: 'WindowsPhone' },
    ],
  });
  expect(rows).toEqual([]);
});
