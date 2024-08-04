import { PictConstraintsLexer } from "../utils/pict";

describe('PictConstraintsLexer with single constraints', () => {
  it('should filter correctly with LIKE and IN conditions', () => {
    const lexer = new PictConstraintsLexer(`
      IF [NAME] LIKE "Alic?" THEN [STATUS] IN {"Active", "Pending"} ELSE [AGE] > 20 OR [COUNTRY] = "USA";
    `, false);
    const row1 = { NAME: 'Alice', STATUS: 'Active' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', STATUS: 'Inactive' };
    expect(lexer.filter(row2)).toBe(false);
  });

  it('should filter correctly with numeric conditions', () => {
    const lexer = new PictConstraintsLexer(`
      IF [PRICE] > 100 THEN [DISCOUNT] = "YES" ELSE [DISCOUNT] = "NO";
    `, false);
    const row1 = { PRICE: 150, DISCOUNT: 'YES' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { PRICE: 90, DISCOUNT: 'NO' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { PRICE: 90, DISCOUNT: 'YES' };
    expect(lexer.filter(row3)).toBe(false);
  });

  it('should handle NOT conditions correctly', () => {
    const lexer = new PictConstraintsLexer(`
      IF NOT [PRODUCT] = "Book" THEN [AVAILABLE] = "Yes" ELSE [AVAILABLE] = "No";
    `, false);
    const row1 = { PRODUCT: 'Pen', AVAILABLE: 'Yes' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { PRODUCT: 'Book', AVAILABLE: 'No' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { PRODUCT: 'Pen', AVAILABLE: 'No' };
    expect(lexer.filter(row3)).toBe(false);
  });

  it('should filter with AND conditions', () => {
    const lexer = new PictConstraintsLexer(`
      IF [CATEGORY] = "Electronics" AND [BRAND] = "Sony" THEN [WARRANTY] = "Included" ELSE [WARRANTY] = "Not Included";
    `, false);
    const row1 = { CATEGORY: 'Electronics', BRAND: 'Sony', WARRANTY: 'Included' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { CATEGORY: 'Electronics', BRAND: 'Samsung', WARRANTY: 'Not Included' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { CATEGORY: 'Electronics', BRAND: 'Sony', WARRANTY: 'Not Included' };
    expect(lexer.filter(row3)).toBe(false);
  });

  it('should handle nested conditions with parentheses', () => {
    const lexer = new PictConstraintsLexer(`
      IF ([CATEGORY] = "Electronics" AND [BRAND] = "Sony") OR [BRAND] = "Apple" THEN [WARRANTY] = "Included" ELSE [WARRANTY] = "Not Included";
    `, false);
    const row1 = { CATEGORY: 'Electronics', BRAND: 'Sony', WARRANTY: 'Included' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { CATEGORY: 'Electronics', BRAND: 'Apple', WARRANTY: 'Included' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { CATEGORY: 'Furniture', BRAND: 'IKEA', WARRANTY: 'Not Included' };
    expect(lexer.filter(row3)).toBe(true);

    const row4 = { CATEGORY: 'Electronics', BRAND: 'Samsung', WARRANTY: 'Included' };
    expect(lexer.filter(row4)).toBe(false);
  });

  it('should handle string equality conditions', () => {
    const lexer = new PictConstraintsLexer(`
      IF [NAME] = "Bob" THEN [STATUS] = "Inactive" ELSE [STATUS] = "Active";
    `, false);
    const row1 = { NAME: 'Bob', STATUS: 'Inactive' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', STATUS: 'Active' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { NAME: 'Bob', STATUS: 'Active' };
    expect(lexer.filter(row3)).toBe(false);
  });

  it('should handle IN conditions', () => {
    const lexer = new PictConstraintsLexer(`
      IF [COLOR] IN {"Red", "Blue", "Green"} THEN [CATEGORY] = "Primary" ELSE [CATEGORY] = "Secondary";
    `, false);
    const row1 = { COLOR: 'Red', CATEGORY: 'Primary' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { COLOR: 'Yellow', CATEGORY: 'Secondary' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { COLOR: 'Red', CATEGORY: 'Secondary' };
    expect(lexer.filter(row3)).toBe(false);
  });

  it('should handle complex conditions with nested parentheses', () => {
    const lexer = new PictConstraintsLexer(`
      IF ([AGE] > 20 AND ([COUNTRY] = "USA" OR [COUNTRY] = "Canada")) THEN [STATUS] = "Allowed" ELSE [STATUS] = "Denied";
    `, false);
    const row1 = { AGE: 25, COUNTRY: 'USA', STATUS: 'Allowed' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { AGE: 18, COUNTRY: 'USA', STATUS: 'Denied' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { AGE: 25, COUNTRY: 'UK', STATUS: 'Denied' };
    expect(lexer.filter(row3)).toBe(true);

    const row4 = { AGE: 25, COUNTRY: 'Canada', STATUS: 'Allowed' };
    expect(lexer.filter(row4)).toBe(true);

    const row5 = { AGE: 25, COUNTRY: 'Canada', STATUS: 'Denied' };
    expect(lexer.filter(row5)).toBe(false);
  });
});

describe('PictConstraintsLexer with multiple constraints', () => {
  it('should handle multiple constraints correctly (Test Case 1)', () => {
    const lexer = new PictConstraintsLexer(`
      IF [NAME] = "Alice" THEN [AGE] > 20 ELSE [AGE] < 20;
      IF [COUNTRY] = "USA" THEN [STATUS] = "Active" ELSE [STATUS] = "Inactive";
    `, false);

    const row1 = { NAME: 'Alice', AGE: 25, COUNTRY: 'USA', STATUS: 'Active' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { NAME: 'Alice', AGE: 25, COUNTRY: 'Canada', STATUS: 'Inactive' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { NAME: 'Alice', AGE: 18, COUNTRY: 'USA', STATUS: 'Active' };
    expect(lexer.filter(row3)).toBe(false);

    const row4 = { NAME: 'Bob', AGE: 15, COUNTRY: 'USA', STATUS: 'Inactive' };
    expect(lexer.filter(row4)).toBe(false);
  });

  it('should handle multiple constraints correctly (Test Case 2)', () => {
    const lexer = new PictConstraintsLexer(`
      IF [SCORE] >= 90 THEN [GRADE] = "A" ELSE [GRADE] = "B";
      IF [MEMBER] = "YES" THEN [DISCOUNT] = "20%" ELSE [DISCOUNT] = "10%";
    `, false);

    const row1 = { SCORE: 95, GRADE: 'A', MEMBER: 'YES', DISCOUNT: '20%' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { SCORE: 85, GRADE: 'B', MEMBER: 'NO', DISCOUNT: '10%' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { SCORE: 85, GRADE: 'B', MEMBER: 'YES', DISCOUNT: '20%' };
    expect(lexer.filter(row3)).toBe(true);

    const row4 = { SCORE: 85, GRADE: 'A', MEMBER: 'YES', DISCOUNT: '10%' };
    expect(lexer.filter(row4)).toBe(false);
  });

  it('should handle multiple constraints correctly (Test Case 3)', () => {
    const lexer = new PictConstraintsLexer(`
      IF [TEMP] > 30 THEN [STATE] = "HOT" ELSE [STATE] = "COLD";
      IF [HUMIDITY] < 50 THEN [COMFORT] = "DRY" ELSE [COMFORT] = "HUMID";
    `, false);

    const row1 = { TEMP: 35, STATE: 'HOT', HUMIDITY: 45, COMFORT: 'DRY' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { TEMP: 25, STATE: 'COLD', HUMIDITY: 55, COMFORT: 'HUMID' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { TEMP: 25, STATE: 'HOT', HUMIDITY: 55, COMFORT: 'DRY' };
    expect(lexer.filter(row3)).toBe(false);

    const row4 = { TEMP: 35, STATE: 'HOT', HUMIDITY: 55, COMFORT: 'HUMID' };
    expect(lexer.filter(row4)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 4)', () => {
    const lexer = new PictConstraintsLexer(`
      IF [CATEGORY] = "Electronics" THEN [WARRANTY] = "Included" ELSE [WARRANTY] = "Not Included";
      IF [PRICE] > 100 THEN [DISCOUNT] = "YES" ELSE [DISCOUNT] = "NO";
    `, false);

    const row1 = { CATEGORY: 'Electronics', WARRANTY: 'Included', PRICE: 150, DISCOUNT: 'YES' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { CATEGORY: 'Furniture', WARRANTY: 'Not Included', PRICE: 90, DISCOUNT: 'NO' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { CATEGORY: 'Electronics', WARRANTY: 'Not Included', PRICE: 150, DISCOUNT: 'NO' };
    expect(lexer.filter(row3)).toBe(false);

    const row4 = { CATEGORY: 'Furniture', WARRANTY: 'Not Included', PRICE: 150, DISCOUNT: 'YES' };
    expect(lexer.filter(row4)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 5)', () => {
    const lexer = new PictConstraintsLexer(`
      IF [COLOR] = "Red" THEN [CATEGORY] = "Primary" ELSE [CATEGORY] = "Secondary";
      IF [QUANTITY] < 10 THEN [STOCK] = "Low" ELSE [STOCK] = "High";
    `, false);

    const row1 = { COLOR: 'Red', CATEGORY: 'Primary', QUANTITY: 5, STOCK: 'Low' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { COLOR: 'Blue', CATEGORY: 'Secondary', QUANTITY: 20, STOCK: 'High' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { COLOR: 'Red', CATEGORY: 'Secondary', QUANTITY: 5, STOCK: 'High' };
    expect(lexer.filter(row3)).toBe(false);

    const row4 = { COLOR: 'Red', CATEGORY: 'Primary', QUANTITY: 20, STOCK: 'High' };
    expect(lexer.filter(row4)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 6)', () => {
    const lexer = new PictConstraintsLexer(`
      IF [SIZE] = "Large" THEN [AVAILABILITY] = "In Stock" ELSE [AVAILABILITY] = "Out of Stock";
      IF ([DISCOUNT] = "YES" AND [MEMBER] = "YES") THEN [PRICE] < 100 ELSE [PRICE] >= 100;
    `, false);

    const row1 = { SIZE: 'Large', AVAILABILITY: 'In Stock', DISCOUNT: 'YES', MEMBER: 'YES', PRICE: 90 };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { SIZE: 'Medium', AVAILABILITY: 'Out of Stock', DISCOUNT: 'NO', MEMBER: 'NO', PRICE: 120 };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { SIZE: 'Large', AVAILABILITY: 'In Stock', DISCOUNT: 'YES', MEMBER: 'NO', PRICE: 110 };
    expect(lexer.filter(row3)).toBe(true);
  });

  it('should handle multiple constraints correctly (Test Case 7)', () => {
    const lexer = new PictConstraintsLexer(`
      IF [SEASON] = "Winter" THEN [CLOTHING] = "Coat" ELSE [CLOTHING] = "Shirt";
      IF ([TEMP] < 0 AND [WEATHER] = "Snowy") THEN [ACTIVITY] = "Skiing" ELSE [ACTIVITY] = "Running";
    `, false);

    const row1 = { SEASON: 'Winter', CLOTHING: 'Coat', TEMP: -5, WEATHER: 'Snowy', ACTIVITY: 'Skiing' };
    expect(lexer.filter(row1)).toBe(true);

    const row2 = { SEASON: 'Summer', CLOTHING: 'Shirt', TEMP: 25, WEATHER: 'Sunny', ACTIVITY: 'Running' };
    expect(lexer.filter(row2)).toBe(true);

    const row3 = { SEASON: 'Winter', CLOTHING: 'Coat', TEMP: 5, WEATHER: 'Sunny', ACTIVITY: 'Running' };
    expect(lexer.filter(row3)).toBe(true);
  });
});
