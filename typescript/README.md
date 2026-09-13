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

# PICT models & formula columns

covertable reads Microsoft **PICT** model files directly. A parameter line whose
value starts with `=` is a **formula (computed) column**: it is emitted on every
generated row, with each `[Field]` reference rewritten to that row's spreadsheet
cell — handy for feeding each test case into a spreadsheet (e.g. GridSheet's
`=CLAUDE(...)` / `=CODEX(...)` AI functions).

```
Size:     10, 100, 1000
Cluster:  512, 4096
Expected: =CLAUDE("is the total size >= 10KB?", [Size], [Cluster])
```

# Command line

```bash
npx covertable pict model.pict -o out.pict.tsv          # TSV (default); .csv → CSV
npx covertable pict model.pict --strength 3 --optimize  # 3-wise, then SA-shrink
covertable pict --help                                  # all options
```

The CLI fills formula columns per row and drops a trailing `;`, so the output is
ready to open in a spreadsheet.

# Advanced usage
Advanced usage is [here](https://covertable.walkframe.com)