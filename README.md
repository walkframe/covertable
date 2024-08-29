# CoverTable

![covertable logo](./covertable.png)

Time is limited.

Creating a test case that satisfies all possible factors is often unrealistic and, more importantly, tedious.

Save time with CoverTable, a flexible pairwise tool that generates combinations covering two (or more) factors.

## Implementations

CoverTable is available in two implementations, with TypeScript as the primary focus and Python offered as a secondary option.

### TypeScript

[![NPM Version](https://badge.fury.io/js/covertable.svg)](https://badge.fury.io/js/covertable) [![Build Status](https://github.com/walkframe/covertable/actions/workflows/typescript.yaml/badge.svg)](https://github.com/walkframe/covertable/actions/workflows/typescript.yaml)

- [README](https://github.com/walkframe/covertable/blob/master/typescript)
- [History](https://github.com/walkframe/covertable/blob/master/typescript/history.md)

### Python (Legacy Support)

[![PyPI Version](https://badge.fury.io/py/covertable.svg)](https://badge.fury.io/py/covertable) [![Build Status](https://github.com/walkframe/covertable/actions/workflows/python.yaml/badge.svg)](https://github.com/walkframe/covertable/actions/workflows/python.yaml)

- [README](https://github.com/walkframe/covertable/blob/master/python/README.rst)
- [History](https://github.com/walkframe/covertable/blob/master/python/history.md)


For more details, please refer to the links above.

## Performance

> **Note:**  
> The following data was measured in Python 3.7.7 on a `3.1 GHz 6-Core Intel Core i5`.  
> The coverage number is `2`.

| Combination       | Default                             | Minimum case                          | Fastest case                       |
|-------------------|-------------------------------------|---------------------------------------|------------------------------------|
| **3^4**           | num: `9` <br> time: `0.0006s`       | num: `9` <br> time: `0.0006s`         | num: `14` <br> time: `0.0005s`     |
| **3^13**          | num: `19` <br> time: `0.03s`        | num: `17` <br> time: `0.03s`          | num: `21` <br> time: `0.003s`      |
| **4^15 + 3^17 + 2^29** | num: `36` <br> time: `7.41s`   | num: `34` <br> time: `7.47s`          | num: `42` <br> time: `0.40s`       |
| **4^1 + 3^39 + 2^35**  | num: `27` <br> time: `15.19s`  | num: `26` <br> time: `14.70s`         | num: `30` <br> time: `0.51s`       |
| **2^100**         | num: `14` <br> time: `23.97s`       | num: `12` <br> time: `0.63s`          | num: `13` <br> time: `0.48s`       |
| **10^20**         | num: `198` <br> time: `14.28s`      | num: `195` <br> time: `14.48s`        | num: `284` <br> time: `0.53s`      |

In general, as the number of elements or coverage increases, the number of combinations tends to increase significantly.

## Tolerance

If you use the `greedy` criterion and specify a positive integer for the `tolerance` option, you can increase speed at the expense of the number of combinations.

The greater the `tolerance`, the faster the speed and the larger the number of combinations.

### Example: 10^20 Test Cases

| Tolerance | num  | time   |
|-----------|------|--------|
| 0 (default) | `195` | `14.48s` |
| 1         | `199` | `12.45s` |
| 2         | `201` | `9.48s`  |
| 3         | `201` | `7.17s`  |
| 4         | `207` | `5.70s`  |
| 5         | `212` | `4.58s`  |
| 6         | `212` | `3.65s`  |
| 7         | `216` | `3.07s`  |
| 8         | `223` | `2.57s`  |
| 9         | `226` | `2.14s`  |
| 10        | `233` | `1.84s`  |
| 11        | `237` | `1.61s`  |
| 12        | `243` | `1.43s`  |
| 13        | `249` | `1.28s`  |
| 14        | `254` | `1.19s`  |


