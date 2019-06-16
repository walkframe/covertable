#!/usr/bin/env python
# coding: utf-8

from setuptools import setup, find_packages

exclude = [
    "__pycache__",
    ".pytest_cache",
    ".tox",
    "htmlcov",
    "venv",
    "demo.py",
    "tests.py",
]

setup(packages=find_packages(exclude=exclude))
