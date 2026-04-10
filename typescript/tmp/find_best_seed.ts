import make from '../src/index';
import { range } from '../src/lib';

// 10 factors, each with 20 levels = 10^20 combinations
const factors: string[][] = [];
for (let i = 0; i < 10; i++) {
  factors.push(range(0, 20).map((j: number) => `f${i}_${j}`));
}

let minRows = Infinity;
let bestSeed = 0;
const results: [number, number][] = [];

for (let seed = 1; seed <= 200; seed++) {
  const rows = make(factors, { seed });
  const count = rows.length;
  results.push([seed, count]);
  if (count < minRows) {
    minRows = count;
    bestSeed = seed;
  }
  if (seed % 20 === 0) {
    console.log(`seed ${seed}: ${count} rows (best so far: seed=${bestSeed}, rows=${minRows})`);
  }
}

console.log(`\n=== RESULT ===`);
console.log(`Best seed: ${bestSeed}`);
console.log(`Min rows: ${minRows}`);

// Show top 10 best seeds
results.sort((a, b) => a[1] - b[1]);
console.log(`\nTop 10 seeds:`);
for (let i = 0; i < 10; i++) {
  console.log(`  seed=${results[i][0]}, rows=${results[i][1]}`);
}
