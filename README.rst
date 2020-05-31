.. image:: https://circleci.com/gh/walkframe/covertable.svg?style=shield
  :target: https://circleci.com/gh/walkframe/covertable

It makes combinations covering pairs for pairwise testing.

Now there are 2 implementations:

:Python:

  - .. image:: https://badge.fury.io/py/covertable.svg
      :target: https://badge.fury.io/py/covertable
  - `README <https://github.com/walkframe/covertable/blob/master/python/README.rst>`__
  - `Code <https://github.com/walkframe/covertable/tree/master/python>`__


:TypeScript:

  - .. image:: https://badge.fury.io/js/covertable.svg
      :target: https://badge.fury.io/js/covertable
  - `README <https://github.com/walkframe/covertable/blob/master/typescript/README.md>`__
  - `Code <https://github.com/walkframe/covertable/tree/master/typescript>`__


Go see the detail from these links.

Performance
===================

.. list-table:: Number and time of combinations in Python
   :widths: 1 3 3 3 
   :header-rows: 1

   * - Combination
     - Default
     - Minimum
     - Fastest
   * - 3^4
     - 9
     - 9 time: `0.0006s`
     - 14 cond: `sorter: sequential, criterion: simple` time: `0.0004s`
   * - 3^13
     - 19
     - 17 cond: `seed: 1084` time: `0.03s`
     - 22 cond: `sorter: sequential, criterion: simple` time: `0.002s`
   * - 4^15 + 3^17 + 2^29
     - 36
     - 34 cond: `seed: 19` time: `7.47s`
     - 42 cond: `sorter: sequential, criterion: simple` time: 
   * - 4^1 + 3^39 + 2^35
     - 27
     - 26 cond: `seed: 14`  time: `14.70s`
     - 30 cond: `sorter: sequential, criterion: simple` time: `0.56s`
   * - 2^100
     - 14
     - 12 cond: `seed: 6, criterion: simple` time: 
     - 13 cond: `sorter: sequential, criterion: simple`
   * - 10^20
     - 198
     - 195 cond: `seed: 1139`  time: `14.48s`
     - 284 cond: `sorter: sequential, criterion: simple`  time: `0.14s`


History
=======
:2.0.x:

  - sorter option splitted into sorter and criterion.

    - e.g. greedy -> hash sorter + greedy criterion.

  - greedy method is about seven times faster than before.
  - greedy method got an option `tolerance` to balance speed and results.


:1.1.x:

  - Greedy sorter improved in both implementations.
  
    - It got increased in speed.

:1.0.x:

  - First release 🎉

.. note::

  It moved from `twopairs`.