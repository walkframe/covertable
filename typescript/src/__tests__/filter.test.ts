import { make, DictType, SuggestRowType } from "../";
  
const machine = ["iPhone", "Pixel", "XPERIA", "ZenFone", "Galaxy"];
const os = ["iOS", "Android"];
const browser = ["FireFox", "Chrome", "Safari"];

test('exclude impossible combinations', () => {
  const factors = {machine, os, browser};
  const preFilter = (row: DictType) => {
    return !(
      (row.machine === 'iPhone' && row.os !== 'iOS') || 
      (row.machine !== 'iPhone' && row.os === 'iOS')
    );
  };
  const rows = make(factors, { preFilter });
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
  const preFilter = (row: SuggestRowType<typeof factors>) => row.machine === 'iPhone' && row.os === 'iOS';
  const rows = make(factors, { preFilter });
  expect(rows.length).toBe(browser.length);
  expect(rows.filter(row => row.machine === 'iPhone' && row.os === 'iOS').length).toBe(browser.length);
  expect(rows.filter(row => row.machine === 'Pixel').length).toBe(0);
  expect(rows.filter(row => row.os == 'Android').length).toBe(0);
});


test('Use a constant-false function for preFilter', () => {
  const factors = {machine, os, browser};
  const preFilter = (row: DictType) => false;
  const rows = make(factors, { preFilter });
  expect(rows).toEqual([]);
});

test('Use the wrong conditional function for preFilter', () => {
  const factors = {machine, os, browser};
  const preFilter = (row: DictType) => row.machine === 'WindowsPhone';
  const rows = make(factors, { preFilter });
  expect(rows).toEqual([]);
});
