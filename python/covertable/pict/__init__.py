"""PICT-compatible model parser and runner.

This package mirrors the TypeScript ``covertable/pict`` entry point. It can
parse a PICT-format model (parameters, sub-models, constraints, invalid
values, weights, aliases) and generate rows that satisfy it.
"""
from .model import PictModel
from .weights import weights_by_value

__all__ = ["PictModel", "weights_by_value"]
