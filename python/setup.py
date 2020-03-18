#!/usr/bin/env python
# coding: utf-8

from setuptools import setup, find_packages, Extension
from Cython.Distutils import build_ext

exclude = [
    "__pycache__",
    ".pytest_cache",
    ".tox",
    "htmlcov",
    "venv",
    "demo.py",
    "tests.py",
]

setup(
    packages=find_packages(exclude=exclude),
    cmdclass = {'build_ext': build_ext},
    ext_modules = [Extension("ccovertable", [
        "ccovertable/__init__.pyx",
        "ccovertable/main.pyx",
        "ccovertable/exceptions.pyx",
        "ccovertable/sorters/__init__.pyx",
        "ccovertable/sorters/greedy.pyx",
        "ccovertable/sorters/hash.pyx",
        "ccovertable/sorters/random.pyx",
        "ccovertable/sorters/sequential.pyx",
    ])]
)
