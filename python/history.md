# History

## 2.1.x
- Add `make_async` function to generate combinations sequentially.

## 2.0.x

- The `sorter` option was split into `sorter` and `criterion`.
  - e.g., greedy -> hash sorter + greedy criterion.
- The `greedy` method is much faster than before.
- The `greedy` method now includes a `tolerance` option to balance speed and results.
- The sequential sorter was dropped.
  - Due to the potential for huge numbers of combinations in TypeScript.

## 1.1.x

- The greedy sorter was improved in both implementations.
  - Speed has been increased.

## 1.0.x

- First release 🎉
