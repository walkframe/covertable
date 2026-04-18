import { Controller } from '../controller';
import type { Expression } from '../types';

describe('coverage benchmark', () => {
  it('constraint chain coverage', () => {
    const factors = {
      Language: ['de', 'en', 'ja', 'fr', 'es', 'pt', 'zh', 'ko', 'ru', 'ar'],
      Region: ['EU', 'NA', 'AP', 'SA', 'AF'],
      Currency: ['EUR', 'USD', 'GBP', 'JPY', 'BRL', 'CNY', 'KRW', 'RUB', 'AED'],
      OS: ['Windows', 'macOS', 'Linux', 'iOS', 'Android'],
      Browser: ['Chrome', 'Firefox', 'Safari', 'Edge'],
      Screen: ['1080p', '1440p', '4K', 'Mobile'],
      Theme: ['Light', 'Dark', 'Auto'],
      Auth: ['OAuth', 'SAML', 'Password', 'MFA'],
    };

    const constraints: Expression[] = [
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Language', value: 'de' },
        { operator: 'eq', left: 'Region', value: 'EU' },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Language', value: 'ja' },
        { operator: 'eq', left: 'Region', value: 'AP' },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Language', value: 'pt' },
        { operator: 'eq', left: 'Region', value: 'SA' },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Region', value: 'EU' },
        { operator: 'in', left: 'Currency', values: ['EUR', 'GBP'] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Region', value: 'AP' },
        { operator: 'in', left: 'Currency', values: ['JPY', 'CNY', 'KRW'] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Region', value: 'SA' },
        { operator: 'in', left: 'Currency', values: ['BRL'] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'OS', value: 'iOS' },
        { operator: 'in', left: 'Browser', values: ['Safari', 'Chrome'] },
      ]},
      { operator: 'or', conditions: [
        { operator: 'ne', left: 'Screen', value: 'Mobile' },
        { operator: 'in', left: 'OS', values: ['iOS', 'Android'] },
      ]},
    ];

    const t0 = Date.now();
    const ctrl = new Controller(factors, { constraints });
    const rows = [...ctrl.makeAsync()];
    const t1 = Date.now();

    let violations = 0;
    for (const r of rows as any[]) {
      if (r.Language === 'de' && r.Region !== 'EU') violations++;
      if (r.Language === 'ja' && r.Region !== 'AP') violations++;
      if (r.Language === 'pt' && r.Region !== 'SA') violations++;
      if (r.Region === 'EU' && !['EUR','GBP'].includes(r.Currency)) violations++;
      if (r.Region === 'AP' && !['JPY','CNY','KRW'].includes(r.Currency)) violations++;
      if (r.Region === 'SA' && !['BRL'].includes(r.Currency)) violations++;
      if (r.OS === 'iOS' && !['Safari','Chrome'].includes(r.Browser)) violations++;
      if (r.Screen === 'Mobile' && !['iOS','Android'].includes(r.OS)) violations++;
    }

    console.log(`Rows: ${rows.length}`);
    console.log(`Time: ${t1 - t0}ms`);
    console.log(`Progress: ${(ctrl.progress * 100).toFixed(1)}%`);
    console.log(`Violations: ${violations}`);

    expect(violations).toBe(0);
    expect(ctrl.progress).toBeGreaterThan(0.95);
  });
});
