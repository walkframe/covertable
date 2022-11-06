.. image:: ./covertable.png
   :alt: covertable logo


.. image:: https://circleci.com/gh/walkframe/covertable.svg?style=shield
  :target: https://circleci.com/gh/walkframe/covertable

Time is limited.

It is not realistic to create a test case that satisfies all the multiple factors,
and above all, it is tedious.

Save time with covertable. It is a flexible pairwise tool to create a two (or more) factor covered combination.


Now it has 2 implementations.

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

.. note::
  
  - The following data was measured in Python 3.7.7 and ``3.1 GHz 6 Cores Intel Core i5``.
  - coverage number is `2`.

.. list-table:: Number and time of combinations. 
   :widths: 1 3 3 3 
   :header-rows: 1
   :stub-columns: 1

   * - Combination
     - Default
     - Minimum case
     - Fastest case
   * - 3^4
     - - num: ``9``
       - cond: *default*
       - time: ``0.0006s``
     - - num: ``9``
       - cond: *default*
       - time: ``0.0006s``
     - - num: ``14``
       - cond: ``sorter: random, criterion: simple``
       - time: ``0.0005s``
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

In general, as the number of elements or coverage increases,
the number of combinations have a tendency to increase significantly.

Tolerance
----------------

If you use `greedy` criterion and specify a positive integer to `tolerance` option,
it can increase the speed at the expense of the number of combinations.

The greater the `tolerance`, the shorter the speed and bigger the number of combinations.

.. list-table:: Table for the case when combinations are created from ``10^20`` test cases.
   :widths: 1 3 3  
   :header-rows: 1
   :stub-columns: 1

   * - tolerance
     - num
     - time
   * - 0 (default)
     - ``195``
     - ``14.48s``
   * - 1
     - ``199``
     - ``12.45s``
   * - 2
     - ``201``
     - ``9.48s``
   * - 3
     - ``201``
     - ``7.17s``
   * - 4
     - ``207``
     - ``5.70s``
   * - 5
     - ``212``
     - ``4.58s``
   * - 6
     - ``212``
     - ``3.65s``
   * - 7
     - ``216``
     - ``3.07s``
   * - 8
     - ``223``
     - ``2.57s``
   * - 9
     - ``226``
     - ``2.14s``
   * - 10
     - ``233``
     - ``1.84s``
   * - 11
     - ``237``
     - ``1.61s``
   * - 12
     - ``243``
     - ``1.43s``
   * - 13
     - ``249``
     - ``1.28s``
   * - 14
     - ``254``
     - ``1.19s``


History
=======
:2.0.x:

  - sorter option was splitted into sorter and criterion.

    - e.g. greedy -> hash sorter + greedy criterion.

  - `greedy` method is much faster than before.
  - `greedy` method got an option `tolerance` to balance speed and results.

  - sequenctial sorter was dropped.
    
    - Because The number of combinations would be huge in TypeScript.

:1.1.x:

  - Greedy sorter improved in both implementations.
  
    - It got increased in speed.

:1.0.x:

  - First release 🎉

.. note::

  It moved from `twopairs`.
