.. image:: https://badge.fury.io/py/covertable.svg
  :target: https://badge.fury.io/py/covertable

.. image:: https://github.com/walkframe/covertable/actions/workflows/python.yaml/badge.svg
  :target: https://github.com/walkframe/covertable/actions/workflows/python.yaml

.. image:: https://codecov.io/gh/walkframe/covertable/branch/master/graph/badge.svg
  :target: https://codecov.io/gh/walkframe/covertable

.. image:: https://img.shields.io/badge/License-Apache%202.0-blue.svg
  :target: https://opensource.org/licenses/Apache-2.0

Requirements
============
- Python: 3.9 or later.

Installation
============

.. code:: bash

  $ pip install covertable

Usage
=====
Import ``covertable`` and call the ``make`` function.

.. code-block:: python3

  >>> from covertable import make, sorters, criteria

  >>> machine_list = ['iphone', 'pixel']
  >>> os_list = ['ios', 'android']
  >>> browser_list = ['FireFox', 'Chrome', 'Safari']

  >>> # list input and output
  >>> make(
  ...     [machine_list, os_list, browser_list],
  ...     strength=2,  # default: 2
  ...     sorter=sorters.random,  # default: sorters.hash
  ...     criterion=criteria.simple,  # default: criteria.greedy
  ...     salt='my_seed',  # default: ''
  ...     constraints=[
  ...         {'operator': 'custom', 'fields': [0, 1], 'evaluate':
  ...             lambda row: not(row[1] == 'android' and row[0] != 'pixel') and not(row[1] == 'ios' and row[0] != 'iphone')},
  ...     ],
  ... )
  [['iphone', 'ios', 'FireFox'], ['pixel', 'android', 'Chrome'], ...]

  >>> # dict input and output
  >>> make(
  ...     {'machine': machine_list, 'os': os_list, 'browser': browser_list},
  ...     strength=2,
  ...     tolerance=3,
  ...     constraints=[
  ...         {'operator': 'or', 'conditions': [
  ...             {'operator': 'eq', 'left': 'os', 'value': 'android'},
  ...             {'operator': 'ne', 'left': 'machine', 'value': 'pixel'},
  ...         ]},
  ...     ],
  ... )
  [{'machine': 'pixel', 'browser': 'Chrome', 'os': 'android'}, ...]


Declarative Constraints
=======================

The ``constraints`` parameter accepts a list of condition dicts evaluated under
three-valued logic with forward checking and constraint propagation.

.. code-block:: python3

  >>> from covertable import make

  >>> rows = make(
  ...     {
  ...         'OS': ['Win', 'Mac', 'Linux'],
  ...         'Browser': ['Chrome', 'Firefox', 'Safari'],
  ...     },
  ...     constraints=[
  ...         # Safari only on Mac
  ...         {'operator': 'or', 'conditions': [
  ...             {'operator': 'ne', 'left': 'Browser', 'value': 'Safari'},
  ...             {'operator': 'eq', 'left': 'OS', 'value': 'Mac'},
  ...         ]},
  ...     ],
  ... )

Supported condition operators:

- **Comparison**: ``eq``, ``ne``, ``gt``, ``lt``, ``gte``, ``lte``, ``in``
- **Logical**: ``and``, ``or``, ``not``
- **Custom**: ``fn`` (escape hatch with ``requires`` and ``evaluate`` callable)

Field-to-field comparison uses ``right``:

.. code-block:: python3

  {'operator': 'ne', 'left': 'A', 'right': 'B'}

Arithmetic expressions can be used as operands:

.. code-block:: python3

  # A + B > 10
  {'operator': 'gt', 'left': {'operator': 'add', 'left': 'A', 'right': 'B'}, 'value': 10}

Supported arithmetic operators: ``add``, ``sub``, ``mul``, ``div``, ``mod``

Stats
-----

When using ``constraints``, the ``Controller`` exposes a ``stats`` property:

.. code-block:: python3

  >>> from covertable.main import Controller

  >>> ctrl = Controller(
  ...     {'A': [1, 2, 3], 'B': ['x', 'y', 'z']},
  ...     constraints=[{'operator': 'ne', 'left': 'A', 'value': 1}],
  ... )
  >>> rows = list(ctrl.make_async())
  >>> ctrl.stats
  {'total_pairs': 9, 'pruned_pairs': 3, 'covered_pairs': 6, ...}


PICT Model
==========

Parse PICT-format model files directly:

.. code-block:: python3

  >>> from covertable.pict import PictModel

  >>> model = PictModel("""
  ... OS: Win, Mac, Linux
  ... Browser: Chrome, Firefox, ~Safari
  ... IF [Browser] = "Safari" THEN [OS] = "Mac";
  ... """)
  >>> rows = model.make()
  >>> model.stats


Options
=======

All options are keyword arguments to ``covertable.make``.

strength
--------
Number of factors to be covered. (default: 2)

The higher the value, the more combinations are generated.

sorter
------
Controls the order of pair processing.

:sorters.hash:
  Deterministic ordering using FNV-1a hash. (default)

  Accepts a ``salt`` option for reproducible results.

:sorters.random:
  Random ordering. Different results each time.

criterion
---------

:criteria.greedy:
  Attempts to make efficient combinations. (default)

  Accepts a ``tolerance`` option.

:criteria.simple:
  Extracts any pairs that can be stored into the processing row.

constraints
-----------
A list of declarative condition dicts. See `Declarative Constraints`_ above.

comparer
--------
A dict of custom comparison functions to override default operators.

.. code-block:: python3

  make(factors, comparer={'eq': lambda a, b: str(a) == str(b)})


Development
===========

.. code-block:: sh

  # preparation
  $ python3 -m venv venv
  $ source venv/bin/activate
  (venv) $ pip install -r dev_requirements.txt

  # testing
  (venv) $ pytest


More info
=========

- `walkframe/covertable - GitHub <https://github.com/walkframe/covertable>`__
- `Documentation <https://covertable.walkframe.com>`__
