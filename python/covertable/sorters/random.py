"""Random sorter
"""

import random


def sort(pairs, **kwargs):
    return sorted(pairs, key=lambda _: random.random())
