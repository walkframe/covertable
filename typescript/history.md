# History

## 2.4.x
- Fixed an issue where preFilter was evaluating and excluding incomplete elements. This is a minor upgrade due to the large scope of the impact.
- Type names are now unified with the Type suffix.

## 2.3.x
- PictConstraintsLexer was added. ([#37](https://github.com/walkframe/covertable/pull/37))
  - It is a lexer designed to parse PICT constraints.
  - It parses constraints written in the PICT format, enabling the evaluation of complex conditions.
  - The parsed constraints are then used in the make function to dynamically filter the generated combinations based on the specified rules.

## 2.2.x
- Speed is increased by expressing combinations of elements as a product of prime numbers.
- Added `SuggestRowType` to infer the row type.

## 2.1.x
- Speed up processing speed by pre-sorting target pairs.
- Added `makeAsync` function to generate combinations sequentially.


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
