import { PictModel } from '../pict';
import * as fs from 'fs';
import * as path from 'path';

describe('heavy.pict coverage check', () => {
  it('checks pairwise coverage of PICT output', () => {
    const modelText = fs.readFileSync(
      path.resolve(__dirname, '../../../heavy.pict'),
      'utf-8',
    );
    const model = new PictModel(modelText);
    const factors = model.parameters;
    const keys = Object.keys(factors);

    // The 65 rows from PICT output
    const rawRows = `EU	fr	EUR	Tablet	Chrome	Guest	PayPal	PickupPoint	None	Single	Fashion	InStock	Reject	Exclusive	Home	Evening	Message	None	None	New	No	No
US	en	USD	Desktop	Chrome	Premium	DebitCard	Express	BULK20	Bulk	Grocery	InStock	Pass	Exclusive	Hotel	Morning	WrapAndMessage	Partial	Plus	Established	Yes	Yes
US	zh	USD	iOSApp	Safari	Guest	CreditCard	Standard	FREESHIP	Large	Electronics	BackOrder	Review	Exclusive	POBox	Night	Wrap	None	None	Recent	No	Yes
JP	en	JPY	MobileWeb	Chrome	Member	BankTransfer	StorePickup	Welcome10	Small	Furniture	BackOrder	Review	Inclusive	Home	None	None	Partial	Basic	New	Yes	No
US	zh	USD	AndroidApp	Chrome	Member	BankTransfer	Standard	None	Medium	Subscription	LowStock	Pass	Exclusive	Office	Afternoon	Message	None	Basic	Old	Yes	No
JP	ja	JPY	iOSApp	Safari	Corporate	DebitCard	Standard	FREESHIP	Single	Subscription	LowStock	Pass	Inclusive	Office	Evening	WrapAndMessage	Partial	None	Established	No	Yes
APAC	en	JPY	AndroidApp	Chrome	Corporate	Invoice	Standard	Welcome10	Single	Grocery	PreOrder	Review	Inclusive	POBox	Afternoon	Wrap	None	Basic	New	No	Yes
EU	fr	EUR	iOSApp	Safari	Premium	ApplePay	Express	VIP15	Large	Grocery	LowStock	Review	Inclusive	Office	None	None	Partial	Plus	Recent	Yes	Yes
JP	ja	JPY	MobileWeb	Chrome	Premium	CreditCard	Standard	None	Medium	Fashion	PreOrder	Review	Inclusive	Hotel	Night	Message	Full	Plus	Old	No	No
APAC	zh	JPY	AndroidApp	Chrome	Premium	GooglePay	Express	VIP15	Small	Furniture	InStock	Pass	Exclusive	Hotel	Evening	None	None	None	Old	No	Yes
JP	ja	JPY	Desktop	Chrome	Corporate	Invoice	SameDay	None	Large	Electronics	InStock	Reject	Inclusive	Home	Afternoon	WrapAndMessage	None	Basic	Recent	Yes	No
EU	zh	EUR	MobileWeb	Chrome	Corporate	Invoice	Standard	BULK20	Bulk	Digital	BackOrder	Pass	Exclusive	Home	Night	None	None	None	Established	Yes	No
JP	ja	JPY	AndroidApp	Chrome	Premium	GooglePay	StorePickup	VIP15	Bulk	Electronics	BackOrder	Pass	Inclusive	POBox	Morning	Message	Partial	Plus	New	No	No
EU	de	EUR	Tablet	Chrome	Member	CreditCard	Standard	BULK20	Bulk	Subscription	LowStock	Review	Inclusive	POBox	None	Wrap	Partial	Basic	Old	Yes	Yes
JP	zh	JPY	Desktop	Chrome	Guest	CreditCard	SameDay	Welcome10	Small	Fashion	LowStock	Pass	Inclusive	Office	Morning	Wrap	None	None	New	No	Yes
EU	de	EUR	iOSApp	Safari	Member	ApplePay	PickupPoint	FREESHIP	Medium	Fashion	InStock	Review	Exclusive	Hotel	Morning	WrapAndMessage	Partial	Basic	New	Yes	No
EU	en	EUR	AndroidApp	Chrome	Premium	GooglePay	PickupPoint	None	Medium	Furniture	LowStock	Reject	Inclusive	Office	Night	Wrap	None	Plus	Recent	Yes	Yes
EU	fr	EUR	Desktop	Chrome	Guest	PayPal	Standard	Welcome10	Medium	Subscription	BackOrder	Pass	Exclusive	Hotel	Night	WrapAndMessage	None	None	New	No	Yes
EU	de	EUR	MobileWeb	Chrome	Guest	PayPal	Standard	None	Small	Electronics	PreOrder	Reject	Exclusive	Office	None	None	None	None	Established	No	Yes
EU	de	EUR	Tablet	Chrome	Premium	DebitCard	Standard	Welcome10	Large	Digital	PreOrder	Pass	Inclusive	Home	Evening	None	Partial	Plus	New	Yes	Yes
APAC	en	JPY	iOSApp	Safari	Premium	DebitCard	Standard	None	Bulk	Digital	LowStock	Review	Exclusive	Home	Afternoon	None	Full	None	Recent	Yes	No
JP	en	JPY	MobileWeb	Chrome	Guest	PayPal	SameDay	FREESHIP	Large	Grocery	LowStock	Review	Inclusive	Home	Morning	Message	None	None	Old	No	No
JP	zh	JPY	iOSApp	Safari	Premium	ApplePay	StorePickup	None	Single	Furniture	BackOrder	Review	Inclusive	POBox	Evening	Wrap	Full	Basic	Established	Yes	Yes
EU	fr	EUR	MobileWeb	Chrome	Member	BankTransfer	PickupPoint	Welcome10	Bulk	Electronics	InStock	Pass	Inclusive	POBox	Evening	Wrap	None	None	New	Yes	No
JP	en	JPY	Tablet	Chrome	Premium	CreditCard	StorePickup	VIP15	Medium	Grocery	LowStock	Pass	Inclusive	Hotel	Evening	WrapAndMessage	None	Basic	Recent	Yes	Yes
US	zh	USD	iOSApp	Safari	Corporate	ApplePay	Standard	None	Small	Digital	PreOrder	Reject	Exclusive	Home	None	None	None	Basic	Old	No	Yes
APAC	zh	JPY	Tablet	Chrome	Corporate	Invoice	Standard	None	Small	Subscription	BackOrder	Reject	Inclusive	Office	Morning	Message	None	None	Recent	Yes	Yes
EU	fr	EUR	Desktop	Chrome	Member	BankTransfer	Standard	FREESHIP	Single	Digital	InStock	Review	Inclusive	Home	Morning	None	None	Basic	Established	Yes	Yes
EU	fr	EUR	AndroidApp	Chrome	Premium	GooglePay	PickupPoint	None	Small	Fashion	InStock	Pass	Inclusive	Office	None	WrapAndMessage	Full	Plus	Established	Yes	Yes
APAC	zh	JPY	iOSApp	Safari	Premium	ApplePay	Express	VIP15	Medium	Electronics	LowStock	Pass	Inclusive	Home	Night	Message	Partial	Basic	Established	Yes	Yes
EU	fr	EUR	Desktop	Chrome	Corporate	CreditCard	PickupPoint	BULK20	Bulk	Furniture	BackOrder	Pass	Inclusive	Office	Afternoon	None	Partial	None	Old	No	Yes
EU	de	EUR	MobileWeb	Chrome	Premium	DebitCard	Express	VIP15	Single	Fashion	BackOrder	Pass	Inclusive	Hotel	Afternoon	Wrap	None	Plus	Recent	Yes	Yes
APAC	zh	JPY	Tablet	Chrome	Member	BankTransfer	Standard	None	Large	Furniture	PreOrder	Pass	Inclusive	Hotel	Night	WrapAndMessage	Partial	None	Recent	Yes	Yes
JP	ja	JPY	iOSApp	Safari	Guest	PayPal	SameDay	Welcome10	Medium	Fashion	InStock	Pass	Inclusive	Hotel	None	None	None	None	New	No	Yes
APAC	en	JPY	AndroidApp	Chrome	Guest	CreditCard	Standard	FREESHIP	Single	Digital	InStock	Pass	Inclusive	Home	None	None	None	None	Old	No	Yes
EU	de	EUR	AndroidApp	Chrome	Premium	GooglePay	Standard	None	Large	Subscription	PreOrder	Review	Inclusive	Home	Morning	Wrap	Full	Plus	New	Yes	Yes
EU	de	EUR	Desktop	Chrome	Member	DebitCard	Express	None	Medium	Furniture	InStock	Reject	Inclusive	POBox	None	Message	None	Basic	New	No	Yes
US	zh	USD	MobileWeb	Chrome	Premium	DebitCard	Express	None	Single	Electronics	InStock	Pass	Exclusive	Hotel	Night	WrapAndMessage	Full	Plus	Old	Yes	Yes
APAC	en	JPY	iOSApp	Safari	Premium	ApplePay	Standard	FREESHIP	Small	Subscription	InStock	Pass	Inclusive	POBox	Afternoon	None	None	Plus	Established	Yes	Yes
JP	ja	JPY	Tablet	Chrome	Member	BankTransfer	SameDay	BULK20	Bulk	Electronics	InStock	Pass	Inclusive	Home	Evening	Message	Partial	None	Established	Yes	Yes
JP	en	JPY	Desktop	Chrome	Corporate	Invoice	StorePickup	None	Large	Fashion	InStock	Reject	Inclusive	Hotel	Evening	None	None	None	Old	Yes	Yes
US	zh	USD	Tablet	Chrome	Guest	PayPal	Express	Welcome10	Single	Fashion	InStock	Pass	Exclusive	POBox	Afternoon	Wrap	None	None	New	No	Yes
JP	ja	JPY	AndroidApp	Chrome	Premium	DebitCard	SameDay	None	Small	Grocery	InStock	Pass	Inclusive	Home	Night	Wrap	Full	Plus	New	Yes	Yes
EU	de	EUR	AndroidApp	Chrome	Member	GooglePay	Standard	None	Bulk	Grocery	BackOrder	Reject	Inclusive	POBox	Afternoon	WrapAndMessage	None	Basic	New	Yes	Yes
JP	ja	JPY	Tablet	Chrome	Corporate	Invoice	Express	FREESHIP	Medium	Furniture	LowStock	Pass	Inclusive	Home	None	None	Partial	None	New	Yes	Yes
APAC	en	JPY	iOSApp	Safari	Member	BankTransfer	Standard	BULK20	Bulk	Fashion	PreOrder	Pass	Inclusive	Home	None	None	None	None	Recent	Yes	Yes
US	en	USD	Desktop	Chrome	Corporate	Invoice	Standard	Welcome10	Single	Furniture	PreOrder	Pass	Exclusive	Home	Evening	Message	None	None	New	Yes	Yes
EU	de	EUR	Desktop	Chrome	Member	BankTransfer	Express	FREESHIP	Bulk	Grocery	InStock	Pass	Inclusive	Home	Night	None	None	None	New	Yes	Yes
APAC	en	JPY	Desktop	Chrome	Guest	PayPal	Standard	None	Single	Furniture	InStock	Pass	Inclusive	Home	Morning	None	None	None	Recent	No	Yes
JP	en	JPY	Desktop	Chrome	Guest	DebitCard	StorePickup	None	Large	Electronics	InStock	Pass	Inclusive	Office	Night	None	None	None	Established	No	Yes
JP	ja	JPY	iOSApp	Safari	Premium	ApplePay	Standard	VIP15	Medium	Digital	PreOrder	Pass	Inclusive	Home	None	None	None	None	New	Yes	Yes
JP	zh	JPY	AndroidApp	Chrome	Corporate	GooglePay	StorePickup	BULK20	Bulk	Grocery	InStock	Pass	Inclusive	Home	Afternoon	None	None	None	New	Yes	Yes
JP	ja	JPY	AndroidApp	Chrome	Guest	GooglePay	SameDay	FREESHIP	Single	Electronics	InStock	Pass	Inclusive	Home	None	None	None	None	New	No	Yes
JP	ja	JPY	AndroidApp	Chrome	Guest	PayPal	StorePickup	None	Single	Electronics	InStock	Pass	Inclusive	Home	None	None	None	None	New	No	Yes
EU	fr	EUR	iOSApp	Safari	Corporate	Invoice	Standard	None	Single	Electronics	PreOrder	Pass	Inclusive	Home	None	None	None	None	New	Yes	Yes
APAC	en	JPY	MobileWeb	Chrome	Guest	PayPal	Standard	None	Single	Digital	InStock	Pass	Inclusive	Home	None	None	None	None	New	No	Yes
EU	zh	EUR	Desktop	Chrome	Premium	DebitCard	PickupPoint	VIP15	Large	Electronics	InStock	Pass	Inclusive	Home	None	None	None	None	New	Yes	Yes
US	en	USD	AndroidApp	Chrome	Premium	GooglePay	Standard	VIP15	Single	Subscription	InStock	Pass	Exclusive	Home	None	None	None	None	New	Yes	Yes
EU	de	EUR	Desktop	Chrome	Corporate	Invoice	PickupPoint	None	Single	Electronics	InStock	Pass	Inclusive	Home	None	None	None	None	New	Yes	Yes
JP	ja	JPY	MobileWeb	Chrome	Guest	CreditCard	Standard	None	Single	Subscription	InStock	Reject	Inclusive	Home	None	None	None	None	Established	No	Yes
JP	ja	JPY	AndroidApp	Chrome	Guest	GooglePay	Standard	Welcome10	Single	Digital	InStock	Pass	Inclusive	Home	None	None	None	None	New	No	Yes
JP	ja	JPY	iOSApp	Safari	Premium	ApplePay	SameDay	VIP15	Single	Electronics	InStock	Pass	Inclusive	Home	None	None	None	None	New	Yes	Yes
EU	fr	EUR	Desktop	Chrome	Premium	DebitCard	Standard	None	Single	Electronics	InStock	Pass	Inclusive	Home	None	None	Full	None	New	Yes	Yes
JP	ja	JPY	iOSApp	Safari	Guest	ApplePay	Standard	Welcome10	Single	Electronics	InStock	Pass	Inclusive	Home	None	None	None	None	New	No	Yes
JP	ja	JPY	Tablet	Chrome	Premium	CreditCard	Express	None	Single	Electronics	InStock	Pass	Inclusive	Home	None	None	Full	None	New	Yes	Yes`;

    const rows = rawRows.split('\n').map(line => {
      const vals = line.split('\t');
      const obj: Record<string, string> = {};
      keys.forEach((k, i) => { obj[k] = vals[i]; });
      return obj;
    });

    console.log(`Rows: ${rows.length}`);

    // Check constraint violations
    let violations = 0;
    for (const r of rows) {
      if (!model.filter(r)) {
        violations++;
      }
    }
    console.log(`Constraint violations: ${violations}`);

    // Compute pairwise coverage
    // Total possible pairs = sum over all factor pairs of |fi| * |fj|
    // Covered = pairs that appear in at least one row
    const covered = new Set<string>();
    let totalPossible = 0;

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const ki = keys[i];
        const kj = keys[j];
        const vi = factors[ki];
        const vj = factors[kj];
        totalPossible += vi.length * vj.length;

        for (const row of rows) {
          covered.add(`${ki}=${row[ki]}|${kj}=${row[kj]}`);
        }
      }
    }

    // Count how many of the "possible" pairs actually appear
    // But some pairs are impossible due to constraints, so we also
    // count "feasible" pairs
    let coveredCount = 0;
    let infeasibleCount = 0;
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const ki = keys[i];
        const kj = keys[j];
        for (const vi of factors[ki]) {
          for (const vj of factors[kj]) {
            const pairKey = `${ki}=${vi}|${kj}=${vj}`;
            if (covered.has(pairKey)) {
              coveredCount++;
            }
          }
        }
      }
    }

    const rawCoverage = coveredCount / totalPossible;
    console.log(`Total possible pairs: ${totalPossible}`);
    console.log(`Covered pairs: ${coveredCount}`);
    console.log(`Raw coverage: ${(rawCoverage * 100).toFixed(1)}%`);
    console.log(`Uncovered: ${totalPossible - coveredCount}`);

    // This is PICT's output, so coverage should be high
    expect(rawCoverage).toBeGreaterThan(0.5);
  });
});
