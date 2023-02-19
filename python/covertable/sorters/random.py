"""Random sorter
"""

import random


def random_comparer(_):
    return random.random()


def sort(incomplete, *args, **kwargs):
    return sorted(incomplete, key=random_comparer)
