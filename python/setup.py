#!/usr/bin/env python
# coding: utf-8

from setuptools import setup, find_packages, Extension
from Cython.Distutils import build_ext
from Cython.Build import cythonize

exclude = [
    "__pycache__",
    ".pytest_cache",
    ".tox",
    "htmlcov",
    "venv",
    "demo.py",
    "tests.py",
    "tests.pyx",
]

setup(
    packages=find_packages(exclude=exclude),
    cmdclass={'build_ext': build_ext},
    zip_safe=False,
    ext_modules=[
        Extension("ccovertable", [
            "ccovertable/__init__.pyx",
        ]),
        Extension("ccovertable.main", [
            "ccovertable/main.pyx",
        ]),
        Extension("ccovertable.exceptions", [
            "ccovertable/exceptions.pyx",
        ]),
        Extension("ccovertable.sorters", [
            "ccovertable/sorters/__init__.pyx",
        ]),
        Extension("ccovertable.sorters.greedy", [
            "ccovertable/sorters/greedy.pyx",
        ]),
        Extension("ccovertable.sorters.hash", [
            "ccovertable/sorters/hash.pyx",
        ]),
        Extension("ccovertable.sorters.random", [
            "ccovertable/sorters/random.pyx",
        ]),
        Extension("ccovertable.sorters.sequential", [
            "ccovertable/sorters/sequential.pyx",
        ]),
    ],
    include_dirs=['ccovertable', 'ccovertable/sorters'],
)
