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
var module = require('covertable');
var make = module.default;
var sorters = module.sorters;

var machine = ['iphone', 'pixel'];
var os = ['ios', 'android'];
var browser = ['FireFox', 'Chrome', 'Safari'];

make([machine, os, browser], {sorter: sorters.random});
```

Output:

```javascript
[
  [ 'iphone', 'android', 'Safari' ],
  [ 'iphone', 'ios', 'FireFox' ],
  [ 'iphone', 'android', 'Chrome' ],
  [ 'pixel', 'ios', 'Chrome' ],
  [ 'pixel', 'android', 'FireFox' ],
  [ 'pixel', 'ios', 'Safari' ]
]
```


## Advanced demo in TypeScript:

```typescript
import { default as make, sorters } from "covertable"

const machine = ['iphone', 'pixel']
const os = ['ios', 'android']
const browser = ['FireFox', 'Chrome', 'Safari']

make([machine, os, browser], { // optional
  length: 2, // default: 2
  sorter: sorters.greedy, // default: sorters.sequential
  sortArgs: {seed: 100}, // default: {}
  preFilter: (row: any) => !(row[1] === 'android' && row[0] !== 'pixel'), // default: null
  postFilter: (row: any) => !(row[1] === 'ios' && row[2] !== 'Safari'), // default: null
})
```

Output:

```typescript
[ // filtered
  [ 'iphone', 'ios', 'Safari' ],
  [ 'pixel', 'android', 'Safari' ]
]
```

## Object input and output

You can specify `factors` as object type:

```typescript
import { default as make, sorters } from "covertable"

const machine = ['iphone', 'pixel']
const os = ['ios', 'android']
const browser = ['FireFox', 'Chrome', 'Safari']

make({machine, os, browser}, { // optional
  length: 2, // default: 2
  sorter: sorters.greedy, // default: sorters.sequential
  sortArgs: {seed: 100}, // default: {}
  preFilter: (row: any) => !(row.os === 'android' && row.machine !== 'pixel'), // default: null
  postFilter: (row: any) => !(row.os === 'ios' && row.browser !== 'Safari'), // default: null
})
```

Then the output will change as follows:

```typescript
[ // filtered
  { browser: 'Safari', machine: 'iphone', os: 'ios' },
  { machine: 'pixel', os: 'ios', browser: 'Safari' },
  { machine: 'pixel', os: 'android', browser: 'FireFox' }
]
```

Warning: Order of object iteration is not guaranteed in TypeScript(JavaScript).
So even if factors and seed are not changed, output combination is not necessarily the same.

## Options
`covertable.make` function has options as `object` at 2nd argument.

All options are omittable.

### length
It means length of pair to meet. (default: 2)

The more it increases, the more number of combinations increases.

### sorter
Combinations depend on the order of spreading all over the rows.

You can choice a sorter from the following:

- sorters.sequential: It is simplest and fastest sorter. (default)
- sorters.random: It makes different combinations everytime.
- sorters.hash: It makes combinations depending on hash of the pair (and seed).
- sorters.greedy: It attempts to make most efficient combinations, but slowest. (Warning: these combinations are not always shortest compared to the other sorter's one.)

### sortArgs
`sortArgs` will be passed to sorter function mentioned above.

- `seed`: It is a seed of hash. `sorters.hash` and `sorters.greedy` use this option.
  When `seed` and factors are not changed, output combinations will not be changed.

Not relevant options will be ignored.

### preFilter
This means a function to filter beforehand.

It receives an argument `row` as `object` type.

When the function returns `false`, the row combination will not registered.
- If factors type is `Array`, you should an index at the subscript like `row => row[1] < 6`.
- IF factors type is `Object`, you should a key at the subscript like `row => row.month < 6` or `row => row['month'] < 6`

### postFilter
This means a function to filter later.

Usage is the same as `preFilter`, only the difference is the timing that it is called.
It will delete rows not matched this function at the last.

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

# History

- 1.0.x:

  - First release 🎉
