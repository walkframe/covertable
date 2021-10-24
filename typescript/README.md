[![npm version](https://badge.fury.io/js/covertable.svg)](https://badge.fury.io/js/covertable)
[![CircleCI](https://circleci.com/gh/walkframe/covertable.svg?style=shield)](https://circleci.com/gh/walkframe/covertable)
[![codecov](https://codecov.io/gh/walkframe/covertable/branch/master/graph/badge.svg)](https://codecov.io/gh/walkframe/covertable)

# Installation

```sh
$ npm install covertable --save
```

# Usage

## Simple demo in Node.js:

```javascript
var covertable = require('covertable');
var make = covertable.default;

var machine = ['iphone', 'pixel'];
var os = ['ios', 'android'];
var browser = ['FireFox', 'Chrome', 'Safari'];

make([machine, os, browser]);
```
Output:

```javascript
[
  [ 'pixel', 'android', 'Chrome' ],
  [ 'pixel', 'ios', 'Safari' ],
  [ 'pixel', 'android', 'FireFox' ],
  [ 'iphone', 'android', 'Safari' ],
  [ 'iphone', 'ios', 'Chrome' ],
  [ 'iphone', 'ios', 'FireFox' ]
]
```

Of course, it also works in the browser well.

## Advanced demo in TypeScript:

```typescript
import { default as make, makeAsync, sorters, criteria } from "covertable";

const machine = ['iphone', 'pixel'];
const os = ['ios', 'android'];
const browser = ['FireFox', 'Chrome', 'Safari'];

make([machine, os, browser], { // optional
  length: 2, // default: 2
  criterion: criteria.simple, // default: criteria.greedy
  sorter: sorters.random, // default: sorters.hash
  preFilter: (row: any) => !(row[1] === 'android' && row[0] !== 'pixel'), // default: null
  postFilter: (row: any) => !(row[1] === 'ios' && row[2] !== 'Safari'), // default: null
});
```

Output:

```typescript
[ // filtered
  [ 'iphone', 'ios', 'Safari' ],
  [ 'pixel', 'android', 'Chrome' ],
  [ 'pixel', 'ios', 'Safari' ]
]
```

You can use also `makeAsync` function (generator).
- It receives the same arguments with `make` function.
- It returns the row at the time it's made.

## Object input and output

You can specify `factors` as object type:

```typescript
import { default as make, sorters, criteria } from "covertable";

const machine = ['iphone', 'pixel'];
const os = ['ios', 'android'];
const browser = ['FireFox', 'Chrome', 'Safari'];

make({machine, os, browser}, { // optional
  length: 2,
  preFilter: (row: any) => !(row.os === 'android' && row.machine !== 'pixel'), // default: null
  postFilter: (row: any) => !(row.os === 'ios' && row.browser !== 'Safari'), // default: null
});
```

Then the output will change as follows:

```typescript
[ // filtered
  { machine: 'iphone', browser: 'Safari', os: 'ios' },
  { machine: 'pixel', browser: 'Chrome', os: 'android' },
  { machine: 'pixel', browser: 'Safari', os: 'ios' },
]
```

Warning: Order of object iteration is not guaranteed in JavaScript.
Therefore, even if factors and seed are not changed, output combination is not necessarily the same.

## Options
`covertable.make` function has options as `object` at 2nd argument.

All options are omittable.

### length
Number of factors to be covered. (default: 2)

Obviously the more it increases, the more number of combinations increases.

### sorter
Combinations depend on the order of spreading all over the rows.

You can choice a sorter from the following:

- sorters.random: It makes different combinations everytime. (fastest)
- sorters.hash: It makes combinations depending on hash of the pair and seed. (default)

  - It receives `seed`.
    - `seed` option decides the order of storing from unstored pairs.
    - When the combination of factors and seed are the same, covertable reproduces the same collective.

### criterion
You can choice a criterion from the following:

- `criteria.simple`: it extracts any pairs that can be stored into the processing row.
- `criteria.greedy`: it attempts to make most efficient combinations. (default)
  - It receives [tolerance](https://github.com/walkframe/covertable#tolerance) option.

While `criteria.simple` processes quickly, `criteria.greedy` makes fewer combinations.
Although the latter is superior to former in terms of fewer combinations generally, it is time-intensive process.

Not relevant options will be ignored.

### preFilter
This is a function to filter beforehand.

It receives an argument `row` as `object` type.

When the function returns `false`, the row combination will not be registered.
- If factors type is `Array`, you should specify an index at the subscript like `row => row[1] < 6`.
- If factors type is `Object`, you should specify a key at the subscript like `row => row.month < 6` or `row => row['month'] < 6`

### postFilter
This means a function to filter later.

The usage is the same as `preFilter`, only the difference is the timing of the call.
It will delete rows not matched this function at the last.

For this reason, the final test cases may not satisfy the factors coverage.

# Requirement

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

# More info

- [walkframe/covertable - GitHub](https://github.com/walkframe/covertable)
