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
   :stub-columns: 1

   * - Combination
     - Default
     - Minimum case
     - Fastest case
   * - 3^4
     - 
       - num: ``9``
       - cond: *default*
       - time: ``0.0006s``
     - - num: ``9``
       - cond: *default*
       - time: ``0.0006s``
     - - num: ``14``
       - cond: ``sorter: random, criterion: simple``
       - time: ``0.0006s``
   * - 3^13
     - - num: ``19``
       - cond: *default*
       - time: ``0.03s``
     - - num: ``17``
       - cond: ``seed: 1084``
       - time: ``0.03s``
     - - num: ``21``
       - cond: ``sorter: random, criterion: simple``
       - time: ``0.003s``
   * - 4^15 + 3^17 + 2^29
     - - num: ``36``
       - cond: *default*
       - time: ``7.41s``
     - - num: ``34``
       - cond: ``seed: 19``
       - time: ``7.47s``
     - - num: ``42``
       - cond: ``sorter: random, criterion: simple``
       - time: ``0.40s``
   * - 4^1 + 3^39 + 2^35
     - - num: ``27``
       - cond: *default* 
       - time: ``15.19s``
     - - num: ``26``
       - cond: ``seed: 14``
       - time: ``14.70s``
     - - num: ``30``
       - cond: ``sorter: random, criterion: simple``
       - time: ``0.51s``
   * - 2^100
     - - num: ``14``
       - cond: *default*
       - time: ``23.97s``
     - - num: ``12``
       - cond: ``seed: 6, criterion: simple``
       - time: ``0.63s``
     - - num: ``13``
       - cond: ``sorter: random, criterion: simple``
       - time: ``0.48s``
   * - 10^20
     - - num: ``198``
       - cond: *default*
       - time: ``14.28s``
     - - num: ``195``
       - cond: ``seed: 1139``
       - time: ``14.48s``
     - - num: ``284``
       - cond: ``sorter: random, criterion: simple``
       - time: ``0.53s``


History
=======
:2.0.x:

  - sorter option splitted into sorter and criterion.

    - e.g. greedy -> hash sorter + greedy criterion.

  - greedy method is about seven times faster than before.
  - greedy method got an option `tolerance` to balance speed and results.

  - sequenctial sorter has already dropped.
  
    - It does not work well in TypeScript. 
    
      - The number of combinations would be huge.

:1.1.x:

  - Greedy sorter improved in both implementations.
  
    - It got increased in speed.

:1.0.x:

  - First release 🎉

.. note::

  It moved from `twopairs`.