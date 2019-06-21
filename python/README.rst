.. image:: https://badge.fury.io/py/covertable.svg
  :target: https://badge.fury.io/py/covertable

.. image:: https://circleci.com/gh/walkframe/covertable.svg?style=shield
  :target: https://circleci.com/gh/walkframe/covertable

.. image:: https://codecov.io/gh/walkframe/covertable/branch/master/graph/badge.svg
  :target: https://codecov.io/gh/walkframe/covertable

.. image:: https://img.shields.io/badge/code%20style-black-000000.svg
  :target: https://github.com/python/black

.. image:: https://img.shields.io/badge/License-Apache%202.0-blue.svg
  :target: https://opensource.org/licenses/Apache-2.0

Requirements
============
- Python: 3.3 or later.

  - Tested with 3.7


Installation
============

.. code:: bash

  $ pip install covertable

Usage
=====
Just import ``covertable`` and call ``make`` function.

.. code-block:: python3

  >>> from covertable import make, sorters
  
  >>> machine_list = ['iphone', 'pixel']
  >>> os_list = ['ios', 'android']
  >>> browser_list = ['FireFox', 'Chrome', 'Safari']
  
  >>> # list input and output
  ... make(
  ...     [machine_list, os_list, browser_list],  # list factors
  ...     length=2,  # default: 2
  ...     sorter=sorters.greedy,  # default: sorters.sequential
  ...     sort_kwargs={'seed': 100},  # default: {}
  ...     pre_filter=lambda row: not(row[1] == 'android' and row[0] != 'pixel'),  # default: None
  ...     post_filter=lambda row: not(row[1] == 'ios' and row[2] != 'Safari'),  # default: None
  ... )
  [
    ['iphone', 'ios', 'Safari'],
    ['pixel', 'android', 'Safari']
  ]

  >>> # dict input and output
  ... make(
  ...     {'machine': machine_list, 'os': os_list, 'browser': browser_list},  # dict factors
  ...     length=2,  # default: 2
  ...     sorter=sorters.greedy,  # default: sorters.sequential
  ...     sort_kwargs={'seed': 100},  # default: {}
  ...     pre_filter=lambda row: not(row['os'] == 'android' and row['machine'] != 'pixel'),  # default: None
  ...     post_filter=lambda row: not(row['os'] == 'ios' and row['browser'] != 'Safari'),  # default: None
  ... )
  [
    {'os': 'ios', 'browser': 'Safari', 'machine': 'iphone'},
    {'machine': 'pixel', 'browser': 'Safari', 'os': 'android'}
  ]

Options
---------------

``covertable.make`` function has options as keyword argument.

All options are omittable.

length
~~~~~~~~~~~~~~~~
It means length of pair to meet. (default: 2)

The more it increases, the more number of combinations increases.

sorter
~~~~~~~~~~~~~~~~
Combinations depend on the order of spreading all over the rows.

You can choice a sorter from the following:

:sorters.sequential: It is simplest and fastest sorter. (default)
:sorters.random: It makes different combinations everytime.
:sorters.hash: It makes combinations depending on hash of the pair (and seed).
:sorters.greedy: It attempts to make most efficient combinations, but slowest. 
  (Warning: these combinations are not always shortest compared to the other sorter's one.)


sort_kwargs
~~~~~~~~~~~~~~~~
`sort_kwargs` will be passed to sorter function mentioned above.

:`seed`: 

  It is a seed of hash. `sorters.hash` and `sorters.greedy` use this option.
  
  When `seed` and factors are not changed, output combinations will not be changed.

Not relevant options will be ignored.


pre_filter
~~~~~~~~~~~~~~~~
This means a function to filter beforehand.

It receives an argument `row` as `object` type.

When the function returns `false`, the row combination will not registered.

- If factors type is `Array`, you should an index at the subscript like `row => row[1] < 6`.
- IF factors type is `Object`, you should a key at the subscript like `row => row.month < 6` or `row => row['month'] < 6`

post_filter
~~~~~~~~~~~~~~~~

This means a function to filter later.

Usage is the same as `preFilter`, only the difference is the timing that it is called.
It will delete rows not matched this function at the last.

Development
===============

.. code-block:: sh

  # preparation
  $ python3 -m venv venv
  $ source venv/bin/activate
  (venv) $ pip install -r dev_requirements.txt

  # testing
  (venv) $ tox # -e py37 -e cov -e black


Publish
----------------

.. code-block:: sh

  (venv) $ python setup.py sdist bdist_wheel
  (venv) $ twine upload --repository pypi dist/*


History
=======

:1.0.x:

  - First release 🎉