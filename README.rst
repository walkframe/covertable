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