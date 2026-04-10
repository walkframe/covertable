import { make } from './index';
import { range } from './lib';

// 20 factors, each with 10 levels
const factors: string[][] = [];
for (let i = 0; i < 20; i++) {
  factors.push(range(0, 10).map((j: number) => `f${i}_${j}`));
}

let minRows = Infinity;
let bestSeed = 0;
const results: [number, number][] = [];

for (let salt = 1; salt <= 200; salt++) {
  const rows = make(factors, { salt: salt });
  const count = rows.length;
  results.push([salt, count]);
  if (count < minRows) {
    minRows = count;
    bestSeed = salt;
  }
  if (salt % 20 === 0) {
    console.log(`salt ${salt}: ${count} rows (best so far: salt=${bestSeed}, rows=${minRows})`);
  }
}

console.log(`\n=== RESULT ===`);
console.log(`Best salt: ${bestSeed}`);
console.log(`Min rows: ${minRows}`);

results.sort((a, b) => a[1] - b[1]);
console.log(`\nTop 10 salts:`);
for (let i = 0; i < 10; i++) {
  console.log(`  salt=${results[i][0]}, rows=${results[i][1]}`);
}
