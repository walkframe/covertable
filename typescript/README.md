[![npm version](https://badge.fury.io/js/covertable.svg)](https://badge.fury.io/js/covertable)
[![Workflow](https://github.com/walkframe/covertable/actions/workflows/typescript.yaml/badge.svg)](https://github.com/walkframe/covertable/actions/workflows/typescript.yaml)
[![codecov](https://codecov.io/gh/walkframe/covertable/branch/master/graph/badge.svg)](https://codecov.io/gh/walkframe/covertable)

# What is covertable?
covertable is a powerful tool for generating pairwise combinations of input factors, designed for both Node.js and browser environments. It's easy to use, flexible, and supports advanced filtering options, making it perfect for testing scenarios and generating comprehensive datasets.

# Installation

```sh
$ npm install covertable --save
```

# Usage

## Simple usage in Node.js:

```javascript
var covertable = require('covertable');
var make = covertable.make;

var machine = ["iPhone", "Pixel", "XPERIA", "ZenFone", "Galaxy"];
var os = ["iOS", "Android"];
var browser = ["FireFox", "Chrome", "Safari"];

make([machine, os, browser]);
```
Output:

```javascript
[
  [ 'Pixel', 'iOS', 'Chrome' ],
  [ 'ZenFone', 'iOS', 'FireFox' ],
  [ 'Pixel', 'Android', 'Safari' ],
  [ 'Galaxy', 'Android', 'Chrome' ],
  [ 'XPERIA', 'Android', 'FireFox' ],
  [ 'Pixel', 'iOS', 'FireFox' ],
  [ 'iPhone', 'iOS', 'Safari' ],
  [ 'Galaxy', 'iOS', 'Safari' ],
  [ 'XPERIA', 'iOS', 'Chrome' ],
  [ 'ZenFone', 'Android', 'Chrome' ],
  [ 'Galaxy', 'iOS', 'FireFox' ],
  [ 'iPhone', 'Android', 'Chrome' ],
  [ 'iPhone', 'iOS', 'FireFox' ],
  [ 'ZenFone', 'iOS', 'Safari' ],
  [ 'XPERIA', 'iOS', 'Safari' ]
]
```

Of course, it also works in the browser well.

## Advanced usage in TypeScript:

As previously mentioned, when elements are specified as an array, the results will also be in array form. However, if the elements are specified as an object, the results will be in object form. 

The following example uses preFilter and postFilter to apply constraints to the output results. In this case, `SuggestRowType` can also be used to infer the type of row parameters that the filter function receives.

```typescript
import { make, sorters, criteria, SuggestRowType, DictType } from "covertable";

const machine = ["iPhone", "Pixel", "XPERIA", "ZenFone", "Galaxy"];
const os = ["iOS", "Android"];
const browser = ["FireFox", "Chrome", "Safari"];

const factors = {machine, os, browser};

make(factors, { // optional
  length: 2,
  // SuggestRowType<typeof factors> is { machine: string, os: string, browser: string }
  preFilter: (row: SuggestRowType<typeof factors>) => !(row.os === 'Android' && row.machine !== 'Pixel'), // default: null
  // Or DictType that is { [key: string]: string }
  postFilter: (row: DictType) => !(row.os === 'iOS' && row.browser !== 'Safari'), // default: null
});
```

Then the output will change as follows:

```typescript
[ // filtered
  { machine: 'Pixel', os: 'Android', browser: 'FireFox' },
  { machine: 'iPhone', os: 'iOS', browser: 'Safari' },
  { machine: 'Galaxy', browser: 'Safari', os: 'iOS' },
  { machine: 'Pixel', browser: 'Safari', os: 'iOS' },
  { machine: 'ZenFone', browser: 'Safari', os: 'iOS' },
  { machine: 'XPERIA', browser: 'Safari', os: 'iOS' }
]
```

You can use also `makeAsync` function (generator).
- It receives the same arguments with `make` function.
- It returns the row at the time it's made.

```js
import { makeAsync } from "covertable";

for await (const row of makeAsync([machine, os, browser])) {
  console.log(row);
}
```

## Options
The `covertable.make` function accepts an options object as its second argument. Here are the available options:

### length
Number of factors to be covered. (default: 2)

Obviously the more it increases, the more number of combinations increases.

### sorter
Determines the order of combinations.

- sorters.random: It makes different combinations everytime. (fastest)
- sorters.hash: It makes combinations depending on hash of the pair and seed. (default)

  - It receives `seed`.
    - `seed` option decides the order of storing from unstored pairs.
    - When the combination of factors and seed are the same, covertable reproduces the same collective.

### criterion
Determines the efficiency of combinations.

- `criteria.simple`: it extracts any pairs that can be stored into the processing row.
- `criteria.greedy`: it attempts to make most efficient combinations. (default)
  - It receives [tolerance](https://github.com/walkframe/covertable#tolerance) option.

While `criteria.simple` processes quickly, `criteria.greedy` makes fewer combinations.
Although the latter is superior to former in terms of fewer combinations generally, it is time-intensive process.

Not relevant options will be ignored.

### preFilter
Function to filter combinations before they are registered.

When the function returns `false`, the row combination will not be registered.
- If factors type is `Array`, you should specify an index at the subscript like `row => row[1] < 6`.
- If factors type is `Object`, you should specify a key at the subscript like `row => row.month < 6` or `row => row['month'] < 6`

### postFilter
Function to filter combinations after they are generated.

The usage is the same as `preFilter`, only the difference is the timing of the call.
It will delete rows not matched this function at the last.

For this reason, the final test cases may not satisfy the factors coverage.

### PictConstraintsLexer

Filter functions can also be generated using PictConstraintsLexer. Use as follows
This function is supported only in the typescript version.

```js
import { make, PictConstraintsLexer } from "covertable";

const machine = ["iPhone", "Pixel", "XPERIA", "ZenFone", "Galaxy"];
const os = ["iOS", "Android"];
const browser = ["FireFox", "Chrome", "Safari"];

const lexer = new PictConstraintsLexer(
  `
  IF [machine] = "iPhone" THEN [os] = "iOS";
  IF [os] = "iOS" THEN [machine] = "iPhone";
  `, true
);

make({machine, os, browser}, { // optional
  preFilter: lexer.filter,
});
```

```js
[
  { machine: 'ZenFone', browser: 'FireFox', os: 'Android' },
  { os: 'Android', browser: 'Safari', machine: 'Pixel' },
  { machine: 'Galaxy', browser: 'Chrome', os: 'Android' },
  { machine: 'XPERIA', os: 'Android', browser: 'FireFox' },
  { machine: 'Pixel', browser: 'Chrome', os: 'Android' },
  { os: 'iOS', browser: 'FireFox', machine: 'iPhone' },
  { machine: 'Pixel', browser: 'FireFox', os: 'Android' },
  { os: 'iOS', browser: 'Chrome', machine: 'iPhone' },
  { machine: 'Galaxy', browser: 'Safari', os: 'Android' },
  { machine: 'ZenFone', browser: 'Chrome', os: 'Android' },
  { os: 'iOS', browser: 'Safari', machine: 'iPhone' },
  { machine: 'Galaxy', browser: 'FireFox', os: 'Android' },
  { machine: 'XPERIA', browser: 'Chrome', os: 'Android' },
  { machine: 'ZenFone', browser: 'Safari', os: 'Android' },
  { machine: 'XPERIA', browser: 'Safari', os: 'Android' }
]
```

This feature acts as a conversion tool that enables the implementation of PICT constraint conditions within CoverTable, 
allowing users to seamlessly apply complex constraints to their test data generation.


# Requirements

ES2015 or later

- [Generator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators)
- [for...of](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for...of)
- [Map](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
- [Set](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set)
- [Object.keys](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys)
- [Object.entries](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/entries)

# Development

```sh
$ npm install
```

## Testing
```sh
$ npm test -- --coverage
```

## Publish

```sh
$ # npm adduser
$ npm run build
$ npm version patch
$ npm publish
```

# More information

- [walkframe/covertable - GitHub](https://github.com/walkframe/covertable)
