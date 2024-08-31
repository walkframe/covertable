[![npm version](https://badge.fury.io/js/covertable.svg)](https://badge.fury.io/js/covertable)
[![Workflow](https://github.com/walkframe/covertable/actions/workflows/typescript.yaml/badge.svg)](https://github.com/walkframe/covertable/actions/workflows/typescript.yaml)
[![codecov](https://codecov.io/gh/walkframe/covertable/branch/master/graph/badge.svg)](https://codecov.io/gh/walkframe/covertable)
[![github](https://img.shields.io/github/stars/walkframe/covertable)](https://github.com/walkframe/covertable)

# What is covertable?
covertable is a powerful tool for generating pairwise combinations of input factors, designed for both Node.js and browser environments. It's easy to use, flexible, and supports advanced filtering options, making it perfect for testing scenarios and generating comprehensive datasets.

# Simple usage

```javascript
import { make } from "covertable";
const machine = ["iPhone", "Pixel", "XPERIA", "ZenFone", "Galaxy"];
const os = ["iOS", "Android"];
const browser = ["FireFox", "Chrome", "Safari"];
make([machine, os, browser]);
```

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

# Advanced usage
Advanced usage is [here](https://docs.walkframe.com/covertable/advanced)